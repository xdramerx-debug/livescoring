#!/usr/bin/env node
'use strict';
/*
 * check-bundle.js — проверяет, что закоммиченный ESM-бандл соответствует src/.
 *
 * Зачем: HTML переключён на <script type="module" src="dist/livescoring-modules.js">
 * (docs/MODULES-MIGRATION.md), а Firebase Hosting деплоит репозиторий как есть
 * (firebase.json: hosting.public = "."), без сборки. Значит бандл должен лежать
 * в репозитории — иначе после деплоя страницы остаются без фундамента
 * (course-config/format/date-range/safe-html/dom/i18n/official-alerts).
 * Чтобы бандл не «протух», CI пересобирает его и сверяет с committed-копией.
 *
 * Что делает: собирает бандл во временный каталог (.bundle-check/) и сравнивает
 * с dist/livescoring-modules.js. Расхождение → exit 1 с подсказкой `npm run build`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const COMMITTED = path.join(ROOT, 'dist', 'livescoring-modules.js');
const TMP_DIR = path.join(ROOT, '.bundle-check');
const TMP_FILE = path.join(TMP_DIR, 'livescoring-modules.js');

function fail(msg) { console.error('check-bundle: ' + msg); process.exit(1); }
function sha(buf) { return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12); }

if (!fs.existsSync(COMMITTED)) {
    fail('dist/livescoring-modules.js отсутствует — выполните `npm run build` и закоммитьте бандл.');
}

const res = spawnSync(process.execPath, [
    path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build',
    '--outDir', '.bundle-check', '--emptyOutDir'
], { cwd: ROOT, encoding: 'utf8' });

if (res.status !== 0) {
    console.error((res.stdout || '') + (res.stderr || ''));
    fail('vite build завершился с ошибкой (нужно `npm install`).');
}
if (!fs.existsSync(TMP_FILE)) fail('сборка не создала .bundle-check/livescoring-modules.js');

const fresh = fs.readFileSync(TMP_FILE);
const committed = fs.readFileSync(COMMITTED);
fs.rmSync(TMP_DIR, { recursive: true, force: true });

if (!fresh.equals(committed)) {
    fail('бандл устарел: собран ' + sha(fresh) + ', в репозитории ' + sha(committed) +
        '. Выполните `npm run build` и закоммитьте dist/.');
}

console.log('check-bundle: бандл соответствует src/ (' + committed.length + ' байт, ' + sha(committed) + ') ✔');
