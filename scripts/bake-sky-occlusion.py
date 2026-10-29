"""Bake diffuse sky visibility against the selected model; run inside Blender.

No scene is rendered or saved. Original geometry is read without modification.
"""
from array import array
import gzip
import hashlib
import json
import math
from pathlib import Path
import sys
import time
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
assets = root / 'src/assets/burning-man'
model = json.loads((assets / 'installation-performance.json').read_text())
packed = gzip.decompress((assets / model['binary']).read_bytes())
words = len(packed) // 4
binary = bytearray(len(packed))
for lane in range(4):
    binary[lane::4] = packed[lane * words:(lane + 1) * words]


def floats(spec):
    result = array('f')
    result.frombytes(binary[spec['offset']:spec['offset'] + spec['count'] * 4])
    return result


vertices, triangles, receivers = [], [], []
start = time.perf_counter()
for part in model['parts']:
    positions, matrices = floats(part['positions']), floats(part['matrices'])
    indices = array('I')
    spec = part['indices']
    indices.frombytes(binary[spec['offset']:spec['offset'] + spec['count'] * 4])
    normals = floats(part['normals']) if part['category'] == 'sail' else None
    for instance in range(part['instances']):
        m = matrices[instance * 16:(instance + 1) * 16]
        matrix = Matrix([[m[c * 4 + r] for c in range(4)] for r in range(4)])
        normal_matrix = matrix.to_3x3().inverted().transposed()
        offset = len(vertices)
        for i in range(0, len(positions), 3):
            point = matrix @ Vector(positions[i:i + 3])
            vertices.append(point)
            if normals is not None:
                receivers.append((point, (normal_matrix @ Vector(normals[i:i + 3])).normalized()))
        triangles.extend(tuple(offset + indices[i + k] for k in range(3))
                         for i in range(0, len(indices), 3))

print(json.dumps({'stage': 'BVH', 'triangles': len(triangles), 'clothVertices': len(receivers)}), flush=True)
bvh = BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=0.000001)
samples = 24
directions = []
for i in range(samples):
    z = (i + 0.5) / samples
    r = math.sqrt(1 - z * z)
    phi = i * math.pi * (3 - math.sqrt(5))
    directions.append(Vector((r * math.cos(phi), r * math.sin(phi), z)))

visibility = array('f')
for index, (point, normal) in enumerate(receivers):
    visible = weight_sum = 0.0
    for direction in directions:
        # Double-sided thin cloth: estimate how much sky reaches either face.
        weight = abs(normal.dot(direction))
        if weight < 0.00001:
            continue
        weight_sum += weight
        hit = bvh.ray_cast(point + direction * 0.008, direction, 30.0)
        if hit[0] is None:
            visible += weight
    visibility.append(max(0.0, min(1.0, visible / max(weight_sum, 0.00001))))
    if index % 16000 == 0:
        print(json.dumps({'stage': 'rays', 'vertices': index, 'total': len(receivers)}), flush=True)

raw = visibility.tobytes()
filename = 'cloth-sky-visibility.bin.gz'
(assets / filename).write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
summary = {
    'version': 1,
    'geometrySHA256': hashlib.sha256(binary).hexdigest(),
    'vertices': len(visibility),
    'decodedBytes': len(raw),
    'decodedSHA256': hashlib.sha256(raw).hexdigest(),
    'path': 'assets/burning-man/' + filename,
    'method': 'Actual model triangles; double-sided cosine-weighted upper-sky visibility',
    'skyRaysPerVertex': samples,
    'triangles': len(triangles),
    'rayOffsetMetres': 0.008,
    'rayDistanceMetres': 30,
    'minimum': min(visibility),
    'maximum': max(visibility),
    'mean': sum(visibility) / len(visibility),
    'seconds': time.perf_counter() - start,
    'limits': 'Soft diffuse-sky occlusion approximation; no direct sun or changing LED shadow rays.',
}
(assets / 'cloth-sky-visibility.json').write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps({'stage': 'complete', **summary}), flush=True)
