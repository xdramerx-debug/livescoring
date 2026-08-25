document.addEventListener('DOMContentLoaded', function() {
    initNav();
    initAdminAutoLogin();
});

function initAdminAutoLogin() {
    var uInp = document.getElementById('adm-user');
    var pInp = document.getElementById('adm-pass');
    var rChk = document.getElementById('adm-remember');

    var savedU = localStorage.getItem('pestovo_adm_user');
    var savedP = localStorage.getItem('pestovo_adm_pass');
    var savedR = localStorage.getItem('pestovo_adm_remember');

    if (savedU && uInp) uInp.value = savedU;
    if (savedP && pInp) pInp.value = savedP;
    if (rChk && savedR !== null) rChk.checked = (savedR === 'true');

    if (localStorage.getItem('pestovo_adm_logged_in') === 'true') {
        openAdminPanel();
    }
}

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
    var uInp = document.getElementById('adm-user');
    var pInp = document.getElementById('adm-pass');
    var rChk = document.getElementById('adm-remember');

    var u = uInp ? uInp.value.trim() : '';
    var p = pInp ? pInp.value : '';
    var er = document.getElementById('adm-error');
    if (er) er.classList.add('hidden');

    if (u === ADMIN_LOGIN && p === ADMIN_PASS) {
        if (rChk && rChk.checked) {
            localStorage.setItem('pestovo_adm_user', u);
            localStorage.setItem('pestovo_adm_pass', p);
            localStorage.setItem('pestovo_adm_remember', 'true');
        } else {
            localStorage.removeItem('pestovo_adm_user');
            localStorage.removeItem('pestovo_adm_pass');
            localStorage.setItem('pestovo_adm_remember', 'false');
        }
        localStorage.setItem('pestovo_adm_logged_in', 'true');

        openAdminPanel();
        toast(currentLang === 'en' ? '✅ Logged in via master password' : '✅ Вход по мастер-паролю');
        return;
    }

    if (currentUserData && currentUserData.role === 'admin') {
        localStorage.setItem('pestovo_adm_logged_in', 'true');
        openAdminPanel();
        toast(currentLang === 'en' ? '✅ Logged in (Admin Privileges)' : '✅ Вход выполнен (Права администратора)');
        return;
    }

    if (currentUserData && currentUserData.role !== 'admin') {
        if (er) er.textContent = currentLang === 'en' ? 'Your account does not have admin privileges.' : 'У вашего аккаунта нет прав администратора. Обратитесь к главному админу.';
    } else {
        if (er) er.textContent = currentLang === 'en' ? 'Invalid credentials or not authorized.' : 'Неверный логин/пароль или вы не авторизованы на сайте.';
    }
    if (er) er.classList.remove('hidden');
}

function adminLogout() {
    localStorage.removeItem('pestovo_adm_logged_in');
    try { sessionStorage.removeItem('pestovo_is_admin'); } catch(e) {}

    var loginEl = document.getElementById('admin-login');
    var contentEl = document.getElementById('admin-content');
    var logoutBtn = document.getElementById('admin-logout-btn');

    if (loginEl) loginEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');

    toast(currentLang === 'en' ? 'Logged out of admin panel' : 'Вышли из админки', 'info');
    if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
}

function openAdminPanel() {
    try { sessionStorage.setItem('pestovo_is_admin', 'true'); } catch(e) {}
    localStorage.setItem('pestovo_adm_logged_in', 'true');
    if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();

    var loginEl = document.getElementById('admin-login');
    var contentEl = document.getElementById('admin-content');
    var logoutBtn = document.getElementById('admin-logout-btn');

    if (loginEl) loginEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    loadAdmRounds();
    loadAdmPlayers();
    loadTournaments();
    loadClubBroadcastsHistory();
    listenForAlerts();
    loadTelegramSettings();
    loadVKSettings();
    loadPageVisibilitySettings();
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

    if (t === 'data') {
        loadPageVisibilitySettings();
    }
    if (t === 'rusgolf') {
        loadRusgolfProxySettings();
    }
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
    if (!confirm(currentLang === 'en' ? 'Delete round?' : 'Удалить раунд?')) return;

    db.ref('rounds/' + id).once('value').then(function(sn) {
        var r = sn.val();
        if (r && r.players) {
            var playerIds = Object.keys(r.players);
            playerIds.forEach(function(pid) {
                db.ref('users/' + pid + '/history').once('value').then(function(hSn) {
                    var hist = hSn.val() || {};
                    Object.entries(hist).forEach(function(he) {
                        if (he[1] && he[1].roundId === id) {
                            db.ref('users/' + pid + '/history/' + he[0]).remove();
                        }
                    });
                    db.ref('users/' + pid + '/history').once('value').then(function(hSn2) {
                        var history = hSn2.val() || {};
                        var rounds = Object.values(history);
                        var count = rounds.length;
                        var bestG = null, bestS = null;
                        rounds.forEach(function(item) {
                            if (item.holes === 18 && item.gross) {
                                if (bestG === null || item.gross < bestG) bestG = item.gross;
                            }
                            if (item.holes === 18 && item.stablefordField) {
                                if (bestS === null || item.stablefordField > bestS) bestS = item.stablefordField;
                            }
                        });
                        db.ref('users/' + pid).update({
                            roundsPlayed: count,
                            bestGross: bestG,
                            bestStableford: bestS
                        });
                    });
                });
            });
        }

        db.ref('rounds/' + id).remove();
        db.ref('markers/' + id).remove();
        db.ref('markerAssignments/' + id).remove();
        toast(currentLang === 'en' ? 'Round deleted' : 'Раунд удалён', 'info');
    });
}

