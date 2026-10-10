#!/usr/bin/env node
/**
 * DOM-проверка вкладки «Счетные карточки» (js/tn-mgr-printcards.js) в jsdom.
 *
 * Дополняет tools/test-tn-mgr-printcards.js (чистое ядро без браузера):
 * здесь поднимается настоящий admin.html с реальными модулями менеджера
 * турниров и in-memory базой, а затем проверяются экранные пути, которые
 * в Node-тестах недоступны (doc() === null):
 *   — разметка блоков таблицы: 6 блоков (№, Пар, Длина, Индекс, Фора, Удары),
 *     у каждого три ручки растягивания (↕ высота, ↔ подпись, ↘ весь блок);
 *   — панель «Цвет и шрифт»: живая правка цветов карточки и отдельного блока,
 *     полужирный, свои размеры блока числами;
 *   — растягивание блока мышью (pointer-события) правит черновик и предпросмотр;
 *   — двойной клик по блоку открывает его настройки;
 *   — инлайн-правка длин лунок на карточке;
 *   — в печать/PDF не попадают ручки блоков, строка «Длина» печатается.
 *
 *   npm i jsdom   (один раз; без jsdom тест просто пропускается)
 *   node tools/test-tn-mgr-printcards-ui.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var JSDOM;
try {
    JSDOM = require('jsdom').JSDOM;
} catch (e) {
    console.log('SKIP: jsdom не установлен (npm i jsdom) — DOM-тест карточек пропущен');
    process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
var dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/admin.html' });
var win = dom.window;

var fails = 0;
var total = 0;
function check(title, cond, extra) {
    total++;
    if (!cond) fails++;
    console.log((cond ? ' ok  ' : 'FAIL ') + ' | ' + title + (extra !== undefined ? ' → ' + extra : ''));
}

// ----------------------------------------------------------
// In-memory база (как в tools/harness/printcards-stub.js)
// ----------------------------------------------------------
function splitPath(p) { return String(p || '').split('/').filter(function (x) { return x !== ''; }); }
function makeDb() {
    var data = {};
    function get(p) {
        var node = data;
        splitPath(p).forEach(function (k) { node = node && typeof node === 'object' ? node[k] : undefined; });
        return node === undefined ? null : node;
    }
    function setAt(p, v) {
        var parts = splitPath(p);
        if (!parts.length) { data = v || {}; return; }
        var node = data;
        for (var i = 0; i < parts.length - 1; i++) {
            if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
            node = node[parts[i]];
        }
        if (v == null) delete node[parts[parts.length - 1]];
        else node[parts[parts.length - 1]] = v;
    }
    function snap(p) {
        return { key: splitPath(p).slice(-1)[0] || null, val: function () { return get(p); }, exists: function () { return get(p) != null; } };
    }
    function makeRef(p) {
        p = p || '';
        return {
            key: splitPath(p).slice(-1)[0] || null,
            once: function () { return win.Promise.resolve(snap(p)); },
            set: function (v) { setAt(p, v); return win.Promise.resolve(); },
            update: function (obj) { Object.keys(obj || {}).forEach(function (k) { setAt(p ? p + '/' + k : k, obj[k]); }); return win.Promise.resolve(); },
            remove: function () { setAt(p, null); return win.Promise.resolve(); },
            child: function (n) { return makeRef(p ? p + '/' + n : n); },
            on: function (ev, cb) { cb(snap(p)); return cb; },
            off: function () {}
        };
    }
    return { ref: makeRef, __get: get, __set: setAt };
}

win.db = makeDb();
win.currentLang = 'ru';
win.currentUser = { uid: 'test-admin' };
win.currentUserData = { role: 'admin' };
win.toast = function () {};
win.t = function (key) { return key; };
win.escapeHtml = function (s) { return String(s == null ? '' : s); };
win.baseUrl = function () { return 'https://example.test/'; };
win.uiConfirm = function () { return win.Promise.resolve(true); };
win.hasAdminPanelAccess = function () { return true; };

win.db.__set('tournaments/t1', {
    id: 't1',
    name: 'Кубок Пестово',
    startDate: '2026-06-01',
    club: 'Гольф-клуб Пестово',
    course: 'Пестово',
    players: { a: { id: 'a', fio: 'Иванов Иван', hi: 10, gender: 'men', active: true } },
    rounds: { r1: { id: 'r1', date: '2026-06-01' } },
    sheets: {
        r1: { entries: { a: { playerId: 'a', startHole: 1, startTime: '09:00', tee: 'wh', format: 'stroke' } } }
    }
});

['js/course-config.js', 'js/tn-mgr-core.js', 'js/tn-mgr-data.js', 'js/tn-mgr-io.js',
    'js/tn-mgr-ui.js', 'js/tn-mgr-printcards.js'].forEach(function (file) {
    win.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
});

var UI = win.TnMgrUI;
var PC = win.TnMgrPrintCards;
UI.state.route = { tab: 'printcards', tid: 't1', rid: 'r1', view: 'card' };
UI.state.tournament = win.db.__get('tournaments/t1');

// Родной #tnm-root из admin.html: на него навешивает слушатели UI.bindEvents.
var host = win.document.getElementById('tnm-root');
if (!host) {
    host = win.document.createElement('div');
    host.id = 'tnm-root';
    win.document.body.appendChild(host);
}
UI.bindEvents();

PC.state.panels.design = true;
PC.state.panels.fields = true;
host.innerHTML = PC.html();
PC.mount();

function fire(el, type, x, y) {
    var ev = new win.Event(type, { bubbles: true, cancelable: true });
    ev.clientX = x || 0;
    ev.clientY = y || 0;
    ev.button = 0;
    ev.pointerId = 1;
    el.dispatchEvent(ev);
}

// ----------------------------------------------------------
// 1. Разметка: блоки, ручки, панель «Цвет и шрифт»
// ----------------------------------------------------------
check('карточка-эталон отрисована', host.querySelectorAll('.tnpc-card').length === 1);
check('шесть блоков таблицы в правильном порядке',
    Array.prototype.map.call(host.querySelectorAll('.tnpc-block'), function (b) {
        return b.getAttribute('data-tnpc-block');
    }).join(',') === 'holes,par,length,index,fore,strokes');
check('по три ручки растягивания на каждый блок',
    host.querySelectorAll('[data-tnpc-block-resize]').length === 18,
    host.querySelectorAll('[data-tnpc-block-resize]').length);
check('режимы ручек: высота, подпись, весь блок', (function () {
    var modes = {};
    host.querySelectorAll('[data-tnpc-block-resize]').forEach(function (h) {
        var key = h.getAttribute('data-tnpc-block-resize') + ':' + h.getAttribute('data-mode');
        modes[key] = true;
    });
    return ['holes:h', 'holes:lab', 'holes:scale', 'strokes:h', 'strokes:lab', 'strokes:scale']
        .every(function (k) { return modes[k]; });
})());
check('блок «Длина» редактируется прямо в клетках',
    host.querySelectorAll('[data-tnpc-grid="len"]').length >= 18,
    host.querySelectorAll('[data-tnpc-grid="len"]').length);
check('панель «Цвет и шрифт» отдаёт настройки всех блоков',
    host.querySelectorAll('[data-block-cfg]').length === 6);
check('у карточки есть переменные дизайна',
    /--tnpc-ink:#111111/.test(host.querySelector('.tnpc-card').getAttribute('style')));

// ----------------------------------------------------------
// 2. Живые правки: цвета карточки, размеры/цвет/полужирный блока
// ----------------------------------------------------------
var inkInput = host.querySelector('[data-tnm-live-edit="tnpc-design-color"][data-field="ink"]');
inkInput.value = '#00007a';
inkInput.dispatchEvent(new win.Event('input', { bubbles: true }));
check('смена цвета текста карточки применяется сразу',
    /--tnpc-ink:#00007a/.test(host.querySelector('.tnpc-card').getAttribute('style')));

var hInput = host.querySelector('[data-tnm-live-edit="tnpc-row"][data-block="par"][data-field="heightMm"]');
hInput.value = '12';
hInput.dispatchEvent(new win.Event('input', { bubbles: true }));
check('своя высота блока «Пар» применяется без перерисовки',
    /--tnpc-row-h:12mm/.test(host.querySelector('[data-tnpc-block="par"]').getAttribute('style')),
    host.querySelector('[data-tnpc-block="par"]').getAttribute('style'));

var colorInput = host.querySelector('[data-tnm-live-edit="tnpc-row-color"][data-block="strokes"][data-field="color"]');
colorInput.value = '#aa0000';
colorInput.dispatchEvent(new win.Event('input', { bubbles: true }));
check('цвет блока «Удары» применяется отдельно',
    /color:#aa0000/.test(host.querySelector('[data-tnpc-block="strokes"]').getAttribute('style')));

var boldBox = host.querySelector('[data-tnm-edit="tnpc-row-bold"][data-block="strokes"]');
boldBox.checked = true;
boldBox.dispatchEvent(new win.Event('change', { bubbles: true }));
check('полужирный блок получает класс b',
    host.querySelector('[data-tnpc-block="strokes"]').classList.contains('b'));

// ----------------------------------------------------------
// 3. Растягивание блока мышью (pointer-события)
// ----------------------------------------------------------
var cardEl = host.querySelector('.tnpc-card');
cardEl.getBoundingClientRect = function () {
    // jsdom не считает геометрию: карточка 200мм×1.2 на 800px экрана → 0.3мм/px.
    return { left: 0, top: 0, right: 800, bottom: 588, width: 800, height: 588, x: 0, y: 0 };
};
var handle = host.querySelector('[data-tnpc-block="par"] .tnpc-block-h-h');
fire(handle, 'pointerdown', 100, 100);
fire(host, 'pointermove', 100, 160);   // +60px ≈ +18мм → высота клампится в 18
fire(host, 'pointerup', 100, 160);
check('ручка ↕ растягивает блок: высота в черновике выросла и клампится',
    PC.state.draft.rows && PC.state.draft.rows.par && PC.state.draft.rows.par.heightMm === 18,
    JSON.stringify(PC.state.draft.rows && PC.state.draft.rows.par));
check('после растягивания стиль блока обновился без перерисовки',
    /--tnpc-row-h:18mm/.test(host.querySelector('[data-tnpc-block="par"]').getAttribute('style')));

var scaleHandle = host.querySelector('[data-tnpc-block="index"] .tnpc-block-h-se');
fire(scaleHandle, 'pointerdown', 100, 100);
fire(host, 'pointermove', 130, 130);   // диагональ: весь блок пропорционально
fire(host, 'pointerup', 130, 130);
check('ручка ↘ растягивает весь блок: кегль, высота и подпись вместе', (function () {
    var cfg = PC.state.draft.rows && PC.state.draft.rows.index;
    return !!cfg && cfg.fontMm > 2.9 && cfg.heightMm > 6.4 && cfg.labWMm > 15;
})(), JSON.stringify(PC.state.draft.rows && PC.state.draft.rows.index));

// ----------------------------------------------------------
// 4. Двойной клик по блоку и инлайн-правка длин
// ----------------------------------------------------------
var lenCell = host.querySelector('[data-tnpc-block="length"] td:not(.lab)');
fire(lenCell, 'dblclick', 10, 10);
check('двойной клик по блоку «Длина» открывает его настройки',
    host.querySelectorAll('[data-block-cfg="length"]').length === 1);

var lenSpan = host.querySelector('[data-tnpc-grid="len"][data-h="0"]');
lenSpan.textContent = '555';
fire(lenSpan, 'input', 0, 0);
fire(lenSpan, 'blur', 0, 0);
check('инлайн-правка длины попадает в черновик', PC.state.draft.lengths[0] === 555,
    String(PC.state.draft.lengths[0]));

// ----------------------------------------------------------
// 5. Печать: без ручек, с длинами
// ----------------------------------------------------------
var printed = PC.documentFor((PC.state.draft.cards || []).slice(0, 1));
check('в печати нет ручек блоков',
    printed.indexOf('data-tnpc-block-resize') === -1 && printed.indexOf('class="tnpc-block-h') === -1);
check('в печати есть строка «Длина» и значения лунок',
    printed.indexOf('>Длина, м</span>') !== -1 && printed.indexOf('>555</td>') !== -1);

console.log('\n' + (fails ? '✗ ' + fails + ' / ' + total : 'All tn-mgr-printcards-ui tests passed ✔ (' + total + ' checks)'));
process.exit(fails ? 1 : 0);
