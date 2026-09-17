// Автотесты турнирного движка (запуск: node tools/test-tn-engine.js)
// Проверяется js/tn-engine.js: WHS-гандикап, Stableford (в т.ч. редактируемая
// таблица), Modified Stableford, Net Double Bogey, Match Play, Skins,
// тай-брейки (countback/last-hole/SI), флайты, tee times (shotgun/tee-times/
// two-tee), re-pairing, cut (top-N + ties), лидерборд, экспорт и печать.
'use strict';

var M = require('../js/tn-engine.js');
var TnEngine = M.TnEngine, TN_CONFIG = M.TN_CONFIG;
var H = TnEngine.Handicap, S = TnEngine.Scoring, TB = TnEngine.TieBreak,
    P = TnEngine.Pairing, C = TnEngine.Cut, L = TnEngine.Leaderboard, X = TnEngine.Exporters;

var failures = 0, total = 0;
function eq(actual, expected, label) {
    total++;
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e); }
    else console.log('ok  -', label);
}
function check(cond, label) {
    total++;
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}

// Тестовое поле: 18 лунок, пар 72, SI ↔ номер лунки, пара-3 на 3/9/12/16
var HOLES = [];
(function () {
    var pars = [4, 5, 3, 4, 4, 5, 4, 4, 3, 4, 4, 3, 5, 4, 4, 3, 5, 4];
    for (var i = 0; i < 18; i++) HOLES.push({ num: i + 1, par: pars[i], si: i + 1, yards: { wh: 400, rd: 340 } });
})();
var COURSE = { holes: HOLES };
check(TnEngine.utils.coursePar(COURSE) === 72, 'тестовое поле: пар 72');

console.log('\n=== HandicapService (WHS) ===');
// WHS: CH = HI × (Slope/113) + (CR − Par)
eq(H.courseHandicap(15.6, { slope: 131, cr: 72.4, par: 72 }), 18, 'WHS CH: 15.6 × 131/113 + 0.4 = 18');
eq(H.courseHandicap(10.0, { slope: 113, cr: 72, par: 72 }), 10, 'WHS CH: slope 113, CR=par → CH = HI');
eq(H.courseHandicap(24.0, { slope: 125, cr: 71.9, par: 72 }), 26, 'WHS CH: 24 × 125/113 − 0.1 ≈ 26');
// PH = CH × allowance, округление .5 вверх
eq(H.playingHandicap(10.0, { slope: 113, cr: 72, par: 72 }, 95), 10, 'PH: 10 × 95% = 10 (9.5 → 10)');
eq(H.playingHandicap(15.6, { slope: 131, cr: 72.4, par: 72 }, 95), 17, 'PH: 18 × 95% = 17');
// Cap применяется к индексу до расчёта
eq(H.playingHandicap(30.0, { slope: 113, cr: 72, par: 72 }, 100, 24), 24, 'PH cap: 30 → cap 24');
// Распределение ударов форы: PH 20 → +2 на SI 1..2, +1 на остальные
var alloc20 = H.strokesAllocation(20, HOLES);
eq(alloc20[1], 2, 'alloc(20): лунка SI1 получает 2 удара');
eq(alloc20[3], 1, 'alloc(20): лунка SI3 получает 1 удар');
var allocSum = 0; Object.keys(alloc20).forEach(function (k) { allocSum += alloc20[k]; });
eq(allocSum, 20, 'alloc(20): сумма ударов = 20');
// Плюсовой гандикап отдаёт удары на самых сложных (большие SI)
var allocMinus = H.strokesAllocation(-2, HOLES);
eq([allocMinus[18], allocMinus[17], allocMinus[1]], [-1, -1, 0], 'alloc(−2): отдаёт на SI 18 и 17');
// Командный гандикап (scramble): 25/20/15/10% от низшего
eq(H.teamHandicap([8, 12, 18, 24], [25, 20, 15, 10]), 9.5, 'team hcp: 8×.25+12×.2+18×.15+24×.1 = 9.5');
// Net Double Bogey — максимум WHS
eq(H.netDoubleBogey(4, 1), 7, 'NDB: par 4 + 2 + 1 форы = 7');
eq(H.netDoubleBogey(3, 0), 5, 'NDB: par 3 без форы = 5');

