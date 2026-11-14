const clamp = (number, low, high) => Math.max(low, Math.min(high, number));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function engineToneParameters(state = {}) {
  const rpm = clamp(finite(state.rpm), 0, 9000);
  const load = clamp(finite(state.engineLoad ?? state.throttle), 0, 1);
  const phase = state.phase || 'off';
  const combustion = phase === 'running' || phase === 'stopping'
    || (phase === 'starting' && finite(state.starterProgress) > 0.47);
  const alive = combustion && rpm > 25;
  return {
    phase, rpm, load,
    // A four-stroke flat six fires three times per crankshaft revolution.
    pulseHz: Math.max(8, rpm / 20),
    subHz: Math.max(8, rpm / 40),
    intakeHz: Math.max(15, rpm / 10),
    gain: alive ? (0.035 + 0.068 * load + 0.025 * rpm / 7800) * Math.min(1, rpm / 450) : 0,
    noiseGain: alive ? (0.006 + load * 0.026) * Math.min(1, rpm / 600) : 0,
    cutoffHz: 680 + 2400 * load + rpm * 0.24,
  };
}

/**
 * Local Web Audio synthesizer: starter motor, uneven combustion, exhaust,
 * induction noise, gear changes and assembly clicks. No remote audio assets.
 */
export class EngineAudio {
  constructor({ volume = 0.42, muted = false, contextFactory = null } = {}) {
    this.volume = clamp(finite(volume, 0.42), 0, 1);
    this.muted = Boolean(muted);
    this.contextFactory = contextFactory;
    this.context = null;
    this.unlocked = false;
    this.available = true;
    this.disposed = false;
    this.lastError = null;
    this._lastPhase = 'off';
    this._latestState = { phase: 'off', rpm: 0 };
    this._parameters = engineToneParameters();
    this._updateCount = 0;
    this._sources = [];
    this._oneShots = new Set();
    this._eventCounts = { starter: 0, shift: 0, install: 0, stop: 0 };
    this._hidden = typeof document !== 'undefined' && document.hidden;
    this._visibility = () => {
      this._hidden = document.hidden;
      if (!this.context || this.disposed || !this.unlocked) return;
      if (this._hidden) this.context.suspend().catch(() => {});
      else this.context.resume().catch(error => { this.lastError = String(error); });
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._visibility);
  }

  async unlock() {
    if (this.disposed) return false;
    try {
      if (!this.context) {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!this.contextFactory && !Context) {
          this.available = false;
          this.lastError = 'Web Audio is unavailable in this browser.';
          return false;
        }
        this.context = this.contextFactory
          ? this.contextFactory()
          : new Context({ latencyHint: 'interactive' });
        this._buildGraph();
        this._lastPhase = 'off';
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.unlocked = this.context.state === 'running';
      this.update(this._latestState, 0);
      return this.unlocked;
    } catch (error) {
      this.lastError = String(error);
      this.available = false;
      return false;
    }
  }

  _buildGraph() {
    const ctx = this.context;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -17;
    this.compressor.knee.value = 16;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.006;
    this.compressor.release.value = 0.15;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this._waveform = new Float32Array(this.analyser.fftSize);
    this.compressor.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.exhaustFilter = ctx.createBiquadFilter();
    this.exhaustFilter.type = 'lowpass';
    this.exhaustFilter.Q.value = 0.65;
    this.exhaustFilter.frequency.value = 900;
    this.exhaustFilter.connect(this.compressor);
    this.drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i += 1) {
      const x = i * 2 / (curve.length - 1) - 1;
      curve[i] = Math.tanh(x * 2.4) / Math.tanh(2.4);
    }
    this.drive.curve = curve;
    this.drive.oversample = '2x';
    this.drive.connect(this.exhaustFilter);

    this.combustionGain = ctx.createGain();
    this.combustionGain.gain.value = 0;
    this.combustionGain.connect(this.drive);
    const real = new Float32Array(25);
    const imaginary = new Float32Array(25);
    for (let harmonic = 1; harmonic < imaginary.length; harmonic += 1) {
      imaginary[harmonic] = (harmonic % 3 === 0 ? 0.6 : 1) / harmonic ** 1.18;
      real[harmonic] = Math.sin(harmonic * 1.7) * 0.1 / harmonic;
    }
    this.pulse = ctx.createOscillator();
    this.pulse.setPeriodicWave(ctx.createPeriodicWave(real, imaginary));
    this.pulse.frequency.value = 47.5;
    this.pulse.connect(this.combustionGain);
    this.pulse.start();
    this._sources.push(this.pulse);

    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0;
    this.subGain.connect(this.drive);
    this.sub = ctx.createOscillator();
    this.sub.type = 'triangle';
    this.sub.frequency.value = 23.75;
    this.sub.connect(this.subGain);
    this.sub.start();
    this._sources.push(this.sub);

