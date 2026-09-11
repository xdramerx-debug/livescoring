document.addEventListener('DOMContentLoaded', function() {
    initNav();
    loadLiveFeed();
    loadClubAnnouncements();
});

// ── Анонсы клуба ──────────────────────────────────────────
// Push живёт один миг, поэтому те же записи broadcasts показываем и в ленте:
// адресные анонсы видят только адресаты (общий фильтр из js/utils.js).
function loadClubAnnouncements() {
    if (typeof db === 'undefined' || !db) return;
    var bind = (typeof bindRealtimeValue === 'function') ? bindRealtimeValue : null;
    var render = function(data) {
        var el = document.getElementById('feed-announcements');
        if (!el) return;
        var list = (typeof pestovoBroadcastFeed === 'function')
            ? pestovoBroadcastFeed(data, (typeof pestovoBroadcastViewerCtx === 'function') ? pestovoBroadcastViewerCtx() : {}, 3)
            : [];
        if (!list.length) {
            el.innerHTML = '';
            return;
        }
        var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
        var html = '<div class="card" style="margin-bottom:18px;border:1px solid rgba(201,168,76,.45);">';
        html += '<h2 style="font-size:17px;margin:0 0 12px;"><i class="fas fa-bullhorn" style="color:var(--gold);"></i> ' +
            (en ? 'Club announcements' : 'Анонсы клуба') + '</h2>';
        list.forEach(function(b) {
            html += '<div style="padding:10px 0;border-top:1px dashed var(--border);">';
            html += '<div style="font-weight:700;color:var(--gold);">' + (typeof escapeHtml === 'function' ? escapeHtml(b.title) : b.title) + '</div>';
            html += '<div style="font-size:13.5px;margin:4px 0 6px;">' + (typeof escapeHtml === 'function' ? escapeHtml(b.body) : b.body) + '</div>';
            html += '<div style="font-size:11.5px;color:var(--muted);">';
            if (typeof fmtDate === 'function' && typeof fmtTime === 'function' && b.time) {
                html += fmtDate(b.time) + ' · ' + fmtTime(b.time) + ' · ';
            }
            if (typeof pestovoBroadcastAudienceLabel === 'function') html += pestovoBroadcastAudienceLabel(b) + ' · ';
            html += '<a href="' + (typeof escapeHtml === 'function' ? escapeHtml(b.link || 'tournaments.html') : (b.link || 'tournaments.html')) + '">' +
                (en ? 'open' : 'открыть') + '</a></div>';
            html += '</div>';
        });
        html += '</div>';
        el.innerHTML = html;
    };
    if (bind) {
        bind('feed-announcements', db.ref('broadcasts'), function(sn) { render(sn.val() || {}); });
    } else {
        db.ref('broadcasts').once('value').then(function(sn) { render(sn.val() || {}); }).catch(function() {});
    }
}

function onAuthReady(u, d) { navAuth(u, d); }

