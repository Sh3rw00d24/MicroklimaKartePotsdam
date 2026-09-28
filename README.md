# Stadtpuls Potsdam – Mikroklima-Dashboard

Live-Dashboard für die Mikroklima-Messstationen der Stadt Potsdam. Zeigt aktuelle Messwerte
auf einer interpolierten Wetterkarte, Verlaufsdiagramme pro Standort, einen Vergleich mit
20 Jahren DWD-Klimadaten und automatische Wetterwarnungen (Hitze, Wind, UV, Trockenheit).
Alle Werte kommen live von der
[Urbanen Datenplattform Potsdam](https://ckan.urbanedatenplattform-potsdam.de) (CKAN) –
nichts ist simuliert oder erfunden.

Dieses Dokument erklärt nicht nur, wie man die Seite startet, sondern auch **genau**, was
beim Öffnen im Hintergrund passiert und warum die einzelnen Bausteine so gebaut sind, wie
sie sind. Zum schnellen Ausprobieren reicht der Abschnitt "Schnellstart", für alles Weitere
folgt am besten der Reihe nach.

## Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) Version 18 oder neuer.

```bash
npm install
npm start
```

Danach im Browser öffnen: **http://localhost:3000**

Immer über diese Adresse öffnen, nicht `public/index.html` per Doppelklick starten – als
lokale Datei (`file://...`) fehlt dem Browser der Datenabruf, die Seite bleibt leer. Port
per `PORT`-Umgebungsvariable änderbar (Standard: 3000). Erscheinen trotz laufendem Server
keine Daten, zeigt die Seite oben automatisch einen Hinweis mit der wahrscheinlichen
Ursache – und unterscheidet dabei zwei völlig verschiedene Fehlerquellen: der eigene
Server ist nicht erreichbar (Neustart hilft), oder die Datenplattform selbst antwortet
gerade nicht (Neustart hilft **nicht**, einfach etwas warten).

## Warum überhaupt ein eigener Server?

Die Urbane Datenplattform Potsdam sendet keine CORS-Freigabe mit ihren Antworten. Ein
Browser darf ihre Daten deshalb aus Sicherheitsgründen nicht direkt von einer eigenen
Webseite abrufen – das ist keine Fehlkonfiguration dieses Projekts, sondern eine bewusste
Browser-Schutzmaßnahme, an der sich nichts ändern lässt, ohne die Datenplattform selbst zu
kontrollieren. `server.js` holt die Daten deshalb serverseitig ab (dort gilt die
CORS-Regel nicht) und reicht sie an den Browser weiter – ein klassischer Proxy. Derselbe
Server liefert außerdem gleich die Webseite selbst aus (Ordner `public/`), es muss also
nur ein einziger Prozess laufen.

## So arbeitet die Seite – Schritt für Schritt

### 1. Die Seite wird geöffnet

`public/index.html` lädt sechs eigene Skripte in fester Reihenfolge (`config.js` →
`messfeld-wissen.js` → `wetterwarnungen.js` → `dwd-vergleich.js` → `script.js`, plus lokal
`dev-test.js`) – die Reihenfolge ist wichtig, weil spätere Dateien Funktionen aus früheren
benutzen. Sobald das DOM steht, startet `script.js` in `DOMContentLoaded` fünf Dinge
gleichzeitig: die Leaflet-Karte aufbauen, für jeden der 20 Standorte einen Marker setzen,
das Popup-Verhalten verdrahten, die Bedienelemente verdrahten und zwei Datenabrufe
lostreten – `aktualisiereAlleAktuellenWerte()` (Live-Werte aller Sensoren) und
`ladeDwdReferenzdaten()` (DWD-Klimanormal, einmalig). Danach läuft
`aktualisiereAlleAktuellenWerte()` automatisch alle 5 Minuten erneut
(`AUTOMATISCHE_AKTUALISIERUNG_MS` in `script.js`).

### 2. Der Weg eines einzelnen Messwerts

Das ist das Herzstück der Seite – hier passiert der Großteil der eigentlichen Arbeit:

1. **Abruf**: Für jeden Standort mit Sensor fragt der Browser
   `GET /api/messwerte/<resourceId>?limit=20` bei `server.js` an.
2. **Proxy**: `server.js` reicht das 1:1 an CKANs `datastore_search`-API weiter und gibt die
   Antwort zurück – dabei wird zwischen drei Fehlerarten unterschieden (Datenplattform
   antwortet mit Fehlerstatus → 502, Datenplattform sagt selbst "nicht erfolgreich" → 502,
   eigener Server erreicht die Datenplattform gar nicht → 500), damit die Seite später die
   richtige Fehlermeldung zeigen kann.
3. **Normalisieren** (`normalisiereDatensatz()` in `messfeld-wissen.js`): Verschiedene
   Sensor-Firmwareversionen nennen dieselbe Messgröße unterschiedlich (z. B. "Wind
   Direction Sensor", "Wind Direction", "Wind direction"). Statt einer festen Liste prüft
   `ermittleKanonischenFeldnamen()` auf Schlüsselwörter (`.includes('wind')` etc.) – neue
   Schreibweisen funktionieren dadurch automatisch mit, ohne Code-Änderung. Nebenbei wird
   Luftdruck von Pascal auf Hektopascal umgerechnet, falls nötig (Größenordnung > 10.000
   verrät Pa statt hPa).
4. **Plausibilität prüfen** (`istPlausibel()`, ebenfalls `messfeld-wissen.js`): Diese
   Sensoren senden gelegentlich eine teilweise beschädigte Übertragung – beobachtet wurde
   z. B. ein Datensatz mit fehlender Temperatur/Feuchte und einem Luftdruckwert, der
   umgerechnet 286 hPa ergab (physikalisch unmöglich; der niedrigste je gemessene
   Meeresspiegeldruck weltweit liegt bei ca. 870 hPa). `PLAUSIBLE_BEREICH` definiert für
   jedes Feld einen großzügigen, aber physikalisch begrenzten Wertebereich; alles
   außerhalb wird wie ein fehlender Wert behandelt (`null`) statt als falsche Zahl
   angezeigt zu werden.
5. **Zeitstempel korrekt interpretieren** (`parseSensorZeitpunkt()` in `script.js`): Die
   Sensoren senden Zeitstempel ohne Zeitzone (z. B. `"2026-09-25T09:35:05"`), meinen damit
   aber UTC. Ohne Gegenmaßnahme würde JavaScript einen solchen String als bereits-lokale
   Zeit lesen – ein Messwert von 9:35 UTC (= 11:35 echte Ortszeit im Sommer) wäre dann
   fälschlich als 9:35 Ortszeit angezeigt worden, 2 Stunden in der Vergangenheit. Ein
   angehängtes `Z` erzwingt die richtige Interpretation, ganzjährig korrekt (auch wenn
   Deutschland im Winter auf MEZ wechselt). **Jede** Stelle im Code, die einen rohen
   Sensor-Zeitstempel parst, nutzt diese eine Funktion statt direkt `new Date(...)`.
6. **Die "letzten vollständigen Werte" finden** (`findeLetzteVollstaendigeWerte()`): Von
   den 20 zuletzt abgerufenen Messungen wird nicht einfach die neueste genommen, sondern
   die neueste, in der **alle** bekannten Felder einen gültigen Wert haben – ein einziger,
   in sich konsistenter Messzeitpunkt statt einer Mischung aus verschiedenen Übertragungen.
   Findet sich keine komplett vollständige Übertragung, gewinnt die mit den wenigsten
   Lücken. Der dazugehörige Zeitstempel wird als "Stand: …" angezeigt – im Regelfall ist
   das schlicht der neueste Messwert, bei einer fehlerhaften Übertragung eben ein paar
   Minuten älter, aber vollständig statt lückenhaft.

Erst danach landen die Werte in `aktuelleWerteNachStandortId` und werden für Karte, Popup
und Live-Kacheln verwendet.

### 3. Ein Standort wird angeklickt

Klick auf einen Marker → `ausgewaehlterStandort` wird gesetzt, der Marker optisch
hervorgehoben, das Popup öffnet sich (`erzeugePopupInhalt()`, inkl. Link zu den Rohdaten
auf der UDP – der erscheint in **jedem** Zustand: Erfolg, Fehler oder Ladevorgang) und die
Standortanalyse unten auf der Seite füllt sich (`zeigeStandortImDashboard()`). Für die
Diagramme wird – falls noch nicht im Cache – die komplette Messhistorie geladen (bis zu
10.000 Datensätze, `ANZAHL_FUER_VERLAUF`), nach dem gewählten Zeitraum gefiltert
(24 Stunden / 7 / 30 Tage / gesamter Zeitraum) und für jedes vom Sensor gesendete Feld ein
eigenes Diagramm gezeichnet. Ein Zähler pro Standort (`verlaufAnfrageGeneration`) verwirft
veraltete Server-Antworten, falls schnell zwischen Zeiträumen oder Standorten gewechselt
wird – sonst könnte eine langsame, inzwischen überholte Antwort die Anzeige einer neueren
überschreiben.

### 4. Die Karte einfärben

Für die gewählte Messgröße (Dropdown oben links) wird die Karte nicht einfach mit
isolierten Flecken pro Sensor eingefärbt, sondern mit einer echten
Wetterkarten-Interpolation: Für jede Rasterzelle der Karte wird ein nach Entfernung
gewichteter Mittelwert aus **allen** Sensoren berechnet (Inverse-Distance-Weighting, das
Standardverfahren für Wetterkarten, `zeichneWetterInterpolation()`). Näher an einem Sensor
bestimmt dessen Wert die Farbe stärker; wie weit ein einzelner Sensor sichtbar wirkt,
richtet sich dynamisch nach dem tatsächlichen Abstand zu seinen Nachbarn
(`berechneReichweite()`) – bei wenigen, weit verstreuten Sensoren wirkt jeder weiter, bei
vielen dicht beieinander entsprechend enger. Ohne das würde die Karte bei weit
herausgezoomter Ansicht zu einer einzigen verwaschenen Durchschnittsfarbe verschwimmen.

## Projektstruktur

| Datei | Zweck |
|---|---|
| `server.js` | Express-Server: liefert `public/` aus, proxied CKAN-Sensordaten (`/api/messwerte/:resourceId`) und DWD-Referenzdaten (`/api/dwd/referenz`). |
| `dwd-klimadaten.js` | Lädt/parst die DWD-Klimadaten der Station Potsdam, berechnet Klimanormal + Erwärmungstrend, cached in `data/` (gitignored). |
| `public/env.js` | **Nicht in Git, wird von `server.js` dynamisch erzeugt**: setzt `APP_BASIS_PFAD` aus der `BASE_PATH`-Umgebungsvariable (siehe "Deployment unter einem Unterpfad"). |
| `public/index.html` | Grundgerüst: Kopfbereich, Live-Kacheln, Karte, Standortanalyse, Footer. |
| `public/style.css` | Gesamtes Erscheinungsbild, inkl. Responsive-Anpassungen für Mobilgeräte. |
| `public/config.js` | Die 20 Standorte: Name, Koordinaten, CKAN-`resourceId` des jeweiligen Sensors, optionaler Link zu den Rohdaten. |
| `public/messfeld-wissen.js` | Pro Messgröße: Bezeichnung, Einheit, Farbe, feste Diagrammachse, Erklärtexte. Normalisiert außerdem uneinheitliche Sensor-Feldnamen und prüft jeden Rohwert auf physikalische Plausibilität. |
| `public/wetterwarnungen.js` | Bewertet Hitze/Wind/UV/Trockenheit gegen reale meteorologische Skalen (Details unten). |
| `public/dwd-vergleich.js` | DWD-Klimanormal-Vergleich: graue Vergleichslinie im Diagramm + textliche Einordnung. |
| `public/script.js` | Hauptlogik: Karte, Datenabruf, Popup, Diagramme, Zusammenspiel aller anderen Module. |
| `public/dev-test.js` | **Nur lokal, nicht in Git**: Konsolen-Werkzeug zum Simulieren von Extremwerten (Details unten). |
| `Dockerfile` / `.dockerignore` | Produktions-Image für den Container-Betrieb (siehe "Deployment als Container"). |
| `helm/stadtpuls-potsdam/` | Helm-Chart für das Deployment auf Kubernetes (UDP-Infrastruktur). |

## Die Bausteine im Detail

### Messwerte & Einheiten

| Kanonischer Name | Einheit (Anzeige) | Besonderheit |
|---|---|---|
| `Air Temperature` | °C | – |
| `Air Humidity` | % | feste Obergrenze 100 % (kein "100+" in der Legende) |
| `Wind Speed` | km/h | Sensor liefert m/s, × 3,6 |
| `Wind Direction Sensor` | Himmelsrichtung | eigene Darstellung als Windrose, siehe unten |
| `Barometric Pressure` | hPa | Sensor liefert teils Pa (fünfstellig), wird automatisch erkannt und ÷ 100 |
| `Light Intensity` | lx | – |
| `UV Index` | Index 0–11+ | – |
| `Rain` | mm/h | siehe eigener Abschnitt unten |

Kanonische Namen werden per Schlüsselwort erkannt (`ermittleKanonischenFeldnamen()` in
`messfeld-wissen.js`), nicht per exakter Liste – eine künftige Firmware, die z. B.
"Ambient Temperature" statt "Air Temperature" sendet, funktioniert automatisch mit.

### Niederschlag (Rain)

Recherchiert direkt bei Seeed/SenseCAP (Hersteller-Forum): Der Sensor berechnet laufend
den Niederschlag der letzten 10 Minuten und rechnet ihn ×6 auf eine Stunde hoch – der
gesendete Wert ist also eine **Momentaufnahme der Intensität in mm/h**, keine
Tagessumme und kein Zähler, der sich aufsummiert. Deshalb:

- Darstellung als Balkendiagramm (passt zu einer meist-null-mit-Spitzen-Größe besser als
  eine Linie).
- Im Diagramm wird zu einem **Mittelwert pro Kalenderstunde** verdichtet
  (`aggregiereProStunde()` in `script.js`) statt jede Einzelmessung (alle paar Minuten) als
  eigenen Balken zu zeigen – bleibt dabei korrekt in mm/h, da der Mittelwert mehrerer Raten
  wieder eine Rate ist. Stunden ganz ohne Messung bleiben eine echte Lücke, nicht ein
  erfundener Null-Balken.
- Kein DWD-Vergleich: DWD liefert nur Tagessummen in mm, eine saubere Umrechnung auf eine
  vergleichbare mm/h-Größe wäre nicht seriös möglich.

### Wetterkarten-Farbverlauf (IDW-Interpolation)

Siehe Schritt 4 oben. Technisch ein eigenes `<canvas>` in Leaflets `overlayPane`
(`initialisiereWetterInterpolation()`), das bei jeder Kartenbewegung und jedem
Datenupdate neu gezeichnet wird. Die Farbskala (`achseMin`/`achseMax`) ist für jede
Messgröße identisch mit der Diagramm-Y-Achse in `messfeld-wissen.js` – bewusst dieselbe
Quelle, nicht zwei getrennt gepflegte Wertespannen, weil das früher dazu führte, dass ein
Wert auf der Karte anders "hoch" aussah als im Diagramm.

### DWD-Klimavergleich

Quelle: [DWD Climate Data Center](https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl/)
(offene Daten, CC BY 4.0), Station 03987 Potsdam (Telegrafenberg) – eine der längsten
durchgehenden Wetterreihen Deutschlands, Tageswerte seit 1893. `dwd-klimadaten.js` lädt
diese Daten serverseitig (Cache 30 Tage, `data/dwd-cache.json`) und berechnet zwei Dinge:

- **Klimanormal pro Kalendertag** (Temperatur, Luftfeuchte, Wind) – Mittel ± Standardabweichung
  aus den letzten 20 vollständigen Jahren, geglättet über ein ±5-Tage-Fenster (glättet
  Tag-zu-Tag-Rauschen, wie in der Klimatologie üblich).
- **Erwärmungstrend** – lineare Regression der Jahresmittel-Temperatur, einmal über die
  komplette Messreihe seit 1893, einmal über die letzten 30 Jahre – macht eine etwaige
  Beschleunigung des Trends sichtbar statt sie im Gesamtmittel zu verwässern.

Im Diagramm erscheint das Klimanormal als graue gestrichelte Linie hinter der echten
Messkurve. Im Text vergleicht `berechneKlimaEinordnung()` den Ø-Sensorwert der letzten 24
Stunden mit dem Klimanormal des heutigen Tages (Tagesmittel gegen Tagesmittel – bewusst
kein Vergleich zu unterschiedlichen Tageszeiten, das würde die Abweichung verfälschen) und
ordnet sie per Standardabweichung ein (statistisch begründete Schwelle statt willkürlicher
Grad-Zahlen). Luftdruck, UV und Licht bleiben ohne DWD-Vergleich: Luftdruck, weil DWD
Stationsdruck auf 81 m Höhe meldet und eine Höhenkorrektur zu den Sensor-Standorten fehlt;
UV, weil die WHO-Skala ein absoluter, ortsunabhängiger Maßstab ist, kein Klimamittel.

### Wetterwarnungen

| Typ | Skala / Quelle | Schwelle |
|---|---|---|
| Hitze | eigene Schwelle | ab 34 °C, ab 38 °C zweite (verschärfte) Stufe |
| Wind | [Beaufort-Skala](https://de.wikipedia.org/wiki/Beaufortskala) auf den gemessenen **Mittelwind** (Sensoren messen keine Böen) | Bft 0 = Windstille (Hinweis, kein Alarm), ab Bft 6 (39 km/h) Warnung, ab Bft 9 Sturm, ab Bft 12 Orkan |
| UV-Index | [WHO Global Solar UV Index](https://www.who.int/news-room/questions-and-answers/item/radiation-the-ultraviolet-(uv)-index) | ab 8 "Sehr hoch", ab 11 "Extrem" |
| Trockenheit | eigene, an reale Waldbrand-Gefahrenindizes angelehnte Stufen | <40 % Hinweis, <30 % Warnung, <30 % + ≥25 °C verschärfte Stufe |

Wichtig zur Windwarnung: Da die Sensoren nur Mittelwind messen, keine Böen, ersetzt das
keine offizielle DWD-Sturmwarnung (die auf Böen basiert, typischerweise 1,5–2× höher als
der Mittelwert) – der Warnungstext weist explizit darauf hin.

Jede Warnung/jeder Hinweis erscheint als Marker-Puls (nur ab echter Warnung, nicht bei
reinen Hinweisen wie Windstille) + Toast beim erstmaligen Auftreten + Box in der
Standortanalyse (mehrere gleichzeitig möglich, z. B. Hitze **und** Trockenheit im selben
Sommer) und bekommt, wo ein DWD-Vergleich sinnvoll ist, automatisch den saisonalen Kontext
dazu (`erzeugeDwdKontextSatz()`). Zentrale Logik:
`ermittleWarnungenFuerStandort()` in `wetterwarnungen.js`.

### Diagramme

Zeitreihen: Zoom per Mausrad, Verschieben bei gedrückter Maustaste, Zurücksetzen-Symbol
oben rechts im Diagramm
([chartjs-plugin-zoom](https://www.chartjs.org/chartjs-plugin-zoom/latest/)). Feste Y-Achse
pro Messgröße (realistischer Wertebereich statt Auto-Zoom auf die Datenspanne – sonst
wirkt eine kleine Schwankung wie ein dramatischer Ausschlag), wächst aber automatisch mit,
falls ein echter oder simulierter Extremwert die Spanne übersteigt, damit er nie am
Achsenrand unsichtbar abgeschnitten wird. Windrichtung wird als Windrose (Häufigkeit je
Himmelsrichtung im gewählten Zeitraum) statt als Linie dargestellt, da Gradzahlen beim
Sprung über 0°/360° sonst einen irreführenden Ausschlag zeigen würden.

## Einen neuen Sensor anschließen

1. Auf der [Urbanen Datenplattform Potsdam](https://ckan.urbanedatenplattform-potsdam.de) beim
   Dataset des Sensors die **resource_id** kopieren.
2. In `public/config.js` beim betreffenden Standort `resourceId: null` durch die kopierte ID
   ersetzen (oder einen neuen Standort-Eintrag anlegen).
3. Seite neu laden. Diagramme, Kartenfarbe und Warnungen entstehen automatisch – auch für
   bisher unbekannte Messfelder (mit generischer Standarddarstellung, siehe
   `ermittleMessfeldInfo()`-Fallback in `messfeld-wissen.js`).

Keine weitere Code-Änderung nötig. **Aktueller Stand:** 11 von 20 Standorten senden
Live-Daten (Rest: Platzhalter, gestrichelter Punkt auf der Karte, Popup zeigt "Noch nicht
angebunden").

## Dev-Test-Werkzeug (nur lokal)

`public/dev-test.js` lädt ausschließlich auf `localhost`/`127.0.0.1` (Prüfung direkt in
`index.html`) und ist nicht in Git eingecheckt – existiert nie in einem Deployment. Stellt
in der Browser-Konsole Funktionen bereit, die für einen Standort echte Extremwerte in die
Messhistorie einspeisen (nicht nur den Live-Wert überschreiben, damit auch Diagramme und
DWD-Vergleich reagieren) und nach der gewählten Dauer automatisch wieder auf die echten
Werte zurücksetzen:

```js
simuliereHitzewarnung(42, 120, standortId)        // Temperatur °C, Dauer in Sekunden, Standort-ID (alle optional)
simuliereWindwarnung(130, 120, standortId)        // km/h im Mittel
simuliereUvWarnung(13, 120, standortId)           // UV-Index
simuliereTrockenheitswarnung(15, 120, standortId) // % Luftfeuchte
simuliereExtremwetter(120, standortId)            // alle vier gleichzeitig – der "große Test"
```

Ohne Standort-ID wird zufällig ein Standort mit echtem Sensor gewählt.

## Dauerhafter Betrieb

Ordner an einen festen Speicherort verschieben (eigener Rechner, kleiner Server oder
Node.js-fähiger Hoster, z. B. Render/Railway). Startbefehl bleibt überall gleich:
`npm install` einmalig, danach `npm start`.

## Deployment als Container (Docker / Kubernetes)

Für den Betrieb auf der UDP-Infrastruktur liegen ein `Dockerfile` und ein Helm-Chart
(`helm/stadtpuls-potsdam/`) bereit.

**Image bauen und lokal testen:**

```bash
docker build -t stadtpuls-potsdam:latest .
docker run -p 3000:3000 stadtpuls-potsdam:latest
```

Läuft als unprivilegierter User, meldet sich über `HEALTHCHECK` selbst als gesund/ungesund
und enthält nie `public/dev-test.js` (wird beim Bauen explizit entfernt, siehe
`Dockerfile`). Das DWD-Cache-Verzeichnis (`data/`) ist rein ephemer - geht ein Container
verloren, werden die Referenzdaten beim nächsten Start einfach neu geladen.

**Image in eine Registry pushen** (Name/Ziel je nach UDP-Vorgabe anpassen):

```bash
docker tag stadtpuls-potsdam:latest <registry>/stadtpuls-potsdam:<tag>
docker push <registry>/stadtpuls-potsdam:<tag>
```

**Mit Helm deployen:**

```bash
helm install stadtpuls-potsdam helm/stadtpuls-potsdam \
  --set image.repository=<registry>/stadtpuls-potsdam \
  --set image.tag=<tag>
```

Alle Werte (Ingress-Host/-Klasse/TLS, Ressourcen-Limits, Replikas, Autoscaling) stehen mit
Erklärung in `helm/stadtpuls-potsdam/values.yaml` und lassen sich einzeln per `--set`
überschreiben oder in einer eigenen `values-udp.yaml` bündeln. Ingress ist standardmäßig
deaktiviert (`ingress.enabled: false`), da Hostname/IngressClass/TLS-Issuer vom Ziel-Cluster
abhängen - vor dem ersten produktiven Deploy in `values.yaml` eintragen oder per `--set`
mitgeben. Ohne Ingress ist die Seite testweise per Port-Forward erreichbar:

```bash
kubectl port-forward svc/stadtpuls-potsdam 8080:80
```

Chart validieren, ohne etwas zu deployen:

```bash
helm lint --strict helm/stadtpuls-potsdam
helm template stadtpuls-potsdam helm/stadtpuls-potsdam
```

## Deployment unter einem Unterpfad (z. B. domain.de/mikroklima)

Die Seite muss nicht auf der Domain-Wurzel laufen - eine einzige Umgebungsvariable
steuert das, `BASE_PATH`. Kein Rewrite/Strip im Reverse-Proxy nötig, keine zweite
Konfigurationsstelle: `server.js` mountet seine eigenen Routen darunter (`/style.css`,
`/api/...`) und reicht denselben Wert übers mitgelieferte `env.js` (als erstes Skript in
`index.html` geladen, vor `config.js`) ans Frontend weiter - Server und Browser haben so
immer exakt denselben Pfad, unabhängig von jeglicher Proxy-Konfiguration.

```bash
BASE_PATH=/mikroklima npm start
```

Der Reverse-Proxy davor muss den Pfad dadurch nur noch **unverändert durchreichen**,
keine Sonderbehandlung:

```nginx
location /mikroklima/ {
    proxy_pass http://stadtpuls-potsdam:3000;
    proxy_set_header Host $host;
}
```

Einzige Voraussetzung: ein Aufruf von `domain.de/mikroklima` (ohne abschließenden
Schrägstrich) muss auf `domain.de/mikroklima/` weiterleiten - sonst löst der Browser
relative Pfade wie `style.css` fälschlich gegen die Domain-Wurzel statt gegen den
Unterpfad auf (typische Ursache, wenn CSS/JS trotz funktionierendem Proxy nicht laden).
`server.js` übernimmt diesen Redirect bereits selbst, sobald `BASE_PATH` gesetzt ist -
zusätzlich im Proxy einzurichten ist optional, aber schont eine unnötige Weiterleitung
bis zum Backend.

**Im Helm-Chart** entsprechend über `env` mitgeben:

```bash
helm install stadtpuls-potsdam helm/stadtpuls-potsdam \
  --set "env[0].name=BASE_PATH" \
  --set "env[0].value=/mikroklima" \
  --set "ingress.hosts[0].paths[0].path=/mikroklima"
```

Oder dauerhaft in `helm/stadtpuls-potsdam/values.yaml` eintragen (siehe Kommentar bei
`env:`). Ohne gesetztes `BASE_PATH` verhält sich `server.js` exakt wie bisher
(Domain-Wurzel) - die Variable ist rein optional und ändert nichts am Standardbetrieb.
