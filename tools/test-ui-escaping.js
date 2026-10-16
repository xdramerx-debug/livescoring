// Экранирование в общих стоках интерфейса: toast() и uiConfirm().
//
// Почему отдельный тест. Оба — «стоки», в которые стекаются данные из Firebase
// из десятков мест: имена игроков, названия турниров и групп, тексты рассылок.
// Проверять каждое место вызова бессмысленно (их больше трёхсот и будут новые),
// поэтому экранирование живёт в самом стоке, а тест фиксирует это поведение.
//
// Найденные векторы, которые тест закрывает:
//   toast(text)      — js/pwa.js показывал заголовок и текст рассылки как HTML;
//   uiConfirm(text)  — js/tn-mgr-ui.js передавал имена участников («Удалить
//                      участников: …»), название турнира и название группы.
//   inline-onclick   — openPNGExportModal() строит имя файла из ФИО игрока и
//                      подставляет его в onclick="downloadPNGImage('…', '…')".
// Имя вида <img src=x onerror=…> исполнялось бы в сессии администратора —
// ровно того, кто может удалять данные.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

const XSS = '<img src=x onerror="window.__pwned=1">';
const XSS_TEXT = '<b>Вася</b> & "Кот"';

// ── 1. toast(): экранирование по умолчанию ────────────────────────────────
function makeToastSandbox() {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const sandbox = {
        document: dom.window.document,
        window: dom.window,
        navigator: dom.window.navigator,
        setTimeout: dom.window.setTimeout.bind(dom.window),
        clearTimeout: dom.window.clearTimeout.bind(dom.window),
        console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    // js/dom.js — классическая копия модуля (её же грузят страницы через
    // dist-бандл); держим в синхроне с src/dom.js, проверяет test-esm-parity.
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/dom.js'), 'utf8'), sandbox, { filename: 'dom.js' });
    return { sandbox, dom };
}

{
    const { sandbox, dom } = makeToastSandbox();
    assert.strictEqual(typeof sandbox.toast, 'function', 'toast должен быть объявлен');

    sandbox.toast(XSS);
    const msg = dom.window.document.querySelector('.toast-msg');
    assert.ok(msg, 'тост отрисован');
    assert.strictEqual(dom.window.__pwned, undefined, 'onerror исполнился — XSS через toast');
    assert.strictEqual(msg.querySelector('img'), null, 'в тексте тоста не должно быть узла <img>');
    assert.strictEqual(msg.textContent, XSS, 'тост показывает исходный текст как есть');

    // Амперсанд и кавычки не ломают разметку.
    const { sandbox: s2, dom: d2 } = makeToastSandbox();
    s2.toast(XSS_TEXT);
    const m2 = d2.window.document.querySelector('.toast-msg');
    assert.strictEqual(m2.querySelector('b'), null, '<b> в данных не должен стать разметкой');
    assert.strictEqual(m2.textContent, XSS_TEXT, 'текст с & и кавычками показан дословно');
}

// ── 2. toast({html: true}): разметка разрешена явно ───────────────────────
{
    const { sandbox, dom } = makeToastSandbox();
    sandbox.toast('✅ <b>Лунка 5</b><br>готово', 'success', { html: true });
    const msg = dom.window.document.querySelector('.toast-msg');
    assert.ok(msg.querySelector('b'), 'с флагом html разметка обязана сохраниться');
    assert.ok(msg.querySelector('br'), 'с флагом html <br> обязан сохраниться');
    assert.strictEqual(msg.querySelector('b').textContent, 'Лунка 5', 'текст внутри разметки цел');
}

// ── 3. Регрессия: вызов с разметкой без флага = будущая дыра ──────────────
// Флаг нельзя забыть: без него разметка уйдёт в текст и тост просто «сломается
// визуально», а при попытке «починить» сток вернут дыру. Держим явно.
{
    const offenders = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
        for (const m of src.matchAll(/\btoast\(/g)) {
            // границы вызова: считаем скобки, пропуская содержимое строк
            let i = m.index + m[0].length, depth = 1;
            while (i < src.length && depth > 0) {
                const c = src[i];
                if (c === '(') depth++;
                else if (c === ')') depth--;
                else if (c === '\'' || c === '"') {
                    const q = c;
                    i++;
                    while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
                }
                i++;
            }
            const call = src.slice(m.index, i);
            if (/<[a-z][a-z0-9]*[ >/]|<\/[a-z]/i.test(call) && !/html:\s*true/.test(call)) {
                offenders.push(f + ':' + (src.slice(0, m.index).split('\n').length));
            }
        }
    }
    assert.deepStrictEqual(offenders, [],
        'toast() с HTML-разметкой обязан передавать { html: true }: ' + offenders.join(', '));

    // И сток, и его ESM-копия должны экранировать по умолчанию.
    for (const rel of ['js/dom.js', 'src/dom.js']) {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        assert.match(src, /opts\.html \? \(m == null \? '' : String\(m\)\) : escapeHtml\(m\)/,
            rel + ': toast обязан экранировать сообщение по умолчанию');
    }
}

// ── 4. uiConfirm(): имена и названия не должны стать разметкой ────────────
{
    const utilsSrc = fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8');
    const start = utilsSrc.indexOf('function uiConfirm(opts) {');
    assert.ok(start !== -1, 'в js/utils.js не найдена function uiConfirm');
    let depth = 0, end = -1;
    for (let i = utilsSrc.indexOf('{', start); i < utilsSrc.length; i++) {
        const c = utilsSrc[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    assert.ok(end > start, 'не удалось выделить тело uiConfirm');
    const body = utilsSrc.slice(utilsSrc.indexOf('{', start), end);

    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const escSrc = fs.readFileSync(path.join(ROOT, 'js/safe-html.js'), 'utf8');
    const sandbox = {
        document: dom.window.document,
        console,
        Promise,
        escapeHtml: null // подставим ниже
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    // escapeHtml — из js/dom.js (там же, где и toast); в проде он приходит
    // на window из dist-бандла.
    vm.runInContext(escSrc + '\n' + fs.readFileSync(path.join(ROOT, 'js/dom.js'), 'utf8'), sandbox, { filename: 'dom.js' });
    vm.runInContext('var uiConfirm = function uiConfirm(opts)' + body, sandbox, { filename: 'uiConfirm' });

    // Типичный вызов из tn-mgr-ui.js: удаление участников подставляет имена.
    const p = vm.runInContext('uiConfirm({ title: ' + JSON.stringify(XSS) +
        ', text: ' + JSON.stringify(XSS_TEXT) + ', confirmLabel: ' + JSON.stringify(XSS) + ' })',
        sandbox);
    assert.ok(p && typeof p.then === 'function', 'uiConfirm вернул Promise');

    const title = dom.window.document.querySelector('.uic-title');
    const text = dom.window.document.querySelector('.uic-text');
    const yes = dom.window.document.querySelector('[data-uic="yes"]');
    assert.ok(title && text && yes, 'диалог отрисован');
    assert.strictEqual(dom.window.__pwned, undefined, 'onerror исполнился — XSS через uiConfirm');
    assert.strictEqual(title.querySelector('img'), null, 'заголовок не должен содержать <img>');
    assert.strictEqual(text.querySelector('b'), null, 'имя в тексте не должно стать разметкой');
    assert.strictEqual(yes.querySelector('img'), null, 'подпись кнопки не должна содержать <img>');
    assert.strictEqual(text.textContent, XSS_TEXT, 'текст показан дословно');
    assert.strictEqual(title.textContent, XSS, 'заголовок показан дословно');

    // Исходник: все четыре подстановки обязаны быть экранированы.
    assert.match(body, /escapeHtml\(o\.title\)/, 'uiConfirm экранирует title');
    assert.match(body, /escapeHtml\(o\.text \|\| ''\)/, 'uiConfirm экранирует text');
    assert.match(body, /escapeHtml\(o\.cancelLabel \|\| 'Отмена'\)/, 'uiConfirm экранирует cancelLabel');
    assert.match(body, /escapeHtml\(o\.confirmLabel \|\| 'OK'\)/, 'uiConfirm экранирует confirmLabel');
    p.catch(function () { /* диалог остаётся открытым — тесту это не мешает */ });
}

// ── 5. Текст рассылки в pwa.js экранируется у источника ───────────────────
// Здесь toast вызывается с { html: true }, поэтому экранирование лежит на
// вызывающем: заголовок и текст приходят из push-рассылки (Firebase).
{
    const pwa = fs.readFileSync(path.join(ROOT, 'js/pwa.js'), 'utf8');
    assert.match(pwa, /toast\('📢 <b>' \+ escapeHtml\(title\) \+ '<\/b><br>' \+ escapeHtml\(body\)/,
        'js/pwa.js: заголовок и текст рассылки должны экранироваться перед вставкой в HTML-тост');
}

// ── 6. openPNGExportModal(): имя игрока внутри inline-onclick ──────────────
// Третий сток того же класса. Имя файла для скачивания строится из ФИО игрока
// и уходит в onclick="downloadPNGImage('<data-url>', '<имя файла>')".
// Апостроф в фамилии (О'Коннор) рвал JS-строковый литерал; вместе с ним рвался
// и сам атрибут, так что имя <img src=x onerror=…> исполнялось бы в сессии того,
// кто открыл экспорт карточки.
{
    const utilsSrc = fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8');

    // utils.js тянет за собой firebase, поэтому песочнице отдаём только нужные
    // функции: self-contained тело плюс хелпер экранирования JS-аргумента.
    const cut = function (name) {
        const i = utilsSrc.indexOf('function ' + name + '(');
        assert.ok(i !== -1, 'в js/utils.js не найдена function ' + name);
        let depth = 0, end = -1;
        for (let j = utilsSrc.indexOf('{', i); j < utilsSrc.length; j++) {
            const c = utilsSrc[j];
            if (c === '{') depth++;
            else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
        }
        assert.ok(end > i, 'не удалось выделить тело ' + name);
        return utilsSrc.slice(i, end);
    };
    const body = cut('openPNGExportModal');

    const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    const sandbox = {
        document: dom.window.document,
        navigator: { share: function () {} }, // вторая кнопка — «поделиться»
        currentLang: 'ru',
        t: function (k) { return k; },
        escapeHtml: null,
        pestovoInlineJsArg: null
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/safe-html.js'), 'utf8') + '\n' +
        fs.readFileSync(path.join(ROOT, 'js/dom.js'), 'utf8'), sandbox, { filename: 'dom.js' });
    vm.runInContext(cut('pestovoInlineJsArg') + '\nvar openPNGExportModal = ' + body,
        sandbox, { filename: 'openPNGExportModal' });

    const PNG = 'data:image/png;base64,iVBORw0KGgo=';
    const NAME = "О'Коннор " + XSS; // апостроф рвёт строку, <img> — разметку
    vm.runInContext('openPNGExportModal(' + JSON.stringify(PNG) + ', ' +
        JSON.stringify(NAME) + ', "rid", "pid", null)', sandbox);

    const bodyEl = dom.window.document.getElementById('png-modal-body');
    assert.ok(bodyEl, 'модальное окно экспорта отрисовано');

    // <img> из имени игрока не должен стать узлом — только сама карточка.
    const imgs = bodyEl.querySelectorAll('img');
    assert.strictEqual(imgs.length, 1, 'в теле окна ровно одна картинка — карточка раунда');
    assert.strictEqual(imgs[0].getAttribute('src'), PNG, 'src карточки = data-URL');
    assert.strictEqual(bodyEl.querySelectorAll('[onerror]').length, 0,
        'onerror из имени игрока попал в разметку');

    // Обработчик цел: два строковых аргумента, без «дырки» в кавычках.
    const btns = bodyEl.querySelectorAll('button[onclick^="downloadPNGImage("]');
    assert.ok(btns.length >= 1, 'кнопка скачивания отрисована');
    for (const btn of btns) {
        const attr = btn.getAttribute('onclick');
        assert.strictEqual((attr.match(/'/g) || []).length, 4,
            'в обработчике ровно 4 кавычки — два строковых аргумента: ' + attr);
        assert.ok(attr.indexOf('onerror=') === -1 || attr.indexOf('\\x3c') !== -1,
            'имя игрока в обработчике должно быть экранировано: ' + attr);
    }

    // Исходник: обе подстановки обязаны быть экранированы.
    assert.match(body, /src="'\s*\+\s*escapeHtml\(pngDataUrl\)/,
        'js/utils.js: src картинки должен экранироваться через escapeHtml');
    assert.strictEqual((body.match(/pestovoInlineJsArg\(fileName\)/g) || []).length, 2,
        'js/utils.js: оба обработчика downloadPNGImage экранируют имя файла ' +
        'через pestovoInlineJsArg');
}

// ── 7. Регрессия: err.message в разметку ──────────────────────────────────
// Текст ошибки выглядит «своим», но приходит извне: это сообщение облачной
// функции, ошибка парсера Excel (имя листа и ячейки — из загруженного файла)
// или ответ внешнего сервиса. Правило простое: если err.message попадает в
// innerHTML, он обязан быть обёрнут в escapeHtml (или локальный esc/E).
{
    // Граница оператора: первый «;» вне строк и комментариев. Иначе в проверку
    // попадает соседний box.textContent = '…' + err.message — а он безопасен.
    const statementAt = function (src, from) {
        let i = from, depth = 0;
        while (i < src.length) {
            const c = src[i];
            if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
            if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
            if (c === '\'' || c === '"' || c === '`') {
                const q = c; i++;
                while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
                i++; continue;
            }
            if (c === '(' || c === '[' || c === '{') depth++;
            else if (c === ')' || c === ']' || c === '}') depth--;
            else if (c === ';' && depth <= 0) return src.slice(from, i);
            i++;
        }
        return src.slice(from, Math.min(src.length, from + 600));
    };

    const HELPERS = /(?:escapeHtml|esc|E|safeSetHTML|pestovoInlineJsArg|admJsStr|tnJsStr)\($/;
    const offenders = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js'))) {
        const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
        for (const m of src.matchAll(/\.innerHTML\s*(?:\+=|=)/g)) {
            const stmt = statementAt(src, m.index);
            for (const em of stmt.matchAll(/\berr\.message\b/g)) {
                const before = stmt.slice(Math.max(0, em.index - 40), em.index);
                // err.message может стоять внутри String(...) / .test(...) —
                // там он в разметку не идёт, это не подстановка.
                if (/\.test\([^()]*$/.test(before) || /\bString\([^()]*$/.test(before)) continue;
                if (!HELPERS.test(before) && !/\b(?:escapeHtml|esc|E)\([^()]*$/.test(before)) {
                    offenders.push(f + ':' + (src.slice(0, m.index).split('\n').length));
                }
            }
        }
    }
    assert.deepStrictEqual(offenders, [],
        'err.message в innerHTML обязан экранироваться (escapeHtml): ' + offenders.join(', '));

    // И не вырожденно: эти места закрыты и должны находиться проверкой.
    const covered = [
        ['js/admin-broadcasts.js', /escapeHtml\(err && err\.message/],
        ['js/admin-agr.js', /escapeHtml\(err\.message \|\| err\)/],
        ['js/admin-players-excel.js', /escapeHtml\(err\.message \|\| err\)/]
    ];
    for (const [rel, re] of covered) {
        assert.match(fs.readFileSync(path.join(ROOT, rel), 'utf8'), re, rel + ': ожидалось экранирование err.message');
    }
}

console.log('UI escaping tests passed (toast: экранирование по умолчанию + html-флаг, uiConfirm: 4 подстановки, pwa.js: рассылка, экспорт PNG: имя в inline-onclick, err.message: 5 мест)');
