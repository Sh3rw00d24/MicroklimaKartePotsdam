// Stadtpuls Potsdam – Kartenlogik, Datenabruf und Diagramme.
// Holt sich alles über den lokalen Server (server.js), der wiederum die
// Urbane Datenplattform Potsdam anspricht. Keine simulierten Werte.

// leaflet.heat stolpert gelegentlich, wenn die Karte bewegt wird während die
// Wärmeebene kaum Punkte zeigt (IndexSizeError in ihrer internen draw()-Funktion).
// Ein einzelner fehlgeschlagener Zeichendurchgang ist harmlos, darf aber nicht die
// Seite lahmlegen - deshalb wird die Funktion hier robust gemacht, bevor irgendwas
// anderes läuft.
if (window.L && L.HeatLayer && L.HeatLayer.prototype._redraw) {
    const urspruenglichesRedraw = L.HeatLayer.prototype._redraw;
    L.HeatLayer.prototype._redraw = function (...args) {
        try {
            return urspruenglichesRedraw.apply(this, args);
        } catch (fehler) {
            console.warn('Wärmekarte: Zeichenvorgang übersprungen.', fehler);
        }
    };
}

const HITZEWARNUNG_SCHWELLE_GRAD = 34;
const AUTOMATISCHE_AKTUALISIERUNG_MS = 5 * 60 * 1000;
const ANZAHL_FUER_AKTUELLEN_WERT = 20; // mehr als 1, um einen leeren Datensatz überspringen zu können
const ANZAHL_FUER_VERLAUF = 10000;

const ZEITRAUM_IN_MILLISEKUNDEN = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    'alle': null
};

const HIMMELSRICHTUNGEN = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

let karte;
let hitzeKarte;
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

// --- Karte ---------------------------------------------------------------

function initialisiereKarte() {
    // Etwas großzügiger geschnitten als der reine Stadtkern, damit Krampnitz im
    // Norden und der Campus Golm im Westen noch mit drauf sind.
    const kartenGrenzen = L.latLngBounds([[52.34, 12.94], [52.48, 13.17]]);

    karte = L.map('map', {
        zoomControl: true,
        maxBounds: kartenGrenzen,
        maxBoundsViscosity: 0.8,
        minZoom: 12,
        maxZoom: 17
    }).setView([52.400, 13.06], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap-Mitwirkende',
        opacity: 0.8
    }).addTo(karte);

    try {
        hitzeKarte = L.heatLayer([], { radius: 70, blur: 50, maxZoom: 13, maxOpacity: 0.4 }).addTo(karte);
    } catch (fehler) {
        console.warn('Wärmekarte konnte nicht sofort initialisiert werden:', fehler);
        hitzeKarte = L.heatLayer([], { radius: 70, blur: 50, maxZoom: 13, maxOpacity: 0.4 });
    }
    windPfeilEbene = L.layerGroup().addTo(karte);

    karte.on('zoom', aktualisiereWindpfeilGroesse);
    karte.on('movestart zoomstart', schliesseStandortPopup);

    // Falls die Karte beim ersten Rendern noch keine korrekte Größe kennt (z. B.
    // weil das Stylesheet einen Moment länger lädt), hier nochmal nachmessen.
    window.addEventListener('load', () => karte.invalidateSize());
    setTimeout(() => karte.invalidateSize(), 200);
}

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

function markiereAusgewaehltenMarker(standortId) {
    Object.keys(markerNachStandortId).forEach(id => {
        const element = document.getElementById(`marker-${id}`);
        if (element) element.classList.toggle('ist-ausgewaehlt', id === standortId);
    });
}

// --- Bedienelemente --------------------------------------------------------

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

    // Diagramm-Karten (Mehr-erfahren-Links, Zoom-zurücksetzen) entstehen erst zur
    // Laufzeit, daher ein einziger delegierter Klick-Beobachter für beides.
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

// --- Aktuelle Werte holen (Karte, Popup, Live-Kennzahlen) -----------------

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

async function holeMesswerte(resourceId, limit) {
    try {
        const antwort = await fetch(`/api/messwerte/${resourceId}?limit=${limit}`);
        return await antwort.json();
    } catch (fehler) {
        return { erfolgreich: false, fehlermeldung: 'Keine Verbindung zum Server möglich.' };
    }
}

