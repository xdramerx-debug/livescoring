document.addEventListener('DOMContentLoaded', function() { 
    var routeParams = new URLSearchParams(window.location.search || '');
    lbFocusRoundId = routeParams.get('round') || '';
    // Карточки по умолчанию свёрнуты в шапку-сводку; тап по шапке
    // разворачивает/сворачивает детали. Ссылка ?round=<id> открывает
    // фокусную карточку развёрнутой (?scorecard=1 совместим — панель
    // счётной карточки видна сразу).
    if (lbFocusRoundId) lbFocusScrollPending = true;
    initNav();
    if (typeof applyLbTvMode === 'function') applyLbTvMode(); 
    // Фильтр по датам: «Дата с / Дата по» + быстрые пресеты периода.
    initDateRangeFilter({
        key: 'leaderboard',
        fromId: 'lb-date-from',
        toId: 'lb-date-to',
        presetsId: 'lb-date-presets',
        resetId: 'lb-date-reset',
        hintId: 'lb-date-hint',
        summaryId: 'lb-summary',
        onChange: function() { loadLB(); }
    });
    initLbChips();
    loadLB(); 
});

// ─────────────────────────────────────────────────────────────────
// v1.129.0 · ЧИПЫ БЫСТРЫХ ФИЛЬТРОВ И СОРТИРОВКА ТАБЛИЦЫ
// Чипы не вводят второй источник истины: «Live/Завершённые/Все» просто
// переставляют #lb-status (тот же фильтр, что и в форме), «Мой раунд» —
// дополнительное условие. Сортировка — только порядок строк на экране,
// места в таблице всегда считаются по счёту к пару.
// ─────────────────────────────────────────────────────────────────
var lbMineOnly = false;
var lbSortKey = 'toPar';
var lbSortDir = 'asc';

// Участвую ли я в раунде. Копия правила с главной (js/app.js), но без
// зависимости от app.js: страница «Все раунды» его не подключает.
function lbRoundIsMine(r) {
    if (!r) return false;
    try {
        if (typeof currentUser !== 'undefined' && currentUser) {
            if (r.createdBy === currentUser.uid) return true;
            if (r.players && r.players[currentUser.uid]) return true;
        }
    } catch (e) { console.warn('[silent]', e); }
    return false;
}

function initLbChips() {
    syncLbChips();
    var sortSel = lbGet('lb-sort');
    if (sortSel) sortSel.addEventListener('change', function () { lbSetSort(sortSel.value); });
    // Смена статуса в форме тоже должна сбрасывать «Мой раунд»: иначе два
    // фильтра складывались бы и список пустел без объяснения.
    var statusSel = lbGet('lb-status');
    if (statusSel) statusSel.addEventListener('change', function () {
        lbMineOnly = false;
        syncLbChips();
    });
}

function lbSetChip(value) {
    var sel = lbGet('lb-status');
    if (value === 'mine') {
        lbMineOnly = !lbMineOnly;
    } else {
        lbMineOnly = false;
        if (sel) sel.value = (value === 'all' || value === 'active' || value === 'completed') ? value : 'all';
    }
    try { if (typeof vib === 'function') vib(8); } catch (e) { console.warn('[silent]', e); }
    syncLbChips();
    loadLB();
}

function syncLbChips() {
    var sel = lbGet('lb-status');
    var status = sel ? sel.value : 'all';
    [['lb-chip-all', 'all'], ['lb-chip-live', 'active'], ['lb-chip-done', 'completed']].forEach(function (pair) {
        var btn = lbGet(pair[0]);
        if (btn) btn.setAttribute('aria-pressed', (!lbMineOnly && status === pair[1]) ? 'true' : 'false');
    });
    var mineBtn = lbGet('lb-chip-mine');
    if (mineBtn) mineBtn.setAttribute('aria-pressed', lbMineOnly ? 'true' : 'false');
    var sortSel = lbGet('lb-sort');
    if (sortSel) sortSel.value = lbSortKey + ':' + lbSortDir;
}

function lbSetSort(value) {
    var parts = String(value || '').split(':');
    if (!parts[0]) return;
    lbSortKey = parts[0];
    lbSortDir = parts[1] === 'desc' ? 'desc' : 'asc';
    syncLbChips();
    loadLB();
}

// Клик по заголовку столбца: первый клик — по возрастанию, повторный
// переключает направление. null-значения всегда внизу.
function lbSortBy(key) {
    if (!key) return;
    if (lbSortKey === key) lbSortDir = (lbSortDir === 'asc' ? 'desc' : 'asc');
    else { lbSortKey = key; lbSortDir = (key === 'stblField' || key === 'stblExact') ? 'desc' : 'asc'; }
    try { if (typeof vib === 'function') vib(8); } catch (e) { console.warn('[silent]', e); }
    syncLbChips();
    loadLB();
}

