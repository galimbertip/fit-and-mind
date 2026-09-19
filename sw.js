// Fit & Mind - Service Worker
// Cache "stale-while-revalidate" per l'app shell, così l'app si apre anche offline
// o con connessione debole. Non intercetta MAI richieste verso altri domini
// (Firebase, CDN): quelle passano dritte in rete, altrimenti la sync smetterebbe
// di funzionare.

const CACHE_VERSION = 'fit-and-mind-v6.0.1';
const APP_SHELL = [
    './',
    './index.html',
    './engine.js',
    './app.js',
    './ambiently.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png'
];

// IMPORTANTE (bug corretto in v6.0.1): sia qui in install sia nel fetch handler qui sotto,
// le richieste di rete usano { cache: 'reload' } / { cache: 'no-store' } per ignorare
// esplicitamente la cache HTTP del browser (quella dei file, non la Cache Storage di questo
// service worker). Senza questo, "cache.addAll(APP_SHELL)" può infilare nella cache NUOVA
// una copia di app.js/index.html ancora vecchia se il browser l'aveva già salvata su disco
// da una visita precedente — il service worker cambia nome di cache (quindi sembra
// "aggiornato"), ma il contenuto dentro resta quello di prima. Concretamente questo ha fatto
// vedere alcune pagine con il numero di versione già nuovo ma il codice (allenamento guidato,
// icone, audio) ancora vecchio.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => Promise.all(
                APP_SHELL.map((url) =>
                    fetch(url, { cache: 'reload' })
                        .then((response) => cache.put(url, response))
                        .catch(() => {}) // un singolo file irraggiungibile non deve bloccare l'installazione
                )
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Mai intercettare origini esterne (Firebase, gstatic, CDN icone) o richieste non GET.
    if (url.origin !== self.location.origin || event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            const networkFetch = fetch(event.request, { cache: 'no-store' })
                .then((response) => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || networkFetch;
        })
    );
});
