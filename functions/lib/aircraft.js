const EARTH_RADIUS_KM = 6371.0088;

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

export function boundingBox(latitude, longitude, radiusKm) {
  const latitudeDelta = radiusKm / 111.32;
  const longitudeScale = Math.max(0.15, Math.cos(toRadians(latitude)));
  const longitudeDelta = radiusKm / (111.32 * longitudeScale);
  return {
    lamin: latitude - latitudeDelta,
    lomin: longitude - longitudeDelta,
    lamax: latitude + latitudeDelta,
    lomax: longitude + longitudeDelta,
  };
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

export function parseStateVector(state, home, rangeKm, nowSeconds) {
  if (!Array.isArray(state)) return null;
  const [
    icao24,
    rawCallsign,
    originCountry,
    timePosition,
    lastContact,
    longitude,
    latitude,
    baroAltitude,
    onGround,
    velocity,
    trueTrack,
    verticalRate,
    sensors,
    geoAltitude,
    squawk,
    spi,
    positionSource,
    category,
  ] = state;

  if (onGround || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const altitudeM = firstFinite(geoAltitude, baroAltitude, 0);
  const horizontalDistanceKm = haversineKm(home.latitude, home.longitude, latitude, longitude);
  const slantDistanceKm = Math.hypot(horizontalDistanceKm, Math.max(0, altitudeM) / 1000);
  if (slantDistanceKm > rangeKm) return null;

  const bearing = bearingDegrees(home.latitude, home.longitude, latitude, longitude);
  const approach = approachAssessment({
    home,
    aircraft: { latitude, longitude, velocity, trueTrack },
  });

  return {
    icao24: String(icao24 || ''),
    callsign: String(rawCallsign || '').trim() || null,
    originCountry: originCountry || null,
    latitude,
    longitude,
    altitudeFt: altitudeM > 0 ? altitudeM * 3.28084 : null,
    horizontalDistanceKm,
    slantDistanceKm,
    bearingDegrees: bearing,
    bearingLabel: bearingLabel(bearing),
    speedKnots: Number.isFinite(velocity) ? velocity * 1.943844 : null,
    trackDegrees: Number.isFinite(trueTrack) ? trueTrack : null,
    verticalRateMps: Number.isFinite(verticalRate) ? verticalRate : null,
    positionAgeSeconds: Math.max(0, Math.round(nowSeconds - firstFinite(timePosition, lastContact, nowSeconds))),
    motionLabel: approach,
    category: Number.isInteger(category) ? category : 0,
    categoryLabel: categoryLabel(category),
    audibility: slantDistanceKm <= Math.min(12, rangeKm * 0.7) ? 'likely' : 'possible',
    source: positionSource,
    squawk,
    sensors,
    spi,
  };
}

export function approachAssessment({ home, aircraft }) {
  if (!Number.isFinite(aircraft.velocity) || !Number.isFinite(aircraft.trueTrack)) {
    return 'Direction unknown';
  }

  const current = haversineKm(home.latitude, home.longitude, aircraft.latitude, aircraft.longitude);
  const seconds = 45;
  const distanceKm = aircraft.velocity * seconds / 1000;
  const projected = destinationPoint(
    aircraft.latitude,
    aircraft.longitude,
    aircraft.trueTrack,
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
    2: 'Light aircraft',
    3: 'Small aircraft',
    4: 'Large aircraft',
    5: 'High-vortex aircraft',
    6: 'Heavy aircraft',
    7: 'High-performance aircraft',
    8: 'Helicopter or rotorcraft',
    9: 'Glider',
    10: 'Lighter-than-air craft',
    12: 'Ultralight aircraft',
    14: 'Unmanned aircraft',
  };
  return labels[category] || 'Aircraft';
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

function firstFinite(...values) {
  return values.find((value) => Number.isFinite(value));
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function toDegrees(value) {
  return value * 180 / Math.PI;
}
