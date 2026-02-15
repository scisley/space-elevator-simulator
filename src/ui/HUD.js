import { GEO_ALTITUDE, CABLE_LENGTH } from '../constants.js';

export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.lastUpdate = 0;
  }

  update(state) {
    const now = performance.now();
    if (now - this.lastUpdate < 100) return; // throttle to 10 fps
    this.lastUpdate = now;

    const alt = state.altitudeKm;
    const speed = state.speedKmh;
    const gEff = state.effectiveGravityG;
    const dir = state.direction;

    const dirLabel = dir === 1 ? 'ASCENDING' : dir === -1 ? 'DESCENDING' : 'STOPPED';
    const dirColor = dir === 1 ? '#4af' : dir === -1 ? '#fa4' : '#888';

    // Format altitude
    let altStr;
    if (alt < 1) altStr = `${(alt * 1000).toFixed(0)} m`;
    else if (alt < 1000) altStr = `${alt.toFixed(1)} km`;
    else altStr = `${alt.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;

    // ETA calculations
    let etaGeo = '';
    let etaTop = '';
    if (dir === 1 && alt < GEO_ALTITUDE) {
      const hoursToGeo = (GEO_ALTITUDE - alt) / speed;
      etaGeo = formatDuration(hoursToGeo);
    }
    if (dir === 1 && alt < CABLE_LENGTH) {
      const hoursToTop = (CABLE_LENGTH - alt) / speed;
      etaTop = formatDuration(hoursToTop);
    }
    if (dir === -1 && alt > 0) {
      const hoursToBottom = alt / speed;
      etaGeo = `Ground: ${formatDuration(hoursToBottom)}`;
    }

    this.el.innerHTML = `
      <div><span class="label">ALT </span><span class="value">${altStr}</span></div>
      <div><span class="label">SPD </span><span class="value">${formatSpeed(speed)}</span></div>
      <div><span class="label">DIR </span><span class="value" style="color:${dirColor}">${dirLabel}</span></div>
      <div><span class="label">G   </span><span class="value">${gEff.toFixed(3)}</span><span class="unit"> g</span></div>
      ${etaGeo ? `<div><span class="label">ETA GEO </span><span class="value">${etaGeo}</span></div>` : ''}
      ${etaTop ? `<div><span class="label">ETA TOP </span><span class="value">${etaTop}</span></div>` : ''}
    `;
  }
}

function formatSpeed(kmh) {
  if (kmh >= 1000000) return `${(kmh / 1000000).toFixed(1)}M km/h`;
  if (kmh >= 1000) return `${(kmh / 1000).toFixed(0)}K km/h`;
  return `${kmh} km/h`;
}

function formatDuration(hours) {
  if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const h = (hours % 24).toFixed(0);
  return `${days}d ${h}h`;
}
