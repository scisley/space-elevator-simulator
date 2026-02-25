#!/usr/bin/env node
/**
 * Downloads high-resolution textures for the space elevator simulator.
 *
 * Builds an 8K (8192x4096) cloud-free Earth daymap from NASA GIBS tiles
 * (BlueMarble_ShadedRelief_Bathymetry, EPSG:4326).
 *
 * Fetches 200 tiles at zoom 4 (10240x5120), then downscales to 8192x4096.
 *
 * Usage: node scripts/download-textures.mjs [--force]
 * Output: public/textures/8k_earth_daymap.jpg
 *
 * Requires: sharp (npm install --save-dev sharp)
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'textures');
const OUTPUT_FILE = join(OUTPUT_DIR, '8k_earth_daymap.jpg');
const FORCE = process.argv.includes('--force');

// GIBS EPSG:4326 tile parameters
// Zoom 4: 20 cols x 10 rows of 512px tiles = 10240x5120, downscaled to 8192x4096
const TILE_SIZE = 512;
const ZOOM = 4;
const COLS = 20;
const ROWS = 10;
const RAW_W = COLS * TILE_SIZE; // 10240
const RAW_H = ROWS * TILE_SIZE; // 5120
const OUT_W = 8192;
const OUT_H = 4096;
const MAX_CONCURRENT = 8;

// Cloud-free shaded relief (no bathymetry — oceans are flat blue)
const TILE_URL = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief/default/0/500m';

async function fetchTile(col, row) {
  const url = `${TILE_URL}/${ZOOM}/${row}/${col}.jpeg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tile ${col},${row}: HTTP ${res.status}`);
  return { col, row, buf: Buffer.from(await res.arrayBuffer()) };
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  if (existsSync(OUTPUT_FILE) && !FORCE) {
    console.log(`Skipping — already exists at ${OUTPUT_FILE}`);
    console.log('Use --force to re-download.');
    return;
  }

  console.log(`Building cloud-free 8K Earth daymap from NASA GIBS tiles...`);
  console.log(`  ${COLS}x${ROWS} = ${COLS * ROWS} tiles at zoom ${ZOOM}`);

  // Build task list
  const tasks = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      tasks.push({ col, row });
    }
  }

  // Fetch with concurrency limit
  const results = [];
  let completed = 0;
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      const { col, row } = tasks[i];
      results.push(await fetchTile(col, row));
      completed++;
      if (completed % 20 === 0 || completed === tasks.length) {
        process.stdout.write(`\r  Downloaded ${completed}/${tasks.length} tiles`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < MAX_CONCURRENT; i++) workers.push(worker());
  await Promise.all(workers);
  console.log('');

  // Composite tiles onto raw image, then downscale to 8K
  // NOTE: sharp applies resize BEFORE composite in a single pipeline, so we must
  // split into two steps: composite at full resolution, then resize separately.
  console.log(`  Compositing ${RAW_W}x${RAW_H} → resizing to ${OUT_W}x${OUT_H}...`);

  const composites = results.map(({ col, row, buf }) => ({
    input: buf,
    top: row * TILE_SIZE,
    left: col * TILE_SIZE,
  }));

  // Step 1: composite tiles at full resolution
  const fullRes = await sharp({
    create: {
      width: RAW_W,
      height: RAW_H,
      channels: 3,
      background: { r: 26, g: 60, b: 90 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  // Step 2: resize to 8K and encode as JPEG
  const output = await sharp(fullRes)
    .resize(OUT_W, OUT_H, { kernel: 'lanczos3' })
    .jpeg({ quality: 92 })
    .toBuffer();

  writeFileSync(OUTPUT_FILE, output);

  const sizeMB = (output.length / 1024 / 1024).toFixed(1);
  console.log(`  Saved ${OUTPUT_FILE} (${sizeMB} MB)`);

  // Also generate 4K variant for mobile
  const OUTPUT_4K = join(OUTPUT_DIR, '4k_earth_daymap.jpg');
  console.log(`  Resizing to 4096x2048 for mobile...`);
  const output4k = await sharp(fullRes)
    .resize(4096, 2048, { kernel: 'lanczos3' })
    .jpeg({ quality: 88 })
    .toBuffer();
  writeFileSync(OUTPUT_4K, output4k);
  const size4kMB = (output4k.length / 1024 / 1024).toFixed(1);
  console.log(`  Saved ${OUTPUT_4K} (${size4kMB} MB)`);

  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
