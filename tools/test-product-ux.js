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
//   9. Экран раунда не уходит в мутационный цикл (регрессия v1.129.0).
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
// Словари i18n: классический (js/) и канонический ESM (src/) — правки
// должны попадать в оба, иначе английская версия разъезжается.
var i18nText = read('js/i18n.js');
var i18nSrc = read('src/i18n.js');
var THEME = read('css/theme-v2.css');
var AUTH = read('auth.html');
var SCORER = read('scorer.html');
var OFFLINE = read('offline.html');

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
// Пометку демо-версии с главной убрали (1.130.3): на первом экране она
// стояла между «18 лунок · Пар 72» и кнопками и читалась как часть оффера.
// Демо-данные по-прежнему видны на самих карточках (статус «Тестовый раунд»),
// поэтому напоминание здесь не нужно.
ok(HOME.indexOf('pv_demo_badge') === -1 && HOME.indexOf('pv-demo') === -1,
    'index.html: приветственной пометки «Тестовая версия» нет');
ok(CSS.indexOf('pv-demo') === -1, 'product-ux.css: стилей .pv-demo не осталось');
ok(i18nText.indexOf('pv_demo_badge') === -1 && i18nSrc.indexOf('pv_demo_badge') === -1,
    'i18n: ключ pv_demo_badge удалён из ru/en');

// ── 5. Карточка live-раунда ─────────────────────────────────────────────
ok(APP.indexOf('function pvLiveStatusHtml') !== -1, 'app.js: статус-бейдж карточки');
ok(APP.indexOf('function pvRoundProgressHtml') !== -1, 'app.js: прогресс раунда');
ok(APP.indexOf('function pvMiniTableHtml') !== -1, 'app.js: мини-таблица игроков');
ok(APP.indexOf('function setHomeLiveFilter') !== -1, 'app.js: переключение фильтра');
ok(/var homeLiveFilter = 'live'/.test(APP), 'app.js: по умолчанию фильтр «Live»');
ok(APP.indexOf('pv-live-score') !== -1, 'app.js: счёт к пару получил свой класс');
// «Клуб в цифрах» (1.130.5): полоса-сводка и раскрытие «Подробные цифры»
// убраны — 16 плиток видны сразу.
ok(APP.indexOf('pv-stats-strip') === -1 && APP.indexOf('pv-stats-item') === -1,
    'app.js: полосы-сводки над статистикой нет');
ok(APP.indexOf('pv-stats-more') === -1 && APP.indexOf('pv-stats-grid') === -1,
    'app.js: раскрытия «Подробные цифры» нет');
