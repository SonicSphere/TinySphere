import { Vector3 } from '../vendor/three.module.js';

// Some imported cap/connection meshes have normals pointing through their own
// faces. Interpolating them creates sharp, unstable highlights on flat metal.
// Rebuild only those damaged meshes; positions, indices and instances stay put.
export function repairHardwareNormals(geometry) {
  const position = geometry.getAttribute('position'),
    normal = geometry.getAttribute('normal');
  const index = geometry.getIndex();
  if (!position || !normal || !index) return false;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3(),
    face = new Vector3(),
    n = new Vector3();
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i));
    b.fromBufferAttribute(position, index.getX(i + 1));
    c.fromBufferAttribute(position, index.getX(i + 2));
    face.crossVectors(b.sub(a), c.sub(a));
    if (face.lengthSq() < 1e-20) continue;
    face.normalize();
    for (let j = 0; j < 3; j++) {
      n.fromBufferAttribute(normal, index.getX(i + j));
      if (!Number.isFinite(n.lengthSq()) || n.lengthSq() < 0.1 || face.dot(n) < -0.01) {
        geometry.computeVertexNormals();
        return true;
      }
    }
  }
  return false;
}

export function createHardwareContactMaterial(material) {
  const contact = material.clone();
  // Give the mounted metal a consistent tie-break against touching wood/cloth.
  // Depth testing remains on, so genuinely foreground surfaces still occlude it.
  contact.polygonOffset = true;
  contact.polygonOffsetFactor = -1;
  contact.polygonOffsetUnits = -1;
  return contact;
}
