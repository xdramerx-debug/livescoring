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
    navigator: { language: 'ru' }, currentLang: 'ru',
    t: key => ({ player: 'Игрок', date: 'Дата' })[key] || key };
sandbox.window = sandbox;
sandbox.escapeHtml = function(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/course-config.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/../js/format.js', 'utf8'), sandbox);
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

// ── Регрессии XSS для недоверенных кодов ти и ключей турнира ──
const teePayload = 'wh" onmouseover="alert(1)<script>';
eq(Array.from(sandbox.getRoundTeeCodes({ players: { attacker: { tee: teePayload } } })), ['wh'], 'tee: неизвестный код нормализуется в wh');
eq(Array.from(sandbox.tnSafeTeeCodes(['bk', 'bk', teePayload, 'rd'])), ['bk', 'wh', 'rd'], 'tee: опции allowlist дедуплицированы');
eq(Array.from(sandbox.tnSafeTeeCodes([])), ['wh'], 'tee: пустой allowlist получает wh');
const maliciousPill = sandbox.fmtTeePill(teePayload);
check(maliciousPill.indexOf('tee-wh') !== -1 && maliciousPill.indexOf('onmouseover') === -1 && maliciousPill.indexOf('<script>') === -1, 'tee: код не попадает в CSS-класс/HTML');
const originalT = sandbox.t;
sandbox.t = function() { return '<img src=x onerror=alert(1)>'; };
const escapedTeePill = sandbox.fmtTeePill('wh');
sandbox.t = originalT;
check(escapedTeePill.indexOf('<img') === -1 && escapedTeePill.indexOf('&lt;img') !== -1, 'tee: HTML-метка экранируется');
const hostileTnId = "tn');alert(1);//";
const safeTnArg = sandbox.tnJsStr(hostileTnId);
check(safeTnArg.indexOf("'") === -1 && safeTnArg.indexOf('\\u0027') !== -1 && safeTnArg.indexOf('<') === -1, 'tournament: inline JS-аргумент экранирован');
const hostileInlineArg = "id\\\"');alert(1);//<tag>&\u2028\u2029";
const encodedInlineArg = sandbox.pestovoInlineJsArg(hostileInlineArg);
check(encodedInlineArg.indexOf("'") === -1 && encodedInlineArg.indexOf('"') === -1 &&
    vm.runInContext("'" + encodedInlineArg + "'", sandbox) === hostileInlineArg, 'inline JS-аргумент безопасен и восстанавливается без потерь');

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

// ── v1.55.0: заголовок группы — название ИЛИ бейджи, без дубля ──
// Название «Мужчины 0–12» уже содержит пол и диапазон: бейджи HCP/пол
// рядом двоили информацию — показываем только название.
var headNamed = sandbox.tnGroupHeadHtml({ div: { id: 'm1', name: 'Мужчины 0–12', gender: 'men', hcpFrom: 0, hcpTo: 12, tee: 'wh' }, list: [1] }, false);
check(headNamed.indexOf('Мужчины 0–12') !== -1, 'group head: название группы');
check(headNamed.indexOf('tn-group-badge') === -1, 'group head: с названием — без бейджей (HCP/пол/ТИ)');
// Группа без названия — показываем бейджи (есть что показать).
var headUnnamed = sandbox.tnGroupHeadHtml({ div: { id: 'x', name: '', gender: 'women', hcpFrom: 0, hcpTo: 36, tee: 'rd' }, list: [1, 2] }, false);
check(headUnnamed.indexOf('tn-group-badge') !== -1 && headUnnamed.indexOf('HCP 0.0–36.0') !== -1, 'group head: без названия — бейдж HCP');
check(headUnnamed.indexOf('Девушки') !== -1, 'group head: без названия — бейдж пола');

// ── v1.56.0: бейдж «гость» убран везде ──
var guestLine = sandbox.tnRosterPlayerLine({ rp: { name: 'Иванов Иван', uid: 'guest_x1', guest: true, handicap: 12 }, pid: 'guest_x1', effHcp: 12 }, 0, 2, false);
check(guestLine.indexOf('tn-guest-chip') === -1, 'roster: бейдж «гость» убран (нет tn-guest-chip)');
check(guestLine.indexOf('гость') === -1 && guestLine.indexOf('guest') === -1, 'roster: текст «гость»/«guest» не выводится');

console.log(failures ? '\n' + failures + ' FAILURES' : '\nAll tournaments cut tests passed ✔');
process.exit(failures ? 1 : 0);
