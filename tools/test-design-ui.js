#!/usr/bin/env node
/**
 * UI-проверка системы шаблонов оформления в jsdom:
 *   npm i jsdom                                                   (один раз)
 *   NODE_PATH=/home/user/nmtest/node_modules node tools/test-design-ui.js
 *
 * Поднимает настоящие admin.html, design-preview.html, index.html и stats.html,
 * выполняет настоящие js/design-system.js, js/design-admin.js, js/design-preview.js
 * и проверяет:
 *   — вкладка «Дизайн 🎨» рисуется: шаблоны, страницы, блоки, предпросмотр;
 *   — клик по шаблону ставит атрибуты на <html> и сохраняет settings/design;
 *   — сборка из шаблонов (страница + блок) перебивает базовый шаблон;
 *   — страница сравнения показывает все шаблоны целиком и по блокам;
 *   — css/design-presets.css реально парсится браузерным движком.
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
var failures = [];
var checks = 0;

function ok(cond, msg, extra) {
    checks++;
    if (!cond) failures.push(msg + (extra === undefined ? '' : ' → ' + extra));
}

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

function makeWindow(file, opts) {
    var o = opts || {};
    var dom = new JSDOM(read(file), {
        runScripts: 'outside-only',
        url: 'https://example.test/' + file
    });
    var win = dom.window;
    win.toast = function(text, type) { win.__toasts = (win.__toasts || []).concat([{ text: text, type: type }]); };
    win.vib = function() {};
    win.currentLang = 'ru';

    // Мок Firebase: запоминает, что и куда сохраняем
    win.__writes = [];
    win.db = {
        ref: function(p) {
            return {
                set: function(val) { win.__writes.push({ path: p, val: val }); return Promise.resolve(); },
                once: function() { return Promise.resolve({ val: function() { return o.settingsValue || null; } }); },
                on: function() {}
            };
        }
    };
    win.currentUser = { uid: 'test-admin' };
    return win;
}

function run(win, file) {
    win.eval(read(file));
}

// jsdom оставляет readyState === 'loading', поэтому дожидаемся DOMContentLoaded
// и нескольких тиков — столько же, сколько нужно промисам мока Firebase.
function settle(win) {
    if (win.document.readyState === 'loading') {
        var ev = win.document.createEvent('Event');
        ev.initEvent('DOMContentLoaded', true, true);
        win.document.dispatchEvent(ev);
    }
    return new Promise(function(resolve) {
        setTimeout(function() { setTimeout(resolve, 0); }, 0);
    });
}

/* ---------------------------------------------------------
   1. Вкладка «Дизайн 🎨» в админке
   --------------------------------------------------------- */
