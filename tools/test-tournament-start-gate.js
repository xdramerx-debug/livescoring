// Автотесты старта турнира и ввода счёта (запуск: node tools/test-tournament-start-gate.js)
// Проверяются реальные функции из js/utils.js, js/start-admin.js и js/live.js:
//   1) раунды, созданные протоколом до старта, не активны и не дают вводить счёт;
//   2) раунд открывается ровно в момент старта (время или кнопка «Старт»);
//   3) защита от «пулемётного» нажатия кнопки ввода счёта (одна запись на tap-серию);
//   4) кнопка называется «Подтвердить»;
//   5) «Завершить раунд» не перебрасывает на лунку, а держит предупреждение.
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

const store = {};
const localStorageStub = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
};

// База: считаем записи update()/set(), чтобы проверить защиту от двойных нажатий.
const dbState = { updateCalls: [], setCalls: [], rounds: {}, tournaments: {} };
function makeRef(p) {
    const ref = {
        _p: p || '',
        update(obj) { dbState.updateCalls.push({ path: ref._p, obj }); return Promise.resolve(); },
        set(val) { dbState.setCalls.push({ path: ref._p, val }); return Promise.resolve(); },
        remove() { return Promise.resolve(); },
        transaction(fn) { return Promise.resolve({ value: fn(null) }); },
        once() {
            if (ref._p === 'rounds') return Promise.resolve({ val: () => dbState.rounds });
            if (/^tournaments\/[^/]+$/.test(ref._p)) {
                const id = ref._p.split('/')[1];
                return Promise.resolve({ val: () => dbState.tournaments[id] || null });
            }
            if (ref._p.indexOf('rounds/') === 0) {
                const id = ref._p.split('/')[1];
                return Promise.resolve({ val: () => dbState.rounds[id] || null });
            }
            return Promise.resolve({ val: () => null });
        },
        on() {}, off() {}, orderByChild() { return ref; }, equalTo() { return ref; }, push() { return Promise.resolve({ key: 'newRound' }); }
    };
    return ref;
}
const dbStub = { ref: p => makeRef(p) };

const rafQueue = [];
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
    localStorage: localStorageStub,
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: { language: 'ru', onLine: true, vibrate() {} },
    location: { search: '', pathname: '/setup-round.html', origin: 'https://club.example', href: '' },
    requestAnimationFrame: fn => { rafQueue.push(fn); return rafQueue.length; },
    URLSearchParams: function (q) {
        const m = {};
        String(q || '').replace(/^\?/, '').split('&').forEach(p => { const [k, v] = p.split('='); if (k) m[k] = decodeURIComponent(v || ''); });
        this.get = k => (k in m ? m[k] : null);
    },
    alert() {}, confirm: () => true, fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    firebase: undefined
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.db = dbStub;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'start-admin.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'live.js'), 'utf8'), sandbox);
function flushRaf() { while (rafQueue.length) rafQueue.shift()(); }

// ══════════════════════════════════════════════════════════
// 1. СТАТУС РАУНДА ДО / ПОСЛЕ СТАРТА ТУРНИРА
// ══════════════════════════════════════════════════════════
const startTs = new Date('2026-09-20T09:00:00').getTime();
const scheduled = { status: 'scheduled', scheduledStart: startTs, tournamentId: 'tn1', mode: 'group', players: {} };
const active = { status: 'active', tournamentId: 'tn1', mode: 'group', players: {} };
const completed = { status: 'completed', tournamentId: 'tn1', mode: 'group', players: {} };
const legacy = { mode: 'group', players: {} };              // старые раунды без статуса

ok(sandbox.isRoundGatedByStart(scheduled, startTs - 60000) === true, 'до старта: раунд закрыт (gated)');
ok(sandbox.isRoundOpenForScoring(scheduled, startTs - 60000) === false, 'до старта: вводить счёт нельзя');
ok(sandbox.isRoundOpenForScoring(scheduled, startTs) === true, 'в момент старта: раунд открыт');
ok(sandbox.isRoundGatedByStart(scheduled, startTs + 1000) === false, 'после старта: уже не gated');
ok(sandbox.isRoundOpenForScoring(active, startTs - 60000) === true, 'активный раунд открыт всегда');
ok(sandbox.isRoundOpenForScoring(completed, startTs + 1000) === false, 'завершённый раунд закрыт');
// Завершённый раунд: тот, кто ещё не сдал карточку, продолжает вводить счёт
// (иначе после первого финишёра группа видела только «режим просмотра»).
const partialRound = {
    status: 'completed', tournamentId: 'tn1', mode: 'group',
    completedBy: 'p1', finishedPlayers: { p1: { at: 1 } },
    players: { p1: { name: 'Игорь' }, p2: { name: 'Пётр' }, p3: { name: 'Семён' } }
};
ok(sandbox.isRoundOpenForScoring(partialRound, startTs + 1000, 'p2') === true,
    'завершённый раунд: не сдавший карточку p2 продолжает ввод');
