# Serverbetrieb: vorbereiteter interner Test

Stand: 12.11.2026. Der Dienst `PMcapacityplaning` läuft auf dem Zielserver auf Port 8002; Anmeldung, Datenbankverbindung und ein Update mit Dienstneustart wurden überprüft. Ein vollständiger Neustart des Servers und eine weitergehende Betriebsabnahme stehen aus. Der lokale Modus und seine Datei `planung.json` bleiben unabhängig. HTTP wurde ausdrücklich für den ersten Test im Firmen-VPN gewählt; es verschlüsselt Passwörter und Sitzungsdaten auf dem internen Netzweg nicht. HTTPS und seine Vertrauenskonfiguration müssen noch eingerichtet und getestet werden. Die nachfolgenden Einrichtungsschritte dokumentieren den Ablauf für eine Neueinrichtung und sind kein Auftrag, den laufenden Dienst erneut zu registrieren.

## Voraussetzungen

- Bestehende Anwendungen und Dienste auf Ports 8000 und 8001 nicht ändern oder beenden. Port 8002 ist nur ein Vorschlag; vor Ort auf freie Belegung und Firewall-Regeln prüfen. Auch den Dienstnamen `PMcapacityplaning` vorher prüfen. Einen unbekannten bestehenden Dienst nicht überschreiben.
- Zielpfad, Dienstkonto, Verzeichnisberechtigungen und Sicherungsort mit dem Serverbetrieb festlegen. `.env`, Sicherungen und Logs nur dem Dienstkonto und berechtigten Administratoren zugänglich machen. `0.0.0.0` bindet an alle Netzwerkschnittstellen; Zugriff per Firewall auf berechtigte Netze begrenzen.
- Den vorhandenen MongoDB-Zugang für den Test verwenden, ohne Zugangsdaten im Repository, in Befehlszeilen, Bildschirmfotos oder Supportmeldungen zu veröffentlichen. Die App verwendet ausschließlich die vier Collections mit dem konfigurierten `KAPA_COLLECTION_PREFIX`: `planning`, `users`, `sessions`, `audit`. Das Präfix vorab gegen vorhandene Collections abgleichen. Eine leere Planung ist für den erstmaligen Import Pflicht.
- Die App verwendet eigene Konten; Materialwissen-Konten und dessen Authentifizierung bleiben getrennt. Damit wird auf ausdrücklichen Wunsch von IAM-01 sowie durch gemeinsame Datenbank und Zugang von DB-01/DB-02 abgewichen. Zentraler Login und isolierter Datenbankzugang sind separate spätere Aufgaben.
- Der Manifest-Eintrag `database` beschreibt die Plattformvorgabe und ist für diesen Test nicht die tatsächliche Datenbankauswahl. Diese erfolgt über `MONGODB_DATABASE` in der geschützten `.env`.

## Konfiguration und Installation

Die Datei [server.env.example](server.env.example) zeigt die erforderlichen Einstellungen. Eine serverlokale `.env` anlegen, Werte vertraulich eintragen und eine zufällige eigene `APP_SECRET_KEY` mit mindestens 32 Zeichen erzeugen. Niemals den Sitzungsschlüssel einer anderen App übernehmen. `KAPA_TRUSTED_HOSTS` enthält nur tatsächlich genutzte Hostnamen oder IP-Adressen. Umgebungsvariablen des Dienstkontos haben Vorrang vor `.env` und sind auf unbeabsichtigte Überschneidungen zu prüfen.

Vor einer Neueinrichtung Python-Version und Architektur, den Startvertrag, die Offline-Installation, den Dienstwrapper und das Dienstkonto auf dem Zielsystem prüfen. `requirements-server.lock` enthält gepinnte Pakete und Prüfsummen für Windows x64 / CPython 3.14; diese wurden auf dem Zielserver installiert. Die vorhandenen `install.bat` und `update.bat` installieren aus `requirements.txt` und sind kein nachgewiesener Offline-Updateweg. `update.bat force` wurde auf dem Zielserver mit erfolgreichem Neustart und Healthcheck erprobt. `install.bat service` kann einen vorhandenen gleichnamigen Dienst aktualisieren: vor Verwendung Namen und Eigenschaften prüfen.

## Erstes Konto und Datenübernahme

Nach Installation der Abhängigkeiten und Konfiguration auf dem Zielsystem aus dem App-Ordner mit dessen `.venv`:

