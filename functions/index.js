// ============================================================
// Cloud Functions для Pestovo Live Scoring
// Фоновые Web Push-уведомления (работают при ЗАКРЫТОМ приложении):
//   1. vapidSetup      — одноразовая генерация VAPID-ключей;
//                        возвращает публичный ключ клиентам.
//   2. onBroadcastCreated — пуш по новому анонсу (с учётом аудитории).
//   3. onAlertCreated     — пуш о вызове судьи/маршала админам.
//
// Деплой:
//   cd functions && npm i
//   firebase deploy --only functions
// Затем в админке («Анонсы») нажать «Включить фоновые пуши».
//
// Приватный VAPID-ключ хранится в /vapid/privateKey и НИКОГДА не
// должен быть доступен клиентам (см. docs/push-notifications.md).
// ============================================================
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const webpush = require('web-push');

admin.initializeApp();
const db = admin.database();

// Публичный VAPID-ключ лежит в /settings/vapid_public_key (читают все),
// приватный — в /vapid/privateKey (доступен только админ-правилам).
async function ensureVapidKeys() {
    const pubSnap = await db.ref('settings/vapid_public_key').get();
    const privSnap = await db.ref('vapid/privateKey').get();
    if (pubSnap.exists() && privSnap.exists()) {
        return { publicKey: pubSnap.val(), privateKey: privSnap.val() };
    }
    const keys = webpush.generateVAPIDKeys();
    await db.ref('settings/vapid_public_key').set(keys.publicKey);
    await db.ref('vapid/privateKey').set(keys.privateKey);
    await db.ref('vapid/createdAt').set(Date.now());
    functions.logger.info('VAPID keys generated');
    return { publicKey: keys.publicKey, privateKey: keys.privateKey };
}

// HTTP: GET — вернуть публичный ключ (сгенерировав пару при первом вызове).
// Вызывается из админки при включении фоновых пушей.
exports.vapidSetup = functions.https.onRequest(async (req, res) => {
    try {
        const keys = await ensureVapidKeys();
        res.set('Cache-Control', 'public, max-age=300');
        res.set('Access-Control-Allow-Origin', '*');
        res.json({ publicKey: keys.publicKey });
    } catch (err) {
        functions.logger.error('vapidSetup failed', err);
        res.status(500).json({ error: String(err && err.message || err) });
    }
});

function configureWebPush(keys) {
    webpush.setVapidDetails(
        'mailto:admin@pestovo-golf.ru',
        keys.publicKey,
        keys.privateKey
    );
}

// Записи push_subscriptions: { key: { endpoint, keys:{p256dh,auth},
// uid, lang, isAdmin, updatedAt } }
async function getAllSubscriptions() {
    const snap = await db.ref('push_subscriptions').get();
    const val = snap.val() || {};
    return Object.keys(val).map(function (k) {
        return Object.assign({ _key: k }, val[k]);
    }).filter(function (s) { return s && s.endpoint && s.keys && s.keys.p256dh && s.keys.auth; });
}

async function removeSubscription(key) {
    try { await db.ref('push_subscriptions/' + key).remove(); } catch (_) {}
}

function sendToSubscriptions(subs, payload) {
    const body = JSON.stringify(payload);
    return Promise.all(subs.map(function (sub) {
        const pushSub = { endpoint: sub.endpoint, keys: sub.keys };
        return webpush.sendNotification(pushSub, body).catch(function (err) {
            // 404/410 — подписка мертва, удаляем.
            if (err && (err.statusCode === 404 || err.statusCode === 410)) {
                return removeSubscription(sub._key);
            }
            functions.logger.warn('push failed', sub.endpoint, err && err.statusCode, err && err.message);
            return null;
        });
    }));
}

// Аудитория анонса (зеркало pestovoBroadcastAudience на клиенте).
function audienceOf(b) {
    const a = (b && b.audience) || {};
    const type = String(a.type || 'all') === 'roster' || String(a.type || 'all') === 'protocol'
        ? String(a.type) : 'all';
    const uids = {};
    if (a.uids && typeof a.uids === 'object') {
        Object.keys(a.uids).forEach(function (k) {
            if (k && a.uids[k] !== false && a.uids[k] != null) uids[String(k)] = true;
        });
    }
    return {
        type: type,
        includePwa: a.includePwa === true,
        uids: uids
    };
}

exports.onBroadcastCreated = functions.database.ref('/broadcasts/{id}').onCreate(async function (snap) {
    const b = snap.val() || {};
    const keys = await ensureVapidKeys();
    configureWebPush(keys);

    const aud = audienceOf(b);
    const allSubs = await getAllSubscriptions();
    let targets;
    if (aud.type === 'all') {
        // «Всем игрокам клуба» без includePwa — шлём только вошедшим игрокам
        // (гостевые подписки без uid пропускаем). С includePwa — всем,
        // включая гостей, установивших PWA.
        targets = allSubs.filter(function (s) { return aud.includePwa || !!s.uid; });
    } else {
        targets = allSubs.filter(function (s) { return s.uid && aud.uids[String(s.uid)]; });
    }

    const payload = {
        title: b.title || '📢 Pestovo',
        body: b.body || '',
        tag: 'broadcast-' + snap.key,
        url: b.link || '/tournaments.html',
        ts: b.time || Date.now()
    };
    functions.logger.info('broadcast push to ' + targets.length + ' subs (aud=' + aud.type + ')');
    await sendToSubscriptions(targets, payload);
});

// Вызов судьи/маршала: пушим админам (роль admin в users/<uid>).
exports.onAlertCreated = functions.database.ref('/alerts/{id}').onCreate(async function (snap) {
    const a = snap.val() || {};
    if (a.status && a.status !== 'active') return;
    const keys = await ensureVapidKeys();
    configureWebPush(keys);

    const subs = (await getAllSubscriptions()).filter(function (s) { return !!s.isAdmin; });
    if (!subs.length) return;
    const referee = a.type === 'referee';
    const payload = {
        title: referee ? '🚨 ВЫЗОВ СУДЬИ!' : '🚨 ВЫЗОВ МАРШАЛА!',
        body: 'Лунка №' + (a.hole || '?') + ' · ' + (a.playerName || 'Игрок') + (a.time ? ' (' + new Date(a.time).toLocaleTimeString('ru-RU') + ')' : ''),
        tag: 'alert-' + snap.key,
        url: '/admin.html',
        ts: Date.now()
    };
    await sendToSubscriptions(subs, payload);
});
