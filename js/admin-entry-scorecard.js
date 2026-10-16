// js/admin-entry-scorecard.js — вкладка админки «Карточки на вводе» (admin.html).
//
// Настройки двух карточек экранов ввода счёта (setup-round.html):
//   general — «Общая карточка» (группа, 2+ игрока);
//   hole    — «Счётная карточка по лункам» (один игрок, соло и турнирный QR).
// Редактор работает с черновиком. Превью строится из демо-данных и черновика
// напрямую — в базу ничего не пишется, пока админ не нажмёт «Сохранить».
// Сохранение: settings/entry_scorecard_display (Firebase) + локальный кэш через
// setEntryScorecardSettings (js/entry-scorecard.js), он же перерисовывает
// открытые карточки на странице.
// Зависимости: js/entry-scorecard.js (загружается раньше), глобалы db, toast.

var entryScAdmDraft = null;      // черновик (нормализованный объект настроек)
var entryScAdmBase = null;       // снимок сохранённых настроек, с которого начат черновик
var entryScAdmKind = 'general';  // какую карточку редактируем: general | hole
var entryScAdmCtx = 'round';     // где применяется: round (обычный раунд) | tournament
var entryScAdmSaving = false;
var entryScAdmStatus = '';

var ENTRY_SC_ADM_KIND_META = {
    general: { name: 'Общая карточка', hint: 'Группа из 2 и более игроков: лунки и итоги всех игроков.' },
    hole: { name: 'Счётная карточка по лункам', hint: 'Один игрок: соло-раунд и турнирный ввод по QR.' }
};

// Узоры для миниатюр вариантов. Токены: l — подпись, h — заголовок, f — ячейка,
// g — выделенный счёт, b — маркер, r — расхождение, n/w — узкая/широкая ячейка,
// | — разделитель блоков.
var ENTRY_SC_ADM_THUMBS = {
    general: {
        '1': ['l h h h h h h', 'l f f f f f f', 'l g f g f f f'],
        '2': ['l h h h h |', 'l f f f f |', 'l g g f f |'],
        '3': ['l f f f f f f', 'l g f g f f f', 'l f g f f g f'],
        '4': ['l h h h', 'f f f f', 'g f f f'],
        '5': ['f f f', 'f g f', 'f f f']
    },
    hole: {
        '1': ['l h h h h h h h h h', 'l f f f f f f f f f', 'l g g f g f f f f'],
        '2': ['f f f | f f f', 'g g f | f f g', 'f f f | f f f'],
        '3': ['l g g g', 'l f f f'],
        '4': ['n w', 'n w', 'n w'],
        '5': ['f f f', 'f g f']
    }
};

// Демо-игроки для превью (ФИО условные). Счёт строится по паре лунок от пара.
var ENTRY_SC_ADM_DEMO_PLAYERS = [
    { id: 'demo-1', name: 'Александр Петров', tee: 'wh', fieldHcp: 12, bias: 0 },
    { id: 'demo-2', name: 'Сергей Иванов', tee: 'bl', fieldHcp: 18, bias: 1 },
    { id: 'demo-3', name: 'Мария Соколова', tee: 'rd', fieldHcp: 6, bias: -1 },
    { id: 'demo-4', name: 'Дмитрий Орлов', tee: 'wh', fieldHcp: 24, bias: 2 }
];
var ENTRY_SC_ADM_DEMO_PATTERN = [0, 1, 0, -1, 0, 2, 0, 1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 2];

// «Есть несохранённые правки» — черновик отличается от снимка, с которого он начат.
function entryScAdmIsDirty() {
    if (!entryScAdmDraft || !entryScAdmBase) return false;
    return JSON.stringify(normalizeEntryScorecardSettings(entryScAdmDraft)) !== JSON.stringify(entryScAdmBase);
}

function entryScAdmTakeBase() {
    entryScAdmBase = getEntryScorecardSettings();
    entryScAdmDraft = getEntryScorecardSettings();
}

