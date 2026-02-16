import { adminSetAltitude, adminSetSpeed, adminSetDirection, adminSetTimeScale, adminRestart } from '../simulation/state.js';

export class AdminPanel {
  constructor() {
    this.el = document.getElementById('admin-panel');
    this.visible = false;
    this.onToggleCabin = null;

    // Toggle with backtick
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote') {
        this.visible = !this.visible;
        this.el.style.display = this.visible ? 'block' : 'none';
      }
    });

    // Set altitude button
    document.getElementById('admin-set-alt').addEventListener('click', () => {
      const alt = parseFloat(document.getElementById('admin-altitude').value);
      if (!isNaN(alt)) adminSetAltitude(alt);
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

    // Restart button
    document.getElementById('admin-restart').addEventListener('click', () => {
      adminRestart();
    });
  }
}
