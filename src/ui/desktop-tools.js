import { isMobileDevice } from '../audio/audio-support.js';
import { SPHERE_VIEWS } from '../engine/form-choice.js';

const touchOnlyQuery = '(hover: none) and (pointer: coarse)';

export function supportsSceneTools(scope = globalThis) {
  return !isMobileDevice(scope.navigator) && !scope.matchMedia(touchOnlyQuery).matches;
}

export function createDesktopTools({ capture, getRecipe, getSphereVisibility, setClothsVisible, setSphereView }) {
  const canvas = document.getElementById('view');
  const hint = document.getElementById('screenshot-hint');
  const status = document.getElementById('screenshot-status');
  const canvasLabel = canvas.getAttribute('aria-label');
  const touchOnly = matchMedia(touchOnlyQuery);
  let available = supportsSceneTools();

  function getStatus() {
    const visibility = getSphereVisibility();
    return {
      available, open: false, fps: false, info: false,
      sphereView: visibility.mode, clothsVisible: visibility.cloths, tubesVisible: visibility.tubes,
      clothOverride: visibility.clothOverride, tubeOverride: visibility.tubeOverride,
    };
  }
  function refresh() {
    hint.hidden = !available;
    canvas.setAttribute('aria-label', canvasLabel + (available ? ' Press S for screenshot.' : ''));
    if (available) canvas.setAttribute('aria-keyshortcuts', 'S');
    else canvas.removeAttribute('aria-keyshortcuts');
    document.body.dataset.screenshotAvailable = String(available);
    document.body.dataset.debugAvailable = String(available);
    document.body.dataset.debugMenu = 'false';
    document.body.dataset.sphereView = getSphereVisibility().mode;
  }
  function setCloths(value) {
    if (!available) return getStatus();
    setClothsVisible(value === null ? null : Boolean(value));
    refresh();
    return getStatus();
  }
  function setView(mode) {
    if (!available || !Object.hasOwn(SPHERE_VIEWS, mode)) return getStatus();
    setSphereView(mode);
    refresh();
    return getStatus();
  }
  function clear() {
    setClothsVisible(null);
    status.textContent = '';
    refresh();
    return getStatus();
  }
  function screenshot() {
    if (!available) return false;
    const a = document.createElement('a');
    try {
      a.href = capture();
      a.download = `tiny-sphere-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      document.body.append(a);
      a.click();
      status.textContent = 'Screenshot saved';
      return { filename: a.download };
    } catch (error) {
      status.textContent = 'Could not save the screenshot. Try again.';
      throw error;
    } finally {
      a.remove();
    }
  }
  async function copyRecipe() {
    if (!available) return false;
    try {
      await navigator.clipboard.writeText(JSON.stringify(getRecipe(), null, 2));
      status.textContent = 'Full recipe copied';
      return true;
    } catch (error) {
      status.textContent = error.message.includes('transition')
        ? error.message : 'Could not copy the recipe. Try again.';
      return false;
    }
  }
  function saveRecipe() {
    if (!available) return false;
    let url;
    const a = document.createElement('a');
    try {
      const recipe = getRecipe();
      url = URL.createObjectURL(new Blob([JSON.stringify(recipe, null, 2) + '\n'], { type: 'application/json' }));
      a.href = url;
      a.download = `tiny-sphere-shot-${recipe.capturedAt.replace(/[:.]/g, '-')}.json`;
      document.body.append(a);
      a.click();
      status.textContent = 'Full recipe exported';
      return { filename: a.download, recipe };
    } catch (error) {
      status.textContent = error.message;
      return false;
    } finally {
      a.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }
  function keydown(event) {
    if (!available || event.key?.toLowerCase() !== 's' || event.defaultPrevented ||
      event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
    event.preventDefault();
    try { screenshot(); } catch {}
  }
  function availabilitychange() {
    available = supportsSceneTools();
    refresh();
  }
  document.addEventListener('keydown', keydown);
  touchOnly.addEventListener('change', availabilitychange);
  refresh();
  return {
    // Retain old API calls without allowing the removed menu/readouts to return.
    setOpen: getStatus, setFPS: getStatus, setInfo: getStatus,
    setCloths, setSphereView: setView, getStatus, clear,
    screenshot, copyRecipe, saveRecipe, refresh,
    dispose() {
      document.removeEventListener('keydown', keydown);
      touchOnly.removeEventListener('change', availabilitychange);
    },
  };
}
