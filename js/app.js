document.addEventListener('DOMContentLoaded', function() {
    initNav();
    buildCourseCard();
    loadLiveRounds();
    loadRecentResults();
    loadClubStats();
    loadMyActiveRounds('my-active-rounds-container');
    // погодный виджет инициализируется в initNav() с правильным контейнером
});

function onAuthReady(u, d) { navAuth(u, d); }

// Чипы с гандикапами игрока — показываются рядом с именем
// в списках на главной странице: точный и полевой.
// Отображение: ТИ, точный гандикап, полевой гандикап
function buildFieldHcpChip(p) {
    var val = p && p.fieldHcp !== undefined && p.fieldHcp !== null && p.fieldHcp !== ''
        ? fmtFieldHcp(p.fieldHcp) : '—';
    var bandClass = typeof fieldHcpBandClass === 'function' ? fieldHcpBandClass(p && p.fieldHcp) : '';
    var bandTitle = typeof fieldHcpBandTitle === 'function' ? fieldHcpBandTitle(p && p.fieldHcp) : '';
    return '<span class="hcp-chip ' + bandClass + '" title="' + bandTitle + '">' + t('field_hcp_short') + ' ' + val + '</span>';
}

function buildExactHcpChip(p) {
    var val = p && p.exactHcp !== undefined && p.exactHcp !== null && p.exactHcp !== ''
        ? fmtExactHcp(p.exactHcp) : '—';
    return '<span class="hcp-chip hcp-chip-exact">' + t('exact_hcp_short') + ' ' + val + '</span>';
}

function buildPlayerTeeBadge(p, roundData) {
    var teeCode = (p && p.tee) || (roundData && roundData.tee) || 'wh';
    return '<span class="tee-pill tee-' + teeCode + '" style="font-size:9.5px;padding:1px 7px;margin-left:6px;vertical-align:middle;">' + t('tee_' + teeCode) + '</span>';
}

function buildPlayerBadges(p, roundData) {
    // Порядок по требованию: ТИ, точный гандикап, полевой гандикап
    var teeBadge = buildPlayerTeeBadge(p, roundData);
    var exactBadge = buildExactHcpChip(p);
    var fieldBadge = buildFieldHcpChip(p);
    return teeBadge + exactBadge + fieldBadge;
}

