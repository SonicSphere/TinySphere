// Overlapping Hann-window FFT, with stereo power preserved even for opposite phase.
export class StereoFFT {
  constructor(size = 2048) {
    this.size = size;
    this.position = 0;
    this.filled = 0;
    this.rings = [new Float32Array(size), new Float32Array(size)];
    this.waves = [new Float32Array(size), new Float32Array(size)];
    this.spectra = [new Float32Array(size / 2), new Float32Array(size / 2)];
    this.real = new Float64Array(size);
    this.imag = new Float64Array(size);
    this.window = Float64Array.from(
      { length: size },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)),
    );
    const bits = Math.log2(size);
    this.reverse = Uint16Array.from({ length: size }, (_, i) => {
      let r = 0;
      for (let j = 0; j < bits; j++) {
        r = (r << 1) | (i & 1);
        i >>= 1;
      }
      return r;
    });
    this.cos = Float64Array.from({ length: size / 2 }, (_, i) =>
      Math.cos((-2 * Math.PI * i) / size),
    );
    this.sin = Float64Array.from({ length: size / 2 }, (_, i) =>
      Math.sin((-2 * Math.PI * i) / size),
    );
  }
  push(block) {
    for (let i = 0; i < block.length; i += 2) {
      this.rings[0][this.position] = block[i];
      this.rings[1][this.position] = block[i + 1];
      this.position = (this.position + 1) % this.size;
    }
    this.filled = Math.min(this.size, this.filled + block.length / 2);
    if (this.filled < this.size) return false;
    for (let c = 0; c < 2; c++) {
      const wave = this.waves[c];
      let mean = 0;
      for (let i = 0; i < this.size; i++) {
        wave[i] = this.rings[c][(this.position + i) % this.size];
        mean += wave[i];
      }
      mean /= this.size;
      for (let i = 0; i < this.size; i++) {
        this.real[this.reverse[i]] = (wave[i] - mean) * this.window[i];
        this.imag[i] = 0;
      }
      for (let width = 2; width <= this.size; width *= 2) {
        const half = width / 2,
          step = this.size / width;
        for (let start = 0; start < this.size; start += width)
          for (let j = 0; j < half; j++) {
            const a = start + j,
              b = a + half,
              k = j * step;
            const re = this.real[b] * this.cos[k] - this.imag[b] * this.sin[k],
              im = this.real[b] * this.sin[k] + this.imag[b] * this.cos[k];
            this.real[b] = this.real[a] - re;
            this.imag[b] = this.imag[a] - im;
            this.real[a] += re;
            this.imag[a] += im;
          }
      }
      for (let i = 0; i < this.size / 2; i++)
        this.spectra[c][i] =
          10 *
          Math.log10(
            Math.max(
              1e-20,
              ((this.real[i] ** 2 + this.imag[i] ** 2) * 16) / (this.size * this.size),
            ),
          );
    }
    return true;
  }
}