function entryScAdmDemoRound() {
    var players = {};
    ENTRY_SC_ADM_DEMO_PLAYERS.forEach(function(d, idx) {
        var scores = {};
        // Первый игрок сыграл 11 лунок (есть «текущая»), остальные — 14–18.
        var played = idx === 0 ? 11 : 14 + idx;
        for (var hole = 1; hole <= played; hole++) {
            var delta = ENTRY_SC_ADM_DEMO_PATTERN[(hole - 1) % ENTRY_SC_ADM_DEMO_PATTERN.length] + d.bias;
            scores[hole] = Math.max(1, holePar(hole) + delta);
        }
        players[d.id] = { name: d.name, tee: d.tee, fieldHcp: d.fieldHcp, exactHcp: d.fieldHcp, scores: scores };
    });
    // Маркер (второй игрок) записал счёт первого игрока, но на 5-й лунке ошибся:
    // в превью видна подсветка расхождения. Маркер хранится у проверяемого игрока.
    var marked = players['demo-1'];
    var markerScores = {};
    Object.keys(marked.scores).forEach(function(k) { markerScores[k] = marked.scores[k]; });
    markerScores[5] = (markerScores[5] || 1) + 1;
    marked.markedBy = 'demo-2';
    marked.markerScores = { 'demo-2': markerScores };
    return { name: 'Демо-раунд', status: 'active', holeRange: '1-18', startHole: 1, tee: 'wh', format: 'Stroke Play', players: players };
}

function entryScAdmCfgForPreview() {
    var base = entryScAdmDraft[entryScAdmKind];
    if (entryScAdmCtx === 'tournament') {
        return {
            variant: entryScAdmDraft.tournament[entryScAdmKind] || base.variant,
            size: base.size,
            show: Object.assign({}, base.show)
        };
    }
    return { variant: base.variant, size: base.size, show: Object.assign({}, base.show) };
}

function entryScAdmPreviewHTML() {
    var round = entryScAdmDemoRound();
    var cfg = entryScAdmCfgForPreview();
    var order = getRoundOrder(round);
    var entries = ENTRY_SC_ADM_DEMO_PLAYERS.map(function(d) { return [d.id, round.players[d.id]]; });
    if (entryScAdmKind === 'hole') {
        return entryScHoleHTML(round.players['demo-1'], round, { playerId: 'demo-1', order: order, showMarker: true }, cfg);
    }
    return entryScGroupHTML(round, entries, order, { showMarker: true }, cfg);
}

var ENTRY_SC_ADM_THUMB_TOKENS = { l: 'l', h: 'h', f: 'f', g: 'g', b: 'b', r: 'r', n: 'n', w: 'w' };

function entryScAdmThumbHTML(kind, variant) {
    var rows = ENTRY_SC_ADM_THUMBS[kind][variant] || [];
    var out = '<span class="esc-thumb" aria-hidden="true">';
    rows.forEach(function(row) {
        out += '<span class="esc-th-r">';
        row.split(' ').forEach(function(tok) {
            if (tok === '|') { out += '<span class="esc-th-c" style="flex:0 0 3px;background:rgba(201,168,76,.45);border:0;"></span>'; return; }
            out += '<span class="esc-th-c ' + (ENTRY_SC_ADM_THUMB_TOKENS[tok] || 'f') + '"></span>';
        });
        out += '</span>';
    });
    return out + '</span>';
}

