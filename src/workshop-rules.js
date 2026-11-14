/** Availability derives from the current scene, rather than changing it implicitly. */
export function workshopAvailability({ ready=false, phase='off', speedKmh=0,
  explode=0, targetExplode=0, challengeActive=false, preparing=false, returning=false,
  opens={}, openTargets={} } = {}) {
  const building=challengeActive||preparing||returning;
  const whole=explode<=.0001&&targetExplode<=.0001&&!building;
  const stationary=Math.abs(speedKmh)<1;
  const accessClosed=Object.keys(openTargets).every(key => openTargets[key]<.02 && (opens[key]||0)<.025);
  const busy=phase==='starting'||phase==='stopping';
  return {
    whole,stationary,building,accessClosed,
    cockpit:ready&&whole,
    ignition:ready&&!busy&&whole,
    gear:ready&&phase==='running'&&whole,
    throttle:ready&&phase==='running'&&whole&&accessClosed,
    brake:ready&&phase!=='off'&&!building,
    access:ready&&stationary&&whole&&!busy,
    disassembly:ready&&stationary&&!busy&&!returning,
    lights:ready&&!building&&explode<.04,
  };
}
