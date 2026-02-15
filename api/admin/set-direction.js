import { kv } from '@vercel/kv';

const CABLE_LENGTH = 100000;

function computeAltitude(state) {
  const elapsed = (Date.now() - state.startTimeMs) / 3_600_000;
  const alt = state.startAltitudeKm + state.direction * state.speedKmh * elapsed;
  return Math.max(0, Math.min(CABLE_LENGTH, alt));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { direction } = req.body;
  if (![1, 0, -1].includes(direction)) {
    return res.status(400).json({ error: 'Invalid direction' });
  }

  const state = await kv.get('simulation_state') || {
    startAltitudeKm: 0, startTimeMs: Date.now(), speedKmh: 190, direction: 1
  };

  const currentAlt = computeAltitude(state);

  await kv.set('simulation_state', {
    startAltitudeKm: currentAlt,
    startTimeMs: Date.now(),
    speedKmh: state.speedKmh || 190,
    direction,
  });

  return res.status(200).json({ ok: true });
}