// Порядок строк. name — по алфавиту, остальные — по числу; пустые значения
// не всплывают наверх ни в одном направлении.
function lbCompareRows(a, b) {
    if (lbSortKey === 'name') {
        var an = String(a.name || '').toLowerCase();
        var bn = String(b.name || '').toLowerCase();
        return lbSortDir === 'desc' ? bn.localeCompare(an) : an.localeCompare(bn);
    }
    var av = a[lbSortKey];
    var bv = b[lbSortKey];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return lbSortDir === 'desc' ? (bv - av) : (av - bv);
}


function lbGet(id){ try{ return document.getElementById(id); }catch(e){ return null; } }

// ─────────────────────────────────────────────────────────────────
// ОГРАНИЧЕНИЕ ЧТЕНИЯ, А НЕ ТОЛЬКО ОТРИСОВКИ
// ─────────────────────────────────────────────────────────────────
// Раньше страница подписывалась на db.ref('rounds') целиком, а предел жил
// только в отрисовке: первые 50 строк и кнопка «Показать ещё». Каждое
// открытое табло выкачивало всю историю клуба и перерисовывалось на КАЖДОЕ
// сохранение лунки любым игроком (замер: 300 раундов → 26 638 DOM-узлов и
// 105 мс на обновление, docs/CODE-AUDIT-2026-10-2.md). Теперь предел — в
// самом запросе к Firebase:
//   • окно последних LB_WINDOW_SIZE раундов по createdAt (orderByChild +
//     limitToLast; индекс .indexOn["createdAt"] уже объявлен в правилах);
//   • плюс раунды в статусе active (их единицы) — живое табло не должно
//     терять идущую игру, даже если она старше окна;
//   • плюс точечная дочитка одного раунда для ссылки ?round=<id>.
var LB_WINDOW_SIZE = 100;
var LB_WINDOW_STEP = 100;
var lbWindowLimit = LB_WINDOW_SIZE;
var lbWindowCount = 0;        // сколько раундов пришло в окне чтения
var lbWindowData = {};        // окно: последние раунды по createdAt
var lbActiveData = {};        // раунды в статусе active
var lbRemoteRounds = {};      // точечно дочитанные (?round= вне окна)
var lbSubs = [];              // активные подписки [{ ref, handler }]
var lbFocusFetched = '';      // id раунда, для которого уже была дочитка
var lbLastData = {};          // последние данные для перерисовки без запроса

function lbUnsubscribeRounds() {
    lbSubs.forEach(function (sub) {
        try {
            if (sub && sub.ref && typeof sub.ref.off === 'function') sub.ref.off('value', sub.handler);
        } catch (e) { console.warn('[silent]', e); }
    });
    lbSubs = [];
}

// Склейка выборок: окно + активные + дочитанный фокусный раунд.
function lbMergedRounds() {
    var out = {};
    var merge = function (obj) {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach(function (id) { out[id] = obj[id]; });
    };
    merge(lbWindowData);
    merge(lbActiveData);
    merge(lbRemoteRounds);
    return out;
}

// Отдельные on('value') вместо bindRealtimeValue: у окна меняется предел
// (кнопка «Показать ещё из архива»), а шина кеширует подписку по ключу и
// второй предел уже не применила бы.
function lbSubscribeRounds() {
    lbUnsubscribeRounds();
    if (typeof db === 'undefined' || !db || typeof db.ref !== 'function') return;
    var base = db.ref('rounds');
    if (!base) return;
    var listen = function (ref, onData) {
        if (!ref || typeof ref.on !== 'function') return;
        var handler = function (sn) { onData((sn && sn.val) ? (sn.val() || {}) : {}); };
        ref.on('value', handler, function (error) { console.error('[Firebase] leaderboard-rounds:', error); });
        lbSubs.push({ ref: ref, handler: handler });
    };
    // Заглушки Firebase в тестах умеют не всё — тогда читаем как раньше
    // (тест на фокус подаёт готовые данные через bindRealtimeValue).
    if (typeof base.orderByChild !== 'function' || typeof base.limitToLast !== 'function') {
        if (typeof bindRealtimeValue === 'function') {
            bindRealtimeValue('leaderboard-rounds', base, function (sn) {
                lbHandleData((sn && sn.val) ? (sn.val() || {}) : {});
            });
        }
        return;
    }
    listen(base.orderByChild('createdAt').limitToLast(lbWindowLimit), function (data) {
        lbWindowData = data;
        lbWindowCount = Object.keys(data).length;
        lbHandleData(lbMergedRounds());
    });
    if (typeof base.equalTo === 'function') {
        listen(base.orderByChild('status').equalTo('active'), function (data) {
            lbActiveData = data;
            lbHandleData(lbMergedRounds());
        });
    }
}

