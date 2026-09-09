document.addEventListener('DOMContentLoaded', function() {
    initNav();
    loadStats();
});

function onAuthReady(u, d) { navAuth(u, d); }

function safeSetHTML(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function loadStats() {
    if (typeof db === 'undefined') {
        safeSetHTML('general-stats', '<div class="empty"><i class="fas fa-wifi-slash"></i><p>' + (typeof t === 'function' ? t('offline_title') : 'Нет соединения') + '</p></div>');
        return Promise.resolve();
    }
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
        var bestGross = Infinity, bestGrossPlayer = '—';
        var bestStableford = 0, bestStablefordPlayer = '—';
        var fastestTime = Infinity, fastestPlayer = '—', fastestHoles = 18;
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
                    if (dur >= 45) {
                        Object.entries(roundPlayersForStats).forEach(function(pe) {
                            var p = pe[1];
                            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], p && p.name)) return;
                            var sc = p.scores || {};
                            var cnt = 0;
                            Object.values(sc).forEach(function(s) { if (parseInt(s) >= 1) cnt++; });
                            if (cnt === 18 && dur < fastestTime) {
                                fastestTime = dur;
                                fastestPlayer = (typeof playerDisplayName === 'function' ? playerDisplayName(p, pe[0]) : (p.name || '—'));
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
                    if (isNaN(h) || h < 1 || h > 18) return;
                    var par = (typeof holePar === 'function' ? holePar(h) : 4);
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

                    if (typeof stablefordField === 'function') stblF += stablefordField(s, h, fieldHcp);
                    if (typeof stablefordExact === 'function') stblE += stablefordExact(s, h, exactHcp);
                });

                totalStblFieldSum += stblF;
                totalStblExactSum += stblE;

                if (holesPlayed === 18) {
                    if (gross > 0 && gross < bestGross) {
                        bestGross = gross;
                        bestGrossPlayer = (typeof playerDisplayName === 'function' ? playerDisplayName(p, pid) : (p.name || '—'));
                    }
                    if (stblF > bestStableford) {
                        bestStableford = stblF;
                        bestStablefordPlayer = (typeof playerDisplayName === 'function' ? playerDisplayName(p, pid) : (p.name || '—'));
                    }
                }

                if (r.status === 'completed' && holesPlayed === 18) {
                    if (!playerRounds[pid]) playerRounds[pid] = {
                        pid: pid, name: p.name, firstName: p.firstName || '', lastName: p.lastName || '', middleName: p.middleName || '', count: 0, totalGross: 0, totalStbl: 0
                    };
                    playerRounds[pid].count++;
                    playerRounds[pid].totalGross += gross;
                    playerRounds[pid].totalStbl += stblF;
                }
            });
        });

        var langIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        var hourUnit = langIsEn ? 'h ' : 'ч ';
        var minUnit = langIsEn ? 'm' : 'м';
        var fastestStr = '—';

        if (fastestTime < Infinity) {
            if (fastestTime >= 60) {
                var hrs = Math.floor(fastestTime / 60);
                var mins = Math.round(fastestTime % 60);
                fastestStr = hrs + hourUnit + (mins > 0 ? mins + minUnit : '');
            } else {
                fastestStr = Math.max(1, Math.round(fastestTime)) + minUnit;
            }
        }

        var lTotalRounds = langIsEn ? 'Total Rounds' : 'Всего раундов';
        var lActiveRounds = langIsEn ? 'Active Rounds' : 'Активных';
        var lCompletedRounds = langIsEn ? 'Completed' : 'Завершено';
        var lPlayers = langIsEn ? 'Players' : 'Игроков';
        var lSolo = langIsEn ? 'Solo Rounds' : 'Одиночных';
        var lGroup = langIsEn ? 'Group Rounds' : 'Групповых';
        var lHoles = langIsEn ? 'Holes Played' : 'Лунок сыграно';

        safeSetHTML('general-stats',
            '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">' + totalRounds + '</div><div class="stat-l">' + lTotalRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-circle-play"></i><div class="stat-n">' + active + '</div><div class="stat-l">' + lActiveRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-check-circle"></i><div class="stat-n">' + completed + '</div><div class="stat-l">' + lCompletedRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-users"></i><div class="stat-n">' + totalPlayers + '</div><div class="stat-l">' + lPlayers + '</div></div>' +
            '<div class="stat"><i class="fas fa-user"></i><div class="stat-n">' + soloCount + '</div><div class="stat-l">' + lSolo + '</div></div>' +
            '<div class="stat"><i class="fas fa-user-group"></i><div class="stat-n">' + groupCount + '</div><div class="stat-l">' + lGroup + '</div></div>' +
            '<div class="stat"><i class="fas fa-fire"></i><div class="stat-n">' + birdies + '</div><div class="stat-l">Birdies</div></div>' +
            '<div class="stat"><i class="fas fa-bolt"></i><div class="stat-n">' + eagles + '</div><div class="stat-l">Eagles</div></div>' +
            '<div class="stat"><i class="fas fa-circle-dot"></i><div class="stat-n">' + hio + '</div><div class="stat-l">Hole-in-One</div></div>' +
            '<div class="stat"><i class="fas fa-golf-ball-tee"></i><div class="stat-n">' + totalHoles + '</div><div class="stat-l">' + lHoles + '</div></div>');

        var sortedByAvg = Object.values(playerRounds).map(function(p) {
            return {
                pid: p.pid, name: p.name,
                count: p.count,
                avg: p.totalGross / p.count,
                avgStbl: p.totalStbl / p.count
            };
        }).sort(function(a, b) {
            if (a.avg !== b.avg) return a.avg - b.avg;
            if (a.avgStbl !== b.avgStbl) return b.avgStbl - a.avgStbl;
            return b.count - a.count;
        });
        var topEl = document.getElementById('top-players');

        if (topEl) {
            if (sortedByAvg.length === 0) {
                topEl.innerHTML = '<div class="empty"><i class="fas fa-users"></i><p>' + (langIsEn ? 'No completed 18-hole rounds yet' : 'Нет завершённых раундов (18 лунок)') + '</p></div>';
            } else {
                var thtml = '';
                var avgWord = langIsEn ? 'Avg: ' : 'Средний: ';
                function fullRoundsLabel(n) {
                    if (langIsEn) return n === 1 ? 'full round' : 'full rounds';
                    var mod10 = n % 10, mod100 = n % 100;
                    if (mod10 === 1 && mod100 !== 11) return 'полный раунд';
                    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'полных раунда';
                    return 'полных раундов';
                }
                sortedByAvg.slice(0, 10).forEach(function(p, i) {
                    var place = i + 1;
                    var placeLabel = langIsEn
                        ? (i === 0 ? '1st place' : i === 1 ? '2nd place' : i === 2 ? '3rd place' : place + 'th place')
                        : place + ' место';
                    var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                    var displayName = (typeof privacyDisplayName === 'function' ? privacyDisplayName(p, p.pid) : (p.name || '—'));
                    thtml += '<div class="list-item">' +
                        '<span><strong style="color:var(--white);">' + medal + (medal ? ' ' : '') + placeLabel + ' ' + (typeof escapeHtml === 'function' ? escapeHtml(displayName) : displayName) + '</strong></span>' +
                        '<span>' + avgWord + '<b style="color:var(--gold);">' + p.avg.toFixed(1) + '</b> · Stableford: <b style="color:var(--gold);">' + p.avgStbl.toFixed(1) + '</b> · ' + p.count + ' ' + fullRoundsLabel(p.count) + '</span>' +
                        '</div>';
                });
                topEl.innerHTML = thtml;
            }
        }

        var lBestGross18 = langIsEn ? '🏆 Best Gross (18 holes)' : '🏆 Лучший gross (18 лунок)';
        var lBestStbl18 = langIsEn ? '⭐ Best Stableford (18 holes)' : '⭐ Лучший stableford (18 лунок)';
        var lFastest18 = langIsEn ? '⏱️ Fastest Round (18 holes)' : '⏱️ Самый быстрый раунд (18 лунок)';

        safeSetHTML('club-records',
            '<div class="list-item"><span>' + lBestGross18 + '</span>' +
            '<strong>' + (bestGross < Infinity ? bestGross + ' (' + (typeof escapeHtml === 'function' ? escapeHtml(bestGrossPlayer) : bestGrossPlayer) + ')' : '—') + '</strong></div>' +
            '<div class="list-item"><span>' + lBestStbl18 + '</span>' +
            '<strong>' + (bestStableford > 0 ? bestStableford + ' (' + (typeof escapeHtml === 'function' ? escapeHtml(bestStablefordPlayer) : bestStablefordPlayer) + ')' : '—') + '</strong></div>' +
            '<div class="list-item"><span>' + lFastest18 + '</span>' +
            '<strong>' + fastestStr + (fastestPlayer !== '—' ? ' (' + (typeof escapeHtml === 'function' ? escapeHtml(fastestPlayer) : fastestPlayer) + ')' : '') + '</strong></div>' +
            '<div class="list-item"><span>🎯 Hole-in-One</span><strong>' + hio + '</strong></div>' +
            '<div class="list-item"><span>🦅 Eagles</span><strong>' + eagles + '</strong></div>' +
            '<div class="list-item"><span>🐦 Birdies</span><strong>' + birdies + '</strong></div>' +
            '<div class="list-item"><span>✅ Pars</span><strong>' + pars + '</strong></div>');

        var holeHeader = (typeof t === 'function' ? t('hole') : 'Hole');
        var parHeader = (typeof t === 'function' ? t('par') : 'Par');
        var avgHeader = langIsEn ? 'Average' : 'Средний';

        var pOut = 0, pIn = 0;
        var sumOut = 0, countOut = 0;
        var sumIn = 0, countIn = 0;

        for (var h = 1; h <= 9; h++) {
            pOut += (typeof holePar === 'function' ? holePar(h) : 4);
            var hs = holeScores[h];
            if (hs && hs.count > 0) { sumOut += hs.sum; countOut += hs.count; }
        }
        for (var h = 10; h <= 18; h++) {
            pIn += (typeof holePar === 'function' ? holePar(h) : 4);
            var hs = holeScores[h];
            if (hs && hs.count > 0) { sumIn += hs.sum; countIn += hs.count; }
        }

        var diffOut = countOut > 0 ? ((sumOut / countOut * 9) - pOut) : null;
        var diffIn = countIn > 0 ? ((sumIn / countIn * 9) - pIn) : null;

        var hHtml = '<div class="pestovo-modern-scorecard" style="margin-bottom:12px;padding:12px;box-sizing:border-box;max-width:100%;overflow-x:hidden;">';
        hHtml += '<div class="msc-tile-grid msc-grid-9">';
        hHtml += '<div class="msc-tile msc-hdr-lbl">' + (langIsEn ? 'Hole' : 'Лунка') + '</div>';
        for (var h = 1; h <= 9; h++) hHtml += '<div class="msc-tile msc-hdr-num">' + h + '</div>';
        hHtml += '<div class="msc-tile msc-hdr-tot">OUT</div>';
        hHtml += '<div class="msc-tile msc-lbl-par">' + parHeader + '</div>';
        for (var h = 1; h <= 9; h++) hHtml += '<div class="msc-tile msc-val-par">' + (typeof holePar === 'function' ? holePar(h) : 4) + '</div>';
        hHtml += '<div class="msc-tile msc-tot-par">' + pOut + '</div>';
        hHtml += '<div class="msc-tile msc-lbl-wh">' + avgHeader + '</div>';
        for (var h = 1; h <= 9; h++) {
            var hs = holeScores[h];
            var avg = (hs && hs.count > 0) ? (hs.sum / hs.count).toFixed(1) : '—';
            hHtml += '<div class="msc-tile msc-val-wh">' + avg + '</div>';
        }
        var avgOutStr = (countOut > 0) ? (sumOut / (countOut / 9)).toFixed(1) : '—';
        hHtml += '<div class="msc-tile msc-tot-wh">' + avgOutStr + '</div>';
        hHtml += '<div class="msc-tile msc-lbl-idx">±Par</div>';
        for (var h = 1; h <= 9; h++) {
            var hs = holeScores[h];
            if (!hs || hs.count === 0) {
                hHtml += '<div class="msc-tile msc-val-idx">—</div>';
            } else {
                var diff = (hs.sum / hs.count) - (typeof holePar === 'function' ? holePar(h) : 4);
                var diffStr = (diff > 0 ? '+' : '') + diff.toFixed(1);
                var colorStyle = diff > 0.3 ? 'color:#e74c3c;font-weight:800;' : diff < -0.1 ? 'color:#2ecc71;font-weight:800;' : 'color:var(--white);';
                hHtml += '<div class="msc-tile msc-val-idx" style="' + colorStyle + '">' + diffStr + '</div>';
            }
        }
        var diffOutStr = diffOut !== null ? (diffOut > 0 ? '+' : '') + diffOut.toFixed(1) : '—';
        var colorOutStyle = (diffOut !== null && diffOut > 0) ? 'color:#e74c3c;font-weight:800;' : 'color:#2ecc71;font-weight:800;';
        hHtml += '<div class="msc-tile msc-tot-idx" style="' + colorOutStyle + '">' + diffOutStr + '</div>';
        hHtml += '</div></div>';

        hHtml += '<div class="pestovo-modern-scorecard" style="padding:12px;box-sizing:border-box;max-width:100%;overflow-x:hidden;">';
        hHtml += '<div class="msc-tile-grid msc-grid-10">';
        hHtml += '<div class="msc-tile msc-hdr-lbl">' + (langIsEn ? 'Hole' : 'Лунка') + '</div>';
        for (var h = 10; h <= 18; h++) hHtml += '<div class="msc-tile msc-hdr-num">' + h + '</div>';
        hHtml += '<div class="msc-tile msc-hdr-tot">IN</div>';
        hHtml += '<div class="msc-tile msc-hdr-tot" style="background:var(--gold);color:var(--bg);">' + (langIsEn ? 'TOT' : 'ВСЕГО') + '</div>';
        hHtml += '<div class="msc-tile msc-lbl-par">' + parHeader + '</div>';
        for (var h = 10; h <= 18; h++) hHtml += '<div class="msc-tile msc-val-par">' + (typeof holePar === 'function' ? holePar(h) : 4) + '</div>';
        hHtml += '<div class="msc-tile msc-tot-par">' + pIn + '</div>';
        hHtml += '<div class="msc-tile msc-tot-par" style="font-weight:900;">' + (pOut + pIn) + '</div>';
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
        hHtml += '<div class="msc-tile msc-lbl-idx">±Par</div>';
        for (var h = 10; h <= 18; h++) {
            var hs = holeScores[h];
            if (!hs || hs.count === 0) {
                hHtml += '<div class="msc-tile msc-val-idx">—</div>';
            } else {
                var diff = (hs.sum / hs.count) - (typeof holePar === 'function' ? holePar(h) : 4);
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
        safeSetHTML('hole-difficulty', hHtml);
    }).catch(function(err){
        console.error('[stats] load failed', err);
        safeSetHTML('general-stats', '<div class="empty"><i class="fas fa-triangle-exclamation"></i><p>Ошибка загрузки статистики</p></div>');
    });
}
