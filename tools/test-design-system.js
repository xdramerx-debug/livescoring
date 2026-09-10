#!/usr/bin/env node
/**
 * Проверка системы шаблонов оформления без браузера:
 *   node tools/test-design-system.js
 *
 * Выполняет настоящий js/design-system.js в vm-контексте с мини-DOM и проверяет:
 *   — реестр: текущий дизайн (пресет 0) + 5 альтернативных шаблонов;
 *   — по умолчанию атрибуты шаблона НЕ ставятся (сайт остаётся прежним);
 *   — единый шаблон, сборку из шаблонов (страница + блок) и сброс;
 *   — применение настроек, пришедших из Firebase settings/design;
 *   — что в css/design-presets.css есть правила для каждого блока и шаблона;
 *   — что вкладки/подключения/version bump на месте во всех страницах.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var failures = [];
var checks = 0;

function ok(cond, msg) {
    checks++;
    if (!cond) failures.push(msg);
}

/* ---------------------------------------------------------
   Мини-DOM, достаточный для js/design-system.js
   --------------------------------------------------------- */
function makeEl(name) {
    return {
        name: name,
        attrs: {},
        setAttribute: function(k, v) { this.attrs[k] = String(v); },
        removeAttribute: function(k) { delete this.attrs[k]; },
        getAttribute: function(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
    };
}

function makeContext(pathname) {
    var storage = {};
    var htmlEl = makeEl('html');
    var bodyEl = makeEl('body');
    var ctx = {
        console: console,
        localStorage: {
            getItem: function(k) { return storage[k] === undefined ? null : storage[k]; },
            setItem: function(k, v) { storage[k] = String(v); },
            removeItem: function(k) { delete storage[k]; }
        },
        document: {
            readyState: 'complete',
            documentElement: htmlEl,
            body: bodyEl,
            addEventListener: function() {},
            dispatchEvent: function() { return true; },
            createEvent: function() { return { initEvent: function() {} }; },
            getElementById: function() { return null; }
        }
    };
    ctx.window = ctx;
    ctx.location = { pathname: pathname || '/index.html', search: '' };
    vm.createContext(ctx);
    ctx.__storage = storage;
    return ctx;
}

function loadDesign(ctx) {
    var code = fs.readFileSync(path.join(ROOT, 'js', 'design-system.js'), 'utf8');
    vm.runInContext(code, ctx, { filename: 'js/design-system.js' });
    return ctx.PestovoDesign;
}

/* ---------------------------------------------------------
   1. Реестр шаблонов
   --------------------------------------------------------- */
(function testRegistry() {
    var D = loadDesign(makeContext('/index.html'));
    ok(!!D, 'PestovoDesign не определён');
    ok(D.PRESETS.length === 6, 'Ожидалось 6 шаблонов (текущий + 5), получено ' + D.PRESETS.length);
    ok(D.PRESET_IDS.join(',') === '0,1,2,3,4,5', 'Неверный набор id шаблонов: ' + D.PRESET_IDS.join(','));
    ok(D.PRESETS[0].id === '0' && /текущ/i.test(D.PRESETS[0].name), 'Пресет 0 должен быть текущим дизайном');
    D.PRESETS.slice(1).forEach(function(p) {
        ok(p.diffs && p.diffs.length >= 4, 'Шаблон ' + p.id + ' должен описывать отличия (≥4 пункта)');
        ok(p.swatches && p.swatches.length >= 3, 'Шаблон ' + p.id + ' должен иметь цвета-пробники');
        ok(p.tagline && p.tagline.length > 10, 'Шаблон ' + p.id + ' должен иметь описание');
    });
    ok(D.PAGES.length >= 15, 'Ожидалось ≥15 страниц с настройкой шаблона, получено ' + D.PAGES.length);
    ok(D.BLOCKS.length === 12, 'Ожидалось 12 блоков, получено ' + D.BLOCKS.length);

    // Ключи блоков должны совпадать с атрибутами в CSS
    D.BLOCKS.forEach(function(b) {
        ok(/^data-dspb-[a-z-]+$/.test(b.attr), 'Некорректный атрибут блока: ' + b.attr);
        ok(b.key === b.attr.replace('data-dspb-', ''), 'Ключ блока ' + b.key + ' не совпадает с атрибутом ' + b.attr);
    });
})();

/* ---------------------------------------------------------
   2. По умолчанию — текущий дизайн, атрибутов нет
   --------------------------------------------------------- */
(function testDefault() {
    var ctx = makeContext('/index.html');
    var D = loadDesign(ctx);
    var attrs = ctx.document.documentElement.attrs;
    ok(attrs['data-dsp'] === undefined, 'По умолчанию data-dsp не должен ставиться');
    ok(attrs['data-dsp-mode'] === 'single', 'Режим по умолчанию — single, получено ' + attrs['data-dsp-mode']);
    ok(attrs['data-dsp-page'] === 'home', 'Для index.html страница должна определиться как home');
    ok(Object.keys(D.getSettings().blocks).length === 0, 'По умолчанию блоки не переопределены');
})();

/* ---------------------------------------------------------
   3. Единый шаблон
   --------------------------------------------------------- */
(function testSingleMode() {
    var ctx = makeContext('/stats.html');
    var D = loadDesign(ctx);
    D.setGlobalPreset('3');
    ok(ctx.document.documentElement.attrs['data-dsp'] === '3', 'Единый шаблон 3 не применился');
    ok(ctx.document.documentElement.attrs['data-dsp-page'] === 'stats', 'Не определилась страница stats');

    D.setGlobalPreset('9');                       // недопустимое значение
    ok(ctx.document.documentElement.attrs['data-dsp'] === '0' ||
       ctx.document.documentElement.attrs['data-dsp'] === undefined,
       'Недопустимый шаблон должен откатываться к текущему');

    D.setGlobalPreset('5');
    ok(ctx.document.documentElement.attrs['data-dsp'] === '5', 'Шаблон 5 не применился');
    D.resetAll();
    ok(ctx.document.documentElement.attrs['data-dsp'] === undefined, 'После сброса data-dsp должен исчезнуть');
})();

/* ---------------------------------------------------------
   4. Сборка из шаблонов: страница + блок
   --------------------------------------------------------- */
(function testMixMode() {
    var ctx = makeContext('/players.html');
    var D = loadDesign(ctx);
    D.setMode('mix');
    D.setGlobalPreset('1');
    D.setPagePreset('players', '4');
    D.setBlockPreset('card', '2');
    D.setBlockPreset('nav', '5');
    var attrs = ctx.document.documentElement.attrs;

    ok(attrs['data-dsp-mode'] === 'mix', 'Режим сборки не применился');
    ok(attrs['data-dsp'] === '4', 'Страница players должна получить шаблон 4, получено ' + attrs['data-dsp']);
    ok(attrs['data-dspb-card'] === '2', 'Блок «карточки» должен получить шаблон 2');
    ok(attrs['data-dspb-nav'] === '5', 'Блок «шапка» должен получить шаблон 5');
    // Блок без своего шаблона наследует шаблон страницы (значение вычисляет JS)
    ok(attrs['data-dspb-table'] === '4', 'Невыбранный блок должен наследовать шаблон страницы, получено ' + attrs['data-dspb-table']);
    ok(attrs['data-dspb-footer'] === '4', 'Подвал без своего шаблона должен наследовать шаблон страницы');

    // Страница без своего шаблона наследует базовый
    var ctx2 = makeContext('/tournaments.html');
    var D2 = loadDesign(ctx2);
    D2.applySettings({ mode: 'mix', global: '1', pages: { players: '4' }, blocks: { card: '2' } });
    ok(ctx2.document.documentElement.attrs['data-dsp'] === '1',
        'Страница без своего шаблона должна брать базовый, получено ' + ctx2.document.documentElement.attrs['data-dsp']);

    // «Текущий» для страницы = наследование базового
    D.setPagePreset('players', '0');
    ok(ctx.document.documentElement.attrs['data-dsp'] === '1', '«Текущий» для страницы должен вернуть базовый шаблон');
    ok(ctx.document.documentElement.attrs['data-dspb-footer'] === '1',
        'Блоки без своего шаблона должны следовать базовому, получено ' + ctx.document.documentElement.attrs['data-dspb-footer']);

    // Базовый «текущий» + один блок своим шаблоном = остальные блоки без атрибутов
    var ctx3 = makeContext('/index.html');
    var D3 = loadDesign(ctx3);
    D3.setBlockPreset('nav', '2');
    ok(ctx3.document.documentElement.attrs['data-dsp'] === undefined, 'Базовый шаблон остаётся текущим');
    ok(ctx3.document.documentElement.attrs['data-dspb-nav'] === '2', 'Отдельный блок должен получить свой шаблон');
    ok(ctx3.document.documentElement.attrs['data-dspb-card'] === undefined,
        'Остальные блоки в текущем дизайне атрибутов не получают');
})();

/* ---------------------------------------------------------
   5. Настройки из Firebase + мусор на входе
   --------------------------------------------------------- */
(function testFirebasePayload() {
    var ctx = makeContext('/admin.html');
    var D = loadDesign(ctx);
    D.applySettings({
        mode: 'mix',
        global: '2',
        pages: { admin: '3', home: 'zzz', stats: '4' },
        blocks: { footer: '5', nav: null, hero: '1' }
    });
    var s = D.getSettings();
    ok(s.global === '2', 'Базовый шаблон из Firebase не применён');
    ok(s.pages.admin === '3' && s.pages.stats === '4', 'Шаблоны страниц из Firebase не применены');
    ok(s.pages.home === undefined, 'Недопустимый шаблон страницы должен отбрасываться');
    ok(s.blocks.footer === '5' && s.blocks.hero === '1', 'Шаблоны блоков из Firebase не применены');
    ok(s.blocks.nav === undefined, 'null в шаблоне блока должен отбрасываться');

    D.applySettings(null);
    ok(D.getSettings().global === '0', 'Пустые настройки из Firebase должны вернуть текущий дизайн');
    ok(ctx.document.documentElement.attrs['data-dsp'] === undefined, 'После пустых настроек data-dsp должен исчезнуть');

    // localStorage-резерв
    var ctx2 = makeContext('/index.html');
    ctx2.localStorage.setItem('pestovo_design_settings', JSON.stringify({ mode: 'single', global: '4' }));
    var D2 = loadDesign(ctx2);
    ok(D2.getSettings().global === '4', 'Офлайн-резерв в localStorage не подхватился');
    ok(ctx2.document.documentElement.attrs['data-dsp'] === '4', 'Офлайн-резерв не применился к странице');
})();

/* ---------------------------------------------------------
   6. «Собрать всё из одного шаблона»
   --------------------------------------------------------- */
(function testApplyEverywhere() {
    var ctx = makeContext('/index.html');
    var D = loadDesign(ctx);
    D.setGlobalPreset('2');
    D.applyPresetEverywhere('2');
    var s = D.getSettings();
    ok(Object.keys(s.pages).length === D.PAGES.length, 'Шаблон должен назначиться всем страницам');
    ok(Object.keys(s.blocks).length === D.BLOCKS.length, 'Шаблон должен назначиться всем блокам');
    ok(ctx.document.documentElement.attrs['data-dspb-footer'] === '2', 'Блоки должны получить шаблон 2');
    D.applyPresetEverywhere('0');
    ok(Object.keys(D.getSettings().pages).length === 0, 'Сброс на текущий должен очистить страницы');
    ok(Object.keys(D.getSettings().blocks).length === 0, 'Сброс на текущий должен очистить блоки');
})();

/* ---------------------------------------------------------
   7. Область предпросмотра (админка / страница сравнения)
   --------------------------------------------------------- */
(function testScope() {
    var ctx = makeContext('/index.html');
    var D = loadDesign(ctx);
    var scope = makeEl('div');
    scope.classList = { add: function(c) { this[c] = true; } };
    D.mountScope(scope, '3', { html: '<div class="card"></div>', blocks: { card: '5' }, pageKey: 'stats' });
    ok(scope.attrs['data-dsp'] === '3', 'Предпросмотр должен получить шаблон 3');
    ok(scope.attrs['data-dspb-card'] === '5', 'Предпросмотр должен получить шаблон блока');
    ok(scope.attrs['data-dsp-page'] === 'stats', 'Предпросмотр должен получить ключ страницы');
    ok(scope.innerHTML === '<div class="card"></div>', 'Предпросмотр должен получить образец разметки');

    var sample = D.sampleHTML();
    ['nav', 'hero', 'page-head', 'card', 'stat', 'lb-table', 'tn-status', 'btn-g', 'form-input', 'footer', 'admin-tab', 'live-round-card']
        .forEach(function(cls) {
            ok(sample.indexOf('class="' + cls) !== -1 || sample.indexOf(' ' + cls + '"') !== -1 ||
               sample.indexOf('"' + cls + ' ') !== -1 || sample.indexOf(cls) !== -1,
               'В образце разметки нет класса .' + cls);
        });
})();

/* ---------------------------------------------------------
   8. CSS: правила есть для каждого шаблона и блока
   --------------------------------------------------------- */
(function testCss() {
    var css = fs.readFileSync(path.join(ROOT, 'css', 'design-presets.css'), 'utf8');
    var D = loadDesign(makeContext('/index.html'));

    [1, 2, 3, 4, 5].forEach(function(n) {
        ok(css.indexOf('[data-dsp="' + n + '"]') !== -1, 'В CSS нет токенов шаблона ' + n);
    });
    ok(css.indexOf('[data-dsp] {') !== -1 || css.indexOf('[data-dsp]{') !== -1,
        'В CSS нет общей подмены штатных переменных');

    D.BLOCKS.forEach(function(b) {
        [1, 2, 3, 4, 5].forEach(function(n) {
            var sel = '[data-dsp-mode][' + b.attr + '="' + n + '"]';
            ok(css.indexOf(sel) !== -1, 'В CSS нет правил блока ' + b.key + ' для шаблона ' + n);
        });
    });

    // Блочный селектор обязан быть «тяжелее» любого правила пресета —
    // иначе сборка из шаблонов не сработает (блок не перекроет страницу).
    ok(css.indexOf('[data-dsp-mode][data-dsp-mode][data-dspb-card="2"] .card') !== -1,
        'Правила блока должны использовать селектор с повышенной специфичностью [data-dsp-mode][data-dsp-mode][data-dspb-*]');
    ok(css.indexOf('[data-dsp-mode][data-dsp-mode][data-dspb-nav="5"] .nav') !== -1,
        'Правила блока «шапка» должны иметь повышенную специфичность');
})();

/* ---------------------------------------------------------
   9. Подключения, вкладка админки, версия сайта
   --------------------------------------------------------- */
(function testWiring() {
    var pages = fs.readdirSync(ROOT).filter(function(f) { return /\.html$/.test(f); });
    pages.forEach(function(file) {
        var html = fs.readFileSync(path.join(ROOT, file), 'utf8');
        ok(html.indexOf('css/design-presets.css') !== -1, file + ': не подключён css/design-presets.css');
        ok(html.indexOf('js/design-system.js') !== -1, file + ': не подключён js/design-system.js');
        if (html.indexOf('version-number') !== -1) {
            ok(html.indexOf('1.52.0') !== -1, file + ': версия сайта не обновлена до 1.52.0');
            ok(html.indexOf('1.51.0') === -1, file + ': осталась старая версия 1.51.0');
        }
    });

    var admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    ok(admin.indexOf("switchTab('design'") !== -1, 'В админке нет вкладки «Дизайн 🎨»');
    ok(admin.indexOf('id="tab-design"') !== -1, 'В админке нет секции tab-design');
    ['dsp-mode-wrap', 'dsp-global-wrap', 'dsp-pages-wrap', 'dsp-blocks-wrap', 'dsp-preview-wrap', 'dsp-status']
        .forEach(function(id) {
            ok(admin.indexOf('id="' + id + '"') !== -1, 'В админке нет контейнера #' + id);
        });
    ok(admin.indexOf('js/design-admin.js') !== -1, 'В админке не подключён js/design-admin.js');

    var adminJs = fs.readFileSync(path.join(ROOT, 'js', 'admin.js'), 'utf8');
    ok(adminJs.indexOf("t === 'design'") !== -1, 'switchTab не обрабатывает вкладку design');

    var utils = fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8');
    ok(utils.indexOf("db.ref('settings/design')") !== -1, 'В utils.js нет listener-а settings/design');
    ok(utils.indexOf('tab_design:') !== -1, 'В utils.js нет i18n-ключа tab_design');
    ok(utils.indexOf("tab_design: 'Design") !== -1, 'В utils.js нет английского перевода tab_design');

    var sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    ok(sw.indexOf("pestovo-v1.52.0") !== -1, 'sw.js: кэш не обновлён до 1.52.0');
    ok(sw.indexOf('css/design-presets.css?v=1') !== -1, 'sw.js: не кэшируется design-presets.css');
    ok(sw.indexOf('js/design-system.js?v=1') !== -1, 'sw.js: не кэшируется design-system.js');
    ok(sw.indexOf('design-preview.html') !== -1, 'sw.js: не кэшируется design-preview.html');

    ok(fs.existsSync(path.join(ROOT, 'design-preview.html')), 'Нет страницы сравнения design-preview.html');
    ok(fs.existsSync(path.join(ROOT, 'js', 'design-preview.js')), 'Нет js/design-preview.js');
})();

/* ---------------------------------------------------------
   Итог
   --------------------------------------------------------- */
if (failures.length) {
    console.log('✗ Провалено проверок: ' + failures.length + ' из ' + checks);
    failures.forEach(function(f) { console.log('  — ' + f); });
    process.exit(1);
}
console.log('✓ Все проверки пройдены: ' + checks);
