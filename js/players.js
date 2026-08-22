document.addEventListener('DOMContentLoaded', function() {
    initNav();
    loadPlayers();
});

function onAuthReady(u, d) { navAuth(u, d); }

function loadPlayers() {
    db.ref('users').on('value', function(sn) {
        var data = sn.val() || {};
        var el = document.getElementById('players-grid');
        if (!el) return;
        var entries = Object.entries(data);

        if (!entries.length) {
            el.innerHTML = '<div class="empty" style="grid-column:1/-1;"><i class="fas fa-users"></i><p>Нет игроков</p></div>';
            return;
        }

        var filterGender = document.getElementById('filter-gender') ? document.getElementById('filter-gender').value : 'all';
        var filterType = document.getElementById('filter-type') ? document.getElementById('filter-type').value : 'all';
        var sortBy = document.getElementById('sort-by') ? document.getElementById('sort-by').value : 'rounds';

        if (filterGender !== 'all') {
            entries = entries.filter(function(e) { return e[1].gender === filterGender; });
        }

        if (filterType === 'registered') {
            entries = entries.filter(function(e) { return !e[1].isGuest; });
        } else if (filterType === 'guests') {
            entries = entries.filter(function(e) { return e[1].isGuest === true; });
        }

        entries.sort(function(a, b) {
            if (sortBy === 'hcp-asc') {
                var ha = a[1].handicap != null ? parseExactHcp(a[1].handicap) : 999;
                var hb = b[1].handicap != null ? parseExactHcp(b[1].handicap) : 999;
                return ha - hb;
            }
            if (sortBy === 'hcp-desc') {
                var ha = a[1].handicap != null ? parseExactHcp(a[1].handicap) : -999;
                var hb = b[1].handicap != null ? parseExactHcp(b[1].handicap) : -999;
                return hb - ha;
            }
            return (b[1].roundsPlayed || 0) - (a[1].roundsPlayed || 0);
        });

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], u = e[1];
            var gIcon = u.gender === 'women' ? '👩' : '👨';
            var guestBadge = u.isGuest ? '<span style="background:rgba(201,168,76,0.15);color:var(--gold);padding:2px 8px;border-radius:12px;font-size:10px;margin-left:6px;">ГОСТЬ</span>' : '';

            html += '<div class="card" style="cursor:pointer;" onclick="showPlayer(\'' + id + '\')">' +
                '<div style="display:flex;align-items:center;gap:14px;">' +
                '<div class="lb-avatar" style="width:52px;height:52px;font-size:20px;">' + (u.name ? u.name.charAt(0) : '?') + '</div>' +
                '<div style="flex:1;"><div style="font-weight:700;color:var(--white);font-size:15px;">' + gIcon + ' ' + (u.name || '—') + guestBadge + '</div>' +
                '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                'HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') +
                ' · Раундов: ' + (u.roundsPlayed || 0) +
                (u.bestGross ? ' · Gross (18л): ' + u.bestGross : '') +
                (u.bestStableford ? ' · Stblfd (18л): ' + u.bestStableford : '') +
                '</div></div></div></div>';
        });

        el.innerHTML = html;
    });
}

