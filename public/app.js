const DEFAULT_CENTER = {
  lat: 40.73061,
  lon: -73.935242,
};

const formatMeters = new Intl.NumberFormat("en-US");

const elements = {
  form: document.getElementById("controls-form"),
  lat: document.getElementById("lat-input"),
  lon: document.getElementById("lon-input"),
  radiusField: document.getElementById("radius-field"),
  squareField: document.getElementById("square-field"),
  radiusInput: document.getElementById("radius-input"),
  squareInput: document.getElementById("square-input"),
  radiusValue: document.getElementById("radius-value"),
  squareValue: document.getElementById("square-value"),
  centerReadout: document.getElementById("center-readout"),
  areaReadout: document.getElementById("area-readout"),
  mapModeBadge: document.getElementById("map-mode-badge"),
  generateBtn: document.getElementById("generate-btn"),
  statusLine: document.getElementById("status-line"),
  roadsStat: document.getElementById("roads-stat"),
  nodesStat: document.getElementById("nodes-stat"),
  edgesStat: document.getElementById("edges-stat"),
  previewImage: document.getElementById("svg-preview"),
  previewEmpty: document.querySelector(".preview-empty"),
  includeGraph: document.getElementById("include-graph"),
  backgroundColor: document.getElementById("background-color"),
  majorColor: document.getElementById("major-color"),
  minorColor: document.getElementById("minor-color"),
  localColor: document.getElementById("local-color"),
  majorWidth: document.getElementById("major-width"),
  minorWidth: document.getElementById("minor-width"),
  localWidth: document.getElementById("local-width"),
  canvasWidth: document.getElementById("canvas-width"),
  canvasHeight: document.getElementById("canvas-height"),
  downloads: Array.from(document.querySelectorAll("[data-download]")),
  tabBtns: Array.from(document.querySelectorAll(".tab-btn")),
  tabPanes: Array.from(document.querySelectorAll(".tab-pane")),
};

let map;
let marker;
let radiusOverlay;
let squareOverlay;
let latestFiles = null;
let previewBlobUrl = null;
let inputSyncTimer = null;
let rateLimitInterval = null;

function startRateLimitTimer(waitTimeSeconds) {
  elements.generateBtn.disabled = true;
  let remaining = waitTimeSeconds;

  if (rateLimitInterval) clearInterval(rateLimitInterval);

  const tick = () => {
    if (remaining <= 0) {
      clearInterval(rateLimitInterval);
      setStatus("Ready. You may generate again.");
      elements.generateBtn.disabled = false;
    } else {
      setStatus(`Rate limit reached. Please wait ${remaining}s...`, true);
      remaining -= 1;
    }
  };

  tick();
  rateLimitInterval = setInterval(tick, 1000);
}

function toFixedCoord(value) {
  return Number(value).toFixed(6);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function metersToLatDegrees(meters) {
  return meters / 111_320;
}

function metersToLonDegrees(meters, lat) {
  const safeCos = Math.max(Math.cos(toRadians(lat)), 0.0001);
  return meters / (111_320 * safeCos);
}

function selectedAreaMode() {
  return document.querySelector('input[name="areaMode"]:checked')?.value || "radius";
}

function selectedHighways() {
  return Array.from(document.querySelectorAll("#highway-grid input[type='checkbox']:checked")).map(
    (input) => input.value,
  );
}

function currentCenter() {
  return {
    lat: parseNumber(elements.lat.value, DEFAULT_CENTER.lat),
    lon: parseNumber(elements.lon.value, DEFAULT_CENTER.lon),
  };
}

function squareBoundsFromCenter(lat, lon, lengthMeters) {
  const half = lengthMeters / 2;
  const latOffset = metersToLatDegrees(half);
  const lonOffset = metersToLonDegrees(half, lat);

  return [
    [lat - latOffset, lon - lonOffset],
    [lat + latOffset, lon + lonOffset],
  ];
}

function setStatus(message, isError = false) {
  elements.statusLine.textContent = message;
  elements.statusLine.style.color = isError ? "#ff8fbd" : "";
}

function updateStatDisplay(stats = {}) {
  elements.roadsStat.textContent = stats.roads ?? "-";
  elements.nodesStat.textContent = stats.nodes ?? "-";
  elements.edgesStat.textContent = stats.edges ?? "-";
}

function updateRangeTrack(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 1);
  const value = Number(input.value || min);
  const percent = ((value - min) / (max - min)) * 100;
  input.style.setProperty("--track-fill", `${Math.max(0, Math.min(100, percent))}%`);
}