function loadLiveFeed() {
    if (typeof db === 'undefined') return;

    Promise.all([
        db.ref('rounds').once('value'),
        db.ref('reactions').once('value')
    ]).then(function(snaps) {
        var rounds = snaps[0].val() || {};
        // Автозакрытие вчерашних незавершённых раундов («завершён автоматически»)
        if (typeof sweepStaleRounds === 'function') rounds = sweepStaleRounds(rounds) || {};
        var reactions = snaps[1].val() || {};
        var el = document.getElementById('feed-list');
        if (!el) return;

        var events = [];

        Object.entries(rounds).forEach(function(e) {
            var rid = e[0], r = e[1];
            if (!r || typeof r !== 'object') return;
            var order = getRoundOrder(r);
            var roundPlayers = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(r.players || {}) : (r.players || {});

            Object.entries(roundPlayers).forEach(function(pe) {
                var pid = pe[0], p = pe[1];
                // Удалённые и навсегда заблокированные демо-игроки не показываются в ленте
                if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pid, p && p.name)) return;
                var scores = p.scores || {};

                Object.entries(scores).forEach(function(se) {
                    var h = parseInt(se[0]);
                    var s = parseInt(se[1]) || 0;
                    if (s < 1) return;
                    var par = holePar(h);
                    var diff = s - par;

                    if (s === 1 || diff <= -1) {
                        var typeName = s === 1 ? '🎯 HOLE-IN-ONE' : (diff <= -2 ? '🦅 EAGLE' : '🐦 BIRDIE');
                        var badgeCls = s === 1 ? 'badge-eag' : (diff <= -2 ? 'badge-eag' : 'badge-bir');
                        events.push({
                            eventId: rid + '_' + pid + '_' + h,
                            roundId: rid,
                            playerId: pid,
                            playerName: privacyDisplayName(p, pid) || 'Player',
                            hole: h,
                            par: par,
                            score: s,
                            diff: diff,
                            typeName: typeName,
                            badgeCls: badgeCls,
                            time: r.createdAt || Date.now()
                        });
                    }
                });
            });
        });

        if (!events.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-rss"></i><p>' + (currentLang === 'en' ? 'No recent highlights' : 'Пока нет ярких моментов') + '</p></div>';
            return;
        }

        events.sort(function(a, b) { return b.time - a.time; });

        var html = '';
        events.slice(0, 15).forEach(function(ev) {
            var reactCount = reactions[ev.eventId] || {};
            var countClap = reactCount['👏'] || 0;
            var countFire = reactCount['🔥'] || 0;
            var countTarget = reactCount['🎯'] || 0;
            var countStrong = reactCount['💪'] || 0;

            html += '<div class="card" style="margin-bottom:16px;">';
            html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
            html += '<div><strong style="color:var(--white);font-size:16px;cursor:pointer;" onclick="openPlayerProfileModal(\'' + ev.playerId + '\',\'' + ev.roundId + '\')"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(ev.playerName) + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + t('brand_name') + ' · ' + t('hole') + ' #' + ev.hole + ' (' + t('par') + ' ' + ev.par + ')</div></div>';
            html += '<span class="' + ev.badgeCls + '" style="font-size:14px;padding:5px 12px;">' + ev.typeName + ' (' + ev.score + ')</span>';
            html += '</div>';

            // Reaction Buttons Bar
            html += '<div style="display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);flex-wrap:wrap;">';
            html += '<button class="btn btn-og btn-sm" onclick="sendEmojiReaction(\'' + ev.eventId + '\',\'👏\',this)">👏 ' + countClap + '</button>';
            html += '<button class="btn btn-og btn-sm" onclick="sendEmojiReaction(\'' + ev.eventId + '\',\'🔥\',this)">🔥 ' + countFire + '</button>';
            html += '<button class="btn btn-og btn-sm" onclick="sendEmojiReaction(\'' + ev.eventId + '\',\'🎯\',this)">🎯 ' + countTarget + '</button>';
            html += '<button class="btn btn-og btn-sm" onclick="sendEmojiReaction(\'' + ev.eventId + '\',\'💪\',this)">💪 ' + countStrong + '</button>';
            html += '</div>';

            html += '</div>';
        });

        el.innerHTML = html;
    });
}

function sendEmojiReaction(eventId, emoji, btnEl) {
    if (typeof db === 'undefined' || !eventId) return;
    db.ref('reactions/' + eventId + '/' + emoji).transaction(function(val) {
        return (val || 0) + 1;
    }).then(function(res) {
        vib();
        toast(currentLang === 'en' ? 'Reaction ' + emoji + ' sent!' : 'Реакция ' + emoji + ' отправлена!');
        // Обновляем счётчик на месте — без полной перезагрузки ленты
        if (btnEl && res && res.snapshot) {
            btnEl.innerHTML = emoji + ' ' + (res.snapshot.val() || 0);
        } else {
            loadLiveFeed();
        }
    });
}
