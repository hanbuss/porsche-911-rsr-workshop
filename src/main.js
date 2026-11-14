import './style.css';
import './interaction.css';
import { CarScene, partName, groupName } from './car-scene.js';
import { Powertrain } from './powertrain.js';
import { AssemblyChallenge } from './assembly.js';
import { EngineAudio } from './engine-audio.js';
import { workshopAvailability } from './workshop-rules.js';
import { bindDrivingKeyboard } from './driving-input.js';
import { enterDriverView } from './cockpit-controls.js';

const $ = id => document.getElementById(id);
const powertrain = new Powertrain();
const audio = new EngineAudio({ volume: .45 });
let view, challenge = null, ready = false, autoAssemble = false, autoClock = 0, completeHandled = false;
let toastTimer, frameTime = performance.now(), uiClock = 0, fpsFrames = 0, fpsSeconds = 0, lastFps = 0;
let averageFrameMs = 0, sampledSeconds = 0, sampledFrames = 0;
let activeTab = 'drive';
let pendingOperation = null, returning = false, returnMode = 'complete', ignitionPending = false;
let keyboard;
const stageNames = ['完整车型', '车身展开', '机械总成展开', '全部零件分开'];
const accessButtons = [['left-door-toggle', 'leftDoor'], ['right-door-toggle', 'rightDoor'],
  ['hood-toggle', 'hood'], ['rear-hood-toggle', 'rearHood'], ['roof-toggle', 'roof']];
const lightButtons = [['headlights-toggle', 'headlights'], ['taillights-toggle', 'taillights'],
  ['hazards-toggle', 'hazards'], ['night-toggle', 'night']];
const errors = [];
const binding = (id, type, listener) => $(id)?.addEventListener(type, listener);
const toggle = (id, on) => $(id)?.setAttribute('aria-pressed', String(on));

function toast(text, duration = 3300) {
  clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration);
}

function tab(name) {
  activeTab = name;
  for (const button of document.querySelectorAll('[data-tab]')) {
    const selected = button.dataset.tab === name;
    button.classList.toggle('is-active', selected); button.setAttribute('aria-selected', String(selected));
  }
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== name;
}
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => tab(button.dataset.tab));

function paintRange(input) { input.style.setProperty('--range-progress', `${(input.value - input.min) / (input.max - input.min) * 100}%`); }
for (const input of document.querySelectorAll('input[type="range"]')) { paintRange(input); input.addEventListener('input', () => paintRange(input)); }

function availability() {
  return workshopAvailability({ ready, ...powertrain.state,
    explode: view?.explode, targetExplode: view?.targetExplode,
    opens: view?.opens, openTargets: view?.openTargets,
    challengeActive: !!challenge && !completeHandled,
    preparing: !!pendingOperation, returning });
}

function releasePedals() {
  keyboard?.release(); powertrain.setThrottle(0); powertrain.setBrake(0);
}

function syncStages() {
  const value = view?.targetExplode || 0;
  $('explode-slider').value = value; paintRange($('explode-slider'));
  $('explode-label').textContent = pendingOperation ? '正在准备…'
    : returning ? '正在归位…' : challenge && !completeHandled ? '随机编号回装' : stageNames[Math.round(value)];
  for (const button of document.querySelectorAll('[data-explode]')) {
    const active = (!challenge || completeHandled) && Math.round(value) === Number(button.dataset.explode);
    button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
  }
}

function selectPart(part) {
  if (!ready) return;
  view.select(part);
  $('selected-card').hidden = !part;
  if (!part) return;
  $('selected-name').textContent = partName(part);
  $('selected-id').textContent = challenge ? `随机编号 #${challenge.numberFor(part.id)}` : (part.meta.partId || part.id);
  $('selected-group').textContent = groupName(part.meta.group);
  if (challenge && !challenge.complete && !returning && !pendingOperation) install(part.id);
}

