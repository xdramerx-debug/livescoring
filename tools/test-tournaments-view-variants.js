// Автотесты: 5 вариантов отображения страницы «Турниры» (выбирает админ).
// Запуск: node tools/test-tournaments-view-variants.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0, total = 0;
function ok(cond, label) {
    total++;
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function eq(actual, expected, label) {
    total++;
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e); }
    else console.log('ok  -', label);
}

// <body> с настоящим поведением classList.toggle/contains
const bodyClasses = new Set();
const body = {
    style: {},
    classList: {
        add: c => bodyClasses.add(c),
        remove: c => bodyClasses.delete(c),
        contains: c => bodyClasses.has(c),
        toggle(c, on) { if (on === undefined) on = !bodyClasses.has(c); if (on) bodyClasses.add(c); else bodyClasses.delete(c); return on; }
    },
    appendChild() {}
};
function fakeEl(id) {
    return {
        _id: id, innerHTML: '', textContent: '', value: '', checked: false, className: '', style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        querySelector() { return null; }, querySelectorAll() { return []; }, appendChild() {},
        addEventListener() {}, remove() {}, setAttribute() {}, getAttribute() { return null; }
    };
}
const els = {};
const store = {};
const sandbox = {
    console, Date, Math, JSON, parseInt, parseFloat, isNaN, isFinite, String, Number, Array, Object, Promise,
    setTimeout, clearTimeout, RegExp, Error, encodeURIComponent, decodeURIComponent,
    document: {
        getElementById: id => { if (!els[id]) els[id] = fakeEl(id); return els[id]; },
        createElement: () => fakeEl('created'),
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener() {}, removeEventListener() {},
        documentElement: { style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
        body,
        readyState: 'complete'
    },
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    },
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: { language: 'ru', onLine: true, vibrate() {} },
    location: { search: '', pathname: '/tournaments.html', href: '' },
    URLSearchParams: function (q) { this.get = () => null; },
    alert() {}, confirm: () => true, firebase: undefined, currentLang: 'ru', toast: () => {}
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/course-config.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/format.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8'), sandbox);

const utils = fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(ROOT, 'js/admin.js'), 'utf8');
// Настройки вида турниров переехали в js/admin-display.js (CODE-REVIEW п.3)
const adminDisplayJs = fs.readFileSync(path.join(ROOT, 'js/admin-display.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const adminCss = fs.readFileSync(path.join(ROOT, 'css/tournament-admin.css'), 'utf8');

console.log('\n--- Настройка вариантов ---');
eq(sandbox.pageDisplayVariantKeys('tournaments'), ['1', '2', '3', '4', '5'], 'у страницы «Турниры» пять вариантов');
eq(sandbox.pageDisplayVariantKeys('feed'), ['1', '2', '3'], 'у остальных страниц остаётся три варианта');
eq(sandbox.normalizePageDisplayVariant('tournaments', '5'), '5', 'вариант 5 принимается для турниров');
eq(sandbox.normalizePageDisplayVariant('tournaments', '9'), '1', 'неизвестный вариант → 1');
eq(sandbox.normalizePageDisplayVariant('feed', '4'), '1', 'вариант 4 недоступен другим страницам');

console.log('\n--- Применение варианта (классы на <body>) ---');
['2', '3', '4', '5'].forEach(v => {
    const applied = sandbox.applyPageDisplayVariant('tournaments', v);
    eq(applied, v, 'applyPageDisplayVariant(tournaments,' + v + ')');
    ok(bodyClasses.has('pd-tournaments-v' + v), 'класс pd-tournaments-v' + v + ' добавлен на <body>');
    ['2', '3', '4', '5'].filter(x => x !== v).forEach(other => {
        ok(!bodyClasses.has('pd-tournaments-v' + other), 'класс pd-tournaments-v' + other + ' снят');
    });
    eq(store.pestovo_tournaments_display_variant, v, 'вариант сохранён в localStorage');
    eq(sandbox.getPageDisplayVariant('tournaments'), v, 'getPageDisplayVariant возвращает ' + v);
});
sandbox.applyPageDisplayVariant('tournaments', '1');
ok(!bodyClasses.has('pd-tournaments-v2') && !bodyClasses.has('pd-tournaments-v5'), 'вариант 1 снимает все классы');

console.log('\n--- Админ-панель: отдельная вкладка ---');
ok(adminHtml.indexOf("switchTab('tournamentsview',this)") !== -1, 'вкладка «Турниры: вид» в панели вкладок');
ok(adminHtml.indexOf('id="tab-tournamentsview"') !== -1, 'секция вкладки существует');
['1', '2', '3', '4', '5'].forEach(v => {
    ok(adminHtml.indexOf('id="tn-view-opt-' + v + '"') !== -1, 'кнопка варианта ' + v + ' в новой вкладке');
    ok(adminHtml.indexOf("saveTnPageViewVariant('" + v + "')") !== -1, 'кнопка варианта ' + v + ' сохраняет настройку');
});
ok(adminDisplayJs.indexOf('function saveTnPageViewVariant') !== -1, 'admin-display.js: saveTnPageViewVariant');
ok(adminDisplayJs.indexOf('function loadTnPageViewSettings') !== -1, 'admin-display.js: loadTnPageViewSettings');
ok(adminJs.indexOf("if (t === 'tournamentsview')") !== -1, 'admin.js: switchTab обрабатывает новую вкладку');
ok(adminDisplayJs.indexOf("settings/tournaments_display_variant") !== -1, 'настройка хранится в settings/tournaments_display_variant');
ok(utils.indexOf("firebase: 'settings/tournaments_display_variant'") !== -1, 'utils.js слушает ту же настройку (применяется для всех)');
ok(utils.indexOf('tournaments_view_variant_5') !== -1 && utils.indexOf('tournaments_view_variant_5_desc') !== -1, 'i18n: подписи пяти вариантов');

console.log('\n--- CSS пяти вариантов ---');
['2', '3', '4', '5'].forEach(v => {
    ok(css.indexOf('body.pd-tournaments-v' + v + ' .tn-public-card') !== -1, 'CSS: вариант ' + v + ' стилизует карточки каталога');
});
ok(css.indexOf('body.pd-tournaments-v4 .tn-public-card-body{display:grid') !== -1, 'CSS: вариант 4 — табличная сетка');
ok(css.indexOf('body.pd-tournaments-v5 .tn-public-card:before') !== -1, 'CSS: вариант 5 — лента календаря');
ok(adminCss.indexOf('.tn-view-preview-grid') !== -1, 'CSS админки: сетка описаний вариантов');

console.log('\n' + total + ' проверок, ошибок: ' + failures);
process.exit(failures ? 1 : 0);
