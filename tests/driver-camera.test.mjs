import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CarScene } from '../src/car-scene.js';

function fixture(){
  const camera=new THREE.PerspectiveCamera(34,1.2,.003,50);
  camera.position.set(.49,.285,.59);
  return Object.assign(Object.create(CarScene.prototype),{
    camera,controls:{enabled:true,autoRotate:true,target:new THREE.Vector3(0,.075,0),update(){}},
    opens:{leftDoor:0,rightDoor:0,hood:0,rearHood:0,roof:0},
    openTargets:{leftDoor:0,rightDoor:0,hood:0,rearHood:0,roof:0},
    roots:[],cameraMode:'orbit',
  });
}

test('entering the driver view places the camera inside the closed cabin facing forwards',()=>{
  const scene=fixture();scene.focus('interior',true);
  const eye=scene.camera.position;
  assert(eye.x>.02&&eye.x<.05,'eye must be at the driver seat, not outside the car');
  assert(eye.y>.10&&eye.y<.125,'eye must fit below the closed roof');
  assert(eye.z>-.04&&eye.z<-.01,'eye must sit behind the wheel');
  assert(scene.camera.getWorldDirection(new THREE.Vector3()).z>.8,'look through the front windshield');
  assert.equal(scene.controls.enabled,false,'orbit radius must not push the eye out of the cabin');
  assert(scene.camera.near<=.0005);
  assert(scene.camera.fov>=60);
  assert(Object.values(scene.openTargets).every(x=>x===0));
});

test('looking around and zooming keep the driver eye fixed; exterior view restores orbit and lens',()=>{
  const scene=fixture();scene.focus('interior',true);
  const eye=scene.camera.position.clone();
  assert(scene.driverCamera,'driver look controller exists');
  scene.driverCamera.look(70,-20);scene.driverCamera.zoom(-100);
  assert(scene.camera.position.distanceTo(eye)<1e-12);
  scene.focus('interior',true);
  assert(scene.camera.position.distanceTo(eye)<1e-12);
  scene.focus('assembled',true);
  assert.equal(scene.controls.enabled,true);
  assert.equal(scene.cameraMode,'orbit');
  assert.equal(scene.camera.fov,34);
  assert.equal(scene.camera.near,.003);
  assert(scene.camera.position.length()>.5);
});
