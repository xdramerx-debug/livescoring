#!/usr/bin/env node
/**
 * UI-тест мастера создания турниров в единой вкладке «Турниры 🏆»:
 *   мастер 10 шагов, «Настройки поля», «Шаблоны турниров».
 *
 *   npm i jsdom                              (один раз, только для разработки)
 *   NODE_PATH=$(pwd)/../nmtest/node_modules node tools/test-tn-wizard-ui.js
 *
 * Поднимает настоящий admin.html в jsdom, выполняет js/tn-engine.js и
 * js/tn-wizard.js и проверяет: парковку встраиваемых корней (#tn-embed-parking),
 * рендер шагов мастера, ввод → черновик → автосохранение (localStorage +
 * имитированный Firebase), валидацию, сводку, payload публикации, таблицу
 * лунок поля (SI, сумма паров), список шаблонов, режим редактирования
 * существующего турнира и hash-fallback без единой вкладки.
 *
 * Если jsdom не установлен — тест пропускается (не падает).
 */
'use strict';

var fs = require('fs');
var path = require('path');

var JSDOM;
try {
    JSDOM = require('jsdom').JSDOM;
} catch (e) {
    console.log('SKIP: jsdom не установлен (npm i jsdom) — UI-тест пропущен');
    process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

var dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/admin.html' });
var win = dom.window;

// ---- заглушки окружения (как в tools/test-admin-ui.js) ----
win.currentLang = 'ru';
win.currentUser = { uid: 'test-admin' };
win.currentUserData = { role: 'admin', name: 'Тест Админ', email: 'admin@test.ru' };
win.toast = function () {};
win.hasAdminPanelAccess = function () { return true; };
win.switchTab = function () {};
win.setInterval = function () { return 0; };
win.clearInterval = function () {};
// имитированный Firebase RTDB: вся запись сохраняется в dbData
var dbData = {};
function pathSet(p, v) {
    var o = dbData, ks = p.split('/');
    for (var i = 0; i < ks.length - 1; i++) { o[ks[i]] = o[ks[i]] || {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = v;
}
function pathGet(p) {
    var o = dbData, ks = p.split('/');
    for (var i = 0; i < ks.length; i++) { if (o == null) return null; o = o[ks[i]]; }
    return o == null ? null : o;
}
function makeRef(pathStr) {
    return {
        set: function (v) { pathSet(pathStr, v); return Promise.resolve(); },
        update: function (v) {
            var cur = pathGet(pathStr) || {};
            Object.keys(v).forEach(function (k) { cur[k] = v[k]; });
            pathSet(pathStr, cur);
            return Promise.resolve();
        },
        remove: function () { var ks = pathStr.split('/'); pathSet(ks.slice(0, -1).join('/') || '', {}); return Promise.resolve(); },
        push: function (v) {
            var key = 'k' + Math.floor(Math.random() * 1e9).toString(36);
            pathSet(pathStr + '/' + key, v || true);
            return Promise.resolve({ key: key });
        },
        once: function () { return Promise.resolve({ val: function () { return pathGet(pathStr); } }); },
        on: function () {},
        off: function () {}
    };
}
win.db = { ref: function (p) { return makeRef(String(p).replace(/^\/+|\/+$/g, '')); } };

win.eval(fs.readFileSync(path.join(ROOT, 'js/tn-engine.js'), 'utf8'));
win.eval(fs.readFileSync(path.join(ROOT, 'js/tn-wizard.js'), 'utf8'));

var fails = 0, total = 0;
function check(title, cond, extra) {
    total++;
    if (!cond) fails++;
    console.log((cond ? ' ok  ' : 'FAIL ') + ' | ' + title + (extra ? ' → ' + extra : ''));
}
function type(el, value) {
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
}
function $id(id) { return win.document.getElementById(id); }
function $sel(s) { return win.document.querySelector(s); }
function $all(s) { return Array.prototype.slice.call(win.document.querySelectorAll(s)); }

console.log('=== admin.html: единая вкладка «Турниры» + парковка модулей ===');
check('корень единой вкладки на месте', !!$id('tn-studio-root'));
check('парковка встраиваемых корней на месте', !!$id('tn-embed-parking'));
check('панель wizard в парковке', !!$id('tn-wizard-root') && $id('tn-embed-parking').contains($id('tn-wizard-root')));
check('панель поля в парковке', !!$id('tn-course-root') && $id('tn-embed-parking').contains($id('tn-course-root')));
check('панель шаблонов в парковке', !!$id('tn-templates-root') && $id('tn-embed-parking').contains($id('tn-templates-root')));
check('панель управления в парковке', !!$id('tn-manage-root') && $id('tn-embed-parking').contains($id('tn-manage-root')));
check('стартовый лист в парковке', !!$id('tab-start-content') && $id('tn-embed-parking').contains($id('tab-start-content')));
check('быстрый редактор протокола в парковке', !!$id('pe-card') && !!$id('pe-tn-select') && !!$id('pe-editor'));
check('старые суб-вкладки удалены', !$id('tn-subtabs') && !$id('tn-pane-classic') && !$id('tn-pane-new-create'));
check('старая форма создания удалена (tn-name)', !$id('tn-name') && !$id('tn-list'));
check('в HTML подключён css/tn-wizard.css', html.indexOf('css/tn-wizard.css') !== -1);
check('в HTML подключены js/tn-engine.js и js/tn-wizard.js',
    html.indexOf('js/tn-engine.js') !== -1 && html.indexOf('js/tn-wizard.js') !== -1);

console.log('\n=== Инициализация без суб-вкладок + hash-fallback ===');
win.tnwInit(); // повторный вызов безопасен (guard)
check('инициализация не строит суб-вкладки', $all('#tn-subtabs .tnw-subtab').length === 0);
win.location.hash = '#new-create';
win.tnwApplyHash(); // единой вкладки в этом окружении нет — работает старый путь
check('fallback: hash #new-create открывает мастер', win.tnWiz.subTab === 'new-create', win.tnWiz.subTab);
check('лендинг: кнопка «Начать новый турнир»',
    $id('tn-wizard-root').innerHTML.indexOf('tnwStartNewDraft()') !== -1);
check('лендинг: пустой список черновиков', $id('tn-wizard-root').innerHTML.indexOf('tnw-empty') !== -1);

console.log('\n=== Лендинг мастера и создание черновика ===');
win.tnwStartNewDraft();
check('открыт шаг 1 после старта черновика', !!$sel('[data-tnw-path="info.nameRu"]'));
check('построены 10 чипов прогресса', $all('.tnw-step-chip').length === 10, $all('.tnw-step-chip').length);
check('есть навигация «Далее»', $id('tn-wizard-root').innerHTML.indexOf('tnwGoStep(1)') !== -1);
check('черновик автосохранён в Firebase tnDrafts', !!pathGet('tnDrafts/test-admin'), 'узел tnDrafts создан');
check('черновик автосохранён в localStorage',
    Object.keys(win.localStorage ? (function () { var o = {}; for (var i = 0; i < win.localStorage.length; i++) o[win.localStorage.key(i)] = 1; return o; })() : {}).filter(function (k) { return k.indexOf('pestovo_tn_wiz_draft_') === 0; }).length >= 1);

console.log('\n=== Ввод данных: делегирование input → draft ===');
type($sel('[data-tnw-path="info.nameRu"]'), 'Кубок Пестово');
check('название попало в draft', win.tnWiz.draft.info.nameRu === 'Кубок Пестово');
check('dirty-флаг после ввода', win.tnWiz.dirty === true);

console.log('\n=== Шаг 2: динамический список раундов ===');
win.tnwGoStep(1);
check('шаг 2: список раундов отрендерен (date-поле)', !!$sel('[data-tnw-path="format.rounds.0.date"]'));
win.tnwListAdd('format.rounds');
check('кнопка «Добавить» создала второй раунд', !!$sel('[data-tnw-path="format.rounds.1.date"]'));
type($sel('[data-tnw-path="format.rounds.0.date"]'), '2026-09-20');
type($sel('[data-tnw-path="format.rounds.1.date"]'), '2026-09-21');
check('даты попали в draft', win.tnWiz.draft.format.rounds[0].date === '2026-09-20' && win.tnWiz.draft.format.rounds[1].date === '2026-09-21');
win.tnwListDel('format.rounds', 1);
check('удаление строки списка вернуло один раунд', win.tnWiz.draft.format.rounds.length === 1);

console.log('\n=== Шаг 3: подсчёт, таблица очков, тай-брейки ===');
win.tnwGoStep(2);
check('multi-чекбоксы систем подсчёта отрендерены', $all('[data-tnw-multi="scoring.systems"]').length === win.TN_CONFIG.scoringSystems.length);
var stbBox = $sel('[data-tnw-multi="scoring.systems"][value="stableford"]');
stbBox.checked = true;
stbBox.dispatchEvent(new win.Event('change', { bubbles: true }));
check('Stableford добавлен в системы', win.tnWiz.draft.scoring.systems.indexOf('stableford') !== -1);
var pts = $sel('[data-tnw-path^="scoring.stablefordTable."][data-tnw-mapped-key="-1"]');
check('таблица Stableford редактируемая (ячейка бёрди)', !!pts);
type(pts, '5');
check('кастомная таблица: бёрди = 5 очков', win.tnWiz.draft.scoring.stablefordTable['-1'] === 5);
check('порядок тай-брейков с drag&drop-элементами', $all('.tnw-order-item[draggable="true"]').length === 2);
win.tnwTieMove('scoring.tieBreaks', 1, -1);
eqArr('перестановка приоритета тай-брейков', win.tnWiz.draft.scoring.tieBreaks, ['last-hole', 'countback']);
win.tnwTieAdd('scoring.tieBreaks', 'stroke-index');
check('добавление тай-брейка', win.tnWiz.draft.scoring.tieBreaks.length === 3);
function eqArr(t, a, b) { check(t, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a)); }

console.log('\n=== Валидация и сводка (шаг 10) ===');
win.tnwGoStep(9);
check('шаг 10: сводка содержит название', $id('tnw-step-body').innerHTML.indexOf('Кубок Пестово') !== -1);
check('шаг 10: сводка содержит систему подсчёта', $id('tnw-step-body').innerHTML.indexOf('Stableford') !== -1);
check('шаг 10: кнопки Черновик/Шаблон/Опубликовать',
    $id('tnw-step-body').innerHTML.indexOf('tnwSaveDraftNow()') !== -1 &&
    $id('tnw-step-body').innerHTML.indexOf('tnwSaveAsTemplate()') !== -1 &&
    $id('tnw-step-body').innerHTML.indexOf('tnwPublish()') !== -1);
var val = win.tnwValidate();
check('валидация пустого черновика прошла (название+дата+системы заданы)', val.length === 0, val.join('; '));
win.tnWiz.draft.info.nameRu = '';
check('валидация ловит отсутствие названия', win.tnwValidate().length === 1);
win.tnWiz.draft.info.nameRu = 'Кубок Пестово';

console.log('\n=== Payload публикации (совместимость со списком турниров) ===');
var payload = win.tnwBuildTournamentPayload(win.tnWiz.draft);
check('name для старого списка', payload.name === 'Кубок Пестово');
check('date = дата первого раунда', payload.date === '2026-09-20');
check('status = upcoming (виден в общем списке)', payload.status === 'upcoming');
check('форматы приведены к legacy-пресетам', payload.formats.indexOf('Stableford') !== -1 && payload.formats.indexOf('Stroke Play (Net)') !== -1, JSON.stringify(payload.formats));
check('тики собраны из teeMap', payload.tees.length >= 1);
check('fromWizard + полная конфигурация в payload.wizard', payload.fromWizard === true && !!payload.wizard.scoring);
check('courseRef указывает на единственное поле', payload.courseRef === 'settings/course');

console.log('\n=== Режим редактирования: черновики не плодятся ===');
win.tnWiz.editTournamentId = 'test-t1';
win.tnWiz.dirty = true;
win.tnwSaveServer(true).then(function (saved) {
    check('серверный сейв пропущен в режиме редактирования', saved === false);
    check('мусорный черновик edit_* не записан', !pathGet('tnDrafts/test-admin/edit_test-t1'));
    win.tnWiz.editTournamentId = null;

    console.log('\n=== Публикация в tournaments ===');
    return win.tnwPublishConfig(win.tnWiz.draft, win.tnWiz.draftKey);
}).then(function (tnId) {
    var stored = pathGet('tournaments/' + tnId);
    check('турнир записан в tournaments', !!stored && stored.name === 'Кубок Пестово');
    var audit = pathGet('tournaments/' + tnId + '/audit');
    check('аудит публикации записан', !!audit && Object.keys(audit).length === 1, 'аудит: ' + !!audit);

    console.log('\n=== Настройки поля (раздел «Поле клуба») ===');
    win.tnWiz.course = win.tnwCourseDemo();
    win.tnwRenderCourse();
    check('поле отрендерено в парковочном корне',
        $id('tn-course-root').innerHTML.indexOf('tnw-course-table') !== -1);
    var holeRows = $all('#tn-course-root .tnw-course-table tbody tr');
    // первая таблица — таблица лунок (18 строк + итог); отбрасываем строки таблицы рейтингов
    holeRows = holeRows.filter(function (tr) { return tr.querySelector('[data-f="si"]') || tr.classList.contains('tnw-totals'); });
    check('таблица лунок: 18 строк + итог', holeRows.length === 19, 'строк: ' + holeRows.length);
    check('сумма паров = 72', $id('tnw-par-total').textContent === '72', $id('tnw-par-total').textContent);
    check('ячеек SI = 18', $all('#tn-course-root [data-f="si"]').length === 18);
    // ломаем уникальность SI
    var siInputs = $all('#tn-course-root [data-f="si"]');
    siInputs[1].value = siInputs[0].value;
    siInputs[1].dispatchEvent(new win.Event('input', { bubbles: true }));
    check('дубль SI подсвечен и предупреждение показано',
        $id('tnw-course-validation').innerHTML.indexOf('уникальн') !== -1);
    check('сохранение заблокировано при дубле SI', win.tnWiz._courseSiInvalid === true);
    // чиним SI (у 2-й лунки в демо SI=3) и ломаем сумму паров
    siInputs[1].value = '3';
    siInputs[1].dispatchEvent(new win.Event('input', { bubbles: true }));
    check('после исправления SI валидность вернулась', win.tnWiz._courseSiInvalid === false);
    var parSel = $sel('#tn-course-root [data-tnw-hole="0"][data-f="par"]');
    parSel.value = '3';
    parSel.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('сумма паров 71 → валидно (70–72)', $id('tnw-course-validation').innerHTML.indexOf('Сумма паров') === -1);
    var parSel2 = $sel('#tn-course-root [data-tnw-hole="1"][data-f="par"]');
    parSel2.value = '3';
    parSel2.dispatchEvent(new win.Event('change', { bubbles: true }));
    check('сумма паров 69 → предупреждение (70–72)', $id('tnw-course-validation').innerHTML.indexOf('Сумма паров') !== -1);
    check('предупреждение по парам не блокирует сохранение', win.tnWiz._courseSiInvalid === false);
    win.tnCourseSave();
    check('поле сохранено в settings/course', !!pathGet('settings/course') && pathGet('settings/course').holes.length === 18);

    console.log('\n=== Шаблоны турниров (раздел «Шаблоны») ===');
    win.tnTplCreateFromConfig('Мой шаблон', win.tnWiz.draft).then(function () {
        var tpls = pathGet('tnTemplates');
        var tplKey = Object.keys(tpls)[0];
        check('шаблон записан в tnTemplates', !!tplKey);
        var tpl = tpls[tplKey];
        check('у шаблона есть имя и автор', tpl.name === 'Мой шаблон' && tpl.authorName === 'Тест Админ');
        check('из шаблона вырезаны даты раундов', !tpl.config.format.rounds[0].date);
        win.tnWiz.templates = tpls;
        win.tnwRenderTemplates();
        check('шаблон отрендерен в списке', $id('tn-templates-root').innerHTML.indexOf('Мой шаблон') !== -1);
        check('карточка шаблона: действия создать/переименовать/дублировать/удалить',
            $id('tn-templates-root').innerHTML.indexOf('tnTplUse') !== -1 &&
            $id('tn-templates-root').innerHTML.indexOf('tnTplRename') !== -1 &&
            $id('tn-templates-root').innerHTML.indexOf('tnTplDuplicate') !== -1 &&
            $id('tn-templates-root').innerHTML.indexOf('tnTplDelete') !== -1);
        win.tnTplUse(tplKey); // единой вкладки нет — старый путь: черновик из шаблона
        check('создание из шаблона: черновик предзаполнен, название пустое',
            !!win.tnWiz.draft && win.tnWiz.draft.info.nameRu === '');

        console.log('\n=== Смена языка (перерисовка динамических подписей) ===');
        win.tnWiz.subTab = 'templates';
        win.currentLang = 'en';
        win.tnwOnLangChange();
        check('шаблоны перерисованы на EN',
            $id('tn-templates-root').innerHTML.indexOf('Tournament templates') !== -1);
        win.currentLang = 'ru';
        win.tnwOnLangChange();
        check('шаблоны перерисованы обратно на RU',
            $id('tn-templates-root').innerHTML.indexOf('Шаблоны турниров') !== -1);

        console.log('\n' + total + ' проверок, ошибок: ' + fails);
        process.exit(fails ? 1 : 0);
    }).catch(function (e) { console.error('FATAL', e); process.exit(1); });
}).catch(function (e) { console.error('FATAL', e); process.exit(1); });
