// Гейт продуктового UX-слоя v1.129.0 (запуск: node tools/test-product-ux.js).
//
// Зачем отдельный тест. Новый слой (css/product-ux.css + js/product-ux.js)
// добавляет то, чего раньше не было ни в одном файле: чипы фильтров,
// карточку live-раунда со статусом и прогрессом, шаги создания раунда,
// нижнюю навигацию, честное состояние сети. Именно такие «украшения»
// тихо ломаются при следующем рефакторинге: класс переименовали — фильтр
// перестал переключаться, а страница выглядит нормально.
//
// Что проверяем:
//   1. Слой подключён на трёх продуктовых страницах и строго между
//      theme-v2.css и design-presets.css (пресеты обязаны побеждать).
//   2. В разметке и в product-ux.js нет inline-обработчиков (onclick=).
//   3. Семантические токены статусов и счёта объявлены в тёмной и светлой темах.
//   4. Главная: «Сейчас на поле» выше «Последних результатов», есть чипы
//      Live / Все / Мои раунды, у чипов aria-pressed.
//   5. Главная: карточка live-раунда рисует статус, лунку, счёт к пару и
//      прогресс; фильтр реально сужает список.
//   6. Лидерборд: чипы и сортировка по столбцу, aria-sort у активного.
//   7. Экран раунда: inline-валидация и sticky-CTA существуют и связаны
//      с реальным действием старта (data-act), а не с пустышкой.
//   8. Доступность: уважается prefers-reduced-motion, есть видимый focus.
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var failures = 0;
var checks = 0;

function ok(cond, label, extra) {
    checks++;
    if (!cond) {
        failures++;
        console.error(' ✗', label + (extra ? ' — ' + extra : ''));
    } else {
        console.log(' ok   |', label);
    }
}

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

var CSS = read('css/product-ux.css');
var JS = read('js/product-ux.js');
var HOME = read('index.html');
var BOARD = read('leaderboard.html');
var SETUP = read('setup-round.html');
var APP = read('js/app.js');
var LB = read('js/leaderboard.js');
var RS = read('js/round-setup.js');
var THEME = read('css/theme-v2.css');

// ── 1. Подключение и порядок ────────────────────────────────────────────
[['index.html', HOME], ['leaderboard.html', BOARD], ['setup-round.html', SETUP]].forEach(function (pair) {
    var page = pair[0], html = pair[1];
    ok(html.indexOf('css/product-ux.css') !== -1, page + ': подключён css/product-ux.css');
    ok(html.indexOf('js/product-ux.js') !== -1, page + ': подключён js/product-ux.js');
    var theme = html.indexOf('css/theme-v2.css');
    var layer = html.indexOf('css/product-ux.css');
    var presets = html.indexOf('css/design-presets.css');
    ok(theme !== -1 && layer > theme, page + ': слой грузится после theme-v2.css');
    ok(presets === -1 || layer < presets, page + ': пресеты оформления остаются последними');
});

// ── 2. Ноль inline-обработчиков ─────────────────────────────────────────
ok(!/\son[a-z]+\s*=/.test(JS), 'js/product-ux.js: нет inline-обработчиков');
[['index.html', HOME], ['leaderboard.html', BOARD], ['setup-round.html', SETUP]].forEach(function (pair) {
    ok(!/<[^>]+\son(click|change|input|keydown)\s*=/.test(pair[1]), pair[0] + ': нет onclick=/onchange=');
});

// ── 3. Семантические токены ─────────────────────────────────────────────
['--status-live', '--status-done', '--status-pending', '--score-under', '--score-over', '--score-par', '--tap', '--safe-b'].forEach(function (token) {
    ok(THEME.indexOf(token + ':') !== -1, 'theme-v2.css: объявлен токен ' + token);
});
// Светлые значения тех же токенов — в body.sun-mode.
var sunBlock = THEME.slice(THEME.indexOf('body.sun-mode {'));
ok(sunBlock.indexOf('--status-live:') !== -1, 'theme-v2.css: светлая тема переопределяет --status-live');
ok(sunBlock.indexOf('--score-under:') !== -1, 'theme-v2.css: светлая тема переопределяет --score-under');

// ── 4. Главная: порядок блоков и чипы ───────────────────────────────────
var posLive = HOME.indexOf('id="live-rounds"');
var posRecent = HOME.indexOf('id="recent-results"');
ok(posLive !== -1 && posRecent !== -1 && posLive < posRecent,
    'index.html: «Сейчас на поле» идёт выше «Последних результатов»');
ok(HOME.indexOf('id="pv-chip-live"') !== -1 && HOME.indexOf('id="pv-chip-all"') !== -1 &&
    HOME.indexOf('id="pv-chip-mine"') !== -1, 'index.html: три чипа фильтра на месте');
