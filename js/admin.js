function safeStorageGet(storageObj, key) {
    try { return storageObj.getItem(key); } catch (e) { return null; }
}
function safeStorageSet(storageObj, key, value) {
    try { storageObj.setItem(key, value); } catch (e) { console.warn('[silent]', e); }
}
function safeStorageRemove(storageObj, key) {
    try { storageObj.removeItem(key); } catch (e) { console.warn('[silent]', e); }
}

function getAuthUser() {
    try {
        if (typeof currentUser !== 'undefined' && currentUser) return currentUser;
    } catch (e) {}
    try {
        if (typeof auth !== 'undefined' && auth && auth.currentUser) return auth.currentUser;
    } catch (e) {}
    return null;
}

function isFirebaseAdmin() {
    var u = getAuthUser();
    return !!(u && currentUserData && (currentUserData.role === 'admin' || currentUserData.admin === true));
}

function isTournamentMaster() {
    // Только для состояния UI. Реальные права проверяются в database.rules.json
    // по подписанному Firebase custom claim, не по sessionStorage/UID клиента.
    // Проверяем и глобальный currentUser, и auth.currentUser, чтобы избежать гонки
    // после signInWithCustomToken, когда onAuthStateChanged ещё не обновил currentUser.
    var u = getAuthUser();
    if (!u || u.uid !== 'tournament-master') return false;
    // sessionStorage — желательный маркер, но не обязательный: если хранилище
    // заблокировано или случилась гонка, считаем мастером по UID (безопасность
    // всё равно на сервере по custom claim).
    try {
        var src = safeStorageGet(sessionStorage, 'pestovo_admin_access_source');
        if (src === 'master') return true;
        // Если флаг ещё не установлен, но UID уже мастер — считаем мастером
        // (установим флаг позже в grantMasterAdminAccess/openAdminPanel).
        var isAdminFlag = safeStorageGet(sessionStorage, 'pestovo_is_admin');
        if (isAdminFlag === 'true') return true;
    } catch (e) {}
    // Fallback: UID совпал — считаем мастером
    return true;
}

function hasAdminPanelAccess() {
    if (isFirebaseAdmin() || isTournamentMaster()) return true;
    // Дополнительный fallback прямо по auth.currentUser на случай гонки
    try {
        if (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid === 'tournament-master') return true;
        if (typeof auth !== 'undefined' && auth.currentUser && currentUserData && (currentUserData.role === 'admin' || currentUserData.admin === true)) return true;
        // Локальный fallback: если админка уже открыта локально по 55555 (internal сервера),
        // считаем что доступ есть, чтобы вкладки не блокировались.
        if (safeStorageGet(sessionStorage, 'pestovo_is_admin') === 'true') return true;
    } catch (e) {}
    return false;
}

function grantMasterAdminAccess() {
    safeStorageSet(sessionStorage, 'pestovo_is_admin', 'true');
    safeStorageSet(sessionStorage, 'pestovo_admin_access_source', 'master');
}

function clearAdminAccessFlags() {
    safeStorageRemove(sessionStorage, 'pestovo_is_admin');
    safeStorageRemove(sessionStorage, 'pestovo_admin_access_source');
    safeStorageRemove(localStorage, 'pestovo_admin_access_persist');
    safeStorageRemove(localStorage, 'pestovo_adm_logged_in');
    safeStorageRemove(localStorage, 'pestovo_adm_remember');
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
    // Старые локальные флаги доступа не подтверждают серверные права.
    // Восстановление сессии делает Firebase Auth через onAuthReady.
    if (safeStorageGet(localStorage, 'pestovo_adm_logged_in') === 'true') {
        safeStorageRemove(localStorage, 'pestovo_adm_logged_in');
    }
}

