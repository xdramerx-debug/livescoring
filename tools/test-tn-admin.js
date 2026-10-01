// ============================================================
// Автотесты ядра новой турнирной системы (js/tn-admin-core.js)
// Запуск: node tools/test-tn-admin.js
// Проверяются: конфиг, участники (ручной ввод/импорт/шаблон),
// расчёт строк (итог и по лункам), места с тай-брейками, дивизионы,
// номинации с настраиваемым числом призовых мест, разбивка по игровым
// группам, экспорт CSV и печатный документ.
// ============================================================
'use strict';
var C = require('../js/tn-admin-core.js');

var failures = 0, total = 0;
function ok(cond, label) {
    total++;
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function eq(actual, expected, label) {
    total++;
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e); }
    else console.log('ok  -', label);
}

// ── Конфигурация ──
var def = C.defaultConfig();
eq(def.scoring, 'stroke', 'дефолт: Stroke Play');
eq(def.netMode, 'net', 'дефолт: места по Net');
eq(def.genderSplit, true, 'дефолт: раздельный зачёт М/Ж');
eq(def.prizePlaces, 3, 'дефолт: 3 призовых места');
eq(def.divisions.length, 3, 'дефолт: три дивизиона');
eq(C.normalizeConfig({ prizePlaces: 99 }).prizePlaces, 10, 'призовых мест не больше 10');
eq(C.normalizeConfig({ prizePlaces: 0 }).prizePlaces, 3, 'призовых мест не меньше 1 (дефолт)');
eq(C.normalizeConfig({ scoring: 'Stableford' }).scoring, 'stableford', 'normalizeConfig: stableford');
eq(C.normalizeConfig({ divisions: [] }).divisions, [], 'пустой массив дивизионов = отключены');
eq(C.normalizeConfig({ divisions: null }).divisions.length, 3, 'null дивизионов = дефолт');
eq(C.validateConfig({ divisions: [{ name: 'X', hcpFrom: 20, hcpTo: 5 }] }), ['division_range: X'], 'валидация: «от» > «до»');
eq(C.validateConfig({ divisions: [{ name: 'X', hcpFrom: 5, hcpTo: 20 }] }), [], 'валидация: корректный диапазон');

// ── Участники ──
var p1 = C.normalizePlayer({ name: 'Иванов Иван Петрович', handicap: '12,4', gender: 'м', tee: 'белые' }, 0);
eq(p1.name, 'Иванов Иван Петрович', 'нормализация: ФИО');
eq(p1.handicap, 12.4, 'нормализация: гандикап с запятой');
eq(p1.gender, 'men', 'нормализация: пол «м»');
eq(p1.tee, 'wh', 'нормализация: ти «белые»');
eq(C.normalizePlayer({ name: 'Петрова Мария', gender: 'жен' }, 1).gender, 'women', 'нормализация: пол «жен»');
eq(C.normalizePlayer({ name: 'Тест', status: 'dq' }, 2).status, 'DQ', 'нормализация: статус DQ');
eq(C.normalizePlayer({ name: 'Тест2', status: 'WD' }, 3).status, 'DQ', 'WD сводится к DQ');
eq(C.normalizePlayer({ name: '' }, 4), null, 'пустое имя отбрасывается');
eq(C.normalizePlayers([{ pid: 'a', name: 'A' }, { pid: 'b', name: '' }]).length, 1, 'пустые строки отбрасываются');
eq(C.normalizeTee('синие'), 'bl', 'ти «синие»');
eq(C.normalizeTee('red'), 'rd', 'ти «red»');
eq(C.normalizeTee('жёлтые'), 'wh', 'жёлтых ти на поле нет → белые');

