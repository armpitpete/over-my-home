import { audibilityForPosition } from '../../audibility.js';

const EARTH_RADIUS_KM = 6371.0088;
const FEET_TO_KM = 0.0003048;
const KNOTS_TO_METRES_PER_SECOND = 0.514444;

export function normalisePostcode(value) {
  const compact = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact)) return null;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function clampRange(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 18;
  return Math.min(30, Math.max(8, Math.round(parsed)));
}

export function radiusKmToNauticalMiles(radiusKm) {
  return Math.max(1, Math.ceil(Number(radiusKm) / 1.852));
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function bearingDegrees(lat1, lon1, lat2, lon2) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLon = toRadians(lon2 - lon1);
  const y = Math.sin(deltaLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLon);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function bearingLabel(degrees) {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round(degrees / 45) % 8];
}

export function parseAirplanesAircraft(record, home, rangeKm) {
  if (!record || typeof record !== 'object') return null;
  if (record.alt_baro === 'ground') return null;

  const position = choosePosition(record);
  if (!position) return null;

  const positionAgeSeconds = Math.max(0, Math.round(position.age));
  if (positionAgeSeconds > 90) return null;

  const altitudeFt = firstFinite(
    numberOrNull(record.alt_geom),
    numberOrNull(record.alt_baro),
  );
  const horizontalDistanceKm = haversineKm(
    home.latitude,
    home.longitude,
    position.latitude,
    position.longitude,
  );
  const slantDistanceKm = Math.hypot(
    horizontalDistanceKm,
    Math.max(0, altitudeFt || 0) * FEET_TO_KM,
  );
  if (slantDistanceKm > rangeKm) return null;

  const bearing = bearingDegrees(
    home.latitude,
    home.longitude,
    position.latitude,
    position.longitude,
  );
  const speedKnots = numberOrNull(record.gs);
  const trackDegrees = numberOrNull(record.track);
  const military = (Number(record.dbFlags) & 1) === 1;

  const parsed = {
    icao24: String(record.hex || '').trim(),
    callsign: cleanString(record.flight),
    registration: cleanString(record.r),
    typeCode: cleanString(record.t),
    description: cleanString(record.desc),
    latitude: position.latitude,
    longitude: position.longitude,
    altitudeFt,
    horizontalDistanceKm,
    slantDistanceKm,
    bearingDegrees: bearing,
    bearingLabel: bearingLabel(bearing),
    speedKnots,
    trackDegrees,
    verticalRateFpm: firstFinite(
      numberOrNull(record.geom_rate),
      numberOrNull(record.baro_rate),
    ),
    positionAgeSeconds,
    motionLabel: approachAssessment({
      home,
      aircraft: {
        latitude: position.latitude,
        longitude: position.longitude,
        speedKnots,
        trackDegrees,
      },
    }),
    category: cleanString(record.category),
    categoryLabel: military ? 'Military aircraft' : categoryLabel(record.category),
    source: cleanString(record.type) || 'unknown',
    sourceLabel: sourceLabel(record.type),
    military,
    squawk: cleanString(record.squawk),
    emergency: cleanString(record.emergency),
  };

  return {
    ...parsed,
    audibility: audibilityForPosition(parsed),
  };
}

export function approachAssessment({ home, aircraft }) {
  if (!Number.isFinite(aircraft.speedKnots) || !Number.isFinite(aircraft.trackDegrees)) {
    return 'Direction unknown';
  }

  const current = haversineKm(home.latitude, home.longitude, aircraft.latitude, aircraft.longitude);
  const seconds = 45;
  const distanceKm = aircraft.speedKnots * KNOTS_TO_METRES_PER_SECOND * seconds / 1000;
  const projected = destinationPoint(
    aircraft.latitude,
    aircraft.longitude,
    aircraft.trackDegrees,
    distanceKm,
  );
  const projectedDistance = haversineKm(home.latitude, home.longitude, projected.latitude, projected.longitude);
  const difference = projectedDistance - current;

  if (difference < -0.25) return 'Approaching';
  if (difference > 0.25) return 'Moving away';
  return 'Passing across';
}

export function categoryLabel(category) {
  const labels = {
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
  };
  return labels[String(category || '').toUpperCase()] || 'Aircraft';
}

export function sourceLabel(source) {
  const labels = {
    adsb_icao: 'ADS-B',
    adsb_icao_nt: 'ADS-B',
    adsb_other: 'ADS-B',
    adsr_icao: 'ADS-R',
    adsr_other: 'ADS-R',
    mlat: 'MLAT',
    tisb_icao: 'TIS-B',
    tisb_other: 'TIS-B',
    tisb_trackfile: 'TIS-B',
    adsc: 'ADS-C',
    mode_s: 'Mode S',
    other: 'Other source',
  };
  return labels[String(source || '').toLowerCase()] || 'Source unknown';
}

function choosePosition(record) {
  const directLat = numberOrNull(record.lat);
  const directLon = numberOrNull(record.lon);
  const directAge = firstFinite(numberOrNull(record.seen_pos), numberOrNull(record.seen), 0);
  if (directLat !== null && directLon !== null) {
    return { latitude: directLat, longitude: directLon, age: directAge };
  }

  const fallback = record.lastPosition;
  if (!fallback || typeof fallback !== 'object') return null;
  const fallbackLat = numberOrNull(fallback.lat);
  const fallbackLon = numberOrNull(fallback.lon);
  const fallbackAge = numberOrNull(fallback.seen_pos);
  if (fallbackLat === null || fallbackLon === null || fallbackAge === null || fallbackAge > 60) {
    return null;
  }
  return { latitude: fallbackLat, longitude: fallbackLon, age: fallbackAge };
}

function destinationPoint(latitude, longitude, bearing, distanceKm) {
  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const theta = toRadians(bearing);
  const phi1 = toRadians(latitude);
  const lambda1 = toRadians(longitude);

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(angularDistance) +
      Math.cos(phi1) * Math.sin(angularDistance) * Math.cos(theta),
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(angularDistance) * Math.cos(phi1),
      Math.cos(angularDistance) - Math.sin(phi1) * Math.sin(phi2),
    );

  return {
    latitude: toDegrees(phi2),
    longitude: ((toDegrees(lambda2) + 540) % 360) - 180,
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstFinite(...values) {
  return values.find((value) => Number.isFinite(value));
}

function cleanString(value) {
  const result = String(value || '').trim();
  return result || null;
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function toDegrees(value) {
  return value * 180 / Math.PI;
}
