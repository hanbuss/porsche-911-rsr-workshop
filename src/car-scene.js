import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PartMotionPlan } from './part-motion.js';
import { prepareWebSurfaces } from './web-surfaces.js';
import { VehicleLighting } from './vehicle-lighting.js';
import { DriverCamera } from './driver-camera.js';

const V = (a = [0, 0, 0]) => new THREE.Vector3(...a);
const Q = (a = [0, 0, 0, 1]) => new THREE.Quaternion(...a);
const clamp = THREE.MathUtils.clamp;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const damping = (value, target, dt, rate = 7) => THREE.MathUtils.lerp(value, target, 1 - Math.exp(-rate * dt));
const axes = { x: V([1, 0, 0]), y: V([0, 1, 0]) };

export const GROUP_NAMES = {
  '01_Chassis_and_transmission': '底盘与传动', '02_Flat_six_engine': '水平对置六缸',
  '03_Front_axle_and_steering': '前桥与转向', '07_Cockpit': '驾驶舱',
  '08_Roof_and_rollcage': '车顶与防滚架', '09_Rear_bumper': '后保险杠',
  '10_Rear_wing': '尾翼', '05_Hood': '前舱盖', '04_Front_bumper': '前保险杠',
  '06_Door_L': '右侧车门', '06_Door_R': '驾驶侧车门',
  '06_Body_panels_L': '右侧车身', '06_Body_panels_R': '驾驶侧车身',
  '05_Front_upper_panels': '前车身面板', '09_Rear_upper_panels': '后舱上盖',
  '12_Driver_leather': '驾驶位皮椅', '13_Passenger_seat': '副驾驶皮椅',
};
export const groupName = name => GROUP_NAMES[name]
  || (name?.includes('Wheel') ? `轮组 · ${name.includes('Front') ? '前' : '后'}${name.endsWith('R') ? '左' : '右'}`
    : name?.includes('Shock') ? '独立悬挂' : name?.includes('Headlight') ? '前灯组' : name);
export function partName(part) {
  if (part.meta.role?.startsWith('seat_')) return `${part.meta.name.includes('Passenger') ? '副驾驶' : '驾驶位'} · ${({
    seat_cushion: '皮质坐垫', seat_backrest: '皮质靠背', seat_headrest: '头枕', seat_bolster: '侧翼',
    seat_stitching: '缝线', seat_piping: '滚边', seat_mount: '滑轨', seat_pan: '椅盆',
  })[part.meta.role] || '座椅部件'}`;
  if (part.meta.role === 'window_glass') return '车窗玻璃';
  if (part.meta.role?.startsWith('steering_')) return '方向盘 · ' + part.meta.name.split('|').at(-1).trim();
  if (part.meta.role === 'digital_cluster') return '电子仪表部件';
  const id = part.meta.partId || '';
  const raw = part.meta.name || '';
  if (/Tyre/i.test(raw)) return '橡胶轮胎';
  if (/Rim/i.test(raw)) return '六辐轮毂';
  if (/Pin/i.test(raw)) return `连接销 ${id}`;
  if (/Beam/i.test(raw)) return `Technic 结构梁 ${id}`;
  if (/Panel/i.test(raw)) return `车身面板 ${id}`;
  if (/Gear/i.test(raw)) return `传动齿轮 ${id}`;
  if (/Axle/i.test(raw)) return `轴与连接件 ${id}`;
  return raw.replace(/^P\d+_\S+_/, '').replace(/^INT\s*\|\s*/, '').slice(0, 62);
}

