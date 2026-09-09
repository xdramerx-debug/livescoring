#!/usr/bin/env node
/**
 * РЕГРЕССИЯ: сохранение шаблона оформления должно доходить ДО ВСЕХ.
 *
 *   npm i jsdom                                                   (один раз)
 *   NODE_PATH=/path/to/node_modules node tools/test-design-save.js
 *
 * Историческая поломка: в js/firebase-config.js база объявлялась через
 * `const db = firebase.database()`. Объявления const/let на верхнем уровне
 * скрипта НЕ создают свойство window, поэтому js/design-admin.js (он работает
 * внутри IIFE и обращается к global.db) всегда видел undefined, уходил в
 * ветку «нет подключения к базе» и сохранял выбор только в localStorage.
 * Внешне всё выглядело нормально — админ видел новый дизайн у себя, —
 * но settings/design в базе не менялся и другие пользователи дизайн не получали.
 *
 * Тест поднимает НАСТОЯЩИЕ admin.html, js/firebase-config.js, js/design-system.js
 * и js/design-admin.js поверх фейкового Firebase SDK и проверяет сквозной путь:
 * админ выбрал шаблон → нажал «Сохранить» → запись легла в settings/design →
 * другой пользователь получил её через слушатель и увидел тот же шаблон.
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
    console.log('SKIP: jsdom не установлен (npm i jsdom) — тест сохранения пропущен');
    process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var failures = [];
var checks = 0;

function ok(cond, msg, extra) {
    checks++;
    if (!cond) failures.push(msg + (extra === undefined ? '' : ' → ' + extra));
}

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

/* ---------------------------------------------------------
   Фейковый Firebase: хранит данные в памяти и раздаёт слушателям
   --------------------------------------------------------- */
function makeFakeFirebase(server) {
    var listeners = {};
    function ref(p) {
        return {
            set: function(val) {
                server[p] = JSON.parse(JSON.stringify(val));
                (listeners[p] || []).forEach(function(cb) { cb(snap(p)); });
                return Promise.resolve();
            },
            update: function() { return Promise.resolve(); },
            remove: function() { delete server[p]; return Promise.resolve(); },
            once: function() { return Promise.resolve(snap(p)); },
            on: function(evt, cb) { (listeners[p] = listeners[p] || []).push(cb); cb(snap(p)); },
            off: function() {},
            child: function() { return ref(p); },
            orderByChild: function() { return ref(p); },
            limitToLast: function() { return ref(p); },
            push: function() { return { key: 'k1', set: function() { return Promise.resolve(); } }; }
        };
    }
    function snap(p) {
        return { val: function() { return server[p] === undefined ? null : server[p]; } };
    }
    var database = function() {
        return { ref: ref, goOnline: function() {}, goOffline: function() {} };
    };
    return {
        initializeApp: function() {},
        database: database,
        auth: function() {
            return {
                onAuthStateChanged: function(cb) { cb({ uid: 'admin-1' }); },
                currentUser: { uid: 'admin-1' }
            };
        }
    };
}

function makeWindow(file, server) {
    var dom = new JSDOM(read(file), {
        runScripts: 'dangerously',
        url: 'https://example.test/' + file
    });
    var win = dom.window;
    win.firebase = makeFakeFirebase(server);
    win.__toasts = [];
    win.toast = function(text, type) { win.__toasts.push({ text: String(text), type: type }); };
    win.vib = function() {};
    win.currentLang = 'ru';
    // jsdom не умеет matchMedia/scrollTo, которыми пользуется utils.js
    win.matchMedia = win.matchMedia || function() {
        return { matches: false, addListener: function() {}, removeListener: function() {},
                 addEventListener: function() {}, removeEventListener: function() {} };
    };
    win.scrollTo = function() {};
    return win;
}

function runScript(win, file) {
    var s = win.document.createElement('script');
    s.textContent = read(file);
    win.document.body.appendChild(s);
}

function tick() { return new Promise(function(r) { setTimeout(r, 0); }); }

/* ---------------------------------------------------------
   1. firebase-config.js обязан экспортировать db в window
   --------------------------------------------------------- */
