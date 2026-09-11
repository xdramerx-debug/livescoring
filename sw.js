const CACHE_NAME = 'pestovo-v1.62.0';
const OFFLINE_URL = 'offline.html';

const STATIC_ASSETS = [
    './', 'index.html', 'setup-round.html', 'leaderboard.html',
    'guide.html', 'feed.html', 'predictor.html', 'order-of-merit.html', 'tv.html',
    'players.html', 'tournaments.html', 'stats.html', 'handicap.html',
    'admin.html', 'auth.html', 'scorer.html', 'marker.html', 'offline.html',
    'assistant.html', 'design-preview.html',
    'manifest.json', 'css/style.css?v=32', 'css/assistant.css?v=2',
    'css/design-presets.css?v=1',
    'js/firebase-config.js?v=2', 'js/utils.js?v=56', 'js/name-variants.js?v=1',
    'js/design-system.js?v=1', 'js/design-admin.js?v=2', 'js/design-preview.js?v=1',
    'js/auth.js', 'js/app.js?v=19', 'js/live.js?v=32', 'js/solo.js?v=27',
    'js/leaderboard.js?v=7', 'js/players.js?v=3', 'js/tournaments.js?v=11', 'js/protocol.js?v=2',
    'js/stats.js?v=3', 'js/handicap.js', 'js/admin.js?v=43', 'js/scorer.js?v=8',
    'js/marker.js?v=4', 'js/guide.js', 'js/feed.js?v=3', 'js/predictor.js',
    'js/order-of-merit.js?v=3', 'js/pwa.js?v=5', 'js/start-admin.js?v=19', 'js/pe-edit.js?v=1', 'js/qr-start.js?v=9', 'qr-start.html',
    'js/tn-scorecard.js?v=3',
    'js/assistant-config.js', 'js/assistant-build.js?v=2', 'js/assistant.js?v=2',
    'docs/assistant-index.json', 'docs/assistant-sources.json',
    'docs/pravila-pestovo.pdf',
    'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js',
    'img/logo.png', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-180.png'
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

// ============================================
// ФОНОВЫЕ PUSH-УВЕДОМЛЕНИЯ (приложение закрыто)
// Платформа: Cloud Function onBroadcastCreated/onAlertCreated
// отправляет Web Push (VAPID) с JSON {title,body,tag,url}.
// ============================================
self.addEventListener('push', function(event) {
    var data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) {
        try { data = { body: event.data ? event.data.text() : '' }; } catch (e2) { data = {}; }
    }
    var title = data.title || 'Pestovo Live Scoring';
    var options = {
        body: data.body || '',
        icon: 'img/icon-192.png',
        badge: 'img/icon-192.png',
        vibrate: [200, 80, 200],
        tag: data.tag || 'pestovo-push',
        renotify: true,
        requireInteraction: !!data.requireInteraction,
        data: { url: data.url || 'index.html' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

// Браузер может обновить push-подписку сам — переподписываемся с тем же
// VAPID-ключом и обновляем запись в базе через клиент, если он есть.
self.addEventListener('pushsubscriptionchange', function(event) {
    event.waitUntil(
        (async function() {
            try {
                var dbUrl = 'https://livescore-b77e4-default-rtdb.firebaseio.com/settings/vapid_public_key.json';
                var resp = await fetch(dbUrl, { cache: 'no-store' });
                var publicKey = await resp.json();
                if (!publicKey) return;
                var reg = await self.registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey)
                });
                // Клиент при следующем запуске сам перезапишет подписку;
                // здесь лишь гарантируем, что подписка существует.
                var clientsAll = await clients.matchAll({ includeUncontrolled: true });
                clientsAll.forEach(function(c) { try { c.postMessage({ type: 'pestovo-push-resubscribed' }); } catch (e) {} });
                return reg;
            } catch (e) {}
        })()
    );
});

function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
}

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
