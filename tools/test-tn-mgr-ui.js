#!/usr/bin/env node
/**
 * Проверка вкладки «Турниры 🏆» в админке (admin.html + js/tn-mgr*.js).
 *
 *   npm i jsdom      (один раз; без jsdom тест просто пропускается)
 *   node tools/test-tn-mgr-ui.js
 *
 * Поднимает настоящий admin.html в jsdom, подменяет Firebase простой
 * in-memory базой, выполняет реальные модули системы менеджера турниров
 * (core → data → io → ui → sheet → round → controller) и проходит полный
 * сценарий: создание турнира → раунд → группа → участник (поиск RU/EN) →
 * стартовый лист и отдельный QR-лист → ввод удара → редактор всех карточек →
 * результаты → карточка игрока.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var JSDOM;
try {
    JSDOM = require('jsdom').JSDOM;
} catch (e) {
    console.log('SKIP: jsdom не установлен (npm i jsdom) — UI-тест менеджера турниров пропущен');
    process.exit(0);
}

var ROOT = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

var dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/admin.html' });
var win = dom.window;

// ----------------------------------------------------------
// Firebase: простая in-memory база с подписками
// ----------------------------------------------------------
function splitPath(p) {
    return String(p || '').split('/').filter(function (part) { return part !== ''; });
}

function makeDb() {
    var data = {};
    var seq = 0;
    var listeners = [];

    function get(path) {
        var node = data;
        splitPath(path).forEach(function (key) {
            node = node && typeof node === 'object' ? node[key] : undefined;
        });
        return node === undefined ? null : node;
    }
    function snapshot(path) {
        var parts = splitPath(path);
        return {
            key: parts[parts.length - 1] || null,
            val: function () { return get(path); },
            exists: function () { return get(path) != null; }
        };
    }
    function notify(changed) {
        listeners.slice().forEach(function (item) {
            var lp = item.path;
            var related = !lp || !changed || changed === lp ||
                changed.indexOf(lp + '/') === 0 || lp.indexOf(changed + '/') === 0;
            if (related) item.cb(snapshot(lp));
        });
    }
    function setAt(path, value) {
        var parts = splitPath(path);
        if (!parts.length) { data = value && typeof value === 'object' ? value : {}; notify(''); return; }
        var node = data;
        for (var i = 0; i < parts.length - 1; i++) {
            if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
            node = node[parts[i]];
        }
        var last = parts[parts.length - 1];
        if (value === null || value === undefined) delete node[last];
        else node[last] = value;
        notify(parts.join('/'));
    }
    function applyUpdates(base, obj) {
        Object.keys(obj || {}).forEach(function (key) {
            setAt(base ? base + '/' + key : key, obj[key]);
        });
    }
    function makeRef(path) {
        path = path || '';
        var ref = {
            key: splitPath(path).slice(-1)[0] || null,
            once: function () { return Promise.resolve(snapshot(path)); },
            set: function (value) { setAt(path, value); return Promise.resolve(); },
            update: function (obj) { applyUpdates(path, obj); return Promise.resolve(); },
            remove: function () { setAt(path, null); return Promise.resolve(); },
            push: function (value) {
                var key = 'k' + (++seq) + 'x' + Math.floor(Math.random() * 1e4).toString(36);
                var child = makeRef(path ? path + '/' + key : key);
                if (value !== undefined) child.set(value);
                return child;
            },
            child: function (name) { return makeRef(path ? path + '/' + name : name); },
            on: function (event, cb) { listeners.push({ path: path, cb: cb }); cb(snapshot(path)); return cb; },
            off: function (event, cb) {
                listeners = listeners.filter(function (item) { return !(item.path === path && item.cb === cb); });
            }
        };
        ['orderByChild', 'orderByKey', 'orderByValue', 'limitToLast', 'limitToFirst', 'startAt', 'endAt', 'equalTo'].forEach(function (method) {
            ref[method] = function () { return ref; };
        });
        return ref;
    }
    var db = { ref: function (path) { return makeRef(path); } };
    db.__data = function () { return data; };
    db.__get = get;
    return db;
}

var db = makeDb();
win.db = db;

// ----------------------------------------------------------
// Заглушки окружения (то, что обычно даёт js/utils.js и Firebase)
// ----------------------------------------------------------
var directory = {
    d1: { name: 'Смирнов Алексей', handicap: 12.4, gender: 'men', defaultTee: 'wh' },
    d2: { name: 'Иванова Мария', handicap: 24.2, gender: 'women', defaultTee: 'rd' },
    d3: { name: 'O\'Brien Patrick', handicap: 8.6, gender: 'men', defaultTee: 'bk' }
};
win.currentLang = 'ru';
win.currentUser = { uid: 'test-admin' };
win.currentUserData = { role: 'admin' };
win.toast = function () {};
win.t = function (key) { return key; };
win.escapeHtml = function (s) { return String(s == null ? '' : s); };
win.baseUrl = function () { return 'https://example.test/'; };
// Контракт js/utils.js: uiConfirm({title, text, confirmLabel, danger}) → Promise<boolean>.
win.uiConfirm = function (options) {
    win.__lastConfirm = options || {};
    return Promise.resolve(true);
};
win.copyOrShare = function () {};
win.getKnownPlayersSync = function () { return directory; };
win.TEES = { bk: 'Чёрный', bl: 'Синий', wh: 'Белый', rd: 'Красный' };
win.TOTAL_PAR = 72;
win.COURSE_RATINGS = {};
win.CLUB = 'Гольф-клуб Пестово';
win.holePar = function (hole) { return win.TnMgrCore.defaultCourse().par(hole); };
win.holeHcp = function (hole) { return win.TnMgrCore.defaultCourse().si(hole); };
win.holeDist = function (hole, tee) { return win.TnMgrCore.defaultCourse().dist(hole, tee); };
win.getFieldHcp = function (hi, tee, gender) {
    return win.TnMgrCore.courseHandicap(hi, null, 72, gender);
};
win.switchTab = function () {};

// Печать PDF: окно печати подменяем, чтобы поймать готовый документ.
var printed = [];
win.open = function () {
    var fakeDoc = {
        html: '',
        open: function () { this.html = ''; },
        write: function (chunk) { this.html += chunk; },
        close: function () {},
        querySelectorAll: function () { return []; }
    };
    var fakeWin = {
        document: fakeDoc,
        focus: function () {},
        print: function () { printed.push(fakeDoc.html); },
        close: function () {}
    };
    return fakeWin;
};

// Excel: заглушка SheetJS — ловим выгрузку и подкладываем книгу для импорта.
var excelBooks = [];
win.__excelBook = { SheetNames: [], Sheets: {} };
win.XLSX = {
    read: function () { return win.__excelBook; },
    utils: {
        book_new: function () { return { sheets: [] }; },
        aoa_to_sheet: function (rows) { return { rows: rows || [] }; },
        book_append_sheet: function (book, sheet, name) { book.sheets.push({ name: name, rows: sheet.rows }); },
        sheet_to_json: function (sheet, options) {
            var rows = (sheet && sheet.rows) || [];
            if (options && options.header === 1) return rows;
            if (!rows.length) return [];
            var head = (rows[0] || []).map(function (cell) { return String(cell); });
            return rows.slice(1).map(function (row) {
                var item = {};
                head.forEach(function (key, index) { item[key] = row[index] == null ? '' : row[index]; });
                return item;
            });
        }
    },
    writeFile: function (book, filename) { excelBooks.push({ filename: filename, sheets: book.sheets }); }
};

// ----------------------------------------------------------
// Модули — в том же порядке, что в admin.html
// ----------------------------------------------------------
var MODULES = [
    'js/tn-mgr-core.js',
    'js/tn-mgr-data.js',
    'js/tn-mgr-io.js',
    'js/tn-mgr-ui.js',
    'js/tn-mgr-sheet.js',
    'js/tn-mgr-printcards.js',
    'js/tn-mgr-round.js',
    'js/tn-mgr.js'
];
MODULES.forEach(function (file) {
    win.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
});

// ----------------------------------------------------------
// Инфраструктура теста
// ----------------------------------------------------------
var fails = 0;
var total = 0;
function check(title, cond, extra) {
    total++;
    if (!cond) fails++;
    console.log((cond ? ' ok  ' : 'FAIL ') + ' | ' + title + (extra !== undefined && extra !== '' ? ' → ' + extra : ''));
}
function eq(actual, expected, label) {
    check(label, JSON.stringify(actual) === JSON.stringify(expected), JSON.stringify(actual));
}
function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms || 30); });
}
function flush() { return wait(40); }
function $(selector) { return win.document.querySelector(selector); }
function $$(selector) { return Array.prototype.slice.call(win.document.querySelectorAll(selector)); }
function click(el) {
    if (!el) throw new Error('click: элемент не найден');
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}
function selectFile(inputId, fileName) {
    var input = win.document.getElementById(inputId);
    if (!input) throw new Error('selectFile: input #' + inputId + ' не найден');
    var file = new win.File(['excel-bytes'], fileName || 'players.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
}
function type(el, value) {
    if (!el) throw new Error('type: элемент не найден');
    el.value = value;
    el.dispatchEvent(new win.Event('input', { bubbles: true }));
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
}
function rootHtml() { return win.document.getElementById('tnm-root').innerHTML; }
function lastPrint() { return printed[printed.length - 1] || ''; }
function lastExcel() { return excelBooks[excelBooks.length - 1] || null; }
function get(path) { return db.__get(path); }
/** Состав турнира списком (как его передают в слой данных). */
function participants(tid) {
    var players = get('tournaments/' + tid + '/players') || {};
    return Object.keys(players).map(function (pid) {
        return Object.assign({ id: pid }, players[pid]);
    });
}
function playerByFio(tid, fio) {
    return participants(tid).filter(function (p) { return p.fio === fio; })[0] || null;
}
function tournamentRounds(tid) {
    var rounds = get('rounds') || {};
    return Object.keys(rounds).filter(function (rid) {
        return String(rounds[rid].tournamentId || '') === String(tid);
    });
}