function clearRounds() {
    if (confirm(currentLang === 'en' ? 'Delete ALL rounds and history? This cannot be undone!' : 'Удалить ВСЕ раунды и всю историю? Это необратимо!') && confirm(currentLang === 'en' ? 'Are you sure?' : 'Точно уверены?')) {
        db.ref('rounds').remove();
        db.ref('markers').remove();
        db.ref('markerAssignments').remove();
        db.ref('alerts').remove();

        db.ref('users').once('value').then(function(sn) {
            var users = sn.val() || {};
            Object.keys(users).forEach(function(uid) {
                db.ref('users/' + uid + '/history').remove();
                db.ref('users/' + uid).update({
                    roundsPlayed: 0,
                    bestGross: null,
                    bestStableford: null
                });
            });
        });

        toast(currentLang === 'en' ? 'All rounds and history deleted' : 'Все раунды и история удалены', 'info');
    }
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
        var bannerEl = document.getElementById('admin-top-alerts-banner');
        var entries = Object.entries(alerts);

        if (bannerEl) {
            if (entries.length > 0) {
                bannerEl.innerHTML = '<div class="card" style="background:rgba(224,90,74,0.18);border:2px solid var(--red);margin-bottom:16px;cursor:pointer;" onclick="switchTab(\'alerts\', document.querySelector(\'[data-i18n=tab_alerts]\'))">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
                    '<div style="color:var(--red);font-weight:800;font-size:14px;display:flex;align-items:center;gap:8px;">' +
                    '<i class="fas fa-exclamation-triangle" style="font-size:20px;"></i> ' +
                    '<span>🚨 ' + (currentLang === 'en' ? 'ATTENTION: ' + entries.length + ' ACTIVE OFFICIAL CALL(S) ON COURSE!' : 'ВНИМАНИЕ: ' + entries.length + ' АКТИВНЫХ ВЫЗОВА СУДЬИ/МАРШАЛА НА ПОЛЕ!') + '</span>' +
                    '</div>' +
                    '<button class="btn btn-danger btn-sm">' + (currentLang === 'en' ? 'View Calls →' : 'Посмотреть вызовы →') + '</button>' +
                    '</div></div>';
                bannerEl.classList.remove('hidden');
            } else {
                bannerEl.innerHTML = '';
                bannerEl.classList.add('hidden');
            }
        }

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
        var p4Str = currentLang === 'en' ? '4 Players' : '4 игрока';
        var p3Str = currentLang === 'en' ? '3 Players' : '3 игрока';
        var p2Str = currentLang === 'en' ? '2 Players' : '2 игрока';
        html += '<select id="fg-size" class="form-input"><option value="4" selected>' + p4Str + '</option><option value="3">' + p3Str + '</option><option value="2">' + p2Str + '</option></select></div>';

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
// TELEGRAM BOT SETTINGS & ALERTS (GROUP & CHANNEL)
// ==========================================
function loadTelegramSettings() {
    var gTokInp = document.getElementById('tg-group-bot-token');
    var gChatInp = document.getElementById('tg-group-chat-id');
    var cTokInp = document.getElementById('tg-channel-bot-token');
    var cChatInp = document.getElementById('tg-channel-id');

    if (gTokInp) gTokInp.value = localStorage.getItem('pestovo_tg_group_token') || localStorage.getItem('pestovo_tg_bot_token') || '';
    if (gChatInp) gChatInp.value = localStorage.getItem('pestovo_tg_group_id') || localStorage.getItem('pestovo_tg_chat_id') || '';
    if (cTokInp) cTokInp.value = localStorage.getItem('pestovo_tg_channel_token') || localStorage.getItem('pestovo_tg_bot_token') || '';
    if (cChatInp) cChatInp.value = localStorage.getItem('pestovo_tg_channel_id') || '';

    if (typeof db !== 'undefined') {
        db.ref('settings/telegram').once('value').then(function(sn) {
            var tg = sn.val() || {};
            if (gTokInp && (tg.groupToken || tg.botToken)) gTokInp.value = tg.groupToken || tg.botToken;
            if (gChatInp && (tg.groupId || tg.chatId)) gChatInp.value = tg.groupId || tg.chatId;
            if (cTokInp && (tg.channelToken || tg.botToken)) cTokInp.value = tg.channelToken || tg.botToken;
            if (cChatInp && tg.channelId) cChatInp.value = tg.channelId;
        });
    }
}

function saveTelegramSettings(targetMode) {
    var gTokInp = document.getElementById('tg-group-bot-token');
    var gChatInp = document.getElementById('tg-group-chat-id');
    var cTokInp = document.getElementById('tg-channel-bot-token');
    var cChatInp = document.getElementById('tg-channel-id');

    var gToken = gTokInp ? gTokInp.value.trim() : '';
    var gId = gChatInp ? gChatInp.value.trim() : '';
    var cToken = cTokInp ? cTokInp.value.trim() : '';
    var cId = cChatInp ? cChatInp.value.trim() : '';

    if (gToken) {
        localStorage.setItem('pestovo_tg_group_token', gToken);
        localStorage.setItem('pestovo_tg_bot_token', gToken);
    }
    if (gId) {
        localStorage.setItem('pestovo_tg_group_id', gId);
        localStorage.setItem('pestovo_tg_chat_id', gId);
    }
    if (cToken) localStorage.setItem('pestovo_tg_channel_token', cToken);
    if (cId) localStorage.setItem('pestovo_tg_channel_id', cId);

    if (typeof db !== 'undefined') {
        db.ref('settings/telegram').update({
            groupToken: gToken,
            groupId: gId,
            channelToken: cToken,
            channelId: cId,
            botToken: gToken || cToken,
            chatId: gId,
            updatedAt: Date.now()
        }).then(function() {
            toast(currentLang === 'en' ? '✅ Telegram settings saved!' : '✅ Настройки Telegram сохранены!', 'success');
        });
    } else {
        toast(currentLang === 'en' ? '✅ Telegram settings saved locally!' : '✅ Настройки Telegram сохранены локально!', 'success');
    }
}

function testTelegramGroupAlert() {
    var gTokInp = document.getElementById('tg-group-bot-token');
    var gChatInp = document.getElementById('tg-group-chat-id');
    var token = gTokInp ? gTokInp.value.trim() : '';
    var chatId = gChatInp ? gChatInp.value.trim() : '';

    if (!token || !chatId) {
        toast('⚠️ Укажите Group Bot Token и Group Chat ID перед проверкой', 'error');
        return;
    }

    localStorage.setItem('pestovo_tg_group_token', token);
    localStorage.setItem('pestovo_tg_group_id', chatId);

    if (typeof db !== 'undefined') {
        db.ref('settings/telegram').update({
            groupToken: token,
            groupId: chatId,
            botToken: token,
            chatId: chatId,
            updatedAt: Date.now()
        }).catch(function(){});
    }

    sendTelegramDirectAlert(token, chatId, 'Группу', 'referee', 1, 'Администратор Клуба', 'Тестовая проверка Группы');
}

function testTelegramChannelAlert() {
    var cTokInp = document.getElementById('tg-channel-bot-token');
    var cChatInp = document.getElementById('tg-channel-id');
    var token = cTokInp ? cTokInp.value.trim() : '';
    var chatId = cChatInp ? cChatInp.value.trim() : '';

    if (!token || !chatId) {
        toast('⚠️ Укажите Channel Bot Token и Channel ID перед проверкой', 'error');
        return;
    }

    localStorage.setItem('pestovo_tg_channel_token', token);
    localStorage.setItem('pestovo_tg_channel_id', chatId);

    if (typeof db !== 'undefined') {
        db.ref('settings/telegram').update({
            channelToken: token,
            channelId: chatId,
            updatedAt: Date.now()
        }).catch(function(){});
    }

    sendTelegramDirectAlert(token, chatId, 'Канал', 'referee', 1, 'Администратор Клуба', 'Тестовая проверка Канала');
}

function testTelegramAlert(targetMode) {
    if (targetMode === 'group') testTelegramGroupAlert();
    else if (targetMode === 'channel') testTelegramChannelAlert();
    else {
        testTelegramGroupAlert();
        testTelegramChannelAlert();
    }
}

// ==========================================
// VK API SETTINGS & ALERTS
// ==========================================
function loadVKSettings() {
    var tokInp = document.getElementById('vk-access-token');
    var peerInp = document.getElementById('vk-peer-id');

    if (tokInp) tokInp.value = localStorage.getItem('pestovo_vk_token') || '';
    if (peerInp) peerInp.value = localStorage.getItem('pestovo_vk_peer_id') || '';

    if (typeof db !== 'undefined') {
        db.ref('settings/vk').once('value').then(function(sn) {
            var vk = sn.val() || {};
            if (tokInp && vk.token) tokInp.value = vk.token;
            if (peerInp && vk.peerId) peerInp.value = vk.peerId;
        });
    }
}

function saveVKSettings() {
    var tokInp = document.getElementById('vk-access-token');
    var peerInp = document.getElementById('vk-peer-id');
    var token = tokInp ? tokInp.value.trim() : '';
    var peerId = peerInp ? peerInp.value.trim() : '';

    if (token) localStorage.setItem('pestovo_vk_token', token);
    if (peerId) localStorage.setItem('pestovo_vk_peer_id', peerId);

    if (typeof db !== 'undefined') {
        db.ref('settings/vk').set({
            token: token,
            peerId: peerId,
            updatedAt: Date.now()
        }).then(function() {
            toast(currentLang === 'en' ? '✅ VK API settings saved!' : '✅ Настройки ВК сохранены!', 'success');
        });
    } else {
        toast(currentLang === 'en' ? '✅ VK settings saved locally!' : '✅ Настройки ВК сохранены локально!', 'success');
    }
}

function testVKAlert() {
    var tokInp = document.getElementById('vk-access-token');
    var peerInp = document.getElementById('vk-peer-id');
    var token = tokInp ? tokInp.value.trim() : '';
    var peerId = peerInp ? peerInp.value.trim() : '';

    if (!token || !peerId) {
        toast('⚠️ Укажите VK Access Token и Peer ID перед проверкой', 'error');
        return;
    }

    localStorage.setItem('pestovo_vk_token', token);
    localStorage.setItem('pestovo_vk_peer_id', peerId);

    if (typeof db !== 'undefined') {
        db.ref('settings/vk').set({ token: token, peerId: peerId, updatedAt: Date.now() }).catch(function(){});
    }

    sendVKDirectAlert(token, peerId, 'referee', 1, 'Администратор Клуба', 'Тестовая проверка ВК');
}

// ==========================================
// PAGE VISIBILITY MANAGEMENT
// ==========================================
function loadPageVisibilitySettings() {
    if (typeof MANAGED_PAGES === 'undefined') return;

    var updateCheckboxes = function(hp) {
        hp = hp || {};
        MANAGED_PAGES.forEach(function(page) {
            var key = page.replace('.html', '');
            var checkbox = document.getElementById('pv-' + key) || document.getElementById('pv-' + page);
            if (checkbox) {
                var isHidden = (hp[page] === true || hp[key] === true);
                checkbox.checked = !isHidden;
            }
        });
    };

    if (typeof getHiddenPages === 'function') {
        updateCheckboxes(getHiddenPages());
    }

    if (typeof db !== 'undefined') {
        db.ref('settings/hidden_pages').on('value', function(sn) {
            var fbVal = sn.val();
            if (fbVal !== null && typeof fbVal === 'object') {
                var hp = {};
                MANAGED_PAGES.forEach(function(page) {
                    var key = page.replace('.html', '');
                    if (fbVal[key] !== undefined) {
                        hp[page] = (fbVal[key] === true);
                        hp[key] = (fbVal[key] === true);
                    } else if (fbVal[page] !== undefined) {
                        hp[page] = (fbVal[page] === true);
                        hp[key] = (fbVal[page] === true);
                    }
                });
                localStorage.setItem('pestovo_hidden_pages', JSON.stringify(hp));
                updateCheckboxes(hp);
                if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
            }
        });
    }
}

function savePageVisibilitySettings() {
    if (typeof MANAGED_PAGES === 'undefined') return;

    var hiddenPages = {};
    var fbPages = {};

    MANAGED_PAGES.forEach(function(page) {
        var key = page.replace('.html', '');
        var checkbox = document.getElementById('pv-' + key) || document.getElementById('pv-' + page);
        var isHidden = checkbox ? !checkbox.checked : false;

        hiddenPages[page] = isHidden;
        hiddenPages[key] = isHidden;
        fbPages[key] = isHidden;
    });

    localStorage.setItem('pestovo_hidden_pages', JSON.stringify(hiddenPages));
    if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();

    toast(currentLang === 'en' ? '✅ Page visibility settings saved!' : '✅ Настройки видимости страниц сохранены!', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);

    if (typeof db !== 'undefined') {
        db.ref('settings/hidden_pages').set(fbPages).then(function() {
            console.log('Page visibility synced to Firebase successfully');
        }).catch(function(err) {
            console.warn('Firebase sync warning:', err);
        });
    }
}

function togglePVCheckbox(id, event) {
    if (event) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
    }
    var checkbox = document.getElementById(id);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        if (typeof vib === 'function') vib(30);
    }
}

