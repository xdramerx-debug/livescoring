#!/usr/bin/env node
'use strict';
/*
 * Гарантирует, что precache-манифест и ?v= в HTML свежие (см. tools/rev-assets.js).
 * Ловит забытый запуск `npm run assets` после правки js/css: без этого игроки
 * оставались бы на старом кэше Service Worker (docs/CODE-REVIEW.md, п.6).
 *
 * Проверки:
 *  1. `node tools/rev-assets.js --check` завершается с кодом 0
 *     (все ?v= в HTML равны хешам файлов; манифест и CACHE_NAME в sw.js
 *     соответствуют сгенерированным).
 *  2. Каждый URL из STATIC_ASSETS существует на диске (без учёта ?v=).
 *  3. CACHE_NAME имеет вид pestovo-v<версия сайта из index.html>-<hash8>.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function ok(cond, msg) {
    if (cond) { console.log('  ok  - ' + msg); }
    else { failed++; console.error('  FAIL - ' + msg); }
}

// 1. --check генератора
const res = spawnSync(process.execPath, [path.join(__dirname, 'rev-assets.js'), '--check'],
    { encoding: 'utf8', cwd: ROOT });
ok(res.status === 0, 'rev-assets --check: манифест и ?v= свежие' +
    (res.status === 0 ? '' : '\n' + (res.stdout || '') + (res.stderr || '')));

// 2. Все URL манифеста существуют
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const block = /const STATIC_ASSETS = \[(.*?)\];/s.exec(sw);
ok(!!block, 'sw.js: найден блок STATIC_ASSETS');
if (block) {
    const urls = [];
    const re = /'([^']+)'/g;
    let m;
    while ((m = re.exec(block[1])) !== null) urls.push(m[1]);
    ok(urls.length > 50, 'в манифесте ' + urls.length + ' URL (ожидается > 50)');
    const missing = urls.filter(function (u) {
        if (u === './') return false;
        return !fs.existsSync(path.join(ROOT, u.split('?')[0]));
    });
    ok(missing.length === 0, 'все файлы манифеста существуют' + (missing.length ? ('; нет: ' + missing.join(', ')) : ''));
}

// 3. CACHE_NAME = pestovo-v<версия>-<hash8>
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const verM = /class="version-number">([\d.]+)</.exec(idx);
const cacheM = /^const CACHE_NAME = '([^']+)';$/m.exec(sw);
ok(!!verM && !!cacheM, 'index.html и sw.js: читаются версия и CACHE_NAME');
if (verM && cacheM) {
    ok(new RegExp('^pestovo-v' + verM[1] + '-[0-9a-f]{8}$').test(cacheM[1]),
        'CACHE_NAME "' + cacheM[1] + '" = pestovo-v' + verM[1] + '-<hash8>');
}

if (failed) { console.error('Провалено проверок: ' + failed); process.exit(1); }
console.log('Все проверки precache-манифеста пройдены ✔');
