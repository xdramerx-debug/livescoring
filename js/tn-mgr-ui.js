// ============================================================
// TN-MGR-UI — экраны системы турниров внутри админ-панели
// ------------------------------------------------------------
// Вкладка «Турниры 🏆» в admin.html: список турниров, форма
// создания/правки, карточка турнира с вкладками Раунды, Группы,
// Участники и Стартовый лист (последний — js/tn-mgr-sheet.js,
// экран счёта и результаты — js/tn-mgr-round.js).
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
        groupForm: null,     // { id, name, hcpFrom, hcpTo, gender, tee, format, members }
        participantQuery: '',
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
                view: 'round', tid: tid, rid: parts[3] || '', tab: (parts[4] === 'results' ? 'results' : 'score'),
                pid: parts[5] === 'player' ? (parts[6] || '') : '', sub: parts[4] || 'score'
            };
        }
        if (parts[2] === 'player') return { view: 'player', tid: tid, pid: parts[3] || '', rid: parts[4] || '', tab: 'score', sub: '' };
        var tabs = ['rounds', 'groups', 'participants', 'sheet'];
        return { view: 'card', tid: tid, tab: tabs.indexOf(parts[2]) !== -1 ? parts[2] : 'rounds', rid: '', pid: '', sub: '' };
    }

    function navigate(route) {
        var next = Object.assign({}, state.route, route || {});
        var hash = '#tnm';
        if (next.view === 'form') hash += next.tid ? ('/' + next.tid + '/edit') : '/new';
        else if (next.view === 'card') hash += '/' + next.tid + '/' + next.tab;
        else if (next.view === 'round') hash += '/' + next.tid + '/round/' + next.rid + '/' + (next.tab === 'results' ? 'results' : 'score') + (next.pid ? '/player/' + next.pid : '');
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
                state.form = Object.assign(emptyForm(), draft);
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
            '</div></div></div>';
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
            data().updateTournament(state.route.tid, {
                name: form.name, startDate: form.startDate, startTime: form.startTime,
                formats: form.formats, club: form.club, course: form.course, note: form.note
            }).then(function () {
                state.busy = false;
                state.form = null;
                toastMsg(bi('✅ Турнир сохранён', '✅ Tournament saved'));
                navigate({ view: 'card', tid: state.route.tid, tab: 'rounds' });
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
            toastMsg(bi('✅ Турнир создан', '✅ Tournament created'));
            navigate({ view: 'card', tid: tid, tab: 'rounds' });
        }).catch(function (err) {
            state.busy = false;
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
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
            if (state.form) data().saveDraft(Object.assign({}, state.form, { updatedAt: Date.now() }));
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
            { key: 'sheet', ru: 'Стартовый лист', en: 'Tee sheet', icon: 'fas fa-table-list' }
        ].map(function (tab) {
            return '<button type="button" class="tnm-tab' + (state.route.tab === tab.key ? ' active' : '') +
                '" data-tnm-act="tab" data-tab="' + tab.key + '"><i class="' + tab.icon + '"></i> ' + esc(bi(tab.ru, tab.en)) + '</button>';
        }).join('');

        var body = '';
        if (state.route.tab === 'rounds') body = roundsTabHtml(t);
        else if (state.route.tab === 'groups') body = groupsTabHtml(t);
        else if (state.route.tab === 'participants') body = participantsTabHtml(t);
        else body = root.TnMgrSheetUI ? root.TnMgrSheetUI.html() : notReadyHtml();

        return '<div class="tnm-view">' +
            '<div class="tnm-card-head">' +
            backBtn() +
            '<div class="tnm-card-title"><h2>' + esc(t.name || bi('Без названия', 'Untitled')) + '</h2>' +
            '<p class="tnm-sub">' + esc(meta) + ' · ' + statusChip(t) +
            ((t.formats || []).length ? ' · ' + esc((t.formats || []).join(' · ')) : '') + '</p></div>' +
            '<div class="tnm-view-head-actions">' + btn('edit-tournament', esc(bi('Изменить', 'Edit')), { icon: 'fas fa-pen', variant: 'ghost' }) + '</div>' +
            '</div>' +
            '<div class="tnm-tabs">' + tabs + '</div>' +
            body + '</div>';
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
            fieldHtml('format', bi('Формат', 'Format'), '<input type="text" data-tnm-live="group-field" data-field="format" value="' + esc(form.format) + '">') +
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

    // ----------------------------------------------------------
    // 3.3 УЧАСТНИКИ
    // ----------------------------------------------------------
    function participantsTabHtml(t) {
        var players = playersOf(t);
        var counts = core().participantsCounts(players);
        var groups = groupsOf(t);
        var rows = players.map(function (player) {
            return '<tr>' +
                '<td><div class="tnm-player-name" data-tnm-act="open-player-in-round" data-pid="' + esc(player.id) + '">' + esc(core().playerFio(player)) + '</div>' +
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

        return '<div class="tnm-tab-body">' +
            headHtml('<i class="fas fa-users"></i> ' + esc(bi('Гольфисты', 'Golfers')),
                esc(bi('Поиск по фамилии на русском или английском языке, импорт из Excel и добавление из справочника.',
                    'Search by surname in Russian or English, import from Excel or add from the club directory.')),
                btn('export-participants', esc(bi('Экспорт', 'Export')), { icon: 'fas fa-file-pdf' }) + ' ' +
                btn('import-excel', esc(bi('Импорт Excel', 'Import Excel')), { icon: 'fas fa-file-excel', variant: 'ghost' }) + ' ' +
                btn('paste-table', esc(bi('Вставить таблицу', 'Paste table')), { icon: 'fas fa-table', variant: 'ghost' }) + ' ' +
                btn('open-directory', esc(bi('Из справочника игроков', 'From player directory')), { icon: 'fas fa-address-book', variant: 'ghost' })) +
            '<div class="tnm-search-wrap">' +
            '<i class="fas fa-search"></i>' +
            '<input type="text" id="tnm-participant-search" data-tnm-live="participant-search" data-tnm-focus="participant-search" autocomplete="off" ' +
            'value="' + esc(state.participantQuery) + '" placeholder="' + esc(bi('Введите фамилию гольфиста или гостя на русском или английском языке',
                'Enter the golfer’s surname in Russian or English')) + '">' +
            ((suggestions || manualAdd) ? '<div class="tnm-suggestions">' + suggestions + manualAdd + '</div>' : '') +
            '</div>' +
            '<p class="tnm-counters">' + esc(bi('Всего участников — ', 'Total participants — ')) + '<b>' + counts.total + '</b>, ' +
            esc(bi('мужчин — ', 'men — ')) + '<b>' + counts.men + '</b>, ' + esc(bi('женщин — ', 'women — ')) + '<b>' + counts.women + '</b></p>' +
            (players.length
                ? '<div class="tnm-table-scroll"><table class="tnm-table"><thead><tr>' +
                '<th>' + esc(bi('ФИО', 'Name')) + '</th><th>HI</th><th>CH</th><th>' + esc(bi('Пол', 'Gender')) + '</th>' +
                '<th>' + esc(bi('ТИ', 'Tee')) + '</th><th>' + esc(bi('Группа', 'Group')) + '</th><th></th>' +
                '</tr></thead><tbody>' + rows + '</tbody></table></div>'
                : emptyHtml(bi('Участников пока нет. Добавьте их поиском, импортом или из справочника.',
                    'No participants yet. Add them via search, import or the directory.'))) +
            '<input type="file" id="tnm-excel-input" accept=".xlsx,.xls,.csv,.tsv,.txt" class="tnm-hidden">' +
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
        var prepared = (list || []).filter(function (item) { return item && core().trim(item.fio || item.name); }).map(function (item) {
            if (!item.fio && item.name) item.fio = item.name;
            var group = data().groupForPlayer(t, item);
            if (group) item.groupId = group.id;
            if (!item.hi && item.hi !== 0 && item.handicap != null) item.hi = item.handicap;
            var tee = item.tee || (core().normalizeGender(item.gender) === 'women' ? 'rd' : 'wh');
            return Object.assign({}, item, { tee: tee, ch: item.ch != null ? item.ch : computeCh(item, tee) });
        });
        if (!prepared.length) return;
        data().addPlayers(state.route.tid, prepared, t).then(function (created) {
            state.participantQuery = '';
            state.suggestions = [];
            if (!silent) toastMsg(bi('Добавлено участников: ', 'Participants added: ') + created.length);
            render();
        }).catch(function (err) { toastMsg('❌ ' + (err && err.message ? err.message : err), 'error'); });
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
        io().readTableFile(file).then(function (aoa) {
            var parsed = core().parseParticipants(aoa);
            if (!parsed.players.length) {
                toastMsg(bi('В файле не найдено участников', 'No participants found in the file'), 'error');
                return;
            }
            openModal('import-preview', { parsed: parsed });
        }).catch(function (err) {
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    function downloadImportTemplate() {
        var rows = [
            [bi('ФИО', 'Name'), bi('Гандикап', 'Handicap'), bi('Пол', 'Gender'), bi('ТИ', 'Tee'), bi('Группа', 'Group')],
            ['Иванов Иван Иванович', '12,4', bi('муж', 'M'), bi('Белый', 'White'), 'A']
        ];
        io().exportExcel('Shablon_uchastnikov_Pestovo', [{ name: bi('Участники', 'Participants'), rows: rows }]);
    }

    // ----------------------------------------------------------
    // МОДАЛЬНЫЕ ОКНА
    // ----------------------------------------------------------
    modal('import-preview', function (payload) {
        var parsed = payload.parsed || { players: [], issues: [] };
        var rows = parsed.players.map(function (player, index) {
            return '<tr><td>' + (index + 1) + '</td><td>' + esc(core().playerFio(player)) + '</td><td>' + esc(core().fmtHcp(player.hi)) + '</td>' +
                '<td>' + esc(core().genderLabel(player.gender, lang())) + '</td><td>' + esc(player.groupName || '') + '</td></tr>';
        }).join('');
        var issues = (parsed.issues || []).map(function (issue) {
            return '<li>' + esc(bi('Строка ', 'Row ') + issue.row + ': ' + issue.message) + '</li>';
        }).join('');
        return '<div class="tnm-modal-overlay" data-tnm-act="close-modal">' +
            '<div class="tnm-modal" data-tnm-stop="1">' +
            '<h3>' + esc(bi('Импорт участников', 'Import participants')) + '</h3>' +
            '<p class="tnm-sub">' + esc(bi('Найдено: ', 'Found: ') + parsed.players.length) + '</p>' +
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
        return '<div class="tnm-modal-overlay" data-tnm-act="close-modal">' +
            '<div class="tnm-modal" data-tnm-stop="1">' +
            '<h3>' + esc(bi('Вставить таблицу', 'Paste table')) + '</h3>' +
            '<p class="tnm-sub">' + esc(bi('Скопируйте строки из Excel или Google Таблиц: ФИО, гандикап, пол, ТИ, группа.',
                'Copy rows from Excel or Google Sheets: name, handicap, gender, tee, group.')) + '</p>' +
            '<textarea id="tnm-paste-area" rows="8" placeholder="Иванов Иван\t12,4\tмуж\tБелый\tA"></textarea>' +
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
            '<h3>' + esc(bi('Справочник игроков клуба', 'Club player directory')) + '</h3>' +
            '<input type="text" id="tnm-dir-search" placeholder="' + esc(bi('Поиск по фамилии (рус/англ)', 'Search by surname (RU/EN)')) + '">' +
            '<div class="tnm-modal-body tnm-dir-list" id="tnm-dir-list">' + (rows || emptyHtml(bi('Справочник пуст', 'Directory is empty'))) + '</div>' +
            '<div class="tnm-modal-actions">' +
            btn('confirm-directory', esc(bi('Добавить выбранных', 'Add selected')), { variant: 'primary' }) +
            btn('close-modal', esc(bi('Отмена', 'Cancel')), { variant: 'ghost' }) +
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
        });

        host.addEventListener('input', function (event) {
            var input = event.target.closest('[data-tnm-live-edit]');
            if (!input) return;
            var handler = actions['live:' + input.getAttribute('data-tnm-live-edit')];
            if (handler) handler(input, event);
        });

        var fileInput = el('tnm-excel-input');
        if (fileInput) fileInput.addEventListener('change', function () {
            if (fileInput.files && fileInput.files[0]) importExcelFile(fileInput.files[0]);
            fileInput.value = '';
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
        navigate({ view: 'form', tid: '', create: true });
    });
    on('edit-tournament', function () {
        prepareEditForm();
        navigate({ view: 'form', tid: state.route.tid });
    });
    on('save-tournament', saveTournament);
    on('toggle-format', function (button) { toggleFormat(button.getAttribute('data-format')); });
    on('add-format', addFormatFromInput);
    on('back', function () {
        if (state.route.view === 'form') {
            state.form = null;
            state.editingTournament = false;
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

    on('add-suggestion', function (button) { addSuggestion(button); });
    on('add-manual', function (button) { addManual(button.getAttribute('data-name')); });
    on('remove-participant', function (button) { removeParticipant(button.getAttribute('data-pid')); });
    on('export-participants', exportParticipantsPdf);
    on('import-excel', function () { var input = el('tnm-excel-input'); if (input) input.click(); });
    on('paste-table', function () { openModal('paste-table'); });
    on('open-directory', function () { openModal('directory'); });
    on('download-template', downloadImportTemplate);
    on('close-modal', closeModal);
    on('confirm-import', function () {
        var parsed = (modals.__payload && modals.__payload.parsed) || null;
        if (parsed) addParticipants(parsed.players, false);
        closeModal();
    });
    on('confirm-paste', function () {
        var area = el('tnm-paste-area');
        var parsed = core().parseParticipants(core().parseDelimited(area ? area.value : ''));
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

    // Правки игроков из таблицы участников.
    function playerPatch(pid, fields) {
        data().updatePlayer(state.route.tid, pid, fields, tournament()).catch(function (err) {
            toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }
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