function buildCourseCard() {
    var el = document.getElementById('course-card');
    if (!el) return;
    var teeKeys = ['bk','bl','wh','rd'];
    var isEn = currentLang === 'en';

    var outStr = isEn ? 'OUT' : 'OUT';
    var inStr = isEn ? 'IN' : 'IN';
    var totalStr = isEn ? 'TOTAL' : 'ВСЕГО';
    var parStr = isEn ? 'Par' : 'Пар';
    var indexStr = isEn ? 'Index' : 'Индекс';

    var hdrLblLong = isEn ? 'Tee / Hole' : 'ТИ / Лунка';
    var hdrLblShort = isEn ? 'Tee' : 'ТИ';

    // Front 9 (OUT)
    var html = '<div class="pestovo-modern-scorecard" style="margin-bottom:12px;padding:12px;box-sizing:border-box;max-width:100%;overflow-x:hidden;">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:8px;padding-left:2px;"><i class="fas fa-flag"></i> ' + (isEn ? 'Front 9 (Holes 1–9)' : 'Первые 9 лунок (1–9)') + '</div>';
    html += '<div class="msc-tile-grid msc-grid-9">';

    // Header row
    html += '<div class="msc-tile msc-hdr-lbl"><span class="msc-total-long">' + hdrLblLong + '</span><span class="msc-total-short">' + hdrLblShort + '</span></div>';
    for (var h = 1; h <= 9; h++) html += '<div class="msc-tile msc-hdr-num">' + h + '</div>';
    html += '<div class="msc-tile msc-hdr-tot">' + outStr + '</div>';

    // Tees
    teeKeys.forEach(function(tKey) {
        html += '<div class="msc-tile msc-lbl-' + tKey + '">' + t('tee_' + tKey) + '</div>';
        var sum = 0;
        for (var h = 1; h <= 9; h++) {
            var d = holeDist(h, tKey);
            sum += d;
            html += '<div class="msc-tile msc-val-' + tKey + '">' + d + '</div>';
        }
        html += '<div class="msc-tile msc-tot-' + tKey + '">' + sum + '</div>';
    });

    // Par row
    html += '<div class="msc-tile msc-lbl-par">' + parStr + '</div>';
    var pO = 0;
    for (var h = 1; h <= 9; h++) {
        var p = holePar(h);
        pO += p;
        html += '<div class="msc-tile msc-val-par">' + p + '</div>';
    }
    html += '<div class="msc-tile msc-tot-par">' + pO + '</div>';

    // Index row
    html += '<div class="msc-tile msc-lbl-idx">' + indexStr + '</div>';
    for (var h = 1; h <= 9; h++) {
        html += '<div class="msc-tile msc-val-idx">' + holeHcp(h) + '</div>';
    }
    html += '<div class="msc-tile msc-tot-idx">—</div>';

    html += '</div></div>';

    // Back 9 (IN & TOTAL)
    html += '<div class="pestovo-modern-scorecard" style="padding:12px;box-sizing:border-box;max-width:100%;overflow-x:hidden;">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:8px;padding-left:2px;"><i class="fas fa-flag-checkered"></i> ' + (isEn ? 'Back 9 (Holes 10–18 & Total)' : 'Вторые 9 лунок (10–18 и Итог)') + '</div>';
    html += '<div class="msc-tile-grid msc-grid-10">';

    // Header row
    html += '<div class="msc-tile msc-hdr-lbl"><span class="msc-total-long">' + hdrLblLong + '</span><span class="msc-total-short">' + hdrLblShort + '</span></div>';
    for (var h = 10; h <= 18; h++) html += '<div class="msc-tile msc-hdr-num">' + h + '</div>';
    html += '<div class="msc-tile msc-hdr-tot">' + inStr + '</div>';
    html += '<div class="msc-tile msc-hdr-tot" style="background:var(--gold);color:var(--bg);"><span class="msc-total-long">' + totalStr + '</span><span class="msc-total-short">Σ</span></div>';

    // Tees
    teeKeys.forEach(function(tKey) {
        html += '<div class="msc-tile msc-lbl-' + tKey + '">' + t('tee_' + tKey) + '</div>';
        var sumI = 0, sumO = 0;
        for (var h = 1; h <= 9; h++) sumO += holeDist(h, tKey);
        for (var h = 10; h <= 18; h++) {
            var d = holeDist(h, tKey);
            sumI += d;
            html += '<div class="msc-tile msc-val-' + tKey + '">' + d + '</div>';
        }
        html += '<div class="msc-tile msc-tot-' + tKey + '">' + sumI + '</div>';
        html += '<div class="msc-tile msc-tot-' + tKey + '" style="font-weight:900;">' + (sumO + sumI) + '</div>';
    });

    // Par row
    html += '<div class="msc-tile msc-lbl-par">' + parStr + '</div>';
    var pI = 0;
    for (var h = 10; h <= 18; h++) {
        var p = holePar(h);
        pI += p;
        html += '<div class="msc-tile msc-val-par">' + p + '</div>';
    }
    html += '<div class="msc-tile msc-tot-par">' + pI + '</div>';
    html += '<div class="msc-tile msc-tot-par" style="font-weight:900;">' + (pO + pI) + '</div>';

    // Index row
    html += '<div class="msc-tile msc-lbl-idx">' + indexStr + '</div>';
    for (var h = 10; h <= 18; h++) {
        html += '<div class="msc-tile msc-val-idx">' + holeHcp(h) + '</div>';
    }
    html += '<div class="msc-tile msc-tot-idx">—</div>';
    html += '<div class="msc-tile msc-tot-idx">—</div>';

    html += '</div></div>';

    el.innerHTML = html;
}

