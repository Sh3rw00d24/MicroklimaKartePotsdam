// Kartenlogik, Datenabruf und Diagramme für Stadtpuls Potsdam.
// Daten kommen live über server.js von der Urbanen Datenplattform Potsdam.

const HITZEWARNUNG_SCHWELLE_GRAD = 34;
const AUTOMATISCHE_AKTUALISIERUNG_MS = 5 * 60 * 1000;
const ANZAHL_FUER_AKTUELLEN_WERT = 20; // Puffer, um leere Datensätze überspringen zu können
const ANZAHL_FUER_VERLAUF = 10000;
const MAX_PLAUSIBLE_ABWEICHUNG_KM = 1.5; // gemeldete Sensor-Position weiter weg = wird ignoriert

const ZEITRAUM_IN_MILLISEKUNDEN = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    'alle': null
};

const HIMMELSRICHTUNGEN = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

let karte;
let interpolationsCanvas; // eigene Ebene für den Wetterkarten-Farbverlauf, siehe initialisiereWetterInterpolation()
let windPfeilEbene;
let markerNachStandortId = {};
let aktuelleWerteNachStandortId = {};
let verlaufCacheNachStandortId = {};
let diagrammInstanzenNachFeld = {};
let aktiveHitzewarnungen = new Set();

let ausgewaehlterStandort = null;
let offenerPopupStandortId = null;
let ausgewaehlterZeitraum = '24h';

document.addEventListener('DOMContentLoaded', () => {
    initialisiereKarte();
    erzeugeStandortMarker();
    initialisierePopupVerhalten();
    verknuepfeSteuerelemente();
    aktualisiereAlleAktuellenWerte();
    setInterval(aktualisiereAlleAktuellenWerte, AUTOMATISCHE_AKTUALISIERUNG_MS);
});

// --- Karte ---

// Baut Karte, Kachel-Layer, Wärme- und Windpfeil-Ebene auf.
function initialisiereKarte() {
    const kartenGrenzen = L.latLngBounds([[52.34, 12.94], [52.48, 13.17]]); // Potsdam + Rand

    karte = L.map('map', {
        zoomControl: true,
        scrollWheelZoom: false, // eigene Steuerung, siehe initialisiereScrollZoom()
        maxBounds: kartenGrenzen,
        maxBoundsViscosity: 0.8,
        minZoom: 12,
        maxZoom: 17
    }).setView([52.400, 13.06], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap-Mitwirkende',
        opacity: 0.8
    }).addTo(karte);

    initialisiereScrollZoom();
    initialisiereWetterInterpolation();
    windPfeilEbene = L.layerGroup().addTo(karte);

    karte.on('zoom', aktualisiereWindpfeilGroesse);
    karte.on('movestart zoomstart', schliesseStandortPopup);

    // Größe erst beim ersten Rendern oft falsch (Stylesheet noch nicht fertig) - neu vermessen.
    window.addEventListener('load', () => karte.invalidateSize());
    setTimeout(() => karte.invalidateSize(), 200);
}

// --- Wetterkarten-Farbverlauf ---
//
// Statt jeden Sensor als isolierten "Fleck" zu zeigen (wie eine klassische
// Dichte-Heatmap), wird hier für jeden Punkt auf der Karte ein Wert aus allen
// nahen Sensoren gewichtet gemittelt (Inverse-Distance-Weighting, das Standard-
// Verfahren für echte Wetterkarten) - Standorte zwischen zwei Sensoren zeigen so
// einen sinnvollen Übergangswert statt einer Lücke oder eines harten Randes.

// Eigenes <canvas> statt Leaflet-Layer, liegt in Leaflets overlayPane (zwischen
// Kacheln und Markern) und wird von Leaflet beim Verschieben automatisch mitbewegt.
function initialisiereWetterInterpolation() {
    interpolationsCanvas = L.DomUtil.create('canvas', 'wetter-interpolation', karte.getPane('overlayPane'));
    interpolationsCanvas.style.pointerEvents = 'none'; // Klicks müssen zu Markern/Karte durchgehen

    karte.on('moveend zoomend resize', positioniereUndZeichneInterpolation);
    positioniereUndZeichneInterpolation();
}

// Größe/Position an den aktuellen Kartenausschnitt anpassen, dann neu einfärben.
function positioniereUndZeichneInterpolation() {
    const groesse = karte.getSize();
    L.DomUtil.setPosition(interpolationsCanvas, karte.containerPointToLayerPoint([0, 0]));
    interpolationsCanvas.width = groesse.x;
    interpolationsCanvas.height = groesse.y;
    zeichneWetterInterpolation();
}

// Malt den Farbverlauf für die aktuell gewählte Metrik neu (grobes Raster aus
// Performance-Gründen - bei jeder Kartenbewegung oder jedem Datenupdate genug).
function zeichneWetterInterpolation() {
    const ctx = interpolationsCanvas.getContext('2d');
    const breite = interpolationsCanvas.width;
    const hoehe = interpolationsCanvas.height;
    ctx.clearRect(0, 0, breite, hoehe);
    if (breite === 0 || hoehe === 0) return;

    const metrik = KARTEN_METRIKEN[document.getElementById('metric-select').value];
    if (!metrik || metrik.nurPfeileKeineWaermekarte) return; // Windrichtung: nur Pfeile, keine Fläche

    // Dieselbe Wertespanne wie im Diagramm (achseMin/achseMax) - siehe Kommentar bei KARTEN_METRIKEN.
    const feldInfo = ermittleMessfeldInfo(metrik.feld);

    const canvasUrsprung = karte.containerPointToLayerPoint([0, 0]);
    const punkte = STANDORTE.map(standort => {
        const rohwert = leseAktuellenRohwert(standort, metrik.feld);
        if (rohwert === null) return null;
        const pixel = karte.latLngToLayerPoint([standort.lat, standort.lng]);
        return { x: pixel.x - canvasUrsprung.x, y: pixel.y - canvasUrsprung.y, wert: feldInfo.umrechnen(rohwert) };
    }).filter(Boolean);

    if (punkte.length === 0) return;

    const RASTER_PX = 14; // Zellengröße - grob genug fürs Tempo, fein genug für weiche Übergänge
    const REICHWEITE_PX = berechneReichweite(punkte); // Fläche pro Sensor an echten Abständen ausgerichtet, nicht fest

    for (let y = 0; y < hoehe; y += RASTER_PX) {
        for (let x = 0; x < breite; x += RASTER_PX) {
            let gewichtsSumme = 0;
            let wertSumme = 0;
            let naehesterAbstand = Infinity;

            for (const punkt of punkte) {
                const abstand = Math.hypot(x - punkt.x, y - punkt.y);
                if (abstand < naehesterAbstand) naehesterAbstand = abstand;
                // Potenz 3 statt 2: nahe am eigenen Sensor bleibt dessen Farbe klar erkennbar,
                // erst näher an der Mitte zum Nachbarn setzt der Übergang spürbar ein.
                const gewicht = 1 / Math.pow(Math.max(abstand, 1), 3);
                gewichtsSumme += gewicht;
                wertSumme += gewicht * punkt.wert;
            }

            if (naehesterAbstand > REICHWEITE_PX) continue; // zu weit von jedem Sensor weg

            const interpoliert = wertSumme / gewichtsSumme;
            const intensitaet = Math.max(0, Math.min(1, (interpoliert - feldInfo.achseMin) / (feldInfo.achseMax - feldInfo.achseMin)));
            const farbe = farbeAusVerlauf(metrik.farbverlauf, intensitaet);
            const deckkraft = 0.6 * (1 - naehesterAbstand / REICHWEITE_PX); // zum Rand hin ausblenden

            ctx.fillStyle = `rgba(${farbe.r}, ${farbe.g}, ${farbe.b}, ${deckkraft.toFixed(2)})`;
            ctx.fillRect(x, y, RASTER_PX, RASTER_PX);
        }
    }
}

