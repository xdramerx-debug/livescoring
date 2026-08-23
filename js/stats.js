document.addEventListener('DOMContentLoaded', function() {
    initNav();
    loadStats();
});

function onAuthReady(u, d) { navAuth(u, d); }

function loadStats() {
    Promise.all([
        db.ref('rounds').once('value'),
        db.ref('users').once('value')
    ]).then(function(snaps) {
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
        var totalStblFieldSum = 0, totalStblExactSum = 0;

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
                        var p = pe[1];
                        var sc = p.scores || {};
                        var cnt = 0;
                        Object.values(sc).forEach(function(s) { if (parseInt(s) >= 1) cnt++; });
                        if (cnt === 18 && dur > 30 && dur < fastestTime) {
                            fastestTime = dur;
                            fastestPlayer = p.name;
                        }
                    });
                }
            }
            if (r.status === 'active') active++;
            if (r.mode === 'solo') soloCount++;
            else groupCount++;

            Object.entries(r.players || {}).forEach(function(pe) {
                var pid = pe[0], p = pe[1];
                var scores = p.scores || {};
                var fieldHcp = p.fieldHcp || 0;
                var exactHcp = p.exactHcp || 0;
                var gross = 0, stblF = 0, stblE = 0, holesPlayed = 0;

                Object.entries(scores).forEach(function(se) {
                    var h = parseInt(se[0]);
                    var s = parseInt(se[1]) || 0;
                    if (s < 1) return;

                    var par = holePar(h);
                    gross += s;
                    totalHoles++;
                    holesPlayed++;

                    if (holeScores[h]) {
                        holeScores[h].sum += s;
                        holeScores[h].count++;
                    }

                    if (s === 1) hio++;
                    var d = s - par;
                    if (d <= -2) eagles++;
                    else if (d === -1) birdies++;
                    else if (d === 0) pars++;

                    stblF += stablefordField(s, h, fieldHcp);
                    stblE += stablefordExact(s, h, exactHcp);
                });

                totalStblFieldSum += stblF;
                totalStblExactSum += stblE;

                if (holesPlayed === 18) {
                    if (gross > 0 && gross < bestGross) {
                        bestGross = gross;
                        bestGrossPlayer = p.name;
                    }
                    if (stblF > bestStblfd) {
                        bestStblfd = stblF;
                        bestStblfdPlayer = p.name;
                    }
                }

                if (r.status === 'completed' && holesPlayed === 18) {
                    if (!playerRounds[pid]) playerRounds[pid] = {
                        name: p.name, count: 0, totalGross: 0, totalStbl: 0
                    };
                    playerRounds[pid].count++;
                    playerRounds[pid].totalGross += gross;
                    playerRounds[pid].totalStbl += stblF;
                }
            });
        });

        var hourUnit = currentLang === 'en' ? 'h ' : 'ч ';
        var minUnit = currentLang === 'en' ? 'm' : 'м';
        var fastestStr = fastestTime < Infinity ?
            Math.floor(fastestTime / 60) + hourUnit + Math.round(fastestTime % 60) + minUnit : '—';

        var lTotalRounds = currentLang === 'en' ? 'Total Rounds' : 'Всего раундов';
        var lActiveRounds = currentLang === 'en' ? 'Active Rounds' : 'Активных';
        var lCompletedRounds = currentLang === 'en' ? 'Completed' : 'Завершено';
        var lPlayers = currentLang === 'en' ? 'Players' : 'Игроков';
        var lSolo = currentLang === 'en' ? 'Solo Rounds' : 'Одиночных';
        var lGroup = currentLang === 'en' ? 'Group Rounds' : 'Групповых';
        var lHoles = currentLang === 'en' ? 'Holes Played' : 'Лунок сыграно';

        // Общая статистика
        document.getElementById('general-stats').innerHTML =
            '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">' + totalRounds + '</div><div class="stat-l">' + lTotalRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-circle-play"></i><div class="stat-n">' + active + '</div><div class="stat-l">' + lActiveRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-check-circle"></i><div class="stat-n">' + completed + '</div><div class="stat-l">' + lCompletedRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-users"></i><div class="stat-n">' + totalPlayers + '</div><div class="stat-l">' + lPlayers + '</div></div>' +
            '<div class="stat"><i class="fas fa-user"></i><div class="stat-n">' + soloCount + '</div><div class="stat-l">' + lSolo + '</div></div>' +
            '<div class="stat"><i class="fas fa-user-group"></i><div class="stat-n">' + groupCount + '</div><div class="stat-l">' + lGroup + '</div></div>' +
            '<div class="stat"><i class="fas fa-fire"></i><div class="stat-n">' + birdies + '</div><div class="stat-l">Birdies</div></div>' +
            '<div class="stat"><i class="fas fa-bolt"></i><div class="stat-n">' + eagles + '</div><div class="stat-l">Eagles</div></div>' +
            '<div class="stat"><i class="fas fa-circle-dot"></i><div class="stat-n">' + hio + '</div><div class="stat-l">Hole-in-One</div></div>' +
            '<div class="stat"><i class="fas fa-golf-ball-tee"></i><div class="stat-n">' + totalHoles + '</div><div class="stat-l">' + lHoles + '</div></div>';

        // Топ игроков (только полные раунды)
        var sortedByCount = Object.values(playerRounds).sort(function(a, b) { return b.count - a.count; });
        var topEl = document.getElementById('top-players');

        if (sortedByCount.length === 0) {
            topEl.innerHTML = '<div class="empty"><i class="fas fa-users"></i><p>' + (currentLang === 'en' ? 'No completed 18-hole rounds yet' : 'Нет завершённых раундов (18 лунок)') + '</p></div>';
        } else {
            var thtml = '';
            var avgWord = currentLang === 'en' ? 'Avg: ' : 'Средний: ';
            var fullRoundsWord = currentLang === 'en' ? ' full rounds' : ' полн. раундов';

            sortedByCount.slice(0, 10).forEach(function(p, i) {
                var avg = (p.totalGross / p.count).toFixed(1);
                var avgStbl = (p.totalStbl / p.count).toFixed(1);
                var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
                thtml += '<div class="list-item">' +
                    '<span><strong style="color:var(--white);">' + medal + ' ' + p.name + '</strong></span>' +
                    '<span>' + avgWord + '<b style="color:var(--gold);">' + avg + '</b> · Stblfd: <b style="color:var(--gold);">' + avgStbl + '</b> · ' + p.count + fullRoundsWord + '</span>' +
                    '</div>';
            });
            topEl.innerHTML = thtml;
        }

        var lBestGross18 = currentLang === 'en' ? '🏆 Best Gross (18 holes)' : '🏆 Лучший gross (18 лунок)';
        var lBestStbl18 = currentLang === 'en' ? '⭐ Best Stableford (18 holes)' : '⭐ Лучший stableford (18 лунок)';
        var lFastest18 = currentLang === 'en' ? '⏱️ Fastest Round (18 holes)' : '⏱️ Самый быстрый раунд (18 лунок)';

        // Рекорды клуба (только 18 лунок)
        document.getElementById('club-records').innerHTML =
            '<div class="list-item"><span>' + lBestGross18 + '</span>' +
            '<strong>' + (bestGross < Infinity ? bestGross + ' (' + bestGrossPlayer + ')' : '—') + '</strong></div>' +
            '<div class="list-item"><span>' + lBestStbl18 + '</span>' +
            '<strong>' + (bestStblfd > 0 ? bestStblfd + ' (' + bestStblfdPlayer + ')' : '—') + '</strong></div>' +
            '<div class="list-item"><span>' + lFastest18 + '</span>' +
            '<strong>' + fastestStr + (fastestPlayer !== '—' ? ' (' + fastestPlayer + ')' : '') + '</strong></div>' +
            '<div class="list-item"><span>🎯 Hole-in-One</span><strong>' + hio + '</strong></div>' +
            '<div class="list-item"><span>🦅 Eagles</span><strong>' + eagles + '</strong></div>' +
            '<div class="list-item"><span>🐦 Birdies</span><strong>' + birdies + '</strong></div>' +
            '<div class="list-item"><span>✅ Pars</span><strong>' + pars + '</strong></div>';

        // Сложность лунок
        var holeHeader = t('hole');
        var parHeader = t('par');
        var avgHeader = currentLang === 'en' ? 'Average' : 'Средний';

        var hHtml = '<div class="scorecard"><table><tr><th>' + holeHeader + '</th>';
        for (var h = 1; h <= 18; h++) hHtml += '<th>' + h + '</th>';
        hHtml += '</tr><tr class="row-par"><td>' + parHeader + '</td>';
        for (var h = 1; h <= 18; h++) hHtml += '<td>' + holePar(h) + '</td>';
        hHtml += '</tr><tr><td>' + avgHeader + '</td>';
        for (var h = 1; h <= 18; h++) {
            var hs = holeScores[h];
            var avg = hs.count > 0 ? (hs.sum / hs.count).toFixed(1) : '—';
            hHtml += '<td>' + avg + '</td>';
        }
        hHtml += '</tr><tr><td>±Par</td>';
        for (var h = 1; h <= 18; h++) {
            var hs = holeScores[h];
            if (hs.count === 0) { hHtml += '<td>—</td>'; continue; }
            var diff = (hs.sum / hs.count) - holePar(h);
            var cls = diff > 0.3 ? 's-ov' : diff < -0.1 ? 's-un' : 's-ev';
            hHtml += '<td class="' + cls + '">' + (diff > 0 ? '+' : '') + diff.toFixed(1) + '</td>';
        }
        hHtml += '</tr></table></div>';
        document.getElementById('hole-difficulty').innerHTML = hHtml;
    });
}
