import builtins
import runpy

import local_launcher


def test_launcher_starts_local_server(monkeypatch):
    calls = []
    monkeypatch.setattr(runpy, 'run_path', lambda path, run_name: calls.append((path, run_name)))
    assert local_launcher.main() == 0
    assert calls[0][0].endswith('server.py')
    assert calls[0][1] == '__main__'


def test_launcher_keeps_error_visible(monkeypatch, capsys):
    def fail(*args, **kwargs):
        raise SystemExit('Abhängigkeit fehlt')
    prompts = []
    monkeypatch.setattr(runpy, 'run_path', fail)
    monkeypatch.setattr(builtins, 'input', lambda text: prompts.append(text))
    assert local_launcher.main() == 1
    assert 'Abhängigkeit fehlt' in capsys.readouterr().err
    assert prompts and 'Eingabetaste' in prompts[0]


def test_launcher_handles_normal_stop_without_prompt(monkeypatch):
    def stop(*args, **kwargs):
        raise KeyboardInterrupt
    monkeypatch.setattr(runpy, 'run_path', stop)
    assert local_launcher.main() == 0