// CKAN liefert neueste Datensätze zuerst, manche davon aber komplett leer (ein
// fehlgeschlagener Sendeversuch der Station). Hier wird der erste Datensatz mit
// tatsächlichem Inhalt gesucht.
function findeNeuestenGueltigenDatensatz(messwerte) {
    for (const datensatz of messwerte) {
        const hatWert = Object.keys(datensatz).some(feld =>
            !TECHNISCHE_FELDER.includes(feld) && datensatz[feld] !== null && datensatz[feld] !== undefined
        );
        if (hatWert) return datensatz;
    }
    return messwerte[0] || null;
}

// Übernimmt die vom Sensor gemeldete Position als tatsächliche Markerposition,
// statt sich auf die geschätzte Koordinate aus config.js zu verlassen.
function aktualisierePositionAusGeoPunkt(standort, datensatz) {
    if (!datensatz || !datensatz.geo_point) return;
    const teile = datensatz.geo_point.split(',').map(Number);
    if (teile.length !== 2 || teile.some(Number.isNaN)) return;

    const [lat, lng] = teile;
    standort.lat = lat;
    standort.lng = lng;

    const marker = markerNachStandortId[standort.id];
    if (marker) marker.setLatLng([lat, lng]);
}

function aktualisiereVerbindungsstatus(standorteMitSensor) {
    if (standorteMitSensor.length === 0) return;

    const alleFehlgeschlagen = standorteMitSensor.every(s => aktuelleWerteNachStandortId[s.id]?.fehler);
    document.getElementById('verbindungshinweis').classList.toggle('hidden', !alleFehlgeschlagen);

    const livePunkt = document.querySelector('.live-punkt');
    if (livePunkt) livePunkt.classList.toggle('getrennt', alleFehlgeschlagen);
}

// --- Karteneinfärbung, Windpfeile, Legende --------------------------------

function aktualisiereKartenfarben() {
    const ausgewaehlteMetrikId = document.getElementById('metric-select').value;
    const metrik = KARTEN_METRIKEN[ausgewaehlteMetrikId];

    const erklaerung = document.getElementById('metrik-erklaerung');
    if (erklaerung) erklaerung.innerText = metrik.erklaerung;

    windPfeilEbene.clearLayers();

    try {
        if (!karte.hasLayer(hitzeKarte)) hitzeKarte.addTo(karte);
        if (metrik.nurPfeileKeineWaermekarte) {
            hitzeKarte.setLatLngs([]);
        } else {
            const heatPunkte = [];
            STANDORTE.forEach(standort => {
                const rohwert = leseAktuellenRohwert(standort, metrik.feld);
                if (rohwert === null) return;
                const wert = metrik.umrechnen ? metrik.umrechnen(rohwert) : rohwert;
                const intensitaet = Math.max(0, Math.min(1, (wert - metrik.min) / (metrik.max - metrik.min)));
                heatPunkte.push([standort.lat, standort.lng, intensitaet]);
            });
            hitzeKarte.setLatLngs(heatPunkte);
            hitzeKarte.setOptions({ gradient: metrik.farbverlauf });
        }
    } catch (fehler) {
        console.warn('Wärmekarte konnte nicht neu gezeichnet werden:', fehler);
    }

    if (ausgewaehlteMetrikId === 'wind' || ausgewaehlteMetrikId === 'wind_dir') {
        STANDORTE.forEach(standort => {
            const richtung = leseAktuellenRohwert(standort, 'Wind Direction Sensor');
            if (richtung === null) return;
            const pfeilSymbol = L.divIcon({
                html: `<div class="wind-arrow" data-dir="${richtung}"><svg viewBox="0 0 24 24"><path d="M12 2L16 10H13V22H11V10H8L12 2Z"/></svg></div>`,
                className: '', iconSize: [24, 24], iconAnchor: [12, 12]
            });
            L.marker([standort.lat, standort.lng], { icon: pfeilSymbol }).addTo(windPfeilEbene);
        });
    }

    aktualisiereWindpfeilGroesse();
    aktualisiereLegende(metrik);
    aktualisiereHitzewarnungen();
}

function leseAktuellenRohwert(standort, feldName) {
    const eintrag = aktuelleWerteNachStandortId[standort.id];
    if (!eintrag || !eintrag.werte) return null;
    const wert = eintrag.werte[feldName];
    return (wert === null || wert === undefined) ? null : wert;
}

function aktualisiereWindpfeilGroesse() {
    const zoomstufe = karte.getZoom();
    const skalierung = 2.5 - ((zoomstufe - 13) * 0.5);
    document.querySelectorAll('.wind-arrow').forEach(element => {
        element.style.transform = `scale(${skalierung}) rotate(${element.dataset.dir}deg)`;
    });
}

