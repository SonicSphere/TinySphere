// A session-only shuffle: fifteen seconds per palette, with a gentle five-second
// crossfade. It advances only while Tree Voices and the artwork are playing.
export class PaletteWalk {
  constructor(palettes, initial, random = Math.random) {
    this.palettes = palettes;
    this.random = random;
    this.reset(initial);
  }
  reset(id) {
    this.current = id;
    this.elapsed = 0;
    this.mix = 0;
    this.bag = [];
    this.target = this.next();
  }
  next() {
    if (!this.bag.length) {
      this.bag = Object.keys(this.palettes).filter((id) => id !== this.current);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }
  advance(seconds) {
    this.elapsed += Math.max(0, seconds);
    while (this.elapsed >= 15) {
      this.elapsed -= 15;
      this.current = this.target;
      this.target = this.next();
    }
    const t = Math.max(0, Math.min(1, (this.elapsed - 10) / 5));
    this.mix = t * t * (3 - 2 * t);
    return this.status();
  }
  status() {
    return {
      current: this.current,
      target: this.target,
      mix: this.mix ?? 0,
      elapsed: this.elapsed,
    };
  }
  colors(reference) {
    const from = this.palettes[this.current],
      to = this.palettes[this.target];
    const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return from.map((color, index) => {
      const blended = color.map(
        (channel, k) => channel * (1 - (this.mix ?? 0)) + to[index][k] * (this.mix ?? 0),
      );
      // Preserve the reference palette's linear luminance at every stop. Color
      // changes cannot change the spatial field, optical falloff or light gain.
      const gain = luminance(this.palettes[reference][index]) / Math.max(1e-8, luminance(blended));
      return blended.map((channel) => channel * gain);
    });
  }
}
