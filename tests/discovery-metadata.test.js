import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const description =
  'See the live aircraft that may be audible above a UK postcode on a graphical local-sky radar.';
const publicUrl = 'https://over-my-home.pages.dev/';
const baselineBodySha256 =
  'a9ba5d77735ebdf102ebeef479161e2d9ef746121cc47c4baebee79ebe0f7775';

function head(document) {
  return document.split('<head>', 2)[1].split('</head>', 1)[0];
}

function body(document) {
  return document.split('<body>', 2)[1];
}

function count(source, fragment) {
  return source.split(fragment).length - 1;
}

test('exposes one complete public discovery identity', () => {
  const pageHead = head(html);
  const expected = [
    '<title>Over My Home</title>',
    `name="description"\n      content="${description}"`,
    `<link rel="canonical" href="${publicUrl}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Over My Home" />',
    '<meta property="og:title" content="Over My Home" />',
    `property="og:description"\n      content="${description}"`,
    `<meta property="og:url" content="${publicUrl}" />`,
    '<meta name="twitter:card" content="summary" />',
    '<meta name="twitter:title" content="Over My Home" />',
    `name="twitter:description"\n      content="${description}"`,
  ];

  for (const fragment of expected) {
    assert.equal(count(pageHead, fragment), 1, fragment);
  }
});

test('structured identity matches the accepted Over My Home contract', () => {
  const pageHead = head(html);
  const match = pageHead.match(
    /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/,
  );
  assert.ok(match, 'JSON-LD identity should exist');

  assert.deepEqual(JSON.parse(match[1]), {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Over My Home',
    url: publicUrl,
    description,
  });
});

test('metadata repair preserves the visible application body byte-for-byte', () => {
  const pageBody = body(html);
  assert.equal(
    createHash('sha256').update(pageBody, 'utf8').digest('hex'),
    baselineBodySha256,
  );
  assert.match(pageBody, /<script type="module" src="\/stale-response-status\.js"><\/script>/);
  assert.match(pageBody, /<script type="module" src="\/app\.js"><\/script>/);
  assert.match(pageBody, /<script type="module" src="\/radar-empty-state\.js"><\/script>/);
});

test('metadata repair does not alter indexing or crawler policy', () => {
  assert.equal(count(html, 'name="robots"'), 0);
  assert.doesNotMatch(html, /sitemap/i);
  assert.doesNotMatch(html, /robots\.txt/i);
});
