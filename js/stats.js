document.addEventListener('DOMContentLoaded', function() {
    initNav();
    loadStats();
});

function onAuthReady(u, d) { navAuth(u, d); }

function loadStats() {
    return Promise.all([
        db.ref('rounds').once('value'),
        db.ref('users').once('value')
    ]).then(function(snaps) {
        var rounds = snaps[0].val() || {};
        var users = snaps[1].val() || {};

        var totalRounds = 0, completed = 0, active = 0;
        var filteredUsers = Object.entries(users).filter(function(e){
            var uid = e[0], u = e[1];
            return !(u && typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, u.name));
        });
        var dedupedUsers = (typeof dedupePlayerEntriesByFio === 'function') ? dedupePlayerEntriesByFio(filteredUsers) : filteredUsers;
        var totalPlayers = dedupedUsers.length;
        var totalHoles = 0;
        var birdies = 0, eagles = 0, pars = 0, hio = 0;
        var bestGross = Infinity, bestGrossPlayer = '—', bestGrossPid = null;
        var bestStableford = 0, bestStablefordPlayer = '—', bestStablefordPid = null;
        var fastestTime = Infinity, fastestPlayer = '—', fastestPid = null, fastestHoles = 18;
        var soloCount = 0, groupCount = 0;
        var totalStblFieldSum = 0, totalStblExactSum = 0;

        var holeScores = {};
        for (var h = 1; h <= 18; h++) holeScores[h] = { sum: 0, count: 0 };

        var playerRounds = {};

        Object.values(rounds).forEach(function(r) {
            if (!r || typeof r !== 'object') return;
            totalRounds++;

            var startTS = r.startTime || r.createdAt;
            var endTS = r.completedAt;

            var roundPlayersForStats = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(r.players || {}) : (r.players || {});

            if (r.status === 'completed') {
                completed++;
                
                if (startTS && endTS && endTS > startTS) {
                    var dur = (endTS - startTS) / 60000;
                    if (dur >= 0.5) {
                        Object.entries(roundPlayersForStats).forEach(function(pe) {
                            var p = pe[1];
                            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], p && p.name)) return;
                            var sc = p.scores || {};
                            var cnt = 0;
                            Object.values(sc).forEach(function(s) { if (parseInt(s) >= 1) cnt++; });
                            if (cnt > 0 && dur < fastestTime) {
                                fastestTime = dur;
                                fastestPlayer = p.name || 'Player';
                                fastestPid = pe[0];
                                fastestHoles = cnt;
                            }
                        });
                    }
                }
            }
            if (r.status === 'active') active++;
            if (r.mode === 'solo') soloCount++;
            else groupCount++;

            Object.entries(roundPlayersForStats).forEach(function(pe) {
                var pid = pe[0], p = pe[1];
                if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pid, p && p.name)) return;
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
                        bestGrossPid = pid;
                    }
                    if (stblF > bestStableford) {
                        bestStableford = stblF;
                        bestStablefordPlayer = p.name;
                        bestStablefordPid = pid;
                    }
                }

                if (r.status === 'completed' && holesPlayed === 18) {
                    if (!playerRounds[pid]) playerRounds[pid] = {
                        pid: pid, name: p.name, count: 0, totalGross: 0, totalStbl: 0
                    };
                    playerRounds[pid].count++;
                    playerRounds[pid].totalGross += gross;
                    playerRounds[pid].totalStbl += stblF;
                }
            });
        });

        var hourUnit = currentLang === 'en' ? 'h ' : 'ч ';
        var minUnit = currentLang === 'en' ? 'm' : 'м';
        var fastestStr = '—';

        if (fastestTime < Infinity) {
            if (fastestTime >= 60) {
                var hrs = Math.floor(fastestTime / 60);
                var mins = Math.round(fastestTime % 60);
                fastestStr = hrs + hourUnit + (mins > 0 ? mins + minUnit : '');
            } else {
                fastestStr = Math.max(1, Math.round(fastestTime)) + minUnit;
            }
            if (fastestHoles < 18) {
                fastestStr += ' (' + fastestHoles + (currentLang === 'en' ? 'h' : 'л') + ')';
            }
        }

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
                // Имя может быть скрыто настройками конфиденциальности.
                var nameObj = resolvePlayerDisplayName(p, p.pid, {
                    index: i + 1,
                    isSelf: !!(currentUser && currentUser.uid === p.pid)
                });
                thtml += '<div class="list-item">' +
                    '<span><strong style="color:var(--white);">' + medal + ' ' + escapeHtml(nameObj.text || 'Player') + '</strong></span>' +
                    '<span>' + avgWord + '<b style="color:var(--gold);">' + avg + '</b> · Stableford: <b style="color:var(--gold);">' + avgStbl + '</b> · ' + p.count + fullRoundsWord + '</span>' +
                    '</div>';
            });
            topEl.innerHTML = thtml;
        }

        var lBestGross18 = currentLang === 'en' ? '🏆 Best Gross (18 holes)' : '🏆 Лучший gross (18 лунок)';
        var lBestStbl18 = currentLang === 'en' ? '⭐ Best Stableford (18 holes)' : '⭐ Лучший stableford (18 лунок)';
        var lFastest18 = currentLang === 'en' ? '⏱️ Fastest Round (18 holes)' : '⏱️ Самый быстрый раунд (18 лунок)';

        // Рекорды клуба (только 18 лунок)
        var bestGrossName = resolvePlayerDisplayName({ name: bestGrossPlayer }, bestGrossPid, { isSelf: !!(currentUser && currentUser.uid === bestGrossPid) }).text;
        var bestStblName = resolvePlayerDisplayName({ name: bestStablefordPlayer }, bestStablefordPid, { isSelf: !!(currentUser && currentUser.uid === bestStablefordPid) }).text;
        var fastestName = resolvePlayerDisplayName({ name: fastestPlayer }, fastestPid, { isSelf: !!(currentUser && currentUser.uid === fastestPid) }).text;
        document.getElementById('club-records').innerHTML =
            '<div class="list-item"><span>' + lBestGross18 + '</span>' +
            '<strong>' + (bestGross < Infinity ? bestGross + ' (' + escapeHtml(bestGrossName) + ')' : '—') + '</strong></div>' +
            '<div class="list-item"><span>' + lBestStbl18 + '</span>' +
            '<strong>' + (bestStableford > 0 ? bestStableford + ' (' + escapeHtml(bestStblName) + ')' : '—') + '</strong></div>' +
            '<div class="list-item"><span>' + lFastest18 + '</span>' +
            '<strong>' + fastestStr + (fastestPlayer !== '—' ? ' (' + escapeHtml(fastestName) + ')' : '') + '</strong></div>' +
            '<div class="list-item"><span>🎯 Hole-in-One</span><strong>' + hio + '</strong></div>' +
            '<div class="list-item"><span>🦅 Eagles</span><strong>' + eagles + '</strong></div>' +
            '<div class="list-item"><span>🐦 Birdies</span><strong>' + birdies + '</strong></div>' +
            '<div class="list-item"><span>✅ Pars</span><strong>' + pars + '</strong></div>';

        // Сложность лунок (100% без скролла вбок)
        var holeHeader = t('hole');
        var parHeader = t('par');
        var avgHeader = currentLang === 'en' ? 'Average' : 'Средний';
        var isEn = currentLang === 'en';

        var pOut = 0, pIn = 0;
        var sumOut = 0, countOut = 0;
        var sumIn = 0, countIn = 0;

        for (var h = 1; h <= 9; h++) {
            pOut += holePar(h);
            var hs = holeScores[h];
            if (hs && hs.count > 0) { sumOut += hs.sum; countOut += hs.count; }
        }
        for (var h = 10; h <= 18; h++) {
            pIn += holePar(h);
            var hs = holeScores[h];
            if (hs && hs.count > 0) { sumIn += hs.sum; countIn += hs.count; }
        }

        var diffOut = countOut > 0 ? ((sumOut / countOut * 9) - pOut) : null;
        var diffIn = countIn > 0 ? ((sumIn / countIn * 9) - pIn) : null;

        var hHtml = '<div class="pestovo-modern-scorecard" style="margin-bottom:12px;padding:12px;box-sizing:border-box;max-width:100%;overflow-x:hidden;">';
        hHtml += '<div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:8px;padding-left:2px;"><i class="fas fa-flag"></i> ' + (isEn ? 'Front 9 (Holes 1–9)' : 'Первые 9 лунок (1–9)') + '</div>';
        hHtml += '<div class="msc-tile-grid msc-grid-9">';

        // Header Row
        hHtml += '<div class="msc-tile msc-hdr-lbl">' + (isEn ? 'Hole' : 'Лунка') + '</div>';
        for (var h = 1; h <= 9; h++) hHtml += '<div class="msc-tile msc-hdr-num">' + h + '</div>';
        hHtml += '<div class="msc-tile msc-hdr-tot">OUT</div>';

        // Par Row
        hHtml += '<div class="msc-tile msc-lbl-par">' + parHeader + '</div>';
        for (var h = 1; h <= 9; h++) hHtml += '<div class="msc-tile msc-val-par">' + holePar(h) + '</div>';
        hHtml += '<div class="msc-tile msc-tot-par">' + pOut + '</div>';

        // Avg Row
        hHtml += '<div class="msc-tile msc-lbl-wh">' + avgHeader + '</div>';
        for (var h = 1; h <= 9; h++) {
            var hs = holeScores[h];
            var avg = (hs && hs.count > 0) ? (hs.sum / hs.count).toFixed(1) : '—';
            hHtml += '<div class="msc-tile msc-val-wh">' + avg + '</div>';
        }
        var avgOutStr = (countOut > 0) ? (sumOut / (countOut / 9)).toFixed(1) : '—';
        hHtml += '<div class="msc-tile msc-tot-wh">' + avgOutStr + '</div>';

        // Diff Row (±Par)
        hHtml += '<div class="msc-tile msc-lbl-idx">±Par</div>';
        for (var h = 1; h <= 9; h++) {
            var hs = holeScores[h];
            if (!hs || hs.count === 0) {
                hHtml += '<div class="msc-tile msc-val-idx">—</div>';
            } else {
                var diff = (hs.sum / hs.count) - holePar(h);
                var diffStr = (diff > 0 ? '+' : '') + diff.toFixed(1);
                var colorStyle = diff > 0.3 ? 'color:#e74c3c;font-weight:800;' : diff < -0.1 ? 'color:#2ecc71;font-weight:800;' : 'color:var(--white);';
                hHtml += '<div class="msc-tile msc-val-idx" style="' + colorStyle + '">' + diffStr + '</div>';
            }
        }
        var diffOutStr = diffOut !== null ? (diffOut > 0 ? '+' : '') + diffOut.toFixed(1) : '—';
        var colorOutStyle = (diffOut !== null && diffOut > 0) ? 'color:#e74c3c;font-weight:800;' : 'color:#2ecc71;font-weight:800;';
        hHtml += '<div class="msc-tile msc-tot-idx" style="' + colorOutStyle + '">' + diffOutStr + '</div>';

        hHtml += '</div></div>';

        // Back 9 (IN & TOTAL)
        hHtml += '<div class="pestovo-modern-scorecard" style="padding:12px;box-sizing:border-box;max-width:100%;overflow-x:hidden;">';
        hHtml += '<div style="font-size:13px;font-weight:700;color:var(--gold);margin-bottom:8px;padding-left:2px;"><i class="fas fa-flag-checkered"></i> ' + (isEn ? 'Back 9 (Holes 10–18 & Total)' : 'Вторые 9 лунок (10–18 и Итог)') + '</div>';
        hHtml += '<div class="msc-tile-grid msc-grid-10">';

        // Header Row
        hHtml += '<div class="msc-tile msc-hdr-lbl">' + (isEn ? 'Hole' : 'Лунка') + '</div>';
        for (var h = 10; h <= 18; h++) hHtml += '<div class="msc-tile msc-hdr-num">' + h + '</div>';
        hHtml += '<div class="msc-tile msc-hdr-tot">IN</div>';
        hHtml += '<div class="msc-tile msc-hdr-tot" style="background:var(--gold);color:var(--bg);">' + (isEn ? 'TOT' : 'ВСЕГО') + '</div>';

        // Par Row
        hHtml += '<div class="msc-tile msc-lbl-par">' + parHeader + '</div>';
        for (var h = 10; h <= 18; h++) hHtml += '<div class="msc-tile msc-val-par">' + holePar(h) + '</div>';
        hHtml += '<div class="msc-tile msc-tot-par">' + pIn + '</div>';
        hHtml += '<div class="msc-tile msc-tot-par" style="font-weight:900;">' + (pOut + pIn) + '</div>';

        // Avg Row
        hHtml += '<div class="msc-tile msc-lbl-wh">' + avgHeader + '</div>';
        for (var h = 10; h <= 18; h++) {
            var hs = holeScores[h];
            var avg = (hs && hs.count > 0) ? (hs.sum / hs.count).toFixed(1) : '—';
            hHtml += '<div class="msc-tile msc-val-wh">' + avg + '</div>';
        }
        var avgInStr = (countIn > 0) ? (sumIn / (countIn / 9)).toFixed(1) : '—';
        hHtml += '<div class="msc-tile msc-tot-wh">' + avgInStr + '</div>';
        var totAvgStr = (countOut > 0 && countIn > 0) ? ((sumOut / (countOut / 9)) + (sumIn / (countIn / 9))).toFixed(1) : '—';
        hHtml += '<div class="msc-tile msc-tot-wh" style="font-weight:900;">' + totAvgStr + '</div>';

        // Diff Row (±Par)
        hHtml += '<div class="msc-tile msc-lbl-idx">±Par</div>';
        for (var h = 10; h <= 18; h++) {
            var hs = holeScores[h];
            if (!hs || hs.count === 0) {
                hHtml += '<div class="msc-tile msc-val-idx">—</div>';
            } else {
                var diff = (hs.sum / hs.count) - holePar(h);
                var diffStr = (diff > 0 ? '+' : '') + diff.toFixed(1);
                var colorStyle = diff > 0.3 ? 'color:#e74c3c;font-weight:800;' : diff < -0.1 ? 'color:#2ecc71;font-weight:800;' : 'color:var(--white);';
                hHtml += '<div class="msc-tile msc-val-idx" style="' + colorStyle + '">' + diffStr + '</div>';
            }
        }
        var diffInStr = diffIn !== null ? (diffIn > 0 ? '+' : '') + diffIn.toFixed(1) : '—';
        var colorInStyle = (diffIn !== null && diffIn > 0) ? 'color:#e74c3c;font-weight:800;' : 'color:#2ecc71;font-weight:800;';
        hHtml += '<div class="msc-tile msc-tot-idx" style="' + colorInStyle + '">' + diffInStr + '</div>';

        var totDiff = (diffOut !== null && diffIn !== null) ? (diffOut + diffIn) : null;
        var totDiffStr = totDiff !== null ? (totDiff > 0 ? '+' : '') + totDiff.toFixed(1) : '—';
        var colorTotStyle = (totDiff !== null && totDiff > 0) ? 'color:#e74c3c;font-weight:900;' : 'color:#2ecc71;font-weight:900;';
        hHtml += '<div class="msc-tile msc-tot-idx" style="' + colorTotStyle + '">' + totDiffStr + '</div>';

        hHtml += '</div></div>';
        document.getElementById('hole-difficulty').innerHTML = hHtml;
    });
}
