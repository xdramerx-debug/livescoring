// Автотесты обрезки гандикапа на странице турнира (запуск: node tools/test-tournaments.js)
// Проверяются: источник обрезки (турнир → legacy-протокол), эффективный HCP и
// группировка участников/лидерборда С УЧЁТОМ обрезки (38.5 → 28 → группа 12.1–28).
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
const sandbox = { console, Date, Math, JSON, parseInt, parseFloat, isFinite, isNaN, String, Number, Array, Object, setTimeout, clearTimeout,
    document: { getElementById: () => null, createElement: () => fakeEl(), querySelector: () => null, querySelectorAll: () => [],
        addEventListener: () => {}, documentElement: { style: {}, setAttribute(){} },
        body: { style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } } } },
    localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    navigator: { language: 'ru' } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/utils.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/tournaments.js', 'utf8'), sandbox);

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
function check(cond, label) {
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}

// ── Объекты тестового турнира ──
function mkTn(cut, withCut) {
    var t = {
        divisions: [
            { id: 'm1', name: 'Мужчины 0–12', gender: 'men', hcpFrom: 0, hcpTo: 12, tee: 'wh' },
            { id: 'm2', name: 'Мужчины 12.1–28', gender: 'men', hcpFrom: 12.1, hcpTo: 28, tee: 'wh' }
        ]
    };
    if (withCut) t.hcpCut = cut;
    return t;
}
const CUT_MAX28 = { enabled: false, percent: 100, maxEnabled: true, maxMen: 28, maxWomen: null };
const CUT_PCT90_MAX28 = { enabled: true, percent: 90, maxEnabled: true, maxMen: 28, maxWomen: null };
const regPlayers = {
    u1: { name: 'Прудовский Михаил Валерьевич', handicap: 38.5, gender: 'men', tee: 'wh', registeredAt: 1234567890 },
    u2: { name: 'Иванов Иван Иванович', handicap: 10, gender: 'men', tee: 'wh', registeredAt: 1234567890 }
};

// ── tnTournamentCut: источник обрезки ──
sandbox.tnProtocols = null;
eq(sandbox.tnTournamentCut(mkTn(CUT_MAX28, true), 't1'), CUT_MAX28, 'cut: берётся с турнира');
eq(sandbox.tnTournamentCut(mkTn(null, false), 't1'), null, 'cut: без обрезки и протоколов → null');
// Legacy: обрезка только в протоколе турнира (последний по времени выигрывает)
sandbox.tnProtocols = {
    pr_old: { tournamentId: 't1', createdAt: 100, hcpCut: { enabled: false, maxEnabled: true, maxMen: 36, maxWomen: null } },
    pr_new: { tournamentId: 't1', createdAt: 200, hcpCut: CUT_MAX28 }
};
eq(sandbox.tnTournamentCut(mkTn(null, false), 't1'), CUT_MAX28, 'cut: legacy из последнего протокола турнира');
sandbox.tnProtocols = { pr_other: { tournamentId: 't2', createdAt: 300, hcpCut: CUT_MAX28 } };
eq(sandbox.tnTournamentCut(mkTn(null, false), 't1'), null, 'cut: протокол другого турнира не подходит');
sandbox.tnProtocols = null;

// ── tnEffectiveHcp: процент → максимум по полу ──
eq(sandbox.tnEffectiveHcp(mkTn(CUT_MAX28, true), 't1', 38.5, 'men'), 28, 'cut: 38.5 → 28 (макс. мужчины)');
eq(sandbox.tnEffectiveHcp(mkTn(CUT_PCT90_MAX28, true), 't1', 36, 'men'), 28, 'cut: 36 → 90% = 32.4 → 28');
eq(sandbox.tnEffectiveHcp(mkTn(CUT_MAX28, true), 't1', 10, 'men'), 10, 'cut: 10 не трогается');
eq(sandbox.tnEffectiveHcp(mkTn(null, false), 't1', 38.5, 'men'), 38.5, 'cut: без обрезки = исходный');

// ── tnDivisionForHcp: группа по ОБРЕЗАННОМУ HCP ──
eq(sandbox.tnDivisionForHcp(mkTn(CUT_MAX28, true), 't1', 38.5, 'men').id, 'm2', 'div: 38.5 (→28) в 12.1–28');
eq(sandbox.tnDivisionForHcp(mkTn(CUT_MAX28, true), 't1', 10, 'men').id, 'm1', 'div: 10 в 0–12');
eq(sandbox.tnDivisionForHcp(mkTn(null, false), 't1', 38.5, 'men'), null, 'div: 38.5 без обрезки — вне групп');
eq(sandbox.tnDivisionForHcp(mkTn(null, false), 't1', 38.5, 'women'), null, 'div: пол не совпадает — вне групп');
eq(sandbox.tnDivisionForHcp(mkTn(CUT_MAX28, true), 't1', null, 'men'), null, 'div: пустой HCP с обрезкой — не падает в 0–12');
eq(sandbox.tnDivisionForHcp(mkTn(CUT_MAX28, true), 't1', '', 'men'), null, 'div: пустая строка HCP — вне групп');

// ── tnRosterGroupedHtml: участник с обрезкой попадает в свою группу ──
var htmlCut = sandbox.tnRosterGroupedHtml('t1', mkTn(CUT_MAX28, true), regPlayers, 2);
check(htmlCut.indexOf('Мужчины 12.1–28') !== -1, 'roster: заголовок группы 12.1–28 есть');
check(htmlCut.indexOf('Без группы') === -1, 'roster: никто не в «Без группы»');
check(htmlCut.indexOf('fa-scissors') !== -1, 'roster: метка обрезки «✂» есть');
check(htmlCut.indexOf('→') !== -1 && htmlCut.indexOf('28') !== -1, 'roster: чип «38.5 → 28» показан');
var htmlNoCut = sandbox.tnRosterGroupedHtml('t1', mkTn(null, false), regPlayers, 2);
check(htmlNoCut.indexOf('Без группы') !== -1, 'roster: без обрезки 38.5 → «Без группы»');
check(htmlNoCut.indexOf('fa-scissors') === -1, 'roster: без обрезки метки «✂» нет');

// ── tnRosterGroupedHtml: legacy-обрезка из протокола тоже работает ──
sandbox.tnProtocols = { pr_new: { tournamentId: 't1', createdAt: 200, hcpCut: CUT_MAX28 } };
var htmlLegacy = sandbox.tnRosterGroupedHtml('t1', mkTn(null, false), regPlayers, 2);
check(htmlLegacy.indexOf('Мужчины 12.1–28') !== -1 && htmlLegacy.indexOf('Без группы') === -1, 'roster: legacy-обрезка из протокола применяется');
sandbox.tnProtocols = null;

console.log(failures ? '\n' + failures + ' FAILURES' : '\nAll tournaments cut tests passed ✔');
process.exit(failures ? 1 : 0);
