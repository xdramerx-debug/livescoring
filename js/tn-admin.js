// ============================================================
// tn-admin.js — НОВАЯ ТУРНИРНАЯ СИСТЕМА (страница tn-admin.html)
// ------------------------------------------------------------
// Простой флоу: создать турнир → добавить участников → старт
// (переиспользуемый стартовый лист js/start-admin.js) → результаты
// (из раундов или вручную) → протокол с призёрами (печать/PDF,
// CSV, Excel, публичная ссылка).
//
// Чистая логика (позиции, дивизионы, номинации, экспорт) — в
// js/tn-admin-core.js (window.TnAdminCore), она же проверяется
// автотеста tools/test-tn-admin.js. Здесь — DOM и Firebase.
// ============================================================

var tnaState = {
    view: 'list',            // 'list' | 'workspace'
    tnId: null,
    tn: null,                // снимок tournaments/<id>
    step: 1,                 // 1 Настройки · 2 Участники · 3 Старт · 4 Результаты · 5 Протокол
    cfg: null,
    players: [],             // нормализованные участники (черновик)
    results: {},             // черновик ручного ввода { pid: {...} }
    resultsMode: 'auto',     // 'auto' — из раундов, 'manual' — вручную
    rounds: {},              // все раунды (фильтруем по tournamentId)
    protocols: {},           // стартовые протоколы (игровые группы)
    users: null,             // база игроков клуба (users)
    usersLoading: false,
    usersWaiters: [],
    protocol: null,          // построенный протокол (кэш рендера)
    binds: {},               // активные подписки
    dirty: false,
    saving: false,
    list: {}                 // кэш списка турниров новой системы
};

var TNA_STEPS = [
    { n: 1, ru: 'Настройки', en: 'Settings' },
    { n: 2, ru: 'Участники', en: 'Players' },
    { n: 3, ru: 'Старт', en: 'Tee sheet' },
    { n: 4, ru: 'Результаты', en: 'Results' },
    { n: 5, ru: 'Протокол', en: 'Protocol' }
];

function tnaL(ru, en) {
    return (typeof currentLang !== 'undefined' && currentLang === 'en') ? en : ru;
}

function tnaEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function tnaCore() {
    return (typeof TnAdminCore !== 'undefined') ? TnAdminCore : null;
}

function tnaDb() {
    return (typeof db !== 'undefined' && db) ? db : null;
}

function tnaToday() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
}

// ============================================================
// ЗАПУСК
// ============================================================
// Подписка на список турниров новой системы (source === 'tn-admin').
// Вызывается при старте и после возврата «К списку» — tnaUnbindAll()
// отключает активную подписку, иначе список перестаёт обновляться.
function tnaBindList() {
    tnaBind('list', 'tournaments', function (snap) {
        var all = (snap && snap.val) ? (snap.val() || {}) : {};
        var out = {};
        Object.keys(all).forEach(function (id) {
            var t = all[id] || {};
            if (t.source === 'tn-admin') out[id] = t;
        });
        tnaState.list = out;
        if (tnaState.view === 'list') tnaRender();
    });
}

function tnaInit() {
    tnaBindList();
    tnaRender();
}

// Подписка на путь RTDB с автоматической отпиской при смене турнира.
function tnaBind(key, path, handler) {
    var d = tnaDb();
    if (!d) return;
    if (tnaState.binds[key]) { try { tnaState.binds[key].off(); } catch (e) {} }
    var ref = d.ref(path);
    ref.on('value', handler, function (err) { console.warn('[tn-admin] bind ' + key, err); });
    tnaState.binds[key] = ref;
}

function tnaUnbindAll() {
    Object.keys(tnaState.binds).forEach(function (k) {
        try { tnaState.binds[k].off(); } catch (e) {}
    });
    tnaState.binds = {};
}

// ============================================================
// РЕНДЕР
// ============================================================
function tnaRender() {
    var root = document.getElementById('tna-root');
    if (!root) return;
    // ВАЖНО: tnaAfterRender() вызывается в обоих представлениях —
    // именно он вешает onclick на «+ Создать турнир» и карточки
    // турниров (в списке раньше ранний return оставлял кнопки без
    // обработчиков).
    root.innerHTML = (tnaState.view === 'list') ? tnaListHtml() : tnaWorkspaceHtml();
    tnaAfterRender();
}

// ---------- Список турниров ----------
function tnaStatusBadge(status) {
    var s = String(status || 'upcoming');
    var map = {
        upcoming: { cls: 'tna-b-up', ru: 'Предстоящий', en: 'Upcoming' },
        active: { cls: 'tna-b-ac', ru: 'Идёт', en: 'Live' },
        completed: { cls: 'tna-b-do', ru: 'Завершён', en: 'Finished' }
    };
    var m = map[s] || map.upcoming;
    return '<span class="tna-badge ' + m.cls + '">' + tnaL(m.ru, m.en) + '</span>';
}

function tnaFormatLabel(cfg) {
    var c = cfg || {};
    if (c.scoring === 'stableford') return tnaL('Stableford', 'Stableford');
    return c.netMode === 'gross' ? tnaL('Stroke Play · Gross', 'Stroke Play · Gross')
        : tnaL('Stroke Play · Net', 'Stroke Play · Net');
}

function tnaListHtml() {
    var ids = Object.keys(tnaState.list).sort(function (a, b) {
        return String(tnaState.list[b].date || '') .localeCompare(String(tnaState.list[a].date || ''));
    });
    var cards = ids.map(function (id) {
        var t = tnaState.list[id] || {};
        var count = t.registeredPlayers ? Object.keys(t.registeredPlayers).length : 0;
        return '<div class="tna-card" data-tna-open="' + tnaEsc(id) + '" role="button" tabindex="0">' +
            '<div class="tna-card-top"><b>' + tnaEsc(t.name || '—') + '</b>' + tnaStatusBadge(t.status) + '</div>' +
            '<div class="tna-card-meta">' +
            '<span><i class="far fa-calendar"></i> ' + tnaEsc(t.date || '—') + '</span>' +
            '<span><i class="fas fa-golf-ball-tee"></i> ' + tnaEsc(tnaFormatLabel(t.cfg)) + '</span>' +
            '<span><i class="fas fa-users"></i> ' + count + '</span>' +
            '</div></div>';
    }).join('');
    return '<div class="tna-list-head">' +
        '<h2><i class="fas fa-trophy" style="color:var(--gold)"></i> ' + tnaL('Турниры клуба', 'Club tournaments') + '</h2>' +
        '<button class="btn btn-g" id="tna-create-btn"><i class="fas fa-plus"></i> ' + tnaL('Создать турнир', 'New tournament') + '</button>' +
        '</div>' +
        (ids.length
            ? '<div class="tna-grid">' + cards + '</div>'
            : '<div class="tna-empty"><i class="fas fa-trophy"></i><p>' +
              tnaL('Пока ни одного турнира. Создайте первый — это займёт минуту.', 'No tournaments yet. Create the first one — it takes a minute.') +
              '</p></div>');
}

// ---------- Рабочая область ----------
function tnaWorkspaceHtml() {
    var t = tnaState.tn || {};
    var steps = TNA_STEPS.map(function (s) {
        var cls = s.n === tnaState.step ? ' active' : '';
        var done = s.n < tnaState.step ? ' done' : '';
        return '<button class="tna-step' + cls + done + '" data-tna-step="' + s.n + '">' +
            '<span class="tna-step-n">' + s.n + '</span>' + tnaL(s.ru, s.en) + '</button>';
    }).join('');
    var panel = '';
    if (tnaState.step === 1) panel = tnaSettingsHtml(t);
    else if (tnaState.step === 2) panel = tnaPlayersHtml(t);
    else if (tnaState.step === 3) panel = tnaStartHtml(t);
    else if (tnaState.step === 4) panel = tnaResultsHtml(t);
    else panel = tnaProtocolHtml(t);

    return '<div class="tna-ws-head">' +
        '<button class="btn btn-og btn-sm" id="tna-back-btn"><i class="fas fa-arrow-left"></i> ' + tnaL('К списку', 'All tournaments') + '</button>' +
        '<div class="tna-ws-title"><b>' + tnaEsc(t.name || tnaL('Новый турнир', 'New tournament')) + '</b>' +
        tnaStatusBadge(t.status) + '</div>' +
        '<div class="tna-ws-actions">' +
        '<button class="btn btn-og btn-sm" id="tna-delete-btn"><i class="fas fa-trash"></i> ' + tnaL('Удалить', 'Delete') + '</button>' +
        '</div></div>' +
        '<div class="tna-steps">' + steps + '</div>' +
        '<div class="tna-panel">' + panel + '</div>';
}

