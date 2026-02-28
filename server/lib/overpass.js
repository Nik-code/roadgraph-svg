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
