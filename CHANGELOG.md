# Changelog

## 0.2.0 – 10.11.2026
- Oberfläche in die offizielle Connected-Operations-Shell überführt. UI-Kit 2.21.0 und Plattform-Kit 4.9.1 unverändert übernommen.
- Fehlerhaften Dokumentanfang mit UTF-8-BOM entfernt und gegen erneutes Auftreten abgesichert. Lokale Vorlagen werden neu geladen; HTML wird nicht gecacht. Das korrigiert die Ursache des übergroßen Headers und der verschobenen Fußleiste.
- Ungültige Icon-Namen durch vorhandene Standardsymbole ersetzt. Deutsche Dokumentensprache gesetzt.
- Monatszuordnung auf tatsächlich belegte Tage korrigiert. Revisionsvergleich gegen stilles Überschreiben ergänzt.
- Lokaler Starter verwendet Waitress mit freier Portwahl.
- 15 Python-Tests und die Rechentests erfolgreich. Visuelle Prüfung und manuelle Plattformfreigabe bleiben offen; siehe docs/validation.md.

## 0.1.0
- Erste lokale Kapazitätsplanung mit Projekten, Personen, Gate-Verteilung und Planwertänderungen.
