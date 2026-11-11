# Projekthandbuch – Kapazitätsplanung

## Zweck und Umfang
Die lokale Anwendung unterstützt die projektübergreifende Kapazitätsplanung. Projekte besitzen eine Nummer, einen Namen, den Status gewonnen oder erwartet, bis zu zwei Projektleiter mit anteiligem PL-Budget, eine QVP-Person mit separatem Budget und fünf Gate-Termine. Rollen werden in Einstellungen verwaltet und bei Personen per Dropdown ausgewählt.

## Start
Python 3.11 oder neuer ist erforderlich. Die Abhängigkeiten stehen in `requirements.txt` und werden mit `python -m pip install -r requirements.txt` installiert. In dieser Arbeitsumgebung liegen sie bereits in `.local_packages`, das vom Startprogramm berücksichtigt wird. Im Projektordner `python server.py` ausführen. Der Browser öffnet sich automatisch; das Terminal muss geöffnet bleiben. Beenden mit Strg+C. Standardmäßig wählt das Betriebssystem einen freien lokalen Port. Optional kann mit `KAPA_PORT` ein fester Port eingestellt werden (PowerShell: `$env:KAPA_PORT=5123; python server.py`). Der Server bindet ausschließlich an 127.0.0.1. Bei fest eingestelltem belegtem Port schlägt der Start sichtbar fehl. Mehrere verschiedene Apps können so parallel laufen. Die Anwendung ist für die lokale Vorführung ausgelegt. Schreibzugriffe verwenden einen Revisionsvergleich. Bei einem veralteten Browserstand wird das Speichern mit einem sichtbaren Fehler abgelehnt. Nach einem Serverneustart müssen bereits geöffnete Browserfenster neu geladen werden.

## Bedienung
1. Unter Personen die Teammitglieder, ihre Rolle und den Beschäftigungsgrad anlegen. Die Rolle wird aus dem Dropdown gewählt; Projektleiter und QVP sind vorbelegt. Unter Einstellungen → Rollen lassen sich weitere Rollen hinzufügen und vorhandene umbenennen. In Einstellungen beträgt die Wochenkapazität bei 100 % FTE zunächst 40 Stunden.
2. Ein Projekt anlegen, Person und Budget wählen und die Termine G3, G5, G6, G7 und G8 in aufsteigender Reihenfolge erfassen. Die vier Prozentwerte müssen zusammen 100 ergeben. Der in Einstellungen gespeicherte Favorit lässt sich im Projektformular anwenden.
3. Über „Verlauf bearbeiten“ die Feinplanung öffnen. Wochen oder Monate auswählen und absolute ganze Stunden eingeben. Die Zeitachse läuft horizontal. Ein Diagramm zeigt Basisstunden, Planwertänderungen und den Gesamtverlauf. Jede Gate-Phase hat ihre eigene Zeile. Mit „Ausgleichen“ werden offene oder überschüssige Stunden auf noch unbearbeitete Zeiträume verteilt; manuell bearbeitete Zeiträume bleiben erhalten. Alle Zeilen müssen ihr Budget erreichen, bevor gespeichert wird.
4. Planwertänderung mit positiven ganzen Stunden und Datum zwischen G3 inklusive und G8 exklusiv hinzufügen. Sie wird ab diesem Datum bis zum Projektende entsprechend den verbleibenden Basisstunden verteilt. Jede Änderung bleibt als eigene Zeile sichtbar und kann separat geplant oder entfernt werden.
5. In der Übersicht zwischen Woche und Monat umschalten und den Zeitraum mit Pfeilen ändern. Die Auslastung ist die Summe aller zugewiesenen Projektstunden geteilt durch die individuelle Kapazität. Erwartete Projekte zählen vollständig mit. Ohne Zuordnung erscheint ein Projekt nicht in der Personenauslastung.
6. Unter Einstellungen regelmäßig eine JSON-Sicherung exportieren. Wiederherstellen ersetzt den gesamten aktuellen Stand nach Bestätigung.

## Rechenregeln
Gate-Intervalle beginnen am jeweiligen Gate und enden vor dem folgenden Gate. Zuerst werden die Basisstunden per größtem Rest auf die vier Prozentanteile verteilt. Ohne gespeicherte Feinplanung erfolgt die Anfangsverteilung nach Kalendertagen. Frühere Wochengewichte werden bei bestehenden Projekten weiterhin zum unveränderten Anzeigen ihres alten Stundenstands berücksichtigt; im neuen Editor werden keine Gewichte mehr eingegeben.

Die neue Feinplanung speichert ganze Tagesstunden je Gate-Phase und Planwertänderung. Wochen und Monate sind Aggregationen derselben Daten. Wird ein Zeitraum bearbeitet, wird die eingegebene absolute Stundenzahl nur auf dessen tatsächlich in der Phase liegende Tage verteilt. Vorhandene Tagesanteile bestimmen die Verteilung; bei null bisherigen Stunden werden die Tage gleich gewichtet. Größte Reste gleichen die Rundung aus. Andere Zeiträume bleiben unverändert. Ein bloßer Wechsel von Woche auf Monat und zurück verändert keine gespeicherten Tageswerte.