// ==========================================
// ИГРОКИ И РОЛИ
// ==========================================
function loadAdmPlayers() {
    var el = document.getElementById('adm-players');
    if (!el) return;

    var renderWithData = function(remoteData) {
        var localUsers = typeof getKnownPlayersSync === 'function' ? (getKnownPlayersSync() || {}) : {};
        var combined = Object.assign({}, localUsers, remoteData || {});
        var entries = Object.entries(combined);

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

                html += '<button class="btn btn-og btn-sm" onclick="clearPlayerHistory(\'' + id + '\',\'' + (u.name || '').replace(/'/g, "\\'") + '\')" title="' + (currentLang === 'en' ? 'Clear History' : 'Очистить историю раундов') + '"><i class="fas fa-eraser"></i></button>';

                html += '<button class="btn btn-r btn-sm" onclick="deletePlayer(\'' + id + '\',\'' + (u.name || '').replace(/'/g, "\\'") + '\')" title="Delete">' +
                        '<i class="fas fa-trash"></i></button>';
            } else {
                html += '<button class="btn btn-og btn-sm" onclick="clearPlayerHistory(\'' + id + '\',\'' + (u.name || '').replace(/'/g, "\\'") + '\')" title="' + (currentLang === 'en' ? 'Clear History' : 'Очистить историю раундов') + '"><i class="fas fa-eraser"></i></button>';
                html += '<span style="font-size:11px;color:var(--gold);font-weight:600;">(' + (currentLang === 'en' ? 'You' : 'Это вы') + ')</span>';
            }

            html += '</div></div>';
        });

        el.innerHTML = html;
    };

    renderWithData();

    if (typeof db !== 'undefined') {
        db.ref('users').on('value', function(sn) {
            renderWithData(sn.val());
        });
    }
}

function changeRole(id, newRole, name) {
    var roleText = newRole === 'admin' ? (currentLang === 'en' ? 'Administrator' : 'Администратора') : (currentLang === 'en' ? 'Player' : 'Игрока');
    if (!confirm((currentLang === 'en' ? 'Set ' + (name || 'user') + ' role to ' + roleText + '?' : 'Назначить ' + (name || 'пользователя') + ' на роль ' + roleText + '?'))) return;

    if (typeof db !== 'undefined') {
        db.ref('users/' + id + '/role').set(newRole).then(function() {
            toast('✅ ' + (name || 'User') + (currentLang === 'en' ? ' is now ' : ' теперь ') + roleText);
        }).catch(function(err) {
            toast('❌ Error: ' + err.message, 'error');
        });
    }
}

function deletePlayer(id, name) {
    if (!confirm((currentLang === 'en' ? 'Delete player ' + (name || id) + '? This cannot be undone!' : 'Удалить игрока ' + (name || id) + '? Это необратимо!'))) return;

    var finishLocalDelete = function() {
        // Запоминаем удаление, чтобы кэш и история раундов не «воскрешали» игрока
        if (typeof markPlayerDeleted === 'function') markPlayerDeleted(id, name);

        if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[id]) {
            delete cachedRegisteredUsers[id];
        }
        try {
            var custom = {};
            var existing = localStorage.getItem('pestovo_custom_players');
            if (existing) custom = JSON.parse(existing) || {};
            if (custom[id]) {
                delete custom[id];
                localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
            }
            // Кэш удалённых игроков хранится и в pestovo_cached_users — чистим оба ключа
            var cachedRaw = localStorage.getItem('pestovo_cached_users');
            if (cachedRaw) {
                var cached = JSON.parse(cachedRaw);
                if (cached && typeof cached === 'object') {
                    delete cached[id];
                    localStorage.setItem('pestovo_cached_users', JSON.stringify(cached));
                }
            }
        } catch(e) {}

        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        toast(currentLang === 'en' ? '🗑️ Player deleted' : '🗑️ Игрок удалён');
    };

    if (typeof db !== 'undefined') {
        // Удаляем из Firebase, и только после успешного удаления чистим локальный кэш
        db.ref('users/' + id).remove().then(function() {
            finishLocalDelete();
        }).catch(function(err) {
            toast((currentLang === 'en' ? '❌ Delete failed: ' : '❌ Ошибка удаления: ') + (err && err.message ? err.message : err), 'error');
        });
    } else {
        finishLocalDelete();
    }
}

function clearPlayerHistory(userId, userName) {
    if (!userId) return;
    var confirmMsg = currentLang === 'en'
        ? 'Delete ALL round history for ' + (userName || 'player') + '?'
        : 'Удалить ВСЮ историю раундов игрока ' + (userName || 'игрока') + '? Это действие необратимо!';

    if (!confirm(confirmMsg)) return;

    if (typeof db !== 'undefined') {
        db.ref('users/' + userId + '/history').remove().then(function() {
            db.ref('users/' + userId).update({
                roundsPlayed: 0,
                bestGross: null,
                bestStableford: null
            });

            toast(currentLang === 'en' ? 'History cleared for ' + userName : 'История раундов игрока ' + userName + ' очищена', 'success');
            if (typeof vib === 'function') vib([50, 30, 50]);
            if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        }).catch(function(err) {
            toast('⚠️ Ошибка удаления истории: ' + err.message, 'error');
        });
    } else {
        toast(currentLang === 'en' ? 'History cleared for ' + userName : 'История раундов игрока ' + userName + ' очищена', 'success');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    }
}

