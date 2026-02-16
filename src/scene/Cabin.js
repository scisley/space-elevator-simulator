import * as THREE from 'three';

const RADIUS = 0.005;    // 5m center to vertex (km)
const H = 0.006;         // 6m height (km)
const SIDES = 6;

// Structural dimensions (all in km)
const HUB_RADIUS = 0.0006;
const HUB_THICKNESS = 0.00015;
const RIB_SIZE = 0.00012;
const SILL_HEIGHT = 0.0001;
const SILL_DEPTH = 0.00012;
const GLASS_INSET = 0.00002;
const LED_HEIGHT = 0.00004;
const PILLAR_SIZE = 0.0003;
const PLATE_HEIGHT = 0.0005;
const PLATE_DEPTH = 0.00008;
const TRIM_SIZE = 0.00006;
const RAIL_RADIUS = 0.00002;
const RAIL_HEIGHT = 0.001;
const WIN_WIDTH = 0.00458;
const WIN_HEIGHT = 0.005;

export class Cabin {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // --- Materials ---
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2e,
      metalness: 0.92,
      roughness: 0.18,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x3d3d42,
      metalness: 0.85,
      roughness: 0.30,
      emissive: 0x111118,
      emissiveIntensity: 1.0,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xd4efe8,
      transparent: true,
      opacity: 0.05,
      transmission: 0.97,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const emissiveMat = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
    });

    // --- Hex vertices ---
    const verts = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      verts.push({ x: Math.cos(a) * RADIUS, z: Math.sin(a) * RADIUS });
    }

    // --- Endcaps (floor & ceiling, symmetrical) ---
    this._buildEndcap(0, +1, verts, frameMat, glassMat, emissiveMat);
    this._buildEndcap(H, -1, verts, frameMat, glassMat, emissiveMat);

    // --- Walls ---
    const sideLen = RADIUS; // regular hexagon: side length = circumradius

    for (let i = 0; i < SIDES; i++) {
      const v1 = verts[i];
      const v2 = verts[(i + 1) % SIDES];
      const mx = (v1.x + v2.x) / 2;
      const mz = (v1.z + v2.z) / 2;
      const faceAngle = Math.atan2(mx, mz);

      // Tangent (along edge) and inward normal directions
      const tx = Math.cos(faceAngle);
      const tz = -Math.sin(faceAngle);
      const ix = -Math.sin(faceAngle);
      const iz = -Math.cos(faceAngle);

      // Bottom sill plate
      this._addBeam(mx, PLATE_HEIGHT / 2, mz,
        sideLen, PLATE_HEIGHT, PLATE_DEPTH, faceAngle, accentMat);

      // Top sill plate
      this._addBeam(mx, H - PLATE_HEIGHT / 2, mz,
        sideLen, PLATE_HEIGHT, PLATE_DEPTH, faceAngle, accentMat);

      // Glass window (centered vertically between sill plates)
      const winCenterY = H / 2;
      this._addPanel(mx, mz, faceAngle, WIN_WIDTH, WIN_HEIGHT, 0, winCenterY, glassMat);

      // Window trim — 4 beams framing the window
      const winBottom = winCenterY - WIN_HEIGHT / 2;
      const winTop = winCenterY + WIN_HEIGHT / 2;

      // Horizontal bottom trim
      this._addBeam(mx, winBottom, mz,
        WIN_WIDTH + TRIM_SIZE * 2, TRIM_SIZE, TRIM_SIZE, faceAngle, accentMat);
      // Horizontal top trim
      this._addBeam(mx, winTop, mz,
        WIN_WIDTH + TRIM_SIZE * 2, TRIM_SIZE, TRIM_SIZE, faceAngle, accentMat);
      // Vertical left trim
      this._addBeam(
        mx + tx * (-WIN_WIDTH / 2), winCenterY, mz + tz * (-WIN_WIDTH / 2),
        TRIM_SIZE, WIN_HEIGHT, TRIM_SIZE, faceAngle, accentMat);
      // Vertical right trim
      this._addBeam(
        mx + tx * (WIN_WIDTH / 2), winCenterY, mz + tz * (WIN_WIDTH / 2),
        TRIM_SIZE, WIN_HEIGHT, TRIM_SIZE, faceAngle, accentMat);

      // Corner pillar at vertex i
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(PILLAR_SIZE, H, PILLAR_SIZE),
        frameMat
      );
      pillar.position.set(v1.x, H / 2, v1.z);
      this.group.add(pillar);

      // Handrails — floor and ceiling (symmetrical)
      const railInset = PLATE_DEPTH / 2 + RAIL_RADIUS * 3;
      const railX = mx + ix * railInset;
      const railZ = mz + iz * railInset;
      const railLen = sideLen - PILLAR_SIZE;
      const edgeDir = new THREE.Vector3(v2.x - v1.x, 0, v2.z - v1.z).normalize();
      const bracketSize = RAIL_RADIUS * 3;

      for (const railY of [RAIL_HEIGHT, H - RAIL_HEIGHT]) {
        const railGeo = new THREE.CylinderGeometry(RAIL_RADIUS, RAIL_RADIUS, railLen, 8);
        const rail = new THREE.Mesh(railGeo, accentMat);
        rail.position.set(railX, railY, railZ);
        rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), edgeDir);
        this.group.add(rail);

        for (const sign of [-1, 1]) {
          const bx = mx + tx * sign * (railLen / 2) + ix * railInset / 2;
          const bz = mz + tz * sign * (railLen / 2) + iz * railInset / 2;
          const bracket = new THREE.Mesh(
            new THREE.BoxGeometry(bracketSize, bracketSize, railInset),
            accentMat
          );
          bracket.position.set(bx, railY, bz);
          bracket.rotation.y = faceAngle;
          this.group.add(bracket);
        }
      }
    }

    // --- Lighting ---
    const ceilingLight = new THREE.PointLight(0xccddff, 0.8, 0.02);
    ceilingLight.position.set(0, H - 0.0003, 0);
    this.group.add(ceilingLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.05));

    // --- Collision bounds (hex face half-planes) ---
    const margin = 0.0003; // 30cm from walls
    const wallInradius = RADIUS * Math.cos(Math.PI / SIDES) - margin;
    const faces = [];
    for (let i = 0; i < SIDES; i++) {
      const a = ((i + 0.5) / SIDES) * Math.PI * 2;
      faces.push({ nx: Math.cos(a), nz: Math.sin(a) });
    }
    this.bounds = {
      faces,
      inradius: wallInradius,
      floorY: 0, ceilY: H,
    };
  }

  _buildEndcap(y, inward, verts, frameMat, glassMat, emissiveMat) {
    // inward: +1 for floor (interior above), -1 for ceiling (interior below)

    // 1. Central hub — hexagonal disc
    const hubGeo = new THREE.CylinderGeometry(HUB_RADIUS, HUB_RADIUS, HUB_THICKNESS, 6);
    const hub = new THREE.Mesh(hubGeo, frameMat);
    hub.position.set(0, y, 0);
    this.group.add(hub);

    for (let i = 0; i < SIDES; i++) {
      const v = verts[i];
      const vNext = verts[(i + 1) % SIDES];
      const a = (i / SIDES) * Math.PI * 2;
      const aNext = ((i + 1) / SIDES) * Math.PI * 2;

      // Hub edge point in this vertex's direction
      const hx = Math.cos(a) * HUB_RADIUS;
      const hz = Math.sin(a) * HUB_RADIUS;

      // 2. Radial rib — hub edge to corner vertex
      const ribDx = v.x - hx;
      const ribDz = v.z - hz;
      const ribLen = Math.sqrt(ribDx * ribDx + ribDz * ribDz);
      const ribAngle = Math.atan2(ribDx, ribDz);

      const ribGeo = new THREE.BoxGeometry(RIB_SIZE, RIB_SIZE, ribLen);
      const rib = new THREE.Mesh(ribGeo, frameMat);
      rib.position.set((hx + v.x) / 2, y, (hz + v.z) / 2);
      rib.rotation.y = ribAngle;
      this.group.add(rib);

      // 3. Perimeter sill beam (connecting adjacent corners)
      const emx = (v.x + vNext.x) / 2;
      const emz = (v.z + vNext.z) / 2;
      const edx = vNext.x - v.x;
      const edz = vNext.z - v.z;
      const edgeLen = Math.sqrt(edx * edx + edz * edz);
      const edgeAngle = Math.atan2(edx, edz);

      const beamGeo = new THREE.BoxGeometry(SILL_DEPTH, SILL_HEIGHT, edgeLen);
      const beam = new THREE.Mesh(beamGeo, frameMat);
      beam.position.set(emx, y, emz);
      beam.rotation.y = edgeAngle;
      this.group.add(beam);

      // 4. Glass panel (quad between two ribs and perimeter beam)
      const hubInset = HUB_RADIUS + RIB_SIZE;
      const hxCur = Math.cos(a) * hubInset;
      const hzCur = Math.sin(a) * hubInset;
      const hxNext = Math.cos(aNext) * hubInset;
      const hzNext = Math.sin(aNext) * hubInset;

      const shape = new THREE.Shape();
      shape.moveTo(hxCur, hzCur);
      shape.lineTo(v.x, v.z);
      shape.lineTo(vNext.x, vNext.z);
      shape.lineTo(hxNext, hzNext);
      shape.closePath();

      const glass = new THREE.Mesh(new THREE.ShapeGeometry(shape), glassMat);
      glass.rotation.x = -Math.PI / 2;
      glass.position.y = y + inward * GLASS_INSET;
      this.group.add(glass);

      // 6. LED edge strip (along wall junction)
      const faceAngle = Math.atan2(emx, emz);
      const stripGeo = new THREE.BoxGeometry(edgeLen * 0.8, LED_HEIGHT, 0.00003);
      const strip = new THREE.Mesh(stripGeo, emissiveMat);
      strip.position.set(emx, y + inward * LED_HEIGHT / 2, emz);
      strip.rotation.y = faceAngle;
      this.group.add(strip);
    }

    // 5. Hub accent ring
    const ringGeo = new THREE.TorusGeometry(HUB_RADIUS, 0.00003, 8, 6);
    const ring = new THREE.Mesh(ringGeo, emissiveMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, y + inward * (HUB_THICKNESS / 2 + 0.00001), 0);
    this.group.add(ring);
  }

  _addBeam(x, y, z, width, height, depth, faceAngle, mat) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = faceAngle;
    this.group.add(mesh);
  }

  _addPanel(mx, mz, faceAngle, w, h, offsetX, y, mat) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const edgeDirX = Math.cos(faceAngle);
    const edgeDirZ = -Math.sin(faceAngle);
    plane.position.set(
      mx + edgeDirX * offsetX,
      y,
      mz + edgeDirZ * offsetX
    );
    plane.rotation.y = faceAngle;
    this.group.add(plane);
  }

  setVisible(v) { this.group.visible = v; }
  getBounds() { return this.bounds; }
}
