import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { VehicleLighting } from '../src/vehicle-lighting.js';

const manifest=JSON.parse(readFileSync(new URL('../public/assets/car-manifest.json',import.meta.url),'utf8'));
const enabled={headlights:true,taillights:true,hazards:true,night:true};

function fixture() {
  const scene=new THREE.Scene(), byId=new Map();
  for (const meta of manifest.parts) {
    const root=new THREE.Group();
    root.position.fromArray(meta.assembled.position);
    root.quaternion.fromArray(meta.assembled.quaternion);
    root.scale.fromArray(meta.assembled.scale);
    scene.add(root); byId.set(meta.id,{meta,root});
  }
  scene.updateMatrixWorld(true);
  const lighting=new VehicleLighting(scene,byId,manifest.hints);
  lighting.update(enabled,{time:.2});
  return {scene,byId,lighting};
}

test('both pairs of LED optics sit inside the original curved lens cavities',()=>{
  const {lighting}=fixture();
  assert.equal(lighting.front.length,2);
  for (const lamp of lighting.front) {
    const meta=lamp.owner.meta;
    assert.equal(lamp.bulbs.length,2);
    for (const {bulb} of lamp.bulbs) {
      const normalized=bulb.position.clone().sub(new THREE.Vector3(...meta.center))
        .divide(new THREE.Vector3(...meta.size).multiplyScalar(.5));
      // An AABB-only test misses the empty space above the canopy's sloped tip.
      assert(normalized.lengthSq()<.4,'emitter must remain in the central enclosed cavity');
      assert(bulb.position.z<meta.boundsMax[2]-.015,'emitter must not float at the front edge');
    }
  }
});

test('real spotlights aim forwards at the ground with a usable near-field cookie',()=>{
  const {lighting}=fixture();
  for (const lamp of lighting.front) {
    const offset=lamp.target.position.clone().sub(lamp.spot.position);
    assert(offset.z>.3 && offset.z<.6);
    assert(Math.abs(lamp.target.position.y+.0014)<1e-8);
    const distance=offset.length();
    assert(lamp.spot.shadow.camera.near<.01);
    assert(distance<lamp.spot.distance);
    assert.equal(lamp.spot.castShadow,false);
    lamp.spot.shadow.updateMatrices(lamp.spot);
    const projected=lamp.target.position.clone().applyMatrix4(lamp.spot.shadow.matrix);
    assert(projected.x>0 && projected.x<1 && projected.y>0 && projected.y<1
      && projected.z>0 && projected.z<1,'ground target must lie inside the cookie projection');
    const centreIlluminance=lamp.spot.intensity/distance**2*(-offset.y/distance);
    assert(centreIlluminance>.9,'night beam must visibly exceed the dim studio fill at its centre');
    lamp.cone.updateMatrixWorld(true);
    const coneStart=new THREE.Vector3(0,.5,0).applyMatrix4(lamp.cone.matrixWorld);
    assert(coneStart.distanceTo(lamp.spot.position)<1e-8,'dust envelope must originate at the same lamp');
  }
});

test('lamp optics and their beam direction follow the supporting part rotation',()=>{
  const {scene,lighting}=fixture();
  const lamp=lighting.front[0];
  const direction=lamp.target.position.clone().sub(lamp.spot.position).normalize();
  const bulbDirection=new THREE.Vector3(0,1,0).applyQuaternion(lamp.bulbs[0].bulb.quaternion);
  const turn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.45);
  lamp.owner.root.quaternion.premultiply(turn);
  lamp.owner.root.position.add(new THREE.Vector3(.03,.02,-.01));
  scene.updateMatrixWorld(true);
  lighting.update(enabled);
  const movedDirection=lamp.target.position.clone().sub(lamp.spot.position).normalize();
  const movedBulbDirection=new THREE.Vector3(0,1,0).applyQuaternion(lamp.bulbs[0].bulb.quaternion);
  // Source transforms are exported to nine decimal places; allow that rounding.
  assert(movedDirection.distanceTo(direction.applyQuaternion(turn))<1e-6);
  assert(movedBulbDirection.distanceTo(bulbDirection.applyQuaternion(turn))<1e-6);
});

test('daytime lights remain active while disassembly extinguishes all attached lamps',()=>{
  const {lighting}=fixture();
  lighting.update({...enabled,night:false},{brake:1,time:.2});
  assert(lighting.front.every(lamp=>lamp.spot.intensity>0));
  assert(lighting.rear.every(lamp=>lamp.material.emissiveIntensity>7));
  assert(lighting.indicators.every(lamp=>lamp.material.emissiveIntensity>0));
  lighting.update(enabled,{brake:1,explode:1,time:.2});
  assert(lighting.front.every(lamp=>lamp.spot.intensity===0 && !lamp.cone.visible
    && lamp.bulbs.every(item=>!item.bulb.visible && item.material.emissiveIntensity===0)));
  assert([...lighting.rear,...lighting.indicators].every(lamp=>!lamp.bulb.visible
    && lamp.material.emissiveIntensity===0));
});

test('braking brightens the rear lamps and hazard blinking preserves their state',()=>{
  const {lighting}=fixture();
  const tailIdle=lighting.rear[0].material.emissiveIntensity;
  lighting.update(enabled,{brake:1,time:.2});
  assert(lighting.rear[0].material.emissiveIntensity>tailIdle);
  assert(lighting.indicators.every(lamp=>lamp.material.emissiveIntensity>0));
  lighting.update(enabled,{brake:1,time:.6});
  assert(lighting.indicators.every(lamp=>lamp.material.emissiveIntensity===0));
  assert(lighting.rear[0].material.emissiveIntensity>tailIdle);
});
