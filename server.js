    /**
 * Stadtpuls Potsdam – kleiner Hilfsserver
 * ========================================
 *
 * Warum gibt es diesen Server überhaupt?
 * ---------------------------------------
 * Die Wetterdaten liegen auf der "Urbanen Datenplattform Potsdam"
 * (ckan.urbanedatenplattform-potsdam.de). Diese Plattform sendet beim Beantworten
 * einer Anfrage keine sogenannten CORS-Header mit. Das bedeutet: ein Browser darf
 * die Daten NICHT direkt von einer eigenen Webseite aus abrufen – das blockiert der
 * Browser aus Sicherheitsgründen automatisch (das wurde vor dem Bau dieses Projekts
 * gezielt getestet, es liegt nicht an einer falschen Anfrage).
 *
 * Die Lösung dafür ist denkbar einfach: Dieser kleine Node.js-Server ruft die Daten
 * "im Hintergrund" (also nicht aus dem Browser heraus) bei CKAN ab – dort gilt die
 * Beschränkung nämlich nicht – und reicht sie anschließend an das Dashboard im
 * Browser weiter. Man nennt so etwas einen "Proxy".
 *
 * Gleichzeitig liefert dieser Server auch die eigentliche Webseite (alles im Ordner
 * "public") aus. Man startet also nur diesen einen Server und hat sowohl die Seite
 * als auch den Datenzugriff beisammen.
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Adresse der CKAN-Schnittstelle, über die alle Sensordaten abgerufen werden.
const CKAN_SUCHE_URL = 'https://ckan.urbanedatenplattform-potsdam.de/api/action/datastore_search';

// Wie viele Messwerte maximal auf einmal von CKAN geholt werden dürfen.
// 10.000 Datensätze reichen bei den bisherigen Stationen (Messung ca. alle 1-2
// Stunden) für mehrere Jahre Verlauf – das deckt "gesamter Zeitraum" locker ab.
// Falls eine Station künftig deutlich häufiger sendet, kann der Wert hier einfach
// erhöht werden.
const MAX_MESSWERTE_PRO_ABRUF = 10000;

app.use(express.static(path.join(__dirname, 'public')));

/**
 * Liefert die Messwerte einer einzelnen Sensor-Ressource von CKAN.
 *
 * Aufruf durch das Dashboard z. B. so:
 *   /api/messwerte/fd84a408-8f53-4b52-b989-b9b8877dac32?limit=5000
 *
 * Der Teil hinter "/api/messwerte/" ist genau die CKAN "resource_id", wie sie in
 * public/config.js bei jedem Standort hinterlegt ist.
 */
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
                // Kein "sort"-Parameter: CKAN liefert ohne Sortierangabe die neuesten
                // Messwerte zuerst (geprüftes Verhalten dieser Plattform). Das passt
                // genau zu dem, was das Dashboard braucht.
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
//test