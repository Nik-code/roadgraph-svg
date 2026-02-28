/**
 * Overpass API client for fetching OSM highway data.
 *
 * Builds Overpass QL queries for radius or bounding-box areas and fetches
 * with fallback endpoints.
 *
 * @module server/lib/overpass
 */

import { boundingBoxFromSquare } from "./geo.js";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function normalizeHighwayFilter(includeHighways = []) {
  if (!Array.isArray(includeHighways) || includeHighways.length === 0) {
    return '["highway"]';
  }

  const cleanValues = includeHighways
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => value.replace(/[^a-zA-Z0-9_]/g, ""))
    .filter(Boolean);

  if (cleanValues.length === 0) {
    return '["highway"]';
  }

  return `["highway"~"^(${cleanValues.join("|")})$"]`;
}

/**
 * Build an Overpass QL query string for fetching ways in the given area.
 *
 * @param {object} options
 * @param {number} options.lat - Center latitude
 * @param {number} options.lon - Center longitude
 * @param {string} options.areaMode - "radius" or "square"
 * @param {number} options.radiusMeters - Radius in meters
 * @param {number} options.squareLengthMeters - Square side length in meters
 * @param {string[]} options.includeHighways - Highway types to include
 * @param {number} [options.timeoutSeconds=60] - Overpass timeout
 * @returns {string} Overpass QL query
 */
export function buildOverpassQuery({
  lat,
  lon,
  areaMode,
  radiusMeters,
  squareLengthMeters,
  includeHighways,
  timeoutSeconds = 60,
}) {
  const highwayFilter = normalizeHighwayFilter(includeHighways);

  if (areaMode === "square") {
    const bounds = boundingBoxFromSquare(lat, lon, squareLengthMeters);

    return `
[out:json][timeout:${timeoutSeconds}];
(
  way${highwayFilter}(${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
(._;>;);
out body;
`.trim();
  }

  return `
[out:json][timeout:${timeoutSeconds}];
(
  way${highwayFilter}(around:${Math.round(radiusMeters)},${lat},${lon});
);
(._;>;);
out body;
`.trim();
}

/**
 * Fetch Overpass API data, trying each endpoint until one succeeds.
 *
 * @param {object} options - Same as buildOverpassQuery
 * @returns {Promise<{endpoint: string, query: string, payload: object}>}
 * @throws {Error} If all endpoints fail
 */
export async function fetchOverpassData(options) {
  const query = buildOverpassQuery(options);
  const errors = [];

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: query,
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": "roadgraph-svg/1.0",
        },
        signal: AbortSignal.timeout(70_000),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
      }

      const payload = await response.json();

      if (!payload || !Array.isArray(payload.elements)) {
        throw new Error("Unexpected Overpass payload: missing elements array.");
      }

      return {
        endpoint,
        query,
        payload,
      };
    } catch (error) {
      errors.push(`${endpoint}: ${error.message}`);
    }
  }

  throw new Error(`Overpass request failed on all endpoints. ${errors.join(" | ")}`);
}