function entryScAdmDraw() {
    var root = document.getElementById('esc-admin-root');
    if (!root || !entryScAdmDraft) return;
    var focusKey = '';
    var active = document.activeElement;
    if (active && active.getAttribute && active.getAttribute('data-esc-focus')) focusKey = active.getAttribute('data-esc-focus');

    var kind = entryScAdmKind;
    var base = entryScAdmDraft[kind];
    var inTn = entryScAdmCtx === 'tournament';
    var dirty = entryScAdmIsDirty();
    var meta = ENTRY_SC_ADM_KIND_META[kind];
    var variantMeta = ENTRY_SC_VARIANT_META[kind];

    var html = '';
    html += '<div class="sev-sec-title">Какую карточку настраиваем</div>';
    html += '<div class="esc-seg" role="group" aria-label="Вид карточки">';
    ENTRY_SC_KINDS.forEach(function(k) {
        html += '<button type="button" class="' + (k === kind ? 'is-on' : '') + '" aria-pressed="' + (k === kind) + '" data-act="entryScAdmSetKind" data-arg="' + escapeHtml(k) + '">' + ENTRY_SC_ADM_KIND_META[k].name + '</button>';
    });
    html += '</div>';
    html += '<p class="esc-admin-note">' + meta.hint + '</p>';

    html += '<div class="sev-sec-title">Где применяется</div>';
    html += '<div class="esc-seg" role="group" aria-label="Контекст">';
    html += '<button type="button" class="' + (!inTn ? 'is-on' : '') + '" aria-pressed="' + (!inTn) + '" data-act="entryScAdmSetCtx" data-arg="round">Обычный раунд</button>';
    html += '<button type="button" class="' + (inTn ? 'is-on' : '') + '" aria-pressed="' + inTn + '" data-act="entryScAdmSetCtx" data-arg="tournament">Турнирный ввод</button>';
    html += '</div>';

    if (!inTn) {
        html += '<div class="sev-sec-title">Вид карточки</div>';
        html += '<p class="sev-sec-sub">Пять видов. Выберите — пример ниже обновится сразу.</p>';
        html += '<div class="esc-admin-variants">';
        ['1', '2', '3', '4', '5'].forEach(function(v, i) {
            var on = base.variant === v;
            html += '<button type="button" class="esc-var-btn' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-esc-focus="variant-' + v + '" data-act="entryScAdmSetVariant" data-arg="' + escapeHtml(v) + '">' +
                '<span class="esc-var-top"><span class="esc-var-num">' + (i + 1) + '</span><span class="esc-var-name">' + variantMeta[i].name + '</span></span>' +
                entryScAdmThumbHTML(kind, v) +
                '<span class="esc-var-desc">' + variantMeta[i].desc + '</span>' +
                '<span class="esc-var-check" aria-hidden="true"><i class="fas fa-check"></i></span>' +
                '</button>';
        });
        html += '</div>';

        html += '<div class="sev-sec-title">Размер</div>';
        html += '<div class="esc-seg" role="group" aria-label="Размер">';
        ENTRY_SC_SIZES.forEach(function(s) {
            var on = base.size === s;
            html += '<button type="button" class="' + (on ? 'is-on' : '') + '" aria-pressed="' + on + '" data-esc-focus="size-' + s + '" data-act="entryScAdmSetSize" data-arg="' + escapeHtml(s) + '">' + ENTRY_SC_SIZE_META[s].ru + '</button>';
        });
        html += '</div>';

        html += '<div class="sev-sec-title">Элементы карточки</div>';
        html += '<p class="sev-sec-sub">Отмеченное показывается на экране ввода. Маркер и подсветки работают только там, где маркер ведёт счёт.</p>';
        html += '<div class="esc-admin-checks">';
        ENTRY_SC_SHOW_KEYS[kind].forEach(function(key) {
            var on = !!base.show[key];
            html += '<label class="esc-chk"><input type="checkbox" data-esc-focus="show-' + key + '"' + (on ? ' checked' : '') +
                ' data-act="entryScAdmToggle" data-arg="' + escapeHtml(key) + '" data-checked="1"><span>' + ENTRY_SC_SHOW_META[key].ru + '</span></label>';
        });
        html += '</div>';
    } else {
        var ov = entryScAdmDraft.tournament[kind];
        html += '<div class="sev-sec-title">Вид на турнирном вводе</div>';
        html += '<p class="sev-sec-sub">Вид для турнирного раунда (QR стартового листа). «Как в обычном раунде» — берётся вид из вкладки «Обычный раунд».</p>';
        html += '<div class="esc-tn-row" role="group" aria-label="Турнирный вид">';
        html += '<button type="button" class="' + (!ov ? 'is-on' : '') + '" aria-pressed="' + (!ov) + '" data-esc-focus="tn-inherit" data-act="pestovoEntryScAdmResetVariant">Как в обычном раунде (' + base.variant + ')</button>';
        html += '</div>';
        html += '<div class="esc-admin-variants">';
        ['1', '2', '3', '4', '5'].forEach(function(v, i) {
            var on = ov === v;
            html += '<button type="button" class="esc-var-btn' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-esc-focus="tn-variant-' + v + '" data-act="entryScAdmSetVariant" data-arg="' + escapeHtml(v) + '">' +
                '<span class="esc-var-top"><span class="esc-var-num">' + (i + 1) + '</span><span class="esc-var-name">' + variantMeta[i].name + '</span></span>' +
                entryScAdmThumbHTML(kind, v) +
                '<span class="esc-var-desc">' + variantMeta[i].desc + '</span>' +
                '<span class="esc-var-check" aria-hidden="true"><i class="fas fa-check"></i></span>' +
                '</button>';
        });
        html += '</div>';
        html += '<p class="esc-admin-note">Размер и элементы берутся из вкладки «Обычный раунд».</p>';
    }

    html += '<div class="sev-apply">' +
        '<button type="button" class="btn btn-g" data-act="entryScAdmSave"' + (entryScAdmSaving ? ' disabled' : '') + '><i class="fas fa-cloud-arrow-up" aria-hidden="true"></i> Применить для всех</button>' +
        '<button type="button" class="btn btn-ol" data-act="entryScAdmCancel"' + (dirty ? '' : ' disabled') + '><i class="fas fa-rotate-left" aria-hidden="true"></i> Отменить правки</button>' +
        '<button type="button" class="btn btn-ol" data-act="entryScAdmResetDefaults"><i class="fas fa-undo" aria-hidden="true"></i> Сбросить к настройкам по умолчанию</button>' +
        '<div class="sev-apply-text"><p class="sev-apply-hint">' +
        (dirty ? 'Есть несохранённые изменения. ' : 'Изменения сохраняются для всех игроков и применяются сразу на открытых экранах.') +
        '</p><p id="esc-admin-status" role="status" aria-live="polite">' + entryScEsc(entryScAdmStatus) + '</p></div></div>';

    html += '<div class="sev-sec-title">Предпросмотр</div>';
    html += '<p class="sev-sec-sub">Демо-данные: 18 лунок, четыре игрока; у первого игрока показан маркер с расхождением. Превью не сохраняется в базе.</p>';
    html += '<div id="esc-admin-preview" class="esc-preview-phone" aria-live="polite">' + entryScAdmPreviewHTML() + '</div>';

    root.innerHTML = html;

    if (focusKey) {
        var back = root.querySelector('[data-esc-focus="' + focusKey + '"]');
        if (back && typeof back.focus === 'function') { try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); } }
    }
}

