// Causal musical dynamics, inspired by Fosfora's pre-normalization structure cues.
// These are estimates for live visuals, not learned song or drop classification.
const clamp = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const smooth = (a, b, dt, t) => a + (b - a) * (1 - Math.exp(-dt / t));
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

export class MusicStructure {
  constructor() {
    this.time = 0;
    this.history = [];
    this.tick = 0;
    this.tickOnset = 0;
    this.audibleTime = 0;
    this.silentTime = 0;
    this.rise = 0;
    this.build = 0;
    this.breakdown = 0;
    this.lowFor = 0;
    this.armedUntil = -1;
    this.bassAbsentFor = 0;
    this.bassContextUntil = -1;
    this.peakBass = 0;
    this.peakDb = -100;
    this.lastDrop = -100;
    this.dropCount = 0;
    this.accents = [];
    this.lastBeat = 0;
    this.barOffset = 0;
    this.barConfidence = 0;
    this.barAnchor = null;
    this.lastLoudness = -100;
    this.current = this.empty();
  }
  empty() {
    return {
      crescendo: 0,
      buildup: 0,
      breakdown: 0,
      drop: 0,
      dropCount: this.dropCount,
      section: 'quiet',
      barBeat: 0,
      barConfidence: 0,
      barsSinceLock: 0,
      meter: 4,
      meterAssumed: true,
    };
  }
  advance(f, tempo, dt) {
    dt = Math.max(0, Math.min(0.15, dt));
    this.time += dt;
    this.tick += dt;
    const audible = f.rms > 0.0003 && f.energy > 0.025;
    this.tickOnset = Math.max(this.tickOnset, f.onset ?? 0);
    this.silentTime = audible ? 0 : this.silentTime + dt;
    this.audibleTime += audible ? dt : 0;
    if (this.silentTime > 3) {
      this.history.length = 0;
      this.audibleTime = 0;
      this.armedUntil = -1;
      this.bassContextUntil = -1;
      this.bassAbsentFor = 0;
      this.peakBass = 0;
      this.peakDb = -100;
      this.rise = 0;
      this.build = 0;
      this.breakdown = 0;
      this.lowFor = 0;
      this.accents.length = 0;
      this.barConfidence = 0;
      this.barAnchor = null;
      this.lastBeat = tempo.count;
      return (this.current = this.empty());
    }
    // Accents accumulate over several cycles; counting beats alone cannot locate a downbeat.
    if (tempo.beat && tempo.count !== this.lastBeat && audible) {
      this.lastBeat = tempo.count;
      this.accents.push({
        beat: tempo.count,
        value: clamp(f.subBass * 0.45 + f.bass * 0.2 + (f.onset ?? 0) * 0.35),
      });
      this.accents = this.accents.slice(-32);
      if (this.accents.length >= 12 && tempo.tracking) {
        const groups = [[], [], [], []];
        for (const a of this.accents) groups[a.beat % 4].push(a.value);
        const scores = groups.map(mean),
          rank = scores.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
        const evidence = clamp(((rank[0].v - rank[1].v) / Math.max(0.12, rank[0].v)) * 2);
        if (
          evidence > 0.2 &&
          (this.barConfidence < 0.2 ||
            rank[0].i === this.barOffset ||
            evidence > this.barConfidence + 0.2)
        )
          this.barOffset = rank[0].i;
        this.barConfidence = smooth(
          this.barConfidence,
          rank[0].i === this.barOffset ? evidence : 0,
          tempo.period,
          2,
        );
        if (this.barConfidence > 0.25 && this.barAnchor === null) this.barAnchor = tempo.count;
      }
    }
    // Run the longer history at 10 Hz, with actual amplitude before adaptive band gain.
    if (this.tick >= 0.1) {
      const tick = this.tick;
      this.tick = 0;
      const db = Number.isFinite(f.loudnessDb)
        ? f.loudnessDb
        : 20 * Math.log10(Math.max(1e-6, f.rms));
      const bass = Math.max(0, f.rawBass ?? f.rms * (f.subBass ?? 0));
      const centroid = f.centroid ?? 0;
      const previous = this.history.at(-1);
      const onset = this.tickOnset;
      this.tickOnset = 0;
      this.history.push({ at: this.time, db, bass, centroid, onset });
      this.history = this.history.filter((h) => this.time - h.at <= 10);
      const recent = this.history.filter((h) => this.time - h.at < 0.7);
      const earlier = this.history.filter((h) => this.time - h.at > 1.5 && this.time - h.at < 6);
      const recentDb = mean(recent.map((h) => h.db)),
        baseDb = earlier.length ? mean(earlier.map((h) => h.db)) : recentDb;
      const baseCentroid = mean(earlier.map((h) => h.centroid));
      const densityRise = clamp(
        (mean(recent.map((h) => h.onset)) - mean(earlier.map((h) => h.onset))) * 3,
      );
      // Measure arrangement dynamics across a beat, so the tail of an ordinary kick
      // cannot be mistaken for a breakdown between every pair of drum hits.
      const recentBass = mean(recent.map((h) => h.bass));
      this.peakBass = Math.max(recentBass, this.peakBass * Math.exp(-tick / 14));
      this.peakDb = Math.max(recentDb, this.peakDb - tick * 0.15);
      const withdrawal = clamp(1 - recentBass / Math.max(1e-6, this.peakBass));
      this.bassAbsentFor = withdrawal > 0.6 ? this.bassAbsentFor + tick : 0;
      if (this.bassAbsentFor > 0.8 && this.audibleTime > 6) this.bassContextUntil = this.time + 4;
      const loudRise = clamp((recentDb - baseDb - 1) / 7);
      const brightRise = clamp((centroid - baseCentroid - 0.04) * 3);
      const trend = this.history.filter((h) => this.time - h.at < 4 && h.db > -70);
      let slope = 0;
      if (trend.length >= 20) {
        const tx = mean(trend.map((h) => h.at)),
          dy = mean(trend.map((h) => h.db));
        let xy = 0,
          xx = 0;
        for (const h of trend) {
          xy += (h.at - tx) * (h.db - dy);
          xx += (h.at - tx) ** 2;
        }
        slope = xy / Math.max(0.01, xx);
      }
      const crescendo = audible ? clamp((slope - 0.25) / 1.8) : 0;
      const buildup =
        audible && earlier.length >= 12
          ? clamp(
              loudRise * 0.5 +
                crescendo * 0.3 +
                brightRise * 0.35 +
                densityRise * 0.2 +
                withdrawal * (brightRise + densityRise) * 0.25,
            )
          : 0;
      this.rise = smooth(this.rise, crescendo, tick, 0.7);
      this.build = smooth(this.build, buildup, tick, 0.6);
      const low = recentDb < this.peakDb - 7 && withdrawal > 0.55;
      this.lowFor = low ? this.lowFor + tick : Math.max(0, this.lowFor - tick * 2);
      this.breakdown = smooth(
        this.breakdown,
        this.lowFor > 0.8 ? clamp((this.peakDb - recentDb - 5) / 12) : 0,
        tick,
        0.5,
      );
      if (this.audibleTime > 6 && (this.build > 0.35 || this.breakdown > 0.35))
        this.armedUntil = this.time + 4;
      // A confirmed return needs context, a loudness jump AND restored low frequencies.
      // A lone kick, changing the volume, and initial playback must not arm it.
      const jump = db - (previous?.db ?? db),
        baselineJump = db - baseDb;
      const bassReturn = bass / Math.max(this.peakBass, 1e-6) > 0.5 && (f.subBass ?? 0) > 0.12;
      if (
        audible &&
        this.time < this.armedUntil &&
        this.time < this.bassContextUntil &&
        this.time - this.lastDrop > 8 &&
        Math.max(jump, baselineJump) > 4 &&
        bassReturn &&
        onset > 0.1 &&
        db > this.peakDb - 5
      ) {
        this.lastDrop = this.time;
        this.dropCount++;
        this.armedUntil = -1;
        this.build *= 0.2;
      }
      this.lastLoudness = db;
    }
    const drop = audible ? Math.exp(-(this.time - this.lastDrop) / 0.65) : 0;
    const barConfidence = tempo.tracking ? this.barConfidence * tempo.confidence : 0;
    const barBeat = barConfidence > 0.18 ? ((((tempo.count - this.barOffset) % 4) + 4) % 4) + 1 : 0;
    const section = !audible
      ? 'quiet'
      : drop > 0.18
        ? 'bass-return'
        : this.build > 0.3 || this.rise > 0.4
          ? 'rising'
          : this.breakdown > 0.3
            ? 'breakdown'
            : 'steady';
    return (this.current = {
      crescendo: this.rise,
      buildup: this.build,
      breakdown: this.breakdown,
      drop,
      dropCount: this.dropCount,
      section,
      barBeat,
      barConfidence,
      barsSinceLock:
        this.barAnchor === null ? 0 : Math.floor(Math.max(0, tempo.count - this.barAnchor) / 4),
      meter: 4,
      meterAssumed: true,
    });
  }
}
