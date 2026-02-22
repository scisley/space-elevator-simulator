import * as THREE from "three";
import { SceneManager } from "./scene/SceneManager.js";
import { Earth } from "./scene/Earth.js";
import { Stars } from "./scene/Stars.js";
import { Sky } from "./scene/Sky.js";
import { Sun } from "./scene/Sun.js";
import { Cabin } from "./scene/Cabin.js";
import { Cable } from "./scene/Cable.js";
import { AnchorStation } from "./scene/AnchorStation.js";
import { OrbitalPlatform } from "./scene/OrbitalPlatform.js";
import { FirstPersonController } from "./controls/FirstPersonController.js";
import { HUD } from "./ui/HUD.js";
import { AdminPanel } from "./ui/AdminPanel.js";
import { AmbientAudio } from "./scene/Audio.js";
import {
  getState,
  updateLocalState,
  setMode,
  setCinemaPreset,
  getUTCSyncState,
  adminSetAltitude,
  adminSetTimeScale,
  adminSetDirection,
  adminReturnToRealtime,
  adminRestart,
} from "./simulation/state.js";
import {
  EYE_HEIGHT,
  MILESTONES,
  ANCHOR_LON_RAD,
  SUN_ANGULAR_VELOCITY,
  CINEMA_MODES,
} from "./constants.js";
import { inject } from "@vercel/analytics";

inject();

// Loading
const loadingScreen = document.getElementById("loading-screen");
const loadingBar = document.getElementById("loading-bar");
const loadingText = document.getElementById("loading-text");
const modeSelect = document.getElementById("mode-select");
const crosshair = document.getElementById("crosshair");
const milestoneEl = document.getElementById("milestone-notification");

const loadingManager = new THREE.LoadingManager();
let texturesLoaded = 0;
const totalTextures = 4;

loadingManager.onProgress = (url, loaded, total) => {
  const pct = (loaded / total) * 100;
  loadingBar.style.width = pct + "%";
  loadingText.textContent = `Loading textures... ${loaded}/${total}`;
};

loadingManager.onLoad = () => {
  loadingBar.style.width = "100%";
  loadingText.textContent = "Ready";
  modeSelect.style.display = "flex";
};

loadingManager.onError = (url) => {
  loadingText.textContent = `Failed to load: ${url}`;
  modeSelect.style.display = "flex";
};

// Safety fallback — always show mode select after 5s
setTimeout(() => {
  modeSelect.style.display = "flex";
}, 5000);

// Create scene
const sceneManager = new SceneManager();
const { scene, camera, renderer } = sceneManager;

// --- Polar axis (needed by Stars and sun orbit) ---
const earthQuaternion = new THREE.Quaternion();
const earthEulerXYZ = new THREE.Euler(
  -Math.PI / 2,
  -(ANCHOR_LON_RAD + Math.PI / 2),
  0,
  "XYZ",
);
earthQuaternion.setFromEuler(earthEulerXYZ);
const polarAxis = new THREE.Vector3(0, 1, 0)
  .applyQuaternion(earthQuaternion)
  .normalize();

// Create scene objects
const earth = new Earth(scene, loadingManager);
const stars = new Stars(scene, loadingManager, polarAxis);
const sky = new Sky(scene);
const sun = new Sun(scene);
const cabin = new Cabin(scene);
const cable = new Cable(scene);
const anchor = new AnchorStation(scene);
const platform = new OrbitalPlatform(scene);

// First person controls
const controller = new FirstPersonController(camera, renderer.domElement);
controller.setBounds(cabin.getBounds());

// Camera initial position — 1m east of cable, facing east
const eastDir = new THREE.Vector3()
  .crossVectors(polarAxis, new THREE.Vector3(0, 1, 0))
  .normalize();
camera.position.copy(eastDir.clone().multiplyScalar(0.001)); // 1m = 0.001 km
camera.position.y = EYE_HEIGHT;
camera.lookAt(
  camera.position.x + eastDir.x,
  EYE_HEIGHT,
  camera.position.z + eastDir.z,
);
controller.initYawFromCamera();

// Audio
const audio = new AmbientAudio();

// UI
const hud = new HUD();
const adminPanel = new AdminPanel();

// Cabin visible by default
let cabinVisible = true;
cabin.setVisible(cabinVisible);
adminPanel.onToggleCabin = () => {
  cabinVisible = !cabinVisible;
  cabin.setVisible(cabinVisible);
  adminPanel.cabinVisible = cabinVisible;
};

// Star brightness slider
adminPanel.onStarBrightness = (val) => stars.setBrightnessMultiplier(val);

// Audio mute toggle
adminPanel.onToggleAudio = () => {
  if (!audio.started) audio.start();
  const muted = audio.toggleMute();
  adminPanel.setAudioButtonText(muted);
};

