// Автотесты быстрого редактора протокола js/pe-edit.js.
// Главный регресс: (proto.groups || []).forEach is not a function — редактор
// должен читать протокол в ОБЪЕКТНОЙ форме (g1..gN от стартового листа) и в
// старом массиве, а не падать.
'use strict';
const fs = require('fs');
const vm = require('vm');

function fakeEl() {
    return { style: {}, value: '', textContent: '', innerHTML: '', checked: false, hidden: false, className: '',
        classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
        getAttribute: () => null, setAttribute(){}, removeAttribute(){}, appendChild(){}, removeChild(){}, remove(){},
        addEventListener(){}, removeEventListener(){}, focus(){}, blur(){}, click(){},
        querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ top:0, left:0, width:0, height:0 }),
        scrollTop: 0, scrollIntoView(){} };
}
const sandbox = {
    console, Date, Math, JSON, parseInt, parseFloat, isFinite, isNaN, String, Number, Array, Object, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent,
    document: { getElementById: () => null, createElement: () => fakeEl(), querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, documentElement: { style: {}, setAttribute(){} },
        body: { style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } } } },
    localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    navigator: { language: 'ru' },
    currentLang: 'ru',
    toast: () => {}, confirm: () => true,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/utils.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/pe-edit.js', 'utf8'), sandbox);

let failures = 0;
function eq(actual, expected, label) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        failures++;
        console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e);
    } else {
        console.log('ok  -', label);
    }
}
function ok(cond, label) {
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}

// ── 1. Объектная форма протокола (start-admin.js): groups = { g1..gN } ──
(function() {
    const ts = Date.UTC(2025, 7, 30, 6, 0, 0); // 09:00 МСК в виде ms
    const proto = {
        name: 'Кубок · старт',
        tournamentId: 'tn1',
        date: '2025-08-30',
        format: 'Stroke Play',
        groups: {
            g1: { roundId: 'r1', groupNo: 1, startHole: 1, startTime: ts, format: 'gross',
                  players: [
                      { id: 'p1', lastName: 'Иванов', firstName: 'Иван', middleName: '', gender: 'men', tee: 'wh', exactHcp: 10, exactHcpRaw: 10, fieldHcp: 10 },
                      { id: 'p2', lastName: 'Петров', firstName: 'Пётр', middleName: '', gender: 'men', tee: 'wh', exactHcp: 12, exactHcpRaw: 12, fieldHcp: 12 }
                  ],
                  markers: [{ markerId: 'p1', targetId: 'p2', targetName: 'Петров Пётр' }] },
            g2: { roundId: 'r2', groupNo: 2, startHole: 2, startTime: ts, format: '',
                  players: [
                      { id: 'p3', lastName: 'Сидорова', firstName: 'Мария', middleName: '', gender: 'women', tee: 'rd', exactHcp: 20, exactHcpRaw: 20, fieldHcp: 20 }
                  ],
                  markers: [] }
        }
    };
    const roundsAll = {
        r1: { protocolId: 'pid1', tournamentId: 'tn1', tee: 'wh', players: { p1: { name: 'Иванов Иван', tee: 'wh' }, p2: { name: 'Петров Пётр', tee: 'wh' } },
              markerAssignments: { p1: { targetId: 'p2' } }, startHole: 1, startTime: ts, format: 'gross' },
        r2: { protocolId: 'pid1', tournamentId: 'tn1', tee: 'rd', players: { p3: { name: 'Сидорова Мария', tee: 'rd' } }, startHole: 2, startTime: ts, format: '' }
    };
    // Просто не должно бросать
    let threw = null;
    try { sandbox.peBuildModel('tn1', { name: 'Кубок', tee: 'wh' }, 'pid1', proto, roundsAll); }
    catch (e) { threw = e; }
    ok(!threw, 'buildModel: объектная форма групп не падает (' + (threw && threw.message) + ')');

    const st = sandbox.peState();
    eq(st.groups.length, 2, 'объектная форма: 2 группы');
    eq(st.groups.map(function(g) { return g.rid; }), ['r1', 'r2'], 'объектная форма: rid по roundId');
    eq(st.groups[0].members.map(function(m) { return m.id; }), ['p1', 'p2'], 'объектная форма: состав группы 1');
    eq(st.groups[0].tee, 'wh', 'объектная форма: ТИ группы 1');
    eq(st.groups[0].format, 'gross', 'объектная форма: формат группы 1');
    eq(st.groups[0].startHole, 1, 'объектная форма: стартовая лунка группы 1');
    eq(st.groups[0].markerTargets, { p1: 'p2' }, 'объектная форма: маркеры группы 1');
    eq(st.groups[1].members.map(function(m) { return m.id; }), ['p3'], 'объектная форма: состав группы 2');
    eq(st.groups[1].tee, 'rd', 'объектная форма: ТИ группы 2 (красные)');
})();

