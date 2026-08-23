document.addEventListener('DOMContentLoaded', function() { initNav(); });

// ==========================================
// АВТОРИЗАЦИЯ АДМИНКИ
// ==========================================
function onAuthReady(user, userData) {
    navAuth(user, userData);

    if (document.getElementById('admin-login') && userData && userData.role === 'admin') {
        openAdminPanel();
    }
}

function adminLogin() {
    var u = document.getElementById('adm-user').value.trim();
    var p = document.getElementById('adm-pass').value;
    var er = document.getElementById('adm-error');
    er.classList.add('hidden');

    if (u === ADMIN_LOGIN && p === ADMIN_PASS) {
        openAdminPanel();
        toast(currentLang === 'en' ? '✅ Logged in via master password' : '✅ Вход по мастер-паролю');
        return;
    }

    if (currentUserData && currentUserData.role === 'admin') {
        openAdminPanel();
        toast(currentLang === 'en' ? '✅ Logged in (Admin Privileges)' : '✅ Вход выполнен (Права администратора)');
        return;
    }

    if (currentUserData && currentUserData.role !== 'admin') {
        er.textContent = currentLang === 'en' ? 'Your account does not have admin privileges.' : 'У вашего аккаунта нет прав администратора. Обратитесь к главному админу.';
    } else {
        er.textContent = currentLang === 'en' ? 'Invalid credentials or not authorized.' : 'Неверный логин/пароль или вы не авторизованы на сайте.';
    }
    er.classList.remove('hidden');
}

function openAdminPanel() {
    var loginEl = document.getElementById('admin-login');
    var contentEl = document.getElementById('admin-content');
    if (loginEl) loginEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
    loadAdmRounds();
    loadAdmPlayers();
    loadTournaments();
    loadClubBroadcastsHistory();
    listenForAlerts();
    loadTelegramSettings();
    updateNotifButton();
}

function enableAdminNotifications() {
    if (typeof requestNotificationPermission === 'function') {
        requestNotificationPermission(function(granted) {
            updateNotifButton();
        });
    }
}

function updateNotifButton() {
    var btn = document.getElementById('btn-enable-notif');
    if (!btn) return;
    if ('Notification' in window && Notification.permission === 'granted') {
        btn.innerHTML = '<i class="fas fa-bell"></i> ' + (currentLang === 'en' ? 'Push Notifications Enabled ✅' : 'Push-уведомления включены ✅');
        btn.className = 'btn btn-g btn-sm';
        btn.disabled = true;
    } else {
        btn.innerHTML = '<i class="fas fa-bell"></i> ' + (currentLang === 'en' ? 'Enable Push Notifications' : 'Включить Push-уведомления');
        btn.className = 'btn btn-og btn-sm';
        btn.disabled = false;
    }
}

function switchTab(t, b) {
    document.querySelectorAll('.admin-section').forEach(function(s) { s.classList.add('hidden'); });
    document.querySelectorAll('.admin-tab').forEach(function(x) { x.classList.remove('active'); });
    var tabEl = document.getElementById('tab-' + t);
    if (tabEl) tabEl.classList.remove('hidden');
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
        if (!el) return;

        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-flag"></i><p>' + (currentLang === 'en' ? 'No rounds' : 'Нет раундов') + '</p></div>';
            return;
        }

        var playersStr = currentLang === 'en' ? ' players · ' : ' игр. · ';
        var soloStr = currentLang === 'en' ? ' · Solo' : ' · Одиночный';

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1], pc = Object.keys(r.players || {}).length;
            var badge = r.status === 'active'
                ? '<span class="tn-status tn-a"><span class="live-dot" style="width:6px;height:6px;"></span> Live</span>'
                : '<span class="tn-status tn-d">' + (currentLang === 'en' ? 'Completed' : 'Завершён') + '</span>';

            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:10px;">';
            html += '<div style="flex:1;min-width:200px;"><strong style="color:var(--white);">' + t('brand_name') + '</strong> ' + badge;
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    fmtDate(r.createdAt) + ' · ' + fmtTime(r.startTime) + ' · ' + pc + playersStr +
                    (r.format || 'Stroke') + ' · ' + t('tee_select') + ': ' + fmtTeePill(r.tee) +
                    (r.mode === 'solo' ? soloStr : '') + '</div></div>';
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
    if (confirm(currentLang === 'en' ? 'Delete round?' : 'Удалить раунд?')) {
        db.ref('rounds/' + id).remove();
        db.ref('markers/' + id).remove();
        db.ref('markerAssignments/' + id).remove();
    }
}