function showPlayer(id) {
    db.ref('users/' + id).once('value').then(function(sn) {
        var u = sn.val();
        if (!u) return;

        var gIcon = u.gender === 'women' ? '👩' : '👨';
        var guestBadge = u.isGuest ? '<span style="background:rgba(201,168,76,0.15);color:var(--gold);padding:2px 8px;border-radius:12px;font-size:11px;margin-left:8px;">ГОСТЬ</span>' : '';

        var html = '<div class="profile-head">';
        html += '<div class="profile-avatar">' + (u.name ? u.name.charAt(0) : '?') + '</div>';
        html += '<div><div class="profile-name">' + gIcon + ' ' + (u.name || '—') + guestBadge + '</div>';
        html += '<div class="profile-meta">';
        html += '<span><i class="fas fa-golf-ball"></i> HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') + '</span>';
        html += '<span><i class="fas fa-flag"></i> ' + (u.roundsPlayed || 0) + ' раундов</span>';
        html += '<span><i class="fas fa-trophy"></i> Gross (18л): ' + (u.bestGross || '—') + '</span>';
        html += '<span><i class="fas fa-star"></i> Stblfd (18л): ' + (u.bestStableford || '—') + '</span>';
        if (u.email) html += '<span><i class="fas fa-envelope"></i> ' + u.email + '</span>';
        html += '</div></div></div>';

        db.ref('users/' + id + '/history').once('value').then(function(hSn) {
            var history = hSn.val() || {};
            var rounds = Object.values(history);
            rounds.sort(function(a, b) { return (b.date || 0) - (a.date || 0); });

            var totalGross = 0, totalBirdies = 0, totalEagles = 0, totalPars = 0, totalHIO = 0;
            var totalStblF = 0, totalStblE = 0, soloC = 0, groupC = 0, totalHoles = 0;
            var fullRoundsCount = 0;

            rounds.forEach(function(r) {
                if (r.holes === 18) {
                    totalGross += r.gross || 0;
                    fullRoundsCount++;
                }
                totalHoles += r.holes || 0;
                totalBirdies += r.birdies || 0;
                totalEagles += r.eagles || 0;
                totalPars += r.pars || 0;
                totalHIO += r.holeInOne || 0;
                totalStblF += r.stablefordField || 0;
                totalStblE += r.stablefordExact || 0;
                if (r.mode === 'solo') soloC++;
                else groupC++;
            });

            var avgGross = fullRoundsCount > 0 ? (totalGross / fullRoundsCount).toFixed(1) : '—';

            html += '<div class="p-stats" style="margin-top:24px;">';
            html += '<div class="p-stat"><div class="p-stat-v">' + rounds.length + '</div><div class="p-stat-l">Раунды</div></div>';
            html += '<div class="p-stat"><div class="p-stat-v">' + (u.bestGross || '—') + '</div><div class="p-stat-l">Лучший Gross (18л)</div></div>';
            html += '<div class="p-stat"><div class="p-stat-v">' + (u.bestStableford || '—') + '</div><div class="p-stat-l">Лучший Stblfd (18л)</div></div>';
            html += '<div class="p-stat"><div class="p-stat-v">' + avgGross + '</div><div class="p-stat-l">Средний Gross (18л)</div></div>';
            html += '</div>';

            html += '<div class="p-stats">';
            html += '<div class="p-stat"><div class="p-stat-v" style="color:#e05a4a;">' + totalHIO + '</div><div class="p-stat-l">🎯 HIO</div></div>';
            html += '<div class="p-stat"><div class="p-stat-v" style="color:#e05a4a;">' + totalEagles + '</div><div class="p-stat-l">🦅 Eagles</div></div>';
            html += '<div class="p-stat"><div class="p-stat-v" style="color:#e05a4a;">' + totalBirdies + '</div><div class="p-stat-l">🐦 Birdies</div></div>';
            html += '<div class="p-stat"><div class="p-stat-v">' + totalPars + '</div><div class="p-stat-l">✅ Pars</div></div>';
            html += '</div>';

            html += '<div class="p-stats">';
            html += '<div class="p-stat"><div class="p-stat-v" style="color:var(--gold);">' + totalStblF + '</div><div class="p-stat-l">Stblfd (пол.)</div></div>';
            html += '<div class="p-stat"><div class="p-stat-v">' + totalStblE + '</div><div class="p-stat-l">Stblfd (игр.)</div></div>';
            html += '<div class="p-stat"><div class="p-stat-v">' + soloC + '</div><div class="p-stat-l">👤 Одиночных</div></div>';
            html += '<div class="p-stat"><div class="p-stat-v">' + groupC + '</div><div class="p-stat-l">👥 Групповых</div></div>';
            html += '</div>';

            html += '<h3 style="color:var(--gold);margin:24px 0 12px;font-family:var(--ff);font-size:18px;"><i class="fas fa-history"></i> История раундов</h3>';

            if (!rounds.length) {
                html += '<p style="color:var(--muted);">Нет раундов</p>';
            } else {
                rounds.forEach(function(r) {
                    var isFull = r.holes === 18;
                    var fullTag = isFull ? ' <span style="color:#2ecc71;font-size:10px;">(18л)</span>' : ' <span style="color:var(--muted);font-size:10px;">(' + r.holes + 'л)</span>';

                    html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;">';
                    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);">Пестово</strong>' + fullTag;
                    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' +
                            fmtDate(r.date) + ' · ' + (r.format || 'Stroke') + ' · ТИ: ' + (r.tee ? TEES[r.tee] : '—') +
                            ' · ' + (r.mode === 'solo' ? '👤' : '👥') + '</div>';
                    html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' +
                            (r.holeInOne ? '🎯 ' + r.holeInOne + ' · ' : '') +
                            '🦅 ' + (r.eagles || 0) + ' · 🐦 ' + (r.birdies || 0) + ' · Par ' + (r.pars || 0) + '</div></div>';
                    html += '<div style="text-align:right;">';
                    html += '<div style="font-size:22px;font-weight:800;color:var(--white);">' + r.gross + '</div>';
                    html += '<div class="' + scoreClass(r.toPar) + '" style="font-size:14px;font-weight:700;">' + fmtScore(r.toPar) + '</div>';
                    if (r.roundId) {
                        html += '<button class="btn btn-og btn-sm" style="margin-top:6px;" onclick="event.stopPropagation();downloadScorecard(\'' + r.roundId + '\')"><i class="fas fa-download"></i></button>';
                    }
                    html += '</div></div>';
                });
            }

            var modalBody = document.getElementById('pmodal-body');
            var modalEl = document.getElementById('pmodal');
            if (modalBody) modalBody.innerHTML = html;
            if (modalEl) modalEl.classList.remove('hidden');
        });
    });
}

function closePModal() {
    var modalEl = document.getElementById('pmodal');
    if (modalEl) modalEl.classList.add('hidden');
}
