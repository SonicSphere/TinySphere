"""Exercise the public routes without occupying the pinned development port."""
from functools import partial
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import importlib.util
from pathlib import Path
from threading import Thread
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('tiny_sphere_server', ROOT / 'scripts/serve.py')
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class QuietHandler(SERVER.Handler):
    def log_message(self, format, *args):
        pass


class PreviewServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path):
        connection = HTTPConnection(*self.server.server_address, timeout=5)
        connection.request('GET', path)
        response = connection.getresponse()
        status, headers, body = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return status, headers, body

    def test_permanent_url_redirect(self):
        status, headers, _ = self.request('/')
        self.assertEqual(status, 302)
        self.assertEqual(headers['Location'], '/TinySphere/dist/')

    def test_app_and_docs(self):
        for path in ['/TinySphere/dist/', '/TinySphere/docs/release.html',
                     '/TinySphere/docs/playground.html?preview=1', '/TinySphere/README.md']:
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertEqual(headers['Cache-Control'], 'no-store')
                self.assertIn(b'Tiny Sphere', body)

    def test_source_and_parent_segments_are_not_served(self):
        for path in ['/TinySphere/.git/config', '/TinySphere/src/app.js',
                     '/TinySphere/docs/../scripts/build.py',
                     '/TinySphere/docs/%2e%2e/scripts/build.py',
                     '/TinySphere/docs/%252e%252e/scripts/build.py']:
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 404)

    def test_port_conflict_keeps_the_permanent_url(self):
        with patch.object(SERVER, 'ThreadingHTTPServer', side_effect=OSError('occupied')):
            with self.assertRaisesRegex(SystemExit, 'Port 4192 is occupied'):
                SERVER.main()


if __name__ == '__main__':
    unittest.main()
