import { haversineDistanceMeters, toWebMercator } from "./geo.js";
import { fetchOverpassData } from "./overpass.js";

const HIGHWAY_BUCKETS = {
  motorway: "major",
  trunk: "major",
  primary: "major",
  motorway_link: "major",
  trunk_link: "major",
  primary_link: "major",
  secondary: "minor",
  tertiary: "minor",
  secondary_link: "minor",
  tertiary_link: "minor",
  residential: "local",
  unclassified: "local",
  service: "local",
  living_street: "local",
  road: "local",
};

const DEFAULT_THEME = {
  canvasWidth: 1200,
  canvasHeight: 900,
  padding: 36,
  backgroundColor: "#101317",
  majorColor: "#b7bcc5",
  minorColor: "#6f7682",
  localColor: "#3e4652",
  majorWidth: 3.6,
  minorWidth: 2.2,
  localWidth: 1.25,
  roadOpacity: 0.95,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function sanitizeColor(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^(rgb|rgba|hsl|hsla)\(/.test(trimmed)) {
    return trimmed;
  }

  return fallback;
}

function normalizeTheme(theme = {}) {
  return {
    canvasWidth: clamp(Number(theme.canvasWidth) || DEFAULT_THEME.canvasWidth, 500, 3000),
    canvasHeight: clamp(Number(theme.canvasHeight) || DEFAULT_THEME.canvasHeight, 400, 3000),
    padding: clamp(Number(theme.padding) || DEFAULT_THEME.padding, 10, 140),
    backgroundColor: sanitizeColor(theme.backgroundColor, DEFAULT_THEME.backgroundColor),
    majorColor: sanitizeColor(theme.majorColor, DEFAULT_THEME.majorColor),
    minorColor: sanitizeColor(theme.minorColor, DEFAULT_THEME.minorColor),
    localColor: sanitizeColor(theme.localColor, DEFAULT_THEME.localColor),
    majorWidth: clamp(Number(theme.majorWidth) || DEFAULT_THEME.majorWidth, 0.4, 30),
    minorWidth: clamp(Number(theme.minorWidth) || DEFAULT_THEME.minorWidth, 0.2, 24),
    localWidth: clamp(Number(theme.localWidth) || DEFAULT_THEME.localWidth, 0.1, 20),
    roadOpacity: clamp(Number(theme.roadOpacity) || DEFAULT_THEME.roadOpacity, 0.05, 1),
  };
}

function normalizeOneway(onewayValue) {
  if (onewayValue === undefined || onewayValue === null) {
    return "no";
  }

  const value = String(onewayValue).toLowerCase().trim();

  if (["yes", "true", "1"].includes(value)) {
    return "forward";
  }

  if (value === "-1") {
    return "reverse";
  }

  return "no";
}

function pickRoadClass(highwayType) {
  return HIGHWAY_BUCKETS[highwayType] || "local";
}

function sanitizeToken(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "unknown";
}

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractRoads(overpassPayload) {
  const nodeById = new Map();
  const roads = [];

  for (const element of overpassPayload.elements) {
    if (element.type === "node") {
      nodeById.set(element.id, {
        id: element.id,
        lat: element.lat,
        lon: element.lon,
      });
    }
  }

  for (const element of overpassPayload.elements) {
    if (element.type !== "way") {
      continue;
    }

    const highway = element.tags?.highway;

    if (!highway || !Array.isArray(element.nodes) || element.nodes.length < 2) {
      continue;
    }

    const resolvedNodes = element.nodes
      .map((id) => nodeById.get(id))
      .filter(Boolean);

    if (resolvedNodes.length < 2) {
      continue;
    }

    const tags = element.tags || {};

    roads.push({
      wayId: element.id,
      highway,
      name: tags.name || null,
      ref: tags.ref || null,
      oneway: normalizeOneway(tags.oneway),
      tags,
      nodes: resolvedNodes,
    });
  }

  return roads;
}

function roadsToGeoJSON(roads, meta) {
  return {
    type: "FeatureCollection",
    metadata: meta,
    features: roads.map((road) => ({
      type: "Feature",
      id: `way-${road.wayId}`,
      properties: {
        wayId: road.wayId,
        highway: road.highway,
        name: road.name,
        ref: road.ref,
        oneway: road.oneway,
        lanes: road.tags.lanes || null,
        maxspeed: road.tags.maxspeed || null,
        surface: road.tags.surface || null,
        bridge: road.tags.bridge || null,
        tunnel: road.tags.tunnel || null,
      },
      geometry: {
        type: "LineString",
        coordinates: road.nodes.map((node) => [node.lon, node.lat]),
      },
    })),
  };
}

function projectRoads(roads, theme) {
  const nodeProjection = new Map();
  const mercatorByNode = new Map();

  for (const road of roads) {
    for (const node of road.nodes) {
      if (!mercatorByNode.has(node.id)) {
        mercatorByNode.set(node.id, toWebMercator(node.lat, node.lon));
      }
    }
  }

  const mercatorValues = Array.from(mercatorByNode.values());

  const minX = Math.min(...mercatorValues.map((point) => point.x));
  const maxX = Math.max(...mercatorValues.map((point) => point.x));
  const minY = Math.min(...mercatorValues.map((point) => point.y));
  const maxY = Math.max(...mercatorValues.map((point) => point.y));

  const mercatorWidth = Math.max(maxX - minX, 1);
  const mercatorHeight = Math.max(maxY - minY, 1);

  const innerWidth = Math.max(theme.canvasWidth - theme.padding * 2, 1);
  const innerHeight = Math.max(theme.canvasHeight - theme.padding * 2, 1);

  const scale = Math.min(innerWidth / mercatorWidth, innerHeight / mercatorHeight);
  const fittedWidth = mercatorWidth * scale;
  const fittedHeight = mercatorHeight * scale;

  const offsetX = theme.padding + (innerWidth - fittedWidth) / 2;
  const offsetY = theme.padding + (innerHeight - fittedHeight) / 2;

  for (const [nodeId, mercatorPoint] of mercatorByNode.entries()) {
    const normalizedX = offsetX + (mercatorPoint.x - minX) * scale;
    const normalizedY = offsetY + (mercatorPoint.y - minY) * scale;

    nodeProjection.set(nodeId, {
      x: normalizedX,
      y: theme.canvasHeight - normalizedY,
    });
  }

  const projectedRoads = roads.map((road) => ({
    ...road,
    projectedNodes: road.nodes
      .map((node) => {
        const projected = nodeProjection.get(node.id);

        if (!projected) {
          return null;
        }

        return {
          ...projected,
          id: node.id,
          lat: node.lat,
          lon: node.lon,
        };
      })
      .filter(Boolean),
  }));

  return {
    nodeProjection,
    projectedRoads,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      scale,
    },
  };
}

