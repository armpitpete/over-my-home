const form = document.querySelector('#search-form');
const postcodeInput = document.querySelector('#postcode');
const rangeInput = document.querySelector('#range');
const rangeOutput = document.querySelector('#range-output');
const submitButton = form.querySelector('button[type="submit"]');
const status = document.querySelector('#status');
const refreshButton = document.querySelector('#refresh-button');
const aircraftList = document.querySelector('#aircraft-list');
const emptyState = document.querySelector('#empty-state');
const locationLabel = document.querySelector('#location-label');
const updatedAt = document.querySelector('#updated-at');
const cardTemplate = document.querySelector('#aircraft-card-template');

const REFRESH_MS = 15_000;
let refreshTimer = null;
let currentRequest = null;
let activePostcode = '';

const savedPostcode = localStorage.getItem('over-my-home.postcode');
const savedRange = localStorage.getItem('over-my-home.range');
if (savedPostcode) postcodeInput.value = savedPostcode;
if (savedRange && Number(savedRange) >= 8 && Number(savedRange) <= 30) {
  rangeInput.value = savedRange;
}
updateRangeOutput();

rangeInput.addEventListener('input', () => {
  updateRangeOutput();
  localStorage.setItem('over-my-home.range', rangeInput.value);
});

rangeInput.addEventListener('change', () => {
  if (activePostcode) fetchAircraft(activePostcode);
});

postcodeInput.addEventListener('input', () => {
  postcodeInput.value = postcodeInput.value.toUpperCase();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const postcode = normalisePostcode(postcodeInput.value);
  if (!postcode) {
    setStatus('Enter a valid UK postcode.', true);
    postcodeInput.focus();
    return;
  }

  postcodeInput.value = postcode;
  activePostcode = postcode;
  localStorage.setItem('over-my-home.postcode', postcode);
  fetchAircraft(postcode);
});

refreshButton.addEventListener('click', () => {
  if (activePostcode) fetchAircraft(activePostcode);
});

if (savedPostcode) {
  activePostcode = normalisePostcode(savedPostcode);
  if (activePostcode) fetchAircraft(activePostcode);
}

function updateRangeOutput() {
  rangeOutput.textContent = `${rangeInput.value} km`;
}

function normalisePostcode(value) {
  const compact = value.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) return '';
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

async function fetchAircraft(postcode) {
  clearTimeout(refreshTimer);
  if (currentRequest) currentRequest.abort();
  currentRequest = new AbortController();

  submitButton.disabled = true;
  refreshButton.disabled = true;
  refreshButton.hidden = false;
  setStatus('Checking the live sky…');

  try {
    const url = new URL('/api/aircraft', window.location.origin);
    url.searchParams.set('postcode', postcode);
    url.searchParams.set('range', rangeInput.value);

    const response = await fetch(url, {
      signal: currentRequest.signal,
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'The live aircraft service did not respond.');
    }

    renderAircraft(data);
    const sourceMode = data.source?.authenticated ? 'authenticated live data' : 'live data';
    setStatus(`${data.aircraft.length} aircraft in the modelled hearing area · ${sourceMode}`);
  } catch (error) {
    if (error.name === 'AbortError') return;
    setStatus(error.message || 'Unable to load aircraft.', true);
  } finally {
    submitButton.disabled = false;
    refreshButton.disabled = false;
    currentRequest = null;
    refreshTimer = setTimeout(() => {
      if (activePostcode && document.visibilityState === 'visible') {
        fetchAircraft(activePostcode);
      }
    }, REFRESH_MS);
  }
}

function renderAircraft(data) {
  aircraftList.replaceChildren();
  locationLabel.textContent = `${data.location.postcode} · ${data.location.area}`;
  updatedAt.textContent = `Updated ${formatClock(data.generatedAt)}`;

  emptyState.hidden = data.aircraft.length !== 0;
  for (const aircraft of data.aircraft) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector('.aircraft-kind').textContent = aircraft.categoryLabel;
    card.querySelector('.aircraft-callsign').textContent = aircraft.callsign || `Aircraft ${aircraft.icao24.toUpperCase()}`;

    const badge = card.querySelector('.audibility-badge');
    badge.textContent = aircraft.audibility === 'likely' ? 'Likely audible' : 'Possibly audible';
    badge.classList.toggle('possible', aircraft.audibility !== 'likely');

    card.querySelector('.fact-distance').textContent = `${aircraft.slantDistanceKm.toFixed(1)} km`;
    card.querySelector('.fact-altitude').textContent = aircraft.altitudeFt == null
      ? 'Not reported'
      : `${Math.round(aircraft.altitudeFt).toLocaleString('en-GB')} ft`;
    card.querySelector('.fact-bearing').textContent = `${aircraft.bearingLabel} · ${aircraft.horizontalDistanceKm.toFixed(1)} km away`;
    card.querySelector('.fact-motion').textContent = aircraft.motionLabel;
    card.querySelector('.fact-speed').textContent = aircraft.speedKnots == null
      ? 'Not reported'
      : `${Math.round(aircraft.speedKnots)} kt`;
    card.querySelector('.fact-age').textContent = `${aircraft.positionAgeSeconds}s`;

    aircraftList.append(card);
  }
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function formatClock(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}
