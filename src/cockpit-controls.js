/** Coordinate entering the cabin without coupling camera placement to the UI. */
export function enterDriverView(view, available, { releasePedals, onEntered } = {}) {
  if (!available.cockpit) return false;
  const keys = Object.keys(view.openTargets);
  const wasOpen = keys.some(key => view.openTargets[key] > 0 || (view.opens[key] || 0) > .025);
  if (wasOpen) releasePedals?.();
  for (const key of keys) view.setOpen(key, false);
  view.controls.autoRotate = false;
  view.focus('interior');
  onEntered?.();
  return true;
}
