// Тесты чистого ядра системы турниров (js/tn-mgr-core.js).
// Запуск: node tools/test-tn-mgr-core.js (входит в npm test).
'use strict';

var C = require('../js/tn-mgr-core.js');

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

// ----------------------------------------------------------
// 1. Справочник форматов
// ----------------------------------------------------------
var catalog = C.formatCatalog();
check(catalog.length >= 15, 'встроенный справочник форматов не пуст');
check(catalog.some(function (f) { return f.id === 'stableford'; }), 'в справочнике есть стэйблфорд');

var custom = C.formatCatalog({ 'Мой формат': true }, [{ id: 'custom-2', ru: 'Клубный формат', en: 'Club format' }]);
check(custom.some(function (f) { return f.ru === 'Мой формат'; }), 'справочник пополняется строкой из данных');
check(custom.some(function (f) { return f.id === 'custom-2' && f.en === 'Club format'; }), 'справочник пополняется объектом');
eq(C.formatId('Стэйблфорд (игра на очки)'), 'стэйблфорд-игра-на-очки', 'id формата строится из названия');
eq(C.guessScoring('Игра на счёт (гросс)'), 'gross', 'система скоринга определяется по названию');
eq(C.scoringLabel({ ru: 'Игра на счёт', scoring: 'net' }), 'Игра на счёт (нетто)', 'подпись системы скоринга');

// ----------------------------------------------------------
// 2. Поиск игроков RU/EN
// ----------------------------------------------------------
var ivanov = { fio: 'Иванов Иван Иванович', hi: 12.4, gender: 'men' };
var smirnova = { fio: 'Смирнова Наталия', gender: 'women' };
check(C.playerMatches(ivanov, 'иванов'), 'поиск по русской фамилии');
check(C.playerMatches(ivanov, 'Иван'), 'поиск с большой буквы');
check(C.playerMatches(ivanov, 'Ivanov'), 'латиница находит русскую фамилию');
check(C.playerMatches(ivanov, 'ivan'), 'частичная латиница находит фамилию');
check(C.playerMatches(smirnova, 'Smirnova N'), 'латиница находит женщину-игрока');
check(!C.playerMatches(ivanov, 'Петров'), 'чужая фамилия не находится');
check(C.playerMatches(ivanov, ''), 'пустой запрос показывает всех');
eq(C.searchPlayers([ivanov, smirnova], 'sm').length, 1, 'searchPlayers фильтрует список');
eq(C.translitEquals('Иванов', 'Ivanov'), true, 'транслитерация сравнивает ФИО');
eq(C.splitFio('Иванов Иван Иванович').lastName, 'Иванов', 'разбор ФИО: фамилия');
eq(C.splitFio('Смирнова Наталия').firstName, 'Наталия', 'разбор ФИО из двух слов');
eq(C.normalizeGender('Ж'), 'women', 'пол «Ж» нормализуется');
eq(C.genderLabel('women'), 'Женщины', 'подпись пола');

// ----------------------------------------------------------
// 3. Гандикап, фора, очки
// ----------------------------------------------------------
eq(C.courseHandicap(31.6, { cr: 75.2, sr: 136 }, 72), 41, 'course handicap по WHS');
eq(C.courseHandicap('+1', null, 72), 1, 'без рейтинга CH = округлённый HI');
eq(C.foreOnHole(5, 41), 3, 'фора на лунке с индексом 5');
eq(C.foreOnHole(18, 41), 2, 'фора на лунке с индексом 18');
eq(C.foreOnHole(18, -2), -1, 'плюсовой гандикап отнимает удар');
eq(C.stableford(4, 4, 0), 2, 'пар — два очка');
eq(C.stableford(4, 4, 1), 3, 'нетто-бёрди — три очка');
eq(C.stableford('', 4, 0), null, 'пустой счёт не считается');
eq(C.fmtHcp(-1.2), '+1,2', 'плюсовой гандикап форматируется');
eq(C.fmtHcp(12), '12', 'целое значение без запятой');

// ----------------------------------------------------------
// 4. Карточка игрока
// ----------------------------------------------------------
var course = {
    par: function (h) { return h === 3 ? 5 : 4; },
    si: function (h) { return h; },
    dist: function (h, tee) { return 100 + h; }
};
var card = C.playerCard({ 1: 4, 2: 6 }, course, 'wh', 1);
eq(card.holes.length, 18, 'карточка всегда 18 лунок');
eq(card.holes[0].fore, 1, 'фора на первой лунке');
eq(card.holes[0].grossPoints, 2, 'очки гросс');
eq(card.holes[0].netPoints, 3, 'очки нетто');
eq(card.holes[1].strokes, 6, 'удары читаются из данных');
eq(card.totals.total.strokes, 10, 'итог по сыгранным лункам');
eq(card.totals.total.played, 2, 'количество сыгранных лунок');
eq(card.totals.out.length > 0, true, 'первая девятка посчитана');
eq(C.playerCard({}, course, 'wh', 0).totals.total.strokes, null, 'пустая карточка без итога');
var overrideFores = C.playerCard({ 1: 5 }, course, 'wh', 0, { fores: { 1: 2 } });
eq(overrideFores.holes[0].fore, 2, 'ручная фора перекрывает расчёт');

