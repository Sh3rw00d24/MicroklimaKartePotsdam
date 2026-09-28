// Vergleich der Sensordaten mit den DWD-Referenzdaten für Potsdam (siehe dwd-klimadaten.js).
// Lädt einmalig das Klimanormal + den Erwärmungstrend vom eigenen Server und
// stellt daraus zwei Dinge für script.js bereit: die graue Vergleichslinie in
// den Diagrammen und die Klima-Einordnung im Text.

// Nur Felder, für die die DWD-Station eine direkt vergleichbare Messgröße liefert.
// Luftdruck bewusst ausgeschlossen: DWD meldet Stationsdruck auf 81 m Höhe, nicht
// auf Meereshöhe reduziert - ohne Höhenkorrektur wäre der Vergleich irreführend.
const DWD_FELD_ZUORDNUNG = {
    'Air Temperature': 'temp',
    'Air Humidity': 'humidity',
    'Wind Speed': 'wind'
};

let dwdReferenzdaten = null;

// Einmalig beim Laden der Seite abrufen (Klimanormal ändert sich praktisch nie).
async function ladeDwdReferenzdaten() {
    try {
        const antwort = await fetch('/api/dwd/referenz');
        const daten = await antwort.json();

        if (!daten.erfolgreich) {
            console.warn('DWD-Referenzdaten nicht verfügbar:', daten.fehlermeldung);
            return;
        }

        dwdReferenzdaten = daten;

        // Falls schon eine Standortanalyse offen ist, mit den jetzt verfügbaren
        // DWD-Daten neu zeichnen (nutzt den vorhandenen Verlauf-Cache, kein Refetch).
        if (ausgewaehlterStandort && verlaufCacheNachStandortId[ausgewaehlterStandort.id]) {
            ladeUndZeigeVerlauf(ausgewaehlterStandort);
        }
    } catch (fehler) {
        console.warn('DWD-Referenzdaten konnten nicht geladen werden:', fehler.message);
    }
}

// Klimanormal-Wert pro echtem Datenpunkt (nach Kalendertag, unabhängig vom Jahr) -
// für die graue Vergleichslinie im Zeitreihen-Diagramm. null, wenn für dieses
// Feld keine DWD-Entsprechung existiert oder die Referenzdaten noch nicht da sind.
function erzeugeDwdVergleichsDaten(feldName, chronologischeDaten) {
    const dwdSchluessel = DWD_FELD_ZUORDNUNG[feldName];
    if (!dwdSchluessel || !dwdReferenzdaten) return null;

    return chronologischeDaten.map(datensatz => {
        const tag = formatiereAlsMonatTag(parseSensorZeitpunkt(datensatz.time));
        const normal = dwdReferenzdaten.klimanormalProTag[tag]?.[dwdSchluessel];
        return normal ? normal.mittel : null;
    });
}

// Vergleicht den Ø-Wert der letzten 24 Sensor-Stunden mit dem DWD-Klimanormal für
// den heutigen Kalendertag (Tagesmittel gegen Tagesmittel - keine Tageszeit-Verzerrung).
function berechneKlimaEinordnung(standort, feldName) {
    const dwdSchluessel = DWD_FELD_ZUORDNUNG[feldName];
    if (!dwdSchluessel || !dwdReferenzdaten) return null;

    const zwischengespeichert = verlaufCacheNachStandortId[standort.id];
    if (!zwischengespeichert) return null;

    const info = ermittleMessfeldInfo(feldName);
    const jetzt = Date.now();
    const letzte24h = zwischengespeichert.messwerte
        .filter(datensatz => (jetzt - parseSensorZeitpunkt(datensatz.time).getTime()) <= 24 * 60 * 60 * 1000)
        .map(datensatz => datensatz[feldName])
        .filter(wert => typeof wert === 'number')
        .map(wert => info.umrechnen(wert));

    if (letzte24h.length === 0) return null;

    const aktuellesMittel = mittelwert(letzte24h);
    const heuteSchluessel = formatiereAlsMonatTag(new Date());
    const normal = dwdReferenzdaten.klimanormalProTag[heuteSchluessel]?.[dwdSchluessel];
    if (!normal) return null;

    const abweichung = aktuellesMittel - normal.mittel;
    const zScore = normal.stdabw > 0 ? abweichung / normal.stdabw : 0;

    return {
        aktuellesMittel,
        normalMittel: normal.mittel,
        abweichung,
        einordnungssatz: erzeugeEinordnungssatz(feldName, zScore)
    };
}

