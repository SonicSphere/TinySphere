// The real-time callback only copies PCM into a bounded pool. Analysis lives in a Worker.
class SphereMusicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pool = Array.from({ length: 8 }, () => new Float32Array(1024));
    this.block = this.pool.pop();
    this.position = 0;
    this.skipped = 0;
    this.channels = 2;
    this.port.onmessage = (e) => {
      if (e.data.type === 'recycle') this.pool.push(new Float32Array(e.data.buffer));
    };
  }
  process(inputs, outputs) {
    // This output is deliberately silent. Captured music continues in its source tab.
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0];
    if (!input?.length) return true;
    this.channels = input.length;
    for (let i = 0; i < input[0].length; i++) {
      if (this.block) {
        this.block[this.position * 2] = input[0][i];
        this.block[this.position * 2 + 1] = (input[1] ?? input[0])[i];
      }
      if (++this.position === 512) {
        if (this.block) {
          const buffer = this.block.buffer;
          this.port.postMessage(
            {
              type: 'pcm',
              buffer,
              channels: this.channels,
              audioTime: currentTime + (i + 1) / sampleRate,
              skipped: this.skipped,
            },
            [buffer],
          );
          this.skipped = 0;
        } else this.skipped++;
        this.block = this.pool.pop() ?? null;
        this.position = 0;
      }
    }
    return true;
  }
}
registerProcessor('sphere-music-capture', SphereMusicCapture);