function refreshChallenge() {
  $('challenge-panel').hidden = !challenge;
  if (!challenge) return;
  $('challenge-progress').textContent = `${challenge.installed.size.toLocaleString()} / ${challenge.total.toLocaleString()}`;
  const progress = Math.round(challenge.progress * 100);
  $('challenge-panel').style.setProperty('--assembly-progress', `${progress}%`);
  $('challenge-number').textContent = challenge.complete ? '✓' : String(challenge.expectedNumber).padStart(4, '0');
  const part = view.byId.get(challenge.nextId);
  $('challenge-name').textContent = returning ? '正在将零件归位，请稍候…'
    : challenge.complete ? '装配完成，整车已归位' : part ? partName(part) : '';
  const unavailable = challenge.complete || returning || !!pendingOperation;
  $('challenge-next').disabled = unavailable;
  $('challenge-submit').disabled = unavailable;
  $('challenge-search').disabled = unavailable;
  $('challenge-search').max = challenge.total;
  $('challenge-auto').disabled = unavailable;
  $('challenge-shuffle').disabled = returning || !!pendingOperation;
  $('challenge-cancel').disabled = returning || !!pendingOperation;
  toggle('challenge-auto', autoAssemble);
  $('challenge-auto').lastChild.textContent = autoAssemble ? ' 暂停回装' : ' 自动回装';
}

function install(id, automatic = false) {
  if (!challenge || challenge.complete || returning || pendingOperation) return false;
  const result = challenge.attempt(id);
  if (result.ok) {
    if (!automatic || autoClock < .06) audio.playInstall();
    if (!automatic) { toast(`#${result.number} 已装回`); $('challenge-search').value = ''; }
    view.select(null); $('selected-card').hidden = true;
    if (challenge.complete) { returning = true; returnMode = 'complete'; autoAssemble = false; }
    refreshChallenge();
  } else if (!automatic) {
    toast(result.reason === 'already-installed' ? '这件已经装回了' : `先装回编号 ${challenge.expectedNumber} 的零件`);
    $('challenge-number').classList.remove('shake');
    requestAnimationFrame(() => $('challenge-number').classList.add('shake'));
  }
  return result.ok;
}

function beginChallenge() {
  if (!ready || returning || pendingOperation || !availability().disassembly) return;
  if (challenge && !completeHandled) {
    endChallenge(); pendingOperation = { kind: 'challenge', stage: 'closing' }; return;
  }
  prepareWorkshop({ kind: 'challenge' });
}

function createChallenge() {
  challenge = new AssemblyChallenge(view.roots.map(p => p.id)); challenge.begin();
  completeHandled = false; autoAssemble = false; autoClock = 0;
  view.setChallenge(challenge); view.select(null); $('selected-card').hidden = true;
  refreshChallenge(); syncStages();
  toast(`已抽签 · 按提示装回 ${challenge.total.toLocaleString()} 件，第一件是 #${challenge.expectedNumber}`, 5500);
}

function endChallenge() {
  if (!challenge || returning) return;
  if (completeHandled) { challenge = null; refreshChallenge(); syncStages(); return; }
  releasePedals(); autoAssemble = false; autoClock = 0;
  while (!challenge.complete) challenge.installNext();
  returning = true; returnMode = 'cancel';
  view.select(null); $('selected-card').hidden = true;
  view.focus('assembled'); refreshChallenge(); refreshUI();
}

function setExplode(value, focus = true) {
  if (!ready || returning || pendingOperation) return;
  if (challenge && !completeHandled) {
    if (Number(value) === 0) endChallenge();
    else toast('先结束装配挑战，再切换拆解阶段');
    syncStages(); return;
  }
  if (!availability().disassembly) { toast('请先制动停车，再拆解车身'); syncStages(); return; }
  prepareWorkshop({ kind: 'explode', value: Math.max(0, Math.min(3, Number(value))), focus });
}

function prepareWorkshop(operation) {
  if (challenge && completeHandled) { challenge = null; refreshChallenge(); }
  if (view.cameraMode === 'cockpit') view.focus('assembled');
  releasePedals(); powertrain.stop();
  for (const key of Object.keys(view.openTargets)) view.setOpen(key, false);
  for (const key of ['headlights', 'taillights', 'hazards']) view.setLight(key, false);
  pendingOperation = { ...operation, stage: 'closing' };
  processWorkshop(); refreshUI();
}

