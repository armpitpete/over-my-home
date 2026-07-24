import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('explains solid and dashed audibility circles in the radar legend', () => {
  assert.match(indexSource, /Solid circle — likely audible/);
  assert.match(indexSource, /Dashed circle — possibly audible/);
});

test('shows matching solid and dashed visual samples', () => {
  assert.match(indexSource, /<circle[^>]*stroke-width="2"[^>]*><\/circle>/);
  assert.match(indexSource, /<circle[^>]*stroke-dasharray="3 2"[^>]*><\/circle>/);
});