// Wie weit sich ein Sensor sichtbar auf seine Umgebung auswirkt - richtet sich nach dem
// Abstand zu seinen echten Nachbarn, nicht nach einer festen Pixelzahl. Ohne das würde
// bei weit herausgezoomter Karte ein Sensor auch Gebiete weit entfernter Nachbarn
// einfärben und alles zu einer einzigen, gemittelten Farbe verschmelzen.
function berechneReichweite(punkte) {
    if (punkte.length <= 1) return 260;

    const nachbarAbstaende = punkte.map((punkt, i) => {
        let kleinster = Infinity;
        punkte.forEach((anderer, j) => {
            if (i === j) return;
            kleinster = Math.min(kleinster, Math.hypot(punkt.x - anderer.x, punkt.y - anderer.y));
        });
        return kleinster;
    }).sort((a, b) => a - b);

    const median = nachbarAbstaende[Math.floor(nachbarAbstaende.length / 2)];
    return Math.max(120, Math.min(500, median * 0.9));
}

// Interpoliert zwischen den Farbverlauf-Stützstellen (z. B. { 0.1: '#...', 0.7: '#...' })
// statt nur die nächstgelegene Stützstelle zu nehmen - dadurch entstehen weiche Farbübergänge.
function farbeAusVerlauf(farbverlauf, intensitaet) {
    const stopps = Object.keys(farbverlauf).map(Number).sort((a, b) => a - b);
    const wert = Math.max(stopps[0], Math.min(stopps[stopps.length - 1], intensitaet));

    for (let i = 0; i < stopps.length - 1; i++) {
        const von = stopps[i], bis = stopps[i + 1];
        if (wert < von || wert > bis) continue;
        const anteil = bis === von ? 0 : (wert - von) / (bis - von);
        const farbeVon = hexZuRgbZahlen(farbverlauf[von]);
        const farbeBis = hexZuRgbZahlen(farbverlauf[bis]);
        return {
            r: Math.round(farbeVon.r + (farbeBis.r - farbeVon.r) * anteil),
            g: Math.round(farbeVon.g + (farbeBis.g - farbeVon.g) * anteil),
            b: Math.round(farbeVon.b + (farbeBis.b - farbeVon.b) * anteil)
        };
    }
    return hexZuRgbZahlen(farbverlauf[stopps[stopps.length - 1]]);
}

// Legt für jeden Standort einen Marker mit Klick-Handler an.
function erzeugeStandortMarker() {
    STANDORTE.forEach(standort => {
        const istPlatzhalter = !standort.resourceId;
        const iconHtml = `<div class="marker-hitbox"><div class="dot-marker ${istPlatzhalter ? 'ist-platzhalter' : ''}" id="marker-${standort.id}"></div></div>`;
        const symbol = L.divIcon({ html: iconHtml, className: 'custom-leaflet-icon', iconSize: [34, 34], iconAnchor: [17, 17] });

        const marker = L.marker([standort.lat, standort.lng], { icon: symbol }).addTo(karte);

        marker.on('click', () => {
            ausgewaehlterStandort = standort;
            markiereAusgewaehltenMarker(standort.id);
            oeffnePopupFuerStandort(standort);
            zeigeStandortImDashboard(standort);
        });

        markerNachStandortId[standort.id] = marker;
    });
}

// Hebt den angeklickten Marker optisch hervor, alle anderen zurücksetzen.
function markiereAusgewaehltenMarker(standortId) {
    Object.keys(markerNachStandortId).forEach(id => {
        const element = document.getElementById(`marker-${id}`);
        if (element) element.classList.toggle('ist-ausgewaehlt', id === standortId);
    });
}

// Scroll über der Karte scrollt normal die Seite; nur Strg/Cmd+Scroll zoomt (wie eingebettetes Google Maps).
function initialisiereScrollZoom() {
    const mapElement = document.getElementById('map');
    let hinweisTimeout;

    mapElement.addEventListener('wheel', (ereignis) => {
        if (!ereignis.ctrlKey && !ereignis.metaKey) {
            const hinweis = document.getElementById('scroll-zoom-hinweis');
            hinweis.classList.add('sichtbar');
            clearTimeout(hinweisTimeout);
            hinweisTimeout = setTimeout(() => hinweis.classList.remove('sichtbar'), 1000);
            return; // kein preventDefault -> Seite scrollt normal weiter
        }

        ereignis.preventDefault();
        const punkt = karte.mouseEventToContainerPoint(ereignis);
        // Ganze Stufen: 0,5 würde JS-Rundung wegen konsequent aufrunden nie rauszoomen können.
        karte.setZoomAround(punkt, karte.getZoom() + (ereignis.deltaY < 0 ? 1 : -1));
    }, { passive: false });
}

// --- Bedienelemente ---