function clearRounds() {
    if (confirm(currentLang === 'en' ? 'Delete ALL rounds? This cannot be undone!' : 'Удалить ВСЕ раунды? Это необратимо!') && confirm(currentLang === 'en' ? 'Are you sure?' : 'Точно уверены?')) {
        db.ref('rounds').remove();
        db.ref('markers').remove();
        db.ref('markerAssignments').remove();
        db.ref('alerts').remove();
        toast(currentLang === 'en' ? 'All rounds deleted' : 'Все раунды удалены');
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
        if (!el) return;

        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-users"></i><p>' + (currentLang === 'en' ? 'No players' : 'Нет игроков') + '</p></div>';
            return;
        }

        entries.sort(function(a, b) {
            var roleA = a[1].role === 'admin' ? 0 : a[1].role === 'referee' ? 1 : a[1].role === 'marshal' ? 2 : 3;
            var roleB = b[1].role === 'admin' ? 0 : b[1].role === 'referee' ? 1 : b[1].role === 'marshal' ? 2 : 3;
            if (roleA !== roleB) return roleA - roleB;
            return (a[1].name || '').localeCompare(b[1].name || '');
        });

        var roundsStr = currentLang === 'en' ? ' · Rounds: ' : ' · Раундов: ';

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], u = e[1];
            var gIcon = u.gender === 'women' ? '👩' : '👨';
            var guestBadge = u.isGuest ? ' <span style="background:rgba(201,168,76,0.15);color:var(--gold);padding:2px 6px;border-radius:8px;font-size:10px;">' + t('guest') + '</span>' : '';
            var curRole = u.role || 'player';

            var roleBadge = curRole === 'admin'
                ? '<span style="color:#2ecc71;font-size:12px;font-weight:700;"><i class="fas fa-shield-halved"></i> ' + t('role_admin') + '</span>'
                : curRole === 'referee'
                ? '<span style="color:var(--red);font-size:12px;font-weight:700;"><i class="fas fa-gavel"></i> ' + t('role_referee') + '</span>'
                : curRole === 'marshal'
                ? '<span style="color:var(--blue);font-size:12px;font-weight:700;"><i class="fas fa-shield"></i> ' + t('role_marshal') + '</span>'
                : '<span style="color:var(--muted);font-size:12px;">' + t('role_player') + '</span>';

            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:10px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<strong style="color:var(--white);">' + gIcon + ' ' + (u.name || '—') + guestBadge + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">';
            html += (u.email || (currentLang === 'en' ? 'No email' : 'Без email')) + ' · HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') + roundsStr + (u.roundsPlayed || 0);
            html += '</div></div>';

            html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
            html += roleBadge;

            if (!currentUser || id !== currentUser.uid) {
                html += '<select class="form-input" style="padding:4px 8px;font-size:11px;width:auto;" onchange="changeRole(\'' + id + '\', this.value, \'' + (u.name || '').replace(/'/g, "\\'") + '\')">';
                html += '<option value="player" ' + (curRole === 'player' ? 'selected' : '') + '>' + t('role_player') + '</option>';
                html += '<option value="referee" ' + (curRole === 'referee' ? 'selected' : '') + '>' + t('role_referee') + '</option>';
                html += '<option value="marshal" ' + (curRole === 'marshal' ? 'selected' : '') + '>' + t('role_marshal') + '</option>';
                html += '<option value="admin" ' + (curRole === 'admin' ? 'selected' : '') + '>' + t('role_admin') + '</option>';
                html += '</select>';

                html += '<button class="btn btn-r btn-sm" onclick="deletePlayer(\'' + id + '\',\'' + (u.name || '').replace(/'/g, "\\'") + '\')" title="Delete">' +
                        '<i class="fas fa-trash"></i></button>';
            } else {
                html += '<span style="font-size:11px;color:var(--gold);font-weight:600;">(' + (currentLang === 'en' ? 'You' : 'Это вы') + ')</span>';
            }

            html += '</div></div>';
        });

        el.innerHTML = html;
    });
}

