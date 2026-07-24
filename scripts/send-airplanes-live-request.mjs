import { mkdir, readFile, writeFile } from 'node:fs/promises';

const REPORT_PATH = 'contact-submission/report.json';
const CONTACT_PAGE_URL = 'https://store.airplanes.live/pages/contact';
const CONTACT_POST_URL = 'https://store.airplanes.live/contact';
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

const report = {
  contactUrl: CONTACT_PAGE_URL,
  submitUrl: CONTACT_POST_URL,
  senderName: APPROVED_SENDER,
  senderEmail: APPROVED_EMAIL,
  startedAt: new Date().toISOString(),
};

try {
  const form = new URLSearchParams();
  form.set('form_type', 'contact');
  form.set('utf8', '✓');
  form.set('contact[name]', APPROVED_SENDER);
  form.set('contact[email]', APPROVED_EMAIL);
  form.set('contact[subject]', 'Contributor API access request — Over My Home');
  form.set('contact[body]', message);

  const response = await fetch(CONTACT_POST_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (compatible; OverMyHome/1.0; +https://over-my-home.pages.dev)',
      Referer: CONTACT_PAGE_URL,
      Origin: 'https://store.airplanes.live',
    },
    body: form,
  });

  const bodyText = await response.text();
  const confirmationPatterns = [
    /thanks for contacting us/i,
    /thank you for contacting us/i,
    /your message has been sent/i,
    /we'll get back to you/i,
    /we will get back to you/i,
    /contact form submitted successfully/i,
  ];
  const confirmed = confirmationPatterns.some((pattern) => pattern.test(bodyText));
  const challenged = /captcha|challenge|verify you are human|human verification/i.test(bodyText);

  report.httpStatus = response.status;
  report.finalUrl = response.url;
  report.responseLength = bodyText.length;

  if (!response.ok || !confirmed || challenged) {
    throw new Error(challenged
      ? 'The contact endpoint presented a human-verification challenge.'
      : `The contact endpoint did not confirm submission (HTTP ${response.status}).`);
  }

  report.status = 'submitted';
  report.completedAt = new Date().toISOString();
  report.confirmation = bodyText
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .find((line) => confirmationPatterns.some((pattern) => pattern.test(line))) || 'Submission confirmation returned.';
} catch (error) {
  report.status = 'failed';
  report.completedAt = new Date().toISOString();
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  process.exitCode = 1;
} finally {
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