async function testAdminTab() {
    var win = makeWindow('admin.html');
    run(win, 'js/design-system.js');
    run(win, 'js/design-admin.js');
    var doc = win.document;

    ok(!!win.PestovoDesign, 'PestovoDesign не подключён в админке');
    ok(doc.querySelectorAll('.admin-tab').length > 0, 'Вкладки админки не найдены');
    var designTab = Array.prototype.filter.call(doc.querySelectorAll('.admin-tab'), function(b) {
        return /Дизайн/.test(b.textContent);
    });
    ok(designTab.length === 1, 'Должна быть ровно одна вкладка «Дизайн 🎨»', designTab.length);
    ok(doc.getElementById('tab-design') !== null, 'Нет секции tab-design');

    await settle(win);
    win.dspAdminLoad();
    await settle(win);

    var globalBtns = doc.querySelectorAll('#dsp-global-wrap .dsp-opt');
    ok(globalBtns.length === 6, 'Базовых шаблонов должно быть 6 (текущий + 5)', globalBtns.length);
    ok(doc.querySelectorAll('#dsp-global-wrap .dsp-swatch').length === 6, 'У каждого шаблона должен быть цветной пробник');

    var pageRows = doc.querySelectorAll('#dsp-pages-wrap .dsp-row');
    ok(pageRows.length === win.PestovoDesign.PAGES.length, 'Строк страниц должно быть ' + win.PestovoDesign.PAGES.length, pageRows.length);
    ok(doc.querySelectorAll('#dsp-pages-wrap .dsp-chip').length === win.PestovoDesign.PAGES.length * 6,
        'У каждой страницы должно быть 6 вариантов шаблона');

    var blockRows = doc.querySelectorAll('#dsp-blocks-wrap .dsp-row');
    ok(blockRows.length === 12, 'Блоков должно быть 12', blockRows.length);
    ok(doc.querySelectorAll('#dsp-blocks-wrap .dsp-chip').length === 72, 'У каждого блока должно быть 6 вариантов',
        doc.querySelectorAll('#dsp-blocks-wrap .dsp-chip').length);

    // Предпросмотр: текущий вид + 5 шаблонов
    // 1 ячейка «как сейчас на сайте» + 6 шаблонов
    var scopes = doc.querySelectorAll('#dsp-preview-wrap .dsp-scope');
    ok(scopes.length === 7, 'Предпросмотров должно быть 7 (текущий вид + 6 шаблонов)', scopes.length);
    var presetsInPreview = [];
    Array.prototype.forEach.call(scopes, function(s) { presetsInPreview.push(s.getAttribute('data-dsp') || '0'); });
    ok(presetsInPreview.join(',') === '0,0,1,2,3,4,5', 'В предпросмотре должны быть все шаблоны', presetsInPreview.join(','));
    ok(doc.querySelectorAll('#dsp-preview-wrap .hero-title').length === 7, 'В каждом предпросмотре должен быть образец разметки',
        doc.querySelectorAll('#dsp-preview-wrap .hero-title').length);
    ok(doc.querySelectorAll('#dsp-preview-wrap .card').length >= 12, 'В предпросмотрах должны быть карточки');

    // Единый шаблон → атрибут на <html> + сохранение в Firebase
    win.dspAdminSetGlobal('4');
    ok(doc.documentElement.getAttribute('data-dsp') === '4', 'Шаблон 4 не применился к странице');
    win.dspAdminSave();
    ok(win.__writes.length === 1, 'Должна быть одна запись в базу', win.__writes.length);
    ok(win.__writes[0] && win.__writes[0].path === 'settings/design', 'Запись должна идти в settings/design',
        win.__writes[0] && win.__writes[0].path);
    ok(win.__writes[0] && win.__writes[0].val.global === '4', 'В базе должен сохраниться шаблон 4');
    ok(win.__writes[0] && win.__writes[0].val.mode === 'single', 'Режим должен сохраниться как single');

    // Сборка из шаблонов
    win.dspAdminSetMode('mix');
    win.dspAdminSetPage('stats', '2');
    win.dspAdminSetBlock('card', '5');
    win.dspAdminSetBlock('nav', '3');
    ok(doc.documentElement.getAttribute('data-dsp-mode') === 'mix', 'Режим сборки не переключился');
    ok(doc.documentElement.getAttribute('data-dspb-card') === '5', 'Блок «карточки» не получил шаблон 5');
    ok(doc.documentElement.getAttribute('data-dspb-nav') === '3', 'Блок «шапка» не получил шаблон 3');
    ok(doc.documentElement.getAttribute('data-dsp') === '4', 'Базовый шаблон не должен был измениться');
    ok(doc.documentElement.getAttribute('data-dspb-footer') === '4',
        'Блок без своего шаблона наследует шаблон страницы',
        doc.documentElement.getAttribute('data-dspb-footer'));

    win.__writes = [];
    win.dspAdminSave();
    var payload = win.__writes[0].val;
    ok(payload.pages.stats === '2', 'Шаблон страницы stats не сохранился', JSON.stringify(payload.pages));
    ok(payload.blocks.card === '5' && payload.blocks.nav === '3', 'Шаблоны блоков не сохранились', JSON.stringify(payload.blocks));

    // «Собрать всё из одного шаблона»
    win.dspAdminSetGlobal('3');
    win.dspAdminApplyEverywhere();
    var s = win.PestovoDesign.getSettings();
    ok(Object.keys(s.pages).length === win.PestovoDesign.PAGES.length, 'Шаблон должен назначиться всем страницам');
    ok(Object.keys(s.blocks).length === 12, 'Шаблон должен назначиться всем блокам');
    ok(doc.documentElement.getAttribute('data-dspb-footer') === '3', 'Подвал должен получить шаблон 3');

    // Сброс к текущему дизайну
    win.dspAdminResetAll();
    ok(doc.documentElement.getAttribute('data-dsp') === null, 'После сброса data-dsp должен исчезнуть');
    ok(doc.documentElement.getAttribute('data-dspb-card') === null, 'После сброса атрибуты блоков должны исчезнуть');
    ok(win.PestovoDesign.getSettings().global === '0', 'После сброса базовый шаблон — текущий');
    ok((win.__toasts || []).length > 0, 'Действия должны сопровождаться уведомлениями');
}

/* ---------------------------------------------------------
   2. Страница сравнения шаблонов
   --------------------------------------------------------- */