function changeRole(id, newRole, name) {
    var roleText = newRole === 'admin' ? (currentLang === 'en' ? 'Administrator' : 'Администратора') : (currentLang === 'en' ? 'Player' : 'Игрока');
    if (!confirm((currentLang === 'en' ? 'Set ' + (name || 'user') + ' role to ' + roleText + '?' : 'Назначить ' + (name || 'пользователя') + ' на роль ' + roleText + '?'))) return;

    db.ref('users/' + id + '/role').set(newRole).then(function() {
        toast('✅ ' + (name || 'User') + (currentLang === 'en' ? ' is now ' : ' теперь ') + roleText);
    }).catch(function(err) {
        toast('❌ Error: ' + err.message, 'error');
    });
}

function deletePlayer(id, name) {
    if (!confirm((currentLang === 'en' ? 'Delete player ' + (name || id) + '? This cannot be undone!' : 'Удалить игрока ' + (name || id) + '? Это необратимо!'))) return;
    db.ref('users/' + id).remove().then(function() {
        toast(currentLang === 'en' ? '🗑️ Player deleted' : '🗑️ Игрок удалён');
    });
}

// ==========================================
// ТУРНИРЫ
// ==========================================
function createTournament() {
    var name = document.getElementById('tn-name').value.trim();
    var date = document.getElementById('tn-date').value;

    if (!name || !date) { toast(currentLang === 'en' ? 'Specify name and date' : 'Заполните название и дату', 'error'); return; }

    var formats = [];
    if (document.getElementById('tn-f-stroke').checked) formats.push('Stroke Play');
    if (document.getElementById('tn-f-stbl').checked) formats.push('Stableford');
    if (document.getElementById('tn-f-m1v1') && document.getElementById('tn-f-m1v1').checked) formats.push('Match Play 1v1');
    if (document.getElementById('tn-f-scram') && document.getElementById('tn-f-scram').checked) formats.push('Scramble');
    if (!formats.length) { toast(currentLang === 'en' ? 'Select at least one format' : 'Выберите хотя бы один формат', 'error'); return; }

    var tees = [];
    if (document.getElementById('tn-t-bk').checked) tees.push('bk');
    if (document.getElementById('tn-t-bl').checked) tees.push('bl');
    if (document.getElementById('tn-t-wh').checked) tees.push('wh');
    if (document.getElementById('tn-t-rd').checked) tees.push('rd');
    if (!tees.length) { toast(currentLang === 'en' ? 'Select at least one tee' : 'Выберите хотя бы один ТИ', 'error'); return; }

    db.ref('tournaments').push({
        name: name,
        date: date,
        formats: formats,
        tees: tees,
        status: 'upcoming',
        createdAt: Date.now()
    }).then(function() {
        toast(currentLang === 'en' ? '🏆 Tournament created!' : '🏆 Турнир создан!');
        document.getElementById('tn-name').value = '';
    });
}

