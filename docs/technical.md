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

Horizontale Diagrammflächen verwenden `overscroll-behavior-x: contain` und `overscroll-behavior-y: auto`. Dadurch bleibt die horizontale Zeitachsenbegrenzung erhalten, während vertikale Mausradbewegungen an den Arbeitsbereich oder den scrollbaren Dialog weitergereicht werden. Es gibt keinen JavaScript-Wheel-Handler, der native Trackpad- oder Mausradbewegungen abfängt.

`sharePointLink` erzeugt die URL aus dem festen Host und der mit `encodeURIComponent` behandelten Projektnummer. Die Darstellung erfolgt im Portfolio, in der Projektliste und im Projektdetail. Die normale Linkaktion öffnet einen neuen Tab; das Klickereignis wird nicht an die umgebende Projektkarte weitergegeben.

Bei lokalen Schreibzugriffen gibt es maximal drei Dateiersatzversuche mit 25 ms Abstand bei `PermissionError`. Temporäre Dateien werden anschließend entfernt. Ein dauerhafter Fehler liefert weiterhin HTTP 500 und ändert den gespeicherten Revisionsstand nicht.


## Gate-Status
`gateStatus` in `static/app/plan.js` prüft fünf gültige aufsteigende Kalendertage und berechnet den aktuellen Gate-Planstand sowie das nächste Gate mit ausschließlich späterem Datum. Standardmäßig verwendet die Funktion das lokale Tagesdatum; für deterministische Tests kann ein Stichtag übergeben werden. Ein Timer rendert die betroffenen Projektansichten kurz nach dem nächsten lokalen Mitternachtswechsel neu. Die Anzeige verwendet vorhandene Felder und verändert keine gespeicherten Daten.

`portfolioTable` stellt die vorhandenen Projektdaten mit der Tabellenklasse des UI-Kits dar und nutzt `gateStatus`, `sharePointLink` und `totals`. Das Raster `.layout` verwendet zwei gleich große Spalten; `.split` für die Einstellungen behält seine bisherige Aufteilung. Bei höchstens 64 rem werden beide Raster einspaltig. Der bestehende Tabellencontainer erlaubt bei Bedarf horizontales Scrollen.

`KapaCapacity.build` aggregiert zusätzlich zu den unveränderten Gesamtstunden die Tagesstunden nach `Gewonnen` und `Erwartet`. `wonRatio` und `combinedRatio` teilen gewonnene beziehungsweise gewonnene plus erwartete Stunden durch die Teamkapazität. Unbekannte Status bleiben in der Gesamtsumme und außerhalb der Statusquoten; nicht zugeordnete Stunden bleiben separat. Bei Stunden aus anderen Status erscheint zusätzlich die gesamte Teamkurve. `capacity-view.js` zeigt Statuskurven und Stundenanteile in der Personenmatrix. `projectStatusBadge` stellt die beschrifteten Projektstatus in den Projektansichten dar.

`teamCapacityLevel` klassifiziert den ungerundeten Teamquotienten mit inklusiven Grenzen bei 85 und 100 Prozent. Die CSS-Markierung gilt nur für die Teamzeile; die Berechnung individueller Überlastung bleibt unverändert. Datumsspalten und Teamwerte sind zentriert.

`forecastHorizon` berechnet vom ausgewählten Start bis zum spätesten gültigen exklusiven Gate 8 mindestens die gewählte Anzahl Perioden, höchstens jedoch 600. Für Wochen verwendet die Funktion UTC-Kalendertage, um Sommerzeitverschiebungen zu vermeiden. Bei mehr als 600 Perioden zeigt die Oberfläche eine Begrenzungsmeldung und `setForecastStart` ermöglicht einen späteren Start. Ein gemeinsamer nativer Scrollcontainer bewegt Diagramm und Matrix horizontal; die Periodenbreite berücksichtigt die gewählte Mindestvorschau. Der separate Schieberegler wurde entfernt.

`projects` gruppiert Projektkarten nach Status. `sortedProjectsByNextGate` berechnet den nächsten Termin mit `gateStatus` und sortiert eine Kopie stabil nach Datum; fehlende nächste Termine stehen zuletzt. Die gespeicherte Projektliste wird nicht umsortiert.

Projektgruppen und leere Zustände verwenden `--polytec-space-6`. Die Navigation verwendet für Einstellungen das vorhandene UI-Kit-Icon `parameters`, da das im lokalen Designsystem vorhandene `settings`-SVG einen fehlerhaften Pfad enthält. Die App ändert das vendorte Sprite nicht.

`handleNavigationClick` ergänzt den bestehenden `hashchange`-Handler für den Fall, dass eine interne Detailansicht geöffnet ist, die Browseradresse aber bereits den Anker des angeklickten Navigationsziels enthält. Nur unmodifizierte linke Klicks auf gleichseitige Hauptnavigationslinks werden behandelt; abweichende Ziele und Browseraktionen bleiben nativ.

Die Legende in `.kapa-forecast-panel` verwendet größere Schrift und längere Farbmuster. Die Klassen der Kapazitätskurven und ihrer Legendenmuster definieren kräftigere Strichstärken; Farb- und Strichmuster bleiben unverändert. Die Stundenverlaufslegende bleibt separat.

`KapaCapacity.build` verteilt `KapaHours.materialize(project).daily` chronologisch auf `person` und `secondPerson`. Der erste Tageswert ist die Differenz der gerundeten kumulierten Anteile; der zweite ist das exakte Tagesreststück. Das optionale `qvpBudget` wird separat anhand derselben Gate-Prozentwerte materialisiert und `qvpPerson` zugeordnet; ohne gültige Person gehen diese Stunden in `unassigned`. `validate_assignments` prüft die neuen optionalen Felder beim Speichern und beim vorbereiteten Sicherungsimport. Das Datenformat bleibt Version 2; alte Projekte mit nur `person` bleiben unverändert lesbar.
