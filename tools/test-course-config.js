'use strict';
// Юнит-тест конфигурации курса (js/course-config.js).
// Чистый модуль без DOM/Firebase — грузится в изолированный vm-контекст.
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

const sandbox = { console, Math, JSON, String, Number, Array, Object, parseInt, parseFloat, isNaN };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/course-config.js'), 'utf8'), sandbox, { filename: 'course-config.js' });

eq(sandbox.HOLES[18].p, 4, 'hole 18 par = 4');
eq(sandbox.HOLES[1].hcp, 5, 'hole 1 hcp = 5');
eq(sandbox.holePar(1), 4, 'holePar(1) = 4');
eq(sandbox.holePar(99), 4, 'holePar(unknown) falls back to 4');
eq(sandbox.holeDist(1, 'bk'), 373, 'holeDist(1, bk) = 373');
eq(sandbox.holeHcp(1), 5, 'holeHcp(1) = 5');
eq(sandbox.holeTiming(5), 15, 'holeTiming(5) = 15 (TIMINGS)');
eq(sandbox.TOTAL_PAR, 72, 'TOTAL_PAR = 72');
eq(sandbox.TIMINGS[5], 15, 'TIMINGS[5] = 15');
eq(sandbox.TEES.bk, 'Чёрный', 'TEES.bk');
eq(sandbox.TEE_ORDER.join(','), 'bk,bl,wh,rd', 'TEE_ORDER');
eq(sandbox.COURSE_RATINGS.men.bk.cr, 76, 'CR men black = 76');
eq(sandbox.COURSE_RATINGS.men.bk.sr, 144, 'SR men black = 144');
eq(sandbox.COURSE_RATINGS.women.bl.cr, 80.8, 'CR women blue = 80.8');
ok(sandbox.CLUB.indexOf('Пестово') >= 0, 'CLUB mentions Pestovo');
ok(sandbox.ADDR.indexOf('Мытищи') >= 0, 'ADDR mentions Mytishchi');

console.log('\n' + (failures ? ('\x1b[31m' + failures + ' failed\x1b[0m') : ('\x1b[32m' + total + ' passed\x1b[0m')) + ' (' + total + ' total)');
process.exit(failures ? 1 : 0);
