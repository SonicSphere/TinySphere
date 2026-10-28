import { DOLLY_ZOOM_START_DISTANCE, zoomCameraDistance } from './orbit.js';

// Camera gestures share the same validated state updates as the visible UI.
export function bindCameraGestures(canvas, { getState, setState }) {
  const pointers = new Map();
  const point = (event) => ({ x: event.clientX, y: event.clientY });
  const separation = () => {
    const [a, b] = pointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function down(event) {
    if ((event.pointerType === 'mouse' && event.button !== 0) || pointers.size >= 2) return;
    event.preventDefault();
    pointers.set(event.pointerId, point(event));
    canvas.setPointerCapture(event.pointerId);
  }

  function move(event) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    const state = getState();
    if (pointers.size === 2) {
      const before = separation();
      pointers.set(event.pointerId, point(event));
      const after = separation();
      // Rebase every move, including at the zoom limits and when fingers cross.
      // This avoids a dead zone when reversing a pinch at either limit.
      if (before >= 1 && after >= 1)
        setState({ distance: zoomCameraDistance(state.distance, before / after) });
    } else {
      // Counter the lens magnification so mouse/touch drags stay controllable
      // through the dolly range, with the original feel at ordinary distances.
      const turnScale = Math.min(1, DOLLY_ZOOM_START_DISTANCE / state.distance);
      setState({
        azimuth: state.azimuth - (event.clientX - previous.x) * 0.005 * turnScale,
        elevation: state.elevation + (event.clientY - previous.y) * 0.004 * turnScale,
      });
      pointers.set(event.pointerId, point(event));
    }
  }

  function end(event) {
    if (!pointers.delete(event.pointerId)) return;
    // The surviving finger already has its latest position, so two fingers can
    // become one without a jump or a second touch-down.
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function wheel(event) {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    const delta = event.deltaY * unit;
    if (!Number.isFinite(delta)) return;
    // Normalize wheel notches and trackpads; bound a single fling so it cannot
    // overflow and be discarded by the state validator at either distance limit.
    setState({
      distance: zoomCameraDistance(
        getState().distance,
        Math.exp(Math.max(-4, Math.min(4, delta * 0.001))),
      ),
    });
  }

  function keydown(event) {
    const state = getState();
    if (event.code === 'Space') {
      event.preventDefault();
      setState({ playing: !state.playing });
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setState({ azimuth: state.azimuth + (event.key === 'ArrowLeft' ? 0.08 : -0.08) });
    }
  }

  const listeners = {
    pointerdown: down,
    pointermove: move,
    pointerup: end,
    pointercancel: end,
    lostpointercapture: end,
    wheel,
    keydown,
  };
  for (const [type, handler] of Object.entries(listeners))
    canvas.addEventListener(type, handler, { passive: false });
  return () => {
    for (const [type, handler] of Object.entries(listeners))
      canvas.removeEventListener(type, handler);
    const captured = [...pointers.keys()];
    pointers.clear();
    for (const id of captured) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
}
