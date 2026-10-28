import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DefaultMusic } from '../src/audio/default-music.js';

// Controlled Web Audio/media contracts, including a deliberately slow analyzer.
// This does not model actual device decoding, network speed or iOS policy.
const contexts = [],
  media = [],
  players = [],
  results = [];
let blocked = false,
  pendingPlay = null,
  pendingModule = null;
const turn = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
async function promptly(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Playback waited for analyzer initialization')),
          100,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
class Media extends EventTarget {
  constructor(url) {
    super();
    this.src = url;
    this.paused = true;
    this.currentTime = 0;
    this.duration = 300;
    this.error = null;
    this.loads = 0;
    this.plays = 0;
    this.readyState = 0;
    this.buffered = { length: 0 };
    media.push(this);
  }
  play() {
    this.plays++;
    if (blocked)
      return Promise.reject(
        Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' }),
      );
    this.paused = false;
    return pendingPlay?.promise ?? Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  removeAttribute(name) {
    if (name === 'src') this.src = '';
  }
  load() {
    this.loads++;
  }
}
class AudioNode {
  constructor() {
    this.targets = new Set();
    this.speakerConnects = 0;
  }
  connect(target) {
    assert(!this.targets.has(target), 'No duplicate audio connection');
    this.targets.add(target);
    if (target.speaker) this.speakerConnects++;
    return target;
  }
  disconnect(target) {
    if (target) this.targets.delete(target);
    else this.targets.clear();
  }
  getFloatFrequencyData(array) {
    array.fill(-Infinity);
  }
  getFloatTimeDomainData(array) {
    array.fill(0);
  }
}
class Context extends EventTarget {
  constructor() {
    super();
    this.state = 'suspended';
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.destination = { speaker: true };
    this.resumes = 0;
    if (pendingModule) this.audioWorklet = { addModule: () => pendingModule.promise };
    contexts.push(this);
  }
  resume() {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
  createMediaElementSource() {
    this.source = new AudioNode();
    return this.source;
  }
  createChannelSplitter() {
    return new AudioNode();
  }
  createAnalyser() {
    return new AudioNode();
  }
}
globalThis.Audio = Media;
globalThis.AudioContext = Context;
const player = (onChange) => {
  const value = new DefaultMusic(onChange);
  players.push(value);
  return value;
};
const audible = (session) => session.source.targets.has(session.context.destination);
async function test(name, run) {
  const owned = players.length;
  try {
    await run();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  } finally {
    pendingPlay?.resolve();
    pendingModule?.reject(new Error('Test cleanup'));
    blocked = false;
    pendingPlay = null;
    pendingModule = null;
    for (const value of players.slice(owned)) value.dispose();
    delete globalThis.Worker;
    delete globalThis.AudioWorkletNode;
    await turn();
  }
}

await test('preload warms one reusable media element without playing or creating an AudioContext', async () => {
  const changes = [],
    song = player((value) => changes.push(value.phase)),
    beforeContexts = contexts.length,
    beforeMedia = media.length;
  assert.deepEqual(changes, [], 'Constructor must not notify partially initialized app state');
  song.preload();
  song.preload();
  assert.equal(
    contexts.length,
    beforeContexts,
    'Preload must not consume gesture-dependent audio setup',
  );
  assert.equal(media.length, beforeMedia + 1, 'Preload must reuse the same element');
  const element = media.at(-1);
  assert.equal(element.preload, 'auto');
  assert.equal(element.loop, true);
  assert.equal(element.playsInline, true);
  assert.equal(element.loads, 1);
  assert.equal(element.plays, 0);
  assert.equal(await song.play(), true);
  assert.equal(song.session.media, element);
});

await test('explicit preparation downloads once and waits for decoded media before Play', async () => {
  const song = player(),
    beforeContexts = contexts.length;
  let downloads = 0,
    finished = false;
  const preparing = song.prepare(async () => {
    downloads++;
    return new Uint8Array([1, 2, 3]).buffer;
  });
  assert.equal(song.prepare(), preparing, 'Concurrent preparations share one download');
  preparing.then(() => (finished = true));
  await turn();
  assert.equal(finished, false, 'Downloaded bytes alone do not mean media can play');
  assert.equal(downloads, 1);
  assert.equal(contexts.length, beforeContexts);
  const element = song.media;
  assert.ok(element.src.startsWith('blob:'));
  assert.equal(element.plays, 0);
  element.readyState = 4;
  element.buffered = { length: 1, end: () => 285.24 };
  element.dispatchEvent(new Event('canplay'));
  assert.equal(await preparing, true);
  assert.equal(song.status().prepared, true);
  assert.equal(await promptly(song.play()), true);
  assert.equal(song.session.media, element);
  assert.equal(song.status().startup.initialBufferedSeconds, 285.24);
  assert.equal(song.status().startup.initialReadyState, 4);
  assert.ok(song.status().startup.readyMs < 100);
  song.pause();
  assert.equal(song.media, element);
  assert.ok(song.objectURL);
  song.dispose();
  assert.equal(song.objectURL, null);
  assert.equal(song.media, null);
});

await test('failed preparation falls back to the streaming player', async () => {
  const song = player();
  assert.equal(
    await song.prepare(async () => {
      throw new Error('Network offline');
    }),
    false,
  );
  assert.equal(song.media.src, song.url.href);
  assert.equal(song.prepared, false);
  assert.equal(await song.play(), true);
});

await test('slow download times out without holding the scene forever', async () => {
  const song = player();
  let aborted = false;
  const result = await song.prepare(
    (signal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('Timed out'));
        });
      }),
    { timeoutMs: 10 },
  );
  assert.equal(result, false);
  assert.equal(aborted, true);
  assert.equal(song.media.src, song.url.href);
});

