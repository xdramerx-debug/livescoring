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

// Чип с полевым (игровым) гандикапом игрока — показывается рядом с именем
// в списках на главной странице.
function buildFieldHcpChip(p) {
    var val = p && p.fieldHcp !== undefined && p.fieldHcp !== null && p.fieldHcp !== ''
        ? fmtFieldHcp(p.fieldHcp) : '—';
    return '<span class="hcp-chip">' + t('field_hcp_short') + ' ' + val + '</span>';
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

    // Статистика по девяткам для подсказки «С какой лунки лучше стартовать»:
    // сколько игроков сейчас в поле на каждой девятке и их суммарный гандикап.
    var nine = {
        front: { players: 0, hcpSum: 0 },
        back: { players: 0, hcpSum: 0 }
    };

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
            var scores = p.scores || {};
            var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, order);
            if (stats.currentHole && holeCount[stats.currentHole] !== undefined) {
                holeCount[stats.currentHole]++;
                // Игрок физически находится на этой лунке — учитываем его
                // в загруженности соответствующей девятки вместе с гандикапом.
                var side = stats.currentHole <= 9 ? nine.front : nine.back;
                side.players++;
                var hcpVal = (p.fieldHcp !== undefined && p.fieldHcp !== null && p.fieldHcp !== '')
                    ? (parseFloat(p.fieldHcp) || 0)
                    : (parseFloat(p.exactHcp) || 0);
                side.hcpSum += hcpVal;
            }
        });
    });

    var occupied = 0;
    for (var hc = 1; hc <= 18; hc++) if (holeCount[hc] > 0) occupied++;
    var free = 18 - occupied;

    var freeLabel = isEn ? 'Free' : 'Свободны';
    var busyLabel = isEn ? 'Playing now' : 'Идёт игра';
    var ruAdjEnd = function(n) {
        var m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return 'а';
        if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'ы';
        return 'о';
    };
    var freeCount = isEn ? free + ' holes free' : free + ' ' + pluralN(free, 'лунка', 'лунки', 'лунок') + ' свободн' + ruAdjEnd(free);
    var busyCount = isEn ? occupied + ' busy' : occupied + ' ' + pluralN(occupied, 'лунка', 'лунки', 'лунок') + ' занят' + ruAdjEnd(occupied);

    var lastStartLabel = isEn ? 'Latest tee start' : 'Последний старт';
    var holeLabel = isEn ? 'Hole' : 'Лунка';
    var noStartLabel = '—';

    var html = '<div class="chs-legend"><span class="chs-legend-item chs-free-lg"><i class="fas fa-circle chs-dot"></i> ' + freeLabel + ' · <b>' + free + '</b></span>' +
        '<span class="chs-legend-item chs-busy-lg"><i class="fas fa-circle chs-dot"></i> ' + busyLabel + ' · <b>' + occupied + '</b></span>' +
        '<span class="chs-count">' + (isEn ? free + ' free · ' + occupied + ' busy' : freeCount + ' · ' + busyCount) + '</span></div>' +
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
            ? 'Hole ' + h + (busy ? ' — ' + cnt + ' ' + (cnt === 1 ? 'group' : 'groups') + ' playing' : ' — free')
            : 'Лунка ' + h + (busy ? ' — идёт игра (' + cnt + ' ' + pluralN(cnt, 'группа', 'группы', 'групп') + ')' : ' — свободна');
        html += '<div class="chs-cell ' + (busy ? 'chs-busy' : 'chs-free') + '" title="' + title + '">' +
            '<span class="chs-n">' + h + '</span>' +
            '<i class="fas fa-circle chs-dot' + (busy ? ' chs-live' : '') + '"></i>' +
            (busy ? '<span class="chs-cnt">' + cnt + '</span>' : '') +
            '</div>';
    }
    html += '</div>';

    // Разворачиваемая вкладка-подсказка: с какой лунки лучше стартовать прямо сейчас
    html += buildStartHintHTML(nine, isEn);

    stripEl.innerHTML = html;
}

// Состояние вкладки-подсказки сохраняется между перерисовками ленты:
// блок «Сейчас на поле» обновляется в реальном времени.
var startHintOpen = false;

function toggleStartHint() {
    startHintOpen = !startHintOpen;
    var body = document.getElementById('chs-hint-body');
    var icon = document.getElementById('chs-hint-icon');
    var btn = document.getElementById('chs-hint-toggle');
    if (body) body.classList.toggle('hidden', !startHintOpen);
    if (icon) icon.className = startHintOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    if (btn) btn.setAttribute('aria-expanded', startHintOpen ? 'true' : 'false');
}