function tnaAfterRender() {
    var root = document.getElementById('tna-root');
    if (!root) return;
    // Навигация
    var back = document.getElementById('tna-back-btn');
    if (back) back.onclick = function () { tnaOpenList(); };
    var del = document.getElementById('tna-delete-btn');
    if (del) del.onclick = function () { tnaDeleteTournament(); };
    var create = document.getElementById('tna-create-btn');
    if (create) create.onclick = function () { tnaCreateTournament(); };
    root.querySelectorAll('[data-tna-open]').forEach(function (el) {
        el.onclick = function () { tnaOpenTournament(el.getAttribute('data-tna-open')); };
        el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tnaOpenTournament(el.getAttribute('data-tna-open')); } };
    });
    root.querySelectorAll('[data-tna-step]').forEach(function (el) {
        el.onclick = function () { tnaState.step = parseInt(el.getAttribute('data-tna-step'), 10); tnaRender(); };
    });
    if (tnaState.step === 1) tnaBindSettings();
    if (tnaState.step === 2) tnaBindPlayers();
    if (tnaState.step === 3) tnaBindStart();
    if (tnaState.step === 4) tnaBindResults();
    if (tnaState.step === 5) tnaBindProtocol();
}

// ============================================================
// ШАГ 1 — НАСТРОЙКИ ТУРНИРА
// ============================================================
function tnaSettingsHtml(t) {
    var cfg = tnaState.cfg || (tnaCore() ? tnaCore().normalizeConfig(t.cfg) : {});
    var divs = (cfg.divisions || []).map(function (d, i) {
        return '<div class="tna-div-row" data-div="' + i + '">' +
            '<input class="form-input" data-div-name value="' + tnaEsc(d.name) + '" placeholder="' + tnaL('Название', 'Name') + '">' +
            '<input class="form-input tna-num" data-div-from type="number" step="0.1" value="' + tnaEsc(d.hcpFrom) + '" placeholder="от">' +
            '<input class="form-input tna-num" data-div-to type="number" step="0.1" value="' + tnaEsc(d.hcpTo) + '" placeholder="до">' +
            '<select class="form-input" data-div-gender>' +
            tnaGenderOptions(d.gender) + '</select>' +
            '<button class="btn btn-og btn-sm" data-div-del><i class="fas fa-times"></i></button>' +
            '</div>';
    }).join('');
    return '<div class="card">' +
        '<h2><i class="fas fa-gear"></i> ' + tnaL('Новый турнир', 'New tournament') + '</h2>' +
        '<div class="tna-form">' +
        '<div class="form-group"><label>' + tnaL('Название *', 'Name *') + '</label>' +
        '<input id="tna-name" class="form-input" value="' + tnaEsc(t.name || '') + '" placeholder="' + tnaL('Например, Кубок клуба 2026', 'e.g. Club Cup 2026') + '"></div>' +
        '<div class="form-group"><label>' + tnaL('Дата *', 'Date *') + '</label>' +
        '<input id="tna-date" type="date" class="form-input" value="' + tnaEsc(t.date || tnaToday()) + '"></div>' +
        '<div class="form-group"><label>' + tnaL('Описание', 'Description') + '</label>' +
        '<input id="tna-desc" class="form-input" value="' + tnaEsc(t.description || '') + '"></div>' +
        '</div>' +
        '<h3>' + tnaL('Формат', 'Format') + '</h3>' +
        '<div class="tna-radio-row">' +
        '<label class="tna-radio"><input type="radio" name="tna-scoring" value="stroke"' + (cfg.scoring !== 'stableford' ? ' checked' : '') + '> ' + tnaL('Stroke Play (удары)', 'Stroke Play (strokes)') + '</label>' +
        '<label class="tna-radio"><input type="radio" name="tna-scoring" value="stableford"' + (cfg.scoring === 'stableford' ? ' checked' : '') + '> ' + tnaL('Stableford (очки)', 'Stableford (points)') + '</label>' +
        '</div>' +
        '<div class="tna-radio-row" id="tna-netmode-row"' + (cfg.scoring === 'stableford' ? ' style="opacity:.45;pointer-events:none"' : '') + '>' +
        '<label>' + tnaL('Основные места по:', 'Main standings by:') + '</label>' +
        '<label class="tna-radio"><input type="radio" name="tna-netmode" value="net"' + (cfg.netMode !== 'gross' ? ' checked' : '') + '> Net</label>' +
        '<label class="tna-radio"><input type="radio" name="tna-netmode" value="gross"' + (cfg.netMode === 'gross' ? ' checked' : '') + '> Gross</label>' +
        '</div>' +
        '<label class="tna-check"><input type="checkbox" id="tna-gendersplit"' + (cfg.genderSplit ? ' checked' : '') + '> ' + tnaL('Отдельный зачёт мужчин и женщин', 'Separate men / women standings') + '</label>' +
        '<div class="form-group tna-inline"><label>' + tnaL('Призовых мест в номинациях и дивизионах', 'Prize places in nominations & divisions') + '</label>' +
        '<input id="tna-prizeplaces" type="number" min="1" max="10" class="form-input tna-num" value="' + (cfg.prizePlaces || 3) + '"></div>' +
        '<h3>' + tnaL('Дивизионы по гандикапу', 'Handicap divisions') + '</h3>' +
        '<p class="tna-hint">' + tnaL('Пустой «до» — без верхнего предела. Дивизионы дают отдельные призовые места.', 'Empty "to" means no upper limit. Divisions give separate prizes.') + '</p>' +
        '<div class="tna-div-head"><span>' + tnaL('Название', 'Name') + '</span><span>HCP от</span><span>HCP до</span><span>' + tnaL('Пол', 'Gender') + '</span><span></span></div>' +
        '<div id="tna-divs">' + divs + '</div>' +
        '<button class="btn btn-og btn-sm" id="tna-div-add"><i class="fas fa-plus"></i> ' + tnaL('Добавить дивизион', 'Add division') + '</button>' +
        '<div class="tna-actions">' +
        '<button class="btn btn-g" id="tna-save-settings"><i class="fas fa-save"></i> ' + tnaL('Сохранить и продолжить', 'Save & continue') + '</button>' +
        '</div></div>';
}