function processWorkshop() {
  if (returning) {
    if (!view.allInstalled) return;
    view.finishAssembly(); returning = false; completeHandled = true;
    view.focus('assembled');
    if (returnMode === 'cancel') { challenge = null; toast('挑战已结束，整车已归位'); }
    else toast(`装配完成 · ${challenge.total.toLocaleString()} 件全部归位`, 5500);
    refreshChallenge(); syncStages();
  }
  if (!pendingOperation) return;
  if (pendingOperation.stage === 'closing') {
    if (powertrain.state.phase !== 'off' || Object.values(view.opens).some(value => value > .025)) return;
    powertrain.setGear('N');
    const { kind, value, focus } = pendingOperation;
    if (kind === 'challenge') {
      view.setExplode(3); view.focus('parts'); pendingOperation.stage = 'spreading';
    } else {
      view.setExplode(value);
      if (focus) view.focus(value > 2.3 ? 'parts' : value > .3 ? 'exploded' : 'assembled');
      pendingOperation = null;
    }
  }
  if (pendingOperation?.stage === 'spreading' && view.explode > 2.999) {
    pendingOperation = null; createChallenge();
  }
}

async function engineToggle() {
  if (!ready || ignitionPending) return;
  if (!availability().ignition) { toast('待整车归位、拆装结束后再启动'); return; }
  ignitionPending = true;
  try {
    await audio.unlock();
    if (!availability().ignition) return;
    releasePedals();
    if (powertrain.state.phase === 'off') {
      powertrain.start(); toast('引擎正在启动 · E 升挡，按住 W 加速');
    } else {
      powertrain.stop(); toast('引擎正在熄火，车轮减速停止');
    }
  } finally {
    ignitionPending = false; refreshUI();
  }
}

function setGear(value) {
  if (!availability().gear) { refreshUI(); return; }
  if (powertrain.setGear(value)) audio.playShift();
  else if (powertrain.state.shiftRejected) {
    toast(({ 'direction-change': '请先制动停车，再切换前进或倒挡',
      'over-rev': '车速过高，先减速再降挡', 'engine-transition': '请等待引擎启动或停止',
      'invalid-gear': '挡位无效' })[powertrain.state.shiftReason] || '暂时无法换挡');
  }
  refreshUI();
}
binding('engine-toggle', 'click', engineToggle);
binding('gear-select', 'change', e => setGear(e.target.value));
binding('throttle', 'input', e => {
  powertrain.setThrottle(availability().throttle ? Number(e.target.value) / 100 : 0);
  refreshUI();
});
binding('brake-toggle', 'click', () => {
  if (!availability().brake) return;
  powertrain.setBrake(powertrain.state.brake ? 0 : 1); refreshUI();
});
binding('sound-toggle', 'click', async () => {
  await audio.unlock();
  audio.setMuted(!audio.muted); toggle('sound-toggle', !audio.muted);
  $('audio-label').textContent = audio.muted ? '声音关闭' : '声音开启';
});
binding('volume', 'input', e => audio.setVolume(Number(e.target.value) / 100));

