import * as THREE from 'three';

export class Stars {
  constructor(scene, loadingManager) {
    // Wrap points in a group so we can rotate the whole starfield
    this.group = new THREE.Group();
    scene.add(this.group);

    const count = 10000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const radius = 150000;

    for (let i = 0; i < count; i++) {
      // Uniform distribution on sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // Power-law brightness: most stars dim, few very bright
      const brightness = Math.pow(Math.random(), 2.5);

      // Color temperature variation
      const temp = Math.random();
      let r, g, b;
      if (temp < 0.1) {
        // Blue-white (hot)
        r = 0.7; g = 0.85; b = 1.0;
      } else if (temp < 0.3) {
        // Orange-red (cool)
        r = 1.0; g = 0.7; b = 0.4;
      } else {
        // White-yellow (common)
        r = 1.0; g = 1.0; b = 0.85;
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;

      // Size varies with brightness: dim=small, bright=large
      sizes[i] = 1.0 + brightness * 5.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));

    // Custom shader to support per-vertex sizes and bypass tone mapping
    const material = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float starSize;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = starSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          // Soft circular point
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
          gl_FragColor = vec4(vColor * alpha, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.group.add(this.points);
    this.material = material;
  }

  update(altitudeKm, sunAngle, polarAxis) {
    // Rotate starfield with the sun (stars are fixed in the inertial frame)
    if (sunAngle !== undefined && polarAxis) {
      this.group.quaternion.setFromAxisAngle(polarAxis, sunAngle);
    }
  }
}
