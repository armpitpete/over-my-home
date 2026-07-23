import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bearingLabel,
  boundingBox,
  clampRange,
  haversineKm,
  normalisePostcode,
  parseStateVector,
} from '../functions/lib/aircraft.js';

test('normalises a UK postcode', () => {
  assert.equal(normalisePostcode('yo1 7hh'), 'YO1 7HH');
  assert.equal(normalisePostcode('SW1A1AA'), 'SW1A 1AA');
  assert.equal(normalisePostcode('not a postcode'), null);
});

test('clamps hearing range', () => {
  assert.equal(clampRange('5'), 8);
  assert.equal(clampRange('18.4'), 18);
  assert.equal(clampRange('80'), 30);
  assert.equal(clampRange('x'), 18);
});

test('builds a bounding box around a point', () => {
  const box = boundingBox(53.96, -1.08, 20);
  assert.ok(box.lamin < 53.96);
  assert.ok(box.lamax > 53.96);
  assert.ok(box.lomin < -1.08);
  assert.ok(box.lomax > -1.08);
});

test('haversine distance is zero for the same point', () => {
  assert.equal(haversineKm(53.96, -1.08, 53.96, -1.08), 0);
});

test('bearing labels cover main compass points', () => {
  assert.equal(bearingLabel(0), 'N');
  assert.equal(bearingLabel(90), 'E');
  assert.equal(bearingLabel(225), 'SW');
});

test('parses and filters a nearby aircraft', () => {
  const now = 1_700_000_000;
  const state = [
    'abcdef', 'TEST123 ', 'United Kingdom', now - 3, now - 2,
    -1.08, 53.98, 2000, false, 120, 180, 0, null, 2100,
    '7000', false, 0, 4,
  ];
  const aircraft = parseStateVector(
    state,
    { latitude: 53.96, longitude: -1.08 },
    18,
    now,
  );
  assert.ok(aircraft);
  assert.equal(aircraft.callsign, 'TEST123');
  assert.equal(aircraft.categoryLabel, 'Large aircraft');
  assert.ok(aircraft.slantDistanceKm < 18);
  assert.equal(aircraft.positionAgeSeconds, 3);
});

test('filters aircraft beyond the modelled hearing range', () => {
  const state = [
    'abcdef', 'FAR123', 'United Kingdom', 100, 100,
    0, 55, 10000, false, 250, 90, 0, null, 10000,
    null, false, 0, 4,
  ];
  const aircraft = parseStateVector(
    state,
    { latitude: 53.96, longitude: -1.08 },
    18,
    100,
  );
  assert.equal(aircraft, null);
});