// Расширение окна чтения: «Показать ещё» дошло до края загруженного.
function lbGrowWindow() {
    lbWindowLimit += LB_WINDOW_STEP;
    lbSubscribeRounds();
}

// ?round=<id> должен работать и для раунда вне окна: дочитываем ровно один
// узел. Возвращает true, если дочитка запущена (перерисуемся по её приходу).
function lbFetchFocusRound() {
    if (!lbFocusRoundId || lbFocusFetched === lbFocusRoundId) return false;
    if (typeof db === 'undefined' || !db || typeof db.ref !== 'function') return false;
    var ref = db.ref('rounds/' + lbFocusRoundId);
    if (!ref || typeof ref.once !== 'function') return false;
    lbFocusFetched = lbFocusRoundId;
    ref.once('value').then(function (sn) {
        var round = (sn && sn.val) ? sn.val() : null;
        if (round && typeof round === 'object') lbRemoteRounds[lbFocusRoundId] = round;
        lbHandleData(lbMergedRounds());
    }).catch(function (error) {
        console.error('[Firebase] leaderboard-round:', error);
        lbHandleData(lbMergedRounds());
    });
    return true;
}

function loadLB() {
    if (typeof db === 'undefined' || !db || typeof db.ref !== 'function') return;
    if (!lbSubs.length) {
        // Первая подписка: рендер придёт вместе со снапшотом. Заглушка
        // bindRealtimeValue (тесты) отрисует сохранённый снапшот сразу.
        lbSubscribeRounds();
        return;
    }
    // Фильтр/поиск/сортировка меняются без нового запроса: перерисовываем
    // уже загруженное окно.
    lbHandleData(lbLastData);
}

