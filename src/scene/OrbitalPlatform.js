import * as THREE from 'three';
import { CABLE_LENGTH } from '../constants.js';

export class OrbitalPlatform {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x999999,
      metalness: 0.7,
      roughness: 0.3,
    });

    // Main ring structure
    const ringGeo = new THREE.TorusGeometry(0.05, 0.005, 8, 24);
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    // Central hub
    const hubGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.03, 12);
    const hub = new THREE.Mesh(hubGeo, mat);
    this.group.add(hub);

    // Spokes
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const spokeGeo = new THREE.BoxGeometry(0.04, 0.002, 0.002);
      const spoke = new THREE.Mesh(spokeGeo, mat);
      spoke.position.set(
        Math.cos(angle) * 0.025,
        0,
        Math.sin(angle) * 0.025
      );
      spoke.rotation.y = -angle;
      this.group.add(spoke);
    }

    // Glow for distance visibility
    const glowGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.glow = new THREE.Mesh(glowGeo, glowMat);
    this.group.add(this.glow);
  }

  update(altitudeKm) {
    // Position at top of cable (100,000 km), relative to camera
    const relativeY = CABLE_LENGTH - altitudeKm;
    this.group.position.set(0, relativeY, 0);

    // Scale glow based on distance for visibility
    const dist = Math.abs(relativeY);
    if (dist > 1000) {
      this.glow.visible = true;
      this.glow.scale.setScalar(dist * 0.01);
    } else {
      this.glow.visible = false;
    }

    // Hide when very far
    this.group.visible = dist < 80000;
  }
}
