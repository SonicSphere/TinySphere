"""Build the unified public studio from its self-contained browser source."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
from performance_geometry import prepare_geometry

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src'
TARGET = ROOT / 'dist'


def main():
    # Import the explicit content registries before writing a distribution.
    registered_content = json.loads(subprocess.check_output(
        ['node', str(ROOT / 'scripts/content-metadata.mjs')], text=True))
    geometry_asset, terrain_asset = prepare_geometry(ROOT, SOURCE)
    source_only = {'assets/burning-man/' + name for name in
                   ['installation.bin.gz', 'installation.json', 'wrap-mask.bin.gz', 'topography-heights.bin.gz',
                    'playa-color.jpg']}
    # Stable content revisions keep unchanged audio cached across UI releases.
    asset_bytes = {'assets/burning-man/' + path.name: path.stat().st_size
                   for path in sorted((SOURCE / 'assets/burning-man').iterdir())
                   if path.is_file() and 'assets/burning-man/' + path.name not in source_only}
    asset_revisions = {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest()[:16]
                       for name in asset_bytes}
    asset_digest = hashlib.sha256()
    for name in asset_bytes:
        asset_digest.update(name.encode())
        asset_digest.update((SOURCE / name).read_bytes())
    music_path = 'assets/audio/tree-voices-stereo.mp3'
    music = SOURCE / music_path
    music_asset = {'path': music_path, 'bytes': music.stat().st_size,
                   'revision': hashlib.sha256(music.read_bytes()).hexdigest()[:16]}
    (SOURCE / 'load-manifest.js').write_text(
        'export const assetRevision=' + json.dumps(asset_digest.hexdigest()[:16]) + ';\n'
        + 'export const assetBytes=' + json.dumps(asset_bytes, separators=(',', ':')) + ';\n'
        + 'export const assetRevisions=' + json.dumps(asset_revisions, separators=(',', ':')) + ';\n'
        + 'export const geometryAsset=' + json.dumps(geometry_asset, separators=(',', ':')) + ';\n'
        + 'export const terrainAsset=' + json.dumps(terrain_asset, separators=(',', ':')) + ';\n'
        + 'export const musicAsset=' + json.dumps(music_asset, separators=(',', ':')) + ';\n')
    digest = hashlib.sha256()
    for path in sorted(SOURCE.rglob('*')):
        if path.is_file():
            digest.update(path.relative_to(SOURCE).as_posix().encode())
            digest.update(path.read_bytes())
    revision = digest.hexdigest()[:16]
    TARGET.mkdir(exist_ok=True)
    # Retire the old single-venue build; its authoring sources remain preserved.
    for path in TARGET.iterdir():
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    files = []
    for path in sorted(SOURCE.rglob('*')):
        if not path.is_file():
            continue
        relative = path.relative_to(SOURCE)
        if relative.parts[:2] == ('assets', 'nashville'):
            continue
        if relative.as_posix() in source_only:
            continue
        output = TARGET / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix in {'.html', '.js'} and 'vendor' not in relative.parts:
            content = path.read_text()
            # Give every module in the graph (including Worker/Worklet entry
            # points) the same revision to prevent mixed cached deployments.
            content = re.sub(r'([\'"])([^\'"\s?]+\.(?:js|css))\1',
                             lambda match: f'{match[1]}{match[2]}?v={revision}{match[1]}',
                             content)
            output.write_text(content)
        else:
            shutil.copyfile(path, output)
        files.append({'path': relative.as_posix(), 'bytes': output.stat().st_size,
                      'sha256': hashlib.sha256(output.read_bytes()).hexdigest()})
    (ROOT / 'source-assets.json').write_text(json.dumps({
        'source': 'src', 'revision': revision, 'files': files,
        'venues': {'burning-man': 212},
        'default_pattern': 'spectral', 'patterns': registered_content['shows'],
        'themes': registered_content['themes'], 'modes': ['studio'],
    }, indent=2) + '\n')
    print(json.dumps({'revision': revision, 'files': len(files),
                      'bytes': sum(item['bytes'] for item in files)}))


if __name__ == '__main__':
    main()
