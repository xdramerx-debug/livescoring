document.addEventListener('DOMContentLoaded', function() { 
    initNav(); 
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
    loadLB(); 
});

function onAuthReady(u, d) { navAuth(u, d); }

function loadLB() {
    var statusSelect = document.getElementById('lb-status');
    var status = statusSelect ? statusSelect.value : 'all';

    var searchInput = document.getElementById('lb-search');
    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    bindRealtimeValue('leaderboard-rounds', db.ref('rounds'), function(sn) {
        var data = sn.val() || {};
        var allEntries = Object.entries(data).filter(function(e) { return e && e[1] && typeof e[1] === 'object'; });
        var totalRounds = allEntries.length;

        var dateFilter = (typeof getDateRangeFilter === 'function') ? getDateRangeFilter('leaderboard') : null;
        var range = dateFilter ? dateFilter.getRange() : { active: false, from: null, to: null, invalid: false };

        var entries = filterEntriesByDateRange(allEntries, range);

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

        entries.sort(function(a, b) { 
            return (b[1].createdAt || 0) - (a[1].createdAt || 0); 
        });

        if (dateFilter) dateFilter.renderSummary(entries.length, totalRounds);

        var el = document.getElementById('lb-container');
        if (!el) return;

        if (!entries.length) { 
            var emptyText = range.active
                ? (currentLang === 'en' ? 'No rounds in the selected period' : 'Нет раундов за выбранный период')
                : (currentLang === 'en' ? 'No rounds found' : 'Нет раундов');
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>' + emptyText + '</p></div>'; 
            return; 
        }
        var html = '';
        entries.forEach(function(e) { html += renderRound(e[0], e[1]); });
        el.innerHTML = '<div class="live-who-list">' + html + '</div>';
        restoreLbPanels();
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

function lbStoreKey(id) { return 'pestovo_lb_open_' + id; }

function getLbOpen(id) {
    if (Object.prototype.hasOwnProperty.call(lbRoundOpen, id)) return lbRoundOpen[id];
    var saved = null;
    try { saved = localStorage.getItem(lbStoreKey(id)); } catch (e) {}
    lbRoundOpen[id] = (saved === '1');
    return lbRoundOpen[id];
}

function setLbOpen(id, open) {
    lbRoundOpen[id] = !!open;
    try { localStorage.setItem(lbStoreKey(id), open ? '1' : '0'); } catch (e) {}
}

function toggleLbRound(id) {
    var row = document.querySelector('.lb-row[data-round-id="' + id + '"]');
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
            currentHole: stats.currentHole
        };
    });

    list.sort(function(a, b) {
        if (a.toPar === null && b.toPar === null) return 0;
        if (a.toPar === null) return 1;
        if (b.toPar === null) return -1;
        return a.toPar - b.toPar;
    });

    var pos = 1;
    list.forEach(function(p, i) {
        if (i > 0 && p.toPar === list[i - 1].toPar) { 
            p.position = list[i - 1].position; 
            p.tied = true; 
        } else { 
            p.position = pos; 
            p.tied = false; 
        }
        pos++;
    });

    var isEn = currentLang === 'en';
    var stblShort = isEn ? 'Pts' : 'Стб';
    var stblF = isEn ? 'Stb (fld)' : 'Стб (пол)';
    var stblE = isEn ? 'Stb (exc)' : 'Стб (игр)';

    var rows = list.map(function(p) {
        var posCls = p.position <= 3 ? 'lb-' + p.position : '';
        var holeInfo = p.holesPlayed >= (p.holeCount || 18) ? 'F' : (p.currentHole ? (isEn ? 'Hole #' : 'лунка №') + p.currentHole : '—');
        var gross = p.gross || '—';
        var pTeeBadge = '<span class="tee-pill tee-' + p.tee + '" style="font-size:9px;padding:0 6px;margin-left:6px;vertical-align:middle;line-height:16px;">' + t('tee_' + p.tee) + '</span>';

        return '<div class="rlb-row" onclick="openPlayerProfileModal(\'' + p.pid + '\',\'' + id + '\')">' +
            '<span class="rlb-pos ' + posCls + '">' + (p.tied ? 'T' : '') + p.position + '</span>' +
            '<div class="rlb-player">' + fmtUserAvatar(p, 28) +
            '<div class="rlb-pcol"><div style="display:flex;align-items:center;min-width:0;"><span class="rlb-name">' + escapeHtml(privacyDisplayName(p, p.pid)) + '</span>' + pTeeBadge + '</div>' +
            '<span class="rlb-thru">' + holeInfo + '</span></div></div>' +
            '<span class="rlb-par ' + scoreClass(p.toPar) + '">' + fmtScore(p.toPar) + '</span>' +
            '<span class="rlb-num">' + gross + '</span>' +
            '<span class="rlb-num rlb-stbl">' + p.stblField + '</span>' +
            '<span class="rlb-num rlb-dim">' + p.stblExact + '</span>' +
            '<div class="rlb-sub">' + holeInfo + ' · Gross ' + gross + ' · ' + stblShort + ' ' + p.stblField + '/' + p.stblExact + '</div>' +
            '</div>';
    }).join('');

    var badge = isLive 
        ? '<span class="live-badge"><span class="live-dot" style="width:7px;height:7px;"></span> LIVE</span>' 
        : '<span class="tn-status tn-d">' + (isEn ? 'Completed' : 'Завершён') + '</span>';

    var panelId = 'lb-sc-' + id;
    var actions = '<div class="lwl-actions">' +
        '<button class="btn btn-og btn-sm" onclick="toggleLbScorecard(\'' + panelId + '\',\'' + id + '\')"><i class="fas fa-chevron-down" id="' + panelId + '-icon"></i> <span id="' + panelId + '-txt">' + t('expand_scorecard') + '</span></button>' +
        (!isLive
            ? '<button class="btn btn-og btn-sm" onclick="downloadScorecard(\'' + id + '\')"><i class="fas fa-download"></i> ' + (isEn ? 'Scorecard' : 'Счётная карточка') + '</button>' +
              '<button class="btn btn-g btn-sm" onclick="exportRoundPNG(\'' + id + '\')"><i class="fas fa-image"></i> ' + t('share_card') + '</button>'
            : '') +
        '</div>';

    var head = '<div class="rlb-row rlb-head">' +
        '<span class="rlb-pos">#</span>' +
        '<span class="rlb-hpl">' + t('player') + '</span>' +
        '<span class="rlb-par">±Par</span>' +
        '<span class="rlb-num">' + t('gross') + '</span>' +
        '<span class="rlb-num">' + stblF + '</span>' +
        '<span class="rlb-num">' + stblE + '</span></div>';

    var ts = r.startTime || r.createdAt;
    var soloWord = isEn ? ' · Solo' : ' · Одиночный';
    // Имена игроков показываем в развёрнутой таблице, чтобы не дублировать
    // их в свёрнутой строке раунда.
    var namesStr = list.length ? t('players_label') + ': ' + list.length : '—';
    var open = getLbOpen(id);

    var details = '<div class="lwl-details">' +
        '<div class="lwl-meta">' +
        '<span class="lwl-extra">' + (r.format || 'Stroke Play') + (r.mode === 'solo' ? soloWord : '') + ' · ' + fmtTime(ts) + '</span>' +
        '<span class="lwl-extra">' + t('tee_select') + ': ' + fmtRoundTeePills(r) + '</span>' +
        '</div>' +
        '<div class="rlb lb-rlb">' + head + rows + '</div>' +
        actions +
        '<div id="' + panelId + '" class="card-scorecard-panel hidden"></div>' +
        '</div>';

    return '<div class="lwl-row lb-row' + (open ? ' is-open' : '') + (isLive ? ' lb-row-live' : '') + '" data-round-id="' + id + '">' +
        '<div class="lwl-toggle" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '" ' +
        'onclick="toggleLbRound(\'' + id + '\')" onkeydown="lbRowKey(event,\'' + id + '\')">' +
        '<span class="lwl-name"><i class="fas ' + (isLive ? 'fa-flag' : 'fa-flag-checkered') + '"></i><span class="lwl-name-txt">' + fmtDate(ts) + '</span></span>' +
        '<span class="lwl-hole lb-names"><i class="fas fa-user"></i> ' + escapeHtml(namesStr) + '</span>' +
        '<span class="lwl-score">' + badge + '</span>' +
        '<span class="lwl-start">' + (r.format || 'Stroke Play') + '</span>' +
        '<i class="fas lwl-chev ' + (open ? 'fa-chevron-up' : 'fa-chevron-down') + '"></i>' +
        '</div>' +
        details +
        '</div>';
}