export class CarScene {
  constructor(container, { onSelect, onHover, onProgress } = {}) {
    this.container = container; this.onSelect = onSelect; this.onHover = onHover; this.onProgress = onProgress;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, .003, 50);
    this.camera.position.set(.68, .40, .79);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.85));
    this.renderer.setClearColor(0xf2f1ed, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .92;
    this.renderer.domElement.setAttribute('aria-label', '911 RSR 交互三维模型，可旋转、缩放和点击零件');
    this.renderer.domElement.tabIndex = 0;
    container.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = .085;
    this.controls.minDistance = .07; this.controls.maxDistance = 6;
    this.controls.maxPolarAngle = Math.PI * .79;
    this.controls.target.set(0, .072, 0);
    this.controls.autoRotateSpeed = .38;
    this.controls.addEventListener('start', () => { this.cameraTransition = null; });
    this.cameraMode = 'orbit'; this.currentView = 'assembled';
    this.driverCamera = new DriverCamera(this.camera);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, .025).texture;
    this.scene.environmentIntensity = .58;
    room.dispose(); pmrem.dispose();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x56565c, .85); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff7ed, 1.9); this.key.position.set(-.8, 1.4, 1.1); this.scene.add(this.key);
    this.fill = new THREE.DirectionalLight(0xe8eeff, .55); this.fill.position.set(.8, .7, -.8); this.scene.add(this.fill);
    this.makeGround();
    this.car = new THREE.Group(); this.car.name = 'Current Blender model'; this.scene.add(this.car);
    this.parts = []; this.byId = new Map(); this.roots = []; this.pickables = []; this.batches = [];
    this.explode = 0; this.targetExplode = 0; this.wheelAngle = 0; this.engineAngle = 0;
    this.opens = { leftDoor: 0, rightDoor: 0, hood: 0, rearHood: 0, roof: 0 };
    this.openTargets = { ...this.opens };
    this.lightState = { headlights: false, taillights: false, hazards: false, night: false };
    this.challenge = null; this.challengeMix = 0; this.installedAmounts = new Map(); this.selected = null;
    this.bounds = new THREE.Box3(); this.labelNodes = new Map();
    this.poseContext = {};
    this.selectionBox = new THREE.Box3Helper(new THREE.Box3(), 0xc82c36);
    this.selectionBox.material.depthTest = false; this.selectionBox.material.transparent = true;
    this.selectionBox.material.opacity = .78; this.selectionBox.renderOrder = 10;
    this.selectionBox.visible = false; this.scene.add(this.selectionBox);
    this.labels = document.createElement('div'); this.labels.className = 'scene-labels'; container.append(this.labels);
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
    this.bindPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.resize();
  }

  makeGround() {
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12),
      new THREE.MeshStandardMaterial({ color: 0xcccfc9, roughness: .88, metalness: 0 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -.0014;
    this.scene.add(this.ground);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 3, 128, 128, 128);
    g.addColorStop(0, 'rgba(22,27,31,.30)'); g.addColorStop(.45, 'rgba(22,27,31,.16)'); g.addColorStop(1, 'rgba(22,27,31,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(.5, .82),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = -.0005; this.scene.add(this.shadow);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x8b8e8a, transparent: true, opacity: .18 });
    const marks = new THREE.Group(); marks.name = 'Studio registration marks';
    for (const x of [-.16, .16]) for (const z of [-.3, .3]) {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        V([x - .009, 0, z]), V([x + .009, 0, z]), V([x, 0, z]), V([x, 0, z - .009]), V([x, 0, z + .009]),
      ]), lineMat); marks.add(line);
    }
    this.scene.add(marks); this.groundMarks = marks;
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, rect.width); this.height = Math.max(1, rect.height);
    this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  async load() {
    const manifestPromise = fetch(`${import.meta.env.BASE_URL}assets/car-manifest.json`)
      .then(r => { if (!r.ok) throw new Error('零件清单载入失败'); return r.json(); });
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const assetUrl = `${import.meta.env.BASE_URL}assets/car.glb`;
    const [manifest, gltf] = await Promise.all([
      manifestPromise,
      loader.loadAsync(assetUrl, e => this.onProgress?.(e.total ? e.loaded / e.total : .35)),
    ]);
    this.manifest = manifest;
    this.motionPlan = new PartMotionPlan(manifest);
    const nodes = new Map();
    gltf.scene.traverse(o => { if (o.userData.web_id) nodes.set(String(o.userData.web_id), o); });
    for (const meta of manifest.parts) {
      const node = nodes.get(String(meta.id)) || gltf.scene.getObjectByName(meta.nodeName);
      if (!node) throw new Error(`缺少模型部件 ${meta.id}`);
      const anchor = new THREE.Group(); anchor.name = meta.id;
      node.removeFromParent(); node.position.set(0, 0, 0); node.quaternion.identity(); node.scale.set(1, 1, 1);
      node.updateMatrix();
      anchor.add(node); this.car.add(anchor);
      const part = { id: String(meta.id), meta: { ...meta, group: this.motionPlan.groupFor(meta.id) }, root: anchor, node,
        a: V(meta.assembled.position), aq: Q(meta.assembled.quaternion), as: V(meta.assembled.scale),
        e: V(meta.exploded?.position || meta.assembled.position),
        b: V(meta.board?.position || meta.assembled.position),
        bq: Q(meta.board?.quaternion || meta.assembled.quaternion),
        bs: V(meta.board?.scale || meta.assembled.scale),
        center: V(meta.center || meta.assembled.position), size: V(meta.size || [.004, .004, .004]),
        meshes: [], owner: null };
      anchor.position.copy(part.a); anchor.quaternion.copy(part.aq); anchor.scale.copy(part.as);
      node.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.userData.partId = part.id; mesh.frustumCulled = true;
        mesh.castShadow = false; mesh.receiveShadow = false;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          material.envMapIntensity = .7;
          if (material.transparent) { material.depthWrite = false; material.polygonOffset = true; material.polygonOffsetFactor = -1; }
        }
        part.meshes.push(mesh);
      });
      this.parts.push(part); this.byId.set(part.id, part);
    }
    this.car.updateMatrixWorld(true);
    for (const part of this.parts) {
      const parent = this.byId.get(String(part.meta.ownerId));
      if (!parent || parent === part) continue;
      parent.root.attach(part.root); part.owner = parent;
    }
    this.roots = this.parts.filter(p => !p.owner);
    this.groupBounds = new Map();
    for (const part of this.roots) {
      const name = part.meta.group;
      if (!this.groupBounds.has(name)) this.groupBounds.set(name, new THREE.Box3());
      this.groupBounds.get(name).expandByPoint(part.center.clone().sub(part.size.clone().multiplyScalar(.5)));
      this.groupBounds.get(name).expandByPoint(part.center.clone().add(part.size.clone().multiplyScalar(.5)));
    }
    this.wheelCenters = new Map();
    for (const [group, box] of this.groupBounds) if (group.includes('Wheel')) this.wheelCenters.set(group, box.getCenter(new THREE.Vector3()));
    this.doorPivots = {};
    for (const [key, group] of [['leftDoor', '06_Door_R'], ['rightDoor', '06_Door_L']]) {
      const box = this.groupBounds.get(group);
      if (box) this.doorPivots[key] = V([(box.min.x + box.max.x) / 2, box.min.y + .013, box.max.z - .008]);
    }
    const hoodBounds = this.groupBounds.get('05_Hood');
    this.hoodPivot = hoodBounds ? V([0, hoodBounds.min.y, hoodBounds.min.z]) : V([0, .10, .072]);
    for (const hint of manifest.hints?.wheels || []) this.wheelCenters.set(hint.group, V(hint.center));
    for (const hint of manifest.hints?.doors || []) this.doorPivots[hint.group.endsWith('R') ? 'leftDoor' : 'rightDoor'] = V(hint.pivot);
    const hoodHint = manifest.hints?.hoods?.find(h => h.name === 'frontHood');
    if (hoodHint) this.hoodPivot = V(hoodHint.pivot);
    this.rearCoverPivot = V(manifest.hints?.hoods?.find(h => h.name === 'rearCover')?.pivot || [0, .116, -.10]);
    this.surfaceReport = await prepareWebSurfaces(this.parts, this.renderer, {
      assetBase: `${import.meta.env.BASE_URL}assets/`,
    });
    this.makeDashboard();
    this.makeLightRig();
    this.makeBatches();
    this.animateParts(0, { rpm: 0, wheelAngularVelocity: 0 });
    this.ready = true;
    this.focus('assembled', true);
    return { parts: this.parts.length, pieces: this.roots.length, batches: this.batches.length, manifest };
  }

  makeDashboard() {
    const id = this.manifest.hints?.display?.[0];
    const display = this.byId.get(id);
    if (!display) return;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
    this.dashboardCanvas = canvas; this.dashboardTexture = new THREE.CanvasTexture(canvas);
    this.dashboardTexture.colorSpace = THREE.SRGBColorSpace; this.dashboardTexture.flipY = false;
    for (const mesh of display.meshes) {
      mesh.material = mesh.material.clone(); mesh.material.map = this.dashboardTexture;
      mesh.material.emissiveMap = this.dashboardTexture; mesh.material.emissive.set(0xffffff); mesh.material.emissiveIntensity = .35;
      mesh.material.needsUpdate = true;
    }
    this.dashboardStamp = 0;
  }

  updateDashboard(state) {
    if (!this.dashboardCanvas || performance.now() - this.dashboardStamp < 120) return;
    this.dashboardStamp = performance.now();
    this.dashboardState={phase:state.phase,gear:state.gear,rpm:Math.round(state.rpm),
      speedKmh:Math.round(Math.abs(state.speedKmh))};
    const ctx = this.dashboardCanvas.getContext('2d'), w = this.dashboardCanvas.width;
    ctx.fillStyle = '#10161b'; ctx.fillRect(0, 0, w, 512);
    ctx.fillStyle = '#dce4e7'; ctx.font = 'bold 35px Arial'; ctx.fillText('WORKSHOP  /  DIGITAL COCKPIT', 32, 53);
    ctx.fillStyle = state.phase === 'running' ? '#80c9a6' : '#757b80';
    ctx.font = '20px Arial'; ctx.fillText(state.phase === 'running' ? 'ENGINE ON' : 'STANDBY', 822, 49);
    for (let i = 0; i < 48; i++) {
      ctx.fillStyle = i < state.rpm / 7800 * 48 ? i > 38 ? '#ee3f47' : '#e5eef2' : '#344048';
      ctx.fillRect(33 + i * 20, 83, 15, 27);
    }
    ctx.fillStyle = '#85959c'; ctx.font = '22px Arial'; ctx.fillText('GEAR', 34, 166); ctx.fillText('KM/H', 562, 370);
    ctx.fillStyle = '#f4f6f7'; ctx.font = 'bold 150px Arial'; ctx.fillText(state.gear, 43, 329);
    ctx.font = 'bold 178px monospace'; ctx.fillText(String(Math.round(Math.abs(state.speedKmh))).padStart(3, '0'), 296, 327);
    ctx.fillStyle = '#99a8ae'; ctx.font = '24px Arial';
    ctx.fillText(`ENGINE  ${Math.round(state.rpm)} RPM`, 33, 446);
    ctx.fillText('WATER  82°', 525, 446); ctx.fillText('OIL  93°', 800, 446);
    this.dashboardTexture.needsUpdate = true;
  }

  makeBatches() {
    const candidates = new Map();
    for (const part of this.parts) for (const mesh of part.meshes) {
      if (Array.isArray(mesh.material) || mesh.material.transparent || mesh.material.transmission > 0) continue;
      const key = `${mesh.geometry.uuid}|${mesh.material.uuid}`;
      if (!candidates.has(key)) candidates.set(key, []);
      candidates.get(key).push(mesh);
    }
    for (const meshes of candidates.values()) {
      if (meshes.length < 3) continue;
      const instance = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
      instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instance.frustumCulled = false; instance.name = 'Repeated mechanical parts';
      instance.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
      instance.userData.partIds = meshes.map(o => o.userData.partId);
      this.scene.add(instance);
      for (const mesh of meshes) { mesh.visible = false; mesh.userData.batched = true; }
      this.batches.push({ instance, meshes });
    }
    this.pickables = this.parts.flatMap(p => p.meshes.filter(m => !m.userData.batched));
    this.pickables.push(...this.batches.map(b => b.instance));
    this.updateBatches();
  }

  updateBatches() {
    this.car.updateMatrixWorld(true);
    for (const { instance, meshes } of this.batches) {
      for (let i = 0; i < meshes.length; i++) instance.setMatrixAt(i, meshes[i].matrixWorld);
      instance.instanceMatrix.needsUpdate = true;
    }
  }

  makeLightRig() {
    this.lighting = new VehicleLighting(this.scene, this.byId, this.manifest.hints);
    this.lightRig = this.lighting.root;
    this.frontLamps = this.lighting.front.flatMap(lamp => lamp.bulbs);
    this.rearLamps = this.lighting.rear;
    this.hazardLamps = this.lighting.indicators;
  }

  setExplode(value) { this.targetExplode = clamp(value, 0, 3); }
  setOpen(key, value) { if (key in this.openTargets) this.openTargets[key] = value ? 1 : 0; }
  setLight(key, value) {
    this.lightState[key] = !!value;
    if (key === 'night') this.ground.material.color.set(value ? 0x30343a : 0xcccfc9);
  }
  setChallenge(challenge) {
    this.challenge = challenge;
    this.installedAmounts.clear();
    if (challenge) this.targetExplode = 3;
    else this.clearLabels();
  }

  finishAssembly() {
    // The installed parts are already at their assembly poses. Clearing the
    // challenge must not put them back at the previous full-disassembly stage.
    this.explode = 0;
    this.targetExplode = 0;
    this.setChallenge(null);
  }

  animateParts(dt, state) {
    const elapsed = Number.isFinite(dt) ? Math.max(0,dt) : 0;
    this.explode = damping(this.explode, this.targetExplode, elapsed, 4.8);
    if (Math.abs(this.explode-this.targetExplode)<.0001) this.explode=this.targetExplode;
    for (const key of Object.keys(this.opens)) this.opens[key] = damping(this.opens[key], this.openTargets[key], elapsed);
    this.challengeMix = damping(this.challengeMix, this.challenge ? 1 : 0, dt || 1, 5);
    this.wheelAngle = Number.isFinite(state.wheelAngle) ? state.wheelAngle : this.wheelAngle + (state.wheelAngularVelocity || 0) * dt;
    this.engineAngle += (state.rpm || 0) / 60 * Math.PI * 2 * elapsed;
    const globalPartMix = smooth(this.explode - 2);
    let allInstalled = true;
    const context=this.poseContext;
    context.explode=this.explode;context.opens=this.opens;
    context.wheelAngle=this.wheelAngle;context.engineAngle=this.engineAngle;
    for (const p of this.roots) {
      context.installAmount=undefined;
      if (this.challenge) {
        const installed=this.challenge.installed.has(p.id);
        let amount=damping(this.installedAmounts.get(p.id)||0, installed ? 1:0, elapsed,7);
        if (installed && 1-amount<.0001) amount=1;
        this.installedAmounts.set(p.id,amount);
        allInstalled &&= amount===1;
        context.installAmount=amount;
      }
      this.motionPlan.applyToObject(p.id,p.root,context);
    }
    this.allInstalled = allInstalled;
    this.car.updateMatrixWorld(true);
    this.updateBatches();
    this.shadow.material.opacity = 1 - globalPartMix * .55;
    this.groundMarks.visible = this.explode < .4;
    const night = this.lightState.night ? 1 : 0;
    this.scene.environmentIntensity = damping(this.scene.environmentIntensity, night ? .09 : .58, elapsed, 3);
    this.hemi.intensity = damping(this.hemi.intensity, night ? .16 : .85, elapsed, 3);
    this.key.intensity = damping(this.key.intensity, night ? .24 : 1.9, elapsed, 3);
    this.fill.intensity = damping(this.fill.intensity, night ? .12 : .55, elapsed, 3);
    this.lighting?.update(this.lightState,{brake:state.brake,explode:this.explode,time:performance.now()*.001});
    if (this.selected) {
      this.selectionBox.box.copy(this.partBox(this.selected)); this.selectionBox.visible = true;
    }
  }

  partBox(part) {
    const box = new THREE.Box3();
    part.root.traverse(o => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    return box;
  }

  update(dt, state) {
    if (!this.ready) return;
    this.animateParts(Math.min(dt, .10), state);
    this.updateDashboard(state);
    if (this.cameraTransition) {
      const t = smooth((performance.now() - this.cameraTransition.start) / this.cameraTransition.duration);
      this.camera.position.lerpVectors(this.cameraTransition.from, this.cameraTransition.to, t);
      this.controls.target.lerpVectors(this.cameraTransition.targetFrom, this.cameraTransition.targetTo, t);
      if (t >= 1) this.cameraTransition = null;
    }
    if(this.cameraMode==='cockpit') this.driverCamera.apply();
    else this.controls.update();
    this.updateLabels();
    this.renderer.render(this.scene, this.camera);
  }

  focus(view = 'assembled', instant = false) {
    this.currentView = view;
    if(view==='interior') {
      this.driverCamera ||= new DriverCamera(this.camera);
      this.cameraMode='cockpit';this.controls.enabled=false;
      this.controls.autoRotate=false;this.cameraTransition=null;
      this.driverCamera.reset();
      this.controls.target.copy(this.driverCamera.target);
      return;
    }
    this.setExteriorCamera();
    let target, position;
    const aspectFactor = Math.max(1, .95 / this.camera.aspect);
    if (view === 'parts') {
      const points = this.roots.flatMap(p => [p.b.clone().add(p.size.clone().multiplyScalar(.5)), p.b.clone().sub(p.size.clone().multiplyScalar(.5))]);
      const box = new THREE.Box3().setFromPoints(points); target = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()); const d = Math.max(size.x / this.camera.aspect, size.z) * 2.1;
      position = target.clone().add(V([0, d * 1.14, d * .35]));
    } else if (view === 'exploded') { target = V([0, .20, 0]); position = V([1.0, 1.0, 1.2]).multiplyScalar(aspectFactor); }
    else if (view === 'rear') { target = V([0, .072, -.015]); position = V([-.68, .36, -.75]).multiplyScalar(aspectFactor); }
    else if (view === 'front') { target = V([0, .075, .012]); position = V([0, .22, .86]).multiplyScalar(aspectFactor); }
    else if (view === 'interior-detail') { target = V([.004, .09, -.005]); position = V([.255, .235, .28]).multiplyScalar(aspectFactor); }
    else { target = V([0, .075, 0]); position = V([.49, .285, .59]).multiplyScalar(aspectFactor); }
    this.transitionCamera(position, target, instant);
  }

  focusPart(part, instant = false) {
    this.setExteriorCamera();this.currentView='part';
    const box = this.partBox(part); const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(box.getSize(new THREE.Vector3()).length(), .009);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this.transitionCamera(center.clone().addScaledVector(direction, Math.max(.078, size * 3.1)), center, instant);
  }

  transitionCamera(position, target, instant = false) {
    this.controls.autoRotate = false;
    if (instant) { this.camera.position.copy(position); this.controls.target.copy(target); this.controls.update(); return; }
    this.cameraTransition = { from: this.camera.position.clone(), to: position,
      targetFrom: this.controls.target.clone(), targetTo: target, start: performance.now(), duration: 850 };
  }

  setExteriorCamera() {
    this.cameraMode='orbit';this.controls.enabled=true;
    if(this.camera.fov!==34||this.camera.near!==.003){
      this.camera.fov=34;this.camera.near=.003;this.camera.updateProjectionMatrix();
    }
  }

  select(part) {
    this.selected = part;
    if (!part) { this.selectionBox.visible = false; return; }
    this.selectionBox.box.copy(this.partBox(part)); this.selectionBox.visible = true;
  }

  clearLabels() { for (const node of this.labelNodes.values()) node.remove(); this.labelNodes.clear(); }
  updateLabels() {
    if (!this.challenge) { if (this.labelNodes.size) this.clearLabels(); return; }
    const candidates = [];
    const targetId = this.challenge.nextId;
    for (const p of this.roots) {
      if (this.challenge.installed.has(p.id)) continue;
      const center = p.root.position.clone().add(p.center.clone().sub(p.a));
      const projected = center.clone().project(this.camera);
      if (Math.abs(projected.x) > .97 || Math.abs(projected.y) > .96 || projected.z < -1 || projected.z > 1) continue;
      candidates.push({ p, projected, distance: center.distanceToSquared(this.camera.position) });
    }
    candidates.sort((a, b) => (a.p.id === targetId ? -1 : b.p.id === targetId ? 1 : a.distance - b.distance));
    const chosen = candidates.slice(0, 24);
    const used = new Set();
    for (const { p, projected } of chosen) {
      used.add(p.id);
      let node = this.labelNodes.get(p.id);
      if (!node) {
        node = document.createElement('button'); node.className = 'part-number-badge';
        node.addEventListener('click', e => { e.stopPropagation(); this.onSelect?.(p); });
        this.labels.append(node); this.labelNodes.set(p.id, node);
      }
      const number = this.challenge.numberFor(p.id);
      node.textContent = String(number); node.setAttribute('aria-label', `装回零件 ${number}`);
      node.classList.toggle('is-target', p.id === targetId);
      node.style.transform = `translate(${(projected.x * .5 + .5) * this.width}px,${(-projected.y * .5 + .5) * this.height}px) translate(-50%,-50%)`;
    }
    for (const [id, node] of this.labelNodes) if (!used.has(id)) { node.remove(); this.labelNodes.delete(id); }
  }

  bindPointer() {
    const canvas = this.renderer.domElement;
    let down = null, lookPointer = null;
    canvas.addEventListener('pointerdown', e => {
      down = [e.clientX, e.clientY];
      if(this.cameraMode==='cockpit'&&e.button===0){
        lookPointer={id:e.pointerId,x:e.clientX,y:e.clientY};
        canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';
      }
    });
    canvas.addEventListener('pointerup', e => {
      if(lookPointer?.id===e.pointerId){
        lookPointer=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      }
      if(this.cameraMode==='cockpit'){canvas.style.cursor='grab';return;}
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const part = this.pick(e);
      if (part) this.onSelect?.(part);
    });
    canvas.addEventListener('pointercancel',()=>{lookPointer=null;down=null;});
    canvas.addEventListener('dblclick', e => {
      if(this.cameraMode==='cockpit'){this.driverCamera.reset();return;}
      const part = this.pick(e); if (part) this.focusPart(part);
    });
    canvas.addEventListener('wheel',e=>{
      if(this.cameraMode!=='cockpit')return;
      e.preventDefault();this.driverCamera.zoom(e.deltaY);
    },{passive:false});
    let last = 0;
    canvas.addEventListener('pointermove', e => {
      if(this.cameraMode==='cockpit'){
        if(lookPointer?.id===e.pointerId){
          this.driverCamera.look(e.clientX-lookPointer.x,e.clientY-lookPointer.y);
          lookPointer.x=e.clientX;lookPointer.y=e.clientY;
        }else canvas.style.cursor='grab';
        return;
      }
      if (performance.now() - last < 110 || e.buttons) return;
      last = performance.now(); const part = this.pick(e);
      canvas.style.cursor = part ? 'pointer' : 'grab'; this.onHover?.(part);
    });
  }

  pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    if (!hit) return null;
    const id = hit.object.isInstancedMesh ? hit.object.userData.partIds[hit.instanceId] : hit.object.userData.partId;
    let part = this.byId.get(id);
    while (part?.owner) part = part.owner;
    return part;
  }

  getMetrics() {
    return { ready: !!this.ready, nodes: this.parts.length, pieces: this.roots.length,
      batches: this.batches.length, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      explode: this.explode, targetExplode: this.targetExplode, allInstalled: !!this.allInstalled,
      wheelAngle: this.wheelAngle, opens: { ...this.opens }, openTargets: { ...this.openTargets },
      lights: { ...this.lightState }, headlightCount: this.frontLamps?.length || 0, taillightCount: this.rearLamps?.length || 0,
      lighting: this.lighting?.snapshot() || null,
      surfaces: this.surfaceReport ? { ...this.surfaceReport, heightMap: undefined } : null,
      exposure: this.renderer.toneMappingExposure, environmentIntensity: this.scene.environmentIntensity,
      camera: this.camera.position.toArray(), cameraMode:this.cameraMode,currentView:this.currentView,
      cameraTarget:(this.cameraMode==='cockpit'?this.driverCamera.target:this.controls.target).toArray(),
      cameraFov:this.camera.fov,cameraNear:this.camera.near,
      dashboard: this.dashboardState ? {...this.dashboardState} : null,
      rearHatch: this.motionPlan ? {partIds:[...this.motionPlan.rearCover.partIds],
        pivot:this.motionPlan.rearCover.pivot.toArray(),axis:this.motionPlan.rearCover.axis.toArray()} : null,
      selectedId: this.selected?.id || null };
  }

  getPartSnapshot(id) {
    const part = this.byId.get(id);
    if (!part) return null;
    part.root.updateWorldMatrix(true, false);
    const materials = [...new Set(part.meshes.flatMap(mesh =>
      Array.isArray(mesh.material) ? mesh.material : [mesh.material]))];
    return {
      id, group: part.meta.group, role: part.meta.role, ownerId: part.owner?.id || null,
      position: part.root.position.toArray(), quaternion: part.root.quaternion.toArray(),
      worldMatrix: part.root.matrixWorld.toArray(),
      materials: materials.map(material => ({ name: material.name, type: material.type,
        color: material.color?.toArray(), roughness: material.roughness, metalness: material.metalness,
        transmission: material.transmission, opacity: material.opacity, transparent: material.transparent,
        thickness: material.thickness, clearcoat: material.clearcoat, map: material.map?.name || null,
        leatherReliefApplied: !!material.userData.leatherReliefApplied,
      })),
    };
  }
}
