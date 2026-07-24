import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aircraftTileCacheKey,
  aircraftTileForLocation,
  staleAgeSeconds,
} from '../functions/lib/aircraft-tile.js';
import { onRequestGet } from '../functions/api/aircraft.js';

const HOME_ONE = {
  postcode: 'YO32 9QU',
  latitude: 53.99,
  longitude: -1.03,
  admin_district: 'York',
};
const HOME_TWO = {
  postcode: 'YO32 9QX',
  latitude: 53.995,
  longitude: -1.025,
  admin_district: 'York',
};

class MemoryCache {
  constructor() {
    this.entries = new Map();
  }

  async match(request) {
    const response = this.entries.get(request.url);
    return response ? response.clone() : undefined;
  }

  async put(request, response) {
    this.entries.set(request.url, response.clone());
  }

  removeFreshEntries() {
    for (const key of this.entries.keys()) {
      if (key.includes('/fresh?')) this.entries.delete(key);
    }
  }
}

test('nearby postcodes share one fixed tile and cache key', () => {
  const first = aircraftTileForLocation(HOME_ONE);
  const second = aircraftTileForLocation(HOME_TWO);

  assert.equal(first.id, second.id);
  assert.equal(first.centreLatitude, second.centreLatitude);
  assert.equal(first.centreLongitude, second.centreLongitude);
  assert.ok(first.radiusNm >= 25);
  assert.ok(first.radiusNm <= 30);

  const firstKey = aircraftTileCacheKey(
    'https://over-my-home.pages.dev/api/aircraft?postcode=YO32%209QU&range=18',
    first,
  );
  const secondKey = aircraftTileCacheKey(
    'https://over-my-home.pages.dev/api/aircraft?postcode=YO32%209QX&range=30',
    second,
  );
  assert.equal(firstKey.url, secondKey.url);
});

test('calculates stale age without negative values', () => {
  assert.equal(staleAgeSeconds('2026-07-24T12:00:00.000Z', Date.parse('2026-07-24T12:07:30.000Z')), 450);
  assert.equal(staleAgeSeconds('2026-07-24T12:07:30.000Z', Date.parse('2026-07-24T12:00:00.000Z')), 0);
  assert.equal(staleAgeSeconds('not-a-date'), 0);
});

test('reuses one upstream response across nearby postcode and range searches', async () => {
  const environment = createEnvironment();
  try {
    const first = await requestAircraft(environment, HOME_ONE.postcode, 18);
    const second = await requestAircraft(environment, HOME_TWO.postcode, 30);

    assert.equal(first.response.headers.get('X-Over-My-Home-Cache'), 'MISS');
    assert.equal(second.response.headers.get('X-Over-My-Home-Cache'), 'HIT');
    assert.equal(environment.airplanesCalls(), 1);
    assert.equal(first.body.source.tileId, second.body.source.tileId);
    assert.equal(first.body.source.stale, false);
    assert.equal(second.body.source.stale, false);
    assert.equal(first.body.location.postcode, HOME_ONE.postcode);
    assert.equal(second.body.location.postcode, HOME_TWO.postcode);
  } finally {
    environment.restore();
  }
});

test('falls back to a labelled stale tile when Airplanes.live fails', async () => {
  const environment = createEnvironment();
  try {
    await requestAircraft(environment, HOME_ONE.postcode, 30);
    environment.cache.removeFreshEntries();
    environment.failAirplanes();

    const fallback = await requestAircraft(environment, HOME_TWO.postcode, 30);

    assert.equal(fallback.response.status, 200);
    assert.equal(fallback.response.headers.get('X-Over-My-Home-Cache'), 'STALE');
    assert.equal(fallback.body.source.stale, true);
    assert.ok(fallback.body.source.staleAgeSeconds >= 0);
    assert.equal(fallback.body.location.postcode, HOME_TWO.postcode);
    assert.ok(Array.isArray(fallback.body.aircraft));
  } finally {
    environment.restore();
  }
});

function createEnvironment() {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MemoryCache();
  let airplanesCalls = 0;
  let shouldFailAirplanes = false;

  globalThis.caches = { default: cache };
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);

    if (url.hostname === 'api.postcodes.io') {
      const postcode = decodeURIComponent(url.pathname.split('/').pop()).toUpperCase();
      const result = postcode === HOME_TWO.postcode ? HOME_TWO : HOME_ONE;
      return jsonResponse({ status: 200, result });
    }

    if (url.hostname === 'api.airplanes.live') {
      airplanesCalls += 1;
      if (shouldFailAirplanes) return jsonResponse({ error: 'unavailable' }, 502);
      return jsonResponse({
        msg: 'No error',
        ac: [{
          hex: 'abc123',
          flight: 'CACHE01',
          r: 'G-CACH',
          t: 'C172',
          desc: 'CESSNA 172',
          lat: 53.992,
          lon: -1.028,
          alt_baro: 1_200,
          gs: 95,
          track: 180,
          baro_rate: 0,
          seen_pos: 1,
          category: 'A1',
          type: 'adsb_icao',
          dbFlags: 0,
        }],
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  return {
    cache,
    airplanesCalls: () => airplanesCalls,
    failAirplanes: () => { shouldFailAirplanes = true; },
    restore: () => {
      globalThis.fetch = originalFetch;
      if (originalCaches === undefined) delete globalThis.caches;
      else globalThis.caches = originalCaches;
    },
  };
}

async function requestAircraft(environment, postcode, range) {
  const pending = [];
  const url = new URL('https://over-my-home.pages.dev/api/aircraft');
  url.searchParams.set('postcode', postcode);
  url.searchParams.set('range', String(range));
  const context = {
    request: new Request(url),
    waitUntil(promise) {
      pending.push(promise);
    },
  };

  const response = await onRequestGet(context);
  await Promise.all(pending);
  const body = await response.clone().json();
  return { response, body };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