function testGlobalsExposed() {
    var server = {};
    var win = makeWindow('admin.html', server);
    runScript(win, 'js/firebase-config.js');

    ok(typeof win.db === 'object' && win.db !== null,
        'window.db должен существовать после firebase-config.js (иначе модули в IIFE не видят базу)',
        typeof win.db);
    ok(win.db && typeof win.db.ref === 'function', 'window.db.ref должен быть функцией');
    ok(typeof win.auth === 'object' && win.auth !== null, 'window.auth должен существовать', typeof win.auth);
    ok('currentUser' in win, 'window.currentUser должен существовать как свойство window');

    // Именно var: const/let не создают свойство window — это и была причина бага.
    var src = read('js/firebase-config.js');
    ok(/(^|\n)\s*var\s+db\s*=/.test(src),
        'db в firebase-config.js должна объявляться через var, иначе window.db будет undefined');
    ok(!/(^|\n)\s*(const|let)\s+db\s*=/.test(src),
        'db не должна объявляться через const/let — свойство window не создастся');
    ok(!/(^|\n)\s*(const|let)\s+currentUser\s*=/.test(src),
        'currentUser не должна объявляться через const/let');

    // Переприсваивание currentUser должно быть видно снаружи (var, не копия).
    win.eval('currentUser = { uid: "changed" };');
    ok(win.currentUser && win.currentUser.uid === 'changed',
        'Переприсваивание currentUser должно отражаться в window.currentUser',
        JSON.stringify(win.currentUser));
}

/* ---------------------------------------------------------
   2. Сквозной путь: админ сохранил → попало в базу → пришло всем
   --------------------------------------------------------- */
async function testSaveReachesEveryone() {
    var server = {};
    var win = makeWindow('admin.html', server);
    runScript(win, 'js/design-system.js');
    runScript(win, 'js/firebase-config.js');
    runScript(win, 'js/design-admin.js');
    await tick();

    win.dspAdminLoad();
    await tick();

    // Админ выбирает шаблон 3
    win.dspAdminSetGlobal('3');
    ok(win.document.documentElement.getAttribute('data-dsp') === '3',
        'Шаблон 3 должен примениться к странице админа');

    // ...и нажимает «Сохранить оформление для всех»
    win.__toasts = [];
    win.dspAdminSave();
    await tick();

    ok(server['settings/design'] !== undefined,
        'После «Сохранить» запись должна появиться в settings/design (главная регрессия)');
    ok(server['settings/design'] && server['settings/design'].global === '3',
        'В базу должен записаться выбранный шаблон 3',
        JSON.stringify(server['settings/design']));
    ok(server['settings/design'] && server['settings/design'].mode === 'single',
        'В базу должен записаться режим оформления');

    var texts = win.__toasts.map(function(t) { return t.text; }).join(' | ');
    ok(/для всех/.test(texts), 'Админу должно показаться подтверждение «сохранено для всех»', texts);
    ok(!/локально/.test(texts),
        'Не должно быть сообщения «сохранено локально» — значит база не найдена', texts);

    // Другой пользователь открывает обычную страницу: слушатель отдаёт настройки
    var win2 = makeWindow('index.html', server);
    runScript(win2, 'js/design-system.js');
    runScript(win2, 'js/firebase-config.js');
    await tick();
    win2.PestovoDesign.applySettings(server['settings/design']);
    ok(win2.document.documentElement.getAttribute('data-dsp') === '3',
        'Другой пользователь должен увидеть шаблон 3',
        win2.document.documentElement.getAttribute('data-dsp'));
}

/* ---------------------------------------------------------
   3. Сборка (микс) страниц и блоков тоже сохраняется целиком
   --------------------------------------------------------- */
