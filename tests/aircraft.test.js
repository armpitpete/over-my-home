import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bearingLabel,
  clampRange,
  haversineKm,
  normalisePostcode,
  parseAirplanesAircraft,
  radiusKmToNauticalMiles,
  sourceLabel,
} from '../functions/lib/aircraft.js';
import { radarPosition, ringLabels } from '../radar.js';

const home = { latitude: 53.99, longitude: -1.05 };

function aircraft(overrides = {}) {
  return {
    hex: '43c123',
    flight: 'TEST01 ',
    r: 'ZZ123',
    t: 'A400',
    desc: 'TEST AIRCRAFT',
    lat: 54.02,
    lon: -1.05,
    alt_baro: 7000,
    gs: 260,
    track: 180,
    seen_pos: 3.2,
    type: 'adsb_icao',
    category: 'A3',
    dbFlags: 0,
    ...overrides,
  };
}

test('normalises a UK postcode', () => {
  assert.equal(normalisePostcode('yo32 9qu'), 'YO32 9QU');
  assert.equal(normalisePostcode('SW1A1AA'), 'SW1A 1AA');
  assert.equal(normalisePostcode('not a postcode'), null);
});

test('clamps hearing range and converts it for the provider radius', () => {
  assert.equal(clampRange('5'), 8);
  assert.equal(clampRange('18.4'), 18);
  assert.equal(clampRange('80'), 30);
  assert.equal(clampRange('x'), 18);
  assert.equal(radiusKmToNauticalMiles(18), 10);
});

test('haversine distance is zero for the same point', () => {
  assert.equal(haversineKm(53.99, -1.05, 53.99, -1.05), 0);
});

test('bearing labels cover main compass points', () => {
  assert.equal(bearingLabel(0), 'N');
  assert.equal(bearingLabel(90), 'E');
  assert.equal(bearingLabel(225), 'SW');
});

test('parses a nearby Airplanes.live aircraft', () => {
  const result = parseAirplanesAircraft(aircraft(), home, 18);
  assert.ok(result);
  assert.equal(result.callsign, 'TEST01');
  assert.equal(result.registration, 'ZZ123');
  assert.equal(result.categoryLabel, 'Large aircraft');
  assert.equal(result.sourceLabel, 'ADS-B');
  assert.equal(result.positionAgeSeconds, 3);
  assert.ok(result.slantDistanceKm < 18);
});

test('identifies confirmed military aircraft from dbFlags', () => {
  const result = parseAirplanesAircraft(aircraft({ dbFlags: 1, type: 'mlat' }), home, 18);
  assert.ok(result);
  assert.equal(result.military, true);
  assert.equal(result.categoryLabel, 'Military aircraft');
  assert.equal(result.sourceLabel, 'MLAT');
});

test('keeps an aircraft with missing altitude but reports altitude as unknown', () => {
  const result = parseAirplanesAircraft(aircraft({ alt_baro: undefined, alt_geom: undefined }), home, 18);
  assert.ok(result);
  assert.equal(result.altitudeFt, undefined);
});

test('filters ground, stale and out-of-range aircraft', () => {
  assert.equal(parseAirplanesAircraft(aircraft({ alt_baro: 'ground' }), home, 18), null);
  assert.equal(parseAirplanesAircraft(aircraft({ seen_pos: 91 }), home, 18), null);
  assert.equal(parseAirplanesAircraft(aircraft({ lat: 55, lon: 0 }), home, 18), null);
});

test('accepts a recent lastPosition fallback and rejects an old one', () => {
  const recent = parseAirplanesAircraft(
    aircraft({ lat: undefined, lon: undefined, lastPosition: { lat: 54.01, lon: -1.05, seen_pos: 42 } }),
    home,
    18,
  );
  assert.ok(recent);
  assert.equal(recent.positionAgeSeconds, 42);

  const old = parseAirplanesAircraft(
    aircraft({ lat: undefined, lon: undefined, lastPosition: { lat: 54.01, lon: -1.05, seen_pos: 61 } }),
    home,
    18,
  );
  assert.equal(old, null);
});

test('maps source labels without guessing', () => {
  assert.equal(sourceLabel('mlat'), 'MLAT');
  assert.equal(sourceLabel('mode_s'), 'Mode S');
  assert.equal(sourceLabel('something-new'), 'Source unknown');
});

test('places north and east aircraft correctly on the radar', () => {
  const north = radarPosition({ horizontalDistanceKm: 10, bearingDegrees: 0 }, 20);
  assert.equal(north.x, 300);
  assert.equal(north.y, 175);

  const east = radarPosition({ horizontalDistanceKm: 20, bearingDegrees: 90 }, 20);
  assert.equal(Math.round(east.x), 550);
  assert.equal(Math.round(east.y), 300);
});

test('builds readable radar ring labels', () => {
  assert.deepEqual(ringLabels(20), ['5 km', '10 km', '15 km', '20 km']);
});
