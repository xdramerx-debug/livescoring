// js/pin-position.js — пин-позиция лунки (где стоит флажок на грине).
//
// Зачем. Игроку на экране ввода счёта нужно знать положение флажка, чтобы
// выбрать клюшку и линию атаки. Показывать это постоянно нельзя: экран ввода
// счёта и без того плотный, и лишний блок мешает основному действию — вводу
// числа ударов. Поэтому позиция живёт в сворачиваемой панели у правого края:
// в свёрнутом виде это узкая «закладка» с флажком и номером лунки, разворот —
// свайп влево (или тап по закладке), сворачивание — свайп вправо, крестик,
// кнопка «Свернуть», Esc или тап мимо панели.
//
// Кто задаёт позиции. Администратор в админ-панели (вкладка «Пин-позиции»,
// js/admin-pin-positions.js). На каждую лунку можно задать:
//   • зону грина 3×3 (передняя/середина/дальняя × левая/центр/правая);
//   • точные размеры грина в метрах — UP (глубина от переднего края),
//     SIDE (ширина) и DEPTH (глубина грина от переднего до заднего края).
//     Из них считается положение флажка: вперёд от переднего края (UP)
//     и в сторону от центральной линии (SIDE). PLAYER PIN задаётся так же,
//     как в приложениях измерения грина, поэтому админу не нужно пересчитывать
//     координаты вручную;
//   • схему грина — загруженное изображение с точкой «передний край», и
//     тогда флажок рисуется поверх картинки по тем же числам.
// Необязательная заметка («флажок за бункером, ветер в спину») — на лунку и
// на весь раунд.
// Хранится всё в settings/pin_positions — читают все (settings открыт на
// чтение в database.rules.json), пишет только админ. Благодаря шине settings
// (js/utils.js) подписка одна на всю ветку, отдельного Listen-а нет.
//
// Панель не участвует в разметке карточки ввода и не попадает в раскладку
// (position: fixed): свайп по лункам, клавиатура счёта и кнопка «Сохранить»
// работают как раньше, ничего не сдвигается.

'use strict';

var PIN_POSITIONS_PATH = 'settings/pin_positions';

