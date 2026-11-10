# Projekthandbuch – Kapazitätsplanung

## Zweck und Umfang
Die lokale Anwendung unterstützt die projektübergreifende Kapazitätsplanung. Projekte besitzen eine Nummer, einen Namen, den Status gewonnen oder erwartet, eine verantwortliche Person, ein Basisbudget und fünf Gate-Termine. Rollen werden in Einstellungen verwaltet und bei Personen per Dropdown ausgewählt; zunächst ist je Projekt eine Person zugeordnet. Mehrere Zuordnungen je Projekt benötigen eine spätere Erweiterung.

## Start
Python 3.11 oder neuer ist erforderlich. Die Abhängigkeiten stehen in `requirements.txt` und werden mit `python -m pip install -r requirements.txt` installiert. In dieser Arbeitsumgebung liegen sie bereits in `.local_packages`, das vom Startprogramm berücksichtigt wird. Im Projektordner `python server.py` ausführen. Der Browser öffnet sich automatisch; das Terminal muss geöffnet bleiben. Beenden mit Strg+C. Standardmäßig wählt das Betriebssystem einen freien lokalen Port. Optional kann mit `KAPA_PORT` ein fester Port eingestellt werden (PowerShell: `$env:KAPA_PORT=5123; python server.py`). Der Server bindet ausschließlich an 127.0.0.1. Bei fest eingestelltem belegtem Port schlägt der Start sichtbar fehl. Mehrere verschiedene Apps können so parallel laufen. Die Anwendung ist für die lokale Vorführung ausgelegt. Schreibzugriffe verwenden einen Revisionsvergleich. Bei einem veralteten Browserstand wird das Speichern mit einem sichtbaren Fehler abgelehnt. Nach einem Serverneustart müssen bereits geöffnete Browserfenster neu geladen werden.

## Bedienung
1. Unter Personen die Teammitglieder, ihre Rolle und den Beschäftigungsgrad anlegen. Die Rolle wird aus dem Dropdown gewählt; Projektleiter und QVP sind vorbelegt. Unter Einstellungen → Rollen lassen sich weitere Rollen hinzufügen und vorhandene umbenennen. In Einstellungen beträgt die Wochenkapazität bei 100 % FTE zunächst 40 Stunden.
2. Ein Projekt anlegen, Person und Budget wählen und die Termine G3, G5, G6, G7 und G8 in aufsteigender Reihenfolge erfassen. Die vier Prozentwerte müssen zusammen 100 ergeben. Der in Einstellungen gespeicherte Favorit lässt sich im Projektformular anwenden.
3. Im Projekt zeigt der Wochenverlauf die Basisstunden und Planwertänderungen getrennt. Über „Verlauf anpassen“ Wochengewichte ändern: 2 bedeutet doppelte Gewichtung gegenüber 1, 0 bedeutet keine Stunden. Die einzelnen Phasenbudgets bleiben erhalten.
4. Planwertänderung mit positiven ganzen Stunden und Datum zwischen G3 inklusive und G8 exklusiv hinzufügen. Sie wird ab diesem Datum bis zum Projektende nach verbleibenden Tagen und Wochengewichten verteilt. Jede Änderung bleibt einzeln sichtbar und kann entfernt werden.
5. In der Übersicht zwischen Woche und Monat umschalten und den Zeitraum mit Pfeilen ändern. Die Auslastung ist die Summe aller zugewiesenen Projektstunden geteilt durch die individuelle Kapazität. Erwartete Projekte zählen vollständig mit. Ohne Zuordnung erscheint ein Projekt nicht in der Personenauslastung.
6. Unter Einstellungen regelmäßig eine JSON-Sicherung exportieren. Wiederherstellen ersetzt den gesamten aktuellen Stand nach Bestätigung.

## Rechenregeln
Gate-Intervalle beginnen am jeweiligen Gate und enden vor dem folgenden Gate. Zuerst werden die Basisstunden per größtem Rest auf die vier Prozentanteile verteilt. Anschließend werden die Stunden jeder Phase nach überlappenden Kalendertagen und den Wochengewichten auf Wochen aufgeteilt. Dieselbe Rundungsmethode verteilt jede Planwertänderung auf die ab ihrem Datum verbleibenden Tage und Gewichte. So bleiben Wochenwerte und Summen ganzzahlig und jedes Budget geht exakt auf. Nullgewichte sind zulässig, solange jede belegte Phase und Änderung mindestens ein positives Gewicht hat.

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
- Wochengewichte bieten eine einfache Spitzenplanung; ihre Bedeutung und die unterschiedliche Monatsaggregation müssen transparent sein.
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
