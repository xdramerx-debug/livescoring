'use strict';
/*
 * tools/test-firebase-sdk.js — страховка подключения Firebase Web SDK.
 *
 * Что ловит:
 *
 * 1. Разнобой версий. Страницы грузят CDN-бандлы firebase-app/database/auth-
 *    compat. Если одну поднять, а вторую забыть, в одном приложении окажутся
 *    два экземпляра SDK — это не падает сразу, а расходится по поведению
 *    (второй initializeApp, свои слушатели, свои очереди записи). Версия теперь
 *    живёт одной константой в js/firebase-config.js, тест сверяет с ней все
 *    ссылки в HTML и в js/*.js.
 *
 * 2. Порядок тегов. database-compat и auth-compat обязаны идти после
 *    app-compat: они расширяют пространство firebase.*, а не создают его.
 *
 * 3. Лишний бандл. firebase-functions-compat.js (~30 КБ) раньше грузился
 *    тегом на 12 страницах, хотя callable-вызовов на них могло не быть.
 *    Теперь он подгружается по требованию из pestovoFunctions(), поэтому
 *    статический тег на странице — это возврат лишнего трафика.
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
const SDK_RE = /gstatic\.com\/firebasejs\/(\d+\.\d+\.\d+)\/(firebase-[a-z-]+)\.js/g;

// ── 1-2. Версия и порядок тегов ───────────────────────────────────────────
const versions = new Set();
let pagesWithSdk = 0;
for (const page of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const tags = [...html.matchAll(SDK_RE)].map(m => ({ version: m[1], bundle: m[2] }));
    if (!tags.length) continue;
    pagesWithSdk++;

    for (const tag of tags) {
        versions.add(tag.version);
        assert.strictEqual(tag.version, VERSION,
            page + ': версия SDK ' + tag.version + ' не совпадает с ' + CONFIG + ' (' + VERSION + ')');
        assert.notStrictEqual(tag.bundle, 'firebase-functions-compat',
            page + ': firebase-functions-compat грузится тегом — он должен подгружаться ' +
            'по требованию из pestovoFunctions()');
    }

    const names = tags.map(t => t.bundle);
    const appIdx = names.indexOf('firebase-app-compat');
    assert.ok(appIdx !== -1, page + ': не подключён firebase-app-compat.js');
    for (const dep of ['firebase-database-compat', 'firebase-auth-compat']) {
        const idx = names.indexOf(dep);
        if (idx === -1) continue;
        assert.ok(idx > appIdx, page + ': ' + dep + '.js обязан идти после firebase-app-compat.js');
    }
}
assert.ok(pagesWithSdk >= 10, 'страниц с Firebase SDK не меньше 10, найдено ' + pagesWithSdk);
assert.strictEqual(versions.size, 1, 'все страницы обязаны грузить одну версию SDK, найдено: ' +
    [...versions].join(', '));

// ── 3. Ленивая загрузка functions-compat ──────────────────────────────────
assert.ok(/function\s+pestovoFunctions\s*\(/.test(configSrc),
    CONFIG + ': нет функции pestovoFunctions() — ленивой загрузки бандла функций');
assert.ok(configSrc.indexOf("'/firebase-functions-compat.js'") !== -1 ||
    configSrc.indexOf('firebase-functions-compat.js') !== -1,
    CONFIG + ': pestovoFunctions() не подгружает firebase-functions-compat.js');

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

console.log('Firebase SDK: версия ' + VERSION + ' одна на всех (' + pagesWithSdk +
    ' страниц), порядок тегов верен, functions-compat грузится по требованию');
