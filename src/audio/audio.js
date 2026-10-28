// Local analysis only. The capture worklet emits silence, never duplicated music.
import { MusicStructure } from './music-structure.js';
import { supportsTabAudio } from './audio-support.js';
const clamp = (x) => Math.max(0, Math.min(1, x));
const ease = (from, to, dt, seconds) => from + (to - from) * (1 - Math.exp(-dt / seconds));
export const EQ_EDGES = [25, 50, 90, 160, 280, 500, 900, 1600, 3000, 6000, 12000];
export const quietAudio = () => ({
  bass: 0,
  mid: 0,
  high: 0,
  energy: 0,
  bassHit: 0,
  highHit: 0,
  onset: 0,
  left: 0,
  right: 0,
  balance: 0,
  rms: 0,
  bands: Array(10).fill(0),
  subBass: 0,
  subHit: 0,
});

export class StereoAnalysis {
  constructor(sampleRate, fftSize = 2048) {
    const bins = ([a, b]) => [
      Math.max(1, Math.floor((a * fftSize) / sampleRate)),
      Math.min(fftSize / 2, Math.ceil((b * fftSize) / sampleRate)),
    ];
    this.ranges = [
      [30, 220],
      [220, 2500],
      [2500, 11000],
    ].map(bins);
    this.eqRanges = EQ_EDGES.slice(0, -1).map((a, i) => bins([a, EQ_EDGES[i + 1]]));
    this.subRange = bins([20, 70]);
    this.eqReference = Array(10).fill(0);
    this.eqLevels = Array(10).fill(0);
    this.subReference = 0;
    this.previousSub = 0;
    this.subLevel = 0;
    this.reference = [0, 0, 0];
    this.previous = [0, 0, 0];
    this.level = [0, 0, 0];
    this.clock = 0;
    this.lastBass = -1;
    this.lastHigh = -1;
    this.balance = 0;
    this.current = quietAudio();
    this.fluxPrevious = Array(10).fill(0);
    this.fluxMean = 0;
    this.fluxDeviation = 0;
    this.lastFlux = -1;
  }
  process(spectra, waves, dt, channels = 2) {
    dt = Math.max(0, Math.min(0.1, dt));
    this.clock += dt;
    const rms = waves.map((w) =>
      Math.sqrt(
        w.reduce((sum, x) => sum + (Number.isFinite(x) ? x * x : 0), 0) / Math.max(1, w.length),
      ),
    );
    if (channels === 1) rms[1] = rms[0];
    const absolute = Math.hypot(...rms) / Math.SQRT2,
      gate = clamp((absolute - 0.00015) / 0.00105);
    const bandPower = ([start, end]) => {
      const sum = (spec) => {
        let v = 0;
        for (let k = start; k < end; k++) if (Number.isFinite(spec[k])) v += 10 ** (spec[k] / 10);
        return v / Math.max(1, end - start);
      };
      const left = sum(spectra[0]),
        right = channels === 1 ? left : sum(spectra[1]);
      return (left + right) * 0.5;
    };
    const power = this.ranges.map(bandPower),
      eqPower = this.eqRanges.map(bandPower);
    let flux = 0,
      weighted = 0,
      spectralPower = 0;
    for (let k = 0; k < 10; k++) {
      const magnitude = Math.log1p(Math.sqrt(eqPower[k]) * 1000);
      // The neighboring-bin maximum reduces false novelty from vibrato.
      const previous = Math.max(...this.fluxPrevious.slice(Math.max(0, k - 1), k + 2));
      flux += Math.max(0, magnitude - previous);
      weighted += eqPower[k] * (k / 9);
      spectralPower += eqPower[k];
    }
    flux /= 10;
    this.fluxPrevious = eqPower.map((v) => Math.log1p(Math.sqrt(v) * 1000));
    const threshold = this.fluxMean + Math.max(0.012, this.fluxDeviation * 1.8);
    const fluxHit =
      gate > 0.1 && flux > threshold && this.clock - this.lastFlux > 0.12
        ? clamp((flux - threshold) / Math.max(0.03, threshold))
        : 0;
    if (fluxHit) this.lastFlux = this.clock;
    if (gate > 0.05) {
      this.fluxMean = ease(this.fluxMean, flux, dt, 1.8);
      this.fluxDeviation = ease(this.fluxDeviation, Math.abs(flux - this.fluxMean), dt, 1.8);
    }
    for (let k = 0; k < 10; k++) {
      if (!this.eqReference[k] && gate > 0) this.eqReference[k] = eqPower[k];
      const target =
        clamp(Math.sqrt(eqPower[k] / Math.max(1e-10, this.eqReference[k])) * 0.55) * gate;
      this.eqLevels[k] = ease(
        this.eqLevels[k],
        target,
        dt,
        target > this.eqLevels[k] ? 0.025 : 0.22,
      );
      if (gate > 0.05) this.eqReference[k] = ease(this.eqReference[k], eqPower[k], dt, 6);
    }
    const subPower = bandPower(this.subRange);
    if (!this.subReference && gate > 0) this.subReference = subPower;
    const subRelative = subPower / Math.max(1e-10, this.subReference);
    const totalPower = power.reduce(
      (sum, v, k) => sum + v * (this.ranges[k][1] - this.ranges[k][0]),
      0,
    );
    const subPresence = clamp(
      ((subPower * (this.subRange[1] - this.subRange[0])) / Math.max(totalPower, 1e-10)) * 3,
    );
    const subRise = Math.max(
      0,
      (subPower - this.previousSub) / Math.max(subPower, this.subReference, 1e-10),
    );
    const subHit = subRelative > 0.7 ? clamp((subRise - 0.18) * 1.5) * gate * subPresence : 0;
    const subTarget = clamp(Math.sqrt(subRelative) * 0.5) * gate * subPresence;
    this.subLevel = ease(this.subLevel, subTarget, dt, subTarget > this.subLevel ? 0.03 : 0.25);
    if (gate > 0.05) this.subReference = ease(this.subReference, subPower, dt, 6);
    this.previousSub = subPower;
    const hits = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      if (!this.reference[k] && gate > 0) this.reference[k] = power[k];
      const relative = power[k] / Math.max(1e-10, this.reference[k]);
      const rise = Math.max(
        0,
        (power[k] - this.previous[k]) / Math.max(power[k], this.reference[k], 1e-10),
      );
      hits[k] = relative > 0.7 && rise > 0.18 ? clamp((rise - 0.18) * 1.5) * gate : 0;
      const target = clamp(Math.sqrt(relative) * 0.42) * gate;
      this.level[k] = ease(this.level[k], target, dt, target > this.level[k] ? 0.045 : 0.38);
      if (gate > 0.05) this.reference[k] = ease(this.reference[k], power[k], dt, 6);
      this.previous[k] = power[k];
    }
    const bassHit = this.clock - this.lastBass > 0.3 ? hits[0] : 0,
      highHit = this.clock - this.lastHigh > 0.16 ? hits[2] : 0;
    if (bassHit) this.lastBass = this.clock;
    if (highHit) this.lastHigh = this.clock;
    const balance =
      channels === 1 ? 0 : (rms[1] ** 2 - rms[0] ** 2) / (rms[0] ** 2 + rms[1] ** 2 + 1e-12);
    this.balance = ease(this.balance, balance * gate, dt, 0.15);
    this.current = {
      bass: this.level[0],
      mid: this.level[1],
      high: this.level[2],
      energy: Math.max(...this.level),
      bassHit,
      highHit,
      onset: Math.max(fluxHit, bassHit, hits[1] * 0.7, hits[2] * 0.35),
      left: clamp(rms[0] * 5),
      right: clamp(rms[1] * 5),
      balance: this.balance,
      rms: absolute,
      bands: [...this.eqLevels],
      subBass: this.subLevel,
      subHit,
      rawBass: Math.sqrt(subPower),
      loudnessDb: 20 * Math.log10(Math.max(1e-6, absolute)),
      centroid: weighted / Math.max(1e-12, spectralPower),
      flux,
    };
    return this.current;
  }
}