// ----------------------------------------------------------
// 5. Создание турнира / раунда / группы / игрока
// ----------------------------------------------------------
var tournament = C.newTournament({ name: '  Кубок клуба ', startDate: '05.10.2026', startTime: '8:30', formats: ['Стэйблфорд', 'Игра на счёт', ''] });
eq(tournament.name, 'Кубок клуба', 'название нормализуется');
eq(tournament.startDate, '2026-10-05', 'дата переводится в ISO');
eq(tournament.date, '2026-10-05', 'дата дублируется для публичной страницы');
eq(tournament.startTime, '08:30', 'время старта нормализуется');
eq(tournament.formats, ['Стэйблфорд', 'Игра на счёт'], 'пустые форматы отбрасываются');
eq(tournament.source, 'tn-manager', 'маркер системы');

var round = C.newRound({ date: '2026-10-05', startTime: '9:00' });
eq(round.date, '2026-10-05', 'дата раунда');
eq(round.startTime, '09:00', 'время раунда');

var group = C.newGroup({ name: 'Группа A', hcpFrom: '0', hcpTo: '12.5', gender: 'М' });
eq(group.hcpFrom, 0, 'гандикап от — число');
eq(group.hcpTo, 12.5, 'гандикап до — число');
eq(group.gender, 'men', 'пол группы нормализуется');
eq(C.groupRangeText(group), '0 – 12,5', 'диапазон группы текстом');
check(C.groupMatchesPlayer(group, { hi: 10, ch: 12 }), 'игрок попадает в диапазон по CH');
check(!C.groupMatchesPlayer(group, { hi: 20, ch: 22 }), 'игрок вне диапазона');
eq(C.groupRangeText(C.newGroup({ name: 'Все' })), '—', 'группа без границ');

var player = C.newPlayer({ fio: 'Петров Пётр', hi: '15,4', gender: 'муж', source: 'excel' });
eq(player.fio, 'Петров Пётр', 'ФИО игрока');
eq(player.hi, 15.4, 'HI из строки с запятой');
eq(player.gender, 'men', 'пол игрока');
eq(player.lastName, 'Петров', 'фамилия разобрана');
eq(player.source, 'excel', 'источник игрока сохраняется');

// ----------------------------------------------------------
// 6. Стартовый лист
// ----------------------------------------------------------
var players = [];
for (var i = 1; i <= 7; i++) {
    players.push(C.newPlayer({ id: 'p' + i, fio: 'Игрок ' + i, hi: 10 - i, gender: i % 3 === 0 ? 'women' : 'men', tee: i % 2 ? 'wh' : 'bl' }));
}
players[0].ch = 5;
players[1].ch = 7;

var groups = [
    C.newGroup({ id: 'gA', name: 'Группа A', hcpFrom: 0, hcpTo: 12, members: { p1: true, p2: true } }),
    C.newGroup({ id: 'gB', name: 'Группа B', hcpFrom: 13, hcpTo: 30, members: {} })
];
var sheet = C.buildSheet({ players: players, groups: groups, firstTeeTime: '09:00', startInterval: 10, groupSize: 4, groupsPerFlight: 2, format: 'Стэйблфорд', tee: 'wh' });
eq(sheet.entries.length, 7, 'все игроки попадают в лист');
eq(sheet.groups.length, 3, 'две заданные группы + авто-группа остальных');
eq(sheet.entries[0].startTime, '09:00', 'время первой группы — время старта');
var secondGroupEntry = sheet.entries.filter(function (e) { return e.startTime === '09:10'; });
check(secondGroupEntry.length >= 1, 'следующая группа стартует через интервал');
eq(sheet.entries[0].position, 1, 'позиция внутри группы');
check(!!sheet.entries[0].markerPlayerId, 'маркер назначен автоматически');
eq(sheet.entries[0].markerPlayerId, sheet.entries[1].playerId, 'маркер — следующий игрок группы');
eq(sheet.entries[1].markerPlayerId, sheet.entries[0].playerId, 'последний игрок маркирует первого');
eq(sheet.entries[0].flight, 'A', 'первый флайт — A');
eq(sheet.entries[0].format, 'Стэйблфорд', 'формат турнира попадает в лист');
eq(sheet.validate || C.validateSheet(sheet.entries).length, 0, 'лист без дублей и пустых игроков');

