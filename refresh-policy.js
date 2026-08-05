export const CIVILIAN_REFRESH_MS = 180_000;
export const MILITARY_REFRESH_MS = 60_000;

export function refreshIntervalForAircraft(aircraft = []) {
  return aircraft.some((item) => item?.military)
    ? MILITARY_REFRESH_MS
    : CIVILIAN_REFRESH_MS;
}
