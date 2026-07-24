import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  INITIAL_RADAR_MESSAGE,
  NO_AIRCRAFT_MESSAGE,
  radarEmptyMessage,
} from '../radar-empty-state.js';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('keeps the postcode instruction before the first completed search', () => {
  assert.equal(radarEmptyMessage(false, 0), INITIAL_RADAR_MESSAGE);
});

test('shows a no-aircraft message after a completed empty search', () => {
  assert.equal(radarEmptyMessage(true, 0), NO_AIRCRAFT_MESSAGE);
});

test('does not leave an empty-state message behind active aircraft', () => {
  assert.equal(radarEmptyMessage(true, 3), '');
});

test('loads the contextual radar empty-state controller', () => {
  assert.match(indexSource, /<script type="module" src="\/radar-empty-state\.js"><\/script>/);
});
