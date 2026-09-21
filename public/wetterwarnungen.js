// Wetterwarnungen: Hitze, Wind, UV, Trockenheit. Jede Bewertungsfunktion nutzt eine
// echte, standardisierte Skala statt erfundener Schwellenwerte - siehe Quellenangabe
// pro Abschnitt. schweregrad: 0 = Hinweis (informativ, kein Marker-Puls/Toast),
// 1-3 = Warnung (Marker-Puls + Toast), null/kein Eintrag = nichts Auffälliges.

// --- Wind: Beaufort-Skala (international genormt, auch von DWD verwendet) ---
//
// Wichtige Einschränkung: die Sensoren senden nur die mittlere Windgeschwindigkeit,
// keine Böen. DWDs offizielle Sturm-/Orkanwarnungen basieren auf Böen (typischerweise
// 1,5-2x höher als der Mittelwert) - eine "Böen"-Warnung wäre mit diesen Daten nicht
// ehrlich darstellbar. Die Beaufort-Skala selbst ist jedoch für mittleren Wind definiert
// und liefert genau die vom Nutzer gewünschten Kategorien (Windstille/Starker Wind/Sturm/Orkan).
const BEAUFORT_SKALA = [
    { stufe: 0, name: 'Windstille', abKmh: 0 },
    { stufe: 1, name: 'Leiser Zug', abKmh: 1 },
    { stufe: 2, name: 'Leichte Brise', abKmh: 6 },
    { stufe: 3, name: 'Schwache Brise', abKmh: 12 },
    { stufe: 4, name: 'Mäßige Brise', abKmh: 20 },
    { stufe: 5, name: 'Frische Brise', abKmh: 29 },
    { stufe: 6, name: 'Starker Wind', abKmh: 39 },
    { stufe: 7, name: 'Steifer Wind', abKmh: 50 },
    { stufe: 8, name: 'Stürmischer Wind', abKmh: 62 },
    { stufe: 9, name: 'Sturm', abKmh: 75 },
    { stufe: 10, name: 'Schwerer Sturm', abKmh: 89 },
    { stufe: 11, name: 'Orkanartiger Sturm', abKmh: 103 },
    { stufe: 12, name: 'Orkan', abKmh: 118 }
];

function ermittleBeaufortStufe(windKmh) {
    let treffer = BEAUFORT_SKALA[0];
    for (const stufe of BEAUFORT_SKALA) {
        if (windKmh >= stufe.abKmh) treffer = stufe; else break;
    }
    return treffer;
}

// Windstille (Bft 0) als Hinweis (kaum Luftaustausch, an heißen Tagen relevant),
// ab Bft 6 als echte Warnung mit steigendem Schweregrad. Bft 1-5: normale Brise,
// nichts zu melden.
function bewerteWind(standort) {
    const meterProSekunde = leseAktuellenRohwert(standort, 'Wind Speed');
    if (typeof meterProSekunde !== 'number') return null;

    const kmh = meterProSekunde * 3.6;
    const beaufort = ermittleBeaufortStufe(kmh);

    if (beaufort.stufe === 0) {
        return {
            typ: 'wind', schweregrad: 0, titel: 'Windstille',
            text: `${kmh.toFixed(1)} km/h im Mittel (Beaufort 0) – kaum Luftaustausch. An heißen Tagen hält sich aufgeheizte Luft an diesem Standort dadurch besonders lange.`
        };
    }

    if (beaufort.stufe >= 6) {
        const schweregrad = beaufort.stufe >= 12 ? 3 : beaufort.stufe >= 9 ? 2 : 1;
        return {
            typ: 'wind', schweregrad, titel: beaufort.name,
            text: `${kmh.toFixed(1)} km/h im Mittel – Beaufort ${beaufort.stufe} (${beaufort.name}). Hinweis: Das ist der gemessene Mittelwind, keine Böenspitze – Böen liegen erfahrungsgemäß deutlich höher. Für eine verbindliche Sturmwarnung gilt die offizielle DWD-Warnung.`
        };
    }

    return null;
}

// --- UV-Index: WHO Global Solar UV Index (weltweiter Standard, ortsunabhängige Skala) ---
const UV_SKALA = [
    { schweregrad: null, name: 'Niedrig', abIndex: 0 },
    { schweregrad: null, name: 'Mäßig', abIndex: 3 },
    { schweregrad: null, name: 'Hoch', abIndex: 6 },
    { schweregrad: 1, name: 'Sehr hoch', abIndex: 8 },
    { schweregrad: 2, name: 'Extrem', abIndex: 11 }
];

function ermittleUvEinstufung(uvIndex) {
    let treffer = UV_SKALA[0];
    for (const stufe of UV_SKALA) {
        if (uvIndex >= stufe.abIndex) treffer = stufe; else break;
    }
    return treffer;
}

