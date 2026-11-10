# Changelog

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
