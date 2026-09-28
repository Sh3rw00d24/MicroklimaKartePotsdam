// Kleiner Server für Stadtpuls Potsdam.
//
// Warum überhaupt ein Server? Die Urbane Datenplattform Potsdam (CKAN) sendet
// keine CORS-Header - ein Browser darf ihre Daten deshalb nicht direkt von einer
// eigenen Webseite abrufen (geprüft, liegt nicht an der Anfrage). Dieser Server
// holt die Daten stattdessen im Hintergrund ab (kein Browser, keine CORS-Regel)
// und reicht sie ans Dashboard weiter - klassischer Proxy. Gleichzeitig liefert
// er auch die Webseite selbst aus (Ordner "public"), also genügt ein Prozess.

const express = require('express');
const path = require('path');
const { holeDwdReferenzdaten } = require('./dwd-klimadaten');

const app = express();
const PORT = process.env.PORT || 3000;

// Nur nötig, wenn die Seite hinter einem Reverse-Proxy unter einem Unterpfad läuft
// UND dieser Proxy den Pfad unverändert durchreicht (z. B. "/mikroklima/api/..." kommt
// genauso bei diesem Server an) - dann hier denselben Pfad eintragen, z. B.
// BASE_PATH=/mikroklima. Entfernt der Proxy den Unterpfad selbst (empfohlen, siehe
// README "Deployment unter einem Unterpfad"), bleibt BASE_PATH leer, Standardverhalten
// unverändert. Das Frontend (public/config.js, APP_BASIS_PFAD) erkennt seinen Unterpfad
// in jedem Fall automatisch am eigenen Skript-Tag - unabhängig von dieser Variable.
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');

const CKAN_SUCHE_URL = 'https://ckan.urbanedatenplattform-potsdam.de/api/action/datastore_search';

// 10.000 Datensätze decken bei aktueller Sendefrequenz (~1-2h) mehrere Jahre ab -
// reicht locker für "gesamter Zeitraum". Bei Bedarf einfach erhöhen.
const MAX_MESSWERTE_PRO_ABRUF = 10000;

// Bei gesetztem BASE_PATH auch den nackten Unterpfad ohne Schrägstrich abfangen (z. B.
// "/mikroklima" -> "/mikroklima/") - sonst lösen Browser relative Pfade wie "style.css"
// fälschlich gegen die Domain-Wurzel statt gegen den Unterpfad auf. Bewusst über
// req.path statt app.get(BASE_PATH, ...): Express' Standard-Routing behandelt
// "/mikroklima" und "/mikroklima/" als dieselbe Route (nicht strikt), das würde hier
// sonst zu einer Endlosschleife führen (Route matcht ihr eigenes Redirect-Ziel).
if (BASE_PATH) {
    app.use((req, res, next) => {
        if (req.path === BASE_PATH) return res.redirect(301, `${BASE_PATH}/`);
        next();
    });
}

app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));

// Messwerte einer CKAN-Ressource abrufen, z. B. /api/messwerte/<resourceId>?limit=5000
// <resourceId> ist die CKAN "resource_id", wie sie in public/config.js hinterlegt ist.
app.get(`${BASE_PATH}/api/messwerte/:resourceId`, async (req, res) => {
    const resourceId = req.params.resourceId;
    const angefragteAnzahl = Number(req.query.limit) || MAX_MESSWERTE_PRO_ABRUF;
    const anzahl = Math.min(Math.max(angefragteAnzahl, 1), MAX_MESSWERTE_PRO_ABRUF);

    try {
        const ckanAntwort = await fetch(CKAN_SUCHE_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                resource_id: resourceId,
                limit: anzahl
                // Kein "sort": CKAN liefert ohne Sortierangabe neueste zuerst - genau richtig so.
            })
        });

        if (!ckanAntwort.ok) {
            return res.status(502).json({
                erfolgreich: false,
                fehlermeldung: `Die Datenplattform hat mit Status ${ckanAntwort.status} geantwortet.`
            });
        }

        const daten = await ckanAntwort.json();

        if (!daten.success) {
            return res.status(502).json({
                erfolgreich: false,
                fehlermeldung: daten.error?.message || 'Unbekannter Fehler von der Datenplattform.'
            });
        }

        res.json({
            erfolgreich: true,
            gesamtAnzahlBeiCkan: daten.result.total,
            felder: daten.result.fields,
            messwerte: daten.result.records
        });
    } catch (fehler) {
        console.error(`Fehler beim Abruf der Ressource ${resourceId}:`, fehler);
        res.status(500).json({
            erfolgreich: false,
            fehlermeldung: 'Der Server konnte keine Verbindung zur Datenplattform aufbauen.'
        });
    }
});

// DWD-Referenzdaten für Potsdam (Klimanormal + Erwärmungstrend), siehe dwd-klimadaten.js.
app.get(`${BASE_PATH}/api/dwd/referenz`, async (req, res) => {
    try {
        res.json(await holeDwdReferenzdaten());
    } catch (fehler) {
        console.error('Fehler beim Laden der DWD-Referenzdaten:', fehler);
        res.status(502).json({ erfolgreich: false, fehlermeldung: fehler.message || 'DWD-Referenzdaten konnten nicht geladen werden.' });
    }
});

app.listen(PORT, () => {
    console.log(`Stadtpuls Potsdam läuft auf http://localhost:${PORT}${BASE_PATH}/`);
    holeDwdReferenzdaten().catch(fehler => console.warn('DWD-Referenzdaten (Hintergrund-Vorabladen) fehlgeschlagen:', fehler.message));
});