for (const [id, key] of lightButtons) {
  binding(id, 'click', () => {
    if (!ready || (key !== 'night' && !availability().lights)) return;
    const enabled = !view.lightState[key]; view.setLight(key, enabled); toggle(id, enabled);
    if (key === 'night') document.documentElement.classList.toggle('is-night', enabled);
  });
}
for (const [id, key] of accessButtons) {
  binding(id, 'click', () => {
    if (!availability().access) return;
    releasePedals();
    const open = view.openTargets[key] < .5;
    if (open && view.cameraMode === 'cockpit') {
      view.focus(key === 'roof' || key === 'leftDoor' || key === 'rightDoor' ? 'interior-detail' : key === 'rearHood' ? 'rear' : 'assembled');
    }
    view.setOpen(key, open); toggle(id, open);
    if (key === 'roof' && open) view.focus('interior-detail');
    refreshUI();
  });
}
binding('explode-slider', 'input', e => setExplode(Number(e.target.value), false));
binding('explode-slider', 'change', e => setExplode(Number(e.target.value)));
for (const button of document.querySelectorAll('[data-explode]')) button.addEventListener('click', () => setExplode(Number(button.dataset.explode)));
binding('challenge-start', 'click', async () => { await audio.unlock(); beginChallenge(); });
binding('challenge-shuffle', 'click', beginChallenge);
binding('challenge-cancel', 'click', () => endChallenge());
binding('challenge-next', 'click', () => {
  const part = view.byId.get(challenge?.nextId);
  if (part) { view.select(part); view.focusPart(part); toast(`目标编号 #${challenge.expectedNumber} · 点击零件或编号装回`); }
});
binding('challenge-submit', 'click', () => {
  if (!challenge) return;
  const id = challenge.idForNumber(Number($('challenge-search').value));
  if (id) install(id); else toast('输入当前回合的有效零件编号');
});
binding('challenge-search', 'keydown', e => { if (e.key === 'Enter') $('challenge-submit').click(); });
binding('challenge-auto', 'click', () => {
  if (!challenge || challenge.complete || returning || pendingOperation) return;
  autoAssemble = !autoAssemble; autoClock = 0;
  if (autoAssemble) view.focus('parts');
  refreshChallenge();
});
const speedField = document.createElement('label');
speedField.className = 'assembly-speed-field';
speedField.innerHTML = '<span>回装速度</span><select id="assembly-speed" aria-label="自动回装速度"><option value="3">慢速 · 3 件/秒</option><option value="15" selected>标准 · 15 件/秒</option><option value="60">快速 · 60 件/秒</option></select>';
$('challenge-auto').after(speedField);

binding('rotate-toggle', 'click', () => {
  if (!ready || view.cameraMode === 'cockpit') return; view.controls.autoRotate = !view.controls.autoRotate;
  toggle('rotate-toggle', view.controls.autoRotate); view.cameraTransition = null;
});
function resetView() {
  if (view?.cameraMode === 'cockpit') { view.focus('interior'); refreshCameraUI(); return; }
  view?.focus((challenge && !completeHandled && !returning) || view?.targetExplode > 2.3
    ? 'parts' : view?.targetExplode > .3 ? 'exploded' : 'assembled');
  refreshCameraUI();
}
binding('reset-view', 'click', resetView);
for (const [id, angle] of [['view-front', 'assembled'], ['view-rear', 'rear'], ['view-interior', 'interior']]) {
  binding(id, 'click', () => {
    if (!ready) return;
    if (angle === 'interior') {
      if (!enterDriverView(view, availability(), { releasePedals, onEntered() {
        selectPart(null); tab('drive');
      } })) {
        toast('请先完成拆装并恢复整车，再进入驾驶视角'); return;
      }
    }
    if (angle !== 'interior') view.focus(angle);
    refreshUI();
  });
}
binding('selected-close', 'click', () => selectPart(null));
binding('screenshot-btn', 'click', () => {
  if (!ready) return;
  view.renderer.render(view.scene, view.camera);
  const a = document.createElement('a'); a.download = '911-rsr-studio.png';
  a.href = view.renderer.domElement.toDataURL('image/png'); a.click();
  toast('视图已保存为 PNG');
});

function refreshCameraUI() {
  const cockpit = view?.cameraMode === 'cockpit';
  const currentView = view?.currentView || 'assembled';
  document.body.dataset.camera = cockpit ? 'cockpit' : 'exterior';
  document.querySelector('.stage').classList.toggle('is-cockpit', cockpit);
  $('driver-hint').hidden = !cockpit;
  $('canvas-hint-text').textContent = cockpit
    ? '拖动环顾 · 滚轮调整视野 · Home 回正'
    : '拖动旋转 · 滚轮缩放 · 点击查看零件';
  $('rotate-toggle').disabled = !ready || cockpit;
  $('reset-view').title = cockpit ? '回正驾驶视线（Home）' : '重置视角';
  $('reset-view').setAttribute('aria-label', cockpit ? '回正驾驶视线' : '重置视角');
  $('view-front').title = cockpit ? '退出座舱，返回外部视角' : '外部视角';
  for (const [id, selected] of [
    ['view-interior', cockpit],
    ['view-front', !cockpit && ['assembled', 'front'].includes(currentView)],
    ['view-rear', !cockpit && currentView === 'rear'],
  ]) {
    $(id).classList.toggle('is-active', selected);
    $(id).setAttribute('aria-pressed', String(selected));
    if (selected) $(id).setAttribute('aria-current', 'true');
    else $(id).removeAttribute('aria-current');
  }
}

