// ============================================================
// TOURNAMENT MANAGEMENT V2
// ------------------------------------------------------------
// Admin-only management surface layered on the existing wizard. It never
// replaces the legacy start/scoring flows: it writes compatible tournament
// fields and opens the existing start sheet/protocol tools when appropriate.
// ============================================================
(function (root) {
    'use strict';
    var core = root.TournamentCore;
    var baseSubTabs = root.tnwSubTabDefs;
    var baseShowSubTab = root.tnwShowSubTab;
    var baseRenderWizard = root.tnwRenderWizard;
    var basePublish = root.tnwPublish;
    var baseLangChange = root.tnwOnLangChange;
    var manager = {
        tournaments: {},
        bound: false,
        query: '',
        status: 'all',
        selectedId: null,
        panel: 'list',
        editingOriginal: null
    };

    function db() { return root.db && typeof root.db.ref === 'function' ? root.db : null; }
    function el(id) { return document.getElementById(id); }
    function esc(v) { return typeof root.escapeHtml === 'function' ? root.escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function lang() { return root.currentLang === 'en' ? 'en' : 'ru'; }
    function tr(ru, en) { return lang() === 'en' ? en : ru; }
    function toast(message, type) { if (typeof root.toast === 'function') root.toast(message, type); }
    function now() { return Date.now(); }
    function clone(value) { return core ? core.clone(value) : JSON.parse(JSON.stringify(value == null ? null : value)); }
    function actor() { return root.currentUserData || root.currentUser || { uid: 'admin' }; }
    function actorLabel() { var a = actor(); return a.name || a.email || a.uid || 'admin'; }
    function hasAccess() { return typeof root.hasAdminPanelAccess !== 'function' || root.hasAdminPanelAccess(); }
    function serverAdmin() {
        if (typeof root.isFirebaseAdmin === 'function' && root.isFirebaseAdmin()) return true;
        return !!(root.currentUser && root.currentUserData && (root.currentUserData.role === 'admin' || root.currentUserData.admin === true));
    }
    function assertWrite() {
        if (serverAdmin() || (typeof root.isTournamentMaster === 'function' && root.isTournamentMaster())) return true;
        toast(tr('Войдите с мастер-паролем или аккаунтом администратора.', 'Sign in with the master password or an administrator account.'), 'error');
        return false;
    }
    function studioRoot() { return typeof document !== 'undefined' ? document.getElementById('tn-studio-root') : null; }
    function inStudio() {
        var s = studioRoot(), m = el('tn-manage-root');
        return !!(s && m && s.contains(m));
    }
    function studioHostsWizard() {
        var s = studioRoot(), w = el('tn-wizard-root');
        return !!(s && w && s.contains(w));
    }
    function studioNav(fn, arg) {
        if (typeof root[fn] === 'function') { root[fn](arg); return true; }
        return false;
    }
    function entries() { return Object.keys(manager.tournaments || {}).map(function (key) { var t = manager.tournaments[key] || {}; t._key = key; return t; }); }
    function dateText(value) { if (typeof root.fmtDate === 'function') { try { return root.fmtDate(typeof root.tnDateTs === 'function' ? root.tnDateTs(value) : value); } catch (e) {} } return String(value || '—'); }
    function statusOf(t) { return core ? core.lifecycleStatus(t) : (t.lifecycleStatus || t.status || 'draft'); }
    function statusLabel(s) { return ({ draft: tr('Черновик', 'Draft'), registration: tr('Регистрация', 'Registration'), closed: tr('Закрыт', 'Closed'), active: tr('Идёт', 'Live'), completed: tr('Завершён', 'Completed'), cancelled: tr('Отменён', 'Cancelled') })[s] || s; }
    function statusClass(s) { return ['draft', 'registration', 'closed', 'active', 'completed', 'cancelled'].indexOf(s) !== -1 ? s : 'draft'; }
    function merge(base, extra) {
        var out = clone(base || {});
        Object.keys(extra || {}).forEach(function (key) {
            if (extra[key] && typeof extra[key] === 'object' && !Array.isArray(extra[key]) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) out[key] = merge(out[key], extra[key]);
            else out[key] = clone(extra[key]);
        });
        return out;
    }
    function defaultConfig(t) {
        var base = typeof root.tnwDefaultDraft === 'function' ? root.tnwDefaultDraft() : { info: {}, format: { rounds: [] }, scoring: {}, participants: {}, flights: {}, officials: {}, prizes: {}, media: {}, publish: {} };
        if (t && t.wizard) return merge(base, t.wizard);
        var cfg = merge(base, {});
        cfg.info.nameRu = t && t.name || '';
        cfg.info.description = t && t.description || '';
        cfg.format.rounds = [{ date: t && t.date || '', title: 'R1', startTime: '09:00', startType: 'tee-times' }];
        cfg.format.teeMap = (t && t.tees || ['wh']).map(function (tee) { return { category: tee, tee: tee }; });
        var formats = (t && t.formats) || [];
        cfg.scoring.systems = formats.map(function (f) { return /stableford/i.test(f) ? 'stableford' : /gross/i.test(f) ? 'stroke-gross' : /match play 1v1/i.test(f) ? 'match-play' : /scramble/i.test(f) ? 'scramble' : 'stroke-net'; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
        if (!cfg.scoring.systems.length) cfg.scoring.systems = ['stroke-net'];
        cfg.publish.status = 'draft';
        return cfg;
    }
    function bind() {
        var database = db();
        if (!database || manager.bound) return;
        manager.bound = true;
        var callback = function (snapshot) { manager.tournaments = snapshot && snapshot.val ? (snapshot.val() || {}) : {}; if (manager.panel === 'list') renderManager(); else if (manager.selectedId) renderSelected(); };
        if (typeof root.bindRealtimeValue === 'function') root.bindRealtimeValue('tournament-admin-v2', database.ref('tournaments'), callback);
        else database.ref('tournaments').on('value', callback);
    }

    // Add a dedicated management subtab while preserving the four existing
    // tabs expected by the old wizard/UI tests when that module is isolated.
    root.tnwSubTabDefs = function () {
        var defs = baseSubTabs ? baseSubTabs() : [];
        return defs.concat([{ id: 'manage', icon: 'fa-sliders', ru: 'Управление турнирами', en: 'Tournament management', hash: '#manage' }]);
    };
    root.tnwShowSubTab = function (id, skipHash) {
        baseShowSubTab(id, skipHash);
        if (id === 'manage') { manager.panel = 'list'; bind(); renderManager(); }
    };
    root.tnwApplyHash = function () {
        var hash = String(window.location.hash || '').toLowerCase();
        // Единая вкладка турниров перехватывает все старые hash-маршруты.
        if (typeof root.tnsRouteHash === 'function' && root.tnsRouteHash(hash)) return;
        if (hash === '#manage') {
            var btn = document.querySelector('.admin-tab[onclick*="\'tournaments\'"]');
            if (btn && typeof root.switchTab === 'function') root.switchTab('tournaments', btn);
            root.tnwShowSubTab('manage', true);
        } else if (typeof root.tnwApplyHashBase === 'function') root.tnwApplyHashBase();
        else {
            var sub = hash === '#new-create' ? 'new-create' : hash === '#course' ? 'course' : hash === '#templates' ? 'templates' : null;
            if (sub) root.tnwShowSubTab(sub, true);
        }
    };

    function renderStats(items) {
        var counts = { all: items.length, registration: 0, active: 0, completed: 0, draft: 0 };
        items.forEach(function (t) { var s = statusOf(t); counts[s] = (counts[s] || 0) + 1; });
        return '<div class="tna-stats"><div class="tna-stat"><b>' + counts.all + '</b><span>' + tr('Всего турниров', 'All tournaments') + '</span></div><div class="tna-stat"><b>' + (counts.registration || 0) + '</b><span>' + tr('Регистрация', 'Registration') + '</span></div><div class="tna-stat"><b>' + (counts.active || 0) + '</b><span>' + tr('Идут сейчас', 'Live now') + '</span></div><div class="tna-stat"><b>' + (counts.completed || 0) + '</b><span>' + tr('Завершены', 'Completed') + '</span></div></div>';
    }
    function filtered() {
        var q = manager.query.toLowerCase().replace(/ё/g, 'е').trim();
        return entries().filter(function (t) { var s = statusOf(t); return (manager.status === 'all' || s === manager.status) && (!q || String(t.name || '').toLowerCase().replace(/ё/g, 'е').indexOf(q) !== -1); }).sort(function (a, b) { return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); });
    }
    function actionButton(action, id, label, icon, cls) { return '<button type="button" class="btn ' + (cls || 'btn-og') + ' btn-sm" data-tna-action="' + action + '" data-tna-id="' + esc(id) + '"><i class="fas ' + icon + '"></i> ' + label + '</button>'; }
    function transitionButtons(t) {
        var s = statusOf(t), html = '';
        if (s === 'draft' || s === 'closed') html += actionButton('status', t._key, tr('Открыть регистрацию', 'Open registration'), 'fa-door-open', 'btn-g');
        if (s === 'registration') { html += actionButton('status', t._key, tr('Закрыть набор', 'Close registration'), 'fa-lock', 'btn-og'); html += actionButton('status', t._key, tr('Начать', 'Start'), 'fa-play', 'btn-g'); }
        if (s === 'closed') html += actionButton('status', t._key, tr('Начать', 'Start'), 'fa-play', 'btn-g');
        if (s === 'active') html += actionButton('status', t._key, tr('Завершить', 'Finish'), 'fa-flag-checkered', 'btn-g');
        if (s === 'completed') html += actionButton('status', t._key, tr('Открыть заново', 'Reopen'), 'fa-rotate-left', 'btn-og');
        if (s !== 'cancelled' && s !== 'completed') html += actionButton('status', t._key, tr('Отменить', 'Cancel'), 'fa-ban', 'btn-r');
        return html;
    }
    function rowHtml(t) {
        var s = statusOf(t), cls = statusClass(s), reg = t.registeredPlayers || {}, count = Object.keys(reg).length, divs = t.divisions ? Object.keys(t.divisions).length : 0;
        return '<div class="tna-row"><div class="tna-row-main"><div class="tna-row-title"><span>' + esc(t.name || tr('Без названия', 'Untitled')) + '</span><span class="tna-status ' + cls + '">' + esc(statusLabel(s)) + '</span></div><div class="tna-row-meta"><span><i class="fas fa-calendar"></i> ' + esc(dateText(t.date)) + '</span><span><i class="fas fa-users"></i> ' + count + ' ' + tr('участн.', 'players') + '</span><span><i class="fas fa-layer-group"></i> ' + divs + ' ' + tr('групп', 'groups') + '</span><span><i class="fas fa-clock"></i> ' + esc(t.updatedAt ? dateText(t.updatedAt) : '—') + '</span></div></div><div class="tna-actions">' + actionButton('edit', t._key, tr('Изменить', 'Edit'), 'fa-pen', 'btn-g') + actionButton('clone', t._key, tr('Клон', 'Clone'), 'fa-copy') + actionButton('applications', t._key, tr('Заявки', 'Applications'), 'fa-user-check') + actionButton('start', t._key, tr('Старт', 'Start sheet'), 'fa-qrcode') + actionButton('protocol', t._key, tr('Протокол', 'Protocol'), 'fa-file-pdf') + actionButton('audit', t._key, tr('Журнал', 'Audit'), 'fa-clock-rotate-left') + transitionButtons(t) + '</div></div>';
    }
    function renderManager() {
        var rootNode = el('tn-manage-root');
        if (!rootNode) return;
        if (!hasAccess()) { rootNode.innerHTML = '<div class="tnw-empty">' + tr('Раздел доступен только администратору.', 'Admin access required.') + '</div>'; return; }
        bind();
        var items = filtered();
        rootNode.innerHTML = '<div class="tna-shell"><div class="tna-head"><div><div class="tn-public-eyebrow">TOURNAMENT OPERATIONS</div><h2><i class="fas fa-sliders"></i> ' + tr('Управление турнирами', 'Tournament management') + '</h2><p>' + tr('Редактирование всех настроек мастера, заявки, стартовые группы, протокол, роли и журнал изменений — без копирования поля или игроков.', 'Edit every wizard setting, applications, tee sheet, protocol, roles and audit without duplicating the course or players.') + '</p></div><div class="tna-mini-actions">' + actionButton('new', '', tr('Новый турнир', 'New tournament'), 'fa-plus', 'btn-g') + '<button type="button" class="btn btn-og btn-sm" data-tna-action="templates"><i class="fas fa-layer-group"></i> ' + tr('Шаблоны', 'Templates') + '</button></div></div>' + renderStats(entries()) + '<div class="tna-toolbar"><div class="form-group"><label>' + tr('Поиск по названию', 'Search by name') + '</label><input id="tna-search" class="form-input" type="search" value="' + esc(manager.query) + '" placeholder="Cup / Кубок"></div><div class="form-group"><label>' + tr('Статус', 'Status') + '</label><select id="tna-status" class="form-input"><option value="all">' + tr('Все', 'All') + '</option>' + ['draft', 'registration', 'closed', 'active', 'completed', 'cancelled'].map(function (s) { return '<option value="' + s + '"' + (manager.status === s ? ' selected' : '') + '>' + esc(statusLabel(s)) + '</option>'; }).join('') + '</select></div><button type="button" class="btn btn-ol btn-sm" data-tna-action="refresh"><i class="fas fa-rotate"></i> ' + tr('Обновить', 'Refresh') + '</button></div><div class="tna-list">' + (items.length ? items.map(rowHtml).join('') : '<div class="tnw-empty"><i class="fas fa-trophy"></i><br>' + tr('Турниров не найдено.', 'No tournaments found.') + '</div>') + '</div></div>';
        var search = el('tna-search'); if (search) { search.addEventListener('input', function () { manager.query = search.value; renderManager(); }); search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
        var select = el('tna-status'); if (select) select.addEventListener('change', function () { manager.status = select.value; renderManager(); });
    }

    function renderEditorBanner() {
        var rootNode = el('tn-wizard-root');
        if (!rootNode || !root.tnWiz || !root.tnWiz.editTournamentId) return;
        var old = el('tna-edit-banner'); if (old) old.remove();
        var banner = document.createElement('div'); banner.id = 'tna-edit-banner'; banner.className = 'tna-editor-banner';
        var t = manager.tournaments[root.tnWiz.editTournamentId] || {};
        banner.innerHTML = '<div><i class="fas fa-pen-to-square"></i> ' + tr('Редактирование: ', 'Editing: ') + esc(t.name || root.tnWiz.editTournamentId) + '<small>' + tr('Изменения сохраняются в существующий турнир и попадают в журнал аудита.', 'Changes are saved to the existing tournament and recorded in the audit log.') + '</small></div><div class="tna-mini-actions"><button type="button" class="btn btn-og btn-sm" data-tna-action="cancel-edit"><i class="fas fa-arrow-left"></i> ' + tr('К управлению', 'Back to management') + '</button><button type="button" class="btn btn-g btn-sm" data-tna-action="save-edit"><i class="fas fa-save"></i> ' + tr('Сохранить изменения', 'Save changes') + '</button></div>';
        rootNode.insertBefore(banner, rootNode.firstChild);
    }
    root.tnwRenderWizard = function () { baseRenderWizard(); renderEditorBanner(); };

    function saveEdited() {
        if (!assertWrite()) return;
        var id = root.tnWiz && root.tnWiz.editTournamentId, t = manager.tournaments[id], cfg = root.tnWiz && root.tnWiz.draft, database = db();
        if (!id || !t || !cfg || !database) return;
        var errors = (typeof root.tnwValidate === 'function' ? root.tnwValidate() : []).concat(core ? core.validateConfig(cfg) : []);
        if (errors.length) { toast(tr('Исправьте обязательные поля: ', 'Fix required fields: ') + errors[0], 'error'); return; }
        var payload = root.tnwBuildTournamentPayload(cfg), patch = {
            name: payload.name, nameEn: payload.nameEn, description: payload.description, logo: payload.logo, banner: payload.banner,
            date: payload.date, endDate: payload.endDate, formats: payload.formats, tees: payload.tees, categories: payload.categories,
            level: payload.level, typeId: payload.typeId, wizard: cfg, courseRef: 'settings/course', updatedAt: now(), updatedBy: actorLabel(),
            registration: { enabled: true, openAt: cfg.format && cfg.format.regOpen || '', closeAt: cfg.format && cfg.format.regClose || '', limit: parseInt(cfg.participants && cfg.participants.limit, 10) || 0, waitlist: cfg.participants ? cfg.participants.waitlist !== false : true, approval: cfg.participants && cfg.participants.moderation || 'manual' },
            protocol: cfg.protocol || (cfg.prizes && cfg.prizes.protocol) || t.protocol || {}
        };
        var changes = core ? core.diff(t.wizard || {}, cfg) : [];
        database.ref('tournaments/' + id).update(patch).then(function () { return database.ref('tournaments/' + id + '/audit').push(core ? core.audit('updated', actor(), changes, { tournamentId: id }) : { event: 'updated', by: actorLabel(), at: now(), changes: changes }); }).then(function () {
            toast('✅ ' + tr('Изменения сохранены', 'Changes saved'), 'success');
            if (studioHostsWizard() && typeof root.tnsWizardSaved === 'function') { root.tnsWizardSaved(id, cfg); return; }
            root.tnWiz.editTournamentId = null; root.tnWiz.editOriginal = null; root.tnWiz.draft = null; root.tnWiz.draftKey = null; manager.panel = 'list'; root.tnwShowSubTab('manage');
        }).catch(function (error) { toast('❌ ' + (error && error.message || error), 'error'); });
    }
    root.tnwPublish = function () { if (root.tnWiz && root.tnWiz.editTournamentId) saveEdited(); else basePublish(); };
    function editTournament(id) {
        var t = manager.tournaments[id]; if (!t || !root.tnWiz) return;
        // Единая вкладка: мастер открывается в карточке турнира (раздел «Настройки»).
        if (typeof root.tnsOpenWizardEdit === 'function') { manager.panel = 'editor'; root.tnsOpenWizardEdit(id); return; }
        root.tnWiz.editTournamentId = id; root.tnWiz.editOriginal = clone(t); root.tnWiz.draft = defaultConfig(t); root.tnWiz.draftKey = 'edit_' + id; root.tnWiz.step = 0; root.tnWiz.dirty = false; manager.panel = 'editor'; root.tnwShowSubTab('new-create'); root.tnwRenderWizard();
    }
    function cloneTournament(id) {
        if (!assertWrite()) return;
        var t = manager.tournaments[id], database = db(); if (!t || !database || !core) return;
        var include = window.confirm(tr('Скопировать подтверждённых участников и заявки вместе с настройками?', 'Copy confirmed participants and applications too?'));
        var copy = core.cloneConfig(t, include); copy.name = (t.name || tr('Турнир', 'Tournament')) + ' · ' + tr('копия', 'copy'); if (copy.wizard && copy.wizard.info) copy.wizard.info.nameRu = copy.name; copy.createdBy = actorLabel(); copy.updatedBy = actorLabel(); copy.createdAt = now();
        database.ref('tournaments').push(copy).then(function (ref) { return database.ref('tournaments/' + ref.key + '/audit').push(core.audit('cloned', actor(), [], { tournamentId: ref.key, clonedFrom: id, includeParticipants: include })).then(function () { toast('✅ ' + tr('Клон создан в черновиках', 'Clone created as draft'), 'success'); }); }).catch(function (error) { toast('❌ ' + (error && error.message || error), 'error'); });
    }
    function transition(id, target) {
        if (!assertWrite()) return;
        var t = manager.tournaments[id], database = db(); if (!t || !database || !core) return;
        var result = core.transition(t, target);
        if (!result.ok) { toast(tr('Недопустимый переход статуса.', 'Invalid status transition.'), 'error'); return; }
        var patch = result.patch; patch.updatedAt = now(); patch.updatedBy = actorLabel();
        database.ref('tournaments/' + id).update(patch).then(function () { return database.ref('tournaments/' + id + '/audit').push(core.audit('status_changed', actor(), [{ path: 'lifecycleStatus', before: result.from, after: result.to }], { tournamentId: id })); }).then(function () { toast('✅ ' + tr('Статус: ', 'Status: ') + statusLabel(target), 'success'); if (inStudio() && manager.selectedId) renderSelected(); else renderManager(); }).catch(function (error) { toast('❌ ' + (error && error.message || error), 'error'); });
    }
    function openStart(id) {
        // Единая вкладка: стартовый лист — раздел карточки турнира.
        if (studioNav('tnsOpenStart', id)) return;
        var tab = document.querySelector('.admin-tab[onclick*="\'tournaments\'"]');
        if (typeof root.switchTab === 'function') root.switchTab('tournaments', tab);
        setTimeout(function () { if (typeof root.psOnTournamentChange === 'function') root.psOnTournamentChange(id); var target = el('tab-start-content'); if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
    }
    function openProtocol(id) { if (typeof root.tnOpenProtocolModal === 'function') root.tnOpenProtocolModal(id); else toast(tr('Модуль протокола ещё загружается.', 'Protocol module is still loading.'), 'info'); }

    function applicationRows(t) {
        var rows = [], waits = t.waitlist || {}, apps = t.applications || {};
        Object.keys(apps).forEach(function (key) { var a = clone(apps[key] || {}); a._id = key; a._kind = 'application'; rows.push(a); });
        Object.keys(waits).forEach(function (key) { var w = clone(waits[key] || {}); w._id = key; w._kind = 'waitlist'; if (!rows.some(function (a) { return a._id === key || (a.uid && w.uid && a.uid === w.uid); })) rows.push(w); });
        return rows.sort(function (a, b) { return (b.createdAt || b.registeredAt || 0) - (a.createdAt || a.registeredAt || 0); });
    }
    function applicationsHtml(t) {
        var rows = applicationRows(t);
        return '<div class="tna-panel"><h3><i class="fas fa-user-check"></i> ' + tr('Заявки и участники', 'Applications & participants') + '</h3><p class="tna-panel-sub">' + tr('Excel/CSV, клубный список и ручное добавление приводят данные к тому же registeredPlayers. Заявки остаются в applications для аудита.', 'Excel/CSV, club roster and manual entry use the same registeredPlayers path. Applications remain in applications for audit.') + '</p><div class="tna-two-col"><form id="tna-manual-form" class="tna-panel" data-tna-id="' + esc(t._key) + '"><h3>' + tr('Добавить вручную', 'Add manually') + '</h3><div class="form-group"><label>' + tr('ФИО', 'Full name') + '</label><input class="form-input" name="name" required maxlength="120"></div><div class="form-row"><div class="form-group"><label>HCP</label><input class="form-input" name="handicap" type="number" min="-10" max="54" step="0.1"></div><div class="form-group"><label>' + tr('Пол', 'Gender') + '</label><select class="form-input" name="gender"><option value="men">' + tr('Мужчины', 'Men') + '</option><option value="women">' + tr('Девушки', 'Women') + '</option></select></div></div><button class="btn btn-g btn-sm" type="submit"><i class="fas fa-user-plus"></i> ' + tr('Добавить', 'Add') + '</button></form><div class="tna-panel"><h3>' + tr('Импорт и база клуба', 'Import & club roster') + '</h3><div class="tna-import-box"><input id="tna-excel-input" type="file" accept=".xlsx,.xls,.csv" data-tna-id="' + esc(t._key) + '"><small>' + tr('До 500 строк. Колонки: ФИО/Name, HCP/гандикап, Gender/Пол, Tee/ТИ.', 'Up to 500 rows. Columns: Name, HCP, Gender, Tee.') + '</small></div><div class="tna-mini-actions" style="margin-top:9px;">' + actionButton('club', t._key, tr('Добавить игроков клуба', 'Add club players'), 'fa-users') + '</div><div id="tna-import-status" class="tna-panel-sub" style="margin-top:8px;"></div></div></div><h3 style="margin-top:16px;">' + tr('Входящие заявки', 'Incoming applications') + ' · ' + rows.length + '</h3>' + (rows.length ? '<div class="tna-table-wrap"><table class="tna-table"><thead><tr><th>' + tr('Игрок', 'Player') + '</th><th>HCP</th><th>' + tr('Статус', 'Status') + '</th><th>' + tr('Действия', 'Actions') + '</th></tr></thead><tbody>' + rows.map(function (r) { var status = r.status || 'pending'; return '<tr><td><b>' + esc(r.name || '—') + '</b><br><small>' + esc(r.email || r.phone || '') + '</small></td><td>' + esc(r.handicap == null ? '—' : r.handicap) + '</td><td>' + esc(status) + '</td><td>' + (String(status).toLowerCase() === 'approved' ? '<span class="tna-status completed">' + tr('Подтверждён', 'Approved') + '</span>' : actionButton('approve', t._key + '|' + (r._id || ''), tr('Подтвердить', 'Approve'), 'fa-check', 'btn-g') + actionButton('reject', t._key + '|' + (r._id || ''), tr('Отклонить', 'Reject'), 'fa-xmark', 'btn-r')) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="tna-role-empty">' + tr('Новых заявок нет.', 'No incoming applications.') + '</div>') + '</div>';
    }
    function addManual(event) {
        event.preventDefault(); if (!assertWrite()) return; var form = event.target, id = form.getAttribute('data-tna-id'), database = db(); if (!database) return;
        var fd = new FormData(form), name = String(fd.get('name') || '').replace(/\s+/g, ' ').trim(), hcp = parseFloat(String(fd.get('handicap') || '').replace(',', '.'));
        if (name.length < 3 || (isFinite(hcp) && (hcp < -10 || hcp > 54))) { toast(tr('Проверьте ФИО и HCP.', 'Check name and handicap.'), 'error'); return; }
        var key = 'manual_' + now() + '_' + Math.random().toString(36).slice(2, 7), p = { name: name, handicap: isFinite(hcp) ? Math.round(hcp * 10) / 10 : null, gender: fd.get('gender') || 'men', tee: 'wh', addedAt: now(), addedBy: actorLabel() };
        database.ref('tournaments/' + id + '/registeredPlayers/' + key).set(p).then(function () { return database.ref('tournaments/' + id + '/audit').push(core.audit('participant_added', actor(), [], { tournamentId: id, participant: name })); }).then(function () { toast('✅ ' + tr('Участник добавлен', 'Participant added'), 'success'); manager.selectedId = id; manager.panel = 'applications'; renderSelected(); }).catch(function (error) { toast('❌ ' + (error && error.message || error), 'error'); });
    }
    function approveApplication(id, appId, approve) {
        if (!assertWrite()) return;
        var t = manager.tournaments[id], database = db(); if (!t || !database) return;
        var apps = t.applications || {}, waits = t.waitlist || {}, app = apps[appId] || waits[appId]; if (!app) { toast(tr('Заявка уже обработана.', 'Application already processed.'), 'info'); return; }
        var key = app.uid || ('app_' + appId), waitKey = appId;
        Object.keys(waits).some(function (candidate) { if (candidate === appId || (app.uid && candidate === app.uid) || (waits[candidate] && app.uid && waits[candidate].uid === app.uid)) { waitKey = candidate; return true; } return false; });
        var updates = {};
        updates['tournaments/' + id + '/applications/' + appId + '/status'] = approve ? 'approved' : 'rejected';
        updates['tournaments/' + id + '/applications/' + appId + '/reviewedAt'] = now();
        updates['tournaments/' + id + '/applications/' + appId + '/reviewedBy'] = actorLabel();
        updates['tournaments/' + id + '/waitlist/' + waitKey] = null;
        if (approve) updates['tournaments/' + id + '/registeredPlayers/' + key] = app;
        return database.ref().update(updates).then(function () { return database.ref('tournaments/' + id + '/audit').push(core.audit(approve ? 'application_approved' : 'application_rejected', actor(), [], { tournamentId: id, applicationId: appId })); }).then(function () { toast('✅ ' + (approve ? tr('Заявка подтверждена', 'Application approved') : tr('Заявка отклонена', 'Application rejected')), 'success'); renderSelected(); }).catch(function (error) { toast('❌ ' + (error && error.message || error), 'error'); });
    }
    function addClubPlayers(id) {
        if (!assertWrite()) return;
        var database = db(); if (!database) return;
        database.ref('users').once('value').then(function (snapshot) { var users = snapshot.val() || {}, updates = {}, added = 0; Object.keys(users).forEach(function (uid) { var user = users[uid] || {}; if (user.role && user.role !== 'player') return; if (!user.name) return; updates['tournaments/' + id + '/registeredPlayers/' + uid] = { uid: uid, name: user.name, handicap: user.handicap == null ? null : user.handicap, gender: user.gender || 'men', tee: 'wh', addedAt: now(), addedBy: actorLabel(), source: 'club' }; added++; }); if (!added) throw new Error(tr('В базе клуба нет игроков.', 'No club players found.')); return database.ref().update(updates).then(function () { return database.ref('tournaments/' + id + '/audit').push(core.audit('club_roster_imported', actor(), [], { tournamentId: id, count: added })); }).then(function () { toast('✅ ' + tr('Добавлено игроков: ', 'Players added: ') + added, 'success'); renderSelected(); }); }).catch(function (error) { toast('❌ ' + (error && error.message || error), 'error'); });
    }
    function importExcel(input) {
        if (!assertWrite()) return;
        var database = db(), id = input.getAttribute('data-tna-id'), status = el('tna-import-status'); if (!database || !input.files || !input.files[0]) return;
        if (status) status.textContent = tr('Читаю файл…', 'Reading file…');
        var file = input.files[0];
        if (file.size > 5 * 1024 * 1024) { if (status) status.textContent = tr('Файл больше 5 МБ.', 'File exceeds 5 MB.'); return; }
        if (!root.XLSX) { if (status) status.textContent = tr('Модуль Excel не загружен.', 'Excel module is not loaded.'); return; }
        var reader = new FileReader(); reader.onload = function (event) { try {
            var book = root.XLSX.read(event.target.result, { type: 'array' }), sheet = book.Sheets[book.SheetNames[0]], rows = root.XLSX.utils.sheet_to_json(sheet, { defval: '' });
            if (rows.length > 500) throw new Error(tr('Максимум 500 строк.', 'Maximum 500 rows.'));
            var updates = {}, valid = 0, skipped = 0;
            rows.forEach(function (row, index) { var keys = Object.keys(row), get = function (names) { for (var i = 0; i < names.length; i++) { var key = keys.find(function (k) { return String(k).toLowerCase().replace(/ё/g, 'е').indexOf(names[i]) !== -1; }); if (key) return row[key]; } return ''; }, name = String(get(['фио', 'name', 'player', 'участ']) || '').replace(/\s+/g, ' ').trim(); if (!name) { skipped++; return; } var rawHcp = String(get(['гандикап', 'hcp', 'handicap']) || '').replace(',', '.'), hcp = rawHcp === '' ? null : parseFloat(rawHcp); if (hcp !== null && (!isFinite(hcp) || hcp < -10 || hcp > 54)) { skipped++; return; } var genderRaw = String(get(['gender', 'пол']) || '').toLowerCase(), gender = /жен|female|woman|^w$/.test(genderRaw) ? 'women' : 'men', tee = String(get(['tee', 'ти', 'ти-бокс']) || 'wh').toLowerCase(); if (['bk', 'bl', 'wh', 'rd', 'ye'].indexOf(tee) === -1) tee = 'wh'; var key = 'excel_' + now() + '_' + index; updates['tournaments/' + id + '/registeredPlayers/' + key] = { name: name, handicap: hcp, gender: gender, tee: tee, addedAt: now(), addedBy: actorLabel(), source: 'excel' }; valid++; });
            if (!valid) throw new Error(tr('В файле нет валидных строк с ФИО.', 'No valid player rows found.'));
            return database.ref().update(updates).then(function () { return database.ref('tournaments/' + id + '/audit').push(core.audit('participants_imported', actor(), [], { tournamentId: id, source: 'excel', imported: valid, skipped: skipped })); }).then(function () { if (status) status.textContent = tr('Импортировано: ', 'Imported: ') + valid + (skipped ? tr(', пропущено: ', ', skipped: ') + skipped : ''); toast('✅ ' + tr('Импорт завершён', 'Import completed'), 'success'); renderSelected(); });
        } catch (error) { if (status) status.textContent = error.message || String(error); } }; reader.readAsArrayBuffer(file);
    }

    function rolesHtml(t) {
        var roles = t.roles || t.tournamentRoles || {}, list = Array.isArray(roles) ? roles : Object.keys(roles).map(function (key) { var r = clone(roles[key] || {}); r._key = key; return r; });
        return '<div class="tna-panel"><h3><i class="fas fa-user-shield"></i> ' + tr('Роли турнира', 'Tournament roles') + '</h3><p class="tna-panel-sub">' + tr('Судья, секретарь, маршал и наблюдатель имеют отдельное назначение и попадают в журнал.', 'Judge, secretary, marshal and observer assignments are recorded in the audit log.') + '</p><form id="tna-role-form" data-tna-id="' + esc(t._key) + '"><div class="tna-role-row"><div class="form-group tna-role-name"><label>' + tr('Имя / UID', 'Name / UID') + '</label><input class="form-input" name="name" required></div><div class="form-group"><label>' + tr('Роль', 'Role') + '</label><select class="form-input" name="role"><option value="judge">' + tr('Судья', 'Judge') + '</option><option value="secretary">' + tr('Секретарь', 'Secretary') + '</option><option value="marshal">' + tr('Маршал', 'Marshal') + '</option><option value="observer">' + tr('Наблюдатель', 'Observer') + '</option></select></div><div class="form-group"><label>' + tr('Зона / заметка', 'Assignment') + '</label><input class="form-input" name="assignment"></div><button class="btn btn-g btn-sm" type="submit"><i class="fas fa-plus"></i></button></div></form>' + (list.length ? '<div class="tna-table-wrap"><table class="tna-table"><thead><tr><th>' + tr('Кто', 'Who') + '</th><th>' + tr('Роль', 'Role') + '</th><th>' + tr('Назначение', 'Assignment') + '</th><th></th></tr></thead><tbody>' + list.map(function (r) { return '<tr><td>' + esc(r.name || r.uid || '—') + '</td><td>' + esc(r.role || '—') + '</td><td>' + esc(r.assignment || '—') + '</td><td><button type="button" class="btn btn-r btn-sm" data-tna-action="remove-role" data-tna-id="' + esc(t._key + '|' + (r._key || r.uid || r.name)) + '"><i class="fas fa-trash"></i></button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="tna-role-empty">' + tr('Роли ещё не назначены.', 'No roles assigned yet.') + '</div>') + '</div>';
    }
    function saveRole(event) { event.preventDefault(); if (!assertWrite()) return; var form = event.target, id = form.getAttribute('data-tna-id'), database = db(); if (!database) return; var fd = new FormData(form), key = 'role_' + now() + '_' + Math.random().toString(36).slice(2, 6), value = { name: String(fd.get('name') || '').trim(), role: fd.get('role') || 'observer', assignment: String(fd.get('assignment') || '').trim(), addedAt: now(), addedBy: actorLabel() }; if (!value.name) return; database.ref('tournaments/' + id + '/roles/' + key).set(value).then(function () { return database.ref('tournaments/' + id + '/audit').push(core.audit('role_assigned', actor(), [], { tournamentId: id, role: value.role, assignee: value.name })); }).then(function () { renderSelected(); }); }
    function removeRole(id, roleKey) { if (!assertWrite()) return; var database = db(); if (!database) return; database.ref('tournaments/' + id + '/roles/' + roleKey).remove().then(function () { return database.ref('tournaments/' + id + '/audit').push(core.audit('role_removed', actor(), [], { tournamentId: id, role: roleKey })); }).then(function () { renderSelected(); }); }

    function auditHtml(t) {
        var audit = t.audit || {}, list = Object.keys(audit).map(function (key) { var a = audit[key] || {}; a._key = key; return a; }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
        return '<div class="tna-panel"><h3><i class="fas fa-clock-rotate-left"></i> ' + tr('Журнал изменений', 'Audit log') + '</h3>' + (list.length ? '<div class="tna-audit-list">' + list.map(function (a) { var changes = listValue(a.changes); return '<div class="tna-audit-entry"><b>' + esc(a.event || 'updated') + '</b><small>' + esc(a.by || '—') + ' · ' + esc(a.at ? new Date(a.at).toLocaleString() : '—') + '</small>' + (changes.slice(0, 5).map(function (change) { return '<span class="tna-audit-change">' + esc(change.path || '') + ': ' + esc(change.before == null ? '∅' : change.before) + ' → ' + esc(change.after == null ? '∅' : change.after) + '</span>'; }).join('')) + '</div>'; }).join('') + '</div>' : '<div class="tna-role-empty">' + tr('Изменений пока нет.', 'No changes recorded yet.') + '</div>') + '</div>';
    }
    function protocolNominationOptions(t) {
        var configured = t.wizard && t.wizard.prizes && t.wizard.prizes.nominations;
        if (!Array.isArray(configured) || !configured.length) configured = ['best-gross', 'best-net'];
        var labels = { 'best-gross': tr('Best Gross', 'Best Gross'), 'best-net': tr('Best Net', 'Best Net'), 'best-stableford': 'Stableford', 'best-gross-men': tr('Best Gross · мужчины', 'Best Gross · men'), 'best-net-women': tr('Best Net · женщины', 'Best Net · women'), 'longest-drive': 'Longest Drive', 'closest-to-pin': 'Closest to Pin' };
        return configured.map(function (item) { var id = typeof item === 'string' ? item : item && (item.id || item.kind); if (!id) return ''; return '<label class="tn-public-chip"><input type="checkbox" data-tna-nomination-id="' + esc(t._key) + '" value="' + esc(id) + '" checked> ' + esc(labels[id] || id) + '</label>'; }).join('');
    }
    function protocolPanelHtml(t) {
        var state = core ? core.protocolState(t) : { version: 0, state: 'live', fixed: false, published: false }, controls = '';
        if (state.state === 'live') controls = actionButton('protocol-state', t._key + '|fixed', tr('Зафиксировать результаты', 'Fix results'), 'fa-lock', 'btn-g');
        else if (state.state === 'fixed') controls = actionButton('protocol-state', t._key + '|published', tr('Опубликовать протокол', 'Publish protocol'), 'fa-paper-plane', 'btn-g');
        else controls = '<span class="tna-status completed"><i class="fas fa-lock"></i> ' + tr('Публичная версия зафиксирована', 'Public version is fixed') + '</span>';
        return '<div class="tna-panel"><h3><i class="fas fa-file-signature"></i> ' + tr('Финальный протокол', 'Final protocol') + '</h3><p class="tna-panel-sub">' + tr('Снимок результатов по лункам создаётся из существующих rounds + settings/course. Версия неизменяема после публикации; экспорт CSV открывается в Excel.', 'The per-hole result snapshot uses existing rounds + settings/course. Published versions are immutable; CSV opens in Excel.') + '</p><div class="tna-panel-sub">' + tr('Номинации фиксируются вместе с версией:', 'Nominations are stored with the version:') + '</div><div class="tna-mini-actions" style="margin-bottom:11px;">' + protocolNominationOptions(t) + '</div><div class="tna-toolbar"><span class="tna-status ' + (state.state === 'published' ? 'completed' : state.state === 'fixed' ? 'closed' : 'active') + '">' + esc(state.state) + '</span><span class="tn-public-chip">v' + state.version + '</span><div class="tna-actions">' + controls + actionButton('protocol', t._key, tr('Открыть протокол', 'Open protocol'), 'fa-file-pdf', 'btn-og') + (t.protocol && t.protocol.rows && t.protocol.rows.length ? actionButton('protocol-export', t._key, 'CSV', 'fa-file-csv', 'btn-og') + actionButton('protocol-excel', t._key, 'Excel', 'fa-file-excel', 'btn-og') : '') + '</div></div></div>';
    }
    function finalizeProtocol(id, target) {
        if (!assertWrite()) return;
        var t = manager.tournaments[id], database = db(); if (!t || !database || !core) return;
        if (target === 'fixed') {
            Promise.all([database.ref('rounds').once('value'), database.ref('settings/course').once('value')]).then(function (result) {
                var all = result[0].val() || {}, rounds = {}; Object.keys(all).forEach(function (key) { if (all[key] && String(all[key].tournamentId || '') === String(id)) rounds[key] = all[key]; });
                var course = result[1].val() || {}, rows = core.protocolRows(Object.assign({}, t, { _key: id }), rounds, course), selectedNominations = [];
                document.querySelectorAll('[data-tna-nomination-id="' + id.replace(/"/g, '\\"') + '"]:checked').forEach(function (input) { selectedNominations.push(input.value); });
                var snapshot = core.protocolSnapshot(t, rows, actor(), { nominations: core.buildNominations(rows, selectedNominations) });
                return database.ref('tournaments/' + id + '/protocol').set(snapshot).then(function () { return database.ref('tournaments/' + id + '/audit').push(core.audit('protocol_fixed', actor(), [], { tournamentId: id, version: snapshot.version, rows: rows.length })); });
            }).then(function () { toast('✅ ' + tr('Результаты зафиксированы', 'Results fixed'), 'success'); renderSelected(); }).catch(function (error) { toast('❌ ' + (error && error.message || error), 'error'); });
        } else {
            var result = core.protocolTransition(t, target, actor());
            if (!result.ok) { toast(tr('Сначала зафиксируйте протокол.', 'Fix the protocol before publishing.'), 'error'); return; }
            var patch = merge(t.protocol || {}, result.patch);
            database.ref('tournaments/' + id + '/protocol').set(patch).then(function () { return database.ref('tournaments/' + id + '/audit').push(core.audit('protocol_published', actor(), [], { tournamentId: id, version: patch.version })); }).then(function () { toast('✅ ' + tr('Протокол опубликован', 'Protocol published'), 'success'); renderSelected(); }).catch(function (error) { toast('❌ ' + (error && error.message || error), 'error'); });
        }
    }
    function exportProtocolCsv(id) {
        var t = manager.tournaments[id], rows = t && t.protocol && t.protocol.rows; if (!rows || !rows.length) return;
        var blob = new Blob([core.csv(rows)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (String(t.name || 'tournament').replace(/[^a-zа-я0-9]+/gi, '_') || 'tournament') + '-protocol-v' + (t.protocol.version || 1) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function exportProtocolExcel(id) {
        var t = manager.tournaments[id], rows = t && t.protocol && t.protocol.rows; if (!rows || !rows.length) return;
        var html = '<!doctype html><html><head><meta charset="utf-8"></head><body><table><tr><th>#</th><th>Player</th><th>HCP</th><th>Gross</th><th>Net</th><th>Stableford</th><th>Total</th><th>Status</th></tr>' + rows.map(function (row) { return '<tr><td>' + esc(row.position == null ? '' : row.position) + '</td><td>' + esc(row.name) + '</td><td>' + esc(row.handicap == null ? '' : row.handicap) + '</td><td>' + esc(row.gross) + '</td><td>' + esc(row.net) + '</td><td>' + esc(row.stableford) + '</td><td>' + esc(row.total) + '</td><td>' + esc(row.status) + '</td></tr>'; }).join('') + '</table></body></html>';
        var blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (String(t.name || 'tournament').replace(/[^a-zа-я0-9]+/gi, '_') || 'tournament') + '-protocol.xls'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function renderSelected() {
        var rootNode = el('tn-manage-root'), t = manager.tournaments[manager.selectedId]; if (!rootNode || !t) return;
        rootNode.innerHTML = '<div class="tna-shell"><div class="tna-head"><div><div class="tn-public-eyebrow">TOURNAMENT OPERATIONS</div><h2><i class="fas fa-sliders"></i> ' + esc(t.name || tr('Турнир', 'Tournament')) + '</h2><p>' + tr('Операции турнира, заявки, роли и контрольный журнал.', 'Tournament operations, applications, roles and audit.') + '</p></div><button type="button" class="btn btn-og btn-sm" data-tna-action="back"><i class="fas fa-arrow-left"></i> ' + tr('К списку турниров', 'Back to tournaments') + '</button></div><div class="tna-editor">' + protocolPanelHtml(t) + '<div class="tna-two-col">' + applicationsHtml(t) + rolesHtml(t) + '</div>' + auditHtml(t) + '</div></div>';
    }
    function openPanel(id, panel) { manager.selectedId = id; manager.panel = panel; renderSelected(); }

    function handleClick(event) {
        var node = event.target.closest ? event.target.closest('[data-tna-action]') : null; if (!node) return;
        var action = node.getAttribute('data-tna-action'), token = node.getAttribute('data-tna-id') || '', parts = token.split('|'), id = parts[0];
        if (action === 'edit') editTournament(id);
        else if (action === 'clone') cloneTournament(id);
        else if (action === 'applications') openPanel(id, 'applications');
        else if (action === 'audit') openPanel(id, 'audit');
        else if (action === 'protocol') openProtocol(id);
        else if (action === 'protocol-state') finalizeProtocol(parts[0], parts[1]);
        else if (action === 'protocol-export') exportProtocolCsv(id);
        else if (action === 'protocol-excel') exportProtocolExcel(id);
        else if (action === 'start') openStart(id);
        else if (action === 'status') { var t = manager.tournaments[id], s = statusOf(t), target = s === 'draft' || s === 'closed' ? 'registration' : s === 'registration' ? (node.textContent.indexOf('Начать') !== -1 || node.textContent.indexOf('Start') !== -1 ? 'active' : 'closed') : s === 'active' ? 'completed' : s === 'completed' ? 'active' : 'cancelled'; transition(id, target); }
        else if (action === 'back') { if (inStudio()) return; manager.panel = 'list'; renderManager(); }
        else if (action === 'new') { if (studioNav('tnsOpenWizardNew')) return; root.tnwShowSubTab('new-create'); if (typeof root.tnwStartNewDraft === 'function') root.tnwStartNewDraft(); }
        else if (action === 'templates') { if (studioNav('tnsOpenListSection', 'templates')) return; root.tnwShowSubTab('templates'); }
        else if (action === 'refresh') { bind(); if (inStudio() && manager.selectedId) renderSelected(); else renderManager(); }
        else if (action === 'approve' || action === 'reject') approveApplication(parts[0], parts[1], action === 'approve');
        else if (action === 'club') addClubPlayers(id);
        else if (action === 'remove-role') { if (window.confirm(tr('Удалить роль?', 'Remove this role?'))) removeRole(parts[0], parts[1]); }
        else if (action === 'cancel-edit') { if (studioHostsWizard() && typeof root.tnsWizardCancel === 'function') { root.tnsWizardCancel(); return; } root.tnWiz.editTournamentId = null; root.tnWiz.draft = null; root.tnWiz.draftKey = null; root.tnwShowSubTab('manage'); }
        else if (action === 'save-edit') saveEdited();
    }
    function handleSubmit(event) { var form = event.target; if (form.id === 'tna-manual-form') addManual(event); if (form.id === 'tna-role-form') saveRole(event); }
    function handleChange(event) { if (event.target && event.target.id === 'tna-excel-input') importExcel(event.target); }
    document.addEventListener('click', handleClick);
    document.addEventListener('submit', handleSubmit);
    document.addEventListener('change', handleChange);

    // Re-render the management pane after language changes and append the edit banner
    // after the base wizard renders its HTML.
    root.tnwOnLangChange = function () { if (baseLangChange) baseLangChange(); if (manager.panel === 'list' && manager.selectedId == null) renderManager(); if (root.tnWiz && root.tnWiz.editTournamentId) { root.tnwRenderWizard(); } };
    function cardBarHtml(item, id) {
        var t = Object.assign({}, item || {});
        t._key = id || t._key || '';
        var s = statusOf(t);
        return '<span class="tna-status ' + statusClass(s) + '">' + esc(statusLabel(s)) + '</span>' +
            transitionButtons(t) +
            actionButton('clone', t._key, tr('Клон', 'Clone'), 'fa-copy');
    }

    root.tnAdminRender = renderManager;
    root.tnAdminEditTournament = editTournament;
    root.tnAdminSaveEditedTournament = saveEdited;
    // API для единой вкладки «Турниры 🏆» (js/tn-studio.js).
    root.tnAdminBind = bind;
    root.tnAdminOpenPanel = openPanel;
    root.tnAdminDefaultConfig = defaultConfig;
    root.tnAdminClone = clone;
    root.tnAdminCardBar = cardBarHtml;
    root.tnAdminStatusOf = statusOf;
    root.tnAdminStatusLabel = statusLabel;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () {
        if (String(window.location.hash || '').toLowerCase() === '#manage') root.tnwShowSubTab('manage', true);
    });
})(typeof window !== 'undefined' ? window : this);
