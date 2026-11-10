"""Start the local demonstrator on a free loopback port."""
import os
from pathlib import Path
import sys
import webbrowser
ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / '.local_packages'), str(ROOT / 'src')]
try:
    from waitress import create_server
    from kapa_planung.web import create_app
except ModuleNotFoundError as exc:
    raise SystemExit(f'Abhängigkeit fehlt: {exc.name}. Bitte zuerst python -m pip install -r requirements.txt ausführen.') from exc
port = int(os.environ.get('KAPA_PORT', '0'))
server = create_server(create_app(), host='127.0.0.1', port=port)
url = f'http://127.0.0.1:{server.effective_port}/'
print(f'Kapazitätsplanung läuft unter {url} (Beenden mit Strg+C)', flush=True)
if '--no-browser' not in sys.argv:
    webbrowser.open(url)
try:
    server.run()
except KeyboardInterrupt:
    pass
finally:
    server.close()
