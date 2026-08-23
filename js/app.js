document.addEventListener('DOMContentLoaded', function() {
    initNav();
    buildCourseCard();
    loadLiveRounds();
    loadRecentResults();
    loadClubStats();
    loadMyActiveRounds('my-active-rounds-container');
    if (typeof loadPestovoWeather === 'function') {
        loadPestovoWeather('weather-widget-container');
    }
});

function onAuthReady(u, d) { navAuth(u, d); }

function buildCourseCard() {
    var el = document.getElementById('course-card');
    if (!el) return;
    var teeKeys = ['bk','bl','wh','rd'];
    var headerStr = currentLang === 'en' ? 'Tee / Hole' : 'ТИ / Лунка';
    var outStr = t('out');
    var inStr = t('in_side');
    var totalStr = t('total');
    var parStr = t('par');

    var html = '<div class="scorecard"><table><tr><th>' + headerStr + '</th>';
    for (var h = 1; h <= 9; h++) html += '<th>' + h + '</th>';
    html += '<th>' + outStr + '</th></tr>';
    teeKeys.forEach(function(tKey) {
        html += '<tr class="sc-t-' + tKey + '"><td style="text-align:left;padding-left:10px;font-weight:700;">' + t('tee_' + tKey) + '</td>';
        var sum = 0;
        for (var h = 1; h <= 9; h++) { var d = holeDist(h, tKey); sum += d; html += '<td>' + d + '</td>'; }
        html += '<td style="font-weight:800;">' + sum + '</td></tr>';
    });
    html += '<tr class="row-par"><td style="text-align:left;padding-left:10px;">' + parStr + '</td>';
    var pO = 0;
    for (var h = 1; h <= 9; h++) { var p = holePar(h); pO += p; html += '<td>' + p + '</td>'; }
    html += '<td>' + pO + '</td></tr></table></div>';

    html += '<div class="scorecard" style="margin-top:8px;"><table><tr><th>' + headerStr + '</th>';
    for (var h = 10; h <= 18; h++) html += '<th>' + h + '</th>';
    html += '<th>' + inStr + '</th><th>' + totalStr + '</th></tr>';
    teeKeys.forEach(function(tKey) {
        html += '<tr class="sc-t-' + tKey + '"><td style="text-align:left;padding-left:10px;font-weight:700;">' + t('tee_' + tKey) + '</td>';
        var sumI = 0, sumO = 0;
        for (var h = 1; h <= 9; h++) sumO += holeDist(h, tKey);
        for (var h = 10; h <= 18; h++) { var d = holeDist(h, tKey); sumI += d; html += '<td>' + d + '</td>'; }
        html += '<td style="font-weight:800;">' + sumI + '</td><td style="font-weight:800;">' + (sumO + sumI) + '</td></tr>';
    });
    html += '<tr class="row-par"><td style="text-align:left;padding-left:10px;">' + parStr + '</td>';
    var pI = 0;
    for (var h = 10; h <= 18; h++) { var p = holePar(h); pI += p; html += '<td>' + p + '</td>'; }
    html += '<td>' + pI + '</td><td>' + (pO + pI) + '</td></tr></table></div>';
    el.innerHTML = html;
}

function loadLiveRounds() {
    var el = document.getElementById('live-rounds');
    if (!el) return;

    db.ref('rounds').on('value', function(snap) {
        var data = snap.val() || {};
        var entries = Object.entries(data).filter(function(e) { return e[1] && e[1].status === 'active'; });

        if (entries.length === 0) {
            el.innerHTML = '<div class="empty"><i class="fas fa-golf-ball-tee"></i><p>' + t('no_active_players') + '</p><a href="live.html" class="btn btn-g btn-sm" style="margin-top:12px;"><i class="fas fa-play"></i> ' + t('btn_start_game') + '</a></div>';
            return;
        }

        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });

        var startWord = currentLang === 'en' ? 'Start' : 'Старт';
        var soloWord = currentLang === 'en' ? ' · Solo' : ' · Одиночный';

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1];
            var players = r.players || {};
            var pHtml = '';
            var order = holeOrder(r.startHole || 1);

            Object.entries(players).forEach(function(pe) {
                var pid = pe[0], p = pe[1], scores = p.scores || {};
                var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, order);

                var thruText = stats.holesPlayed >= 18 ? t('finished_f') : (stats.currentHole ? t('hole') + ' №' + stats.currentHole : t('hole') + ' №' + (parseInt(r.startHole)||1));

                pHtml += '<div class="round-p" style="align-items:flex-start;cursor:pointer;" onclick="event.stopPropagation();openPlayerProfileModal(\'' + pid + '\',\'' + id + '\')">' +
                    '<div style="flex:1;"><div class="round-p-n" style="font-size:14px;color:var(--gold);"><i class="fas fa-user-circle"></i> ' + (p.name || '—') + '</div>' +
                    '<div style="font-size:12px;color:var(--gold);margin-top:2px;font-weight:600;">📍 ' + thruText + '</div></div>' +
                    '<div style="text-align:right;">' +
                    '<div class="round-p-score ' + scoreClass(stats.toPar) + '" style="font-size:16px;">' + fmtScore(stats.toPar) + '</div>' +
                    '<div style="font-size:11px;color:var(--muted);margin-top:2px;">Gross: ' + (stats.gross || 0) + '</div>' +
                    '</div></div>';
            });

            var link = r.mode === 'solo' ? 'solo.html?round=' + id : 'live.html?round=' + id;
            html += '<div class="round-card" onclick="window.location=\'' + link + '\'">' +
                '<div class="round-hdr"><span class="round-course"><i class="fas fa-flag"></i> ' + t('brand_name') + ' · ' + startWord + ' ' + fmtTime(r.startTime) + '</span>' +
                '<span class="live-badge"><span class="live-dot" style="width:7px;height:7px;"></span> LIVE</span></div>' +
                pHtml +
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);padding-top:8px;border-top:1px solid var(--border);margin-top:8px;">' +
                '<span>' + (r.format || 'Stroke Play') + (r.mode === 'solo' ? soloWord : '') + '</span>' +
                '<span>' + t('tee_select') + ': ' + fmtTeePill(r.tee) + '</span></div></div>';
        });

        el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">' + html + '</div>';
    });
}