var patched = C.applyEntryPatch({ entries: C.clone(sheet.entries) }, 'p1', { tee: 'bl', groupId: 'gB', playerName: 'Петров Пётр' });
eq(patched.entry.tee, 'bl', 'правка ТИ применяется');
eq(patched.sync.player.tee, 'bl', 'правка синхронизируется с игроком');
eq(patched.sync.player.groupId, 'gB', 'правка группы синхронизируется');
var recalc = C.recalcSheet(patched.sheet.entries);
eq(recalc[0].order, 1, 'пересчёт порядка начинает с 1');
check(C.validateSheet(recalc).length === 0, 'пересчёт не создаёт дублей');

// ----------------------------------------------------------
// 7. Результаты и места
// ----------------------------------------------------------
var rows = [
    { playerId: 'p1', playerName: 'А', card: C.playerCard({ 1: 4, 2: 5 }, course, 'wh', 0), ch: 0 },
    { playerId: 'p2', playerName: 'Б', card: C.playerCard({ 1: 5, 2: 5 }, course, 'wh', 0), ch: 0 },
    { playerId: 'p3', playerName: 'В', card: C.playerCard({}, course, 'wh', 0), ch: 0 }
];
var results = C.buildResults(rows, 'stableford');
eq(results[0].points, 3, 'очки стабилфорда считаются по лункам');
eq(results[0].gross, 9, 'гросс считается по лункам');
eq(results[2].value, null, 'игрок без ударов не имеет результата');
var placed = C.assignPlaces(results, 'stableford');
eq(placed[0].place, 1, 'первое место у лучшего результата');
eq(placed[1].place, 2, 'второе место');
eq(placed[2].place, '', 'место не присваивается без результата');
check(C.isPodium(1) && C.isPodium(3) && !C.isPodium(4), 'пьедестал — 1..3');
var tie = C.assignPlaces([
    { playerId: 'a', playerName: 'A', value: 20, holesPlayed: 18 },
    { playerId: 'b', playerName: 'B', value: 20, holesPlayed: 18 },
    { playerId: 'c', playerName: 'C', value: 15, holesPlayed: 18 }
], 'stableford');
eq(tie.map(function (r) { return r.place; }), [1, 1, 3], 'ничьи делят место');
eq(C.sortRows(results, 'points', 'desc')[0].playerId, 'p1', 'ручная сортировка по очкам');
var manual = C.applyResultOverrides(results, { p2: { gross: 60, points: 40, status: 'DQ' } });
eq(manual[1].gross, 60, 'ручная правка счёта организатором');
eq(manual[1].status, 'DQ', 'статус игрока сохраняется');

// ----------------------------------------------------------
// 8. Импорт участников
// ----------------------------------------------------------
var aoa = [
    ['ФИО', 'Гандикап', 'Пол', 'ТИ', 'Группа'],
    ['Иванов Иван', '12,4', 'муж', 'Белый', 'A'],
    ['Smirnova Natalia', '24.0', 'жен', 'Красный', 'B'],
    ['', '10', 'муж', 'Синий', 'A']
];
var parsed = C.parseParticipants(aoa);
eq(parsed.players.length, 2, 'строки без ФИО пропускаются');
eq(parsed.players[0].hi, 12.4, 'гандикап из Excel с запятой');
eq(parsed.players[0].groupId, '', 'группа из импорта не подставляется как id');
eq(parsed.players[0].groupName, 'A', 'название группы из импорта сохраняется');
eq(parsed.players[1].gender, 'women', 'пол из Excel');
eq(parsed.issues.length, 1, 'проблемные строки попадают в issues');
var dup = C.parseParticipants([['ФИО', 'Гандикап'], ['Иванов Иван', '10'], ['Иванов Иван', '11']]);
eq(dup.issues.length, 1, 'дубли ФИО отмечаются');
var noHeader = C.parseParticipants([['Петров Пётр', '15'], ['Сидоров Семён', '20']]);
eq(noHeader.players.length, 2, 'таблица без заголовков разбирается по содержимому');
eq(noHeader.players[0].hi, 15, 'гандикап из второй колонки');
eq(C.parseDelimited('ФИО\tГандикап\nИванов Иван\t12').length, 2, 'вставленный текст разбирается по табуляции');

