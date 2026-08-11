import {
  clampRange,
  normalisePostcode,
  parseAirplanesAircraft,
} from '../lib/aircraft.js';
import {
  DEFAULT_GEOCODER_BASE_URL,
  geocoderSearchUrl,
  normaliseLocationQuery,
  parseNominatimLocation,
} from '../lib/location.js';
import {
  aircraftTileCacheKey,
  aircraftTileForLocation,
  staleAgeSeconds,
} from '../lib/aircraft-tile.js';

const AIRPLANES_URL = 'https://api.airplanes.live/v2/point';
const POSTCODE_URL = 'https://api.postcodes.io/postcodes';
const FRESH_CACHE_TTL_SECONDS = 55;
const STALE_CACHE_TTL_SECONDS = 1_800;
const GEOCODER_CACHE_TTL_SECONDS = 86_400;
const PUBLIC_GEOCODER_INTERVAL_MS = 1_000;
const APP_IDENTITY = 'OverMyHome/0.3 (+https://over-my-home.pages.dev/)';
const AUDIBILITY_PRIORITY = Object.freeze({
  likely: 0,
  possible: 1,
  unlikely: 2,
});
let nextPublicGeocoderRequestAt = 0;

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const locationQuery = normaliseLocationQuery(
    url.searchParams.get('location') || url.searchParams.get('postcode'),
  );
  const rangeKm = clampRange(url.searchParams.get('range'));

  if (!locationQuery) {
    return json({ error: 'Enter a postcode, ZIP code, town or place.' }, 400);
  }

  try {
    const location = await lookupLocation(locationQuery, context);
    const tile = aircraftTileForLocation(location);
    const cache = globalThis.caches?.default || null;
    const tileData = await loadTileData({ context, cache, tile });
    const aircraft = (tileData.payload.ac || [])
      .map((record) => parseAirplanesAircraft(record, location, rangeKm))
      .filter(Boolean)
      .sort(compareAircraftBySoundThenDistance);

    const body = {
      generatedAt: tileData.fetchedAt,
      location: {
        label: location.label || location.postcode,
        postcode: location.postcode,
        area: location.area,
        countryCode: location.countryCode || null,
      },
      rangeKm,
      aircraft,
      source: {
        provider: 'Airplanes.live',
        geocoder: location.source,
        nonCommercial: true,
        refreshSeconds: FRESH_CACHE_TTL_SECONDS,
        tileId: tile.id,
        stale: tileData.stale,
        staleAgeSeconds: tileData.stale
          ? staleAgeSeconds(tileData.fetchedAt)
          : 0,
      },
    };

    return json(body, 200, { 'X-Over-My-Home-Cache': tileData.cacheStatus });
  } catch (error) {
    const status = Number(error.status) || 502;
    return json(
      {
        error: error.publicMessage || 'The live aircraft service is temporarily unavailable.',
      },
      status,
      error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : undefined,
    );
  }
}

export function compareAircraftBySoundThenDistance(first = {}, second = {}) {
  const priorityDifference = audibilityPriority(first.audibility) - audibilityPriority(second.audibility);
  if (priorityDifference) return priorityDifference;

  const firstDistance = finiteDistance(first.slantDistanceKm);
  const secondDistance = finiteDistance(second.slantDistanceKm);
  return firstDistance - secondDistance;
}

export async function loadTileData({ context, cache, tile }) {
  const freshKey = aircraftTileCacheKey(context.request.url, tile, 'fresh-v2');
  const staleKey = aircraftTileCacheKey(context.request.url, tile, 'stale');
  const freshRecord = await readCacheRecord(cache, freshKey);

  if (freshRecord) {
    return {
      ...freshRecord,
      stale: false,
      cacheStatus: 'HIT',
    };
  }

  try {
    const payload = await loadAirplanes(tile);
    const record = {
      fetchedAt: new Date().toISOString(),
      payload,
    };

    if (cache) {
      const cacheWrite = Promise.all([
        writeCacheRecord(cache, freshKey, record, FRESH_CACHE_TTL_SECONDS),
        writeCacheRecord(cache, staleKey, record, STALE_CACHE_TTL_SECONDS),
      ]);
      if (typeof context.waitUntil === 'function') context.waitUntil(cacheWrite);
      else await cacheWrite;
    }

    return {
      ...record,
      stale: false,
      cacheStatus: 'MISS',
    };
  } catch (error) {
    const staleRecord = await readCacheRecord(cache, staleKey);
    if (!staleRecord) throw error;

    return {
      ...staleRecord,
      stale: true,
      cacheStatus: 'STALE',
    };
  }
}

async function lookupLocation(query, context) {
  const ukPostcode = normalisePostcode(query);
  if (ukPostcode) return lookupPostcode(ukPostcode);
  return lookupWorldwideLocation(query, context);
}

