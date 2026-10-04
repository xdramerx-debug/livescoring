// ============================================================
// TN-MGR — подключение менеджера турниров к админ-панели
// ------------------------------------------------------------
// Модуль держит точку входа TnMgr: лениво монтирует вкладку
// «Турниры 🏆» (#tab-tnmanager → #tnm-root), отдаёт управление
// js/tn-mgr-ui.js (список турниров, форма, карточка) и следит за
// наличием доступа администратора.
//
// Подключение в admin.html: utils → tn-mgr-core → tn-mgr-data →
// tn-mgr-io → tn-mgr-ui → tn-mgr-sheet → tn-mgr-printcards → tn-mgr-round → tn-mgr.
// Вызов из js/admin.js: switchTab('tnmanager') → TnMgr.open().
// ============================================================
var TnMgr = (function (root) {
    'use strict';

    var ROOT_ID = 'tnm-root';
    var TAB_ID = 'tnm-tab-btn';
    var booted = false;

    function ui() { return root.TnMgrUI; }
    function core() { return root.TnMgrCore; }

    /** Контейнер вкладки: до входа в админку его может не быть в DOM. */
    function rootEl() {
        return root.document ? root.document.getElementById(ROOT_ID) : null;
    }

    function hasAccess() {
        try {
            if (typeof root.hasAdminPanelAccess === 'function') return !!root.hasAdminPanelAccess();
            // Запасной путь: те же признаки, что и в js/admin.js.
            if (root.currentUserData && (root.currentUserData.role === 'admin' || root.currentUserData.admin === true)) return true;
            return !!(root.currentUser && root.currentUser.uid === 'tournament-master');
        } catch (e) {
            return false;
        }
    }

    /** Показываем/скрываем кнопку вкладки в зависимости от прав. */
    function syncTabVisibility() {
        var button = root.document ? root.document.getElementById(TAB_ID) : null;
        if (!button) return;
        button.classList.toggle('hidden', !hasAccess());
    }

    /** Точка входа: вызывает js/admin.js при открытии вкладки. */
    function open() {
        var host = rootEl();
        if (!host) return false;
        if (!hasAccess()) {
            host.innerHTML = '<div class="tnm-card"><p class="tnm-muted">' +
                core().esc(ui().bi('Нет доступа: раздел доступен администраторам клуба.', 'Access denied: this section is for club administrators.')) +
                '</p></div>';
            return false;
        }
        if (!ensureData()) return false;
        if (!booted) {
            booted = true;
            try {
                ui().boot(host);
            } catch (e) {
                booted = false;
                console.error('[tnm] boot failed', e);
                host.innerHTML = '<div class="tnm-card"><p class="tnm-muted">Ошибка запуска: ' +
                    core().esc(e && e.message ? e.message : e) + '</p></div>';
                return false;
            }
        }
        ui().render();
        return true;
    }

    /**
     * Слой данных работает поверх уже инициализированного Firebase (js/firebase-config.js).
     * Если базы нет (страница открыта без конфигурации) — показываем понятное сообщение.
     */
    function ensureData() {
        if (!root.TnMgrData) return false;
        if (!root.db) {
            console.error('[tnm] Firebase не инициализирован: проверьте js/firebase-config.js');
            return false;
        }
        return true;
    }

    /**
     * Разовый автозапуск: если админ открыл admin.html по ссылке
     * вида admin.html#tnmanager (или со старой ссылкой на вкладку),
     * вкладка открывается сразу.
     */
    function autoOpen() {
        var hash = (root.location && root.location.hash || '').replace('#', '').toLowerCase();
        if (hash !== 'tnmanager' && hash !== 'tnm' && hash.indexOf('tnm/') !== 0) return;
        var button = root.document ? root.document.getElementById(TAB_ID) : null;
        if (button) button.classList.remove('hidden');
        if (typeof root.switchTab === 'function') root.switchTab('tnmanager', button);
        else open();
    }

    function init() {
        syncTabVisibility();
        autoOpen();
    }

    if (root.document) {
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init);
        else root.setTimeout(init, 0);
    }

    return {
        open: open,
        init: init,
        mount: open,
        hasAccess: hasAccess,
        syncTabVisibility: syncTabVisibility,
        rootEl: rootEl,
        ROOT_ID: ROOT_ID
    };
})(typeof window !== 'undefined' ? window : this);

if (typeof module !== 'undefined' && module.exports) module.exports = TnMgr;
