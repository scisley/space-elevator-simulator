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
import { getState, updateLocalState, startPolling } from './simulation/state.js';
import { EYE_HEIGHT, MILESTONES, ANCHOR_LON_RAD, SUN_ANGULAR_VELOCITY } from './constants.js';

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

// Create scene objects
const earth = new Earth(scene, loadingManager);
const stars = new Stars(scene, loadingManager);
const sky = new Sky(scene);
const sun = new Sun(scene);
const cabin = new Cabin(scene);
const cable = new Cable(scene);
const anchor = new AnchorStation(scene);
const platform = new OrbitalPlatform(scene);

// First person controls
const controller = new FirstPersonController(camera, renderer.domElement);
controller.setBounds(cabin.getBounds());

// Camera initial position
camera.position.set(0, EYE_HEIGHT, 0);

// UI
const hud = new HUD();
const adminPanel = new AdminPanel();

// Cabin visible by default
let cabinVisible = true;
cabin.setVisible(cabinVisible);
adminPanel.onToggleCabin = () => {
  cabinVisible = !cabinVisible;
  cabin.setVisible(cabinVisible);
};

// --- Sun orbit setup ---
// Earth's polar axis in world space: apply same rotation as Earth.js does to (0,1,0)
// Earth.js applies: rotation.y = -(ANCHOR_LON_RAD + PI/2), then rotation.x = -PI/2
// The Euler rotation applied to the Earth mesh rotates the north pole direction.
// We need the world-space direction of Earth's north pole after those rotations.
// Earth.js sets rotation.x = -PI/2, rotation.y = -(LON+PI/2) with default XYZ order.
const earthQuaternion = new THREE.Quaternion();
const earthEulerXYZ = new THREE.Euler(-Math.PI / 2, -(ANCHOR_LON_RAD + Math.PI / 2), 0, 'XYZ');
earthQuaternion.setFromEuler(earthEulerXYZ);

// The polar axis (north pole) in model space is +Y. After Earth's rotation it becomes:
const polarAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(earthQuaternion).normalize();

// Build two perpendicular basis vectors in the sun's orbital plane (perpendicular to polar axis)
// Use cross product with a non-parallel vector to get the first basis
const tempVec = Math.abs(polarAxis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
const basisA = new THREE.Vector3().crossVectors(polarAxis, tempVec).normalize();
const basisB = new THREE.Vector3().crossVectors(polarAxis, basisA).normalize();

// Reusable vectors
const sunDirection = new THREE.Vector3();

// Accumulated simulation time (respects timeScale)
// Start at 6h (morning) so the trip begins at sunrise
let simElapsedSeconds = 6 * 3600;

// Milestone tracking
let triggeredMilestones = new Set();
let milestoneTimeout = null;

function checkMilestones(altitudeKm) {
  for (const m of MILESTONES) {
    const key = m.altitude;
    if (triggeredMilestones.has(key)) continue;

    // Trigger when we cross the milestone altitude (within 1% or 1km)
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
});

renderer.domElement.addEventListener('click', () => {
  if (!controller.isLocked) {
    controller.lock();
  }
});

controller.controls.addEventListener('lock', () => {
  crosshair.style.display = 'block';
});

controller.controls.addEventListener('unlock', () => {
  crosshair.style.display = 'none';
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

  // Check milestones
  checkMilestones(altitudeKm);
  prevAltitude = altitudeKm;

  // Update HUD
  hud.update(state, simElapsedSeconds);

  // Render
  sceneManager.render();
}

animate();
