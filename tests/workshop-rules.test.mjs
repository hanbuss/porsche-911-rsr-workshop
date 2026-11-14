import test from 'node:test';
import assert from 'node:assert/strict';
import { workshopAvailability } from '../src/workshop-rules.js';

test('an assembly round cannot be discarded by ignition or access controls', () => {
  const available=workshopAvailability({ready:true,phase:'off',explode:3,targetExplode:3,challengeActive:true});
  assert.equal(available.ignition,false);
  assert.equal(available.access,false);
  assert.equal(available.throttle,false);
});
test('opening access stops propulsion while an idle engine may stay active', () => {
  const available=workshopAvailability({ready:true,phase:'running',opens:{hood:1},openTargets:{hood:1}});
  assert.equal(available.ignition,true);
  assert.equal(available.throttle,false);
  assert.equal(available.access,true);
});
test('moving wheels cannot be dismantled or have doors opened', () => {
  const available=workshopAvailability({ready:true,phase:'running',speedKmh:72});
  assert.equal(available.access,false);
  assert.equal(available.disassembly,false);
  assert.equal(available.brake,true);
});
test('returning and not-yet-settled parts block ignition until restoration is complete', () => {
  assert.equal(workshopAvailability({ready:true,returning:true}).ignition,false);
  assert.equal(workshopAvailability({ready:true,explode:.2}).ignition,false);
  assert.equal(workshopAvailability({ready:true,explode:0,targetExplode:0}).ignition,true);
});
test('the last visible restoration movement stays locked until the renderer snap tolerance', () => {
  for (const explode of [.014, .001, .000101]) {
    const available=workshopAvailability({ready:true,phase:'running',explode,targetExplode:0});
    assert.equal(available.ignition,false);
    assert.equal(available.throttle,false);
    assert.equal(available.access,false);
  }
  for (const explode of [0, .000099, .0001]) {
    assert.equal(workshopAvailability({ready:true,explode,targetExplode:0}).ignition,true);
  }
  assert.equal(workshopAvailability({ready:true,explode:0,targetExplode:.001}).ignition,false);
});
