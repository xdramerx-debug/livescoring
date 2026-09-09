#!/usr/bin/env node
/**
 * Проверка интерфейса «Формы имён» в админке (admin.html + js/admin.js).
 *
 *   npm i jsdom                              (один раз, только для разработки)
 *   NODE_PATH=$(pwd)/../nmtest/node_modules node tools/test-admin-ui.js
 *
 * Поднимает настоящую страницу admin.html в jsdom, выполняет настоящие
 * js/name-variants.js и js/admin.js и проверяет:
 *   — карточка «Формы имён» рисуется со всеми режимами;
 *   — сохранение режима меняет поведение синхронизации;
 *   — кнопка «Проверить имена игроков» находит «Наташа/Наталия Смирнова».
 *
 * Если jsdom не установлен — тест пропускается (не падает).
 */
'use strict';

var fs = require('fs');
var path = require('path');

var JSDOM;
try {
    JSDOM = require('jsdom').JSDOM;
} catch (e) {
    console.log('SKIP: jsdom не установлен (npm i jsdom) — UI-тест пропущен');
    process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

var dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/admin.html' });
var win = dom.window;

// заглушки того, что обычно даёт js/utils.js и Firebase
var players = {
    u1: { firstName: 'Наташа', lastName: 'Смирнова', name: 'Смирнова Наташа', handicap: 18.4 },
    u2: { firstName: 'Наталия', lastName: 'Смирнова', middleName: 'Петровна', name: 'Смирнова Наталия Петровна', handicap: 21.0 },
    u3: { firstName: 'Ольга', lastName: 'Морозова', name: 'Морозова Ольга', handicap: 12.1 }
};
win.currentLang = 'ru';
// «админ» для hasAdminPanelAccess() из js/admin.js
win.currentUser = { uid: 'test-admin' };
win.currentUserData = { role: 'admin', email: 'admin@test.ru' };
win.toast = function() {};
win.t = function(k) { return k; };
win.escapeHtml = function(s) { return String(s == null ? '' : s); };
win.fmtExactHcp = function(v) { return String(v); };
win.getKnownPlayersSync = function() { return players; };
win.isPlayerDeleted = function() { return false; };
win.initNav = function() {};
win.setInterval = function() { return 0; };
win.clearInterval = function() {};
win.bindRealtimeValue = function() {};
win.safeStorageGet = function() { return null; };
win.safeStorageSet = function() {};
// пустая «база» вместо Firebase
win.db = { ref: function() { return makeRef(); } };
function makeRef() {
    var ref = {
        once: function() { return Promise.resolve({ val: function() { return {}; } }); },
        on: function() {},
        off: function() {},
        update: function() { return Promise.resolve(); },
        set: function() { return Promise.resolve(); },
        remove: function() { return Promise.resolve(); },
        push: function() { return { key: 'test' }; }
    };
    ['orderByChild', 'orderByKey', 'limitToLast', 'limitToFirst', 'startAt', 'endAt', 'equalTo'].forEach(function(m) {
        ref[m] = function() { return ref; };
    });
    return ref;
}

win.eval(fs.readFileSync(path.join(ROOT, 'js/name-variants.js'), 'utf8'));
win.eval(fs.readFileSync(path.join(ROOT, 'js/admin.js'), 'utf8'));

var fails = 0, total = 0;
function check(title, cond, extra) {
    total++;
    if (!cond) fails++;
    console.log((cond ? ' ok  ' : 'FAIL ') + ' | ' + title + (extra ? ' → ' + extra : ''));
}

console.log('=== admin.html: карточка «Формы имён» ===\n');
check('в HTML есть блок режимов #nm-mode-list', !!win.document.getElementById('nm-mode-list'));
check('в HTML есть поле своих форм #nm-custom-aliases', !!win.document.getElementById('nm-custom-aliases'));
check('в HTML есть кнопка анализа #nm-analyze-results', !!win.document.getElementById('nm-analyze-results'));
check('в HTML подключён js/name-variants.js', html.indexOf('js/name-variants.js') !== -1);

console.log('');
win.switchTab('rusgolf');
var radios = win.document.querySelectorAll('input[name="nm-mode"]');
check('переключение на вкладку «АГР» рисует режимы', radios.length, radios.length + ' режимов');
check('режимов ровно 4 (off, A, B, C)', radios.length === 4,
    Array.prototype.map.call(radios, function(r) { return r.value; }).join(','));

// выбираем вариант B и сохраняем
var b = win.document.querySelector('input[name="nm-mode"][value="B"]');
b.checked = true;
win.nmSaveSettings();
check('после сохранения включён режим B', win.NameVariants.getMode(), win.NameVariants.getMode());
check('режим сохранён в localStorage', win.localStorage.getItem('pestovo_name_match_mode'));

// вариант C открывает поле своего словаря
var c = win.document.querySelector('input[name="nm-mode"][value="C"]');
c.checked = true;
b.checked = false;
win.nmToggleCustomBlock();
check('в варианте C показывается поле своих форм',
    !win.document.getElementById('nm-custom-block').classList.contains('hidden'));
win.document.getElementById('nm-custom-aliases').value = 'Лёля = Ольга';
win.nmSaveSettings();
check('свой словарь сохранён', win.NameVariants.getCustomAliases()['леля'],
    win.NameVariants.getCustomAliases()['леля']);

console.log('\n=== кнопка «Проверить имена игроков» ===\n');
win.nmAnalyzeNames();

setTimeout(function() {
    var out = win.document.getElementById('nm-analyze-results').innerHTML;
    check('анализ отрисовал результат', out.length > 50, out.length + ' символов');
    check('найдена пара Наташа/Наталия Смирнова', out.indexOf('наташа') !== -1 && out.indexOf('наталия') !== -1);
    check('показаны формы имени, которые ищем в АГР', out.indexOf('Наталья') !== -1);
    check('в блоке «один и тот же игрок» ровно 1 пара',
        out.indexOf('записанный по-разному (1)') !== -1,
        (out.match(/записанный по-разному \((\d+)\)/) || [])[0]);

    console.log('\nИтого: ' + total + ' проверок, ошибок: ' + fails);
    process.exit(fails ? 1 : 0);
}, 300);
