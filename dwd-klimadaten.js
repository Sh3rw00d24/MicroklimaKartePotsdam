// Referenzdaten des Deutschen Wetterdienstes (DWD) für Potsdam.
//
// Quelle: DWD Climate Data Center (Open Data, CC BY 4.0) - amtliche Tageswerte
// der Station 03987 "Potsdam" (Telegrafenberg), eine der längsten durchgehenden
// Messreihen Deutschlands (seit 1893), https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl/
//
// Liefert zwei Dinge, beide direkt aus den Rohdaten berechnet (nichts geschätzt):
// 1. Klimanormal pro Kalendertag (Tagesmittel ± Standardabweichung, letzte 20
//    vollständige Jahre) für Temperatur, Luftfeuchte, Windgeschwindigkeit.
// 2. Langfristiger Erwärmungstrend (lineare Regression über Jahresmittel) -
//    einmal über die komplette Messreihe, einmal über die letzten 30 Jahre.

const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const DWD_STATION_ID = '03987';
const DWD_STATION_NAME = 'Potsdam (Telegrafenberg)';
const DWD_STATION_LAT = 52.3812;
const DWD_STATION_LNG = 13.0622;
const DWD_VERZEICHNIS_URL = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl/historical/';

const REFERENZ_JAHRE_ANZAHL = 20; // Klimanormal-Fenster
const TREND_NEUERE_JAHRE_ANZAHL = 30; // zweites, kürzeres Trend-Fenster (Beschleunigung sichtbar machen)
const GLAETTUNGS_FENSTER_TAGE = 5; // ±5 Tage, zirkulär über den Jahreswechsel gepoolt
const MINDEST_TAGE_FUER_VOLLSTAENDIGES_JAHR = 360;
const FEHLWERT = -999;

const CACHE_DATEI = path.join(__dirname, 'data', 'dwd-cache.json');
const CACHE_GUELTIG_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage - Klimadaten ändern sich extrem langsam

let ladeVorgang = null;

// Öffentliche Funktion: liefert die aufbereiteten DWD-Referenzdaten (aus Cache oder frisch berechnet).
// Bei Fehlschlag wird der nächste Aufruf einen neuen Versuch starten (kein dauerhaft blockierter Cache).
function holeDwdReferenzdaten() {
    if (!ladeVorgang) {
        ladeVorgang = ladeOderBerechne().catch(fehler => {
            ladeVorgang = null;
            throw fehler;
        });
    }
    return ladeVorgang;
}

async function ladeOderBerechne() {
    const zwischengespeichert = leseCache();
    if (zwischengespeichert) {
        console.log('DWD-Referenzdaten aus lokalem Cache geladen.');
        return zwischengespeichert;
    }

    console.log('Lade DWD-Klimadaten für Potsdam (Station 03987) von opendata.dwd.de ...');
    const zeilen = await ladeStationsdaten();
    const ergebnis = berechneReferenzdaten(zeilen);
    schreibeCache(ergebnis);
    console.log(`DWD-Referenzdaten bereit: Klimanormal ${ergebnis.referenzzeitraum.vonJahr}-${ergebnis.referenzzeitraum.bisJahr}, Erwärmungstrend seit ${ergebnis.trend.temp.gesamtZeitraum.von}.`);
    return ergebnis;
}

