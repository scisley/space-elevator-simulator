import { adminSetAltitude, adminSetDirection, adminSetTimeScale, getState } from '../simulation/state.js';

export class AdminPanel {
  constructor() {
    this.el = document.getElementById('admin-panel');
    this.visible = false;
    this.onToggleCabin = null;
    this.onStarBrightness = null;
    this.onToggleAudio = null;
    this.onEnterSandbox = null;
    this.onReturnToRealtime = null;
    this.cabinVisible = true;
    this.starBrightnessVal = 1.0;

    // Toggle with backtick
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') {
        if (this.visible) this.hide(); else this.show();
      }
    });

    // Set altitude button
    const altInput = document.getElementById('admin-altitude');
    document.getElementById('admin-set-alt').addEventListener('click', () => {
      const alt = parseFloat(altInput.value);
      if (!isNaN(alt)) adminSetAltitude(alt);
    });

    // Enter key submits altitude
    altInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const alt = parseFloat(altInput.value);
        if (!isNaN(alt)) adminSetAltitude(alt);
      }
    });

    // Altitude quick buttons
    this.el.querySelectorAll('[data-altitude]').forEach(btn => {
      btn.addEventListener('click', () => {
        const alt = parseFloat(btn.dataset.altitude);
        adminSetAltitude(alt);
      });
    });

    // Time scale buttons
    this.el.querySelectorAll('[data-timescale]').forEach(btn => {
      btn.addEventListener('click', () => {
        const scale = parseInt(btn.dataset.timescale);
        adminSetTimeScale(scale);
      });
    });

    // Direction buttons
    this.el.querySelectorAll('[data-dir]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = parseInt(btn.dataset.dir);
        adminSetDirection(dir);
      });
    });

    // Toggle cabin
    document.getElementById('admin-toggle-cabin').addEventListener('click', () => {
      if (this.onToggleCabin) this.onToggleCabin();
    });

    // Star brightness slider
    const brightnessSlider = document.getElementById('admin-star-brightness');
    brightnessSlider.addEventListener('input', () => {
      const val = parseFloat(brightnessSlider.value);
      this.starBrightnessVal = val;
      document.getElementById('admin-star-brightness-val').textContent = val.toFixed(1);
      // Slider "1.0" = internal 1.3 (the calibrated default)
      if (this.onStarBrightness) this.onStarBrightness(val * 1.3);
    });

    // Audio mute toggle
    document.getElementById('admin-toggle-audio').addEventListener('click', () => {
      if (this.onToggleAudio) this.onToggleAudio();
    });

    // Share button
    document.getElementById('admin-share').addEventListener('click', () => {
      this.shareLink();
    });

    // Return to Real-time button
    document.getElementById('admin-restart').addEventListener('click', () => {
      if (this.onReturnToRealtime) this.onReturnToRealtime();
    });
  }

  shareLink() {
    const state = getState();
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('alt', Math.round(state.altitudeKm));
    if (state.timeScale !== 1) url.searchParams.set('speed', state.timeScale);
    if (state.direction !== 1) url.searchParams.set('dir', state.direction);
    if (!this.cabinVisible) url.searchParams.set('cabin', '0');
    if (this.starBrightnessVal !== 1.0) url.searchParams.set('stars', this.starBrightnessVal.toFixed(1));

    const btn = document.getElementById('admin-share');
    navigator.clipboard.writeText(url.toString()).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Share Link'; }, 2000);
    });
  }

  setAudioButtonText(muted) {
    document.getElementById('admin-toggle-audio').textContent = muted ? 'Unmute' : 'Mute';
  }

  show() {
    if (getState().mode === 'realtime' && this.onEnterSandbox) this.onEnterSandbox();
    this.visible = true;
    this.el.style.display = 'block';
  }

  hide() {
    this.visible = false;
    this.el.style.display = 'none';
  }
}
