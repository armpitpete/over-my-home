import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const LIVE_URL = (process.env.LIVE_URL || 'https://over-my-home.pages.dev').replace(/\/$/, '');
const REPORT_PATH = 'live-acceptance-artifacts/report.json';
const PRIMARY_POSTCODE = 'YO32 9QU';
const NEARBY_POSTCODES = ['YO32 9QW', 'YO32 9QR', 'YO32 9QS', 'YO32 9QT', 'YO32 9QZ', 'YO32 9QX'];

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
    const first = await requestAircraft(PRIMARY_POSTCODE, 18);
    const firstTileId = first.body.source?.tileId || null;

    if (firstTileId) {
      const candidateObservations = [];
      for (const postcode of NEARBY_POSTCODES) {
        const candidate = await requestAircraft(postcode, 30, true);
        if (!candidate) continue;
        const candidateTileId = candidate.body.source?.tileId || null;
        candidateObservations.push({ postcode, tileId: candidateTileId, cacheHeader: candidate.cacheHeader });

        if (candidateTileId === firstTileId) {
          assert.equal(first.body.source.refreshSeconds, 300, 'Production does not expose the five-minute tile refresh.');
          assert.equal(candidate.body.source.refreshSeconds, 300, 'Production does not expose the five-minute tile refresh.');
          assert.equal(first.body.source.stale, false, 'The first live response unexpectedly used stale data.');
          assert.equal(candidate.body.source.stale, false, 'The nearby live response unexpectedly used stale data.');
          assert.equal(candidate.cacheHeader, 'HIT', 'The nearby postcode did not reuse the shared tile cache.');

          return {
            attempt,
            primaryPostcode: PRIMARY_POSTCODE,
            nearbyPostcode: postcode,
            firstHeader: first.cacheHeader,
            secondHeader: candidate.cacheHeader,
            tileId: firstTileId,
            refreshSeconds: first.body.source.refreshSeconds,
            firstStale: first.body.source.stale,
            secondStale: candidate.body.source.stale,
            firstAircraftCount: first.body.aircraft?.length ?? null,
            secondAircraftCount: candidate.body.aircraft?.length ?? null,
          };
        }
      }

      lastObservation = { attempt, firstTileId, candidateObservations };
      throw new Error(`No distinct nearby acceptance postcode was inside tile ${firstTileId}: ${JSON.stringify(candidateObservations)}`);
    }

    lastObservation = { attempt, firstTileId };
    if (attempt < 20) await delay(15_000);
  }

  throw new Error(`Production did not expose the shared tile cache contract: ${JSON.stringify(lastObservation)}`);
}

async function requestAircraft(postcode, range, allowNotFound = false) {
  const url = new URL('/api/aircraft', LIVE_URL);
  url.searchParams.set('postcode', postcode);
  url.searchParams.set('range', String(range));
  url.searchParams.set('acceptance', String(Date.now()));

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  const body = await response.json().catch(() => ({}));
  if (allowNotFound && response.status === 404) return null;
  assert.equal(response.ok, true, `Production API failed with HTTP ${response.status}: ${body.error || 'unknown error'}`);
  return {
    body,
    cacheHeader: response.headers.get('x-over-my-home-cache'),
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
