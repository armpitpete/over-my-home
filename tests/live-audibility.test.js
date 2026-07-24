import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  LIKELY_AUDIBLE_DISTANCE_KM,
  audibilityForPosition,
  slantDistanceKm,
} from '../audibility.js';
import { projectAircraftPosition } from '../motion.js';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('uses straight-line distance for the fixed audibility threshold', () => {
  assert.equal(LIKELY_AUDIBLE_DISTANCE_KM, 12);
  assert.equal(Number(slantDistanceKm(0, 10_000).toFixed(3)), 3.048);
  assert.equal(audibilityForPosition({ horizontalDistanceKm: 11.5, altitudeFt: 1_000 }), 'likely');
  assert.equal(audibilityForPosition({ horizontalDistanceKm: 12, altitudeFt: 1_000 }), 'possible');
});

test('a fast aircraft can switch possible to likely and back during one correction interval', () => {
  const aircraft = {
    horizontalDistanceKm: 20,
    bearingDegrees: 90,
    altitudeFt: 1_000,
    speedKnots: 600,
    trackDegrees: 270,
  };

  const before = projectAircraftPosition(aircraft, 0);
  const overheadPass = projectAircraftPosition(aircraft, 60);
  const after = projectAircraftPosition(aircraft, 120);

  assert.equal(audibilityForPosition(before), 'possible');
  assert.equal(audibilityForPosition(overheadPass), 'likely');
  assert.equal(audibilityForPosition(after), 'possible');
});

test('the one-second radar update applies the current projected audibility class', () => {
  assert.match(appSource, /audibilityForPosition\(projectedAircraft\)/);
  assert.match(appSource, /target\.classList\.toggle\('likely', audibility === 'likely'\)/);
});
