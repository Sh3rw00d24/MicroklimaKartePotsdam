// Messstandorte auf der Karte.
// resourceId: CKAN-Ressourcen-ID des Sensors (aus dessen API-Link/Datensatz-URL).
//   null = noch kein Sensor -> Dashboard zeigt "noch nicht angebunden".
// lat/lng: manuell gepflegt. Der geo_point aus der API entspricht dem LoRaWAN-
//   Gateway, nicht zwingend dem Sensor - script.js übernimmt ihn nur, wenn er
//   nah genug an dieser Koordinate liegt (siehe MAX_PLAUSIBLE_ABWEICHUNG_KM).
// datenquelleUrl: Link zum Rohdatensatz auf der UDP (optional, wird im Popup gezeigt).
const STANDORTE = [
    {
        id: 'stadtwerke',
        name: 'Stadtwerke Potsdam',
        lat:  52.38258, 
        lng: 13.14078,
        resourceId: '647a3953-222f-4b2c-b837-3c60bfbb3e40',
        datenquelleUrl: ' https://ckan.urbanedatenplattform-potsdam.de/dataset/770e80e1-8a7d-4768-9af7-bcea6fa6d44d/resource/647a3953-222f-4b2c-b837-3c60bfbb3e40'
    },
    {
        id: 'steubenplatz-alter-markt',
        name: 'am Steubenplatz / Alter Markt',
        lat: 52.39533,
        lng: 13.05943,
        resourceId: '07f7d2ba-4885-4550-82af-839278ed410b',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/c986ce1b-9f02-491f-a236-10a9dfbc8f3e/resource/07f7d2ba-4885-4550-82af-839278ed410b'
    },
    {
        id: 'stadtbad-babelsberg',
        name: 'Stadtbad Babelsberg',
        lat: 52.4057289314038,
        lng: 13.085039746744865,
        resourceId: '969183f0-736e-4aa5-9e40-368728903ba9',
        datenquelleUrl: ' https://ckan.urbanedatenplattform-potsdam.de/dataset/70f2678a-0426-43ca-a22a-5ee474416fa9/resource/969183f0-736e-4aa5-9e40-368728903ba9'
    },
    {
        id: 'krampnitz',
        name: 'Nordgymnasium Krampnitz',
        lat: 52.4581,
        lng: 13.0472,
        resourceId: '97b07d43-bf05-44dd-bb56-e678d645169a',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/97c35f6e-9fc1-4314-bdc9-4a4bf2dd1b57/resource/97b07d43-bf05-44dd-bb56-e678d645169a'
    },
    {
        id: 'karl-liebknecht-station',
        name: 'Karl Liebknecht Station',
        lat: 52.399112,
        lng: 13.094717,
        resourceId: '9022c4f0-1bdf-41e9-8c4d-7ce2f4f9b13b',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/649cb447-46d3-4a8c-b42e-7fa5fb56ff58/resource/9022c4f0-1bdf-41e9-8c4d-7ce2f4f9b13b'
    },
    {
        id: 'waldbad-templin',
        name: 'Waldbad Templin',
        lat: 52.360015,
        lng: 13.020075,
        resourceId: '549a6420-03c8-45e9-9ec5-14a0aad67e3a',
        datenquelleUrl: ' https://ckan.urbanedatenplattform-potsdam.de/dataset/dc2cd9f8-44a9-4cf6-89f0-67f286959223/resource/549a6420-03c8-45e9-9ec5-14a0aad67e3a',
        hinweis: 'Gemeldeter geo_point liegt rund 8 km entfernt (Nähe Stern/Kirchsteigfeld) - das ist das LoRaWAN-Gateway, nicht der Sensor, und wird daher ignoriert (siehe MAX_PLAUSIBLE_ABWEICHUNG_KM in script.js). Marker bleibt an dieser Koordinate.'
    },
    {
        id: 'wassersportzentrum-hermannswerder',
        name: 'Wassersportzentrum Hermannswerder',
        lat: 52.38230,
        lng: 13.03945,
        resourceId: 'e818bbbd-258e-4ac6-b472-c33d39ce3d37',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/82f63c4d-d09c-43ff-a1e1-1f7d39d77b6b/resource/e818bbbd-258e-4ac6-b472-c33d39ce3d37'
    },
    {
        id: 'johann-boumann-platz',
        name: 'Johann Boumann Platz',
        lat: 52.41372,
        lng: 13.03812,
        resourceId: null,
        hinweis: 'Konnte nicht über OpenStreetMap gefunden werden – Koordinate ist eine Schätzung (Nähe Nikolaikirche/Alter Markt). Bitte vor Inbetriebnahme prüfen.'
    },
    {
        id: 'uni-campus-griebnitzsee',
        name: 'Uni Potsdam Campus Griebnitzsee',
        lat: 52.39332,
        lng: 13.12912,
        resourceId: null
    },
    {
        id: 'uni-campus-golm',
        name: 'Uni Potsdam Campus Golm',
        lat: 52.4081260,
        lng: 12.9760662,
        resourceId: null
    },
    {
        id: 'hoffbauer-kita', 
        name: 'Kita Hoffbauer "Regenbogenland"', 
        lat: 52.38447,
        lng: 13.13858,
        resourceId: 'af27322f-2852-4c56-86b2-bc8cf4c45fda',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/3cb6ef68-d74c-4cbb-ae39-cd7c1ca996c8/resource/af27322f-2852-4c56-86b2-bc8cf4c45fda'
    },
    {
        id: 'wasserspielplatz-volkspark',
        name: 'Wasserspielplatz Volkspark',
        lat: 52.41816,
        lng: 13.04480,
        resourceId: 'af27322f-2852-4c56-86b2-bc8cf4c45fda',
        datenquelleUrl: ' https://ckan.urbanedatenplattform-potsdam.de/dataset/3cb6ef68-d74c-4cbb-ae39-cd7c1ca996c8/resource/af27322f-2852-4c56-86b2-bc8cf4c45fda',
        hinweis: 'Dieselbe resourceId wie "hoffbauer-kita" - bitte prüfen, ob das beabsichtigt ist (z. B. weil ein Sensor beide Standorte abdeckt) oder ob hier eigentlich eine eigene resource_id eingetragen werden sollte.'
    },
    {
        id: 'kepplerplatz',
        name: 'Kepplerplatz',
        lat: 52.37642,
        lng: 13.12976,
        resourceId: '2ae838e8-8fee-479f-83e2-6b963e97efe8',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/a75632e5-1d2a-4288-bfea-9368d121942d/resource/2ae838e8-8fee-479f-83e2-6b963e97efe8'
    },
    {
        id: 'kita-sausewind',
        name: 'KiTa Sausewind',
        lat: 52.39482,
        lng: 13.07486,
        resourceId: 'a6d57191-89d0-4d8f-b1c6-29feda06167a',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/af07c52d-b950-461c-82f2-9b8e66281725/resource/a6d57191-89d0-4d8f-b1c6-29feda06167a'
    },
    {
        id: 'familienzentrum-biesamkiez-kis',
        name: 'Familienzentrum-Biesamkiez',
        lat: 52.37577,
        lng: 13.10028,
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
    }
];
