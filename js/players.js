document.addEventListener('DOMContentLoaded', function() {
    initNav();
    loadPlayers();
});

function onAuthReady(u, d) { navAuth(u, d); }

function loadPlayers() {
    bindRealtimeValue('players-list', db.ref('users'), function(sn) {
        var data = sn.val() || {};
        var el = document.getElementById('players-grid');
        if (!el) return;
        var entries = Object.entries(data).filter(function(e) {
            if (!e || !e[1] || typeof e[1] !== 'object') return false;
            // Удалённые и навсегда заблокированные демо-игроки не показываются
            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(e[0], e[1].name)) return false;
            return true;
        });

        var searchInp = document.getElementById('players-search');
        var query = searchInp ? searchInp.value.trim().toLowerCase() : '';

        if (query) {
            entries = entries.filter(function(e) {
                var u = e[1];
                return (u.name || '').toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query);
            });
        }

        if (!entries.length) {
            el.innerHTML = '<div class="empty" style="grid-column:1/-1;"><i class="fas fa-users"></i><p>' + (currentLang === 'en' ? 'No players found' : 'Нет игроков') + '</p></div>';
            return;
        }

        var filterGender = document.getElementById('filter-gender') ? document.getElementById('filter-gender').value : 'all';
        var filterType = document.getElementById('filter-type') ? document.getElementById('filter-type').value : 'all';
        var sortBy = document.getElementById('sort-by') ? document.getElementById('sort-by').value : 'rounds';

        // Скрываем дубликаты одного игрока (могли остаться от старых guest-записей с разными id):
        // ключ только по ФИО (имя + отчество + фамилия), без гандикапа — чтобы не было похожих вариантов,
        // когда имена одинаковые, а гандикапы разные. Приоритет — зарегистрированная запись и большее число раундов.
        var dedupKeyOf = function(e) {
            var u = e[1] || {};
            var fio = '';
            if (typeof getPlayerFioKey === 'function') {
                fio = getPlayerFioKey(u);
            } else {
                var nm = (u.name || '').toString();
                fio = (typeof normalizeSearchText === 'function' ? normalizeSearchText(nm) : nm.toLowerCase());
            }
            return fio;
        };
        var byDedupKey = {};
        entries.forEach(function(e) {
            var id = e[0], u = e[1] || {};
            var isGuest = !!u.isGuest || String(id).indexOf('guest_') === 0;
            var weight = (isGuest ? 0 : 1000) + (u.roundsPlayed || 0);
            var key = dedupKeyOf(e);
            if (!byDedupKey[key] || weight > byDedupKey[key].weight) {
                byDedupKey[key] = { entry: e, weight: weight };
            }
        });
        entries = entries.filter(function(e) {
            var best = byDedupKey[dedupKeyOf(e)];
            return !!best && best.entry[0] === e[0];
        });

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

        var roundsWord = currentLang === 'en' ? 'Rounds: ' : 'Раундов: ';

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], u = e[1];
            var gIcon = u.gender === 'women' ? '👩' : '👨';
            var guestBadge = u.isGuest ? '<span style="background:rgba(201,168,76,0.15);color:var(--gold);padding:2px 8px;border-radius:12px;font-size:10px;margin-left:6px;">' + t('guest') + '</span>' : '';

            html += '<div class="card" style="cursor:pointer;" onclick="showPlayer(\'' + id + '\')">' +
                '<div style="display:flex;align-items:center;gap:14px;">' +
                fmtUserAvatar(u, 52) +
                '<div style="flex:1;"><div style="font-weight:700;color:var(--white);font-size:15px;">' + gIcon + ' ' + escapeHtml(u.name || '—') + guestBadge + '</div>' +
                '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                'HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') +
                ' · ' + roundsWord + (u.roundsPlayed || 0) +
                (u.bestGross ? ' · Gross (18h): ' + u.bestGross : '') +
                (u.bestStableford ? ' · Stableford (18h): ' + u.bestStableford : '') +
                '</div></div></div></div>';
        });

        el.innerHTML = html;
    });
}

function showPlayer(id) {
    if (typeof openPlayerProfileModal === 'function') {
        openPlayerProfileModal(id);
    }
}
