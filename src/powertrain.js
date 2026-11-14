export const GEARS = Object.freeze(['R', 'N', '1', '2', '3', '4', '5', '6']);
export const GEAR_SPEED_LIMITS = Object.freeze({
  R: 35, N: 0, 1: 40, 2: 75, 3: 115, 4: 165, 5: 220, 6: 290,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const damp = (value, target, rate, dt) => target + (value - target) * Math.exp(-rate * dt);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const TAU = Math.PI * 2;

/**
 * Stationary showroom drivetrain. Road speed is the full-size equivalent;
 * the 34.4 mm model tyre represents a 344 mm tyre at a 1:10 scale.
 * The wheel rotation follows v/r, independently of rendering frame rate.
 */
export class Powertrain {
  constructor({
    idleRpm = 950,
    redlineRpm = 7800,
    startSeconds = 0.9,
    stopSeconds = 1.35,
    modelWheelRadius = 0.0344,
    displayScale = 10,
    gearSpeedLimits = GEAR_SPEED_LIMITS,
  } = {}) {
    for (const [name, value] of Object.entries({
      idleRpm, redlineRpm, startSeconds, stopSeconds, modelWheelRadius, displayScale,
    })) {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive.`);
    }
    if (redlineRpm <= idleRpm) throw new RangeError('redlineRpm must exceed idleRpm.');
    this.config = Object.freeze({
      idleRpm, redlineRpm, startSeconds, stopSeconds, modelWheelRadius, displayScale,
    });
    this.gearSpeedLimits = {};
    for (const gear of GEARS) {
      const speed = Number(gearSpeedLimits[gear]);
      if (!Number.isFinite(speed) || speed < 0 || (gear !== 'N' && speed === 0)) {
        throw new RangeError(`Missing or invalid speed limit for gear ${gear}.`);
      }
      this.gearSpeedLimits[gear] = gear === 'N' ? 0 : speed;
    }
    const equivalentRadius = modelWheelRadius * displayScale;
    this.gearRatios = Object.freeze(Object.fromEntries(GEARS.map(gear => [
      gear,
      gear === 'N' ? 0 : redlineRpm
        / ((this.gearSpeedLimits[gear] / 3.6 / equivalentRadius) * 60 / TAU),
    ])));
    this.state = {
      phase: 'off',
      rpm: 0,
      speedKmh: 0,
      wheelAngularVelocity: 0,
      wheelAngle: 0,
      gear: 'N',
      throttle: 0,
      brake: 0,
      engineLoad: 0,
      starterProgress: 0,
      gearMaxKmh: 0,
      shiftSerial: 0,
      shiftRejected: false,
      shiftReason: null,
      gearRatio: 0,
      clutchSlipping: false,
      elapsed: 0,
    };
    this._phaseTime = 0;
    this._shiftTime = 0;
  }

  start() {
    if (this.state.phase === 'starting' || this.state.phase === 'running') return false;
    this._phaseTime = 0;
    this._shiftTime = 0;
    this.state.phase = 'starting';
    this.state.gear = 'N';
    this.state.gearMaxKmh = 0;
    this.state.gearRatio = 0;
    this.state.throttle = 0;
    this.state.rpm = 0;
    this.state.shiftRejected = false;
    this.state.shiftReason = null;
    this.state.clutchSlipping = false;
    this.state.starterProgress = 0;
    this.state.speedKmh = 0;
    this.state.wheelAngularVelocity = 0;
    return true;
  }

  stop() {
    if (this.state.phase === 'off' || this.state.phase === 'stopping') return false;
    this._phaseTime = 0;
    this.state.phase = 'stopping';
    this.state.throttle = 0;
    return true;
  }

  setGear(value) {
    const gear = String(value).toUpperCase();
    const state = this.state;
    const reject = reason => {
      state.shiftRejected = true;
      state.shiftReason = reason;
      return false;
    };
    if (!GEARS.includes(gear)) return reject('invalid-gear');
    if (state.phase === 'starting' || state.phase === 'stopping') return reject('engine-transition');
    state.shiftRejected = false;
    state.shiftReason = null;
    if (gear === state.gear) return false;
    if (gear !== 'N') {
      const direction = gear === 'R' ? -1 : 1;
      if (Math.abs(state.speedKmh) > 3 && Math.sign(state.speedKmh) !== direction) {
        return reject('direction-change');
      }
      const projectedRpm = Math.abs(state.speedKmh) / this.gearSpeedLimits[gear]
        * this.config.redlineRpm;
      if (projectedRpm > this.config.redlineRpm * 1.02) return reject('over-rev');
    }
    state.gear = gear;
    state.gearMaxKmh = this.gearSpeedLimits[gear];
    state.gearRatio = this.gearRatios[gear];
    state.shiftSerial += 1;
    this._shiftTime = 0.18;
    if (gear === 'N') {
      // The car is supported in the showroom: neutral deliberately disengages
      // the displayed wheels, while the engine can still be revved.
      this.state.speedKmh = 0;
      this.state.wheelAngularVelocity = 0;
    }
    return true;
  }

  setThrottle(value) {
    this.state.throttle = this.state.phase === 'running' ? clamp(finite(value), 0, 1) : 0;
    return this.state.throttle;
  }

  setBrake(value) {
    this.state.brake = clamp(finite(value), 0, 1);
    return this.state.brake;
  }

  update(seconds) {
    let remaining = clamp(finite(seconds), 0, 1);
    while (remaining > 1e-9) {
      const dt = Math.min(remaining, 1 / 60);
      this._step(dt);
      remaining -= dt;
    }
    return this.state;
  }

  _step(dt) {
    const state = this.state;
    const config = this.config;
    state.elapsed += dt;
    this._phaseTime += dt;
    this._shiftTime = Math.max(0, this._shiftTime - dt);

    if (state.phase === 'off') {
      state.rpm = 0;
      state.speedKmh = 0;
      state.engineLoad = 0;
      state.starterProgress = 0;
      state.throttle = 0;
      state.clutchSlipping = false;
    } else if (state.phase === 'starting') {
      const progress = clamp(this._phaseTime / config.startSeconds, 0, 1);
      state.starterProgress = progress;
      state.speedKmh = 0;
      const target = progress < 0.47
        ? 220 + progress * 350
        : config.idleRpm + 750 * Math.exp(-(progress - 0.47) * 7);
      state.rpm = damp(state.rpm, target, 13, dt);
      state.engineLoad = 0;
      state.throttle = 0;
      state.clutchSlipping = false;
      if (progress >= 1) {
        state.phase = 'running';
        this._phaseTime = 0;
      }
    } else if (state.phase === 'stopping') {
      state.throttle = 0;
      state.clutchSlipping = false;
      state.rpm = damp(state.rpm, 0, 4.4, dt);
      state.speedKmh = damp(state.speedKmh, 0, 4.6 + state.brake * 7, dt);
      state.engineLoad = damp(state.engineLoad, 0, 8, dt);
      if (this._phaseTime >= config.stopSeconds) {
        state.phase = 'off';
        state.rpm = 0;
        state.speedKmh = 0;
        state.engineLoad = 0;
        state.starterProgress = 0;
        this._phaseTime = 0;
      }
    } else {
      const throttle = this._shiftTime > 0 ? state.throttle * 0.18 : state.throttle;
      const load = throttle * (1 - state.brake);
      state.engineLoad = damp(state.engineLoad, load, 8, dt);
      if (state.gear === 'N') {
        state.speedKmh = 0;
        state.clutchSlipping = false;
        const targetRpm = config.idleRpm + (config.redlineRpm - config.idleRpm) * load;
        state.rpm = damp(state.rpm, targetRpm, throttle > 0 ? 4.5 : 3.8, dt);
      } else {
        const maximum = this.gearSpeedLimits[state.gear];
        const direction = state.gear === 'R' ? -1 : 1;
        const targetSpeed = direction * maximum * load;
        const rank = state.gear === 'R' ? 1 : Number(state.gear);
        const accelerating = Math.abs(targetSpeed) > Math.abs(state.speedKmh)
          && Math.sign(targetSpeed) === Math.sign(state.speedKmh || targetSpeed);
        const rate = accelerating ? 1 / (1.05 + rank * 0.25) : 1.1 + state.brake * 5;
        state.speedKmh = damp(state.speedKmh, targetSpeed, rate, dt);
        if (Math.abs(state.speedKmh) < 0.012 && Math.abs(targetSpeed) < 0.012) state.speedKmh = 0;
        const coupled = config.redlineRpm * Math.abs(state.speedKmh) / maximum;
        state.clutchSlipping = coupled < config.idleRpm || this._shiftTime > 0;
        // Only the launch/clutch region allows RPM above the wheel-coupled value.
        // A fixed ratio then determines RPM, including the drop after an upshift.
        const launchRpm = config.idleRpm + load * 1400;
        const transient = Math.max(0, 1 - Math.abs(state.speedKmh) / 8);
        const targetRpm = clamp(
          Math.max(coupled, config.idleRpm + (launchRpm-config.idleRpm) * transient),
          config.idleRpm, config.redlineRpm,
        );
        state.rpm = damp(state.rpm, targetRpm, this._shiftTime > 0 ? 12 : 6, dt);
      }
    }

    const equivalentRadius = config.modelWheelRadius * config.displayScale;
    state.wheelAngularVelocity = (state.speedKmh / 3.6) / equivalentRadius;
    state.wheelAngle = (state.wheelAngle + state.wheelAngularVelocity * dt) % TAU;
    state.rpm = clamp(state.rpm, 0, config.redlineRpm);
  }
}
