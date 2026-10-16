#!/usr/bin/env node
/**
 * Счётные карточки на экранах ввода счёта — проверка без браузера:
 *   node tools/test-entry-scorecard.js
 *
 * 1) Настройки: значения по умолчанию, нормализация мусора, турнирные переопределения;
 * 2) 5 видов «Общей карточки» и 5 видов «Счётной карточки по лункам»: разметка,
 *    число ячеек, имена игроков, экранирование;
 * 3) Флаги показа (show.*) реально убирают элементы; маркер и расхождение;
 * 4) Выбор карточки: один игрок → по лункам, два и больше → общая; турнир переопределяет вид;
 * 5) Реалтайм: сохранённые настройки перерисовывают открытый хост карточки;
 * 6) Админка: черновик, отмена, сброс, превью без записи в базу, сохранение.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var storage = {};
var elements = {};

function el(tag, id) {
    var e = {
        tagName: (tag || 'div').toUpperCase(),
        id: id || '',
        innerHTML: '',
        textContent: '',
        style: {},
        attrs: {},
        children: [],
        classList: { add: function() {}, remove: function() {}, toggle: function() {}, contains: function() { return false; } },
        setAttribute: function(n, v) { this.attrs[n] = String(v); },
        getAttribute: function(n) { return this.attrs[n] === undefined ? null : this.attrs[n]; },
        appendChild: function(c) { this.children.push(c); return c; },
        removeChild: function() {},
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        addEventListener: function() {},
        removeEventListener: function() {},
        focus: function() {},
        blur: function() {},
        closest: function() { return null; },
        scrollIntoView: function() {},
        get isConnected() { return elements[this.id] === this; }
    };
    return e;
}

var sandbox = {
    console: console, Promise: Promise, Date: Date, Math: Math, JSON: JSON,
    Object: Object, Array: Array, String: String, Number: Number, Boolean: Boolean,
    RegExp: RegExp, Error: Error, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: function() { return 0; }, clearInterval: function() {},
    currentLang: 'ru', currentUser: null, currentUserData: null,
    navigator: { userAgent: 'node-test', platform: 'node', maxTouchPoints: 0, language: 'ru' },
    location: { origin: 'https://example.test', pathname: '/setup-round.html', href: 'https://example.test/setup-round.html', search: '', hash: '' },
    localStorage: {
        getItem: function(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
        setItem: function(k, v) { storage[k] = String(v); },
        removeItem: function(k) { delete storage[k]; }
    },
    sessionStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
    toast: function() {}, confirm: function() { return true; }, alert: function() {},
    requestAnimationFrame: function(fn) { fn(0); return 0; },
    matchMedia: function() { return { matches: false, addListener: function() {}, removeListener: function() {}, addEventListener: function() {} }; },
    Image: function() { this.src = ''; }
};
sandbox.document = {
    documentElement: el('html'),
    body: el('body'),
    head: el('head'),
    activeElement: null,
    addEventListener: function() {},
    removeEventListener: function() {},
    getElementById: function(id) {
        if (!elements[id]) elements[id] = el('div', id);
        return elements[id];
    },
    querySelector: function() { return null; },
    querySelectorAll: function() { return []; },
    getElementsByTagName: function() { return []; },
    createElement: function(t) { return el(t); },
    createTextNode: function(t) { return { text: t }; }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.db = undefined;

var ctx = vm.createContext(sandbox);
function load(file) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
}
['js/ui-events.js', 'js/course-config.js', 'js/date-range.js', 'js/dom.js', 'js/format.js', 'js/i18n.js', 'js/utils.js',
    'js/entry-scorecard.js', 'js/admin-entry-scorecard.js'].forEach(load);

var run = function(code) { return vm.runInContext(code, ctx); };

var total = 0, fails = 0;
function check(title, ok, extra) {
    total++;
    if (!ok) fails++;
    console.log((ok ? ' ok  ' : 'FAIL ') + '| ' + title + (ok || !extra ? '' : '  (' + extra + ')'));
}
function count(hay, needle) { return String(hay).split(needle).length - 1; }

// Тестовый раунд: 18 лунок; первые игроки начали ввод, один с маркером.
function makeRound(playerCount, opts) {
    opts = opts || {};
    var names = ['Анна Смирнова', 'Иван Кузнецов', 'Пётр Орлов', 'Ольга Белова'];
    var players = {};
    for (var i = 0; i < playerCount; i++) {
        var scores = {};
        var played = i === 0 ? 7 : 5 + i;
        for (var h = 1; h <= played; h++) scores[h] = Math.max(1, run('holePar')(h) + ((h + i) % 3) - 1);
        players['p' + i] = { name: names[i], tee: ['wh', 'bl', 'rd', 'wh'][i], fieldHcp: 10 + i * 4, exactHcp: 10 + i * 4, scores: scores };
    }
    if (opts.marker && players.p0) {
        var mk = {};
        Object.keys(players.p0.scores).forEach(function(k) { mk[k] = players.p0.scores[k]; });
        mk[3] = (mk[3] || 1) + 1; // расхождение на 3-й лунке
        players.p0.markedBy = 'p1';
        players.p0.markerScores = { p1: mk };
    }
    return { name: 'Тест', status: 'active', holeRange: '1-18', startHole: 1, tee: 'wh', format: 'Stroke Play', players: players, tournamentId: opts.tournamentId || undefined };
}

function holeCard(round, cfg, opts) {
    var pid = 'p0';
    return run('entryScHoleHTML')(round.players[pid], round, Object.assign({ playerId: pid, showMarker: true }, opts || {}), cfg);
}
function groupCard(round, cfg, n) {
    var entries = Object.keys(round.players).slice(0, n || 3).map(function(k) { return [k, round.players[k]]; });
    return run('entryScGroupHTML')(round, entries, run('getRoundOrder')(round), { showMarker: true }, cfg);
}
function cfgOf(variant, size, show) {
    var kind = arguments[3] || 'general';
    var base = run('normalizeEntryScorecardSettings')(null)[kind];
    return { variant: variant, size: size || 'm', show: Object.assign({}, base.show, show || {}) };
}

async function main() {
    // ── 1. Настройки ───────────────────────────────────────────────────────
    var def = run('normalizeEntryScorecardSettings')(null);
    check('по умолчанию: вид 1, размер m', def.general.variant === '1' && def.general.size === 'm' && def.hole.variant === '1' && def.hole.size === 'm');
    check('по умолчанию: все элементы показаны', Object.keys(def.hole.show).every(function(k) { return def.hole.show[k] === true; }) && Object.keys(def.general.show).every(function(k) { return def.general.show[k] === true; }));
    check('по умолчанию: турнирных переопределений нет', def.tournament.general === null && def.tournament.hole === null);

    var bad = run('normalizeEntryScorecardSettings')({ general: { variant: '9', size: 'xl', show: { totals: false, unknown: false } }, hole: { variant: 5, size: 's' }, tournament: { general: '3', hole: 'abc' } });
    check('мусор: вид 9 → 1, размер xl → m', bad.general.variant === '1' && bad.general.size === 'm');
    check('show.totals=false сохраняется, неизвестный ключ отбрасывается', bad.general.show.totals === false && bad.general.show.unknown === undefined);
    check('hole.variant число 5 → "5", размер s', bad.hole.variant === '5' && bad.hole.size === 's');
    check('турнир: general=3 сохраняется, hole=abc → null', bad.tournament.general === '3' && bad.tournament.hole === null);

    // ── 2. Виды карточек: разметка и число ячеек ──────────────────────────
    var round = makeRound(3);
    var variants = ['1', '2', '3', '4', '5'];
    variants.forEach(function(v) {
        var html = holeCard(round, cfgOf(v, 'm', null, 'hole'));
        check('счётная карточка: вид ' + v + ' — класс esc-hole esc-v' + v,
            html.indexOf('class="esc esc-hole esc-v' + v + ' esc-sz-m"') !== -1);
        check('счётная карточка: вид ' + v + ' — 18 лунок', count(html, 'data-sc-hole="') === 18, 'найдено ' + count(html, 'data-sc-hole="'));
        check('счётная карточка: вид ' + v + ' — имя игрока', html.indexOf('Анна') !== -1 || html.indexOf('Анна Смирнова') !== -1);
    });
    variants.forEach(function(v) {
        var html = groupCard(round, cfgOf(v, 'm', null, 'general'), 3);
        check('общая карточка: вид ' + v + ' — класс esc-general esc-v' + v,
            html.indexOf('class="esc esc-general esc-v' + v + ' esc-sz-m"') !== -1);
        check('общая карточка: вид ' + v + ' — 18 лунок у каждого из 3 игроков', count(html, 'data-sc-hole="') === 54, 'найдено ' + count(html, 'data-sc-hole="'));
        check('общая карточка: вид ' + v + ' — все три игрока в карточке',
            html.indexOf('Анна') !== -1 && html.indexOf('Иван') !== -1 && html.indexOf('Пётр') !== -1);
    });

    // ── 3. Размеры и экранирование ─────────────────────────────────────────
    check('размер s/m/l → класс esc-sz-*', ['s', 'm', 'l'].every(function(s) {
        return holeCard(round, cfgOf('1', s, null, 'hole')).indexOf('esc-sz-' + s) !== -1;
    }));
    var xss = makeRound(1);
    xss.players.p0.name = '<img src=x onerror=alert(1)>';
    var xssHtml = holeCard(xss, cfgOf('1', 'm', null, 'hole'));
    check('имя экранируется: тега <img> в разметке нет', xssHtml.indexOf('<img') === -1 && xssHtml.indexOf('&lt;img') !== -1);

    // ── 4. Флаги показа ────────────────────────────────────────────────────
    var noTotals = cfgOf('1', 'm', { totals: false, subtotal: false }, 'general');
    var gNo = groupCard(round, noTotals, 3);
    check('общая: totals=false и subtotal=false → нет итоговой строки и блоков', gNo.indexOf('esc-gtot') === -1 && gNo.indexOf('esc-gsub') === -1);
    var gYes = groupCard(round, cfgOf('1', 'm', null, 'general'), 3);
    check('общая: по умолчанию есть итоговая строка и подытоги', gYes.indexOf('esc-gtot') !== -1 && gYes.indexOf('esc-gsub') !== -1);

    var hNoMarker = holeCard(round, cfgOf('1', 'm', { marker: false }, 'hole'));
    check('счётная: marker=false → нет строки маркера', hNoMarker.indexOf('esc-mk') === -1 && hNoMarker.indexOf('esc-tr-m') === -1);
    var hYesMarker = holeCard(round, cfgOf('1', 'm', null, 'hole'));
    check('счётная: marker=true и showMarker → строка маркера есть', hYesMarker.indexOf('esc-tr-m') !== -1);

    var markRound = makeRound(2, { marker: true });
    var mmOn = holeCard(markRound, cfgOf('1', 'm', null, 'hole'));
    check('расхождение с маркером подсвечивается (esc-mm, cell-mismatch)', mmOn.indexOf('esc-mm') !== -1 && mmOn.indexOf('cell-mismatch') !== -1);
    var mmOff = holeCard(markRound, cfgOf('1', 'm', { mismatch: false }, 'hole'));
    check('mismatch=false → подсветки нет', mmOff.indexOf('esc-mm') === -1 && mmOff.indexOf('cell-mismatch') === -1);

    var curOn = holeCard(round, cfgOf('1', 'm', null, 'hole'));
    check('текущая лунка отмечена (data-sc-current, esc-cur)', curOn.indexOf('data-sc-current="1"') !== -1 && curOn.indexOf('esc-cur') !== -1);
    var curOff = holeCard(round, cfgOf('1', 'm', { current: false }, 'hole'));
    check('current=false → текущая лунка не подсвечивается', curOff.indexOf('esc-cur') === -1);

    var legendOn = holeCard(round, cfgOf('1', 'm', null, 'hole'));
    var legendOff = holeCard(round, cfgOf('1', 'm', { legend: false }, 'hole'));
    check('legend=true + showMarker: подсказка в шапке (карточка длиннее, чем без неё)', legendOn.length > legendOff.length);
    check('legend=false → нет подсказки в шапке', legendOff.indexOf('gsg-legend') === -1 && legendOff.indexOf('dual-legend') === -1);

    // Полный перебор: все виды × размеры × все флаги выключены/включены — без исключений и без пустых карточек.
    var combosOk = true, combosCount = 0;
    ['general', 'hole'].forEach(function(kind) {
        variants.forEach(function(v) {
            ['s', 'm', 'l'].forEach(function(size) {
                [false, true].forEach(function(flag) {
                    var show = {};
                    run('ENTRY_SC_SHOW_KEYS')[kind].forEach(function(k) { show[k] = flag; });
                    var cfg = cfgOf(v, size, show, kind);
                    var html;
                    try {
                        html = kind === 'hole' ? holeCard(round, cfg) : groupCard(makeRound(4, { marker: true }), cfg, 4);
                    } catch (e) { combosOk = false; console.log('  исключение: ' + kind + '/' + v + '/' + size + '/' + flag + ': ' + e.message); return; }
                    combosCount++;
                    if (!html || html.indexOf('esc-v' + v) === -1) combosOk = false;
                });
            });
        });
    });
    check('все 60 комбинаций (2 вида × 5 видов × 3 размера × вкл/выкл элементы) рендерятся', combosOk && combosCount === 60, 'отрисовано ' + combosCount);

    // ── 5. Выбор карточки и турнир ─────────────────────────────────────────
    var one = makeRound(1);
    var two = makeRound(2);
    var picked1 = run('pestovoEntryRoundCardHTML')(one, { showMarker: true });
    var picked2 = run('pestovoEntryRoundCardHTML')(two, { showMarker: true });
    check('один игрок → счётная карточка по лункам', picked1.indexOf('esc-hole') !== -1 && picked1.indexOf('esc-general') === -1);
    check('два игрока → общая карточка', picked2.indexOf('esc-general') !== -1 && picked2.indexOf('esc-hole') === -1);
    check('пустой раунд → пустая строка', run('pestovoEntryRoundCardHTML')({ players: {} }, {}) === '');

    run('setEntryScorecardSettings')({ general: { variant: '2' }, hole: { variant: '3' }, tournament: { general: '5', hole: '4' } });
    check('вне турнира берётся вид из обычных настроек', run('entryScResolve')('hole', one).variant === '3' && run('entryScResolve')('general', two).variant === '2');
    var tnRound = makeRound(1, { tournamentId: 'T-1' });
    check('турнирный раунд: переопределение вида (hole=4)', run('entryScResolve')('hole', tnRound).variant === '4');
    check('турнирный раунд: переопределение вида (general=5)', run('entryScResolve')('general', makeRound(2, { tournamentId: 'T-1' })).variant === '5');
    var tnNoOverride = run('setEntryScorecardSettings')({ hole: { variant: '2' }, tournament: { hole: null } });
    check('переопределение null → как в обычном раунде', run('entryScResolve')('hole', tnRound).variant === '2' && tnNoOverride.tournament.hole === null);
    run('setEntryScorecardSettings')(null);

    // ── 6. Реалтайм: хост перерисовывается без перезагрузки ─────────────────
    var host = el('div', 'host-test');
    elements['host-test'] = host; // фейковый DOM: хост должен быть «подключён»
    run('pestovoEntryCardsInto')(host, function() { return run('pestovoEntryRoundCardHTML')(one, { showMarker: true }); });
    check('хост получил карточку', host.innerHTML.indexOf('esc-hole esc-v1') !== -1);
    run('setEntryScorecardSettings')({ hole: { variant: '5', size: 'l' } });
    check('после сохранения настроек хост перерисован (вид 5, размер l)', host.innerHTML.indexOf('esc-hole esc-v5 esc-sz-l') !== -1);
    check('повторная регистрация того же хоста не дублирует его в реестре',
        run('(function(){ var n = entryScHosts.length; pestovoEntryCardsInto(entryScHosts[0], function(){ return "x"; }); return entryScHosts.length === n; })()') === true);
    run('setEntryScorecardSettings')(null);
    check('сброс настроек → вид 1, размер m', run('getEntryScorecardSettings')().hole.variant === '1');

    // ── 7. Админка: черновик, превью, сохранение ───────────────────────────
    var writes = [];
    var failNext = false;
    sandbox.db = {
        ref: function(p) {
            return {
                set: function(v) {
                    writes.push({ path: p, value: v });
                    return failNext ? Promise.reject(new Error('denied')) : Promise.resolve();
                }
            };
        }
    };
    var root = sandbox.document.getElementById('esc-admin-root');
    run('renderEntryScorecardAdmin')();
    check('админка: 5 видов в обычном раунде', count(root.innerHTML, 'class="esc-var-btn') === 5);
    check('админка: превью есть и содержит карточку по умолчанию (esc-general esc-v1)', root.innerHTML.indexOf('esc-general esc-v1') !== -1);
    check('админка: без изменений нет плашки «несохранённые»', root.innerHTML.indexOf('Есть несохранённые') === -1);

    run('entryScAdmSetVariant')('3');
    check('черновик: вид 3 выбран, в превью общая карточка вида 3', root.innerHTML.indexOf('esc-general esc-v3') !== -1);
    check('черновик: изменения помечены как несохранённые', root.innerHTML.indexOf('Есть несохранённые') !== -1);
    check('черновик: настройки не записаны, в базу ничего не ушло', writes.length === 0 && run('getEntryScorecardSettings')().general.variant === '1');

    run('entryScAdmSetKind')('hole');
    run('entryScAdmSetSize')('l');
    run('entryScAdmToggle')('marker', false);
    check('счётная карточка: размер l и показ маркера выключен в превью', root.innerHTML.indexOf('esc-sz-l') !== -1 && count(root.innerHTML, 'esc-tr-m') === 0);
    check('счётная карточка: 5 видов', count(root.innerHTML, 'class="esc-var-btn') === 5);
    check('превью по умолчанию без записи в БД', writes.length === 0);

    run('entryScAdmCancel')();
    check('отмена возвращает черновик к сохранённым настройкам', run('entryScAdmIsDirty')() === false && run('getEntryScorecardSettings')().hole.size === 'm');

    run('entryScAdmSetCtx')('tournament');
    run('entryScAdmSetKind')('general');
    run('entryScAdmSetVariant')('4');
    check('турнирный ввод: превью использует турнирный вид 4', root.innerHTML.indexOf('esc-general esc-v4') !== -1);
    check('турнирный ввод: обычный вид не меняется в превью', root.innerHTML.indexOf('esc-general esc-v3') === -1);
    run('entryScAdmSetVariant')(null);
    check('турнирный ввод: «как в обычном раунде» → превью по обычному виду', root.innerHTML.indexOf('esc-general esc-v1') !== -1);
    run('entryScAdmSetCtx')('round');

    run('entryScAdmResetDefaults')();
    check('сброс в черновике: значения по умолчанию, в базу не пишем',
        run('JSON.stringify(entryScAdmDraft)') === run('JSON.stringify(normalizeEntryScorecardSettings(null))') && writes.length === 0);
    run('entryScAdmCancel')();

    // Сохранение: успех
    run('entryScAdmSetVariant')('2');
    run('entryScAdmSetKind')('general');
    run('entryScAdmSetVariant')('2');
    run('entryScAdmSave')();
    await new Promise(function(r) { setTimeout(r, 5); });
    check('сохранение пишет в settings/entry_scorecard_display', writes.length === 1 && writes[0].path === 'settings/entry_scorecard_display');
    check('сохранённое значение нормализовано и содержит вид 2', writes[0] && writes[0].value.general.variant === '2' && writes[0].value.hole.size === 'm');
    check('после сохранения локальный кэш и черновик совпадают', run('getEntryScorecardSettings')().general.variant === '2' && run('entryScAdmIsDirty')() === false);
    check('статус: «Настройки сохранены»', root.innerHTML.indexOf('Настройки сохранены') !== -1);

    // Сохранение: отказ базы
    failNext = true;
    run('entryScAdmSetVariant')('5');
    run('entryScAdmSave')();
    await new Promise(function(r) { setTimeout(r, 5); });
    check('отказ базы: сообщение об ошибке, локальные настройки не изменены',
        root.innerHTML.indexOf('Не удалось сохранить') !== -1 && run('getEntryScorecardSettings')().general.variant === '2');
    failNext = false;
    run('entryScAdmCancel')();

    // Нет соединения с базой
    var savedDb = sandbox.db;
    sandbox.db = undefined;
    run('entryScAdmSetVariant')('4');
    run('entryScAdmSave')();
    check('нет базы: понятное сообщение, запись не выполняется', root.innerHTML.indexOf('Нет соединения с базой') !== -1 && writes.length === 2);
    sandbox.db = savedDb;
    run('entryScAdmCancel')();

    // Превью со сломанным маркером: в демо-данных видно расхождение
    run('renderEntryScorecardAdmin')();
    check('превью админки: демо-маркер даёт подсветку расхождения', root.innerHTML.indexOf('esc-mm') !== -1);

    // Черновик follows внешние настройки, пока админ ничего не правил; правки не затираются.
    run('setEntryScorecardSettings')(null);
    run('renderEntryScorecardAdmin')();
    run('setEntryScorecardSettings')({ general: { variant: '4' } });
    check('чистый черновик следует за входящими настройками (general=4)', run('entryScAdmDraft').general.variant === '4');
    run('entryScAdmSetVariant')('2');
    run('setEntryScorecardSettings')({ general: { variant: '5' }, hole: { variant: '3' } });
    check('несохранённые правки не затираются входящими настройками', run('entryScAdmDraft').general.variant === '2');
    check('входящие настройки при этом сохранены и видны в кэше', run('getEntryScorecardSettings')().general.variant === '5');
    run('entryScAdmCancel')();
    check('отмена возвращает черновик к актуальным сохранённым настройкам', run('entryScAdmDraft').general.variant === '5');
    run('setEntryScorecardSettings')(null);

    console.log('\n' + (total - fails) + '/' + total + ' проверок пройдено' + (fails ? ', ошибок: ' + fails : ''));
    if (fails) process.exit(1);
}

main().catch(function(e) {
    console.error('FAIL | исключение:', e && e.stack ? e.stack : e);
    process.exit(1);
});