function updateAreaValueLabels() {
  const radius = parseNumber(elements.radiusInput.value, 1800);
  const square = parseNumber(elements.squareInput.value, 2600);

  updateRangeTrack(elements.radiusInput);
  updateRangeTrack(elements.squareInput);

  elements.radiusValue.textContent = `${formatMeters.format(radius)} m`;
  elements.squareValue.textContent = `${formatMeters.format(square)} m`;

  if (selectedAreaMode() === "radius") {
    elements.areaReadout.textContent = `Radius · ${formatMeters.format(radius)} m`;
    if (elements.mapModeBadge) {
      elements.mapModeBadge.textContent = `◉ RADIUS · ${formatMeters.format(radius)} m`;
      elements.mapModeBadge.className = "map-mode-badge map-mode-radius";
    }
  } else {
    elements.areaReadout.textContent = `Square · ${formatMeters.format(square)} m`;
    if (elements.mapModeBadge) {
      elements.mapModeBadge.textContent = `▢ SQUARE · ${formatMeters.format(square)} m`;
      elements.mapModeBadge.className = "map-mode-badge map-mode-square";
    }
  }
}

function updateAreaOverlay() {
  if (!map || !radiusOverlay || !squareOverlay) {
    return;
  }

  const { lat, lon } = currentCenter();
  const radius = parseNumber(elements.radiusInput.value, 1800);
  const squareLength = parseNumber(elements.squareInput.value, 2600);
  const mode = selectedAreaMode();

  radiusOverlay.setLatLng([lat, lon]);
  radiusOverlay.setRadius(radius);

  squareOverlay.setBounds(squareBoundsFromCenter(lat, lon, squareLength));

  if (mode === "radius") {
    if (!map.hasLayer(radiusOverlay)) {
      radiusOverlay.addTo(map);
    }
    if (map.hasLayer(squareOverlay)) {
      map.removeLayer(squareOverlay);
    }
  } else {
    if (!map.hasLayer(squareOverlay)) {
      squareOverlay.addTo(map);
    }
    if (map.hasLayer(radiusOverlay)) {
      map.removeLayer(radiusOverlay);
    }
  }
}

function updateAreaFieldVisibility() {
  const mode = selectedAreaMode();
  const radiusHidden = mode !== "radius";
  elements.radiusField.classList.toggle("is-hidden", radiusHidden);
  elements.squareField.classList.toggle("is-hidden", !radiusHidden);
  updateAreaValueLabels();
  updateAreaOverlay();
}

function updateCenterInputs(lat, lon) {
  elements.lat.value = toFixedCoord(lat);
  elements.lon.value = toFixedCoord(lon);
  elements.centerReadout.textContent = `Lat ${Number(lat).toFixed(5)} · Lon ${Number(lon).toFixed(5)}`;
}

function setMapCenter(lat, lon, shouldPan = true) {
  const clampedLat = Math.max(-90, Math.min(90, lat));
  // Wrap longitude instead of clamping it (-180 to 180)
  const wrappedLon = ((lon % 360) + 540) % 360 - 180;

  updateCenterInputs(clampedLat, wrappedLon);
  marker.setLatLng([clampedLat, wrappedLon]);

  if (shouldPan) {
    map.panTo([clampedLat, wrappedLon], { animate: true, duration: 0.35 });
  }

  updateAreaOverlay();
}

function buildPayload() {
  const lat = parseNumber(elements.lat.value, DEFAULT_CENTER.lat);
  const lon = parseNumber(elements.lon.value, DEFAULT_CENTER.lon);
  const areaMode = selectedAreaMode();

  return {
    center: {
      lat,
      lon,
    },
    area: {
      mode: areaMode,
      radiusMeters: parseNumber(elements.radiusInput.value, 1800),
      squareLengthMeters: parseNumber(elements.squareInput.value, 2600),
    },
    include: {
      highways: selectedHighways(),
      graph: elements.includeGraph.checked,
    },
    theme: {
      backgroundColor: elements.backgroundColor.value,
      majorColor: elements.majorColor.value,
      minorColor: elements.minorColor.value,
      localColor: elements.localColor.value,
      majorWidth: parseNumber(elements.majorWidth.value, 3.6),
      minorWidth: parseNumber(elements.minorWidth.value, 2.2),
      localWidth: parseNumber(elements.localWidth.value, 1.25),
      canvasWidth: parseNumber(elements.canvasWidth.value, 1200),
      canvasHeight: parseNumber(elements.canvasHeight.value, 900),
    },
  };
}

function mimeTypeFor(fileName) {
  if (fileName.endsWith(".svg")) {
    return "image/svg+xml;charset=utf-8";
  }

  return "application/json;charset=utf-8";
}

function setDownloadState(files) {
  elements.downloads.forEach((button) => {
    const key = button.dataset.download;
    button.disabled = !files || !files[key];
  });
}

function updateSvgPreview(svgContent) {
  if (previewBlobUrl) {
    URL.revokeObjectURL(previewBlobUrl);
  }

  const svgBlob = new Blob([svgContent], {
    type: "image/svg+xml;charset=utf-8",
  });

  previewBlobUrl = URL.createObjectURL(svgBlob);
  elements.previewImage.src = previewBlobUrl;
  elements.previewImage.style.display = "block";

  if (elements.previewEmpty) {
    elements.previewEmpty.style.display = "none";
  }
}

