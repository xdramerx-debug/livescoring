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

    if (typeof loadAdmRounds === 'function') loadAdmRounds(); // js/admin-groups.js
    if (typeof loadAdmGroups === 'function') loadAdmGroups(); // js/admin-groups.js
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
    if (typeof tnStudioOnAdminOpen === 'function') { try { tnStudioOnAdminOpen(); } catch (e) { console.warn('[silent]', e); } }
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
        if (typeof renderAdmGroups === 'function') renderAdmGroups(); // js/admin-groups.js
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
    if (t === 'studio') {
        if (typeof tnStudioOpen === 'function') tnStudioOpen();
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

