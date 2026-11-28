// js/admin-pin-positions.js — редактор пин-позиций в админ-панели.
//
// Что это. На каждую лунку администратор выбирает зону грина (3×3: ближняя /
// середина / дальняя × левая / центр / правая), при желании — заметку («флажок
// за бункером, ветер в спину») и общую подсказку на весь раунд. Игрок видит это
// в сворачиваемой панели на экране ввода счёта (js/pin-position.js).
//
// Где хранится. settings/pin_positions:
//   {
//     enabled: true,              // выключено → закладка не показывается никому
//     note: '',                   // общая подсказка клуба
//     updatedAt: 1730000000000,   // время последнего сохранения
//     updatedBy: 'Имя админа',
//     holes: { 7: { zone: 'mc', note: 'Ветер в спину' }, … }   // 1..18
//   }
// Читают все (settings открыт на чтение в database.rules.json), пишет только
// администратор — ветка /settings целиком закрыта на запись админом.
//
// Черновик. Правки копятся локально и уходят в базу одной кнопкой
// «Сохранить»; до сохранения живой экран игрока не меняется.
// Значение по умолчанию для лунки без записи — центр грина: панель на экране
// ввода показывает именно центр, поэтому «нет записи» и «явно выбран центр»
// выглядят одинаково.

'use strict';

var PIN_ADMIN_HOLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
var pinAdminDraft = null;
var pinAdminDirty = false;
var pinAdminSaving = false;
var pinAdminSavingObserved = false;
var pinAdminActiveHole = 1;

function pinAdminLangEn() {
    return typeof currentLang !== 'undefined' && currentLang === 'en';
}
function pinAdminRu(ru, en) {
    return pinAdminLangEn() ? en : ru;
}
function pinAdminGet(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
}

function pinAdminClone(value) {
    return JSON.parse(JSON.stringify(value));
}

// Черновик из сохранённого значения. Заполняем все 18 лунок: редактор должен
// показывать зону для каждой лунки, а не пустоту.
function pinAdminDraftFrom(value) {
    var normalized = normalizePinPositions(value);
    var draft = pinAdminClone(normalized);
    var holes = {};
    PIN_ADMIN_HOLES.forEach(function (h) {
        var pin = normalized.holes[h];
        holes[h] = {
            zone: pin ? pin.zone : 'mc',
            note: pin ? pin.note : '',
            explicit: !!pin
        };
    });
    draft.holes = holes;
    return draft;
}

function pinAdminDraftOrLoad() {
    if (pinAdminDraft) return pinAdminDraft;
    pinAdminDraft = pinAdminDraftFrom(typeof pestovoPinPositions === 'function'
        ? pestovoPinPositions() : null);
    return pinAdminDraft;
}

function pinAdminActivePin() {
    var draft = pinAdminDraftOrLoad();
    return draft.holes[pinAdminActiveHole] || { zone: 'mc', note: '', explicit: false };
}

