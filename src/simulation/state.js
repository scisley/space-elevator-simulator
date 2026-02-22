import { CABLE_LENGTH, DEFAULT_SPEED_KMH, WAIT_DURATION_MS, TRAVEL_DURATION_MS, CYCLE_DURATION_MS, CYCLE_EPOCH_MS, GROUND_STATION_ALTITUDE } from '../constants.js';
import { getEffectiveGravity } from './physics.js';

// Local simulation state
const state = {
  altitudeKm: 0,
  speedKmh: DEFAULT_SPEED_KMH,
  direction: 1,
  effectiveGravityG: 1.0,
  startAltitudeKm: 0,
  startTimeMs: Date.now(),
  timeScale: 1,
  mode: null, // 'realtime' | 'sandbox' | 'cinema'
  waitRemainingMs: 0,
  phase: null, // 'wait-ground' | 'ascend' | 'wait-top' | 'descend'
  travelElapsedMs: 0,
  travelRemainingMs: 0,
  // Sandbox wait tracking (internal)
  _sandboxWaiting: false,
  _waitAccumMs: 0,
  _prevUpdateMs: Date.now(),
  // Cinema mode (internal)
  _cinemaPreset: null,
  _cinemaStartMs: 0,
};

// Pure function: compute real-time state from UTC timestamp
export function getUTCSyncState(utcMs) {
  const elapsed = utcMs - CYCLE_EPOCH_MS;
  // Positive modulo
  const cyclePos = ((elapsed % CYCLE_DURATION_MS) + CYCLE_DURATION_MS) % CYCLE_DURATION_MS;

  const phase1End = WAIT_DURATION_MS;
  const phase2End = WAIT_DURATION_MS + TRAVEL_DURATION_MS;
  const phase3End = 2 * WAIT_DURATION_MS + TRAVEL_DURATION_MS;

  const TRAVEL_RANGE = CABLE_LENGTH - GROUND_STATION_ALTITUDE;

  if (cyclePos < phase1End) {
    // Phase 0: waiting at ground station
    return {
      altitudeKm: GROUND_STATION_ALTITUDE,
      direction: 0,
      waitRemainingMs: phase1End - cyclePos,
      phase: 'wait-ground',
      travelElapsedMs: 0,
      travelRemainingMs: 0,
    };
  } else if (cyclePos < phase2End) {
    // Phase 1: ascending
    const progress = (cyclePos - phase1End) / TRAVEL_DURATION_MS;
    return {
      altitudeKm: GROUND_STATION_ALTITUDE + progress * TRAVEL_RANGE,
      direction: 1,
      waitRemainingMs: 0,
      phase: 'ascend',
      travelElapsedMs: cyclePos - phase1End,
      travelRemainingMs: phase2End - cyclePos,
    };
  } else if (cyclePos < phase3End) {
    // Phase 2: waiting at top
    return {
      altitudeKm: CABLE_LENGTH,
      direction: 0,
      waitRemainingMs: phase3End - cyclePos,
      phase: 'wait-top',
      travelElapsedMs: 0,
      travelRemainingMs: 0,
    };
  } else {
    // Phase 3: descending
    const progress = (cyclePos - phase3End) / TRAVEL_DURATION_MS;
    return {
      altitudeKm: CABLE_LENGTH - progress * TRAVEL_RANGE,
      direction: -1,
      waitRemainingMs: 0,
      phase: 'descend',
      travelElapsedMs: cyclePos - phase3End,
      travelRemainingMs: CYCLE_DURATION_MS - cyclePos,
    };
  }
}

// Compute cinema state from wall-clock elapsed time
function computeCinemaState(preset, elapsedMs) {
  let accumulated = 0;
  for (let i = 0; i < preset.segments.length; i++) {
    const seg = preset.segments[i];
    if (elapsedMs < accumulated + seg.durationMs) {
      const progress = (elapsedMs - accumulated) / seg.durationMs;
      const altitudeKm = seg.from + (seg.to - seg.from) * progress;
      const direction = seg.to > seg.from ? 1 : -1;
      // Remaining time in this segment + all subsequent segments
      let remainingMs = (seg.durationMs - (elapsedMs - accumulated));
      for (let j = i + 1; j < preset.segments.length; j++) {
        remainingMs += preset.segments[j].durationMs;
      }
      // timeScale = how much faster than real time this segment runs
      const realTravelMs = (Math.abs(seg.to - seg.from) / DEFAULT_SPEED_KMH) * 3_600_000;
      const timeScale = realTravelMs / seg.durationMs;
      return {
        altitudeKm,
        direction,
        phase: direction === 1 ? 'ascend' : 'descend',
        timeScale,
        travelElapsedMs: elapsedMs,
        travelRemainingMs: remainingMs,
        done: false,
      };
    }
    accumulated += seg.durationMs;
  }
  // All segments complete
  const lastSeg = preset.segments[preset.segments.length - 1];
  return {
    altitudeKm: lastSeg.to,
    direction: 0,
    phase: null,
    timeScale: 1,
    travelElapsedMs: accumulated,
    travelRemainingMs: 0,
    done: true,
  };
}

function computeAltitude(s, now) {
  const elapsedHours = (now - s.startTimeMs) / 3_600_000 * s.timeScale;
  const alt = s.startAltitudeKm + s.direction * s.speedKmh * elapsedHours;
  return Math.max(0, Math.min(CABLE_LENGTH, alt));
}

