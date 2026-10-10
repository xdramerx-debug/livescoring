// Проверка фокусного перехода на раунд после завершения счётной карточки.
'use strict';
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP: jsdom не установлен — тест фокусного табло пропущен'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const ROUND_ID = 'finished-round-42';
const dom = new JSDOM('<!doctype html><html><body>' +
    '<select id="lb-status"><option value="all">all</option><option value="active" selected>active</option></select>' +
    '<input id="lb-search" value="someone else"><div id="lb-summary"></div><div id="lb-container"></div>' +
    '</body></html>', {
        runScripts: 'dangerously',
        url: 'https://example.test/leaderboard.html?round=' + encodeURIComponent(ROUND_ID) + '&scorecard=1',
        pretendToBeVisual: true
    });
const win = dom.window;
const checks = [];
function check(condition, message) {
    checks.push({ condition: !!condition, message });
    if (!condition) console.error('FAIL:', message);
}

const rounds = {};
rounds[ROUND_ID] = {
    status: 'completed', createdAt: Date.now(), completedAt: Date.now(), format: 'Stroke Play', tee: 'wh',
    players: { p1: { name: 'Тестов Игрок', tee: 'wh', scores: { 1: 4 }, fieldHcp: 0, exactHcp: 0 } }
};
rounds['another-round'] = {
    status: 'completed', createdAt: Date.now() - 1000, format: 'Stroke Play', tee: 'wh',
    players: { p2: { name: 'Другой Игрок', tee: 'wh', scores: { 1: 5 }, fieldHcp: 0, exactHcp: 0 } }
};
win.initNav = function () {};
win.initDateRangeFilter = function () { return { renderSummary: function () {} }; };
win.getDateRangeFilter = function () { return { getRange: function () { return { active: true, from: 1, to: 2 }; }, renderSummary: function () {} }; };
// Имитируем сохранённый диапазон дат, скрывающий этот раунд: фокус должен
// принудительно вернуть его в список.
win.filterEntriesByDateRange = function () { return []; };
win.bindRealtimeValue = function (key, ref, callback) { callback({ val: function () { return rounds; } }); };
win.db = { ref: function () { return {}; } };
win.getAllRoundsDisplayVariant = function () { return '1'; };
win.getRoundOrder = function () { return [1]; };
win.getRoundHoleCount = function () { return 18; };
win.calcRoundStats = function () { return { gross: 4, toPar: 0, stablefordField: 2, stablefordExact: 2, holesPlayed: 1, currentHole: 2 }; };
win.dedupeRoundPlayersByFio = function (players) { return players; };
win.isPlayerDeleted = function () { return false; };
win.isPlayerFinishedRound = function () { return true; };
win.playerDisplayName = function (player) { return player.name; };
win.privacyDisplayName = function (player) { return player.name; };
win.fmtUserAvatar = function () { return '<span></span>'; };
win.scoreClass = function () { return ''; };
win.fmtScore = function (value) { return String(value == null ? 'E' : value); };
win.fmtDate = function () { return '07 Oct 2026'; };
win.fmtTime = function () { return '10:00'; };
win.fmtRoundTeePills = function () { return 'White'; };
win.pestovoNormalizeTeeCode = function (value) { return ['bk', 'bl', 'wh', 'rd'].indexOf(value) >= 0 ? value : 'wh'; };
win.pestovoTeeLabel = function (value) { return ({ bk: 'Black', bl: 'Blue', wh: 'White', rd: 'Red' })[value] || 'White'; };
win.pestovoInlineJsArg = function (value) { return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, '\\u0027').replace(/"/g, '\\u0022').replace(/</g, '\\x3c').replace(/>/g, '\\x3e').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/&/g, '\\u0026'); };
win.pestovoRoundFormatBadge = function () { return 'Stroke Play'; };
win.buildRoundStatusBadgeHTML = function () { return '<span>Завершён</span>'; };
win.escapeHtml = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, ''); };
win.t = function (key) {
    return ({
        tee_wh: 'White', player: 'Игрок', gross: 'Gross', players_label: 'Игроков', tee_select: 'Ти',
        expand_scorecard: 'Развернуть счётную карточку', collapse_scorecard: 'Свернуть счётную карточку'
    })[key] || key;
};
win.generateGroupHoleTableHTML = function () { return '<div class="test-scorecard">Saved scores</div>'; };
win.vib = function () {};
win.currentLang = 'ru';

win.eval(fs.readFileSync(path.join(ROOT, 'js/leaderboard.js'), 'utf8'));
win.document.dispatchEvent(new win.Event('DOMContentLoaded'));

const row = win.document.querySelector('.lb-row[data-round-id="' + ROUND_ID + '"]');
const panel = win.document.getElementById('lb-sc-' + ROUND_ID);
check(!!row, 'нужный раунд добавлен в список, даже если его скрывал фильтр');
check(win.document.querySelectorAll('.lb-row').length === 1, 'в режиме фокуса показан только завершённый раунд, а не общий список');
check(row && row.getAttribute('data-round-id') === ROUND_ID, 'ID фокусной карточки совпадает с ID в ссылке');
check(row && row.classList.contains('is-open'), 'фокусная карточка раунда раскрыта автоматически');
check(row && row.querySelector('.lwl-toggle').getAttribute('aria-expanded') === 'true', 'состояние раскрытия доступно скринридерам');
check(!!panel && !panel.classList.contains('hidden'), 'счётная карточка раскрыта автоматически по scorecard=1');
check(panel && panel.textContent.indexOf('Saved scores') !== -1, 'в открытой счётной карточке отображаются сохранённые результаты');

if (checks.some(function (item) { return !item.condition; })) process.exit(1);
console.log('OK:', checks.length, 'checks');
