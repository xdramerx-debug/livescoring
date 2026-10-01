#!/usr/bin/env node
/**
 * Проверка UI новой турнирной системы (tn-admin.html + js/tn-admin.js).
 *
 *   npm i jsdom                              (один раз, только для разработки)
 *   NODE_PATH=$(pwd)/node_modules node tools/test-tn-admin-ui.js
 *
 * Регрессия к «+ Создать турнир» (v1.94.0): в списке турниров tnaRender()
 * возвращался раньше tnaAfterRender(), поэтому у кнопки «+ Создать турнир»
 * (и у карточек турниров) не вешался onclick — кнопка рендерилась, но клик
 * «упирался в пустоту». Теперь проверяем:
 *   — кнопка в списке существует и имеет обработчик;
 *   — клик открывает рабочую область (шаг «Настройки», дефолтный конфиг);
 *   — возврат «К списку» снова привязывает обработчик;
 *   — карточки турниров кликабельны и открывают турнир.
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
var html = fs.readFileSync(path.join(ROOT, 'tn-admin.html'), 'utf8');

var dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/tn-admin.html' });
var win = dom.window;

// --- заглушка Firebase RTDB: on/off + синхронные «обновления» ---
var fakeDb = {
    data: { tournaments: {} },
    listeners: {},
    ref: function (p) {
        var self = this;
        return {
            on: function (ev, cb) {
                (self.listeners[p] = self.listeners[p] || []).push(cb);
                cb({ val: function () { return self.data[p] || null; } });
            },
            off: function () { self.listeners[p] = []; }
        };
    },
    fire: function (p) {
        var self = this;
        (this.listeners[p] || []).forEach(function (cb) {
            cb({ val: function () { return self.data[p] || null; } });
        });
    }
};
win.db = fakeDb;
win.currentLang = 'ru';
win.toast = function () {};

// Ядро (чистая логика) и UI-слой — в порядке подключения tn-admin.html.
win.eval(fs.readFileSync(path.join(ROOT, 'js/tn-admin-core.js'), 'utf8'));
win.eval(fs.readFileSync(path.join(ROOT, 'js/tn-admin.js'), 'utf8'));

var fails = 0, total = 0;
function check(title, cond, extra) {
    total++;
    if (!cond) fails++;
    console.log((cond ? ' ok  ' : 'FAIL ') + ' | ' + title + (extra ? ' → ' + extra : ''));
}

// DOMContentLoaded в jsdom уже «прошёл» — инициализируем явно.
win.tnaInit();

console.log('=== Список турниров: кнопка «+ Создать турнир» ===\n');

check('корень #tna-root существует', !!win.document.getElementById('tna-root'));
var listHtml = win.document.getElementById('tna-root').innerHTML;
check('кнопка «+ Создать турнир» отрисована в списке', listHtml.indexOf('tna-create-btn') !== -1);

var createBtn = win.document.getElementById('tna-create-btn');
check('РЕГРЕССИЯ: у кнопки есть onclick (ранний return в tnaRender оставлял её «мёртвой»)',
    !!createBtn && typeof createBtn.onclick === 'function',
    createBtn ? ('onclick=' + String(createBtn.onclick)) : 'кнопка не найдена');

console.log('\n=== Клик по «+ Создать турнир» ===\n');

createBtn.click();
check('переход в рабочую область', win.tnaState.view === 'workspace', 'view=' + win.tnaState.view);
check('открыт шаг «Настройки»', win.tnaState.step === 1, 'step=' + win.tnaState.step);
check('форма настроек отрисована (#tna-save-settings)',
    !!win.document.getElementById('tna-save-settings'));
check('подключено ядро: загружен дефолтный конфиг (Stroke Play)',
    !!(win.tnaState.cfg && win.tnaState.cfg.scoring === 'stroke'),
    win.tnaState.cfg ? JSON.stringify(win.tnaState.cfg.scoring) : 'cfg=null');
check('у «Сохранить настройки» есть обработчик',
    typeof win.document.getElementById('tna-save-settings').onclick === 'function');

console.log('\n=== Возврат «К списку»: обработчики не теряются ===\n');

win.document.getElementById('tna-back-btn').click();
check('возврат в список', win.tnaState.view === 'list', 'view=' + win.tnaState.view);
var createBtn2 = win.document.getElementById('tna-create-btn');
check('кнопка «+ Создать турнир» снова привязана',
    !!createBtn2 && typeof createBtn2.onclick === 'function');

console.log('\n=== Карточки турниров кликабельны ===\n');

fakeDb.data.tournaments.t1 = {
    name: 'Кубок клуба', date: '2026-10-01', source: 'tn-admin',
    status: 'upcoming', cfg: {}, registeredPlayers: {}
};
fakeDb.fire('tournaments');
var card = win.document.querySelector('[data-tna-open]');
check('карточка турнира отрисована', !!card);
check('РЕГРЕССИЯ: у карточки есть onclick', !!card && typeof card.onclick === 'function');
card.click();
check('клик по карточке открыл турнир',
    win.tnaState.view === 'workspace' && win.tnaState.tnId === 't1',
    'view=' + win.tnaState.view + ', tnId=' + win.tnaState.tnId);

console.log('\nИтого: ' + total + ' проверок, ошибок: ' + fails);
process.exit(fails ? 1 : 0);
