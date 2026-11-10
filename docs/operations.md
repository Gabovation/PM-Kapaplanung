# Kapazitätsplanung – lokaler Betrieb

## Start und Ende
`python server.py` startet Waitress auf einem freien Loopback-Port und öffnet den Browser. Das Terminal offen lassen und mit Strg+C beenden. Optional einen festen Port über `KAPA_PORT` setzen. Ein belegter fester Port verursacht einen sichtbaren Startfehler; andere Apps werden nicht beendet.

## Daten und Wiederherstellung
Die Planung liegt im Projektverzeichnis in `planung.json`. Regelmäßig über Einstellungen eine JSON-Sicherung exportieren. Wiederherstellen ersetzt die aktuelle Planung nach Bestätigung. Während der Bearbeitung darf nur ein Serverprozess dieselbe Datei verwenden. Nach einem Serverneustart Browserfenster neu laden. Bei einem Revisionskonflikt lokale Eingaben zunächst exportieren und danach neu laden.

## Fehlerbehebung
- Fehlende Python-Abhängigkeit: `python -m pip install -r requirements.txt` ausführen. Der Starter berücksichtigt auch `.local_packages` im Projekt.
- Fehlerhaft dargestellter alter Stand: Browser mit Strg+F5 neu laden. Laufende Serverversion und URL prüfen.
- Speicherfehler: Schreibrechte im Projektverzeichnis prüfen. Eingaben vor dem Schließen exportieren.
- Belegter Port: `KAPA_PORT` entfernen, damit ein freier Port gewählt wird.

## Späterer Serverbetrieb
Die Standard-Dienstskripte sind mitgeliefert, aber nicht eingerichtet oder abgenommen. Portalzuordnung, bestätigter Port, Dienstkonto, Datenbank, Authentifizierung und Betriebsabnahme sind offen. Verantwortliche, Sicherungsintervall, Aufbewahrung sowie RTO/RPO bleiben TBD.
