import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const LIVE_URL = (process.env.LIVE_URL || 'https://over-my-home.pages.dev').replace(/\/$/, '');
const POSTCODE = process.env.ACCEPTANCE_POSTCODE || 'YO32 9QU';
const RANGE_KM = '30';
const OUTPUT_DIR = 'live-acceptance-artifacts';
const report = {
  liveUrl: LIVE_URL,
  postcode: POSTCODE,
  startedAt: new Date().toISOString(),
  deployment: {},
  api: {},
  viewports: [],
  deterministic: {},
};

await mkdir(OUTPUT_DIR, { recursive: true });

try {
  await waitForProductionDeployment();
  report.api = await inspectLiveApi();

  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1020, height: 900 },
    ]) {
      report.viewports.push(await inspectLiveViewport(browser, viewport));
    }

    report.deterministic.soundTransition = await verifyDeployedSoundTransition(browser);
    report.deterministic.zeroAircraft = await verifyDeployedZeroState(browser);
  } finally {
    await browser.close();
  }

  report.completedAt = new Date().toISOString();
  report.status = 'passed';
  await saveReport();
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.completedAt = new Date().toISOString();
  report.status = 'failed';
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await saveReport();
  console.error(report.error);
  process.exitCode = 1;
}

async function waitForProductionDeployment() {
  const attempts = 20;
  let lastStatus = 0;
  let lastMarker = '';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(`${LIVE_URL}/?acceptance=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache', Accept: 'text/html' },
    });
    const html = await response.text();
    lastStatus = response.status;
    lastMarker = html.includes('Radar range') ? 'Radar range' : 'old or incomplete page';

    if (
      response.ok &&
      html.includes('<label for="range">Radar range</label>') &&
      html.includes('Support it on Ko-fi') &&
      !html.includes('(opens in a new tab)')
    ) {
      report.deployment = {
        status: response.status,
        attempts: attempt,
        radarRangeCopy: true,
        supportCopy: true,
      };
      return;
    }

    if (attempt < attempts) await delay(15_000);
  }

  throw new Error(
    `Production did not expose the merged Stage One page after ${attempts} attempts; HTTP ${lastStatus}, marker: ${lastMarker}.`,
  );
}

async function inspectLiveApi() {
  const url = new URL('/api/aircraft', LIVE_URL);
  url.searchParams.set('postcode', POSTCODE);
  url.searchParams.set('range', RANGE_KM);

  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  const body = await response.json().catch(() => ({}));

  assert.equal(response.ok, true, `Live aircraft API failed with HTTP ${response.status}: ${body.error || 'unknown error'}`);
  assert.ok(Array.isArray(body.aircraft), 'Live aircraft API did not return an aircraft array.');
  assert.equal(body.rangeKm, Number(RANGE_KM));
  assert.ok(body.location?.postcode, 'Live aircraft API did not return a postcode.');
  assert.ok(body.generatedAt, 'Live aircraft API did not return a generatedAt timestamp.');

  const ranks = body.aircraft.map((aircraft) => audibilityRank(aircraft.audibility));
  assert.equal(isNonDecreasing(ranks), true, 'Live API aircraft are not ordered by sound likelihood.');
  for (let index = 1; index < body.aircraft.length; index += 1) {
    const previous = body.aircraft[index - 1];
    const current = body.aircraft[index];
    if (audibilityRank(previous.audibility) === audibilityRank(current.audibility)) {
      assert.ok(
        Number(previous.slantDistanceKm) <= Number(current.slantDistanceKm),
        'Aircraft within a sound-likelihood group are not ordered by distance.',
      );
    }
  }

  return {
    status: response.status,
    aircraftCount: body.aircraft.length,
    generatedAt: body.generatedAt,
    location: body.location,
    cache: response.headers.get('x-over-my-home-cache'),
    soundStates: body.aircraft.reduce((counts, aircraft) => {
      counts[aircraft.audibility] = (counts[aircraft.audibility] || 0) + 1;
      return counts;
    }, {}),
  };
}

async function inspectLiveViewport(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    const result = await searchProductionPage(page);
    assert.deepEqual(pageErrors, [], `Browser errors at ${viewport.name}: ${pageErrors.join('; ')}`);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.ok(overflow <= 1, `${viewport.name} has ${overflow}px horizontal overflow.`);

    const legendSamples = await page.locator('.radar-legend svg').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    assert.ok(legendSamples.length >= 3, 'Radar legend samples are missing.');
    for (const sample of legendSamples) {
      assert.ok(sample.width <= 40 && sample.height <= 40, `Oversized legend sample: ${JSON.stringify(sample)}`);
    }

    const radarBox = await page.locator('#sky-radar').boundingBox();
    assert.ok(radarBox, `${viewport.name} radar is not visible.`);
    assert.ok(radarBox.width > 250, `${viewport.name} radar is too small.`);
    assert.ok(radarBox.width <= viewport.width, `${viewport.name} radar exceeds the viewport.`);

    const support = page.locator('.support-link');
    assert.equal(await support.getAttribute('href'), 'https://ko-fi.com/merrindream');
    assert.equal(await support.getAttribute('target'), '_blank');
    assert.match(await support.getAttribute('rel') || '', /noopener/);
    assert.equal(await support.textContent(), 'Support it on Ko-fi');
    assert.equal(await page.locator('.new-tab-note').count(), 0);

    const supportDirection = await page.locator('.support-prompt').evaluate(
      (node) => getComputedStyle(node).flexDirection,
    );
    assert.equal(supportDirection, viewport.width <= 600 ? 'column' : 'row');

    const cardCount = await page.locator('.aircraft-card').count();
    assert.equal(cardCount, result.aircraft.length, `${viewport.name} card count does not match its API response.`);

    const viewportResult = {
      ...viewport,
      aircraftCount: cardCount,
      overflow,
      supportDirection,
      legendSamples,
      zeroState: cardCount === 0,
      motion: { checked: false },
      labelOverlapCount: 0,
    };

    if (cardCount === 0) {
      assert.equal(await page.locator('#radar-empty').textContent(), 'No aircraft in range.');
      assert.equal(await page.locator('#empty-state').isVisible(), true);
    } else {
      await verifySoundCardsAndOrdering(page);
      viewportResult.labelOverlapCount = await verifyLiveLabelPlacement(page, radarBox);
      viewportResult.motion = await verifyLiveMotion(page, result.aircraft);
    }

    await page.screenshot({
      path: `${OUTPUT_DIR}/${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    });

    return viewportResult;
  } finally {
    await context.close();
  }
}