function loadTournaments() {
    db.ref('tournaments').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data);
        var el = document.getElementById('tn-list');
        if (!el) return;

        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>' + (currentLang === 'en' ? 'No tournaments' : 'Нет турниров') + '</p></div>';
            return;
        }

        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });

        var formatLabel = currentLang === 'en' ? 'Formats: ' : 'Форматы: ';
        var teeLabel = currentLang === 'en' ? 'Tees: ' : 'ТИ: ';

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], tVal = e[1];
            var formatsStr = (tVal.formats || []).join(', ') || '—';
            var teesStr = (tVal.tees || []).map(function(k) { return t('tee_' + k); }).join(', ') || '—';
            var regPlayers = tVal.registeredPlayers || {};
            var regCount = Object.keys(regPlayers).length;

            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<strong style="color:var(--white);">' + (tVal.name || '—') + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    fmtDate(new Date(tVal.date).getTime()) + ' · ' + formatLabel + formatsStr + ' · ' + teeLabel + teesStr + ' · Participants: ' + regCount + '</div>';
            html += '</div>';
            html += '<div style="display:flex;gap:6px;">';
            if (regCount > 0) {
                html += '<button class="btn btn-og btn-sm" onclick="exportTournamentRosterCSV(\'' + id + '\')"><i class="fas fa-file-csv"></i> CSV</button>';
            }
            html += '<button class="btn btn-r btn-sm" onclick="deleteTn(\'' + id + '\')"><i class="fas fa-trash"></i></button>';
            html += '</div></div>';
        });

        el.innerHTML = html;
    });
}

function exportTournamentRosterCSV(tnId) {
    if (typeof db === 'undefined') return;
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal || !tVal.registeredPlayers) return;

        var rows = [['#', 'Name', 'Handicap', 'Gender', 'Tee', 'Registered Date']];
        var idx = 1;
        Object.values(tVal.registeredPlayers).forEach(function(p) {
            rows.push([
                idx++,
                '"' + (p.name || '').replace(/"/g, '""') + '"',
                p.handicap != null ? fmtExactHcp(p.handicap) : '—',
                p.gender || 'men',
                p.tee || 'wh',
                fmtDate(p.registeredAt)
            ]);
        });

        var csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(function(e) { return e.join(','); }).join('\n');
        var encodedUri = encodeURI(csvContent);
        var link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'Tournament_' + (tVal.name || 'Roster').replace(/\s+/g, '_') + '_Participants.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast('📄 CSV roster exported!', 'success');
    });
}

function deleteTn(id) {
    if (confirm(currentLang === 'en' ? 'Delete tournament?' : 'Удалить турнир?')) db.ref('tournaments/' + id).remove();
}

// ==========================================
// ВЫЗОВЫ СУДЕЙ/МАРШАЛОВ И УВЕДОМЛЕНИЯ
// ==========================================
var knownAlertIds = {};

