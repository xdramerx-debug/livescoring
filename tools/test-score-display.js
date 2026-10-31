// js/score-display.js — общая часть карточки маркера, скорера и соло-раунда.
//
// Почему отдельный тест. В модуль вынесены три функции, которые раньше жили
// копиями в marker.js/scorer.js/solo.js: updDisp, checkVerify и buildHoles.
// Копии расходились деталями (у маркера «ввёл» — это его счёт, у игрока —
// свой), поэтому общее сделано через колбэки страницы, а сами состояния
// остались на её стороне. Тест проверяет именно общую часть: разметку ленты
// лунок и состояния сверки. Что страницы не держат свою копию — проверяет
// tools/test-scoring-duplicates.js через delegatesTo.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

// ── Песочница: общий модуль + заглушки окружения ──────────────────────────
function makeSandbox(opts) {
    opts = opts || {};
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const sandbox = {
        console,
        document: dom.window.document,
        currentLang: opts.lang || 'ru',
        // Содержимое кнопки собирают свои хелперы — здесь оно не проверяется,
        // важно только, что оно попадает внутрь кнопки с правильным счётом.
        entryHoleContentHTML: function (score, marker, hole, fieldHcp) {
            return '[h' + hole + ':' + score + '/' + marker + ':hcp' + fieldHcp + ']';
        },
        getRoundOrder: opts.order ? function () { return opts.order; } : undefined
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/score-display.js'), 'utf8'), sandbox,
        { filename: 'score-display.js' });
    return { sandbox, dom };
}

const eq = function (actual, expected, label) {
    // Массивы из песочницы vm имеют другой прототип, поэтому deepStrictEqual
    // на них падает даже при полном совпадении — сравниваем по содержимому.
    assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), label);
};

// ── 1. Лента лунок: состояния маркера ─────────────────────────────────────
{
    const { sandbox, dom } = makeSandbox({ order: [1, 2, 3] });
    const el = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(el);

    sandbox.pestovoBuildHoles({
        el: el,
        round: {},
        currentHole: 2,
        fieldHcp: 13,
        go: 'goMk',
        playerScore: function (h) { return { 1: 4, 2: 5 }[h]; },
        markerScore: function (h) { return { 1: 4 }[h]; },
        stateClass: function (h, ps, ms) {
            // Логика маркера: «ввёл / не ввёл» по его собственному счёту.
            let cls = '';
            if (ps >= 1 && ms >= 1 && ps === ms) cls += ' verified';
            else if (ps >= 1 && ms >= 1) cls += ' mismatch';
            else if (ms >= 1 || ps >= 1) cls += ' pending';
            if (h === 2 && !(ms >= 1)) cls += ' cur-blink';
            return cls;
        }
    });

    const btns = el.querySelectorAll('button.hole-btn');
    assert.strictEqual(btns.length, 3, 'по кнопке на лунку');
    eq([...btns].map(b => b.getAttribute('class')),
        ['hole-btn verified', 'hole-btn active pending cur-blink', 'hole-btn'],
        'классы состояний: подтверждена / текущая без счёта маркера / пустая');
    eq([...btns].map(b => b.getAttribute('data-act')), ['goMk', 'goMk', 'goMk'],
        'обработчик перехода подставлен из ctx.go');
    eq([...btns].map(b => b.getAttribute('data-arg')), ['1', '2', '3'],
        'номер лунки уходит в data-arg (делегирование, а не onclick)');
    eq([...btns].map(b => b.getAttribute('aria-pressed')), ['false', 'true', 'false'],
        'aria-pressed только на текущей лунке');
    eq([...btns].map(b => b.getAttribute('aria-label')), ['Лунка 1', 'Лунка 2', 'Лунка 3'], 'aria-label');
    assert.strictEqual(btns[0].textContent, '[h1:4/4:hcp13]', 'содержимое кнопки — счёт игрока и маркера');
    assert.strictEqual(btns[1].textContent, '[h2:5/0:hcp13]', 'без счёта маркера — 0');
}

// ── 2. Лента лунок: соло — маркера нет вовсе ──────────────────────────────
{
    const { sandbox, dom } = makeSandbox({ order: [1, 2] });
    const el = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(el);

    sandbox.pestovoBuildHoles({
        el: el,
        round: {},
        currentHole: 1,
        fieldHcp: 0,
        go: 'goHole',
        playerScore: function (h) { return { 2: 4 }[h]; },
        stateClass: function (h, s) {
            let cls = '';
            if (s >= 1 && h !== 1) cls += ' done';
            if (h === 1 && !(s >= 1)) cls += ' cur-blink';
            return cls;
        }
    });

    const btns = el.querySelectorAll('button.hole-btn');
    eq([...btns].map(b => b.getAttribute('class')), ['hole-btn active cur-blink', 'hole-btn done'],
        'в соло-раунде вместо verified/mismatch/pending одна метка done');
    assert.strictEqual(btns[1].textContent, '[h2:4/0:hcp0]',
        'без markerScore счёт маркера = 0 (в scoreSquareHTML это то же, что null)');
}

