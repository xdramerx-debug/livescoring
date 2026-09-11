#!/usr/bin/env node
/**
 * СКВОЗНОЙ СЦЕНАРНЫЙ ТЕСТ: форматы игры + иерархия старта (v1.58.0).
 *
 *   node tools/test-scenario-formats-hierarchy.js
 *
 * Прогоняются НАСТОЯЩИЕ js/utils.js, js/start-admin.js и js/qr-start.js в
 * vm-контексте с фейковой Firebase (без сети и без браузера):
 *
 *   1) турнир с двумя форматами (Stableford + Гросс) → стартовый протокол на
 *      11 игроков → автораскладка и расписание (шотган с 1-й и 10-й) →
 *      сохранение. Проверяем то, что РЕАЛЬНО легло в rounds: форматная линия
 *      и иерархия старта (волна на лунке, буква, очередь tee-off, размер
 *      протокола).
 *   2) правка сохранённого протокола: группу перенесли на другую лунку —
 *      волны, буквы и очередь пересчитаны, ключ раунда (а значит и выданный
 *      QR) не изменился.
 *   3) печать QR-карточек подписывает группы теми же буквами, что и админка.
 *   4) старые записи (раунд без formats, протокол без startWave, разреженный
 *      массив из Firebase) не ломаются.
 *   5) экраны (TV, лента раундов, страница счёта, карточка игрока) берут
 *      формат из общего слоя, а не из round.format.
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
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function eq(actual, expected, label) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    checks++;
    if (a !== e) {
        failures++;
        console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e);
    } else console.log('ok  -', label);
}

/* ----------------------------------------------------------
   Фейковая Realtime Database: дерево + путь «a/b/c», как в firebase-compat
   ---------------------------------------------------------- */
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
    var parts = String(p).split('/').filter(function(x) { return x !== ''; });
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
function makeFakeDb() {
    var store = {};
    var seq = 0;
    function ref(p) {
        var base = String(p || '').replace(/^\/+|\/+$/g, '');
        var r = {
            key: base ? base.split('/').pop() : null,
            once: function() { var snap = getPath(store, base); return Promise.resolve({ val: function() { return clone(snap); } }); },
            set: function(v) { setPath(store, base, clone(v)); return Promise.resolve(); },
            update: function(obj) {
                Object.keys(obj || {}).forEach(function(k) {
                    setPath(store, (base ? base + '/' : '') + k, obj[k] === null ? null : clone(obj[k]));
                });
                return Promise.resolve();
            },
            remove: function() { setPath(store, base, null); return Promise.resolve(); },
            transaction: function(fn) {
                var next = fn(clone(getPath(store, base)));
                if (next !== undefined) setPath(store, base, next);
                return Promise.resolve({ committed: true });
            },
            on: function() {}, off: function() {},
            orderByChild: function() { return this; },
            orderByKey: function() { return this; },
            limitToLast: function() { return this; },
            limitToFirst: function() { return this; },
            startAt: function() { return this; },
            endAt: function() { return this; },
            equalTo: function() { return this; },
            child: function(c) { return ref(base ? base + '/' + c : c); }
        };
        r.push = function(v) {
            seq++;
            var id = '-Nfake' + String(seq).padStart(4, '0');
            var full = (base ? base + '/' : '') + id;
            setPath(store, full, clone(v));
            var pushed = ref(full);
            pushed.key = id;
            return Promise.resolve(pushed);
        };
        return r;
    }
    return { ref: ref, _store: store };
}

function flush(times) {
    var p = Promise.resolve();
    for (var i = 0; i < (times || 8); i++) p = p.then(function() {});
    return p;
}

/* ----------------------------------------------------------
   Песочница: utils.js + start-admin.js + фейковая база и DOM
   ---------------------------------------------------------- */
