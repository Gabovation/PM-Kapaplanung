# Kapazitätsplanung – Bedienung

## Einstieg
Die linke Navigation öffnet Übersicht, Projekte, Personen und Einstellungen. Mit dem Pfeil oberhalb der Navigation werden die Beschriftungen ein- und ausgeklappt. Auf kleinen Bildschirmen stehen die Hauptziele am unteren Rand. Nach einem Neustart des Servers die Browserseite neu laden.

## Personen und Kapazität
Person mit Name, Rolle und FTE-Prozent anlegen. Die Rolle wird aus einem Dropdown gewählt. Zu Beginn sind Projektleiter und QVP vorhanden. In Einstellungen gilt zunächst: 100 % FTE = 40 Stunden pro Woche. Eine Person mit 50 % FTE hat dadurch 20 Wochenstunden. Feiertage und Abwesenheiten sind noch nicht enthalten.

## Rollen bearbeiten und hinzufügen
Unter Einstellungen → Rollen mit „Rolle hinzufügen“ eine neue Bezeichnung anlegen. „Bearbeiten“ benennt eine vorhandene Rolle um. Bereits zugewiesene Personen behalten ihre Rolle und zeigen automatisch die neue Bezeichnung. Rollennamen müssen ausgefüllt und eindeutig sein. Die Rollen gelten für die lokale Kapazitätsplanung.

## Projekte
Projektname, Projektnummer, Status, verantwortliche Person und Basisbudget eingeben. Die Termine von Gate 3, Gate 5, Gate 6, Gate 7 und Gate 8 müssen aufsteigend sein. Gate 8 ist das exklusive Ende. Die vier Prozentanteile ergeben zusammen 100 %. Der Favorit aus Einstellungen kann im Projektformular angewendet werden.

In der Übersicht stehen Auslastung und Portfolio auf breiten Bildschirmen gleich breit nebeneinander, auf schmalen Bildschirmen untereinander. Das Portfolio zeigt die ersten fünf Projekte mit Person, Gate-Planstand, nächstem Gate und Budget in Spalten. Über „Alle ansehen“ öffnet sich die vollständige Projektliste. Falls die Tabelle nicht vollständig ins Fenster passt, kann sie horizontal verschoben werden.

Der Projektstatus „Gewonnen“ oder „Erwartet“ steht als beschriftete Markierung im Portfolio, in der Projektliste und im Projektdetail. Er lässt sich über „Bearbeiten“ ändern.

In der Projektliste sind die Karten nach „Gewonnen“ und „Erwartet“ gruppiert. Innerhalb jeder Gruppe stehen Projekte mit dem frühesten nächsten geplanten Gate zuerst. Projekte ohne weiteres Gate oder ohne gültige Gate-Termine stehen am Ende ihrer Gruppe. Bei gleichen Terminen bleibt die bisherige Reihenfolge erhalten. Abweichende oder fehlende Projektstatus erscheinen in einer zusätzlichen Gruppe „Weiterer Status“.

Bei jedem Projekt öffnet „SharePoint öffnen“ die Seite, deren Adresse aus `https://polytec.sharepoint.com/sites/m365-pep-` und der Projektnummer besteht. Der Link steht im Portfolio der Übersicht, in der Projektliste und im Projektdetail und öffnet einen neuen Browser-Tab.

## Feinplanung
Im Projekt „Verlauf bearbeiten“ öffnen. Wochen oder Monate auswählen und ganze Stunden direkt in die Zeiträume eintragen. Die Zeitachse läuft von links nach rechts und lässt sich horizontal verschieben. Das Diagramm über den Eingaben zeigt die Änderungen sofort. Basisstunden und Planwertänderungen sind getrennt dargestellt.

Über dem Diagramm scrollt das Mausrad weiterhin auf und ab. Die Zeitachse kann über ihre horizontale Scrollleiste oder mit einer horizontalen Trackpad-Geste nach links und rechts verschoben werden.

Jede Gate-Phase und jede Planwertänderung hat eine eigene Zeile mit ihrem Budget. Nicht zur Phase gehörende Zeiträume zeigen einen Strich. Nach einer Eingabe zeigt die Zeile, wie viele Stunden noch offen oder zu viel verteilt sind. Mit „Ausgleichen“ wird die Differenz auf noch unbearbeitete Zeiträume dieser Zeile verteilt. Die bereits eingegebenen Werte bleiben erhalten. Wenn diese Werte allein das Budget überschreiten, muss einer davon reduziert werden.

Wochen und Monate zeigen denselben Stundenstand. Ein Wechsel des Rasters verändert die Summen nicht. „Verlauf speichern“ wird verfügbar, sobald jede Zeile ihr Budget erreicht und alle Eingaben gültig sind. „Abbrechen“ verwirft den Entwurf. Bei Projekten über sechs Monate startet die neue Planung standardmäßig in der Monatssicht; die gespeicherte Auswahl wird anschließend beibehalten.

Die Gates G3, G5, G6, G7 und G8 erscheinen mit Datum, Verbindungslinie und Meilenstein im Verlauf. Sie zeigen den tatsächlichen Termin innerhalb des Zeitraums, auch Gate 8 am exklusiven Projektende. Liegen mehrere Termine eng zusammen, werden ihre Labels untereinander angeordnet.