function aktualisiereLegende(metrik) {
    document.getElementById('legend-title').innerText = metrik.legendentitel;
    document.getElementById('legend-labels').innerHTML =
        metrik.skalenBeschriftung.map(text => `<span>${text}</span>`).join('');

    const balken = document.getElementById('legend-bar');
    balken.style.background = metrik.nurPfeileKeineWaermekarte
        ? 'linear-gradient(to right, #cbd5e1, #211c3d, #cbd5e1)'
        : `linear-gradient(to right, ${Object.values(metrik.farbverlauf).join(', ')})`;
}

// --- Hitzewarnungen --------------------------------------------------------

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

// --- Live-Kennzahlen Seitenleiste ------------------------------------------

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
}

function mittelwert(zahlen) {
    return zahlen.reduce((summe, wert) => summe + wert, 0) / zahlen.length;
}

function zeigeLetzteAktualisierungszeit() {
    document.getElementById('letzte-aktualisierung').innerText =
        new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// Lässt eine angezeigte Zahl sanft zum neuen Wert hochlaufen statt abrupt zu
// springen. Text drumherum (Einheit, Himmelsrichtung) bleibt unangetastet.
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

// --- Standort-Popup ---------------------------------------------------------
//
// Bewusst kein natives Leaflet-Popup: Leaflet schneidet Popups am Rand des
// Kartencontainers ab, und bei acht Messwerten passte die Karte oft nicht mehr
// vollständig hinein. Diese Version hängt als eigenes Element direkt am body
// und wird per JavaScript neben den angeklickten Marker positioniert - sie kann
// also nie von der Karte beschnitten werden.

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

function oeffnePopupFuerStandort(standort) {
    offenerPopupStandortId = standort.id;
    const popupElement = document.getElementById('standort-popup');
    popupElement.innerHTML = erzeugePopupInhalt(standort);
    popupElement.classList.add('ist-offen');
    positioniereStandortPopup();
}

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

function schliesseStandortPopup() {
    offenerPopupStandortId = null;
    document.getElementById('standort-popup').classList.remove('ist-offen');
}

function aktualisiereOffenesPopup() {
    if (!offenerPopupStandortId) return;
    const standort = STANDORTE.find(s => s.id === offenerPopupStandortId);
    if (!standort) return;
    document.getElementById('standort-popup').innerHTML = erzeugePopupInhalt(standort);
    positioniereStandortPopup();
}

function erzeugePopupCoverHtml(titel, zusatzKlasse) {
    return `
        <div class="popup-cover ${zusatzKlasse || ''}">
            <button class="popup-schliessen" type="button" aria-label="Schließen">
                <span class="material-icons-round">close</span>
            </button>
            <h3>${titel}</h3>
        </div>`;
}

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

function erzeugePopupMesswertZeile(feldName, rohwert) {
    if (rohwert === null || rohwert === undefined) return '';

    const info = ermittleMessfeldInfo(feldName);
    const wert = info.umrechnen(rohwert);
    const anzeigeText = feldName === 'Wind Direction Sensor'
        ? `${wert.toFixed(0)}° (${bestimmeHimmelsrichtung(wert)})`
        : `${wert.toFixed(info.nachkommastellen)}${info.einheit ? ' ' + info.einheit : ''}`;

    return `
        <div class="popup-metric">
            <span class="popup-metric-label"><span class="material-icons-round" style="font-size:16px;">${info.icon}</span> ${info.bezeichnung}</span>
            <span class="popup-metric-val">${anzeigeText}</span>
        </div>`;
}

// --- Standortanalyse (Diagrammbereich) --------------------------------------

function zeigeStandortImDashboard(standort) {
    const bereich = document.getElementById('dashboard-section');
    if (bereich.classList.contains('hidden')) {
        bereich.classList.remove('hidden');
        requestAnimationFrame(() => requestAnimationFrame(() => bereich.classList.add('eingeblendet')));
    }

    document.getElementById('dash-title-name').innerText = standort.name;
    document.getElementById('dash-warning-box').classList.add('hidden');

    if (!standort.resourceId) {
        document.getElementById('dash-desc').innerText =
            'Für diesen Standort ist noch kein Sensor an die Datenplattform angebunden. Sobald Messdaten verfügbar sind, erscheint hier automatisch für jeden gesendeten Wert ein eigenes Diagramm.';
        loescheAlleDiagramme();
        document.getElementById('dashboard-tiles').innerHTML = erzeugeGlossarKarteHtml();
        return;
    }

    document.getElementById('dash-desc').innerText = 'Daten werden geladen …';
    aktualisiereAktuelleWerteImDashboard(standort);
    ladeUndZeigeVerlauf(standort);
}

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

        const info = ermittleMessfeldInfo(feldName);
        const wert = info.umrechnen(rohwert);
        const anzeigeText = feldName === 'Wind Direction Sensor'
            ? `${wert.toFixed(0)}° ${bestimmeHimmelsrichtung(wert)}`
            : `${wert.toFixed(info.nachkommastellen)}${info.einheit ? ' ' + info.einheit : ''}`;
        animiereZahlwechsel(spanElement, anzeigeText);
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

    // CKAN liefert neueste zuerst, für die Diagramme wird chronologisch gebraucht.
    const chronologisch = [...gefiltert].reverse();

    const felderMitDaten = zwischengespeichert.felder.filter(feldName =>
        chronologisch.some(datensatz => datensatz[feldName] !== null && datensatz[feldName] !== undefined)
    );

    erzeugeDiagrammKarten(felderMitDaten);
    aktualisiereAktuelleWerteImDashboard(standort);
    zeichneDiagramme(felderMitDaten, chronologisch);
}