function listenForAlerts() {
    db.ref('alerts').orderByChild('status').equalTo('active').on('value', function(sn) {
        var alerts = sn.val() || {};
        var c = document.getElementById('admin-alerts-list');
        var entries = Object.entries(alerts);

        if (entries.length === 0) {
            if (c) c.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">' + (currentLang === 'en' ? 'No active alerts' : 'Нет активных вызовов') + '</p>';
            return;
        }

        var hasNewAlert = false;
        var isFirstRun = Object.keys(knownAlertIds).length === 0;

        entries.forEach(function(e) {
            var id = e[0], a = e[1];
            if (!knownAlertIds[id]) {
                knownAlertIds[id] = true;
                if (!isFirstRun) {
                    hasNewAlert = true;
                    var title = a.type === 'referee' ? (currentLang === 'en' ? '🚨 REFEREE CALL!' : '🚨 ВЫЗОВ СУДЬИ!') : (currentLang === 'en' ? '🚨 MARSHAL CALL!' : '🚨 ВЫЗОВ МАРШАЛА!');
                    var body = (currentLang === 'en' ? 'Hole #' : 'Лунка №') + a.hole + ' | ' + (currentLang === 'en' ? 'Player: ' : 'Игрок: ') + (a.playerName || 'Player') + ' (' + fmtTime(a.time) + ')';
                    if (typeof showPushNotification === 'function') {
                        showPushNotification(title, body, 'admin.html');
                    }
                }
            }
        });

        if (c) {
            var html = '';
            entries.sort(function(a, b) { return b[1].time - a[1].time; }).forEach(function(e) {
                var id = e[0], a = e[1];
                var icon = a.type === 'referee'
                    ? '<i class="fas fa-gavel" style="color:var(--red);"></i>'
                    : '<i class="fas fa-shield-halved" style="color:var(--blue);"></i>';
                var title = a.type === 'referee' ? (currentLang === 'en' ? 'REFEREE!' : 'СУДЬЯ!') : (currentLang === 'en' ? 'MARSHAL!' : 'МАРШАЛ!');

                var callHeader = currentLang === 'en' ? 'CALL: ' : 'ВЫЗОВ: ';
                var holeLblStr = currentLang === 'en' ? 'Hole' : 'Лунка';
                var playerLblStr = currentLang === 'en' ? 'Player' : 'Игрок';

                html += '<div class="list-item" style="padding:16px;border-left:4px solid var(--red);background:rgba(224,90,74,0.1);flex-wrap:wrap;gap:10px;">';
                html += '<div style="flex:1;min-width:200px;">';
                html += '<div style="font-weight:800;font-size:16px;color:var(--white);">' + icon + ' ' + callHeader + title + '</div>';
                html += '<div style="color:var(--gold);font-size:14px;margin:4px 0;">' + holeLblStr + ': <b>' + a.hole + '</b> | ' + playerLblStr + ': <b>' + (a.playerName || '—') + '</b></div>';
                html += '<div style="font-size:11px;color:var(--muted);">' + fmtTime(a.time) + '</div>';
                html += '</div>';
                html += '<button class="btn btn-r btn-sm" onclick="closeAlert(\'' + id + '\')">' + (currentLang === 'en' ? 'Dismiss Alert' : 'Закрыть вызов') + '</button>';
                html += '</div>';
            });

            c.innerHTML = html;
        }

        if (hasNewAlert) {
            toast(currentLang === 'en' ? '🚨 ON-COURSE ALERT!' : '🚨 ВЫЗОВ НА ПОЛЕ!', 'error');
            vib([200, 100, 200]);
        }
    });
}

function closeAlert(id) {
    db.ref('alerts/' + id + '/status').set('resolved');
}

// ==========================================
// PUSH-АНОНСЫ И РАССЫЛКИ КЛУБА
// ==========================================
function sendClubBroadcast() {
    var titleInp = document.getElementById('bc-title');
    var bodyInp = document.getElementById('bc-body');
    var linkInp = document.getElementById('bc-link');

    var title = titleInp ? titleInp.value.trim() : '';
    var body = bodyInp ? bodyInp.value.trim() : '';
    var link = linkInp ? linkInp.value : 'tournaments.html';

    if (!title || !body) {
        toast(currentLang === 'en' ? 'Specify title and message text' : 'Заполните заголовок и текст анонса', 'error');
        return;
    }

    if (!confirm(currentLang === 'en' ? 'Send push broadcast to ALL club players?' : 'Отправить Push-анонс ВСЕМ игрокам клуба?')) return;

    db.ref('broadcasts').push({
        title: title,
        body: body,
        link: link,
        time: Date.now(),
        sentBy: currentUser ? currentUser.uid : 'admin'
    }).then(function() {
        toast(currentLang === 'en' ? '📢 Push broadcast sent to all players!' : '📢 Push-анонс отправлен всем игрокам!');
        if (titleInp) titleInp.value = '';
        if (bodyInp) bodyInp.value = '';
        if (typeof showPushNotification === 'function') {
            showPushNotification(title, body, link);
        }
    });
}