async function runGeneration() {
  const payload = buildPayload();

  elements.generateBtn.disabled = true;
  setStatus("Generating map.svg and graph data...");

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      if (response.status === 429 && result.waitTime) {
        startRateLimitTimer(result.waitTime);
        return; // keep disabled until timer finishes
      }
      throw new Error(result.error || "Generation failed.");
    }

    latestFiles = result.files;
    setDownloadState(latestFiles);
    updateStatDisplay(result.stats);

    if (latestFiles["map.svg"]) {
      updateSvgPreview(latestFiles["map.svg"]);
    }

    const elapsed = result.meta?.elapsedMs ? `${result.meta.elapsedMs}ms` : "done";
    setStatus(`Generated successfully in ${elapsed}.`);
    elements.generateBtn.disabled = false;

    // Auto-switch to results tab on successful generation
    switchTab("result-tab");
  } catch (error) {
    setStatus(error.message || "Failed to generate output files.", true);
    elements.generateBtn.disabled = false;
  }
}

function downloadContent(fileName, content) {
  const blob = new Blob([content], {
    type: mimeTypeFor(fileName),
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function switchTab(tabId) {
  elements.tabBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  elements.tabPanes.forEach(pane => {
    pane.classList.toggle("active", pane.id === tabId);
  });

  if (tabId === "map-tab" && map) {
    // Invalidate map size so Leaflet redrawing works flawlessly after being hidden
    setTimeout(() => map.invalidateSize(), 10);
  }
}

function bindEvents() {
  elements.tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab);
    });
  });

  document.querySelectorAll('input[name="areaMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      updateAreaFieldVisibility();
    });
  });

  [elements.radiusInput, elements.squareInput].forEach((input) => {
    input.addEventListener("input", () => {
      updateAreaValueLabels();
      updateAreaOverlay();
    });
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    runGeneration();
  });

  elements.downloads.forEach((button) => {
    button.addEventListener("click", () => {
      const fileName = button.dataset.download;

      if (!latestFiles || !latestFiles[fileName]) {
        return;
      }

      downloadContent(fileName, latestFiles[fileName]);
    });
  });

  [elements.lat, elements.lon].forEach((input) => {
    input.addEventListener("input", () => {
      clearTimeout(inputSyncTimer);
      inputSyncTimer = window.setTimeout(() => {
        const lat = parseNumber(elements.lat.value, DEFAULT_CENTER.lat);
        const lon = parseNumber(elements.lon.value, DEFAULT_CENTER.lon);
        setMapCenter(lat, lon, true);
      }, 220);
    });
  });
}

function initMap() {
  map = L.map("map", {
    zoomControl: true,
    minZoom: 4,
    maxZoom: 18,
    worldCopyJump: true,
  }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lon], 13);

  map.createPane("selectionPane");
  map.getPane("selectionPane").style.zIndex = "450";
  map.getPane("selectionPane").style.pointerEvents = "none";

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
  }).addTo(map);

  const markerIcon = L.divIcon({
    className: "center-marker-wrap",
    html: '<span class="center-marker-pulse"></span><span class="center-marker-dot"></span>',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

  marker = L.marker([DEFAULT_CENTER.lat, DEFAULT_CENTER.lon], {
    draggable: true,
    autoPan: true,
    icon: markerIcon,
  }).addTo(map);

  radiusOverlay = L.circle([DEFAULT_CENTER.lat, DEFAULT_CENTER.lon], {
    pane: "selectionPane",
    radius: parseNumber(elements.radiusInput.value, 1800),
    color: "#00f5ff",
    weight: 4,
    fillColor: "#00f5ff",
    fillOpacity: 0.35,
    dashArray: "0",
    className: "selection-overlay radius-overlay",
  });

  squareOverlay = L.rectangle(
    squareBoundsFromCenter(
      DEFAULT_CENTER.lat,
      DEFAULT_CENTER.lon,
      parseNumber(elements.squareInput.value, 2600),
    ),
    {
      pane: "selectionPane",
      color: "#ff0090",
      weight: 4,
      fillColor: "#ff0090",
      fillOpacity: 0.35,
      dashArray: "0",
      className: "selection-overlay square-overlay",
    },
  );

  marker.on("drag", () => {
    const position = marker.getLatLng().wrap();
    updateCenterInputs(position.lat, position.lng);
    updateAreaOverlay();
  });

  marker.on("dragend", () => {
    const position = marker.getLatLng().wrap();
    marker.setLatLng(position);
    updateCenterInputs(position.lat, position.lng);
    updateAreaOverlay();
    map.panTo(position, { animate: true, duration: 0.25 });
  });

  map.on("click", (event) => {
    const position = event.latlng.wrap();
    marker.setLatLng(position);
    updateCenterInputs(position.lat, position.lng);
    updateAreaOverlay();
  });

  updateAreaOverlay();
}

function initialize() {
  updateCenterInputs(DEFAULT_CENTER.lat, DEFAULT_CENTER.lon);
  updateAreaValueLabels();
  updateAreaFieldVisibility();
  updateStatDisplay();
  setDownloadState(null);
  bindEvents();
  initMap();
}

initialize();
