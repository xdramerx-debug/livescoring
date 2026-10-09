#!/usr/bin/env node
/**
 * Проверка «Ввод счёта»: сохранённые варианты экрана и «что показывать».
 *
 * Поднимает раздел #tab-scoreentry из admin.html в jsdom, выполняет настоящие
 * js/utils.js и js/admin-display.js и проверяет:
 *   — список вариантов по умолчанию (5 стилей), добавление, изменение, удаление;
 *   — переключатели «что показывать» меняют data-entry-hide в предпросмотре;
 *   — «Сохранить вариант» пишет только вариант, «Применить для всех» пишет
 *     scoring_view / scoring_order / scoring_show / scoring_active одной операцией;
 *   — удаление активного варианта переносит активность на другой вариант.
 *
 * Если jsdom не установлен — тест пропускается (не падает).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var JSDOM;
try {
    JSDOM = require('jsdom').JSDOM;
} catch (e) {
    console.log('SKIP: jsdom не установлен (npm i jsdom) — тест вариантов ввода счёта пропущен');
    process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
var start = admin.indexOf('<div id="tab-scoreentry"');
var section = admin.slice(start, admin.indexOf('<div id="tab-', start + 10));

var dom = new JSDOM('<!doctype html><html><body>' + section.replace('admin-section hidden', 'admin-section') + '</body></html>',
    { runScripts: 'outside-only', url: 'https://example.test/admin.html' });
var win = dom.window;
var calls = [];
win.db = {
    ref: function () {
        return {
            update: function (value) { calls.push(value); return Promise.resolve(); },
            on: function (ev, cb) { setTimeout(function () { cb({ val: function () { return null; } }); }, 0); },
            once: function () { return Promise.resolve({ val: function () { return null; } }); }
        };
    }
};
win.currentLang = 'ru';
win.toast = function () {};
win.vib = function () {};
['course-config', 'format', 'dom', 'i18n', 'utils', 'admin-display'].forEach(function (f) {
    win.eval(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'));
});

var doc = win.document;
var passed = 0;
function check(cond, msg) { assert.ok(cond, msg); passed++; console.log('  ok — ' + msg); }

setTimeout(function () {
    win.bindScoreEntryAdmin();
    setTimeout(run, 30);
}, 0);

function run() {
    check(doc.querySelectorAll('#score-entry-list .se-item').length === 5, 'по умолчанию 5 вариантов (стили 1–5)');
    check(doc.querySelectorAll('#score-entry-show input').length === 7, 'семь переключателей «что показывать»');

    win.setScoreEntryShow('par', false);
    check(doc.querySelector('#score-entry-preview .score-entry').getAttribute('data-entry-hide') === 'par', 'выключенный «Пар» попадает в data-entry-hide');
    win.setScoreEntryShow('par', true);
    check(!doc.querySelector('#score-entry-preview .score-entry').hasAttribute('data-entry-hide'), 'включённый «Пар» снова виден');

    win.addScoreEntryVariant();
    win.previewScoreEntryView('3');
    win.setScoreEntryName('Турнирный вид');
    win.setScoreEntryShow('hcp', false);
    win.setScoreEntryShow('dist', false);
    win.saveScoreEntryVariant(false);

    setTimeout(function () {
        var saveOnly = calls[calls.length - 1];
        var keys = Object.keys(saveOnly);
        check(keys.length === 1 && keys[0].indexOf('scoring_variants/') === 0, '«Сохранить вариант» пишет только сам вариант');
        var id = keys[0].slice('scoring_variants/'.length);
        check(saveOnly[keys[0]].show.hcp === false && saveOnly[keys[0]].show.dist === false, 'настройки показа сохраняются в варианте');

        win.activateScoreEntryVariant(id);
        setTimeout(function () {
            var applied = calls[calls.length - 1];
            check(applied.scoring_active === id && applied.scoring_view === '3' && applied.scoring_show.hcp === false,
                '«Применить для всех» пишет вид, порядок, показ и активный вариант');
            check(win.getScoringView() === '3', 'вид применён локально');
            check(win.scoreEntryShow.hcp === false, 'показ применён локально');

            win.uiConfirm = function () { return Promise.resolve(true); };
            win.deleteScoreEntryVariant(id);
            setTimeout(function () {
                var deleted = calls[calls.length - 1];
                check(deleted['scoring_variants/' + id] === null, 'удаление пишет null по ключу варианта');
                check(deleted.scoring_active !== id && deleted.scoring_active !== undefined, 'удаление активного переносит активность на другой вариант');
                console.log('\nPASS: score-entry variants — ' + passed + ' проверок');
            }, 30);
        }, 20);
    }, 20);
}
