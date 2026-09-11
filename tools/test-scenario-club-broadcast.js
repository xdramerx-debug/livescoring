#!/usr/bin/env node
/**
 * СКВОЗНОЙ СЦЕНАРНЫЙ ТЕСТ: адресные Push-анонсы клуба (v1.58.0).
 *
 *   node tools/test-scenario-club-broadcast.js
 *
 * Прогоняются НАСТОЯЩИЕ js/utils.js + js/admin.js + js/pwa.js + js/feed.js
 * в vm-контекстах с фейковой Firebase (без сети и без браузера):
 *
 *   1) админка: выбор аудитории — списки турниров и протоколов берутся из базы,
 *      счётчик получателей считает реальные аккаунты и не обещает пуш гостям;
 *   2) отправка: в broadcasts/<id> вместе с текстом ложится снимок адресатов
 *      (audience.uids) — чтобы страница игрока фильтровала без чтения турниров;
 *   3) телефон игрока: pwa-слушатель показывает уведомление только адресату,
 *      чужой адресный анонс проходит молча;
 *   4) старые записи без audience и гость без аккаунта — как раньше: общий
 *      анонс видят все, адресный — никто лишний;
 *   5) лента (feed.html): пропущенный пуш остаётся читаемым, тоже по адресу;
 *   6) вёрстка и i18n: элементы выбора есть на странице, ключи — в двух словарях.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var failures = 0;
var checks = 0;

function ok(cond, label) {
    checks++;
    if (!cond) { failures++; console.error('FAIL', label); } else console.log('ok  -', label);
}
function eq(actual, expected, label) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    checks++;
    if (a !== e) {
        failures++;
        console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e);
    } else console.log('ok  -', label);
}
function flush(times) {
    var p = Promise.resolve();
    for (var i = 0; i < (times || 10); i++) p = p.then(function () {});
    return p;
}

/* ──────────────────────────────────────────────────────────
   Фейковая Realtime Database: дерево по путям «a/b/c» + подписки
   ────────────────────────────────────────────────────────── */
function clone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
function getPath(store, p) {
    if (!p) return store;
    var parts = String(p).split('/');
    var cur = store;
    for (var i = 0; i < parts.length; i++) {
        if (!cur || typeof cur !== 'object') return null;
        cur = cur[parts[i]];
    }
    return cur === undefined ? null : cur;
}
function setPath(store, p, val) {
    var parts = String(p).split('/').filter(function (x) { return x !== ''; });
    var cur = store;
    for (var i = 0; i < parts.length - 1; i++) {
        var k = parts[i];
        if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
    }
    var last = parts[parts.length - 1];
    if (val === null || val === undefined) delete cur[last];
    else cur[last] = val;
}
function makeFakeDb(seed) {
    var store = seed ? clone(seed) : {};
    var listeners = [];
    var seq = 0;
    function ref(p) {
        var base = String(p || '').replace(/^\/+|\/+$/g, '');
        var r = {
            key: base ? base.split('/').pop() : null,
            once: function () { var snap = getPath(store, base); return Promise.resolve({ val: function () { return clone(snap); } }); },
            set: function (v) { setPath(store, base, clone(v)); return Promise.resolve(); },
            update: function (obj) {
                Object.keys(obj || {}).forEach(function (k) {
                    setPath(store, (base ? base + '/' : '') + k, obj[k] === null ? null : clone(obj[k]));
                });
                return Promise.resolve();
            },
            remove: function () { setPath(store, base, null); return Promise.resolve(); },
            on: function (evt, cb) { if (typeof evt === 'function') cb = evt; if (typeof cb === 'function') listeners.push({ path: base, cb: cb }); },
            off: function () {},
            orderByChild: function () { return this; }, limitToLast: function () { return this; },
            equalTo: function () { return this; }, startAt: function () { return this; }, endAt: function () { return this; },
            child: function (c) { return ref(base ? base + '/' + c : c); }
        };
        r.push = function (v) {
            seq++;
            var id = '-Nbc' + String(seq).padStart(4, '0');
            var full = (base ? base + '/' : '') + id;
            setPath(store, full, clone(v));
            var pushed = ref(full);
            pushed.key = id;
            return Promise.resolve(pushed);
        };
        return r;
    }
    return {
        ref: ref,
        _store: store,
        _set: function (p, v) { setPath(store, p, v); },
        _fire: function (p) {
            var snap = { val: function () { return clone(getPath(store, p)); } };
            listeners.forEach(function (l) { if (l.path === p) l.cb(snap); });
        }
    };
}