// Вызывается из switchTab('entrycards') и из setEntryScorecardSettings.
// Если админ ничего не правил, черновик следует за сохранёнными настройками;
// несохранённые правки не затираются входящими данными.
function renderEntryScorecardAdmin() {
    if (!entryScAdmDraft || !entryScAdmIsDirty()) entryScAdmTakeBase();
    entryScAdmDraw();
}

function entryScAdmSetKind(kind) {
    if (ENTRY_SC_KINDS.indexOf(kind) === -1) return;
    entryScAdmKind = kind;
    entryScAdmStatus = '';
    entryScAdmDraw();
}

function entryScAdmSetCtx(ctx) {
    entryScAdmCtx = ctx === 'tournament' ? 'tournament' : 'round';
    entryScAdmStatus = '';
    entryScAdmDraw();
}

// «Как в обычном раунде» — вариант сбрасывается в null; в data-атрибуте
// null передать нельзя, поэтому отдельное действие.
pestovoOnAction('pestovoEntryScAdmResetVariant', function () {
    entryScAdmSetVariant(null);
});

function entryScAdmSetVariant(value) {
    if (!entryScAdmDraft) return;
    if (entryScAdmCtx === 'tournament') {
        entryScAdmDraft.tournament[entryScAdmKind] = value === null ? null : (ENTRY_SC_VARIANTS.indexOf(String(value)) !== -1 ? String(value) : null);
    } else if (ENTRY_SC_VARIANTS.indexOf(String(value)) !== -1) {
        entryScAdmDraft[entryScAdmKind].variant = String(value);
    }
    entryScAdmStatus = '';
    entryScAdmDraw();
}

