// js/player-page.js — отдельная страница профиля игрока (player.html?id=…).
//
// Зачем. Профиль игрока жил в модалке поверх любой страницы
// (openPlayerProfileModal, js/utils.js) — длинный список раундов упирался в
// модалку, ссылку на профиль нельзя было отправить. Теперь у каждого профиля
// своя страница: постоянный адрес player.html?id=<uid>, шапка с аватаром и
// HCP, плитки статистики по играм, достижения и полная история раундов.
// Все точки входа (строки «Все раунды», «Игроки», nav-профиль, live-списки)
// по-прежнему зовут data-act="openPlayerProfileModal" — эта функция теперь
// ведёт сюда (см. js/utils.js).
'use strict';

document.addEventListener('DOMContentLoaded', function () {
    if (typeof initNav === 'function') initNav();
    var params = new URLSearchParams(window.location.search || '');
    loadPlayerProfilePage(params.get('id') || '', params.get('round') || '');
});

// Назад: на страницу, с которой пришли (иначе — на «Игроки»).
function ppGoBack() {
    if (window.history && window.history.length > 1) window.history.back();
    else window.location.href = 'players.html';
}

function loadPlayerProfilePage(playerId, roundId) {
    var root = document.getElementById('pp-body');
    if (!root) return;
    if (!playerId) { renderPlayerProfileError(root); return; }
    if (typeof db === 'undefined') return;
    root.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    var userPromise = db.ref('usersPublic/' + playerId).once('value')
        .then(function (sn) { return sn.val(); }).catch(function () { return null; });
    var roundPromise = roundId
        ? db.ref('rounds/' + roundId).once('value').then(function (sn) { return sn.val(); }).catch(function () { return null; })
        : Promise.resolve(null);

    Promise.all([userPromise, roundPromise]).then(function (res) {
        var u = res[0];
        var rd = res[1];

        // Гость без usersPublic: поднимаем профиль из данных раунда —
        // как это делала модалка (js/utils.js, openPlayerProfileModal).
        if (!u && rd && rd.players && rd.players[playerId]) {
            var p = rd.players[playerId];
            var displayName = (typeof playerDisplayName === 'function') ? playerDisplayName(p, playerId) : (p.name || '—');
            u = {
                name: displayName !== '—' ? displayName : ((currentLang === 'en') ? 'Guest' : 'Гость'),
                handicap: (p.exactHcpRaw != null && p.exactHcpRaw !== '') ? p.exactHcpRaw : (p.exactHcp || null),
                gender: p.gender || 'men',
                isGuest: true,
                roundsPlayed: 1
            };
        }

        if (!u) { renderPlayerProfileError(root); return; }

        db.ref('users/' + playerId + '/history').once('value').then(function (hSn) {
            var history = hSn.val() || {};
            // Дубли раундов (старый групповой финиш) схлопываем при чтении.
            var allRounds = (typeof pestovoPickHistoryUnique === 'function')
                ? pestovoPickHistoryUnique(Object.entries(history))
                : Object.entries(history);
            allRounds.sort(function (a, b) { return (b.date || 0) - (a.date || 0); });

            renderPlayerProfilePage(root, playerId, u, rd, allRounds);
            if (allRounds.length > 0 && typeof pestovoInitProfileHistory === 'function') {
                pestovoInitProfileHistory(playerId, u, allRounds);
            }
            try { if (typeof pestovoDedupeUserHistory === 'function') pestovoDedupeUserHistory(playerId); } catch (e) { console.warn('[silent]', e); }
        }).catch(function () {
            renderPlayerProfilePage(root, playerId, u, rd, []);
        });
    }).catch(function () {
        renderPlayerProfileError(root);
    });
}

function renderPlayerProfileError(root) {
    var en = currentLang === 'en';
    root.innerHTML = '<div class="card" style="padding:34px 20px;text-align:center;">' +
        '<div style="font-size:38px;margin-bottom:10px;">🏌️</div>' +
        '<p style="color:var(--muted);margin:0 0 16px;">' + (en ? 'Player profile not found' : 'Профиль игрока не найден') + '</p>' +
        '<button type="button" class="btn btn-og btn-sm" data-act="ppGoBack"><i class="fas fa-arrow-left"></i> ' + (en ? 'Back' : 'Назад') + '</button>' +
        '</div>';
}