function loadClubBroadcastsHistory() {
    if (typeof db === 'undefined') return;
    db.ref('broadcasts').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data).sort(function(a, b) { return b[1].time - a[1].time; });
        var el = document.getElementById('admin-broadcasts-list');
        if (!el) return;

        if (!entries.length) {
            el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">' + (currentLang === 'en' ? 'No broadcast announcements sent yet' : 'Пока нет отправленных анонсов') + '</p>';
            return;
        }

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], b = e[1];
            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<strong style="color:var(--gold);font-size:15px;"><i class="fas fa-bullhorn"></i> ' + (b.title || 'Announcement') + '</strong>';
            html += '<div style="font-size:13px;color:var(--white);margin:4px 0;">' + (b.body || '') + '</div>';
            html += '<div style="font-size:11px;color:var(--muted);">' + fmtDate(b.time) + ' · ' + fmtTime(b.time) + ' · Link: ' + (b.link || 'tournaments.html') + '</div>';
            html += '</div>';
            html += '<button class="btn btn-r btn-sm" onclick="deleteBroadcast(\'' + id + '\')"><i class="fas fa-trash"></i></button>';
            html += '</div>';
        });

        el.innerHTML = html;
    });
}

function deleteBroadcast(id) {
    if (confirm(currentLang === 'en' ? 'Delete announcement?' : 'Удалить анонс?')) {
        db.ref('broadcasts/' + id).remove();
    }
}

// ==========================================
// АВТОМАТИЧЕСКАЯ РАЗБИВКА НА ФЛАЙТЫ
// ==========================================
function openFlightGeneratorModal(tnId) {
    if (typeof db === 'undefined') return;
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal || !tVal.registeredPlayers) {
            toast(currentLang === 'en' ? 'No registered players for this tournament' : 'Нет зарегистрированных участников для разбивки', 'error');
            return;
        }

        var players = Object.values(tVal.registeredPlayers);
        if (!players.length) return;

        var modalEl = document.getElementById('flight-gen-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'flight-gen-modal';
            modalEl.className = 'modal hidden';
            modalEl.innerHTML =
                '<div class="modal-bg" onclick="closeFlightGenModal()"></div>' +
                '<div class="modal-body" style="max-width:520px;text-align:center;">' +
                '<div class="modal-top-bar">' +
                '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeFlightGenModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
                '<button type="button" class="modal-close-btn" onclick="closeFlightGenModal()">&times;</button>' +
                '</div>' +
                '<div id="flight-gen-modal-body"></div>' +
                '</div>';
            if (document.body) document.body.appendChild(modalEl);
        }

        var bodyEl = document.getElementById('flight-gen-modal-body');

        var html = '<h2 style="color:var(--gold);margin-bottom:8px;"><i class="fas fa-users-gear"></i> ' + (currentLang === 'en' ? 'Flight Generator' : 'Разбивка на Флайты') + '</h2>';
        html += '<p style="font-size:13px;color:var(--muted);margin-bottom:20px;">' + (currentLang === 'en' ? 'Total Registered: ' : 'Всего участников: ') + '<b>' + players.length + '</b></p>';

        html += '<div class="card" style="background:var(--input);padding:16px;text-align:left;margin-bottom:20px;">';
        html += '<div class="form-group"><label>' + (currentLang === 'en' ? 'Players per flight:' : 'Игроков во флайте:') + '</label>';
        html += '<select id="fg-size" class="form-input"><option value="4" selected>4 игрока</option><option value="3">3 игрока</option><option value="2">2 игрока</option></select></div>';

        html += '<div class="form-group"><label>' + (currentLang === 'en' ? 'First Flight Start Time:' : 'Время старта 1-го флайта:') + '</label>';
        html += '<input type="time" id="fg-time" class="form-input" value="10:00"></div>';

        html += '<div class="form-group"><label>' + (currentLang === 'en' ? 'Interval between flights (min):' : 'Интервал между флайтами (мин):') + '</label>';
        html += '<input type="number" id="fg-interval" class="form-input" value="10" min="5" max="30"></div>';
        html += '</div>';

        html += '<div style="display:flex;gap:12px;">';
        html += '<button class="btn btn-og" style="flex:1;" onclick="closeFlightGenModal()">' + t('cancel_btn') + '</button>';
        html += '<button class="btn btn-g" style="flex:1;" onclick="confirmFlightGeneration(\'' + tnId + '\')"><i class="fas fa-play"></i> ' + (currentLang === 'en' ? 'Create Flights' : 'Создать флайты') + '</button>';
        html += '</div>';

        bodyEl.innerHTML = html;
        modalEl.classList.remove('hidden');
    });
}

