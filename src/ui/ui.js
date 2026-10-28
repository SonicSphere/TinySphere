import { supportsTabAudio } from '../audio/audio-support.js';

document.body.dataset.tabAudio = supportsTabAudio() ? 'available' : 'unavailable';
export const compactLayout = matchMedia(
  '(max-width: 700px), (max-width: 1000px) and (max-height: 500px)',
);
function syncLayout() {
  document.body.dataset.layout = compactLayout.matches ? 'compact' : 'desktop';
}
compactLayout.addEventListener('change', syncLayout);
syncLayout();

const audioOptions = document.querySelector('.audio-options');
document.addEventListener('pointerdown', (event) => {
  if (!audioOptions.contains(event.target)) audioOptions.open = false;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && audioOptions.open) {
    audioOptions.open = false;
    audioOptions.querySelector('summary').focus();
  }
});

// Older links and agent callers cannot collapse the permanent control bar.
const destination = new URL(location.href);
if (destination.searchParams.has('mode')) {
  destination.searchParams.delete('mode');
  history.replaceState({}, '', destination);
}
window.studioShell = {
  setMode: () => 'studio',
  getMode: () => 'studio',
  setTrayOpen: () => true,
  isTrayOpen: () => true,
};
