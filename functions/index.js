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

// Признак админа в профиле: database.rules.json и вся клиентская проверка
// (hasAdminPanelAccess, wipeAllData) допускают ДВА варианта — флаг `admin: true`
// и роль `role: 'admin'`. Раньше пуши вызовов сверялись только с ролью.
function isAdminProfile(profile) {
    return !!(profile && (profile.admin === true || profile.role === 'admin'));
}

// Подписки админов для вызовов судьи/маршала.
//
// Флаг isAdmin в /push_subscriptions ставит браузер, и он ненадёжен: подписка
// могла быть создана до входа, профиль мог быть прочитан с отказом правил
// (не-админу чтение users/<uid> запрещено), роль могла смениться, а признаком
// админа в клубе бывает и флаг `admin: true`. Из-за этого вызовы уходили в
// пустой список подписок — в админке «админов: 0», а на телефоне тишина при
// работающем локальном тесте.
//
// Источник истины — профили users/<uid> (Admin SDK читает их в обход правил);
// клиентский флаг остаётся запасным вариантом, если профиль прочитать не удалось.
async function getAdminSubscriptions(subs) {
    const uids = [];
    subs.forEach(function (s) {
        const uid = s && s.uid ? String(s.uid) : '';
        if (uid && uids.indexOf(uid) === -1) uids.push(uid);
    });
    const admins = {};
    await Promise.all(uids.map(async function (uid) {
        try {
            const snap = await db.ref('users/' + uid).get();
            admins[uid] = isAdminProfile(snap.val());
        } catch (err) {
            admins[uid] = null; // неизвестно — решает клиентский флаг
        }
    }));
    return subs.filter(function (s) {
        if (!s) return false;
        // Запись без uid, но с флагом админа: uid не проставился (вход позже,
        // отказ правил) — доверяем флагу, иначе админ молча терял вызовы.
        if (!s.uid) return s.isAdmin === true;
        const known = admins[String(s.uid)];
        if (known === true) return true;
        if (known === false) return false; // устаревший флаг у обычного игрока
        return s.isAdmin === true;
    });
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

// Вызов судьи/маршала: пушим админам (users/<uid>: `admin: true` или
// `role: 'admin'` — их разбирает getAdminSubscriptions).
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

// VK принимает только обычный текст — HTML-разметку Telegram вырезаем.
function officialCallPlain(a) {
    return officialCallHtml(a).replace(/<[^>]+>/g, '');
}

async function channelPost(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, CHANNEL_FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, Object.assign({ signal: controller.signal }, init));
        // Ответ может быть не-JSON (страница ошибки прокси, 502 от Telegram).
        // Раньше res.json() бросал исключение, и в логе оставалось
        // «Unexpected token <» вместо реальной причины отказа.
        const raw = await res.text();
        try {
            return JSON.parse(raw);
        } catch (e) {
            return { __httpStatus: res.status, __rawBody: String(raw).slice(0, 300) };
        }
    } finally {
        clearTimeout(timer);
    }
}

async function channelPostJson(url, body) {
    return channelPost(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
    });
}

// VK API НЕ принимает application/json в теле запроса — только
// x-www-form-urlencoded (dev.vk.com/ru/api/api-requests: «Значение
// application/json в настоящее время не поддерживается»). Отправка JSON-тела
// в messages.send возвращала ошибку 100 «One of the parameters specified was
// missing or invalid», поэтому вызов судьи/маршала во время раунда в ВК не
// уходил, хотя «Проверить отправку в ВК» в админке работал: тест идёт из
// браузера JSONP-ом с параметрами в URL.
async function channelPostForm(url, params) {
    return channelPost(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'Accept': 'application/json'
        },
        body: new URLSearchParams(params).toString()
    });
}

// Поля каналов — строки, но peer_id админка могла сохранить и числом
// (input type="number"). str() из валидации входных данных числа отбрасывал.
function channelStr(v, max) {
    if (v === null || v === undefined) return '';
    const s = String(v).trim();
    return s.length > max ? s.slice(0, max) : s;
}

