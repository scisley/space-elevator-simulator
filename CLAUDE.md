# Space Elevator Simulator

A Three.js space elevator simulation with first-person perspective, day/night cycle, and realistic orbital mechanics.

## Architecture

- **Renderer**: Three.js with WebGL2, logarithmic depth buffer, ACES filmic tone mapping
- **Scene objects**: Earth (with regional satellite overlay), Sun, Stars, Sky, Cable, Cabin, AnchorStation, OrbitalPlatform
- **Frame of reference**: Earth is stationary below the camera; the sun and stars orbit around Earth's polar axis (simulating Earth's rotation from the elevator's co-rotating frame)
- **Units**: 1 unit = 1 km throughout the scene

## Critical Rendering Lessons

These were hard-won through extensive debugging. Read carefully before modifying any rendering code.

### 1. MeshStandardMaterial vs ShaderMaterial for Earth

**DO NOT** replace Earth's `MeshStandardMaterial` with a custom `ShaderMaterial` for the day texture. Multiple attempts failed due to the complexity of Three.js's color pipeline:
- `MeshStandardMaterial` automatically handles sRGB decode, PBR lighting, ACES tone mapping, and output encoding
- Custom `ShaderMaterial` requires manually replicating all of these steps, and getting it wrong produces flickering dark spots, wrong colors, or washed-out rendering
- World-space normals via `modelMatrix * vec4(normal, 0.0)` have precision issues at large distances from origin

**Current approach**: `MeshStandardMaterial` for the daymap (proven stable), with a **separate overlay mesh** for night city lights using additive blending. A regional satellite texture ground plane provides higher resolution at low altitudes (see "Regional Satellite Tiles" section).

### 2. Night Lights Overlay — Depth and Render Order

The night lights overlay (`Earth.js`) uses `depthTest: false` so it renders on top of the day mesh without fighting the log depth buffer. This means it also renders on top of everything else (cable, cabin, etc.).

**Solution**: The cable (`Cable.js`) uses `transparent: true` (with full opacity) and `renderOrder: 2`. Three.js renders all opaque objects first, then transparent objects sorted by renderOrder. This ensures:
1. Opaque pass: Day Earth mesh renders and writes depth
2. Transparent pass (renderOrder 0): Night overlay renders with `depthTest: false`, additive blending
3. Transparent pass (renderOrder 1): Regional satellite spherical patch renders, covering night overlay below
4. Transparent pass (renderOrder 2): Cable renders with normal blending, fully overwriting night overlay pixels

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
- Sizes derived from apparent magnitude with capped range (1.0–3.5) and `pow(0.7)` compression to prevent the brightest stars from dominating. Previous `sqrt(brightness) * 5.0` formula produced 1px–18px range where most stars were invisible.
- Colors encode both spectral type (B-V index) AND apparent brightness (`pow(normalizedBrightness, 0.4)`). This preserves the real brightness hierarchy through color intensity even with compressed sizes.
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

### 10. Ocean Color: Day vs Night Side

The Blue Marble ocean texture pixels are nearly black (~RGB 2,5,20). Making the ocean look blue requires boosting these values, but the boost must NOT be visible on the unlit night side.

**What doesn't work:**
- Boosting ocean pixels in the texture file — brightens both day and night sides equally
- `AmbientLight` — illuminates both hemispheres, making the night side ocean visible
- Increasing `toneMappingExposure` — amplifies the entire frame including the dark side
- These approaches all failed because they don't distinguish between lit and unlit surfaces

**What works:** Boost the ocean albedo (diffuse color) in the shader via `MeshStandardMaterial.onBeforeCompile`. The PBR pipeline then multiplies albedo × lighting, so:
- Day side: boosted albedo × sunlight = visible blue
- Night side: boosted albedo × 0 light = black

```js
material.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    `#include <map_fragment>
     {
       float isOcean = step(diffuseColor.b, 0.008) * step(diffuseColor.r, diffuseColor.b) * step(diffuseColor.g, diffuseColor.b);
       diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 5.0 + vec3(0.002, 0.004, 0.015), isOcean);
     }`
  );
};
```

This hook is applied to both the globe material and the regional patch material via `Earth._oceanBoostCompile`.

### 11. Night Texture Ocean Tint

