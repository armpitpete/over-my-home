import {
  boundingBox,
  clampRange,
  normalisePostcode,
  parseStateVector,
} from '../lib/aircraft.js';

const TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const OPENSKY_URL = 'https://opensky-network.org/api/states/all';
const POSTCODE_URL = 'https://api.postcodes.io/postcodes';
const CACHE_TTL_MS = 9_000;

let tokenCache = { token: null, expiresAt: 0 };
const responseCache = new Map();

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const postcode = normalisePostcode(url.searchParams.get('postcode'));
  const rangeKm = clampRange(url.searchParams.get('range'));

  if (!postcode) {
    return json({ error: 'Enter a valid UK postcode.' }, 400);
  }

  const cacheKey = `${postcode}:${rangeKm}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return json(cached.body, 200, { 'X-Over-My-Home-Cache': 'HIT' });
  }

  try {
    const location = await lookupPostcode(postcode);
    const box = boundingBox(location.latitude, location.longitude, Math.min(40, rangeKm + 12));
    const { payload, authenticated, rateLimitRemaining } = await loadOpenSky(box, context.env);
    const nowSeconds = Number(payload.time) || Math.floor(Date.now() / 1000);

    const aircraft = (payload.states || [])
      .map((state) => parseStateVector(state, location, rangeKm, nowSeconds))
      .filter(Boolean)
      .sort((a, b) => a.slantDistanceKm - b.slantDistanceKm);

    const body = {
      generatedAt: new Date().toISOString(),
      location: {
        postcode: location.postcode,
        area: location.area,
      },
      rangeKm,
      aircraft,
      source: {
        provider: 'OpenSky Network',
        authenticated,
        rateLimitRemaining,
      },
    };

    responseCache.set(cacheKey, { createdAt: Date.now(), body });
    pruneCache();
    return json(body);
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

async function loadOpenSky(box, env) {
  const params = new URLSearchParams({
    lamin: box.lamin.toFixed(5),
    lomin: box.lomin.toFixed(5),
    lamax: box.lamax.toFixed(5),
    lomax: box.lomax.toFixed(5),
    extended: '1',
  });

  const headers = { Accept: 'application/json' };
  let authenticated = false;
  if (env.OPENSKY_CLIENT_ID && env.OPENSKY_CLIENT_SECRET) {
    const token = await getOpenSkyToken(env);
    headers.Authorization = `Bearer ${token}`;
    authenticated = true;
  }

  let response = await fetch(`${OPENSKY_URL}?${params}`, { headers });

  if (response.status === 401 && authenticated) {
    tokenCache = { token: null, expiresAt: 0 };
    const token = await getOpenSkyToken(env);
    headers.Authorization = `Bearer ${token}`;
    response = await fetch(`${OPENSKY_URL}?${params}`, { headers });
  }

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('X-Rate-Limit-Retry-After-Seconds')) || 60;
    const error = publicError(429, `OpenSky has reached its request limit. Try again in about ${retryAfter} seconds.`);
    error.retryAfter = retryAfter;
    throw error;
  }
  if (!response.ok) {
    throw publicError(502, 'OpenSky did not return live aircraft data.');
  }

  return {
    payload: await response.json(),
    authenticated,
    rateLimitRemaining: nullableNumber(response.headers.get('X-Rate-Limit-Remaining')),
  };
}

async function getOpenSkyToken(env) {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now + 30_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.OPENSKY_CLIENT_ID,
    client_secret: env.OPENSKY_CLIENT_SECRET,
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw publicError(502, 'OpenSky authentication failed.');
  }

  const data = await response.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: now + (Number(data.expires_in) || 1800) * 1000,
  };
  return tokenCache.token;
}

function pruneCache() {
  if (responseCache.size < 100) return;
  const cutoff = Date.now() - CACHE_TTL_MS * 2;
  for (const [key, entry] of responseCache) {
    if (entry.createdAt < cutoff) responseCache.delete(key);
  }
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