// Settings panel opened while in real-time → switch to sandbox at current position
adminPanel.onEnterSandbox = () => {
  const currentState = getState();
  adminSetAltitude(currentState.altitudeKm); // transitions state.mode to sandbox
  selectedMode = "sandbox";
};

// "Return to Real-time" button
adminPanel.onReturnToRealtime = () => {
  adminReturnToRealtime();
  selectedMode = "realtime";
  const utcSeconds = Date.now() / 1000;
  simElapsedSeconds = utcSeconds - ANCHOR_LON_OFFSET_S;
  updateLocalState();
  const currentAlt = getState().altitudeKm;
  for (const m of MILESTONES) {
    if (m.altitude <= currentAlt) triggeredMilestones.add(m.altitude);
  }
  adminPanel.hide();
  controller.lock();
};

// --- URL deep links ---
const params = new URLSearchParams(window.location.search);
if (params.has("alt")) adminSetAltitude(parseFloat(params.get("alt")));
if (params.has("speed")) adminSetTimeScale(parseInt(params.get("speed")));
if (params.has("dir")) adminSetDirection(parseInt(params.get("dir")));
if (params.has("cabin") && params.get("cabin") === "0") {
  cabinVisible = false;
  cabin.setVisible(false);
  adminPanel.cabinVisible = false;
}
if (params.has("stars")) {
  const v = parseFloat(params.get("stars"));
  stars.setBrightnessMultiplier(v * 1.3);
  adminPanel.starBrightnessVal = v;
}

// Build two perpendicular basis vectors in the sun's orbital plane
const tempVec =
  Math.abs(polarAxis.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
const basisA = new THREE.Vector3().crossVectors(polarAxis, tempVec).normalize();
const basisB = new THREE.Vector3().crossVectors(polarAxis, basisA).normalize();

// Reusable vectors
const sunDirection = new THREE.Vector3();

// Accumulated simulation time (respects timeScale)
// Start at noon so the ground plane is well-lit during initial ascent
let simElapsedSeconds = 12 * 3600;

// Milestone tracking
let triggeredMilestones = new Set();
let milestoneTimeout = null;

function checkMilestones(altitudeKm) {
  for (const m of MILESTONES) {
    const key = m.altitude;
    if (triggeredMilestones.has(key)) continue;

    const threshold = Math.max(m.altitude * 0.01, 1);
    if (Math.abs(altitudeKm - m.altitude) < threshold) {
      triggeredMilestones.add(key);
      showMilestone(m);
    }
  }
}

function showMilestone(m) {
  milestoneEl.querySelector(".altitude").textContent = m.sublabel;
  milestoneEl.querySelector(".name").textContent = m.label;
  milestoneEl.style.opacity = "1";

  if (milestoneTimeout) clearTimeout(milestoneTimeout);
  milestoneTimeout = setTimeout(() => {
    milestoneEl.style.opacity = "0";
  }, m.displayMs);
}

// Format milliseconds as human-readable duration (e.g. "3d 14h 22m")
function formatDurationMs(ms) {
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// Anchor longitude offset for UTC → local solar time (seconds)
const ANCHOR_LON_OFFSET_S = (ANCHOR_LON_RAD / (2 * Math.PI)) * 86400;

// Inject cinema mode label + buttons from data
const cinemaLabel = document.createElement("div");
cinemaLabel.textContent = "CINEMATIC MODES";
cinemaLabel.style.cssText =
  "color:#888; font-size:0.7rem; letter-spacing:0.2em; margin-top:8px;";
modeSelect.appendChild(cinemaLabel);

CINEMA_MODES.forEach((preset, i) => {
  const btn = document.createElement("button");
  btn.className = "mode-btn";
  btn.dataset.mode = "cinema";
  btn.dataset.cinema = i;
  btn.innerHTML = `${preset.name.toUpperCase()}<span class="subtitle">${preset.subtitle}</span>`;
  modeSelect.appendChild(btn);
});

// Track selected mode
let selectedMode = null;

// Mode selection handler
modeSelect.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    selectedMode = mode;
    setMode(selectedMode);

    if (selectedMode === "cinema") {
      const presetIndex = parseInt(btn.dataset.cinema) || 0;
      setCinemaPreset(CINEMA_MODES[presetIndex]);
      simElapsedSeconds = 12 * 3600;
    } else if (selectedMode === "realtime") {
      // UTC-based day/night: compute simElapsedSeconds from wall clock
      const utcSeconds = Date.now() / 1000;
      simElapsedSeconds = utcSeconds - ANCHOR_LON_OFFSET_S;

      // Pre-populate triggered milestones for all below current altitude
      updateLocalState();
      const currentAlt = getState().altitudeKm;
      for (const m of MILESTONES) {
        if (m.altitude <= currentAlt) {
          triggeredMilestones.add(m.altitude);
        }
      }

      // Show join notification with travel context
      const sync = getUTCSyncState(Date.now());
      if (sync.phase === "ascend" || sync.phase === "descend") {
        const origin =
          sync.phase === "ascend" ? "Ground" : "Counterweight Station";
        const destination =
          sync.phase === "ascend" ? "Counterweight Station" : "Ground";
        showMilestone({
          sublabel: `Departed ${origin} ${formatDurationMs(sync.travelElapsedMs)} ago`,
          label: `${destination} in ${formatDurationMs(sync.travelRemainingMs)}`,
          displayMs: 6000,
        });
      } else {
        const location =
          sync.phase === "wait-ground"
            ? "Ground Level"
            : "Counterweight Station";
        const totalSec = Math.ceil(sync.waitRemainingMs / 1000);
        const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
        const ss = String(totalSec % 60).padStart(2, "0");
        showMilestone({
          sublabel: location,
          label: `Departing in ${mm}:${ss}`,
          displayMs: 6000,
        });
      }
    } else {
      // Sandbox: reset start time to now so elevator begins at ground
      adminRestart();
      simElapsedSeconds = 12 * 3600;
    }

    loadingScreen.style.display = "none";
    controller.lock();
    if (!audio.started) audio.start();
  });
});

