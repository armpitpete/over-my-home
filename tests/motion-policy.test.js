import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('functional radar motion is not disabled by reduced-motion preferences', () => {
  assert.doesNotMatch(appSource, /prefers-reduced-motion/);
  assert.doesNotMatch(appSource, /reducedMotion/);
  assert.match(appSource, /setInterval\(updateRadarMotion, MOTION_TICK_MS\)/);
});

test('radar motion still pauses when the tab is hidden', () => {
  assert.match(appSource, /document\.visibilityState === 'hidden'/);
  assert.match(appSource, /document\.visibilityState !== 'visible'/);
});
