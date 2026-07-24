import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  boxesOverlap,
  compactRadarLabel,
  layoutRadarLabels,
} from '../radar-label-layout.js';
import { parseRadarTranslate } from '../radar-label-declutter.js';

const controllerSource = await readFile(new URL('../radar-label-declutter.js', import.meta.url), 'utf8');
const emptyStateSource = await readFile(new URL('../radar-empty-state.js', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../audibility.css', import.meta.url), 'utf8');

test('combines callsign and compact altitude into one short radar label', () => {
  assert.equal(compactRadarLabel('GCBZE', '300 ft'), 'GCBZE · 300 ft');
  assert.equal(compactRadarLabel('GCLXB', '1.3k ft'), 'GCLXB · 1.3k ft');
  assert.equal(compactRadarLabel('GDERH', ''), 'GDERH');
  assert.equal(compactRadarLabel('LONGCALLSIGN12', '12k ft'), 'LONGCALLSI · 12k ft');
});

test('parses the live SVG translate formats used by radar targets', () => {
  assert.deepEqual(parseRadarTranslate('translate(123.45 67.89)'), { x: 123.45, y: 67.89 });
  assert.deepEqual(parseRadarTranslate('translate(-2.5, 4)'), { x: -2.5, y: 4 });
  assert.equal(parseRadarTranslate('rotate(45)'), null);
});

test('separates the clustered south-sector labels seen in live verification', () => {
  const placements = layoutRadarLabels([
    { id: 'selected', x: 250, y: 420, text: 'GCBZE · 300 ft', selected: true },
    { id: 'nearby', x: 250, y: 460, text: 'N · 200 ft' },
    { id: 'south', x: 280, y: 480, text: 'GDERH · 200 ft' },
    { id: 'west', x: 210, y: 400, text: 'GCLXB · 1.3k ft' },
  ]);

  for (let first = 0; first < placements.length; first += 1) {
    for (let second = first + 1; second < placements.length; second += 1) {
      assert.equal(
        boxesOverlap(placements[first].box, placements[second].box),
        false,
        `${placements[first].id} should not overlap ${placements[second].id}`,
      );
    }
  }
});

test('keeps labels inside the 600 pixel radar at opposite edges', () => {
  const placements = layoutRadarLabels([
    { id: 'top-left', x: 20, y: 20, text: 'G-EDGE · 12k ft' },
    { id: 'bottom-right', x: 580, y: 580, text: 'G-EDGE2 · 900 ft' },
  ]);

  for (const placement of placements) {
    assert.ok(placement.box.left >= 8);
    assert.ok(placement.box.top >= 8);
    assert.ok(placement.box.right <= 592);
    assert.ok(placement.box.bottom <= 592);
  }
});

test('loads the decluttering controller and hides the old second line only after enhancement', () => {
  assert.match(emptyStateSource, /import '\.\/radar-label-declutter\.js';/);
  assert.match(controllerSource, /layoutRadarLabels\(items\)/);
  assert.match(controllerSource, /attributeFilter: \['transform', 'class'\]/);
  assert.match(cssSource, /#sky-radar\.labels-decluttered \.radar-target-altitude \{[\s\S]*display: none;/);
  assert.match(cssSource, /#sky-radar\.labels-decluttered \.radar-target-label/);
});
