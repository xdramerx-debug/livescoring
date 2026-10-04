// Автотест принудительного старта турнира (запуск: node tools/test-tournament-force-start.js)
// ---------------------------------------------------------------------------
// Сценарий из практики клуба: организатор нажимает «Старт» в менеджере
// турниров РАНЬШЕ запланированного времени (старт перенесли, shotgun,
// задержка из-за погоды). Игроки сканируют QR со счётной карточки и должны
// сразу попасть в ввод счёта.
//
// Раньше кнопка «Старт» переводила в active только саму запись турнира,
// а раунды групп оставались в статусе 'scheduled' со своим scheduledStart
// в будущем — страница игрока считала их «ещё не стартовавшими» и
// показывала «Турнир ещё не начался» до наступления планового времени.
//
// Проверяем на реальных модулях (js/utils.js + js/tn-mgr-core.js +
// js/tn-mgr-data.js), что принудительный старт:
//   1) открывает ВСЕ запланированные раунды турнира (status='active');
//   2) после этого раунд не «заперт» стартом (isRoundGatedByStart=false)
//      и открыт для ввода счёта (isRoundOpenForScoring=true);
//   3) не трогает чужие турниры и уже завершённые раунды.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function ok(cond, label) {
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function eq(actual, expected, label) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e); }
    else console.log('ok  -', label);
}

// ── In-memory Firebase: считаем все записи, чтобы проверить адреса ──
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
            style: {},
            dataset: {},
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
load('js/utils.js');          // isRoundGatedByStart / isRoundOpenForScoring / ROUND_STATUS_SCHEDULED
load('js/tn-mgr-core.js');
load('js/tn-mgr-data.js');

const Data = sandbox.TnMgrData;
ok(!!Data && typeof Data.startTournament === 'function', 'TnMgrData.startTournament доступен');

// «Сейчас» фиксируем, чтобы тест не зависел от системной даты.
const NOW = new Date('2026-09-01T12:00:00').getTime();
const RealDateNow = Date.now;
Date.now = function () { return NOW; };
const FUTURE = NOW + 90 * 60 * 1000;   // плановый старт — через полтора часа

// ── Данные: турнир с двумя запланированными раундами групп ──
dbState.data = {
    tournaments: {
        tnA: { name: 'Кубок клуба', status: 'upcoming', lifecycleStatus: 'registration', startDate: '2026-09-01', startTime: '13:30' },
        tnB: { name: 'Чужой турнир', status: 'upcoming', lifecycleStatus: 'registration' },
        tnC: { name: 'Турнир без раундов', status: 'upcoming', lifecycleStatus: 'registration' }
    },
    rounds: {
        grpA1: { status: 'scheduled', scheduledStart: FUTURE, startTime: FUTURE, tournamentId: 'tnA', mode: 'group', players: { p1: { name: 'Игрок 1' } } },
        grpA2: { status: 'scheduled', scheduledStart: FUTURE, startTime: FUTURE, tournamentId: 'tnA', mode: 'group', players: { p2: { name: 'Игрок 2' } } },
        grpDone: { status: 'completed', tournamentId: 'tnA', mode: 'group', players: { p3: { name: 'Игрок 3' } } },
        grpB1: { status: 'scheduled', scheduledStart: FUTURE, startTime: FUTURE, tournamentId: 'tnB', mode: 'group', players: { p4: { name: 'Игрок 4' } } }
    }
};

// ══════════════════════════════════════════════════════════
// 1. ДО СТАРТА: раунд «заперт», ввода счёта нет
// ══════════════════════════════════════════════════════════
const before = dbGet('rounds/grpA1');
ok(sandbox.isRoundGatedByStart(before, NOW) === true, 'до старта: раунд заперт (isRoundGatedByStart)');
ok(sandbox.isRoundOpenForScoring(before, NOW, 'p1') === false, 'до старта: ввод счёта закрыт');