console.log('\n=== ScoringService ===');
// holesResult: gross → net/points (PH 18 → 1 удар на каждой лунке)
var hr1 = S.holeResult(5, HOLES[0], 1, {}); // par4, gross5, 1 удар форы → net 4 (пар нетто) → 2 очка
eq([hr1.net, hr1.toPar, hr1.points], [4, 1, 2], 'hole: gross 5 на par4 (1 фора) → net 4, 2 очка Stableford');
var hr2 = S.holeResult(9, HOLES[0], 1, { maxScoreMode: 'netdb' }); // NDB=7 → считается 7, net 6 → 0 очков
eq([hr2.counted, hr2.net, hr2.points], [7, 6, 0], 'Net Double Bogey режет 9 → 7');
var hr3 = S.holeResult(3, HOLES[0], 1, {}); // birdie нетто (net 2) → 4 очка
eq(hr3.points, 4, 'net eagle? нет: net 2 = eagle нетто → 4 очка? (орёл −2)');
// редактируемая таблица: удвоенные очки за бёрди
var customTable = { 'lte-4': 6, '-3': 5, '-2': 4, '-1': 6, '0': 2, '+1': 1, 'gte+2': 0 };
var hr4 = S.holeResult(3, HOLES[0], 0, {}); // gross 3 на par4 → toPar −1 (бёрди)
eq(hr4.points, 3, 'gross 3 на par4 без форы → 3 очка (бёрди) по классическому Stableford');
// Modified Stableford: бёрди +2, боги −1
var hr5 = S.holeResult(3, HOLES[0], 0, {}); // бёрди
var hr6 = S.holeResult(5, HOLES[0], 0, {}); // боги
eq([hr5.modifiedPoints, hr6.modifiedPoints], [2, -1], 'Modified: бёрди +2 / боги −1');
// кастомная таблица Stableford применяется
eq(S.pointsForToPar(-1, customTable), 6, 'кастомная таблица: бёрди = 6 очков');
// Match Play
eq(S.matchScore(
    [{ net: 4 }, { net: 4 }, { net: 3 }],
    [{ net: 5 }, { net: 4 }, { net: 5 }]
).status, '2 up', 'match: выигрыш 2 up на полной дистанции (2:1 по лункам)');
var mp = S.matchScore(
    [{ net: 3 }, { net: 3 }, { net: 3 }, { net: 4 }],
    [{ net: 4 }, { net: 4 }, { net: 5 }, { net: 4 }]
);
eq([mp.closed, mp.status], [true, '3&1'], 'match: 3 up за 1 лунку → 3&1 (досрочно)');
eq(S.matchScore([{ net: 4 }, { net: 4 }], [{ net: 4 }, { net: 4 }]).status, 'AS', 'match: ничья → AS');
// Skins carry-over: 2 лунки переносятся, 3-ю забирает игрок 0
var sk = S.skinsScore([[4, 5, 4], [3, 3, 4], [5, 6, 7]], 3);
eq([sk.skinsPerPlayer[0], sk.carriedSkins], [3, 0], 'skins: carry-over 2 → победитель 3-й лунки берёт 3');
// Best Ball: лучший net команды
var BB = S.STRATEGIES['best-ball'];
eq(BB.teamHole([{ net: 5 }, { net: 3 }, { net: 4 }]), 3, 'best ball: min net = 3');

console.log('\n=== TieBreakService ===');
// countback: разные последние 9 лунок
var scA = HOLES.map(function (h, i) { return { num: h.num, par: h.par, si: h.si, value: i >= 9 ? 5 : 4 }; });
var scB = HOLES.map(function (h, i) { return { num: h.num, par: h.par, si: h.si, value: i >= 9 ? 4 : 4 }; });
check(TB.compare(scA, scB, ['countback']) > 0, 'countback: худшие последние 9 → больше (хуже)');
check(TB.compare(scB, scA, ['countback']) < 0, 'countback: зеркально — меньше (лучше)');
// последняя лунка
var scC = HOLES.map(function (h, i) { return { num: h.num, par: h.par, si: h.si, value: i === 17 ? 3 : 4 }; });
check(TB.compare(scC, scB, ['last-hole']) < 0, 'last-hole: 3 на последней лунке лучше 4');
// stroke index: сравнение на самой сложной лунке (SI=1)
var scD = HOLES.map(function (h, i) { return { num: h.num, par: h.par, si: h.si, value: i === 0 ? 3 : 4 }; });
check(TB.compare(scD, scB, ['stroke-index']) < 0, 'SI: лучший счёт на SI=1 выигрывает');
// ничья сохраняется при полном равенстве
check(TB.compare(scB.slice(), scB.slice(), ['countback', 'last-hole']) === 0, 'полное равенство → 0 (ничья)');