„Ausgleichen“ schützt die in dieser Bearbeitung manuell erfassten Tage. Die Differenz zum Zeilenbudget wird anhand der bisherigen Anteile auf die übrigen Tage verteilt oder davon abgezogen. Reichen diese Stunden bei einer Überschreitung nicht aus, bleibt der Entwurf unverändert und fordert zur Korrektur einer manuellen Eingabe auf. Das Speichern erfordert ganzzahlige, nicht negative Werte und eine exakte Budgetsumme jeder einzelnen Phase oder Änderung. Der Server prüft dieselben Budgetgrenzen und Intervalle unabhängig.

Neue Planwertänderungen orientieren sich an den noch verbleibenden Basisstunden. Gibt es dort keine Stunden, werden die zusätzlichen Stunden nach verbleibenden Kalendertagen verteilt. Bereits gespeicherte Basisstunden und frühere Änderungsstunden werden dadurch nicht verändert. Bei später geänderten Gate-Terminen oder Budgets werden nur die betroffenen Zeilen auf das neue Intervall beziehungsweise Budget umgerechnet. Bestehende passende Anteile bleiben Grundlage der Umverteilung.

Die Wochenkapazität ist FTE × Wochenstunden. Für Monate wird sie anhand der Werktage Montag bis Freitag anteilig berechnet. Die ganzzahligen Wochenanteile jeder Gate-Phase und Planwertänderung werden auf ihre tatsächlich belegten Kalendertage verteilt. Der größte Rest gleicht die Rundung aus. Monatswerte summieren diese Tageswerte. Vor G3, ab G8 und vor dem Datum einer Planwertänderung entstehen keine zusätzlichen Stunden. Wochen- und Monatssummen stimmen mit dem Gesamtbudget überein. Feiertage, Urlaub und andere Abwesenheiten werden nicht abgezogen. Projektstunden werden nicht automatisch auf Personen aufgeteilt. Prozentwerte sind keine Eintrittswahrscheinlichkeiten.

## Daten und Sicherheit
`planung.json` wird im Projektverzeichnis atomar gespeichert und durch `.gitignore` von Git ausgeschlossen. Das JSON-Backup enthält sämtliche personenbezogenen Planungsdaten und muss entsprechend geschützt werden. Kein Login, keine Rechteverwaltung, keine Verschlüsselung und keine gemeinsame Bearbeitung. Browserfenster laden jeweils einen eigenen Stand. Ein Revisionsvergleich im selben Serverprozess verhindert das stille Überschreiben eines neueren Stands. Nach einem Konflikt bleiben die lokalen Eingaben erhalten und können als Sicherung exportiert werden. Zum Weiterarbeiten ist ein Neuladen nötig. Mehrere Serverprozesse dürfen nicht dieselbe Datendatei bearbeiten. Nicht über das Netzwerk freigeben oder als produktiven Mehrbenutzerdienst einsetzen.

## SAP und spätere Entwicklung
Die bereitgestellte Datei `SAP INPUT.xlsx` wurde lediglich hinsichtlich Aufbau und Beispielen geprüft; keine Buchungen wurden importiert. Die Ausleitung enthält Person, Personalnummer, PSP-Element, Datum und Stunden. Ein späterer Import benötigt Zuordnungsregeln für Personalnummer und Projektnummer, Umgang mit PSP-Abteilungssuffixen, Duplikaten, negativen Buchungen und Korrekturen. Bis dahin gibt es keine Ist-Stunden, Reststunden oder automatische Verschiebung. MongoDB ist noch nicht angebunden; die Berechnungslogik und Datenhaltung müssen vor einer Mehrbenutzerlösung serverseitig und transaktionssicher umgesetzt werden.

## Prüfung und bekannte Grenzen
Tests: `python -m pytest -p no:cacheprovider -o addopts="" tests`. Wenn die Abhängigkeiten nur im Projekt liegen, zuvor in PowerShell `$env:PYTHONPATH=".local_packages;src"` setzen. Die JavaScript-Rechentests liegen unter `tests/plan.test.js`. Sichtprüfung im Browser ist gesondert durchzuführen. Eine Person pro Projekt, keine Ferien-/Feiertagskalender, keine Historisierung von Änderungen am Basisplan, keine SAP-Verarbeitung und keine gemeinsame Mehrbenutzerbearbeitung. Port und Datenpfad sind unabhängig, sodass der freie Port beim Neustart die gespeicherten Daten nicht verändert.

## Lessons Learned
- Gate-Termine benötigen eindeutige inklusive/exklusive Grenzen, damit an Übergängen keine Tage doppelt gezählt werden.
- Ganze Stunden müssen mit Restausgleich verteilt werden; unabhängiges Runden würde Budgets verändern.
- Ein zufälliger Port darf nicht als Speicheridentität verwendet werden: Browser-LocalStorage wäre beim Neustart unter einem anderen Port leer.
- Absolute Stunden sind für die fachliche Feinplanung verständlicher als relative Gewichte. Eine kanonische Tagesverteilung ermöglicht konsistente Wochen- und Monatsansichten ohne Rundungsverluste beim bloßen Umschalten.
- SAP-Buchungen und erwartete Projekte dürfen nicht stillschweigend als bestätigte Ist- oder Wahrscheinlichkeitswerte interpretiert werden.


