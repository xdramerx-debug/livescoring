// Автотест «вставка стартового листа пачкой» + «удаление участников»
// (запуск: node tools/test-tn-mgr-startlist.js)
// ---------------------------------------------------------------------------
// 1) TnMgrCore.parseStartList: строки «10:00: фамилия имя, фамилия имя»,
//    стартовая лунка, разное разделение имён, дубли, «мусорные» строки.
// 2) buildSheetFromFlights: номера флайтов и стартовое время берутся из
//    вставленного листа, а не из автоподбора.
// 3) TnMgrData.generateSheetFromFlights: лист + раунд группы пишутся в базу,
//    ненайденные ФИО возвращаются в missing.
// 4) TnMgrData.removePlayers: игрок снимается со всех сущностей.
// 5) TnMgrData.clearSheetEntries: «Удалить всех» в стартовом листе — записи,
//    маркеры, раунды групп и публикация сняты, сам лист на месте.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function ok(cond, label, extra) {
    if (!cond) { failures++; console.error('FAIL', label, extra === undefined ? '' : extra); }
    else console.log('ok  -', label);
}
function eq(actual, expected, label) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e); }
    else console.log('ok  -', label);
}

// ── In-memory Firebase ──
const dbState = { data: {}, writes: [] };
let pushSeq = 0;
function split(p) { return String(p || '').split('/').filter(function (x) { return x !== ''; }); }
function dbGet(p) {
    let node = dbState.data;
    const parts = split(p);
    for (let i = 0; i < parts.length; i++) {
        if (node == null || typeof node !== 'object') return null;
        node = node[parts[i]];
    }
    return node === undefined ? null : node;
}
function dbSet(p, value) {
    const parts = split(p);
    if (!parts.length) { dbState.data = value || {}; return; }
    let node = dbState.data;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
        node = node[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = value;
}
function makeRef(p) {
    const ref = {
        _p: p || '',
        key: split(p).slice(-1)[0] || null,
        once: function () { return Promise.resolve({ val: function () { return dbGet(ref._p); }, exists: function () { return dbGet(ref._p) != null; } }); },
        set: function (v) { dbState.writes.push({ path: ref._p, value: v }); dbSet(ref._p, v); return Promise.resolve(); },
        update: function (obj) {
            dbState.writes.push({ path: ref._p, value: obj });
            Object.keys(obj || {}).forEach(function (k) { dbSet((ref._p ? ref._p + '/' : '') + k, obj[k]); });
            return Promise.resolve();
        },
        remove: function () { dbSet(ref._p, null); return Promise.resolve(); },
        push: function (v) {
            const key = 'push' + (++pushSeq);
            const child = makeRef((ref._p ? ref._p + '/' : '') + key);
            if (v !== undefined) child.set(v);
            return child;
        },
        on: function () {}, off: function () {},
        orderByChild: function () { return ref; }, equalTo: function () { return ref; },
        limitToLast: function () { return ref; }, limitToFirst: function () { return ref; },
        startAt: function () { return ref; }, endAt: function () { return ref; }, orderByKey: function () { return ref; }
    };
    return ref;
}

const sandbox = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, String, Number, Boolean,
    Array, Object, Promise, RegExp, Error, setTimeout, clearTimeout, setInterval, clearInterval,
    encodeURIComponent, decodeURIComponent,
    db: { ref: makeRef },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
    navigator: { language: 'ru', onLine: true },
    location: { search: '', pathname: '/admin.html', origin: 'https://club.example', href: '' },
    document: {
        getElementById: function () { return null; },
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        createElement: function () { return { style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {} }; },
        addEventListener: function () {}, removeEventListener: function () {},
        body: {
            style: {}, dataset: {},
            appendChild: function () {}, removeChild: function () {},
            setAttribute: function () {}, getAttribute: function () { return null; },
            querySelector: function () { return null; }, querySelectorAll: function () { return []; },
            addEventListener: function () {}, removeEventListener: function () {},
            classList: {
                _set: {},
                add: function (c) { this._set[c] = true; },
                remove: function (c) { delete this._set[c]; },
                toggle: function (c, on) { if (on === undefined) on = !this._set[c]; if (on) this._set[c] = true; else delete this._set[c]; return on; },
                contains: function (c) { return !!this._set[c]; }
            }
        },
        documentElement: { style: { setProperty: function () {} }, setAttribute: function () {}, classList: { add() {}, remove() {} } },
        head: { appendChild: function () {} }
    },
    alert: function () {}, confirm: function () { return true; },
    fetch: function () { return Promise.resolve({ json: function () { return Promise.resolve({}); } }); }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.currentLang = 'ru';
sandbox.currentUser = { uid: 'organizer' };
vm.createContext(sandbox);

function load(rel) { vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel }); }
load('js/tn-mgr-core.js');
load('js/tn-mgr-data.js');

