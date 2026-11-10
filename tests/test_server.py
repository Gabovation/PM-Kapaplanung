import http.client, json, pathlib, re, shutil, subprocess, sys, unittest, uuid

class LocalServerTest(unittest.TestCase):
    def test_persistence_and_private_files(self):
        root = pathlib.Path(__file__).resolve().parents[1]
        tmp = root / ('test-work-' + uuid.uuid4().hex)
        tmp.mkdir()
        proc = None
        try:
            for name in ('server.py', 'index.html', 'app.js', 'style.css'):
                shutil.copy(root / name, tmp)
            (tmp / 'secret.txt').write_text('private')
            proc = subprocess.Popen([sys.executable, '-u', 'server.py', '--no-browser'], cwd=tmp, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            line = proc.stdout.readline().decode(errors='replace')
            port = int(re.search(r'127\.0\.0\.1:(\d+)', line).group(1))
            def request(method, path, body=None, headers=None):
                c = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
                c.request(method, path, body=body, headers=headers or {})
                r = c.getresponse(); payload = r.read(); status = r.status; c.close(); return status, payload
            self.assertEqual(request('GET', '/')[0], 200)
            self.assertEqual(request('GET', '/secret.txt')[0], 404)
            self.assertEqual(request('GET', '/api/data')[1], b'null')
            obj = {'version': 1, 'projects': [], 'people': []}
            self.assertEqual(request('POST', '/api/data', json.dumps(obj), {'Content-Type': 'application/json'})[0], 204)
            self.assertEqual(json.loads(request('GET', '/api/data')[1]), obj)
            self.assertEqual(request('GET', '/planung.json')[0], 404)
            self.assertEqual(request('POST', '/api/data', '{}', {'Origin': 'https://example.org'})[0], 403)
        finally:
            if proc:
                proc.terminate(); proc.wait(timeout=5); proc.stdout.close(); proc.stderr.close()
            shutil.rmtree(tmp)

if __name__ == '__main__': unittest.main()
