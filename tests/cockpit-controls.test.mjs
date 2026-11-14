import test from 'node:test';
import assert from 'node:assert/strict';
import { enterDriverView } from '../src/cockpit-controls.js';
import { workshopAvailability } from '../src/workshop-rules.js';
import { Powertrain } from '../src/powertrain.js';

function fixture() {
  const powertrain = new Powertrain();
  const view = {
    opens: { leftDoor: 0, rightDoor: 0, hood: 0, rearHood: 0, roof: 0 },
    openTargets: { leftDoor: 0, rightDoor: 0, hood: 0, rearHood: 0, roof: 0 },
    controls: { autoRotate: true }, cameraMode: 'orbit',
    setOpen(key, value) { this.openTargets[key] = value ? 1 : 0; },
    focus(name) { this.cameraMode = name === 'interior' ? 'cockpit' : 'orbit'; },
  };
  const available = extra => workshopAvailability({ ready: true, ...powertrain.state,
    opens: view.opens, openTargets: view.openTargets, ...extra });
  let releaseCount = 0, entered = 0;
  const callbacks = { releasePedals() {
    releaseCount++; powertrain.setThrottle(0); powertrain.setBrake(0);
  }, onEntered() { entered++; } };
  return { view, powertrain, available, callbacks,
    get releaseCount() { return releaseCount; }, get entered() { return entered; } };
}

test('entering a closed cabin preserves the complete body and permits ignition and acceleration', () => {
  const f = fixture();
  assert.equal(enterDriverView(f.view, f.available(), f.callbacks), true);
  assert.ok(Object.values(f.view.openTargets).every(value => value === 0));
  assert.equal(f.view.cameraMode, 'cockpit');
  assert.equal(f.view.controls.autoRotate, false);
  assert.equal(f.available().ignition, true);
  f.powertrain.start(); f.powertrain.update(1); f.powertrain.setGear('1');
  assert.equal(f.available().throttle, true);
  f.powertrain.setThrottle(1); f.powertrain.update(1);
  assert.ok(f.powertrain.state.speedKmh > 0);
  assert.equal(f.entered, 1);
});

test('changing to the driver eye while moving preserves throttle without permitting door or teardown operations', () => {
  const f = fixture();
  f.powertrain.start(); f.powertrain.update(1); f.powertrain.setGear('1');
  f.powertrain.setThrottle(.75); f.powertrain.update(1);
  assert.equal(f.available().access, false);
  assert.equal(f.available().disassembly, false);
  assert.equal(enterDriverView(f.view, f.available(), f.callbacks), true);
  assert.equal(f.powertrain.state.throttle, .75);
  assert.equal(f.releaseCount, 0);
  assert.ok(Object.values(f.view.openTargets).every(value => value === 0));
});

test('entering from opened panels closes every target and keeps throttle locked until the actual geometry closes', () => {
  const f = fixture();
  f.powertrain.start(); f.powertrain.update(1); f.powertrain.setThrottle(.2);
  for (const key of Object.keys(f.view.opens)) f.view.opens[key] = f.view.openTargets[key] = 1;
  assert.equal(enterDriverView(f.view, f.available(), f.callbacks), true);
  assert.ok(Object.values(f.view.openTargets).every(value => value === 0));
  assert.equal(f.powertrain.state.throttle, 0);
  assert.equal(f.releaseCount, 1);
  assert.equal(f.available().throttle, false);
  for (const key of Object.keys(f.view.opens)) f.view.opens[key] = 0;
  assert.equal(f.available().throttle, true);
});

test('an assembly round or geometry still returning blocks driver view without mutating it', () => {
  for (const state of [{ challengeActive: true }, { preparing: true }, { returning: true }, { explode: .001 }]) {
    const f = fixture();
    assert.equal(enterDriverView(f.view, f.available(state), f.callbacks), false);
    assert.equal(f.view.cameraMode, 'orbit');
    assert.equal(f.entered, 0);
    assert.equal(f.releaseCount, 0);
  }
});
