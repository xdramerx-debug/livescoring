// Автотесты завершения турнирного раунда и автозавершения турнира.
// Запуск: node tools/test-tournament-finish.js
// Проверяются требования:
//   1) В турнирном раунде каждый участник завершает СВОЮ карточку: переход по
//      персональной ссылке/QR (?round=&as=) не требует «ФИО владельца».
//      Переход из поиска «Продолжить по ФИО» (?fio=1) остаётся защищённым.
//   2) Турнир завершается автоматически, когда все его раунды закрыты —
//      независимо от того, как именно закрыт раунд (игроком, принудительно,
//      автозакрытием на следующий день) и был ли турнир помечен «active».
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0, total = 0;
function ok(cond, label) {
    total++;
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function eq(actual, expected, label) {
    total++;
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

const dbState = { rounds: {}, tournaments: {}, users: {}, protocols: {} };
function getPath(obj, p) {
    const parts = String(p || '').split('/').filter(Boolean);
    let cur = obj;
    for (const part of parts) {
        if (!cur || typeof cur !== 'object') return undefined;
        cur = cur[part];
    }
    return cur;
}
function setPath(obj, p, val) {
    const parts = String(p || '').split('/').filter(Boolean);
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
    }
    if (val === null || val === undefined) delete cur[parts[parts.length - 1]];
    else cur[parts[parts.length - 1]] = val;
}
function clone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }

const dbStub = {
    ref(p) {
        const self = {
            _p: p || '', _child: null, _eq: undefined,
            once() {
                let val = getPath(dbState, p || '');
                if (self._child) {
                    const src = val || {};
                    const filtered = {};
                    Object.keys(src).forEach(k => {
                        const row = src[k];
                        if (row && typeof row === 'object' && String(row[self._child] || '') === String(self._eq)) filtered[k] = row;
                    });
                    val = filtered;
                }
                return Promise.resolve({ val: () => clone(val === undefined ? null : val) });
            },
            set(v) { setPath(dbState, p || '', clone(v)); return Promise.resolve(); },
            update(updates) {
                Object.keys(updates).forEach(k => setPath(dbState, (p ? p + '/' + k : k), clone(updates[k])));
                return Promise.resolve();
            },
            remove() { setPath(dbState, p || '', null); return Promise.resolve(); },
            push() {
                const id = 'key_' + Math.random().toString(36).slice(2, 8);
                return {
                    key: id,
                    set(v) { setPath(dbState, (p ? p + '/' + id : id), clone(v)); return Promise.resolve(); }
                };
            },
            transaction(fn) {
                const cur = getPath(dbState, p || '');
                const next = fn(cur === undefined ? null : cur);
                if (next !== undefined) setPath(dbState, p || '', next);
                return Promise.resolve({ committed: next !== undefined, snapshot: { val: () => (next === undefined ? cur : next) } });
            },
            on() { return self; }, off() { return self; },
            orderByChild(field) { self._child = field; return self; },
            equalTo(v) { self._eq = v; return self; }
        };
        return self;
    }
};

