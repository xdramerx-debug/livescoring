const CACHE_NAME = 'pestovo-v1.12.0';
const OFFLINE_URL = 'offline.html';

const STATIC_ASSETS = [
    './', 'index.html', 'setup-round.html', 'leaderboard.html',
    'guide.html', 'feed.html', 'predictor.html', 'order-of-merit.html', 'tv.html',
    'players.html', 'tournaments.html', 'stats.html', 'handicap.html',
    'admin.html', 'auth.html', 'scorer.html', 'marker.html', 'offline.html',
    'manifest.json', 'css/style.css?v=2', 'js/firebase-config.js', 'js/utils.js?v=20',
    'js/auth.js', 'js/app.js?v=2', 'js/live.js?v=17', 'js/solo.js?v=18',
    'js/leaderboard.js', 'js/players.js', 'js/tournaments.js',
    'js/stats.js', 'js/handicap.js', 'js/admin.js?v=15', 'js/scorer.js',
    'js/marker.js', 'js/guide.js', 'js/feed.js', 'js/predictor.js',
    'js/order-of-merit.js', 'js/pwa.js', 'img/logo.png',
    'img/icon-192.png', 'img/icon-512.png', 'img/icon-180.png'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            // Один временно недоступный ресурс не должен ломать установку PWA целиком.
            return Promise.all(STATIC_ASSETS.map(function(url) {
                return cache.add(url).catch(function(error) {
                    console.warn('[SW] Cannot precache ' + url, error);
                });
            }));
        }).then(function() { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(names.filter(function(name) {
                return name !== CACHE_NAME;
            }).map(function(name) { return caches.delete(name); }));
        }).then(function() { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;

    var requestUrl = new URL(event.request.url);
    var isSameOrigin = requestUrl.origin === self.location.origin;

    // API и прокси всегда читаются из сети: кэшированные данные здесь опасны.
    if (!isSameOrigin || requestUrl.hostname.indexOf('firebaseio.com') !== -1 ||
        requestUrl.hostname.indexOf('googleapis.com') !== -1 ||
        requestUrl.hostname.indexOf('hcp.rusgolf.ru') !== -1 ||
        requestUrl.hostname.indexOf('r.jina.ai') !== -1 ||
        requestUrl.hostname.indexOf('allorigins') !== -1 ||
        requestUrl.hostname.indexOf('codetabs') !== -1 ||
        requestUrl.hostname.indexOf('corsproxy') !== -1) return;

    // Для страниц сначала сеть: после релиза пользователь сразу получает свежий HTML.
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request).then(function(response) {
                if (response && response.ok) {
                    var copy = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
                }
                return response;
            }).catch(function() {
                return caches.match(event.request).then(function(cached) {
                    return cached || caches.match(OFFLINE_URL);
                });
            })
        );
        return;
    }

    // Статика открывается мгновенно из кэша и обновляется в фоне.
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            var network = fetch(event.request).then(function(response) {
                if (response && response.ok) {
                    var copy = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
                }
                return response;
            });
            if (cached) {
                event.waitUntil(network.catch(function() {}));
                return cached;
            }
            return network.catch(function() { return new Response('', { status: 408 }); });
        })
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    var rawTarget = (event.notification.data && event.notification.data.url) || 'index.html';
    var targetUrl = new URL(rawTarget, self.location.origin).href;
    if (new URL(targetUrl).origin !== self.location.origin) targetUrl = new URL('index.html', self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            if (clientList.length) {
                var client = clientList[0];
                return client.focus().then(function() {
                    return 'navigate' in client ? client.navigate(targetUrl) : client;
                });
            }
            return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
        })
    );
});
