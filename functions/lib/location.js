export const DEFAULT_GEOCODER_BASE_URL = 'https://nominatim.openstreetmap.org';
export const MAX_LOCATION_QUERY_LENGTH = 120;

export function normaliseLocationQuery(value) {
  const query = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  if (!query || query.length > MAX_LOCATION_QUERY_LENGTH) return null;
  return query;
}

export function geocoderSearchUrl(query, baseUrl = DEFAULT_GEOCODER_BASE_URL) {
  const url = new URL('/search', normaliseBaseUrl(baseUrl));
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '1');
  return url.toString();
}

export function parseNominatimLocation(result, fallbackQuery = '') {
  if (!result || typeof result !== 'object') return null;

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  const address = result.address && typeof result.address === 'object'
    ? result.address
    : {};
  const settlement = firstText(
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.hamlet,
  );
  const label = firstText(
    result.name,
    address.postcode,
    settlement,
    address.state,
    address.country,
    fallbackQuery,
  );
  if (!label) return null;

  const area = uniqueText([
    settlement,
    address.county,
    address.state,
    address.country,
  ])
    .filter((value) => value.toLocaleLowerCase() !== label.toLocaleLowerCase())
    .slice(0, 3)
    .join(', ');

  return {
    label,
    postcode: label,
    latitude,
    longitude,
    area: area || firstText(result.display_name, address.country, 'Location'),
    countryCode: firstText(address.country_code)?.toUpperCase() || null,
    source: 'OpenStreetMap Nominatim',
  };
}

function normaliseBaseUrl(value) {
  const url = new URL(String(value || DEFAULT_GEOCODER_BASE_URL));
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function uniqueText(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}
