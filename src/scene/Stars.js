import * as THREE from 'three';

export class Stars {
  constructor(scene, loadingManager) {
    // Starfield as point cloud for crisp stars at all angles
    const count = 8000;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const radius = 150000;

    for (let i = 0; i < count; i++) {
      // Uniform distribution on sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      sizes[i] = Math.random() * 2 + 0.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 40,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });

    this.points = new THREE.Points(geometry, material);
    scene.add(this.points);
    this.material = material;
  }

  // Stars are always visible (sky dome handles the blue sky overlay)
  update(altitudeKm) {
    // Stars are always present; the sky dome covers them at low altitude
  }
}
