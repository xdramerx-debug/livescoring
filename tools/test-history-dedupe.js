// Автотесты: защита от дублей раундов в истории игроков.
//
// Регрессия бага: при завершении ГРУППОВОГО раунда saveHistory вызывался
// клиентом КАЖДОГО завершающего игрока и писал историю всем участникам —
// в профиле появлялись два (и более) одинаковых раунда с одним roundId,
// а roundsPlayed завышался.
//
// Проверяется:
//  — pestovoPickHistoryUnique схлопывает дубли по roundId, оставляя самую
//    полную запись, и не трогает разные раунды;
//  — pestovoHistoryBestStats считает счётчики по уникальным раундам;
//  — pestovoDedupeUserHistory удаляет дубли из БД и выравнивает
//    roundsPlayed / bestGross / bestStableford (идемпотентно);
//  — saveHistoryEntry не пишет второй записи при существующем roundId;
//  — разделение «клубные/турнирные» раунды и сортировки профиля.
//
// Запуск: node tools/test-history-dedupe.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function check(cond, label) {
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function eq(a, b, label) { check(JSON.stringify(a) === JSON.stringify(b), label + ' (получено: ' + JSON.stringify(a) + ')'); }

function makeLocalStorage() {
    const store = {};
    return {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
        key: i => Object.keys(store)[i] || null,
        get length() { return Object.keys(store).length; }
    };
}

// Фейковая БД с вложенным деревом, push/transaction/запросами.
function makeDb(root) {
    function getAt(p) {
        if (!p) return root;
        let cur = root;
        for (const seg of p.split('/')) {
            if (cur == null || typeof cur !== 'object') return undefined;
            cur = cur[seg];
        }
        return cur;
    }
    function setAt(p, v) {
        const segs = p.split('/').filter(Boolean);
        const last = segs.pop();
        let cur = root;
        for (const seg of segs) {
            if (cur[seg] == null || typeof cur[seg] !== 'object') cur[seg] = {};
            cur = cur[seg];
        }
        if (v === null) delete cur[last]; else cur[last] = v;
    }
    let pushSeq = 0;
    function snap(node) {
        const isEmptyObj = node && typeof node === 'object' && !Array.isArray(node) && Object.keys(node).length === 0;
        return {
            val: () => (node === undefined ? null : node),
            exists: () => node !== undefined && node !== null && !isEmptyObj,
            numChildren: () => (node && typeof node === 'object' ? Object.keys(node).length : 0),
            child: k => snap(node && typeof node === 'object' ? node[k] : undefined)
        };
    }
    function querySnap(node, qChild, qValue) {
        if (qChild == null) return snap(node);
        const filtered = {};
        if (node && typeof node === 'object') {
            Object.keys(node).forEach(k => {
                const v = node[k];
                if (v && typeof v === 'object' && v[qChild] === qValue) filtered[k] = v;
            });
        }
        return snap(filtered);
    }
    function ref(p) {
        p = p || '';
        let qChild = null, qValue = null;
        const api = {
            once: () => Promise.resolve(querySnap(getAt(p), qChild, qValue)),
            set: v => { setAt(p, v); return Promise.resolve(); },
            update: m => {
                Object.keys(m).forEach(k => setAt((p ? p + '/' : '') + k, m[k]));
                return Promise.resolve();
            },
            remove: () => { setAt(p, null); return Promise.resolve(); },
            push: v => {
                const key = '-Ptest' + (++pushSeq);
                setAt(p + '/' + key, v);
                return { key, then: cb => Promise.resolve({ key }).then(cb) };
            },
            transaction: fn => {
                const cur = getAt(p);
                const before = cur === undefined ? null : JSON.parse(JSON.stringify(cur));
                let next;
                try { next = fn(before); } catch (e) { next = undefined; }
                if (next === undefined) {
                    return Promise.resolve({ committed: false, snapshot: snap(before) });
                }
                setAt(p, JSON.parse(JSON.stringify(next)));
                return Promise.resolve({ committed: true, snapshot: snap(next) });
            },
            on: () => {}, off: () => {},
            child: sub => ref(p ? p + '/' + sub : sub),
            orderByChild(c) { qChild = c; return api; },
            orderByKey() { return api; },
            equalTo(v) { qValue = v; return api; },
            limitToFirst() { return api; },
            limitToLast() { return api; }
        };
        return api;
    }
    return { ref };
}

