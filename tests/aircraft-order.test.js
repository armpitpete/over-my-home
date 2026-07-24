import test from 'node:test';
import assert from 'node:assert/strict';

import { compareAircraftBySoundThenDistance } from '../functions/api/aircraft.js';

test('orders likely, possible and unlikely aircraft before considering distance', () => {
  const aircraft = [
    { callsign: 'QUIET', audibility: 'unlikely', slantDistanceKm: 1 },
    { callsign: 'POSSIBLE', audibility: 'possible', slantDistanceKm: 2 },
    { callsign: 'LOUD', audibility: 'likely', slantDistanceKm: 20 },
  ].sort(compareAircraftBySoundThenDistance);

  assert.deepEqual(aircraft.map((item) => item.callsign), ['LOUD', 'POSSIBLE', 'QUIET']);
});

test('orders aircraft by distance within the same sound state', () => {
  const aircraft = [
    { callsign: 'FAR', audibility: 'possible', slantDistanceKm: 18 },
    { callsign: 'NEAR', audibility: 'possible', slantDistanceKm: 7 },
  ].sort(compareAircraftBySoundThenDistance);

  assert.deepEqual(aircraft.map((item) => item.callsign), ['NEAR', 'FAR']);
});

test('places unknown states and missing distances last without throwing', () => {
  const aircraft = [
    { callsign: 'UNKNOWN', audibility: 'other' },
    { callsign: 'KNOWN', audibility: 'unlikely', slantDistanceKm: 4 },
  ].sort(compareAircraftBySoundThenDistance);

  assert.deepEqual(aircraft.map((item) => item.callsign), ['KNOWN', 'UNKNOWN']);
});
