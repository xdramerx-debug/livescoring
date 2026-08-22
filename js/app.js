document.addEventListener('DOMContentLoaded', function() {
    initNav();
    buildCourseCard();
    loadLiveRounds();
    loadRecentResults();
    loadClubStats();
});

function onAuthReady(u, d) { navAuth(u, d); }

// =========================================
// ПОЛНАЯ СКОРКАРТА ПОЛЯ ПЕСТОВО
// =========================================
function buildCourseCard() {
    var el = document.getElementById('course-card');
    if (!el) return;
    var teeKeys = ['bk','bl','wh','rd'];
    var html = '<div class="scorecard"><table><tr><th>ТИ / Лунка</th>';
    for (var h = 1; h <= 9; h++) html += '<th>' + h + '</th>';
    html += '<th>Аут</th></tr>';
    teeKeys.forEach(function(t) {
        html += '<tr class="sc-t-' + t + '"><td style="text-align:left;padding-left:10px;font-weight:700;">' + TEES[t] + '</td>';
        var sum = 0;
        for (var h = 1; h <= 9; h++) { var d = holeDist(h, t); sum += d; html += '<td>' + d + '</td>'; }
        html += '<td style="font-weight:800;">' + sum + '</td></tr>';
    });
    html += '<tr class="row-par"><td style="text-align:left;padding-left:10px;">Пар</td>';
    var pO = 0;
    for (var h = 1; h <= 9; h++) { var p = holePar(h); pO += p; html += '<td>' + p + '</td>'; }
    html += '<td>' + pO + '</td></tr>';
    html += '<tr><td style="text-align:left;padding-left:10px;color:var(--muted);">Индекс</td>';
    for (var h = 1; h <= 9; h++) html += '<td style="color:var(--muted);">' + holeHcp(h) + '</td>';
    html += '<td></td></tr></table></div>';

    html += '<div class="scorecard" style="margin-top:8px;"><table><tr><th>ТИ / Лунка</th>';
    for (var h = 10; h <= 18; h++) html += '<th>' + h + '</th>';
    html += '<th>Ин</th><th>Итого</th></tr>';
    teeKeys.forEach(function(t) {
        html += '<tr class="sc-t-' + t + '"><td style="text-align:left;padding-left:10px;font-weight:700;">' + TEES[t] + '</td>';
        var sumI = 0, sumO = 0;
        for (var h = 1; h <= 9; h++) sumO += holeDist(h, t);
        for (var h = 10; h <= 18; h++) { var d = holeDist(h, t); sumI += d; html += '<td>' + d + '</td>'; }
        html += '<td style="font-weight:800;">' + sumI + '</td><td style="font-weight:800;">' + (sumO + sumI) + '</td></tr>';
    });
    html += '<tr class="row-par"><td style="text-align:left;padding-left:10px;">Пар</td>';
    var pI = 0;
    for (var h = 10; h <= 18; h++) { var p = holePar(h); pI += p; html += '<td>' + p + '</td>'; }
    html += '<td>' + pI + '</td><td>' + (pO + pI) + '</td></tr>';
    html += '<tr><td style="text-align:left;padding-left:10px;color:var(--muted);">Индекс</td>';
    for (var h = 10; h <= 18; h++) html += '<td style="color:var(--muted);">' + holeHcp(h) + '</td>';
    html += '<td></td><td></td></tr></table></div>';
    el.innerHTML = html;
}

// =========================================
// LIVE ROUNDS ("СЕЙЧАС НА ПОЛЕ")
// =========================================
function loadLiveRounds() {
    var el = document.getElementById('live-rounds');
    if (!el) return;

    db.ref('rounds').orderByChild('status').equalTo('active').on('value', function(snap) {
        var data = snap.val() || {};
        var entries = Object.entries(data);

        if (entries.length === 0) {
            el.innerHTML = '<div class="empty"><i class="fas fa-golf-ball-tee"></i><p>Сейчас никто не играет</p><a href="live.html" class="btn btn-g btn-sm" style="margin-top:12px;"><i class="fas fa-play"></i> Начать раунд</a></div>';
            return;
        }

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1];
            var players = r.players || {};
            var pHtml = '';

            Object.entries(players).forEach(function(pe) {
                var p = pe[1], scores = p.scores || {};
                var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, holeOrder(r.startHole || 1));
                
                var thruText = stats.holesPlayed >= 18 ? 'F' : (stats.currentHole ? 'лунка №' + stats.currentHole : '—');

                pHtml += '<div class="round-p" style="align-items:flex-start;">' +
                    '<div style="flex:1;"><div class="round-p-n" style="font-size:14px;">' + (p.name || '—') + '</div>' +
                    '<div style="font-size:12px;color:var(--gold);font-weight:600;margin-top:2px;">📍 ' + thruText + '</div></div>' +
                    '<div style="text-align:right;">' +
                    '<div class="round-p-score ' + scoreClass(stats.toPar) + '" style="font-size:16px;">' + fmtScore(stats.toPar) + '</div>' +
                    '<div style="font-size:11px;color:var(--muted);margin-top:2px;">Gross: ' + (stats.gross || 0) + '</div>' +
                    '</div></div>';
            });

            var link = r.mode === 'solo' ? 'solo.html?round=' + id : 'live.html?round=' + id;
            html += '<div class="round-card" onclick="window.location=\'' + link + '\'">' +
                '<div class="round-hdr"><span class="round-course"><i class="fas fa-flag"></i> Пестово · Старт ' + fmtTime(r.startTime) + '</span>' +
                '<span class="live-badge"><span class="live-dot" style="width:7px;height:7px;"></span> LIVE</span></div>' +
                pHtml +
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);padding-top:8px;border-top:1px solid var(--border);margin-top:8px;">' +
                '<span>' + (r.format || 'Stroke Play') + (r.mode === 'solo' ? ' · Одиночный' : '') + '</span>' +
                '<span>ТИ: ' + TEES[r.tee] + '</span></div></div>';
        });

        el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">' + html + '</div>';
    });
}

