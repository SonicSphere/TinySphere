import assert from 'node:assert/strict';
import { supportsSceneTools } from '../src/ui/desktop-tools.js';
import { supportsTabAudio } from '../src/audio/audio-support.js';

const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36';
function scope(navigator, { compact = false, touchOnly = false } = {}) {
  return {
    navigator,
    matchMedia: (query) => ({ matches: query.includes('max-width') ? compact : touchOnly }),
    isSecureContext: true,
    AudioContext() {},
  };
}

const cases = [
  ['Mac desktop', { userAgent: desktop, maxTouchPoints: 0 }, {}, true],
  ['Windows touch laptop with a pointer', { userAgent: 'Windows Chrome/142.0.0.0', maxTouchPoints: 10 }, {}, true],
  ['Safari desktop', { userAgent: 'Macintosh Safari/605.1.15', maxTouchPoints: 0 }, {}, true],
  ['Firefox desktop', { userAgent: 'Linux Firefox/143.0', maxTouchPoints: 0 }, {}, true],
  ['iPhone', { userAgent: 'iPhone Mobile Safari' }, {}, false],
  ['Android desktop-width tablet', { userAgent: 'Android Chrome/142.0.0.0' }, {}, false],
  ['iPad with desktop UA and keyboard', { userAgent: desktop, maxTouchPoints: 5 }, {}, false],
  ['user-agent client hints mobile', { userAgent: desktop, userAgentData: { mobile: true } }, {}, false],
  ['touch-only Windows tablet', { userAgent: 'Windows Chrome/142.0.0.0', maxTouchPoints: 10 }, { touchOnly: true }, false],
  ['compact desktop window', { userAgent: desktop }, { compact: true }, true],
];
for (const [name, nav, display, expected] of cases)
  assert.equal(supportsSceneTools(scope(nav, display)), expected, name);

const chromium = { userAgent: desktop, mediaDevices: { getDisplayMedia() {} } };
assert.equal(supportsTabAudio(scope(chromium)), true, 'Desktop tab audio remains available');
assert.equal(supportsTabAudio(scope({ ...chromium, maxTouchPoints: 5 })), false, 'iPad tab capture stays hidden');
assert.equal(supportsTabAudio(scope({ ...chromium, userAgent: 'Android Chrome/142.0.0.0' })), false);
console.log(JSON.stringify({ passed: true, deviceCases: cases.length, audioChecks: 3 }));
