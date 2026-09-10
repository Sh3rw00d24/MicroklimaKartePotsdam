// Anzeige-Wissen zu jedem Messwert: deutsche Bezeichnung, Einheit, Farbe, Icon,
// Erklärtexte für "Mehr erfahren". Key = kanonischer Feldname (siehe unten).
// Wind: Sensor liefert m/s, Anzeige in km/h (× 3,6). Luftdruck: Pa -> hPa
// passiert schon in normalisiereDatensatz(), hier also bereits hPa.

const MESSFELD_INFO = {
    'Air Temperature': {
        bezeichnung: 'Temperatur',
        einheit: '°C',
        icon: 'thermostat',
        farbe: '#ef4444',
        diagrammTyp: 'line',
        nachkommastellen: 1,
        umrechnen: (wert) => wert,
        tag: 'Thermische Belastung',
        titel: 'Temperaturverlauf',
        kurzbeschreibung: 'Lufttemperatur, gemessen direkt am Sensorstandort.',
        interpretation: 'Dauerhaft hohe Werte, besonders wenn die Temperatur nachts nicht unter etwa 20 °C fällt (sogenannte Tropennacht), bedeuten eine spürbare Hitzebelastung für Menschen in der Umgebung dieses Standorts.',
        empfehlung: 'An Tagen mit anhaltend hohen Werten körperliche Anstrengung im Freien in die kühleren Morgen- oder Abendstunden verlegen und ausreichend trinken.'
    },
    'Air Humidity': {
        bezeichnung: 'Luftfeuchtigkeit',
        einheit: '%',
        icon: 'water_drop',
        farbe: '#10b981',
        diagrammTyp: 'line',
        nachkommastellen: 0,
        umrechnen: (wert) => wert,
        tag: 'Mikroklima',
        titel: 'Luftfeuchtigkeit',
        kurzbeschreibung: 'Relativer Wasserdampfgehalt der Luft.',
        interpretation: 'Eine hohe Luftfeuchtigkeit in Kombination mit hohen Temperaturen erschwert die körpereigene Kühlung durch Schwitzen spürbar – die Hitze wird dann als "schwül" empfunden.',
        empfehlung: 'Bei gleichzeitig hoher Temperatur und hoher Luftfeuchtigkeit sportliche Aktivitäten reduzieren und auf ausreichende Flüssigkeitszufuhr achten.'
    },
    'Wind Speed': {
        bezeichnung: 'Windgeschwindigkeit',
        einheit: 'km/h',
        icon: 'air',
        farbe: '#3b82f6',
        diagrammTyp: 'line',
        nachkommastellen: 1,
        umrechnen: (wertInMeterProSekunde) => wertInMeterProSekunde * 3.6,
        tag: 'Luftaustausch',
        titel: 'Windgeschwindigkeit',
        kurzbeschreibung: 'Geschwindigkeit der Luftbewegung – wichtig für den Abtransport von Wärme und Schadstoffen.',
        interpretation: 'Niedrige Windgeschwindigkeiten an heißen Tagen bedeuten, dass sich aufgeheizte Luft an diesem Standort länger hält, da kaum Luftaustausch stattfindet.',
        empfehlung: 'Bei anhaltender Windstille und Hitze schattige, gut durchlüftete Bereiche bevorzugen.'
    },
    'Wind Direction Sensor': {
        bezeichnung: 'Windrichtung',
        einheit: '°',
        icon: 'explore',
        farbe: '#211c3d',
        diagrammTyp: 'windrose',
        nachkommastellen: 0,
        umrechnen: (wert) => wert,
        tag: 'Luftaustausch',
        titel: 'Windrose',
        kurzbeschreibung: 'Aus welcher Richtung der Wind im gewählten Zeitraum kam und wie oft.',
        interpretation: 'Jeder Balken steht für eine Himmelsrichtung, seine Länge für die Häufigkeit. Sticht eine Richtung deutlich heraus, war das im gewählten Zeitraum die vorherrschende Windrichtung.',
        empfehlung: 'Die vorherrschende Richtung zeigt, aus welcher Ecke an diesem Standort am ehesten mit Kaltluftzufuhr zu rechnen ist.'
    },
    'Rain Gauge': {
        bezeichnung: 'Niederschlag',
        einheit: 'mm',
        icon: 'water',
        farbe: '#0284c7',
        diagrammTyp: 'bar',
        nachkommastellen: 1,
        umrechnen: (wert) => wert,
        tag: 'Wetterereignisse',
        titel: 'Niederschlag',
        kurzbeschreibung: 'Von der Regenwippe des Sensors erfasste Niederschlagsmenge.',
        interpretation: 'Kurze, hohe Ausschläge deuten auf Starkregen hin. Auf versiegelten Flächen kann Regenwasser dann nicht schnell genug versickern.',
        empfehlung: 'Bei erkennbaren Starkregenspitzen tiefliegende Bereiche und Unterführungen in der Nähe meiden.'
    },
    'Barometric Pressure': {
        bezeichnung: 'Luftdruck',
        einheit: 'hPa',
        icon: 'speed',
        farbe: '#6366f1',
        diagrammTyp: 'line',
        nachkommastellen: 1,
        umrechnen: (wert) => wert, // liegt dank normalisiereDatensatz() schon in hPa vor
        tag: 'Wetterlage',
        titel: 'Luftdruckverlauf',
        kurzbeschreibung: 'Luftdruck auf Stationshöhe – ein klassischer Hinweis auf die kommende Wetterentwicklung.',
        interpretation: 'Fällt der Luftdruck über mehrere Stunden deutlich ab, deutet das auf eine Wetterverschlechterung hin. Steigender Druck spricht eher für stabiles, ruhiges Wetter.',
        empfehlung: 'Bei schnell fallendem Luftdruck Außenaktivitäten mit einem Blick auf die aktuelle Wettervorhersage planen.'
    },
    'Light Intensity': {
        bezeichnung: 'Lichtintensität',
        einheit: 'lx',
        icon: 'wb_sunny',
        farbe: '#f59e0b',
        diagrammTyp: 'line',
        nachkommastellen: 0,
        umrechnen: (wert) => wert,
        tag: 'Strahlung',
        titel: 'Lichtintensität',
        kurzbeschreibung: 'Gemessene Helligkeit in Lux – steigt bei direkter Sonneneinstrahlung stark an.',
        interpretation: 'Sehr hohe Werte deuten auf ungehinderte, direkte Sonneneinstrahlung ohne Verschattung durch Bäume oder Gebäude hin.',
        empfehlung: 'An Standorten mit dauerhaft hohen Werten ist zusätzliche Verschattung (z. B. durch Bäume) besonders wirksam gegen Aufheizung.'
    },
    'UV Index': {
        bezeichnung: 'UV-Index',
        einheit: '',
        icon: 'wb_sunny',
        farbe: '#eab308',
        diagrammTyp: 'bar',
        nachkommastellen: 1,
        umrechnen: (wert) => wert,
        tag: 'Strahlung',
        titel: 'UV-Index',
        kurzbeschreibung: 'Wissenschaftlicher Indikator für die Intensität der sonnenbrandwirksamen UV-Strahlung, Skala 0 bis 11+.',
        interpretation: 'Werte ab 3 machen erste Schutzmaßnahmen sinnvoll, ab 8 besteht ein hohes Risiko für Hautschäden bei ungeschützter, direkter Sonnenexposition.',
        empfehlung: 'Bei einem UV-Index über 5 Sonnenschutz (LSF 30+) verwenden und die pralle Mittagssonne zwischen 11 und 15 Uhr meiden.'
    }
};

