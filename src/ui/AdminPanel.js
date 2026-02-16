import { adminSetAltitude, adminSetSpeed, adminSetDirection, adminSetTimeScale, adminRestart } from '../simulation/state.js';

export class AdminPanel {
  constructor() {
    this.el = document.getElementById('admin-panel');
    this.visible = false;
    this.onToggleCabin = null;
    this.onStarBrightness = null;

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
      document.getElementById('admin-star-brightness-val').textContent = val.toFixed(1);
      // Slider "1.0" = internal 1.3 (the calibrated default)
      if (this.onStarBrightness) this.onStarBrightness(val * 1.3);
    });

    // Restart button
    document.getElementById('admin-restart').addEventListener('click', () => {
      adminRestart();
    });
  }

  show() {
    this.visible = true;
    this.el.style.display = 'block';
  }

  hide() {
    this.visible = false;
    this.el.style.display = 'none';
  }
}
