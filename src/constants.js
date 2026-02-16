// All units in km unless noted
export const EARTH_RADIUS = 6371;
export const CABLE_LENGTH = 100000;
export const GEO_ALTITUDE = 35786;
export const DEFAULT_SPEED_KMH = 190;
export const EARTH_ROTATION_RATE = 7.2921e-5; // rad/s
export const SURFACE_GRAVITY = 9.80; // m/s²
export const G_CONSTANT_SURFACE = SURFACE_GRAVITY; // m/s² at surface

// Anchor point: 0°N, 80°15'W (~10 miles off Ecuador coast)
export const ANCHOR_LAT = 0;
export const ANCHOR_LON = -80.25;

// Scene scale: 1 unit = 1 km
export const CABIN_SIZE = { width: 0.01, depth: 0.01, height: 0.004 }; // 10m x 10m x 4m in km
export const EYE_HEIGHT = 0.0017; // 1.7m in km

// Camera
export const NEAR_CLIP = 0.0001;
export const FAR_CLIP = 200000;

// Sky transition altitudes (km)
export const SKY_FULL_BLUE = 10;
export const SKY_FADE_END = 100;

// Atmosphere glow
export const ATMO_VISIBLE_ALT = 50;
export const ATMO_THICKNESS = 60; // visual thickness in km

// Ground plane fade
export const GROUND_PLANE_FADE_START = 50;
export const GROUND_PLANE_FADE_END = 300;

// Milestones
export const MILESTONES = [
  { altitude: 10, label: 'Commercial Aircraft Altitude', sublabel: '10 km' },
  { altitude: 100, label: 'Karman Line: Edge of Space', sublabel: '100 km' },
  { altitude: 408, label: 'ISS Orbit', sublabel: '408 km' },
  { altitude: 35786, label: 'Geostationary Orbit — Zero Gravity', sublabel: '35,786 km' },
  { altitude: 100000, label: 'Counterweight Station', sublabel: '100,000 km' },
];

// Sun / day-night cycle
export const SIDEREAL_DAY_S = 86164.1;  // 23h 56m 4.1s
export const SUN_ANGULAR_VELOCITY = (2 * Math.PI) / SIDEREAL_DAY_S;
export const SUN_DISTANCE = 149000;      // just inside starfield sphere (150k)
export const SUN_VISUAL_RADIUS = 2000;   // angular size ~0.77°

// Poll interval for server state (ms)
export const STATE_POLL_INTERVAL = 5000;

// Convert anchor lat/lon to radians
export const ANCHOR_LAT_RAD = ANCHOR_LAT * Math.PI / 180;
export const ANCHOR_LON_RAD = ANCHOR_LON * Math.PI / 180;
