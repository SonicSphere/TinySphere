import * as THREE from '../vendor/three.module.js';
import { assetBytes, assetRevision, assetRevisions, musicAsset } from '../load-manifest.js';

const received = new Map(),
  pending = new Map(),
  controller = new AbortController();
const totalBytes =
  Object.values(assetBytes).reduce((sum, bytes) => sum + bytes, 0) + musicAsset.bytes;
let progress = 0,
  stage = 'Downloading the experience',
  complete = false,
  failed = false,
  lastNetworkPaint = 0;
function update(value, detail = stage) {
  if (failed) return;
  progress = Math.max(progress, Math.min(100, value));
  stage = detail;
  document.getElementById('loading-progress').value = progress;
  document.getElementById('loading-percent').textContent = Math.floor(progress) + '%';
  document.getElementById('loading-detail').textContent = detail;
  document.body.dataset.loadingProgress = String(progress);
}
function networkProgress() {
  const loaded = Array.from(received.values()).reduce((sum, bytes) => sum + bytes, 0);
  const now = performance.now();
  if (now - lastNetworkPaint < 60 && loaded < totalBytes) return;
  lastNetworkPaint = now;
  update(totalBytes ? Math.min(80, (loaded / totalBytes) * 80) : 0);
}
export function loadingStage(value, detail) {
  update(value, detail);
}
export function loadingStatus() {
  return {
    progress,
    stage,
    complete,
    loadedBytes: Array.from(received.values()).reduce((sum, bytes) => sum + bytes, 0),
    totalBytes,
    retainedDownloads: pending.size,
  };
}
export function releaseDownloads() {
  pending.clear();
}
export function loadBytes(url, { signal = controller.signal } = {}) {
  if (pending.has(url)) return pending.get(url);
  const task = (async () => {
    const assetURL = new URL(url, document.baseURI);
    assetURL.searchParams.set(
      'v',
      url === musicAsset.path ? musicAsset.revision : (assetRevisions[url] ?? assetRevision),
    );
    const response = await fetch(assetURL.href, { signal, cache: 'force-cache' });
    if (!response.ok) throw new Error('An experience asset could not load.');
    const chunks = [];
    let length = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        length += value.byteLength;
        received.set(url, length);
        networkProgress();
      }
    } else {
      const bytes = new Uint8Array(await response.arrayBuffer());
      chunks.push(bytes);
      length = bytes.length;
    }
    received.set(url, length);
    networkProgress();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes.buffer;
  })().catch((error) => {
    pending.delete(url);
    throw error;
  });
  pending.set(url, task);
  return task;
}
export async function loadJSON(url) {
  return JSON.parse(new TextDecoder().decode(await loadBytes(url)));
}
export function preloadAssets() {
  return Promise.all(Object.keys(assetBytes).map(loadBytes));
}
export async function loadTexture(url) {
  const objectURL = URL.createObjectURL(new Blob([await loadBytes(url)]));
  try {
    return await new THREE.TextureLoader().loadAsync(objectURL);
  } finally {
    URL.revokeObjectURL(objectURL);
  }
}
export async function finishLoading() {
  complete = true;
  update(100, 'Ready');
  // Show the completed bar for a paint before uncovering the first full frame.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  document.getElementById('loading').hidden = true;
  document.getElementById('loading').setAttribute('aria-busy', 'false');
  document.querySelector('main').inert = false;
  document.querySelector('.main-dock').inert = false;
}
export function failLoading(error) {
  failed = true;
  controller.abort();
  document.getElementById('loading').hidden = false;
  document.getElementById('loading').setAttribute('aria-busy', 'false');
  document.getElementById('loading-title').textContent = 'Tiny Sphere could not load';
  document.getElementById('loading-detail').textContent = 'Please try again.';
  document.getElementById('loading-retry').hidden = false;
  document.body.dataset.error = error.message;
}
window.sphereLoading = { status: loadingStatus };
