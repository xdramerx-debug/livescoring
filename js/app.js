document.addEventListener('DOMContentLoaded', function() {
    initNav();
    buildCourseCard();
    loadLiveRounds();
    loadRecentResults();
    loadClubStats();
});

function onAuthReady(u, d) { navAuth(u, d); }

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

function loadLiveRounds() {
    var el = document.getElementById('live-rounds');
    if (!el) return;
    db.ref('rounds').orderByChild('status').equalTo('active').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data);
        if (entries.length === 0) {
            el.innerHTML = '<div class="empty"><i class="fas fa-golf-ball-tee"></i><p>Сейчас никто не играет</p><a href="live.html" class="btn btn-g btn-sm" style="margin-top:12px;"><i class="fas fa-play"></i> Начать раунд</a></div>';
            return;
        }
        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1], players = r.players || {}, pHtml = '';
            Object.entries(players).forEach(function(pe) {
                var p = pe[1];
                var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, holeOrder(r.startHole || 1));
                var thruTxt = stats.holesPlayed >= 18 ? 'F' : (stats.currentHole ? 'Л' + stats.currentHole : '—');
                pHtml += '<div class="round-p"><span class="round-p-n">' + (p.name || '—') + '</span><span class="round-p-s ' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</span><span style="color:var(--muted);font-size:12px;">' + thruTxt + '</span></div>';
            });
            var link = r.mode === 'solo' ? 'solo.html?round=' + id : 'live.html?round=' + id;
            html += '<div class="round-card" onclick="window.location=\'' + link + '\'">' +
                '<div class="round-hdr"><span class="round-course"><i class="fas fa-flag"></i> Пестово · ' + fmtTime(r.startTime) + '</span>' +
                '<span class="live-badge"><span class="live-dot" style="width:7px;height:7px;"></span> LIVE</span></div>' + pHtml +
                '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);padding-top:8px;border-top:1px solid var(--border);margin-top:8px;">' +
                '<span>' + (r.format || 'Stroke Play') + (r.mode === 'solo' ? ' · Одиночный' : '') + '</span><span>ТИ: ' + TEES[r.tee] + '</span></div></div>';
        });
        el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">' + html + '</div>';
    });
}

function loadRecentResults() {
    var el = document.getElementById('recent-results');
    if (!el) return;
    db.ref('rounds').orderByChild('status').equalTo('completed').limitToLast(5).on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data).reverse();
        if (entries.length === 0) {
            el.innerHTML = '<div class="empty"><i class="fas fa-clock"></i><p>Пока нет завершённых раундов</p></div>';
            return;
        }
        var html = '';
        entries.forEach(function(e) {
            var r = e[1], players = r.players || {}, best = Infinity, winner = '—', count = 0;
            Object.values(players).forEach(function(p) {
                count++;
                var sc = p.scores || {}, g = 0;
                Object.values(sc).forEach(function(s) { var v = parseInt(s); if (v >= 1) g += v; });
                if (g > 0 && g < best) { best = g; winner = p.name; }
            });
            html += '<div class="list-item" style="padding:14px;"><div><strong style="color:var(--white);">Пестово</strong>' +
                '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + fmtDate(r.completedAt || r.createdAt) + ' · ' + count + ' игр. · ' + (r.format || 'Stroke') + '</div></div>' +
                '<div style="text-align:right;"><div style="font-size:11px;color:var(--muted);">Лучший</div><div style="color:var(--gold);font-weight:600;">' + winner + '</div>' +
                '<div style="font-size:18px;font-weight:800;color:var(--white);">' + (best < Infinity ? best : '—') + '</div></div></div>';
        });
        el.innerHTML = html;
    });
}

function loadClubStats() {
    var el = document.getElementById('club-stats');
    if (!el) return;
    Promise.all([db.ref('rounds').once('value'), db.ref('users').once('value')]).then(function(snaps) {
        var rounds = snaps[0].val() || {}, users = snaps[1].val() || {};
        var total = 0, completed = 0, active = 0, totalPlayers = Object.keys(users).length;
        var birdies = 0, eagles = 0, pars = 0, hio = 0, totalHoles = 0;
        var best = Infinity, fastestTime = Infinity;

        Object.values(rounds).forEach(function(r) {
            total++;
            if (r.status === 'completed') {
                completed++;
                if (r.startTime && r.completedAt) {
                    var dur = (r.completedAt - r.startTime) / 60000;
                    Object.values(r.players || {}).forEach(function(p) {
                        var sc = p.scores || {}, cnt = 0;
                        Object.values(sc).forEach(function(s) { if (parseInt(s) >= 1) cnt++; });
                        if (cnt >= 18 && dur < fastestTime) fastestTime = dur;
                    });
                }
            }
            if (r.status === 'active') active++;
            Object.values(r.players || {}).forEach(function(p) {
                var sc = p.scores || {}, gross = 0;
                Object.entries(sc).forEach(function(se) {
                    var h = parseInt(se[0]), s = parseInt(se[1]);
                    if (s < 1) return;
                    gross += s; totalHoles++;
                    if (s === 1) hio++;
                    var d = s - holePar(h);
                    if (d <= -2) eagles++;
                    else if (d === -1) birdies++;
                    else if (d === 0) pars++;
                });
                if (gross > 0 && gross < best) best = gross;
            });
        });

        var fastestStr = fastestTime < Infinity ? Math.floor(fastestTime / 60) + 'ч ' + Math.round(fastestTime % 60) + 'м' : '—';

        el.innerHTML =
            '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">' + total + '</div><div class="stat-l">Всего раундов</div></div>' +
            '<div class="stat"><i class="fas fa-circle-play"></i><div class="stat-n">' + active + '</div><div class="stat-l">Сейчас играют</div></div>' +
            '<div class="stat"><i class="fas fa-check-circle"></i><div class="stat-n">' + completed + '</div><div class="stat-l">Завершено</div></div>' +
            '<div class="stat"><i class="fas fa-users"></i><div class="stat-n">' + totalPlayers + '</div><div class="stat-l">Игроков</div></div>' +
            '<div class="stat"><i class="fas fa-star"></i><div class="stat-n">' + (best < Infinity ? best : '—') + '</div><div class="stat-l">Лучший счёт</div></div>' +
            '<div class="stat"><i class="fas fa-fire"></i><div class="stat-n">' + birdies + '</div><div class="stat-l">Birdies</div></div>' +
            '<div class="stat"><i class="fas fa-bolt"></i><div class="stat-n">' + eagles + '</div><div class="stat-l">Eagles</div></div>' +
            '<div class="stat"><i class="fas fa-circle-dot"></i><div class="stat-n">' + hio + '</div><div class="stat-l">Hole-in-One</div></div>' +
            '<div class="stat"><i class="fas fa-stopwatch"></i><div class="stat-n">' + fastestStr + '</div><div class="stat-l">Быстрый раунд</div></div>' +
            '<div class="stat"><i class="fas fa-golf-ball-tee"></i><div class="stat-n">' + totalHoles + '</div><div class="stat-l">Лунок сыграно</div></div>';
    });
}