function closeFlightGenModal() {
    var modalEl = document.getElementById('flight-gen-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function confirmFlightGeneration(tnId) {
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal || !tVal.registeredPlayers) return;

        var players = Object.values(tVal.registeredPlayers);
        var flightSize = parseInt(document.getElementById('fg-size').value) || 4;
        var startTimeStr = document.getElementById('fg-time').value || '10:00';
        var intervalMin = parseInt(document.getElementById('fg-interval').value) || 10;

        var parts = startTimeStr.split(':');
        var now = new Date(tVal.date || Date.now());
        var baseStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(parts[0]), parseInt(parts[1]), 0).getTime();

        var tournamentTees = tVal.tees || ['wh'];
        var tournamentFormat = (tVal.formats && tVal.formats[0]) || 'Stroke Play';

        var flightsCreated = 0;
        var pIdx = 0;

        while (pIdx < players.length) {
            var chunk = players.slice(pIdx, pIdx + flightSize);
            pIdx += flightSize;

            var flightStartTime = baseStartTime + (flightsCreated * intervalMin * 60000);
            var roundPlayers = {};
            var pOrder = [];

            chunk.forEach(function(rp, idx) {
                var pid = rp.uid || 'guest_' + Date.now() + '_' + idx;
                var tee = rp.tee || tournamentTees[0];
                var gender = rp.gender || 'men';
                var exactHcp = rp.handicap || 0;
                var fieldHcp = getFieldHcp(exactHcp, tee, gender);

                roundPlayers[pid] = {
                    name: rp.name || 'Player',
                    exactHcp: exactHcp,
                    fieldHcp: fieldHcp,
                    gender: gender,
                    scores: {},
                    markerScores: {},
                    submitted: {},
                    markerSubmitted: {},
                    verified: {}
                };
                pOrder.push(pid);
            });

            var markerAssignments = {};
            for (var m = 0; m < pOrder.length; m++) {
                var mId = pOrder[m];
                var tId = pOrder[(m + 1) % pOrder.length];
                roundPlayers[tId].markedBy = mId;
                markerAssignments[mId] = { targetId: tId, targetName: roundPlayers[tId].name };
            }

            var roundData = {
                mode: 'group',
                tee: tournamentTees[0],
                format: tournamentFormat,
                startHole: 1,
                startTime: flightStartTime,
                players: roundPlayers,
                markerAssignments: markerAssignments,
                participantsList: pOrder,
                status: 'active',
                tournamentId: tnId,
                createdAt: Date.now(),
                createdBy: currentUser ? currentUser.uid : 'admin',
                accessKey: 'group_key_' + Math.random().toString(36).substring(2)
            };

            db.ref('rounds').push(roundData);
            flightsCreated++;
        }

        db.ref('tournaments/' + tnId + '/status').set('active');
        toast((currentLang === 'en' ? '🎉 Created ' : '🎉 Создано ') + flightsCreated + (currentLang === 'en' ? ' active flights!' : ' активных флайтов!'), 'success');
        closeFlightGenModal();
        if (typeof loadTournaments === 'function') loadTournaments();
        if (typeof loadAdmRounds === 'function') loadAdmRounds();
    });
}

