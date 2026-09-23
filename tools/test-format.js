'use strict';
// Юнит-тест форматирования счёта (js/format.js).
// Чистый модуль; зависит от глобальной t() только во время вызова — ставим заглушку.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0, total = 0;
function eq(a, e, label) {
    total++;
    const x = JSON.stringify(a), y = JSON.stringify(e);
    if (x !== y) { failures++; console.error('FAIL', label, '\n  actual:  ', x, '\n  expected:', y); }
    else console.log('ok  -', label);
}
function ok(c, label) {
    total++;
    if (!c) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}

const sandbox = { console, Math, JSON, String, Number, Array, Object, parseInt, parseFloat, isNaN, t: function (k) { return k; } };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/format.js'), 'utf8'), sandbox, { filename: 'format.js' });

eq(sandbox.fmtScore(0), 'E', 'fmtScore(0) = E');
eq(sandbox.fmtScore(3), '+3', 'fmtScore(3) = +3');
eq(sandbox.fmtScore(-2), '-2', 'fmtScore(-2) = -2');
eq(sandbox.fmtScore(null), '—', 'fmtScore(null) = —');
eq(sandbox.fmtScore(undefined), '—', 'fmtScore(undefined) = —');
eq(sandbox.fmtScore(NaN), '—', 'fmtScore(NaN) = —');

eq(sandbox.scoreClass(-1), 's-un', 'scoreClass(-1) = s-un');
eq(sandbox.scoreClass(0), 's-ev', 'scoreClass(0) = s-ev');
eq(sandbox.scoreClass(1), 's-ov', 'scoreClass(1) = s-ov');
eq(sandbox.scoreClass(null), '', 'scoreClass(null) = empty');

eq(sandbox.holeResClass(3, 5), 'r-eag', 'holeResClass eagle (3 vs par 5)');
eq(sandbox.holeResClass(4, 5), 'r-bir', 'holeResClass birdie (4 vs par 5)');
eq(sandbox.holeResClass(5, 5), 'r-par', 'holeResClass par (5 vs par 5)');
eq(sandbox.holeResClass(7, 5), 'r-dbl', 'holeResClass double+ (7 vs par 5)');

ok(typeof sandbox.holeResName(1, 4) === 'string' && sandbox.holeResName(1, 4).length > 0, 'holeResName(1,4) returns non-empty string');
eq(sandbox.holeResName(4, 5), 'res_birdie', 'holeResName birdie -> t(res_birdie)');
eq(sandbox.holeResName(5, 5), 'res_par', 'holeResName par -> t(res_par)');
eq(sandbox.holeResName(1, 4), 'res_hio', 'holeResName hole-in-one -> t(res_hio)');

console.log('\n' + (failures ? ('\x1b[31m' + failures + ' failed\x1b[0m') : ('\x1b[32m' + total + ' passed\x1b[0m')) + ' (' + total + ' total)');
process.exit(failures ? 1 : 0);
