'use strict';
/*
 * tools/test-scoring-math.js — арифметика счёта против независимой модели.
 *
 * Зачем. js/utils.js — самый большой файл проекта (7 400 строк), и в нём
 * живут функции, от которых зависит каждая цифра на экране: удары по
 * гандикапу, Stableford, сводка раунда. До этого аудита (2026-10) у них
 * не было ни одного прямого теста: экранные тесты проверяли вёрстку, а
 * сюда смотрели только «на глаз». Ошибка в распределении гандикапных
 * ударов (например, «даём удар на самой лёгкой лунке вместо самой сложной»)
 * не падает и не выглядит сломанной — она просто тихо меняет счёт игрока.
 *
 * Что проверяем:
 *  1. Поле: 18 лунок, пары, индексы сложности 1..18 без повторов, дистанции.
 *  2. Удары по гандикапу (полевой и точный) совпадают с моделью WHS:
 *     индекс 1 — самая сложная лунка, при плюсовом гандикапе удар забирают
 *     с самой лёгкой лунки (индекс 18).
 *  3. Stableford: 2 очка за пар, ±1 за удар, ниже нуля не опускается.
 *  4. calcRoundStats: gross, toPar, played/remaining, currentHole, projected.
 *  5. Пикап (X / 0 / −) считается сыгранной лункой без ударов.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
let checks = 0;
function ok(cond, label, extra) {
    checks++;
    if (!cond) {
        failures++;
        console.error(' ✗', label + (extra ? ' — ' + extra : ''));
    } else {
        console.log(' ok   |', label);
    }
}

// ── Загружаем поле и нужные функции из js/utils.js в чистый контекст ──────
const utilsSrc = fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8');
const sandbox = { console: console };
sandbox.window = sandbox;
sandbox.document = {
    addEventListener: function () {}, removeEventListener: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    getElementById: function () { return null; }, readyState: 'complete', body: null
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/course-config.js'), 'utf8'), sandbox, { filename: 'course-config.js' });

function extractFunction(name) {
    const start = utilsSrc.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('js/utils.js: не найдена функция ' + name);
    let depth = 0;
    let i = utilsSrc.indexOf('{', start);
    for (; i < utilsSrc.length; i++) {
        if (utilsSrc[i] === '{') depth++;
        else if (utilsSrc[i] === '}') { depth--; if (depth === 0) break; }
    }
    return utilsSrc.slice(start, i + 1);
}

['parseExactHcp', 'calcNettScore', 'stablefordField', 'stablefordExact', 'calcRoundStats'].forEach(function (name) {
    const src = utilsSrc.indexOf('function ' + name + '(') >= 0 ? extractFunction(name) : null;
    if (src) vm.runInContext(src, sandbox, { filename: name });
});
// parseExactHcp тянет за собой разбор строки — если он не поднялся, берём простой.
if (typeof sandbox.parseExactHcp !== 'function') {
    sandbox.parseExactHcp = function (v) { return parseFloat(String(v).replace(',', '.')) || 0; };
}

const HOLES = sandbox.HOLES;
const TOTAL_PAR = sandbox.TOTAL_PAR;
const holePar = sandbox.holePar;
const holeHcp = sandbox.holeHcp;
const calcNettScore = sandbox.calcNettScore;
const stablefordField = sandbox.stablefordField;
const calcRoundStats = sandbox.calcRoundStats;
const HOLES_ORDER = Array.from({ length: 18 }, function (_, i) { return i + 1; });

// ── 1. Поле ───────────────────────────────────────────────────────────────
const holeIds = Object.keys(HOLES).map(Number).sort(function (a, b) { return a - b; });
ok(holeIds.length === 18, 'в конфиге 18 лунок', String(holeIds.length));
ok(holeIds.every(function (n, i) { return n === i + 1; }), 'лунки идут 1..18 без пропусков');
ok(holeIds.reduce(function (s, n) { return s + HOLES[n].p; }, 0) === TOTAL_PAR,
    'сумма паров равна TOTAL_PAR (' + TOTAL_PAR + ')');
const strokeIndexes = holeIds.map(function (n) { return HOLES[n].hcp; }).sort(function (a, b) { return a - b; });
ok(JSON.stringify(strokeIndexes) === JSON.stringify(HOLES_ORDER),
    'индексы сложности 1..18 без повторов и пропусков');
ok(holeIds.every(function (n) {
    return ['bk', 'bl', 'wh', 'rd'].every(function (tee) {
        const d = HOLES[n][tee];
        return d > 40 && d < 600;
    });
}), 'дистанции по всем ти в правдоподобных пределах');
ok(holePar(1) === HOLES[1].p && holePar(99) === 4, 'holePar: известная лунка и запасное значение 4');

// ── 2. Удары по гандикапу — независимая модель WHS ────────────────────────
// Индекс 1 — самая сложная лунка. При H = 18 удар на каждой лунке; при H > 18
// круг повторяется. При H < 0 (плюсовой гандикап) удары забирают с конца:
// первым страдает индекс 18 (самая лёгкая лунка).
function expectedExtra(hole, handicap) {
    const idx = holeHcp(hole);
    const abs = Math.abs(handicap);
    const full = Math.floor(abs / 18);
    const rest = abs % 18;
    let extra = handicap >= 0 ? full : -full;
    if (rest) {
        if (handicap > 0 && idx <= rest) extra += 1;
        if (handicap < 0 && (19 - idx) <= rest) extra -= 1;
    }
    return extra;
}

[0, 1, 5, 9, 17, 18, 19, 24, 36, -1, -2, -7, -18].forEach(function (hcp) {
    const mismatched = HOLES_ORDER.filter(function (h) {
        const par = holePar(h);
        const nett = calcNettScore(par, par, holeHcp(h), hcp);
        return par - nett !== expectedExtra(h, hcp);
    });
    ok(mismatched.length === 0,
        'удары по гандикапу H=' + hcp + ' совпадают с моделью',
        mismatched.length ? 'лунки ' + mismatched.join(',') : '');
});

// Точный гандикап округляется до целого — счёт согласован с той же моделью.
[3.4, 9.6, 18.5, -2.5].forEach(function (exact) {
    if (typeof sandbox.stablefordExact !== 'function') return;
    const rounded = Math.round(exact);
    const wrong = HOLES_ORDER.filter(function (h) {
        const got = sandbox.stablefordExact(holePar(h), h, exact);
        return got !== Math.max(0, 2 + expectedExtra(h, rounded));
    });
    ok(wrong.length === 0, 'точный гандикап ' + exact + ' (→' + rounded + ') совпадает с моделью',
        wrong.length ? 'лунки ' + wrong.join(',') : '');
});

// ── 3. Stableford ─────────────────────────────────────────────────────────
let stblMismatch = null;
[0, 5, 12, 20, 36].forEach(function (hcp) {
    HOLES_ORDER.forEach(function (h) {
        const par = holePar(h);
        [-3, -2, -1, 0, 1, 2, 5].forEach(function (diff) {
            const strokes = par + diff;
            if (strokes < 1) return;   // «0 ударов» — не результат, а отсутствие ввода
            const expected = Math.max(0, 2 - (strokes - expectedExtra(h, hcp) - par));
            const got = stablefordField(strokes, h, hcp);
            if (got !== expected && !stblMismatch) {
                stblMismatch = 'лунка ' + h + ', H=' + hcp + ', ударов ' + strokes +
                    ': ожидалось ' + expected + ', получено ' + got;
            }
        });
    });
});
ok(!stblMismatch, 'Stableford совпадает с моделью на 18 лунках × 5 гандикапов', stblMismatch || '');

// ── 4. Сводка раунда ──────────────────────────────────────────────────────
const parRound = {};
HOLES_ORDER.forEach(function (h) { parRound[h] = holePar(h); });
const even = calcRoundStats(parRound, 0, 0, HOLES_ORDER);
ok(even.gross === TOTAL_PAR, 'gross ровно по пару = TOTAL_PAR', String(even.gross));
ok(even.toPar === 0, 'toPar = 0 при игре по пару', String(even.toPar));
ok(even.holesPlayed === 18 && even.holesRemaining === 0, 'сыграны все 18 лунок');
ok(even.currentHole === null, 'после 18-й лунки currentHole = null');
ok(even.stablefordField === 36, 'Stableford за 18 паров = 36', String(even.stablefordField));

const empty = calcRoundStats({}, 0, 0, HOLES_ORDER);
ok(empty.holesPlayed === 0 && empty.currentHole === 1, 'пустая карточка: currentHole = 1');
ok(empty.toPar === null, 'пустая карточка: toPar = null (а не 0)');

const partial = calcRoundStats({ 1: 5, 2: 4 }, 0, 0, HOLES_ORDER);
ok(partial.holesPlayed === 2 && partial.holesRemaining === 16, 'частичная карточка: 2 сыграны, 16 осталось');
ok(partial.currentHole === 3, 'currentHole = первая несыгранная лунка', String(partial.currentHole));
ok(partial.toPar === 1, 'toPar считается только по сыгранным лункам', String(partial.toPar));
ok(partial.projected === 9 + (TOTAL_PAR - holePar(1) - holePar(2)),
    'projected = сыграно + пар оставшихся лунок', String(partial.projected));

// Пикап: лунка сыграна, но ударов не добавляет; в статистике — двойной боги.
const pickup = calcRoundStats({ 1: 'X', 2: 4 }, 0, 0, HOLES_ORDER);
ok(pickup.holesPlayed === 2, 'пикап (X) считается сыгранной лункой');
ok(pickup.gross === 4, 'пикап не добавляет ударов в gross', String(pickup.gross));
ok(pickup.doubles >= 1, 'пикап учитывается как двойной боги и хуже');
ok(calcRoundStats({ 1: '0' }, 0, 0, HOLES_ORDER).holesPlayed === 1, 'пикап «0» тоже считается сыгранной лункой');

// Счёт по лункам: берди/игл/пар/боги
const mixed = calcRoundStats({ 1: holePar(1) - 2, 2: holePar(2) - 1, 3: holePar(3), 4: holePar(4) + 1, 5: holePar(5) + 2 }, 0, 0, HOLES_ORDER);
ok(mixed.eagles === 1 && mixed.birdies === 1 && mixed.pars === 1 && mixed.bogeys === 1 && mixed.doubles === 1,
    'разбор результатов: 1 игл + 1 берди + 1 пар + 1 боги + 1 двойной',
    JSON.stringify({ e: mixed.eagles, b: mixed.birdies, p: mixed.pars, b1: mixed.bogeys, d: mixed.doubles }));

// Гандикап в сводке уменьшает счёт относительно пара
const withHcp = calcRoundStats(parRound, 9, 0, HOLES_ORDER);
// toPar считается по сыгранным ударам (gross), а гандикап виден в netToPar.
ok(withHcp.toPar === 0, 'toPar остаётся по gross (игра по пару = 0)', String(withHcp.toPar));
ok(withHcp.netToPar === -9, 'полевой гандикап 9 даёт netToPar = −9', String(withHcp.netToPar));
ok(withHcp.stablefordField === 45, 'Stableford с гандикапом 9 = 36 + 9', String(withHcp.stablefordField));

console.log('');
if (failures) {
    console.error('ПРОВАЛЕНО: ' + failures + ' из ' + checks);
    process.exit(1);
}
console.log('Счётная арифметика в порядке ✔ (' + checks + ')');