// Verdrahtet Metrik-Auswahl, Aktualisieren-Button, Zeitraum-Buttons und Diagramm-Klicks (delegiert).
function verknuepfeSteuerelemente() {
    document.getElementById('metric-select').addEventListener('change', aktualisiereKartenfarben);

    document.getElementById('btn-aktualisieren').addEventListener('click', async () => {
        const button = document.getElementById('btn-aktualisieren');
        button.disabled = true;
        if (ausgewaehlterStandort) {
            delete verlaufCacheNachStandortId[ausgewaehlterStandort.id];
        }
        await aktualisiereAlleAktuellenWerte();
        button.disabled = false;
    });

    document.querySelectorAll('.zeitraum-btn').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.zeitraum-btn').forEach(b => b.classList.remove('aktiv'));
            button.classList.add('aktiv');
            ausgewaehlterZeitraum = button.dataset.zeitraum;
            if (ausgewaehlterStandort && ausgewaehlterStandort.resourceId) {
                ladeUndZeigeVerlauf(ausgewaehlterStandort);
            }
        });
    });

    // Diagramm-Karten entstehen erst zur Laufzeit -> ein delegierter Handler für beide Buttons.
    document.getElementById('dashboard-tiles').addEventListener('click', (ereignis) => {
        const zoomButton = ereignis.target.closest('.zoom-reset-btn');
        if (zoomButton) {
            const instanz = diagrammInstanzenNachFeld[zoomButton.dataset.feld];
            if (instanz && typeof instanz.resetZoom === 'function') instanz.resetZoom();
            return;
        }

        const infoButton = ereignis.target.closest('.more-info-btn');
        if (infoButton) {
            ereignis.preventDefault();
            const zusatzInhalt = infoButton.closest('.chart-footer').nextElementSibling;
            if (!zusatzInhalt) return;
            const istOffen = zusatzInhalt.classList.toggle('aufgeklappt');
            const icon = infoButton.querySelector('.material-icons-round');
            if (icon) icon.innerText = istOffen ? 'remove_circle_outline' : 'add_circle_outline';
        }
    });
}

// --- Datenabruf ---

// Holt aktuelle Werte für alle Standorte und stößt Karte/Popup/Widgets/Dashboard-Refresh an.
async function aktualisiereAlleAktuellenWerte() {
    const standorteMitSensor = STANDORTE.filter(standort => standort.resourceId);

    await Promise.allSettled(standorteMitSensor.map(async (standort) => {
        const antwort = await holeMesswerte(standort.resourceId, ANZAHL_FUER_AKTUELLEN_WERT);

        if (!antwort.erfolgreich) {
            aktuelleWerteNachStandortId[standort.id] = { fehler: antwort.fehlermeldung };
            return;
        }

        const neuesterDatensatz = findeNeuestenGueltigenDatensatz(antwort.messwerte);
        const felder = antwort.felder.map(feld => feld.id).filter(feld => !TECHNISCHE_FELDER.includes(feld));

        aktuelleWerteNachStandortId[standort.id] = {
            zeitpunkt: neuesterDatensatz ? neuesterDatensatz.time : null,
            werte: neuesterDatensatz,
            felder
        };

        aktualisierePositionAusGeoPunkt(standort, neuesterDatensatz);
    }));

    aktualisiereVerbindungsstatus(standorteMitSensor);
    aktualisiereKartenfarben();
    aktualisiereOffenesPopup();
    aktualisiereLiveWidgets();
    zeigeLetzteAktualisierungszeit();

    if (ausgewaehlterStandort && ausgewaehlterStandort.resourceId) {
        aktualisiereAktuelleWerteImDashboard(ausgewaehlterStandort);
        delete verlaufCacheNachStandortId[ausgewaehlterStandort.id];
        ladeUndZeigeVerlauf(ausgewaehlterStandort);
    }
}

// Ruft den Server ab und normalisiert Feldnamen/Einheiten (Sensoren nennen Felder unterschiedlich).
async function holeMesswerte(resourceId, limit) {
    try {
        const antwort = await fetch(`/api/messwerte/${resourceId}?limit=${limit}`);
        const daten = await antwort.json();

        if (daten.erfolgreich) {
            daten.messwerte = daten.messwerte.map(normalisiereDatensatz);
            daten.felder = normalisiereFelderliste(daten.felder);
        }

        return daten;
    } catch (fehler) {
        return { erfolgreich: false, fehlermeldung: 'Keine Verbindung zum Server möglich.' };
    }
}

// Erster Datensatz mit echtem Inhalt (überspringt leere Fehlversuche der Station).
function findeNeuestenGueltigenDatensatz(messwerte) {
    for (const datensatz of messwerte) {
        const hatWert = Object.keys(datensatz).some(feld =>
            !TECHNISCHE_FELDER.includes(feld) && datensatz[feld] !== null && datensatz[feld] !== undefined
        );
        if (hatWert) return datensatz;
    }
    return messwerte[0] || null;
}

// Übernimmt die Sensor-Position (geo_point), verwirft aber unplausible Ausreißer (siehe MAX_PLAUSIBLE_ABWEICHUNG_KM).
function aktualisierePositionAusGeoPunkt(standort, datensatz) {
    if (!datensatz || !datensatz.geo_point) return;
    const teile = datensatz.geo_point.split(',').map(Number);
    if (teile.length !== 2 || teile.some(Number.isNaN)) return;

    const [lat, lng] = teile;

    const abweichungKm = entfernungInKm(standort.lat, standort.lng, lat, lng);
    if (abweichungKm > MAX_PLAUSIBLE_ABWEICHUNG_KM) {
        console.warn(`${standort.name}: gemeldete Position ist ${abweichungKm.toFixed(1)} km entfernt und wird ignoriert.`);
        return;
    }

    standort.lat = lat;
    standort.lng = lng;

    const marker = markerNachStandortId[standort.id];
    if (marker) marker.setLatLng([lat, lng]);
}

// Abstand in km (Äquirechteck-Näherung, für diese Distanzen genau genug).
function entfernungInKm(lat1, lng1, lat2, lng2) {
    const erdradiusKm = 6371;
    const deltaLatRad = (lat2 - lat1) * Math.PI / 180;
    const deltaLngRad = (lng2 - lng1) * Math.PI / 180;
    const mittlereBreiteRad = (lat1 + lat2) / 2 * Math.PI / 180;
    const x = deltaLngRad * Math.cos(mittlereBreiteRad);
    return Math.sqrt(x * x + deltaLatRad * deltaLatRad) * erdradiusKm;
}

// Zeigt den Verbindungshinweis, wenn kein einziger Sensor erreichbar war.
function aktualisiereVerbindungsstatus(standorteMitSensor) {
    if (standorteMitSensor.length === 0) return;

    const fehlermeldungen = standorteMitSensor
        .map(s => aktuelleWerteNachStandortId[s.id]?.fehler)
        .filter(Boolean);
    const alleFehlgeschlagen = fehlermeldungen.length === standorteMitSensor.length;

    document.getElementById('verbindungshinweis').classList.toggle('hidden', !alleFehlgeschlagen);
    if (alleFehlgeschlagen) {
        // holeMesswerte() liefert zwei ganz verschiedene Fehlerursachen: entweder ist
        // der eigene Server nicht erreichbar, oder er läuft, meldet aber, dass die
        // Datenplattform selbst gerade nicht antwortet - das ist kein lokales Problem,
        // ein Server-Neustart hilft in dem Fall nichts. Die Meldung soll das unterscheiden.
        const istServerErreichbar = fehlermeldungen[0].includes('Datenplattform');
        document.getElementById('verbindungshinweis-titel').innerText =
            istServerErreichbar ? 'Datenplattform nicht erreichbar' : 'Kein eigener Server erreichbar';
        document.getElementById('verbindungshinweis-text').innerText = istServerErreichbar
            ? `Die Urbane Datenplattform Potsdam antwortet gerade nicht (${fehlermeldungen[0]}). Das liegt nicht an diesem Server - bitte in ein paar Minuten erneut versuchen.`
            : 'Läuft der Server noch (npm start) und ist die Seite über http://localhost:3000 geöffnet - nicht als lokale Datei? Sobald die Verbindung wieder steht, füllt sich die Seite automatisch.';
    }

    const livePunkt = document.querySelector('.live-punkt');
    if (livePunkt) livePunkt.classList.toggle('getrennt', alleFehlgeschlagen);
}

