// Автотесты защиты от «пулемётного» ввода счёта (запуск: node tools/test-scorer-freeze.js)
// Проверяются реальные js/utils.js + js/scorer.js и js/marker.js в vm-песочнице:
//   1) серия быстрых нажатий «Сохранить» на странице scorer (saveSc) даёт ровно
//      одну запись в базу, кнопка блокируется, повторные вызовы ничего не пишут;
//   2) после завершения записи блокировка снимается и лунка переходит дальше;
//   3) то же самое для страницы маркера (saveMk).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function ok(cond, label) {
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function eq(actual, expected, label) {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) { failures++; console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e); }
    else console.log('ok  -', label);
}

function makeDeferred() {
    let resolve, reject;
    const promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

// ── Сборка песочницы для конкретной страницы (scorer | marker) ──
function buildSandbox(scriptName, domIds) {
    const els = {};
    function fakeEl(id) {
        return {
            _id: id, _html: '', textContent: '', value: '', checked: false, disabled: false,
            className: '', style: { setProperty() {} },
            classList: {
                _set: {},
                add(c) { this._set[c] = true; }, remove(c) { delete this._set[c]; },
                toggle(c, on) { if (on === undefined) on = !this._set[c]; if (on) this._set[c] = true; else delete this._set[c]; return on; },
                contains(c) { return !!this._set[c]; }
            },
            set innerHTML(v) { this._html = String(v); }, get innerHTML() { return this._html; },
            querySelector() { return null; }, querySelectorAll() { return []; },
            appendChild() {}, removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
            scrollIntoView() {}, getAttribute() { return null; }, setAttribute() {}, focus() {}
        };
    }
    function getEl(id) { if (!els[id]) els[id] = fakeEl(id); return els[id]; }
    const store = {};
    const dbWrites = [];
    const dbState = { sets: dbWrites, round: null };
    function makeRef(p) {
        const ref = {
            _p: p || '',
            set(val) { dbWrites.push({ path: ref._p, val }); return Promise.resolve(); },
            update(obj) { dbWrites.push({ path: ref._p, obj, via: 'update' }); return Promise.resolve(); },
            remove() { return Promise.resolve(); },
            transaction(fn) { return Promise.resolve({ value: fn(null) }); },
            once() {
                if (ref._p === 'rounds') return Promise.resolve({ val: () => ({ R1: dbState.round }) });
                if (ref._p.indexOf('rounds/') === 0) return Promise.resolve({ val: () => dbState.round });
                return Promise.resolve({ val: () => null });
            },
            on() {}, off() {}, orderByChild() { return ref; }, equalTo() { return ref; },
            push() { return Promise.resolve({ key: 'newKey' }); }
        };
        return ref;
    }
    const sandbox = {
        console, Date, Math, JSON, parseInt, parseFloat, isFinite, isNaN, String, Number, Array, Object, Promise,
        setTimeout, clearTimeout, setInterval, clearInterval, RegExp, Error,
        encodeURIComponent, decodeURIComponent,
        document: {
            getElementById: getEl,
            createElement: (tag) => fakeEl(tag + '-created'),
            querySelector: () => null, querySelectorAll: () => [],
            addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
            documentElement: { style: { setProperty() {} }, classList: { add() {}, remove() {} } },
            body: { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, appendChild() {} }
        },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        sessionStorage: { getItem: () => null, setItem() {} },
        navigator: { language: 'ru', onLine: true, vibrate() {} },
        location: { search: '', pathname: '/' + scriptName, origin: 'https://club.example', href: '' },
        requestAnimationFrame: fn => { setTimeout(fn, 0); return 1; },
        URLSearchParams: function (q) {
            const m = {};
            String(q || '').replace(/^\?/, '').split('&').forEach(p => { const [k, v] = p.split('='); if (k) m[k] = decodeURIComponent(v || ''); });
            this.get = k => (k in m ? m[k] : null);
        },
        CustomEvent: function (type) { this.type = type; },
        alert() {}, confirm: () => true, fetch: () => Promise.resolve({ json: () => Promise.resolve({}) })
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.db = { ref: p => makeRef(p) };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8'), sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', scriptName + '.js'), 'utf8'), sandbox);
    return { sandbox, getEl, dbWrites, dbState };
}