function renderCourseHolesStrip(activeEntries) {
    var stripEl = document.getElementById('course-holes-strip');
    if (!stripEl) return;

    var isEn = currentLang === 'en';
    var holeCount = {};
    var latestStart = { 1: 0, 10: 0 };
    for (var i = 1; i <= 18; i++) holeCount[i] = 0;

    var totalPlayers = 0;

    (activeEntries || []).forEach(function(e) {
        var r = e[1] || {};
        // В блоке «Сейчас на поле» показываем последний активный старт с
        // двух стартовых ти. Время берётся из самого раунда, а не из времени
        // создания записи, поэтому остаётся верным для отложенного старта.
        var startHole = parseInt(r.startHole) || 1;
        var startTime = parseInt(r.startTime) || 0;
        if ((startHole === 1 || startHole === 10) && startTime > latestStart[startHole]) {
            latestStart[startHole] = startTime;
        }
        var players = r.players || {};
        var order = getRoundOrder(r);
        Object.entries(players).forEach(function(pe) {
            var p = pe[1];
            if (p && typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], p.name)) return;
            totalPlayers++;
            var scores = p.scores || {};
            var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, order);
            if (stats.currentHole && holeCount[stats.currentHole] !== undefined) {
                holeCount[stats.currentHole]++;
            }
        });
    });

    var totalLabel = t('total_players_on_course');

    var lastStartLabel = isEn ? 'Latest tee start' : 'Последний старт';
    var holeLabel = isEn ? 'Hole' : 'Лунка';
    var noStartLabel = '—';

    // Компактный блок «Сейчас на поле»: одна строка «Всего игроков на поле»,
    // ниже — «Последний старт». Без дублирования количества игроков и статистики.
    var html = '<div class="chs-total-bar"><span class="chs-total-icon"><i class="fas fa-users"></i></span>' +
        '<span class="chs-total-lbl">' + totalLabel + ':</span>' +
        '<b class="chs-total-val">' + totalPlayers + '</b></div>' +
        '<div class="chs-starts" aria-label="' + lastStartLabel + '">' +
            '<span class="chs-starts-title"><i class="fas fa-clock"></i> ' + lastStartLabel + ':</span>' +
            '<span class="chs-start-pill"><span>' + holeLabel + ' 1</span><b>' + (latestStart[1] ? fmtTime(latestStart[1]) : noStartLabel) + '</b></span>' +
            '<span class="chs-start-pill"><span>' + holeLabel + ' 10</span><b>' + (latestStart[10] ? fmtTime(latestStart[10]) : noStartLabel) + '</b></span>' +
        '</div>';

    html += '<div class="chs-grid">';
    for (var h = 1; h <= 18; h++) {
        var cnt = holeCount[h];
        var busy = cnt > 0;
        var title = isEn
            ? 'Hole ' + h + (busy ? ' — ' + cnt + ' ' + (cnt === 1 ? 'player' : 'players') + ' playing' : ' — free')
            : 'Лунка ' + h + (busy ? ' — идёт игра (' + cnt + ' ' + pluralN(cnt, 'игрок', 'игрока', 'игроков') + ')' : ' — свободна');
        html += '<div class="chs-cell ' + (busy ? 'chs-busy' : 'chs-free') + '" title="' + title + '">' +
            '<span class="chs-n">' + h + '</span>' +
            '<i class="fas fa-circle chs-dot' + (busy ? ' chs-live' : '') + '"></i>' +
            (busy ? '<span class="chs-cnt">' + cnt + '</span>' : '') +
            '</div>';
    }
    html += '</div>';

    stripEl.innerHTML = html;
}

