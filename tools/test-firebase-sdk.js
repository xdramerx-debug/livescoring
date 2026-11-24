'use strict';
/*
 * tools/test-firebase-sdk.js — страховка подключения Firebase Web SDK.
 *
 * Что ловит:
 *
 * 1. Разнобой версий. Страницы грузят firebase-app/database/auth-compat из
 *    js/vendor/ (self-hosted: gstatic не закэширован Service Worker'ом, и на
 *    слабой мобильной сети SDK с CDN просто не доезжал — секции данных
 *    зависали на скелетонах навсегда). Версия живёт одной константой в
 *    js/firebase-config.js; тест сверяет с ней версии внутри vendored-бандлов
 *    и проверяет, что ссылки на gstatic вообще исчезли.
 *
 * 2. Порядок тегов. database-compat и auth-compat обязаны идти после
 *    app-compat: они расширяют пространство firebase.*, а не создают его.
 *
 * 3. Лишний бандл. firebase-functions-compat.js (~10 КБ) грузится тегом
 *    только там, где нужен — он подгружается по требованию из
 *    pestovoFunctions(), поэтому статический тег на странице — это возврат
 *    лишнего трафика.
 *
 * 4. Прямые вызовы firebase.functions() вне firebase-config.js: с ленивой
 *    загрузкой firebase.functions появляется только после подгрузки бандла,
 *    поэтому такой вызов всегда падает.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const CONFIG = 'js/firebase-config.js';

const configSrc = fs.readFileSync(path.join(ROOT, CONFIG), 'utf8');
const versionMatch = /PESTOVO_FIREBASE_SDK_VERSION\s*=\s*'([^']+)'/.exec(configSrc);
assert.ok(versionMatch, CONFIG + ': не найдена константа PESTOVO_FIREBASE_SDK_VERSION');
const VERSION = versionMatch[1];
assert.ok(/^\d+\.\d+\.\d+$/.test(VERSION), CONFIG + ': версия SDK выглядит как семвер: ' + VERSION);

const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const VENDOR_RE = /src="js\/vendor\/(firebase-[a-z-]+)\.js(\?v=[0-9a-f]+)?"/g;

// ── 1. SDK self-hosted: ссылок на gstatic больше нет нигде ────────────────
const scanFiles = pages.map(f => path.join(ROOT, f))
    .concat([path.join(ROOT, CONFIG)])
    .concat(fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, 'js', f)))
    .concat([path.join(ROOT, 'sw.js')]);
for (const file of scanFiles) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(src.indexOf('gstatic.com/firebasejs') === -1,
        path.relative(ROOT, file) + ': остались ссылки на gstatic.com/firebasejs — ' +
        'SDK должен грузиться из js/vendor/ (CDN не переживает слабую мобильную сеть)');
}

const vendorBundles = ['firebase-app-compat.js', 'firebase-database-compat.js',
    'firebase-auth-compat.js', 'firebase-functions-compat.js'];
for (const b of vendorBundles) {
    assert.ok(fs.existsSync(path.join(ROOT, 'js', 'vendor', b)), 'нет js/vendor/' + b);
}
// Бандл app-compat несёт строку версии — по нему сверяем соответствие
// PESTOVO_FIREBASE_SDK_VERSION (остальные три из того же npm-дропа
// firebase@<версия> идут в комплекте с этим файлом).
{
    const src = fs.readFileSync(path.join(ROOT, 'js', 'vendor', 'firebase-app-compat.js'), 'utf8');
    assert.ok(src.indexOf('"' + VERSION + '"') !== -1,
        'js/vendor/firebase-app-compat.js: внутри нет версии "' + VERSION + '" — ' +
        'бандл из другого релиза SDK, нужен npm-пакет firebase@' + VERSION);
}

// ── 2. Версия и порядок тегов на страницах ────────────────────────────────
let pagesWithSdk = 0;
for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const tags = [...html.matchAll(VENDOR_RE)].map(m => m[1]);
    if (!tags.length) continue;
    pagesWithSdk++;

    for (const bundle of tags) {
        assert.notStrictEqual(bundle, 'firebase-functions-compat',
            page + ': firebase-functions-compat грузится тегом — он должен подгружаться ' +
            'по требованию из pestovoFunctions()');
    }

    const appIdx = tags.indexOf('firebase-app-compat');
    assert.ok(appIdx !== -1, page + ': не подключён firebase-app-compat.js');
    for (const dep of ['firebase-database-compat', 'firebase-auth-compat']) {
        const idx = tags.indexOf(dep);
        if (idx === -1) continue;
        assert.ok(idx > appIdx, page + ': ' + dep + '.js обязан идти после firebase-app-compat.js');
    }
}
assert.ok(pagesWithSdk >= 10, 'страниц с Firebase SDK не меньше 10, найдено ' + pagesWithSdk);

// ── 3. Ленивая загрузка functions-compat ──────────────────────────────────
assert.ok(/function\s+pestovoFunctions\s*\(/.test(configSrc),
    CONFIG + ': нет функции pestovoFunctions() — ленивой загрузки бандла функций');
assert.ok(configSrc.indexOf("'js/vendor/firebase-functions-compat.js'") !== -1,
    CONFIG + ': pestovoFunctions() не подгружает js/vendor/firebase-functions-compat.js');

// ── 4. Ни одного прямого firebase.functions() вне конфигурации ────────────
const direct = [];
for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
    if (!f.endsWith('.js') || f === 'firebase-config.js' || f.startsWith('vendor')) continue;
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    for (const line of src.split('\n')) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        if (line.indexOf('firebase.functions()') !== -1) direct.push('js/' + f + ': ' + line.trim().slice(0, 80));
    }
}
assert.deepStrictEqual(direct, [],
    'firebase.functions() вне js/firebase-config.js всегда падает (бандл грузится лениво):\n  ' +
    direct.join('\n  '));

// ── 5. Там, где есть вызовы функций, подключена и конфигурация ────────────
const callers = ['js/score-write.js', 'js/admin.js', 'js/admin-groups.js'];
for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const needs = callers.some(c => html.indexOf(c) !== -1);
    if (!needs) continue;
    assert.ok(html.indexOf(CONFIG) !== -1,
        page + ': подключён ' + callers.filter(c => html.indexOf(c) !== -1).join('/') +
        ', но нет ' + CONFIG + ' — pestovoFunctions() будет не определён');
}

console.log('Firebase SDK ' + VERSION + ': self-hosted в js/vendor/ (' + pagesWithSdk +
    ' страниц), порядок тегов верен, functions-compat грузится по требованию');
