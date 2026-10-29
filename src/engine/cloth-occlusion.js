export function validateClothOcclusion(metadata, values, geometrySHA256) {
  if (metadata.version !== 1 || metadata.geometrySHA256 !== geometrySHA256 ||
      metadata.vertices !== values.length || metadata.decodedBytes !== values.byteLength ||
      !values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1))
    throw Error('The soft sky shadows do not match the selected cloth geometry.');
  return values;
}

export async function loadClothOcclusion(loadJSON, loadBytes, geometryAsset) {
  const metadata = await loadJSON('assets/burning-man/cloth-sky-visibility.json');
  const packed = await loadBytes(metadata.path);
  const raw = await new Response(new Blob([packed]).stream()
    .pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)),
    (value) => value.toString(16).padStart(2, '0')).join('');
  if (hash !== metadata.decodedSHA256) throw Error('The soft sky shadow data is incomplete.');
  return { metadata, values: validateClothOcclusion(metadata, new Float32Array(raw), geometryAsset.decodedSha256) };
}