ok(sandbox.isRoundOpenForScoring(partialRound, startTs + 1000, 'p1') === false,
    'завершённый раунд: сдавший карточку p1 — только просмотр');
ok(sandbox.isRoundOpenForScoring(partialRound, startTs + 1000, 'наблюдатель') === false,
    'завершённый раунд: посторонний — только просмотр');
ok(sandbox.isPlayerFinishedRound(partialRound, 'p1') === true, 'финишёр отмечен в finishedPlayers');
ok(sandbox.isPlayerFinishedRound(partialRound, 'p2') === false, 'не финишировавший не отмечен');
eq(sandbox.roundPendingPlayers(partialRound).sort().join(','), 'p2,p3', 'в раунде ещё двое не сдали карточки');
ok(sandbox.isRoundOpenForScoring(legacy, startTs - 60000) === true, 'раунд без статуса (старые данные) открыт');
ok(sandbox.isRoundOpenForScoring({ status: 'scheduled' }, startTs + 1000) === false, 'scheduled без времени старта не открывается');
eq(sandbox.roundStartCountdownMs(scheduled, startTs - 90000), 90000, 'отсчёт: 90 секунд до старта');
eq(sandbox.roundStartCountdownMs(scheduled, startTs + 5000), 0, 'отсчёт: после старта — 0');
eq(sandbox.roundStartCountdownMs(active, startTs - 5000), 0, 'отсчёт: активный раунд — 0');
eq(sandbox.formatStartCountdown(90000), '01:30', 'формат отсчёта: 90 с → 01:30');
eq(sandbox.formatStartCountdown(3725000), '01:02:05', 'формат отсчёта: 1ч 2м 5с → 01:02:05');
eq(sandbox.formatStartCountdown(-1), '00:00', 'формат отсчёта: отрицательный → 00:00');
eq(sandbox.pestovoStartTsFromParts('2026-09-20', '09:00'), startTs, 'время старта из даты и времени');

// Какие раунды пора открыть
const roundsMap = {
    rDue: { status: 'scheduled', scheduledStart: startTs - 1000, tournamentId: 'tn1' },
    rEarly: { status: 'scheduled', scheduledStart: startTs + 3600000, tournamentId: 'tn1' },
    rActive: { status: 'active', tournamentId: 'tn2' },
    rDone: { status: 'completed', scheduledStart: startTs - 1000, tournamentId: 'tn3' }
};
const due = sandbox.roundsDueForStart(roundsMap, startTs);
eq(due.roundIds, ['rDue'], 'roundsDueForStart: только наступившие scheduled');
eq(due.tournamentIds, ['tn1'], 'roundsDueForStart: турнир наступившего раунда');
eq(sandbox.roundsDueForStart(roundsMap, startTs - 5000).roundIds, [], 'roundsDueForStart: до старта — пусто');

// ══════════════════════════════════════════════════════════
// 2. ПРОТОКОЛ: РАУНДЫ НЕ АКТИВНЫ ДО СТАРТА
// ══════════════════════════════════════════════════════════
sandbox.psState.tournaments = [{ id: 'tnUp', name: 'Кубок', date: '2026-09-20', status: 'upcoming' }];
sandbox.psState.proto = { tournamentId: 'tnUp', date: '2026-09-20', startTime: '09:00', interval: 8, scheme: '1', size: 4 };
eq(sandbox.psRoundStartStatus(sandbox.psState.proto), 'scheduled', 'протокол: турнир не начат → раунды scheduled');

sandbox.psState.tournaments = [{ id: 'tnAct', name: 'Кубок', date: '2026-09-20', status: 'active' }];
sandbox.psState.proto.tournamentId = 'tnAct';
eq(sandbox.psRoundStartStatus(sandbox.psState.proto), 'active', 'протокол: турнир активен → раунды active');

sandbox.psState.tournaments = [{ id: 'tnUp2', name: 'Кубок', date: '2020-01-01', status: 'upcoming' }];
sandbox.psState.proto = { tournamentId: 'tnUp2', date: '2020-01-01', startTime: '09:00', interval: 8, scheme: '1', size: 4 };
eq(sandbox.psRoundStartStatus(sandbox.psState.proto), 'active', 'протокол: время старта прошло → раунды active');

