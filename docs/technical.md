# Kapazitätsplanung – technische Dokumentation

## Aktuelle Laufzeit
`server.py` ergänzt `.local_packages` und `src` zum Importpfad, erstellt die Flask-App und startet Waitress auf 127.0.0.1. Standardport 0 lässt das Betriebssystem einen freien Port auswählen. `KAPA_PORT` überschreibt diesen Wert. Der lokale Starter ist der getestete Einstieg; die Plattform-Dienstintegration ist vorbereitet, aber nicht abgenommen.

## Struktur
- `src/kapa_planung/web.py`: lokale App, HTML-Seite und Datenendpunkt.
- `src/kapa_planung/ops_platform`: unverändert verteiltes Plattform-Kit.
- `templates/layout.html`: Erweiterung der offiziellen Connected-Operations-Shell.
- `templates/index.html`: Einstieg in die Planung.
- `static/app/plan.js`: Formulare, Fachberechnung, Wochen-/Monatsaggregation und Datensynchronisation.
- `static/app/app.css`: fachliches Layout mit UI-Kit-Tokens.
- `static/polytec` und die UI-Templateordner: unverändert synchronisierte Komponenten.

## Daten
`planung.json` enthält Version, Revision, FTE-Wochenstunden, Favorit, Personen und Projekte. Projekte besitzen Basisbudget, vier Prozentanteile, fünf Gate-Termine, Wochengewichte und Planwertänderungen. SAP-Buchungen sind nicht enthalten.

GET liefert den aktuellen lokalen Stand. POST benötigt den beim Seitenaufruf gelieferten Schreib-Token sowie die geladene Revision. Ein Prozess-Lock schützt Vergleich und atomaren Dateiersatz. Konflikte liefern 409, ungültige Schreib-Tokens 403. Die serverseitige Prüfung ist derzeit strukturell und muss vor einem produktiven Einsatz um die vollständigen Fachregeln ergänzt werden.

## HTML und Cache
Vorlagen werden mit UTF-8-BOM-Behandlung geladen. Die lokale Jinja-Umgebung prüft Änderungen. HTML erhält `Cache-Control: no-store`, statische Dateien erhalten die versionierten URLs des Plattform-Kits. Das verhindert, dass unsichtbare Zeichen oder alte Vorlagen beim Weiterentwickeln unbemerkt ausgeliefert werden.

## Offene Plattformintegration
MongoDB, Portal-Identität, echte Organisationsdaten, gemeinsame Bearbeitung und serverseitige Fachberechnung sind noch offen. Manifestdeklarationen und Standard-Dienstskripte sind Vorbereitungen. Es wurde kein Portal, Proxy oder Dienst verändert.
