document.addEventListener('DOMContentLoaded', function() { initNav(); });
function onAuthReady(u, d) { navAuth(u, d); }

function adminLogin() {
    var u = document.getElementById('adm-user').value.trim();
    var p = document.getElementById('adm-pass').value;
    var er = document.getElementById('adm-error');
    er.classList.add('hidden');
    if (u === ADMIN_LOGIN && p === ADMIN_PASS) {
        document.getElementById('admin-login').classList.add('hidden');
        document.getElementById('admin-content').classList.remove('hidden');
        loadAdmRounds();
        loadAdmPlayers();
        loadTournaments();
        listenForAlerts();
        toast('✅ Вход выполнен');
    } else {
        er.textContent = 'Неверный логин/пароль';
        er.classList.remove('hidden');
    }
}

function switchTab(t, b) {
    document.querySelectorAll('.admin-section').forEach(function(s) { s.classList.add('hidden'); });
    document.querySelectorAll('.admin-tab').forEach(function(x) { x.classList.remove('active'); });
    document.getElementById('tab-' + t).classList.remove('hidden');
    if (b) b.classList.add('active');
}

function loadAdmRounds() {
    db.ref('rounds').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data).sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });
        var el = document.getElementById('adm-rounds');
        if (!entries.length) { el.innerHTML = '<div class="empty"><i class="fas fa-flag"></i><p>Нет раундов</p></div>'; return; }
        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1], pc = Object.keys(r.players || {}).length;
            var badge = r.status === 'active' ? '<span class="tn-status tn-a"><span class="live-dot" style="width:6px;height:6px;"></span> Live</span>' : '<span class="tn-status tn-d">Завершён</span>';
            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:10px;"><div style="flex:1;min-width:200px;"><strong style="color:var(--white);">Пестово</strong> ' + badge +
                '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' + fmtDate(r.createdAt) + ' · ' + fmtTime(r.startTime) + ' · ' + pc + ' игр. · ' + (r.format || 'Stroke') + ' · ТИ: ' + TEES[r.tee] + '</div></div>' +
                '<div style="display:flex;gap:6px;">' + (r.status === 'completed' ? '<button class="btn btn-og btn-sm" onclick="downloadScorecard(\'' + id + '\')"><i class="fas fa-download"></i></button>' : '') +
                '<button class="btn btn-r btn-sm" onclick="deleteRound(\'' + id + '\')"><i class="fas fa-trash"></i></button></div></div>';
        });
        el.innerHTML = html;
    });
}

function deleteRound(id) { if (confirm('Удалить?')) db.ref('rounds/' + id).remove(); }
function clearRounds() { if (confirm('Удалить ВСЕ?') && confirm('Точно?')) { db.ref('rounds').remove(); toast('Удалено'); } }

function loadAdmPlayers() {
    db.ref('users').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data);
        var el = document.getElementById('adm-players');
        if (!entries.length) { el.innerHTML = '<div class="empty"><i class="fas fa-users"></i><p>Нет игроков</p></div>'; return; }
        var html = '';
        entries.forEach(function(e) {
            var id = e[0], u = e[1];
            var gIcon = u.gender === 'women' ? '👩' : '👨';
            var guestBadge = u.isGuest ? ' <span style="color:var(--gold);font-size:10px;">(ГОСТЬ)</span>' : '';
            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:10px;">' +
                '<div style="flex:1;min-width:200px;"><strong style="color:var(--white);">' + gIcon + ' ' + (u.name || '—') + guestBadge + '</strong>' +
                '<div style="font-size:12px;color:var(--muted);">' + (u.email || '') + ' · HCP: ' + (u.handicap != null ? u.handicap : '—') + ' · Раундов: ' + (u.roundsPlayed || 0) + '</div></div>' +
                '<button class="btn btn-r btn-sm" onclick="deletePlayer(\'' + id + '\',\'' + (u.name || '') + '\')"><i class="fas fa-trash"></i></button></div>';
        });
        el.innerHTML = html;
    });
}

function deletePlayer(id, name) {
    if (!confirm('Удалить игрока ' + (name || id) + '?')) return;
    db.ref('users/' + id).remove().then(function() { toast('Игрок удалён'); });
}

