import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GEOCODER_BASE_URL,
  geocoderSearchUrl,
  normaliseLocationQuery,
  parseNominatimLocation,
} from '../functions/lib/location.js';

test('normalises worldwide location queries without forcing UK formatting', () => {
  assert.equal(normaliseLocationQuery('  10001,   USA  '), '10001, USA');
  assert.equal(normaliseLocationQuery('M5V 3L9, Canada'), 'M5V 3L9, Canada');
  assert.equal(normaliseLocationQuery('東京, 日本'), '東京, 日本');
  assert.equal(normaliseLocationQuery(''), null);
  assert.equal(normaliseLocationQuery('x'.repeat(121)), null);
});

test('builds a bounded Nominatim search request', () => {
  const url = new URL(geocoderSearchUrl('10115 Berlin'));
  assert.equal(url.origin, DEFAULT_GEOCODER_BASE_URL);
  assert.equal(url.pathname, '/search');
  assert.equal(url.searchParams.get('q'), '10115 Berlin');
  assert.equal(url.searchParams.get('format'), 'jsonv2');
  assert.equal(url.searchParams.get('addressdetails'), '1');
  assert.equal(url.searchParams.get('limit'), '1');
});

test('allows a Nominatim-compatible provider to be swapped by base URL', () => {
  const url = new URL(geocoderSearchUrl('Sydney NSW', 'https://geocoder.example.test/v1/'));
  assert.equal(url.origin, 'https://geocoder.example.test');
  assert.equal(url.pathname, '/search');
});

test('parses a postal-code result into aircraft-centre coordinates', () => {
  const location = parseNominatimLocation({
    lat: '40.7506',
    lon: '-73.9972',
    name: '10001',
    display_name: '10001, Manhattan, New York, United States',
    address: {
      postcode: '10001',
      city: 'New York',
      state: 'New York',
      country: 'United States',
      country_code: 'us',
    },
  }, '10001, USA');

  assert.deepEqual(location, {
    label: '10001',
    postcode: '10001',
    latitude: 40.7506,
    longitude: -73.9972,
    area: 'New York, United States',
    countryCode: 'US',
    source: 'OpenStreetMap Nominatim',
  });
});

test('parses a named place when no postcode is present', () => {
  const location = parseNominatimLocation({
    lat: '43.6532',
    lon: '-79.3832',
    name: 'Toronto',
    display_name: 'Toronto, Ontario, Canada',
    address: {
      city: 'Toronto',
      state: 'Ontario',
      country: 'Canada',
      country_code: 'ca',
    },
  }, 'Toronto, Canada');

  assert.equal(location.label, 'Toronto');
  assert.equal(location.area, 'Ontario, Canada');
  assert.equal(location.countryCode, 'CA');
});

test('rejects unusable geocoder coordinates', () => {
  assert.equal(parseNominatimLocation(null, 'York'), null);
  assert.equal(parseNominatimLocation({ lat: '999', lon: '0' }, 'York'), null);
  assert.equal(parseNominatimLocation({ lat: '53.9', lon: 'not-a-number' }, 'York'), null);
});