function tnaGenderOptions(sel) {
    var opts = [['all', tnaL('Все', 'All')], ['men', tnaL('Мужчины', 'Men')], ['women', tnaL('Женщины', 'Women')]];
    return opts.map(function (o) {
        return '<option value="' + o[0] + '"' + ((sel || 'all') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
}

function tnaBindSettings() {
    var el = function (id) { return document.getElementById(id); };
    var save = el('tna-save-settings');
    if (save) save.onclick = function () { tnaSaveSettings(); };
    var add = el('tna-div-add');
    if (add) add.onclick = function () {
        var box = el('tna-divs');
        var i = box ? box.children.length : 0;
        var row = document.createElement('div');
        row.className = 'tna-div-row';
        row.setAttribute('data-div', String(i));
        row.innerHTML = '<input class="form-input" data-div-name value="" placeholder="' + tnaL('Название', 'Name') + '">' +
            '<input class="form-input tna-num" data-div-from type="number" step="0.1" value="" placeholder="от">' +
            '<input class="form-input tna-num" data-div-to type="number" step="0.1" value="" placeholder="до">' +
            '<select class="form-input" data-div-gender>' + tnaGenderOptions('all') + '</select>' +
            '<button class="btn btn-og btn-sm" data-div-del><i class="fas fa-times"></i></button>';
        if (box) box.appendChild(row);
        tnaBindDivisionDel(row);
    };
    var rows = el('tna-divs') ? el('tna-divs').querySelectorAll('.tna-div-row') : [];
    rows.forEach(function (r) { tnaBindDivisionDel(r); });
    // Переключение формата гаси блок Net/Gross
    var rads = document.querySelectorAll('input[name="tna-scoring"]');
    rads.forEach(function (r) {
        r.onchange = function () {
            var row = el('tna-netmode-row');
            if (row) row.style.cssText = r.value === 'stableford' ? 'opacity:.45;pointer-events:none' : '';
        };
    });
}

function tnaBindDivisionDel(row) {
    var btn = row.querySelector('[data-div-del]');
    if (btn) btn.onclick = function () { row.remove(); };
}

function tnaCollectSettings() {
    var el = function (id) { return document.getElementById(id); };
    var name = el('tna-name') ? el('tna-name').value.trim() : '';
    var date = el('tna-date') ? el('tna-date').value : '';
    var desc = el('tna-desc') ? el('tna-desc').value.trim() : '';
    var scoring = 'stroke';
    var sc = document.querySelector('input[name="tna-scoring"]:checked');
    if (sc) scoring = sc.value;
    var netMode = 'net';
    var nm = document.querySelector('input[name="tna-netmode"]:checked');
    if (nm) netMode = nm.value;
    var genderSplit = !!(el('tna-gendersplit') && el('tna-gendersplit').checked);
    var prizePlaces = parseInt(el('tna-prizeplaces') ? el('tna-prizeplaces').value : '3', 10) || 3;
    var divisions = [];
    var box = el('tna-divs');
    if (box) {
        box.querySelectorAll('.tna-div-row').forEach(function (row) {
            var dName = (row.querySelector('[data-div-name]') || {}).value || '';
            var from = (row.querySelector('[data-div-from]') || {}).value;
            var to = (row.querySelector('[data-div-to]') || {}).value;
            var gender = (row.querySelector('[data-div-gender]') || {}).value || 'all';
            if (!String(dName).trim() && from === '' && to === '') return;
            divisions.push({
                id: 'd' + (divisions.length + 1) + '_' + Date.now().toString(36),
                name: String(dName).trim() || ('Дивизион ' + (divisions.length + 1)),
                hcpFrom: from === '' ? '' : parseFloat(from),
                hcpTo: to === '' ? '' : parseFloat(to),
                gender: gender
            });
        });
    }
    return {
        name: name, date: date, description: desc,
        cfg: { scoring: scoring, netMode: netMode, genderSplit: genderSplit, prizePlaces: prizePlaces, divisions: divisions }
    };
}

function tnaSaveSettings() {
    var d = tnaDb();
    if (!d) { toast(tnaL('⚠️ Нет соединения с базой', '⚠️ No database connection'), 'error'); return; }
    var core = tnaCore();
    var collected = tnaCollectSettings();
    if (!collected.name) { toast(tnaL('⚠️ Укажите название турнира', '⚠️ Enter the tournament name'), 'error'); return; }
    if (!collected.date) { toast(tnaL('⚠️ Укажите дату', '⚠️ Enter the date'), 'error'); return; }
    var cfg = core.normalizeConfig(collected.cfg);
    var errors = core.validateConfig(cfg);
    if (errors.length) {
        toast(tnaL('⚠️ Проверьте дивизионы: «от» больше «до»', '⚠️ Check divisions: "from" is greater than "to"'), 'error');
        return;
    }
    var patch = {
        name: collected.name,
        nameEn: collected.name,
        date: collected.date,
        description: collected.description,
        cfg: cfg,
        divisions: cfg.divisions,
        formats: cfg.scoring === 'stableford' ? ['Stableford']
            : (cfg.netMode === 'gross' ? ['Stroke Play (Gross)'] : ['Stroke Play (Net)']),
        tees: ['wh', 'bl', 'rd'],
        updatedAt: Date.now()
    };
    tnaState.cfg = cfg;
    tnaState.dirty = true;
    tnaSaveTournament(patch, function () {
        tnaState.step = 2;
        tnaRender();
        toast(tnaL('✅ Турнир сохранён — добавьте участников', '✅ Tournament saved — now add players'), 'success');
    });
}

// ============================================================
// СОХРАНЕНИЕ ТУРНИРА
// ============================================================
function tnaSaveTournament(patch, done) {
    var d = tnaDb();
    if (!d) { if (done) done(new Error('no db')); return; }
    if (tnaState.saving) { if (done) done(new Error('busy')); return; }
    tnaState.saving = true;
    var ref = tnaState.tnId ? d.ref('tournaments/' + tnaState.tnId) : d.ref('tournaments').push();
    if (!tnaState.tnId) {
        tnaState.tnId = ref.key;
        patch.source = 'tn-admin';
        patch.status = patch.status || 'upcoming';
        patch.isPublic = true;
        patch.createdAt = Date.now();
        patch.createdBy = tnaActor();
    }
    ref.update(patch).then(function () {
        tnaState.saving = false;
        tnaState.dirty = false;
        if (done) done(null);
    }).catch(function (err) {
        tnaState.saving = false;
        console.warn('[tn-admin] save', err);
        toast(tnaL('⚠️ Не удалось сохранить: ', '⚠️ Save failed: ') + (err && err.message || err), 'error');
        if (done) done(err);
    });
}

function tnaActor() {
    try {
        if (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.name) return currentUserData.name;
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) return currentUser.email;
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) return currentUser.uid;
    } catch (e) {}
    return tnaL('Администратор', 'Admin');
}

// ============================================================
// СПИСОК / ОТКРЫТИЕ / УДАЛЕНИЕ
// ============================================================
function tnaCreateTournament() {
    tnaUnbindAll();
    tnaState.view = 'workspace';
    tnaState.tnId = null;
    tnaState.tn = null;
    tnaState.step = 1;
    tnaState.players = [];
    tnaState.results = {};
    tnaState.protocol = null;
    var core = tnaCore();
    tnaState.cfg = core ? core.defaultConfig() : null;
    tnaRender();
}

function tnaOpenTournament(id) {
    if (!id) return;
    tnaUnbindAll();
    tnaState.view = 'workspace';
    tnaState.tnId = id;
    tnaState.step = 1;
    tnaState.players = [];
    tnaState.results = {};
    tnaState.protocol = null;
    var d = tnaDb();
    if (!d) { tnaRender(); return; }
    // Турнир
    tnaBind('tn', 'tournaments/' + id, function (snap) {
        tnaState.tn = (snap && snap.val) ? (snap.val() || {}) : null;
        var core = tnaCore();
        if (core) {
            tnaState.cfg = core.normalizeConfig(tnaState.tn && tnaState.tn.cfg);
            tnaState.players = core.normalizePlayers(tnaState.tn && tnaState.tn.registeredPlayers);
        }
        if (tnaState.view === 'workspace') tnaRender();
    });
    // Раунды турнира (для авто-результатов и автозавершения)
    tnaBind('rounds', 'rounds', function (snap) {
        tnaState.rounds = (snap && snap.val) ? (snap.val() || {}) : {};
        if (tnaState.view === 'workspace' && (tnaState.step === 4 || tnaState.step === 5)) tnaRender();
        // Страховка автозавершения: все раунды завершены → турнир завершён.
        if (typeof pestovoAutoFinishTournament === 'function') {
            try { pestovoAutoFinishTournament(tnaState.tnId); } catch (e) {}
        }
    });
    // Стартовые протоколы (игровые группы для протокола)
    tnaBind('protocols', 'protocols', function (snap) {
        tnaState.protocols = (snap && snap.val) ? (snap.val() || {}) : {};
        if (tnaState.view === 'workspace' && tnaState.step === 5) tnaRender();
    });
    tnaRender();
}

function tnaOpenList() {
    tnaUnbindAll();
    tnaState.view = 'list';
    tnaState.tnId = null;
    tnaState.tn = null;
    tnaState.players = [];
    tnaState.results = {};
    tnaState.protocol = null;
    tnaBindList();
    tnaRender();
}

function tnaDeleteTournament() {
    var d = tnaDb();
    if (!d || !tnaState.tnId) return;
    var t = tnaState.tn || {};
    var msg = tnaL(
        'Удалить турнир «' + (t.name || '') + '»?\n\nВместе с ним удалятся все его раунды и стартовые протоколы. Действие необратимо.',
        'Delete tournament "' + (t.name || '') + '"?\n\nAll its rounds and start protocols will be deleted too. This cannot be undone.');
    if (!confirm(msg)) return;
    var tnId = tnaState.tnId;
    // Каскад: раунды с tournamentId + привязанные через протоколы групп.
    var updates = {};
    updates['tournaments/' + tnId] = null;
    Object.keys(tnaState.rounds || {}).forEach(function (rid) {
        if (String(tnaState.rounds[rid].tournamentId || '') === String(tnId)) updates['rounds/' + rid] = null;
    });
    Object.keys(tnaState.protocols || {}).forEach(function (pid) {
        var doc = tnaState.protocols[pid] || {};
        if (String(doc.tournamentId || '') === String(tnId)) updates['protocols/' + pid] = null;
    });
    d.ref().update(updates).then(function () {
        toast(tnaL('🗑 Турнир удалён', '🗑 Tournament deleted'), 'info');
        tnaOpenList();
    }).catch(function (err) {
        console.warn('[tn-admin] delete', err);
        toast(tnaL('⚠️ Ошибка удаления: ', '⚠️ Delete failed: ') + (err && err.message || err), 'error');
    });
}

// ============================================================
// ШАГ 2 — УЧАСТНИКИ
// ============================================================
function tnaPlayersHtml() {
    var rows = tnaState.players.map(function (p, i) {
        var fh = tnaFieldHcpOf(p);
        return '<tr data-pid="' + tnaEsc(p.pid) + '">' +
            '<td class="tna-num">' + (i + 1) + '</td>' +
            '<td><input class="form-input tna-cell" data-f="name" value="' + tnaEsc(p.name) + '"></td>' +
            '<td><input class="form-input tna-cell tna-num" data-f="handicap" type="number" step="0.1" value="' + (p.handicap == null ? '' : p.handicap) + '"></td>' +
            '<td class="tna-num">' + (fh == null ? '—' : fh) + '</td>' +
            '<td><select class="form-input tna-cell" data-f="gender">' +
            '<option value="men"' + (p.gender === 'men' ? ' selected' : '') + '>' + tnaL('М', 'M') + '</option>' +
            '<option value="women"' + (p.gender === 'women' ? ' selected' : '') + '>' + tnaL('Ж', 'W') + '</option>' +
            '</select></td>' +
            '<td><select class="form-input tna-cell" data-f="tee">' + tnaTeeOptions(p.tee) + '</select></td>' +
            '<td><select class="form-input tna-cell" data-f="status">' +
            '<option value="ACTIVE"' + (p.status === 'ACTIVE' ? ' selected' : '') + '>' + tnaL('В игре', 'Active') + '</option>' +
            '<option value="DNS"' + (p.status === 'DNS' ? ' selected' : '') + '>DNS</option>' +
            '<option value="DQ"' + (p.status === 'DQ' ? ' selected' : '') + '>DQ</option>' +
            '</select></td>' +
            '<td><button class="btn btn-og btn-sm" data-del><i class="fas fa-times"></i></button></td>' +
            '</tr>';
    }).join('');
    return '<div class="card">' +
        '<h2><i class="fas fa-users"></i> ' + tnaL('Участники', 'Players') +
        ' <span class="tna-count">' + tnaState.players.length + '</span></h2>' +
        '<div class="tna-add-row">' +
        '<div class="tna-add-manual">' +
        '<input id="tna-add-fio" class="form-input" placeholder="' + tnaL('ФИО (Иванов Иван Петрович)', 'Full name') + '">' +
        '<input id="tna-add-hcp" class="form-input tna-num" type="number" step="0.1" placeholder="' + tnaL('Гандикап', 'Handicap') + '">' +
        '<select id="tna-add-gender" class="form-input"><option value="men">' + tnaL('Мужчина', 'Men') + '</option><option value="women">' + tnaL('Женщина', 'Women') + '</option></select>' +
        '<select id="tna-add-tee" class="form-input">' + tnaTeeOptions('wh') + '</select>' +
        '<button class="btn btn-g" id="tna-add-btn"><i class="fas fa-plus"></i> ' + tnaL('Добавить', 'Add') + '</button>' +
        '</div>' +
        '<div class="tna-add-tools">' +
        '<div class="tna-db-search"><input id="tna-db-q" class="form-input" placeholder="' + tnaL('Найти в базе игроков клуба…', 'Search club players…') + '">' +
        '<div id="tna-db-results" class="tna-db-results"></div></div>' +
        '<div class="tna-import">' +
        '<label class="btn btn-og"><i class="fas fa-file-excel"></i> ' + tnaL('Импорт Excel/CSV', 'Import Excel/CSV') +
        '<input type="file" id="tna-import-file" accept=".csv,.xlsx,.xls,text/csv" class="hidden"></label>' +
        '<button class="btn btn-og btn-sm" id="tna-import-tpl"><i class="fas fa-download"></i> ' + tnaL('Шаблон', 'Template') + '</button>' +
        '<span class="tna-hint">' + tnaL('Колонки: ФИО · Гандикап · Пол · Ти', 'Columns: Full name · Handicap · Gender · Tee') + '</span>' +
        '</div>' +
        '</div></div>' +
        (tnaState.players.length
            ? '<div class="tna-table-wrap"><table class="tna-table"><thead><tr>' +
              '<th class="tna-num">#</th><th>' + tnaL('Игрок', 'Player') + '</th><th class="tna-num">HCP</th>' +
              '<th class="tna-num">' + tnaL('Игр. HCP', 'Playing HCP') + '</th><th>' + tnaL('Пол', 'Gender') + '</th>' +
              '<th>' + tnaL('Ти', 'Tee') + '</th><th>' + tnaL('Статус', 'Status') + '</th><th></th>' +
              '</tr></thead><tbody>' + rows + '</tbody></table></div>'
            : '<div class="tna-empty"><i class="fas fa-user-plus"></i><p>' +
              tnaL('Добавьте участников вручную, из базы клуба или импортом из Excel/CSV.', 'Add players manually, from the club database or via Excel/CSV import.') +
              '</p></div>') +
        '<div class="tna-actions">' +
        '<button class="btn btn-g" id="tna-save-players"><i class="fas fa-save"></i> ' + tnaL('Сохранить состав', 'Save roster') + '</button>' +
        '<span class="tna-hint" id="tna-players-hint"></span>' +
        '</div></div>';
}

function tnaTeeOptions(sel) {
    var tees = (typeof TEES !== 'undefined') ? TEES : { wh: 'Белые', bl: 'Синие', rd: 'Красные', bk: 'Чёрные' };
    return Object.keys(tees).map(function (k) {
        return '<option value="' + k + '"' + ((sel || 'wh') === k ? ' selected' : '') + '>' + tees[k] + '</option>';
    }).join('');
}

function tnaFieldHcpOf(p) {
    if (!p || p.handicap == null) return null;
    if (typeof getFieldHcp !== 'function') return Math.round(p.handicap);
    try { return getFieldHcp(p.handicap, p.tee || 'wh', p.gender || 'men'); } catch (e) { return null; }
}

function tnaBindPlayers() {
    var el = function (id) { return document.getElementById(id); };
    var add = el('tna-add-btn');
    if (add) add.onclick = function () {
        var fio = el('tna-add-fio').value.trim();
        if (!fio) { toast(tnaL('⚠️ Введите ФИО', '⚠️ Enter a name'), 'error'); return; }
        var core = tnaCore();
        var p = core.normalizePlayer({
            name: fio,
            handicap: el('tna-add-hcp').value,
            gender: el('tna-add-gender').value,
            tee: el('tna-add-tee').value,
            source: 'manual'
        }, tnaState.players.length);
        if (tnaPlayerExists(p.name)) { toast(tnaL('⚠️ Уже в списке', '⚠️ Already in the list'), 'warn'); return; }
        tnaState.players.push(p);
        el('tna-add-fio').value = '';
        el('tna-add-hcp').value = '';
        tnaRender();
    };
    // Правка ячеек таблицы
    var body = document.querySelector('.tna-table tbody');
    if (body) {
        body.querySelectorAll('tr').forEach(function (tr) {
            var pid = tr.getAttribute('data-pid');
            var player = null;
            tnaState.players.forEach(function (p) { if (p.pid === pid) player = p; });
            if (!player) return;
            tr.querySelectorAll('[data-f]').forEach(function (inp) {
                var f = inp.getAttribute('data-f');
                var ev = (inp.tagName === 'SELECT') ? 'change' : 'change';
                inp.addEventListener(ev, function () {
                    if (f === 'name') player.name = inp.value.trim() || player.name;
                    else if (f === 'handicap') player.handicap = inp.value === '' ? null : parseFloat(inp.value);
                    else if (f === 'gender') player.gender = inp.value;
                    else if (f === 'tee') player.tee = inp.value;
                    else if (f === 'status') player.status = inp.value;
                    tnaMarkPlayersDirty();
                    // Пересчёт игрового гандикапа в строке
                    var fhCell = tr.children[3];
                    if (fhCell) fhCell.textContent = (tnaFieldHcpOf(player) == null ? '—' : tnaFieldHcpOf(player));
                });
            });
            var del = tr.querySelector('[data-del]');
            if (del) del.onclick = function () {
                tnaState.players = tnaState.players.filter(function (p) { return p.pid !== pid; });
                tnaMarkPlayersDirty();
                tnaRender();
            };
        });
    }
    var save = el('tna-save-players');
    if (save) save.onclick = function () { tnaSavePlayers(); };
    // Поиск по базе клуба
    var q = el('tna-db-q');
    if (q) {
        var timer = null;
        q.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(function () { tnaRenderDbResults(q.value.trim()); }, 200);
        });
    }
    // Импорт
    var file = el('tna-import-file');
    if (file) file.onchange = function () { tnaImportFile(file.files && file.files[0]); };
    var tpl = el('tna-import-tpl');
    if (tpl) tpl.onclick = function () {
        var core = tnaCore();
        tnaDownload('players-template.csv', 'text/csv;charset=utf-8', core.importTemplateCsv());
    };
}

