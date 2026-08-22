document.addEventListener('DOMContentLoaded', function() { initNav(); });

// ==========================================
// АВТОРИЗАЦИЯ АДМИНКИ
// ==========================================
function onAuthReady(user, userData) {
    navAuth(user, userData);

    // Автовход если у пользователя роль admin
    if (document.getElementById('admin-login') && userData && userData.role === 'admin') {
        openAdminPanel();
    }
}

function adminLogin() {
    var u = document.getElementById('adm-user').value.trim();
    var p = document.getElementById('adm-pass').value;
    var er = document.getElementById('adm-error');
    er.classList.add('hidden');

    // 1. Мастер-пароль
    if (u === ADMIN_LOGIN && p === ADMIN_PASS) {
        openAdminPanel();
        toast('✅ Вход по мастер-паролю');
        return;
    }

    // 2. Проверка роли из Firebase
    if (currentUserData && currentUserData.role === 'admin') {
        openAdminPanel();
        toast('✅ Вход выполнен (Права администратора)');
        return;
    }

    // Ошибка
    if (currentUserData && currentUserData.role !== 'admin') {
        er.textContent = 'У вашего аккаунта нет прав администратора. Обратитесь к главному админу.';
    } else {
        er.textContent = 'Неверный логин/пароль или вы не авторизованы на сайте.';
    }
    er.classList.remove('hidden');
}

function openAdminPanel() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-content').classList.remove('hidden');
    loadAdmRounds();
    loadAdmPlayers();
    loadTournaments();
    listenForAlerts();
}

function switchTab(t, b) {
    document.querySelectorAll('.admin-section').forEach(function(s) { s.classList.add('hidden'); });
    document.querySelectorAll('.admin-tab').forEach(function(x) { x.classList.remove('active'); });
    document.getElementById('tab-' + t).classList.remove('hidden');
    if (b) b.classList.add('active');
}

// ==========================================
// РАУНДЫ
// ==========================================
function loadAdmRounds() {
    db.ref('rounds').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data).sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });
        var el = document.getElementById('adm-rounds');

        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-flag"></i><p>Нет раундов</p></div>';
            return;
        }

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1], pc = Object.keys(r.players || {}).length;
            var badge = r.status === 'active'
                ? '<span class="tn-status tn-a"><span class="live-dot" style="width:6px;height:6px;"></span> Live</span>'
                : '<span class="tn-status tn-d">Завершён</span>';

            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:10px;">';
            html += '<div style="flex:1;min-width:200px;"><strong style="color:var(--white);">Пестово</strong> ' + badge;
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    fmtDate(r.createdAt) + ' · ' + fmtTime(r.startTime) + ' · ' + pc + ' игр. · ' +
                    (r.format || 'Stroke') + ' · ТИ: ' + TEES[r.tee] +
                    (r.mode === 'solo' ? ' · Одиночный' : '') + '</div></div>';
            html += '<div style="display:flex;gap:6px;">';
            if (r.status === 'completed') {
                html += '<button class="btn btn-og btn-sm" onclick="downloadScorecard(\'' + id + '\')"><i class="fas fa-download"></i></button>';
            }
            html += '<button class="btn btn-r btn-sm" onclick="deleteRound(\'' + id + '\')"><i class="fas fa-trash"></i></button>';
            html += '</div></div>';
        });

        el.innerHTML = html;
    });
}

function deleteRound(id) {
    if (confirm('Удалить раунд?')) {
        db.ref('rounds/' + id).remove();
        db.ref('markers/' + id).remove();
        db.ref('markerAssignments/' + id).remove();
    }
}

function clearRounds() {
    if (confirm('Удалить ВСЕ раунды? Это необратимо!') && confirm('Точно уверены?')) {
        db.ref('rounds').remove();
        db.ref('markers').remove();
        db.ref('markerAssignments').remove();
        db.ref('alerts').remove();
        toast('Все раунды удалены');
    }
}

// ==========================================
// ИГРОКИ И РОЛИ
// ==========================================
function loadAdmPlayers() {
    db.ref('users').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data);
        var el = document.getElementById('adm-players');

        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-users"></i><p>Нет игроков</p></div>';
            return;
        }

        // Сортировка: сначала админы, потом по имени
        entries.sort(function(a, b) {
            var roleA = a[1].role === 'admin' ? 0 : 1;
            var roleB = b[1].role === 'admin' ? 0 : 1;
            if (roleA !== roleB) return roleA - roleB;
            return (a[1].name || '').localeCompare(b[1].name || '');
        });

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], u = e[1];
            var gIcon = u.gender === 'women' ? '👩' : '👨';
            var guestBadge = u.isGuest ? ' <span style="background:rgba(201,168,76,0.15);color:var(--gold);padding:2px 6px;border-radius:8px;font-size:10px;">ГОСТЬ</span>' : '';
            var isAdmin = u.role === 'admin';

            var roleBadge = isAdmin
                ? '<span style="color:#2ecc71;font-size:12px;font-weight:700;"><i class="fas fa-shield-halved"></i> Админ</span>'
                : '<span style="color:var(--muted);font-size:12px;">Игрок</span>';

            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:10px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<strong style="color:var(--white);">' + gIcon + ' ' + (u.name || '—') + guestBadge + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">';
            html += (u.email || 'Без email') + ' · HCP: ' + (u.handicap != null ? u.handicap : '—') + ' · Раундов: ' + (u.roundsPlayed || 0);
            html += '</div></div>';

            html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
            html += roleBadge;

            // Не даём изменить роль самому себе (защита от случайного удаления)
            if (!currentUser || id !== currentUser.uid) {
                if (isAdmin) {
                    html += '<button class="btn btn-og btn-sm" onclick="changeRole(\'' + id + '\',\'player\',\'' + (u.name || '') + '\')">' +
                            '<i class="fas fa-user"></i> Сделать игроком</button>';
                } else {
                    html += '<button class="btn btn-g btn-sm" onclick="changeRole(\'' + id + '\',\'admin\',\'' + (u.name || '') + '\')">' +
                            '<i class="fas fa-shield-halved"></i> Дать Админа</button>';
                }
                html += '<button class="btn btn-r btn-sm" onclick="deletePlayer(\'' + id + '\',\'' + (u.name || '') + '\')" title="Удалить">' +
                        '<i class="fas fa-trash"></i></button>';
            } else {
                html += '<span style="font-size:11px;color:var(--gold);font-weight:600;">(Это вы)</span>';
            }

            html += '</div></div>';
        });

        el.innerHTML = html;
    });
}

