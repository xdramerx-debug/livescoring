var PESTOVO_TEMP_MASTER_PASSWORD = '55555';
var PESTOVO_TEMP_MASTER_PASSWORD_HASH = 'c507a68f3093e885765257ed3f176c757aaf62bb4cbc2ef94b2e7da3406d9676';
var PESTOVO_ADMIN_MASTER_HASH_KEY = 'pestovo_admin_master_hash';
var PESTOVO_ADMIN_ACCESS_REMEMBER_KEY = 'pestovo_admin_access_persist';

function safeStorageGet(storageObj, key) {
    try { return storageObj.getItem(key); } catch (e) { return null; }
}

function safeStorageSet(storageObj, key, value) {
    try { storageObj.setItem(key, value); } catch (e) {}
}

function safeStorageRemove(storageObj, key) {
    try { storageObj.removeItem(key); } catch (e) {}
}

function normalizeMasterHash(val) {
    var hash = String(val || '').trim().toLowerCase();
    return /^[a-f0-9]{64}$/.test(hash) ? hash : '';
}

function uniqueStringList(values) {
    var map = {};
    return (values || []).filter(function(value) {
        value = String(value || '');
        if (!value || map[value]) return false;
        map[value] = true;
        return true;
    });
}

function sha256Hex(text) {
    if (text === PESTOVO_TEMP_MASTER_PASSWORD) {
        return Promise.resolve(PESTOVO_TEMP_MASTER_PASSWORD_HASH);
    }
    if (!(window.crypto && window.crypto.subtle && window.TextEncoder)) {
        return Promise.resolve('');
    }
    return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text || ''))).then(function(buffer) {
        return Array.from(new Uint8Array(buffer)).map(function(byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    }).catch(function() {
        return '';
    });
}

function isFirebaseAdmin() {
    return !!(currentUser && currentUserData && currentUserData.role === 'admin');
}

function hasAdminPanelAccess() {
    return isFirebaseAdmin() || safeStorageGet(sessionStorage, 'pestovo_is_admin') === 'true';
}

function setRememberedAdminAccess(enabled) {
    if (enabled) safeStorageSet(localStorage, PESTOVO_ADMIN_ACCESS_REMEMBER_KEY, 'true');
    else safeStorageRemove(localStorage, PESTOVO_ADMIN_ACCESS_REMEMBER_KEY);
}

function grantMasterAdminAccess(rememberAccess) {
    safeStorageSet(sessionStorage, 'pestovo_is_admin', 'true');
    safeStorageSet(sessionStorage, 'pestovo_admin_access_source', 'master');
    safeStorageSet(localStorage, 'pestovo_adm_logged_in', 'true');
    if (rememberAccess) {
        setRememberedAdminAccess(true);
        safeStorageSet(localStorage, 'pestovo_adm_remember', 'true');
    } else {
        setRememberedAdminAccess(false);
        safeStorageRemove(localStorage, 'pestovo_adm_remember');
    }
}

function clearAdminAccessFlags() {
    safeStorageRemove(sessionStorage, 'pestovo_is_admin');
    safeStorageRemove(sessionStorage, 'pestovo_admin_access_source');
    safeStorageRemove(localStorage, PESTOVO_ADMIN_ACCESS_REMEMBER_KEY);
    safeStorageRemove(localStorage, 'pestovo_adm_logged_in');
    safeStorageRemove(localStorage, 'pestovo_adm_remember');
}

function collectConfiguredMasterPasswords() {
    var plainPasswords = [];
    var hashPasswords = [PESTOVO_TEMP_MASTER_PASSWORD_HASH];

    var legacyPass = safeStorageGet(localStorage, 'pestovo_adm_pass');
    if (legacyPass) plainPasswords.push(String(legacyPass));

    var localHash = normalizeMasterHash(safeStorageGet(localStorage, PESTOVO_ADMIN_MASTER_HASH_KEY));
    if (localHash) hashPasswords.push(localHash);

    if (typeof db === 'undefined') {
        return Promise.resolve({
            plainPasswords: uniqueStringList(plainPasswords),
            hashPasswords: uniqueStringList(hashPasswords)
        });
    }

    var readers = [
        db.ref('settings/adminAccess/masterPasswordHash').once('value').then(function(sn) { return normalizeMasterHash(sn.val()); }).catch(function() { return ''; }),
        db.ref('settings/adminAccess/masterPassword').once('value').then(function(sn) { return String(sn.val() || '').trim(); }).catch(function() { return ''; }),
        db.ref('settings/admin/masterPasswordHash').once('value').then(function(sn) { return normalizeMasterHash(sn.val()); }).catch(function() { return ''; }),
        db.ref('settings/admin/masterPassword').once('value').then(function(sn) { return String(sn.val() || '').trim(); }).catch(function() { return ''; })
    ];

    return Promise.all(readers).then(function(values) {
        if (values[0]) hashPasswords.push(values[0]);
        if (values[1]) plainPasswords.push(values[1]);
        if (values[2]) hashPasswords.push(values[2]);
        if (values[3]) plainPasswords.push(values[3]);
        return {
            plainPasswords: uniqueStringList(plainPasswords),
            hashPasswords: uniqueStringList(hashPasswords)
        };
    }).catch(function() {
        return {
            plainPasswords: uniqueStringList(plainPasswords),
            hashPasswords: uniqueStringList(hashPasswords)
        };
    });
}

function verifyMasterPassword(password) {
    password = String(password || '');
    if (!password) return Promise.resolve(false);
    if (password === PESTOVO_TEMP_MASTER_PASSWORD) return Promise.resolve(true);

    return collectConfiguredMasterPasswords().then(function(config) {
        if ((config.plainPasswords || []).indexOf(password) !== -1) {
            return true;
        }
        return sha256Hex(password).then(function(hash) {
            if (!hash) return false;
            return (config.hashPasswords || []).indexOf(hash) !== -1;
        });
    });
}

function showAdminLoginError(message) {
    var er = document.getElementById('adm-error');
    if (!er) return;
    er.textContent = message;
    er.classList.remove('hidden');
}

function setAdminLoginLoading(isLoading) {
    var btn = document.getElementById('admin-login-btn');
    if (!btn) return;
    btn.disabled = !!isLoading;
    btn.innerHTML = isLoading
        ? '<i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Checking...' : 'Проверка...')
        : '<i class="fas fa-user-shield"></i> ' + (currentLang === 'en' ? 'Enter Admin Panel' : 'Проверить права / Войти');
}

document.addEventListener('DOMContentLoaded', function() {
    initNav();
    initAdminAutoLogin();
});

function initAdminAutoLogin() {
    var rememberAccess = safeStorageGet(localStorage, PESTOVO_ADMIN_ACCESS_REMEMBER_KEY) === 'true';
    var legacyRemember = safeStorageGet(localStorage, 'pestovo_adm_remember') === 'true';
    var legacyLogged = safeStorageGet(localStorage, 'pestovo_adm_logged_in') === 'true';

    if (rememberAccess || legacyLogged) {
        safeStorageSet(sessionStorage, 'pestovo_is_admin', 'true');
        safeStorageSet(sessionStorage, 'pestovo_admin_access_source', 'master');
    }
    if (legacyLogged && legacyRemember) {
        safeStorageSet(localStorage, PESTOVO_ADMIN_ACCESS_REMEMBER_KEY, 'true');
    }

    var rememberEl = document.getElementById('adm-remember');
    if (rememberEl) {
        rememberEl.checked = rememberAccess || legacyRemember;
    }

    var legacyPass = safeStorageGet(localStorage, 'pestovo_adm_pass');
    var storedHash = normalizeMasterHash(safeStorageGet(localStorage, PESTOVO_ADMIN_MASTER_HASH_KEY));
    if (legacyPass && !storedHash) {
        sha256Hex(legacyPass).then(function(hash) {
            if (hash) safeStorageSet(localStorage, PESTOVO_ADMIN_MASTER_HASH_KEY, hash);
        }).catch(function() {});
    }

    if (document.getElementById('admin-login') && hasAdminPanelAccess()) {
        openAdminPanel();
    }
}

// ==========================================
// АВТОРИЗАЦИЯ АДМИНКИ
// ==========================================
function onAuthReady(user, userData) {
    navAuth(user, userData);

    if (document.getElementById('admin-login') && hasAdminPanelAccess()) {
        openAdminPanel();
    }
}

function adminLogin(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    var er = document.getElementById('adm-error');
    if (er) er.classList.add('hidden');

    if (isFirebaseAdmin()) {
        openAdminPanel();
        toast(currentLang === 'en' ? '✅ Admin access confirmed' : '✅ Права администратора подтверждены');
        return;
    }

    var passInp = document.getElementById('adm-master-pass');
    var pass = passInp ? passInp.value : '';
    if (!pass) {
        showAdminLoginError(currentLang === 'en'
            ? 'Enter the master password or log in with an administrator account.'
            : 'Введите мастер-пароль или войдите под аккаунтом администратора.');
        if (passInp && passInp.focus) passInp.focus();
        return;
    }

    var rememberEl = document.getElementById('adm-remember');
    var rememberAccess = !!(rememberEl && rememberEl.checked);

    setAdminLoginLoading(true);
    verifyMasterPassword(pass).then(function(ok) {
        setAdminLoginLoading(false);
        if (!ok) {
            showAdminLoginError(currentLang === 'en' ? 'Incorrect master password.' : 'Неверный мастер-пароль.');
            if (passInp && passInp.select) passInp.select();
            return;
        }

        grantMasterAdminAccess(rememberAccess);
        if (passInp) passInp.value = '';
        openAdminPanel();
        toast(currentLang === 'en' ? '✅ Logged in with master password' : '✅ Вход по мастер-паролю выполнен');
    }).catch(function(err) {
        setAdminLoginLoading(false);
        showAdminLoginError((currentLang === 'en' ? 'Login error: ' : 'Ошибка входа: ') + (err && err.message ? err.message : err));
    });
}

function adminLogout() {
    clearAdminAccessFlags();

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
    if (!hasAdminPanelAccess()) return;
    safeStorageSet(sessionStorage, 'pestovo_is_admin', 'true');
    if (isFirebaseAdmin()) safeStorageRemove(sessionStorage, 'pestovo_admin_access_source');
    else safeStorageSet(sessionStorage, 'pestovo_admin_access_source', 'master');
    if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();

    var loginEl = document.getElementById('admin-login');
    var contentEl = document.getElementById('admin-content');
    var logoutBtn = document.getElementById('admin-logout-btn');

    if (loginEl) loginEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');

    loadAdmRounds();
    loadAdmGroups();
    loadAdmPlayers();
    loadTournaments();
    loadClubBroadcastsHistory();
    listenForAlerts();
    loadTelegramSettings();
    loadVKSettings();
    loadPageVisibilitySettings();
    loadStablefordDisplaySettings();
    loadPrivacySettings();
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

    if (t === 'groups') {
        renderAdmGroups();
    }
    if (t === 'data') {
        loadPageVisibilitySettings();
        loadStablefordDisplaySettings();
    }
    if (t === 'rusgolf') {
        loadRusgolfProxySettings();
    }
    if (t === 'players') {
        loadPrivacySettings();
    }
}

// ==========================================
// ГРУППЫ, КОТОРЫЕ СЕЙЧАС ИГРАЮТ / КОНТРОЛЬ ТЕМПА
// ==========================================
var adminGroupsSnapshot = null;
var adminGroupsTimer = null;

function loadAdmGroups() {
    if (typeof db === 'undefined') return;
    bindRealtimeValue('admin-groups', db.ref('rounds'), function(snapshot) {
        adminGroupsSnapshot = snapshot;
        renderAdmGroups();
    });
    if (!adminGroupsTimer) {
        adminGroupsTimer = setInterval(function() { renderAdmGroups(); }, 30000);
    }
}

function renderAdmGroups() {
    var el = document.getElementById('adm-groups');
    if (!el) return;
    var data = adminGroupsSnapshot && typeof adminGroupsSnapshot.val === 'function'
        ? (adminGroupsSnapshot.val() || {}) : {};
    var groups = Object.entries(data).filter(function(entry) {
        var roundData = entry[1];
        return roundData && roundData.status === 'active' && roundData.mode === 'group' &&
            getPaceParticipants(roundData).length > 1;
    });

    if (!groups.length) {
        el.innerHTML = '<div class="empty"><i class="fas fa-users-slash"></i><p>' + t('admin_no_groups') + '</p></div>';
        return;
    }

    groups.sort(function(a, b) {
        var delayA = getRoundPaceMetrics(a[1]).overallDelay || 0;
        var delayB = getRoundPaceMetrics(b[1]).overallDelay || 0;
        return delayB - delayA;
    });

    var html = '';
    groups.forEach(function(entry, index) {
        var roundData = entry[1];
        var metrics = getRoundPaceMetrics(roundData);
        var state = paceStatus(metrics.overallDelay);
        var participants = getPaceParticipants(roundData);
        var names = participants.map(function(item) {
            var pTee = (item.player && item.player.tee) || roundData.tee || 'wh';
            return escapeHtml(item.player.name || t('player')) + ' ' + fmtTeePill(pTee);
        }).join(' · ');
        var currentHole = metrics.currentHole || (metrics.order.length ? metrics.order[0] : roundData.startHole || 1);
        var noTimingNote = !metrics.hasTimingData
            ? '<div class="pace-note">' + t('pace_pending') + '</div>' : '';
        var groupLabel = currentLang === 'en' ? 'Group ' + (index + 1) : 'Группа ' + (index + 1);

        html += '<div class="admin-group-card pace-state-' + state.key + '" style="--pace-color:' + state.color + ';">';
        html += '<div class="admin-group-card-header">';
        html += '<div><h3><span class="live-dot" style="width:8px;height:8px;margin-right:5px;"></span>' + groupLabel + '</h3>';
        html += '<div class="admin-group-players"><i class="fas fa-users"></i> ' + names + '</div></div>';
        html += '<span class="admin-group-status">' + state.label + '</span>';
        html += '</div>';

        html += '<div class="admin-group-meta">';
        html += '<div><span>' + t('admin_start_time') + '</span><b>' + fmtTime(roundData.startTime) + '</b></div>';
        html += '<div><span>' + t('admin_start_hole') + '</span><b>№' + (roundData.startHole || 1) + '</b></div>';
        html += '<div><span>' + t('admin_current_hole') + '</span><b>№' + currentHole + '</b></div>';
        html += '<div><span>' + t('tee_select') + '</span><b>' + fmtRoundTeePills(roundData) + '</b></div>';
        html += '<div><span>' + t('admin_total_delay') + '</span><b class="admin-group-delay">' + formatPaceDelta(metrics.overallDelay) + '</b></div>';
        html += '</div>';

        html += '<div class="admin-group-timeline-title"><i class="fas fa-list-ol"></i> ' + t('admin_hole_timings') + '</div>';
        html += '<div class="pace-timeline">' + renderPaceHoleTimeline(metrics) + '</div>';
        html += noTimingNote;
        html += '</div>';
    });

    el.innerHTML = html;
}

// ==========================================
// РАУНДЫ
// ==========================================
// Виджет «Дата с / Дата по» для вкладки «Все раунды». Подключаем один раз —
// повторные вызовы просто возвращают уже созданный экземпляр.
function ensureAdmRoundsDateFilter() {
    if (typeof getDateRangeFilter === 'function') {
        var existing = getDateRangeFilter('admin-rounds');
        if (existing) return existing;
    }
    if (typeof initDateRangeFilter !== 'function') return null;
    return initDateRangeFilter({
        key: 'admin-rounds',
        fromId: 'adm-date-from',
        toId: 'adm-date-to',
        presetsId: 'adm-date-presets',
        resetId: 'adm-date-reset',
        hintId: 'adm-date-hint',
        summaryId: 'adm-rounds-summary',
        onChange: function() { loadAdmRounds(); }
    });
}

