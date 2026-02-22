import * as THREE from 'three';
import { GROUND_STATION_ALTITUDE } from '../constants.js';

const GND = GROUND_STATION_ALTITUDE; // 0.01 km = 10m

export class AnchorStation {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x777777,
      metalness: 0.6,
      roughness: 0.4,
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.5,
      roughness: 0.6,
    });

    // Deck — top sits just below cabin floor level when at GND altitude
    // (deck top at local y = GND - 0.0005, i.e. 50cm below world origin at GND)
    const deckThick = 0.002;           // 2m thick
    const deckTopLocal = GND - 0.0005; // 50cm clearance below cabin floor
    const deckCenterY = deckTopLocal - deckThick / 2;
    const deckGeo = new THREE.BoxGeometry(0.08, deckThick, 0.08); // 80m × 80m
    const deck = new THREE.Mesh(deckGeo, mat);
    deck.position.y = deckCenterY;
    this.group.add(deck);

    // Deck edge trim (darker band around perimeter)
    const trimH = 0.0008;
    const trimPositions = [
      [0, deckTopLocal + trimH / 2, 0.04,  0.08, trimH, 0.001],
      [0, deckTopLocal + trimH / 2, -0.04, 0.08, trimH, 0.001],
      [0.04,  deckTopLocal + trimH / 2, 0, 0.001, trimH, 0.08],
      [-0.04, deckTopLocal + trimH / 2, 0, 0.001, trimH, 0.08],
    ];
    for (const [x, y, z, w, h, d] of trimPositions) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), darkMat);
      trim.position.set(x, y, z);
      this.group.add(trim);
    }

    // Support pylons — 4 corners, from Earth surface to deck bottom
    const pylonH = deckCenterY - deckThick / 2; // from y=0 to deck bottom
    const pylonSize = 0.006; // 6m × 6m cross section
    for (const [px, pz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(pylonSize, pylonH, pylonSize),
        mat
      );
      pylon.position.set(px * 0.028, pylonH / 2, pz * 0.028);
      this.group.add(pylon);
    }

    // Cross-bracing between pylons (horizontal mid-level)
    const braceY = pylonH * 0.5;
    const braceLen = 0.056 + pylonSize; // span between pylon centers + pylon width
    for (const [axis, px, pz] of [['x', 0, 0.028], ['x', 0, -0.028], ['z', 0.028, 0], ['z', -0.028, 0]]) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(
          axis === 'x' ? braceLen : 0.001,
          0.001,
          axis === 'z' ? braceLen : 0.001
        ),
        darkMat
      );
      brace.position.set(px, braceY, pz);
      this.group.add(brace);
    }

  }

  update(altitudeKm) {
    // Position at surface level (which is at -altitudeKm in world Y)
    this.group.position.set(0, -altitudeKm, 0);

    // Visible from ground station up to ~50km
    this.group.visible = altitudeKm < 50;
  }
}