// --- Karteneinfärbung, Windpfeile, Legende ---

// Färbt die Karte nach gewählter Metrik ein und zeichnet bei Wind zusätzlich Richtungspfeile.
function aktualisiereKartenfarben() {
    const ausgewaehlteMetrikId = document.getElementById('metric-select').value;
    const metrik = KARTEN_METRIKEN[ausgewaehlteMetrikId];

    const erklaerung = document.getElementById('metrik-erklaerung');
    if (erklaerung) erklaerung.innerText = metrik.erklaerung;

    windPfeilEbene.clearLayers();
    zeichneWetterInterpolation();

    if (ausgewaehlteMetrikId === 'wind' || ausgewaehlteMetrikId === 'wind_dir') {
        STANDORTE.forEach(standort => {
            const richtung = leseAktuellenRohwert(standort, 'Wind Direction Sensor');
            if (richtung === null) return;
            const pfeilSymbol = L.divIcon({
                html: `<div class="wind-arrow" data-dir="${richtung}"><svg viewBox="0 0 24 24"><path d="M12 2L16 10H13V22H11V10H8L12 2Z"/></svg></div>`,
                className: '', iconSize: [24, 24], iconAnchor: [12, 12]
            });
            // interactive:false, sonst blockiert der Pfeil den Klick auf den Marker darunter.
            L.marker([standort.lat, standort.lng], { icon: pfeilSymbol, interactive: false }).addTo(windPfeilEbene);
        });
    }

    aktualisiereWindpfeilGroesse();
    aktualisiereLegende(metrik);
    aktualisiereHitzewarnungen();
}

// Aktueller Rohwert eines Felds für einen Standort, oder null.
function leseAktuellenRohwert(standort, feldName) {
    const eintrag = aktuelleWerteNachStandortId[standort.id];
    if (!eintrag || !eintrag.werte) return null;
    const wert = eintrag.werte[feldName];
    return (wert === null || wert === undefined) ? null : wert;
}

// Skaliert die Windpfeile passend zur aktuellen Zoomstufe.
function aktualisiereWindpfeilGroesse() {
    const zoomstufe = karte.getZoom();
    const skalierung = 2.5 - ((zoomstufe - 13) * 0.5);
    document.querySelectorAll('.wind-arrow').forEach(element => {
        element.style.transform = `scale(${skalierung}) rotate(${element.dataset.dir}deg)`;
    });
}

// Aktualisiert Titel, Farbverlauf und Skalenbeschriftung der Kartenlegende.
function aktualisiereLegende(metrik) {
    document.getElementById('legend-title').innerText = metrik.legendentitel;

    // Windrichtung hat eine feste Beschriftung (Himmelsrichtungen); alle anderen
    // Metriken bekommen ihre Beschriftung aus derselben Spanne wie das Diagramm.
    const beschriftungen = metrik.nurPfeileKeineWaermekarte
        ? metrik.skalenBeschriftung
        : erzeugeSkalenBeschriftung(ermittleMessfeldInfo(metrik.feld));
    document.getElementById('legend-labels').innerHTML =
        beschriftungen.map(text => `<span>${text}</span>`).join('');

    const balken = document.getElementById('legend-bar');
    balken.style.background = metrik.nurPfeileKeineWaermekarte
        ? 'linear-gradient(to right, #cbd5e1, #211c3d, #cbd5e1)'
        : `linear-gradient(to right, ${Object.values(metrik.farbverlauf).join(', ')})`;
}

// Drei Beschriftungen (Minimum, Mitte, Maximum+) aus der festen Achsen-Spanne
// eines Messfelds - dieselben Zahlen, die auch die Diagramm-Achse begrenzen.
function erzeugeSkalenBeschriftung(feldInfo) {
    const mitte = Math.round((feldInfo.achseMin + feldInfo.achseMax) / 2);
    const formatieren = (wert) => wert.toLocaleString('de-DE');
    const maximum = feldInfo.hatFesteObergrenze ? formatieren(feldInfo.achseMax) : `${formatieren(feldInfo.achseMax)}+`;
    return [formatieren(feldInfo.achseMin), formatieren(mitte), maximum];
}

// --- Hitzewarnungen ---

// Markiert Standorte über der Hitzeschwelle und zeigt bei neuen Fällen einen Toast.
function aktualisiereHitzewarnungen() {
    let anzahl = 0;

    STANDORTE.forEach(standort => {
        const temperatur = leseAktuellenRohwert(standort, 'Air Temperature');
        const markerElement = document.getElementById(`marker-${standort.id}`);
        const istKritisch = typeof temperatur === 'number' && temperatur >= HITZEWARNUNG_SCHWELLE_GRAD;

        if (markerElement) markerElement.classList.toggle('is-alert', istKritisch);

        if (istKritisch) {
            anzahl++;
            if (!aktiveHitzewarnungen.has(standort.id)) {
                aktiveHitzewarnungen.add(standort.id);
                zeigeHitzewarnungsToast(standort, temperatur);
            }
        } else {
            aktiveHitzewarnungen.delete(standort.id);
        }
    });

    document.getElementById('widget-warnings').innerText = anzahl;
}

// Blendet eine Toast-Meldung für eine neue Hitzewarnung ein (verschwindet nach 6s).
function zeigeHitzewarnungsToast(standort, temperatur) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span class="material-icons-round" style="color:var(--accent-color);">warning</span> <span>Hitzewarnung: <b>${standort.name}</b> bei ${temperatur.toFixed(1)}°C!</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 400);
    }, 6000);
}

// --- Live-Kennzahlen ---

