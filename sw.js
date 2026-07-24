/**
 * Service Worker – Daglig tillsyn traverser
 *
 * Höj CACHE_VERSION varje gång index.html ändras. Då rensas den gamla
 * cachen och alla enheter hämtar den nya versionen automatiskt vid
 * nästa öppning – ingen behöver ta bort och lägga till ikonen på nytt.
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = 'travers-' + CACHE_VERSION;

const FILER = [
  './',
  './index.html'
];

/* Installera: cacha skalet och ta över direkt */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(FILER); })
      .then(function () { return self.skipWaiting(); })
  );
});

/* Aktivera: rensa alla gamla cacheversioner */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (nycklar) {
      return Promise.all(nycklar.map(function (n) {
        if (n !== CACHE_NAME) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/**
 * Hämtning:
 *  - Apps Script och andra API-anrop går alltid till nätet, aldrig cache.
 *  - Sidnavigering: nätet först, cache som reserv (fungerar offline).
 *  - Övrigt: cache först, nätet som reserv.
 */
self.addEventListener('fetch', function (e) {
  const url = new URL(e.request.url);

  if (e.request.method !== 'GET') return;

  if (url.hostname.indexOf('script.google.com') !== -1 ||
      url.hostname.indexOf('script.googleusercontent.com') !== -1) {
    return;
  }

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(function (svar) {
          const kopia = svar.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(e.request, kopia); });
          return svar;
        })
        .catch(function () {
          return caches.match(e.request).then(function (traff) {
            return traff || caches.match('./index.html');
          });
        })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function (traff) {
      return traff || fetch(e.request).then(function (svar) {
        if (svar && svar.status === 200 && svar.type === 'basic') {
          const kopia = svar.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(e.request, kopia); });
        }
        return svar;
      });
    }).catch(function () {
      return caches.match('./index.html');
    })
  );
});

/* Tillåter appen att tvinga fram aktivering av en väntande version */
self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