// Приводит ветку channels/ к рабочему виду: { telegram: { group, channel }, vk }.
// Заодно понимает старые имена полей (botToken/chatId) — их пишет
// migrateLegacyChannelSecrets() в админке при переносе из публичного /settings,
// и только они могли остаться в базе, если перенос прошёл частично.
// Клиентская загрузка настроек делает то же самое (js/admin-channels.js:
// `tg.groupToken || tg.botToken`) — сервер обязан не быть строже.
function normalizeChannelSettings(v) {
    v = v || {};
    const tg = v.telegram || {};
    const vk = v.vk || {};
    const groupToken = channelStr(tg.groupToken, 200) || channelStr(tg.botToken, 200);
    const groupId = channelStr(tg.groupId, 100) || channelStr(tg.chatId, 100);
    const channelId = channelStr(tg.channelId, 100);
    // «Или использовать один и тот же бот» (подсказка в админке): для канала
    // достаточно ID, токен берём у группы, если отдельного не сохранили.
    const channelToken = channelStr(tg.channelToken, 200) || (channelId ? groupToken : '');
    const vkToken = channelStr(vk.token, 300);
    const vkPeerId = channelStr(vk.peerId, 50);
    return {
        telegram: {
            group: (groupToken && groupId) ? { token: groupToken, chat: groupId } : null,
            channel: (channelToken && channelId) ? { token: channelToken, chat: channelId } : null
        },
        vk: (vkToken && vkPeerId) ? { token: vkToken, peerId: vkPeerId } : null
    };
}

async function readChannelSettings() {
    try {
        const snap = await db.ref('channels').get();
        return normalizeChannelSettings(snap.val() || {});
    } catch (err) {
        functions.logger.warn('channels settings unavailable', err && err.message);
        return normalizeChannelSettings({});
    }
}

// Рассылает вызов по настроенным каналам и возвращает ОТЧЁТ:
//   { sent: ['telegram:group', 'vk'], results: { 'telegram:group': 'sent', … },
//     configured: { 'telegram:group': true, … } }
// Отчёт пишется в alerts/<id>/delivery и показывается в панели «Вызовы»,
// потому что молчаливая доставка неразличима с незадеплоенной функцией:
// «Проверить Группу» в админке шлёт из браузера и всегда проходит, а настоящий
// вызов во время раунда идёт только отсюда.
// Ошибка одного приёмника не отменяет остальные: вызов в любом случае лежит
// в alerts/ и виден в админке.
async function deliverOfficialCall(a) {
    const cfg = await readChannelSettings();
    const report = { sent: [], results: {}, configured: {} };
    const html = officialCallHtml(a);

    const tgTargets = [
        ['telegram:group', cfg.telegram.group],
        ['telegram:channel', cfg.telegram.channel]
    ];
    for (const target of tgTargets) {
        const label = target[0];
        const conf = target[1];
        report.configured[label] = !!conf;
        if (!conf) {
            report.results[label] = 'not_configured';
            functions.logger.warn(label + ': token/chat id are not set in channels/telegram');
            continue;
        }
        try {
            const r = await channelPostJson(
                'https://api.telegram.org/bot' + encodeURIComponent(conf.token) + '/sendMessage',
                { chat_id: conf.chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true }
            );
            if (r && r.ok) {
                report.sent.push(label);
                report.results[label] = 'sent';
            } else {
                const reason = r
                    ? (r.description || (r.error_code ? 'code ' + r.error_code : '') ||
                       (r.__rawBody ? 'HTTP ' + r.__httpStatus : '') || 'empty response')
                    : 'empty response';
                report.results[label] = 'error: ' + channelStr(reason, 200);
                functions.logger.warn(label + ' send failed', reason);
            }
        } catch (err) {
            const name = err && err.name === 'AbortError' ? 'timeout' : (err && err.message);
            report.results[label] = 'error: ' + channelStr(name, 200);
            functions.logger.warn(label + ' send error', err && err.message);
        }
    }

    report.configured.vk = !!cfg.vk;
    if (!cfg.vk) {
        report.results.vk = 'not_configured';
        functions.logger.warn('vk: token/peer id are not set in channels/vk');
    } else {
        try {
            // Только form-urlencoded: см. комментарий к channelPostForm.
            const r = await channelPostForm('https://api.vk.com/method/messages.send', {
                peer_id: cfg.vk.peerId,
                message: officialCallPlain(a),
                random_id: Date.now(),
                access_token: cfg.vk.token,
                v: VK_API_VERSION
            });
            if (r && !r.error && r.response !== undefined) {
                report.sent.push('vk');
                report.results.vk = 'sent';
            } else {
                const e = (r && r.error) || {};
                const reason = e.error_msg
                    ? ('code ' + (e.error_code || '?') + ': ' + e.error_msg)
                    : (r && r.__rawBody ? 'HTTP ' + r.__httpStatus : 'empty response');
                report.results.vk = 'error: ' + channelStr(reason, 200);
                functions.logger.warn('vk send failed', reason);
            }
        } catch (err) {
            const name = err && err.name === 'AbortError' ? 'timeout' : (err && err.message);
            report.results.vk = 'error: ' + channelStr(name, 200);
            functions.logger.warn('vk send error', err && err.message);
        }
    }
    return report;
}

