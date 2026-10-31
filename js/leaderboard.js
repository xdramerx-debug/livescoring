document.addEventListener('DOMContentLoaded', function() { 
    var routeParams = new URLSearchParams(window.location.search || '');
    lbFocusRoundId = routeParams.get('round') || '';
    if (lbFocusRoundId) {
        setLbOpen(lbFocusRoundId, true);
        if (routeParams.get('scorecard') === '1') lbPanelOpen['lb-sc-' + lbFocusRoundId] = true;
        lbFocusScrollPending = true;
    }
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
function loadLB() {
    if (typeof db === 'undefined' || !db) return;
    if (typeof bindRealtimeValue !== 'function') return;
    var statusSelect = lbGet('lb-status');
    var status = statusSelect ? statusSelect.value : 'all';
    var searchInput = lbGet('lb-search');
    var query = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
    if (typeof db === 'undefined' || !db.ref) return;
    bindRealtimeValue('leaderboard-rounds', db.ref('rounds'), function(sn) {
        var data = sn.val() || {};
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
        } else {
            entries = filterEntriesByDateRange(allEntries, range);
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

        entries.sort(function(a, b) { 
            return (b[1].createdAt || 0) - (a[1].createdAt || 0); 
        });

        if (dateFilter) dateFilter.renderSummary(entries.length, totalRounds);

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
        if (lbHidden > 0) {
            var lbIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
            html += '<div style="display:flex;justify-content:center;padding:14px 0;">' +
                '<button type="button" class="btn btn-o btn-sm" id="lb-show-more">' +
                escapeHtml(lbIsEn ? 'Show more' : 'Показать ещё') + ' (' + lbHidden + ')' +
                '</button></div>';
        }
        var displayVariant = (typeof getAllRoundsDisplayVariant === 'function') ? getAllRoundsDisplayVariant() : '1';
        displayVariant = (displayVariant === '2' || displayVariant === '3') ? displayVariant : '1';
        try { el.innerHTML = '<div class="live-who-list rounds-layout-' + displayVariant + '" data-display-variant="' + displayVariant + '">' + html + '</div>'; } catch (e) { console.warn("[silent]", e); }
        var lbMoreBtn = el.querySelector('#lb-show-more');
        if (lbMoreBtn) {
            lbMoreBtn.addEventListener('click', function() {
                lbRenderLimit += LB_PAGE_SIZE;
                loadLB();
            });
        }
        try { restoreLbPanels(); } catch (e) { console.warn("[silent]", e); }
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
    });
}

// ==========================================
// Список раундов в свёрнутом виде (как «Последние результаты» на главной):
// одна строка (дата · игроки · статус · формат), по тапу разворачивается
// таблица с результатами, кнопки и счётная карточка.
// ==========================================
var lbRoundOpen = {};
var lbRoundsById = {};
var lbPanelOpen = {};
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

function lbStoreKey(id) { return 'pestovo_lb_open_' + id; }

function getLbOpen(id) {
    if (Object.prototype.hasOwnProperty.call(lbRoundOpen, id)) return lbRoundOpen[id];
    var saved = null;
    try { saved = localStorage.getItem(lbStoreKey(id)); } catch (e) { console.warn("[silent]", e); }
    lbRoundOpen[id] = (saved === '1');
    return lbRoundOpen[id];
}

function setLbOpen(id, open) {
    lbRoundOpen[id] = !!open;
    try { localStorage.setItem(lbStoreKey(id), open ? '1' : '0'); } catch (e) { console.warn("[silent]", e); }
}

function toggleLbRound(id) {
    var rows = document.querySelectorAll('.lb-row[data-round-id]');
    var row = null;
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-round-id') === String(id)) { row = rows[i]; break; }
    }
    var open = row ? !row.classList.contains('is-open') : !getLbOpen(id);
    setLbOpen(id, open);
    if (row) {
        row.classList.toggle('is-open', open);
        var chev = row.querySelector('.lwl-chev');
        if (chev) chev.className = 'fas lwl-chev ' + (open ? 'fa-chevron-up' : 'fa-chevron-down');
        var tg = row.querySelector('.lwl-toggle');
        if (tg) tg.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (typeof vib === 'function') vib(15);
}

function lbRowKey(ev, id) {
    if (ev && (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar')) {
        ev.preventDefault();
        toggleLbRound(id);
    }
}

// Панель счётной карточки внутри раскрытого раунда
function fillLbScorecardPanel(panelId, roundId) {
    var panel = document.getElementById(panelId);
    var r = lbRoundsById[roundId];
    if (!panel || !r || typeof generateGroupHoleTableHTML !== 'function') return;
    r.roundId = roundId;
    panel.innerHTML = generateGroupHoleTableHTML(r, { compact: true });
}

function toggleLbScorecard(panelId, roundId) {
    var panel = document.getElementById(panelId);
    var icon = document.getElementById(panelId + '-icon');
    var txt = document.getElementById(panelId + '-txt');
    if (!panel) return;
    var isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        panel.classList.remove('hidden');
        lbPanelOpen[panelId] = true;
        if (icon) icon.className = 'fas fa-chevron-up';
        if (txt) txt.textContent = t('collapse_scorecard');
        fillLbScorecardPanel(panelId, roundId);
    } else {
        panel.classList.add('hidden');
        lbPanelOpen[panelId] = false;
        if (icon) icon.className = 'fas fa-chevron-down';
        if (txt) txt.textContent = t('expand_scorecard');
    }
}

function restoreLbPanels() {
    var rows = document.querySelectorAll('.lb-row');
    for (var i = 0; i < rows.length; i++) {
        var roundId = rows[i].getAttribute('data-round-id');
        var panelId = 'lb-sc-' + roundId;
        if (!lbPanelOpen[panelId]) continue;
        var panel = document.getElementById(panelId);
        if (!panel) continue;
        panel.classList.remove('hidden');
        var icon = document.getElementById(panelId + '-icon');
        var txt = document.getElementById(panelId + '-txt');
        if (icon) icon.className = 'fas fa-chevron-up';
        if (txt) txt.textContent = t('collapse_scorecard');
        fillLbScorecardPanel(panelId, roundId);
    }
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

    var rows = list.map(function(p) {
        roundBirdies += p.birdies || 0;
        roundEagles += p.eagles || 0;
        var posCls = p.position <= 3 ? 'lb-' + p.position : '';
        var isFin = typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(r, p.pid);
        var holeInfo = (isFin || p.holesPlayed >= (p.holeCount || 18)) ? 'F' : (p.currentHole ? (isEn ? 'Hole #' : 'лунка №') + p.currentHole : '—');
        var gross = p.gross || '—';
        var teeCode = pestovoNormalizeTeeCode(p.tee);
        var pTeeBadge = '<span class="tee-pill tee-' + teeCode + '" style="font-size:9px;padding:0 6px;margin-left:6px;vertical-align:middle;line-height:16px;">' + escapeHtml(pestovoTeeLabel(teeCode)) + '</span>';
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
    var actions = '<div class="lwl-actions">' +
        '<button class="btn btn-og btn-sm" data-act="toggleLbScorecard" data-arg="' + escapeHtml(panelId) + '" data-arg2="' + escapeHtml(id) + '"><i class="fas fa-chevron-down" id="' + escapeHtml(panelId) + '-icon"></i> <span id="' + escapeHtml(panelId) + '-txt">' + t('expand_scorecard') + '</span></button>' +
        (r.status === 'completed'
            ? '<button class="btn btn-og btn-sm" data-act="downloadScorecard" data-arg="' + escapeHtml(id) + '"><i class="fas fa-download"></i> ' + (isEn ? 'Scorecard' : 'Счётная карточка') + '</button>' +
              '<button class="btn btn-g btn-sm" data-act="exportRoundPNG" data-arg="' + escapeHtml(id) + '"><i class="fas fa-image"></i> ' + t('share_card') + '</button>'
            : '') +
        '</div>';

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
    var soloWord = isEn ? ' · Solo' : ' · Одиночный';
    // Имена игроков показываем в развёрнутой таблице, чтобы не дублировать
    // их в свёрнутой строке раунда.
    var namesStr = list.length ? t('players_label') + ': ' + list.length : '—';
    var open = getLbOpen(id);

    var details = '<div class="lwl-details">' +
        '<div class="lwl-meta">' +
        '<span class="lwl-extra">' + ((typeof pestovoRoundFormatBadge === 'function') ? pestovoRoundFormatBadge(r, 'Stroke Play') : (r.format || 'Stroke Play')) + (r.mode === 'solo' ? soloWord : '') + ' · ' + fmtTime(ts) + '</span>' +
        '<span class="lwl-extra">' + t('tee_select') + ': ' + fmtRoundTeePills(r) + '</span>' +
        '</div>' +
        '<div class="rlb lb-rlb" role="table" aria-label="' + escapeHtml(t('players_label')) + '">' + head + rows + '</div>' +
        actions +
        '<div id="' + escapeHtml(panelId) + '" class="card-scorecard-panel hidden"></div>' +
        '</div>';

    return '<div class="lwl-row lb-row' + (open ? ' is-open' : '') + (isLive ? ' lb-row-live' : '') + '" data-round-id="' + escapeHtml(id) + '">' +
        '<div class="lwl-toggle" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '" ' +
        'data-act="toggleLbRound" data-arg="' + escapeHtml(id) + '" data-kd-act="lbRowKey" data-kd-ev="1" data-kd-arg="' + escapeHtml(id) + '">' +
        '<span class="lwl-name"><i class="fas ' + (isLive ? 'fa-flag' : 'fa-flag-checkered') + '"></i><span class="lwl-name-txt">' + fmtDate(ts) + '</span></span>' +
        '<span class="lwl-hole lb-names"><i class="fas fa-user"></i> ' + escapeHtml(namesStr) + '</span>' +
        '<span class="lwl-score">' + badge + '</span>' +
        '<span class="lwl-start">' + ((typeof pestovoRoundFormatBadge === 'function') ? pestovoRoundFormatBadge(r, 'Stroke Play') : (r.format || 'Stroke Play')) + roundBadge + '</span>' +
        '<i class="fas lwl-chev ' + (open ? 'fa-chevron-up' : 'fa-chevron-down') + '"></i>' +
        '</div>' +
        details +
        '</div>';
}
