# Prüfstand – 10.11.2026

## Nachgewiesene Korrekturen
- Die Antwort des alten Servers enthielt zweimal U+FEFF vor dem Dokumenttyp. Dies erklärte das verschobene Raster im Screenshot. Die Vorlagen werden jetzt mit UTF-8-BOM-Behandlung geladen, lokal aktualisiert und als HTML ohne Cache ausgeliefert.
- Alle im gerenderten HTML verwendeten Icon-Verweise werden gegen das offizielle Sprite geprüft. Die ungültigen Namen wurden ersetzt.
- UI-Kit 2.21.0 wurde unverändert synchronisiert. Kopfzeile, Footer, Symbole und Klickflächen verwenden die Originalwerte.
- Die Monatsberechnung summiert ausschließlich tatsächlich belegte Kalendertage.
- Schreibzugriffe vergleichen die geladene Revision. Veraltete Browserstände erhalten HTTP 409.

## Automatische Prüfungen
`python -m pytest -p no:cacheprovider -o addopts="" tests`: 41 Tests erfolgreich. Zusätzlich zu den Plattform-, Rollen-, HTML- und Speicherprüfungen kontrolliert die unabhängige Stundenplanprüfung Quellen, ganze Stunden, Gate- und Änderungsintervalle, Rundung und Budgetsummen. Ungültige Stundenpläne werden vor dem Speichern abgelehnt. Die Prüfung deckt auch die Reihenfolge und Erreichbarkeit der Editor-Skripte ab.

`tests/plan.test.js`: Budgetsummen, ganze Stunden, Gate- und Monatsgrenzen sowie gewichtete Wochen wurden mit der JavaScript-Laufzeit geprüft.

`tests/roles.test.js`: Dropdown mit Projektleiter/QVP, Person mit QVP-Zuordnung, Umbenennen mit erhaltener ID, zusätzliche Rolle, Abfangen doppelter Namen und aktualisierte Auswahl wurden geprüft. Der Personendialog verwendet die unveränderte Formular- und Aktionszeile des UI-Kits. Seine tatsächliche Browserdarstellung bleibt Bestandteil der noch offenen Sichtprüfung.

`tests/hours.test.js`: absolute Wochen- und Monatseingaben, Diagrammmarkup, Live-Summen, Schutz manueller Werte beim Ausgleichen, ungültige Eingaben, Speicherung, Wechsel ohne Datenänderung, Gate-/Monatsgrenzen, geänderte Budgets und Planwertänderungen geprüft. Der Stundenstand des vorhandenen Projekts wurde zusätzlich gegen die vorherige Berechnung aus Git verglichen: Alle bisherigen Tagesstunden sind unverändert.

Der automatische Plattform-Check prüft nur einen Teil der Regeln. Seine PASS-Zeilen sind keine Produktionsfreigabe. Die manuellen Aufgaben und lokalen Abweichungen bleiben bestehen.

`tests/forecast.test.js`: überlastete Einzelperson bei freier Teamkapazität, mehrere Projekte je Person, zukünftiger Engpass, Teilzeit-/Monatskapazität, kleine Überschreitungen, fehlende Zuordnung und Nullkapazität geprüft. Gates einschließlich exklusivem Gate 8, Sommerzeitgrenzen und nahe Labels sowie Horizont- und Zeitraumauswahl geprüft. Die komplette Übersicht wurde zusätzlich mit Personenmatrix gerendert.

Bei einem Python-Test trat einmalig ein Dateizugriffsfehler auf. Begrenzte Wiederholungen und temporäre Bereinigung sind mit eigenen Fehlerfalltests abgedeckt; anschließend waren alle 41 Tests erfolgreich.

Der erneute Git-Pull der Referenz-Repositories lieferte keine Rückmeldung und wurde beendet. Verwendet werden die unten genannten lokalen Commit-Stände; die UI-Kit-Kopie wird gegen diese lokale Referenz geprüft.

## Sichtprüfung
Eine vollständige dokumentierte Sicht- und Bedienprüfung bei 1440 × 900, 768 × 1024 und 390 × 844 steht noch aus. Der bisherige Browserzugriff wurde durch die Computersteuerung abgebrochen. Die Regressionstests prüfen die Ursache des gelieferten Screenshots; sie bescheinigen keine tatsächlichen Browserabmessungen oder vollständige Bedienbarkeit.

Für Version 0.6.0 prüft `tests/project-links.test.js` den erzeugten Link in Portfolio, Projektliste und Projektdetail, die Kodierung ungewöhnlicher Projektnummern sowie das Klickverhalten innerhalb einer Projektkarte. Das Mausrad-Verhalten wurde durch Trennung der nativen Scrollachsen korrigiert; eine interaktive Prüfung mit Maus und Trackpad im Browser steht noch aus.

## Referenzen und offene Aufgaben
GMA 4.9.1 `d7adb792b663419eed2955d446a0203a231b9057`; Designsystem 2.21.0 `7ee9123e3a03e54f4399ac30cf76c4c8a9dc7435`.

Der erneute Remote-Abgleich vor Version 0.6.0 war ohne interaktive GitHub-Anmeldung nicht möglich. Verwendet und lokal geprüft wurden die genannten vorhandenen Stände.

Vor einer Plattformfreigabe: serverseitige Fachvalidierung, Rollen und Portal-Anmeldung, MongoDB, bestätigte Organisationsdaten, echte Betriebs- und Sicherungsparameter und vollständige manuelle Regelprüfung. SAP-Verarbeitung und mehrere Rollenzuordnungen je Projekt sind weitere fachliche Schritte. Die aktuelle Version ist eine lokale Vorführung.
