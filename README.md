# roadgraph-svg

Generate clean, scriptable SVG road maps from OpenStreetMap data. Pick a location, define an area (radius or square), choose highway types, and export map.svg, roads.geojson, and optional graph.json.

## Features

- **Interactive map picker** — Select center point via embedded Leaflet map with dark theme
- **Flexible area modes** — Radius (100–25,000 m) or square (100–30,000 m)
- **Highway filtering** — Include/exclude motorway, primary, secondary, tertiary, residential, and more
- **Semantic SVG output** — Paths with IDs (`road-way-<osmWayId>`) and classes (`road-major`, `highway-primary`) for scripting
- **Multiple outputs** — map.svg, roads.geojson, graph.json (nodes/edges)
- **Theme control** — Background, stroke colors, widths, canvas size
- **Zero external dependencies** — Node.js built-in HTTP; Overpass API for data

## Requirements

- **Node.js** 18+
- Internet access (Overpass API)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/<your-username>/roadgraph-svg.git
cd roadgraph-svg

# Install (no runtime deps; optional for scripts)
npm install

# Start the server
npm run dev
```

Open [http://localhost:8787](http://localhost:8787) and use the web UI.

### Alternative: Run without npm

```bash
node server/index.js
```

Port defaults to `8787`. Override with:

```bash
PORT=3000 node server/index.js
```

## Web UI

1. **Set location** — Enter lat/lon or click/drag the marker on the map
2. **Choose area mode** — Radius or square; adjust the size slider
3. **Configure extraction** — Toggle highway types; enable/disable graph.json
4. **Theme** — Set SVG colors and dimensions
5. **Generate** — Download map.svg, roads.geojson, graph.json

The map shows a live selection overlay (circle for radius, rectangle for square) that updates as you change the mode and size.

## API Reference

### `POST /api/generate`

Generate road map outputs from a JSON payload.

**Request body:**

| Field | Type | Description |
|-------|------|-------------|
| `center` | object | `{ lat, lon }` — center point |
| `area` | object | `mode`, `radiusMeters`, `squareLengthMeters` |
| `include` | object | `highways` (array), `graph` (boolean) |
| `theme` | object | SVG styling options |

**Example:**

```json
{
  "center": { "lat": 40.73061, "lon": -73.935242 },
  "area": {
    "mode": "radius",
    "radiusMeters": 1800,
    "squareLengthMeters": 2600
  },
  "include": {
    "highways": ["motorway", "primary", "secondary", "residential"],
    "graph": true
  },
  "theme": {
    "backgroundColor": "#101317",
    "majorColor": "#b7bcc5",
    "minorColor": "#6f7682",
    "localColor": "#3e4652",
    "majorWidth": 3.6,
    "minorWidth": 2.2,
    "localWidth": 1.25,
    "canvasWidth": 1200,
    "canvasHeight": 900
  }
}
```

**Response (200 OK):**

```json
{
  "ok": true,
  "meta": { "elapsedMs": 1234 },
  "stats": { "roads": 42, "nodes": 128, "edges": 86 },
  "files": {
    "map.svg": "<svg>...</svg>",
    "roads.geojson": "{...}",
    "graph.json": "{...}"
  },
  "overpassQuery": "[out:json]..."
}
```

**Errors (400):** Invalid payload; Overpass failure; no highways selected.

### `GET /api/health`

Health check. Returns `{ ok: true, service: "roadgraph-svg", time: "..." }`.

### Supported highway types

`motorway`, `motorway_link`, `trunk`, `trunk_link`, `primary`, `primary_link`, `secondary`, `secondary_link`, `tertiary`, `tertiary_link`, `residential`, `service`, `unclassified`, `living_street`, `road`

## Output formats

### map.svg

- Semantic path IDs: `road-way-<osmWayId>`
- Classes: `road-major`, `road-minor`, `road-local`, `highway-<type>` (e.g. `highway-primary`)
- Data attributes: `data-highway`, `data-name`, `data-oneway` where applicable

### roads.geojson

GeoJSON FeatureCollection with LineString geometries. Each feature has properties: `wayId`, `highway`, `name`, `ref`, `oneway`, `lanes`, `maxspeed`, `surface`, `bridge`, `tunnel`.

### graph.json

```json
{
  "nodes": [
    { "id": "node-123", "x": 100, "y": 200, "lat": 40.73, "lon": -73.93 }
  ],
  "edges": [
    { "from": "node-123", "to": "node-456", "wayId": 789, "highway": "primary" }
  ]
}
```

## Project structure

```
roadgraph-svg/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── package.json
├── public/
│   ├── index.html      # Web UI
│   ├── styles.css
│   └── app.js          # Client logic, Leaflet, API calls
└── server/
    ├── index.js        # HTTP server, static + API
    └── lib/
        ├── geo.js      # Web Mercator, haversine, bounding box
        ├── overpass.js  # Overpass API client
        └── roadgraph.js # Extraction, projection, graph, SVG, GeoJSON
```

## Deployment

The app is a standard Node.js HTTP server:

- **Entry:** `server/index.js`
- **Static files:** `public/`
- **Port:** `PORT` env var (default `8787`)

Deploy to any Node-friendly platform (Railway, Render, Fly.io, etc.). No database required; Overpass API calls happen at request time.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT. See [LICENSE](LICENSE).

---

**Before publishing:** Update the repository URL in `package.json` (`repository`, `bugs`, `homepage`) to point to your GitHub repo.
