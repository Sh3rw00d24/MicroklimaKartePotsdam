# Stadtpuls Potsdam – Mikroklima-Dashboard

Live-Dashboard für die Mikroklima-Messstationen (SenseCAP-Wetterstationen) der Stadt
Potsdam. Zeigt aktuelle Messwerte auf einer Karte und den Verlauf jedes einzelnen
Sensorwerts über einen wählbaren Zeitraum. Alle Werte kommen live von der
[Urbanen Datenplattform Potsdam](https://ckan.urbanedatenplattform-potsdam.de) –
es gibt keine simulierten oder erfundenen Daten mehr.

## Starten

Voraussetzung: [Node.js](https://nodejs.org) Version 18 oder neuer.

```bash
npm install
npm start
```

Danach im Browser öffnen: **http://localhost:3000**

Wichtig: immer über diese Adresse öffnen, nicht die Datei `public/index.html` per
Doppelklick starten. Als lokale Datei (`file://...`) fehlen dem Browser die
Kartenkacheln und der Datenabruf funktioniert nicht – die Seite bleibt dann leer.
Falls im Browser trotz laufendem Server keine Daten erscheinen, zeigt die Seite
oben einen orangen Hinweis mit der wahrscheinlichen Ursache an.

## Warum gibt es einen Server, wenn das doch "nur" eine Webseite ist?

Die Urbane Datenplattform Potsdam sendet keine CORS-Freigabe mit ihren Antworten
mit. Ein Browser darf ihre Daten deshalb aus Sicherheitsgründen nicht direkt von
einer eigenen Webseite aus abrufen (das wurde vor dem Bau dieses Projekts geprüft –
es liegt nicht an einer falschen Anfrage). Der kleine Server in `server.js` holt die
Daten deshalb im Hintergrund ab und reicht sie an die Seite im Browser weiter.
Gleichzeitig liefert derselbe Server auch die Webseite selbst aus (alles im Ordner
`public`). Es muss also nichts anderes gestartet werden als dieser eine Server.

## Aufbau des Projekts

```
server.js                    Kleiner Server: liefert die Webseite aus und holt
                              im Hintergrund die Sensordaten von CKAN.
public/
  index.html                 Grundgerüst der Seite (Karte, Seitenleiste, Dashboard).
  style.css                  Gesamtes Erscheinungsbild.
  config.js                  Liste aller 22 Standorte mit Name, Koordinaten und
                              der CKAN-"resourceId" des zugehörigen Sensors.
  messfeld-wissen.js         Für jeden möglichen Messwert (Temperatur, Wind, …):
                              deutsche Bezeichnung, Einheit, Farbe, Icon sowie die
                              Erklärtexte im "Mehr erfahren"-Bereich.
  script.js                  Die eigentliche Logik: Karte aufbauen, Daten abrufen,
                              Popups und Diagramme erzeugen.
```

## Einen neuen Sensor anschließen

Das ist der Teil, der am häufigsten gebraucht wird, deshalb hier ausführlich:

1. Auf der [Urbanen Datenplattform Potsdam](https://ckan.urbanedatenplattform-potsdam.de)
   das Dataset des neuen Sensors öffnen und dort bei der zugehörigen Ressource die
   **resource_id** kopieren (findet sich z. B. im Download-Link oder im
   Beispielcode der Plattform, dort steht sie im Feld `resource_id: '...'`).
2. In `public/config.js` den Standort suchen (oder neu anlegen) und dort
   `resourceId: null` durch `resourceId: 'die-kopierte-id'` ersetzen.
3. Seite neu laden – der Standort läuft ab sofort mit echten Live-Daten, inklusive
   automatisch erzeugter Diagramme für jeden Messwert, den dieser Sensor sendet.

Es ist keine weitere Code-Änderung nötig. Auch neue, bisher unbekannte Messfelder
funktionieren automatisch (mit einer einfachen Standard-Darstellung) – für eine
schönere Darstellung kann in `public/messfeld-wissen.js` einfach ein neuer Eintrag
mit demselben Feldnamen ergänzt werden, den der Sensor sendet.

## Wichtiger Hinweis zum aktuellen Datenstand (Stand: 03.09.2026)

Von den 22 in `config.js` hinterlegten Standorten senden aktuell **4** bereits
echte Live-Daten:

- am Steubenplatz / Alter Markt (alle 8 Messwerte der Wetterstation)
- Stadtbad Babelsberg (Temperatur, Luftfeuchtigkeit, UV-Index)
- Stadtteil Krampnitz (Temperatur, Luftfeuchtigkeit, UV-Index)
- Karl Liebknecht Station (Temperatur, Luftfeuchtigkeit, UV-Index)

Die Zuordnung der drei zuletzt genannten Sensoren zu ihrem Standortnamen wurde
anhand ihrer gemeldeten Koordinaten vorgenommen. Die übrigen 18 Standorte sind als
Platzhalter angelegt (gestrichelter Punkt auf der Karte, Popup zeigt "Noch nicht
angebunden") – deren Koordinaten stammen aus einer Adresssuche über OpenStreetMap
und sollten bei Bedarf noch verglichen werden. Bei zwei Standorten
(**Johann Boumann Platz**, **Cornelius Gesamtschule**) konnte keine eindeutige
Adresse gefunden werden; das ist direkt als Kommentar in `config.js` vermerkt.
Sobald für einen dieser Standorte eine echte resource_id vorliegt, einfach wie
oben beschrieben eintragen.

## Technische Details zu den Messwerten

- **Windgeschwindigkeit**: Der Sensor liefert Meter pro Sekunde (m/s), das
  Dashboard rechnet für die Anzeige in km/h um (× 3,6).
- **Luftdruck**: Der Sensor liefert Pascal (Pa), das Dashboard rechnet für die
  Anzeige in hPa um (÷ 100).
- **Zeiträume in den Diagrammen**: 24 Stunden / 7 Tage / 30 Tage / gesamter
  Zeitraum. Die Filterung geschieht direkt im Browser, nachdem die Messhistorie
  einmal geladen wurde – ein Wechsel des Zeitraums braucht deshalb keine erneute
  Abfrage bei der Datenplattform.
- Fehlerhafte oder leere Messungen der Station (kommen gelegentlich vor) werden
  als Lücke im Diagramm dargestellt statt als 0, damit sie nicht mit einem
  echten Messwert verwechselt werden.

## Diagramme: zoomen und die Windrose

In jedem Zeitreihen-Diagramm kann mit dem Mausrad gezoomt und bei gedrückter
Maustaste der sichtbare Ausschnitt verschoben werden (auf dem Handy: mit zwei
Fingern zoomen). Rechts oben im Diagramm erscheint beim Darüberfahren ein kleines
Zurücksetzen-Symbol. Umgesetzt mit [chartjs-plugin-zoom](https://www.chartjs.org/chartjs-plugin-zoom/latest/).

Die Windrichtung wird nicht als Linie, sondern als Windrose dargestellt: Für den
gewählten Zeitraum wird gezählt, wie oft der Wind aus welcher der 16
Himmelsrichtungen kam, und als Kreisdiagramm angezeigt. Das ist aussagekräftiger
als eine Linie aus Gradzahlen, die bei jedem Sprung über Nord (0°/360°) einen
irreführenden Ausschlag zeigen würde.

## Das Dashboard dauerhaft betreiben

Dieses Projekt liegt aktuell in einem temporären Arbeitsordner. Für einen
dauerhaften Betrieb bitte den kompletten Ordner an einen festen Speicherort (den
eigenen Rechner, einen kleinen Server oder einen Hosting-Anbieter, der Node.js
unterstützt, z. B. Render oder Railway) verschieben. Der Startbefehl bleibt überall
derselbe: `npm install` einmalig, danach `npm start`.