// Anzeige-Infos zu einem Feld, oder ein generischer Fallback für unbekannte Felder.
function ermittleMessfeldInfo(feldName) {
    if (MESSFELD_INFO[feldName]) {
        return MESSFELD_INFO[feldName];
    }
    return {
        bezeichnung: feldName,
        einheit: '',
        icon: 'sensors',
        farbe: '#64748b',
        diagrammTyp: 'line',
        nachkommastellen: 1,
        umrechnen: (wert) => wert,
        tag: 'Weiterer Messwert',
        titel: feldName,
        kurzbeschreibung: 'Zusätzlicher Messwert dieses Sensors.',
        interpretation: 'Für diesen Messwert liegt noch keine ausführliche Einordnung vor.',
        empfehlung: 'Werte im Verlauf beobachten, sobald mehr Erfahrungswerte vorliegen.'
    };
}

// Technische Felder: nie als eigenes Diagramm darstellen.
const TECHNISCHE_FELDER = ['_id', 'time', 'dev_eui', 'geo_point'];

// Rohen Sensor-Feldnamen auf den kanonischen Namen bringen. Stationen nennen
// Felder unterschiedlich und ändern das auch mal (z. B. "Wind Direction Sensor",
// "Wind Direction", "Wind direction") - Schlüsselwort-Suche statt fester Liste
// fängt auch künftige Schreibweisen automatisch ab.
function ermittleKanonischenFeldnamen(rohName) {
    const schluessel = rohName.toLowerCase();

    if (schluessel.includes('temperature')) return 'Air Temperature';
    if (schluessel.includes('humid')) return 'Air Humidity';
    if (schluessel.includes('light')) return 'Light Intensity';
    if (schluessel.includes('uv')) return 'UV Index';
    if (schluessel.includes('wind') && schluessel.includes('speed')) return 'Wind Speed';
    if (schluessel.includes('wind')) return 'Wind Direction Sensor';
    if (schluessel.includes('rain')) return 'Rain Gauge';
    if (schluessel.includes('pressure')) return 'Barometric Pressure';

    return rohName; // unbekanntes Feld: unverändert lassen, siehe ermittleMessfeldInfo()
}