function loadLiveRounds() {
    var el = document.getElementById('live-rounds');
    var stripEl = document.getElementById('course-holes-strip');
    if (typeof db === 'undefined') return;

    bindRealtimeValue('home-live-rounds', db.ref('rounds'), function(snap) {
        var data = snap.val() || {};
        var entries = Object.entries(data).filter(function(e) { return e && e[1] && typeof e[1] === 'object' && e[1].status === 'active'; });

        renderCourseHolesStrip(entries);

        if (!el) return;

        if (entries.length === 0) {
            el.innerHTML = '<div class="empty"><i class="fas fa-golf-ball-tee"></i><p>' + t('no_active_players') + '</p><a href="setup-round.html" class="btn btn-g btn-sm" style="margin-top:12px;"><i class="fas fa-play"></i> ' + t('btn_start_game') + '</a></div>';
            return;
        }

        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });

        var startWord = currentLang === 'en' ? 'Start' : 'Старт';
        var soloWord = currentLang === 'en' ? ' · Solo' : ' · Одиночный';

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1];
            r.roundId = id;
            var rawPlayers = r.players || {};
            var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(rawPlayers) : rawPlayers;
            var pHtml = '';
            var order = getRoundOrder(r);

            var pIdx = 0;
            Object.entries(players).forEach(function(pe) {
                pIdx++;
                var pid = pe[0], p = pe[1];
                // Имя может быть скрыто настройками конфиденциальности.
                var nameObj = resolvePlayerDisplayName(p, pid, {
                    index: pIdx,
                    isSelf: !!(currentUser && currentUser.uid === pid),
                    round: r
                });
                var playerBadges = buildPlayerBadges(p, r);
                // Для отображения используем собственные счёта игрока.
                // Если их нет, но есть счёта маркера — показываем их (с пометкой).
                var scores = p.scores || {};
                var hasOwnScores = Object.values(scores).some(function(v) { return parseInt(v) >= 1; });
                var displayScores = scores;
                var markerNote = '';
                if (!hasOwnScores && p.markedBy && players[p.markedBy]) {
                    var mkScores = players[p.markedBy].markerScores && players[p.markedBy].markerScores[pid];
                    if (mkScores && Object.values(mkScores).some(function(v) { return parseInt(v) >= 1; })) {
                        displayScores = mkScores;
                        var mkNameObj = resolvePlayerDisplayName(players[p.markedBy], p.markedBy, { round: r });
                        var mkName = mkNameObj.text;
                        markerNote = currentLang === 'en' ? ' (marker: ' + mkName + ')' : ' (маркер: ' + mkName + ')';
                    }
                }
                var stats = calcRoundStats(displayScores, p.fieldHcp || 0, p.exactHcp || 0, order);

                var thruText = stats.holesPlayed >= getRoundHoleCount(r) ? t('finished_f') : (stats.currentHole ? t('hole') + ' №' + stats.currentHole : t('hole') + ' №' + (parseInt(r.startHole)||1));

                pHtml += '<div class="round-p" style="align-items:flex-start;">' +
                    '<div style="flex:1;"><div class="round-p-n" style="font-size:14px;color:var(--gold);"><i class="fas fa-user-circle"></i> ' + escapeHtml(nameObj.text) + playerBadges + '</div>' +
                    '<div style="font-size:12px;color:var(--gold);margin-top:2px;font-weight:600;">📍 ' + thruText + markerNote + '</div></div>' +
                    '<div style="text-align:right;">' +
                    '<div class="round-p-score ' + scoreClass(stats.toPar) + '" style="font-size:16px;">' + fmtScore(stats.toPar) + '</div>' +
                    '<div style="font-size:11px;color:var(--muted);margin-top:2px;">Gross: ' + (stats.gross || 0) + '</div>' +
                    '</div></div>';
            });

            var link = 'setup-round.html?round=' + id;

            var localGroupKey = localStorage.getItem('pestovo_group_key_' + id);
            var localSoloKey = localStorage.getItem('pestovo_solo_key_' + id);
            var localActingAs = localStorage.getItem('pestovo_acting_as_' + id);

            var isMyRound = false;
            if (currentUser && r.createdBy === currentUser.uid) {
                isMyRound = true;
            } else if (currentUser && r.players && r.players[currentUser.uid]) {
                isMyRound = true;
            } else if (localSoloKey && r.accessKey === localSoloKey) {
                isMyRound = true;
            } else if (localGroupKey && r.accessKey === localGroupKey) {
                isMyRound = true;
            } else if (localActingAs && r.players && r.players[localActingAs]) {
                isMyRound = true;
            }

            var startBtnMarkup = isMyRound
                ? '<a href="' + link + '" class="btn btn-g btn-sm" style="flex:1;"><i class="fas fa-gamepad"></i> ' + (currentLang === 'en' ? 'Continue' : 'Продолжить') + '</a>'
                : '';

            // Блок «Сейчас на поле» всегда полностью развёрнут — карточка раунда
            // видна сразу, без кнопки «Показать/Свернуть карточку».
            var scorecardHtml = '';
            if (typeof generateGroupHoleTableHTML === 'function') {
                scorecardHtml = generateGroupHoleTableHTML(r);
            }

            html += '<div class="round-card" style="cursor:default;">' +
                '<div class="round-hdr"><span class="round-course"><i class="fas fa-flag"></i> ' + t('brand_name') + ' · ' + startWord + ' ' + fmtTime(r.startTime) + '</span>' +
                '<span class="live-badge"><span class="live-dot" style="width:7px;height:7px;"></span> LIVE</span></div>' +
                pHtml +
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);padding-top:8px;border-top:1px solid var(--border);margin-top:8px;">' +
                '<span>' + (r.format || 'Stroke Play') + (r.mode === 'solo' ? soloWord : '') + '</span>' +
                '<span>' + t('tee_select') + ': ' + fmtRoundTeePills(r) + '</span></div>' +
                (startBtnMarkup ? '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' + startBtnMarkup + '</div>' : '') +
                (scorecardHtml ? '<div class="card-scorecard-panel" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' + scorecardHtml + '</div>' : '') +
                '</div>';
        });

        el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">' + html + '</div>';
    });
}

