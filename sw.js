const CACHE_NAME = 'pestovo-v12';
const OFFLINE_URL = 'offline.html';

const STATIC_ASSETS = [
    './', 'index.html', 'live.html', 'solo.html', 'leaderboard.html',
    'players.html', 'tournaments.html', 'stats.html', 'handicap.html',
    'admin.html', 'auth.html', 'offline.html', 'manifest.json',
    'css/style.css', 'js/firebase-config.js', 'js/utils.js',
    'js/auth.js', 'js/app.js', 'js/live.js', 'js/solo.js',
    'js/leaderboard.js', 'js/players.js', 'js/tournaments.js',
    'js/stats.js', 'js/admin.js', 'js/pwa.js', 'img/logo.png'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(STATIC_ASSETS.map(function(url) {
                return new Request(url, { mode: 'no-cors' });
            })).catch(function(err) { console.warn('[SW] Cache error:', err); });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(names.filter(function(name) {
                return name !== CACHE_NAME;
            }).map(function(name) { return caches.delete(name); }));
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', function(event) {
    var url = event.request.url;
    if (event.request.method !== 'GET') return;
    if (url.indexOf('firebaseio.com') !== -1 || url.indexOf('googleapis.com') !== -1) return;
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            if (cached) return cached;
            return fetch(event.request).catch(function() {
                if (event.request.destination === 'document') return caches.match(OFFLINE_URL);
                return new Response('', { status: 408 });
            });
        })
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    var targetUrl = (event.notification.data && event.notification.data.url) || 'admin.html';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.indexOf('admin.html') !== -1 && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});