function tnaMarkPlayersDirty() {
    tnaState.dirty = true;
    var hint = document.getElementById('tna-players-hint');
    if (hint) hint.textContent = tnaL('Есть несохранённые изменения', 'Unsaved changes');
}

function tnaPlayerExists(name) {
    var norm = function (s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); };
    var n = norm(name);
    return tnaState.players.some(function (p) { return norm(p.name) === n; });
}

function tnaSavePlayers() {
    var d = tnaDb();
    if (!d || !tnaState.tnId) { toast(tnaL('⚠️ Сначала сохраните турнир (шаг 1)', '⚠️ Save the tournament first (step 1)'), 'error'); return; }
    if (!tnaState.players.length) { toast(tnaL('⚠️ Добавьте хотя бы одного участника', '⚠️ Add at least one player'), 'error'); return; }
    var core = tnaCore();
    var out = {};
    tnaState.players.forEach(function (p) {
        var np = core.normalizePlayer(p, 0);
        np.pid = p.pid;
        out[p.pid] = np;
    });
    tnaSaveTournament({ registeredPlayers: out, playersCount: tnaState.players.length }, function (err) {
        if (err) return;
        toast(tnaL('✅ Состав сохранён (' + tnaState.players.length + ')', '✅ Roster saved (' + tnaState.players.length + ')'), 'success');
        tnaState.step = 3;
        tnaRender();
    });
}

// ---------- База игроков клуба ----------
function tnaLoadUsers(cb) {
    var d = tnaDb();
    if (!d) { cb({}); return; }
    if (tnaState.users) { cb(tnaState.users); return; }
    if (tnaState.usersLoading) { tnaState.usersWaiters.push(cb); return; }
    tnaState.usersLoading = true;
    d.ref('users').once('value').then(function (snap) {
        tnaState.users = (snap && snap.val) ? (snap.val() || {}) : {};
        tnaState.usersLoading = false;
        var w = tnaState.usersWaiters; tnaState.usersWaiters = [];
        cb(tnaState.users);
        w.forEach(function (f) { try { f(tnaState.users); } catch (e) {} });
    }).catch(function () {
        tnaState.users = {};
        tnaState.usersLoading = false;
        var w = tnaState.usersWaiters; tnaState.usersWaiters = [];
        cb({});
        w.forEach(function (f) { try { f(tnaState.users); } catch (e) {} });
    });
}

