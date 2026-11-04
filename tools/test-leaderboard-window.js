// Ограничение ЧТЕНИЯ раундов на «Все раунды» (v1.130.7).
// Было: страница подписывалась на db.ref('rounds') целиком, а пагинация
// резала уже загруженный массив — то есть ограничение жило только в отрисовке.
// Каждое открытое табло тянуло всю историю клуба и перерисовывалось на каждое
// сохранение лунки любым игроком.
// Стало: окно последних LB_WINDOW_SIZE раундов через
// orderByChild('createdAt').limitToLast(N), отдельная подписка на активные
// раунды (orderByChild('status').equalTo('active')) и точечная дочитывалка
// одного раунда для ?round=<id>.
// Тест подменяет Firebase-базу и проверяет сам запрос, а не DOM.
// Запуск: node tools/test-leaderboard-window.js
'use strict';
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP: jsdom не установлен — тест окна лидерборда пропущен'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(cond, label) {
    if (cond) console.log('ok  -', label);
    else { failures++; console.error('FAIL', label); }
}

// 300 раундов: по createdAt от старых к новым. id вида r000…r299.
const TOTAL = 300;
const rounds = {};
for (let i = 0; i < TOTAL; i++) {
    const id = 'r' + String(i).padStart(3, '0');
    rounds[id] = {
        status: i === 5 ? 'active' : 'completed',
        createdAt: 1700000000000 + i * 1000,
        completedAt: 1700000000000 + i * 1000 + 500,
        createdBy: 'u1', format: 'Stroke Play', tee: 'wh',
        players: { u1: { name: 'Игрок ' + i, tee: 'wh', scores: { 1: 4 }, fieldHcp: 0, exactHcp: 0 } }
    };
}
// Раунд вне окна — по ссылке ?round= он должен дочитаться точечно.
const FOCUS_ID = 'r001';

const queries = [];
function makeSnapshot(value) {
    return { val: function () { return value; }, exists: function () { return value != null; } };
}
function makeRef(pathKey, order, limit, equal) {
    const ref = {
        _path: pathKey,
        _order: order || null,
        _limit: limit || null,
        _equal: equal === undefined ? null : equal,
        // Настоящий Firebase отдаёт снапшот асинхронно, уже после .on('value').
        on: function (event, handler, errCb) {
            ref._handler = handler;
            ref._err = errCb;
            if (ref._limit) {
                queries.push({ order: ref._order, limit: ref._limit, equal: null, kind: 'window' });
                const ids = Object.keys(rounds).sort(function (a, b) { return rounds[a].createdAt - rounds[b].createdAt; });
                const slice = ids.slice(Math.max(0, ids.length - ref._limit));
                const out = {};
                slice.forEach(function (id) { out[id] = rounds[id]; });
                Promise.resolve().then(function () { if (ref._handler) ref._handler(makeSnapshot(out)); });
            } else if (ref._equal !== null) {
                queries.push({ order: ref._order, limit: null, equal: ref._equal, kind: 'status' });
                const out = {};
                Object.keys(rounds).forEach(function (id) { if (rounds[id].status === ref._equal) out[id] = rounds[id]; });
                Promise.resolve().then(function () { if (ref._handler) ref._handler(makeSnapshot(out)); });
            }
            return handler;
        },
        off: function (event, handler) { if (!handler || handler === ref._handler) ref._handler = null; },
        once: function () {
            const id = String(pathKey).split('/')[1];
            return Promise.resolve(makeSnapshot(pathKey === 'rounds' ? rounds : (rounds[id] || null)));
        },
        orderByChild: function (child) { return makeRef(pathKey, child, null, null); },
        limitToLast: function (n) { return makeRef(pathKey, ref._order, n, null); },
        equalTo: function (value) { return makeRef(pathKey, ref._order, null, value); }
    };
    return ref;
}
const db = { ref: function (p) { return makeRef(p || 'rounds'); } };

