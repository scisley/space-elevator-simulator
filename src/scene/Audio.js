// Ambient soundscape using Web Audio API with procedurally generated sounds
// Layers: wind (surface), cabin hum (constant)

export class AmbientAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.muted = false;
    this.masterGain = null;
    this.windGain = null;
    this.humGain = null;
  }

  // Must be called from a user gesture (click) to satisfy autoplay policy
  start() {
    if (this.started) return;
    this.started = true;

    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.ctx.destination);

    this._createWind();
    this._createHum();
  }

  _createWind() {
    // Wind: filtered noise
    const bufferSize = this.ctx.sampleRate * 4; // 4 second loop
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // Bandpass filter for wind character
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 400;
    bandpass.Q.value = 0.5;

    // Low-pass for softness
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1200;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;

    noise.connect(bandpass);
    bandpass.connect(lowpass);
    lowpass.connect(this.windGain);
    this.windGain.connect(this.masterGain);
    noise.start();
  }

  _createHum() {
    // Cabin hum: low oscillator with harmonics
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 60;

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 120;

    const osc2Gain = this.ctx.createGain();
    osc2Gain.gain.value = 0.3;

    this.humGain = this.ctx.createGain();
    this.humGain.gain.value = 0;

    osc1.connect(this.humGain);
    osc2.connect(osc2Gain);
    osc2Gain.connect(this.humGain);
    this.humGain.connect(this.masterGain);
    osc1.start();
    osc2.start();
  }

  update(altitudeKm) {
    if (!this.started || this.muted) return;

    const t = this.ctx.currentTime;

    // Wind: full at 0 km, fades out 0–100 km
    const windVol = Math.max(0, 1 - altitudeKm / 100) * 0.12;
    this.windGain.gain.setTargetAtTime(windVol, t, 0.5);

    // Cabin hum: subtle constant
    this.humGain.gain.setTargetAtTime(0.015, t, 0.5);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (!this.started) return;

    const t = this.ctx.currentTime;
    if (this.muted) {
      this.masterGain.gain.setTargetAtTime(0, t, 0.1);
    } else {
      this.masterGain.gain.setTargetAtTime(1.0, t, 0.1);
    }
    return this.muted;
  }
}
