#!/usr/bin/env node
'use strict';
/*
 * tools/test-pin-positions.js — пин-позиция лунки на экране ввода счёта.
 *
 * Зачем отдельный тест. Панель пин-позиции живёт на трёх экранах ввода счёта
 * (setup-round.html, scorer.html, marker.html), данные приходят из админки
 * через settings/pin_positions, а разворот/сворачивание — свайпом. Ошибка в
 * любой из этих связей тихая: закладка просто не появляется или не
 * открывается, и узнать об этом можно только на поле.
 *
 * Что проверяем:
 *   1. нормализация данных из базы (мусор не ломает экран, зоны только 3×3);
 *   2. разметка: на каждом экране ввода счёта есть хост панели, скрипт
 *      подключён, в админке есть вкладка «Пин-позиции» и редактор;
 *   3. свёрнутый режим — только закладка; разворот — панель с зоной и закрытие;
 *   4. свайп влево разворачивает, свайп вправо сворачивает (touch-события);
 *   5. панель синхронизируется с текущей лункой (любая лунка раунда);
 *   6. выключенная настройка убирает закладку у всех;
 *   7. сохранение из админки пишет settings/pin_positions и сразу применяется;
 *   8. «Центр» по умолчанию: панель показывает центр, даже если лунки нет
 *      в базе, — но только когда позиция явно задана хотя бы для одной лунки;
 *   9. светлая тема и тач-цели описаны в CSS (≥44px закладка).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const passed = [];
function check(condition, message) {
    assert.ok(condition, message);
    passed.push(message);
}

function makeEnv(extraMarkup) {
    const dom = new JSDOM('<!doctype html><html lang="ru"><body>' +
        '<div id="gate">' + (extraMarkup || '') + '</div></body></html>',
        { runScripts: 'outside-only', url: 'https://club.example/scorer.html?round=r1&player=p1' });
    const win = dom.window;
    win.currentLang = 'ru';
    win.escapeHtml = function (value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
    const bindings = {};
    win.bindRealtimeValue = function (key, ref, render) {
        bindings[key] = { ref: ref, render: render };
    };
    win.__bindings = bindings;
    win.holePar = function (h) { return ({ 1: 4, 2: 4, 3: 5, 4: 3 })[h] || 4; };
    win.fmtTime = function (ts) {
        const d = new Date(ts);
        return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    };
    win.toast = function () {};
    win.vib = function () {};
    win.localStorage.clear();
    win.eval(read('js/pin-position.js'));
    return win;
}

// ── 1. Нормализация ───────────────────────────────────────────────────────
(function testNormalize() {
    const win = makeEnv();
    const empty = win.normalizePinPositions(null);
    check(empty.enabled === true && Object.keys(empty.holes).length === 0,
        'пустое значение: панель включена, лунок нет');

    const messy = win.normalizePinPositions({
        enabled: false,
        note: 'x'.repeat(400),
        updatedAt: '1730000000000',
        updatedBy: 'Судья',
        holes: {
            3: { zone: 'bl', note: 'Ветер слева' },
            7: 'fr',
            42: { zone: 'mc' },
            abc: { zone: 'mc' },
            8: { zone: 'nonsense' },
            9: { zone: 'mc', note: 12345 }
        }
    });
    check(messy.enabled === false, 'выключенная настройка нормализуется в enabled=false');
    check(Object.keys(messy.holes).sort().join(',') === '3,7,9',
        'мусор отбрасывается: остаются только лунки 1–18 с известной зоной');
    check(messy.holes[3].zone === 'bl' && messy.holes[3].note === 'Ветер слева',
        'зона и заметка лунки сохраняются');
    check(messy.holes[7].zone === 'fr', 'строковое значение зоны тоже принимается');
    check(messy.holes[9].note === '', 'нестроковая заметка превращается в пустую строку');
    check(messy.note.length <= 280, 'общая подсказка обрезается по длине');

    check(win.PIN_ZONES.length === 9, 'заданы ровно 9 зон грина (3×3)');
    check(win.PIN_ZONES.every(z => win.PIN_ZONE_META[z] && win.PIN_ZONE_META[z].ru && win.PIN_ZONE_META[z].en),
        'у каждой зоны есть подпись RU/EN и положение на схеме');
    check(win.pinZoneLabel('mc') === 'Центр грина', 'подпись зоны по-русски');
    win.currentLang = 'en';
    check(win.pinZoneLabel('mc') === 'Middle centre', 'подпись зоны по-английски');
    check(win.pinZoneLabel('zz') === '', 'неизвестная зона не даёт «[object Object]»');
})();

// ── 2. Разметка страниц и админки ─────────────────────────────────────────
(function testMarkup() {
    const pages = {
        'setup-round.html': { gate: 'active-scoring-view', source: 'play', panel: 'play-pin-panel' },
        'scorer.html': { gate: 'sc-body', source: 'scorer', panel: 'sc-pin-panel' },
        'marker.html': { gate: 'mk-body', source: 'marker', panel: 'mk-pin-panel' }
    };
    Object.keys(pages).forEach(function (page) {
        const html = read(page);
        const dom = new JSDOM(html).window.document;
        const host = dom.getElementById(pages[page].panel);
        check(!!host, page + ': есть хост панели #' + pages[page].panel);
        check(host.hasAttribute('data-pin-panel'), page + ': хост помечен data-pin-panel');
        check(host.getAttribute('data-pin-source') === pages[page].source,
            page + ': панель знает свою страницу (data-pin-source)');
        check(host.getAttribute('data-pin-gate') === pages[page].gate,
            page + ': панель скрывается вместе с экраном ввода (data-pin-gate)');
        check(!!dom.getElementById(pages[page].gate), page + ': экран-' + pages[page].gate + ' существует');
        check(/<script defer src="js\/pin-position\.js(\?v=[0-9a-zA-Z]+)?"><\/script>/.test(html),
            page + ': подключён js/pin-position.js');
        // Панель не должна попадать в блоки, которые переставляет админка.
        check(!host.hasAttribute('data-entry-block'), page + ': панель не участвует в порядке блоков ввода');
        const entries = dom.querySelectorAll('.score-entry');
        check(entries.length > 0, page + ': экран ввода счёта на месте');
    });

    const admin = new JSDOM(read('admin.html')).window.document;
    check(!!admin.querySelector('[data-admin-group="ops"] [data-arg="pinpositions"]'),
        'в админке есть вкладка «Пин-позиции» в группе «Смена»');
    check(!!admin.getElementById('tab-pinpositions'), 'секция #tab-pinpositions существует');
    const editor = admin.getElementById('pin-pos-editor');
    check(!!editor, 'редактор #pin-pos-editor на месте');
    ['pin-pos-holes', 'pin-pos-grid', 'pin-pos-hole-note', 'pin-pos-note', 'pin-pos-save',
        'pin-pos-status', 'pin-pos-enabled', 'pin-pos-zone-label', 'pin-pos-updated']
        .forEach(function (id) {
            check(!!admin.getElementById(id), 'в редакторе есть #' + id);
        });
    check(/data-admin-src="js\/admin-pin-positions\.js(\?v=[0-9a-zA-Z]+)?"/.test(read('admin.html')),
        'админка лениво грузит js/admin-pin-positions.js');
    check(read('js/admin-lazy.js').indexOf("pinpositions: ['pinpositions']") !== -1,
        'вкладка привязана к ленивой загрузке');
    check(read('js/admin.js').indexOf("t === 'pinpositions'") !== -1,
        'switchTab инициализирует редактор пин-позиций');
    // Ни одного inline-обработчика в новой разметке (CSP без 'unsafe-inline').
    const newMarkup = editor.outerHTML;
    check(!/\son(click|change|input|submit)=/i.test(newMarkup), 'в разметке редактора нет inline-обработчиков');
})();

// ── 3–6. Панель игрока ───────────────────────────────────────────────────
function panelHost(win, id) {
    return win.document.getElementById(id);
}
function touch(win, el, type, x, y) {
    const touchObj = { clientX: x, clientY: y };
    const evt = new win.Event(type, { bubbles: true });
    evt.touches = type === 'touchend' ? [] : [touchObj];
    evt.changedTouches = [touchObj];
    el.dispatchEvent(evt);
}
function swipe(win, el, dx) {
    touch(win, el, 'touchstart', 300, 400);
    touch(win, el, 'touchend', 300 + dx, 400);
}

(function testPanel() {
    const win = makeEnv(
        '<div class="pin-panel" id="sc-pin-panel" data-pin-panel data-pin-source="scorer"' +
        ' data-pin-gate="gate" data-pin-hole="1"></div>'
    );
    win.pestovoPinMountPanels();
    const host = panelHost(win, 'sc-pin-panel');

    // Без данных панель не висит на экране.
    check(host.hidden === true, 'пока админ не задал позиции, закладка скрыта');

    win.pestovoPinPositionsApply({
        enabled: true, updatedAt: 1730000000000, updatedBy: 'Судья',
        holes: { 1: { zone: 'mc', note: 'Ветер в спину' }, 3: { zone: 'bl' } }
    });
    check(host.hidden === false, 'после данных закладка появляется');
    check(host.querySelector('.pin-tab') && !host.classList.contains('is-open'),
        'в свёрнутом режиме видна только закладка');
    const tab = host.querySelector('.pin-tab');
    check(tab.getAttribute('aria-expanded') === 'false', 'у закладки aria-expanded=false');
    check(tab.textContent.indexOf('1') !== -1, 'на закладке номер открытой лунки');
    const sheet = host.querySelector('.pin-sheet');
    check(sheet && sheet.getAttribute('aria-hidden') === 'true', 'панель свёрнута (aria-hidden=true)');
    check(sheet.textContent.indexOf('Центр грина') !== -1, 'панель показывает подпись зоны');
    check(sheet.textContent.indexOf('Ветер в спину') !== -1, 'заметка к лунке видна игроку');
    check(sheet.textContent.indexOf('Ветер') !== -1 && sheet.textContent.indexOf('Обновлено') !== -1,
        'панель сообщает, когда позиция обновлена');

    // Делегированный обработчик закладки (data-act) — как в js/ui-events.js.
    win.pestovoPinExpand('sc-pin-panel');
    check(host.classList.contains('is-open') && tab.getAttribute('aria-expanded') === 'true',
        'тап по закладке разворачивает панель');
    check(sheet.getAttribute('aria-hidden') === 'false', 'развёрнутая панель доступна для скринридера');

    win.pestovoPinCollapse('sc-pin-panel');
    check(!host.classList.contains('is-open') && tab.getAttribute('aria-expanded') === 'false',
        'кнопка «Свернуть» возвращает свёрнутый режим');

    // Свайп влево — развернуть, свайп вправо — свернуть.
    const swipeTarget = host;
    swipe(win, swipeTarget, -120);
    check(host.classList.contains('is-open'), 'свайп влево разворачивает панель');
    swipe(win, swipeTarget, 120);
    check(!host.classList.contains('is-open'), 'свайп вправо сворачивает панель');
    // Вертикальное движение свайпом не считается: страница должна скроллиться.
    touch(win, swipeTarget, 'touchstart', 300, 300);
    touch(win, swipeTarget, 'touchend', 260, 460);
    check(!host.classList.contains('is-open'), 'вертикальный жест не открывает панель');

    // Esc закрывает развёрнутую панель.
    win.pestovoPinExpand('sc-pin-panel');
    win.document.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check(!host.classList.contains('is-open'), 'Esc сворачивает панель');

    // Любая лунка раунда: панель переключается вместе с открытой лункой.
    win.pestovoPinPanelHole('scorer', 3);
    check(host.querySelector('.pin-tab').textContent.indexOf('3') !== -1,
        'панель следует за открытой лункой раунда');
    check(host.querySelector('.pin-sheet').textContent.indexOf('Дальняя левая') !== -1,
        'на новой лунке показана её зона');
    win.pestovoPinPanelHole('scorer', 2);
    check(host.hidden === true, 'лунка без заданной позиции прячет закладку');

    // Выключенная настройка убирает закладку у всех.
    win.pestovoPinPositionsApply({ enabled: false, holes: { 1: { zone: 'mc' } } });
    check(host.hidden === true, 'выключенная настройка скрывает закладку');

    // Смена языка перерисовывает подписи.
    win.pestovoPinPositionsApply({ enabled: true, holes: { 1: { zone: 'mc' } } });
    win.pestovoPinPanelHole('scorer', 1);
    win.currentLang = 'en';
    win.pestovoPinPositionsApply(win.pestovoPinPositions());
    check(host.querySelector('.pin-sheet').textContent.indexOf('Middle centre') !== -1,
        'при переключении на EN подпись зоны переводится');

    // Экран ввода скрыт — панель не висит поверх пустой страницы (на живой
    // странице это делает MutationObserver на контейнере экрана).
    const gate = win.document.getElementById('gate');
    gate.classList.add('hidden');
    win.pestovoPinPositionsApply(win.pestovoPinPositions());
    check(host.hidden === true, 'панель скрывается вместе с экраном ввода счёта');
    gate.classList.remove('hidden');
    win.pestovoPinPositionsApply(win.pestovoPinPositions());
    check(host.hidden === false, 'панель возвращается вместе с экраном ввода счёта');
})();

// ── 6b. Офлайн-кэш: последняя позиция видна и без сети ───────────────────
(function testOfflineCache() {
    const win = makeEnv(
        '<div class="pin-panel" id="sc-pin-panel" data-pin-panel data-pin-source="scorer"' +
        ' data-pin-gate="gate" data-pin-hole="4"></div>'
    );
    win.pestovoPinPositionsApply({ enabled: true, updatedAt: Date.now(), holes: { 4: { zone: 'fr' } } });
    check(win.localStorage.getItem('pestovo_pin_positions') !== null,
        'применённые пин-позиции кладутся в локальный кэш (нужен без сети)');
    // Имитация «холодного» старта: новый документ, база не отвечает.
    const offline = makeEnv(
        '<div class="pin-panel" id="sc-pin-panel" data-pin-panel data-pin-source="scorer"' +
        ' data-pin-gate="gate" data-pin-hole="4"></div>'
    );
    offline.localStorage.setItem('pestovo_pin_positions', JSON.stringify({ enabled: true, holes: { 4: { zone: 'fr' } } }));
    // Модуль грузится заново — так же, как при открытии страницы без сети.
    offline.eval(read('js/pin-position.js'));
    offline.pestovoPinMountPanels();
    offline.pestovoPinPanelHole('scorer', 4);
    const host = panelHost(offline, 'sc-pin-panel');
    check(host.hidden === false, 'без ответа базы панель показывает кэш, а не пустоту');
    check(host.querySelector('.pin-sheet').textContent.indexOf('Ближняя правая') !== -1,
        'из кэша поднимается правильная зона лунки');
})();

// ── 7. Админка: черновик, сохранение, применение ─────────────────────────
(async function testAdmin() {
    const adminHtml = read('admin.html');
    const section = new JSDOM(adminHtml).window.document.getElementById('tab-pinpositions');
    const dom = new JSDOM('<!doctype html><html lang="ru"><body>' + section.outerHTML + '</body></html>',
        { runScripts: 'outside-only', url: 'https://club.example/admin.html' });
    const win = dom.window;
    win.currentLang = 'ru';
    win.escapeHtml = function (value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };
    win.toast = function () {};
    win.vib = function () {};
    win.holePar = function () { return 4; };
    win.fmtTime = function () { return '10:00'; };
    const writes = [];
    const listeners = {};
    win.db = {
        ref: function (pathName) {
            return {
                set: function (value) {
                    writes.push({ path: pathName, value: JSON.parse(JSON.stringify(value)) });
                    return Promise.resolve();
                },
                on: function (event, cb) { listeners[pathName] = cb; }
            };
        }
    };
    win.bindRealtimeValue = function (key, ref, render) { listeners[pestovoKey(key)] = render; };
    function pestovoKey(key) { return key; }
    win.localStorage.clear();
    win.eval(read('js/pin-position.js'));
    win.eval(read('js/admin-pin-positions.js'));

    const doc = win.document;
    win.pinAdminInit();
    check(doc.querySelectorAll('#pin-pos-holes .pin-pos-hole').length === 18,
        'редактор рисует все 18 лунок');
    check(doc.querySelectorAll('#pin-pos-grid .pin-pos-zone').length === 9,
        'редактор рисует сетку 3×3');
    check(doc.querySelector('#pin-pos-holes .pin-pos-hole.is-active').getAttribute('data-arg') === '1',
        'по умолчанию открыта первая лунка');
    check(doc.getElementById('pin-pos-zone-label').textContent === 'Центр грина',
        'новая лунка по умолчанию — центр грина');

    win.pinAdminSelectHole(7);
    check(doc.getElementById('pin-pos-hole-title').textContent === 'Лунка 7',
        'выбор лунки переключает активную (номер в заголовке)');
    win.pinAdminSetZone('bl');
    check(doc.getElementById('pin-pos-zone-label').textContent === 'Дальняя левая',
        'выбор зоны обновляет подпись и превью');
    check(doc.getElementById('pin-pos-preview-marker').style.top !== '',
        'маркер в превью двигается вместе с зоной');
    win.pinAdminSetHoleNote('Флажок за бункером');
    win.pinAdminSetNote('Сегодня грин быстрый');
    win.pinAdminSetEnabled(true);
    check(doc.getElementById('pin-pos-dirty').hidden === false,
        'несохранённые правки видны администратору');

    win.pinAdminSave();
    await new Promise(resolve => setTimeout(resolve, 0));
    const saved = writes.find(item => item.path === 'settings/pin_positions');
    check(!!saved, 'сохранение пишет settings/pin_positions');
    check(saved.value.enabled === true && saved.value.holes[7].zone === 'bl',
        'в базе остаётся выбранная зона');
    check(saved.value.holes[7].note === 'Флажок за бункером', 'заметка к лунке сохраняется');
    check(saved.value.note === 'Сегодня грин быстрый', 'общая подсказка сохраняется');
    check(!saved.value.holes[1], 'лунки без изменений в базу не пишутся');
    check(typeof saved.value.updatedAt === 'number' && saved.value.updatedAt > 0,
        'сохранение проставляет время обновления');
    check(doc.getElementById('pin-pos-status').textContent.indexOf('сохранены') !== -1,
        'администратор видит подтверждение сохранения');
    check(win.pestovoPinPositions().holes[7].zone === 'bl',
        'сохранённые позиции сразу видны на этом экране (живое применение)');

    // Выключение показывается игрокам пустой панелью.
    win.pinAdminSetEnabled(false);
    win.pinAdminSave();
    await new Promise(resolve => setTimeout(resolve, 0));
    check(writes.filter(item => item.path === 'settings/pin_positions').pop().value.enabled === false,
        'выключение «Показывать игрокам» уходит в базу');

    // «Все лунки — в центр» очищает явные значения.
    win.pinAdminSelectHole(7);
    win.pinAdminSetZone('fr');
    win.pinAdminResetAll();
    win.pinAdminSave();
    await new Promise(resolve => setTimeout(resolve, 0));
    const reset = writes.filter(item => item.path === 'settings/pin_positions').pop().value;
    check(Object.keys(reset.holes).length === 0, 'сброс в центр не оставляет записей по лункам');

    // Подписка админки идёт через общий реестр (без дублей слушателей).
    check(!!listeners['pin-positions-admin'] || !!listeners['pin-positions'],
        'подписка на пин-позиции зарегистрирована через bindRealtimeValue()');
})()
    .then(function () {
        // ── 8. CSS: закладка у правого края, тач-цель, светлая тема ──────
        const css = read('css/style.css');
        check(/\.pin-panel\s*\{[^}]*position:\s*fixed[^}]*right:\s*0/.test(css),
            'панель закреплена у правого края и не участвует в раскладке');
        check(/\.pin-tab\s*\{[^}]*width:\s*44px/.test(css), 'закладка — тач-цель 44px');
        check(/\.pin-panel\.is-open \.pin-sheet\s*\{[^}]*translateX\(0\)/.test(css),
            'развёрнутая панель выезжает слева от закладки');
        check(/\.pin-panel\.is-open \.pin-tab\s*\{[^}]*translateX\(100%\)/.test(css),
            'при развороте закладка уезжает за край');
        check(css.indexOf('body.sun-mode .pin-sheet') !== -1, 'светлая тема описана для панели');
        check(css.indexOf('prefers-reduced-motion') !== -1 && css.indexOf('.pin-tab,.pin-sheet{transition:none;}') !== -1,
            'анимация отключается при prefers-reduced-motion');
        check(/\.pin-sheet__collapse\s*\{[^}]*min-height:\s*44px/.test(css),
            'кнопка «Свернуть» — тач-цель 44px');
        check(/\.pin-sheet\s*\{[^}]*max-height:calc\(100dvh/.test(css) && /\.pin-sheet\s*\{[^}]*overflow-y:auto/.test(css),
            'на низком экране панель прокручивается внутри себя, а не выходит за окно');
        check(/\.pin-sheet\s*\{[^}]*visibility:hidden/.test(css),
            'свёрнутая панель не ловит тапы под закладкой (visibility:hidden)');
        check(/\.pin-panel\.is-open \.pin-sheet\s*\{[^}]*visibility:visible/.test(css),
            'развёрнутая панель снова видима и кликабельна');

        // ── 9. Скрипты страниц подключают панель до отрисовки шапки ──────
        ['js/scorer.js', 'js/marker.js', 'js/live.js'].forEach(function (file) {
            const src = read(file);
            check(src.indexOf('pestovoPinPanelHole(') !== -1,
                file + ': панель синхронизируется с текущей лункой');
        });

        console.log('PASS: ' + passed.length + ' проверок пин-позиции (свёрнутая закладка, свайп, админка)');
    })
    .catch(function (error) {
        console.error('FAIL: ' + error.message);
        process.exit(1);
    });
