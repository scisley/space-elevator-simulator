import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { altitudeKm } = req.body;
  if (typeof altitudeKm !== 'number' || altitudeKm < 0 || altitudeKm > 100000) {
    return res.status(400).json({ error: 'Invalid altitude' });
  }

  const state = await kv.get('simulation_state') || {};

  await kv.set('simulation_state', {
    startAltitudeKm: altitudeKm,
    startTimeMs: Date.now(),
    speedKmh: state.speedKmh || 190,
    direction: state.direction ?? 1,
  });

  return res.status(200).json({ ok: true });
}