// Zip-Datei der Station suchen (Dateiname enthält das jeweils aktuelle Enddatum,
// deshalb im Verzeichnis nachschauen statt einen Dateinamen fest zu verdrahten),
// laden, entpacken und die Tageswerte-Tabelle in einfache Objekte umwandeln.
async function ladeStationsdaten() {
    const verzeichnisAntwort = await fetch(DWD_VERZEICHNIS_URL);
    if (!verzeichnisAntwort.ok) throw new Error(`DWD-Verzeichnis nicht erreichbar (Status ${verzeichnisAntwort.status}).`);
    const verzeichnisHtml = await verzeichnisAntwort.text();

    const treffer = verzeichnisHtml.match(new RegExp(`tageswerte_KL_${DWD_STATION_ID}_\\d{8}_\\d{8}_hist\\.zip`));
    if (!treffer) throw new Error(`Keine DWD-Datendatei für Station ${DWD_STATION_ID} im Verzeichnis gefunden.`);

    const zipAntwort = await fetch(DWD_VERZEICHNIS_URL + treffer[0]);
    if (!zipAntwort.ok) throw new Error(`DWD-Zip-Datei nicht erreichbar (Status ${zipAntwort.status}).`);
    const zipPuffer = Buffer.from(await zipAntwort.arrayBuffer());

    const zip = new AdmZip(zipPuffer);
    const datenEintrag = zip.getEntries().find(e => e.entryName.startsWith('produkt_klima_tag_'));
    if (!datenEintrag) throw new Error('Tageswerte-Datei nicht im DWD-Zip enthalten.');

    const text = datenEintrag.getData().toString('utf-8');
    const [kopfzeile, ...datenzeilen] = text.trim().split('\n');
    const spalten = kopfzeile.split(';').map(s => s.trim());
    const spaltenIndex = {
        datum: spalten.indexOf('MESS_DATUM'),
        tmk: spalten.indexOf('TMK'),
        upm: spalten.indexOf('UPM'),
        fm: spalten.indexOf('FM')
    };

    return datenzeilen.map(zeile => {
        const teile = zeile.split(';').map(t => t.trim());
        const datumText = teile[spaltenIndex.datum];
        return {
            jahr: Number(datumText.slice(0, 4)),
            monatTag: `${datumText.slice(4, 6)}-${datumText.slice(6, 8)}`,
            temp: leseZahl(teile[spaltenIndex.tmk]),
            humidity: leseZahl(teile[spaltenIndex.upm]),
            windMs: leseZahl(teile[spaltenIndex.fm])
        };
    });
}

function leseZahl(text) {
    const zahl = Number(text);
    return (Number.isFinite(zahl) && zahl !== FEHLWERT) ? zahl : null;
}

// Aus den Rohzeilen sowohl das Klimanormal als auch den Erwärmungstrend berechnen.
function berechneReferenzdaten(zeilen) {
    const tageProJahr = {};
    zeilen.forEach(z => { if (z.temp !== null) tageProJahr[z.jahr] = (tageProJahr[z.jahr] || 0) + 1; });
    const vollstaendigeJahre = Object.keys(tageProJahr)
        .map(Number)
        .filter(jahr => tageProJahr[jahr] >= MINDEST_TAGE_FUER_VOLLSTAENDIGES_JAHR)
        .sort((a, b) => a - b);

    const letztesJahr = vollstaendigeJahre[vollstaendigeJahre.length - 1];
    const referenzVonJahr = letztesJahr - (REFERENZ_JAHRE_ANZAHL - 1);

    return {
        erfolgreich: true,
        station: { id: DWD_STATION_ID, name: DWD_STATION_NAME, lat: DWD_STATION_LAT, lng: DWD_STATION_LNG },
        referenzzeitraum: { vonJahr: referenzVonJahr, bisJahr: letztesJahr },
        klimanormalProTag: berechneKlimanormalProTag(zeilen, referenzVonJahr, letztesJahr),
        trend: { temp: berechneTrend(zeilen, vollstaendigeJahre, 'temp') },
        generiertAm: new Date().toISOString(),
        quelle: DWD_VERZEICHNIS_URL
    };
}

// Kalendertag-Klimanormal: pro Tag werden alle Rohwerte aus einem ±5-Tage-Fenster
// (zirkulär über Silvester/Neujahr hinweg) über alle Referenzjahre gepoolt und
// direkt daraus Mittel/Stdabw berechnet - glättet Tag-zu-Tag-Rauschen, wie in der
// Klimatologie üblich, ohne bereits gemittelte Werte ein zweites Mal zu mitteln.
function berechneKlimanormalProTag(zeilen, vonJahr, bisJahr) {
    const referenzzeilen = zeilen.filter(z => z.jahr >= vonJahr && z.jahr <= bisJahr);

    const rohProTag = {};
    referenzzeilen.forEach(z => {
        if (!rohProTag[z.monatTag]) rohProTag[z.monatTag] = { temp: [], humidity: [], windMs: [] };
        if (z.temp !== null) rohProTag[z.monatTag].temp.push(z.temp);
        if (z.humidity !== null) rohProTag[z.monatTag].humidity.push(z.humidity);
        if (z.windMs !== null) rohProTag[z.monatTag].windMs.push(z.windMs);
    });

    const tagesfolge = erzeugeKalendertagfolge();
    const ergebnis = {};

    tagesfolge.forEach((tag, i) => {
        const gepoolt = { temp: [], humidity: [], windMs: [] };
        for (let d = -GLAETTUNGS_FENSTER_TAGE; d <= GLAETTUNGS_FENSTER_TAGE; d++) {
            const nachbarTag = tagesfolge[(i + d + tagesfolge.length) % tagesfolge.length];
            const eintrag = rohProTag[nachbarTag];
            if (!eintrag) continue;
            gepoolt.temp.push(...eintrag.temp);
            gepoolt.humidity.push(...eintrag.humidity);
            gepoolt.windMs.push(...eintrag.windMs);
        }

        ergebnis[tag] = {
            temp: berechneStatistik(gepoolt.temp),
            humidity: berechneStatistik(gepoolt.humidity),
            wind: berechneStatistik(gepoolt.windMs.map(v => v * 3.6)) // km/h, konsistent zur Sensor-Anzeige
        };
    });

    return ergebnis;
}