export class TabAudio {
  constructor(onChange = () => {}) {
    this.onChange = onChange;
    this.generation = 0;
    this.session = null;
    this.phase = 'idle';
    this.message = 'Choose a music tab and enable Share tab audio.';
    this.features = quietAudio();
  }
  status() {
    return {
      phase: this.phase,
      message: this.message,
      channels: this.session?.channels ?? 0,
      context: this.session?.context?.state ?? null,
      engine: this.session?.engine ?? null,
      analysisMs: this.session?.analysisMs ?? 0,
      skippedBlocks: this.session?.skipped ?? 0,
      muted: !!this.session?.stream?.getAudioTracks()[0]?.muted,
      features: { ...this.features },
    };
  }
  changed(phase, message) {
    this.phase = phase;
    this.message = message;
    this.onChange(this.status());
  }
  release(session) {
    if (!session || session.closed) return;
    session.closed = true;
    session.worker?.terminate();
    session.capture?.disconnect();
    for (const track of session.stream?.getTracks() ?? []) {
      track.removeEventListener('ended', session.ended);
      track.stop();
    }
    session.source?.disconnect();
    session.splitter?.disconnect();
    if (session.context?.state !== 'closed') session.context?.close().catch(() => {});
  }
  disconnect(message = 'Music disconnected. The ambient flow continues.') {
    this.generation++;
    this.release(this.session);
    this.session = null;
    this.features = quietAudio();
    this.changed('idle', message);
  }
  async connect() {
    if (this.phase === 'choosing' || this.phase === 'connected') return false;
    if (!supportsTabAudio()) {
      this.changed('error', 'Open this studio in desktop Chrome to listen to another tab.');
      return false;
    }
    const generation = ++this.generation,
      session = { closed: false };
    this.session = session;
    this.changed('choosing', 'Select the music tab, enable Share tab audio, then return here.');
    try {
      session.context = new AudioContext({ latencyHint: 'interactive' });
      const resume = session.context.resume().then(
        () => null,
        (error) => error,
      );
      // Start capture before awaiting anything: the browser needs the button's user gesture.
      const capture = navigator.mediaDevices
        .getDisplayMedia({
          video: { displaySurface: 'browser', frameRate: 1, width: 320, height: 180 },
          audio: {
            channelCount: 2,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            suppressLocalAudioPlayback: false,
          },
          selfBrowserSurface: 'exclude',
          monitorTypeSurfaces: 'exclude',
          systemAudio: 'exclude',
          windowAudio: 'exclude',
          surfaceSwitching: 'exclude',
        })
        .then((stream) => {
          session.stream = stream;
          if (session.closed) for (const track of stream.getTracks()) track.stop();
          return stream;
        });
      const stream = await capture;
      if (generation !== this.generation) {
        this.release(session);
        return false;
      }
      const audio = stream.getAudioTracks()[0],
        video = stream.getVideoTracks()[0];
      if (!audio)
        throw new Error('No audio was shared. Choose the music tab and enable Share tab audio.');
      const surface = video?.getSettings().displaySurface;
      if (surface && surface !== 'browser')
        throw new Error('Choose a Chrome tab as the music source.');
      const resumeError = await resume;
      if (resumeError) throw resumeError;
      if (generation !== this.generation) {
        this.release(session);
        return false;
      }
      session.channels = audio.getSettings().channelCount ?? 0;
      session.source = session.context.createMediaStreamSource(new MediaStream([audio]));
      if (!(await this.prepareAnalysis(session, generation))) return false;
      session.ended = () => {
        if (this.session === session)
          this.disconnect('Tab sharing stopped. Choose a tab to listen again.');
      };
      for (const track of stream.getTracks()) track.addEventListener('ended', session.ended);
      if (audio.readyState === 'ended' || video?.readyState === 'ended')
        throw new Error('Tab sharing ended before the audio connected.');
      this.changed(
        'connected',
        (session.channels === 1 ? 'Connected · mono input' : 'Connected · tab audio') +
          (session.engine === 'streaming-worker'
            ? ' · live musical analysis'
            : ' · basic analysis'),
      );
      return true;
    } catch (error) {
      this.release(session);
      if (generation !== this.generation) return false;
      this.session = null;
      this.features = quietAudio();
      const message =
        error.name === 'NotAllowedError'
          ? 'Nothing connected. Choose a tab and allow sharing to begin.'
          : error.name === 'InvalidStateError'
            ? 'Bring this Chrome tab to the front, then click Listen to a tab again.'
            : error.message || 'Audio could not connect. Try desktop Chrome.';
      this.changed(error.name === 'NotAllowedError' ? 'idle' : 'error', message);
      return false;
    }
  }
  async prepareAnalysis(session, generation) {
    if (session.context.audioWorklet && globalThis.Worker && globalThis.AudioWorkletNode) {
      try {
        await session.context.audioWorklet.addModule(
          new URL('./music-capture-worklet.js', import.meta.url),
        );
        if (generation !== this.generation) {
          this.release(session);
          return false;
        }
        session.capture = new AudioWorkletNode(session.context, 'sphere-music-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCountMode: 'max',
        });
        session.worker = new Worker(new URL('./music-worker.js', import.meta.url), {
          type: 'module',
        });
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Music analysis did not start.')),
            4000,
          );
          session.worker.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Music analysis could not start.'));
          };
          session.worker.onmessage = (e) => {
            if (e.data.type === 'ready') {
              clearTimeout(timeout);
              resolve();
            }
            if (e.data.type === 'features' && !session.closed) {
              Object.assign(session, {
                latest: e.data.features,
                audioTime: e.data.audioTime,
                receivedAt: performance.now(),
                analysisMs: e.data.analysisMs,
                skipped: e.data.skipped,
              });
            }
          };
          session.worker.postMessage(
            { port: session.capture.port, sampleRate: session.context.sampleRate },
            [session.capture.port],
          );
        });
        if (generation !== this.generation) {
          this.release(session);
          return false;
        }
        session.source.connect(session.capture);
        session.capture.connect(session.context.destination);
        session.engine = 'streaming-worker';
        session.capture.onprocessorerror = () => {
          if (this.session === session)
            this.disconnect('Music analysis stopped. Reconnect the music tab.');
        };
        session.worker.onerror = () => {
          if (this.session === session)
            this.disconnect('Music analysis stopped. Reconnect the music tab.');
        };
      } catch (error) {
        // Only discard the analysis branch. Default music has a separate
        // direct speaker connection that must survive slow/failed setup.
        session.worker?.terminate();
        session.worker = null;
        if (session.capture) {
          try {
            session.source.disconnect(session.capture);
          } catch {}
          session.capture.disconnect();
          session.capture = null;
        }
        if (generation !== this.generation) {
          this.release(session);
          return false;
        }
        session.engine = 'basic-fallback';
      }
    }
    if (!session.capture) {
      session.splitter = session.context.createChannelSplitter(2);
      session.splitter.channelInterpretation = 'discrete';
      session.source.connect(session.splitter);
      session.analysers = [0, 1].map((i) => {
        const node = session.context.createAnalyser();
        node.fftSize = 2048;
        node.smoothingTimeConstant = 0;
        session.splitter.connect(node, i);
        return node;
      });
      session.spectra = session.analysers.map(() => new Float32Array(1024));
      session.waves = session.analysers.map(() => new Float32Array(2048));
      session.analysis = new LiveMusicAnalysis(session.context.sampleRate);
      session.engine = 'basic-fallback';
      session.lastAudioTime = session.context.currentTime;
    }
    return generation === this.generation && !session.closed;
  }
  sample(dt) {
    const s = this.session;
    if (
      this.phase !== 'connected' ||
      !s ||
      !s.engine ||
      s.context.state !== 'running' ||
      s.stream?.getAudioTracks()[0]?.muted ||
      s.media?.paused
    ) {
      this.features = quietAudio();
      return this.features;
    }
    if (s.capture) {
      if (
        !s.latest ||
        s.audioTime < (s.minimumAudioTime ?? -Infinity) ||
        performance.now() - s.receivedAt > 500 ||
        s.context.currentTime - s.audioTime > 0.5
      ) {
        this.features = quietAudio();
        return this.features;
      }
      const age = Math.max(0, Math.min(0.5, s.context.currentTime - s.audioTime)),
        latest = s.latest;
      const tempo = {
        ...latest.tempo,
        phase: (latest.tempo.phase + age / latest.tempo.period) % 1,
        pulse: latest.tempo.pulse * Math.exp(-age / Math.max(0.055, latest.tempo.period * 0.18)),
      };
      this.features = {
        ...latest,
        tempo,
        structure: { ...latest.structure, drop: latest.structure.drop * Math.exp(-age / 0.65) },
      };
      return this.features;
    }
    for (let i = 0; i < 2; i++) {
      s.analysers[i].getFloatFrequencyData(s.spectra[i]);
      s.analysers[i].getFloatTimeDomainData(s.waves[i]);
    }
    const elapsed = s.context.currentTime - s.lastAudioTime;
    s.lastAudioTime = s.context.currentTime;
    if (elapsed > 0.5) s.analysis = new LiveMusicAnalysis(s.context.sampleRate);
    this.features = s.analysis.process(
      s.spectra,
      s.waves,
      Math.max(0, Math.min(0.1, elapsed || dt)),
      s.channels,
    );
    return this.features;
  }
}