function loadAdmRounds() {
    ensureAdmRoundsDateFilter();
    // Одна подписка на раунды: повторные вызовы (фильтр по датам, смена языка,
    // удаление/создание раунда) только перерисовывают список по последнему снимку.
    bindRealtimeValue('admin-rounds', db.ref('rounds'), function(sn) {
        renderAdmRounds(sn.val() || {});
    });
}

function renderAdmRounds(data) {
    var el = document.getElementById('adm-rounds');
    if (!el) return;

    var dateFilter = ensureAdmRoundsDateFilter();
    var range = dateFilter ? dateFilter.getRange() : { active: false, from: null, to: null, invalid: false };

    var allEntries = Object.entries(data).filter(function(e) { return e && e[1] && typeof e[1] === 'object'; });
    var totalRounds = allEntries.length;
    var entries = filterEntriesByDateRange(allEntries, range);
    entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });

    if (dateFilter) dateFilter.renderSummary(entries.length, totalRounds);

    if (!entries.length) {
        var emptyText = range.active
            ? (currentLang === 'en' ? 'No rounds in the selected period' : 'Нет раундов за выбранный период')
            : (currentLang === 'en' ? 'No rounds' : 'Нет раундов');
        el.innerHTML = '<div class="empty"><i class="fas fa-flag"></i><p>' + emptyText + '</p></div>';
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
                // Дату показываем ту же, по которой работает фильтр периода (старт раунда).
                fmtDate(getRoundFilterTs(r)) + ' · ' + fmtTime(r.startTime) + ' · ' + pc + playersStr +
                (r.format || 'Stroke') + ' · ' + t('tee_select') + ': ' + fmtRoundTeePills(r) +
                (r.mode === 'solo' ? soloStr : '') + '</div></div>';
        html += '<div style="display:flex;gap:6px;">';
        if (r.status === 'completed') {
            html += '<button class="btn btn-og btn-sm" onclick="downloadScorecard(\'' + id + '\')"><i class="fas fa-download"></i></button>';
        }
        html += '<button class="btn btn-r btn-sm" onclick="deleteRound(\'' + id + '\')"><i class="fas fa-trash"></i></button>';
        html += '</div></div>';
    });

    el.innerHTML = html;
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

