import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CarScene } from '../src/car-scene.js';
import { PartMotionPlan } from '../src/part-motion.js';

const manifest = JSON.parse(readFileSync(new URL('../public/assets/car-manifest.json', import.meta.url)));
const v = a => new THREE.Vector3(...a);
const q = a => new THREE.Quaternion(...a);
function sample(id, { explode = 0, hood = 0, wheelAngle = 0 } = {}) {
  const meta = manifest.parts.find(p => p.id === id);
  const root = new THREE.Group();
  const p = {
    id, meta, root,
    a: v(meta.assembled.position), aq: q(meta.assembled.quaternion), as: v(meta.assembled.scale),
    e: v(meta.exploded.position), b: v(meta.board.position),
    bq: q(meta.board.quaternion), bs: v(meta.board.scale),
  };
  const car = new THREE.Group();
  car.add(root);
  const camera = {
    motionPlan:new PartMotionPlan(manifest),poseContext:{},
    explode, targetExplode: explode, roots: [p], opens: { hood }, openTargets: { hood },
    challengeMix: 0, challenge: null, installedAmounts: new Map(),
    wheelCenters: new Map(manifest.hints.wheels.map(w => [w.group, v(w.center)])),
    hoodPivot: v(manifest.hints.hoods[0].pivot), rearCoverPivot: v(manifest.hints.hoods[1].pivot),
    doorPivots: {}, car, updateBatches() {}, lightState: { night: false },
    scene: { environmentIntensity: .82 }, hemi: { intensity: 2.05 }, key: { intensity: 2.4 }, fill: { intensity: 1.1 },
    shadow: { material: {} }, groundMarks: {}, frontLamps: [], rearLamps: [], hazardLamps: [],
    engineAngle: 0, wheelAngle: 0, selected: null,
  };
  CarScene.prototype.animateParts.call(camera, .01, { rpm: 0, wheelAngle });
  return { position: root.position, rotation: root.quaternion };
}

const fixedPillar = manifest.parts.find(p => p.id === 'P1553');
const pillarOpened = sample('P1553', { hood: 1 });
const pillarError = pillarOpened.position.distanceTo(v(fixedPillar.assembled.position));
const wheelA = sample('P1579', { wheelAngle: 1.2 });
const wheelB = sample('P1579', { wheelAngle: 1.2, explode: .2 });
const wheelRotationJump = wheelA.rotation.angleTo(wheelB.rotation);
const rightSupport = manifest.parts.find(p => p.id === 'P1271');
const supportOpened = sample('P1271', { hood: 1 });
const rightSupportUnmoved = supportOpened.position.distanceTo(v(rightSupport.assembled.position)) < 1e-8;
const checks = {
  rearWindowPillarMovedByHood: { observedMetres: pillarError, pass: pillarError < 1e-8 },
  stoppedWheelOrientationDuringDisassembly: { observedRadians: wheelRotationJump, pass: wheelRotationJump < 1e-8 },
  rightHoodSupportFollowsCover: { unchanged: rightSupportUnmoved, pass: !rightSupportUnmoved },
};
console.log(JSON.stringify({ checks, pass: Object.values(checks).every(c => c.pass) }, null, 2));
if (Object.values(checks).some(c => !c.pass)) process.exitCode = 1;