export class BeatClock {
  constructor() {
    this.time = 0;
    this.events = [];
    this.period = 0.5;
    this.bpm = 0;
    this.confidence = 0;
    this.phase = 0;
    this.count = 0;
    this.lastOnset = -10;
    this.lastFit = 0;
    this.lastPulse = -10;
  }
  estimate() {
    let best = null;
    // shortcut: choose a pulse between 70 and 180 BPM; half/double-time readings are possible.
    for (let bpm = 70; bpm <= 180; bpm++) {
      const period = 60 / bpm;
      let score = 0,
        total = 0;
      for (let j = 1; j < this.events.length; j++)
        for (let i = 0; i < j; i++) {
          const distance = this.events[j].at - this.events[i].at,
            cycles = Math.round(distance / period);
          if (cycles < 1 || cycles > 8) continue;
          const weight = (this.events[i].power * this.events[j].power) / Math.sqrt(cycles);
          const error = (distance - cycles * period) / 0.035;
          score += weight * Math.exp(-error * error * 0.5);
          total += weight;
        }
      const continuity = this.bpm ? Math.exp(-(((bpm - this.bpm) / 10) ** 2)) * 0.06 : 0;
      const rank = score * (1 + continuity);
      if (!best || rank > best.rank)
        best = { bpm, period, rank, confidence: score / Math.max(total, 1e-6) };
    }
    if (best && best.confidence > 0.28) {
      if (!this.bpm || Math.abs(best.bpm - this.bpm) > 4) {
        const peak = Math.max(...this.events.map((e) => e.power));
        const anchor = this.events.findLast((e) => e.power >= peak * 0.7);
        this.phase = ((this.time - anchor.at) / best.period) % 1;
      }
      this.bpm = best.bpm;
      this.period = best.period;
      this.confidence = best.confidence;
    }
  }
  advance(features, dt) {
    this.time += dt;
    const audible = features.rms > 0.0003 && features.energy > 0.025;
    const strength = clamp(features.onset ?? Math.max(features.bassHit, features.highHit * 0.35));
    const onset = audible && strength > 0.08 && this.time - this.lastOnset > 0.18,
      resuming = onset && this.time - this.lastOnset > 2;
    if (onset) {
      this.lastOnset = this.time;
      this.events.push({ at: this.time, power: strength });
    }
    this.events = this.events.filter((e) => this.time - e.at < 10);
    if (this.events.length >= 4 && this.time - this.lastFit > 0.4) {
      this.estimate();
      this.lastFit = this.time;
    }
    const confidence = this.confidence * Math.exp(-Math.max(0, this.time - this.lastOnset - 2) / 2);
    const tracking = this.bpm > 0 && confidence > 0.28 && audible;
    this.phase += dt / this.period;
    let beat = false;
    if (this.phase >= 1) {
      this.phase %= 1;
      beat = tracking;
    }
    if (onset) {
      if (!tracking || resuming) {
        beat = true;
        this.phase = 0;
      } else if (this.phase < 0.22 || this.phase > 0.78) {
        if (this.time - this.lastPulse > this.period * 0.55) {
          beat = true;
          this.phase = 0;
        } else if (this.phase < 0.22) this.phase *= 0.65;
      }
    }
    if (beat && this.time - this.lastPulse > this.period * 0.55) {
      this.count++;
      this.lastPulse = this.time;
    } else beat = false;
    const pulse = audible
      ? Math.exp(-(this.time - this.lastPulse) / Math.max(0.055, this.period * 0.18))
      : 0;
    return {
      bpm: this.bpm,
      confidence,
      tracking,
      phase: this.phase,
      count: this.count,
      beat,
      pulse,
      period: this.period,
    };
  }
}

