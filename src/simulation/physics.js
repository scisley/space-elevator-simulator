import { EARTH_RADIUS, SURFACE_GRAVITY, EARTH_ROTATION_RATE, SKY_FULL_BLUE, SKY_FADE_END, GROUND_PLANE_FADE_START, GROUND_PLANE_FADE_END } from '../constants.js';

/**
 * Effective gravity at altitude h (km). Returns m/s².
 * Positive = toward Earth, Negative = away from Earth (above GEO).
 */
export function getEffectiveGravity(altitudeKm) {
  const R = EARTH_RADIUS; // km
  const r = R + altitudeKm; // km from center
  const gravitational = SURFACE_GRAVITY * (R / r) * (R / r); // m/s²
  const centrifugal = EARTH_ROTATION_RATE * EARTH_ROTATION_RATE * r * 1000; // convert km to m
  return gravitational - centrifugal;
}

/**
 * Sky blend factor: 1.0 = full blue sky, 0.0 = fully transparent (space)
 */
export function getSkyBlendFactor(altitudeKm) {
  if (altitudeKm <= SKY_FULL_BLUE) return 1.0;
  if (altitudeKm >= SKY_FADE_END) return 0.0;
  return 1.0 - (altitudeKm - SKY_FULL_BLUE) / (SKY_FADE_END - SKY_FULL_BLUE);
}

/**
 * Angular diameter of Earth in degrees as seen from altitude
 */
export function getEarthAngularDiameter(altitudeKm) {
  const r = EARTH_RADIUS + altitudeKm;
  return 2 * Math.asin(EARTH_RADIUS / r) * (180 / Math.PI);
}

/**
 * Atmosphere opacity (for glow effect). 0 at surface, peaks around 100-400 km, fades at higher altitudes.
 */
export function getAtmosphereOpacity(altitudeKm) {
  if (altitudeKm < 50) return 0;
  if (altitudeKm < 200) return (altitudeKm - 50) / 150;
  if (altitudeKm < 2000) return 1.0;
  if (altitudeKm < 20000) return 1.0 - (altitudeKm - 2000) / 18000 * 0.5;
  return 0.5;
}

/**
 * Ground plane opacity — visible at low altitudes, fades out.
 */
export function getGroundPlaneOpacity(altitudeKm) {
  if (altitudeKm <= GROUND_PLANE_FADE_START) return 1.0;
  if (altitudeKm >= GROUND_PLANE_FADE_END) return 0.0;
  return 1.0 - (altitudeKm - GROUND_PLANE_FADE_START) / (GROUND_PLANE_FADE_END - GROUND_PLANE_FADE_START);
}
