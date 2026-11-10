# Kapazitätsplanung – lokale Sicherheitsbasis

- Waitress bindet ausschließlich an 127.0.0.1. Der Prototyp besitzt keinen externen Zugang und wird nicht für dev/prd freigegeben.
- Plattform-Sicherheitsheader, Cookie-Namensraum und Rate Limiter stammen aus dem unveränderten Kit.
- Die lokale API verlangt einen Schreib-Token; ein Revisionsvergleich verhindert stilles Überschreiben durch veraltete Browserfenster im selben Prozess.
- Die Dateispeicherung ist unverschlüsselt. JSON-Sicherungen enthalten die Planungsdaten und müssen entsprechend geschützt werden.
- Die geplanten Personen sind lokale Planungsressourcen. Eine Portal-Anmeldung oder Rollenprüfung im gemeinsamen Plattformbetrieb ist noch nicht eingerichtet.
- Vor einem Serverbetrieb sind Authentifizierung, vollständige serverseitige Fachvalidierung, MongoDB, konkrete Datei- und Netzwerkrechte und eine Betriebsabnahme erforderlich. Organisatorische Angaben bleiben TBD.