## Referenz-Repositories und Oberfläche (10.11.2026)
- GMA App Standards 4.9.1: `d7adb792b663419eed2955d446a0203a231b9057`.
- POLYTEC Designsystem 2.21.0: `7ee9123e3a03e54f4399ac30cf76c4c8a9dc7435`.
- Beide Referenz-Repositories wurden per `git pull --ff-only` abgeglichen. Die vier Ordner des UI-Kits werden unverändert über das offizielle Sync-Werkzeug verteilt. Vendorte Dateien dürfen in der App nicht verändert werden.
- Die App erweitert `ops_platform_ui/base.html`. Logo, Quicksand, Sprite, Header, Footer und Navigation stammen aus dem UI-Kit. Der Header ist 56 px hoch, auf kleinen Bildschirmen 52 px. Die Standardsymbole sind 20 px groß; Navigations-Klickflächen mindestens 44 px.
- Die linke Navigation lässt sich mit dem Pfeil ein- und ausklappen. Auf dem Smartphone erscheinen die Hauptziele in der unteren Navigation.
- Jinja liest Vorlagen mit `utf-8-sig`. Dadurch wird ein UTF-8-BOM beim Laden entfernt. Der alte laufende Server hatte zwei unsichtbare Zeichen vor dem Dokumenttyp im Vorlagencache. Diese verschoben das Seitenraster und vergrößerten den Header. Lokale Vorlagen werden jetzt neu geladen und HTML erhält `Cache-Control: no-store`.

## Abweichungen des lokalen Prototyps
Die Plattformstruktur ist noch keine Freigabe für einen produktiven Betrieb. `server.py` startet Waitress auf Loopback mit freier Portwahl. Die Dienstskripte und das Manifest stammen aus der offiziellen Vorlage. Ihre Organisationseinträge, Port 5123 und Datenbankdeklaration sind für eine spätere Integration zu bestätigen. Kein Dienst und kein Portal wurden eingerichtet.

MongoDB und Portal-Anmeldung sind nicht angebunden. Die lokale Speicherung und deutsche Oberfläche folgen dem ausdrücklichen Auftrag. DB-01/DB-04 und LNG-01/LNG-02 bleiben deshalb für einen späteren Plattformbetrieb gesondert zu behandeln. Fachberechnung und Formularausgabe liegen überwiegend im Browser. Eine produktive Version benötigt serverseitige Fachvalidierung und eine vollständige manuelle Regelprüfung.

## Ergänzte Lessons Learned
- Ein synchronisiertes UI-Kit beweist noch keine korrekte Darstellung. Auch die tatsächlich ausgelieferte Antwort des laufenden Servers muss geprüft werden.
- Unsichtbare Zeichen vor dem Dokumenttyp können den Browser in den Quirks-Modus versetzen und als zusätzliche Rasterelemente wirken. Ein CSS-Höhenpatch würde die Ursache verdecken.
- Icon-Namen sind Teil des Komponentenvertrags. `folder`, `users` und `plus` fehlen in diesem Sprite. Verwendet werden jetzt `work-order`, `user` und `add`.
- Ein geändertes Template reicht bei deaktiviertem Auto-Reload nicht aus: Ein alter Prozess kann weiter den fehlerhaften Stand ausliefern.
- Deutsche Texte müssen durchgängig als UTF-8 geschrieben werden. Bei Windows PowerShell muss auch für an Python übergebene Skripte die UTF-8-Ausgabe eingestellt sein.
- Rollenbezeichnungen dürfen keine technischen Schlüssel sein. Personen speichern eine unveränderliche Rollen-ID; der Anzeigename lässt sich ändern, ohne die Zuordnung zu verlieren.
- Für kleine Formulare ist die Formularvariante des UI-Kits zu verwenden. Ein breiter Projekteditor eignet sich nicht als Standardgröße für jeden Dialog. Aktionszeilen und Dialogtitel stammen aus den Komponenten; lokale Abstandsregeln dürfen sie nicht überschreiben.
- Bei einer Wochen- oder Monatszelle über einer Gate-Grenze darf die Eingabe nicht beliebig zwischen Phasen verschoben werden. Eigene Zeilen je Budgetquelle machen die Grenzfälle und die Herkunft der Stunden sichtbar.
- Ein Live-Diagramm darf während der Eingabe nicht die gesamte Tabelle ersetzen: Sonst gehen Fokus, Cursor und Entwurf verloren. Der neue Editor aktualisiert Diagramm und Summen getrennt von den Eingabefeldern.

## Horizontaler Stundeneditor und Datenhaltung
Der Stundeneditor verwendet die Standardtabelle und segmentierten Auswahlfelder des UI-Kits sowie eine fachliche SVG-Darstellung nach dem Diagrammrezept des Referenz-Repositories. Die horizontale Scrollfläche enthält das Diagramm und die Eingabetabelle gemeinsam, sodass die Zeiträume ausgerichtet bleiben. Die linke Budgetspalte bleibt beim horizontalen Scrollen sichtbar. Die Farben stammen aus den Chart-Tokens; Labels und getrennte Zeilen unterscheiden Basis und Planwertänderungen zusätzlich zur Farbe.