// Запись отчёта о доставке в сам вызов: alerts/<id>/delivery.
// Правила RTDB клиентам обновлять alerts/<id> не разрешают, а Admin SDK
// правилами не ограничен — статус пишет только функция.
async function recordDelivery(alertId, report, extra) {
    if (!alertId) return;
    const payload = Object.assign({
        at: Date.now(),
        sent: report && report.sent ? report.sent.length : 0,
        channels: (report && report.results) || {},
        configured: (report && report.configured) || {}
    }, extra || {});
    try {
        await db.ref('alerts/' + alertId + '/delivery').set(payload);
    } catch (err) {
        // Отчёт — не часть вызова: его сбой не должен ронять доставку/push.
        functions.logger.warn('recordDelivery failed', err && err.message);
    }
}

exports.onAlertCreated = functions.database.ref('/alerts/{id}').onCreate(async function (snap) {
    try {
        if (!(await globalNotificationsEnabled())) {
            functions.logger.info('onAlertCreated: global notifications disabled, skip');
            await recordDelivery(snap.key, null, { skipped: 'notifications_disabled' });
            return;
        }
        const a = snap.val() || {};
        if (a.status && a.status !== 'active') return;
        if (a.type !== 'referee' && a.type !== 'marshal') { functions.logger.warn('onAlertCreated: invalid type, skip'); return; }
        // Ключ антиспама — игрок + тип вызова, а не раунд: с прежним ключом
        // 'alert:<roundId>' второй вызов из того же флайта (маршал у соседа
        // или судья у другого игрока) в течение 2 секунд отбрасывался целиком,
        // и в Telegram/VK не уходил вообще.
        const rateKey = 'alert:' + [a.roundId || 'noround', a.playerId || 'anon', a.type].join(':');
        if (rateLimited(rateKey, 2000)) {
            functions.logger.warn('onAlertCreated: rate-limited', rateKey);
            await recordDelivery(snap.key, null, { skipped: 'rate_limited' });
            return;
        }

        // Telegram/VK не зависят от Web Push: раньше при пустом списке
        // админских подписок функция выходила до всякой рассылки.
        // Сбой Telegram/VK не должен отменять Web Push: раньше исключение
        // внутри доставки перепрыгивало в общий catch, и телефон админа
        // не получал вызов вообще.
        let report = { sent: [], results: {}, configured: {} };
        try {
            report = await deliverOfficialCall(a);
        } catch (err) {
            functions.logger.warn('onAlertCreated: channels failed', err && err.message);
            report.results.error = 'error: ' + channelStr(err && err.message, 200);
        }
        await recordDelivery(snap.key, report);
        if (report.sent.length) functions.logger.info('onAlertCreated: delivered via ' + report.sent.join(', '));
        else functions.logger.warn('onAlertCreated: nothing delivered', JSON.stringify(report.results));

        const keys = await ensureVapidKeys();
        configureWebPush(keys);

        const allSubs = await getAllSubscriptions();
        const subs = await getAdminSubscriptions(allSubs);
        functions.logger.info('alert push: ' + subs.length + ' admin subs of ' + allSubs.length);
        try {
            await db.ref('alerts/' + snap.key + '/delivery/push').set(subs.length);
        } catch (err) {
            functions.logger.warn('delivery/push write failed', err && err.message);
        }
        if (!subs.length) {
            functions.logger.warn('onAlertCreated: нет подписок админов — push не отправлен');
            return;
        }
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

// ── Проверка СЕРВЕРНОЙ доставки из админки ────────────────────────────────
// Кнопки «Проверить Группу / Канал / ВК» отправляют сообщение из браузера:
// они подтверждают токен и chat_id, но не подтверждают, что вызов судьи во
// время раунда дойдёт — боевую отправку делает onAlertCreated, читая channels/
// через Admin SDK. Эта функция прогоняет тот же серверный путь и возвращает
// отчёт по каждому каналу, поэтому админ видит причину («не настроено»,
// «ошибка 100 от VK», «таймаут»), а не догадывается по отсутствию сообщения.
exports.testOfficialCallDelivery = functions.runWith({}).https.onCall(async function (data, context) {
    const authCtx = context && context.auth;
    const uid = authCtx && authCtx.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    const token = authCtx.token || {};
    const isMaster = uid === MASTER_UID && token.tournamentMaster === true && token.tournamentMasterUntil > Date.now();
    let profile = null;
    try {
        profile = (await db.ref('users/' + uid).get()).val();
    } catch (e) { profile = null; }
    if (!isMaster && !isAdminProfile(profile)) {
        throw new functions.https.HttpsError('permission-denied', 'Administrator rights required.');
    }
    if (rateLimited('testDelivery:' + uid, 5000)) {
        throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts. Try again later.');
    }

    const enabled = await globalNotificationsEnabled();
    const cfg = await readChannelSettings();
    const configured = {
        'telegram:group': !!cfg.telegram.group,
        'telegram:channel': !!cfg.telegram.channel,
        vk: !!cfg.vk
    };
    // Глобальный выключатель проверяется так же, как в onAlertCreated: тест
    // обязан показывать реальное поведение, а не «всё работает».
    if (!enabled) {
        return { ok: false, reason: 'notifications_disabled', enabled: false, configured: configured, results: {}, sent: [], at: Date.now() };
    }
    if (!configured['telegram:group'] && !configured['telegram:channel'] && !configured.vk) {
        return { ok: false, reason: 'not_configured', enabled: true, configured: configured, results: {}, sent: [], at: Date.now() };
    }

    const a = {
        type: (data && data.type === 'marshal') ? 'marshal' : 'referee',
        hole: 1,
        playerName: 'Тест серверной доставки (админка)',
        flightMembers: [],
        time: Date.now(),
        test: true
    };
    let report = { sent: [], results: {}, configured: {} };
    try {
        report = await deliverOfficialCall(a);
    } catch (err) {
        functions.logger.warn('testOfficialCallDelivery: delivery failed', err && err.message);
        report.results.error = 'error: ' + channelStr(err && err.message, 200);
    }
    functions.logger.info('testOfficialCallDelivery by ' + uid + ': ' + JSON.stringify(report.results));
    return {
        ok: report.sent.length > 0,
        reason: report.sent.length ? '' : 'nothing_delivered',
        enabled: true,
        configured: configured,
        results: report.results,
        sent: report.sent,
        at: Date.now()
    };
});
