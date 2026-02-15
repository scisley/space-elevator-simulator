import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EYE_HEIGHT, CABIN_SIZE } from '../constants.js';
import { getEffectiveGravity } from '../simulation/physics.js';

export class FirstPersonController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    this.enabled = false;

    // Movement state
    this.velocity = new THREE.Vector3();
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.jumping = false;

    // Vertical physics
    this.verticalVelocity = 0;
    this.onFloor = true;
    this.onCeiling = false;

    // Cabin bounds (set from cabin)
    this.bounds = null;

    // Walk speed in km/s (about 1.5 m/s walking speed)
    this.walkSpeed = 0.0015; // 1.5 m/s = 0.0015 km/s

    this.setupInput(domElement);
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
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': this.moveForward = false; break;
        case 'KeyS': case 'ArrowDown': this.moveBackward = false; break;
        case 'KeyA': case 'ArrowLeft': this.moveLeft = false; break;
        case 'KeyD': case 'ArrowRight': this.moveRight = false; break;
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
    const gEff = getEffectiveGravity(altitudeKm);
    // Convert to km/s² for our coordinate system
    const gKm = gEff / 1_000_000; // m/s² to km/s²

    const bounds = this.bounds;
    if (!bounds) return;

    // Horizontal movement
    const direction = new THREE.Vector3();
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

    if (this.moveForward) direction.add(forward);
    if (this.moveBackward) direction.sub(forward);
    if (this.moveLeft) direction.sub(right);
    if (this.moveRight) direction.add(right);

    if (direction.length() > 0) {
      direction.normalize();
      direction.multiplyScalar(this.walkSpeed * deltaTime);
    }

    // Apply horizontal movement with collision
    let newX = this.camera.position.x + direction.x;
    let newZ = this.camera.position.z + direction.z;

    newX = Math.max(bounds.minX, Math.min(bounds.maxX, newX));
    newZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, newZ));

    this.camera.position.x = newX;
    this.camera.position.z = newZ;

    // Jumping
    if (this.jumping) {
      // Jump impulse: 3 m/s converted to km/s, direction depends on gravity
      const jumpImpulse = 0.003 / 1000; // 3 m/s in km/s
      if (gEff >= 0) {
        // Normal or reduced gravity: jump upward
        this.verticalVelocity = jumpImpulse;
      } else {
        // Reversed gravity (above GEO): jump "downward" (toward Earth)
        this.verticalVelocity = -jumpImpulse;
      }
      this.onFloor = false;
      this.onCeiling = false;
      this.jumping = false;
    }

    // Apply gravity to vertical velocity
    this.verticalVelocity -= gKm * deltaTime;

    // Update vertical position
    let newY = this.camera.position.y + this.verticalVelocity * deltaTime;

    // Floor collision
    const feetY = newY - EYE_HEIGHT;
    if (feetY <= bounds.floorY) {
      newY = bounds.floorY + EYE_HEIGHT;
      this.verticalVelocity = 0;
      this.onFloor = true;
      this.onCeiling = false;
    }
    // Ceiling collision
    else if (newY + 0.0003 >= bounds.ceilY) { // 30cm head clearance
      newY = bounds.ceilY - 0.0003;
      this.verticalVelocity = 0;
      this.onFloor = false;
      this.onCeiling = true;
    }
    else {
      this.onFloor = false;
      this.onCeiling = false;
    }

    this.camera.position.y = newY;
  }

  get isLocked() {
    return this.controls.isLocked;
  }
}