// ── 3. Порядок лунок: из getRoundOrder, иначе 1..18 ───────────────────────
{
    const { sandbox, dom } = makeSandbox({ order: [10, 11, 12] });
    const el = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(el);
    sandbox.pestovoBuildHoles({
        el: el, round: {}, currentHole: 10, fieldHcp: 0, go: 'goMk',
        playerScore: function () { return 0; }, stateClass: function () { return ''; }
    });
    eq([...el.querySelectorAll('button')].map(b => b.getAttribute('data-arg')),
        ['10', '11', '12'], 'порядок лунок берётся из getRoundOrder');

    const plain = makeSandbox({});
    const el2 = plain.dom.window.document.createElement('div');
    plain.dom.window.document.body.appendChild(el2);
    plain.sandbox.pestovoBuildHoles({
        el: el2, round: {}, currentHole: 5, fieldHcp: 0, go: 'goSc',
        playerScore: function () { return 0; }, stateClass: function () { return ''; }
    });
    assert.strictEqual(el2.querySelectorAll('button').length, 18,
        'без getRoundOrder — все 18 лунок по порядку');
}

// ── 4. Контейнера нет — молча выходим ─────────────────────────────────────
{
    const { sandbox } = makeSandbox({});
    assert.doesNotThrow(function () {
        sandbox.pestovoBuildHoles({
            el: null, round: {}, currentHole: 1, fieldHcp: 0, go: 'goMk',
            playerScore: function () { return 0; }, stateClass: function () { return ''; }
        });
    }, 'без контейнера buildHoles — no-op');
}

// ── 5. Сверка: четыре состояния, третье — по желанию страницы ─────────────
{
    const { sandbox, dom } = makeSandbox({});
    const box = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(box);

    const run = function (ctx) {
        sandbox.pestovoCheckVerify(Object.assign({
            box: box,
            matched: function (n) { return 'Совпадает: ' + n + ' уд.'; },
            playerLabel: function (n) { return 'Игрок: ' + n; },
            markerLabel: function (n) { return 'Маркер: ' + n; }
        }, ctx));
        return box.innerHTML;
    };

    assert.strictEqual(run({ playerScore: 4, markerScore: 4 }),
        '<div class="verify-ok">✅ Совпадает: 4 уд.</div>', 'совпадение');
    assert.strictEqual(run({ playerScore: 4, markerScore: 5 }),
        '<div class="verify-fail">⚠️ MISMATCH! Игрок: 4 | Маркер: 5</div>', 'расхождение');
    assert.strictEqual(run({ playerScore: 4, markerScore: 0 }),
        '', 'счёт игрока есть, маркера нет и waiting не передали — пусто (поведение скорера)');
    assert.strictEqual(run({ playerScore: 4, markerScore: 0, waiting: function (n) { return 'Игрок ввёл: ' + n; } }),
        '<div class="verify-wait">🏌️ Игрок ввёл: 4</div>', 'ожидание подтверждения (поведение маркера)');
    assert.strictEqual(run({ playerScore: 0, markerScore: 0, waiting: function (n) { return 'Игрок ввёл: ' + n; } }),
        '', 'счёта игрока нет — не показываем и ожидание');
    assert.strictEqual(run({ playerScore: null, markerScore: null }), '',
        'пустые данные не ломают разметку');

    // Контейнера нет — молча выходим.
    assert.doesNotThrow(function () {
        sandbox.pestovoCheckVerify({ box: null, playerScore: 1, markerScore: 1, matched: String, playerLabel: String, markerLabel: String });
    }, 'без контейнера checkVerify — no-op');
}

// ── 6. Вывод счёта: результат и подпись берутся из общих хелперов ─────────
{
    const { sandbox, dom } = makeSandbox({});
    const disp = dom.window.document.createElement('div');
    const result = dom.window.document.createElement('div');
    disp.id = 'mk-disp'; result.id = 'mk-result';
    dom.window.document.body.append(disp, result);

    sandbox.holePar = function () { return 4; };
    sandbox.scoreWithStablefordHTML = function (score, hole, fieldHcp, enabled) {
        return 'score:' + score + '/' + hole + '/hcp' + fieldHcp + '/' + (enabled ? 'stb' : '-');
    };
    sandbox.isPlayerStablefordDisplayEnabled = function () { return true; };
    sandbox.holeResName = function (score, par) { return score === par ? 'Пар' : 'Бёрди'; };
    sandbox.holeResClass = function (score, par) { return score === par ? 's-par' : 's-birdie'; };

    sandbox.pestovoUpdScoreDisplay({
        hole: 5,
        round: { players: { p1: { fieldHcp: 13 } }, fieldHcp: 7 },
        pid: 'p1',
        score: 4,
        get: function (id) { return dom.window.document.getElementById(id); },
        dispId: 'mk-disp',
        resultId: 'mk-result'
    });

    assert.strictEqual(disp.innerHTML, 'score:4/5/hcp13/stb', 'блок счёта — из scoreWithStablefordHTML');
    assert.strictEqual(result.textContent, 'Пар', 'подпись результата — из holeResName');
    assert.strictEqual(result.className, 'score-result s-par', 'класс результата — из holeResClass');

    // Гандикап игрока важнее гандикапа раунда.
    sandbox.pestovoUpdScoreDisplay({
        hole: 5, round: { players: { p9: {} }, fieldHcp: 7 }, pid: 'p9', score: 3,
        get: function (id) { return dom.window.document.getElementById(id); },
        dispId: 'mk-disp', resultId: 'mk-result'
    });
    assert.strictEqual(disp.innerHTML, 'score:3/5/hcp7/stb', 'нет fieldHcp у игрока — берём из раунда');
}

