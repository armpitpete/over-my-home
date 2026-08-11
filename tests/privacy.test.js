import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const locationInput = html.match(/<input[\s\S]*?id="postcode"[\s\S]*?>/)?.[0] || '';

test('location input has no location-like default value', () => {
  assert.ok(locationInput, 'location input should exist');
  assert.match(locationInput, /placeholder="Enter a postcode, ZIP code, town or place"/);
  assert.match(locationInput, /autocomplete="off"/);
  assert.match(locationInput, /maxlength="120"/);
  assert.doesNotMatch(locationInput, /\svalue=/);
  assert.doesNotMatch(locationInput, /placeholder="[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}"/);
});

test('worldwide location privacy boundary is visible', () => {
  assert.match(html, /saved only in this browser/);
  assert.match(html, /cached at the edge for up to 24 hours/);
  assert.match(html, /OpenStreetMap contributors/);
});