function tnaUserLabel(u) {
    var parts = (typeof resolvePlayerNameParts === 'function') ? resolvePlayerNameParts(u) : u;
    return [parts.lastName, parts.firstName, parts.middleName].filter(function (w) { return !!w; }).join(' ');
}

function tnaRenderDbResults(query) {
    var box = document.getElementById('tna-db-results');
    if (!box) return;
    if (!query || query.length < 2) { box.innerHTML = ''; return; }
    tnaLoadUsers(function (users) {
        var norm = function (s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); };
        var q = norm(query);
        var found = [];
        Object.keys(users).forEach(function (uid) {
            var u = users[uid] || {};
            var label = tnaUserLabel(u);
            if (norm(label).indexOf(q) !== -1 || norm(u.name || '').indexOf(q) !== -1) {
                found.push({ uid: uid, u: u, label: label });
            }
        });
        found = found.slice(0, 8);
        box.innerHTML = found.map(function (f) {
            var hcp = (f.u.handicap == null ? '—' : f.u.handicap);
            var inList = tnaPlayerExists(f.label);
            return '<div class="tna-db-row" data-uid="' + tnaEsc(f.uid) + '">' +
                '<span>' + tnaEsc(f.label) + ' <small>HCP ' + tnaEsc(hcp) + '</small></span>' +
                (inList ? '<span class="tna-hint">✓</span>'
                    : '<button class="btn btn-og btn-sm" data-db-add="' + tnaEsc(f.uid) + '"><i class="fas fa-plus"></i></button>') +
                '</div>';
        }).join('') || '<div class="tna-hint">' + tnaL('Никого не найдено', 'Nobody found') + '</div>';
        box.querySelectorAll('[data-db-add]').forEach(function (btn) {
            btn.onclick = function () {
                var uid = btn.getAttribute('data-db-add');
                var u = users[uid] || {};
                var label = tnaUserLabel(u);
                var core = tnaCore();
                var p = core.normalizePlayer({
                    pid: uid, name: label, handicap: u.handicap,
                    gender: u.gender, tee: (typeof psDefaultTeeFor === 'function' ? psDefaultTeeFor(u.gender, u.handicap) : 'wh'),
                    source: 'db'
                }, tnaState.players.length);
                if (tnaPlayerExists(p.name)) { toast(tnaL('⚠️ Уже в списке', '⚠️ Already in the list'), 'warn'); return; }
                tnaState.players.push(p);
                tnaMarkPlayersDirty();
                tnaRender();
            };
        });
    });
}

// ---------- Импорт Excel/CSV ----------
function tnaImportFile(file) {
    if (!file) return;
    var core = tnaCore();
    var name = String(file.name || '').toLowerCase();
    var isCsv = /\.csv$/.test(name) || /text\/csv/.test(file.type || '');
    var reader = new FileReader();
    reader.onload = function () {
        var parsed;
        try {
            if (isCsv) {
                parsed = core.parseImport(String(reader.result || ''));
            } else {
                if (typeof XLSX === 'undefined') {
                    toast(tnaL('⚠️ Библиотека Excel ещё грузится, попробуйте снова', '⚠️ Excel library is still loading, try again'), 'error');
                    return;
                }
                var wb = XLSX.read(reader.result, { type: 'array' });
                var ws = wb.Sheets[wb.SheetNames[0]];
                var json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
                parsed = core.parseImport(json);
            }
        } catch (err) {
            console.warn('[tn-admin] import', err);
            toast(tnaL('⚠️ Не удалось разобрать файл', '⚠️ Could not parse the file'), 'error');
            return;
        }
        var added = 0, skipped = 0;
        parsed.players.forEach(function (p) {
            if (tnaPlayerExists(p.name)) { skipped++; return; }
            p.pid = 'imp_' + Date.now().toString(36) + '_' + added;
            tnaState.players.push(p);
            added++;
        });
        tnaMarkPlayersDirty();
        tnaRender();
        var msg = tnaL('📥 Добавлено: ' + added + (skipped ? ', пропущено (дубли/ошибки): ' + (skipped + parsed.issues.length) : ''),
            '📥 Added: ' + added + (skipped ? ', skipped: ' + (skipped + parsed.issues.length) : ''));
        toast(msg, 'success');
    };
    if (isCsv) reader.readAsText(file, 'utf-8');
    else reader.readAsArrayBuffer(file);
}

// ============================================================
// ШАГ 3 — СТАРТ (переиспользуемый стартовый лист)
// ============================================================
function tnaStartHtml(t) {
    var started = !!(t && (t.status === 'active' || t.status === 'completed'));
    return '<div class="card">' +
        '<h2><i class="fas fa-flag-checkered"></i> ' + tnaL('Стартовый лист', 'Tee sheet') + '</h2>' +
        '<p class="tna-hint">' + tnaL(
            'Выберите турнир в блоке ниже, проверьте группы, ТИ, время и маркеров — и сохраните. Система создаст раунды и QR-карточки для ввода счёта (механика прежняя).',
            'Pick the tournament below, check groups, tees, times and markers — then save. Rounds and QR scorecards are created (same mechanics as before).') + '</p>' +
        '<div class="tna-actions">' +
        '<button class="btn btn-og btn-sm" id="tna-start-refresh"><i class="fas fa-rotate"></i> ' + tnaL('Обновить стартовый лист', 'Refresh tee sheet') + '</button>' +
        (started ? '<span class="tna-badge tna-b-ac">' + tnaL('Турнир идёт', 'Live') + '</span>' : '') +
        '</div>' +
        '<div id="tab-start-content"></div>' +
        '</div>' +
        '<div class="card" id="pe-card">' +
        '<h2><i class="fas fa-pen-to-square"></i> ' + tnaL('Быстрое редактирование протокола', 'Quick protocol editor') + '</h2>' +
        '<div class="form-group"><label>' + tnaL('Турнир', 'Tournament') + '</label>' +
        '<select id="pe-tn-select" class="form-input"><option value="">' + tnaL('— выберите турнир —', '— pick a tournament —') + '</option></select></div>' +
        '<div style="font-size:12px;color:var(--muted);margin-bottom:6px">' + tnaL(
            'Группы, стартовые лунки и время, ТИ, маркеры, HCP и пол. Сохранение обновляет раунды, QR-карточки и протокол одновременно.',
            'Groups, start holes and times, tees, markers, HCP and gender. Saving updates rounds, QR cards and the protocol at once.') + '</div>' +
        '<div id="pe-editor"></div>' +
        '</div>';
}

function tnaBindStart() {
    var refresh = document.getElementById('tna-start-refresh');
    if (refresh) refresh.onclick = function () { tnaMountStart(); };
    tnaMountStart();
}

function tnaMountStart() {
    // Стартовый лист — модуль js/start-admin.js (тот же, что и раньше).
    try {
        if (typeof psOpen === 'function') {
            psOpen();
            // Сразу выбираем наш турнир в его выпадающем списке.
            if (tnaState.tnId && typeof psOnTournamentChange === 'function') {
                setTimeout(function () {
                    try {
                        var sel = document.getElementById('ps-tn-select') || document.querySelector('#tab-start-content select');
                        if (sel) {
                            sel.value = tnaState.tnId;
                            if (typeof psOnTournamentChange === 'function') psOnTournamentChange(tnaState.tnId);
                        }
                    } catch (e) { console.warn('[tn-admin] preselect', e); }
                }, 400);
            }
        }
    } catch (e) { console.warn('[tn-admin] start mount', e); }
    // Быстрый редактор протокола — js/pe-edit.js
    try {
        if (typeof peInit === 'function') peInit();
    } catch (e) { console.warn('[tn-admin] pe mount', e); }
}

// ============================================================
// ШАГ 4 — РЕЗУЛЬТАТЫ
// ============================================================
function tnaRoundsOfTournament() {
    var out = {};
    Object.keys(tnaState.rounds || {}).forEach(function (rid) {
        var r = tnaState.rounds[rid] || {};
        if (String(r.tournamentId || '') === String(tnaState.tnId)) out[rid] = r;
    });
    return out;
}

function tnaResultsHtml() {
    var rounds = tnaRoundsOfTournament();
    var hasRounds = Object.keys(rounds).length > 0;
    var autoTab = tnaState.resultsMode !== 'manual';
    var tabs = '<div class="tna-tabs">' +
        '<button class="tna-tab' + (autoTab ? ' active' : '') + '" data-tna-rmode="auto"' + (hasRounds ? '' : ' disabled') + '>' +
        tnaL('Из раундов (live)', 'From rounds (live)') + '</button>' +
        '<button class="tna-tab' + (!autoTab ? ' active' : '') + '" data-tna-rmode="manual">' +
        tnaL('Вручную', 'Manual entry') + '</button></div>';
    var body = autoTab ? tnaAutoResultsHtml(rounds) : tnaManualResultsHtml();
    return '<div class="card"><h2><i class="fas fa-list-ol"></i> ' + tnaL('Результаты', 'Results') + '</h2>' +
        tabs + body + '</div>';
}

