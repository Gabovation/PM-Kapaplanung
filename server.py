"""Start the local demonstrator on a free loopback port."""
import os
from pathlib import Path
import sys
import webbrowser
ROOT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / '.local_packages'), str(ROOT / 'src')]

def acquire_local_lock():
    """Only one local process may write this project's planning file at a time."""
    lock = (ROOT / '.local-server.lock').open('a+b')
    try:
        if os.name == 'nt':
            import msvcrt
            lock.seek(0, os.SEEK_END)
            if lock.tell() == 0:
                lock.write(b'0')
                lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (OSError, BlockingIOError):
        lock.close()
        raise SystemExit('Die Kapazitätsplanung läuft bereits. Bitte das vorhandene Browserfenster verwenden.')
    return lock

local_lock = acquire_local_lock()
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
    local_lock.close()
