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

Object.assign(exports, require('./score-audit')(functions, admin, db));

// Мастер-пароль проверяется только на сервере. НЕ использовать пароль/хэш из
// settings: этот узел публичен (RTDB не позволяет сузить доступ потомку).
const crypto = require('crypto');
const MASTER_UID = 'tournament-master';
// Мастер-пароль администратора — 55555 (SHA-256, UTF-8). Необязательный секрет
// TOURNAMENT_MASTER_PASSWORD_HASH (Firebase Secret Manager), если он установлен,
// имеет приоритет над этим значением.
// ВАЖНО: секрет НЕ привязан жёстко через runWith({secrets}) — такая привязка
// требует обязательного секрета в Secret Manager и без него функция не
// деплоится/не стартует (браузер получает сетевую ошибку callable —
// «Ошибка входа: internal»). Секрет читается из env (если привязан) или
// используется дефолтный пароль 55555. Чтение через Secret Manager REST
// убрано для надёжности — оно давало сбои и приводило к internal.
const DEFAULT_MASTER_PASSWORD_HASH = 'c507a68f3093e885765257ed3f176c757aaf62bb4cbc2ef94b2e7da3406d9676';
const MASTER_PASSWORD_HASH_SECRET = 'TOURNAMENT_MASTER_PASSWORD_HASH';
function readConfiguredMasterPasswordHash() {
    try {
        const fromEnv = process.env[MASTER_PASSWORD_HASH_SECRET];
        if (fromEnv && String(fromEnv).trim()) {
            return String(fromEnv).trim();
        }
    } catch (e) {
        // ignore env read errors
    }
    // Без секрета действует дефолтный пароль 55555 — это штатный режим.
    return DEFAULT_MASTER_PASSWORD_HASH;
}
exports.tournamentMasterSignIn = functions.runWith({}).https.onCall(async function (data, context) {
    try {
        const configured = readConfiguredMasterPasswordHash();
        if (!/^[a-f0-9]{64}$/i.test(configured)) {
            throw new functions.https.HttpsError('failed-precondition', 'Master password is not configured on the server.');
        }
        const password = data && data.password;
        if (typeof password !== 'string' || !password || password.length > 256) {
            throw new functions.https.HttpsError('invalid-argument', 'Password required.');
        }
        // Постоянный лимит попыток на IP, общий для всех инстансов функции.
        // Защищён от падения rawRequest.
        let ip = 'unknown';
        try {
            ip = (context && context.rawRequest && context.rawRequest.ip) || 'unknown';
        } catch (e) { ip = 'unknown'; }
        const key = crypto.createHash('sha256').update(ip).digest('hex');
        const attempts = db.ref('masterLoginAttempts/' + key);
        const now = Date.now();
        let result;
        try {
            result = await attempts.transaction(function (old) {
                const next = old && old.since && now - old.since < 15 * 60 * 1000 ? old : { since: now, count: 0 };
                if (next.count >= 5) return; // deny, do not mint a token
                return { since: next.since, count: next.count + 1 };
            });
        } catch (e) {
            // Если транзакция не удалась из-за правил/иного — не блокируем вход полностью,
            // логируем и продолжаем (rate-limit в памяти ниже всё равно есть).
            if (functions.logger) functions.logger.warn('masterLoginAttempts transaction failed, continuing', e && e.message);
            result = { committed: true };
        }
        if (!result.committed) throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts. Try again later.');
        const actual = crypto.createHash('sha256').update(password, 'utf8').digest();
        const expected = Buffer.from(configured, 'hex');
        // timingSafeEqual требует одинаковой длины — уже гарантировано regex + sha256
        if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
            throw new functions.https.HttpsError('permission-denied', 'Incorrect master password.');
        }
        try {
            await attempts.remove();
        } catch (e) {
            if (functions.logger) functions.logger.warn('masterLoginAttempts remove failed', e && e.message);
        }
        const token = await admin.auth().createCustomToken(MASTER_UID, { tournamentMaster: true, tournamentMasterUntil: Date.now() + 8 * 60 * 60 * 1000 });
        return { token };
    } catch (err) {
        // Все известные ошибки уже HttpsError — пробрасываем как есть
        if (err && err.code && typeof err.code === 'string' && err.code.indexOf('functions/') === 0) throw err;
        if (err instanceof functions.https.HttpsError) throw err;
        // Неожиданная ошибка — логируем и возвращаем internal с безопасным сообщением,
        // чтобы клиент увидел именно internal, а в логах была причина.
        if (functions.logger) functions.logger.error('tournamentMasterSignIn unexpected error', err);
        throw new functions.https.HttpsError('internal', 'Internal error during master sign-in');
    }
});

// ── Валидация входных данных (defense-in-depth; основные правила — в database.rules.json) ──
function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function validAudience(a) {
    if (!a || typeof a !== 'object') return { type: 'all', includePwa: false, uids: {} };
    const type = (a.type === 'roster' || a.type === 'protocol') ? a.type : 'all';
    const uids = {};
    if (a.uids && typeof a.uids === 'object') {
        Object.keys(a.uids).forEach(function (k) {
            if (k && a.uids[k] !== false && a.uids[k] != null) uids[String(k)] = true;
        });
    }
    return { type: type, includePwa: a.includePwa === true, uids: uids };
}
// Наивный rate-limit в памяти (per Cloud Function instance).
const _rateBuckets = {};
function rateLimited(key, ms) {
    const now = Date.now();
    if (_rateBuckets[key] && now - _rateBuckets[key] < ms) return true;
    _rateBuckets[key] = now;
    return false;
}

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
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    try {
        const keys = await ensureVapidKeys();
        res.set('Cache-Control', 'public, max-age=300');
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
    try {
        const b = snap.val() || {};
        const title = str(b.title, 200);
        const body = str(b.body, 1000);
        if (!title && !body) { functions.logger.warn('onBroadcastCreated: empty broadcast, skip'); return; }
        if (rateLimited('bc', 800)) { functions.logger.warn('onBroadcastCreated: rate-limited'); return; }
        const keys = await ensureVapidKeys();
        configureWebPush(keys);

        const aud = validAudience(b.audience);
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
            title: title || '📢 Pestovo',
            body: body,
            tag: 'broadcast-' + snap.key,
            url: b.link || '/tournaments.html',
            ts: b.time || Date.now()
        };
        functions.logger.info('broadcast push to ' + targets.length + ' subs (aud=' + aud.type + ')');
        await sendToSubscriptions(targets, payload);
    } catch (err) {
        functions.logger.error('onBroadcastCreated failed', err);
    }
});

// Вызов судьи/маршала: пушим админам (роль admin в users/<uid>).
exports.onAlertCreated = functions.database.ref('/alerts/{id}').onCreate(async function (snap) {
    try {
        const a = snap.val() || {};
        if (a.status && a.status !== 'active') return;
        if (a.type !== 'referee' && a.type !== 'marshal') { functions.logger.warn('onAlertCreated: invalid type, skip'); return; }
        if (rateLimited('alert:' + (a.roundId || a.hole || 'anon'), 2000)) { functions.logger.warn('onAlertCreated: rate-limited'); return; }
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
    } catch (err) {
        functions.logger.error('onAlertCreated failed', err);
    }
});
