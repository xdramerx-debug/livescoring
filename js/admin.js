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
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers(); // js/admin-players.js
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
    if (typeof loadTournaments === 'function') loadTournaments(); // js/admin-tournaments.js
    loadClubBroadcastsHistory();
    loadBroadcastAudienceOptions();
    listenForAlerts();
    loadTelegramSettings();
    loadVKSettings();
    if (typeof loadPageVisibilitySettings === 'function') loadPageVisibilitySettings(); // js/admin-display.js
    if (typeof loadStablefordDisplaySettings === 'function') loadStablefordDisplaySettings(); // js/admin-display.js
    if (typeof loadSocialCardDisplaySettings === 'function') loadSocialCardDisplaySettings(); // js/admin-display.js
    if (typeof loadGroupCardDisplaySettings === 'function') loadGroupCardDisplaySettings(); // js/admin-display.js
    if (typeof loadTnCardDisplaySettings === 'function') loadTnCardDisplaySettings(); // js/admin-display.js
    if (typeof loadTnLbDisplaySettings === 'function') loadTnLbDisplaySettings(); // js/admin-display.js
    if (typeof loadTnGroupsSettings === 'function') loadTnGroupsSettings(); // js/admin-display.js
    if (typeof loadTnGenderSplitSettings === 'function') loadTnGenderSplitSettings(); // js/admin-display.js
    if (typeof loadPageDisplaySettings === 'function') loadPageDisplaySettings(); // js/admin-display.js
    if (typeof loadAdmView5Settings === 'function') loadAdmView5Settings(); // js/admin-display.js
    if (typeof loadPrivacySettings === 'function') loadPrivacySettings(); // js/admin-display.js
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
        if (typeof loadPageVisibilitySettings === 'function') loadPageVisibilitySettings(); // js/admin-display.js
        if (typeof loadStablefordDisplaySettings === 'function') loadStablefordDisplaySettings(); // js/admin-display.js
        if (typeof loadSocialCardDisplaySettings === 'function') loadSocialCardDisplaySettings(); // js/admin-display.js
        if (typeof loadGroupCardDisplaySettings === 'function') loadGroupCardDisplaySettings(); // js/admin-display.js
        if (typeof loadTnCardDisplaySettings === 'function') loadTnCardDisplaySettings(); // js/admin-display.js
        if (typeof loadTnLbDisplaySettings === 'function') loadTnLbDisplaySettings(); // js/admin-display.js
        if (typeof loadTnGroupsSettings === 'function') loadTnGroupsSettings(); // js/admin-display.js
        if (typeof loadTnGenderSplitSettings === 'function') loadTnGenderSplitSettings(); // js/admin-display.js
        if (typeof loadPageDisplaySettings === 'function') loadPageDisplaySettings(); // js/admin-display.js
        if (typeof loadAdmView5Settings === 'function') loadAdmView5Settings(); // js/admin-display.js
    }
    if (t === 'tournamentsview') {
        if (typeof loadTnPageViewSettings === 'function') loadTnPageViewSettings(); // js/admin-display.js
    }
    if (t === 'rusgolf') {
        if (typeof loadRusgolfProxySettings === 'function') loadRusgolfProxySettings(); // js/admin-agr.js
        if (typeof nmLoadSettings === 'function') nmLoadSettings(); // js/admin-name-forms.js
        try { if (typeof rgRefreshSyncScopeHint === 'function') rgRefreshSyncScopeHint(); } catch (eRg) { console.warn("[silent]", eRg); }
    }
    if (t === 'players') {
        if (typeof loadPrivacySettings === 'function') loadPrivacySettings(); // js/admin-display.js
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