function zeigeLadePlatzhalter() {
    loescheAlleDiagramme();
    document.getElementById('dashboard-tiles').innerHTML = `
        <div class="chart-card">
            <div class="lade-platzhalter"><span class="material-icons-round">progress_activity</span> Messhistorie wird geladen …</div>
        </div>`;
}

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

function zeichneZeitreihe(canvas, feldName, beschriftungen, chronologischeDaten) {
    const info = ermittleMessfeldInfo(feldName);
    const werte = chronologischeDaten.map(datensatz => {
        const rohwert = datensatz[feldName];
        return (rohwert === null || rohwert === undefined) ? null : info.umrechnen(rohwert);
    });

    // Bei "Gesamter Zeitraum" kommen schnell mehrere tausend Messpunkte zusammen -
    // ohne diese Anpassung würde Chart.js für jeden einen sichtbaren Kreis malen,
    // was die Linie unleserlich und das Rendern spürbar langsam machen würde.
    const vieleDatenpunkte = werte.length > 300;

    return new Chart(canvas.getContext('2d'), {
        type: info.diagrammTyp,
        data: {
            labels: beschriftungen,
            datasets: [{
                label: `${info.bezeichnung}${info.einheit ? ' (' + info.einheit + ')' : ''}`,
                data: werte,
                borderColor: info.farbe,
                backgroundColor: info.diagrammTyp === 'bar' ? info.farbe : hexZuRgba(info.farbe, 0.12),
                fill: info.diagrammTyp === 'line',
                tension: 0.35,
                spanGaps: true, // fehlende Messwerte reißen die Linie nicht ab, sondern werden übersprungen
                pointRadius: vieleDatenpunkte ? 0 : 3,
                pointHoverRadius: 5,
                borderWidth: vieleDatenpunkte ? 1.5 : 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: vieleDatenpunkte ? false : undefined,
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            plugins: {
                legend: { position: 'bottom' },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
                    limits: { x: { minRange: 4 } }
                }
            },
            scales: { x: { ticks: { maxTicksLimit: 8 } } }
        }
    });
}

// Windrichtung bekommt keine Zeitreihe, sondern eine echte Windrose: Häufigkeit
// pro Himmelsrichtung im gewählten Zeitraum, als Kreisdiagramm.
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

function loescheAlleDiagramme() {
    Object.values(diagrammInstanzenNachFeld).forEach(instanz => instanz.destroy());
    diagrammInstanzenNachFeld = {};
}

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

// --- Kleinkram ---------------------------------------------------------

function feldIdFuerDom(feldName) {
    return feldName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function bestimmeHimmelsrichtung(gradzahl) {
    return HIMMELSRICHTUNGEN[Math.round(gradzahl / 22.5) % 16];
}

function formatiereZeitpunkt(zeitpunktText) {
    if (!zeitpunktText) return '–';
    const datum = new Date(zeitpunktText);
    if (Number.isNaN(datum.getTime())) return zeitpunktText;
    return datum.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}

function formatiereZeitpunktFuerAchse(zeitpunktText) {
    return new Date(zeitpunktText).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function hexZuRgba(hexFarbe, deckkraft) {
    const zahl = parseInt(hexFarbe.slice(1), 16);
    return `rgba(${(zahl >> 16) & 255}, ${(zahl >> 8) & 255}, ${zahl & 255}, ${deckkraft})`;
}
