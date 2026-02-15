import * as THREE from 'three';
import { EARTH_RADIUS, ANCHOR_LAT_RAD, ANCHOR_LON_RAD, ATMO_THICKNESS } from '../constants.js';
import { getAtmosphereOpacity, getGroundPlaneOpacity } from '../simulation/physics.js';

export class Earth {
  constructor(scene, loadingManager) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    const texLoader = new THREE.TextureLoader(loadingManager);

    // Earth sphere
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);

    // Day/night shader material
    const dayMap = texLoader.load('/textures/2k_earth_daymap.jpg');
    dayMap.colorSpace = THREE.SRGBColorSpace;

    this.earthMaterial = new THREE.MeshStandardMaterial({
      map: dayMap,
    });

    this.earthMesh = new THREE.Mesh(earthGeo, this.earthMaterial);
    this.group.add(this.earthMesh);

    // Cloud layer
    const cloudGeo = new THREE.SphereGeometry(EARTH_RADIUS + 10, 64, 64);
    const cloudMap = texLoader.load('/textures/2k_earth_clouds.jpg');
    this.cloudMaterial = new THREE.ShaderMaterial({
      uniforms: {
        cloudTexture: { value: cloudMap },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D cloudTexture;
        varying vec2 vUv;
        void main() {
          float cloud = texture2D(cloudTexture, vUv).r;
          gl_FragColor = vec4(1.0, 1.0, 1.0, cloud * 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.cloudMesh = new THREE.Mesh(cloudGeo, this.cloudMaterial);
    this.cloudMesh.visible = false;
    this.group.add(this.cloudMesh);

    // Atmosphere glow (Fresnel-based)
    const atmoGeo = new THREE.SphereGeometry(EARTH_RADIUS + ATMO_THICKNESS, 64, 64);
    this.atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0.3, 0.6, 1.0) },
        opacity: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform float opacity;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          float rim = 1.0 - max(dot(viewDir, vNormal), 0.0);
          float glow = pow(rim, 3.0) * 1.5;
          gl_FragColor = vec4(glowColor, glow * opacity);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.atmosphereMesh = new THREE.Mesh(atmoGeo, this.atmosphereMaterial);
    this.group.add(this.atmosphereMesh);

    // Ground plane (ocean) for low-altitude detail
    const groundGeo = new THREE.PlaneGeometry(200, 200, 1, 1);
    this.groundMaterial = new THREE.MeshBasicMaterial({
      color: 0x1a3c5a,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
    });
    this.groundPlane = new THREE.Mesh(groundGeo, this.groundMaterial);
    this.group.add(this.groundPlane);

    // Sun direction — position so Ecuador/anchor is in daytime
  }

  /**
   * Update Earth position/effects based on altitude.
   * Camera stays at origin; Earth group moves to keep Earth at correct distance.
   * @param {number} altitudeKm - current altitude above surface
   * @param {number} deltaTime - time since last frame in seconds
   */
  update(altitudeKm, deltaTime) {
    // Position Earth so the camera (at origin) is at the correct altitude
    // Anchor is at 0°N, 80°W on Earth's surface
    // Cable goes radially outward from anchor point
    // Camera at origin, Earth center below at distance (EARTH_RADIUS + altitudeKm)

    // Cable direction: radially outward from Earth center at anchor point
    // In world coords: camera at origin looking out window,
    // Earth is "below" (negative Y in the world)
    const distFromCenter = EARTH_RADIUS + altitudeKm;
    this.group.position.set(0, -distFromCenter, 0);

    // Rotate Earth so anchor point faces upward (toward camera)
    // Default sphere has +Y as north pole, texture wraps with lon=0 at +Z
    // We need to rotate so that (lat=0, lon=-80°) on the sphere points toward +Y
    this.earthMesh.rotation.set(0, 0, 0);
    // Rotate around Y axis to bring the right longitude to face up
    // The sphere UV maps with lon=0 at the +X/+Z seam
    // To get lon=-80° facing +Y, we rotate around the Earth's polar axis
    this.earthMesh.rotation.y = -(ANCHOR_LON_RAD + Math.PI / 2);
    // Then tilt so equator (lat=0) is at the top
    this.earthMesh.rotation.x = -Math.PI / 2;

    // Copy rotation to cloud mesh, add slight offset for cloud movement
    this.cloudMesh.rotation.copy(this.earthMesh.rotation);
    this.cloudMesh.rotation.y += deltaTime * 0.001; // slow cloud drift

    // Atmosphere mesh follows Earth
    this.atmosphereMesh.rotation.copy(this.earthMesh.rotation);

    // Update atmosphere visibility
    const atmoOpacity = getAtmosphereOpacity(altitudeKm);
    this.atmosphereMaterial.uniforms.opacity.value = atmoOpacity;

    // Ground plane — sits at Earth's surface, facing the camera
    const groundOpacity = getGroundPlaneOpacity(altitudeKm);
    this.groundPlane.visible = groundOpacity > 0;
    if (this.groundPlane.visible) {
      this.groundPlane.position.set(0, distFromCenter - altitudeKm, 0); // relative to group, at surface
      this.groundPlane.rotation.x = Math.PI / 2; // face upward in group space (which is toward camera)
      // Scale ground plane based on altitude for appropriate coverage
      const scale = Math.max(1, altitudeKm * 2);
      this.groundPlane.scale.set(scale, scale, 1);
      this.groundMaterial.opacity = groundOpacity;
    }
  }
}
