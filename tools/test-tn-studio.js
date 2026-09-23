// Проверки вкладки «Турниры · создание»: даты, состав, фора, стейблфорд, видимость.
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
function check(cond, label) {
    total++;
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}

eq(C.formatRange('2026-09-19', '2026-09-19'), '19.09.2026–19.09.2026', 'однодневный турнир пишется двумя датами');
eq(C.formatRange('2026-09-19', '2026-09-21'), '19.09.2026–21.09.2026', 'диапазон дат');
check(C.overlaps('2026-09-19', '2026-09-19', '2026-09-01', '2026-09-30'), 'фильтр дат включает день внутри окна');
check(!C.overlaps('2026-09-19', '2026-09-19', '2026-09-20', '2026-09-30'), 'фильтр отсекает день до окна');
check(C.isPublic({ name: 'старый' }) && !C.isPublic({ publicAccess: false }), 'скрыт только явный отказ, старые турниры видны');

var users = {
    a: { name: 'Дьяченко Юлия Сергеевна', handicap: 31.6, gender: 'women' },
    b: { name: 'Гаранов Александр', handicap: 13.8, gender: 'men' },
    c: { name: 'Гаранов Дмитрий', handicap: 11.7, gender: 'men' }
};
eq(C.matchUsers('Юлия Сергеевна Дьяченко', users).status, 'one', 'ФИО находится при другом порядке слов');
eq(C.matchUsers('Юлия Сергеевна Дьяченко', users).users[0].id, 'a', 'найденный игрок — Юлия');
eq(C.matchUsers('Гаранов', users).status, 'short', 'одной фамилии мало');
eq(C.matchUsers('Нет Такого', users).status, 'none', 'чужой не создаётся');
eq(C.namesFromSheet([['ФИО', 'HI'], ['Гаранов Александр', '13,8'], ['', '1']]), ['Гаранов Александр'], 'из Excel берётся колонка ФИО');

var course = {
    par: function (h) { return h === 1 ? 4 : 4; },
    dist: function () { return 317; },
    si: function (h) { return h === 1 ? 5 : 18; },
    rating: function () { return { cr: 75.2, sr: 136 }; }
};
eq(C.courseHandicap(31.6, { cr: 75.2, sr: 136 }, 72), 41, 'CH Юлии на красных: 41');
eq(C.strokesOnHole(5, 41), 3, 'на лунке SI 5 при CH 41 три удара форы');
eq(C.strokesOnHole(18, 41), 2, 'на лёгкой лунке при CH 41 два удара форы');
eq(C.stableford(7, 4, 3), 2, 'нетто-пар на первой лунке даёт 2 очка');
eq(C.stableford(5, 4, 0), 1, 'гросс-богги даёт 1 очко');

var card = C.playerCard({ 1: 7, 2: 5 }, course, 'rd', 41);
eq(card.holes[0].ptsNet, 2, 'карточка считает нетто-очки');
eq(card.holes[0].ptsGross, 0, 'три свыше пара без форы — 0 гросс-очков');
eq(card.all.gross.total, 12, 'итог ударов считается только по заполненным лункам');

var low = C.playerCard({ 1: 4 }, course, 'bl', 0);
var high = C.playerCard({ 1: 6 }, course, 'bl', 0);
eq(C.betterBall([low, high]).gross, 4, 'форбол берёт лучший мяч на лунке');

var divisions = { m: { format: 'stroke', tee: 'bl', members: { p1: true } }, w: { format: 'stableford', tee: 'rd', members: {} } };
eq(C.legacyFormats({ fourBall: true }, divisions), ['Four-ball'], 'форбол — формат всего турнира');
eq(C.legacyFormats({ fourBall: false }, divisions).sort(), ['Stableford', 'Stroke Play (Gross)'], 'зачёты отдают свои форматы на сайт');
eq(C.formatId(null, { format: 'Stroke Play (Gross)' }), 'stroke', 'классический строковый формат гросс читается');
eq(C.formatId(null, { format: 'Match Play 1v1' }), 'stableford', 'незнакомый классический формат — не гросс');
eq(C.formatId(null, { format: '' }), 'stableford', 'пустой формат — стейблфорд');
eq(C.legacyFormats({ formats: ['Match Play 1v1'] }, { d: { format: 'Match Play 1v1' } }), ['Match Play 1v1'], 'классический формат не затирается студийным');
eq(C.legacyFormats({ formats: ['Stableford'] }, {}), ['Stableford'], 'без зачётов форматы турнира не трогаем');
eq(C.divisionOf('p1', divisions), 'm', 'игрок лежит в одном зачёте');
eq(C.unassigned({ p2: { name: 'Свободный' } }, divisions).length, 1, 'без группы — кто не назначен');
eq(C.hcpLabel('+1', '14'), '+1,0 – 14,0', 'подпись диапазона HCP');