async function lookupPostcode(postcode) {
  const response = await fetch(`${POSTCODE_URL}/${encodeURIComponent(postcode)}`, {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) {
    throw publicError(404, 'That postcode was not found.');
  }
  if (!response.ok) {
    throw publicError(502, 'The postcode service is temporarily unavailable.');
  }

  const data = await response.json();
  const result = data.result;
  if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
    throw publicError(404, 'That postcode has no usable location.');
  }

  return {
    label: result.postcode,
    postcode: result.postcode,
    latitude: result.latitude,
    longitude: result.longitude,
    area: result.admin_district || result.region || result.country || 'United Kingdom',
    countryCode: 'GB',
    source: 'Postcodes.io',
  };
}

async function lookupWorldwideLocation(query, context) {
  const baseUrl = context.env?.GEOCODER_BASE_URL || DEFAULT_GEOCODER_BASE_URL;
  const endpoint = geocoderSearchUrl(query, baseUrl);
  const cache = globalThis.caches?.default || null;
  const cacheKey = geocoderCacheKey(context.request.url, query, baseUrl);

  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const location = await cached.json().catch(() => null);
      if (hasUsableCoordinates(location)) return location;
    }
  }

  if (new URL(baseUrl).origin === new URL(DEFAULT_GEOCODER_BASE_URL).origin) {
    await respectPublicGeocoderRateLimit();
  }

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': context.request.headers.get('Accept-Language') || 'en',
      Referer: 'https://over-my-home.pages.dev/',
      'User-Agent': APP_IDENTITY,
    },
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After')) || 60;
    const error = publicError(429, 'The location service is busy. Try again shortly.');
    error.retryAfter = retryAfter;
    throw error;
  }
  if (!response.ok) {
    throw publicError(502, 'The location service is temporarily unavailable.');
  }

  const results = await response.json().catch(() => null);
  const location = parseNominatimLocation(Array.isArray(results) ? results[0] : null, query);
  if (!location) {
    throw publicError(404, 'That location was not found. Add a country if the name is ambiguous.');
  }

  if (cache) {
    const cacheWrite = cache.put(
      cacheKey,
      new Response(JSON.stringify(location), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${GEOCODER_CACHE_TTL_SECONDS}`,
        },
      }),
    );
    if (typeof context.waitUntil === 'function') context.waitUntil(cacheWrite);
    else await cacheWrite;
  }

  return location;
}

function geocoderCacheKey(requestUrl, query, baseUrl) {
  const url = new URL('/__location-cache', requestUrl);
  url.searchParams.set('q', query.toLocaleLowerCase());
  url.searchParams.set('provider', new URL(baseUrl).origin);
  return new Request(url.toString(), { method: 'GET' });
}

async function respectPublicGeocoderRateLimit() {
  const now = Date.now();
  const waitMs = Math.max(0, nextPublicGeocoderRequestAt - now);
  nextPublicGeocoderRequestAt = Math.max(now, nextPublicGeocoderRequestAt) + PUBLIC_GEOCODER_INTERVAL_MS;
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function hasUsableCoordinates(location) {
  return Boolean(
    location &&
    Number.isFinite(Number(location.latitude)) &&
    Number.isFinite(Number(location.longitude)),
  );
}

async function loadAirplanes(tile) {
  const endpoint = [
    AIRPLANES_URL,
    tile.centreLatitude.toFixed(5),
    tile.centreLongitude.toFixed(5),
    tile.radiusNm,
  ].join('/');

  const response = await fetch(endpoint, {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After')) || 60;
    const error = publicError(429, 'Airplanes.live has reached its request limit. Try again shortly.');
    error.retryAfter = retryAfter;
    throw error;
  }
  if (!response.ok) {
    throw publicError(502, 'Airplanes.live did not return live aircraft data.');
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.ac)) {
    throw publicError(502, 'Airplanes.live returned an unexpected response.');
  }
  if (payload.msg && payload.msg !== 'No error') {
    throw publicError(502, 'Airplanes.live could not complete the live aircraft request.');
  }
  return payload;
}

async function readCacheRecord(cache, key) {
  if (!cache) return null;
  const response = await cache.match(key);
  if (!response) return null;

  const record = await response.json().catch(() => null);
  if (!record?.fetchedAt || !Array.isArray(record?.payload?.ac)) return null;
  return record;
}

async function writeCacheRecord(cache, key, record, maxAgeSeconds) {
  const response = new Response(JSON.stringify(record), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAgeSeconds}`,
    },
  });
  await cache.put(key, response);
}

function audibilityPriority(value) {
  return AUDIBILITY_PRIORITY[String(value || '').toLowerCase()] ?? AUDIBILITY_PRIORITY.unlikely;
}

function finiteDistance(value) {
  const distance = Number(value);
  return Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY;
}

function publicError(status, publicMessage) {
  return Object.assign(new Error(publicMessage), { status, publicMessage });
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}