/* ──────────────────────────────────────────────────────────
   Данные клуба: два турнира с заявками и один стартовый протокол
   ────────────────────────────────────────────────────────── */
function reg() {
    return {
        uid_anya: { name: 'Смирнова Анна' },
        uid_boris: { name: 'Иванов Борис' },
        uid_vera: { name: 'Петрова Вера' },
        gst_55: { name: 'Гость без аккаунта' }
    };
}
function seedDb(broadcasts) {
    return {
        tournaments: {
            tn1: { name: 'Кубок Пестово', date: '2026-09-20', status: 'upcoming', registeredPlayers: reg() },
            tn2: { name: 'Вечерний раунд', date: '2026-09-27', status: 'upcoming', registeredPlayers: { uid_anya: { name: 'Смирнова Анна' } } },
            tn3: { name: 'Турнир без заявок', date: '2026-10-04', status: 'upcoming' }
        },
        protocols: {
            pr_1: {
                name: 'Старт Кубка', date: '2026-09-20', tournamentId: 'tn1', tournamentName: 'Кубок Пестово',
                format: 'Stableford', formats: ['Stableford', 'Stroke Play (Gross)'],
                playersCount: 4, groupsCount: 2, scheme: '1-10-shot', startTime: '09:00', interval: 7,
                groups: {
                    g1: { roundId: 'r1', groupNo: 1, startHole: 1, startTime: 1, startWave: 0, startWaveLetter: 'А', startOrder: 1, format: 'Stableford', players: [{ id: 'uid_anya' }, { id: 'uid_boris' }] },
                    g2: { roundId: 'r2', groupNo: 2, startHole: 10, startTime: 1, startWave: 0, startWaveLetter: '', startOrder: 2, format: 'Stableford', players: [{ id: 'uid_vera' }, { id: 'gst_9k2l' }] }
                }
            }
        },
        broadcasts: broadcasts || {}
    };
}

/* ── DOM-стаб с элементами по id ─────────────────────────── */
function mkEl(id, value) {
    var el = {
        id: id, value: value || '', innerHTML: '', textContent: '', className: '', style: {},
        _cls: {},
        classList: {
            add: function (name) { el._cls[name] = true; },
            remove: function (name) { delete el._cls[name]; },
            toggle: function (name, on) {
                var want = (on === undefined) ? !el._cls[name] : !!on;
                if (want) el._cls[name] = true; else delete el._cls[name];
            },
            contains: function (name) { return !!el._cls[name]; }
        },
        appendChild: function () {}, remove: function () {}, focus: function () {}, click: function () {},
        setAttribute: function () {}, getAttribute: function () { return null; },
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        addEventListener: function () {}, removeEventListener: function () {}, scrollIntoView: function () {}
    };
    return el;
}
function makeDom(ids) {
    var els = {};
    ids.forEach(function (id) { els[id] = mkEl(id); });
    var doc = {
        documentElement: { style: {}, setAttribute: function () {} },
        body: { style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } }, appendChild: function () {} },
        head: { appendChild: function () {} },
        getElementById: function (id) { return Object.prototype.hasOwnProperty.call(els, id) ? els[id] : null; },
        createElement: function () { return mkEl('created'); },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        addEventListener: function () {}, removeEventListener: function () {}
    };
    return { doc: doc, els: els };
}

function baseSandbox(extra) {
    var sink = [];
    var sb = {
        console: {
            log: function () { sink.push(Array.prototype.join.call(arguments, ' ')); },
            info: function () {}, warn: function () {}, error: function () { sink.push('error: ' + Array.prototype.join.call(arguments, ' ')); }
        },
        Promise: Promise, Date: Date, Math: Math, JSON: JSON, Object: Object, Array: Array,
        String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error,
        parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite,
        encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
        setTimeout: function () { return 0; }, clearTimeout: function () {},
        setInterval: function () { return 0; }, clearInterval: function () {},
        requestAnimationFrame: function () { return 0; },
        matchMedia: function () { return { matches: false, addListener: function () {}, removeListener: function () {}, addEventListener: function () {} }; },
        currentLang: 'ru',
        navigator: { userAgent: 'node-test', language: 'ru', platform: 'node', maxTouchPoints: 0, vibrate: function () {} },
        location: { origin: 'https://club.test', pathname: '/admin.html', href: 'https://club.test/admin.html', search: '' },
        localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
        sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
        addEventListener: function () {}, removeEventListener: function () {},
        window: null, self: null, globalThis: null,
        _sink: sink
    };
    Object.keys(extra || {}).forEach(function (k) { sb[k] = extra[k]; });
    sb.window = sb;
    sb.self = sb;
    sb.globalThis = sb;
    var ctx = vm.createContext(sb);
    sb._load = function (file) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    };
    // toast() из js/utils.js пишет в DOM, которого в тесте нет: заменяем
    // его сборщиком, чтобы видеть, что именно увидел пользователь.
    sb._captureToasts = function () {
        sb.toast = function (m) { sb._sink.push('toast: ' + String(m)); };
    };
    return sb;
}

