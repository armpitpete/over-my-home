const KNOTS_TO_KM_PER_SECOND = 1.852 / 3600;

export const MAX_PROJECTION_SECONDS = 180;

export function projectAircraftPosition(
  aircraft,
  elapsedSeconds,
  maxProjectionSeconds = MAX_PROJECTION_SECONDS,
) {
  const distanceKm = Math.max(0, Number(aircraft.horizontalDistanceKm) || 0);
  const bearingDegrees = normaliseDegrees(aircraft.bearingDegrees);
  const speedKnots = Number(aircraft.speedKnots);
  const trackDegrees = Number(aircraft.trackDegrees);
  const seconds = Math.min(
    Math.max(0, Number(elapsedSeconds) || 0),
    Math.max(0, Number(maxProjectionSeconds) || 0),
  );

  if (!Number.isFinite(speedKnots) || !Number.isFinite(trackDegrees) || seconds === 0) {
    return { ...aircraft, horizontalDistanceKm: distanceKm, bearingDegrees };
  }

  const bearingRadians = toRadians(bearingDegrees);
  let eastKm = Math.sin(bearingRadians) * distanceKm;
  let northKm = Math.cos(bearingRadians) * distanceKm;

  const travelKm = Math.max(0, speedKnots) * KNOTS_TO_KM_PER_SECOND * seconds;
  const trackRadians = toRadians(trackDegrees);
  eastKm += Math.sin(trackRadians) * travelKm;
  northKm += Math.cos(trackRadians) * travelKm;

  return {
    ...aircraft,
    horizontalDistanceKm: Math.hypot(eastKm, northKm),
    bearingDegrees: normaliseDegrees(toDegrees(Math.atan2(eastKm, northKm))),
  };
}

export function projectionElapsedSeconds(
  positionAgeSeconds,
  generatedAt,
  nowMs = Date.now(),
  maxProjectionSeconds = MAX_PROJECTION_SECONDS,
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
