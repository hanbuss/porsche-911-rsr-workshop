import * as THREE from 'three';

const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(Number(n)) ? Number(n) : a));
const smooth = n => { n = clamp(n, 0, 1); return n*n*(3-2*n); };
const vec = values => new THREE.Vector3(...values);
const quat = values => new THREE.Quaternion(...values).normalize();
const ZERO = [0, 0, 0];
const IDENTITY = [0, 0, 0, 1];
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const FRONT_HOOD_RIGHT_FRAME = new Set(
  Array.from({ length: 13 }, (_, index) => `P${String(1270+index).padStart(4,'0')}`));
const FIXED_REAR_PILLARS = new Set(['P1553','P1554']);
// Original LDraw roof3.ldr is the separate central rear hatch. The long
// quarter fairings and their white flexible borders remain on the body.
// See docs/rear-hatch-repair.md and the independently exported source fixture.
const REAR_HATCH_PARTS = new Set([
  ...Array.from({length:24},(_,index)=>`P${1496+index}`),
  'I34d63fd9c4b5', 'I041763b4b64c', // fitted rear pane and its edge seal
]);
const REAR_HATCH_HINGE_JOINERS=['P1496','P1500','P1503','P1506'];

function effectiveGroup(meta) {
  // The imported assembly split the hood's mirrored support between collections.
  // Treat it as one moving cover without moving the adjacent curved windshield.
  if (FRONT_HOOD_RIGHT_FRAME.has(meta.id)) return '05_Hood';
  if (FIXED_REAR_PILLARS.has(meta.id)) return '08_Roof_and_rollcage';
  return meta.group || '';
}

function translated(position, offset) {
  return position.map((v, i) => v+offset[i]);
}

function rotateAbout(point, pivot, rotation, target = new THREE.Vector3()) {
  return target.copy(point).sub(pivot).applyQuaternion(rotation).add(pivot);
}

/**
 * Deterministic motions for the exported physical parts.
 *
 * All poses are Three.js world coordinates in metres. Inputs are explicit;
 * this plan never advances a clock, reads the renderer, or mutates the manifest.
 * Adjacent decals and sewing geometry remain children of their owning part.
 */