function loadRecentResults() {
    var el = document.getElementById('recent-results');
    if (!el || typeof db === 'undefined') return;

    bindRealtimeValue('home-recent-results', db.ref('rounds'), function(snap) {
        var data = snap.val() || {};
        var entries = Object.entries(data).filter(function(e) { return e && e[1] && typeof e[1] === 'object' && e[1].status === 'completed'; });

        if (entries.length === 0) {
            el.innerHTML = '<div class="empty"><i class="fas fa-clock"></i><p>' + t('no_completed') + '</p></div>';
            return;
        }

        entries.sort(function(a, b) {
            var timeA = a[1].completedAt || a[1].createdAt || 0;
            var timeB = b[1].completedAt || b[1].createdAt || 0;
            return timeB - timeA;
        });

        entries = entries.slice(0, 5);

        var soloWord = currentLang === 'en' ? ' · Solo' : ' · Одиночный';
        var completedWord = currentLang === 'en' ? 'Completed' : 'Завершён';

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1];
            r.roundId = id;
            var rawPlayers = r.players || {};
            var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(rawPlayers) : rawPlayers;
            var pHtml = '';
            var order = getRoundOrder(r);

            var pIdx = 0;
            Object.entries(players).forEach(function(pe) {
                pIdx++;
                var pid = pe[0], p = pe[1], scores = p.scores || {};
                // Имя может быть скрыто настройками конфиденциальности.
                var nameObj = resolvePlayerDisplayName(p, pid, {
                    index: pIdx,
                    isSelf: !!(currentUser && currentUser.uid === pid),
                    round: r
                });
                var playerBadges = buildPlayerBadges(p, r);
                var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, order);

                pHtml += '<div class="round-p" style="align-items:flex-start;">' +
                    '<div style="flex:1;"><div class="round-p-n" style="font-size:14px;color:var(--gold);"><i class="fas fa-user-circle"></i> ' + escapeHtml(nameObj.text) + playerBadges + '</div>' +
                    '<div style="font-size:12px;color:var(--muted);margin-top:2px;">Gross: ' + (stats.gross || 0) + ' · Stableford: ' + stats.stablefordField + '</div></div>' +
                    '<div style="text-align:right;">' +
                    '<div class="round-p-score ' + scoreClass(stats.toPar) + '" style="font-size:16px;">' + fmtScore(stats.toPar) + '</div>' +
                    '</div></div>';
            });

            // Блок «Сейчас на поле» всегда полностью развёрнут — карточка раунда
            // видна сразу, без кнопки «Показать/Свернуть карточку».
            var scorecardHtml = '';
            if (typeof generateGroupHoleTableHTML === 'function') {
                scorecardHtml = generateGroupHoleTableHTML(r);
            }

            html += '<div class="round-card" style="cursor:default;">' +
                '<div class="round-hdr"><span class="round-course"><i class="fas fa-flag"></i> ' + t('brand_name') + ' · ' + fmtDate(r.completedAt || r.createdAt) + '</span>' +
                '<span class="tn-status tn-d">' + completedWord + '</span></div>' +
                pHtml +
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);padding-top:8px;border-top:1px solid var(--border);margin-top:8px;">' +
                '<span>' + (r.format || 'Stroke Play') + (r.mode === 'solo' ? soloWord : '') + '</span>' +
                '<span>' + t('tee_select') + ': ' + fmtRoundTeePills(r) + '</span></div>' +
                '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' +
                '<button class="btn btn-g btn-sm" style="flex:1;" onclick="exportRoundPNG(\'' + id + '\')"><i class="fas fa-image"></i> ' + t('share_card') + '</button>' +
                '</div>' +
                (scorecardHtml ? '<div class="card-scorecard-panel" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' + scorecardHtml + '</div>' : '') +
                '</div>';
        });

        el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">' + html + '</div>';
    });
}