// ── 2. Объектная форма без раундов в базе (печать только по протоколу) ──
(function() {
    const proto = {
        tournamentId: 'tn2',
        groups: {
            g1: { roundId: 'rx', groupNo: 1, startHole: 10, startTime: 1234567890000, tee: 'bl', format: 'stbl',
                  players: [{ id: 'a', lastName: 'А', firstName: 'А', middleName: '', gender: 'men', tee: 'bl', exactHcp: 5, fieldHcp: 5 }], markers: [] }
        }
    };
    let threw = null;
    try { sandbox.peBuildModel('tn2', { name: 'Т', tee: 'wh' }, 'pidx', proto, {}); }
    catch (e) { threw = e; }
    ok(!threw, 'buildModel: без раундов в базе не падает');
    const st = sandbox.peState();
    eq(st.groups.length, 1, 'без раундов: 1 группа');
    eq(st.groups[0].tee, 'bl', 'без раундов: ТИ из протокола');
    eq(st.groups[0].format, 'stbl', 'без раундов: формат из протокола');
    eq(st.groups[0].members[0].id, 'a', 'без раундов: игрок из g.players');
})();

// ── 3. Старый массивный формат (legacy pe-edit): groups = [ {members:[...]} ] ──
(function() {
    const proto = {
        tournamentId: 'tn3',
        groups: [
            { members: [{ id: 'p1', name: 'Иванов Иван' }, { id: 'p2', name: 'Петров Пётр' }], startHole: 1, startTime: '09:00', tee: 'wh', format: '' },
            { members: [{ id: 'p3', name: 'Сидорова Мария' }], startHole: 1, startTime: '09:10', tee: 'rd', format: '' }
        ],
        groupsFlat: [{ id: 'p1', rid: 'r1' }, { id: 'p2', rid: 'r1' }, { id: 'p3', rid: 'r2' }]
    };
    const roundsAll = {
        r1: { protocolId: 'pid3', players: { p1: { name: 'Иванов Иван' }, p2: { name: 'Петров Пётр' } } },
        r2: { protocolId: 'pid3', players: { p3: { name: 'Сидорова Мария' } } }
    };
    let threw = null;
    try { sandbox.peBuildModel('tn3', { name: 'Т', tee: 'wh' }, 'pid3', proto, roundsAll); }
    catch (e) { threw = e; }
    ok(!threw, 'buildModel: массивный формат не падает');
    const st = sandbox.peState();
    eq(st.groups.length, 2, 'массивный формат: 2 группы');
    eq(st.groups[0].members.map(function(m) { return m.id; }), ['p1', 'p2'], 'массивный формат: состав группы 1');
    eq(st.groups[1].tee, 'rd', 'массивный формат: ТИ группы 2');
})();

// ── 4. peGroupList: сортировка по groupNo, защита от мусорных ключей ──
(function() {
    const list = sandbox.peGroupList({ groups: { g2: { groupNo: 2 }, g1: { groupNo: 1 }, g10: { groupNo: 10 } } });
    eq(list.map(function(x) { return x.key; }), ['g1', 'g2', 'g10'], 'peGroupList: сортировка по groupNo');
    const empty = sandbox.peGroupList({});
    eq(empty, [], 'peGroupList: пустой протокол → []');
    const noGroups = sandbox.peGroupList(null);
    eq(noGroups, [], 'peGroupList: null → []');
})();

// ── 5. peTsFromTime / peTimeToInput: конвертация времени ──
(function() {
    const ts = new Date(2025, 7, 30, 9, 0, 0).getTime();
    sandbox.peState().proto = { date: '2025-08-30' };
    eq(sandbox.peTimeToInput(ts), '09:00', 'peTimeToInput: timestamp → «09:00»');
    eq(sandbox.peTimeToInput('09:10'), '09:10', 'peTimeToInput: строка проходит как есть');
    eq(sandbox.peTimeToInput(''), '', 'peTimeToInput: пусто → пусто');
    const back = sandbox.peTsFromTime('09:30', ts);
    eq(new Date(back).getHours() + ':' + new Date(back).getMinutes(), '9:30', 'peTsFromTime: «09:30» → timestamp с той же датой');
    eq(sandbox.peTsFromTime('', ts), ts, 'peTsFromTime: пусто → исходный timestamp');
    eq(sandbox.peTsFromTime(ts, null), ts, 'peTsFromTime: timestamp проходит как есть');
})();

if (failures) { console.error('\nFAILURES:', failures); process.exit(1); }
console.log('\nAll tests passed ✔');
