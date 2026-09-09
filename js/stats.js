document.addEventListener('DOMContentLoaded', function() {
    initNav();
    loadStats();
});

function onAuthReady(u, d) { navAuth(u, d); }

function safeSetHTML(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
}

function statsDisplayVariant() {
    var v = (typeof getStatsDisplayVariant === 'function') ? getStatsDisplayVariant() : '1';
    return v === '2' || v === '3' ? v : '1';
}

function applyStatsHostVariant(variant) {
    var host = document.getElementById('general-stats');
    if (!host) return;
    host.classList.remove('stats-grid', 'stats-variant-host', 'stats-variant-host-2', 'stats-variant-host-3');
    if (variant === '1') host.classList.add('stats-grid');
    else host.classList.add('stats-variant-host', 'stats-variant-host-' + variant);
}

function renderGeneralStatsDisplay(items, variant) {
    var html = '';
    if (variant === '2') {
        html = '<div class="stats-summary-grid stats-summary-grid-2">';
        items.forEach(function(item) {
            html += '<div class="stats-summary-item"><span><i class="fas ' + item.icon + '"></i> ' + item.label + '</span><b>' + item.value + '</b></div>';
        });
        return html + '</div>';
    }
    if (variant === '3') {
        html = '<div class="stats-dashboard stats-dashboard-3">';
        items.slice(0, 4).forEach(function(item, index) {
            html += '<div class="stats-dashboard-feature feature-' + index + '"><i class="fas ' + item.icon + '"></i><span>' + item.label + '</span><b>' + item.value + '</b></div>';
        });
        html += '<div class="stats-dashboard-mini">';
        items.slice(4).forEach(function(item) {
            html += '<div><i class="fas ' + item.icon + '"></i><span>' + item.label + '</span><b>' + item.value + '</b></div>';
        });
        return html + '</div></div>';
    }
    items.forEach(function(item) {
        html += '<div class="stat"><i class="fas ' + item.icon + '"></i><div class="stat-n">' + item.value + '</div><div class="stat-l">' + item.label + '</div></div>';
    });
    return html;
}

function renderTopPlayersDisplay(players, langIsEn, variant) {
    if (!players.length) {
        return '<div class="empty"><i class="fas fa-users"></i><p>' + (langIsEn ? 'No completed 18-hole rounds yet' : 'Нет завершённых раундов (18 лунок)') + '</p></div>';
    }
    function fullRoundsLabel(n) {
        if (langIsEn) return n === 1 ? 'full round' : 'full rounds';
        var mod10 = n % 10, mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'полный раунд';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'полных раунда';
        return 'полных раундов';
    }
    function placeLabel(i) {
        if (!langIsEn) return (i + 1) + ' место';
        return i === 0 ? '1st place' : i === 1 ? '2nd place' : i === 2 ? '3rd place' : (i + 1) + 'th place';
    }
    function playerName(p) {
        var n = typeof privacyDisplayName === 'function' ? privacyDisplayName(p, p.pid) : (p.name || '—');
        return typeof escapeHtml === 'function' ? escapeHtml(n) : n;
    }

    if (variant === '2') {
        var table = '<div class="stats-top-table"><div class="stats-top-table-head"><span>#</span><span>' + (langIsEn ? 'Player' : 'Игрок') + '</span><span>' + (langIsEn ? 'Avg gross' : 'Средний gross') + '</span><span>Stableford</span><span>' + (langIsEn ? 'Rounds' : 'Раунды') + '</span></div>';
        players.slice(0, 10).forEach(function(p, i) {
            table += '<div class="stats-top-table-row"><b>' + (i + 1) + '</b><strong>' + playerName(p) + '</strong><span>' + p.avg.toFixed(1) + '</span><span>' + p.avgStbl.toFixed(1) + '</span><span>' + p.count + '</span></div>';
        });
        return table + '</div>';
    }

    if (variant === '3') {
        var podium = '<div class="stats-podium">';
        players.slice(0, 3).forEach(function(p, i) {
            var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
            podium += '<div class="stats-podium-card podium-' + (i + 1) + '"><span class="stats-podium-medal">' + medal + '</span><strong>' + playerName(p) + '</strong><b>' + p.avg.toFixed(1) + '</b><small>' + (langIsEn ? 'avg gross · ' : 'средний gross · ') + p.count + ' ' + fullRoundsLabel(p.count) + '</small></div>';
        });
        podium += '</div><div class="stats-rank-list">';
        players.slice(3, 10).forEach(function(p, i) {
            podium += '<div class="stats-rank-row"><b>' + (i + 4) + '</b><span>' + playerName(p) + '</span><strong>' + p.avg.toFixed(1) + '</strong><em>' + p.avgStbl.toFixed(1) + ' Stb</em></div>';
        });
        return podium + '</div>';
    }

    var html = '';
    players.slice(0, 10).forEach(function(p, i) {
        var medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        html += '<div class="list-item"><span><strong style="color:var(--white);">' + medal + (medal ? ' ' : '') + placeLabel(i) + ' ' + playerName(p) + '</strong></span>' +
            '<span>' + (langIsEn ? 'Avg: ' : 'Средний: ') + '<b style="color:var(--gold);">' + p.avg.toFixed(1) + '</b> · Stableford: <b style="color:var(--gold);">' + p.avgStbl.toFixed(1) + '</b> · ' + p.count + ' ' + fullRoundsLabel(p.count) + '</span></div>';
    });
    return html;
}