function createPlayerInAdmin() {
    var nameInp = document.getElementById('adm-new-name');
    var emailInp = document.getElementById('adm-new-email');
    var hcpInp = document.getElementById('adm-new-hcp');
    var genderSel = document.getElementById('adm-new-gender');
    var teeSel = document.getElementById('adm-new-tee');
    var roleSel = document.getElementById('adm-new-role');

    if (!nameInp) return;
    var name = nameInp.value.trim();
    if (!name) {
        toast(currentLang === 'en' ? '⚠️ Specify player full name' : '⚠️ Укажите имя и фамилию игрока', 'error');
        nameInp.focus();
        return;
    }

    var email = emailInp ? emailInp.value.trim() : '';
    var hcpRaw = hcpInp ? hcpInp.value.trim() : '0';
    var parsedHcp = parseExactHcp(hcpRaw);
    var gender = genderSel ? genderSel.value : 'men';
    var defaultTee = teeSel ? teeSel.value : 'wh';
    var role = roleSel ? roleSel.value : 'player';

    var parts = name.split(' ');
    var firstName = parts[0] || name;
    var lastName = parts.slice(1).join(' ') || '';

    var newId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    var playerData = {
        name: name,
        firstName: firstName,
        lastName: lastName,
        email: email,
        handicap: parsedHcp,
        gender: gender,
        defaultTee: defaultTee,
        role: role,
        createdAt: Date.now(),
        roundsPlayed: 0,
        bestGross: null,
        bestStableford: null
    };

    try {
        var custom = {};
        var existing = localStorage.getItem('pestovo_custom_players');
        if (existing) custom = JSON.parse(existing) || {};
        custom[newId] = playerData;
        localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
    } catch(e) {}

    if (typeof cachedRegisteredUsers !== 'undefined') {
        cachedRegisteredUsers[newId] = playerData;
        try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch(e) {}
    }

    toast(currentLang === 'en' ? '🎉 Player ' + name + ' created!' : '🎉 Игрок ' + name + ' создан!', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    nameInp.value = '';
    if (emailInp) emailInp.value = '';
    if (hcpInp) hcpInp.value = '';

    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();

    if (typeof db !== 'undefined') {
        db.ref('users/' + newId).set(playerData).catch(function(err) {
            console.warn('Firebase user save notice:', err);
        });
    }
}

// ==========================================
// ИМПОРТ / ЭКСПОРТ ИГРОКОВ ЧЕРЕЗ EXCEL
// ==========================================
var impParsedRows = [];

function impNormName(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function impSplitName(name) {
    var parts = String(name || '').replace(/\s+/g, ' ').trim().split(' ');
    return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
}

function impCollectPlayers(callback) {
    var localUsers = typeof getKnownPlayersSync === 'function' ? (getKnownPlayersSync() || {}) : {};
    var renderList = function(remoteData) {
        var combined = Object.assign({}, localUsers, remoteData || {});
        callback(Object.entries(combined).map(function(e) {
            return { id: e[0], data: e[1] || {} };
        }));
    };
    if (typeof db !== 'undefined') {
        db.ref('users').once('value').then(function(sn) { renderList(sn.val()); })
            .catch(function() { renderList(null); });
    } else {
        renderList(null);
    }
}

function exportPlayersExcel() {
    if (typeof XLSX === 'undefined') {
        toast(currentLang === 'en' ? '❌ Excel library not loaded (check internet)' : '❌ Библиотека Excel не загрузилась (проверьте интернет)', 'error');
        return;
    }
    impCollectPlayers(function(players) {
        if (!players.length) {
            toast(currentLang === 'en' ? 'No players to export' : 'Нет игроков для экспорта', 'error');
            return;
        }
        players.sort(function(a, b) {
            return impNormName((a.data.lastName || '') + ' ' + (a.data.firstName || '')).localeCompare(impNormName((b.data.lastName || '') + ' ' + (b.data.firstName || '')));
        });

        var rows = [['Имя', 'Фамилия', 'Точный гандикап']];
        players.forEach(function(p) {
            var u = p.data;
            var firstName = u.firstName || impSplitName(u.name || '').firstName;
            var lastName = u.lastName || impSplitName(u.name || '').lastName;
            var hcpCell = '';
            if (u.handicap !== null && u.handicap !== undefined && !isNaN(parseFloat(u.handicap))) {
                hcpCell = parseFloat(u.handicap) < 0 ? fmtExactHcp(u.handicap) : Math.round(parseFloat(u.handicap) * 10) / 10;
            }
            rows.push([firstName, lastName, hcpCell]);
        });

        var ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 18 }];
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Игроки');
        XLSX.writeFile(wb, 'Pestovo_Igroki_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        toast('📊 ' + (currentLang === 'en' ? 'Exported players: ' : 'Экспортировано игроков: ') + (rows.length - 1), 'success');
    });
}

function downloadPlayersTemplate() {
    if (typeof XLSX === 'undefined') {
        toast(currentLang === 'en' ? '❌ Excel library not loaded (check internet)' : '❌ Библиотека Excel не загрузилась (проверьте интернет)', 'error');
        return;
    }
    var rows = [
        ['Имя', 'Фамилия', 'Точный гандикап', 'Пол (муж/жен — необязательно)'],
        ['Сергей', 'Петров', 3.9, 'муж'],
        ['Анна', 'Воробьёва', 18.2, 'жен']
    ];
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 18 }, { wch: 30 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Игроки');
    XLSX.writeFile(wb, 'Shablon_Igrokov_Pestovo.xlsx');
    toast('📋 ' + (currentLang === 'en' ? 'Template downloaded' : 'Шаблон скачан'), 'success');
}

function impHeaderKey(raw) {
    var s = impNormName(raw).replace(/[.:]/g, '');
    if (['имя', 'first name', 'firstname', 'first_name', 'given name'].indexOf(s) !== -1) return 'firstName';
    if (['фамилия', 'last name', 'lastname', 'last_name', 'surname', 'family name'].indexOf(s) !== -1) return 'lastName';
    if (['точный гандикап', 'гандикап', 'точный hcp', 'hcp', 'hi', 'handicap', 'handicap index', 'гандикап index'].indexOf(s) !== -1) return 'hcp';
    if (['пол', 'gender', 'sex'].indexOf(s) !== -1) return 'gender';
    if (['фио', 'имя фамилия', 'full name', 'фамилия имя отчество', 'игрок', 'player'].indexOf(s) !== -1) return 'fio';
    return null;
}

function impGenderFromCell(v) {
    var s = impNormName(v);
    if (['ж', 'жен', 'ж', 'жeн', 'f', 'female', 'w', 'women', 'женский', 'женщина'].indexOf(s) !== -1 || s.indexOf('жен') === 0) return 'women';
    if (['м', 'муж', 'm', 'male', 'men', 'мужской', 'мужчина'].indexOf(s) !== -1 || s.indexOf('муж') === 0) return 'men';
    return 'men';
}

function handlePlayersFileSelect(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var statusEl = document.getElementById('imp-status');
    var previewEl = document.getElementById('imp-preview');

    if (typeof XLSX === 'undefined') {
        toast(currentLang === 'en' ? '❌ Excel library not loaded (check internet)' : '❌ Библиотека Excel не загрузилась (проверьте интернет)', 'error');
        input.value = '';
        return;
    }

    if (statusEl) statusEl.innerHTML = '<p style="color:var(--muted);font-size:13px;"><i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Reading file...' : 'Чтение файла...') + '</p>';
    if (previewEl) previewEl.innerHTML = '';

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            var sheet = wb.Sheets[wb.SheetNames[0]];
            if (!sheet) throw new Error(currentLang === 'en' ? 'no sheets' : 'нет листов в файле');

            var json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            var mapped = impMapRows(json || []);
            if (!mapped.validRows.length && !mapped.invalidRows.length) {
                if (statusEl) statusEl.innerHTML = '<div class="imp-note imp-note-err"><i class="fas fa-triangle-exclamation"></i> ' +
                    (currentLang === 'en' ? 'No data rows found in the file.' : 'В файле не найдено ни одной строки с данными.') + '</div>';
                return;
            }
            impParsedRows = mapped.validRows.concat(mapped.invalidRows);
            impRenderPreview(mapped.validRows, mapped.invalidRows);
            if (statusEl) statusEl.innerHTML = '';
        } catch (err) {
            console.warn('Import parse error:', err);
            if (statusEl) statusEl.innerHTML = '<div class="imp-note imp-note-err"><i class="fas fa-triangle-exclamation"></i> ' +
                (currentLang === 'en' ? 'Failed to read file: ' : 'Не удалось прочитать файл: ') + (err.message || err) + '</div>';
        }
        input.value = '';
    };
    reader.onerror = function() {
        if (statusEl) statusEl.innerHTML = '<div class="imp-note imp-note-err"><i class="fas fa-triangle-exclamation"></i> ' + (currentLang === 'en' ? 'File read error.' : 'Ошибка чтения файла.') + '</div>';
        input.value = '';
    };
    reader.readAsArrayBuffer(file);
}

function impParseHcpStrict(raw) {
    var s = String(raw).replace(/\u00a0/g, '').replace(/\s+/g, '').trim();
    if (s === '' || s === '—' || s === '-') return { err: 'empty' };
    var plus = false;
    if (s.charAt(0) === '+') { plus = true; s = s.substring(1); }
    if (!/^\-?\d+([.,]\d+)?$/.test(s)) return { err: 'bad' };
    s = s.replace(',', '.');
    var v = parseFloat(s);
    if (plus) v = -Math.abs(v);
    if (v < -6 || v > 60) return { err: 'range' };
    return { val: v };
}

function impMapRows(jsonRows) {
    var keys = {};
    var validRows = [];
    var invalidRows = [];

    if (jsonRows.length) {
        Object.keys(jsonRows[0]).forEach(function(h) {
            var k = impHeaderKey(h);
            if (k && !keys[k]) keys[k] = h;
        });
    }

    jsonRows.forEach(function(r, i) {
        var firstName = '', lastName = '', fio = '';
        if (keys.firstName) firstName = String(r[keys.firstName] || '').trim();
        if (keys.lastName) lastName = String(r[keys.lastName] || '').trim();
        if (keys.fio) fio = String(r[keys.fio] || '').trim();

        if (!firstName && !lastName && !fio) {
            invalidRows.push({ idx: i, error: currentLang === 'en' ? 'no name' : 'нет имени', firstName: '', lastName: '', name: '', hcp: null, gender: 'men', dup: null });
            return;
        }

        if ((!firstName || !lastName) && fio) {
            var fioParts = fio.split(/\s+/);
            if (!lastName) lastName = fioParts[0] || '';
            if (!firstName) firstName = fioParts.slice(1).join(' ') || '';
        }
        if (!firstName && lastName) { var swap = impSplitName(lastName); firstName = swap.firstName; lastName = swap.lastName; }
        if (!lastName && firstName) { var swap2 = impSplitName(firstName); firstName = swap2.firstName; lastName = swap2.lastName; }

        var hcpRaw = keys.hcp ? String(r[keys.hcp] === 0 || r[keys.hcp] === '0' ? '0' : (r[keys.hcp] || '')).trim() : '';
        var hcp = null;
        var err = null;
        if (!keys.hcp || hcpRaw === '' || hcpRaw === '—') {
            err = currentLang === 'en' ? 'no handicap' : 'нет гандикапа';
        } else {
            var parsedHcp = impParseHcpStrict(hcpRaw);
            if (parsedHcp.err === 'empty') {
                err = currentLang === 'en' ? 'no handicap' : 'нет гандикапа';
            } else if (parsedHcp.err === 'bad') {
                err = currentLang === 'en' ? 'bad handicap: ' + hcpRaw : 'некорректный HCP: ' + hcpRaw;
            } else if (parsedHcp.err === 'range') {
                err = currentLang === 'en' ? 'HCP out of range: ' + hcpRaw : 'HCP вне диапазона: ' + hcpRaw;
            } else {
                hcp = parsedHcp.val;
            }
        }

        var gender = keys.gender ? impGenderFromCell(r[keys.gender]) : 'men';
        var name = (firstName + ' ' + lastName).replace(/\s+/g, ' ').trim();

        validRows.push({
            idx: i,
            firstName: firstName,
            lastName: lastName,
            name: name,
            hcp: hcp,
            hcpRaw: hcpRaw,
            gender: gender,
            dup: null,
            error: err
        });
    });

    validRows = validRows.filter(function(r) {
        if (r.error) { r.checked = false; invalidRows.push(r); return false; }
        return true;
    });

    return { validRows: validRows, invalidRows: invalidRows };
}