function fakeEl() {
    return {
        style: {}, value: '', textContent: '', innerHTML: '', checked: false, hidden: false, className: '',
        classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
        getAttribute: function () { return null; }, setAttribute: function () {}, removeAttribute: function () {},
        appendChild: function () {}, removeChild: function () {}, remove: function () {},
        addEventListener: function () {}, removeEventListener: function () {}, focus: function () {}, blur: function () {}, click: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        getBoundingClientRect: function () { return { top: 0, left: 0, width: 0, height: 0 }; },
        scrollTop: 0, scrollIntoView: function () {}
    };
}
var db = makeFakeDb();
var pageLog = [];
function recConsole() {
    function push(level) {
        return function () {
            pageLog.push(level + ': ' + Array.prototype.join.call(arguments, ' '));
        };
    }
    return { log: push('log'), info: push('info'), warn: push('warn'), error: push('error') };
}
var sandbox = {
    console: recConsole(), Date: Date, Math: Math, JSON: JSON, Promise: Promise,
    parseInt: parseInt, parseFloat: parseFloat, isFinite: isFinite, isNaN: isNaN,
    String: String, Number: Number, Array: Array, Object: Object, Boolean: Boolean, RegExp: RegExp, Error: Error,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    URLSearchParams: function () { this.get = function () { return null; }; },
    document: {
        getElementById: function () { return null; }, createElement: function () { return fakeEl(); },
        querySelector: function () { return null; }, querySelectorAll: function () { return []; },
        addEventListener: function () {}, documentElement: { style: {}, setAttribute: function () {} },
        body: { style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } } }
    },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
    navigator: { language: 'ru' },
    db: db,
    currentLang: 'ru',
    currentUser: { uid: 'admin_uid_1' },
    toast: function (msg, kind) { pageLog.push('toast: ' + String(msg)); },
    confirm: function () { return true; },
    alert: function () {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8'), sandbox, { filename: 'js/utils.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/start-admin.js'), 'utf8'), sandbox, { filename: 'js/start-admin.js' });

function mkPlayer(i) {
    return {
        id: 'uid_' + i, lastName: 'Игрок', firstName: 'Имя' + i, middleName: '',
        gender: (i % 4 === 0) ? 'women' : 'men', tee: 'wh',
        hcp: 10 + i * 2.4, source: 'registered', uidMatched: true
    };
}

/* ==========================================================
   1. СОХРАНЕНИЕ ПРОТОКОЛА: что легло в раунды
   ========================================================== */
var proto = sandbox.psDefaultProto();
proto.name = 'Старт Кубка Пестово';
proto.tournamentId = 'tn1';
proto.tournamentName = 'Кубок Пестово';
proto.date = '2026-09-20';
proto.formats = ['Stableford', 'Stroke Play (Gross)'];
proto.format = 'Stableford';          // основной формат — первый в линии
proto.method = 'order';
proto.size = 4;
proto.scheme = '1-10-shot';           // пары одновременно с 1-й и 10-й
proto.interval = 7;
proto.startTime = '09:00';
for (var i = 1; i <= 11; i++) proto.players.push(mkPlayer(i));

sandbox.psState.proto = proto;
sandbox.psState.selId = 'tn1';
sandbox.psState.tournaments = [{ id: 'tn1', name: 'Кубок Пестово', date: '2026-09-20', status: 'upcoming', formats: proto.formats.slice() }];
sandbox.psState.groups = [];
sandbox.psState.editingId = null;
sandbox.psState.savedId = null;
sandbox.psState.busy = false;

sandbox.psSaveProtocol();

var T0 = new Date('2026-09-20T09:00:00').getTime();
flush(12).then(function () {
    eq(sandbox.psState.busy, false, 'сохранение завершилось: кнопка «Сохранить» снова активна');
    ok(pageLog.some(function (x) { return x.indexOf('Протокол сохранён') !== -1; }), 'админка получила подтверждение сохранения');
    var rounds = db._store.rounds || {};
    var rids = Object.keys(rounds);
    eq(rids.length, 3, 'сценарий 1: 11 игроков → 3 группы-раунда');

    var pids = Object.keys(db._store.protocols || {});
    eq(pids.length, 1, 'сценарий 1: создан один документ протокола');
    var pid = pids[0];
    var doc = db._store.protocols[pid];

    // ── форматная линия дошла до каждого раунда ──
    eq(doc.format, 'Stableford', 'формат протокола: основной — первый');
    eq(doc.formats, ['Stableford', 'Stroke Play (Gross)'], 'форматная линия протокола сохранена целиком');
    var byPushOrder = rids.map(function (id) { return rounds[id]; });
    byPushOrder.forEach(function (r, gi) {
        eq(r.formats, ['Stableford', 'Stroke Play (Gross)'], 'раунд ' + (gi + 1) + ': играет по обоим форматам протокола');
        eq(r.format, 'Stableford', 'раунд ' + (gi + 1) + ': основной формат для старых клиентов');
    });

    // ── иерархия старта ──
    // Порядок записи = порядок показа (шотган сортирует по лунке, затем времени):
    //   гр.1: лунка 1, 09:00 → первая на лунке   → «1А», старт №1
    //   гр.2: лунка 1, 09:07 → вторая на лунке   → «1Б», старт №3
    //   гр.3: лунка 10, 09:00— одна на лунке     → «10» (без буквы), старт №2
    eq(byPushOrder.map(function (r) { return r.startHole; }), [1, 1, 10], 'старт: лунки групп после shotgun-сортировки');
    eq(byPushOrder.map(function (r) { return r.startTime; }), [T0, T0 + 7 * 60000, T0],
        'старт: пары идут одновременно, следующая пара — через интервал');
    eq(byPushOrder.map(function (r) { return r.startWave; }), [0, 1, 0], 'иерархия: номер волны на своей лунке');
    eq(byPushOrder.map(function (r) { return r.startWaveLetter; }), ['А', 'Б', ''], 'иерархия: буква волны только там, где на лунке 2+ группы');
    eq(byPushOrder.map(function (r) { return r.startOrder; }), [1, 3, 2], 'иерархия: очередь tee-off по времени, а не по номеру группы');
    eq(byPushOrder.map(function (r) { return r.groupsTotal; }), [3, 3, 3], 'иерархия: размер протокола записан в каждый раунд');
    eq(byPushOrder.map(function (r) { return r.groupNo; }), [1, 2, 3], 'номера групп остались порядковыми');

    // ── то же дерево видит общий слой (по записям из базы) ──
    var tree = sandbox.pestovoStartHierarchy(byPushOrder);
    eq(tree.waves.length, 2, 'иерархия: две волны (09:00 и 09:07)');
    eq(tree.waves[0].holes.map(function (h) { return h.hole; }), [1, 10], 'волна 1: работают оба тея');
    eq(tree.waves[0].groups.length, 2, 'волна 1: две группы стартуют одновременно');
    eq(tree.waves[1].groups.length, 1, 'волна 2: одна группа');
    eq(tree.total, 3, 'иерархия: всего три группы');
    eq(tree.players, 11, 'иерархия: все 11 игроков в дереве');

    // ── подписи групп из общего слоя = подписи админки ──
    // Подписи в порядке показа стартового листа (лунка → время) = то, что
    // рисует админка: 1А, 1Б на первой лунке и 10 без буквы на второй.
    var titlesUtil = tree.display.map(function (row) { return sandbox.pestovoStartGroupTitle(row, { holeLetter: true }); });
    eq(titlesUtil, ['Группа 1А', 'Группа 1Б', 'Группа 10'], 'общий слой подписывает группы как админка (буква только при 2+ группах на лунке)');
    eq(tree.rows.map(function (r) { return r.seq; }), [1, 2, 3], 'очередь tee-off — хронологическая, без разрывов');

    // ── форматная линия для показа ──
    eq(sandbox.pestovoRoundFormatsLabel(doc), 'Stableford + Stroke Play (Gross)', 'подпись форматов протокола');
    eq(sandbox.pestovoRoundFormatBadge(byPushOrder[0], 'Stroke'), 'Stableford + Stroke Play (Gross)', 'бейдж формата раунда');
    eq(sandbox.pestovoRoundFormatsLabel({ format: 'Stableford', formatCustom: 'Три-персона-стабл' }), 'Stableford + Три-персона-стабл',
        'свой формат протокола добавляется к линии');

    /* ==========================================================
       2. ПРАВКА ПРОТОКОЛА: перенос группы на другую лунку
       ========================================================== */
    return openForEdit(pid);
}).then(function () {
    var groups = sandbox.psState.groups;
    eq(groups.length, 3, 'сценарий 2: протокол открыт на правку (3 группы)');
    eq(groups.map(function (g) { return g.startWaveLetter; }), ['А', 'Б', ''],
        'правка: буквы волн прочитаны из сохранённого протокола, а не потеряны');

    // Переносим группу с 10-й лунки на 1-ю (то же время) — «10» становится «1В»
    var moved = null;
    groups.forEach(function (g, gi) { if (parseInt(g.startHole, 10) === 10) moved = gi; });
    ok(moved !== null, 'правка: группа на 10-й лунке найдена');
    groups[moved].startHole = 1;
    groups[moved].dirty = true;
    ridBeforeGlobal = groups[moved].roundId;
    ok(!!ridBeforeGlobal, 'правка: у перемещаемой группы уже есть ключ раунда (QR игрока привязан к нему)');

    sandbox.psSaveEdits();
    return flush(16);
}).then(function () {
    var rounds = db._store.rounds || {};
    var rids = Object.keys(rounds);
    eq(rids.length, 3, 'правка: раунды обновлены на месте — новых не создано');
    ok(rids.indexOf(ridBeforeGlobal) !== -1, 'правка: ключ перемещённого раунда прежний → выданный QR продолжает работать');

    var doc = db._store.protocols[Object.keys(db._store.protocols)[0]];
    var gkeys = Object.keys(doc.groups).sort();
    var stored = gkeys.map(function (k) { return doc.groups[k]; });
    eq(stored.map(function (g) { return parseInt(g.startHole, 10); }), [1, 1, 1],
        'правка: все три группы теперь на 1-й лунке');

    // Все группы на одной лунке, но время разное → очередь = по времени
    var rows = sandbox.pestovoStartRows(stored);
    eq(rows.map(function (r) { return r.letter; }), ['А', 'Б', 'В'], 'правка: волны 1А/1Б/1В пересчитаны');

    // Все три группы на 1-й лунке: 09:00 (группа 1) → «А», 09:00 (перенесённая,
    // номер 3) → «Б», 09:07 (группа 2) → «В». Очередь — по времени.
    var movedRound = rounds[ridBeforeGlobal];
    eq(movedRound.startWave, 1, 'правка: волна пересчитана, а не унаследована со старой лунки');
    eq(movedRound.startWaveLetter, 'Б', 'правка: перемещённая группа получила новую букву');
    eq(movedRound.startOrder, 2, 'правка: очередь tee-off пересчитана');
    eq(movedRound.groupsTotal, 3, 'правка: размер протокола обновлён');
    ok(movedRound.status === undefined || movedRound.status !== null, 'правка: статус раунда не затёрт в null');

    /* ==========================================================
       3. ПЕЧАТЬ QR-КАРТОЧЕК: те же буквы из того же документа
       ========================================================== */
    return runQrStart(db._store.protocols[Object.keys(db._store.protocols)[0]]);
}).then(function (qr) {
    eq(qr.labels, ['Группа 1А', 'Группа 1Б', 'Группа 1В'],
        'QR-печать подписывает группы ровно так же, как админка (после правки)');
    eq(qr.formats, 'Stableford + Stroke Play (Gross)', 'QR-печать: в шапке вся форматная линия, а не только основной формат');

    /* ==========================================================
       4. СТАРЫЕ ЗАПИСИ
       ========================================================== */
    eq(sandbox.pestovoRoundFormats({ format: 'Stroke Play' }), ['Stroke Play'], 'legacy: раунд без formats читается');
    eq(sandbox.pestovoRoundFormats({}), [], 'legacy: пустая запись → пустой список форматов');
    eq(sandbox.pestovoRoundFormats({ formats: { 0: 'Stableford', 1: 'Greensomes' } }), ['Stableford', 'Greensomes'],
        'Firebase отдаёт массив объектом {0:…,1:…} — порядок сохраняется');
    eq(sandbox.pestovoRoundFormats({ format: '__custom__', formats: ['__custom__', 'Scramble'] }), ['Scramble'],
        'служебное значение __custom__ не показывается как формат');
    eq(sandbox.pestovoRoundFormatBadge({ format: '' }, 'Stroke'), 'Stroke', 'бейдж: пустой формат → значение по умолчанию');

    var legacy = sandbox.pestovoStartHierarchy([
        { startHole: 1, startTime: T0, players: { a: {}, b: {} } },
        { startHole: 1, startTime: T0 + 600000, players: { c: {} } }
    ]);
    eq(legacy.rows.map(function (r) { return r.startWave; }), [0, 1], 'legacy: протокол без startWave — волна считается');
    eq(legacy.rows.map(function (r) { return r.letter; }), ['А', 'Б'], 'legacy: буквы считаются, когда их нет в данных');
    eq(legacy.rows.map(function (r) { return r.groupsTotal; }), [2, 2], 'legacy: groupsTotal подставляется из списка');
    eq(sandbox.pestovoStartHierarchy([]).waves.length, 0, 'пустой протокол → пустое дерево (ошибки нет)');

    var single = sandbox.pestovoStartRows([{ startHole: 1, startTime: T0, players: { x: {} }, startWave: 2, startWaveLetter: 'В', startOrder: 3, groupsTotal: 8 }]);
    eq(single[0].letter, 'В', 'частичная выборка (один раунд на TV): буква берётся из базы, а не «первая на лунке»');
    eq(single[0].startWave, 2, 'частичная выборка: номер волны из базы');
    eq(single[0].seq, 3, 'частичная выборка: очередь tee-off из базы');

    var alone = sandbox.pestovoStartHierarchy([{ startHole: 12, startTime: T0, players: { x: {} } }]);
    eq(alone.rows[0].letter, '', 'одна группа на лунке — буквы нет');
    eq(sandbox.pestovoStartGroupTitle(alone.rows[0], { holeLetter: false }), 'Группа 1',
        'без shotgun-схемы подпись — по номеру группы');

    // ── англ. раскладка ──
    eq(sandbox.pestovoWaveLetter(0, 'en'), 'A', 'en: буква волны A');
    eq(sandbox.pestovoWaveLetter(1, 'ru'), 'Б', 'ru: буква волны Б');
    eq(sandbox.pestovoWaveLetter(30, 'ru'), '31', 'после алфавита — номер волны');
    eq(sandbox.pestovoStartGroupTitle(legacy.rows[0], { holeLetter: true, lang: 'en' }), 'Group 1А', 'en: подпись группы из общего слоя');

    /* ==========================================================
       5. ЭКРАНЫ БЕРУТ ФОРМАТ ИЗ ОБЩЕГО СЛОЯ
       ========================================================== */
    var tv = fs.readFileSync(path.join(ROOT, 'tv.html'), 'utf8');
    ok(tv.indexOf('pestovoRoundFormatBadge') !== -1, 'tv.html: формат раунда из общего слоя');
    ok(tv.indexOf('startOrder') !== -1 && tv.indexOf('groupsTotal') !== -1, 'tv.html: показывает очередь tee-off и размер протокола');
    ['js/app.js', 'js/leaderboard.js', 'js/scorer.js', 'js/tn-scorecard.js', 'js/admin.js'].forEach(function (f) {
        var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        ok(src.indexOf('pestovoRoundFormatBadge') !== -1, f + ': форматная линия через общий слой');
    });
    var qs = fs.readFileSync(path.join(ROOT, 'js/qr-start.js'), 'utf8');
    ok(qs.indexOf('pestovoWaveLetter') !== -1, 'qr-start.js: алфавит волн общий с админкой');
    ok(qs.indexOf("saved = parseInt(g.startWave, 10)") !== -1, 'qr-start.js: сохранённая волна важнее пересчёта');
    var sa = fs.readFileSync(path.join(ROOT, 'js/start-admin.js'), 'utf8');
    ok(sa.indexOf('psRenderStartHierarchyHtml') !== -1, 'start-admin.js: предпросмотр иерархии старта в блоке раскладки');

    console.log('');
    if (failures) { console.error('Провалено проверок:', failures, 'из', checks); process.exit(1); }
    console.log('✓ Сценарные тесты: форматы игры и иерархия старта пройдены:', checks);
}).catch(function (err) {
    console.error('Исключение в сценарии:', err && err.stack || err);
    process.exit(1);
});

/* --- открытие сохранённого протокола на правку (настоящий код вкладки) --- */
function openForEdit(pid) {
    sandbox.psState.busy = false;
    sandbox.psState.editingId = null;
    sandbox.psState.editRounds = {};
    sandbox.psState.editDeletedRounds = [];
    sandbox.psSavedCache = null;
    // подписка на список сохранённых протоколов не нужна — читаем документ напрямую
    sandbox.psEditProtocol(pid);
    return flush(14).then(function () {
        var groups = sandbox.psState.groups || [];
        groups.forEach(function (g) { if (g.roundId) ridBeforeGlobal = ridBeforeGlobal || g.roundId; });
        return true;
    });
}
var ridBeforeGlobal = null;

/* --- прогон qr-start.js на песочнице с DOM-стабом, чтобы сверить подписи --- */
function runQrStart(doc) {
    function el(id) {
        return {
            _id: id, _html: '', value: '',
            classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
            set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; }
        };
    }
    var els = {};
    function get(id) { if (!els[id]) els[id] = el(id); return els[id]; }
    var win = { location: { origin: 'https://club.example', href: 'https://club.example/qr-start.html?protocol=' + Object.keys(db._store.protocols)[0], pathname: '/qr-start.html', search: '' }, print: function () {} };
    var sb2 = {
        console: console, Date: Date, Math: Math, JSON: JSON, Promise: Promise, setTimeout: setTimeout, clearTimeout: clearTimeout,
        parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite,
        String: String, Number: Number, Array: Array, Object: Object, Boolean: Boolean, RegExp: RegExp, Error: Error,
        document: {
            getElementById: get, addEventListener: function () {}, querySelector: function () { return null; },
            querySelectorAll: function () { return []; },
            body: { style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } } }
        },
        localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
        sessionStorage: { getItem: function () { return null; }, setItem: function () {} },
        navigator: { language: 'ru', onLine: true, serviceWorker: null },
        matchMedia: function () { return { matches: false, addListener: function () {}, removeListener: function () {}, addEventListener: function () {} }; },
        requestAnimationFrame: function () { return 0; },
        currentLang: 'ru',
        window: win,
        URLSearchParams: function (q) {
            var m = {};
            String(q || '').replace(/^\?/, '').split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) m[kv[0]] = decodeURIComponent(kv[1] || ''); });
            this.get = function (k) { return (k in m) ? m[k] : null; };
        }
    };
    sb2.window.document = sb2.document;
    sb2.globalThis = sb2;
    vm.createContext(sb2);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8'), sb2, { filename: 'js/utils.js' });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/qr-start.js'), 'utf8'), sb2, { filename: 'js/qr-start.js' });

    var groups = doc.groups || {};
    var entries = Object.keys(groups).sort().map(function (k) { return { key: k, g: groups[k] || {} }; });
    sb2.qrSortGroups(entries, doc.scheme);
    return {
        labels: entries.map(function (e, i) { return sb2.qrGroupLabel(e.g, i, entries, doc.scheme); }),
        formats: sb2.qrFormatsLabel(doc)
    };
}
