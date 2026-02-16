import * as THREE from 'three';

const TILE_SIZE = 256;
const GRID_SIZE = 8;
const CANVAS_SIZE = TILE_SIZE * GRID_SIZE; // 2048
const ZOOM = 8;
const MAX_CONCURRENT = 8;
// ShadedRelief is cloud-free with flat blue oceans (no bathymetry)
const TILE_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief/default/0/GoogleMapsCompatible_Level8';

/**
 * Convert lat/lon to tile x/y at a given zoom level (Web Mercator).
 */
function latLonToTile(lat, lon, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

/**
 * Convert tile x index to longitude (west edge of tile).
 */
function tileToLon(x, zoom) {
  return (x / 2 ** zoom) * 360 - 180;
}

/**
 * Convert tile y index to latitude (north edge of tile) using Mercator inverse.
 */
function tileToLat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Fetch a single tile, returning an ImageBitmap or null on failure.
 */
async function fetchTile(x, y) {
  const n = 2 ** ZOOM;
  // Wrap x to valid range
  const wx = ((x % n) + n) % n;
  // Clamp y
  if (y < 0 || y >= n) return null;

  const url = `${TILE_URL}/${ZOOM}/${y}/${wx}.jpeg`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

/**
 * Run an array of async functions with limited concurrency.
 */
async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(limit, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

/**
 * Create a grayscale texture that fades from white (center) to black (edges).
 * Used as alphaMap on the spherical patch for smooth edge blending.
 */
function createEdgeFadeTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  const fadeFraction = 0.15; // 15% fade on each edge
  const fadePixels = Math.round(size * fadeFraction);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      const dLeft = x / fadePixels;
      const dRight = (size - 1 - x) / fadePixels;
      const dTop = y / fadePixels;
      const dBottom = (size - 1 - y) / fadePixels;

      const alpha = Math.min(1, dLeft, dRight, dTop, dBottom);
      const val = Math.round(alpha * 255);

      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Load a regional high-res texture from NASA GIBS tiles.
 *
 * @param {number} anchorLat - Latitude of anchor point (degrees)
 * @param {number} anchorLon - Longitude of anchor point (degrees)
 * @returns {Promise<{texture: THREE.CanvasTexture, alphaMap: THREE.CanvasTexture, bounds: {latMin: number, latMax: number, lonMin: number, lonMax: number}}|null>}
 */
export async function loadRegionalTexture(anchorLat, anchorLon) {
  const center = latLonToTile(anchorLat, anchorLon, ZOOM);

  // 8x8 grid centered on anchor tile
  const halfGrid = Math.floor(GRID_SIZE / 2);
  const startX = center.x - halfGrid;
  const startY = center.y - halfGrid;

  // Build fetch tasks
  const tasks = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const tx = startX + col;
      const ty = startY + row;
      tasks.push(() => fetchTile(tx, ty));
    }
  }

  const images = await runWithConcurrency(tasks, MAX_CONCURRENT);

  // Check failure rate
  const failed = images.filter((img) => img === null).length;
  if (failed > tasks.length * 0.5) {
    return null;
  }

  // Composite onto canvas
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');

  // Fill with ocean blue fallback for any missing tiles
  ctx.fillStyle = '#1a3c5a';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const img = images[row * GRID_SIZE + col];
      if (img) {
        ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        img.close();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;

  const alphaMap = createEdgeFadeTexture();

  // Compute geographic bounds from tile indices
  const lonMin = tileToLon(startX, ZOOM);
  const lonMax = tileToLon(startX + GRID_SIZE, ZOOM);
  const latMax = tileToLat(startY, ZOOM);        // north edge (top row)
  const latMin = tileToLat(startY + GRID_SIZE, ZOOM); // south edge (bottom row)

  return { texture, alphaMap, bounds: { latMin, latMax, lonMin, lonMax } };
}
