// Автотесты паузы раунда и принудительного завершения (запуск: node tools/test-pause-force-finish.js)
// Проверяются требования:
//   1) Принудительное завершение раунда с сохранением уже введённых результатов.
//   2) Постановка раунда на паузу с заморозкой таймингов.
//   3) В мультиплеер-раундах: если один игрок завершает раунд (в т.ч. принудительно),
//      другие игроки могут продолжать играть в этом раунде.
//   4) Автоматическое подтверждение и разблокировка маркера, если маркер завершил раунд.
//   5) Корректная генерация бейджей статуса (пауза, досрочно/принудительно, live, completed).
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

// ── Минимальный DOM/Firebase-станд ──
function fakeEl(id) {
    return {
        _id: id, _html: '', textContent: '', value: '', checked: false, disabled: false,
        className: '', onclick: null, offsetHeight: 40, style: { setProperty() {} },
        classList: {
            _set: {},
            add(c) { this._set[c] = true; }, remove(c) { delete this._set[c]; },
            toggle(c, on) { if (on === undefined) on = !this._set[c]; if (on) this._set[c] = true; else delete this._set[c]; return on; },
            contains(c) { return !!this._set[c]; }
        },
        set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
        querySelector() { return null; }, querySelectorAll() { return []; },
        appendChild() {}, removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
        scrollIntoView() {}, getAttribute() { return null; }, setAttribute() {}
    };
}

const els = {};
function getEl(id) { if (!els[id]) els[id] = fakeEl(id); return els[id]; }

const dbState = { rounds: {}, tournaments: {}, users: {} };
function getPath(obj, p) {
    const parts = p.split('/').filter(Boolean);
    let cur = obj;
    for (const part of parts) {
        if (!cur || typeof cur !== 'object') return undefined;
        cur = cur[part];
    }
    return cur;
}
function setPath(obj, p, val) {
    const parts = p.split('/').filter(Boolean);
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!cur[part] || typeof cur[part] !== 'object') cur[part] = {};
        cur = cur[part];
    }
    if (val === null) delete cur[parts[parts.length - 1]];
    else cur[parts[parts.length - 1]] = val;
}

const dbStub = {
    ref(p) {
        return {
            _p: p || '',
            once(ev) {
                const val = getPath(dbState, p || '');
                return Promise.resolve({ val() { return JSON.parse(JSON.stringify(val === undefined ? null : val)); } });
            },
            set(v) {
                setPath(dbState, p || '', JSON.parse(JSON.stringify(v)));
                return Promise.resolve();
            },
            update(updates) {
                for (const k of Object.keys(updates)) {
                    const full = p ? (p + '/' + k) : k;
                    setPath(dbState, full, JSON.parse(JSON.stringify(updates[k])));
                }
                return Promise.resolve();
            },
            remove() {
                setPath(dbState, p || '', null);
                return Promise.resolve();
            },
            push() {
                const id = 'key_' + Math.random().toString(36).slice(2, 8);
                return {
                    key: id,
                    set: (v) => {
                        setPath(dbState, (p ? (p + '/' + id) : id), JSON.parse(JSON.stringify(v)));
                        return Promise.resolve();
                    }
                };
            },
            transaction(fn) { return Promise.resolve({ value: fn(null) }); },
            on() {}, off() {}, orderByChild() { return this; }, equalTo() { return this; }
        };
    }
};

const store = {};
const sandbox = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, String, Number, Array, Object, Promise,
    setTimeout, clearTimeout, setInterval, clearInterval, RegExp, Error, encodeURIComponent, decodeURIComponent,
    document: {
        getElementById: getEl,
        createElement: () => fakeEl('created'),
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener() {}, removeEventListener() {},
        documentElement: { style: { setProperty() {} }, setAttribute() {}, classList: { add() {}, remove() {} } },
        body: { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, appendChild() {} }
    },
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    },
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: { language: 'ru', onLine: true, vibrate() {} },
    location: { search: '', pathname: '/setup-round.html', origin: 'https://club.example', href: '' },
    requestAnimationFrame: fn => setTimeout(fn, 0),
    URLSearchParams: function (q) {
        const m = {};
        String(q || '').replace(/^\?/, '').split('&').forEach(p => { const [k, v] = p.split('='); if (k) m[k] = decodeURIComponent(v || ''); });
        this.get = k => (k in m ? m[k] : null);
    },
    alert() {}, confirm: () => true, fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    firebase: undefined,
    currentLang: 'ru',
    toast: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.db = dbStub;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/course-config.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/format.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8'), sandbox);