function createTournament() {
    var name = document.getElementById('tn-name').value.trim();
    var date = document.getElementById('tn-date').value;
    if (!name || !date) { toast('Заполните название и дату', 'error'); return; }
    var formats = [];
    if (document.getElementById('tn-f-stroke').checked) formats.push('Stroke Play');
    if (document.getElementById('tn-f-stbl').checked) formats.push('Stableford');
    if (!formats.length) { toast('Выберите формат', 'error'); return; }
    var tees = [];
    if (document.getElementById('tn-t-bk').checked) tees.push('bk');
    if (document.getElementById('tn-t-bl').checked) tees.push('bl');
    if (document.getElementById('tn-t-wh').checked) tees.push('wh');
    if (document.getElementById('tn-t-rd').checked) tees.push('rd');
    if (!tees.length) { toast('Выберите ТИ', 'error'); return; }
    db.ref('tournaments').push({
        name: name, date: date, formats: formats, tees: tees,
        status: 'upcoming', createdAt: Date.now()
    }).then(function() {
        toast('🏆 Турнир создан!');
        document.getElementById('tn-name').value = '';
    });
}

function loadTournaments() {
    db.ref('tournaments').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data);
        var el = document.getElementById('tn-list');
        if (!entries.length) { el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>Нет турниров</p></div>'; return; }
        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });
        var html = '';
        entries.forEach(function(e) {
            var id = e[0], t = e[1];
            var formatsStr = (t.formats || []).join(', ') || '—';
            var teesStr = (t.tees || []).map(function(k) { return TEES[k] || k; }).join(', ') || '—';
            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;">' +
                '<div style="flex:1;min-width:200px;"><strong style="color:var(--white);">' + (t.name || '—') + '</strong>' +
                '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' + fmtDate(new Date(t.date).getTime()) + ' · ' + formatsStr + ' · ТИ: ' + teesStr + '</div></div>' +
                '<button class="btn btn-r btn-sm" onclick="deleteTn(\'' + id + '\')"><i class="fas fa-trash"></i></button></div>';
        });
        el.innerHTML = html;
    });
}

function deleteTn(id) { if (confirm('Удалить?')) db.ref('tournaments/' + id).remove(); }

function listenForAlerts() {
    db.ref('alerts').orderByChild('status').equalTo('active').on('value', function(sn) {
        var alerts = sn.val() || {};
        var c = document.getElementById('admin-alerts-list');
        if (!c) return;
        var entries = Object.entries(alerts);
        if (entries.length === 0) {
            c.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">Нет активных вызовов</p>';
            return;
        }
        var html = '';
        entries.sort(function(a, b) { return b[1].time - a[1].time; }).forEach(function(e) {
            var id = e[0], a = e[1];
            var icon = a.type === 'referee' ? '<i class="fas fa-gavel" style="color:var(--red);"></i>' : '<i class="fas fa-shield-halved" style="color:var(--blue);"></i>';
            var title = a.type === 'referee' ? 'СУДЬЯ!' : 'МАРШАЛ!';
            html += '<div class="list-item" style="padding:16px;border-left:4px solid var(--red);background:rgba(224,90,74,0.1);flex-wrap:wrap;gap:10px;">';
            html += '<div style="flex:1;min-width:200px;"><div style="font-weight:800;font-size:16px;color:var(--white);">' + icon + ' ВЫЗОВ: ' + title + '</div>';
            html += '<div style="color:var(--gold);font-size:14px;margin:4px 0;">Лунка: <b>' + a.hole + '</b> | Игрок: <b>' + a.playerName + '</b></div>';
            html += '<div style="font-size:11px;color:var(--muted);">' + fmtTime(a.time) + '</div></div>';
            html += '<button class="btn btn-r btn-sm" onclick="closeAlert(\'' + id + '\')">Закрыть</button>';
            html += '</div>';
        });
        c.innerHTML = html;
        try {
            var audio = new Audio('data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhLnABIIEVv+MnBIfg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg8Hg==');
            audio.play().catch(function() {});
        } catch (e) {}
    });
}

function closeAlert(id) { db.ref('alerts/' + id + '/status').set('resolved'); }