function renderPlayerProfilePage(root, playerId, u, rd, allRounds) {
    var en = currentLang === 'en';
    var isMe = (typeof currentUser !== 'undefined' && currentUser && currentUser.uid === playerId);
    var gIcon = u.gender === 'women' ? '👩' : '👨';
    var roundsWord = en ? 'rounds' : 'раундов';
    var hTag = en ? 'h' : 'л';

    // ── Шапка профиля: аватар, имя, HCP, ТИ, счётчики ──────────────────
    var hcpSync = (typeof buildHcpProfileSyncHtml === 'function') ? buildHcpProfileSyncHtml(u) : { meta: null, banner: '' };
    var plainHcpSpan = '<span><i class="fas fa-golf-ball"></i> HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') + '</span>';
    var profileAvatarHtml = fmtUserAvatar(u, 96);
    if (hcpSync.meta !== null && typeof getHcpBadgeVariant === 'function' && getHcpBadgeVariant() === '3') {
        profileAvatarHtml = hcpAvatarWrapHtml(profileAvatarHtml, getHcpSyncInfo(u));
    }

    var html = '<div class="pp-topbar">' +
        '<button type="button" class="btn btn-og btn-sm" data-act="ppGoBack"><i class="fas fa-arrow-left"></i> ' + (en ? 'Back' : 'Назад') + '</button>' +
        '</div>';

    html += '<div class="card pp-hero">';
    html += '<div class="pp-hero-avatar">' + profileAvatarHtml + '</div>';
    html += '<div class="pp-hero-main">';
    html += '<div class="pp-name">' + gIcon + ' ' + escapeHtml((typeof privacyDisplayName === 'function') ? privacyDisplayName(u, playerId) : (u.name || '')) + '</div>';
    html += '<div class="pp-meta">';
    html += hcpSync.meta !== null ? hcpSync.meta : plainHcpSpan;
    if (u.defaultTee) html += '<span><i class="fas fa-golf-ball-tee"></i> Tee: ' + fmtTeePill(u.defaultTee) + '</span>';
    html += '<span><i class="fas fa-flag"></i> ' + (u.roundsPlayed || 0) + ' ' + roundsWord + '</span>';
    if (u.bestGross) html += '<span><i class="fas fa-trophy"></i> Gross (18' + hTag + '): ' + u.bestGross + '</span>';
    html += '</div>';
    if (hcpSync.banner) html += hcpSync.banner;
    if (isMe) {
        html += '<div class="pp-actions">' +
            '<button type="button" class="btn btn-og btn-sm" data-act="renderProfileEditForm" data-arg="' + escapeHtml(playerId) + '"><i class="fas fa-user-pen"></i> ' + t('edit_profile') + '</button>' +
            '</div>';
    }
    html += '</div></div>';

    // ── Плитки статистики по играм ─────────────────────────────────────
    var played = allRounds.length;
    var bestGross = null, bestStable = null, birdies = 0, eagles = 0, hio = 0, holes = 0;
    allRounds.forEach(function (r) {
        birdies += (r.birdies || 0);
        eagles += (r.eagles || 0);
        hio += (r.holeInOne || 0);
        holes += (r.holes || 0);
        if (r.holes === 18 && r.gross) {
            if (bestGross === null || r.gross < bestGross) bestGross = r.gross;
        }
        if (r.holes === 18 && r.stablefordField) {
            if (bestStable === null || r.stablefordField > bestStable) bestStable = r.stablefordField;
        }
    });
    function ppTile(val, lbl) {
        return '<div class="pp-tile"><div class="pp-tile-val">' + val + '</div><div class="pp-tile-lbl">' + lbl + '</div></div>';
    }
    html += '<div class="pp-tiles">';
    html += ppTile(played, en ? 'Rounds' : 'Раундов');
    html += ppTile(bestGross != null ? bestGross : '—', en ? 'Best Gross (18' + hTag + ')' : 'Лучший Gross (18' + hTag + ')');
    html += ppTile(bestStable != null ? bestStable : '—', en ? 'Best Stableford' : 'Лучший Стаблфорд');
    html += ppTile(birdies, en ? 'Birdies' : 'Берди');
    html += ppTile(eagles + (hio ? ' 🎯' + hio : ''), en ? 'Eagles' : 'Иглы');
    html += ppTile(holes, en ? 'Holes played' : 'Сыграно лунок');
    html += '</div>';

    // ── Счётная карточка конкретного раунда (?round=…) ─────────────────
    if (rd && rd.players && rd.players[playerId]) {
        var roundPlayer = rd.players[playerId];
        var roundPlayerTee = (roundPlayer && roundPlayer.tee) || (rd && rd.tee) || 'wh';
        html += '<div class="card pp-section" style="padding:16px 18px;">';
        html += '<h3><i class="fas fa-table"></i> ' + (en ? 'Round Scorecard' : 'Счётная карточка раунда') +
            ' (' + pestovoRoundFormatBadge(rd, 'Stroke') + ' · ' + t('tee_select') + ': ' + fmtTeePill(roundPlayerTee) + ')</h3>';
        if (typeof generatePestovoScorecardHTML === 'function') {
            html += generatePestovoScorecardHTML(roundPlayer, rd, { compact: true });
        }
        html += '</div>';
    }

    // ── Достижения и статистика ────────────────────────────────────────
    if (played > 0 && typeof renderTrophyCabinet === 'function') {
        html += '<div class="card pp-section" style="padding:16px 18px;">';
        html += '<h3><i class="fas fa-award"></i> ' + (en ? 'Achievements and statistics' : 'Достижения и статистика') + '</h3>';
        html += renderTrophyCabinet(u, allRounds);
        if (typeof renderScoringDistributionBar === 'function') html += renderScoringDistributionBar(allRounds);
        html += '</div>';
    }

    // ── История раундов: вкладки, фильтры, карточки ────────────────────
    html += '<div class="card pp-section" style="padding:16px 18px;">';
    html += '<h3><i class="fas fa-history"></i> ' + t('round_history') + ' (' + played + ')</h3>';
    html += '<div id="pr-history-root" data-player-id="' + escapeHtml(playerId) + '"></div>';
    if (played === 0) {
        html += '<p style="color:var(--muted);margin:6px 0 0;">' + (en ? 'No rounds in history yet' : 'В истории пока нет раундов') + '</p>';
    }
    html += '</div>';

    root.innerHTML = html;
    try {
        var nameForTitle = (typeof privacyDisplayName === 'function') ? privacyDisplayName(u, playerId) : (u.name || '');
        document.title = nameForTitle + ' — ' + t('brand_name');
    } catch (e) { console.warn('[silent]', e); }
}