const store = {}, sessionStore = {};
const sandbox = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, String, Number, Array, Object, Promise,
    setTimeout, clearTimeout, setInterval, clearInterval, RegExp, Error, encodeURIComponent, decodeURIComponent,
    document: {
        getElementById: getEl,
        createElement: () => fakeEl('created'),
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener() {}, removeEventListener() {},
        documentElement: { style: { setProperty() {} }, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} } },
        body: { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, appendChild() {} }
    },
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    },
    sessionStorage: {
        getItem: k => (k in sessionStore ? sessionStore[k] : null),
        setItem: (k, v) => { sessionStore[k] = String(v); },
        removeItem: k => { delete sessionStore[k]; }
    },
    navigator: { language: 'ru', onLine: true, vibrate() {} },
    location: { search: '', pathname: '/setup-round.html', origin: 'https://club.example', href: '' },
    requestAnimationFrame: fn => setTimeout(fn, 0),
    URLSearchParams: function (q) {
        const m = {};
        String(q || '').replace(/^\?/, '').split('&').forEach(pair => {
            const i = pair.indexOf('=');
            if (i < 0) { if (pair) m[pair] = ''; return; }
            m[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
        });
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

function setUrl(search) { sandbox.location.search = search; }

// Турнирный раунд группы из двух участников (как создаёт стартовый протокол).
function tnRound(rid, tnId, extra) {
    const rd = Object.assign({
        mode: 'group',
        status: 'active',
        tournamentId: tnId,
        tournamentName: 'Кубок Пестово',
        protocolId: 'proto1',
        accessKey: 'protocol_proto1_0',
        createdBy: 'admin',
        players: {
            u1: { name: 'Иванов Иван', fieldHcp: 0, exactHcp: 0, scores: {} },
            u2: { name: 'Петров Пётр', fieldHcp: 5, exactHcp: 5, scores: {} }
        }
    }, extra || {});
    dbState.rounds[rid] = clone(rd);
    return rd;
}

(async function main() {
    // ══════════════════════════════════════════════════════════════
    console.log('\n--- 1. Завершение карточки участником турнирного раунда ---');
    // ══════════════════════════════════════════════════════════════
    const rd = tnRound('r_tn_1', 't1');

    // Участник открывает свою карточку по QR/ссылке протокола (без аккаунта).
    setUrl('?round=r_tn_1&as=u2');
    ok(sandbox.pestovoIsTournamentCardHolder(rd, 'u2') === true, 'pestovoIsTournamentCardHolder: участник турнира по своей ссылке');
    ok(sandbox.pestovoIsFioResume(rd, 'r_tn_1', 'u2') === false, 'турнирный раунд: второму участнику НЕ требуется ФИО владельца');

    // Тот же раунд, но пришли из поиска «Продолжить по ФИО» — защита остаётся.
    setUrl('?round=r_tn_1&as=u2&fio=1');
    ok(sandbox.pestovoIsFioResume(rd, 'r_tn_1', 'u2') === true, 'турнирный раунд из поиска по ФИО: подтверждение владельца требуется');

    setUrl('?round=r_tn_1&as=u2');
    // Обычный (не турнирный) раунд с чужого устройства — поведение прежнее.
    const casual = tnRound('r_casual', '', { tournamentId: '', tournamentName: '', protocolId: '' });
    ok(sandbox.pestovoIsFioResume(casual, 'r_casual', 'u2') === true, 'обычный раунд с чужого устройства: подтверждение требуется');

    // Владелец аккаунта — никогда не спрашиваем.
    sandbox.currentUser = { uid: 'u2' };
    ok(sandbox.pestovoIsFioResume(rd, 'r_tn_1', 'u2') === false, 'вошедший в аккаунт участник: подтверждение не требуется');
    delete sandbox.currentUser;

    // Ссылки поиска по ФИО помечены fio=1 (иначе защита потеряла бы смысл).
    const listHtml = sandbox.pestovoRenderFioResumeListHtml([{
        roundId: 'r_tn_1', round: rd, playerId: 'u2', player: { name: 'Петров Пётр' }, inputFio: 'Петров'
    }]);
    ok(listHtml.indexOf('&fio=1') !== -1, 'ссылки «Продолжить по ФИО» содержат метку fio=1');

    // ══════════════════════════════════════════════════════════════
    console.log('\n--- 2. Автозавершение турнира ---');
    // ══════════════════════════════════════════════════════════════

    // 2.1 Чистая функция выбора готовых турниров.
    eq(sandbox.tournamentsReadyToAutoFinish({
        a: { tournamentId: 't1', status: 'completed' },
        b: { tournamentId: 't1', status: 'completed' },
        c: { tournamentId: 't2', status: 'completed' },
        d: { tournamentId: 't2', status: 'active' },
        e: { status: 'completed' }
    }), ['t1'], 'tournamentsReadyToAutoFinish: только турниры со всеми закрытыми раундами');

    // 2.2 Турнир «предстоящий», но все раунды сыграны → завершается.
    dbState.tournaments.t1 = { name: 'Кубок', status: 'upcoming', date: '2026-09-17' };
    dbState.rounds.r_tn_1.status = 'completed';
    dbState.rounds.r_tn_2 = Object.assign(clone(dbState.rounds.r_tn_1), { groupNo: 2, status: 'completed' });
    const finished = await sandbox.pestovoAutoFinishTournament('t1');
    ok(finished === true, 'pestovoAutoFinishTournament: возвращает true при завершении');
    eq(dbState.tournaments.t1.status, 'completed', 'турнир со статусом upcoming завершается автоматически');
    eq(dbState.tournaments.t1.lifecycleStatus, 'completed', 'lifecycleStatus=completed — карточка уходит в «Прошедшие»');
    ok(!!dbState.tournaments.t1.finishedAt && dbState.tournaments.t1.finishedAutomatically === true, 'отмечено автозавершение и время');

    // 2.3 Повторный вызов ничего не меняет и не пишет в базу.
    const again = await sandbox.pestovoAutoFinishTournament('t1');
    ok(again === false, 'повторное автозавершение не срабатывает');

    // 2.4 Не все раунды закрыты → турнир остаётся активным.
    dbState.tournaments.t2 = { name: 'Осенний', status: 'active' };
    dbState.rounds.r_t2_1 = Object.assign(clone(dbState.rounds.r_tn_1), { tournamentId: 't2', status: 'completed' });
    dbState.rounds.r_t2_2 = Object.assign(clone(dbState.rounds.r_tn_1), { tournamentId: 't2', status: 'active' });
    const notYet = await sandbox.pestovoAutoFinishTournament('t2');
    ok(notYet === false, 'турнир с незакрытым раундом не завершается');
    eq(dbState.tournaments.t2.status, 'active', 'статус активного турнира не меняется');

    // 2.5 Раунд закрыт принудительно («другой способ») → турнир завершается.
    dbState.tournaments.t3 = { name: 'Кубок клуба', status: 'active' };
    const r3 = Object.assign(clone(dbState.rounds.r_tn_1), { tournamentId: 't3', status: 'active' });
    dbState.rounds.r_t3 = r3;
    await sandbox.roundForceFinishAll('r_t3', null, 'Гроза', 'Судья');
    eq(dbState.rounds.r_t3.status, 'completed', 'roundForceFinishAll закрывает раунд');
    // Автозавершение запускается асинхронно — даём микрозадачам выполниться.
    await new Promise(r => setTimeout(r, 30));
    eq(dbState.tournaments.t3.status, 'completed', 'принудительно закрытый раунд завершает турнир');

    // 2.6 Досрочное завершение последнего игрока (roundForceFinishPlayer).
    dbState.tournaments.t4 = { name: 'Матч', status: 'active' };
    dbState.rounds.r_t4 = Object.assign(clone(dbState.rounds.r_tn_1), { tournamentId: 't4', status: 'active' });
    const res4 = await sandbox.roundForceFinishPlayer('r_t4', 'u1', null, 'Травма', 'Судья');
    ok(res4.isComplete === false, 'roundForceFinishPlayer: первый игрок не закрывает раунд группы');
    const res4b = await sandbox.roundForceFinishPlayer('r_t4', 'u2', null, 'Травма', 'Судья');
    ok(res4b.isComplete === true, 'roundForceFinishPlayer: второй игрок закрывает раунд');
    await new Promise(r => setTimeout(r, 30));
    eq(dbState.tournaments.t4.status, 'completed', 'турнир завершается после досрочного финиша всех участников');

    // 2.7 Страховочный проход по снимку (раунд закрыт другим клиентом).
    dbState.tournaments.t5 = { name: 'Спринт', status: 'upcoming' };
    dbState.rounds.r_t5 = Object.assign(clone(dbState.rounds.r_tn_1), { tournamentId: 't5', status: 'completed' });
    const swept = await sandbox.pestovoAutoFinishTournamentsFromSnapshot(dbState.rounds);
    ok(swept.indexOf('t5') !== -1, 'страховочный проход находит сыгранный турнир');
    eq(dbState.tournaments.t5.status, 'completed', 'страховочный проход завершает турнир');

    // 2.8 Раунд ссылается на удалённый турнир — пустой узел не создаётся.
    dbState.rounds.r_ghost = Object.assign(clone(dbState.rounds.r_tn_1), { tournamentId: 't_ghost', status: 'completed' });
    const ghost = await sandbox.pestovoAutoFinishTournament('t_ghost');
    ok(ghost === false, 'автозавершение не срабатывает без карточки турнира');
    ok(dbState.tournaments.t_ghost === undefined, 'узел tournaments/t_ghost не создан');

    // 2.9 Отменённый турнир не перезаписывается.
    dbState.tournaments.t6 = { name: 'Отменён', status: 'cancelled' };
    dbState.rounds.r_t6 = Object.assign(clone(dbState.rounds.r_tn_1), { tournamentId: 't6', status: 'completed' });
    const cancelled = await sandbox.pestovoAutoFinishTournament('t6');
    ok(cancelled === false, 'отменённый турнир не автозавершается');
    eq(dbState.tournaments.t6.status, 'cancelled', 'статус отменённого турнира сохранён');

    console.log('\n' + total + ' проверок, ошибок: ' + failures);
    process.exit(failures ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
