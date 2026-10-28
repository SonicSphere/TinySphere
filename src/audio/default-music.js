import { TabAudio, LiveMusicAnalysis, quietAudio } from './audio.js';
import { musicAsset } from '../load-manifest.js';

function readyToPlay(media, signal) {
  if (media.readyState >= 3) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      media.removeEventListener('canplay', ready);
      media.removeEventListener('error', failed);
      signal.removeEventListener('abort', cancelled);
      error ? reject(error) : resolve();
    };
    const ready = () => finish(),
      failed = () => finish(new Error('Music could not be prepared'));
    const cancelled = () => finish(new Error('Music preparation cancelled'));
    media.addEventListener('canplay', ready);
    media.addEventListener('error', failed);
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) cancelled();
  });
}

// The media source plays once, directly to the speakers. Its parallel capture
// worklet emits silence and supplies the same local analysis as desktop tabs.
export class DefaultMusic extends TabAudio {
  constructor(onChange = () => {}) {
    super(onChange);
    this.message = 'Tree Voices';
    this.url = new URL('../' + musicAsset.path, import.meta.url);
    this.url.searchParams.set('v', musicAsset.revision);
    this.starting = null;
    this.intent = 0;
    this.media = null;
    this.objectURL = null;
    this.prepared = false;
    this.preparing = null;
    this.preparationController = null;
    this.startup = null;
  }
  prepare(
    loadAudio = async (signal) => {
      const response = await fetch(this.url, { signal, cache: 'force-cache' });
      if (!response.ok) throw new Error('Music could not load');
      return response.arrayBuffer();
    },
    { timeoutMs = 8000 } = {},
  ) {
    if (this.preparing) return this.preparing;
    if (this.media) return Promise.resolve(this.prepared);
    const generation = this.generation,
      controller = new AbortController();
    this.preparationController = controller;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const current = () => generation === this.generation;
    const operation = (async () => {
      try {
        const bytes = await loadAudio(controller.signal);
        if (!current() || controller.signal.aborted || this.media) return false;
        this.objectURL = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
        const media = this.preload();
        await readyToPlay(media, controller.signal);
        if (!current()) return false;
        this.prepared = true;
        return true;
      } catch {
        if (!current()) return false;
        // An unavailable download/decoder must not prevent the sphere opening.
        // Keep the ordinary streaming player as a retry path.
        if (this.media && !this.session) {
          this.media.removeAttribute('src');
          this.media.load();
          this.media = null;
        }
        if (this.objectURL) {
          URL.revokeObjectURL(this.objectURL);
          this.objectURL = null;
        }
        this.preload();
        return false;
      } finally {
        clearTimeout(timer);
        if (this.preparationController === controller) this.preparationController = null;
      }
    })();
    this.preparing = operation;
    operation.finally(() => {
      if (this.preparing === operation) this.preparing = null;
    });
    return operation;
  }
  preload() {
    if (this.media && !this.media.error) return this.media;
    const media = new Audio(this.objectURL || this.url.href);
    media.loop = true;
    media.preload = 'auto';
    media.playsInline = true;
    this.media = media;
    media.load();
    return media;
  }
  status() {
    const media = this.session?.media ?? this.media;
    return {
      ...super.status(),
      source: 'tree-voices',
      title: 'Tree Voices',
      paused: media?.paused ?? true,
      currentTime: media?.currentTime ?? 0,
      duration: media?.duration || null,
      prepared: this.prepared,
      preparing: !!this.preparing,
      readyState: media?.readyState ?? 0,
      bufferedSeconds: media?.buffered?.length ? media.buffered.end(media.buffered.length - 1) : 0,
      startup: this.startup ? { ...this.startup } : null,
    };
  }
  play() {
    if (this.phase === 'starting' && this.starting) return this.starting;
    const intent = ++this.intent;
    const operation = this.start(intent);
    this.starting = operation;
    operation.finally(() => {
      if (this.starting === operation) this.starting = null;
    });
    return operation;
  }
  async start(intent) {
    let session = this.session;
    const current = () => intent === this.intent && session === this.session && !session?.closed;
    try {
      if (!session || session.closed || session.media.error) {
        this.release(session);
        const media = this.preload();
        session = { closed: false, media, channels: 2 };
        this.session = session;
        this.generation++;
        session.context = new AudioContext({ latencyHint: 'interactive' });
        session.source = session.context.createMediaElementSource(media);
        session.source.connect(session.context.destination);
        media.addEventListener('error', () => {
          if (this.session !== session || session.closed) return;
          this.features = quietAudio();
          this.changed('error', 'Tree Voices could not load. Try again.');
          media.pause();
        });
        media.addEventListener('pause', () => {
          if (this.session === session && this.phase === 'connected') {
            this.features = quietAudio();
            this.changed('paused', 'Tree Voices paused');
          }
        });
        session.context.addEventListener('statechange', () => {
          if (
            this.session === session &&
            this.phase === 'connected' &&
            session.context.state !== 'running'
          )
            media.pause();
        });
      }
      const started = performance.now();
      const startup = {
        prepared: this.prepared,
        initialReadyState: session.media.readyState ?? 0,
        initialBufferedSeconds: this.status().bufferedSeconds,
        mediaStartedMs: null,
        readyMs: null,
      };
      this.startup = startup;
      this.changed('starting', 'Starting Tree Voices');
      const generation = this.generation;
      // Start both synchronously in the tap handler. Awaiting either one first
      // can lose the browser's transient permission to start audible playback.
      const resumed = session.context.resume().then(
        () => null,
        (error) => error,
      );
      const playing = session.media.play();
      session.latest = null;
      session.minimumAudioTime = session.context.currentTime;
      if (session.analysis) session.analysis = new LiveMusicAnalysis(session.context.sampleRate);
      session.lastAudioTime = session.context.currentTime;
      await playing;
      startup.mediaStartedMs = performance.now() - started;
      if (!current()) return false;
      let timer;
      await Promise.race([
        resumed,
        new Promise((resolve) => {
          timer = setTimeout(resolve, 1200);
        }),
      ]);
      clearTimeout(timer);
      if (!current()) return false;
      if (session.context.state !== 'running') {
        session.media.pause();
        this.changed('blocked', 'Play Tree Voices');
        return false;
      }
      if (!session.engine) {
        // A pause and immediate resume may overlap first-time setup. Share
        // that setup, keeping the direct speaker route audible throughout.
        if (!session.analysisStarting) {
          session.analysisStarting = this.prepareAnalysis(session, generation)
            .catch(() => {
              if (this.session === session && !session.closed)
                this.disconnect('Music analysis stopped.');
              return false;
            })
            .finally(() => {
              session.analysisStarting = null;
            });
        }
      }
      if (!current() || session.media.paused) return false;
      startup.readyMs = performance.now() - started;
      this.changed('connected', 'Tree Voices');
      return true;
    } catch (error) {
      if (!current()) return false;
      session?.media?.pause();
      this.features = quietAudio();
      const blocked = error.name === 'NotAllowedError';
      if (!blocked) this.dispose();
      this.changed(
        blocked ? 'blocked' : 'error',
        blocked ? 'Play Tree Voices' : 'Tree Voices could not play. Try again.',
      );
      return false;
    }
  }
  pause() {
    this.intent++;
    this.session?.media?.pause();
    if (this.session) this.session.latest = null;
    this.features = quietAudio();
    this.changed('paused', 'Tree Voices paused');
  }
  disconnect(message) {
    if (!message) {
      this.pause();
      return;
    }
    // Worker failures must discard the broken session so the next tap can
    // create a working analyser instead of resuming a terminated engine.
    this.dispose();
    this.changed('error', 'Music analysis stopped. Play Tree Voices to try again.');
  }
  dispose() {
    this.intent++;
    this.generation++;
    this.preparationController?.abort();
    this.prepared = false;
    const session = this.session;
    this.session = null;
    session?.media?.pause();
    this.release(session);
    const media = this.media;
    this.media = null;
    if (media) {
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
    if (this.objectURL) {
      URL.revokeObjectURL(this.objectURL);
      this.objectURL = null;
    }
    this.features = quietAudio();
    this.phase = 'idle';
    this.message = 'Tree Voices';
  }
}