## Planwertänderung
Zusätzliche ganze Stunden und das Gültigkeitsdatum eintragen. Die Stunden werden ab diesem Datum bis Gate 8 entsprechend den verbleibenden Basisstunden verteilt. Bestehende Spitzen werden dadurch berücksichtigt. Falls im verbleibenden Basisplan keine Stunden liegen, erfolgt eine gleichmäßige Verteilung auf die verbleibenden Tage. Die Änderung bleibt als eigene Zeile erkennbar und kann in der Feinplanung ebenfalls angepasst werden.

## Engpässe erkennen
In der Übersicht Woche oder Monat auswählen und mit den Pfeilen den Zeitraum wechseln. Geplante Stunden werden projektübergreifend addiert. Mehr als 100 % bedeutet Überlastung. Erwartete Projekte zählen vollständig mit. Projekte ohne Personenzuweisung belasten noch keine Person.

Die zusätzliche Grafik „Kapazität und Engpässe“ zeigt Team- und höchste Einzelauslastung über mehrere Zeiträume. Unter „Vorschau“ 12, 26 oder 52 Wochen beziehungsweise 12, 24 oder 36 Monate auswählen. Die gestrichelte Linie markiert 100 % Kapazität. Prozentwerte oberhalb und Ausrufezeichen in der Personenmatrix kennzeichnen Überlastung. Der erste Engpass und die Zahl betroffener Personen stehen über der Grafik.

Die höchste Einzelauslastung kann bereits 160 % erreichen, obwohl das Team nur bei 80 % liegt. Die Matrix zeigt deshalb jede Person getrennt. Ein Klick auf einen Diagrammpunkt oder eine Matrixzelle stellt die Personenübersicht auf den zugehörigen Zeitraum ein. Nicht zugeordnete Stunden erscheinen als separate Warnung.

In der Zeile „Team gesamt“ sind Werte ab 85 % orange und ab 100 % rot hinterlegt. Grundlage für die Farbe ist der ungerundete Wert; die Anzeige kann daher durch Rundung bereits 85 % beziehungsweise 100 % zeigen, obwohl die nächste Farbstufe noch nicht erreicht ist. Die Markierung bei genau 100 % bedeutet volle Teamkapazität; als persönliche Überlastung gilt weiterhin erst ein Wert über 100 %.

Die Kurven zeigen gewonnene Projekte und die Summe aus gewonnenen und erwarteten Projekten als Anteil der gesamten Teamkapazität. Beispiel: Bei 80 h Teamkapazität ergeben 24 h gewonnen 30 % und zusammen mit 16 h erwartet 50 %. Der Abstand zwischen den Kurven entspricht damit 20 Prozentpunkten aus erwarteten Projekten. Bei Stunden aus Projekten mit anderem Status erscheint zusätzlich die Kurve „Team gesamt“. In jeder Personenzelle stehen unter dem Gesamtprozentwert die Stunden als „G“ für gewonnen und „E“ für erwartet. Beim Darüberfahren werden die Werte ausgeschrieben. Beide Projektarten zählen vollständig zur Gesamtauslastung und zur Engpassprüfung; die Kurven sind keine Gewinnwahrscheinlichkeit.

Die Vorschau startet im ausgewählten Zeitraum. Aktuelle FTE gelten für alle zukünftigen Perioden. Abwesenheiten und Feiertage sind nicht abgezogen. Monatswerte können einzelne Wochenengpässe glätten; bei Bedarf auf Woche umschalten.

Die Auswahl „Vorschau mindestens“ bestimmt, wie viele Wochen beziehungsweise Monate mindestens dargestellt werden. Die Zeitachse reicht bei länger laufenden Projekten bis zum letzten Projektende. Über den horizontalen Scrollbalken unter der Matrix werden die späteren Zeiträume sichtbar; Diagramm und Tabelle bewegen sich gemeinsam. Die Engpassmeldung bezieht sich auf den gesamten dargestellten Zeitraum. Bei mehr als 600 Zeiträumen erscheint ein Hinweis mit einer Datumsauswahl für einen späteren Beginn; der abgeschnittene Teil ist nicht in der Engpassmeldung enthalten.

## Sichern
In Einstellungen eine JSON-Sicherung exportieren. Wiederherstellen ersetzt die aktuelle Planung nach Bestätigung. Auch ältere Sicherungen mit frei eingegebenen Rollen werden übernommen. Ein veraltetes Browserfenster erhält beim Speichern einen Konfliktfehler. Dann zuerst die Eingaben als Sicherung exportieren und die Seite danach neu laden.

## SAP
SAP-Buchungen, Ist- und Reststunden sind noch nicht enthalten.


## Gate-Status und nächstes Gate
Das Portfolio zeigt bei jedem Projekt den „Gate-Status (Plan)“ und das nächste Gate mit Datum. Dieselben Angaben stehen in der Projektliste und im Projektdetail. Grundlage sind die hinterlegten Gate-Termine und das lokale Tagesdatum des Browsers. Der gewählte Zeitraum der Kapazitätsvorschau beeinflusst diesen Status nicht.

Am Tag eines Gate-Termins wird dieses Gate als aktueller Planstand angezeigt; das darauffolgende Gate ist das nächste. Vor Gate 3 erscheint „Vor Gate 3“. Ab dem Termin von Gate 8 erscheint „Ab Gate 8“ und „Kein weiteres Gate“. Die Anzeige aktualisiert sich beim lokalen Tageswechsel. Der Planstand bestätigt keine tatsächliche Gate-Freigabe.
