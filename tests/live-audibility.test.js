import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  LIKELY_RANGE_RATIO,
  audibilityForPosition,
  audibilityLabel,
  slantDistanceKm,
  soundRangeKm,
} from '../audibility.js';
import { projectAircraftPosition } from '../motion.js';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../audibility.css', import.meta.url), 'utf8');

const largeClimbingAircraft = {
  category: 'A3',
  altitudeFt: 5_000,
  speedKnots: 300,
  verticalRateFpm: 2_500,
};

test('uses straight-line distance while varying sound range by aircraft and operation', () => {
  assert.equal(LIKELY_RANGE_RATIO, 0.7);
  assert.equal(Number(slantDistanceKm(0, 10_000).toFixed(3)), 3.048);
  assert.equal(Number(soundRangeKm(largeClimbingAircraft).toFixed(3)), 32.076);
  assert.equal(
    audibilityForPosition({ ...largeClimbingAircraft, horizontalDistanceKm: 18 }),
    'likely',
  );
  assert.equal(
    audibilityForPosition({ ...largeClimbingAircraft, horizontalDistanceKm: 25 }),
    'possible',
  );
});

test('treats an unpowered glider as unlikely audible even overhead', () => {
  const glider = {
    category: 'B1',
    typeCode: 'ASW2',
    description: 'GLIDER',
    horizontalDistanceKm: 0,
    altitudeFt: 1_000,
    speedKnots: 55,
    verticalRateFpm: 500,
  };

  assert.equal(soundRangeKm(glider), 0);
  assert.equal(audibilityForPosition(glider), 'unlikely');
});

test('allows an identified motor glider to rank above a silent glider while climbing', () => {
  const motorGlider = {
    category: 'B1',
    description: 'GLIM - MOTORGLIDER',
    horizontalDistanceKm: 2,
    altitudeFt: 1_000,
    speedKnots: 70,
    verticalRateFpm: 1_200,
  };

  assert.equal(Number(soundRangeKm(motorGlider).toFixed(1)), 4.2);
  assert.equal(audibilityForPosition(motorGlider), 'likely');
});

test('a fast powered aircraft can change audibility during one correction interval', () => {
  const aircraft = {
    category: 'A3',
    horizontalDistanceKm: 20,
    bearingDegrees: 90,
    altitudeFt: 1_000,
    speedKnots: 600,
    trackDegrees: 270,
    verticalRateFpm: 0,
  };

  const before = projectAircraftPosition(aircraft, 0);
  const overheadPass = projectAircraftPosition(aircraft, 60);
  const after = projectAircraftPosition(aircraft, 120);

  assert.equal(audibilityForPosition(before), 'possible');
  assert.equal(audibilityForPosition(overheadPass), 'likely');
  assert.equal(audibilityForPosition(after), 'possible');
});

test('the one-second update keeps radar and card sound states aligned', () => {
  assert.match(appSource, /audibilityForPosition\(projectedAircraft\)/);
  assert.match(appSource, /setAudibilityState\(target, audibilityBadge, audibility\)/);
  assert.match(appSource, /\['likely', 'possible', 'unlikely'\]/);
  assert.equal(audibilityLabel('unlikely'), 'Unlikely audible');
  assert.match(cssSource, /\.radar-target\.unlikely \.radar-pulse/);
  assert.match(cssSource, /\.audibility-badge\.unlikely/);
});
