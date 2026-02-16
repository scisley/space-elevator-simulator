# Space Elevator Simulator

A Three.js space elevator simulation with first-person perspective, day/night cycle, and realistic orbital mechanics.

## Architecture

- **Renderer**: Three.js with WebGL2, logarithmic depth buffer, ACES filmic tone mapping
- **Scene objects**: Earth, Sun, Stars, Sky, Cable, Cabin, AnchorStation, OrbitalPlatform
- **Frame of reference**: Earth is stationary below the camera; the sun and stars orbit around Earth's polar axis (simulating Earth's rotation from the elevator's co-rotating frame)
- **Units**: 1 unit = 1 km throughout the scene

## Critical Rendering Lessons

These were hard-won through extensive debugging. Read carefully before modifying any rendering code.

### 1. MeshStandardMaterial vs ShaderMaterial for Earth

**DO NOT** replace Earth's `MeshStandardMaterial` with a custom `ShaderMaterial` for the day texture. Multiple attempts failed due to the complexity of Three.js's color pipeline:
- `MeshStandardMaterial` automatically handles sRGB decode, PBR lighting, ACES tone mapping, and output encoding
- Custom `ShaderMaterial` requires manually replicating all of these steps, and getting it wrong produces flickering dark spots, wrong colors, or washed-out rendering
- World-space normals via `modelMatrix * vec4(normal, 0.0)` have precision issues at large distances from origin

**Current approach**: `MeshStandardMaterial` for the daymap (proven stable), with a **separate overlay mesh** for night city lights using additive blending.

### 2. Night Lights Overlay — Depth and Render Order

The night lights overlay (`Earth.js`) uses `depthTest: false` so it renders on top of the day mesh without fighting the log depth buffer. This means it also renders on top of everything else (cable, cabin, etc.).

**Solution**: The cable (`Cable.js`) uses `transparent: true` (with full opacity) and `renderOrder: 2`. Three.js renders all opaque objects first, then transparent objects sorted by renderOrder. This ensures:
1. Opaque pass: Day Earth mesh renders and writes depth
2. Transparent pass (renderOrder 0): Night overlay renders with `depthTest: false`, additive blending
3. Transparent pass (renderOrder 2): Cable renders with normal blending, fully overwriting night overlay pixels

**Key insight**: Three.js renders ALL opaque objects before ALL transparent objects, regardless of `renderOrder`. Setting `renderOrder` on an opaque object only changes its order relative to other opaque objects — it will never render after a transparent object. To control order between opaque-looking and transparent objects, make the opaque-looking object `transparent: true` with full opacity.

### 3. Logarithmic Depth Buffer + ShaderMaterial

When `logarithmicDepthBuffer: true` is set on the renderer:
- Built-in materials (MeshStandardMaterial, MeshBasicMaterial, etc.) automatically include log depth buffer shader chunks
- Custom `ShaderMaterial` does **NOT** — you must manually add:
  - Vertex: `#include <logdepthbuf_pars_vertex>` and `#include <logdepthbuf_vertex>`
  - Fragment: `#include <logdepthbuf_pars_fragment>` and `#include <logdepthbuf_fragment>`
- Without these chunks, depth values written/tested by ShaderMaterial are incompatible with the log depth buffer, causing depth test failures
- **However**, even with the chunks, depth testing between a ShaderMaterial overlay and a built-in material at Earth-scale distances can still fail. Using `depthTest: false` + render order control is more reliable.

### 4. GLSL smoothstep Argument Order

`smoothstep(edge0, edge1, x)` **requires** `edge0 < edge1`. If `edge0 > edge1`, behavior is undefined — most GPUs silently return 0. This caused night lights to be completely invisible:
```glsl
// BROKEN — edge0 > edge1, returns 0 on most GPUs
float nightFactor = smoothstep(0.1, -0.15, NdotL);

// CORRECT — invert the result instead
float nightFactor = 1.0 - smoothstep(-0.15, 0.1, NdotL);
```

### 5. sRGB Color Space and toneMapped

- Setting `texture.colorSpace = THREE.SRGBColorSpace` tells the GPU to auto-decode sRGB to linear on sample
- `MeshStandardMaterial` handles the full pipeline: linear lighting calculations, then tone mapping, then sRGB output encoding
- `ShaderMaterial` with `toneMapped: false` bypasses tone mapping AND output encoding — if you set `colorSpace = SRGBColorSpace` on its textures, the GPU decodes to linear, but nothing re-encodes to sRGB, producing washed-out results
- **Rule**: For ShaderMaterial with `toneMapped: false`, do NOT set `colorSpace` on its textures — keep raw sRGB values

### 6. Stars — Real Catalog Data and Rendering

Stars use the HYG v4.1 catalog (~8,920 naked-eye stars, mag ≤ 6.5). Run `npm run process-stars` to regenerate `public/data/stars.json` from the catalog.