    this.intakeGain = ctx.createGain();
    this.intakeGain.gain.value = 0;
    this.intakeGain.connect(this.drive);
    this.intake = ctx.createOscillator();
    this.intake.type = 'sawtooth';
    this.intake.frequency.value = 95;
    this.intake.connect(this.intakeGain);
    this.intake.start();
    this._sources.push(this.intake);

    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1100;
    noiseFilter.Q.value = 0.45;
    this.noiseGain.connect(noiseFilter);
    noiseFilter.connect(this.exhaustFilter);
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    let seed = 0x9e3779b9;
    let brown = 0;
    for (let i = 0; i < samples.length; i += 1) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      const white = (seed >>> 0) / 0x80000000 - 1;
      brown = 0.985 * brown + 0.12 * white;
      samples[i] = brown * 0.5 + white * 0.45;
    }
    this.noise = ctx.createBufferSource();
    this.noise.buffer = noiseBuffer;
    this.noise.loop = true;
    this.noise.connect(this.noiseGain);
    this.noise.start();
    this._sources.push(this.noise);
  }

  _ramp(parameter, value, seconds = 0.045) {
    if (!this.context) return;
    parameter.setTargetAtTime(value, this.context.currentTime, seconds);
  }

  update(state, dt = 0) {
    this._latestState = { ...state };
    this._parameters = engineToneParameters(state);
    this._updateCount += 1;
    if (!this.context || this.disposed) return this._parameters;
    const tone = this._parameters;
    if (tone.phase !== this._lastPhase) {
      if (tone.phase === 'starting') this._starter();
      if (tone.phase === 'stopping') this._cutoff();
      this._lastPhase = tone.phase;
    }
    this._ramp(this.pulse.frequency, tone.pulseHz, 0.035);
    this._ramp(this.sub.frequency, tone.subHz, 0.06);
    this._ramp(this.intake.frequency, tone.intakeHz * 1.007, 0.045);
    this._ramp(this.combustionGain.gain, tone.gain, 0.055);
    this._ramp(this.subGain.gain, tone.gain * 0.52, 0.075);
    this._ramp(this.intakeGain.gain, tone.gain * (0.1 + tone.load * 0.14), 0.08);
    this._ramp(this.noiseGain.gain, tone.noiseGain, 0.07);
    this._ramp(this.exhaustFilter.frequency, tone.cutoffHz, 0.07);
    return tone;
  }

  setVolume(value) {
    this.volume = clamp(finite(value), 0, 1);
    if (this.master) this._ramp(this.master.gain, this.muted ? 0 : this.volume, 0.025);
    return this.volume;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.master) this._ramp(this.master.gain, this.muted ? 0 : this.volume, 0.025);
    return this.muted;
  }

  _bufferEffect(kind, duration, sampleFunction) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || this.disposed) return false;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const values = buffer.getChannelData(0);
    let random = 0x4f6cdd1d;
    for (let i = 0; i < values.length; i += 1) {
      random ^= random << 13; random ^= random >>> 17; random ^= random << 5;
      const white = (random >>> 0) / 0x80000000 - 1;
      const t = i / ctx.sampleRate;
      const attack = Math.min(1, t / 0.008);
      const release = Math.min(1, (duration - t) / 0.025);
      values[i] = sampleFunction(t, white) * attack * release;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.compressor);
    source.onended = () => {
      source.disconnect();
      this._oneShots.delete(source);
    };
    this._oneShots.add(source);
    source.start();
    this._eventCounts[kind] += 1;
    return true;
  }

  _starter() {
    return this._bufferEffect('starter', 0.91, (t, white) => {
      const spin = Math.sin(Math.PI * 2 * (132 * t + 35 * t * t));
      const chug = Math.max(0, Math.sin(Math.PI * 2 * (8 * t + 12 * t * t))) ** 8;
      const fade = t < 0.7 ? 1 : Math.max(0, (0.91 - t) / 0.21);
      return ((spin * 0.055 + white * 0.025) * (0.4 + chug * 0.6)
        + chug * Math.sin(Math.PI * 2 * 58 * t) * 0.07) * fade;
    });
  }

  _cutoff() {
    return this._bufferEffect('stop', 0.34, (t, white) =>
      (Math.sin(Math.PI * 2 * (70 * t - 50 * t * t)) * 0.047 + white * 0.011)
      * Math.exp(-t * 11));
  }

  playShift() {
    return this._bufferEffect('shift', 0.16, (t, white) =>
      (white * 0.09 + Math.sin(Math.PI * 2 * (195 * t - 220 * t * t)) * 0.038)
      * Math.exp(-t * 25));
  }

  playInstall() {
    return this._bufferEffect('install', 0.14, (t, white) =>
      (Math.sin(Math.PI * 2 * (780 * t + 480 * t * t)) * 0.065
        + white * 0.024 * Math.exp(-t * 100)) * Math.exp(-t * 24));
  }

  getMetrics() {
    let rms = 0;
    let peak = 0;
    if (this.analyser && this._waveform && this.context?.state === 'running') {
      this.analyser.getFloatTimeDomainData(this._waveform);
      for (const value of this._waveform) {
        rms += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      rms = Math.sqrt(rms / this._waveform.length);
    }
    return {
      available: this.available, unlocked: this.unlocked, disposed: this.disposed,
      contextState: this.context?.state || 'uninitialized',
      phase: this._parameters.phase, rpm: this._parameters.rpm,
      pulseHz: this._parameters.pulseHz, targetEngineGain: this._parameters.gain,
      volume: this.volume, muted: this.muted, hidden: this._hidden,
      updateCount: this._updateCount, eventCounts: { ...this._eventCounts },
      rms, peak, lastError: this.lastError,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._visibility);
    for (const node of [...this._sources, ...this._oneShots]) {
      try { node.stop(); } catch {}
      try { node.disconnect(); } catch {}
    }
    this._sources = [];
    this._oneShots.clear();
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.unlocked = false;
  }
}
