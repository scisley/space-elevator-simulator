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
};

function computeAltitude(s, now) {
  const elapsedHours = (now - s.startTimeMs) / 3_600_000;
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

// Admin API calls
export async function adminSetAltitude(altitudeKm) {
  try {
    await fetch('/api/admin/set-altitude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ altitudeKm }),
    });
    await pollServer();
  } catch { /* ignore */ }
}

export async function adminSetSpeed(speedKmh) {
  try {
    await fetch('/api/admin/set-speed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speedKmh }),
    });
    await pollServer();
  } catch { /* ignore */ }
}

export async function adminSetDirection(direction) {
  try {
    await fetch('/api/admin/set-direction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction }),
    });
    await pollServer();
  } catch { /* ignore */ }
}

export async function adminRestart() {
  try {
    await fetch('/api/admin/restart', { method: 'POST' });
    await pollServer();
  } catch { /* ignore */ }
}

// Start polling
export function startPolling() {
  pollServer();
  setInterval(pollServer, STATE_POLL_INTERVAL);
}
