import { decodeGeometry } from './geometry-codec.js';

export async function unpackGeometry(packed, format) {
  let worker;
  try {
    worker = new Worker(new URL('./geometry-worker.js', import.meta.url), { type: 'module' });
  } catch {
    // Keep loading usable in environments that disallow module workers.
    const buffer = await decodeGeometry(packed, format);
    return buffer;
  }
  try {
    const result = await new Promise((resolve, reject) => {
      worker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data));
      worker.onerror = () => reject(new Error('Sphere geometry decoder could not run.'));
      worker.onmessageerror = () =>
        reject(new Error('Sphere geometry decoder returned invalid data.'));
      worker.postMessage({ packed, format }, [packed]);
    });
    return result.buffer;
  } finally {
    worker.terminate();
  }
}