function run() {
    console.log('=== Вкладка «Турниры 🏆»: сценарий организатора ===\n');

    console.log('--- Разметка admin.html ---');
    check('подключён css/tn-manager.css', html.indexOf('css/tn-manager.css') !== -1);
    var order = MODULES.map(function (file) { return html.indexOf(file); });
    check('все модули подключены в нужном порядке', order.every(function (pos, i) {
        return pos !== -1 && (i === 0 || pos > order[i - 1]);
    }), order.join(','));
    check('кнопка вкладки #tnm-tab-btn есть в админке', !!win.document.getElementById('tnm-tab-btn'));
    check('секция #tab-tnmanager есть в админке', !!win.document.getElementById('tab-tnmanager'));
    check('модули загружены как глобальные объекты',
        [win.TnMgrCore, win.TnMgrData, win.TnMgrIO, win.TnMgrUI, win.TnMgrSheetUI, win.TnMgrRoundUI, win.TnMgr]
            .every(function (module) { return module && typeof module === 'object'; }));

    return Promise.resolve()
        .then(function () {
            console.log('\n--- 1. Список турниров ---');
            win.switchTab('tnmanager');
            if (win.TnMgr && win.TnMgr.open) win.TnMgr.open();
            return flush();
        })
        .then(function () {
            var out = rootHtml();
            check('вкладка отрисована', out.indexOf('tnm-view') !== -1);
            check('видна кнопка «Создать турнир»', out.indexOf('Создать турнир') !== -1);
            check('показано пустое состояние списка', out.indexOf('Пока нет турниров') !== -1);
            check('кнопка вкладки не скрыта для админа', !win.document.getElementById('tnm-tab-btn').classList.contains('hidden'));

            console.log('\n--- 2. Форма создания турнира ---');
            click($('[data-tnm-act="new-tournament"]'));
            return flush().then(function () {
                check('открылась форма «Новый турнир»', rootHtml().indexOf('Новый турнир') !== -1);
                check('есть поле названия*', !!$('input[data-field="name"]'));
                check('форма создания поддерживает поиск по базе клуба', !!$('[data-tnm-live-edit="form-directory-search"]'));
                var directorySearch = $('[data-tnm-live-edit="form-directory-search"]');
                type(directorySearch, 'Smirnov');
                return flush().then(function () {
                    var firstDirectoryPlayer = $('[data-tnm-edit="form-directory-player-select"][data-uid="d1"]');
                    check('поиск в форме находит игрока по фамилии RU/EN', !!firstDirectoryPlayer);
                    if (firstDirectoryPlayer) { firstDirectoryPlayer.checked = true; firstDirectoryPlayer.dispatchEvent(new win.Event('change', { bubbles: true })); }
                    type($('[data-tnm-live-edit="form-directory-search"]'), 'Ivanova');
                    return flush();
                }).then(function () {
                    var secondDirectoryPlayer = $('[data-tnm-edit="form-directory-player-select"][data-uid="d2"]');
                    check('поиск в форме находит игрока по имени/фамилии на латинице', !!secondDirectoryPlayer);
                    if (secondDirectoryPlayer) { secondDirectoryPlayer.checked = true; secondDirectoryPlayer.dispatchEvent(new win.Event('change', { bubbles: true })); }
                    check('можно выбрать несколько участников до добавления', $('#tnm-form-directory-selected-count').textContent === '2', $('#tnm-form-directory-selected-count').textContent);
                    click($('[data-tnm-act="form-add-selected-directory"]'));
                    return flush();
                }).then(function () {
                    check('несколько выбранных участников добавляются в очередь турнира', rootHtml().indexOf('Смирнов Алексей') !== -1 && rootHtml().indexOf('Иванова Мария') !== -1);
                    check('для выбранных игроков переносится HI из базы клуба', rootHtml().indexOf('12,4') !== -1 && rootHtml().indexOf('24,2') !== -1, rootHtml().match(/HI [^<]*/g));
                    click($('[data-tnm-act="clear-pending-players"]'));
                    return flush();
                }).then(function () {
                    var dateInput = $('input[data-field="startDate"]');
                    var timeInput = $('input[data-field="startTime"]');
                    check('есть поля даты* и времени*', !!dateInput && !!timeInput);
                    check('дата заполнена сегодняшней', !!dateInput.value && dateInput.value.length === 10, dateInput.value);
                    type($('input[data-field="name"]'), 'Кубок клуба 2026');
                    type(dateInput, '2026-05-16');
                    type(timeInput, '09:30');
                    var chip = $('[data-tnm-act="toggle-format"]');
                    check('справочник форматов отрисован чипсами', $$('[data-tnm-act="toggle-format"]').length >= 10,
                        $$('[data-tnm-act="toggle-format"]').length + ' форматов');
                    var chipFormat = chip.getAttribute('data-format');
                    click(chip);
                    return flush().then(function () {
                        check('формат отмечен', $('[data-tnm-act="toggle-format"][data-format="' + chipFormat + '"]').classList.contains('active'));
                        click($('[data-tnm-act="save-tournament"]'));
                        return wait(60);
                    });
                });
            });
        })
        .then(function () {
            var tournaments = get('tournaments') || {};
            var ids = Object.keys(tournaments);
            check('турнир создан в tournaments/<id>', ids.length === 1, ids.join(','));
            var tour = tournaments[ids[0]] || {};
            win.__tid = ids[0];
            check('название сохранено', tour.name === 'Кубок клуба 2026', tour.name);
            check('дата сохранена (startDate и date)', tour.startDate === '2026-05-16' && tour.date === '2026-05-16', tour.startDate + '/' + tour.date);
            check('время старта сохранено', tour.startTime === '09:30', tour.startTime);
            check('формат сохранён', (tour.formats || []).length === 1, JSON.stringify(tour.formats));
            check('проставлен createdBy', tour.createdBy === 'test-admin', tour.createdBy);
            check('статус upcoming после создания', tour.status === 'upcoming', tour.status);
            check('перешли на карточку турнира', win.location.hash.indexOf('#tnm/' + win.__tid) === 0, win.location.hash);
            return flush();
        })
        .then(function () {
            console.log('\n--- 3. Карточка: вкладки и раунды ---');
            var out = rootHtml();
            ['Раунды', 'Группы', 'Участники', 'Стартовый лист'].forEach(function (tab) {
                check('есть вкладка «' + tab + '»', out.indexOf(tab) !== -1);
            });
            check('кнопка «Изменить» есть', !!$('[data-tnm-act="edit-tournament"]'));
            check('доступны кнопки старта и принудительного финиша',
                !!$('[data-tnm-act="start-tournament"]') && !!$('[data-tnm-act="force-finish-tournament"]'));
            click($('[data-tnm-act="add-round"]'));
            return wait(60);
        })
        .then(function () {
            var rounds = get('tournaments/' + win.__tid + '/rounds') || {};
            var rids = Object.keys(rounds);
            check('раунд добавлен в tournaments/<id>/rounds', rids.length === 1, rids.join(','));
            win.__rid = rids[0];
            check('дата раунда = дате турнира', rounds[win.__rid].date === '2026-05-16', rounds[win.__rid].date);
            check('раунд продублирован в days/ (совместимость со студией)',
                !!get('tournaments/' + win.__tid + '/days/' + win.__rid));
            var out = rootHtml();
            check('раунд виден в таблице', out.indexOf('2026-05-16') !== -1 || out.indexOf('16.05.2026') !== -1);
            check('есть кнопки «Счёт» и «Удалить»',
                !!$('[data-tnm-act="open-round"]') && !!$('[data-tnm-act="delete-round"]'));
            // Клик по строке раунда тоже открывает экран счёта (ТЗ §3.1).
            click($('tr.tnm-row[data-tnm-act="open-round"]'));
            return wait(100).then(function () {
                check('клик по строке раунда открывает экран счёта', win.TnMgrUI.state.route.view === 'round',
                    win.TnMgrUI.state.route.view);
                win.TnMgrUI.navigate({ view: 'card', tid: win.__tid, tab: 'rounds' });
                return wait(80);
            });
        })
        .then(function () {
            console.log('\n--- 4. Группы ---');
            click($('[data-tnm-act="tab"][data-tab="groups"]'));
            return flush();
        })
        .then(function () {
            click($('[data-tnm-act="add-group"]'));
            return flush();
        })
        .then(function () {
            check('открылась форма группы с полями HCP от/до',
                !!$('input[data-field="hcpFrom"]') && !!$('input[data-field="hcpTo"]'));
            check('у группы есть поле названия*', !!$('input[data-field="name"]'));
            check('формат группы выбирается из справочника', !!$('select[data-field="format"]') && $$('select[data-field="format"] option').length >= 2);
            type($('input[data-field="name"]'), 'Группа A');
            type($('input[data-field="hcpFrom"]'), '10');
            type($('input[data-field="hcpTo"]'), '15');
            var groupFormat = $('select[data-field="format"]');
            type(groupFormat, groupFormat.options[1].value);
            click($('[data-tnm-act="save-group"]'));
            return wait(60);
        })
        .then(function () {
            var groups = get('tournaments/' + win.__tid + '/groups') || {};
            var gids = Object.keys(groups);
            check('группа сохранена в tournaments/<id>/groups', gids.length === 1, gids.join(','));
            win.__gid = gids[0];
            check('название группы сохранено', groups[win.__gid].name === 'Группа A', groups[win.__gid].name);
            check('диапазон гандикапа сохранён', Number(groups[win.__gid].hcpFrom) === 10 && Number(groups[win.__gid].hcpTo) === 15,
                groups[win.__gid].hcpFrom + '–' + groups[win.__gid].hcpTo);
            check('формат закреплён за группой', !!groups[win.__gid].format, groups[win.__gid].format);
            check('группа продублирована в divisions/ (публичная страница)',
                !!get('tournaments/' + win.__tid + '/divisions/' + win.__gid));

            console.log('\n--- 5. Участники: поиск RU/EN и добавление ---');
            click($('[data-tnm-act="tab"][data-tab="participants"]'));
            return flush();
        })
        .then(function () {
            var out = rootHtml();
            check('заголовок вкладки — «Гольфисты»', out.indexOf('Гольфисты') !== -1);
            var search = $('#tnm-participant-search');
            check('есть поле поиска игрока', !!search);
            check('поиск участника по имени или фамилии',
                search.placeholder.indexOf('по имени или фамилии') !== -1, search.placeholder);
            check('счётчики участников отрисованы', out.indexOf('Всего участников') !== -1);
            type(search, 'Smirnov');       // латиница → русская фамилия
            return wait(60).then(function () {
                var suggestions = $$('.tnm-suggestion');
                check('поиск латиницей находит игрока из справочника (RU↔EN)', suggestions.length >= 1, suggestions.length);
                var first = suggestions[0];
                check('подсказка — «Смирнов Алексей»', first.getAttribute('data-name').indexOf('Смирнов') !== -1, first.getAttribute('data-name'));
                click(first);
                return wait(80);
            });
        })
        .then(function () {
            var players = get('tournaments/' + win.__tid + '/players') || {};
            var pids = Object.keys(players);
            check('участник добавлен в tournaments/<id>/players', pids.length === 1, pids.join(','));
            win.__pid = pids[0];
            var player = players[win.__pid];
            check('ФИО участника сохранено', (player.fio || '').indexOf('Смирнов') !== -1, player.fio);
            check('гандикап перенесён из справочника', Number(player.hi) === 12.4, player.hi);
            check('участник попал в группу по диапазону гандикапа', player.groupId === win.__gid, player.groupId);
            check('есть счётчик «Всего участников — 1»', rootHtml().indexOf('<b>1</b>, ') !== -1);
            check('участник продублирован в registeredPlayers (регистрация)',
                !!get('tournaments/' + win.__tid + '/registeredPlayers/' + win.__pid));

            // Второй участник — вручную (быстрый способ из ТЗ).
            type($('#tnm-participant-search'), 'Гостев Пётр');
            return wait(60).then(function () {
                var manual = $('[data-tnm-act="add-manual"]');
                check('есть кнопка «добавить вручную»', !!manual);
                click(manual);
                return wait(80);
            });
        })
        .then(function () {
            var players = get('tournaments/' + win.__tid + '/players') || {};
            check('участник добавлен вручную', Object.keys(players).length === 2, Object.keys(players).length);
            win.__pid2 = Object.keys(players).filter(function (pid) { return pid !== win.__pid; })[0];

            // Массовый ввод вставкой из Excel/Google Таблиц (ТЗ §3.3, §8).
            click($('[data-tnm-act="paste-table"]'));
            return flush().then(function () {
                check('модальное окно вставки таблицы открыто', !!$('#tnm-paste-area'));
                $('#tnm-paste-area').value = 'Петров Пётр\t18,2\tмуж\tСиний\t\nСидорова Анна\t9,7\tжен\tКрасный\t';
                click($('[data-tnm-act="confirm-paste"]'));
                return wait(120);
            });
        })
        .then(function () {
            var players = get('tournaments/' + win.__tid + '/players') || {};
            check('массовый ввод добавил 2 участников', Object.keys(players).length === 4, Object.keys(players).length);
            var names = Object.keys(players).map(function (pid) { return players[pid].fio || ''; }).join(' | ');
            check('разобраны ФИО, пол и ТИ из вставленной таблицы',
                names.indexOf('Петров') !== -1 && names.indexOf('Сидорова') !== -1, names);
            var anna = Object.keys(players).filter(function (pid) { return (players[pid].fio || '').indexOf('Сидорова') !== -1; })[0];
            check('женщина определена и получила красные ТИ', !!anna && players[anna].gender === 'women', anna ? players[anna].gender : '');
            check('счётчик участников обновился', rootHtml().indexOf('<b>4</b>, ') !== -1);

            // Добавление из справочника игроков клуба (ТЗ §3.3, §8).
            click($('[data-tnm-act="open-directory"]'));
            return flush().then(function () {
                var boxes = $$('[data-tnm-dir]');
                check('справочник игроков открыт', boxes.length >= 2, boxes.length);
                var ivanova = $('[data-tnm-dir="d2"]');
                check('в справочнике есть ещё не добавленный игрок', !!ivanova && !ivanova.disabled);
                ivanova.checked = true;
                click($('[data-tnm-act="confirm-directory"]'));
                return wait(140);
            });
        })
        .then(function () {
            var players = get('tournaments/' + win.__tid + '/players') || {};
            check('участник добавлен из справочника', Object.keys(players).length === 5, Object.keys(players).length);
            check('счётчики мужчин и женщин посчитаны',
                rootHtml().indexOf('мужчин — <b>') !== -1 && rootHtml().indexOf('женщин — <b>') !== -1,
                (rootHtml().match(/Всего участников — <b>\d+<\/b>, мужчин — <b>\d+<\/b>, женщин — <b>\d+<\/b>/) || [])[0]);

            console.log('\n--- 6. Стартовый лист и QR ---');
            click($('[data-tnm-act="tab"][data-tab="sheet"]'));
            return flush();
        })
        .then(function () {
            var out = rootHtml();
            check('вкладка стартового листа открыта', out.indexOf('Стартовый лист') !== -1);
            check('есть кнопка генерации листа', !!$('[data-tnm-act="generate-sheet"]'));
            check('есть параметры листа (группа/интервал/время/режим/лунка)',
                !!$('[data-field="groupSize"]') && !!$('[data-field="startInterval"]') && !!$('[data-field="firstTeeTime"]') &&
                !!$('select[data-field="startMode"]') && !!$('[data-field="startHole"]'));
            type($('select[data-field="startMode"]'), 'shotgun');
            type($('[data-field="startHole"]'), '10');
            click($('[data-tnm-act="generate-sheet"]'));
            return wait(120);
        })
        .then(function () {
            var sheet = get('tournaments/' + win.__tid + '/sheets/' + win.__rid) || {};
            var entries = sheet.entries || {};
            check('лист сохранён в sheets/<rid>', Object.keys(entries).length === 5, Object.keys(entries).length);
            check('в листе сохранён шотган-режим и выбранная стартовая лунка',
                sheet.options && sheet.options.startMode === 'shotgun' && Number(sheet.options.startHole) === 10,
                JSON.stringify(sheet.options || {}));
            var first = entries[win.__pid] || {};
            check('в листе есть позиция, группа, флайт и время старта',
                first.position != null && !!first.groupId && !!first.flight && !!first.startTime,
                JSON.stringify({ position: first.position, group: first.groupName, flight: first.flight, start: first.startTime }));
            check('назначен маркер группы', !!first.markerPlayerId, first.markerPlayerId);
            var markerEntry = Object.keys(entries).map(function (pid) { return entries[pid]; }).filter(function (entry) {
                return entry.groupRoundId && entry.markerPlayerId && entry.markerPlayerId !== entry.playerId;
            })[0] || first;
            check('QR ведёт в раунд группы от имени назначенного маркера',
                !!markerEntry.groupRoundId && String(markerEntry.qr || '').indexOf('setup-round.html?round=' + markerEntry.groupRoundId + '&as=' + markerEntry.markerPlayerId) !== -1,
                markerEntry.qr);
            var markerAssignment = get('rounds/' + markerEntry.groupRoundId + '/markerAssignments/' + markerEntry.markerPlayerId) || {};
            check('QR-маркер назначен вести счёт отображаемому игроку', markerAssignment.targetId === markerEntry.playerId,
                markerAssignment.targetId + ' → ' + markerEntry.playerId);
            check('QR турнира сохранён в листе', !!((sheet.qr || {}).payload));
            // По умолчанию лист показан флайтами — таблица строк в режиме «Списком».
            if ($('[data-tnm-act="sheet-view-flat"]')) click($('[data-tnm-act="sheet-view-flat"]'));
            var out = rootHtml();
            check('таблица листа отрисована', out.indexOf('tnm-sheet-table') !== -1);
            check('QR-коды показаны картинками', $$('img[data-qr]').length >= 1, $$('img[data-qr]').length);

            // Стартовый лист и QR печатаются в двух отдельных документах.
            click($('[data-tnm-act="sheet-pdf"]'));
            var sheetDoc = lastPrint();
            check('PDF стартового листа содержит турнир, дату, поле и состав',
                sheetDoc.indexOf('Кубок клуба 2026') !== -1 && sheetDoc.indexOf('Группа') !== -1 && sheetDoc.indexOf('Лунка старта') !== -1);
            check('QR-коды не дублируются в PDF стартового листа', sheetDoc.indexOf('data-qr=') === -1 && sheetDoc.indexOf('qrserver.com') === -1);
            check('PDF листа содержит флайты с нумерацией', sheetDoc.indexOf('Флайт 1') !== -1);
            click($('[data-tnm-act="sheet-qr-pdf"]'));
            var qrDoc = lastPrint();
            check('отдельный QR-лист содержит по коду на игрока', (qrDoc.match(/class="qr-label"/g) || []).length === 5);
            check('QR-лист подписывает игрока, маркера, лунку и время',
                qrDoc.indexOf('Счёт ведёт:') !== -1 && qrDoc.indexOf('Лунка старта:') !== -1 && qrDoc.indexOf('Время старта:') !== -1);
            check('QR-лист размечен под A4 portrait, до 10 кодов на лист',
                qrDoc.indexOf('@page{size:A4 portrait') !== -1 && qrDoc.indexOf('grid-template-rows:repeat(5,1fr)') !== -1);

            // Экспорт Excel стартового листа.
            click($('[data-tnm-act="sheet-excel"]'));
            var sheetBook = lastExcel();
            check('Excel листа выгружен (.xlsx)', !!sheetBook && /\.xlsx$/.test(sheetBook.filename), sheetBook && sheetBook.filename);
            check('в книге есть лист «Стартовый лист»', !!sheetBook && sheetBook.sheets[0].name === 'Стартовый лист',
                sheetBook && sheetBook.sheets[0].name);
            check('есть отдельные кнопки PDF стартового листа и QR, плюс колонки',
                !!$('[data-tnm-act="sheet-pdf"]') && !!$('[data-tnm-act="sheet-qr-pdf"]') && !!$('[data-tnm-act="sheet-columns"]'));

            // Экспорт участников в PDF.
            click($('[data-tnm-act="tab"][data-tab="participants"]'));
            return flush().then(function () {
                click($('[data-tnm-act="export-participants"]'));
                var playersDoc = lastPrint();
                check('PDF участников содержит заголовок «Гольфисты» и счётчики',
                    playersDoc.indexOf('Гольфисты') !== -1 && playersDoc.indexOf('Всего') !== -1);
                click($('[data-tnm-act="tab"][data-tab="sheet"]'));
                return flush();
            }).then(function () {
                // Набор колонок листа редактируется и хранится в данных (ТЗ §3.4).
                click($('[data-tnm-act="sheet-columns"]'));
                return flush();
            }).then(function () {
                var boxes = $$('[data-tnm-col]');
                check('модалка колонок открыта', boxes.length >= 8, boxes.length);
                var extra = boxes.filter(function (box) { return box.getAttribute('data-tnm-col') === 'order'; })[0];
                extra.checked = false;
                extra.dispatchEvent(new win.Event('change', { bubbles: true }));
                return wait(100);
            }).then(function () {
                var columns = get('tournaments/' + win.__tid + '/sheets/' + win.__rid + '/columns') || [];
                var column = columns.filter(function (item) { return item.key === 'order'; })[0];
                check('настройка колонок сохранена в данные листа', !!column && column.on === false, JSON.stringify(column));
                click($('[data-tnm-act="close-modal"]'));
                return flush();
            }).then(function () {
                // Правка листа: меняем ТИ игрока — данные должны уехать в участника.
                var teeSelect = $('[data-tnm-edit="sheet-cell"][data-field="tee"]');
                check('ТИ в листе редактируется инлайном', !!teeSelect);
                type(teeSelect, 'bl');
                return wait(80);
            }).then(function () {
                check('правка ТИ листа синхронизирована с участником',
                    get('tournaments/' + win.__tid + '/players/' + win.__pid + '/tee') === 'bl',
                    get('tournaments/' + win.__tid + '/players/' + win.__pid + '/tee'));
                check('правка ТИ сохранена в листе',
                    get('tournaments/' + win.__tid + '/sheets/' + win.__rid + '/entries/' + win.__pid + '/tee') === 'bl');
            });
        })
        .then(function () {
            console.log('\n--- 6б. Публикация стартового листа на сайте ---');
            var bar = $('[data-tnm-publish]');
            check('панель публикации есть над листом', !!bar && bar.getAttribute('data-tnm-publish') === 'off',
                bar && bar.getAttribute('data-tnm-publish'));
            check('кнопка «Опубликовать на сайте» есть', !!$('[data-tnm-act="sheet-publish"]'));
            click($('[data-tnm-act="sheet-publish"]'));
            return wait(200);
        })
        .then(function () {
            var pid = 'tnm_' + win.__tid + '_' + win.__rid;
            var proto = get('protocols/' + pid) || {};
            check('протокол опубликован в protocols/<pid>', proto.source === 'tn-manager' && proto.tournamentId === win.__tid,
                JSON.stringify({ source: proto.source, tid: proto.tournamentId }));
            var groups = Object.keys(proto.groups || {});
            var players = groups.reduce(function (n, key) { return n + ((proto.groups[key].players || []).length); }, 0);
            check('в протоколе все игроки листа', players === 5, players);
            check('у игроков протокола точный и полевой HCP', groups.every(function (key) {
                // У гостя без гандикапа обоих полей нет; у остальных — оба.
                return (proto.groups[key].players || []).every(function (p) { return ('exactHcp' in p) === ('fieldHcp' in p); }) &&
                    (proto.groups[key].players || []).some(function (p) { return typeof p.exactHcp === 'number' && typeof p.fieldHcp === 'number'; });
            }));
            check('отметка публикации в турнире', (get('tournaments/' + win.__tid + '/sheetPublish/' + win.__rid) || {}).protocolId === pid);
            var bar = $('[data-tnm-publish]');
            check('панель показывает «Опубликован»', !!bar && bar.getAttribute('data-tnm-publish') === 'on',
                bar && bar.getAttribute('data-tnm-publish'));
            check('ссылка на страницу «Турниры» с вкладкой старта',
                rootHtml().indexOf('tournaments.html?id=' + win.__tid + '&amp;tab=start') !== -1 ||
                rootHtml().indexOf('tournaments.html?id=' + win.__tid + '&tab=start') !== -1);
            click($('[data-tnm-act="sheet-unpublish"]'));
            return wait(200);
        })
        .then(function () {
            var pid = 'tnm_' + win.__tid + '_' + win.__rid;
            check('«Снять с публикации» удаляет протокол', get('protocols/' + pid) == null);
            var bar = $('[data-tnm-publish]');
            check('панель снова «Не опубликован»', !!bar && bar.getAttribute('data-tnm-publish') === 'off',
                bar && bar.getAttribute('data-tnm-publish'));
            // Публикуем снова — дальше правки листа должны обновлять протокол.
            click($('[data-tnm-act="sheet-publish"]'));
            return wait(200);
        })
        .then(function () {
            console.log('\n--- 7. Экран раунда: счёт ---');
            win.TnMgrUI.navigate({ view: 'round', tid: win.__tid, rid: win.__rid, tab: 'score' });
            return wait(120);
        })
        .then(function () {
            var out = rootHtml();
            check('открыт экран раунда', out.indexOf('tnm-score-table') !== -1);
            check('шапка содержит название турнира', out.indexOf('Кубок клуба 2026') !== -1);
            check('вкладки «Счёт» и «Результаты» есть',
                !!$('[data-tnm-act="round-tab"][data-tab="score"]') && !!$('[data-tnm-act="round-tab"][data-tab="results"]'));
            check('есть кнопки Экспорт PDF/Excel и Стартовый лист',
                !!$('[data-tnm-act="round-export-pdf"]') && !!$('[data-tnm-act="round-export-excel"]') && !!$('[data-tnm-act="round-open-sheet"]'));
            check('информационная строка: ТИ и формат', out.indexOf('Формат') !== -1 && out.indexOf('ТИ') !== -1);
            check('18 колонок лунок', $$('.tnm-hole-col').length >= 18);
            ['Длина', 'Пар', 'Индекс'].forEach(function (label) {
                check('строка «' + label + '» есть в таблице', out.indexOf(label) !== -1);
            });
            check('строчные фильтры групп построены из данных',
                $$('[data-tnm-act="group-filter"]').length >= 4, $$('[data-tnm-act="group-filter"]').length);

            click($('[data-tnm-act="round-export-pdf"]'));
            var roundDoc = lastPrint();
            check('PDF раунда содержит строки Длина/Пар/Индекс и 18 лунок',
                roundDoc.indexOf('Длина') !== -1 && roundDoc.indexOf('Индекс') !== -1 && roundDoc.indexOf('>18<') !== -1);
            check('PDF раунда содержит название турнира', roundDoc.indexOf('Кубок клуба 2026') !== -1);
            click($('[data-tnm-act="round-export-excel"]'));
            var roundBook = lastExcel();
            check('Excel раунда выгружен', !!roundBook && /\.xlsx$/.test(roundBook.filename), roundBook && roundBook.filename);
            check('в книге раунда есть строка «Индекс»', !!roundBook && JSON.stringify(roundBook.sheets[0].rows).indexOf('Индекс') !== -1);

            var input = $('[data-tnm-edit="score-cell"][data-pid="' + win.__pid + '"][data-hole="1"]');
            check('удары редактируются инлайном', !!input);
            type(input, '4');
            return wait(100);
        })
        .then(function () {
            check('удар записан в tournaments/<id>/scores/<rid>/<pid>/<hole>',
                String(get('tournaments/' + win.__tid + '/scores/' + win.__rid + '/' + win.__pid + '/1')) === '4',
                get('tournaments/' + win.__tid + '/scores/' + win.__rid + '/' + win.__pid + '/1'));
            var groupRounds = get('tournaments/' + win.__tid + '/rounds/' + win.__rid + '/groupRounds') || {};
            var gids = Object.keys(groupRounds).map(function (key) { return groupRounds[key]; });
            check('созданы записи rounds/<groupRoundId> для страниц счёта', gids.length >= 1, gids.join(','));
            var gid = gids[0];
            check('раунд группы помечен турниром и создателем',
                !!gid && get('rounds/' + gid + '/tournamentId') === win.__tid && !!get('rounds/' + gid + '/createdBy'),
                gid ? (get('rounds/' + gid + '/tournamentId') + '/' + get('rounds/' + gid + '/createdBy')) : '');
            check('удар продублирован в rounds/<gid>/players/<pid>/scores',
                gid && String(get('rounds/' + gid + '/players/' + win.__pid + '/scores/1')) === '4',
                gid ? get('rounds/' + gid + '/players/' + win.__pid + '/scores/1') : '');
            check('выставлен accessKey для QR-ввода счёта', !!(gid && get('rounds/' + gid + '/accessKey')));

            console.log('\n--- 8. Счётные карточки и редактор раскладки ---');
            win.TnMgrUI.navigate({ view: 'round', tid: win.__tid, rid: win.__rid, tab: 'scorecards' });
            return wait(120);
        })
        .then(function () {
            var out = rootHtml();
            check('открыта отдельная страница всех счётных карточек', out.indexOf('Предпросмотр всех карточек') !== -1 && $$('.tn-scorecard').length === 5);
            check('редактор содержит поля позиции, размера и вида',
                !!$('[data-tnm-edit="scorecard-layout"][data-field="x"]') && !!$('[data-tnm-edit="scorecard-layout"][data-field="w"]') &&
                !!$('[data-tnm-edit="scorecard-layout"][data-field="fontSize"]') && !!$('[data-tnm-edit="scorecard-layout"][data-field="theme"]'));
            check('доступна перестановка блоков и добавление элементов',
                !!$('[data-tnm-act="scorecard-move-block"][data-dir="up"]') && !!$('[data-tnm-act="scorecard-add-block"]'));
            click($('[data-tnm-act="scorecards-print"]'));
            var scorecardsDoc = lastPrint();
            check('PDF карточек содержит QR, HI/CH и два поля счёта',
                scorecardsDoc.indexOf('data-qr=') !== -1 && scorecardsDoc.indexOf('Точный гандикап (HI)') !== -1 &&
                scorecardsDoc.indexOf('Полевой гандикап (CH)') !== -1 && scorecardsDoc.indexOf('Счёт маркера') !== -1);
            type($('[data-tnm-edit="scorecard-layout"][data-block="player"][data-field="x"]'), '5');
            type($('[data-tnm-edit="scorecard-layout"][data-block="player"][data-field="w"]'), '70');
            type($('[data-tnm-edit="scorecard-layout"][data-block="player"][data-field="fontSize"]'), '15');
            type($('[data-tnm-edit="scorecard-layout"][data-field="theme"]'), 'contrast');
            return wait(100);
        })
        .then(function () {
            var layout = get('tournaments/' + win.__tid + '/rounds/' + win.__rid + '/scorecardLayout') || {};
            var playerBlock = (layout.blocks || []).filter(function (block) { return block.id === 'player'; })[0] || {};
            check('позиция и размер блока сохраняются в раунде', Number(playerBlock.x) === 5 && Number(playerBlock.w) === 70, playerBlock.x + ' / ' + playerBlock.w);
            check('размер текста и тема карточки сохраняются', Number(playerBlock.fontSize) === 15 && layout.theme === 'contrast', playerBlock.fontSize + ' / ' + layout.theme);
            click($('[data-tnm-act="scorecard-move-block"][data-id="details"][data-dir="up"]'));
            return wait(100);
        })
        .then(function () {
            var layout = get('tournaments/' + win.__tid + '/rounds/' + win.__rid + '/scorecardLayout') || {};
            check('перестановка блоков меняет порядок и сохраняется', layout.blocks && layout.blocks[0].id === 'details', layout.blocks && layout.blocks[0].id);
            click($('[data-tnm-act="scorecard-add-block"]'));
            return wait(100);
        })
        .then(function () {
            var layout = get('tournaments/' + win.__tid + '/rounds/' + win.__rid + '/scorecardLayout') || {};
            check('новый блок добавляется и сохраняется', (layout.blocks || []).length === 7, (layout.blocks || []).length);
            click($('[data-tnm-act="scorecards-back"]'));
            return wait(100);
        })
        .then(function () {
            console.log('\n--- 9. Результаты ---');
            click($('[data-tnm-act="round-tab"][data-tab="results"]'));
            return wait(120);
        })
        .then(function () {
            var out = rootHtml();
            check('таблица результатов отрисована', out.indexOf('tnm-results-table') !== -1);
            check('есть колонки Место/Игрок/Счёт/Нетто/Очки', out.indexOf('Очки стэйблфорда') !== -1);
            check('участник в результатах', out.indexOf('Смирнов') !== -1);
            check('первое место подсвечено классом', out.indexOf('tnm-podium-1') !== -1);
            check('сортировка по клику доступна', !!(win.document.querySelector('[data-tnm-act="result-sort"][data-key="points"]')));
            click(win.document.querySelector('[data-tnm-act="result-sort"][data-key="playerName"]'));
            return flush().then(function () {
                check('сортировка по игроку не сломала экран', rootHtml().indexOf('tnm-results-table') !== -1);
                check('есть кнопки экспорта результатов',
                    !!$('[data-tnm-act="results-export-pdf"]') && !!$('[data-tnm-act="results-export-excel"]'));
                click($('[data-tnm-act="results-export-pdf"]'));
                var resultsDoc = lastPrint();
                check('PDF результатов содержит призёров и очки стэйблфорда',
                    resultsDoc.indexOf('podium-1') !== -1 && resultsDoc.indexOf('Очки стэйблфорда') !== -1);
                click($('[data-tnm-act="results-export-excel"]'));
                var resultsBook = lastExcel();
                check('Excel результатов выгружен', !!resultsBook && JSON.stringify(resultsBook.sheets[0].rows).indexOf('Очки') !== -1,
                    resultsBook && JSON.stringify(resultsBook.sheets[0].rows.slice(0, 2)));
                var gross = $('[data-tnm-edit="result-gross"][data-pid="' + win.__pid + '"]');
                check('результат правится вручную', !!gross);
                type(gross, '77');
                return wait(100);
            });
        })
        .then(function () {
            var override = get('tournaments/' + win.__tid + '/results/' + win.__rid + '/' + win.__pid) || {};
            check('ручная правка счёта сохранена в results/<rid>/<pid>', Number(override.gross) === 77, override.gross);
            click($('[data-tnm-act="results-save"]'));
            return wait(120);
        })
        .then(function () {
            var results = get('tournaments/' + win.__tid + '/results/' + win.__rid) || {};
            check('результаты сохранены для публичной таблицы', Object.keys(results).length >= 2, Object.keys(results).length);

            console.log('\n--- 9. Карточка игрока ---');
            win.TnMgrUI.navigate({ view: 'player', tid: win.__tid, pid: win.__pid, rid: win.__rid });
            return wait(140);
        })
        .then(function () {
            var out = rootHtml();
            check('карточка игрока открыта', out.indexOf('tnm-card-table') !== -1);
            check('в шапке ФИО, HI и CH', out.indexOf('Смирнов') !== -1 && out.indexOf('HI:') !== -1 && out.indexOf('CH:') !== -1);
            check('показан пар поля 72', out.indexOf('Пар поля') !== -1 && out.indexOf('<b>72</b>') !== -1);
            ['Длина', 'Пар', 'Индекс', 'Фора', 'Удары', 'Очки гросс', 'Очки нетто'].forEach(function (label) {
                check('строка карточки «' + label + '»', out.indexOf(label) !== -1);
            });
            check('HI и CH редактируются администратором',
                !!$('[data-tnm-edit="player-hi"]') && !!$('[data-tnm-edit="player-ch"]'));
            var foreInput = $('[data-tnm-edit="fore-cell"]');
            check('фора редактируется', !!foreInput);
            type(foreInput, '2');
            var chInput = $('[data-tnm-edit="player-ch"]');
            type(chInput, '14');
            return wait(100);
        })
        .then(function () {
            var player = get('tournaments/' + win.__tid + '/players/' + win.__pid) || {};
            check('правка CH сохранена', Number(player.ch) === 14, player.ch);
            check('правка форы сохранена по лунке', Object.keys(player.fores || {}).length >= 1, JSON.stringify(player.fores));
            click($('[data-tnm-act="player-export-pdf"]'));
            var cardDoc = lastPrint();
            check('PDF карточки игрока содержит ФИО, пар поля и очки нетто',
                cardDoc.indexOf('Смирнов') !== -1 && cardDoc.indexOf('Пар поля') !== -1 && cardDoc.indexOf('Очки нетто') !== -1);
            check('есть кнопка экспорта карточки', !!$('[data-tnm-act="player-export-pdf"]'));

            console.log('\n--- 10. Возврат в список ---');
            win.TnMgrUI.navigate({ view: 'list' });
            return wait(100);
        })
        .then(function () {
            var out = rootHtml();
            check('список турниров с созданным турниром', out.indexOf('Кубок клуба 2026') !== -1);
            check('статус турнира показан', out.indexOf('tnm-chip') !== -1);
            check('кнопка удаления турнира есть', !!$('[data-tnm-act="delete-tournament"]'));

            // Удаление идёт через uiConfirm реального контракта (title/text).
            click($('[data-tnm-act="delete-tournament"]'));
            return wait(120).then(function () {
                var confirm = win.__lastConfirm || {};
                check('подтверждение удаления передаёт text и title', !!confirm.text && !!confirm.title,
                    JSON.stringify({ title: confirm.title, text: String(confirm.text).slice(0, 40) }));
                check('турнир удалён из базы', !get('tournaments/' + win.__tid));
                check('список вернулся к пустому состоянию', rootHtml().indexOf('Пока нет турниров') !== -1);
            });
        })
        .then(function () {
            console.log('\n--- 11. Импорт участников из Excel ---');

            // Книга как у организатора: шапка отчёта над таблицей, раздельные
            // колонки «Фамилия» и «Имя», пустой гандикап, строка «Итого»,
            // второй лист с составом и плюсовой гандикап.
            win.__excelBook = {
                SheetNames: ['Состав', 'Запас'],
                Sheets: {
                    'Состав': { rows: [
                        ['Гольф-клуб «Пестово» — предварительный состав'],
                        ['Фамилия', 'Имя', 'Гандикап'],
                        ['Иванов', 'Иван', '12,4'],
                        ['Петрова', 'Мария', ''],
                        ['Итого', '', '']
                    ] },
                    'Запас': { rows: [
                        ['ФИО', 'ИГ'],
                        ['Сидоров Пётр', '+2,5']
                    ] }
                }
            };

            click($('[data-tnm-act="new-tournament"]'));
            return flush().then(function () {
                check('в форме турнира есть блок «Участники турнира (Excel)»',
                    rootHtml().indexOf('Участники турнира (Excel)') !== -1);
                check('есть кнопка импорта участников в форме', !!$('[data-tnm-act="import-participants-excel"]'));
                check('есть поле выбора файла для участников', !!$('#tnm-form-excel-input'));
                type($('input[data-field="name"]'), 'Кубок с Excel-составом');
                type($('input[data-field="startDate"]'), '2026-06-20');
                type($('input[data-field="startTime"]'), '10:00');
                click($('[data-tnm-act="toggle-format"]'));
                return flush();
            });
        })
        .then(function () {
            selectFile('tnm-form-excel-input', 'sostav.xlsx');
            return wait(140);
        })
        .then(function () {
            var pending = win.TnMgrUI.state.pendingPlayers || [];
            check('файл разобран: 3 участника со всех листов', pending.length === 3,
                pending.map(function (p) { return p.fio; }).join(' | '));
            eq(pending.map(function (p) { return p.fio; }),
                ['Иванов Иван', 'Петрова Мария', 'Сидоров Пётр'], 'имя и фамилия собраны из колонок');
            eq(pending.map(function (p) { return p.hi; }), [12.4, null, -2.5], 'гандикапы (включая плюсовой)');
            check('участники из файла показаны в форме', rootHtml().indexOf('Иванов Иван') !== -1);
            check('строка «Итого» не попала в список', rootHtml().indexOf('Итого') === -1);
            click($('[data-tnm-act="save-tournament"]'));
            return wait(200);
        })
        .then(function () {
            var tournaments = get('tournaments') || {};
            var ids = Object.keys(tournaments).filter(function (id) {
                return tournaments[id].name === 'Кубок с Excel-составом';
            });
            check('турнир с Excel-составом создан', ids.length === 1, ids.join(','));
            win.__tid2 = ids[0];
            var players = get('tournaments/' + win.__tid2 + '/players') || {};
            var list = Object.keys(players).map(function (pid) { return players[pid]; });
            eq(list.map(function (p) { return p.fio; }).sort(),
                ['Иванов Иван', 'Петрова Мария', 'Сидоров Пётр'], 'участники из Excel добавлены в турнир');
            var ivanov = list.filter(function (p) { return p.fio === 'Иванов Иван'; })[0] || {};
            var sidorov = list.filter(function (p) { return p.fio === 'Сидоров Пётр'; })[0] || {};
            eq(ivanov.hi, 12.4, 'гандикап участника из Excel сохранён');
            eq(ivanov.lastName, 'Иванов', 'фамилия участника сохранена');
            eq(sidorov.hi, -2.5, 'плюсовой гандикап сохранён (как в АГР)');
            check('участник зеркалится в registeredPlayers',
                !!get('tournaments/' + win.__tid2 + '/registeredPlayers/' + Object.keys(players)[0]));
            check('после сохранения открылась вкладка «Участники»',
                win.TnMgrUI.state.route.view === 'card' && win.TnMgrUI.state.route.tab === 'participants',
                win.TnMgrUI.state.route.view + '/' + win.TnMgrUI.state.route.tab);
            return wait(80);
        })
        .then(function () {
            // Импорт из вкладки «Участники»: файл в другом написании колонок,
            // данные на втором листе и с гандикапом в среднем столбце.
            win.__excelBook = {
                SheetNames: ['Легенда', 'Список'],
                Sheets: {
                    'Легенда': { rows: [['Как заполнять: Ф.И.О. и ИГ']] },
                    'Список': { rows: [
                        ['№', 'Ф.И.О.', 'ИГ', 'Пол', 'ТИ'],
                        ['1', 'Кузнецов Кирилл', 'HI 8.2', 'муж', 'Белый'],
                        ['2', 'Козлова Ольга', '14', 'жен', 'Красный']
                    ] }
                }
            };
            click($('[data-tnm-act="import-excel"]'));
            return flush();
        })
        .then(function () {
            selectFile('tnm-excel-input', 'spisok.xlsx');
            return wait(160);
        })
        .then(function () {
            var out = rootHtml();
            check('открылся предпросмотр импорта', out.indexOf('Импорт участников') !== -1);
            check('в предпросмотре найдено 2 участника', out.indexOf('Найдено участников: 2') !== -1);
            check('в предпросмотре видны имена и второй лист', out.indexOf('Кузнецов Кирилл') !== -1 && out.indexOf('Козлова Ольга') !== -1);
            check('в предпросмотре показаны распознанные колонки (ФИО/ИГ/Пол)',
                out.indexOf('колонки:') !== -1 && out.indexOf('ФИО — B') !== -1 &&
                out.indexOf('HI — C') !== -1 && out.indexOf('Пол — D') !== -1);
            click($('[data-tnm-act="confirm-import"]'));
            return wait(200);
        })
        .then(function () {
            var players = get('tournaments/' + win.__tid2 + '/players') || {};
            var list = Object.keys(players).map(function (pid) { return players[pid]; });
            eq(list.length, 5, 'импорт со вкладки «Участники» добавил ещё 2 участников');
            var kirill = list.filter(function (p) { return p.fio === 'Кузнецов Кирилл'; })[0] || {};
            eq(kirill.hi, 8.2, 'гандикап «HI 8.2» распознан');
            eq(kirill.tee, 'wh', 'название ТИ из файла переведено в код');
            eq(list.filter(function (p) { return p.fio === 'Козлова Ольга'; })[0].gender, 'women', 'пол из файла');
            check('импорт не задвоил уже добавленных', list.filter(function (p) { return p.fio === 'Иванов Иван'; }).length === 1);
            return wait(40);
        })
        .then(function () {
            // Повторный импорт того же файла не задваивает состав.
            click($('[data-tnm-act="import-excel"]'));
            return flush();
        })
        .then(function () {
            selectFile('tnm-excel-input', 'spisok.xlsx');
            return wait(160);
        })
        .then(function () {
            check('повторный импорт открыл предпросмотр', rootHtml().indexOf('Импорт участников') !== -1);
            click($('[data-tnm-act="confirm-import"]'));
            return wait(200);
        })
        .then(function () {
            var players = get('tournaments/' + win.__tid2 + '/players') || {};
            eq(Object.keys(players).length, 5, 'повторный импорт не создал дублей');
            return wait(40);
        })
        // ----------------------------------------------------------
        // 12. Справочник сайта: участники турнира регистрируются гостями
        // ----------------------------------------------------------
        .then(function () {
            click($('[data-tnm-act="directory-sync"]'));
            return flush();
        })
        .then(function () {
            check('открылось окно «База данных клуба — участники и гандикапы»',
                rootHtml().indexOf('База данных клуба') !== -1 && rootHtml().indexOf('гандикап') !== -1);
            check('в окне регистрация гостей и обе синхронизации гандикапов',
                !!$('[data-tnm-act="directory-register"]') &&
                !!$('[data-tnm-act="handicaps-to-site"]') &&
                !!$('[data-tnm-act="handicaps-from-site"]'));
            click($('[data-tnm-act="directory-register"]'));
            return wait(220);
        })
        .then(function () {
            var list = participants(win.__tid2);
            var users = get('users') || {};
            var pub = get('usersPublic') || {};
            eq(list.filter(function (p) { return !!p.uid; }).length, list.length,
                'каждому участнику проставлен uid справочника сайта');
            var kirill = playerByFio(win.__tid2, 'Кузнецов Кирилл');
            win.__guestUid = kirill.uid;
            win.__guestPid = kirill.id;
            check('гость создан в users/ и в публичном зеркале usersPublic/',
                !!users[kirill.uid] && !!pub[kirill.uid], String(kirill.uid));
            check('запись помечена как гость',
                users[kirill.uid].isGuest === true && pub[kirill.uid].isGuest === true);
            check('ФИО и гандикап перенесены в профиль гостя',
                users[kirill.uid].name === 'Кузнецов Кирилл' && Number(pub[kirill.uid].handicap) === 8.2,
                users[kirill.uid].name + ' / ' + pub[kirill.uid].handicap);
            check('профиль гостя помечен источником «турнир»', users[kirill.uid].tnSource === 'tournament');
            check('uid продублирован в registeredPlayers (публичная страница)',
                !!get('tournaments/' + win.__tid2 + '/registeredPlayers/' + kirill.id + '/uid'));
            check('в таблице участников видна отметка связи со справочником',
                rootHtml().indexOf('tnm-dir-linked') !== -1);
            var guestsOfTn = Object.keys(users).filter(function (uid) {
                return users[uid].tnTournamentId === win.__tid2;
            });
            eq(guestsOfTn.length, list.length, 'гостей ровно по числу участников турнира');
            eq(guestsOfTn.filter(function (uid) { return users[uid].name === 'Кузнецов Кирилл'; }).length, 1,
                'у каждого участника своя запись (без слипания однофамильцев)');
            return win.TnMgrData.syncPlayersToDirectory(win.__tid2, participants(win.__tid2), {}).then(function (res) {
                eq(res.added, 0, 'повторная синхронизация не создаёт новых гостей');
                eq(Object.keys(get('users') || {}).filter(function (uid) {
                    return (get('users') || {})[uid].tnTournamentId === win.__tid2;
                }).length, list.length, 'дублей в справочнике сайта нет');
            });
        })
        .then(function () {
            // Гандикап справили в админке (users/) — переносим его в турнир.
            db.ref('users/' + win.__guestUid).update({ handicap: 5.5, hcpSource: 'manual' });
            db.ref('usersPublic/' + win.__guestUid).update({ handicap: 5.5 });
            click($('[data-tnm-act="directory-sync"]'));
            return flush();
        })
        .then(function () {
            click($('[data-tnm-act="handicaps-from-site"]'));
            return wait(220);
        })
        .then(function () {
            var kirill = playerByFio(win.__tid2, 'Кузнецов Кирилл');
            eq(Number(kirill.hi), 5.5, 'HI участника обновлён из справочника сайта');
            eq(Number(kirill.ch), Number(win.getFieldHcp(5.5, kirill.tee || 'wh', kirill.gender || 'men')),
                'CH пересчитан по новому HI');
            eq(Number(get('tournaments/' + win.__tid2 + '/registeredPlayers/' + win.__guestPid + '/handicap')), 5.5,
                'регистрация участника получила новый гандикап');
            return wait(40);
        })
        .then(function () {
            // Обратное направление: гандикап турнира → справочник сайта.
            return win.TnMgrData.updatePlayer(win.__tid2, win.__guestPid, { hi: 7.7 },
                get('tournaments/' + win.__tid2)).then(function () {
                click($('[data-tnm-act="directory-sync"]'));
                return flush();
            });
        })
        .then(function () {
            click($('[data-tnm-act="handicaps-to-site"]'));
            return wait(220);
        })
        .then(function () {
            eq(Number(get('users/' + win.__guestUid + '/handicap')), 7.7,
                'гандикап турнира отправлен в профиль сайта (users)');
            eq(Number(get('usersPublic/' + win.__guestUid + '/handicap')), 7.7,
                'публичное зеркало профиля обновлено');
            check('гандикап помечен источником «турнир»',
                get('users/' + win.__guestUid + '/hcpSource') === 'tournament');
            return wait(40);
        })
        // ----------------------------------------------------------
        // 13. Пауза турнира
        // ----------------------------------------------------------
        .then(function () {
            click($('[data-tnm-act="start-tournament"]'));
            return wait(140);
        })
        .then(function () {
            eq(String(get('tournaments/' + win.__tid2 + '/status')), 'active', 'турнир стартовал');
            // Раунды групп этого турнира + посторонний раунд: пауза турнира
            // должна остановить только свои живые раунды.
            db.ref('rounds/grA').set({ tournamentId: win.__tid2, status: 'active', players: { p1: { name: 'Иванов Иван' } } });
            db.ref('rounds/grB').set({ tournamentId: win.__tid2, status: 'completed', players: {} });
            db.ref('rounds/grC').set({ tournamentId: win.__tid2, status: 'active', paused: true, pausedAt: Date.now() - 60000, players: {} });
            db.ref('rounds/grD').set({ tournamentId: 'some-other-tournament', status: 'active', players: {} });
            var pauseBtn = $('[data-tnm-act="pause-tournament"]');
            check('кнопка «Пауза» есть и доступна на идущем турнире', !!pauseBtn && !pauseBtn.disabled);
            click(pauseBtn);
            return flush();
        })
        .then(function () {
            check('открылось окно паузы со списком причин',
                !!$('#tnm-pause-reason') && $$('#tnm-pause-reason option').length >= 5);
            check('есть поле своей формулировки паузы', !!$('#tnm-pause-note'));
            type($('#tnm-pause-note'), 'гроза, остановка поля');
            click($('[data-tnm-act="confirm-pause-tournament"]'));
            return wait(200);
        })
        .then(function () {
            var t = get('tournaments/' + win.__tid2) || {};
            check('турнир помечен паузой с причиной',
                t.paused === true && t.pauseReason === 'гроза, остановка поля', String(t.pauseReason));
            check('записана история паузы (кто и когда)',
                Array.isArray(t.pauseHistory) && t.pauseHistory.length === 1 && !!t.pauseHistory[0].pausedAt);
            check('в карточке турнира виден баннер паузы', rootHtml().indexOf('tnm-pause-banner') !== -1);
            check('чип статуса — «На паузе»', rootHtml().indexOf('tnm-chip-paused') !== -1);
            check('появилась кнопка «Возобновить»', !!$('[data-tnm-act="resume-tournament"]'));
            check('кнопка «Старт» на паузе недоступна',
                $('[data-tnm-act="start-tournament"]').disabled === true);
            var rounds = get('rounds') || {};
            check('живой раунд турнира поставлен на паузу с флагом турнира',
                rounds.grA.paused === true && rounds.grA.pausedByTournament === win.__tid2 &&
                rounds.grA.pauseReason === 'гроза, остановка поля' && !!rounds.grA.pausedAt);
            check('завершённый раунд турнира не тронут', !rounds.grB.paused);
            check('раунд на ручной паузе не помечен паузой турнира',
                rounds.grC.paused === true && !rounds.grC.pausedByTournament);
            check('чужой раунд не тронут', !rounds.grD.paused);
            return win.TnMgrData.pauseTournament(win.__tid2, 'ещё раз');
        })
        .then(function (res) {
            check('повторная пауза турнира не дублирует запись', res.already === true && res.paused === 0);
            eq((get('tournaments/' + win.__tid2 + '/pauseHistory') || []).length, 1, 'история паузы не задвоилась');
            click($('[data-tnm-act="resume-tournament"]'));
            return wait(200);
        })
        .then(function () {
            var t = get('tournaments/' + win.__tid2) || {};
            check('пауза турнира снята', t.paused === false && !t.pausedAt, JSON.stringify(t.paused));
            check('история паузы закрыта возобновлением',
                !!t.pauseHistory[0].resumedAt && Number(t.totalPausedMs) >= 0);
            check('после возобновления снова видна кнопка «Пауза»',
                !!$('[data-tnm-act="pause-tournament"]') && !$('[data-tnm-act="resume-tournament"]'));
            var rounds = get('rounds') || {};
            check('раунд турнира снят с паузы и накопил её длительность',
                rounds.grA.paused === false && !rounds.grA.pausedByTournament &&
                Number(rounds.grA.totalPausedMs) >= 0 && !!rounds.grA.pauseHistory[0].resumedAt);
            check('раунд на ручной паузе остался на паузе', rounds.grC.paused === true);
            check('завершённый и чужой раунды не тронуты возобновлением',
                !rounds.grB.paused && !rounds.grD.paused && !rounds.grD.totalPausedMs);
            return wait(40);
        })
        // ── 14. Конструктор печати: карточку можно двигать по листу мышью ──
        .then(function () {
            console.log('\n--- 14. Печатные карточки: перетаскивание карточки по листу ---');
            var PC = win.TnMgrPrintCards;
            PC.state.previewPinned = true;
            PC.state.preview = 'sheet';
            PC.state.draft = null;
            win.TnMgrUI.navigate({ view: 'card', tab: 'printcards', tid: win.__tid2 });
            return wait(200);
        })
        .then(function () {
            check('открыт конструктор печатных карточек', !!$('[data-tnpc-stage]') && !!$('.tnpc-card'));
            click($('[data-tnm-act="tnpc-panel-sizes"]'));   // панель «Размеры и место на листе»
            return wait(140);
        })
        .then(function () {
            var PC = win.TnMgrPrintCards;
            var handle = $('.tnpc-move');
            check('у карточки на листе есть ручка перетаскивания ✥', !!handle);
            check('в панели «Размеры» видно место карточки',
                !!$('[data-tnm-live-edit="tnpc-layout"][data-field="xMm"]'));
            // jsdom не измеряет размеры — подставляем линейку листа A4 (594 px на 297 мм).
            $('[data-tnpc-page]').getBoundingClientRect = function () {
                return { left: 0, top: 0, right: 594, bottom: 420, width: 594, height: 420, x: 0, y: 0 };
            };
            var before = Object.assign({}, PC.state.draft.layout);
            function pointer(type, x, y) {
                var ev = new win.MouseEvent(type, {
                    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0
                });
                try { Object.defineProperty(ev, 'pointerId', { value: 7 }); } catch (e) { /* silent */ }
                handle.dispatchEvent(ev);
            }
            // Клик без движения не должен сдвинуть карточку (порог «клик или drag»).
            pointer('pointerdown', 100, 100);
            pointer('pointerup', 100, 100);
            eq(PC.state.draft.layout.xMm, before.xMm, 'клик по карточке не сдвинул её по листу');

            pointer('pointerdown', 100, 100);
            check('перетаскивание карточки началось',
                !!PC.state.cardDrag && $('.tnpc-card').classList.contains('dragging'));
            pointer('pointermove', 200, 150);
            var after = PC.state.draft.layout;
            check('карточка поехала за мышью по листу',
                Math.abs(after.xMm - before.xMm) > 1 && Math.abs(after.yMm - before.yMm) > 1,
                before.xMm + '/' + before.yMm + ' → ' + after.xMm + '/' + after.yMm);
            var placed = PC.placement(after, PC.state.draft.size, 0);
            check('карточка на экране переставлена без полной перерисовки',
                ($('.tnpc-card').getAttribute('style') || '').indexOf('left:' + placed.xMm + 'mm') !== -1,
                $('.tnpc-card').getAttribute('style'));
            eq(Number($('[data-tnm-live-edit="tnpc-layout"][data-field="xMm"]').value), Number(after.xMm),
                'число X в панели «Размеры» следует за перетаскиванием');
            eq(Number($('[data-tnm-live-edit="tnpc-layout"][data-field="yMm"]').value), Number(after.yMm),
                'число Y в панели «Размеры» следует за перетаскиванием');
            pointer('pointerup', 200, 150);
            check('после отпускания мыши карточка больше не «тащится»',
                !PC.state.cardDrag && !$('.tnpc-card').classList.contains('dragging'));
            return wait(600);
        })
        .then(function () {
            var PC = win.TnMgrPrintCards;
            var saved = get('tournaments/' + win.__tid2 + '/printScorecards') || {};
            check('новое место карточки сохранено в дизайн турнира',
                !!saved.layout && Number(saved.layout.xMm) === Number(PC.state.draft.layout.xMm),
                JSON.stringify(saved.layout));
            check('ручка перетаскивания не попадает в печатный документ',
                // Имя класса есть в CSS печати (правило «скрыть»), а самой ручки быть не должно.
                PC.documentFor([(PC.state.draft.cards || [])[0]]).indexOf('class="tnpc-move"') === -1 &&
                PC.documentFor([(PC.state.draft.cards || [])[0]]).indexOf('data-tnpc-box-drag') === -1);
            return wait(40);
        })
        .then(function () {
            console.log('\nИтого: ' + total + ' проверок, ошибок: ' + fails);
            process.exit(fails ? 1 : 0);
        })
        .catch(function (err) {
            console.error('\nОШИБКА СЦЕНАРИЯ:', err && err.stack ? err.stack : err);
            console.log('\nИтого: ' + total + ' проверок, ошибок: ' + (fails + 1));
            process.exit(1);
        });
}

run();
