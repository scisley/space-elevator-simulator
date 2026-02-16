import * as THREE from 'three';
import { EARTH_RADIUS, ANCHOR_LAT_RAD, ANCHOR_LON_RAD, ATMO_THICKNESS } from '../constants.js';
import { getAtmosphereOpacity, getGroundPlaneOpacity } from '../simulation/physics.js';

export class Earth {
  constructor(scene, loadingManager) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    const texLoader = new THREE.TextureLoader(loadingManager);

    // Earth sphere — use MeshStandardMaterial for correct rendering pipeline
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const dayMap = texLoader.load('/textures/2k_earth_daymap.jpg');
    dayMap.colorSpace = THREE.SRGBColorSpace;

    this.earthMaterial = new THREE.MeshStandardMaterial({
      map: dayMap,
    });

    this.earthMesh = new THREE.Mesh(earthGeo, this.earthMaterial);
    this.group.add(this.earthMesh);

    // Night lights overlay — separate mesh, additive blending
    // Offset by 5 km to avoid z-fighting with the day mesh (log depth buffer needs margin)
    const nightGeo = new THREE.SphereGeometry(EARTH_RADIUS + 5, 64, 64);
    const nightMap = texLoader.load('/textures/2k_earth_nightmap.jpg');
    // No colorSpace — keep raw sRGB values since toneMapped=false bypasses encoding

    this.nightMaterial = new THREE.ShaderMaterial({
      uniforms: {
        nightTexture: { value: nightMap },
        sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vViewNormal;
        void main() {
          vUv = uv;
          vViewNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D nightTexture;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vViewNormal;
        void main() {
          vec3 normal = normalize(vViewNormal);
          vec3 sunDirView = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);
          float NdotL = dot(normal, sunDirView);

          // Show city lights only on the dark side
          // smoothstep requires edge0 < edge1; invert via 1.0 - smoothstep
          float nightFactor = 1.0 - smoothstep(-0.15, 0.1, NdotL);

          vec4 nightColor = texture2D(nightTexture, vUv);
          vec3 lights = nightColor.rgb * nightFactor * 3.0;

          gl_FragColor = vec4(lights, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.nightMesh = new THREE.Mesh(nightGeo, this.nightMaterial);
    this.group.add(this.nightMesh);

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
  }

  /**
   * Update Earth position/effects based on altitude.
   * @param {number} altitudeKm - current altitude above surface
   * @param {number} deltaTime - time since last frame in seconds
   * @param {THREE.Vector3} sunDirection - normalized world-space sun direction
   */
  update(altitudeKm, deltaTime, sunDirection) {
    const distFromCenter = EARTH_RADIUS + altitudeKm;
    this.group.position.set(0, -distFromCenter, 0);

    // Rotate Earth so anchor point faces upward (toward camera)
    this.earthMesh.rotation.set(0, 0, 0);
    this.earthMesh.rotation.y = -(ANCHOR_LON_RAD + Math.PI / 2);
    this.earthMesh.rotation.x = -Math.PI / 2;

    // Night overlay follows same rotation
    this.nightMesh.rotation.copy(this.earthMesh.rotation);

    // Update sun direction uniform for night overlay
    if (sunDirection) {
      this.nightMaterial.uniforms.sunDirection.value.copy(sunDirection);
    }

    // Copy rotation to cloud mesh, add slight offset for cloud movement
    this.cloudMesh.rotation.copy(this.earthMesh.rotation);
    this.cloudMesh.rotation.y += deltaTime * 0.001;

    // Atmosphere mesh follows Earth
    this.atmosphereMesh.rotation.copy(this.earthMesh.rotation);

    // Update atmosphere visibility
    const atmoOpacity = getAtmosphereOpacity(altitudeKm);
    this.atmosphereMaterial.uniforms.opacity.value = atmoOpacity;

    // Ground plane — sits at Earth's surface, facing the camera
    const groundOpacity = getGroundPlaneOpacity(altitudeKm);
    this.groundPlane.visible = groundOpacity > 0;
    if (this.groundPlane.visible) {
      this.groundPlane.position.set(0, distFromCenter - altitudeKm, 0);
      this.groundPlane.rotation.x = Math.PI / 2;
      const scale = Math.max(1, altitudeKm * 2);
      this.groundPlane.scale.set(scale, scale, 1);
      this.groundMaterial.opacity = groundOpacity;
    }
  }
}
