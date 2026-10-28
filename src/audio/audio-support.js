export function isMobileDevice(nav = globalThis.navigator) {
  const ua = nav?.userAgent ?? '';
  return Boolean(
    nav?.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (/Macintosh/i.test(ua) && nav?.maxTouchPoints > 1),
  );
}

// Tab audio is supported by desktop Chromium. A screen-sharing API alone
// does not mean a mobile browser can supply audio.
export function supportsTabAudio(scope = globalThis) {
  const nav = scope.navigator,
    ua = nav?.userAgent ?? '';
  const embedded = /\bwv\b|Electron\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(ua);
  return !!(
    scope.isSecureContext &&
    typeof nav?.mediaDevices?.getDisplayMedia === 'function' &&
    typeof scope.AudioContext === 'function' &&
    /(?:Chrome|Chromium)\/\d+/.test(ua) &&
    !isMobileDevice(nav) &&
    !embedded
  );
}