// =========================================
// RECENT RESULTS
// =========================================
function loadRecentResults() {
    var el = document.getElementById('recent-results');
    if (!el) return;

    db.ref('rounds').orderByChild('status').equalTo('completed').limitToLast(5).on('value', function(snap) {
        var data = snap.val() || {};
        var entries = Object.entries(data).reverse();

        if (entries.length === 0) {
            el.innerHTML = '<div class="empty"><i class="fas fa-clock"></i><p>Пока нет завершённых раундов</p></div>';
            return;
        }

        var html = '';
        entries.forEach(function(e) {
            var r = e[1], players = r.players || {};
            var best = Infinity, winner = '—', count = 0;

            Object.values(players).forEach(function(p) {
                count++;
                var scores = p.scores || {};
                var total = 0, holesPlayed = 0;
                Object.values(scores).forEach(function(s) {
                    var v = parseInt(s) || 0;
                    if (v >= 1) { total += v; holesPlayed++; }
                });
                if (holesPlayed === 18 && total > 0 && total < best) {
                    best = total;
                    winner = p.name;
                }
            });

            html += '<div class="list-item" style="padding:14px;">' +
                '<div><strong style="color:var(--white);">Пестово</strong>' +
                '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' +
                '<i class="fas fa-calendar"></i> ' + formatDate(r.completedAt || r.createdAt) +
                ' · <i class="fas fa-users"></i> ' + count +
                ' · ' + (r.format || 'Stroke') + '</div></div>' +
                '<div style="text-align:right;">' +
                '<div style="font-size:11px;color:var(--muted);">Победитель (18 лунок)</div>' +
                '<div style="color:var(--gold);font-weight:600;"><i class="fas fa-trophy"></i> ' + winner + '</div>' +
                '<div style="font-size:18px;font-weight:800;color:var(--white);">' + (best < Infinity ? best : '—') + '</div>' +
                '</div></div>';
        });

        el.innerHTML = html;
    });
}

// =========================================
// CLUB STATS
// =========================================
function loadClubStats() {
    var el = document.getElementById('club-stats');
    if (!el) return;

    Promise.all([
        db.ref('rounds').once('value'),
        db.ref('users').once('value')
    ]).then(function(snaps) {
        var rounds = snaps[0].val() || {};
        var users = snaps[1].val() || {};

        var totalRounds = Object.keys(rounds).length;
        var totalPlayers = Object.keys(users).length;
        var completedRounds = 0, activeRounds = 0;
        var birdies = 0, eagles = 0, pars = 0, bogeys = 0;
        var best = Infinity, bestName = '—';
        var totalHolesPlayed = 0;

        Object.values(rounds).forEach(function(r) {
            if (r.status === 'completed') completedRounds++;
            if (r.status === 'active') activeRounds++;

            Object.values(r.players || {}).forEach(function(p) {
                var scores = p.scores || {};
                var gross = 0, holesPlayed = 0;

                Object.entries(scores).forEach(function(se) {
                    var h = se[0], s = parseInt(se[1]) || 0;
                    if (s <= 0) return;

                    var par = holePar(h);
                    gross += s;
                    holesPlayed++;
                    totalHolesPlayed++;

                    var d = s - par;
                    if (d <= -2) eagles++;
                    else if (d === -1) birdies++;
                    else if (d === 0) pars++;
                    else if (d === 1) bogeys++;
                });

                if (holesPlayed === 18 && gross > 0 && gross < best) {
                    best = gross;
                    bestName = p.name;
                }
            });
        });

        el.innerHTML =
            '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">' + totalRounds + '</div><div class="stat-label">Всего раундов</div></div>' +
            '<div class="stat"><i class="fas fa-circle-play"></i><div class="stat-n">' + activeRounds + '</div><div class="stat-label">Сейчас играют</div></div>' +
            '<div class="stat"><i class="fas fa-check-circle"></i><div class="stat-n">' + completedRounds + '</div><div class="stat-label">Завершено</div></div>' +
            '<div class="stat"><i class="fas fa-users"></i><div class="stat-n">' + totalPlayers + '</div><div class="stat-label">Игроков</div></div>' +
            '<div class="stat"><i class="fas fa-star"></i><div class="stat-n">' + (best < Infinity ? best : '—') + '</div><div class="stat-label">Лучший Gross (18л)</div></div>' +
            '<div class="stat"><i class="fas fa-fire"></i><div class="stat-n">' + birdies + '</div><div class="stat-label">Birdies</div></div>' +
            '<div class="stat"><i class="fas fa-bolt"></i><div class="stat-n">' + eagles + '</div><div class="stat-label">Eagles</div></div>' +
            '<div class="stat"><i class="fas fa-circle-check"></i><div class="stat-n">' + pars + '</div><div class="stat-label">Pars</div></div>' +
            '<div class="stat"><i class="fas fa-circle-xmark"></i><div class="stat-n">' + bogeys + '</div><div class="stat-label">Bogeys</div></div>' +
            '<div class="stat"><i class="fas fa-golf-ball-tee"></i><div class="stat-n">' + totalHolesPlayed + '</div><div class="stat-label">Лунок сыграно</div></div>';
    });
}
