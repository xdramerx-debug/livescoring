#!/usr/bin/env node
'use strict';
/*
 * tools/check-unused-globals.js — поиск глобалов, которые объявлены, но нигде
 * не используются во всём репозитории.
 *
 * Зачем отдельный инструмент, а не ESLint: приложение — набор классических
 * <script>-файлов, где функция из js/utils.js вызывается из js/app.js, из
 * onclick в admin.html или из другого фичевого файла. ESLint линтит пофайлово
 * и с `no-undef: off`, поэтому для js/** правило no-unused-vars даёт только шум
 * (379 ложных срабатываний на момент аудита 2026-10) и в .eslintrc.json для
 * js/** отключено. Настоящая проверка «мёртвый глобал» — репозиторная:
 * упоминание имени нужно искать во ВСЕХ файлах сразу. Именно так
 * docs/CODE-AUDIT-2026-09.md нашёл 46 мёртвых функций (43 удалены).
 *
 * Как считается использование:
 *   — совпадение `(?<![\w$])NAME(?![\w$])` в любом файле корпуса
 *     (js/, src/, tools/, functions/, dist/, *.html, *.json, *.css, sw.js);
 *   — совпадения, которые являются САМИМ объявлением, вычитаются по точным
 *     индексам (а не «по одному на файл» — иначе функция, объявленная в трёх
 *     файлах и вызванная в одном из них, выглядела бы мёртвой);
 *   — обращение через точку (`obj.NAME`) использованием не считается, КРОМЕ
 *     держателей-псевдонимов global-объекта (`window.`, `globalThis.`, `self.`,
 *     а также `root.` / `win.` / `G.` из модулей-IIFE вида
 *     `(function (root) { … })(window)`) — так в этом коде глобалы читают
 *     TnMgrUI, TnMgrIO, TnMgrRoundUI, TnMgrSheetUI и др.
 *
 * Режимы:
 *   node tools/check-unused-globals.js            — отчёт; exit 1, если найдено
 *   node tools/check-unused-globals.js --json     — машиночитаемый вывод
 *   node tools/check-unused-globals.js --quiet    — только итог
 *
 * Исключения (осознанные контракты) — в ALLOWLIST ниже с причиной.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JSON_OUT = process.argv.includes('--json');
const QUIET = process.argv.includes('--quiet');

// Осознанно живые глобалы: вызываются динамически (window[name]) или являются
// публичным контрактом, который не видно статическим поиском. Перед добавлением
// проверить вручную, как это делал docs/CODE-AUDIT-2026-09.md.
const ALLOWLIST = {};

const SKIP_DIRS = new Set(['node_modules', '.git', 'public', 'img', '.bundle-check']);

function walk(dir, acc) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, acc);
        else if (/\.(js|html|json|css)$/.test(e.name)) acc.push(p);
    }
    return acc;
}

const allFiles = walk(ROOT, []).map(function (p) { return path.relative(ROOT, p).split(path.sep).join('/'); });
const contents = new Map();
for (const rel of allFiles) {
    try { contents.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (e) { /* нечитаемое пропускаем */ }
}

// ── Где объявлены глобалы ─────────────────────────────────────────────────
// Только классические скрипты приложения и service worker: там top-level
// объявление действительно становится свойством window.
// src/** — ES-модули (экспорт ≠ глобал), functions/** — CommonJS,
// tools/** — тестовые скрипты, js/vendor/** — сторонний код.
const TARGETS = allFiles.filter(function (rel) {
    return (/^js\/[^/]+\.js$/.test(rel) && !rel.startsWith('js/vendor/')) || rel === 'sw.js';
});

const DECL_RES = [
    /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/gm,
    /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/gm
];

const declared = new Map();   // name -> [files]
const declIndex = new Map();  // 'file\u0000name' -> Set(индекс имени в файле)

for (const rel of TARGETS) {
    const src = contents.get(rel) || '';
    for (const re of DECL_RES) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) {
            const name = m[1];
            if (!declared.has(name)) declared.set(name, []);
            if (declared.get(name).indexOf(rel) === -1) declared.get(name).push(rel);
            const key = rel + '\u0000' + name;
            if (!declIndex.has(key)) declIndex.set(key, new Set());
            declIndex.get(key).add(m.index + m[0].indexOf(name));
        }
    }
}

// ── Подсчёт использований ─────────────────────────────────────────────────
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Обращения через точку считаются использованием глобала, только если держатель
// — сам global-объект или его локальный псевдоним. В этом коде модули-IIFE
// пишут `var TnMgrUI = (function (root) { … root.TnMgrRoundUI … })(window)`,
// поэтому псевдонимы обязательны: без них живые модули выглядели бы мёртвыми.
const GLOBAL_HOLDERS = [
    'window.', 'globalThis.', 'self.', 'global.',
    'root.', 'win.', 'w.', 'G.', 'app.', 'pestovoApp.'
];

function countUses(name) {
    const re = new RegExp('(?<![\\w$])' + escapeRe(name) + '(?![\\w$])', 'g');
    let uses = 0;
    const where = [];
    for (const [rel, src] of contents) {
        re.lastIndex = 0;
        let m;
        let local = 0;
        while ((m = re.exec(src)) !== null) {
            const at = m.index;
            // 1. Это само объявление?
            const own = declIndex.get(rel + '\u0000' + name);
            if (own && own.has(at)) continue;
            // 2. Обращение через точку: используем только window./globalThis./self.
            if (at > 0 && src[at - 1] === '.') {
                const before = src.slice(Math.max(0, at - 12), at);
                if (!GLOBAL_HOLDERS.some(function (h) { return before.endsWith(h); })) continue;
            }
            local++;
        }
        if (local) { uses += local; where.push(rel + '×' + local); }
        if (uses > 4) break; // дальше считаем только факт «есть использования»
    }
    return { uses: uses, where: where };
}

const unused = [];
for (const name of declared.keys()) {
    if (Object.prototype.hasOwnProperty.call(ALLOWLIST, name)) continue;
    const r = countUses(name);
    if (r.uses === 0) unused.push({ name: name, files: declared.get(name) });
}
unused.sort(function (a, b) { return a.name.localeCompare(b.name); });

if (JSON_OUT) {
    console.log(JSON.stringify({ declared: declared.size, unused: unused }, null, 2));
    process.exit(unused.length ? 1 : 0);
}

if (!QUIET) {
    console.log('Проверено глобалов: ' + declared.size + ' (целевых файлов: ' + TARGETS.length + ')');
    console.log('Файлов в корпусе поиска: ' + contents.size);
}
if (unused.length) {
    console.error('\nНе используются нигде в репозитории (' + unused.length + '):');
    for (const u of unused) console.error('  ' + u.name + '  <-  ' + u.files.join(', '));
    console.error('\nУдалите их или добавьте в ALLOWLIST tools/check-unused-globals.js с причиной.');
    process.exit(1);
}
if (!QUIET) console.log('Мёртвых глобалов нет ✔');