function buildStartHintHTML(nine, isEn) {
    var front = nine.front, back = nine.back;
    var fAvg = front.players ? front.hcpSum / front.players : 0;
    var bAvg = back.players ? back.hcpSum / back.players : 0;

    // Совокупная «загруженность» девятки: каждый игрок в поле и высокий средний
    // гандикап (чем выше гандикап, тем медленнее темп игры) увеличивают риск
    // задержек. Стартуем с той девятки, где загрузка меньше.
    var fLoad = front.players * 3 + fAvg;
    var bLoad = back.players * 3 + bAvg;

    var recoHole = null;
    var why = '';
    if (front.players === 0 && back.players === 0) {
        why = isEn
            ? '💡 The course is free right now — you can start from any hole (hole 1 by default).'
            : '💡 Поле сейчас свободно — можно стартовать с любой лунки (по умолчанию с лунки 1).';
    } else if (Math.abs(fLoad - bLoad) < 1) {
        why = isEn
            ? '💡 Both nines are similarly loaded right now — start from any hole (hole 1 by default).'
            : '💡 Загруженность девяток сейчас примерно одинаковая — можно стартовать с любой лунки (по умолчанию с лунки 1).';
    } else {
        var winner = fLoad < bLoad ? front : back;
        var loser = fLoad < bLoad ? back : front;
        var winnerAvg = fLoad < bLoad ? fAvg : bAvg;
        var loserAvg = fLoad < bLoad ? bAvg : fAvg;
        recoHole = fLoad < bLoad ? 1 : 10;

        var parts = [];
        if (winner.players === 0) {
            parts.push(isEn ? 'no one is playing there right now' : 'там сейчас никто не играет');
        } else {
            if (winner.players < loser.players) {
                parts.push(isEn ? 'fewer players on that nine' : 'на этой девятке сейчас меньше игроков');
            }
            if (loser.players > 0 && winnerAvg < loserAvg - 0.5) {
                parts.push(isEn
                    ? 'their average handicap is lower, so play moves faster'
                    : 'средний гандикап играющих ниже — игра идёт быстрее');
            }
            if (!parts.length) {
                parts.push(isEn ? 'that nine is lighter right now' : 'эта девятка сейчас менее загружена');
            }
        }

        var startPhrase = isEn ? '💡 Better to start from ' : '💡 Лучше стартовать ';
        var startHoleName = recoHole === 1
            ? (isEn ? 'the first nine — hole 1' : 'с первой девятки — с лунки 1')
            : (isEn ? 'the second nine — hole 10' : 'со второй девятки — с лунки 10');
        why = startPhrase + startHoleName + ': ' + parts.join(', ') + '.';
    }

    var bodyCls = startHintOpen ? '' : ' hidden';
    var iconCls = startHintOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    var ariaExp = startHintOpen ? 'true' : 'false';

    var recoHtml = '';
    if (recoHole) {
        var recoLbl = isEn ? 'Recommended start' : 'Рекомендуемый старт';
        var holeLbl = isEn ? 'Hole' : 'Лунка';
        recoHtml = '<span class="chs-hint-start"><i class="fas fa-flag-checkered"></i> ' + recoLbl + ': <b>' + holeLbl + ' ' + recoHole + '</b></span>';
    }

    var fmtAvg = function (n) { return n > 0 ? (Math.round(n * 10) / 10).toFixed(1) : '—'; };
    var playersLbl = function (n) {
        return isEn ? (n === 1 ? 'player in the field' : 'players in the field') : pluralN(n, 'игрок в поле', 'игрока в поле', 'игроков в поле');
    };
    var avgLbl = isEn ? 'avg handicap' : 'средний HCP';
    var frontTitle = isEn ? 'First nine' : 'Первая девятка';
    var backTitle = isEn ? 'Second nine' : 'Вторая девятка';
    var holesSpan = function (a, b) { return isEn ? ' (holes ' + a + '–' + b + ')' : ' (лунки ' + a + '–' + b + ')'; };

    var frontBetter = recoHole === 1;
    var backBetter = recoHole === 10;

    var noteTxt = isEn
        ? 'The hint takes into account everyone on the course right now: how loaded each nine is and the average handicap of the players (the higher the handicap, the slower the pace). Choose your start hole when you begin a round.'
        : 'Подсказка учитывает всех, кто сейчас в поле: загруженность каждой девятки и средний гандикап играющих (чем выше гандикап, тем медленнее темп). Стартовую лунку можно выбрать при создании раунда.';

    var html = '<div class="chs-hint">' +
        '<button type="button" class="chs-hint-toggle" id="chs-hint-toggle" onclick="toggleStartHint()" aria-expanded="' + ariaExp + '">' +
        '<span class="chs-hint-title"><i class="fas fa-lightbulb"></i> ' + t('start_hint_title') + '</span>' +
        '<i class="' + iconCls + '" id="chs-hint-icon"></i>' +
        '</button>' +
        '<div class="chs-hint-body' + bodyCls + '" id="chs-hint-body">' +
        '<div class="chs-hint-reco">' + recoHtml + '<span class="chs-hint-why">' + why + '</span></div>' +
        '<div class="chs-hint-nines">' +
        '<div class="chs-hint-nine' + (frontBetter ? ' is-better' : '') + '">' +
        '<div class="chs-hint-nine-t">' + (frontBetter ? '<i class="fas fa-circle-check"></i> ' : '') + frontTitle + holesSpan(1, 9) + '</div>' +
        '<div class="chs-hint-nine-stats">' +
        '<div class="chs-hint-stat"><b>' + front.players + '</b><span>' + playersLbl(front.players) + '</span></div>' +
        '<div class="chs-hint-stat"><b>' + fmtAvg(fAvg) + '</b><span>' + avgLbl + '</span></div>' +
        '</div>' +
        '</div>' +
        '<div class="chs-hint-nine' + (backBetter ? ' is-better' : '') + '">' +
        '<div class="chs-hint-nine-t">' + (backBetter ? '<i class="fas fa-circle-check"></i> ' : '') + backTitle + holesSpan(10, 18) + '</div>' +
        '<div class="chs-hint-nine-stats">' +
        '<div class="chs-hint-stat"><b>' + back.players + '</b><span>' + playersLbl(back.players) + '</span></div>' +
        '<div class="chs-hint-stat"><b>' + fmtAvg(bAvg) + '</b><span>' + avgLbl + '</span></div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<p class="chs-hint-note">' + noteTxt + '</p>' +
        '</div>' +
        '</div>';

    return html;
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
            var rawPlayers = r.players || {};
            var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(rawPlayers) : rawPlayers;
            var pHtml = '';
            var order = getRoundOrder(r);

            Object.entries(players).forEach(function(pe) {
                var pid = pe[0], p = pe[1];
                var playerTee = (p && p.tee) || r.tee || 'wh';
                var playerTeeBadge = '<span class="tee-pill tee-' + playerTee + '" style="font-size:9.5px;padding:1px 7px;margin-left:6px;vertical-align:middle;">' + t('tee_' + playerTee) + '</span>';
                var playerHcpBadge = buildFieldHcpChip(p);
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
                        var mkName = players[p.markedBy].name || '';
                        markerNote = currentLang === 'en' ? ' (marker: ' + mkName + ')' : ' (маркер: ' + mkName + ')';
                    }
                }
                var stats = calcRoundStats(displayScores, p.fieldHcp || 0, p.exactHcp || 0, order);

                var thruText = stats.holesPlayed >= getRoundHoleCount(r) ? t('finished_f') : (stats.currentHole ? t('hole') + ' №' + stats.currentHole : t('hole') + ' №' + (parseInt(r.startHole)||1));

                pHtml += '<div class="round-p" style="align-items:flex-start;">' +
                    '<div style="flex:1;"><div class="round-p-n" style="font-size:14px;color:var(--gold);"><i class="fas fa-user-circle"></i> ' + escapeHtml(p.name || '—') + playerTeeBadge + playerHcpBadge + '</div>' +
                    '<div style="font-size:12px;color:var(--gold);margin-top:2px;font-weight:600;">📍 ' + thruText + markerNote + '</div></div>' +
                    '<div style="text-align:right;">' +
                    '<div class="round-p-score ' + scoreClass(stats.toPar) + '" style="font-size:16px;">' + fmtScore(stats.toPar) + '</div>' +
                    '<div style="font-size:11px;color:var(--muted);margin-top:2px;">Gross: ' + (stats.gross || 0) + '</div>' +
                    '</div></div>';
            });

            var link = 'setup-round.html?round=' + id;
            var panelId = 'live-sc-' + id;

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

            var toggleWidth = isMyRound ? 'flex:1;' : 'width:100%;';

            html += '<div class="round-card" style="cursor:default;">' +
                '<div class="round-hdr"><span class="round-course"><i class="fas fa-flag"></i> ' + t('brand_name') + ' · ' + startWord + ' ' + fmtTime(r.startTime) + '</span>' +
                '<span class="live-badge"><span class="live-dot" style="width:7px;height:7px;"></span> LIVE</span></div>' +
                pHtml +
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);padding-top:8px;border-top:1px solid var(--border);margin-top:8px;">' +
                '<span>' + (r.format || 'Stroke Play') + (r.mode === 'solo' ? soloWord : '') + '</span>' +
                '<span>' + t('tee_select') + ': ' + fmtRoundTeePills(r) + '</span></div>' +
                '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' +
                '<button class="btn btn-og btn-sm" style="' + toggleWidth + '" onclick="toggleCardScorecard(\'' + panelId + '\',\'' + id + '\')"><i class="fas fa-chevron-down" id="' + panelId + '-icon"></i> <span id="' + panelId + '-txt">' + t('expand_scorecard') + '</span></button>' +
                startBtnMarkup +
                '</div>' +
                '<div id="' + panelId + '" class="card-scorecard-panel hidden" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"></div>' +
                '</div>';
        });

        el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">' + html + '</div>';
    });
}

