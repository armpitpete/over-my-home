import {
  clampRange,
  normalisePostcode,
  parseAirplanesAircraft,
  radiusKmToNauticalMiles,
} from '../lib/aircraft.js';

const AIRPLANES_URL = 'https://api.airplanes.live/v2/point';
const POSTCODE_URL = 'https://api.postcodes.io/postcodes';
const CACHE_TTL_SECONDS = 180;
const AUDIBILITY_PRIORITY = Object.freeze({
  likely: 0,
  possible: 1,
  unlikely: 2,
});

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const postcode = normalisePostcode(url.searchParams.get('postcode'));
  const rangeKm = clampRange(url.searchParams.get('range'));

  if (!postcode) {
    return json({ error: 'Enter a valid UK postcode.' }, 400);
  }

  try {
    const location = await lookupPostcode(postcode);
    const cacheKey = createCacheKey(context.request.url, location, rangeKm);
    const cache = typeof caches === 'undefined' ? null : caches.default;
    const cached = cache ? await cache.match(cacheKey) : null;

    if (cached) {
      const cachedBody = await cached.json();
      return json(cachedBody, 200, { 'X-Over-My-Home-Cache': 'HIT' });
    }

    const payload = await loadAirplanes(location, rangeKm);
    const aircraft = (payload.ac || [])
      .map((record) => parseAirplanesAircraft(record, location, rangeKm))
      .filter(Boolean)
      .sort(compareAircraftBySoundThenDistance);

    const body = {
      generatedAt: new Date().toISOString(),
      location: {
        postcode: location.postcode,
        area: location.area,
      },
      rangeKm,
      aircraft,
      source: {
        provider: 'Airplanes.live',
        nonCommercial: true,
        refreshSeconds: CACHE_TTL_SECONDS,
      },
    };

    if (cache) {
      const cacheResponse = new Response(JSON.stringify(body), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        },
      });
      const cacheWrite = cache.put(cacheKey, cacheResponse);
      if (typeof context.waitUntil === 'function') context.waitUntil(cacheWrite);
      else await cacheWrite;
    }

    return json(body, 200, { 'X-Over-My-Home-Cache': 'MISS' });
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
    postcode: result.postcode,
    latitude: result.latitude,
    longitude: result.longitude,
    area: result.admin_district || result.region || result.country || 'United Kingdom',
  };
}

async function loadAirplanes(location, rangeKm) {
  const radiusNm = radiusKmToNauticalMiles(rangeKm);
  const endpoint = [
    AIRPLANES_URL,
    location.latitude.toFixed(5),
    location.longitude.toFixed(5),
    radiusNm,
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

function createCacheKey(requestUrl, location, rangeKm) {
  const url = new URL(requestUrl);
  url.pathname = '/__over-my-home-cache/aircraft';
  url.search = '';
  url.searchParams.set('lat', location.latitude.toFixed(3));
  url.searchParams.set('lon', location.longitude.toFixed(3));
  url.searchParams.set('range', String(rangeKm));
  return new Request(url.toString(), { method: 'GET' });
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
