import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { onRequest } from '../functions/sitemap-index.xml.js';

const publicUrl = 'https://over-my-home.pages.dev/';
const robots = await readFile(new URL('../robots.txt', import.meta.url), 'utf8');
const sitemap = await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8');

test('robots policy indexes the homepage and excludes the operational API', () => {
  assert.equal(
    robots,
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      `Sitemap: ${publicUrl}sitemap.xml`,
      '',
    ].join('\n'),
  );
});

test('sitemap contains only the public homepage', () => {
  assert.equal(
    sitemap,
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <url>',
      `    <loc>${publicUrl}</loc>`,
      '  </url>',
      '</urlset>',
      '',
    ].join('\n'),
  );
  assert.equal((sitemap.match(/<url>/g) ?? []).length, 1);
  assert.doesNotMatch(sitemap, /\/api\//);
});

test('the absent sitemap index returns a targeted plain-text 404', async () => {
  const response = onRequest();

  assert.equal(response.status, 404);
  assert.equal(response.headers.get('content-type'), 'text/plain; charset=utf-8');
  assert.equal(response.headers.get('location'), null);
  assert.equal(await response.text(), 'Not Found\n');
});

test('the repair does not introduce a global Pages 404 override', async () => {
  await assert.rejects(
    readFile(new URL('../404.html', import.meta.url), 'utf8'),
    (error) => error?.code === 'ENOENT',
  );
});
