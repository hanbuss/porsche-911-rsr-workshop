import * as THREE from 'three';

const LAMP_FORWARD = new THREE.Vector3(0,0,1);
const CYLINDER_AXIS = new THREE.Vector3(0,1,0);
const BEAM_AXIS = new THREE.Vector3(0,-1,0);
const GROUND_HEIGHT = -.0014;

function beamTexture() {
  const size=64, data=new Uint8Array(size*size*4);
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    const radius=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1);
    const falloff=1-THREE.MathUtils.smoothstep(radius,.28,1);
    const index=(y*size+x)*4;
    data[index]=data[index+1]=data[index+2]=Math.round(falloff*255);
    data[index+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);
  texture.minFilter=texture.magFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}

function attachedPose(owner, object, position) {
  object.position.copy(position);
  const inverse=owner.root.getWorldQuaternion(new THREE.Quaternion()).normalize().invert();
  return {local:owner.root.worldToLocal(position.clone()),
    localQuaternion:inverse.multiply(object.quaternion)};
}

/** Lamps follow their supporting pieces; forward beams illuminate real ground. */
export class VehicleLighting {
  constructor(scene, byId, hints = {}) {
    this.scene = scene;
    this.front = []; this.rear = []; this.indicators = [];
    this.root = new THREE.Group(); this.root.name = 'Vehicle lighting'; scene.add(this.root);
    this._ownerQuaternion = new THREE.Quaternion();
    this._direction = new THREE.Vector3();
    this.cookie = beamTexture();
    for (const info of hints.headlights || []) {
      const owner=byId.get(info.lensIds[0]); if (!owner) continue;
      const center = new THREE.Vector3(...info.center);
      // The canopy slopes down at its forward tip. Its boundsMax is not a
      // mounting plane: that placed the upper emitter outside the curved lens.
      // Mount the two compact LED optics in the middle of the enclosed cavity.
      const emitter = center.clone().add(new THREE.Vector3(0,-.001,.007));
      const bulbs=[];
      for (const dy of [-.004,.004]) {
        const material=new THREE.MeshPhysicalMaterial({
          color:0xc2c5bf,metalness:.12,roughness:.19,emissive:0xfff2d6,emissiveIntensity:0,
          clearcoat:.25,clearcoatRoughness:.1,
        });
        const bulb=new THREE.Mesh(new THREE.CylinderGeometry(.0022,.0031,.0016,24),material);
        bulb.quaternion.setFromUnitVectors(CYLINDER_AXIS,LAMP_FORWARD);
        const position=emitter.clone().add(new THREE.Vector3(0,dy,0));
        this.root.add(bulb);
        bulbs.push({bulb,material,...attachedPose(owner,bulb,position)});
      }
      const spot = new THREE.SpotLight(0xfff2da,0,1.45,.29,.7,2);
      spot.map=this.cookie;
      // Three updates the cookie projection even with renderer shadows off.
      // Its default .5 m near plane is unsuitable for this half-metre model.
      spot.shadow.camera.near=.005;
      spot.shadow.camera.updateProjectionMatrix();
      const target=new THREE.Object3D(); scene.add(target);
      spot.target=target; spot.castShadow=false; this.root.add(spot);
      const spotLocal=owner.root.worldToLocal(emitter.clone());
      const aim=emitter.clone().add(new THREE.Vector3(Math.sign(center.x)*.015,0,.42));
      aim.y=GROUND_HEIGHT;
      const targetLocal=owner.root.worldToLocal(aim.clone());
      const beamLength=emitter.distanceTo(aim);
      // A faint dust envelope reveals the direction without replacing the
      // actual spotlight pool cast onto the showroom ground.
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(.0025,.09,1,40,1,true),
        new THREE.ShaderMaterial({
          uniforms:{tint:{value:new THREE.Color(0xfff2da)},amount:{value:0}},
          vertexShader:'varying vec2 beamUV; void main(){beamUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
          fragmentShader:'varying vec2 beamUV;uniform vec3 tint;uniform float amount;void main(){float along=1.0-beamUV.y;float fade=1.0-smoothstep(0.05,1.0,along);gl_FragColor=vec4(tint,amount*fade);}',
          transparent:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false,toneMapped:false,
        }));
      cone.scale.y=beamLength;
      this.root.add(cone); cone.visible=false; cone.renderOrder=2;
      this.front.push({owner,bulbs,spot,target,spotLocal,targetLocal,cone});
    }
    for (const info of hints.taillights || []) for (const id of info.lensIds) {
      const owner=byId.get(id); if (!owner) continue;
      const point = new THREE.Vector3(...owner.meta.center);
      point.z=owner.meta.boundsMin[2]-.0008;
      const material=new THREE.MeshStandardMaterial({
        color:0x8f0c14,roughness:.27,metalness:0,emissive:0xff132b,emissiveIntensity:0,
      });
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.0025,16,10),material);
      bulb.scale.set(1.4,.58,.4); this.root.add(bulb);
      this.rear.push({owner,bulb,material,...attachedPose(owner,bulb,point)});
    }
    for (const side of [-1,1]) for (const isFront of [true,false]) {
      const candidates=(isFront ? this.front : this.rear).map(x=>x.owner)
        .filter(x=>Math.sign(x.meta.center[0])===side);
      const owner=candidates[0]; if (!owner) continue;
      const point=new THREE.Vector3(side*.082,.074,isFront ? .204:-.227);
      const material=new THREE.MeshStandardMaterial({
        color:0x935311,roughness:.25,emissive:0xff9009,emissiveIntensity:0,
      });
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.0016,12,8),material);
      bulb.scale.set(1.3,.65,.5);this.root.add(bulb);
      this.indicators.push({owner,bulb,material,...attachedPose(owner,bulb,point)});
    }
    this.enabled = {headlights:false,taillights:false,hazards:false};
    this.metrics = {forwardBeams:0,headlightIntensity:0,tailIntensity:0};
  }

  update(settings, {brake=0,explode=0,time=0}={}) {
    const attached = explode<.035;
    const frontOn=settings.headlights&&attached;
    const night=!!settings.night;
    for (const lamp of this.front) {
      lamp.owner.root.getWorldQuaternion(this._ownerQuaternion).normalize();
      for (const item of lamp.bulbs) {
        item.bulb.position.copy(item.local).applyMatrix4(lamp.owner.root.matrixWorld);
        item.bulb.quaternion.copy(this._ownerQuaternion).multiply(item.localQuaternion);
        item.material.emissiveIntensity=frontOn ? 4.5:0;
        item.bulb.visible=attached;
      }
      lamp.spot.position.copy(lamp.spotLocal).applyMatrix4(lamp.owner.root.matrixWorld);
      lamp.target.position.copy(lamp.targetLocal).applyMatrix4(lamp.owner.root.matrixWorld);
      lamp.spot.intensity=frontOn ? night ? 1.3:1.1:0;
      lamp.spot.updateMatrixWorld();
      lamp.target.updateMatrixWorld();
      const delta=this._direction.copy(lamp.target.position).sub(lamp.spot.position);
      const length=delta.length(); delta.normalize();
      lamp.cone.scale.y=length;
      lamp.cone.position.copy(lamp.spot.position).addScaledVector(delta,length*.5);
      lamp.cone.quaternion.setFromUnitVectors(BEAM_AXIS,delta);
      lamp.cone.material.uniforms.amount.value=frontOn ? night ? .016:.004:0;
      lamp.cone.visible=frontOn;
    }
    const rearIntensity=(settings.taillights ? 2.5:0)+(brake>.02 ? brake*7:0);
    for (const lamp of this.rear) {
      lamp.bulb.position.copy(lamp.local).applyMatrix4(lamp.owner.root.matrixWorld);
      lamp.owner.root.getWorldQuaternion(this._ownerQuaternion).normalize();
      lamp.bulb.quaternion.copy(this._ownerQuaternion).multiply(lamp.localQuaternion);
      lamp.material.emissiveIntensity=attached ? rearIntensity:0;
      lamp.bulb.visible=attached;
    }
    for (const lamp of this.indicators) {
      lamp.bulb.position.copy(lamp.local).applyMatrix4(lamp.owner.root.matrixWorld);
      lamp.owner.root.getWorldQuaternion(this._ownerQuaternion).normalize();
      lamp.bulb.quaternion.copy(this._ownerQuaternion).multiply(lamp.localQuaternion);
      lamp.material.emissiveIntensity=settings.hazards && attached && time%.85<.42 ? 6:0;
      lamp.bulb.visible=attached;
    }
    this.enabled={headlights:frontOn,taillights:attached&&rearIntensity>0,hazards:settings.hazards&&attached};
    this.metrics={forwardBeams:frontOn ? this.front.length:0,
      headlightIntensity:this.front[0]?.spot.intensity||0,tailIntensity:attached ? rearIntensity:0};
  }

  snapshot() {
    return {...this.metrics,enabled:{...this.enabled},headlights:this.front.length,
      taillights:this.rear.length,targets:this.front.map(f=>({
        origin:f.spot.position.toArray(),target:f.target.position.toArray(),
        intensity:f.spot.intensity,near:f.spot.shadow.camera.near,
        emitters:f.bulbs.map(item=>item.bulb.position.toArray()),
      }))};
  }
}
