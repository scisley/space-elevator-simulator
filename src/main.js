import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager.js';
import { Earth } from './scene/Earth.js';
import { Stars } from './scene/Stars.js';
import { Sky } from './scene/Sky.js';
import { Sun } from './scene/Sun.js';
import { Cabin } from './scene/Cabin.js';
import { Cable } from './scene/Cable.js';
import { AnchorStation } from './scene/AnchorStation.js';
import { OrbitalPlatform } from './scene/OrbitalPlatform.js';
import { FirstPersonController } from './controls/FirstPersonController.js';
import { HUD } from './ui/HUD.js';
import { AdminPanel } from './ui/AdminPanel.js';
import { AmbientAudio } from './scene/Audio.js';
import { getState, updateLocalState, startPolling, adminSetAltitude, adminSetTimeScale, adminSetDirection } from './simulation/state.js';
import { EYE_HEIGHT, MILESTONES, ANCHOR_LON_RAD, SUN_ANGULAR_VELOCITY } from './constants.js';
import { inject } from '@vercel/analytics';

inject();

// Loading
const loadingScreen = document.getElementById('loading-screen');
const loadingBar = document.getElementById('loading-bar');
const loadingText = document.getElementById('loading-text');
const clickToEnter = document.getElementById('click-to-enter');
const crosshair = document.getElementById('crosshair');
const milestoneEl = document.getElementById('milestone-notification');

const loadingManager = new THREE.LoadingManager();
let texturesLoaded = 0;
const totalTextures = 4;

loadingManager.onProgress = (url, loaded, total) => {
  const pct = (loaded / total) * 100;
  loadingBar.style.width = pct + '%';
  loadingText.textContent = `Loading textures... ${loaded}/${total}`;
};

loadingManager.onLoad = () => {
  loadingBar.style.width = '100%';
  loadingText.textContent = 'Ready';
  clickToEnter.style.display = 'block';
};

loadingManager.onError = (url) => {
  loadingText.textContent = `Failed to load: ${url}`;
  clickToEnter.style.display = 'block';
};

// Safety fallback — always show enter button after 5s
setTimeout(() => { clickToEnter.style.display = 'block'; }, 5000);

// Create scene
const sceneManager = new SceneManager();
const { scene, camera, renderer } = sceneManager;

// --- Polar axis (needed by Stars and sun orbit) ---
const earthQuaternion = new THREE.Quaternion();
const earthEulerXYZ = new THREE.Euler(-Math.PI / 2, -(ANCHOR_LON_RAD + Math.PI / 2), 0, 'XYZ');
earthQuaternion.setFromEuler(earthEulerXYZ);
const polarAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(earthQuaternion).normalize();

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
const eastDir = new THREE.Vector3().crossVectors(polarAxis, new THREE.Vector3(0, 1, 0)).normalize();
camera.position.copy(eastDir.clone().multiplyScalar(0.001)); // 1m = 0.001 km
camera.position.y = EYE_HEIGHT;
camera.lookAt(camera.position.x + eastDir.x, EYE_HEIGHT, camera.position.z + eastDir.z);
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

// --- URL deep links ---
const params = new URLSearchParams(window.location.search);
if (params.has('alt')) adminSetAltitude(parseFloat(params.get('alt')));
if (params.has('speed')) adminSetTimeScale(parseInt(params.get('speed')));
if (params.has('dir')) adminSetDirection(parseInt(params.get('dir')));
if (params.has('cabin') && params.get('cabin') === '0') {
  cabinVisible = false;
  cabin.setVisible(false);
  adminPanel.cabinVisible = false;
}
if (params.has('stars')) {
  const v = parseFloat(params.get('stars'));
  stars.setBrightnessMultiplier(v * 1.3);
  adminPanel.starBrightnessVal = v;
}

// Build two perpendicular basis vectors in the sun's orbital plane
const tempVec = Math.abs(polarAxis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
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
  milestoneEl.querySelector('.altitude').textContent = m.sublabel;
  milestoneEl.querySelector('.name').textContent = m.label;
  milestoneEl.style.opacity = '1';

  if (milestoneTimeout) clearTimeout(milestoneTimeout);
  milestoneTimeout = setTimeout(() => {
    milestoneEl.style.opacity = '0';
  }, 4000);
}

// Pointer lock flow
clickToEnter.addEventListener('click', () => {
  loadingScreen.style.display = 'none';
  controller.lock();
  // Start audio on first user interaction
  if (!audio.started) audio.start();
});

renderer.domElement.addEventListener('click', () => {
  if (!controller.isLocked) {
    controller.lock();
  }
});

controller.controls.addEventListener('lock', () => {
  crosshair.style.display = 'block';
  adminPanel.hide();
});

controller.controls.addEventListener('unlock', () => {
  crosshair.style.display = 'none';
  adminPanel.show();
});

// Start state polling
startPolling();

// Previous altitude for milestone direction tracking
let prevAltitude = 0;

// Render loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const state = getState();

  // Update local altitude computation
  updateLocalState();

  const altitudeKm = state.altitudeKm;

  // Advance simulation time (respects timeScale for day/night cycle)
  simElapsedSeconds += delta * state.timeScale;
  const sunAngle = SUN_ANGULAR_VELOCITY * simElapsedSeconds;

  // Sun direction in world space: orbits around Earth's polar axis
  sunDirection.set(0, 0, 0)
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

  // Check milestones
  checkMilestones(altitudeKm);
  prevAltitude = altitudeKm;

  // Update HUD
  hud.update(state, simElapsedSeconds, controller);

  // Render
  sceneManager.render();
}

animate();
