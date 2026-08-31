document.addEventListener('DOMContentLoaded', function() {
    initNav();
    loadOrderOfMerit();
});

function onAuthReady(u, d) { navAuth(u, d); }

function loadOrderOfMerit() {
    if (typeof db === 'undefined') return;

    Promise.all([
        db.ref('users').once('value'),
        db.ref('rounds').once('value')
    ]).then(function(snaps) {
        var users = snaps[0].val() || {};
        var rounds = snaps[1].val() || {};
        var el = document.getElementById('oom-list');
        if (!el) return;

        var seasonPoints = {};

        // Базовые очки участия начисляются всем игрокам, в том числе тем, у кого
        // уже есть турнирные результаты (раньше они ошибочно их не получали).
        var filteredUserEntries = Object.entries(users).filter(function(ue){
            var uid = ue[0], u = ue[1];
            return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, u && u.name));
        });
        var dedupedUserEntries = (typeof dedupePlayerEntriesByFio === 'function') ? dedupePlayerEntriesByFio(filteredUserEntries) : filteredUserEntries;
        dedupedUserEntries.forEach(function(ue) {
            var uid = ue[0], u = ue[1];
            seasonPoints[uid] = {
                pid: uid,
                name: u.name || 'Player',
                avatar: u.avatar,
                points: (u.roundsPlayed || 0) * 5,
                tournamentsPlayed: 0,
                wins: 0
            };
        });

        // Турнирные места считаются только для завершённых раундов, связанных
        // с турниром. Обычные тренировки больше не дают турнирные очки.
        var placementPoints = [100, 80, 70, 60, 50, 40, 30, 25, 20, 15];

        Object.entries(rounds).forEach(function(e) {
            var id = e[0], r = e[1];
            if (!r || r.status !== 'completed' || !r.tournamentId || !r.players) return;

            var order = getRoundOrder(r);
            var rawRoundPlayers = r.players || {};
            var dedupedRoundPlayers = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(rawRoundPlayers) : rawRoundPlayers;
            var players = Object.entries(dedupedRoundPlayers).filter(function(pe) {
                return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name));
            }).map(function(pe) {
                var pid = pe[0], p = pe[1];
                var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);
                return { pid: pid, name: p.name, toPar: stats.toPar, gross: stats.gross, stbl: stats.stablefordField };
            });

            players.sort(function(a, b) {
                if (a.toPar === null && b.toPar === null) return 0;
                if (a.toPar === null) return 1;
                if (b.toPar === null) return -1;
                return a.toPar - b.toPar;
            });

            players.forEach(function(p, rank) {
                var pts = placementPoints[rank] || 10;
                if (!seasonPoints[p.pid]) {
                    seasonPoints[p.pid] = {
                        pid: p.pid,
                        name: p.name || (users[p.pid] ? users[p.pid].name : 'Player'),
                        avatar: users[p.pid] ? users[p.pid].avatar : null,
                        points: 0,
                        tournamentsPlayed: 0,
                        wins: 0
                    };
                }
                seasonPoints[p.pid].points += pts;
                seasonPoints[p.pid].tournamentsPlayed += 1;
                if (rank === 0) seasonPoints[p.pid].wins += 1;
            });
        });

        var standings = Object.values(seasonPoints);
        if (!standings.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>' + (currentLang === 'en' ? 'No season points recorded yet' : 'Пока нет очков в сезонном зачёте') + '</p></div>';
            return;
        }

        standings.sort(function(a, b) { return b.points - a.points; });

        var posHeader = currentLang === 'en' ? 'Rank' : 'Ранг';
        var pointsHeader = currentLang === 'en' ? 'Season Points' : 'Очки сезона';

        var html = '<div style="overflow-x:auto;"><table class="lb-table lb-cards"><thead><tr>';
        html += '<th style="width:50px;">' + posHeader + '</th>';
        html += '<th>' + t('player') + '</th>';
        html += '<th style="text-align:center;">' + (currentLang === 'en' ? 'Tournaments' : 'Турниров') + '</th>';
        html += '<th style="text-align:center;">' + (currentLang === 'en' ? 'Wins' : 'Побед 🏆') + '</th>';
        html += '<th style="text-align:center;">' + pointsHeader + '</th>';
        html += '</tr></thead><tbody>';

        standings.forEach(function(p, i) {
            var posCls = (i + 1) <= 3 ? 'lb-' + (i + 1) : '';
            var crown = (i === 0) ? ' 👑' : '';

            html += '<tr style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + p.pid + '\')">';
            html += '<td class="lb-pos ' + posCls + '" data-label="' + posHeader + '">' + (i + 1) + '</td>';
            html += '<td class="lb-card-main"><div style="display:flex;align-items:center;gap:10px;">' + fmtUserAvatar(p, 36) + '<div><strong style="color:var(--gold);font-size:15px;">' + escapeHtml(privacyDisplayName(p, p.pid)) + crown + '</strong></div></div></td>';
            html += '<td style="text-align:center;" data-label="' + (currentLang === 'en' ? 'Tournaments' : 'Турниров') + '">' + p.tournamentsPlayed + '</td>';
            html += '<td style="text-align:center;color:var(--gold);font-weight:700;" data-label="' + (currentLang === 'en' ? 'Wins' : 'Побед') + '">' + p.wins + '</td>';
            html += '<td style="text-align:center;font-size:20px;font-weight:800;color:var(--white);" data-label="' + pointsHeader + '"><span class="badge-eag">' + p.points + ' PTS</span></td>';
            html += '</tr>';
        });

        html += '</tbody></table></div>';

        el.innerHTML = html;
    });
}