// ══════════════════════════════════════════════════════════
// 2. ПРИНУДИТЕЛЬНЫЙ СТАРТ КНОПКОЙ «СТАРТ»
// ══════════════════════════════════════════════════════════
Promise.resolve()
    .then(function () { return Data.startTournament('tnA'); })
    .then(function () {
        console.log('\n--- После «Старт» ---');
        const tn = dbGet('tournaments/tnA') || {};
        eq(tn.status, 'active', 'турнир переведён в status=active');
        eq(tn.lifecycleStatus, 'active', 'турнир переведён в lifecycleStatus=active');
        ok(Number(tn.startedAt) === NOW, 'проставлен startedAt', tn.startedAt);

        const r1 = dbGet('rounds/grpA1') || {};
        const r2 = dbGet('rounds/grpA2') || {};
        eq(r1.status, 'active', 'раунд группы 1 открыт принудительным стартом (status=active)');
        eq(r2.status, 'active', 'раунд группы 2 открыт принудительным стартом (status=active)');
        ok(Number(r1.activatedAt) === NOW, 'у раунда проставлен activatedAt', r1.activatedAt);
        // Игрок, отсканировавший QR: страница не должна показывать «Турнир ещё не начался».
        ok(sandbox.isRoundGatedByStart(r1, NOW) === false, 'после старта: раунд НЕ заперт (нет «Турнир ещё не начался»)');
        ok(sandbox.isRoundOpenForScoring(r1, NOW, 'p1') === true, 'после старта: ввод счёта открыт игроку');
        ok(sandbox.isRoundOpenForScoring(r2, NOW, 'p2') === true, 'после старта: ввод счёта открыт второму игроку');
        eq(sandbox.roundStartCountdownMs(r1, NOW), 0, 'после старта: отсчёт до старта = 0');

        // Побочных эффектов быть не должно.
        eq((dbGet('rounds/grpDone') || {}).status, 'completed', 'завершённый раунд не переоткрылся');
        eq((dbGet('rounds/grpB1') || {}).status, 'scheduled', 'раунд ЧУЖОГО турнира не открылся');
        eq((dbGet('tournaments/tnB') || {}).status, 'upcoming', 'чужой турнир не стартовал');
        // Игроки раунда не затираются принудительным стартом.
        ok(!!(dbGet('rounds/grpA1/players/p1') || {}).name, 'состав раунда сохранён');

        console.log('\n--- Старт второго турнира и турнира без раундов ---');
        return Data.startTournament('tnB');
    })
    .then(function () {
        eq((dbGet('tournaments/tnB') || {}).status, 'active', 'второй турнир тоже стартует кнопкой');
        eq((dbGet('rounds/grpB1') || {}).status, 'active', 'запланированный раунд второго турнира открылся');
        // Турнир без единого раунда: старт не должен падать.
        return Data.startTournament('tnC');
    })
    .then(function () {
        eq((dbGet('tournaments/tnC') || {}).status, 'active', 'старт турнира без раундов проходит без ошибок');

        // ══════════════════════════════════════════════════════════
        // 3. ПРАВКА СТАРТОВОГО ЛИСТА ПОСЛЕ СТАРТА
        //    (добавили игрока / перегенерировали лист начатого турнира —
        //     новый раунд не должен снова уезжать в 'scheduled')
        // ══════════════════════════════════════════════════════════
        console.log('\n--- Лист уже начатого турнира ---');
        var started = {
            id: 'tnD', name: 'Начатый турнир', status: 'active', lifecycleStatus: 'active',
            startedAt: NOW, startDate: '2026-09-01', startTime: '13:30',
            rounds: { rd1: { id: 'rd1', date: '2026-09-01', startTime: '13:30' } },
            players: {
                pA: { id: 'pA', fio: 'Иванов Иван', hi: 12.4, gender: 'men', tee: 'wh' },
                pB: { id: 'pB', fio: 'Петров Пётр', hi: 20.1, gender: 'men', tee: 'wh' }
            },
            groups: {}
        };
        dbSet('tournaments/tnD', started);
        return Data.generateSheet('tnD', 'rd1', { groupSize: 2, firstTeeTime: '13:30' }, started)
            .then(function () { return started; });
    })
    .then(function () {
        var gid = dbGet('tournaments/tnD/rounds/rd1/groupRoundId');
        ok(!!gid, 'создан раунд группы для начатого турнира', gid);
        var round = dbGet('rounds/' + gid) || {};
        eq(round.status, 'active', 'новый раунд начатого турнира сразу игровой (не scheduled)');
        ok(sandbox.isRoundGatedByStart(round, NOW) === false, 'новый раунд не заперт стартом');
        ok(sandbox.isRoundOpenForScoring(round, NOW, 'pA') === true, 'ввод счёта открыт сразу после генерации листа');

        // Турнир ещё НЕ начинался — раунд остаётся запланированным.
        var planned = {
            id: 'tnE', name: 'Будущий турнир', status: 'upcoming', lifecycleStatus: 'registration',
            startDate: '2026-09-01', startTime: '13:30',
            rounds: { rd1: { id: 'rd1', date: '2026-09-01', startTime: '13:30' } },
            players: {
                pC: { id: 'pC', fio: 'Сидоров Пётр', hi: 15.0, gender: 'men', tee: 'wh' },
                pD: { id: 'pD', fio: 'Орлов Оleg', hi: 22.0, gender: 'men', tee: 'wh' }
            },
            groups: {}
        };
        dbSet('tournaments/tnE', planned);
        return Data.generateSheet('tnE', 'rd1', { groupSize: 2, firstTeeTime: '13:30' }, planned)
            .then(function () {
                var plannedGid = dbGet('tournaments/tnE/rounds/rd1/groupRoundId');
                var plannedRound = dbGet('rounds/' + plannedGid) || {};
                eq(plannedRound.status, 'scheduled', 'раунд ещё не начатого турнира остаётся запланированным');
                ok(sandbox.isRoundGatedByStart(plannedRound, NOW) === true, 'до планового старта раунд заперт (отсчёт)');
            });
    })
    .then(function () {
        Date.now = RealDateNow;
        if (failures) { console.error('\nFAILED: ' + failures); process.exit(1); }
        console.log('\nВсе проверки принудительного старта пройдены');
    })
    .catch(function (err) {
        Date.now = RealDateNow;
        console.error('FAIL — исключение', err && err.stack || err);
        process.exit(1);
    });
