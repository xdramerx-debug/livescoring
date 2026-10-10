#!/usr/bin/env node
/**
 * Проверка «Отображение карточек в турнире».
 *
 * Что проверяется:
 *   1. js/utils.js: нормализация вида/блоков, запись настроек, классы tn-hide-*
 *      на <body>, вид карточки для турнирного и обычного раунда, realtime-обновление;
 *   2. admin.html #tab-tncards: 5 вариантов, переключатели блоков, предпросмотр,
 *      запись settings/tn_round_card_view и settings/tn_round_card_blocks;
 *   3. setup-round.html: у каждого блока экрана ввода есть селектор из
 *      TN_ROUND_CARD_BLOCKS (иначе переключатель в админке ничего не скроет).
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
    console.log('SKIP: jsdom не установлен (npm i jsdom) — тест карточек в турнире пропущен');
    process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var passed = 0;
function check(cond, msg) { assert.ok(cond, msg); passed++; console.log('  ok — ' + msg); }

// ---- общий стенд: admin.html + настоящие js/utils.js и js/admin-display.js ----
var admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
var start = admin.indexOf('<div id="tab-tncards"');
assert.ok(start > 0, 'в admin.html есть вкладка #tab-tncards');
var section = admin.slice(start, admin.indexOf('<div id="tab-', start + 10));

var dom = new JSDOM('<!doctype html><html><body>' + section.replace('admin-section hidden', 'admin-section') + '</body></html>',
    { runScripts: 'outside-only', url: 'https://example.test/admin.html' });
var win = dom.window;
var doc = win.document;

var writes = [];
var listeners = {};
win.db = {
    ref: function (p) {
        return {
            set: function (v) { writes.push([p, v]); return Promise.resolve(); },
            update: function (v) { writes.push([p, v]); return Promise.resolve(); },
            on: function (ev, cb) { listeners[p] = cb; },
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

// ===== 1. Ядро настроек (js/utils.js) =====
check(win.normalizeTnRoundCardView(3) === '3' && win.normalizeTnRoundCardView('7') === '' &&
    win.normalizeTnRoundCardView(null) === '', 'вид карточки нормализуется в 1–5, остальное сбрасывается');
check(win.TN_ROUND_CARD_BLOCK_KEYS.length === 9, 'девять блоков экрана ввода');

var blocks = win.normalizeTnRoundCardBlocks({ pace: false, qr: false, holes: true, nonsense: false });
check(blocks.pace === false && blocks.qr === false && blocks.holes === true && !('nonsense' in blocks),
    'нормализация блоков: только известные ключи, false сохраняется');
check(Object.keys(win.normalizeTnRoundCardBlocks(null)).every(function (k) {
    return win.normalizeTnRoundCardBlocks(null)[k] === true;
}), 'без сохранённых настроек все блоки видны');

win.applyTnRoundCardView('4');
check(win.getTnRoundCardView() === '4', 'вид карточки применяется локально');
win.applyTnRoundCardBlocks({ pace: false, qr: false });
check(win.getTnRoundCardBlocks().pace === false && win.getTnRoundCardBlocks().qr === false, 'состав блоков применяется локально');

// классы на <body> для экрана ввода счёта
win.pestovoCurrentRound = function () {
    return { tournamentId: 't1', mode: 'group', tournamentRound: true, holeRange: '1-18', status: 'active' };
};
win.pestovoApplyTnRoundCardLayout(win.pestovoCurrentRound());
check(doc.body.classList.contains('tn-hide-pace'), 'скрытый блок «Темп игры» даёт класс tn-hide-pace');
check(doc.body.classList.contains('tn-hide-qr'), 'скрытый блок «QR-подключение» даёт класс tn-hide-qr');
check(!doc.body.classList.contains('tn-hide-holes'), 'видимый блок «Лунки» не скрывается');
check(doc.body.getAttribute('data-tn-card-view') === '4', 'вид карточки турнира пишется в data-tn-card-view');

win.pestovoApplyTnRoundCardLayout({ mode: 'group', status: 'active' });
check(!doc.body.classList.contains('tn-hide-pace'), 'в обычном раунде турнирные скрытия не применяются');

// вид карточки: турнирный раунд → настройка турнира, обычный → настройка клуба
win.applyTnRoundCardView('5');
check(win.pestovoRoundCardView({ tournamentId: 't1' }) === '5', 'в турнирном раунде действует вид карточки турнира');
check(win.pestovoRoundCardView(null) === win.getRoundScorecardView(), 'в обычном раунде действует вид клубной карточки');

// realtime: изменение настройки из базы сразу переключает вид
assert.ok(typeof listeners['settings/tn_round_card_view'] === 'function', 'есть realtime-подписка на вид карточки');
listeners['settings/tn_round_card_view']({ val: function () { return '2'; } });
check(win.getTnRoundCardView() === '2', 'realtime переключает вид карточки без перезагрузки');

// ===== 2. Вкладка админки =====
win.renderTnRoundCardAdmin();
check(doc.querySelectorAll('#tn-card-variants .sev-card').length === 5, 'в вкладке пять вариантов вида карточки');
check(doc.querySelectorAll('#tn-card-blocks input[data-tn-block]').length === 9, 'девять переключателей блоков');
check(doc.querySelectorAll('#tn-card-preview .club-sc').length === 1, 'предпросмотр показывает счётную карточку флайта');
check(doc.querySelector('#tn-card-preview .club-sc').getAttribute('data-sc-view') === '2',
    'предпросмотр следует за выбранным вариантом');

win.previewTnRoundCardView('3');
check(doc.querySelector('#tn-card-opt-3').getAttribute('aria-pressed') === 'true', 'выбранный вариант подсвечивается');
check(doc.querySelector('#tn-card-preview .club-sc').getAttribute('data-sc-view') === '3', 'предпросмотр обновился');

win.setTnRoundCardBlock('pace', false);
win.saveTnRoundCardBlocks();

setTimeout(function () {
    var byPath = {};
    writes.forEach(function (w) { byPath[w[0]] = w[1]; });
    check(byPath['settings/tn_round_card_blocks'] && byPath['settings/tn_round_card_blocks'].pace === false,
        'состав блоков пишется в settings/tn_round_card_blocks');
    check(win.getTnRoundCardBlocks().pace === false, 'сохранённые блоки сразу применены локально');

    win.saveTnRoundCardView('3');
    setTimeout(function () {
        writes.forEach(function (w) { byPath[w[0]] = w[1]; });
        check(byPath['settings/tn_round_card_view'] === '3', '«Применить для всех» пишет settings/tn_round_card_view');
        check(win.getTnRoundCardView() === '3', 'сохранённый вид сразу применён локально');
        finish();
    }, 30);
}, 30);

function finish() {
    // ===== 3. Селекторы блоков действительно находят элементы на экране ввода =====
    // Реальные страницы в jsdom: если селектор не найдёт ничего, переключатель
    // в админке будет «визжать», но ничего не скрывать.
    var pages = {};
    ['setup-round.html', 'scorer.html'].forEach(function (name) {
        var html = fs.readFileSync(path.join(ROOT, name), 'utf8');
        pages[name] = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/' + name }).window.document;
    });
    win.TN_ROUND_CARD_BLOCK_KEYS.forEach(function (key) {
        var sels = win.TN_ROUND_CARD_BLOCKS[key].sel;
        sels.forEach(function (sel) {
            var hits = 0;
            Object.keys(pages).forEach(function (name) {
                hits += pages[name].querySelectorAll(sel).length;
            });
            check(hits > 0, 'блок «' + win.TN_ROUND_CARD_BLOCKS[key].ru + '»: селектор ' + sel + ' находит элемент на экране ввода');
        });
    });

    console.log('\nPASS: карточки в турнире — ' + passed + ' проверок');
}