function impRenderPreview(validRows, invalidRows) {
    var previewEl = document.getElementById('imp-preview');
    if (!previewEl) return;

    impCollectPlayers(function(existingPlayers) {
        var byName = {};
        existingPlayers.forEach(function(p) {
            var nm = impNormName(p.data.name || ((p.data.firstName || '') + ' ' + (p.data.lastName || '')));
            if (nm) byName[nm] = p;
        });

        validRows.forEach(function(r) {
            var key = impNormName(r.firstName + ' ' + r.lastName);
            r.dup = byName[key] || null;
            r.checked = true;
        });

        var newCount = validRows.filter(function(r) { return !r.dup; }).length;
        var dupCount = validRows.length - newCount;

        var html = '<div class="imp-note">' +
            '<i class="fas fa-table-list"></i> ' +
            (currentLang === 'en' ? 'Rows in file: <b>' : 'Строк в файле: <b>') + (validRows.length + invalidRows.length) + '</b>' +
            (currentLang === 'en' ? ' · New: <b>' : ' · Новых: <b>') + newCount + '</b>' +
            (currentLang === 'en' ? ' · Existing (HCP update): <b>' : ' · Уже есть (обновление HCP): <b>') + dupCount + '</b>' +
            (invalidRows.length ? (currentLang === 'en' ? ' · With errors: <b>' : ' · С ошибками: <b>') + invalidRows.length + '</b>' : '') +
            '</div>';

        html += '<div class="imp-list">';
        html += '<label class="imp-row imp-row-head">' +
            '<input type="checkbox" id="imp-check-all" checked onchange="impToggleAll(this)">' +
            '<span style="font-weight:700;color:var(--gold);">' + (currentLang === 'en' ? 'Choose all' : 'Выбрать все') + '</span></label>';

        var renderRow = function(r, i, invalid) {
            var badge = '';
            if (invalid) {
                badge = '<span class="imp-badge imp-badge-err">⚠ ' + r.error + '</span>';
            } else if (r.dup) {
                var oldHcp = r.dup.data.handicap != null ? fmtExactHcp(r.dup.data.handicap) : '—';
                badge = '<span class="imp-badge imp-badge-dup">' + (currentLang === 'en' ? 'Update' : 'Обновит') + ' HCP ' + oldHcp + ' → ' + fmtExactHcp(r.hcp) + '</span>';
            } else {
                badge = '<span class="imp-badge imp-badge-new">' + (currentLang === 'en' ? 'New player' : 'Новый игрок') + '</span>';
            }
            var genderIcon = r.gender === 'women' ? '👩' : '👨';
            return '<label class="imp-row">' +
                '<input type="checkbox" ' + (invalid ? 'disabled' : (r.checked ? 'checked' : '')) + ' data-imp-idx="' + r.idx + '" onchange="impRowToggle(this)">' +
                '<span class="imp-info"><span class="imp-name">' + genderIcon + ' ' + (r.firstName + ' ' + r.lastName) + '</span>' +
                '<span class="imp-sub">HCP: ' + (r.hcp != null ? fmtExactHcp(r.hcp) : '—') + '</span></span>' +
                badge + '</label>';
        };

        validRows.forEach(function(r, i) { html += renderRow(r, i, false); });
        invalidRows.forEach(function(r, i) { html += renderRow(r, i, true); });
        html += '</div>';

        html += '<div class="rg-actions" style="margin-top:14px;">' +
            '<button type="button" class="btn btn-g imp-big-btn" onclick="confirmPlayersImport()"><i class="fas fa-file-import"></i> <span>' +
            (currentLang === 'en' ? 'Import selected' : 'Импортировать выбранное') + ' (<span id="imp-count-label">' + validRows.length + '</span>)</span></button>' +
            '<button type="button" class="btn btn-og imp-big-btn" onclick="impCancelPreview()"><i class="fas fa-xmark"></i> <span>' + (currentLang === 'en' ? 'Cancel' : 'Отмена') + '</span></button>' +
            '</div>';

        previewEl.innerHTML = html;
        impUpdateCountLabel();
    });
}

function impRowToggle(cb) {
    var idx = parseInt(cb.getAttribute('data-imp-idx'));
    impParsedRows.forEach(function(r) { if (r.idx === idx) r.checked = cb.checked; });
    impUpdateCountLabel();
}

function impToggleAll(master) {
    document.querySelectorAll('#imp-preview input[data-imp-idx]').forEach(function(cb) {
        if (!cb.disabled) {
            cb.checked = master.checked;
            var idx = parseInt(cb.getAttribute('data-imp-idx'));
            impParsedRows.forEach(function(r) { if (r.idx === idx) r.checked = cb.checked; });
        }
    });
    impUpdateCountLabel();
}

function impUpdateCountLabel() {
    var label = document.getElementById('imp-count-label');
    if (label) label.textContent = String(impParsedRows.filter(function(r) { return r.checked; }).length);
}

function impCancelPreview() {
    var previewEl = document.getElementById('imp-preview');
    if (previewEl) previewEl.innerHTML = '';
    var statusEl = document.getElementById('imp-status');
    if (statusEl) statusEl.innerHTML = '';
    impParsedRows = [];
}

function impSaveLocalPlayer(newId, playerData) {
    if (typeof cachedRegisteredUsers !== 'undefined') {
        cachedRegisteredUsers[newId] = playerData;
        try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch(e) {}
    }
    try {
        var custom = {};
        var existing = localStorage.getItem('pestovo_custom_players');
        if (existing) custom = JSON.parse(existing) || {};
        custom[newId] = playerData;
        localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
    } catch(e) {}
}

function confirmPlayersImport() {
    var selected = impParsedRows.filter(function(r) { return r.checked && !r.error; });
    if (!selected.length) {
        toast(currentLang === 'en' ? '⚠ Select at least one row' : '⚠ Выберите хотя бы одну строку', 'error');
        return;
    }

    var created = 0, updated = 0, failed = 0;
    var completed = 0;
    var total = selected.length;
    var finished = false;
    var finish = function() {
        completed++;
        if (completed < total || finished) return;
        finished = true;
        var msg = (currentLang === 'en' ? '✅ Import complete: ' : '✅ Импорт завершён: ') +
                  (currentLang === 'en' ? created + ' created, ' : created + ' создано, ') +
                  (currentLang === 'en' ? updated + ' updated' : updated + ' обновлено') +
                  (failed ? (currentLang === 'en' ? ', ' + failed + ' failed' : ', ' + failed + ' ошибок') : '');
        toast(msg, failed ? 'error' : 'success');
        if (typeof vib === 'function') vib([50, 30, 50]);
        impCancelPreview();
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    };

    selected.forEach(function(r) {
        if (r.dup) {
            if (typeof db !== 'undefined') {
                db.ref('users/' + r.dup.id).update({
                    handicap: r.hcp,
                    gender: r.gender,
                    hcpUpdatedAt: Date.now(),
                    hcpSource: 'excel'
                }).then(function() { updated++; finish(); }).catch(function() { failed++; finish(); });
            } else {
                updated++;
                finish();
            }
        } else {
            var newId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
            var playerData = {
                name: r.name,
                firstName: r.firstName,
                lastName: r.lastName,
                email: '',
                handicap: r.hcp,
                gender: r.gender,
                defaultTee: r.gender === 'women' ? 'rd' : 'wh',
                role: 'player',
                createdAt: Date.now(),
                roundsPlayed: 0,
                bestGross: null,
                bestStableford: null,
                hcpSource: 'excel'
            };
            impSaveLocalPlayer(newId, playerData);
            created++;
            if (typeof db !== 'undefined') {
                db.ref('users/' + newId).set(playerData).then(finish).catch(finish);
            } else {
                finish();
            }
        }
    });
}

