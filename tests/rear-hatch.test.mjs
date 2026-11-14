import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {PartMotionPlan} from '../src/part-motion.js';

const manifest=JSON.parse(readFileSync(new URL('../public/assets/car-manifest.json',import.meta.url)));
const source=JSON.parse(readFileSync(new URL('./fixtures/rear-hatch-source.json',import.meta.url)));
const byId=new Map(manifest.parts.map(p=>[p.id,p]));
const plan=new PartMotionPlan(manifest);
const poseMatrix=pose=>new THREE.Matrix4().compose(new THREE.Vector3(...pose.position),
  new THREE.Quaternion(...pose.quaternion).normalize(),new THREE.Vector3(...pose.scale));
function motion(id,state={}){
  const base=poseMatrix(byId.get(id).assembled);
  return poseMatrix(plan.getPartPose(id,state)).multiply(base.invert());
}
const centre=(id,state)=>new THREE.Vector3(...byId.get(id).center).applyMatrix4(motion(id,state));
const opened={opens:{rearHood:1}};

test('the central wide rear deck opens while its side fairings, window pillars and tail wing remain attached',()=>{
  for(const id of ['P1507','P1517']){
    assert(byId.get(id).size[0]>.085,'the hatch must span the central rear opening');
    assert(centre(id,opened).y-centre(id).y>.015,`${id}: central deck did not rise`);
  }
  const fixed=['P1170','P1175','P1552','P1556','P1553','P1554','P1487','P1533','P1495',
    ...manifest.parts.filter(p=>p.group==='10_Rear_wing').map(p=>p.id)];
  for(const id of fixed){
    const delta=motion(id,opened).elements;
    new THREE.Matrix4().elements.forEach((value,index)=>assert(Math.abs(value-delta[index])<1e-8,`${id}: fixed part moved`));
  }
});

test('every part in the original roof3 submodel uses the same rigid rear-hatch motion',()=>{
  assert.equal(source.parts.length,24);
  const deck=motion('P1507',opened);
  for(const record of source.parts){
    assert.equal(byId.get(record.id).partId,record.partId,`${record.id}: source identity changed`);
    const moved=motion(record.id,opened);
    deck.elements.forEach((value,index)=>assert(Math.abs(value-moved.elements[index])<1e-8,`${record.id}: hatch assembly tore apart`));
  }
  for(const id of ['I34d63fd9c4b5','I041763b4b64c']){
    const moved=motion(id,opened);
    deck.elements.forEach((value,index)=>assert(Math.abs(value-moved.elements[index])<1e-8,`${id}: fitted pane detached from cover`));
  }
});

test('the actual transverse pin-joiner line stays fixed throughout the hinge movement',()=>{
  for(const amount of [.2,.5,1])for(const id of ['P1496','P1500','P1503','P1506']){
    assert(centre(id,{opens:{rearHood:amount}}).distanceTo(centre(id))<1e-7,`${id}: hinge pivot drift`);
  }
  assert(plan.rearCover.pivot.z<-.11&&plan.rearCover.pivot.z>-.12);
});

test('rear hatch compatibility key, roof lift and closed pose compose without moving the side trim',()=>{
  const cover=plan.getPartPose('P1507',opened);
  assert.deepEqual(plan.getPartPose('P1507',{opens:{rearCover:1}}),cover);
  const lifted=plan.getPartPose('P1507',{opens:{rearHood:1,roof:1}});
  assert(Math.abs(lifted.position[1]-cover.position[1]-.115)<1e-9);
  for(const {id} of source.parts){
    const restored=plan.getPartPose(id,{opens:{rearHood:0}});
    assert(new THREE.Vector3(...restored.position).distanceTo(new THREE.Vector3(...byId.get(id).assembled.position))<1e-10);
  }
});