function entryScAdmSetSize(size) {
    if (!entryScAdmDraft || ENTRY_SC_SIZES.indexOf(size) === -1) return;
    entryScAdmDraft[entryScAdmKind].size = size;
    entryScAdmStatus = '';
    entryScAdmDraw();
}

function entryScAdmToggle(key, checked) {
    if (!entryScAdmDraft || ENTRY_SC_SHOW_KEYS[entryScAdmKind].indexOf(key) === -1) return;
    entryScAdmDraft[entryScAdmKind].show[key] = !!checked;
    entryScAdmStatus = '';
    entryScAdmDraw();
}

function entryScAdmCancel() {
    entryScAdmTakeBase(); // возврат к актуальным сохранённым настройкам
    entryScAdmStatus = 'Правки отменены.';
    entryScAdmDraw();
}

function entryScAdmResetDefaults() {
    entryScAdmDraft = normalizeEntryScorecardSettings(null);
    entryScAdmStatus = 'Значения по умолчанию в черновике. Нажмите «Применить для всех», чтобы сохранить.';
    entryScAdmDraw();
}

function entryScAdmSave() {
    if (entryScAdmSaving || !entryScAdmDraft) return;
    var payload = normalizeEntryScorecardSettings(entryScAdmDraft);
    if (typeof db === 'undefined' || !db) {
        entryScAdmStatus = 'Нет соединения с базой. Настройки не сохранены.';
        entryScAdmDraw();
        return;
    }
    entryScAdmSaving = true;
    entryScAdmStatus = 'Сохраняем для всех игроков…';
    entryScAdmDraw();
    db.ref(ENTRY_SC_FIREBASE).set(payload).then(function() {
        setEntryScorecardSettings(payload);
        entryScAdmBase = getEntryScorecardSettings();
        entryScAdmDraft = getEntryScorecardSettings();
        entryScAdmStatus = 'Настройки сохранены. Открытые экраны обновятся автоматически.';
    }).catch(function(err) {
        console.warn('Entry scorecard save failed', err);
        entryScAdmStatus = 'Не удалось сохранить. Проверьте соединение и права администратора.';
    }).finally(function() {
        entryScAdmSaving = false;
        entryScAdmDraw();
    });
}

if (typeof window !== 'undefined') {
    window.renderEntryScorecardAdmin = renderEntryScorecardAdmin;
    window.entryScAdmSetKind = entryScAdmSetKind;
    window.entryScAdmSetCtx = entryScAdmSetCtx;
    window.entryScAdmSetVariant = entryScAdmSetVariant;
    window.entryScAdmSetSize = entryScAdmSetSize;
    window.entryScAdmToggle = entryScAdmToggle;
    window.entryScAdmCancel = entryScAdmCancel;
    window.entryScAdmResetDefaults = entryScAdmResetDefaults;
    window.entryScAdmSave = entryScAdmSave;
}