// Abweichung in Wetter-übliche Worte fassen - Schwelle in Standardabweichungen
// (statistisch begründet), nicht in willkürlich gewählten Grad-Werten.
function erzeugeEinordnungssatz(feldName, zScore) {
    const info = ermittleMessfeldInfo(feldName);
    const abs = Math.abs(zScore);
    // Deutsche Substantive werden immer großgeschrieben, auch mitten im Satz -
    // info.bezeichnung (z. B. "Windgeschwindigkeit") bleibt deshalb unverändert.
    const richtung = zScore >= 0 ? 'höher' : 'niedriger';

    if (abs < 1) return 'Das liegt im Rahmen der üblichen Schwankungsbreite für diese Jahreszeit.';
    if (abs < 2) return `Die ${info.bezeichnung} liegt damit spürbar ${richtung} als im 20-jährigen Mittel dieser Jahreszeit üblich.`;
    return `Die ${info.bezeichnung} liegt damit deutlich ${richtung} als im 20-jährigen Mittel dieser Jahreszeit üblich – eine statistisch auffällige Abweichung.`;
}

// Kompakter Vergleichs-Streifen (Sensor / DWD-Normal / Abweichung) unter dem Diagramm.
function erzeugeDwdVergleichsHtml(standort, feldName) {
    const einordnung = berechneKlimaEinordnung(standort, feldName);
    if (!einordnung) return '';

    const info = ermittleMessfeldInfo(feldName);
    const formatWert = (wert) => `${wert.toFixed(info.nachkommastellen)}${info.einheit ? ' ' + info.einheit : ''}`;
    const vorzeichen = einordnung.abweichung >= 0 ? '+' : '';
    const richtungsKlasse = einordnung.abweichung >= 0 ? 'waermer' : 'kaelter';

    return `
        <div class="dwd-vergleich-streifen">
            <div class="dwd-punkt">
                <span class="dwd-punkt-label">Ø letzte 24 h (Sensor)</span>
                <span class="dwd-punkt-wert">${formatWert(einordnung.aktuellesMittel)}</span>
            </div>
            <div class="dwd-punkt">
                <span class="dwd-punkt-label">DWD-Klimanormal heute</span>
                <span class="dwd-punkt-wert">${formatWert(einordnung.normalMittel)}</span>
            </div>
            <div class="dwd-punkt dwd-abweichung ${richtungsKlasse}">
                <span class="dwd-punkt-label">Abweichung</span>
                <span class="dwd-punkt-wert">${vorzeichen}${formatWert(einordnung.abweichung)}</span>
            </div>
        </div>
        <p class="dwd-einordnung-text">${einordnung.einordnungssatz}
            <span class="dwd-quelle-hinweis">Graue gestrichelte Linie im Diagramm: DWD-Klimanormal ${dwdReferenzdaten.referenzzeitraum.vonJahr}–${dwdReferenzdaten.referenzzeitraum.bisJahr}, Station ${dwdReferenzdaten.station.name}.</span>
        </p>`;
}

// Datum -> "MM-TT", zum Nachschlagen im kalendertag-indizierten Klimanormal.
function formatiereAlsMonatTag(datum) {
    return `${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`;
}

// Feld pro Warnungstyp, für den ein DWD-Klimanormal existiert (siehe wetterwarnungen.js).
// UV bewusst ohne Eintrag: die WHO-Skala ist ein absoluter Maßstab, kein Klimamittel-Vergleich.
const DWD_FELD_PRO_WARNUNGSTYP = { hitze: 'Air Temperature', wind: 'Wind Speed', trockenheit: 'Air Humidity' };

// Ordnet eine Wetterwarnung zusätzlich in den saisonalen DWD-Normalwert ein - ein
// kurzer Zusatzsatz für die Warnungsbox im Dashboard. null, wenn keine DWD-Entsprechung
// existiert oder (noch) keine Daten für den Vergleich vorliegen.
function erzeugeDwdKontextSatz(standort, warnungsTyp) {
    const feldName = DWD_FELD_PRO_WARNUNGSTYP[warnungsTyp];
    if (!feldName) return null;

    const einordnung = berechneKlimaEinordnung(standort, feldName);
    if (!einordnung) return null;

    const info = ermittleMessfeldInfo(feldName);
    const formatWert = (wert) => `${wert.toFixed(info.nachkommastellen)}${info.einheit ? ' ' + info.einheit : ''}`;
    const vorzeichen = einordnung.abweichung >= 0 ? '+' : '';

    return `Zum Vergleich: das DWD-Klimanormal für diesen Tag liegt bei ${formatWert(einordnung.normalMittel)} (Abweichung: ${vorzeichen}${formatWert(einordnung.abweichung)}).`;
}