const Core = sandbox.TnMgrCore;
const Data = sandbox.TnMgrData;

// ══════════════════════════════════════════════════════════
// 1. РАЗБОР СТАРТОВОГО ЛИСТА
// ══════════════════════════════════════════════════════════
const text = [
    '10:00: неделько александр, свиридов виктор, гималетдинов рустем, шиловский марк',
    '10:10; петров иван | сидоров олег',
    '9.20 (лунка 10): смирнова анна, козлова мария',
    '   ',
    'примечание без времени'
].join('\n');

const parsed = Core.parseStartList(text);
eq(parsed.flights.length, 3, 'три флайта из трёх строк со временем');
eq(parsed.flights.map(function (f) { return f.startTime; }), ['10:00', '10:10', '09:20'], 'время нормализовано (9.20 → 09:20)');
eq(parsed.flights[0].players.map(function (p) { return p.fio; }),
    ['Неделько Александр', 'Свиридов Виктор', 'Гималетдинов Рустем', 'Шиловский Марк'],
    'ФИО приведены к «Фамилия Имя»');
ok(parsed.flights[0].startHole === null, 'без указания лунки startHole не задан (возьмётся из настроек листа)');
eq(parsed.flights[2].startHole, 10, '«(лунка 10)» даёт старт с 10-й');
eq(parsed.flights[1].players.length, 2, 'разделители «;» и «|» тоже работают');
eq(parsed.issues.length, 1, 'строка без времени попадает в предупреждения');
ok(/время старта/.test(parsed.issues[0].message) && parsed.issues[0].row === 5,
    'в предупреждении указаны строка и причина: ' + JSON.stringify(parsed.issues[0]));
eq(parsed.players.length, 8, 'всего восемь участников');
ok(parsed.flights[2].players[0].gender === 'women' && parsed.flights[0].players[0].gender === 'men',
    'пол определяется по отчеству/имени (Анна → women, Александр → men)');
ok(Core.looksLikeStartList('10:00 иванов\n10:10 петров') === true, 'looksLikeStartList: да, если все строки со временем');
ok(Core.looksLikeStartList('иванов\n10:10 петров') === false, 'looksLikeStartList: нет, если есть строка без времени');

// дубли и одинаковое время
const dup = Core.parseStartList('10:00: иванов иван\n10:00: петров пётр\n10:00: иванов иван');
eq(dup.flights.length, 1, 'одинаковое время объединяется в один флайт');
eq(dup.flights[0].players.length, 2, 'дубль имени не дублируется во флайте');
ok(dup.issues.some(function (i) { return /повтор/i.test(i.message); }), 'повтор имени помечен предупреждением');

// ══════════════════════════════════════════════════════════
// 2. ЛИСТ ИЗ ГОТОВЫХ ФЛАЙТОВ (без автоподбора)
// ══════════════════════════════════════════════════════════
const flights = parsed.flights.map(function (f, i) {
    return {
        startTime: f.startTime, startHole: f.startHole,
        players: f.players.map(function (p, j) {
            return { id: 'p' + i + '_' + j, fio: p.fio, gender: p.gender, tee: 'wh', handicap: 12 + j };
        })
    };
});
const sheet = Core.buildSheetFromFlights({
    flights: flights, tee: 'wh', format: 'stroke', startHole: 1,
    startInterval: 10, firstTeeTime: '10:00', markMode: 'self', startMode: 'sequential'
});
const groups = Object.keys(sheet.entries).map(function (k) { return sheet.entries[k]; });
eq(sheet.flights.length, 3, 'в листе три флайта');
eq(sheet.flights, ['1', '2', '3'], 'номера флайтов — по порядку строк листа');
eq(sheet.groups.map(function (g) { return g.startTime; }), ['10:00', '10:10', '09:20'], 'время флайта — из вставленного листа');
ok(groups.every(function (e) { return e.startHole === (e.flight === '3' ? 10 : 1); }),
    'стартовая лунка флайта сохранена в записях листа');
eq(sheet.options.source, 'start-list', 'лист помечен как собранный из стартового списка');
eq(sheet.options.groupSize, 4, 'размер группы — по самому большому флайту');

