import * as THREE from 'three';
import { CABLE_LENGTH, EARTH_RADIUS } from '../constants.js';

export class Cable {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Nearby cable segment — visible as a thin cylinder
    // This follows the camera (extends above and below)
    const nearGeo = new THREE.CylinderGeometry(0.00005, 0.00005, 0.1, 8);
    const nearMat = new THREE.MeshBasicMaterial({ color: 0x888888 });
    this.nearCable = new THREE.Mesh(nearGeo, nearMat);
    this.group.add(this.nearCable);

    // Far cable — a line extending the full length
    const farMat = new THREE.LineBasicMaterial({
      color: 0x666666,
      transparent: true,
      opacity: 0.5,
    });

    // Create line points: from surface to 100,000 km
    // In world space, cable goes along +Y (upward from Earth)
    // But since Earth is positioned below camera, cable goes through origin
    const points = [];
    // Sample points along the cable (logarithmic spacing for visible portions)
    const altitudes = [0, 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 35786, 50000, 75000, 100000];
    for (const alt of altitudes) {
      points.push(new THREE.Vector3(0, alt, 0));
    }

    const farGeo = new THREE.BufferGeometry().setFromPoints(points);
    this.farCable = new THREE.Line(farGeo, farMat);
    this.group.add(this.farCable);
  }

  update(altitudeKm) {
    // Position the cable group so it aligns with the cabin
    // Cable runs along Y axis, anchored at Earth's surface
    // Camera is at origin, Earth surface is at -altitudeKm in Y

    // Near cable: centered on camera
    this.nearCable.position.set(0, 0, 0);

    // Far cable: positioned relative to Earth's surface
    // Each point's Y is an altitude, but we need to offset by current altitude
    // so the cable appears at the right positions relative to the camera
    this.farCable.position.set(0, -altitudeKm, 0);
  }
}
