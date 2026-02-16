import * as THREE from 'three';

const RADIUS = 0.005;    // 5m center to vertex
const H = 0.004;         // 4m height
const SIDES = 6;

export class Cabin {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x556677,
      metalness: 0.7,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x778899,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x223344,
      emissiveIntensity: 0.2,
    });

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xaaddff,
      transparent: true,
      opacity: 0.06,
      transmission: 0.98,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const ft = 0.0001; // 10cm trim

    // Hex vertices
    const verts = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2;
      verts.push({ x: Math.cos(a) * RADIUS, z: Math.sin(a) * RADIUS });
    }

    // Ceiling — solid hex
    const hexShape = new THREE.Shape();
    hexShape.moveTo(verts[0].x, verts[0].z);
    for (let i = 1; i < SIDES; i++) hexShape.lineTo(verts[i].x, verts[i].z);
    hexShape.closePath();
    const ceiling = new THREE.Mesh(new THREE.ShapeGeometry(hexShape), glassMat);
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.y = H;
    this.group.add(ceiling);

    // No floor — fully transparent (just glass)
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(hexShape), glassMat);
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // Window config
    const winBottom = H * 0.25;
    const winTop = H * 0.85;
    const winH = winTop - winBottom;
    const winPad = 0.15; // fraction of side length padding on each side

    for (let i = 0; i < SIDES; i++) {
      const v1 = verts[i];
      const v2 = verts[(i + 1) % SIDES];
      const mx = (v1.x + v2.x) / 2;
      const mz = (v1.z + v2.z) / 2;
      const dx = v2.x - v1.x;
      const dz = v2.z - v1.z;
      const sideLen = Math.sqrt(dx * dx + dz * dz);

      // Outward-facing rotation: normal from center to edge midpoint
      const faceAngle = Math.atan2(mx, mz);

      const winW = sideLen * (1 - 2 * winPad);
      const padW = sideLen * winPad;

      // 4 wall panels around window:
      // Bottom strip (full width, below window)
      this.addPanel(mx, mz, faceAngle, sideLen, winBottom, 0, winBottom / 2, wallMat);
      // Top strip (full width, above window)
      this.addPanel(mx, mz, faceAngle, sideLen, H - winTop, 0, winTop + (H - winTop) / 2, wallMat);
      // Left strip (window height, left of window)
      this.addPanel(mx, mz, faceAngle, padW, winH, -(sideLen - padW) / 2, winBottom + winH / 2, wallMat);
      // Right strip (window height, right of window)
      this.addPanel(mx, mz, faceAngle, padW, winH, (sideLen - padW) / 2, winBottom + winH / 2, wallMat);

      // Glass window
      this.addPanel(mx, mz, faceAngle, winW, winH, 0, winBottom + winH / 2, glassMat);

      // Window trim
      const trimOffsets = [
        // horizontal top
        { w: winW + ft * 2, h: ft, ox: 0, oy: winTop },
        // horizontal bottom
        { w: winW + ft * 2, h: ft, ox: 0, oy: winBottom },
      ];
      for (const t of trimOffsets) {
        this.addPanel(mx, mz, faceAngle, t.w, t.h, t.ox, t.oy, frameMat);
      }

      // Vertical trim left/right of window
      this.addPanel(mx, mz, faceAngle, ft, winH, -winW / 2, winBottom + winH / 2, frameMat);
      this.addPanel(mx, mz, faceAngle, ft, winH, winW / 2, winBottom + winH / 2, frameMat);

      // Corner pillar
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(ft * 1.5, H, ft * 1.5),
        frameMat
      );
      pillar.position.set(v1.x, H / 2, v1.z);
      this.group.add(pillar);
    }

    // Lighting
    const ceilingLight = new THREE.PointLight(0xccddff, 0.5, 0.04);
    ceilingLight.position.set(0, H - 0.0003, 0);
    this.group.add(ceilingLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.05));

    // Collision — inscribed circle
    const inradius = RADIUS * Math.cos(Math.PI / SIDES) - 0.0003;
    this.bounds = {
      minX: -inradius, maxX: inradius,
      minZ: -inradius, maxZ: inradius,
      floorY: 0, ceilY: H,
    };
  }

  // Place a panel on a hex wall face.
  // (mx,mz) = edge midpoint, faceAngle = outward normal angle,
  // w/h = panel size, offsetX = lateral offset along edge, y = center height
  addPanel(mx, mz, faceAngle, w, h, offsetX, y, mat) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    // Offset along the edge direction (perpendicular to outward normal)
    const edgeDirX = Math.cos(faceAngle);  // edge runs perpendicular to face normal
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
