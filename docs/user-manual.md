# Kapazitätsplanung – Bedienung

## Einstieg
Die linke Navigation öffnet Übersicht, Projekte, Personen und Einstellungen. Mit dem Pfeil oberhalb der Navigation werden die Beschriftungen ein- und ausgeklappt. Auf kleinen Bildschirmen stehen die Hauptziele am unteren Rand. Nach einem Neustart des Servers die Browserseite neu laden.

## Personen und Kapazität
Person mit Name, Rolle und FTE-Prozent anlegen. Die Rolle wird aus einem Dropdown gewählt. Zu Beginn sind Projektleiter und QVP vorhanden. In Einstellungen gilt zunächst: 100 % FTE = 40 Stunden pro Woche. Eine Person mit 50 % FTE hat dadurch 20 Wochenstunden. Feiertage und Abwesenheiten sind noch nicht enthalten.

## Rollen bearbeiten und hinzufügen
Unter Einstellungen → Rollen mit „Rolle hinzufügen“ eine neue Bezeichnung anlegen. „Bearbeiten“ benennt eine vorhandene Rolle um. Bereits zugewiesene Personen behalten ihre Rolle und zeigen automatisch die neue Bezeichnung. Rollennamen müssen ausgefüllt und eindeutig sein. Die Rollen gelten für die lokale Kapazitätsplanung.

## Projekte
Projektname, Projektnummer, Status, verantwortliche Person und Basisbudget eingeben. Die Termine von Gate 3, Gate 5, Gate 6, Gate 7 und Gate 8 müssen aufsteigend sein. Gate 8 ist das exklusive Ende. Die vier Prozentanteile ergeben zusammen 100 %. Der Favorit aus Einstellungen kann im Projektformular angewendet werden.

## Feinplanung
Im Projekt „Verlauf bearbeiten“ öffnen. Wochen oder Monate auswählen und ganze Stunden direkt in die Zeiträume eintragen. Die Zeitachse läuft von links nach rechts und lässt sich horizontal verschieben. Das Diagramm über den Eingaben zeigt die Änderungen sofort. Basisstunden und Planwertänderungen sind getrennt dargestellt.

Jede Gate-Phase und jede Planwertänderung hat eine eigene Zeile mit ihrem Budget. Nicht zur Phase gehörende Zeiträume zeigen einen Strich. Nach einer Eingabe zeigt die Zeile, wie viele Stunden noch offen oder zu viel verteilt sind. Mit „Ausgleichen“ wird die Differenz auf noch unbearbeitete Zeiträume dieser Zeile verteilt. Die bereits eingegebenen Werte bleiben erhalten. Wenn diese Werte allein das Budget überschreiten, muss einer davon reduziert werden.

Wochen und Monate zeigen denselben Stundenstand. Ein Wechsel des Rasters verändert die Summen nicht. „Verlauf speichern“ wird verfügbar, sobald jede Zeile ihr Budget erreicht und alle Eingaben gültig sind. „Abbrechen“ verwirft den Entwurf. Bei Projekten über sechs Monate startet die neue Planung standardmäßig in der Monatssicht; die gespeicherte Auswahl wird anschließend beibehalten.

## Planwertänderung
Zusätzliche ganze Stunden und das Gültigkeitsdatum eintragen. Die Stunden werden ab diesem Datum bis Gate 8 entsprechend den verbleibenden Basisstunden verteilt. Bestehende Spitzen werden dadurch berücksichtigt. Falls im verbleibenden Basisplan keine Stunden liegen, erfolgt eine gleichmäßige Verteilung auf die verbleibenden Tage. Die Änderung bleibt als eigene Zeile erkennbar und kann in der Feinplanung ebenfalls angepasst werden.

## Engpässe erkennen
In der Übersicht Woche oder Monat auswählen und mit den Pfeilen den Zeitraum wechseln. Geplante Stunden werden projektübergreifend addiert. Mehr als 100 % bedeutet Überlastung. Erwartete Projekte zählen vollständig mit. Projekte ohne Personenzuweisung belasten noch keine Person.

## Sichern
In Einstellungen eine JSON-Sicherung exportieren. Wiederherstellen ersetzt die aktuelle Planung nach Bestätigung. Auch ältere Sicherungen mit frei eingegebenen Rollen werden übernommen. Ein veraltetes Browserfenster erhält beim Speichern einen Konfliktfehler. Dann zuerst die Eingaben als Sicherung exportieren und die Seite danach neu laden.

## SAP
SAP-Buchungen, Ist- und Reststunden sind noch nicht enthalten.