`project.hourPlan` ist ein optionales, zusätzliches Feld im bestehenden Datenformat 2. Es enthält die bevorzugte Granularität und je Budgetquelle Start, exklusives Ende, Budget und ganze Tagesstunden. Vorhandene Projekte benötigen keine Dateimigration. Erst das ausdrückliche Speichern eines Stundenentwurfs schreibt das neue Feld und ersetzt die bisherigen relativen Gewichte. Abbrechen ändert die Projektdatei nicht. JSON-Sicherungen enthalten den vollständigen Stundenplan.

## Rollenverwaltung und Datenformat 2
Unter Einstellungen → Rollen zeigt die Anwendung den Rollennamen und die Anzahl zugewiesener Personen. „Rolle hinzufügen“ legt einen neuen Eintrag an. „Bearbeiten“ ändert die Bezeichnung; die Änderung erscheint anschließend in der Personenliste, der Auslastungsübersicht und der Personenauswahl im Projekt. Leere Namen und doppelte Bezeichnungen werden abgelehnt. Eine Löschfunktion ist derzeit nicht vorgesehen.

Die Startrollen sind `project-manager` mit dem Namen „Projektleiter“ und `qvp` mit dem Namen „QVP“. Eigene Rollen erhalten neue IDs. Diese Rollen sind fachliche Planungsrollen und keine Portal-Berechtigungen.

Vorhandene Daten werden vor dem Start der neuen Version ausdrücklich migriert:

```powershell
python tools/migrate_roles.py planung.json --dry-run
python tools/migrate_roles.py planung.json
```

Dabei muss der Server beendet sein. Die Migration erzeugt `planung.vor-rollen-v2.json` als unveränderte Sicherung. Eine bestehende Sicherung wird nie überschrieben. „Projektleitung“ und „Projektleiter“ werden der Startrolle Projektleiter zugeordnet. QVP und bisherige eigene Rollen bleiben erhalten. Projektwerte, Personen-IDs und FTE ändern sich nicht. Ein wiederholter Aufruf auf Datenformat 2 validiert den Stand und verändert ihn nicht.

Neue Sicherungen verwenden Datenformat 2 mit `roles` und `people[].roleId`. Alte Sicherungen können weiterhin über Einstellungen wiederhergestellt werden. Die Vorbereitung konvertiert sie in Datenformat 2; erst nach der Bestätigung ersetzt der normale, revisionsgeprüfte Schreibvorgang die aktuelle Planung.


## Gate-Meilensteine im Stundenverlauf
G3, G5, G6, G7 und G8 werden in der Projektansicht und im Editor mit Datum, Verbindungslinie und Meilenstein markiert. Ihre Position ergibt sich aus dem Kalendertagsanteil innerhalb einer Wochen- oder Monatsspalte. UTC-Kalendertagsnummern vermeiden Verschiebungen durch Sommerzeitwechsel. Gate 8 bleibt auch sichtbar, wenn sein Termin exakt dem Ende der letzten Spalte entspricht. Nahe Labels werden auf mehrere Zeilen verteilt. Die Markierungen verändern keine Stunden.

## Grafische Kapazitätsvorschau
Die Übersicht zeigt ab dem ausgewählten Zeitraum eine rollende Vorschau. Wählbar sind 12, 26 oder 52 Wochen und 12, 24 oder 36 Monate. Zeitraum-Pfeile ändern den Start. Eine Auswahl im Diagramm oder in der Matrix stellt die darunterliegende Personenübersicht auf diesen Zeitraum ein. Der Vorschauhorizont ist eine Ansichtseinstellung und wird nicht in der Planungsdatei gespeichert.

Die Nachfrage je Person stammt aus der Summe ihrer zugewiesenen Projekte, einschließlich Planwertänderungen. Verwendet werden dieselben Tagesstunden wie im Stundeneditor. Die Kapazität ist `FTE-Prozent / 100 × Wochenstunden je FTE × Werktage / 5`. Montag bis Freitag zählen als Werktage. Feiertage, Urlaub und zeitlich veränderliche FTE sind noch nicht enthalten; aktuelle FTE gelten für das gesamte Fenster. Erwartete Projekte zählen vollständig mit.

Die Teamkurve ist die Summe der zugewiesenen Stunden geteilt durch die Summe der individuellen Kapazitäten. Die zweite Kurve zeigt die jeweils höchste Einzelauslastung. Beispiel: Zwei Personen haben je 40 h Kapazität. 64 h auf einer Person ergeben 80 % Teamauslastung, aber 160 % auf dieser Person. Der Teamdurchschnitt darf diesen Engpass nicht verdecken.

Die Matrix zeigt Prozentwerte je Person und Zeitraum. Überlastung ist durch Warnfarbe, Ausrufezeichen und Prozentwert erkennbar. Die Zusammenfassung nennt den frühesten Engpass und die Anzahl unterschiedlicher betroffener Personen im Vorschaufenster. Bei mehreren Engpässen im ersten Zeitraum wird die höchst ausgelastete Person genannt. Tooltips enthalten Planstunden und Kapazität. Projektstunden ohne gültige Personenzuweisung werden separat gemeldet und sind nicht im Teamquotienten enthalten.