function pinAdminStatus(text, kind) {
    var el = pinAdminGet('pin-pos-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'pin-pos-status' + (kind ? ' is-' + kind : '');
}

function pinAdminSetEnabled(enabled) {
    var draft = pinAdminDraftOrLoad();
    draft.enabled = !!enabled;
    pinAdminDirty = true;
    renderPinPositionsAdmin();
}

function pinAdminSetNote(value) {
    var draft = pinAdminDraftOrLoad();
    draft.note = String(value || '').slice(0, 280);
    pinAdminDirty = true;
}

function pinAdminSelectHole(hole) {
    var h = parseInt(hole, 10);
    if (PIN_ADMIN_HOLES.indexOf(h) === -1) return;
    pinAdminActiveHole = h;
    renderPinPositionsAdmin();
}

function pinAdminSetZone(zone) {
    if (PIN_ZONES.indexOf(String(zone)) === -1) return;
    var draft = pinAdminDraftOrLoad();
    var pin = draft.holes[pinAdminActiveHole] || { zone: 'mc', note: '' };
    pin.zone = String(zone);
    pin.explicit = true;
    draft.holes[pinAdminActiveHole] = pin;
    pinAdminDirty = true;
    if (typeof vib === 'function') vib(15);
    renderPinPositionsAdmin();
}

function pinAdminSetHoleNote(value) {
    var draft = pinAdminDraftOrLoad();
    var pin = draft.holes[pinAdminActiveHole] || { zone: 'mc', note: '' };
    pin.note = String(value || '').slice(0, 120);
    pin.explicit = true;
    draft.holes[pinAdminActiveHole] = pin;
    pinAdminDirty = true;
}

// «Центр на всех лунках» — самый частый сценарий нового дня: флажок в центре,
// дальше админ правит только те лунки, где флажок перенесли.
function pinAdminResetAll() {
    var draft = pinAdminDraftOrLoad();
    PIN_ADMIN_HOLES.forEach(function (h) {
        draft.holes[h] = { zone: 'mc', note: '', explicit: false };
    });
    pinAdminDirty = true;
    pinAdminStatus(pinAdminRu(
        '⬜ Все лунки сброшены в центр грина — не забудьте сохранить.',
        '⬜ All holes reset to the middle of the green — remember to save.'), 'info');
    renderPinPositionsAdmin();
}

function pinAdminPayload() {
    var draft = pinAdminDraftOrLoad();
    var holes = {};
    PIN_ADMIN_HOLES.forEach(function (h) {
        var pin = draft.holes[h];
        if (!pin || !PIN_ZONE_META[pin.zone]) return;
        // Не записываем лунки, где ничего не меняли: «нет записи» = центр,
        // а лишние ключи в базе только путают при следующем дежурстве.
        if (!pin.explicit && pin.zone === 'mc' && !pin.note) return;
        holes[h] = { zone: pin.zone, note: pin.note || '' };
    });
    return {
        enabled: draft.enabled !== false,
        note: String(draft.note || '').slice(0, 280),
        updatedAt: Date.now(),
        updatedBy: pinAdminUserName(),
        holes: holes
    };
}

function pinAdminUserName() {
    try {
        if (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.name) {
            return String(currentUserData.name).slice(0, 80);
        }
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.email) {
            return String(currentUser.email).slice(0, 80);
        }
    } catch (e) { console.warn('[pin-admin] user lookup failed', e); }
    return '';
}

function pinAdminSave() {
    if (pinAdminSaving) return;
    var payload = pinAdminPayload();
    var saveBtn = pinAdminGet('pin-pos-save');
    if (typeof db === 'undefined' || !db) {
        // Без базы правки всё равно должны быть видны на этом устройстве:
        // так же ведут себя остальные настройки отображения.
        // pestovoPinPositionsApply() сам обновляет локальный кэш — игрок
        // увидит новые позиции даже без сети.
        if (typeof pestovoPinPositionsApply === 'function') pestovoPinPositionsApply(payload);
        pinAdminDirty = false;
        pinAdminStatus(pinAdminRu(
            'Сохранено только на этом устройстве: нет соединения с базой.',
            'Saved on this device only: the database is not connected.'), 'warn');
        renderPinPositionsAdmin();
        return;
    }
    pinAdminSaving = true;
    if (saveBtn) saveBtn.disabled = true;
    pinAdminStatus(pinAdminRu('Сохраняем пин-позиции…', 'Saving pin positions…'), 'info');
    if (typeof vib === 'function') vib(20);
    db.ref(PIN_POSITIONS_PATH).set(payload).then(function () {
        pinAdminDirty = false;
        if (typeof pestovoPinPositionsApply === 'function') pestovoPinPositionsApply(payload);
        pinAdminStatus(pinAdminRu(
            '✅ Пин-позиции сохранены — игроки увидят их на экране ввода счёта.',
            '✅ Pin positions saved — players will see them on the score entry screen.'), 'success');
        if (typeof toast === 'function') {
            toast(pinAdminRu('✅ Пин-позиции сохранены', '✅ Pin positions saved'), 'success');
        }
    }).catch(function (error) {
        console.warn('[pin-admin] save failed', error);
        pinAdminStatus(pinAdminRu(
            'Не удалось сохранить. Проверьте соединение и права администратора.',
            'Could not save. Check the connection and administrator rights.'), 'error');
        if (typeof toast === 'function') {
            toast(pinAdminRu('Ошибка сохранения пин-позиций', 'Could not save pin positions'), 'error');
        }
    }).then(function () {
        pinAdminSaving = false;
        renderPinPositionsAdmin();
    });
}

