import test from 'node:test';
import assert from 'node:assert/strict';
import { Powertrain, GEAR_SPEED_LIMITS } from '../src/powertrain.js';
import { engineToneParameters, EngineAudio } from '../src/engine-audio.js';

function advance(car, seconds, step = 1 / 60) {
  for (let time = 0; time < seconds - 1e-8; time += step) car.update(Math.min(step, seconds - time));
  return car.state;
}

test('engine requires ignition, cranks then idles in neutral with stationary wheels', () => {
  const car = new Powertrain();
  car.setThrottle(0.7);
  advance(car, 2);
  assert.equal(car.state.phase, 'off');
  assert.equal(car.state.rpm, 0);
  assert.equal(car.state.speedKmh, 0);
  car.setThrottle(0);
  assert.equal(car.start(), true);
  assert.equal(car.start(), false);
  advance(car, 0.2);
  assert.equal(car.state.phase, 'starting');
  assert.ok(car.state.rpm > 0 && car.state.rpm < 950);
  advance(car, 3);
  assert.equal(car.state.phase, 'running');
  assert.ok(Math.abs(car.state.rpm - 950) < 1);
  assert.equal(car.state.speedKmh, 0);
  assert.equal(car.state.wheelAngularVelocity, 0);
});

test('each forward gear has a higher steady speed at equal throttle and correct v/r wheel rate', () => {
  const speeds = [];
  for (let gear = 1; gear <= 6; gear += 1) {
    const car = new Powertrain();
    car.start(); advance(car, 1);
    car.setGear(gear); car.setThrottle(0.6);
    advance(car, 35);
    speeds.push(car.state.speedKmh);
    assert.ok(Math.abs(car.state.speedKmh - GEAR_SPEED_LIMITS[gear] * 0.6) < 0.1);
    assert.ok(Math.abs(car.state.wheelAngularVelocity - car.state.speedKmh / 3.6 / 0.344) < 1e-9);
    assert.ok(car.state.rpm > 950 && car.state.rpm < 7801);
  }
  for (let i = 1; i < speeds.length; i += 1) assert.ok(speeds[i] > speeds[i - 1]);
});

test('reverse rotation is negative and braking brings an engaged engine back to idle', () => {
  const car = new Powertrain();
  car.start(); advance(car, 1);
  car.setGear('R'); car.setThrottle(0.8);
  advance(car, 10);
  assert.ok(car.state.speedKmh < -25 && car.state.speedKmh >= -35);
  assert.ok(car.state.wheelAngularVelocity < 0);
  car.setBrake(1);
  advance(car, 4);
  assert.equal(car.state.speedKmh, 0);
  assert.equal(car.state.wheelAngularVelocity, 0);
  assert.ok(Math.abs(car.state.rpm - 950) < 1);
});

test('neutral disengages the wheels while revving; stop fades to a stable off state', () => {
  const car = new Powertrain();
  car.start(); advance(car, 1);
  car.setGear('4'); car.setThrottle(0.8); advance(car, 8);
  assert.ok(car.state.speedKmh > 70);
  car.setGear('N');
  assert.equal(car.state.wheelAngularVelocity, 0);
  advance(car, 3);
  assert.ok(car.state.rpm > 6000);
  assert.equal(car.state.speedKmh, 0);
  assert.equal(car.stop(), true);
  advance(car, 0.2);
  assert.equal(car.state.phase, 'stopping');
  assert.ok(car.state.rpm > 0);
  advance(car, 3);
  assert.equal(car.state.phase, 'off');
  assert.equal(car.state.rpm, 0);
  assert.equal(car.state.speedKmh, 0);
  assert.equal(car.stop(), false);
});

test('time stepping is consistent across render rates and rejects malformed controls', () => {
  const slow = new Powertrain();
  const fast = new Powertrain();
  for (const car of [slow, fast]) {
    car.start();
    advance(car, 2);
    car.setGear(3);
    car.setThrottle(0.65);
  }
  advance(slow, 10, 1 / 30);
  advance(fast, 10, 1 / 120);
  assert.ok(Math.abs(slow.state.speedKmh - fast.state.speedKmh) < 0.1);
  assert.ok(Math.abs(slow.state.rpm - fast.state.rpm) < 5);
  assert.equal(slow.setGear('7'), false);
  assert.equal(slow.state.gear, '3');
  slow.setThrottle(Infinity); slow.setBrake(-20); slow.update(NaN);
  assert.equal(slow.state.throttle, 0);
  assert.equal(slow.state.brake, 0);
  assert.ok(Number.isFinite(slow.state.rpm));
});