// Полностью удаляет ВСЕХ игроков И все раунды, чтобы после этого нигде
// (списки, автоподбор, история, статистика, лидерборды) не осталось следов.
function clearAllData() {
    var msg1 = currentLang === 'en'
        ? 'Delete ALL players AND ALL rounds? Everything will be permanently removed and cannot be recovered!'
        : 'Удалить ВСЕХ игроков И ВСЕ раунды? Все данные будут удалены безвозвратно и нигде не появятся снова!';
    var msg2 = currentLang === 'en'
        ? 'This is irreversible. Are you absolutely sure?'
        : 'Это действие необратимо. Вы абсолютно уверены?';

    if (!confirm(msg1) || !confirm(msg2)) return;

    if (typeof db === 'undefined') {
        // Оффлайн-режим: чистим только локальные кэши
        if (typeof wipeLocalPlayerCaches === 'function') wipeLocalPlayerCaches();
        try {
            localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify([]));
        } catch(e) {}
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        if (typeof loadAdmRounds === 'function') loadAdmRounds();
        toast(currentLang === 'en' ? 'All data deleted' : 'Все данные удалены', 'info');
        return;
    }

    // 1) Удаляем все ветки, где хранятся раунды, игроки и связанные данные
    var wipeUpdates = {
        'rounds': null,
        'markers': null,
        'markerAssignments': null,
        'alerts': null,
        'users': null,
        'broadcasts': null
    };

    // Регистрации игроков на турнирах тоже нужно снять, иначе удалённые
    // игроки «всплывут» в списках участников турниров.
    db.ref('tournaments').once('value').then(function(sn) {
        var tns = sn.val() || {};
        Object.keys(tns).forEach(function(tid) {
            if (tns[tid] && tns[tid].registeredPlayers) {
                wipeUpdates['tournaments/' + tid + '/registeredPlayers'] = null;
            }
        });
    }, function(){}).then(function() {
        return db.ref().update(wipeUpdates);
    }).then(function() {
        // 2) Чистим локальные кэши и «прячем» встроенных демо-игроков
        if (typeof wipeLocalPlayerCaches === 'function') wipeLocalPlayerCaches();
        // Сбрасываем список «удалённых», т.к. база уже полностью пуста
        try { localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify([])); } catch(e) {}
        if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();

        // 3) Обновляем открытые списки в админке
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        if (typeof loadAdmRounds === 'function') loadAdmRounds();

        toast(currentLang === 'en' ? 'All players and rounds deleted everywhere' : 'Все игроки и раунды полностью удалены', 'info');
        if (typeof vib === 'function') vib([60, 40, 60]);
    }).catch(function(err) {
        toast((currentLang === 'en' ? 'Error: ' : 'Ошибка: ') + (err && err.message ? err.message : err), 'error');
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
            html += '<strong style="color:var(--white);">' + escapeHtml(tVal.name || '—') + '</strong>';
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
                    if (a.flightMembers && a.flightMembers.length) {
                        body += ' | ' + (currentLang === 'en' ? 'Flight: ' : 'Флайт: ') + a.flightMembers.join(', ');
                    }
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

                var alreadyResponded = !!(a.response && a.response.respondedAt);

                html += '<div class="list-item" style="padding:16px;border-left:4px solid var(--red);background:rgba(224,90,74,0.1);flex-wrap:wrap;gap:10px;">';
                html += '<div style="flex:1;min-width:200px;">';
                html += '<div style="font-weight:800;font-size:16px;color:var(--white);">' + icon + ' ' + callHeader + title + '</div>';
                html += '<div style="color:var(--gold);font-size:14px;margin:4px 0;">' + holeLblStr + ': <b>' + a.hole + '</b> | ' + playerLblStr + ': <b>' + (a.playerName || '—') + '</b></div>';
                if (a.flightMembers && a.flightMembers.length) {
                    var flightLblStr = currentLang === 'en' ? 'Flight' : 'Состав флайта';
                    html += '<div style="font-size:12px;color:var(--blue);margin-top:2px;">' + flightLblStr + ': ' + a.flightMembers.map(function(n) { return escapeHtml(n); }).join(', ') + '</div>';
                }
                html += '<div style="font-size:11px;color:var(--muted);">' + fmtTime(a.time) + '</div>';
                if (alreadyResponded) {
                    var who = a.response.responderRole === 'marshal'
                        ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
                        : (currentLang === 'en' ? 'Referee' : 'Судья');
                    var respondedTxt = currentLang === 'en'
                        ? '✅ ' + who + ' is on the way (' + fmtTime(a.response.respondedAt) + ')'
                        : '✅ ' + who + ' едет (' + fmtTime(a.response.respondedAt) + ')';
                    html += '<div style="font-size:12px;color:#2ecc71;font-weight:700;margin-top:6px;"><i class="fas fa-check-circle"></i> ' + respondedTxt + '</div>';
                }
                html += '</div>';
                html += '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-wrap:wrap;">';
                if (!alreadyResponded) {
                    var acceptCallText = currentLang === 'en' ? 'Accept Call' : 'Вызов принят';
                    html += '<button class="btn btn-g btn-sm" style="background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;border:none;" onclick="respondToAlert(\'' + id + '\', \'' + a.type + '\', \'' + (a.playerId || '') + '\')"><i class="fas fa-car"></i> ' + acceptCallText + '</button>';
                }
                html += '<button class="btn btn-r btn-sm" onclick="closeAlert(\'' + id + '\')">' + (currentLang === 'en' ? 'Dismiss Alert' : 'Закрыть вызов') + '</button>';
                html += '</div>';
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

// Ответ админа на вызов: записывает в `alerts/<id>/response` и шлёт уведомление
// игроку в `users/<playerId>/notifications` — клиент игрока подхватит его при следующем
// заходе в live/solo и покажет тост «Судья/маршал едет».
function respondToAlert(alertId, alertType, playerId) {
    if (!alertId) return;
    if (!playerId) {
        toast(currentLang === 'en' ? '⚠️ Player ID is unknown for this alert' : '⚠️ Не удалось определить игрока для ответа', 'error');
        return;
    }

    var now = Date.now();
    var responderRole = (alertType === 'marshal') ? 'marshal' : 'referee';

    var responseData = {
        status: 'accepted',
        responderRole: responderRole,
        respondedAt: now,
        respondedBy: currentUser ? currentUser.uid : 'admin'
    };

    var notification = {
        type: 'call_response',
        alertId: alertId,
        responderRole: responderRole,
        time: now,
        read: false
    };

    var updates = {};
    updates['alerts/' + alertId + '/response'] = responseData;
    updates['users/' + playerId + '/notifications/' + alertId] = notification;

    db.ref().update(updates).then(function() {
        var who = responderRole === 'marshal'
            ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
            : (currentLang === 'en' ? 'Referee' : 'Судья');
        toast((currentLang === 'en' ? '✅ ' + who + ' is on the way! Player notified.' : '✅ ' + who + ' едет! Игрок уведомлён.'), 'success');
        if (typeof vib === 'function') vib([50, 30, 50]);
    }).catch(function(err) {
        toast((currentLang === 'en' ? '❌ Response failed: ' : '❌ Ошибка отправки ответа: ') + (err && err.message ? err.message : err), 'error');
    });
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
            html += '<strong style="color:var(--gold);font-size:15px;"><i class="fas fa-bullhorn"></i> ' + escapeHtml(b.title || 'Announcement') + '</strong>';
            html += '<div style="font-size:13px;color:var(--white);margin:4px 0;">' + escapeHtml(b.body || '') + '</div>';
            html += '<div style="font-size:11px;color:var(--muted);">' + fmtDate(b.time) + ' · ' + fmtTime(b.time) + ' · Link: ' + escapeHtml(b.link || 'tournaments.html') + '</div>';
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
                var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, getRoundOrder(r));
                var row = [
                    rid,
                    dateStr,
                    timeStr,
                    r.mode || 'group',
                    r.format || 'Stroke',
                    (p && p.tee) || r.tee || 'wh',
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

    sendTelegramDirectAlert(token, chatId, 'Группу', 'referee', 1, 'Администратор Клуба', []);
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

    sendTelegramDirectAlert(token, chatId, 'Канал', 'referee', 1, 'Администратор Клуба', []);
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
    var tokInp  = document.getElementById('vk-access-token');
    var peerInp = document.getElementById('vk-peer-id');

    // Сначала подгружаем из localStorage
    if (tokInp)  tokInp.value  = localStorage.getItem('pestovo_vk_token')    || '';
    if (peerInp) peerInp.value = localStorage.getItem('pestovo_vk_peer_id')  || '';

    // Затем из Firebase (приоритет выше)
    if (typeof db !== 'undefined') {
        db.ref('settings/vk').once('value').then(function(sn) {
            var vk = sn.val() || {};
            if (tokInp  && vk.token)  tokInp.value  = vk.token;
            if (peerInp && vk.peerId) peerInp.value = vk.peerId;
        }).catch(function(e) {
            console.warn('VK loadSettings Firebase error:', e);
        });
    }
}

function saveVKSettings() {
    var tokInp  = document.getElementById('vk-access-token');
    var peerInp = document.getElementById('vk-peer-id');
    var token   = tokInp  ? tokInp.value.trim()  : '';
    var peerId  = peerInp ? peerInp.value.trim() : '';

    // Валидация
    if (!token) {
        toast(currentLang === 'en'
            ? '⚠️ Enter VK Community Access Token'
            : '⚠️ Введите VK Access Token сообщества', 'error');
        return;
    }
    if (!peerId) {
        toast(currentLang === 'en'
            ? '⚠️ Enter VK Peer ID (chat/user ID)'
            : '⚠️ Введите VK Peer ID (беседы или пользователя)', 'error');
        return;
    }
    if (!/^-?\d+$/.test(peerId)) {
        toast(currentLang === 'en'
            ? '⚠️ Peer ID must be a number (e.g. 2000000001 or 123456789)'
            : '⚠️ Peer ID должен быть числом (например 2000000001 или 123456789)', 'error');
        return;
    }

    localStorage.setItem('pestovo_vk_token',   token);
    localStorage.setItem('pestovo_vk_peer_id', peerId);

    if (typeof db !== 'undefined') {
        db.ref('settings/vk').set({
            token:     token,
            peerId:    peerId,
            updatedAt: Date.now()
        }).then(function() {
            toast(currentLang === 'en'
                ? '✅ VK settings saved!'
                : '✅ Настройки ВКонтакте сохранены!', 'success');
        }).catch(function(e) {
            console.error('VK save Firebase error:', e);
            toast(currentLang === 'en'
                ? '⚠️ Saved locally (Firebase error: ' + e.message + ')'
                : '⚠️ Сохранено локально (ошибка Firebase: ' + e.message + ')', 'error');
        });
    } else {
        toast(currentLang === 'en'
            ? '✅ VK settings saved locally!'
            : '✅ Настройки ВКонтакте сохранены локально!', 'success');
    }
}

function testVKAlert() {
    var tokInp  = document.getElementById('vk-access-token');
    var peerInp = document.getElementById('vk-peer-id');
    var token   = tokInp  ? tokInp.value.trim()  : '';
    var peerId  = peerInp ? peerInp.value.trim() : '';

    if (!token || !peerId) {
        toast(currentLang === 'en'
            ? '⚠️ Enter VK Access Token and Peer ID first'
            : '⚠️ Укажите VK Access Token и Peer ID перед проверкой', 'error');
        return;
    }
    if (!/^-?\d+$/.test(peerId)) {
        toast(currentLang === 'en'
            ? '⚠️ Peer ID must be a number (e.g. 2000000001)'
            : '⚠️ Peer ID должен быть числом (например 2000000001)', 'error');
        return;
    }

    // Автосохранение перед тестом
    localStorage.setItem('pestovo_vk_token',   token);
    localStorage.setItem('pestovo_vk_peer_id', peerId);
    if (typeof db !== 'undefined') {
        db.ref('settings/vk').set({
            token: token, peerId: peerId, updatedAt: Date.now()
        }).catch(function(){});
    }

    toast(currentLang === 'en'
        ? '⏳ Sending test VK message...'
        : '⏳ Отправка тестового сообщения ВК...', 'info');

    sendVKDirectAlert(token, peerId, 'referee', 1,
        currentLang === 'en' ? 'Club Administrator' : 'Администратор Клуба', []);
}

// ==========================================
// DEFAULT STABLEFORD DISPLAY MANAGEMENT
// ==========================================
function loadStablefordDisplaySettings() {
    var checkbox = document.getElementById('pv-stableford-default');
    if (!checkbox) return;

    var applyValue = function(value) {
        // Ключ ещё не создан → включённый дефолт новой функции.
        var normalized = typeof normalizeStablefordDisplayValue === 'function'
            ? normalizeStablefordDisplayValue(value) : null;
        checkbox.checked = normalized === null ? true : normalized;
    };

    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }

    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-stableford-display-default', db.ref('settings/stableford_display_default'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/stableford_display_default').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

function toggleStablefordDefaultCheckbox(event) {
    togglePVCheckbox('pv-stableford-default', event);
}

function saveStablefordDisplayDefault() {
    var checkbox = document.getElementById('pv-stableford-default');
    var enabled = checkbox ? !!checkbox.checked : true;

    // Обновление мгновенно отражается в этой вкладке; на устройствах игроков
    // настройка придёт через listener в utils.js. Личные настройки не меняем.
    if (typeof syncStablefordDisplayDefault === 'function') syncStablefordDisplayDefault(enabled);

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Stableford default saved locally' : 'Настройка Stableford сохранена локально', 'success');
        return;
    }

    db.ref('settings/stableford_display_default').set(enabled).then(function() {
        toast(enabled
            ? (currentLang === 'en' ? 'Stableford is enabled by default' : 'Stableford включён по умолчанию')
            : (currentLang === 'en' ? 'Stableford is disabled by default' : 'Stableford выключен по умолчанию'), 'success');
    }).catch(function(error) {
        console.warn('[Stableford] Cannot save default display setting', error);
        toast(currentLang === 'en' ? 'Could not save the Stableford default' : 'Не удалось сохранить настройку Stableford', 'error');
    });
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

    // Состояние чекбокса «Меню инструментов» (по умолчанию ВЫКЛЮЧЕНО)
    var toolsCheckbox = document.getElementById('pv-tools-menu');
    if (toolsCheckbox) {
        var toolsEnabled = localStorage.getItem('pestovo_tools_menu_enabled') === '1';
        toolsCheckbox.checked = toolsEnabled;
    }

    // Состояние чекбокса «Мои настройки» (по умолчанию ВКЛЮЧЕНО)
    var prefsCheckbox = document.getElementById('pv-my-preferences');
    if (prefsCheckbox) {
        var v = localStorage.getItem('pestovo_my_preferences_enabled');
        // По умолчанию (null/undefined) — включено
        prefsCheckbox.checked = (v === null || v === undefined || v === '1');
    }

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
        // Синхронизация переключателя «Меню инструментов»
        db.ref('settings/tools_menu_enabled').on('value', function(sn) {
            var v = sn.val();
            var enabled = (v === true || v === '1' || v === 1);
            try { localStorage.setItem('pestovo_tools_menu_enabled', enabled ? '1' : '0'); } catch(e) {}
            var cb = document.getElementById('pv-tools-menu');
            if (cb) cb.checked = enabled;
            if (typeof navAuth === 'function' && typeof currentUserData !== 'undefined') {
                navAuth(currentUser, currentUserData);
            }
            if (typeof buildMobileDrawer === 'function') buildMobileDrawer();
        });
        // Синхронизация переключателя «Мои настройки» (боковое меню)
        db.ref('settings/my_preferences_enabled').on('value', function(sn) {
            var v = sn.val();
            if (v === null || v === undefined) {
                // По умолчанию ВКЛ — в localStorage ничего не пишем
                var cb0 = document.getElementById('pv-my-preferences');
                if (cb0) cb0.checked = true;
                return;
            }
            var enabled = (v === true || v === '1' || v === 1);
            try { localStorage.setItem('pestovo_my_preferences_enabled', enabled ? '1' : '0'); } catch(e) {}
            var cb = document.getElementById('pv-my-preferences');
            if (cb) cb.checked = enabled;
            if (typeof buildMobileDrawer === 'function') buildMobileDrawer();
            if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
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

    // Сохраняем состояние «Меню инструментов»
    var toolsCb = document.getElementById('pv-tools-menu');
    var toolsEnabled = toolsCb ? toolsCb.checked : false;
    try { localStorage.setItem('pestovo_tools_menu_enabled', toolsEnabled ? '1' : '0'); } catch(e) {}
    if (typeof navAuth === 'function' && typeof currentUserData !== 'undefined') {
        navAuth(currentUser, currentUserData);
    }
    if (typeof buildMobileDrawer === 'function') buildMobileDrawer();

    // Сохраняем состояние «Мои настройки» (боковое меню)
    var prefsCb = document.getElementById('pv-my-preferences');
    // По умолчанию ВКЛ, если чекбокс не найден — считаем включённым
    var prefsEnabled = prefsCb ? prefsCb.checked : true;
    try { localStorage.setItem('pestovo_my_preferences_enabled', prefsEnabled ? '1' : '0'); } catch(e) {}
    if (typeof buildMobileDrawer === 'function') buildMobileDrawer();
    if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();

    toast(currentLang === 'en' ? '✅ Page visibility settings saved!' : '✅ Настройки видимости сохранены!', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);

    if (typeof db !== 'undefined') {
        var updates = {
            'settings/hidden_pages': fbPages,
            'settings/tools_menu_enabled': toolsEnabled,
            'settings/my_preferences_enabled': prefsEnabled
        };
        db.ref().update(updates).then(function() {
            console.log('Visibility settings synced to Firebase successfully');
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

function toggleToolsMenuCheckbox(event) {
    togglePVCheckbox('pv-tools-menu', event);
}

function toggleMyPreferencesCheckbox(event) {
    togglePVCheckbox('pv-my-preferences', event);
}

// ==========================================
// КОНФИДЕНЦИАЛЬНОСТЬ ИМЁН (ФИО)
// Настройки: settings/privacy = { enabled, maskMode, players: { uid: bool } }
// ==========================================
function loadPrivacySettings() {
    var globalCb = document.getElementById('pv-privacy-global');
    var maskSel = document.getElementById('pv-privacy-mask');

    var apply = function(v) {
        v = v || {};
        if (globalCb) globalCb.checked = v.enabled === true;
        if (maskSel) maskSel.value = (v.maskMode === 'masked') ? 'masked' : 'initials';
    };

    if (typeof db === 'undefined') {
        apply(null);
        return;
    }
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-privacy', db.ref('settings/privacy'), function(sn) {
            apply(sn.val());
        });
    } else {
        db.ref('settings/privacy').once('value').then(function(sn) { apply(sn.val()); }).catch(function() { apply(null); });
    }
}

function togglePrivacyGlobalCheckbox(event) {
    togglePVCheckbox('pv-privacy-global', event);
}

function savePrivacySettings() {
    var globalCb = document.getElementById('pv-privacy-global');
    var maskSel = document.getElementById('pv-privacy-mask');
    var enabled = globalCb ? globalCb.checked : false;
    var maskMode = maskSel && maskSel.value === 'masked' ? 'masked' : 'initials';

    // Обновляем локальное состояние для текущего пользователя сразу
    if (typeof pestovoPrivacy !== 'undefined') {
        pestovoPrivacy.enabled = enabled;
        pestovoPrivacy.maskMode = maskMode;
    }
    try {
        localStorage.setItem('pestovo_privacy', JSON.stringify({ enabled: enabled, maskMode: maskMode, players: pestovoPrivacy.players || {} }));
    } catch (e) {}
    if (typeof renderPrivacySensitiveHome === 'function') renderPrivacySensitiveHome();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Privacy settings saved locally' : 'Настройки приватности сохранены локально', 'success');
        return;
    }

    db.ref('settings/privacy').once('value').then(function(sn) {
        var cur = sn.val() || {};
        db.ref('settings/privacy').update({
            enabled: enabled,
            maskMode: maskMode,
            players: cur.players || {},
            updatedAt: Date.now()
        }).then(function() {
            toast(enabled
                ? (currentLang === 'en' ? '✅ Names are now hidden from others' : '✅ Имена теперь скрыты от других')
                : (currentLang === 'en' ? '✅ Names are visible to others' : '✅ Имена снова видны другим'), 'success');
        }).catch(function(err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// Переключатель «Скрыть имя» для конкретного игрока (в списке игроков админки).
// true — скрывать (перекрывает глобальный выключатель), false — показывать.
function togglePlayerPrivacy(id) {
    if (!id) return;
    var ref = db.ref('settings/privacy/players/' + id);
    ref.once('value').then(function(sn) {
        var cur = sn.val();
        var newVal = (cur === true) ? false : true;
        return ref.set(newVal).then(function() {
            toast(newVal
                ? (currentLang === 'en' ? '🙈 Name will be hidden from others' : '🙈 Имя будет скрыто от других')
                : (currentLang === 'en' ? '🙂 Name will be visible to others' : '🙂 Имя будет видно другим'), 'success');
            if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
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
        var entries = Object.entries(combined).filter(function(e) {
            return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(e[0], e[1] && e[1].name));
        });

        // Дедуп по ФИО, чтобы не было сдваивания в админ-списке
        if (typeof dedupePlayerEntriesByFio === 'function') {
            entries = dedupePlayerEntriesByFio(entries);
        } else if (typeof rgGetFioKey === 'function') {
            var seenFio = {};
            var deduped = [];
            entries.forEach(function(en){
                var u = en[1] || {};
                var key = rgGetFioKey(u) || impNormName(u.name||'');
                if (!key) { deduped.push(en); return; }
                if (seenFio[key]) return;
                seenFio[key]=true;
                deduped.push(en);
            });
            entries = deduped;
        }

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
            html += '<strong style="color:var(--white);">' + gIcon + ' ' + escapeHtml(u.name || '—') + guestBadge + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">';
            html += escapeHtml(u.email || (currentLang === 'en' ? 'No email' : 'Без email')) + ' · HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') + roundsStr + (u.roundsPlayed || 0);
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

                // Персональный тумблер приватности имени: скрыть/показывать ФИО этого игрока
                var privInd = (typeof pestovoPrivacy !== 'undefined' && pestovoPrivacy.players) ? pestovoPrivacy.players[id] : undefined;
                var privHidden = (privInd === true) || (privInd !== false && (typeof pestovoPrivacy === 'undefined' ? false : pestovoPrivacy.enabled === true));
                var privLabel = privHidden ? t('privacy_show_btn') : t('privacy_hide_btn');
                html += '<button class="btn ' + (privHidden ? 'btn-r' : 'btn-og') + ' btn-sm" onclick="togglePlayerPrivacy(\'' + id + '\')" title="' + (currentLang === 'en' ? 'Hide/show full name from others' : 'Скрыть/показывать ФИО от других') + '">' +
                        '<i class="fas fa-' + (privHidden ? 'eye' : 'eye-slash') + '"></i> ' + privLabel + '</button>';

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

    // Нормализованный ключ имени, по которому ищем упоминания удалённого игрока
    // в раундах, регистрациях на турниры и т.п.
    var normKey = '';
    if (typeof normalizeSearchText === 'function' && name) {
        normKey = normalizeSearchText(name);
    } else if (name) {
        normKey = String(name).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    }

    // Запоминаем удаление, чтобы кэш и история раундов не «воскрешали» игрока
    if (typeof markPlayerDeleted === 'function') markPlayerDeleted(id, name);

    // Удаляем все упоминания игрока в `rounds` (players / markerAssignments / markerScores /
    // submitted / markerSubmitted / verified) и снимаем регистрации во всех турнирах.
    // Без этого в выпадашке автоподбора при создании раунда удалённый игрок всё равно
    // появляется — его подбирают из истории раундов.
    var purgeFirebaseReferences = function(callback) {
        if (typeof db === 'undefined') { callback(); return; }

        var tasksPending = 4; // rounds, tournaments, users/history, users
        var tasksLeft = tasksPending;
        var check = function() { tasksLeft--; if (tasksLeft === 0) callback(); };

        // 1) Удаляем упоминания в `rounds` (включая marker* и verified поля)
        db.ref('rounds').once('value').then(function(sn) {
            var rounds = sn.val() || {};
            var updates = {};
            Object.keys(rounds).forEach(function(rid) {
                var r = rounds[rid];
                if (!r) return;
                if (r.players && r.players[id]) {
                    updates['rounds/' + rid + '/players/' + id] = null;
                }
                if (r.markerAssignments && r.markerAssignments[id]) {
                    updates['rounds/' + rid + '/markerAssignments/' + id] = null;
                }
                // markerScores и markerSubmitted хранятся под ключом целевого игрока
                if (r.players) {
                    Object.keys(r.players).forEach(function(tid) {
                        if (tid === id) return;
                        var p = r.players[tid] || {};
                        if (p.markerScores && p.markerScores[id]) {
                            updates['rounds/' + rid + '/players/' + tid + '/markerScores/' + id] = null;
                        }
                        if (p.markerSubmitted && p.markerSubmitted[id]) {
                            updates['rounds/' + rid + '/players/' + tid + '/markerSubmitted/' + id] = null;
                        }
                    });
                }
            });
            var applyRoundUpdates = function() {
                if (Object.keys(updates).length === 0) { check(); return; }
                db.ref().update(updates).then(check, check);
            };
            applyRoundUpdates();
        }, check);

        // 2) Снимаем регистрации во всех турнирах (по uid)
        db.ref('tournaments').once('value').then(function(sn) {
            var tournaments = sn.val() || {};
            var tnUpdates = {};
            Object.keys(tournaments).forEach(function(tid) {
                var t = tournaments[tid];
                if (t && t.registeredPlayers && t.registeredPlayers[id]) {
                    tnUpdates['tournaments/' + tid + '/registeredPlayers/' + id] = null;
                }
            });
            if (Object.keys(tnUpdates).length === 0) { check(); return; }
            db.ref().update(tnUpdates).then(check, check);
        }, check);

        // 3) Удаляем историю раундов
        db.ref('users/' + id + '/history').remove().then(check, check);

        // 4) Удаляем саму ноду users/<id> и уведомления этого игрока
        var userUpdates = {};
        userUpdates['users/' + id] = null;
        userUpdates['users/' + id + '/notifications'] = null;
        db.ref().update(userUpdates).then(check, check);
    };

    var finishLocalDelete = function() {
        if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[id]) {
            delete cachedRegisteredUsers[id];
        }
        // Также выкидываем из кэша все ghost-записи, оставшиеся от истории раундов
        // по этому имени (могут иметь ключ вроде guest_name_xxx).
        if (normKey && typeof cachedRegisteredUsers !== 'undefined') {
            Object.keys(cachedRegisteredUsers).forEach(function(k) {
                var u = cachedRegisteredUsers[k];
                if (!u || !u.name) return;
                var uKey = (typeof normalizeSearchText === 'function')
                    ? normalizeSearchText(u.name)
                    : String(u.name).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
                if (uKey === normKey) delete cachedRegisteredUsers[k];
            });
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
                    // Тот же ghost-фильтр по нормализованному имени
                    if (normKey) {
                        Object.keys(cached).forEach(function(k) {
                            var u = cached[k];
                            if (!u || !u.name) return;
                            var uKey = (typeof normalizeSearchText === 'function')
                                ? normalizeSearchText(u.name)
                                : String(u.name).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
                            if (uKey === normKey) delete cached[k];
                        });
                    }
                    localStorage.setItem('pestovo_cached_users', JSON.stringify(cached));
                }
            }
        } catch(e) {}

        // После удаления автоподбор читает кэш через `getKnownPlayersSync()`,
        // поэтому нужно триггерить обновление списка в открытых формах.
        if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        toast(currentLang === 'en' ? '🗑️ Player deleted everywhere' : '🗑️ Игрок полностью удалён');
    };

    if (typeof db !== 'undefined') {
        // Сначала чистим все упоминания, потом завершаем очистку локального кэша
        purgeFirebaseReferences(function() {
            finishLocalDelete();
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
    var middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
    var lastName = parts.length > 1 ? parts[parts.length - 1] : '';
    // Если ввели "Иван Петрович Тестов" — first=Иван, middle=Петрович, last=Тестов
    // Если ввели "Тестов Иван Петрович" — тоже попробуем разобрать как в АГР
    if (parts.length === 3) {
        // Эвристика: если первая часть похожа на фамилию (заканчивается на -ов/-ев/-ин), считаем фамилия первая
        var firstNorm = impNormName(parts[0]);
        if (/(ов|ев|ин|ский|цкий|ко)$/.test(firstNorm)) {
            lastName = parts[0];
            firstName = parts[1];
            middleName = parts[2];
        }
    }

    // Проверка на дубликат по ФИО — чтобы не было сдваивания
    var allLocal = (typeof getKnownPlayersSync === 'function') ? getKnownPlayersSync() : {};
    var normNew = impNormName(name);
    var foundDupId = null;
    var foundDupData = null;
    Object.keys(allLocal).forEach(function(uid){
        var u = allLocal[uid] || {};
        if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, u.name)) return;
        var existingKey = (typeof rgGetFioKey === 'function') ? rgGetFioKey(u) : impNormName(u.name||'');
        if (existingKey && existingKey === normNew) {
            foundDupId = uid;
            foundDupData = u;
        }
    });
    if (foundDupId) {
        // Уже есть игрок с таким ФИО — обновляем гандикап и добавляем отчество если не было
        if (typeof db !== 'undefined') {
            var upd = { handicap: parsedHcp, hcpUpdatedAt: Date.now(), hcpSource: 'manual' };
            if (middleName && !(foundDupData && foundDupData.middleName)) {
                upd.middleName = middleName;
                upd.firstName = firstName;
                upd.lastName = lastName;
                upd.name = (firstName + (middleName ? ' ' + middleName : '') + (lastName ? ' ' + lastName : '')).trim();
            }
            db.ref('users/' + foundDupId).update(upd);
        }
        if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[foundDupId]) {
            cachedRegisteredUsers[foundDupId].handicap = parsedHcp;
            if (middleName && !cachedRegisteredUsers[foundDupId].middleName) {
                cachedRegisteredUsers[foundDupId].middleName = middleName;
                cachedRegisteredUsers[foundDupId].firstName = firstName;
                cachedRegisteredUsers[foundDupId].lastName = lastName;
                cachedRegisteredUsers[foundDupId].name = (firstName + (middleName ? ' ' + middleName : '') + (lastName ? ' ' + lastName : '')).trim();
            }
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch(e){}
        }
        toast((currentLang === 'en' ? '🔄 Player ' : '🔄 Игрок ') + name + (currentLang === 'en' ? ' updated (HCP ' : ' обновлён (HCP ') + fmtExactHcp(parsedHcp) + ') — ' + (currentLang === 'en' ? 'duplicate avoided' : 'дубликат предотвращён'), 'success');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        nameInp.value = '';
        if (emailInp) emailInp.value = '';
        if (hcpInp) hcpInp.value = '';
        return;
    }

    var newId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    var playerData = {
        name: name,
        firstName: firstName,
        middleName: middleName || '',
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
    var mergePlayers = function(remoteUsers, roundsData) {
        var combined = Object.assign({}, localUsers, remoteUsers || {});
        // Добавляем всех, кто играл раунды (гости, временные uid, незарегистрированные)
        Object.keys(roundsData || {}).forEach(function(rid) {
            var r = roundsData[rid];
            if (!r || !r.players) return;
            Object.keys(r.players).forEach(function(pid) {
                var p = r.players[pid];
                if (!p || !p.name) return;
                if (combined[pid]) {
                    // Дополняем firstName/lastName, если в users их нет
                    var existing = combined[pid];
                    if (!existing.firstName && p.firstName) existing.firstName = p.firstName;
                    if (!existing.lastName && p.lastName) existing.lastName = p.lastName;
                    if (existing.handicap == null && p.exactHcp != null) existing.handicap = p.exactHcp;
                    if (!existing.gender && p.gender) existing.gender = p.gender;
                    return;
                }
                var parts = String(p.name || '').replace(/\s+/g, ' ').trim().split(' ');
                combined[pid] = {
                    name: p.name,
                    firstName: p.firstName || parts[0] || '',
                    lastName: p.lastName || parts.slice(1).join(' ') || '',
                    handicap: p.exactHcp != null ? p.exactHcp : (p.handicap != null ? p.handicap : null),
                    gender: p.gender || 'men',
                    isGuest: !!p.isGuest || String(pid).indexOf('guest_') === 0,
                    role: 'player',
                    roundsPlayed: 1
                };
            });
        });
        callback(Object.entries(combined).filter(function(e) {
            // Удалённые и навсегда заблокированные демо-игроки не попадают в экспорт
            return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(e[0], e[1] && e[1].name));
        }).map(function(e) {
            return { id: e[0], data: e[1] || {} };
        }));
    };
    if (typeof db !== 'undefined') {
        Promise.all([
            db.ref('users').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; }),
            db.ref('rounds').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; })
        ]).then(function(res) {
            mergePlayers(res[0], res[1]);
        }).catch(function() {
            mergePlayers(null, null);
        });
    } else {
        mergePlayers(null, null);
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
        ['Иван', 'Тестов', 12.0, 'муж'],
        ['Мария', 'Тестова', 20.0, 'жен']
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
// ИНТЕГРАЦИЯ С hcp.rusgolf.ru (БАЗА АГР РОССИИ)
// ==========================================
var RG_SEARCH_BASE = 'https://hcp.rusgolf.ru/public/player/ru/?search=';
var rgLastResults = [];
var rgSyncState = { running: false, stop: false, stats: null };

function rgIsAdmin() {
    return hasAdminPanelAccess();
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
    var fioParts = String(fio || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    // В базе АГР ФИО обычно: «Фамилия Имя Отчество»
    return {
        number: String(num || '').replace(/\s+/g, '').toUpperCase(),
        fio: String(fio || '').replace(/\s+/g, ' ').trim(),
        lastName: fioParts[0] || '',
        firstName: fioParts[1] || '',
        middleName: fioParts.slice(2).join(' ') || '',
        nameParts: fioParts,
        gender: /^ж/i.test(String(gender || '').trim()) ? 'women' : 'men',
        genderRaw: String(gender || '').trim(),
        hcp: rgParseHcpValue(hi),
        hcpDisplay: String(hi || '').trim() || '—',
        hcpDate: String(hcpDate || '').trim()
    };
}

/** Нормализует first/last name локального игрока, учитывая оба порядка: «Имя Фамилия» и «Фамилия Имя». */
function rgLocalNameParts(u) {
    u = u || {};
    var first = impNormName(u.firstName || '');
    var last = impNormName(u.lastName || '');
    var full = impNormName(u.name || ((u.firstName || '') + ' ' + (u.lastName || '')).trim());
    var parts = full ? full.split(' ').filter(Boolean) : [];
    if (!first && parts.length) first = parts[0];
    if (!last && parts.length > 1) last = parts[parts.length - 1];
    // Если firstName/lastName не заданы, parts[0] — либо имя, либо фамилия
    return { first: first, last: last, full: full, parts: parts };
}

/** Совпадение имён в обоих порядках: «Фамилия Имя» и «Имя Фамилия». */
function rgNamesMatch(localFirst, localLast, remoteFirst, remoteLast, localFull, remoteFull) {
    var lf = impNormName(localFirst);
    var ll = impNormName(localLast);
    var rf = impNormName(remoteFirst);
    var rl = impNormName(remoteLast);
    var lFull = impNormName(localFull);
    var rFull = impNormName(remoteFull);

    if (lFull && rFull && lFull === rFull) return 'strong';

    // Прямое: Фамилия=Фамилия, Имя=Имя
    if (ll && rl && lf && rf && ll === rl && lf === rf) return 'strong';
    // Обратное: локально Имя Фамилия, в АГР Фамилия Имя (или наоборот)
    if (ll && rl && lf && rf && ll === rf && lf === rl) return 'strong';

    // Только фамилия + имя (одно из полей пустое)
    if (ll && rl && ll === rl && (!lf || !rf || lf === rf)) return lf && rf ? 'strong' : 'loose';
    if (ll && rf && ll === rf && (!lf || !rl || lf === rl)) return lf && rl ? 'strong' : 'loose';
    if (lf && rl && lf === rl && (!ll || !rf || ll === rf)) return ll && rf ? 'strong' : 'loose';

    // Совпадение по частям ФИО (порядок не важен)
    if (lFull && rFull) {
        var lp = lFull.split(' ').filter(Boolean);
        var rp = rFull.split(' ').filter(Boolean);
        if (lp.length >= 2 && rp.length >= 2) {
            var allLocalInRemote = lp.every(function(p) { return rp.indexOf(p) !== -1; });
            var allRemoteMainInLocal = rp.slice(0, 2).every(function(p) { return lp.indexOf(p) !== -1; });
            if (allLocalInRemote || allRemoteMainInLocal) return 'strong';
            // Общая фамилия (одна из частей)
            var shared = lp.filter(function(p) { return rp.indexOf(p) !== -1; });
            if (shared.length >= 1 && (lp.indexOf(rl) !== -1 || rp.indexOf(ll) !== -1 || shared.length >= 2)) {
                return shared.length >= 2 ? 'strong' : 'loose';
            }
        }
    }

    // Слабое: только фамилия
    if (ll && rl && ll === rl) return 'loose';
    if (ll && rf && ll === rf) return 'loose';
    if (lf && rl && lf === rl && lf.length > 2) return 'loose';

    return null;
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
    var foundLoose = null;
    (players || []).some(function(p) {
        var u = p.data || {};
        var local = rgLocalNameParts(u);
        if (!local.full && !local.first && !local.last) return false;
        var match = rgNamesMatch(local.first, local.last, result.firstName, result.lastName, local.full, result.fio);
        if (match === 'strong') {
            found = p;
            return true;
        }
        if (match === 'loose' && !foundLoose) foundLoose = p;
        return false;
    });
    return found || foundLoose;
}

// ВСЕ локальные игроки, совпадающие с записью базы АГР (сначала сильные
// совпадения, при их отсутствии — нечёткие). Дедупликация по id.
// Возврат списка (а не одного первого) нужен, чтобы админ мог выбрать:
// обновить существующего игрока (какого именно, если их несколько)
// или добавить нового — иначе плодились дубли с разными гандикапами.
function rgFindLocalMatchesInList(players, result) {
    var strong = [];
    var loose = [];
    (players || []).forEach(function(p) {
        var u = p.data || {};
        var local = rgLocalNameParts(u);
        if (!local.full && !local.first && !local.last) return;
        var m = rgNamesMatch(local.first, local.last, result.firstName, result.lastName, local.full, result.fio);
        if (m === 'strong') strong.push(p);
        else if (m === 'loose') loose.push(p);
    });
    return strong.length ? strong : loose;
}

function rgFindLocalMatches(result) {
    var localUsers = typeof getKnownPlayersSync === 'function' ? (getKnownPlayersSync() || {}) : {};
    var players = Object.keys(localUsers).map(function(id) { return { id: id, data: localUsers[id] || {} }; });
    return rgFindLocalMatchesInList(players, result);
}

// Совместимость со старыми вызовами: первый найденный локальный игрок
function rgFindLocalMatch(result) {
    var all = rgFindLocalMatches(result);
    return all.length ? all[0] : null;
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
    rgShowStatus('<i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Searching RGA database (hcp.rusgolf.ru)...' : 'Идёт поиск в базе АГР (hcp.rusgolf.ru)...'));
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
        var hasValid = rows.some(function(r){ return r.hcp != null; });
        var html = '';

        // Bulk toolbar: select all + bulk add button
        if (rows.length) {
            html += '<div class="rg-bulk-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding:12px 14px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:12px;">';
            html += '<label class="list-item" style="cursor:pointer;padding:8px 14px;display:flex;align-items:center;gap:10px;margin:0;background:rgba(255,255,255,0.03);border-radius:10px;user-select:none;">';
            html += '<input type="checkbox" id="rg-check-all" onchange="rgToggleAllResults(this)" style="width:20px;height:20px;cursor:pointer;">';
            html += '<span style="font-weight:700;font-size:13px;color:var(--white);">' + (currentLang === 'en' ? 'Select all' : 'Выбрать все') + '</span>';
            html += '</label>';
            html += '<button type="button" class="btn btn-g imp-big-btn" onclick="rgBulkAddSelected()" ' + (hasValid ? '' : 'disabled') + ' style="min-height:42px;">';
            html += '<i class="fas fa-users-plus"></i> <span>' + (currentLang === 'en' ? 'Add selected' : 'Добавить выбранных') + ' (<span id="rg-bulk-count">0</span>)</span>';
            html += '</button>';
            html += '</div>';
        }

        html += '<div class="rg-list">';
        rows.forEach(function(r, i) {
            var dups = rgFindLocalMatchesInList(players, r);
            var firstDup = dups.length ? dups[0] : null;
            var genderIcon = r.gender === 'women' ? '👩' : '👨';
            var hcpVal = r.hcp != null ? fmtExactHcp(r.hcp) : r.hcpDisplay;
            var hcpChanged = firstDup && r.hcp != null && firstDup.data.handicap != null && Math.abs((parseFloat(firstDup.data.handicap) || 0) - r.hcp) > 0.049;
            var isDisabled = r.hcp == null;
            var teeLabel = r.gender === 'women' ? '🟥 ' + (currentLang === 'en' ? 'Red tees' : 'Красные ти') : '🟦 ' + (currentLang === 'en' ? 'Blue tees' : 'Синие ти');

            html += '<div class="rg-card" style="display:flex;align-items:flex-start;gap:10px;">';
            html += '<input type="checkbox" class="rg-result-check" data-rg-idx="' + i + '" ' + (isDisabled ? 'disabled' : '') + ' onchange="rgUpdateBulkCount()" style="width:20px;height:20px;cursor:pointer;margin-top:6px;flex-shrink:0;">';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;">';
            html += '<div class="rg-main" style="flex:1;min-width:160px;">';
            html += '<div class="rg-name">' + genderIcon + ' ' + escapeHtml(r.fio) + '</div>';
            html += '<div class="rg-meta">💳 ' + escapeHtml(r.number) + ' · ' + (r.gender === 'women' ? (currentLang === 'en' ? 'Female' : 'Жен.') : (currentLang === 'en' ? 'Male' : 'Муж.')) +
                ' · ' + teeLabel +
                (r.hcpDate ? ' · ' + (currentLang === 'en' ? 'updated ' : 'обновлён ') + escapeHtml(r.hcpDate) : '') + '</div>';
            if (dups.length) {
                var dupNames = dups.map(function(d) { return escapeHtml(rgPlayerDisplayName(d)); }).join(', ');
                html += '<div class="rg-meta" style="color:var(--gold);">' + (currentLang === 'en' ? 'Already on site' : 'Уже есть на сайте') +
                    (dups.length > 1 ? ' (' + dups.length + ')' : '') + ': ' + dupNames + '</div>';
            }
            html += '</div>';
            html += '<div class="rg-hcp' + (hcpChanged ? ' rg-hcp-changed' : '') + '" style="flex-shrink:0;">' + escapeHtml(hcpVal) + '<span class="rg-hcp-label">HI</span></div>';
            html += '</div>';
            html += '<div class="rg-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">';
            if (r.hcp == null) {
                html += '<span class="imp-badge imp-badge-err">⚠ ' + (currentLang === 'en' ? 'No HI in RGA base' : 'Нет HI в базе АГР') + '</span>';
            } else {
                // Выбор: обновить СУЩЕСТВУЮЩЕГО игрока (каждого из совпавших)
                // или добавить НОВОГО — чтобы не плодить дублей с разным HCP
                dups.forEach(function(d) {
                    var dIdAttr = String(d.id).replace(/'/g, "\\'");
                    var oldH = d.data.handicap != null ? fmtExactHcp(d.data.handicap) : '—';
                    var dChanged = d.data.handicap != null && Math.abs((parseFloat(d.data.handicap) || 0) - r.hcp) > 0.049;
                    html += '<button type="button" class="btn btn-og btn-sm" onclick="rgUpdateLocalFromResults(' + i + ', \'' + dIdAttr + '\')"><i class="fas fa-rotate"></i> ' +
                        (dChanged
                            ? (currentLang === 'en' ? 'Update existing ' + escapeHtml(rgPlayerDisplayName(d)) + ': HCP ' + oldH + ' → ' + fmtExactHcp(r.hcp)
                                : 'Обновить существующего ' + escapeHtml(rgPlayerDisplayName(d)) + ': HCP ' + oldH + ' → ' + fmtExactHcp(r.hcp))
                            : (currentLang === 'en' ? 'Up to date: ' : 'HCP актуален: ') + escapeHtml(rgPlayerDisplayName(d))) + '</button>';
                });
                if (!dups.length) {
                    html += '<button type="button" class="btn btn-g btn-sm" onclick="rgAddFromResults(' + i + ')"><i class="fas fa-plus"></i> ' +
                        (currentLang === 'en' ? 'Add to site' : 'Добавить на сайт') + '</button>';
                } else {
                    // Дубликат предотвращён: одинаковое ФИО уже есть, предлагаем только обновить HCP и добавить отчество
                    // Кнопка "Добавить как нового" убрана чтобы не было похожих вариантов с разным HCP
                    html += '<span class="imp-badge imp-badge-dup" style="margin-left:6px;">' + (currentLang === 'en' ? 'Duplicate prevented - use update' : 'Дубликат предотвращён - используйте обновление') + '</span>';
                }
            }
            html += '</div>';
            html += '</div>';
            html += '</div>';
        });
        html += '</div>';
        el.innerHTML = html;
        rgUpdateBulkCount();
    });
}

function rgToggleAllResults(master) {
    var checks = document.querySelectorAll('.rg-result-check:not(:disabled)');
    checks.forEach(function(cb){ cb.checked = master.checked; });
    rgUpdateBulkCount();
}

function rgUpdateBulkCount() {
    var checked = document.querySelectorAll('.rg-result-check:checked');
    var label = document.getElementById('rg-bulk-count');
    if (label) label.textContent = String(checked.length);
    var master = document.getElementById('rg-check-all');
    if (master) {
        var all = document.querySelectorAll('.rg-result-check:not(:disabled)');
        var allCount = all.length;
        var checkedCount = checked.length;
        if (!allCount) {
            master.checked = false;
            master.indeterminate = false;
        } else if (checkedCount === 0) {
            master.checked = false;
            master.indeterminate = false;
        } else if (checkedCount === allCount) {
            master.checked = true;
            master.indeterminate = false;
        } else {
            master.checked = false;
            master.indeterminate = true;
        }
    }
}

/** Обновляет HCP и официальное ФИО игрока во всех местах: users, кэш, раунды, история, турниры. */
function rgPropagateHcpEverywhere(userId, r, playerData) {
    if (r == null || r.hcp == null) return Promise.resolve();
    var hcp = r.hcp;
    var gender = (playerData && playerData.gender) || r.gender || 'men';
    var remoteFirst = String(r.firstName || '').trim();
    var remoteMiddle = String(r.middleName || '').trim();
    var remoteLast = String(r.lastName || '').trim();
    var hasOfficialName = !!(remoteFirst && remoteLast);
    var officialName = hasOfficialName ? rgAgrNameSiteOrder(r) : '';
    var updates = {
        handicap: hcp,
        hcpUpdatedAt: Date.now(),
        hcpSource: 'rusgolf'
    };
    if (r.number) updates.rusgolfNumber = r.number;
    if (r.hcpDate) updates.rusgolfHcpDate = r.hcpDate;

    // ФИО в автодобавлении должно совпадать с последней записью АГР. Обновляем
    // все части вместе, а не только добавляем отсутствующее отчество: так также
    // корректно применяются исправления имени или фамилии.
    if (hasOfficialName) {
        updates.name = officialName;
        updates.firstName = remoteFirst;
        updates.middleName = remoteMiddle;
        updates.lastName = remoteLast;
    }

    var applyLocalUpdate = function(cur) {
        cur = cur || {};
        Object.keys(updates).forEach(function(key) { cur[key] = updates[key]; });
        return cur;
    };

    if (typeof cachedRegisteredUsers !== 'undefined') {
        if (cachedRegisteredUsers[userId]) {
            cachedRegisteredUsers[userId] = applyLocalUpdate(cachedRegisteredUsers[userId]);
        } else if (playerData) {
            cachedRegisteredUsers[userId] = applyLocalUpdate(Object.assign({}, playerData));
        }
        try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch(e) {}
    }
    try {
        var custom = {};
        var existing = localStorage.getItem('pestovo_custom_players');
        if (existing) custom = JSON.parse(existing) || {};
        if (custom[userId]) {
            custom[userId] = applyLocalUpdate(custom[userId]);
            localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
        }
    } catch(e) {}

    if (typeof db === 'undefined') return Promise.resolve();

    var fbUpdates = {};
    Object.keys(updates).forEach(function(key) {
        fbUpdates['users/' + userId + '/' + key] = updates[key];
    });

    return Promise.all([
        db.ref('rounds').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; }),
        db.ref('tournaments').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; }),
        db.ref('users/' + userId + '/history').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; })
    ]).then(function(res) {
        var rounds = res[0];
        var tournaments = res[1];
        var history = res[2];

        Object.keys(rounds).forEach(function(rid) {
            var rd = rounds[rid];
            if (!rd || !rd.players) return;
            Object.keys(rd.players).forEach(function(pid) {
                var p = rd.players[pid];
                if (!p || pid !== userId) return;
                var tee = p.tee || rd.tee || 'wh';
                var g = p.gender || gender;
                var fieldHcp = (typeof getFieldHcp === 'function') ? getFieldHcp(hcp, tee, g) : Math.round(hcp);
                var playerPath = 'rounds/' + rid + '/players/' + pid + '/';
                fbUpdates[playerPath + 'exactHcp'] = hcp;
                fbUpdates[playerPath + 'fieldHcp'] = fieldHcp;
                if (hasOfficialName) {
                    fbUpdates[playerPath + 'name'] = officialName;
                    fbUpdates[playerPath + 'firstName'] = remoteFirst;
                    fbUpdates[playerPath + 'middleName'] = remoteMiddle;
                    fbUpdates[playerPath + 'lastName'] = remoteLast;
                }
            });
        });

        Object.keys(tournaments).forEach(function(tid) {
            var tn = tournaments[tid];
            if (!tn || !tn.registeredPlayers) return;
            Object.keys(tn.registeredPlayers).forEach(function(pid) {
                var rp = tn.registeredPlayers[pid];
                if (!rp) return;
                var sameId = pid === userId || (rp.uid && rp.uid === userId);
                if (!sameId) return;
                var playerPath = 'tournaments/' + tid + '/registeredPlayers/' + pid + '/';
                fbUpdates[playerPath + 'handicap'] = hcp;
                if (hasOfficialName) {
                    fbUpdates[playerPath + 'name'] = officialName;
                    fbUpdates[playerPath + 'firstName'] = remoteFirst;
                    fbUpdates[playerPath + 'middleName'] = remoteMiddle;
                    fbUpdates[playerPath + 'lastName'] = remoteLast;
                }
            });
        });

        Object.keys(history).forEach(function(hKey) {
            var h = history[hKey];
            if (!h) return;
            var tee = h.tee || 'wh';
            var g = h.gender || gender;
            var fieldHcp = (typeof getFieldHcp === 'function') ? getFieldHcp(hcp, tee, g) : Math.round(hcp);
            var historyPath = 'users/' + userId + '/history/' + hKey + '/';
            fbUpdates[historyPath + 'exactHcp'] = hcp;
            fbUpdates[historyPath + 'fieldHcp'] = fieldHcp;
            if (hasOfficialName) {
                fbUpdates[historyPath + 'name'] = officialName;
                fbUpdates[historyPath + 'firstName'] = remoteFirst;
                fbUpdates[historyPath + 'middleName'] = remoteMiddle;
                fbUpdates[historyPath + 'lastName'] = remoteLast;
            }
        });

        return db.ref().update(fbUpdates);
    }).catch(function(err) {
        console.warn('rgPropagateHcpEverywhere:', err);
        return db.ref('users/' + userId).update(updates);
    });
}