function renderStatsRecordsDisplay(records, variant) {
    if (variant === '2') {
        return '<div class="stats-record-grid">' + records.map(function(r) {
            return '<div class="stats-record-chip"><span>' + r.label + '</span><b>' + r.value + '</b></div>';
        }).join('') + '</div>';
    }
    if (variant === '3') {
        return '<div class="stats-record-dashboard">' + records.slice(0, 3).map(function(r, i) {
            return '<div class="stats-record-feature feature-' + i + '"><i class="fas ' + r.icon + '"></i><span>' + r.label + '</span><b>' + r.value + '</b></div>';
        }).join('') + '<div class="stats-record-secondary">' + records.slice(3).map(function(r) {
            return '<div><span>' + r.label + '</span><b>' + r.value + '</b></div>';
        }).join('') + '</div></div>';
    }
    return records.map(function(r) {
        return '<div class="list-item"><span>' + r.label + '</span><strong>' + r.value + '</strong></div>';
    }).join('');
}

function renderHoleDifficultyVariant(holeScores, variant, langIsEn) {
    var rows = [];
    for (var h = 1; h <= 18; h++) {
        var item = holeScores[h] || { sum: 0, count: 0 };
        var par = typeof holePar === 'function' ? holePar(h) : 4;
        var avg = item.count ? item.sum / item.count : null;
        rows.push({ hole: h, par: par, avg: avg, diff: avg === null ? null : avg - par, count: item.count });
    }
    var played = rows.filter(function(r) { return r.avg !== null; });
    var hardest = played.slice().sort(function(a, b) { return b.diff - a.diff; }).slice(0, 3);
    var easiest = played.slice().sort(function(a, b) { return a.diff - b.diff; }).slice(0, 3);
    var fmtDiff = function(d) { return d === null ? '—' : (d > 0 ? '+' : '') + d.toFixed(1); };
    var holeLabel = langIsEn ? 'Hole' : 'Лунка';
    var avgLabel = langIsEn ? 'Average' : 'Средний';
    var countLabel = langIsEn ? 'Scores' : 'Счётов';

    if (variant === '3') {
        var html3 = '<div class="hole-difficulty-dashboard"><div class="hole-difficulty-highlights"><div><h4>🔥 ' + (langIsEn ? 'Hardest' : 'Самые сложные') + '</h4>';
        hardest.forEach(function(r) { html3 += '<span class="hole-highlight hard">' + holeLabel + ' ' + r.hole + ' <b>' + fmtDiff(r.diff) + '</b></span>'; });
        html3 += '</div><div><h4>✅ ' + (langIsEn ? 'Easiest' : 'Самые лёгкие') + '</h4>';
        easiest.forEach(function(r) { html3 += '<span class="hole-highlight easy">' + holeLabel + ' ' + r.hole + ' <b>' + fmtDiff(r.diff) + '</b></span>'; });
        html3 += '</div></div><div class="hole-difficulty-bars">';
        rows.forEach(function(r) {
            var width = r.diff === null ? 0 : Math.min(100, Math.max(8, 50 + r.diff * 35));
            html3 += '<div class="hole-bar-row"><span>' + r.hole + '</span><div><i style="width:' + width + '%"></i></div><b>' + fmtDiff(r.diff) + '</b></div>';
        });
        return html3 + '</div></div>';
    }

    var html2 = '<div class="hole-difficulty-table"><div class="hole-difficulty-table-head"><span>' + holeLabel + '</span><span>' + (langIsEn ? 'Par' : 'Пар') + '</span><span>' + avgLabel + '</span><span>±Par</span><span>' + countLabel + '</span></div>';
    rows.forEach(function(r) {
        html2 += '<div class="hole-difficulty-table-row"><b>' + r.hole + '</b><span>' + r.par + '</span><span>' + (r.avg === null ? '—' : r.avg.toFixed(1)) + '</span><strong class="' + (r.diff !== null && r.diff > 0 ? 'hole-over' : 'hole-under') + '">' + fmtDiff(r.diff) + '</strong><small>' + r.count + '</small></div>';
    });
    return html2 + '</div>';
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

        var variant = statsDisplayVariant();
        applyStatsHostVariant(variant);
        var generalItems = [
            { icon: 'fa-flag', value: totalRounds, label: lTotalRounds },
            { icon: 'fa-circle-play', value: active, label: lActiveRounds },
            { icon: 'fa-check-circle', value: completed, label: lCompletedRounds },
            { icon: 'fa-users', value: totalPlayers, label: lPlayers },
            { icon: 'fa-user', value: soloCount, label: lSolo },
            { icon: 'fa-user-group', value: groupCount, label: lGroup },
            { icon: 'fa-fire', value: birdies, label: 'Birdies' },
            { icon: 'fa-bolt', value: eagles, label: 'Eagles' },
            { icon: 'fa-circle-dot', value: hio, label: 'Hole-in-One' },
            { icon: 'fa-golf-ball-tee', value: totalHoles, label: lHoles }
        ];
        safeSetHTML('general-stats', renderGeneralStatsDisplay(generalItems, variant));

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
            topEl.innerHTML = renderTopPlayersDisplay(sortedByAvg, langIsEn, variant);
        }

        var lBestGross18 = langIsEn ? '🏆 Best Gross (18 holes)' : '🏆 Лучший gross (18 лунок)';
        var lBestStbl18 = langIsEn ? '⭐ Best Stableford (18 holes)' : '⭐ Лучший stableford (18 лунок)';
        var lFastest18 = langIsEn ? '⏱️ Fastest Round (18 holes)' : '⏱️ Самый быстрый раунд (18 лунок)';

        var records = [
            { icon: 'fa-trophy', label: lBestGross18, value: bestGross < Infinity ? bestGross + ' (' + (typeof escapeHtml === 'function' ? escapeHtml(bestGrossPlayer) : bestGrossPlayer) + ')' : '—' },
            { icon: 'fa-star', label: lBestStbl18, value: bestStableford > 0 ? bestStableford + ' (' + (typeof escapeHtml === 'function' ? escapeHtml(bestStablefordPlayer) : bestStablefordPlayer) + ')' : '—' },
            { icon: 'fa-stopwatch', label: lFastest18, value: fastestStr + (fastestPlayer !== '—' ? ' (' + (typeof escapeHtml === 'function' ? escapeHtml(fastestPlayer) : fastestPlayer) + ')' : '') },
            { icon: 'fa-bullseye', label: '🎯 Hole-in-One', value: hio },
            { icon: 'fa-bolt', label: '🦅 Eagles', value: eagles },
            { icon: 'fa-fire', label: '🐦 Birdies', value: birdies },
            { icon: 'fa-circle-check', label: '✅ Pars', value: pars }
        ];
        safeSetHTML('club-records', renderStatsRecordsDisplay(records, variant));

        var holeHeader = (typeof t === 'function' ? t('hole') : 'Hole');
        var parHeader = (typeof t === 'function' ? t('par') : 'Par');
        var avgHeader = langIsEn ? 'Average' : 'Средний';

        if (variant !== '1') {
            safeSetHTML('hole-difficulty', renderHoleDifficultyVariant(holeScores, variant, langIsEn));
        } else {
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
        }
    }).catch(function(err){
        console.error('[stats] load failed', err);
        safeSetHTML('general-stats', '<div class="empty"><i class="fas fa-triangle-exclamation"></i><p>Ошибка загрузки статистики</p></div>');
    });
}
