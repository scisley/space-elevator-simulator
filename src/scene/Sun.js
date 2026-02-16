import * as THREE from 'three';
import { SUN_DISTANCE, SUN_VISUAL_RADIUS, EARTH_RADIUS } from '../constants.js';

export class Sun {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // Bright sun sphere (HDR color for bloom through ACES tone mapping)
    const sunGeo = new THREE.SphereGeometry(SUN_VISUAL_RADIUS, 32, 32);
    const sunMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(3, 3, 2.8),
    });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.group.add(this.sunMesh);

    // Procedural glow sprite via canvas radial gradient — large to simulate eye glare
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 255, 220, 1.0)');
    gradient.addColorStop(0.1, 'rgba(255, 240, 180, 0.8)');
    gradient.addColorStop(0.3, 'rgba(255, 220, 140, 0.3)');
    gradient.addColorStop(0.6, 'rgba(255, 200, 100, 0.08)');
    gradient.addColorStop(1, 'rgba(255, 180, 60, 0.0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    const glowTexture = new THREE.CanvasTexture(canvas);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(2.5, 2.2, 1.5),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.glowSprite = new THREE.Sprite(glowMat);
    this.glowSprite.scale.set(SUN_VISUAL_RADIUS * 20, SUN_VISUAL_RADIUS * 20, 1);
    this.group.add(this.glowSprite);

    // Directional light owned by the sun
    this.light = new THREE.DirectionalLight(0xffffff, 1.5);
    scene.add(this.light);
  }

  update(sunDirection, altitudeKm) {
    // Geometric Earth occlusion test
    // Camera at origin, Earth center at (0, -(R+alt), 0)
    // Sun is occluded when its direction falls within Earth's angular disc
    const distFromCenter = EARTH_RADIUS + altitudeKm;
    const earthAngularRadius = Math.asin(EARTH_RADIUS / distFromCenter);
    // Angle between sun direction and nadir (0,-1,0):
    // cos(angle) = dot(sunDir, (0,-1,0)) = -sunDir.y
    // Sun is occluded when angle < earthAngularRadius
    // i.e. -sunDir.y > cos(earthAngularRadius)
    const cosThreshold = Math.cos(earthAngularRadius);
    const occluded = -sunDirection.y > cosThreshold;

    this.sunMesh.visible = !occluded;
    this.glowSprite.visible = !occluded;

    // Position sun mesh at SUN_DISTANCE along sunDirection
    this.sunMesh.position.copy(sunDirection).multiplyScalar(SUN_DISTANCE);
    this.glowSprite.position.copy(this.sunMesh.position);

    // Aim directional light from sun direction
    this.light.position.copy(sunDirection).multiplyScalar(1000);
    this.light.target.position.set(0, 0, 0);
    this.light.target.updateMatrixWorld();
  }
}
