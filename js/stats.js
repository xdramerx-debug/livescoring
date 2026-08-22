document.addEventListener('DOMContentLoaded', function() { initNav(); loadStats(); });
function onAuthReady(u, d) { navAuth(u, d); }

function loadStats() {
    Promise.all([db.ref('rounds').once('value'), db.ref('users').once('value')]).then(function(snaps) {
        var rounds = snaps[0].val() || {};
        var users = snaps[1].val() || {};
        var totalRounds = 0, completed = 0, active = 0;
        var totalPlayers = Object.keys(users).length;
        var totalHoles = 0;
        var birdies = 0, eagles = 0, pars = 0, hio = 0;
        var bestGross = Infinity, bestGrossPlayer = '—';
        var bestStblfd = 0, bestStblfdPlayer = '—';
        var fastestTime = Infinity, fastestPlayer = '—';
        var soloCount = 0, groupCount = 0;
        var holeScores = {};
        for (var h = 1; h <= 18; h++) holeScores[h] = { sum: 0, count: 0 };
        var playerRounds = {};

        Object.values(rounds).forEach(function(r) {
            totalRounds++;
            if (r.status === 'completed') {
                completed++;
                if (r.startTime && r.completedAt) {
                    var dur = (r.completedAt - r.startTime) / 60000;
                    Object.entries(r.players || {}).forEach(function(pe) {
                        var p = pe[1], sc = p.scores || {}, cnt = 0;
                        Object.values(sc).forEach(function(s) { if (parseInt(s) >= 1) cnt++; });
                        if (cnt >= 18 && dur < fastestTime) { fastestTime = dur; fastestPlayer = p.name; }
                    });
                }
            }
            if (r.status === 'active') active++;
            if (r.mode === 'solo') soloCount++;
            else groupCount++;

            Object.entries(r.players || {}).forEach(function(pe) {
                var pid = pe[0], p = pe[1], scores = p.scores || {};
                var fieldHcp = p.fieldHcp || 0;
                var gross = 0, stblF = 0;
                Object.entries(scores).forEach(function(se) {
                    var h = parseInt(se[0]), s = parseInt(se[1]) || 0;
                    if (s < 1) return;
                    var par = holePar(h);
                    gross += s; totalHoles++;
                    if (holeScores[h]) { holeScores[h].sum += s; holeScores[h].count++; }
                    if (s === 1) hio++;
                    var d = s - par;
                    if (d <= -2) eagles++;
                    else if (d === -1) birdies++;
                    else if (d === 0) pars++;
                    stblF += stablefordField(s, h, fieldHcp);
                });
                if (gross > 0 && gross < bestGross) { bestGross = gross; bestGrossPlayer = p.name; }
                if (stblF > bestStblfd) { bestStblfd = stblF; bestStblfdPlayer = p.name; }
                if (r.status === 'completed' && gross > 0) {
                    if (!playerRounds[pid]) playerRounds[pid] = { name: p.name, count: 0, totalGross: 0, totalStbl: 0 };
                    playerRounds[pid].count++;
                    playerRounds[pid].totalGross += gross;
                    playerRounds[pid].totalStbl += stblF;
                }
            });
        });

        var fastestStr = fastestTime < Infinity ? Math.floor(fastestTime / 60) + 'ч ' + Math.round(fastestTime % 60) + 'м' : '—';

        document.getElementById('general-stats').innerHTML =
            '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">' + totalRounds + '</div><div class="stat-l">Всего раундов</div></div>' +
            '<div class="stat"><i class="fas fa-circle-play"></i><div class="stat-n">' + active + '</div><div class="stat-l">Активных</div></div>' +
            '<div class="stat"><i class="fas fa-check-circle"></i><div class="stat-n">' + completed + '</div><div class="stat-l">Завершено</div></div>' +
            '<div class="stat"><i class="fas fa-users"></i><div class="stat-n">' + totalPlayers + '</div><div class="stat-l">Игроков</div></div>' +
            '<div class="stat"><i class="fas fa-user"></i><div class="stat-n">' + soloCount + '</div><div class="stat-l">Одиночных</div></div>' +
            '<div class="stat"><i class="fas fa-user-group"></i><div class="stat-n">' + groupCount + '</div><div class="stat-l">Групповых</div></div>' +
            '<div class="stat"><i class="fas fa-fire"></i><div class="stat-n">' + birdies + '</div><div class="stat-l">Birdies</div></div>' +
            '<div class="stat"><i class="fas fa-bolt"></i><div class="stat-n">' + eagles + '</div><div class="stat-l">Eagles</div></div>' +
            '<div class="stat"><i class="fas fa-circle-dot"></i><div class="stat-n">' + hio + '</div><div class="stat-l">Hole-in-One</div></div>' +
            '<div class="stat"><i class="fas fa-golf-ball-tee"></i><div class="stat-n">' + totalHoles + '</div><div class="stat-l">Лунок сыграно</div></div>';

        var sortedByCount = Object.values(playerRounds).sort(function(a, b) { return b.count - a.count; });
        var topEl = document.getElementById('top-players');
        if (sortedByCount.length === 0) topEl.innerHTML = '<div class="empty"><i class="fas fa-users"></i><p>Нет данных</p></div>';
        else {
            var thtml = '';
            sortedByCount.slice(0, 10).forEach(function(p, i) {
                var avg = (p.totalGross / p.count).toFixed(1);
                var avgStbl = (p.totalStbl / p.count).toFixed(1);
                var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
                thtml += '<div class="list-item"><span><strong style="color:var(--white);">' + medal + ' ' + p.name + '</strong></span>' +
                    '<span>Средний: <b style="color:var(--gold);">' + avg + '</b> · Stblfd: <b style="color:var(--gold);">' + avgStbl + '</b> · ' + p.count + ' раундов</span></div>';
            });
            topEl.innerHTML = thtml;
        }

        document.getElementById('club-records').innerHTML =
            '<div class="list-item"><span>🏆 Лучший gross</span><strong>' + (bestGross < Infinity ? bestGross + ' (' + bestGrossPlayer + ')' : '—') + '</strong></div>' +
            '<div class="list-item"><span>⭐ Лучший stableford</span><strong>' + (bestStblfd > 0 ? bestStblfd + ' (' + bestStblfdPlayer + ')' : '—') + '</strong></div>' +
            '<div class="list-item"><span>⏱️ Самый быстрый раунд</span><strong>' + fastestStr + (fastestPlayer !== '—' ? ' (' + fastestPlayer + ')' : '') + '</strong></div>' +
            '<div class="list-item"><span>🎯 Hole-in-One</span><strong>' + hio + '</strong></div>' +
            '<div class="list-item"><span>🦅 Eagles</span><strong>' + eagles + '</strong></div>' +
            '<div class="list-item"><span>🐦 Birdies</span><strong>' + birdies + '</strong></div>' +
            '<div class="list-item"><span>✅ Pars</span><strong>' + pars + '</strong></div>';

        var hHtml = '<div class="scorecard"><table><tr><th>Лунка</th>';
        for (var h = 1; h <= 18; h++) hHtml += '<th>' + h + '</th>';
        hHtml += '</tr><tr class="row-par"><td>Пар</td>';
        for (var h = 1; h <= 18; h++) hHtml += '<td>' + holePar(h) + '</td>';
        hHtml += '</tr><tr><td>Средний</td>';
        for (var h = 1; h <= 18; h++) {
            var hs = holeScores[h];
            var avg = hs.count > 0 ? (hs.sum / hs.count).toFixed(1) : '—';
            hHtml += '<td>' + avg + '</td>';
        }
        hHtml += '</tr></table></div>';
        document.getElementById('hole-difficulty').innerHTML = hHtml;
    });
}