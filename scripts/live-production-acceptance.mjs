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
  await waitForDeployment();
  report.api = await inspectApi();

  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [
      { name: 'mobile', width: 390, height: 844 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1020, height: 900 },
    ]) {
      report.viewports.push(await inspectViewport(browser, viewport));
    }
    report.deterministic.soundTransition = await verifySoundTransition(browser);
    report.deterministic.zeroAircraft = await verifyZeroAircraft(browser);
  } finally {
    await browser.close();
  }

  report.status = 'passed';
  report.completedAt = new Date().toISOString();
  await saveReport();
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.status = 'failed';
  report.completedAt = new Date().toISOString();
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  await saveReport();
  console.error(report.error);
  process.exitCode = 1;
}

async function waitForDeployment() {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const response = await fetch(`${LIVE_URL}/?acceptance=${Date.now()}`, {
      headers: { Accept: 'text/html', 'Cache-Control': 'no-cache' },
    });
    const html = await response.text();
    if (
      response.ok &&
      html.includes('<label for="range">Radar range</label>') &&
      html.includes('Support it on Ko-fi') &&
      !html.includes('(opens in a new tab)')
    ) {
      report.deployment = { status: response.status, attempts: attempt };
      return;
    }
    if (attempt < 20) await delay(15_000);
  }
  throw new Error('Production did not expose the merged Stage One page within five minutes.');
}

async function inspectApi() {
  const url = new URL('/api/aircraft', LIVE_URL);
  url.searchParams.set('postcode', POSTCODE);
  url.searchParams.set('range', RANGE_KM);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = await response.json().catch(() => ({}));

  assert.equal(response.ok, true, `Live API failed with HTTP ${response.status}: ${body.error || 'unknown error'}`);
  assert.ok(Array.isArray(body.aircraft), 'Live API did not return an aircraft array.');
  assert.equal(body.rangeKm, Number(RANGE_KM));
  assert.ok(body.generatedAt, 'Live API omitted generatedAt.');
  assert.ok(body.location?.postcode, 'Live API omitted its location.');
  assertSoundOrder(body.aircraft);

  return {
    status: response.status,
    aircraftCount: body.aircraft.length,
    generatedAt: body.generatedAt,
    location: body.location,
    cache: response.headers.get('x-over-my-home-cache'),
    soundStates: body.aircraft.reduce((counts, item) => {
      counts[item.audibility] = (counts[item.audibility] || 0) + 1;
      return counts;
    }, {}),
  };
}

