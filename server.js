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

const app = express();
const PORT = process.env.PORT || 3000;

const CKAN_SUCHE_URL = 'https://ckan.urbanedatenplattform-potsdam.de/api/action/datastore_search';

// 10.000 Datensätze decken bei aktueller Sendefrequenz (~1-2h) mehrere Jahre ab -
// reicht locker für "gesamter Zeitraum". Bei Bedarf einfach erhöhen.
const MAX_MESSWERTE_PRO_ABRUF = 10000;

app.use(express.static(path.join(__dirname, 'public')));

// Messwerte einer CKAN-Ressource abrufen, z. B. /api/messwerte/<resourceId>?limit=5000
// <resourceId> ist die CKAN "resource_id", wie sie in public/config.js hinterlegt ist.
app.get('/api/messwerte/:resourceId', async (req, res) => {
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

app.listen(PORT, () => {
    console.log(`Stadtpuls Potsdam läuft auf http://localhost:${PORT}`);
});
