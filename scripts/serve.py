"""Serve the built app at its permanent project URL using only the standard library."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
HOST = '127.0.0.1'
PORT = 4192
PREFIX = '/TinySphere/'
URL = f'http://{HOST}:{PORT}{PREFIX}dist/'
DOCUMENTS = {'README.md', 'CONTRIBUTING.md', 'CREDITS.md', 'LICENSE', 'LICENSE-STATUS.md'}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path in ('/', '/TinySphere', '/TinySphere/'):
            self.send_response(302)
            self.send_header('Location', PREFIX + 'dist/')
            self.end_headers()
            return
        if not path.startswith((PREFIX + 'dist/', PREFIX + 'docs/')) and path not in {PREFIX + name for name in DOCUMENTS}:
            self.send_error(404)
            return
        relative = path[len(PREFIX):]
        resolved = (ROOT / relative).resolve()
        if not any(resolved.is_relative_to(ROOT / folder) for folder in ('dist', 'docs')) and resolved not in {ROOT / name for name in DOCUMENTS}:
            self.send_error(404)
            return
        self.resolved_path = resolved
        self.path = '/' + relative
        super().do_GET()

    def translate_path(self, path):
        # Use the path already validated above. Decoding a second time would
        # let a double-encoded parent segment escape the public folders.
        return str(self.resolved_path)

    def do_HEAD(self):
        self.send_error(405)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    if not (ROOT / 'dist/index.html').is_file():
        raise SystemExit('Build first: python3 scripts/build.py')
    try:
        server = ThreadingHTTPServer((HOST, PORT), partial(Handler, directory=str(ROOT)))
    except OSError as error:
        raise SystemExit(f'Port {PORT} is occupied. Stop the stale server or use the existing server at {URL}. {error}') from error
    print(f'Tiny Sphere: {URL}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
