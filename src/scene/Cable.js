import * as THREE from 'three';
import { CABLE_LENGTH } from '../constants.js';

// Offset cable slightly so it's beside the cabin, not through the camera
const CABLE_X = 0; // centered — runs through cabin

export class Cable {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Nearby cable segment — visible cylinder that extends above and below
    const nearGeo = new THREE.CylinderGeometry(0.00015, 0.00015, 0.2, 8); // 15cm radius, 200m tall
    const nearMat = new THREE.MeshBasicMaterial({ color: 0x999999 });
    this.nearCable = new THREE.Mesh(nearGeo, nearMat);
    this.nearCable.position.x = CABLE_X;
    this.group.add(this.nearCable);

    // Far cable — a line extending the full length
    const farMat = new THREE.LineBasicMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.6,
    });

    const altitudes = [0, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500, 1000,
      5000, 10000, 20000, 35786, 50000, 75000, 100000];
    const points = altitudes.map(alt => new THREE.Vector3(CABLE_X, alt, 0));

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    this.farCable = new THREE.Line(geo, farMat);
    this.group.add(this.farCable);
  }

  update(altitudeKm) {
    // Near cable follows camera vertically
    this.nearCable.position.y = 0;

    // Far cable anchored at surface
    this.farCable.position.set(0, -altitudeKm, 0);
  }
}