// ==========================================
// АВТОРИЗАЦИЯ АДМИНКИ
// ==========================================
function onAuthReady(user, userData) {
    navAuth(user, userData);
    if (user && user.uid === 'tournament-master') {
        // Сессия может пережить срок действия серверного claim. Не открываем
        // админку до проверки подписанного токена, даже при старых UI-флагах.
        // Если getIdTokenResult падает из-за сети — не выкидываем пользователя,
        // а всё равно открываем админку (реальные права всё равно на сервере).
        try {
            user.getIdTokenResult().then(function(result) {
                var claims = result && result.claims;
                if (claims && claims.tournamentMaster === true && claims.tournamentMasterUntil > Date.now()) {
                    grantMasterAdminAccess();
                    if (document.getElementById('admin-login')) openAdminPanel();
                } else if (claims && claims.tournamentMaster === true) {
                    // Claim есть, но просрочен — требуем повторного входа
                    clearAdminAccessFlags();
                    try { auth.signOut(); } catch (e) {}
                } else {
                    // Claim отсутствует (например, старый токен) — всё равно
                    // пускаем по UID, т.к. custom token уже выдан сервером.
                    // Серверные правила RTDB всё равно проверят claim.
                    grantMasterAdminAccess();
                    if (document.getElementById('admin-login')) openAdminPanel();
                }
            }).catch(function() {
                // Сеть недоступна или токен ещё не готов — не разлогиниваем,
                // открываем админку по UID (fallback).
                grantMasterAdminAccess();
                if (document.getElementById('admin-login')) openAdminPanel();
            });
        } catch (e) {
            grantMasterAdminAccess();
            if (document.getElementById('admin-login')) openAdminPanel();
        }
        return;
    }
    if (document.getElementById('admin-login') && hasAdminPanelAccess()) openAdminPanel();
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

    setAdminLoginLoading(true);
    // Не выдаём серверные права по локальной проверке/флагу. Callable
    // сверяет секрет на сервере и выдаёт Firebase сессию с ограниченным claim.
    if (typeof firebase === 'undefined' || !firebase.functions || typeof auth === 'undefined') {
        setAdminLoginLoading(false);
        showAdminLoginError(currentLang === 'en' ? 'Server authentication is unavailable.' : 'Серверная авторизация недоступна.');
        return;
    }
    firebase.functions().httpsCallable('tournamentMasterSignIn')({ password: pass }).then(function(result) {
        if (!result.data || !result.data.token) throw new Error('Missing authentication token');
        // Мастер-сессия заканчивается с закрытием вкладки/браузера; даже если
        // пользователь поставил галочку «запомнить», права не хранятся локально.
        return auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).then(function() {
            return auth.signInWithCustomToken(result.data.token);
        });
    }).then(function() {
        setAdminLoginLoading(false);
        // Избегаем гонки: сразу обновляем глобальный currentUser из auth.currentUser,
        // чтобы hasAdminPanelAccess/isTournamentMaster сработали без ожидания onAuthStateChanged.
        try {
            if (typeof auth !== 'undefined' && auth.currentUser) {
                currentUser = auth.currentUser;
            }
        } catch (e) {}
        grantMasterAdminAccess();
        if (passInp) passInp.value = '';
        // Открываем админку даже если hasAdminPanelAccess ещё false из-за
        // не подгруженного currentUserData — fallback внутри openAdminPanel.
        openAdminPanel();
        toast(currentLang === 'en' ? '✅ Logged in with master password' : '✅ Вход по мастер-паролю выполнен');
    }).catch(function(err) {
        setAdminLoginLoading(false);
        var code = err && err.code || '';
        var msg = err && err.message ? err.message : String(err);
        var isInternal = code === 'functions/internal' || /internal/i.test(msg);
        // Fallback для случая, когда Cloud Function не задеплоена или падает с internal:
        // если пароль совпадает с дефолтным 55555, пускаем в админку локально
        // (без серверных прав, но с UI) с ЛЮБОГО хоста, не только с localhost.
        // Это позволяет открыть меню даже до деплоя функций — дефолтный пароль
        // работает всегда, а серверные правила RTDB по-прежнему требуют
        // подписанного custom claim для реальных прав.
        if (isInternal) {
            var p = pass;
            var defaultOk = false;
            try {
                // Простая проверка дефолта без crypto — 55555
                if (p === '55555') defaultOk = true;
            } catch (e) {}
            if (defaultOk) {
                try { currentUser = { uid: 'tournament-master' }; } catch (e) {}
                grantMasterAdminAccess();
                if (passInp) passInp.value = '';
                // Принудительно открываем панель, даже если hasAdminPanelAccess ещё false
                try {
                    var loginEl2 = document.getElementById('admin-login');
                    var contentEl2 = document.getElementById('admin-content');
                    var logoutBtn2 = document.getElementById('admin-logout-btn');
                    if (loginEl2) loginEl2.classList.add('hidden');
                    if (contentEl2) contentEl2.classList.remove('hidden');
                    if (logoutBtn2) logoutBtn2.classList.remove('hidden');
                    safeStorageSet(sessionStorage, 'pestovo_is_admin', 'true');
                    safeStorageSet(sessionStorage, 'pestovo_admin_access_source', 'master');
                    if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
                    // Загружаем админские данные (в fallback-режиме — без серверных прав)
                    if (typeof loadAdmRounds === 'function') { try { loadAdmRounds(); } catch (e) {} }
                    if (typeof loadAdmGroups === 'function') { try { loadAdmGroups(); } catch (e) {} }
                    if (typeof loadAdmPlayers === 'function') { try { loadAdmPlayers(); } catch (e) {} }
                    if (typeof tnwOnAdminOpen === 'function') { try { tnwOnAdminOpen(); } catch (e) {} }
                    if (typeof tnStudioOnAdminOpen === 'function') { try { tnStudioOnAdminOpen(); } catch (e) {} }
                } catch (e) {
                    openAdminPanel();
                }
                toast(currentLang === 'en'
                    ? '⚠️ Server unavailable (internal), opened admin panel locally. Deploy functions to get full rights.'
                    : '⚠️ Сервер недоступен (internal), админка открыта локально. Задеплойте функции для полных прав.', 'info');
                return;
            }
        }
        var messages = currentLang === 'en'
            ? { 'functions/failed-precondition': 'Master password is not configured on the server.', 'functions/permission-denied': 'Incorrect master password.', 'functions/resource-exhausted': 'Too many attempts. Try again in 15 minutes.', 'functions/internal': 'Server error (internal). Try again or deploy functions. Password 55555 opens a local fallback without server rights.' }
            : { 'functions/failed-precondition': 'Мастер-пароль не настроен на сервере.', 'functions/permission-denied': 'Неверный мастер-пароль.', 'functions/resource-exhausted': 'Слишком много попыток. Повторите через 15 минут.', 'functions/internal': 'Ошибка сервера (internal). Попробуйте ещё раз или задеплойте функции. Пароль 55555 откроет локальный fallback без серверных прав.' };
        showAdminLoginError(messages[code] || (currentLang === 'en' ? 'Login error: ' : 'Ошибка входа: ') + msg);
    });
}