export class MusicMotion {
  constructor() {
    this.time = 0;
    this.sequence = 0;
    this.waves = [];
    this.sparks = [];
    this.frame = null;
    this.beatClock = new BeatClock();
    this.lastStreamBeat = null;
    this.lastAnalysisFrame = -1;
    this.eqActive = false;
    this.lastSubBeat = 0;
    this.subAt = -100;
    this.subCount = 0;
    this.subPower = 0;
  }
  advance(features, dt, amount, eqActive = false, phrasing = true) {
    const tempo = features.tempo
      ? {
          ...features.tempo,
          beat: this.lastStreamBeat !== null && features.tempo.count > this.lastStreamBeat,
        }
      : this.beatClock.advance(features, dt);
    if (
      features.tempo &&
      this.lastStreamBeat !== null &&
      features.tempo.count < this.lastStreamBeat
    ) {
      this.lastSubBeat = tempo.count;
      this.subAt = -100;
    }
    if (features.tempo) this.lastStreamBeat = features.tempo.count;
    const fresh =
      features.analysisFrame === undefined || features.analysisFrame !== this.lastAnalysisFrame;
    this.lastAnalysisFrame = features.analysisFrame;
    this.time += dt;
    this.waves = this.waves.filter((w) => this.time - w.at < w.duration);
    this.sparks = this.sparks.filter((s) => this.time - s.at < 0.8);
    if (eqActive !== this.eqActive) {
      this.lastSubBeat = tempo.count;
      this.subAt = -100;
      this.eqActive = eqActive;
    }
    // shortcut: eight detected beats approximate two 4/4 bars; no downbeat/meter classifier.
    if (
      eqActive &&
      amount > 0 &&
      tempo.tracking &&
      (tempo.beat || tempo.phase < 0.18) &&
      tempo.count - this.lastSubBeat >= 8 &&
      ((features.subHit ?? 0) > 0.14 || (features.subBass ?? 0) > 0.42)
    ) {
      this.subAt = this.time;
      this.lastSubBeat = tempo.count;
      this.subPower = 0.7 + (features.subBass ?? 0) * 0.3;
      this.subCount++;
    }
    const subPulse =
      eqActive && features.rms > 0.0003
        ? Math.exp(-(this.time - this.subAt) / (tempo.period * 1.4)) * this.subPower
        : 0;
    const axis = () => {
      const t = ++this.sequence * 2.399963,
        x = Math.max(-0.95, Math.min(0.95, features.balance * 0.72 + 0.28 * Math.sin(t))),
        r = Math.sqrt(1 - x * x);
      return [x, r * Math.cos(t), r * Math.sin(t)];
    };
    if (amount > 0 && tempo.beat) {
      this.waves.push({
        at: this.time,
        axis: axis(),
        power: 0.65 + features.bass * 0.6,
        tint: (this.sequence * 0.37) % 1,
        duration: Math.min(1.6, tempo.period * 2),
      });
      this.waves = this.waves.slice(-4);
    }
    if (amount > 0 && (tempo.beat || (fresh && features.highHit > 0.16)))
      for (let i = 0; i < 3 && this.sparks.length < 15; i++)
        this.sparks.push({
          at: this.time,
          axis: axis(),
          power: tempo.beat ? 0.7 + features.high * 0.5 : features.highHit,
        });
    const rate =
      (tempo.bpm ? tempo.bpm / 120 : 1) *
      (0.18 +
        features.energy * 0.9 +
        tempo.pulse * 1.2 +
        (phrasing ? (features.structure?.crescendo ?? 0) : 0) * 0.5);
    this.frame = {
      ...features,
      tempo,
      subPulse,
      subCount: this.subCount,
      flowRate: 1 + amount * (rate - 1),
      amount,
      time: this.time,
      waves: this.waves.map((w) => ({ ...w, age: this.time - w.at })),
      sparks: this.sparks.map((s) => ({ ...s, age: this.time - s.at })),
    };
    return this.frame;
  }
}

export class LiveMusicAnalysis {
  constructor(sampleRate) {
    this.stereo = new StereoAnalysis(sampleRate);
    this.beat = new BeatClock();
    this.structure = new MusicStructure();
    this.silentFor = 0;
    this.frame = 0;
  }
  process(spectra, waves, dt, channels = 2) {
    const f = this.stereo.process(spectra, waves, dt, channels);
    this.silentFor = f.rms > 0.0003 ? 0 : this.silentFor + dt;
    if (this.silentFor > 3 && this.beat.bpm) this.beat = new BeatClock();
    const tempo = this.beat.advance(f, dt),
      structure = this.structure.advance(f, tempo, dt);
    return { ...f, tempo, structure, analysisFrame: ++this.frame };
  }
}