/* ══════════════════════════════════════════════════════════
   1–2. АДМИНКА: выбор аудитории и отправка
   ══════════════════════════════════════════════════════════ */
var domAdmin = makeDom(['bc-title', 'bc-body', 'bc-link', 'bc-audience', 'bc-aud-tn', 'bc-aud-proto',
    'bc-aud-pick', 'bc-aud-proto-group', 'bc-aud-count', 'admin-broadcasts-list']);
function hidden(els, id) { return !!(els[id]._cls && els[id]._cls.hidden); }
var dbAdmin = makeFakeDb(seedDb());
var admin = baseSandbox({
    document: domAdmin.doc,
    db: dbAdmin,
    currentUser: { uid: 'admin_uid_1' },
    currentUserData: { role: 'admin' },
    confirmAnswer: true
});
admin.confirm = function () { return admin.confirmAnswer; };
admin.alert = function () {};
admin._load('js/utils.js');
admin._load('js/admin.js');
admin._captureToasts();
var adminEls = domAdmin.els;
var adminBroadcastsBefore = 0;

function bcPush(store) {
    var keys = Object.keys(store.broadcasts || {});
    return keys.map(function (k) { return store.broadcasts[k]; });
}

Promise.resolve().then(function () {
    admin.loadBroadcastAudienceOptions();
    return flush(8);
}).then(function () {
    ok(adminEls['bc-aud-tn'].innerHTML.indexOf('Кубок Пестово') !== -1, 'сценарий 1: список турниров для адресата загружен из базы');
    ok(adminEls['bc-aud-tn'].innerHTML.indexOf('Турнир без заявок') !== -1, 'сценарий 1: турнир без заявок тоже виден (админ выбирает сам)');

    adminEls['bc-audience'].value = 'roster';
    adminEls['bc-aud-tn'].value = 'tn1';
    admin.bcAudienceTypeChange();
    return flush(8);
}).then(function () {
    eq(adminEls['bc-aud-count'].textContent, 'Получателей: 3 (без аккаунтов: 1)',
        'сценарий 1: считаются только реальные аккаунты, гость без uid — не адресат');
    ok(hidden(adminEls, 'bc-aud-pick') === false, 'сценарий 1: выбор источника показан, когда аудитория не «все»');
    ok(hidden(adminEls, 'bc-aud-proto-group') === true, 'сценарий 1: для «турнира» выбор протокола скрыт');

    adminEls['bc-title'].value = '  Перенос старта на 10:30  ';
    adminEls['bc-body'].value = '  Регистрация закрыта, ждём всех у клуба  ';
    adminEls['bc-link'].value = 'tournaments.html';
    admin.sendClubBroadcast();
    return flush(10);
}).then(function () {
    var sent = bcPush(dbAdmin._store);
    eq(sent.length, 1, 'сценарий 2: анонс записан один раз');
    var b = sent[0] || {};
    eq(b.title, 'Перенос старта на 10:30', 'поля обрезаются по краям');
    eq(b.body, 'Регистрация закрыта, ждём всех у клуба', 'текст сообщения сохранён');
    eq(b.link, 'tournaments.html', 'ссылка сохранена');
    ok(typeof b.time === 'number' && b.time > 0, 'у анонса есть время отправки');
    eq(b.sentBy, 'admin_uid_1', 'анонс подписан отправителем');
    eq(b.audience.type, 'roster', 'аудитория: турнир');
    eq(Object.keys(b.audience.uids).sort(), ['uid_anya', 'uid_boris', 'uid_vera'], 'снимок адресатов — uid игроков турнира');
    eq(b.audience.count, 3, 'число адресатов записано в анонс');
    eq(b.audience.tournamentId, 'tn1', 'анонс привязан к турниру');
    eq(b.audience.tournamentName, 'Кубок Пестово', 'название турнира подписано в истории');
    eq(adminEls['bc-title'].value, '', 'после отправки форма очищена — тот же текст не уйдёт дважды');
    eq(adminEls['bc-body'].value, '', 'текст сообщения тоже сброшен');

    // ── аудитория «стартовый протокол» ──
    adminEls['bc-audience'].value = 'protocol';
    admin.bcAudienceTypeChange();
    return flush(8);
}).then(function () {
    ok(adminEls['bc-aud-proto'].innerHTML.indexOf('Старт Кубка') !== -1, 'сценарий 2: протоколы выбранного турнира подставлены в выбор');
    ok(hidden(adminEls, 'bc-aud-proto-group') === false, 'сценарий 2: выбор протокола показан');
    adminEls['bc-aud-proto'].value = 'pr_1';
    admin.bcAudienceSourceChange();
    return flush(8);
}).then(function () {
    eq(adminEls['bc-aud-count'].textContent, 'Получателей: 3 (без аккаунтов: 1)',
        'сценарий 2: по протоколу считают игроков групп, гость без аккаунта отсекается');
    adminEls['bc-title'].value = 'Старт с 1-й и 10-й';
    adminEls['bc-body'].value = 'Карточки на стойке';
    admin.sendClubBroadcast();
    return flush(10);
}).then(function () {
    var sent = bcPush(dbAdmin._store);
    eq(sent.length, 2, 'сценарий 2: второй анонс добавлен');
    var b = sent[sent.length - 1];
    eq(b.audience.type, 'protocol', 'аудитория: стартовый протокол');
    eq(b.audience.protocolId, 'pr_1', 'анонс привязан к протоколу');
    eq(Object.keys(b.audience.uids).sort(), ['uid_anya', 'uid_boris', 'uid_vera'], 'адресаты — игроки групп протокола');

    // ── «всем» ──
    adminEls['bc-audience'].value = 'all';
    admin.bcAudienceTypeChange();
    adminEls['bc-title'].value = 'Закрытие клуба в воскресенье';
    adminEls['bc-body'].value = 'Поля закрыты до 15:00';
    admin.sendClubBroadcast();
    return flush(10);
}).then(function () {
    var sent = bcPush(dbAdmin._store);
    var b = sent[sent.length - 1];
    eq(sent.length, 3, 'сценарий 2: общий анонс отправлен');
    eq(b.audience.type, 'all', 'аудитория «всем» пишется явно');
    eq(b.audience.uids, null, 'общий анонс не хранит список адресатов');
    ok(admin._sink.join('\n').indexOf('Анонс отправлен') !== -1 || admin._sink.join('\n').indexOf('Announcement sent') !== -1,
        'админка подтвердила отправку');

    // ── некому отправлять: турнир без заявок ──
    adminEls['bc-audience'].value = 'roster';
    adminEls['bc-aud-tn'].value = 'tn3';
    admin.bcAudienceSourceChange();
    return flush(8);
}).then(function () {
    ok(/некому|нет ни одного|empty/i.test(adminEls['bc-aud-count'].textContent),
        'сценарий 1: пустая аудитория видна до отправки: ' + adminEls['bc-aud-count'].textContent);
    adminBroadcastsBefore = bcPush(dbAdmin._store).length;
    adminEls['bc-title'].value = 'Не должно уйти';
    adminEls['bc-body'].value = 'Проверка защиты';
    admin.confirmAnswer = false;      // на всякий случай: даже подтверждать нечего
    admin.sendClubBroadcast();
    return flush(10);
}).then(function () {
    eq(bcPush(dbAdmin._store).length, adminBroadcastsBefore, 'сценарий 1: анонс «в никуда» в базу не записан');

    /* ══════════════════════════════════════════════════════
       3–4. ТЕЛЕФОН ИГРОКА: pwa-слушатель
       ══════════════════════════════════════════════════════ */
    var viewerBroadcasts = {
        old_common: { title: 'Общий анонс', body: 'Для всех', link: 'index.html', time: 100 },
        for_anya: { title: 'Перенос старта на 10:30', body: 'Только для Кубка', link: 'tournaments.html', time: 200, audience: { type: 'roster', tournamentId: 'tn1', count: 3, uids: { uid_anya: true, uid_boris: true, uid_vera: true } } },
        for_someone_else: { title: 'Чужой турнир', body: 'Не для Ани', link: 'tournaments.html', time: 300, audience: { type: 'roster', tournamentId: 'tn9', count: 1, uids: { uid_other: true } } }
    };
    return runPwaOnce('uid_anya', viewerBroadcasts);
}).then(function (anya) {
    eq(anya.notified, [], 'сценарий 3: первая прогрузка базы не будит игрока старыми записями');
    return runPwaWithNewRecord('uid_anya');
}).then(function (res) {
    eq(res.notified, ['Перенос старта на 10:30'],
        'сценарий 3: адресный анонс дошёл до адресата — и только он один');
    return runPwaWithNewRecord('uid_stranger');
}).then(function (res) {
    eq(res.notified, [], 'сценарий 3: чужой адресный анонс игрока не беспокоил');
    return runPwaGuest();
}).then(function (res) {
    eq(res.notified, ['День открытых дверей'], 'сценарий 4: гость без аккаунта получает только общие анонсы');
    eq(res.initial, [], 'сценарий 4: пустая база при загрузке — не «пропущенный» сигнал, а старт; дальше пуш приходит');

    /* ══════════════════════════════════════════════════════
       5. ЛЕНТА: пропущенный пуш можно прочесть
       ══════════════════════════════════════════════════════ */
    return runFeed('uid_anya');
}).then(function (html) {
    ok(html.indexOf('Перенос старта на 10:30') !== -1, 'сценарий 5: адресный анонс виден в ленте адресату');
    ok(html.indexOf('Чужой турнир') === -1, 'сценарий 5: чужой адресный анонс в ленте не показывается');
    ok(html.indexOf('Общий анонс') !== -1, 'сценарий 5: общий анонс виден всем');
    ok(html.indexOf('Турнир: Кубок Пестово') !== -1 || html.indexOf('Стартовый протокол') !== -1, 'сценарий 5: лента подписывает аудиторию');
    return runFeed('uid_stranger');
}).then(function (html) {
    ok(html.indexOf('Перенос старта на 10:30') === -1, 'сценарий 5: посторонний в ленте адресного анонса не видит');
    ok(html.indexOf('Общий анонс') !== -1, 'сценарий 5: посторонний видит общий анонс');

    /* ══════════════════════════════════════════════════════
       6. ВЁРСТКА И СЛОВАРЬ
       ══════════════════════════════════════════════════════ */
    var html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    ['bc-audience', 'bc-aud-tn', 'bc-aud-proto', 'bc-aud-count', 'bcAudienceTypeChange', 'bcAudienceSourceChange'].forEach(function (needle) {
        ok(html.indexOf(needle) !== -1, 'admin.html: элемент/обработчик ' + needle + ' на месте');
    });
    var utils = fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8');
    ['bc_audience_lbl', 'bc_aud_all', 'bc_aud_tournament', 'bc_aud_protocol', 'bc_aud_hint', 'bc_aud_none_sel', 'feed_announcements_title']
        .forEach(function (key) {
            var n = utils.match(new RegExp(key + ':', 'g')) || [];
            eq(n.length, 2, 'ключ i18n ' + key + ' есть в русском и английском словарях');
        });
    var pwa = fs.readFileSync(path.join(ROOT, 'js/pwa.js'), 'utf8');
    ok(pwa.indexOf('pestovoBroadcastMatches') !== -1, 'js/pwa.js: слушатель фильтрует анонсы по адресу');
    var feedjs = fs.readFileSync(path.join(ROOT, 'js/feed.js'), 'utf8');
    ok(feedjs.indexOf('pestovoBroadcastFeed') !== -1, 'js/feed.js: лента берёт анонсы через общий фильтр');
    var feedhtml = fs.readFileSync(path.join(ROOT, 'feed.html'), 'utf8');
    ok(feedhtml.indexOf('feed-announcements') !== -1, 'feed.html: контейнер анонсов добавлен');

    console.log('');
    if (failures) { console.error('Провалено проверок:', failures, 'из', checks); process.exit(1); }
    console.log('✓ Сценарные тесты: адресные Push-анонсы пройдены:', checks);
}).catch(function (err) {
    console.error('Исключение в сценарии:', (err && err.stack) || err);
    process.exit(1);
});

