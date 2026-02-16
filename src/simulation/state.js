import { STATE_POLL_INTERVAL, CABLE_LENGTH } from '../constants.js';
import { getEffectiveGravity } from './physics.js';

// Local simulation state
const state = {
  altitudeKm: 0,
  speedKmh: 190,
  direction: 1,
  effectiveGravityG: 1.0,
  startAltitudeKm: 0,
  startTimeMs: Date.now(),
  lastPollTime: 0,
  serverAvailable: false,
  timeScale: 1,
};

function computeAltitude(s, now) {
  const elapsedHours = (now - s.startTimeMs) / 3_600_000 * s.timeScale;
  const alt = s.startAltitudeKm + s.direction * s.speedKmh * elapsedHours;
  return Math.max(0, Math.min(CABLE_LENGTH, alt));
}

// Interpolate altitude locally between server polls
export function updateLocalState() {
  const now = Date.now();
  state.altitudeKm = computeAltitude(state, now);
  state.effectiveGravityG = getEffectiveGravity(state.altitudeKm) / 9.80;
}

export function getState() {
  return state;
}

// Poll the server for shared state
async function pollServer() {
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      const data = await res.json();
      state.startAltitudeKm = data.startAltitudeKm;
      state.startTimeMs = data.startTimeMs;
      state.speedKmh = data.speedKmh;
      state.direction = data.direction;
      state.altitudeKm = data.altitudeKm;
      state.effectiveGravityG = data.effectiveGravityG;
      state.serverAvailable = true;
    }
  } catch {
    // Server not available — use local state
    state.serverAvailable = false;
  }
  state.lastPollTime = Date.now();
}

// Update local segment state (used as fallback and after server calls)
function setLocalSegment(startAltitudeKm, speedKmh, direction) {
  state.startAltitudeKm = startAltitudeKm;
  state.startTimeMs = Date.now();
  state.speedKmh = speedKmh;
  state.direction = direction;
  updateLocalState();
}

// Admin API calls — fall back to local state if server unavailable
export async function adminSetAltitude(altitudeKm) {
  try {
    const res = await fetch('/api/admin/set-altitude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ altitudeKm }),
    });
    if (res.ok) { await pollServer(); return; }
  } catch { /* fall through */ }
  setLocalSegment(altitudeKm, state.speedKmh, state.direction);
}

export async function adminSetSpeed(speedKmh) {
  const currentAlt = computeAltitude(state, Date.now());
  try {
    const res = await fetch('/api/admin/set-speed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speedKmh }),
    });
    if (res.ok) { await pollServer(); return; }
  } catch { /* fall through */ }
  setLocalSegment(currentAlt, speedKmh, state.direction);
}

export async function adminSetDirection(direction) {
  const currentAlt = computeAltitude(state, Date.now());
  try {
    const res = await fetch('/api/admin/set-direction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    if (res.ok) { await pollServer(); return; }
  } catch { /* fall through */ }
  setLocalSegment(currentAlt, state.speedKmh, direction);
}

export function adminSetTimeScale(scale) {
  // Snapshot current altitude so changing scale doesn't cause a position jump
  const currentAlt = computeAltitude(state, Date.now());
  state.startAltitudeKm = currentAlt;
  state.startTimeMs = Date.now();
  state.timeScale = scale;
}

export async function adminRestart() {
  try {
    const res = await fetch('/api/admin/restart', { method: 'POST' });
    if (res.ok) { await pollServer(); return; }
  } catch { /* fall through */ }
  setLocalSegment(0, 190, 1);
}

// Start polling
export function startPolling() {
  pollServer();
  setInterval(pollServer, STATE_POLL_INTERVAL);
}
