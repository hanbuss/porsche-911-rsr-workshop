import test from 'node:test';
import assert from 'node:assert/strict';
import { bindDrivingKeyboard } from '../src/driving-input.js';

function fixture() {
  const target = new EventTarget();
  const document = new EventTarget();
  document.hidden = false;
  const actions = [], values = [];
  const input = bindDrivingKeyboard({ target, document,
    onAction: action => actions.push(action), onPedals: value => values.push(value) });
  function key(type, code, options = {}) {
    const event = new Event(type, { cancelable: true });
    for (const [name, value] of Object.entries({ code, ...options })) {
      Object.defineProperty(event, name, { value });
    }
    target.dispatchEvent(event);
    return event;
  }
  return { target, document, actions, values, input, key };
}

test('held ignition and shift keys trigger once, while pedal aliases release independently', () => {
  const f = fixture();
  f.key('keydown', 'KeyI'); f.key('keydown', 'KeyI', { repeat: true });
  f.key('keydown', 'KeyE'); f.key('keydown', 'KeyE', { repeat: true });
  assert.deepEqual(f.actions, ['ignition', 'shiftUp']);
  f.key('keydown', 'KeyW'); f.key('keydown', 'ArrowUp'); f.key('keyup', 'KeyW');
  assert.equal(f.values.at(-1).throttle, 1);
  f.key('keyup', 'ArrowUp');
  assert.deepEqual(f.values.at(-1), { throttle: 0, brake: 0 });
  f.key('keydown', 'Space');
  assert.deepEqual(f.values.at(-1), { throttle: 0, brake: 1 });
  f.key('keyup', 'Space');
  assert.equal(f.values.at(-1).brake, 0);
  f.input.dispose();
});

test('typing and modified browser shortcuts do not drive the car; releases survive a focus change', () => {
  const f = fixture();
  f.key('keydown', 'KeyW', { target: { tagName: 'INPUT' } });
  f.key('keydown', 'KeyI', { target: { isContentEditable: true } });
  f.key('keydown', 'KeyR', { ctrlKey: true });
  assert.deepEqual(f.input.snapshot().heldKeys, []);
  assert.deepEqual(f.actions, []);
  f.key('keydown', 'KeyW');
  f.key('keyup', 'KeyW', { target: { tagName: 'SELECT' } });
  assert.equal(f.values.at(-1).throttle, 0);
  f.input.dispose();
});

test('lost window focus and hidden tabs clear both pedals and all held keys', () => {
  const f = fixture();
  for (const event of ['blur', 'visibilitychange']) {
    f.key('keydown', 'KeyW'); f.key('keydown', 'KeyS');
    if (event === 'blur') f.target.dispatchEvent(new Event(event));
    else { f.document.hidden = true; f.document.dispatchEvent(new Event(event)); }
    assert.deepEqual(f.input.snapshot(), { heldKeys: [], throttle: 0, brake: 0 });
    assert.deepEqual(f.values.at(-1), { throttle: 0, brake: 0 });
  }
  f.input.dispose();
});
