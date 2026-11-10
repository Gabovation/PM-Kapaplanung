# Kapazitätsplanung – technische Dokumentation

## Aktuelle Laufzeit
`server.py` ergänzt `.local_packages` und `src` zum Importpfad, erstellt die Flask-App und startet Waitress auf 127.0.0.1. Standardport 0 lässt das Betriebssystem einen freien Port auswählen. `KAPA_PORT` überschreibt diesen Wert. Der lokale Starter ist der getestete Einstieg; die Plattform-Dienstintegration ist vorbereitet, aber nicht abgenommen.

## Struktur
- `src/kapa_planung/web.py`: lokale App, HTML-Seite und Datenendpunkt.
- `src/kapa_planung/ops_platform`: unverändert verteiltes Plattform-Kit.
- `templates/layout.html`: Erweiterung der offiziellen Connected-Operations-Shell.
- `templates/index.html`: Einstieg in die Planung.
- `static/app/plan.js`: Stammdaten, Projektformulare, Übersichten und Datensynchronisation.
- `static/app/hours.js`: absolute Tagesplanung je Budgetquelle, Aggregation, Restausgleich und Abgleich geänderter Gate-Budgets.
- `static/app/fine-editor.js`: horizontaler Stundeneditor, SVG-Verlauf und Live-Summen ohne Austausch aktiver Eingabefelder.
- `static/app/app.css`: fachliches Layout mit UI-Kit-Tokens.
- `static/polytec` und die UI-Templateordner: unverändert synchronisierte Komponenten.

## Daten
`planung.json` enthält in Datenformat 2 Version, Revision, FTE-Wochenstunden, Favorit, Rollenkatalog, Personen und Projekte. Rollen besitzen eine unveränderliche ID und eine editierbare Bezeichnung. Personen referenzieren `roleId`. Projekte besitzen Basisbudget, vier Prozentanteile, fünf Gate-Termine, Planwertänderungen und optional `hourPlan`. Dessen `sources` referenzieren `phase-0` bis `phase-3` beziehungsweise `change-<ID>` und enthalten ganze Tagesstunden innerhalb des Quellenintervalls. Bestehende gewichtete Projekte behalten bis zum ersten Speichern der neuen Feinplanung ihren bisherigen Stundenstand. SAP-Buchungen sind nicht enthalten.

GET liefert den aktuellen lokalen Stand. POST benötigt den beim Seitenaufruf gelieferten Schreib-Token sowie die geladene Revision. Ein Prozess-Lock schützt Vergleich und atomaren Dateiersatz. Konflikte liefern 409, ungültige Schreib-Tokens 403. Die serverseitige Prüfung ist derzeit strukturell und muss vor einem produktiven Einsatz um die vollständigen Fachregeln ergänzt werden.

Für Rollen prüft der Server zusätzlich eindeutige IDs und Namen, Namenslänge, Kataloggröße sowie gültige Personenreferenzen. Die explizite Migration `tools/migrate_roles.py` unterstützt `--dry-run` und sichert Version 1 vor dem Dateiersatz. Normale Datenzugriffe enthalten keine Altformat-Konvertierung. Der separate Endpunkt `/api/prepare-import` bereitet eine ausdrücklich gewählte Sicherung vor, speichert aber nichts. Er verwendet denselben deterministischen Konverter wie das Migrationswerkzeug.

Absolute Stundenpläne prüft `services/planning.py` unabhängig von der Browserrechnung: vollständige Quellen, aktuelle Intervalle und Budgets, ganzzahlige nicht negative Stunden, keine Buchungen außerhalb der Phase oder vor einer Planwertänderung sowie exakte Summen je Quelle. Diese Prüfung greift auch vor dem Vorbereiten eines Sicherungsimports. Weitere ältere Projektfelder ohne absoluten Stundenplan benötigen weiterhin eine vollständige serverseitige Fachvalidierung vor einem produktiven Einsatz.

## HTML und Cache
Vorlagen werden mit UTF-8-BOM-Behandlung geladen. Die lokale Jinja-Umgebung prüft Änderungen. HTML erhält `Cache-Control: no-store`, statische Dateien erhalten die versionierten URLs des Plattform-Kits. Das verhindert, dass unsichtbare Zeichen oder alte Vorlagen beim Weiterentwickeln unbemerkt ausgeliefert werden.

## Offene Plattformintegration
MongoDB, Portal-Identität, echte Organisationsdaten, gemeinsame Bearbeitung und serverseitige Fachberechnung sind noch offen. Manifestdeklarationen und Standard-Dienstskripte sind Vorbereitungen. Es wurde kein Portal, Proxy oder Dienst verändert.


## Kapazitätsvorschau und Gates
`static/app/capacity.js` berechnet die gemeinsame Personen-/Teamkapazität. Ein Projektverlauf wird je Modellaufbau einmal berechnet, dann nach Personen und Perioden aggregiert. Aktuelle Übersicht und Vorschau verwenden dasselbe Modell. `capacity-view.js` zeigt Grafik, 100-%-Grenze, Personenmatrix und Zeitraumauswahl. Beide Dateien werden vor `plan.js` geladen.

`KapaHours.milestones` liefert relative Gate-Positionen. Die SVG-Komposition in `fine-editor.js` verteilt Labels bei Bedarf auf mehrere Zeilen und wird in Projektansicht und Eingabevorschau gemeinsam verwendet. Die Formeln und Darstellungen speichern keine neuen Plandaten.

Bei lokalen Schreibzugriffen gibt es maximal drei Dateiersatzversuche mit 25 ms Abstand bei `PermissionError`. Temporäre Dateien werden anschließend entfernt. Ein dauerhafter Fehler liefert weiterhin HTTP 500 und ändert den gespeicherten Revisionsstand nicht.