// Pointer lock flow
renderer.domElement.addEventListener("click", () => {
  if (!controller.isLocked) {
    controller.lock();
  }
});

controller.controls.addEventListener("lock", () => {
  crosshair.style.display = "block";
  adminPanel.hide();
});

controller.controls.addEventListener("unlock", () => {
  crosshair.style.display = "none";
  adminPanel.show();
});

// Previous altitude for milestone direction tracking
let prevAltitude = 0;
// Phase transition tracking for arrival/departure notifications
let prevPhase = null;

// Render loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const state = getState();

  // Update local altitude computation
  updateLocalState();

  const altitudeKm = state.altitudeKm;

  // Detect phase transitions → show arrival/departure notifications
  if (selectedMode && prevPhase !== null && state.phase !== prevPhase) {
    const curPhase = state.phase;
    // Arrived at anchor (travel → wait)
    if (curPhase === "wait-ground" || curPhase === "wait-top") {
      const location =
        curPhase === "wait-ground" ? "Ground Level" : "Counterweight Station";
      const totalSec = Math.ceil(state.waitRemainingMs / 1000);
      const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
      const ss = String(totalSec % 60).padStart(2, "0");
      showMilestone({
        sublabel: location,
        label: `Departing in ${mm}:${ss}`,
        displayMs: 6000,
      });
    }
    // Departed from anchor (wait → travel)
    if (
      (curPhase === "ascend" || curPhase === "descend") &&
      (prevPhase === "wait-ground" || prevPhase === "wait-top")
    ) {
      const origin = curPhase === "ascend" ? "Ground" : "Counterweight Station";
      const destination =
        curPhase === "ascend" ? "Counterweight Station" : "Ground";
      showMilestone({
        sublabel: `Departed ${origin}`,
        label: `${destination} in ${formatDurationMs(state.travelRemainingMs)}`,
        displayMs: 6000,
      });
    }
  }
  if (selectedMode) prevPhase = state.phase;

  // Advance simulation time
  if (selectedMode === "realtime") {
    // Recompute from UTC each frame so day/night stays synced
    const utcSeconds = Date.now() / 1000;
    simElapsedSeconds = utcSeconds - ANCHOR_LON_OFFSET_S;
  } else {
    // Sandbox/Cinema: accumulate with timeScale
    simElapsedSeconds += delta * state.timeScale;
  }
  const sunAngle = SUN_ANGULAR_VELOCITY * simElapsedSeconds;

  // Sun direction in world space: orbits around Earth's polar axis
  sunDirection
    .set(0, 0, 0)
    .addScaledVector(basisA, Math.sin(sunAngle))
    .addScaledVector(basisB, Math.cos(sunAngle));

  // Update controller with gravity-dependent physics
  controller.update(delta, altitudeKm);

  // Update scene objects
  earth.update(altitudeKm, delta, sunDirection);
  sun.update(sunDirection, altitudeKm);
  sky.update(altitudeKm, sunDirection);
  stars.update(altitudeKm, sunAngle, polarAxis);
  cable.update(altitudeKm);
  anchor.update(altitudeKm, delta);
  platform.update(altitudeKm);

  // Update audio
  audio.update(altitudeKm);

  // Check milestones (skip in cinema mode — too fast to read)
  if (selectedMode !== "cinema") checkMilestones(altitudeKm);
  prevAltitude = altitudeKm;

  // Update HUD
  hud.update(state, simElapsedSeconds, controller);

  // Render
  sceneManager.render();
}

animate();
