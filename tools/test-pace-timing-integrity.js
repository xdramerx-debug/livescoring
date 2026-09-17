// Автотесты таймингов, пауз и «текущей лунки» (запуск: node tools/test-pace-timing-integrity.js)
// Проверяются исправления версии 1.71.0:
//   1) Битые данные паузы (pausedAt в секундах, отрицательный timestamp,
//      «будущее», задвоенное возобновление) не могут превратить темп игры в
//      абсурдное «запас 2193923839 минут».
//   2) Во время паузы темп заморожен: дельта не растёт, пока раунд стоит,
//      а дедлайн лунки продлевается только теми паузами, которые закончились
//      до этого дедлайна.
//   3) Игрок, завершивший раунд (обычно или досрочно), больше нигде не
//      числится «на лунке» — в том числе в блоке «Сейчас на поле», когда его
//      партнёр ещё играет.
//   4) Темп группы не зависает на лунке сдавшего игрока; принудительное
//      завершение одного игрока не закрывает весь раунд.
//   5) Возобновление «вслепую» (без данных раунда) не затирает учёт пауз.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0, checks = 0;
function ok(cond, label) {
    checks++;
    if (!cond) { failures++; console.error(' ✗', label); }
    else console.log(' ok   |', label);
}
function eq(actual, expected, label) {
    checks++;
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error(' ✗', label, '\n     actual:  ', a, '\n     expected:', e); }
    else console.log(' ok   |', label);
}

// ── Минимальный DOM/Firebase-станд (как в test-pause-force-finish.js) ──
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

