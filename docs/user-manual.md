# Kapazitätsplanung – Bedienung

## Einstieg
Die linke Navigation öffnet Übersicht, Projekte, Personen und Einstellungen. Mit dem Pfeil oberhalb der Navigation werden die Beschriftungen ein- und ausgeklappt. Auf kleinen Bildschirmen stehen die Hauptziele am unteren Rand. Nach einem Neustart des Servers die Browserseite neu laden.

## Personen und Kapazität
Person mit Name, Rolle und FTE-Prozent anlegen. Die Rolle wird aus einem Dropdown gewählt. Zu Beginn sind Projektleiter und QVP vorhanden. In Einstellungen gilt zunächst: 100 % FTE = 40 Stunden pro Woche. Eine Person mit 50 % FTE hat dadurch 20 Wochenstunden. Feiertage und Abwesenheiten sind noch nicht enthalten.

Das Produktivitätsziel wird unter Einstellungen → Rollen je Rolle festgelegt und beträgt zunächst 80 %. Beim Bearbeiten einer Person kann ein eigenes Ziel eingetragen werden; ein leeres Feld übernimmt das Rollenziel. Die separate Produktivitätstabelle ist nicht mehr in der Übersicht. Das bestehende Kapazitätsdiagramm verwendet weiterhin die volle FTE-Arbeitszeit. Es handelt sich um Planstunden, nicht um SAP-Buchungen.

## Rollen bearbeiten und hinzufügen
Unter Einstellungen → Rollen mit „Rolle hinzufügen“ eine neue Bezeichnung anlegen. „Bearbeiten“ benennt eine vorhandene Rolle um. Bereits zugewiesene Personen behalten ihre Rolle und zeigen automatisch die neue Bezeichnung. Rollennamen müssen ausgefüllt und eindeutig sein. Die Rollen gelten für die lokale Kapazitätsplanung.

## Projekte
Projektname, Projektnummer, Status, verantwortliche Person und Stundenbudgets eingeben. Die Termine von Gate 3, Gate 5, Gate 6, Gate 7 und Gate 8 müssen aufsteigend sein. Gate 8 ist das exklusive Ende. Die vier Prozentanteile für PL und QVP ergeben jeweils zusammen 100 %. Unter Einstellungen kann für jede Rolle ein Favorit gespeichert werden; im Projektformular lassen sich PL- und QVP-Favorit einzeln anwenden.

Bei neuen Projekten werden die Rollenfavoriten automatisch vorbelegt. Die Auswahl von Projektleiter 1 berücksichtigt dessen Rolle, solange die PL-Verteilung nicht bereits manuell bearbeitet wurde. Die QVP-Verteilung wird unabhängig davon vorbelegt. Änderungen an einem Favoriten wirken sich nicht automatisch auf bestehende Projekte aus.

In der Übersicht stehen Auslastung und Portfolio auf breiten Bildschirmen gleich breit nebeneinander, auf schmalen Bildschirmen untereinander. Das Portfolio zeigt die ersten fünf Projekte mit Person, Gate-Planstand, nächstem Gate und Budget in Spalten. Über „Alle ansehen“ öffnet sich die vollständige Projektliste. Falls die Tabelle nicht vollständig ins Fenster passt, kann sie horizontal verschoben werden.

Im Projektformular können ein erster und optional ein zweiter Projektleiter ausgewählt werden. Der Prozentwert legt den Anteil des ersten fest; der zweite erhält den angezeigten Rest. Ohne zweiten Projektleiter entfallen 100 % auf den ersten. Die Aufteilung gilt für den gesamten Projektzeitraum, einschließlich der PL-Planwertänderungen. Sie kann über „Bearbeiten“ jederzeit geändert werden; auch bereits vergangene Planzeiträume werden dabei neu aufgeteilt. Die Planung verwendet ganze Stunden und verteilt Rundungsreste über den Verlauf, sodass die Projektstundensumme erhalten bleibt.

