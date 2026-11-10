# Kapazitätsplanung

Lokaler Prototyp für die projektübergreifende Kapazitätsplanung mit Gate-Budgets, Wochengewichten, Personen-FTE und Planwertänderungen.

## Lokal starten

Python 3.11 oder neuer. Abhängigkeiten installieren und Anwendung starten:

```powershell
python -m pip install -r requirements.txt
python server.py
```

In dieser Arbeitsumgebung liegen die Abhängigkeiten bereits unter `.local_packages`. Der Browser öffnet sich automatisch, der Port wird frei gewählt. Ein fester lokaler Port kann über `KAPA_PORT` gesetzt werden. Der Server verwendet Waitress und bindet an 127.0.0.1. Nach einem Serverneustart offene Fenster neu laden.

Die Daten liegen in `planung.json`. JSON-Sicherungen lassen sich unter Einstellungen exportieren und wiederherstellen. SAP-Stunden werden noch nicht importiert.

## Dokumentation und Prüfung

- [Projekthandbuch mit Rechenregeln und Lessons Learned](PROJEKTHANDBUCH.md)
- [Bedienung](docs/user-manual.md)
- [Prüfstand und Abweichungen](docs/validation.md)
- [Änderungen](CHANGELOG.md)

```powershell
$env:PYTHONPATH=".local_packages;src"
python -m pytest -p no:cacheprovider -o addopts="" tests
```

Vorlage und UI-Kit stammen aus `gma-app-standards` und `polytec-design-system` unter `C:/Users/stefan.gabriel/Documents/Programme/Repo`. Vendorte Dateien werden unverändert synchronisiert. Die mitgelieferten Plattform-Dienstskripte sind eine spätere Integrationsgrundlage. Ein Dienst, MongoDB und die Portal-Anmeldung wurden nicht eingerichtet.