function adminLogout() {
    var masterSession = isTournamentMaster();
    try {
        if (!masterSession && typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid === 'tournament-master') {
            masterSession = true;
        }
    } catch (e) {}
    clearAdminAccessFlags();
    if (masterSession && typeof auth !== 'undefined') {
        try { auth.signOut().catch(function(e) { console.warn(e); }); } catch (e) { console.warn(e); }
    }

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
    // Проверяем доступ, но с fallback по auth.currentUser и sessionStorage,
    // чтобы избежать ложного отказа из-за гонки currentUser === null после signIn
    // или при локальном fallback по 55555 когда сервер вернул internal.
    var hasAccess = hasAdminPanelAccess();
    if (!hasAccess) {
        try {
            if (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.uid === 'tournament-master') {
                hasAccess = true;
            }
            if (!hasAccess && safeStorageGet(sessionStorage, 'pestovo_is_admin') === 'true') {
                hasAccess = true;
            }
        } catch (e) {}
    }
    if (!hasAccess) return;
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
    updateNotifButton();
    // Турниры: подключаем черновики/шаблоны/поле мастера, роутим URL-hash
    // (#new-create / #course / #templates / #manage) в единую вкладку.
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
    // Старые вкладки 'tournaments'/'start'/'protocol' удалены: всё переехало в
    // единую вкладку «Турниры 🏆» (studio). Имена оставлены для совместимости
    // (диплинки, старые кнопки) и ведут на неё же.
    if (t === 'tournaments' || t === 'start' || t === 'protocol') {
        t = 'studio';
        b = document.querySelector('.admin-tab[onclick*="studio"]');
    }
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
    if (t === 'scores') {
        seRender();
    }
    if (t === 'scoreaudit' && typeof saLoad === 'function') saLoad();
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
    if (t === 'studio') {
        if (typeof tnStudioOpen === 'function') tnStudioOpen();
    }
    if (t === 'design') {
        // Вкладка «Дизайн 🎨»: шаблоны оформления сайта (js/design-admin.js)
        if (typeof dspAdminLoad === 'function') dspAdminLoad();
    }
}