// Berechnet Ø-Temperatur, Ø-Wind und die Live-Anzahl für die Kacheln oben.
function aktualisiereLiveWidgets() {
    const temperaturen = [];
    const windgeschwindigkeitenKmh = [];

    STANDORTE.forEach(standort => {
        const temperatur = leseAktuellenRohwert(standort, 'Air Temperature');
        if (typeof temperatur === 'number') temperaturen.push(temperatur);

        const windInMeterProSekunde = leseAktuellenRohwert(standort, 'Wind Speed');
        if (typeof windInMeterProSekunde === 'number') windgeschwindigkeitenKmh.push(windInMeterProSekunde * 3.6);
    });

    animiereZahlwechsel(
        document.getElementById('widget-avg-temp'),
        temperaturen.length ? `${mittelwert(temperaturen).toFixed(1)} °C` : '-- °C'
    );
    animiereZahlwechsel(
        document.getElementById('widget-avg-wind'),
        windgeschwindigkeitenKmh.length ? `${mittelwert(windgeschwindigkeitenKmh).toFixed(1)} km/h` : '-- km/h'
    );

    const standorteMitSensor = STANDORTE.filter(s => s.resourceId);
    const standorteLive = standorteMitSensor.filter(s => !aktuelleWerteNachStandortId[s.id]?.fehler);
    animiereZahlwechsel(
        document.getElementById('widget-live-count'),
        `${standorteLive.length} / ${STANDORTE.length}`
    );
}

// Durchschnitt eines Zahlen-Arrays.
function mittelwert(zahlen) {
    return zahlen.reduce((summe, wert) => summe + wert, 0) / zahlen.length;
}