// ── Отрисовка ─────────────────────────────────────────────────────────────

function pinAdminHoleSummary(h) {
    var draft = pinAdminDraftOrLoad();
    var pin = draft.holes[h];
    return pin ? pin.zone : 'mc';
}

function pinAdminHoleButtonsHTML() {
    var draft = pinAdminDraftOrLoad();
    return PIN_ADMIN_HOLES.map(function (h) {
        var zone = pinAdminHoleSummary(h);
        var active = h === pinAdminActiveHole;
        var meta = PIN_ZONE_META[zone] || PIN_ZONE_META.mc;
        var par = (typeof holePar === 'function') ? holePar(h) : '';
        return '<button type="button" class="pin-pos-hole' + (active ? ' is-active' : '') + '"' +
            ' aria-pressed="' + (active ? 'true' : 'false') + '"' +
            ' data-act="pinAdminSelectHole" data-arg="' + h + '"' +
            ' title="' + escapeHtml(pinZoneLabel(zone)) + '">' +
            '<span class="pin-pos-hole__num">' + h + '</span>' +
            '<span class="pin-pos-hole__dot" style="left:' + (meta.x * 100).toFixed(0) + '%;top:' + (meta.y * 100).toFixed(0) + '%"></span>' +
            (par ? '<span class="pin-pos-hole__par">' + escapeHtml(par) + '</span>' : '') +
        '</button>';
    }).join('');
}

function pinAdminGridHTML() {
    var pin = pinAdminActivePin();
    // Порядок ячеек — как смотрит игрок от ти: дальние сверху, ближние снизу.
    var rows = [['bl', 'bc', 'br'], ['ml', 'mc', 'mr'], ['fl', 'fc', 'fr']];
    return rows.map(function (row) {
        return row.map(function (zone) {
            var meta = PIN_ZONE_META[zone];
            var active = pin.zone === zone;
            return '<button type="button" class="pin-pos-zone' + (active ? ' is-active' : '') + '"' +
                ' aria-pressed="' + (active ? 'true' : 'false') + '"' +
                ' data-act="pinAdminSetZone" data-arg="' + zone + '">' +
                '<i class="fas fa-flag" aria-hidden="true"></i>' +
                '<span>' + escapeHtml(pinZoneLabel(zone)) + '</span>' +
            '</button>';
        }).join('');
    }).join('');
}

