#!/usr/bin/env node
'use strict';
/*
 * test-esm-parity.js — гарантирует, что классические js/*.js и их ESM-копии
 * в src/ описывают ОДИН И ТОТ ЖЕ набор символов.
 *
 * Зачем: после переключения HTML на ESM-бандл (docs/MODULES-MIGRATION.md)
 * классические файлы остаются как (а) резервный путь откатывания и (б) то,
 * что грузят vm-тесты. Это «расходимость» из docs/CODE-REVIEW.md п.2: правка
 * в одной копии и забытая вторая — реальный баг-вектор. Тест ловит её автоматически.
 *
 * Проверки для каждой пары js/<name>.js ↔ src/<name>.js:
 *   1. Множество top-level объявлений классического файла (function/var)
 *      равно множеству export-ов ESM-файла.
 *   2. Список имён в мосте window (Object.assign(window, {…})) ESM-файла
 *      равен его export-ам — иначе legacy-код не увидит часть символов.
 *   3. Классический файл тоже публикует свои символы на window
 *      (var/function на верхнем уровне создают window-свойства) — сверяем,
 *      что мост src-версии не narrower классического набора.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function ok(cond, msg) {
    if (cond) { console.log('  ok  - ' + msg); }
    else { failed++; console.error('  FAIL - ' + msg); }
}

// ── Извлечение объявлений из классического скрипта ────────────────────────
// Только верхний уровень (объявления с нулевого отступа): var/function внутри
// тел функций в глобалы не попадают.
function classicDeclarations(src) {
    const names = new Set();
    const re = /^(?:function[ \t]+([A-Za-z_$][\w$]*)\s*\(|(?:var|let|const)[ \t]+([A-Za-z_$][\w$]*)\s*[=;])/gm;
    let m;
    while ((m = re.exec(src)) !== null) names.add(m[1] || m[2]);
    return names;
}

// ── Извлечение export-ов и моста window из ESM-модуля ─────────────────────
function esmExports(src) {
    const names = new Set();
    const re = /^export\s+(?:function|var|let|const)\s+([A-Za-z_$][\w$]*)/gm;
    let m;
    while ((m = re.exec(src)) !== null) names.add(m[1]);
    return names;
}

function esmWindowBridge(src) {
    const names = new Set();
    const re = /Object\.assign\(\s*window\s*,\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        m[1].split(',').forEach(function (part) {
            const name = part.trim().split(':')[0].trim();
            if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
        });
    }
    return names;
}

const PAIRS = [
    ['js/course-config.js', 'src/course-config.js'],
    ['js/format.js', 'src/format.js'],
    ['js/date-range.js', 'src/date-range.js'],
    ['js/safe-html.js', 'src/safe-html.js'],
    ['js/dom.js', 'src/dom.js'],
    ['js/i18n.js', 'src/i18n.js'],
    ['js/official-alerts.js', 'src/official-alerts.js']
];

console.log('test-esm-parity: пар ' + PAIRS.length);

for (const pair of PAIRS) {
    const classicPath = path.join(ROOT, pair[0]);
    const esmPath = path.join(ROOT, pair[1]);
    if (!fs.existsSync(classicPath) || !fs.existsSync(esmPath)) {
        ok(false, pair.join(' ↔ ') + ': оба файла существуют');
        continue;
    }
    const classic = classicDeclarations(fs.readFileSync(classicPath, 'utf8'));
    const exports = esmExports(fs.readFileSync(esmPath, 'utf8'));
    const bridge = esmWindowBridge(fs.readFileSync(esmPath, 'utf8'));

    const missingInEsm = [...classic].filter(function (n) { return !exports.has(n); });
    const extraInEsm = [...exports].filter(function (n) { return !classic.has(n); });
    ok(missingInEsm.length === 0 && extraInEsm.length === 0,
        pair[0] + ' ↔ ' + pair[1] + ': наборы символов совпадают (' + classic.size + ')' +
        (missingInEsm.length ? '; нет в ESM: ' + missingInEsm.join(', ') : '') +
        (extraInEsm.length ? '; лишние в ESM: ' + extraInEsm.join(', ') : ''));

    const bridgeGap = [...exports].filter(function (n) { return !bridge.has(n); });
    ok(bridgeGap.length === 0,
        pair[1] + ': все export-ы выставлены на window' +
        (bridgeGap.length ? '; не выставлены: ' + bridgeGap.join(', ') : ''));
}

// ── src/index.js должен реэкспортировать все модули ───────────────────────
const indexSrc = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
const reExports = (indexSrc.match(/export \* from '\.\/([\w-]+)\.js';/g) || [])
    .map(function (l) { return /\.\/([\w-]+)\.js/.exec(l)[1]; });
PAIRS.forEach(function (pair) {
    const mod = path.basename(pair[1], '.js');
    ok(reExports.indexOf(mod) !== -1, 'src/index.js реэкспортирует ' + mod + '.js');
});

if (failed) { console.error('Провалено проверок: ' + failed); process.exit(1); }
console.log('Все проверки паритета classic/ESM пройдены ✔');
