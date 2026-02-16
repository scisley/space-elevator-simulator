import * as THREE from 'three';
import { CABLE_LENGTH, CABIN_SIZE, EYE_HEIGHT } from '../constants.js';

// Offset cable slightly so it's beside the cabin, not through the camera
const CABLE_X = 0; // centered — runs through cabin
const NEAR_HALF = 0.1; // 100m above/below camera

export class Cable {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Nearby cable segment — visible cylinder that extends above and below
    const nearGeo = new THREE.CylinderGeometry(0.00015, 0.00015, NEAR_HALF * 2, 8);
    const nearMat = new THREE.MeshBasicMaterial({
      color: 0x999999,
      transparent: true,
      depthWrite: true,
    });
    this.nearCable = new THREE.Mesh(nearGeo, nearMat);
    this.nearCable.position.x = CABLE_X;
    this.nearCable.renderOrder = 2;
    this.group.add(this.nearCable);

    // Far cable — a line extending the full length
    const farMat = new THREE.LineBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
      depthWrite: true,
    });

    const altitudes = [0, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500, 1000,
      5000, 10000, 20000, 35786, 50000, 75000, CABLE_LENGTH];
    const points = altitudes.map(alt => new THREE.Vector3(CABLE_X, alt, 0));

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    this.farCable = new THREE.Line(geo, farMat);
    this.farCable.renderOrder = 2;
    this.group.add(this.farCable);
  }

  update(altitudeKm) {
    // Near cable follows camera vertically, clipped to cable endpoints
    // Cable ends at cabin ceiling (H - EYE_HEIGHT above camera) at the counterweight station
    const ceilingOffset = CABIN_SIZE.height - EYE_HEIGHT + 0.004; // 4m past cabin roof
    const bottom = Math.max(-altitudeKm, -NEAR_HALF);
    const top = Math.min(CABLE_LENGTH - altitudeKm + ceilingOffset, NEAR_HALF);

    if (top <= bottom) {
      this.nearCable.visible = false;
    } else {
      this.nearCable.visible = true;
      const len = top - bottom;
      this.nearCable.scale.y = len / (NEAR_HALF * 2);
      this.nearCable.position.y = (top + bottom) / 2;
    }

    // Far cable anchored at surface
    this.farCable.position.set(0, -altitudeKm, 0);
  }
}