function buildGraph(roads, nodeProjection, meta) {
  const nodes = new Map();
  const edges = [];

  function ensureNode(node) {
    if (!nodes.has(node.id)) {
      const projected = nodeProjection.get(node.id);

      nodes.set(node.id, {
        id: node.id,
        lat: node.lat,
        lon: node.lon,
        x: projected?.x ?? null,
        y: projected?.y ?? null,
        degree: 0,
      });
    }

    return nodes.get(node.id);
  }

  for (const road of roads) {
    for (let i = 0; i < road.nodes.length - 1; i += 1) {
      const start = road.nodes[i];
      const end = road.nodes[i + 1];

      const startNode = ensureNode(start);
      const endNode = ensureNode(end);

      const isForward = road.oneway === "forward";
      const isReverse = road.oneway === "reverse";
      const isBidirectional = road.oneway === "no";

      const from = isReverse ? endNode : startNode;
      const to = isReverse ? startNode : endNode;

      edges.push({
        id: `edge-${road.wayId}-${i}`,
        from: from.id,
        to: to.id,
        wayId: road.wayId,
        highway: road.highway,
        name: road.name,
        directed: !isBidirectional,
        oneway: road.oneway,
        lengthMeters: Number(
          haversineDistanceMeters({ lat: from.lat, lon: from.lon }, { lat: to.lat, lon: to.lon }).toFixed(2),
        ),
      });

      from.degree += 1;
      to.degree += 1;

      if (isBidirectional) {
        edges.push({
          id: `edge-${road.wayId}-${i}-rev`,
          from: to.id,
          to: from.id,
          wayId: road.wayId,
          highway: road.highway,
          name: road.name,
          directed: false,
          oneway: "no",
          lengthMeters: Number(
            haversineDistanceMeters(
              { lat: to.lat, lon: to.lon },
              { lat: from.lat, lon: from.lon },
            ).toFixed(2),
          ),
        });
      }
    }
  }

  return {
    metadata: meta,
    nodes: Array.from(nodes.values()),
    edges,
  };
}

