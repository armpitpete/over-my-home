const FEET_TO_KM = 0.0003048;

export const LIKELY_AUDIBLE_DISTANCE_KM = 12;

export function slantDistanceKm(horizontalDistanceKm, altitudeFt) {
  const horizontalKm = Math.max(0, Number(horizontalDistanceKm) || 0);
  const verticalKm = Math.max(0, Number(altitudeFt) || 0) * FEET_TO_KM;
  return Math.hypot(horizontalKm, verticalKm);
}

export function audibilityForPosition(aircraft) {
  return slantDistanceKm(
    aircraft?.horizontalDistanceKm,
    aircraft?.altitudeFt,
  ) <= LIKELY_AUDIBLE_DISTANCE_KM
    ? 'likely'
    : 'possible';
}