Eine QVP-Person und ihr zusätzliches QVP-Stundenbudget lassen sich im selben Formular erfassen. Das QVP-Budget kommt zum PL-Budget hinzu und wird für die QVP-Person in der Kapazitätsübersicht berücksichtigt. Es besitzt eigene Gate-Prozentwerte und wird innerhalb jeder Phase gleichmäßig verteilt. Ältere Projekte ohne eigene QVP-Prozente behalten zunächst ihre bisherige gemeinsame Verteilung. Der bearbeitbare Stundenverlauf und die Planwertänderungen beziehen sich derzeit ausschließlich auf PL; eine eigenständige QVP-Feinplanung gibt es noch nicht. Ein QVP-Budget ohne QVP-Person wird als nicht zugeordnet ausgewiesen.

Im Portfolio stehen die Zuordnungen in getrennten Spalten „PL“ und „QVP“. Bei zwei Projektleitern erscheinen beide Namen mit ihrem jeweiligen Anteil. Die Budgetsumme enthält PL und QVP. Bestehende Projekte behalten ihre bisherige Person als ersten Projektleiter; QVP-Budget und zweite Zuordnung sind anfangs leer beziehungsweise null.

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
In der Übersicht Woche oder Monat auswählen und mit den Pfeilen den Zeitraum wechseln. Geplante Stunden werden projektübergreifend addiert. Mehr als 100 % bedeutet Überlastung. Erwartete Projekte zählen vollständig mit. Stunden ohne zugewiesene Person werden gesondert gemeldet und belasten keine Person.

Die zusätzliche Grafik „Kapazität und Engpässe“ zeigt Team- und höchste Einzelauslastung über mehrere Zeiträume. Unter „Vorschau“ 12, 26 oder 52 Wochen beziehungsweise 12, 24 oder 36 Monate auswählen. Die gestrichelte Linie markiert 100 % Kapazität. Prozentwerte oberhalb und Ausrufezeichen in der Personenmatrix kennzeichnen Überlastung. Der erste Engpass und die Zahl betroffener Personen stehen über der Grafik.

Die höchste Einzelauslastung kann bereits 160 % erreichen, obwohl das Team nur bei 80 % liegt. Die Matrix zeigt deshalb jede Person getrennt. Ein Klick auf einen Diagrammpunkt oder eine Matrixzelle stellt die Personenübersicht auf den zugehörigen Zeitraum ein. Nicht zugeordnete Stunden erscheinen als separate Warnung.

In der Zeile „Team gesamt“ sind Werte ab 85 % orange und ab 100 % rot hinterlegt. Grundlage für die Farbe ist der ungerundete Wert; die Anzeige kann daher durch Rundung bereits 85 % beziehungsweise 100 % zeigen, obwohl die nächste Farbstufe noch nicht erreicht ist. Die Markierung bei genau 100 % bedeutet volle Teamkapazität; als persönliche Überlastung gilt weiterhin erst ein Wert über 100 %.

Die Kurven zeigen gewonnene Projekte und die Summe aus gewonnenen und erwarteten Projekten als Anteil der gesamten Teamkapazität. Beispiel: Bei 80 h Teamkapazität ergeben 24 h gewonnen 30 % und zusammen mit 16 h erwartet 50 %. Der Abstand zwischen den Kurven entspricht damit 20 Prozentpunkten aus erwarteten Projekten. Bei Stunden aus Projekten mit anderem Status erscheint zusätzlich die Kurve „Team gesamt“. In jeder Personenzelle stehen unter dem Gesamtprozentwert die Stunden als „G“ für gewonnen und „E“ für erwartet. Beim Darüberfahren werden die Werte ausgeschrieben. Beide Projektarten zählen vollständig zur Gesamtauslastung und zur Engpassprüfung; die Kurven sind keine Gewinnwahrscheinlichkeit.

Die Vorschau startet im ausgewählten Zeitraum. Aktuelle FTE gelten für alle zukünftigen Perioden. Abwesenheiten und Feiertage sind nicht abgezogen. Monatswerte können einzelne Wochenengpässe glätten; bei Bedarf auf Woche umschalten.

