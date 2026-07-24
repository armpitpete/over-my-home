import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { audibilityReason } from '../audibility.js';
import { createMotionState, projectMotionState } from '../motion.js';
import { bearingDescription, cardProjection } from '../presentation.js';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');

const aircraft = {
  icao24: '43c123',
  callsign: 'SOUND01',
  category: 'A3',
  horizontalDistanceKm: 10,
  bearingDegrees: 90,
  altitudeFt: 5_000,
  speedKnots: 300,
  trackDegrees: 270,
  verticalRateFpm: 1_200,
  positionAgeSeconds: 31,
};

test('calls the control radar range rather than hearing distance', () => {
  assert.match(indexSource, /<label for="range">Radar range<\/label>/);
  assert.match(indexSource, /Aircraft beyond this distance are not requested or shown/);
  assert.doesNotMatch(indexSource, /Modelled hearing distance/);
});

test('builds a coherent projected card state from one aircraft position', () => {
  const projection = cardProjection(aircraft, 'likely');

  assert.equal(projection.audibilityText, 'Likely audible');
  assert.equal(projection.distanceText, '10.1 km');
  assert.equal(projection.altitudeText, '5,000 ft');
  assert.equal(projection.bearingText, 'East · 10.0 km away');
  assert.equal(projection.movementText, 'Approaching');
  assert.equal(projection.positionAgeText, '31s');
  assert.equal(
    projection.reasonText,
    'Large aircraft, climbing, 10.1 km straight-line distance.',
  );
});

test('explains why an unpowered glider has low sound likelihood', () => {
  assert.equal(
    audibilityReason({
      category: 'B1',
      description: 'GLIDER',
      horizontalDistanceKm: 0,
      altitudeFt: 1_000,
    }),
    'Glider category; little or no engine noise expected at 0.3 km straight-line distance.',
  );
});

test('projected motion increments the displayed position age', () => {
  const receivedAtMs = 1_000_000;
  const state = createMotionState(
    { ...aircraft, positionAgeSeconds: 20 },
    new Date(receivedAtMs).toISOString(),
    receivedAtMs,
  );
  const projected = projectMotionState(state, receivedAtMs + 5_000);

  assert.equal(projected.positionAgeSeconds, 25);
  assert.equal(Math.round(projected.altitudeFt), 5_500);
});

test('updates every projected card field on the one-second motion tick', () => {
  assert.match(appSource, /updateProjectedCard\(cardView, projectedAircraft, audibility\)/);
  assert.match(appSource, /cardView\.distance\.textContent = projection\.distanceText/);
  assert.match(appSource, /cardView\.altitude\.textContent = projection\.altitudeText/);
  assert.match(appSource, /cardView\.bearing\.textContent = projection\.bearingText/);
  assert.match(appSource, /cardView\.motion\.textContent = projection\.movementText/);
  assert.match(appSource, /cardView\.age\.textContent = projection\.positionAgeText/);
  assert.match(indexSource, /class="audibility-reason-text"/);
  assert.equal(bearingDescription(315), 'North-west');
});
