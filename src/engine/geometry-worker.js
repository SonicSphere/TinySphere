import { decodeGeometry } from './geometry-codec.js';

self.onmessage = async ({ data: { packed, format } }) => {
  try {
    const buffer = await decodeGeometry(packed, format);
    self.postMessage({ buffer }, [buffer]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
