const THROTTLE_KEYS = new Set(['KeyW', 'ArrowUp']);
const BRAKE_KEYS = new Set(['KeyS', 'ArrowDown', 'Space']);
const ACTIONS = Object.freeze({
  KeyI: 'ignition', KeyQ: 'shiftDown', KeyE: 'shiftUp',
  KeyN: 'neutral', KeyR: 'reverse', Home: 'resetView', Escape: 'clearSelection',
});

function editable(target) {
  return !!target?.isContentEditable
    || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName)
    || !!target?.closest?.('[contenteditable="true"]');
}

/** Momentary pedals, with release handling independent of the focused element. */
export function bindDrivingKeyboard({ target, document, enabled = () => true,
  onAction = () => {}, onPedals = () => {} }) {
  const held = new Set();
  const pedals = () => ({
    throttle: [...THROTTLE_KEYS].some(key => held.has(key)) ? 1 : 0,
    brake: [...BRAKE_KEYS].some(key => held.has(key)) ? 1 : 0,
  });
  function release() { held.clear(); onPedals({ throttle: 0, brake: 0 }); }
  function down(event) {
    const code = event.code;
    if (!(code in ACTIONS) && !THROTTLE_KEYS.has(code) && !BRAKE_KEYS.has(code)) return;
    if (!enabled() || editable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    if (event.repeat || held.has(code)) return;
    held.add(code);
    if (code in ACTIONS) onAction(ACTIONS[code]);
    else onPedals(pedals());
  }
  function up(event) {
    if (!held.delete(event.code)) return;
    if (THROTTLE_KEYS.has(event.code) || BRAKE_KEYS.has(event.code)) {
      event.preventDefault(); onPedals(pedals());
    }
  }
  const visibility = () => { if (document.hidden) release(); };
  const focus = event => { if (editable(event.target)) release(); };
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', release);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('focusin', focus);
  return {
    release,
    snapshot: () => ({ heldKeys: [...held], ...pedals() }),
    dispose() {
      release();
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('focusin', focus);
    },
  };
}
