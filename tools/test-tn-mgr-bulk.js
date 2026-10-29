#!/usr/bin/env node
// Импорт 5000 участников не должен делать 5000 round-trip в Firebase
// и не должен строить 5000 строк DOM в предпросмотре.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var fails = 0, total = 0;
function check(title, cond, extra) {
    total++;
    if (!cond) { fails++; console.log('FAIL', title, extra || ''); }
    else console.log('ok  -', title);
}

var updates = 0;
var store = {};
function sandboxDb() {
    return {
        ref: function () {
            return {
                update: function (chunk) {
                    updates++;
                    Object.keys(chunk || {}).forEach(function (k) { store[k] = chunk[k]; });
                    return Promise.resolve();
                },
                push: function () { return { key: 'k' + Object.keys(store).length }; },
                once: function () { return Promise.resolve({ val: function () { return null; } }); },
                set: function () { return Promise.resolve(); }
            };
        }
    };
}

var ctx = {
    console: console,
    Date: Date,
    Math: Math,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    requestAnimationFrame: function (cb) { setTimeout(cb, 0); },
    Promise: Promise,
    TnMgrCore: null,
    TnMgrData: null,
    db: sandboxDb(),
    currentUser: { uid: 'admin' }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/tn-mgr-core.js'), 'utf8'), ctx, { filename: 'tn-mgr-core.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/tn-mgr-data.js'), 'utf8'), ctx, { filename: 'tn-mgr-data.js' });

var N = 5000;
var rows = [['ФИО', 'Гандикап']];
for (var i = 0; i < N; i++) rows.push(['Иванов' + i + ' Иван', '12,4']);
var t0 = Date.now();
var parsed = ctx.TnMgrCore.parseWorkbook([{ name: 'Лист1', rows: rows }]);
var parseMs = Date.now() - t0;
check('parseWorkbook 5000 игроков', parsed.players.length === N, parsed.players.length);
check('разбор быстрее 2 с', parseMs < 2000, parseMs + 'ms');

updates = 0;
t0 = Date.now();
ctx.TnMgrData.addPlayers('tid1', parsed.players, { players: {} }).then(function (created) {
    var addMs = Date.now() - t0;
    check('addPlayers вернул 5000 id', created.length === N, created.length);
    check('Firebase update вызван порциями, не по одному (< 200)', updates > 0 && updates < 200, updates);
    check('пакетная запись быстрее 3 с', addMs < 3000, addMs + 'ms');

    var uiSrc = fs.readFileSync(path.join(ROOT, 'js/tn-mgr-ui.js'), 'utf8');
    var dataSrc = fs.readFileSync(path.join(ROOT, 'js/tn-mgr-data.js'), 'utf8');
    check('предпросмотр режет строки (PREVIEW_ROWS)', /PREVIEW_ROWS/.test(uiSrc));
    check('таблица участников постраничная (TABLE_PAGE_SIZE)', /TABLE_PAGE_SIZE/.test(uiSrc));
    check('addPlayers пишет пакетом через writeInChunks', dataSrc.indexOf('writeInChunks(updates, 200)') !== -1);

    if (fails) {
        console.log('\nFAILED', fails, '/', total);
        process.exit(1);
    }
    console.log('\nOK', total);
}).catch(function (err) {
    console.error(err);
    process.exit(1);
});
