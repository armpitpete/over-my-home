const baseUrl = 'https://over-my-home.pages.dev';
const summary = {};

async function probe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    const body = await response.text();
    return {
      status: response.status,
      body,
      headers: {
        server: response.headers.get('server'),
        cfRay: response.headers.get('cf-ray'),
        etag: response.headers.get('etag'),
        overMyHomeCache: response.headers.get('x-over-my-home-cache'),
      },
    };
  } catch (error) {
    return { status: 0, body: '', headers: {}, error: error.message };
  }
}

const homepage = await probe(`${baseUrl}/`);
summary.homepage = {
  status: homepage.status,
  headers: homepage.headers,
  bytes: homepage.body.length,
  graphicalSky: homepage.body.includes('Graphical local sky'),
  airplanesLive: homepage.body.includes('Airplanes.live'),
  confirmedMilitary: homepage.body.includes('Confirmed military'),
  accessibleList: homepage.body.includes('id="aircraft-list"'),
  error: homepage.error,
};

const apiUrl = `${baseUrl}/api/aircraft?postcode=YO32%209QU&range=18`;
const api = await probe(apiUrl);
let payload = null;
try { payload = JSON.parse(api.body); } catch {}
summary.api = {
  status: api.status,
  headers: api.headers,
  provider: payload?.source?.provider,
  postcode: payload?.location?.postcode,
  rangeKm: payload?.rangeKm,
  aircraftCount: Array.isArray(payload?.aircraft) ? payload.aircraft.length : null,
  nonCommercial: payload?.source?.nonCommercial,
  refreshSeconds: payload?.source?.refreshSeconds,
  publicError: payload?.error,
  error: api.error,
};

const second = await probe(apiUrl);
summary.secondApi = {
  status: second.status,
  cache: second.headers.overMyHomeCache,
  error: second.error,
};

console.log(JSON.stringify(summary, null, 2));

const passed =
  summary.homepage.status === 200 &&
  summary.homepage.graphicalSky &&
  summary.homepage.airplanesLive &&
  summary.homepage.confirmedMilitary &&
  summary.homepage.accessibleList &&
  summary.api.status === 200 &&
  summary.api.provider === 'Airplanes.live' &&
  summary.api.postcode === 'YO32 9QU' &&
  summary.api.rangeKm === 18 &&
  summary.api.nonCommercial === true &&
  summary.api.refreshSeconds === 300 &&
  summary.secondApi.status === 200 &&
  summary.secondApi.cache === 'HIT';

if (!passed) process.exitCode = 1;