// В исходнике сохранения протокола статус берётся из psRoundStartStatus, а не жёстко 'active'
const startAdmin = fs.readFileSync(path.join(ROOT, 'js', 'start-admin.js'), 'utf8');
ok(startAdmin.indexOf('status: roundStatus,') !== -1, 'start-admin: раунды создаются со статусом roundStatus');
ok(startAdmin.indexOf('scheduledStart: schedStart') !== -1, 'start-admin: у раунда есть scheduledStart');
ok(/if \(roundStatus !== 'active'\) return null;/.test(startAdmin), 'start-admin: турнир не стартует сохранением протокола');

// ══════════════════════════════════════════════════════════
// 3. КНОПКА «ПОДТВЕРДИТЬ»
// ══════════════════════════════════════════════════════════
eq(sandbox.I18N.ru.next_hole_btn, 'Подтвердить ✓', 'i18n ru: кнопка «Подтвердить ✓»');
eq(sandbox.I18N.en.next_hole_btn, 'Confirm ✓', 'i18n en: кнопка «Confirm ✓»');
const setupHtml = fs.readFileSync(path.join(ROOT, 'setup-round.html'), 'utf8');
ok(setupHtml.indexOf('На следующую лунку') === -1, 'setup-round: старой подписи кнопки нет');
ok(setupHtml.indexOf('id="round-start-gate"') !== -1, 'setup-round: есть блок отсчёта до старта');
ok(setupHtml.indexOf('id="finish-block-notice"') !== -1, 'setup-round: есть блок предупреждения о незавершённых лунках');

// ══════════════════════════════════════════════════════════
// 4. ЗАЩИТА ОТ БЫСТРЫХ НАЖАТИЙ «ПОДТВЕРДИТЬ»
// ══════════════════════════════════════════════════════════
function mkRound() {
    return {
        mode: 'group', status: 'active', startHole: 1, holeRange: '1-18', tee: 'wh', format: 'Stroke Play',
        players: {
            me: { name: 'Иван Тестов', tee: 'wh', exactHcp: 10, fieldHcp: 11, scores: {}, submitted: {}, verified: {}, markerScores: {}, markerSubmitted: {} },
            op: { name: 'Пётр Маркеров', tee: 'wh', exactHcp: 12, fieldHcp: 13, scores: {}, submitted: {}, verified: {}, markerScores: {}, markerSubmitted: {} }
        },
        markerAssignments: { me: { targetId: 'op', targetName: 'Пётр Маркеров' } },
        participantsList: ['me', 'op']
    };
}
sandbox.curRid = 'R1';
sandbox.curRoundData = mkRound();
sandbox.myUid = 'me';
sandbox.myTargetUid = 'op';
sandbox.canEditGroup = true;
sandbox.playHole = 1;
sandbox.playHoleRoundId = 'R1';
sandbox.myScore = 4;
sandbox.targetScore = 4;
sandbox.isChanging = false;
sandbox.saveHoleInFlight = false;

dbState.updateCalls = [];
// Пять быстрых нажатий подряд (до разрешения промиса записи)
sandbox.saveHoleScores();
sandbox.saveHoleScores();
sandbox.saveHoleScores();
sandbox.saveHoleScores();
sandbox.saveHoleScores();
eq(dbState.updateCalls.length, 1, 'быстрые нажатия: запись в базу одна');
ok(sandbox.saveHoleInFlight === true, 'быстрые нажатия: флаг занятости установлен');
ok(getEl('save-hole-btn').disabled === true, 'быстрые нажатия: кнопка заблокирована на время записи');
ok(sandbox.saveHoleScores() === undefined && dbState.updateCalls.length === 1, 'быстрые нажатия: повторный вызов ничего не пишет');

