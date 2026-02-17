import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {
  EYE_HEIGHT, HEAD_CLEARANCE,
  SAFETY_NET_DELAY, SAFETY_NET_FORCE,
  MAG_BOOTS_FORCE
} from '../constants.js';
import { getEffectiveGravity } from '../simulation/physics.js';

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

export class FirstPersonController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);

    // Remove only PointerLockControls' mousemove handler — we handle mouse look ourselves.
    // Keep pointerlockchange so isLocked state and lock/unlock events still work.
    domElement.ownerDocument.removeEventListener('mousemove', this.controls._onMouseMove);

    this.enabled = false;

    // Custom mouse look state
    this.yaw = 0;
    this.pitch = 0;
    this.flipAngle = 0;        // 0 = upright, PI = inverted
    this.targetFlipAngle = 0;

    // Movement state
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.jumping = false;

    // Vertical physics
    this.verticalVelocity = 0;
    this.onFloor = true;
    this.onCeiling = false;

    // Horizontal velocity preserved through jumps (km/s)
    this.airVelocity = new THREE.Vector3();

    // Mag boots (hold G)
    this.magBootsHeld = false;

    // Safety net (anti-stuck drift)
    this.floatingTime = 0;

    // Cabin bounds (set from cabin)
    this.bounds = null;

    // Walk speed in km/s (about 1.5 m/s walking speed)
    this.walkSpeed = 0.0015; // 1.5 m/s = 0.0015 km/s

    // Current effective gravity (exposed for HUD)
    this.currentGEff = 9.8;

    // Reusable quaternions
    this._qYaw = new THREE.Quaternion();
    this._qPitch = new THREE.Quaternion();
    this._qFlip = new THREE.Quaternion();

    this.setupInput(domElement);
    this.setupMouseLook();
  }

  /**
   * Initialize yaw from a lookAt direction (call after camera.lookAt in main.js)
   */
  initYawFromCamera() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    // yaw = angle around Y axis from -Z toward +X
    this.yaw = Math.atan2(-dir.x, -dir.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  }

  setupMouseLook() {
    document.addEventListener('mousemove', (e) => {
      if (!this.controls.isLocked) return;
      // When camera is flipped, the 180° roll around Z negates the camera's
      // right and up axes. Negate mouse deltas so screen-space input stays correct.
      const flipSign = this.flipAngle < Math.PI / 2 ? 1 : -1;
      this.yaw -= e.movementX * 0.002 * flipSign;
      this.pitch -= e.movementY * 0.002 * flipSign;
      this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch));
    });
  }

  setupInput(domElement) {
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.moveForward = true; break;
        case 'KeyS': case 'ArrowDown': this.moveBackward = true; break;
        case 'KeyA': case 'ArrowLeft': this.moveLeft = true; break;
        case 'KeyD': case 'ArrowRight': this.moveRight = true; break;
        case 'Space':
          e.preventDefault();
          if (this.onFloor || this.onCeiling) {
            this.jumping = true;
          }
          break;
        case 'KeyG':
          this.magBootsHeld = true;
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.moveForward = false; break;
        case 'KeyS': case 'ArrowDown': this.moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft': this.moveLeft = false; break;
        case 'KeyD': case 'ArrowRight': this.moveRight = false; break;
        case 'KeyG':
          this.magBootsHeld = false;
          break;
      }
    });
  }

  lock() {
    this.controls.lock();
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  update(deltaTime, altitudeKm) {
    if (!this.controls.isLocked) return;

    // Effective gravity at current altitude (m/s²)
    // Positive = toward Earth (floor), Negative = away from Earth (ceiling)
    const gEff = getEffectiveGravity(altitudeKm);
    this.currentGEff = gEff;
    // Convert to km/s² for our coordinate system (1 m = 0.001 km)
    const gKm = gEff / 1000; // m/s² to km/s²

    const bounds = this.bounds;
    if (!bounds) return;

    // --- Camera flip based on gravity direction ---
    if (gEff < -0.00001) this.targetFlipAngle = Math.PI;     // reversed: flip
    else if (gEff > 0.00001) this.targetFlipAngle = 0;     // normal: upright
    // else hold current angle (micro-g dead zone)

    // Smooth exponential approach (~1.5 second transition)
    this.flipAngle += (this.targetFlipAngle - this.flipAngle) * Math.min(1, deltaTime * 2);
    // Snap when close
    if (Math.abs(this.flipAngle - this.targetFlipAngle) < 0.001) {
      this.flipAngle = this.targetFlipAngle;
    }

    // --- Compose camera quaternion: Yaw * Pitch * Flip ---
    this._qYaw.setFromAxisAngle(UP, this.yaw);
    this._qPitch.setFromAxisAngle(RIGHT, this.pitch);
    this._qFlip.setFromAxisAngle(FORWARD, this.flipAngle);
    this.camera.quaternion.copy(this._qYaw).multiply(this._qPitch).multiply(this._qFlip);

    // Body orientation follows camera flip, not instantaneous gravity sign.
    // This prevents collision flickering in the micro-g dead zone and keeps
    // the player's visual orientation consistent with collision detection.
    const bodyInverted = this.flipAngle > Math.PI / 2;
    const flipSign = bodyInverted ? -1 : 1;

    // --- Horizontal movement ---
    // On a surface: WASD controls velocity directly; store it for jump momentum.
    // Airborne: no WASD control, but preserved velocity carries through.
    if (this.onFloor || this.onCeiling) {
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      // When flipped, camera right is negated — negate strafe to match visual frame
      const right = new THREE.Vector3(-forward.z * flipSign, 0, forward.x * flipSign);

      const walkDir = new THREE.Vector3();
      if (this.moveForward) walkDir.add(forward);
      if (this.moveBackward) walkDir.sub(forward);
      if (this.moveLeft) walkDir.sub(right);
      if (this.moveRight) walkDir.add(right);

      if (walkDir.length() > 0) {
        walkDir.normalize();
        this.airVelocity.copy(walkDir).multiplyScalar(this.walkSpeed);
      } else {
        this.airVelocity.set(0, 0, 0);
      }
    }
    // else: airVelocity persists from last surface frame

    // Apply horizontal velocity with hex collision
    let newX = this.camera.position.x + this.airVelocity.x * deltaTime;
    let newZ = this.camera.position.z + this.airVelocity.z * deltaTime;

    for (const face of bounds.faces) {
      const dot = newX * face.nx + newZ * face.nz;
      if (dot > bounds.inradius) {
        newX -= (dot - bounds.inradius) * face.nx;
        newZ -= (dot - bounds.inradius) * face.nz;
      }
    }

    this.camera.position.x = newX;
    this.camera.position.z = newZ;

    // --- Jumping ---
    if (this.jumping) {
      const gAbs = Math.abs(gEff); // m/s²
      // Cap jump height to ~2m at current gravity
      const maxHeightImpulse = gAbs > 0.1 ? Math.sqrt(2 * gAbs * 2.0) : 0.63;
      const jumpSpeed = Math.min(3.0, maxHeightImpulse); // m/s
      const jumpImpulse = jumpSpeed / 1000; // convert to km/s

      // Always jump away from the surface: +Y from floor, -Y from ceiling
      if (this.onFloor) {
        this.verticalVelocity = jumpImpulse;
      } else if (this.onCeiling) {
        this.verticalVelocity = -jumpImpulse;
      }
      this.onFloor = false;
      this.onCeiling = false;
      this.jumping = false;
    }

    // --- Apply gravity to vertical velocity ---
    this.verticalVelocity -= gKm * deltaTime;

    // --- Mag boots: 1g pull toward standing surface while held ---
    if (this.magBootsHeld) {
      const bootAccel = MAG_BOOTS_FORCE / 1000; // m/s² to km/s²
      // Pull toward floor (downward) when upright, toward ceiling (upward) when inverted
      if (bodyInverted) {
        this.verticalVelocity += bootAccel * deltaTime;
      } else {
        this.verticalVelocity -= bootAccel * deltaTime;
      }
    }

    // --- Update vertical position ---
    let newY = this.camera.position.y + this.verticalVelocity * deltaTime;

    // --- Collision detection ---
    // Body extents follow camera flip orientation (not raw gravity sign).
    // This prevents collision flickering in the micro-g dead zone near GEO.
    if (!bodyInverted) {
      // Upright: feet below camera, head above
      const feetY = newY - EYE_HEIGHT;
      const headTopY = newY + HEAD_CLEARANCE;

      if (feetY <= bounds.floorY) {
        newY = bounds.floorY + EYE_HEIGHT;
        this.verticalVelocity = 0;
        this.onFloor = true;
        this.onCeiling = false;
      } else if (headTopY >= bounds.ceilY) {
        newY = bounds.ceilY - HEAD_CLEARANCE;
        this.verticalVelocity = 0;
        this.onFloor = false;
        this.onCeiling = true;
      } else {
        this.onFloor = false;
        this.onCeiling = false;
      }
    } else {
      // Inverted: feet above camera (on ceiling), head below (toward floor)
      const feetY = newY + EYE_HEIGHT;
      const headBottomY = newY - HEAD_CLEARANCE;

      if (feetY >= bounds.ceilY) {
        newY = bounds.ceilY - EYE_HEIGHT;
        this.verticalVelocity = 0;
        this.onFloor = false;
        this.onCeiling = true;
      } else if (headBottomY <= bounds.floorY) {
        newY = bounds.floorY + HEAD_CLEARANCE;
        this.verticalVelocity = 0;
        this.onFloor = true;
        this.onCeiling = false;
      } else {
        this.onFloor = false;
        this.onCeiling = false;
      }
    }

    // --- Safety net (anti-stuck drift) ---
    if (!this.onFloor && !this.onCeiling) {
      if (Math.abs(this.verticalVelocity) < 0.0000005) { // < 0.5 mm/s in km/s
        this.floatingTime += deltaTime;
      } else {
        this.floatingTime = 0;
      }

      if (this.floatingTime > SAFETY_NET_DELAY) {
        // Nudge toward nearest surface
        const midY = (bounds.floorY + bounds.ceilY) / 2;
        const toward = this.camera.position.y > midY ? 1 : -1; // +1=ceiling, -1=floor
        const nudge = SAFETY_NET_FORCE / 1000; // m/s² to km/s²
        this.verticalVelocity += toward * nudge * deltaTime;
      }
    } else {
      this.floatingTime = 0;
    }

    this.camera.position.y = newY;
  }

  get isLocked() {
    return this.controls.isLocked;
  }
}
