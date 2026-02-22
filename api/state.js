import { kv } from '@vercel/kv';

const CABLE_LENGTH = 100000;
const EARTH_RADIUS = 6371;
const SURFACE_GRAVITY = 9.80;
const EARTH_ROTATION_RATE = 7.2921e-5;

const DEFAULT_STATE = {
  startAltitudeKm: 0,
  startTimeMs: Date.now(),
  speedKmh: 300, // keep in sync with DEFAULT_SPEED_KMH in src/constants.js
  direction: 1,
};

function computeAltitude(state) {
  const elapsed = (Date.now() - state.startTimeMs) / 3_600_000;
  const alt = state.startAltitudeKm + state.direction * state.speedKmh * elapsed;
  return Math.max(0, Math.min(CABLE_LENGTH, alt));
}

function getEffectiveGravity(altitudeKm) {
  const R = EARTH_RADIUS;
  const r = R + altitudeKm;
  const gravitational = SURFACE_GRAVITY * (R / r) * (R / r);
  const centrifugal = EARTH_ROTATION_RATE * EARTH_ROTATION_RATE * r * 1000;
  return gravitational - centrifugal;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let state = await kv.get('simulation_state');
  if (!state) {
    state = DEFAULT_STATE;
    await kv.set('simulation_state', state);
  }

  const altitudeKm = computeAltitude(state);
  const effectiveGravityG = getEffectiveGravity(altitudeKm) / 9.80;

  return res.status(200).json({
    altitudeKm,
    speedKmh: state.speedKmh,
    direction: state.direction,
    effectiveGravityG,
    startAltitudeKm: state.startAltitudeKm,
    startTimeMs: state.startTimeMs,
  });
}
