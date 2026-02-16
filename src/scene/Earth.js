import * as THREE from 'three';
import { EARTH_RADIUS, ANCHOR_LAT, ANCHOR_LON, ANCHOR_LAT_RAD, ANCHOR_LON_RAD, ATMO_THICKNESS } from '../constants.js';
import { getAtmosphereOpacity, getGroundPlaneOpacity } from '../simulation/physics.js';
import { loadRegionalTexture } from '../loaders/TileLoader.js';

// Offset above Earth surface (km) to avoid z-fighting with the day mesh
// Keep minimal — log depth buffer handles small gaps well
const PATCH_ALTITUDE_OFFSET = 0.01;

export class Earth {
  // Shared onBeforeCompile hook: boosts dark ocean albedo so it's
  // visible blue in sunlight but black on the unlit night side.
  static _oceanBoostCompile(shader) {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       {
         float isOcean = step(diffuseColor.b, 0.008) * step(diffuseColor.r, diffuseColor.b) * step(diffuseColor.g, diffuseColor.b);
         diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 5.0 + vec3(0.002, 0.004, 0.015), isOcean);
       }`
    );
  }

  constructor(scene, loadingManager) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    const texLoader = new THREE.TextureLoader(loadingManager);

    // Earth sphere — use MeshStandardMaterial for correct rendering pipeline
    const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128);
    const dayMap = texLoader.load('/textures/8k_earth_daymap.jpg');
    dayMap.colorSpace = THREE.SRGBColorSpace;
    dayMap.anisotropy = 16;

    this.earthMaterial = new THREE.MeshStandardMaterial({
      map: dayMap,
    });

    // Boost dark ocean pixels in the albedo so the effect is lighting-dependent:
    // day side: boosted albedo × sunlight = visible blue
    // night side: boosted albedo × 0 = black
    this.earthMaterial.onBeforeCompile = Earth._oceanBoostCompile;

    this.earthMesh = new THREE.Mesh(earthGeo, this.earthMaterial);
    this.group.add(this.earthMesh);

    // Night lights overlay — separate mesh, additive blending
    // Offset by 5 km to avoid z-fighting with the day mesh (log depth buffer needs margin)
    const nightGeo = new THREE.SphereGeometry(EARTH_RADIUS + 5, 128, 128);
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
          // The night texture has a baked-in blue ocean tint (~RGB 4,6,21).
          // Filter it out: ocean max is 21/255=0.082, so threshold at 0.1.
          float brightness = max(nightColor.r, max(nightColor.g, nightColor.b));
          float mask = step(0.1, brightness);
          vec3 lights = nightColor.rgb * nightFactor * mask * 3.0;

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

    // Atmosphere glow (Fresnel-based)
    const atmoGeo = new THREE.SphereGeometry(EARTH_RADIUS + ATMO_THICKNESS, 128, 128);
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
          // Flip normal for BackSide — without this, dot is always ≤ 0
          // and rim = 1.0 everywhere, flooding the entire disc with glow
          vec3 normal = -normalize(vNormal);
          float rim = 1.0 - max(dot(viewDir, normal), 0.0);
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

    // Regional high-res spherical patch (created async when tiles load)
    this.regionalPatch = null;
    this.regionalMaterial = null;

    loadingManager.itemStart('regional-tiles');
    loadRegionalTexture(ANCHOR_LAT, ANCHOR_LON).then((result) => {
      if (result) {
        this._createRegionalPatch(result);
      }
      loadingManager.itemEnd('regional-tiles');
    }).catch(() => {
      loadingManager.itemEnd('regional-tiles');
    });
  }

  /**
   * Create a spherical patch geometry that overlays the Earth sphere
   * with high-res regional satellite tiles.
   */
  _createRegionalPatch({ texture, alphaMap, bounds }) {
    const { latMin, latMax, lonMin, lonMax } = bounds;

    // Convert geographic bounds to Three.js SphereGeometry parameters.
    // Three.js SphereGeometry: phi = azimuthal (longitude), theta = polar (from +Y pole).
    // phi mapping: lon=-180° → phi=0, lon=180° → phi=2π
    const phiStart = (lonMin + 180) * Math.PI / 180;
    const phiLength = (lonMax - lonMin) * Math.PI / 180;
    // theta mapping: lat=90° → theta=0 (north pole), lat=-90° → theta=π (south pole)
    const thetaStart = (90 - latMax) * Math.PI / 180;
    const thetaLength = (latMax - latMin) * Math.PI / 180;

    const patchGeo = new THREE.SphereGeometry(
      EARTH_RADIUS + PATCH_ALTITUDE_OFFSET,
      64, 64,
      phiStart, phiLength,
      thetaStart, thetaLength
    );

    this.regionalMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      alphaMap: alphaMap,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      roughness: 0.8,
      metalness: 0.0,
    });
    this.regionalMaterial.onBeforeCompile = Earth._oceanBoostCompile;
    this.regionalMaterial.renderOrder = 1;

    this.regionalPatch = new THREE.Mesh(patchGeo, this.regionalMaterial);
    this.regionalPatch.renderOrder = 1;
    this.group.add(this.regionalPatch);
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

    // Atmosphere mesh follows Earth
    this.atmosphereMesh.rotation.copy(this.earthMesh.rotation);

    // Update atmosphere visibility
    const atmoOpacity = getAtmosphereOpacity(altitudeKm);
    this.atmosphereMaterial.uniforms.opacity.value = atmoOpacity;

    // Regional patch — follows Earth rotation, fades with altitude
    if (this.regionalPatch) {
      this.regionalPatch.rotation.copy(this.earthMesh.rotation);
      const patchOpacity = getGroundPlaneOpacity(altitudeKm);
      this.regionalPatch.visible = patchOpacity > 0;
      if (this.regionalPatch.visible) {
        this.regionalMaterial.opacity = patchOpacity;
      }
    }
  }
}
