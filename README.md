# Stadtpuls Potsdam – Mikroklima-Dashboard

Live-Dashboard für die Mikroklima-Messstationen (SenseCAP-Wetterstationen) der Stadt Potsdam.
Zeigt aktuelle Messwerte auf einer interpolierten Wetterkarte, Verlaufsdiagramme pro Standort,
einen Vergleich mit den 20-jährigen DWD-Klimadaten Potsdams sowie automatische Wetterwarnungen
(Hitze, Wind, UV, Trockenheit). Alle Werte kommen live von der
[Urbanen Datenplattform Potsdam](https://ckan.urbanedatenplattform-potsdam.de) – es gibt keine
simulierten oder erfundenen Daten.

## Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) Version 18 oder neuer.

```bash
npm install
npm start
```

Danach im Browser öffnen: **http://localhost:3000**

Immer über diese Adresse öffnen, nicht `public/index.html` per Doppelklick starten – als
lokale Datei (`file://...`) fehlt dem Browser der Datenabruf, die Seite bleibt leer. Port
per `PORT`-Umgebungsvariable änderbar (Default: 3000). Erscheinen trotz laufendem Server
keine Daten, zeigt die Seite oben automatisch einen Hinweis mit der wahrscheinlichen Ursache
(eigener Server down vs. Datenplattform down – wird unterschieden).

## Warum ein eigener Server?

Die Urbane Datenplattform Potsdam sendet keine CORS-Freigabe – ein Browser darf ihre Daten
deshalb nicht direkt von einer eigenen Webseite abrufen. `server.js` holt die Daten stattdessen
im Hintergrund ab (Proxy) und liefert außerdem die Webseite selbst aus. Ein Prozess genügt.

## Projektstruktur

| Datei | Zweck |
|---|---|
| `server.js` | Express-Server: liefert `public/` aus, proxied CKAN-Sensordaten (`/api/messwerte/:resourceId`) und DWD-Referenzdaten (`/api/dwd/referenz`). |
| `dwd-klimadaten.js` | Lädt/parst die DWD-Klimadaten der Station Potsdam, berechnet Klimanormal + Erwärmungstrend, cached in `data/` (gitignored). |
| `public/index.html` | Grundgerüst: Karte, Steuerung, Standortanalyse. |
| `public/style.css` | Gesamtes Erscheinungsbild. |
| `public/config.js` | Die 20 Standorte: Name, Koordinaten, CKAN-`resourceId` des Sensors. |
| `public/messfeld-wissen.js` | Pro Messgröße: Bezeichnung, Einheit, Farbe, feste Diagrammachse, Erklärtexte. Normalisiert außerdem uneinheitliche Sensor-Feldnamen auf kanonische Namen. |
| `public/wetterwarnungen.js` | Bewertet Hitze/Wind/UV/Trockenheit gegen reale meteorologische Schwellen (siehe unten). |
| `public/dwd-vergleich.js` | DWD-Klimanormal-Vergleich: graue Vergleichslinie im Diagramm + Klimawandel-Einordnung im Text. |
| `public/script.js` | Hauptlogik: Karte, Datenabruf, Popups, Diagramme, Warnungen zusammenführen. |
| `public/dev-test.js` | **Nur lokal**, nicht in Git: Konsolen-Werkzeug zum Simulieren von Extremwerten (siehe unten). |

## Datenfluss (Kurzfassung)

CKAN (Rohdaten, uneinheitliche Feldnamen/Einheiten je Sensor)
→ `server.js` (Proxy, CORS umgangen)
→ `normalisiereDatensatz()` in `messfeld-wissen.js` (Feldnamen vereinheitlicht, Pa→hPa)
→ `script.js` (Karte einfärben, Diagramme zeichnen, Warnungen auswerten)

## Einen neuen Sensor anschließen

1. Auf der [Urbanen Datenplattform Potsdam](https://ckan.urbanedatenplattform-potsdam.de) beim
   Dataset des Sensors die **resource_id** kopieren.
2. In `public/config.js` beim betreffenden Standort `resourceId: null` durch die kopierte ID
   ersetzen (oder einen neuen Standort-Eintrag anlegen).
3. Seite neu laden. Diagramme, Kartenfarbe und Warnungen entstehen automatisch – auch für
   bisher unbekannte Messfelder (mit generischer Standarddarstellung, siehe
   `ermittleMessfeldInfo()`-Fallback in `messfeld-wissen.js`).

Keine weitere Code-Änderung nötig. **Aktueller Stand:** 9 von 20 Standorten senden Live-Daten
(Rest: Platzhalter, gestrichelter Punkt auf der Karte).

## Messwerte & Einheiten

| Sensor-Rohfeld (Beispiele) | Kanonischer Name | Anzeige-Einheit |
|---|---|---|
| "Air Temperature", "Temperature" | `Air Temperature` | °C |
| "Air Humidity", "Humidity" | `Air Humidity` | % |
| "Wind Speed" | `Wind Speed` | km/h (Sensor liefert m/s, × 3,6) |
| "Wind Direction", "Wind Direction Sensor" | `Wind Direction Sensor` | Himmelsrichtung |
| "Barometric Pressure", "Air pressure" | `Barometric Pressure` | hPa (Sensor liefert teils Pa, ÷ 100 bei Werten > 10000) |
| "Light Intensity" | `Light Intensity` | lx |
| "UV Index" | `UV Index` | Index 0–11+ |

Feldnamen werden per Schlüsselwort erkannt (`ermittleKanonischenFeldnamen()`), nicht per exakter
Liste – neue Schreibweisen derselben Größe (andere Firmware-Version) funktionieren automatisch.
Niederschlag wird grundsätzlich ausgeblendet (`AUSGEBLENDETE_FELDER_SCHLUESSELWOERTER`).

## DWD-Klimavergleich

Quelle: [DWD Climate Data Center](https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl/),
Station 03987 Potsdam (Telegrafenberg), Tageswerte seit 1893. `dwd-klimadaten.js` lädt diese
Daten einmalig (Cache 30 Tage) und berechnet serverseitig:

- **Klimanormal pro Kalendertag** (Temperatur, Luftfeuchte, Wind) – Mittel ± Standardabweichung
  aus den letzten 20 vollständigen Jahren, geglättet über ein ±5-Tage-Fenster.
- **Erwärmungstrend** – lineare Regression der Jahresmittel-Temperatur, gesamte Messreihe und
  letzte 30 Jahre getrennt (macht eine Beschleunigung sichtbar statt sie zu verwässern).

Im Diagramm erscheint das Klimanormal als graue gestrichelte Linie hinter der echten Messkurve.
Im Text vergleicht `berechneKlimaEinordnung()` den Ø-Sensorwert der letzten 24h mit dem
Klimanormal des heutigen Tages (Tagesmittel gegen Tagesmittel, keine Tageszeit-Verzerrung) und
ordnet die Abweichung per Standardabweichung ein. Luftdruck/UV/Licht bewusst ohne DWD-Vergleich
(Luftdruck: Höhenunterschied Station↔Sensor unkorrigiert; UV: absolute, ortsunabhängige Skala).

## Wetterwarnungen

| Typ | Skala / Quelle | Schwelle |
|---|---|---|
| Hitze | eigene Schwelle | ab 34 °C, ab 38 °C zweite Stufe |
| Wind | [Beaufort-Skala](https://de.wikipedia.org/wiki/Beaufortskala) (auf Mittelwind, keine Böen – Sensoren messen keine Böen) | Bft 0 = Windstille (Hinweis), ab Bft 6 (39 km/h) Warnung, Bft 9 Sturm, Bft 12 Orkan |
| UV-Index | [WHO Global Solar UV Index](https://www.who.int/news-room/questions-and-answers/item/radiation-the-ultraviolet-(uv)-index) | ab 8 "Sehr hoch", ab 11 "Extrem" |
| Trockenheit | eigene Schwelle, angelehnt an Kernfaktoren realer Waldbrand-Gefahrenindizes | <40 % Hinweis, <30 % Warnung, <30 % + ≥25 °C verschärfte Stufe |

Jede Warnung erscheint als Marker-Puls + Toast + Box in der Standortanalyse (mehrere gleichzeitig
möglich) und bekommt, wo ein DWD-Vergleich sinnvoll ist, automatisch den saisonalen Kontext
dazu. Zentrale Logik: `ermittleWarnungenFuerStandort()` in `wetterwarnungen.js`.

## Diagramme

Zeitreihen: Zoom per Mausrad, Verschieben bei gedrückter Maustaste, Zurücksetzen-Symbol oben
rechts ([chartjs-plugin-zoom](https://www.chartjs.org/chartjs-plugin-zoom/latest/)). Feste
Y-Achse pro Messgröße (realistischer Wertebereich statt Auto-Zoom auf die Datenspanne), wächst
aber automatisch mit, falls ein echter Messwert die Spanne übersteigt – damit ein Extremwert nie
am Rand abgeschnitten wird. Windrichtung wird als Windrose (Häufigkeit je Himmelsrichtung) statt
als Linie dargestellt, da Gradzahlen beim Sprung über 0°/360° sonst einen falschen Ausschlag zeigen.

## Dev-Test-Werkzeug (nur lokal)

`public/dev-test.js` lädt ausschließlich auf `localhost`/`127.0.0.1` (Prüfung in `index.html`)
und ist nicht in Git eingecheckt – existiert nie in einem Deployment. Stellt in der
Browser-Konsole Funktionen bereit, die für einen Standort echte Extremwerte in die Messhistorie
einspeisen und automatisch zurücksetzen:

```js
simuliereHitzewarnung(42, 120, standortId)        // Temperatur °C, Dauer s, Standort-ID (alle optional)
simuliereWindwarnung(130, 120, standortId)        // km/h im Mittel
simuliereUvWarnung(13, 120, standortId)           // UV-Index
simuliereTrockenheitswarnung(15, 120, standortId) // % Luftfeuchte
simuliereExtremwetter(120, standortId)            // alle vier gleichzeitig
```

## Dauerhafter Betrieb

Ordner an einen festen Speicherort verschieben (eigener Rechner, kleiner Server oder
Node.js-fähiger Hoster, z. B. Render/Railway). Startbefehl bleibt überall `npm install`
einmalig, danach `npm start`.