test('engine audio distinguishes off, cranking, idle and a loaded high-rpm engine', async () => {
  const off = engineToneParameters({ phase: 'off', rpm: 0 });
  const crank = engineToneParameters({ phase: 'starting', rpm: 300, starterProgress: 0.2 });
  const idle = engineToneParameters({ phase: 'running', rpm: 950, engineLoad: 0 });
  const rev = engineToneParameters({ phase: 'running', rpm: 6000, engineLoad: 0.9 });
  assert.equal(off.gain, 0);
  assert.equal(crank.gain, 0);
  assert.equal(idle.pulseHz, 47.5);
  assert.ok(rev.pulseHz > idle.pulseHz * 5);
  assert.ok(rev.gain > idle.gain);
  assert.ok(rev.noiseGain > idle.noiseGain);
  const audio = new EngineAudio({ volume: 5 });
  assert.equal(audio.volume, 1);
  audio.setMuted(true);
  assert.equal(audio.getMetrics().muted, true);
  audio.dispose(); audio.dispose();
  assert.equal(await audio.unlock(), false);
});

test('direction changes are rejected while wheels are moving and accepted after braking', () => {
  const car = new Powertrain();
  car.start(); advance(car, 2);
  car.setGear('3'); car.setThrottle(0.8); advance(car, 8);
  const before = { speed: car.state.speedKmh, serial: car.state.shiftSerial };
  assert.ok(before.speed > 60);
  assert.equal(car.setGear('R'), false, 'R must not reverse a fast forward drivetrain');
  assert.equal(car.state.gear, '3');
  assert.equal(car.state.shiftSerial, before.serial);
  assert.equal(car.state.shiftRejected, true);
  assert.equal(car.state.shiftReason, 'direction-change');
  assert.equal(car.state.speedKmh, before.speed);
  car.setBrake(1); advance(car, 4);
  assert.ok(Math.abs(car.state.speedKmh) < 3);
  assert.equal(car.setGear('R'), true);
  car.setBrake(0); advance(car, 6);
  assert.ok(car.state.speedKmh < -15);
  const reverseSerial = car.state.shiftSerial;
  assert.equal(car.setGear('1'), false);
  assert.equal(car.state.gear, 'R');
  assert.equal(car.state.shiftSerial, reverseSerial);
});

test('ignition always enters neutral and requires a new throttle input after startup', () => {
  const car = new Powertrain();
  car.setGear('5');
  assert.equal(car.setThrottle(1), 0, 'off-state throttle must not be latched for launch');
  car.start();
  assert.equal(car.state.gear, 'N');
  assert.equal(car.state.throttle, 0);
  assert.equal(car.setGear('1'), false, 'transmission remains disengaged while cranking');
  assert.equal(car.state.shiftReason, 'engine-transition');
  assert.equal(car.setThrottle(1), 0);
  advance(car, 3);
  assert.equal(car.state.phase, 'running');
  assert.ok(Math.abs(car.state.rpm - 950) < 1);
  assert.equal(car.state.speedKmh, 0);
  assert.equal(car.state.throttle, 0);
  car.setGear('1'); car.setThrottle(0.5); advance(car, 3);
  assert.ok(car.state.speedKmh > 10);
  car.stop();
  assert.equal(car.setThrottle(1), 0);
  advance(car, 3);
  car.start(); advance(car, 3);
  assert.equal(car.state.gear, 'N');
  assert.equal(car.state.speedKmh, 0);
});

test('forward gear ratios couple engine RPM to wheel RPM and over-rev downshifts are refused', () => {
  const car = new Powertrain();
  car.start(); advance(car, 2);
  car.setGear('3'); car.setThrottle(0.6); advance(car, 30);
  const wheelRpm = Math.abs(car.state.wheelAngularVelocity) * 60 / (2 * Math.PI);
  assert.ok(wheelRpm > 400);
  assert.ok(Math.abs(car.state.rpm - wheelRpm * car.gearRatios['3']) < 4,
    'engaged engine RPM must follow the fixed ratio at steady speed');
  const speedBefore = car.state.speedKmh;
  const rpmBefore = car.state.rpm;
  assert.equal(car.setGear('4'), true);
  assert.equal(car.state.speedKmh, speedBefore, 'upshift does not teleport road speed');
  assert.equal(car.state.rpm, rpmBefore, 'RPM converges after the shift, rather than snapping');
  advance(car, 0.2);
  assert.ok(car.state.rpm < rpmBefore - 250, 'upshift lowers coupled RPM at this speed');
  car.setGear('6'); car.setThrottle(1); advance(car, 40);
  const serial = car.state.shiftSerial;
  assert.ok(car.state.speedKmh > 260);
  assert.equal(car.setGear('1'), false);
  assert.equal(car.state.shiftReason, 'over-rev');
  assert.equal(car.state.gear, '6');
  assert.equal(car.state.shiftSerial, serial);
});