// Interpolate altitude locally
export function updateLocalState() {
  const now = Date.now();

  if (state.mode === 'realtime') {
    const sync = getUTCSyncState(now);
    state.altitudeKm = sync.altitudeKm;
    state.direction = sync.direction;
    state.waitRemainingMs = sync.waitRemainingMs;
    state.phase = sync.phase;
    state.travelElapsedMs = sync.travelElapsedMs;
    state.travelRemainingMs = sync.travelRemainingMs;
    state.speedKmh = DEFAULT_SPEED_KMH;
    state.timeScale = 1;
  } else if (state.mode === 'cinema' && state._cinemaPreset) {
    const elapsedMs = now - state._cinemaStartMs;
    const cinema = computeCinemaState(state._cinemaPreset, elapsedMs);
    state.altitudeKm = cinema.altitudeKm;
    state.direction = cinema.direction;
    state.phase = cinema.phase;
    state.speedKmh = DEFAULT_SPEED_KMH;
    state.timeScale = cinema.timeScale;
    state.travelElapsedMs = cinema.travelElapsedMs;
    state.travelRemainingMs = cinema.travelRemainingMs;
    state.waitRemainingMs = 0;
  } else {
    const deltaMs = now - state._prevUpdateMs;
    state._prevUpdateMs = now;

    if (state._sandboxWaiting) {
      state._waitAccumMs += deltaMs * state.timeScale;
      const remaining = WAIT_DURATION_MS - state._waitAccumMs;
      if (remaining <= 0) {
        // Wait over — auto-reverse
        const newDir = state.phase === 'wait-ground' ? 1 : -1;
        state.startAltitudeKm = state.phase === 'wait-ground' ? GROUND_STATION_ALTITUDE : CABLE_LENGTH;
        state.startTimeMs = now;
        state.direction = newDir;
        state._sandboxWaiting = false;
        state._waitAccumMs = 0;
        state.waitRemainingMs = 0;
        state.phase = newDir === 1 ? 'ascend' : 'descend';
        state.altitudeKm = state.startAltitudeKm;
        state.travelElapsedMs = 0;
        state.travelRemainingMs = TRAVEL_DURATION_MS;
      } else {
        state.direction = 0;
        state.waitRemainingMs = remaining;
        state.travelElapsedMs = 0;
        state.travelRemainingMs = 0;
      }
    } else {
      state.altitudeKm = computeAltitude(state, now);

      if (state.altitudeKm <= GROUND_STATION_ALTITUDE && state.direction === -1) {
        // Arrived at ground station
        state.altitudeKm = GROUND_STATION_ALTITUDE;
        state._sandboxWaiting = true;
        state._waitAccumMs = 0;
        state.phase = 'wait-ground';
        state.direction = 0;
        state.waitRemainingMs = WAIT_DURATION_MS;
        state.travelElapsedMs = 0;
        state.travelRemainingMs = 0;
      } else if (state.altitudeKm >= CABLE_LENGTH && state.direction === 1) {
        // Arrived at top
        state.altitudeKm = CABLE_LENGTH;
        state._sandboxWaiting = true;
        state._waitAccumMs = 0;
        state.phase = 'wait-top';
        state.direction = 0;
        state.waitRemainingMs = WAIT_DURATION_MS;
        state.travelElapsedMs = 0;
        state.travelRemainingMs = 0;
      } else if (state.direction !== 0) {
        // Traveling
        const simElapsedMs = (now - state.startTimeMs) * state.timeScale;
        state.phase = state.direction === 1 ? 'ascend' : 'descend';
        state.travelElapsedMs = simElapsedMs;
        state.travelRemainingMs = state.direction === 1
          ? ((CABLE_LENGTH - state.altitudeKm) / state.speedKmh) * 3_600_000
          : (state.altitudeKm / state.speedKmh) * 3_600_000;
        state.waitRemainingMs = 0;
      } else {
        // Stopped (manual admin stop)
        state.phase = null;
        state.waitRemainingMs = 0;
        state.travelElapsedMs = 0;
        state.travelRemainingMs = 0;
      }
    }
  }

  state.effectiveGravityG = getEffectiveGravity(state.altitudeKm) / 9.80;
}

export function getState() {
  return state;
}

export function setMode(mode) {
  state.mode = mode;
}

export function setCinemaPreset(preset) {
  state._cinemaPreset = preset;
  state._cinemaStartMs = Date.now();
}

// Update local segment state (used by admin controls)
// Breaks out of realtime/cinema mode into sandbox so controls take effect.
function setLocalSegment(startAltitudeKm, speedKmh, direction) {
  if (state.mode === 'cinema' || state.mode === 'realtime') {
    state.mode = 'sandbox';
    state._cinemaPreset = null;
    state.timeScale = 1;
  }
  state.startAltitudeKm = startAltitudeKm;
  state.startTimeMs = Date.now();
  state.speedKmh = speedKmh;
  state.direction = direction;
  state._sandboxWaiting = false;
  state._waitAccumMs = 0;
  updateLocalState();
}

// Admin controls — sandbox only (no server calls)
export function adminSetAltitude(altitudeKm) {
  setLocalSegment(altitudeKm, state.speedKmh, state.direction);
}

export function adminSetSpeed(speedKmh) {
  setLocalSegment(state.altitudeKm, speedKmh, state.direction);
}

export function adminSetDirection(direction) {
  setLocalSegment(state.altitudeKm, state.speedKmh, direction);
}

export function adminSetTimeScale(scale) {
  if (state.mode === 'cinema' || state.mode === 'realtime') {
    state.mode = 'sandbox';
    state._cinemaPreset = null;
  }
  state.startAltitudeKm = state.altitudeKm;
  state.startTimeMs = Date.now();
  state.timeScale = scale;
}

export function adminRestart() {
  setLocalSegment(GROUND_STATION_ALTITUDE, DEFAULT_SPEED_KMH, 1);
}

export function adminReturnToRealtime() {
  state.mode = 'realtime';
}