// ══════════════════════════════════════════════════════════
// 3. ЗАПИСЬ В БАЗУ
// ══════════════════════════════════════════════════════════
const TID = 'tn1', RID = 'round1';
// Раунд турнира живёт в tournaments/<tid>/rounds/<rid> (как читает слой данных).
const tournament = {
    id: TID, name: 'Клубный турнир',
    players: { pA: { id: 'pA', fio: 'Неделько Александр', gender: 'men', handicap: 10 },
               pB: { id: 'pB', fio: 'Свиридов Виктор', gender: 'men', handicap: 14 } },
    groups: { g1: { id: 'g1', name: 'Основная' } },
    sheets: {},
    rounds: {}
};
tournament.sheets[RID] = { roundId: RID };
tournament.rounds[RID] = { id: RID, name: 'Раунд 1', startHole: 1, tee: 'wh' };
dbSet('tournaments/' + TID, tournament);
dbState.writes.length = 0;

Data.generateSheetFromFlights(TID, RID, flights.slice(0, 1), tournament, { tee: 'wh', format: 'stroke' }).then(function (res) {
    ok(!!res && !!res.sheet, 'generateSheetFromFlights вернул лист');
    ok(Array.isArray(res.missing) && res.missing.length > 0, 'ненайденные ФИО возвращены в missing');
    ok(!!dbGet('tournaments/' + TID + '/sheets/' + RID), 'лист записан в tournaments/<tid>/sheets/<rid>');
    ok(!!dbGet('tournaments/' + TID + '/rounds/' + RID + '/groupRounds'), 'materializeRound создал раунды групп');
    ok(dbState.writes.some(function (w) { return w.path === 'tournaments/' + TID + '/sheets/' + RID; }),
        'лист пишется одной записью');

    // ── 4. УДАЛЕНИЕ УЧАСТНИКОВ ──
    dbSet('tournaments/' + TID + '/registeredPlayers', { pA: true, pB: true });
    dbSet('tournaments/' + TID + '/groups/g1/members', { pA: true, pB: true });
    dbSet('tournaments/' + TID + '/scores/' + RID + '/pA', { '1': 4 });
    tournament.players.pA = { id: 'pA', fio: 'Неделько Александр' };
    dbState.writes.length = 0;
    return Data.removePlayers(TID, ['pA'], tournament);
}).then(function () {
    ok(dbGet('tournaments/' + TID + '/players/pA') === null, 'removePlayers: участник удалён из players');
    ok(!!dbGet('tournaments/' + TID + '/players/pB'), 'removePlayers: второй участник не задет');
    ok(dbGet('tournaments/' + TID + '/registeredPlayers/pA') === null, 'removePlayers: снят из registeredPlayers');
    ok(dbGet('tournaments/' + TID + '/groups/g1/members/pA') === null, 'removePlayers: снят из состава группы');
    ok(dbGet('tournaments/' + TID + '/scores/' + RID + '/pA') === null, 'removePlayers: удалены результаты раунда');
    eq(dbState.writes.length, 1, 'removePlayers: одно атомарное обновление');

    // ── 5. «УДАЛИТЬ ВСЕХ» В СТАРТОВОМ ЛИСТЕ ──
    const sheetPath = 'tournaments/' + TID + '/sheets/' + RID;
    ok(!!dbGet(sheetPath + '/entries'), 'перед очисткой в листе есть записи');
    dbSet(sheetPath + '/markers', { m1: { playerId: 'pB' } });
    dbSet('tournaments/' + TID + '/sheetPublish/' + RID, { ok: true });
    dbSet('protocols/tnm_' + TID + '_' + RID, { ok: true });
    dbState.writes.length = 0;
    return Data.clearSheetEntries(TID, RID, tournament);
}).then(function () {
    const sheetPath = 'tournaments/' + TID + '/sheets/' + RID;
    ok(dbGet(sheetPath + '/entries') === null, 'clearSheetEntries: записи листа очищены');
    ok(dbGet(sheetPath + '/markers') === null, 'clearSheetEntries: QR-привязки очищены');
    ok(!!dbGet(sheetPath), 'clearSheetEntries: сам лист (колонки, настройки) на месте');
    ok(dbGet('tournaments/' + TID + '/sheetPublish/' + RID) === null, 'clearSheetEntries: публикация листа снята');
    ok(dbGet('protocols/tnm_' + TID + '_' + RID) === null, 'clearSheetEntries: протокол удалён');
    ok(!!dbGet('tournaments/' + TID + '/players/pB'), 'clearSheetEntries: участники турнира не удалены');

    console.log(failures ? '\nFAIL: ' + failures + ' провалено' : '\nPASS: стартовый лист пачкой и удаление участников');
    process.exit(failures ? 1 : 0);
}).catch(function (e) {
    console.error('FAIL: исключение', e && e.stack || e);
    process.exit(1);
});
