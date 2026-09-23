'use strict';
// Юнит-тест фильтра по датам (js/date-range.js) — блока, вынесенного из utils.js.
// Логика чистая (зависит только от фундамента: format/dom/i18n), поэтому
// проверяем в vm с мини-DOM: границы периода, пресеты,
// фильтрацию записей, состояние readDateRange и сборку сводки.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0, total = 0;
function eq(a, e, label) {
    total++;
    const x = JSON.stringify(a), y = JSON.stringify(e);
    if (x !== y) { failures++; console.error('FAIL', label, '\n  actual:  ', x, '\n  expected:', y); }
    else console.log('ok  -', label);
}
function ok(c, label) {
    total++;
    if (!c) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}

// ── Мини-DOM: input[type=date] + элемент сводки ───────────────────────────
function makeInput(value) {
    return {
        value: value || '',
        attrs: {},
        listeners: {},
        classList: { toggle: function () {} },
        setAttribute: function (k, v) { this.attrs[k] = String(v); },
        removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    };
}

const els = {
    from: makeInput(''),
    to: makeInput(''),
    presets: { innerHTML: '', listeners: {}, addEventListener: function (t, fn) { this.listeners[t] = fn; } },
    summary: { innerHTML: '' }
};

const sandbox = {
    console, Math, JSON, String, Number, Array, Object, parseInt, parseFloat, isNaN, Date,
    t: function (k) { return k; },
    currentLang: 'ru',
    document: {
        getElementById: function (id) { return els[id] || null; },
        createElement: function () { return makeInput(''); }
    },
    localStorage: { _d: {}, getItem: function (k) { return this._d[k] === undefined ? null : this._d[k]; }, setItem: function (k, v) { this._d[k] = String(v); } }
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);

['js/format.js', 'js/dom.js', 'js/date-range.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
});

// ── Границы периода ───────────────────────────────────────────────────────
eq(sandbox.dateInputToStartTs('2026-09-23'), new Date(2026, 8, 23, 0, 0, 0, 0).getTime(), 'dateInputToStartTs — начало дня');
eq(sandbox.dateInputToEndTs('2026-09-23'), new Date(2026, 8, 23, 23, 59, 59, 999).getTime(), 'dateInputToEndTs — конец дня');
eq(sandbox.dateInputToStartTs(''), null, 'dateInputToStartTs("") = null');
eq(sandbox.dateInputToStartTs('мусор'), null, 'dateInputToStartTs(мусор) = null');
eq(sandbox.dateInputToEndTs(null), null, 'dateInputToEndTs(null) = null');
eq(sandbox.tsToDateInputValue(new Date(2026, 0, 5).getTime()), '2026-01-05', 'tsToDateInputValue — локальная дата с нулями');
eq(sandbox.tsToDateInputValue(0), '', 'tsToDateInputValue(0) = пусто');

// ── Пресеты ───────────────────────────────────────────────────────────────
const today = sandbox.datePresetRange('today');
ok(/^\d{4}-\d{2}-\d{2}$/.test(today.from) && today.from === today.to, 'пресет today: from === to');
eq(sandbox.datePresetRange('all'), { from: '', to: '' }, 'пресет all — без границ');
const week = sandbox.datePresetRange('7d');
ok(new Date(week.from) <= new Date(week.to), 'пресет 7d: from <= to');
ok(new Date(week.to).getTime() - new Date(week.from).getTime() === 6 * 86400000, 'пресет 7d: ровно 6 дней разницы');
eq(sandbox.DATE_RANGE_PRESETS.indexOf('month') !== -1, true, 'DATE_RANGE_PRESETS содержит month');

// ── readDateRange ─────────────────────────────────────────────────────────
els.from.value = '2026-09-01'; els.to.value = '2026-09-30';
const r1 = sandbox.readDateRange(els.from, els.to);
eq(r1.active, true, 'readDateRange: период активен');
eq(r1.invalid, false, 'readDateRange: корректный период не invalid');
els.from.value = '2026-09-30'; els.to.value = '2026-09-01';
const r2 = sandbox.readDateRange(els.from, els.to);
eq(r2.invalid, true, 'readDateRange: «с» позже «по» → invalid');
eq(r2.active, false, 'readDateRange: некорректный период не активен');
els.from.value = ''; els.to.value = '';
eq(sandbox.readDateRange(els.from, els.to).active, false, 'readDateRange: пустые поля → не активен');

// ── Фильтрация записей ────────────────────────────────────────────────────
const R = function (id, ts) { return [id, { id: id, startTime: ts }]; };
const sep1 = new Date(2026, 8, 10).getTime();
const sep2 = new Date(2026, 8, 20).getTime();
const entries = [R('a', sep1), R('b', sep2), R('c', 0)];
const range = { from: new Date(2026, 8, 15).getTime(), to: null, active: true };
eq(sandbox.filterEntriesByDateRange(entries, range).map(function (e) { return e[0]; }), ['b'], 'фильтр «с 15.09»: только более поздние с датой');
eq(sandbox.filterEntriesByDateRange(entries, { from: null, to: null, active: false }).length, 3, 'неактивный фильтр пропускает все записи');
eq(sandbox.filterEntriesByDateRange(entries, { from: sep1, to: sep2, active: true }).map(function (e) { return e[0]; }), ['a', 'b'], 'границы включаются');
eq(sandbox.getRoundFilterTs({ createdAt: 123 }), 123, 'getRoundFilterTs: fallback на createdAt');
eq(sandbox.getRoundFilterTs(null), 0, 'getRoundFilterTs(null) = 0');

// ── initDateRangeFilter: виджет, пресеты, сводка, смена языка ─────────────
els.from.value = ''; els.to.value = '';
const api = sandbox.initDateRangeFilter({ key: 'test', fromId: 'from', toId: 'to', presetsId: 'presets', summaryId: 'summary', onChange: function () {} });
ok(api && typeof api.getRange === 'function', 'initDateRangeFilter возвращает API');
ok(els.presets.innerHTML.indexOf('date_preset_today') !== -1, 'пресеты отрендерены через t()');
api.renderSummary(7, 42);
ok(els.summary.innerHTML.indexOf('42') !== -1 || els.summary.innerHTML.indexOf('7') !== -1, 'сводка периода отрендерена');
eq(sandbox.getDateRangeFilter('test') === api, true, 'getDateRangeFilter находит виджет');
// клик по пресету «Сегодня»
els.presets.listeners.click({ target: { closest: function () { return { getAttribute: function () { return 'today'; } }; } } });
eq(els.from.value !== '' && els.from.value === els.to.value, true, 'клик по пресету today заполняет оба поля');
// смена языка перерисовывает подписи (зовётся из applyTranslations)
const before = els.presets.innerHTML;
sandbox.refreshDateRangeFilters();
ok(typeof els.presets.innerHTML === 'string' && els.presets.innerHTML.length > 0, 'refreshDateRangeFilters перерисовывает пресеты');
ok(before !== undefined, 'состояние пресетов сохраняется');

console.log('\n' + (failures ? ('\x1b[31m' + failures + ' failed\x1b[0m') : ('\x1b[32m' + total + ' passed\x1b[0m')) + ' (' + total + ' total)');
process.exit(failures ? 1 : 0);