function renderPinPositionsAdmin() {
    var root = pinAdminGet('pin-pos-editor');
    if (!root) return;
    var draft = pinAdminDraftOrLoad();
    var pin = pinAdminActivePin();
    var meta = PIN_ZONE_META[pin.zone] || PIN_ZONE_META.mc;
    var updated = parseInt(draft.updatedAt, 10) || 0;
    var updatedText = '';
    if (updated) {
        var timeText = '';
        try {
            if (typeof fmtDateTime === 'function') timeText = fmtDateTime(updated);
            else if (typeof fmtTime === 'function' && typeof formatDate === 'function') {
                timeText = formatDate(new Date(updated)) + ' ' + fmtTime(updated);
            } else timeText = new Date(updated).toLocaleString();
        } catch (e) { timeText = ''; }
        updatedText = timeText
            ? pinAdminRu('Обновлено: ' + timeText, 'Updated: ' + timeText)
            : '';
    }
    var toggle = pinAdminGet('pin-pos-enabled');
    if (toggle) toggle.checked = draft.enabled !== false;
    var clubNote = pinAdminGet('pin-pos-note');
    if (clubNote && clubNote.value !== (draft.note || '')) clubNote.value = draft.note || '';
    var holeNote = pinAdminGet('pin-pos-hole-note');
    if (holeNote && holeNote.value !== (pin.note || '')) holeNote.value = pin.note || '';

    var holesHost = pinAdminGet('pin-pos-holes');
    if (holesHost) holesHost.innerHTML = pinAdminHoleButtonsHTML();
    var gridHost = pinAdminGet('pin-pos-grid');
    if (gridHost) gridHost.innerHTML = pinAdminGridHTML();
    var zoneLabel = pinAdminGet('pin-pos-zone-label');
    if (zoneLabel) zoneLabel.textContent = pinZoneLabel(pin.zone);
    var holeTitle = pinAdminGet('pin-pos-hole-title');
    if (holeTitle) {
        holeTitle.textContent = pinAdminRu('Лунка ' + pinAdminActiveHole, 'Hole ' + pinAdminActiveHole);
    }
    var preview = pinAdminGet('pin-pos-preview-marker');
    if (preview) {
        preview.style.left = (meta.x * 100).toFixed(1) + '%';
        preview.style.top = (meta.y * 100).toFixed(1) + '%';
    }
    var metaLine = pinAdminGet('pin-pos-updated');
    if (metaLine) {
        metaLine.textContent = [updatedText, draft.updatedBy ? pinAdminRu('кто: ' + draft.updatedBy, 'by: ' + draft.updatedBy) : '']
            .filter(Boolean).join(' · ');
    }
    var saveBtn = pinAdminGet('pin-pos-save');
    if (saveBtn) saveBtn.disabled = pinAdminSaving;
    var dirtyNote = pinAdminGet('pin-pos-dirty');
    if (dirtyNote) dirtyNote.hidden = !pinAdminDirty;
}

function pinAdminInit() {
    var root = pinAdminGet('pin-pos-editor');
    if (!root) return;
    if (pinAdminDraft) {
        renderPinPositionsAdmin();
        return;
    }
    renderPinPositionsAdmin();
    if (typeof db === 'undefined' || !db) return;
    if (typeof bindRealtimeValue !== 'function') return;
    if (pinAdminSavingObserved) return;
    pinAdminSavingObserved = true;
    // Пока админ не начал править — показываем сохранённое значение. Черновик
    // после первой правки не перезаписываем: иначе живое обновление из базы
    // стирало бы введённое.
    bindRealtimeValue('pin-positions-admin', db.ref(PIN_POSITIONS_PATH), function (snapshot) {
        var value = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null;
        if (pinAdminDirty || pinAdminSaving) return;
        pinAdminDraft = pinAdminDraftFrom(value);
        renderPinPositionsAdmin();
    });
}

if (typeof window !== 'undefined') {
    window.pinAdminInit = pinAdminInit;
    window.renderPinPositionsAdmin = renderPinPositionsAdmin;
    window.pinAdminSetEnabled = pinAdminSetEnabled;
    window.pinAdminSetNote = pinAdminSetNote;
    window.pinAdminSelectHole = pinAdminSelectHole;
    window.pinAdminSetZone = pinAdminSetZone;
    window.pinAdminSetHoleNote = pinAdminSetHoleNote;
    window.pinAdminResetAll = pinAdminResetAll;
    window.pinAdminSave = pinAdminSave;
    window.pinAdminDraftFrom = pinAdminDraftFrom;
    window.pinAdminPayload = pinAdminPayload;
}