// Зоны грина: f/m/b — ближняя к ти / середина / дальняя часть,
// l/c/r — левая / центр / правая. x,y — положение флажка на схеме (0..1).
var PIN_ZONES = ['fl', 'fc', 'fr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
var PIN_ZONE_META = {
    fl: { ru: 'Ближняя левая', en: 'Front left', x: 0.29, y: 0.71 },
    fc: { ru: 'Ближняя середина', en: 'Front middle', x: 0.50, y: 0.75 },
    fr: { ru: 'Ближняя правая', en: 'Front right', x: 0.71, y: 0.71 },
    ml: { ru: 'Середина слева', en: 'Middle left', x: 0.26, y: 0.50 },
    mc: { ru: 'Центр грина', en: 'Middle centre', x: 0.50, y: 0.50 },
    mr: { ru: 'Середина справа', en: 'Middle right', x: 0.74, y: 0.50 },
    bl: { ru: 'Дальняя левая', en: 'Back left', x: 0.31, y: 0.29 },
    bc: { ru: 'Дальняя середина', en: 'Back middle', x: 0.50, y: 0.25 },
    br: { ru: 'Дальняя правая', en: 'Back right', x: 0.69, y: 0.29 }
};

// ── Размеры грина: UP / SIDE / DEPTH ──────────────────────────────────────
//
// Админ вводит те же числа, что показывает приложение для измерения грина:
//   UP    — насколько флажок отстоит от ПЕРЕДНЕГО края грина (вперёд), метры;
//   SIDE  — насколько флажок смещён от центральной линии, метры.
//           Знак: + вправо, − влево (когда смотришь с ти на грин);
//   DEPTH — глубина грина от переднего края до заднего, метры.
// Ширина грина нужна, чтобы перевести SIDE в долю картинки: её задаёт
// WIDTH (сторона влево + вправо от центральной линии). Без WIDTH панель
// показывает положение по UP/DEPTH, а SIDE — только числом.
//
// Что из этого получается: точные координаты флажка на схеме в долях (0..1),
// где x — слева направо, y — от переднего края (0) к заднему (1). Если чисел
// нет, работает прежняя зона 3×3 — она и есть запасной вариант.
var PIN_MEASURE_DEFAULTS = { depth: 30, width: 24 };
// Допустимые диапазоны, метры. SIDE — единственное число со знаком
// (+ вправо / − влево), поэтому у него минимум отрицательный.
var PIN_MEASURE_RANGE = {
    depth: { min: 1, max: 120 },
    up: { min: 0, max: 120 },
    side: { min: -60, max: 60 },
    width: { min: 0, max: 120 }
};

function pinNumberOrNull(value, range) {
    if (value === null || value === undefined || value === '') return null;
    var num = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
    if (!isFinite(num)) return null;
    if (range) {
        if (num < range.min || num > range.max) return null;
    } else if (num < 0) {
        return null;
    }
    return Math.round(num * 10) / 10;
}

function pinMeasureOrNull(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var depth = pinNumberOrNull(raw.depth, PIN_MEASURE_RANGE.depth);
    var up = pinNumberOrNull(raw.up, PIN_MEASURE_RANGE.up);
    var side = pinNumberOrNull(raw.side, PIN_MEASURE_RANGE.side);
    // Ширина необязательна; 0 и отрицательная — то же, что «не задана».
    var width = pinNumberOrNull(raw.width, PIN_MEASURE_RANGE.width);
    if (width !== null && !(width > 0)) width = null;
    if (depth === null || up === null || side === null) return null;
    // UP не может быть больше глубины грина: такое число — опечатка, а не
    // позиция, поэтому такую лунку считаем неизмеренной, а не «за грином».
    if (up > depth) return null;
    return { depth: depth, up: up, side: side, width: width };
}

// Доля по глубине: 0 — передний край, 1 — задний.
function pinDepthRatio(measure) {
    if (!measure || !measure.depth) return null;
    var r = measure.up / measure.depth;
    return Math.max(0, Math.min(1, r));
}

// Доля по ширине: 0.5 — центральная линия. Без WIDTH ширину не знаем.
function pinSideRatio(measure) {
    if (!measure || measure.width === null || measure.width === undefined) return null;
    var half = measure.width / 2;
    if (!(half > 0)) return null;
    return Math.max(0, Math.min(1, 0.5 + measure.side / (2 * half)));
}

// Точка на схеме. null, если лунка не измерена: тогда рисуем зону 3×3.
function pinMeasurePoint(measure) {
    var rx = pinSideRatio(measure);
    var ry = pinDepthRatio(measure);
    if (ry === null) return null;
    // Схема грина на экране — эллипс с передним краем внизу: y=0 в данных
    // (передний край) соответствует y=1 на картинке. Переворачиваем.
    return { x: rx === null ? 0.5 : rx, y: 1 - ry };
}

function pinMeasureText(measure) {
    if (!measure) return '';
    var en = pinPanelLangEn();
    var parts = [
        'UP ' + measure.up.toFixed(1) + (en ? ' m' : ' м'),
        'SIDE ' + (measure.side > 0 ? '+' : '') + measure.side.toFixed(1).replace('-', '−') + (en ? ' m' : ' м'),
        'DEPTH ' + measure.depth.toFixed(1) + (en ? ' m' : ' м')
    ];
    return parts.join(' · ');
}

// Куда смотрит флажок словами: сначала «сколько вперёд», потом сторона —
// так игрок читает это на поле, а не как таблицу координат.
function pinMeasureWords(measure) {
    if (!measure) return '';
    var en = pinPanelLangEn();
    var depthWord;
    var ratio = pinDepthRatio(measure) === null ? 0.5 : pinDepthRatio(measure);
    if (ratio < 0.34) depthWord = en ? 'front' : 'ближняя часть';
    else if (ratio > 0.66) depthWord = en ? 'back' : 'дальняя часть';
    else depthWord = en ? 'middle' : 'середина';
    var sideWord;
    if (Math.abs(measure.side) <= 1.5) sideWord = en ? 'centre' : 'по центру';
    else if (measure.side > 0) sideWord = en ? 'right of the centre line' : 'правее центральной линии';
    else sideWord = en ? 'left of the centre line' : 'левее центральной линии';
    var head = en
        ? 'Flag ' + measure.up.toFixed(1) + ' m from the front, ' + depthWord
        : 'Флажок ' + measure.up.toFixed(1) + ' м от переднего края, ' + depthWord;
    return head + ', ' + sideWord;
}

// Схема грина картинкой. Принимаем data:URL (загружено админом, сжато до
// 900 px) и https: — всё остальное отбрасываем: чужие схемы с непроверенным
// протоколом игроку на поле не нужны.
function normalizePinGreenImage(raw) {
    if (typeof raw === 'string') {
        var s = raw.trim();
        if (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(s) && s.length <= 900000) return s;
        return '';
    }
    if (!raw || typeof raw !== 'object') return '';
    var url = typeof raw.url === 'string' ? raw.url.trim() : '';
    if (!url) return '';
    if (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(url) && url.length <= 900000) return url;
    if (/^https:\/\//i.test(url) && url.length <= 900) return url;
    return '';
}

function pinPanelLangEn() {
    return typeof currentLang !== 'undefined' && currentLang === 'en';
}

// Подпись зоны на языке интерфейса; неизвестная зона — пустая строка,
// чтобы битое значение в базе не превращалось в «[object Object]».
function pinZoneLabel(zone) {
    var meta = PIN_ZONE_META[zone];
    if (!meta) return '';
    return pinPanelLangEn() ? meta.en : meta.ru;
}

// Приведение значения из базы к предсказуемому виду. Всё, что не похоже на
// зону из PIN_ZONES, отбрасывается: панель показывает только проверенные
// данные, а мусор в базе не ломает экран ввода счёта.
function normalizePinPositions(value) {
    var out = { enabled: true, updatedAt: 0, updatedBy: '', note: '', holes: {} };
    if (!value || typeof value !== 'object') return out;
    if (value.enabled === false || value.enabled === 0 || value.enabled === 'false') out.enabled = false;
    out.updatedAt = parseInt(value.updatedAt, 10) || 0;
    out.updatedBy = typeof value.updatedBy === 'string' ? value.updatedBy : '';
    out.note = typeof value.note === 'string' ? value.note.slice(0, 280) : '';
    var holes = value.holes && typeof value.holes === 'object' ? value.holes : {};
    Object.keys(holes).forEach(function (key) {
        var h = parseInt(key, 10);
        if (!(h >= 1 && h <= 18)) return;
        var raw = holes[key];
        var zone = typeof raw === 'string'
            ? raw
            : (raw && typeof raw === 'object' ? String(raw.zone == null ? '' : raw.zone) : '');
        var note = raw && typeof raw === 'object' && typeof raw.note === 'string'
            ? raw.note.slice(0, 120) : '';
        var measure = raw && typeof raw === 'object' ? pinMeasureOrNull(raw.measure) : null;
        var image = raw && typeof raw === 'object' ? normalizePinGreenImage(raw.image) : '';
        // Неизвестная зона — это битые данные, а не «центр»: такую запись
        // отбрасываем. Но лунка может быть описана только размерами или
        // только схемой грина — тогда зона не нужна, достаточно UP/SIDE/DEPTH.
        if (PIN_ZONES.indexOf(zone) === -1) {
            if (!measure && !image) return;
            zone = 'mc';
        }
        // Явно заданная зона без валидных чисел — не «лунка без данных», а
        // битая запись (например, UP > DEPTH): отбрасываем её целиком.
        if (!measure && raw && typeof raw === 'object' && raw.measure) return;
        var entry = { zone: zone, note: note };
        if (measure) entry.measure = measure;
        if (image) entry.image = image;
        out.holes[h] = entry;
    });
    return out;
}

var pinPositionsState = normalizePinPositions(null);
var pinPositionsBound = false;
// true, когда данные пришли из базы: кэш больше не должен их перекрывать.
var pinPositionsHydrated = false;
var pinPanelInstances = Object.create(null);

function pestovoPinPositions() {
    return pinPositionsState;
}

// Положение флажка для лунки. Если админ лунку не отмечал, это центр грина:
// закладка должна быть видна на любой лунке с самого начала — иначе игрок не
// знает, что фича вообще есть (а расставленные позже позиции всё равно
// приедут подпиской). null — только когда показ выключен явно.
function pestovoPinForHole(hole) {
    var h = parseInt(hole, 10);
    if (!(h >= 1 && h <= 18)) return null;
    if (!pinPositionsState.enabled) return null;
    return pinPositionsState.holes[h] || { zone: 'mc', note: '', fallback: true };
}

// Подписка на settings/pin_positions. Делегируется в bindRealtimeValue()
// (общий реестр в js/utils.js): повторный вызов не удваивает слушателя,
// а сама подписка идёт через шину /settings — одним запросом на страницу.
function pestovoPinPositionsBind() {
    if (pinPositionsBound) return;
    if (typeof db === 'undefined' || !db) return;
    if (typeof bindRealtimeValue !== 'function') return;
    pinPositionsBound = true;
    bindRealtimeValue('pin-positions', db.ref(PIN_POSITIONS_PATH), function (snapshot) {
        pestovoPinPositionsApply(snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null);
    });
}

// Последнее известное состояние храним локально: на курсе связь пропадает
// регулярно, и панель должна показать флажок из кэша, а не пустоту. Пишет
// кэш и админка (сразу после сохранения), читает — каждая страница ввода.
var PIN_POSITIONS_CACHE_KEY = 'pestovo_pin_positions';

function pestovoPinPositionsApply(value) {
    pinPositionsHydrated = true;
    pinPositionsState = normalizePinPositions(value);
    try {
        localStorage.setItem(PIN_POSITIONS_CACHE_KEY, JSON.stringify(value || null));
    } catch (e) { /* приватный режим: кэш необязателен */ }
    Object.keys(pinPanelInstances).forEach(function (id) {
        renderPinPanel(pinPanelInstances[id]);
    });
}

// Офлайн-старт: пока из базы ничего не пришло, показываем последнее известное.
// Вызывается один раз при загрузке модуля — раньше, чем страница отрисует
// шапку, — и никогда не перекрывает данные, пришедшие из базы.
function pestovoPinPositionsRestoreCache() {
    if (pinPositionsHydrated) return false;
    try {
        var raw = localStorage.getItem(PIN_POSITIONS_CACHE_KEY);
        if (!raw) return false;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return false;
        pinPositionsState = normalizePinPositions(parsed);
        pinPositionsHydrated = true;
        return true;
    } catch (e) { return false; }
}

// ── Панель ────────────────────────────────────────────────────────────────

function pinFormatTime(ts) {
    if (!ts) return '';
    if (typeof fmtTime === 'function') {
        var text = fmtTime(ts);
        if (text) return text;
    }
    try {
        var d = new Date(ts);
        var hh = ('0' + d.getHours()).slice(-2);
        var mm = ('0' + d.getMinutes()).slice(-2);
        return hh + ':' + mm;
    } catch (e) { return ''; }
}

function pinPanelGateVisible(inst) {
    var gate = inst.gate;
    if (!gate) return true;
    if (gate.hidden) return false;
    if (gate.classList && gate.classList.contains('hidden')) return false;
    return true;
}

// Разметка панели собирается заново на смену лунки/данных: это 9 ячеек и
// пара строк текста, перерисовка дешевле, чем поддержка «умного» патча.
function pinPanelHTML(id, hole, pin) {
    var en = pinPanelLangEn();
    var meta = PIN_ZONE_META[pin.zone];
    var zoneLabel = pinZoneLabel(pin.zone);
    var par = (typeof holePar === 'function') ? holePar(hole) : null;
    var measure = pin.measure || null;
    var image = pin.image || '';
    // Точка флажка: из размеров грина, если они заданы; иначе — центр зоны.
    var point = pinMeasurePoint(measure);
    var flagX = point ? point.x : meta.x;
    var flagY = point ? point.y : meta.y;
    var cells = PIN_ZONES.map(function (zone) {
        var m = PIN_ZONE_META[zone];
        var active = zone === pin.zone;
        return '<span class="pin-green__cell' + (active ? ' is-pin' : '') + '"' +
            ' style="left:' + (m.x * 100).toFixed(1) + '%;top:' + (m.y * 100).toFixed(1) + '%"' +
            ' aria-hidden="true">' +
            (active && !point ? '<i class="fas fa-flag"></i>' : '') +
        '</span>';
    }).join('');
    // Схема грина: загруженная картинка, если она есть (флажок рисуем поверх
    // неё по тем же числам), иначе прежний эллипс-заглушка.
    var flagMark = '<span class="pin-green__flag" style="left:' + (flagX * 100).toFixed(1) + '%;top:' +
        (flagY * 100).toFixed(1) + '%" aria-hidden="true"><i class="fas fa-flag"></i></span>';
    // С картинкой флажок живёт внутри .pin-green__canvas — прямоугольника
    // самой схемы: только так его проценты совпадают с тем, что нарисовано.
    var greenBody = image
        ? '<span class="pin-green__canvas">' +
              '<img class="pin-green__img" src="' + escapeHtml(image) + '" alt="" aria-hidden="true">' +
              flagMark +
              '<span class="pin-green__frontline" aria-hidden="true"></span>' +
          '</span>' +
          '<span class="pin-green__front" aria-hidden="true">' + (en ? 'front edge at the bottom' : 'передний край — снизу') + '</span>'
        : '<span class="pin-green__ring" aria-hidden="true"></span>' + cells +
          '<span class="pin-green__tee" aria-hidden="true">' + (en ? 'tee' : 'ти') + '</span>' + flagMark;

    var updated = pinFormatTime(pinPositionsState.updatedAt);
    var note = pin.note ? String(pin.note) : '';
    var clubNote = pinPositionsState.note ? String(pinPositionsState.note) : '';
    var measureLine = measure
        ? '<dl class="pin-measure">' +
            '<div class="pin-measure__row"><dt>UP</dt><dd>' + measure.up.toFixed(1) + '<span>' + (en ? ' m' : ' м') + '</span></dd></div>' +
            '<div class="pin-measure__row"><dt>SIDE</dt><dd>' + (measure.side > 0 ? '+' : '') +
                measure.side.toFixed(1).replace('-', '−') + '<span>' + (en ? ' m' : ' м') + '</span></dd></div>' +
            '<div class="pin-measure__row"><dt>DEPTH</dt><dd>' + measure.depth.toFixed(1) + '<span>' + (en ? ' m' : ' м') + '</span></dd></div>' +
            (measure.width !== null && measure.width !== undefined
                ? '<div class="pin-measure__row"><dt>WIDTH</dt><dd>' + measure.width.toFixed(1) + '<span>' + (en ? ' m' : ' м') + '</span></dd></div>'
                : '') +
          '</dl>'
        : '';
    var words = measure ? pinMeasureWords(measure) : '';
    return '' +
        '<button type="button" class="pin-tab" data-act="pestovoPinExpand" data-arg="' + escapeHtml(id) + '"' +
            ' aria-controls="' + escapeHtml(id) + '-sheet" aria-expanded="false"' +
            ' title="' + (en ? 'Swipe left to open the pin position' : 'Свайп влево — открыть пин-позицию') + '"' +
            ' aria-label="' + (en ? 'Pin position, hole ' : 'Пин-позиция, лунка ') + escapeHtml(hole) + '">' +
            '<span class="pin-tab__flag"><i class="fas fa-flag" aria-hidden="true"></i></span>' +
            '<span class="pin-tab__hole">' + escapeHtml(hole) + '</span>' +
            '<span class="pin-tab__hint"><i class="fas fa-chevron-left" aria-hidden="true"></i></span>' +
        '</button>' +
        '<div class="pin-sheet" id="' + escapeHtml(id) + '-sheet" role="region" tabindex="-1" aria-hidden="true"' +
            ' aria-label="' + (en ? 'Pin position' : 'Пин-позиция') + '">' +
            '<div class="pin-sheet__top">' +
                '<span class="pin-sheet__kicker"><i class="fas fa-flag" aria-hidden="true"></i> ' +
                    (en ? 'Pin position' : 'Пин-позиция') + '</span>' +
                '<button type="button" class="pin-sheet__close" data-act="pestovoPinCollapse"' +
                    ' data-arg="' + escapeHtml(id) + '" aria-label="' + (en ? 'Collapse' : 'Свернуть') + '">' +
                    '<i class="fas fa-xmark" aria-hidden="true"></i></button>' +
            '</div>' +
            '<div class="pin-sheet__hole"><b>' + (en ? 'Hole ' : 'Лунка ') + escapeHtml(hole) + '</b>' +
                (par ? '<span>· ' + (en ? 'par ' : 'пар ') + escapeHtml(par) + '</span>' : '') + '</div>' +
            '<div class="pin-green' + (image ? ' pin-green--photo' : '') + '" role="img" aria-label="' +
                escapeHtml(measure
                    ? (en ? 'Green: ' + pinMeasureWords(measure) : 'Грин: ' + pinMeasureWords(measure))
                    : (en ? 'Green layout: flag at ' + meta.en.toLowerCase() : 'Схема грина: флажок — ' + meta.ru.toLowerCase())) + '">' +
                greenBody +
            '</div>' +
            '<div class="pin-sheet__zone">' + escapeHtml(zoneLabel) +
                (pin.fallback ? '<span class="pin-sheet__default">' +
                    (en ? 'default position' : 'по умолчанию') + '</span>' : '') + '</div>' +
            (words ? '<p class="pin-sheet__words">' + escapeHtml(words) + '</p>' : '') +
            measureLine +
            (note ? '<p class="pin-sheet__note"><i class="fas fa-circle-info" aria-hidden="true"></i> ' +
                escapeHtml(note) + '</p>' : '') +
            (clubNote && !note ? '<p class="pin-sheet__note"><i class="fas fa-circle-info" aria-hidden="true"></i> ' +
                escapeHtml(clubNote) + '</p>' : '') +
            '<p class="pin-sheet__meta">' +
                (pin.fallback
                    ? (en ? 'The administrator has not set a pin for this hole yet' : 'Флажок этой лунки ещё не отмечен — показан центр грина')
                    : '') +
                (pin.fallback ? '' : (updated
                    ? (en ? 'Updated ' + escapeHtml(updated) : 'Обновлено ' + escapeHtml(updated))
                    : (en ? 'Set by the club administrator' : 'Ставит администратор клуба'))) +
            '</p>' +
            '<button type="button" class="btn btn-ol btn-block pin-sheet__collapse" data-act="pestovoPinCollapse"' +
                ' data-arg="' + escapeHtml(id) + '">' +
                '<i class="fas fa-chevron-right" aria-hidden="true"></i> ' + (en ? 'Collapse' : 'Свернуть') +
            '</button>' +
        '</div>';
}

function renderPinPanel(inst) {
    if (!inst || !inst.host) return;
    var host = inst.host;
    var hole = parseInt(inst.hole, 10) || 0;
    var pin = hole ? pestovoPinForHole(hole) : null;
    var available = !!(pin && PIN_ZONE_META[pin.zone] && hole);
    inst.available = available;
    if (!available || !pinPanelGateVisible(inst)) {
        host.hidden = true;
        inst.open = false;
        applyPinPanelState(inst);
        return;
    }
    host.hidden = false;
    var langMark = (pinPanelLangEn() ? 'en' : 'ru') + ':' + hole + ':' + pin.zone + ':' +
        (pin.note || '') + ':' + pinPositionsState.updatedAt + ':' + (pinPositionsState.note || '') +
        ':' + JSON.stringify(pin.measure || null) + ':' + (pin.image ? pin.image.length : 0);
    if (inst.markup !== langMark) {
        inst.markup = langMark;
        host.innerHTML = pinPanelHTML(inst.id, hole, pin);
        bindPinPanelNodes(inst);
    }
    applyPinPanelState(inst);
}

// Состояние «свёрнуто/развёрнуто» живёт в классе: CSS анимирует transform,
// поэтому смена лунки не схлопывает открытую панель.
function applyPinPanelState(inst) {
    var host = inst.host;
    var open = !!inst.open && !host.hidden;
    host.classList.toggle('is-open', open);
    var tab = host.querySelector('.pin-tab');
    if (tab) {
        tab.setAttribute('aria-expanded', open ? 'true' : 'false');
        tab.tabIndex = open ? -1 : 0;
    }
    var sheet = host.querySelector('.pin-sheet');
    if (sheet) sheet.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function bindPinPanelNodes(inst) {
    var host = inst.host;
    var sheet = host.querySelector('.pin-sheet');
    if (sheet) {
        // Esc и тап мимо закрывают панель: игрок всегда может вернуться к вводу
        // счёта одним движением, не ища крестик на телефоне в перчатке.
        sheet.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closePinPanel(inst);
        });
    }
}

function bindPinPanelSwipe(inst) {
    var host = inst.host;
    if (host.getAttribute('data-pin-swipe') === '1') return;
    host.setAttribute('data-pin-swipe', '1');
    var sx = 0, sy = 0, st = 0, active = false;
    host.addEventListener('touchstart', function (e) {
        if (!e.touches || e.touches.length !== 1) { active = false; return; }
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        st = Date.now();
        active = true;
    }, { passive: true });
    host.addEventListener('touchend', function (e) {
        if (!active || !e.changedTouches || !e.changedTouches.length) return;
        active = false;
        var t = e.changedTouches[0];
        var dx = t.clientX - sx;
        var dy = t.clientY - sy;
        // Горизонтальный свайп не должен перебивать вертикальный скролл
        // страницы: короткие и «диагональные» движения игнорируем.
        if (Math.abs(dx) < 36 || Math.abs(dy) > Math.abs(dx) * 1.25) return;
        if (Date.now() - st > 800) return;
        // Свайп по кнопке иначе дал бы ещё и click — гасим его на 400 мс.
        inst.suppressClickUntil = Date.now() + 400;
        if (dx < 0) openPinPanel(inst);
        else closePinPanel(inst);
    }, { passive: true });
}

function openPinPanel(inst) {
    if (!inst || !inst.available) return;
    inst.open = true;
    if (!pinPanelGateVisible(inst)) { inst.open = false; }
    applyPinPanelState(inst);
    if (typeof vib === 'function') vib(12);
    var sheet = inst.host.querySelector('.pin-sheet');
    if (sheet && inst.open && typeof sheet.focus === 'function') {
        try { sheet.focus({ preventScroll: true }); } catch (e) { /* не критично */ }
    }
}

function closePinPanel(inst) {
    if (!inst) return;
    inst.open = false;
    applyPinPanelState(inst);
    var tab = inst.host.querySelector('.pin-tab');
    if (tab && typeof tab.focus === 'function') {
        try { tab.focus({ preventScroll: true }); } catch (e) { /* не критично */ }
    }
}

// Обработчики для делегирования (js/ui-events.js): data-act + data-arg=id.
function pestovoPinExpand(id) {
    var inst = pinPanelInstances[id];
    if (!inst) return;
    if (inst.suppressClickUntil && Date.now() < inst.suppressClickUntil) return;
    openPinPanel(inst);
}

function pestovoPinCollapse(id) {
    var inst = pinPanelInstances[id];
    if (!inst) return;
    if (inst.suppressClickUntil && Date.now() < inst.suppressClickUntil) return;
    closePinPanel(inst);
}

// Синхронизация с текущей лункой страницы. Страницы ввода счёта зовут её из
// своей отрисовки шапки (scorer.js / live.js / marker.js), поэтому панель
// всегда показывает ту лунку, которая сейчас открыта, — и на любой лунке
// её можно развернуть.
function pestovoPinPanelHole(source, hole) {
    var h = parseInt(hole, 10) || 0;
    Object.keys(pinPanelInstances).forEach(function (id) {
        var inst = pinPanelInstances[id];
        if (inst.source !== source) return;
        if (inst.hole === h) return;
        inst.hole = h;
        renderPinPanel(inst);
    });
}

function pinGateObserver(inst) {
    if (!inst.gate || typeof MutationObserver !== 'function') return;
    if (inst.gateObserved) return;
    inst.gateObserved = true;
    try {
        new MutationObserver(function () { renderPinPanel(inst); }).observe(inst.gate, {
            attributes: true, attributeFilter: ['class', 'hidden', 'style']
        });
    } catch (e) { console.warn('[pin] gate observer failed', e); }
}

function pestovoPinMountPanels() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    var hosts = document.querySelectorAll('[data-pin-panel]');
    Array.prototype.forEach.call(hosts, function (host) {
        var id = host.id || ('pin-panel-' + (Object.keys(pinPanelInstances).length + 1));
        if (pinPanelInstances[id]) return;
        host.id = id;
        var inst = {
            id: id,
            host: host,
            source: host.getAttribute('data-pin-source') || '',
            gate: document.getElementById(host.getAttribute('data-pin-gate') || ''),
            hole: parseInt(host.getAttribute('data-pin-hole'), 10) || 0,
            open: false,
            available: false,
            markup: ''
        };
        pinPanelInstances[id] = inst;
        bindPinPanelSwipe(inst);
        pinGateObserver(inst);
        renderPinPanel(inst);
    });
    pestovoPinPositionsBind();
}

