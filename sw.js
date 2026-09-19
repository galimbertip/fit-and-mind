// Fit & Mind - Service Worker
// Cache "stale-while-revalidate" per l'app shell, così l'app si apre anche offline
// o con connessione debole. Non intercetta MAI richieste verso altri domini
// (Firebase, CDN): quelle passano dritte in rete, altrimenti la sync smetterebbe
// di funzionare.

const CACHE_VERSION = 'fit-and-mind-v5.2.0';
const APP_SHELL = [
    './',
    './index.html',
    './engine.js',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(APP_SHELL))
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
            const networkFetch = fetch(event.request)
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
