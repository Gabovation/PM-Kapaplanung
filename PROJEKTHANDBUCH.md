# Projekthandbuch – Kapazitätsplanung

## Zweck und Umfang
Die lokale Anwendung unterstützt die projektübergreifende Kapazitätsplanung. Projekte besitzen eine Nummer, einen Namen, den Status gewonnen oder erwartet, eine verantwortliche Person, ein Basisbudget und fünf Gate-Termine. Rollen sind frei beschreibbar; zunächst ist je Projekt eine Person zugeordnet. Weitere Fachbereiche und mehrere Zuordnungen je Projekt benötigen eine spätere Erweiterung.

## Start
Python 3.11 oder neuer ist erforderlich, zusätzliche Pakete sind nicht nötig. Im Projektordner `python server.py` ausführen. Der Browser öffnet sich automatisch; das Terminal muss geöffnet bleiben. Beenden mit Strg+C. Standardmäßig wählt das Betriebssystem einen freien lokalen Port. Optional kann mit `KAPA_PORT` ein fester Port eingestellt werden (PowerShell: `$env:KAPA_PORT=5123; python server.py`). Der Server bindet ausschließlich an 127.0.0.1. Bei fest eingestelltem belegtem Port schlägt der Start sichtbar fehl. Mehrere verschiedene Apps können so parallel laufen. Die Anwendung ist für einen lokalen Benutzer gedacht, nicht für gleichzeitige Bearbeitung durch mehrere Browser oder Benutzer.

## Bedienung
1. Unter Personen die Teammitglieder, ihre Rolle und den Beschäftigungsgrad anlegen. In Einstellungen beträgt die Wochenkapazität bei 100 % FTE zunächst 40 Stunden.
2. Ein Projekt anlegen, Person und Budget wählen und die Termine G3, G5, G6, G7 und G8 in aufsteigender Reihenfolge erfassen. Die vier Prozentwerte müssen zusammen 100 ergeben. Der in Einstellungen gespeicherte Favorit lässt sich im Projektformular anwenden.
3. Im Projekt zeigt der Wochenverlauf die Basisstunden und Planwertänderungen getrennt. Über „Verlauf anpassen“ Wochengewichte ändern: 2 bedeutet doppelte Gewichtung gegenüber 1, 0 bedeutet keine Stunden. Die einzelnen Phasenbudgets bleiben erhalten.
4. Planwertänderung mit positiven ganzen Stunden und Datum zwischen G3 inklusive und G8 exklusiv hinzufügen. Sie wird ab diesem Datum bis zum Projektende nach verbleibenden Tagen und Wochengewichten verteilt. Jede Änderung bleibt einzeln sichtbar und kann entfernt werden.
5. In der Übersicht zwischen Woche und Monat umschalten und den Zeitraum mit Pfeilen ändern. Die Auslastung ist die Summe aller zugewiesenen Projektstunden geteilt durch die individuelle Kapazität. Erwartete Projekte zählen vollständig mit. Ohne Zuordnung erscheint ein Projekt nicht in der Personenauslastung.
6. Unter Einstellungen regelmäßig eine JSON-Sicherung exportieren. Wiederherstellen ersetzt den gesamten aktuellen Stand nach Bestätigung.

## Rechenregeln
Gate-Intervalle beginnen am jeweiligen Gate und enden vor dem folgenden Gate. Zuerst werden die Basisstunden per größtem Rest auf die vier Prozentanteile verteilt. Anschließend werden die Stunden jeder Phase nach überlappenden Kalendertagen und den Wochengewichten auf Wochen aufgeteilt. Dieselbe Rundungsmethode verteilt jede Planwertänderung auf die ab ihrem Datum verbleibenden Tage und Gewichte. So bleiben Wochenwerte und Summen ganzzahlig und jedes Budget geht exakt auf. Nullgewichte sind zulässig, solange jede belegte Phase und Änderung mindestens ein positives Gewicht hat.

Die Wochenkapazität ist FTE × Wochenstunden. Für Monate wird sie anhand der Werktage Montag bis Freitag anteilig berechnet. Für die Monatsansicht werden Wochenstunden nach Kalendertagen auf Monatsgrenzen verteilt und auf ganze Stunden angezeigt; interne Monatswerte können Bruchteile enthalten. Feiertage, Urlaub und andere Abwesenheiten werden nicht abgezogen. Projektstunden werden nicht automatisch auf Personen aufgeteilt. Prozentwerte sind keine Eintrittswahrscheinlichkeiten.

## Daten und Sicherheit
`planung.json` wird im Projektverzeichnis atomar gespeichert und durch `.gitignore` von Git ausgeschlossen. Das JSON-Backup enthält sämtliche personenbezogenen Planungsdaten und muss entsprechend geschützt werden. Kein Login, keine Rechteverwaltung, keine Verschlüsselung und keine gemeinsame Bearbeitung. Browserfenster laden jeweils einen eigenen Stand: paralleles Bearbeiten kann Änderungen überschreiben. Nicht über das Netzwerk freigeben oder als produktiven Mehrbenutzerdienst einsetzen.

## SAP und spätere Entwicklung
Die bereitgestellte Datei `SAP INPUT.xlsx` wurde lediglich hinsichtlich Aufbau und Beispielen geprüft; keine Buchungen wurden importiert. Die Ausleitung enthält Person, Personalnummer, PSP-Element, Datum und Stunden. Ein späterer Import benötigt Zuordnungsregeln für Personalnummer und Projektnummer, Umgang mit PSP-Abteilungssuffixen, Duplikaten, negativen Buchungen und Korrekturen. Bis dahin gibt es keine Ist-Stunden, Reststunden oder automatische Verschiebung. MongoDB ist noch nicht angebunden; die Berechnungslogik und Datenhaltung müssen vor einer Mehrbenutzerlösung serverseitig und transaktionssicher umgesetzt werden.

## Prüfung und bekannte Grenzen
Tests: `python -m unittest discover -s tests`. Sichtprüfung im Browser ist gesondert durchzuführen. Eine Person pro Projekt, keine Ferien-/Feiertagskalender, keine Historisierung von Änderungen am Basisplan, keine SAP-Verarbeitung und kein Konfliktschutz. Port und Datenpfad sind unabhängig, sodass der freie Port beim Neustart die gespeicherten Daten nicht verändert.

## Lessons Learned
- Gate-Termine benötigen eindeutige inklusive/exklusive Grenzen, damit an Übergängen keine Tage doppelt gezählt werden.
- Ganze Stunden müssen mit Restausgleich verteilt werden; unabhängiges Runden würde Budgets verändern.
- Ein zufälliger Port darf nicht als Speicheridentität verwendet werden: Browser-LocalStorage wäre beim Neustart unter einem anderen Port leer.
- Wochengewichte bieten eine einfache Spitzenplanung; ihre Bedeutung und die unterschiedliche Monatsaggregation müssen transparent sein.
- SAP-Buchungen und erwartete Projekte dürfen nicht stillschweigend als bestätigte Ist- oder Wahrscheinlichkeitswerte interpretiert werden.
