const TILE_SIZE_DEGREES = 0.25;
const MAX_RADAR_RANGE_KM = 30;
const KM_PER_LATITUDE_DEGREE = 111.32;
const KM_PER_NAUTICAL_MILE = 1.852;

export function aircraftTileForLocation(location = {}) {
  const latitude = finiteCoordinate(location.latitude, 'latitude');
  const longitude = finiteCoordinate(location.longitude, 'longitude');
  const latitudeIndex = Math.floor((latitude + 90) / TILE_SIZE_DEGREES);
  const longitudeIndex = Math.floor((longitude + 180) / TILE_SIZE_DEGREES);
  const centreLatitude = latitudeIndex * TILE_SIZE_DEGREES - 90 + TILE_SIZE_DEGREES / 2;
  const centreLongitude = longitudeIndex * TILE_SIZE_DEGREES - 180 + TILE_SIZE_DEGREES / 2;
  const halfLatitudeKm = TILE_SIZE_DEGREES / 2 * KM_PER_LATITUDE_DEGREE;
  const halfLongitudeKm = TILE_SIZE_DEGREES / 2 * KM_PER_LATITUDE_DEGREE *
    Math.max(0.1, Math.cos(toRadians(centreLatitude)));
  const cornerDistanceKm = Math.hypot(halfLatitudeKm, halfLongitudeKm);
  const radiusNm = Math.ceil((cornerDistanceKm + MAX_RADAR_RANGE_KM) / KM_PER_NAUTICAL_MILE);

  return {
    id: `${latitudeIndex}:${longitudeIndex}`,
    centreLatitude,
    centreLongitude,
    radiusNm,
  };
}

export function aircraftTileCacheKey(requestUrl, tile, freshness = 'fresh') {
  if (!tile?.id) throw new TypeError('A tile id is required.');
  const url = new URL(requestUrl);
  url.pathname = `/__over-my-home-cache/aircraft-tile/${freshness}`;
  url.search = '';
  url.searchParams.set('tile', tile.id);
  return new Request(url.toString(), { method: 'GET' });
}

export function staleAgeSeconds(fetchedAt, nowMs = Date.now()) {
  const fetchedAtMs = Date.parse(fetchedAt);
  if (!Number.isFinite(fetchedAtMs)) return 0;
  return Math.max(0, Math.round((Number(nowMs) - fetchedAtMs) / 1000));
}

function finiteCoordinate(value, name) {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate)) throw new TypeError(`A finite ${name} is required.`);
  return coordinate;
}

function toRadians(value) {
  return value * Math.PI / 180;
}
