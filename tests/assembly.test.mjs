import test from 'node:test';
import assert from 'node:assert/strict';
import { AssemblyChallenge } from '../src/assembly.js';

function seeded(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

test('every part receives a unique random label and installation order is separately randomized', () => {
  const ids = Array.from({ length: 1684 }, (_, i) => `part-${i}`);
  const challenge = new AssemblyChallenge(ids, { random: seeded(4231) });
  challenge.begin();
  assert.equal(challenge.queue.length, ids.length);
  assert.equal(new Set(challenge.queue).size, ids.length);
  const numbers = ids.map(id => challenge.numberFor(id));
  assert.equal(new Set(numbers).size, ids.length);
  assert.equal(Math.min(...numbers), 1);
  assert.equal(Math.max(...numbers), ids.length);
  assert.notDeepEqual(challenge.queue, ids);
  assert.notDeepEqual(challenge.queue.map(id => challenge.numberFor(id)), numbers.slice().sort((a, b) => a - b));
  assert.equal(challenge.idForNumber(challenge.expectedNumber), challenge.nextId);
});

test('wrong numbers and repeated pieces cannot advance the build', () => {
  const challenge = new AssemblyChallenge(['a', 'b', 'c', 'd'], { random: seeded(91) });
  assert.equal(challenge.attempt('a').reason, 'not-started');
  challenge.begin();
  const wrong = challenge.queue[1];
  const expected = challenge.nextId;
  const label = challenge.expectedNumber;
  assert.equal(challenge.attempt('missing').reason, 'unknown-part');
  const response = challenge.attempt(wrong);
  assert.equal(response.ok, false);
  assert.equal(response.reason, 'wrong-order');
  assert.equal(response.expected, label);
  assert.equal(challenge.progress, 0);
  assert.equal(challenge.nextId, expected);
  assert.equal(challenge.attempt(expected).ok, true);
  assert.equal(challenge.progress, 0.25);
  assert.equal(challenge.attempt(expected).reason, 'already-installed');
  assert.equal(challenge.progress, 0.25);
});

test('following every prompted number finishes exactly once and a new round resets the permutation', () => {
  const ids = Array.from({ length: 100 }, (_, i) => String(i));
  const challenge = new AssemblyChallenge(ids, { random: seeded(720) });
  challenge.begin();
  const first = challenge.snapshot({ includeOrder: true });
  for (let i = 0; i < ids.length; i += 1) {
    const result = challenge.installNext();
    assert.equal(result.ok, true);
    assert.equal(challenge.installed.size, i + 1);
    assert.equal(result.complete, i === ids.length - 1);
  }
  assert.equal(challenge.progress, 1);
  assert.equal(challenge.nextId, null);
  assert.equal(challenge.expectedNumber, null);
  assert.equal(challenge.installNext().reason, 'complete');
  challenge.begin();
  const second = challenge.snapshot({ includeOrder: true });
  assert.equal(challenge.installed.size, 0);
  assert.equal(challenge.round, 2);
  assert.notDeepEqual(first.queue, second.queue);
  assert.notDeepEqual(first.labels, second.labels);
  challenge.reset();
  assert.equal(challenge.active, false);
  assert.equal(challenge.numberFor(ids[0]), null);
  assert.equal(challenge.nextId, null);
});

test('duplicate ids fail early and an empty supplied collection is safely complete', () => {
  assert.throws(() => new AssemblyChallenge(['a', 'a']), /unique/);
  const empty = new AssemblyChallenge([]);
  empty.begin();
  assert.equal(empty.complete, true);
  assert.equal(empty.progress, 1);
  assert.equal(empty.installNext().reason, 'complete');
});
