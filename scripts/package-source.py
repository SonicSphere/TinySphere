"""Create a source-only ZIP using the same omissions as the contributor checkout."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FOLDERS = {'src', 'assets', 'docs', 'examples', 'tests', 'scripts', '.github'}
FILES = {'README.md', 'CONTRIBUTING.md', 'CREDITS.md', 'LICENSE-STATUS.md', 'AGENTS.md',
         'package.json', '.gitignore', '.gitattributes', '.prettierrc.json', '.prettierignore'}
GENERATED = {'src/load-manifest.js', 'src/assets/burning-man/installation-performance.json',
             'src/assets/burning-man/installation.lanes4.bin.gz',
             'src/assets/burning-man/topography.lanes4.bin.gz'}


def source_files():
    for path in sorted(ROOT.rglob('*')):
        relative = path.relative_to(ROOT)
        if not path.is_file() or path.is_symlink():
            continue
        if relative.parts[0] not in FOLDERS and relative.as_posix() not in FILES:
            continue
        if any(part in {'__pycache__', 'node_modules', '.git', '.openai', '.local'} for part in relative.parts):
            continue
        if path.suffix == '.pyc' or path.name == '.DS_Store':
            continue
        if path.name.startswith('.env') and path.name != '.env.example':
            continue
        if relative.as_posix() in GENERATED:
            continue
        yield path, relative


def main():
    destination = ROOT / '.local/TinySphere-github-source.zip'
    destination.parent.mkdir(exist_ok=True)
    files = list(source_files())
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path, relative in files:
            info = zipfile.ZipInfo('TinySphere/' + relative.as_posix(), date_time=(2026, 10, 28, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    print(json.dumps({'archive': str(destination), 'files': len(files), 'bytes': destination.stat().st_size}))


if __name__ == '__main__':
    main()
