import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const REPORT_PATH = 'contact-submission/report.json';
const CONTACT_URL = 'https://store.airplanes.live/pages/contact';
const APPROVED_SENDER = 'Merrin W. Dream';
const APPROVED_EMAIL = 'merrin@merrinworld.uk';

const message = `Contributor API access request — Over My Home

Hello Airplanes.live team,

I have built Over My Home, a free, non-commercial UK web app that helps people identify which nearby aircraft may be responsible for a sound above their home.

Live site: https://over-my-home.pages.dev
Repository: https://github.com/armpitpete/over-my-home

The project uses your documented point endpoint, visibly credits Airplanes.live and its volunteer receiver community, and does not sell or redistribute the data. Stage One is complete and has passed live browser acceptance on mobile, tablet and desktop.

To minimise requests, the production service groups nearby postcodes into fixed geographic tiles, shares each upstream response for five minutes, filters aircraft locally for the requested postcode and range, and retains a clearly labelled last-successful fallback for brief service interruptions. Browser refresh also pauses while the page is hidden.

Would Over My Home be eligible for contributor access, or is there another access arrangement you recommend for this kind of small public-interest project?

I am happy to provide further technical details or make changes that would reduce load on your service.

Thank you,

Merrin W. Dream`;

await mkdir('contact-submission', { recursive: true });

try {
  const existing = JSON.parse(await readFile(REPORT_PATH, 'utf8'));
  if (existing.status === 'submitted') {
    console.log('Request was already submitted; not submitting again.');
    process.exit(0);
  }
} catch {
  // No previous successful report.
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const report = {
  contactUrl: CONTACT_URL,
  senderName: APPROVED_SENDER,
  senderEmail: APPROVED_EMAIL,
  startedAt: new Date().toISOString(),
};

try {
  await page.goto(CONTACT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('form[action*="/contact"], form#ContactForm', {
    state: 'attached',
    timeout: 30_000,
  });

  const name = page.locator('#ContactForm-name:visible, input[name="contact[name]"]:visible').first();
  const email = page.locator('#ContactForm-email:visible, input[name="contact[email]"]:visible').first();
  const comment = page.locator('#ContactForm-body:visible, textarea[name="contact[body]"]:visible').first();

  await name.waitFor({ state: 'visible', timeout: 30_000 });
  await email.waitFor({ state: 'visible', timeout: 30_000 });
  await comment.waitFor({ state: 'visible', timeout: 30_000 });

  await name.fill(APPROVED_SENDER);
  await email.fill(APPROVED_EMAIL);
  await comment.fill(message);

  const form = page.locator('form#ContactForm, form[action*="/contact"]').filter({ has: comment }).first();
  await form.evaluate((element) => element.requestSubmit());

  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(3_000);

  const bodyText = await page.locator('body').innerText();
  const confirmationPatterns = [
    /thanks for contacting us/i,
    /thank you for contacting us/i,
    /your message has been sent/i,
    /we'll get back to you/i,
    /we will get back to you/i,
  ];
  const confirmed = confirmationPatterns.some((pattern) => pattern.test(bodyText));
  const challenged = /captcha|challenge|verify you are human|human verification/i.test(bodyText);

  await page.screenshot({ path: 'contact-submission/confirmation.png', fullPage: true });

  if (!confirmed || challenged) {
    throw new Error(challenged
      ? 'The contact form presented a human-verification challenge.'
      : 'The contact form did not display a recognised submission confirmation.');
  }

  report.status = 'submitted';
  report.completedAt = new Date().toISOString();
  report.finalUrl = page.url();
  report.confirmation = bodyText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => confirmationPatterns.some((pattern) => pattern.test(line))) || 'Submission confirmation displayed.';
} catch (error) {
  report.status = 'failed';
  report.completedAt = new Date().toISOString();
  report.finalUrl = page.url();
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  report.formCount = await page.locator('form').count().catch(() => 0);
  report.visibleInputs = await page.locator('input:visible, textarea:visible, button:visible').evaluateAll((elements) =>
    elements.slice(0, 30).map((element) => ({
      tag: element.tagName,
      id: element.id || null,
      name: element.getAttribute('name'),
      type: element.getAttribute('type'),
      text: element.textContent?.trim().slice(0, 100) || null,
    })),
  ).catch(() => []);
  await page.screenshot({ path: 'contact-submission/failure.png', fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