// После разрешения записи блокировка снимается и лунка переходит дальше
setTimeout(function () {
    ok(sandbox.saveHoleInFlight === false, 'после записи: блокировка снята');
    ok(getEl('save-hole-btn').disabled === false, 'после записи: кнопка снова доступна');
    eq(sandbox.playHole, 2, 'после подтверждения: перешли на следующую лунку');

    // Кнопка называется «Подтвердить»
    sandbox.renderPlayHole();
    ok(getEl('save-hole-btn-text').textContent.indexOf('Подтвердить') !== -1, 'кнопка раунда: «Подтвердить ✓»');

    // ══════════════════════════════════════════════════════
    // 5. ОБНОВЛЕНИЯ БАЗЫ НЕ КИДАЮТ ИГРОКА НА ПЕРВУЮ ЛУНКУ
    // ══════════════════════════════════════════════════════
    sandbox.playHole = 7;
    sandbox.findCurrentHole();
    eq(sandbox.playHole, 7, 'findCurrentHole: не сбрасывает игрока на лунку 1 при каждом снимке');
    // Смена раунда (playHoleRoundId сброшен) — лунка пересчитывается заново
    sandbox.playHoleRoundId = null;
    sandbox.playHole = 99;                                  // «чужая» лунка, её нет в порядке раунда
    sandbox.findCurrentHole();
    ok(sandbox.getRoundOrder(sandbox.curRoundData).indexOf(sandbox.playHole) !== -1,
        'findCurrentHole: при смене раунда лунка пересчитывается на валидную');

    // ══════════════════════════════════════════════════════
    // 6. «ЗАВЕРШИТЬ РАУД»: ПРЕДУПРЕЖДЕНИЕ БЕЗ ПЕРЕХОДА НА ЛУНКУ
    // ══════════════════════════════════════════════════════
    // Маркер не ввёл счёт на лунках 1 и 18 → раунд нельзя завершить.
    const order = sandbox.getRoundOrder(sandbox.curRoundData);
    const me = sandbox.curRoundData.players.me;
    order.forEach(function (h) {
        if (h === 1 || h === 18) return;                 // эти лунки маркер не подтвердил
        me.scores[h] = 4;
        me.submitted[h] = true;
        me.verified[h] = true;
        me.markerScores.me = me.markerScores.me || {};
        me.markerScores['op'] = me.markerScores['op'] || {};
        me.markerScores['op'][h] = 4;
    });
    me.markedBy = 'op';
    sandbox.playHole = 18;
    sandbox.playHoleRoundId = 'R1';
    sandbox.groupFinishing = false;
    sandbox.finishBlockShown = false;

    let jumpedTo = null;
    sandbox.goPlayHole = function (h) { jumpedTo = h; };   // ловим любой автопереход

    sandbox.finishGroupRound();
    eq(jumpedTo, null, 'завершение раунда: на проблемную лунку НЕ перебрасывает');
    ok(sandbox.finishBlockShown === true, 'завершение раунда: предупреждение включено');
    const noticeHtml = getEl('finish-block-notice').innerHTML;
    ok(noticeHtml.indexOf('Лунка 1') !== -1, 'предупреждение: перечислена лунка 1');
    ok(noticeHtml.indexOf('Лунка 18') !== -1, 'предупреждение: перечислена лунка 18');
    ok(getEl('finish-block-notice').classList.contains('hidden') === false, 'предупреждение: блок виден');
    ok(sandbox.curRoundData.status !== 'completed', 'предупреждение: раунд не завершён');

    // Предупреждение «горит» при следующих обновлениях, пока не исправлено
    sandbox.renderFinishBlockNotice();
    ok(getEl('finish-block-notice').innerHTML.indexOf('Лунка 1') !== -1, 'предупреждение горит при повторной перерисовке');

    // Как только маркер подтвердил обе лунки — предупреждение гаснет
    [1, 18].forEach(function (h) {
        me.scores[h] = 4;
        me.submitted[h] = true;
        me.verified[h] = true;
        me.markerScores['op'][h] = 4;
        me.markerSubmitted = me.markerSubmitted || {};
        me.markerSubmitted['op'] = me.markerSubmitted['op'] || {};
        me.markerSubmitted['op'][h] = true;
    });
    sandbox.renderFinishBlockNotice();
    ok(sandbox.finishBlockShown === false, 'после исправления: предупреждение снято');
    ok(getEl('finish-block-notice').classList.contains('hidden') === true, 'после исправления: блок скрыт');

    // ══════════════════════════════════════════════════════
    // 7. ОТСЧЁТ ДО СТАРТА НА СТРАНИЦЕ ИГРОКА
    // ══════════════════════════════════════════════════════
    sandbox.curRoundData = Object.assign(mkRound(), { status: 'scheduled', scheduledStart: Date.now() + 65000 });
    sandbox.canEditGroup = false;
    sandbox.renderStartGate();
    const gate = getEl('round-start-gate');
    ok(gate.classList.contains('hidden') === false, 'отсчёт: блок виден до старта');
    ok(getEl('round-start-countdown').textContent === '01:05', 'отсчёт: показывает 01:05');
    ok(sandbox.startGateTimer !== null, 'отсчёт: таймер запущен');

    // Старт наступил — блок прячется, раунд открывается
    sandbox.curRoundData = Object.assign(mkRound(), { status: 'scheduled', scheduledStart: Date.now() - 1000 });
    sandbox.myUid = 'me';
    sandbox.renderStartGate();
    ok(gate.classList.contains('hidden') === true, 'отсчёт: после старта блок скрыт');
    ok(sandbox.isRoundOpenForScoring(sandbox.curRoundData, Date.now()) === true, 'отсчёт: раунд открыт для ввода счёта');

    console.log(failures ? '\n' + failures + ' проверок провалено ✘' : '\nВсе проверки старта турнира пройдены ✔');
    process.exit(failures ? 1 : 0);
}, 60);
