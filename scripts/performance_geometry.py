"""Package the accepted Aggressive meshes without shipping unused full models."""
from copy import deepcopy
import gzip
import hashlib
import json


def prepare_geometry(root, source):
    authority = source / 'assets/burning-man'
    accepted = root / 'assets/geometry-aggressive'
    manifest = json.loads((accepted / 'manifest.json').read_text())
    model = json.loads((authority / 'installation.json').read_text())
    original = gzip.decompress((authority / 'installation.bin.gz').read_bytes())

    def selected(kind):
        spec = manifest[kind]
        raw = gzip.decompress((accepted / spec['path']).read_bytes())
        if len(raw) != spec['bytes'] or hashlib.sha256(raw).hexdigest() != spec['sha256']:
            raise ValueError(f'Accepted {kind} geometry does not match its manifest')
        return spec, raw

    cloth, cloth_raw = selected('cloth')
    output = bytearray()
    runtime = deepcopy(model)
    replacements = {'positions': 'position', 'normals': 'normal',
                    'contact_uv': 'contactUV', 'vertex_fixture_ids': 'fixtureId',
                    'wrap_mask': 'wrapMask'}
    for part in runtime['parts']:
        sail = part.get('batched_cloth', False)
        if sail:
            part.pop('uv', None)
            # These ranges describe the original topology, not the accepted mesh.
            part.pop('source_ranges', None)
            part['wrap_mask'] = {}
            part['triangles'] = cloth['triangles']
            part['groups'] = [{'start': 0, 'count': cloth['index']['count'], 'material': 0}]
        for key, descriptor in list(part.items()):
            if sail and key in replacements:
                spec, data = cloth['attributes'][replacements[key]], cloth_raw
            elif sail and key == 'indices':
                spec, data = cloth['index'], cloth_raw
            elif isinstance(descriptor, dict) and 'offset' in descriptor and 'count' in descriptor:
                spec, data = descriptor, original
            else:
                continue
            chunk = data[spec['offset']:spec['offset'] + spec['count'] * 4]
            if len(chunk) != spec['count'] * 4:
                raise ValueError(f'Incomplete geometry attribute: {key}')
            part[key] = {'offset': len(output), 'count': spec['count']}
            output.extend(chunk)

    def pack(raw, filename):
        if len(raw) % 4:
            raise ValueError('Geometry must contain complete 32-bit words')
        packed = gzip.compress(b''.join(raw[lane::4] for lane in range(4)), compresslevel=9, mtime=0)
        (authority / filename).write_bytes(packed)
        return {'path': 'assets/burning-man/' + filename, 'codec': 'byte-lanes-4-v1',
                'decodedBytes': len(raw), 'decodedSha256': hashlib.sha256(raw).hexdigest()}

    geometry = pack(output, 'installation.lanes4.bin.gz')
    geometry['metadataPath'] = 'assets/burning-man/installation-performance.json'
    runtime.update(binary='installation.lanes4.bin.gz', binary_encoding=geometry['codec'],
                   binary_bytes=len(output), web_triangles=sum(p['triangles'] * p['instances'] for p in runtime['parts']))
    runtime['cloth_design']['exact_selected_geometry'] = False
    runtime['render_geometry'] = {'preset': 'aggressive', 'accepted': manifest['accepted'],
                                  'source': 'BM-GeometryLab', 'clothTriangles': cloth['triangles'],
                                  'sourceAttributesExact': True, 'adaptive': False,
                                  'sourceModelRevision': model['model_revision']}
    (source / geometry['metadataPath']).write_text(json.dumps(runtime, separators=(',', ':')) + '\n')
    terrain, terrain_raw = selected('terrain')
    terrain_asset = pack(terrain_raw, 'topography.lanes4.bin.gz')
    terrain_asset.update(attributes=terrain['attributes'], index=terrain['index'],
                         userData={k: v for k, v in terrain['userData'].items() if k != 'ridgePreparationMs'})
    return geometry, terrain_asset
