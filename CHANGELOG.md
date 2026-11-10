# Changelog

## 0.9.3 – 10.11.2026
- Die Vorschau verwendet wieder den normalen horizontalen Scrollbalken unter Diagramm und Tabelle. Die Zeitachse reicht mindestens über die gewählte Vorschau und bei längeren Projekten bis zum letzten Projektende. Der separate Schieberegler entfällt.
- Die Engpassmeldung betrachtet den gesamten dargestellten Zeitraum. Zum Schutz der Darstellung gilt eine Grenze von 600 Zeiträumen; darüber erscheint ein Hinweis mit Datumsauswahl.

## 0.9.2 – 10.11.2026
- Die Kapazitätsvorschau besitzt einen Schieberegler sowie „Zurück“ und „Weiter“, um das gewählte Zeitfenster über die zunächst angezeigten Wochen oder Monate hinaus zu verschieben. Der Bereich und der sichtbare Start und das Ende werden angezeigt.

## 0.9.1 – 10.11.2026
- Die Zeiträume und Teamwerte in der Auswertungsmatrix sind zentriert. In „Team gesamt“ sind Werte ab 85 % orange und ab 100 % rot hinterlegt; die Einstufung erfolgt vor der Rundung.

## 0.9.0 – 10.11.2026
- Gewonnene und erwartete Projekte sind im Portfolio, in der Projektliste und im Projektdetail mit beschrifteten Statusmarkierungen unterscheidbar.
- Die Kapazitätsvorschau zeigt die Anteile gewonnener und erwarteter Projekte an der Teamkapazität als getrennte Kurven. Die Personenmatrix ergänzt die jeweiligen Stunden. Beide Projektarten bleiben vollständig in Gesamtauslastung und Engpassprüfung enthalten.

## 0.8.0 – 10.11.2026
- Die Bereiche „Auslastung nach Person“ und „Projekte“ sind auf breiten Bildschirmen gleich breit. Bei schmalen Fenstern stehen sie untereinander.
- Das Portfolio zeigt Projekt, verantwortliche Person, Gate-Status (Plan), nächstes Gate und Budget in einer Tabelle. Projektnummer und SharePoint-Link bleiben beim Projekt sichtbar.

## 0.7.0 – 10.11.2026
- Im Portfolio, in der Projektliste und im Projektdetail werden der terminbasierte Gate-Status und das nächste Gate mit Datum angezeigt.
- Grundlage ist das lokale Tagesdatum: Ab dem Tag eines Gate-Termins gilt dieses Gate als Planstand. Vor G3 erscheint „Vor Gate 3“, ab G8 „Ab Gate 8“ und „Kein weiteres Gate“.
- Die Anzeige aktualisiert sich beim lokalen Tageswechsel und ist als Planstand statt tatsächlicher Gate-Freigabe gekennzeichnet.

## 0.6.0 – 10.11.2026
- Vertikale Mausradbewegungen über den horizontal scrollbaren Diagrammen werden wieder an den Arbeitsbereich beziehungsweise den Dialog weitergereicht. Horizontales Scrollen der Zeitachse bleibt möglich.
- Portfolio, Projektliste und Projektdetail enthalten einen SharePoint-Link zur Adresse `https://polytec.sharepoint.com/sites/m365-pep-` plus Projektnummer. Der Link öffnet einen neuen Tab und löst in der Projektkarte keine zusätzliche Navigation aus.

## 0.5.0 – 10.11.2026
- Gates G3, G5, G6, G7 und G8 mit Datum und Meilenstein im Stundenverlauf ergänzt, datumsgenau in Wochen und Monaten. Eng beieinanderliegende Labels stehen auf getrennten Zeilen.
- Übersicht um Team- und höchste Einzelauslastung, 100-%-Grenze und eine Personenmatrix erweitert. Erster Engpass, betroffene Personen und nicht zugewiesene Stunden werden ausgewiesen.
- Vorschau über 12/26/52 Wochen oder 12/24/36 Monate ab dem ausgewählten Zeitraum. Diagrammpunkte und Matrixzellen stellen die Personenübersicht auf den gewählten Zeitraum ein.
- Vorschau und aktuelle Auslastung verwenden dieselbe Berechnung und ungerundete Schwellenwerte.
- Ein im Test aufgetretener temporärer Windows-Zugriffsfehler wurde mit begrenzten Wiederholungen bei Dateisperren und Aufräumen temporärer Dateien abgesichert.
- 41 Python-Tests und vier JavaScript-Prüfgruppen erfolgreich; visuelle Browserabnahme bleibt offen.

