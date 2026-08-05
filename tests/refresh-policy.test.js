import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CIVILIAN_REFRESH_MS,
  MILITARY_REFRESH_MS,
  refreshIntervalForAircraft,
} from '../refresh-policy.js';

test('ordinary aircraft retain the three-minute refresh interval', () => {
  assert.equal(refreshIntervalForAircraft([]), CIVILIAN_REFRESH_MS);
  assert.equal(refreshIntervalForAircraft([{ military: false }]), 180_000);
});

test('any confirmed military aircraft switches refreshes to one minute', () => {
  assert.equal(
    refreshIntervalForAircraft([
      { military: false },
      { military: true },
    ]),
    MILITARY_REFRESH_MS,
  );
  assert.equal(MILITARY_REFRESH_MS, 60_000);
});
