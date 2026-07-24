import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  RADAR_KEY_LABELS,
  radarKeyMarkup,
} from '../radar-legend-layout.js';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../radar-legend.css', import.meta.url), 'utf8');
const layoutSource = await readFile(new URL('../radar-legend-layout.js', import.meta.url), 'utf8');
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
  expectedLabels.forEach((label) => assert.ok(markup.includes(label)));
});

test('gives every generated SVG an intrinsic 32 pixel size', () => {
  const markup = radarKeyMarkup();
  const svgMatches = markup.match(/<svg width="32" height="32"/g) || [];
  assert.equal(svgMatches.length, 5);
});

test('loads the radar key stylesheet through the page head', () => {
  assert.match(indexSource, /<link rel="stylesheet" href="\/radar-legend\.css" \/>/);
});

test('caps key samples at two rem and preserves responsive columns', () => {
  assert.match(cssSource, /\.radar-key-sample svg \{[\s\S]*width: 2rem;[\s\S]*height: 2rem;[\s\S]*max-width: 2rem;[\s\S]*max-height: 2rem;/);
  assert.match(cssSource, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /max-width: 760px[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(cssSource, /max-width: 520px[\s\S]*grid-template-columns: 1fr/);
});

test('does not rely on runtime-injected style rules', () => {
  assert.doesNotMatch(layoutSource, /createElement\('style'\)/);
  assert.doesNotMatch(layoutSource, /RADAR_KEY_STYLES/);
  assert.match(emptyStateSource, /import '\.\/radar-legend-layout\.js';/);
});
