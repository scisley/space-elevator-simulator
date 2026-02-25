#!/usr/bin/env node
/**
 * Downloads the HYG v4.1 star catalog and processes it into a compact JSON file
 * for the space elevator simulator's starfield.
 *
 * Usage: node scripts/process-stars.mjs
 * Output: public/data/stars.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'stars.json');

const CATALOG_URL = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv';
const MAG_LIMIT = 6.5;
const RADIUS = 150000; // must match Stars.js starfield sphere radius
const DEFAULT_BV = 0.65; // solar-type fallback when B-V is missing

// Convert B-V color index to RGB using piecewise blackbody approximation
function bvToRGB(bv) {
  // Clamp to valid range
  bv = Math.max(-0.4, Math.min(2.0, bv));

  let r, g, b;

  // Red channel
  if (bv < 0.0) {
    r = 0.61 + 0.11 * bv + 0.1 * bv * bv;
  } else if (bv < 0.4) {
    r = 0.83 + (0.17 * bv) / 0.4;
  } else {
    r = 1.0;
  }

  // Green channel
  if (bv < 0.0) {
    g = 0.70 + 0.07 * bv + 0.1 * bv * bv;
  } else if (bv < 0.4) {
    g = 0.87 + 0.11 * bv;
  } else if (bv < 1.6) {
    g = 1.0 - 0.47 * (bv - 0.4) / 1.2;
  } else {
    g = 0.53 - 0.12 * (bv - 1.6) / 0.4;
  }

  // Blue channel
  if (bv < 0.4) {
    b = 1.0;
  } else if (bv < 1.5) {
    b = 1.0 - 0.68 * (bv - 0.4) / 1.1;
  } else {
    b = 0.32 - 0.15 * (bv - 1.5) / 0.5;
  }

  return [Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b))];
}

async function main() {
  console.log('Downloading HYG v4.1 catalog...');
  const response = await fetch(CATALOG_URL);
  if (!response.ok) {
    throw new Error(`Failed to download catalog: ${response.status} ${response.statusText}`);
  }
  const csv = await response.text();
  console.log(`Downloaded ${(csv.length / 1024 / 1024).toFixed(1)} MB`);

  const lines = csv.split('\n');
  const header = lines[0].split(',');

  // Find column indices (strip quotes and whitespace)
  const colIndex = {};
  header.forEach((name, i) => { colIndex[name.trim().replace(/^"|"$/g, '')] = i; });

  const raCol = colIndex['ra'];
  const decCol = colIndex['dec'];
  const magCol = colIndex['mag'];
  const ciCol = colIndex['ci']; // B-V color index

  if (raCol === undefined || decCol === undefined || magCol === undefined) {
    throw new Error(`Missing required columns. Found: ${header.join(', ')}`);
  }

  console.log(`Columns: ra=${raCol}, dec=${decCol}, mag=${magCol}, ci=${ciCol}`);

  // Process stars
  const stars = [];
  let skipped = 0;
  let brightest = Infinity;

  // First pass: find brightest magnitude
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const mag = parseFloat(cols[magCol]);
    if (isNaN(mag) || mag > MAG_LIMIT) continue;
    // Skip the Sun (mag ~ -26.7) — we render it separately
    if (mag < -2) continue;
    if (mag < brightest) brightest = mag;
  }

  console.log(`Brightest star magnitude: ${brightest.toFixed(2)}`);

  // Second pass: extract star data
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');

    const ra = parseFloat(cols[raCol]);   // hours
    const dec = parseFloat(cols[decCol]); // degrees
    const mag = parseFloat(cols[magCol]);

    if (isNaN(ra) || isNaN(dec) || isNaN(mag)) { skipped++; continue; }
    if (mag > MAG_LIMIT || mag < -2) continue;

    // Convert RA (hours) to radians, Dec (degrees) to radians
    const raRad = ra * (Math.PI / 12);
    const decRad = dec * (Math.PI / 180);

    // Convert to 3D position (celestial north pole = +Y)
    const cosD = Math.cos(decRad);
    const x = RADIUS * cosD * Math.cos(raRad);
    const y = RADIUS * Math.sin(decRad);
    const z = -RADIUS * cosD * Math.sin(raRad);

    // Point size: magnitude-linear with capped range for smoother distribution
    // pow(0.7) compresses the bright end so the biggest stars don't dominate
    const magRange = MAG_LIMIT - brightest;
    const t = (MAG_LIMIT - mag) / magRange;
    const size = 1.0 + 2.5 * Math.pow(t, 0.7);

    // Color from B-V index (spectral type only, no brightness scaling)
    const bv = ciCol !== undefined && cols[ciCol] !== '' ? parseFloat(cols[ciCol]) : NaN;
    const bvVal = isNaN(bv) ? DEFAULT_BV : bv;
    const [r, g, b] = bvToRGB(bvVal);

    // Round to reduce JSON size
    stars.push([
      Math.round(x * 10) / 10,
      Math.round(y * 10) / 10,
      Math.round(z * 10) / 10,
      Math.round(size * 100) / 100,
      Math.round(r * 1000) / 1000,
      Math.round(g * 1000) / 1000,
      Math.round(b * 1000) / 1000,
    ]);
  }

  console.log(`Processed ${stars.length} stars (skipped ${skipped} invalid rows)`);

  // Write output
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const output = JSON.stringify({ count: stars.length, stars });
  writeFileSync(OUTPUT_FILE, output);
  console.log(`Wrote ${OUTPUT_FILE} (${(output.length / 1024).toFixed(0)} KB)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
