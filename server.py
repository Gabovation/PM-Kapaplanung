import http.server, socketserver, webbrowser, os, sys, json, tempfile, pathlib
ROOT = pathlib.Path(__file__).resolve().parent
os.chdir(ROOT)
DATA = ROOT / 'planung.json'
class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/data':
            data = DATA.read_bytes() if DATA.exists() else b'null'
            self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8'); self.end_headers(); self.wfile.write(data)
        elif self.path.split('?')[0] in ('/', '/index.html', '/app.js', '/style.css'): super().do_GET()
        else: self.send_error(404)
    def do_POST(self):
        if self.path != '/api/data' or self.headers.get('Origin', '') not in ('', 'http://127.0.0.1:' + str(self.server.server_address[1])):
            self.send_error(403); return
        try:
            size = int(self.headers.get('Content-Length', 0))
            if size <= 0 or size > 5000000: raise ValueError('Ungültige Größe')
            data = self.rfile.read(size); obj = json.loads(data)
            if not isinstance(obj, dict): raise ValueError('Ungültige Daten')
            with tempfile.NamedTemporaryFile(dir=ROOT, delete=False) as f: f.write(data); name=f.name
            os.replace(name, DATA)
            self.send_response(204); self.end_headers()
        except (ValueError, OSError): self.send_error(400)
port = int(os.environ.get('KAPA_PORT', '0'))
class Server(socketserver.ThreadingTCPServer): allow_reuse_address = True
with Server(('127.0.0.1', port), Handler) as server:
    url = f'http://127.0.0.1:{server.server_address[1]}/'
    print(f'Kapazitätsplanung läuft unter {url} (Beenden mit Strg+C)', flush=True)
    if '--no-browser' not in sys.argv: webbrowser.open(url)
    server.serve_forever()