function pestovoPinBoot() {
    try {
        pestovoPinMountPanels();
    } catch (e) { console.warn('[pin] mount failed', e); }
}

if (typeof document !== 'undefined') {
    // Кэш читаем сразу при загрузке модуля: к моменту отрисовки шапки
    // положение флажка уже известно, даже если сеть недоступна.
    try { pestovoPinPositionsRestoreCache(); } catch (e) { console.warn('[pin] cache failed', e); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pestovoPinBoot);
    else pestovoPinBoot();

    // Закрытие тапом мимо панели и по Esc — один слушатель на документ.
    // Тап мимо развёрнутой панели только закрывает её: он не должен заодно
    // менять счёт в клавиатуре под панелью (первый тап — «убрать», второй —
    // действие). Поэтому слушаем в фазе перехвата и гасим событие.
    document.addEventListener('click', function (e) {
        var handled = false;
        Object.keys(pinPanelInstances).forEach(function (id) {
            var inst = pinPanelInstances[id];
            if (!inst.open) return;
            var t = e.target;
            if (t && inst.host.contains(t)) return;
            closePinPanel(inst);
            handled = true;
        });
        if (handled) {
            if (e.stopPropagation) e.stopPropagation();
            if (e.cancelable !== false && e.preventDefault) e.preventDefault();
        }
    }, true);
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        Object.keys(pinPanelInstances).forEach(function (id) {
            if (pinPanelInstances[id].open) closePinPanel(pinPanelInstances[id]);
        });
    });
    // Смена языка перерисовывает подписи зон (они собираются в JS, а не
    // через data-i18n).
    if (typeof MutationObserver === 'function' && document.documentElement) {
        try {
            new MutationObserver(function () {
                Object.keys(pinPanelInstances).forEach(function (id) {
                    pinPanelInstances[id].markup = '';
                    renderPinPanel(pinPanelInstances[id]);
                });
            }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
        } catch (e) { console.warn('[pin] lang observer failed', e); }
    }
}

