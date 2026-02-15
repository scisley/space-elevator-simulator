import * as THREE from 'three';

export class AnchorStation {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x777777,
      metalness: 0.6,
      roughness: 0.4,
    });

    // Base platform
    const baseGeo = new THREE.BoxGeometry(0.05, 0.002, 0.05); // 50m x 2m x 50m
    const base = new THREE.Mesh(baseGeo, mat);
    base.position.y = 0.001;
    this.group.add(base);

    // Tower structure
    const towerGeo = new THREE.BoxGeometry(0.005, 0.02, 0.005); // 5m x 20m x 5m
    const tower = new THREE.Mesh(towerGeo, mat);
    tower.position.y = 0.012;
    this.group.add(tower);

    // Support struts
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
      const strutGeo = new THREE.BoxGeometry(0.001, 0.015, 0.001);
      const strut = new THREE.Mesh(strutGeo, mat);
      strut.position.set(
        Math.cos(angle) * 0.015,
        0.009,
        Math.sin(angle) * 0.015
      );
      strut.rotation.z = Math.cos(angle) * 0.3;
      strut.rotation.x = Math.sin(angle) * 0.3;
      this.group.add(strut);
    }

    // Red beacon light
    const beaconGeo = new THREE.SphereGeometry(0.001, 8, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.beacon = new THREE.Mesh(beaconGeo, beaconMat);
    this.beacon.position.y = 0.023;
    this.group.add(this.beacon);

    this.time = 0;
  }

  update(altitudeKm, deltaTime) {
    // Position at surface level (which is at -altitudeKm in world Y)
    this.group.position.set(0, -altitudeKm, 0);

    // Blink beacon
    this.time += deltaTime;
    this.beacon.visible = Math.sin(this.time * 3) > 0;

    // Only visible when reasonably close
    this.group.visible = altitudeKm < 50;
  }
}
