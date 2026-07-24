import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const postcodeInput = html.match(/<input[\s\S]*?id="postcode"[\s\S]*?>/)?.[0] || '';

test('postcode input has no location-like default value', () => {
  assert.ok(postcodeInput, 'postcode input should exist');
  assert.match(postcodeInput, /placeholder="Enter a UK postcode"/);
  assert.match(postcodeInput, /autocomplete="off"/);
  assert.doesNotMatch(postcodeInput, /\svalue=/);
  assert.doesNotMatch(postcodeInput, /placeholder="[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}"/);
});
