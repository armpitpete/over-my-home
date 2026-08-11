import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/aircraft.js';

function contextFor(query, env = {}) {
  return {
    request: new Request(`https://example.test/api/aircraft?${query}`, {
      headers: { 'Accept-Language': 'en-GB' },
    }),
    env,
    waitUntil() {},
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

test('routes a worldwide place through the configured geocoder then Airplanes.live', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);

    if (url.startsWith('https://geocoder.example.test/search?')) {
      return jsonResponse([{
        lat: '40.7506',
        lon: '-73.9972',
        name: '10001',
        display_name: '10001, New York, United States',
        address: {
          postcode: '10001',
          city: 'New York',
          state: 'New York',
          country: 'United States',
          country_code: 'us',
        },
      }]);
    }

    if (url.startsWith('https://api.airplanes.live/v2/point/')) {
      return jsonResponse({ ac: [], msg: 'No error' });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await onRequestGet(contextFor(
      'location=10001%2C%20USA&range=18',
      { GEOCODER_BASE_URL: 'https://geocoder.example.test/' },
    ));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.location.label, '10001');
    assert.equal(body.location.countryCode, 'US');
    assert.equal(body.source.geocoder, 'OpenStreetMap Nominatim');
    assert.deepEqual(body.aircraft, []);
    assert.equal(requests.length, 2);
    assert.match(requests[0], /^https:\/\/geocoder\.example\.test\/search\?/);
    assert.match(requests[1], /^https:\/\/api\.airplanes\.live\/v2\/point\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('keeps valid UK postcodes on the existing Postcodes.io path', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);

    if (url === 'https://api.postcodes.io/postcodes/YO32%209QU') {
      return jsonResponse({
        result: {
          postcode: 'YO32 9QU',
          latitude: 53.99,
          longitude: -1.05,
          admin_district: 'York',
          country: 'England',
        },
      });
    }

    if (url.startsWith('https://api.airplanes.live/v2/point/')) {
      return jsonResponse({ ac: [], msg: 'No error' });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await onRequestGet(contextFor('location=yo32%209qu&range=18'));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.location.label, 'YO32 9QU');
    assert.equal(body.location.countryCode, 'GB');
    assert.equal(body.source.geocoder, 'Postcodes.io');
    assert.equal(requests.length, 2);
    assert.equal(requests[0], 'https://api.postcodes.io/postcodes/YO32%209QU');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('accepts the legacy postcode query parameter for backward compatibility', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('https://api.postcodes.io/postcodes/')) {
      return jsonResponse({
        result: {
          postcode: 'SW1A 1AA',
          latitude: 51.501,
          longitude: -0.1416,
          admin_district: 'Westminster',
        },
      });
    }
    if (url.startsWith('https://api.airplanes.live/v2/point/')) {
      return jsonResponse({ ac: [], msg: 'No error' });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await onRequestGet(contextFor('postcode=SW1A1AA&range=18'));
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
