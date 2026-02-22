// All units in km unless noted
export const EARTH_RADIUS = 6371;
export const CABLE_LENGTH = 100000;
export const GEO_ALTITUDE = 35786;
export const DEFAULT_SPEED_KMH = 300;
export const EARTH_ROTATION_RATE = 7.2921e-5; // rad/s
export const SURFACE_GRAVITY = 9.814; // m/s² (tuned so g=0 crossing matches GEO_ALTITUDE exactly)
export const G_CONSTANT_SURFACE = SURFACE_GRAVITY; // m/s² at surface

// Anchor point: 0°N, 80°15'W (~10 miles off Ecuador coast)
export const ANCHOR_LAT = 0;
export const ANCHOR_LON = -80.25;

// Scene scale: 1 unit = 1 km
export const CABIN_SIZE = { width: 0.01, depth: 0.01, height: 0.006 }; // 10m x 10m x 6m in km
export const EYE_HEIGHT = 0.0017; // 1.7m in km
export const GROUND_STATION_ALTITUDE = 0.01; // 10m — cable car rests on a platform above the surface

// Camera
export const NEAR_CLIP = 0.0001;
export const FAR_CLIP = 200000;

// Sky transition altitudes (km)
export const SKY_FULL_BLUE = 10;
export const SKY_FADE_END = 100;

// Atmosphere glow
export const ATMO_VISIBLE_ALT = 50;
export const ATMO_THICKNESS = 120; // visual thickness in km

// Ground plane fade
export const GROUND_PLANE_FADE_START = 50;
export const GROUND_PLANE_FADE_END = 300;

// Milestones — displayMs is wall-clock time to show the notification
const DEFAULT_MILESTONE_DISPLAY_MS = 4000;
export const MILESTONES = [
  { altitude: 0, label: 'West of Ecuador', sublabel: 'Sea Level' },
  { altitude: 8.85, label: 'Summit of Mount Everest', sublabel: '8.85 km' },
  { altitude: 10, label: 'Commercial Aircraft Altitude', sublabel: '10 km' },
  { altitude: 100, label: 'Karman Line: Edge of Space', sublabel: '100 km' },
  { altitude: 200, label: 'Lowest Sustainable Orbit', sublabel: '200 km' },
  { altitude: 408, label: 'ISS Orbit', sublabel: '408 km' },
  { altitude: 550, label: 'Hubble Space Telescope Orbit', sublabel: '550 km' },
  { altitude: 1000, label: 'Boundary of Low Earth Orbit', sublabel: '1,000 km' },
  { altitude: 2000, label: 'Inner Van Allen Radiation Belt', sublabel: '2,000 km' },
  { altitude: 12550, label: 'One Earth Diameter Above Surface', sublabel: '12,550 km' },
  { altitude: 20200, label: 'GPS Satellite Constellation Orbit', sublabel: '20,200 km' },
  { altitude: 35786, label: 'Geostationary Orbit — Zero Gravity', sublabel: '35,786 km' },
  { altitude: 75600, label: '1/5 of the Way to the Moon', sublabel: '75,600 km' },
  { altitude: 100000, label: 'Counterweight Station', sublabel: '100,000 km' },
].map(m => ({ displayMs: DEFAULT_MILESTONE_DISPLAY_MS, ...m }));

// Sun / day-night cycle
export const SIDEREAL_DAY_S = 86164.1;  // 23h 56m 4.1s
export const SUN_ANGULAR_VELOCITY = (2 * Math.PI) / SIDEREAL_DAY_S;
export const SUN_DISTANCE = 149000;      // just inside starfield sphere (150k)
export const SUN_VISUAL_RADIUS = 2000;   // angular size ~0.77°

// Real-time mode cycle timing
export const WAIT_DURATION_MS = 10 * 60 * 1000;           // 10 minutes at each end
export const TRAVEL_DURATION_MS = (CABLE_LENGTH / DEFAULT_SPEED_KMH) * 3_600_000; // one-way travel
export const CYCLE_DURATION_MS = 2 * (TRAVEL_DURATION_MS + WAIT_DURATION_MS);     // full round trip
export const CYCLE_EPOCH_MS = Date.UTC(2026, 0, 1);       // Jan 1 2025 00:00 UTC

// Gravity / first-person physics
export const HEAD_CLEARANCE = 0.0003;    // 30cm in km
export const SAFETY_NET_DELAY = 15;      // seconds before anti-stuck kicks in
export const SAFETY_NET_FORCE = 0.005;   // m/s² nudge force
export const MAG_BOOTS_FORCE = 9.80;     // m/s² (1g pull toward standing surface)
export const MAG_BOOTS_THRESHOLD = 0.5;  // show prompt below this many g

// Cinema mode presets — each segment has a wall-clock duration
// { from, to } in km, durationMs in milliseconds of real time
export const CINEMA_MODES = [
  {
    name: 'Express Ascent',
    subtitle: '5 min to the top',
    segments: [
      { from: 0, to: 100, durationMs: 2 * 60_000 },
      { from: 100, to: 1000, durationMs: 2 * 60_000 },
      { from: 1000, to: 30000, durationMs: 2 * 60_000 },
      { from: 30000, to: 100000, durationMs: 1 * 60_000 },
    ],
  },
  {
    name: 'Ludicrous Speed!',
    subtitle: '1 min to Geo',
    segments: [
      { from: 0, to: 100, durationMs: 0.25 * 60_000 },
      { from: 100, to: 1000, durationMs: 0.25 * 60_000 },
      { from: 1000, to: 10000, durationMs: 0.25 * 60_000 },
      { from: 10000, to: 35780, durationMs: 0.25 * 60_000 },
    ],
  }
];

// Convert anchor lat/lon to radians
export const ANCHOR_LAT_RAD = ANCHOR_LAT * Math.PI / 180;
export const ANCHOR_LON_RAD = ANCHOR_LON * Math.PI / 180;