function buildPathData(points) {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    })
    .join(" ");
}

function renderSvg(projectedRoads, theme, meta) {
  const drawingOrder = {
    local: 0,
    minor: 1,
    major: 2,
  };

  const sorted = [...projectedRoads].sort((a, b) => {
    const bucketA = pickRoadClass(a.highway);
    const bucketB = pickRoadClass(b.highway);

    return drawingOrder[bucketA] - drawingOrder[bucketB];
  });

  const paths = sorted
    .filter((road) => road.projectedNodes.length >= 2)
    .map((road) => {
      const roadClass = pickRoadClass(road.highway);
      const classes = [
        "road",
        `road-${roadClass}`,
        `highway-${sanitizeToken(road.highway)}`,
      ];

      if (road.oneway === "forward") {
        classes.push("oneway-forward");
      } else if (road.oneway === "reverse") {
        classes.push("oneway-reverse");
      }

      const d = buildPathData(road.projectedNodes);

      return `<path id="road-way-${road.wayId}" class="${classes.join(" ")}" data-way-id="${road.wayId}" data-highway="${escapeXmlAttr(
        road.highway,
      )}" data-name="${escapeXmlAttr(road.name || "")}" data-oneway="${road.oneway}" d="${d}" />`;
    })
    .join("\n");

  const style = `
:root {
  --road-major: ${theme.majorColor};
  --road-minor: ${theme.minorColor};
  --road-local: ${theme.localColor};
}
.road {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  opacity: ${theme.roadOpacity};
}
.road-major { stroke: var(--road-major); stroke-width: ${theme.majorWidth}; }
.road-minor { stroke: var(--road-minor); stroke-width: ${theme.minorWidth}; }
.road-local { stroke: var(--road-local); stroke-width: ${theme.localWidth}; }
`.trim();

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${theme.canvasWidth}" height="${theme.canvasHeight}" viewBox="0 0 ${theme.canvasWidth} ${theme.canvasHeight}" role="img" aria-labelledby="title desc">
  <title id="title">Roadgraph SVG</title>
  <desc id="desc">Minimal scriptable road network rendered from OpenStreetMap around ${meta.center.lat.toFixed(
    5,
  )}, ${meta.center.lon.toFixed(5)}.</desc>
  <metadata>${escapeXmlText(JSON.stringify(meta))}</metadata>
  <defs>
    <style>${style}</style>
  </defs>
  <rect x="0" y="0" width="${theme.canvasWidth}" height="${theme.canvasHeight}" fill="${theme.backgroundColor}" />
  <g id="roads-layer">
    ${paths}
  </g>
</svg>`;
}

export async function generateRoadGraph(options) {
  const {
    lat,
    lon,
    areaMode,
    radiusMeters,
    squareLengthMeters,
    includeHighways,
    includeGraph,
    theme,
  } = options;

  const startedAt = Date.now();
  const overpass = await fetchOverpassData({
    lat,
    lon,
    areaMode,
    radiusMeters,
    squareLengthMeters,
    includeHighways,
  });

  const roads = extractRoads(overpass.payload);

  if (roads.length === 0) {
    throw new Error("No roads were found for the selected area. Increase area size or move the map center.");
  }

  const normalizedTheme = normalizeTheme(theme);
  const projection = projectRoads(roads, normalizedTheme);

  const meta = {
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap / Overpass API",
    overpassEndpoint: overpass.endpoint,
    center: { lat, lon },
    areaMode,
    radiusMeters: areaMode === "radius" ? radiusMeters : null,
    squareLengthMeters: areaMode === "square" ? squareLengthMeters : null,
    includeHighways,
    theme: normalizedTheme,
    elapsedMs: Date.now() - startedAt,
  };

  const roadsGeojson = roadsToGeoJSON(roads, meta);
  const graph = includeGraph ? buildGraph(roads, projection.nodeProjection, meta) : null;
  const mapSvg = renderSvg(projection.projectedRoads, normalizedTheme, meta);

  return {
    meta,
    stats: {
      roads: roads.length,
      nodes: projection.nodeProjection.size,
      edges: graph ? graph.edges.length : null,
    },
    mapSvg,
    roadsGeojson,
    graph,
    overpassQuery: overpass.query,
  };
}
