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
//     holes: {
//       7: {
//         zone: 'mc',                        // зона 3×3 — запасной вариант
//         note: 'Ветер в спину',
//         measure: { up: 8, side: -2.5, depth: 31, width: 26 },  // метры
//         image: 'data:image/jpeg;base64,…'  // схема грина (≤ 900 px)
//       }, …
//     }
//   }
// UP — вперёд от переднего края, SIDE — в сторону от центральной линии
// (+ вправо, − влево), DEPTH — глубина грина. WIDTH — ширина грина: без неё
// SIDE нельзя перевести в положение на картинке, и панель покажет только
// глубину. Изображение сжимается в браузере (canvas → JPEG) и лежит прямо в
// базе: отдельного Firebase Storage в проекте нет, а схема — одна картинка
// на лунку, загружаемая раз в сезон.
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

function pinMeasureClone(measure) {
    if (!measure) return null;
    return { depth: measure.depth, up: measure.up, side: measure.side, width: measure.width };
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
            measure: pin && pin.measure ? pinMeasureClone(pin.measure) : null,
            image: pin && pin.image ? pin.image : '',
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

// ── Размеры грина ─────────────────────────────────────────────────────────
//
// Админ вводит метры, а не координаты: UP/SIDE/DEPTH — те же числа, что
// показывает приложение для измерения грина. Пустое поле = неизвестно;
// позиция считается заданной, когда есть UP, SIDE и DEPTH. UP больше DEPTH —
// явная опечатка, такую позицию не сохраняем.

function pinAdminMeasureInput(field) {
    return pinAdminGet('pin-pos-' + field);
}

// Значение из формы: пусто → null, иначе число (запятая как разделитель).
function pinAdminMeasureValue(field) {
    var el = pinAdminMeasureInput(field);
    if (!el) return null;
    return pinNumberOrNull(el.value.trim(), PIN_MEASURE_RANGE[field]);
}

// Черновик измерения из полей формы. null — если заполнено не всё нужное.
function pinAdminMeasureFromInputs() {
    var depth = pinAdminMeasureValue('depth');
    var up = pinAdminMeasureValue('up');
    var side = pinAdminMeasureValue('side');
    var width = pinAdminMeasureValue('width');
    if (depth === null || up === null || side === null) return null;
    if (up > depth) return null;
    return { depth: depth, up: up, side: side, width: width };
}

// Подсказка под полями: что сейчас получается и что мешает.
function pinAdminMeasureHint(measure) {
    if (!measure) {
        var anyFilled = ['depth', 'up', 'side', 'width'].some(function (f) {
            var el = pinAdminMeasureInput(f);
            return el && String(el.value || '').trim() !== '';
        });
        if (!anyFilled) return pinAdminRu(
            'Необязательно. Заполните UP, SIDE и DEPTH — тогда флажок встанет по числам, а не по зоне 3×3.',
            'Optional. Fill UP, SIDE and DEPTH — then the flag is placed by the numbers instead of the 3×3 zone.');
        var up = pinAdminMeasureValue('up');
        var depth = pinAdminMeasureValue('depth');
        if (up !== null && depth !== null && up > depth) {
            return pinAdminRu(
                'UP больше DEPTH — такого не бывает: флажок не может стоять дальше заднего края.',
                'UP is greater than DEPTH: the flag cannot stand past the back edge.');
        }
        return pinAdminRu(
            'Нужны все три числа: UP, SIDE и DEPTH. Сейчас позиция считается по зоне 3×3.',
            'All three numbers are required: UP, SIDE and DEPTH. The position uses the 3×3 zone for now.');
    }
    var text = pinMeasureWords(measure);
    var width = pinAdminMeasureValue('width');
    if (width === null || !(width > 0)) {
        text += ' · ' + pinAdminRu(
            'WIDTH не задан — на схеме покажем только глубину, по центру.',
            'WIDTH is not set — the layout shows depth only, in the centre.');
    }
    return text;
}

// Правка одного числа. Пересобираем измерение целиком: «половина» чисел не
// должна попадать в базу.
function pinAdminSetMeasure(field) {
    if (['up', 'side', 'depth', 'width'].indexOf(field) === -1) return;
    var draft = pinAdminDraftOrLoad();
    var pin = draft.holes[pinAdminActiveHole] || { zone: 'mc', note: '', measure: null, image: '' };
    pin.measure = pinAdminMeasureFromInputs();
    if (pin.measure) pin.explicit = true;
    draft.holes[pinAdminActiveHole] = pin;
    pinAdminDirty = true;
    renderPinPositionsAdmin();
}

// Сброс чисел у лунки: позиция снова считается по зоне 3×3.
function pinAdminClearMeasure() {
    var draft = pinAdminDraftOrLoad();
    var pin = draft.holes[pinAdminActiveHole] || { zone: 'mc', note: '', measure: null, image: '' };
    pin.measure = null;
    draft.holes[pinAdminActiveHole] = pin;
    pinAdminDirty = true;
    renderPinPositionsAdmin();
    pinAdminStatus(pinAdminRu(
        'Числа лунки очищены — работает зона 3×3. Не забудьте сохранить.',
        'Hole numbers cleared — the 3×3 zone is used. Remember to save.'), 'info');
}

// ── Схема грина картинкой ────────────────────────────────────────────────
//
// Отдельного Firebase Storage в проекте нет, а схема грина — одна картинка
// на лунку, которую меняют раз в сезон. Поэтому сжимаем её в браузере
// (canvas → JPEG, длинная сторона ≤ 900 px) и кладём data:URL прямо в
// settings/pin_positions рядом с числами. Это держит размер базы
// предсказуемым (~60–120 КБ на лунку) и не требует новых правил и биллинга.

var PIN_ADMIN_IMAGE_MAX_SIDE = 900;
var PIN_ADMIN_IMAGE_MAX_CHARS = 900000;

function pinAdminImageTooBig() {
    pinAdminStatus(pinAdminRu(
        'Картинка получилась слишком большой. Попробуйте файл поменьше или другую схему.',
        'The image is too large. Try a smaller file or another layout.'), 'error');
}

// Пережатие в браузере. Колбэк получает data:URL или null, если файл не
// похож на изображение.
function pinAdminPrepareImage(file, callback) {
    if (!file) { callback(null); return; }
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) {
        pinAdminStatus(pinAdminRu(
            'Нужен файл PNG, JPEG или WebP.',
            'A PNG, JPEG or WebP file is required.'), 'error');
        callback(null);
        return;
    }
    if (typeof FileReader === 'undefined' || typeof Image === 'undefined') { callback(null); return; }
    var reader = new FileReader();
    reader.onerror = function () { callback(null); };
    reader.onload = function (e) {
        var img = new Image();
        img.onerror = function () { callback(null); };
        img.onload = function () {
            var w = img.width || img.naturalWidth || 0;
            var h = img.height || img.naturalHeight || 0;
            if (!w || !h) { callback(null); return; }
            var scale = Math.min(1, PIN_ADMIN_IMAGE_MAX_SIDE / Math.max(w, h));
            var cw = Math.max(1, Math.round(w * scale));
            var ch = Math.max(1, Math.round(h * scale));
            try {
                var canvas = document.createElement('canvas');
                canvas.width = cw;
                canvas.height = ch;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, cw, ch);
                var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
                if (!dataUrl || dataUrl.length > PIN_ADMIN_IMAGE_MAX_CHARS) {
                    dataUrl = canvas.toDataURL('image/jpeg', 0.62);
                }
                if (!dataUrl || dataUrl.length > PIN_ADMIN_IMAGE_MAX_CHARS) {
                    pinAdminImageTooBig();
                    callback(null);
                    return;
                }
                callback(dataUrl);
            } catch (err) {
                console.warn('[pin-admin] image encode failed', err);
                callback(null);
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Файл выбран в <input type="file">. Кнопка «Сохранить» отправит его в базу
// вместе с числами — отдельного «загрузить» нет, чтобы не было двух шагов.
function pinAdminImageChosen(input) {
    var file = null;
    if (input && input.files && input.files.length) file = input.files[0];
    if (!file) return;
    pinAdminStatus(pinAdminRu('Готовим схему грина…', 'Preparing the green layout…'), 'info');
    pinAdminPrepareImage(file, function (dataUrl) {
        if (!dataUrl) {
            if (input) { try { input.value = ''; } catch (e) { /* не критично */ } }
            return;
        }
        var draft = pinAdminDraftOrLoad();
        var pin = draft.holes[pinAdminActiveHole] || { zone: 'mc', note: '', measure: null, image: '' };
        pin.image = dataUrl;
        pin.explicit = true;
        draft.holes[pinAdminActiveHole] = pin;
        pinAdminDirty = true;
        if (input) { try { input.value = ''; } catch (e) { /* не критично */ } }
        renderPinPositionsAdmin();
        pinAdminStatus(pinAdminRu(
            'Схема грина добавлена к лунке ' + pinAdminActiveHole + ' — сохраните пин-позиции.',
            'Green layout added to hole ' + pinAdminActiveHole + ' — save the pin positions.'), 'info');
    });
}

function pinAdminClearImage() {
    var draft = pinAdminDraftOrLoad();
    var pin = draft.holes[pinAdminActiveHole] || { zone: 'mc', note: '', measure: null, image: '' };
    pin.image = '';
    draft.holes[pinAdminActiveHole] = pin;
    pinAdminDirty = true;
    renderPinPositionsAdmin();
}

// «Центр на всех лунках» — самый частый сценарий нового дня: флажок в центре,
// дальше админ правит только те лунки, где флажок перенесли.
function pinAdminResetAll() {
    var draft = pinAdminDraftOrLoad();
    PIN_ADMIN_HOLES.forEach(function (h) {
        draft.holes[h] = { zone: 'mc', note: '', measure: null, image: '', explicit: false };
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
        var measure = pinMeasureClone(pin.measure);
        if (!pin.explicit && pin.zone === 'mc' && !pin.note && !measure && !pin.image) return;
        var entry = { zone: pin.zone, note: pin.note || '' };
        if (measure) entry.measure = measure;
        if (pin.image) entry.image = pin.image;
        holes[h] = entry;
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
    // Поля размеров грина. Пока админ печатает, не перебиваем ввод: значение
    // пишем, только если оно реально другое (как у заметок выше).
    var measure = pin.measure || null;
    ['depth', 'up', 'side', 'width'].forEach(function (field) {
        var el = pinAdminMeasureInput(field);
        if (!el) return;
        var next = measure && measure[field] !== null && measure[field] !== undefined
            ? String(measure[field]).replace('.', ',')
            : '';
        if (document.activeElement !== el && el.value !== next) el.value = next;
    });
    var hint = pinAdminGet('pin-pos-measure-hint');
    if (hint) hint.textContent = pinAdminMeasureHint(measure);
    var clearMeasure = pinAdminGet('pin-pos-measure-clear');
    if (clearMeasure) clearMeasure.hidden = !measure;

    // Схема грина: превью, состояние и кнопка удаления.
    var point = pinMeasurePoint(measure);
    var preview = pinAdminGet('pin-pos-preview-marker');
    if (preview) {
        preview.style.left = ((point ? point.x : meta.x) * 100).toFixed(1) + '%';
        preview.style.top = ((point ? point.y : meta.y) * 100).toFixed(1) + '%';
    }
    var previewGreen = pinAdminGet('pin-pos-preview-green');
    if (previewGreen) {
        var img = pinAdminGet('pin-pos-preview-img');
        if (pin.image) {
            if (!img) {
                img = document.createElement('img');
                img.id = 'pin-pos-preview-img';
                img.className = 'pin-preview__photo';
                img.alt = '';
                previewGreen.insertBefore(img, previewGreen.firstChild);
            }
            if (img.getAttribute('src') !== pin.image) img.setAttribute('src', pin.image);
            previewGreen.classList.add('has-photo');
        } else {
            if (img && img.parentNode) img.parentNode.removeChild(img);
            previewGreen.classList.remove('has-photo');
        }
    }
    var imageState = pinAdminGet('pin-pos-image-state');
    if (imageState) {
        imageState.textContent = pin.image
            ? pinAdminRu('Схема загружена (' + Math.round(pin.image.length / 1024) + ' КБ)',
                'Layout uploaded (' + Math.round(pin.image.length / 1024) + ' KB)')
            : pinAdminRu('Схемы грина пока нет — покажем схематичный эллипс.',
                'No green layout yet — a schematic ellipse is shown.');
    }
    var clearImage = pinAdminGet('pin-pos-image-clear');
    if (clearImage) clearImage.hidden = !pin.image;
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
    window.pinAdminSetMeasure = pinAdminSetMeasure;
    window.pinAdminClearMeasure = pinAdminClearMeasure;
    window.pinAdminImageChosen = pinAdminImageChosen;
    window.pinAdminClearImage = pinAdminClearImage;
    window.pinAdminPrepareImage = pinAdminPrepareImage;
    window.pinAdminResetAll = pinAdminResetAll;
    window.pinAdminSave = pinAdminSave;
    window.pinAdminDraftFrom = pinAdminDraftFrom;
    window.pinAdminPayload = pinAdminPayload;
}
