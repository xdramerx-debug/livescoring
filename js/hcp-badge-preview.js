// js/hcp-badge-preview.js — страница предпросмотра бейджа гандикапа
// (hcp-badge-preview.html): демо-игроки и точные копии разметки карточки
// из js/players.js и профиля из js/utils.js. Вынесено из встроенного
// <script>, чтобы CSP обходился без 'unsafe-inline'
// (docs/IMPROVEMENTS-2026-10.md, п.2).
(function() {
    'use strict';

    // Демо-игроки: два синхронизированных (RUSGOLF и Excel) + один без даты обновления
    var MO = function(y, m, d, h, mi) { return new Date(y, m - 1, d, h || 10, mi || 0).getTime(); };
    var MOCK_PLAYERS = [
        { id: 'demo-1', name: 'Александр Петров', gender: 'men', handicap: 12.4, roundsPlayed: 18, hcpUpdatedAt: MO(2026, 9, 5, 10, 30), hcpSource: 'rusgolf' },
        { id: 'demo-2', name: 'Мария Смирнова', gender: 'women', handicap: 8.1, roundsPlayed: 12, hcpUpdatedAt: MO(2026, 8, 12, 18, 5), hcpSource: 'excel' },
        { id: 'demo-3', name: 'Иван Кузнецов', gender: 'men', handicap: 15.2, roundsPlayed: 4 }
    ];

    // Точная копия разметки карточки из js/players.js
    function renderMockCard(u) {
        var hcpInfo = getHcpSyncInfo(u);
        var avatarHtml = fmtUserAvatar(u, 52);
        if (hcpInfo.ok && getHcpBadgeVariant() === '3') {
            avatarHtml = hcpAvatarWrapHtml(avatarHtml, hcpInfo);
        }
        var gIcon = u.gender === 'women' ? '👩' : '👨';
        return '<div class="card">' +
            '<div style="display:flex;align-items:center;gap:14px;">' + avatarHtml +
            '<div style="flex:1;"><div style="font-weight:700;color:var(--white);font-size:15px;">' + gIcon + ' ' + escapeHtml(u.name) + '</div>' +
            '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
            'HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') + hcpSyncBadgeHtml(u) +
            ' · Раундов: ' + (u.roundsPlayed || 0) + '</div></div></div></div>';
    }

    // Точная копия шапки профиля из openPlayerProfileModal (js/utils.js)
    function renderMockProfile(u) {
        var hcpSync = buildHcpProfileSyncHtml(u);
        var avatarHtml = fmtUserAvatar(u, 80);
        if (hcpSync.meta !== null && getHcpBadgeVariant() === '3') {
            avatarHtml = hcpAvatarWrapHtml(avatarHtml, getHcpSyncInfo(u));
        }
        var gIcon = u.gender === 'women' ? '👩' : '👨';
        return '<div class="card">' +
            '<div class="profile-head">' + avatarHtml +
            '<div style="flex:1;"><div class="profile-name">' + gIcon + ' ' + escapeHtml(u.name) + '</div>' +
            '<div class="profile-meta">' +
            (hcpSync.meta !== null ? hcpSync.meta : '<span><i class="fas fa-golf-ball"></i> HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') + '</span>') +
            '<span><i class="fas fa-flag"></i> ' + (u.roundsPlayed || 0) + ' раундов</span>' +
            '</div>' + (hcpSync.banner || '') + '</div></div></div>';
    }

    function markSelected() {
        var cur = getHcpBadgeVariant();
        document.querySelectorAll('.variant-section').forEach(function(sec) {
            var isCur = sec.getAttribute('data-variant') === cur;
            sec.classList.toggle('variant-selected', isCur);
            var btn = sec.querySelector('.choose-btn');
            if (btn) {
                btn.classList.toggle('chosen', isCur);
                btn.innerHTML = isCur
                    ? '<i class="fas fa-check-circle"></i> Выбран (текущий)'
                    : '<i class="fas fa-hand-pointer"></i> Выбрать этот вариант';
            }
        });
    }

    window.chooseVariant = function(v) {
        setHcpBadgeVariant(v);
        markSelected();
        toast('✅ Вариант ' + v + ' выбран — применён на сайте (вкладка «Игроки», профиль, админка)', 'success');
    };

    document.addEventListener('DOMContentLoaded', function() {
        var saved = getHcpBadgeVariant();
        document.querySelectorAll('.variant-section').forEach(function(sec) {
            var v = sec.getAttribute('data-variant');
            setHcpBadgeVariant(v);
            var cardsEl = sec.querySelector('.mock-cards');
            var profileEl = sec.querySelector('.mock-profile');
            if (cardsEl) cardsEl.innerHTML = MOCK_PLAYERS.map(renderMockCard).join('');
            if (profileEl) profileEl.innerHTML = renderMockProfile(MOCK_PLAYERS[0]);
        });
        setHcpBadgeVariant(saved);
        markSelected();
    });
})();