async function searchProductionPage(page) {
  await page.goto(`${LIVE_URL}/?acceptance=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  assert.equal(await page.locator('label[for="range"]').textContent(), 'Radar range');
  assert.equal(await page.getByText('Modelled hearing distance').count(), 0);

  await page.locator('#range').evaluate((element, value) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, RANGE_KM);
  await page.locator('#postcode').fill(POSTCODE);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/aircraft?') && response.request().method() === 'GET',
    { timeout: 60_000 },
  );
  await page.getByRole('button', { name: 'Show aircraft' }).click();
  const response = await responsePromise;
  const body = await response.json();
  assert.equal(response.ok(), true, `Production browser API failed with HTTP ${response.status()}: ${body.error || ''}`);
  await page.locator('#status').waitFor({ state: 'visible' });
  await page.waitForFunction(() => /\d+ aircraft detected/.test(document.querySelector('#status')?.textContent || ''));
  await page.waitForTimeout(300);
  return body;
}

async function verifySoundCardsAndOrdering(page) {
  const cards = page.locator('.aircraft-card');
  const count = await cards.count();
  const ranks = [];

  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const reason = (await card.locator('.audibility-reason-text').textContent())?.trim();
    assert.ok(reason, `Aircraft card ${index + 1} has no sound-estimate reason.`);

    const badge = (await card.locator('.audibility-badge').textContent())?.trim();
    ranks.push(audibilityLabelRank(badge));

    const id = await card.getAttribute('data-aircraft-id');
    const target = page.locator(`.radar-target[data-aircraft-id="${cssEscape(id || '')}"]`);
    if (await target.count()) {
      const className = await target.getAttribute('class') || '';
      assert.ok(className.includes(audibilityClassFromLabel(badge)), `Radar and card sound states disagree for ${id}.`);
    }
  }

  assert.equal(isNonDecreasing(ranks), true, 'Displayed aircraft cards are not ordered by sound likelihood.');
}

async function verifyLiveLabelPlacement(page, radarBox) {
  await page.waitForTimeout(250);
  const boxes = await page.locator('.radar-target-label').evaluateAll((nodes) =>
    nodes
      .filter((node) => getComputedStyle(node).display !== 'none')
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      }),
  );

  for (const box of boxes) {
    assert.ok(box.left >= radarBox.x - 2, 'An aircraft label escapes the radar on the left.');
    assert.ok(box.right <= radarBox.x + radarBox.width + 2, 'An aircraft label escapes the radar on the right.');
    assert.ok(box.top >= radarBox.y - 2, 'An aircraft label escapes the radar at the top.');
    assert.ok(box.bottom <= radarBox.y + radarBox.height + 2, 'An aircraft label escapes the radar at the bottom.');
  }

  let overlaps = 0;
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      if (intersectionArea(boxes[first], boxes[second]) > 1) overlaps += 1;
    }
  }
  assert.equal(overlaps, 0, `${overlaps} aircraft-label collisions remain on the live radar.`);
  return overlaps;
}

async function verifyLiveMotion(page, aircraft) {
  const moving = aircraft.find(
    (item) => item.icao24 && Number(item.speedKnots) > 0 && Number.isFinite(Number(item.trackDegrees)),
  );
  if (!moving) return { checked: false, reason: 'No aircraft with usable speed and track.' };

  const target = page.locator(`.radar-target[data-aircraft-id="${cssEscape(moving.icao24)}"]`);
  const card = page.locator(`.aircraft-card[data-aircraft-id="${cssEscape(moving.icao24)}"]`);
  if (!(await target.count()) || !(await card.count())) {
    return { checked: false, reason: 'Moving aircraft was not rendered with a stable identifier.' };
  }

  const beforeTransform = await target.getAttribute('transform');
  const beforeAge = await card.locator('.fact-age').textContent();
  await page.waitForTimeout(2_200);
  const afterTransform = await target.getAttribute('transform');
  const afterAge = await card.locator('.fact-age').textContent();

  assert.notEqual(afterTransform, beforeTransform, 'A live moving aircraft did not move between correction updates.');
  assert.notEqual(afterAge, beforeAge, 'A live aircraft position age did not update.');
  return { checked: true, aircraft: moving.icao24, beforeTransform, afterTransform, beforeAge, afterAge };
}

async function verifyDeployedSoundTransition(browser) {
  const context = await browser.newContext({ viewport: { width: 1020, height: 900 } });
  const page = await context.newPage();
  const fixture = aircraftFixture();

  await page.route('**/api/aircraft**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        location: { postcode: POSTCODE, area: 'York' },
        rangeKm: 30,
        aircraft: [fixture],
        source: { provider: 'Airplanes.live', refreshSeconds: 180 },
      }),
    });
  });

  try {
    await page.goto(`${LIVE_URL}/?acceptance-transition=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#postcode').fill(POSTCODE);
    await page.getByRole('button', { name: 'Show aircraft' }).click();

    const target = page.locator('.radar-target[data-aircraft-id="accept1"]');
    const card = page.locator('.aircraft-card[data-aircraft-id="accept1"]');
    await target.waitFor();
    assert.match(await target.getAttribute('class') || '', /possible/);
    assert.equal(await card.locator('.audibility-badge').textContent(), 'Possibly audible');

    const beforeTransform = await target.getAttribute('transform');
    const beforeDistance = await card.locator('.fact-distance').textContent();
    await page.waitForFunction(() => document.querySelector('.radar-target[data-aircraft-id="accept1"]')?.classList.contains('likely'), null, { timeout: 7_000 });

    assert.equal(await card.locator('.audibility-badge').textContent(), 'Likely audible');
    assert.notEqual(await target.getAttribute('transform'), beforeTransform);
    assert.notEqual(await card.locator('.fact-distance').textContent(), beforeDistance);
    assert.match(await card.locator('.audibility-reason-text').textContent() || '', /Light aircraft/);

    await page.screenshot({ path: `${OUTPUT_DIR}/sound-transition.png`, fullPage: true, animations: 'disabled' });
    return { passed: true, beforeTransform, afterTransform: await target.getAttribute('transform') };
  } finally {
    await context.close();
  }
}

