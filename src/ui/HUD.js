import { GEO_ALTITUDE, CABLE_LENGTH, MAG_BOOTS_THRESHOLD } from '../constants.js';

export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.lastUpdate = 0;
  }

  update(state, simElapsedSeconds, controller) {
    const now = performance.now();
    if (now - this.lastUpdate < 100) return; // throttle to 10 fps
    this.lastUpdate = now;

    const alt = state.altitudeKm;
    const speed = state.speedKmh;
    const timeScale = state.timeScale || 1;
    const effectiveSpeed = speed * timeScale;
    const gEff = state.effectiveGravityG;
    const dir = state.direction;

    const waitRemainingMs = state.waitRemainingMs || 0;
    const phase = state.phase;

    let dirLabel, dirColor;
    if (waitRemainingMs > 0 && phase === 'wait-ground') {
      dirLabel = 'WAITING AT GROUND';
      dirColor = '#888';
    } else if (waitRemainingMs > 0 && phase === 'wait-top') {
      dirLabel = 'WAITING AT STATION';
      dirColor = '#888';
    } else if (dir === 1) {
      dirLabel = 'ASCENDING';
      dirColor = '#4af';
    } else if (dir === -1) {
      dirLabel = 'DESCENDING';
      dirColor = '#fa4';
    } else {
      dirLabel = 'STOPPED';
      dirColor = '#888';
    }

    // Format altitude
    let altStr;
    if (alt < 1) altStr = `${(alt * 1000).toFixed(0)} m`;
    else if (alt < 1000) altStr = `${alt.toFixed(1)} km`;
    else altStr = `${alt.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;

    // ETA calculations (using effective speed with time scale)
    let etaGeo = '';
    let etaTop = '';
    let etaGround = '';
    if (dir === 1 && alt < GEO_ALTITUDE) {
      const hoursToGeo = (GEO_ALTITUDE - alt) / effectiveSpeed;
      etaGeo = formatDuration(hoursToGeo);
    }
    if (dir === 1 && alt < CABLE_LENGTH) {
      const hoursToTop = (CABLE_LENGTH - alt) / effectiveSpeed;
      etaTop = formatDuration(hoursToTop);
    }
    if (dir === -1 && alt > 0) {
      const hoursToBottom = alt / effectiveSpeed;
      etaGround = formatDuration(hoursToBottom);
    }

    const timeLabel = timeScale > 1 ? ` <span class="unit">(${parseFloat(timeScale.toFixed(1))}x)</span>` : '';

    // Format simulation elapsed time
    const simTime = formatSimTime(simElapsedSeconds || 0);

    // Gravity display: color-code and direction arrow
    const gAbs = Math.abs(gEff);
    let gColor, gArrow;
    if (gEff < -0.0005) {
      gColor = '#e4f';  // magenta = reversed
      gArrow = '&#8593;'; // up arrow
    } else if (gAbs < 0.005) {
      gColor = '#f44';  // red = micro-g
      gArrow = '&#183;'; // middle dot
    } else if (gAbs < 0.05) {
      gColor = '#fa4';  // orange = very low
      gArrow = '&#8595;'; // down arrow
    } else if (gAbs < 0.5) {
      gColor = '#ff4';  // yellow = low
      gArrow = '&#8595;';
    } else {
      gColor = '#4f4';  // green = normal
      gArrow = '&#8595;';
    }

    // Mag boots prompt
    let bootsLine = '';
    if (controller) {
      if (controller.magBootsHeld) {
        bootsLine = `<div><span class="value" style="color:#4af">MAG BOOTS ACTIVE</span></div>`;
      } else if (gAbs < MAG_BOOTS_THRESHOLD && !controller.onFloor && !controller.onCeiling) {
        bootsLine = `<div><span class="value" style="color:#ff4">[HOLD G] MAG BOOTS</span></div>`;
      }
    }

    // Wait countdown
    let waitLine = '';
    if (waitRemainingMs > 0) {
      const totalSec = Math.ceil(waitRemainingMs / 1000);
      const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
      const ss = String(totalSec % 60).padStart(2, '0');
      waitLine = `<div><span class="label">DEPARTS IN </span><span class="value" style="color:#4af">${mm}:${ss}</span></div>`;
    }

    this.el.innerHTML = `
      <div class="label" style="margin-bottom:8px;">ESC &mdash; settings</div>
      <div><span class="label">ALT </span><span class="value">${altStr}</span></div>
      <div><span class="label">SPD </span><span class="value">${formatSpeed(effectiveSpeed)}</span>${timeLabel}</div>
      <div><span class="label">DIR </span><span class="value" style="color:${dirColor}">${dirLabel}</span></div>
      <div><span class="label">G   </span><span class="value" style="color:${gColor}">${gArrow} ${gEff.toFixed(3)}</span><span class="unit"> g</span></div>
      <div><span class="label">SIM </span><span class="value">${simTime}</span></div>
      ${waitLine}
      ${etaGeo ? `<div><span class="label">ETA GEO </span><span class="value">${etaGeo}</span></div>` : ''}
      ${etaTop ? `<div><span class="label">ETA TOP </span><span class="value">${etaTop}</span></div>` : ''}
      ${etaGround ? `<div><span class="label">ETA GND </span><span class="value">${etaGround}</span></div>` : ''}
      ${bootsLine}
    `;
  }
}

function formatSpeed(kmh) {
  if (kmh >= 1000000) return `${(kmh / 1000000).toFixed(1)}M km/h`;
  if (kmh >= 1000) return `${(kmh / 1000).toFixed(0)}K km/h`;
  return `${kmh} km/h`;
}

function formatSimTime(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  const pad = (n) => String(n).padStart(2, '0');
  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

function formatDuration(hours) {
  if (hours < 1) return `${(hours * 60).toFixed(0)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const h = (hours % 24).toFixed(0);
  return `${days}d ${h}h`;
}