// Ein Messwert-Datensatz -> einheitliche Feldnamen + Einheiten. Luftdruck-Sonderfall:
// manche Stationen senden Pascal (fünfstellig), andere schon Hektopascal - Größenordnung
// verrät welches. Zeigen zwei Rohnamen auf denselben kanonischen Namen, gewinnt der erste echte Wert.
function normalisiereDatensatz(datensatz) {
    const ergebnis = {};
    for (const rohName of Object.keys(datensatz)) {
        const kanonischerName = TECHNISCHE_FELDER.includes(rohName) ? rohName : ermittleKanonischenFeldnamen(rohName);
        let wert = datensatz[rohName];

        if (kanonischerName === 'Barometric Pressure' && typeof wert === 'number' && wert > 10000) {
            wert = wert / 100;
        }

        if (ergebnis[kanonischerName] === undefined || ergebnis[kanonischerName] === null) {
            ergebnis[kanonischerName] = wert;
        }
    }
    return ergebnis;
}

// Feldliste (aus der API-Antwort) normalisieren und Duplikate entfernen.
function normalisiereFelderliste(felder) {
    const bereitsErfasst = new Set();
    const ergebnis = [];
    felder.forEach(feld => {
        const kanonischerName = TECHNISCHE_FELDER.includes(feld.id) ? feld.id : ermittleKanonischenFeldnamen(feld.id);
        if (bereitsErfasst.has(kanonischerName)) return;
        bereitsErfasst.add(kanonischerName);
        ergebnis.push({ id: kanonischerName, type: feld.type });
    });
    return ergebnis;
}