function loadRecentResults() {
    var el = document.getElementById('recent-results');
    if (!el) return;

    db.ref('rounds').on('value', function(snap) {
        var data = snap.val() || {};
        var entries = Object.entries(data).filter(function(e) { return e[1] && e[1].status === 'completed'; });

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

        var leaderWord = currentLang === 'en' ? 'Round Leader' : 'Лидер раунда';
        var playerWord = currentLang === 'en' ? 'Player' : 'Игрок';

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1], players = r.players || {};
            var bestToPar = Infinity, winner = '—', winnerPid = '', bestGross = 0, count = 0;
            var order = holeOrder(r.startHole || 1);

            Object.entries(players).forEach(function(pe) {
                count++;
                var pid = pe[0], p = pe[1];
                var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);
                if (stats.toPar !== null && stats.toPar < bestToPar) {
                    bestToPar = stats.toPar;
                    winner = p.name || playerWord;
                    winnerPid = pid;
                    bestGross = stats.gross;
                }
            });

            html += '<div class="list-item" style="padding:14px;cursor:pointer;" onclick="openPlayerProfileModal(\'' + (winnerPid || '') + '\',\'' + id + '\')">' +
                '<div><strong style="color:var(--white);">' + t('brand_name') + '</strong>' +
                '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' +
                '<i class="fas fa-calendar"></i> ' + fmtDate(r.completedAt || r.createdAt) +
                ' · <i class="fas fa-users"></i> ' + count +
                ' · ' + (r.format || 'Stroke') + '</div></div>' +
                '<div style="text-align:right;">' +
                '<div style="font-size:11px;color:var(--muted);">' + leaderWord + '</div>' +
                '<div style="color:var(--gold);font-weight:600;"><i class="fas fa-trophy"></i> ' + winner + '</div>' +
                '<div style="font-size:18px;font-weight:800;color:var(--white);">' + (bestToPar < Infinity ? fmtScore(bestToPar) + ' (' + bestGross + ')' : '—') + '</div>' +
                '</div></div>';
        });

        el.innerHTML = html;
    });
}

function loadClubStats() {
    var el = document.getElementById('club-stats');
    if (!el) return;

    Promise.all([db.ref('rounds').once('value'), db.ref('users').once('value')]).then(function(snaps) {
        var rounds = snaps[0].val() || {};
        var users = snaps[1].val() || {};
        var totalRounds = Object.keys(rounds).length;
        var totalPlayers = Object.keys(users).length;
        var completedRounds = 0, activeRounds = 0;
        var birdies = 0, eagles = 0, pars = 0, bogeys = 0;
        var best = Infinity, totalHolesPlayed = 0;

        Object.values(rounds).forEach(function(r) {
            if (r.status === 'completed') completedRounds++;
            if (r.status === 'active') activeRounds++;
            Object.values(r.players || {}).forEach(function(p) {
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
            '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">' + totalRounds + '</div><div class="stat-label">' + lTotalRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-circle-play"></i><div class="stat-n">' + activeRounds + '</div><div class="stat-label">' + lActiveRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-check-circle"></i><div class="stat-n">' + completedRounds + '</div><div class="stat-label">' + lCompletedRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-users"></i><div class="stat-n">' + totalPlayers + '</div><div class="stat-label">' + lPlayers + '</div></div>' +
            '<div class="stat"><i class="fas fa-star"></i><div class="stat-n">' + (best < Infinity ? best : '—') + '</div><div class="stat-label">' + lBestGross + '</div></div>' +
            '<div class="stat"><i class="fas fa-fire"></i><div class="stat-n">' + birdies + '</div><div class="stat-label">Birdies</div></div>' +
            '<div class="stat"><i class="fas fa-bolt"></i><div class="stat-n">' + eagles + '</div><div class="stat-label">Eagles</div></div>' +
            '<div class="stat"><i class="fas fa-circle-check"></i><div class="stat-n">' + pars + '</div><div class="stat-label">Pars</div></div>' +
            '<div class="stat"><i class="fas fa-circle-xmark"></i><div class="stat-n">' + bogeys + '</div><div class="stat-label">Bogeys</div></div>' +
            '<div class="stat"><i class="fas fa-golf-ball-tee"></i><div class="stat-n">' + totalHolesPlayed + '</div><div class="stat-label">' + lHolesPlayed + '</div></div>';
    });
}