// ==========================================
// ИНТЕГРАЦИЯ С hcp.rusgolf.ru (БАЗА АГА РОССИИ)
// ==========================================
var RG_SEARCH_BASE = 'https://hcp.rusgolf.ru/public/player/ru/?search=';
var rgLastResults = [];
var rgSyncState = { running: false, stop: false, stats: null };

function rgIsAdmin() {
    try { return sessionStorage.getItem('pestovo_is_admin') === 'true' || localStorage.getItem('pestovo_adm_logged_in') === 'true'; } catch(e) { return false; }
}

function rgGetCustomProxy() {
    try { return (localStorage.getItem('pestovo_rg_proxy') || '').trim(); } catch(e) { return ''; }
}

function rgBuildProxyList() {
    var proxies = [];
    var custom = rgGetCustomProxy();
    if (custom && custom.indexOf('{url}') !== -1) {
        proxies.push({
            name: 'custom',
            build: function(target) { return custom.replace('{url}', encodeURIComponent(target)); }
        });
    }
    proxies.push({ name: 'r.jina.ai', build: function(target) { return 'https://r.jina.ai/' + target; } });
    proxies.push({
        name: 'allorigins',
        build: function(target) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(target); }
    });
    proxies.push({
        name: 'codetabs',
        build: function(target) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(target); }
    });
    return proxies;
}

function rgParseHcpValue(s) {
    var cleaned = String(s || '').replace(/\u00a0/g, '').replace(/\s+/g, '');
    if (cleaned === '' || cleaned === '—' || cleaned === '-') return null;
    cleaned = cleaned.replace(',', '.');
    var num;
    if (cleaned.charAt(0) === '+') {
        num = -Math.abs(parseFloat(cleaned.substring(1)));
    } else {
        num = parseFloat(cleaned);
    }
    return isNaN(num) ? null : num;
}

function rgMakeResult(num, fio, gender, hi, hcpDate) {
    var fioParts = String(fio || '').replace(/\s+/g, ' ').trim().split(' ');
    return {
        number: String(num || '').replace(/\s+/g, '').toUpperCase(),
        fio: String(fio || '').replace(/\s+/g, ' ').trim(),
        lastName: fioParts[0] || '',
        firstName: fioParts[1] || '',
        gender: /^ж/i.test(String(gender || '').trim()) ? 'women' : 'men',
        genderRaw: String(gender || '').trim(),
        hcp: rgParseHcpValue(hi),
        hcpDisplay: String(hi || '').trim() || '—',
        hcpDate: String(hcpDate || '').trim()
    };
}

function rgParseHtmlTable(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var tables = doc.querySelectorAll('table');
    var rows = [];
    var foundHeader = false;
    tables.forEach(function(table) {
        var trs = table.querySelectorAll('tr');
        if (!trs.length) return;
        var headerText = (trs[0].textContent || '').toLowerCase();
        if (headerText.indexOf('фамилия') === -1 && headerText.indexOf('фио') === -1) return;
        foundHeader = true;
        trs.forEach(function(tr, i) {
            if (i === 0) return;
            var tds = tr.querySelectorAll('td');
            if (tds.length < 4) return;
            var num = (tds[0].textContent || '').trim();
            if (!/^[A-Za-z]{2}\s?\d{3,}$/.test(num)) return;
            rows.push(rgMakeResult(num, tds[1].textContent, tds[2].textContent, tds[3].textContent, tds[4] ? tds[4].textContent : ''));
        });
    });
    return { valid: foundHeader, rows: rows };
}

function rgParseMarkdownTable(text) {
    var lines = String(text || '').split(/\r?\n/);
    var hasHeader = false;
    lines.forEach(function(l) {
        if (/^\|\s*№/.test(l) || (l.indexOf('Фамилия, Имя, Отчество') !== -1 && l.charAt(0) === '|')) hasHeader = true;
    });
    if (!hasHeader) return { valid: false, rows: [] };
    var rows = [];
    lines.forEach(function(l) {
        if (l.charAt(0) !== '|') return;
        var cells = l.split('|').map(function(c) { return c.trim(); });
        // cells: ['', num, fio, gender, hi, date, '']
        if (cells.length >= 5 && /^[A-Za-z]{2}\s?\d{3,}$/.test(cells[1]) && /муж|жен/i.test(cells[3])) {
            rows.push(rgMakeResult(cells[1], cells[2], cells[3], cells[4], cells[5] || ''));
        }
    });
    return { valid: true, rows: rows };
}

function rgParseResults(text) {
    if (!text) return { valid: false, rows: [] };
    if (text.indexOf('<table') !== -1 || text.indexOf('<html') !== -1) {
        var htmlRes = rgParseHtmlTable(text);
        if (htmlRes.valid) return { valid: true, rows: htmlRes.rows };
    }
    var mdRes = rgParseMarkdownTable(text);
    if (mdRes.valid) return { valid: true, rows: mdRes.rows };
    return { valid: false, rows: [] };
}

function rgFetchViaProxy(query, attempt) {
    attempt = attempt || 0;
    var target = RG_SEARCH_BASE + encodeURIComponent(query);
    var proxies = rgBuildProxyList();
    return new Promise(function(resolve, reject) {
        var i = 0;
        var tryNext = function() {
            if (i >= proxies.length) {
                reject(new Error(currentLang === 'en'
                    ? 'All CORS proxies are unavailable. Configure your own proxy in settings below.'
                    : 'Все прокси недоступны. Настройте свой прокси в блоке настроек ниже.'));
                return;
            }
            var p = proxies[i++];
            var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            var timer = setTimeout(function() { if (ctrl) ctrl.abort(); }, 25000);
            fetch(p.build(target), { signal: ctrl ? ctrl.signal : undefined })
                .then(function(resp) {
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    return resp.text();
                })
                .then(function(text) {
                    clearTimeout(timer);
                    var parsed = rgParseResults(text);
                    if (parsed.valid) {
                        resolve({ rows: parsed.rows, proxy: p.name });
                    } else {
                        throw new Error('unparseable response');
                    }
                })
                .catch(function(err) {
                    clearTimeout(timer);
                    if (err && (err.message === 'HTTP 429') && attempt < 2) {
                        setTimeout(function() {
                            rgFetchViaProxy(query, attempt + 1).then(resolve).catch(reject);
                        }, 8000);
                        return;
                    }
                    tryNext();
                });
        };
        tryNext();
    });
}

function rgMatchInList(players, result) {
    var found = null;
    (players || []).some(function(p) {
        var u = p.data || {};
        var nm = impNormName(u.name || ((u.firstName || '') + ' ' + (u.lastName || '')));
        if (!nm) return false;
        var nLastName = impNormName(u.lastName || impSplitName(u.name || '').lastName);
        var nFirstName = impNormName(u.firstName || impSplitName(u.name || '').firstName);
        var fullRemote = impNormName(result.fio);
        if (nm === fullRemote ||
            (nLastName && nLastName === impNormName(result.lastName) &&
             (!nFirstName || !result.firstName || nFirstName === impNormName(result.firstName)))) {
            found = p;
            return true;
        }
        return false;
    });
    return found;
}

function rgFindLocalMatch(result) {
    var localUsers = typeof getKnownPlayersSync === 'function' ? (getKnownPlayersSync() || {}) : {};
    var players = Object.keys(localUsers).map(function(id) { return { id: id, data: localUsers[id] || {} }; });
    return rgMatchInList(players, result);
}

function rgShowStatus(html, cls) {
    var el = document.getElementById('rg-status');
    if (el) {
        el.innerHTML = html ? '<div class="imp-note ' + (cls || '') + '">' + html + '</div>' : '';
    }
}

function rgDoSearch(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    var input = document.getElementById('rg-search-input');
    var resultsEl = document.getElementById('rg-results');
    var btn = document.getElementById('rg-search-btn');
    var q = input ? input.value.trim() : '';
    if (!q) {
        toast(currentLang === 'en' ? '⚠ Enter surname or card number' : '⚠ Введите фамилию или номер карты', 'error');
        return;
    }
    if (resultsEl) resultsEl.innerHTML = '';
    rgShowStatus('<i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Searching RGA database (hcp.rusgolf.ru)...' : 'Идёт поиск в базе АГА (hcp.rusgolf.ru)...'));
    if (btn) btn.disabled = true;

    rgFetchViaProxy(q).then(function(res) {
        if (btn) btn.disabled = false;
        rgLastResults = res.rows;
        if (!res.rows.length) {
            rgShowStatus('<i class="fas fa-circle-question"></i> ' +
                (currentLang === 'en' ? 'Nothing found for «' : 'По запросу «') + q + (currentLang === 'en' ? '». Try surname only.' : '» ничего не найдено. Попробуйте только фамилию.'), 'imp-note-warn');
            return;
        }
        rgShowStatus('<i class="fas fa-check"></i> ' +
            (currentLang === 'en' ? 'Found: ' : 'Найдено: ') + '<b>' + res.rows.length + '</b>' +
            (currentLang === 'en' ? ' · via ' : ' · через ') + res.proxy, '');
        rgRenderResults(res.rows);
    }).catch(function(err) {
        if (btn) btn.disabled = false;
        rgShowStatus('<i class="fas fa-triangle-exclamation"></i> ' + err.message, 'imp-note-err');
    });
}

