/**
 * Geographic utilities: Web Mercator projection, haversine distance, bounding boxes.
 *
 * @module server/lib/geo
 */

const EARTH_RADIUS_METERS = 6378137;
const MAX_MERCATOR_LAT = 85.05112878;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

/** Clamp latitude to valid Web Mercator range (±85.05°). */
export function clampLatitude(lat) {
  return Math.max(Math.min(lat, MAX_MERCATOR_LAT), -MAX_MERCATOR_LAT);
}

/** Convert WGS84 (lat, lon) to Web Mercator (x, y) in meters. */
export function toWebMercator(lat, lon) {
  const clampedLat = clampLatitude(lat);
  const x = EARTH_RADIUS_METERS * toRadians(lon);
  const y =
    EARTH_RADIUS_METERS *
    Math.log(Math.tan(Math.PI / 4 + toRadians(clampedLat) / 2));

  return { x, y };
}

/** Approximate meters to latitude degrees at the equator. */
export function metersToLatDegrees(meters) {
  return meters / 111_320;
}

/** Approximate meters to longitude degrees at a given latitude. */
export function metersToLonDegrees(meters, lat) {
  const safeCos = Math.max(Math.cos(toRadians(lat)), 0.0001);
  return meters / (111_320 * safeCos);
}

/** Compute a bounding box for a square area centered at (lat, lon) with given side length in meters. */
export function boundingBoxFromSquare(lat, lon, lengthMeters) {
  const half = lengthMeters / 2;
  const latOffset = metersToLatDegrees(half);
  const lonOffset = metersToLonDegrees(half, lat);

  return {
    south: lat - latOffset,
    west: lon - lonOffset,
    north: lat + latOffset,
    east: lon + lonOffset,
  };
}

/** Compute haversine distance in meters between two { lat, lon } points. */
export function haversineDistanceMeters(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(b.lon - a.lon);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);

  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}