// ── 6b. Шапка лунки: общая renderHole для маркера и скорера ───────────────
// Копии различались составом шапки (378 байт у маркера против 1244 у скорера),
// поэтому ids.dist/ids.dl необязательны, а поведение «без игрока в раунде»
// настраивается флагом strict: маркер показывал par, скорер не рисовал ничего.
{
    const { sandbox, dom } = makeSandbox();
    sandbox.holePar = function () { return 3; };
    sandbox.holeDist = function (h, tee) { return h * 100 + (tee === 'wh' ? 1 : 0); };
    sandbox.fmtTime = function (ts) { return 't' + ts; };
    sandbox.roundHoleDeadlineTs = function (round, h) { return (round.startTime || 0) + h; };

    const doc = dom.window.document;
    doc.body.innerHTML =
        '<span id="mk-hole"></span><span id="mk-par"></span>' +
        '<span id="sc-hole"></span><span id="sc-par"></span><span id="sc-dist"></span><span id="sc-dl"></span>';
    const get = function (id) { return doc.getElementById(id); };

    // Маркер: ни дальности, ни дедлайна; раунда нет — счёт берётся из par.
    let score = null, updates = 0;
    sandbox.pestovoRenderHole({
        hole: 5, round: null, pid: 'p1', get: get,
        ids: { hole: 'mk-hole', par: 'mk-par' },
        setScore: function (v) { score = v; },
        update: function () { updates++; }
    });
    assert.strictEqual(doc.getElementById('mk-hole').textContent, '5', 'маркер: номер лунки в шапке');
    assert.strictEqual(doc.getElementById('mk-par').textContent, '3', 'маркер: пар из holePar');
    assert.strictEqual(score, 3, 'маркер: без сохранённого счёта показываем par');
    assert.strictEqual(updates, 1, 'маркер: блок счёта обновлён один раз');

    // Скорер: игрока в раунде нет → strict не даёт выставить счёт.
    score = null; updates = 0;
    sandbox.pestovoRenderHole({
        hole: 5, round: { players: {} }, pid: 'p1', get: get,
        ids: { hole: 'sc-hole', par: 'sc-par', dist: 'sc-dist', dl: 'sc-dl' },
        tee: 'wh', strict: true,
        setScore: function (v) { score = v; },
        update: function () { updates++; }
    });
    assert.strictEqual(score, null, 'скорер (strict): без игрока в раунде счёт не выставляем');
    assert.strictEqual(updates, 0, 'скорер (strict): и блок счёта не перерисовываем');

    // Скорер: игрок есть — заполняются дальность, дедлайн и сохранённый счёт.
    score = null; updates = 0;
    sandbox.pestovoRenderHole({
        hole: 2,
        round: { startTime: 1000, players: { p1: { scores: { 2: 7 } } } },
        pid: 'p1', get: get,
        ids: { hole: 'sc-hole', par: 'sc-par', dist: 'sc-dist', dl: 'sc-dl' },
        tee: 'wh', strict: true,
        setScore: function (v) { score = v; },
        update: function () { updates++; }
    });
    assert.strictEqual(score, 7, 'скорер: сохранённый счёт важнее par');
    assert.strictEqual(doc.getElementById('sc-dist').textContent, '201',
        'скорер: дальность считается по чашке игрока');
    assert.strictEqual(doc.getElementById('sc-dl').textContent, 't1002',
        'скорер: дедлайн лунки — из roundHoleDeadlineTs');
    assert.strictEqual(updates, 1, 'скорер: блок счёта обновлён');
}

// ── 7. Модуль подключён на всех трёх страницах до фичевого скрипта ────────
{
    // Единый экран ввода счёта (v1.126.0): на setup-round.html ленту лунок
    // строит live.js, поэтому порядок проверяем относительно него.
    const pages = { 'marker.html': 'marker.js', 'scorer.html': 'scorer.js', 'setup-round.html': 'live.js' };
    for (const [page, feature] of Object.entries(pages)) {
        const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
        const shared = html.indexOf('src="js/score-display.js');
        assert.ok(shared !== -1, page + ': не подключён js/score-display.js');
        assert.ok(shared < html.indexOf('src="js/' + feature),
            page + ': js/score-display.js обязан идти ДО js/' + feature);
    }
}

console.log('Score display tests passed (лента лунок: 3 страницы, сверка: 4 состояния, ' +
    'вывод счёта, шапка лунки: маркер и скорер)');
