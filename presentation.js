import {
  audibilityForPosition,
  audibilityLabel,
  audibilityReason,
  slantDistanceKm,
} from './audibility.js';
import { projectAircraftPosition } from './motion.js';

export function cardProjection(aircraft = {}, audibility = audibilityForPosition(aircraft)) {
  const horizontalDistanceKm = Math.max(0, Number(aircraft.horizontalDistanceKm) || 0);
  const altitudeFt = finiteNumberOrNull(aircraft.altitudeFt);
  const positionAgeSeconds = Math.max(0, Number(aircraft.positionAgeSeconds) || 0);

  return {
    audibility,
    audibilityText: audibilityLabel(audibility),
    reasonText: audibilityReason(aircraft),
    distanceText: `${slantDistanceKm(horizontalDistanceKm, altitudeFt).toFixed(1)} km`,
    altitudeText: altitudeFt === null
      ? 'Not reported'
      : `${Math.round(altitudeFt).toLocaleString('en-GB')} ft`,
    bearingText: `${bearingDescription(aircraft.bearingDegrees)} · ${horizontalDistanceKm.toFixed(1)} km away`,
    movementText: projectedMovementLabel(aircraft),
    positionAgeText: `${Math.round(positionAgeSeconds)}s`,
  };
}

export function projectedMovementLabel(aircraft = {}) {
  const speedKnots = Number(aircraft.speedKnots);
  const trackDegrees = Number(aircraft.trackDegrees);
  if (!Number.isFinite(speedKnots) || !Number.isFinite(trackDegrees)) {
    return 'Direction unknown';
  }

  const currentDistanceKm = Math.max(0, Number(aircraft.horizontalDistanceKm) || 0);
  const projected = projectAircraftPosition(aircraft, 45, 45);
  const differenceKm = projected.horizontalDistanceKm - currentDistanceKm;

  if (differenceKm < -0.25) return 'Approaching';
  if (differenceKm > 0.25) return 'Moving away';
  return 'Passing across';
}

export function bearingDescription(degrees) {
  const labels = [
    'North',
    'North-east',
    'East',
    'South-east',
    'South',
    'South-west',
    'West',
    'North-west',
  ];
  const bearing = (Number(degrees) % 360 + 360) % 360;
  return labels[Math.round(bearing / 45) % 8];
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
