// Автотесты чистой логики js/start-admin.js (запуск: node tools/test-start-admin.js)
// Проверяются: разбор ФИО, распределение на группы, расписание стартов, маркеры.
'use strict';
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(__dirname + '/../js/start-admin.js', 'utf8');
const sandbox = { console, Date, Math, JSON, parseInt, parseFloat, isFinite, isNaN, String, Number, Array, Object, setTimeout, clearTimeout, URLSearchParams: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

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

// ── psSplitFio ──
eq(sandbox.psSplitFio('Тестов Иван Петрович'), { lastName: 'Тестов', firstName: 'Иван', middleName: 'Петрович' }, 'split: Фамилия Имя Отчество');
eq(sandbox.psSplitFio('Иван Петрович Тестов'), { lastName: 'Тестов', firstName: 'Иван', middleName: 'Петрович' }, 'split: Имя Отчество Фамилия');
eq(sandbox.psSplitFio('Тестов Иван'), { lastName: 'Тестов', firstName: 'Иван', middleName: '' }, 'split: Фамилия Имя');
eq(sandbox.psSplitFio('Иван Тестов'), { lastName: 'Тестов', firstName: 'Иван', middleName: '' }, 'split: Имя Фамилия');
eq(sandbox.psSplitFio('Смирнова Мария'), { lastName: 'Смирнова', firstName: 'Мария', middleName: '' }, 'split жен. фамилия первая');
eq(sandbox.psSplitFio('Александр'), { lastName: '', firstName: 'Александр', middleName: '' }, 'split одно слово');
eq(sandbox.psSplitFio('ван дер Берг Иван'), { lastName: 'ван дер Берг', firstName: 'Иван', middleName: '' }, 'split частицы в начале');
eq(sandbox.psSplitFio('Иван ван дер Берг'), { lastName: 'ван дер Берг', firstName: 'Иван', middleName: '' }, 'split частицы после имени');
eq(sandbox.psSplitFio('John van der Berg'), { lastName: 'van der Berg', firstName: 'John', middleName: '' }, 'split латиница с частицами');
eq(sandbox.psSplitFio('Иван Тестов Петрович'), { lastName: 'Тестов', firstName: 'Иван', middleName: 'Петрович' }, 'split Имя Фамилия Отчество');

// ── Раскладка ──
function mkPlayer(last, first, hcp, gender) { return { id: last + first, lastName: last, firstName: first, middleName: '', gender: gender || 'men', tee: 'wh', hcp: hcp }; }
function runMethod(method, players, size) {
    sandbox.psState = { proto: { players: players, method: method, size: size } };
    return sandbox.psBuildGroups().map(function(g) { return g.map(function(p) { return p.lastName; }); });
}
let p8 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(function(l, i) { return mkPlayer(l, 'Иван', 30 - i * 3.3, 'men'); });
eq(runMethod('hcpAsc', p8, 4), [['H', 'G', 'F', 'E'], ['D', 'C', 'B', 'A']], 'группы hcpAsc (сильнейшие первыми)');
// hcp: A=30, B=26.7, C=23.4, D=20.1, E=16.8, F=13.5, G=10.2, H=6.9
eq(runMethod('hcpSnake', p8, 4), [['H', 'E', 'D', 'A'], ['G', 'F', 'C', 'B']], 'группы hcpSnake (змейка, равные)');
eq(runMethod('alpha', p8.slice().reverse(), 2), [['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H']], 'группы alpha');
eq(runMethod('order', p8, 3), [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H']], 'группы order (3 в группе)');
eq(runMethod('order', [mkPlayer('One', 'Соло', 5)], 4), [['One']], 'группа из одного игрока');
eq(runMethod('hcpSnake', [mkPlayer('A', 'x', 10), mkPlayer('B', 'x', 20), mkPlayer('C', 'x', 30)], 4), [['A', 'B', 'C']], 'snake малая группа');

// ── Расписание ──
sandbox.psState = { proto: { date: '2026-09-09', startTime: '09:00', interval: 10, scheme: '1', size: 4 } };
let base = new Date('2026-09-09T09:00:00').getTime();
eq(sandbox.psGroupSchedule(0, 5), { startHole: 1, startTime: base }, 'schedule group 0 hole 1');
eq(sandbox.psGroupSchedule(2, 5), { startHole: 1, startTime: base + 20 * 60000 }, 'schedule group 2 hole 1');
sandbox.psState.proto.scheme = '1-10';
eq(sandbox.psGroupSchedule(0, 4), { startHole: 1, startTime: base }, 'shotgun g0 → 1');
eq(sandbox.psGroupSchedule(1, 4), { startHole: 10, startTime: base + 5 * 60000 }, 'shotgun g1 → 10 (+5м)');
eq(sandbox.psGroupSchedule(2, 4), { startHole: 1, startTime: base + 10 * 60000 }, 'shotgun g2 → 1 (+10м)');
eq(sandbox.psGroupSchedule(3, 4), { startHole: 10, startTime: base + 15 * 60000 }, 'shotgun g3 → 10 (+15м)');

// Шотган со всех 18 лунок: все стартуют одновременно.
// Интервал — только для второй группы на той же лунке (волна 2).
sandbox.psState.proto.scheme = 'all18';
sandbox.psState.proto.interval = 10;
eq(sandbox.psGroupSchedule(0, 20), { startHole: 1, startTime: base }, 'all18 g0 → 1 @ 09:00');
eq(sandbox.psGroupSchedule(1, 20), { startHole: 2, startTime: base }, 'all18 g1 → 2 @ 09:00 (то же время)');
eq(sandbox.psGroupSchedule(17, 20), { startHole: 18, startTime: base }, 'all18 g17 → 18 @ 09:00');
eq(sandbox.psGroupSchedule(18, 20), { startHole: 1, startTime: base + 10 * 60000 }, 'all18 g18 → 1 @ 09:10 (вторая группа на лунке)');
eq(sandbox.psGroupSchedule(19, 20), { startHole: 2, startTime: base + 10 * 60000 }, 'all18 g19 → 2 @ 09:10');
eq(sandbox.psNewGroupSchedule(new Array(18)), { startHole: 1, startTime: base + 10 * 60000 }, 'all18 новая 19-я группа → лунка 1 + интервал');

// Смена интервала в админке НЕ сбрасывает группы (в т.ч. при правке протокола)
// и двигает только вторую группу на той же лунке.
sandbox.psState.editingId = 'pr_test';
sandbox.psState.groups = [
    { members: [{ id: 'a' }], startHole: 1, startTime: 0 },
    { members: [{ id: 'b' }], startHole: 2, startTime: 0 },
    { members: [{ id: 'c' }], startHole: 1, startTime: 0 }
];
sandbox.psState.proto.startTime = '11:00';
sandbox.psState.proto.interval = 8;
var all18Base = new Date('2026-09-09T11:00:00').getTime();
sandbox.psDistInterval(10);
eq(sandbox.psState.editingId, 'pr_test', 'all18 interval: режим правки не сбрасывается');
eq(sandbox.psState.groups.length, 3, 'all18 interval: состав групп сохраняется');
eq(sandbox.psState.proto.interval, 10, 'all18 interval: значение сохраняется');
eq(sandbox.psState.groups.map(function(g) { return g.startHole; }), [1, 1, 2], 'all18 interval: порядок лунка→волна (1,1,2)');
eq(sandbox.psState.groups[0].startTime, all18Base, 'all18 interval: 1А — 11:00');
eq(sandbox.psState.groups[1].startTime, all18Base + 10 * 60000, 'all18 interval: 1Б — 11:10');
eq(sandbox.psState.groups[2].startTime, all18Base, 'all18 interval: 2А — 11:00');
eq(sandbox.psState.groups[0].members[0].id, 'a', 'all18 interval: 1А — игрок a');
eq(sandbox.psState.groups[1].members[0].id, 'c', 'all18 interval: 1Б — игрок c');
eq(sandbox.psState.groups[2].members[0].id, 'b', 'all18 interval: 2А — игрок b');
eq(sandbox.psGroupTitle(sandbox.psState.groups[0], 0), 'Группа 1А', 'all18 title: 1А');
eq(sandbox.psGroupTitle(sandbox.psState.groups[1], 1), 'Группа 1Б', 'all18 title: 1Б');
eq(sandbox.psGroupTitle(sandbox.psState.groups[2], 2), 'Группа 2А', 'all18 title: 2А');
eq(sandbox.psIsWebsiteRosterPlayer({ source: 'registered' }), true, 'clear: website roster kept');
eq(sandbox.psIsWebsiteRosterPlayer({ source: 'excel' }), false, 'clear: excel dropped');
eq(sandbox.psIsWebsiteRosterPlayer({ source: 'manual' }), false, 'clear: manual dropped');
eq(sandbox.psIsWebsiteTournamentReg('abc', { guest: true }, {}), true, 'clear: website guest kept');
eq(sandbox.psIsWebsiteTournamentReg('user_x', { source: 'start-list' }, {}), false, 'clear: start-list dropped');
sandbox.psState.proto.scheme = '1-10';
sandbox.psState.groups = [
    { startHole: 10, startTime: all18Base },
    { startHole: 1, startTime: all18Base },
    { startHole: 10, startTime: all18Base + 300000 },
    { startHole: 1, startTime: all18Base + 600000 }
];
sandbox.psSortGroupsShotgun(sandbox.psState.groups, '1-10');
eq([
    sandbox.psGroupTitle(sandbox.psState.groups[0], 0),
    sandbox.psGroupTitle(sandbox.psState.groups[1], 1),
    sandbox.psGroupTitle(sandbox.psState.groups[2], 2),
    sandbox.psGroupTitle(sandbox.psState.groups[3], 3)
], ['Группа 1А', 'Группа 1Б', 'Группа 10А', 'Группа 10Б'], '1-10 titles after sort: 1А,1Б,10А,10Б');
sandbox.psState.editingId = null;
sandbox.psState.groups = [];
sandbox.psState.proto.scheme = '1';
sandbox.psState.proto.startTime = '09:00';
sandbox.psState.proto.interval = 10;
eq(sandbox.psGroupTitle({ startHole: 1 }, 0), 'Группа 1', 'sequential stays Группа 1');

// ── Маркеры в группе ──
let g4 = [mkPlayer('A', 'И', 10), mkPlayer('B', 'И', 20), mkPlayer('C', 'И', 30), mkPlayer('D', 'И', 40)];
let markers = sandbox.psMarkersForGroup(g4);
eq(markers.map(function(m) { return m.marker.lastName + '->' + m.target.lastName; }), ['A->B', 'B->C', 'C->D', 'D->A'], 'маркеры по кругу в группе из 4');
eq(sandbox.psMarkersForGroup(g4.slice(0, 2)).map(function(m) { return m.marker.lastName + '->' + m.target.lastName; }), ['A->B', 'B->A'], 'маркеры в паре');
eq(sandbox.psMarkersForGroup(g4.slice(0, 1)), [], 'одиночка без маркера');

// ── Гандикапы (парсер) ──
eq(sandbox.psParseHcp('12'), 12, 'hcp 12');
eq(sandbox.psParseHcp('+2.4'), -2.4, 'hcp +2.4 (плюсовой)');
eq(sandbox.psParseHcp('-3'), -3, 'hcp -3');
eq(sandbox.psParseHcp('12,5'), 12.5, 'hcp запятая');
eq(sandbox.psParseHcp('abc'), null, 'hcp мусор → null');
eq(sandbox.psParseHcp(0), 0, 'hcp число 0');

// ── Заголовки Excel ──
eq(sandbox.psHeaderKey('Фамилия'), 'lastName', 'header фамилия');
eq(sandbox.psHeaderKey('Имя'), 'firstName', 'header имя');
eq(sandbox.psHeaderKey('Отчество'), 'middleName', 'header отчество');
eq(sandbox.psHeaderKey('Точный гандикап'), 'hcp', 'header гандикап');
eq(sandbox.psHeaderKey('ТИ'), 'tee', 'header ти');
eq(sandbox.psHeaderKey('Пол'), 'gender', 'header пол');
eq(sandbox.psHeaderKey('ФИО'), 'fio', 'header фио');
eq(sandbox.psHeaderKey('Surname'), 'lastName', 'header surname');
eq(sandbox.psTeeFromCell('белый'), 'wh', 'tee белый');
eq(sandbox.psTeeFromCell('Red'), 'rd', 'tee red');
eq(sandbox.psTeeFromCell('чёрный'), 'bk', 'tee чёрный');
eq(sandbox.psGenderFromCell('ж'), 'women', 'пол ж');
eq(sandbox.psGenderFromCell('M'), 'men', 'пол M');

// ── Excel-строки ──
let rows = [
    { 'Фамилия': 'Тестов', 'Имя': 'Иван', 'Отчество': 'Петрович', 'Точный гандикап': 12.0, 'Пол': 'м', 'ТИ': 'белый' },
    { 'Фамилия': 'Тестова', 'Имя': 'Мария', 'Отчество': 'Ивановна', 'Точный гандикап': 20, 'Пол': 'жен', 'ТИ': 'красный' },
    { 'Фамилия': 'Смирнов', 'Имя': 'Пётр', 'Отчество': '', 'Точный гандикап': 4.2 },
    { 'Фамилия': 'БезHcp', 'Имя': 'Игрок', 'Отчество': '', 'Точный гандикап': null, 'Пол': 'м' }
];
// ФИО одной колонкой — отдельный файл, где другие колонки не заполнены
let rowsFio = [
    { 'Фамилия': '', 'Имя': '', 'Отчество': '', 'ФИО': 'Тестов Иван Петрович', 'Точный гандикап': 12.0 },
    { 'Фамилия': '', 'Имя': '', 'Отчество': '', 'ФИО': 'Смирнов Пётр', 'Точный гандикап': 4.2 }
];
let parsed = sandbox.psParseExcelRows(rows);
eq(parsed.valid.length, 3, 'excel: 3 валидные строки (без hcp → ошибка)');
eq(parsed.invalid.length, 1, 'excel: 1 строка с ошибкой');
eq([parsed.valid[0].lastName, parsed.valid[0].firstName, parsed.valid[0].middleName], ['Тестов', 'Иван', 'Петрович'], 'excel: разбор ФИО по колонкам');
eq(parsed.valid[0].tee, 'wh', 'excel: ти белый');
eq(parsed.valid[1].gender, 'women', 'excel: пол жен');
let parsedFio = sandbox.psParseExcelRows(rowsFio);
eq(parsedFio.valid.length, 2, 'excel-fio: 2 валидные строки');
eq([parsedFio.valid[0].lastName, parsedFio.valid[0].firstName, parsedFio.valid[0].middleName], ['Тестов', 'Иван', 'Петрович'], 'excel-fio: ФИО в одной колонке, 3 части');
eq([parsedFio.valid[1].lastName, parsedFio.valid[1].firstName, parsedFio.valid[1].middleName], ['Смирнов', 'Пётр', ''], 'excel-fio: ФИО в одной колонке, 2 части');

// ── Проверка разбора числового hcp из Excel (значение-число и строка) ──
eq(sandbox.psParseHcpFromCell('+1.5'), -1.5, 'hcp cell +1.5');

// ── Расширенные парсеры ячеек ──
eq(sandbox.psTeeFromCell('⬜ Белый'), 'wh', 'tee эмодзи ⬜');
eq(sandbox.psTeeFromCell('🟦'), 'bl', 'tee эмодзи 🟦');
eq(sandbox.psTeeFromCell('белые'), 'wh', 'tee белые (мн.ч.)');
eq(sandbox.psTeeFromCell('с'), 'bl', 'tee одна буква «с»');
eq(sandbox.psGenderFromCell('м'), 'men', 'пол м');
eq(sandbox.psGenderFromCell('Женский'), 'women', 'пол Женский');
eq(sandbox.psGenderFromCell('девушка'), 'women', 'пол девушка');
eq(sandbox.psParseHcpFromCell('HCP 12.4'), 12.4, 'hcp из «HCP 12.4»');
eq(sandbox.psParseHcpFromCell('(13)'), 13, 'hcp из «(13)»');
eq(sandbox.psParseHcpFromCell('нет'), null, 'hcp «нет» → null');
eq(sandbox.psHeaderKey('Гандикап WHS'), 'hcp', 'header «Гандикап WHS» → hcp');
eq(sandbox.psHeaderKey('EHCP'), 'hcp', 'header «EHCP» → hcp (точный гандикап)');
eq(sandbox.psHeaderKey('E.HCP'), 'hcp', 'header «E.HCP» → hcp (точный гандикап)');
eq(sandbox.psHeaderKey('Exact handicap'), 'hcp', 'header «Exact handicap» → hcp');
eq(sandbox.psHeaderKey('Точный HCP'), 'hcp', 'header «Точный HCP» → hcp');
eq(sandbox.psHeaderKey('Участник'), 'fio', 'header «Участник» → fio');
eq(sandbox.psHeaderKey('ФИО участника'), 'fio', 'header «ФИО участника» → fio');
eq(sandbox.psHeaderKey('Полевой гандикап'), null, 'header «Полевой гандикап» игнорируется (не точный)');
eq(sandbox.psHeaderKey('Игровой гандикап'), null, 'header «Игровой гандикап» игнорируется (не точный)');
eq(sandbox.psHeaderKey('Field handicap'), null, 'header «Field handicap» игнорируется (не точный)');

// ── Гибкий импорт: заголовки не в первой строке ──
let gridShifted = [
    ['Стартовый список · Кубок клуба', '', '', '', ''],
    ['', '', '', '', ''],
    ['№', 'ФИО', 'Гандикап', 'Пол', 'ТИ'],
    [1, 'Тестов Иван Петрович', 12.0, 'м', 'белый'],
    [2, 'Тестова Мария', 20, 'ж', '🟥 красный'],
    [3, 'Смирнов Пётр', 4.2, 'муж', 'синий']
];
let g1 = sandbox.psParseExcelGrid(gridShifted);
eq(g1.guessed, false, 'grid: заголовки найдены (не угадывание)');
eq(g1.headerRow, 3, 'grid: строка заголовков = 3');
eq(g1.valid.length, 3, 'grid: 3 валидные строки');
eq([g1.valid[0].lastName, g1.valid[0].firstName, g1.valid[0].middleName], ['Тестов', 'Иван', 'Петрович'], 'grid: ФИО из одной колонки');
eq(g1.valid[1].tee, 'rd', 'grid: ти с эмодзи');
eq(g1.valid[2].gender, 'men', 'grid: пол муж');

// ── Гибкий импорт: вообще без заголовков ──
let gridRaw = [
    ['Иванов Сергей', 14.3, 'м', 'белый'],
    ['Петрова Анна Михайловна', 22.1, 'ж', 'красный'],
    ['', '', '', ''],
    ['Сидоров Олег', '+1.2', 'м', 'чёрный'],
    ['Итого участников: 3', '', '', '']
];
let g2 = sandbox.psParseExcelGrid(gridRaw);
eq(g2.guessed, true, 'grid-raw: режим угадывания');
eq(g2.valid.length, 3, 'grid-raw: 3 валидные строки (итоговая отброшена)');
eq([g2.valid[0].lastName, g2.valid[0].firstName], ['Иванов', 'Сергей'], 'grid-raw: ФИО разобрано');
eq(g2.valid[0].hcp, 14.3, 'grid-raw: hcp найден');
eq(g2.valid[1].tee, 'rd', 'grid-raw: ти найден');
eq(g2.valid[1].gender, 'women', 'grid-raw: пол жен');
eq(g2.valid[2].hcp, -1.2, 'grid-raw: плюсовой гандикап из «+1.2»');

// ── Гибкий импорт: отдельные колонки Фамилия/Имя без заголовков ──
let gridCols = [
    ['Кузнецов', 'Андрей', 18.9],
    ['Кузнецова', 'Елена', 25.0]
];
let g3 = sandbox.psParseExcelGrid(gridCols);
eq(g3.valid.length, 2, 'grid-cols: 2 строки');
eq([g3.valid[0].lastName, g3.valid[0].firstName], ['Кузнецов', 'Андрей'], 'grid-cols: фамилия/имя по колонкам');

// ── Маркеры: ручные назначения и автокольцо ──
function gm(last, hcp) { return { id: 'id_' + last, lastName: last, firstName: 'И', middleName: '', gender: 'men', tee: 'wh', hcp: hcp }; }
let gg = { members: [gm('A', 10), gm('B', 20), gm('C', 30)], markerTargets: {} };
let ring = sandbox.psGroupMarkersResolved(gg);
eq(ring.map(function(m) { return m.markerId + '>' + m.targetId; }), ['id_A>id_B', 'id_B>id_C', 'id_C>id_A'], 'маркеры: автокольцо');
gg.markerTargets = { id_A: 'id_C' };
let manual = sandbox.psGroupMarkersResolved(gg);
eq(manual.map(function(m) { return m.markerId + '>' + m.targetId; }), ['id_A>id_C'], 'маркеры: ручное назначение A→C');
gg.markerTargets = { id_A: 'id_A' }; // сам себя — невалидно, откат на кольцо
eq(sandbox.psGroupMarkersResolved(gg).length, 3, 'маркеры: «сам себя» игнорируется');
let solo = { members: [gm('A', 10)], markerTargets: {} };
eq(sandbox.psGroupMarkersResolved(solo), [], 'маркеры: одиночка без маркеров');


// ── Обрезка гандикапа: psEffectiveExact ──
// Порядок: сначала процент, затем максимум по полу (36 → 90% = 32.4 → макс 28).
sandbox.psState = { proto: { hcpCutEnabled: false, hcpCutPercent: 90, hcpCutMaxEnabled: false, hcpMaxMen: '', hcpMaxWomen: '' } };
eq(sandbox.psEffectiveExact(mkPlayer('A', 'И', 36)), 36, 'cut: без обрезки = исходный');
eq(sandbox.psEffectiveExact(mkPlayer('A', 'И', null)), 0, 'cut: пустой hcp → 0');
eq(sandbox.psEffectiveExact(mkPlayer('A', 'И', 0)), 0, 'cut: hcp 0 → 0');
eq(sandbox.psEffectiveExact(null), 0, 'cut: null-игрок → 0');
sandbox.psState.proto.hcpCutEnabled = true;
sandbox.psState.proto.hcpCutPercent = 90;
sandbox.psState.proto.hcpCutMaxEnabled = true;
sandbox.psState.proto.hcpMaxMen = 28;
sandbox.psState.proto.hcpMaxWomen = '';
eq(sandbox.psEffectiveExact(mkPlayer('A', 'И', 36, 'men')), 28, 'cut: 36 → 90% = 32.4 → макс 28');
eq(sandbox.psEffectiveExact(mkPlayer('B', 'И', 20, 'men')), 18, 'cut: 20 → 90% = 18 (макс не задет)');
eq(sandbox.psEffectiveExact(mkPlayer('C', 'И', 36, 'women')), 32.4, 'cut: женщины без макса: 36 → 90% = 32.4');
sandbox.psState.proto.hcpMaxWomen = 30;
eq(sandbox.psEffectiveExact(mkPlayer('C', 'И', 36, 'women')), 30, 'cut: женщины 36 → 90% = 32.4 → макс 30');
sandbox.psState.proto.hcpCutPercent = 100;
eq(sandbox.psEffectiveExact(mkPlayer('A', 'И', 36, 'men')), 28, 'cut: 100% — действует только макс');
// Режимы: только процент / только максимум / всё выключено
sandbox.psState.proto.hcpCutEnabled = true;
sandbox.psState.proto.hcpCutPercent = 90;
sandbox.psState.proto.hcpCutMaxEnabled = false;
eq(sandbox.psEffectiveExact(mkPlayer('A', 'И', 36, 'men')), 32.4, 'cut: только процент (макс выкл): 36 → 32.4');
sandbox.psState.proto.hcpCutEnabled = false;
sandbox.psState.proto.hcpCutMaxEnabled = true;
eq(sandbox.psEffectiveExact(mkPlayer('A', 'И', 36, 'men')), 28, 'cut: только максимум (процент выкл): 36 → 28');
sandbox.psState.proto.hcpCutMaxEnabled = false;
eq(sandbox.psEffectiveExact(mkPlayer('A', 'И', 36, 'men')), 36, 'cut: всё выключено = исходный');
// Совместимость: старые протоколы без флага hcpCutMaxEnabled —
// максимум считается включённым, если значения максимумов заданы.
delete sandbox.psState.proto.hcpCutMaxEnabled;
sandbox.psState.proto.hcpCutEnabled = true;
sandbox.psState.proto.hcpCutPercent = 90;
eq(sandbox.psEffectiveExact(mkPlayer('A', 'И', 36, 'men')), 28, 'cut: старый протокол без флага — макс активен');
sandbox.psState.proto.hcpCutMaxEnabled = true;
// делегирование в tnApplyHcpCut из utils.js, если он загружен
sandbox.tnApplyHcpCut = function(raw, gender, cut) { return { effective: raw + 1000 }; };
eq(sandbox.psEffectiveExact(mkPlayer('A', 'И', 10, 'men')), 1010, 'cut: используется tnApplyHcpCut из utils.js');
delete sandbox.tnApplyHcpCut;

// ── psCutHintHtml ──
sandbox.psState.proto.hcpCutEnabled = true;
sandbox.psState.proto.hcpCutPercent = 90;
sandbox.psState.proto.hcpCutMaxEnabled = true;
sandbox.psState.proto.hcpMaxMen = 28;
sandbox.psState.proto.hcpMaxWomen = '';
var hint = sandbox.psCutHintHtml(mkPlayer('A', 'И', 36, 'men'));
eq(hint.indexOf('fa-scissors') !== -1 && hint.indexOf('→') !== -1, true, 'cut hint: чип при обрезке 36 → 28.0');
eq(hint.indexOf('28.0') !== -1, true, 'cut hint: в чипе обрезанное значение');
eq(sandbox.psCutHintHtml(mkPlayer('B', 'И', 20, 'men')).indexOf('fa-scissors') !== -1, true, 'cut hint: чип при 20→18');
sandbox.psState.proto.hcpCutEnabled = false;
sandbox.psState.proto.hcpCutMaxEnabled = false;
sandbox.psState.proto.hcpMaxMen = '';
eq(sandbox.psCutHintHtml(mkPlayer('A', 'И', 36, 'men')), '', 'cut hint: пусто без обрезки');
eq(sandbox.psCutHintHtml(mkPlayer('A', 'И', null)), '', 'cut hint: пусто без hcp');

// ── psCalcFieldHcp считает от ОБРЕЗАННОГО (запасная ветка без utils.js — Math.round) ──
sandbox.psState.proto.hcpCutEnabled = true;
sandbox.psState.proto.hcpCutPercent = 90;
sandbox.psState.proto.hcpCutMaxEnabled = true;
sandbox.psState.proto.hcpMaxMen = 28;
eq(sandbox.psCalcFieldHcp(mkPlayer('A', 'И', 36, 'men')), 28, 'field hcp: round(28.0)=28 от обрезанного');
eq(sandbox.psCalcFieldHcp(null), 0, 'field hcp: null → 0');

// ── psDivisionChipHtml ──
eq(typeof sandbox.psDivisionChipHtml, 'function', 'division chip: функция определена');
eq(sandbox.psDivisionChipHtml(mkPlayer('A', 'И', 10, 'men')), '', 'division chip: пусто без tnFindDivision');
sandbox.psState = {
    proto: { hcpCutEnabled: false, hcpCutPercent: 90, hcpMaxMen: '', hcpMaxWomen: '' },
    tournaments: [{ id: 't1', divisions: [{ id: 'd1', name: 'Мужчины 0–12' }] }],
    selId: 't1'
};
sandbox.tnFindDivision = function(tn, hcp, gender) {
    return (tn && tn.id === 't1' && gender === 'men' && hcp <= 12) ? tn.divisions[0] : null;
};
eq(sandbox.psDivisionChipHtml(mkPlayer('A', 'И', 10, 'men')), '<span class="tn-div-chip">Мужчины 0–12</span>', 'division chip: чип группы');
eq(sandbox.psDivisionChipHtml(mkPlayer('B', 'И', 20, 'men')), '', 'division chip: пусто вне диапазона');
eq(sandbox.psDivisionChipHtml(mkPlayer('C', 'И', null, 'men')), '', 'division chip: пусто без hcp');

// ── Рендер ростера и групп не падает (регрессия: бывшие undefined-функции) ──
sandbox.fmtFieldHcp = function(v) { return String(v); };
sandbox.fmtDate = function() { return '—'; };
sandbox.escapeHtml = function(x) { return String(x == null ? '' : x); };
sandbox.psState = {
    proto: { hcpCutEnabled: true, hcpCutPercent: 90, hcpCutMaxEnabled: true, hcpMaxMen: 28, hcpMaxWomen: '', format: 'Stroke Play', formatCustom: '', tee: 'wh', startTime: '09:00', interval: 8, scheme: '1', date: '2026-09-09', name: 'T' },
    tournaments: [], selId: '', editingId: null, groups: []
};
var fullP = { id: 'p1', lastName: 'Тестов', firstName: 'Иван', middleName: 'Петрович', gender: 'men', tee: 'wh', hcp: 36, source: 'registered', uidMatched: true };
var rowHtml = sandbox.psRosterRowHtml(fullP, 0);
eq(typeof rowHtml === 'string' && rowHtml.indexOf('Тестов') !== -1 && rowHtml.indexOf('fa-scissors') !== -1, true, 'roster row: рендерится, чип обрезки на месте');
sandbox.psState.groups = [{ members: [fullP, { id: 'p2', lastName: 'Смирнов', firstName: 'Пётр', middleName: '', gender: 'men', tee: 'bl', hcp: 4.2, source: 'manual' }], startHole: 1, startTime: Date.now(), format: '', markerTargets: {} }];
var groupsHtml = sandbox.psRenderGroupsResult();
eq(typeof groupsHtml === 'string' && groupsHtml.indexOf('Группа 1') !== -1 && groupsHtml.indexOf('Смирнов') !== -1, true, 'groups: предпросмотр рендерится без ошибок');

// ── Дедупликация людей (заявка без отчества vs список с отчеством) ──
function mkPerson(last, first, middle, id) { return { id: id || '', lastName: last, firstName: first, middleName: middle || '' }; }
eq(sandbox.psSamePerson(mkPerson('Тестов', 'Иван', 'Петрович'), mkPerson('Тестов', 'Иван', 'Петрович')), true, 'same: полное ФИО');
eq(sandbox.psSamePerson(mkPerson('Тестов', 'Иван', 'Петрович'), mkPerson('Тестов', 'Иван', '')), true, 'same: заявка без отчества');
eq(sandbox.psSamePerson(mkPerson('Тестов', 'Иван', ''), mkPerson('Тестов', 'Иван', 'Петрович')), true, 'same: список без отчества');
eq(sandbox.psSamePerson(mkPerson('Тестов', 'Иван', 'Петрович'), mkPerson('Тестов', 'Иван', 'Сергеевич')), false, 'same: разные отчества — разные люди');
eq(sandbox.psSamePerson(mkPerson('Тестов', 'Иван', ''), mkPerson('Смирнов', 'Иван', '')), false, 'same: разные фамилии');
eq(sandbox.psSamePerson(mkPerson('Тестов', 'Иван', '', 'u1'), mkPerson('Тестов', 'Иван', '', 'u1')), true, 'same: одинаковый id');
eq(sandbox.psSamePerson(mkPerson('Тестов', 'Иван', '', 'u1'), mkPerson('Тестов', 'Иван', '', 'u2')), true, 'same: один человек, разные id-ключи');

// ── Несколько форматов игры ──
sandbox.psState = { proto: { formats: ['Stableford', 'Stroke Play'], format: 'Stableford', formatCustom: '' }, tournaments: [], selId: '', groups: [] };
eq(sandbox.psFormatsSelectedList(sandbox.psState.proto), ['Stableford', 'Stroke Play'], 'formats: список выбранных');
eq(sandbox.psResolvedFormats(), ['Stableford', 'Stroke Play'], 'formats: resolved (несколько)');
eq(sandbox.psResolvedFormat(), 'Stableford', 'formats: первый = основной');
sandbox.psState.proto.formatCustom = 'Гросс, 2 из 4';
eq(sandbox.psResolvedFormats(), ['Stableford', 'Stroke Play', 'Гросс, 2 из 4'], 'formats: свой формат добавляется');
sandbox.psState.proto = { formats: [], format: '', formatCustom: '' };
eq(sandbox.psResolvedFormats(), ['Stroke Play'], 'formats: пусто → Stroke Play');
sandbox.psState.proto = { formats: ['Stableford'], format: 'Stableford', formatCustom: '' };
sandbox.psState.tournaments = [{ id: 't1', formats: ['Stableford', 'Stroke Play'] }];
sandbox.psState.selId = 't1';
var chipsHtml = sandbox.psFormatChipsHtml(sandbox.psState.proto);
eq(chipsHtml.indexOf('checked') !== -1 && chipsHtml.indexOf('Stableford') !== -1 && chipsHtml.indexOf('Stroke Play') !== -1, true, 'formats: чипы с выбранным Stableford и кандидатом Stroke Play');
sandbox.psState.proto.formats = ['Stableford', 'Stroke Play'];
eq(sandbox.psGroupFormatOptions({ format: '' }).indexOf('Stableford + Stroke Play') !== -1, true, 'formats: группа «как у протокола» показывает несколько форматов');

// ── Excel: дедуп одинаковых игроков с разных страниц ──
var rowsDup = [
    { lastName: 'Тестов', firstName: 'Иван', middleName: '', hcp: 12, errors: [] },
    { lastName: 'Тестов', firstName: 'Иван', middleName: 'Петрович', hcp: 12.4, errors: [] },
    { lastName: 'Смирнов', firstName: 'Пётр', middleName: '', hcp: 4.2, errors: [] }
];
eq(sandbox.psDedupeExcelRows(rowsDup).length, 2, 'excel: дедуп строк одного человека с разных листов');

// ── Возраст внутри ФИО отбрасывается («Кирилл 17 Дунаев») ──
eq(sandbox.psSplitFio('Кирилл 17 Дунаев'), { lastName: 'Дунаев', firstName: 'Кирилл', middleName: '' }, 'split: возраст между именем и фамилией');
eq(sandbox.psSplitFio('Тестов Иван 17 Петрович'), { lastName: 'Тестов', firstName: 'Иван', middleName: 'Петрович' }, 'split: возраст между именем и отчеством');
eq(sandbox.psSplitFio('Тестов Иван Петрович'), { lastName: 'Тестов', firstName: 'Иван', middleName: 'Петрович' }, 'split: без возраста — как раньше');

// ── Пол по ФИО: женские имена/фамилии/отчества ──
eq(sandbox.psGuessGender('Тестова', 'Мария', 'Ивановна'), 'women', 'gender: Мария Тестова — women');
eq(sandbox.psGuessGender('Тестов', 'Иван', 'Петрович'), 'men', 'gender: Иван Тестов — men');
eq(sandbox.psGuessGender('', 'Анна', ''), 'women', 'gender: Анна — women');
eq(sandbox.psGuessGender('', 'Никита', ''), 'men', 'gender: Никита — men (исключение)');
eq(sandbox.psGuessGender('Тестов', 'Саша', ''), 'men', 'gender: Саша Тестов — men по фамилии');
eq(sandbox.psGuessGender('Тестова', 'Саша', ''), 'women', 'gender: Саша Тестова — women по фамилии');
eq(sandbox.psGuessGender('Ким', 'Анна', ''), 'women', 'gender: Анна Ким — women по имени');

// ── Excel: «Возраст» — не гандикап, даты рождения — не гандикап ──
eq(sandbox.psHeaderKey('Возраст'), 'age', 'header: Возраст → age');
eq(sandbox.psHeaderKey('Гандикап'), 'hcp', 'header: Гандикап → hcp');
eq(sandbox.psParseHcpFromCell('12.05.2010'), null, 'cell: дата рождения — не гандикап');
eq(sandbox.psParseHcpFromCell('2010-05-12'), null, 'cell: дата ISO — не гандикап');
eq(sandbox.psParseHcpFromCell('12,4'), 12.4, 'cell: 12,4 → 12.4');
eq(sandbox.psParseHcpFromCell('HCP 8,5'), 8.5, 'cell: «HCP 8,5» → 8.5');

// ── Excel-строки: пол/ТИ после разбора имени, возраст в ФИО режется ──
sandbox.psState = {
    proto: { tee: 'wh', hcpCutEnabled: false, hcpCutPercent: 90, hcpCutMaxEnabled: false, hcpMaxMen: '', hcpMaxWomen: '' },
    tournaments: [], selId: ''
};
var excelParsed = sandbox.psParseExcelRows([
    { 'Фамилия': 'Тестова', 'Имя': 'Мария', 'Гандикап': '12,4' },
    { 'Фамилия': 'Дунаев', 'Имя': 'Кирилл', 'Гандикап': '20' }
]);
eq(excelParsed.valid.length, 2, 'excel rows: обе строки валидны');
eq(excelParsed.valid[0].gender, 'women', 'excel rows: Мария — women');
eq(excelParsed.valid[0].tee, 'rd', 'excel rows: Марии — красные ТИ');
eq(excelParsed.valid[1].gender, 'men', 'excel rows: Кирилл — men');
eq(excelParsed.valid[1].tee, 'wh', 'excel rows: мужчине — ТИ протокола');
var excelFio = sandbox.psParseExcelRows([
    { 'ФИО': 'Кирилл 17 Дунаев', 'Гандикап': '20' }
]);
eq(excelFio.valid.length, 1, 'excel rows: ФИО с возрастом валидна');
eq(excelFio.valid[0].lastName, 'Дунаев', 'excel rows: «17» не стало частью имени');
eq(excelFio.valid[0].firstName, 'Кирилл', 'excel rows: имя Кирилл');

// ── ТИ по умолчанию: группа турнира → женские → ТИ протокола ──
eq(sandbox.psDefaultTeeFor('women', 20), 'rd', 'tee: девушке без групп — красные');
eq(sandbox.psDefaultTeeFor('men', 10), 'wh', 'tee: мужчине — ТИ протокола');
sandbox.psState.tournaments = [{ id: 't1', tees: ['wh', 'rd'] }];
sandbox.psState.selId = 't1';
eq(sandbox.psDefaultTeeFor('women', 20), 'rd', 'tee: красные есть в турнире — красные');
sandbox.psState.tournaments = [{ id: 't1', tees: ['wh'] }];
eq(sandbox.psDefaultTeeFor('women', 20), 'wh', 'tee: красных нет — белые');
sandbox.psState.tournaments = [];
sandbox.psState.selId = '';

// ── Компактный стартовый лист: авто-группы по полу и гандикапу ──
sandbox.psState = {
    proto: { hcpCutEnabled: false, hcpCutPercent: 90, hcpCutMaxEnabled: false, hcpMaxMen: '', hcpMaxWomen: '', tee: 'wh', players: [] },
    tournaments: [], selId: '', editingId: null, groups: [], rosterCollapsed: {}
};
var rgPlayers = [
    mkPlayer('Муж1', 'Иван', 5, 'men'),
    mkPlayer('Муж2', 'Пётр', 20, 'men'),
    mkPlayer('Жен1', 'Мария', 30, 'women')
];
var rg = sandbox.psRosterGroups(rgPlayers);
eq(rg.useDivs, false, 'roster groups: без дивизионов — авто-группы');
eq(rg.buckets.length, 3, 'roster groups: три авто-группы');
eq(rg.buckets[0].items.length + rg.buckets[1].items.length + rg.buckets[2].items.length, 3, 'roster groups: все игроки разложены');
var rosterHtml = sandbox.psRenderRosterTable({ players: rgPlayers });
eq(rosterHtml.indexOf('ps-rgroup') !== -1 && rosterHtml.indexOf('HCP 0–12') !== -1, true, 'roster: сворачиваемые группы в разметке');
eq(rosterHtml.indexOf('Развернуть все') !== -1, true, 'roster: кнопки свернуть/развернуть');
// Кнопка «В группу…» доступна и при правке протокола
sandbox.psState.editingId = 'pr_test';
sandbox.psState.groups = [{ members: [] }];
var rowEdit = sandbox.psRosterRowHtml({ id: 'p1', lastName: 'Тестов', firstName: 'Иван', middleName: '', gender: 'men', tee: 'wh', hcp: 10, source: 'registered' }, 0);
eq(rowEdit.indexOf('В группу') !== -1, true, 'roster: «В группу…» при редактировании');
sandbox.psState.editingId = null;
sandbox.psState.groups = [];

// ── Название турнира пишется в раунд (для баннера и главной) ──
const startSrc = fs.readFileSync(__dirname + '/../js/start-admin.js', 'utf8');
eq(startSrc.indexOf('tournamentName: proto.tournamentName || \'\'') !== -1, true, 'save: roundData содержит tournamentName');
eq(startSrc.indexOf("sets['rounds/' + rid + '/tournamentName']") !== -1, true, 'edit save: tournamentName обновляется в раунде');
eq(typeof sandbox.psAttachPlayerAutofill, 'function', 'autofill: psAttachPlayerAutofill определена');

console.log(failures ? '\n' + failures + ' FAILURES' : '\nAll tests passed ✔');
process.exit(failures ? 1 : 0);
