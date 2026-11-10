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


## Prüfung Version 0.7.0
`tests/gate-status.test.js` deckt Status vor G3, an und zwischen Gates, ab G8, das nächste Datum, ungültige Daten sowie die Anzeige im Portfolio, der Projektliste und dem Projektdetail ab. Der Status ist als terminbasierter Planstand gekennzeichnet; eine tatsächliche Gate-Freigabe wird nicht behauptet.

Der erneute Remote-Abgleich der privaten Referenz-Repositories war ohne interaktive GitHub-Anmeldung nicht möglich. Verwendet wurden die oben genannten lokalen Commit-Stände.

## Prüfung Version 0.8.0
41 Python-Tests und sechs JavaScript-Prüfgruppen waren erfolgreich. Die bestehenden Prüfungen decken die Gate-Anzeige und den SharePoint-Link auch im Portfolio ab. Die lokale UI-Kit-Kopie stimmt mit dem lokalen Designsystem-Repository überein. Der lokale Server liefert die aktualisierten Skripte und Styles aus. Eine visuelle Browserprüfung der neuen Aufteilung steht noch aus. Der erneute Remote-Abgleich der Referenz-Repositories war ohne GitHub-Anmeldung nicht möglich; verwendet wurden die oben genannten lokalen Commit-Stände.

## Prüfung Version 0.9.0
41 Python-Tests und sechs JavaScript-Prüfgruppen waren erfolgreich. `tests/forecast.test.js` prüft Statusanteile bei gemischten Projekten, Wochen- und Monatsauswertung, Beibehaltung der Gesamtsumme und einen unbekannten Status. Die lokale UI-Kit-Kopie entspricht dem lokalen Designsystem-Repository. Eine visuelle Browserprüfung der neuen Grafik und Matrix steht noch aus. Verwendet wurden die oben genannten lokalen Referenzstände; der Remote-Abgleich war zuvor ohne GitHub-Anmeldung nicht möglich.

## Prüfung Version 0.9.1
41 Python-Tests und sechs JavaScript-Prüfgruppen waren erfolgreich. Die Teamgrenzen wurden bei 84,999 %, 85 %, 99,999 %, 100 % und unendlicher Auslastung geprüft. Eine visuelle Browserprüfung der Ausrichtung und Farbflächen steht noch aus.

## Prüfung Version 0.9.2
41 Python-Tests und sechs JavaScript-Prüfgruppen waren erfolgreich. Die Navigation wurde für Fensterwechsel und direkte Startposition geprüft; ein fünf Jahre entferntes Projektende wird im Wochen- und Monatsraster vom Schieberegler erreicht. Eine visuelle und interaktive Browserprüfung des Reglers steht noch aus.

## Prüfung Version 0.9.3
41 Python-Tests und sechs JavaScript-Prüfgruppen waren erfolgreich. Die JavaScript-Prüfung deckt die Verlängerung über zwölf Wochen hinaus, das exklusive Projektende, Wochen- und Monatsraster sowie die Begrenzungsmeldung ab. Der vormals separate Schieberegler wurde durch den nativen horizontalen Scrollcontainer ersetzt. Eine visuelle und interaktive Browserprüfung steht noch aus.

## Prüfung Version 0.9.4
41 Python-Tests und sechs JavaScript-Prüfgruppen waren erfolgreich. `tests/gate-status.test.js` prüft die Gruppenreihenfolge, aufsteigende nächste Gate-Termine, abgeschlossene Projekte und die unveränderte gespeicherte Reihenfolge. Die vorhandenen Linkprüfungen bestätigen die SharePoint-Links in der Projektliste. Die lokale UI-Kit-Kopie entspricht dem lokalen Designsystem-Repository. Eine visuelle Browserprüfung steht noch aus.

## Prüfung Version 0.9.5
41 Python-Tests und sechs JavaScript-Prüfgruppen waren erfolgreich. Alle in der App-CSS verwendeten POLYTEC-Tokens sind im lokalen UI-Kit definiert; die Icon-Prüfung bestätigt das vorhandene Parameter-Symbol. Das vendorte UI-Kit stimmt mit dem lokalen Designsystem-Repository überein. Eine visuelle Browserprüfung steht noch aus.

## Prüfung Version 0.9.6
41 Python-Tests und sieben JavaScript-Prüfgruppen waren erfolgreich. `tests/navigation.test.js` prüft für alle vier Hauptseiten den Klick aus einer Detailansicht bei gleichem Browseranker sowie Strg-Klick, mittlere Maustaste, neuen Tab, fremden Ursprung und andere Anker. Eine interaktive Browserprüfung des Ablaufs „Projekt anlegen → Übersicht“ steht noch aus. Die lokale UI-Kit-Kopie entspricht dem lokalen Designsystem-Repository.