/* ── pwa: слушатель broadcasts для конкретного зрителя ──── */
// Вешать слушателя будет 'load' (в vm события нет) — вызываем ту же функцию,
// которую страница дёргает на загрузке.
function makePwa(uid, broadcasts) {
    var dom = makeDom([]);
    var db = makeFakeDb({ broadcasts: broadcasts, users: uid ? (function () { var o = {}; o[uid] = { name: 'Игрок' }; return o; })() : {} });
    var sb = baseSandbox({
        document: dom.doc,
        db: db,
        currentUser: uid ? { uid: uid } : null,
        currentUserData: uid ? { role: 'player' } : null
        // Notification не объявляем вовсе: тогда showPushNotification корректно
        // выходит («уведомлений нет»), а текстовый toast остаётся наблюдаемым.
    });
    sb._load('js/utils.js');
    sb._load('js/pwa.js');
    sb._captureToasts();
    sb.initBackgroundBroadcastListener();
    return { sb: sb, db: db };
}
function notifiedTitles(sb) {
    var out = [];
    sb._sink.forEach(function (line) {
        var m = /toast: 📢 <b>([^<]*)<\/b>/.exec(line);
        if (m) out.push(m[1]);
    });
    return out;
}
function runPwaOnce(uid, broadcasts) {
    var w = makePwa(uid, broadcasts);
    w.db._fire('broadcasts');
    return flush(4).then(function () { return { notified: notifiedTitles(w.sb) }; });
}
function runPwaWithNewRecord(uid) {
    var w = makePwa(uid, { old: { title: 'Давно было', body: 'Старое', time: 1, link: 'index.html' } });
    w.db._fire('broadcasts');           // первая прогрузка — молча
    w.db._set('broadcasts/new_roster', {
        title: 'Перенос старта на 10:30', body: 'Только для Кубка', link: 'tournaments.html', time: 500,
        audience: { type: 'roster', tournamentId: 'tn1', count: 3, uids: { uid_anya: true, uid_boris: true, uid_vera: true } }
    });
    w.db._set('broadcasts/new_other', {
        title: 'Чужой турнир', body: 'Не для тебя', link: 'tournaments.html', time: 501,
        audience: { type: 'roster', tournamentId: 'tn9', count: 1, uids: { uid_stranger_two: true } }
    });
    w.db._fire('broadcasts');            // новое событие
    return flush(4).then(function () { return { notified: notifiedTitles(w.sb) }; });
}
function runPwaGuest() {
    var w = makePwa(null, {});
    w.db._fire('broadcasts');
    var knownAfter = notifiedTitles(w.sb);
    w.db._set('broadcasts/guest_all', { title: 'День открытых дверей', body: 'Для всех на поле', link: 'index.html', time: 600 });
    w.db._set('broadcasts/guest_roster', {
        title: 'Только для турнира', body: 'Гость это не должен видеть', link: 'tournaments.html', time: 601,
        audience: { type: 'roster', tournamentId: 'tn1', count: 1, uids: { uid_anya: true } }
    });
    w.db._fire('broadcasts');
    return flush(4).then(function () { return { notified: notifiedTitles(w.sb), initial: knownAfter }; });
}

