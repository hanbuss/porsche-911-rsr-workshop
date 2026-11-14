import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PartMotionPlan } from '../src/part-motion.js';

const manifest = JSON.parse(readFileSync(new URL('../public/assets/car-manifest.json',import.meta.url)));
const plan = new PartMotionPlan(manifest);
const byId = new Map(manifest.parts.map(p => [p.id,p]));
const dist = (a,b) => new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
const angularError = (a,b) => new THREE.Quaternion(...a).angleTo(new THREE.Quaternion(...b));
const movedCenter = (meta,pose) => {
  const delta = new THREE.Quaternion(...pose.quaternion)
    .multiply(new THREE.Quaternion(...meta.assembled.quaternion).invert());
  return new THREE.Vector3(...meta.center).sub(new THREE.Vector3(...meta.assembled.position))
    .applyQuaternion(delta).add(new THREE.Vector3(...pose.position)).toArray();
};

test('a front cover opens as a symmetric assembly with its right-side supports', () => {
  const left = plan.getPartPose('P1259',{ opens:{ hood:1 } });
  const right = plan.getPartPose('P1282',{ opens:{ hood:1 } });
  const support = plan.getPartPose('P1271',{ opens:{ hood:1 } });
  assert.equal(plan.groupFor('P1271'),'05_Hood');
  assert.ok(dist(support.position,byId.get('P1271').assembled.position)>.03);
  assert.ok(movedCenter(byId.get('P1259'),left)[1]>byId.get('P1259').center[1]+.02);
  assert.ok(Math.abs(left.position[1]-right.position[1])<.0001);
  assert.ok(Math.abs(left.position[2]-right.position[2])<.0001);
});

test('front cover and rear cover leave adjacent fixed window pillars in place', () => {
  for (const id of ['P1289','P1293','P1553','P1554']) {
    const pose=plan.getPartPose(id,{ opens:{ hood:1,rearCover:1 } });
    assert.ok(dist(pose.position,byId.get(id).assembled.position)<1e-9,id);
  }
  const cover=plan.getPartPose('P1507',{ opens:{ rearCover:1 } });
  assert.ok(movedCenter(byId.get('P1507'),cover)[1]>byId.get('P1507').center[1]+.015);
  assert.ok(plan.rearCover.pivot.z<-.11);
});

test('each door opens outwards while retaining its own hinge', () => {
  for (const [id,key] of [['P0854','leftDoor'],['P1016','rightDoor']]) {
    const base=byId.get(id);
    const open=plan.getPartPose(id,{ opens:{ [key]:1 } });
    assert.ok(Math.abs(movedCenter(base,open)[0])>Math.abs(base.center[0])+.03);
    const door=plan.doors.get(base.group);
    const synthetic={...base,id:'synthetic',assembled:{...base.assembled,position:door.pivot.toArray()}};
    const local=new PartMotionPlan({...manifest,parts:[synthetic]});
    const pivot=local.getPartPose('synthetic',{ opens:{ [key]:1 } });
    assert.ok(dist(pivot.position,door.pivot.toArray())<1e-8);
  }
});

test('stopped wheel orientation survives all disassembly stages without a reverse jump', () => {
  const base=plan.getPartPose('P1579',{ wheelAngle:1.2 });
  for (const explode of [.001,.2,1,2,2.5,3]) {
    const current=plan.getPartPose('P1579',{ wheelAngle:1.2,explode });
    assert.ok(angularError(current.quaternion,base.quaternion)<1e-6,`${explode}`);
  }
});

test('engine pin and piston motions preserve rod length and calibrated rest pose', () => {
  const crankAxis=plan.crankAxis;
  const axisPoint=plan.crankAxisPoint;
  for (const angle of [0,.2,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI*2]) {
    const rotation=new THREE.Quaternion().setFromAxisAngle(crankAxis,angle);
    for (const id of manifest.hints.engine.pistonIds) {
      const engine=plan.engineParts.get(id);
      const piston=plan.getPartPose(id,{ engineAngle:angle });
      const rod=plan.getPartPose(engine.rod.meta.id,{ engineAngle:angle });
      assert.ok(Math.abs(dist(piston.position,rod.position)-engine.length)<1e-7);
      const expected=engine.rod.a.clone().sub(axisPoint).applyQuaternion(rotation).add(axisPoint);
      assert.ok(dist(rod.position,expected.toArray())<1e-8);
      if (angle===0) assert.ok(dist(piston.position,byId.get(id).assembled.position)<1e-8);
    }
  }
});

test('mechanical stages, full layout and reversed animation restore every real part', () => {
  for (const part of manifest.parts) {
    const baseline=plan.getPartPose(part.id);
    assert.ok(dist(baseline.position,part.assembled.position)<1e-8,part.id);
    const fullySeparated=plan.getPartPose(part.id,{ explode:3 });
    assert.ok(dist(fullySeparated.position,part.board.position)<1e-8,part.id);
    const reinstalled=plan.getPartPose(part.id,{ explode:3,installAmount:1 });
    assert.ok(dist(reinstalled.position,part.assembled.position)<1e-8,part.id);
    const reversed=plan.getPartPose(part.id,{ explode:0 });
    assert.ok(dist(reversed.position,baseline.position)<1e-9,part.id);
    assert.ok(angularError(reversed.quaternion,baseline.quaternion)<1e-6,part.id);
    for (const list of [fullySeparated.position,fullySeparated.quaternion,fullySeparated.scale]) {
      assert.ok(list.every(Number.isFinite),part.id);
    }
  }
});

test('fixed windows move with the roof only at the body disassembly stage', () => {
  const p=byId.get('P1553');
  const exploded=plan.getPartPose('P1553',{ explode:1 });
  const roofOffset=manifest.groups['08_Roof_and_rollcage'].explodeOffset;
  assert.ok(dist(exploded.position,p.assembled.position.map((v,i)=>v+roofOffset[i]))<1e-8);
});
