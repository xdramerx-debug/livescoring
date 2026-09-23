#!/usr/bin/env node
/**
 * UI-тест единой вкладки «Турниры 🏆» (js/tn-studio.js).
 *
 *   NODE_PATH=$(pwd)/../nmtest/node_modules node tools/test-tn-studio-unified.js
 *
 * Поднимает настоящий admin.html в jsdom, выполняет js/tn-studio-core.js и
 * js/tn-studio.js с имитированным Firebase и проверяет:
 *   список ВСЕХ турниров с бейджем источника (Студия/Мастер/Классика),
 *   7 разделов карточки, монтирование встраиваемых модулей из парковки
 *   (#tn-embed-parking) в хосты (#tns-host-*) и обратно, hash-роутер,
 *   «Подтвердить все» для заявок.
 *
 * Мастер/управление/стартовый лист здесь НЕ загружаются: навигация обязана
 * деградировать (typeof-гарды), а рендер — работать.
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

// ---- заглушки окружения ----
win.currentLang = 'ru';
win.toast = function () {};
win.escapeHtml = function (v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
win.switchTab = function (t) {
    win.document.querySelectorAll('.admin-section').forEach(function (s) { s.classList.add('hidden'); });
    var pane = win.document.getElementById('tab-' + t);
    if (pane) pane.classList.remove('hidden');
};
win.TEES = { bk: 'Чёрный', bl: 'Синий', wh: 'Белый', rd: 'Красный' };
win.COURSE_RATINGS = { men: { wh: { cr: 72.0, sr: 113 } }, women: { wh: { cr: 72.0, sr: 113 } } };
win.holePar = function () { return 4; };
win.holeDist = function () { return 300; };
win.holeHcp = function (h) { return h; };
win.getFieldHcp = function (hi) { return hi == null ? null : Math.round(hi); };

var feeds = {};
win.bindRealtimeValue = function (name, ref, cb) { feeds[name] = cb; };
function fire(name, data) { if (feeds[name]) feeds[name]({ val: function () { return data; } }); }
win.db = { ref: function () { return {}; } };

win.eval(fs.readFileSync(path.join(ROOT, 'js/tn-studio-core.js'), 'utf8'));
win.eval(fs.readFileSync(path.join(ROOT, 'js/tn-studio.js'), 'utf8'));

var fails = 0, total = 0;
function check(title, cond, extra) {
    total++;
    if (!cond) fails++;
    console.log((cond ? ' ok  ' : 'FAIL ') + ' | ' + title + (extra ? ' → ' + extra : ''));
}
function $id(id) { return win.document.getElementById(id); }
function $sel(s) { return win.document.querySelector(s); }
function $all(s) { return Array.prototype.slice.call(win.document.querySelectorAll(s)); }
function click(node) {
    node.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}
function inStudio(id) {
    var n = $id(id), s = $id('tn-studio-root');
    return !!(n && s && s.contains(n));
}
function inParking(id) {
    var n = $id(id), p = $id('tn-embed-parking');
    return !!(n && p && p.contains(n));
}

var tournaments = {
    t1: { name: 'Кубок Студии', date: '2026-09-20', endDate: '2026-09-21', fromStudio: true, publicAccess: true },
    t2: { name: 'Кубок Мастера', date: '2026-09-22', fromWizard: true, publicAccess: true },
    t3: { name: 'Классический кубок', date: '2026-09-23', status: 'upcoming' }
};

console.log('=== Открытие единой вкладки: список всех турниров ===');
win.tnStudioOpen();
fire('tn-studio-tournaments', tournaments);
var rows = $all('#tn-studio-root .tns-table tbody tr');
check('показаны все 3 турнира (без фильтра fromStudio)', rows.length === 3, 'строк: ' + rows.length);
var listText = $id('tn-studio-root').textContent;
check('бейдж «Студия»', listText.indexOf('Студия') !== -1);
check('бейдж «Мастер»', listText.indexOf('Мастер') !== -1);
check('бейдж «Классика»', listText.indexOf('Классика') !== -1);
check('кнопки «Добавить турнир» и «Мастер из 10 шагов»',
    !!$sel('[data-act="create"]') && !!$sel('[data-act="wizard-new"]'));
check('разделы списка: Турниры/Шаблоны/Поле клуба', $all('[data-act="section"]').length === 3);

console.log('\n=== Карточка классического турнира: 7 разделов ===');
click($sel('[data-act="open"][data-id="t3"]'));
var tabs = $all('#tn-studio-root [data-act="tab"]').map(function (b) { return b.getAttribute('data-id'); });
check('разделы rounds/groups/players/start/settings/manage/info',
    JSON.stringify(tabs) === JSON.stringify(['rounds', 'groups', 'players', 'start', 'settings', 'manage', 'info']),
    tabs.join(','));

console.log('\n=== Раздел «Группы»: классическая панель + состав зачётов ===');
tournaments.t3.divisions = { d1: { name: 'Мужчины 0–12', gender: 'men', hcpFrom: 0, hcpTo: 12, tee: 'bl', format: 'Stroke Play (Gross)', members: { p1: true }, ageLabel: '19-' } };
tournaments.t3.registeredPlayers = { p1: { name: 'Иванов Иван', handicap: 10, gender: 'men' }, p2: { name: 'Петров Пётр', handicap: 5, gender: 'men' } };
fire('tn-studio-tournaments', tournaments);
click($sel('[data-act="tab"][data-id="groups"]'));
check('без классического модуля — студийная форма (#tns-div)', !!$sel('#tns-div') && !$id('tn-div-t3'));
check('admin.html подключает js/admin-tournaments.js (движок панели)', html.indexOf('js/admin-tournaments.js') !== -1);
// НАСТОЯЩИЙ классический модуль + стендин чистого хелпера нормализации из
// utils.js (сам хелпер по-настоящему покрыт tools/test-admin-tn-groups.js).
win.t = function (k) { return k; };
win.tnNormalizeDivisions = function (t) {
    return Object.keys(t.divisions || {}).map(function (k) {
        var d = t.divisions[k] || {};
        return { id: k, name: d.name, gender: d.gender, hcpFrom: d.hcpFrom, hcpTo: d.hcpTo, tee: d.tee, format: d.format, members: d.members };
    });
};
win.eval(fs.readFileSync(path.join(ROOT, 'js/admin-tournaments.js'), 'utf8'));
click($sel('[data-act="tab"][data-id="groups"]'));
check('классическая панель вмонтирована в свой контейнер', inStudio('tn-div-t3'));
check('кэш tnTnVals подставлен Студией', !!(win.tnTnVals && win.tnTnVals.t3 && win.tnTnVals.t3.divisions));
check('обрезка гандикапа: чекбокс tn-cut-enabled', !!$id('tn-cut-enabled-t3'));
check('умные группы: селектор числа групп + кнопка',
    !!$id('tnd-count-t3') && $id('tn-studio-root').textContent.indexOf('Умные группы') !== -1);
check('ручное добавление: поле tnd-name', !!$id('tnd-name-t3'));
check('секция «Состав зачётов» ниже панели', $id('tn-studio-root').textContent.indexOf('Состав зачётов') !== -1);
check('возраст зачёта правится (div-age)', !!$sel('[data-act="div-age"]'));
check('назначение из состава (assign)', !!$sel('[data-act="assign"][data-id="d1"]'));
delete win.tnDivisionsEditorHtml;
delete win.tnNormalizeDivisions;

console.log('\n=== Раздел «Стартовый лист»: монтирование модулей ===');
click($sel('[data-act="tab"][data-id="start"]'));
check('стартовый лист вмонтирован в карточку', inStudio('tab-start-content'));
check('быстрый редактор протокола вмонтирован', inStudio('pe-card'));

console.log('\n=== Раздел «Настройки»: мастер без драфта деградирует ===');
click($sel('[data-act="tab"][data-id="settings"]'));
check('корень мастера вмонтирован', inStudio('tn-wizard-root'));
check('стартовый лист вернулся в парковку', inParking('tab-start-content'));
check('показана кнопка «Открыть мастер» (модуль не загружен)', !!$sel('[data-act="wizard-edit"]'));

console.log('\n=== Раздел «Управление»: монтирование без модуля ===');
click($sel('[data-act="tab"][data-id="manage"]'));
check('корень управления вмонтирован', inStudio('tn-manage-root'));
check('мастер вернулся в парковку', inParking('tn-wizard-root'));

console.log('\n=== Назад в список: всё возвращается в парковку ===');
click($sel('[data-act="back-list"]'));
check('список снова виден', $all('#tn-studio-root .tns-table tbody tr').length === 3);
check('все корни в парковке',
    ['tn-wizard-root', 'tn-manage-root', 'tn-course-root', 'tn-templates-root', 'tab-start-content', 'pe-card'].every(inParking));

console.log('\n=== Разделы «Шаблоны» и «Поле клуба» ===');
click($sel('[data-act="section"][data-id="templates"]'));
check('шаблоны вмонтированы', inStudio('tn-templates-root'));
click($sel('[data-act="section"][data-id="course"]'));
check('поле вмонтировано', inStudio('tn-course-root'));
check('шаблоны вернулись в парковку', inParking('tn-templates-root'));

console.log('\n=== Hash-роутер ===');
win.location.hash = '#templates';
check('tnsRouteHash(#templates) ведёт в раздел шаблонов',
    win.tnsRouteHash() === true && inStudio('tn-templates-root'));
win.location.hash = '#new-create';
check('tnsRouteHash(#new-create) открывает мастера', win.tnsRouteHash() === true && inStudio('tn-wizard-root'));
win.location.hash = '#course';
check('tnsRouteHash(#course) открывает поле', win.tnsRouteHash() === true && inStudio('tn-course-root'));
win.location.hash = '#manage';
check('tnsRouteHash(#manage) ведёт в список', win.tnsRouteHash() === true && $all('#tn-studio-root .tns-table tbody tr').length === 3);
win.location.hash = '#nope';
check('неизвестный hash игнорируется', win.tnsRouteHash() === false);

console.log('\n=== Заявки: «Подтвердить все» ===');
tournaments.t1.applications = {
    a1: { name: 'Иванов Иван', handicap: 10, status: 'pending' },
    a2: { name: 'Петров Пётр', handicap: 20, status: 'pending' }
};
fire('tn-studio-tournaments', tournaments);
click($sel('[data-act="open"][data-id="t1"]'));
click($sel('[data-act="tab"][data-id="players"]'));
check('кнопка «Подтвердить все» при 2 заявках', !!$sel('[data-act="approve-all"]'));

console.log('\n' + total + ' проверок, ошибок: ' + fails);
process.exit(fails ? 1 : 0);
