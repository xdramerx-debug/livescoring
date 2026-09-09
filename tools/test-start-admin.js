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
eq(sandbox.psHeaderKey('Участник'), 'fio', 'header «Участник» → fio');
eq(sandbox.psHeaderKey('ФИО участника'), 'fio', 'header «ФИО участника» → fio');
eq(sandbox.psHeaderKey('Полевой гандикап'), 'hcp', 'header «Полевой гандикап» → hcp (не пол)');

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

console.log(failures ? '\n' + failures + ' FAILURES' : '\nAll tests passed ✔');
process.exit(failures ? 1 : 0);