The night lights texture (`2k_earth_nightmap.jpg`) has a baked-in blue ocean tint (~RGB 4,6,21 everywhere). With the night shader's `× 3.0` multiplier and `toneMapped: false` (values go straight to framebuffer), this produces a clearly visible dark blue across the entire night hemisphere.

**Fix:** Threshold the night texture brightness in the fragment shader: `step(0.1, maxChannel)`. The ocean max is 21/255 = 0.082, so a threshold of 0.1 kills the tint while preserving actual city lights (which are 25+ per channel).

### 12. sharp Composite + Resize Pipeline Bug

In `sharp`, calling `.composite()` followed by `.resize()` in a single pipeline chain does **not** work as expected — sharp applies resize BEFORE composite internally. Tiles get placed at coordinates that exceed the resized image bounds and silently disappear.

**Fix:** Split into two steps: composite at full resolution to an intermediate PNG buffer, then resize in a separate `sharp()` call.

```js
// BROKEN — tiles placed outside resized bounds
const output = await sharp({create: ...}).composite(tiles).resize(8192, 4096).jpeg().toBuffer();

// CORRECT — composite first, then resize separately
const fullRes = await sharp({create: ...}).composite(tiles).png().toBuffer();
const output = await sharp(fullRes).resize(8192, 4096).jpeg().toBuffer();
```

Also note: `sharp({create: {channels: 3}})` internally produces a 4-channel (RGBA) buffer. If you extract raw pixels, use `resolveWithObject: true` and read `info.channels` — don't assume 3.

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

## Textures

The Earth daymap uses an 8K (8192x4096) cloud-free image built from NASA GIBS `BlueMarble_ShadedRelief` tiles (EPSG:4326, zoom 4, 200 tiles composited and downscaled). This layer has shaded relief on land but flat blue oceans (no bathymetry). Run `npm run download-textures` to generate `public/textures/8k_earth_daymap.jpg` (~4 MB). Use `--force` to regenerate. Requires `sharp` as a dev dependency. The `BlueMarble_ShadedRelief_Bathymetry` variant exists but shows ocean floor contours which look unrealistic from space.

The night lights texture stays at 2K — the elevator starts in the morning, so by nightfall altitude is high enough that 2K is sufficient.

Anisotropic filtering (`anisotropy = 16`) is enabled on the daymap for sharp rendering at oblique viewing angles (toward the horizon). Three.js clamps to the GPU's max internally.

### Regional Satellite Tiles (Spherical Patch)

At low altitudes (<300 km), a spherical patch overlays the Earth sphere with high-res regional satellite imagery. The 8K global texture has ~4.9 km/pixel at the equator, which is visibly pixelated below 200 km. The regional overlay provides ~0.6 km/pixel (8x improvement).

