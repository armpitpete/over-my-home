import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../support.css', import.meta.url), 'utf8');

test('shows the Over My Home Ko-fi prompt with the correct destination', () => {
  assert.match(page, /If you find Over My Home useful,/);
  assert.match(page, />Support it on Ko-fi<\/a>\s*<\/p>/);
  assert.match(page, /href="https:\/\/ko-fi\.com\/lirava"/);
  assert.equal((page.match(/https:\/\/ko-fi\.com\/lirava/g) ?? []).length, 1);
  assert.doesNotMatch(page, /ko-fi\.com\/merrindream/i);
});

test('opens Ko-fi safely in a new tab without replacing the aircraft view', () => {
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="external noopener noreferrer"/);
});

test('loads a bounded responsive support style and retains attribution', () => {
  assert.match(page, /href="\/support\.css"/);
  assert.match(page, /class="data-attribution"/);
  assert.match(styles, /\.support-prompt\s*\{/);
  assert.match(styles, /\.support-link\s*\{/);
  assert.match(styles, /\.data-attribution\s*\{/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /flex-direction: column/);
});