await test('decoder timeout releases the blob and falls back', async () => {
  const song = player();
  assert.equal(await song.prepare(async () => new ArrayBuffer(8), { timeoutMs: 10 }), false);
  assert.equal(song.objectURL, null);
  assert.equal(song.media.src, song.url.href);
});

await test('dispose during preparation cannot revive the player', async () => {
  const song = player(),
    download = deferred();
  const preparing = song.prepare(() => download.promise);
  song.dispose();
  download.resolve(new ArrayBuffer(8));
  assert.equal(await preparing, false);
  assert.equal(song.media, null);
  assert.equal(song.objectURL, null);
});

await test('a late download cannot replace music already started by the user', async () => {
  const song = player(),
    download = deferred();
  const preparing = song.prepare(() => download.promise);
  await song.play();
  const active = song.media;
  download.resolve(new ArrayBuffer(8));
  assert.equal(await preparing, false);
  assert.equal(song.media, active);
  assert.equal(song.phase, 'connected');
  assert.equal(song.objectURL, null);
});

await test('tap synchronously starts context resume and media playback with one speaker route', async () => {
  const song = player(),
    start = song.play(),
    session = song.session;
  assert.equal(session.context.resumes, 1);
  assert.equal(session.media.plays, 1);
  assert(audible(session));
  assert.equal(await start, true);
  await turn();
  assert.equal(session.source.speakerConnects, 1);
  assert(audible(session));
});

await test('slow analysis never disconnects speakers or delays connected playback', async () => {
  const song = player(),
    analysis = deferred();
  song.prepareAnalysis = async (session) => {
    await analysis.promise;
    session.engine = 'controlled';
    return true;
  };
  const start = song.play();
  try {
    await turn();
    assert(audible(song.session), 'Speaker route was removed while analysis loaded');
    assert.equal(await promptly(start), true);
    assert.equal(song.phase, 'connected');
    assert.equal(
      song.sample(0.016).energy,
      0,
      'Pending analyzer must safely return quiet features',
    );
    assert.equal(song.session.source.speakerConnects, 1);
  } finally {
    analysis.resolve();
    await start;
  }
});

