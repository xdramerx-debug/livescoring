// UI-тест главной страницы: соло-раунды в блоке «Сейчас на поле» свёрнуты
// точно так же, как групповые (запуск:
//   NODE_PATH=$(pwd)/../nmtest/node_modules node tools/test-home-solo-collapse.js
// )
// Поднимает НАСТОЯЩИЙ index.html в jsdom, выполняет НАСТОЯЩИЕ js/utils.js и
// js/app.js и проверяет разметку и поведение блока «Сейчас на поле»:
//   • соло-раунд рисуется одной свёрнутой строкой (без is-open, шеврон вниз);
//   • детали и счётная карточка спрятаны, пока строка не раскрыта (по CSS);
//   • тап по строке раскрывает её и запоминает состояние в localStorage;
//   • повторная перерисовка списка не сворачивает раскрытую строку обратно;
//   • групповой раунд ведёт себя так же (паритет);
//   • в блоке «Активный турнир» раунды по-прежнему развёрнуты (forceOpen).
// Если jsdom не установлен — тест пропускается (не падает).
'use strict';

var fs = require('fs');
var path = require('path');

var JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) { console.log('SKIP: jsdom не установлен (npm i jsdom) — UI-тест пропущен'); process.exit(0); }

var ROOT = path.join(__dirname, '..');
var failures = 0, checks = 0;
function ok(cond, label) {
    checks++;
    if (!cond) { failures++; console.error(' ✗', label); }
    else console.log(' ok   |', label);
}

var SOLO_ID = 'SOLO1';
var GROUP_ID = 'GROUP1';
var NOW = Date.now();

var rounds = {};
rounds[SOLO_ID] = {
    mode: 'solo',
    status: 'active',
    createdAt: NOW,
    startTime: NOW,
    startHole: 1,
    format: 'Stroke Play',
    tee: 'wh',
    players: {
        u1: { name: 'Иванов Иван', fieldHcp: 12, exactHcp: 12.4, tee: 'wh', scores: { 1: 4, 2: 5, 3: 5 } }
    }
};
rounds[GROUP_ID] = {
    mode: 'group',
    status: 'active',
    createdAt: NOW - 60000,
    startTime: NOW - 60000,
    startHole: 1,
    format: 'Stroke Play',
    tee: 'wh',
    players: {
        u2: { name: 'Петров Пётр', fieldHcp: 8, exactHcp: 8.1, tee: 'wh', scores: { 1: 5, 2: 4 } },
        u3: { name: 'Сидоров Олег', fieldHcp: 15, exactHcp: 15.2, tee: 'wh', scores: { 1: 4, 2: 6 } }
    }
};

// ── Фейковая база: подписка 'value' сразу отдаёт текущие данные ──
var listeners = {};
function makeRef(p) {
    var ref = {
        _p: p || '',
        on: function(ev, cb) {
            if (ev !== 'value') return;
            (listeners[ref._p] = listeners[ref._p] || []).push(cb);
            cb({ val: function() { return ref._p === 'rounds' ? rounds : null; } });
        },
        off: function() {},
        once: function() { return Promise.resolve({ val: function() { return ref._p === 'rounds' ? rounds : null; } }); },
        update: function() { return Promise.resolve(); },
        set: function() { return Promise.resolve(); },
        remove: function() { return Promise.resolve(); },
        child: function() { return makeRef(ref._p); },
        push: function() { return makeRef(ref._p); },
        ref: function() { return ref; },
        toString: function() { return ref._p; }
    };
    return ref;
}
function rerender() {
    Object.keys(listeners).forEach(function(p) {
        listeners[p].forEach(function(cb) {
            cb({ val: function() { return p === 'rounds' ? rounds : null; } });
        });
    });
}

var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<script src="https?:[^"]*"><\/script>/g, '');   // Firebase/FontAwesome не нужны

var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/index.html',
    pretendToBeVisual: true
});
var win = dom.window;
var doc = win.document;

// Настоящие стили страницы — чтобы проверить, что детали действительно скрыты
var style = doc.createElement('style');
style.textContent = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
doc.head.appendChild(style);

// Заглушки того, что обычно даёт Firebase
win.db = { ref: function(p) { return makeRef(p); } };
win.firebase = { auth: function() { return { onAuthStateChanged: function() {}, currentUser: null }; } };
win.currentUser = null;
win.currentUserData = null;
win.toast = function() {};
win.vib = function() {};
try { win.localStorage.clear(); } catch (e) {}