// ── Импорт ──
var csv = 'ФИО;Гандикак;Пол;Ти\nИванов Иван;12.4;м;wh\nПетрова Мария;18;ж;rd\n';
var imp = C.parseImport(csv);
eq(imp.players.length, 2, 'импорт CSV: две строки');
eq(imp.players[0].name, 'Иванов Иван', 'импорт CSV: ФИО');
eq(imp.players[0].handicap, 12.4, 'импорт CSV: гандикап');
eq(imp.players[1].gender, 'women', 'импорт CSV: пол');
eq(imp.players[1].tee, 'rd', 'импорт CSV: ти');
eq(imp.issues.length, 0, 'импорт CSV: без ошибок');
var impArr = C.parseImport([['ФИО', 'Гандикап', 'Пол', 'Ти'], ['Сидоров Пётр', '5', 'м', 'bk']]);
eq(impArr.players.length, 1, 'импорт массива: заголовок распознан');
eq(impArr.players[0].name, 'Сидоров Пётр', 'импорт массива: ФИО');
eq(impArr.players[0].handicap, 5, 'импорт массива: гандикап');
var impObj = C.parseImport([{ 'ФИО': 'Кузнецов Алексей', 'Гандикап': 3.2, 'Пол': 'м', 'Ти': 'bl' }]);
eq(impObj.players.length, 1, 'импорт объектов (XLSX header:1)');
eq(impObj.players[0].tee, 'bl', 'импорт объектов: ти');
eq(C.parseImport(['Иванов Иван;12;м;wh', '   ;;;', ';12;м;wh']).issues.length, 1, 'импорт: битая строка в issues');
ok(C.importTemplateCsv().indexOf('ФИО') !== -1, 'шаблон импорта содержит колонки');

// ── Стриды и места ──
var deps = { fieldHcp: function (h) { return Math.round(h || 0); } };
var players = [
    { pid: 'a', name: 'Иванов', handicap: 10, gender: 'men', tee: 'wh' },
    { pid: 'b', name: 'Петрова', handicap: 20, gender: 'women', tee: 'rd' },
    { pid: 'c', name: 'Сидоров', handicap: 10, gender: 'men', tee: 'wh' },
    { pid: 'd', name: 'Не вышел', handicap: 8, gender: 'men', tee: 'wh' }
];
var results = {
    a: { mode: 'total', gross: 85, status: 'ACTIVE' },
    b: { mode: 'total', gross: 95, status: 'ACTIVE' },
    c: { mode: 'total', gross: 85, status: 'ACTIVE' },
    d: { mode: 'total', status: 'DNS' }
};
var proto = C.buildProtocol({ players: players, results: results, cfg: { prizePlaces: 2 }, groups: [{ name: 'Группа 1', members: ['a', 'c'] }] }, deps);
eq(proto.rows.map(function (r) { return r.position + ':' + r.name; }),
    ['1:Иванов', '1:Сидоров', '3:Петрова', 'null:Не вышел'],
    'места: равные net делят 1-е, следующее — 3-е; DNS без места');
eq(proto.rows[0].net, 75, 'net = gross − игровой гандикап');
eq(proto.rows[3].status, 'DNS', 'DNS в конце протокола');
eq(proto.rows[3].position, null, 'DNS без места');
var scopes = {};
proto.scopes.forEach(function (s) { scopes[s.key] = s; });
eq(scopes['gender:men'].rows.map(function (r) { return r.position; }), [1, 1, null], 'зачёт мужчин: свои места');
eq(scopes['gender:women'].rows.map(function (r) { return r.position; }), [1], 'зачёт женщин: свои места');
eq(scopes['div:d1'].rows.map(function (r) { return r.name; }), ['Не вышел'], 'дивизион 0–9.9');
eq(scopes['div:d2'].rows.map(function (r) { return r.name; }), ['Иванов', 'Сидоров'], 'дивизион 10–18.9');
eq(scopes['div:d3'].rows.map(function (r) { return r.name; }), ['Петрова'], 'дивизион 19+');
eq(proto.perGroup.length, 1, 'разбивка по игровым группам');
eq(proto.perGroup[0].rows.map(function (r) { return r.position + ':' + r.name; }), ['1:Иванов', '1:Сидоров'],
    'в группе свои места (тай при равенстве)');

// ── Номинации ──
var noms = {};
proto.nominations.forEach(function (n) { noms[n.id] = n; });
eq(noms['gross-men'].rows.map(function (r) { return r.name + '#' + r.nomPosition; }), ['Иванов#1', 'Сидоров#2'],
    'Best Gross · Мужчины, топ-2 (prizePlaces=2)');