function tnaAutoResultsHtml(rounds) {
    var rows = tnaRowsFromRounds(rounds);
    if (!rows.length) {
        return '<div class="tna-empty"><i class="fas fa-clock"></i><p>' +
            tnaL('Раундов пока нет — создайте стартовый лист на шаге 3 или введите результаты вручную.',
                'No rounds yet — create a tee sheet at step 3 or enter results manually.') + '</p></div>';
    }
    return '<div class="tna-table-wrap"><table class="tna-table"><thead><tr>' +
        '<th class="tna-num">#</th><th>' + tnaL('Игрок', 'Player') + '</th><th class="tna-num">HCP</th>' +
        '<th class="tna-num">' + tnaL('Игр. HCP', 'Playing HCP') + '</th><th class="tna-num">' + tnaL('Лунки', 'Thru') + '</th>' +
        '<th class="tna-num">Gross</th><th class="tna-num">Net</th><th class="tna-num">Stbl</th><th>' + tnaL('Статус', 'Status') + '</th>' +
        '</tr></thead><tbody>' + rows.map(function (r) {
            return '<tr' + (r.position != null && r.position <= (tnaState.cfg ? tnaState.cfg.prizePlaces : 3) ? ' class="tna-prize"' : '') + '>' +
                '<td class="tna-num">' + (r.position == null ? '—' : r.position) + '</td>' +
                '<td>' + tnaEsc(r.name) + '</td>' +
                '<td class="tna-num">' + (r.handicap == null ? '—' : r.handicap) + '</td>' +
                '<td class="tna-num">' + (r.fieldHcp == null ? '—' : r.fieldHcp) + '</td>' +
                '<td class="tna-num">' + (r.holesPlayed || 0) + '</td>' +
                '<td class="tna-num">' + (r.gross == null ? '—' : r.gross) + '</td>' +
                '<td class="tna-num">' + (r.net == null ? '—' : r.net) + '</td>' +
                '<td class="tna-num">' + (r.stableford == null ? '—' : r.stableford) + '</td>' +
                '<td>' + tnaEsc(r.status) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="tna-hint">' + tnaL('Таблица обновляется автоматически по мере ввода счёта маркерами.',
            'The table updates automatically as markers enter scores.') + '</p>';
}

function tnaManualResultsHtml() {
    var cfg = tnaState.cfg || {};
    var stable = cfg.scoring === 'stableford';
    var rows = tnaState.players.map(function (p, i) {
        var r = tnaState.results[p.pid] || { mode: 'total', status: 'ACTIVE' };
        var holes = r.holes || {};
        var holesCells = '';
        for (var h = 1; h <= 18; h++) {
            holesCells += '<input class="form-input tna-hole" data-hole="' + h + '" data-pid="' + tnaEsc(p.pid) + '" value="' + (holes[h] == null ? '' : tnaEsc(holes[h])) + '" placeholder="' + (typeof holePar === 'function' ? holePar(h) : 4) + '">';
        }
        return '<tr data-pid="' + tnaEsc(p.pid) + '">' +
            '<td class="tna-num">' + (i + 1) + '</td>' +
            '<td>' + tnaEsc(p.name) + '</td>' +
            '<td><select class="form-input tna-cell" data-r="mode">' +
            '<option value="total"' + (r.mode !== 'holes' ? ' selected' : '') + '>' + tnaL('Итог', 'Total') + '</option>' +
            '<option value="holes"' + (r.mode === 'holes' ? ' selected' : '') + '>' + tnaL('По лункам', 'By hole') + '</option>' +
            '</select></td>' +
            '<td><input class="form-input tna-cell tna-num" data-r="gross" type="number" value="' + (r.gross == null ? '' : tnaEsc(r.gross)) + '" placeholder="' + (stable ? '—' : 'Gross') + '"' + (stable ? ' disabled' : '') + '></td>' +
            '<td><input class="form-input tna-cell tna-num" data-r="stableford" type="number" value="' + (r.stableford == null ? '' : tnaEsc(r.stableford)) + '" placeholder="' + (stable ? 'Stbl' : '—') + '"' + (stable ? '' : ' disabled') + '></td>' +
            '<td><select class="form-input tna-cell" data-r="status">' +
            '<option value="ACTIVE"' + ((r.status || 'ACTIVE') === 'ACTIVE' ? ' selected' : '') + '>' + tnaL('В игре', 'Active') + '</option>' +
            '<option value="DNS"' + (r.status === 'DNS' ? ' selected' : '') + '>DNS</option>' +
            '<option value="DQ"' + (r.status === 'DQ' ? ' selected' : '') + '>DQ</option>' +
            '</select></td>' +
            '<td><button class="btn btn-og btn-sm" data-toggle-holes>' + (r.mode === 'holes' ? '▾' : '▸') + '</button></td>' +
            '</tr>' +
            (r.mode === 'holes' ? '<tr class="tna-holes-row"><td colspan="7"><div class="tna-holes">' + holesCells + '</div></td></tr>' : '');
    }).join('');
    return (tnaState.players.length
        ? '<div class="tna-table-wrap"><table class="tna-table"><thead><tr>' +
          '<th class="tna-num">#</th><th>' + tnaL('Игрок', 'Player') + '</th><th>' + tnaL('Ввод', 'Entry') + '</th>' +
          '<th class="tna-num">Gross</th><th class="tna-num">Stbl</th><th>' + tnaL('Статус', 'Status') + '</th><th></th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '<div class="tna-actions"><button class="btn btn-g" id="tna-save-results"><i class="fas fa-save"></i> ' +
          tnaL('Сохранить результаты', 'Save results') + '</button></div>' +
          '<p class="tna-hint">' + tnaL('Net считается автоматически: Gross − игровой гандикап (WHS).',
              'Net is automatic: Gross − playing handicap (WHS).') + '</p>'
        : '<div class="tna-empty"><i class="fas fa-user-plus"></i><p>' +
          tnaL('Сначала добавьте участников на шаге 2.', 'Add players at step 2 first.') + '</p></div>');
}

// Строки протокола из раундов (авто-режим).
function tnaRowsFromRounds(rounds) {
    var core = tnaCore();
    if (!core) return [];
    var fioKey = function (p) {
        try {
            if (typeof getPlayerFioKey === 'function') {
                var k = getPlayerFioKey({
                    name: p.name || '', firstName: p.firstName || '',
                    lastName: p.lastName || '', middleName: p.middleName || ''
                });
                if (k) return k;
            }
        } catch (e) {}
        return String(p.name || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    };
    var agg = {};
    Object.keys(rounds || {}).forEach(function (rid) {
        var r = rounds[rid] || {};
        var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(r.players || {}) : (r.players || {});
        var order = (typeof getRoundOrder === 'function') ? getRoundOrder(r) : null;
        Object.keys(players).forEach(function (pid) {
            var p = players[pid] || {};
            if (typeof isPlayerDeleted === 'function') { try { if (isPlayerDeleted(pid, p.name)) return; } catch (e) {} }
            var stats = null;
            try { stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order); } catch (e) { stats = null; }
            if (!stats || !stats.holesPlayed) return;
            var key = fioKey(p) || pid;
            var row = agg[key];
            if (!row) {
                row = agg[key] = {
                    pid: pid, name: p.name || '—', gender: p.gender || 'men',
                    handicap: (p.exactHcp != null ? p.exactHcp : (p.handicap != null ? p.handicap : null)),
                    tee: p.tee || r.tee || 'wh', status: 'ACTIVE',
                    fieldHcp: (p.fieldHcp != null ? p.fieldHcp : null),
                    gross: 0, net: 0, stableford: 0, holesPlayed: 0, toPar: 0,
                    hasResult: false
                };
            }
            row.gross += stats.gross || 0;
            row.net += stats.net || 0;
            row.stableford += (stats.stablefordField != null ? stats.stablefordField : 0);
            row.holesPlayed += stats.holesPlayed || 0;
            row.toPar = (row.toPar || 0) + (stats.toPar || 0);
            row.hasResult = true;
            var st = String(p.status || '').toUpperCase();
            if (st === 'DQ' || st === 'DNS') row.status = st;
        });
    });
    // Сопоставляем с составом: пишем pid из registeredPlayers, статусы DQ/DNS из состава
    var byFio = {};
    tnaState.players.forEach(function (p) { byFio[fioKey(p)] = p; });
    var rows = [];
    tnaState.players.forEach(function (p) {
        var key = fioKey(p);
        var a = agg[key];
        if (a) {
            a.pid = p.pid;
            a.gender = p.gender;
            a.handicap = (p.handicap != null ? p.handicap : a.handicap);
            a.tee = p.tee || a.tee;
            if (a.fieldHcp == null) a.fieldHcp = tnaFieldHcpOf(p);
            if (p.status === 'DQ' || p.status === 'DNS') a.status = p.status;
            rows.push(a);
        } else if (p.status === 'DQ' || p.status === 'DNS') {
            rows.push({
                pid: p.pid, name: p.name, gender: p.gender, handicap: p.handicap,
                tee: p.tee, status: p.status, fieldHcp: tnaFieldHcpOf(p),
                gross: null, net: null, stableford: null, holesPlayed: 0, hasResult: false
            });
        }
    });
    // Игроки, оказавшиеся в раундах, но не в составе (например, гости на старте)
    var inRoster = {};
    rows.forEach(function (r) { inRoster[fioKey(r)] = true; });
    Object.keys(agg).forEach(function (key) {
        if (inRoster[key]) return;
        if (byFio[key]) return;
        rows.push(agg[key]);
    });
    return core.withPositions(rows, tnaState.cfg || {});
}

function tnaBindResults() {
    var el = function (id) { return document.getElementById(id); };
    document.querySelectorAll('[data-tna-rmode]').forEach(function (btn) {
        btn.onclick = function () {
            tnaState.resultsMode = btn.getAttribute('data-tna-rmode');
            tnaRender();
        };
    });
    var save = el('tna-save-results');
    if (save) save.onclick = function () { tnaSaveResults(); };
    // Правка ручного ввода
    var body = document.querySelector('.tna-table tbody');
    if (body && tnaState.resultsMode === 'manual') {
        body.querySelectorAll('tr[data-pid]').forEach(function (tr) {
            var pid = tr.getAttribute('data-pid');
            tr.querySelectorAll('[data-r]').forEach(function (inp) {
                inp.addEventListener('change', function () { tnaEditResult(pid, inp); });
            });
            var toggle = tr.querySelector('[data-toggle-holes]');
            if (toggle) toggle.onclick = function () { tnaToggleHoles(pid); };
        });
        body.querySelectorAll('input.tna-hole').forEach(function (inp) {
            inp.addEventListener('change', function () { tnaEditHole(inp); });
        });
    }
}

function tnaResultOf(pid) {
    if (!tnaState.results[pid]) tnaState.results[pid] = { mode: 'total', status: 'ACTIVE' };
    return tnaState.results[pid];
}

function tnaEditResult(pid, inp) {
    var f = inp.getAttribute('data-r');
    var r = tnaResultOf(pid);
    if (f === 'mode') { r.mode = inp.value; if (inp.value === 'holes' && !r.holes) r.holes = {}; }
    else if (f === 'gross') r.gross = inp.value === '' ? null : parseInt(inp.value, 10);
    else if (f === 'stableford') r.stableford = inp.value === '' ? null : parseInt(inp.value, 10);
    else if (f === 'status') r.status = inp.value;
    tnaRender();
}

function tnaEditHole(inp) {
    var pid = inp.getAttribute('data-pid');
    var h = parseInt(inp.getAttribute('data-hole'), 10);
    var r = tnaResultOf(pid);
    if (!r.holes) r.holes = {};
    r.holes[h] = inp.value === '' ? null : parseInt(inp.value, 10);
}

function tnaToggleHoles(pid) {
    var r = tnaResultOf(pid);
    r.mode = r.mode === 'holes' ? 'total' : 'holes';
    if (r.mode === 'holes' && !r.holes) r.holes = {};
    tnaRender();
}

function tnaSaveResults() {
    var d = tnaDb();
    if (!d || !tnaState.tnId) return;
    var out = {};
    Object.keys(tnaState.results).forEach(function (pid) {
        var r = tnaState.results[pid];
        var row = { mode: r.mode || 'total', status: r.status || 'ACTIVE', updatedAt: Date.now() };
        if (r.mode === 'holes' && r.holes) {
            var holes = {};
            var any = false;
            for (var h = 1; h <= 18; h++) {
                if (r.holes[h] != null && !isNaN(parseInt(r.holes[h], 10))) { holes[h] = parseInt(r.holes[h], 10); any = true; }
            }
            if (any) row.holes = holes;
        }
        if (r.gross != null) row.gross = r.gross;
        if (r.stableford != null) row.stableford = r.stableford;
        out[pid] = row;
    });
    tnaSaveTournament({ results: out, resultsMode: 'manual' }, function (err) {
        if (err) return;
        toast(tnaL('✅ Результаты сохранены', '✅ Results saved'), 'success');
        tnaState.step = 5;
        tnaRender();
    });
}

// ============================================================
// ШАГ 5 — ПРОТОКОЛ
// ============================================================
function tnaGroupsFromProtocols() {
    var tnId = String(tnaState.tnId || '');
    var best = null, bestTs = -1;
    Object.keys(tnaState.protocols || {}).forEach(function (pid) {
        var doc = tnaState.protocols[pid] || {};
        if (String(doc.tournamentId || '') !== tnId) return;
        var ts = doc.updatedAt || doc.createdAt || 0;
        if (ts >= bestTs) { bestTs = ts; best = doc; }
    });
    if (!best || !Array.isArray(best.groups)) return [];
    var fioKey = function (p) {
        try {
            if (typeof getPlayerFioKey === 'function') {
                var k = getPlayerFioKey({
                    name: p.name || '', firstName: p.firstName || '',
                    lastName: p.lastName || '', middleName: p.middleName || ''
                });
                if (k) return k;
            }
        } catch (e) {}
        return String(p.name || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    };
    var byFio = {};
    tnaState.players.forEach(function (p) { byFio[fioKey(p)] = p.pid; });
    var groups = [];
    best.groups.forEach(function (g, i) {
        var members = Array.isArray(g.members) ? g.members : [];
        var pids = [];
        members.forEach(function (m) {
            var k = fioKey(m || {});
            if (byFio[k]) pids.push(byFio[k]);
        });
        if (pids.length) {
            var startTime = g.startTime ? String(g.startTime) : '';
            groups.push({
                name: tnaL('Группа ' + (i + 1), 'Group ' + (i + 1)) + (startTime ? ' · ' + startTime : ''),
                members: pids
            });
        }
    });
    return groups;
}

function tnaBuildProtocol() {
    var core = tnaCore();
    if (!core) return null;
    var cfg = tnaState.cfg || core.defaultConfig();
    var groups = tnaGroupsFromProtocols();
    var rows;
    if (tnaState.resultsMode === 'manual' || !Object.keys(tnaRoundsOfTournament()).length) {
        // Состав: из базы, а если турнир ещё не сохранён — из черновика шага 2.
        var players = core.normalizePlayers(
            (tnaState.tn && tnaState.tn.registeredPlayers) || tnaState.players);
        rows = players.map(function (p) {
            return core.buildRow(p, (tnaState.tn && tnaState.tn.results && tnaState.tn.results[p.pid]) || tnaState.results[p.pid] || null, cfg, {
                fieldHcp: function (h, tee, g) { return tnaFieldHcpOf({ handicap: h, tee: tee, gender: g }); },
                calcStats: function (scores, fh, eh, order) { return calcRoundStats(scores, fh, eh, order); }
            });
        });
    } else {
        rows = tnaRowsFromRounds(tnaRoundsOfTournament());
    }
    tnaState.protocol = core.assembleProtocol(rows, cfg, groups);
    return tnaState.protocol;
}

function tnaProtocolHtml(t) {
    var p = tnaState.protocol;
    if (!p) {
        try { p = tnaBuildProtocol(); } catch (e) { console.warn('[tn-admin] protocol', e); }
    }
    var published = !!(t && t.protocol && t.protocol.published);
    var head = '<div class="card"><h2><i class="fas fa-file-signature"></i> ' + tnaL('Протокол', 'Protocol') + '</h2>' +
        '<div class="tna-actions">' +
        '<button class="btn btn-g" id="tna-publish"><i class="fas fa-circle-check"></i> ' +
        (published ? tnaL('Обновить опубликованный протокол', 'Update published protocol')
            : tnaL('Опубликовать протокол и завершить', 'Publish protocol & finish')) + '</button>' +
        '<button class="btn btn-og" id="tna-print"><i class="fas fa-print"></i> ' + tnaL('Печать / PDF', 'Print / PDF') + '</button>' +
        '<button class="btn btn-og" id="tna-csv"><i class="fas fa-file-csv"></i> CSV</button>' +
        '<button class="btn btn-og" id="tna-xls"><i class="fas fa-file-excel"></i> Excel</button>' +
        '<button class="btn btn-og" id="tna-link"><i class="fas fa-link"></i> ' + tnaL('Публичная ссылка', 'Public link') + '</button>' +
        (published ? '<span class="tna-badge tna-b-do">' + tnaL('Опубликован', 'Published') + '</span>' : '') +
        '</div>';
    if (!p || !p.rows.length) {
        return head + '<div class="tna-empty"><i class="fas fa-hourglass-start"></i><p>' +
            tnaL('Нет результатов. Введите счёт на шаге 4 или дождитесь ввода маркерами.',
                'No results yet. Enter scores at step 4 or wait for the markers.') + '</p></div></div>';
    }
    var body = tnaProtocolSectionsHtml(p);
    return head + body + '</div>';
}

function tnaProtocolTableHtml(rows, prizePlaces, nomPositions) {
    var prize = prizePlaces || 3;
    return '<div class="tna-table-wrap"><table class="tna-table"><thead><tr>' +
        '<th class="tna-num">#</th><th>' + tnaL('Игрок', 'Player') + '</th><th class="tna-num">HCP</th>' +
        '<th class="tna-num">' + tnaL('Игр. HCP', 'Playing HCP') + '</th><th class="tna-num">Gross</th>' +
        '<th class="tna-num">Net</th><th class="tna-num">Stbl</th><th>' + tnaL('Статус', 'Status') + '</th>' +
        '</tr></thead><tbody>' + rows.map(function (r) {
            var pos = nomPositions ? r.nomPosition : r.position;
            var isPrize = pos != null && pos <= prize;
            return '<tr' + (isPrize ? ' class="tna-prize"' : '') + '>' +
                '<td class="tna-num">' + (pos == null ? '—' : pos) + '</td>' +
                '<td>' + tnaEsc(r.name) + '</td>' +
                '<td class="tna-num">' + (r.handicap == null ? '—' : r.handicap) + '</td>' +
                '<td class="tna-num">' + (r.fieldHcp == null ? '—' : r.fieldHcp) + '</td>' +
                '<td class="tna-num">' + (r.gross == null ? '—' : r.gross) + '</td>' +
                '<td class="tna-num">' + (r.net == null ? '—' : r.net) + '</td>' +
                '<td class="tna-num">' + (r.stableford == null ? '—' : r.stableford) + '</td>' +
                '<td>' + tnaEsc(r.status) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
}

function tnaProtocolSectionsHtml(p) {
    var cfg = tnaState.cfg || {};
    var prize = cfg.prizePlaces || 3;
    var html = '';
    var winners = p.rows.filter(function (r) { return r.position != null && r.position <= prize; });
    if (winners.length) {
        html += '<h3><i class="fas fa-medal" style="color:var(--gold)"></i> ' + tnaL('Призёры', 'Prize winners') + '</h3>' +
            tnaProtocolTableHtml(winners, prize);
    }
    html += '<h3>' + tnaL('Абсолютный зачёт', 'Overall') + '</h3>' + tnaProtocolTableHtml(p.rows, prize);
    p.scopes.forEach(function (s) {
        if (s.key === 'abs') return;
        html += '<h3>' + tnaEsc(s.name) + '</h3>' + tnaProtocolTableHtml(s.rows, prize);
    });
    p.nominations.forEach(function (n) {
        html += '<h3>' + tnaEsc(n.label) + '</h3>' + tnaProtocolTableHtml(n.rows, prize, true);
    });
    p.perGroup.forEach(function (g) {
        html += '<h3>' + tnaEsc(g.name) + '</h3>' + tnaProtocolTableHtml(g.rows, prize);
    });
    return html;
}

function tnaBindProtocol() {
    var el = function (id) { return document.getElementById(id); };
    var publish = el('tna-publish');
    if (publish) publish.onclick = function () { tnaPublishProtocol(); };
    var print = el('tna-print');
    if (print) print.onclick = function () { tnaPrintProtocol(); };
    var csv = el('tna-csv');
    if (csv) csv.onclick = function () { tnaExportCsv(); };
    var xls = el('tna-xls');
    if (xls) xls.onclick = function () { tnaExportExcel(); };
    var link = el('tna-link');
    if (link) link.onclick = function () { tnaPublicLink(); };
}

// Снимок протокола для публичной страницы (tournaments/<id>/protocol).
function tnaProtocolSnapshot(protocol) {
    var rows = protocol.rows.map(function (r) {
        return {
            key: r.pid, position: r.position, name: r.name, gender: r.gender,
            handicap: r.handicap, fieldHcp: r.fieldHcp, gross: r.gross, net: r.net,
            stableford: r.stableford, thru: r.holesPlayed, status: r.status,
            total: r.metric, divisionId: r.divisionId || null, divisionName: r.divisionName || null
        };
    });
    var prev = (tnaState.tn && tnaState.tn.protocol && tnaState.tn.protocol.version) || 0;
    return {
        version: prev + 1,
        state: 'fixed',
        published: true,
        fixed: true,
        fixedAt: Date.now(),
        fixedBy: tnaActor(),
        source: 'tn-admin',
        scoring: tnaState.cfg ? tnaState.cfg.scoring : 'stroke',
        netMode: tnaState.cfg ? tnaState.cfg.netMode : 'net',
        prizePlaces: tnaState.cfg ? tnaState.cfg.prizePlaces : 3,
        rows: rows,
        scopes: protocol.scopes.map(function (s) {
            return { key: s.key, name: s.name, rows: s.rows };
        }),
        perGroup: protocol.perGroup.map(function (g) {
            return { key: g.key, name: g.name, rows: g.rows };
        }),
        nominations: protocol.nominations.map(function (n) {
            return { id: n.id, kind: n.kind, gender: n.gender, label: n.label, rows: n.rows };
        })
    };
}

function tnaPublishProtocol() {
    var d = tnaDb();
    if (!d || !tnaState.tnId) return;
    var protocol = tnaState.protocol || tnaBuildProtocol();
    if (!protocol || !protocol.rows.length) {
        toast(tnaL('⚠️ Нет результатов для протокола', '⚠️ No results for the protocol'), 'error');
        return;
    }
    if (!confirm(tnaL(
        'Опубликовать протокол и завершить турнир?\n\nОпубликованная версия фиксируется — при необходимости можно опубликовать новую.',
        'Publish the protocol and finish the tournament?\n\nThe published version is fixed — a new one can be published later.'))) return;
    var snap = tnaProtocolSnapshot(protocol);
    tnaSaveTournament({
        protocol: snap,
        status: 'completed',
        lifecycleStatus: 'completed',
        finishedAt: Date.now()
    }, function (err) {
        if (err) return;
        toast(tnaL('✅ Протокол опубликован, турнир завершён', '✅ Protocol published, tournament finished'), 'success');
        tnaRender();
    });
}

function tnaPrintProtocol() {
    var protocol = tnaState.protocol || tnaBuildProtocol();
    if (!protocol || !protocol.rows.length) {
        toast(tnaL('⚠️ Нет результатов для печати', '⚠️ No results to print'), 'error');
        return;
    }
    var core = tnaCore();
    var t = tnaState.tn || {};
    var cfg = tnaState.cfg || {};
    var scoringLabel = cfg.scoring === 'stableford' ? 'Stableford'
        : (cfg.netMode === 'gross' ? 'Stroke Play · Gross' : 'Stroke Play · Net');
    var doc = core.protocolDocHtml(protocol, {
        name: t.name || '',
        date: t.date || '',
        scoringLabel: scoringLabel,
        participants: tnaState.players.length,
        prizePlaces: cfg.prizePlaces || 3
    });
    var w = window.open('', '_blank');
    if (!w) { toast(tnaL('⚠️ Разрешите всплывающие окна для печати', '⚠️ Allow pop-ups to print'), 'error'); return; }
    w.document.write(doc);
    w.document.close();
    w.focus();
    setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}

function tnaExportCsv() {
    var protocol = tnaState.protocol || tnaBuildProtocol();
    if (!protocol || !protocol.rows.length) return;
    var core = tnaCore();
    var t = tnaState.tn || {};
    tnaDownload(tnaFileName(t.name) + '-protocol.csv', 'text/csv;charset=utf-8', core.csv(protocol.rows));
}

function tnaExportExcel() {
    var protocol = tnaState.protocol || tnaBuildProtocol();
    if (!protocol || !protocol.rows.length) return;
    var t = tnaState.tn || {};
    var esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
        });
    };
    var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>' +
        '<table border="1"><tr><th>#</th><th>Игрок</th><th>HCP</th><th>Игр. HCP</th><th>Gross</th><th>Net</th><th>Stbl</th><th>Статус</th></tr>' +
        protocol.rows.map(function (r) {
            return '<tr><td>' + (r.position == null ? '' : r.position) + '</td><td>' + esc(r.name) + '</td><td>' +
                (r.handicap == null ? '' : r.handicap) + '</td><td>' + (r.fieldHcp == null ? '' : r.fieldHcp) + '</td><td>' +
                (r.gross == null ? '' : r.gross) + '</td><td>' + (r.net == null ? '' : r.net) + '</td><td>' +
                (r.stableford == null ? '' : r.stableford) + '</td><td>' + esc(r.status) + '</td></tr>';
        }).join('') + '</table></body></html>';
    tnaDownload(tnaFileName(t.name) + '-protocol.xls', 'application/vnd.ms-excel;charset=utf-8', html);
}

function tnaFileName(name) {
    return (String(name || 'tournament').replace(/[^a-zа-я0-9]+/gi, '_') || 'tournament');
}

function tnaPublicLink() {
    if (!tnaState.tnId) return;
    var full = location.origin + '/tn-protocol.html?id=' + encodeURIComponent(tnaState.tnId);
    // Копируем в буфер, если получится, и открываем страницу
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(full);
    } catch (e) {}
    window.open(full, '_blank');
    toast(tnaL('🔗 Ссылка на протокол скопирована и открыта', '🔗 Protocol link copied and opened'), 'success');
}

// ============================================================
// СКАЧИВАНИЕ ФАЙЛОВ
// ============================================================
function tnaDownload(filename, mime, content) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    tnaInit();
});

// Смена языка — перерисовать
if (typeof window !== 'undefined') {
    window.tnaOnLangChange = function () { tnaRender(); };
}

// Кнопка переключения языка в шапке страницы.
function tnaToggleLang() {
    if (typeof toggleLang === 'function') toggleLang();
    var label = document.getElementById('tna-lang-label');
    if (label) label.textContent = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'RU' : 'EN';
    tnaRender();
}