export class PartMotionPlan {
  constructor(manifest) {
    if (!Array.isArray(manifest?.parts)) throw new TypeError('A part manifest is required.');
    this.records = new Map();
    this.manifest = manifest;
    this.wheels = new Map();
    for (const wheel of manifest.hints?.wheels || []) {
      for (const id of wheel.partIds || []) {
        this.wheels.set(id, { center:vec(wheel.center), axis:vec(wheel.axis || [1,0,0]).normalize() });
      }
    }
    this.doors = new Map();
    for (const door of manifest.hints?.doors || []) {
      this.doors.set(door.group, {
        key:door.group.endsWith('R') ? 'leftDoor' : 'rightDoor',
        pivot:vec(door.pivot), axis:vec(door.axis || [0,1,0]).normalize(),
        // +X is the vehicle's left side because its forward vector is +Z.
        // Negative Y rotation moves that door's rear edge outwards.
        angle:door.group.endsWith('R') ? -Math.abs(door.maxAngle || 1.05) : Math.abs(door.maxAngle || 1.05),
      });
    }
    const front = manifest.hints?.hoods?.find(h => h.name==='frontHood');
    this.frontHood = { pivot:vec(front?.pivot || [0,.0915,.1001]), angle:-.9 };
    const rearHingePoints = REAR_HATCH_HINGE_JOINERS.map(id=>manifest.parts.find(p=>p.id===id))
      .filter(Boolean).map(p=>vec(p.assembled.position));
    this.rearCover = {
      partIds:[...REAR_HATCH_PARTS].filter(id=>manifest.parts.some(p=>p.id===id)),
      pivot:rearHingePoints.length
        ? rearHingePoints.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).divideScalar(rearHingePoints.length)
        : vec([-.000026572,.117326888,-.113307597]),
      axis:rearHingePoints.length>1
        ? rearHingePoints.at(-1).clone().sub(rearHingePoints[0]).normalize() : X.clone(),
      angle:1.15,
    };
    for (const meta of manifest.parts) {
      const group = effectiveGroup(meta);
      const offset = manifest.groups?.[group]?.explodeOffset || ZERO;
      const changedGroup = group !== meta.group;
      this.records.set(meta.id, {
        meta, group,
        a:vec(meta.assembled.position), aq:quat(meta.assembled.quaternion),
        as:vec(meta.assembled.scale),
        e:vec(changedGroup ? translated(meta.assembled.position, offset)
          : meta.exploded?.position || translated(meta.assembled.position, offset)),
        b:vec(meta.board?.position || meta.assembled.position),
        bq:quat(meta.board?.quaternion || meta.assembled.quaternion),
        bs:vec(meta.board?.scale || meta.assembled.scale),
      });
    }
    this.buildEngine();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._rotation = new THREE.Quaternion();
    this._delta = new THREE.Vector3();
    this._rotationDelta = new THREE.Quaternion();
    this._inverse = new THREE.Quaternion();
    this._newPin = new THREE.Vector3();
    this._newPiston = new THREE.Vector3();
    this._direction = new THREE.Vector3();
  }

  groupFor(idOrMeta) {
    const id = typeof idOrMeta==='string' ? idOrMeta : idOrMeta.id;
    return this.records.get(id)?.group || '';
  }

  buildEngine() {
    const hints = this.manifest.hints?.engine || {};
    this.cranks = new Set(hints.crankIds || []);
    this.engineParts = new Map();
    const pistons = (hints.pistonIds || []).map(id => this.records.get(id)).filter(Boolean);
    const rods = (hints.connectingRodIds || []).map(id => this.records.get(id)).filter(Boolean);
    if (!pistons.length) {
      this.crankAxisPoint = new THREE.Vector3();
      this.crankAxis = new THREE.Vector3(0,0,1);
      return;
    }
    const sorted = pistons.slice().sort((a,b) => b.a.z-a.a.z);
    const firstZ = sorted[0].a.z;
    const lastZ = sorted.at(-1).a.z;
    const first = sorted.filter(p => Math.abs(p.a.z-firstZ)<.001);
    const last = sorted.filter(p => Math.abs(p.a.z-lastZ)<.001);
    const mean = values => values.reduce((sum,r) => sum.add(r.a),new THREE.Vector3()).divideScalar(values.length);
    this.crankAxisPoint = mean(pistons);
    this.crankAxisPoint.x = rods.length ? mean(rods).x : 0;
    this.crankAxis = mean(first).sub(mean(last)).normalize();
    this.crankAxis.x=0;
    this.crankAxis.normalize();
    for (const piston of pistons) {
      const side = Math.sign(piston.meta.center[0] || piston.a.x);
      const rod = rods.filter(r => Math.sign(r.meta.center[0])===side)
        .sort((a,b) => Math.abs(a.a.z-piston.a.z)-Math.abs(b.a.z-piston.a.z))[0];
      if (!rod) continue;
      const direction = piston.a.clone().sub(rod.a);
      const entry = { piston, rod, side, length:direction.length(), direction:direction.normalize() };
      this.engineParts.set(piston.meta.id,{ ...entry, type:'piston' });
      this.engineParts.set(rod.meta.id,{ ...entry, type:'rod' });
    }
  }

  /** Get a plain-array pose; an optional output object can be reused per frame. */
  getPartPose(idOrMeta, state = {}, output = {}) {
    const id = typeof idOrMeta==='string' ? idOrMeta : idOrMeta?.id;
    const record = this.records.get(id);
    if (!record) throw new RangeError(`Unknown part ${id}`);
    const { meta, group, a, aq, as, e, b, bq, bs } = record;
    const explode = clamp(state.explode, 0, 3);
    const opens = state.opens || {};
    const hingeAmount = 1-smooth(explode);
    const activeAssembly = Number.isFinite(state.installAmount);
    this._p.copy(a); this._q.copy(aq); this._s.copy(as);

    if (!activeAssembly && hingeAmount>0) {
      const door = this.doors.get(group);
      if (door) {
        this._rotation.setFromAxisAngle(door.axis,door.angle*clamp(opens[door.key],0,1)*hingeAmount);
        rotateAbout(this._p,door.pivot,this._rotation,this._p);
        this._q.premultiply(this._rotation);
      } else if (group==='05_Hood') {
        this._rotation.setFromAxisAngle(X,this.frontHood.angle*clamp(opens.hood,0,1)*hingeAmount);
        rotateAbout(this._p,this.frontHood.pivot,this._rotation,this._p);
        this._q.premultiply(this._rotation);
      } else if (REAR_HATCH_PARTS.has(id)) {
        this._rotation.setFromAxisAngle(this.rearCover.axis,this.rearCover.angle*clamp(opens.rearHood ?? opens.rearCover,0,1)*hingeAmount);
        rotateAbout(this._p,this.rearCover.pivot,this._rotation,this._p);
        this._q.premultiply(this._rotation);
      }
      // The rear hatch is mounted on the detachable roof frame; its pivot
      // translates with that frame when the separate inspection lift is used.
      if (group==='08_Roof_and_rollcage') {
        this._p.y += clamp(opens.roof,0,1)*.115*hingeAmount;
      }
    }

    const wheel = this.wheels.get(id);
    if (wheel) {
      // The accumulated wheel angle is retained when stopping or disassembling.
      // Multiplying it by the explosion fraction would visibly reverse the wheel.
      this._rotation.setFromAxisAngle(wheel.axis,Number.isFinite(state.wheelAngle) ? state.wheelAngle : 0);
      rotateAbout(this._p,wheel.center,this._rotation,this._p);
      this._q.premultiply(this._rotation);
    }

    const crankAngle = Number.isFinite(state.engineAngle) ? state.engineAngle : 0;
    if (this.cranks.has(id)) {
      this._rotation.setFromAxisAngle(this.crankAxis,crankAngle);
      rotateAbout(this._p,this.crankAxisPoint,this._rotation,this._p);
      this._q.premultiply(this._rotation);
    } else if (this.engineParts.has(id)) {
      const engine = this.engineParts.get(id);
      this._rotation.setFromAxisAngle(this.crankAxis,crankAngle);
      rotateAbout(engine.rod.a,this.crankAxisPoint,this._rotation,this._newPin);
      this._newPiston.copy(engine.piston.a);
      const dy = this._newPiston.y-this._newPin.y;
      const dz = this._newPiston.z-this._newPin.z;
      const travel = Math.sqrt(Math.max(0,engine.length**2-dy**2-dz**2));
      this._newPiston.x = this._newPin.x+engine.side*travel;
      if (engine.type==='piston') {
        this._p.x += this._newPiston.x-engine.piston.a.x;
      } else {
        this._p.add(this._newPin.clone().sub(engine.rod.a));
        this._direction.copy(this._newPiston).sub(this._newPin).normalize();
        this._rotation.setFromUnitVectors(engine.direction,this._direction);
        this._q.premultiply(this._rotation);
      }
    }

    this._delta.copy(this._p).sub(a);
    this._inverse.copy(aq).invert();
    this._rotationDelta.copy(this._q).multiply(this._inverse).normalize();
    const stageAmount = /^(04_|05_|06_|08_|09_|10_)/.test(group) ? smooth(explode)
      : group.startsWith('01_') ? 0 : smooth(explode-1);
    const boardAmount = activeAssembly ? 1-clamp(state.installAmount,0,1) : smooth(explode-2);
    if (activeAssembly) {
      this._p.copy(a).lerp(b,boardAmount);
    } else {
      this._p.copy(a).lerp(e,stageAmount).lerp(b,boardAmount);
    }
    this._p.add(this._delta);
    this._q.copy(aq).slerp(bq,boardAmount).premultiply(this._rotationDelta).normalize();
    this._s.copy(as).lerp(bs,boardAmount);
    output.position ||= [0,0,0];
    output.quaternion ||= [...IDENTITY];
    output.scale ||= [1,1,1];
    this._p.toArray(output.position);
    this._q.toArray(output.quaternion);
    this._s.toArray(output.scale);
    output.group = group;
    return output;
  }

  /** Convenience path that avoids allocating pose arrays in a renderer loop. */
  applyToObject(idOrMeta, object, state = {}) {
    this._output ||= { position:[0,0,0], quaternion:[0,0,0,1], scale:[1,1,1] };
    const pose = this.getPartPose(idOrMeta,state,this._output);
    object.position.fromArray(pose.position);
    object.quaternion.fromArray(pose.quaternion);
    object.scale.fromArray(pose.scale);
    return object;
  }
}
