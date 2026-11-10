# Prüfstand – 10.11.2026

## Nachgewiesene Korrekturen
- Die Antwort des alten Servers enthielt zweimal U+FEFF vor dem Dokumenttyp. Dies erklärte das verschobene Raster im Screenshot. Die Vorlagen werden jetzt mit UTF-8-BOM-Behandlung geladen, lokal aktualisiert und als HTML ohne Cache ausgeliefert.
- Alle im gerenderten HTML verwendeten Icon-Verweise werden gegen das offizielle Sprite geprüft. Die ungültigen Namen wurden ersetzt.
- UI-Kit 2.21.0 wurde unverändert synchronisiert. Kopfzeile, Footer, Symbole und Klickflächen verwenden die Originalwerte.
- Die Monatsberechnung summiert ausschließlich tatsächlich belegte Kalendertage.
- Schreibzugriffe vergleichen die geladene Revision. Veraltete Browserstände erhalten HTTP 409.

## Automatische Prüfungen
`python -m pytest -p no:cacheprovider -o addopts="" tests`: 25 Tests erfolgreich. Geprüft werden Plattform-Health, Sicherheitsheader, Proxy-Prefix/Cookie, Rate Limiter, Sprache, Datenzugriffe, Schreib-Token, Revisionskonflikte, lokaler Startmodus, HTML- und Icon-Regressionen sowie Rollenmigration, Sicherung, Katalogvalidierung, Umbenennen ohne Zuordnungsverlust und Vorbereitung älterer Sicherungen.

`tests/plan.test.js`: Budgetsummen, ganze Stunden, Gate- und Monatsgrenzen sowie gewichtete Wochen wurden mit der JavaScript-Laufzeit geprüft.

`tests/roles.test.js`: Dropdown mit Projektleiter/QVP, Person mit QVP-Zuordnung, Umbenennen mit erhaltener ID, zusätzliche Rolle, Abfangen doppelter Namen und aktualisierte Auswahl wurden geprüft. Der Personendialog verwendet die unveränderte Formular- und Aktionszeile des UI-Kits. Seine tatsächliche Browserdarstellung bleibt Bestandteil der noch offenen Sichtprüfung.

Der automatische Plattform-Check prüft nur einen Teil der Regeln. Seine PASS-Zeilen sind keine Produktionsfreigabe. Die manuellen Aufgaben und lokalen Abweichungen bleiben bestehen.

## Sichtprüfung
Eine vollständige dokumentierte Sicht- und Bedienprüfung bei 1440 × 900, 768 × 1024 und 390 × 844 steht noch aus. Der bisherige Browserzugriff wurde durch die Computersteuerung abgebrochen. Die Regressionstests prüfen die Ursache des gelieferten Screenshots; sie bescheinigen keine tatsächlichen Browserabmessungen oder vollständige Bedienbarkeit.

## Referenzen und offene Aufgaben
GMA 4.9.1 `d7adb792b663419eed2955d446a0203a231b9057`; Designsystem 2.21.0 `7ee9123e3a03e54f4399ac30cf76c4c8a9dc7435`.

Vor einer Plattformfreigabe: serverseitige Fachvalidierung, Rollen und Portal-Anmeldung, MongoDB, bestätigte Organisationsdaten, echte Betriebs- und Sicherungsparameter und vollständige manuelle Regelprüfung. SAP-Verarbeitung und mehrere Rollenzuordnungen je Projekt sind weitere fachliche Schritte. Die aktuelle Version ist eine lokale Vorführung.