1. `python tools/manage_server_accounts.py init-indexes` legt den Ablaufindex in der eigenen Session-Collection an.
2. `python tools/manage_server_accounts.py create --username <benutzername> --role admin` fragt das Passwort verdeckt und zweimal ab. Benutzername und Passwort gehören ausschließlich zu dieser App. Administratoren können danach in der linken „Benutzerverwaltung“ Konten für PL, QVP und HO PM anlegen und Rollen ändern; Benutzer ändern ihr eigenes Passwort in den Einstellungen. Die drei Fachrollen haben vorerst alle Planungsrechte, die Kontenverwaltung bleibt Administratoren vorbehalten.

   Das so erstellte Passwort sowie über die Benutzerverwaltung vergebene und zurückgesetzte Passwörter sind Einmalpasswörter. Nach Anmeldung muss ein neues persönliches Passwort mit mindestens acht Zeichen gesetzt werden. Bereits vorhandene Konten sind davon nur nach einer Zurücksetzung betroffen.
3. Die Übernahme zunächst mit `python tools/import_local_planning.py <pfad-zur-planung.json>` prüfen. Der Prüflauf schreibt weder Datenbank noch Datei und zeigt die Anzahl der Projekte und Personen.
4. Erst nach Kontrolle des Bestands und eines geschützten Sicherungsorts mit `python tools/import_local_planning.py <quelle> --apply --backup <neuer-sicherungspfad>` einmalig übernehmen. Die Sicherungsdatei wird exklusiv neu angelegt und anhand ihrer Prüfsumme geprüft. Ein vorhandener Serverbestand oder Sicherungspfad wird nicht überschrieben. Quell- und Sicherungsdatei vor Zugriff schützen.

Der Import prüft Rollen, Zuordnungen und Stundenpläne strukturell; er ersetzt keine fachliche Kontrolle. Vorher eine unabhängige Sicherung der Ausgangsdaten erstellen. Bei gleichzeitigem Speichern wird ein veralteter Bearbeitungsstand abgewiesen; die Änderung muss nach Neuladen erneut vorgenommen werden.

## Abnahme und Betrieb

Nach Einrichtung des Dienstes Start, Stop, Neustart und Portfreigabe prüfen; `/health` muss die Datenbankbereitschaft bestätigen. Anschließend Anmeldung und Rollen mit Testkonten sowie Zugriff von einem zweiten berechtigten Rechner prüfen. Regelmäßige, wiederherstellbar getestete Sicherungen der vier Collections sicherstellen. Der Planungsverlauf protokolliert die letzten 1.000 Schreibereignisse; Konten- und Anmeldeereignisse stehen in der Audit-Collection. Deren Aufbewahrung muss betrieblich festgelegt werden.

Offen sind die vollständige serverseitige Prüfung aller älteren Fachfelder, HTTPS, Freigabe von Benutzerverwaltung und Rechtekonzept, Überwachung, Wiederherstellungstest, Zielserver-Kompatibilität und Dienstabnahme. SAP-Import und eigenständige QVP-Feinplanung sind weiterhin nicht umgesetzt. Produktivbetrieb erst nach diesen Prüfungen.


## Update mit SAP-Istabgleich

F?r den bestehenden Dienst `PMcapacityplaning` wird der freigegebene Git-Stand wie bisher mit `E:\Applications\PMcapacityplaning\update.bat` aktualisiert. Das Skript ruft `git pull --ff-only` auf, installiert die Anforderungen aus `requirements.txt`, f?hrt `pip check` und die Umgebungspr?fung aus und startet den Dienst neu. F?r XLSX-Dateien kommen `openpyxl` mit `et-xmlfile` sowie `defusedxml` hinzu. Die laufende Serverumgebung ben?tigt Zugriff auf die konfigurierte Python-Paketquelle; `requirements-server.lock` dokumentiert Windows-x64-Pakete und Hashes, das vorhandene Update-Skript installiert aber nicht daraus und ist kein nachgewiesenes Offline-Release. Der erfolgreiche Download in der bestehenden Umgebung ist vor Ort zu best?tigen.

Das Update ver?ndert weder `.env` noch Dienstnamen oder MongoDB-Collections. Vor dem ersten Import eine aktuelle, wiederherstellbare Datensicherung sicherstellen. Nach dem Update Dienststatus und `/health` kontrollieren, Anmeldung im Browser pr?fen und einen SAP-Export zun?chst bis zur Vorschau einlesen. Dabei Projektnummern, nicht zugeordnete Buchungen und den ersetzten Person-/Datumsbereich kontrollieren. Erst einen vollst?ndigen, zuvor gepr?ften Export ?bernehmen. Die neuen Excel-Abh?ngigkeiten und der Istabgleich wurden lokal getestet; Python 3.14.7, Dienstkonto, Installation, MongoDB und Browser m?ssen auf dem tats?chlichen Server separat abgenommen werden.

Ein unterbrochenes `pip install` kann die bestehende virtuelle Umgebung teilweise ver?ndern; der Paketabgleich ist nicht transaktional. Bei einem Fehler die Ausgabe sichern und den Dienststatus pr?fen. Ein blo?er Healthcheck beweist weder den erwarteten Git-Stand noch einen funktionierenden XLSX-Import.
