import { radarPosition, ringLabels } from './radar.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
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
const radarAircraft = document.querySelector('#radar-aircraft');
const radarEmpty = document.querySelector('#radar-empty');
const radarRingLabels = [...document.querySelectorAll('[data-ring-label]')];

const REFRESH_MS = 60_000;
let refreshTimer = null;
let currentRequest = null;
let activePostcode = '';
let selectedAircraftId = '';

const savedPostcode = localStorage.getItem('over-my-home.postcode');
const savedRange = localStorage.getItem('over-my-home.range');
if (savedPostcode) postcodeInput.value = savedPostcode;
if (savedRange && Number(savedRange) >= 8 && Number(savedRange) <= 30) {
  rangeInput.value = savedRange;
}
updateRangeOutput();
updateRadarScale(Number(rangeInput.value));

rangeInput.addEventListener('input', () => {
  updateRangeOutput();
  updateRadarScale(Number(rangeInput.value));
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
    setStatus(`${data.aircraft.length} aircraft detected`);
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
  radarAircraft.replaceChildren();
  locationLabel.textContent = `${data.location.postcode} · ${data.location.area}`;
  updatedAt.textContent = `Updated ${formatClock(data.generatedAt)}`;
  updateRadarScale(data.rangeKm);

  emptyState.hidden = data.aircraft.length !== 0;
  radarEmpty.hidden = data.aircraft.length !== 0;

  const availableIds = new Set();
  data.aircraft.forEach((aircraft, index) => {
    const id = aircraft.icao24 || `aircraft-${index}`;
    availableIds.add(id);
    renderAircraftCard(aircraft, id);
    renderRadarTarget(aircraft, id, data.rangeKm);
  });

  if (!availableIds.has(selectedAircraftId)) {
    selectedAircraftId = data.aircraft[0]?.icao24 || '';
  }
  if (selectedAircraftId) selectAircraft(selectedAircraftId);
}

function renderAircraftCard(aircraft, id) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.aircraftId = id;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-pressed', 'false');
  card.setAttribute('aria-label', `Select ${displayName(aircraft)} on the local sky radar`);

  card.querySelector('.aircraft-kind').textContent = aircraft.categoryLabel;
  card.querySelector('.aircraft-callsign').textContent = displayName(aircraft);

  const militaryBadge = card.querySelector('.military-badge');
  militaryBadge.hidden = !aircraft.military;

  const sourceBadge = card.querySelector('.source-badge');
  sourceBadge.textContent = aircraft.sourceLabel;
  sourceBadge.classList.toggle('mlat', aircraft.source === 'mlat');

  const audibilityBadge = card.querySelector('.audibility-badge');
  audibilityBadge.textContent = aircraft.audibility === 'likely' ? 'Likely audible' : 'Possibly audible';
  audibilityBadge.classList.toggle('possible', aircraft.audibility !== 'likely');

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
  card.querySelector('.fact-registration').textContent = aircraft.registration || 'Not reported';
  card.querySelector('.fact-type').textContent = [aircraft.typeCode, aircraft.description]
    .filter(Boolean)
    .join(' · ') || 'Not reported';
  card.querySelector('.fact-source').textContent = aircraft.sourceLabel;

  card.addEventListener('click', () => selectAircraft(id));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectAircraft(id);
    }
  });
  aircraftList.append(card);
}

function renderRadarTarget(aircraft, id, rangeKm) {
  const position = radarPosition(aircraft, rangeKm);
  const target = svgElement('g', {
    class: `radar-target${aircraft.military ? ' military' : ''}${aircraft.audibility === 'likely' ? ' likely' : ''}`,
    transform: `translate(${position.x.toFixed(2)} ${position.y.toFixed(2)})`,
    tabindex: '0',
    role: 'button',
    'aria-pressed': 'false',
    'aria-label': `${displayName(aircraft)}, ${aircraft.bearingLabel}, ${aircraft.horizontalDistanceKm.toFixed(1)} kilometres away`,
  });
  target.dataset.aircraftId = id;

  target.append(svgElement('circle', { class: 'radar-hit-area', r: '28' }));
  if (aircraft.military) {
    target.append(svgElement('path', {
      class: 'military-shield',
      d: 'M0 -25 L20 -13 L18 14 L0 26 L-18 14 L-20 -13 Z',
    }));
  }
  target.append(svgElement('circle', { class: 'radar-pulse', r: '17' }));
  target.append(svgElement('path', {
    class: 'aircraft-symbol',
    d: 'M0 -14 L4 -4 L14 1 L14 5 L4 4 L4 11 L8 15 L8 17 L0 14 L-8 17 L-8 15 L-4 11 L-4 4 L-14 5 L-14 1 L-4 -4 Z',
    transform: `rotate(${Number.isFinite(aircraft.trackDegrees) ? aircraft.trackDegrees : 0})`,
  }));

  const label = svgElement('text', { class: 'radar-target-label', y: '-31', 'text-anchor': 'middle' });
  label.textContent = shortLabel(aircraft);
  target.append(label);

  target.addEventListener('click', () => selectAircraft(id, true));
  target.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectAircraft(id, true);
    }
  });
  radarAircraft.append(target);
}

function selectAircraft(id, scrollToCard = false) {
  selectedAircraftId = id;
  document.querySelectorAll('[data-aircraft-id]').forEach((element) => {
    const selected = element.dataset.aircraftId === id;
    element.classList.toggle('selected', selected);
    element.setAttribute('aria-pressed', String(selected));
  });

  if (scrollToCard) {
    const card = aircraftList.querySelector(`[data-aircraft-id="${CSS.escape(id)}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    card?.focus({ preventScroll: true });
  }
}

function updateRadarScale(rangeKm) {
  const labels = ringLabels(rangeKm);
  radarRingLabels.forEach((element, index) => {
    element.textContent = labels[index];
  });
}

function displayName(aircraft) {
  return aircraft.callsign || aircraft.registration || `Aircraft ${aircraft.icao24.toUpperCase()}`;
}

function shortLabel(aircraft) {
  const value = aircraft.callsign || aircraft.registration || aircraft.typeCode || aircraft.icao24.toUpperCase();
  return value.slice(0, 10);
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
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
