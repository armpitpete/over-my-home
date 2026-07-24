import { mkdir, writeFile } from 'node:fs/promises';

const REPORT_PATH = 'contact-submission/report.json';
const SOURCE_URL = 'https://airplanes.live/commercial-use/';

await mkdir('contact-submission', { recursive: true });

const report = {
  sourceUrl: SOURCE_URL,
  senderName: 'Merrin W. Dream',
  senderEmail: 'merrin@merrinworld.uk',
  startedAt: new Date().toISOString(),
};

try {
  const response = await fetch(SOURCE_URL, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Mozilla/5.0 (compatible; OverMyHome/1.0; +https://over-my-home.pages.dev)',
    },
  });
  const html = await response.text();
  const encoded = [...html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)].map((match) => match[1]);
  const decoded = encoded.map(decodeCloudflareEmail);
  const officialEmails = decoded.filter((address) => /@airplanes\.live$/i.test(address));

  report.httpStatus = response.status;
  report.discoveredEmails = officialEmails;
  report.completedAt = new Date().toISOString();

  if (!response.ok || officialEmails.length === 0) {
    throw new Error(`No official Airplanes.live email was found (HTTP ${response.status}).`);
  }

  report.status = 'email-discovered';
  report.recipient = officialEmails[0];
} catch (error) {
  report.status = 'failed';
  report.completedAt = new Date().toISOString();
  report.error = error instanceof Error ? error.stack || error.message : String(error);
  process.exitCode = 1;
} finally {
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));

function decodeCloudflareEmail(encoded) {
  const key = Number.parseInt(encoded.slice(0, 2), 16);
  let value = '';
  for (let index = 2; index < encoded.length; index += 2) {
    value += String.fromCharCode(Number.parseInt(encoded.slice(index, index + 2), 16) ^ key);
  }
  return value;
}
