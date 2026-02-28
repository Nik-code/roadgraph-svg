import { generateRoadGraph } from "../../server/lib/roadgraph.js";

const rateLimitMap = new Map();

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
    let lon = parseNumber(center.lon, 0);

    if (lat < -90 || lat > 90) {
        throw new Error("Latitude must be between -90 and 90.");
    }

    // Normalize longitude to automatically wrap between -180 and 180
    lon = ((lon % 360) + 540) % 360 - 180;

    const areaMode = area.mode === "square" ? "square" : "radius";
    const radiusMeters = Math.max(100, Math.min(parseNumber(area.radiusMeters, 1800), 7000));
    const squareLengthMeters = Math.max(
        100,
        Math.min(parseNumber(area.squareLengthMeters, 2600), 7000),
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

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "Method not allowed." });
    }

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";

    const now = Date.now();
    const windowMs = 60 * 1000;

    let record = rateLimitMap.get(ip);
    if (!record) {
        record = { count: 0, resetTime: now + windowMs };
        rateLimitMap.set(ip, record);
    }

    if (now > record.resetTime) {
        record.count = 0;
        record.resetTime = now + windowMs;
    }

    if (record.count >= 5) {
        record.count += 1;
        const waitTimeSeconds = Math.ceil((record.resetTime - now) / 1000);
        // Include the wait time explicitly in the error response payload
        return res.status(429).json({
            ok: false,
            error: `Rate limit exceeded. Please wait ${waitTimeSeconds} seconds before generating again.`,
            waitTime: waitTimeSeconds
        });
    }

    record.count += 1;

    try {
        const payload = normalizeRequestPayload(req.body);
        const result = await generateRoadGraph(payload);

        return res.status(200).json({
            ok: true,
            meta: result.meta,
            stats: result.stats,
            files: {
                "map.svg": result.mapSvg,
                "graph.json": result.graph ? JSON.stringify(result.graph, null, 2) : null,
            },
            overpassQuery: result.overpassQuery,
        });
    } catch (error) {
        return res.status(400).json({
            ok: false,
            error: error.message || "Request failed.",
        });
    }
}