`THREE.PointsMaterial` ignores per-vertex size attributes (the `size` property is uniform for all points). Also, ACES filmic tone mapping compresses HDR colors into a narrow range, making all stars look identical.

**Solution**: Custom `ShaderMaterial` with:
- Per-vertex `starSize` buffer attribute, read via `attribute float starSize` and applied as `gl_PointSize`
- `toneMapped: false` to prevent ACES from crushing brightness variation
- Sizes derived from apparent magnitude via Pogson's formula; colors from B-V color index
- **Flat `gl_PointSize`** (no perspective division) — stars are all on the same sphere at 150,000 km, so perspective scaling produces sub-pixel sizes (~0.002 px) that get discarded on macOS Metal. Use raw size values directly.

### 7. Additive Blending and Alpha

With `THREE.AdditiveBlending`, the blend equation is: `src.rgb * src.a + dst.rgb * 1.0`

- Alpha controls source contribution strength, but destination is always fully preserved
- Setting `gl_FragColor = vec4(color, 1.0)` with additive blending adds the full color value
- On the day side, set color to `vec3(0.0)` to add nothing (not alpha to 0.0)

### 8. Sun Occlusion

The sun must be hidden when behind Earth. Geometric test in `Sun.js`:
```js
const earthAngularRadius = Math.asin(EARTH_RADIUS / (EARTH_RADIUS + altitudeKm));
const cosThreshold = Math.cos(earthAngularRadius);
const occluded = -sunDirection.y > cosThreshold;
```
Camera is at origin, Earth center is at (0, -(R+alt), 0), so nadir direction is (0,-1,0). The sun is occluded when the angle between sunDirection and nadir is less than Earth's angular radius.

### 9. Sprite depthTest/depthWrite

Sun glow uses a `THREE.Sprite` with `SpriteMaterial`. Setting `depthTest: false` causes it to render through the cable and other objects. Keep `depthTest` enabled (default) and only disable `depthWrite` for glow effects.

## Astronomical Simplifications

The simulation makes deliberate simplifications to the sun and star positions:

### Sun path assumes equinox conditions (no axial tilt)

The sun orbits around Earth's polar axis on the **celestial equator**. This is only physically accurate at the equinoxes (March 20 / September 22). In reality, Earth's 23.44° axial tilt causes the sun's declination to vary ±23.44° over the year — at the June solstice the sun would be 23.44° north of the equator, at December solstice 23.44° south. Implementing this would require specifying a date for the simulation.

### Sun and stars share the same angular velocity

Both use `SUN_ANGULAR_VELOCITY = 2π / SIDEREAL_DAY` (86164.1s). The sun should technically use the **solar day** (86400s). The ~4 minute difference causes the sun to drift ~1°/day against the star background, completing a full circle in one year. For a simulation spanning hours or a few days, this is negligible.

### Star-sun RA alignment is arbitrary

The absolute RA offset between the starfield and the sun is not tied to a real date. This means the constellations visible at night don't correspond to any particular time of year. Nobody will notice unless they check which constellations are overhead at a specific simulation time.

### What would be needed for full date-accuracy

1. A simulation start date (or real-time clock)
2. Sun declination: `23.44° × sin(2π × (dayOfYear - 81) / 365)`
3. Sun RA: `~(dayOfYear / 365) × 2π` offset from vernal equinox
4. Separate angular velocities for sun (solar day) and stars (sidereal day)

## File Overview

| File | Purpose |
|------|---------|
| `src/main.js` | Orchestrates scene, computes sun direction per frame, animation loop |
| `src/scene/SceneManager.js` | Renderer setup (log depth, tone mapping, bloom) |
| `src/scene/Earth.js` | Earth day mesh (MeshStandardMaterial) + night overlay (ShaderMaterial, additive) |
| `src/scene/Sun.js` | Sun mesh + glow sprite + DirectionalLight + Earth occlusion |
| `src/scene/Stars.js` | Real star catalog (HYG v4.1, ~8,920 naked-eye stars) with per-star size/color |
| `scripts/process-stars.mjs` | Downloads HYG catalog, converts to `public/data/stars.json` |
| `src/scene/Sky.js` | Atmosphere gradient, dims at night based on sun elevation |
| `src/scene/Cable.js` | Near cylinder + far line, transparent with renderOrder 2 for night overlay occlusion |
| `src/scene/Cabin.js` | Hexagonal cabin with glass ceiling/floor, window panels, interior light |
| `src/constants.js` | Physical constants (Earth radius, sun orbit, sidereal day, etc.) |
| `src/simulation/state.js` | Altitude computation, timeScale, state management |
| `src/ui/HUD.js` | Altitude, speed, g-force, simulation time display |
| `src/ui/AdminPanel.js` | Time scale, altitude teleport, direction controls |