function rgRenderResults(rows) {
    var el = document.getElementById('rg-results');
    if (!el) return;

    impCollectPlayers(function(players) {
        var html = '<div class="rg-list">';
        rows.forEach(function(r, i) {
            var dup = rgMatchInList(players, r);
            var genderIcon = r.gender === 'women' ? '👩' : '👨';
            var hcpVal = r.hcp != null ? fmtExactHcp(r.hcp) : r.hcpDisplay;
            var hcpChanged = dup && r.hcp != null && dup.data.handicap != null && Math.abs((parseFloat(dup.data.handicap) || 0) - r.hcp) > 0.049;

            html += '<div class="rg-card">';
            html += '<div class="rg-main">';
            html += '<div class="rg-name">' + genderIcon + ' ' + r.fio + '</div>';
            html += '<div class="rg-meta">💳 ' + r.number + ' · ' + (r.gender === 'women' ? (currentLang === 'en' ? 'Female' : 'Жен.') : (currentLang === 'en' ? 'Male' : 'Муж.')) +
                (r.hcpDate ? ' · ' + (currentLang === 'en' ? 'updated ' : 'обновлён ') + r.hcpDate : '') + '</div>';
            if (dup) html += '<div class="rg-meta" style="color:var(--gold);">' + (currentLang === 'en' ? 'Already on site' : 'Уже есть на сайте') + ': ' + (dup.data.name || dup.id) + '</div>';
            html += '</div>';
            html += '<div class="rg-hcp' + (hcpChanged ? ' rg-hcp-changed' : '') + '">' + hcpVal + '<span class="rg-hcp-label">HI</span></div>';
            html += '<div class="rg-actions">';
            if (r.hcp == null) {
                html += '<span class="imp-badge imp-badge-err">⚠ ' + (currentLang === 'en' ? 'No HI in RGA base' : 'Нет HI в базе АГА') + '</span>';
            } else if (dup) {
                html += '<button type="button" class="btn btn-og btn-sm" onclick="rgUpdateFromResults(' + i + ')"><i class="fas fa-rotate"></i> ' +
                    (hcpChanged
                        ? (currentLang === 'en' ? 'Update HCP ' + fmtExactHcp(dup.data.handicap) + ' → ' + fmtExactHcp(r.hcp)
                            : 'Обновить HCP ' + fmtExactHcp(dup.data.handicap) + ' → ' + fmtExactHcp(r.hcp))
                        : (currentLang === 'en' ? 'HCP is up to date' : 'HCP актуален')) + '</button>';
            } else {
                html += '<button type="button" class="btn btn-g btn-sm" onclick="rgAddFromResults(' + i + ')"><i class="fas fa-plus"></i> ' +
                    (currentLang === 'en' ? 'Add to site' : 'Добавить на сайт') + '</button>';
            }
            html += '</div></div>';
        });
        html += '</div>';
        el.innerHTML = html;
    });
}

function rgAddFromResults(idx) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgLastResults[idx];
    if (!r) return;
    if (r.hcp == null) {
        toast(currentLang === 'en' ? '⚠ This player has no HI in the RGA base' : '⚠ У этого игрока нет HI в базе АГА', 'error');
        return;
    }
    var existing = rgFindLocalMatch(r);
    if (existing) {
        rgUpdateHcpOf(existing.id, r);
        return;
    }

    var newId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    var playerData = {
        name: r.fio,
        firstName: r.firstName,
        lastName: r.lastName,
        email: '',
        handicap: r.hcp,
        gender: r.gender,
        defaultTee: r.gender === 'women' ? 'rd' : 'wh',
        role: 'player',
        createdAt: Date.now(),
        roundsPlayed: 0,
        bestGross: null,
        bestStableford: null,
        rusgolfNumber: r.number,
        rusgolfHcpDate: r.hcpDate,
        hcpUpdatedAt: Date.now(),
        hcpSource: 'rusgolf'
    };

    impSaveLocalPlayer(newId, playerData);
    toast('🎉 ' + (currentLang === 'en' ? 'Player ' : 'Игрок ') + r.fio + (currentLang === 'en' ? ' added (HCP ' : ' добавлен (HCP ') + fmtExactHcp(r.hcp) + ')', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    if (typeof db !== 'undefined') {
        db.ref('users/' + newId).set(playerData).catch(function(err) {
            console.warn('RUSGOLF player save notice:', err);
        });
    }
    rgRenderResults(rgLastResults);
}

function rgUpdateHcpOf(userId, r) {
    var updates = {
        handicap: r.hcp,
        rusgolfNumber: r.number,
        rusgolfHcpDate: r.hcpDate,
        hcpUpdatedAt: Date.now(),
        hcpSource: 'rusgolf'
    };
    if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[userId]) {
        Object.assign(cachedRegisteredUsers[userId], updates);
        try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch(e) {}
    }
    toast('🔄 ' + (currentLang === 'en' ? 'HCP updated: ' : 'Гандикап обновлён: ') + r.fio + ' → ' + fmtExactHcp(r.hcp), 'success');
    if (typeof db !== 'undefined') {
        db.ref('users/' + userId).update(updates).catch(function(err) {
            toast('⚠️ ' + (currentLang === 'en' ? 'Save error: ' : 'Ошибка сохранения: ') + err.message, 'error');
        });
    }
    rgRenderResults(rgLastResults);
}

function rgUpdateFromResults(idx) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgLastResults[idx];
    if (!r || r.hcp == null) return;
    var existing = rgFindLocalMatch(r);
    if (existing) rgUpdateHcpOf(existing.id, r);
}

// -------- МАССОВАЯ СИНХРОНИЗАЦИЯ ---------

function rgSyncProgressHtml(cur, total, stats) {
    var pct = total ? Math.round((cur / total) * 100) : 0;
    var html = '<div class="rg-progress-wrap">';
    html += '<div class="rg-progress"><div class="rg-progress-fill" style="width:' + pct + '%;"></div></div>';
    html += '<div class="rg-progress-text">' + (currentLang === 'en' ? 'Processed ' : 'Обработано ') + cur + '/' + total +
        ' · <span style="color:#2ecc71;">' + (currentLang === 'en' ? 'updated ' : 'обновлено ') + stats.updated + '</span>' +
        ' · <span style="color:var(--muted);">' + (currentLang === 'en' ? 'actual ' : 'актуально ') + stats.actual + '</span>' +
        ' · <span style="color:var(--gold);">' + (currentLang === 'en' ? 'need choice ' : 'выбор ') + stats.conflicts.length + '</span>' +
        ' · <span style="color:var(--red);">' + (currentLang === 'en' ? 'not found ' : 'не найдено ') + stats.notFound + '</span></div>';
    html += '</div>';
    return html;
}

function rgSyncStop() {
    rgSyncState.stop = true;
    var btn = document.getElementById('rg-sync-stop');
    if (btn) btn.classList.add('hidden');
    rgShowSyncProgressNote(currentLang === 'en' ? '⏹ Stopping after current player...' : '⏹ Останавливаю после текущего игрока...');
}

function rgShowSyncProgressNote(text) {
    var el = document.getElementById('rg-sync-progress');
    if (el) el.insertAdjacentHTML('beforeend', '<p style="color:var(--muted);font-size:12px;margin-top:6px;">' + text + '</p>');
}

