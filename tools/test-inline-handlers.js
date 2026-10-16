// inline-обработчики (п.2 плана: убрать 'unsafe-inline' из CSP).
//
// Почему тест именно такой. Переход на делегирование — это 396 мест: 203 в
// HTML-страницах и 193 в разметке, которую собирает JS. Переписать их за один
// заход нельзя: обработчики живут на шестнадцати страницах, проверяются только
// живым прогоном, а падение клика в раунде дороже, чем лишний месяц с
// 'unsafe-inline'. Поэтому здесь зафиксирован текущий уровень: число
// inline-обработчиков в каждом файле может только уменьшаться. Вернуть
// onclick= в уже переведённый файл — значит сломать тест.
//
// Цель достигнута: inline-обработчиков в проекте ноль, таблица лимитов
// удалена, и теперь каждый файл проверяется правилом «ни одного». Вернуть
// onclick= — значит сломать тест и снова открыть 'unsafe-inline' в CSP.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const INLINE = /on(?:click|change|input|submit|error|load|dblclick|mouseover|focus|blur|keydown|keyup)\s*=\s*\\?["']/g;

function countInline(text) {
    let n = 0;
    for (const line of text.split('\n')) {
        // В комментариях про обработчики пишут чаще, чем их ставят.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
        n += (line.match(INLINE) || []).length;
    }
    return n;
}

// ── 1. Делегирование работает: js/ui-events.js ────────────────────────────
function makeSandbox() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const warns = [];
    const quietConsole = { log: function () {}, warn: function () { warns.push([...arguments].join(' ')); }, error: function () {} };
    const sandbox = { console: quietConsole, warns: warns, document: dom.window.document };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    require('vm').createContext(sandbox);
    require('vm').runInContext(fs.readFileSync(path.join(ROOT, 'js/ui-events.js'), 'utf8'), sandbox,
        { filename: 'ui-events.js' });
    return { sandbox, dom };
}

