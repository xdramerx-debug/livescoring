// ============================================================
// TN-MGR-UI — экраны системы турниров внутри админ-панели
// ------------------------------------------------------------
// Вкладка «Турниры 🏆» в admin.html: список турниров, форма
// создания/правки, карточка турнира с вкладками Раунды, Группы,
// Участники, Стартовый лист (js/tn-mgr-sheet.js) и Счетные карточки
// (js/tn-mgr-printcards.js); экран счёта и результаты — js/tn-mgr-round.js).
//
// Всё, что видно, редактируется и тянется из данных:
//   • форматы — справочник из данных (tournaments/<id>/formatsDict);
//   • группы — из узла групп турнира (совместимо с divisions);
//   • колонки стартового листа — из sheets/<rid>/columns;
//   • фильтры по группам — из названий групп турнира.
// ============================================================
var TnMgrUI = (function (root) {
    'use strict';

    function doc() { return root.document; }
    function core() { return root.TnMgrCore; }
    function data() { return root.TnMgrData; }
    function io() { return root.TnMgrIO; }

    // ----------------------------------------------------------
    // ЯЗЫК, ЭКРАНИРОВАНИЕ, МЕЛОЧИ
    // ----------------------------------------------------------
    function lang() {
        try {
            var stored = root.localStorage && root.localStorage.getItem('pestovo_lang');
            if (stored === 'en' || stored === 'ru') return stored;
        } catch (e) { /* silent */ }
        return root.currentLang === 'en' ? 'en' : 'ru';
    }
    /** Двуязычная строка: bi('Турниры', 'Tournaments'). */
    function bi(ru, en) { return lang() === 'en' ? (en || ru) : ru; }
    function esc(value) { return core().esc(value); }
    /**
     * Подтверждение действия. js/utils.js реализует
     * uiConfirm({title, text, confirmLabel, danger}) → Promise<boolean>,
     * поэтому приводим вызовы к этому виду (и оставляем window.confirm).
     */
    function confirmAction(options) {
        var opts = options || {};
        var payload = {
            title: opts.title || '',
            text: opts.message || opts.text || '',
            confirmLabel: opts.confirmText || bi('Удалить', 'Delete'),
            cancelLabel: bi('Отмена', 'Cancel'),
            danger: opts.danger !== false
        };
        var ask;
        if (typeof root.uiConfirm === 'function') {
            ask = Promise.resolve(root.uiConfirm(payload)).catch(function () { return false; });
        } else if (typeof root.confirm === 'function') {
            ask = Promise.resolve(!!root.confirm(payload.text));
        } else {
            ask = Promise.resolve(true);
        }
        return ask.then(function (ok) {
            if (ok && typeof opts.onConfirm === 'function') return opts.onConfirm();
            return null;
        });
    }

    function toastMsg(message, type) {
        if (typeof root.toast === 'function') root.toast(message, type || 'success');
        else if (type === 'error') console.error('[tn-mgr]', message);
    }
    function el(id) { try { return doc().getElementById(id); } catch (e) { return null; } }
    function rootEl() { return el('tnm-root'); }

    /** Номер колонки (0, 1, 2…) в букву Excel (A, B, C…) — для предпросмотра. */
    function columnLetter(index) {
        var n = core().intOf(index, 0);
        if (n == null || n < 0) return '?';
        var letter = '';
        n = n + 1;
        while (n > 0) {
            var rest = (n - 1) % 26;
            letter = String.fromCharCode(65 + rest) + letter;
            n = Math.floor((n - 1) / 26);
        }
        return letter;
    }

    // ----------------------------------------------------------
    // СОСТОЯНИЕ И МАРШРУТИЗАЦИЯ
    // ----------------------------------------------------------
    var state = {
        route: { view: 'list', tid: '', tab: 'rounds', rid: '', pid: '', sub: '' },
        tournaments: {},
        tournament: null,
        loading: true,
        form: null,          // черновик формы создания/правки
        editingTournament: false,
        pendingPlayers: [],  // участники из Excel/базы клуба, ждут сохранения формы турнира
        formDirectoryQuery: '',
        formDirectorySelection: {},
        formDirectoryCache: null,
        groupForm: null,     // { id, name, hcpFrom, hcpTo, gender, tee, format, members }
        groupDistributionCount: 3,
        participantQuery: '',
        participantTableQuery: '',
        selectedParticipantIds: {},
        rusgolfSync: { running: false, status: '' },
        suggestions: [],
        scoreData: null,     // заполняется экраном счёта (tn-mgr-round.js)
        resultsData: null,
        groupFilter: 'all',
        sort: { key: '', dir: 'desc' },
        sheetBusy: false,
        busy: false
    };
    var unwatchTournaments = null;
    var unwatchTournament = null;
    var renderTimer = null;
    var actions = {};
    var modals = {};

    function on(action, handler) { actions[action] = handler; }
    function modal(name, handler) { modals[name] = handler; }

    /** Разбор hash вида #tnm/<tid>/<tab>/<rid>/<sub>. */
    function parseHash() {
        var raw = String(root.location.hash || '').replace(/^#/, '');
        var parts = raw.split('/').filter(function (part) { return part !== ''; });
        if (!parts.length || parts[0] !== 'tnm') return { view: 'list', tid: '', tab: 'rounds', rid: '', pid: '', sub: '' };
        if (parts[1] === 'new') return { view: 'form', tid: '', tab: '', rid: '', pid: '', sub: '', create: true };
        var tid = parts[1] || '';
        if (!tid) return { view: 'list', tid: '', tab: 'rounds', rid: '', pid: '', sub: '' };
        if (parts[2] === 'edit') return { view: 'form', tid: tid, tab: '', rid: '', pid: '', sub: '' };
        if (parts[2] === 'round') {
            return {
                view: 'round', tid: tid, rid: parts[3] || '', tab: (parts[4] === 'results' ? 'results' : (parts[4] === 'scorecards' ? 'scorecards' : 'score')),
                pid: parts[5] === 'player' ? (parts[6] || '') : '', sub: parts[4] || 'score'
            };
        }
        if (parts[2] === 'player') return { view: 'player', tid: tid, pid: parts[3] || '', rid: parts[4] || '', tab: 'score', sub: '' };
        var tabs = ['rounds', 'groups', 'participants', 'sheet', 'printcards'];
        return { view: 'card', tid: tid, tab: tabs.indexOf(parts[2]) !== -1 ? parts[2] : 'rounds', rid: '', pid: '', sub: '' };
    }

    function navigate(route) {
        var next = Object.assign({}, state.route, route || {});
        var hash = '#tnm';
        if (next.view === 'form') hash += next.tid ? ('/' + next.tid + '/edit') : '/new';
        else if (next.view === 'card') hash += '/' + next.tid + '/' + next.tab;
        else if (next.view === 'round') hash += '/' + next.tid + '/round/' + next.rid + '/' + (next.tab === 'results' ? 'results' : (next.tab === 'scorecards' ? 'scorecards' : 'score')) + (next.pid ? '/player/' + next.pid : '');
        else if (next.view === 'player') hash += '/' + next.tid + '/player/' + next.pid + (next.rid ? '/' + next.rid : '');
        if (String(root.location.hash || '') === hash) {
            state.route = parseHash();
            render();
        } else {
            root.location.hash = hash;
        }
    }

    function applyRoute() {
        var route = parseHash();
        var tidChanged = route.tid !== state.route.tid;
        state.route = route;
        if (route.view === 'form' && route.create) prepareCreateForm();
        if (route.view === 'form' && route.tid && !state.form) prepareEditForm();
        // Переподписываемся только при смене турнира: иначе переход между
        // вкладками карточки обнулял бы уже загруженные данные.
        if (tidChanged) bindTournament(route.tid);
        render();
    }

    // ----------------------------------------------------------
    // ПОДПИСКИ
    // ----------------------------------------------------------
    function bindList() {
        if (unwatchTournaments || !data()) return;
        unwatchTournaments = data().watchTournaments(function (all) {
            state.tournaments = all || {};
            state.loading = false;
            if (state.route.view === 'list') render();
        });
    }

    function bindTournament(tid) {
        if (unwatchTournament) { unwatchTournament(); unwatchTournament = null; }
        state.tournament = null;
        if (!tid) return;
        unwatchTournament = data().watchTournament(tid, function (value) {
            state.tournament = value;
            state.loading = false;
            // Пока организатор печатает в поле, не перерисовываем список
            // мгновенно: рисуем после короткой паузы и с сохранением фокуса.
            scheduleRender();
        });
    }

    function scheduleRender() {
        if (renderTimer) return;
        renderTimer = setTimeout(function () {
            renderTimer = null;
            render();
        }, 120);
    }

    /** Перерисовать вкладку при смене языка (локализация админки). */
    function watchLanguage() {
        try {
            var observer = new MutationObserver(function () { render(); });
            observer.observe(doc().documentElement, { attributes: true, attributeFilter: ['lang'] });
        } catch (e) { /* silent */ }
    }

    // ----------------------------------------------------------
    // ДАННЫЕ ТУРНИРА (геттеры для других модулей)
    // ----------------------------------------------------------
    function tournament() { return state.tournament || null; }
    function playersOf(tournamentData) {
        var t = tournamentData || tournament() || {};
        return data().listOf(t.players).sort(function (a, b) {
            return core().playerFio(a).localeCompare(core().playerFio(b), 'ru');
        });
    }
    function groupsOf(tournamentData) {
        var t = tournamentData || tournament() || {};
        return data().listOf(t.groups);
    }
    function roundsOf(tournamentData) {
        var t = tournamentData || tournament() || {};
        return data().listOf(t.rounds).sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    }
    function roundOf(rid) {
        var t = tournament() || {};
        return data().asMap(t.rounds)[rid] || null;
    }
    function playerOf(pid) {
        var t = tournament() || {};
        return data().asMap(t.players)[pid] || null;
    }
    function sheetOf(rid) {
        var t = tournament() || {};
        return data().asMap(t.sheets)[rid] || null;
    }
    function tournamentsList() {
        var all = state.tournaments || {};
        return Object.keys(all).map(function (tid) {
            var item = Object.assign({ id: tid }, all[tid] || {});
            return item;
        }).filter(function (item) {
            // Турниры прежнего мастера/студии ведёт их собственный интерфейс.
            return !item.fromWizard && !item.fromStudio && !item.wizardVersion;
        }).sort(function (a, b) {
            var ad = String(a.startDate || a.date || '');
            var bd = String(b.startDate || b.date || '');
            if (ad !== bd) return bd.localeCompare(ad);
            return (b.createdAt || 0) - (a.createdAt || 0);
        });
    }
    function catalog() {
        var t = tournament() || {};
        var extra = [data().asMap(t.formatsDict), data().asMap(root.__tnmGlobalFormats)];
        return core().formatCatalog.apply(null, extra);
    }
    function formatsOfTournament() {
        var t = tournament() || {};
        var selected = (t.formats || []).slice();
        var catalogList = catalog();
        // Отмеченные форматы, которых нет в справочнике, всё равно показываем.
        selected.forEach(function (name) {
            var found = catalogList.some(function (item) { return core().formatLabel(item) === name || item.id === core().formatId(name); });
            if (!found) catalogList.push({ id: core().formatId(name), ru: name, en: name, custom: true });
        });
        return { catalog: catalogList, selected: selected };
    }
    function groupFormatOptions(selected) {
        var formats = formatsOfTournament();
        var html = '<option value="">' + esc(bi('Формат турнира', 'Tournament default')) + '</option>';
        formats.catalog.forEach(function (item) {
            var label = core().formatLabel(item, lang());
            html += '<option value="' + esc(label) + '"' + (label === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
        });
        return html;
    }
    function tees() {
        var list = root.TEES || { bk: 'Чёрный', bl: 'Синий', wh: 'Белый', rd: 'Красный' };
        return Object.keys(list).map(function (code) { return { code: code, name: list[code] }; });
    }
    function teeOptionsHtml(selected, withEmpty) {
        var html = withEmpty ? '<option value="">—</option>' : '';
        tees().forEach(function (tee) {
            html += '<option value="' + esc(tee.code) + '"' + (tee.code === selected ? ' selected' : '') + '>' + esc(tee.name) + '</option>';
        });
        return html;
    }
    function genderOptionsHtml(selected, withEmpty) {
        var options = [
            { code: '', ru: withEmpty ? '—' : 'Не указан', en: withEmpty ? '—' : 'Not set' },
            { code: 'men', ru: 'Мужчины', en: 'Men' },
            { code: 'women', ru: 'Женщины', en: 'Ladies' },
            { code: 'all', ru: 'Все', en: 'All' }
        ];
        var html = '';
        options.forEach(function (option) {
            if (option.code === '' && !withEmpty && selected !== '') return;
            html += '<option value="' + option.code + '"' + (option.code === (selected || '') ? ' selected' : '') + '>' + esc(bi(option.ru, option.en)) + '</option>';
        });
        return html;
    }
    function baseUrl() { return typeof root.baseUrl === 'function' ? root.baseUrl() : ''; }

    // ----------------------------------------------------------
    // РЕНДЕР
    // ----------------------------------------------------------
    function render() {
        var host = rootEl();
        if (!host) return;
        var active = doc().activeElement;
        var focusKey = active && host.contains(active) ? active.getAttribute('data-tnm-focus') : null;
        var focusPos = null;
        try { if (focusKey && active.setSelectionRange) focusPos = [active.selectionStart, active.selectionEnd]; } catch (e) { /* silent */ }
        var html = '';
        if (state.route.view === 'list') html = listHtml();
        else if (state.route.view === 'form') html = formHtml();
        else if (state.route.view === 'card') html = cardHtml();
        else if (state.route.view === 'round') html = root.TnMgrRoundUI ? root.TnMgrRoundUI.roundHtml() : notReadyHtml();
        else if (state.route.view === 'player') html = root.TnMgrRoundUI ? root.TnMgrRoundUI.playerHtml() : notReadyHtml();
        else html = listHtml();
        host.innerHTML = modalWrap(html);
        if (focusKey) {
            var next = host.querySelector('[data-tnm-focus="' + focusKey + '"]');
            if (next) {
                try {
                    next.focus();
                    if (focusPos && next.setSelectionRange) next.setSelectionRange(focusPos[0], focusPos[1]);
                } catch (e) { /* silent */ }
            }
        }
        if (state.route.view === 'card' && state.route.tab === 'sheet' && root.TnMgrSheetUI) root.TnMgrSheetUI.mount();
        if (state.route.view === 'card' && state.route.tab === 'printcards' && root.TnMgrPrintCards) root.TnMgrPrintCards.mount();
        if (state.route.view === 'round' && root.TnMgrRoundUI) root.TnMgrRoundUI.mount();
        if (state.route.view === 'player' && root.TnMgrRoundUI) root.TnMgrRoundUI.mountPlayer();
    }

    function notReadyHtml() {
        return '<div class="tnm-card">' + esc(bi('Экран загружается…', 'Loading…')) + '</div>';
    }

    function modalWrap(html) {
        var overlay = modals.__current;
        if (!overlay) return html;
        return html + overlay;
    }

    function openModal(name, payload) {
        var handler = modals[name];
        if (!handler) return;
        modals.__payload = payload || {};
        modals.__current = handler(modals.__payload);
        render();
    }
    function closeModal() {
        modals.__current = null;
        render();
    }

    // ----------------------------------------------------------
    // ОБЩИЕ БЛОКИ РАЗМЕТКИ
    // ----------------------------------------------------------
    function btn(action, label, options) {
        var opts = options || {};
        var cls = 'tnm-btn' + (opts.variant ? ' tnm-btn-' + opts.variant : '') + (opts.small ? ' tnm-btn-sm' : '');
        var attrs = ' class="' + cls + '" data-tnm-act="' + esc(action) + '"' + (opts.disabled ? ' disabled' : '');
        Object.keys(opts.data || {}).forEach(function (key) {
            attrs += ' data-' + key + '="' + esc(opts.data[key]) + '"';
        });
        return '<button type="button"' + attrs + '>' + (opts.icon ? '<i class="' + esc(opts.icon) + '"></i> ' : '') + label + '</button>';
    }

    function backBtn(label) {
        return btn('back', label || bi('← Назад', '← Back'), { variant: 'ghost' });
    }

    function statusChip(item) {
        var status = String(item.status || 'draft');
        var map = {
            draft: { ru: 'Черновик', en: 'Draft', cls: 'tnm-chip-draft' },
            upcoming: { ru: 'Предстоящий', en: 'Upcoming', cls: 'tnm-chip-upcoming' },
            active: { ru: 'Идёт', en: 'Live', cls: 'tnm-chip-live' },
            completed: { ru: 'Завершён', en: 'Completed', cls: 'tnm-chip-done' }
        };
        // Пауза важнее статуса: турнир может быть «Идёт», но стоять на паузе.
        if (item && item.paused && status !== 'completed') {
            return '<span class="tnm-chip tnm-chip-paused"><i class="fas fa-pause"></i> ' +
                esc(bi('На паузе', 'Paused')) + '</span>';
        }
        var info = map[status] || map.draft;
        return '<span class="tnm-chip ' + info.cls + '">' + esc(bi(info.ru, info.en)) + '</span>';
    }

    function headHtml(title, subtitle, actionsHtml) {
        return '<div class="tnm-view-head"><div class="tnm-view-head-text"><h2>' + title + '</h2>' +
            (subtitle ? '<p class="tnm-sub">' + subtitle + '</p>' : '') + '</div>' +
            '<div class="tnm-view-head-actions">' + (actionsHtml || '') + '</div></div>';
    }

    function emptyHtml(message) {
        return '<div class="tnm-empty"><i class="fas fa-golf-ball-tee" aria-hidden="true"></i><p>' + esc(message) + '</p></div>';
    }

    // ----------------------------------------------------------
    // 1. СПИСОК ТУРНИРОВ
    // ----------------------------------------------------------
    function listHtml() {
        var list = tournamentsList();
        var rows = list.map(function (item) {
            var date = item.startDate || item.date || '';
            return '<tr class="tnm-row" data-tnm-act="open-tournament" data-id="' + esc(item.id) + '">' +
                '<td><div class="tnm-tour-name">' + esc(item.name || bi('Без названия', 'Untitled')) + '</div>' +
                '<div class="tnm-tour-meta">' + statusChip(item) +
                (item.formats && item.formats.length ? '<span class="tnm-muted">' + esc((item.formats || []).join(' · ')) + '</span>' : '') +
                '</div></td>' +
                '<td class="tnm-nowrap">' + esc(date ? core().dateRu(date) : '—') +
                '<button type="button" class="tnm-icon-btn" title="' + esc(bi('Удалить турнир', 'Delete tournament')) +
                '" data-tnm-act="delete-tournament" data-id="' + esc(item.id) + '"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
        }).join('');

        var body = list.length
            ? '<table class="tnm-table tnm-table-list"><thead><tr><th>' + esc(bi('Название', 'Name')) + '</th><th>' + esc(bi('Дата', 'Date')) + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
            : emptyHtml(bi('Пока нет турниров. Создайте первый — кнопкой выше.', 'No tournaments yet. Create the first one above.'));

        return '<div class="tnm-view">' +
            headHtml('<i class="fas fa-trophy"></i> ' + esc(bi('Турниры', 'Tournaments')),
                esc(bi('Создание и управление турнирами клуба: раунды, группы, участники, стартовый лист, счёт и результаты.',
                    'Create and manage club tournaments: rounds, groups, participants, tee sheet, scoring and results.')),
                btn('new-tournament', esc(bi('Создать турнир', 'Create tournament')), { variant: 'primary', icon: 'fas fa-plus' })) +
            body + '</div>';
    }

    // ----------------------------------------------------------
    // 2. ФОРМА СОЗДАНИЯ / РЕДАКТИРОВАНИЯ
    // ----------------------------------------------------------
    function emptyForm() {
        return { name: '', startDate: core().todayIso(), startTime: '09:00', formats: [], club: '', course: '', note: '' };
    }

    function prepareCreateForm() {
        if (state.form) return;
        state.form = emptyForm();
        state.editingTournament = false;
        data().loadDraft().then(function (draft) {
            if (draft && !state.editingTournament && state.form && !state.form.name) {
                var pending = Array.isArray(draft.pendingPlayers) ? draft.pendingPlayers : [];
                state.form = Object.assign(emptyForm(), draft);
                delete state.form.pendingPlayers;
                if (pending.length && !(state.pendingPlayers || []).length) state.pendingPlayers = pending;
                render();
            }
        });
    }

    function prepareEditForm() {
        var t = tournament();
        if (!t) return;
        state.editingTournament = true;
        state.form = {
            name: t.name || '',
            startDate: t.startDate || t.date || core().todayIso(),
            startTime: t.startTime || '09:00',
            formats: (t.formats || []).slice(),
            club: t.club || '',
            course: t.course || '',
            note: t.note || ''
        };
    }

    function formHtml() {
        if (state.editingTournament && !state.form) prepareEditForm();
        if (!state.form) state.form = emptyForm();
        var form = state.form;
        var selected = form.formats || [];
        var catalogList = core().formatCatalog(data().asMap((tournament() || {}).formatsDict), data().asMap(root.__tnmGlobalFormats));
        selected.forEach(function (name) {
            if (!catalogList.some(function (item) { return core().formatLabel(item) === name || item.id === core().formatId(name); })) {
                catalogList.push({ id: core().formatId(name), ru: name, en: name, custom: true });
            }
        });
        var chips = catalogList.map(function (item) {
            var label = core().formatLabel(item, lang());
            var active = selected.some(function (name) { return name === label || name === item.ru || name === item.en; });
            return '<button type="button" class="tnm-chip-toggle' + (active ? ' active' : '') + '" data-tnm-act="toggle-format" data-format="' + esc(item.ru || label) + '">' +
                '<i class="fas fa-' + (active ? 'check' : 'plus') + '"></i> ' + esc(label) + '</button>';
        }).join('');

        return '<div class="tnm-view">' +
            headHtml('<i class="fas fa-' + (state.editingTournament ? 'pen' : 'plus') + '"></i> ' +
                esc(state.editingTournament ? bi('Изменить турнир', 'Edit tournament') : bi('Новый турнир', 'New tournament')),
                esc(bi('Поля со звёздочкой обязательны. Черновик сохраняется автоматически.',
                    'Fields marked with * are required. The draft is saved automatically.')),
                backBtn()) +
            '<div class="tnm-card tnm-form">' +
            fieldHtml('name', bi('Название *', 'Name *'), '<input type="text" data-tnm-live="form-field" data-field="name" data-tnm-focus="name" value="' + esc(form.name) + '" placeholder="' + esc(bi('Кубок клуба', 'Club Cup')) + '">') +
            '<div class="tnm-grid-2">' +
            fieldHtml('startDate', bi('Дата начала *', 'Start date *'), '<input type="date" data-tnm-live="form-field" data-field="startDate" data-tnm-focus="startDate" value="' + esc(core().dateIso(form.startDate)) + '">') +
            fieldHtml('startTime', bi('Время старта *', 'Start time *'), '<input type="time" data-tnm-live="form-field" data-field="startTime" data-tnm-focus="startTime" value="' + esc(core().timeText(form.startTime, '09:00')) + '">') +
            '</div>' +
            fieldHtml('formats', bi('Формат (можно несколько) *', 'Format (multiple) *'),
                '<div class="tnm-chips">' + chips + '</div>' +
                '<div class="tnm-inline-add"><input type="text" id="tnm-new-format" placeholder="' + esc(bi('Добавить свой формат', 'Add custom format')) + '">' +
                btn('add-format', esc(bi('Добавить в справочник', 'Add to catalog')), { variant: 'ghost', small: true }) + '</div>') +
            '<details class="tnm-details"><summary>' + esc(bi('Дополнительно', 'More')) + '</summary>' +
            '<div class="tnm-grid-2">' +
            fieldHtml('club', bi('Клуб', 'Club'), '<input type="text" data-tnm-live="form-field" data-field="club" value="' + esc(form.club) + '" placeholder="' + esc(root.CLUB || '') + '">') +
            fieldHtml('course', bi('Поле', 'Course'), '<input type="text" data-tnm-live="form-field" data-field="course" value="' + esc(form.course) + '" placeholder="' + esc(bi('Пестово (18 лунок, пар 72)', 'Pestovo (18 holes, par 72)')) + '">') +
            '</div>' +
            fieldHtml('note', bi('Примечание', 'Note'), '<textarea rows="2" data-tnm-live="form-field" data-field="note">' + esc(form.note) + '</textarea>') +
            '</details>' +
            '<div class="tnm-form-actions">' +
            btn('save-tournament', esc(state.editingTournament ? bi('Сохранить', 'Save') : bi('Добавить', 'Add')), { variant: 'primary', icon: 'fas fa-check' }) +
            backBtn() +
            '</div></div>' +
            formParticipantsHtml() + '</div>';
    }

    /** Нормализованный снимок базы участников для поиска в форме турнира. */
    function formDirectoryPlayers() {
        if (Array.isArray(state.formDirectoryCache)) return state.formDirectoryCache;
        var source = typeof root.getKnownPlayersSync === 'function' ? root.getKnownPlayersSync() : {};
        state.formDirectoryCache = Object.keys(source || {}).map(function (uid) {
            var item = source[uid] || {};
            var name = core().trim(item.name || item.fio || [item.lastName, item.firstName, item.middleName].filter(Boolean).join(' '));
            if (!name) return null;
            var rawHcp = item.handicap != null ? item.handicap : item.hi;
            var hcp = rawHcp == null || rawHcp === '' ? null
                : (typeof root.parseExactHcp === 'function' ? root.parseExactHcp(rawHcp) : (String(rawHcp).charAt(0) === '+' ? -Math.abs(parseFloat(String(rawHcp).slice(1))) : parseFloat(rawHcp)));
            return {
                uid: String(item.uid || uid), id: String(item.uid || uid), fio: name, name: name,
                firstName: item.firstName || '', lastName: item.lastName || '', middleName: item.middleName || '',
                hi: isFinite(Number(hcp)) ? Number(hcp) : null, gender: item.gender || '',
                tee: item.defaultTee || item.tee || '', source: 'directory', club: item.club || ''
            };
        }).filter(Boolean);
        return state.formDirectoryCache;
    }

    function isFormDirectoryPlayerAdded(player) {
        var uid = String(player && player.uid || '');
        var key = core().playerKeyByFio(player);
        var pending = state.pendingPlayers || [];
        if (pending.some(function (item) {
            var existingUid = String(item && item.uid || '');
            if (uid && existingUid) return uid === existingUid;
            return key && key === core().playerKeyByFio(item);
        })) return true;
        if (state.editingTournament) {
            return playersOf(tournament()).some(function (item) { return uid && String(item.uid || '') === uid; });
        }
        return false;
    }

    function visibleFormDirectoryPlayers() {
        return core().searchPlayers(formDirectoryPlayers(), state.formDirectoryQuery || '', 20);
    }

    function formDirectorySelectedCount() {
        return Object.keys(state.formDirectorySelection || {}).filter(function (uid) {
            return !!state.formDirectorySelection[uid] && !isFormDirectoryPlayerAdded({ uid: uid });
        }).length;
    }

    function updateFormDirectorySelectionUi() {
        var count = formDirectorySelectedCount();
        var badge = el('tnm-form-directory-selected-count');
        var addButton = el('tnm-add-selected-directory');
        if (badge) badge.textContent = String(count);
        if (addButton) addButton.disabled = !count;
    }

    function formParticipantsHtml() {
        var list = state.pendingPlayers || [];
        var rows = list.map(function (player, index) {
            return '<tr><td>' + (index + 1) + '</td><td>' + esc(core().playerFio(player)) +
                (player.source === 'directory' ? ' <i class="fas fa-address-book tnm-dir-linked" title="' + esc(bi('База данных клуба', 'Club database')) + '"></i>' : '') + '</td>' +
                '<td>' + esc(core().fmtHcp(player.hi)) + '</td>' +
                '<td>' + esc(core().genderLabel(player.gender, lang())) + '</td>' +
                '<td class="tnm-nowrap"><button type="button" class="tnm-icon-btn" data-tnm-act="remove-pending-player" data-index="' + index +
                '" title="' + esc(bi('Убрать', 'Remove')) + '"><i class="fas fa-xmark"></i></button></td></tr>';
        }).join('');
        var hint = state.editingTournament
            ? bi('Выбранные участники добавятся в турнир при сохранении формы.', 'Selected participants are added to the tournament when you save the form.')
            : bi('Выбранные участники добавятся в турнир сразу после его создания.', 'Selected participants are added to the tournament right after it is created.');
        var directory = visibleFormDirectoryPlayers();
        var selectable = directory.filter(function (player) { return !isFormDirectoryPlayerAdded(player); });
        var dirRows = directory.map(function (player) {
            var added = isFormDirectoryPlayerAdded(player);
            var selected = !!(state.formDirectorySelection || {})[player.uid];
            return '<label class="tnm-dir-row tnm-form-dir-row' + (added ? ' is-added' : '') + '">' +
                '<input type="checkbox" data-tnm-edit="form-directory-player-select" data-uid="' + esc(player.uid) + '"' +
                (selected && !added ? ' checked' : '') + (added ? ' disabled' : '') + '>' +
                '<span><b>' + esc(core().playerFio(player)) + '</b>' +
                (player.hi != null ? ' <span class="tnm-muted">HI ' + esc(core().fmtHcp(player.hi)) + '</span>' : '') +
                (player.gender ? ' <span class="tnm-muted">' + esc(core().genderLabel(player.gender, lang())) + '</span>' : '') +
                (added ? ' <span class="tnm-chip tnm-chip-done">' + esc(bi('уже добавлен', 'already added')) + '</span>' : '') +
                '</span></label>';
        }).join('');
        var selectedCount = formDirectorySelectedCount();
        var directorySearch = '<div class="tnm-form-directory">' +
            '<div class="tnm-form-directory-head"><b><i class="fas fa-address-book"></i> ' + esc(bi('Выбрать из базы данных клуба', 'Select from the club database')) + '</b>' +
            '<span class="tnm-muted">' + esc(bi('Можно выбрать сразу несколько игроков', 'You can select multiple players at once')) + '</span></div>' +
            '<label class="tnm-form-directory-search"><i class="fas fa-search"></i><input type="search" data-tnm-live-edit="form-directory-search" data-tnm-focus="form-directory-search" autocomplete="off" value="' + esc(state.formDirectoryQuery || '') + '" placeholder="' + esc(bi('Поиск по имени или фамилии', 'Search by first or last name')) + '"></label>' +
            '<div class="tnm-dir-list tnm-form-directory-list">' + (dirRows || emptyHtml(bi('Совпадений нет — измените запрос или сначала добавьте игроков в базу клуба.', 'No matches — change the query or add players to the club database first.'))) + '</div>' +
            '<div class="tnm-form-directory-actions"><span class="tnm-muted">' + esc(bi('Выбрано: ', 'Selected: ')) + '<b id="tnm-form-directory-selected-count">' + selectedCount + '</b></span>' +
            btn('form-select-visible-directory', esc(bi('Выбрать видимых', 'Select visible')), { variant: 'ghost', small: true, disabled: !selectable.length }) +
            '<button type="button" id="tnm-add-selected-directory" class="tnm-btn tnm-btn-primary" data-tnm-act="form-add-selected-directory"' + (selectedCount ? '' : ' disabled') + '><i class="fas fa-user-plus"></i> ' + esc(bi('Добавить выбранных', 'Add selected')) + '</button></div>' +
            '</div>';
        return '<div class="tnm-card tnm-form">' +
            headHtml('<i class="fas fa-users"></i> ' + esc(bi('Участники турнира (Excel)', 'Tournament participants (Excel)')),
                esc(bi('Загрузите список из Excel или найдите участников в базе клуба по имени/фамилии. Можно выбрать нескольких сразу.',
                    'Upload an Excel list or search the club database by first/last name. Multiple players can be selected at once.')),
                btn('import-participants-excel', esc(bi('Импорт Excel', 'Import Excel')), { icon: 'fas fa-file-excel', variant: 'ghost' }) +
                (list.length ? ' ' + btn('clear-pending-players', esc(bi('Очистить', 'Clear')), { variant: 'ghost', small: true }) : '')) +
            '<input type="file" id="tnm-form-excel-input" accept=".xlsx,.xls,.ods,.csv,.tsv,.txt" class="tnm-hidden">' + directorySearch +
            (list.length
                ? '<p class="tnm-counters">' + esc(bi('Участников к добавлению: ', 'Participants to add: ')) + '<b>' + list.length + '</b></p>' +
                '<div class="tnm-table-scroll"><table class="tnm-table"><thead><tr><th>#</th><th>' + esc(bi('ФИО', 'Name')) +
                '</th><th>HI</th><th>' + esc(bi('Пол', 'Gender')) + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
                '<p class="tnm-sub"><i class="fas fa-circle-info"></i> ' + esc(hint) + '</p>'
                : emptyHtml(hint)) +
            '</div>';
    }

    /** Разбор файла для формы создания: участники кладутся в очередь. */
    function importFormExcelFile(file) {
        if (!file) return;
        io().readWorkbookFile(file).then(function (sheets) {
            var parsed = core().parseWorkbook(sheets);
            if (!parsed.players.length) {
                toastMsg(bi('В файле не найдено участников. Нужны колонки с именем и фамилией (ФИО, «Фамилия» + «Имя» или одна колонка с именем) — данные ищутся по всем листам, столбцам и ячейкам.',
                    'No participants found in the file. Columns with first and last name are required (Full name, Last name + First name, or a single name column) — all sheets, columns and cells are searched.'), 'error');
                return;
            }
            var added = mergePendingPlayers(parsed.players);
            toastMsg(bi('В файле найдено участников: ', 'Participants found in the file: ') + parsed.players.length +
                (added < parsed.players.length ? ' · ' + bi('новых: ', 'new: ') + added : ''));
            scheduleDraft();
            render();
        }).catch(function (err) {
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    /** Добавляет участников в очередь формы: uid различает однофамильцев. */
    function mergePendingPlayers(list) {
        var pending = state.pendingPlayers || [];
        var added = 0;
        (list || []).forEach(function (player) {
            var uid = String(player && player.uid || ''), nameKey = core().playerKeyByFio(player);
            if (!nameKey) return;
            var duplicate = pending.some(function (existing) {
                var existingUid = String(existing && existing.uid || '');
                if (uid && existingUid) return uid === existingUid;
                // Импорт без UID не должен продублировать уже выбранный профиль;
                // два конкретных UID с одинаковым ФИО остаются разными участниками.
                return nameKey === core().playerKeyByFio(existing);
            });
            if (duplicate) return;
            pending.push(player);
            added++;
        });
        state.pendingPlayers = pending;
        return added;
    }

    function addSelectedFormDirectoryPlayers() {
        var selected = state.formDirectorySelection || {}, byUid = {};
        formDirectoryPlayers().forEach(function (player) { byUid[player.uid] = player; });
        var chosen = Object.keys(selected).filter(function (uid) { return selected[uid] && byUid[uid] && !isFormDirectoryPlayerAdded(byUid[uid]); })
            .map(function (uid) { return byUid[uid]; });
        if (!chosen.length) { toastMsg(bi('Выберите участников из базы данных клуба', 'Select players from the club database'), 'warn'); return; }
        var added = mergePendingPlayers(chosen);
        state.formDirectorySelection = {};
        scheduleDraft();
        render();
        toastMsg(added
            ? bi('Добавлено из базы данных клуба: ', 'Added from club database: ') + added
            : bi('Выбранные участники уже добавлены', 'Selected players are already in the list'), added ? 'success' : 'info');
    }

    function toggleVisibleFormDirectoryPlayers() {
        var visible = visibleFormDirectoryPlayers().filter(function (player) { return !isFormDirectoryPlayerAdded(player); });
        if (!visible.length) return;
        var allSelected = visible.every(function (player) { return !!(state.formDirectorySelection || {})[player.uid]; });
        if (!state.formDirectorySelection) state.formDirectorySelection = {};
        visible.forEach(function (player) { state.formDirectorySelection[player.uid] = !allSelected; });
        render();
    }

    function fieldHtml(key, label, input) {
        return '<label class="tnm-field tnm-field-' + esc(key) + '"><span>' + esc(label) + '</span>' + input + '</label>';
    }

    function saveTournament() {
        var form = state.form || emptyForm();
        if (!core().trim(form.name)) { toastMsg(bi('Укажите название турнира', 'Enter the tournament name'), 'error'); return; }
        if (!core().dateIso(form.startDate)) { toastMsg(bi('Укажите дату начала', 'Enter the start date'), 'error'); return; }
        if (!core().timeText(form.startTime, '')) { toastMsg(bi('Укажите время старта', 'Enter the start time'), 'error'); return; }
        if (!(form.formats || []).length) { toastMsg(bi('Выберите хотя бы один формат', 'Select at least one format'), 'error'); return; }
        state.busy = true;
        if (state.editingTournament) {
            var tid = state.route.tid;
            data().updateTournament(tid, {
                name: form.name, startDate: form.startDate, startTime: form.startTime,
                formats: form.formats, club: form.club, course: form.course, note: form.note
            }).then(function () {
                state.busy = false;
                state.form = null;
                return addPendingPlayers(tid).then(function (created) {
                    toastMsg(created
                        ? bi('✅ Турнир сохранён · участников добавлено: ', '✅ Tournament saved · participants added: ') + created
                        : bi('✅ Турнир сохранён', '✅ Tournament saved'));
                    navigate({ view: 'card', tid: tid, tab: created ? 'participants' : 'rounds' });
                });
            }).catch(function (err) {
                state.busy = false;
                toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
            });
            return;
        }
        data().createTournament({
            name: form.name, startDate: form.startDate, startTime: form.startTime,
            formats: form.formats, club: form.club, course: form.course, note: form.note
        }).then(function (tid) {
            state.busy = false;
            state.form = null;
            // Черновик при создании — это уже реальный турнир (status: draft).
            data().updateTournament(tid, { status: 'upcoming' }).catch(function () { /* silent */ });
            return addPendingPlayers(tid, null).then(function (created) {
                toastMsg(created
                    ? bi('✅ Турнир создан · участников добавлено: ', '✅ Tournament created · participants added: ') + created
                    : bi('✅ Турнир создан', '✅ Tournament created'));
                navigate({ view: 'card', tid: tid, tab: created ? 'participants' : 'rounds' });
            });
        }).catch(function (err) {
            state.busy = false;
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    /**
     * Добавляет в турнир участников, разобранных из Excel в форме создания
     * (или правки). Очередь очищается — повторное сохранение не задвоит состав.
     */
    function addPendingPlayers(tid, target) {
        var pending = (state.pendingPlayers || []).slice();
        state.pendingPlayers = [];
        if (!pending.length) return Promise.resolve(0);
        var record = target !== undefined ? target : tournament();
        // Повторный импорт того же файла не должен задваивать состав.
        var existing = {};
        playersOf(record).forEach(function (player) { existing[core().playerKeyByFio(player)] = true; });
        var fresh = pending.filter(function (player) {
            var key = core().playerKeyByFio(player);
            if (!key || existing[key]) return false;
            existing[key] = true;
            return true;
        });
        if (!fresh.length) return Promise.resolve(0);
        return data().addPlayers(tid, fresh, record || null).then(function (created) {
            return (created || []).length;
        }).catch(function (err) {
            toastMsg('❌ ' + bi('Не удалось добавить участников: ', 'Failed to add participants: ') +
                (err && err.message ? err.message : err), 'error');
            return 0;
        });
    }

    function toggleFormat(name) {
        if (!state.form) state.form = emptyForm();
        var list = state.form.formats || [];
        var at = list.indexOf(name);
        if (at === -1) list.push(name); else list.splice(at, 1);
        state.form.formats = list;
        scheduleDraft();
        render();
    }

    var draftTimer = null;
    function scheduleDraft() {
        if (state.editingTournament) return;
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(function () {
            draftTimer = null;
            if (state.form) {
                data().saveDraft(Object.assign({}, state.form, {
                    updatedAt: Date.now(),
                    pendingPlayers: state.pendingPlayers || []
                }));
            }
        }, 700);
    }

    function addFormatFromInput() {
        var input = el('tnm-new-format');
        var value = input ? core().trim(input.value) : '';
        if (!value) { toastMsg(bi('Введите название формата', 'Enter the format name'), 'error'); return; }
        data().addFormat(state.route.tid || '', value).then(function () {
            if (!state.form) state.form = emptyForm();
            var list = state.form.formats || [];
            if (list.indexOf(value) === -1) list.push(value);
            state.form.formats = list;
            scheduleDraft();
            toastMsg(bi('Формат добавлен в справочник', 'Format added to the catalog'));
            render();
        });
    }

    // ----------------------------------------------------------
    // 3. КАРТОЧКА ТУРНИРА
    // ----------------------------------------------------------
    function cardHtml() {
        var t = tournament();
        if (!t) {
            return '<div class="tnm-view">' + headHtml('<i class="fas fa-trophy"></i> ' + esc(bi('Турнир', 'Tournament')), '', backBtn()) +
                emptyHtml(state.loading ? bi('Загрузка…', 'Loading…') : bi('Турнир не найден', 'Tournament not found')) + '</div>';
        }
        var startDate = t.startDate || t.date || '';
        var meta = [core().dateRu(startDate), core().timeText(t.startTime, '')].filter(Boolean).join(' · ');
        var tabs = [
            { key: 'rounds', ru: 'Раунды', en: 'Rounds', icon: 'fas fa-flag' },
            { key: 'groups', ru: 'Группы', en: 'Groups', icon: 'fas fa-layer-group' },
            { key: 'participants', ru: 'Участники', en: 'Participants', icon: 'fas fa-users' },
            { key: 'sheet', ru: 'Стартовый лист', en: 'Tee sheet', icon: 'fas fa-table-list' },
            { key: 'printcards', ru: '🎴 Счетные карточки', en: 'Score cards', icon: 'fas fa-id-card' }
        ].map(function (tab) {
            return '<button type="button" class="tnm-tab' + (state.route.tab === tab.key ? ' active' : '') +
                '" data-tnm-act="tab" data-tab="' + tab.key + '"><i class="' + tab.icon + '"></i> ' + esc(bi(tab.ru, tab.en)) + '</button>';
        }).join('');

        var body = '';
        if (state.route.tab === 'rounds') body = roundsTabHtml(t);
        else if (state.route.tab === 'groups') body = groupsTabHtml(t);
        else if (state.route.tab === 'participants') body = participantsTabHtml(t);
        else if (state.route.tab === 'printcards') body = root.TnMgrPrintCards ? root.TnMgrPrintCards.html() : notReadyHtml();
        else body = root.TnMgrSheetUI ? root.TnMgrSheetUI.html() : notReadyHtml();

        return '<div class="tnm-view">' +
            '<div class="tnm-card-head">' +
            backBtn() +
            '<div class="tnm-card-title"><h2>' + esc(t.name || bi('Без названия', 'Untitled')) + '</h2>' +
            '<p class="tnm-sub">' + esc(meta) + ' · ' + statusChip(t) +
            ((t.formats || []).length ? ' · ' + esc((t.formats || []).join(' · ')) : '') + '</p></div>' +
            '<div class="tnm-view-head-actions">' + tournamentActionsHtml(t) +
            btn('edit-tournament', esc(bi('Изменить', 'Edit')), { icon: 'fas fa-pen', variant: 'ghost' }) + '</div>' +
            '</div>' +
            '<div class="tnm-tabs">' + tabs + '</div>' +
            (t.paused && String(t.lifecycleStatus || t.status || '') !== 'completed' ? pauseBannerHtml(t) : '') +
            body + '</div>';
    }

    function tournamentActionsHtml(t) {
        var status = String(t.lifecycleStatus || t.status || 'draft').toLowerCase();
        var active = status === 'active';
        var completed = status === 'completed';
        var paused = !!t.paused && !completed;
        return btn('start-tournament', esc(bi('Старт', 'Start')), {
            icon: 'fas fa-play', variant: 'primary', disabled: active || completed || paused
        }) + ' ' + (paused
            ? btn('resume-tournament', esc(bi('Возобновить', 'Resume')), { icon: 'fas fa-play', variant: 'primary' })
            : btn('pause-tournament', esc(bi('Пауза', 'Pause')), {
                icon: 'fas fa-pause', variant: 'ghost', disabled: completed || !active
            })) + ' ' + btn('force-finish-tournament', esc(bi('Принудительный финиш', 'Force finish')), {
            icon: 'fas fa-flag-checkered', variant: 'danger', disabled: completed
        }) + ' ';
    }

    /** Причины паузы — те же, что у паузы отдельного раунда (js/i18n.js). */
    var PAUSE_REASONS = [
        { ru: '⛈ Гроза / непогода', en: '⛈ Thunderstorm / weather' },
        { ru: '🍽 Перерыв / обед', en: '🍽 Break / lunch' },
        { ru: '🚨 Остановка маршалом / судьёй', en: '🚨 Marshal / referee stop' },
        { ru: '🔍 Задержка на поле', en: '🔍 Course delay' },
        { ru: '⚙️ Техническая пауза', en: '⚙️ Technical pause' },
        { ru: '📝 Другая причина', en: '📝 Other reason' }
    ];

    function pauseBannerHtml(t) {
        var since = '';
        try {
            since = t.pausedAt ? new Date(Number(t.pausedAt)).toLocaleString(lang() === 'en' ? 'en-GB' : 'ru-RU') : '';
        } catch (e) { since = ''; }
        return '<div class="tnm-pause-banner">' +
            '<i class="fas fa-pause-circle"></i> ' +
            '<b>' + esc(bi('Турнир на паузе', 'Tournament is paused')) + '</b>' +
            (since ? '<span class="tnm-muted"> · ' + esc(bi('с ', 'since ') + since) + '</span>' : '') +
            (t.pauseReason ? '<span class="tnm-muted"> · ' + esc(t.pauseReason) + '</span>' : '') +
            '<span class="tnm-muted"> — ' + esc(bi('тайминги раундов заморожены, на страницах ввода счёта виден баннер паузы',
                'round timings are frozen, score entry pages show the pause banner')) + '</span>' +
            btn('resume-tournament', esc(bi('Возобновить', 'Resume')), { icon: 'fas fa-play', variant: 'primary', small: true }) +
            '</div>';
    }

    function startTournamentAction() {
        var item = tournament() || {};
        if (String(item.lifecycleStatus || item.status || '') === 'active') return;
        data().startTournament(state.route.tid).then(function () {
            toastMsg(bi('🏁 Турнир начат', '🏁 Tournament started'));
        }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
    }

    /**
     * Пауза турнира: та же механика, что у паузы раунда (поля paused/pausedAt/
     * pauseHistory), но сразу для всех раундов турнира. Тайминги темпа игры
     * замораживаются, страницы ввода счёта показывают баннер паузы.
     */
    function pauseTournamentAction() {
        var item = tournament() || {};
        if (item.paused) return;
        openModal('pause-tournament');
    }

    function confirmPauseTournamentAction() {
        var item = tournament() || {};
        var select = el('tnm-pause-reason');
        var note = el('tnm-pause-note');
        var reason = core().trim(note && note.value) || core().trim(select && select.value) || '';
        closeModal();
        data().pauseTournament(state.route.tid, reason, currentUserName()).then(function (res) {
            if (res && res.already) {
                toastMsg(bi('Турнир уже на паузе', 'The tournament is already paused'), 'warn');
                return;
            }
            toastMsg(bi('⏸ Турнир на паузе. Раундов остановлено: ', '⏸ Tournament paused. Rounds stopped: ') +
                ((res && res.paused) || 0) +
                ((res && res.skipped) ? ' · ' + bi('уже на ручной паузе: ', 'already paused manually: ') + res.skipped : ''));
            render();
        }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
    }

    function resumeTournamentAction() {
        var item = tournament() || {};
        if (!item.paused) return;
        data().resumeTournament(state.route.tid, currentUserName()).then(function (res) {
            toastMsg(bi('▶️ Турнир возобновлён. Раундов открыто: ', '▶️ Tournament resumed. Rounds reopened: ') +
                ((res && res.resumed) || 0));
            render();
        }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
    }

    /** Имя текущего пользователя — для подписи «кто поставил на паузу». */
    function currentUserName() {
        try {
            var user = root.currentUser || (root.auth && root.auth.currentUser) || null;
            if (user && (user.displayName || user.name)) return String(user.displayName || user.name);
            var uid = user && user.uid ? user.uid : '';
            var profile = uid && typeof root.getKnownPlayersSync === 'function' ? (root.getKnownPlayersSync() || {})[uid] : null;
            if (profile && profile.name) return String(profile.name);
            if (root.currentUserData && root.currentUserData.name) return String(root.currentUserData.name);
        } catch (e) { /* silent */ }
        return '';
    }

    function forceFinishTournamentAction() {
        var item = tournament() || {};
        if (String(item.lifecycleStatus || item.status || '') === 'completed') return;
        confirmAction({
            title: bi('Принудительный финиш турнира', 'Force-finish tournament'),
            message: bi('Завершить все открытые раунды турнира и перевести турнир в статус «Завершён»? Действие зафиксирует результаты текущих лунок участников.',
                'Close every open tournament round and mark the tournament completed? Results for players’ current holes will be retained.'),
            confirmText: bi('Завершить турнир', 'Finish tournament'),
            onConfirm: function () {
                data().forceFinishTournament(state.route.tid).then(function (closed) {
                    toastMsg(bi('🏁 Турнир завершён. Закрыто раундов: ', '🏁 Tournament finished. Rounds closed: ') + closed);
                }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
            }
        });
    }

    // ----------------------------------------------------------
    // 3.1 РАУНДЫ
    // ----------------------------------------------------------
    function roundsTabHtml(t) {
        var rounds = roundsOf(t);
        var rows = rounds.map(function (round) {
            // Клик по строке раунда открывает экран счёта (правка даты — отдельно).
            return '<tr class="tnm-row" data-tnm-act="open-round" data-rid="' + esc(round.id) + '">' +
                '<td><input type="date" class="tnm-input-date" data-tnm-edit="round-date" data-rid="' + esc(round.id) +
                '" data-tnm-focus="round-date-' + esc(round.id) + '" value="' + esc(core().dateIso(round.date)) + '"></td>' +
                '<td class="tnm-nowrap">' +
                btn('open-round', '<i class="fas fa-golf-ball-tee"></i> ' + esc(bi('Счёт', 'Score')), { small: true, data: { rid: round.id } }) + ' ' +
                btn('delete-round', esc(bi('Удалить', 'Delete')), { small: true, variant: 'danger', data: { rid: round.id } }) +
                '</td></tr>';
        }).join('');
        return '<div class="tnm-tab-body">' +
            headHtml('<i class="fas fa-flag"></i> ' + esc(bi('Раунды', 'Rounds')),
                esc(bi('Каждый раунд — игровой день турнира. Нажмите на раунд, чтобы открыть счёт.',
                    'Each round is a tournament day. Click a round to open scoring.')),
                btn('add-round', esc(bi('Добавить', 'Add')), { variant: 'primary', icon: 'fas fa-plus' })) +
            (rounds.length
                ? '<table class="tnm-table"><thead><tr><th>' + esc(bi('Дата проведения', 'Date')) + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
                : emptyHtml(bi('Раундов пока нет. Добавьте первый раунд.', 'No rounds yet. Add the first round.'))) +
            '</div>';
    }

    function addRound() {
        var t = tournament() || {};
        data().addRound(state.route.tid, {
            date: t.startDate || t.date || core().todayIso(),
            startTime: t.startTime || '09:00',
            club: t.club || '', course: t.course || ''
        }).then(function () {
            toastMsg(bi('Раунд добавлен', 'Round added'));
        }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
    }

    function deleteRound(rid) {
        var round = roundOf(rid);
        if (!round) return;
        var question = bi('Удалить раунд', 'Delete round') + ' ' + core().dateRu(round.date) + '? ' +
            bi('Счёт, результаты и стартовый лист раунда тоже будут удалены.', 'Scores, results and the tee sheet of this round will be deleted too.');
        confirmAction({
            title: bi('Удаление раунда', 'Delete round'),
            message: question,
            confirmText: bi('Удалить', 'Delete'),
            onConfirm: function () {
                data().deleteRound(state.route.tid, rid).then(function () {
                    toastMsg(bi('Раунд удалён', 'Round deleted'));
                }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
            }
        });
    }

    function onRoundDateChange(rid, value) {
        data().updateRound(state.route.tid, rid, { date: value }).catch(function (err) {
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    // ----------------------------------------------------------
    // 3.2 ГРУППЫ
    // ----------------------------------------------------------
    function groupsTabHtml(t) {
        if (state.groupForm) return groupFormHtml();
        var groups = groupsOf(t);
        var players = playersOf(t);
        var rows = groups.map(function (group) {
            var count = players.filter(function (player) { return player.groupId === group.id; }).length;
            return '<tr class="tnm-row" data-tnm-act="edit-group" data-gid="' + esc(group.id) + '">' +
                '<td><b>' + esc(group.name || bi('Группа', 'Group')) + '</b>' +
                (count ? ' <span class="tnm-muted">· ' + count + ' ' + esc(bi('уч.', 'pl.')) + '</span>' : '') + '</td>' +
                '<td class="tnm-nowrap">' + esc(core().groupRangeText(group)) + '</td>' +
                '<td class="tnm-muted">' + esc([core().teeName(group.tee, lang()), group.format].filter(Boolean).join(' · ')) + '</td>' +
                '<td class="tnm-nowrap"><button type="button" class="tnm-icon-btn" data-tnm-act="delete-group" data-gid="' + esc(group.id) +
                '" title="' + esc(bi('Удалить', 'Delete')) + '"><i class="fas fa-trash"></i></button></td></tr>';
        }).join('');
        return '<div class="tnm-tab-body">' +
            headHtml('<i class="fas fa-layer-group"></i> ' + esc(bi('Группы', 'Groups')),
                esc(bi('Группа задаёт название, диапазон гандикапа и (необязательно) ТИ и формат.',
                    'A group defines the name, handicap range and optionally the tee and format.')),
                btn('add-group', esc(bi('Добавить группу', 'Add group')), { variant: 'primary', icon: 'fas fa-plus' })) +
            '<div class="tnm-card tnm-auto-distribute"><div><b>' + esc(bi('Распределить по HCP', 'Distribute by handicap')) + '</b>' +
            '<p class="tnm-muted">' + esc(bi('Участники будут разбиты по гандикапу отдельно среди мужчин и женщин; существующие группы заменятся.',
                'Players are grouped by handicap separately for men and women; current groups will be replaced.')) + '</p></div>' +
            '<label>' + esc(bi('Групп каждого пола', 'Groups per gender')) + '<input type="number" min="1" max="10" data-tnm-live="group-distribution-count" value="' +
            esc(state.groupDistributionCount || 3) + '"></label>' +
            btn('distribute-groups', esc(bi('Распределить', 'Distribute')), { variant: 'primary', icon: 'fas fa-wand-magic-sparkles' }) + '</div>' +
            (groups.length
                ? '<table class="tnm-table"><thead><tr><th>' + esc(bi('Название', 'Name')) + '</th><th>HCP</th><th></th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
                : emptyHtml(bi('Групп пока нет.', 'No groups yet.'))) +
            '</div>';
    }

    function groupFormHtml() {
        var form = state.groupForm || core().newGroup({});
        var isNew = !form.id;
        return '<div class="tnm-tab-body">' +
            headHtml('<i class="fas fa-layer-group"></i> ' + esc(isNew ? bi('Новая группа', 'New group') : bi('Группа', 'Group')),
                esc(bi('Диапазон гандикапа — по игровому (CH) или точному (HI) гандикапу игрока.',
                    'The handicap range applies to the course (CH) or exact (HI) handicap.')),
                backBtn(bi('← Назад', '← Back'))) +
            '<div class="tnm-card tnm-form">' +
            fieldHtml('name', bi('Название *', 'Name *'), '<input type="text" data-tnm-live="group-field" data-field="name" data-tnm-focus="group-name" value="' + esc(form.name) + '">') +
            '<div class="tnm-grid-2">' +
            fieldHtml('hcpFrom', bi('Гандикап от', 'Handicap from'), '<input type="number" step="0.1" data-tnm-live="group-field" data-field="hcpFrom" value="' + esc(form.hcpFrom === '' ? '' : form.hcpFrom) + '">') +
            fieldHtml('hcpTo', bi('Гандикап до', 'Handicap to'), '<input type="number" step="0.1" data-tnm-live="group-field" data-field="hcpTo" value="' + esc(form.hcpTo === '' ? '' : form.hcpTo) + '">') +
            '</div>' +
            '<details class="tnm-details"><summary>' + esc(bi('Дополнительно', 'More')) + '</summary><div class="tnm-grid-2">' +
            fieldHtml('gender', bi('Пол', 'Gender'), '<select data-tnm-live="group-field" data-field="gender">' + genderOptionsHtml(form.gender || 'all', false) + '</select>') +
            fieldHtml('tee', bi('ТИ', 'Tee'), '<select data-tnm-live="group-field" data-field="tee">' + teeOptionsHtml(form.tee, true) + '</select>') +
            fieldHtml('format', bi('Формат', 'Format'), '<select data-tnm-live="group-field" data-field="format">' + groupFormatOptions(form.format) + '</select>') +
            '</div></details>' +
            '<div class="tnm-form-actions">' +
            btn('save-group', esc(isNew ? bi('Добавить', 'Add') : bi('Сохранить', 'Save')), { variant: 'primary', icon: 'fas fa-check' }) +
            btn('back-groups', esc(bi('← Назад', '← Back')), { variant: 'ghost' }) +
            '</div></div></div>';
    }

    function newGroupForm() {
        state.groupForm = { id: '', name: '', hcpFrom: '', hcpTo: '', gender: 'all', tee: '', format: '', members: {} };
        render();
    }

    function editGroupForm(gid) {
        var group = groupsOf().filter(function (item) { return item.id === gid; })[0];
        if (!group) return;
        state.groupForm = {
            id: group.id, name: group.name || '', hcpFrom: group.hcpFrom == null ? '' : group.hcpFrom,
            hcpTo: group.hcpTo == null ? '' : group.hcpTo, gender: group.gender || 'all',
            tee: group.tee || '', format: group.format || '', members: group.members || {}
        };
        render();
    }

    function saveGroup() {
        var form = state.groupForm || {};
        if (!core().trim(form.name)) { toastMsg(bi('Укажите название группы', 'Enter the group name'), 'error'); return; }
        var payload = {
            name: form.name, hcpFrom: form.hcpFrom, hcpTo: form.hcpTo,
            gender: form.gender || 'all', tee: form.tee || '', format: form.format || ''
        };
        var promise = form.id
            ? data().updateGroup(state.route.tid, form.id, Object.assign({}, groupsOf().filter(function (g) { return g.id === form.id; })[0] || {}, payload))
            : data().addGroup(state.route.tid, payload);
        promise.then(function () {
            state.groupForm = null;
            toastMsg(bi('✅ Группа сохранена', '✅ Group saved'));
            render();
        }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
    }

    function deleteGroup(gid) {
        var group = groupsOf().filter(function (item) { return item.id === gid; })[0];
        if (!group) return;
        var confirmText = bi('Удалить группу', 'Delete group') + ' «' + (group.name || '') + '»?';
        var run = function () {
            data().deleteGroup(state.route.tid, gid, tournament()).then(function () {
                toastMsg(bi('Группа удалена', 'Group deleted'));
            }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
        };
        confirmAction({ title: bi('Удаление группы', 'Delete group'), message: confirmText, onConfirm: run });
    }

    function distributeGroups() {
        var count = Math.max(1, Math.min(10, core().intOf(state.groupDistributionCount, 3) || 3));
        var playerCount = playersOf().length;
        if (!playerCount) { toastMsg(bi('Сначала добавьте участников', 'Add participants first'), 'warn'); return; }
        confirmAction({
            title: bi('Распределить участников по HCP?', 'Distribute players by handicap?'),
            message: bi('Будут созданы до ' + count + ' групп отдельно для мужчин и женщин. Существующие группы и назначения участников заменятся.',
                'Up to ' + count + ' groups will be created separately for men and women. Existing groups and assignments will be replaced.'),
            confirmText: bi('Распределить', 'Distribute'),
            onConfirm: function () {
                data().distributeTournamentPlayers(state.route.tid, count, tournament()).then(function (groups) {
                    var total = groups.reduce(function (sum, group) { return sum + (group.playerCount || 0); }, 0);
                    toastMsg(bi('Создано групп: ', 'Groups created: ') + groups.length + ' · ' + bi('участников распределено: ', 'players assigned: ') + total);
                }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
            }
        });
    }

    // ----------------------------------------------------------
    // 3.3 УЧАСТНИКИ
    // ----------------------------------------------------------
    function participantsTabHtml(t) {
        var players = playersOf(t);
        var counts = core().participantsCounts(players);
        var groups = groupsOf(t);
        var tableQuery = core().trim(state.participantTableQuery);
        var visiblePlayers = core().searchPlayers(players, tableQuery);
        var rows = visiblePlayers.map(function (player) {
            return '<tr>' +
                '<td><input type="checkbox" aria-label="' + esc(bi('Выбрать ', 'Select ') + core().playerFio(player)) + '" data-tnm-edit="participant-select" data-pid="' + esc(player.id) + '"' + (state.selectedParticipantIds[player.id] ? ' checked' : '') + '></td>' +
                '<td><div class="tnm-player-name" data-tnm-act="open-player-in-round" data-pid="' + esc(player.id) + '">' + esc(core().playerFio(player)) +
                (core().trim(player.uid)
                    ? ' <i class="fas fa-address-book tnm-dir-linked" title="' +
                      esc(bi('Есть в базе данных клуба — гандикап синхронизируется с админ-панелью',
                          'In the club database — the handicap syncs with the admin panel')) + '"></i>'
                    : '') + '</div>' +
                '<span class="tnm-muted">' + esc(core().sourceLabel(player.source, lang())) + (player.club ? ' · ' + esc(player.club) : '') + '</span></td>' +
                '<td><input type="number" step="0.1" class="tnm-input-num" data-tnm-edit="player-hi" data-pid="' + esc(player.id) + '" value="' + esc(player.hi == null ? '' : player.hi) + '"></td>' +
                '<td><input type="number" class="tnm-input-num" data-tnm-edit="player-ch" data-pid="' + esc(player.id) + '" value="' + esc(player.ch == null ? '' : player.ch) + '"></td>' +
                '<td><select data-tnm-edit="player-gender" data-pid="' + esc(player.id) + '">' + genderOptionsHtml(player.gender, true) + '</select></td>' +
                '<td><select data-tnm-edit="player-tee" data-pid="' + esc(player.id) + '">' + teeOptionsHtml(player.tee, true) + '</select></td>' +
                '<td><select data-tnm-edit="player-group" data-pid="' + esc(player.id) + '"><option value="">' + esc(bi('— без группы —', '— no group —')) + '</option>' +
                groups.map(function (g) {
                    return '<option value="' + esc(g.id) + '"' + (g.id === player.groupId ? ' selected' : '') + '>' + esc(g.name) + '</option>';
                }).join('') + '</select></td>' +
                '<td class="tnm-nowrap">' +
                btn('edit-participant', '<i class="fas fa-user-pen"></i>', { small: true, data: { pid: player.id } }) + ' ' +
                btn('open-player-card', '<i class="fas fa-id-card"></i>', { small: true, data: { pid: player.id } }) + ' ' +
                btn('remove-participant', '<i class="fas fa-trash"></i>', { small: true, variant: 'danger', data: { pid: player.id } }) +
                '</td></tr>';
        }).join('');

        var suggestions = state.suggestions.map(function (item) {
            return '<button type="button" class="tnm-suggestion" data-tnm-act="add-suggestion" data-uid="' + esc(item.uid || '') +
                '" data-name="' + esc(item.name || '') + '" data-hi="' + esc(item.handicap == null ? '' : item.handicap) +
                '" data-gender="' + esc(item.gender || '') + '" data-tee="' + esc(item.defaultTee || '') + '">' +
                '<span><b>' + esc(item.name) + '</b>' + (item.handicap != null ? ' <span class="tnm-muted">HI ' + esc(core().fmtHcp(item.handicap)) + '</span>' : '') +
                (item.isGuest ? ' <span class="tnm-chip tnm-chip-draft">' + esc(bi('гость', 'guest')) + '</span>' : '') + '</span>' +
                '<i class="fas fa-plus"></i></button>';
        }).join('');

        var manualAdd = '';
        var query = core().trim(state.participantQuery);
        if (query && !state.suggestions.some(function (item) { return core().normText(item.name) === core().normText(query); })) {
            manualAdd = '<button type="button" class="tnm-suggestion tnm-suggestion-manual" data-tnm-act="add-manual" data-name="' + esc(query) + '">' +
                '<span><i class="fas fa-user-plus"></i> ' + esc(bi('Добавить вручную:', 'Add manually:')) + ' <b>' + esc(query) + '</b></span></button>';
        }

        var selectedCount = Object.keys(state.selectedParticipantIds || {}).filter(function (pid) { return state.selectedParticipantIds[pid] && !!playerOf(pid); }).length;
        var syncStatus = state.rusgolfSync && state.rusgolfSync.status
            ? '<span class="tnm-muted tnm-rusgolf-status" role="status" aria-live="polite">' + esc(state.rusgolfSync.status) + '</span>' : '';
        return '<div class="tnm-tab-body">' +
            headHtml('<i class="fas fa-users"></i> ' + esc(bi('Гольфисты', 'Golfers')),
                esc(bi('Поиск по фамилии на русском или английском языке, импорт из Excel и добавление из базы данных клуба.',
                    'Search by surname in Russian or English, import from Excel or add from the club database.')),
                btn('export-participants', esc(bi('Экспорт', 'Export')), { icon: 'fas fa-file-pdf' }) + ' ' +
                btn('import-excel', esc(bi('Импорт Excel', 'Import Excel')), { icon: 'fas fa-file-excel', variant: 'ghost' }) + ' ' +
                btn('paste-table', esc(bi('Вставить таблицу', 'Paste table')), { icon: 'fas fa-table', variant: 'ghost' }) + ' ' +
                btn('open-directory', esc(bi('Из базы данных клуба', 'From club database')), { icon: 'fas fa-address-book', variant: 'ghost' }) + ' ' +
                btn('directory-sync', esc(bi('Гости и гандикапы', 'Guests & handicaps')), { icon: 'fas fa-user-plus', variant: 'ghost' })) +
            '<div class="tnm-search-wrap">' +
            '<i class="fas fa-search"></i>' +
            '<input type="text" id="tnm-participant-search" data-tnm-live="participant-search" data-tnm-focus="participant-search" autocomplete="off" ' +
            'value="' + esc(state.participantQuery) + '" placeholder="' + esc(bi('Добавить по имени или фамилии', 'Add by first or last name')) + '">' +
            ((suggestions || manualAdd) ? '<div class="tnm-suggestions">' + suggestions + manualAdd + '</div>' : '') +
            '</div>' +
            '<p class="tnm-counters">' + esc(bi('Всего участников — ', 'Total participants — ')) + '<b>' + counts.total + '</b>, ' +
            esc(bi('мужчин — ', 'men — ')) + '<b>' + counts.men + '</b>, ' + esc(bi('женщин — ', 'women — ')) + '<b>' + counts.women + '</b></p>' +
            '<div class="tnm-participant-tools">' +
            '<label class="tnm-participant-filter"><i class="fas fa-filter"></i><input type="search" data-tnm-live="participant-table-search" data-tnm-focus="participant-table-search" autocomplete="off" value="' + esc(state.participantTableQuery) + '" placeholder="' + esc(bi('Найти участника по имени или фамилии', 'Filter by first or last name')) + '"></label>' +
            btn('select-visible-participants', esc(bi('Выбрать в списке', 'Select visible')), { variant: 'ghost', small: true }) +
            btn('remove-selected-participants', esc(bi('Удалить выбранных', 'Delete selected') + (selectedCount ? ' (' + selectedCount + ')' : '')), { icon: 'fas fa-user-minus', variant: 'danger', small: true, disabled: !selectedCount }) +
            btn('remove-all-participants', esc(bi('Удалить всех', 'Delete all') + (players.length ? ' (' + players.length + ')' : '')), { icon: 'fas fa-users-slash', variant: 'danger', small: true, disabled: !players.length }) +
            btn('rusgolf-sync-selected', esc(bi('Rusgolf · выбранных', 'Rusgolf · selected')), { icon: 'fas fa-rotate', variant: 'ghost', small: true, disabled: !selectedCount || state.rusgolfSync.running }) +
            btn('rusgolf-sync-all', esc(bi('Rusgolf · всех', 'Rusgolf · all')), { icon: 'fas fa-users-rotate', variant: 'ghost', small: true, disabled: !players.length || state.rusgolfSync.running }) +
            syncStatus + '</div>' +
            (players.length
                ? '<div class="tnm-table-scroll"><table class="tnm-table"><thead><tr>' +
                '<th></th><th>' + esc(bi('ФИО', 'Name')) + '</th><th>HI</th><th>CH</th><th>' + esc(bi('Пол', 'Gender')) + '</th>' +
                '<th>' + esc(bi('ТИ', 'Tee')) + '</th><th>' + esc(bi('Группа', 'Group')) + '</th><th></th>' +
                '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="tnm-muted">' + esc(bi('Совпадений нет', 'No matches')) + '</td></tr>') + '</tbody></table></div>'
                : emptyHtml(bi('Участников пока нет. Добавьте их поиском, импортом или из базы данных клуба.',
                    'No participants yet. Add them via search, import or the club database.'))) +
            '<input type="file" id="tnm-excel-input" accept=".xlsx,.xls,.ods,.csv,.tsv,.txt" class="tnm-hidden">' +
            '</div>';
    }

    function updateSuggestions(query) {
        state.participantQuery = query;
        state.suggestions = [];
        if (core().trim(query)) {
            var added = {};
            playersOf().forEach(function (player) {
                added[core().playerKeyByFio(player)] = true;
                if (player.uid) added['uid:' + player.uid] = true;
            });
            var directory = typeof root.getKnownPlayersSync === 'function' ? root.getKnownPlayersSync() : {};
            var list = Object.keys(directory || {}).map(function (uid) {
                var item = directory[uid] || {};
                return {
                    uid: uid,
                    name: core().trim(item.name) || core().trim([item.lastName, item.firstName, item.middleName].filter(Boolean).join(' ')),
                    handicap: item.handicap,
                    gender: core().normalizeGender(item.gender),
                    defaultTee: item.defaultTee,
                    isGuest: !!item.isGuest || String(uid).indexOf('guest_') === 0
                };
            }).filter(function (item) { return item.name; });
            state.suggestions = core().searchPlayers(list, query, 8).filter(function (item) {
                if (added['uid:' + item.uid]) return false;
                if (added[core().playerKeyByFio(item)]) return false;
                return true;
            });
        }
        scheduleRender();
    }

    function addSuggestion(button) {
        var payload = {
            uid: button.getAttribute('data-uid') || '',
            fio: button.getAttribute('data-name') || '',
            hi: button.getAttribute('data-hi') === '' ? null : button.getAttribute('data-hi'),
            gender: core().normalizeGender(button.getAttribute('data-gender')) || 'men',
            tee: button.getAttribute('data-tee') || '',
            source: button.getAttribute('data-uid') ? 'directory' : 'manual'
        };
        addParticipants([payload], false);
    }

    function addManual(query) {
        addParticipants([{ fio: query, source: 'manual', gender: '' }], false);
    }

    /** Добавляет участников, подставляя группу по диапазону гандикапа. */
    function addParticipants(list, silent) {
        var t = tournament() || {};
        var existing = {};
        playersOf(t).forEach(function (player) {
            existing[core().playerKeyByFio(player)] = true;
            if (player.uid) existing['uid:' + player.uid] = true;
        });
        var skipped = 0;
        var prepared = (list || []).filter(function (item) { return item && core().trim(item.fio || item.name); }).filter(function (item) {
            var key = core().playerKeyByFio(item);
            if (existing[key] || (item.uid && existing['uid:' + item.uid])) { skipped++; return false; }
            existing[key] = true;
            return true;
        }).map(function (item) {
            if (!item.fio && item.name) item.fio = item.name;
            // Группа из файла («Группа A») важнее диапазона гандикапа — но
            // только если такая группа уже есть в турнире.
            var group = item.groupName ? groupsOf(t).filter(function (g) {
                return core().normText(g.name) === core().normText(item.groupName);
            })[0] : null;
            if (!group) group = data().groupForPlayer(t, item);
            if (group) item.groupId = group.id;
            if (!item.hi && item.hi !== 0 && item.handicap != null) item.hi = item.handicap;
            var tee = item.tee || (core().normalizeGender(item.gender) === 'women' ? 'rd' : 'wh');
            return Object.assign({}, item, { tee: tee, ch: item.ch != null ? item.ch : computeCh(item, tee) });
        });
        if (!prepared.length) {
            if (skipped && !silent) toastMsg(bi('Эти участники уже есть в турнире', 'These participants are already in the tournament'), 'warn');
            return Promise.resolve([]);
        }
        return data().addPlayers(state.route.tid, prepared, t).then(function (created) {
            state.participantQuery = '';
            state.suggestions = [];
            if (!silent) {
                toastMsg(bi('Добавлено участников: ', 'Participants added: ') + created.length +
                    (skipped ? ' · ' + bi('уже были в турнире: ', 'already in the tournament: ') + skipped : ''));
            }
            render();
            // Сразу регистрируем новичков в базе данных клуба (гостями), чтобы
            // в следующий раз их можно было выбрать из списка, а гандикап —
            // синхронизировать в админ-панели. Ищем исходную строку по ФИО:
            // addPlayers мог пропустить часть списка, индексы тогда разъезжаются.
            var byFio = {};
            prepared.forEach(function (item) {
                byFio[core().normText(item.fio || item.name || '')] = item;
            });
            var added = created.map(function (item) {
                var source = byFio[core().normText(item.fio || '')] || {};
                return Object.assign({}, source, { id: item.id, fio: item.fio, hi: item.hi });
            });
            registerParticipantsInDirectory(added, 'fill', silent);
        }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
    }

    /**
     * Регистрация участников в справочнике сайта (users / usersPublic).
     * mode: 'fill' — гандикап пишем только если у записи своего нет,
     *       'push' — гандикап турнира перезаписывает профиль.
     */
    function registerParticipantsInDirectory(players, mode, silent) {
        var list = (players || []).filter(function (player) { return player && (player.fio || player.name); });
        if (!list.length) {
            if (!silent) toastMsg(bi('Нет участников для регистрации', 'No participants to register'), 'warn');
            return Promise.resolve(null);
        }
        if (state.busy) return Promise.resolve(null);
        state.busy = true;
        var action = mode === 'push' ? data().pushHandicapsToDirectory(state.route.tid, list)
            : data().syncPlayersToDirectory(state.route.tid, list, { handicaps: mode || 'fill' });
        return action.then(function (res) {
            state.busy = false;
            if (res && res.error) {
                toastMsg('❌ ' + res.error, 'error');
                return res;
            }
            if (!silent) {
                toastMsg(mode === 'push'
                    ? bi('🔄 Гандикапы отправлены на сайт. Обновлено записей: ', '🔄 Handicaps pushed to the site. Records updated: ') + ((res && res.updated) || 0)
                    : bi('👤 В базе данных клуба: новых гостей — ', '👤 Club database: new guests — ') + ((res && res.added) || 0) +
                      ', обновлено — ' + ((res && res.updated) || 0));
            }
            render();
            return res;
        }).catch(function (err) {
            state.busy = false;
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
            return null;
        });
    }

    function tournamentRusgolfMatch(player, remote) {
        var fio = core().playerFio(player);
        var parts = core().splitFio(fio);
        var first = player.firstName || parts.firstName || '';
        var last = player.lastName || parts.lastName || '';
        if (typeof root.rgNamesMatch === 'function') {
            try { return root.rgNamesMatch(first, last, remote.firstName, remote.lastName, fio, remote.fio); }
            catch (e) { console.warn('[rusgolf name match]', e); }
        }
        return core().playerMatches({ fio: remote.fio, firstName: remote.firstName, lastName: remote.lastName }, fio) ? 'strong' : null;
    }

    function tournamentRusgolfQueries(player) {
        var fio = core().trim(core().playerFio(player));
        var parts = core().splitFio(fio);
        var last = core().trim(player.lastName || parts.lastName);
        var queries = [];
        if (fio) queries.push(fio);
        if (last && core().normText(last) !== core().normText(fio)) queries.push(last);
        return queries;
    }

    function findTournamentRusgolfMatch(player) {
        if (!root.PestovoRusgolf || typeof root.PestovoRusgolf.fetchViaProxy !== 'function') {
            return Promise.reject(new Error(bi('Общий клиент поиска Rusgolf не загружен', 'Shared Rusgolf search client is not loaded')));
        }
        var queries = tournamentRusgolfQueries(player);
        if (!queries.length) return Promise.resolve({ match: null, ambiguous: false });
        var ambiguous = false;
        return queries.reduce(function (chain, query) {
            return chain.then(function (found) {
                if (found && (found.match || found.ambiguous)) return found;
                return root.PestovoRusgolf.fetchViaProxy(query).then(function (result) {
                    var rows = (result && result.rows) || [];
                    var strong = rows.filter(function (remote) {
                        return remote && remote.hcp != null && tournamentRusgolfMatch(player, remote) === 'strong';
                    });
                    if (strong.length === 1) return { match: strong[0], ambiguous: false };
                    if (strong.length > 1) { ambiguous = true; return { match: null, ambiguous: true }; }
                    return { match: null, ambiguous: false };
                });
            });
        }, Promise.resolve({ match: null, ambiguous: false })).then(function (result) {
            return result || { match: null, ambiguous: ambiguous };
        });
    }

    function syncTournamentHandicapsWithRusgolf(allPlayers) {
        var candidates = playersOf();
        var selected = allPlayers ? candidates : candidates.filter(function (player) { return !!state.selectedParticipantIds[player.id]; });
        if (!selected.length) {
            toastMsg(allPlayers ? bi('В турнире нет участников', 'The tournament has no participants') : bi('Сначала выберите участников', 'Select participants first'), 'warn');
            return;
        }
        if (state.rusgolfSync.running) return;
        if (allPlayers) {
            confirmAction({
                title: bi('Синхронизация всех участников с Rusgolf', 'Sync all participants with Rusgolf'),
                message: bi('Будет выполнен поиск по ФИО. Обновятся только однозначные точные совпадения с актуальным гандикапом; неоднозначные записи останутся без изменений.',
                    'Names will be searched. Only unambiguous exact matches with a current handicap will be updated; ambiguous records will be left unchanged.'),
                confirmText: bi('Синхронизировать всех', 'Sync everyone'),
                danger: false,
                onConfirm: function () { runTournamentRusgolfSync(selected); }
            });
            return;
        }
        runTournamentRusgolfSync(selected);
    }

    function runTournamentRusgolfSync(players) {
        var stats = { updated: 0, unchanged: 0, missing: 0, ambiguous: 0, errors: 0 };
        var list = (players || []).slice();
        var tid = state.route.tid;
        var tournamentData = tournament();
        if (!root.PestovoRusgolf || typeof root.PestovoRusgolf.fetchViaProxy !== 'function') {
            toastMsg(bi('Общий клиент Rusgolf не загружен. Перезагрузите админ-панель.', 'Rusgolf client is not loaded. Reload the admin panel.'), 'error');
            return;
        }
        state.rusgolfSync.running = true;
        state.rusgolfSync.status = bi('Подключаемся к Rusgolf…', 'Connecting to Rusgolf…');
        render();
        var wait = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };
        list.reduce(function (chain, player, index) {
            return chain.then(function () {
                state.rusgolfSync.status = bi('Rusgolf · участник ', 'Rusgolf · player ') + (index + 1) + '/' + list.length + ' · ' + core().playerFio(player);
                render();
                return findTournamentRusgolfMatch(player).then(function (found) {
                    if (found.ambiguous) { stats.ambiguous++; return; }
                    if (!found.match) { stats.missing++; return; }
                    var official = found.match;
                    var value = Number(official.hcp);
                    if (!isFinite(value)) { stats.missing++; return; }
                    if (player.hi != null && Math.abs(Number(player.hi) - value) < 0.05) { stats.unchanged++; return; }
                    var persistOfficial = Promise.resolve();
                    if (player.uid && typeof root.rgPropagateHcpEverywhere === 'function') {
                        var directory = typeof root.getKnownPlayersSync === 'function' ? (root.getKnownPlayersSync() || {}) : {};
                        var profile = directory[player.uid] || { name: core().playerFio(player), handicap: player.hi, gender: player.gender };
                        persistOfficial = Promise.resolve(root.rgPropagateHcpEverywhere(player.uid, official, profile)).catch(function (error) {
                            console.warn('[tournament rusgolf profile sync]', error);
                        });
                    }
                    return persistOfficial.then(function () {
                        return data().updatePlayer(tid, player.id, {
                            hi: value,
                            ch: computeCh({ hi: value, gender: player.gender || official.gender }, player.tee || 'wh')
                        }, tournamentData);
                    }).then(function () { stats.updated++; }).catch(function (error) {
                        stats.errors++;
                        console.warn('[tournament rusgolf update]', player.id, error);
                    });
                }).catch(function (error) {
                    stats.errors++;
                    console.warn('[tournament rusgolf search]', player.id, error);
                }).then(function () { return wait(250); });
            });
        }, Promise.resolve()).then(function () {
            state.rusgolfSync.running = false;
            state.rusgolfSync.status = '';
            state.selectedParticipantIds = {};
            render();
            toastMsg(bi('Rusgolf: обновлено ', 'Rusgolf: updated ') + stats.updated +
                bi(', без изменений ', ', unchanged ') + stats.unchanged +
                bi(', не найдено ', ', not found ') + stats.missing +
                bi(', неоднозначных ', ', ambiguous ') + stats.ambiguous +
                bi(', ошибок ', ', errors ') + stats.errors,
                stats.errors ? 'warn' : 'success');
        });
    }

    /** Гандикапы из справочника сайта (админка/АГР) — в состав турнира. */
    function pullDirectoryHandicaps() {
        var list = playersOf();
        if (!list.length) { toastMsg(bi('В турнире нет участников', 'The tournament has no participants'), 'warn'); return; }
        if (state.busy) return;
        state.busy = true;
        data().pullHandicapsFromDirectory(state.route.tid, list, tournament()).then(function (res) {
            state.busy = false;
            if (res && res.error) { toastMsg('❌ ' + res.error, 'error'); return; }
            toastMsg(bi('🔄 Гандикапы сайта перенесены в турнир. Обновлено участников: ',
                '🔄 Site handicaps pulled into the tournament. Participants updated: ') + ((res && res.updated) || 0) +
                ((res && res.missing) ? ' · ' + bi('нет в базе данных клуба: ', 'missing from the club database: ') + res.missing : ''));
            render();
        }).catch(function (err) {
            state.busy = false;
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    function computeCh(player, tee) {
        var ratings = root.COURSE_RATINGS || {};
        var gender = core().normalizeGender(player.gender) || 'men';
        var table = ratings[gender] || {};
        var rating = table[tee] || null;
        if (!rating && gender === 'women') rating = (ratings.women || {}).rd || null;
        if (typeof root.getFieldHcp === 'function' && player.hi != null) {
            try { return root.getFieldHcp(player.hi, tee || 'wh', gender); } catch (e) { /* fallback */ }
        }
        return core().courseHandicap(player.hi, rating, root.TOTAL_PAR || 72);
    }

    function removeParticipant(pid) {
        var player = playerOf(pid);
        if (!player) return;
        var run = function () {
            data().removePlayer(state.route.tid, pid, tournament()).then(function () {
                toastMsg(bi('Участник удалён', 'Participant removed'));
            }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
        };
        var question = bi('Удалить участника', 'Remove participant') + ' «' + core().playerFio(player) + '»?';
        confirmAction({ title: bi('Удаление участника', 'Remove participant'), message: question, onConfirm: run });
    }

    /**
     * «Удалить всех» / «Удалить выбранных» в списке участников.
     * Удаляются состав турнира, отметки в группах, строки стартовых листов
     * и счёт — одним запросом (TnMgrData.removePlayers).
     */
    function removeParticipants(ids) {
        var list = (ids || []).filter(function (pid) { return !!playerOf(pid); });
        if (!list.length) { toastMsg(bi('Нечего удалять', 'Nothing to delete'), 'warn'); return; }
        var names = list.slice(0, 3).map(function (pid) { return core().playerFio(playerOf(pid)); });
        var rest = list.length - names.length;
        confirmAction({
            title: bi('Удаление участников', 'Delete participants'),
            message: bi('Удалить участников: ', 'Delete participants: ') + names.join(', ') +
                (rest > 0 ? ' ' + bi('и ещё ', 'and ') + rest : '') + '? ' +
                bi('Будут убраны из групп, стартовых листов и счёта.',
                    'They will be removed from groups, tee sheets and scores.'),
            onConfirm: function () {
                return data().removePlayers(state.route.tid, list, tournament()).then(function () {
                    state.selectedParticipantIds = {};
                    toastMsg(bi('Удалено участников: ', 'Participants deleted: ') + list.length);
                    render();
                }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
            }
        });
    }

    function exportParticipantsPdf() {
        var t = tournament() || {};
        var players = playersOf(t).map(function (player) {
            var group = groupsOf(t).filter(function (g) { return g.id === player.groupId; })[0];
            return Object.assign({}, player, { groupName: group ? group.name : '' });
        });
        var html = core().participantsHtml({
            title: bi('Гольфисты', 'Golfers'),
            meta: [t.name || '', core().dateRu(t.startDate || t.date || '')].filter(Boolean),
            players: players,
            lang: lang()
        });
        io().printHtml(html);
    }

    function importExcelFile(file) {
        if (!file) return;
        io().readWorkbookFile(file).then(function (sheets) {
            var parsed = core().parseWorkbook(sheets);
            if (!parsed.players.length) {
                toastMsg(bi('В файле не найдено участников. Нужны колонки с именем и фамилией (ФИО, «Фамилия» + «Имя» или одна колонка с именем) — данные ищутся по всем листам, столбцам и ячейкам.',
                    'No participants found in the file. Columns with first and last name are required (Full name, Last name + First name, or a single name column) — all sheets, columns and cells are searched.'), 'error');
                return;
            }
            openModal('import-preview', { parsed: parsed, sheets: sheets });
        }).catch(function (err) {
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    function downloadImportTemplate() {
        // Гандикап во второй строке пустой — так видно, что он необязателен;
        // подойдут и колонки «Фамилия» + «Имя» вместо «ФИО».
        var rows = [
            [bi('ФИО', 'Name'), bi('Гандикап', 'Handicap'), bi('Пол', 'Gender'), bi('ТИ', 'Tee'), bi('Группа', 'Group')],
            ['Иванов Иван Иванович', '12,4', bi('муж', 'M'), bi('Белый', 'White'), 'A'],
            ['Петрова Мария', '', bi('жен', 'F'), bi('Красный', 'Red'), 'B']
        ];
        io().exportExcel('Shablon_uchastnikov_Pestovo', [{ name: bi('Участники', 'Participants'), rows: rows }]);
    }

    // ----------------------------------------------------------
    // МОДАЛЬНЫЕ ОКНА
    // ----------------------------------------------------------
    modal('import-preview', function (payload) {
        var parsed = payload.parsed || { players: [], issues: [] };
        var sheets = parsed.sheets || [];
        var rows = parsed.players.map(function (player, index) {
            return '<tr><td>' + (index + 1) + '</td><td>' + esc(core().playerFio(player)) + '</td><td>' + esc(core().fmtHcp(player.hi)) + '</td>' +
                '<td>' + esc(core().genderLabel(player.gender, lang())) + '</td><td>' + esc(player.groupName || '') + '</td></tr>';
        }).join('');
        var issues = (parsed.issues || []).map(function (issue) {
            return '<li>' + esc((issue.sheet ? issue.sheet + ', ' : '') + bi('строка ', 'row ') + issue.row + ': ' + issue.message) + '</li>';
        }).join('');
        var sheetInfo = sheets.map(function (sheet) {
            return esc(sheet.name || bi('Лист', 'Sheet')) + ' — ' + sheet.players;
        }).join(' · ');
        var columns = parsed.columns || {};
        var columnNames = { fio: bi('ФИО', 'Name'), lastName: bi('Фамилия', 'Last name'), firstName: bi('Имя', 'First name'), hi: 'HI', ch: 'CH', gender: bi('Пол', 'Gender'), tee: bi('ТИ', 'Tee'), group: bi('Группа', 'Group') };
        var columnsInfo = Object.keys(columnNames).filter(function (kind) { return columns[kind] != null; })
            .map(function (kind) { return columnNames[kind] + ' — ' + columnLetter(columns[kind]); }).join(' · ');
        return '<div class="tnm-modal-overlay" data-tnm-act="close-modal">' +
            '<div class="tnm-modal" data-tnm-stop="1">' +
            '<h3>' + esc(bi('Импорт участников', 'Import participants')) + '</h3>' +
            '<p class="tnm-sub">' + esc(bi('Найдено участников: ', 'Participants found: ') + parsed.players.length) +
            (sheets.length > 1 ? ' · ' + esc(bi('листов: ', 'sheets: ') + sheets.length + ' (' + sheetInfo + ')') : '') +
            (columnsInfo ? ' · ' + esc(bi('колонки: ', 'columns: ') + columnsInfo) : '') + '</p>' +
            '<div class="tnm-modal-body"><table class="tnm-table"><thead><tr><th>#</th><th>' + esc(bi('ФИО', 'Name')) + '</th><th>HI</th><th>' + esc(bi('Пол', 'Gender')) + '</th><th>' + esc(bi('Группа', 'Group')) + '</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            (issues ? '<p class="tnm-warn">' + esc(bi('Пропущенные строки:', 'Skipped rows:')) + '</p><ul class="tnm-issues">' + issues + '</ul>' : '') +
            '</div>' +
            '<div class="tnm-modal-actions">' +
            btn('confirm-import', esc(bi('Добавить', 'Add')), { variant: 'primary', data: { source: payload.source || 'file' } }) +
            btn('close-modal', esc(bi('Отмена', 'Cancel')), { variant: 'ghost' }) +
            btn('download-template', esc(bi('Шаблон Excel', 'Excel template')), { variant: 'ghost', small: true }) +
            '</div></div></div>';
    });

    modal('paste-table', function () {
        var example = '10:00: Неделько Александр, Свиридов Виктор, Гималетдинов Рустем, Шиловский Марк\n' +
            '10:10: Иванов Иван, Петров Пётр, Сидоров Алексей\n' +
            '10:20 (л.10): Смирнова Анна, Кузнецова Мария, Павлова Ольга';
        return '<div class="tnm-modal-overlay" data-tnm-act="close-modal">' +
            '<div class="tnm-modal" data-tnm-stop="1">' +
            '<h3>' + esc(bi('Вставить таблицу', 'Paste table')) + '</h3>' +
            '<p class="tnm-sub">' + esc(bi('Два формата. Обычный: ФИО, гандикап, пол, ТИ, группа (строки из Excel или Google Таблиц).',
                'Two formats. Plain: name, handicap, gender, tee, group (rows from Excel or Google Sheets).')) + '</p>' +
            '<p class="tnm-sub">' + esc(bi('Стартовый лист: время старта и состав флайта — такие игроки сразу попадают в лист с этим временем.',
                'Tee sheet: start time and flight — such players go straight into the tee sheet with that time.')) +
            '<br><code>10:00: Неделько Александр, Свиридов Виктор, …</code></p>' +
            '<textarea id="tnm-paste-area" rows="8" placeholder="' + esc(example) + '"></textarea>' +
            '<div class="tnm-modal-actions">' +
            btn('confirm-paste', esc(bi('Добавить', 'Add')), { variant: 'primary' }) +
            btn('close-modal', esc(bi('Отмена', 'Cancel')), { variant: 'ghost' }) +
            '</div></div></div>';
    });

    modal('directory', function () {
        var directory = typeof root.getKnownPlayersSync === 'function' ? root.getKnownPlayersSync() : {};
        var added = {};
        playersOf().forEach(function (player) {
            if (player.uid) added['uid:' + player.uid] = true;
            added[core().playerKeyByFio(player)] = true;
        });
        var list = Object.keys(directory || {}).map(function (uid) {
            var item = directory[uid] || {};
            return {
                uid: uid,
                name: core().trim(item.name) || core().trim([item.lastName, item.firstName, item.middleName].filter(Boolean).join(' ')),
                handicap: item.handicap, gender: item.gender, defaultTee: item.defaultTee,
                isGuest: !!item.isGuest || String(uid).indexOf('guest_') === 0
            };
        }).filter(function (item) { return item.name; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ru'); });
        var rows = list.map(function (item) {
            var already = added['uid:' + item.uid] || added[core().playerKeyByFio(item)];
            return '<label class="tnm-dir-row' + (already ? ' tnm-dir-row-added' : '') + '">' +
                '<input type="checkbox" data-tnm-dir="' + esc(item.uid) + '"' + (already ? ' disabled checked' : '') + '>' +
                '<span>' + esc(item.name) + '</span>' +
                '<span class="tnm-muted">' + (item.handicap != null ? 'HI ' + esc(core().fmtHcp(item.handicap)) : '') + '</span>' +
                '</label>';
        }).join('');
        return '<div class="tnm-modal-overlay" data-tnm-act="close-modal">' +
            '<div class="tnm-modal tnm-modal-wide" data-tnm-stop="1">' +
            '<h3>' + esc(bi('База данных клуба', 'Club database')) + '</h3>' +
            '<input type="text" id="tnm-dir-search" placeholder="' + esc(bi('Поиск по фамилии (рус/англ)', 'Search by surname (RU/EN)')) + '">' +
            '<div class="tnm-modal-body tnm-dir-list" id="tnm-dir-list">' + (rows || emptyHtml(bi('База данных клуба пуста', 'Club database is empty'))) + '</div>' +
            '<div class="tnm-modal-actions">' +
            btn('confirm-directory', esc(bi('Добавить выбранных', 'Add selected')), { variant: 'primary' }) +
            btn('close-modal', esc(bi('Отмена', 'Cancel')), { variant: 'ghost' }) +
            '</div></div></div>';
    });

    modal('pause-tournament', function () {
        var t = tournament() || {};
        var options = PAUSE_REASONS.map(function (item) {
            return '<option value="' + esc(bi(item.ru, item.en)) + '">' + esc(bi(item.ru, item.en)) + '</option>';
        }).join('');
        return '<div class="tnm-modal-overlay" data-tnm-act="close-modal">' +
            '<div class="tnm-modal" data-tnm-stop="1">' +
            '<h3>⏸ ' + esc(bi('Поставить турнир на паузу', 'Pause the tournament')) + '</h3>' +
            '<p class="tnm-sub">' + esc(t.name || '') + ' · ' +
            esc(bi('Пауза останавливает тайминги всех раундов турнира и показывает баннер паузы ' +
                'на страницах ввода счёта. Введённые удары сохраняются, «Возобновить» продолжит ' +
                'отсчёт с момента паузы.',
                'Pause freezes the timings of every tournament round and shows a pause banner on the ' +
                'score entry pages. Entered strokes are kept, “Resume” continues from the pause moment.')) + '</p>' +
            '<div class="tnm-modal-body">' +
            '<label class="tnm-field">' + esc(bi('Причина паузы', 'Pause reason')) +
            '<select id="tnm-pause-reason">' + options + '</select></label>' +
            '<label class="tnm-field">' + esc(bi('Своя формулировка (необязательно)', 'Custom wording (optional)')) +
            '<input type="text" id="tnm-pause-note" placeholder="' +
            esc(bi('Например: гроза, остановка на 40 минут', 'e.g. thunderstorm, 40 minute stop')) + '"></label>' +
            '</div>' +
            '<div class="tnm-modal-actions">' +
            btn('confirm-pause-tournament', esc(bi('Поставить на паузу', 'Pause tournament')), { variant: 'primary', icon: 'fas fa-pause' }) +
            btn('close-modal', esc(bi('Отмена', 'Cancel')), { variant: 'ghost' }) +
            '</div></div></div>';
    });

    modal('edit-participant', function (payload) {
        var player = playerOf(payload && payload.pid) || {};
        var groups = groupsOf();
        var groupOptions = '<option value="">' + esc(bi('— без группы —', '— no group —')) + '</option>' + groups.map(function (group) {
            return '<option value="' + esc(group.id) + '"' + (group.id === player.groupId ? ' selected' : '') + '>' + esc(group.name) + '</option>';
        }).join('');
        return '<div class="tnm-modal-overlay" data-tnm-act="close-modal"><div class="tnm-modal" data-tnm-stop="1">' +
            '<h3><i class="fas fa-user-pen"></i> ' + esc(bi('Редактировать участника', 'Edit participant')) + '</h3>' +
            '<p class="tnm-sub">' + esc(bi('Изменения синхронизируются с составом турнира, группами и стартовым листом.', 'Changes are synced to the tournament roster, groups and tee sheet.')) + '</p>' +
            '<div class="tnm-modal-body">' +
            '<label class="tnm-field">' + esc(bi('ФИО', 'Full name')) + '<input id="tnm-edit-player-fio" type="text" maxlength="160" value="' + esc(core().playerFio(player)) + '"></label>' +
            '<div class="tnm-form-grid"><label class="tnm-field">HI<input id="tnm-edit-player-hi" type="number" step="0.1" value="' + esc(player.hi == null ? '' : player.hi) + '"></label>' +
            '<label class="tnm-field">CH<input id="tnm-edit-player-ch" type="number" step="1" value="' + esc(player.ch == null ? '' : player.ch) + '"></label>' +
            '<label class="tnm-field">' + esc(bi('Пол', 'Gender')) + '<select id="tnm-edit-player-gender">' + genderOptionsHtml(player.gender, true) + '</select></label>' +
            '<label class="tnm-field">' + esc(bi('ТИ', 'Tee')) + '<select id="tnm-edit-player-tee">' + teeOptionsHtml(player.tee, true) + '</select></label>' +
            '<label class="tnm-field">' + esc(bi('Группа', 'Group')) + '<select id="tnm-edit-player-group">' + groupOptions + '</select></label></div>' +
            '</div><div class="tnm-modal-actions">' +
            btn('save-participant-edit', esc(bi('Сохранить', 'Save')), { variant: 'primary', data: { pid: payload && payload.pid || '' } }) +
            btn('close-modal', esc(bi('Отмена', 'Cancel')), { variant: 'ghost' }) +
            '</div></div></div>';
    });

    modal('directory-sync', function () {
        var players = playersOf();
        var withUid = players.filter(function (player) { return core().trim(player.uid); }).length;
        var withHcp = players.filter(function (player) { return player.hi != null && player.hi !== ''; }).length;
        return '<div class="tnm-modal-overlay" data-tnm-act="close-modal">' +
            '<div class="tnm-modal" data-tnm-stop="1">' +
            '<h3>' + esc(bi('База данных клуба и гандикапы', 'Club database and handicaps')) + '</h3>' +
            '<p class="tnm-sub">' + esc(bi('Участников: ', 'Participants: ') + players.length + ' · ' +
                bi('в базе данных клуба: ', 'in the club database: ') + withUid + ' · ' +
                bi('с гандикапом: ', 'with a handicap: ') + withHcp) + '</p>' +
            '<div class="tnm-modal-body">' +
            '<p class="tnm-muted">' + esc(bi('Участники, которых ещё нет в базе данных клуба, регистрируются как ГОСТИ: ' +
                'после этого их можно выбрать в любом турнире или в live-скоринге, а гандикап правится ' +
                'в админ-панели («Игроки и роли», синхронизация с АГР).',
                'Participants missing from the club database are registered as GUESTS: they can then be picked in ' +
                'any tournament or in live scoring, and their handicap is edited in the admin panel ' +
                '(“Players and roles”, RusGolf sync).')) + '</p>' +
            '</div>' +
            '<div class="tnm-modal-actions">' +
            btn('directory-register', esc(bi('Зарегистрировать гостей на сайте', 'Register guests on the site')),
                { variant: 'primary', icon: 'fas fa-user-plus' }) +
            btn('handicaps-to-site', esc(bi('Гандикапы турнира → сайт', 'Tournament handicaps → site')),
                { icon: 'fas fa-arrow-up-from-bracket', variant: 'ghost' }) +
            btn('handicaps-from-site', esc(bi('Гандикапы сайта → турнир', 'Site handicaps → tournament')),
                { icon: 'fas fa-arrow-down-to-bracket', variant: 'ghost' }) +
            btn('close-modal', esc(bi('Закрыть', 'Close')), { variant: 'ghost' }) +
            '</div></div></div>';
    });

    // ----------------------------------------------------------
    // ОБРАБОТЧИКИ СОБЫТИЙ (делегирование)
    // ----------------------------------------------------------
    function bindEvents() {
        var host = rootEl();
        if (!host || host.__tnmBound) return;
        host.__tnmBound = true;

        host.addEventListener('click', function (event) {
            if (event.target.closest('[data-tnm-stop]') && !event.target.closest('[data-tnm-act]')) return;
            var trigger = event.target.closest('[data-tnm-act]');
            if (!trigger) return;
            var action = trigger.getAttribute('data-tnm-act');
            // Клик по подложке закрывает окно, клик внутри — нет.
            if (action === 'close-modal' && trigger.classList.contains('tnm-modal-overlay') && event.target !== trigger) return;
            // Внутри «строки-кнопки» поля и свои кнопки работают сами по себе:
            // клик по input/select/textarea/ссылке не должен открывать строку.
            var inside = event.target.closest('input, select, textarea, a, button');
            if (trigger.classList.contains('tnm-row') && inside && inside !== trigger) return;
            var handler = actions[action];
            if (!handler) return;
            event.preventDefault();
            event.stopPropagation();
            handler(trigger, event);
        });

        host.addEventListener('change', function (event) {
            var input = event.target.closest('[data-tnm-edit]');
            if (!input) return;
            var action = input.getAttribute('data-tnm-edit');
            var handler = actions['edit:' + action];
            if (handler) handler(input, event);
        });

        host.addEventListener('input', function (event) {
            var input = event.target.closest('[data-tnm-live]');
            if (!input) return;
            var kind = input.getAttribute('data-tnm-live');
            if (kind === 'participant-search') { updateSuggestions(input.value); return; }
            if (kind === 'participant-table-search') {
                state.participantTableQuery = input.value || '';
                scheduleRender();
                return;
            }
            if (kind === 'form-field' || kind === 'group-field') {
                var field = input.getAttribute('data-field');
                if (kind === 'form-field') {
                    if (!state.form) state.form = emptyForm();
                    state.form[field] = input.value;
                    scheduleDraft();
                } else if (state.groupForm) {
                    state.groupForm[field] = input.value;
                }
                return;
            }
            if (kind === 'dir-search') {
                filterDirectory(input.value);
                return;
            }
            if (kind === 'group-distribution-count') {
                state.groupDistributionCount = Math.max(1, Math.min(10, core().intOf(input.value, 3) || 3));
                return;
            }
        });

        host.addEventListener('input', function (event) {
            var input = event.target.closest('[data-tnm-live-edit]');
            if (!input) return;
            var handler = actions['live:' + input.getAttribute('data-tnm-live-edit')];
            if (handler) handler(input, event);
        });

        // Файлы Excel читаем делегированно: input пересоздаётся при каждом
        // рендере, поэтому обработчик должен жить на корне вкладки.
        host.addEventListener('change', function (event) {
            var input = event.target;
            if (!input || (input.id !== 'tnm-excel-input' && input.id !== 'tnm-form-excel-input')) return;
            var file = input.files && input.files[0];
            if (file) {
                if (input.id === 'tnm-form-excel-input') importFormExcelFile(file);
                else importExcelFile(file);
            }
            input.value = '';
        });
    }

    function filterDirectory(query) {
        var list = el('tnm-dir-list');
        if (!list) return;
        var rows = list.querySelectorAll('.tnm-dir-row');
        rows.forEach(function (row) {
            var text = row.textContent || '';
            row.style.display = core().playerMatches({ fio: text }, query) ? '' : 'none';
        });
    }

    // ----------------------------------------------------------
    // РЕГИСТРАЦИЯ ДЕЙСТВИЙ
    // ----------------------------------------------------------
    on('new-tournament', function () {
        state.form = emptyForm();
        state.editingTournament = false;
        state.pendingPlayers = [];
        state.formDirectoryQuery = '';
        state.formDirectorySelection = {};
        state.formDirectoryCache = null;
        navigate({ view: 'form', tid: '', create: true });
    });
    on('live:form-directory-search', function (input) {
        state.formDirectoryQuery = input.value || '';
        scheduleRender();
    });
    on('edit:form-directory-player-select', function (input) {
        var uid = input.getAttribute('data-uid');
        if (!uid) return;
        if (!state.formDirectorySelection) state.formDirectorySelection = {};
        state.formDirectorySelection[uid] = !!input.checked;
        updateFormDirectorySelectionUi();
    });
    on('form-select-visible-directory', toggleVisibleFormDirectoryPlayers);
    on('form-add-selected-directory', addSelectedFormDirectoryPlayers);
    on('edit-tournament', function () {
        state.formDirectoryQuery = '';
        state.formDirectorySelection = {};
        state.formDirectoryCache = null;
        prepareEditForm();
        navigate({ view: 'form', tid: state.route.tid });
    });
    on('save-tournament', saveTournament);
    on('start-tournament', startTournamentAction);
    on('pause-tournament', pauseTournamentAction);
    on('confirm-pause-tournament', confirmPauseTournamentAction);
    on('resume-tournament', resumeTournamentAction);
    on('force-finish-tournament', forceFinishTournamentAction);
    on('toggle-format', function (button) { toggleFormat(button.getAttribute('data-format')); });
    on('add-format', addFormatFromInput);
    on('back', function () {
        if (state.route.view === 'form') {
            state.form = null;
            state.editingTournament = false;
            state.pendingPlayers = [];
            state.formDirectoryQuery = '';
            state.formDirectorySelection = {};
            state.formDirectoryCache = null;
            navigate({ view: state.route.tid ? 'card' : 'list', tid: state.route.tid || '', tab: 'rounds' });
            return;
        }
        if (state.route.view === 'card') { navigate({ view: 'list', tid: '' }); return; }
        if (state.route.view === 'round') { navigate({ view: 'card', tid: state.route.tid, tab: 'rounds' }); return; }
        if (state.route.view === 'player') { navigate({ view: 'round', tid: state.route.tid, rid: state.route.rid }); return; }
        navigate({ view: 'list', tid: '' });
    });
    on('open-tournament', function (row) {
        navigate({ view: 'card', tid: row.getAttribute('data-id'), tab: 'rounds' });
    });
    on('delete-tournament', function (button) {
        var tid = button.getAttribute('data-id');
        var item = (state.tournaments || {})[tid] || {};
        var run = function () {
            data().deleteTournament(tid).then(function () {
                toastMsg(bi('Турнир удалён', 'Tournament deleted'));
                if (state.route.tid === tid) navigate({ view: 'list', tid: '' });
            }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
        };
        var question = bi('Удалить турнир', 'Delete tournament') + ' «' + (item.name || '') + '»? ' +
            bi('Вместе с ним удалятся раунды, группы, участники, стартовый лист, счёт и результаты.',
                'Rounds, groups, participants, the tee sheet, scores and results will be deleted too.');
        confirmAction({ title: bi('Удаление турнира', 'Delete tournament'), message: question, onConfirm: run });
    });
    on('tab', function (button) {
        state.groupForm = null;
        navigate({ view: 'card', tid: state.route.tid, tab: button.getAttribute('data-tab') });
    });
    on('add-round', addRound);
    on('open-round', function (button) {
        navigate({ view: 'round', tid: state.route.tid, rid: button.getAttribute('data-rid'), tab: 'score' });
    });
    on('delete-round', function (button) { deleteRound(button.getAttribute('data-rid')); });
    on('edit:round-date', function (input) { onRoundDateChange(input.getAttribute('data-rid'), input.value); });

    on('add-group', newGroupForm);
    on('edit-group', function (row) { editGroupForm(row.getAttribute('data-gid')); });
    on('save-group', saveGroup);
    on('back-groups', function () { state.groupForm = null; render(); });
    on('delete-group', function (button) { deleteGroup(button.getAttribute('data-gid')); });
    on('distribute-groups', distributeGroups);

    on('import-participants-excel', function () {
        var input = el('tnm-form-excel-input');
        if (input) input.click();
    });
    on('remove-pending-player', function (button) {
        var index = core().intOf(button.getAttribute('data-index'), -1);
        var list = state.pendingPlayers || [];
        if (index < 0 || index >= list.length) return;
        list.splice(index, 1);
        state.pendingPlayers = list;
        render();
    });
    on('clear-pending-players', function () {
        if (!(state.pendingPlayers || []).length) return;
        confirmAction({
            title: bi('Очистить список', 'Clear the list'),
            message: bi('Убрать всех участников из очереди добавления?', 'Remove all participants from the add queue?'),
            onConfirm: function () { state.pendingPlayers = []; render(); }
        });
    });
    on('add-suggestion', function (button) { addSuggestion(button); });
    on('add-manual', function (button) { addManual(button.getAttribute('data-name')); });
    on('remove-participant', function (button) { removeParticipant(button.getAttribute('data-pid')); });
    on('remove-selected-participants', function () {
        removeParticipants(Object.keys(state.selectedParticipantIds || {}).filter(function (pid) {
            return state.selectedParticipantIds[pid];
        }));
    });
    on('remove-all-participants', function () {
        removeParticipants(playersOf().map(function (player) { return player.id; }));
    });
    on('export-participants', exportParticipantsPdf);
    on('import-excel', function () { var input = el('tnm-excel-input'); if (input) input.click(); });
    on('paste-table', function () { openModal('paste-table'); });
    on('open-directory', function () { openModal('directory'); });
    on('directory-sync', function () { openModal('directory-sync'); });
    on('directory-register', function () {
        closeModal();
        registerParticipantsInDirectory(playersOf(), 'fill');
    });
    on('handicaps-to-site', function () {
        closeModal();
        registerParticipantsInDirectory(playersOf(), 'push');
    });
    on('handicaps-from-site', function () {
        closeModal();
        pullDirectoryHandicaps();
    });
    on('download-template', downloadImportTemplate);
    on('close-modal', closeModal);
    on('confirm-import', function () {
        var parsed = (modals.__payload && modals.__payload.parsed) || null;
        if (parsed) addParticipants(parsed.players, false);
        closeModal();
    });
    /**
     * Вставка стартового листа: «10:00: Неделько Александр, Свиридов Виктор…».
     * Участники добавляются в турнир, а затем лист раунда пересобирается
     * ровно в том составе и с теми временами старта, что вставил организатор.
     */
    function pasteStartList(text) {
        var parsed = core().parseStartList(text);
        if (!parsed.players.length) {
            toastMsg(bi('Не найдено строк с именами', 'No rows with names found'), 'error');
            return;
        }
        var tid = state.route.tid;
        var rid = state.route.rid || (roundsOf()[0] ? roundsOf()[0].id : '');
        var ensureRound = rid ? Promise.resolve(rid)
            : data().addRound(tid, { date: (tournament() || {}).startDate || (tournament() || {}).date || core().todayIso() })
                .then(function (created) { return core().trim(created && created.id ? created.id : created); });
        state.busy = true;
        render();
        addParticipants(parsed.players, true).then(function () {
            return ensureRound;
        }).then(function (roundId) {
            if (!roundId) throw new Error(bi('Не удалось создать раунд', 'Could not create the round'));
            return data().read('tournaments/' + tid).then(function (fresh) {
                return data().generateSheetFromFlights(tid, roundId, parsed.flights, fresh || {});
            });
        }).then(function (result) {
            state.busy = false;
            closeModal();
            var entries = Object.keys((result && result.sheet && result.sheet.entries) || {}).length;
            var missing = (result && result.missing) || [];
            toastMsg(bi('Стартовый лист: флайтов ', 'Tee sheet: flights ') + parsed.flights.length +
                ' · ' + bi('игроков ', 'players ') + entries +
                (missing.length ? ' · ' + bi('не найдено: ', 'not found: ') + missing.slice(0, 3).join(', ') : ''));
            navigate({ view: 'card', tid: tid, tab: 'sheet' });
        }).catch(function (err) {
            state.busy = false;
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
            render();
        });
    }

    on('confirm-paste', function () {
        var area = el('tnm-paste-area');
        var text = area ? area.value : '';
        if (core().looksLikeStartList(text)) { pasteStartList(text); return; }
        var parsed = core().parseParticipants(core().parseDelimited(text));
        if (!parsed.players.length) { toastMsg(bi('Не найдено строк с ФИО', 'No rows with names found'), 'error'); return; }
        addParticipants(parsed.players, false);
        closeModal();
    });
    on('confirm-directory', function () {
        var host = rootEl();
        var selected = [];
        host.querySelectorAll('[data-tnm-dir]:checked').forEach(function (box) {
            if (box.disabled) return;
            var row = box.closest('.tnm-dir-row');
            var name = row ? core().trim(row.querySelector('span') ? row.querySelector('span').textContent : '') : '';
            var directory = typeof root.getKnownPlayersSync === 'function' ? root.getKnownPlayersSync() : {};
            var item = directory[box.getAttribute('data-tnm-dir')] || {};
            selected.push({
                uid: box.getAttribute('data-tnm-dir'),
                fio: name || item.name,
                hi: item.handicap, gender: item.gender, tee: item.defaultTee || '', source: 'directory'
            });
        });
        if (!selected.length) { toastMsg(bi('Никто не выбран', 'Nobody selected'), 'warn'); return; }
        addParticipants(selected, false);
        closeModal();
    });
    on('open-player-card', function (button) {
        var pid = button.getAttribute('data-pid');
        var rounds = roundsOf();
        var rid = state.route.rid || (rounds[0] ? rounds[0].id : '');
        if (rid) navigate({ view: 'player', tid: state.route.tid, pid: pid, rid: rid });
        else toastMsg(bi('Сначала создайте раунд', 'Create a round first'), 'warn');
    });
    on('open-player-in-round', function (row) {
        var pid = row.getAttribute('data-pid');
        var rounds = roundsOf();
        var rid = state.route.rid || (rounds[0] ? rounds[0].id : '');
        if (rid) navigate({ view: 'player', tid: state.route.tid, pid: pid, rid: rid });
    });
    on('edit-participant', function (button) { openModal('edit-participant', { pid: button.getAttribute('data-pid') }); });
    on('select-visible-participants', function () {
        var visible = core().searchPlayers(playersOf(), state.participantTableQuery, 0);
        var allSelected = visible.length > 0 && visible.every(function (player) { return !!state.selectedParticipantIds[player.id]; });
        visible.forEach(function (player) { state.selectedParticipantIds[player.id] = !allSelected; });
        render();
    });
    on('rusgolf-sync-selected', function () { syncTournamentHandicapsWithRusgolf(false); });
    on('rusgolf-sync-all', function () { syncTournamentHandicapsWithRusgolf(true); });

    // Правки игроков из таблицы участников.
    function playerPatch(pid, fields) {
        data().updatePlayer(state.route.tid, pid, fields, tournament()).catch(function (err) {
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }
    on('edit:participant-select', function (input) {
        var pid = input.getAttribute('data-pid');
        if (input.checked) state.selectedParticipantIds[pid] = true;
        else delete state.selectedParticipantIds[pid];
        scheduleRender();
    });
    on('save-participant-edit', function (button) {
        var pid = button.getAttribute('data-pid');
        var fioInput = el('tnm-edit-player-fio');
        var hiInput = el('tnm-edit-player-hi');
        var chInput = el('tnm-edit-player-ch');
        var genderInput = el('tnm-edit-player-gender');
        var teeInput = el('tnm-edit-player-tee');
        var groupInput = el('tnm-edit-player-group');
        var fio = core().trim(fioInput && fioInput.value);
        if (!fio) { toastMsg(bi('Введите ФИО участника', 'Enter the participant’s name'), 'warn'); return; }
        var parts = core().splitFio(fio);
        var fields = {
            fio: fio,
            firstName: parts.firstName || '',
            lastName: parts.lastName || '',
            middleName: parts.middleName || '',
            hi: hiInput && hiInput.value !== '' ? core().num(hiInput.value) : null,
            ch: chInput && chInput.value !== '' ? core().num(chInput.value) : null,
            gender: genderInput ? genderInput.value : 'men',
            tee: teeInput ? teeInput.value : '',
            groupId: groupInput ? groupInput.value : ''
        };
        data().updatePlayer(state.route.tid, pid, fields, tournament()).then(function () {
            delete state.selectedParticipantIds[pid];
            closeModal();
            toastMsg(bi('Данные участника обновлены', 'Participant details updated'));
        }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
    });
    on('edit:player-hi', function (input) {
        var value = input.value === '' ? null : core().num(input.value);
        var pid = input.getAttribute('data-pid');
        var player = playerOf(pid) || {};
        var tee = player.tee || 'wh';
        var fields = { hi: value, ch: computeCh({ hi: value, gender: player.gender }, tee) };
        playerPatch(pid, fields);
    });
    on('edit:player-ch', function (input) {
        playerPatch(input.getAttribute('data-pid'), { ch: input.value === '' ? null : core().num(input.value) });
    });
    on('edit:player-gender', function (input) {
        playerPatch(input.getAttribute('data-pid'), { gender: input.value });
    });
    on('edit:player-tee', function (input) {
        var pid = input.getAttribute('data-pid');
        var player = playerOf(pid) || {};
        playerPatch(pid, { tee: input.value, ch: computeCh(player, input.value) });
    });
    on('edit:player-group', function (input) {
        playerPatch(input.getAttribute('data-pid'), { groupId: input.value });
    });

    // ----------------------------------------------------------
    // ВХОД ИЗ АДМИНКИ
    // ----------------------------------------------------------
    function onTabOpen() {
        bindList();
        applyRoute();
        bindEvents();
        refreshGlobalFormats();
    }

    function refreshGlobalFormats() {
        data().loadFormatCatalog('').then(function (list) {
            root.__tnmGlobalFormats = list.reduce(function (acc, item) {
                if (item.custom) acc[item.id] = item;
                return acc;
            }, {});
        }).catch(function () { /* silent */ });
    }

    var started = false;

    /** Первичная привязка вкладки: подписки на данные/события и первый рендер. */
    function start() {
        if (started) return;
        started = true;
        bindList();
        bindEvents();
        watchLanguage();
        root.addEventListener('hashchange', applyRoute);
        refreshGlobalFormats();
        applyRoute();
    }

    /** Явный вход из js/tn-mgr.js (кнопка вкладки в админке). */
    function boot() {
        start();
        render();
    }

    if (doc()) {
        if (doc().readyState === 'loading') doc().addEventListener('DOMContentLoaded', start);
        else start();
    }

    return {
        state: state, render: render, navigate: navigate, onTabOpen: onTabOpen, start: start, boot: boot,
        on: on, modal: modal, openModal: openModal, closeModal: closeModal,
        bindEvents: bindEvents, rootEl: rootEl, el: el,
        esc: esc, bi: bi, lang: lang, toastMsg: toastMsg, btn: btn, backBtn: backBtn,
        teeOptionsHtml: teeOptionsHtml, genderOptionsHtml: genderOptionsHtml, fieldHtml: fieldHtml,
        headHtml: headHtml, emptyHtml: emptyHtml, statusChip: statusChip,
        tournament: tournament, playersOf: playersOf, groupsOf: groupsOf, roundsOf: roundsOf,
        roundOf: roundOf, playerOf: playerOf, sheetOf: sheetOf, catalog: catalog,
        formatsOfTournament: formatsOfTournament, baseUrl: baseUrl, scheduleRender: scheduleRender,
        addParticipants: addParticipants, computeCh: computeCh, confirmAction: confirmAction
    };
})(typeof window !== 'undefined' ? window : this);
