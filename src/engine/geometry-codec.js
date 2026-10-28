// Version 1 groups the four byte lanes of each 32-bit word before gzip.
// Restore directly from decompressor chunks into the final buffer: no second
// full-size decoded copy, quantization, or changes to floating-point bits.
export async function decodeGeometry(packed, format) {
  const length = format.decodedBytes;
  if (
    format.codec !== 'byte-lanes-4-v1' ||
    !Number.isSafeInteger(length) ||
    length <= 0 ||
    length % 4
  ) {
    throw new Error('Unsupported sphere geometry format.');
  }
  const result = new Uint8Array(length),
    laneLength = length / 4;
  const reader = new Blob([packed])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > length) throw new Error('Oversized sphere geometry.');
      let source = 0;
      while (source < value.length) {
        const lane = Math.floor(offset / laneLength),
          within = offset % laneLength;
        const count = Math.min(value.length - source, laneLength - within);
        for (let i = 0, destination = within * 4 + lane; i < count; i++, destination += 4) {
          result[destination] = value[source + i];
        }
        source += count;
        offset += count;
      }
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== length) throw new Error('Incomplete sphere geometry.');
  if (format.decodedSha256) {
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', result)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    if (hash !== format.decodedSha256) throw new Error('Geometry checksum mismatch.');
  }
  return result.buffer;
}