/* ── лента игрока ────────────────────────────────────────── */
function runFeed(uid) {
    var dom = makeDom(['feed-announcements', 'feed-list']);
    var db = makeFakeDb({
        broadcasts: {
            b1: { title: 'Общий анонс', body: 'Для всех', link: 'index.html', time: 100 },
            b2: {
                title: 'Перенос старта на 10:30', body: 'Регистрация закрыта', link: 'tournaments.html', time: 200,
                audience: { type: 'roster', tournamentId: 'tn1', tournamentName: 'Кубок Пестово', count: 3, uids: { uid_anya: true, uid_boris: true, uid_vera: true } }
            },
            b3: {
                title: 'Чужой турнир', body: 'Не для Ани', link: 'tournaments.html', time: 300,
                audience: { type: 'roster', tournamentId: 'tn9', tournamentName: 'Кубок Удельной', count: 1, uids: { uid_other: true } }
            }
        },
        rounds: {}, reactions: {}
    });
    var sb = baseSandbox({
        document: dom.doc,
        db: db,
        currentUser: uid ? { uid: uid } : null,
        currentUserData: uid ? { role: 'player' } : null
    });
    sb._load('js/utils.js');
    sb._load('js/feed.js');
    sb.loadClubAnnouncements();
    db._fire('broadcasts');
    return flush(4).then(function () { return dom.els['feed-announcements'].innerHTML; });
}