function runScorer() {
    const t = buildSandbox('scorer', []);
    const { sandbox, getEl, dbWrites } = t;
    sandbox.scRid = 'R1';
    sandbox.scPid = 'me';
    sandbox.scRound = {
        mode: 'group', status: 'active', startHole: 1, holeRange: '1-18', tee: 'wh', format: 'Stroke Play',
        startTime: Date.now(),
        players: { me: { name: 'Иван Тестов', tee: 'wh', fieldHcp: 10, scores: {} } }
    };
    sandbox.scHole = 1;
    sandbox.scScore = 4;
    sandbox.scChanging = false;
    sandbox.scSaving = false;

    // Пять быстрых нажатий «Сохранить» подряд (запись в базе — синхронный промис,
    // но scSaving держится до завершения цепочки then — повторные вызовы игнорируются).
    sandbox.saveSc();
    sandbox.saveSc();
    sandbox.saveSc();
    sandbox.saveSc();
    sandbox.saveSc();

    const scoreWrites = dbWrites.filter(w => w.path === 'rounds/R1/players/me/scores/1');
    eq(scoreWrites.length, 1, 'scorer: быстрые нажатия дают ровно одну запись счёта');
    ok(sandbox.scSaving === true, 'scorer: флаг занятости записи установлен');
    ok(getEl('sc-save-btn').disabled === true, 'scorer: кнопка заблокирована на время записи');
    sandbox.saveSc();
    eq(dbWrites.filter(w => w.path === 'rounds/R1/players/me/scores/1').length, 1, 'scorer: повторный вызов ничего не пишет');

    // После разрешения промисов блокировка снимается, лунка переходит дальше.
    return new Promise(function (done) {
        setTimeout(function () {
            ok(sandbox.scSaving === false, 'scorer: после записи блокировка снята');
            ok(getEl('sc-save-btn').disabled === false, 'scorer: после записи кнопка снова доступна');
            eq(sandbox.scHole, 2, 'scorer: после сохранения перешли на следующую лунку');
            done();
        }, 30);
    });
}

function runMarker() {
    const t = buildSandbox('marker', []);
    const { sandbox, getEl, dbWrites } = t;
    sandbox.mkRid = 'R1';
    sandbox.mkPid = 'me';
    sandbox.mkRound = {
        mode: 'group', status: 'active', startHole: 1, holeRange: '1-18', tee: 'wh', format: 'Stroke Play',
        startTime: Date.now(),
        players: { me: { name: 'Иван Тестов', tee: 'wh', fieldHcp: 10, scores: {} } }
    };
    sandbox.mkHole = 1;
    sandbox.mkScore = 4;
    sandbox.mkScores = {};
    sandbox.mkPScores = {};
    sandbox.mkChanging = false;
    sandbox.mkSaving = false;

    sandbox.saveMk();
    sandbox.saveMk();
    sandbox.saveMk();

    const scoreWrites = dbWrites.filter(w => w.path === 'markers/R1/me/1');
    eq(scoreWrites.length, 1, 'marker: быстрые нажатия дают ровно одну запись счёта');
    ok(sandbox.mkSaving === true, 'marker: флаг занятости записи установлен');
    ok(getEl('mk-save-btn').disabled === true, 'marker: кнопка заблокирована на время записи');

    return new Promise(function (done) {
        setTimeout(function () {
            ok(sandbox.mkSaving === false, 'marker: после записи блокировка снята');
            ok(getEl('mk-save-btn').disabled === false, 'marker: после записи кнопка снова доступна');
            eq(sandbox.mkHole, 2, 'marker: после сохранения перешли на следующую лунку');
            done();
        }, 30);
    });
}

function runHoleScores() {
    const t = buildSandbox('scorer', []);
    const { sandbox } = t;
    const h = sandbox.hbnScoresHtml;
    ok(typeof h === 'function', 'hbnScoresHtml: хелпер доступен');
    if (typeof h !== 'function') return Promise.resolve();
    ok(h(0, 0) === '', 'hbnScoresHtml: без счёта — пусто');
    const both = h(4, 5);
    ok(both.indexOf('hbn-s-player') !== -1 && both.indexOf('>4</span>') !== -1, 'hbnScoresHtml: счёт игрока виден');
    ok(both.indexOf('hbn-s-marker') !== -1 && both.indexOf('hbn-s-lbl') !== -1 && both.indexOf('>5</span>') !== -1, 'hbnScoresHtml: счёт маркера виден с меткой');
    ok(both.indexOf('М') !== -1, 'hbnScoresHtml: метка маркера «М»');
    ok(h(4, 0).indexOf('hbn-s-marker') === -1 && h(4, 0).indexOf('>4</span>') !== -1, 'hbnScoresHtml: только счёт игрока');
    ok(h(0, 5).indexOf('hbn-s-player') === -1 && h(0, 5).indexOf('>5</span>') !== -1, 'hbnScoresHtml: только счёт маркера');
    return Promise.resolve();
}

runScorer().then(runMarker).then(runHoleScores).then(function () {
    console.log(failures ? '\n' + failures + ' проверок провалено ✘' : '\nВсе проверки защиты от быстрого ввода пройдены ✔');
    process.exit(failures ? 1 : 0);
});
