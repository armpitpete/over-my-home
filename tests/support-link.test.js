import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const styles = await readFile(new URL('../support.css', import.meta.url), 'utf8');

test('does not present a cross-project Ko-fi destination as Over My Home support', () => {
  assert.doesNotMatch(page, /ko-fi\.com/i);
  assert.doesNotMatch(page, /class="support-link"/);
  assert.doesNotMatch(page, /If you find Over My Home useful,/);
  assert.doesNotMatch(page, /Support it on Ko-fi/);
});

test('retains the footer data attribution and its bounded style', () => {
  assert.match(page, /href="\/support\.css"/);
  assert.match(page, /class="data-attribution"/);
  assert.match(styles, /\.data-attribution\s*\{/);
  assert.match(styles, /margin:\s*0/);
  assert.doesNotMatch(styles, /\.support-prompt\s*\{/);
  assert.doesNotMatch(styles, /\.support-link\s*\{/);
});