async function testMixSaved() {
    var server = {};
    var win = makeWindow('admin.html', server);
    runScript(win, 'js/design-system.js');
    runScript(win, 'js/firebase-config.js');
    runScript(win, 'js/design-admin.js');
    await tick();
    win.dspAdminLoad();
    await tick();

    win.dspAdminSetMode('mix');
    win.dspAdminSetGlobal('1');
    win.dspAdminSetPage('stats', '4');
    win.dspAdminSetBlock('card', '2');
    win.dspAdminSave();
    await tick();

    var saved = server['settings/design'];
    ok(saved && saved.mode === 'mix', 'Режим «сборка» должен сохраниться', JSON.stringify(saved));
    ok(saved && saved.pages && saved.pages.stats === '4',
        'Шаблон страницы должен сохраниться в базу', JSON.stringify(saved && saved.pages));
    ok(saved && saved.blocks && saved.blocks.card === '2',
        'Шаблон блока должен сохраниться в базу', JSON.stringify(saved && saved.blocks));

    // Пользователь на stats.html получает шаблон страницы, а не базовый
    var win2 = makeWindow('stats.html', server);
    runScript(win2, 'js/design-system.js');
    await tick();
    win2.PestovoDesign.applySettings(saved);
    ok(win2.document.documentElement.getAttribute('data-dsp') === '4',
        'На stats.html должен примениться шаблон страницы 4',
        win2.document.documentElement.getAttribute('data-dsp'));
    ok(win2.document.documentElement.getAttribute('data-dspb-card') === '2',
        'Блок «карточки» должен получить шаблон 2');
}

/* ---------------------------------------------------------
   4. Несохранённый выбор не затирается повторным открытием вкладки
   --------------------------------------------------------- */
async function testUnsavedChoiceSurvivesReload() {
    var server = { 'settings/design': { mode: 'single', global: '2', pages: {}, blocks: {} } };
    var win = makeWindow('admin.html', server);
    runScript(win, 'js/design-system.js');
    runScript(win, 'js/firebase-config.js');
    runScript(win, 'js/design-admin.js');
    await tick();

    win.dspAdminLoad();
    await tick();
    ok(win.PestovoDesign.getSettings().global === '2',
        'При открытии вкладки должен подтянуться сохранённый шаблон 2',
        win.PestovoDesign.getSettings().global);

    // Админ выбрал другой шаблон, но ещё НЕ сохранил, и переключил вкладки
    win.dspAdminSetGlobal('5');
    win.dspAdminLoad();
    await tick();
    ok(win.PestovoDesign.getSettings().global === '5',
        'Несохранённый выбор не должен откатываться при повторном открытии вкладки',
        win.PestovoDesign.getSettings().global);

    // После сохранения база и интерфейс сходятся
    win.dspAdminSave();
    await tick();
    ok(server['settings/design'].global === '5', 'После сохранения в базе должен быть шаблон 5',
        JSON.stringify(server['settings/design']));
}

/* ---------------------------------------------------------
   5. Ошибку записи нельзя выдавать за успех
   --------------------------------------------------------- */
async function testSaveErrorIsReported() {
    var server = {};
    var win = makeWindow('admin.html', server);
    runScript(win, 'js/design-system.js');
    runScript(win, 'js/firebase-config.js');
    runScript(win, 'js/design-admin.js');
    await tick();
    win.dspAdminLoad();
    await tick();

    // База отказывает в записи (например, правила доступа)
    win.db.ref = function() {
        return {
            set: function() { return Promise.reject(new Error('PERMISSION_DENIED')); },
            once: function() { return Promise.resolve({ val: function() { return null; } }); },
            on: function() {}
        };
    };
    win.__toasts = [];
    win.dspAdminSetGlobal('4');
    win.dspAdminSave();
    await tick();
    await tick();

    var texts = win.__toasts.map(function(t) { return t.text; }).join(' | ');
    ok(/Не удалось/.test(texts), 'Отказ базы должен показываться админу как ошибка', texts);
    ok(!/сохранено для всех/.test(texts),
        'При отказе базы нельзя показывать «сохранено для всех»', texts);
    ok(/PERMISSION_DENIED/.test(texts), 'В сообщении должна быть причина отказа', texts);
}

/* ---------------------------------------------------------
   Итог
   --------------------------------------------------------- */
Promise.resolve()
    .then(testGlobalsExposed)
    .then(testSaveReachesEveryone)
    .then(testMixSaved)
    .then(testUnsavedChoiceSurvivesReload)
    .then(testSaveErrorIsReported)
    .catch(function(err) { failures.push('исключение во время проверок: ' + (err && err.stack || err)); })
    .then(function() {
        if (failures.length) {
            console.log('✗ Провалено проверок: ' + failures.length + ' из ' + checks);
            failures.forEach(function(f) { console.log('  — ' + f); });
            process.exit(1);
        }
        console.log('✓ Проверки сохранения оформления пройдены: ' + checks);
    });
