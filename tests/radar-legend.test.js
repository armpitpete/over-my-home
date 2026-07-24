import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  RADAR_KEY_LABELS,
  RADAR_KEY_STYLES,
  radarKeyMarkup,
} from '../radar-legend-layout.js';

const emptyStateSource = await readFile(new URL('../radar-empty-state.js', import.meta.url), 'utf8');

const expectedLabels = [
  'Aircraft symbol',
  'Solid ring — likely audible',
  'Dashed ring — possibly audible',
  'Yellow ring — selected aircraft; solid or dashed still shows audibility',
  'Shield — confirmed military',
  'MLAT badge — position derived by multilateration',
];

test('explains every radar symbol and ring state', () => {
  assert.deepEqual(Object.values(RADAR_KEY_LABELS), expectedLabels);
  const markup = radarKeyMarkup();
  expectedLabels.forEach((label) => assert.match(markup, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
});

test('uses large matching samples for likely, possible and selected rings', () => {
  const markup = radarKeyMarkup();
  assert.match(markup, /stroke-width="3"><\/circle>/);
  assert.match(markup, /stroke-dasharray="5 4"><\/circle>/);
  assert.match(markup, /stroke="var\(--accent\)" stroke-width="5"><\/circle>/);
});

test('lays the key out as three, two and one responsive columns', () => {
  assert.match(RADAR_KEY_STYLES, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(RADAR_KEY_STYLES, /max-width: 760px[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(RADAR_KEY_STYLES, /max-width: 520px[\s\S]*grid-template-columns: 1fr/);
  assert.match(RADAR_KEY_STYLES, /font-size: 0\.92rem/);
});

test('loads the full-width key through the existing page module', () => {
  assert.match(emptyStateSource, /import '\.\/radar-legend-layout\.js';/);
});