async function verifyDeployedZeroState(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route('**/api/aircraft**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        location: { postcode: POSTCODE, area: 'York' },
        rangeKm: 30,
        aircraft: [],
        source: { provider: 'Airplanes.live', refreshSeconds: 180 },
      }),
    });
  });

  try {
    await page.goto(`${LIVE_URL}/?acceptance-empty=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#postcode').fill(POSTCODE);
    await page.getByRole('button', { name: 'Show aircraft' }).click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === '0 aircraft detected');
    assert.equal(await page.locator('#radar-empty').textContent(), 'No aircraft in range.');
    assert.equal(await page.locator('#empty-state').isVisible(), true);
    await page.screenshot({ path: `${OUTPUT_DIR}/zero-aircraft.png`, fullPage: true, animations: 'disabled' });
    return { passed: true };
  } finally {
    await context.close();
  }
}

function aircraftFixture() {
  return {
    icao24: 'accept1',
    callsign: 'TEST01',
    registration: 'G-TEST',
    typeCode: 'C172',
    description: 'CESSNA 172',
    latitude: 53.98,
    longitude: -1.02,
    altitudeFt: 0,
    horizontalDistanceKm: 8.2,
    slantDistanceKm: 8.2,
    bearingDegrees: 90,
    bearingLabel: 'E',
    speedKnots: 600,
    trackDegrees: 270,
    verticalRateFpm: 0,
    positionAgeSeconds: 0,
    motionLabel: 'Approaching',
    category: 'A1',
    categoryLabel: 'Light aircraft',
    source: 'adsb_icao',
    sourceLabel: 'ADS-B',
    military: false,
    audibility: 'possible',
  };
}

function audibilityRank(value) {
  return { likely: 0, possible: 1, unlikely: 2 }[String(value || '').toLowerCase()] ?? 2;
}

function audibilityLabelRank(value) {
  return { 'Likely audible': 0, 'Possibly audible': 1, 'Unlikely audible': 2 }[String(value || '').trim()] ?? 2;
}

function audibilityClassFromLabel(value) {
  return { 'Likely audible': 'likely', 'Possibly audible': 'possible', 'Unlikely audible': 'unlikely' }[String(value || '').trim()] || 'unlikely';
}

function isNonDecreasing(values) {
  return values.every((value, index) => index === 0 || values[index - 1] <= value);
}

function intersectionArea(first, second) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}

function cssEscape(value) {
  return String(value).replace(/(["\\])/g, '\\$1');
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function saveReport() {
  await writeFile(`${OUTPUT_DIR}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