ok((HOME.match(/aria-pressed="/g) || []).length >= 3, 'index.html: у чипов есть aria-pressed');
ok(HOME.indexOf('pv_demo_badge') !== -1, 'index.html: пометка тестовой версии видна');

// ── 5. Карточка live-раунда ─────────────────────────────────────────────
ok(APP.indexOf('function pvLiveStatusHtml') !== -1, 'app.js: статус-бейдж карточки');
ok(APP.indexOf('function pvRoundProgressHtml') !== -1, 'app.js: прогресс раунда');
ok(APP.indexOf('function pvMiniTableHtml') !== -1, 'app.js: мини-таблица игроков');
ok(APP.indexOf('function setHomeLiveFilter') !== -1, 'app.js: переключение фильтра');
ok(/var homeLiveFilter = 'live'/.test(APP), 'app.js: по умолчанию фильтр «Live»');
ok(APP.indexOf('pv-live-score') !== -1, 'app.js: счёт к пару получил свой класс');
ok(APP.indexOf('pv-stats-strip') !== -1, 'app.js: компактная полоса статистики клуба');
ok(APP.indexOf('pv-stats-more') !== -1, 'app.js: подробные плитки спрятаны под раскрытие');
// Статус не только цветом: у бейджа всегда есть слово и иконка/точка.
ok(/pv-status-dot/.test(APP) && /pv_st_done|pv_live_now/.test(APP),
    'app.js: статус передаётся словом и иконкой, не только цветом');

// ── 6. Лидерборд ────────────────────────────────────────────────────────
ok(BOARD.indexOf('id="lb-chip-live"') !== -1 && BOARD.indexOf('id="lb-sort"') !== -1,
    'leaderboard.html: чипы и сортировка в разметке');
ok(LB.indexOf('function lbSetChip') !== -1 && LB.indexOf('function lbSortBy') !== -1,
    'leaderboard.js: обработчики чипов и сортировки');
ok(LB.indexOf('aria-sort') !== -1, 'leaderboard.js: заголовок сообщает aria-sort');
ok(LB.indexOf('function lbRoundIsMine') !== -1, 'leaderboard.js: фильтр «Мой раунд»');
// Места считаются по счёту к пару, сортировка меняет только порядок строк.
ok(LB.indexOf('var placeList = list.slice().sort') !== -1,
    'leaderboard.js: места считаются отдельно от порядка строк');

// ── 7. Экран создания раунда ────────────────────────────────────────────
ok(RS.indexOf('function setupValidateInline') !== -1, 'round-setup.js: inline-валидация');
ok(RS.indexOf('pv-field-error') !== -1, 'round-setup.js: сообщение об ошибке рядом с полем');
ok(JS.indexOf('pv-cta-dock') !== -1 && JS.indexOf("data-act=\"startUnifiedRound\"") !== -1,
    'product-ux.js: sticky-CTA вызывает настоящее действие старта');
ok(JS.indexOf('pv-steps') !== -1, 'product-ux.js: индикатор шагов раунда');
ok(JS.indexOf('pv-bottomnav') !== -1, 'product-ux.js: нижняя навигация');
ok(JS.indexOf('pv-net-banner') !== -1 && /нет сети|pv_offline_text/.test(JS),
    'product-ux.js: честное состояние сети вместо «всё сохранено»');

// ── 8. Доступность и движение ───────────────────────────────────────────
ok(CSS.indexOf('prefers-reduced-motion') !== -1, 'product-ux.css: prefers-reduced-motion учтён');
ok(CSS.indexOf(':focus-visible') !== -1, 'product-ux.css: видимый фокус');
ok(CSS.indexOf('--safe-b') !== -1 && CSS.indexOf('env(safe-area-inset') !== -1 || CSS.indexOf('var(--safe-b)') !== -1,
    'product-ux.css: safe-area учитывается');
// Кегль меньше 11 px в продуктовом слое не появляется.
var tiny = (CSS.match(/font-size:\s*\d+(\.\d+)?px/g) || [])
    .map(function (s) { return parseFloat(s.replace(/[^0-9.]/g, '')); })
    .filter(function (v) { return v < 11; });
ok(tiny.length === 0, 'product-ux.css: нет кегля меньше 11 px', tiny.join(', '));

// ── 9. Поведение карточки в jsdom (если библиотека есть) ────────────────
var JSDOM;
try { JSDOM = require('jsdom').JSDOM; } catch (e) { JSDOM = null; }
if (!JSDOM) {
    console.log(' ·    | jsdom не установлен — поведенческая часть пропущена');
} else {
    var html = HOME.replace(/<script src="https?:[^"]*"><\/script>/g, '');
    var dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.test/index.html', pretendToBeVisual: true });
    var win = dom.window;
    var doc = win.document;
    var NOW = Date.now();
    var rounds = {
        solo: { mode: 'solo', status: 'active', createdAt: NOW, startTime: NOW, startHole: 1, format: 'Stroke Play', tee: 'wh',
            players: { u1: { name: 'Иванов Иван', fieldHcp: 12, exactHcp: 12.4, tee: 'wh', scores: { 1: 4, 2: 5, 3: 4 } } } },
        group: { mode: 'group', status: 'active', createdAt: NOW - 1000, startTime: NOW - 1000, startHole: 1, format: 'Stroke Play', tee: 'wh',
            players: {
                u2: { name: 'Морозов Илья', fieldHcp: 8, exactHcp: 8.1, tee: 'wh', scores: { 1: 5, 2: 4 } },
                u3: { name: 'Сидоров Олег', fieldHcp: 15, exactHcp: 15.2, tee: 'wh', scores: { 1: 4, 2: 6 } }
            } }
    };
    var makeRef = function (p) {
        var q = null;
        var ref = {
            orderByChild: function (c) { q = { c: c, v: undefined }; return ref; },
            equalTo: function (v) { if (q) q.v = v; return ref; },
            on: function (ev, cb) {
                if (ev !== 'value') return;
                var data = {};
                if (q) {
                    Object.keys(rounds).forEach(function (k) { if (rounds[k][q.c] === q.v) data[k] = rounds[k]; });
                } else if (p === 'rounds') { data = rounds; }
                cb({ val: function () { return data; } });
            },
            off: function () {},
            once: function () { return Promise.resolve({ val: function () { return {}; } }); },
            update: function () { return Promise.resolve(); },
            set: function () { return Promise.resolve(); },
            remove: function () { return Promise.resolve(); },
            child: function () { return makeRef(p); },
            push: function () { return makeRef(p); },
            transaction: function (f) { return Promise.resolve({ value: f(null) }); }
        };
        return ref;
    };
    win.db = { ref: makeRef };
    win.currentUser = { uid: 'u2' };
    win.toast = function () {};
    win.vib = function () {};
    win.eval(read('js/ui-events.js'));
    win.eval(read('js/utils.js'));
    win.eval(read('js/app.js'));
    win.loadLiveRounds();

    var live = doc.getElementById('live-rounds');
    var rows = live.querySelectorAll('.lwl-row');
    ok(rows.length === 2, 'jsdom: два активных раунда отрисованы', String(rows.length));

    var soloRow = live.querySelector('.lwl-row[data-round-id="solo"]');
    ok(!!soloRow && !!soloRow.querySelector('.pv-status'), 'jsdom: у карточки есть статус-бейдж');
    ok(!!soloRow && !!soloRow.querySelector('.pv-progress'), 'jsdom: у карточки есть прогресс');
    ok(!!soloRow && !!soloRow.querySelector('.pv-live-score'), 'jsdom: счёт к пару вынесен отдельно');
    var groupRow = live.querySelector('.lwl-row[data-round-id="group"]');
    ok(!!groupRow && groupRow.querySelectorAll('.pv-mini-row').length === 2,
        'jsdom: в групповой карточке мини-таблица на двух игроков',
        groupRow ? groupRow.querySelectorAll('.pv-mini-row').length + ' строк' : 'нет строки');
    ok(!!groupRow && /data-mine="1"/.test(groupRow.outerHTML), 'jsdom: мой раунд помечен для фильтра');

    // Фильтр «Мои раунды» оставляет только раунд текущего пользователя.
    win.setHomeLiveFilter('mine');
    var mineRows = doc.getElementById('live-rounds').querySelectorAll('.lwl-row');
    ok(mineRows.length === 1 && mineRows[0].getAttribute('data-round-id') === 'group',
        'jsdom: фильтр «Мои раунды» оставляет только мой раунд');
    var chipMine = doc.getElementById('pv-chip-mine');
    ok(!!chipMine && chipMine.getAttribute('aria-pressed') === 'true',
        'jsdom: активный чип помечен aria-pressed');
    // Возврат ко всем раундам.
    win.setHomeLiveFilter('all');
    ok(doc.getElementById('live-rounds').querySelectorAll('.lwl-row').length === 2,
        'jsdom: «Все» возвращает оба раунда');
    var countAll = doc.getElementById('pv-chip-all-count');
    ok(!!countAll && countAll.textContent === '2', 'jsdom: счётчик на чипе показывает число раундов');
}

console.log('');
if (failures) {
    console.error('ПРОВАЛЕНО: ' + failures + ' из ' + checks);
    process.exit(1);
}
console.log('Продуктовый UX-слой в порядке ✔ (' + checks + ')');
