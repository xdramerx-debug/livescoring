document.addEventListener('DOMContentLoaded', function() { initNav(); loadPlayers(); });
function onAuthReady(u, d) { navAuth(u, d); }

function loadPlayers() {
    db.ref('users').on('value', function(sn) {
        var data = sn.val() || {};
        var el = document.getElementById('players-grid');
        var entries = Object.entries(data);
        if (!entries.length) { el.innerHTML = '<div class="empty" style="grid-column:1/-1;"><i class="fas fa-users"></i><p>Нет игроков</p></div>'; return; }
        var filterGender = document.getElementById('filter-gender') ? document.getElementById('filter-gender').value : 'all';
        var filterType = document.getElementById('filter-type') ? document.getElementById('filter-type').value : 'all';
        var sortBy = document.getElementById('sort-by') ? document.getElementById('sort-by').value : 'rounds';
        if (filterGender !== 'all') entries = entries.filter(function(e) { return e[1].gender === filterGender; });
        if (filterType === 'registered') entries = entries.filter(function(e) { return !e[1].isGuest; });
        else if (filterType === 'guests') entries = entries.filter(function(e) { return e[1].isGuest === true; });
        entries.sort(function(a, b) {
            if (sortBy === 'hcp-asc') { var ha = a[1].handicap != null ? a[1].handicap : 999; var hb = b[1].handicap != null ? b[1].handicap : 999; return ha - hb; }
            if (sortBy === 'hcp-desc') { var ha = a[1].handicap != null ? a[1].handicap : -999; var hb = b[1].handicap != null ? b[1].handicap : -999; return hb - ha; }
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
                '<div style="font-size:12px;color:var(--muted);margin-top:4px;">HCP: ' + (u.handicap != null ? u.handicap : '—') +
                ' · Раундов: ' + (u.roundsPlayed || 0) +
                (u.bestGross ? ' · Gross: ' + u.bestGross : '') +
                (u.bestStableford ? ' · Stblfd: ' + u.bestStableford : '') +
                '</div></div></div></div>';
        });
        el.innerHTML = html;
    });
}

function showPlayer(id) {
    db.ref('users/' + id).once('value').then(function(sn) {
        var u = sn.val(); if (!u) return;
        var gIcon = u.gender === 'women' ? '👩' : '👨';
        var guestBadge = u.isGuest ? '<span style="background:rgba(201,168,76,0.15);color:var(--gold);padding:2px 8px;border-radius:12px;font-size:11px;margin-left:8px;">ГОСТЬ</span>' : '';
        var html = '<div class="profile-head">' +
            '<div class="profile-avatar">' + (u.name ? u.name.charAt(0) : '?') + '</div>' +
            '<div><div class="profile-name">' + gIcon + ' ' + (u.name || '—') + guestBadge + '</div>' +
            '<div class="profile-meta">' +
            '<span><i class="fas fa-golf-ball"></i> HCP: ' + (u.handicap != null ? u.handicap : '—') + '</span>' +
            '<span><i class="fas fa-flag"></i> ' + (u.roundsPlayed || 0) + ' раундов</span>' +
            '<span><i class="fas fa-trophy"></i> Gross: ' + (u.bestGross || '—') + '</span>' +
            '<span><i class="fas fa-star"></i> Stblfd: ' + (u.bestStableford || '—') + '</span>' +
            '</div></div></div>';
        db.ref('users/' + id + '/history').once('value').then(function(hSn) {
            var history = hSn.val() || {};
            var rounds = Object.values(history);
            rounds.sort(function(a, b) { return (b.date || 0) - (a.date || 0); });
            var totalGross = 0, totalBirdies = 0, totalEagles = 0, totalHIO = 0;
            rounds.forEach(function(r) {
                totalGross += r.gross || 0;
                totalBirdies += r.birdies || 0;
                totalEagles += r.eagles || 0;
                totalHIO += r.holeInOne || 0;
            });
            var avg = rounds.length > 0 ? (totalGross / rounds.length).toFixed(1) : '—';
            html += '<div class="p-stats" style="margin-top:24px;">' +
                '<div class="p-stat"><div class="p-stat-v">' + rounds.length + '</div><div class="p-stat-l">Раунды</div></div>' +
                '<div class="p-stat"><div class="p-stat-v">' + (u.bestGross || '—') + '</div><div class="p-stat-l">Лучший gross</div></div>' +
                '<div class="p-stat"><div class="p-stat-v">' + avg + '</div><div class="p-stat-l">Средний</div></div>' +
                '<div class="p-stat"><div class="p-stat-v" style="color:var(--gold);">' + totalHIO + '</div><div class="p-stat-l">🎯 HIO</div></div>' +
                '</div>';
            html += '<h3 style="color:var(--gold);margin:24px 0 12px;font-family:var(--ff);font-size:18px;"><i class="fas fa-history"></i> История</h3>';
            if (!rounds.length) { html += '<p style="color:var(--muted);">Нет раундов</p>'; }
            else {
                rounds.forEach(function(r) {
                    html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;">' +
                        '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);">Пестово</strong>' +
                        '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' +
                        fmtDate(r.date) + ' · ' + (r.format || 'Stroke') + ' · ТИ: ' + (r.tee ? TEES[r.tee] : '—') +
                        ' · ' + (r.mode === 'solo' ? '👤' : '👥') + '</div></div>' +
                        '<div style="text-align:right;">' +
                        '<div style="font-size:22px;font-weight:800;color:var(--white);">' + r.gross + '</div>' +
                        '<div class="' + scoreClass(r.toPar) + '" style="font-size:14px;font-weight:700;">' + fmtScore(r.toPar) + '</div>' +
                        (r.roundId ? '<button class="btn btn-og btn-sm" style="margin-top:6px;" onclick="event.stopPropagation();downloadScorecard(\'' + r.roundId + '\')"><i class="fas fa-download"></i></button>' : '') +
                        '</div></div>';
                });
            }
            document.getElementById('pmodal-body').innerHTML = html;
            document.getElementById('pmodal').classList.remove('hidden');
        });
    });
}

function closePModal() { document.getElementById('pmodal').classList.add('hidden'); }