// ----------------------------------------------------------
// 9. Экспорт: строки и печатные документы
// ----------------------------------------------------------
eq(C.csvFromRows([['a;b', 'c']]), '"a;b";c', 'CSV экранирует разделитель');
eq(C.csvFromRows([['=SUM(A1)', 'x']]), "'=SUM(A1);x", 'CSV защищает от формул Excel');
eq(C.participantsRows(parsed.players, 'ru')[0][0], '№', 'заголовок таблицы участников (RU)');
eq(C.participantsRows(parsed.players, 'en')[0][1], 'Name', 'заголовок таблицы участников (EN)');
eq(C.participantsRows(parsed.players, 'ru').length, 3, 'строка на каждого участника');
eq(C.participantsCounts([{ gender: 'men' }, { gender: 'women' }, { gender: 'men' }]), { total: 3, men: 2, women: 1 }, 'счётчики участников');
eq(C.sheetRows(sheet.entries, 'ru').length, 8, 'стартовый лист выгружается построчно');
eq(C.resultsRows(placed, 'ru').length, 4, 'результаты выгружаются построчно');
eq(C.scoreRows(players.slice(0, 2), { p1: card }, course, 'ru').length >= 6, true, 'счёт раунда выгружается с лунками');
eq(C.headerRow('playerCard', 'ru').length, 8, 'в карточке игрока 8 колонок');
eq(C.teeName('wh', 'en'), 'White', 'ТИ переводится');
eq(C.sourceLabel('excel', 'ru'), 'Excel', 'источник участника');

var sheetDoc = C.sheetHtml({ tournamentName: 'Кубок клуба', roundDate: '2026-10-05', course: 'Пестово', entries: sheet.entries.map(function (e) { return Object.assign({}, e, { scoreUrl: C.scoreUrl('https://x/', 'r1', e.playerId) }); }), lang: 'ru' });
check(sheetDoc.indexOf('<!doctype html>') === 0, 'PDF стартового листа — цельный документ');
check(sheetDoc.indexOf('Кубок клуба') !== -1, 'в PDF есть название турнира');
check(sheetDoc.indexOf('Стартовый лист') !== -1, 'в PDF есть заголовок');
check(sheetDoc.indexOf('setup-round.html?round=r1') !== -1, 'в PDF есть QR-ссылка на ввод счёта');
check(sheetDoc.indexOf('Флайт A') !== -1, 'в PDF есть флайты');
var participantsDoc = C.participantsHtml({ players: parsed.players, title: 'Гольфисты', meta: ['Кубок клуба'], lang: 'ru' });
check(participantsDoc.indexOf('Всего: 2') !== -1, 'в PDF участников есть счётчики');
var resultsDoc = C.resultsHtml({ rows: placed, tournamentName: 'Кубок', lang: 'ru' });
check(resultsDoc.indexOf('podium-1') !== -1, 'в PDF результатов призёры выделены');
var cardDoc = C.playerCardHtml({ player: players[0], card: card, lang: 'ru' });
check(cardDoc.indexOf('Очки нетто') !== -1, 'в PDF карточки есть колонка очков нетто');
check(cardDoc.indexOf('Пар поля') !== -1, 'в PDF карточки указан пар поля');
var roundDoc = C.roundScoreHtml({ players: players.slice(0, 2), cards: { p1: card }, course: course, roundDate: '2026-10-05', lang: 'ru' });
check(roundDoc.indexOf('Длина') !== -1 && roundDoc.indexOf('Индекс') !== -1, 'в PDF раунда есть строки длина/пар/индекс');

// ----------------------------------------------------------
// 9b. Поле по умолчанию (фолбэк без js/course-config.js)
// ----------------------------------------------------------
var defCourse = C.defaultCourse();
eq(defCourse.par(3), 5, 'пар лунки по умолчанию');
eq(defCourse.si(1), 5, 'индекс сложности по умолчанию');
check(defCourse.dist(1, 'wh') === 328, 'длина лунки для белых ТИ');
check(defCourse.dist(3, 'bk') > defCourse.dist(3, 'rd'), 'чёрные ТИ длиннее красных');
check(C.playerCard({ 1: 4 }, defCourse, 'wh', 0).holes[0].length === 328, 'карточка игрока берёт длину из поля по умолчанию');

// ----------------------------------------------------------
// 10. QR и ссылки
// ----------------------------------------------------------
check(C.scoreUrl('https://club.example/', 'r1', 'p1', 4).indexOf('setup-round.html?round=r1&as=p1') !== -1, 'групповой QR ведёт в счётную карточку');
check(C.scoreUrl('https://club.example/', 'r1', 'p1', 1).indexOf('scorer.html?round=r1&player=p1') !== -1, 'одиночный QR ведёт в одиночную карточку');
check(C.qrImageUrl('https://x/?a=1', 200).indexOf('size=200x200') !== -1, 'URL картинки QR с нужным размером');

// ----------------------------------------------------------
console.log('\n' + (failures ? 'FAILED: ' : '') + total + ' проверок, ' + failures + ' ошибок');
process.exit(failures ? 1 : 0);