await test('pause and resume while analysis loads share setup and preserve track position', async () => {
  const song = player(),
    analysis = deferred();
  let setups = 0;
  song.prepareAnalysis = async (session) => {
    setups++;
    await analysis.promise;
    session.engine = 'controlled';
    return true;
  };
  const first = song.play();
  try {
    assert.equal(await promptly(first), true);
    const session = song.session;
    session.media.currentTime = 42;
    song.pause();
    assert.equal(song.sample(0.016).energy, 0);
    assert.equal(session.media.paused, true);
    assert.equal(await promptly(song.play()), true);
    assert.equal(song.session, session);
    assert.equal(session.media.currentTime, 42);
    assert.equal(setups, 1);
    assert(audible(session));
    assert.equal(session.source.speakerConnects, 1);
    analysis.resolve();
    await turn();
    assert.equal(song.phase, 'connected');
    assert(audible(session));
  } finally {
    analysis.resolve();
    await first;
  }
});

await test('blocked autoplay retries on one gesture with the same media and speaker route', async () => {
  const song = player();
  blocked = true;
  assert.equal(await song.play(), false);
  assert.equal(song.phase, 'blocked');
  const session = song.session;
  assert.equal(session.media.paused, true);
  blocked = false;
  assert.equal(await song.play(), true);
  assert.equal(song.session, session);
  assert.equal(song.phase, 'connected');
  await turn();
  assert(audible(session));
  assert.equal(session.source.speakerConnects, 1);
});

await test('pause cancels network-pending play and later resume succeeds', async () => {
  const song = player();
  pendingPlay = deferred();
  const start = song.play(),
    session = song.session;
  assert.equal(song.phase, 'starting');
  song.pause();
  pendingPlay.resolve();
  pendingPlay = null;
  assert.equal(await start, false);
  assert.equal(song.phase, 'paused');
  assert.equal(session.media.paused, true);
  assert.equal(await song.play(), true);
  assert.equal(song.session, session);
  assert(audible(session));
});

await test('dispose during analysis startup closes audio and ignores late readiness', async () => {
  const song = player(),
    analysis = deferred();
  song.prepareAnalysis = async (session) => {
    await analysis.promise;
    session.engine = 'controlled';
    return !session.closed;
  };
  const start = song.play();
  try {
    assert.equal(await promptly(start), true);
    const session = song.session;
    song.dispose();
    analysis.resolve();
    await turn();
    assert.equal(song.session, null);
    assert.equal(song.phase, 'idle');
    assert.equal(session.context.state, 'closed');
    assert.equal(session.media.paused, true);
    assert.equal(session.source.targets.size, 0);
  } finally {
    analysis.resolve();
    await start;
  }
});

await test('failed worklet loading falls back without removing direct audio output', async () => {
  pendingModule = deferred();
  globalThis.Worker = class {
    terminate() {}
    postMessage() {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
    }
  };
  globalThis.AudioWorkletNode = class extends AudioNode {
    constructor() {
      super();
      this.port = {};
    }
  };
  const song = player(),
    start = song.play();
  try {
    await turn();
    assert(audible(song.session), 'Speaker route must remain while worklet downloads');
    assert.equal(await promptly(start), true);
    assert.equal(song.phase, 'connected');
    pendingModule.reject(new Error('Offline worklet'));
    await turn();
    await turn();
    assert.equal(song.session.engine, 'basic-fallback');
    assert(audible(song.session), 'Fallback must preserve speakers');
    assert.equal(song.session.source.speakerConnects, 1);
    assert.equal(song.sample(0.016).energy, 0);
  } finally {
    pendingModule.reject(new Error('Offline worklet'));
    await start;
  }
});

await test('all initialized contexts are closed after player disposal', async () => {
  assert(contexts.every((context) => context.state === 'closed'));
});
const report = {
  passed: results.every((result) => result.passed),
  verified_utc: new Date().toISOString(),
  checks: results,
  limits:
    'Controlled browser API mocks. Actual browser decoding, audible playback timing, phone network behavior and physical iOS gesture acceptance require separate validation.',
};
const receipt = new URL('../.local/qa/music-startup/verification.json', import.meta.url);
await fs.mkdir(new URL('../.local/qa/music-startup/', import.meta.url), { recursive: true });
await fs.writeFile(receipt, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
