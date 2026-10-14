'use strict';
/*
 * tools/test-build-public.js — проверка артефакта деплоя public/.
 *
 * public/ собирается tools/build-public.js (минификация js/css пофайлово) и
 * является каталогом, который Firebase Hosting отдаёт на прод
 * (hosting.public + hosting.predeploy в firebase.json). Каталог в .gitignore,
 * поэтому тест пересобирает его сам и проверяет инварианты:
 *
 *  1. Каждый локальный ассет, на который ссылается каждый HTML, существует
 *     в public/ (иначе страница на проде останется без скрипта).
 *  2. Каждый URL precache-манифеста sw.js существует в public/ (иначе
 *     установка Service Worker логирует провалы, а офлайн-режим неполон).
 *  3. Служебные файлы в public/ не попали (database.rules.json, src/, *.md,
 *     package*.json, vite.config.js, tools/, docs/, functions/).
 *  4. Каждый минифицированный .js проходит `node --check`.
 *  5. ГЛАВНОЕ: набор объявлений верхнего уровня в public/js/X.js совпадает с
 *     js/X.js. Приложение — классические <script>, где `function foo(){}` на
 *     верхнем уровне становится window.foo, и именно эти имена вызывают
 *     onclick-обработчики в HTML и соседние файлы. esbuild в режиме transform
 *     (не bundle) их не переименовывает — тест это фиксирует, чтобы будущая
 *     смена режима минификации не сломала приложение молча.
 *  6. HTML скопированы байт-в-байт: ?v=<hash> обязан совпадать с тем, что
 *     проверяет tools/rev-assets.js --check в CI.
 *  7. Минификация действительно уменьшила gzip-объём.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
let failures = 0;
function ok(cond, msg, extra) {
    if (cond) { console.log('ok  - ' + msg); }
    else { failures++; console.error('FAIL - ' + msg + (extra ? '\n       ' + extra : '')); }
}
const gz = (b) => zlib.gzipSync(b).length;

// ── Пересборка артефакта ──────────────────────────────────────────────────
const build = spawnSync(process.execPath, [path.join(__dirname, 'build-public.js')], { encoding: 'utf8' });
ok(build.status === 0, 'build-public.js завершился без ошибок',
    build.status === 0 ? '' : (build.stdout || '') + (build.stderr || ''));
ok(fs.existsSync(PUB), 'каталог public/ создан');
if (failures) { console.error('\nПровалено проверок: ' + failures); process.exit(1); }

function list(dir, acc) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        const rel = path.relative(PUB, p).split(path.sep).join('/');
        if (e.isDirectory()) list(p, acc); else acc.push(rel);
    }
    return acc;
}
const built = list(PUB, []);
ok(built.length > 50, 'в public/ ' + built.length + ' файлов');

// ── 1. Ассеты из HTML присутствуют ────────────────────────────────────────
const htmls = fs.readdirSync(ROOT).filter(function (f) { return f.endsWith('.html'); });
const missingRefs = [];
for (const h of htmls) {
    const t = fs.readFileSync(path.join(PUB, h), 'utf8');
    const re = /(?:src|href)="((?!https?:|\/\/|#|mailto:|data:|javascript:)[^"?]+)(?:\?[^"]*)?"/g;
    let m;
    while ((m = re.exec(t)) !== null) {
        const ref = m[1];
        if (!/\.(js|css|json|png|html)$/.test(ref)) continue;
        const norm = ref.replace(/^\.\//, '');
        if (built.indexOf(norm) === -1) missingRefs.push(h + ' -> ' + ref);
    }
}
ok(missingRefs.length === 0, 'все локальные ассеты из HTML существуют в public/', missingRefs.slice(0, 8).join('\n       '));

// ── 2. Preache-манифест sw.js ─────────────────────────────────────────────
const sw = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8');
const block = /STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/.exec(sw);
ok(!!block, 'public/sw.js: найден STATIC_ASSETS');
if (block) {
    const urls = [];
    const re = /['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(block[1])) !== null) urls.push(m[1]);
    const missing = urls.filter(function (u) {
        if (u === './') return false;
        return built.indexOf(u.split('?')[0]) === -1;
    });
    ok(missing.length === 0, 'все ' + urls.length + ' URL precache существуют в public/', missing.slice(0, 8).join(', '));
}

// ── 3. Служебное не деплоится ─────────────────────────────────────────────
const MUST_NOT = ['database.rules.json', 'package.json', 'package-lock.json', 'vite.config.js', 'README.md'];
const leaked = MUST_NOT.filter(function (f) { return built.indexOf(f) !== -1; });
ok(leaked.length === 0, 'служебные файлы не попали в public/', leaked.join(', '));
const badDirs = built.filter(function (f) {
    return /^(src|tools|docs|functions|node_modules)\//.test(f) || /\.md$/.test(f) || /(^|\/)\.[^/]/.test(f);
});
ok(badDirs.length === 0, 'в public/ нет src/, tools/, docs/, functions/, *.md и dot-файлов', badDirs.slice(0, 8).join(', '));

// ── 4. Синтаксис минифицированного JS ─────────────────────────────────────
const badSyntax = [];
for (const rel of built.filter(function (f) { return f.endsWith('.js'); })) {
    try { execFileSync(process.execPath, ['--check', path.join(PUB, rel)], { stdio: 'pipe' }); }
    catch (e) { badSyntax.push(rel); }
}
ok(badSyntax.length === 0, 'все .js в public/ проходят node --check', badSyntax.join(', '));

// ── 5. Глобалы верхнего уровня сохранены ──────────────────────────────────
const DECL_RES = [
    /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/gm
];
function topLevelNames(src) {
    const s = new Set();
    for (const re of DECL_RES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) s.add(m[1]);
    }
    return s;
}
// Минифицированный файл — одна длинная строка, поэтому якорь ^ здесь неприменим:
// имена ищем как целые слова. Переименование глобала esbuild не делает (в режиме
// transform он не знает, что имя не внешнее), так что исчезновение имени из
// вывода и означает поломку контракта window.* для HTML-onclick и соседних файлов.
function wholeWordPresent(src, name) {
    return new RegExp('(?<![\\w$])' + name.replace(/\$/g, '\\$') + '(?![\\w$])').test(src);
}
const jsRels = built.filter(function (f) { return /^js\/[^/]+\.js$/.test(f) && !f.startsWith('js/vendor/'); });
const mismatched = [];
let globalsChecked = 0;
for (const rel of jsRels) {
    const srcNames = topLevelNames(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const outSrc = fs.readFileSync(path.join(PUB, rel), 'utf8');
    globalsChecked += srcNames.size;
    const lost = [...srcNames].filter(function (n) { return !wholeWordPresent(outSrc, n); });
    if (lost.length) mismatched.push(rel + ' lost=' + lost.slice(0, 6).join('/') + (lost.length > 6 ? '…' : ''));
}
ok(mismatched.length === 0,
    'все ' + globalsChecked + ' глобалов верхнего уровня из ' + jsRels.length + ' файлов присутствуют в минифицированных копиях',
    mismatched.slice(0, 6).join('\n       '));

// ── 6. HTML скопированы байт-в-байт (?v= совпадает с rev-assets) ──────────
const htmlDiff = htmls.filter(function (h) {
    return !fs.readFileSync(path.join(ROOT, h)).equals(fs.readFileSync(path.join(PUB, h)));
});
ok(htmlDiff.length === 0, 'все ' + htmls.length + ' HTML скопированы без изменений (?v= совпадают)', htmlDiff.join(', '));
for (const rel of ['sw.js', 'manifest.json']) {
    ok(fs.readFileSync(path.join(ROOT, rel)).equals(fs.readFileSync(path.join(PUB, rel))),
        rel + ' скопирован без изменений');
}

// ── 7. Минификация уменьшила gzip ─────────────────────────────────────────
let before = 0, after = 0, compared = 0;
for (const rel of built.filter(function (f) { return /\.(js|css)$/.test(f) && !f.startsWith('dist/'); })) {
    const srcAbs = path.join(ROOT, rel);
    if (!fs.existsSync(srcAbs)) continue;
    before += gz(fs.readFileSync(srcAbs));
    after += gz(fs.readFileSync(path.join(PUB, rel)));
    compared++;
}
ok(after < before,
    'gzip-объём js+css уменьшился: ' + (before / 1024).toFixed(0) + 'K → ' + (after / 1024).toFixed(0) + 'K (-' +
    Math.round(100 * (1 - after / before)) + '%) по ' + compared + ' файлам');

// dist/ не минифицируется повторно (Vite уже собрал; повторный esbuild делает файл больше)
ok(fs.readFileSync(path.join(ROOT, 'dist/livescoring-modules.js'))
    .equals(fs.readFileSync(path.join(PUB, 'dist/livescoring-modules.js'))),
'dist/livescoring-modules.js скопирован как есть (собирается Vite)');

if (failures) { console.error('\nПровалено проверок: ' + failures); process.exit(1); }
console.log('Артефакт деплоя public/ в порядке ✔');
