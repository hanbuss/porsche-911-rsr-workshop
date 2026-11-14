import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CarScene } from '../src/car-scene.js';
import { PartMotionPlan } from '../src/part-motion.js';

test('assembly stays locked until actual render poses settle and clearing it never returns parts to the board',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/car-manifest.json',import.meta.url)));
  const meta=manifest.parts.find(p=>p.id==='P1259');
  const root=new THREE.Group();
  const car=new THREE.Group();car.add(root);
  const scene={
    explode:3,targetExplode:3,roots:[{id:meta.id,root}],opens:{},openTargets:{},
    challengeMix:1,challenge:{installed:new Set([meta.id])},installedAmounts:new Map([[meta.id,.997]]),
    motionPlan:new PartMotionPlan(manifest),poseContext:{},car,updateBatches(){},
    lightState:{night:false},scene:{environmentIntensity:.58},hemi:{intensity:.85},
    key:{intensity:1.9},fill:{intensity:.55},shadow:{material:{}},groundMarks:{},
    engineAngle:0,wheelAngle:0,selected:null,clearLabels(){},
    setChallenge:CarScene.prototype.setChallenge,
  };
  const state={rpm:0,wheelAngle:0};
  CarScene.prototype.animateParts.call(scene,.08,state);
  assert.equal(scene.allInstalled,false,'being close to the assembly pose must not unlock ignition');
  for(let i=0;i<30&&!scene.allInstalled;i++)CarScene.prototype.animateParts.call(scene,.08,state);
  assert.equal(scene.allInstalled,true);
  assert(root.position.distanceTo(new THREE.Vector3(...meta.assembled.position))<1e-10);
  const installedMatrix=root.matrixWorld.clone();
  CarScene.prototype.finishAssembly.call(scene);
  CarScene.prototype.animateParts.call(scene,.08,state);
  assert.equal(scene.challenge,null);
  assert.equal(scene.explode,0);
  assert.equal(scene.targetExplode,0);
  root.matrixWorld.elements.forEach((value,index)=>assert(Math.abs(value-installedMatrix.elements[index])<1e-10));
});
