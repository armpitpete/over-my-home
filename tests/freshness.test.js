import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { aircraftStatusMessage, formatAge } from '../freshness.js';

const page = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const adapter = await readFile(new URL('../stale-response-status.js', import.meta.url), 'utf8');

test('keeps ordinary live-result wording unchanged', () => {
  assert.equal(
    aircraftStatusMessage({ aircraft: [{}, {}], source: { stale: false } }),
    '2 aircraft detected',
  );
});

test('labels stale aircraft with a clear age', () => {
  assert.equal(
    aircraftStatusMessage({
      aircraft: [{}],
      source: { stale: true, staleAgeSeconds: 430 },
    }),
    'Live update unavailable. Showing 1 aircraft from 7 minutes ago.',
  );
  assert.equal(formatAge(25), 'less than a minute');
  assert.equal(formatAge(60), '1 minute');
});

test('loads the stale-response adapter before the application', () => {
  const adapterPosition = page.indexOf('/stale-response-status.js');
  const appPosition = page.indexOf('/app.js');

  assert.ok(adapterPosition >= 0);
  assert.ok(appPosition > adapterPosition);
  assert.match(adapter, /requestUrl\.pathname !== '\/api\/aircraft'/);
  assert.match(adapter, /aircraftStatusMessage\(data\)/);
  assert.match(adapter, /window\.setTimeout/);
});
