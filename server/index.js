import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateRoadGraph } from "./lib/roadgraph.js";

const PORT = Number(process.env.PORT) || 8787;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const ALLOWED_HIGHWAYS = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "residential",
  "service",
  "unclassified",
  "living_street",
  "road",
]);

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRequestPayload(body = {}) {
  const center = body.center || {};
  const area = body.area || {};
  const include = body.include || {};

  const lat = parseNumber(center.lat, 0);
  const lon = parseNumber(center.lon, 0);

  if (lat < -90 || lat > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }

  if (lon < -180 || lon > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }

  const areaMode = area.mode === "square" ? "square" : "radius";
  const radiusMeters = Math.max(100, Math.min(parseNumber(area.radiusMeters, 1800), 25_000));
  const squareLengthMeters = Math.max(
    100,
    Math.min(parseNumber(area.squareLengthMeters, 2600), 30_000),
  );

  const includeHighways = Array.isArray(include.highways)
    ? include.highways
        .map((value) => String(value).trim())
        .filter((value) => ALLOWED_HIGHWAYS.has(value))
    : Array.from(ALLOWED_HIGHWAYS.values());

  if (includeHighways.length === 0) {
    throw new Error("Select at least one highway type to include.");
  }

  return {
    lat,
    lon,
    areaMode,
    radiusMeters,
    squareLengthMeters,
    includeHighways,
    includeGraph: include.graph !== false,
    theme: body.theme || {},
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large."));
      }
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", () => {
      reject(new Error("Failed to read request body."));
    });
  });
}

function filePathForRequest(pathname) {
  const decodedPath = decodeURIComponent(pathname);
  const normalized = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  const resolved = path.resolve(publicDir, normalized);
  const relative = path.relative(publicDir, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Forbidden path.");
  }

  return resolved;
}

async function serveStatic(pathname, res, method) {
  try {
    const filePath = filePathForRequest(pathname);
    const content = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": mimeType,
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=86400",
    });

    if (method === "HEAD") {
      res.end();
      return;
    }

    res.end(content);
  } catch {
    const ext = path.extname(pathname);
    const shouldFallbackToIndex = !ext;

    if (!shouldFallbackToIndex) {
      sendJson(res, 404, { ok: false, error: "Not found." });
      return;
    }

    const indexPath = path.join(publicDir, "index.html");
    const indexContent = await readFile(indexPath);

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });

    if (method === "HEAD") {
      res.end();
      return;
    }

    res.end(indexContent);
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (req.method === "GET" && requestUrl.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        service: "roadgraph-svg",
        time: new Date().toISOString(),
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/generate") {
      const body = await readJsonBody(req);
      const payload = normalizeRequestPayload(body);
      const result = await generateRoadGraph(payload);

      sendJson(res, 200, {
        ok: true,
        meta: result.meta,
        stats: result.stats,
        files: {
          "map.svg": result.mapSvg,
          "roads.geojson": JSON.stringify(result.roadsGeojson, null, 2),
          "graph.json": result.graph ? JSON.stringify(result.graph, null, 2) : null,
        },
        overpassQuery: result.overpassQuery,
      });
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(requestUrl.pathname, res, req.method);
      return;
    }

    sendJson(res, 405, {
      ok: false,
      error: "Method not allowed.",
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: error.message || "Request failed.",
    });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`roadgraph-svg running at http://localhost:${PORT}`);
});