async function testPreviewPage() {
    var win = makeWindow('design-preview.html');
    run(win, 'js/design-system.js');
    run(win, 'js/design-preview.js');
    await settle(win);
    var doc = win.document;

    var gallery = doc.querySelectorAll('#dsp-gal .dsp-scope');
    ok(gallery.length === 6, 'На странице сравнения должно быть 6 шаблонов целиком', gallery.length);
    var ids = [];
    Array.prototype.forEach.call(gallery, function(s) { ids.push(s.getAttribute('data-dsp') || '0'); });
    ok(ids.join(',') === '0,1,2,3,4,5', 'Галерея должна показывать все шаблоны', ids.join(','));

    var blockScopes = doc.querySelectorAll('#dsp-blocks .dsp-scope');
    ok(blockScopes.length === 72, 'Блоков 12 × шаблонов 6 = 72 предпросмотра', blockScopes.length);

    var matrixRows = doc.querySelectorAll('#dsp-matrix tbody tr');
    ok(matrixRows.length === 6, 'В матрице отличий должно быть 6 строк', matrixRows.length);
    ok(doc.querySelectorAll('#dsp-matrix .dsp-diff li').length >= 25, 'В матрице должны быть описаны отличия',
        doc.querySelectorAll('#dsp-matrix .dsp-diff li').length);

    // Конструктор сборки
    var builderView = doc.getElementById('dsp-builder-view');
    ok(builderView && builderView.classList.contains('dsp-scope'), 'Конструктор должен рендерить область предпросмотра');
    win.dspBuilderSetBase('2');
    win.dspBuilderSetBlock('buttons', '4');
    ok(builderView.getAttribute('data-dsp') === '2', 'Конструктор не применил базовый шаблон');
    ok(builderView.getAttribute('data-dspb-buttons') === '4', 'Конструктор не применил шаблон блока');
    ok(/Сборка/.test(doc.getElementById('dsp-builder-label').textContent), 'Конструктор должен показывать состав сборки',
        doc.getElementById('dsp-builder-label').textContent);
    win.dspBuilderFill();
    ok(builderView.getAttribute('data-dspb-footer') === '2', '«Собрать всё» должно назначить шаблон всем блокам');
}

/* ---------------------------------------------------------
   3. Обычные страницы получают шаблон из настроек
   --------------------------------------------------------- */
async function testPublicPages() {
    var win = makeWindow('stats.html', {
        settingsValue: { mode: 'mix', global: '1', pages: { stats: '5' }, blocks: { table: '2' } }
    });
    run(win, 'js/design-system.js');
    win.PestovoDesign.applySettings({ mode: 'mix', global: '1', pages: { stats: '5' }, blocks: { table: '2' } });
    var attrs = win.document.documentElement;
    ok(attrs.getAttribute('data-dsp') === '5', 'Страница «Статистика» должна получить свой шаблон 5', attrs.getAttribute('data-dsp'));
    ok(attrs.getAttribute('data-dsp-page') === 'stats', 'Страница должна определиться как stats');
    ok(attrs.getAttribute('data-dspb-table') === '2', 'Блок таблиц должен получить шаблон 2');

    var win2 = makeWindow('index.html');
    run(win2, 'js/design-system.js');
    ok(win2.document.documentElement.getAttribute('data-dsp-page') === 'home', 'Главная должна определиться как home');
    ok(win2.document.documentElement.getAttribute('data-dsp') === null, 'Без настроек главная остаётся в текущем дизайне');
}

/* ---------------------------------------------------------
   4. CSS парсится браузерным движком и содержит нужные селекторы
   --------------------------------------------------------- */
async function testCssParses() {
    var win = makeWindow('index.html');
    var css = read('css/design-presets.css');
    var style = win.document.createElement('style');
    style.textContent = css;
    win.document.head.appendChild(style);
    var sheet = win.document.styleSheets[0];
    var count = sheet ? sheet.cssRules.length : 0;
    ok(count > 300, 'CSS должен парситься (ожидалось >300 правил)', count);

    function selectorExists(fragment) {
        if (!sheet) return false;
        for (var i = 0; i < sheet.cssRules.length; i++) {
            var sel = sheet.cssRules[i].selectorText || '';
            if (sel.indexOf(fragment) !== -1) return true;
        }
        return false;
    }
    ok(selectorExists('[data-dsp="4"]'), 'Нет распарсенных правил шаблона 4');
    ok(selectorExists('[data-dsp-mode][data-dspb-card="2"] .card'), 'Нет распарсенного правила блока «карточки» (шаблон 2)');
    ok(selectorExists('[data-dsp-mode][data-dspb-nav="5"] .nav'), 'Нет распарсенного правила блока «шапка» (шаблон 5)');
    ok(selectorExists('[data-dsp="3"][data-dsp-page="home"]'), 'Нет распарсенных точечных правил страниц');
}


/* ---------------------------------------------------------
   5. Каскад: собранный дизайн действительно красится по-разному
   --------------------------------------------------------- */