console.log('\n=== PairingService ===');
var players8 = [];
for (var pi = 0; pi < 8; pi++) players8.push({ id: 'p' + pi, name: 'P' + pi, handicap: pi * 3, rating: 1000 + pi * 50, age: 20 + pi * 5, gender: pi % 2 ? 'women' : 'men' });
var fl = P.makeFlights(players8, { by: 'handicap', flightSize: 4 });
eq([fl.length, fl[0].length, fl[0][0].handicap], [2, 4, 0], 'флайты по hcp: 2 флайта, лучший в первом');
var flRnd = P.makeFlights(players8, { by: 'random', seed: 42, flightSize: 4 });
var flRnd2 = P.makeFlights(players8, { by: 'random', seed: 42, flightSize: 4 });
eq(flRnd.map(function (f) { return f.map(function (p) { return p.id; }); }),
   flRnd2.map(function (f) { return f.map(function (p) { return p.id; }); }),
   'random-флайты детерминированы по seed');
eq(flRnd.reduce(function (s, f) { return s + f.length; }, 0), 8, 'random: все 8 игроков на месте');
var groups = P.makeGroups(players8, 3);
eq([groups.length, groups[0].length, groups[2].length], [3, 3, 2], 'группы по 3: 3-3-2');
// tee times
var tt = P.buildTeeTimes(groups, { startType: 'tee-times', firstTime: '09:00', intervalMin: 10 });
eq([tt[0].time, tt[1].time, tt[2].startHole], ['09:00', '09:10', 1], 'tee-times: 09:00 / 09:10 / 09:20 с 1-й');
var sg = P.buildTeeTimes(groups, { startType: 'shotgun', firstTime: '10:00', holesCount: 18 });
eq([sg[0].startHole, sg[1].startHole, sg[2].startHole, sg[0].time], [1, 2, 3, '10:00'], 'shotgun: лунки 1-2-3, общее время');
var t2 = P.buildTeeTimes(groups, { startType: 'two-tee', firstTime: '09:00', intervalMin: 10 });
eq([t2[0].startHole, t2[1].startHole, t2[2].startHole, t2[2].time], [1, 10, 1, '09:10'], 'two-tee: чередование 1/10');
// re-pairing: лидеры стартуют последними
var lbRows = players8.map(function (p, i) { return { id: p.id, position: i + 1 }; });
var rp = P.rePairing(lbRows, 4);
eq([rp[0][0].position, rp[1][0].position], [5, 1], 're-pairing: лидеры в последней группе');

console.log('\n=== CutService ===');
var cutRows = lbRows.map(function (r, i) { return { id: r.id, value: 70 + i }; });
cutRows[2].value = 71; // ties на границе top-2
cutRows.sort(function (a, b) { return a.value - b.value; });
var cut = C.applyCut(cutRows, { topN: 2, includeTies: true });
eq([cut.kept.length, cut.cutScore], [3, 71], 'cut top-2 + ties: проходят 3 игрока');
var cutNoTies = C.applyCut(cutRows, { topN: 2, includeTies: false });
eq(cutNoTies.kept.length, 2, 'cut без ties: ровно 2');

console.log('\n=== LeaderboardService ===');
var lbPlayers = [
    { id: 'a', name: 'Игрок A', club: 'Пестово', hi: 10 },
    { id: 'b', name: 'Игрок B', club: 'Пестово', hi: 20 },
    { id: 'c', name: 'Игрок C', club: 'Завидово', hi: 5 }
];
var mkScores = function (delta) { return HOLES.map(function (h) { return h.par + delta; }); };
var lb = L.build(lbPlayers, [{ scores: { a: mkScores(0), b: mkScores(1), c: mkScores(-1) } }], {
    course: COURSE, system: 'stroke-net', tieMethods: ['countback']
});
eq(lb.map(function (r) { return r.position; }), [1, 2, 3], 'LB net: позиции 1-2-3');
eq(lb[0].name, 'Игрок C', 'LB net: лидер — игрок C (лучший net)');
eq(lb[0].thru, 18, 'LB: thru 18 после полного раунда');
// проекция == текущий toPar для stroke play
check(typeof L.projected(lb[0], COURSE, 'stroke-net') === 'number', 'проекция считается');
// stableford: направление «больше — лучше»
var lbStb = L.build(lbPlayers, [{ scores: { a: mkScores(0), b: mkScores(1), c: mkScores(-1) } }], {
    course: COURSE, system: 'stableford', tieMethods: ['countback']
});
eq(lbStb[0].name, 'Игрок C', 'LB Stableford: лидер — C (больше всех очков)');
check(lbStb[0].total > lbStb[1].total, 'LB Stableford: сортировка по убыванию очков');
// gross без гандикапа: порядок как по ударам
var lbG = L.build(lbPlayers, [{ scores: { a: mkScores(0), b: mkScores(1), c: mkScores(-1) } }], {
    course: COURSE, system: 'stroke-gross'
});
eq([lbG[0].gross, lbG[0].toPar], [54, -18], 'LB gross: par−1 на каждой из 18 лунок → 54 (−18)');
// ничья с равными карточками делит позицию
var tiePlayers = [{ id: 'x', name: 'X', hi: 10 }, { id: 'y', name: 'Y', hi: 10 }, { id: 'z', name: 'Z', hi: 10 }];
var lbTie = L.build(tiePlayers, [{ scores: { x: mkScores(0), y: mkScores(0), z: mkScores(2) } }], {
    course: COURSE, system: 'stroke-gross', tieMethods: ['countback']
});
eq([lbTie[0].position, lbTie[1].position, lbTie[2].position], [1, 1, 3], 'LB: делёж 1-го места → 1,1,3');