async function inspectViewport(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    const data = await search(page);
    assert.deepEqual(pageErrors, [], `${viewport.name} browser errors: ${pageErrors.join('; ')}`);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.ok(overflow <= 1, `${viewport.name} has ${overflow}px horizontal overflow.`);

    const legend = await inspectLegend(page);
    const radarBox = await page.locator('#sky-radar').boundingBox();
    assert.ok(radarBox, `${viewport.name} radar is not visible.`);
    assert.ok(radarBox.width > 250, `${viewport.name} radar is too small.`);
    assert.ok(radarBox.width <= viewport.width, `${viewport.name} radar exceeds the viewport.`);

    const support = page.locator('.support-link');
    assert.equal((await support.textContent())?.trim(), 'Support it on Ko-fi');
    assert.equal(await support.getAttribute('href'), 'https://ko-fi.com/merrindream');
    assert.equal(await support.getAttribute('target'), '_blank');
    assert.match(await support.getAttribute('rel') || '', /noopener/);
    assert.equal(await page.locator('.new-tab-note').count(), 0);

    const supportDirection = await page.locator('.support-prompt').evaluate(
      (node) => getComputedStyle(node).flexDirection,
    );
    assert.equal(supportDirection, viewport.width <= 600 ? 'column' : 'row');

    const cardCount = await page.locator('.aircraft-card').count();
    assert.equal(cardCount, data.aircraft.length, `${viewport.name} card count differs from its API response.`);

    const result = {
      ...viewport,
      overflow,
      legend,
      supportDirection,
      aircraftCount: cardCount,
      zeroState: cardCount === 0,
      labelOverlapCount: 0,
      motion: { checked: false },
    };

    if (cardCount === 0) {
      assert.equal((await page.locator('#radar-empty').textContent())?.trim(), 'No aircraft in range.');
      assert.equal(await page.locator('#empty-state').isVisible(), true);
    } else {
      await verifyCards(page);
      result.labelOverlapCount = await verifyLabels(page, radarBox);
      result.motion = await verifyMotion(page, data.aircraft);
    }

    await page.screenshot({
      path: `${OUTPUT_DIR}/${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    return result;
  } finally {
    await context.close();
  }
}

async function inspectLegend(page) {
  const keyCount = await page.locator('.radar-key').count();
  const selector = keyCount ? '.radar-key' : '.radar-legend';
  const legend = page.locator(selector);
  assert.equal(await legend.count(), 1, 'No radar symbol key is present.');

  const itemSelector = keyCount ? `${selector} .radar-key-item` : `${selector} > span`;
  const itemCount = await page.locator(itemSelector).count();
  assert.ok(itemCount >= 6, `Radar key has only ${itemCount} explanatory items.`);

  const text = (await legend.textContent()) || '';
  for (const phrase of [
    'Aircraft',
    'likely audible',
    'possibly audible',
    'unlikely audible',
    'military',
    'MLAT',
  ]) {
    assert.match(text, new RegExp(phrase, 'i'), `Radar key is missing “${phrase}”.`);
  }

  const samples = await page.locator(
    `${selector} svg, ${selector} i, ${selector} .radar-key-badge`,
  ).evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height, tag: node.tagName, className: node.getAttribute('class') || '' };
  }));
  assert.ok(samples.length >= 6, `Radar key exposes only ${samples.length} visual samples.`);
  for (const sample of samples) {
    assert.ok(sample.width > 0 && sample.height > 0, `Invisible radar-key sample: ${JSON.stringify(sample)}`);
    const maxWidth = sample.className.includes('radar-key-badge') ? 48 : 40;
    assert.ok(sample.width <= maxWidth && sample.height <= 40, `Oversized radar-key sample: ${JSON.stringify(sample)}`);
  }

  return { selector, itemCount, samples };
}

async function search(page) {
  await page.goto(`${LIVE_URL}/?acceptance=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  assert.equal((await page.locator('label[for="range"]').textContent())?.trim(), 'Radar range');
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
  assert.equal(response.ok(), true, `Browser API failed with HTTP ${response.status()}: ${body.error || ''}`);
  await page.waitForFunction(() => /\d+ aircraft detected/.test(document.querySelector('#status')?.textContent || ''));
  await page.waitForTimeout(300);
  return body;
}

async function verifyCards(page) {
  const cards = page.locator('.aircraft-card');
  const ranks = [];
  for (let index = 0; index < await cards.count(); index += 1) {
    const card = cards.nth(index);
    const reason = (await card.locator('.audibility-reason-text').textContent())?.trim();
    assert.ok(reason, `Aircraft card ${index + 1} has no sound-estimate reason.`);

    const badge = (await card.locator('.audibility-badge').textContent())?.trim() || '';
    ranks.push(labelRank(badge));
    const id = await card.getAttribute('data-aircraft-id');
    if (id) {
      const target = page.locator(`.radar-target[data-aircraft-id="${escapeSelector(id)}"]`);
      if (await target.count()) {
        assert.match(await target.getAttribute('class') || '', new RegExp(stateFromLabel(badge)));
      }
    }
  }
  assert.equal(nonDecreasing(ranks), true, 'Displayed cards are not sorted by sound likelihood.');
}

async function verifyLabels(page, radarBox) {
  await page.waitForTimeout(250);
  const boxes = await page.locator('.radar-target-label').evaluateAll((nodes) => nodes
    .filter((node) => getComputedStyle(node).display !== 'none')
    .map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    }));

  for (const box of boxes) {
    assert.ok(box.left >= radarBox.x - 2 && box.right <= radarBox.x + radarBox.width + 2, 'A label escapes the radar horizontally.');
    assert.ok(box.top >= radarBox.y - 2 && box.bottom <= radarBox.y + radarBox.height + 2, 'A label escapes the radar vertically.');
  }

  let overlaps = 0;
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      if (intersectionArea(boxes[first], boxes[second]) > 1) overlaps += 1;
    }
  }
  assert.equal(overlaps, 0, `${overlaps} live radar-label collisions remain.`);
  return overlaps;
}

async function verifyMotion(page, aircraft) {
  const moving = aircraft.find((item) =>
    item.icao24 && Number(item.speedKnots) > 0 && Number.isFinite(Number(item.trackDegrees)));
  if (!moving) return { checked: false, reason: 'No aircraft with usable speed and track.' };

  const id = escapeSelector(moving.icao24);
  const target = page.locator(`.radar-target[data-aircraft-id="${id}"]`);
  const card = page.locator(`.aircraft-card[data-aircraft-id="${id}"]`);
  if (!(await target.count()) || !(await card.count())) {
    return { checked: false, reason: 'Moving aircraft lacks a stable rendered identifier.' };
  }

  const beforeTransform = await target.getAttribute('transform');
  const beforeAge = await card.locator('.fact-age').textContent();
  await page.waitForTimeout(2_200);
  const afterTransform = await target.getAttribute('transform');
  const afterAge = await card.locator('.fact-age').textContent();
  assert.notEqual(afterTransform, beforeTransform, 'A live moving aircraft did not move.');
  assert.notEqual(afterAge, beforeAge, 'A live aircraft position age did not update.');
  return { checked: true, aircraft: moving.icao24, beforeTransform, afterTransform, beforeAge, afterAge };
}

