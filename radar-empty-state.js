export const INITIAL_RADAR_MESSAGE = 'Enter a postcode to place live aircraft on the local sky.';
export const NO_AIRCRAFT_MESSAGE = 'No aircraft in range.';

export function radarEmptyMessage(hasCompletedSearch, aircraftCount) {
  if (!hasCompletedSearch) return INITIAL_RADAR_MESSAGE;
  return Number(aircraftCount) === 0 ? NO_AIRCRAFT_MESSAGE : '';
}

if (typeof document !== 'undefined') {
  const radarEmpty = document.querySelector('#radar-empty');
  const locationLabel = document.querySelector('#location-label');
  const aircraftList = document.querySelector('#aircraft-list');

  if (radarEmpty && locationLabel && aircraftList) {
    const updateMessage = () => {
      radarEmpty.textContent = radarEmptyMessage(
        Boolean(locationLabel.textContent.trim()),
        aircraftList.childElementCount,
      );
    };

    const observer = new MutationObserver(updateMessage);
    observer.observe(locationLabel, { childList: true, characterData: true, subtree: true });
    observer.observe(aircraftList, { childList: true });
    updateMessage();
  }
}