function buildStyledWindow(url) {
    var dom = new JSDOM(
        '<!doctype html><html><head></head><body>' +
        '<div class="nav"></div><div class="card">x</div>' +
        '<div class="stat"><div class="stat-n">1</div></div>' +
        '<button class="btn btn-g">b</button><div class="footer"></div>' +
        '</body></html>',
        { runScripts: 'outside-only', url: url }
    );
    var win = dom.window;
    var base = win.document.createElement('style');
    base.textContent = read('css/style.css');
    win.document.head.appendChild(base);
    var presets = win.document.createElement('style');
    presets.textContent = read('css/design-presets.css');
    win.document.head.appendChild(presets);
    win.eval(read('js/design-system.js'));
    return win;
}

async function testMixCascade() {
    // Базовый шаблон 4 + карточки 5: карточки должны быть из шаблона 5,
    // остальное — из шаблона 4 (проверяем в обе стороны, порядок не важен).
    var win = buildStyledWindow('https://example.test/index.html');
    var doc = win.document;
    var D = win.PestovoDesign;
    D.setMode('mix');
    D.setGlobalPreset('4');
    D.setBlockPreset('card', '5');
    var cs = function(sel, prop) { return win.getComputedStyle(doc.querySelector(sel))[prop]; };

    ok(cs('.card', 'borderRadius') === '22px', 'Карточки должны взять шаблон 5 (радиус 22px)', cs('.card', 'borderRadius'));
    ok(cs('.stat-n', 'fontSize') === '42px', 'Цифры должны остаться в шаблоне 4 (42px)', cs('.stat-n', 'fontSize'));
    ok(cs('.btn', 'borderRadius') === '0px', 'Кнопки должны остаться в шаблоне 4 (0px)', cs('.btn', 'borderRadius'));

    // Обратный порядок: база 5, карточки 4 — карточки обязаны перебить базу
    var win2 = buildStyledWindow('https://example.test/index.html');
    var D2 = win2.PestovoDesign;
    D2.setMode('mix');
    D2.setGlobalPreset('5');
    D2.setBlockPreset('card', '4');
    var cs2 = function(sel, prop) { return win2.getComputedStyle(win2.document.querySelector(sel))[prop]; };
    ok(cs2('.card', 'borderRadius') === '0px', 'Карточки должны взять шаблон 4 (радиус 0)', cs2('.card', 'borderRadius'));
    ok(cs2('.card', 'backgroundColor') === 'rgb(25, 30, 38)', 'Карточки должны взять фон шаблона 4', cs2('.card', 'backgroundColor'));
    ok(cs2('.btn', 'borderRadius') === '999px', 'Кнопки должны остаться в шаблоне 5 (пилюли)', cs2('.btn', 'borderRadius'));
    ok(cs2('.stat-n', 'fontSize') === '34px', 'Цифры должны остаться в шаблоне 5 (34px)', cs2('.stat-n', 'fontSize'));

    // Текущий дизайн: ни одно правило шаблонов не должно перекрашивать сайт
    var win3 = buildStyledWindow('https://example.test/index.html');
    var cs3 = function(sel, prop) { return win3.getComputedStyle(win3.document.querySelector(sel))[prop]; };
    ok(cs3('.card', 'backgroundColor') === 'rgba(19, 34, 24, 0.85)', 'В текущем дизайне карточка не должна меняться',
        cs3('.card', 'backgroundColor'));
    ok(cs3('.stat-n', 'fontSize') === '32px', 'В текущем дизайне цифры остаются 32px', cs3('.stat-n', 'fontSize'));

    // Шаблон страницы применяется только на своей странице
    var winStats = buildStyledWindow('https://example.test/stats.html');
    var winHome = buildStyledWindow('https://example.test/index.html');
    winStats.PestovoDesign.setPagePreset('stats', '2');
    winHome.PestovoDesign.setPagePreset('stats', '2');
    ok(winStats.document.documentElement.getAttribute('data-dsp') === '2', 'На stats.html шаблон страницы должен примениться');
    ok(winHome.document.documentElement.getAttribute('data-dsp') === null, 'На главной чужой шаблон страницы применяться не должен');
}

/* ---------------------------------------------------------
   Итог
   --------------------------------------------------------- */
Promise.resolve()
    .then(testAdminTab)
    .then(testPreviewPage)
    .then(testPublicPages)
    .then(testCssParses)
    .then(testMixCascade)
    .catch(function(err) { failures.push('исключение во время проверок: ' + (err && err.stack || err)); })
    .then(finish);

function finish() {
if (failures.length) {
    console.log('✗ Провалено проверок: ' + failures.length + ' из ' + checks);
    failures.forEach(function(f) { console.log('  — ' + f); });
    process.exit(1);
}
console.log('✓ UI-проверки пройдены: ' + checks);
}
