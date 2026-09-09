#!/usr/bin/env node
/**
 * Интеграционная проверка синхронизации гандикапов с учётом форм имён.
 *
 *   node tools/test-admin-name-sync.js
 *
 * Загружает НАСТОЯЩИЕ js/name-variants.js и js/admin.js в песочницу (node:vm,
 * без внешних зависимостей) и дёргает реальные функции админки:
 *   rgNamesMatch        — совпадение ФИО при поиске в базе АГР
 *   rgBuildSearchQueries— какие запросы уйдут в hcp.rusgolf.ru
 *   rgGetFioKey         — ключ игрока (поиск дублей)
 *   rgFindDuplicateGroups — поиск дублей после синхронизации
 *   impNameKey          — поиск «уже есть» при импорте из Excel
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');

// ---------- минимальное окружение браузера ----------
var storage = {};
var sandbox = {
    console: console,
    Promise: Promise,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: function() { return 0; },
    clearInterval: function() {},
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    RegExp: RegExp,
    Error: Error,
    isNaN: isNaN,
    parseInt: parseInt,
    parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    AbortController: undefined,
    navigator: { userAgent: 'node-test', language: 'ru' },
    location: { href: 'https://example.test/admin.html', search: '', hash: '' },
    localStorage: {
        getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
        setItem: function(k, v) { storage[k] = String(v); },
        removeItem: function(k) { delete storage[k]; },
        clear: function() { storage = {}; }
    },
    addEventListener: function() {},
    removeEventListener: function() {},
    fetch: function() { return Promise.reject(new Error('no network in tests')); },
    document: {
        addEventListener: function() {},
        removeEventListener: function() {},
        getElementById: function() { return null; },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        createElement: function() { return { style: {}, classList: { add: function() {}, remove: function() {} }, appendChild: function() {}, setAttribute: function() {} }; },
        body: { appendChild: function() {}, classList: { add: function() {}, remove: function() {} } },
        documentElement: { style: {} }
    },
    DOMParser: function() { this.parseFromString = function() { return { querySelectorAll: function() { return []; } }; }; },
    // заглушки из js/utils.js (в тестах не используются, но упоминаются в admin.js)
    currentLang: 'ru',
    toast: function() {},
    t: function(k) { return k; },
    escapeHtml: function(s) { return String(s == null ? '' : s); },
    fmtExactHcp: function(v) { return String(v); },
    hasAdminPanelAccess: function() { return true; },
    getKnownPlayersSync: function() { return {}; },
    isPlayerDeleted: function() { return false; }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

var ctx = vm.createContext(sandbox);

function load(file) {
    var code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, ctx, { filename: file });
}

load('js/name-variants.js');
load('js/admin.js');

var NV = sandbox.NameVariants;
var fails = 0, total = 0;

function check(title, got, want) {
    total++;
    var g = JSON.stringify(got), w = JSON.stringify(want);
    var ok = g === w;
    if (!ok) fails++;
    console.log((ok ? ' ok  ' : 'FAIL ') + ' | ' + title + ' → ' + g + (ok ? '' : '  (ожид. ' + w + ')'));
}

function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

console.log('=== js/admin.js: rgNamesMatch (реальная функция админки) ===\n');

// «Наташа Смирнова» на сайте — «Смирнова Наталия» в базе АГР
var SYNC_PAIR = ['наташа', 'смирнова', 'наталия', 'смирнова'];

['off', 'A', 'B', 'C'].forEach(function(mode) {
    sandbox.NameVariants.setMode(mode);
    sandbox.NameVariants.setCustomAliases('');
    sandbox.NameVariants.setAutoApply(true);
    var got = sandbox.rgNamesMatch(SYNC_PAIR[0], SYNC_PAIR[1], SYNC_PAIR[2], SYNC_PAIR[3],
        'наташа смирнова', 'смирнова наталия петровна');
    check('режим ' + pad(mode, 3) + ' | «Смирнова Наташа» vs «Смирнова Наталия Петровна»', got,
        mode === 'off' ? 'loose' : 'strong');
});

console.log('');
sandbox.NameVariants.setMode('B');
[
    ['наташа', 'смирнова', 'наталия', 'иванова', null, 'другая фамилия'],
    ['наташа', 'смирнова', 'наталия', 'смирнов', 'loose', 'род фамилии → на выбор'],
    ['наташа', 'смирнова', 'ноталья', 'смирнова', 'loose', 'опечатка → на выбор'],
    ['ольга', 'морозова', 'ольга', 'морозова', 'strong', 'полное совпадение (как и раньше)'],
    ['иван', 'петров', 'иван', 'петров', 'strong', 'точное совпадение (как и раньше)']
].forEach(function(c) {
    var got = sandbox.rgNamesMatch(c[0], c[1], c[2], c[3], c[0] + ' ' + c[1], c[2] + ' ' + c[3]);
    check('режим B     | «' + c[1] + ' ' + c[0] + '» vs «' + c[3] + ' ' + c[2] + '» (' + c[5] + ')', got, c[4]);
});

console.log('\n=== js/admin.js: rgBuildSearchQueries (запросы к hcp.rusgolf.ru) ===\n');
[
    ['off', 2], ['A', 3], ['B', 4], ['C', 5]
].forEach(function(pair) {
    sandbox.NameVariants.setMode(pair[0]);
    sandbox.NameVariants.setCustomAliases('');
    var q = sandbox.rgBuildSearchQueries({ firstName: 'Наташа', lastName: 'Смирнова', name: 'Смирнова Наташа' });
    total++;
    var ok = q.length <= pair[1] && q[0] === 'Смирнова Наташа';
    if (!ok) fails++;
    console.log((ok ? ' ok  ' : 'FAIL ') + ' | режим ' + pad(pair[0], 3) + ' | «Смирнова Наташа» → ' + JSON.stringify(q));
});

sandbox.NameVariants.setMode('B');
var qs = sandbox.rgBuildSearchQueries({ firstName: 'Наташа', lastName: 'Смирнова', name: 'Смирнова Наташа' });
check('режим B     | в списке есть «Смирнова Наталья»', qs.indexOf('Смирнова Наталья') !== -1, true);
check('режим B     | в списке есть «Смирнова Наталия»', qs.indexOf('Смирнова Наталия') !== -1, true);

sandbox.NameVariants.setMode('off');
var qsOff = sandbox.rgBuildSearchQueries({ firstName: 'Наташа', lastName: 'Смирнова', name: 'Смирнова Наташа' });
check('режим off   | прежние 2 запроса, без форм имени', qsOff, ['Смирнова Наташа', 'Наташа Смирнова']);

console.log('\n=== автоприменение выключено (настройка по умолчанию) ===\n');
sandbox.NameVariants.setMode('B');
sandbox.NameVariants.setCustomAliases('');
sandbox.NameVariants.setAutoApply(false);
check('режим B, autoApply=off | «Смирнова Наташа» vs «Смирнова Наталия»',
    sandbox.rgNamesMatch('наташа', 'смирнова', 'наталия', 'смирнова', 'наташа смирнова', 'смирнова наталия'), 'loose');
check('режим B, autoApply=off | точное совпадение по-прежнему обновляет HCP',
    sandbox.rgNamesMatch('ольга', 'морозова', 'ольга', 'морозова', 'ольга морозова', 'морозова ольга'), 'strong');
sandbox.NameVariants.setAutoApply(true);

console.log('\n=== js/admin.js: rgGetFioKey — дубли игроков ===\n');
function keyOf(mode, u) {
    sandbox.NameVariants.setMode(mode);
    sandbox.NameVariants.setCustomAliases('');
    return sandbox.rgGetFioKey(u);
}
var P1 = { firstName: 'Наташа', lastName: 'Смирнова', name: 'Смирнова Наташа' };
var P2 = { firstName: 'Наталия', lastName: 'Смирнова', middleName: 'Петровна', name: 'Смирнова Наталия Петровна' };
check('режим off   | «Смирнова Наташа» vs «Смирнова Наталия Петровна»', keyOf('off', P1) === keyOf('off', P2), false);
check('режим B     | «Смирнова Наташа» vs «Смирнова Наталия Петровна»', keyOf('B', P1) === keyOf('B', P2), true);
check('режим B     | «Смирнова Наташа» vs «Иванова Наталья»', keyOf('B', P1) === keyOf('B', { firstName: 'Наталья', lastName: 'Иванова' }), false);

console.log('\n=== js/admin.js: rgFindDuplicateGroups — поиск дублей после синхронизации ===\n');
sandbox.NameVariants.setMode('B');
sandbox.NameVariants.setCustomAliases('');
var players = [
    { id: 'u1', data: { firstName: 'Наташа', lastName: 'Смирнова', name: 'Смирнова Наташа', handicap: 18.4 } },
    { id: 'u2', data: { firstName: 'Наталия', lastName: 'Смирнова', middleName: 'Петровна', name: 'Смирнова Наталия Петровна', handicap: 21.0 } },
    { id: 'u3', data: { firstName: 'Иван', lastName: 'Иванов', middleName: 'Иванович', name: 'Иванов Иван Иванович', handicap: 5.0 } },
    { id: 'u4', data: { firstName: 'Иван', lastName: 'Иванов', middleName: 'Петрович', name: 'Иванов Иван Петрович', handicap: 9.0 } }
];
var groups = sandbox.rgFindDuplicateGroups(players);
check('режим B     | найдена 1 группа дублей (Наташа/Наталия Смирнова)', groups.length, 1);
check('режим B     | в группе именно Смирновы', groups[0] && groups[0].players.map(function(p) { return p.id; }), ['u1', 'u2']);
check('режим B     | отец и сын (Ивановы с разными отчествами) НЕ склеены',
    groups.some(function(g) { return g.players.some(function(p) { return p.id === 'u3'; }); }), false);

sandbox.NameVariants.setMode('off');
check('режим off   | дублей не видно (прежнее поведение)', sandbox.rgFindDuplicateGroups(players).length, 0);

console.log('\n=== js/admin.js: impNameKey — «уже есть» при импорте из Excel ===\n');
sandbox.NameVariants.setMode('B');
check('режим B     | строка «Наталия Смирнова» найдёт игрока «Смирнова Наташа»',
    sandbox.impNameKey({ firstName: 'Наталия', lastName: 'Смирнова' }) ===
    sandbox.impNameKey({ firstName: 'Наташа', lastName: 'Смирнова' }), true);
sandbox.NameVariants.setMode('off');
check('режим off   | строка «Наталия Смирнова» НЕ находит «Смирнова Наташа»',
    sandbox.impNameKey({ firstName: 'Наталия', lastName: 'Смирнова' }) ===
    sandbox.impNameKey({ firstName: 'Наташа', lastName: 'Смирнова' }), false);

console.log('\nИтого: ' + total + ' проверок, ошибок: ' + fails);
if (fails) process.exit(1);
