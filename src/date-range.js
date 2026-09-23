// ESM canonical date-range filter (moved out of utils.js).
// Mirrors js/date-range.js. Depends only on the foundation globals at call
// time: t()/currentLang (i18n), fmtDate() (format), escapeHtml() (dom).
// Exposes globals on window during the migration (see src/course-config.js).

// ==========================================
// ФИЛЬТР ПО ДАТАМ (общий для списков раундов)
// Период задаётся парой input[type=date]: «Дата с» включается с 00:00:00.000,
// «Дата по» — по 23:59:59.999 того же дня, чтобы вечерние раунды последнего
// дня периода тоже попадали в выборку.
// ==========================================
export var DATE_RANGE_PRESETS = ['today', '7d', '30d', 'month', 'year', 'all'];

export function dateInputToStartTs(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value === null || value === undefined ? '' : value).trim());
    if (!m) return null;
    var ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
    return isNaN(ts) ? null : ts;
}

export function dateInputToEndTs(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value === null || value === undefined ? '' : value).trim());
    if (!m) return null;
    var ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime();
    return isNaN(ts) ? null : ts;
}

// Timestamp -> значение для input[type=date] в локальной таймзоне пользователя.
export function tsToDateInputValue(ts) {
    if (!ts) return '';
    var d = new Date(ts), mo = d.getMonth() + 1, da = d.getDate();
    return d.getFullYear() + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
}

// Дата раунда для фильтра: время старта, а у старых записей без startTime — создание.
export function getRoundFilterTs(r) {
    if (!r || typeof r !== 'object') return 0;
    return Number(r.startTime) || Number(r.createdAt) || 0;
}

// Быстрые пресеты периода. 'all' — пустые границы (без ограничения).
export function datePresetRange(presetId) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var from = null;
    if (presetId === 'today') from = today;
    else if (presetId === '7d') from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    else if (presetId === '30d') from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    else if (presetId === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);
    else if (presetId === 'year') from = new Date(today.getFullYear(), 0, 1);
    if (!from) return { from: '', to: '' };
    return { from: tsToDateInputValue(from.getTime()), to: tsToDateInputValue(today.getTime()) };
}

// Текущее состояние фильтра: границы в мс + признак некорректного ввода.
export function readDateRange(fromEl, toEl) {
    var fromValue = fromEl ? (fromEl.value || '') : '';
    var toValue = toEl ? (toEl.value || '') : '';
    var from = fromValue ? dateInputToStartTs(fromValue) : null;
    var to = toValue ? dateInputToEndTs(toValue) : null;
    var invalid = (from !== null && to !== null && from > to);
    return {
        from: from, to: to, fromValue: fromValue, toValue: toValue,
        invalid: invalid,
        active: !invalid && (from !== null || to !== null)
    };
}

// Фильтрация пар [id, round] по периоду. Раунды без даты в выборку не попадают.
export function filterEntriesByDateRange(entries, range) {
    if (!range || !range.active) return entries.slice();
    return entries.filter(function(e) {
        var ts = getRoundFilterTs(e && e[1]);
        if (!ts) return false;
        if (range.from !== null && ts < range.from) return false;
        if (range.to !== null && ts > range.to) return false;
        return true;
    });
}

// Сводка «сколько раундов за период» над списком.
export function renderRoundsPeriodSummary(el, range, count, total) {
    if (!el) return;
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var html = '<i class="fas fa-calendar-check"></i> ';
    if (range && range.active) {
        var fromTxt = range.from !== null ? fmtDate(range.from) : (isEn ? 'the beginning' : 'с начала');
        var toTxt = range.to !== null ? fmtDate(range.to) : (isEn ? 'today' : 'сегодня');
        html += '<span class="rs-period">' + escapeHtml(fromTxt + ' — ' + toTxt) + '</span>' +
                '<span class="rs-sep">·</span>' + t('rounds_found_label') + ': <b>' + count + '</b>';
        if (typeof total === 'number' && total !== count) {
            html += ' <span class="rs-dim">' + (isEn ? 'of' : 'из') + ' ' + total + '</span>';
        }
    } else {
        html += t('rounds_total_label') + ': <b>' + count + '</b>';
    }
    el.innerHTML = html;
}

export var dateRangeFilters = Object.create(null);

