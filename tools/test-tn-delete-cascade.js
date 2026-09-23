#!/usr/bin/env node
/**
 * Удаление турнира из админки = каскад:  node tools/test-tn-delete-cascade.js
 *
 * 1) Кнопка «Удалить турнир» единой вкладки «Турниры 🏆» (js/tn-studio.js,
 *    data-act="del-tn") удаляет НЕ ТОЛЬКО карточку tournaments/<id>, но и все
 *    раунды турнира (включая привязанные только через протокол группы),
 *    протоколы групп, маркеры и следы раундов в истории игроков;
 * 2) в диалоге подтверждения администратор видит реальные числа — сколько
 *    раундов и протоколов уйдёт вместе с турниром;
 * 3) отмена в диалоге ничего не удаляет;
 * 4) отклонённая запись (например, правилами БД) не превращается в молчаливый
 *    успех: сводка приносит errors[], а тост показывает ошибку;
 * 5) после удаления админ возвращается к списку турниров.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var TN = 'tn1';

// ── Мини-дерево в духе Realtime Database ──────────────────────────────────
var tree = {};
var writes = [];
var failRoundDeletes = false;

function getAt(p) {
    if (!p) return tree;
    var parts = String(p).split('/').filter(Boolean);
    var node = tree;
    for (var i = 0; i < parts.length; i++) {
        if (node === null || node === undefined || typeof node !== 'object') return null;
        node = node[parts[i]];
    }
    return (node === undefined) ? null : node;
}
function setAt(p, val) {
    var parts = String(p).split('/').filter(Boolean);
    if (!parts.length) { tree = val || {}; return; }
    var node = tree;
    for (var i = 0; i < parts.length - 1; i++) {
        if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
        node = node[parts[i]];
    }
    if (val === null || val === undefined) delete node[parts[parts.length - 1]];
    else node[parts[parts.length - 1]] = val;
}
function ref(p, orderChild, equalToVal) {
    p = p || '';
    return {
        _p: p,
        // Реальные «живые» подписки тесту не нужны: данные подаются вызовом
        // fire() вручную.
        on: function () { return null; },
        off: function () { return null; },
        once: function () {
            var v = getAt(p);
            if (orderChild && equalToVal !== undefined) {
                var out = {};
                Object.keys(v || {}).forEach(function (k) {
                    var item = (v || {})[k];
                    if (item && item[orderChild] === equalToVal) out[k] = item;
                });
                v = out;
            }
            return Promise.resolve({ val: function () { return v; }, exists: function () { return !!v; } });
        },
        set: function (v) { writes.push({ path: p, op: 'set' }); setAt(p, v); return Promise.resolve(); },
        update: function (obj) {
            // Имитация отказа правил БД ровно на удалении раундов (не на
            // правках истории игроков, которые идут раньше).
            if (!p && failRoundDeletes && Object.keys(obj || {}).some(function (k) { return /^rounds\//.test(k); })) {
                return Promise.reject(new Error('permission_denied'));
            }
            writes.push({ path: p, op: 'update', value: obj });
            Object.keys(obj || {}).forEach(function (k) { setAt(p ? p + '/' + k : k, obj[k]); });
            return Promise.resolve();
        },
        remove: function () { writes.push({ path: p, op: 'remove' }); setAt(p, null); return Promise.resolve(); },
        push: function (v) {
            var key = 'gen_' + Object.keys(getAt(p) || {}).length;
            setAt(p + '/' + key, v);
            return { key: function () { return key; }, set: function (x) { setAt(p + '/' + key, x); return Promise.resolve(); } };
        },
        transaction: function (fn) {
            var cur = getAt(p);
            var nv = fn(cur === undefined ? null : cur);
            if (nv === undefined) return Promise.resolve({ committed: false, snapshot: { val: function () { return cur; } } });
            setAt(p, nv);
            return Promise.resolve({ committed: true, snapshot: { val: function () { return nv; } } });
        },
        orderByChild: function (c) { return ref(p, c, equalToVal); },
        equalTo: function (v) { return ref(p, orderChild, v); },
        child: function (c) { return ref(p ? p + '/' + c : c, orderChild, equalToVal); }
    };
}

// ── Окружение ─────────────────────────────────────────────────────────────
function el(tag) {
    return {
        tagName: (tag || 'div').toUpperCase(),
        innerHTML: '', textContent: '', style: {}, attrs: {}, children: [],
        classList: {
            _s: {},
            add: function (n) { this._s[n] = true; },
            remove: function (n) { delete this._s[n]; },
            toggle: function (n, on) { if (on) this._s[n] = true; else delete this._s[n]; },
            contains: function (n) { return !!this._s[n]; }
        },
        setAttribute: function (n, v) { this.attrs[n] = String(v); },
        getAttribute: function (n) { return this.attrs[n]; },
        appendChild: function (c) { this.children.push(c); return c; },
        removeChild: function () {},
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        addEventListener: function () {},
        removeEventListener: function () {},
        focus: function () {}, blur: function () {}, click: function () {},
        closest: function () { return null; }
    };
}

var panels = {};
var feeds = {};
var toasts = [];
var confirms = [];
var confirmAnswer = true;

var sandbox = {
    console: console, Promise: Promise, Date: Date, Math: Math, JSON: JSON,
    Object: Object, Array: Array, String: String, Number: Number, Boolean: Boolean,
    RegExp: RegExp, Error: Error, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function () { return 0; }, clearInterval: function () {},
    currentLang: 'ru',
    currentUser: { uid: 'admin1' },
    currentUserData: { uid: 'admin1', role: 'admin', name: 'Админ' },
    navigator: { userAgent: 'node-test', platform: 'node', maxTouchPoints: 0, vibrate: function () {}, language: 'ru' },
    location: { origin: 'https://example.test', pathname: '/admin.html', href: 'https://example.test/admin.html', search: '', hash: '' },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    db: { ref: function (p) { return ref(p); } },
    toast: function (m, type) { toasts.push({ text: String(m), type: type || 'info' }); },
    confirm: function (m) { confirms.push(String(m)); return confirmAnswer; },
    alert: function () {},
    bindRealtimeValue: function (name, firebaseRef, cb) { feeds[name] = cb; },
    escapeHtml: function (v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    },
    t: function (k) { return k; },
    TEES: { bk: 'Чёрный', bl: 'Синий', wh: 'Белый', rd: 'Красный' },
    COURSE_RATINGS: { men: { wh: { cr: 72.0, sr: 113 } }, women: { wh: { cr: 72.0, sr: 113 } } },
    holePar: function () { return 4; },
    holeDist: function () { return 300; },
    holeHcp: function (h) { return h; },
    getFieldHcp: function (hi) { return hi == null ? null : Math.round(hi); },
    addEventListener: function () {},
    removeEventListener: function () {},
    document: {
        readyState: 'complete',
        documentElement: el('html'), body: el('body'), head: el('head'),
        activeElement: null,
        addEventListener: function () {}, removeEventListener: function () {},
        getElementById: function (id) {
            if (!panels[id]) { panels[id] = el('div'); panels[id].id = id; }
            return panels[id];
        },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        createElement: el,
        createTextNode: function (t) { return { text: t }; }
    },
    window: null, self: null, globalThis: null
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

var ctx = vm.createContext(sandbox);
function load(file) { vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file }); }

load('js/course-config.js');
load('js/date-range.js');
load('js/dom.js');
load('js/format.js');
load('js/i18n.js');
load('js/utils.js');
// utils.js объявляет свою bindRealtimeValue — админке нужна именно она, но для
// теста удобнее ручная подача снимков: подменяем после загрузки.
sandbox.bindRealtimeValue = function (name, firebaseRef, cb) { feeds[name] = cb; };
load('js/tn-studio-core.js');
load('js/tn-studio.js');

// js/dom.js и utils.js объявляют свою toast — тесту нужна перехватывающая.
sandbox.toast = function (m, type) { toasts.push({ text: String(m), type: type || 'info' }); };

var fails = 0, total = 0;
function check(title, actual, expected) {
    total++;
    var a = JSON.stringify(actual), b = JSON.stringify(expected);
    var ok = a === b;
    if (!ok) fails++;
    console.log((ok ? ' ok  ' : 'FAIL ') + '| ' + title + ' → ' + a + (ok ? '' : '  (ожид. ' + b + ')'));
}
function has(title, haystack, needle) { check(title, String(haystack).indexOf(needle) !== -1, true); }
function section(name) { console.log('\n=== ' + name + ' ==='); }
function fire(name, data) { if (feeds[name]) feeds[name]({ val: function () { return data; } }); }
function studioHtml() { return panels['tn-studio-root'] ? panels['tn-studio-root'].innerHTML : ''; }

// ── Данные: турнир с двумя раундами, протоколом и историей игроков ────────
function seed() {
    tree = {};
    writes = [];
    toasts = [];
    confirms = [];
    setAt('tournaments/' + TN, { name: 'Кубок Пестово', date: '2026-09-20', endDate: '2026-09-21' });
    setAt('tournaments/tn2', { name: 'Кубок Мастера', date: '2026-09-25' });
    // Раунд с прямым tournamentId.
    setAt('rounds/r1', { tournamentId: TN, protocolId: 'p1', status: 'active', players: { u1: { name: 'Иванов Иван' }, u2: { name: 'Петров Пётр' } } });
    // Раунд, привязанный к турниру только через протокол группы.
    setAt('rounds/r2', { protocolId: 'p1', status: 'completed', players: { u1: { name: 'Иванов Иван' } } });
    // Чужой раунд — трогать нельзя.
    setAt('rounds/r9', { status: 'active', players: { u1: { name: 'Иванов Иван' } } });
    setAt('protocols/p1', { tournamentId: TN, name: 'Стартовый лист' });
    setAt('protocols/p2', { tournamentId: 'tn2', name: 'Чужой протокол' });
    setAt('alerts/a1', { roundId: 'r1', type: 'marshal', status: 'active' });
    setAt('alerts/a2', { roundId: 'r9', type: 'marshal', status: 'active' });
    setAt('markers/r1', { u1: { 1: 4 } });
    setAt('markerAssignments/r1', { u1: 'u2' });
    setAt('users/u1', {
        name: 'Иванов Иван',
        history: {
            h0: { roundId: 'r9', holes: 18, gross: 95, stablefordField: 20 },
            h1: { roundId: 'r1', holes: 18, gross: 80, stablefordField: 36 },
            h2: { roundId: 'r2', holes: 18, gross: 82, stablefordField: 33 }
        },
        roundsPlayed: 3, bestGross: 80, bestStableford: 36
    });
    setAt('users/u2', {
        name: 'Петров Пётр',
        history: { h0: { roundId: 'r1', holes: 18, gross: 90, stablefordField: 25 } },
        roundsPlayed: 1, bestGross: 90, bestStableford: 25
    });
}

function histIds(uid) {
    var h = getAt('users/' + uid + '/history') || {};
    return Object.keys(h).map(function (k) { return (h[k] || {}).roundId; }).sort();
}

// ══════════════════════════════════════════════════════════════════════════
section('1 · Кнопка «Удалить турнир» удаляет раунды каскадом');
// ══════════════════════════════════════════════════════════════════════════
check('вкладка экспортирует удаление турнира (tnsDeleteTournament)', typeof sandbox.tnsDeleteTournament, 'function');
seed();
sandbox.tnStudioOpen();
fire('tn-studio-tournaments', { tn1: getAt('tournaments/tn1'), tn2: getAt('tournaments/tn2') });

// Кнопка живёт на вкладке «Общая информация» карточки турнира.
sandbox.tnsOpenListSection('tournaments');
fire('tn-studio-tournaments', { tn1: getAt('tournaments/tn1'), tn2: getAt('tournaments/tn2') });
check('в списке видны оба турнира', (studioHtml().match(/data-act="open"/g) || []).length, 2);

// Сводка перед подтверждением: считаем раунды и протоколы.
var summaryPromise = sandbox.pestovoTournamentDeleteSummary(TN);

summaryPromise.then(function (sum) {
    check('сводка: название турнира', sum.name, 'Кубок Пестово');
    check('сводка: раундов (в т.ч. только через протокол)', sum.rounds, 2);
    check('сводка: протоколов групп', sum.protocols, 1);

    // Удаление через публичное API вкладки (его же дёргает data-act="del-tn").
    confirmAnswer = true;
    sandbox.tnsDeleteTournament(TN);
    return new Promise(function (r) { setTimeout(r, 30); });
}).then(function () {
    has('диалог подтверждения предупреждает о раундах', confirms.join('|'), 'раундами (2)');
    has('диалог подтверждения предупреждает о протоколах', confirms.join('|'), 'протоколами групп (1)');
    check('карточка турнира удалена', getAt('tournaments/' + TN), null);
    check('раунд с tournamentId удалён', getAt('rounds/r1'), null);
    check('раунд, привязанный только через протокол, удалён', getAt('rounds/r2'), null);
    check('чужой раунд не тронут', !!getAt('rounds/r9'), true);
    check('протокол групп удалён', getAt('protocols/p1'), null);
    check('чужой протокол не тронут', !!getAt('protocols/p2'), true);
    check('маркеры раунда удалены', getAt('markers/r1'), null);
    check('вызов маршала удалённого раунда убран', getAt('alerts/a1'), null);
    check('вызов чужого раунда не тронут', !!getAt('alerts/a2'), true);
    check('назначения маркеров удалены', getAt('markerAssignments/r1'), null);
    check('соседний турнир не тронут', !!getAt('tournaments/tn2'), true);

    check('из истории u1 ушли оба раунда турнира', histIds('u1'), ['r9']);
    check('история второго игрока вычищена', histIds('u2'), []);
    check('roundsPlayed пересчитан (u1)', getAt('users/u1/roundsPlayed'), 1);
    check('bestGross пересчитан по оставшимся (u1)', getAt('users/u1/bestGross'), 95);
    check('bestStableford пересчитан (u1)', getAt('users/u1/bestStableford'), 20);
    check('roundsPlayed обнулён (u2)', getAt('users/u2/roundsPlayed'), 0);
    check('bestGross снят (u2)', getAt('users/u2/bestGross'), null);

    var ok = toasts.filter(function (t) { return t.type === 'success'; }).map(function (t) { return t.text; }).join('|');
    has('тост сообщает об удалении раундов', ok, 'раундов удалено: 2');
    has('тост сообщает об удалении протоколов', ok, 'протоколов: 1');

    // После удаления админ возвращается к списку турниров.
    fire('tn-studio-tournaments', { tn2: getAt('tournaments/tn2') });
    has('показан список турниров (удалённого в нём нет)', studioHtml(), 'Кубок Мастера');
    check('удалённого турнира в списке нет', studioHtml().indexOf('Кубок Пестово'), -1);

// ══════════════════════════════════════════════════════════════════════════
    section('2 · Отмена в диалоге ничего не удаляет');
// ══════════════════════════════════════════════════════════════════════════
    seed();
    confirmAnswer = false;
    sandbox.tnsDeleteTournament(TN);
    return new Promise(function (r) { setTimeout(r, 30); });
}).then(function () {
    check('турнир остался', !!getAt('tournaments/' + TN), true);
    check('раунд остался', !!getAt('rounds/r1'), true);
    check('протокол остался', !!getAt('protocols/p1'), true);
    check('вызов маршала остался', !!getAt('alerts/a1'), true);
    check('история игрока не тронута', histIds('u1'), ['r1', 'r2', 'r9']);

// ══════════════════════════════════════════════════════════════════════════
    section('3 · Отклонённая запись не маскируется под успех');
// ══════════════════════════════════════════════════════════════════════════
    seed();
    confirmAnswer = true;
    toasts = [];
    // Правила БД отклонили мульти-запись удаления раундов.
    failRoundDeletes = true;
    sandbox.tnsDeleteTournament(TN);
    return new Promise(function (r) { setTimeout(r, 30); });
}).then(function () {
    check('раунд остался в базе (запись отклонена)', !!getAt('rounds/r1'), true);
    check('вызов не удалён вместе с неудалённым раундом', !!getAt('alerts/a1'), true);
    var errs = toasts.filter(function (t) { return t.type === 'error'; });
    check('админ видит ошибку, а не «удалено»', errs.length > 0, true);
    if (errs.length) has('текст ошибки доехал до тоста', errs[0].text, 'permission_denied');
    var ok = toasts.filter(function (t) { return t.type === 'success'; }).length;
    check('успешного тоста об удалении нет', ok, 0);

    // И сводка каскада тоже приносит errors[].
    failRoundDeletes = true;
    return sandbox.pestovoDeleteTournamentCascade(TN);
}).then(function (sum) {
    check('сводка каскада содержит errors', (sum.errors || []).length > 0, true);
    check('каскад прерван (aborted)', sum.aborted, true);
    check('сводка не приписывает удалённые раунды', sum.rounds, 0);
    check('карточка турнира сохранена (раунды удалить не удалось)', !!getAt('tournaments/' + TN), true);
    check('протокол сохранён (раунды удалить не удалось)', !!getAt('protocols/p1'), true);
    failRoundDeletes = false;

// ══════════════════════════════════════════════════════════════════════════
    section('4 · Турнир без раундов удаляется без лишних вопросов');
// ══════════════════════════════════════════════════════════════════════════
    seed();
    setAt('rounds/r1', null);
    setAt('rounds/r2', null);
    setAt('protocols/p1', null);
    confirmAnswer = true;
    toasts = [];
    return sandbox.pestovoTournamentDeleteSummary(TN);
}).then(function (sum) {
    check('сводка: раундов нет', sum.rounds, 0);
    check('сводка: протоколов нет', sum.protocols, 0);
    sandbox.tnsDeleteTournament(TN);
    return new Promise(function (r) { setTimeout(r, 30); });
}).then(function () {
    check('турнир удалён', getAt('tournaments/' + TN), null);
    check('без раундов каскад тоже отработал', toasts.some(function (t) { return t.type === 'success'; }), true);

    console.log('\n' + (fails ? '✗ FAIL' : '✓ OK') + ' — проверок: ' + total + ', провалено: ' + fails);
    process.exit(fails ? 1 : 0);
}).catch(function (err) {
    console.error('Исключение:', err && err.stack || err);
    process.exit(1);
});