function refreshUI() {
  const state = powertrain.state;
  const available = availability();
  $('rpm-value').textContent = Math.round(state.rpm).toLocaleString();
  $('speed-value').textContent = String(Math.round(Math.abs(state.speedKmh))).padStart(3, '0');
  $('gear-value').textContent = state.gear;
  $('rpm-fill').style.width = `${state.rpm / 7800 * 100}%`;
  const phases = { off: '引擎未启动', starting: '引擎启动中', running: state.gear === 'N' ? '引擎怠速 · 空挡' : `引擎运行 · ${state.gear === 'R' ? '倒挡' : `${state.gear} 挡`}`, stopping: '引擎停止中' };
  $('engine-status').textContent = phases[state.phase];
  toggle('engine-toggle', state.phase === 'running' || state.phase === 'starting');
  const text = $('engine-toggle').querySelector(':scope > span:nth-child(2)');
  if (text) text.textContent = state.phase === 'off' || state.phase === 'stopping' ? '启动引擎' : state.phase === 'starting' ? '正在启动…' : '关闭引擎';
  document.body.dataset.engine = state.phase;
  $('fps-value').textContent = lastFps ? Math.round(lastFps) : '—';
  $('gear-select').value = state.gear;
  $('throttle').value = Math.round(state.throttle * 100); paintRange($('throttle'));
  toggle('brake-toggle', state.brake > 0);
  $('engine-toggle').disabled = !available.ignition || ignitionPending;
  $('gear-select').disabled = !available.gear;
  $('throttle').disabled = !available.throttle;
  $('brake-toggle').disabled = !available.brake;
  for (const [id, key] of accessButtons) {
    $(id).disabled = !available.access; toggle(id, view?.openTargets[key] > .5);
  }
  for (const [id, key] of lightButtons) {
    $(id).disabled = key === 'night' ? !ready : !available.lights;
    toggle(id, !!view?.lightState[key]);
  }
  $('view-interior').disabled = !available.cockpit;
  toggle('rotate-toggle', !!view?.controls.autoRotate);
  refreshCameraUI();
  const activeChallenge = !!challenge && !completeHandled;
  const canDisassemble = available.disassembly && !pendingOperation && !returning;
  $('explode-slider').disabled = !canDisassemble || activeChallenge;
  for (const button of document.querySelectorAll('[data-explode]')) {
    button.disabled = !canDisassemble || (activeChallenge && button.dataset.explode !== '0');
  }
  $('challenge-start').disabled = !canDisassemble || activeChallenge;
  $('challenge-shuffle').disabled = !canDisassemble;
  $('challenge-cancel').disabled = returning || !!pendingOperation;
  const note = !ready ? '正在载入模型…' : returning ? '正在归位，完成后即可驾驶。'
    : pendingOperation ? '正在停机、闭合车身并准备零件…'
      : activeChallenge ? '装配进行中，按目标编号回装，或结束挑战恢复整车。'
        : !available.whole ? '拆解展示中，恢复整车后即可驾驶。'
          : !available.stationary ? '车轮转动中，制动停车后可打开车身或拆解。'
            : !available.accessClosed ? '车身已打开，闭合车门、舱盖和车顶后可加油门。' : '';
  $('workshop-status').textContent = note;
  $('workshop-status').hidden = !note;
  syncStages();
}

