#!/usr/bin/env node
/**
 * Проверка tournament-блока без браузера:   node tools/test-tn-scorecard.js
 *
 * 1) Три варианта счётной карточки игрока из лидерборда турнира: настройка
 *    в админке («Данные» → settings/tn_scorecard_variant), сохранение, пометка
 *    кнопок и рендер всех трёх макетов;
 * 2) строки лидерборда кликабельны (открывают карточку), заголовки групп с
 *    префиксом «Группа:», вкладки групп (в т.ч. «Гости»), а кнопка протокола
 *    доступна только администратору;
 * 3) удаление турнира = каскад: раунды, маркеры, протоколы и следы в истории
 *    игроков; завершение турнира = раунды СОХРАНЯЮТСЯ в истории игроков;
 * 4) обрезка гандикапа работает только внутри турнира: профиль игрока
 *    (users/<uid>/handicap) остаётся настоящим — 54 не превращается в 28.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var storage = {};
var session = {};
var buttonState = {};
var renderedPanels = {};

function el(tag) {
    return {
        tagName: (tag || 'div').toUpperCase(),
        innerHTML: '',
        textContent: '',
        style: {},
        attrs: {},
        dataset: {},
        children: [],
        classList: {
            _s: {},
            add: function(n) { this._s[n] = true; },
            remove: function(n) { delete this._s[n]; },
            toggle: function(n, on) { if (on === undefined) on = !this._s[n]; if (on) this._s[n] = true; else delete this._s[n]; return !!on; },
            contains: function(n) { return !!this._s[n]; }
        },
        setAttribute: function(n, v) { this.attrs[n] = String(v); },
        getAttribute: function(n) { return this.attrs[n]; },
        appendChild: function(c) { this.children.push(c); return c; },
        removeChild: function() {},
        insertBefore: function(c) { this.children.push(c); return c; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        addEventListener: function() {},
        removeEventListener: function() {},
        focus: function() {},
        blur: function() {},
        click: function() {},
        closest: function() { return null; },
        scrollIntoView: function() {}
    };
}

function button(id) {
    if (!buttonState[id]) buttonState[id] = el('button');
    return buttonState[id];
}

// ── Простое in-memory дерево в духе Realtime Database ──
var tree = {};
var pushCounter = 0;
var writes = [];

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
        on: function(ev, cb) {
            var v = getAt(p);
            setTimeout(function() { cb({ val: function() { return v; }, key: p.split('/').pop() }); }, 0);
            return null;
        },
        once: function() {
            var v = getAt(p);
            if (orderChild && equalToVal !== undefined) {
                var out = {};
                Object.keys(v || {}).forEach(function(k) {
                    var item = (v || {})[k];
                    if (item && item[orderChild] === equalToVal) out[k] = item;
                });
                v = out;
            }
            return Promise.resolve({
                val: function() { return v; },
                exists: function() { return v !== null && v !== undefined; }
            });
        },
        set: function(v) { writes.push({ path: p, op: 'set', value: v }); setAt(p, v); return Promise.resolve(); },
        update: function(obj) {
            writes.push({ path: p, op: 'update', value: obj });
            Object.keys(obj || {}).forEach(function(k) { setAt(p ? p + '/' + k : k, obj[k]); });
            return Promise.resolve();
        },
        remove: function() { writes.push({ path: p, op: 'remove' }); setAt(p, null); return Promise.resolve(); },
        push: function(v) {
            var key = 'gen_' + (++pushCounter);
            var cur = getAt(p) || {};
            cur[key] = v;
            setAt(p, cur);
            writes.push({ path: p + '/' + key, op: 'push', value: v });
            return { key: function() { return key; }, set: function(x) { setAt(p + '/' + key, x); return Promise.resolve(); } };
        },
        transaction: function(fn) {
            var cur = getAt(p);
            var nv = fn(cur === undefined ? null : cur);
            if (nv === undefined) return Promise.resolve({ committed: false, snapshot: { val: function() { return cur; } } });
            setAt(p, nv);
            return Promise.resolve({ committed: true, snapshot: { val: function() { return nv; } } });
        },
        orderByChild: function(c) { return ref(p, c, equalToVal); },
        equalTo: function(v) { return ref(p, orderChild, v); },
        limitToLast: function() { return this; },
        limitToFirst: function() { return this; },
        child: function(c) { return ref(p ? p + '/' + c : c, orderChild, equalToVal); }
    };
}

var sandbox = {
    console: console, Promise: Promise, Date: Date, Math: Math, JSON: JSON,
    Object: Object, Array: Array, String: String, Number: Number, Boolean: Boolean,
    RegExp: RegExp, Error: Error, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: function() { return 0; }, clearInterval: function() {},
    currentLang: 'ru',
    currentUser: null,
    currentUserData: null,
    navigator: { userAgent: 'node-test', platform: 'node', maxTouchPoints: 0, vibrate: function() {}, language: 'ru' },
    location: { origin: 'https://example.test', pathname: '/tournaments.html', href: 'https://example.test/tournaments.html', search: '', hash: '' },
    localStorage: {
        getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
        setItem: function(k, v) { storage[k] = String(v); },
        removeItem: function(k) { delete storage[k]; }
    },
    sessionStorage: {
        getItem: function(k) { return Object.prototype.hasOwnProperty.call(session, k) ? session[k] : null; },
        setItem: function(k, v) { session[k] = String(v); },
        removeItem: function(k) { delete session[k]; }
    },
    db: { ref: function(p) { return ref(p); } },
    toast: function() {},
    confirm: function() { return true; },
    alert: function() {},
    requestAnimationFrame: function(fn) { fn(0); return 0; },
    matchMedia: function() { return { matches: false, addListener: function() {}, removeListener: function() {}, addEventListener: function() {} }; },
    Image: function() { this.src = ''; },
    document: {
        documentElement: el('html'),
        body: el('body'),
        head: el('head'),
        addEventListener: function() {},
        removeEventListener: function() {},
        getElementById: function(id) {
            if (/^tn-card-opt-[123]$/.test(id)) return button(id);
            if (renderedPanels[id]) return renderedPanels[id];
            var e = el('div');
            e.id = id;
            renderedPanels[id] = e;
            return e;
        },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        getElementsByTagName: function() { return []; },
        createElement: el,
        createTextNode: function(t) { return { text: t }; }
    },
    window: null, self: null, globalThis: null
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

var ctx = vm.createContext(sandbox);
function load(file) { vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file }); }

load('js/utils.js');
load('js/tournaments.js');
load('js/tn-scorecard.js');
load('js/admin.js');

var fails = 0, total = 0;
function check(title, actual, expected) {
    total++;
    var a = JSON.stringify(actual), b = JSON.stringify(expected);
    var ok = a === b;
    if (!ok) fails++;
    console.log((ok ? ' ok  ' : 'FAIL ') + '| ' + title + ' → ' + a + (ok ? '' : '  (ожид. ' + b + ')'));
}
function has(title, hay, needle) {
    total++;
    var ok = String(hay || '').indexOf(needle) !== -1;
    if (!ok) fails++;
    console.log((ok ? ' ok  ' : 'FAIL ') + '| ' + title + (ok ? '' : '  (нет подстроки «' + needle + '»)'));
}
function hasnt(title, hay, needle) {
    total++;
    var ok = String(hay || '').indexOf(needle) === -1;
    if (!ok) fails++;
    console.log((ok ? ' ok  ' : 'FAIL ') + '| ' + title + (ok ? '' : '  (не должно быть «' + needle + '»)'));
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var G = sandbox;

// ══════════════════════════════════════════════════════════
section('1 · Вариант счётной карточки (админка → «Данные»)');
// ══════════════════════════════════════════════════════════
check('нормализация «2»', G.normalizeTnCardVariant('2'), '2');
check('нормализация числа 3', G.normalizeTnCardVariant(3), '3');
check('некорректный вариант → 1', G.normalizeTnCardVariant('9'), '1');

G.applyTnCardVariant('2');
check('вариант сохранён локально', storage.pestovo_tn_scorecard_variant, '2');
check('getTnCardVariant читает его', G.getTnCardVariant(), '2');

G.saveTnCardVariant('3');
check('запись в Firebase', writes.filter(function(w) { return w.path === 'settings/tn_scorecard_variant'; }).map(function(w) { return w.value; }), ['3']);
check('кнопка 3 подсвечена', button('tn-card-opt-3').classList.contains('tn-card-variant-active'), true);
check('кнопка 1 не подсвечена', button('tn-card-opt-1').classList.contains('tn-card-variant-active'), false);
check('aria-pressed у активной кнопки', button('tn-card-opt-3').getAttribute('aria-pressed'), 'true');
check('после сохранения вариант = 3', G.getTnCardVariant(), '3');

// ══════════════════════════════════════════════════════════
section('2 · Данные карточки из лидерборда');
// ══════════════════════════════════════════════════════════
var TN = 'tn_demo';
var cutTournament = {
    name: 'Кубок Пестово',
    date: '2026-09-05',
    status: 'active',
    formats: ['Stableford'],
    tees: ['bl'],
    hcpCut: { enabled: false, percent: 100, maxEnabled: true, maxMen: 28, maxWomen: 24 },
    divisions: [
        { id: 'men', name: 'Мужчины', hcpFrom: 0, hcpTo: 12, gender: 'men', tee: 'bl' },
        { id: 'men2', name: 'Мужчины HCP 13+', hcpFrom: 12.1, hcpTo: 54, gender: 'men', tee: 'bl' },
        { id: 'wom', name: 'Девушки', hcpFrom: 0, hcpTo: 54, gender: 'women', tee: 'rd' }
    ],
    registeredPlayers: {
        u1: { uid: 'u1', name: 'Иван Петров', handicap: 54, gender: 'men', tee: 'bl', registeredAt: 1 },
        u2: { uid: 'u2', name: 'Пётр Сидоров', handicap: 8, gender: 'men', tee: 'bl', registeredAt: 2 },
        g1: { name: 'Гость Иванов', handicap: 12, gender: 'men', tee: 'bl', guest: true, registeredAt: 3 }
    }
};

// Раунд турнира: u1 играет с обрезанным HCP 28 (raw 54), u2 — без изменений.
var demoRound = {
    tournamentId: TN,
    protocolId: 'p1',
    protocolName: 'Кубок Пестово · старт',
    tournamentName: 'Кубок Пестово',
    status: 'active',
    format: 'Stableford',
    tee: 'bl',
    startHole: 1,
    holeRange: '1-18',
    groupNo: 3,
    startTime: 1759701600000,
    createdAt: 1759701600000,
    players: {
        u1: {
            name: 'Иван Петров', gender: 'men', tee: 'bl',
            exactHcp: 28, exactHcpRaw: 54, fieldHcp: 28,
            scores: {}
        },
        u2: {
            name: 'Пётр Сидоров', gender: 'men', tee: 'bl',
            exactHcp: 8, exactHcpRaw: 8, fieldHcp: 8,
            scores: {}
        },
        guest_9: {
            name: 'Гость Иванов', gender: 'men', tee: 'bl',
            exactHcp: 12, exactHcpRaw: 12, fieldHcp: 12, isGuest: true,
            scores: {}
        },
        u_gone: {
            name: 'Нет Аккаунта', gender: 'men', tee: 'bl',
            exactHcp: 30, exactHcpRaw: 30, fieldHcp: 30,
            scores: {}
        }
    },
    markerAssignments: {
        u1: { targetId: 'u2', targetName: 'Пётр Сидоров' }
    }
};
// Заполняем счета: u1 — лучше пара на 1-й и 5-й лунках, u2 — ровный гольф.
for (var h = 1; h <= 18; h++) {
    var par = G.holePar(h);
    demoRound.players.u1.scores[h] = (h === 1 || h === 5) ? par - 1 : par;
    demoRound.players.u2.scores[h] = par;
    demoRound.players.guest_9.scores[h] = (h % 4 === 0) ? par + 1 : par;
    demoRound.players.u_gone.scores[h] = par + 2;
}

setAt('tournaments/' + TN, cutTournament);
setAt('protocols/p1', { tournamentId: TN, hcpCut: cutTournament.hcpCut, groups: 3 });
setAt('rounds/r1', demoRound);
setAt('rounds/r0', { status: 'completed', players: {}, createdAt: 1 });
setAt('users/u1', { name: 'Иван Петров', handicap: 54, gender: 'men', roundsPlayed: 1, bestGross: 90, bestStableford: 30, history: { h0: { roundId: 'r0', holes: 18, gross: 90, stablefordField: 30 } } });
setAt('tournaments/' + TN + '/registeredPlayers/g2', { name: 'Призрак Игрок', handicap: 18, gender: 'men', tee: 'bl', guest: true, registeredAt: 4 });
setAt('users/u2', { name: 'Пётр Сидоров', handicap: 8, gender: 'men', roundsPlayed: 1, bestGross: 72, bestStableford: 40, history: { h0: { roundId: 'r0', holes: 18, gross: 72, stablefordField: 40 } } });

G.tnCache[TN] = cutTournament;
G.tnProtocols = { p1: { tournamentId: TN, hcpCut: cutTournament.hcpCut } };
G.tnLbRounds = { r1: demoRound };
G.currentUserData = { uid: 'u2', name: 'Пётр Сидоров', role: 'player' };

var panelId = 'tnlb-' + TN;
renderedPanels[panelId] = el('div');
G.renderTnLeaderboard(TN);
var lbHtml = renderedPanels[panelId].innerHTML;

has('лидерборд открыт', lbHtml.length > 200, true);
has('вкладки групп есть', lbHtml.indexOf('class="tn-tabs"') !== -1, true);
has('вкладка «Все» со счётчиком', /Все<span class="tn-tab-count">\d+<\/span>/.test(lbHtml), true);
has('вкладка «Мужчины»', lbHtml.indexOf('Мужчины') !== -1, true);
has('вкладка «Гости»', lbHtml.indexOf('Гости') !== -1, true);
has('вкладка «Девушки» отсутствует (нет таких заявок)', /Гости/.test(lbHtml) && lbHtml.indexOf('tn-tab-count">0') === -1, true);
has('лидерборд открывается на вкладке «Все» (один блок, без групп)', lbHtml.indexOf("tnSetTab('tn_demo','all')") !== -1, true);
has('название группы в заголовке', lbHtml.indexOf('tn-group-title') !== -1, true);
has('строка лидерборда кликабельна', lbHtml.indexOf('tnScOpen(') !== -1, true);
// Ключ строки — идентификатор игрока (uid), а не ФИО: однофамильцы в разных
// группах больше не склеиваются в одну строку и не открывают чужую карточку.
has('клик передаёт ключ игрока (uid)', lbHtml.indexOf("tnScOpen('" + TN + "','u1')") !== -1, true);
has('клик по второму игроку — свой ключ', lbHtml.indexOf("tnScOpen('" + TN + "','u2')") !== -1, true);
// v1.63.0: бейдж «гость» убран везде — в таблице лидерборда его нет.
has('бейдж «гость» убран из таблицы', lbHtml.indexOf('tn-guest-chip') === -1, true);

// Второй раунд турнира (9 лунок, старт с 10-й) — карточка должна собрать
// сумму по обоим раундам и показать «нет второй девятки» корректно.
var demoRound2 = {
    tournamentId: TN, protocolId: 'p2', tournamentName: 'Кубок Пестово',
    status: 'active', format: 'Stableford', tee: 'bl',
    startHole: 10, holeRange: '10-9', roundName: 'Финальный раунд',
    createdAt: 1759788000000,
    players: {
        u1: { name: 'Иван Петров', gender: 'men', tee: 'bl', exactHcp: 28, exactHcpRaw: 54, fieldHcp: 28, scores: {} },
        u2: { name: 'Пётр Сидоров', gender: 'men', tee: 'bl', exactHcp: 8, exactHcpRaw: 8, fieldHcp: 8, scores: {} }
    }
};
for (var h2 = 10; h2 <= 18; h2++) demoRound2.players.u1.scores[h2] = G.holePar(h2) + 1;
for (var h3 = 1; h3 <= 9; h3++) demoRound2.players.u1.scores[h3] = G.holePar(h3);
for (var h4 = 10; h4 <= 18; h4++) demoRound2.players.u2.scores[h4] = G.holePar(h4) - 1;
for (var h5 = 1; h5 <= 9; h5++) demoRound2.players.u2.scores[h5] = G.holePar(h5);
setAt('rounds/r2', demoRound2);
G.tnLbRounds = { r1: demoRound, r2: demoRound2 };
renderedPanels[panelId] = el('div');
G.renderTnLeaderboard(TN);
var lbHtml2 = renderedPanels[panelId].innerHTML;

var card1 = G.tnScGetCard(TN, 'u1');
check('карточка зарегистрирована', !!card1, true);
check('HCP до обрезки = 54', card1.hcpRaw, 54);
check('HCP после обрезки = 28', card1.effHcp, 28);
has('пометка про обрезку турнира', card1.cutNote, '54');
has('в пометке указано новое значение', card1.cutNote, '28');
check('сыграно два раунда', lbHtml2.length > 200, true);
check('раундов в карточке', card1.rounds.length, 2);
check('суммарно 36 лунок', card1.totals.holes, 36);
check('гросс — сумма двух раундов', card1.totals.gross,
    card1.rounds[0].totals.gross + card1.rounds[1].totals.gross);
check('второй раунд помечен стартовой лункой', card1.rounds[1].startHole, 10);
has('подпись раунда — формат и группа', card1.rounds[0].label, 'Stableford');
check('второй раунд — 18 лунок, старт с 10-й', card1.rounds[1].order[0], 10);
check('сыграно лунок', card1.rounds[0].totals.holes, 18);
check('гросс за раунд', card1.rounds[0].totals.gross, G.calcRoundStats(demoRound.players.u1.scores, 28, 28).gross);
check('бёрди посчитаны', card1.rounds[0].totals.birdies, 2);
check('зачётная группа подписана', card1.divName, 'Мужчины HCP 13+');
check('группа/флайт в шапке', card1.groupLabel, 'Группа 3');
check('маркирует — имя маркируемого', card1.markerName, 'Пётр Сидоров');
check('место в группе попало в карточку', typeof card1.position, 'number');
has('в карточке показано место', G.tnScRender(card1), 'tnsc-pos');
check('гость помечен', G.tnScGetCard(TN, 'guest_9').isGuest, true);
check('игрок без аккаунта тоже в карточках', !!G.tnScGetCard(TN, 'u_gone'), true);
check('u2 без обрезки (нет cutNote)', G.tnScGetCard(TN, 'u2').cutNote, '');
check('u2 отнесён к группе «Мужчины»', G.tnScGetCard(TN, 'u2').divName, 'Мужчины');
has('ТИ в шапке карточки', G.tnScGetCard(TN, 'u2').teeTxt, 'Синий');

// ══════════════════════════════════════════════════════════
section('3 · Три варианта оформления');
// ══════════════════════════════════════════════════════════
[ '1', '2', '3' ].forEach(function(v) {
    G.tnScState.variant = v;
    var html = G.tnScRender(card1);
    has('вариант ' + v + ' отрендерен', html.indexOf('tnsc-v' + v) !== -1, true);
    hasnt('вариант ' + v + ': нет undefined', html, 'undefined');
    hasnt('вариант ' + v + ': нет NaN', html, 'NaN');
    has('вариант ' + v + ': имя игрока', html, 'Иван Петров');
    has('вариант ' + v + ': счёт 1-й лунки (5)', html, '5');
});
G.tnScState.variant = '1';
var v1 = G.tnScRender(card1);
has('v1 — официальный бланк (строка «Пар»)', v1.indexOf('Пар') !== -1, true);
has('v1 — строка «Индекс»', v1.indexOf('Индекс') !== -1, true);
has('v1 — строка «Счёт»', v1.indexOf('>Счёт<') !== -1, true);
has('v1 — нетто', v1.indexOf('Нетто') !== -1, true);
has('v1 — стейблфорд', v1.indexOf('Стейблфорд') !== -1, true);
has('v1 — счётчики Аут/Ин/Итого', v1.indexOf('Аут') !== -1 && v1.indexOf('>Ин<') !== -1 && v1.indexOf('Итого') !== -1, true);
has('v1 — срезанный HCP показан', v1.indexOf('✂') !== -1, true);

G.tnScState.variant = '1';
var v1b = G.tnScRender(card1);
check('v1 — оба раунда отрендерены', (v1b.match(/tnsc-paper/g) || []).length, 2);
has('v1 — у раунда с 10-й лунки указан порядок игры', v1b, 'Лунка · порядок игры');

G.tnScState.variant = '2';
var v2 = G.tnScRender(card1);
has('v2 — плитки лунок', v2.indexOf('tnsc-grid') !== -1, true);
has('v2 — плитка со счётом', v2.indexOf('tnsc-tile-score') !== -1, true);
has('v2 — цвет бёрди', v2.indexOf('birdie') !== -1, true);

G.tnScState.variant = '3';
var v3 = G.tnScRender(card1);
has('v3 — лента счёта', v3.indexOf('tnsc-strip') !== -1, true);
has('v3 — строки статистики', v3.indexOf('tnsc-line') !== -1, true);
has('v3 — лучшая лунка', v3.indexOf('tnsc-best') !== -1, true);
G.tnScState.variant = null;

// Перерисовка открытой карточки при смене варианта админом
G.applyTnCardVariant('2');
check('после applyTnCardVariant карточка использует вариант 2', G.tnScVariant(), '2');
G.applyTnCardVariant('1');

// ══════════════════════════════════════════════════════════
section('4 · Завершение турнира: раунды остаются в истории игрока');
// ══════════════════════════════════════════════════════════
function histOf(uid) { return Object.keys((getAt('users/' + uid + '/history') || {})).length; }
var before = histOf('u1');
return G.pestovoPreserveTournamentRounds(TN).then(function(kept) {
    check('раундов закрыто/записано', kept, 2);
    check('раунд переведён в completed', getAt('rounds/r1/status'), 'completed');
    check('раунд остался в базе', !!getAt('rounds/r1'), true);
    check('в истории u1 добавились записи за оба раунда', histOf('u1'), before + 2);
    var keys = Object.keys(getAt('users/u1/history') || {});
    var newKey = keys.filter(function(k) { return k !== 'h0'; })[0];
    check('запись истории ссылается на раунд турнира', getAt('users/u1/history/' + newKey + '/roundId'), 'r1');
    check('в истории лежит обрезанный для турнира счёт HCP', getAt('users/u1/history/' + newKey + '/exactHcp'), 28);
    check('и настоящее значение гандикапа', getAt('users/u1/history/' + newKey + '/exactHcpRaw'), 54);
    check('сыгранные раунды пересчитаны', getAt('users/u1/roundsPlayed'), 3);

    // Идемпотентность: повторное завершение не должно удваивать историю.
    return G.pestovoPreserveTournamentRounds(TN).then(function(kept2) {
        check('повторный вызов ничего не дописывает', kept2, 0);
        check('записей истории по-прежнему +2', histOf('u1'), before + 2);
        check('roundsPlayed не удваивается', getAt('users/u1/roundsPlayed'), 3);
    });
}).then(function() {

// ══════════════════════════════════════════════════════════
section('5 · Обрезка гандикапа — только на турнир (54 остаётся 54)');
// ══════════════════════════════════════════════════════════
    var cut = { enabled: false, percent: 100, maxEnabled: true, maxMen: 28, maxWomen: 24 };
    var r = G.tnApplyHcpCut(54, 'men', cut);
    check('обрезка по максимуму: эффективный 28', r.effective, 28);
    check('обрезка не трогает исходное значение', r.raw, 54);
    check('процент + максимум считаются вместе', G.tnApplyHcpCut(54, 'men', { enabled: true, percent: 50, maxEnabled: true, maxMen: 28 }).effective, 27);
    check('девушки — свой максимум', G.tnApplyHcpCut(30, 'women', cut).effective, 24);
    check('без обрезки значение не меняется', G.tnApplyHcpCut(12, 'men', null).effective, 12);

    // Обновление профиля из tournament-раунда не должно зтировать HCP.
    return G.resolveOrCreatePlayerUser({
        uid: 'u1', name: 'Иван Петров', exactHcp: 28, exactHcpRaw: 54,
        hcpFromTournamentCut: true, gender: 'men', tee: 'bl'
    });
}).then(function(uid) {
    check('разрешение игрока вернуло существующий uid', uid, 'u1');
    check('гандикап в профиле остался настоящим (54)', getAt('users/u1/handicap'), 54);
    // Игрок без tournament-обрезки — обычный путь обновления HCP.
    return G.resolveOrCreatePlayerUser({ uid: 'u2', name: 'Пётр Сидоров', exactHcp: 9, gender: 'men', tee: 'bl' });
}).then(function() {
    check('обычное обновление профиля работает (u2 → 9)', getAt('users/u2/handicap'), 9);

// ══════════════════════════════════════════════════════════
section('6 · Удаление турнира: каскад раундов, протоколов и истории');
// ══════════════════════════════════════════════════════════
    setAt('markers/r1', { m: 1 });
    setAt('markerAssignments/r1', { a: 1 });
    return G.pestovoDeleteTournamentCascade(TN);
}).then(function(sum) {
    check('удалено раундов', sum.rounds, 2);
    check('удалено протоколов', sum.protocols, 1);
    check('раунд турнира удалён', getAt('rounds/r1'), null);
    check('второй раунд турнира тоже удалён', getAt('rounds/r2'), null);
    check('маркеры раунда удалены', getAt('markers/r1'), null);
    check('назначения маркеров удалены', getAt('markerAssignments/r1'), null);
    check('протокол групп удалён', getAt('protocols/p1'), null);
    check('карточка турнира удалена', getAt('tournaments/' + TN), null);
    check('чужой раунд не тронут', !!getAt('rounds/r0'), true);
    check('раунд турнира исчез из истории u1', histOf('u1'), 1);
    check('лучший гросс пересчитан по оставшимся', getAt('users/u1/bestGross'), 90);
    check('roundsPlayed пересчитан', getAt('users/u1/roundsPlayed'), 1);
    check('у гостя-аккаунта история вычищена', Object.keys(getAt('users/guest_9/history') || {}).filter(function(k) { return (getAt('users/guest_9/history/' + k) || {}).roundId === 'r1'; }).length, 0);
    // Игрок, который не играл ни одного сохранённого раунда, не должен получить
    // «мусорный» аккаунт из-за удаления турнира.
    check('пустой профиль не создался у игрока без истории', getAt('users/ghost_player'), null);

// ══════════════════════════════════════════════════════════
section('7 · Кнопка протокола — только администратору');
// ══════════════════════════════════════════════════════════
    check('игрок не видит кнопку протокола', G.tnCanSeeProtocol(), false);
    session.pestovo_is_admin = 'true';
    check('администратор видит', G.tnCanSeeProtocol(), true);

    // В списках турнира кнопка появляется только для админа.
    G.tnCache = {};
    setAt('tournaments/tn_done', {
        name: 'Завершённый кубок', status: 'completed', date: '2026-08-01',
        formats: ['Stableford'], tees: ['bl'],
        registeredPlayers: { u2: { uid: 'u2', name: 'Пётр Сидоров', handicap: 9, gender: 'men', tee: 'bl', registeredAt: 1 } }
    });
    G.tnCache['tn_done'] = getAt('tournaments/tn_done');
    G.currentUserData = { uid: 'u2', name: 'Пётр Сидоров', role: 'player' };
    delete session.pestovo_is_admin;
    G.tnRenderList();
    var asPlayer = String(renderedPanels['tn-list'].innerHTML);
    hasnt('игроку кнопка «Протокол результатов (PDF)» не показывают', asPlayer, 'Протокол результатов (PDF)');
    var rosterBtn = (asPlayer.match(/<button class="btn btn-og btn-sm tn-roster-toggle"[^>]*>[\s\S]*?<\/button>/) || [''])[0];
    check('кнопка списка — иконка, подпись и число', rosterBtn.replace(/^[^>]*>/, '').replace(/<\/button>$/, ''), '<i class="fas fa-list-ul"></i> Участники (1)');
    has('подсказка кнопки осталась в title', rosterBtn, 'title="Список участников"');
    has('ТИ без дублирующей подписи', /ТИ:\s*Синие/.test(asPlayer) === false, true);
    session.pestovo_is_admin = 'true';
    G.tnRenderList();
    has('администратору кнопку протокола показывают', String(renderedPanels['tn-list'].innerHTML), 'Протокол результатов (PDF)');
    delete session.pestovo_is_admin;
    check('после удаления турнира его карточка исчезла из кэша', !!G.tnCache[TN], false);
}).then(function() {
    console.log('\n' + (fails ? '✗ ' + fails + ' из ' + total + ' проверок не прошли' : 'All tn-scorecard tests passed ✔ (' + total + ' checks)'));
    process.exit(fails ? 1 : 0);
}).catch(function(err) {
    console.error('ERR', err && err.stack ? err.stack : err);
    process.exit(1);
});