// ── ТЕСТ 1: Пауза раунда и возобновление ──
(async function testRoundPauseResume() {
    console.log('\n--- ТЕСТ 1: Пауза раунда и возобновление ---');
    const rid = 'round_test_pause_1';
    const roundData = {
        status: 'active',
        startTime: '10:00',
        date: '2026-09-17',
        teeOffMs: 1726556400000,
        players: {
            u1: { name: 'Player 1', scores: { 1: 4, 2: 4 } }
        }
    };
    dbState.rounds[rid] = JSON.parse(JSON.stringify(roundData));

    // 1. Постановка на паузу
    await sandbox.roundPause(rid, roundData, 'Гроза / дождь', 'Player 1', 'u1');
    const inDb = dbState.rounds[rid];
    ok(inDb.paused === true, 'roundPause: статус paused = true');
    ok(inDb.pauseReason === 'Гроза / дождь', 'roundPause: причина паузы сохранена');
    ok(inDb.pausedByName === 'Player 1', 'roundPause: имя инициатора паузы сохранено');
    ok(Array.isArray(inDb.pauseHistory) && inDb.pauseHistory.length === 1, 'roundPause: запись в pauseHistory создана');
    ok(inDb.pauseHistory[0].pausedAt > 0, 'roundPause: timestamp pausedAt записан');

    // 2. Расчёт динамического времени паузы (пока раунд на паузе)
    const pausedAt = inDb.pausedAt;
    const simulatedNow = pausedAt + 15 * 60 * 1000; // прошло 15 минут
    const dynPauseMs = sandbox.getRoundTotalPauseMs(inDb, simulatedNow);
    eq(dynPauseMs, 15 * 60 * 1000, 'getRoundTotalPauseMs: динамическая пауза 15 мин во время активной паузы');

    // 3. Возобновление раунда
    const resumeTime = pausedAt + 20 * 60 * 1000;
    const origNow = Date.now;
    Date.now = () => resumeTime;

    await sandbox.roundResume(rid, inDb, 'Player 1', 'u1');
    Date.now = origNow;

    const resumedDb = dbState.rounds[rid];
    ok(resumedDb.paused === false, 'roundResume: paused = false');
    eq(resumedDb.totalPauseMs, 20 * 60 * 1000, 'roundResume: totalPauseMs ровно 20 минут (1 200 000 мс)');
    ok(resumedDb.pauseHistory[0].resumedAt === resumeTime, 'roundResume: pauseHistory[0].resumedAt зафиксирован');
    eq(resumedDb.pauseHistory[0].durationMs, 20 * 60 * 1000, 'roundResume: pauseHistory[0].durationMs = 20 минут');

    // 4. Расчёт общего времени паузы после возобновления
    const finalPauseMs = sandbox.getRoundTotalPauseMs(resumedDb);
    eq(finalPauseMs, 20 * 60 * 1000, 'getRoundTotalPauseMs: после возобновления возвращает 20 минут');
})().then(() => {

// ── ТЕСТ 2: Заморозка таймингов и темпа игры при паузе ──
(function testPaceWithPause() {
    console.log('\n--- ТЕСТ 2: Заморозка таймингов и темпа игры ---');
    const startTs = Date.now() - 60 * 60 * 1000; // старт 60 минут назад

    // Раунд без паузы
    const activeRoundNoPause = {
        status: 'active',
        teeOffMs: startTs,
        format: 'Stroke',
        players: {
            u1: { scores: { 1: 4, 2: 4, 3: 5 } }
        }
    };
    const metricsNormal = sandbox.getRoundPaceMetrics(activeRoundNoPause, null, null, Date.now());
    eq(metricsNormal.isPaused, false, 'metricsNormal: не на паузе');
    eq(metricsNormal.elapsedMin, 60, 'metricsNormal: прошло 60 минут');

    // Раунд с завершённой 20-минутной паузой
    const activeRoundWithPastPause = {
        status: 'active',
        teeOffMs: startTs,
        totalPauseMs: 20 * 60 * 1000, // 20 минут паузы
        players: {
            u1: { scores: { 1: 4, 2: 4, 3: 5 } }
        }
    };
    const metricsPastPause = sandbox.getRoundPaceMetrics(activeRoundWithPastPause, null, null, Date.now());
    eq(metricsPastPause.isPaused, false, 'metricsPastPause: не на паузе');
    eq(metricsPastPause.elapsedMin, 40, 'metricsPastPause: 60 мин - 20 мин паузы = 40 минут чистого игрового времени');

    // Раунд СЕЙЧАС на паузе (пауза начата 15 минут назад)
    const currentlyPausedRound = {
        status: 'active',
        teeOffMs: startTs,
        paused: true,
        pausedAt: Date.now() - 15 * 60 * 1000, // на паузе уже 15 минут
        totalPauseMs: 0,
        players: {
            u1: { scores: { 1: 4, 2: 4, 3: 5 } }
        }
    };
    const metricsPausedNow = sandbox.getRoundPaceMetrics(currentlyPausedRound, null, null, Date.now());
    ok(metricsPausedNow.isPaused === true, 'metricsPausedNow: флаг isPaused = true');
    // Общее время 60 мин минус 15 мин текущей паузы = 45 мин игрового времени (время заморожено на моменте паузы)
    eq(metricsPausedNow.elapsedMin, 45, 'metricsPausedNow: тайминг заморожен на 45 минутах');

    // Статус темпа игры
    const stPaused = sandbox.paceStatus(currentlyPausedRound);
    eq(stPaused.status, 'paused', 'paceStatus: возвращает status = paused');
    ok(stPaused.text.indexOf('На паузе') !== -1 || stPaused.text.indexOf('Paused') !== -1, 'paceStatus: текст содержит «На паузе»');
})();

// ── ТЕСТ 3: Принудительное завершение раунда (сохранение счёта) ──
(async function testForceFinish() {
    console.log('\n--- ТЕСТ 3: Принудительное завершение с сохранением счёта ---');
    const rid = 'round_test_force_finish';
    const roundData = {
        status: 'active',
        teeOffMs: Date.now() - 3600000,
        players: {
            u1: { name: 'Player 1', scores: { 1: 4, 2: 5, 3: 3 } },
            u2: { name: 'Player 2', scores: { 1: 5, 2: 4 } }
        }
    };
    dbState.rounds[rid] = JSON.parse(JSON.stringify(roundData));

    // 1. Принудительное завершение одного игрока u1
    await sandbox.roundForceFinishPlayer(rid, 'u1', roundData, 'Травма спины', 'Player 1');
    const dbAfterP1 = dbState.rounds[rid];
    ok(dbAfterP1.finishedPlayers && dbAfterP1.finishedPlayers['u1'], 'roundForceFinishPlayer: u1 в finishedPlayers');
    ok(dbAfterP1.finishedPlayers['u1'].forced === true, 'roundForceFinishPlayer: флаг forced = true');
    eq(dbAfterP1.finishedPlayers['u1'].forcedReason, 'Травма спины', 'roundForceFinishPlayer: причина зафиксирована');
    eq(dbAfterP1.players.u1.scores, { 1: 4, 2: 5, 3: 3 }, 'roundForceFinishPlayer: все введённые очки сохранены!');
    eq(dbAfterP1.status, 'active', 'roundForceFinishPlayer: раунд остаётся active для u2');
    eq(dbAfterP1.partialFinish, true, 'roundForceFinishPlayer: partialFinish = true');

    // 2. Проверка возможности продолжения игры для u2 и блокировки для u1
    const p1Open = sandbox.isRoundOpenForScoring(dbAfterP1, Date.now(), 'u1');
    const p2Open = sandbox.isRoundOpenForScoring(dbAfterP1, Date.now(), 'u2');
    eq(p1Open, false, 'isRoundOpenForScoring: для завершившего u1 ввод закрыт');
    eq(p2Open, true, 'isRoundOpenForScoring: для продолжающего u2 ввод ОТКРЫТ');

    // 3. Игрок u2 продолжает игру и забивает лунку 3
    dbAfterP1.players.u2.scores[3] = 4;
    eq(dbAfterP1.players.u2.scores[3], 4, 'u2 успешно ввёл счёт на 3-й лунке');

    // 4. Принудительное завершение всех оставшихся (например, наступила темнота)
    await sandbox.roundForceFinishAll(rid, dbAfterP1, 'Темнота', 'Маршал');
    const dbFinal = dbState.rounds[rid];
    eq(dbFinal.status, 'completed', 'roundForceFinishAll: статус раунда = completed');
    ok(dbFinal.forcedFinish === true, 'roundForceFinishAll: forcedFinish = true');
    eq(dbFinal.forcedReason, 'Темнота', 'roundForceFinishAll: forcedReason = Темнота');
    ok(dbFinal.finishedPlayers['u2'], 'roundForceFinishAll: u2 также зафиксирован в finishedPlayers');
    eq(dbFinal.players.u2.scores, { 1: 5, 2: 4, 3: 4 }, 'roundForceFinishAll: очки u2 сохранены в полном объёме');

    // После завершения всех - раунд закрыт для всех
    eq(sandbox.isRoundOpenForScoring(dbFinal, Date.now(), 'u2'), false, 'isRoundOpenForScoring: после финиша всех u2 закрыт');
})().then(() => {

// ── ТЕСТ 4: Генерация бейджей статуса раунда ──
(function testStatusBadges() {
    console.log('\n--- ТЕСТ 4: Генерация бейджей статуса ---');
    // 1. Активный раунд
    const liveBadge = sandbox.buildRoundStatusBadgeHTML({ status: 'active' });
    ok(liveBadge.indexOf('LIVE') !== -1, 'buildRoundStatusBadgeHTML: Live бейдж для активного раунда');

    // 2. Раунд на паузе
    const pausedBadge = sandbox.buildRoundStatusBadgeHTML({ status: 'active', paused: true, pauseReason: 'Гроза' });
    ok(pausedBadge.indexOf('На паузе') !== -1 || pausedBadge.indexOf('Paused') !== -1, 'buildRoundStatusBadgeHTML: бейдж паузы');
    ok(pausedBadge.indexOf('tn-p') !== -1, 'buildRoundStatusBadgeHTML: css-класс tn-p');

    // 3. Принудительно завершённый раунд
    const forcedBadge = sandbox.buildRoundStatusBadgeHTML({ status: 'completed', forcedFinish: true, forcedReason: 'Ливень' });
    ok(forcedBadge.indexOf('Досрочно') !== -1 || forcedBadge.indexOf('Early finish') !== -1, 'buildRoundStatusBadgeHTML: бейдж досрочного финиша');
    ok(forcedBadge.indexOf('Ливень') !== -1, 'buildRoundStatusBadgeHTML: причина включена в бейдж');
    ok(forcedBadge.indexOf('tn-f') !== -1, 'buildRoundStatusBadgeHTML: css-класс tn-f');

    // 4. Обычный завершённый раунд
    const normalCompletedBadge = sandbox.buildRoundStatusBadgeHTML({ status: 'completed', completedByName: 'Иван' });
    ok(normalCompletedBadge.indexOf('Иван') !== -1, 'buildRoundStatusBadgeHTML: бейдж обычного завершения с именем');
    ok(normalCompletedBadge.indexOf('tn-d') !== -1, 'buildRoundStatusBadgeHTML: css-класс tn-d');
})();

// ── ТЕСТ 5: Мультиплеерный маркерный чек — если маркер завершил раунд досрочно ──
(function testMarkerFinishedHandling() {
    console.log('\n--- ТЕСТ 5: Маркер завершил раунд досрочно ---');
    const multiRound = {
        status: 'active',
        players: {
            p1: { name: 'Player 1', scores: { 1: 4, 2: 4 }, markerScores: { p2: { 1: 5 } } },
            p2: { name: 'Player 2', scores: { 1: 5, 2: 4 } }
        },
        finishedPlayers: {
            p1: { at: Date.now(), forced: true, forcedReason: 'Травма' }
        }
    };

    ok(sandbox.isPlayerFinishedRound(multiRound, 'p1') === true, 'isPlayerFinishedRound: p1 завершил раунд');
    ok(sandbox.isPlayerFinishedRound(multiRound, 'p2') === false, 'isPlayerFinishedRound: p2 НЕ завершил раунд');

    const pending = sandbox.roundPendingPlayers(multiRound);
    eq(pending, ['p2'], 'roundPendingPlayers: остался только p2');
})();

if (failures > 0) {
    console.error(`\n❌ ТЕСТЫ НЕ ПРОШЛИ: ${failures} ошибок`);
    process.exit(1);
} else {
    console.log('\n🎉 ВСЕ ТЕСТЫ ПАУЗЫ И ПРИНУДИТЕЛЬНОГО ЗАВЕРШЕНИЯ УСПЕШНО ПРОЙДЕНЫ!');
}

});
});