function rgUpdateHcpOfSilent(userId, r, playerData) {
    return rgPropagateHcpEverywhere(userId, r, playerData);
}

function rgBulkAddSelected() {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var checks = document.querySelectorAll('.rg-result-check:checked');
    if (!checks.length) {
        toast(currentLang === 'en' ? '⚠ Select at least one player' : '⚠ Выберите хотя бы одного игрока', 'error');
        return;
    }
    var indices = [];
    checks.forEach(function(cb){
        var v = parseInt(cb.getAttribute('data-rg-idx'));
        if (!isNaN(v)) indices.push(v);
    });

    var added = 0, updated = 0, skipped = 0;
    var seenIds = {};

    indices.forEach(function(idx){
        var r = rgLastResults[idx];
        if (!r || r.hcp == null) { skipped++; return; }
        var uniqKey = (r.number || '') + '|' + (r.fio || '');
        if (seenIds[uniqKey]) { skipped++; return; }
        seenIds[uniqKey] = true;

        var existing = rgFindLocalMatch(r);
        if (existing) {
            rgUpdateHcpOfSilent(existing.id, r, existing.data);
            updated++;
        } else {
            rgCreateNewPlayerFromAgr(r);
            added++;
        }
    });

    var msg = '✅ ' + (currentLang === 'en' ? 'Bulk add: ' : 'Массовое добавление: ') +
        added + ' ' + (currentLang === 'en' ? 'added' : 'добавлено') +
        ', ' + updated + ' ' + (currentLang === 'en' ? 'updated' : 'обновлено') +
        (skipped ? ', ' + skipped + ' ' + (currentLang === 'en' ? 'skipped' : 'пропущено') : '');
    toast(msg, 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    rgRenderResults(rgLastResults);
}

// Имя в порядке сайта: «Имя [Отчество] Фамилия» (в базе АГР — «Фамилия Имя Отчество»)
function rgAgrNameSiteOrder(r) {
    var parts = [r.firstName, r.middleName, r.lastName].map(function(s) { return String(s || '').trim(); }).filter(Boolean);
    return parts.join(' ') || (r.fio || 'Игрок');
}

// Создаёт НОВУЮ запись игрока из результата базы АГР.
// Сохраняет имя, фамилию, ОТЧЕСТВО и гандикап (отчество — отдельно в middleName).
function rgCreateNewPlayerFromAgr(r) {
    var baseName = rgAgrNameSiteOrder(r) || r.fio || 'player';
    var norm = impNormName(baseName).replace(/\s+/g, '_');
    var numPart = String(r.number || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    var newId = 'user_' + norm + (numPart ? '_' + numPart : '') + '_' + Date.now().toString().slice(-6);
    if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[newId]) {
        newId = newId + '_' + Math.random().toString(36).substring(2,4);
    }
    var playerData = {
        name: rgAgrNameSiteOrder(r),
        firstName: r.firstName || '',
        lastName: r.lastName || '',
        middleName: r.middleName || '',
        email: '',
        handicap: r.hcp,
        gender: r.gender,
        defaultTee: r.gender === 'women' ? 'rd' : 'bl',
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
    if (typeof db !== 'undefined') {
        db.ref('users/' + newId).set(playerData).catch(function(err) {
            console.warn('RUSGOLF player save notice:', err);
        });
    }
    return { id: newId, name: playerData.name };
}

function rgAddFromResults(idx) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgLastResults[idx];
    if (!r) return;
    if (r.hcp == null) {
        toast(currentLang === 'en' ? '⚠ This player has no HI in the RGA base' : '⚠ У этого игрока нет HI в базе АГР', 'error');
        return;
    }
    // Если похожий игрок уже есть на сайте — НЕ создаём дубль: обновляем его HCP.
    // Чтобы создать вторую запись, есть отдельная кнопка «Добавить как нового игрока».
    var existing = rgFindLocalMatch(r);
    if (existing) {
        rgUpdateHcpOf(existing.id, r);
        return;
    }

    var created = rgCreateNewPlayerFromAgr(r);
    toast('🎉 ' + (currentLang === 'en' ? 'Player ' : 'Игрок ') + created.name + (currentLang === 'en' ? ' added (HCP ' : ' добавлен (HCP ') + fmtExactHcp(r.hcp) + ')', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    rgRenderResults(rgLastResults);
}

// Обновляет HCP конкретного СУЩЕСТВУЮЩЕГО игрока, выбранного из совпадений
function rgUpdateLocalFromResults(idx, userId) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgLastResults[idx];
    if (!r || r.hcp == null || !userId) return;
    rgUpdateHcpOf(userId, r);
}

// Добавляет игрока как НОВОГО, даже если похожие записи уже есть на сайте
function rgAddAsNewFromResults(idx) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgLastResults[idx];
    if (!r) return;
    if (r.hcp == null) {
        toast(currentLang === 'en' ? '⚠ This player has no HI in the RGA base' : '⚠ У этого игрока нет HI в базе АГР', 'error');
        return;
    }
    var created = rgCreateNewPlayerFromAgr(r);
    toast('🎉 ' + (currentLang === 'en' ? 'Player ' : 'Игрок ') + created.name + (currentLang === 'en' ? ' added as NEW (HCP ' : ' добавлен как новый (HCP ') + fmtExactHcp(r.hcp) + ')', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    rgRenderResults(rgLastResults);
}

function rgUpdateHcpOf(userId, r, playerData) {
    var localData = playerData || (typeof cachedRegisteredUsers !== 'undefined' ? cachedRegisteredUsers[userId] : null) || {};
    toast('🔄 ' + (currentLang === 'en' ? 'HCP updated: ' : 'Гандикап обновлён: ') + (r.fio || localData.name || '') + ' → ' + fmtExactHcp(r.hcp), 'success');
    rgPropagateHcpEverywhere(userId, r, localData).then(function() {
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();
    }).catch(function(err) {
        toast('⚠️ ' + (currentLang === 'en' ? 'Save error: ' : 'Ошибка сохранения: ') + (err && err.message ? err.message : err), 'error');
    });
    if (rgLastResults && rgLastResults.length) rgRenderResults(rgLastResults);
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
        ' · <span style="color:#2ecc71;">' + (currentLang === 'en' ? 'updated ' : 'обновлено ') + (stats.updatedList ? stats.updatedList.length : stats.updated) + '</span>' +
        ' · <span style="color:var(--muted);">' + (currentLang === 'en' ? 'actual ' : 'актуально ') + (stats.actualList ? stats.actualList.length : stats.actual) + '</span>' +
        ' · <span style="color:var(--gold);">' + (currentLang === 'en' ? 'need choice ' : 'выбор ') + stats.conflicts.length + '</span>' +
        ' · <span style="color:var(--red);">' + (currentLang === 'en' ? 'not found ' : 'не найдено ') + (stats.notFoundList ? stats.notFoundList.length : stats.notFound) + '</span>' +
        (stats.noHcpList && stats.noHcpList.length ? ' · <span style="color:var(--muted);">' + (currentLang === 'en' ? 'no HI ' : 'нет HI ') + stats.noHcpList.length + '</span>' : '') +
        '</div>';
    html += '</div>';
    return html;
}

function rgPlayerDisplayName(p) {
    if (!p) return '—';
    var u = p.data || {};
    return u.name || ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || p.id || '—';
}

function rgGetFioKey(u) {
    if (!u) return '';
    var fn = (u.firstName || '').toString().trim();
    var mn = (u.middleName || '').toString().trim();
    var ln = (u.lastName || '').toString().trim();
    var name = (u.name || '').toString().trim();
    var combined = (fn + ' ' + mn + ' ' + ln).replace(/\s+/g, ' ').trim() || name;
    return impNormName(combined);
}

function rgFindDuplicateGroups(allPlayers) {
    var groups = {};
    (allPlayers || []).forEach(function(p) {
        var u = p.data || {};
        var key = rgGetFioKey(u);
        if (!key) return;
        if (!groups[key]) groups[key] = { key: key, displayName: rgPlayerDisplayName(p), players: [] };
        groups[key].players.push(p);
    });
    var result = [];
    Object.keys(groups).forEach(function(k) {
        var g = groups[k];
        if (g.players.length > 1) {
            result.push(g);
        }
    });
    return result;
}

function rgRenderDuplicateGroups(groups) {
    if (!groups || !groups.length) return '';
    var en = currentLang === 'en';
    var html = '<div class="card" style="border:2px solid var(--red);background:rgba(224,90,74,0.08);margin-top:18px;">';
    html += '<h3 style="color:var(--red);font-size:15px;margin-bottom:10px;"><i class="fas fa-clone"></i> ' + (en ? 'Duplicate names - choose handicap' : 'Одинаковые ФИО - выберите гандикап') + ' (' + groups.length + ')</h3>';
    html += '<p style="color:var(--muted);font-size:12px;margin-bottom:14px;">' + (en ? 'Same first/last/middle names with different handicaps were found. Use "Change handicap" to set correct HCP for each, or delete extra duplicates.' : 'Найдены игроки с одинаковыми именем, фамилией и отчеством, но разными гандикапами. Используйте "Изменить гандикап" чтобы указать у кого какой HCP, или удалите лишние дубликаты.') + '</p>';
    groups.forEach(function(g, gi) {
        html += '<div style="margin-bottom:16px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;">';
        html += '<div style="font-weight:800;color:var(--white);margin-bottom:8px;">' + escapeHtml(g.displayName) + ' <span style="color:var(--muted);font-weight:400;">(' + g.players.length + ')</span></div>';
        g.players.forEach(function(pl, pi) {
            var u = pl.data || {};
            var curHcp = u.handicap != null ? fmtExactHcp(u.handicap) : '—';
            var safeId = String(pl.id).replace(/'/g, "\\'");
            var inputId = 'rg-dup-hcp-' + gi + '-' + pi;
            html += '<div class="list-item" style="padding:10px;gap:10px;flex-wrap:wrap;">';
            html += '<div style="flex:1;min-width:160px;"><strong style="color:var(--gold);">' + escapeHtml(rgPlayerDisplayName(pl)) + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);">ID: ' + escapeHtml(pl.id) + (u.isGuest ? ' · ' + (en ? 'Guest' : 'Гость') : '') + (u.rusgolfNumber ? ' · 💳 ' + escapeHtml(u.rusgolfNumber) : '') + '</div></div>';
            html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
            html += '<span style="font-size:12px;color:var(--muted);">' + (en ? 'Current HCP' : 'Текущий HCP') + ': <b>' + curHcp + '</b></span>';
            html += '<input type="text" id="' + inputId + '" class="form-input" style="width:90px;padding:6px 8px;font-size:13px;" placeholder="' + curHcp + '" value="' + (u.handicap!=null? String(u.handicap).replace('+','') : '') + '">';
            html += '<button class="btn btn-g btn-sm" onclick="rgChangeDuplicateHcp(\'' + safeId + '\', \'' + inputId + '\')"><i class="fas fa-rotate"></i> ' + (en ? 'Change HCP' : 'Изменить гандикап') + '</button>';
            html += '<button class="btn btn-r btn-sm" onclick="deletePlayer(\'' + safeId + '\', \'' + escapeHtml(u.name||'').replace(/'/g, "\\'") + '\')"><i class="fas fa-trash"></i></button>';
            html += '</div></div>';
        });
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function rgChangeDuplicateHcp(userId, inputId) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var inp = document.getElementById(inputId);
    if (!inp) return;
    var raw = inp.value.trim();
    if (!raw) {
        toast(currentLang === 'en' ? '⚠ Enter new HCP' : '⚠ Введите новый HCP', 'error');
        return;
    }
    var parsed = (typeof impParseHcpStrict === 'function') ? impParseHcpStrict(raw) : null;
    var newHcp;
    if (parsed && parsed.val != null) newHcp = parsed.val;
    else newHcp = (typeof parseExactHcp === 'function') ? parseExactHcp(raw) : parseFloat(raw);
    if (newHcp == null || isNaN(newHcp)) {
        toast(currentLang === 'en' ? '⚠ Invalid HCP' : '⚠ Некорректный HCP', 'error');
        return;
    }
    if (typeof db === 'undefined') {
        if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[userId]) {
            cachedRegisteredUsers[userId].handicap = newHcp;
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch(e){}
        }
        toast('✅ HCP ' + fmtExactHcp(newHcp) + ' ' + (currentLang === 'en' ? 'set for ' : 'установлен для ') + userId, 'success');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        return;
    }
    db.ref('users/' + userId).update({ handicap: newHcp, hcpUpdatedAt: Date.now(), hcpSource: 'manual' }).then(function(){
        return db.ref('rounds').once('value');
    }).then(function(sn){
        var rounds = sn.val() || {};
        var updates = {};
        Object.keys(rounds).forEach(function(rid){
            var rd = rounds[rid];
            if (!rd || !rd.players || !rd.players[userId]) return;
            var tee = rd.players[userId].tee || rd.tee || 'wh';
            var g = rd.players[userId].gender || 'men';
            var fieldHcp = (typeof getFieldHcp === 'function') ? getFieldHcp(newHcp, tee, g) : Math.round(newHcp);
            updates['rounds/' + rid + '/players/' + userId + '/exactHcp'] = newHcp;
            updates['rounds/' + rid + '/players/' + userId + '/fieldHcp'] = fieldHcp;
        });
        if (Object.keys(updates).length) return db.ref().update(updates);
    }).then(function(){
        toast('✅ HCP ' + fmtExactHcp(newHcp) + ' ' + (currentLang === 'en' ? 'updated for ' : 'обновлён у ') + userId, 'success');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        impCollectPlayers(function(all){
            var dups = rgFindDuplicateGroups(all);
            var el = document.getElementById('rg-sync-manual');
            if (el && dups.length) {
                var existing = document.getElementById('rg-duplicates-block');
                var html = '<div id="rg-duplicates-block">' + rgRenderDuplicateGroups(dups) + '</div>';
                if (existing) existing.outerHTML = html;
                else el.insertAdjacentHTML('beforeend', html);
            }
        });
    }).catch(function(err){
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}



function rgSyncResultListsHtml(stats) {
    var en = currentLang === 'en';
    var sections = [
        { key: 'updatedList', title: en ? 'Updated' : 'Обновлено', color: '#2ecc71', icon: 'fa-rotate', empty: en ? 'No updates' : 'Нет обновлений',
          row: function(item) {
              return escapeHtml(item.name) + ' · HCP ' +
                  (item.oldHcp != null ? fmtExactHcp(item.oldHcp) : '—') + ' → <b>' + fmtExactHcp(item.newHcp) + '</b>' +
                  (item.rusgolfNumber ? ' <span class="rg-meta">💳 ' + escapeHtml(item.rusgolfNumber) + '</span>' : '');
          }
        },
        { key: 'actualList', title: en ? 'Already up to date' : 'Уже актуально', color: 'var(--muted)', icon: 'fa-check', empty: en ? 'None' : 'Нет',
          row: function(item) {
              return escapeHtml(item.name) + ' · HCP <b>' + (item.hcp != null ? fmtExactHcp(item.hcp) : '—') + '</b>';
          }
        },
        { key: 'notFoundList', title: en ? 'Not found in RGA' : 'Не найдено в базе АГР', color: 'var(--red)', icon: 'fa-circle-xmark', empty: en ? 'All found' : 'Все найдены',
          row: function(item) {
              return escapeHtml(item.name) + (item.query ? ' <span class="rg-meta">«' + escapeHtml(item.query) + '»</span>' : '');
          }
        },
        { key: 'noHcpList', title: en ? 'Found but no HI' : 'Найден, но нет HI', color: 'var(--gold)', icon: 'fa-triangle-exclamation', empty: '',
          row: function(item) {
              return escapeHtml(item.name) + (item.fio ? ' → ' + escapeHtml(item.fio) : '');
          }
        }
    ];
    var html = '<div class="rg-sync-results" style="margin-top:16px;">';
    sections.forEach(function(sec) {
        var list = stats[sec.key] || [];
        if (!list.length && sec.key === 'noHcpList') return;
        html += '<div class="rg-sync-section" style="margin-bottom:14px;">';
        html += '<div style="font-weight:800;font-size:14px;color:' + sec.color + ';margin-bottom:8px;"><i class="fas ' + sec.icon + '"></i> ' +
            sec.title + ' <span style="opacity:.8;">(' + list.length + ')</span></div>';
        if (!list.length) {
            html += '<p style="color:var(--muted);font-size:12px;margin:0 0 8px;">' + sec.empty + '</p>';
        } else {
            html += '<div class="rg-sync-list">';
            list.forEach(function(item) {
                html += '<div class="rg-sync-row" style="padding:8px 12px;border:1px solid var(--border);border-left:3px solid ' + sec.color +
                    ';border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,0.03);font-size:13px;color:var(--white);">' +
                    sec.row(item) + '</div>';
            });
            html += '</div>';
        }
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function rgBuildSearchQuery(u) {
    var local = rgLocalNameParts(u);
    var rawName = String(u.name || '').replace(/\s+/g, ' ').trim();
    var rawFirst = String(u.firstName || '').trim();
    var rawLast = String(u.lastName || '').trim();
    // АГР ищет лучше по «Фамилия Имя»
    if (rawLast && rawFirst) return rawLast + ' ' + rawFirst;
    if (local.last && local.first) {
        // Если name = «Имя Фамилия» (как в solo: lastName + ' ' + firstName наоборот),
        // last/first из полей надёжнее. Иначе берём name as-is.
        return (rawLast || local.last) + ' ' + (rawFirst || local.first);
    }
    if (rawName) {
        var parts = rawName.split(' ');
        // Пробуем оба порядка: если 2+ слова, ищем как есть (часто «Фамилия Имя» в solo)
        return rawName;
    }
    return rawLast || rawFirst || '';
}

function rgClassifyRemoteMatches(u, rows) {
    var local = rgLocalNameParts(u);
    var strong = [];
    var loose = [];
    (rows || []).forEach(function(r) {
        var m = rgNamesMatch(local.first, local.last, r.firstName, r.lastName, local.full, r.fio);
        if (m === 'strong') strong.push(r);
        else if (m === 'loose') loose.push(r);
    });
    // Дедуп по номеру карты
    var dedupe = function(arr) {
        var seen = {};
        return arr.filter(function(r) {
            var k = (r.number || '') + '|' + impNormName(r.fio);
            if (seen[k]) return false;
            seen[k] = true;
            return true;
        });
    };
    return { strong: dedupe(strong), loose: dedupe(loose) };
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
        : 'Проверить гандикап каждого игрока в базе АГР? При большом списке это может занять несколько минут.')) return;

    impCollectPlayers(function(players) {
        // Дедуп по ФИО (имя + отчество + фамилия), без учета HCP — чтобы не было сдваивания
        var seenNames = {};
        var list = [];
        players.forEach(function(p) {
            if (!p.data || !(p.data.name || p.data.firstName || p.data.lastName)) return;
            var key = rgGetFioKey(p.data) || impNormName(p.data.name || ((p.data.firstName || '') + ' ' + (p.data.lastName || '')));
            if (key && seenNames[key]) {
                var prev = seenNames[key];
                var preferNew = (!p.data.isGuest && prev.data.isGuest) || (p.data.email && !prev.data.email);
                if (preferNew) {
                    list[prev.idx] = p;
                    seenNames[key] = { idx: prev.idx, data: p.data };
                }
                return;
            }
            if (key) seenNames[key] = { idx: list.length, data: p.data };
            list.push(p);
        });

        if (!list.length) {
            toast(currentLang === 'en' ? 'No players found' : 'Игроки не найдены', 'error');
            return;
        }

        rgSyncState = {
            running: true,
            stop: false,
            stats: {
                updated: 0,
                actual: 0,
                notFound: 0,
                noHcp: 0,
                conflicts: [],
                updatedList: [],
                actualList: [],
                notFoundList: [],
                noHcpList: []
            }
        };
        var stats = rgSyncState.stats;
        rgSyncConflictsRef = stats.conflicts;
        var progressEl = document.getElementById('rg-sync-progress');
        var manualEl = document.getElementById('rg-sync-manual');
        var resultsEl = document.getElementById('rg-sync-results');
        var syncBtn = document.getElementById('rg-sync-btn');
        var stopBtn = document.getElementById('rg-sync-stop');
        if (progressEl) progressEl.innerHTML = rgSyncProgressHtml(0, list.length, stats);
        if (manualEl) manualEl.innerHTML = '';
        if (resultsEl) resultsEl.innerHTML = '';
        if (syncBtn) syncBtn.disabled = true;
        if (stopBtn) stopBtn.classList.remove('hidden');

        var i = 0;
        var processed = 0;

        var refreshProgress = function() {
            if (!progressEl) return;
            var fill = progressEl.querySelector('.rg-progress-fill');
            if (fill) fill.style.width = Math.round((processed / list.length) * 100) + '%';
            var text = progressEl.querySelector('.rg-progress-text');
            if (text) {
                text.innerHTML = (currentLang === 'en' ? 'Processed ' : 'Обработано ') + processed + '/' + list.length +
                    ' · <span style="color:#2ecc71;">' + (currentLang === 'en' ? 'updated ' : 'обновлено ') + stats.updatedList.length + '</span>' +
                    ' · <span style="color:var(--muted);">' + (currentLang === 'en' ? 'actual ' : 'актуально ') + stats.actualList.length + '</span>' +
                    ' · <span style="color:var(--gold);">' + (currentLang === 'en' ? 'need choice ' : 'выбор ') + stats.conflicts.length + '</span>' +
                    ' · <span style="color:var(--red);">' + (currentLang === 'en' ? 'not found ' : 'не найдено ') + stats.notFoundList.length + '</span>';
            }
        };

        var renderConflicts = function() {
            if (!manualEl) return;
            if (!stats.conflicts.length) {
                if (!rgSyncState.running) return;
                return;
            }
            var html = '<h3 style="color:var(--gold);font-size:15px;margin:18px 0 10px;"><i class="fas fa-user-pen"></i> ' +
                (currentLang === 'en' ? 'Choose the right player (' : 'Выберите нужного игрока (') + stats.conflicts.length + ')</h3>';
            html += '<p style="color:var(--muted);font-size:12px;margin-bottom:12px;">' +
                (currentLang === 'en'
                    ? 'Several matches found — choose: update an existing player (which one) or add a new one.'
                    : 'Найдено несколько совпадений — выберите: обновить существующего игрока (какого именно) или добавить нового.') + '</p>';
            stats.conflicts.forEach(function(c, ci) {
                if (c.resolved) {
                    var resolvedNote = c.addedNew
                        ? (currentLang === 'en' ? ' — added as NEW player' : ' — добавлен как новый игрок')
                        : (c.resolvedHcp != null ? ' → HCP ' + fmtExactHcp(c.resolvedHcp) : '');
                    html += '<div class="rg-conflict" data-conflict-idx="' + ci + '"><div style="color:#2ecc71;font-weight:700;font-size:13px;padding:8px 0;"><i class="fas fa-check-circle"></i> ' +
                        escapeHtml(rgPlayerDisplayName(c.player)) + resolvedNote + '</div></div>';
                    return;
                }
                html += '<div class="rg-conflict" data-conflict-idx="' + ci + '">';
                html += '<div class="rg-conflict-title">' + escapeHtml(rgPlayerDisplayName(c.player)) +
                    ' <span class="rg-conflict-hcp">' + (c.player.data.handicap != null ? (currentLang === 'en' ? 'current HCP ' : 'текущий HCP ') + fmtExactHcp(c.player.data.handicap) : (currentLang === 'en' ? 'no HCP' : 'без HCP')) + '</span></div>';
                // 1) Несколько записей в базе АГР — выбрать, какая из них
                (c.candidates || []).forEach(function(r, ri) {
                    html += '<div class="rg-cand">';
                    html += '<div class="rg-cand-info"><b>' + escapeHtml(r.fio) + '</b><span class="rg-meta">💳 ' + escapeHtml(r.number) + ' · ' + (r.gender === 'women' ? 'Жен.' : 'Муж.') + (r.hcpDate ? ' · ' + escapeHtml(r.hcpDate) : '') + '</span></div>';
                    html += '<div class="rg-hcp">' + (r.hcp != null ? fmtExactHcp(r.hcp) : '—') + '<span class="rg-hcp-label">HI</span></div>';
                    html += '<button type="button" class="btn btn-g btn-sm" ' + (r.hcp == null ? 'disabled' : '') + ' onclick="rgResolveConflict(' + ci + ',' + ri + ')"><i class="fas fa-check"></i> ' + (currentLang === 'en' ? 'This one' : 'Это он') + '</button>';
                    html += '</div>';
                });
                // 2) Несколько ЛОКАЛЬНЫХ игроков с таким именем — выбрать, кого обновить
                (c.localCandidates || []).forEach(function(lc, li) {
                    html += '<div class="rg-cand" style="border-left:3px solid var(--gold);">';
                    html += '<div class="rg-cand-info"><b>' + escapeHtml(rgPlayerDisplayName(lc)) + '</b><span class="rg-meta">' + (currentLang === 'en' ? 'on site' : 'на сайте') + (lc.data.rusgolfNumber ? ' · 💳 ' + escapeHtml(lc.data.rusgolfNumber) : '') + (lc.data.isGuest || String(lc.id).indexOf('guest_') === 0 ? ' · ' + t('guest') : '') + '</span></div>';
                    html += '<div class="rg-hcp">' + (lc.data.handicap != null ? fmtExactHcp(lc.data.handicap) : '—') + '<span class="rg-hcp-label">HCP</span></div>';
                    html += '<button type="button" class="btn btn-g btn-sm" onclick="rgResolveLocalConflict(' + ci + ',' + li + ')"><i class="fas fa-rotate"></i> ' + (currentLang === 'en' ? 'Update this one' : 'Обновить этого') + '</button>';
                    html += '</div>';
                });
                // 3) Добавить как НОВОГО игрока (по найденной записи АГР)
                var remoteForNew = c.remote || (c.candidates || []).filter(function(x) { return x.hcp != null; })[0];
                if (remoteForNew && remoteForNew.hcp != null) {
                    html += '<div class="rg-cand" style="border-left:3px solid #2ecc71;">';
                    html += '<div class="rg-cand-info"><b>' + (currentLang === 'en' ? 'Add as a NEW player' : 'Добавить как нового игрока') + '</b><span class="rg-meta">' + escapeHtml(remoteForNew.fio || '') + (remoteForNew.number ? ' · 💳 ' + escapeHtml(remoteForNew.number) : '') + '</span></div>';
                    html += '<div class="rg-hcp">' + fmtExactHcp(remoteForNew.hcp) + '<span class="rg-hcp-label">HI</span></div>';
                    html += '<button type="button" class="btn btn-g btn-sm" onclick="rgResolveAddNew(' + ci + ')"><i class="fas fa-user-plus"></i> ' + (currentLang === 'en' ? 'Add new' : 'Добавить нового') + '</button>';
                    html += '</div>';
                }
                html += '</div>';
            });
            manualEl.innerHTML = html;
        };

        var finishAll = function() {
            rgSyncState.running = false;
            if (syncBtn) syncBtn.disabled = false;
            if (stopBtn) stopBtn.classList.add('hidden');
            renderConflicts();
            stats.updated = stats.updatedList.length;
            stats.actual = stats.actualList.length;
            stats.notFound = stats.notFoundList.length;
            stats.noHcp = stats.noHcpList.length;

            var listsHtml = rgSyncResultListsHtml(stats);
            // После синхронизации проверяем дубликаты по ФИО и предлагаем выбрать гандикап
            (function(statsCopy, listsHtmlCopy, progressElCopy, resultsElCopy) {
                impCollectPlayers(function(allPlayers) {
                    var dupGroups = rgFindDuplicateGroups(allPlayers);
                    var dupHtml = rgRenderDuplicateGroups(dupGroups);
                    if (resultsElCopy) {
                        resultsElCopy.innerHTML = listsHtmlCopy + dupHtml;
                    } else if (progressElCopy) {
                        progressElCopy.insertAdjacentHTML('beforeend', listsHtmlCopy + dupHtml);
                    }
                    if (dupGroups.length) {
                        var manualEl = document.getElementById('rg-sync-manual');
                        if (manualEl) {
                            if (!document.getElementById('rg-duplicates-block')) {
                                manualEl.insertAdjacentHTML('beforeend', '<div id="rg-duplicates-block">' + dupHtml + '</div>');
                            }
                        }
                    }
                });
            })(stats, listsHtml, progressEl, resultsEl);

            var msg = (currentLang === 'en' ? '✅ Sync finished: ' : '✅ Синхронизация завершена: ') +
                (currentLang === 'en' ? stats.updated + ' updated, ' : stats.updated + ' обновлено, ') +
                (currentLang === 'en' ? stats.actual + ' up to date, ' : stats.actual + ' актуально, ') +
                (currentLang === 'en' ? stats.conflicts.filter(function(c){return !c.resolved;}).length + ' to choose, ' : stats.conflicts.filter(function(c){return !c.resolved;}).length + ' на выбор, ') +
                (currentLang === 'en' ? stats.notFound + ' not found' : stats.notFound + ' не найдено');
            toast(msg, 'success');
            if (progressEl) progressEl.insertAdjacentHTML('beforeend', '<p style="font-size:13px;font-weight:700;color:var(--gold);margin-top:8px;">' + msg + '</p>');
            if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
            if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();
        };

        var processNext = function() {
            if (rgSyncState.stop || i >= list.length) { finishAll(); return; }
            var p = list[i++];
            var u = p.data || {};
            var displayName = rgPlayerDisplayName(p);
            var query = rgBuildSearchQuery(u);
            // Если имя в порядке «Имя Фамилия», дополнительно пробуем reverse-query при пустом результате
            var altQuery = '';
            var local = rgLocalNameParts(u);
            if (local.first && local.last) {
                var primaryIsLastFirst = impNormName(query).indexOf(local.last) === 0;
                if (primaryIsLastFirst) {
                    altQuery = (u.firstName || local.first) + ' ' + (u.lastName || local.last);
                } else {
                    altQuery = (u.lastName || local.last) + ' ' + (u.firstName || local.first);
                }
                if (impNormName(altQuery) === impNormName(query)) altQuery = '';
            }

            var tryFetch = function(q, allowAlt) {
                return rgFetchViaProxy(q).then(function(res) {
                    var classified = rgClassifyRemoteMatches(u, res.rows);
                    if (!classified.strong.length && !classified.loose.length && allowAlt && altQuery) {
                        return tryFetch(altQuery, false);
                    }
                    return { res: res, classified: classified, usedQuery: q };
                });
            };

            // Применить найденную в АГР запись к локальному игроку.
            // ВАЖНО: если на сайте НЕСКОЛЬКО игроков с таким именем (обычно
            // с разными гандикапами) — не угадываем, а показываем выбор:
            // обновить существующего (какого именно) или добавить нового.
            var applyRemote = function(remoteRec) {
                var localMatches = rgFindLocalMatchesInList(players, remoteRec);
                if (localMatches.length > 1) {
                    stats.conflicts.push({ player: p, candidates: [], localCandidates: localMatches, remote: remoteRec });
                    renderConflicts();
                    return;
                }
                var target = localMatches.length ? localMatches[0] : p;
                var curHcp = (target.data.handicap != null && !isNaN(parseFloat(target.data.handicap))) ? parseFloat(target.data.handicap) : null;
                if (curHcp === null || Math.abs(curHcp - remoteRec.hcp) > 0.049) {
                    rgUpdateHcpOf(target.id, remoteRec, target.data);
                    stats.updatedList.push({
                        id: target.id,
                        name: rgPlayerDisplayName(target),
                        oldHcp: curHcp,
                        newHcp: remoteRec.hcp,
                        rusgolfNumber: remoteRec.number,
                        fio: remoteRec.fio
                    });
                    // Обновляем локальную копию, чтобы дедуп/последующие шаги видели новый HCP
                    if (target === p) u.handicap = remoteRec.hcp;
                } else {
                    stats.actualList.push({ id: target.id, name: rgPlayerDisplayName(target), hcp: curHcp, fio: remoteRec.fio });
                }
            };

            tryFetch(query || displayName, true).then(function(pack) {
                var strong = pack.classified.strong;
                var loose = pack.classified.loose;
                var usedQuery = pack.usedQuery;

                if (strong.length === 1 && strong[0].hcp != null) {
                    applyRemote(strong[0]);
                } else if (strong.length === 1 && strong[0].hcp == null) {
                    stats.noHcpList.push({ id: p.id, name: displayName, fio: strong[0].fio, number: strong[0].number });
                } else if (strong.length > 1) {
                    stats.conflicts.push({ player: p, candidates: strong, localCandidates: null, remote: null });
                    renderConflicts();
                } else if (loose.length === 1 && loose[0].hcp != null && local.first && local.last) {
                    // Одно нечёткое совпадение при полном ФИО — тоже обновляем
                    applyRemote(loose[0]);
                } else if (loose.length) {
                    stats.conflicts.push({ player: p, candidates: loose, localCandidates: null, remote: null });
                    renderConflicts();
                } else {
                    stats.notFoundList.push({ id: p.id, name: displayName, query: usedQuery });
                }
            }).catch(function() {
                stats.notFoundList.push({ id: p.id, name: displayName, query: query || displayName });
            }).then(function() {
                processed++;
                refreshProgress();
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
    rgUpdateHcpOf(c.player.id, r, c.player.data);
    c.resolved = true;
    c.resolvedHcp = r.hcp;
    if (rgSyncState && rgSyncState.stats && rgSyncState.stats.updatedList) {
        var oldHcp = c.player.data && c.player.data.handicap != null ? parseFloat(c.player.data.handicap) : null;
        rgSyncState.stats.updatedList.push({
            id: c.player.id,
            name: rgPlayerDisplayName(c.player),
            oldHcp: oldHcp,
            newHcp: r.hcp,
            rusgolfNumber: r.number,
            fio: r.fio
        });
    }
    var manualEl = document.getElementById('rg-sync-manual');
    var card = manualEl ? manualEl.querySelector('[data-conflict-idx="' + ci + '"]') : null;
    if (card) {
        card.innerHTML = '<div style="color:#2ecc71;font-weight:700;font-size:13px;padding:8px 0;"><i class="fas fa-check-circle"></i> ' +
            escapeHtml(rgPlayerDisplayName(c.player)) + ' → HCP ' + fmtExactHcp(r.hcp) + '</div>';
    }
}

// Конфликт «на сайте несколько игроков с одним именем»: выбрать, кого обновить
function rgResolveLocalConflict(ci, li) {
    var c = rgSyncConflictsRef[ci];
    if (!c || !rgIsAdmin()) return;
    var localCands = c.localCandidates || [];
    var lc = localCands[li];
    var remote = c.remote || (c.candidates && c.candidates[0]);
    if (!lc || !remote || remote.hcp == null) return;

    rgUpdateHcpOf(lc.id, remote, lc.data);
    c.resolved = true;
    c.resolvedHcp = remote.hcp;
    c.resolvedLocalId = lc.id;
    if (rgSyncState && rgSyncState.stats && rgSyncState.stats.updatedList) {
        var oldHcp = lc.data && lc.data.handicap != null ? parseFloat(lc.data.handicap) : null;
        rgSyncState.stats.updatedList.push({
            id: lc.id,
            name: rgPlayerDisplayName(lc),
            oldHcp: oldHcp,
            newHcp: remote.hcp,
            rusgolfNumber: remote.number,
            fio: remote.fio
        });
    }
    var manualEl = document.getElementById('rg-sync-manual');
    var card = manualEl ? manualEl.querySelector('[data-conflict-idx="' + ci + '"]') : null;
    if (card) {
        card.innerHTML = '<div style="color:#2ecc71;font-weight:700;font-size:13px;padding:8px 0;"><i class="fas fa-check-circle"></i> ' +
            (currentLang === 'en' ? 'Updated: ' : 'Обновлено: ') + escapeHtml(rgPlayerDisplayName(lc)) + ' → HCP ' + fmtExactHcp(remote.hcp) + '</div>';
    }
}

// Конфликт: добавить игрока как НОВОГО (по выбранной записи АГР)
function rgResolveAddNew(ci) {
    var c = rgSyncConflictsRef[ci];
    if (!c || !rgIsAdmin()) return;
    var remote = c.remote || (c.candidates || []).filter(function(x) { return x.hcp != null; })[0];
    if (!remote || remote.hcp == null) return;

    rgCreateNewPlayerFromAgr(remote);
    c.resolved = true;
    c.resolvedHcp = remote.hcp;
    c.addedNew = true;
    var msgNew = (currentLang === 'en' ? 'Added as new player: ' : 'Добавлен как новый игрок: ') + (remote.fio || '');
    if (typeof toast === 'function') toast('🎉 ' + msgNew + ' (HCP ' + fmtExactHcp(remote.hcp) + ')', 'success');
    var manualEl = document.getElementById('rg-sync-manual');
    var card = manualEl ? manualEl.querySelector('[data-conflict-idx="' + ci + '"]') : null;
    if (card) {
        card.innerHTML = '<div style="color:#2ecc71;font-weight:700;font-size:13px;padding:8px 0;"><i class="fas fa-check-circle"></i> ' +
            escapeHtml(rgPlayerDisplayName(c.player)) + ' — ' + (currentLang === 'en' ? 'added as NEW player' : 'добавлен как новый игрок') + ' (HCP ' + fmtExactHcp(remote.hcp) + ')</div>';
    }
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();
}

// -------- МАССОВАЯ ПРОВЕРКА ГАНДИКАПА ИЗ EXCEL ---------

// Каждая строка файла: { idx, firstName, lastName, name, query, proxy, error, done, results: [ {number,fio,...}, ... ] }
var rgBatchRows = [];
var rgBatchState = { running: false, stop: false };

function rgBatchHeaderKey(raw) {
    var s = impNormName(raw).replace(/[.:]/g, '');
    if (['имя', 'first name', 'firstname', 'first_name', 'given name'].indexOf(s) !== -1) return 'firstName';
    if (['фамилия', 'last name', 'lastname', 'last_name', 'surname', 'family name'].indexOf(s) !== -1) return 'lastName';
    if (['фио', 'имя фамилия', 'full name', 'фамилия имя отчество', 'игрок', 'player'].indexOf(s) !== -1) return 'fio';
    return null;
}

function rgBatchDownloadTemplate() {
    if (typeof XLSX === 'undefined') {
        toast(currentLang === 'en' ? '❌ Excel library not loaded (check internet)' : '❌ Библиотека Excel не загрузилась (проверьте интернет)', 'error');
        return;
    }
    var rows = [
        ['Имя', 'Фамилия'],
        ['Иван', 'Тестов'],
        ['Мария', 'Тестова']
    ];
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 28 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Игроки');
    XLSX.writeFile(wb, 'Shablon_Proverki_AGR.xlsx');
    toast('📋 ' + (currentLang === 'en' ? 'Template downloaded' : 'Шаблон скачан'), 'success');
}

function rgBatchParseRows(jsonRows) {
    var keys = {};
    var rows = [];
    if (jsonRows.length) {
        Object.keys(jsonRows[0]).forEach(function(h) {
            var k = rgBatchHeaderKey(h);
            if (k && !keys[k]) keys[k] = h;
        });
    }
    jsonRows.forEach(function(r, i) {
        var firstName = '', lastName = '', fio = '';
        if (keys.firstName) firstName = String(r[keys.firstName] || '').trim();
        if (keys.lastName) lastName = String(r[keys.lastName] || '').trim();
        if (keys.fio) fio = String(r[keys.fio] || '').trim();

        if ((!firstName || !lastName) && fio) {
            var fioParts = fio.split(/\s+/).filter(Boolean);
            if (!lastName) lastName = fioParts[0] || '';
            if (!firstName) firstName = fioParts.slice(1).join(' ') || '';
        }
        if (!firstName && lastName) { var s = impSplitName(lastName); firstName = s.firstName; lastName = s.lastName; }
        if (!lastName && firstName) { var s2 = impSplitName(firstName); firstName = s2.firstName; lastName = s2.lastName; }

        var name = (firstName + ' ' + lastName).replace(/\s+/g, ' ').trim();
        if (!name) return;
        rows.push({ idx: i, firstName: firstName, lastName: lastName, name: name });
    });
    // Дедуп по нормализованному имени
    var seen = {};
    return rows.filter(function(r) {
        var k = impNormName(r.name);
        if (seen[k]) return false;
        seen[k] = true;
        return true;
    });
}

function rgBatchHandleFile(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var statusEl = document.getElementById('rg-batch-status');
    var resultsEl = document.getElementById('rg-batch-results');

    if (typeof XLSX === 'undefined') {
        toast(currentLang === 'en' ? '❌ Excel library not loaded (check internet)' : '❌ Библиотека Excel не загрузилась (проверьте интернет)', 'error');
        input.value = '';
        return;
    }
    if (rgBatchState.running) {
        toast(currentLang === 'en' ? '⚠ Wait for the current search to finish' : '⚠ Дождитесь окончания текущего поиска', 'error');
        input.value = '';
        return;
    }

    if (statusEl) statusEl.innerHTML = '<p style="color:var(--muted);font-size:13px;"><i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Reading file...' : 'Чтение файла...') + '</p>';
    if (resultsEl) resultsEl.innerHTML = '';

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            var sheet = wb.Sheets[wb.SheetNames[0]];
            if (!sheet) throw new Error(currentLang === 'en' ? 'no sheets' : 'нет листов в файле');
            var json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            var rows = rgBatchParseRows(json || []);
            if (!rows.length) {
                if (statusEl) statusEl.innerHTML = '<div class="imp-note imp-note-err"><i class="fas fa-triangle-exclamation"></i> ' +
                    (currentLang === 'en' ? 'No player rows found. Expected columns «Имя» and «Фамилия».' : 'Строки с игроками не найдены. Ожидаются столбцы «Имя» и «Фамилия».') + '</div>';
                return;
            }
            rgBatchStartSearch(rows);
        } catch (err) {
            console.warn('RGA batch parse error:', err);
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

function rgBatchBuildQueries(row) {
    var q = (row.lastName && row.firstName) ? (row.lastName + ' ' + row.firstName) : row.name;
    var alt = '';
    if (row.firstName && row.lastName) {
        alt = row.firstName + ' ' + row.lastName;
        if (impNormName(alt) === impNormName(q)) alt = '';
    }
    return { q: q, alt: alt };
}

function rgBatchStartSearch(rows) {
    rgBatchState = { running: true, stop: false };
    rgBatchRows = rows.map(function(r) {
        return { idx: r.idx, firstName: r.firstName, lastName: r.lastName, name: r.name, query: '', proxy: '', error: '', done: false, results: [] };
    });

    var statusEl = document.getElementById('rg-batch-status');
    var resultsEl = document.getElementById('rg-batch-results');
    if (statusEl) statusEl.innerHTML = '';
    rgBatchRender(0, rows.length);

    var processed = 0;
    var total = rows.length;

    var processNext = function() {
        if (rgBatchState.stop || processed >= total) {
            rgBatchState.running = false;
            rgBatchRender(processed, total);
            if (statusEl) {
                var found = rgBatchRows.filter(function(r) { return r.done && r.results.length; }).length;
                var notFound = rgBatchRows.filter(function(r) { return r.done && !r.results.length && !r.error; }).length;
                statusEl.innerHTML = '<div class="imp-note"><i class="fas fa-check"></i> ' +
                    (currentLang === 'en' ? 'Search finished. Found: <b>' : 'Поиск завершён. Найдено: <b>') + found + '</b>' +
                    (currentLang === 'en' ? ' · Not found: <b>' : ' · Не найдено: <b>') + notFound + '</b></div>';
            }
            return;
        }
        var row = rgBatchRows[processed];
        var queries = rgBatchBuildQueries(row);
        row.query = queries.q;

        var tryFetch = function(q, allowAlt) {
            return rgFetchViaProxy(q).then(function(res) {
                if (!res.rows.length && allowAlt && queries.alt) return tryFetch(queries.alt, false);
                return res;
            });
        };

        tryFetch(queries.q, true).then(function(res) {
            row.query = queries.q;
            row.results = res.rows;
            row.proxy = res.proxy;
            row.done = true;
        }).catch(function(err) {
            row.error = err && err.message ? err.message : String(err);
            row.done = true;
        }).then(function() {
            processed++;
            rgBatchRender(processed, total);
            setTimeout(processNext, 350);
        });
    };

    processNext();
}

function rgBatchRender(processed, total) {
    var resultsEl = document.getElementById('rg-batch-results');
    if (!resultsEl) return;

    impCollectPlayers(function(players) {
        var html = '';
        var pct = total ? Math.round((processed / total) * 100) : 0;
        var doneRows = rgBatchRows.filter(function(r) { return r.done; });
        var foundCount = doneRows.filter(function(r) { return r.results.length; }).length;

        html += '<div class="rg-progress-wrap" style="margin-top:14px;">' +
            '<div class="rg-progress"><div class="rg-progress-fill" style="width:' + pct + '%;"></div></div>' +
            '<div class="rg-progress-text">' + (currentLang === 'en' ? 'Processed ' : 'Обработано ') + processed + '/' + total +
            ' · <span style="color:#2ecc71;">' + (currentLang === 'en' ? 'found ' : 'найдено ') + foundCount + '</span></div></div>';

        // Toolbar: add selected + stop
        var selectable = rgBatchRows.some(function(r) { return r.results.some(function(x) { return x.hcp != null; }); });
        html += '<div class="rg-bulk-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:12px 0;padding:12px 14px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:12px;">';
        html += '<label class="list-item" style="cursor:pointer;padding:8px 14px;display:flex;align-items:center;gap:10px;margin:0;background:rgba(255,255,255,0.03);border-radius:10px;user-select:none;">' +
            '<input type="checkbox" id="rg-batch-check-all" onchange="rgBatchToggleAll(this)" style="width:20px;height:20px;cursor:pointer;">' +
            '<span style="font-weight:700;font-size:13px;color:var(--white);">' + (currentLang === 'en' ? 'Select all found' : 'Выбрать всех найденных') + '</span></label>';
        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
        html += '<button type="button" class="btn btn-g imp-big-btn" onclick="rgBatchAddSelected()" ' + (selectable ? '' : 'disabled') + ' style="min-height:42px;">' +
            '<i class="fas fa-users-plus"></i> <span>' + (currentLang === 'en' ? 'Add selected' : 'Добавить выбранных') + ' (<span id="rg-batch-bulk-count">0</span>)</span></button>';
        html += '<button type="button" class="btn btn-r imp-big-btn ' + (rgBatchState.running ? '' : 'hidden') + '" onclick="rgBatchStop()" style="min-height:42px;">' +
            '<i class="fas fa-stop"></i> <span>' + (currentLang === 'en' ? 'Stop' : 'Остановить') + '</span></button>';
        html += '</div></div>';

        html += '<div class="rg-list">';
        rgBatchRows.forEach(function(row, ri) {
            if (!row.done) {
                html += '<div class="rg-card" style="opacity:.55;">' +
                    '<div style="flex:1;min-width:0;"><div class="rg-name">' + escapeHtml(row.name) + '</div>' +
                    '<div class="rg-meta"><i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Searching...' : 'Поиск...') + '</div></div></div>';
                return;
            }
            var statusBadge;
            if (row.error) {
                statusBadge = '<span class="imp-badge imp-badge-err">⚠ ' + (currentLang === 'en' ? 'Error' : 'Ошибка') + '</span>';
            } else if (!row.results.length) {
                statusBadge = '<span class="imp-badge" style="background:rgba(224,90,74,0.15);color:var(--red);">' + (currentLang === 'en' ? 'Not found' : 'Не найдено') + '</span>';
            } else {
                statusBadge = '<span class="imp-badge imp-badge-new">' + (currentLang === 'en' ? 'Found ' : 'Найдено ') + row.results.length + '</span>';
            }
            html += '<div class="rg-card" style="flex-direction:column;align-items:stretch;gap:8px;">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
                '<div style="font-weight:800;font-size:15px;color:var(--white);">' + escapeHtml(row.name) + '</div>' + statusBadge + '</div>';
            if (row.error) {
                html += '<div class="rg-meta" style="color:var(--red);">' + escapeHtml(row.error) + '</div>';
            }
            if (row.query) {
                html += '<div class="rg-meta">' + (currentLang === 'en' ? 'Query: ' : 'Запрос: ') + '«' + escapeHtml(row.query) + '»</div>';
            }
            row.results.forEach(function(r, ii) {
                var dup = rgMatchInList(players, r);
                var genderIcon = r.gender === 'women' ? '👩' : '👨';
                var hcpVal = r.hcp != null ? fmtExactHcp(r.hcp) : r.hcpDisplay;
                var hcpChanged = dup && r.hcp != null && dup.data.handicap != null && Math.abs((parseFloat(dup.data.handicap) || 0) - r.hcp) > 0.049;
                var isDisabled = r.hcp == null;
                html += '<div style="display:flex;align-items:flex-start;gap:10px;border-top:1px solid var(--border);padding-top:10px;margin-top:2px;">';
                html += '<input type="checkbox" class="rg-batch-check" data-ri="' + ri + '" data-ii="' + ii + '" ' + (isDisabled ? 'disabled' : (r.selected ? 'checked' : '')) + ' onchange="rgBatchRowToggle(this)" style="width:20px;height:20px;cursor:pointer;margin-top:6px;flex-shrink:0;">';
                html += '<div style="flex:1;min-width:0;">';
                html += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;">';
                html += '<div class="rg-main" style="flex:1;min-width:160px;">';
                html += '<div class="rg-name">' + genderIcon + ' ' + escapeHtml(r.fio) + '</div>';
                html += '<div class="rg-meta">💳 ' + escapeHtml(r.number) + ' · ' + (r.gender === 'women' ? (currentLang === 'en' ? 'Female' : 'Жен.') : (currentLang === 'en' ? 'Male' : 'Муж.')) +
                    (r.hcpDate ? ' · ' + (currentLang === 'en' ? 'updated ' : 'обновлён ') + escapeHtml(r.hcpDate) : '') + '</div>';
                if (dup) html += '<div class="rg-meta" style="color:var(--gold);">' + (currentLang === 'en' ? 'Already on site' : 'Уже есть на сайте') + ': ' + escapeHtml(dup.data.name || dup.id) + '</div>';
                html += '</div>';
                html += '<div class="rg-hcp' + (hcpChanged ? ' rg-hcp-changed' : '') + '" style="flex-shrink:0;">' + escapeHtml(hcpVal) + '<span class="rg-hcp-label">HI</span></div>';
                html += '</div>';
                html += '<div class="rg-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">';
                if (r.hcp == null) {
                    html += '<span class="imp-badge imp-badge-err">⚠ ' + (currentLang === 'en' ? 'No HI in RGA base' : 'Нет HI в базе АГР') + '</span>';
                } else if (dup) {
                    html += '<button type="button" class="btn btn-og btn-sm" onclick="rgBatchUpdateOne(' + ri + ',' + ii + ')"><i class="fas fa-rotate"></i> ' +
                        (hcpChanged
                            ? (currentLang === 'en' ? 'Update HCP ' + fmtExactHcp(dup.data.handicap) + ' → ' + fmtExactHcp(r.hcp)
                                : 'Обновить HCP ' + fmtExactHcp(dup.data.handicap) + ' → ' + fmtExactHcp(r.hcp))
                            : (currentLang === 'en' ? 'HCP is up to date' : 'HCP актуален')) + '</button>';
                } else {
                    html += '<button type="button" class="btn btn-g btn-sm" onclick="rgBatchAddOne(' + ri + ',' + ii + ')"><i class="fas fa-plus"></i> ' +
                        (currentLang === 'en' ? 'Add to site' : 'Добавить на сайт') + '</button>';
                }
                html += '</div>';
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        });
        html += '</div>';
        resultsEl.innerHTML = html;
        rgBatchUpdateBulkCount();
    });
}

function rgBatchResult(ri, ii) {
    var row = rgBatchRows[ri];
    if (!row || !row.results[ii]) return null;
    return row.results[ii];
}

function rgBatchRowToggle(cb) {
    var ri = parseInt(cb.getAttribute('data-ri'));
    var ii = parseInt(cb.getAttribute('data-ii'));
    var r = rgBatchResult(ri, ii);
    if (r) r.selected = cb.checked;
    rgBatchUpdateBulkCount();
}

function rgBatchToggleAll(master) {
    document.querySelectorAll('.rg-batch-check:not(:disabled)').forEach(function(cb) {
        cb.checked = master.checked;
        var ri = parseInt(cb.getAttribute('data-ri'));
        var ii = parseInt(cb.getAttribute('data-ii'));
        var r = rgBatchResult(ri, ii);
        if (r) r.selected = master.checked;
    });
    rgBatchUpdateBulkCount();
}

function rgBatchUpdateBulkCount() {
    var checked = document.querySelectorAll('.rg-batch-check:checked');
    var label = document.getElementById('rg-batch-bulk-count');
    if (label) label.textContent = String(checked.length);
}

function rgBatchStop() {
    rgBatchState.stop = true;
    rgBatchState.running = false;
}

/** Добавляет одного игрока (или обновляет HCP, если он уже есть на сайте). */
function rgBatchAddResult(r) {
    if (!r || r.hcp == null) return;
    var existing = rgFindLocalMatch(r);
    if (existing) {
        rgUpdateHcpOfSilent(existing.id, r, existing.data);
        return;
    }
    rgCreateNewPlayerFromAgr(r);
}

function rgBatchAddOne(ri, ii) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgBatchResult(ri, ii);
    if (!r || r.hcp == null) return;
    rgBatchAddResult(r);
    toast('🎉 ' + (currentLang === 'en' ? 'Player ' : 'Игрок ') + r.fio + (currentLang === 'en' ? ' added (HCP ' : ' добавлен (HCP ') + fmtExactHcp(r.hcp) + ')', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    r.selected = false;
    rgBatchRender(rgBatchRows.filter(function(x) { return x.done; }).length, rgBatchRows.length);
}

function rgBatchUpdateOne(ri, ii) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgBatchResult(ri, ii);
    if (!r || r.hcp == null) return;
    var existing = rgFindLocalMatch(r);
    if (existing) {
        rgUpdateHcpOf(existing.id, r);
        r.selected = false;
        rgBatchRender(rgBatchRows.filter(function(x) { return x.done; }).length, rgBatchRows.length);
    }
}

function rgBatchAddSelected() {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var selected = [];
    rgBatchRows.forEach(function(row) {
        row.results.forEach(function(r) {
            if (r.selected && r.hcp != null) selected.push(r);
        });
    });
    if (!selected.length) {
        toast(currentLang === 'en' ? '⚠ Select at least one player' : '⚠ Выберите хотя бы одного игрока', 'error');
        return;
    }

    var added = 0, updated = 0;
    var seen = {};
    selected.forEach(function(r) {
        var uniqKey = (r.number || '') + '|' + impNormName(r.fio);
        if (seen[uniqKey]) return;
        seen[uniqKey] = true;
        var existing = rgFindLocalMatch(r);
        if (existing) {
            rgUpdateHcpOfSilent(existing.id, r, existing.data);
            updated++;
        } else {
            rgBatchAddResult(r);
            added++;
        }
        r.selected = false;
    });

    var msg = '✅ ' + (currentLang === 'en' ? 'Bulk add: ' : 'Массовое добавление: ') +
        added + ' ' + (currentLang === 'en' ? 'added' : 'добавлено') +
        ', ' + updated + ' ' + (currentLang === 'en' ? 'updated' : 'обновлено');
    toast(msg, 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();
    rgBatchRender(rgBatchRows.filter(function(x) { return x.done; }).length, rgBatchRows.length);
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