Überlastung wird vor dem Runden geprüft. Gleitkommaabweichungen unter einer Milliardstelstunde werden toleriert. Die Anzeige verwendet höchstens eine Nachkommastelle. Positive Nachfrage bei null Kapazität wird als `∞ %` und als Engpass angezeigt. Ohne Personen wird keine irreführend unauffällige Auslastungsgrafik erzeugt.

## Weitere Lessons Learned
- Der Teamdurchschnitt allein reicht für Engpassplanung nicht aus. Höchste Einzelauslastung und Personenmatrix müssen ihn ergänzen.
- Monatswerte können Wochenengpässe verdecken. Beide Raster müssen verfügbar bleiben.
- Meilensteine werden auf ihren tatsächlichen Kalendertag gesetzt, nicht auf eine Periodengrenze verschoben.
- Prozentwerte dürfen erst für die Anzeige gerundet werden; geringe tatsächliche Überschreitungen müssen erkennbar bleiben.
- Während der Prüfung trat eine kurzzeitige Windows-Dateisperre auf. Der lokale Schreibvorgang wiederholt Zugriffsfehler begrenzt und räumt temporäre Dateien auf. Dauerhafte Fehler bleiben sichtbar.

## Diagramm-Scrollen und SharePoint-Projektlinks
Die horizontalen Zeitachsen in Kapazitätsvorschau, Stundenverlauf und Stundeneditor begrenzen das Überscroll-Verhalten ausschließlich auf der X-Achse. Auf der Y-Achse darf das Mausrad an den umgebenden Arbeitsbereich beziehungsweise den Dialog weitergegeben werden. Die horizontale Scrollleiste und horizontale Trackpad-Gesten bleiben verfügbar.

Im Portfolio, in der Projektliste und im Projektdetail erzeugt „SharePoint öffnen“ die Adresse `https://polytec.sharepoint.com/sites/m365-pep-` gefolgt von der Projektnummer. Die Nummer wird als einzelner URL-Pfadbestandteil kodiert. Der Link öffnet einen neuen Tab; sein Klick löst nicht zugleich die Navigation der Projektkarte aus. Es findet keine automatische Anmeldung, Prüfung oder Übertragung der Projektseite durch die Anwendung statt.

## Ergänzte Lessons Learned
- `overscroll-behavior: contain` wirkt auf beide Achsen. Bei einer horizontalen Zeitachse kann dies das vertikale Mausrad blockieren, obwohl der umgebende Arbeitsbereich noch scrollen könnte. Die Achsen müssen getrennt konfiguriert werden.
- Ein externer Link in einer anklickbaren Projektkarte muss sein Klickereignis abgrenzen, ohne die normale Linkaktion zu unterdrücken. Projektnummern müssen zudem als URL-Bestandteil und HTML-Text sicher behandelt werden.


## Gate-Status und nächster Meilenstein
Das Portfolio der Übersicht, die Projektliste und das Projektdetail zeigen den „Gate-Status (Plan)“ sowie das nächste Gate mit Datum. Grundlage sind ausschließlich die fünf hinterlegten, aufsteigenden Gate-Termine und das lokale Tagesdatum des Browsers. Die Anzeige ist unabhängig vom ausgewählten Vorschauzeitraum und wird beim lokalen Tageswechsel neu berechnet.

Vor G3 lautet der Planstand „Vor Gate 3“ und G3 ist das nächste Gate. Ab einem Gate-Termin einschließlich dieses Kalendertages gilt das entsprechende Gate als angezeigter Planstand; das nächste Gate ist der nächste spätere Termin. Beispiel: Am Tag von G6 wird Gate 6 angezeigt und G7 ist das nächste Gate. Ab G8 lautet die Anzeige „Ab Gate 8“ und „Kein weiteres Gate“. Fehlen gültige aufsteigende Termine, liefert die Statusfunktion einen Prüfhinweis.

Der Planstand ist keine dokumentierte tatsächliche Gate-Freigabe und sagt nicht aus, ob ein geplanter Meilenstein tatsächlich bestanden wurde. Für eine spätere Ist-Statusverwaltung wären gesonderte fachliche Eingaben beziehungsweise eine verlässliche Datenquelle erforderlich. Diese Anzeige verändert weder Gate-Daten noch den Stundenplan.

## Ergänzte Lessons Learned
Geplante Gate-Termine sind keine tatsächlichen Freigaben. Ein automatisch ermittelter Gate-Status muss als Planstand gekennzeichnet werden und den Tag eines Gate-Wechsels eindeutig behandeln.

