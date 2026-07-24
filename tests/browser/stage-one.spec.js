import { test, expect } from '@playwright/test';

const POSTCODE = 'YO32 9QU';

function aircraftFixture(overrides = {}) {
  return {
    icao24: 'abc123',
    callsign: 'FAST01',
    registration: 'G-FAST',
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
    ...overrides,
  };
}

const crowdedAircraft = [
  aircraftFixture(),
  aircraftFixture({
    icao24: 'def456',
    callsign: 'GLIDE1',
    registration: 'G-GLID',
    typeCode: 'ASW20',
    description: 'GLIDER',
    altitudeFt: 1_000,
    horizontalDistanceKm: 8.35,
    slantDistanceKm: 8.36,
    bearingDegrees: 92,
    speedKnots: 55,
    trackDegrees: 180,
    verticalRateFpm: -100,
    motionLabel: 'Passing across',
    category: 'B1',
    categoryLabel: 'Glider',
    audibility: 'unlikely',
  }),
];

async function mockAircraftResponse(page, aircraft = crowdedAircraft) {
  await page.route('**/api/aircraft**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        location: { postcode: POSTCODE, area: 'York' },
        rangeKm: 18,
        aircraft,
        source: { provider: 'Airplanes.live', refreshSeconds: 180 },
      }),
    });
  });
}

async function search(page) {
  await page.goto('/');
  await page.locator('#postcode').fill(POSTCODE);
  await page.getByRole('button', { name: 'Show aircraft' }).click();
}

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1020, height: 900 },
]) {
  test(`${viewport.name} layout keeps the radar, key and cards usable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockAircraftResponse(page);
    await search(page);

    await expect(page.locator('.aircraft-card')).toHaveCount(2);
    await expect(page.locator('#status')).toHaveText('2 aircraft detected');
    await expect(page.locator('.support-link')).toHaveText('Support it on Ko-fi');
    await expect(page.locator('.new-tab-note')).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    const samples = await page.locator('.radar-legend svg').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    for (const sample of samples) {
      expect(sample.width).toBeLessThanOrEqual(40);
      expect(sample.height).toBeLessThanOrEqual(40);
    }

    const radarBox = await page.locator('#sky-radar').boundingBox();
    expect(radarBox).not.toBeNull();
    expect(radarBox.width).toBeGreaterThan(250);
    expect(radarBox.width).toBeLessThanOrEqual(viewport.width);

    await page.waitForTimeout(150);
    const labelBoxes = await page.locator('.radar-target-label').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      }),
    );
    const overlap = labelBoxes.length >= 2 && !(
      labelBoxes[0].right <= labelBoxes[1].left ||
      labelBoxes[1].right <= labelBoxes[0].left ||
      labelBoxes[0].bottom <= labelBoxes[1].top ||
      labelBoxes[1].bottom <= labelBoxes[0].top
    );
    expect(overlap).toBe(false);

    const supportDirection = await page.locator('.support-prompt').evaluate((node) => getComputedStyle(node).flexDirection);
    expect(supportDirection).toBe(viewport.width <= 600 ? 'column' : 'row');
  });
}

test('projected movement updates position, card values and sound state together', async ({ page }) => {
  await page.setViewportSize({ width: 1020, height: 900 });
  await mockAircraftResponse(page, [crowdedAircraft[0]]);
  await search(page);

  const target = page.locator('.radar-target[data-aircraft-id="abc123"]');
  const card = page.locator('.aircraft-card[data-aircraft-id="abc123"]');
  await expect(target).toHaveClass(/possible/);
  await expect(card.locator('.audibility-badge')).toHaveText('Possibly audible');

  const initialTransform = await target.getAttribute('transform');
  const initialDistance = await card.locator('.fact-distance').textContent();

  await expect(target).toHaveClass(/likely/, { timeout: 5_000 });
  await expect(card.locator('.audibility-badge')).toHaveText('Likely audible');
  await expect(card.locator('.fact-age')).toHaveText(/^[1-9]\d*s$/);

  const projectedTransform = await target.getAttribute('transform');
  const projectedDistance = await card.locator('.fact-distance').textContent();
  expect(projectedTransform).not.toBe(initialTransform);
  expect(projectedDistance).not.toBe(initialDistance);
});

test('zero aircraft shows both factual empty states', async ({ page }) => {
  await mockAircraftResponse(page, []);
  await search(page);

  await expect(page.locator('#status')).toHaveText('0 aircraft detected');
  await expect(page.locator('#radar-empty')).toHaveText('No aircraft in range.');
  await expect(page.locator('#empty-state')).toBeVisible();
  await expect(page.locator('#empty-state h3')).toHaveText('No aircraft in range right now');
});

test('Ko-fi keeps the current aircraft view open', async ({ page }) => {
  await mockAircraftResponse(page);
  await search(page);

  const support = page.locator('.support-link');
  await expect(support).toHaveAttribute('href', 'https://ko-fi.com/merrindream');
  await expect(support).toHaveAttribute('target', '_blank');
  await expect(support).toHaveAttribute('rel', /noopener/);
  await expect(support).toHaveText('Support it on Ko-fi');
});