// Schreibt die aktuelle Uhrzeit in den Status-Bereich.
function zeigeLetzteAktualisierungszeit() {
    document.getElementById('letzte-aktualisierung').innerText =
        new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// Lässt eine angezeigte Zahl sanft zum neuen Wert hochlaufen statt zu springen; Text drumherum bleibt.
function animiereZahlwechsel(element, zielText) {
    const alterText = element.dataset.rohwert || element.innerText;
    const alteZahl = parseFloat(alterText.replace(',', '.'));
    const neueZahl = parseFloat(zielText.replace(',', '.'));

    if (Number.isNaN(alteZahl) || Number.isNaN(neueZahl) || alteZahl === neueZahl) {
        element.innerText = zielText;
        element.dataset.rohwert = zielText;
        return;
    }

    const nachkommateil = zielText.match(/[.,](\d+)/);
    const nachkommastellen = nachkommateil ? nachkommateil[1].length : 0;
    const suffix = zielText.replace(/^-?[\d.,]+/, '');
    const start = performance.now();
    const dauer = 500;

    function schritt(zeit) {
        const fortschritt = Math.min(1, (zeit - start) / dauer);
        const aktuellerWert = alteZahl + (neueZahl - alteZahl) * fortschritt;
        element.innerText = aktuellerWert.toFixed(nachkommastellen) + suffix;
        if (fortschritt < 1) {
            requestAnimationFrame(schritt);
        } else {
            element.dataset.rohwert = zielText;
        }
    }
    requestAnimationFrame(schritt);
}

// --- Standort-Popup (eigenes Element statt Leaflet-Popup, damit es nie am Kartenrand abgeschnitten wird) ---

// Verdrahtet Schließen-Button, Klick außerhalb, Escape sowie Scroll/Resize (schließen bzw. neu positionieren).
function initialisierePopupVerhalten() {
    const popupElement = document.getElementById('standort-popup');

    popupElement.addEventListener('click', (ereignis) => {
        if (ereignis.target.closest('.popup-schliessen')) schliesseStandortPopup();
    });

    document.addEventListener('click', (ereignis) => {
        if (!popupElement.classList.contains('ist-offen')) return;
        if (popupElement.contains(ereignis.target)) return;
        if (ereignis.target.closest('.marker-hitbox')) return;
        schliesseStandortPopup();
    });

    document.addEventListener('keydown', (ereignis) => {
        if (ereignis.key === 'Escape') schliesseStandortPopup();
    });

    window.addEventListener('scroll', schliesseStandortPopup, { passive: true });
    window.addEventListener('resize', positioniereStandortPopup);
}

// Öffnet und positioniert das Popup für einen Standort.
function oeffnePopupFuerStandort(standort) {
    offenerPopupStandortId = standort.id;
    const popupElement = document.getElementById('standort-popup');
    popupElement.innerHTML = erzeugePopupInhalt(standort);
    popupElement.classList.add('ist-offen');
    positioniereStandortPopup();
}

// Platziert das Popup neben seinem Marker, geklemmt auf den sichtbaren Bildschirmbereich.
function positioniereStandortPopup() {
    if (!offenerPopupStandortId) return;
    const marker = markerNachStandortId[offenerPopupStandortId];
    if (!marker) return;

    const popupElement = document.getElementById('standort-popup');
    const kartenRect = document.getElementById('map').getBoundingClientRect();
    const punkt = karte.latLngToContainerPoint(marker.getLatLng());
    const ankerX = kartenRect.left + punkt.x;
    const ankerY = kartenRect.top + punkt.y;
    const abstand = 20;
    const rand = 12;

    let links = ankerX - popupElement.offsetWidth / 2;
    let oben = ankerY - popupElement.offsetHeight - abstand;
    if (oben < rand) oben = ankerY + abstand; // passt nicht drüber, also drunter zeigen

    links = Math.max(rand, Math.min(links, window.innerWidth - popupElement.offsetWidth - rand));
    oben = Math.max(rand, Math.min(oben, window.innerHeight - popupElement.offsetHeight - rand));

    popupElement.style.left = `${links}px`;
    popupElement.style.top = `${oben}px`;
}

// Schließt das Popup.
function schliesseStandortPopup() {
    offenerPopupStandortId = null;
    document.getElementById('standort-popup').classList.remove('ist-offen');
}

// Aktualisiert den Inhalt des gerade offenen Popups (z. B. nach einem Live-Refresh).
function aktualisiereOffenesPopup() {
    if (!offenerPopupStandortId) return;
    const standort = STANDORTE.find(s => s.id === offenerPopupStandortId);
    if (!standort) return;
    document.getElementById('standort-popup').innerHTML = erzeugePopupInhalt(standort);
    positioniereStandortPopup();
}

// Kopfbereich des Popups: Titel + Schließen-Button.
function erzeugePopupCoverHtml(titel, zusatzKlasse) {
    return `
        <div class="popup-cover ${zusatzKlasse || ''}">
            <button class="popup-schliessen" type="button" aria-label="Schließen">
                <span class="material-icons-round">close</span>
            </button>
            <h3>${titel}</h3>
        </div>`;
}

// Baut den kompletten Popup-Inhalt: Platzhalter, Fehler/Ladezustand oder echte Messwerte.
function erzeugePopupInhalt(standort) {
    if (!standort.resourceId) {
        return `
            <div class="my-popup-inner">
                ${erzeugePopupCoverHtml(standort.name)}
                <div class="popup-body">
                    <div class="popup-status"><span class="status-badge bg-grau">Noch nicht angebunden</span></div>
                    <div class="popup-mini-desc">
                        Für diesen Standort ist bislang kein Sensor auf der Urbanen Datenplattform Potsdam
                        registriert. Sobald Messdaten verfügbar sind, erscheinen sie hier automatisch.
                    </div>
                </div>
            </div>`;
    }

    const eintrag = aktuelleWerteNachStandortId[standort.id];

    if (!eintrag || eintrag.fehler || !eintrag.werte) {
        return `
            <div class="my-popup-inner">
                ${erzeugePopupCoverHtml(standort.name)}
                <div class="popup-body">
                    <div class="popup-status"><span class="status-badge bg-grau">${eintrag?.fehler ? 'Fehler beim Laden' : 'Daten werden geladen …'}</span></div>
                    ${eintrag?.fehler ? `<div class="popup-mini-desc">${eintrag.fehler}</div>` : ''}
                </div>
            </div>`;
    }

    const temperatur = eintrag.werte['Air Temperature'];
    const istKritisch = typeof temperatur === 'number' && temperatur >= HITZEWARNUNG_SCHWELLE_GRAD;

    const messwertZeilen = eintrag.felder
        .map(feldName => erzeugePopupMesswertZeile(feldName, eintrag.werte[feldName]))
        .filter(Boolean)
        .join('');

    return `
        <div class="my-popup-inner">
            ${erzeugePopupCoverHtml(standort.name, istKritisch ? 'alert-cover' : '')}
            <div class="popup-body">
                <div class="popup-status">
                    <span class="status-badge ${istKritisch ? 'bg-red' : 'bg-green'}">${istKritisch ? 'Hitzewarnung' : 'Normal'}</span>
                    <span class="uhi-badge">Stand: ${formatiereZeitpunkt(eintrag.zeitpunkt)}</span>
                </div>
                <div class="popup-metrics">${messwertZeilen}</div>
                <a href="#dashboard-section" class="popup-btn" onclick="document.getElementById('dashboard-section').scrollIntoView({behavior: 'smooth'}); return false;">
                    Detaillierte Analyse ansehen <span class="material-icons-round" style="font-size:16px;">arrow_downward</span>
                </a>
            </div>
        </div>`;
}

// Eine Messwert-Zeile im Popup (Icon, Bezeichnung, formatierter Wert).
function erzeugePopupMesswertZeile(feldName, rohwert) {
    if (rohwert === null || rohwert === undefined) return '';
    const info = ermittleMessfeldInfo(feldName);
    return `
        <div class="popup-metric">
            <span class="popup-metric-label"><span class="material-icons-round" style="font-size:16px;">${info.icon}</span> ${info.bezeichnung}</span>
            <span class="popup-metric-val">${formatiereMesswert(feldName, rohwert)}</span>
        </div>`;
}

// Rohwert -> fertiger Anzeigetext (Einheit anhängen, Windrichtung als Himmelsrichtung).
function formatiereMesswert(feldName, rohwert) {
    const info = ermittleMessfeldInfo(feldName);
    const wert = info.umrechnen(rohwert);
    return feldName === 'Wind Direction Sensor'
        ? `${wert.toFixed(0)}° ${bestimmeHimmelsrichtung(wert)}`
        : `${wert.toFixed(info.nachkommastellen)}${info.einheit ? ' ' + info.einheit : ''}`;
}

// --- Standortanalyse (Diagrammbereich) ---

// Öffnet die Standortanalyse unten auf der Seite für den gewählten Standort.
function zeigeStandortImDashboard(standort) {
    const bereich = document.getElementById('dashboard-section');
    if (bereich.classList.contains('hidden')) {
        bereich.classList.remove('hidden');
        requestAnimationFrame(() => requestAnimationFrame(() => bereich.classList.add('eingeblendet')));
    }

    document.getElementById('dash-title-name').innerText = standort.name;
    document.getElementById('dash-warning-box').classList.add('hidden');

    const quelleLink = document.getElementById('dash-quelle-link');
    quelleLink.classList.toggle('hidden', !standort.datenquelleUrl);
    if (standort.datenquelleUrl) quelleLink.href = standort.datenquelleUrl;

    if (!standort.resourceId) {
        document.getElementById('dash-desc').innerText =
            'Für diesen Standort ist noch kein Sensor an die Datenplattform angebunden. Sobald Messdaten verfügbar sind, erscheint hier automatisch für jeden gesendeten Wert ein eigenes Diagramm.';
        document.getElementById('verlauf-spanne').innerText = '';
        loescheAlleDiagramme();
        document.getElementById('dashboard-tiles').innerHTML = erzeugeGlossarKarteHtml();
        return;
    }

    document.getElementById('dash-desc').innerText = 'Daten werden geladen …';
    aktualisiereAktuelleWerteImDashboard(standort);
    ladeUndZeigeVerlauf(standort);
}

// Aktualisiert Aktuell-Werte und Hitzewarnung im Dashboard, ohne die Diagramme neu zu zeichnen.
function aktualisiereAktuelleWerteImDashboard(standort) {
    const eintrag = aktuelleWerteNachStandortId[standort.id];
    if (!eintrag || !eintrag.werte) return;

    document.getElementById('dash-desc').innerText =
        `Live-Messwerte dieser Wetterstation. Letzte Aktualisierung: ${formatiereZeitpunkt(eintrag.zeitpunkt)}.`;

    eintrag.felder.forEach(feldName => {
        const spanElement = document.getElementById(`curr-val-${feldIdFuerDom(feldName)}`);
        if (!spanElement) return;

        const rohwert = eintrag.werte[feldName];
        if (rohwert === null || rohwert === undefined) {
            spanElement.innerText = '--';
            return;
        }
        animiereZahlwechsel(spanElement, formatiereMesswert(feldName, rohwert));
    });

    const temperatur = eintrag.werte['Air Temperature'];
    const warnBox = document.getElementById('dash-warning-box');
    if (typeof temperatur === 'number' && temperatur >= HITZEWARNUNG_SCHWELLE_GRAD) {
        warnBox.classList.remove('hidden');
        document.getElementById('dash-warning-text').innerText =
            `An diesem Standort wurden ${temperatur.toFixed(1)} °C gemessen – das liegt über der Schwelle von ${HITZEWARNUNG_SCHWELLE_GRAD} °C, ab der hier von einer bioklimatischen Belastung ausgegangen wird.`;
    } else {
        warnBox.classList.add('hidden');
    }
}

// Lädt (oder nutzt gecachte) Messhistorie, filtert nach Zeitraum und zeichnet alle Diagramme.
async function ladeUndZeigeVerlauf(standort) {
    let zwischengespeichert = verlaufCacheNachStandortId[standort.id];

    if (!zwischengespeichert) {
        zeigeLadePlatzhalter();
        const antwort = await holeMesswerte(standort.resourceId, ANZAHL_FUER_VERLAUF);
        if (!antwort.erfolgreich) {
            document.getElementById('dash-desc').innerText = `Verlaufsdaten konnten nicht geladen werden: ${antwort.fehlermeldung}`;
            return;
        }
        zwischengespeichert = {
            messwerte: antwort.messwerte,
            felder: antwort.felder.map(feld => feld.id).filter(feld => !TECHNISCHE_FELDER.includes(feld))
        };
        verlaufCacheNachStandortId[standort.id] = zwischengespeichert;
    }

    const grenzeInMs = ZEITRAUM_IN_MILLISEKUNDEN[ausgewaehlterZeitraum];
    const jetzt = Date.now();
    const gefiltert = grenzeInMs
        ? zwischengespeichert.messwerte.filter(datensatz => (jetzt - new Date(datensatz.time).getTime()) <= grenzeInMs)
        : zwischengespeichert.messwerte;

    const chronologisch = [...gefiltert].reverse(); // CKAN liefert neueste zuerst, Diagramme brauchen chronologisch
    zeigeVerlaufsSpanne(chronologisch);

    const felderMitDaten = zwischengespeichert.felder.filter(feldName =>
        chronologisch.some(datensatz => datensatz[feldName] !== null && datensatz[feldName] !== undefined)
    );

    erzeugeDiagrammKarten(felderMitDaten);
    aktualisiereAktuelleWerteImDashboard(standort);
    zeichneDiagramme(felderMitDaten, chronologisch);
}

// Zeigt an, wie viele Messungen im gewählten Zeitraum stecken und von wann bis
// wann sie reichen - macht sichtbar, wenn "Gesamter Zeitraum" schlicht noch
// nicht viel mehr hergibt als 24 Stunden, weil der Sensor erst kurz läuft.
function zeigeVerlaufsSpanne(chronologischeDaten) {
    const element = document.getElementById('verlauf-spanne');
    if (!element) return;

    if (chronologischeDaten.length === 0) {
        element.innerText = 'Keine Messungen im gewählten Zeitraum.';
        return;
    }

    const anzahl = chronologischeDaten.length;
    const von = formatiereZeitpunkt(chronologischeDaten[0].time);
    const bis = formatiereZeitpunkt(chronologischeDaten[anzahl - 1].time);
    element.innerText = `${anzahl} Messungen, von ${von} bis ${bis}.`;
}

// Zeigt einen Lade-Hinweis, während die Historie vom Server kommt.
function zeigeLadePlatzhalter() {
    loescheAlleDiagramme();
    document.getElementById('dashboard-tiles').innerHTML = `
        <div class="chart-card">
            <div class="lade-platzhalter"><span class="material-icons-round">progress_activity</span> Messhistorie wird geladen …</div>
        </div>`;
}

// Baut pro Messwert eine Diagramm-Karte (HTML-Gerüst, Chart.js folgt in zeichneDiagramme).
function erzeugeDiagrammKarten(felder) {
    loescheAlleDiagramme();
    const container = document.getElementById('dashboard-tiles');

    if (felder.length === 0) {
        container.innerHTML = `
            <div class="chart-card">
                <h3 class="chart-title">Keine Messwerte im gewählten Zeitraum</h3>
                <p class="chart-desc">Für diesen Standort liegen im gewählten Betrachtungszeitraum keine auswertbaren Daten vor. Bitte einen größeren Zeitraum wählen.</p>
            </div>
            ${erzeugeGlossarKarteHtml()}`;
        return;
    }

    const karten = felder.map(feldName => {
        const info = ermittleMessfeldInfo(feldName);
        const domId = feldIdFuerDom(feldName);
        const istWindrose = info.diagrammTyp === 'windrose';

        return `
            <div class="chart-card">
                <div class="chart-card__header">
                    <div>
                        <span class="chart-tag">${info.tag}</span>
                        <h3 class="chart-title">${info.titel}</h3>
                    </div>
                    <div class="current-val-box">
                        <span class="c-val-label">Aktuell</span>
                        <span class="c-val-number" id="curr-val-${domId}" style="color: ${info.farbe};">--</span>
                    </div>
                </div>
                <p class="chart-desc">${info.kurzbeschreibung}</p>
                <div class="chart-wrapper">
                    ${istWindrose ? '' : `<button type="button" class="zoom-reset-btn" data-feld="${feldName}" title="Zoom zurücksetzen"><span class="material-icons-round">restart_alt</span></button>`}
                    <canvas id="chart-${domId}"></canvas>
                </div>
                <div class="chart-footer">
                    <a href="#" class="more-info-btn">Mehr erfahren <span class="material-icons-round">add_circle_outline</span></a>
                </div>
                <div class="more-info-content">
                    <p><strong>Interpretation:</strong> ${info.interpretation}</p>
                    <p style="margin-top: 8px;"><strong>Handlungsempfehlung:</strong> ${info.empfehlung}</p>
                </div>
            </div>`;
    }).join('');

    container.innerHTML = karten + erzeugeGlossarKarteHtml();
}

// Zeichnet für jedes Feld das passende Diagramm (Zeitreihe oder Windrose).
function zeichneDiagramme(felder, chronologischeDaten) {
    Chart.defaults.font.family = "'Titillium Web', sans-serif";
    Chart.defaults.color = '#334155';

    const beschriftungen = chronologischeDaten.map(datensatz => formatiereZeitpunktFuerAchse(datensatz.time));

    felder.forEach(feldName => {
        const canvas = document.getElementById(`chart-${feldIdFuerDom(feldName)}`);
        if (!canvas) return;

        const info = ermittleMessfeldInfo(feldName);
        diagrammInstanzenNachFeld[feldName] = info.diagrammTyp === 'windrose'
            ? zeichneWindrose(canvas, chronologischeDaten)
            : zeichneZeitreihe(canvas, feldName, beschriftungen, chronologischeDaten);
    });
}

// Linien-/Balkendiagramm mit Zoom/Pan für einen Messwert über die Zeit.
// Einheitliches Tooltip-Aussehen für alle Diagramme (dunkle Karte statt Chart.js-Standard-Weiß).
const DIAGRAMM_TOOLTIP_STIL = {
    backgroundColor: '#211c3d',
    titleFont: { family: "'Titillium Web', sans-serif", weight: '700', size: 13 },
    bodyFont: { family: "'Titillium Web', sans-serif", size: 12 },
    padding: 10,
    cornerRadius: 4,
    displayColors: false
};

// Sanfter Verlauf von der Linienfarbe zu transparent - deckungsgleiche Alternative
// zur früheren flachen Füllfarbe, wirkt weniger nach Tabellenkalkulation.
function erzeugeVerlaufsFuellung(context, hexFarbe) {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return hexZuRgba(hexFarbe, 0.15);
    const verlauf = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    verlauf.addColorStop(0, hexZuRgba(hexFarbe, 0.3));
    verlauf.addColorStop(1, hexZuRgba(hexFarbe, 0.02));
    return verlauf;
}

function zeichneZeitreihe(canvas, feldName, beschriftungen, chronologischeDaten) {
    const info = ermittleMessfeldInfo(feldName);
    const werte = chronologischeDaten.map(datensatz => {
        const rohwert = datensatz[feldName];
        return (rohwert === null || rohwert === undefined) ? null : info.umrechnen(rohwert);
    });

    // Viele Punkte (z. B. "Gesamter Zeitraum"): keine Animation - sonst lahmt das Rendern.
    const vieleDatenpunkte = werte.length > 300;
    const istBalken = info.diagrammTyp === 'bar';

    return new Chart(canvas.getContext('2d'), {
        type: info.diagrammTyp,
        data: {
            labels: beschriftungen,
            datasets: [{
                data: werte,
                borderColor: info.farbe,
                backgroundColor: istBalken ? info.farbe : (context) => erzeugeVerlaufsFuellung(context, info.farbe),
                // 'start' füllt bis zum unteren Rand der festen Skala, nicht bis zur Null-Linie -
                // bei z. B. -10 bis 40°C wäre eine Füllung bis 0°C sonst ein irreführend großer Klecks.
                fill: istBalken ? false : 'start',
                borderRadius: istBalken ? 4 : 0,
                cubicInterpolationMode: 'monotone',
                spanGaps: true, // Lücken unterbrechen die Linie nicht
                // Durchgehende Linie statt Punktkette: Punkte bleiben unsichtbar, außer beim Hovern.
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: info.farbe,
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 1.5,
                borderWidth: vieleDatenpunkte ? 1.5 : 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: vieleDatenpunkte ? false : { duration: 400 },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                legend: { display: false }, // Kartentitel sagt schon, was gezeigt wird - Legende wäre doppelt
                tooltip: {
                    ...DIAGRAMM_TOOLTIP_STIL,
                    callbacks: {
                        label: (context) => `${context.formattedValue}${info.einheit ? ' ' + info.einheit : ''}`
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
                    limits: { x: { minRange: 4 } }
                }
            },
            scales: {
                x: {
                    ticks: { maxTicksLimit: 6, color: '#94a3b8', font: { size: 11 } },
                    grid: { display: false }
                },
                y: {
                    // Feste, realistische Skala statt automatischer Anpassung an die Datenspanne -
                    // sonst wirkt eine kleine Schwankung optisch wie ein dramatischer Ausschlag.
                    min: info.achseMin,
                    max: info.achseMax,
                    ticks: { color: '#94a3b8', font: { size: 11 } },
                    grid: { color: '#f1f5f9' }
                }
            }
        }
    });
}

// Windrose statt Zeitreihe: Häufigkeit pro Himmelsrichtung im gewählten Zeitraum.
function zeichneWindrose(canvas, chronologischeDaten) {
    const haeufigkeiten = new Array(16).fill(0);
    let gesamtAnzahl = 0;

    chronologischeDaten.forEach(datensatz => {
        const grad = datensatz['Wind Direction Sensor'];
        if (grad === null || grad === undefined) return;
        haeufigkeiten[Math.round(grad / 22.5) % 16]++;
        gesamtAnzahl++;
    });

    return new Chart(canvas.getContext('2d'), {
        type: 'polarArea',
        data: {
            labels: HIMMELSRICHTUNGEN,
            datasets: [{
                data: haeufigkeiten,
                backgroundColor: 'rgba(33, 28, 61, 0.55)',
                borderColor: '#211c3d',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { r: { ticks: { display: false }, grid: { color: 'rgba(148, 163, 184, 0.35)' } } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...DIAGRAMM_TOOLTIP_STIL,
                    callbacks: {
                        label: (context) => {
                            const anteil = gesamtAnzahl ? Math.round((context.raw / gesamtAnzahl) * 100) : 0;
                            return `${context.label}: ${context.raw} Messungen (${anteil} %)`;
                        }
                    }
                }
            }
        }
    });
}

// Zerstört alle offenen Chart.js-Instanzen (vor jedem Neuaufbau nötig).
function loescheAlleDiagramme() {
    Object.values(diagrammInstanzenNachFeld).forEach(instanz => instanz.destroy());
    diagrammInstanzenNachFeld = {};
}

// Feste Glossar-Karte, die am Ende jeder Standortanalyse steht.
function erzeugeGlossarKarteHtml() {
    return `
        <div class="chart-card glossary-card-wrapper">
            <h3 class="chart-title" style="margin-bottom: 20px;">Klimatologisches Glossar</h3>
            <div class="glossary-items">
                <div class="g-item">
                    <h4>Wärmeinseleffekt (UHI)</h4>
                    <p>Urban Heat Island. Beschreibt die thermische Anomalie, dass hochversiegelte städtische Räume signifikant wärmer sind als ihr Umland, bedingt durch die hohe Wärmekapazität von Baumaterialien.</p>
                </div>
                <div class="g-item">
                    <h4>Tropennächte</h4>
                    <p>Meteorologischer Parameter für Nächte, in denen das Temperaturminimum 20 °C nicht unterschreitet. Führt zu Hitzestress, da die nächtliche Regeneration blockiert wird.</p>
                </div>
                <div class="g-item">
                    <h4>Kaltluftleitbahnen</h4>
                    <p>Vegetativ unversiegelte Korridore mit geringer Oberflächenrauigkeit (Flusstäler, breite Trassen), die den Transport von nächtlicher Kaltluft in aufgeheizte Stadtquartiere ermöglichen.</p>
                </div>
            </div>
        </div>`;
}

// --- Kleinkram ---

// Feldname -> sichere HTML-ID.
function feldIdFuerDom(feldName) {
    return feldName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// Gradzahl -> Himmelsrichtung.
function bestimmeHimmelsrichtung(gradzahl) {
    return HIMMELSRICHTUNGEN[Math.round(gradzahl / 22.5) % 16];
}

// Zeitstempel -> lesbares deutsches Datum mit Uhrzeit.
function formatiereZeitpunkt(zeitpunktText) {
    if (!zeitpunktText) return '–';
    const datum = new Date(zeitpunktText);
    if (Number.isNaN(datum.getTime())) return zeitpunktText;
    return datum.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}

// Zeitstempel -> kurze Achsenbeschriftung für Diagramme.
function formatiereZeitpunktFuerAchse(zeitpunktText) {
    return new Date(zeitpunktText).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Hex-Farbe -> rgba() mit gegebener Deckkraft.
function hexZuRgbZahlen(hexFarbe) {
    const zahl = parseInt(hexFarbe.slice(1), 16);
    return { r: (zahl >> 16) & 255, g: (zahl >> 8) & 255, b: zahl & 255 };
}

function hexZuRgba(hexFarbe, deckkraft) {
    const { r, g, b } = hexZuRgbZahlen(hexFarbe);
    return `rgba(${r}, ${g}, ${b}, ${deckkraft})`;
}