function loadClubStats() {
    var el = document.getElementById('club-stats');
    if (!el) return;

    Promise.all([db.ref('rounds').once('value'), db.ref('users').once('value')]).then(function(snaps) {
        var rounds = snaps[0].val() || {};
        var users = snaps[1].val() || {};
        var totalRounds = Object.keys(rounds).length;
        var totalPlayers = Object.keys(users).filter(function(uid) {
            var u = users[uid];
            return !(u && typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, u.name));
        }).length;
        var completedRounds = 0, activeRounds = 0;
        var birdies = 0, eagles = 0, pars = 0, bogeys = 0;
        var best = Infinity, totalHolesPlayed = 0;

        Object.values(rounds).forEach(function(r) {
            if (r.status === 'completed') completedRounds++;
            if (r.status === 'active') activeRounds++;
            Object.values(r.players || {}).forEach(function(p) {
                // Удалённые и навсегда заблокированные демо-игроки не учитываются
                if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(null, p && p.name)) return;
                var scores = p.scores || {};
                var gross = 0, holesPlayed = 0;
                Object.entries(scores).forEach(function(se) {
                    var h = se[0], s = parseInt(se[1]) || 0;
                    if (s <= 0) return;
                    gross += s; holesPlayed++; totalHolesPlayed++;
                    var d = s - holePar(h);
                    if (d <= -2) eagles++; else if (d === -1) birdies++; else if (d === 0) pars++; else if (d === 1) bogeys++;
                });
                if (holesPlayed === 18 && gross > 0 && gross < best) best = gross;
            });
        });

        var lTotalRounds = currentLang === 'en' ? 'Total Rounds' : 'Всего раундов';
        var lActiveRounds = currentLang === 'en' ? 'Currently Playing' : 'Сейчас играют';
        var lCompletedRounds = currentLang === 'en' ? 'Completed Rounds' : 'Завершено';
        var lPlayers = currentLang === 'en' ? 'Total Players' : 'Игроков';
        var lBestGross = currentLang === 'en' ? 'Best Gross (18h)' : 'Лучший Gross (18л)';
        var lHolesPlayed = currentLang === 'en' ? 'Holes Played' : 'Лунок сыграно';

        el.innerHTML =
            '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">' + totalRounds + '</div><div class="stat-l">' + lTotalRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-circle-play"></i><div class="stat-n">' + activeRounds + '</div><div class="stat-l">' + lActiveRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-check-circle"></i><div class="stat-n">' + completedRounds + '</div><div class="stat-l">' + lCompletedRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-users"></i><div class="stat-n">' + totalPlayers + '</div><div class="stat-l">' + lPlayers + '</div></div>' +
            '<div class="stat"><i class="fas fa-star"></i><div class="stat-n">' + (best < Infinity ? best : '—') + '</div><div class="stat-l">' + lBestGross + '</div></div>' +
            '<div class="stat"><i class="fas fa-fire"></i><div class="stat-n">' + birdies + '</div><div class="stat-l">Birdies</div></div>' +
            '<div class="stat"><i class="fas fa-bolt"></i><div class="stat-n">' + eagles + '</div><div class="stat-l">Eagles</div></div>' +
            '<div class="stat"><i class="fas fa-circle-check"></i><div class="stat-n">' + pars + '</div><div class="stat-l">Pars</div></div>' +
            '<div class="stat"><i class="fas fa-circle-xmark"></i><div class="stat-n">' + bogeys + '</div><div class="stat-l">Bogeys</div></div>' +
            '<div class="stat"><i class="fas fa-golf-ball-tee"></i><div class="stat-n">' + totalHolesPlayed + '</div><div class="stat-l">' + lHolesPlayed + '</div></div>';
    });
}
