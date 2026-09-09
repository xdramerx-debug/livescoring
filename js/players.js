document.addEventListener('DOMContentLoaded', function() {
    initNav();
    loadPlayers();
});

function onAuthReady(u, d) { navAuth(u, d); }

function playerOpenAttrs(id) {
    return ' role="button" tabindex="0" data-player-id="' + escapeHtml(String(id || '')) + '" onclick="showPlayer(this.dataset.playerId)"';
}

// Полное ФИО для списка игроков: «Имя Отчество Фамилия»
// (отчество — если есть). Приватность respected: скрытым игрокам
// показываем маску/инициалы вместо ФИО.
function playerListFullName(u, id) {
    var full = '';
    if (typeof resolvePlayerNameParts === 'function') {
        var parts = resolvePlayerNameParts(u || {});
        full = [parts.firstName, parts.middleName, parts.lastName].filter(function(x) { return !!x; }).join(' ');
    }
    if (!full) full = ((u && u.name) || '').replace(/\s+/g, ' ').trim();
    if ((typeof privacyShouldHide === 'function') && privacyShouldHide(id)) {
        return privacyMaskName(full || (u && u.name) || '', id);
    }
    return full || '—';
}

function buildPlayerDisplayHTML(id, u, index, variant, roundsWord) {
    var gIcon = u.gender === 'women' ? '👩' : '👨';
    // Бейдж «Гость» убран везде — гости никак не помечаются.
    var hcpInfo = (typeof getHcpSyncInfo === 'function') ? getHcpSyncInfo(u) : { ok: false };
    var avatarHtml = fmtUserAvatar(u, variant === '3' ? 68 : (variant === '2' ? 44 : 52));
    if (hcpInfo.ok && (typeof getHcpBadgeVariant === 'function' ? getHcpBadgeVariant() : '1') === '3') {
        avatarHtml = hcpAvatarWrapHtml(avatarHtml, hcpInfo);
    }
    var name = escapeHtml(playerListFullName(u, id));
    // Гандикап — только если обновлён (есть hcpUpdatedAt), иначе «—».
    var hcpVal = hcpInfo.ok ? fmtExactHcp(u.handicap) : '—';
    var hcpBadge = (typeof hcpSyncBadgeHtml === 'function') ? hcpSyncBadgeHtml(u) : '';
    var rounds = u.roundsPlayed || 0;
    var attrs = playerOpenAttrs(id);

    if (variant === '2') {
        return '<div class="player-layout-card player-layout-card-2 list-item"' + attrs + '>' +
            '<div class="players-v2-avatar">' + avatarHtml + '</div>' +
            '<div class="players-v2-main"><div class="players-v2-name">' + gIcon + ' ' + name + '</div>' +
            '<div class="players-v2-meta">HCP: ' + hcpVal + hcpBadge + '</div></div>' +
            '<div class="players-v2-rounds"><b>' + rounds + '</b><span>' + (currentLang === 'en' ? 'rounds' : 'раундов') + '</span></div>' +
            '</div>';
    }

    if (variant === '3') {
        var updDate = hcpInfo.ok ? fmtHcpShortDate(hcpInfo.ts) : '—';
        var updLbl = currentLang === 'en' ? 'Updated' : 'Обновлён';
        return '<div class="player-layout-card player-layout-card-3 card"' + attrs + '>' +
            '<div class="players-v3-top"><span class="players-v3-rank">' + (index + 1 < 10 ? '0' : '') + (index + 1) + '</span>' + avatarHtml +
            '<div class="players-v3-name-wrap"><div class="players-v3-name">' + gIcon + ' ' + name + '</div><div class="players-v3-hcp">HCP <b>' + hcpVal + '</b>' + hcpBadge + '</div></div></div>' +
            '<div class="players-v3-metrics"><div><span>' + (currentLang === 'en' ? 'Rounds' : 'Раунды') + '</span><b>' + rounds + '</b></div><div><span>' + updLbl + '</span><b>' + updDate + '</b></div></div>' +
            '<div class="players-v3-open"><i class="fas fa-arrow-up-right-from-square"></i> ' + (currentLang === 'en' ? 'Open profile' : 'Открыть профиль') + '</div>' +
            '</div>';
    }

    // Вариант 1 — действующий вид карточек, оставленный по умолчанию:
    // ФИО, гандикап (если обновлён) и количество раундов.
    return '<div class="card player-layout-card player-layout-card-1" style="cursor:pointer;"' + attrs + '>' +
        '<div style="display:flex;align-items:center;gap:14px;">' + avatarHtml +
        '<div style="flex:1;"><div style="font-weight:700;color:var(--white);font-size:15px;">' + gIcon + ' ' + name + '</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:4px;">HCP: ' + hcpVal + hcpBadge +
        ' · ' + roundsWord + rounds +
        '</div></div></div></div>';
}

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
        var variant = (typeof getPlayersDisplayVariant === 'function') ? getPlayersDisplayVariant() : '1';
        variant = (variant === '2' || variant === '3') ? variant : '1';
        el.classList.remove('players-layout-1', 'players-layout-2', 'players-layout-3');
        el.classList.add('players-layout-' + variant);

        var html = '';
        entries.forEach(function(e, index) {
            html += buildPlayerDisplayHTML(e[0], e[1], index, variant, roundsWord);
        });

        el.innerHTML = html;
    });
}

function showPlayer(id) {
    if (typeof openPlayerProfileModal === 'function') {
        openPlayerProfileModal(id);
    }
}