{
    const { sandbox, dom } = makeSandbox();
    const calls = [];
    sandbox.pestovoOnAction('demo', function () { calls.push([...arguments]); });
    sandbox.pestovoOnAction('demoSelf', function () { calls.push([...arguments]); });

    dom.window.document.body.innerHTML =
        '<div id="wrap">' +
        '<button id="b1" data-act="demo"><span>глубокая</span></button>' +
        '<button id="b2" data-act="demo" data-arg="42"></button>' +
        '<button id="b3" data-act="demo" data-arg="a" data-arg2="b"></button>' +
        '<button id="b4" data-act="demoSelf" data-self="1"></button>' +
        '<select id="s1" data-act="demo" data-arg="pid"><option value="v1" selected>v1</option></select>' +
        '<a id="a1" href="#x" data-act="noop" data-prevent="1">ссылка-превью</a>' +
        '</div>';

    const click = function (id) {
        dom.window.document.getElementById(id).dispatchEvent(
            new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    };

    click('b1');
    assert.deepStrictEqual(calls.pop(), [], 'клик по вложенному узлу находит [data-act] через closest');

    click('b2');
    assert.deepStrictEqual(calls.pop(), ['42'], 'data-arg уходит первым аргументом');

    click('b3');
    assert.deepStrictEqual(calls.pop(), ['a', 'b'], 'data-arg и data-arg2 — два аргумента');

    click('b4');
    assert.deepStrictEqual(calls.pop(), [dom.window.document.getElementById('b4')],
        'data-self передаёт сам элемент (замена onclick="fn(this)")');

    // change: значение поля добавляется последним аргументом.
    const sel = dom.window.document.getElementById('s1');
    sel.value = 'v1';
    sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.deepStrictEqual(calls.pop(), ['pid', 'v1'], 'change добавляет значение поля к аргументам');

    // preventDefault по data-prevent — замена onclick="return false" у ссылок.
    const ev = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
    dom.window.document.getElementById('a1').dispatchEvent(ev);
    assert.strictEqual(ev.defaultPrevented, true, 'data-prevent="1" отменяет переход по ссылке');

    // Неизвестное действие не должно ломать страницу.
    dom.window.document.body.innerHTML += '<button id="b5" data-act="нетТакого"></button>';
    assert.doesNotThrow(function () { click('b5'); }, 'неизвестный data-act — предупреждение, а не падение');
    assert.ok(sandbox.warns.some(function (w) { return w.indexOf('нетТакого') !== -1; }),
        'неизвестный data-act обязан предупредить в консоль — иначе опечатку не найти');
}

// ── 1b. Клавиатура, формы и мелкие действия ───────────────────────────────
{
    const { sandbox, dom } = makeSandbox();
    const calls = [];
    sandbox.pestovoOnAction('kd', function () { calls.push(['kd', ...arguments]); });
    sandbox.pestovoOnAction('then2', function () { calls.push(['then2']); });
    sandbox.pestovoOnAction('onSubmit', function () { calls.push(['submit', ...arguments]); });
    sandbox.pestovoOnAction('boolFn', function (v) { calls.push(['bool', v, typeof v]); });

    dom.window.document.body.innerHTML =
        '<button id="k1" data-kd-act="kd" data-kd-arg="a" data-kd-key="Enter,Space" data-prevent="1"></button>' +
        '<button id="k2" data-kd-act="kd" data-kd-ev="1"></button>' +
        '<button id="t1" data-act="pestovoClearValue" data-arg="f1" data-then="then2"></button>' +
        '<input id="f1" value="было">' +
        '<input id="c1" type="checkbox" checked data-act="kd" data-checked="1">' +
        '<input id="v1" value="текст" data-act="kd" data-val="1">' +
        '<button id="b1" data-act="pestovoRunBool" data-arg="boolFn" data-arg2="false"></button>' +
        '<form id="form1" data-sub-act="onSubmit" data-sub-ev="1" data-prevent="1"><input></form>';

    const fire = function (el, type, init) {
        const ev = new dom.window.Event(type, Object.assign({ bubbles: true, cancelable: true }, init || {}));
        if (init && 'key' in init) ev.key = init.key;
        dom.window.document.getElementById(el).dispatchEvent(ev);
        return ev;
    };
    const fireClick = function (id) {
        return dom.window.document.getElementById(id)
            .dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    };

    assert.deepStrictEqual(calls.pop(), undefined, 'старт: вызовов нет');
    fire('k1', 'keydown', { key: 'a' });
    assert.deepStrictEqual(calls.pop(), undefined, ' data-kd-key="Enter,Space" не реагирует на другую клавишу');

    const kdEv = fire('k1', 'keydown', { key: 'Enter' });
    assert.ok(calls.some(function (c) { return c[0] === 'kd' && c[1] === 'a'; }),
        'Enter вызывает действие с data-kd-arg');
    assert.strictEqual(kdEv.defaultPrevented, true, 'data-prevent="1" гасит клавишу по умолчанию');
    calls.length = 0;

    fire('k1', 'keydown', { key: ' ' });
    assert.deepStrictEqual(calls.pop(), ['kd', 'a'], 'Space (пробел) тоже срабатывает');

    fire('k2', 'keydown', { key: 'x' });
    const withEv = calls.pop();
    assert.strictEqual(withEv.length, 2, 'data-kd-ev="1": действие получает и событие, и аргументы');
    assert.ok(withEv[1] && withEv[1].type === 'keydown', 'data-kd-ev передаёт само событие первым аргументом');

    // data-then: второе действие следом (было onclick="…;fn()").
    fireClick('t1');
    assert.deepStrictEqual(calls.pop(), ['then2'], 'data-then вызывает второе действие');
    assert.strictEqual(dom.window.document.getElementById('f1').value, '',
        'pestovoClearValue очищает поле (было onclick="getElementById(...).value=\'\'")');

    fire('c1', 'change');
    assert.deepStrictEqual(calls.pop(), ['kd', true],
        'data-checked="1" передаёт checked (было onchange="fn(this.checked)")');

    fireClick('v1');
    assert.deepStrictEqual(calls.pop(), ['kd', 'текст'],
        'data-val="1" передаёт значение поля по клику');

    fireClick('b1');
    assert.deepStrictEqual(calls.pop(), ['bool', false, 'boolean'],
        'pestovoRunBool превращает строку "false" в булево false');

    const subEv = fire('form1', 'submit');
    const sub = calls.pop();
    assert.ok(sub && sub[0] === 'submit', 'форму ловит data-sub-act (было onsubmit="fn(event)")');
    assert.ok(sub[1] && sub[1].type === 'submit', 'data-sub-ev="1" передаёт событие отправки');
    assert.strictEqual(subEv.defaultPrevented, true, 'data-prevent="1" отменяет отправку формы');
}

// ── 1c. Готовые действия вместо JS-выражений в onclick ───────────────────
{
    const { dom } = makeSandbox();
    dom.window.document.body.innerHTML =
        '<b id="h1"></b><b id="h2"></b><i id="nx"></i>' +
        '<img id="i1" data-img-fail="hide-next"><i id="sib"></i>' +
        '<button id="go" data-act="pestovoHideSelf" data-ev="1"><span id="inner"></span></button>' +
        '<div id="d1"></div><div id="d2" class="hidden"></div>';
    const doc = dom.window.document;

    doc.getElementById('i1').dispatchEvent(new dom.window.Event('error'));
    assert.strictEqual(doc.getElementById('sib').style.display, 'flex',
        'data-img-fail="hide-next" показывает запасной элемент');

    // Клик по вложенному узлу — фон не закрывается.
    doc.getElementById('inner').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.notStrictEqual(doc.getElementById('go').style.display, 'none',
        'pestovoHideSelf не реагирует на клик по содержимому');
    doc.getElementById('go').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.strictEqual(doc.getElementById('go').style.display, 'none',
        'pestovoHideSelf прячет фон по клику по нему (было if(event.target===this))');
}

// ── 2. Запасные картинки: data-img-fail вместо onerror ────────────────────
{
    const { dom } = makeSandbox();
    dom.window.document.body.innerHTML =
        '<img id="i1" data-img-fail="hide">' +
        '<span><img id="i2" data-img-fail="hide-next"><b id="n2"></b></span>';
    const fire = function (id) {
        dom.window.document.getElementById(id).dispatchEvent(
            new dom.window.Event('error', { bubbles: false }));
    };

    fire('i1');
    assert.strictEqual(dom.window.document.getElementById('i1').style.display, 'none',
        'data-img-fail="hide" прячет картинку (было onerror="this.style.display=\'none\'")');

    fire('i2');
    assert.strictEqual(dom.window.document.getElementById('i2').style.display, 'none',
        'data-img-fail="hide-next" прячет картинку');
    assert.strictEqual(dom.window.document.getElementById('n2').style.display, 'flex',
        'и показывает следующий элемент — запасной аватар');
}

// ── 3. Модуль подключён на каждой странице до первых скриптов ─────────────
{
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
    assert.ok(pages.length >= 15, 'HTML-страниц не меньше 15, найдено ' + pages.length);
    for (const page of pages) {
        const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
        const scripts = [...html.matchAll(/<script[^>]+src="(js\/[^"?]+)\.js/g)].map(m => m[1]);
        const idx = scripts.indexOf('js/ui-events');
        assert.ok(idx !== -1, page + ': не подключён js/ui-events.js');
        // Слушатель должен быть готов к клику раньше, чем страница построит
        // разметку. Исключение одно — kiosk-mode-detect.js: он ставит класс на
        // <html> по адресу страницы и ни на что не подписывается.
        const before = scripts.slice(0, idx).filter(function (s) {
            return s !== 'js/kiosk-mode-detect';
        });
        assert.deepStrictEqual(before, [],
            page + ': js/ui-events.js обязан идти до остальных скриптов, нашлось перед ним: ' +
            before.join(', '));
    }
}