**Implementation**: At startup, `TileLoader.js` fetches an 8×8 grid of NASA GIBS cloud-free tiles (zoom level 8, 256px each) centered on the anchor point (0°N, 80°15'W). These are composited onto a 2048×2048 HTML Canvas. The loader also creates an edge-fade alpha map for smooth blending.

In `Earth.js`, the tile bounds are converted to Three.js SphereGeometry `phi`/`theta` parameters and a partial sphere is created at `EARTH_RADIUS + 0.01 km`. This curves naturally with the globe and avoids the flat-plane issues (sharp rectangular edges, z-fighting, projection mismatch).

- Tile source: NASA GIBS WMTS (`BlueMarble_ShadedRelief`, cloud-free, no bathymetry)
- Tiles are public domain, CORS-enabled, ~0.5–2 MB total
- Concurrency limited to 8 parallel fetches
- If >50% of tiles fail, graceful degradation (no patch, only 8K globe)
- The patch uses `MeshStandardMaterial` with `alphaMap` for edge fading, `transparent: true`, `renderOrder: 1`
- `onBeforeCompile` ocean boost is applied to the patch material (same as globe) for consistent ocean color
- 0.005 km radial offset avoids z-fighting with the day mesh in the log depth buffer (0.5 km was too large — visible layer transition at start of ride; 0.01 km was tried but is above the cabin floor at ground station — the platform covers it, so 0.005 km works cleanly)
- Fades out between 50–300 km altitude (constants `GROUND_PLANE_FADE_START` / `GROUND_PLANE_FADE_END`)

## Ground Station and Anchor Platform

`GROUND_STATION_ALTITUDE = 0.01 km` (10m) is the elevator's resting height above the ocean. This is important for three reasons:

1. **Z-fighting**: The cabin floor doesn't clip with the Earth surface or the satellite patch.
2. **Patch clearance**: `PATCH_ALTITUDE_OFFSET = 0.005 km` (5m) places the hi-res tile patch below the cabin floor at ground station. The AnchorStation deck covers the seam.
3. **Realism**: Real cable cars would anchor some distance above sea level.

The AnchorStation is an 80m×80m deck with 4 corner pylons. Its deck top is at `GROUND_STATION_ALTITUDE - 0.0005 km` (9.5m) — 50cm below the cabin floor glass, so you look down through the floor and see the deck. The AnchorStation moves with Earth (`position.y = -altitudeKm`) and is hidden above 50 km.

All simulation modes start the elevator at `GROUND_STATION_ALTITUDE`, not 0. The sandbox "GND" quick-jump button uses `0.01` not `0`.

### Sandbox mode start timing

When the sandbox button is clicked on the loading screen, `adminRestart()` is called immediately. This resets `state.startTimeMs = Date.now()`. Without this, the elevator would already be partway up if the user lingered on the loading screen before clicking Sandbox (since `startTimeMs` was set at page load).

## Mode System and AdminPanel

The simulation has three modes stored in `state.mode`: `'realtime'`, `'sandbox'`, `'cinema'`.

**AdminPanel** (`src/ui/AdminPanel.js`) can be opened in any mode (ESC or backtick). Opening it while in realtime mode triggers `onEnterSandbox` → calls `adminSetAltitude(currentAltitude)` to freeze position and switch to sandbox. The "Return to Real-time" button re-syncs to UTC via `adminReturnToRealtime()`.

Key callbacks on the AdminPanel instance:
- `onEnterSandbox()` — called when panel opens in realtime mode
- `onReturnToRealtime()` — called when "Return to Real-time" is clicked
- `onToggleCabin()`, `onStarBrightness(val)`, `onToggleAudio()` — feature controls

### About overlay

A full-screen overlay (`#about-overlay`, z-index 1500) contains four sections: What is a Space Elevator, How This Simulation Works, Features, and About the Author. It can be opened from:
- The loading screen ("ABOUT THIS SIMULATION" link below mode buttons)
- The settings panel ("About" button at the bottom)

Closing: click "✕ CLOSE" or press ESC (handled by inline script in `index.html`, independent of `main.js`).

## File Overview

| File | Purpose |
|------|---------|
| `src/main.js` | Orchestrates scene, computes sun direction per frame, animation loop |
| `src/scene/SceneManager.js` | Renderer setup (log depth, tone mapping, bloom) |
| `src/scene/Earth.js` | Earth day mesh (MeshStandardMaterial) + night overlay (ShaderMaterial, additive) + regional satellite spherical patch |
| `src/loaders/TileLoader.js` | NASA GIBS tile fetcher, canvas compositor, edge-fade alpha map for regional overlay |
| `src/scene/Sun.js` | Sun mesh + glow sprite + DirectionalLight + Earth occlusion |
| `src/scene/Stars.js` | Real star catalog (HYG v4.1, ~8,920 naked-eye stars) with per-star size/color |
| `scripts/process-stars.mjs` | Downloads HYG catalog, converts to `public/data/stars.json` |
| `scripts/download-textures.mjs` | Builds 8K cloud-free Earth daymap from NASA GIBS tiles (requires `sharp`) |
| `src/scene/Sky.js` | Atmosphere gradient, dims at night based on sun elevation |
| `src/scene/Cable.js` | Near cylinder + far line, transparent with renderOrder 2 for night overlay occlusion |
| `src/scene/Cabin.js` | Hexagonal cabin with glass ceiling/floor, window panels, interior light |
| `src/constants.js` | Physical constants (Earth radius, sun orbit, sidereal day, `GROUND_STATION_ALTITUDE`, etc.) |
| `src/simulation/state.js` | Altitude computation, timeScale, mode management, realtime↔sandbox transitions |
| `src/ui/HUD.js` | Altitude, speed, g-force, simulation time; permanent ESC hint; multi-shadow text outline for readability |
| `src/ui/AdminPanel.js` | Settings panel; openable in any mode; transitions realtime→sandbox on open; share link, cabin/audio/star controls |
| `index.html` | Loading screen, mode buttons, settings panel HTML, about overlay content/CSS, mobile detection |