// Выполняем НАСТОЯЩИЙ код страницы
win.eval(fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8'));
win.eval(fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8'));
win.currentLang = 'ru';

// ── Рендер блока «Сейчас на поле» ──
win.loadLiveRounds();

var live = doc.getElementById('live-rounds');
ok(!!live, 'index.html: есть контейнер #live-rounds');

var rows = live.querySelectorAll('.lwl-row');
ok(rows.length === 2, '«Сейчас на поле»: два раунда = две строки (получено ' + rows.length + ')');

var soloRow = live.querySelector('.lwl-row[data-round-id="' + SOLO_ID + '"]');
var groupRow = live.querySelector('.lwl-row[data-round-id="' + GROUP_ID + '"]');
ok(!!soloRow, 'соло-раунд нарисован строкой списка');
ok(!!groupRow, 'групповой раунд нарисован строкой списка');

// ── Соло-раунд свёрнут, как групповой ──
ok(soloRow.classList.contains('live-round-row'), 'соло-строка — общий тип строки раунда (live-round-row)');
ok(!soloRow.classList.contains('is-open'), 'соло-раунд по умолчанию СВЁРНУТ (нет is-open)');
ok(!groupRow.classList.contains('is-open'), 'групповой раунд по умолчанию свёрнут (паритет)');

var soloToggle = soloRow.querySelector('.lwl-toggle');
ok(!!soloToggle, 'соло-строка: есть зона тапа .lwl-toggle');
ok(soloToggle.getAttribute('aria-expanded') === 'false', 'соло-строка: aria-expanded="false"');
ok(/onclick="toggleLiveRound\('SOLO1'\)"/.test(soloToggle.outerHTML), 'соло-строка: тап вызывает toggleLiveRound');
ok(/onkeydown="liveRoundKey\(event,'SOLO1'\)"/.test(soloToggle.outerHTML), 'соло-строка: доступна с клавиатуры (liveRoundKey)');

var chev = soloToggle.querySelector('.lwl-chev');
ok(!!chev && chev.className.indexOf('fa-chevron-down') !== -1, 'соло-строка: шеврон вниз (свёрнута)');

// В свёрнутой строке видно имя, лунку, счёт и время старта
ok(soloRow.textContent.indexOf('Иванов Иван') !== -1, 'соло-строка: видно имя игрока');
ok(!!soloRow.querySelector('.lwl-hole') && /№|Лунка|Hole/.test(soloRow.querySelector('.lwl-hole').textContent),
    'соло-строка: видна текущая лунка');
ok(!!soloRow.querySelector('.lwl-score'), 'соло-строка: виден счёт');
ok(!!soloRow.querySelector('.lwl-start'), 'соло-строка: видно время старта');

// Детали есть, но спрятаны до раскрытия (правило .lwl-row.is-open .lwl-details)
var soloDetails = soloRow.querySelector('.lwl-details');
ok(!!soloDetails, 'соло-строка: блок деталей существует');
ok(win.getComputedStyle(soloDetails).display === 'none',
    'соло-строка: детали скрыты, пока строка свёрнута (display: ' + win.getComputedStyle(soloDetails).display + ')');
ok(!!soloDetails.querySelector('.live-group-unified-card'), 'соло-строка: внутри деталей — счётная карточка');
ok(soloDetails.textContent.indexOf('Gross:') !== -1, 'соло-строка: внутри деталей — Gross');

// ── Тап раскрывает соло-раунд ──
soloToggle.click();
ok(soloRow.classList.contains('is-open'), 'тап: соло-раунд раскрылся (is-open)');
ok(soloToggle.getAttribute('aria-expanded') === 'true', 'тап: aria-expanded="true"');
ok(chev.className.indexOf('fa-chevron-up') !== -1, 'тап: шеврон вверх');
ok(win.getComputedStyle(soloDetails).display !== 'none', 'тап: детали стали видны');
ok(win.localStorage.getItem('pestovo_live_round_open_' + SOLO_ID) === '1',
    'тап: состояние сохранено в localStorage (pestovo_live_round_open_' + SOLO_ID + ')');

// Повторный тап — сворачиваем обратно
soloToggle.click();
ok(!soloRow.classList.contains('is-open'), 'повторный тап: соло-раунд свернулся');

// ── Перерисовка списка не сбрасывает раскрытое состояние ──
soloToggle.click();
rerender();
var soloRow2 = doc.getElementById('live-rounds').querySelector('.lwl-row[data-round-id="' + SOLO_ID + '"]');
ok(soloRow2.classList.contains('is-open'), 'перерисовка: раскрытый соло-раунд остался раскрытым');

// Свёрнутый групповой раунд после перерисовки тоже не раскрылся сам
var groupRow2 = doc.getElementById('live-rounds').querySelector('.lwl-row[data-round-id="' + GROUP_ID + '"]');
ok(!groupRow2.classList.contains('is-open'), 'перерисовка: групповой раунд остался свёрнутым');

// ── Блок «Активный турнир»: раунды развёрнуты (forceOpen=true) ──
var forced = win.buildLiveRoundRowHTML(SOLO_ID, rounds[SOLO_ID], rounds[SOLO_ID].players, false, true);
ok(/live-round-row is-open/.test(forced), 'блок «Активный турнир»: соло-раунд развёрнут (forceOpen)');
win.setLiveRoundOpen(SOLO_ID, false);   // сбрасываем состояние перед сравнением
var plain = win.buildLiveRoundRowHTML(SOLO_ID, rounds[SOLO_ID], rounds[SOLO_ID].players, false);
ok(/live-round-row(?! is-open)/.test(plain) && plain.indexOf(' is-open') === -1,
    'блок «Сейчас на поле»: соло-раунд без forceOpen — свёрнут');

console.log('');
console.log(failures ? 'ПРОВАЛЕНО: ' + failures + ' из ' + checks : 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (' + checks + ')');
process.exit(failures ? 1 : 0);
