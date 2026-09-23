var PESTOVO_TEMP_MASTER_PASSWORD = '55555';
var PESTOVO_TEMP_MASTER_PASSWORD_HASH = 'c507a68f3093e885765257ed3f176c757aaf62bb4cbc2ef94b2e7da3406d9676';
var PESTOVO_ADMIN_MASTER_HASH_KEY = 'pestovo_admin_master_hash';
var PESTOVO_ADMIN_ACCESS_REMEMBER_KEY = 'pestovo_admin_access_persist';

function safeStorageGet(storageObj, key) {
    try { return storageObj.getItem(key); } catch (e) { return null; }
}

function safeStorageSet(storageObj, key, value) {
    try { storageObj.setItem(key, value); } catch (e) { console.warn("[silent]", e); }
}

function safeStorageRemove(storageObj, key) {
    try { storageObj.removeItem(key); } catch (e) { console.warn("[silent]", e); }
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
    if (typeof initPlayerSearchAutofill === 'function' && document.getElementById('adm-new-name') && !window._pestovoAdmNameAutofill) {
        window._pestovoAdmNameAutofill = true;
        initPlayerSearchAutofill({
            searchInputId: 'adm-new-name',
            onSelect: function(matchedUser) {
                var nameInp = document.getElementById('adm-new-name');
                var hcpInp = document.getElementById('adm-new-hcp');
                var genderSel = document.getElementById('adm-new-gender');
                var parts = (typeof resolvePlayerNameParts === 'function')
                    ? resolvePlayerNameParts(matchedUser)
                    : matchedUser;
                if (nameInp) {
                    nameInp.value = ((parts.firstName || '') + ' ' + (parts.lastName || '')).trim() || matchedUser.name || '';
                }
                if (hcpInp && matchedUser.handicap != null && typeof fmtExactHcp === 'function') {
                    hcpInp.value = fmtExactHcp(matchedUser.handicap);
                }
                if (genderSel && matchedUser.gender) genderSel.value = matchedUser.gender;
            }
        });
    }
    loadTournaments();
    loadClubBroadcastsHistory();
    loadBroadcastAudienceOptions();
    listenForAlerts();
    loadTelegramSettings();
    loadVKSettings();
    loadPageVisibilitySettings();
    loadStablefordDisplaySettings();
    loadSocialCardDisplaySettings();
    loadGroupCardDisplaySettings();
    loadTnCardDisplaySettings();
    loadTnLbDisplaySettings();
    loadTnGroupsSettings();
    loadTnGenderSplitSettings();
    loadPageDisplaySettings();
    loadAdmView5Settings();
    loadPrivacySettings();
    renderAssistantSources();
    loadAssistantSourcesFromFirebase();
    updateNotifButton();
    // Новая версия создания турнира: подключаем черновики/шаблоны/поле,
    // открываем суб-вкладку по URL-hash (#new-create / #course / #templates).
    if (typeof tnwOnAdminOpen === 'function') { try { tnwOnAdminOpen(); } catch (e) { console.warn('[silent]', e); } }
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
    // На телефоне вкладки — горизонтальная липкая полоса: активную
    // прокручиваем в центр, чтобы её не приходилось искать.
    if (b && typeof b.scrollIntoView === 'function') {
        try { b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) { console.warn("[silent]", e); }
    }

    if (t === 'groups') {
        renderAdmGroups();
    }
    if (t === 'broadcasts') {
        try { pushAdminRefreshStatus(); } catch (e) { console.warn("[silent]", e); }
    }
    if (t === 'protocol') {
        try { if (typeof peInit === 'function') peInit(); } catch (e) { console.warn("[silent]", e); }
    }
    if (t === 'scores') {
        seRender();
    }
    if (t === 'data') {
        loadPageVisibilitySettings();
        loadStablefordDisplaySettings();
        loadSocialCardDisplaySettings();
        loadGroupCardDisplaySettings();
        loadTnCardDisplaySettings();
        loadTnLbDisplaySettings();
        loadTnGroupsSettings();
        loadTnGenderSplitSettings();
        loadPageDisplaySettings();
        loadAdmView5Settings();
    }
    if (t === 'tournamentsview') {
        loadTnPageViewSettings();
    }
    if (t === 'rusgolf') {
        if (typeof loadRusgolfProxySettings === 'function') loadRusgolfProxySettings(); // js/admin-agr.js
        if (typeof nmLoadSettings === 'function') nmLoadSettings(); // js/admin-name-forms.js
        try { if (typeof rgRefreshSyncScopeHint === 'function') rgRefreshSyncScopeHint(); } catch (eRg) { console.warn("[silent]", eRg); }
    }
    if (t === 'players') {
        loadPrivacySettings();
    }
    if (t === 'assistant') {
        renderAssistantSources();
        loadAssistantSourcesFromFirebase();
    }
    if (t === 'tournaments' || t === 'start') {
        // Вкладка «Турниры 🏆» — единая страница создания турнира: создание,
        // список, HCP-группы, флайты + стартовые протоколы и QR-коды
        // (js/start-admin.js) живут в одном месте. Старое имя 'start'
        // оставлено для совместимости и ведёт на ту же вкладку.
        if (t === 'start') {
            var tnTab = document.getElementById('tab-tournaments');
            if (tnTab) tnTab.classList.remove('hidden');
            document.querySelectorAll('.admin-tab').forEach(function(x) {
                if (x.getAttribute('onclick') && x.getAttribute('onclick').indexOf("'tournaments'") !== -1) x.classList.add('active');
            });
        }
        try { if (typeof loadTournaments === 'function') loadTournaments(); } catch (eTn) { console.warn("[silent]", eTn); }
        if (typeof psSwitchTo === 'function') {
            try { psSwitchTo(); } catch (ePs) { console.error('[start] switch error', ePs); }
        }
        if (t === 'start') {
            setTimeout(function() {
                var anchor = document.getElementById('tn-start-anchor');
                if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 120);
        }
    }
    if (t === 'design') {
        // Вкладка «Дизайн 🎨»: шаблоны оформления сайта (js/design-admin.js)
        if (typeof dspAdminLoad === 'function') dspAdminLoad();
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

// Компактный список групп: одна строка на группу (свёрнуто по умолчанию),
// детали — в раскрывающейся панели. Сортировка: отстающие / старт / лунка.
var admGroupsExpanded = {};
var admGroupsSortMode = 'delay';

// ── ДЕЙСТВИЯ С РАУНДОМ ИЗ АДМИНКИ ──
// Раньше эти кнопки вызывали roundResume(id, null) и
// roundForceFinishPlayer(id, pid, null) без данных раунда. Пауза при этом
// обнулялась (тайминги прыгали), а «завершить одного игрока» закрывало ВЕСЬ
// раунд, потому что список участников был пустым. Теперь каждое действие
// сначала читает актуальную карточку раунда.
function admRoundName() {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    return isEn ? 'Admin' : 'Администратор';
}

function admPauseRound(id) {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    readRoundSnapshot(id, null).then(function(r) {
        if (!r) { toast(isEn ? 'Round not found' : 'Раунд не найден', 'error'); return; }
        if (typeof openRoundPauseModal === 'function') openRoundPauseModal(id, r, function() { renderAdmGroups(); renderAdmRounds(admRoundsLastData); });
    });
}

function admResumeRound(id) {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    readRoundSnapshot(id, null).then(function(r) {
        if (!r) { toast(isEn ? 'Round not found' : 'Раунд не найден', 'error'); return; }
        return roundResume(id, r, admRoundName(), (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : '');
    }).then(function(res) {
        if (res && res.resumed === false) {
            toast(isEn ? 'The round is not paused' : 'Раунд и так не на паузе', 'info');
        } else {
            toast(isEn ? '✅ Round resumed — timings continue from the pause moment' : '✅ Раунд возобновлён — тайминги продолжаются с момента паузы', 'success');
        }
        renderAdmGroups();
        renderAdmRounds(admRoundsLastData);
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function admForceFinishOnePlayer(id, pid) {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var reason = isEn ? 'Force finished by administrator' : 'Завершено администратором';
    if (!confirm(isEn
        ? 'Finish this player\u2019s round? His scores are kept, other players continue.'
        : 'Завершить раунд этого игрока? Его счёта сохранятся, остальные продолжат игру.')) return;
    // (roundId, playerId, roundData, reason, finisherName) — данные раунда
    // дочитает сама утилита.
    roundForceFinishPlayer(id, pid, null, reason, admRoundName()).then(function() {
        toast(isEn ? '✅ Player finished' : '✅ Игрок завершён', 'success');
        renderAdmGroups();
        renderAdmRounds(admRoundsLastData);
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function admForceFinishAllPlayers(id) {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var reason = isEn ? 'Closed by administrator' : 'Закрыто администратором';
    if (!confirm(isEn
        ? 'Force finish the whole round? Every unsubmitted card is closed with the current scores.'
        : 'Принудительно завершить весь раунд? Все несданные карточки будут закрыты с текущими счетами.')) return;
    roundForceFinishAll(id, null, reason, admRoundName()).then(function() {
        toast(isEn ? '✅ Round finished' : '✅ Раунд завершён', 'success');
        renderAdmGroups();
        renderAdmRounds(admRoundsLastData);
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function admGroupsSort(v) {
    admGroupsSortMode = v || 'delay';
    renderAdmGroups();
}

function admToggleGroupRow(id) {
    admGroupsExpanded[id] = !admGroupsExpanded[id];
    renderAdmGroups();
}

function admGroupsExpandAll(expand) {
    var data = adminGroupsSnapshot && typeof adminGroupsSnapshot.val === 'function'
        ? (adminGroupsSnapshot.val() || {}) : {};
    Object.keys(data).forEach(function(id) { admGroupsExpanded[id] = !!expand; });
    renderAdmGroups();
}

function renderAdmGroups() {
    var el = document.getElementById('adm-groups');
    if (!el) return;
    var sortSel = document.getElementById('adm-groups-sort');
    if (sortSel && sortSel.value) admGroupsSortMode = sortSel.value;
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

    var metricsCache = {};
    groups.forEach(function(entry) {
        try { metricsCache[entry[0]] = getRoundPaceMetrics(entry[1]); } catch (e) { metricsCache[entry[0]] = { overallDelay: 0 }; }
    });
    var curHoleOf = function(entry) {
        var m = metricsCache[entry[0]] || {};
        var rd = entry[1] || {};
        return m.currentHole || ((m.order && m.order.length) ? m.order[0] : rd.startHole || 1);
    };
    if (admGroupsSortMode === 'start') {
        groups.sort(function(a, b) { return (a[1].startTime || 0) - (b[1].startTime || 0); });
    } else if (admGroupsSortMode === 'hole') {
        groups.sort(function(a, b) { return curHoleOf(a) - curHoleOf(b); });
    } else {
        // «Сначала отстающие»: по величине отставания от графика.
        groups.sort(function(a, b) {
            var delayA = (metricsCache[a[0]] && metricsCache[a[0]].overallDelay) || 0;
            var delayB = (metricsCache[b[0]] && metricsCache[b[0]].overallDelay) || 0;
            return delayB - delayA;
        });
    }

    var html = '';
    groups.forEach(function(entry, index) {
        var rid = entry[0];
        var roundData = entry[1];
        var metrics = metricsCache[rid] || {};
        var state = paceStatus(metrics.overallDelay);
        var participants = getPaceParticipants(roundData);
        var names = participants.map(function(item) {
            var pTee = (item.player && item.player.tee) || roundData.tee || 'wh';
            return escapeHtml(item.player.name || t('player')) + ' ' + fmtTeePill(pTee);
        }).join(' · ');
        var currentHole = curHoleOf(entry);
        var noTimingNote = !metrics.hasTimingData
            ? '<div class="pace-note">' + t('pace_pending') + '</div>' : '';
        var groupLabel = currentLang === 'en' ? 'Group ' + (index + 1) : 'Группа ' + (index + 1);
        var expanded = !!admGroupsExpanded[rid];

        // Компактная строка: название, лунка, отставание, статус.
        html += '<div class="list-item adm-group-row pace-state-' + state.key + '" style="--pace-color:' + state.color + ';padding:9px 12px;gap:8px;cursor:pointer;border-left:3px solid ' + state.color + ';" onclick="admToggleGroupRow(\'' + rid + '\')">';
        html += '<i class="fas ' + (expanded ? 'fa-chevron-up' : 'fa-chevron-down') + '" style="color:var(--gold);font-size:11px;"></i>';
        html += '<span class="live-dot" style="width:7px;height:7px;"></span>';
        html += '<b style="color:var(--white);font-size:13px;">' + groupLabel + '</b>';
        // В игре считаются только те, кто ещё не сдал карточку.
        var stillPlaying = (metrics.activeParticipants && metrics.activeParticipants.length) || participants.length;
        html += '<span style="font-size:12px;color:var(--muted);">' + stillPlaying + '/' + participants.length + ' ' + (currentLang === 'en' ? 'pl.' : 'игр.') + ' · №' + currentHole + '</span>';
        html += '<b class="admin-group-delay" style="font-size:13px;">' + formatPaceDelta(metrics.overallDelay) + '</b>';
        html += '<span class="admin-group-status" style="margin-left:auto;">' + state.label + '</span>';
        html += '</div>';

        // Раскрытая панель: состав, метрики, тайминги лунок.
        html += '<div class="' + (expanded ? '' : 'hidden') + '" style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px;padding:10px 12px;margin:-6px 0 6px;">';
        html += '<div class="admin-group-card pace-state-' + state.key + '" style="--pace-color:' + state.color + ';margin:0;border:none;background:transparent;padding:0;">';
        html += '<div class="admin-group-players" style="margin-bottom:8px;"><i class="fas fa-users"></i> ' + names + '</div>';
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
        html += '</div></div>';
    });

    el.innerHTML = html;
}

var adminAutoStartTimer = null;

// Последний снимок раундов: нужен, чтобы смена периода (пресет/даты)
// перерисовывала список без повторного чтения базы.
var admRoundsLastData = {};
var admRoundsDateFilter = null;

// Фильтр периода во вкладке «Раунды» (поля adm-date-from / adm-date-to,
// пресеты и сводка «показано N из M» уже есть в admin.html). Функция
// создаёт фильтр при первом обращении и переиспользует его дальше —
// её вызывают loadAdmRounds() и renderAdmRounds().
function ensureAdmRoundsDateFilter() {
    if (admRoundsDateFilter) return admRoundsDateFilter;
    if (typeof initDateRangeFilter !== 'function') return null;
    admRoundsDateFilter = initDateRangeFilter({
        key: 'adm-rounds',
        fromId: 'adm-date-from',
        toId: 'adm-date-to',
        presetsId: 'adm-date-presets',
        resetId: 'adm-date-reset',
        hintId: 'adm-date-hint',
        summaryId: 'adm-rounds-summary',
        onChange: function() { renderAdmRounds(admRoundsLastData || {}); }
    });
    return admRoundsDateFilter;
}

function loadAdmRounds() {
    if (typeof db === 'undefined' || !db) return;
    ensureAdmRoundsDateFilter();
    // Одна подписка на раунды: повторные вызовы (фильтр по датам, смена языка,
    // удаление/создание раунда) только перерисовывают список по последнему снимку.
    bindRealtimeValue('admin-rounds', db.ref('rounds'), function(sn) {
        var data = sn.val() || {};
        admRoundsLastData = data;
        // Автозакрытие вчерашних незавершённых раундов («завершён автоматически»)
        if (typeof sweepStaleRounds === 'function') data = sweepStaleRounds(data) || {};
        // Автостарт турнира: раунды, созданные протоколом заранее, открываются
        // в момент старта (совпадение даты и времени) — статус active пишется
        // в базу, а их турнир переходит из «предстоящий» в «активный».
        if (typeof pestovoAutoStartRounds === 'function') {
            try { pestovoAutoStartRounds(data, { notify: true, silent: true }); } catch (e) { console.warn("[silent]", e); }
        }
        renderAdmRounds(data);
    });
    // Таймер автостарта: турнир стартует по времени, даже если в базе
    // ничего не меняется и новые снимки раундов не приходят.
    if (!adminAutoStartTimer) {
        adminAutoStartTimer = setInterval(function() {
            if (typeof db === 'undefined' || !db) return;
            db.ref('rounds').once('value').then(function(sn) {
                var data = sn.val() || {};
                if (typeof pestovoAutoStartRounds === 'function') {
                    pestovoAutoStartRounds(data, { notify: true, silent: true });
                }
            }).catch(function() {});
        }, 30000);
    }
}

// Компактный список раундов: одна строка на раунд, детали — в раскрывающейся
// панели. По умолчанию всё свёрнуто; состояние запоминается при обновлениях.
var admRoundsExpanded = {};

function admToggleRoundRow(id) {
    admRoundsExpanded[id] = !admRoundsExpanded[id];
    var panel = document.getElementById('adm-r-' + id);
    var chev = document.getElementById('adm-r-chev-' + id);
    if (panel) panel.classList.toggle('hidden', !admRoundsExpanded[id]);
    if (chev) chev.className = 'fas ' + (admRoundsExpanded[id] ? 'fa-chevron-up' : 'fa-chevron-down');
}

function admRoundsExpandAll(expand) {
    document.querySelectorAll('#adm-rounds [id^="adm-r-"]').forEach(function(panel) {
        var id = panel.id.replace(/^adm-r-/, '');
        if (!id || id.indexOf('chev-') === 0) return;
        admRoundsExpanded[id] = !!expand;
        panel.classList.toggle('hidden', !expand);
        var chev = document.getElementById('adm-r-chev-' + id);
        if (chev) chev.className = 'fas ' + (expand ? 'fa-chevron-up' : 'fa-chevron-down');
    });
}

function admRoundDetailsHtml(id, r) {
    var html = '';
    var tnName = (typeof roundTournamentName === 'function') ? roundTournamentName(r) : (r.tournamentName || '');
    if (tnName) {
        html += '<div style="font-size:12px;color:var(--gold);margin-bottom:8px;"><i class="fas fa-trophy"></i> ' + escapeHtml(tnName) +
            (r.groupNo ? ' · ' + (currentLang === 'en' ? 'Group ' : 'Группа ') + r.groupNo : '') + '</div>';
    }
    var plist = Object.entries(r.players || {});
    if (!plist.length) {
        html += '<div style="font-size:12px;color:var(--muted);">' + (currentLang === 'en' ? 'No players' : 'Нет игроков') + '</div>';
        return html;
    }
    if (r.status === 'active') {
        var isEn = currentLang === 'en';
        var isPaused = !!r.paused;
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06);">';
        if (isPaused) {
            html += '<button type="button" class="btn btn-g btn-sm" onclick="admResumeRound(\'' + id + '\')"><i class="fas fa-play"></i> ' + (isEn ? 'Resume' : 'Возобновить') + '</button>';
        } else {
            html += '<button type="button" class="btn btn-ol btn-sm" onclick="admPauseRound(\'' + id + '\')"><i class="fas fa-pause"></i> ' + (isEn ? 'Pause Round' : 'Пауза') + '</button>';
        }
        html += '<button type="button" class="btn btn-ol btn-sm" onclick="admForceFinishAllPlayers(\'' + id + '\')"><i class="fas fa-forward"></i> ' + (isEn ? 'Force Finish All' : 'Завершить принудительно (всех)') + '</button>';
        html += '</div>';
    }
    var order = [];
    try { order = (typeof getRoundOrder === 'function') ? getRoundOrder(r) : []; } catch (eOrd) { order = []; }
    html += '<div style="display:flex;flex-direction:column;gap:4px;">';
    plist.forEach(function(pe) {
        var p = pe[1] || {};
        var stats = { gross: 0, toPar: null, net: 0, stablefordField: 0, holesPlayed: 0 };
        try {
            if (typeof calcRoundStats === 'function') {
                stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order) || stats;
            }
        } catch (eSt) { console.warn("[silent]", eSt); }
        var pTee = (p && p.tee) || r.tee || 'wh';
        var isFin = typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(r, pe[0]);
        html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:8px;">';
        html += '<span style="color:var(--white);font-weight:600;flex:1;min-width:120px;">' + escapeHtml(p.name || t('player')) + '</span> ';
        if (isFin) {
            html += '<span style="color:#2ecc71;font-size:11px;font-weight:700;"><i class="fas fa-check-circle"></i> ' + (currentLang === 'en' ? 'Finished' : 'Финиш') + '</span> ';
        } else if (r.status === 'active') {
            html += '<button type="button" class="btn btn-ol btn-sm" style="padding:2px 6px;font-size:10px;" onclick="admForceFinishOnePlayer(\'' + id + '\',\'' + pe[0] + '\')" title="' + (currentLang === 'en' ? 'Force finish player' : 'Завершить игрока') + '"><i class="fas fa-flag-checkered"></i></button> ';
        }
        html += fmtTeePill(pTee);
        html += '<span style="color:var(--muted);">HCP ' + (p.exactHcp != null ? fmtExactHcp(p.exactHcp) : '—') + '</span>';
        html += '<span style="color:var(--muted);">Gross <b style="color:var(--white);">' + (stats.gross || 0) + '</b></span>';
        html += '<span class="' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</span>';
        html += '<span style="color:var(--muted);">Net <b style="color:var(--white);">' + (stats.net || 0) + '</b></span>';
        html += '<span style="color:var(--muted);">Stbl <b style="color:var(--gold);">' + (stats.stablefordField || 0) + '</b></span>';
        html += '<span style="color:var(--muted);font-size:11px;">' + (stats.holesPlayed || 0) + '/18</span>';
        html += '</div>';
    });
    html += '</div>';
    return html;
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

    var playersStr = currentLang === 'en' ? ' pl.' : ' игр.';
    var soloStr = currentLang === 'en' ? ' · Solo' : ' · Соло';

    var html = '';
    entries.forEach(function(e) {
        var id = e[0], r = e[1], pc = Object.keys(r.players || {}).length;
        var expanded = !!admRoundsExpanded[id];
        var badge = (typeof buildRoundStatusBadgeHTML === 'function')
            ? buildRoundStatusBadgeHTML(r)
            : (r.status === 'active'
                ? '<span class="tn-status tn-a"><span class="live-dot" style="width:6px;height:6px;"></span> Live</span>'
                : (r.status === 'scheduled'
                    ? '<span class="tn-status tn-u"><i class="fas fa-hourglass-half"></i> ' +
                      (currentLang === 'en' ? 'Scheduled' : 'Запланирован') + '</span>'
                    : ((typeof buildRoundCompletedBadgeHTML === 'function')
                        ? buildRoundCompletedBadgeHTML(r)
                        : '<span class="tn-status tn-d">' + (currentLang === 'en' ? 'Completed' : 'Завершён') + '</span>')));

        html += '<div class="list-item adm-round-row" style="padding:9px 12px;flex-wrap:wrap;gap:8px;cursor:pointer;" onclick="admToggleRoundRow(\'' + id + '\')">';
        html += '<i id="adm-r-chev-' + id + '" class="fas ' + (expanded ? 'fa-chevron-up' : 'fa-chevron-down') + '" style="color:var(--gold);font-size:11px;"></i>';
        html += '<div style="flex:1;min-width:180px;font-size:12.5px;"><strong style="color:var(--white);">' +
                // Дату показываем ту же, по которой работает фильтр периода (старт раунда).
                fmtDate(getRoundFilterTs(r)) + '</strong> <span style="color:var(--muted);">' + fmtTime(r.startTime) + ' · ' + pc + playersStr + ' · ' +
                escapeHtml((typeof pestovoRoundFormatBadge === 'function') ? pestovoRoundFormatBadge(r, 'Stroke') : (r.format || 'Stroke')) + (r.mode === 'solo' ? soloStr : '') + '</span> ' + badge + '</div>';
        html += '<div style="display:flex;gap:6px;" onclick="event.stopPropagation()">';
        if (r.status === 'completed') {
            html += '<button class="btn btn-og btn-sm" onclick="downloadScorecard(\'' + id + '\')"><i class="fas fa-download"></i></button>';
        }
        html += '<button class="btn btn-r btn-sm" onclick="deleteRound(\'' + id + '\')"><i class="fas fa-trash"></i></button>';
        html += '</div></div>';
        html += '<div id="adm-r-' + id + '" class="' + (expanded ? '' : 'hidden') + '" style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px;padding:10px 12px;margin:-6px 0 6px;">' +
            admRoundDetailsHtml(id, r) + '</div>';
    });

    el.innerHTML = html;
}

function deleteRound(id) {
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(currentLang === 'en' ? 'Delete round?' : 'Удалить раунд?')) return;

    db.ref('rounds/' + id).once('value').then(function(sn) {
        var r = sn.val();
        if (r && r.players) {
            Object.keys(r.players).forEach(function(pid) {
                db.ref('users/' + pid + '/history').once('value').then(function(hSn) {
                    // Всё считаем из ОДНОГО снимка: повторное чтение сразу после
                    // remove() возвращало бы ещё не удалённые записи из кэша и
                    // портило bestGross/bestStableford.
                    var hist = hSn.val() || {};
                    var updates = {};
                    var remaining = [];
                    Object.entries(hist).forEach(function(he) {
                        if (he[1] && he[1].roundId === id) {
                            updates['users/' + pid + '/history/' + he[0]] = null;
                        } else if (he[1]) {
                            remaining.push(he[1]);
                        }
                    });
                    var bestG = null, bestS = null;
                    remaining.forEach(function(item) {
                        if (item.holes === 18 && item.gross) {
                            if (bestG === null || item.gross < bestG) bestG = item.gross;
                        }
                        if (item.holes === 18 && item.stablefordField) {
                            if (bestS === null || item.stablefordField > bestS) bestS = item.stablefordField;
                        }
                    });
                    updates['users/' + pid + '/roundsPlayed'] = remaining.length;
                    updates['users/' + pid + '/bestGross'] = bestG;
                    updates['users/' + pid + '/bestStableford'] = bestS;
                    db.ref().update(updates).catch(function() {});
                }).catch(function() {});
            });
        }

        db.ref('rounds/' + id).remove();
        db.ref('markers/' + id).remove();
        db.ref('markerAssignments/' + id).remove();
        toast(currentLang === 'en' ? 'Round deleted' : 'Раунд удалён', 'info');
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function clearRounds() {
    if (confirm(currentLang === 'en' ? 'Delete ALL rounds and history? This cannot be undone!' : 'Удалить ВСЕ раунды и всю историю? Это необратимо!') && confirm(currentLang === 'en' ? 'Are you sure?' : 'Точно уверены?')) {
        db.ref('rounds').remove();
        db.ref('markers').remove();
        db.ref('markerAssignments').remove();
        db.ref('alerts').remove();
        db.ref('protocols').remove();
        // Сбрасываем игровые сессии на всех устройствах.
        db.ref('settings/sessions_reset_ts').set(Date.now());
        try { if (typeof pestovoWipeLocalSessions === 'function') pestovoWipeLocalSessions(); } catch (e) { console.warn("[silent]", e); }

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
        } catch (e) { console.warn("[silent]", e); }
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
        'broadcasts': null,
        'protocols': null
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
        // 2) Чистим локальные кэши и «прячем» встроенных демо-игроков.
        // Каждый шаг — в своём try/catch: раньше падение любого из них
        // (например, локального кэша) превращало УСПЕШНОЕ удаление данных
        // в красную «Ошибку», хотя база уже была пуста.
        safeAfterWipeStep(function() { if (typeof wipeLocalPlayerCaches === 'function') wipeLocalPlayerCaches(); });
        safeAfterWipeStep(function() { localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify([])); });
        safeAfterWipeStep(function() { if (typeof pestovoWipeLocalSessions === 'function') pestovoWipeLocalSessions(); });
        // Сброс ВСЕХ сессий на устройствах игроков (доступ к раундам,
        // текущие лунки, FIO-сессии) — клиенты слушают этот ключ.
        wipeUpdates['settings/sessions_reset_ts'] = Date.now();
        safeAfterWipeStep(function() { if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache(); });
        safeAfterWipeStep(function() { if (typeof loadAdmPlayers === 'function') loadAdmPlayers(); });
        safeAfterWipeStep(function() { if (typeof loadAdmRounds === 'function') loadAdmRounds(); });

        toast(currentLang === 'en' ? 'All players and rounds deleted everywhere' : 'Все игроки и раунды полностью удалены', 'info');
        if (typeof vib === 'function') { try { vib([60, 40, 60]); } catch (e) { console.warn("[silent]", e); } }
    }).catch(function(err) {
        // Ошибка базы: данные НЕ удалены — сообщаем честно.
        toast((currentLang === 'en' ? 'Error: ' : 'Ошибка: ') + (err && err.message ? err.message : err) +
            (currentLang === 'en' ? ' — data was NOT deleted' : ' — данные НЕ удалены'), 'error');
    });
}

// Любой шаг после успешного удаления данных не должен «превращаться» в
// ошибку удаления: локалку и открытые списки обновляем «мягко».
function safeAfterWipeStep(fn) {
    try { fn(); } catch (e) { try { console.warn('[wipe] step failed', e); } catch (_) { console.warn("[silent]", _); } }
}

// Удаляет АБСОЛЮТНО ВСЕ данные: турниры, игроков, раунды, историю, маркеры,
// протоколы, трансляции, реакции, алерты, а также все локальные кэши и
// «демо-имена». Настройки (дизайн, доступ в админку, интеграции) сохраняются,
// чтобы после очистки админка осталась доступной.
var WIPE_ALL_DB_BRANCHES = [
    'rounds', 'users', 'tournaments', 'markers', 'markerAssignments',
    'alerts', 'protocols', 'broadcasts', 'reactions'
];
var WIPE_ALL_KEEP_LOCAL_KEYS = [
    'pestovo_is_admin', 'pestovo_admin_access_source', 'pestovo_admin_access_remember',
    'pestovo_adm_logged_in', 'pestovo_adm_remember', 'pestovo_lang', 'pestovo_theme',
    'pestovo_saved_email', 'pestovo_saved_remember'
];

function wipeAllLocalData() {
    [localStorage, sessionStorage].forEach(function(storageObj) {
        var keys = [];
        try {
            for (var i = 0; i < storageObj.length; i++) keys.push(storageObj.key(i));
        } catch(e) { return; }
        keys.forEach(function(k) {
            if (!k) return;
            if (WIPE_ALL_KEEP_LOCAL_KEYS.indexOf(k) !== -1) return;
            if (k.indexOf('pestovo_') !== 0 && k !== 'pwa_install_dismissed') return;
            safeStorageRemove(storageObj, k);
        });
    });
    if (typeof wipeLocalPlayerCaches === 'function') wipeLocalPlayerCaches();
    try { localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify([])); } catch (e) { console.warn("[silent]", e); }
    try { localStorage.setItem('pestovo_defaults_cleared', 'true'); } catch (e) { console.warn("[silent]", e); }
}

function wipeEverything() {
    var en = currentLang === 'en';
    var msg1 = en
        ? 'Delete ABSOLUTELY EVERYTHING? Tournaments, players, rounds, history, markers, protocols, broadcasts, demo names and all local caches will be permanently erased!'
        : 'Удалить АБСОЛЮТНО ВСЕ данные? Турниры, игроки, раунды, история, маркеры, протоколы, трансляции, демо-имена и все локальные кэши будут стёрты безвозвратно!';
    var msg2 = en
        ? 'This cannot be undone. Type DELETE to confirm.'
        : 'Это действие необратимо. Введите УДАЛИТЬ для подтверждения.';
    var word = en ? 'DELETE' : 'УДАЛИТЬ';

    if (!confirm(msg1)) return;
    var typed = prompt(msg2, '');
    if (typed === null) return;
    if (String(typed).trim().toUpperCase() !== word && String(typed).trim().toUpperCase() !== 'DELETE') {
        toast(en ? 'Cancelled: confirmation word did not match' : 'Отменено: слово подтверждения не совпало', 'info');
        return;
    }

    var finish = function() {
        safeAfterWipeStep(function() { wipeAllLocalData(); });
        // Сбрасываем локальные сессии на всех устройствах после полной очистки.
        safeAfterWipeStep(function() {
            if (typeof db !== 'undefined' && db) {
                db.ref('settings/sessions_reset_ts').set(Date.now()).catch(function() {});
            }
        });
        safeAfterWipeStep(function() { if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache(); });
        safeAfterWipeStep(function() { if (typeof loadAdmPlayers === 'function') loadAdmPlayers(); });
        safeAfterWipeStep(function() { if (typeof loadAdmRounds === 'function') loadAdmRounds(); });
        safeAfterWipeStep(function() { if (typeof loadAdmTournaments === 'function') loadAdmTournaments(); });
        toast(en ? 'All data deleted' : 'Все данные полностью удалены', 'info');
        if (typeof vib === 'function') { try { vib([60, 40, 60]); } catch (e) { console.warn("[silent]", e); } }
        setTimeout(function() { location.reload(); }, 1200);
    };

    if (typeof db === 'undefined') { finish(); return; }

    var updates = {};
    WIPE_ALL_DB_BRANCHES.forEach(function(b) { updates[b] = null; });
    db.ref().update(updates).then(finish).catch(function(err) {
        toast((en ? 'Error: ' : 'Ошибка: ') + (err && err.message ? err.message : err) +
            (en ? ' — data was NOT deleted' : ' — данные НЕ удалены'), 'error');
    });
}

// ==========================================
// ТУРНИРЫ
// ==========================================
// Уникальное число заявленных участников: гостевые записи и синхронизированные
// записи одного человека могут лежать под разными ключами — считаем по ФИО.
function admUniqueRegCount(regPlayers) {
    var seen = {};
    var n = 0;
    Object.keys(regPlayers || {}).forEach(function(k) {
        var rp = regPlayers[k] || {};
        var key = '';
        if (typeof getPlayerFioKey === 'function') {
            try { key = getPlayerFioKey(rp); } catch (e) { console.warn("[silent]", e); }
        }
        if (!key) {
            var nm = String(rp.name || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
            key = nm || ('id:' + k);
        }
        if (!seen[key]) { seen[key] = true; n++; }
    });
    return n;
}

function createTournament() {
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    var name = document.getElementById('tn-name').value.trim();
    var date = document.getElementById('tn-date').value;

    if (!name || !date) { toast(currentLang === 'en' ? 'Specify name and date' : 'Заполните название и дату', 'error'); return; }

    // ВСЕ форматы турнира — единый список (js/utils.js PESTOVO_FORMAT_PRESETS).
    var formats = [];
    var formatCheck = function(id, fmt) {
        var el = document.getElementById(id);
        if (el && el.checked) formats.push(fmt);
    };
    formatCheck('tn-f-stroke', 'Stroke Play');
    formatCheck('tn-f-gross', 'Stroke Play (Gross)');
    formatCheck('tn-f-net', 'Stroke Play (Net)');
    formatCheck('tn-f-stbl', 'Stableford');
    formatCheck('tn-f-m1v1', 'Match Play 1v1');
    formatCheck('tn-f-m2v2', 'Match Play 2v2');
    formatCheck('tn-f-scram', 'Scramble');
    formatCheck('tn-f-txscram', 'Texas Scramble');
    formatCheck('tn-f-greens', 'Greensomes');
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

// Какие HCP-панели турниров раскрыты (иначе loadTournaments падал с
// ReferenceError и созданные турниры не появлялись в списке).
var tnDivOpen = {};
// Какие панели «Лист ожидания» турниров раскрыты.
var tnWaitOpen = {};

// ==========================================
// ЛИСТ ОЖИДАНИЯ ТУРНИРА (waitlist)
// ------------------------------------------------------------
// Игроки, записавшиеся на турнир (страница «Турниры»), попадают не
// сразу в состав (registeredPlayers), а в отдельный список
// tournaments/<id>/waitlist. Здесь администратор выбирает, кого
// добавить в турнир (или убрать из ожидания).
// ==========================================
function tnToggleWaitlist(tnId) {
    tnWaitOpen[tnId] = !tnWaitOpen[tnId];
    var panel = document.getElementById('tn-waitlist-' + tnId);
    if (panel) panel.classList.toggle('hidden', !tnWaitOpen[tnId]);
    if (typeof vib === 'function') { try { vib(20); } catch (e) { console.warn("[silent]", e); } }
}

function tnWaitNameNorm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function tnWaitlistAdminHtml(tnId, tVal) {
    var en = currentLang === 'en';
    var waitlist = tVal.waitlist || {};
    var items = [];
    Object.keys(waitlist).forEach(function(k) {
        items.push({ key: k, w: waitlist[k] || {} });
    });
    items.sort(function(a, b) {
        var ha = parseFloat(a.w.handicap), hb = parseFloat(b.w.handicap);
        if (isNaN(ha) && isNaN(hb)) return String(a.w.name || '').localeCompare(String(b.w.name || ''));
        if (isNaN(ha)) return 1;
        if (isNaN(hb)) return -1;
        if (ha !== hb) return ha - hb;
        return String(a.w.name || '').localeCompare(String(b.w.name || ''));
    });

    var html = '<div style="padding:10px 4px 4px;border-top:1px dashed var(--border);margin-top:8px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">';
    html += '<span style="font-size:13px;font-weight:800;color:var(--gold);"><i class="fas fa-hourglass-half"></i> ' +
        (en ? 'Waitlist' : 'Лист ожидания') + ' · ' + items.length + '</span>';
    if (items.length) {
        html += '<button type="button" class="btn btn-g btn-sm" onclick="tnWaitlistAddAll(\'' + tnId + '\')"><i class="fas fa-user-check"></i> ' +
            (en ? 'Add all to tournament' : 'Добавить всех в турнир') + '</button>';
    }
    html += '</div>';
    html += '<div style="font-size:11.5px;color:var(--muted);margin-top:4px;">' +
        (en ? 'Players sign up here from the site. Add them to the tournament roster (or remove them) — only added players count for the start list and the leaderboard.' :
              'Игроки записываются сюда со страницы «Турниры». Добавляйте их в состав турнира (или убирайте) — только добавленные попадают в стартовый лист и лидерборд.') + '</div>';
    if (!items.length) {
        html += '<p style="font-size:12px;color:var(--muted);text-align:center;padding:10px 0;">' + (en ? 'Waitlist is empty' : 'Список ожидания пуст') + '</p>';
    }
    items.forEach(function(it) {
        var w = it.w;
        var gIcon = (typeof pestovoNormGender === 'function' && pestovoNormGender(w.gender) === 'women') ? '👩' : '👨';
        var hcp = (w.handicap != null && w.handicap !== '') ? fmtExactHcp(w.handicap) : '—';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 10px;margin-top:6px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;">';
        html += '<div style="min-width:180px;flex:1;">';
        html += '<div style="font-weight:700;color:var(--white);">' + gIcon + ' ' + escapeHtml(w.name || '—') + '</div>';
        html += '<div style="font-size:11.5px;color:var(--muted);margin-top:2px;">' +
            'HCP: <b style="color:var(--text);">' + hcp + '</b>' +
            ' · ' + fmtTeePill(w.tee || 'wh') +
            (w.phone ? ' · ' + escapeHtml(w.phone) : '') +
            (w.registeredAt ? ' · ' + (en ? 'signed up' : 'записан') + ' ' + fmtDate(w.registeredAt) : '') +
            '</div></div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
        html += '<button type="button" class="btn btn-g btn-sm" onclick="tnWaitlistAddToTournament(\'' + tnId + '\',\'' + escapeHtml(it.key) + '\')"><i class="fas fa-user-check"></i> ' + (en ? 'Add to tournament' : 'Добавить в турнир') + '</button>';
        html += '<button type="button" class="btn btn-r btn-sm" onclick="tnWaitlistRemove(\'' + tnId + '\',\'' + escapeHtml(it.key) + '\')" title="' + (en ? 'Remove from waitlist' : 'Убрать из ожидания') + '"><i class="fas fa-xmark"></i></button>';
        html += '</div></div>';
    });
    html += '</div>';
    return html;
}

// Перенос одного игрока из листа ожидания в состав (registeredPlayers).
// Дубли по ФИО не создаются: если игрок уже в составе — просто убираем
// его из ожидания. Ключ записи в составе: uid для игроков с аккаунтом
// (бейдж «Вы записаны» работает по нему), иначе уникальный ключ.
function tnWaitlistAddToTournament(tnId, wKey) {
    if (typeof db === 'undefined' || !db) return;
    var en = currentLang === 'en';
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val() || {};
        var w = (tVal.waitlist || {})[wKey];
        if (!w) return;
        var reg = tVal.registeredPlayers || {};
        // Дедуп по ФИО НЕЗАВИСИМО от порядка слов: запись в составе могла
        // сохраниться как «Имя Отчество Фамилия», а в ожидании — наоборот.
        var existingKey = (typeof pestovoNameKeyInList === 'function')
            ? pestovoNameKeyInList(w.name, reg)
            : '';
        if (!existingKey) {
            var normName = tnWaitNameNorm(w.name);
            Object.keys(reg).forEach(function(k) {
                if (existingKey) return;
                if (tnWaitNameNorm((reg[k] || {}).name) === normName) existingKey = k;
            });
        }
        var updates = {};
        if (existingKey) {
            updates['tournaments/' + tnId + '/waitlist/' + wKey] = null;
            return db.ref().update(updates).then(function() {
                toast((en ? 'Already in the roster — removed from waitlist: ' : 'Уже в составе — убран из ожидания: ') + (w.name || ''), 'info');
            });
        }
        var key = (w.uid && !/^user_/.test(String(w.uid))) ? String(w.uid) :
            ('wl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
        var entry = {};
        Object.keys(w).forEach(function(f) { entry[f] = w[f]; });
        entry.addedAt = Date.now();
        updates['tournaments/' + tnId + '/registeredPlayers/' + key] = entry;
        updates['tournaments/' + tnId + '/waitlist/' + wKey] = null;
        return db.ref().update(updates).then(function() {
            toast('✅ ' + (en ? 'Added to the tournament: ' : 'Добавлен в турнир: ') + (w.name || ''), 'success');
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// «Добавить всех»: одна пакетная запись (update) на весь список ожидания.
function tnWaitlistAddAll(tnId) {
    if (typeof db === 'undefined' || !db) return;
    var en = currentLang === 'en';
    var waitlist = (typeof tnTnVals !== 'undefined' && tnTnVals[tnId] && tnTnVals[tnId].waitlist) || {};
    var keys = Object.keys(waitlist);
    if (!keys.length) { toast(en ? 'Waitlist is empty' : 'Список ожидания пуст', 'info'); return; }
    if (!confirm((en ? 'Add all ' : 'Добавить всех ') + keys.length + (en ? ' players to the tournament?' : ' игроков в турнир?'))) return;
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val() || {};
        var reg = tVal.registeredPlayers || {};
        // Состав для проверки дублей: записи + то, что добавляем сейчас.
        // Совпадение — strong по ФИО (порядок слов не важен).
        var known = {};
        Object.keys(reg).forEach(function(k) { known[k] = reg[k]; });
        var wl = tVal.waitlist || {};
        var updates = {};
        var added = 0, skipped = 0;
        Object.keys(wl).forEach(function(k) {
            var w = wl[k] || {};
            var isDup = (typeof pestovoNameInList === 'function')
                ? pestovoNameInList(w.name, known)
                : (Object.keys(known).some(function(kk) {
                    return tnWaitNameNorm((known[kk] || {}).name) === tnWaitNameNorm(w.name);
                }));
            if (isDup) {
                updates['tournaments/' + tnId + '/waitlist/' + k] = null;
                skipped++;
                return;
            }
            var key = (w.uid && !/^user_/.test(String(w.uid))) ? String(w.uid) :
                ('wl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
            var entry = {};
            Object.keys(w).forEach(function(f) { entry[f] = w[f]; });
            entry.addedAt = Date.now();
            known[key] = entry;
            updates['tournaments/' + tnId + '/registeredPlayers/' + key] = entry;
            updates['tournaments/' + tnId + '/waitlist/' + k] = null;
            added++;
        });
        return db.ref().update(updates).then(function() {
            toast('✅ ' + (en ? 'Added to the tournament: ' : 'Добавлено в турнир: ') + added +
                (skipped ? (en ? ' · already in roster: ' : ' · уже в составе: ') + skipped : ''), 'success');
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// Убрать игрока из листа ожидания (без подтверждения — запись обратима:
// игрок может записаться повторно со страницы «Турниры»).
function tnWaitlistRemove(tnId, wKey) {
    if (typeof db === 'undefined' || !db) return;
    db.ref('tournaments/' + tnId + '/waitlist/' + wKey).remove().then(function() {
        toast(currentLang === 'en' ? 'Removed from the waitlist' : 'Убран из списка ожидания', 'info');
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}
// Инлайн-редактирование группы: tnDivEditing[tnId] = divId.
var tnDivEditing = {};
// Кэш последних значений турниров из подписки — для перерисовки
// панели «Группы HCP» без обращения к базе.
var tnTnVals = {};

function loadTournaments() {
    if (typeof db === 'undefined' || !db) {
        var tnEmpty = document.getElementById('tn-list');
        if (tnEmpty) tnEmpty.innerHTML = '<div class="empty"><i class="fas fa-wifi"></i><p>' + (currentLang === 'en' ? 'No database connection' : 'Нет соединения с базой') + '</p></div>';
        return;
    }
    // Одна подписка: bindRealtimeValue не плодит дубли при повторных заходах на вкладку.
    bindRealtimeValue('admin-tournaments-list', db.ref('tournaments'), function(sn) {
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
        var waitLabel = currentLang === 'en' ? 'Waitlist: ' : 'Ожидание: ';

        var html = '';
        tnTnVals = {};
        entries.forEach(function(e) {
            var id = e[0], tVal = e[1];
            tnTnVals[id] = tVal;
            var formatsStr = (tVal.formats || []).join(', ') || '—';
            var teesStr = (tVal.tees || []).map(function(k) { return t('tee_' + k); }).join(', ') || '—';
            var regPlayers = tVal.registeredPlayers || {};
            var regCount = admUniqueRegCount(regPlayers);
            var waitlistVal = tVal.waitlist || {};
            var waitCount = Object.keys(waitlistVal).length;

            var tnStatus = tVal.status || 'upcoming';
            var tnEn = currentLang === 'en';
            var tnDivisions = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tVal) : [];
            var tnStatusHtml = tnStatus === 'active'
                ? '<span class="tn-status tn-a">🔴 ' + (tnEn ? 'Active' : 'Активный') + '</span>'
                : tnStatus === 'completed'
                ? '<span class="tn-status tn-d">✅ ' + (tnEn ? 'Completed' : 'Завершён') + '</span>'
                : '<span class="tn-status tn-u">📅 ' + (tnEn ? 'Upcoming' : 'Предстоящий') + '</span>';

            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;flex-direction:column;align-items:stretch;">';
            html += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<strong style="color:var(--white);">' + escapeHtml(tVal.name || '—') + '</strong> ' + tnStatusHtml;
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    fmtDate((typeof tnDateTs === 'function') ? tnDateTs(tVal.date) : Date.parse(tVal.date)) + ' · ' + formatLabel + formatsStr + ' · ' + teeLabel + teesStr + ' · ' + (tnEn ? 'Players: ' : 'Заявлено: ') + regCount +
                    (waitCount ? ' · ' + waitLabel + '<b style="color:var(--gold);">' + waitCount + '</b>' : '') + '</div>';
            if (tnDivisions.length) {
                html += '<div style="margin-top:6px;">';
                tnDivisions.forEach(function(d) {
                    // Имя группы ИЛИ диапазон HCP — но не оба сразу: названия
                    // вида «Мужчины 0–12» уже содержат диапазон, и бейдж с
                    // ним двоил информацию.
                    var rg = (typeof tnDivisionRangeText === 'function') ? tnDivisionRangeText(d) : '';
                    html += '<span class="tn-div-chip">' + escapeHtml(d.name || rg || '—') + '</span>';
                });
                html += '</div>';
            }
            html += '</div>';
            html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;">';
            if (tnStatus === 'upcoming') {
                html += '<button class="btn btn-g btn-sm" onclick="tnStartTournament(\'' + id + '\')" title="' + (tnEn ? 'Start before the scheduled time' : 'Начать раньше запланированного времени') + '"><i class="fas fa-play"></i> ' + (tnEn ? 'Start' : 'Старт') + '</button>';
            } else if (tnStatus === 'active') {
                html += '<button class="btn btn-og btn-sm" onclick="tnFinishTournament(\'' + id + '\')"><i class="fas fa-flag-checkered"></i> ' + (tnEn ? 'Finish' : 'Финиш') + '</button>';
            } else {
                html += '<button class="btn btn-og btn-sm" onclick="tnReopenTournament(\'' + id + '\')"><i class="fas fa-rotate-left"></i> ' + (tnEn ? 'Reopen' : 'Открыть снова') + '</button>';
                html += '<button class="btn btn-g btn-sm" onclick="tnOpenProtocolModal(\'' + id + '\')"><i class="fas fa-file-pdf"></i> ' + (tnEn ? 'Protocol PDF' : 'Протокол (PDF)') + '</button>';
            }
            if (tnStatus === 'upcoming' && regCount > 0) {
                html += '<button class="btn btn-og btn-sm" onclick="openFlightGeneratorModal(\'' + id + '\')"><i class="fas fa-users-gear"></i> ' + (tnEn ? 'Flights' : 'Флайты') + '</button>';
            }
            html += '<button class="btn btn-og btn-sm" onclick="tnToggleDivPanel(\'' + id + '\')"><i class="fas fa-layer-group"></i> ' + (tnEn ? 'HCP groups' : 'Группы HCP') + ' (' + tnDivisions.length + ')</button>';
            if (regCount > 0) {
                html += '<button class="btn btn-og btn-sm" onclick="exportTournamentRosterCSV(\'' + id + '\')"><i class="fas fa-file-csv"></i> CSV</button>';
            }
            // ЛИСТ ОЖИДАНИЯ: заявившиеся игроки (ещё не в составе) — сюда.
            // Администратор выбирает оттуда участников и добавляет в турнир.
            html += '<button class="btn btn-og btn-sm" onclick="tnToggleWaitlist(\'' + id + '\')" title="' + (tnEn ? 'Players who signed up but are not in the roster yet. Pick who gets a place.' : 'Игроки, записавшиеся, но ещё не в составе. Выберите, кого добавить в турнир.') + '"><i class="fas fa-hourglass-half"></i> ' + (tnEn ? 'Waitlist' : 'Ожидание') + ' (' + waitCount + ')</button>';
            // Удаление турнира всегда каскадное: вместе с раундами и протоколами.
            html += '<button class="btn btn-r btn-sm" title="' + (tnEn ? 'Delete tournament with all its rounds and group protocols' : 'Удалить турнир вместе со всеми его раундами и протоколами групп') + '" onclick="deleteTn(\'' + id + '\')"><i class="fas fa-trash"></i></button>';
            html += '</div></div>';
            html += '<div id="tn-div-' + id + '" class="tn-div-block' + (tnDivOpen[id] ? '' : ' hidden') + '">' + tnDivisionsEditorHtml(id, tnDivisions, tVal) + '</div>';
            html += '<div id="tn-waitlist-' + id + '" class="tn-div-block' + (tnWaitOpen[id] ? '' : ' hidden') + '">' + tnWaitlistAdminHtml(id, tVal) + '</div>';
            html += '</div>';
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
        var seenCsv = {};
        Object.values(tVal.registeredPlayers).forEach(function(p) {
            var key = '';
            if (typeof getPlayerFioKey === 'function') {
                try { key = getPlayerFioKey(p); } catch (e) { console.warn("[silent]", e); }
            }
            if (!key) key = String(p.name || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
            if (key && seenCsv[key]) return; // дубликат того же игрока — пропускаем
            if (key) seenCsv[key] = true;
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

// Удаление турнира — полный каскад: карточка турнира, протоколы групп и
// ВСЕ раунды этого турнира. Раунды убираются и из истории игроков (с
// пересчётом roundsPlayed / bestGross / bestStableford), чтобы после
// удаления турнира в «Истории» и статистике не оставалось его следов.
function deleteTn(id) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db || typeof pestovoDeleteTournamentCascade !== 'function') {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    // Сначала считаем, что именно уйдёт (раунды турнира + протоколы групп),
    // и только потом просим подтверждение с цифрами: удаление турнира — это
    // удаление и всех его раундов, включая записи в истории игроков.
    Promise.all([
        db.ref('tournaments/' + id).once('value').catch(function() { return null; }),
        pestovoTournamentRoundIdsFull(id).catch(function() { return []; }),
        db.ref('protocols').once('value').catch(function() { return null; })
    ]).then(function(res) {
        var tv = (res[0] && res[0].val()) || {};
        var tnName = tv.name || (en ? 'this tournament' : 'этот турнир');
        var roundIds = res[1] || [];
        var protos = (res[2] && res[2].val()) || {};
        var protoIds = Object.keys(protos).filter(function(pid) {
            var p = protos[pid] || {};
            return p.tournamentId === id || p.tnId === id;
        });
        var rc = roundIds.length, pc = protoIds.length;
        var msg = en
            ? 'Delete tournament "' + tnName + '" together with ' + rc + ' round(s) and ' + pc +
              ' group protocol(s)? Rounds of this tournament will be removed from the players history and statistics too. This cannot be undone.'
            : 'Удалить турнир «' + tnName + '» вместе со всеми его раундами (' + rc + ') и протоколами групп (' + pc + ')? ' +
              'Раунды этого турнира исчезнут и из истории игроков, и из их статистики. Отменить это будет нельзя.';
        if (!confirm(msg)) return null;
        return pestovoDeleteTournamentCascade(id).then(function(sum) {
            var parts = en
                ? 'Tournament deleted · rounds: ' + (sum.rounds || 0) + ' · protocols: ' + (sum.protocols || 0)
                : 'Турнир удалён · раундов удалено: ' + (sum.rounds || 0) + ' · протоколов: ' + (sum.protocols || 0);
            if (sum.players) {
                parts += en ? ' · history recalculated for ' + sum.players + ' player(s)'
                            : ' · история ' + sum.players + ' игрока(ов) пересчитана';
            }
            toast(parts, 'info');
            if (typeof loadTournaments === 'function') loadTournaments();
            if (typeof loadAdmRounds === 'function') loadAdmRounds();
            if (typeof myplayRenderToday === 'function') { try { myplayRenderToday(); } catch (e) { console.warn("[silent]", e); } }
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}
function tnStartTournament(id) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(en ? 'Start this tournament now (before the scheduled time)? The live leaderboard will become available and the planned rounds will open for scoring.' : 'Начать турнир сейчас (раньше запланированного времени)? Станет доступен live-лидерборд, а запланированные раунды откроются для ввода счёта.')) return;
    // Старт турнира открывает и его раунды: созданные протоколом заранее
    // раунды (status='scheduled') становятся активными — игроки могут вводить счёт.
    var startJob = (typeof pestovoStartTournamentNow === 'function')
        ? pestovoStartTournamentNow(id)
        : db.ref('tournaments/' + id).update({ status: 'active', startedAt: Date.now() }).then(function() { return 0; });
    startJob.then(function(opened) {
        toast((en ? '🚀 Tournament started!' : '🚀 Турнир начат!') +
            (opened ? (en ? ' Rounds opened: ' + opened : ' · открыто раундов: ' + opened) : ''), 'success');
        if (typeof vib === 'function') vib([60, 40, 60]);
        if (typeof loadTournaments === 'function') loadTournaments();
        if (typeof loadAdmRounds === 'function') loadAdmRounds();
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function tnFinishTournament(id) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(en ? 'Finish this tournament? Results will be marked as final.' : 'Завершить турнир? Результаты будут помечены как итоговые.')) return;
    db.ref('tournaments/' + id).update({ status: 'completed', finishedAt: Date.now() }).then(function() {
        // Завершение ≠ удаление: счета, введённые на турнире, сохраняем.
        // Открытые раунды этого турнира доводим до «завершён» и записываем
        // в историю игроков — как после обычного финиша раунда.
        return pestovoPreserveTournamentRounds(id).then(function(kept) {
            var extra = kept
                ? (en ? ' · ' + kept + ' round(s) saved to player history' : ' · раундов сохранено в историю игроков: ' + kept)
                : '';
            toast((en ? '🏁 Tournament completed!' : '🏁 Турнир завершён!') + extra, 'success');
            if (typeof loadTournaments === 'function') loadTournaments();
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function tnReopenTournament(id) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(en ? 'Reopen this tournament (back to upcoming)?' : 'Открыть турнир снова (вернуть в предстоящие)?')) return;
    db.ref('tournaments/' + id).update({ status: 'upcoming', finishedAt: null }).then(function() {
        toast(en ? '↩️ Tournament reopened' : '↩️ Турнир снова открыт', 'info');
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// ==========================================
// ГРУППЫ УЧАСТНИКОВ ПО ГАНДИКАПУ (дивизионы)
// Пример: «Мужчины 0–12» (мужчины, HCP 0–12, синие ТИ).
// Хранятся в tournaments/<id>/divisions.
// ==========================================
function tnToggleDivPanel(id) {
    var panel = document.getElementById('tn-div-' + id);
    if (panel) {
        var willOpen = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        tnDivOpen[id] = willOpen;
    }
}

// ── БЛОК «ОБРЕЗКА ГАНДИКАПА» В КАРТОЧКЕ ТУРНИРА ──
// СТОИТ ВЫШЕ групп и умного распределения: сначала админ указывает, будет ли
// гандикап обрезан (процент / максимум по полу), и только потом запускает
// «Умные группы» — те режут по ОБРЕЗАННЫМ гандикапам (tnApplyHcpCut).
// Данные — те же, что у стартового листа: tournaments/<id>/hcpCut.
function tnCutBoxHtml(tnId, tVal) {
    var en = currentLang === 'en';
    var cut = (tVal && typeof tVal.hcpCut === 'object' && tVal.hcpCut) ? tVal.hcpCut : null;
    var cutOn = !!(cut && cut.enabled === true);
    var maxOn = cut
        ? ((cut.maxEnabled === undefined || cut.maxEnabled === null)
            ? ((cut.maxMen !== '' && cut.maxMen != null) || (cut.maxWomen !== '' && cut.maxWomen != null))
            : (cut.maxEnabled === true))
        : false;
    var pct = (cut && cut.percent !== '' && cut.percent != null) ? cut.percent : 90;
    var maxM = (cut && cut.maxMen !== '' && cut.maxMen != null) ? String(cut.maxMen) : '';
    var maxW = (cut && cut.maxWomen !== '' && cut.maxWomen != null) ? String(cut.maxWomen) : '';
    var stateTxt = (cutOn || maxOn)
        ? (en ? 'Cut is ON — smart groups and the start list use the cut handicaps' : 'Обрезка включена — умные группы и стартовый лист считают от обрезанного HCP')
        : (en ? 'Cut is off — handicaps are used as-is' : 'Обрезка выключена — гандикапы используются как есть');
    var html = '<div class="tn-cut-box" style="background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.35);border-radius:10px;padding:10px 12px;margin-bottom:12px;">';
    html += '<div style="font-weight:800;color:var(--gold);font-size:13.5px;margin-bottom:6px;"><i class="fas fa-scissors"></i> ' +
        (en ? 'Handicap cut (this tournament only)' : 'Обрезка гандикапа (только для этого турнира)') + '</div>';
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">';
    html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--white);font-weight:700;">' +
        '<input type="checkbox" id="tn-cut-enabled-' + tnId + '" ' + (cutOn ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer;"> ' +
        (en ? '✂ Cut by percent' : '✂ Обрезать на процент') + '</label>';
    html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--white);font-weight:700;">' +
        '<input type="checkbox" id="tn-cut-max-enabled-' + tnId + '" ' + (maxOn ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer;"> ' +
        (en ? '✂ Cap by gender max' : '✂ Ограничить максимум по полу') + '</label>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">';
    html += '<div class="form-group" style="flex:0 1 120px;margin:0;"><label style="font-size:11px;">' + (en ? 'Percent (e.g. 90 = 90%)' : 'Процент (напр. 90 = 90%)') + '</label>' +
        '<input type="number" id="tn-cut-percent-' + tnId + '" class="form-input" min="1" max="100" step="1" style="padding:7px 10px;font-size:12.5px;" value="' + pct + '"></div>';
    html += '<div class="form-group" style="flex:1 1 110px;margin:0;"><label style="font-size:11px;">' + (en ? 'Max exact HCP — men' : 'Макс. точный HCP — мужчины') + '</label>' +
        '<input type="text" id="tn-cut-maxmen-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" placeholder="' + (en ? 'no limit' : 'без лимита') + '" value="' + maxM.replace(/"/g, '&quot;') + '"></div>';
    html += '<div class="form-group" style="flex:1 1 110px;margin:0;"><label style="font-size:11px;">' + (en ? 'Max exact HCP — women' : 'Макс. точный HCP — девушки') + '</label>' +
        '<input type="text" id="tn-cut-maxwomen-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" placeholder="' + (en ? 'no limit' : 'без лимита') + '" value="' + maxW.replace(/"/g, '&quot;') + '"></div>';
    html += '<button class="btn btn-g btn-sm" onclick="tnApplyCutBox(\'' + tnId + '\')"><i class="fas fa-check"></i> ' + (en ? 'Apply cut' : 'Применить обрезку') + '</button>';
    html += '</div>';
    html += '<div style="font-size:11.5px;color:var(--muted);margin-top:6px;"><i class="fas fa-circle-info"></i> ' + stateTxt + '.</div>';
    html += '<p style="font-size:11px;color:var(--muted);margin:6px 0 0;"><i class="fas fa-circle-info"></i> ' +
        (en ? 'The percent applies first, then the gender max. Course handicap is calculated from the cut exact value. Example: exact 36 → 90% = 32.4 → max 28 → plays off 28.0. After “Apply” the start list and groups recalculate immediately.'
            : 'Сначала применяется процент, затем максимум по полу. Полевой гандикап считается от обрезанного точного. Пример: точный 36 → 90% = 32.4 → макс. 28 → играет с 28.0. После «Применить» стартовый лист и группы пересчитаются сразу.') + '</p>';
    html += '</div>';
    return html;
}

// «Применить обрезку» в карточке турнира: значения — из полей (даже если
// фокус ещё в поле), записываем в tournaments/<id>/hcpCut в том же формате,
// что и стартовый лист (psCutObject), — везде считают одинаково.
function tnApplyCutBox(tnId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    var g = function(id) { return document.getElementById(id); };
    var enCb = g('tn-cut-enabled-' + tnId);
    var maxCb = g('tn-cut-max-enabled-' + tnId);
    var pctEl = g('tn-cut-percent-' + tnId);
    var mmEl = g('tn-cut-maxmen-' + tnId);
    var mwEl = g('tn-cut-maxwomen-' + tnId);
    var cut = { enabled: !!(enCb && enCb.checked), maxEnabled: !!(maxCb && maxCb.checked), percent: 100, maxMen: null, maxWomen: null };
    if (pctEl) {
        var n = parseFloat(pctEl.value);
        cut.percent = isNaN(n) ? 100 : Math.max(1, Math.min(100, n));
    }
    [['maxMen', mmEl], ['maxWomen', mwEl]].forEach(function(pair) {
        if (!pair[1]) return;
        var s = String(pair[1].value == null ? '' : pair[1].value).trim().replace(',', '.');
        if (s === '') return;
        var m = parseFloat(s);
        if (!isNaN(m)) cut[pair[0]] = m;
    });
    // Сколько заявленных участников затронет (по ОБРЕЗАННОМУ HCP).
    var tVal = tnTnVals[tnId];
    var reg = (tVal && tVal.registeredPlayers) || {};
    var total = 0, hit = 0;
    Object.keys(reg).forEach(function(k) {
        var rp = reg[k] || {};
        var raw = (rp.handicap === '' || rp.handicap == null) ? null : parseFloat(rp.handicap);
        if (raw == null || isNaN(raw)) return;
        total++;
        try {
            var eff = tnApplyHcpCut(raw, rp.gender || 'men', cut).effective;
            if (Math.abs(eff - raw) >= 0.049) hit++;
        } catch (e) { console.warn("[silent]", e); }
    });
    db.ref('tournaments/' + tnId + '/hcpCut').set(cut).then(function() {
        var parts = [];
        if (cut.enabled) parts.push(cut.percent + '%');
        if (cut.maxEnabled) {
            var lims = [];
            if (cut.maxMen != null) lims.push((en ? 'men' : 'муж') + ' ≤ ' + cut.maxMen);
            if (cut.maxWomen != null) lims.push((en ? 'women' : 'жен') + ' ≤ ' + cut.maxWomen);
            parts.push((en ? 'max' : 'макс') + (lims.length ? ' (' + lims.join(', ') + ')' : ''));
        }
        if (!parts.length) {
            toast(en ? '✂ Cut is off — start list unchanged' : '✂ Обрезка выключена — стартовый лист без изменений', 'info');
        } else {
            toast((en ? '✂ Cut applied (' : '✂ Обрезка применена (') + parts.join(' + ') + '): ' +
                (en ? 'affects' : 'затронуто') + ' ' + hit + ' / ' + total, 'success');
        }
        if (typeof vib === 'function') vib([40, 30, 40]);
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// Перерисовка только панели «Группы HCP» конкретного турнира (по кэшу
// tnTnVals, без обращения к базе) — для инлайн-редактирования групп.
function tnReRenderDivPanel(tnId) {
    var tVal = tnTnVals[tnId];
    if (!tVal) return;
    var panel = document.getElementById('tn-div-' + tnId);
    if (!panel) return;
    var divs = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tVal) : [];
    panel.innerHTML = tnDivisionsEditorHtml(tnId, divs, tVal);
}

// Селектор формата группы по гандикапу: форматы турнира (+ стандартные),
// пусто — «наследуется» от протокола/турнира.
function tnFormatOptionsHtml(tVal, sel) {
    var en = currentLang === 'en';
    var list = (tVal && Array.isArray(tVal.formats) && tVal.formats.length)
        ? tVal.formats.slice()
        : ['Stroke Play', 'Stableford'];
    var used = {};
    var html = '<option value=""' + (!sel ? ' selected' : '') + '>' + (en ? '— (inherit)' : '— (наследуется)') + '</option>';
    list.forEach(function(f) {
        if (!f || used[f]) return;
        used[f] = true;
        var v = escapeHtml(String(f)).replace(/"/g, '&quot;');
        html += '<option value="' + v + '"' + (String(f) === String(sel || '') ? ' selected' : '') + '>' + escapeHtml(String(f)) + '</option>';
    });
    if (sel && !used[sel]) {
        html += '<option value="' + escapeHtml(String(sel)).replace(/"/g, '&quot;') + '" selected>' + escapeHtml(String(sel)) + '</option>';
    }
    return html;
}

// Синхронизирует ТИ и формат групп по гандикапу обратно в список участников
// турнира (registeredPlayers): игрок «мужчины 0–12 · стабфорд · белые ТИ»
// получает в списке именно эти ТИ и формат.
function tnSyncDivisionsToRoster(tnId) {
    if (typeof db === 'undefined' || !db) return;
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal) return;
        var divisions = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tVal) : [];
        if (!divisions.length) return;
        var reg = tVal.registeredPlayers || {};
        var updates = {};
        Object.keys(reg).forEach(function(k) {
            var rp = reg[k] || {};
            var rawHcp = (rp.handicap === '' || rp.handicap == null) ? null : parseFloat(rp.handicap);
            var gender = rp.gender || 'men';
            var eff = rawHcp;
            if (rawHcp != null && tVal.hcpCut && typeof tnApplyHcpCut === 'function') {
                try { eff = tnApplyHcpCut(rawHcp, gender, tVal.hcpCut).effective; } catch (e) { console.warn("[silent]", e); }
            }
            var d = (typeof tnFindDivision === 'function')
                ? tnFindDivision(tVal, eff, gender, { pid: k, name: rp.name || '' })
                : null;
            if (!d) return;
            if (d.tee) updates['tournaments/' + tnId + '/registeredPlayers/' + k + '/tee'] = d.tee;
            if (d.format) updates['tournaments/' + tnId + '/registeredPlayers/' + k + '/format'] = d.format;
        });
        if (Object.keys(updates).length) {
            return db.ref().update(updates).catch(function() {});
        }
    }).catch(function() {});
}

function tnDivisionsEditorHtml(tnId, divisions, tVal) {
    var en = currentLang === 'en';
    divisions = divisions || [];
    // СНАЧАЛА — обрезка гандикапа (выше групп и умного распределения):
    // админ сначала указывает, будет ли HCP порезан, и только потом
    // запускает умное распределение — оно режет по обрезанным гандикапам.
    var html = tnCutBoxHtml(tnId, tVal || {});
    html += '<div style="font-weight:800;color:var(--gold);font-size:13.5px;margin-bottom:8px;"><i class="fas fa-layer-group"></i> ' +
        (en ? 'Handicap groups' : 'Группы участников по гандикапу') + '</div>';
    if (!divisions.length) {
        html += '<p style="font-size:12px;color:var(--muted);margin:0 0 10px;">' +
            (en ? 'No groups yet. Example: “Men 0–12” (men, HCP 0–12, blue tees) and “Men 12.1–28” (men, HCP 12.1–28, white tees).'
                : 'Групп пока нет. Пример: «Мужчины 0–12» (мужчины, HCP 0–12, синие ТИ) и «Мужчины 12.1–28» (мужчины, HCP 12.1–28, белые ТИ).') + '</p>';
    } else {
        divisions.forEach(function(d) {
            var rg = (typeof tnDivisionRangeText === 'function') ? tnDivisionRangeText(d) : '';
            var g = (typeof tnDivisionGenderText === 'function') ? tnDivisionGenderText(d.gender) : (d.gender || '');
            var teeTxt = d.tee ? t('tee_' + d.tee) : '';
            if (tnDivEditing[tnId] === d.id) {
                // Инлайн-редактирование группы: название, пол, диапазон HCP, ТИ.
                html += '<div class="tn-div-edit" style="background:rgba(255,255,255,0.04);border:1px solid rgba(201,168,76,0.4);border-radius:10px;padding:10px;margin-bottom:8px;">';
                html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">';
                html += '<div class="form-group" style="flex:2 1 150px;margin:0;"><label style="font-size:11px;">' + (en ? 'Group name' : 'Название группы') + '</label>' +
                    '<input type="text" id="tnde-name-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" value="' + String(d.name || '').replace(/"/g, '&quot;') + '"></div>';
                html += '<div class="form-group" style="flex:1 1 100px;margin:0;"><label style="font-size:11px;">' + (en ? 'Gender' : 'Пол') + '</label>' +
                    '<select id="tnde-gender-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' +
                    '<option value="men"' + (d.gender === 'men' ? ' selected' : '') + '>' + (en ? 'Men' : 'Мужчины') + '</option>' +
                    '<option value="women"' + (d.gender === 'women' ? ' selected' : '') + '>' + (en ? 'Women' : 'Девушки') + '</option>' +
                    '<option value="all"' + ((d.gender || 'all') === 'all' ? ' selected' : '') + '>' + (en ? 'All' : 'Все') + '</option></select></div>';
                html += '<div class="form-group" style="flex:0 1 76px;margin:0;"><label style="font-size:11px;">HCP ' + (en ? 'from' : 'от') + '</label>' +
                    '<input type="text" id="tnde-from-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" value="' + (d.hcpFrom === '' || d.hcpFrom == null ? '' : d.hcpFrom) + '"></div>';
                html += '<div class="form-group" style="flex:0 1 76px;margin:0;"><label style="font-size:11px;">HCP ' + (en ? 'to' : 'до') + '</label>' +
                    '<input type="text" id="tnde-to-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" value="' + (d.hcpTo === '' || d.hcpTo == null ? '' : d.hcpTo) + '"></div>';
                html += '<div class="form-group" style="flex:1 1 110px;margin:0;"><label style="font-size:11px;">' + t('tee_select') + '</label>' +
                    '<select id="tnde-tee-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' +
                    '<option value=""' + (!d.tee ? ' selected' : '') + '>—</option><option value="bk"' + (d.tee === 'bk' ? ' selected' : '') + '>' + t('tee_bk') + '</option>' +
                    '<option value="bl"' + (d.tee === 'bl' ? ' selected' : '') + '>' + t('tee_bl') + '</option>' +
                    '<option value="wh"' + (d.tee === 'wh' ? ' selected' : '') + '>' + t('tee_wh') + '</option>' +
                    '<option value="rd"' + (d.tee === 'rd' ? ' selected' : '') + '>' + t('tee_rd') + '</option></select></div>';
                html += '<div class="form-group" style="flex:1 1 150px;margin:0;"><label style="font-size:11px;">' + (en ? 'Format' : 'Формат') + '</label>' +
                    '<select id="tnde-format-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' + tnFormatOptionsHtml(tVal, d.format) + '</select></div>';
                html += '<button class="btn btn-g btn-sm" onclick="tnSaveDivision(\'' + tnId + '\',\'' + d.id + '\')"><i class="fas fa-check"></i> ' + (en ? 'Save' : 'Сохранить') + '</button>';
                html += '<button class="btn btn-og btn-sm" onclick="tnCancelEditDiv(\'' + tnId + '\')"><i class="fas fa-xmark"></i> ' + (en ? 'Cancel' : 'Отмена') + '</button>';
                html += '</div></div>';
            } else {
                // Мета: если есть название — только ТИ (название вида
                // «Мужчины 0–12» уже содержит пол и диапазон — не дублируем).
                var fmtTxt = d.format ? escapeHtml(String(d.format)) : '';
                var meta = d.name
                    ? ((teeTxt ? escapeHtml(teeTxt) : '') + (fmtTxt ? ' · ' + fmtTxt : ''))
                    : escapeHtml(g) + (rg ? ' · HCP ' + escapeHtml(rg) : '') + (teeTxt ? ' · ' + escapeHtml(teeTxt) : '') + (fmtTxt ? ' · ' + fmtTxt : '');
                // ✨ — группа создана «Умными группами» (auto): повторный
                // запуск распределителя заменит только такие.
                var autoMark = d.auto === true
                    ? ' <i class="fas fa-wand-magic-sparkles" style="color:var(--gold);font-size:10.5px;" title="' + (en ? 'Created by smart groups' : 'Создана «Умными группами»') + '"></i>'
                    : '';
                // «Умные группы» хранят точный состав — показываем число игроков,
                // чтобы админ сразу видел равенство групп (22/22/22).
                var membersObj = (d.members && typeof d.members === 'object') ? d.members : null;
                var membersTxt = membersObj
                    ? '<span class="tn-div-meta" style="color:var(--blue);"><i class="fas fa-users"></i> ' + Object.keys(membersObj).length + '</span>'
                    : '';
                html += '<div class="tn-div-row"><span class="tn-div-name">' + escapeHtml(d.name || '—') + autoMark + '</span>' +
                    (meta ? '<span class="tn-div-meta">' + meta + '</span>' : '') + membersTxt +
                    '<span style="margin-left:auto;display:flex;gap:6px;">' +
                    '<button class="btn btn-og btn-sm" title="' + (en ? 'Edit group' : 'Изменить группу') + '" onclick="tnEditDivision(\'' + tnId + '\',\'' + d.id + '\')"><i class="fas fa-pen"></i></button>' +
                    '<button class="btn btn-r btn-sm" title="' + (en ? 'Delete group' : 'Удалить группу') + '" onclick="tnDeleteDivision(\'' + tnId + '\',\'' + d.id + '\')"><i class="fas fa-trash"></i></button>' +
                    '</span></div>';
            }
        });
    }
    // Умное создание: РАВНЫЕ по числу игроков группы по фактическим HCP,
    // минимум 3 мужские + 3 женские (С УЧЁТОМ обрезки — блок выше:
    // сначала обрезка, потом распределение).
    var autoCnt = parseInt((tVal && tVal.autoGroupCount) || 0, 10) || 0;
    var cntOpts = '<option value="0"' + (autoCnt === 0 ? ' selected' : '') + '>' + (en ? 'Auto (min. 3)' : 'Авто (мин. 3)') + '</option>';
    [2, 3, 4, 5, 6, 8].forEach(function(n) {
        cntOpts += '<option value="' + n + '"' + (autoCnt === n ? ' selected' : '') + '>' + n + '</option>';
    });
    html += '<div style="margin-top:10px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">';
    html += '<div class="form-group" style="flex:0 1 170px;margin:0;"><label style="font-size:11px;">' + (en ? 'Groups per gender' : 'Групп на каждый пол') + '</label>' +
        '<select id="tnd-count-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' + cntOpts + '</select></div>';
    html += '<button class="btn btn-g btn-sm" onclick="tnAutoDivisions(\'' + tnId + '\')"><i class="fas fa-wand-magic-sparkles"></i> ' +
        (en ? 'Smart groups (equal counts)' : '✨ Умные группы (поровну игроков)') + '</button>';
    html += '</div>';
    html += '<p style="font-size:11px;color:var(--muted);margin:6px 0 0;"><i class="fas fa-circle-info"></i> ' +
        (en ? 'Groups are equal by player count and go from the lowest handicap (group 1) to the highest. The exact list of players is saved in each group.'
            : 'Группы равны по числу игроков и идут от самых низких гандикапов (группа 1) к высоким. Точный список игроков сохраняется в каждой группе.') + '</p>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:flex-end;">';
    html += '<div class="form-group" style="flex:2 1 150px;margin:0;"><label style="font-size:11px;">' + (en ? 'Group name' : 'Название группы') + '</label>' +
        '<input type="text" id="tnd-name-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" placeholder="' + (en ? 'Men 0–12' : 'Мужчины 0–12') + '"></div>';
    html += '<div class="form-group" style="flex:1 1 100px;margin:0;"><label style="font-size:11px;">' + (en ? 'Gender' : 'Пол') + '</label>' +
        '<select id="tnd-gender-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' +
        '<option value="men">' + (en ? 'Men' : 'Мужчины') + '</option>' +
        '<option value="women">' + (en ? 'Women' : 'Девушки') + '</option>' +
        '<option value="all">' + (en ? 'All' : 'Все') + '</option></select></div>';
    html += '<div class="form-group" style="flex:0 1 76px;margin:0;"><label style="font-size:11px;">HCP ' + (en ? 'from' : 'от') + '</label>' +
        '<input type="text" id="tnd-from-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" placeholder="0"></div>';
    html += '<div class="form-group" style="flex:0 1 76px;margin:0;"><label style="font-size:11px;">HCP ' + (en ? 'to' : 'до') + '</label>' +
        '<input type="text" id="tnd-to-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" placeholder="12"></div>';
    html += '<div class="form-group" style="flex:1 1 110px;margin:0;"><label style="font-size:11px;">' + t('tee_select') + '</label>' +
        '<select id="tnd-tee-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' +
        '<option value="">—</option><option value="bk">' + t('tee_bk') + '</option><option value="bl">' + t('tee_bl') + '</option>' +
        '<option value="wh">' + t('tee_wh') + '</option><option value="rd">' + t('tee_rd') + '</option></select></div>';
    html += '<div class="form-group" style="flex:1 1 150px;margin:0;"><label style="font-size:11px;">' + (en ? 'Format' : 'Формат') + '</label>' +
        '<select id="tnd-format-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' + tnFormatOptionsHtml(tVal, '') + '</select></div>';
    html += '<button class="btn btn-g btn-sm" onclick="tnAddDivision(\'' + tnId + '\')"><i class="fas fa-plus"></i> ' + (en ? 'Add' : 'Добавить') + '</button>';
    html += '</div>';
    return html;
}

// Инлайн-редактирование группы: режим правки одной группы + перерисовка
// панели. Данные берутся из кэша tnTnVals (заполняется подпиской).
function tnEditDivision(tnId, divId) {
    tnDivEditing[tnId] = divId;
    tnReRenderDivPanel(tnId);
}

function tnCancelEditDiv(tnId) {
    delete tnDivEditing[tnId];
    tnReRenderDivPanel(tnId);
}

// Сохранение правок группы: имя, пол, HCP от/до, ТИ.
function tnSaveDivision(tnId, divId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    var g = function(id) { return document.getElementById(id); };
    var nameEl = g('tnde-name-' + tnId + '-' + divId);
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
        toast(en ? '⚠️ Enter the group name' : '⚠️ Укажите название группы', 'error');
        if (nameEl && nameEl.focus) nameEl.focus();
        return;
    }
    var from = tnParseDivBound(g('tnde-from-' + tnId + '-' + divId) ? g('tnde-from-' + tnId + '-' + divId).value : '');
    var to = tnParseDivBound(g('tnde-to-' + tnId + '-' + divId) ? g('tnde-to-' + tnId + '-' + divId).value : '');
    if (isNaN(from) || isNaN(to)) {
        toast(en ? '⚠️ Invalid HCP range (use numbers like 0, 12.1)' : '⚠️ Некорректный диапазон HCP (нужны числа, например 0, 12.1)', 'error');
        return;
    }
    if (from !== '' && to !== '' && from > to) {
        toast(en ? '⚠️ “HCP from” must be less than “HCP to”' : '⚠️ «HCP от» должен быть меньше «HCP до»', 'error');
        return;
    }
    var genderEl = g('tnde-gender-' + tnId + '-' + divId);
    var teeEl = g('tnde-tee-' + tnId + '-' + divId);
    var fmtEl = g('tnde-format-' + tnId + '-' + divId);
    delete tnDivEditing[tnId];
    db.ref('tournaments/' + tnId + '/divisions/' + divId).update({
        name: name,
        gender: genderEl ? genderEl.value : 'men',
        hcpFrom: from,
        hcpTo: to,
        tee: teeEl ? teeEl.value : '',
        format: fmtEl ? fmtEl.value : ''
    }).then(function() {
        toast(en ? '✅ Group updated' : '✅ Группа обновлена', 'success');
        try { tnSyncDivisionsToRoster(tnId); } catch (eSync) { console.warn("[silent]", eSync); }
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}


function tnParseDivBound(raw) {
    var s = String(raw == null ? '' : raw).trim().replace(',', '.');
    if (s === '') return '';
    var v = (typeof parseExactHcp === 'function') ? parseExactHcp(s) : parseFloat(s);
    return isNaN(v) ? NaN : Math.round(v * 10) / 10;
}

function tnAddDivision(tnId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    var g = function(id) { return document.getElementById(id); };
    var nameEl = g('tnd-name-' + tnId);
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
        toast(en ? '⚠️ Enter the group name' : '⚠️ Укажите название группы', 'error');
        if (nameEl && nameEl.focus) nameEl.focus();
        return;
    }
    var genderEl = g('tnd-gender-' + tnId);
    var teeEl = g('tnd-tee-' + tnId);
    var fmtEl = g('tnd-format-' + tnId);
    var from = tnParseDivBound(g('tnd-from-' + tnId) ? g('tnd-from-' + tnId).value : '');
    var to = tnParseDivBound(g('tnd-to-' + tnId) ? g('tnd-to-' + tnId).value : '');
    if (isNaN(from) || isNaN(to)) {
        toast(en ? '⚠️ Invalid HCP range (use numbers like 0, 12.1)' : '⚠️ Некорректный диапазон HCP (нужны числа, например 0, 12.1)', 'error');
        return;
    }
    if (from !== '' && to !== '' && from > to) {
        toast(en ? '⚠️ “HCP from” must be less than “HCP to”' : '⚠️ «HCP от» должен быть меньше «HCP до»', 'error');
        return;
    }
    tnDivOpen[tnId] = true;
    db.ref('tournaments/' + tnId + '/divisions').push({
        name: name,
        gender: genderEl ? genderEl.value : 'men',
        hcpFrom: from,
        hcpTo: to,
        tee: teeEl ? teeEl.value : '',
        format: fmtEl ? fmtEl.value : '',
        createdAt: Date.now()
    }).then(function() {
        toast(en ? '✅ Group added' : '✅ Группа добавлена', 'success');
        try { tnSyncDivisionsToRoster(tnId); } catch (eSync) { console.warn("[silent]", eSync); }
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function tnDeleteDivision(tnId, divId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(en ? 'Delete this handicap group?' : 'Удалить эту группу по гандикапу?')) return;
    tnDivOpen[tnId] = true;
    db.ref('tournaments/' + tnId + '/divisions/' + divId).remove().then(function() {
        toast(en ? 'Group deleted' : 'Группа удалена', 'info');
        try { tnSyncDivisionsToRoster(tnId); } catch (eSync) { console.warn("[silent]", eSync); }
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// ==========================================
// ВЫЗОВЫ СУДЕЙ/МАРШАЛОВ И УВЕДОМЛЕНИЯ
// ==========================================

// Число для названия умной группы: целые — без «.0», плюсовые — с «+».
function tnBandNum(v) {
    var s = (typeof fmtExactHcp === 'function') ? fmtExactHcp(v) : String(v);
    return String(s).replace(/\.0$/, '');
}

// ── Умные группы: правила распределения ──
//   • МИНИМУМ 3 группы на каждый пол (если игроков этого пола ≥ 3);
//   • больше 3 — только когда игроков реально много: в группе не больше
//     TN_AUTO_MAX_PER_GROUP человек (мягкий предел);
//   • группы РАВНЫ по числу игроков (22/22/22, а не 22/44);
//   • состав каждой группы фиксируется явно (members), поэтому игрок
//     никогда не «теряется» между диапазонами HCP, а группа не бывает пустой;
//   • группы нумеруются по возрастанию гандикапа: 1 — самые низкие HCP.
var TN_AUTO_MIN_PER_GENDER = 3;
var TN_AUTO_MAX_PER_GROUP = 24;

// Сколько групп создавать для n игроков одного пола. wanted — число из поля
// в админке (0/пусто = авто).
function tnAutoGroupCount(n, wanted) {
    n = parseInt(n, 10) || 0;
    if (n <= 0) return 0;
    var cnt = parseInt(wanted, 10);
    if (!cnt || cnt < 1) {
        cnt = Math.max(TN_AUTO_MIN_PER_GENDER, Math.ceil(n / TN_AUTO_MAX_PER_GROUP));
    }
    if (cnt > n) cnt = n;
    return Math.max(1, cnt);
}

// Умное создание групп по гандикапу: участники турнира делятся по полу,
// сортируются по точному HCP и режутся на равные по числу игроков bands
// (по умолчанию 3 мужские + 3 женские). Границы bands — по реальным
// гандикапам участников, чтобы в каждой группе было поровну игроков.
function tnAutoDivisions(tnId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal) return;
        var reg = tVal.registeredPlayers || {};
        var keys = Object.keys(reg);
        if (!keys.length) {
            toast(en ? '⚠️ No registered players — nobody to split into groups' : '⚠️ Нет заявленных участников — некого делить на группы', 'error');
            return;
        }
        // Дедуп по ФИО: один человек — один голос в разбивке.
        var seen = {};
        var men = [];
        var women = [];
        keys.forEach(function(k) {
            var rp = reg[k] || {};
            var fioKey = '';
            if (typeof getPlayerFioKey === 'function') {
                try { fioKey = getPlayerFioKey(rp); } catch (e) { console.warn("[silent]", e); }
            }
            if (!fioKey) fioKey = String(rp.name || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
            if (fioKey && seen[fioKey]) return;
            if (fioKey) seen[fioKey] = true;
            var h = (rp.handicap === '' || rp.handicap == null) ? null : parseFloat(rp.handicap);
            if (h != null && isNaN(h)) h = null;
            // Обрезка гандикапа (блок в панели выше): режем по ОБРЕЗАННОМУ
            // точному HCP — именно с ним играет игрок, и группы строим от него.
            if (h != null && tVal && tVal.hcpCut && typeof tnApplyHcpCut === 'function') {
                try { h = tnApplyHcpCut(h, rp.gender || 'men', tVal.hcpCut).effective; } catch (e) { console.warn("[silent]", e); }
            }
            var item = { key: k, fioKey: fioKey, name: rp.name || '', hcp: h, sortHcp: (h == null ? 54 : h) };
            if ((rp.gender || 'men') === 'women') women.push(item);
            else men.push(item);
        });

        var bandsOf = function(arr, count) {
            arr.sort(function(a, b) {
                return (a.sortHcp - b.sortHcp) || String(a.name || '').localeCompare(String(b.name || ''));
            });
            var n = arr.length;
            if (!n) return [];
            count = Math.max(1, Math.min(count, n));
            var base = Math.floor(n / count);
            var rem = n % count;
            var bands = [];
            var pos = 0;
            for (var i = 0; i < count; i++) {
                // Лишние игроки распределяются по первым группам — разница
                // в размерах не больше одного человека.
                var take = base + (i < rem ? 1 : 0);
                if (take <= 0) break;
                bands.push(arr.slice(pos, pos + take));
                pos += take;
            }
            return bands;
        };

        var r1 = function(v) { return Math.round(v * 10) / 10; };
        var plan = [];
        // Сколько групп просит админ (0/пусто — авто: минимум 3, но не больше
        // TN_AUTO_MAX_PER_GROUP игроков в группе).
        var wantedEl = document.getElementById('tnd-count-' + tnId);
        var wanted = wantedEl ? wantedEl.value : (tVal.autoGroupCount || 0);
        var addGender = function(arr, gender, teeStrong, teeRest, titleWord) {
            var count = tnAutoGroupCount(arr.length, wanted);
            if (!count) return;
            var bands = bandsOf(arr, count);
            // Границы диапазонов идут «встык»: следующая группа начинается
            // с (максимум предыдущей + 0.1), поэтому у игроков на границе
            // не возникает двух подходящих групп.
            var prevTo = null;
            bands.forEach(function(band, bi) {
                if (!band.length) return; // пустых групп не создаём
                var known = band.map(function(x) { return x.hcp; }).filter(function(v) { return v != null; });
                var mn = known.length ? Math.min.apply(null, known) : 54;
                var mx = known.length ? Math.max.apply(null, known) : 54;
                var from = (prevTo == null) ? r1(mn) : r1(prevTo + 0.1);
                var to = r1(mx);
                if (from > to) from = to;
                prevTo = to;
                // Точный состав группы (ключ заявки → нормализованное ФИО):
                // в ростере и лидерборде группа определяется по составу, а не
                // по границам HCP — игрок на границе не «уплывёт» в соседнюю.
                var members = {};
                band.forEach(function(x) {
                    if (x.key) members[x.key] = x.fioKey || '';
                });
                plan.push({
                    // «Мужчины 1 · 0–12»: номер группы сразу показывает порядок
                    // по гандикапу, скобки с диапазоном не дублируют название.
                    name: titleWord + ' ' + (bi + 1) + ' · ' + tnBandNum(from) + '–' + tnBandNum(to),
                    gender: gender,
                    hcpFrom: from,
                    hcpTo: to,
                    tee: bi === 0 ? teeStrong : teeRest,
                    format: '',
                    count: band.length,
                    bandNo: bi + 1,
                    members: members
                });
            });
        };
        addGender(men, 'men', 'bl', 'wh', en ? 'Men' : 'Мужчины');
        addGender(women, 'women', 'rd', 'rd', en ? 'Women' : 'Девушки');

        if (!plan.length) {
            toast(en ? '⚠️ Nobody to split into groups' : '⚠️ Некого делить на группы', 'error');
            return;
        }
        var preview = plan.map(function(d) {
            return '• ' + d.name + ' (' + d.count + ' ' + (en ? 'pl.' : 'игр.') + ')';
        }).join('\n');
        // Если на турнире включена обрезка — показываем, что границы групп
        // считались от ОБРЕЗАННЫХ гандикапов.
        var cut = (tVal && typeof tVal.hcpCut === 'object' && tVal.hcpCut) ? tVal.hcpCut : null;
        var cutOn = !!(cut && (cut.enabled === true ||
            (cut.maxEnabled !== false && ((cut.maxMen !== '' && cut.maxMen != null) || (cut.maxWomen !== '' && cut.maxWomen != null)))));
        var cutNote = cutOn
            ? (en ? '\n\n✂ Uses the CUT handicaps (cut settings from the block above).' : '\n\n✂ Границы считаются от ОБРЕЗАННЫХ гандикапов (настройки обрезки — в блоке выше).')
            : '';
        var q = en
            ? 'Create ' + plan.length + ' handicap groups by actual handicaps (equal player counts)?\n\n' + preview + cutNote
            : 'Создать ' + plan.length + ' групп по фактическим гандикапам (поровну игроков)?\n\n' + preview + cutNote;
        if (!confirm(q)) return;

        tnDivOpen[tnId] = true;
        var ref = db.ref('tournaments/' + tnId + '/divisions');
        // Повторный запуск: сначала убираем группы, созданные РАЗЫМ умным
        // распределителем (flag auto) — ручные группы админа не трогаем.
        var oldAuto = (typeof tnNormalizeDivisions === 'function')
            ? tnNormalizeDivisions(tVal).filter(function(d) { return d.auto === true; })
            : [];
        var chain = Promise.resolve();
        oldAuto.forEach(function(d) {
            if (!d.id) return;
            chain = chain.then(function() { return ref.child(d.id).remove(); });
        });
        chain = chain.then(function() {
            // Запоминаем выбранное число групп на пол (0 = авто), чтобы
            // повторный запуск и перезагрузка страницы сохраняли настройку.
            return db.ref('tournaments/' + tnId + '/autoGroupCount')
                .set(parseInt(wanted, 10) || 0).catch(function() {});
        });
        chain = chain.then(function() {
            var c = Promise.resolve();
            plan.forEach(function(d) {
                c = c.then(function() {
                    return ref.push({
                        name: d.name,
                        gender: d.gender,
                        hcpFrom: d.hcpFrom,
                        hcpTo: d.hcpTo,
                        tee: d.tee,
                        format: d.format || '',
                        members: d.members || {},
                        bandNo: d.bandNo || null,
                        createdAt: Date.now(),
                        auto: true
                    });
                });
            });
            return c;
        });
        chain.then(function() {
            var menN = plan.filter(function(d) { return d.gender === 'men'; }).length;
            var womenN = plan.filter(function(d) { return d.gender === 'women'; }).length;
            // ТИ групп уходят обратно в список участников турнира: игроки
            // «Мужчины 0–12» получают синие ТИ, «Девушки» — красные и т.д.
            try { tnSyncDivisionsToRoster(tnId); } catch (eSync) { console.warn("[silent]", eSync); }
            toast((en ? '✨ Smart groups created: ' : '✨ Умные группы созданы: ') + plan.length +
                ' (' + (en ? 'men ' : 'муж. ') + menN + (en ? ', women ' : ', жен. ') + womenN + ')', 'success');
        }).catch(function(err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

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

            Object.entries(r.players || {}).forEach(function(pe) {
                var p = pe[1] || {};
                // Удалённые в админке игроки в архив не попадают.
                if (typeof isPlayerDeleted === 'function') {
                    try { if (isPlayerDeleted(pe[0], p.name)) return; } catch (e) { console.warn("[silent]", e); }
                }
                var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, getRoundOrder(r));
                var row = [
                    rid,
                    dateStr,
                    timeStr,
                    r.mode || 'group',
                    (typeof pestovoRoundFormatBadge === 'function') ? pestovoRoundFormatBadge(r, 'Stroke') : (r.format || 'Stroke'),
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
// DEFAULT STABLEFORD DISPLAY MANAGEMENT
// ==========================================
function loadStablefordDisplaySettings() {
    var checkbox = document.getElementById('pv-stableford-default');
    if (!checkbox) return;

    var applyValue = function(value) {
        // Ключ ещё не создан → дефолт ВЫКЛЮЧЕН: по умолчанию очки Stableford
        // при вводе счёта не показываются ни у кого, пока админ не включит.
        var normalized = typeof normalizeStablefordDisplayValue === 'function'
            ? normalizeStablefordDisplayValue(value) : null;
        checkbox.checked = normalized === null ? false : normalized;
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

// ==========================================
// SOCIAL SCORECARD DISPLAY MANAGEMENT
// ==========================================
// Вариант сохраняется глобально в settings/social_card_variant. Экспорт PNG
// читает это значение из utils.js, а localStorage остаётся офлайн-резервом.
function loadSocialCardDisplaySettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applySocialCardVariant === 'function') {
            applySocialCardVariant(value);
        }
        markAdmSocialCardVariantButtons();
    };

    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }

    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-social-card-variant', db.ref('settings/social_card_variant'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/social_card_variant').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

function saveSocialCardVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    if (typeof vib === 'function') vib(30);

    if (typeof applySocialCardVariant === 'function') applySocialCardVariant(v);
    else markAdmSocialCardVariantButtons();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Card style saved locally' : 'Стиль карточки сохранён локально', 'info');
        return;
    }

    db.ref('settings/social_card_variant').set(v).then(function() {
        toast(currentLang === 'en'
            ? '✅ Social scorecard style saved for all players'
            : '✅ Стиль PNG-карточки сохранён для всех игроков', 'success');
    }).catch(function(err) {
        console.warn('Social card variant save error:', err);
        toast(currentLang === 'en'
            ? 'Could not save the card style to the cloud'
            : '⚠️ Не удалось сохранить стиль карточки в облако', 'error');
    });
}

function markAdmSocialCardVariantButtons() {
    var cur = (typeof getSocialCardVariant === 'function') ? getSocialCardVariant() : '1';
    ['1', '2', '3'].forEach(function(v) {
        var btn = document.getElementById('social-card-opt-' + v);
        if (!btn) return;
        btn.classList.toggle('social-card-variant-active', v === cur);
        btn.setAttribute('aria-pressed', v === cur ? 'true' : 'false');
    });
}

// ==========================================
// GROUP ROUND CARD DISPLAY MANAGEMENT
// ==========================================
// Вариант сохраняется глобально в settings/group_round_card_variant.
// Выбор стиля единой карточки группового раунда для главной страницы.
function loadGroupCardDisplaySettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applyGroupCardVariant === 'function') {
            applyGroupCardVariant(value);
        }
        markAdmGroupCardVariantButtons();
    };

    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }

    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-group-card-variant', db.ref('settings/group_round_card_variant'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/group_round_card_variant').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

function saveGroupCardVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    if (typeof vib === 'function') vib(30);

    if (typeof applyGroupCardVariant === 'function') applyGroupCardVariant(v);
    else markAdmGroupCardVariantButtons();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Group card style saved locally' : 'Стиль групповой карточки сохранён локально', 'info');
        return;
    }

    db.ref('settings/group_round_card_variant').set(v).then(function() {
        toast(currentLang === 'en'
            ? '✅ Group round card style saved for all users'
            : '✅ Стиль карточки группового раунда сохранён для всех пользователей', 'success');
    }).catch(function(err) {
        console.warn('Group card variant save error:', err);
        toast(currentLang === 'en'
            ? 'Could not save the group card style to the cloud'
            : '⚠️ Не удалось сохранить стиль групповой карточки в облако', 'error');
    });
}

function markAdmGroupCardVariantButtons() {
    var cur = (typeof getGroupCardVariant === 'function') ? getGroupCardVariant() : '1';
    ['1', '2', '3'].forEach(function(v) {
        var btn = document.getElementById('group-card-opt-' + v);
        if (!btn) return;
        var active = (v === cur);
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.classList.toggle('group-card-variant-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

// ==========================================
// СЧЁТНАЯ КАРТОЧКА ИГРОКА В ЛИДЕРБОРДЕ ТУРНИРА
// ==========================================
// Админ выбирает оформление один раз для всего клуба:
// settings/tn_scorecard_variant → «Турниры → лидерборд → карточка игрока».
function loadTnCardDisplaySettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applyTnCardVariant === 'function') {
            applyTnCardVariant(value);
        }
        markAdmTnCardVariantButtons();
    };

    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }

    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-tn-card-variant', db.ref('settings/tn_scorecard_variant'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/tn_scorecard_variant').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

function saveTnCardVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    if (typeof vib === 'function') vib(30);

    if (typeof applyTnCardVariant === 'function') applyTnCardVariant(v);
    else markAdmTnCardVariantButtons();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Tournament scorecard style saved locally' : 'Вид счётной карточки сохранён локально', 'info');
        return;
    }

    db.ref('settings/tn_scorecard_variant').set(v).then(function() {
        toast(currentLang === 'en'
            ? '✅ Tournament scorecard style saved for all users'
            : '✅ Вид счётной карточки в лидерборде сохранён для всех пользователей', 'success');
    }).catch(function(err) {
        console.warn('Tournament scorecard variant save error:', err);
        toast(currentLang === 'en'
            ? 'Could not save the scorecard style to the cloud'
            : '⚠️ Не удалось сохранить вид счётной карточки в облако', 'error');
    });
}

function markAdmTnCardVariantButtons() {
    var cur = (typeof getTnCardVariant === 'function') ? getTnCardVariant() : '1';
    ['1', '2', '3'].forEach(function(v) {
        var btn = document.getElementById('tn-card-opt-' + v);
        if (!btn) return;
        var active = (v === cur);
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.classList.toggle('tn-card-variant-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function loadTnLbDisplaySettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applyTnLbVariant === 'function') {
            applyTnLbVariant(value);
        }
        markAdmTnLbVariantButtons();
    };
    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-tn-lb-variant', db.ref('settings/tournament_leaderboard_variant'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/tournament_leaderboard_variant').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

// ── ВИДЫ ОТОБРАЖЕНИЯ (5 вариантов): сохранение в settings/* для всех ──
function markAdmView5Buttons(name) {
    if (typeof getView5 !== 'function') return;
    var cur = getView5(name);
    ['1', '2', '3', '4', '5'].forEach(function(v) {
        var btn = document.getElementById('v5-' + name + '-' + v);
        if (!btn) return;
        var active = (String(v) === String(cur));
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function saveView5Setting(name, v) {
    if (typeof applyView5 !== 'function') return;
    if (typeof vib === 'function') vib(30);
    applyView5(name, v);
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? 'Saved locally (no database)' : 'Сохранено локально (нет базы)', 'info');
        return;
    }
    // Путь в Firebase берём из общего конфига view5 (js/utils.js) —
    // новые блоки (например, roundSetup) подключаются без правок админки.
    var cfg = (typeof PESTOVO_VIEW5_CONFIG !== 'undefined') ? PESTOVO_VIEW5_CONFIG[name] : null;
    var path = (cfg && cfg.firebase)
        ? cfg.firebase
        : { homeTournament: 'settings/home_tournament_view', scorecard: 'settings/scorecard_view', scoring: 'settings/scoring_view' }[name];
    if (!path) return;
    db.ref(path).set(String(v)).then(function() {
        toast(currentLang === 'en' ? '✅ View saved for all users' : '✅ Вид сохранён для всех пользователей', 'success');
    }).catch(function(err) {
        console.warn('view5 save error', err);
        toast(currentLang === 'en' ? 'Could not save to the cloud' : '⚠️ Не удалось сохранить в облако', 'error');
    });
}

function loadAdmView5Settings() {
    ['homeTournament', 'scorecard', 'scoring', 'roundsetup'].forEach(function(name) {
        if (typeof pestovoBindView5 === 'function') pestovoBindView5(name, function() {});
        else if (typeof markAdmView5Buttons === 'function') markAdmView5Buttons(name);
    });
}

function saveTnLbVariant(v) {
    if (['1','2','3','4','5'].indexOf(String(v)) === -1) return;
    if (typeof vib === 'function') vib(30);
    if (typeof applyTnLbVariant === 'function') applyTnLbVariant(v);
    else markAdmTnLbVariantButtons();
    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Leaderboard style saved locally' : 'Вид лидерборда сохранён локально', 'info');
        return;
    }
    db.ref('settings/tournament_leaderboard_variant').set(String(v)).then(function() {
        toast(currentLang === 'en'
            ? '✅ Tournament leaderboard style saved for all users'
            : '✅ Вид лидерборда турнира сохранён для всех пользователей', 'success');
    }).catch(function(err) {
        console.warn('Tournament leaderboard variant save error:', err);
        toast(currentLang === 'en'
            ? 'Could not save the leaderboard style to the cloud'
            : '⚠️ Не удалось сохранить вид лидерборда в облако', 'error');
    });
}

function markAdmTnLbVariantButtons() {
    var cur = (typeof getTnLbVariant === 'function') ? getTnLbVariant() : '1';
    ['1','2','3','4','5'].forEach(function(v) {
        var btn = document.getElementById('tn-lb-opt-' + v);
        if (!btn) return;
        var active = (String(v) === String(cur));
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.classList.toggle('tn-lb-variant-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

// ==========================================
// ГРУППЫ НА СТРАНИЦЕ ТУРНИРОВ (вкл/выкл) + 4 ВИДА СПИСКА
// ==========================================
function markAdmTnGroupsVisible() {
    var btn = document.getElementById('tn-groups-visible-btn');
    var lbl = document.getElementById('tn-groups-visible-label');
    var on = (typeof getTnGroupsVisible === 'function') ? getTnGroupsVisible() : false;
    var en = currentLang === 'en';
    if (btn) {
        btn.classList.toggle('btn-g', on);
        btn.classList.toggle('btn-ol', !on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        var ic = btn.querySelector('i');
        if (ic) ic.className = on ? 'fas fa-eye' : 'fas fa-eye-slash';
    }
    if (lbl) lbl.textContent = on
        ? (en ? 'Show groups: ON' : 'Показывать группы: включено')
        : (en ? 'Show groups: OFF' : 'Показывать группы: выключено');
}

function saveTnGroupsVisible() {
    var next = !(typeof getTnGroupsVisible === 'function' && getTnGroupsVisible());
    if (typeof vib === 'function') vib(30);
    if (typeof applyTnGroupsVisible === 'function') applyTnGroupsVisible(next);
    if (typeof db === 'undefined' || !db) {
        toast('Сохранено локально', 'info');
        return;
    }
    db.ref('settings/tn_groups_visible').set(next).then(function() {
        toast(next ? '✅ Группы включены для всех' : '✅ Группы скрыты для всех', 'success');
    }).catch(function() { toast('⚠️ Не удалось сохранить в облако', 'error'); });
}

function loadTnGroupsSettings() {
    if (typeof db !== 'undefined' && db && typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-tn-groups-visible', db.ref('settings/tn_groups_visible'), function(sn) {
            var v = sn.val();
            if (v === null || typeof v === 'undefined') v = true; // дефолт — группы видны
            if (typeof applyTnGroupsVisible === 'function') applyTnGroupsVisible(v === true || v === '1' || v === 1);
            markAdmTnGroupsVisible();
        });
        bindRealtimeValue('admin-tn-roster-variant', db.ref('settings/tn_roster_variant'), function(sn) {
            var v = sn.val();
            if (v !== null && typeof v !== 'undefined' && typeof applyTnRosterVariant === 'function') applyTnRosterVariant(v);
            markAdmTnRosterVariantButtons();
        });
    } else {
        markAdmTnGroupsVisible();
        markAdmTnRosterVariantButtons();
    }
}

function markAdmTnRosterVariantButtons() {
    var cur = (typeof getTnRosterVariant === 'function') ? getTnRosterVariant() : '1';
    ['1', '2', '3', '4'].forEach(function(v) {
        var btn = document.getElementById('tn-roster-opt-' + v);
        if (!btn) return;
        var active = String(v) === String(cur);
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function saveTnRosterVariant(v) {
    if (['1', '2', '3', '4'].indexOf(String(v)) === -1) return;
    if (typeof vib === 'function') vib(30);
    if (typeof applyTnRosterVariant === 'function') applyTnRosterVariant(v);
    if (typeof db === 'undefined' || !db) { toast('Сохранено локально', 'info'); return; }
    db.ref('settings/tn_roster_variant').set(String(v)).then(function() {
        toast('✅ Вид списка участников сохранён для всех', 'success');
    }).catch(function() { toast('⚠️ Не удалось сохранить в облако', 'error'); });
}

// ==========================================
// РАЗДЕЛЕНИЕ ЛИДЕРБОРДА ТУРНИРА ПО ПОЛУ (3 вида)
// ==========================================
function markAdmTnGenderSplitButtons() {
    var cur = (typeof getTnGenderSplit === 'function') ? getTnGenderSplit() : '1';
    ['1', '2', '3'].forEach(function(v) {
        var btn = document.getElementById('tn-gs-opt-' + v);
        if (!btn) return;
        var active = String(v) === String(cur);
        btn.classList.toggle('btn-g', active);
        btn.classList.toggle('btn-og', !active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function saveTnGenderSplit(v) {
    if (['1', '2', '3'].indexOf(String(v)) === -1) return;
    if (typeof vib === 'function') vib(30);
    if (typeof applyTnGenderSplit === 'function') applyTnGenderSplit(v);
    else markAdmTnGenderSplitButtons();
    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Saved locally (no database)' : 'Сохранено локально (нет базы)', 'info');
        return;
    }
    db.ref('settings/tn_gender_split').set(String(v)).then(function() {
        toast(currentLang === 'en'
            ? '✅ Gender split for the tournament leaderboard saved for all users'
            : '✅ Разделение лидерборда по полу сохранено для всех', 'success');
    }).catch(function(err) {
        console.warn('tn_gender_split save error:', err);
        toast(currentLang === 'en' ? '⚠️ Could not save to the cloud' : '⚠️ Не удалось сохранить в облако', 'error');
    });
}

function loadTnGenderSplitSettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applyTnGenderSplit === 'function') {
            applyTnGenderSplit(value);
        }
        markAdmTnGenderSplitButtons();
    };
    if (typeof db === 'undefined') {
        applyValue(null);
        return;
    }
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-tn-gender-split', db.ref('settings/tn_gender_split'), function(sn) {
            applyValue(sn.val());
        });
    } else {
        db.ref('settings/tn_gender_split').once('value').then(function(sn) {
            applyValue(sn.val());
        }).catch(function() { applyValue(null); });
    }
}

// ==========================================
// ВАРИАНТЫ ОТОБРАЖЕНИЯ ОСНОВНЫХ СТРАНИЦ
// ==========================================
var ADMIN_PAGE_DISPLAY_CONFIG = {
    home: { path: 'settings/home_display_variant', label: 'Главная' },
    players: { path: 'settings/players_display_variant', label: 'Игроки' },
    stats: { path: 'settings/stats_display_variant', label: 'Статистика' },
    rounds: { path: 'settings/all_rounds_display_variant', label: 'Все раунды' },
    guide: { path: 'settings/guide_display_variant', label: 'Книга поля' },
    feed: { path: 'settings/feed_display_variant', label: 'Лента событий' },
    predictor: { path: 'settings/predictor_display_variant', label: 'Симулятор WHS' },
    'order-of-merit': { path: 'settings/oom_display_variant', label: 'Зачёт сезона' },
    tournaments: { path: 'settings/tournaments_display_variant', label: 'Турниры' },
    handicap: { path: 'settings/handicap_display_variant', label: 'Гандикапы' },
    assistant: { path: 'settings/assistant_display_variant', label: 'Помощник' }
};

function loadPageDisplaySettings() {
    Object.keys(ADMIN_PAGE_DISPLAY_CONFIG).forEach(function(page) {
        var cfg = ADMIN_PAGE_DISPLAY_CONFIG[page];
        var applyValue = function(value) {
            if (value !== null && value !== undefined && typeof applyPageDisplayVariant === 'function') {
                applyPageDisplayVariant(page, value);
            }
            markAdmPageDisplayVariantButtons(page);
        };
        if (typeof db === 'undefined') {
            applyValue(null);
        } else if (typeof bindRealtimeValue === 'function') {
            bindRealtimeValue('admin-page-display-' + page, db.ref(cfg.path), function(sn) {
                applyValue(sn.val());
            });
        } else {
            db.ref(cfg.path).once('value').then(function(sn) { applyValue(sn.val()); }).catch(function() { applyValue(null); });
        }
    });
}

function savePageDisplayVariant(page, value) {
    var cfg = ADMIN_PAGE_DISPLAY_CONFIG[page];
    if (!cfg) return;
    // Набор вариантов у страницы свой: у «Турниров» их пять.
    var allowed = (typeof pageDisplayVariantKeys === 'function')
        ? pageDisplayVariantKeys(page) : ['1', '2', '3'];
    if (allowed.indexOf(String(value)) === -1) return;
    value = String(value);
    if (typeof vib === 'function') vib(30);
    if (typeof applyPageDisplayVariant === 'function') applyPageDisplayVariant(page, value);
    markAdmPageDisplayVariantButtons(page);

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Layout saved locally' : 'Вариант отображения сохранён локально', 'info');
        return;
    }
    db.ref(cfg.path).set(value).then(function() {
        toast(currentLang === 'en'
            ? '✅ ' + cfg.label + ' layout saved for all users'
            : '✅ Вариант отображения «' + cfg.label + '» сохранён для всех пользователей', 'success');
    }).catch(function(err) {
        console.warn('Page display variant save error:', err);
        toast(currentLang === 'en' ? 'Could not save the layout' : '⚠️ Не удалось сохранить вариант отображения', 'error');
    });
}

function markAdmPageDisplayVariantButtons(page) {
    var cur = (typeof getPageDisplayVariant === 'function') ? getPageDisplayVariant(page) : '1';
    var keys = (typeof pageDisplayVariantKeys === 'function') ? pageDisplayVariantKeys(page) : ['1', '2', '3'];
    keys.forEach(function(v) {
        var btn = document.getElementById(page + '-display-opt-' + v);
        if (!btn) return;
        var active = v === cur;
        btn.classList.toggle('page-display-variant-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

// ==========================================
// ВКЛАДКА «ТУРНИРЫ: ВИД» — 5 ВАРИАНТОВ СТРАНИЦЫ «ТУРНИРЫ»
// ==========================================
// Оформление выбирает только администратор; значение хранится в
// settings/tournaments_display_variant и применяется для всех игроков.
var TN_PAGE_VIEW_VARIANTS = ['1', '2', '3', '4', '5'];
var TN_PAGE_VIEW_DESC = {
    1: 'tournaments_view_variant_1_desc',
    2: 'tournaments_view_variant_2_desc',
    3: 'tournaments_view_variant_3_desc',
    4: 'tournaments_view_variant_4_desc',
    5: 'tournaments_view_variant_5_desc'
};

function markAdmTnPageViewButtons() {
    var cur = (typeof getPageDisplayVariant === 'function') ? getPageDisplayVariant('tournaments') : '1';
    TN_PAGE_VIEW_VARIANTS.forEach(function(v) {
        var btn = document.getElementById('tn-view-opt-' + v);
        if (!btn) return;
        var active = v === cur;
        btn.classList.toggle('page-display-variant-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    // Подпись активного варианта — чтобы админ видел, что именно включено.
    var hint = document.getElementById('tn-view-current-desc');
    if (hint) {
        var key = TN_PAGE_VIEW_DESC[cur] || TN_PAGE_VIEW_DESC['1'];
        hint.textContent = (typeof t === 'function' ? t(key) : key) || '';
    }
    var badge = document.getElementById('tn-view-current-badge');
    if (badge) {
        var labelKey = 'tournaments_view_variant_' + cur;
        badge.textContent = (typeof t === 'function' ? t(labelKey) : labelKey) || cur;
    }
}

function loadTnPageViewSettings() {
    var applyValue = function(value) {
        if (value !== null && value !== undefined && typeof applyPageDisplayVariant === 'function') {
            applyPageDisplayVariant('tournaments', value);
        }
        markAdmTnPageViewButtons();
    };
    if (typeof db === 'undefined') { applyValue(null); return; }
    var path = 'settings/tournaments_display_variant';
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-tn-page-view', db.ref(path), function(sn) { applyValue(sn.val()); });
    } else {
        db.ref(path).once('value').then(function(sn) { applyValue(sn.val()); }).catch(function() { applyValue(null); });
    }
}

function saveTnPageViewVariant(value) {
    if (TN_PAGE_VIEW_VARIANTS.indexOf(String(value)) === -1) return;
    value = String(value);
    if (typeof vib === 'function') vib(30);
    if (typeof applyPageDisplayVariant === 'function') applyPageDisplayVariant('tournaments', value);
    markAdmTnPageViewButtons();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Layout saved locally' : 'Вариант отображения сохранён локально', 'info');
        return;
    }
    db.ref('settings/tournaments_display_variant').set(value).then(function() {
        toast(currentLang === 'en'
            ? '✅ ' + t('tournaments_view_saved')
            : '✅ ' + t('tournaments_view_saved'), 'success');
    }).catch(function(err) {
        console.warn('Tournaments layout save error:', err);
        toast(currentLang === 'en' ? 'Could not save the layout' : '⚠️ Не удалось сохранить вариант отображения', 'error');
    });
}

function openTournamentsPagePreview() {
    try { window.open('tournaments.html', '_blank', 'noopener'); } catch (e) { console.warn("[silent]", e); }
}

function saveStablefordDisplayDefault() {
    var checkbox = document.getElementById('pv-stableford-default');
    var enabled = checkbox ? !!checkbox.checked : false;

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

    // Отдельный чекбокс «Скрыть помощника» во вкладке «Помощник»
    var asHide = document.getElementById('as-hide-page');
    var asMainCb = document.getElementById('pv-assistant');
    if (asHide) {
        var hidden = getHiddenPages();
        var isHidden = (hidden['assistant.html'] === true || hidden['assistant'] === true);
        asHide.checked = !isHidden;
        if (asMainCb) asMainCb.checked = !isHidden;
    }

    if (typeof db !== 'undefined' && db) {
        // Подписки через bindRealtimeValue — без дублей при повторных заходах на вкладку.
        bindRealtimeValue('admin-hidden-pages', db.ref('settings/hidden_pages'), function(sn) {
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
        bindRealtimeValue('admin-tools-menu', db.ref('settings/tools_menu_enabled'), function(sn) {
            var v = sn.val();
            var enabled = (v === true || v === '1' || v === 1);
            try { localStorage.setItem('pestovo_tools_menu_enabled', enabled ? '1' : '0'); } catch (e) { console.warn("[silent]", e); }
            var cb = document.getElementById('pv-tools-menu');
            if (cb) cb.checked = enabled;
            if (typeof navAuth === 'function' && typeof currentUserData !== 'undefined') {
                navAuth(currentUser, currentUserData);
            }
            if (typeof buildMobileDrawer === 'function') buildMobileDrawer();
        });
        // Синхронизация переключателя «Мои настройки» (боковое меню)
        bindRealtimeValue('admin-my-preferences', db.ref('settings/my_preferences_enabled'), function(sn) {
            var v = sn.val();
            if (v === null || v === undefined) {
                // По умолчанию ВКЛ — в localStorage ничего не пишем
                var cb0 = document.getElementById('pv-my-preferences');
                if (cb0) cb0.checked = true;
                return;
            }
            var enabled = (v === true || v === '1' || v === 1);
            try { localStorage.setItem('pestovo_my_preferences_enabled', enabled ? '1' : '0'); } catch (e) { console.warn("[silent]", e); }
            var cb = document.getElementById('pv-my-preferences');
            if (cb) cb.checked = enabled;
            if (typeof buildMobileDrawer === 'function') buildMobileDrawer();
            if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
        });
    }

    // Подсветка активного стиля галочки гандикапа (значение из localStorage,
    // актуализируется listener'ом utils.js из Firebase)
    if (typeof markAdmHcpVariantButtons === 'function') markAdmHcpVariantButtons();
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
    try { localStorage.setItem('pestovo_tools_menu_enabled', toolsEnabled ? '1' : '0'); } catch (e) { console.warn("[silent]", e); }
    if (typeof navAuth === 'function' && typeof currentUserData !== 'undefined') {
        navAuth(currentUser, currentUserData);
    }
    if (typeof buildMobileDrawer === 'function') buildMobileDrawer();

    // Сохраняем состояние «Мои настройки» (боковое меню)
    var prefsCb = document.getElementById('pv-my-preferences');
    // По умолчанию ВКЛ, если чекбокс не найден — считаем включённым
    var prefsEnabled = prefsCb ? prefsCb.checked : true;
    try { localStorage.setItem('pestovo_my_preferences_enabled', prefsEnabled ? '1' : '0'); } catch (e) { console.warn("[silent]", e); }
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
// СТИЛЬ ГАЛОЧКИ ГАНДИКАПА (глобально, для всех игроков)
// Вариант 1/2/3 хранится в Firebase settings/hcp_badge_variant.
// utils.js подписан на это поле и сам перерисовывает списки.
// ==========================================
function saveHcpBadgeVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    if (typeof vib === 'function') vib(30);

    // Применяем мгновенно локально: перерисовка списков + подсветка кнопок
    if (typeof applyHcpBadgeVariant === 'function') applyHcpBadgeVariant(v);
    else markAdmHcpVariantButtons();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en' ? 'Style saved locally (no cloud connection)' : 'Стиль сохранён локально (нет связи с облаком)', 'info');
        return;
    }
    db.ref('settings/hcp_badge_variant').set(v).then(function() {
        toast(currentLang === 'en' ? '✅ Handicap checkmark style saved for all players' : '✅ Стиль галочки гандикапа сохранён для всех игроков', 'success');
    }).catch(function(err) {
        console.warn('HCP badge variant save error:', err);
        toast(currentLang === 'en' ? 'Could not save the style to the cloud' : '⚠️ Не удалось сохранить стиль в облако', 'error');
    });
}

// Подсветка выбранного стиля галочки гандикапа в кнопках админ-панели.
function markAdmHcpVariantButtons() {
    var cur = (typeof getHcpBadgeVariant === 'function') ? getHcpBadgeVariant() : '1';
    ['1', '2', '3'].forEach(function(v) {
        var btn = document.getElementById('hcp-badge-opt-' + v);
        if (!btn) return;
        btn.classList.toggle('hcp-variant-active', v === cur);
    });
}

function toggleAssistantPageHidden(event) {
    // Переключаем чекбокс во вкладке «Помощник» и синхронизируем с сеткой «Данные»
    togglePVCheckbox('as-hide-page', event);
    var tab = document.getElementById('as-hide-page');
    var main = document.getElementById('pv-assistant');
    if (tab && main) main.checked = tab.checked;
    savePageVisibilitySettings();
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
    } catch (e) { console.warn("[silent]", e); }
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
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
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
var admPlayersQuery = '';
var admPlayersLastData = null;
var admPlayersExpanded = {};

// Живой поиск по списку игроков (имя, email, телефон) — без новых подписок Firebase.
function admPlayersSearch(v) {
    admPlayersQuery = v || '';
    admPlayersExpanded = {};
    renderAdmPlayersList(admPlayersLastData);
}

function admTogglePlayerRow(id) {
    admPlayersExpanded[id] = !admPlayersExpanded[id];
    var panel = document.getElementById('adm-p-' + id);
    if (panel) panel.classList.toggle('hidden', !admPlayersExpanded[id]);
}

// Компактный список игроков: одна строка на игрока, действия — в раскрывающейся панели.
// Экранирование строки для JS-строки в одинарных кавычках внутри HTML-атрибута
// (onclick="fn('...')"). Один escapeHtml здесь НЕ подходит: браузер декодирует
// &#39; обратно в ' ДО выполнения JS, ломая синтаксис при именах с кавычками.
function admJsStr(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/</g, '\\x3c');
}

function renderAdmPlayersList(remoteData) {
    var el = document.getElementById('adm-players');
    if (!el) return;
    var en = currentLang === 'en';

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
        entries.forEach(function(en2) {
            var uu = en2[1] || {};
            var key = rgGetFioKey(uu) || impNormName(uu.name || '');
            if (!key) { deduped.push(en2); return; }
            if (seenFio[key]) return;
            seenFio[key] = true;
            deduped.push(en2);
        });
        entries = deduped;
    }

    var q = (admPlayersQuery || '').trim().toLowerCase();
    if (q) {
        entries = entries.filter(function(e) {
            var u = e[1] || {};
            var hay = ((u.name || '') + ' ' + (u.email || '') + ' ' + (u.phone || '') + ' ' + (u.homeClub || '')).toLowerCase();
            return hay.indexOf(q) !== -1;
        });
    }

    if (!entries.length) {
        el.innerHTML = '<div class="empty"><i class="fas fa-' + (q ? 'search' : 'users') + '"></i><p>' +
            (q ? (en ? 'Nothing found' : 'Ничего не найдено') : (en ? 'No players' : 'Нет игроков')) + '</p></div>';
        return;
    }

    entries.sort(function(a, b) {
        var roleA = a[1].role === 'admin' ? 0 : a[1].role === 'referee' ? 1 : a[1].role === 'marshal' ? 2 : 3;
        var roleB = b[1].role === 'admin' ? 0 : b[1].role === 'referee' ? 1 : b[1].role === 'marshal' ? 2 : 3;
        if (roleA !== roleB) return roleA - roleB;
        return (a[1].name || '').localeCompare(b[1].name || '');
    });

    var roundsStr = en ? ' · Rounds: ' : ' · Раундов: ';
    var html = '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;"><i class="fas fa-users"></i> ' +
        entries.length + ' ' + (en ? 'players — tap a row for actions' : 'строк — нажмите на игрока для действий') + '</div>';

    entries.forEach(function(e) {
        var id = e[0], u = e[1];
        var curRole = u.role || 'player';
        var name = u.name || '—';
        var initials = name === '—' ? '?' : name.split(/\s+/).map(function(w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
        var roleTxt = curRole === 'admin' ? t('role_admin') : curRole === 'referee' ? t('role_referee') : curRole === 'marshal' ? t('role_marshal') : t('role_player');
        var dotCls = curRole === 'admin' ? 'adm-role-admin' : curRole === 'referee' ? 'adm-role-ref' : curRole === 'marshal' ? 'adm-role-mar' : 'adm-role-pl';
        var hcpTxt = u.handicap != null ? fmtExactHcp(u.handicap) : '—';
        var selfMark = (typeof currentUser !== 'undefined' && currentUser && id === currentUser.uid)
            ? ' <span style="color:var(--gold);font-size:11px;">(' + (en ? 'You' : 'Это вы') + ')</span>' : '';

        html += '<div class="adm-player-row" onclick="admTogglePlayerRow(\'' + id + '\')">' +
            '<span class="adm-player-ava">' + escapeHtml(initials) + '</span>' +
            '<span class="adm-player-main"><span class="adm-player-name">' + escapeHtml(name) + selfMark + '</span>' +
            '<span class="adm-player-meta">HCP ' + escapeHtml(String(hcpTxt)) +
            (typeof hcpSyncBadgeHtml === 'function' ? hcpSyncBadgeHtml(u) : '') +
            ' · ' + escapeHtml(roleTxt) + roundsStr + (u.roundsPlayed || 0) + '</span></span>' +
            '<span class="adm-role-dot ' + dotCls + '"></span></div>';

        var nameJs = admJsStr(u.name);
        html += '<div id="adm-p-' + id + '" class="adm-player-actions' + (admPlayersExpanded[id] ? '' : ' hidden') + '">';
        html += '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">' +
            escapeHtml(u.email || (en ? 'No email' : 'Без email')) +
            (u.phone ? ' · 📞 ' + escapeHtml(u.phone) : '') +
            (u.tee ? ' · ⛳ ' + escapeHtml(t('tee_' + u.tee)) : '') +
            (u.homeClub ? ' · ' + escapeHtml(u.homeClub) : '') + '</div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">';

        if (typeof currentUser === 'undefined' || !currentUser || id !== currentUser.uid) {
            html += '<select class="form-input" style="padding:5px 8px;font-size:11.5px;width:auto;" onchange="changeRole(\'' + id + '\', this.value, \'' + nameJs + '\')">';
            html += '<option value="player" ' + (curRole === 'player' ? 'selected' : '') + '>' + t('role_player') + '</option>';
            html += '<option value="referee" ' + (curRole === 'referee' ? 'selected' : '') + '>' + t('role_referee') + '</option>';
            html += '<option value="marshal" ' + (curRole === 'marshal' ? 'selected' : '') + '>' + t('role_marshal') + '</option>';
            html += '<option value="admin" ' + (curRole === 'admin' ? 'selected' : '') + '>' + t('role_admin') + '</option>';
            html += '</select>';

            var privInd = (typeof pestovoPrivacy !== 'undefined' && pestovoPrivacy.players) ? pestovoPrivacy.players[id] : undefined;
            var privHidden = (privInd === true) || (privInd !== false && (typeof pestovoPrivacy === 'undefined' ? false : pestovoPrivacy.enabled === true));
            html += '<button class="btn ' + (privHidden ? 'btn-r' : 'btn-og') + ' btn-sm" onclick="togglePlayerPrivacy(\'' + id + '\')" title="' +
                (en ? 'Hide/show full name from others' : 'Скрыть/показывать ФИО от других') + '">' +
                '<i class="fas fa-' + (privHidden ? 'eye' : 'eye-slash') + '"></i> ' + t(privHidden ? 'privacy_show_btn' : 'privacy_hide_btn') + '</button>';

            html += '<button class="btn btn-og btn-sm" onclick="clearPlayerHistory(\'' + id + '\',\'' + nameJs + '\')" title="' +
                (en ? 'Clear History' : 'Очистить историю раундов') + '"><i class="fas fa-eraser"></i></button>';

            html += '<button class="btn btn-r btn-sm" onclick="deletePlayer(\'' + id + '\',\'' + nameJs + '\')" title="Delete">' +
                '<i class="fas fa-trash"></i></button>';
        } else {
            html += '<button class="btn btn-og btn-sm" onclick="clearPlayerHistory(\'' + id + '\',\'' + nameJs + '\')" title="' +
                (en ? 'Clear History' : 'Очистить историю раундов') + '"><i class="fas fa-eraser"></i></button>';
        }

        html += '</div></div>';
    });

    el.innerHTML = html;
}

function loadAdmPlayers() {
    var el = document.getElementById('adm-players');
    if (!el) return;

    var renderWithData = function(remoteData) {
        admPlayersLastData = remoteData;
        renderAdmPlayersList(remoteData);
    };

    renderWithData();

    if (typeof db !== 'undefined' && db) {
        // Одна подписка: bindRealtimeValue не плодит дубли при повторных заходах на вкладку.
        bindRealtimeValue('admin-users', db.ref('users'), function(sn) {
            renderWithData(sn.val());
        });
    }
}

function changeRole(id, newRole, name) {
    var roleText = t('role_' + newRole);
    if (!roleText || roleText === 'role_' + newRole) {
        roleText = newRole === 'admin' ? (currentLang === 'en' ? 'Administrator' : 'Администратор') : (currentLang === 'en' ? 'Player' : 'Игрок');
    }
    if (!confirm((currentLang === 'en' ? 'Set ' + (name || 'user') + ' role to ' + roleText + '?' : 'Назначить ' + (name || 'пользователя') + ' на роль ' + roleText + '?'))) return;

    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        return;
    }
    db.ref('users/' + id + '/role').set(newRole).then(function() {
        toast('✅ ' + (name || 'User') + (currentLang === 'en' ? ' is now ' : ' теперь ') + roleText);
    }).catch(function(err) {
        toast('❌ Error: ' + (err && err.message ? err.message : err), 'error');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    });
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

        var normOf = function(nm) {
            if (typeof normalizeSearchText === 'function') {
                try { return normalizeSearchText(nm); } catch (e) { console.warn("[silent]", e); }
            }
            return String(nm || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
        };
        // 1) Удаляем упоминания в `rounds` (включая marker* и verified поля)
        db.ref('rounds').once('value').then(function(sn) {
            var rounds = sn.val() || {};
            var updates = {};
            Object.keys(rounds).forEach(function(rid) {
                var r = rounds[rid];
                if (!r) return;
                var purgePids = {};
                purgePids[id] = true;
                // Однофамильцы-гости (ключи guest_*): их записи «воскрешают»
                // удалённого игрока в автоподборе на других устройствах —
                // чистим по нормализованному имени тоже. Зарегистрированных
                // (не guest) однофамильцев не трогаем — это другие люди.
                if (r.players) {
                    Object.keys(r.players).forEach(function(tid) {
                        var gp = r.players[tid] || {};
                        if (tid !== id && normKey && String(tid).indexOf('guest_') === 0 && gp.name && normOf(gp.name) === normKey) {
                            purgePids[tid] = true;
                        }
                    });
                }
                if (r.players) {
                    Object.keys(r.players).forEach(function(tid) {
                        if (purgePids[tid]) updates['rounds/' + rid + '/players/' + tid] = null;
                    });
                }
                if (r.markerAssignments) {
                    Object.keys(r.markerAssignments).forEach(function(mid) {
                        if (purgePids[mid]) updates['rounds/' + rid + '/markerAssignments/' + mid] = null;
                    });
                }
                // markerScores и markerSubmitted хранятся под ключом целевого игрока
                if (r.players) {
                    Object.keys(r.players).forEach(function(tid) {
                        if (purgePids[tid]) return;
                        var p = r.players[tid] || {};
                        Object.keys(purgePids).forEach(function(pid2) {
                            if (p.markerScores && p.markerScores[pid2]) {
                                updates['rounds/' + rid + '/players/' + tid + '/markerScores/' + pid2] = null;
                            }
                            if (p.markerSubmitted && p.markerSubmitted[pid2]) {
                                updates['rounds/' + rid + '/players/' + tid + '/markerSubmitted/' + pid2] = null;
                            }
                        });
                    });
                }
            });
            var applyRoundUpdates = function() {
                if (Object.keys(updates).length === 0) { check(); return; }
                db.ref().update(updates).then(check, check);
            };
            applyRoundUpdates();
        }, check);

        // 2) Снимаем регистрации во всех турнирах: по uid + гостевые
        // записи того же имени (push-ключи), иначе игрок останется в ростере.
        db.ref('tournaments').once('value').then(function(sn) {
            var tournaments = sn.val() || {};
            var tnUpdates = {};
            Object.keys(tournaments).forEach(function(tid) {
                var t = tournaments[tid];
                if (!t || !t.registeredPlayers) return;
                Object.keys(t.registeredPlayers).forEach(function(rk) {
                    var rp = t.registeredPlayers[rk] || {};
                    if (rk === id) {
                        tnUpdates['tournaments/' + tid + '/registeredPlayers/' + rk] = null;
                    } else if (normKey && rp.guest === true && rp.name && normOf(rp.name) === normKey) {
                        tnUpdates['tournaments/' + tid + '/registeredPlayers/' + rk] = null;
                    }
                });
            });
            if (Object.keys(tnUpdates).length === 0) { check(); return; }
            db.ref().update(tnUpdates).then(check, check);
        }, check);

        // 3) Удаляем историю раундов
        db.ref('users/' + id + '/history').remove().then(check, check);

        // 4) Удаляем саму ноду users/<id> (вместе с ней уходят и notifications —
        // отдельный путь users/<id>/notifications сюда добавлять нельзя: update()
        // падает на пересекающихся путях и удаление вообще не происходит)
        var userUpdates = {};
        userUpdates['users/' + id] = null;
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
        } catch (e) { console.warn("[silent]", e); }

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
    // parseExactHcp молча превращает мусор в 0 — проверяем ввод явно, чтобы
    // опечатка вроде «12ж» не записывала игроку нулевой гандикап
    if (hcpRaw !== '' && !/^[+-]?(\d+([.,]\d+)?|\.\d+)$/.test(hcpRaw.replace(/\s+/g, ''))) {
        toast((currentLang === 'en' ? '⚠️ Invalid handicap value: ' : '⚠️ Некорректный гандикап: ') + hcpRaw, 'error');
        if (hcpInp) hcpInp.focus();
        return;
    }
    var parsedHcp = parseExactHcp(hcpRaw);
    var gender = genderSel ? genderSel.value : 'men';
    // ТИ по умолчанию удалено (1.60): ТИ игрока определяется его группой в протоколе.
    var defaultTee = gender === 'women' ? 'rd' : 'wh';
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
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch (e) { console.warn("[silent]", e); }
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
    } catch (e) { console.warn("[silent]", e); }

    if (typeof cachedRegisteredUsers !== 'undefined') {
        cachedRegisteredUsers[newId] = playerData;
        try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch (e) { console.warn("[silent]", e); }
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