// ==========================================
// ПОЛНЫЙ ЭКСПОРТ АРХИВА CSV И JSON БЭКАП
// ==========================================
function exportAllRoundsCSV() {
    if (typeof db === 'undefined') return;
    db.ref('rounds').once('value').then(function(sn) {
        var data = sn.val() || {};
        var rounds = Object.entries(data);
        if (!rounds.length) { toast(currentLang === 'en' ? 'No rounds to export' : 'Нет раундов для экспорта', 'error'); return; }

        var headers = ['Round ID', 'Date', 'Time', 'Mode', 'Format', 'Tee', 'Status', 'Player Name', 'HCP', 'Gross', 'ToPar', 'Net', 'Stableford'];
        for (var h = 1; h <= 18; h++) headers.push('Hole ' + h);

        var rows = [headers];

        rounds.forEach(function(e) {
            var rid = e[0], r = e[1];
            var dateStr = fmtDate(r.createdAt);
            var timeStr = fmtTime(r.startTime);

            Object.values(r.players || {}).forEach(function(p) {
                var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, holeOrder(r.startHole || 1));
                var row = [
                    rid,
                    dateStr,
                    timeStr,
                    r.mode || 'group',
                    r.format || 'Stroke',
                    r.tee || 'wh',
                    r.status || 'active',
                    '"' + (p.name || '').replace(/"/g, '""') + '"',
                    fmtExactHcp(p.exactHcp),
                    stats.gross || 0,
                    fmtScore(stats.toPar),
                    stats.net || 0,
                    stats.stablefordField || 0
                ];
                for (var h = 1; h <= 18; h++) {
                    row.push(p.scores && p.scores[h] ? p.scores[h] : '');
                }
                rows.push(row);
            });
        });

        var csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(function(e) { return e.join(','); }).join('\n');
        var encodedUri = encodeURI(csvContent);
        var link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'Pestovo_Golf_Full_Archive_' + Date.now() + '.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast('📄 Full CSV archive exported!', 'success');
    });
}

function downloadJSONBackup() {
    if (typeof db === 'undefined') return;
    db.ref().once('value').then(function(sn) {
        var fullData = sn.val() || {};
        var jsonStr = JSON.stringify(fullData, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'Pestovo_Database_Backup_' + Date.now() + '.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast('💾 Database JSON backup downloaded!', 'success');
    });
}

// ==========================================
// TELEGRAM BOT SETTINGS & ALERTS
// ==========================================
function loadTelegramSettings() {
    var tokInp = document.getElementById('tg-bot-token');
    var chatInp = document.getElementById('tg-chat-id');

    if (tokInp && localStorage.getItem('pestovo_tg_bot_token')) tokInp.value = localStorage.getItem('pestovo_tg_bot_token');
    if (chatInp && localStorage.getItem('pestovo_tg_chat_id')) chatInp.value = localStorage.getItem('pestovo_tg_chat_id');

    if (typeof db !== 'undefined') {
        db.ref('settings/telegram').once('value').then(function(sn) {
            var tg = sn.val() || {};
            if (tokInp && tg.botToken) tokInp.value = tg.botToken;
            if (chatInp && tg.chatId) chatInp.value = tg.chatId;
        });
    }
}

function saveTelegramSettings() {
    var tokInp = document.getElementById('tg-bot-token');
    var chatInp = document.getElementById('tg-chat-id');
    var botToken = tokInp ? tokInp.value.trim() : '';
    var chatId = chatInp ? chatInp.value.trim() : '';

    localStorage.setItem('pestovo_tg_bot_token', botToken);
    localStorage.setItem('pestovo_tg_chat_id', chatId);

    if (typeof db !== 'undefined') {
        db.ref('settings/telegram').set({
            botToken: botToken,
            chatId: chatId,
            updatedAt: Date.now()
        }).then(function() {
            toast(currentLang === 'en' ? '✅ Telegram Bot settings saved!' : '✅ Настройки Telegram Bot сохранены!', 'success');
        });
    } else {
        toast(currentLang === 'en' ? '✅ Telegram settings saved locally!' : '✅ Настройки Telegram сохранены локально!', 'success');
    }
}

function testTelegramAlert() {
    saveTelegramSettings();
    sendTelegramOfficialAlert('referee', 1, 'Тестовый Игрок (Админ)', 'Проверка интеграции Telegram', true);
}
