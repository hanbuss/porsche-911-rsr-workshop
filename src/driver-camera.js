import { MathUtils, Vector3 } from 'three';

// Calibrated against the actual closed cabin: eye in front of the driver's
// headrest and below the roof, with unobstructed LCD and windshield sightlines.
export const DRIVER_EYE = Object.freeze([.03198,.116,-.026]);
const DEFAULT_PITCH = Math.atan2(-.018,.061);

/** Turn the driver's head and change lens angle without translating the eye. */
export class DriverCamera {
  constructor(camera) {
    this.camera = camera;
    this.target = new Vector3();
    this.yaw = 0; this.pitch = DEFAULT_PITCH; this.fov = 68;
  }

  reset() {
    this.yaw = 0; this.pitch = DEFAULT_PITCH; this.fov = 68;
    this.apply();
  }

  look(deltaX, deltaY) {
    this.yaw = MathUtils.clamp(this.yaw-deltaX*.003,-1.15,1.15);
    this.pitch = MathUtils.clamp(this.pitch+deltaY*.003,-.85,.45);
    this.apply();
  }

  zoom(delta) {
    this.fov = MathUtils.clamp(this.fov+delta*.015,52,82);
    this.apply();
  }

  apply() {
    this.camera.position.fromArray(DRIVER_EYE);
    this.target.set(Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),
      Math.cos(this.yaw)*Math.cos(this.pitch)).multiplyScalar(.064).add(this.camera.position);
    this.camera.lookAt(this.target);
    if(this.camera.near!==.0005||this.camera.fov!==this.fov){
      this.camera.near=.0005; this.camera.fov=this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
