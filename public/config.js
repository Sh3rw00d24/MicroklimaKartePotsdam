/**
 * Standort-Konfiguration
 * ======================
 *
 * Hier stehen alle Messstandorte, die auf der Karte erscheinen sollen. Für jeden
 * Standort gibt es genau EIN wichtiges Feld: "resourceId". Das ist die sogenannte
 * "resource_id" aus der CKAN-Datenplattform (steht in jedem API-Link, z. B. bei
 *   https://ckan.urbanedatenplattform-potsdam.de/dataset/.../resource/<HIER STEHT SIE>/download/...
 * oder direkt im JavaScript-Beispielcode der Plattform als "resource_id: '...'").
 *
 * Sobald ein neuer Sensor an einem Standort in Betrieb geht, muss hier nur die
 * passende resourceId eingetragen werden – der Standort läuft dann automatisch mit
 * echten Live-Daten. Solange resourceId noch "null" ist, zeigt das Dashboard den
 * Standort als "Sensor noch nicht angebunden" an.
 *
 * lat/lng sind die Koordinaten, an denen der Punkt auf der Karte erscheint. Sobald
 * ein Sensor Daten mit einem eigenen "geo_point" sendet, übernimmt das Dashboard
 * automatisch dessen tatsächliche Position – lat/lng hier ist dann nur noch die
 * Startposition, bevor die erste Antwort da ist.
 *
 * hinweis (optional) erscheint nirgends auf der Seite, sondern nur hier im Code –
 * als Erinnerung, welche Koordinaten noch händisch geprüft werden sollten.
 */

const STANDORTE = [
    {
        id: 'steubenplatz-alter-markt',
        name: 'am Steubenplatz / Alter Markt',
        lat: 52.39533,
        lng: 13.05943,
        resourceId: 'fd84a408-8f53-4b52-b989-b9b8877dac32'
    },
    {
        id: 'stadtbad-babelsberg',
        name: 'Stadtbad Babelsberg',
        lat: 52.40573,
        lng: 13.08504,
        resourceId: '75b42788-dda2-4f04-861a-d185727f0eaa'
    },
    {
        id: 'krampnitz',
        name: 'Stadtteil Krampnitz',
        lat: 52.46062,
        lng: 13.04624,
        resourceId: 'c17a45ee-50e0-4f81-a573-830a43f0f2cf'
    },
    {
        id: 'karl-liebknecht-station',
        name: 'Karl Liebknecht Station',
        lat: 52.39915,
        lng: 13.09471,
        resourceId: '66464ee9-81db-4fa7-95ba-4a1fe5a52acd'
    },

    // --- Ab hier: Standorte, für die aktuell noch keine Sensor-Ressource auf der
    //     CKAN-Plattform veröffentlicht ist. Koordinaten wurden über OpenStreetMap
    //     ermittelt, damit die Punkte schon einmal richtig auf der Karte sitzen. ---
    {
        id: 'waldbad-templin',
        name: 'Waldbad Templin',
        lat: 52.36030,
        lng: 13.02094,
        resourceId: null
    },
    {
        id: 'schule-am-schloss',
        name: 'Schule am Schloss',
        lat: 52.42036,
        lng: 13.05113,
        resourceId: null
    },
    {
        id: 'wassersportzentrum-hermannswerder',
        name: 'Wassersportzentrum Hermannswerder',
        lat: 52.38531,
        lng: 13.03952,
        resourceId: null
    },
    {
        id: 'johann-boumann-platz',
        name: 'Johann Boumann Platz',
        lat: 52.39680,
        lng: 13.06050,
        resourceId: null,
        hinweis: 'Konnte nicht über OpenStreetMap gefunden werden – Koordinate ist eine Schätzung (Nähe Nikolaikirche/Alter Markt). Bitte vor Inbetriebnahme prüfen.'
    },
    {
        id: 'uni-campus-griebnitzsee',
        name: 'Uni Potsdam Campus Griebnitzsee',
        lat: 52.39332,
        lng: 13.12816,
        resourceId: null
    },
    {
        id: 'uni-campus-golm',
        name: 'Uni Potsdam Campus Golm',
        lat: 52.40844,
        lng: 12.97620,
        resourceId: null
    },
    {
        id: 'wasserspielplatz-volkspark',
        name: 'Wasserspielplatz Volkspark',
        lat: 52.42274,
        lng: 13.04870,
        resourceId: null,
        hinweis: 'Koordinate zeigt auf den Volkspark Potsdam allgemein, nicht exakt auf den Wasserspielplatz. Bitte bei Bedarf feinjustieren.'
    },
    {
        id: 'kepplerplatz',
        name: 'Kepplerplatz',
        lat: 52.37698,
        lng: 13.13002,
        resourceId: null,
        hinweis: 'Zugeordnet über "Johannes-Kepler-Platz" im Stern. Bitte prüfen, ob das der gemeinte Standort ist.'
    },
    {
        id: 'stiftung-schloesser-gaerten',
        name: 'Stiftung preussische Schlösser und Gärten',
        lat: 52.40037,
        lng: 13.04465,
        resourceId: null
    },
    {
        id: 'kita-sausewind',
        name: 'KiTa Sausewind',
        lat: 52.39470,
        lng: 13.07506,
        resourceId: null
    },
    {
        id: 'freie-schule-schlaatz',
        name: 'Freie Schule Schlaatz',
        lat: 52.37581,
        lng: 13.10069,
        resourceId: null
    },
    {
        id: 'kellertor',
        name: 'Kellertor',
        lat: 52.39899,
        lng: 13.07141,
        resourceId: null
    },
    {
        id: 'yorkstrasse',
        name: 'Yorkstraße',
        lat: 52.39720,
        lng: 13.05786,
        resourceId: null
    },
    {
        id: 'strasse-am-kanal',
        name: 'Straße am Kanal',
        lat: 52.39834,
        lng: 13.06499,
        resourceId: null
    },
    {
        id: 'cornelius-gesamtschule',
        name: 'Cornelius Gesamtschule',
        lat: 52.40000,
        lng: 13.05000,
        resourceId: null,
        hinweis: 'Konnte nicht eindeutig über OpenStreetMap gefunden werden. Koordinate ist ein Platzhalter auf der Potsdamer Innenstadt – bitte unbedingt korrigieren.'
    },
    {
        id: 'uni-campus-neues-palais',
        name: 'Uni Potsdam Campus Neues Palais',
        lat: 52.40144,
        lng: 13.00879,
        resourceId: null
    },
    {
        id: 'von-steuben-gesamtschule-kirchsteigfeld',
        name: 'von Steuben Gesamtschule, Kirchsteigfeld',
        lat: 52.36433,
        lng: 13.13742,
        resourceId: null
    },
    {
        id: 'wissenschaftspark-albert-einstein',
        name: 'Wissenschaftspark Albert Einstein',
        lat: 52.38279,
        lng: 13.06620,
        resourceId: null
    }
];
