# Kapazitätsplanung

Lokaler Prototyp für die projektübergreifende Kapazitätsplanung mit Gate-Budgets, absoluten Wochen- und Monatsstunden, grafischem Verlauf, Personen-FTE und Planwertänderungen.

Je Projekt können zwei Projektleiter mit prozentualer Stundenaufteilung und eine QVP-Person mit eigenem zusätzlichem Stundenbudget zugeordnet werden. Die QVP-Planung verwendet zunächst dieselbe Gate-Verteilung und innerhalb jeder Phase eine gleichmäßige Verteilung; der frei bearbeitbare Stundenverlauf und Planwertänderungen betreffen das PL-Budget.

## Lokal starten

Für den Doppelklick im Projektordner **`start.bat`** öffnen. Ohne eingerichtete Plattformumgebung startet die Datei die lokale Vorführung. Das Fenster zeigt die lokale Adresse und muss offen bleiben; der Browser öffnet sich automatisch. Tritt ein Fehler auf, bleibt das Fenster bis zur Eingabetaste geöffnet. Das Betriebssystem wählt einen freien Port. Wird der lokale Server erneut gestartet, während er bereits läuft, erscheint eine Meldung und es wird keine zweite Instanz gestartet. Alternativ kann die Verknüpfung „Kapazitätsplanung starten“ verwendet werden.

Die Verknüpfung ist für den aktuellen Rechner erzeugt und nicht in Git enthalten. Nach einem Verschieben des Projektordners, einem Wechsel des Python-Pfads oder auf einem anderen Rechner im Projektordner einmalig mit folgendem Befehl neu erstellen:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\create_local_shortcut.ps1
```

Alternativ Python 3.11 oder neuer verwenden. Abhängigkeiten installieren und Anwendung im Terminal starten:

```powershell
python -m pip install -r requirements.txt
python server.py
```

In dieser Arbeitsumgebung liegen die Abhängigkeiten bereits unter `.local_packages`. Der Browser öffnet sich automatisch, der Port wird frei gewählt. Ein fester lokaler Port kann über `KAPA_PORT` gesetzt werden. Der Server verwendet Waitress und bindet an 127.0.0.1. Nach einem Serverneustart offene Fenster neu laden.

**Hinweis für PowerShell:** Programme im aktuellen Ordner werden mit `.\` aufgerufen, also `.\start.bat`. Mit vollständig eingerichteter `.venv` und `.env` verwendet `start.bat` weiterhin den Plattformstart; mit dem Parameter `background` gilt ebenfalls der Plattformablauf. Der lokale Fallback ist eine bewusste Abweichung vom Plattformstandard RUN-02 und muss vor einer Plattformfreigabe aufgelöst werden. Nach einem Neustart die neu angezeigte Adresse verwenden, weil der Port frei gewählt wird.

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
