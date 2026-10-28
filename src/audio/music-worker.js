import { StereoFFT } from './music-dsp.js';
import { LiveMusicAnalysis } from './audio.js';

self.onmessage = (e) => {
  const { port, sampleRate } = e.data;
  let fft = new StereoFFT(),
    analysis = new LiveMusicAnalysis(sampleRate),
    frames = 0,
    lastCount = 0,
    lastDrop = 0,
    lastTime = null,
    skipped = 0;
  port.onmessage = (event) => {
    const m = event.data;
    if (m.type !== 'pcm') return;
    const block = new Float32Array(m.buffer);
    skipped += m.skipped;
    // A dropped capture block is a discontinuity, never a musical onset or drop.
    if (m.skipped || (lastTime !== null && m.audioTime - lastTime > 0.1)) {
      fft = new StereoFFT();
      analysis = new LiveMusicAnalysis(sampleRate);
      lastCount = 0;
      lastDrop = 0;
    }
    lastTime = m.audioTime;
    if (fft.push(block)) {
      const started = performance.now(),
        f = analysis.process(fft.spectra, fft.waves, 512 / sampleRate, m.channels);
      if (++frames % 2 === 0 || f.tempo.count !== lastCount || f.structure.dropCount !== lastDrop) {
        self.postMessage({
          type: 'features',
          features: f,
          audioTime: m.audioTime,
          skipped,
          analysisMs: performance.now() - started,
        });
        lastCount = f.tempo.count;
        lastDrop = f.structure.dropCount;
      }
    }
    port.postMessage({ type: 'recycle', buffer: m.buffer }, [m.buffer]);
  };
  port.start();
  self.postMessage({ type: 'ready' });
};
