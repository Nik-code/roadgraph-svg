# roadgraph-svg

`roadgraph-svg` generates clean, scriptable road maps from OpenStreetMap data.

## What It Does

Input:
- Latitude + Longitude using an embedded dark-mode map picker
- Area mode: `radius` (meters) or `square` (length in meters)
- Include filters for highway types
- SVG theme controls (colors, widths, canvas size)

Process:
1. Fetches road network data from Overpass API
2. Extracts highways + metadata (`highway`, `name`, `oneway`, etc.)
3. Projects geographic coordinates to 2D
4. Builds graph data (`nodes`, `edges`)
5. Renders semantic SVG paths with IDs/classes

Output:
- `map.svg`
- `roads.geojson`
- `graph.json` (optional)

## Local Run

1. Start local server:
```bash
npm run dev
```

2. Open:
- [http://localhost:8787](http://localhost:8787)

## API (Optional Direct Use)

`POST /api/generate`

Example payload:

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

## Notes

- This app uses live Overpass API requests, so internet access is required.
- No runtime dependencies are required beyond Node.js (18+).
- Generated SVG is structured for scripting:
  - Path IDs like `road-way-<osmWayId>`
  - Classes like `road-major`, `road-minor`, `highway-primary`, etc.

## Deploy Later

This project is deployment-ready as a simple Node app:
- Entry: `server/index.js`
- Static client: `public/`
- Port: `PORT` env var (defaults to `8787`)
