import * as THREE from 'three';

export class Stars {
  constructor(scene, loadingManager, polarAxis) {
    // Wrap points in a group so we can rotate the whole starfield
    this.group = new THREE.Group();
    scene.add(this.group);

    this.material = null;
    this.points = null;

    // Pre-compute rotation quaternion: maps celestial north pole (+Y) to simulation's polar axis
    const rotationQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      polarAxis
    );

    // Load real star catalog data
    const loader = new THREE.FileLoader(loadingManager);
    loader.load('data/stars.json', (text) => {
      const data = JSON.parse(text);
      const count = data.count;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const sizes = new Float32Array(count);

      const pos = new THREE.Vector3();

      for (let i = 0; i < count; i++) {
        const s = data.stars[i];
        // Pre-rotate position from celestial coords to simulation coords
        pos.set(s[0], s[1], s[2]).applyQuaternion(rotationQuat);
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;
        sizes[i] = s[3];
        colors[i * 3] = s[4];
        colors[i * 3 + 1] = s[5];
        colors[i * 3 + 2] = s[6];
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));

      this.material = new THREE.ShaderMaterial({
        uniforms: {
          brightnessMultiplier: { value: 1.3 },
        },
        vertexShader: `
          attribute float starSize;
          attribute vec3 color;
          uniform float brightnessMultiplier;
          varying vec3 vColor;
          void main() {
            float bm = 3.0 * brightnessMultiplier;
            vColor = color * bm;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            // Stars are at infinity — use flat size, no perspective division
            gl_PointSize = max(starSize * bm, 1.0);
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

      this.points = new THREE.Points(geometry, this.material);
      this.points.renderOrder = -1; // render before sky so sky's alpha occludes stars
      this.group.add(this.points);
    });
  }

  setBrightnessMultiplier(value) {
    if (this.material) {
      this.material.uniforms.brightnessMultiplier.value = value;
    }
  }

  update(altitudeKm, sunAngle, polarAxis) {
    // Rotate starfield with the sun (stars are fixed in the inertial frame)
    if (sunAngle !== undefined && polarAxis) {
      this.group.quaternion.setFromAxisAngle(polarAxis, sunAngle);
    }
  }
}
