import * as THREE from 'three';
import { EYE_HEIGHT, CABIN_SIZE } from '../constants.js';
import { getEffectiveGravity } from '../simulation/physics.js';

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const TOUCH_LOOK_SENSITIVITY = 0.003;
const PASSIVE_TOUCH = { passive: true };

// Camera height when "standing on ceiling" — mirror of EYE_HEIGHT from the top
const CEILING_EYE_HEIGHT = CABIN_SIZE.height - EYE_HEIGHT;

export class MobileController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Camera orientation
    this.yaw = 0;
    this.pitch = 0;
    this._onCeiling = false;

    this._cameraY = EYE_HEIGHT;

    // Touch state
    this._touchId = null;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._touchYaw = 0;
    this._touchPitch = 0;

    // Exposed state (matches FirstPersonController interface)
    this.magBootsHeld = false;
    this.onFloor = true;
    this.onCeiling = false;
    this.currentGEff = 9.8;

    // Reusable quaternions
    this._qYaw = new THREE.Quaternion();
    this._qPitch = new THREE.Quaternion();

    this._setupTouchListeners();
  }

  _setupTouchListeners() {
    const clearTrackedTouch = (changedTouches) => {
      for (const t of changedTouches) {
        if (t.identifier === this._touchId) {
          this._touchId = null;
          return;
        }
      }
    };

    this.domElement.addEventListener('touchstart', (e) => {
      if (this._touchId !== null) return;
      const t = e.changedTouches[0];
      this._touchId = t.identifier;
      this._touchStartX = t.clientX;
      this._touchStartY = t.clientY;
      this._touchYaw = this.yaw;
      this._touchPitch = this.pitch;
    }, PASSIVE_TOUCH);

    this.domElement.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._touchId) {
          const dx = t.clientX - this._touchStartX;
          const dy = t.clientY - this._touchStartY;
          this.yaw = this._touchYaw - dx * TOUCH_LOOK_SENSITIVITY;
          this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
            this._touchPitch - dy * TOUCH_LOOK_SENSITIVITY));
        }
      }
    }, PASSIVE_TOUCH);

    this.domElement.addEventListener('touchend', (e) => {
      clearTrackedTouch(e.changedTouches);
    }, PASSIVE_TOUCH);

    this.domElement.addEventListener('touchcancel', (e) => {
      clearTrackedTouch(e.changedTouches);
    }, PASSIVE_TOUCH);
  }

  initYawFromCamera() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  }

  // Interface compatibility with desktop controller.
  lock() {}
  setBounds() {}

  get isLocked() { return true; }

  update(deltaTime, altitudeKm) {
    const gEff = getEffectiveGravity(altitudeKm);
    this.currentGEff = gEff;
    this._onCeiling = gEff < -0.00001;
    this.onCeiling = this._onCeiling;
    this.onFloor = !this._onCeiling;

    // Camera Y: lerp between floor and ceiling
    const targetY = this._onCeiling ? CEILING_EYE_HEIGHT : EYE_HEIGHT;
    this._cameraY += (targetY - this._cameraY) * Math.min(1, deltaTime * 2);

    // Touch-only mobile: visual inversion handled by canvas reflection.
    this.domElement.style.transform = this._onCeiling ? 'scaleY(-1)' : '';

    // Compose camera quaternion: yaw + pitch only.
    this._qYaw.setFromAxisAngle(UP, this.yaw);
    this._qPitch.setFromAxisAngle(RIGHT, this.pitch);
    this.camera.quaternion.copy(this._qYaw).multiply(this._qPitch);

    this.camera.position.y = this._cameraY;
  }
}
