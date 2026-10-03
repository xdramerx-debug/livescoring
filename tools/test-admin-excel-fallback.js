// Проверяет Excel-fallback админки без парсера, удалённого вместе со стартовым листом.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const playersSource = fs.readFileSync(path.join(ROOT, 'js/admin-players-excel.js'), 'utf8');
const agrSource = fs.readFileSync(path.join(ROOT, 'js/admin-agr.js'), 'utf8');

assert.doesNotMatch(playersSource, /psParseExcelGrid/);
assert.doesNotMatch(agrSource, /psParseExcelGrid/);

function FakeFileReader() {}
FakeFileReader.prototype.readAsArrayBuffer = function () {
    this.onload({ target: { result: new ArrayBuffer(0) } });
};
function element() { return { innerHTML: '', textContent: '', value: '' }; }
function baseContext(extra) {
    return Object.assign({
        console,
        FileReader: FakeFileReader,
        currentLang: 'en',
        document: {
            getElementById: function () { return element(); },
            querySelectorAll: function () { return []; }
        },
        escapeHtml: function (value) { return String(value == null ? '' : value); },
        fmtExactHcp: function (value) { return String(value); },
        impNormName: function (value) {
            return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
        },
        impSplitName: function (value) {
            var parts = String(value || '').replace(/\s+/g, ' ').trim().split(' ');
            return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
        }
    }, extra || {});
}

// Импорт игроков: сохраняется прежний разбор по заголовкам первой страницы.
const playerSheet = { rows: [
    { 'First Name': 'Anna', 'Last Name': 'Sidorova', 'Handicap Index': '12,5', Gender: 'female' },
    { 'First Name': 'Ivan', 'Last Name': 'Petrov', 'Handicap Index': 'bad', Gender: 'male' }
] };
const ignoredPlayerSheet = { rows: [
    { 'First Name': 'Second', 'Last Name': 'Sheet', 'Handicap Index': 8 }
] };
const playerReadCalls = [];
const playerXlsx = {
    read: function () { return { SheetNames: ['Players', 'Ignored'], Sheets: { Players: playerSheet, Ignored: ignoredPlayerSheet } }; },
    utils: {
        sheet_to_json: function (sheet, options) {
            playerReadCalls.push({ sheet: sheet, options: options });
            return sheet.rows;
        }
    }
};
const playerContext = baseContext({ XLSX: playerXlsx });
vm.createContext(playerContext);
vm.runInContext(playersSource, playerContext, { filename: 'js/admin-players-excel.js' });
playerContext.handlePlayersFileSelect({ files: [{ name: 'players.xlsx' }], value: 'players.xlsx' });
assert.strictEqual(playerReadCalls.length, 1, 'игроки импортируются только из первой страницы fallback-парсером');
assert.strictEqual(playerReadCalls[0].sheet, playerSheet);
assert.strictEqual(JSON.stringify(playerReadCalls[0].options), JSON.stringify({ defval: '' }));
assert.strictEqual(playerContext.impParsedRows.length, 2, 'валидная и ошибочная строки попадают в предпросмотр');
assert.strictEqual(playerContext.impParsedRows[0].name, 'Anna Sidorova');
assert.strictEqual(playerContext.impParsedRows[0].hcp, 12.5);
assert.strictEqual(playerContext.impParsedRows[0].gender, 'women');
assert.strictEqual(playerContext.impParsedRows[1].error, 'bad handicap: bad');
assert.strictEqual(playerContext.impParsedRows.some(function (row) { return row.name === 'Second Sheet'; }), false,
    'поведение fallback не начинает сканировать остальные листы');

// Поиск гандикапа АГР: локальный fallback продолжает сканировать все листы.
const agrSheetA = { rows: [
    { 'First Name': 'Anna', 'Last Name': 'Sidorova' }
] };
const agrSheetB = { rows: [
    { Player: 'Sidorova Anna' },
    { Player: 'Petrov Ivan' }
] };
const agrReadCalls = [];
const agrContext = baseContext({
    XLSX: { utils: { sheet_to_json: function (sheet, options) {
        agrReadCalls.push({ sheet: sheet, options: options });
        return sheet.rows;
    } } }
});
vm.createContext(agrContext);
vm.runInContext(agrSource, agrContext, { filename: 'js/admin-agr.js' });
const agrRows = agrContext.rgBatchRowsFromWorkbook({
    SheetNames: ['Roster A', 'Roster B'],
    Sheets: { 'Roster A': agrSheetA, 'Roster B': agrSheetB }
});
assert.strictEqual(agrReadCalls.length, 2, 'АГР-fallback читает каждый лист книги');
assert.strictEqual(JSON.stringify(agrReadCalls.map(function (call) { return call.options; })), JSON.stringify([{ defval: '' }, { defval: '' }]));
assert.strictEqual(JSON.stringify(Array.from(agrRows, function (row) { return row.name; })), JSON.stringify(['Anna Sidorova', 'Ivan Petrov']),
    'АГР-fallback разбирает все листы и удаляет повтор ФИО');
assert.strictEqual(JSON.stringify(Array.from(agrRows, function (row) { return row.sheet; })), JSON.stringify(['Roster A', 'Roster B']));

console.log('Admin Excel fallback tests passed');
