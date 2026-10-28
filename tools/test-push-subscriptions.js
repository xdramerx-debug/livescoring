// Подписка на фоновые Web Push (js/pwa.js): сохранение записи и флаг админа.
// Запуск: node tools/test-push-subscriptions.js
//
// Почему отдельный тест. Уведомления вызова судьи/маршала не доходили до
// телефона по двум причинам, и обе живут в клиенте:
//
//   1. pestovoPushSave() искал существующую подписку запросом
//      /push_subscriptions?orderByChild=endpoint. Читать эту ветку правила
//      database.rules.json разрешают только админам, поэтому у обычного
//      игрока запрос отклонялся, промис падал — и запись не сохранялась
//      вовсе. Теперь отказ чтения означает «пишем напрямую под ключ
//      sub_<хвост endpoint>».
//   2. pestovoPushPatchProfile() считал админом только role === 'admin',
//      хотя в клубе админ — это ещё и флаг admin: true (так же считают
//      hasAdminPanelAccess и серверная wipeAllData). Без isAdmin подписка
//      админа не попадала в рассылку вызовов.
'use strict';

const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP: jsdom не установлен (npm i jsdom) — тест пропущен'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
let failures = 0, checks = 0;
function ok(cond, label) {
    checks++;
    if (!cond) { failures++; console.error('FAIL:', label); }
    else console.log('ok:', label);
}

const PUB = 'BPublicVapidKeyForTests';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/AbC-123_tail';

// ── Фейковая RTDB с правилами: чтение /push_subscriptions только админу ────
function makeDb(opts) {
    const o = opts || {};
    const store = Object.assign({}, o.store);
    const writes = [];
    function snap(value) { return { val: () => (value === undefined ? null : value), exists: () => value !== undefined }; }
    function readValue(p) {
        if (store[p] !== undefined) return store[p];
        const prefix = p + '/';
        const sub = {};
        let found = false;
        Object.keys(store).forEach((k) => {
            if (k.indexOf(prefix) !== 0) return;
            found = true;
            sub[k.slice(prefix.length)] = store[k];
        });
        return found ? sub : undefined;
    }
    function ref(p) {
        const api = {
            _path: p,
            once() {
                if (p === 'settings/vapid_public_key') return Promise.resolve(snap(PUB));
                if (p === 'push_subscriptions') {
                    // Правила базы: .read на ветке — только админ.
                    if (o.rootReadAllowed) return Promise.resolve(snap(readValue(p)));
                    return Promise.reject(Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }));
                }
                if (p.indexOf('users/') === 0) {
                    if (o.profileReadDenied) {
                        return Promise.reject(Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' }));
                    }
                    return Promise.resolve(snap((o.profiles || {})[p.slice('users/'.length)]));
                }
                return Promise.resolve(snap(readValue(p)));
            },
            orderByChild() { return api; },
            equalTo() { return api; },
            on() { return api.ref ? api.ref : api; },
            update(patch) {
                // Мультипуть (db.ref().update({'/push_subscriptions/k': rec}))
                // разворачиваем в отдельные записи — так же, как их видит база.
                if (!p && patch && typeof patch === 'object') {
                    Object.keys(patch).forEach((k) => {
                        writes.push({ path: k.replace(/^\//, ''), patch: patch[k] });
                    });
                    return Promise.resolve();
                }
                writes.push({ path: p, patch });
                return Promise.resolve();
            },
            set(v) { writes.push({ path: p, patch: v }); return Promise.resolve(); },
            remove() { return Promise.resolve(); }
        };
        return api;
    }
    return {
        ref,
        _writes: writes,
        _subscriptionWrites() {
            return writes.filter((w) => !!w.path && (w.path === 'push_subscriptions' ||
                w.path.indexOf('push_subscriptions') === 0));
        }
    };
}

function boot(opts) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        runScripts: 'outside-only', url: 'https://t.test/index.html'
    });
    const win = dom.window;
    const reg = {
        pushManager: {
            getSubscription() { return Promise.resolve(opts.sub || null); },
            subscribe() { return Promise.resolve(opts.createdSub || null); }
        }
    };
    Object.defineProperty(win.navigator, 'serviceWorker', {
        value: {
            ready: Promise.resolve(reg),
            register: () => Promise.resolve(reg),
            addEventListener() {},
            controller: null
        },
        configurable: true
    });
    win.PushManager = function PushManager() {};
    win.Notification = function Notification() {};
    win.Notification.permission = 'granted';
    win.currentLang = 'ru';
    win.currentUser = opts.currentUser || null;
    win.db = opts.db;
    // js/pwa.js на load подписывается на настройки через шину js/utils.js —
    // в изолированном стенде её нет.
    win.bindSettingsValue = function () {};
    win.eval(fs.readFileSync(path.join(ROOT, 'js/pwa.js'), 'utf8'));
    return win;
}

function existingSub() {
    return {
        endpoint: ENDPOINT,
        // options без applicationServerKey → клиент не пересоздаёт подписку
        options: {},
        toJSON() { return { endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'auth' } }; }
    };
}

