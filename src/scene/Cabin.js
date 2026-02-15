import * as THREE from 'three';

// Cabin dimensions in km (10m = 0.01 km)
const W = 0.01;   // width (X)
const D = 0.01;   // depth (Z)
const H = 0.004;  // height (Y) = 4m

export class Cabin {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.7,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.6,
      roughness: 0.4,
      side: THREE.DoubleSide,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.15,
      metalness: 0.0,
      roughness: 0.0,
      transmission: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.8,
      roughness: 0.2,
    });

    // Floor — back half opaque, front half glass
    // Back half (metal floor)
    const backFloorGeo = new THREE.PlaneGeometry(W, D / 2);
    const backFloor = new THREE.Mesh(backFloorGeo, floorMat);
    backFloor.rotation.x = -Math.PI / 2;
    backFloor.position.set(0, 0, -D / 4);
    this.group.add(backFloor);

    // Front half (glass floor)
    const frontFloorGeo = new THREE.PlaneGeometry(W, D / 2);
    const frontFloor = new THREE.Mesh(frontFloorGeo, glassMat);
    frontFloor.rotation.x = -Math.PI / 2;
    frontFloor.position.set(0, 0, D / 4);
    this.group.add(frontFloor);

    // Glass floor grid lines for depth perception
    const gridMat = new THREE.MeshBasicMaterial({ color: 0x4488aa, transparent: true, opacity: 0.3 });
    for (let i = -4; i <= 4; i++) {
      const lineGeo = new THREE.PlaneGeometry(0.0001, D / 2);
      const line = new THREE.Mesh(lineGeo, gridMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(i * W / 10, 0.00001, D / 4);
      this.group.add(line);
    }
    for (let i = 0; i <= 4; i++) {
      const lineGeo = new THREE.PlaneGeometry(W, 0.0001);
      const line = new THREE.Mesh(lineGeo, gridMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(0, 0.00001, D / 2 - i * D / 10);
      this.group.add(line);
    }

    // Ceiling
    const ceilingGeo = new THREE.PlaneGeometry(W, D);
    const ceiling = new THREE.Mesh(ceilingGeo, wallMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, H, 0);
    this.group.add(ceiling);

    // Back wall (behind player)
    const backWallGeo = new THREE.PlaneGeometry(W, H);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, H / 2, -D / 2);
    this.group.add(backWall);

    // Left wall
    const leftWallGeo = new THREE.PlaneGeometry(D, H);
    const leftWall = new THREE.Mesh(leftWallGeo, wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-W / 2, H / 2, 0);
    this.group.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(leftWallGeo.clone(), wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(W / 2, H / 2, 0);
    this.group.add(rightWall);

    // Front wall — has a large panoramic window opening
    // We create the frame around the window as thin strips
    const windowBottom = H * 0.15;  // window starts 15% up (0.6m)
    const windowTop = H * 0.9;      // window ends 90% up (3.6m)
    const windowHeight = windowTop - windowBottom;
    const frameThickness = 0.0002; // 20cm

    // Bottom strip
    const bottomStripGeo = new THREE.PlaneGeometry(W, windowBottom);
    const bottomStrip = new THREE.Mesh(bottomStripGeo, wallMat);
    bottomStrip.position.set(0, windowBottom / 2, D / 2);
    this.group.add(bottomStrip);

    // Top strip
    const topStripGeo = new THREE.PlaneGeometry(W, H - windowTop);
    const topStrip = new THREE.Mesh(topStripGeo, wallMat);
    topStrip.position.set(0, (windowTop + H) / 2, D / 2);
    this.group.add(topStrip);

    // Window glass (very transparent)
    const windowGeo = new THREE.PlaneGeometry(W - frameThickness * 2, windowHeight);
    const windowGlass = new THREE.Mesh(windowGeo, glassMat.clone());
    windowGlass.position.set(0, windowBottom + windowHeight / 2, D / 2 - 0.00001);
    this.group.add(windowGlass);

    // Window frame — vertical pillars
    const pillarGeo = new THREE.BoxGeometry(frameThickness, windowHeight, frameThickness);
    const leftPillar = new THREE.Mesh(pillarGeo, frameMat);
    leftPillar.position.set(-W / 2 + frameThickness / 2, windowBottom + windowHeight / 2, D / 2);
    this.group.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo.clone(), frameMat);
    rightPillar.position.set(W / 2 - frameThickness / 2, windowBottom + windowHeight / 2, D / 2);
    this.group.add(rightPillar);

    // Center pillar
    const centerPillar = new THREE.Mesh(pillarGeo.clone(), frameMat);
    centerPillar.position.set(0, windowBottom + windowHeight / 2, D / 2);
    this.group.add(centerPillar);

    // Horizontal frame bars
    const hBarGeo = new THREE.BoxGeometry(W, frameThickness, frameThickness);
    const topBar = new THREE.Mesh(hBarGeo, frameMat);
    topBar.position.set(0, windowTop, D / 2);
    this.group.add(topBar);

    const bottomBar = new THREE.Mesh(hBarGeo.clone(), frameMat);
    bottomBar.position.set(0, windowBottom, D / 2);
    this.group.add(bottomBar);

    // Handrail along window
    const railGeo = new THREE.BoxGeometry(W * 0.8, 0.0001, 0.0003);
    const rail = new THREE.Mesh(railGeo, frameMat);
    rail.position.set(0, H * 0.3, D / 2 - 0.001);
    this.group.add(rail);

    // Rail supports
    for (let x = -0.003; x <= 0.003; x += 0.003) {
      const supportGeo = new THREE.BoxGeometry(0.0001, H * 0.3, 0.0001);
      const support = new THREE.Mesh(supportGeo, frameMat);
      support.position.set(x, H * 0.15, D / 2 - 0.001);
      this.group.add(support);
    }

    // Bench along back wall
    const benchGeo = new THREE.BoxGeometry(W * 0.6, 0.0005, 0.002);
    const bench = new THREE.Mesh(benchGeo, new THREE.MeshStandardMaterial({
      color: 0x555555, metalness: 0.5, roughness: 0.5,
    }));
    bench.position.set(0, 0.0005, -D / 2 + 0.002);
    this.group.add(bench);

    // Interior lighting
    const mainLight = new THREE.PointLight(0xffffff, 0.5, 0.05);
    mainLight.position.set(0, H - 0.0005, 0);
    this.group.add(mainLight);

    const accentLight = new THREE.PointLight(0x88aaff, 0.3, 0.03);
    accentLight.position.set(0, 0.001, D / 4);
    this.group.add(accentLight);

    // Ambient light for the whole scene
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    // Directional light (sunlight)
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(100, 50, 80);
    scene.add(sun);

    // Store bounds for collision
    this.bounds = {
      minX: -W / 2 + 0.0003,
      maxX: W / 2 - 0.0003,
      minZ: -D / 2 + 0.0003,
      maxZ: D / 2 - 0.0003,
      floorY: 0,
      ceilY: H,
    };
  }

  getBounds() {
    return this.bounds;
  }
}
