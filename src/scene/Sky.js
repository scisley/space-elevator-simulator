import * as THREE from 'three';
import { getSkyBlendFactor } from '../simulation/physics.js';

export class Sky {
  constructor(scene) {
    // Inverted sphere for sky dome
    const geometry = new THREE.SphereGeometry(500, 32, 32);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        blendFactor: { value: 1.0 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float blendFactor;
        varying vec3 vWorldPosition;
        void main() {
          // Gradient from horizon (lighter blue) to zenith (darker blue)
          vec3 dir = normalize(vWorldPosition);
          float elevation = dir.y; // -1 (nadir) to +1 (zenith)

          // Sky gradient
          vec3 horizonColor = vec3(0.6, 0.8, 1.0);
          vec3 zenithColor = vec3(0.1, 0.3, 0.8);
          vec3 belowColor = vec3(0.15, 0.25, 0.4);

          vec3 skyColor;
          if (elevation > 0.0) {
            skyColor = mix(horizonColor, zenithColor, elevation);
          } else {
            skyColor = mix(horizonColor, belowColor, -elevation);
          }

          gl_FragColor = vec4(skyColor, blendFactor);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    scene.add(this.mesh);
  }

  update(altitudeKm, sunDirection) {
    let factor = getSkyBlendFactor(altitudeKm);

    // Dim sky at night based on sun elevation
    if (sunDirection) {
      // sunDirection.y is the sun's elevation component in world space
      // (positive = above horizon from elevator's perspective)
      const sunElevation = sunDirection.y;
      const daytimeFactor = THREE.MathUtils.smoothstep(sunElevation, -0.1, 0.15);
      factor *= daytimeFactor;
    }

    this.material.uniforms.blendFactor.value = factor;
    this.mesh.visible = factor > 0.001;
  }
}