console.log('\n=== Exporters ===');
var csv = X.toCSV(lb, [
    { title: '#', value: 'position' },
    { title: 'Игрок', value: 'name' },
    { title: 'Итог', value: 'total' },
    { title: 'Строка с "кавычками"', value: function () { return 'a,b'; } }
]);
check(csv.charCodeAt(0) === 0xFEFF, 'CSV: BOM для Excel');
check(csv.indexOf('Игрок C') !== -1, 'CSV: лидер присутствует');
check(csv.indexOf('"a,b"') !== -1, 'CSV: ячейка с запятой экранирована кавычками');
var scHtml = X.scorecardHtml(COURSE, [{ id: 'a', name: 'Тест Тестов', hi: 10 }], {
    brand: { name: 'Пестово', date: '01.09.2026' }, title: 'Scorecard', allowancePct: 100
});
check(scHtml.indexOf('Scorecard') !== -1 && scHtml.indexOf('Par') !== -1, 'scorecard: заголовок и строка Par');
check(scHtml.indexOf('SI') !== -1 && scHtml.indexOf('Тест Тестов') !== -1, 'scorecard: SI и игрок');
check(scHtml.indexOf('Маркер') !== -1 && scHtml.indexOf('Игрок / Player') !== -1, 'scorecard: подписи маркера и игрока');
var ttHtml = X.teeTimesHtml(tt, groups, { brand: { name: 'Пестово' }, title: 'Tee Times' });
check(ttHtml.indexOf('09:10') !== -1 && ttHtml.indexOf('Tee Times') !== -1, 'tee times печать: времена в документе');
var lbHtml = X.leaderboardHtml(lb, { brand: { name: 'Пестово' }, title: 'Leaderboard' });
check(lbHtml.indexOf('Leaderboard') !== -1 && lbHtml.indexOf('Thru') !== -1, 'лидерборд печать: колонки');
var dipHtml = X.diplomaHtml([{ title: '1 место', playerName: 'Игрок C', result: '−1' }], { brand: { name: 'Пестово' } });
check(dipHtml.indexOf('Игрок C') !== -1 && dipHtml.indexOf('Директор турнира') !== -1, 'диплом: имя и подпись');
check(X.toJSON({ a: 1 }).indexOf('"a": 1') !== -1, 'JSON экспорт');

console.log('\n=== Справочник TN_CONFIG ===');
['tournamentTypes', 'categories', 'levels', 'teeBoxes', 'scoringSystems', 'handicapSystems',
 'tieBreaks', 'maxScoreModes', 'registrationMethods', 'officialRoles', 'nominations',
 'awardTypes', 'sponsorLevels', 'startTypes'].forEach(function (k) {
    check(Array.isArray(TN_CONFIG[k]) && TN_CONFIG[k].length > 0, 'справочник заполнен: ' + k);
});
check(TnEngine.cfgLabel(TN_CONFIG.teeBoxes, 'wh', 'ru') === 'Белые', 'cfgLabel RU');
check(TnEngine.cfgLabel(TN_CONFIG.teeBoxes, 'wh', 'en') === 'White', 'cfgLabel EN');
// все системы подсчёта из справочника имеют стратегию
check(TN_CONFIG.scoringSystems.every(function (s) { return !!S.STRATEGIES[s.id]; }), 'каждой системе подсчёта есть стратегия');
// каждый тай-брейк из справочника реализован
check(TN_CONFIG.tieBreaks.every(function (tb) { return !!TB.METHODS[tb.id]; }), 'каждому тай-брейку есть метод');

console.log('\n----------------------------------------');
console.log(total + ' проверок, ошибок: ' + failures);
process.exit(failures ? 1 : 0);