function mkEl() {
    return {
        style: { setProperty() {}, getPropertyValue: () => '' }, value: '', textContent: '', innerHTML: '',
        dataset: {}, children: [],
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
        appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        focus() {}, blur() {}, click() {}, append() {}
    };
}

const sandbox = {
    console, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    URLSearchParams, encodeURIComponent, decodeURIComponent, Math, Date, JSON,
    localStorage: makeLocalStorage(),
    sessionStorage: makeLocalStorage(),
    navigator: { language: 'ru-RU', userAgent: 'node-test' },
    fetch: undefined,
    currentLang: 'ru',
    currentUser: null,
    currentUserData: null,
    document: {
        readyState: 'complete',
        addEventListener: () => {}, removeEventListener: () => {},
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        createElement: mkEl,
        documentElement: Object.assign(mkEl(), { lang: 'ru' }),
        body: mkEl()
    }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/course-config.js'), 'utf8'), sandbox, { filename: 'utils.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/format.js'), 'utf8'), sandbox, { filename: 'utils.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/dom.js'), 'utf8'), sandbox, { filename: 'utils.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8'), sandbox, { filename: 'utils.js' });

const pick = sandbox.pestovoPickHistoryUnique;
const bestStats = sandbox.pestovoHistoryBestStats;
const groupKey = sandbox.pestovoHistoryEntryGroupKey;

// ── 1. Дедупликация по roundId ──
function entry(over) {
    return Object.assign({
        roundId: 'r1', date: 1000, gross: 90, holes: 18, toPar: 18,
        stablefordField: 20, birdies: 1, scores: { 1: 5 }
    }, over);
}
const dupPairs = [
    ['k1', entry()],
    ['k2', entry()],                       // точный дубль (как на проде)
    ['k3', entry({ date: 1001 })],         // тот же раунд, чуть позже
    ['k4', entry({ roundId: 'r2', gross: 85, date: 2000, stablefordField: 30, birdies: 3 })],
    ['k5', entry({ roundId: 'r3', gross: 95, holes: 9, date: 3000 })]
];
const unique = pick(dupPairs);
eq(unique.length, 3, 'дедуп: из 5 записей осталось 3 уникальных раунда');
eq(unique.filter(r => r.roundId === 'r1').length, 1, 'дедуп: один раунд r1 вместо трёх');
eq(unique.find(r => r.roundId === 'r2').gross, 85, 'дедуп: различные раунды сохранены');
eq(unique.find(r => r.roundId === 'r3').holes, 9, 'дедуп: неполный раунд сохранён');

// Из разной полноты дубля выбирается наиболее заполненный
const partialPairs = [
    ['a', entry({ gross: 40, holes: 8 })],
    ['b', entry({ gross: 90, holes: 18, birdies: 2 })]
];
const picked = pick(partialPairs);
eq(picked.length, 1, 'дедуп: из частичной и полной записи — одна');
eq(picked[0].holes, 18, 'дедуп: остаётся самая полная запись (18 лунок)');

// Записи без roundId группируются по сигнатуре
const legacyPairs = [
    ['l1', { date: 500, gross: 88, holes: 18, toPar: 16, scores: { 1: 4 } }],
    ['l2', { date: 500, gross: 88, holes: 18, toPar: 16, scores: { 1: 4 } }],
    ['l3', { date: 501, gross: 88, holes: 18, toPar: 16, scores: { 1: 5 } }]
];
eq(pick(legacyPairs).length, 2, 'дедуп: легаси-дубли без roundId схлопываются по сигнатуре');
check(groupKey(entry()) === 'rid:r1', 'ключ группы: по roundId');

// ── 2. Сводные показатели ──
const stats = bestStats([
    { holes: 18, gross: 90, stablefordField: 20 },
    { holes: 18, gross: 82, stablefordField: 33 },
    { holes: 9, gross: 45, stablefordField: 15 }    // неполный — не в best*
]);
eq(stats.roundsPlayed, 3, 'статистика: roundsPlayed = число уникальных записей');
eq(stats.bestGross, 82, 'статистика: bestGross по 18 лункам');
eq(stats.bestStableford, 33, 'статистика: bestStableford по 18 лункам');

// ── 3. Миграция пользователя в фейковой БД ──
async function main() {
    const state = {
        users: {
            u1: {
                roundsPlayed: 4, bestGross: 90, bestStableford: 20,
                history: {
                    h1: entry({ roundId: 'r1', gross: 90 }),
                    h2: entry({ roundId: 'r1', gross: 90 }),           // дубль
                    h3: entry({ roundId: 'r2', gross: 82, stablefordField: 33, date: 2000 }),
                    h4: entry({ roundId: 'r2', gross: 82, stablefordField: 33, date: 2001 }), // дубль
                    h5: entry({ roundId: 'r3', gross: 95, date: 3000 })
                }
            },
            u2: { roundsPlayed: 1, bestGross: 100, bestStableford: 20, history: { h9: entry({ roundId: 'r9', gross: 100 }) } }
        }
    };
    sandbox.db = makeDb(state);

    const changed = await sandbox.pestovoDedupeUserHistory('u1', state.users.u1);
    check(changed === true, 'миграция: изменения зафиксированы');
    const after = state.users.u1;
    eq(Object.keys(after.history).length, 3, 'миграция: осталось 3 уникальных раунда');
    eq(after.roundsPlayed, 3, 'миграция: roundsPlayed пересчитан (3)');
    eq(after.bestGross, 82, 'миграция: bestGross пересчитан (82)');
    eq(after.bestStableford, 33, 'миграция: bestStableford пересчитан (33)');

    const changed2 = await sandbox.pestovoDedupeUserHistory('u2', state.users.u2);
    check(changed2 === false, 'миграция: чистый пользователь не переписывается');

    // ── 4. saveHistoryEntry: идемпотентность по roundId ──
    const state2 = { users: { u3: { history: { x1: entry({ roundId: 'rdup' }) }, roundsPlayed: 1 } } };
    sandbox.db = makeDb(state2);
    await sandbox.saveHistoryEntry('u3', 'rdup', { holeRange: '1-18' }, { scores: {} },
        { gross: 90, holesPlayed: 18, stablefordField: 20 });
    // Микротик для резолва then-цепочки внутри функции
    await new Promise(r => setTimeout(r, 5));
    eq(Object.keys(state2.users.u3.history).length, 1, 'saveHistoryEntry: повторный roundId не добавлен');
    eq(state2.users.u3.roundsPlayed, 1, 'saveHistoryEntry: roundsPlayed не задвоен');

    await sandbox.saveHistoryEntry('u3', 'rnew', { holeRange: '1-18' }, { scores: {} },
        { gross: 88, holesPlayed: 18, stablefordField: 25 });
    await new Promise(r => setTimeout(r, 5));
    eq(Object.keys(state2.users.u3.history).length, 2, 'saveHistoryEntry: новый roundId добавлен');
    eq(state2.users.u3.roundsPlayed, 2, 'saveHistoryEntry: roundsPlayed увеличен один раз');

    // ── 5. Вкладки профиля: клубные vs турнирные + сортировки ──
    const isTn = sandbox.pestovoProfileIsTournamentRound;
    check(isTn({ tournamentId: 't1' }) === true, 'вкладки: турнирный раунд по tournamentId');
    check(isTn({ tournamentName: 'Кубок' }) === true, 'вкладки: турнирный раунд по tournamentName');
    check(isTn({ roundId: 'r1' }) === false, 'вкладки: обычный раунд — клубная вкладка');

    const items = [
        { _key: 'a', roundId: 'a', date: 100, gross: 95, stablefordField: 18, birdies: 0 },
        { _key: 'b', roundId: 'b', date: 300, gross: 82, stablefordField: 33, birdies: 4 },
        { _key: 'c', roundId: 'c', date: 200, gross: 88, stablefordField: 24, birdies: 2 }
    ];
    const order = mode => {
        const copy = items.map(x => Object.assign({}, x));
        sandbox.pestovoSortHistoryItems(copy, mode);
        return copy.map(x => x._key).join(',');
    };
    eq(order('date_desc'), 'b,c,a', 'сортировка: новые сверху');
    eq(order('date_asc'), 'a,c,b', 'сортировка: старые сверху');
    eq(order('gross_best'), 'b,c,a', 'сортировка: лучший Gross');
    eq(order('stableford_best'), 'b,c,a', 'сортировка: лучший Stableford');
    eq(order('birdies'), 'b,c,a', 'сортировка: больше всего бёрди');

    // ── 5b. Рендер вкладок профиля: табы, группировка, свёрнутые карточки ──
    const els = {};
    sandbox.document.getElementById = id => {
        if (!els[id]) els[id] = { innerHTML: '', textContent: '' };
        return els[id];
    };
    const sampleRounds = [
        { _key: 'c1', roundId: 'c1', date: 100, gross: 90, holes: 18, toPar: 18, birdies: 1, stablefordField: 20, tee: 'wh', mode: 'group' },
        { _key: 't1', roundId: 't1', tournamentId: 'T1', tournamentName: 'Кубок Пестово', roundName: '1-й раунд', date: 200, gross: 85, holes: 18, toPar: 13, birdies: 3, stablefordField: 28, tee: 'wh' },
        { _key: 't2', roundId: 't2', tournamentId: 'T1', tournamentName: 'Кубок Пестово', roundName: '2-й раунд', date: 300, gross: 88, holes: 18, toPar: 16, birdies: 2, stablefordField: 24, tee: 'wh' }
    ];
    const toolbarHtml = () => els['pr-history-root'] ? els['pr-history-root'].innerHTML : '';
    const listHtml = () => els['pr-history-list'] ? els['pr-history-list'].innerHTML : '';
    sandbox.pestovoInitProfileHistory('pv', { name: 'Игрок' }, sampleRounds);
    let rendered = toolbarHtml();
    check(rendered.indexOf('Клубные раунды') !== -1, 'рендер: есть вкладка «Клубные раунды»');
    check(rendered.indexOf('Турнирные раунды') !== -1, 'рендер: есть вкладка «Турнирные раунды»');
    check(rendered.indexOf('>1<') !== -1 && rendered.indexOf('>2<') !== -1, 'рендер: счётчики на вкладках (1 и 2)');
    check(listHtml().indexOf('display:none') !== -1, 'рендер: карточки раундов свёрнуты по умолчанию');
    check(listHtml().indexOf('Кубок Пестово') === -1, 'рендер: турнирный раунд не попал в клубную вкладку');

    sandbox.pestovoProfileHistorySetTab('pv', 'tn');
    rendered = listHtml();
    check(rendered.indexOf('Кубок Пестово') !== -1, 'рендер: турнир виден в турнирной вкладке');
    check(rendered.indexOf('1-й раунд') !== -1 && rendered.indexOf('2-й раунд') !== -1, 'рендер: оба раунда турнира показаны');
    const tnHeaders = (rendered.match(/Кубок Пестово/g) || []).length;
    check(tnHeaders >= 2, 'рендер: один заголовок турнира + его раунды');

    sandbox.pestovoProfileHistorySetSort('pv', 'gross_best');
    rendered = listHtml();
    const i1 = rendered.indexOf('1-й раунд'), i2 = rendered.indexOf('2-й раунд');
    check(i1 !== -1 && i2 !== -1 && i1 < i2, 'рендер: сортировка лучшего Gross (85 раньше 88)');

    // ── 6. Глобальная миграция: клейм и повторная защита ──
    const state3 = {
        settings: { migrations: {} },
        users: { u1: state.users.u1 }
    };
    sandbox.db = makeDb(state3);
    sandbox.fetch = undefined; // фолбэк на полное чтение SDK
    const n1 = await sandbox.pestovoDedupeAllPlayerHistoryOnce();
    check(n1 >= 0, 'глобальная миграция: отработала без ошибок');
    check(state3.settings.migrations.historyDedupeV2.status === 'done', 'глобальная миграция: флаг выставлен в done');
    const n2 = await sandbox.pestovoDedupeAllPlayerHistoryOnce();
    eq(n2, 0, 'глобальная миграция: повторный запуск ничего не делает');

    if (failures) { console.error('\n' + failures + ' проверок провалено'); process.exit(1); }
    console.log('\nВсе проверки пройдены.');
}

main().catch(e => { console.error(e); process.exit(1); });