var sheet = C.rosterRowsFromSheet([
    { 'ФИО': 'Стриганова Елена', 'HCP': '12,9', 'Пол': 'жен', 'ТИ': 'красные' },
    { 'ФИО': 'Гость Иван', 'Гандикап': '60', 'Пол': 'муж', 'ТИ': 'wh' },
    { 'Name': 'No Handicap', 'HCP': '', 'Gender': 'w', 'Tee': 'blue' }
]);
eq(sheet.players.length, 2, 'из файла берутся две годные строки');
eq(sheet.players[0].tee, 'rd', 'красные ти читаются как rd');
eq(sheet.players[0].gender, 'women', 'жен. пол читается');
eq(sheet.players[0].handicap, 12.9, 'HCP с запятой');
eq(sheet.invalid.length, 1, 'HCP вне диапазона пропускается');
eq(sheet.players[1].gender, 'women', 'w — женский пол');
eq(sheet.players[1].tee, 'bl', 'blue — синие ти');
eq(C.rosterRowsFromSheet([{ 'ФИО': 'Иванов Иван', 'Рейтинг': '75,2', 'ТИ': 'белые' }]).players[0].tee, 'wh', 'колонка рейтинга не затирает ти');
var many = [];
for (var i = 0; i < 501; i++) many.push({ ФИО: 'Игрок ' + i, HCP: '10' });
eq(C.rosterRowsFromSheet(many).truncated, true, 'больше 500 строк обрезается');
eq(C.shortName({ lastName: 'Стриганова', firstName: 'Елена', middleName: 'Николаевна' }), 'Стриганова Елена', 'короткое имя — фамилия и имя');
eq(C.clockLabel('11:00'), '11:00', 'время старта как на карточке');
eq(C.slashMarks(2), '//', 'фора печатается чертами');

var protocols = {
    old: { tournamentId: 't1', date: '2026-09-19', createdAt: 1, groups: { g1: {
        roundId: 'r-old', startHole: 1, startTime: '09:00', players: [{ id: 'p1', lastName: 'Стриганова', firstName: 'Елена' }], markers: []
    } } },
    day: { tournamentId: 't1', date: '2026-09-20', createdAt: 2, groups: { g1: {
        roundId: 'r1', startHole: 10, startTime: '11:00', format: 'Stableford',
        players: [
            { id: 'uid-e', lastName: 'Стриганова', firstName: 'Елена' },
            { id: 'uid-d', lastName: 'Голицына', firstName: 'Дарья' }
        ],
        markers: [{ markerId: 'uid-d', targetId: 'uid-e', markerName: 'Дарья Голицына', targetName: 'Елена Стриганова' }]
    } } }
};
var slot = C.findStart(protocols, 't1', { _key: 'push', uid: 'uid-e', name: 'Елена Стриганова' }, '2026-09-20');
eq(slot && slot.roundId, 'r1', 'карточка берёт стартовый лист этого дня');
eq(slot && slot.startHole, 10, 'стартовая лунка из группы');
eq(slot && slot.marker && slot.marker.id, 'uid-d', 'QR принадлежит маркеру, а не игроку');
eq(slot && slot.marker.name, 'Голицына Дарья', 'имя маркера — фамилия и имя');
eq(C.findStart(protocols, 't1', { uid: 'missing' }, '2026-09-20'), null, 'без группы карточку не из чего печатать');

console.log('\n' + (total - failures) + '/' + total + ' passed');
if (failures) process.exit(1);