// Подключение виджета «дата с / дата по» к списку.
// cfg: { key, fromId, toId, presetsId, resetId, hintId, summaryId, onChange }
export function initDateRangeFilter(cfg) {
    if (!cfg) return null;
    var fromEl = document.getElementById(cfg.fromId);
    var toEl = document.getElementById(cfg.toId);
    if (!fromEl || !toEl) return null;
    var presetsEl = cfg.presetsId ? document.getElementById(cfg.presetsId) : null;
    var resetEl = cfg.resetId ? document.getElementById(cfg.resetId) : null;
    var hintEl = cfg.hintId ? document.getElementById(cfg.hintId) : null;
    var storeKey = 'pestovo_date_filter_' + cfg.key;

    function persist() {
        try {
            localStorage.setItem(storeKey, JSON.stringify({ from: fromEl.value || '', to: toEl.value || '' }));
        } catch (e) { console.warn("[silent]", e); }
    }

    // Какой пресет соответствует текущим границам ('' — произвольный период).
    function activePreset() {
        var r = readDateRange(fromEl, toEl);
        if (!r.fromValue && !r.toValue) return 'all';
        for (var i = 0; i < DATE_RANGE_PRESETS.length; i++) {
            var p = DATE_RANGE_PRESETS[i];
            if (p === 'all') continue;
            var pr = datePresetRange(p);
            if (pr.from === r.fromValue && pr.to === r.toValue) return p;
        }
        return '';
    }

    function renderPresets() {
        if (!presetsEl) return;
        var active = activePreset();
        presetsEl.innerHTML = DATE_RANGE_PRESETS.map(function(p) {
            return '<button type="button" class="date-chip' + (active === p ? ' active' : '') +
                   '" data-preset="' + p + '">' + t('date_preset_' + p) + '</button>';
        }).join('');
    }

    // Не даём выбрать «с» позже «по» прямо в нативном календаре.
    function syncMinMax() {
        if (toEl.value) fromEl.setAttribute('max', toEl.value); else fromEl.removeAttribute('max');
        if (fromEl.value) toEl.setAttribute('min', fromEl.value); else toEl.removeAttribute('min');
    }

    function updateHint() {
        var invalid = readDateRange(fromEl, toEl).invalid;
        fromEl.classList.toggle('is-invalid', invalid);
        toEl.classList.toggle('is-invalid', invalid);
        if (hintEl) {
            hintEl.textContent = invalid ? t('date_filter_invalid') : '';
            hintEl.classList.toggle('hidden', !invalid);
        }
    }

    function fire() {
        updateHint();
        if (typeof cfg.onChange === 'function') cfg.onChange(api.getRange());
    }

    var api = {
        key: cfg.key,
        getRange: function() { return readDateRange(fromEl, toEl); },
        renderPresets: renderPresets,
        lastSummary: null,
        renderSummary: function(count, total) {
            api.lastSummary = { count: count, total: total };
            renderRoundsPeriodSummary(cfg.summaryId ? document.getElementById(cfg.summaryId) : null, api.getRange(), count, total);
        },
        rerenderSummary: function() {
            if (api.lastSummary) api.renderSummary(api.lastSummary.count, api.lastSummary.total);
        }
    };

    // Возвращаем прошлый период после перезагрузки страницы.
    try {
        var saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
        if (saved && typeof saved === 'object') {
            if (saved.from) fromEl.value = saved.from;
            if (saved.to) toEl.value = saved.to;
        }
    } catch (e) { console.warn("[silent]", e); }

    fromEl.addEventListener('change', function() { syncMinMax(); persist(); renderPresets(); fire(); });
    toEl.addEventListener('change', function() { syncMinMax(); persist(); renderPresets(); fire(); });

    if (presetsEl) {
        presetsEl.addEventListener('click', function(e) {
            var btn = e.target && e.target.closest ? e.target.closest('.date-chip') : null;
            var preset = btn && btn.getAttribute('data-preset');
            if (!preset) return;
            var r = datePresetRange(preset);
            fromEl.value = r.from;
            toEl.value = r.to;
            syncMinMax();
            persist();
            renderPresets();
            fire();
        });
    }

    if (resetEl) {
        resetEl.addEventListener('click', function() {
            fromEl.value = '';
            toEl.value = '';
            syncMinMax();
            persist();
            renderPresets();
            fire();
        });
    }

    syncMinMax();
    renderPresets();
    updateHint();
    dateRangeFilters[api.key] = api;
    return api;
}

export function getDateRangeFilter(key) { return dateRangeFilters[key] || null; }

// Перерисовка подписей пресетов и сводки при смене языка (зовется из applyTranslations).
export function refreshDateRangeFilters() {
    Object.keys(dateRangeFilters).forEach(function(k) {
        var api = dateRangeFilters[k];
        if (!api) return;
        api.renderPresets();
        api.rerenderSummary();
    });
}

if (typeof window !== 'undefined') {
    Object.assign(window, { DATE_RANGE_PRESETS, dateInputToStartTs, dateInputToEndTs, tsToDateInputValue, getRoundFilterTs, datePresetRange, readDateRange, filterEntriesByDateRange, renderRoundsPeriodSummary, dateRangeFilters, initDateRangeFilter, getDateRangeFilter, refreshDateRangeFilters });
}