function bewerteUv(standort) {
    const uvIndex = leseAktuellenRohwert(standort, 'UV Index');
    if (typeof uvIndex !== 'number') return null;

    const einstufung = ermittleUvEinstufung(uvIndex);
    if (einstufung.schweregrad === null) return null;

    return {
        typ: 'uv', schweregrad: einstufung.schweregrad, titel: `UV-Index ${einstufung.name}`,
        text: `UV-Index ${uvIndex.toFixed(1)} (${einstufung.name} nach der WHO-Skala)${einstufung.schweregrad >= 2 ? ' – die höchste Gefährdungsstufe.' : '.'} Ungeschützte Haut kann hier in wenigen Minuten Schaden nehmen. Kein DWD-Vergleich möglich: die UV-Skala ist ein absoluter, ortsunabhängiger Maßstab, kein Klimamittel.`
    };
}

// --- Trockenheit: keine einzelne "Normwarnschwelle" existiert für Außenluft, deshalb
// eigene, an reale Referenzwerte angelehnte Stufen (Waldbrand-Gefahrenindizes nutzen
// üblicherweise <30 % rel. Feuchte in Kombination mit Wärme als Kernkriterium; <40 %
// gilt in Mitteleuropa bereits als spürbar trockener als die meisten Tage). 50 % - wie
// zunächst vorgeschlagen - ist in Potsdam eine ganz gewöhnliche Luftfeuchte und würde
// praktisch dauerhaft auslösen, daher bewusst nicht als Schwelle verwendet.
const TROCKENHEITS_HINWEIS_SCHWELLE = 40;
const TROCKENHEITS_WARNUNG_SCHWELLE = 30;
const TROCKENHEITS_HITZE_KOMBI_SCHWELLE_GRAD = 25;

function bewerteTrockenheit(standort) {
    const feuchte = leseAktuellenRohwert(standort, 'Air Humidity');
    if (typeof feuchte !== 'number') return null;
    if (feuchte >= TROCKENHEITS_HINWEIS_SCHWELLE) return null;

    const temperatur = leseAktuellenRohwert(standort, 'Air Temperature');
    const heissUndTrocken = feuchte < TROCKENHEITS_WARNUNG_SCHWELLE
        && typeof temperatur === 'number' && temperatur >= TROCKENHEITS_HITZE_KOMBI_SCHWELLE_GRAD;

    if (feuchte < TROCKENHEITS_WARNUNG_SCHWELLE) {
        return {
            typ: 'trockenheit', schweregrad: heissUndTrocken ? 2 : 1, titel: 'Trockenheitswarnung',
            text: heissUndTrocken
                ? `${feuchte.toFixed(0)} % relative Luftfeuchte bei gleichzeitig ${temperatur.toFixed(1)} °C – diese Kombination aus Hitze und trockener Luft erhöht die Vegetationsbrandgefahr und die Austrocknung von Böden und Pflanzen spürbar (vereinfacht angelehnt an die Kernfaktoren realer Waldbrand-Gefahrenindizes).`
                : `${feuchte.toFixed(0)} % relative Luftfeuchte – deutlich unter dem für Potsdam üblichen Bereich, spürbar trockene Luft.`
        };
    }

    return {
        typ: 'trockenheit', schweregrad: 0, titel: 'Trockene Luft',
        text: `${feuchte.toFixed(0)} % relative Luftfeuchte – niedriger als an den meisten Tagen, aber noch kein Grund zur Sorge.`
    };
}

// --- Hitze: bestehende Schwelle aus script.js (HITZEWARNUNG_SCHWELLE_GRAD = 34°C) ---
function bewerteHitze(standort) {
    const temperatur = leseAktuellenRohwert(standort, 'Air Temperature');
    if (typeof temperatur !== 'number' || temperatur < HITZEWARNUNG_SCHWELLE_GRAD) return null;

    const schweregrad = temperatur >= 38 ? 2 : 1; // 38°C: zusätzliche Stufe für außergewöhnliche Extremhitze
    return {
        typ: 'hitze', schweregrad, titel: 'Hitzewarnung',
        text: `${temperatur.toFixed(1)} °C – über der Schwelle von ${HITZEWARNUNG_SCHWELLE_GRAD} °C, ab der hier von einer bioklimatischen Belastung ausgegangen wird.`
    };
}

// Alle aktuell relevanten Warnungen/Hinweise eines Standorts (0 bis mehrere gleichzeitig,
// z. B. Hitze + Trockenheit im selben Sommer). Jede bewerteX()-Funktion liefert null,
// wenn für dieses Feld nichts zu melden ist oder der Messwert fehlt.
function ermittleWarnungenFuerStandort(standort) {
    return [bewerteHitze(standort), bewerteWind(standort), bewerteUv(standort), bewerteTrockenheit(standort)]
        .filter(Boolean);
}