function frame(now) {
  requestAnimationFrame(frame);
  const wallSeconds = Math.max(0, (now - frameTime) / 1000);
  const dt = Math.min(.08, wallSeconds); frameTime = now;
  if (!ready) return;
  if (!availability().throttle && powertrain.state.throttle) powertrain.setThrottle(0);
  const state = powertrain.update(dt);
  audio.update(state, dt);
  if (autoAssemble && challenge && !challenge.complete && view.explode > 2.97) {
    autoClock += dt;
    const interval = 1 / Number($('assembly-speed').value);
    let steps = 0;
    while (autoClock >= interval && steps < 12 && !challenge.complete) {
      autoClock -= interval; install(challenge.nextId, true); steps++;
    }
  }
  view.update(dt, state);
  processWorkshop();
  fpsFrames++; fpsSeconds += wallSeconds;
  if (fpsSeconds > .7) {
    sampledFrames = fpsFrames; sampledSeconds = fpsSeconds;
    lastFps = fpsFrames / fpsSeconds; averageFrameMs = fpsSeconds * 1000 / fpsFrames;
    fpsFrames = 0; fpsSeconds = 0;
  }
  uiClock += dt; if (uiClock > .11) { uiClock = 0; refreshUI(); }
}

keyboard = bindDrivingKeyboard({ target: window, document, enabled: () => ready,
  onPedals({ throttle, brake }) {
    const allowed = availability();
    powertrain.setThrottle(allowed.throttle ? throttle : 0);
    powertrain.setBrake(allowed.brake ? brake : 0);
    if (ready) refreshUI();
  },
  onAction(action) {
    if (action === 'ignition') engineToggle();
    else if (action === 'resetView') resetView();
    else if (action === 'clearSelection') selectPart(null);
    else if (action === 'neutral') setGear('N');
    else if (action === 'reverse') setGear('R');
    else {
      const gears = ['R', 'N', '1', '2', '3', '4', '5', '6'];
      const index = gears.indexOf(powertrain.state.gear);
      setGear(gears[Math.max(0, Math.min(gears.length - 1, index + (action === 'shiftUp' ? 1 : -1)))]);
    }
  },
});
window.addEventListener('error', e => errors.push(e.message));
window.addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
window.addEventListener('pagehide', () => { keyboard.dispose(); audio.dispose(); }, { once: true });
document.addEventListener('visibilitychange', () => {
  frameTime = performance.now(); fpsFrames = 0; fpsSeconds = 0;
});

try {
  view = new CarScene($('viewport'), {
    onSelect: selectPart,
    onProgress: p => {
      $('loading-bar').style.width = `${Math.min(93, 8 + p * 85)}%`;
      $('loading-text').textContent = p > .95 ? '整理机械部件与表面材质' : `载入模型 · ${Math.round(p * 100)}%`;
    },
  });
  requestAnimationFrame(frame);
  const loaded = await view.load();
  ready = true;
  $('part-count').textContent = loaded.pieces.toLocaleString();
  $('loading-bar').style.width = '100%'; $('loading-overlay').hidden = true;
  refreshUI();
  const announce = new URLSearchParams(location.search).get('demo');
  if (announce === 'interior') $('view-interior').click();
} catch (error) {
  errors.push(String(error)); console.error(error);
  $('loading-text').textContent = `模型加载失败：${error.message}`;
  $('loading-overlay').classList.add('has-error');
  const retry = document.createElement('button'); retry.textContent = '重新加载'; retry.className = 'primary-button';
  retry.addEventListener('click', () => location.reload()); $('loading-overlay').append(retry);
}

// Read-only diagnostics support repeatable browser verification of actual controls.
window.__RSR__ = {
  get ready() { return ready; },
  snapshot() {
    return { ready, activeTab, drive: { ...powertrain.state }, audio: audio.getMetrics(),
      performance: { fps: lastFps, averageFrameMs, sampledFrames, sampledSeconds },
      view: view?.getMetrics(), challenge: challenge?.snapshot({ includeOrder: true }) || null,
      autoAssemble, controls: { availability: availability(), preparing: !!pendingOperation,
        returning, pendingOperation: pendingOperation ? { ...pendingOperation } : null,
        ...keyboard.snapshot() }, errors: [...errors] };
  },
  part(id) { return view?.getPartSnapshot(id) || null; },
  projectPart(id) {
    const part = view?.byId.get(id);
    if (!part) return null;
    const p = view.partBox(part).getCenter(new (view.camera.position.constructor)()).project(view.camera);
    const rect = view.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x * .5 + .5) * rect.width, y: rect.top + (-p.y * .5 + .5) * rect.height };
  },
};
