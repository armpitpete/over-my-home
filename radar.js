export const RADAR_CENTRE = 300;
export const RADAR_RADIUS = 250;

export function radarPosition(aircraft, rangeKm, radius = RADAR_RADIUS, centre = RADAR_CENTRE) {
  const safeRange = Math.max(1, Number(rangeKm) || 1);
  const distance = Math.max(0, Number(aircraft.horizontalDistanceKm) || 0);
  const bearing = Number(aircraft.bearingDegrees) || 0;
  const plottedRadius = Math.min(radius, distance / safeRange * radius);
  const angle = bearing * Math.PI / 180;

  return {
    x: centre + Math.sin(angle) * plottedRadius,
    y: centre - Math.cos(angle) * plottedRadius,
  };
}

export function ringLabels(rangeKm) {
  const range = Math.max(1, Number(rangeKm) || 1);
  return [0.25, 0.5, 0.75, 1].map((fraction) => `${Math.round(range * fraction)} km`);
}
