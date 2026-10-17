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
// Admin SDK 14 — модульный: пространств имён больше нет, база и авторизация
// берутся именованными импортами. `admin` остался для initializeApp().
const { getDatabase } = require('firebase-admin/database');
const { getAuth } = require('firebase-admin/auth');
const webpush = require('web-push');

admin.initializeApp();
const db = getDatabase();
// Постраничный обход детей узла — вместо once('value') по целым веткам
// (см. functions/paging.js и docs/CODE-AUDIT-2026-10-2.md, находка 8).
const { createChildPager } = require('./paging');
const forEachChildPage = createChildPager(db);

Object.assign(exports, require('./score-audit')(functions, admin, db, forEachChildPage));

// Мастер-пароль проверяется только на сервере. НЕ использовать пароль/хэш из
// settings: этот узел публичен (RTDB не позволяет сузить доступ потомку).
const crypto = require('crypto');
const MASTER_UID = 'tournament-master';
// Пароль мастер-сессии задаётся СЕКРЕТОМ TOURNAMENT_MASTER_PASSWORD_HASH
// (Firebase Secret Manager / env функции) — SHA-256 (UTF-8, hex) пароля.
//
// Fail closed (аудит 2026-10, docs/IMPROVEMENTS-2026-10.md п.1). Раньше при
// отсутствующем секрете действовал зашитый в код DEFAULT_MASTER_PASSWORD_HASH
// = sha256("55555"): пароль из 5 цифр, лежащий в публичном репозитории,
// открывал uid `tournament-master`, который по database.rules.json пишет в
// rounds/tournaments/protocols и вызывает wipeAllData (полное удаление данных
// клуба). Единственной защитой был лимит 5 попыток/15 минут на IP.
// Теперь без секрета вход отказывает с failed-precondition — и деплой при
// этом НЕ падает: секрет по-прежнему не привязан жёстко через
// runWith({secrets}), потому что такая привязка требует обязательного секрета
// в Secret Manager, и без него функция не стартует (браузер видит
// «Ошибка входа: internal» вместо внятной причины). Клиент уже показывает
// локализованное сообщение для failed-precondition (js/admin.js).
//
// Исключение — Firebase Emulator (FUNCTIONS_EMULATOR): там дефолтный пароль
// остаётся, чтобы локальная разработка и тесты не требовали секретов.
const DEFAULT_MASTER_PASSWORD_HASH = 'c507a68f3093e885765257ed3f176c757aaf62bb4cbc2ef94b2e7da3406d9676';
const MASTER_PASSWORD_HASH_SECRET = 'TOURNAMENT_MASTER_PASSWORD_HASH';
function isEmulatorRuntime() {
    try {
        return String(process.env.FUNCTIONS_EMULATOR || '').toLowerCase() === 'true';
    } catch (e) { return false; }
}
function readConfiguredMasterPasswordHash() {
    try {
        const fromEnv = process.env[MASTER_PASSWORD_HASH_SECRET];
        if (fromEnv && String(fromEnv).trim()) {
            return String(fromEnv).trim();
        }
    } catch (e) {
        // ignore env read errors
    }
    return null; // секрета нет — решение принимает вызывающий код (fail closed)
}
exports.tournamentMasterSignIn = functions.runWith({}).https.onCall(async function (data, context) {
    try {
        let configured = readConfiguredMasterPasswordHash();
        if (!configured) {
            if (isEmulatorRuntime()) {
                // Только эмулятор: локальная разработка без Secret Manager.
                if (functions.logger) functions.logger.warn('tournamentMasterSignIn: secret is not set, using the development default password (emulator only)');
                configured = DEFAULT_MASTER_PASSWORD_HASH;
            } else {
                if (functions.logger) functions.logger.error('tournamentMasterSignIn: ' + MASTER_PASSWORD_HASH_SECRET + ' is not set — master sign-in is disabled. Set it with: firebase functions:secrets:set ' + MASTER_PASSWORD_HASH_SECRET + ' --project livescore-b77e4');
                throw new functions.https.HttpsError('failed-precondition', 'Master password is not configured on the server.');
            }
        }
        if (!/^[a-f0-9]{64}$/i.test(configured)) {
            throw new functions.https.HttpsError('failed-precondition', 'Master password is not configured on the server.');
        }
        // Секрет не должен быть выставлен в общеизвестный дефолт: такой хэш
        // эквивалентен отсутствию пароля, а формально проверку проходит.
        if (configured.toLowerCase() === DEFAULT_MASTER_PASSWORD_HASH && !isEmulatorRuntime()) {
            if (functions.logger) functions.logger.error('tournamentMasterSignIn: ' + MASTER_PASSWORD_HASH_SECRET + ' equals the well-known default — refusing. Choose a long random password.');
            throw new functions.https.HttpsError('failed-precondition', 'Master password must not be the well-known default.');
        }
        const password = data && data.password;
        if (typeof password !== 'string' || !password || password.length > 256) {
            throw new functions.https.HttpsError('invalid-argument', 'Password required.');
        }
        // Постоянный лимит попыток на IP, общий для всех инстансов функции.
        // Защищён от падения rawRequest.
        // Если rawRequest.ip не отдан, берём ПЕРВЫЙ хоп x-forwarded-for: без
        // него все попытки падали в одно ведро 'unknown', и атакующий мог
        // исчерпать лимит вместо легитимного мастера (отказ в обслуживании).
        let ip = 'unknown';
        try {
            const raw = context && context.rawRequest;
            if (raw && raw.ip) {
                ip = String(raw.ip);
            } else if (raw && raw.headers) {
                const xff = raw.headers['x-forwarded-for'] || raw.headers['X-Forwarded-For'];
                if (xff) ip = String(xff).split(',')[0].trim() || 'unknown';
            }
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
            // Rate-limit хранится в RTDB и общий для всех экземпляров функции.
            // При недоступной базе нельзя разрешать вход без лимита: fail closed.
            if (functions.logger) functions.logger.warn('masterLoginAttempts transaction failed', e && e.message);
            throw new functions.https.HttpsError('unavailable', 'Login service is temporarily unavailable. Try again later.');
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
        const token = await getAuth().createCustomToken(MASTER_UID, { tournamentMaster: true, tournamentMasterUntil: Date.now() + 8 * 60 * 60 * 1000 });
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

// ── Удаление данных клуба (кнопки «Удалить всех игроков и раунды» /
//    «Удалить все данные» в админке) ─────────────────────────────────────────
// Правила RTDB не разрешают клиентам удалять ветки целиком: .write есть
// только на дочерних узлах (users/$uid, rounds/$rid, tournaments/$id, …), а
// на самих ветках — нет. Поэтому прежний атомарный мульти-path update
// ({users:null, rounds:null, …}) сервер отклонял целиком, и кнопка
// «Удалить все данные» не удаляла игроков. Серверная операция идёт через
// Admin SDK (правилами не ограничена), удаляет ветки атомарно и возвращает
// результат в админку. Если функция не развёрнута, клиент чистит базу сам —
// по доступным ему путям (users/<uid>, usersPublic/<uid>, …).
const WIPE_ROUND_BRANCHES = ['rounds', 'markers', 'markerAssignments', 'alerts', 'protocols'];
// «Удалить все данные» обязано вычищать ВСЕ ветки с игровыми и персональными
// данными. Прежний список из 10 веток оставлял в базе 9 из 19 — в том числе
// scoreAudit (30 дней истории каждого изменения счёта с playerName) и hcpLog
// (docs/CODE-AUDIT-2026-10-2.md, находка 3).
//
// Намеренно НЕ удаляются:
//   settings — конфигурация клуба (оформление, варианты экранов, privacy);
//   vapid    — пара VAPID-ключей; её потеря инвалидирует все существующие
//              push-подписки, а секретом она не является (публичная половина
//              и так лежит в settings/vapid_public_key).
//   channels — токены Telegram/VK: удалять их вместе с данными означало бы,
//              что после «очистки» клуб теряет настроенные интеграции.
const WIPE_ALL_BRANCHES = ['rounds', 'users', 'usersPublic', 'tournaments', 'markers',
    'markerAssignments', 'alerts', 'protocols', 'broadcasts', 'reactions',
    'scoreAudit', 'hcpLog', 'leaderboard', 'push_subscriptions', 'errorReports',
    'tnDrafts', 'tnTemplates'];

exports.wipeAllData = functions.runWith({}).https.onCall(async function (data, context) {
    const scope = data && data.scope === 'rounds' ? 'rounds' : 'all';
    const authCtx = context && context.auth;
    const uid = authCtx && authCtx.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    const token = authCtx.token || {};
    const isMaster = uid === MASTER_UID && token.tournamentMaster === true && token.tournamentMasterUntil > Date.now();
    let profile = null;
    try {
        const snap = await db.ref('users/' + uid).get();
        profile = snap.val();
    } catch (e) { profile = null; }
    const isAdmin = !!(profile && (profile.admin === true || profile.role === 'admin'));
    if (!isMaster && !isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Administrator rights required.');
    }
    // Свой аккаунт администратора-человека сохраняем: его роль живёт в
    // users/<uid>, и без записи админ потерял бы доступ к панели.
    // Мастер-сессия (tournament-master) личного профиля в users не имеет.
    const keepUid = (!isMaster && isAdmin) ? uid : null;
    const updates = {};
    const branches = scope === 'rounds' ? WIPE_ROUND_BRANCHES : WIPE_ALL_BRANCHES;
    branches.forEach(function (branch) {
        if (branch === 'users' && keepUid) return; // разберём ниже, по узлам
        updates[branch] = null;
    });
    if (scope === 'all' && keepUid) {
        const usersSnap = await db.ref('users').get();
        const users = usersSnap.val() || {};
        Object.keys(users).forEach(function (key) {
            if (key !== keepUid) updates['users/' + key] = null;
        });
        const pubSnap = await db.ref('usersPublic').get();
        const pub = pubSnap.val() || {};
        Object.keys(pub).forEach(function (key) {
            if (key !== keepUid) updates['usersPublic/' + key] = null;
        });
        if (Object.prototype.hasOwnProperty.call(updates, 'usersPublic')) delete updates.usersPublic;
    }
    if (scope === 'rounds') {
        // У оставшихся игроков не должно остаться истории и агрегатов
        // из удалённых раундов.
        const usersSnap = await db.ref('users').get();
        const users = usersSnap.val() || {};
        Object.keys(users).forEach(function (key) {
            updates['users/' + key + '/history'] = null;
            updates['users/' + key + '/roundsPlayed'] = 0;
            updates['users/' + key + '/bestGross'] = null;
            updates['users/' + key + '/bestStableford'] = null;
        });
        // Аудит счёта удалённых раундов — те же персональные данные (playerName,
        // oldScore/newScore), и он пережил бы удаление раундов ещё 30 дней.
        // Удаляем только записи, привязанные к раундам: турнирный аудит остаётся,
        // потому что турниры в этом режиме не удаляются.
        await forEachChildPage('scoreAudit', 25, async function (dayKey, dayValue) {
            Object.keys(dayValue || {}).forEach(function (id) {
                const evt = dayValue[id] || {};
                if (evt && evt.roundId) updates['scoreAudit/' + dayKey + '/' + id] = null;
            });
        });
    }
    // Сброс игровых сессий на всех устройствах (клиенты слушают этот ключ).
    updates['settings/sessions_reset_ts'] = Date.now();
    await db.ref().update(updates);
    return { ok: true, scope: scope, keptSelf: !!keepUid, deletedAt: Date.now() };
});

// ── Валидация входных данных (defense-in-depth; основные правила — в database.rules.json) ──
function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
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

// Master switch maintained by the admin UI. Missing setting preserves the
// existing behaviour (enabled); only an explicit false suppresses delivery.
async function globalNotificationsEnabled() {
    try {
        const snap = await db.ref('settings/notifications_enabled').get();
        return !snap || snap.val() !== false;
    } catch (err) {
        functions.logger.warn('notification master setting unavailable; allowing delivery', err && err.message);
        return true;
    }
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
        if (!(await globalNotificationsEnabled())) {
            functions.logger.info('onBroadcastCreated: global notifications disabled, skip');
            return;
        }
        const b = snap.val() || {};
        const title = str(b.title, 200);
        const body = str(b.body, 1000);
        if (!title && !body) { functions.logger.warn('onBroadcastCreated: empty broadcast, skip'); return; }
        if (rateLimited('bc', 800)) { functions.logger.warn('onBroadcastCreated: rate-limited'); return; }
        const keys = await ensureVapidKeys();
        configureWebPush(keys);

        // Аудитория анонса: единая нормализация audienceOf (юнит-тест
        // tools/test-functions-push.js проверяет именно её).
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
// ── Доставка вызова судьи/маршала в Telegram и ВКонтакте ─────────────────
// Токены лежат в ветке channels/ (database.rules.json: .read только для
// админа/мастера) и читаются исключительно Admin SDK — браузер игрока секрет
// не видит. Раньше отправку делал браузер, читая токен из /settings, а у
// /settings ".read": true, то есть живой токен бота был доступен любому из
// интернета (docs/CODE-AUDIT-2026-10-2.md, находка 1).
const CHANNEL_FETCH_TIMEOUT_MS = 6000;
const VK_API_VERSION = '5.131';

function channelEscHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
}

// Зеркало клиентского buildOfficialCallText (js/official-alerts.js).
function officialCallHtml(a) {
    const title = a.type === 'referee' ? '🚨 Вызов Судьи' : '🚨 Вызов Маршала';
    const time = a.time
        ? new Date(a.time).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })
        : '';
    const flight = (Array.isArray(a.flightMembers) ? a.flightMembers : [])
        .map(function (n) { return String(n || '').trim(); }).filter(Boolean);
    const lines = [
        '<b>' + title + '</b>',
        '<b>Кто вызвал:</b> ' + channelEscHtml(a.playerName || 'Игрок'),
        '<b>Лунка:</b> №' + channelEscHtml(a.hole == null ? '?' : a.hole)
    ];
    if (time) lines.push('<b>Время:</b> ' + channelEscHtml(time));
    if (flight.length) lines.push('<b>Состав флайта:</b> ' + channelEscHtml(flight.join(', ')));
    return lines.join('\n');
}

async function channelPostJson(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, CHANNEL_FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

async function readChannelSettings() {
    try {
        const snap = await db.ref('channels').get();
        const v = snap.val() || {};
        return { telegram: v.telegram || {}, vk: v.vk || {} };
    } catch (err) {
        functions.logger.warn('channels settings unavailable', err && err.message);
        return { telegram: {}, vk: {} };
    }
}

// Возвращает список успешно отработавших приёмников ('telegram:group', 'vk').
// Ошибка одного приёмника не отменяет остальные: вызов в любом случае лежит
// в alerts/ и виден в админке.
async function deliverOfficialCall(a) {
    const cfg = await readChannelSettings();
    const sent = [];
    const text = officialCallHtml(a);

    const tgTargets = [];
    const tg = cfg.telegram || {};
    if (tg.groupToken && tg.groupId) tgTargets.push(['group', tg.groupToken, tg.groupId]);
    if (tg.channelToken && tg.channelId) tgTargets.push(['channel', tg.channelToken, tg.channelId]);
    for (const target of tgTargets) {
        try {
            const r = await channelPostJson(
                'https://api.telegram.org/bot' + encodeURIComponent(target[1]) + '/sendMessage',
                { chat_id: target[2], text: text, parse_mode: 'HTML' }
            );
            if (r && r.ok) sent.push('telegram:' + target[0]);
            else functions.logger.warn('telegram send failed (' + target[0] + ')', r && r.description);
        } catch (err) {
            functions.logger.warn('telegram send error (' + target[0] + ')', err && err.message);
        }
    }

    const vk = cfg.vk || {};
    if (vk.token && vk.peerId) {
        try {
            const r = await channelPostJson('https://api.vk.com/method/messages.send', {
                peer_id: vk.peerId,
                message: text.replace(/<[^>]+>/g, ''),
                access_token: vk.token,
                v: VK_API_VERSION,
                random_id: Date.now()
            });
            if (r && !r.error) sent.push('vk');
            else functions.logger.warn('vk send failed', r && r.error && r.error.error_msg);
        } catch (err) {
            functions.logger.warn('vk send error', err && err.message);
        }
    }
    return sent;
}

exports.onAlertCreated = functions.database.ref('/alerts/{id}').onCreate(async function (snap) {
    try {
        if (!(await globalNotificationsEnabled())) {
            functions.logger.info('onAlertCreated: global notifications disabled, skip');
            return;
        }
        const a = snap.val() || {};
        if (a.status && a.status !== 'active') return;
        if (a.type !== 'referee' && a.type !== 'marshal') { functions.logger.warn('onAlertCreated: invalid type, skip'); return; }
        if (rateLimited('alert:' + (a.roundId || a.hole || 'anon'), 2000)) { functions.logger.warn('onAlertCreated: rate-limited'); return; }

        // Telegram/VK не зависят от Web Push: раньше при пустом списке
        // админских подписок функция выходила до всякой рассылки.
        const channels = await deliverOfficialCall(a);
        if (channels.length) functions.logger.info('onAlertCreated: delivered via ' + channels.join(', '));

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