function toggleCardScorecard(panelId, roundId) {
    var panel = document.getElementById(panelId);
    var icon = document.getElementById(panelId + '-icon');
    var txt = document.getElementById(panelId + '-txt');
    if (!panel) return;

    var isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        panel.classList.remove('hidden');
        if (icon) icon.className = 'fas fa-chevron-up';
        if (txt) txt.textContent = t('collapse_scorecard');

        if (roundId && typeof db !== 'undefined' && panel.innerHTML === '') {
            panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
            db.ref('rounds/' + roundId).once('value').then(function(sn) {
                var r = sn.val();
                if (r && typeof generateGroupHoleTableHTML === 'function') {
                    r.roundId = roundId;
                    panel.innerHTML = generateGroupHoleTableHTML(r);
                }
            });
        }
    } else {
        panel.classList.add('hidden');
        if (icon) icon.className = 'fas fa-chevron-down';
        if (txt) txt.textContent = t('expand_scorecard');
    }
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
            var rawPlayers = r.players || {};
            var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(rawPlayers) : rawPlayers;
            var pHtml = '';
            var order = getRoundOrder(r);

            Object.entries(players).forEach(function(pe) {
                var pid = pe[0], p = pe[1], scores = p.scores || {};
                var playerTee = (p && p.tee) || r.tee || 'wh';
                var playerTeeBadge = '<span class="tee-pill tee-' + playerTee + '" style="font-size:9.5px;padding:1px 7px;margin-left:6px;vertical-align:middle;">' + t('tee_' + playerTee) + '</span>';
                var playerHcpBadge = buildFieldHcpChip(p);
                var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, order);

                pHtml += '<div class="round-p" style="align-items:flex-start;">' +
                    '<div style="flex:1;"><div class="round-p-n" style="font-size:14px;color:var(--gold);"><i class="fas fa-user-circle"></i> ' + escapeHtml(p.name || '—') + playerTeeBadge + playerHcpBadge + '</div>' +
                    '<div style="font-size:12px;color:var(--muted);margin-top:2px;">Gross: ' + (stats.gross || 0) + ' · Stableford: ' + stats.stablefordField + '</div></div>' +
                    '<div style="text-align:right;">' +
                    '<div class="round-p-score ' + scoreClass(stats.toPar) + '" style="font-size:16px;">' + fmtScore(stats.toPar) + '</div>' +
                    '</div></div>';
            });

            var panelId = 'recent-sc-' + id;

            html += '<div class="round-card" style="cursor:default;">' +
                '<div class="round-hdr"><span class="round-course"><i class="fas fa-flag"></i> ' + t('brand_name') + ' · ' + fmtDate(r.completedAt || r.createdAt) + '</span>' +
                '<span class="tn-status tn-d">' + completedWord + '</span></div>' +
                pHtml +
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);padding-top:8px;border-top:1px solid var(--border);margin-top:8px;">' +
                '<span>' + (r.format || 'Stroke Play') + (r.mode === 'solo' ? soloWord : '') + '</span>' +
                '<span>' + t('tee_select') + ': ' + fmtRoundTeePills(r) + '</span></div>' +
                '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' +
                '<button class="btn btn-og btn-sm" style="flex:1;" onclick="toggleCardScorecard(\'' + panelId + '\',\'' + id + '\')"><i class="fas fa-chevron-down" id="' + panelId + '-icon"></i> <span id="' + panelId + '-txt">' + t('expand_scorecard') + '</span></button>' +
                '<button class="btn btn-g btn-sm" style="flex:1;" onclick="exportRoundPNG(\'' + id + '\')"><i class="fas fa-image"></i> ' + t('share_card') + '</button>' +
                '</div>' +
                '<div id="' + panelId + '" class="card-scorecard-panel hidden" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"></div>' +
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