## Gleich breite Übersichtsbereiche und Portfolio-Tabelle
Auf breiten Bildschirmen teilen sich Personenübersicht und Portfolio den verfügbaren Platz gleichmäßig. Ab einer Fensterbreite von höchstens 64 rem stehen die Bereiche untereinander. Die Projektübersicht enthält die Spalten Projekt, Person, Gate-Status (Plan), nächstes Gate und Budget. Unter dem Projektnamen stehen Projektnummer und SharePoint-Link. Weiterhin werden die ersten fünf Projekte angezeigt; „Alle ansehen“ öffnet die vollständige Liste. Die Tabelle kann bei Platzmangel horizontal gescrollt werden. Gate-Status und nächster Termin verwenden die bestehende Berechnung, das Budget schließt Planwertänderungen ein. Es werden keine Planungsdaten verändert.

## Ergänzte Lessons Learned
- Vergleichbare Bereiche profitieren von einer gleichmäßigen Platzaufteilung und konsistenten Tabellenüberschriften. Bei kleineren Fenstern müssen Spalten trotzdem zugänglich bleiben.
- Eine Änderung der Portfolio-Darstellung darf bestehende Projektlinks und die Kennzeichnung des Gate-Planstands nicht verlieren. Die Einstellungen besitzen ein eigenes Layout und bleiben von der Änderung ausgenommen.

## Gewonnene und erwartete Projekte in der Auswertung
Das Portfolio besitzt eine Statusspalte. Projektliste und Projektdetail verwenden dieselben beschrifteten Statusmarkierungen. „Gewonnen“ und „Erwartet“ sind auch ohne Farbunterscheidung lesbar; andere oder fehlende Statuswerte werden neutral dargestellt. Der Status kann im Projektformular bearbeitet werden.

In der Kapazitätsvorschau werden für jede Person und jeden Zeitraum die Stunden nach Projektstatus zusätzlich zur bestehenden Gesamtsumme ermittelt. Die Kurve „Gewonnen“ zeigt gewonnene Projektstunden geteilt durch die Teamkapazität; „Gewonnen + erwartet“ zeigt die Summe beider Status mit demselben Nenner. Bei 80 h Teamkapazität ergeben 24 h gewonnen 30 % und zusammen mit 16 h erwartet 50 %. Der Abstand beträgt 20 Prozentpunkte. Eine separate Gesamtlinie erscheint, wenn zugewiesene Stunden einen anderen Status besitzen; sie enthält alle zugewiesenen Stunden. Die höchste Einzelauslastung und Engpassprüfung verwenden wie bisher die Gesamtauslastung. Erwartete Projekte werden nicht mit einer Gewinnwahrscheinlichkeit gewichtet. Nicht zugewiesene Stunden erscheinen weiterhin in der Warnung und nicht in Teamkurven oder Personenmatrix. Ein unbekannter Status zählt zur Gesamtlast, wird aber keiner der beiden Statuskurven zugeschlagen.

Die Personenmatrix zeigt je Zelle Gesamtprozent sowie „G“ für gewonnene und „E“ für erwartete Projektstunden. Tooltip und barrierefreie Beschriftung schreiben beide Anteile aus. Die Linien sind über Farbe und unterschiedliches Strichmuster sowie die Legende unterscheidbar. Bei exakt gleichen Werten können sich Linien überlagern; die Matrix und die Punktinformationen bleiben verfügbar.

## Ergänzte Lessons Learned
- Statusanteile in Prozent benötigen einen klar genannten gemeinsamen Nenner. Ein Vergleich der Anteile mit der Teamkapazität darf nicht als individuelle Auslastung oder Gewinnwahrscheinlichkeit ausgegeben werden.
- Ein Statusfilter oder eine geänderte Gewichtung könnte Engpässe verdecken. Statuswerte daher ergänzend anzeigen und die bestehende Gesamtrechnung beibehalten; unbekannte Status nicht stillschweigend umdeuten.

## Ausrichtung und Schwellen für Team gesamt
In der Kapazitätsmatrix sind die Zeiträume im Tabellenkopf und die Werte der Zeile „Team gesamt“ zentriert. Teamwerte unter 85 % bleiben neutral, ab 85 % bis unter 100 % sind sie orange hinterlegt, ab 100 % rot. Die Schwellen werden vor der Rundung geprüft. Die Schwellenbeschreibung steht auch im Tooltip und für Screenreader zur Verfügung. Unendliche Auslastung bei Stunden ohne Kapazität erhält ebenfalls die rote Markierung. Die individuelle Engpassprüfung ist davon unabhängig und meldet weiterhin erst eine tatsächliche Überschreitung der Kapazität.

## Ergänzte Lessons Learned
- Die Farbgrenze muss fachlich getrennt von der bestehenden Engpassdefinition behandelt werden: Genau 100 % ist hier rot, aber noch keine individuelle Überlastung.
- Eine vor der Anzeige gerundete Zahl kann an einer Grenze bereits 85 % oder 100 % anzeigen; die Einstufung darf dadurch nicht unbemerkt verändert werden.

## Vorschaufenster verschieben
Die ausgewählte Vorschaugröße ist die Mindestzahl an Wochen beziehungsweise Monaten. Die gemeinsame Zeitachse für Diagramm und Matrix reicht darüber hinaus bis zum letzten gültigen exklusiven Gate 8 der Projekte. Der normale horizontale Scrollbalken unter der Matrix verschiebt die dargestellten Daten. Die Breite einer Periode passt sich mindestens so an, dass bei mehr Perioden als der gewählten Vorschau ein horizontaler Überlauf entsteht. Der zuvor vorhandene separate Regler und die Blättertasten wurden entfernt.

