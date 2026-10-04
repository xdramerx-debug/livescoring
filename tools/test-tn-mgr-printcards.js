#!/usr/bin/env node
'use strict';

var path = require('path');
var ROOT = path.join(__dirname, '..');
var fails = 0;
var total = 0;

function check(title, cond, extra) {
    total++;
    if (!cond) fails++;
    console.log((cond ? ' ok  ' : 'FAIL ') + ' | ' + title + (extra !== undefined ? ' → ' + extra : ''));
}

global.window = global;
global.TnMgrCore = require(path.join(ROOT, 'js/tn-mgr-core.js'));
global.TnMgrUI = {
    bi: function (ru) { return ru; },
    state: { route: { tid: 't1', tab: 'printcards' } },
    tournament: function () { return { id: 't1', name: 'Open', startDate: '2026-06-01' }; },
    playersOf: function () { return []; },
    roundsOf: function () { return [{ id: 'r1' }]; },
    sheetOf: function () { return {}; },
    playerOf: function () { return null; },
    on: function () {},
    modal: function () {},
    el: function () { return null; },
    btn: function () { return '<button></button>'; },
    esc: function (v) { return global.TnMgrCore.esc(v); },
    rootEl: function () { return null; },
    toastMsg: function () {},
    render: function () {},
    closeModal: function () {},
    openModal: function () {},
    baseUrl: function () { return 'https://example.test/'; }
};
global.TnMgrData = {
    write: function () { return Promise.resolve(); },
    sheetOrder: function (sheet) {
        var e = (sheet && sheet.entries) || {};
        return Object.keys(e).map(function (k) { return Object.assign({ playerId: k }, e[k]); });
    }
};
global.TnMgrIO = { printHtml: function () { return true; } };
global.TnMgr = { hasAccess: function () { return true; } };

var PC = require(path.join(ROOT, 'js/tn-mgr-printcards.js'));

var players = [
    { id: 'a', fio: 'Иванов Иван', hi: 12, teamId: 't-1', active: true },
    { id: 'b', fio: 'Петров Пётр', hi: 8, teamId: 't-1', active: true },
    { id: 'c', fio: 'Сидоров Сидор', hi: 18, active: true },
    { id: 'd', fio: 'Выбыл', hi: 10, active: false }
];
var entries = [
    { playerId: 'a', startHole: 1, flight: '1', startTime: '09:00', tee: 'wh', format: 'stroke' },
    { playerId: 'b', startHole: 1, flight: '1', startTime: '09:00', tee: 'wh', format: 'stroke' },
    { playerId: 'c', startHole: 10, flight: '2', startTime: '09:10', tee: 'bl', format: 'stroke' },
    { playerId: 'd', startHole: 10, flight: '2', startTime: '09:10', tee: 'bl', format: 'stroke' }
];

var cards = PC.buildCards(players, entries, {});
check('связка teamId даёт одну карточку на двоих', cards.filter(function (c) {
    return c.playerIds.slice().sort().join(',') === 'a,b';
}).length === 1);
check('одиночка — своя карточка', cards.filter(function (c) { return c.playerIds.join() === 'c'; }).length === 1);
var ids = [];
cards.forEach(function (c) { (c.playerIds || []).forEach(function (id) { ids.push(id); }); });
var uniq = ids.filter(function (id, i) { return ids.indexOf(id) === i; });
check('нет дублей playerId', ids.length === uniq.length, ids.join(','));

var pairOnly = PC.buildCards(
    [{ id: 'x', fio: 'А', pairId: 'p1', hi: 4 }],
    [{ playerId: 'x', startHole: 3, flight: 'A', format: 'fourball' }],
    {}
);
check('неполная связка помечается', pairOnly[0] && pairOnly[0].missingPair === true);

var ov = PC.clampOverlay({ xMm: -10, yMm: 500, wMm: 400, hMm: 10, id: 'z', type: 'logo' });
check('оверлей не выходит за карточку по X', ov.xMm >= 0 && ov.xMm + ov.wMm <= PC.CARD_W);
check('оверлей не выходит за карточку по Y', ov.yMm >= 0 && ov.yMm + ov.hMm <= PC.CARD_H);

var d = PC.defaultDraft();
check('смещение по умолчанию X=140 Y=40', d.layout.xMm === 140 && d.layout.yMm === 40);
check('масштаб 100%', d.layout.scale === 1);
check('18 пар', d.pars.length === 18);
check('пар в диапазоне 3–6', d.pars.every(function (p) { return p >= 3 && p <= 6; }));

var merged = PC.mergeManual(
    [{ id: 'auto-c', playerIds: ['c'], names: ['Сидоров'], manual: false }],
    [{ id: 'manual-1', playerIds: [], names: ['Гость'], manual: true }]
);
check('ручная карточка не пропадает', merged.some(function (c) { return c.manual && c.names[0] === 'Гость'; }));
check('ручная не дублирует занятого игрока', !PC.mergeManual(
    [{ id: 'auto-a', playerIds: ['a'], names: ['Иванов'], manual: false }],
    [{ id: 'manual-a', playerIds: ['a'], names: ['Иванов'], manual: true }]
).some(function (c) { return c.manual && (c.playerIds || []).indexOf('a') !== -1 && c.id === 'manual-a' && c.playerIds.length; }));

check('неактивный игрок распознаётся', PC.isActivePlayer({ active: false }) === false);

console.log('\n' + (fails ? '✗ ' + fails + ' / ' + total : 'All tn-mgr-printcards tests passed ✔ (' + total + ' checks)'));
process.exit(fails ? 1 : 0);
