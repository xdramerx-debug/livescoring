// Проверки общего ядра публичных таблиц счёта и результатов турниров.
'use strict';

var C = require('../js/tn-studio-core.js');
var failures = 0, total = 0;
function eq(actual, expected, label) {
    total++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures++;
        console.error('FAIL', label, '\n  actual:  ', JSON.stringify(actual), '\n  expected:', JSON.stringify(expected));
    } else console.log('ok  -', label);
}
function check(condition, label) {
    total++;
    if (!condition) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}

eq(C.formatIso('2026-09-19'), '19.09.2026', 'дата для публичной карточки');
eq(C.formatIso('not-a-date'), '', 'некорректная дата не форматируется');
eq(C.normalizeName('Ёлкин  ИВАН'), 'елкин иван', 'нормализация имени');
eq(C.listOf({ a: { name: 'Иван' }, b: { name: 'Мария' } }).map(function (x) { return x._key; }), ['a', 'b'], 'Firebase map превращается в список с ключами');
eq(C.listOf(null), [], 'пустой список безопасен');

var divisions = {
    men: { format: 'stroke', tee: 'wh', members: { p1: true } },
    women: { format: 'stableford', tee: 'rd', members: { p2: true } }
};
eq(C.divisionOf('p1', divisions), 'men', 'игрок сопоставляется зачёту');
eq(C.divisionOf('missing', divisions), null, 'игрок без зачёта');
eq(C.courseHandicap(31.6, { cr: 75.2, sr: 136 }, 72), 41, 'course handicap учитывает рейтинг поля');
eq(C.courseHandicap('+1', null, 72), 1, 'course handicap без рейтинга округляет HI');
eq(C.strokesOnHole(5, 41), 3, 'положительная фора на SI 5');
eq(C.strokesOnHole(18, 41), 2, 'положительная фора на SI 18');
eq(C.strokesOnHole(18, -2), -1, 'плюсовой HI отнимает удар на самой лёгкой лунке');
eq(C.stableford(4, 4, 0), 2, 'гросс-пар даёт два очка');
eq(C.stableford(4, 4, 1), 3, 'нетто-бёрди даёт три очка');
eq(C.stableford('', 4, 0), null, 'пустой счёт не считается');
eq(C.scoreAt({ 1: '4', 2: '', 3: '0' }, 1), 4, 'числовой счёт читается');
eq(C.scoreAt({ 1: '4', 2: '', 3: '0' }, 2), null, 'пустой счёт пропускается');

var course = {
    par: function () { return 4; },
    dist: function (hole) { return 300 + hole; },
    si: function (hole) { return hole; }
};
var card = C.playerCard({ 1: 4, 2: 6 }, course, 'wh', 1);
eq(card.holes[0].recv, 1, 'карточка считает фору на лунке');
eq(card.holes[0].ptsGross, 2, 'карточка считает gross stableford');
eq(card.holes[0].ptsNet, 3, 'карточка считает net stableford');
eq(card.all.gross.total, 10, 'сумма ударов считает сыгранные лунки');
eq(card.all.gross.played, 2, 'количество сыгранных лунок');
eq(card.all.ptsNet.total, 3, 'сумма очков считает заполненные лунки');
eq(card.out.dist, 2745, 'длины первой девятки складываются');
eq(card.inn.gross.total, null, 'пустая девятка не выдаёт нулевой результат');

var noScores = C.playerCard({}, course, 'wh', 0);
eq(noScores.all.gross.total, null, 'пустая карточка остаётся без результата');
var first = C.playerCard({ 1: 5, 2: 4 }, course, 'wh', 0);
var second = C.playerCard({ 1: 4, 2: 6 }, course, 'wh', 0);
eq(C.betterBall([first, second]), { gross: 8, played: 2 }, 'форбол выбирает лучший счёт на каждой сыгранной лунке');

eq(C.formatId({ fourBall: true }, { format: 'Stroke Play' }), 'fourball', 'форбол задаётся форматом турнира');
eq(C.formatId(null, { format: 'Stroke Play (Gross)' }), 'stroke', 'формат на счёт ударов определяется');
eq(C.formatId(null, { format: 'Match Play 1v1' }), 'stableford', 'неизвестный формат не считается stroke');
eq(C.formatId(null, {}), 'stableford', 'формат по умолчанию — Stableford');
eq(C.fmtHcp('+1'), '+1,0', 'плюсовой HI форматируется');
eq(C.fmtHcp('14'), '14,0', 'положительный HI форматируется');
eq(C.hcpLabel('+1', '14'), '+1,0 – 14,0', 'диапазон HCP для публичного зачёта');

['matchUsers', 'namesFromSheet', 'rosterRowsFromSheet', 'findStart', 'legacyFormats'].forEach(function (name) {
    check(typeof C[name] === 'undefined', name + ' не входит в публичное ядро');
});

console.log('\n' + (total - failures) + '/' + total + ' passed');
if (failures) process.exit(1);
