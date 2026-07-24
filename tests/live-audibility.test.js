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
import { projectAircraftPosition, projectAltitudeFt } from '../motion.js';
import { formatRadarAltitude, radarBearingLabel } from '../radar.js';

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

test('projects altitude from vertical rate during the correction interval', () => {
  assert.equal(projectAltitudeFt(5_000, 1_200, 30), 5_600);
  assert.equal(projectAltitudeFt(5_000, -600, 60), 4_400);
  assert.equal(projectAltitudeFt(null, 1_200, 30), null);

  const climbingWithoutTrack = projectAircraftPosition(
    {
      altitudeFt: 5_000,
      verticalRateFpm: 1_200,
      horizontalDistanceKm: 8,
      bearingDegrees: 90,
    },
    30,
  );
  assert.equal(climbingWithoutTrack.altitudeFt, 5_600);
});

test('formats simple altitude labels for the radar', () => {
  assert.equal(formatRadarAltitude(825), '800 ft');
  assert.equal(formatRadarAltitude(3_000), '3.0k ft');
  assert.equal(formatRadarAltitude(12_300), '12k ft');
  assert.equal(formatRadarAltitude(null), '');
  assert.equal(radarBearingLabel(91), 'E');
});

test('the one-second update keeps radar, altitude and projected cards aligned', () => {
  assert.match(appSource, /audibilityForPosition\(projectedAircraft\)/);
  assert.match(appSource, /setAudibilityState\(target, null, audibility\)/);
  assert.match(appSource, /updateProjectedCard\(cardView, projectedAircraft, audibility\)/);
  assert.match(appSource, /altitudeLabel\.textContent = formatRadarAltitude\(projectedAircraft\.altitudeFt\)/);
  assert.match(appSource, /target\.setAttribute\('aria-label', radarTargetAriaLabel\(projectedAircraft\)\)/);
  assert.match(appSource, /class: 'radar-target-altitude'/);
  assert.match(appSource, /\['likely', 'possible', 'unlikely'\]/);
  assert.equal(audibilityLabel('unlikely'), 'Unlikely audible');
  assert.match(cssSource, /\.radar-target\.unlikely \.radar-pulse/);
  assert.match(cssSource, /\.audibility-badge\.unlikely/);
  assert.match(cssSource, /\.radar-target-altitude/);
  assert.match(cssSource, /\.audibility-reason/);
});
