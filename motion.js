const KNOTS_TO_KM_PER_SECOND = 1.852 / 3600;
const MIN_PROJECTED_ALTITUDE_FT = -1_000;
const MAX_PROJECTED_ALTITUDE_FT = 70_000;

export const CORRECTION_INTERVAL_SECONDS = 180;
export const MAX_INITIAL_AGE_SECONDS = 270;
export const MAX_PROJECTION_SECONDS = CORRECTION_INTERVAL_SECONDS;

export function projectAircraftPosition(
  aircraft,
  elapsedSeconds,
  maxProjectionSeconds = MAX_PROJECTION_SECONDS,
) {
  const distanceKm = Math.max(0, Number(aircraft.horizontalDistanceKm) || 0);
  const bearingDegrees = normaliseDegrees(aircraft.bearingDegrees);
  const speedKnots = Number(aircraft.speedKnots);
  const trackDegrees = Number(aircraft.trackDegrees);
  const seconds = clampElapsedSeconds(elapsedSeconds, maxProjectionSeconds);
  const projectedAltitudeFt = projectAltitudeFt(
    aircraft.altitudeFt,
    aircraft.verticalRateFpm,
    seconds,
    maxProjectionSeconds,
  );
  const baseProjection = {
    ...aircraft,
    horizontalDistanceKm: distanceKm,
    bearingDegrees,
    altitudeFt: projectedAltitudeFt ?? aircraft.altitudeFt,
  };

  if (!Number.isFinite(speedKnots) || !Number.isFinite(trackDegrees) || seconds === 0) {
    return baseProjection;
  }

  const bearingRadians = toRadians(bearingDegrees);
  let eastKm = Math.sin(bearingRadians) * distanceKm;
  let northKm = Math.cos(bearingRadians) * distanceKm;

  const travelKm = Math.max(0, speedKnots) * KNOTS_TO_KM_PER_SECOND * seconds;
  const trackRadians = toRadians(trackDegrees);
  eastKm += Math.sin(trackRadians) * travelKm;
  northKm += Math.cos(trackRadians) * travelKm;

  return {
    ...baseProjection,
    horizontalDistanceKm: Math.hypot(eastKm, northKm),
    bearingDegrees: normaliseDegrees(toDegrees(Math.atan2(eastKm, northKm))),
  };
}

export function projectAltitudeFt(
  altitudeFt,
  verticalRateFpm,
  elapsedSeconds,
  maxProjectionSeconds = MAX_PROJECTION_SECONDS,
) {
  if (altitudeFt === null || altitudeFt === undefined || altitudeFt === '') return null;
  const altitude = Number(altitudeFt);
  if (!Number.isFinite(altitude)) return null;

  const verticalRate = Number(verticalRateFpm);
  const seconds = clampElapsedSeconds(elapsedSeconds, maxProjectionSeconds);
  if (!Number.isFinite(verticalRate) || seconds === 0) return altitude;

  const projected = altitude + verticalRate * seconds / 60;
  return Math.min(
    MAX_PROJECTED_ALTITUDE_FT,
    Math.max(MIN_PROJECTED_ALTITUDE_FT, projected),
  );
}

export function projectionElapsedSeconds(
  positionAgeSeconds,
  generatedAt,
  nowMs = Date.now(),
  maxProjectionSeconds = MAX_INITIAL_AGE_SECONDS,
) {
  const sourceAge = Math.max(0, Number(positionAgeSeconds) || 0);
  const generatedAtMs = Date.parse(generatedAt);
  const cacheAge = Number.isFinite(generatedAtMs)
    ? Math.max(0, (Number(nowMs) - generatedAtMs) / 1000)
    : 0;

  return Math.min(
    sourceAge + cacheAge,
    Math.max(0, Number(maxProjectionSeconds) || 0),
  );
}

export function createMotionState(aircraft, generatedAt, receivedAtMs = Date.now()) {
  const initialAgeSeconds = projectionElapsedSeconds(
    aircraft.positionAgeSeconds,
    generatedAt,
    receivedAtMs,
  );

  return {
    aircraft: projectAircraftPosition(
      aircraft,
      initialAgeSeconds,
      MAX_INITIAL_AGE_SECONDS,
    ),
    receivedAtMs: Number(receivedAtMs),
  };
}

export function projectMotionState(motionState, nowMs = Date.now()) {
  const receivedAtMs = Number(motionState?.receivedAtMs);
  const elapsedSinceReceipt = Number.isFinite(receivedAtMs)
    ? Math.max(0, (Number(nowMs) - receivedAtMs) / 1000)
    : 0;

  return projectAircraftPosition(
    motionState?.aircraft || {},
    elapsedSinceReceipt,
    CORRECTION_INTERVAL_SECONDS,
  );
}

function clampElapsedSeconds(elapsedSeconds, maxProjectionSeconds) {
  return Math.min(
    Math.max(0, Number(elapsedSeconds) || 0),
    Math.max(0, Number(maxProjectionSeconds) || 0),
  );
}

function normaliseDegrees(value) {
  const degrees = Number(value) || 0;
  return (degrees % 360 + 360) % 360;
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function toDegrees(value) {
  return value * 180 / Math.PI;
}