// ── 4. Ни одного inline-обработчика ни в одном файле ──────────────────────
const dirty = [];
for (const dir of ['', 'js']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
        if (!f.endsWith('.js') && !f.endsWith('.html')) continue;
        if (dir === 'js' && f.startsWith('vendor')) continue;
        const rel = dir ? dir + '/' + f : f;
        const n = countInline(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
        if (n > 0) dirty.push(rel + ': ' + n);
    }
}
assert.deepStrictEqual(dirty, [],
    'inline-обработчики вернулись — они несовместимы с CSP без unsafe-inline: ' + dirty.join(', '));

// ── 5. Ни одного встроенного <script> в HTML ──────────────────────────────
// Тег без src — тоже 'unsafe-inline'. Такой код выносится в js/*.
const inlineBlocks = [];
for (const f of fs.readdirSync(ROOT)) {
    if (!f.endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const n = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].length;
    if (n > 0) inlineBlocks.push(f + ': ' + n);
}
assert.deepStrictEqual(inlineBlocks, [],
    'встроенные <script> без src требуют unsafe-inline — вынести в js/*: ' + inlineBlocks.join(', '));

// ── 6. CSP: script-src без 'unsafe-inline' ────────────────────────────────
// style-src пока со 'unsafe-inline': inline style= остаются по всему проекту.
{
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
    const csp = (cfg.hosting.headers || [])
        .flatMap(h => h.headers || [])
        .map(h => (h.key === 'Content-Security-Policy' || h.header === 'Content-Security-Policy') ? h.value : null)
        .filter(Boolean)
        .join('\n');
    assert.ok(csp, 'в firebase.json не найден заголовок Content-Security-Policy');
    const scriptSrc = (/script-src([^;]*)/.exec(csp) || [])[1] || '';
    assert.ok(scriptSrc.indexOf("'unsafe-inline'") === -1,
        "script-src всё ещё разрешает 'unsafe-inline' — весь перевод на делегирование теряет смысл");
    assert.ok(scriptSrc.indexOf("'self'") !== -1, "script-src должен разрешать 'self'");
}

console.log('Inline handlers: 0 (было 396 в начале перевода на делегирование); ' +
    'встроенных <script> нет; script-src без unsafe-inline');