Der Engpasshinweis bezieht sich auf den gesamten berechneten Zeitraum, auch wenn Teile horizontal außerhalb des sichtbaren Bereichs liegen. Zur Begrenzung der Darstellungsgröße werden höchstens 600 Zeiträume auf einmal berechnet. Sind spätere Projekte vorhanden, weist ein Hinweis darauf hin und ermöglicht die Auswahl eines späteren Startdatums. Beim Verschieben der Scrollleiste werden keine Daten verändert. Das Anklicken eines Zeitraums setzt wie bisher die Personenübersicht darauf.

## Ergänzte Lessons Learned
- Ein horizontaler Scrollbalken kann nur zuvor berechnete Inhalte zeigen. Eine Projektvorschau muss deshalb weit genug bis zum tatsächlichen Projektende reichen und darf nicht bereits nach der gewählten Mindestlänge enden.
- Der Engpasshinweis muss seinen Betrachtungszeitraum klar benennen. Bei einer technischen Begrenzung muss der ausgelassene Zeitraum sichtbar gemacht und erreichbar sein.

## Projektportfolio nach Status und nächstem Gate
Die Projektliste gliedert vorhandene Projekte in die Abschnitte „Gewonnen“, „Erwartet“ und gegebenenfalls „Weiterer Status“. Innerhalb jedes Abschnitts stehen Projekte mit dem frühesten nächsten geplanten Gate zuerst. Ein erreichtes Gate gilt ab seinem Kalendertag als aktueller Planstand; als nächstes Gate wird der folgende Termin verwendet. Projekte nach Gate 8 sowie Projekte mit fehlenden oder ungültigen Gate-Terminen stehen am Ende. Bei gleichen Terminen bleibt die ursprüngliche Reihenfolge erhalten. Die Sortierung verwendet eine Kopie und verändert die gespeicherte Reihenfolge nicht. Projektkarten behalten Status, SharePoint-Link, Gate-Angaben, zugewiesene Person und Budget.

## Ergänzte Lessons Learned
- Die Sortierung muss dieselbe Gate-Definition wie die sichtbare Statusanzeige verwenden, damit die Kartenreihenfolge und das angezeigte nächste Gate übereinstimmen.
- Fehlende oder bereits abgeschlossene Gate-Termine dürfen weder andere Projekte verdrängen noch dazu führen, dass ein Projekt aus dem Portfolio verschwindet.

## Abstände und Symbol für Einstellungen
Zwischen den Projektgruppen wird der im UI-Kit definierte Abstand `--polytec-space-6` verwendet. Derselbe Token sorgt auch in leeren Zuständen für Innenabstand. Das zuvor verwendete `--polytec-space-5` ist im lokalen Designsystem nicht definiert; der Browser konnte deshalb die Abstandsangabe nicht anwenden.

Das mitgelieferte Zahnrad-Symbol `settings` hat im lokalen Designsystem einen fehlerhaften SVG-Pfad. Für „Einstellungen“ verwenden Desktop- und Mobilnavigation deshalb das vorhandene `parameters`-Symbol desselben UI-Kits. Die Navigation bleibt unverändert bedienbar und beschriftet. Das UI-Kit und das externe Designsystem-Repository wurden nicht verändert. Eine spätere Korrektur des Zahnrads gehört in das Designsystem und kann nach dessen regulärem Update übernommen werden.

## Ergänzte Lessons Learned
- CSS-Variablen müssen im tatsächlich eingebundenen Tokenbestand existieren; ansonsten entfällt die gesamte betroffene CSS-Eigenschaft, ohne dass der Browser einen sichtbaren Fehler meldet.
- Icon-Defekte im gemeinsamen Sprite dürfen nicht durch Änderungen an der vendorten Kopie verdeckt werden. Ein geeignetes, vorhandenes Symbol kann eine lokale Übergangslösung sein.

## Navigation aus der Projektplanung
Nach dem Anlegen oder Öffnen eines Projekts zeigt die Anwendung die Projektplanung. Die Browseradresse kann dabei noch den Anker der zuvor geöffneten Hauptseite enthalten. Ein Klick auf diese Hauptseite löst dann keinen `hashchange` aus. Die Navigation berücksichtigt deshalb zusätzlich normale Klicks auf einen Hauptseitenlink, dessen Anker bereits in der Adresse steht, und öffnet das Ziel, falls intern eine andere Ansicht aktiv ist. Dies gilt für Übersicht, Projekte, Personen und Einstellungen sowie für Desktop- und Mobilnavigation. Andere Ankerwechsel und Browseraktionen wie Strg-Klick bleiben dem Browser überlassen.

## Ergänzte Lessons Learned
- Ein interner Ansichtswechsel ohne Änderung der Adresse kann den Browseranker und die sichtbare Seite auseinanderlaufen lassen. Ein erneuter Klick auf denselben Anker erzeugt kein `hashchange`-Ereignis; dieser Fall muss gesondert behandelt werden.

