'use strict';
/*
 * tools/test-i18n-coverage.js — страховка словаря переводов.
 *
 * Зачем: `data-i18n="…"` в HTML и `t('…')` в JS — это обещание перевода.
 * Если ключа нет в словаре, элемент молча остаётся с русским текстом и
 * переключение языка его не трогает (реальный случай: tn_lb_variant_title /
 * tn_lb_variant_sub в admin.html, найдено аудитом 2026-10).
 *
 * Проверки:
 *  1. Каждый `data-i18n="X"` во всех корневых *.html есть и в ru, и в en.
 *  2. Каждый литеральный вызов `t('X')` / `t("X")` в js/** и src/** есть в словаре.
 *     (Динамические `t(variable)` не проверяются — их не отличить от строки.)
 *  3. Паритет ключей: в en нет ключей, которых нет в ru, и наоборот.
 *  4. Значение в en не осталось русским (кириллица), кроме осознанных исключений.
 *  5. js/i18n.js и src/i18n.js содержат одинаковые наборы ключей
 *     (две копии фундамента не разъехались — см. tools/test-esm-parity.js).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function ok(cond, msg, extra) {
    if (cond) { console.log('ok  - ' + msg); }
    else { failures++; console.error('FAIL - ' + msg + (extra ? '\n       ' + extra : '')); }
}

// ── Загрузка словаря I18N из js/i18n.js ───────────────────────────────────
function loadI18N(file) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const start = src.indexOf('var I18N = {');
    if (start < 0) throw new Error(file + ': не найден `var I18N = {`');
    let depth = 0, end = -1;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        const c = src[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) throw new Error(file + ': не удалось найти конец объекта I18N');
    const sandbox = { console };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    return vm.runInContext('(' + src.slice(src.indexOf('{', start), end + 1) + ')', sandbox);
}

const I18N = loadI18N('js/i18n.js');
const ru = I18N.ru || {};
const en = I18N.en || {};
ok(Object.keys(ru).length > 100, 'словарь ru загружен (' + Object.keys(ru).length + ' ключей)');
ok(Object.keys(en).length > 100, 'словарь en загружен (' + Object.keys(en).length + ' ключей)');

// ── 1. data-i18n в HTML ───────────────────────────────────────────────────
const htmlFiles = fs.readdirSync(ROOT).filter(function (f) { return f.endsWith('.html'); });
const dataI18n = new Map(); // key -> [pages]
for (const page of htmlFiles) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const re = /data-i18n="([^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        if (!dataI18n.has(m[1])) dataI18n.set(m[1], []);
        dataI18n.get(m[1]).push(page);
    }
}
const missingRu = [], missingEn = [];
for (const [key, pages] of dataI18n) {
    if (!Object.prototype.hasOwnProperty.call(ru, key)) missingRu.push(key + ' (' + pages.join(', ') + ')');
    if (!Object.prototype.hasOwnProperty.call(en, key)) missingEn.push(key + ' (' + pages.join(', ') + ')');
}
ok(missingRu.length === 0,
    'все ' + dataI18n.size + ' ключей data-i18n из HTML есть в словаре ru',
    missingRu.slice(0, 10).join('\n       '));
ok(missingEn.length === 0,
    'все ключи data-i18n из HTML есть в словаре en',
    missingEn.slice(0, 10).join('\n       '));

// ── 2. Литеральные t('key') в js/ и src/ ──────────────────────────────────
function jsFiles(dir) {
    return fs.readdirSync(path.join(ROOT, dir))
        .filter(function (f) { return f.endsWith('.js'); })
        .filter(function (f) { return dir !== 'js' || !/^vendor$/.test(f); })
        .map(function (f) { return dir + '/' + f; });
}
const T_RE = /(?:^|[^\w$.])t\(\s*(['"])([a-z0-9_]+)\1\s*[,)]/g;
const tKeys = new Map();
for (const rel of jsFiles('js').concat(jsFiles('src'))) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    T_RE.lastIndex = 0;
    let m;
    while ((m = T_RE.exec(src)) !== null) {
        if (!tKeys.has(m[2])) tKeys.set(m[2], []);
        tKeys.get(m[2]).push(rel);
    }
}
const tMissingRu = [], tMissingEn = [];
for (const [key, files] of tKeys) {
    if (!Object.prototype.hasOwnProperty.call(ru, key)) tMissingRu.push(key + ' (' + files[0] + ')');
    if (!Object.prototype.hasOwnProperty.call(en, key)) tMissingEn.push(key + ' (' + files[0] + ')');
}
ok(tMissingRu.length === 0,
    'все ' + tKeys.size + ' литеральных t(\'…\') из js/src есть в словаре ru',
    tMissingRu.slice(0, 15).join('\n       '));
ok(tMissingEn.length === 0,
    'все литеральные t(\'…\') из js/src есть в словаре en',
    tMissingEn.slice(0, 15).join('\n       '));

// ── 3. Паритет ключей ru ↔ en ─────────────────────────────────────────────
const onlyRu = Object.keys(ru).filter(function (k) { return !(k in en); });
const onlyEn = Object.keys(en).filter(function (k) { return !(k in ru); });
ok(onlyRu.length === 0, 'нет ключей только в ru', onlyRu.slice(0, 10).join(', '));
ok(onlyEn.length === 0, 'нет ключей только в en', onlyEn.slice(0, 10).join(', '));

// ── 4. en-значения не остались русскими ───────────────────────────────────
const CYR = /[А-Яа-яЁё]/;
// Осознанные исключения: имя клуба не переводится.
const KEEP_RU = new Set(['brand_name']);
const untranslated = Object.keys(en).filter(function (k) {
    if (KEEP_RU.has(k)) return false;
    return en[k] === ru[k] && CYR.test(String(en[k]));
});
ok(untranslated.length === 0,
    'в en нет значений, дословно совпадающих с русскими',
    untranslated.slice(0, 10).join(', '));

// ── 5. js/i18n.js ≡ src/i18n.js по набору ключей ──────────────────────────
const srcI18N = loadI18N('src/i18n.js');
const srcRu = Object.keys(srcI18N.ru || {}).sort().join(',');
const srcEn = Object.keys(srcI18N.en || {}).sort().join(',');
ok(srcRu === Object.keys(ru).sort().join(','), 'наборы ru-ключей в js/ и src/ совпадают');
ok(srcEn === Object.keys(en).sort().join(','), 'наборы en-ключей в js/ и src/ совпадают');

if (failures) {
    console.error('\nПровалено проверок: ' + failures);
    process.exit(1);
}
console.log('Покрытие словаря переводов в порядке ✔');
