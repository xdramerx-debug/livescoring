#!/usr/bin/env node
'use strict';
/*
 * tools/build-public.js — сборка каталога деплоя `public/`.
 *
 * Зачем. Firebase Hosting деплоит репозиторий без шага сборки, поэтому все
 * js/css уходили на прод как есть: index.html тянул 310 КБ gzip локальных
 * ассетов, admin.html — 637 КБ (замер аудита 2026-10, docs/IMPROVEMENTS-2026-10.md
 * п.5). Приложение — набор классических <script> с глобальными функциями,
 * поэтому бандлить его нельзя (порядок тегов и `var`-глобалы — часть
 * семантики), а вот минифицировать ПОФАЙЛОВО — можно и безопасно.
 *
 * Что делает:
 *   1. Собирает в public/ всё, что должно быть на проде: *.html, sw.js,
 *      manifest.json, css/**, js/** (включая vendor), dist/**, img/**.
 *      Служебное (src/, tools/, docs/, functions/, database.rules.json,
 *      package*.json, vite.config.js, *.md) не копируется вовсе — раньше это
 *      вычиталось списком hosting.ignore и всё равно уезжало на прод.
 *   2. Минифицирует js/** и css/** через esbuild.
 *   3. Проверяет каждый результат (`node --check` для JS) и не пишет файл,
 *      если минификация дала синтаксическую ошибку.
 *   4. Печатает отчёт по размерам.
 *
 * Режим минификации — ОСОЗНАННО неполный: `minifyWhitespace` + `minifyIdentifiers`
 * БЕЗ `minifySyntax`. Замер на этом репозитории: ws+ids даёт 251 КБ gzip против
 * 249 КБ у полного minify (разница 0.8 %), зато исключён целый класс рисков —
 * синтаксические перезаписи (function → arrow меняют `this`, схлопывание
 * выражений, переписывание литералов) в коде, где 7 600+ `var` и семантика
 * глобалов зависит от порядка исполнения. Переименование идентификаторов
 * безопасно: esbuild в режиме transform (не bundle) не трогает объявления
 * верхнего уровня — а именно они и есть window-глобалы, которые вызывают
 * onclick-обработчики в HTML и соседние файлы.
 *
 * dist/livescoring-modules.js НЕ минифицируется: его уже собрал Vite, а
 * повторный прогон esbuild делает файл на 4 % больше (проверено замером).
 *
 * `?v=<hash>` в HTML остаётся хешем ИСХОДНОГО файла — это корректно: правка
 * исходника меняет хеш, URL и, следовательно, отдаваемый минифицированный
 * контент. Проверку свежести версий по-прежнему делает tools/rev-assets.js.
 *
 * Запуск:  npm run build:public
 * В firebase.json прописан hosting.predeploy, поэтому `firebase deploy
 * --only hosting` собирает public/ автоматически.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public');
const esbuild = require('esbuild');

const JS_OPTS = { minifyWhitespace: true, minifyIdentifiers: true, minifySyntax: false };
const CSS_OPTS = { minify: true };

// ── Что копируем ──────────────────────────────────────────────────────────
function collect(dir, acc) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) collect(p, acc);
        else acc.push(path.relative(ROOT, p).split(path.sep).join('/'));
    }
    return acc;
}

const sources = [];
for (const f of fs.readdirSync(ROOT)) {
    if (/\.html$/.test(f)) sources.push(f);
}
sources.push('sw.js', 'manifest.json');
for (const dir of ['css', 'js', 'dist', 'img']) {
    if (fs.existsSync(path.join(ROOT, dir))) collect(path.join(ROOT, dir), sources);
}

// ── Очистка вывода ────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

function relOut(rel) { return path.join(OUT, rel); }

const gz = (b) => zlib.gzipSync(b).length;
const report = [];
let failed = 0;

function syntaxOk(absPath) {
    try {
        execFileSync(process.execPath, ['--check', absPath], { stdio: 'pipe' });
        return true;
    } catch (e) {
        return false;
    }
}

for (const rel of sources) {
    const srcAbs = path.join(ROOT, rel);
    const outAbs = relOut(rel);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });

    const raw = fs.readFileSync(srcAbs);
    const ext = path.extname(rel);
    const isJs = ext === '.js';
    const isCss = ext === '.css';
    // Не минифицируем:
    //  — dist/: уже собран Vite, повторный esbuild делает файл на 4 % больше;
    //  — sw.js: 10 КБ, зато Service Worker — самое сложное для отладки место
    //    «в поле», плюс tools/rev-assets.js и tools/test-sw-precache.js парсят
    //    блоки STATIC_ASSETS / CACHE_NAME регулярками по исходному формату.
    const skipMinify = rel.startsWith('dist/') || rel === 'sw.js';

    if (!isJs && !isCss) {
        fs.writeFileSync(outAbs, raw);
        report.push({ rel, raw: raw.length, out: raw.length, gzBefore: gz(raw), gzAfter: gz(raw), mode: 'copy' });
        continue;
    }
    if (skipMinify) {
        fs.writeFileSync(outAbs, raw);
        report.push({ rel, raw: raw.length, out: raw.length, gzBefore: gz(raw), gzAfter: gz(raw), mode: 'copy(prebuilt)' });
        continue;
    }

    const isVendor = rel.startsWith('js/vendor/');
    const opts = Object.assign(
        { loader: isCss ? 'css' : 'js', legalComments: isVendor ? 'inline' : 'none' },
        isCss ? CSS_OPTS : JS_OPTS
    );

    let out;
    try {
        out = esbuild.transformSync(raw.toString('utf8'), opts);
    } catch (e) {
        console.error('МИНИФИКАЦИЯ НЕ УДАЛАСЬ, копирую исходник: ' + rel + '\n  ' + (e && e.message || e));
        fs.writeFileSync(outAbs, raw);
        report.push({ rel, raw: raw.length, out: raw.length, gzBefore: gz(raw), gzAfter: gz(raw), mode: 'copy(fallback)' });
        continue;
    }

    const code = Buffer.from(out.code, 'utf8');
    fs.writeFileSync(outAbs, code);

    // JS обязан остаться синтаксически валидным после минификации.
    if (isJs && !syntaxOk(outAbs)) {
        failed++;
        console.error('ОШИБКА: минифицированный ' + rel + ' не проходит node --check — восстанавливаю исходник');
        fs.writeFileSync(outAbs, raw);
        continue;
    }

    const before = gz(raw), after = gz(code);
    if (after >= before) {
        // Минификация не помогла (редко, но бывает на коротких файлах) — берём исходник.
        fs.writeFileSync(outAbs, raw);
        report.push({ rel, raw: raw.length, out: raw.length, gzBefore: before, gzAfter: before, mode: 'copy(no-gain)' });
    } else {
        report.push({ rel, raw: raw.length, out: code.length, gzBefore: before, gzAfter: after, mode: 'minify' });
    }
}

// ── Отчёт ─────────────────────────────────────────────────────────────────
const sum = report.reduce(function (a, r) {
    a.raw += r.raw; a.out += r.out; a.gzBefore += r.gzBefore; a.gzAfter += r.gzAfter;
    return a;
}, { raw: 0, out: 0, gzBefore: 0, gzAfter: 0 });

report.sort(function (a, b) { return (b.gzBefore - b.gzAfter) - (a.gzBefore - a.gzAfter); });
console.log('build-public: ' + report.length + ' файлов → public/');
console.log('  топ экономии (gzip):');
for (const r of report.slice(0, 8)) {
    const pct = r.gzBefore ? Math.round(100 * (1 - r.gzAfter / r.gzBefore)) : 0;
    console.log('    ' + r.rel.padEnd(34) + (r.gzBefore / 1024).toFixed(0).padStart(5) + 'K → ' +
        (r.gzAfter / 1024).toFixed(0).padStart(4) + 'K  (-' + pct + '%)  ' + r.mode);
}
console.log('  ИТОГО raw: ' + (sum.raw / 1048576).toFixed(2) + ' МБ → ' + (sum.out / 1048576).toFixed(2) + ' МБ');
console.log('  ИТОГО gzip: ' + (sum.gzBefore / 1024).toFixed(0) + 'K → ' + (sum.gzAfter / 1024).toFixed(0) + 'K  (-' +
    Math.round(100 * (1 - sum.gzAfter / sum.gzBefore)) + '%)');

if (failed) {
    console.error('\nbuild-public: провалов ' + failed + ' — деплоить такой public/ нельзя');
    process.exit(1);
}