## Lesbarkeit der Kapazitätslegende
Die Legende der Kapazitätsvorschau verwendet eine größere, kräftigere Schrift und längere, dickere Linienmuster. Die Diagrammlinien wurden passend verstärkt. Farben und Muster unterscheiden gewonnene Projekte, gewonnene plus erwartete Projekte, gegebenenfalls das Team gesamt, höchste Einzelauslastung und die Kapazitätsgrenze. Die Legende bricht bei Platzmangel um.

## Ergänzte Lessons Learned
- Farbcodierungen müssen in einer Legende ausreichend lange und kräftige Muster verwenden, damit auch gestrichelte und gepunktete Linien erkennbar sind. Text und unterschiedliche Strichmuster ergänzen die Farbinformation.

## Ergänzte Lessons Learned
- Ein Vergleich von „Gewonnen“ mit „Gewonnen + erwartet“ zeigt die zusätzliche erwartete Belastung unmittelbar als Abstand der Kurven. Eine identische Team-Gesamtkurve würde diese Darstellung überlagern und wird daher nur bei weiteren Status zusätzlich gezeigt.

## Zwei Projektleiter und QVP-Budget
Im Projektformular lassen sich Projektleiter 1, optional Projektleiter 2, der Anteil des ersten in ganzen Prozent und eine QVP-Person auswählen. Projektleiter 2 erhält den Rest zu 100 %. Dieselbe Person darf nicht als beide Projektleiter zugeordnet werden. Ohne zweiten Projektleiter erhält der erste das gesamte PL-Budget. Die Verteilung gilt für den gesamten Projektzeitraum und kann jederzeit geändert werden; auch vergangene Planstunden werden dann neu zugeordnet. Eine datumsabhängige Wechselhistorie ist noch nicht implementiert.

Die PL-Planstunden einschließlich Planwertänderungen werden pro Tag anhand kumulierter Stunden und des Anteils aufgeteilt. Die Differenz zweier gerundeter kumulierter Anteile ergibt die ganzen Stunden des Tages für Projektleiter 1; der zweite erhält den Rest. Dadurch stimmen die Tagessummen exakt mit dem ursprünglichen Verlauf überein, die Projektsumme bleibt erhalten und der Anteil wird über den Gesamtverlauf auf die nächste ganze Stunde gerundet. Die Verteilung ist für Wochen und Monate konsistent; bei kleinen Einzelperioden können die gerundeten Anteile von den eingegebenen Prozenten abweichen.

Das QVP-Budget ist ein eigenes zusätzliches Budget in ganzen Stunden und wird in der Kapazitätsplanung der QVP-Person zugerechnet. Es verwendet dieselben Gate-Prozente wie das PL-Basisbudget; die Phasenbudgets werden separat auf ganze Stunden gerundet und innerhalb jeder Phase gleichmäßig verteilt. Die vom PL bearbeiteten Spitzen und PL-Planwertänderungen gelten nicht für QVP. Eine eigenständige QVP-Feinplanung, eigene QVP-Planwertänderungen und andere Gate-Anteile sind noch nicht implementiert. Ohne QVP-Zuweisung fließen die QVP-Stunden in die Warnung für nicht zugeordnete Stunden, nicht in eine Personenauslastung.

Portfolio und Projektliste zeigen PL und QVP getrennt; das Gesamtbudget enthält PL-Basisbudget, PL-Planwertänderungen und QVP-Budget. Projektkarten zeigen zwei PL-Anteile. Die Detailansicht weist die PL- und QVP-Budgets und ihre Gate-Phasen getrennt aus; der PL-Stundenverlauf bleibt weiterhin editierbar. Die Standardrolle `qvp` steuert die Auswahl für QVP; bestehende Zuweisungen bleiben auch bei späteren Rollenänderungen sichtbar. Eigene Rollen außerhalb von QVP können als Projektleitung gewählt werden.

Bestandsprojekte ohne die neuen optionalen Felder verwenden die bisherige `person` als ersten Projektleiter, 100 % PL-Anteil und null QVP-Stunden. Die Datei wird beim Öffnen nicht migriert oder überschrieben. Erst beim Speichern eines Projekts werden `secondPerson`, `leadPercent`, `qvpPerson` und `qvpBudget` ergänzt. Die API prüft bei regulären Speicherungen und Sicherungsimporten ganzzahlige Werte, vorhandene Personen und unterschiedliche Projektleiter. Das Löschen zugewiesener Personen wird verhindert. Datenformat und bestehende Sicherungen bleiben kompatibel.

## Ergänzte Lessons Learned
- Eine pro Tag unabhängige Rundung würde bei kleinen Tageswerten systematisch eine Person bevorzugen. Kumulierte Rundung erhält die Gesamtstunden und das gewünschte Gesamtverhältnis.
- Ein zusätzliches QVP-Budget darf nicht aus dem PL-Budget abgezogen oder einer nicht zugeordneten Person zugerechnet werden. Teamstatus und Engpässe müssen beide Budgets enthalten.
- Ein rückwirkend geänderter Split ist keine dokumentierte Übergabe zu einem Stichtag. Falls Ist-Stunden oder Übergaben eingeführt werden, benötigen sie eigene zeitliche Zuordnungen.