ok((APP.match(/tile\('fa-/g) || []).length === 16, 'app.js: в статистике клуба ровно 16 плиток',
    String((APP.match(/tile\('fa-/g) || []).length));
ok(APP.indexOf("t('st_best_gross')") !== -1 && APP.indexOf("t('st_rounds_30d')") !== -1,
    'app.js: подписи плиток берутся из словаря');
ok(CSS.indexOf('pv-stats-strip') === -1 && CSS.indexOf('pv-stats-more') === -1,
    'product-ux.css: стилей сводки и раскрытия не осталось');
ok(/#club-stats \{[^}]*repeat\(4, minmax\(0, 1fr\)\)/.test(CSS),
    'product-ux.css: 16 плиток сеткой 4 колонки');
ok(CSS.indexOf('pv_stats_more') === -1, 'product-ux.css: нет ссылок на удалённый ключ');
var ST_KEYS = ['st_total_rounds', 'st_active_rounds', 'st_completed_rounds', 'st_players',
    'st_best_gross', 'st_avg_gross', 'st_best_topar', 'st_avg_hole', 'st_birdies', 'st_eagles',
    'st_pars', 'st_bogeys', 'st_doubles', 'st_holes_played', 'st_players_per_round', 'st_rounds_30d'];
var stMissing = ST_KEYS.filter(function (k) {
    return i18nText.indexOf(k + ':') === -1 || i18nSrc.indexOf(k + ':') === -1;
});
ok(stMissing.length === 0, 'i18n: все 16 ключей плиток есть в ru и src/', stMissing.join(', '));
ok(i18nText.indexOf('pv_stats_more') === -1 && i18nSrc.indexOf('pv_stats_more') === -1,
    'i18n: ключ pv_stats_more удалён из обоих словарей');
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

// ── 7b. Один старт раунда на экране ─────────────────────────────────────
// Док — запасной CTA: он появляется только когда кнопка в форме ушла за
// пределы экрана. Иначе на странице оказывались две «Начать раунд» сразу.
ok(JS.indexOf('function watchInlineCta') !== -1 && JS.indexOf('function inlineCtaInView') !== -1,
    'product-ux.js: видимость кнопки в форме отслеживается');
ok(JS.indexOf('inlineCtaVisible = inlineCtaInView();') !== -1,
    'product-ux.js: состояние дока считается по прямоугольнику кнопки');
ok(JS.indexOf("threshold: 0") !== -1, 'product-ux.js: наблюдатель срабатывает на первый же пиксель');
ok(/addEventListener\('scroll'/.test(JS), 'product-ux.js: прокрутка пересчитывает состояние дока');
ok(/var visible = setupIsVisible\(\) && !inlineCtaVisible/.test(JS),
    'product-ux.js: док и кнопка в форме не показываются вместе');
ok(JS.indexOf('pv-setup-active') === -1, 'product-ux.js: класс pv-setup-active больше не ставится');
ok(CSS.indexOf('pv-setup-active') === -1,
    'product-ux.css: нет правила, включавшего док поверх кнопки формы');

// ── 7b2. Выравнивание полей в карточке игрока ───────────────────────────
// Подпись «Отчество (необязательно)» занимает две строки, поле отчества
// уезжало вниз относительно соседних (аудит 2026-11). Тянем контролы к низу
// колонки — поля стоят на одной линии при любой длине подписи.
ok(SETUP.indexOf('#player-slots .form-group > .form-input { margin-top: auto; }') !== -1,
    'setup-round.html: поля игрока выровнены по низу колонки');
ok(/#player-slots \.form-group \{ display: flex; flex-direction: column; \}/.test(SETUP),
    'setup-round.html: колонка поля игрока — flex-колонка');
ok(SETUP.indexOf('white-space: normal !important') !== -1,
    'setup-round.html: подписи полей игрока переносятся, а не обрезаются многоточием');
ok(RS.indexOf('function setupPlayerRowHtml') === -1 && SETUP.indexOf('body.st-roundsetup-v2') === -1,
    'round-setup: retired row renderer and alternate layout CSS removed');
ok(read('tools/check-round-setup-mobile.js').indexOf('misalignedFields') !== -1,
    'check-round-setup-mobile.js: браузерный гейт выравнивания полей');

// ── 7c. Дубли действий и подписей на остальных страницах ────────────────
// Герой главной: один CTA. «Все раунды» уже есть в меню, в нижней навигации
// и в шапке первого блока — вторая кнопка в герое была тем же действием.
var heroBtns = (HOME.match(/<div class="hero-btns">([\s\S]*?)<\/div>/) || [])[1] || '';
ok((heroBtns.match(/<a /g) || []).length === 2, 'index.html: два действия героя как в PR164');
ok(HOME.indexOf('btn_view_scores') === -1, 'index.html: второй кнопки «Все раунды» в герое нет');
ok(i18nText.indexOf('btn_view_scores') === -1 && i18nSrc.indexOf('btn_view_scores') === -1,
    'i18n: ключ btn_view_scores удалён из ru/en');
// Ссылки «ко всем раундам» внутри секций не совпадают по подписи с меню.
ok(HOME.indexOf('data-i18n="all_view"') !== -1 && HOME.indexOf('data-i18n="all_tournaments"') !== -1,
    'index.html: ссылки секций подписаны иначе, чем пункты меню');
// Вход: вкладка «Вход» и кнопка отправки «Войти» — разные подписи.
ok(AUTH.indexOf('data-i18n="auth_tab_login"') !== -1 && AUTH.indexOf('data-i18n="login_btn"') !== -1,
    'auth.html: вкладка и кнопка входа подписаны по-разному');
// Возврат на главную на экране ошибки не называется «Главная», как пункт меню.
ok(SCORER.indexOf('data-i18n="go_home"') !== -1, 'scorer.html: кнопка возврата подписана «На главную»');
ok(OFFLINE.indexOf('data-i18n="go_home"') !== -1, 'offline.html: кнопка возврата подписана «На главную»');
[['all_view', 'Смотреть все'], ['all_tournaments', 'Все турниры'], ['go_home', 'На главную'], ['auth_tab_login', 'Вход']]
    .forEach(function (pair) {
        ok(i18nText.indexOf(pair[0] + ": '" + pair[1] + "'") !== -1 &&
            i18nSrc.indexOf(pair[0] + ": '" + pair[1] + "'") !== -1,
            'i18n: ключ ' + pair[0] + ' есть в ru и src/');
    });

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

// Приветственный оверлей убран (1.130.2): он закрывал главную ровно тем
// экраном, который показывает её карточки. Возвращать его не надо —
// ни разметкой, ни стилями, ни ключами i18n.
ok(JS.indexOf('pv-onb') === -1 && JS.indexOf('buildOnboarding') === -1,
    'js/product-ux.js: нет приветственного оверлея');
ok(CSS.indexOf('pv-onb') === -1, 'product-ux.css: нет стилей оверлея');
// Ключи i18n оверлея удалены из обоих словарей (классического и src/).
ok(i18nText.indexOf('pv_onb_') === -1 && i18nSrc.indexOf('pv_onb_') === -1,
    'i18n: ключи pv_onb_* удалены из ru/en');
ok(APP.indexOf('pv-onboarding') === -1, 'js/app.js: не создаёт #pv-onboarding');
ok(read('index.html').indexOf('pv-onboarding') === -1, 'index.html: разметки оверлея нет');

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
    // i18n-слой в этом тесте не грузится, а app.js читает currentLang
    // (renderCourseHolesStrip и др.) — без него тест падал на ReferenceError.
    win.currentLang = 'ru';
    win.t = function (key) { return key; };
    win.escapeHtml = function (value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
    win.fmtExactHcp = function (value) { return String(value); };
    win.currentUser = { uid: 'u2' };
    win.toast = function () {};
    win.vib = function () {};
    win.eval(read('js/ui-events.js'));
    // Поле клуба: holePar/holeHcp/getFieldHcp нужны calcRoundStats и карточке.
    win.eval(read('js/course-config.js'));
    win.eval(read('js/format.js'));
    win.eval(read('js/utils.js'));
    // Карточки поля вынесены в отдельный файл (js/utils-scorecards.js).
    win.eval(read('js/utils-scorecards.js'));
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

// ── 10. Экран раунда не уходит в мутационный цикл ───────────────────────
// Регрессия v1.129.0: MutationObserver на #setup перерисовывал свои же
// шаги, ловил собственную запись и крутился бесконечно (16 541 мутация
// за 2 секунды простоя — телефон грелся, батарея уходила на пустом месте).
// Проверяем и защиту в коде, и фактическое число мутаций.
ok(JS.indexOf('var pending = false') !== -1,
    'product-ux.js: refresh() дедуплицирован (pending), а не копит таймеры');
ok(JS.indexOf('if (signature === stepsState) return;') !== -1,
    'product-ux.js: шаги пишутся только при смене состояния');
ok(/target\.closest\(own\)/.test(JS),
    'product-ux.js: наблюдатель игнорирует собственные поддеревья');

function finish() {
    console.log('');
    if (failures) {
        console.error('ПРОВАЛЕНО: ' + failures + ' из ' + checks);
        process.exit(1);
    }
    console.log('Продуктовый UX-слой в порядке ✔ (' + checks + ')');
}

if (!JSDOM) {
    console.log(' ·    | jsdom не установлен — проверка мутационного цикла пропущена');
    finish();
} else {
    var setupHtml = '<!doctype html><html lang="ru"><head><title>setup</title></head><body class="pv-ux pv-has-bottomnav">' +
        '<main><section id="setup">' +
        '<div class="card setup-card" id="unified-setup-card">' +
        '<select id="grp-format"><option value="stroke" selected>Stroke Play</option></select>' +
        '<input id="grp-time" value="10:00">' +
        '<div id="player-slots"><div data-pidx="0"><input id="pl-name-0" value="Иванов Иван"></div></div>' +
        '<button data-act="startUnifiedRound">Старт</button>' +
        '</div></section></main></body></html>';
    var d2 = new JSDOM(setupHtml, {
        runScripts: 'dangerously',
        url: 'https://example.test/setup-round.html',
        pretendToBeVisual: true
    });
    var w2 = d2.window;
    var doc2 = w2.document;
    w2.eval(JS);

    // Ждём реального запуска слоя, а не фиксированный таймаут: jsdom
    // разбирает документ асинхронно, а refresh() намеренно отложен на
    // setTimeout(0) — на загруженной машине «40 мс» превращаются в лотерею.
    var whenBooted = function (fn) {
        var tries = 0;
        var poll = function () {
            if (doc2.getElementById('pv-steps') || tries++ > 150) { fn(); return; }
            w2.setTimeout(poll, 20);
        };
        poll();
    };

    whenBooted(function () {
        var setup = doc2.getElementById('setup');
        ok(!!setup, 'jsdom: экран раунда собран');
        // Шаги рисуются один раз: второй индикатор на экране не появляется.
        ok(doc2.querySelectorAll('#pv-steps').length === 1, 'jsdom: индикатор шагов один');
        var mutations = 0;
        var observer = new w2.MutationObserver(function (list) { mutations += list.length; });
        observer.observe(setup, { childList: true, subtree: true, attributes: true, characterData: true });

        w2.setTimeout(function () {
            observer.disconnect();
            // Ноль — идеал. Допускаем единичные записи от ленивой отрисовки,
            // но не сотни: именно столько давал цикл.
            ok(mutations <= 2, 'jsdom: простой экрана раунда не вызывает мутаций',
                mutations + ' мутаций за 150 мс');

            // Ввод имени двигает шаги — и тоже без лавины мутаций.
            var input = doc2.getElementById('pl-name-0');
            input.value = 'Петров Пётр';
            input.dispatchEvent(new w2.Event('input', { bubbles: true }));
            var afterInput = 0;
            var obs2 = new w2.MutationObserver(function (list) { afterInput += list.length; });
            obs2.observe(setup, { childList: true, subtree: true, attributes: true, characterData: true });
            w2.setTimeout(function () {
                obs2.disconnect();
                ok(afterInput <= 4, 'jsdom: правка одного поля даёт единичные мутации',
                    afterInput + ' мутаций');
                var segs = doc2.querySelectorAll('#pv-steps .pv-steps-seg.is-done');
                ok(segs.length >= 1, 'jsdom: шаги отражают заполненность формы',
                    segs.length + ' из 3');
                finish();
            }, 120);
        }, 150);
    });
}
