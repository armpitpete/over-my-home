import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAirplanesAircraft } from '../functions/lib/aircraft.js';

const home = { latitude: 53.99, longitude: -1.05 };

function record(overrides = {}) {
  return {
    hex: '43c123',
    flight: 'SOUND01',
    r: 'G-TEST',
    t: 'TEST',
    desc: 'TEST AIRCRAFT',
    lat: 54.15,
    lon: -1.05,
    alt_baro: 5_000,
    gs: 300,
    track: 180,
    geom_rate: 2_500,
    seen_pos: 1,
    type: 'adsb_icao',
    category: 'A3',
    dbFlags: 0,
    ...overrides,
  };
}

test('API ranks a large fast-climbing aircraft as likely audible at long range', () => {
  const aircraft = parseAirplanesAircraft(record(), home, 30);
  assert.ok(aircraft);
  assert.equal(aircraft.categoryLabel, 'Large aircraft');
  assert.ok(aircraft.slantDistanceKm > 17);
  assert.equal(aircraft.audibility, 'likely');
});

test('API ranks an unpowered glider as unlikely audible even when close', () => {
  const glider = parseAirplanesAircraft(
    record({
      category: 'B1',
      desc: 'GLIDER',
      lat: 54.0,
      alt_baro: 1_000,
      gs: 55,
      geom_rate: 600,
    }),
    home,
    30,
  );

  assert.ok(glider);
  assert.equal(glider.categoryLabel, 'Glider');
  assert.equal(glider.audibility, 'unlikely');
});