const dbState = { rounds: {}, tournaments: {}, users: {}, settings: {} };
function getPath(obj, p) {
    const parts = p.split('/').filter(Boolean);
    let cur = obj;
    for (const part of parts) { if (!cur || typeof cur !== 'object') return undefined; cur = cur[part]; }
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
            once() { return Promise.resolve({ val() { const v = getPath(dbState, p || ''); return v === undefined ? null : JSON.parse(JSON.stringify(v)); } }); },
            set(v) { setPath(dbState, p || '', JSON.parse(JSON.stringify(v))); return Promise.resolve(); },
            update(updates) { for (const k of Object.keys(updates)) setPath(dbState, (p ? (p + '/' + k) : k), JSON.parse(JSON.stringify(updates[k]))); return Promise.resolve(); },
            remove() { setPath(dbState, p || '', null); return Promise.resolve(); },
            push() {
                const id = 'key_' + Math.random().toString(36).slice(2, 8);
                return { key: id, set: (v) => { setPath(dbState, (p ? (p + '/' + id) : id), JSON.parse(JSON.stringify(v))); return Promise.resolve(); } };
            },
            transaction(fn) { return Promise.resolve({ value: fn(getPath(dbState, p || '')), committed: true, snapshot: { val: () => null } }); },
            on(ev, cb) { if (ev === 'value' && cb) cb({ val: function () { return getPath(dbState, p || '') || null; } }); },
            off() {}, orderByChild() { return this; }, equalTo() { return this; }
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
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: { language: 'ru', onLine: true, vibrate() {} },
    location: { search: '', pathname: '/setup-round.html', origin: 'https://club.example', href: '' },
    requestAnimationFrame: fn => setTimeout(fn, 0),
    URLSearchParams: function (q) {
        const m = {};
        String(q || '').replace(/^\?/, '').split('&').forEach(pp => { const [k, v] = pp.split('='); if (k) m[k] = decodeURIComponent(v || ''); });
        this.get = k => (k in m ? m[k] : null);
    },
    alert() {}, confirm: () => true, fetch: () => Promise.resolve({ json: () => Promise.resolve({}) }),
    firebase: undefined, currentLang: 'ru', toast: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.db = dbStub;
sandbox.currentUser = null;
sandbox.currentUserData = null;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8'), sandbox, { filename: 'js/utils.js' });

const M = 60000;
const NOW = Date.now();
const MINUTE = M;

function baseRound(over) {
    return Object.assign({
        mode: 'solo', status: 'active', startHole: 1, holeRange: '1-18',
        startTime: NOW - 3 * MINUTE,
        players: { u1: { name: 'Кузнецов Денис', fieldHcp: 12, exactHcp: 12.4, scores: { 1: 4 } } }
    }, over || {});
}
const MAX_PACE = sandbox.MAX_PACE_MINUTES;

console.log('\n--- ТЕСТ 1: Битые данные паузы не рождают «запас в тысячи лет» ---');
[
    ['pausedAt в секундах', { paused: true, pausedAt: Math.floor((NOW - MINUTE) / 1000) }],
    ['pausedAt отрицательный (сбойные часы)', { paused: true, pausedAt: -129877000000000 }],
    ['pausedAt в будущем', { paused: true, pausedAt: NOW + 365 * 24 * 3600 * 1000 }],
    ['pausedAt — строка даты', { paused: true, pausedAt: new Date(NOW - MINUTE).toISOString() }],
    ['totalPausedMs = 9.9e17', { totalPausedMs: 9.9e17 }],
    ['пауза «из 2001 года»', { paused: false, pauseHistory: [{ pausedAt: 978307200000, resumedAt: 1789000000000 }] }]
].forEach(function (pair) {
    const label = pair[0], round = baseRound(pair[1]);
    const pause = sandbox.getRoundTotalPauseMs(round, NOW);
    const eff = sandbox.roundEffectiveStartTime(round, NOW);
    const m = sandbox.getRoundPaceMetrics(round, NOW);
    ok(pause <= 3 * MINUTE, label + ': пауза не больше времени жизни раунда (' + pause + ' мс)');
    ok(eff <= NOW + 1000, label + ': эффективный старт не в будущем');
    ok(m.overallDelay === null || Math.abs(m.overallDelay) <= MAX_PACE, label + ': дельта темпа в разумных границах (' + m.overallDelay + ')');
    const notice = String(sandbox.buildTimingNotice(round.startTime, round.startHole, m.currentHole, round));
    ok(!/\d{6,}/.test(notice.replace(/<[^>]+>/g, ' ')), label + ': в баннере нет шестизначных чисел');
});
ok(sandbox.formatPaceDelta(-2193923839) === 'нет данных', 'formatPaceDelta: абсурдное значение → «нет данных»');
ok(sandbox.formatPaceMinutes(496622 * 60) === '—', 'formatPaceMinutes: абсурдная длительность → «—»');
eq(sandbox.paceStatus({ overallDelay: 1e9 }).status, 'pending', 'paceStatus: недостоверные данные → «появится позже»');

console.log('\n--- ТЕСТ 2: Корректный учёт паузы ---');
// 2.1 Старт 60 минут назад, пауза 20 минут завершена → чистого времени 40 минут
const pastPause = baseRound({ startTime: NOW - 60 * MINUTE, totalPausedMs: 20 * MINUTE, totalPauseMs: 20 * MINUTE });
eq(sandbox.getRoundTotalPauseMs(pastPause, NOW), 20 * MINUTE, 'пауза 20 минут учтена');
eq(sandbox.getRoundPaceMetrics(pastPause, NOW).elapsedMin, 40, 'elapsed: 60 − 20 = 40 минут игры');

// 2.2 Во время паузы темп заморожен: через 10 минут «сейчас» дельта та же
const frozen = baseRound({ startTime: NOW - 60 * MINUTE, paused: true, pausedAt: NOW - 5 * MINUTE, pauseReason: 'Гроза' });
const d1 = sandbox.getRoundPaceMetrics(frozen, NOW).overallDelay;
const d2 = sandbox.getRoundPaceMetrics(frozen, NOW + 10 * MINUTE).overallDelay;
eq(Math.round(d1 * 100) / 100, Math.round(d2 * 100) / 100, 'на паузе дельта темпа не растёт со временем');
eq(sandbox.getRoundPaceMetrics(frozen, NOW + 10 * MINUTE).elapsedMin, sandbox.getRoundPaceMetrics(frozen, NOW).elapsedMin, 'на паузе игровое время стоит');

// 2.3 Пауза внутри лунки не записывается в её длительность
const midHole = baseRound({
    startTime: NOW - 60 * MINUTE,
    pauseHistory: [{ pausedAt: NOW - 40 * MINUTE, resumedAt: NOW - 25 * MINUTE }],
    totalPausedMs: 15 * MINUTE, totalPauseMs: 15 * MINUTE,
    players: { u1: { name: 'Кузнецов Денис', fieldHcp: 12, scores: { 1: 4, 2: 4 }, holeTimes: { 1: NOW - 45 * MINUTE, 2: NOW - 20 * MINUTE } } }
});
const midM = sandbox.getRoundPaceMetrics(midHole, NOW);
const hole2 = midM.timeline.filter(i => i.hole === 2)[0];
ok(hole2 && Math.abs(hole2.durationMin - 10) < 0.001, 'лунка 2: 25 минут прошло, 15 из них — пауза → в темпе 10 минут (получено ' + (hole2 && hole2.durationMin) + ')');

// 2.4 Дедлайн продлевается только паузой, закончившейся ДО него
const dlNoPause = sandbox.roundHoleDeadlineTs({ startTime: NOW - 60 * MINUTE, startHole: 1 }, 2, NOW);
const dlBefore = sandbox.roundHoleDeadlineTs({
    startTime: NOW - 60 * MINUTE, startHole: 1, totalPausedMs: 4 * MINUTE,
    pauseHistory: [{ pausedAt: NOW - 59 * MINUTE, resumedAt: NOW - 55 * MINUTE }]
}, 2, NOW);
const dlAfter = sandbox.roundHoleDeadlineTs({
    startTime: NOW - 60 * MINUTE, startHole: 1, totalPausedMs: 4 * MINUTE,
    pauseHistory: [{ pausedAt: NOW - 10 * MINUTE, resumedAt: NOW - 6 * MINUTE }]
}, 2, NOW);
eq(dlBefore - dlNoPause, 4 * MINUTE, 'пауза ДО дедлайна лунки 2 продлевает его на 4 минуты');
eq(dlAfter, dlNoPause, 'пауза ПОСЛЕ дедлайна лунки 2 его не продлевает');

// 2.5 «09:00» вместо timestamp и старт в секундах
function localDateStr(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
const today = localDateStr(NOW - 30 * MINUTE);
eq(sandbox.roundRawStartTs({ date: today, startTime: '09:00' }), sandbox.pestovoStartTsFromParts(today, '09:00'),
    'турнирный старт «HH:MM» + дата → нормальный timestamp');
ok(sandbox.roundRawStartTs({ date: today, startTime: '09:00' }) > 0, 'такой старт не отбрасывается как мусор');
ok(sandbox.roundRawStartTs({ teeOffMs: NOW + 30 * 24 * 3600 * 1000 }) === 0, 'старт на месяц вперёд → недостоверно (0)');
eq(sandbox.fmtTime('07:25'), '07:25', 'fmtTime: «07:25» выводится как время, а не NaN:NaN');
eq(sandbox.fmtTime(Math.floor(NOW / 1000)), sandbox.fmtTime(NOW), 'fmtTime: секунды и миллисекунды дают одно время');
eq(sandbox.fmtTime('мусор'), '—', 'fmtTime: мусор → «—»');

console.log('\n--- ТЕСТ 3: Пауза/возобновление — идемпотентность и учёт ---');
(async function () {
    const rid = 'round_pace_1';
    dbState.rounds[rid] = baseRound({ teeOffMs: NOW - 30 * MINUTE });
    // 3.1 Пауза
    await sandbox.roundPause(rid, null, 'Гроза', 'Админ', 'admin');
    let db = dbState.rounds[rid];
    ok(db.paused === true && db.pausedAt > 0, 'roundPause без данных раунда всё равно ставит паузу');
    const firstPausedAt = db.pausedAt;
    // 3.2 Повторная пауза не передвигает точку заморозки
    await sandbox.roundPause(rid, db, 'Гроза, повтор', 'Админ', 'admin');
    db = dbState.rounds[rid];
    eq(db.pausedAt, firstPausedAt, 'повторная пауза НЕ передвигает pausedAt (время паузы не обнуляется)');
    eq(db.pauseHistory.length, 1, 'повторная пауза не создаёт дубль в истории');
    // 3.3 Возобновление вслепую (roundData = null) сохраняет накопленное время
    dbState.rounds[rid].pausedAt = NOW - 3 * MINUTE;   // «пауза» длилась 3 минуты
    await sandbox.roundResume(rid, null, 'Админ', 'admin');
    db = dbState.rounds[rid];
    ok(db.paused === false, 'roundResume: paused = false');
    ok(db.totalPausedMs > 160 * 1000 && db.totalPausedMs < 200 * 1000, 'roundResume: длительность паузы посчитана честно (' + db.totalPausedMs + ' мс ≈ 3 мин)');
    ok(db.pauseHistory && db.pauseHistory.length === 1 && db.pauseHistory[0].resumedAt > 0, 'roundResume: пауза закрыта в истории');
    // 3.4 Возобновление уже возобновлённого раунда не затирает учёт
    const keep = db.totalPausedMs;
    await sandbox.roundResume(rid, null, 'Админ', 'admin');
    eq(dbState.rounds[rid].totalPausedMs, keep, 'лишнее возобновление не обнуляет totalPausedMs');
    // 3.5 Принудительное завершение одного игрока — раунд живёт дальше
    const rid2 = 'round_pace_2';
    dbState.rounds[rid2] = {
        mode: 'group', status: 'active', startHole: 1, startTime: NOW - 40 * MINUTE,
        players: {
            u1: { name: 'Кузнецов Денис', fieldHcp: 12, scores: { 1: 4, 2: 4, 3: 5 } },
            u2: { name: 'Соколов Артём', fieldHcp: 8, scores: { 1: 4, 2: 4, 3: 4, 4: 5, 5: 4 } }
        }
    };
    // как это делает админка: только id раунда и id игрока
    const res = await sandbox.roundForceFinishPlayer(rid2, 'u1', null, 'Травма', 'Администратор');
    db = dbState.rounds[rid2];
    eq(db.status, 'active', 'завершение одного игрока оставляет раунд active (утилита дочитала состав)');
    ok(db.finishedPlayers && db.finishedPlayers.u1 && db.finishedPlayers.u1.forced === true, 'запись о досрочном завершении создана');
    eq(db.finishedPlayers.u1.holesPlayed, 3, 'в записи сыгранное количество лунок — из данных базы (3), а не 0');
    eq(res.remaining, 1, 'остался 1 играющий игрок');

    console.log('\n--- ТЕСТ 4: «Сейчас на поле» и текущая лунка ---');
    const stripRound = dbState.rounds[rid2];
    const order = sandbox.getRoundOrder(stripRound);
    ok(sandbox.isPlayerRoundClosed(stripRound, 'u1', sandbox.calcRoundStats(stripRound.players.u1.scores, 12, 0, order), order) === true, 'u1: раунд завершён');
    ok(sandbox.isPlayerRoundClosed(stripRound, 'u2', sandbox.calcRoundStats(stripRound.players.u2.scores, 8, 0, order), order) === false, 'u2: ещё в игре');
    eq(sandbox.playerCurrentHole(stripRound, 'u1', stripRound.players.u1, sandbox.calcRoundStats(stripRound.players.u1.scores, 12, 0, order), order), null, 'u1: текущей лунки нет (он завершил)');
    eq(sandbox.playerCurrentHole(stripRound, 'u2', stripRound.players.u2, sandbox.calcRoundStats(stripRound.players.u2.scores, 8, 0, order), order), 6, 'u2: текущая лунка 6');
    eq(sandbox.roundActiveHoles(stripRound), [6], 'на поле для подсветки — только лунка 6');
    const statusText = sandbox.playerHoleStatusText(stripRound, 'u1', stripRound.players.u1, sandbox.calcRoundStats(stripRound.players.u1.scores, 12, 0, order), order);
    ok(/досрочно/i.test(statusText), 'подпись u1: «Завершил досрочно · Травма» (получено: ' + statusText + ')');

    // Карта поля на главной: завершивший не учитывается
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'), sandbox, { filename: 'js/app.js' });
    sandbox.renderCourseHolesStrip([[rid2, stripRound]]);
    const stripHtml = getEl('course-holes-strip').innerHTML;
    const totalMatch = /chs-total-val">(\d+)</.exec(stripHtml);
    eq(totalMatch && totalMatch[1], '1', '«Всего игроков на поле»: 1 (сдавший карточку не считается)');
    const busyHoles = [...stripHtml.matchAll(/chs-busy"[\s\S]{0,80}?chs-n">(\d+)</g)].map(m => m[1]);
    eq(busyHoles, ['6'], 'карта лунок: занята только лунка 6 (лунка 4 после u1 не подсвечена)');

    // Темп группы не зависает на лунке сдавшего игрока
    const m2 = sandbox.getRoundPaceMetrics(stripRound, NOW);
    eq(m2.currentHole, 6, 'темп группы считается по оставшемуся игроку: лунка 6');
    eq(m2.holesCompleted, 5, 'пройдено 5 лунок (по Соколову), а не 3');

    console.log('\n--- ТЕСТ 5: Автозакрытие снимает паузу ---');
    const staleId = 'round_pace_stale';
    dbState.rounds[staleId] = baseRound({ startTime: NOW - 26 * 3600 * 1000, createdAt: NOW - 26 * 3600 * 1000, paused: true, pausedAt: NOW - 25 * 3600 * 1000 });
    const swept = sandbox.sweepStaleRounds({ [staleId]: dbState.rounds[staleId] });
    ok(swept[staleId].status === 'completed', 'вчерашний раунд автозакрыт');
    ok(!swept[staleId].paused, 'автозакрытие сняло флаги паузы (иначе «На паузе» висит вечно)');
    ok(sandbox.buildRoundStatusBadgeHTML(swept[staleId]).indexOf('Завершён автоматически') !== -1, 'бейдж завершённого раунда без «паузы»');

    if (failures) { console.error('\n❌ ТЕСТЫ НЕ ПРОЙДЕНЫ: ' + failures + ' ошибок из ' + checks); process.exit(1); }
    console.log('\n🎉 ВСЕ ' + checks + ' ПРОВЕРОК ТАЙМИНГОВ И «ТЕКУЩЕЙ ЛУНКИ» ПРОЙДЕНЫ');
})().catch(e => { console.error('исключение в тесте', e); process.exit(1); });