const dom = new JSDOM('<!doctype html><html><body>' +
    '<select id="lb-status"><option value="all">all</option><option value="active">active</option><option value="completed">completed</option></select>' +
    '<input id="lb-search" value=""><div id="lb-summary"></div><div id="lb-container"></div>' +
    '</body></html>', {
    runScripts: 'dangerously',
    url: 'https://example.test/leaderboard.html?round=' + FOCUS_ID,
    pretendToBeVisual: true
});
const win = dom.window;
win.db = db;
win.initNav = function () {};
win.initDateRangeFilter = function () {
    return { renderSummary: function (count, total, opts) { win.__summary = { count: count, total: total, opts: opts }; },
             getRange: function () { return { active: false, from: null, to: null }; } };
};
win.getDateRangeFilter = function () { return win.initDateRangeFilter(); };
win.filterEntriesByDateRange = function (entries) { return entries; };
win.getAllRoundsDisplayVariant = function () { return '1'; };
win.getRoundOrder = function () { return [1]; };
win.getRoundHoleCount = function () { return 18; };
win.calcRoundStats = function () { return { gross: 4, toPar: 0, stablefordField: 2, stablefordExact: 2, holesPlayed: 1, currentHole: 2 }; };
win.dedupeRoundPlayersByFio = function (p) { return p; };
win.isPlayerDeleted = function () { return false; };
win.isPlayerFinishedRound = function () { return true; };
win.playerDisplayName = function (p) { return p.name; };
win.privacyDisplayName = function (p) { return p.name; };
win.fmtUserAvatar = function () { return '<span></span>'; };
win.scoreClass = function () { return ''; };
win.fmtScore = function (v) { return String(v == null ? 'E' : v); };
win.fmtDate = function () { return '07 Oct 2026'; };
win.fmtTime = function () { return '10:00'; };
win.fmtRoundTeePills = function () { return 'White'; };
win.pestovoNormalizeTeeCode = function (v) { return v; };
win.pestovoTeeLabel = function () { return 'White'; };
win.pestovoInlineJsArg = function (v) { return String(v == null ? '' : v); };
win.pestovoRoundFormatBadge = function () { return 'Stroke Play'; };
win.buildRoundStatusBadgeHTML = function () { return '<span>Завершён</span>'; };
win.escapeHtml = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, ''); };
win.t = function (key) { return key; };
win.generateGroupHoleTableHTML = function () { return '<div></div>'; };
win.vib = function () {};
win.currentLang = 'ru';
win.initNav = function () {};

win.eval(fs.readFileSync(path.join(ROOT, 'js/leaderboard.js'), 'utf8'));
win.document.dispatchEvent(new win.Event('DOMContentLoaded'));

setTimeout(function () {
    const windowQueries = queries.filter(function (q) { return q.kind === 'window'; });
    check(windowQueries.length >= 1, 'чтение идёт через orderByChild().limitToLast(), а не по всей ветке');
    check(windowQueries.length && windowQueries[0].order === 'createdAt',
        'окно сортируется по createdAt (индекс .indexOn уже объявлен в правилах)');
    check(windowQueries.length && windowQueries[0].limit === 100,
        'в первом запросе ограничение 100 раундов, а не 300 (было: вся ветка)');
    check(windowQueries.length && windowQueries[0].limit < TOTAL, 'запрос не тянет все раунды базы');

    const statusQueries = queries.filter(function (q) { return q.kind === 'status'; });
    check(statusQueries.length === 1 && statusQueries[0].equal === 'active',
        'активные раунды читаются отдельной выборкой по статусу (живое табло не теряет игру)');

    const rows = win.document.querySelectorAll('.lb-row[data-round-id]');
    check(rows.length > 0, 'строки отрисованы из ограниченной выборки');
    check(rows.length <= 100, 'в DOM не больше окна чтения (было: все загруженные раунды)');

    // ?round= вне окна: точечная дочитка одного узла, без повторного чтения ветки.
    const focusRow = win.document.querySelector('.lb-row[data-round-id="' + FOCUS_ID + '"]');
    check(!!focusRow, 'раунд по ссылке ?round= дочитан точечно и показан');

    // Сводка честно сообщает про окно, а не выдаёт его за «всего раундов».
    check(win.__summary && win.__summary.opts && win.__summary.opts.windowed === true,
        'сводка помечает, что загружены последние 100 (а не вся база)');

    // Кнопка «Показать ещё» существует и умеет тянуть архив, когда окно исчерпано.
    const more = win.document.querySelector('#lb-show-more');
    check(!!more, 'есть кнопка «Показать ещё» (архив доступен после окна)');
    check(win.document.getElementById('lb-container').innerHTML.indexOf('rounds-layout') !== -1,
        'контейнер отрисован текущей компоновкой');

    if (failures) { console.error('\n' + failures + ' проверок не прошло'); process.exit(1); }
    console.log('\nОграничение чтения лидерборда работает в запросе, а не только в отрисовке');

}, 120);
