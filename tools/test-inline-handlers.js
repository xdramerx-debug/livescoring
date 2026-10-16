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
// Цель — нули во всех строках. Как только файл обнуляется, строку из CAPS
// удаляют: тогда она начинает проверяться правилом «нет ни одного» выше.
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
        assert.strictEqual(idx, 0,
            page + ': js/ui-events.js обязан быть первым скриптом страницы — слушатель ' +
            'должен быть готов к клику раньше, чем страница построит разметку');
    }
}

// ── 4. Лимиты: число inline-обработчиков может только уменьшаться ─────────
const CAPS = {
    'admin.html': 130,
    'auth.html': 1,
    'handicap.html': 5,
    'hcp-badge-preview.html': 3,
    'js/admin-agr.js': 16,
    'js/admin-alerts.js': 3,
    'js/admin-broadcasts.js': 1,
    'js/admin-display.js': 4,
    'js/admin-entry-scorecard.js': 11,
    'js/admin-groups.js': 9,
    'js/admin-name-forms.js': 1,
    'js/admin-players-excel.js': 4,
    'js/admin-players.js': 7,
    'js/admin-score-audit.js': 1,
    'js/admin-scoreedit.js': 4,
    'js/app.js': 9,
    'js/design-admin.js': 6,
    'js/design-preview.js': 13,
    'js/handicap.js': 1,
    'js/leaderboard.js': 6,
    'js/live.js': 7,
    'js/players.js': 1,
    'js/protocol.js': 11,
    'js/pwa.js': 1,
    'js/qr-start.js': 2,
    'js/round-setup.js': 14,
    'js/solo.js': 2,
    'js/tn-scorecard.js': 3,
    'js/tournament-public.js': 2,
    'js/tournaments.js': 24,
    'js/utils.js': 29,
    'leaderboard.html': 2,
    'marker.html': 5,
    'offline.html': 1,
    'players.html': 7,
    'qr-start.html': 5,
    'scorer.html': 6,
    'setup-round.html': 35,
    'tournaments.html': 3,
};

let total = 0;
const grew = [];
for (const [file, cap] of Object.entries(CAPS)) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const n = countInline(src);
    total += n;
    if (n > cap) grew.push(file + ': было ' + cap + ', стало ' + n);
    if (n < cap) {
        // Файл переведён — лимит пора снимать: строка перестаёт быть исключением.
        console.log('  ↓ ' + file + ': ' + cap + ' → ' + n + ' (лимит можно снять)');
    }
    assert.ok(n <= cap, 'inline-обработчиков стало больше: ' + grew.join('; '));
}

// Файлы без строки в CAPS обязаны быть полностью чистыми.
const dusty = [];
for (const dir of ['', 'js']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
        if (!f.endsWith('.js') && !f.endsWith('.html')) continue;
        if (dir === 'js' && f.startsWith('vendor')) continue;
        const rel = dir ? dir + '/' + f : f;
        if (Object.prototype.hasOwnProperty.call(CAPS, rel)) continue;
        const n = countInline(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
        if (n > 0) dusty.push(rel + ': ' + n);
    }
}
assert.deepStrictEqual(dusty, [],
    'файл без лимита в CAPS обязан быть без inline-обработчиков (или получить строку в CAPS): ' +
    dusty.join(', '));

console.log('Inline handlers: ' + total + ' (было 396 в начале перевода на делегирование), файлов с лимитом: ' +
    Object.keys(CAPS).length);
