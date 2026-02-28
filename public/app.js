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
};

let map;
let marker;
let latestFiles = null;
let previewBlobUrl = null;
let inputSyncTimer = null;

function toFixedCoord(value) {
  return Number(value).toFixed(6);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectedAreaMode() {
  return document.querySelector('input[name="areaMode"]:checked')?.value || "radius";
}

function selectedHighways() {
  return Array.from(document.querySelectorAll("#highway-grid input[type='checkbox']:checked")).map(
    (input) => input.value,
  );
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

function updateAreaValueLabels() {
  const radius = parseNumber(elements.radiusInput.value, 1800);
  const square = parseNumber(elements.squareInput.value, 2600);
  elements.radiusValue.textContent = `${formatMeters.format(radius)} m`;
  elements.squareValue.textContent = `${formatMeters.format(square)} m`;

  if (selectedAreaMode() === "radius") {
    elements.areaReadout.textContent = `Radius · ${formatMeters.format(radius)} m`;
  } else {
    elements.areaReadout.textContent = `Square · ${formatMeters.format(square)} m`;
  }
}

function updateAreaFieldVisibility() {
  const mode = selectedAreaMode();
  const radiusHidden = mode !== "radius";
  elements.radiusField.classList.toggle("is-hidden", radiusHidden);
  elements.squareField.classList.toggle("is-hidden", !radiusHidden);
  updateAreaValueLabels();
}

function updateCenterInputs(lat, lon) {
  elements.lat.value = toFixedCoord(lat);
  elements.lon.value = toFixedCoord(lon);
  elements.centerReadout.textContent = `Lat ${Number(lat).toFixed(5)} · Lon ${Number(lon).toFixed(5)}`;
}

function setMapCenter(lat, lon, shouldPan = true) {
  const clampedLat = Math.max(-90, Math.min(90, lat));
  const clampedLon = Math.max(-180, Math.min(180, lon));

  updateCenterInputs(clampedLat, clampedLon);
  marker.setLatLng([clampedLat, clampedLon]);

  if (shouldPan) {
    map.panTo([clampedLat, clampedLon], { animate: true, duration: 0.35 });
  }
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
  setStatus("Generating map.svg, roads.geojson and graph data...");

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
  } catch (error) {
    setStatus(error.message || "Failed to generate output files.", true);
  } finally {
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

function bindEvents() {
  document.querySelectorAll('input[name="areaMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      updateAreaFieldVisibility();
    });
  });

  [elements.radiusInput, elements.squareInput].forEach((input) => {
    input.addEventListener("input", () => {
      updateAreaValueLabels();
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
  }).setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lon], 13);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 20,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO',
  }).addTo(map);

  marker = L.marker([DEFAULT_CENTER.lat, DEFAULT_CENTER.lon], {
    draggable: true,
    autoPan: true,
  }).addTo(map);

  marker.on("dragend", () => {
    const position = marker.getLatLng();
    updateCenterInputs(position.lat, position.lng);
    map.panTo(position, { animate: true, duration: 0.25 });
  });

  map.on("click", (event) => {
    marker.setLatLng(event.latlng);
    updateCenterInputs(event.latlng.lat, event.latlng.lng);
  });
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