function rgSyncAll() {
    if (rgSyncState.running) return;
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    if (!confirm(currentLang === 'en'
        ? 'Check every player handicap in the RGA database? With many players this may take several minutes.'
        : 'Проверить гандикап каждого игрока в базе АГА? При большом списке это может занять несколько минут.')) return;

    impCollectPlayers(function(players) {
        var list = players.filter(function(p) { return p.data && (p.data.name || p.data.firstName || p.data.lastName); });
        if (!list.length) {
            toast(currentLang === 'en' ? 'No players found' : 'Игроки не найдены', 'error');
            return;
        }

        rgSyncState = { running: true, stop: false, stats: { updated: 0, actual: 0, notFound: 0, conflicts: [], noHcp: 0 } };
        var stats = rgSyncState.stats;
        rgSyncConflictsRef = stats.conflicts;
        var progressEl = document.getElementById('rg-sync-progress');
        var manualEl = document.getElementById('rg-sync-manual');
        var syncBtn = document.getElementById('rg-sync-btn');
        var stopBtn = document.getElementById('rg-sync-stop');
        if (progressEl) progressEl.innerHTML = rgSyncProgressHtml(0, list.length, rgSyncState.stats);
        if (manualEl) manualEl.innerHTML = '';
        if (syncBtn) syncBtn.disabled = true;
        if (stopBtn) stopBtn.classList.remove('hidden');

        var i = 0;
        var processed = 0;

        var renderConflicts = function() {
            if (!manualEl || !stats.conflicts.length) return;
            var html = '<h3 style="color:var(--gold);font-size:15px;margin:18px 0 10px;"><i class="fas fa-user-pen"></i> ' +
                (currentLang === 'en' ? 'Choose the right player (' : 'Выберите нужного игрока (') + stats.conflicts.length + ')</h3>';
            html += '<p style="color:var(--muted);font-size:12px;margin-bottom:12px;">' +
                (currentLang === 'en' ? 'Same name found with different handicaps — pick the correct one.' : 'Найдено несколько одинаковых имён с разными гандикапами — выберите правильного.') + '</p>';
            stats.conflicts.forEach(function(c, ci) {
                html += '<div class="rg-conflict" data-conflict-idx="' + ci + '">';
                html += '<div class="rg-conflict-title">' + (c.player.data.name || c.player.id) +
                    ' <span class="rg-conflict-hcp">' + (c.player.data.handicap != null ? (currentLang === 'en' ? 'current HCP ' : 'текущий HCP ') + fmtExactHcp(c.player.data.handicap) : (currentLang === 'en' ? 'no HCP' : 'без HCP')) + '</span></div>';
                c.candidates.forEach(function(r, ri) {
                    html += '<div class="rg-cand">';
                    html += '<div class="rg-cand-info"><b>' + r.fio + '</b><span class="rg-meta">💳 ' + r.number + ' · ' + (r.gender === 'women' ? 'Жен.' : 'Муж.') + (r.hcpDate ? ' · ' + r.hcpDate : '') + '</span></div>';
                    html += '<div class="rg-hcp">' + (r.hcp != null ? fmtExactHcp(r.hcp) : '—') + '<span class="rg-hcp-label">HI</span></div>';
                    html += '<button type="button" class="btn btn-g btn-sm" ' + (r.hcp == null ? 'disabled' : '') + ' onclick="rgResolveConflict(' + ci + ',' + ri + ')"><i class="fas fa-check"></i> ' + (currentLang === 'en' ? 'This one' : 'Это он') + '</button>';
                    html += '</div>';
                });
                html += '</div>';
            });
            manualEl.innerHTML = html;
        };

        var finishAll = function() {
            rgSyncState.running = false;
            if (syncBtn) syncBtn.disabled = false;
            if (stopBtn) stopBtn.classList.add('hidden');
            renderConflicts();
            var msg = (currentLang === 'en' ? '✅ Sync finished: ' : '✅ Синхронизация завершена: ') +
                (currentLang === 'en' ? stats.updated + ' updated, ' : stats.updated + ' обновлено, ') +
                (currentLang === 'en' ? stats.actual + ' up to date, ' : stats.actual + ' актуально, ') +
                (currentLang === 'en' ? stats.conflicts.length + ' to choose, ' : stats.conflicts.length + ' на выбор, ') +
                (currentLang === 'en' ? stats.notFound + ' not found' : stats.notFound + ' не найдено');
            toast(msg, 'success');
            if (progressEl) progressEl.insertAdjacentHTML('beforeend', '<p style="font-size:13px;font-weight:700;color:var(--gold);margin-top:8px;">' + msg + '</p>');
        };

        var processNext = function() {
            if (rgSyncState.stop || i >= list.length) { finishAll(); return; }
            var p = list[i++];
            var u = p.data;
            var q = impNormName(u.lastName || impSplitName(u.name || '').lastName);
            var fn = impNormName(u.firstName || impSplitName(u.name || '').firstName);
            var query = (q && fn) ? (u.lastName || impSplitName(u.name).lastName) + ' ' + (u.firstName || impSplitName(u.name).firstName) : (u.name || '');

            rgFetchViaProxy(query).then(function(res) {
                var strong = [], loose = [];
                res.rows.forEach(function(r) {
                    var lastMatch = impNormName(r.lastName) === q;
                    var firstMatch = !fn || !impNormName(r.firstName) || impNormName(r.firstName) === fn;
                    if (lastMatch && firstMatch) strong.push(r);
                    else if (lastMatch) loose.push(r);
                });

                if (strong.length === 1 && strong[0].hcp != null) {
                    var curHcp = (u.handicap != null && !isNaN(parseFloat(u.handicap))) ? parseFloat(u.handicap) : null;
                    if (curHcp === null || Math.abs(curHcp - strong[0].hcp) > 0.049) {
                        rgUpdateHcpOf(p.id, strong[0]);
                        stats.updated++;
                    } else {
                        stats.actual++;
                    }
                } else if (strong.length === 1 && strong[0].hcp == null) {
                    stats.noHcp++;
                } else if (strong.length > 1) {
                    stats.conflicts.push({ player: p, candidates: strong });
                    renderConflicts();
                } else if (loose.length) {
                    stats.conflicts.push({ player: p, candidates: loose });
                    renderConflicts();
                } else {
                    stats.notFound++;
                }
            }).catch(function() {
                stats.notFound++;
            }).then(function() {
                processed++;
                if (progressEl) {
                    var fill = progressEl.querySelector('.rg-progress-fill');
                    if (fill) fill.style.width = Math.round((processed / list.length) * 100) + '%';
                    var text = progressEl.querySelector('.rg-progress-text');
                    if (text) {
                        text.innerHTML = (currentLang === 'en' ? 'Processed ' : 'Обработано ') + processed + '/' + list.length +
                            ' · <span style="color:#2ecc71;">' + (currentLang === 'en' ? 'updated ' : 'обновлено ') + stats.updated + '</span>' +
                            ' · <span style="color:var(--muted);">' + (currentLang === 'en' ? 'actual ' : 'актуально ') + stats.actual + '</span>' +
                            ' · <span style="color:var(--gold);">' + (currentLang === 'en' ? 'need choice ' : 'выбор ') + stats.conflicts.length + '</span>' +
                            ' · <span style="color:var(--red);">' + (currentLang === 'en' ? 'not found ' : 'не найдено ') + stats.notFound + '</span>';
                    }
                }
                setTimeout(processNext, 400);
            });
        };

        processNext();
    });
}

var rgSyncConflictsRef = [];
function rgResolveConflict(ci, ri) {
    var c = rgSyncConflictsRef[ci];
    if (!c) return;
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = c.candidates[ri];
    if (!r || r.hcp == null) return;
    rgUpdateHcpOf(c.player.id, r);
    var manualEl = document.getElementById('rg-sync-manual');
    var card = manualEl ? manualEl.querySelector('[data-conflict-idx="' + ci + '"]') : null;
    if (card) {
        card.innerHTML = '<div style="color:#2ecc71;font-weight:700;font-size:13px;padding:8px 0;"><i class="fas fa-check-circle"></i> ' +
            (c.player.data.name || '') + ' → HCP ' + fmtExactHcp(r.hcp) + '</div>';
    }
    c.resolved = true;
}

// -------- НАСТРОЙКИ ПРОКСИ ---------

function loadRusgolfProxySettings() {
    var input = document.getElementById('rg-proxy-input');
    if (!input) return;
    var applyVal = function(v) {
        if (v && input) input.value = v;
        var note = document.getElementById('rg-proxy-status');
        if (note) note.textContent = '';
    };
    var saved = '';
    try { saved = localStorage.getItem('pestovo_rg_proxy') || ''; } catch(e) {}
    applyVal(saved);
    if (typeof db !== 'undefined') {
        db.ref('settings/rusgolf/proxy').once('value').then(function(sn) {
            var v = sn.val();
            if (v) {
                applyVal(String(v));
                try { localStorage.setItem('pestovo_rg_proxy', String(v)); } catch(e) {}
            }
        }).catch(function(){});
    }
}

function saveRusgolfProxySettings() {
    var input = document.getElementById('rg-proxy-input');
    var v = input ? input.value.trim() : '';
    if (v && v.indexOf('{url}') === -1) {
        toast(currentLang === 'en' ? '⚠ Proxy template must contain {url}' : '⚠ Шаблон прокси должен содержать {url}', 'error');
        return;
    }
    try { localStorage.setItem('pestovo_rg_proxy', v); } catch(e) {}
    if (typeof db !== 'undefined') {
        db.ref('settings/rusgolf').update({ proxy: v, updatedAt: Date.now() }).catch(function(){});
    }
    var note = document.getElementById('rg-proxy-status');
    if (note) note.textContent = v ? '✅' : '✓';
    toast(currentLang === 'en' ? '✅ Proxy settings saved' : '✅ Настройки прокси сохранены', 'success');
}
