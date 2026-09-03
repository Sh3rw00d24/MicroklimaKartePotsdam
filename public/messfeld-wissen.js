/**
 * Wissen über die einzelnen Messwerte
 * ====================================
 *
 * Die SenseCAP-Wetterstationen schicken ihre Werte mit englischen Feldnamen aus
 * der Sensor-Firmware (z. B. "Air Temperature"). Dieses Objekt übersetzt jeden
 * dieser Feldnamen in das, was das Dashboard daraus macht: eine deutsche
 * Bezeichnung, eine Einheit, eine Farbe, ein Icon und die Erklärtexte für den
 * "Mehr erfahren"-Bereich unter jedem Diagramm.
 *
 * Kommt ein Sensor mit einem Feld, das hier nicht gelistet ist, wird unten in
 * MESSFELD_STANDARD ein einfacher Ersatzeintrag erzeugt, damit trotzdem nichts
 * kaputtgeht – neue Sensor-Typen brauchen also keine Code-Änderung, um wenigstens
 * angezeigt zu werden.
 *
 * Wichtig zur Windgeschwindigkeit: Die Station liefert sie in Metern pro Sekunde
 * (m/s), wie es für diesen Sensortyp üblich ist. Für die Anzeige wird sie mit dem
 * Faktor 3,6 in km/h umgerechnet (m/s × 3,6 = km/h) – das ist eine reine
 * Einheiten-Umrechnung, keine Schätzung.
 *
 * Beim Luftdruck liefert der Sensor Pascal (z. B. 101380 Pa). Für die gewohnte
 * Einheit hPa wird durch 100 geteilt (101380 Pa = 1013,8 hPa).
 */

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
        umrechnen: (wertInPascal) => wertInPascal / 100,
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

/**
 * Liefert die Anzeige-Informationen zu einem Messfeld. Ist das Feld unbekannt
 * (z. B. weil ein neuer Sensortyp ein Feld mitschickt, das oben noch nicht
 * eingetragen wurde), wird ein einfacher, funktionierender Standardeintrag
 * erzeugt statt eines Fehlers.
 */
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

// Felder, die technischer Natur sind und nie als eigenes Diagramm dargestellt
// werden sollen (Zeitstempel, Geräte-ID, Koordinate, interne Datenbank-ID).
const TECHNISCHE_FELDER = ['_id', 'time', 'dev_eui', 'geo_point'];

/**
 * Einstellungen für die Karten-Einfärbung ("Karten-Metrik"-Auswahl in der
 * Seitenleiste). Jeder Eintrag beschreibt, welches Sensor-Feld gemeint ist, wie
 * der Farbverlauf auf der Karte aussehen soll und wie ein roher Messwert in eine
 * Intensität zwischen 0 (kühlste Farbe) und 1 (wärmste Farbe) umgerechnet wird.
 *
 * min/max legen dabei die Skala fest, auf der die Wärmekarte normiert wird –
 * z. B. bedeutet das bei der Temperatur: 10 °C oder kälter = Intensität 0,
 * 40 °C oder wärmer = Intensität 1.
 */
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
        feld: 'Barometric Pressure',
        // Umrechnung Pa -> hPa, damit die Skala zur Anzeige in den Diagrammen passt.
        umrechnen: (wert) => wert / 100,
        legendentitel: 'Luftdruck (hPa)',
        erklaerung: 'Zeigt den Luftdruck als Farbverlauf auf der Karte.',
        min: 990, max: 1040,
        farbverlauf: { 0.1: '#e0e7ff', 0.4: '#a5b4fc', 0.7: '#6366f1', 0.9: '#4338ca', 1.0: '#1e1b4b' },
        skalenBeschriftung: ['990', '1015', '1040+']
    }
};
