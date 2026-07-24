const FEET_TO_KM = 0.0003048;

export const LIKELY_RANGE_RATIO = 0.7;

const BASE_SOUND_RANGE_KM = Object.freeze({
  A1: 9,
  A2: 13,
  A3: 18,
  A4: 22,
  A5: 26,
  A6: 24,
  A7: 18,
  B1: 0,
  B2: 3,
  B4: 6,
  B6: 4,
});

const SOUND_CLASS_LABELS = Object.freeze({
  A1: 'Light aircraft',
  A2: 'Small aircraft',
  A3: 'Large aircraft',
  A4: 'High-vortex aircraft',
  A5: 'Heavy aircraft',
  A6: 'High-performance aircraft',
  A7: 'Helicopter or rotorcraft',
  B1: 'Glider',
  B2: 'Lighter-than-air craft',
  B4: 'Ultralight aircraft',
  B6: 'Unmanned aircraft',
});

const MOTOR_GLIDER_PATTERN = /MOTOR\s*GLIDER|MOTORGLIDER|SELF[-\s]?LAUNCH/i;

export function slantDistanceKm(horizontalDistanceKm, altitudeFt) {
  const horizontalKm = Math.max(0, Number(horizontalDistanceKm) || 0);
  const verticalKm = Math.max(0, Number(altitudeFt) || 0) * FEET_TO_KM;
  return Math.hypot(horizontalKm, verticalKm);
}

export function soundRangeKm(aircraft = {}) {
  const category = normalisedCategory(aircraft);
  const motorGlider = isMotorGlider(aircraft);

  let rangeKm = motorGlider
    ? 3
    : BASE_SOUND_RANGE_KM[category] ?? 10;

  if (rangeKm === 0) return 0;

  const verticalRateFpm = Number(aircraft.verticalRateFpm);
  if (Number.isFinite(verticalRateFpm)) {
    if (verticalRateFpm >= 2_000) rangeKm *= 1.65;
    else if (verticalRateFpm >= 1_000) rangeKm *= 1.4;
    else if (verticalRateFpm >= 500) rangeKm *= 1.2;
  }

  const speedKnots = Number(aircraft.speedKnots);
  if (Number.isFinite(speedKnots) && category !== 'A7') {
    if (speedKnots >= 400) rangeKm *= 1.15;
    else if (speedKnots >= 250) rangeKm *= 1.08;
    else if (speedKnots >= 120) rangeKm *= 1.03;
  }

  return Math.min(45, rangeKm);
}

export function audibilityForPosition(aircraft = {}) {
  const distanceKm = slantDistanceKm(
    aircraft.horizontalDistanceKm,
    aircraft.altitudeFt,
  );
  const estimatedRangeKm = soundRangeKm(aircraft);

  if (estimatedRangeKm <= 0 || distanceKm > estimatedRangeKm) return 'unlikely';
  if (distanceKm <= estimatedRangeKm * LIKELY_RANGE_RATIO) return 'likely';
  return 'possible';
}

export function audibilityLabel(audibility) {
  const labels = {
    likely: 'Likely audible',
    possible: 'Possibly audible',
    unlikely: 'Unlikely audible',
  };
  return labels[audibility] || labels.unlikely;
}

export function audibilityReason(aircraft = {}) {
  const category = normalisedCategory(aircraft);
  const distanceKm = slantDistanceKm(
    aircraft.horizontalDistanceKm,
    aircraft.altitudeFt,
  ).toFixed(1);

  if (category === 'B1' && !isMotorGlider(aircraft)) {
    return `Glider category; little or no engine noise expected at ${distanceKm} km straight-line distance.`;
  }

  const soundClass = isMotorGlider(aircraft)
    ? 'Motor glider'
    : SOUND_CLASS_LABELS[category] || 'Aircraft class unknown';

  return `${soundClass}, ${operationPhrase(aircraft.verticalRateFpm)}, ${distanceKm} km straight-line distance.`;
}

function normalisedCategory(aircraft) {
  return String(aircraft?.category || '').trim().toUpperCase();
}

function isMotorGlider(aircraft) {
  if (normalisedCategory(aircraft) !== 'B1') return false;
  const description = [aircraft?.typeCode, aircraft?.description].filter(Boolean).join(' ');
  return MOTOR_GLIDER_PATTERN.test(description);
}

function operationPhrase(verticalRateFpm) {
  const verticalRate = Number(verticalRateFpm);
  if (!Number.isFinite(verticalRate)) return 'vertical motion not reported';
  if (verticalRate >= 2_000) return 'climbing rapidly';
  if (verticalRate >= 500) return 'climbing';
  if (verticalRate <= -2_000) return 'descending rapidly';
  if (verticalRate <= -500) return 'descending';
  return 'near-level flight';
}