## 0.4.0 – 10.11.2026
- Feinplanung von Gewichten auf absolute ganze Stunden umgestellt. Wochen und Monate laufen von links nach rechts; die Ansicht ist umschaltbar und zeigt Basisstunden, Planwertänderungen und den Gesamtverlauf als Diagramm.
- Jede Gate-Phase und Planwertänderung besitzt eine eigene Stundenzeile. Live-Summen zeigen offene oder überschrittene Budgets. „Ausgleichen“ verteilt die Differenz auf noch unbearbeitete Zeiträume, ohne manuelle Eingaben zu ändern.
- Wochen und Monate werden aus derselben Tagesverteilung aggregiert. Umschalten allein verändert keine Stunden. Beim Speichern müssen alle Phasenbudgets exakt erfüllt sein. Ein neuer serverseitiger Prüfschritt kontrolliert ganze Stunden, Intervalle, Quellen und Summen.
- Vorhandene gewichtete Planungen werden mit unveränderten Stunden angezeigt. Beim ersten Speichern werden absolute Werte übernommen. Geänderte Gate-Termine und Budgets verteilen betroffene Verläufe passend um. Neue Planwertänderungen folgen den verbleibenden Basisstunden und behalten ihre eigene Herkunft.
- 39 Python-Tests sowie JavaScript-Prüfungen der Planung, Rollen und des neuen Editors erfolgreich. Die bisherigen Stunden des vorhandenen Projekts wurden gegen den Vorgängerstand verglichen und sind unverändert.

## 0.3.0 – 10.11.2026
- Rollen sind im Personendialog per Dropdown auswählbar. Startrollen: Projektleiter und QVP.
- Unter Einstellungen können Rollen hinzugefügt und umbenannt werden. Personen referenzieren unveränderliche Rollen-IDs; Umbenennen erhält die Zuordnung. Doppelte oder leere Bezeichnungen werden abgefangen.
- Der Personendialog verwendet die kompakte Formulargröße, den Kopfbereich und die Aktionszeile des UI-Kits. Abbrechen und Speichern stehen nebeneinander rechts. Schmale Bildschirme zeigen die Felder untereinander.
- Datenformat 2 führt den Rollenkatalog und `person.roleId` ein. `tools/migrate_roles.py` unterstützt Vorschau und Sicherung der unveränderten Ursprungsdatei. Alte JSON-Sicherungen werden beim ausdrücklichen Import vorbereitet, ohne die laufende Planung vor der Bestätigung zu verändern.
- 25 Python-Tests sowie JavaScript-Prüfungen für Rollen, Personendialog und Planungsrechnung erfolgreich. Das synchronisierte UI-Kit wurde nicht verändert.

## 0.2.0 – 10.11.2026
- Oberfläche in die offizielle Connected-Operations-Shell überführt. UI-Kit 2.21.0 und Plattform-Kit 4.9.1 unverändert übernommen.
- Fehlerhaften Dokumentanfang mit UTF-8-BOM entfernt und gegen erneutes Auftreten abgesichert. Lokale Vorlagen werden neu geladen; HTML wird nicht gecacht. Das korrigiert die Ursache des übergroßen Headers und der verschobenen Fußleiste.
- Ungültige Icon-Namen durch vorhandene Standardsymbole ersetzt. Deutsche Dokumentensprache gesetzt.
- Monatszuordnung auf tatsächlich belegte Tage korrigiert. Revisionsvergleich gegen stilles Überschreiben ergänzt.
- Lokaler Starter verwendet Waitress mit freier Portwahl.
- 15 Python-Tests und die Rechentests erfolgreich. Visuelle Prüfung und manuelle Plattformfreigabe bleiben offen; siehe docs/validation.md.

## 0.1.0
- Erste lokale Kapazitätsplanung mit Projekten, Personen, Gate-Verteilung und Planwertänderungen.
