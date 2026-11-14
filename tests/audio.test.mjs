import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineAudio, engineToneParameters } from '../src/engine-audio.js';

class Parameter {
  constructor(value = 0) { this.value = value; this.targets = []; }
  setTargetAtTime(value, time, seconds) {
    this.value = value;
    this.targets.push({ value, time, seconds });
  }
}

class Node {
  constructor() {
    for (const name of ['gain', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release']) {
      this[name] = new Parameter();
    }
    this.started = false;
  }
  connect(target) { this.target = target; return target; }
  disconnect() { this.target = null; }
  start() { this.started = true; }
  stop() { this.started = false; }
  setPeriodicWave(wave) { this.wave = wave; }
}

function audioContext() {
  const ctx = {
    currentTime: 0, sampleRate: 12000, state: 'running', destination: new Node(), buffers: [],
    sources: [], resumeCount: 0, suspendCount: 0,
    createGain: () => new Node(), createDynamicsCompressor: () => new Node(),
    createBiquadFilter: () => new Node(), createWaveShaper: () => new Node(),
    createOscillator: () => new Node(), createPeriodicWave: (real, imaginary) => ({ real, imaginary }),
    createAnalyser: () => Object.assign(new Node(), { fftSize: 512, getFloatTimeDomainData: values => values.fill(0) }),
    createBuffer: (_channels, size, sampleRate) => {
      const samples = new Float32Array(size);
      const buffer = { getChannelData: () => samples, duration: size / sampleRate };
      ctx.buffers.push(buffer);
      return buffer;
    },
    createBufferSource: () => {
      const source = new Node();
      ctx.sources.push(source);
      return source;
    },
    resume: async () => { ctx.state = 'running'; ctx.resumeCount++; },
    suspend: async () => { ctx.state = 'suspended'; ctx.suspendCount++; },
    close: async () => { ctx.state = 'closed'; },
  };
  return ctx;
}

test('repeated user gestures during cranking never replay the starter effect', async () => {
  const ctx = audioContext();
  let contexts = 0;
  const audio = new EngineAudio({ contextFactory: () => { contexts++; return ctx; } });
  audio.update({ phase: 'starting', rpm: 300, starterProgress: .2 });
  await audio.unlock();
  assert.equal(audio.getMetrics().eventCounts.starter, 1);
  await audio.unlock();
  audio.setMuted(true);
  await audio.unlock();
  assert.equal(contexts, 1);
  assert.equal(audio.getMetrics().eventCounts.starter, 1,
    'sound-button gestures must not retrigger a motor already cranking');
  audio.update({ phase: 'running', rpm: 950, engineLoad: 0 });
  await audio.unlock();
  assert.equal(audio.getMetrics().eventCounts.starter, 1);
  audio.update({ phase: 'stopping', rpm: 800 });
  audio.update({ phase: 'stopping', rpm: 600 });
  assert.equal(audio.getMetrics().eventCounts.stop, 1);
  audio.update({ phase: 'off', rpm: 0 });
  audio.update({ phase: 'starting', rpm: 300, starterProgress: .2 });
  assert.equal(audio.getMetrics().eventCounts.starter, 2, 'a new ignition gets a new starter effect');
  audio.dispose();
});

test('visibility suspend/resume preserves mute and the current engine event phase', async () => {
  const previousDocument = globalThis.document;
  const handlers = new Map();
  globalThis.document = {
    hidden: false,
    addEventListener: (name, fn) => handlers.set(name, fn),
    removeEventListener: name => handlers.delete(name),
  };
  const ctx = audioContext();
  const audio = new EngineAudio({ contextFactory: () => ctx, volume: .6 });
  try {
    await audio.unlock();
    audio.update({ phase: 'starting', rpm: 300, starterProgress: .2 });
    audio.setMuted(true);
    assert.equal(audio.master.gain.value, 0);
    globalThis.document.hidden = true;
    handlers.get('visibilitychange')();
    await Promise.resolve();
    assert.equal(ctx.state, 'suspended');
    globalThis.document.hidden = false;
    handlers.get('visibilitychange')();
    await Promise.resolve();
    assert.equal(ctx.state, 'running');
    assert.equal(audio.getMetrics().muted, true);
    assert.equal(audio.master.gain.value, 0);
    assert.equal(audio.getMetrics().eventCounts.starter, 1);
  } finally {
    audio.dispose();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('generated starter, shift and installation buffers are finite, distinct and below clipping', async () => {
  const ctx = audioContext();
  const audio = new EngineAudio({ contextFactory: () => ctx });
  await audio.unlock();
  audio.update({ phase: 'starting', rpm: 300, starterProgress: .2 });
  audio.playShift();
  audio.playInstall();
  const effects = ctx.sources.filter(source => !source.loop && source.buffer).map(source => source.buffer);
  assert.equal(effects.length, 3);
  const signatures = effects.map(buffer => {
    const samples = buffer.getChannelData(0);
    let squared = 0, peak = 0;
    for (const sample of samples) {
      assert.ok(Number.isFinite(sample));
      squared += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    return { duration: buffer.duration, rms: Math.sqrt(squared / samples.length), peak };
  });
  assert.ok(signatures.every(value => value.rms > .001 && value.peak < 1));
  assert.equal(new Set(signatures.map(value => value.duration)).size, 3);
  const stopped = engineToneParameters({ phase: 'off', rpm: 9000, engineLoad: 1 });
  assert.equal(stopped.gain, 0);
  assert.equal(stopped.noiseGain, 0);
  audio.dispose();
});