async function verifySoundTransition(browser) {
  const context = await browser.newContext({ viewport: { width: 1020, height: 900 } });
  const page = await context.newPage();
  await page.route('**/api/aircraft**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(responseBody([fixtureAircraft()])),
  }));

  try {
    await page.goto(`${LIVE_URL}/?acceptance-transition=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#postcode').fill(POSTCODE);
    await page.getByRole('button', { name: 'Show aircraft' }).click();
    const target = page.locator('.radar-target[data-aircraft-id="accept1"]');
    const card = page.locator('.aircraft-card[data-aircraft-id="accept1"]');
    await target.waitFor();
    assert.match(await target.getAttribute('class') || '', /possible/);
    assert.equal((await card.locator('.audibility-badge').textContent())?.trim(), 'Possibly audible');

    const beforeTransform = await target.getAttribute('transform');
    const beforeDistance = await card.locator('.fact-distance').textContent();
    await page.waitForFunction(
      () => document.querySelector('.radar-target[data-aircraft-id="accept1"]')?.classList.contains('likely'),
      null,
      { timeout: 8_000 },
    );
    assert.equal((await card.locator('.audibility-badge').textContent())?.trim(), 'Likely audible');
    assert.notEqual(await target.getAttribute('transform'), beforeTransform);
    assert.notEqual(await card.locator('.fact-distance').textContent(), beforeDistance);
    assert.match(await card.locator('.audibility-reason-text').textContent() || '', /Light aircraft/);
    await page.screenshot({ path: `${OUTPUT_DIR}/sound-transition.png`, fullPage: true, animations: 'disabled' });
    return { passed: true };
  } finally {
    await context.close();
  }
}

async function verifyZeroAircraft(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route('**/api/aircraft**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(responseBody([])),
  }));

  try {
    await page.goto(`${LIVE_URL}/?acceptance-empty=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#postcode').fill(POSTCODE);
    await page.getByRole('button', { name: 'Show aircraft' }).click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === '0 aircraft detected');
    assert.equal((await page.locator('#radar-empty').textContent())?.trim(), 'No aircraft in range.');
    assert.equal(await page.locator('#empty-state').isVisible(), true);
    await page.screenshot({ path: `${OUTPUT_DIR}/zero-aircraft.png`, fullPage: true, animations: 'disabled' });
    return { passed: true };
  } finally {
    await context.close();
  }
}

function responseBody(aircraft) {
  return {
    generatedAt: new Date().toISOString(),
    location: { postcode: POSTCODE, area: 'York' },
    rangeKm: 30,
    aircraft,
    source: { provider: 'Airplanes.live', refreshSeconds: 180 },
  };
}

function fixtureAircraft() {
  return {
    icao24: 'accept1', callsign: 'TEST01', registration: 'G-TEST', typeCode: 'C172',
    description: 'CESSNA 172', latitude: 53.98, longitude: -1.02, altitudeFt: 0,
    horizontalDistanceKm: 8.2, slantDistanceKm: 8.2, bearingDegrees: 90, bearingLabel: 'E',
    speedKnots: 600, trackDegrees: 270, verticalRateFpm: 0, positionAgeSeconds: 0,
    motionLabel: 'Approaching', category: 'A1', categoryLabel: 'Light aircraft',
    source: 'adsb_icao', sourceLabel: 'ADS-B', military: false, audibility: 'possible',
  };
}

function assertSoundOrder(aircraft) {
  const ranks = aircraft.map((item) => stateRank(item.audibility));
  assert.equal(nonDecreasing(ranks), true, 'Live API aircraft are not sorted by sound likelihood.');
  for (let index = 1; index < aircraft.length; index += 1) {
    const previous = aircraft[index - 1];
    const current = aircraft[index];
    if (stateRank(previous.audibility) === stateRank(current.audibility)) {
      assert.ok(Number(previous.slantDistanceKm) <= Number(current.slantDistanceKm), 'A sound group is not sorted by distance.');
    }
  }
}

function stateRank(value) {
  return { likely: 0, possible: 1, unlikely: 2 }[String(value || '').toLowerCase()] ?? 2;
}
function labelRank(value) {
  return { 'Likely audible': 0, 'Possibly audible': 1, 'Unlikely audible': 2 }[value] ?? 2;
}
function stateFromLabel(value) {
  return { 'Likely audible': 'likely', 'Possibly audible': 'possible', 'Unlikely audible': 'unlikely' }[value] || 'unlikely';
}
function nonDecreasing(values) {
  return values.every((value, index) => index === 0 || values[index - 1] <= value);
}
function intersectionArea(first, second) {
  return Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left)) *
    Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
}
function escapeSelector(value) {
  return String(value).replace(/(["\\])/g, '\\$1');
}
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function saveReport() {
  await writeFile(`${OUTPUT_DIR}/report.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