// 1. Игрок: чтение /push_subscriptions запрещено правилами — подписка всё
//    равно должна сохраниться (иначе у него нет ни анонсов, ни вызовов).
async function testPlayerSaveWithoutRootRead() {
    const db = makeDb({ profiles: { p1: { role: 'player' } } });
    const win = boot({ db, currentUser: { uid: 'p1' }, sub: existingSub() });
    const saved = await win.eval('pestovoPushSubscribe()');
    const wrote = db._subscriptionWrites();
    ok(!!saved && !!wrote.length, 'игрок: подписка записана, несмотря на запрет чтения ветки');
    const rec = wrote.length ? wrote[0].patch : null;
    ok(!!rec && rec.endpoint === ENDPOINT, 'игрок: в записи есть endpoint');
    ok(!!rec && rec.uid === 'p1', 'игрок: подписка привязана к uid');
    ok(!!rec && !!rec.keys && rec.keys.p256dh === 'p256' && rec.keys.auth === 'auth', 'игрок: ключи p256dh/auth сохранены');
    ok(wrote.length && wrote[0].path === 'push_subscriptions/sub_' + ENDPOINT.split('/').pop(),
        'игрок: ключ записи = sub_<хвост endpoint> (переживает повторную подписку)');
    ok(win.localStorage.getItem('pestovo_push_key') === 'sub_' + ENDPOINT.split('/').pop(),
        'игрок: ключ подписки запомнен локально');
    const patch = db._writes.filter((w) => w.path.indexOf('push_subscriptions/sub_') === 0 && w.patch && 'isAdmin' in w.patch)
        .map((w) => w.patch.isAdmin);
    ok(patch.length === 1 && patch[0] === false, 'игрок: isAdmin явно false (устаревший флаг снимается)');
}

// 2. Админ с флагом admin: true (без role) — подписка помечается isAdmin.
async function testAdminFlagProfile() {
    const db = makeDb({ profiles: { adm1: { admin: true } } });
    const win = boot({ db, currentUser: { uid: 'adm1' }, sub: existingSub() });
    await win.eval('pestovoPushSubscribe()');
    const patches = db._writes.filter((w) => w.patch && 'isAdmin' in w.patch).map((w) => w.patch);
    ok(patches.length === 1 && patches[0].isAdmin === true, 'админ admin: true → isAdmin в подписке');
    ok(patches[0].uid === 'adm1', 'админ: uid проставлен вместе с флагом');
}

// 3. Админ по роли — тоже админ.
async function testAdminRoleProfile() {
    const db = makeDb({ profiles: { adm2: { role: 'admin' } } });
    const win = boot({ db, currentUser: { uid: 'adm2' }, sub: existingSub() });
    await win.eval('pestovoPushSubscribe()');
    const patches = db._writes.filter((w) => w.patch && 'isAdmin' in w.patch).map((w) => w.patch);
    ok(patches.length === 1 && patches[0].isAdmin === true, 'админ role: admin → isAdmin в подписке');
}

// 4. Профиль прочитать нельзя (обычный игрок по правилам) — uid всё равно
//    проставляем, isAdmin не трогаем: сервер сверяет админов по профилям сам.
async function testProfileReadDenied() {
    const db = makeDb({ profileReadDenied: true });
    const win = boot({ db, currentUser: { uid: 'p3' }, sub: existingSub() });
    await win.eval('pestovoPushSubscribe()');
    const subWrites = db._subscriptionWrites();
    ok(subWrites.length > 0, 'профиль недоступен: запись подписки создаётся');
    const withUid = db._writes.filter((w) => w.patch && w.patch.uid === 'p3');
    const withAdmin = db._writes.filter((w) => w.patch && 'isAdmin' in w.patch);
    ok(withUid.length > 0, 'профиль недоступен: uid проставлен');
    ok(withAdmin.length === 0, 'профиль недоступен: isAdmin не выдуман');
}

// 5. Админ читает ветку (правила разрешают) — дедупликация по endpoint
//    по-прежнему работает и не плодит вторую запись.
async function testAdminDedupeByEndpoint() {
    const key = 'sub_legacy';
    const db = makeDb({
        rootReadAllowed: true,
        profiles: { adm3: { admin: true } },
        store: { ['push_subscriptions/' + key]: { endpoint: ENDPOINT, keys: { p256dh: 'p256', auth: 'auth' }, uid: 'adm3' } }
    });
    const win = boot({ db, currentUser: { uid: 'adm3' }, sub: existingSub() });
    await win.eval('pestovoPushSubscribe()');
    const keysWritten = db._writes.filter((w) => w.path === 'push_subscriptions/' + key);
    const otherKeys = db._writes.filter((w) => w.path && w.path.indexOf('push_subscriptions/') === 0 && w.path !== 'push_subscriptions/' + key);
    ok(keysWritten.length > 0 && otherKeys.length === 0,
        'админ: существующая запись переиспользована по endpoint, дубль не создан');
    ok(keysWritten.length && keysWritten[0].patch.endpoint === ENDPOINT,
        'админ: в найденную запись записан endpoint');
    ok(win.localStorage.getItem('pestovo_push_key') === key, 'админ: локальный ключ указывает на найденную запись');
}

(async function run() {
    await testPlayerSaveWithoutRootRead();
    await testAdminFlagProfile();
    await testAdminRoleProfile();
    await testProfileReadDenied();
    await testAdminDedupeByEndpoint();
    console.log('\n' + (failures ? 'FAILED ' + failures + ' / ' + checks : 'Passed ' + checks + ' checks'));
    process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