Die Auswahl „Vorschau mindestens“ bestimmt, wie viele Wochen beziehungsweise Monate mindestens dargestellt werden. Die Zeitachse reicht bei länger laufenden Projekten bis zum letzten Projektende. Über den horizontalen Scrollbalken unter der Matrix werden die späteren Zeiträume sichtbar; Diagramm und Tabelle bewegen sich gemeinsam. Die Engpassmeldung bezieht sich auf den gesamten dargestellten Zeitraum. Bei mehr als 600 Zeiträumen erscheint ein Hinweis mit einer Datumsauswahl für einen späteren Beginn; der abgeschnittene Teil ist nicht in der Engpassmeldung enthalten.

## Sichern
In Einstellungen eine JSON-Sicherung exportieren. Wiederherstellen ersetzt die aktuelle Planung nach Bestätigung. Auch ältere Sicherungen mit frei eingegebenen Rollen werden übernommen. Ein veraltetes Browserfenster erhält beim Speichern einen Konfliktfehler. Dann zuerst die Eingaben als Sicherung exportieren und die Seite danach neu laden.

## SAP
Unter Einstellungen ? SAP-Stunden kann eine XLSX-Datei aus SAP eingelesen werden. Die Vorschau zeigt die Anzahl der Buchungen, den Zeitraum, nicht eindeutig zugeordnete Buchungen und die Zahl der zu ersetzenden Zeilen. Der Export muss f?r jede enthaltene Personalnummer und jedes enthaltene Datum s?mtliche Buchungen umfassen. Bei übernahme ersetzt er die bereits gespeicherten Buchungen dieser Person an diesem Datum. Andere Tage bleiben erhalten; identische Zeilen im Export werden nicht entfernt. Ein Tag, f?r den überhaupt keine Zeile mehr vorhanden ist, wird nicht gel?scht.

Bei neuen PSP-Elementen wie `10-02763-000-99` lautet die Projektnummer `10-02763`. Bei alten PSP-Elementen wie `41-22-030-00-00-99` lautet sie `41-22-030`. Die letzten beiden Ziffern bezeichnen die Abteilung; `99` steht für Projektmanagement. Nicht zugeordnete Buchungen bleiben gespeichert und zählen nicht zur Projektsumme. Die Projektansicht zeigt Ist, Plan bis zum letzten importierten Projektbuchungsdatum und eine Hochrechnung aus Ist plus anschließendem Plan. Liegt diese über dem Gesamtbudget, erscheint ein Hinweis auf eine mögliche Planwertänderung. Alle importierten Abteilungen werden zusammen mit dem Gesamtbudget PL und QVP verglichen; eine getrennte Abteilungsauswertung ist noch nicht vorhanden. Die Hochrechnung benötigt vollständige und aktuelle Exporte aller Beteiligten und ausschließlich budgetrelevante Abteilungen. Sie berücksichtigt keinen tatsächlichen Projektfortschritt. Die Kapazitätsvorschau zeigt weiterhin Planstunden; Iststunden werden dort nicht abgezogen.


## Projektplan (nur Administratoren)

Der Reiter **Projektplan** zeigt den Terminplan eines Projekts als Tabelle mit Gantt-Diagramm. Er ist vorerst nur für Administratoren sichtbar und unabhängig von der Stundenplanung.

