import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await kv.set('simulation_state', {
    startAltitudeKm: 0,
    startTimeMs: Date.now(),
    speedKmh: 190,
    direction: 1,
  });

  return res.status(200).json({ ok: true });
}
