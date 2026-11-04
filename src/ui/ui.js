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

const reaction = document.querySelector('#sound-reactivity');
const reactionDetail = document.querySelector('#sound-reactivity-detail');
const reactionStatus = document.querySelector('#sound-reactivity-status');
let lastReactionAnnouncement = '';

function closeReactionDetail() {
  reactionDetail.hidden = true;
  reaction.setAttribute('aria-expanded', 'false');
}
function positionReactionDetail() {
  if (reactionDetail.hidden) return;
  const rect = reaction.getBoundingClientRect();
  reactionDetail.style.left = `${Math.max(12, Math.min(innerWidth - reactionDetail.offsetWidth - 12, rect.left))}px`;
  const top = rect.top >= reactionDetail.offsetHeight + 22
    ? rect.top - reactionDetail.offsetHeight - 10 : rect.bottom + 10;
  reactionDetail.style.top = `${Math.max(12, Math.min(innerHeight - reactionDetail.offsetHeight - 12, top))}px`;
}
reaction.addEventListener('click', () => {
  reactionDetail.hidden = !reactionDetail.hidden;
  reaction.setAttribute('aria-expanded', String(!reactionDetail.hidden));
  positionReactionDetail();
});
document.addEventListener('click', event => {
  if (!reaction.contains(event.target) && !reactionDetail.contains(event.target)) closeReactionDetail();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !reactionDetail.hidden) {
    closeReactionDetail();
    reaction.focus();
  }
});
window.addEventListener('resize', positionReactionDetail);

export function syncPatternReaction(show, state, audio) {
  // renderArtwork passes music to prepare/sample shows. renderField shows
  // bypass those audio layers and run from their own performance clock.
  const reactive = Boolean(show && typeof show.renderField !== 'function');
  reaction.hidden = !reactive;
  if (!reactive) closeReactionDetail();
  const name = show?.name ?? 'Light pattern';
  const announcement = `${name}: ${reactive ? 'sound reactive' : 'not sound reactive'}.`;
  if (announcement !== lastReactionAnnouncement) {
    reactionStatus.textContent = announcement;
    lastReactionAnnouncement = announcement;
  }
  if (!reactive) return;
  const description = `${name} responds to music.${!state.playing ? ' The light animation is paused.' : state.audioReaction === 0 ? ' Audio reaction is currently turned off.' : audio.phase !== 'connected' ? ' Play music to see it respond.' : ' Music is connected.'}`;
  reaction.title = description;
  reaction.setAttribute('aria-label', `${name}: sound reactive. More information`);
  reactionDetail.querySelector('strong').textContent = name;
  reactionDetail.querySelector('p').textContent = description;
  positionReactionDetail();
}
