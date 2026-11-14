import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { prepareWebSurfaces } from '../src/web-surfaces.js';

function part(material) {
  return { meshes:[new THREE.Mesh(new THREE.BoxGeometry(.01,.01,.01),material)] };
}

test('runtime fog settings are replaced by clear physical cabin glazing', async() => {
  const glass = new THREE.MeshPhysicalMaterial({
    color:new THREE.Color(.955,.957,.955),transmission:.80,roughness:.08,opacity:.2,
    transparent:true,metalness:0,ior:1.46,
  });
  glass.name='WEB | INT | neutral clear laminated glass';
  glass.userData={web_surface:'glass'};
  const fixture=part(glass);
  await prepareWebSurfaces([fixture],null);
  const actual=fixture.meshes[0].material;
  assert(actual.isMeshPhysicalMaterial);
  assert.equal(actual.transmission,1);
  assert.equal(actual.opacity,1);
  assert.equal(actual.transparent,false);
  assert(actual.roughness<=.025);
  assert.equal(actual.thickness,.0005);
  assert(Math.abs(actual.color.r-actual.color.b)<.005);
});

test('white ABS retains reflective plastic response without clipping to pure white',async()=>{
  const plastic=new THREE.MeshPhysicalMaterial({
    color:new THREE.Color(.88,.86,.82),roughness:.285,metalness:0,clearcoat:.13,
  });
  plastic.name='WEB | LD_015_White';plastic.userData={web_surface:'solid'};
  const fixture=part(plastic);
  await prepareWebSurfaces([fixture],null);
  const actual=fixture.meshes[0].material;
  assert(actual.color.r>=.7 && actual.color.r<=.8);
  assert(actual.color.b>=.68);
  assert.equal(actual.metalness,0);
  assert(actual.clearcoat>=.2);
  assert(actual.roughness>=.24 && actual.roughness<=.30);
});

test('lens tuning preserves red tail-light tint and source image slots',async()=>{
  const texture=new THREE.Texture();
  const red=new THREE.MeshPhysicalMaterial({
    color:new THREE.Color(.584,.0103,.00273),transmission:.94,roughness:.285,map:texture,
  });
  red.name='WEB | LD_036_Trans_Red';red.userData={web_surface:'glass'};
  const fixture=part(red);
  await prepareWebSurfaces([fixture],null);
  const actual=fixture.meshes[0].material;
  assert(actual.color.r>.5 && actual.color.g<.02);
  assert.equal(actual.map,texture);
  assert(actual.transmission>=.94);
  assert(actual.roughness<=.16);
});
