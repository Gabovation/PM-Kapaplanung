"""Doppelklick-Start für die lokale Vorführung mit sichtbarer Fehlermeldung."""
from __future__ import annotations

from pathlib import Path
import runpy
import sys
import traceback


def main() -> int:
    try:
        runpy.run_path(str(Path(__file__).resolve().with_name('server.py')), run_name='__main__')
    except KeyboardInterrupt:
        return 0
    except BaseException as exc:
        if isinstance(exc, SystemExit) and exc.code in (None, 0):
            return 0
        if isinstance(exc, SystemExit):
            print(f'\nStart fehlgeschlagen: {exc}', file=sys.stderr)
        else:
            traceback.print_exc()
            print('\nDie Kapazitätsplanung konnte nicht gestartet werden.', file=sys.stderr)
        try:
            input('\nZum Schließen bitte die Eingabetaste drücken. ')
        except EOFError:
            pass
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