function lbHandleData(data) {
    lbLastData = data || {};
    var statusSelect = lbGet('lb-status');
    var status = statusSelect ? statusSelect.value : 'all';
    var searchInput = lbGet('lb-search');
    var query = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
    // Автозакрытие вчерашних незавершённых раундов («завершён автоматически»)
    if (typeof sweepStaleRounds === 'function') data = sweepStaleRounds(data) || {};
    // Раунды 'scheduled' — это будущие раунды ЕЩЁ НЕ СТАРТОВАВШЕГО
    // турнира (созданы из стартового протокола заранее). До начала
    // турнира на «Все раунды» их не показываем: раньше они виделись
    // со статусом «Завершён», хотя по сути ещё не существуют.
    var allEntries = Object.entries(data).filter(function(e) {
        if (!e || !e[1] || typeof e[1] !== 'object') return false;
        return String((e[1] || {}).status || 'active') !== 'scheduled';
    });
    var totalRounds = allEntries.length;
    var formatSelect = lbGet('lb-format');
    var selectedFormat = formatSelect ? formatSelect.value : '';
    var formats = Array.from(new Set(allEntries.map(function (entry) { return String(entry[1].format || 'Stroke Play'); }))).sort();
    if (formatSelect) {
        while (formatSelect.options.length > 1) formatSelect.remove(1);
        formatSelect.options[0].textContent = typeof currentLang !== 'undefined' && currentLang === 'en' ? 'All formats' : 'Все форматы';
        formats.forEach(function (format) { var option = document.createElement('option'); option.value = format; option.textContent = format; formatSelect.appendChild(option); });
        // Retain an active filter even when the realtime window no longer contains that format.
        if (selectedFormat && formats.indexOf(selectedFormat) === -1) {
            var activeOption = document.createElement('option'); activeOption.value = selectedFormat; activeOption.textContent = selectedFormat; formatSelect.appendChild(activeOption);
        }
        formatSelect.value = selectedFormat;
    }


    var dateFilter = (typeof getDateRangeFilter === 'function') ? getDateRangeFilter('leaderboard') : null;
    var range = dateFilter ? dateFilter.getRange() : { active: false, from: null, to: null, invalid: false };

    var entries;
    if (lbFocusRoundId) {
        // Завершив раунд, игрок должен увидеть именно его сохранённую карточку,
        // а не общий список. Фокусный ID имеет приоритет над старыми фильтрами
        // по датам, статусу и имени, оставшимися в браузере.
        var focusEntry = null;
        for (var fi = 0; fi < allEntries.length; fi++) {
            if (String(allEntries[fi][0]) === String(lbFocusRoundId)) { focusEntry = allEntries[fi]; break; }
        }
        entries = focusEntry ? [focusEntry] : [];
        // Раунда нет в окне (старая ссылка) — дочитываем ровно его один и
        // перерисовываемся, не показывая «Нет раундов» на полсекунды.
        if (!focusEntry && lbFetchFocusRound()) return;
    } else {
        entries = filterEntriesByDateRange(allEntries, range);
        if (selectedFormat) entries = entries.filter(function (entry) { return String(entry[1].format || 'Stroke Play') === selectedFormat; });
        if (status !== 'all') {
            entries = entries.filter(function(e) { return e[1].status === status; });
        }
        if (query) {
            entries = entries.filter(function(e) {
                var r = e[1];
                var players = Object.entries(r.players || {});
                return players.some(function(pe) { return (playerDisplayName(pe[1], pe[0]) || '').toLowerCase().includes(query); });
            });
        }
        if (lbMineOnly) {
            entries = entries.filter(function(e) { return lbRoundIsMine(e[1]); });
        }
    }

    var formatNote = lbGet('lb-format-note');
    if (formatNote) {
        var mixed = new Set(entries.map(function (entry) { return String(entry[1].format || 'Stroke Play'); })).size > 1;
        formatNote.hidden = !mixed;
        formatNote.textContent = typeof currentLang !== 'undefined' && currentLang === 'en'
            ? 'Different game formats are shown. Select a format in filters to compare like-for-like; this is not a combined ranking.'
            : 'Показаны разные форматы игры. Для сопоставимых результатов выберите формат в фильтрах; это не общий спортивный рейтинг.';
    }

    entries.sort(function(a, b) { 
        return (b[1].createdAt || 0) - (a[1].createdAt || 0); 
    });

    // Сводка: totalRounds — это загруженное окно, а не вся база. Если окно
    // упёрлось в предел, виджет пишет об этом прямым текстом.
    var lbWindowed = lbWindowCount > 0 && lbWindowCount >= lbWindowLimit;
    if (dateFilter) {
        dateFilter.renderSummary(entries.length, totalRounds,
            lbWindowed ? { windowed: true, limit: lbWindowLimit } : null);
    }

    var el = lbGet('lb-container');
    if (!el) return;
    if (!entries.length) {
        var langIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        var emptyText = range.active
            ? (langIsEn ? 'No rounds in the selected period' : 'Нет раундов за выбранный период')
            : (langIsEn ? 'No rounds found' : 'Нет раундов');
        try { el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>' + emptyText + '</p></div>'; } catch (e) { console.warn("[silent]", e); }
        return;
    }
    // Смена фильтра/фокуса сбрасывает окно отрисовки: «Показать ещё»
    // относится к конкретному срезу, а не к списку вообще.
    var lbSignature = [lbFocusRoundId, status, query, range.active, range.from, range.to, lbMineOnly, lbSortKey, lbSortDir].join('|');
    if (lbSignature !== lbRenderSignature) {
        lbRenderSignature = lbSignature;
        lbRenderLimit = LB_PAGE_SIZE;
    }

    var html = '';
    var visibleEntries = entries.slice(0, lbRenderLimit);
    try {
        visibleEntries.forEach(function(e) { try { html += renderRound(e[0], e[1]); } catch (err) { console.warn("[silent]", err); } });
    } catch (e) { console.warn("[silent]", e); }
    var lbHidden = entries.length - visibleEntries.length;
    // Кнопка нужна и тогда, когда всё загруженное уже на экране, но окно
    // чтения упёрлось в предел: иначе архив был бы недоступен вообще.
    if (lbHidden > 0 || lbWindowed) {
        var lbIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        html += '<div style="display:flex;justify-content:center;padding:14px 0;">' +
            '<button type="button" class="btn btn-o btn-sm" id="lb-show-more">' +
            escapeHtml(lbIsEn ? 'Show more' : 'Показать ещё') +
            (lbHidden > 0 ? ' (' + lbHidden + ')' : '') +
            '</button></div>';
    }
    var displayVariant = (typeof getAllRoundsDisplayVariant === 'function') ? getAllRoundsDisplayVariant() : '1';
    displayVariant = (displayVariant === '2' || displayVariant === '3') ? displayVariant : '1';
    try { el.innerHTML = '<div class="live-who-list rounds-layout-' + displayVariant + '" data-display-variant="' + displayVariant + '">' + html + '</div>'; } catch (e) { console.warn("[silent]", e); }
    var lbMoreBtn = el.querySelector('#lb-show-more');
    if (lbMoreBtn) {
        lbMoreBtn.addEventListener('click', function() {
            lbRenderLimit += LB_PAGE_SIZE;
            // На экране ещё есть непоказанные строки — просто рисуем их.
            // Строк больше нет, а окно полно — значит, тянем архив.
            if (lbHidden > 0) loadLB();
            else lbGrowWindow();
        });
    }
    try { syncLbChips(); } catch (e) { console.warn("[silent]", e); }
    if (lbFocusScrollPending && lbFocusRoundId) {
        var focusRows = el.querySelectorAll('.lb-row[data-round-id]');
        var focusNode = null;
        for (var focusIndex = 0; focusIndex < focusRows.length; focusIndex++) {
            if (focusRows[focusIndex].getAttribute('data-round-id') === String(lbFocusRoundId)) {
                focusNode = focusRows[focusIndex];
                break;
            }
        }
        if (focusNode) {
            lbFocusScrollPending = false;
            setTimeout(function () {
                if (focusNode && typeof focusNode.scrollIntoView === 'function') focusNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 80);
        }
    }
}

// ==========================================
// Список раундов: каждая карточка сразу развёрнута — таблица результатов,
// действия и счётная карточка видны сразу, без сворачивания/разворачивания.
// ==========================================
var lbRoundsById = {};
var lbFocusRoundId = '';
var lbFocusScrollPending = false;

// Постраничная отрисовка. Замер 2026-10 (docs/CODE-AUDIT-2026-10-2.md,
// находка 5): 300 раундов = 26 638 DOM-узлов, 191 мс на первый рендер и 105 мс
// на КАЖДОЕ обновление /rounds — то есть на каждое сохранение лунки любым
// игроком у каждого открытого табло. Полный список физически не нужен: экран
// показывает первые строки, остальное открывается кнопкой.
var LB_PAGE_SIZE = 50;
var lbRenderLimit = LB_PAGE_SIZE;
var lbRenderSignature = '';

// Легенда цветных меток результата: круг — под пар, квадрат — над пар,
// двойная рамка — игл/дабл. Только визуальный ключ к цифрам в кольцах.
function lbMarksLegendHTML() {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    // Третий элемент — образец цифры в метке (как в счётной карточке).
    var items = [
        ['r-eag', 'res_eagle', '3'],
        ['r-bir', 'res_birdie', '3'],
        ['r-par', 'res_par', '4'],
        ['r-bog', 'res_bogey', '5'],
        ['r-dbl', 'res_double', '6']
    ];
    var html = '<div class="sc-marks-legend" role="note"><span class="sc-marks-title">' +
        (isEn ? 'Score marks' : 'Метки результата') + '</span>';
    items.forEach(function(it) {
        var label = it[1];
        try { if (typeof t === 'function') label = t(it[1]); } catch (e) { console.warn("[silent]", e); }
        html += '<span class="smk-item"><b class="sc-digit smk ' + it[0] + '" aria-hidden="true">' + it[2] + '</b>' + escapeHtml(label) + '</span>';
    });
    return html + '</div>';
}

// Содержимое панели счётной карточки: легенда меток + таблица лунок.
// Панель заполняется сразу при отрисовке карточки — сворачивания нет.
function lbScorecardPanelHTML(id, r) {
    if (typeof generateGroupHoleTableHTML !== 'function') return '';
    try {
        r.roundId = id;
        return lbMarksLegendHTML() + generateGroupHoleTableHTML(r, { compact: true });
    } catch (e) { console.warn("[silent]", e); return ''; }
}

// Точечное обновление панели по id (после смены настроек карточки).
function fillLbScorecardPanel(panelId, roundId) {
    var panel = document.getElementById(panelId);
    var r = lbRoundsById[roundId];
    if (!panel || !r) return;
    panel.innerHTML = lbScorecardPanelHTML(roundId, r);
}

function renderRound(id, r) {
    lbRoundsById[id] = r;
    var isLive = r.status === 'active';
    var rawPlayers = r.players || {};
    // Дедуп по ФИО, чтобы не было сдваивания игроков с одинаковыми именами
    var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(rawPlayers) : rawPlayers;
    var order = getRoundOrder(r);

    var list = Object.entries(players).filter(function(pe) {
        return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name));
    }).map(function(pe) {
        var pid = pe[0], p = pe[1], sc = p.scores || {};
        var pTee = (p && p.tee) || r.tee || 'wh';
        var stats = calcRoundStats(sc, p.fieldHcp || 0, p.exactHcp || 0, order);
        // Берди и иглы считаем из сохранённых счётов: это то, что игрок
        // хочет видеть в строке сразу, без раскрытия карточки.
        var birdies = 0, eagles = 0;
        // holePar приходит из бандла-модуля, поэтому на всякий случай
        // проверяем тип: если данных о лунках ещё нет, считаем пар = 4.
        var parOf = (typeof holePar === 'function') ? holePar : function () { return 4; };
        Object.keys(sc || {}).forEach(function (h) {
            var v = parseInt(sc[h], 10);
            if (!v || v < 1) return;
            var d = v - parOf(h);
            if (d <= -2) eagles++; else if (d === -1) birdies++;
        });
        return {
            pid: pid,
            name: p.name,
            firstName: p.firstName || '',
            lastName: p.lastName || '',
            middleName: p.middleName || '',
            tee: pTee,
            gross: stats.gross, 
            toPar: stats.toPar, 
            stblField: stats.stablefordField, 
            stblExact: stats.stablefordExact,
            holesPlayed: stats.holesPlayed, 
            holeCount: getRoundHoleCount(r),
            currentHole: stats.currentHole,
            birdies: birdies,
            eagles: eagles
        };
    });

    // Места считаются по счёту к пару — это правило игры, а не настройка
    // экрана. Сортировка меняет только порядок строк ниже.
    var placeList = list.slice().sort(function(a, b) {
        if (a.toPar === null && b.toPar === null) return 0;
        if (a.toPar === null) return 1;
        if (b.toPar === null) return -1;
        return a.toPar - b.toPar;
    });

    var pos = 1;
    placeList.forEach(function(p, i) {
        if (i > 0 && p.toPar === placeList[i - 1].toPar) { 
            p.position = placeList[i - 1].position; 
            p.tied = true; 
        } else { 
            p.position = pos; 
            p.tied = false; 
        }
        pos++;
    });

    // Порядок строк на экране: по выбранному столбцу (по умолчанию — как
    // раньше, по счёту к пару).
    list.sort(lbCompareRows);

    var isEn = currentLang === 'en';
    var stblShort = isEn ? 'Pts' : 'Стб';
    // Заголовки столбцов короткие: длинные подписи переносились по буквам.
    var stblF = isEn ? 'Stb fld' : 'Стб пол';
    var stblE = isEn ? 'Stb exc' : 'Стб игр';

    // Сводка лучших результатов по раунду — для свёрнутой строки: в неё
    // игроки со своими бейджами не видны, пока раунд не раскрыт.
    var roundBirdies = 0, roundEagles = 0;

    // Одиночный раунд (1 игрок): таблица-лидерборд бессмысленна — показываем одну строку результата.
    var isSoloList = list.length <= 1;
    var rows = list.map(function(p) {
        roundBirdies += p.birdies || 0;
        roundEagles += p.eagles || 0;
        var posCls = p.position <= 3 ? 'lb-' + p.position : '';
        var isFin = typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(r, p.pid);
        var holeInfo = (isFin || p.holesPlayed >= (p.holeCount || 18)) ? 'F' : (p.currentHole ? (isEn ? 'Hole #' : 'лунка №') + p.currentHole : '—');
        var gross = p.gross || '—';
        var teeCode = pestovoNormalizeTeeCode(p.tee);
        var pTeeBadge = '<span class="tee-pill tee-' + teeCode + '" style="font-size:9.5px;padding:1px 7px;margin-left:6px;vertical-align:middle;">' + escapeHtml(pestovoTeeLabel(teeCode)) + '</span>';
        // Бейдж лучшего результата: игл важнее берди, поэтому он вытесняет
        // берди, а не выводится рядом (иначе строка превращается в свалку).
        // Текст дублируется в title и aria-label: цвет — не единственный носитель.
        var bestBadge = '';
        if (p.eagles) {
            bestBadge = '<span class="pv-badge pv-badge--eagle" title="' + escapeHtml(t('res_eagle')) + ': ' + p.eagles + '" aria-label="' + escapeHtml(t('res_eagle')) + ': ' + p.eagles + '"><i class="fas fa-bolt" aria-hidden="true"></i> ' + p.eagles + '</span>';
        } else if (p.birdies) {
            bestBadge = '<span class="pv-badge pv-badge--birdie" title="' + escapeHtml(t('res_birdie')) + ': ' + p.birdies + '" aria-label="' + escapeHtml(t('res_birdie')) + ': ' + p.birdies + '"><i class="fas fa-fire" aria-hidden="true"></i> ' + p.birdies + '</span>';
        }

        // role="row"/"cell" — чтобы таблица читалась скринридером по строкам
        // и столбцам, хотя собрана на div'ах (таблицы <table> тут нет).
        if (isSoloList) {
            return '<div class="rlb-row rlb-row-solo" role="button" data-act="openPlayerProfileModal" data-arg="' + escapeHtml(p.pid) + '" data-arg2="' + escapeHtml(id) + '">' +
                '<div class="rlb-player">' + fmtUserAvatar(p, 28) +
                '<div class="rlb-pcol"><div style="display:flex;align-items:center;min-width:0;flex-wrap:wrap;"><span class="rlb-name">' + escapeHtml(privacyDisplayName(p, p.pid)) + '</span>' + pTeeBadge + bestBadge + '</div>' +
                '<span class="rlb-thru rlb-thru-on">' + holeInfo + '</span></div></div>' +
                '<div class="rlb-solo-nums">' +
                '<span class="rlb-par ' + scoreClass(p.toPar) + '">' + fmtScore(p.toPar) + '</span>' +
                '<span class="rlb-solo-stat"><i>Gross</i><b>' + gross + '</b></span>' +
                '<span class="rlb-solo-stat"><i>' + stblShort + '</i><b>' + p.stblField + ' / ' + p.stblExact + '</b></span>' +
                '</div></div>';
        }
        return '<div class="rlb-row" role="row" data-act="openPlayerProfileModal" data-arg="' + escapeHtml(p.pid) + '" data-arg2="' + escapeHtml(id) + '">' +
            '<span class="rlb-pos ' + posCls + '" role="cell">' + (p.tied ? 'T' : '') + p.position + '</span>' +
            '<div class="rlb-player" role="cell">' + fmtUserAvatar(p, 28) +
            '<div class="rlb-pcol"><div style="display:flex;align-items:center;min-width:0;"><span class="rlb-name">' + escapeHtml(privacyDisplayName(p, p.pid)) + '</span>' + pTeeBadge + bestBadge + '</div>' +
            '<span class="rlb-thru">' + holeInfo + '</span></div></div>' +
            '<span class="rlb-par ' + scoreClass(p.toPar) + '" role="cell">' + fmtScore(p.toPar) + '</span>' +
            '<span class="rlb-num" role="cell">' + gross + '</span>' +
            '<span class="rlb-num rlb-stbl" role="cell">' + p.stblField + '</span>' +
            '<span class="rlb-num rlb-dim" role="cell">' + p.stblExact + '</span>' +
            '<div class="rlb-sub" role="cell">' + holeInfo + ' · Gross ' + gross + ' · ' + stblShort + ' ' + p.stblField + '/' + p.stblExact + '</div>' +
            '</div>';
    }).join('');

    var badge = (typeof buildRoundStatusBadgeHTML === 'function')
        ? buildRoundStatusBadgeHTML(r)
        : (isLive 
            ? '<span class="live-badge"><span class="live-dot" style="width:7px;height:7px;"></span> LIVE</span>' 
            : ((typeof buildRoundCompletedBadgeHTML === 'function')
                ? buildRoundCompletedBadgeHTML(r)
                : '<span class="tn-status tn-d">' + (isEn ? 'Completed' : 'Завершён') + '</span>'));

    var panelId = 'lb-sc-' + id;
    // Действия — только реальные операции: карточка и её счётная часть
    // всегда развёрнуты, сворачивать/разворачивать больше нечего.
    var actions = '';
    if (r.status === 'completed') {
        actions = '<div class="lwl-actions">' +
            '<button class="btn btn-og btn-sm" data-act="downloadScorecard" data-arg="' + escapeHtml(id) + '"><i class="fas fa-download"></i> ' + (isEn ? 'Scorecard' : 'Счётная карточка') + '</button>' +
            '<button class="btn btn-g btn-sm" data-act="exportRoundPNG" data-arg="' + escapeHtml(id) + '"><i class="fas fa-image"></i> ' + t('share_card') + '</button>' +
            '</div>';
    }

    // Заголовок — это кнопки сортировки: aria-sort сообщает текущее
    // направление, а не только стрелка в CSS.
    function lbHeadCell(key, label, cls) {
        var active = lbSortKey === key;
        var ariaSort = active ? (lbSortDir === 'asc' ? 'ascending' : 'descending') : 'none';
        return '<span class="' + cls + '" role="columnheader" aria-sort="' + ariaSort + '">' +
            '<button type="button" class="rlb-sort-btn" data-act="lbSortBy" data-arg="' + key + '" ' +
            'aria-label="' + escapeHtml(label + ' — ' + t('pv_lb_sort')) + '">' + label + '</button></span>';
    }
    var head = '<div class="rlb-row rlb-head" role="row">' +
        '<span class="rlb-pos" role="columnheader">#</span>' +
        lbHeadCell('name', t('player'), 'rlb-hpl') +
        lbHeadCell('toPar', '±Par', 'rlb-par') +
        lbHeadCell('gross', t('gross'), 'rlb-num') +
        lbHeadCell('stblField', stblF, 'rlb-num') +
        lbHeadCell('stblExact', stblE, 'rlb-num') + '</div>';

    // В свёрнутой строке раунда: сколько берди/игл набрали все игроки.
    // Игл важнее берди, поэтому выводится один бейдж, а не два.
    var roundBadge = '';
    if (roundEagles) {
        roundBadge = '<span class="pv-badge pv-badge--eagle" title="' + escapeHtml(t('pv_round_eagles')) + ': ' + roundEagles + '" aria-label="' + escapeHtml(t('pv_round_eagles')) + ': ' + roundEagles + '"><i class="fas fa-bolt" aria-hidden="true"></i> ' + roundEagles + '</span>';
    } else if (roundBirdies) {
        roundBadge = '<span class="pv-badge pv-badge--birdie" title="' + escapeHtml(t('pv_round_birdies')) + ': ' + roundBirdies + '" aria-label="' + escapeHtml(t('pv_round_birdies')) + ': ' + roundBirdies + '"><i class="fas fa-fire" aria-hidden="true"></i> ' + roundBirdies + '</span>';
    }

    var ts = r.startTime || r.createdAt;
    var soloWord = isEn ? 'Solo' : 'Одиночный';
    var formatTxt = (typeof pestovoRoundFormatBadge === 'function') ? pestovoRoundFormatBadge(r, 'Stroke Play') : (r.format || 'Stroke Play');
    // Свёрнутая сводка шапки: короткие имена («Владимир В.») — полная
    // информация об игроках ниже, в развёрнутой части карточки.
    var nameList = list.map(function(p) {
        var raw = String((p && p.name) || '').replace(/\s+/g, ' ').trim();
        if (!raw) return '—';
        var parts = raw.split(' ');
        return parts.length > 1 ? parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.' : parts[0];
    });
    var namesStr = nameList.length > 2
        ? nameList.slice(0, 2).join(', ') + ' +' + (nameList.length - 2)
        : nameList.join(', ') || '—';

    var details = '<div class="lwl-details">' +
        (isSoloList ? '<div class="rlb lb-rlb lb-rlb-solo">' + rows + '</div>'
            : '<div class="rlb lb-rlb" role="table" aria-label="' + escapeHtml(t('players_label')) + '">' + head + rows + '</div>') +
        actions +
        '<div id="' + escapeHtml(panelId) + '" class="card-scorecard-panel">' + lbScorecardPanelHTML(id, r) + '</div>' +
        '</div>';

    // «Свёрнутая сводка» шапки: дата · короткое имя · формат · время · ТИ
    // и бейджи берди/иглов — одной полосой. Вся остальная информация ниже,
    // в развёрнутой части карточки.
    var metaLine = '<div class="lwl-meta-line">' +
        '<span class="lwl-hole lb-names"><i class="fas fa-user"></i> ' + escapeHtml(namesStr) + '</span>' +
        '<span class="lwl-start">' + formatTxt + ' · ' + fmtTime(ts) + roundBadge + '</span>' +
        (r.mode === 'solo' ? '<span class="lwl-extra"><i class="fas fa-user"></i> ' + soloWord + '</span>' : '') +
        '<span class="lwl-extra">' + t('tee_select') + ': ' + fmtRoundTeePills(r) + '</span>' +
        '</div>';
    // Шапка — кнопка-сводка: по умолчанию карточка свёрнута (дата · имя ·
    // формат · время · ТИ и бейджи), тап разворачивает детали.
    var isOpen = !!lbOpenRoundIds[id] || (lbFocusRoundId && String(id) === String(lbFocusRoundId));
    return '<div class="lwl-row lb-row' + (isLive ? ' lb-row-live' : '') + (isOpen ? ' lb-open' : '') + '" data-round-id="' + escapeHtml(id) + '">' +
        '<button type="button" class="lwl-toggle" data-act="toggleLbRound" data-self="1" data-arg="' + escapeHtml(id) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
        '<span class="lwl-name"><i class="fas ' + (isLive ? 'fa-flag' : 'fa-flag-checkered') + '"></i><span class="lwl-name-txt">' + fmtDate(ts) + '</span></span>' +
        '<span class="lwl-score">' + badge + '</span>' +
        metaLine +
        '<span class="lwl-chev" aria-hidden="true"><i class="fas fa-chevron-down"></i></span>' +
        '</button>' +
        details +
        '</div>';
}

// Свёрнутые карточки: состояние живёт вне разметки, чтобы фильтры и
// realtime-перерисовки не сворачивали уже открытую карточку.
var lbOpenRoundIds = {};

function toggleLbRound(btn, id) {
    var row = btn && btn.closest ? btn.closest('.lwl-row') : null;
    if (!row || !id) return;
    var open = !row.classList.contains('lb-open');
    row.classList.toggle('lb-open', open);
    lbOpenRoundIds[id] = open;
    if (btn.setAttribute) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