// 366 Kalendertage (MM-DD) in Jahresreihenfolge, inkl. 29.02. - Basis für die
// zirkuläre Nachbarschaft beim Glätten (2020 ist nur als Schaltjahr-Gerüst gewählt).
function erzeugeKalendertagfolge() {
    const tage = [];
    const start = Date.UTC(2020, 0, 1);
    for (let i = 0; i < 366; i++) {
        const tag = new Date(start + i * 86400000);
        tage.push(`${String(tag.getUTCMonth() + 1).padStart(2, '0')}-${String(tag.getUTCDate()).padStart(2, '0')}`);
    }
    return tage;
}

function berechneStatistik(werte) {
    if (werte.length < 2) return null;
    const mittel = werte.reduce((summe, w) => summe + w, 0) / werte.length;
    const varianz = werte.reduce((summe, w) => summe + (w - mittel) ** 2, 0) / (werte.length - 1);
    return { mittel: runde(mittel), stdabw: runde(Math.sqrt(varianz)), n: werte.length };
}

// Erwärmungstrend per linearer Regression der Jahresmittel - einmal über die
// komplette Messreihe, einmal über die letzten 30 Jahre (macht eine etwaige
// Beschleunigung des Trends sichtbar statt sie im Gesamtmittel zu verwässern).
function berechneTrend(zeilen, vollstaendigeJahre, feld) {
    const jahresmittel = vollstaendigeJahre.map(jahr => {
        const werte = zeilen.filter(z => z.jahr === jahr && z[feld] !== null).map(z => z[feld]);
        return { jahr, mittel: werte.reduce((s, w) => s + w, 0) / werte.length };
    });

    const neuereJahre = jahresmittel.filter(j => j.jahr >= vollstaendigeJahre[vollstaendigeJahre.length - 1] - (TREND_NEUERE_JAHRE_ANZAHL - 1));

    return {
        gesamtSteigungProJahrzehnt: runde(steigungProJahrzehnt(jahresmittel)),
        gesamtZeitraum: { von: jahresmittel[0].jahr, bis: jahresmittel[jahresmittel.length - 1].jahr },
        neuereSteigungProJahrzehnt: runde(steigungProJahrzehnt(neuereJahre)),
        neuererZeitraum: { von: neuereJahre[0].jahr, bis: neuereJahre[neuereJahre.length - 1].jahr }
    };
}

// Kleinste-Quadrate-Steigung (Jahr -> Jahresmittel), umgerechnet auf °C/Jahrzehnt.
function steigungProJahrzehnt(punkte) {
    const n = punkte.length;
    const xMittel = punkte.reduce((s, p) => s + p.jahr, 0) / n;
    const yMittel = punkte.reduce((s, p) => s + p.mittel, 0) / n;
    let zaehler = 0, nenner = 0;
    punkte.forEach(p => {
        zaehler += (p.jahr - xMittel) * (p.mittel - yMittel);
        nenner += (p.jahr - xMittel) ** 2;
    });
    return (zaehler / nenner) * 10;
}

function runde(zahl) {
    return Math.round(zahl * 100) / 100;
}

function leseCache() {
    try {
        if (!fs.existsSync(CACHE_DATEI)) return null;
        const inhalt = JSON.parse(fs.readFileSync(CACHE_DATEI, 'utf-8'));
        const alterMs = Date.now() - new Date(inhalt.generiertAm).getTime();
        return alterMs > CACHE_GUELTIG_MS ? null : inhalt;
    } catch {
        return null;
    }
}

function schreibeCache(daten) {
    try {
        fs.mkdirSync(path.dirname(CACHE_DATEI), { recursive: true });
        fs.writeFileSync(CACHE_DATEI, JSON.stringify(daten));
    } catch (fehler) {
        console.warn('DWD-Cache konnte nicht geschrieben werden:', fehler.message);
    }
}

module.exports = { holeDwdReferenzdaten };