- **Vorgänge anlegen:** „Vorgang“ oder „Meilenstein“ fügt eine Zeile nach dem markierten Vorgang ein. „Phasen aus den Gates übernehmen“ legt bei einem leeren Plan je Gate-Phase einen Vorgang an.
- **Gliederung:** Mit „Einrücken“ und „Ausrücken“ entstehen Unterpunkte. Ein Vorgang mit Unterpunkten ist ein Sammelvorgang: Anfang, Ende, Dauer und Fortschritt ergeben sich aus den Unterpunkten. Mit dem Pfeil vor dem Namen lassen sich Unterpunkte auf- und zuklappen. „Nach oben“ und „Nach unten“ verschieben den Vorgang samt Unterpunkten.
- **Termine:** Die Dauer wird in Arbeitstagen (Montag bis Freitag) angegeben, 0 ergibt einen Meilenstein. Das Ende rechnet sich aus Anfang und Dauer; wer das Ende ändert, ändert die Dauer.
- **Vorgänger:** In der Spalte „Vorgänger“ steht die Nummer des Vorgangs, optional die Art und ein Zeitabstand in Arbeitstagen, z. B. `3`, `4AA`, `5EA+2`, `6EE-1`. EA = Ende–Anfang, AA = Anfang–Anfang, EE = Ende–Ende, AE = Anfang–Ende. Verknüpfte Vorgänge folgen ihren Vorgängern automatisch. Gibt man bei einem verknüpften Vorgang einen späteren Anfang ein, gilt dieser als „nicht früher als“.
- **Mit der Maus:** Balken verschieben, am rechten Rand verlängern. Von einem Punkt am Balkenende (erscheint beim Darüberfahren) zu einem anderen Balken ziehen: Der linke Teil des Zielbalkens verknüpft mit dessen Anfang, der rechte mit dessen Ende. Ein Klick auf eine Verknüpfungslinie entfernt sie. Mit den Pfeiltasten verschiebt man den markierten Balken um einen Arbeitstag, mit Umschalt+Pfeil ändert man die Dauer.
- **Prüfungen:** Zirkelbezüge, Verknüpfungen mit dem eigenen Sammelvorgang und Meilensteine mit Unterpunkten werden mit einem Hinweis abgelehnt. Ein Plan darf bis zu 500 Vorgänge enthalten.
- **Zeitraster und Markierungen:** Tag, Woche oder Monat. Die Rauten G3 bis G8 stammen aus den Gate-Terminen des Projekts, die rote Linie ist heute.
- Änderungen werden sofort gespeichert. Wurde der Plan in einem anderen Fenster geändert, erscheint ein Hinweis und die Seite muss neu geladen werden.

## Gate-Status und nächstes Gate
Das Portfolio zeigt bei jedem Projekt den „Gate-Status (Plan)“ und das nächste Gate mit Datum. Dieselben Angaben stehen in der Projektliste und im Projektdetail. Grundlage sind die hinterlegten Gate-Termine und das lokale Tagesdatum des Browsers. Der gewählte Zeitraum der Kapazitätsvorschau beeinflusst diesen Status nicht.

Am Tag eines Gate-Termins wird dieses Gate als aktueller Planstand angezeigt; das darauffolgende Gate ist das nächste. Vor Gate 3 erscheint „Vor Gate 3“. Ab dem Termin von Gate 8 erscheint „Ab Gate 8“ und „Kein weiteres Gate“. Die Anzeige aktualisiert sich beim lokalen Tageswechsel. Der Planstand bestätigt keine tatsächliche Gate-Freigabe.

### SAP-Istabgleich
Nach dem Import vergleicht die App das Ist (PL) mit dem Plan bis zum letzten Buchungstag. Hat ein Projekt weniger Stunden gebraucht, werden die frei gewordenen Stunden im Verhältnis der geplanten Stunden auf die Restlaufzeit verteilt. Hat es mehr gebraucht, bietet die App an, eine Planwertänderung vorzumerken oder die Restlaufzeit um die Mehrstunden zu kürzen. Das Vormerken ändert den Plan nicht, sondern zeigt am Projekt den Hinweis „Planwertänderung in Planung“, bis die genehmigte Änderung mit „Planwertänderung erfassen“ eingetragen wird oder der Hinweis entfernt wird. Die Verschiebung erscheint als Zeile „SAP-Istabgleich“ im Stundenverlauf. Später lässt sich der Abgleich im Kasten „Plan und Ist“ des Projekts erneut durchführen. Bei Änderung von Gate-Terminen oder Basisbudget wird die Verschiebung verworfen. Dafür müssen die QVP-Abteilungscodes in den Einstellungen hinterlegt sein, sobald ein Projekt QVP-Stunden hat.

### Gates am selben Tag
Liegen zwei aufeinanderfolgende Gates am selben Datum, erscheint im Projektformular ein Hinweis, der bestätigt werden muss. Die Phase dazwischen hat dann keine Tage und kein Stundenbudget; ihr Prozentanteil wird im Verhältnis auf die übrigen Phasen verteilt. Gate 3 muss weiterhin vor Gate 8 liegen, und ein späteres Gate darf nicht vor einem früheren liegen.
