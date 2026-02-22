![Space Elevator](public/og-image.jpg)

# Space Elevator Simulator

A first-person space elevator ride from sea level to 100,000 km, in your browser.

## Features

- **Real star catalog** — 8,920 naked-eye stars from the HYG v4.1 database with accurate positions, colors, and magnitudes
- **Real physics** — gravity decreases with altitude, flips at geostationary orbit (35,786 km), mag boots for zero-g
- **Day/night cycle** — sun orbits on the sidereal day; watch sunrise and sunset from space
- **14 milestones** — Everest, Karman line, ISS, Hubble, GPS constellation, GEO, and more
- **8K Earth** — cloud-free NASA Blue Marble imagery with high-res regional overlay at low altitudes
- **Ambient soundscape** — wind at the surface fading to silence in space

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in a browser.

### First-time setup

Generate the 8K Earth texture and star catalog:

```bash
npm run download-textures
npm run process-stars
```

## URL Parameters

Share specific views with URL parameters:

| Param | Example | Description |
|-------|---------|-------------|
| `alt` | `?alt=35786` | Starting altitude (km) |
| `speed` | `?speed=100` | Time scale multiplier |
| `dir` | `?dir=0` | Direction: 1=up, 0=stop, -1=down |
| `cabin` | `?cabin=0` | Hide cabin |
| `stars` | `?stars=2.0` | Star brightness |
| `capture` | `?capture=true` | Download OG image |

## Controls

- **WASD** — Move around the cabin
- **Mouse** — Look around
- **Space** — Jump (gravity-dependent)
- **Backtick (`)** — Open settings panel
- **Escape** — Release mouse

## Built With

- [Three.js](https://threejs.org/) — 3D rendering
- [HYG v4.1](https://github.com/astronexus/HYG-Database) — Star catalog
- [NASA GIBS](https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs) — Earth imagery (public domain)
- [Vite](https://vitejs.dev/) — Build tool

## Credits

- Earth textures: NASA Visible Earth / Blue Marble
- Star data: HYG Database by David Nash
- Night lights: NASA Earth Observatory
