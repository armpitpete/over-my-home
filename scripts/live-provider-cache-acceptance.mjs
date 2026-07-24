import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const LIVE_URL = (process.env.LIVE_URL || 'https://over-my-home.pages.dev').replace(/\/$/, '');
const REPORT_PATH = 'live-acceptance-artifacts/report.json';
const POSTCODES = ['YO32 9QU', 'YO32 9QX'];

const report = JSON.parse(await readFile(REPORT_PATH, 'utf8'));

try {
  const result = await waitForSharedTileDeployment();
  report.providerCache = { status: 'passed', ...result };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.providerCache, null, 2));
} catch (error) {
  report.providerCache = {
    status: 'failed',
    error: error instanceof Error ? error.stack || error.message : String(error),
  };
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.error(report.providerCache.error);
  process.exitCode = 1;
}

async function waitForSharedTileDeployment() {
  let lastObservation = null;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const first = await requestAircraft(POSTCODES[0], 18);
    const second = await requestAircraft(POSTCODES[1], 30);

    lastObservation = {
      attempt,
      firstHeader: first.cacheHeader,
      secondHeader: second.cacheHeader,
      firstTileId: first.body.source?.tileId || null,
      secondTileId: second.body.source?.tileId || null,
      refreshSeconds: first.body.source?.refreshSeconds || null,
      firstStale: first.body.source?.stale,
      secondStale: second.body.source?.stale,
      firstAircraftCount: first.body.aircraft?.length ?? null,
      secondAircraftCount: second.body.aircraft?.length ?? null,
    };

    if (first.body.source?.tileId && second.body.source?.tileId) {
      assert.equal(first.body.source.tileId, second.body.source.tileId, 'Nearby postcodes did not share one tile.');
      assert.equal(first.body.source.refreshSeconds, 300, 'Production does not expose the five-minute tile refresh.');
      assert.equal(second.body.source.refreshSeconds, 300, 'Production does not expose the five-minute tile refresh.');
      assert.equal(first.body.source.stale, false, 'The first live response unexpectedly used stale data.');
      assert.equal(second.body.source.stale, false, 'The second live response unexpectedly used stale data.');
      assert.equal(second.cacheHeader, 'HIT', 'The nearby second postcode did not reuse the shared tile cache.');
      return lastObservation;
    }

    if (attempt < 20) await delay(15_000);
  }

  throw new Error(`Production did not expose the shared tile cache contract: ${JSON.stringify(lastObservation)}`);
}

async function requestAircraft(postcode, range) {
  const url = new URL('/api/aircraft', LIVE_URL);
  url.searchParams.set('postcode', postcode);
  url.searchParams.set('range', String(range));
  url.searchParams.set('acceptance', String(Date.now()));

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `Production API failed with HTTP ${response.status}: ${body.error || 'unknown error'}`);
  return {
    body,
    cacheHeader: response.headers.get('x-over-my-home-cache'),
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