if (typeof window !== 'undefined') {
    window.PIN_POSITIONS_PATH = PIN_POSITIONS_PATH;
    window.PIN_ZONES = PIN_ZONES;
    window.PIN_ZONE_META = PIN_ZONE_META;
    window.pinZoneLabel = pinZoneLabel;
    window.PIN_MEASURE_DEFAULTS = PIN_MEASURE_DEFAULTS;
    window.PIN_MEASURE_RANGE = PIN_MEASURE_RANGE;
    window.pinMeasureOrNull = pinMeasureOrNull;
    window.pinMeasurePoint = pinMeasurePoint;
    window.pinMeasureText = pinMeasureText;
    window.pinMeasureWords = pinMeasureWords;
    window.pinDepthRatio = pinDepthRatio;
    window.pinSideRatio = pinSideRatio;
    window.normalizePinGreenImage = normalizePinGreenImage;
    window.normalizePinPositions = normalizePinPositions;
    window.pestovoPinPositions = pestovoPinPositions;
    window.pestovoPinForHole = pestovoPinForHole;
    window.pestovoPinPositionsBind = pestovoPinPositionsBind;
    window.pestovoPinPositionsApply = pestovoPinPositionsApply;
    window.pestovoPinPositionsRestoreCache = pestovoPinPositionsRestoreCache;
    window.pestovoPinPanelHole = pestovoPinPanelHole;
    window.pestovoPinMountPanels = pestovoPinMountPanels;
    window.pestovoPinExpand = pestovoPinExpand;
    window.pestovoPinCollapse = pestovoPinCollapse;
}