function changeRole(id, newRole, name) {
    var roleText = newRole === 'admin' ? 'Администратора' : 'Игрока';
    if (!confirm('Назначить ' + (name || 'пользователя') + ' на роль ' + roleText + '?')) return;

    db.ref('users/' + id + '/role').set(newRole).then(function() {
        toast('✅ ' + (name || 'Пользователь') + ' теперь ' + roleText);
    }).catch(function(err) {
        toast('❌ Ошибка: ' + err.message, 'error');
    });
}

function deletePlayer(id, name) {
    if (!confirm('Удалить игрока ' + (name || id) + '? Это необратимо!')) return;
    db.ref('users/' + id).remove().then(function() {
        toast('🗑️ Игрок удалён');
    });
}

// ==========================================
// ТУРНИРЫ
// ==========================================
function createTournament() {
    var name = document.getElementById('tn-name').value.trim();
    var date = document.getElementById('tn-date').value;

    if (!name || !date) { toast('Заполните название и дату', 'error'); return; }

    var formats = [];
    if (document.getElementById('tn-f-stroke').checked) formats.push('Stroke Play');
    if (document.getElementById('tn-f-stbl').checked) formats.push('Stableford');
    if (!formats.length) { toast('Выберите хотя бы один формат', 'error'); return; }

    var tees = [];
    if (document.getElementById('tn-t-bk').checked) tees.push('bk');
    if (document.getElementById('tn-t-bl').checked) tees.push('bl');
    if (document.getElementById('tn-t-wh').checked) tees.push('wh');
    if (document.getElementById('tn-t-rd').checked) tees.push('rd');
    if (!tees.length) { toast('Выберите хотя бы один ТИ', 'error'); return; }

    db.ref('tournaments').push({
        name: name,
        date: date,
        formats: formats,
        tees: tees,
        status: 'upcoming',
        createdAt: Date.now()
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

        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>Нет турниров</p></div>';
            return;
        }

        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], t = e[1];
            var formatsStr = (t.formats || []).join(', ') || '—';
            var teesStr = (t.tees || []).map(function(k) { return TEES[k] || k; }).join(', ') || '—';

            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<strong style="color:var(--white);">' + (t.name || '—') + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    fmtDate(new Date(t.date).getTime()) + ' · ' + formatsStr + ' · ТИ: ' + teesStr + '</div>';
            html += '</div>';
            html += '<button class="btn btn-r btn-sm" onclick="deleteTn(\'' + id + '\')"><i class="fas fa-trash"></i></button>';
            html += '</div>';
        });

        el.innerHTML = html;
    });
}

function deleteTn(id) {
    if (confirm('Удалить турнир?')) db.ref('tournaments/' + id).remove();
}

// ==========================================
// ВЫЗОВЫ СУДЕЙ/МАРШАЛОВ
// ==========================================
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
            var icon = a.type === 'referee'
                ? '<i class="fas fa-gavel" style="color:var(--red);"></i>'
                : '<i class="fas fa-shield-halved" style="color:var(--blue);"></i>';
            var title = a.type === 'referee' ? 'СУДЬЯ!' : 'МАРШАЛ!';

            html += '<div class="list-item" style="padding:16px;border-left:4px solid var(--red);background:rgba(224,90,74,0.1);flex-wrap:wrap;gap:10px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<div style="font-weight:800;font-size:16px;color:var(--white);">' + icon + ' ВЫЗОВ: ' + title + '</div>';
            html += '<div style="color:var(--gold);font-size:14px;margin:4px 0;">Лунка: <b>' + a.hole + '</b> | Игрок: <b>' + a.playerName + '</b></div>';
            html += '<div style="font-size:11px;color:var(--muted);">' + fmtTime(a.time) + '</div>';
            html += '</div>';
            html += '<button class="btn btn-r btn-sm" onclick="closeAlert(\'' + id + '\')">Закрыть вызов</button>';
            html += '</div>';
        });

        c.innerHTML = html;
        toast('🚨 ВЫЗОВ НА ПОЛЕ!', 'error');
        vib([200, 100, 200]);
    });
}

function closeAlert(id) {
    db.ref('alerts/' + id + '/status').set('resolved');
}

// Загрузка маркеров (для совместимости с live.js)
function loadMkRounds() {
    // Эта функция может использоваться для дополнительных маркерных фич
}
