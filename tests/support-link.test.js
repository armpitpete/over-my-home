import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../support.css', import.meta.url), 'utf8');

test('shows a clear Ko-fi support prompt in the footer', () => {
  assert.match(page, /If you find Over My Home useful,/);
  assert.match(page, />Support it on Ko-fi<\/a>\s*<\/p>/);
  assert.doesNotMatch(page, /opens in a new tab/);
  assert.doesNotMatch(page, /Support it on Ko-fi<\/a>\./);
  assert.match(page, /href="https:\/\/ko-fi\.com\/merrindream"/);
});

test('opens Ko-fi safely in a new tab without replacing the aircraft view', () => {
  assert.match(page, /target="_blank"/);
  assert.match(page, /rel="external noopener noreferrer"/);
});

test('loads a bounded responsive support style', () => {
  assert.match(page, /href="\/support\.css"/);
  assert.match(styles, /\.support-prompt\s*\{/);
  assert.doesNotMatch(styles, /\.new-tab-note/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /flex-direction: column/);
});