ok(!!noms['net-men'] && !!noms['net-women'] && !!noms['gross-women'], 'Best Net/Женщины присутствуют');
var stbl = C.buildProtocol({
    players: players.slice(0, 3),
    results: { a: { mode: 'total', stableford: 36 }, b: { mode: 'total', stableford: 30 }, c: { mode: 'total', stableford: 38 } },
    cfg: { scoring: 'stableford', prizePlaces: 1 }
}, deps);
eq(stbl.rows.map(function (r) { return r.position + ':' + r.name; }), ['1:Сидоров', '2:Иванов', '3:Петрова'],
    'Stableford: больше очков — выше место');
eq(stbl.nominations.map(function (n) { return n.id; }), ['stableford-men', 'stableford-women'],
    'Stableford: номинации только по очкам');
eq(stbl.nominations[0].rows.length, 1, 'prizePlaces=1 → одно призовое место');

// ── Ввод по лункам ──
var holes = {};
for (var h = 1; h <= 18; h++) holes[h] = 4;
var holesDeps = {
    fieldHcp: function () { return 0; },
    calcStats: function (scores) {
        var g = 0, played = 0;
        for (var k in scores) { g += scores[k]; played++; }
        return { gross: g, net: g, stablefordField: played * 2, stableford: played * 2, holesPlayed: played, toPar: 0 };
    }
};
var hp = C.buildProtocol({ players: [{ pid: 'x', name: 'Тестов', handicap: 0, gender: 'men', tee: 'wh' }], results: { x: { mode: 'holes', holes: holes } }, cfg: {} }, holesDeps);
eq(hp.rows[0].gross, 72, 'по лункам: gross посчитан');
eq(hp.rows[0].stableford, 36, 'по лункам: стейблфорд посчитан');
eq(hp.rows[0].holesPlayed, 18, 'по лункам: 18 лунок');
eq(hp.rows[0].hasResult, true, 'по лункам: результат есть');

// ── Экспорт ──
var csvOut = C.csv(proto.rows);
ok(csvOut.indexOf('position;name') !== -1, 'CSV: заголовок');
ok(csvOut.indexOf('1;Иванов') !== -1, 'CSV: строка результата');
ok(csvOut.indexOf('DNS') !== -1, 'CSV: статус DNS');
var doc = C.protocolDocHtml(proto, { name: 'Кубок клуба', date: '2026-06-01', scoringLabel: 'Stroke Play · Net', prizePlaces: 2 });
ok(doc.indexOf('Кубок клуба') !== -1, 'печатный документ: название');
ok(doc.indexOf('Призёры') !== -1, 'печатный документ: блок призёров');
ok(doc.indexOf('Абсолютный зачёт') !== -1 || doc.indexOf('Полный протокол') !== -1, 'печатный документ: полная таблица');
ok(doc.indexOf('Группа 1') !== -1, 'печатный документ: игровые группы');
ok(doc.indexOf('Best Gross · Мужчины') !== -1, 'печатный документ: номинации');
ok(doc.indexOf('<script') === -1, 'печатный документ: без скриптов');

// ── Сборка из готовых строк (авто-режим админки) ──
var rows = [
    { pid: 'r1', name: 'Первый', gender: 'men', handicap: 4, fieldHcp: 4, gross: 80, net: 76, stableford: 34, holesPlayed: 18, status: 'ACTIVE', hasResult: true },
    { pid: 'r2', name: 'Второй', gender: 'men', handicap: 12, fieldHcp: 12, gross: 84, net: 72, stableford: 36, holesPlayed: 18, status: 'ACTIVE', hasResult: true }
];
var asm = C.assembleProtocol(rows, {}, []);
eq(asm.rows.map(function (r) { return r.position + ':' + r.name; }), ['1:Второй', '2:Первый'],
    'assembleProtocol: места по net из строк раундов');
eq(asm.rows[1].divisionId, 'd1', 'дивизион проставлен по гандикапу');
eq(asm.rows[0].divisionId, 'd2', 'дивизион 10–18.9 для гандикапа 12');
// Исходные строки не мутируются положениями зачётов
eq(rows[0].position, undefined, 'assembleProtocol не мутирует переданные строки');

console.log('\n' + total + ' checks, failures: ' + failures);
process.exit(failures ? 1 : 0);
