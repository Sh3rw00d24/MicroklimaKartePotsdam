// Messstandorte auf der Karte.
// resourceId: CKAN-Ressourcen-ID des Sensors (aus dessen API-Link/Datensatz-URL).
//   null = noch kein Sensor -> Dashboard zeigt "noch nicht angebunden".
// lat/lng: manuell gepflegt. Der geo_point aus der API entspricht dem LoRaWAN-
//   Gateway, nicht zwingend dem Sensor - script.js übernimmt ihn nur, wenn er
//   nah genug an dieser Koordinate liegt (siehe MAX_PLAUSIBLE_ABWEICHUNG_KM).
// datenquelleUrl: Link zum Rohdatensatz auf der UDP (optional, wird im Popup gezeigt).
const STANDORTE = [
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
        resourceId: '42cbab4d-7f0a-4dcd-b48b-2febfb671275',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/e7d0cbea-7045-46f1-9dd7-95e6f39299bb/resource/42cbab4d-7f0a-4dcd-b48b-2febfb671275'
    },
    {
        id: 'krampnitz',
        name: 'Stadtteil Krampnitz',
        lat: 52.46062,
        lng: 13.04624,
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
        resourceId: 'a0c1a961-7591-4a8a-a0f5-8cfc91c01b90',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/d1fe061d-c956-4ed8-a194-c3044b91e79a/resource/a0c1a961-7591-4a8a-a0f5-8cfc91c01b90',
        hinweis: 'Gemeldeter geo_point liegt rund 8 km entfernt (Nähe Stern/Kirchsteigfeld) - das ist das LoRaWAN-Gateway, nicht der Sensor, und wird daher ignoriert (siehe MAX_PLAUSIBLE_ABWEICHUNG_KM in script.js). Marker bleibt an dieser Koordinate.'
    },
    {
        id: 'wassersportzentrum-hermannswerder',
        name: 'Wassersportzentrum Hermannswerder',
        lat: 52.38230,
        lng: 13.03945,
        resourceId: '7fda3495-ac56-4a9f-82be-603fd4aa3328',
        datenquelleUrl: ' https://ckan.urbanedatenplattform-potsdam.de/dataset/46a9bdcb-d390-4570-9673-d774a0d79840/resource/7fda3495-ac56-4a9f-82be-603fd4aa3328'
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
        resourceId: '02f2e3e6-7539-4c44-9d36-add2847e6c7b',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/3135b1fd-623b-4d3a-aca6-33dbce81cf98/resource/02f2e3e6-7539-4c44-9d36-add2847e6c7b' 
    },
    {
        id: 'wasserspielplatz-volkspark',
        name: 'Wasserspielplatz Volkspark',
        lat: 52.41816,
        lng: 13.04480,
        resourceId: 'a25714ae-0270-4a0c-a0cc-d6bbcee906c0',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/b868240d-2568-41dd-bc24-495df7aa8c87/resource/a25714ae-0270-4a0c-a0cc-d6bbcee906c0'
    },
    {
        id: 'kepplerplatz',
        name: 'Kepplerplatz',
        lat: 52.37642,
        lng: 13.12976,
        resourceId: 'b42e144b-f1c9-44aa-a366-25060423d627',
        datenquelleUrl: 'https://ckan.urbanedatenplattform-potsdam.de/dataset/69ba82a7-d536-4e59-9ae4-75f329a40114/resource/b42e144b-f1c9-44aa-a366-25060423d627'
    },
    {
        id: 'kita-sausewind',
        name: 'KiTa Sausewind',
        lat: 52.39482,
        lng: 13.07486,
        resourceId: null
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