// Einstellungen für die Karten-Metrik-Auswahl: Sensor-Feld, Farbverlauf, und
// min/max, auf die die Wärmekarte normiert wird (min = Intensität 0, max = Intensität 1).
const KARTEN_METRIKEN = {
    temp: {
        feld: 'Air Temperature',
        legendentitel: 'Temperatur (°C)',
        erklaerung: 'Zeigt die Temperatur an jedem Standort als Farbverlauf auf der Karte.',
        min: 10, max: 40,
        farbverlauf: { 0.1: '#3b82f6', 0.3: '#06b6d4', 0.6: '#eab308', 0.8: '#ef4444', 1.0: '#7f1d1d' },
        skalenBeschriftung: ['10°C', '25°C', '40°C+']
    },
    wind: {
        feld: 'Wind Speed',
        // Umrechnung m/s -> km/h, damit die Skala zur Anzeige in den Diagrammen passt.
        umrechnen: (wert) => wert * 3.6,
        legendentitel: 'Windgeschwindigkeit (km/h)',
        erklaerung: 'Zeigt die Windgeschwindigkeit als Farbverlauf und die Windrichtung als Pfeile auf der Karte.',
        min: 0, max: 20,
        farbverlauf: { 0.1: '#f1f5f9', 0.4: '#94a3b8', 0.7: '#475569', 0.9: '#1e293b', 1.0: '#020617' },
        skalenBeschriftung: ['0', '10', '20+']
    },
    wind_dir: {
        feld: 'Wind Direction Sensor',
        nurPfeileKeineWaermekarte: true,
        legendentitel: 'Windrichtung',
        erklaerung: 'Blendet an jedem Standort einen Pfeil ein, der zeigt, aus welcher Richtung der Wind gerade weht.',
        skalenBeschriftung: ['N', 'O / S', 'W']
    },
    humidity: {
        feld: 'Air Humidity',
        legendentitel: 'Luftfeuchtigkeit (%)',
        erklaerung: 'Zeigt die relative Luftfeuchtigkeit als Farbverlauf auf der Karte.',
        min: 30, max: 100,
        farbverlauf: { 0.1: '#dcfce7', 0.4: '#6ee7b7', 0.7: '#10b981', 0.9: '#047857', 1.0: '#022c22' },
        skalenBeschriftung: ['30', '65', '100']
    },
    sun_intensity: {
        feld: 'Light Intensity',
        legendentitel: 'Lichtintensität (lx)',
        erklaerung: 'Zeigt die gemessene Helligkeit als Farbverlauf auf der Karte – hilfreich, um sonnige von beschatteten Standorten zu unterscheiden.',
        min: 0, max: 60000,
        farbverlauf: { 0.1: '#fef9c3', 0.4: '#fde047', 0.7: '#f59e0b', 0.9: '#b45309', 1.0: '#451a03' },
        skalenBeschriftung: ['0', '30.000', '60.000+']
    },
    uv: {
        feld: 'UV Index',
        legendentitel: 'UV-Index',
        erklaerung: 'Zeigt den UV-Index als Farbverlauf auf der Karte.',
        min: 0, max: 11,
        farbverlauf: { 0.1: '#fef08a', 0.4: '#eab308', 0.7: '#d97706', 0.9: '#92400e', 1.0: '#451a03' },
        skalenBeschriftung: ['0', '6', '11+']
    },
    rain: {
        feld: 'Rain Gauge',
        legendentitel: 'Niederschlag (mm)',
        erklaerung: 'Zeigt die aktuell gemessene Niederschlagsmenge als Farbverlauf auf der Karte.',
        min: 0, max: 12,
        farbverlauf: { 0.1: '#e0f2fe', 0.4: '#7dd3fc', 0.7: '#0284c7', 0.9: '#1e3a8a', 1.0: '#0f172a' },
        skalenBeschriftung: ['0', '5', '10+']
    },
    pressure: {
        feld: 'Barometric Pressure', // liegt dank normalisiereDatensatz() schon in hPa vor
        legendentitel: 'Luftdruck (hPa)',
        erklaerung: 'Zeigt den Luftdruck als Farbverlauf auf der Karte.',
        min: 990, max: 1040,
        farbverlauf: { 0.1: '#e0e7ff', 0.4: '#a5b4fc', 0.7: '#6366f1', 0.9: '#4338ca', 1.0: '#1e1b4b' },
        skalenBeschriftung: ['990', '1015', '1040+']
    }
};
