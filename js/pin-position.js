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
// js/admin-pin-positions.js): на каждую лунку выбирается зона грина 3×3
// (передняя/середина/дальняя × левая/центр/правая) и необязательная заметка.
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
        if (PIN_ZONES.indexOf(zone) === -1) return;
        var note = raw && typeof raw === 'object' && typeof raw.note === 'string'
            ? raw.note.slice(0, 120) : '';
        out.holes[h] = { zone: zone, note: note };
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

function pestovoPinForHole(hole) {
    var h = parseInt(hole, 10);
    return h ? (pinPositionsState.holes[h] || null) : null;
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
    var cells = PIN_ZONES.map(function (zone) {
        var m = PIN_ZONE_META[zone];
        var active = zone === pin.zone;
        return '<span class="pin-green__cell' + (active ? ' is-pin' : '') + '"' +
            ' style="left:' + (m.x * 100).toFixed(1) + '%;top:' + (m.y * 100).toFixed(1) + '%"' +
            ' aria-hidden="true">' +
            (active ? '<i class="fas fa-flag"></i>' : '') +
        '</span>';
    }).join('');
    var updated = pinFormatTime(pinPositionsState.updatedAt);
    var note = pin.note ? String(pin.note) : '';
    var clubNote = pinPositionsState.note ? String(pinPositionsState.note) : '';
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
            '<div class="pin-green" role="img" aria-label="' +
                (en ? 'Green layout: flag at ' + meta.en.toLowerCase() : 'Схема грина: флажок — ' + meta.ru.toLowerCase()) + '">' +
                '<span class="pin-green__ring" aria-hidden="true"></span>' +
                cells +
                '<span class="pin-green__tee" aria-hidden="true">' + (en ? 'tee' : 'ти') + '</span>' +
            '</div>' +
            '<div class="pin-sheet__zone">' + escapeHtml(zoneLabel) + '</div>' +
            (note ? '<p class="pin-sheet__note"><i class="fas fa-circle-info" aria-hidden="true"></i> ' +
                escapeHtml(note) + '</p>' : '') +
            (clubNote && !note ? '<p class="pin-sheet__note"><i class="fas fa-circle-info" aria-hidden="true"></i> ' +
                escapeHtml(clubNote) + '</p>' : '') +
            '<p class="pin-sheet__meta">' +
                (updated
                    ? (en ? 'Updated ' + escapeHtml(updated) : 'Обновлено ' + escapeHtml(updated))
                    : (en ? 'Set by the club administrator' : 'Ставит администратор клуба')) +
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
    var available = !!(pinPositionsState.enabled && pin && PIN_ZONE_META[pin.zone] && hole);
    inst.available = available;
    if (!available || !pinPanelGateVisible(inst)) {
        host.hidden = true;
        inst.open = false;
        applyPinPanelState(inst);
        return;
    }
    host.hidden = false;
    var langMark = (pinPanelLangEn() ? 'en' : 'ru') + ':' + hole + ':' + pin.zone + ':' +
        (pin.note || '') + ':' + pinPositionsState.updatedAt + ':' + (pinPositionsState.note || '');
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
