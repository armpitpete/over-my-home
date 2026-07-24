export function aircraftStatusMessage(data = {}) {
  const aircraftCount = Array.isArray(data.aircraft) ? data.aircraft.length : 0;
  if (!data.source?.stale) return `${aircraftCount} aircraft detected`;

  return `Live update unavailable. Showing ${aircraftCount} aircraft from ${formatAge(data.source.staleAgeSeconds)} ago.`;
}

export function formatAge(ageSeconds) {
  const seconds = Math.max(0, Number(ageSeconds) || 0);
  if (seconds < 60) return 'less than a minute';

  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
