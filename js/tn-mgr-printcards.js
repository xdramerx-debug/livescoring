// ============================================================
// TN-MGR-PRINTCARDS — вкладка «Счетные карточки» турнира
// ------------------------------------------------------------
// Печатный конструктор карточек (по умолчанию 147×200 мм, лист A4
// landscape, 1 или 2 карточки на лист). Дизайн ОДИН на турнир:
// размер карточки и её место на листе, все кегли и отступы, строки
// таблицы, состав информации, лого / QR / текстовые оверлеи
// (перетаскиваются и растягиваются мышью), подписи снизу.
//
// Каждый блок таблицы (№ лунки, Пар, Длина, Индекс, Фора, Удары) —
// самостоятельная «строка-блок»: у неё свои кегль, высота и ширина
// колонки подписи (наследуются от общих размеров, пока не заданы свои),
// свой цвет, фон и шрифт. Блоки растягиваются мышью прямо на карточке
// (↕ высота, ↔ колонка подписи, ↘ весь блок сразу) и правятся числами
// в панели «Цвет и шрифт». Там же — общие цвета карточки (текст, фон,
// линии, фон итогов) и шрифт всей карточки.
//
// Содержимое карточек берётся ЖИВЬЁМ из турнира: участники,
// стартовый лист (время, лунка, ТИ, флайт), парные связки и — по
// желанию — текущий счёт раунда. Ручные правки полей помечаются
// флагом edits и переживают обновление данных, поэтому вкладка
// всегда показывает актуальную информацию.
//
// Экран: одна карточка-эталон в предпросмотре листа (всё правится
// прямо на ней и видно сразу), остальные карточки — свёрнутым
// неактивным списком. Правка эталона меняет общий дизайн, то есть
// синхронизируется со всеми карточками тура.
//
// Данные: tournaments/<tid>/printScorecards
// ============================================================
var TnMgrPrintCards = (function (root) {
    'use strict';

    var CARD_W = 200;      // мм — размер карточки по умолчанию (альбомная)
    var CARD_H = 147;
    var PAGE_W = 297;      // мм — A4 landscape
    var PAGE_H = 210;
    var DRAG_THRESHOLD_PX = 4;  // порог «клик или перетаскивание» для текста

    function doc() { return root.document; }
    function ui() { return root.TnMgrUI; }
    function core() { return root.TnMgrCore; }
    function data() { return root.TnMgrData; }
    function io() { return root.TnMgrIO; }
    function esc(v) { return core().esc(v); }
    function bi(ru, en) { return ui().bi(ru, en); }

    // ----------------------------------------------------------
    // СПРАВОЧНИК РАЗМЕРОВ: всё, что можно менять в миллиметрах
    // ----------------------------------------------------------
    var STYLE_FIELDS = {
        padMm: { min: 0, max: 25, def: 5, step: 0.5, ru: 'Поля карточки', en: 'Card padding' },
        titleMm: { min: 2, max: 14, def: 4.2, step: 0.1, ru: 'Название турнира', en: 'Tournament title' },
        nameMm: { min: 2, max: 16, def: 4.6, step: 0.1, ru: 'Имя игрока', en: 'Player name' },
        metaMm: { min: 1.5, max: 12, def: 3.1, step: 0.1, ru: 'Дата / HCP / ТИ / старт', en: 'Meta line' },
        tableMm: { min: 1.5, max: 12, def: 2.9, step: 0.1, ru: 'Цифры таблицы', en: 'Table digits' },
        rowHMm: { min: 3, max: 18, def: 6.4, step: 0.1, ru: 'Высота строки таблицы', en: 'Table row height' },
        labWMm: { min: 5, max: 45, def: 15, step: 0.5, ru: 'Колонка подписей (№/Пар…)', en: 'Label column' },
        sumWMm: { min: 3, max: 30, def: 11.5, step: 0.5, ru: 'Колонки OUT/IN/TOTAL', en: 'OUT/IN/TOTAL columns' },
        footMm: { min: 1.5, max: 12, def: 2.8, step: 0.1, ru: 'Подписи снизу (экран)', en: 'Footer labels' },
        headGapMm: { min: 0, max: 25, def: 2, step: 0.5, ru: 'Отступ после шапки', en: 'Gap after header' },
        footGapMm: { min: 0, max: 40, def: 4, step: 0.5, ru: 'Отступ до подписей', en: 'Gap before footer' },
        lineMm: { min: 0, max: 1.5, def: 0.25, step: 0.05, ru: 'Толщина линий', en: 'Line weight' }
    };
    var STYLE_KEYS = Object.keys(STYLE_FIELDS);

    /** Какие блоки информации показывать на карточке. */
    var SHOW_FIELDS = {
        subtitle: { def: true, ru: 'Клуб и поле', en: 'Club and course' },
        date: { def: true, ru: 'Дата турнира', en: 'Tournament date' },
        hcp: { def: true, ru: 'Точный HCP', en: 'Handicap index' },
        fieldHcp: { def: true, ru: 'Полевой HCP', en: 'Course handicap' },
        tee: { def: true, ru: 'ТИ (ти-бокс)', en: 'Tee' },
        hole: { def: true, ru: 'Стартовая лунка', en: 'Start hole' },
        time: { def: true, ru: 'Время старта', en: 'Start time' },
        group: { def: true, ru: 'Флайт / группа', en: 'Flight' },
        par: { def: true, ru: 'Строка «Пар»', en: 'Par row' },
        index: { def: true, ru: 'Строка «Индекс»', en: 'Index row' },
        length: { def: true, ru: 'Строка «Длина» (метры)', en: 'Distance row (metres)' },
        fore: { def: true, ru: 'Строка «Фора»', en: 'Handicap strokes row' },
        strokes: { def: true, ru: 'Строка «Удары»', en: 'Strokes row' },
        totals: { def: true, ru: 'Колонки OUT/IN/TOTAL', en: 'OUT/IN/TOTAL columns' }
    };
    var SHOW_KEYS = Object.keys(SHOW_FIELDS);
    var TABLE_ROW_KEYS = ['holes', 'par', 'length', 'index', 'fore', 'strokes'];
    var DEFAULT_ROW_ORDER = TABLE_ROW_KEYS.slice();

    /** Названия блоков таблицы для панели «Цвет и шрифт» и подписей ручек. */
    var ROW_LABELS = {
        holes: { ru: '№ лунки', en: 'Hole number' },
        par: { ru: 'Пар', en: 'Par' },
        length: { ru: 'Длина лунок', en: 'Hole length' },
        index: { ru: 'Индекс', en: 'Index' },
        fore: { ru: 'Фора', en: 'Handicap' },
        strokes: { ru: 'Удары', en: 'Strokes' }
    };

    /** Границы собственных размеров блока (мм); пусто — берём из общих. */
    var ROW_FIELD_LIMITS = {
        fontMm: { min: 1.2, max: 12 },
        heightMm: { min: 3, max: 18 },
        labWMm: { min: 5, max: 45 }
    };

    /** Шрифты, которые можно выбрать для карточки и отдельных блоков. */
    var CARD_FONTS = [
        { value: 'Georgia, serif', ru: 'Georgia', en: 'Georgia' },
        { value: '"Times New Roman", Times, serif', ru: 'Times New Roman', en: 'Times New Roman' },
        { value: 'Verdana, Geneva, sans-serif', ru: 'Verdana', en: 'Verdana' },
        { value: 'Tahoma, Geneva, sans-serif', ru: 'Tahoma', en: 'Tahoma' },
        { value: '"Trebuchet MS", Tahoma, sans-serif', ru: 'Trebuchet MS', en: 'Trebuchet MS' },
        { value: '"Courier New", Courier, monospace', ru: 'Courier New', en: 'Courier New' },
        { value: 'Impact, Charcoal, sans-serif', ru: 'Impact', en: 'Impact' },
        { value: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', ru: 'Системный', en: 'System' }
    ];

    /** Поля карточки, которые можно править вручную прямо на эталоне. */
    var CARD_TEXT_FIELDS = ['names', 'hcps', 'fieldHcps', 'tee', 'startHole', 'startTime', 'flight'];

    /**
     * Крупные блоки карточки, которые двигаются и масштабируются ЦЕЛИКОМ:
     *   table — вся таблица (№ лунки, Пар, Длина, Индекс, Фора, Удары);
     *   head  — шапка (турнир, клуб, дата, имя, HCP, ТИ, старт).
     * free=false — блок стоит в обычном потоке карточки (как раньше);
     * free=true  — блок свободно стоит в точке xMm/yMm шириной wMm.
     * k — масштаб содержимого (кегли, высоты строк, колонки подписей).
     */
    var BOX_KEYS = ['table', 'head'];
    var BOX_LABELS = {
        table: { ru: 'Таблица (№, Пар, Длина, Индекс, Фора, Удары)', en: 'Table (No., Par, Length, Index, Hcp, Strokes)', short: { ru: 'Таблица', en: 'Table' } },
        head: { ru: 'Шапка (турнир, имя, HCP, старт)', en: 'Header (tournament, name, HCP, start)', short: { ru: 'Шапка', en: 'Header' } }
    };
    var BOX_K_LIMITS = { min: 0.4, max: 3 };

    /**
     * Свои блоки карточки (оверлей type:'block'): шаблон текста с
     * подстановками {marker}, {player}, {hcp}… — значения берутся для
     * каждой карточки из участников и стартового листа.
     */
    var BLOCK_PLACEHOLDERS = [
        { key: 'player', ru: 'ФИО игрока', en: 'Player full name' },
        { key: 'lastName', ru: 'Фамилия игрока', en: 'Player last name' },
        { key: 'firstName', ru: 'Имя игрока', en: 'Player first name' },
        { key: 'marker', ru: 'ФИО маркера', en: 'Marker full name' },
        { key: 'markerLast', ru: 'Фамилия маркера', en: 'Marker last name' },
        { key: 'markerFirst', ru: 'Имя маркера', en: 'Marker first name' },
        { key: 'hcp', ru: 'Точный HCP', en: 'Handicap index' },
        { key: 'fieldHcp', ru: 'Полевой HCP', en: 'Course handicap' },
        { key: 'tee', ru: 'ТИ', en: 'Tee' },
        { key: 'hole', ru: 'Стартовая лунка', en: 'Start hole' },
        { key: 'time', ru: 'Время старта', en: 'Start time' },
        { key: 'flight', ru: 'Флайт', en: 'Flight' },
        { key: 'group', ru: 'Зачётная группа', en: 'Division' },
        { key: 'tournament', ru: 'Турнир', en: 'Tournament' },
        { key: 'date', ru: 'Дата', en: 'Date' },
        { key: 'club', ru: 'Клуб и поле', en: 'Club and course' }
    ];
    var BLOCK_PRESETS = {
        custom: { ru: 'Свой блок', en: 'Custom block', title: { ru: 'Свой блок', en: 'Custom block' }, text: { ru: 'Текст и данные: {player}', en: 'Text and data: {player}' }, wMm: 70, hMm: 9 },
        marker: { ru: 'Маркер', en: 'Marker', title: { ru: 'Маркер', en: 'Marker' }, text: { ru: 'Маркер: {marker}', en: 'Marker: {marker}' }, wMm: 80, hMm: 8, border: 'bottom' },
        markerSign: { ru: 'Подпись маркера', en: 'Marker signature', title: { ru: 'Подпись маркера', en: 'Marker signature' }, text: { ru: 'Маркер: {markerLast} {markerFirst}\nПодпись: ________________', en: 'Marker: {markerLast} {markerFirst}\nSignature: ________________' }, wMm: 85, hMm: 13, border: 'box' },
        hcp: { ru: 'Гандикапы', en: 'Handicaps', title: { ru: 'Гандикапы', en: 'Handicaps' }, text: { ru: 'Точный HCP: {hcp} · Полевой HCP: {fieldHcp}', en: 'Handicap index: {hcp} · Course handicap: {fieldHcp}' }, wMm: 90, hMm: 8 }
    };

    // ----------------------------------------------------------
    // СОСТОЯНИЕ
    // ----------------------------------------------------------
    var state = {
        draft: null,
        saveTimer: null,
        saveStatus: '',
        dirty: false,
        selected: {},
        drag: null,
        cardDrag: null,
        progress: '',
        panels: { sizes: false, fields: false, content: false, overlays: false, design: false },
        activeCardId: '',
        tableDragId: '',
        blockDrag: null,       // растягивание блока таблицы (высота/подпись/весь блок)
        query: '',
        preview: 'sheet',        // 'sheet' — лист A4, 'card' — только карточка
        previewPinned: false,    // пользователь выбрал вид вручную
        imageTarget: '',         // оверлей, в который грузим картинку
        scores: null,            // { pid: { hole: strokes } } — live-счёт (опция)
        scoresAt: 0,
        remoteUpdatedAt: -1,
        cardsSig: '',
        healTried: {}            // rid → привязка QR к раунду группы уже проверена
    };

    function tid() { return ui().state.route.tid || ''; }

    function canWrite() {
        if (root.TnMgr && typeof root.TnMgr.hasAccess === 'function' && !root.TnMgr.hasAccess()) return false;
        var t = ui().tournament();
        return !!(tid() && t);
    }

    // ----------------------------------------------------------
    // ЗНАЧЕНИЯ ПО УМОЛЧАНИЮ И ОГРАНИЧЕНИЯ
    // ----------------------------------------------------------
    function clampNum(v, min, max, fallback) {
        var n = parseFloat(v);
        if (!isFinite(n)) n = fallback;
        if (n < min) n = min;
        if (n > max) n = max;
        return n;
    }
    function round1(v) { return Math.round(v * 100) / 100; }

    function defaultPars() {
        var course = core().defaultCourse();
        var out = [];
        for (var h = 1; h <= 18; h++) out.push(course.par(h));
        return out;
    }
    function defaultIndexes() {
        var course = core().defaultCourse();
        var out = [];
        for (var h = 1; h <= 18; h++) out.push(course.si(h));
        return out;
    }
    /** Длины лунок в метрах: сперва настоящий справочник (course-config),
     *  в его отсутствие — встроенный fallback ядра (белые ТИ). */
    function defaultLengths(tee) {
        var code = tee || 'wh';
        var out = [];
        for (var h = 1; h <= 18; h++) {
            var dist = 0;
            if (root.HOLES && root.HOLES[h]) dist = Number(root.HOLES[h][code] || root.HOLES[h].wh || 0);
            else if (typeof root.holeDist === 'function') dist = Number(root.holeDist(h, code));
            else {
                var course = core().defaultCourse();
                if (course.dist) dist = Number(course.dist(h, code));
            }
            out.push(isFinite(dist) && dist > 0 ? Math.round(dist) : 0);
        }
        return out;
    }

    /** Длины лунок по справочнику ТИ (HOLES) или null, если для ТИ данных нет. */
    function teeLengths(code) {
        if (!code || !root.HOLES) return null;
        var out = [];
        var any = false;
        for (var h = 1; h <= 18; h++) {
            var dist = Number(root.HOLES[h] && root.HOLES[h][code]) || 0;
            if (dist > 0) any = true;
            out.push(dist > 0 ? Math.round(dist) : 0);
        }
        return any ? out : null;
    }

    /**
     * Код ТИ игрока карточки — тот же, что в стартовом листе (tees[i]),
     * либо ручная правка ТИ на карточке (edits.tee). Так длина всегда
     * соответствует выбранному ТИ, а не общему набору для всех карточек.
     */
    function cardTeeCode(card, playerIndex) {
        var index = playerIndex || 0;
        var editedTee = !!(card && card.edits && card.edits.tee);
        var raw = (editedTee ? card.tee : ((card && card.tees || [])[index])) || (card && card.tee) || '';
        return raw ? teeCode(raw) : '';
    }

    /**
     * Длины для строки игрока карточки: справочник его ТИ; если ТИ не из
     * справочника (или не выбран) — запасной ряд из панели «Лунки, пары…».
     * Возвращает { values, fallback }: fallback=true — ряд редактируемый.
     */
    function cardLengths(card, playerIndex) {
        var code = cardTeeCode(card, playerIndex);
        var byTee = teeLengths(code);
        if (byTee) return { values: byTee, fallback: false, tee: code };
        return { values: ensureDraft().lengths || defaultLengths(), fallback: true, tee: code };
    }
    function validColor(v) {
        return typeof v === 'string' && /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(v);
    }
    /** Шрифт допускаем только из списка — в сохранённых данных может быть что угодно. */
    function safeFont(v) {
        return CARD_FONTS.some(function (f) { return f.value === v; }) ? v : '';
    }
    function defaultBox(key, size) {
        var card = clampSize(size);
        var pad = STYLE_FIELDS.padMm.def;
        return {
            free: false,
            xMm: pad,
            yMm: key === 'head' ? pad : 34,
            wMm: round1(card.wMm - pad * 2),
            k: 1
        };
    }
    function clampBox(key, box, size) {
        var card = clampSize(size);
        var src = box || {};
        var def = defaultBox(key, card);
        var w = round1(clampNum(src.wMm, 15, card.wMm, def.wMm));
        return {
            free: !!src.free,
            xMm: round1(clampNum(src.xMm, 0, card.wMm - 5, def.xMm)),
            yMm: round1(clampNum(src.yMm, 0, card.hMm - 3, def.yMm)),
            wMm: w,
            k: Math.round(clampNum(src.k, BOX_K_LIMITS.min, BOX_K_LIMITS.max, 1) * 100) / 100
        };
    }
    function clampBoxes(boxes, size) {
        var src = boxes || {};
        var out = {};
        BOX_KEYS.forEach(function (key) { out[key] = clampBox(key, src[key], size); });
        return out;
    }
    /** Текущий блок карточки (всегда валиден). */
    function boxOf(key) {
        var d = ensureDraft();
        d.boxes = d.boxes || {};
        return clampBox(key, d.boxes[key], d.size);
    }
    function boxK(key) { return boxOf(key).k || 1; }
    function boxLabel(key, short) {
        var l = BOX_LABELS[key] || { ru: key, en: key, short: { ru: key, en: key } };
        return short ? bi(l.short.ru, l.short.en) : bi(l.ru, l.en);
    }
    /**
     * Inline-стиль блока: место и ширина (если свободный) + масштаб
     * содержимого. Таблица масштабирует колонки итогов здесь, а кегли и
     * высоты блоков — в blockStyleAttr(); шапка — свои кегли.
     */
    function boxStyleAttr(key) {
        var d = ensureDraft();
        var b = boxOf(key);
        var s = clampStyle(d.style);
        var out = '';
        if (b.free) out += 'left:' + b.xMm + 'mm;top:' + b.yMm + 'mm;width:' + b.wMm + 'mm;';
        if (b.k !== 1) {
            if (key === 'table') out += '--tnpc-sum-w:' + round1(s.sumWMm * b.k) + 'mm;';
            if (key === 'head') {
                out += '--tnpc-title:' + round1(s.titleMm * b.k) + 'mm;' +
                    '--tnpc-name:' + round1(s.nameMm * b.k) + 'mm;' +
                    '--tnpc-meta:' + round1(s.metaMm * b.k) + 'mm;';
            }
        }
        return out;
    }
    function boxClass(key) { return boxOf(key).free ? ' free' : ''; }
    /** Ручки блока целиком (только экран): ✥ перенос, ↔ ширина, ↕ масштаб, ↘ оба. */
    function boxHandlesHtml(key, printMode) {
        if (printMode) return '';
        var label = boxLabel(key, true);
        return '<span class="tnpc-box-move" data-tnpc-box-drag="' + key + '" data-mode="move" title="' +
            esc(bi('Перетащить блок «', 'Drag the “') + label + bi('» целиком', '” block')) + '">✥ ' + esc(label) + '</span>' +
            '<span class="tnpc-box-h tnpc-box-h-e" data-tnpc-box-drag="' + key + '" data-mode="e" title="' +
            esc(bi('Ширина блока «', 'Width of “') + label + bi('»', '”')) + '"></span>' +
            '<span class="tnpc-box-h tnpc-box-h-s" data-tnpc-box-drag="' + key + '" data-mode="s" title="' +
            esc(bi('Размер содержимого блока «', 'Content size of “') + label + bi('» (кегль и высота)', '” (font and height)')) + '"></span>' +
            '<span class="tnpc-box-h tnpc-box-h-se" data-tnpc-box-drag="' + key + '" data-mode="se" title="' +
            esc(bi('Растянуть блок «', 'Resize the “') + label + bi('» целиком', '” block')) + '"></span>';
    }

    function defaultDesign() {
        return { font: '', ink: '#111111', paper: '#ffffff', line: '#111111', sumBg: '#efefef' };
    }
    function clampDesign(design) {
        var src = design || {};
        var def = defaultDesign();
        return {
            font: safeFont(src.font),
            ink: validColor(src.ink) ? src.ink : def.ink,
            paper: validColor(src.paper) ? src.paper : def.paper,
            line: validColor(src.line) ? src.line : def.line,
            sumBg: validColor(src.sumBg) ? src.sumBg : def.sumBg
        };
    }
    /**
     * Собственные размеры/цвет одного блока таблицы. Храним ТОЛЬКО явно
     * заданные поля: чего нет — наследуется от общих размеров (STYLE_FIELDS),
     * поэтому старые дизайны без block-настроек выглядят как раньше.
     */
    function clampRowCfg(key, cfg, style) {
        var c = cfg || {};
        var s = clampStyle(style);
        var out = {};
        var lim = ROW_FIELD_LIMITS.fontMm;
        if (c.fontMm != null) out.fontMm = round1(clampNum(c.fontMm, lim.min, lim.max, s.tableMm));
        lim = ROW_FIELD_LIMITS.heightMm;
        if (c.heightMm != null) out.heightMm = round1(clampNum(c.heightMm, lim.min, lim.max, s.rowHMm));
        lim = ROW_FIELD_LIMITS.labWMm;
        if (c.labWMm != null) out.labWMm = round1(clampNum(c.labWMm, lim.min, lim.max, s.labWMm));
        if (validColor(c.color)) out.color = c.color;
        if (validColor(c.bg)) out.bg = c.bg;
        if (safeFont(c.font)) out.font = c.font;
        if (c.bold) out.bold = true;
        return out;
    }
    function clampRows(rows, style) {
        var src = rows || {};
        var out = {};
        TABLE_ROW_KEYS.forEach(function (key) {
            var cfg = clampRowCfg(key, src[key], style);
            if (Object.keys(cfg).length) out[key] = cfg;
        });
        return out;
    }
    /** Эффективный стиль блока: свои значения поверх общих размеров. */
    function rowCfg(key) {
        var d = ensureDraft();
        var s = clampStyle(d.style);
        var c = (clampRows(d.rows, d.style) || {})[key] || {};
        return {
            fontMm: c.fontMm != null ? c.fontMm : s.tableMm,
            heightMm: c.heightMm != null ? c.heightMm : s.rowHMm,
            labWMm: c.labWMm != null ? c.labWMm : s.labWMm,
            color: c.color || '',
            bg: c.bg || '',
            font: c.font || '',
            bold: !!c.bold
        };
    }
    /** CSS-переменные блока: свои кегль/высота/подпись + цвет/фон/шрифт. */
    function blockStyleAttr(key) {
        var r = rowCfg(key);
        // Масштаб таблицы целиком (блок «Таблица») умножает размеры строки.
        var k = boxK('table');
        var out = '--tnpc-table:' + round1(r.fontMm * k) + 'mm;' +
            '--tnpc-row-h:' + round1(r.heightMm * k) + 'mm;' +
            '--tnpc-lab-w:' + round1(r.labWMm * k) + 'mm;';
        if (r.color) out += 'color:' + r.color + ';';
        if (r.bg) out += '--tnpc-b-bg:' + r.bg + ';';
        if (r.font) out += 'font-family:' + r.font + ';';
        if (r.bold) out += 'font-weight:800;';
        return out;
    }
    function rowLabel(key) {
        var l = ROW_LABELS[key] || { ru: key, en: key };
        return bi(l.ru, l.en);
    }
    function defaultStyle() {
        var out = {};
        STYLE_KEYS.forEach(function (key) { out[key] = STYLE_FIELDS[key].def; });
        return out;
    }
    function clampStyle(style) {
        var src = style || {};
        var out = {};
        STYLE_KEYS.forEach(function (key) {
            var f = STYLE_FIELDS[key];
            out[key] = round1(clampNum(src[key], f.min, f.max, f.def));
        });
        return out;
    }
    function defaultShow() {
        var out = {};
        SHOW_KEYS.forEach(function (key) { out[key] = SHOW_FIELDS[key].def; });
        return out;
    }
    function clampShow(show) {
        var src = show || {};
        var out = {};
        SHOW_KEYS.forEach(function (key) { out[key] = src[key] === undefined ? SHOW_FIELDS[key].def : !!src[key]; });
        return out;
    }
    function normalizeRowOrder(order) {
        var present = [];
        (Array.isArray(order) ? order : []).forEach(function (key) {
            if (TABLE_ROW_KEYS.indexOf(key) !== -1 && present.indexOf(key) === -1) present.push(key);
        });
        // Отсутствующие строки вставляем на их каноническое место, а не в
        // конец: у турниров, сохранённых до появления строки «Длина», она
        // встаёт между «Пар» и «Индекс», а не после «Удары».
        TABLE_ROW_KEYS.forEach(function (key) {
            if (present.indexOf(key) !== -1) return;
            var defIdx = TABLE_ROW_KEYS.indexOf(key);
            var at = present.length;
            for (var i = 0; i < present.length; i++) {
                if (TABLE_ROW_KEYS.indexOf(present[i]) > defIdx) { at = i; break; }
            }
            present.splice(at, 0, key);
        });
        return present;
    }
    function visibleRowOrder(draft) {
        var d = draft || ensureDraft();
        var show = d.show || {};
        return normalizeRowOrder(d.rowOrder).filter(function (key) {
            return key === 'holes' || show[key] !== false;
        });
    }
    function reorderRowOrder(order, sourceId, targetId) {
        var result = normalizeRowOrder(order);
        var sourceIndex = result.indexOf(sourceId);
        var targetIndex = result.indexOf(targetId);
        if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return result;
        var item = result.splice(sourceIndex, 1)[0];
        result.splice(targetIndex, 0, item);
        return result;
    }
    function defaultSize() { return { wMm: CARD_W, hMm: CARD_H }; }
    function clampSize(size) {
        var src = size || {};
        return {
            wMm: round1(clampNum(src.wMm, 60, PAGE_W, CARD_W)),
            hMm: round1(clampNum(src.hMm, 60, PAGE_H, CARD_H))
        };
    }
    /**
     * Размеры и место на листе по умолчанию. Карточка альбомная (200×147 мм),
     * на листе A4 landscape помещаются 2 штуки: слева-сверху с зазором 17 мм
     * и масштабом печати 120%. Эти значения применяются, когда у турнира
     * ещё нет сохранённого дизайна карточек.
     */
    function defaultLayout() { return { xMm: 105.86, yMm: 39.68, scale: 1.2, gapMm: 17, perSheet: 2 }; }
    /**
     * Место карточки на листе A4 landscape. По умолчанию — альбомная карточка
     * 200×147 мм со смещением 105.86×39.68 мм, зазором 17 мм и масштабом 120%
     * (см. defaultLayout()). На лист входят 2 карточки; сколько реально
     * поместится в ряд, считает cardsPerSheet(), а pageFit() вписывает
     * раскладку в лист, если она не влезает (см. placement()).
     */
    function clampLayout(layout, size) {
        var src = layout || {};
        var card = clampSize(size);
        var def = defaultLayout();
        var scale = Math.round(clampNum(src.scale, 0.3, 2, def.scale) * 100) / 100;
        // Зазор между карточками не может съесть место, которого нет на листе.
        var maxGap = Math.max(0, round1(PAGE_W - card.wMm * scale));
        return {
            xMm: round1(clampNum(src.xMm, -50, PAGE_W, def.xMm)),
            yMm: round1(clampNum(src.yMm, -50, PAGE_H, def.yMm)),
            scale: scale,
            gapMm: round1(clampNum(src.gapMm, 0, maxGap, def.gapMm)),
            perSheet: Number(src.perSheet) === 1 ? 1 : 2
        };
    }
    /** Лево-верхний угол i-й карточки на листе (с учётом масштаба и зазора). */
    function slotPos(layout, size, index) {
        var L = clampLayout(layout, size);
        var card = clampSize(size);
        var step = card.wMm * L.scale + L.gapMm;
        return { xMm: round1(L.xMm + (index || 0) * step), yMm: L.yMm };
    }
    /**
     * Сколько карточек реально влезает в ряд на лист A4 landscape. Масштаб
     * выше 100% сам уменьшает число карточек на листе — иначе вторая карточка
     * уезжала за край бумаги и при печати терялась.
     */
    function cardsPerSheet(layout, size) {
        var L = clampLayout(layout, size);
        var card = clampSize(size);
        var step = card.wMm * L.scale + L.gapMm;
        if (step <= 0) return 1;
        // Лист не уже самой карточки: одна карточка помещается всегда.
        var width = Math.max(PAGE_W, round1(L.xMm + card.wMm * L.scale));
        var room = Math.floor((width - L.xMm + L.gapMm) / step);
        return Math.max(1, Math.min(L.perSheet, room));
    }
    /** Габарит раскладки: правая и нижняя граница последней карточки. */
    function layoutBox(layout, size) {
        var L = clampLayout(layout, size);
        var card = clampSize(size);
        var per = cardsPerSheet(L, card);
        var last = slotPos(L, card, per - 1);
        return {
            layout: L,
            card: card,
            per: per,
            right: round1(last.xMm + card.wMm * L.scale),
            bottom: round1(L.yMm + card.hMm * L.scale)
        };
    }
    /**
     * Во сколько раз раскладку нужно ужать, чтобы она целиком легла на лист
     * A4 landscape. 1 — вписывать не нужно. Без этого крупная карточка
     * (масштаб выше 100%) просто обрезалась бумагой.
     */
    function pageFit(layout, size) {
        var box = layoutBox(layout, size);
        var fit = Math.min(1, PAGE_W / Math.max(box.right, 0.01), PAGE_H / Math.max(box.bottom, 0.01));
        return Math.round(fit * 1000) / 1000;
    }
    /**
     * Итоговое место карточки на листе — раскладка, уже вписанная в A4
     * landscape. Одни и те же числа используют предпросмотр и печать,
     * поэтому экран не расходится с бумагой.
     */
    function placement(layout, size, index) {
        var L = clampLayout(layout, size);
        var card = clampSize(size);
        var per = cardsPerSheet(L, card);
        var slot = Math.min(index || 0, per - 1);
        var p = slotPos(L, card, slot);
        var fit = pageFit(L, card);
        var x = round1(p.xMm * fit);
        var y = round1(p.yMm * fit);
        var w = round1(card.wMm * L.scale * fit);
        var h = round1(card.hMm * L.scale * fit);
        // После округления до десятых миллиметр граница может на ~0.05мм
        // вылезти за лист — на бумаге это незаметно, но проверки раскладки
        // споткнутся. Слегка ужимаем итог, чтобы вписаться в PAGE_W/H
        // с запасом на округление. Используем неокруглённый fit, чтобы
        // попасть в лимит ровно.
        while ((x + w > PAGE_W + 0.01 || y + h > PAGE_H + 0.01) && fit > 0.01) {
            var limitX = x + w > PAGE_W + 0.01 ? (PAGE_W - x) / Math.max(w, 0.01) : 1;
            var limitY = y + h > PAGE_H + 0.01 ? (PAGE_H - y) / Math.max(h, 0.01) : 1;
            var limit = Math.min(limitX, limitY, 1);
            fit = Math.max(0.01, fit * limit * 0.999);
            x = round1(p.xMm * fit);
            y = round1(p.yMm * fit);
            w = round1(card.wMm * L.scale * fit);
            h = round1(card.hMm * L.scale * fit);
        }
        fit = Math.round(fit * 1000) / 1000;
        return {
            xMm: x,
            yMm: y,
            scale: Math.round(L.scale * fit * 1000) / 1000,
            wMm: w,
            hMm: h,
            per: per,
            fit: fit
        };
    }
    /** Помещается ли раскладка на лист A4 landscape без вписывания. */
    function fitsOnPage(layout, size) {
        var box = layoutBox(layout, size);
        return {
            ok: box.right <= PAGE_W + 0.01 && box.bottom <= PAGE_H + 0.01,
            right: box.right,
            bottom: box.bottom
        };
    }

    function defaultOverlays() {
        return [
            { id: 'logo', type: 'logo', xMm: 4, yMm: 4, wMm: 28, hMm: 16, enabled: false, src: '', fontMm: 3, text: '' },
            { id: 'qr-1', type: 'qr', xMm: CARD_W - 30, yMm: 4, wMm: 26, hMm: 26, enabled: false, payload: '', fontMm: 3, text: '' }
        ];
    }

    function clampOverlay(ov, size) {
        var card = size ? clampSize(size) : defaultSize();
        var o = ov || {};
        var w = clampNum(o.wMm, 5, card.wMm, 24);
        var h = clampNum(o.hMm, 5, card.hMm, 24);
        var x = clampNum(o.xMm, 0, card.wMm - w, 0);
        var y = clampNum(o.yMm, 0, card.hMm - h, 0);
        return Object.assign({}, o, {
            xMm: round1(x), yMm: round1(y), wMm: round1(w), hMm: round1(h),
            fontMm: round1(clampNum(o.fontMm, 1.5, 20, 3)),
            type: ['logo', 'qr', 'text', 'image', 'block'].indexOf(o.type) !== -1 ? o.type : 'logo',
            enabled: !!o.enabled,
            payload: o.payload == null ? '' : String(o.payload),
            text: o.text == null ? '' : String(o.text),
            src: o.src == null ? '' : String(o.src)
        }, o.type === 'block' ? clampBlockProps(o) : {});
    }
    var HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
    /** Оформление своего блока: заголовок (для списка), выравнивание, рамка, цвета. */
    function clampBlockProps(o) {
        return {
            title: String(o.title == null ? '' : o.title).slice(0, 60),
            bold: !!o.bold,
            align: ['left', 'center', 'right'].indexOf(o.align) !== -1 ? o.align : 'left',
            border: ['none', 'box', 'bottom'].indexOf(o.border) !== -1 ? o.border : 'none',
            color: HEX_COLOR_RE.test(String(o.color || '')) ? String(o.color) : '',
            bg: HEX_COLOR_RE.test(String(o.bg || '')) ? String(o.bg) : ''
        };
    }

    function defaultDraft() {
        return {
            size: defaultSize(),
            layout: defaultLayout(),
            style: defaultStyle(),
            holes: 18,
            pars: defaultPars(),
            indexes: defaultIndexes(),
            lengths: defaultLengths(),
            rowOrder: DEFAULT_ROW_ORDER.slice(),
            rows: {},
            design: defaultDesign(),
            boxes: clampBoxes(null, defaultSize()),
            text: { tournamentName: '', subtitle: '', date: '' },
            show: defaultShow(),
            footer: { player: 'Игрок', marker: 'Маркер', judge: 'Судья', print: false },
            overlays: defaultOverlays(),
            cards: [],
            filters: { selectedOnly: false, activeOnly: false },
            logoSrc: '',
            qrEnabled: false,
            orderLocked: false,
            fillScores: false,
            updatedAt: 0
        };
    }

    // ----------------------------------------------------------
    // ЧТЕНИЕ/ЗАПИСЬ ЧЕРНОВИКА
    // ----------------------------------------------------------
    function storedDraft() {
        var t = ui().tournament() || {};
        var stored = t.printScorecards;
        return stored && typeof stored === 'object' ? stored : null;
    }

    function loadDraft() {
        var stored = storedDraft();
        var base = defaultDraft();
        if (!stored) return base;
        base.size = clampSize(stored.size);
        // Раскладку не «чиним»: pageFit() вписывает её в лист, поэтому
        // сохранённые смещения и масштаб организатора сохраняются как есть.
        base.layout = clampLayout(stored.layout, base.size);
        base.style = clampStyle(stored.style);
        if (stored.holes === 9) base.holes = 9;
        if (Array.isArray(stored.pars) && stored.pars.length) base.pars = stored.pars.slice(0, 18);
        if (Array.isArray(stored.indexes) && stored.indexes.length) base.indexes = stored.indexes.slice(0, 18);
        if (Array.isArray(stored.lengths) && stored.lengths.length) {
            var defs = defaultLengths();
            base.lengths = defs.map(function (def, i) {
                var v = parseInt(stored.lengths[i], 10);
                return isFinite(v) && v >= 0 && v <= 999 ? v : def;
            });
        }
        base.rowOrder = normalizeRowOrder(stored.rowOrder);
        base.rows = clampRows(stored.rows, base.style);
        base.design = clampDesign(stored.design);
        base.boxes = clampBoxes(stored.boxes, base.size);
        if (stored.text) base.text = Object.assign(base.text, stored.text);
        base.show = clampShow(stored.show);
        if (stored.footer) {
            base.footer = Object.assign(base.footer, stored.footer);
            // Подписи «Игрок / Маркер / Судья» по умолчанию НЕ печатаются.
            base.footer.print = stored.footer.print === true;
        }
        if (Array.isArray(stored.overlays)) {
            base.overlays = stored.overlays.map(function (ov) { return clampOverlay(ov, base.size); });
        }
        if (Array.isArray(stored.cards)) base.cards = stored.cards;
        if (stored.filters) base.filters = Object.assign(base.filters, stored.filters);
        base.logoSrc = stored.logoSrc || '';
        base.qrEnabled = !!stored.qrEnabled;
        base.orderLocked = !!stored.orderLocked;
        base.fillScores = !!stored.fillScores;
        base.updatedAt = Number(stored.updatedAt || 0);
        return base;
    }

    function ensureDraft() {
        if (!state.draft || state.draft._tid !== tid()) {
            state.draft = loadDraft();
            state.draft._tid = tid();
            state.dirty = false;
            state.selected = {};
            state.activeCardId = '';
            state.scores = null;
            state.scoresAt = 0;
            state.cardsSig = cardsSignature(state.draft.cards || []);
            state.remoteUpdatedAt = Number((storedDraft() || {}).updatedAt || 0);
        }
        return state.draft;
    }

    /**
     * Дизайн хранится один на турнир, поэтому правки с другого устройства
     * подхватываем сразу (если локально ничего не нарисовано).
     */
    function syncRemote() {
        var stored = storedDraft();
        var remote = Number((stored || {}).updatedAt || 0);
        if (remote === state.remoteUpdatedAt) return;
        state.remoteUpdatedAt = remote;
        if (state.dirty || state.drag || state.cardDrag) return;
        state.draft = null;
        ensureDraft();
    }

    function persistSoon() {
        if (!canWrite()) return;
        state.dirty = true;
        state.saveStatus = 'saving';
        updateSaveLabel();
        if (state.saveTimer) clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(persistNow, 400);
    }

    function persistNow() {
        if (!canWrite()) return Promise.resolve();
        var draft = ensureDraft();
        var payload = {
            size: draft.size,
            layout: draft.layout,
            style: draft.style,
            holes: draft.holes,
            pars: draft.pars,
            indexes: draft.indexes,
            lengths: draft.lengths,
            rowOrder: normalizeRowOrder(draft.rowOrder),
            rows: clampRows(draft.rows, draft.style),
            design: clampDesign(draft.design),
            boxes: clampBoxes(draft.boxes, draft.size),
            text: draft.text,
            show: draft.show,
            footer: draft.footer,
            overlays: draft.overlays,
            cards: draft.cards,
            filters: draft.filters,
            logoSrc: draft.logoSrc || null,
            qrEnabled: !!draft.qrEnabled,
            orderLocked: !!draft.orderLocked,
            fillScores: !!draft.fillScores,
            updatedAt: Date.now()
        };
        state.saveStatus = 'saving';
        updateSaveLabel();
        return data().write('tournaments/' + tid() + '/printScorecards', payload).then(function () {
            draft.updatedAt = payload.updatedAt;
            state.dirty = false;
            state.saveStatus = 'saved';
            state.remoteUpdatedAt = payload.updatedAt;
            updateSaveLabel();
        }).catch(function (err) {
            state.saveStatus = 'error';
            updateSaveLabel();
            ui().toastMsg(bi('Не удалось сохранить карточки', 'Could not save scorecards') + ': ' +
                (err && err.message ? err.message : err), 'error');
        });
    }

    function updateSaveLabel() {
        var el = ui().el && ui().el('tnpc-save');
        if (!el) return;
        el.classList.toggle('busy', state.saveStatus === 'saving');
        if (state.saveStatus === 'saving') el.textContent = bi('Сохранение…', 'Saving…');
        else if (state.saveStatus === 'saved') el.textContent = bi('Сохранено ✓', 'Saved ✓');
        else if (state.saveStatus === 'error') el.textContent = bi('Ошибка сохранения', 'Save failed');
        else el.textContent = '';
    }

    // ----------------------------------------------------------
    // СБОРКА КАРТОЧЕК ИЗ ЖИВЫХ ДАННЫХ ТУРНИРА
    // ----------------------------------------------------------
    function isActivePlayer(player) {
        if (!player) return false;
        if (player.active === false || player.withdrawn === true || player.skipMain === true) return false;
        if (player.status === 'inactive' || player.status === 'withdrawn') return false;
        return true;
    }

    function linkKey(player, entry) {
        var p = player || {};
        var e = entry || {};
        return String(p.pairId || p.teamId || p.linkId || p.partnerId || p.linkedTo || e.pairId || e.teamId || '').trim();
    }

    function pairFormat(fmt) {
        var s = String(fmt || '').toLowerCase();
        return /pair|пар|foursome|fourball|scramble|four-ball|alt.?shot/.test(s);
    }

    /**
     * Сборка карточек. Каждый playerId ровно один раз.
     * Связка: явный pair/team/link ИЛИ стартовая группа из 2 при парном формате.
     */
    function buildCards(players, sheetEntries, opts) {
        var options = opts || {};
        var used = {};
        var byId = {};
        (players || []).forEach(function (p) {
            if (p && p.id) byId[p.id] = p;
        });
        var entriesByPid = {};
        (sheetEntries || []).forEach(function (e) {
            if (e && e.playerId) entriesByPid[e.playerId] = e;
        });

        var buckets = {};
        var singles = [];
        (players || []).forEach(function (p) {
            if (!p || !p.id || used[p.id]) return;
            if (options.activeOnly && !isActivePlayer(p)) return;
            var entry = entriesByPid[p.id] || {};
            var key = linkKey(p, entry);
            if (key) {
                buckets[key] = buckets[key] || [];
                buckets[key].push(p.id);
            } else {
                singles.push(p.id);
            }
        });

        // парный формат + группа из 2 без явного link
        var groupBuckets = {};
        singles.slice().forEach(function (pid) {
            var e = entriesByPid[pid] || {};
            if (!pairFormat(e.format) || !e.startGroupId) return;
            groupBuckets[e.startGroupId] = groupBuckets[e.startGroupId] || [];
            groupBuckets[e.startGroupId].push(pid);
        });
        Object.keys(groupBuckets).forEach(function (gid) {
            var ids = groupBuckets[gid];
            if (ids.length < 2) return;
            var key = 'sg:' + gid;
            buckets[key] = (buckets[key] || []).concat(ids);
            ids.forEach(function (id) {
                var i = singles.indexOf(id);
                if (i !== -1) singles.splice(i, 1);
            });
        });

        function cardFromIds(ids, extra) {
            var unique = [];
            ids.forEach(function (id) {
                if (!id || used[id] || !byId[id]) return;
                used[id] = true;
                unique.push(id);
            });
            if (!unique.length) return null;
            var names = [];
            var hcps = [];
            var tees = [];
            var fieldHcps = [];
            var genders = [];
            var fores = [];
            var holes = [];
            var times = [];
            var flights = [];
            unique.forEach(function (id) {
                var p = byId[id];
                var e = entriesByPid[id] || {};
                names.push(core().playerFio(p));
                var hcp = p.hi != null ? p.hi : (p.handicap != null ? p.handicap : (e.hi != null ? e.hi : ''));
                hcps.push(hcp === '' || hcp == null ? '—' : hcp);
                tees.push(e.tee || p.tee || '');
                var fieldHcp = e.ch != null && e.ch !== '' ? e.ch
                    : (e.fieldHcp != null && e.fieldHcp !== '' ? e.fieldHcp
                        : (p.ch != null && p.ch !== '' ? p.ch : (p.fieldHcp != null && p.fieldHcp !== '' ? p.fieldHcp : null)));
                fieldHcps.push(fieldHcp);
                genders.push(e.gender || p.gender || '');
                fores.push(p.fores && typeof p.fores === 'object' ? p.fores : {});
                if (e.startHole) holes.push(Number(e.startHole));
                if (e.startTime) times.push(e.startTime);
                if (e.flight || e.groupName) flights.push(e.flight || e.groupName);
            });
            var expectedPair = unique.length > 1 || extra.pairLike;
            return Object.assign({
                id: extra.id || ('auto-' + unique.join('-')),
                playerIds: unique,
                names: names,
                hcps: hcps,
                tees: tees,
                fieldHcps: fieldHcps,
                genders: genders,
                fores: fores,
                tee: tees.filter(Boolean)[0] || tees[0] || '',
                startHole: holes.length ? Math.min.apply(null, holes) : 1,
                startTime: times.sort()[0] || '',
                flight: flights.filter(Boolean)[0] || '',
                manual: false,
                missingPair: !!(expectedPair && unique.length === 1),
                edits: null
            }, extra.rest || {});
        }

        var cards = [];
        Object.keys(buckets).forEach(function (key) {
            var c = cardFromIds(buckets[key], { pairLike: true, id: 'link-' + key });
            if (c) cards.push(c);
        });
        singles.forEach(function (pid) {
            if (used[pid]) return;
            var c = cardFromIds([pid], { pairLike: false });
            if (c) cards.push(c);
        });

        cards.sort(function (a, b) {
            var ta = String(a.startTime || '99:99');
            var tb = String(b.startTime || '99:99');
            if (ta !== tb) return ta.localeCompare(tb);
            var ha = Number(a.startHole) || 99;
            var hb = Number(b.startHole) || 99;
            if (ha !== hb) return ha - hb;
            var fa = String(a.flight || '');
            var fb = String(b.flight || '');
            if (fa !== fb) return fa.localeCompare(fb, 'ru');
            return String(a.names[0] || '').localeCompare(String(b.names[0] || ''), 'ru');
        });
        cards.forEach(function (c, i) { c.order = i; });
        return cards;
    }

    /** Ручные правки полей (edits) переживают обновление данных. */
    function applyCardEdits(autoCards, storedCards) {
        var map = {};
        (storedCards || []).forEach(function (c) { if (c && c.id) map[c.id] = c; });
        autoCards.forEach(function (card) {
            var prev = map[card.id];
            if (!prev || !prev.edits) return;
            var kept = {};
            CARD_TEXT_FIELDS.forEach(function (field) {
                if (prev.edits[field] && prev[field] !== undefined && prev[field] !== null) {
                    card[field] = prev[field];
                    kept[field] = true;
                }
            });
            card.edits = Object.keys(kept).length ? kept : null;
        });
        return autoCards;
    }

    function mergeManual(autoCards, storedCards) {
        var manuals = (storedCards || []).filter(function (c) { return c && c.manual; });
        var used = {};
        autoCards.forEach(function (c) { (c.playerIds || []).forEach(function (id) { used[id] = true; }); });
        manuals.forEach(function (m) {
            m.playerIds = (m.playerIds || []).filter(function (id) { return !used[id]; });
            if (!m.playerIds.length && !(m.names && m.names.length)) return;
            (m.playerIds || []).forEach(function (id) { used[id] = true; });
            autoCards.push(m);
        });
        return autoCards;
    }

    function applyStoredOrder(cards, stored) {
        if (!stored || !stored.length) return cards;
        var map = {};
        stored.forEach(function (c, i) { if (c && c.id) map[c.id] = c.order != null ? c.order : i; });
        cards.sort(function (a, b) {
            var oa = map[a.id];
            var ob = map[b.id];
            if (oa == null && ob == null) return 0;
            if (oa == null) return 1;
            if (ob == null) return -1;
            return oa - ob;
        });
        cards.forEach(function (c, i) { c.order = i; });
        return cards;
    }

    function cardsSignature(cards) {
        return (cards || []).map(function (c) {
            return [c.id, (c.names || []).join('+'), (c.hcps || []).join('/'), (c.fieldHcps || []).join('/'),
                (c.tees || []).join('/'), (c.genders || []).join('/'), c.tee, c.startHole, c.startTime,
                c.flight, c.manual ? 1 : 0, c.order].join('|');
        }).join(';');
    }

    function currentRid() {
        var rid = ui().state.route.rid || '';
        var rounds = ui().roundsOf();
        if (!rid && rounds[0]) rid = rounds[0].id;
        return rid;
    }

    /**
     * Привязка QR к раундам групп. Ссылка QR ведёт в rounds/<groupRoundId> —
     * её создаёт «Стартовый лист» (materializeRound). У турниров, чей лист
     * сохранён до появления этой привязки, groupRoundId пуст, и QR открывал
     * несуществующий раунд («нельзя ничего ввести»). Пересобираем привязку
     * один раз за сессию; статус живого раунда materializeRound сохраняет.
     */
    function healSheetLinks(rid, entries) {
        if (!rid || !entries || !entries.length || state.healTried[rid]) return;
        var tournament = ui().tournament() || {};
        if (String(tournament.status || '') === 'finished' || String(tournament.lifecycleStatus || '') === 'finished') {
            state.healTried[rid] = 'ok';
            return;
        }
        var roundIds = [];
        var missing = false;
        entries.forEach(function (entry) {
            if (!entry.groupRoundId) missing = true;
            else if (roundIds.indexOf(entry.groupRoundId) === -1) roundIds.push(entry.groupRoundId);
        });
        if (!missing && !roundIds.length) missing = true;
        state.healTried[rid] = 'running';
        var ok = (!missing && typeof data().read === 'function')
            ? Promise.all(roundIds.map(function (gid) {
                return data().read('rounds/' + gid).then(function (round) { return !!round; }).catch(function () { return true; });
            })).then(function (list) { return list.every(Boolean); })
            : Promise.resolve(!missing);
        ok.then(function (linksOk) {
            if (linksOk) { state.healTried[rid] = 'ok'; return null; }
            // Лист сохранён до появления привязки к раунду ввода счёта (или
            // раунды удалены) — пересобираем. Статус живого раунда
            // materializeRound сохраняет, счёт не трогает.
            return data().materializeRound(tid(), rid, ui().sheetOf(rid) || {}, tournament).then(function () {
                state.healTried[rid] = 'ok';
                ui().toastMsg(bi('Ссылки QR обновлены: карточки ведут на ввод счёта',
                    'QR links refreshed: cards open the score entry'), 'success');
            });
        }).catch(function () { state.healTried[rid] = 'ok'; });
    }

    /** Есть ли в стартовом листе привязка к раунду ввода счёта. */
    function sheetLinksReady(rid) {
        var entries = [];
        try { entries = data().sheetOrder(ui().sheetOf(rid) || {}); } catch (e) { entries = []; }
        if (!entries.length) return false;
        return entries.some(function (entry) { return !!entry.groupRoundId; });
    }

    /** Пересобрать карточки из текущих данных турнира (дизайн не трогает). */
    function refreshCards() {
        var draft = ensureDraft();
        var players = ui().playersOf();
        var rid = currentRid();
        var sheet = ui().sheetOf(rid) || {};
        var entries = data().sheetOrder(sheet);
        healSheetLinks(rid, entries);
        var auto = buildCards(players, entries, { activeOnly: false });
        auto = applyCardEdits(auto, draft.cards);
        auto = mergeManual(auto, draft.cards);
        if (draft.orderLocked) auto = applyStoredOrder(auto, draft.cards);
        draft.cards = auto;
        var sig = cardsSignature(auto);
        if (sig !== state.cardsSig) {
            state.cardsSig = sig;
            persistSoon();
        }
        return auto;
    }

    function visibleCards() {
        var draft = ensureDraft();
        var list = (draft.cards || []).slice();
        if (draft.filters.activeOnly) {
            var players = {};
            ui().playersOf().forEach(function (p) { players[p.id] = p; });
            list = list.filter(function (c) {
                return (c.playerIds || []).some(function (id) {
                    return isActivePlayer(players[id] || { id: id, active: true });
                }) || c.manual;
            });
        }
        if (draft.filters.selectedOnly) {
            list = list.filter(function (c) { return state.selected[c.id]; });
        }
        var q = String(state.query || '').trim().toLowerCase();
        if (q) {
            list = list.filter(function (c) {
                return (nameText(c) + ' ' + hcpText(c) + ' ' + (c.flight || '')).toLowerCase().indexOf(q) !== -1;
            });
        }
        return list;
    }

    function findCard(id) {
        return (ensureDraft().cards || []).filter(function (c) { return c.id === id; })[0] || null;
    }

    /** Карточка-эталон: раскрыта и редактируется; остальные свёрнуты. */
    function pickActive(cards) {
        var list = cards && cards.length ? cards : visibleCards();
        if (!list.length) return null;
        var found = list.filter(function (c) { return c.id === state.activeCardId; })[0];
        if (!found) found = list[0];
        state.activeCardId = found.id;
        return found;
    }

    // ----------------------------------------------------------
    // LIVE-СЧЁТ (необязательно: подставляет текущие удары)
    // ----------------------------------------------------------
    function ensureScores() {
        var draft = ensureDraft();
        if (!draft.fillScores) { state.scores = null; return; }
        if (state.scores && Date.now() - state.scoresAt < 20000) return;
        if (!data() || typeof data().readRoundScores !== 'function') return;
        state.scoresAt = Date.now();
        var rid = currentRid();
        if (!rid) { state.scores = {}; return; }
        data().readRoundScores(tid(), rid, ui().tournament() || {}).then(function (scores) {
            state.scores = scores || {};
            if (ui().state.route.tab === 'printcards' && ui().state.route.view === 'card') rerenderCard();
        }).catch(function () { state.scores = {}; });
    }

    function strokesOf(card, playerIndex) {
        var draft = ensureDraft();
        var n = holeCount();
        var out = [];
        var i;
        var pid = (card && card.playerIds || [])[playerIndex || 0];
        var map = (draft.fillScores && state.scores && pid && state.scores[pid]) || {};
        for (i = 0; i < n; i++) out.push(map[i + 1] == null ? '' : map[i + 1]);
        return out;
    }

    /** Сколько игроков на карточке (связка = два игрока, у каждого свои строки). */
    function playerCount(card) {
        return Math.max(1, (card && card.names || []).length, (card && card.hcps || []).length,
            (card && card.fieldHcps || []).length);
    }

    /** Русская форма числительного: 1 удар / 2 удара / 5 ударов. */
    function pluralRu(n, one, few, many) {
        var mod10 = n % 10;
        var mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
        return many;
    }

    /**
     * Удары форы наклонными черточками в правом верхнем углу клетки счёта:
     * одна черточка за каждый удар форы на этой лунке (как на бланке клуба).
     * Минусовая фора — красные черточки. У связки черточки каждого игрока
     * стоят своим рядом, поэтому видно, кому какой удар принадлежит.
     *
     * Черточки рисуются ВСЕГДА, если у игрока есть фора, — даже когда строка
     * «Фора» снята в панели «Состав информации» (d.show.fore === false):
     * на бланке клуба удар форы виден в клетке счёта независимо от того,
     * вынесена ли фора отдельной строкой. Раньше вместе со строкой пропадал и
     * сам удар форы, и карточка печаталась без черточек.
     */
    function foreMarksHtml(card, holeIndex, playerIndex) {
        var index = playerIndex == null ? 0 : playerIndex;
        var value = parseInt(foreValues(card, index)[holeIndex], 10);
        if (!isFinite(value) || !value) return '';
        var cnt = Math.abs(value);
        var bars = [];
        for (var i = 0; i < cnt; i++) bars.push('<i class="tnpc-mark"></i>');
        var name = (card && card.names || [])[index] || '';
        var title = bi('Фора: ', 'Handicap: ') + cnt + ' ' +
            pluralRu(cnt, 'удар', 'удара', 'ударов') + (value < 0 ? bi(' (минусовая)', ' (given)') : '') +
            (name ? ' · ' + name : '');
        return '<span class="tnpc-marks' + (value < 0 ? ' minus' : '') + '" title="' + esc(title) + '">' +
            bars.join('') + '</span>';
    }

    function sumValues(values) {
        var sum = 0;
        var seen = false;
        (values || []).forEach(function (v) {
            var n = parseInt(v, 10);
            if (isFinite(n) && String(v) !== '') { sum += n; seen = true; }
        });
        return seen ? sum : '';
    }

    // ----------------------------------------------------------
    // РАЗМЕРЫ И СОДЕРЖИМОЕ КАРТОЧКИ
    // ----------------------------------------------------------
    function holeCount() { return ensureDraft().holes === 9 ? 9 : 18; }

    function parSum(from, to) {
        var pars = ensureDraft().pars;
        var s = 0;
        for (var i = from; i < to; i++) s += Number(pars[i]) || 0;
        return s;
    }

    function nameText(card) { return ((card && card.names) || []).join(' + '); }
    function hcpText(card) { return ((card && card.hcps) || []).join(' / '); }
    /** Полевой (игровой) гандикап каждого игрока карточки: «14» или «14 / 9». */
    function fieldHcpText(card) {
        var count = Math.max(1, ((card && card.hcps) || []).length, ((card && card.names) || []).length);
        var out = [];
        for (var i = 0; i < count; i++) {
            var v = fieldHcpFor(card, i);
            if (v === null || v === undefined || !isFinite(Number(v))) out.push('—');
            else out.push(Number(v) < 0 ? '+' + Math.abs(Number(v)) : String(v));
        }
        return out.join(' / ');
    }

    function displayLang() {
        return ui().lang ? ui().lang() : (root.currentLang === 'en' ? 'en' : 'ru');
    }

    function teeDisplayName(value) {
        var raw = String(value == null ? '' : value).trim();
        if (!raw) return '—';
        var key = raw.toLowerCase().replace(/[ё]/g, 'е').replace(/\s+/g, ' ');
        var colors = {
            bk: { ru: 'Чёрные', en: 'Black' }, black: { ru: 'Чёрные', en: 'Black' },
            'черный': { ru: 'Чёрные', en: 'Black' }, 'черная': { ru: 'Чёрные', en: 'Black' },
            'черные': { ru: 'Чёрные', en: 'Black' }, 'черн': { ru: 'Чёрные', en: 'Black' },
            bl: { ru: 'Синие', en: 'Blue' }, blue: { ru: 'Синие', en: 'Blue' },
            'синий': { ru: 'Синие', en: 'Blue' }, 'синяя': { ru: 'Синие', en: 'Blue' },
            'синие': { ru: 'Синие', en: 'Blue' }, 'син': { ru: 'Синие', en: 'Blue' },
            wh: { ru: 'Белые', en: 'White' }, white: { ru: 'Белые', en: 'White' },
            'белый': { ru: 'Белые', en: 'White' }, 'белая': { ru: 'Белые', en: 'White' },
            'белые': { ru: 'Белые', en: 'White' }, 'бел': { ru: 'Белые', en: 'White' },
            rd: { ru: 'Красные', en: 'Red' }, red: { ru: 'Красные', en: 'Red' },
            'красный': { ru: 'Красные', en: 'Red' }, 'красная': { ru: 'Красные', en: 'Red' },
            'красные': { ru: 'Красные', en: 'Red' }, 'красн': { ru: 'Красные', en: 'Red' },
            gd: { ru: 'Золотые', en: 'Gold' }, gold: { ru: 'Золотые', en: 'Gold' },
            'золотой': { ru: 'Золотые', en: 'Gold' }, 'золотая': { ru: 'Золотые', en: 'Gold' },
            'золотые': { ru: 'Золотые', en: 'Gold' }, 'золот': { ru: 'Золотые', en: 'Gold' },
            yl: { ru: 'Жёлтые', en: 'Yellow' }, ye: { ru: 'Жёлтые', en: 'Yellow' },
            yel: { ru: 'Жёлтые', en: 'Yellow' }, yellow: { ru: 'Жёлтые', en: 'Yellow' },
            'желтый': { ru: 'Жёлтые', en: 'Yellow' }, 'желтая': { ru: 'Жёлтые', en: 'Yellow' },
            'желтые': { ru: 'Жёлтые', en: 'Yellow' }, 'желт': { ru: 'Жёлтые', en: 'Yellow' },
            gr: { ru: 'Зелёные', en: 'Green' }, green: { ru: 'Зелёные', en: 'Green' },
            'зеленый': { ru: 'Зелёные', en: 'Green' }, 'зеленая': { ru: 'Зелёные', en: 'Green' },
            'зеленые': { ru: 'Зелёные', en: 'Green' }, 'зелен': { ru: 'Зелёные', en: 'Green' }
        };
        var color = colors[key];
        if (color) return color[displayLang()] || color.ru;
        var configured = root.TEES && root.TEES[key];
        return configured || raw;
    }

    function teeCode(value) {
        var key = String(value == null ? '' : value).trim().toLowerCase().replace(/[ё]/g, 'е');
        var codes = {
            bk: 'bk', black: 'bk', 'черный': 'bk', 'черная': 'bk', 'черные': 'bk', 'черн': 'bk',
            bl: 'bl', blue: 'bl', 'синий': 'bl', 'синяя': 'bl', 'синие': 'bl', 'син': 'bl',
            wh: 'wh', white: 'wh', 'белый': 'wh', 'белая': 'wh', 'белые': 'wh', 'бел': 'wh',
            rd: 'rd', red: 'rd', 'красный': 'rd', 'красная': 'rd', 'красные': 'rd', 'красн': 'rd',
            gd: 'gd', gold: 'gd', 'золотой': 'gd', 'золотая': 'gd', 'золотые': 'gd', 'золот': 'gd',
            yl: 'yl', ye: 'yl', yel: 'yl', yellow: 'yl',
            'желтый': 'yl', 'желтая': 'yl', 'желтые': 'yl', 'желт': 'yl',
            gr: 'gr', green: 'gr', 'зеленый': 'gr', 'зеленая': 'gr', 'зеленые': 'gr', 'зелен': 'gr'
        };
        return codes[key] || key;
    }

    function fieldHcpFor(card, playerIndex) {
        var index = playerIndex || 0;
        var editedHcp = !!(card && card.edits && card.edits.hcps);
        var editedTee = !!(card && card.edits && card.edits.tee);
        var stored = (card && card.fieldHcps || [])[index];
        var editedField = !!(card && card.edits && card.edits.fieldHcps);
        if (editedField && stored !== null && stored !== undefined && stored !== '' && stored !== '—') {
            var parsedEdited = parseFloat(String(stored).replace(',', '.').replace(/^\+/, '-'));
            if (isFinite(parsedEdited)) return Math.round(parsedEdited);
        }
        if (!editedHcp && !editedTee && stored !== null && stored !== undefined && stored !== '') {
            var parsedStored = parseFloat(String(stored).replace(',', '.'));
            return isFinite(parsedStored) ? Math.round(parsedStored) : null;
        }
        var rawHcp = (card && card.hcps || [])[index];
        if (rawHcp === null || rawHcp === undefined || rawHcp === '' || rawHcp === '—') return null;
        var tee = teeCode((editedTee ? card.tee : (card && card.tees || [])[index]) || (card && card.tee) || 'wh');
        var gender = (card && card.genders || [])[index] || 'men';
        if (typeof root.getFieldHcp === 'function') {
            try {
                var calculated = root.getFieldHcp(rawHcp, tee, gender);
                if (calculated !== null && calculated !== undefined && isFinite(Number(calculated))) return Math.round(Number(calculated));
            } catch (e) { /* use the core fallback below */ }
        }
        var ratings = root.COURSE_RATINGS || {};
        var rating = (ratings[gender] || {})[tee] || null;
        if (core().courseHandicap) return core().courseHandicap(rawHcp, rating, root.TOTAL_PAR || 72);
        var hcp = parseFloat(String(rawHcp).replace(',', '.'));
        return isFinite(hcp) ? Math.round(hcp) : null;
    }

    function handicapStrokesOnHole(fieldHcp, index) {
        if (core().foreOnHole) return core().foreOnHole(index, fieldHcp);
        var hcp = parseInt(fieldHcp, 10) || 0;
        var si = parseInt(index, 10) || 0;
        if (hcp > 0) return Math.floor(hcp / 18) + (si <= hcp % 18 ? 1 : 0);
        if (hcp < 0) {
            var abs = Math.abs(hcp);
            return -(Math.floor(abs / 18) + ((19 - si) <= abs % 18 ? 1 : 0));
        }
        return 0;
    }

    function foreValues(card, playerIndex) {
        var d = ensureDraft();
        var n = holeCount();
        var index = playerIndex || 0;
        var fieldHcp = fieldHcpFor(card, index);
        var explicit = (card && card.fores || [])[index] || {};
        var out = [];
        for (var i = 0; i < n; i++) {
            var hole = i + 1;
            var override = explicit[hole] != null ? explicit[hole] : explicit[String(hole)];
            if (override !== null && override !== undefined && override !== '') out.push(override);
            else if (fieldHcp === null || fieldHcp === undefined) out.push('');
            else {
                var si = parseInt(d.indexes[i], 10) || hole;
                out.push(handicapStrokesOnHole(fieldHcp, si));
            }
        }
        return out;
    }

    function titleText() {
        var d = ensureDraft();
        var t = ui().tournament() || {};
        return String(d.text.tournamentName || t.name || '').trim();
    }
    function subtitleText() {
        var d = ensureDraft();
        var t = ui().tournament() || {};
        if (String(d.text.subtitle || '').trim()) return String(d.text.subtitle).trim();
        return [t.club, t.course].filter(Boolean).join(' · ');
    }
    function dateText() {
        var d = ensureDraft();
        var t = ui().tournament() || {};
        if (String(d.text.date || '').trim()) return String(d.text.date).trim();
        var raw = t.startDate || t.date || '';
        return core().dateRu ? core().dateRu(raw) : raw;
    }

    /** CSS-переменные размеров: один источник для экрана и печати. */
    function styleVars(style, design) {
        var s = clampStyle(style);
        var de = clampDesign(design);
        return '--tnpc-pad:' + s.padMm + 'mm;' +
            '--tnpc-title:' + s.titleMm + 'mm;' +
            '--tnpc-name:' + s.nameMm + 'mm;' +
            '--tnpc-meta:' + s.metaMm + 'mm;' +
            '--tnpc-table:' + s.tableMm + 'mm;' +
            '--tnpc-row-h:' + s.rowHMm + 'mm;' +
            '--tnpc-lab-w:' + s.labWMm + 'mm;' +
            '--tnpc-sum-w:' + s.sumWMm + 'mm;' +
            '--tnpc-foot:' + s.footMm + 'mm;' +
            '--tnpc-head-gap:' + s.headGapMm + 'mm;' +
            '--tnpc-foot-gap:' + s.footGapMm + 'mm;' +
            '--tnpc-line:' + s.lineMm + 'mm;' +
            '--tnpc-ink:' + de.ink + ';' +
            '--tnpc-paper:' + de.paper + ';' +
            '--tnpc-linec:' + de.line + ';' +
            '--tnpc-sumbg:' + de.sumBg + ';' +
            '--tnpc-font:' + (de.font || 'Arial,Helvetica,sans-serif') + ';';
    }

    function cardStyleAttr(draft, slot, local) {
        var d = draft || ensureDraft();
        var size = clampSize(d.size);
        // «Только карточка» — без листа, поэтому масштаб берём из раскладки как есть.
        var p = local
            ? { xMm: 0, yMm: 0, scale: clampLayout(d.layout, size).scale }
            : placement(d.layout, size, slot || 0);
        return 'left:' + p.xMm + 'mm;top:' + p.yMm + 'mm;width:' + size.wMm + 'mm;height:' + size.hMm + 'mm;' +
            'transform:scale(' + p.scale + ');' + styleVars(d.style, d.design);
    }

    /**
     * CSS внутренностей карточки — ОДИН текст для предпросмотра и для
     * печати, поэтому экран всегда показывает то, что ляжет на бумагу.
     */
    function cardCssText() {
        return '.tnpc-card{position:absolute;background:var(--tnpc-paper,#fff);color:var(--tnpc-ink,#111);box-sizing:border-box;' +
            'font-family:var(--tnpc-font,Arial,Helvetica,sans-serif);overflow:hidden;transform-origin:top left;' +
            'border:calc(var(--tnpc-line,0.25mm) * 1.6) solid var(--tnpc-linec,#111)}' +
            '.tnpc-card-inner{position:relative;width:100%;height:100%;padding:var(--tnpc-pad,5mm);' +
            'box-sizing:border-box;display:flex;flex-direction:column}' +
            '.tnpc-head{text-align:center;border-bottom:var(--tnpc-line,0.25mm) solid var(--tnpc-linec,#111);' +
            'padding-bottom:var(--tnpc-head-gap,2mm);margin-bottom:var(--tnpc-head-gap,2mm);flex:0 0 auto}' +
            '.tnpc-title{font-weight:800;font-size:var(--tnpc-title,4.2mm);line-height:1.15;letter-spacing:.01em}' +
            '.tnpc-subtitle{font-size:var(--tnpc-meta,3.1mm);margin-top:.6mm;color:var(--tnpc-ink,#111);opacity:.72}' +
            '.tnpc-name{font-weight:800;font-size:var(--tnpc-name,4.6mm);margin-top:1.4mm;line-height:1.15}' +
            '.tnpc-meta{font-size:var(--tnpc-meta,3.1mm);margin-top:.8mm;line-height:1.25}' +
            '.tnpc-body{flex:1 1 auto;min-height:0}' +
            /* Шапка и таблица — «блоки целиком»: их можно освободить из
               потока карточки и поставить в любую точку (left/top/width в мм). */
            '.tnpc-box{position:relative}' +
            '.tnpc-box.free{position:absolute;flex:none;margin:0;z-index:1}' +
            '.tnpc-card-inner.tb-free .tnpc-foot{margin-top:auto}' +
            /* Каждый блок таблицы — отдельная таблица в своей обёртке: у блока
               свои CSS-переменные (--tnpc-table/--tnpc-row-h/--tnpc-lab-w) и
               свой цвет/фон/шрифт, поэтому блоки можно растягивать и красить
               по отдельности. Соседние блоки соприкасаются без двойной линии:
               следующий подтянут на толщину линии вверх. */
            '.tnpc-block{position:relative}' +
            '.tnpc-block+.tnpc-block{margin-top:calc(var(--tnpc-line,0.25mm) * -1)}' +
            '.tnpc-block.b .tnpc-table td{font-weight:800}' +
            '.tnpc-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:var(--tnpc-table,2.9mm)}' +
            '.tnpc-table td{border:var(--tnpc-line,0.25mm) solid var(--tnpc-linec,#111);text-align:center;position:relative;' +
            'padding:.5mm .2mm;height:var(--tnpc-row-h,6.4mm);overflow:hidden}' +
            '.tnpc-marks{position:absolute;top:.15mm;right:.15mm;display:inline-flex;align-items:flex-start;' +
            'gap:.25mm;pointer-events:none;color:inherit}' +
            /* Наклонная палочка рисуется через linear-gradient без transform —
               некоторые движки печати игнорируют transform, и тонкие (0.3мм)
               полоски просто не попадали на бумагу. Градиент рисуется
               пиксель-в-пиксель браузером и одинаково работает на экране и
               при печати. */
            '.tnpc-mark{display:block;width:.5mm;height:1.8mm;' +
            'background:linear-gradient(125deg,currentColor 0 45%,transparent 45% 100%);' +
            'color:inherit}' +
            '.tnpc-marks.minus{color:#a11414}' +
            '.tnpc-table .lab{text-align:left;font-weight:700;width:var(--tnpc-lab-w,15mm);padding:0 .2mm 0 1mm;position:relative}' +
            '.tnpc-row-label{display:inline-block;max-width:calc(100% - 4.8mm);overflow:hidden;white-space:nowrap;' +
            'vertical-align:middle;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none}' +
            '.tnpc-row-label:active{cursor:grabbing}' +
            '.tnpc-row-tools{position:absolute;right:.1mm;top:50%;transform:translateY(-50%);display:inline-flex;gap:0;z-index:1}' +
            '.tnpc-row-move{width:2.2mm;min-width:2.2mm;height:4mm;padding:0;border:0;background:transparent;' +
            'color:#555;font:700 2.4mm Arial,sans-serif;line-height:1;cursor:pointer}' +
            '.tnpc-row-move:hover{color:#111;background:#e8dfc9}' +
            '.tnpc-table-row.drop-target td{border-top:.6mm solid #c9a227}' +
            '.tnpc-table .sum{font-weight:800;background:var(--tnpc-b-bg,var(--tnpc-sumbg,#efefef));width:var(--tnpc-sum-w,11.5mm)}' +
            '.tnpc-empty{background:var(--tnpc-b-bg,#fff)}' +
            '.tnpc-foot{display:flex;gap:4mm;margin-top:var(--tnpc-foot-gap,4mm);flex:0 0 auto}' +
            '.tnpc-sign{flex:1;border-top:var(--tnpc-line,0.25mm) solid var(--tnpc-linec,#111);padding-top:1.2mm;' +
            'font-size:var(--tnpc-foot,2.8mm);text-align:center;min-height:calc(var(--tnpc-foot,2.8mm) * 2)}' +
            '.tnpc-overlay{position:absolute;box-sizing:border-box}' +
            '.tnpc-overlay img{width:100%;height:100%;object-fit:contain;display:block}' +
            '.tnpc-ov-text{width:100%;height:100%;overflow:hidden;white-space:pre-wrap;text-align:left;' +
            'font-size:var(--tnpc-ov-font,3mm);line-height:1.2}' +
            '.tnpc-ov-block{width:100%;height:100%;overflow:hidden;box-sizing:border-box;padding:.4mm 1mm;' +
            'display:flex;flex-direction:column;justify-content:center;font-size:var(--tnpc-ov-font,3mm);line-height:1.25}' +
            '.tnpc-ov-block-t{white-space:pre-wrap;word-break:break-word}' +
            '.tnpc-ov-block.b{font-weight:800}' +
            '.tnpc-ov-block.bd-box{border:var(--tnpc-line,0.25mm) solid var(--tnpc-linec,#111)}' +
            '.tnpc-ov-block.bd-bottom{border-bottom:var(--tnpc-line,0.25mm) solid var(--tnpc-linec,#111)}';
    }

    /** Предпросмотр использует тот же CSS, что и печать (инжектим один раз). */
    function ensureCardStyle() {
        var d = doc();
        if (!d || !d.head) return;
        var id = 'tnpc-card-css';
        var node = d.getElementById(id);
        var css = cardCssText();
        if (!node) {
            node = d.createElement('style');
            node.id = id;
            node.textContent = css;
            d.head.appendChild(node);
            return;
        }
        if (node.textContent !== css) node.textContent = css;
    }

    function overlayHtml(ov, card, printMode) {
        var d = ensureDraft();
        var o = clampOverlay(ov, d.size);
        var disabled = !o.enabled;
        if (printMode && disabled) return '';
        var style = 'left:' + o.xMm + 'mm;top:' + o.yMm + 'mm;width:' + o.wMm + 'mm;height:' + o.hMm + 'mm;' +
            '--tnpc-ov-font:' + o.fontMm + 'mm;';
        var inner = '';
        if (o.type === 'logo' || o.type === 'image') {
            var src = o.type === 'logo' ? (d.logoSrc || o.src) : o.src;
            if (src) inner = '<img alt="' + esc(o.type === 'logo' ? 'logo' : 'image') + '" src="' + esc(src) + '">';
            else if (!printMode) {
                inner = '<div class="tnpc-ph" data-tnm-act="' + (o.type === 'logo' ? 'tnpc-logo-ph' : 'tnpc-image-ph') +
                    '" data-id="' + esc(o.id) + '">' +
                    esc(o.type === 'logo' ? bi('Загрузить лого', 'Upload logo') : bi('Загрузить картинку', 'Upload image')) + '</div>';
            }
        } else if (o.type === 'qr') {
            var payload = o.payload || qrPayloadFor(card, o);
            if (payload) inner = '<img data-qr alt="qr" src="' + esc(core().qrImageUrl(payload, 320)) + '">';
            else if (!printMode) inner = '<div class="tnpc-ph">' + esc(bi('Нет ссылки для QR', 'No QR payload')) + '</div>';
        } else if (o.type === 'block') {
            var resolved = blockText(o.text, card);
            if (!printMode && !resolved.trim()) resolved = o.title || bi('Свой блок', 'Custom block');
            var bstyle = 'text-align:' + o.align + ';' + (o.color ? 'color:' + o.color + ';' : '') +
                (o.bg ? 'background:' + o.bg + ';' : '');
            inner = '<div class="tnpc-ov-block bd-' + o.border + (o.bold ? ' b' : '') + '" style="' + bstyle + '">' +
                '<div class="tnpc-ov-block-t">' + esc(resolved) + '</div></div>';
        } else {
            var txt = o.text || '';
            if (!printMode && !txt) txt = bi('Текст на карточке', 'Card text');
            inner = '<div class="tnpc-ov-text"' + (printMode ? '' : ' contenteditable="true" data-tnpc-overlay-text="' + esc(o.id) + '"') +
                '>' + esc(txt) + '</div>';
        }
        var chrome = printMode ? '' : (
            '<span class="tnpc-tag">' + esc(overlayLabel(o)) + (disabled ? ' · ' + esc(bi('выкл', 'off')) : '') + '</span>' +
            '<span class="tnpc-handle" data-tnpc-resize="' + esc(o.id) + '"></span>' +
            '<span class="tnpc-x" data-tnm-act="tnpc-overlay-del" data-id="' + esc(o.id) + '">×</span>'
        );
        return '<div class="tnpc-overlay' + (disabled && !printMode ? ' off' : '') + '" data-overlay-id="' + esc(o.id) +
            '" data-type="' + esc(o.type) + '" style="' + style + '">' + inner + chrome + '</div>';
    }

    function overlayLabel(o) {
        if (o.type === 'qr') return 'QR';
        if (o.type === 'logo') return bi('Лого', 'Logo');
        if (o.type === 'image') return bi('Картинка', 'Image');
        if (o.type === 'block') return o.title || bi('Свой блок', 'Custom block');
        return bi('Текст', 'Text');
    }

    /** Строки стартового листа текущего раунда (для маркера, группы…). */
    function currentSheetEntries() {
        var rid = currentRid() || tid();
        try { return data().sheetOrder(ui().sheetOf(rid) || {}) || []; } catch (e) { return []; }
    }
    function playerNameById(id) {
        if (!id) return '';
        var p = null;
        try { p = ui().playerOf(id); } catch (e) { p = null; }
        return p ? core().playerFio(p) : '';
    }
    function fioParts(name) {
        var parts = core().splitFio ? core().splitFio(name || '') : null;
        if (parts) return parts;
        var words = String(name || '').trim().split(/\s+/);
        return { lastName: words[0] || '', firstName: words.slice(1).join(' ') };
    }
    function joinUnique(list) {
        var seen = {};
        return list.filter(function (v) {
            if (!v || seen[v]) return false;
            seen[v] = true;
            return true;
        }).join(' / ');
    }
    /**
     * Значения подстановок своего блока для карточки. Маркер — тот, кто
     * ведёт счёт игрока по стартовому листу (как у QR); у парной карточки
     * значения игроков перечисляются через « / ».
     */
    function blockValues(card) {
        var c = card || {};
        var ids = c.playerIds || [];
        var names = (c.names && c.names.length) ? c.names : ids.map(playerNameById);
        var entries = currentSheetEntries();
        var markers = [];
        var groups = [];
        ids.forEach(function (pid) {
            var entry = entries.filter(function (item) { return item.playerId === pid; })[0];
            if (!entry) return;
            if (entry.groupName) groups.push(entry.groupName);
            var mid = markerIdFor(entry, entries);
            if (mid && mid !== pid) markers.push(playerNameById(mid) || entry.markerName || '');
        });
        var markerParts = markers.map(fioParts);
        var playerParts = names.map(fioParts);
        return {
            player: names.join(' / '),
            lastName: joinUnique(playerParts.map(function (x) { return x.lastName; })),
            firstName: joinUnique(playerParts.map(function (x) { return x.firstName; })),
            marker: joinUnique(markers),
            markerLast: joinUnique(markerParts.map(function (x) { return x.lastName; })),
            markerFirst: joinUnique(markerParts.map(function (x) { return x.firstName; })),
            hcp: hcpText(c),
            fieldHcp: fieldHcpText(c),
            tee: c.tee ? teeDisplayName(c.tee) : '',
            hole: String(c.startHole || 1),
            time: c.startTime || '',
            flight: c.flight || '',
            group: joinUnique(groups) || c.groupName || '',
            tournament: titleText(),
            date: dateText(),
            club: subtitleText()
        };
    }
    /** Подставить значения в шаблон блока: «Маркер: {marker}» → «Маркер: Иванов Иван». */
    function blockText(template, card) {
        var values = null;
        return String(template || '').replace(/\{([a-zA-Z]+)\}/g, function (all, key) {
            if (!values) values = blockValues(card);
            return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] == null ? '' : values[key]) : all;
        });
    }

    /** Игрок карточки, которому принадлежит QR-оверлей (по счёту QR-блоков). */
    function qrCardPlayer(card, ov) {
        var ids = (card && card.playerIds) || [];
        var idx = 0;
        var n = 0;
        ensureDraft().overlays.forEach(function (item) {
            if (item.type === 'qr' && item.id === ov.id) idx = n;
            if (item.type === 'qr') n++;
        });
        return ids[idx] || ids[0] || '';
    }

    /** Игроки стартовой группы (по startGroupId, иначе флайт+лунка+время). */
    function startGroupEntries(entry, entries) {
        if (!entry) return [];
        return (entries || []).filter(function (item) {
            return entry.startGroupId ? item.startGroupId === entry.startGroupId :
                (item.flight === entry.flight && item.startTime === entry.startTime && item.startHole === entry.startHole);
        }).sort(function (a, b) {
            return (a.position || 0) - (b.position || 0) || (a.order || 0) - (b.order || 0);
        });
    }

    /**
     * Кто ведёт счёт игрока: назначенный маркер из стартового листа, иначе —
     * следующий по кольцу стартовой группы (та же логика, что в
     * markerQrIndex/materializeRound; используется в текстовом блоке маркера).
     */
    function markerIdFor(entry, entries) {
        if (!entry) return '';
        var group = startGroupEntries(entry, entries);
        var inGroup = {};
        group.forEach(function (item) { inGroup[item.playerId] = true; });
        // Чужой маркер (не из этой стартовой группы) не участвует в раунде
        // rounds/<groupRoundId> и не сможет ввести счёт — берём кольцо.
        var explicit = entry.markerPlayerId || '';
        if (explicit && inGroup[explicit]) return explicit;
        if (group.length > 1) {
            var index = group.map(function (item) { return item.playerId; }).indexOf(entry.playerId);
            if (index === -1) index = 0;
            return group[(index + 1) % group.length].playerId;
        }
        return entry.playerId;
    }

    /**
     * Персональный QR открывает ввод от имени игрока на карточке («Я»),
     * а не его маркера. Старые сохранённые ссылки могли вести к маркеру,
     * поэтому всегда строим ссылку по актуальным playerId и groupRoundId.
     * Без раунда группы допускается только явно заданная ручная ссылка.
     */
    function qrPayloadFor(card, ov) {
        var pid = qrCardPlayer(card, ov);
        if (!pid) return ov.payload || '';
        var rid = currentRid() || tid();
        var entries = [];
        try { entries = data().sheetOrder(ui().sheetOf(rid) || {}); } catch (e) { entries = []; }
        var entry = entries.filter(function (item) { return item.playerId === pid; })[0];
        if (!entry || !entry.groupRoundId) return ov.payload || '';
        var groupSize = startGroupEntries(entry, entries).length || 1;
        var base = ui().baseUrl ? ui().baseUrl() : (root.location ? (root.location.origin + '/') : '');
        return core().scoreUrl(base, entry.groupRoundId, pid, groupSize);
    }

    /** Подпись явно объясняет, кто будет выбран как «Я» после сканирования. */
    function qrOwnerText(card) {
        var ids = (card && card.playerIds) || [];
        if (!ids.length) return '';
        var rid = currentRid() || tid();
        var entries = [];
        try { entries = data().sheetOrder(ui().sheetOf(rid) || {}); } catch (e) { entries = []; }
        var names = ids.map(function (pid) {
            var entry = entries.filter(function (item) { return item.playerId === pid; })[0];
            return entry && entry.groupRoundId ? entry.playerName || core().playerFio(ui().playerOf(pid) || {}) || pid : '';
        }).filter(Boolean);
        if (!names.length) return '';
        return bi('Персональный QR — «Я»: ', 'Personal QR — “Me”: ') + names.join(', ');
    }

    function tableHtml(card, printMode) {
        var d = ensureDraft();
        var n = holeCount();
        var pars = d.pars;
        var indexes = d.indexes;
        var outN = Math.min(9, n);
        var inN = Math.max(0, n - outN);
        var showTotals = d.show.totals !== false;
        var editable = !printMode;
        var ed = editable ? ' contenteditable="true"' : '';

        function tableLabel(key, label, withControls, hint) {
            var controls = '';
            var draggable = '';
            if (editable) {
                var dragTitle = bi('Перетащить строку', 'Drag to move row');
                draggable = ' draggable="true" tabindex="0" data-tnpc-row-handle="' + key +
                    '" aria-label="' + esc(dragTitle + ': ' + (hint || label)) + '" title="' + esc(hint || dragTitle) + '"';
                if (withControls !== false) {
                    controls = '<span class="tnpc-row-tools">' +
                        '<button type="button" class="tnpc-row-move" data-tnm-act="tnpc-table-row-up" data-id="' + key +
                        '" aria-label="' + esc(bi('Переместить строку вверх', 'Move row up')) + '" title="' +
                        esc(bi('Вверх', 'Move up')) + '">↑</button>' +
                        '<button type="button" class="tnpc-row-move" data-tnm-act="tnpc-table-row-down" data-id="' + key +
                        '" aria-label="' + esc(bi('Переместить строку вниз', 'Move row down')) + '" title="' +
                        esc(bi('Вниз', 'Move down')) + '">↓</button></span>';
                }
            }
            return '<td class="lab"><span class="tnpc-row-label"' + draggable + '>' + label + '</span>' + controls + '</td>';
        }
        function holeCells(from, to) {
            var html = '';
            for (var holeIndex = from; holeIndex < to; holeIndex++) html += '<td>' + (holeIndex + 1) + '</td>';
            return html;
        }
        function valueCells(kind, values, from, to, canEdit, playerIndex) {
            var html = '';
            for (var holeIndex = from; holeIndex < to; holeIndex++) {
                var value = values[holeIndex] == null ? '' : values[holeIndex];
                // Длина 0 = «нет данных»: клетка пустая, в итоги не идёт.
                if (kind === 'len' && !(Number(value) > 0)) value = '';
                if (kind === 'strokes') {
                    html += '<td class="tnpc-empty">' + esc(value) +
                        foreMarksHtml(card, holeIndex, playerIndex) + '</td>';
                } else if (editable && canEdit) {
                    html += '<td><span' + ed + ' data-tnpc-grid="' + kind + '" data-h="' + holeIndex + '">' + esc(value) + '</span></td>';
                } else {
                    html += '<td>' + esc(value) + '</td>';
                }
            }
            return html;
        }
        function sumFor(kind, values, from, to) {
            if (kind === 'par') return parSum(from, to);
            if (kind === 'len') return lenSum(values, from, to);
            if (kind === 'strokes') return sumValues(values.slice(from, to));
            return '';
        }
        function sumCell(kind, values, from, to) {
            return '<td class="sum">' + esc(sumFor(kind, values, from, to)) + '</td>';
        }
        function dataRowCells(kind, values, canEdit, playerIndex) {
            var html = valueCells(kind, values, 0, outN, canEdit, playerIndex);
            if (showTotals) html += sumCell(kind, values, 0, outN);
            html += valueCells(kind, values, outN, n, canEdit, playerIndex);
            if (showTotals) html += inN
                ? sumCell(kind, values, outN, n) + sumCell(kind, values, 0, n)
                : sumCell(kind, values, 0, n);
            return html;
        }
        function tableLine(key, label, content, withControls, hint) {
            return '<tr>' + tableLabel(key, label, withControls, hint) + content + '</tr>';
        }
        function tableBlock(key, lines) {
            return '<tbody class="tnpc-table-row" data-tnpc-table-row="' + key + '">' + lines + '</tbody>';
        }
        /** Строка «Удары»: у связки свой ряд на каждого игрока. */
        function strokesBlock() {
            var count = playerCount(card);
            var lines = '';
            for (var playerIndex = 0; playerIndex < count; playerIndex++) {
                var label = count > 1
                    ? bi('Удары', 'Strokes') + ' ' + (playerIndex + 1)
                    : bi('Удары', 'Strokes');
                var playerName = (card && card.names || [])[playerIndex] || '';
                var hint = playerName ? bi('Удары игрока: ', 'Strokes for: ') + playerName : label;
                lines += tableLine('strokes', esc(label),
                    dataRowCells('strokes', strokesOf(card, playerIndex), false, playerIndex),
                    playerIndex === 0, hint);
            }
            return tableBlock('strokes', lines);
        }
        /**
         * Строки «Длина»: по одной на каждый ТИ карточки (у связки с разными
         * ТИ — каждому игроку свой ряд). Ряд из справочника ТИ только для
         * чтения; запасной ряд панели редактируется, как раньше.
         */
        function lengthLines() {
            var count = playerCount(card);
            var seen = {};
            var rows = [];
            for (var playerIndex = 0; playerIndex < count; playerIndex++) {
                var src = cardLengths(card, playerIndex);
                var key = (src.fallback ? 'draft' : src.tee);
                if (seen[key]) continue;
                seen[key] = true;
                rows.push(src);
            }
            var multi = rows.length > 1;
            var lines = '';
            rows.forEach(function (src, i) {
                // Подпись строки — ровно «Длина»: колонка подписей узкая,
                // и «Длина, м» обрезалось до «Длина,».
                var label = bi('Длина', 'Length');
                if (multi && src.tee) label += ' · ' + teeDisplayName(src.tee);
                var attr = src.fallback ? ' data-tnpc-len-src="draft"' : '';
                var line = tableLine('length', esc(label), dataRowCells('len', src.values, src.fallback), i === 0);
                lines += line.replace('<tr>', '<tr' + attr + '>');
            });
            return lines;
        }
        function foreBlock() {
            var count = Math.max(1, (card && card.hcps || []).length, (card && card.names || []).length,
                (card && card.fieldHcps || []).length);
            var lines = '';
            for (var playerIndex = 0; playerIndex < count; playerIndex++) {
                var label = count > 1
                    ? bi('Фора', 'Hcp') + ' ' + (playerIndex + 1)
                    : bi('Фора', 'Handicap');
                var playerName = (card && card.names || [])[playerIndex] || '';
                var hint = playerName ? bi('Фора игрока: ', 'Handicap for: ') + playerName : label;
                lines += tableLine('fore', esc(label), dataRowCells('fore', foreValues(card, playerIndex), false),
                    playerIndex === 0, hint);
            }
            return tableBlock('fore', lines);
        }

        var holeNumbers = holeCells(0, outN);
        if (showTotals) holeNumbers += '<td class="sum">OUT</td>';
        holeNumbers += holeCells(outN, n);
        if (showTotals) holeNumbers += inN
            ? '<td class="sum">IN</td><td class="sum">TOTAL</td>'
            : '<td class="sum">TOTAL</td>';

        var rowHtml = {
            holes: tableBlock('holes', tableLine('holes', '№', holeNumbers, true)),
            par: tableBlock('par', tableLine('par', esc(bi('Пар', 'Par')), dataRowCells('par', pars, true), true)),
            length: tableBlock('length', lengthLines()),
            index: tableBlock('index', tableLine('index', esc(bi('Индекс', 'Index')), dataRowCells('idx', indexes, true), true)),
            fore: foreBlock(),
            strokes: strokesBlock()
        };
        // Каждая строка — самостоятельный блок со своими размерами, цветом и
        // шрифтом (blockStyleAttr); ручки растягивания — только на экране.
        var blocks = visibleRowOrder(d).map(function (key) {
            return blockHtml(key, rowHtml[key] || '', printMode);
        }).join('');
        return '<div class="tnpc-body tnpc-box' + boxClass('table') + '" data-tnpc-box="table" style="' + boxStyleAttr('table') + '">' +
            boxHandlesHtml('table', printMode) + blocks + '</div>';
    }

    /**
     * Обёртка блока таблицы: свои CSS-переменные размеров (кегль/высота/
     * колонка подписи), цвет, фон и шрифт. Блок тянется мышью за три ручки:
     * ↕ — высота строки, ↔ — ширина колонки подписи, ↘ — весь блок разом
     * (кегль + высота + подпись пропорционально). Ручки — только на экране.
     */
    function blockHtml(key, tbodyHtml, printMode) {
        var r = rowCfg(key);
        var handles = printMode ? '' : (
            '<span class="tnpc-block-h tnpc-block-h-h" data-tnpc-block-resize="' + key + '" data-mode="h" title="' +
            esc(bi('Высота строки «', 'Row height for “') + rowLabel(key) + bi('»', '”')) + '"></span>' +
            '<span class="tnpc-block-h tnpc-block-h-lab" data-tnpc-block-resize="' + key + '" data-mode="lab" title="' +
            esc(bi('Ширина колонки подписи «', 'Label column width for “') + rowLabel(key) + bi('»', '”')) + '"></span>' +
            '<span class="tnpc-block-h tnpc-block-h-se" data-tnpc-block-resize="' + key + '" data-mode="scale" title="' +
            esc(bi('Растянуть весь блок «', 'Stretch the whole “') + rowLabel(key) + bi('» (кегль, высота, подпись)', '” block (font, height, label)')) + '"></span>'
        );
        return '<div class="tnpc-block' + (r.bold ? ' b' : '') + '" data-tnpc-block="' + key +
            '" style="' + blockStyleAttr(key) + '">' +
            '<table class="tnpc-table">' + tbodyHtml + '</table>' + handles + '</div>';
    }

    /** Итог длин лунок (м): пустые и нулевые клетки не считаются. */
    function lenSum(values, from, to) {
        var sum = 0;
        var seen = false;
        for (var i = from; i < to; i++) {
            var v = parseInt(values[i], 10);
            if (isFinite(v) && v > 0) { sum += v; seen = true; }
        }
        return seen ? sum : '';
    }

    function footerHtml(printMode) {
        var d = ensureDraft();
        if (printMode && !d.footer.print) return '';
        var ed = printMode ? '' : ' contenteditable="true"';
        var hint = (!printMode && !d.footer.print)
            ? '<div class="tnpc-noprint">' + esc(bi('не печатается', 'not printed')) + '</div>'
            : '';
        return '<div class="tnpc-foot' + (!printMode && !d.footer.print ? ' ghost' : '') + '">' +
            '<div class="tnpc-sign"><span' + ed + ' data-tnpc-field="footer.player">' + esc(d.footer.player) + '</span></div>' +
            '<div class="tnpc-sign"><span' + ed + ' data-tnpc-field="footer.marker">' + esc(d.footer.marker) + '</span></div>' +
            '<div class="tnpc-sign"><span' + ed + ' data-tnpc-field="footer.judge">' + esc(d.footer.judge) + '</span></div>' +
            hint + '</div>';
    }

    function metaHtml(card, printMode) {
        var d = ensureDraft();
        var sh = d.show;
        var ed = printMode ? '' : ' contenteditable="true"';
        var cid = ' data-cid="' + esc(card.id) + '"';
        var bits = [];
        // Точный (HI) и полевой (игровой, с учётом ТИ и пола) гандикапы —
        // оба, как в стартовом протоколе.
        if (sh.hcp !== false) {
            bits.push(esc(bi('Точный HCP', 'HI')) + ' <span' + ed + ' data-tnpc-field="hcps"' + cid + '>' + esc(hcpText(card)) + '</span>');
        }
        if (sh.fieldHcp !== false) {
            bits.push(esc(bi('Полевой HCP', 'CH')) + ' <span' + ed + ' data-tnpc-field="fieldHcps"' + cid + '>' + esc(fieldHcpText(card)) + '</span>');
        }
        if (sh.tee !== false) {
            bits.push(esc(bi('ТИ', 'Tee')) + ' <span' + ed + ' data-tnpc-field="tee"' + cid + '>' + esc(teeDisplayName(card.tee)) + '</span>');
        }
        if (sh.hole !== false) {
            bits.push(esc(bi('Лунка', 'Hole')) + ' <span' + ed + ' data-tnpc-field="startHole"' + cid + '>' + esc(card.startHole || 1) + '</span>');
        }
        if (sh.time !== false) {
            bits.push('<span' + ed + ' data-tnpc-field="startTime"' + cid + '>' + esc(card.startTime || '—') + '</span>');
        }
        if (sh.group !== false) {
            bits.push(esc(bi('Флайт', 'Flight')) + ' <span' + ed + ' data-tnpc-field="flight"' + cid + '>' + esc(card.flight || '—') + '</span>');
        }
        if (!bits.length) return '';
        return '<div class="tnpc-meta">' + bits.join(' · ') + '</div>';
    }

    function cardFaceHtml(card, printMode) {
        var d = ensureDraft();
        var sh = d.show;
        var ed = printMode ? '' : ' contenteditable="true"';
        var warn = (!printMode && card.missingPair)
            ? '<div class="tnpc-warn">⚠ ' + esc(bi('нет пары', 'no partner')) + '</div>' : '';
        var ov = (d.overlays || []).map(function (o) { return overlayHtml(o, card, printMode); }).join('');
        return '<div class="tnpc-card-inner' + (boxOf('table').free ? ' tb-free' : '') + '">' +
            '<div class="tnpc-head tnpc-box' + boxClass('head') + '" data-tnpc-box="head" style="' + boxStyleAttr('head') + '">' +
            boxHandlesHtml('head', printMode) +
            '<div class="tnpc-title"' + ed + ' data-tnpc-field="tournamentName">' + esc(titleText()) + '</div>' +
            (sh.subtitle !== false && subtitleText()
                ? '<div class="tnpc-subtitle"' + ed + ' data-tnpc-field="subtitle">' + esc(subtitleText()) + '</div>' : '') +
            (sh.date !== false && dateText()
                ? '<div class="tnpc-meta"><span' + ed + ' data-tnpc-field="date">' + esc(dateText()) + '</span></div>' : '') +
            '<div class="tnpc-name"><span' + ed + ' data-tnpc-field="names" data-cid="' + esc(card.id) + '">' +
            esc(nameText(card)) + '</span></div>' +
            metaHtml(card, printMode) +
            warn +
            '</div>' +
            tableHtml(card, printMode) +
            footerHtml(printMode) + ov +
            '</div>';
    }

    function cardShellHtml(card, printMode, slot, local) {
        var d = ensureDraft();
        // Ручка перетаскивания карточки по листу — только на экране и только
        // в режиме «лист A4» (в режиме «только карточку» двигать не по чему).
        var handle = (!printMode && !local)
            ? '<span class="tnpc-move" data-tnpc-card-move="1" title="' +
              esc(bi('Перетащить карточку по листу', 'Drag the card across the sheet')) + '">✥</span>'
            : '';
        // Восемь «ручек» по периметру карточки — растягивание в любую сторону.
        // Они работают только на экране и только когда лист A4 виден целиком;
        // в режиме «только карточка» размер уже подогнан под окно, и
        // добавлять ручки там — лишний визуальный шум.
        var resize = (!printMode && !local) ? cardResizeHandlesHtml() : '';
        return '<article class="tnpc-card" data-cid="' + esc(card.id) + '" data-slot="' + (slot || 0) + '" style="' +
            cardStyleAttr(d, slot || 0, local) + '">' + handle + resize + cardFaceHtml(card, printMode) + '</article>';
    }

    /**
     * Угловые и боковые «ручки» для растягивания карточки. Каждая ручка
     * знает свою сторону (n/s/e/w + диагонали) и тянет свою пару границ.
     * В dragState добавляется флаг resizeEdge с одной из 8 сторон —
     * moveCardDrag разруливает, какие именно миллиметры меняются.
     */
    function cardResizeHandlesHtml() {
        var edges = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
        return edges.map(function (edge) {
            return '<span class="tnpc-resize tnpc-resize-' + edge + '" data-tnpc-card-resize="' + edge + '" ' +
                'title="' + esc(bi('Растянуть карточку', 'Resize card')) + '"></span>';
        }).join('');
    }

    // ----------------------------------------------------------
    // ПРЕДПРОСМОР: лист A4 масштабируется под ширину вкладки
    // ----------------------------------------------------------
    function stageHtml(card) {
        var d = ensureDraft();
        var size = clampSize(d.size);
        var L = clampLayout(d.layout, size);
        if (state.preview === 'card') {
            // Режим «только карточка»: тот же масштаб, но без полей листа —
            // на узком экране карточка занимает всю ширину и читается.
            return '<div class="tnpc-stage card-mode" data-tnpc-stage>' +
                '<div class="tnpc-page card-only" data-tnpc-page style="width:' + round1(size.wMm * L.scale) +
                'mm;height:' + round1(size.hMm * L.scale) + 'mm;">' +
                cardShellHtml(card, false, 0, true) + '</div></div>';
        }
        var second = placement(d.layout, size, 1);
        var ghost = second.per > 1
            ? '<div class="tnpc-ghost" style="left:' + second.xMm + 'mm;top:' + second.yMm + 'mm;' +
              'width:' + second.wMm + 'mm;height:' + second.hMm + 'mm;"></div>'
            : '';
        return '<div class="tnpc-stage" data-tnpc-stage>' +
            '<div class="tnpc-page" data-tnpc-page>' + ghost + cardShellHtml(card, false, 0, false) + '</div>' +
            '</div>';
    }

    /**
     * Масштабируем предпросмотр так, чтобы лист (или карточка) были видны
     * ЦЕЛИКОМ. Раньше карточка рисовалась в настоящих миллиметрах внутри
     * узкого блока с overflow:hidden и уезжала за его пределы — вкладка
     * выглядела пустой.
     */
    function fitStage() {
        var d = doc();
        if (!d) return 0;
        var stage = d.querySelector('[data-tnpc-stage]');
        if (!stage) return 0;
        var target = stage.querySelector('[data-tnpc-page]');
        if (!target) return 0;
        target.style.transform = '';
        // clientWidth включает внутренние отступы блока — вычитаем их,
        // иначе лист упирается в padding и обрезается по краям.
        var padX = 0;
        var padY = 0;
        try {
            var cs = root.getComputedStyle ? root.getComputedStyle(stage) : null;
            if (cs) {
                padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
                padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
            }
        } catch (e) { /* silent */ }
        var avail = (stage.clientWidth || (stage.parentNode && stage.parentNode.clientWidth) || 0) - padX;
        var natural = target.offsetWidth || 0;
        if (!avail || !natural) return 0;
        // На телефоне режим «карточка» можно приблизить сильнее 100% —
        // иначе миллиметровые кегли не прочитать.
        var maxFit = stage.classList.contains('card-mode') ? 2.2 : 1.25;
        var fit = Math.min(maxFit, avail / natural);
        if (!isFinite(fit) || fit <= 0) return 0;
        target.style.transform = 'scale(' + fit + ')';
        target.style.transformOrigin = 'top left';
        stage.style.height = Math.ceil(target.offsetHeight * fit + padY) + 'px';
        stage.setAttribute('data-fit', String(Math.round(fit * 1000) / 1000));
        return fit;
    }

    /** Перерисовать только карточку-эталон (без потери фокуса в панелях). */
    function rerenderCard() {
        var d = doc();
        if (!d) return;
        var stage = d.querySelector('[data-tnpc-stage]');
        if (!stage) return;
        var card = pickActive(null);
        if (!card) return;
        var holder = d.createElement('div');
        holder.innerHTML = stageHtml(card);
        var fresh = holder.querySelector('[data-tnpc-page]');
        var page = stage.querySelector('[data-tnpc-page]');
        if (page && fresh) {
            page.className = fresh.className;
            page.setAttribute('style', fresh.getAttribute('style') || '');
            page.innerHTML = fresh.innerHTML;
        } else if (fresh) {
            stage.innerHTML = fresh.outerHTML;
        }
        fitStage();
    }

    /** Обновить подпись свёрнутой строки после правки эталона. */
    function syncRowSummary(card) {
        var d = doc();
        if (!d || !card) return;
        var row = d.querySelector('.tnpc-row[data-cid="' + card.id + '"]');
        if (!row) return;
        var name = row.querySelector('[data-tnpc-row-name]');
        var meta = row.querySelector('[data-tnpc-row-meta]');
        if (name) name.textContent = nameText(card);
        if (meta) meta.textContent = rowMetaText(card);
    }

    function rowMetaText(card) {
        var bits = [];
        bits.push(bi('Точный HCP ', 'HI ') + hcpText(card));
        bits.push(bi('Полевой HCP ', 'CH ') + fieldHcpText(card));
        if (card.tee) bits.push(bi('ТИ', 'Tee') + ' ' + teeDisplayName(card.tee));
        bits.push(bi('Лунка', 'Hole') + ' ' + (card.startHole || 1));
        if (card.startTime) bits.push(card.startTime);
        if (card.flight) bits.push(bi('Флайт', 'Flight') + ' ' + card.flight);
        return bits.join(' · ');
    }

    // ----------------------------------------------------------
    // ПАНЕЛИ И СПИСОК
    // ----------------------------------------------------------
    function numField(kind, field, label, value, min, max, step, extra) {
        return '<label class="tnpc-num"><span>' + esc(label) + '</span>' +
            '<input type="number" min="' + esc(min) + '" max="' + esc(max) + '" step="' + esc(step == null ? 0.1 : step) +
            '" value="' + esc(value) + '" data-tnm-live-edit="' + esc(kind) + '" data-field="' + esc(field) + '"' +
            (extra || '') + '></label>';
    }

    function toolbarHtml() {
        var d = ensureDraft();
        return '<div class="tnpc-toolbar">' +
            '<div class="tnpc-toolbar-row">' +
            ui().btn('tnpc-print-all', esc(bi('Печать всех', 'Print all')), { icon: 'fas fa-print', variant: 'primary' }) +
            ui().btn('tnpc-pdf-selected', esc(bi('PDF выбранных', 'PDF of selected')), { icon: 'fas fa-file-pdf' }) +
            ui().btn('tnpc-refresh', esc(bi('Обновить данные', 'Refresh data')), { icon: 'fas fa-rotate', variant: 'ghost' }) +
            ui().btn('tnpc-rebuild', esc(bi('Пересобрать карточки', 'Rebuild cards')), { icon: 'fas fa-screwdriver-wrench', variant: 'ghost' }) +
            ui().btn('tnpc-add', esc(bi('+ Добавить карточку', 'Add card')), { icon: 'fas fa-plus', variant: 'ghost' }) +
            '<span class="tnpc-save" id="tnpc-save"></span>' +
            '<span class="tnpc-progress">' + esc(state.progress) + '</span>' +
            '</div>' +
            '<div class="tnpc-toolbar-row">' +
            ui().btn('tnpc-panel-sizes', esc(bi('Размеры и место на листе', 'Sizes & placement')),
                { icon: 'fas fa-ruler-combined', variant: state.panels.sizes ? 'primary' : 'ghost' }) +
            ui().btn('tnpc-panel-design', esc(bi('Цвет и шрифт', 'Colors & fonts')),
                { icon: 'fas fa-palette', variant: state.panels.design ? 'primary' : 'ghost' }) +
            ui().btn('tnpc-panel-overlays', esc(bi('Лого и QR', 'Logo & QR')),
                { icon: 'fas fa-qrcode', variant: state.panels.overlays ? 'primary' : 'ghost' }) +
            ui().btn('tnpc-panel-content', esc(bi('Состав информации', 'Card content')),
                { icon: 'fas fa-list-check', variant: state.panels.content ? 'primary' : 'ghost' }) +
            ui().btn('tnpc-panel-fields', esc(bi('Лунки, пар, длина, индекс', 'Holes, par, length, index')),
                { icon: 'fas fa-table', variant: state.panels.fields ? 'primary' : 'ghost' }) +
            ui().btn('tnpc-preview-mode', esc(d && state.preview === 'card' ? bi('Вид: карточка', 'View: card') : bi('Вид: лист A4', 'View: A4 sheet')),
                { icon: 'fas fa-file-lines', variant: 'ghost' }) +
            '<label class="tnpc-search"><i class="fas fa-search"></i>' +
            '<input type="search" value="' + esc(state.query) + '" data-tnm-live-edit="tnpc-query" placeholder="' +
            esc(bi('Найти карточку…', 'Find a card…')) + '"></label>' +
            '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-filter" data-field="activeOnly"' +
            (d.filters.activeOnly ? ' checked' : '') + '> ' + esc(bi('Только активные', 'Active only')) + '</label>' +
            '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-filter" data-field="selectedOnly"' +
            (d.filters.selectedOnly ? ' checked' : '') + '> ' + esc(bi('Только выбранные', 'Selected only')) + '</label>' +
            '<input type="file" id="tnpc-logo-file" accept="image/png,image/jpeg,image/svg+xml" hidden>' +
            '<input type="file" id="tnpc-image-file" accept="image/png,image/jpeg,image/svg+xml" hidden>' +
            '</div>' +
            '</div>';
    }

    function sizesPanelHtml() {
        if (!state.panels.sizes) return '';
        var d = ensureDraft();
        var size = clampSize(d.size);
        var L = clampLayout(d.layout, size);
        var styleInputs = STYLE_KEYS.map(function (key) {
            var f = STYLE_FIELDS[key];
            return numField('tnpc-style', key, bi(f.ru, f.en), d.style[key], f.min, f.max, f.step);
        }).join('');
        return '<div class="tnm-card tnpc-panel" data-panel="sizes">' +
            '<div class="tnpc-panel-head"><b><i class="fas fa-ruler-combined"></i> ' +
            esc(bi('Размеры — применяются ко всем карточкам сразу', 'Sizes — applied to every card at once')) + '</b>' +
            ui().btn('tnpc-fit-page', esc(bi('Вписать в лист', 'Fit on page')), { icon: 'fas fa-expand', variant: 'ghost', small: true }) +
            ui().btn('tnpc-style-reset', esc(bi('Размеры по умолчанию', 'Default sizes')), { icon: 'fas fa-rotate-left', variant: 'ghost', small: true }) +
            '</div>' +
            fitNoteHtml() +
            '<div class="tnpc-nums">' +
            numField('tnpc-size', 'wMm', bi('Ширина карточки, мм', 'Card width, mm'), size.wMm, 60, PAGE_W, 1) +
            numField('tnpc-size', 'hMm', bi('Высота карточки, мм', 'Card height, mm'), size.hMm, 60, PAGE_H, 1) +
            numField('tnpc-layout', 'xMm', 'X ' + bi('на листе, мм', 'on sheet, mm'), L.xMm, -50, PAGE_W, 0.5) +
            numField('tnpc-layout', 'yMm', 'Y ' + bi('на листе, мм', 'on sheet, mm'), L.yMm, -50, PAGE_H, 0.5) +
            numField('tnpc-layout', 'gapMm', bi('Зазор между карточками, мм', 'Gap between cards, mm'), L.gapMm, 0, 60, 0.5) +
            numField('tnpc-layout', 'scalePct', bi('Масштаб печати, %', 'Print scale, %'), Math.round(L.scale * 100), 30, 200, 1) +
            '<label class="tnpc-num"><span>' + esc(bi('Карточек на листе', 'Cards per sheet')) + '</span>' +
            '<select data-tnm-edit="tnpc-persheet">' +
            '<option value="2"' + (L.perSheet === 2 ? ' selected' : '') + '>2</option>' +
            '<option value="1"' + (L.perSheet === 1 ? ' selected' : '') + '>1</option>' +
            '</select></label>' +
            '</div>' +
            '<p class="tnm-muted">' + esc(bi('Кегли, отступы и линии — всё в миллиметрах, как на печати.',
                'Font sizes, gaps and lines — in millimetres, exactly as printed.')) + '</p>' +
            '<div class="tnpc-nums">' + styleInputs + '</div>' +
            boxesSectionHtml() +
            '</div>';
    }

    /** «Блоки целиком»: место, ширина и масштаб таблицы и шапки. */
    function boxesSectionHtml() {
        var d = ensureDraft();
        var size = clampSize(d.size);
        var rows = BOX_KEYS.map(function (key) {
            var b = boxOf(key);
            var extra = ' data-box="' + key + '"';
            return '<div class="tnpc-box-cfg" data-box-cfg="' + key + '">' +
                '<div class="tnpc-block-cfg-head"><b>' + esc(boxLabel(key)) + '</b>' +
                '<div class="tnpc-block-cfg-actions">' +
                '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-box-free"' + extra + (b.free ? ' checked' : '') + '> ' +
                esc(bi('свободное место', 'free position')) + '</label>' +
                ui().btn('tnpc-box-reset', esc(bi('Сбросить', 'Reset')), { icon: 'fas fa-rotate-left', variant: 'ghost', small: true, data: { box: key } }) +
                '</div></div>' +
                '<div class="tnpc-nums">' +
                numField('tnpc-box', 'kPct', bi('Размер содержимого, %', 'Content size, %'), Math.round(b.k * 100), BOX_K_LIMITS.min * 100, BOX_K_LIMITS.max * 100, 1, extra) +
                numField('tnpc-box', 'xMm', 'X, ' + bi('мм', 'mm'), b.xMm, 0, size.wMm, 0.5, extra) +
                numField('tnpc-box', 'yMm', 'Y, ' + bi('мм', 'mm'), b.yMm, 0, size.hMm, 0.5, extra) +
                numField('tnpc-box', 'wMm', bi('Ширина, мм', 'Width, mm'), b.wMm, 15, size.wMm, 0.5, extra) +
                '</div></div>';
        }).join('');
        return '<div class="tnpc-boxes">' +
            '<p class="tnm-muted"><b>' + esc(bi('Блоки целиком', 'Whole blocks')) + '.</b> ' +
            esc(bi('Таблицу (№ лунки, Пар, Длина, Индекс, Фора, Удары) и шапку можно двигать и растягивать прямо на карточке: ' +
                '✥ — перенести блок, ↔ (правая ручка) — ширина, ↕ (нижняя) — размер всего содержимого, ↘ — оба сразу. ' +
                'X/Y/ширина действуют в режиме «свободное место».',
                'The table (hole no., Par, Length, Index, Hcp, Strokes) and the header can be moved and resized on the card: ' +
                '✥ — move, ↔ (right handle) — width, ↕ (bottom) — whole content size, ↘ — both. X/Y/width apply in “free position” mode.')) + '</p>' +
            rows + '</div>';
    }

    function fieldsPanelHtml() {
        if (!state.panels.fields) return '';
        var d = ensureDraft();
        var pars = '';
        var idx = '';
        var lens = '';
        for (var i = 0; i < 18; i++) {
            pars += '<input type="number" min="3" max="6" data-tnm-live-edit="tnpc-par" data-h="' + i +
                '" value="' + esc(d.pars[i] || 4) + '" title="Пар ' + (i + 1) + '">';
            idx += '<input type="number" min="1" max="18" data-tnm-live-edit="tnpc-idx" data-h="' + i +
                '" value="' + esc(d.indexes[i] || (i + 1)) + '" title="SI ' + (i + 1) + '">';
            lens += '<input type="number" min="0" max="999" data-tnm-live-edit="tnpc-len" data-h="' + i +
                '" value="' + esc(d.lengths[i] > 0 ? d.lengths[i] : '') + '" title="' + esc(bi('Длина', 'Length')) + ' ' + (i + 1) + ', м">';
        }
        var teeBtns = ['wh', 'bl', 'bk', 'rd'].map(function (code) {
            return ui().btn('tnpc-len-tee', esc(teeDisplayName(code)), { variant: 'ghost', small: true, data: { tee: code } });
        }).join('');
        return '<div class="tnm-card tnpc-panel" data-panel="fields">' +
            '<div class="tnpc-panel-head"><b><i class="fas fa-table"></i> ' +
            esc(bi('Лунки, пар, длина, индекс и фора — общие для всех карточек', 'Holes, par, length, index and handicap — shared by all cards')) + '</b>' +
            '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-holes9"' + (d.holes === 9 ? ' checked' : '') + '> ' +
            esc(bi('Только 9 лунок', '9 holes only')) + '</label>' +
            '</div>' +
            '<p class="tnm-muted">' + esc(bi('Пар 3–6', 'Par 3–6')) + '</p><div class="tnpc-fields">' + pars + '</div>' +
            '<p class="tnm-muted">' + esc(bi('Индекс 1–18', 'Index 1–18')) + '</p><div class="tnpc-fields">' + idx + '</div>' +
            '<p class="tnm-muted">' + esc(bi('Длина лунок в метрах (0 — пустая клетка). Карточки с ТИ из стартового листа показывают длину своего ТИ; этот ряд — запасной для карточек без ТИ из справочника.', 'Hole length in metres (0 — empty cell). Cards with a tee from the tee sheet show the length of their tee; this row is the fallback for cards without a known tee.')) + '</p>' +
            '<div class="tnpc-tee-fill">' +
            '<span class="tnm-muted">' + esc(bi('Заполнить запасной ряд по ТИ:', 'Fill fallback row by tee:')) + '</span>' + teeBtns +
            '</div>' +
            '<div class="tnpc-fields">' + lens + '</div>' +
            indexWarnHtml() +
            '</div>';
    }

    // ----------------------------------------------------------
    // ПАНЕЛЬ «ЦВЕТ И ШРИФТ»: общие цвета карточки + стиль каждого блока
    // ----------------------------------------------------------
    function colorInput(kind, field, label, value, extra) {
        return '<label class="tnpc-num"><span>' + esc(label) + '</span>' +
            '<input type="color" value="' + esc(value) + '" data-tnm-live-edit="' + esc(kind) +
            '" data-field="' + esc(field) + '"' + (extra || '') + '></label>';
    }

    function fontSelect(kind, field, value, extra) {
        var options = '<option value="">' + esc(bi('Arial (по умолчанию)', 'Arial (default)')) + '</option>';
        if (kind === 'tnpc-row-font') {
            options = '<option value="">' + esc(bi('— как у карточки —', '— same as card —')) + '</option>';
        }
        options += CARD_FONTS.map(function (f) {
            return '<option value="' + esc(f.value) + '"' + (value === f.value ? ' selected' : '') + '>' +
                esc(bi(f.ru, f.en)) + '</option>';
        }).join('');
        return '<label class="tnpc-num"><span>' + esc(bi('Шрифт', 'Font')) + '</span>' +
            '<select data-tnm-live-edit="' + esc(kind) + '" data-field="' + esc(field) + '"' + (extra || '') + '>' +
            options + '</select></label>';
    }

    /** Настройки одного блока таблицы: размеры, цвет, фон, шрифт, полужирный. */
    function clearColorBtn(key, field) {
        var title = field === 'bg'
            ? bi('Сбросить фон блока (как у карточки)', 'Reset block fill (same as card)')
            : bi('Сбросить цвет блока (как у карточки)', 'Reset block colour (same as card)');
        return '<button type="button" class="tnm-btn tnm-btn-ghost tnm-btn-sm tnpc-color-clear" data-tnm-act="tnpc-row-color-clear"' +
            ' data-id="' + esc(key) + '" data-field="' + esc(field) + '" title="' + esc(title) + '" aria-label="' + esc(title) + '">✕</button>';
    }

    function rowCfgHtml(key) {
        var r = rowCfg(key);
        var design = clampDesign(ensureDraft().design);
        var blockAttr = ' data-block="' + esc(key) + '"';
        return '<div class="tnpc-block-cfg" data-block-cfg="' + esc(key) + '">' +
            '<div class="tnpc-block-cfg-head">' +
            '<b>' + esc(rowLabel(key)) + '</b>' +
            '<span class="tnpc-block-cfg-actions">' +
            ui().btn('tnpc-row-reset', esc(bi('Как у всех', 'Same as shared')), { icon: 'fas fa-rotate-left', variant: 'ghost', small: true, data: { id: key } }) +
            '</span></div>' +
            '<div class="tnpc-nums">' +
            numField('tnpc-row', 'fontMm', bi('Кегль, мм', 'Font, mm'), r.fontMm,
                ROW_FIELD_LIMITS.fontMm.min, ROW_FIELD_LIMITS.fontMm.max, 0.1, blockAttr) +
            numField('tnpc-row', 'heightMm', bi('Высота, мм', 'Height, mm'), r.heightMm,
                ROW_FIELD_LIMITS.heightMm.min, ROW_FIELD_LIMITS.heightMm.max, 0.1, blockAttr) +
            numField('tnpc-row', 'labWMm', bi('Колонка подписи, мм', 'Label column, mm'), r.labWMm,
                ROW_FIELD_LIMITS.labWMm.min, ROW_FIELD_LIMITS.labWMm.max, 0.5, blockAttr) +
            '<label class="tnpc-num"><span>' + esc(bi('Цвет текста', 'Text colour')) + '</span>' +
            '<span class="tnpc-color-row">' +
            '<input type="color" value="' + esc(r.color || design.ink) + '" data-tnm-live-edit="tnpc-row-color" data-field="color"' + blockAttr + '>' +
            clearColorBtn(key, 'color') + '</span></label>' +
            '<label class="tnpc-num"><span>' + esc(bi('Фон блока', 'Block fill')) + '</span>' +
            '<span class="tnpc-color-row">' +
            '<input type="color" value="' + esc(r.bg || design.paper) + '" data-tnm-live-edit="tnpc-row-color" data-field="bg"' + blockAttr + '>' +
            clearColorBtn(key, 'bg') + '</span></label>' +
            fontSelect('tnpc-row-font', 'font', r.font, blockAttr) +
            '<label class="tnpc-check tnpc-check-block"><input type="checkbox" data-tnm-edit="tnpc-row-bold" data-block="' + esc(key) + '"' +
            (r.bold ? ' checked' : '') + '> ' + esc(bi('Полужирный', 'Bold')) + '</label>' +
            '</div></div>';
    }

    function designPanelHtml() {
        if (!state.panels.design) return '';
        var d = ensureDraft();
        var design = clampDesign(d.design);
        return '<div class="tnm-card tnpc-panel" data-panel="design">' +
            '<div class="tnpc-panel-head"><b><i class="fas fa-palette"></i> ' +
            esc(bi('Цвет и шрифт — применяются ко всем карточкам сразу', 'Colors & fonts — applied to every card at once')) + '</b>' +
            ui().btn('tnpc-design-reset', esc(bi('Цвета по умолчанию', 'Default colours')), { icon: 'fas fa-rotate-left', variant: 'ghost', small: true }) +
            '</div>' +
            '<div class="tnpc-nums">' +
            fontSelect('tnpc-design', 'font', design.font) +
            colorInput('tnpc-design-color', 'ink', bi('Цвет текста', 'Text colour'), design.ink) +
            colorInput('tnpc-design-color', 'paper', bi('Фон карточки', 'Card background'), design.paper) +
            colorInput('tnpc-design-color', 'line', bi('Цвет линий', 'Line colour'), design.line) +
            colorInput('tnpc-design-color', 'sumBg', bi('Фон OUT/IN/TOTAL', 'OUT/IN/TOTAL fill'), design.sumBg) +
            '</div>' +
            '<p class="tnm-muted">' + esc(bi('Каждый блок таблицы (№, Пар, Длина, Индекс, Фора, Удары) можно растянуть ' +
                'мышью прямо на карточке и покрасить отдельно; пустое поле блока наследует общие значения.',
                'Every table block (№, Par, Length, Index, Handicap, Strokes) can be stretched right on the card ' +
                'and coloured separately; empty block fields inherit the shared values.')) + '</p>' +
            '<div class="tnpc-block-cfg-list">' + visibleRowOrder(d).map(rowCfgHtml).join('') + '</div>' +
            '</div>';
    }

    function indexWarnHtml() {
        var seen = {};
        var dup = false;
        ensureDraft().indexes.forEach(function (v) {
            if (seen[v]) dup = true;
            seen[v] = true;
        });
        if (!dup) return '';
        return '<p class="tnpc-alert">⚠ ' + esc(bi('Индекс лунки повторяется — это предупреждение, сохранение не блокируется.',
            'Duplicate stroke index — warning only.')) + '</p>';
    }

    function contentPanelHtml() {
        if (!state.panels.content) return '';
        var d = ensureDraft();
        var toggles = SHOW_KEYS.map(function (key) {
            return '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-show" data-field="' + key + '"' +
                (d.show[key] !== false ? ' checked' : '') + '> ' + esc(bi(SHOW_FIELDS[key].ru, SHOW_FIELDS[key].en)) + '</label>';
        }).join('');
        return '<div class="tnm-card tnpc-panel" data-panel="content">' +
            '<div class="tnpc-panel-head"><b><i class="fas fa-list-check"></i> ' +
            esc(bi('Состав информации на карточке', 'What goes on the card')) + '</b></div>' +
            '<div class="tnpc-checks">' + toggles + '</div>' +
            '<div class="tnpc-checks">' +
            '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-footer-print"' +
            (d.footer.print ? ' checked' : '') + '> ' +
            esc(bi('Печатать подписи снизу (Игрок / Маркер / Судья)', 'Print bottom labels (Player / Marker / Judge)')) + '</label>' +
            '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-fillscores"' +
            (d.fillScores ? ' checked' : '') + '> ' +
            esc(bi('Подставлять текущий счёт раунда', 'Fill in live round scores')) + '</label>' +
            '</div>' +
            '<p class="tnm-muted">' + esc(bi('Подписи снизу по умолчанию остаются только на экране и в печать не попадают.',
                'Bottom labels stay on screen only and are not printed by default.')) + '</p>' +
            '<div class="tnpc-nums">' +
            '<label class="tnpc-num wide"><span>' + esc(bi('Подпись 1 (экран)', 'Label 1 (screen)')) + '</span>' +
            '<input type="text" value="' + esc(d.footer.player) + '" data-tnm-live-edit="tnpc-footer" data-field="player"></label>' +
            '<label class="tnpc-num wide"><span>' + esc(bi('Подпись 2 (экран)', 'Label 2 (screen)')) + '</span>' +
            '<input type="text" value="' + esc(d.footer.marker) + '" data-tnm-live-edit="tnpc-footer" data-field="marker"></label>' +
            '<label class="tnpc-num wide"><span>' + esc(bi('Подпись 3 (экран)', 'Label 3 (screen)')) + '</span>' +
            '<input type="text" value="' + esc(d.footer.judge) + '" data-tnm-live-edit="tnpc-footer" data-field="judge"></label>' +
            '</div>' +
            '<div class="tnpc-nums">' +
            '<label class="tnpc-num wide"><span>' + esc(bi('Заголовок (пусто — из турнира)', 'Title (empty — from tournament)')) + '</span>' +
            '<input type="text" value="' + esc(d.text.tournamentName) + '" data-tnm-live-edit="tnpc-text" data-field="tournamentName"></label>' +
            '<label class="tnpc-num wide"><span>' + esc(bi('Подзаголовок (клуб · поле)', 'Subtitle (club · course)')) + '</span>' +
            '<input type="text" value="' + esc(d.text.subtitle) + '" data-tnm-live-edit="tnpc-text" data-field="subtitle"></label>' +
            '<label class="tnpc-num wide"><span>' + esc(bi('Дата (пусто — из турнира)', 'Date (empty — from tournament)')) + '</span>' +
            '<input type="text" value="' + esc(d.text.date) + '" data-tnm-live-edit="tnpc-text" data-field="date"></label>' +
            '</div>' +
            '</div>';
    }

    function overlaysPanelHtml() {
        if (!state.panels.overlays) return '';
        var d = ensureDraft();
        var size = clampSize(d.size);
        var rows = (d.overlays || []).map(function (ov) {
            var o = clampOverlay(ov, d.size);
            var payload = '';
            if (o.type === 'qr') {
                payload = '<label class="tnpc-num wide"><span>' + esc(bi('Ссылка QR (пусто — QR маркера игрока)', 'QR link (empty — player marker QR)')) + '</span>' +
                    '<input type="text" value="' + esc(o.payload) + '" data-tnm-live-edit="tnpc-overlay" data-id="' + esc(o.id) +
                    '" data-field="payload"></label>';
            } else if (o.type === 'block') {
                payload = blockConfigHtml(o);
            } else if (o.type === 'text') {
                payload = '<label class="tnpc-num wide"><span>' + esc(bi('Текст', 'Text')) + '</span>' +
                    '<input type="text" value="' + esc(o.text) + '" data-tnm-live-edit="tnpc-overlay" data-id="' + esc(o.id) +
                    '" data-field="text"></label>' +
                    numField('tnpc-overlay', 'fontMm', bi('Кегль, мм', 'Font, mm'), o.fontMm, 1.5, 20, 0.1, ' data-id="' + esc(o.id) + '"');
            } else {
                payload = '<div class="tnpc-ov-src">' +
                    ui().btn('tnpc-overlay-src', esc(bi('Загрузить файл…', 'Upload file…')),
                        { icon: 'fas fa-upload', variant: 'ghost', small: true, data: { id: o.id } }) +
                    (o.src || (o.type === 'logo' && d.logoSrc)
                        ? '<span class="tnm-muted">' + esc(bi('файл загружен', 'file loaded')) + '</span>'
                        : '<span class="tnm-muted">' + esc(bi('файла нет', 'no file')) + '</span>') +
                    '</div>';
            }
            return '<div class="tnpc-ov-row" data-ov="' + esc(o.id) + '">' +
                '<div class="tnpc-ov-head">' +
                '<b>' + esc(overlayLabel(o)) + '</b>' +
                '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-overlay-on" data-id="' + esc(o.id) + '"' +
                (o.enabled ? ' checked' : '') + '> ' + esc(bi('показывать и печатать', 'show and print')) + '</label>' +
                ui().btn('tnpc-overlay-del', esc(bi('Удалить', 'Delete')), { icon: 'fas fa-trash', variant: 'ghost', small: true, data: { id: o.id } }) +
                '</div>' +
                '<div class="tnpc-nums">' +
                numField('tnpc-overlay', 'xMm', 'X, ' + bi('мм', 'mm'), o.xMm, 0, size.wMm, 0.5, ' data-id="' + esc(o.id) + '"') +
                numField('tnpc-overlay', 'yMm', 'Y, ' + bi('мм', 'mm'), o.yMm, 0, size.hMm, 0.5, ' data-id="' + esc(o.id) + '"') +
                numField('tnpc-overlay', 'wMm', bi('Ширина, мм', 'Width, mm'), o.wMm, 5, size.wMm, 0.5, ' data-id="' + esc(o.id) + '"') +
                numField('tnpc-overlay', 'hMm', bi('Высота, мм', 'Height, mm'), o.hMm, 5, size.hMm, 0.5, ' data-id="' + esc(o.id) + '"') +
                '</div>' + payload + '</div>';
        }).join('');
        return '<div class="tnm-card tnpc-panel" data-panel="overlays">' +
            '<div class="tnpc-panel-head"><b><i class="fas fa-qrcode"></i> ' +
            esc(bi('Лого, QR, текст и свои блоки на карточке', 'Logo, QR, text and custom blocks on the card')) + '</b>' +
            '<div class="tnpc-panel-actions">' +
            ui().btn('tnpc-qr-add', esc(bi('+ QR', 'Add QR')), { icon: 'fas fa-qrcode', variant: 'ghost', small: true }) +
            ui().btn('tnpc-logo-add', esc(bi('+ Лого', 'Add logo')), { icon: 'fas fa-image', variant: 'ghost', small: true }) +
            ui().btn('tnpc-text-add', esc(bi('+ Текст', 'Add text')), { icon: 'fas fa-font', variant: 'ghost', small: true }) +
            ui().btn('tnpc-image-add', esc(bi('+ Картинка', 'Add image')), { icon: 'fas fa-photo-film', variant: 'ghost', small: true }) +
            Object.keys(BLOCK_PRESETS).map(function (key) {
                var pr = BLOCK_PRESETS[key];
                return ui().btn('tnpc-block-add', esc('+ ' + bi(pr.ru, pr.en)), { icon: 'fas fa-square-plus', variant: 'ghost', small: true, data: { preset: key } });
            }).join('') +
            ui().btn('tnpc-reset-ov', esc(bi('Сбросить позиции', 'Reset overlays')), { icon: 'fas fa-up-down-left-right', variant: 'ghost', small: true }) +
            '</div></div>' +
            '<p class="tnm-muted">' + esc(bi('Перетаскивайте блоки мышью прямо на карточке — лого, QR, картинку и свой текст; ' +
                'тяните за золотой уголок, чтобы изменить размер. Саму карточку двигает по листу ручка ✥ в её левом верхнем углу. ' +
                'Двойной клик по QR — своя ссылка. Картинку можно просто перетащить файлом на предпросмотр.',
                'Drag blocks on the card with the mouse — logo, QR, image and your own text; pull the gold corner to resize. ' +
                'The card itself is moved across the sheet by the ✥ handle in its top-left corner. Double-click a QR for a custom link. ' +
                'You can also drop an image file onto the preview.')) + '</p>' +
            '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-qr-global"' + (d.qrEnabled ? ' checked' : '') + '> ' +
            esc(bi('QR-коды маркеров включены (ссылка на ввод счёта игрока)', 'Marker QR codes on (link to the player score entry)')) + '</label>' +
            '<p class="tnm-muted">' + esc(bi('Свой блок — любой текст с данными карточки: например «Маркер: {marker}». ' +
                'Значения подставляются для каждого игрока из участников и стартового листа. Двойной клик по блоку на карточке открывает его настройки.',
                'A custom block is any text with card data, e.g. “Marker: {marker}”. Values are filled in for each player from the players and the tee sheet. ' +
                'Double-click a block on the card to open its settings.')) + '</p>' +
            (rows || '<p class="tnm-muted">' + esc(bi('Оверлеев нет — добавьте лого или QR.', 'No overlays — add a logo or QR.')) + '</p>') +
            '</div>';
    }

    /** Настройки своего блока: название, шаблон с подстановками, оформление. */
    function blockConfigHtml(o) {
        var idAttr = ' data-id="' + esc(o.id) + '"';
        var chips = BLOCK_PLACEHOLDERS.map(function (ph) {
            return '<button type="button" class="tnpc-ph-chip" data-tnm-act="tnpc-ovb-insert"' + idAttr + ' data-key="' + esc(ph.key) +
                '" title="' + esc(bi(ph.ru, ph.en)) + '">{' + esc(ph.key) + '} <span>' + esc(bi(ph.ru, ph.en)) + '</span></button>';
        }).join('');
        var sample = blockText(o.text, pickActive(null));
        function opt(value, current, label) {
            return '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' + esc(label) + '</option>';
        }
        function colorField(field, label) {
            return '<label class="tnpc-num"><span>' + esc(label) + '</span><span class="tnpc-color-row">' +
                '<input type="color" value="' + esc(o[field] || (field === 'bg' ? '#ffffff' : '#111111')) + '" data-tnm-live-edit="tnpc-ovb-color"' + idAttr +
                ' data-field="' + field + '">' +
                '<button type="button" class="tnm-btn tnm-btn-ghost tnm-btn-sm tnpc-color-clear" data-tnm-act="tnpc-ovb-color-clear"' + idAttr + ' data-field="' + field +
                '" title="' + esc(bi('Как у карточки', 'Card default')) + '">×</button></span></label>';
        }
        return '<div class="tnpc-ovb">' +
            '<label class="tnpc-num wide"><span>' + esc(bi('Название блока (для списка)', 'Block name (for the list)')) + '</span>' +
            '<input type="text" value="' + esc(o.title) + '" data-tnm-live-edit="tnpc-overlay"' + idAttr + ' data-field="title" maxlength="60"></label>' +
            '<label class="tnpc-num wide"><span>' + esc(bi('Текст блока — можно несколько строк и подстановки', 'Block text — multiple lines and placeholders')) + '</span>' +
            '<textarea rows="2" data-tnm-live-edit="tnpc-overlay"' + idAttr + ' data-field="text">' + esc(o.text) + '</textarea></label>' +
            '<div class="tnpc-ph-chips">' + chips + '</div>' +
            '<p class="tnm-muted tnpc-ovb-sample" data-ovb-sample="' + esc(o.id) + '">' + esc(bi('На текущей карточке: ', 'On the current card: ')) +
            esc(sample || '—') + '</p>' +
            '<div class="tnpc-nums">' +
            numField('tnpc-overlay', 'fontMm', bi('Кегль, мм', 'Font, mm'), o.fontMm, 1.5, 20, 0.1, idAttr) +
            '<label class="tnpc-num"><span>' + esc(bi('Выравнивание', 'Alignment')) + '</span><select data-tnm-edit="tnpc-ovb"' + idAttr + ' data-field="align">' +
            opt('left', o.align, bi('слева', 'left')) + opt('center', o.align, bi('по центру', 'center')) + opt('right', o.align, bi('справа', 'right')) +
            '</select></label>' +
            '<label class="tnpc-num"><span>' + esc(bi('Рамка', 'Border')) + '</span><select data-tnm-edit="tnpc-ovb"' + idAttr + ' data-field="border">' +
            opt('none', o.border, bi('нет', 'none')) + opt('box', o.border, bi('вокруг', 'box')) + opt('bottom', o.border, bi('линия снизу (для подписи)', 'bottom line (signature)')) +
            '</select></label>' +
            colorField('color', bi('Цвет текста', 'Text colour')) +
            colorField('bg', bi('Фон', 'Background')) +
            '<label class="tnpc-check tnpc-check-block"><input type="checkbox" data-tnm-edit="tnpc-ovb"' + idAttr + ' data-field="bold"' +
            (o.bold ? ' checked' : '') + '> ' + esc(bi('жирный', 'bold')) + '</label>' +
            '</div></div>';
    }

    function addBlockOverlay(presetKey) {
        var pr = BLOCK_PRESETS[presetKey] || BLOCK_PRESETS.custom;
        var d = ensureDraft();
        var size = clampSize(d.size);
        var count = d.overlays.filter(function (o) { return o.type === 'block'; }).length;
        var pad = clampStyle(d.style).padMm;
        var block = clampOverlay({
            id: 'block-' + Date.now(),
            type: 'block',
            title: bi(pr.title.ru, pr.title.en),
            text: bi(pr.text.ru, pr.text.en),
            xMm: pad + count * 4,
            yMm: size.hMm - pad - pr.hMm - 16 - count * 4,
            wMm: pr.wMm,
            hMm: pr.hMm,
            fontMm: 3,
            border: pr.border || 'none',
            align: 'left',
            enabled: true
        }, size);
        d.overlays.push(block);
        state.panels.overlays = true;
        persistSoon();
        ui().render();
        return block;
    }

    function updateBlockOverlay(id, patch) {
        var d = ensureDraft();
        var next = null;
        d.overlays = d.overlays.map(function (o) {
            if (o.id !== id) return o;
            next = clampOverlay(Object.assign({}, o, patch), d.size);
            return next;
        });
        if (!next) return null;
        persistSoon();
        rerenderCard();
        return next;
    }

    function refreshBlockSample(id) {
        var dd = doc();
        var ov = overlayById(id);
        if (!dd || !ov) return;
        var el = dd.querySelector('[data-ovb-sample="' + id + '"]');
        if (el) el.textContent = bi('На текущей карточке: ', 'On the current card: ') + (blockText(ov.text, pickActive(null)) || '—');
    }

    function statusHtml(cards) {
        var d = ensureDraft();
        var players = ui().playersOf();
        var rid = currentRid();
        var rounds = ui().roundsOf();
        var round = rounds.filter(function (r) { return r.id === rid; })[0];
        var sheet = ui().sheetOf(rid);
        var entries = sheet ? data().sheetOrder(sheet).length : 0;
        var chips = [
            bi('Участников', 'Players') + ': ' + players.length,
            bi('Карточек', 'Cards') + ': ' + ((d.cards || []).length),
            bi('Показано', 'Shown') + ': ' + cards.length,
            bi('Раунд', 'Round') + ': ' + (round ? core().dateRu(round.date || '') : (rid || '—')),
            bi('Стартовый лист', 'Tee sheet') + ': ' + (sheet ? entries + ' ' + bi('записей', 'entries') : bi('не создан', 'missing'))
        ];
        var saved = d.updatedAt ? new Date(d.updatedAt).toLocaleString('ru-RU') : '—';
        return '<div class="tnpc-status">' +
            chips.map(function (c) { return '<span class="tnpc-chip">' + esc(c) + '</span>'; }).join('') +
            '<span class="tnpc-chip muted">' + esc(bi('Дизайн сохранён', 'Design saved') + ': ' + saved) + '</span>' +
            '</div>' +
            (!sheet
                ? '<p class="tnpc-alert">⚠ ' + esc(bi('Нет стартового листа: время старта и лунка берутся из участников, ' +
                    'а QR-коды не печатаются — им некуда вести. Создайте лист на вкладке «Стартовый лист».',
                    'No tee sheet yet: start time and hole come from the roster, and QR codes are not printed — ' +
                    'there is no round to open. Create the sheet first.')) + '</p>'
                : (sheetLinksReady(rid)
                    ? ''
                    : '<p class="tnpc-alert">⚠ ' + esc(bi('QR-коды ещё не привязаны к раунду ввода счёта — ' +
                        'откройте вкладку «Стартовый лист» и сохраните лист.',
                        'QR codes are not linked to a score-entry round yet — open the “Tee sheet” tab and save it.')) + '</p>'));
    }

    function masterHtml(card, cards) {
        if (!card) {
            return '<div class="tnm-card tnpc-master">' +
                '<div class="tnm-empty"><i class="fas fa-id-card"></i><p>' +
                esc(bi('Нет карточек: добавьте участников или нажмите «Пересобрать карточки».',
                    'No cards: add participants or click “Rebuild cards”.')) + '</p></div></div>';
        }
        var d = ensureDraft();
        return '<div class="tnm-card tnpc-master">' +
            '<div class="tnpc-panel-head">' +
            '<b><i class="fas fa-sliders"></i> ' + esc(bi('Карточка-эталон', 'Master card')) + ': ' +
            '<span data-tnpc-master-name>' + esc(nameText(card)) + '</span></b>' +
            '<span class="tnpc-master-note">' + esc(bi('Правьте всё прямо здесь — дизайн сразу применяется к остальным ' +
                '(' + (cards.length - 1) + ' ' + bi('свёрнутым карточкам', 'collapsed cards') + ').',
                'Edit anything right here — the design applies to the other cards immediately.')) + '</span>' +
            '</div>' +
            stageHtml(card) +
            '<div class="tnpc-hints">' +
            '<span><i class="fas fa-i-cursor"></i> ' + esc(bi('текст на карточке редактируется кликом', 'click any text to edit')) + '</span>' +
            '<span><i class="fas fa-hand-pointer"></i> ' + esc(bi('лого, QR и добавленный текст перетаскиваются мышью, золотой уголок — размер',
                'logo, QR and added text are draggable, the gold corner resizes')) + '</span>' +
            '<span><i class="fas fa-arrows-up-down-left-right"></i> ' + esc(bi('карточка двигается по листу — тяните за ручку ✥ в её левом верхнем углу',
                'drag the card across the sheet by the ✥ handle in its top-left corner')) + '</span>' +
            '<span><i class="fas fa-file-arrow-down"></i> ' + esc(bi('картинку можно перетащить файлом на лист', 'drop an image file onto the sheet')) + '</span>' +
            '<span><i class="fas fa-up-down"></i> ' + esc(bi('строки таблицы переставляются кнопками ↑/↓ или перетаскиванием подписи', 'reorder table rows with ↑/↓ or drag a row label')) + '</span>' +
            '<span><i class="fas fa-up-down-left-right"></i> ' + esc(bi('блоки № / Пар / Длина / Индекс / Фора / Удары растягиваются мышью: ↕ высота строки, ↔ колонка подписи, ↘ весь блок сразу (кегль + высота + подпись)', 'the № / Par / Length / Index / Handicap / Strokes blocks stretch with the mouse: ↕ row height, ↔ label column, ↘ the whole block (font + height + label)')) + '</span>' +
            '<span><i class="fas fa-palette"></i> ' + esc(bi('цвет, фон и шрифт любого блока и всей карточки — панель «Цвет и шрифт»; двойной клик по блоку открывает его настройки', 'colours, fills and fonts for any block and the whole card live in the “Colors & fonts” panel; double-click a block to open its settings')) + '</span>' +
            '<span><i class="fas fa-ruler"></i> ' + esc(bi('размеры — в панели «Размеры и место на листе»', 'sizes live in the “Sizes” panel')) + '</span>' +
            '<span><i class="fas fa-minus" style="transform:rotate(25deg)"></i> ' +
            esc(bi('фора — наклонными черточками в правом верхнем углу клетки счёта: одна черточка за каждый удар на лунке',
                'handicap strokes — slashes in the top-right corner of the score box, one per stroke on the hole')) + '</span>' +
            (qrOwnerText(card) ? '<span><i class="fas fa-qrcode"></i> ' + esc(qrOwnerText(card)) + '</span>' : '') +
            '</div>' +
            '<p class="tnm-muted">' + esc(bi('Карточка 200×147 мм. Внешняя рамка при печати снимается автоматически. ' +
                'Выбирайте дизайн, регулируйте смещения и масштаб — значения применяются ко всем карточкам и сохраняются. ' +
                'При печати: Ориентация: Альбомная (авто), Масштаб 100%, Поля: Нет, без колонтитулов.',
                'Card 200×147 mm. The outer frame is removed automatically when printing. Pick a design, adjust the ' +
                'offsets and scale — the values apply to every card and are saved. When printing: Orientation: ' +
                'Landscape (auto), Scale 100%, Margins: None, no headers or footers.')) + '</p>' +
            (d.footer.print ? '' : '<p class="tnm-muted">' + esc(bi('Подписи «Игрок / Маркер / Судья» видны только на экране — ' +
                'в печать и PDF не попадают (включается в «Состав информации»).',
                'The “Player / Marker / Judge” labels are screen-only — they never reach print or PDF.')) + '</p>') +
            '</div>';
    }

    function listHtml(cards, activeId) {
        if (!cards.length) return '';
        var rows = cards.map(function (c, i) {
            var isActive = c.id === activeId;
            return '<div class="tnpc-row' + (isActive ? ' active' : '') + '" data-cid="' + esc(c.id) + '"' +
                (isActive ? '' : ' draggable="true" data-tnpc-order="' + esc(c.id) + '"') + '>' +
                '<label class="tnpc-sel" title="' + esc(bi('Отметить для PDF', 'Select for PDF')) + '">' +
                '<input type="checkbox" data-tnm-edit="tnpc-pick" data-id="' + esc(c.id) + '"' +
                (state.selected[c.id] ? ' checked' : '') + '></label>' +
                '<span class="tnpc-row-no">' + (i + 1) + '</span>' +
                '<button type="button" class="tnpc-row-main" data-tnm-act="tnpc-open-card" data-id="' + esc(c.id) +
                '" aria-expanded="' + (isActive ? 'true' : 'false') + '">' +
                '<span class="tnpc-row-name" data-tnpc-row-name>' + esc(nameText(c)) + '</span>' +
                '<span class="tnpc-row-meta" data-tnpc-row-meta>' + esc(rowMetaText(c)) + '</span>' +
                (c.manual ? '<span class="tnpc-badge">' + esc(bi('вручную', 'manual')) + '</span>' : '') +
                (c.missingPair ? '<span class="tnpc-badge warn">' + esc(bi('нет пары', 'no partner')) + '</span>' : '') +
                (c.edits ? '<span class="tnpc-badge">' + esc(bi('есть правки', 'edited')) + '</span>' : '') +
                '</button>' +
                '<div class="tnpc-row-actions">' +
                (isActive
                    ? '<span class="tnpc-row-tag"><i class="fas fa-sliders"></i> ' + esc(bi('настраивается', 'editing')) + '</span>'
                    : ui().btn('tnpc-open-card', esc(bi('Настроить', 'Configure')), { icon: 'fas fa-sliders', variant: 'ghost', small: true, data: { id: c.id } })) +
                ui().btn('tnpc-pdf-one', 'PDF', { variant: 'ghost', small: true, data: { id: c.id } }) +
                ui().btn('tnpc-print-one', esc(bi('Печать', 'Print')), { icon: 'fas fa-print', variant: 'ghost', small: true, data: { id: c.id } }) +
                ui().btn('tnpc-move-up', '↑', { variant: 'ghost', small: true, data: { id: c.id } }) +
                ui().btn('tnpc-move-down', '↓', { variant: 'ghost', small: true, data: { id: c.id } }) +
                ui().btn('tnpc-del-card', esc(bi('Удалить', 'Delete')), { icon: 'fas fa-trash', variant: 'ghost', small: true, data: { id: c.id } }) +
                '</div></div>';
        }).join('');
        return '<div class="tnm-card tnpc-list">' +
            '<div class="tnpc-panel-head"><b><i class="fas fa-layer-group"></i> ' +
            esc(bi('Все карточки', 'All cards')) + ': ' + cards.length + '</b>' +
            '<span class="tnpc-master-note">' + esc(bi('свёрнуты и неактивны — нажмите «Настроить», чтобы открыть карточку здесь',
                'collapsed and inert — click “Configure” to open one here')) + '</span></div>' +
            '<div class="tnpc-rows">' + rows + '</div>' +
            '</div>';
    }

    /** На узком экране лист A4 мельчит карточку — по умолчанию показываем её крупно. */
    function autoPreview() {
        if (state.previewPinned) return state.preview;
        var w = root.innerWidth || root.screen && root.screen.width || 1200;
        return w < 760 ? 'card' : 'sheet';
    }

    function html() {
        if (!tid()) return '<div class="tnm-card">' + esc(bi('Турнир не выбран', 'No tournament')) + '</div>';
        state.preview = autoPreview();
        syncRemote();
        ensureDraft();
        refreshCards();
        ensureScores();
        var cards = visibleCards();
        var card = pickActive(cards);
        return '<div class="tnpc-wrap tnm-tab-body">' +
            toolbarHtml() +
            sizesPanelHtml() +
            designPanelHtml() +
            overlaysPanelHtml() +
            contentPanelHtml() +
            fieldsPanelHtml() +
            statusHtml(cards) +
            masterHtml(card, cards) +
            listHtml(cards, card ? card.id : '') +
            '</div>';
    }

    // ----------------------------------------------------------
    // ПЕЧАТЬ / PDF
    // ----------------------------------------------------------
    function printCss() {
        // Лист всегда A4 landscape: ориентация выставляется автоматически,
        // поля и колонтитулы не печатаются. Внешняя рамка карточки на бумагу
        // не идёт — её снимаем здесь, чтобы предпросмотр и печать совпадали.
        return '<style>@page{size:A4 landscape;margin:0}html,body{margin:0;padding:0;background:#fff}' +
            '.page{width:' + PAGE_W + 'mm;height:' + PAGE_H + 'mm;position:relative;page-break-after:always;overflow:hidden}' +
            cardCssText() +
            '.tnpc-card{border:0!important}' +
            '.tnpc-handle,.tnpc-x,.tnpc-tag,.tnpc-row-tools,.tnpc-warn,.tnpc-ph,.tnpc-noprint,.tnpc-ghost,.tnpc-move,.tnpc-resize,.tnpc-block-h,.tnpc-box-move,.tnpc-box-h{display:none!important}' +
            '</style>';
    }

    /** Раскладка карточек по листам: 1 или 2 на лист A4 landscape. */
    function pageChunks(cards) {
        var draft = ensureDraft();
        var per = cardsPerSheet(draft.layout, draft.size);
        var pages = [];
        for (var i = 0; i < (cards || []).length; i += per) pages.push(cards.slice(i, i + per));
        return pages;
    }

    function documentFor(cards) {
        var d = ensureDraft();
        var pages = pageChunks(cards).map(function (chunk) {
            return '<section class="page">' + chunk.map(function (c, slot) {
                return '<article class="tnpc-card" data-slot="' + slot + '" style="' + cardStyleAttr(d, slot) + '">' +
                    cardFaceHtml(c, true) + '</article>';
            }).join('') + '</section>';
        }).join('');
        return '<!DOCTYPE html><html><head><meta charset="utf-8">' + printCss() + '</head><body>' + pages + '</body></html>';
    }

    function printCards(cards, label) {
        if (!cards || !cards.length) {
            ui().toastMsg(bi('Нет карточек для печати', 'Nothing to print'), 'error');
            return;
        }
        state.progress = bi('Готовлю PDF (0/' + cards.length + ')', 'Preparing PDF (0/' + cards.length + ')');
        ui().render();
        var i = 0;
        function tick() {
            i++;
            state.progress = (label || bi('Готовлю PDF', 'Preparing PDF')) + ' (' + Math.min(i, cards.length) + '/' + cards.length + ')';
            var d = doc();
            var el = d && d.querySelector('.tnpc-progress');
            if (el) el.textContent = state.progress;
            if (i < cards.length) setTimeout(tick, 16);
            else {
                var htmlDoc = documentFor(cards);
                var ok = io().printHtml(htmlDoc, { delay: 200 });
                if (!ok) {
                    try { root.print(); } catch (e) { /* silent */ }
                }
                state.progress = '';
                ui().render();
            }
        }
        tick();
    }

    function selectedCards() {
        return visibleCards().filter(function (c) { return state.selected[c.id]; });
    }

    // ----------------------------------------------------------
    // ПЕРЕТАСКИВАНИЕ ОВЕРЛЕЕВ, ФАЙЛЫ, ПОРЯДОК
    // ----------------------------------------------------------
    function overlayById(id) {
        return ensureDraft().overlays.filter(function (o) { return o.id === id; })[0] || null;
    }

    function patchOverlayDom(o) {
        var d = doc();
        if (!d) return;
        d.querySelectorAll('[data-overlay-id="' + o.id + '"]').forEach(function (el) {
            el.style.left = o.xMm + 'mm';
            el.style.top = o.yMm + 'mm';
            el.style.width = o.wMm + 'mm';
            el.style.height = o.hMm + 'mm';
            el.style.setProperty('--tnpc-ov-font', o.fontMm + 'mm');
        });
    }

    /**
     * ПЕРЕТАСКИВАНИЕ КАРТОЧКИ ПО ЛИСТУ.
     * Место карточки (layout.xMm/yMm) раньше правилось только числами в панели
     * «Размеры и место на листе». Теперь её можно двигать мышью прямо в
     * предпросмотре — так же, как лого и QR. Движок: указатель на «ручке» ✥
     * в углу карточки или на любом её не редактируемом месте (рамка, клетки
     * счёта, пустые поля). В режиме «только карточка» листа нет — там ручка
     * не показывается и перетаскивание не запускается.
     */
    function cardDragAllowed(ev) {
        if (state.preview === 'card') return false;
        if (ev.target.closest('[data-overlay-id]')) return false;
        if (ev.target.closest('[data-tnm-act]')) return false;
        if (ev.target.closest('[contenteditable="true"]')) return false;
        if (ev.target.closest('input, select, textarea, a, button')) return false;
        // Подписи строк таблицы переставляются своим HTML5-перетаскиванием.
        if (ev.target.closest('[data-tnpc-row-handle]')) return false;
        return true;
    }

    /**
     * Можно ли потянуть за «ручку растягивания» карточки (угол/грань). Если
     * курсор над ручкой — обычная карточная drag-логика не срабатывает, и
     * стартует ресайз.
     */
    function resizeEdgeFromTarget(target) {
        var node = target.closest('[data-tnpc-card-resize]');
        if (!node) return '';
        return String(node.getAttribute('data-tnpc-card-resize') || '');
    }

    function startCardDrag(ev, host) {
        var cardEl = ev.target.closest('.tnpc-card');
        if (!cardEl) return;
        var resizeEdge = resizeEdgeFromTarget(ev.target);
        if (!resizeEdge && !cardDragAllowed(ev)) return;
        var pageEl = cardEl.closest('[data-tnpc-page]');
        if (!pageEl || pageEl.classList.contains('card-only')) return;
        var d = ensureDraft();
        var size = clampSize(d.size);
        var layout = clampLayout(d.layout, size);
        var mmPerPx = pageMmPerPx(pageEl, layout, size);
        if (!isFinite(mmPerPx) || mmPerPx <= 0) return;
        state.cardDrag = {
            startX: ev.clientX, startY: ev.clientY,
            ox: layout.xMm, oy: layout.yMm,
            ow: size.wMm, oh: size.hMm,
            mmPerPx: mmPerPx, el: cardEl, host: host, moved: false,
            resize: resizeEdge
        };
        cardEl.classList.add(resizeEdge ? 'resizing' : 'dragging');
        try { cardEl.setPointerCapture(ev.pointerId); } catch (e) { /* silent */ }
        ev.preventDefault();
    }

    function moveCardDrag(ev) {
        var dr = state.cardDrag;
        if (!dr) return;
        var d = ensureDraft();
        var size = clampSize(d.size);
        var dx = (ev.clientX - dr.startX) * dr.mmPerPx;
        var dy = (ev.clientY - dr.startY) * dr.mmPerPx;
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) dr.moved = true;
        if (dr.resize) {
            applyCardResize(dr, dx, dy);
            d.size = clampSize({ wMm: dr.ow + dr.dw, hMm: dr.oh + dr.dh });
            // При ресайзе «от себя» (за W/NW/SW/NE/...) карточка сдвигается:
            // противоположная грань остаётся на месте, ближайшая уходит
            // вслед за курсором. Без обновления xMm/yMm раскладки карточка
            // «дёрнется» только в конце перетаскивания — на это время
            // у пользователя останется впечатление, что размер меняется
            // «вокруг центра», а не от угла. Поэтому здесь сразу пишем
            // итоговые координаты в раскладку, и patchCardDom() их подхватит.
            d.layout = clampLayout({
                xMm: d.layout.xMm + dr.dx, yMm: d.layout.yMm + dr.dy,
                scale: d.layout.scale, gapMm: d.layout.gapMm, perSheet: d.layout.perSheet
            }, d.size);
        } else {
            d.layout = clampLayout({
                xMm: dr.ox + dx, yMm: dr.oy + dy,
                scale: d.layout.scale, gapMm: d.layout.gapMm, perSheet: d.layout.perSheet
            }, size);
        }
        patchCardDom(d);
        syncLayoutInputs(d.layout);
        syncSizeInputs(d.size);
        ev.preventDefault();
    }

    /**
     * Прибавка ширины/высоты в зависимости от того, за какую грань тянут.
     * Двигаем «от себя»: левый/верхний край двигает противоположную сторону
     * карточки (компенсация в dx/dy знаке), правый/нижний край двигают
     * ближайшую сторону. Итог: тянем за левый край — карточка становится
     * шире/уже, при этом правый край остаётся на месте.
     */
    function applyCardResize(dr, dx, dy) {
        var edge = dr.resize;
        var nw = dr.ow, nh = dr.oh, nx = dr.ox, ny = dr.oy;
        if (edge.indexOf('e') !== -1) nw = dr.ow + dx;
        if (edge.indexOf('w') !== -1) { nw = dr.ow - dx; nx = dr.ox + dx; }
        if (edge.indexOf('s') !== -1) nh = dr.oh + dy;
        if (edge.indexOf('n') !== -1) { nh = dr.oh - dy; ny = dr.oy + dy; }
        // Минимальная карточка не должна схлопнуться в ноль.
        if (nw < 30) { var fixW = 30 - nw; nw = 30; if (edge.indexOf('w') !== -1) nx -= fixW; }
        if (nh < 30) { var fixH = 30 - nh; nh = 30; if (edge.indexOf('n') !== -1) ny -= fixH; }
        dr.dw = nw - dr.ow;
        dr.dh = nh - dr.oh;
        dr.dx = nx - dr.ox;
        dr.dy = ny - dr.oy;
    }

    function endCardDrag() {
        var dr = state.cardDrag;
        state.cardDrag = null;
        if (!dr) return;
        if (dr.el) dr.el.classList.remove('dragging', 'resizing');
        if (!dr.moved) return;
        // Позиция и размер уже учтены в d.layout / d.size в moveCardDrag —
        // здесь только синхронизируем поля ввода и сохраняем.
        syncLayoutInputs(ensureDraft().layout);
        persistSoon();
        refreshFitWarning();
    }

    /** Переставить карточку (и «призрак» второй) без полной перерисовки. */
    function patchCardDom(d) {
        var dd = doc();
        if (!dd) return;
        var stage = dd.querySelector('[data-tnpc-stage]');
        if (!stage) return;
        var size = clampSize(d.size);
        var local = stage.classList.contains('card-mode');
        stage.querySelectorAll('.tnpc-card').forEach(function (el) {
            var slot = Number(el.getAttribute('data-slot')) || 0;
            el.setAttribute('style', cardStyleAttr(d, slot, local));
        });
        var ghost = stage.querySelector('.tnpc-ghost');
        if (ghost) {
            var second = placement(d.layout, size, 1);
            ghost.style.left = second.xMm + 'mm';
            ghost.style.top = second.yMm + 'mm';
            ghost.style.width = second.wMm + 'mm';
            ghost.style.height = second.hMm + 'mm';
        }
    }

    /** Числа X/Y в панели «Размеры» следуют за перетаскиванием. */
    function syncLayoutInputs(layout) {
        var dd = doc();
        if (!dd) return;
        ['xMm', 'yMm'].forEach(function (field) {
            var input = dd.querySelector('[data-tnm-live-edit="tnpc-layout"][data-field="' + field + '"]');
            if (input && dd.activeElement !== input) input.value = layout[field];
        });
    }

    /** Ширина/высота карточки в полях «Размеры» следуют за растягиванием. */
    function syncSizeInputs(size) {
        var dd = doc();
        if (!dd) return;
        ['wMm', 'hMm'].forEach(function (field) {
            var input = dd.querySelector('[data-tnm-live-edit="tnpc-size"][data-field="' + field + '"]');
            if (input && dd.activeElement !== input) input.value = size[field];
        });
    }

    /** Экранная точка → миллиметры листа A4 (с учётом масштаба предпросмотра). */
    function pageMmPerPx(pageEl, layout, size) {
        var rect = pageEl ? pageEl.getBoundingClientRect() : null;
        if (!rect || !rect.width) return 0;
        var fit = pageFit(layout, size) || 1;
        return PAGE_W / (rect.width * fit);
    }

    // ----------------------------------------------------------
    // РАСТЯГИВАНИЕ БЛОКОВ ТАБЛИЦЫ (№ / Пар / Длина / Индекс / Фора / Удары)
    // ----------------------------------------------------------
    /** Фактический масштаб карточки на экране (из её style, без геометрии). */
    function cardScaleOf(cardEl) {
        var m = /scale\(([\d.]+)\)/.exec(cardEl.getAttribute('style') || '');
        var scale = m ? parseFloat(m[1]) : 1;
        return isFinite(scale) && scale > 0 ? scale : 1;
    }

    function startBlockDrag(ev, host, handleEl) {
        var key = handleEl.getAttribute('data-tnpc-block-resize');
        var mode = handleEl.getAttribute('data-mode') || 'scale';
        var blockEl = handleEl.closest('.tnpc-block');
        var cardEl = handleEl.closest('.tnpc-card');
        if (!blockEl || !cardEl) return;
        var d = ensureDraft();
        var size = clampSize(d.size);
        var scale = cardScaleOf(cardEl);
        var rect = cardEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        var mmPerPxX = size.wMm * scale / rect.width;
        var mmPerPxY = size.hMm * scale / rect.height;
        if (!isFinite(mmPerPxX) || mmPerPxX <= 0 || !isFinite(mmPerPxY) || mmPerPxY <= 0) return;
        var r = rowCfg(key);
        state.blockDrag = {
            key: key, mode: mode, el: blockEl,
            startX: ev.clientX, startY: ev.clientY,
            fontMm: r.fontMm, heightMm: r.heightMm, labWMm: r.labWMm,
            mmX: mmPerPxX, mmY: mmPerPxY, moved: false
        };
        blockEl.classList.add('resizing');
        try { handleEl.setPointerCapture(ev.pointerId); } catch (e) { /* silent */ }
        ev.preventDefault();
    }

    function moveBlockDrag(ev) {
        var dr = state.blockDrag;
        if (!dr) return;
        var dxPx = ev.clientX - dr.startX;
        var dyPx = ev.clientY - dr.startY;
        if (Math.abs(dxPx) > 2 || Math.abs(dyPx) > 2) dr.moved = true;
        var d = ensureDraft();
        var cfg = Object.assign({}, (d.rows || {})[dr.key] || {});
        var dxMm = dxPx * dr.mmX;
        var dyMm = dyPx * dr.mmY;
        if (dr.mode === 'h') {
            // ↕ — только высота строк блока.
            cfg.heightMm = dr.heightMm + dyMm;
        } else if (dr.mode === 'lab') {
            // ↔ — только ширина колонки подписи (тянем вправо — шире).
            cfg.labWMm = dr.labWMm + dxMm;
        } else {
            // ↘ — весь блок пропорционально: и кегль, и высота, и подпись.
            var factor = 1 + Math.max(
                dyMm / Math.max(dr.heightMm, 3),
                dxMm / Math.max(dr.labWMm, 5)
            );
            if (!isFinite(factor) || factor <= 0) factor = 1;
            cfg.fontMm = dr.fontMm * factor;
            cfg.heightMm = dr.heightMm * factor;
            cfg.labWMm = dr.labWMm * factor;
        }
        d.rows = d.rows || {};
        d.rows[dr.key] = clampRowCfg(dr.key, cfg, d.style);
        patchBlockDom(dr.key);
        syncBlockInputs(dr.key);
        ev.preventDefault();
    }

    function endBlockDrag() {
        var dr = state.blockDrag;
        state.blockDrag = null;
        if (!dr) return;
        if (dr.el) dr.el.classList.remove('resizing');
        if (!dr.moved) return;
        persistSoon();
    }

    /** Применить стиль блока к предпросмотру без полной перерисовки. */
    function patchBlockDom(key) {
        var dd = doc();
        if (!dd) return;
        var style = blockStyleAttr(key);
        var bold = rowCfg(key).bold;
        dd.querySelectorAll('[data-tnpc-block="' + key + '"]').forEach(function (el) {
            el.setAttribute('style', style);
            el.classList.toggle('b', bold);
        });
    }

    /** Поля блока в панели «Цвет и шрифт» следуют за растягиванием мышью. */
    function syncBlockInputs(key) {
        var d = doc();
        if (!d) return;
        var r = rowCfg(key);
        ['fontMm', 'heightMm', 'labWMm'].forEach(function (field) {
            var input = d.querySelector('[data-tnm-live-edit="tnpc-row"][data-block="' + key + '"][data-field="' + field + '"]');
            if (input && d.activeElement !== input) input.value = r[field];
        });
    }

    /** Открыть панель «Цвет и шрифт» и подсветить настройки блока. */
    function focusBlockConfig(key) {
        state.panels.design = true;
        ui().render();
        var dd = doc();
        if (!dd) return;
        var cfg = dd.querySelector('[data-block-cfg="' + key + '"]');
        if (cfg && typeof cfg.scrollIntoView === 'function') {
            try { cfg.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* silent */ }
        }
        if (cfg) {
            cfg.classList.add('flash');
            setTimeout(function () { cfg.classList.remove('flash'); }, 1600);
        }
    }

    // ----------------------------------------------------------
    // БЛОКИ ЦЕЛИКОМ (таблица / шапка): перенос, ширина, масштаб
    // ----------------------------------------------------------
    /** Геометрия блока в мм карточки по предпросмотру (для перехода в «свободный»). */
    function measureBox(key, boxEl) {
        var dd = doc();
        var el = boxEl || (dd && dd.querySelector('.tnpc-card [data-tnpc-box="' + key + '"]'));
        if (!el || typeof el.getBoundingClientRect !== 'function') return null;
        var cardEl = el.closest('.tnpc-card');
        var innerEl = cardEl && cardEl.querySelector('.tnpc-card-inner');
        if (!cardEl || !innerEl) return null;
        var size = clampSize(ensureDraft().size);
        var cardRect = cardEl.getBoundingClientRect();
        var innerRect = innerEl.getBoundingClientRect();
        var r = el.getBoundingClientRect();
        if (!cardRect.width || !r.width) return null;
        var mmPerPx = size.wMm / cardRect.width;
        return {
            xMm: round1((r.left - innerRect.left) * mmPerPx),
            yMm: round1((r.top - innerRect.top) * mmPerPx),
            wMm: round1(r.width * mmPerPx),
            hMm: round1(r.height * mmPerPx),
            mmPerPx: mmPerPx
        };
    }

    /** Применить место/масштаб блока к предпросмотру без перерисовки. */
    function patchBoxDom(key) {
        var dd = doc();
        if (!dd) return;
        var b = boxOf(key);
        dd.querySelectorAll('[data-tnpc-box="' + key + '"]').forEach(function (el) {
            el.setAttribute('style', boxStyleAttr(key));
            el.classList.toggle('free', b.free);
            if (key === 'table') {
                var inner = el.closest('.tnpc-card-inner');
                if (inner) inner.classList.toggle('tb-free', b.free);
            }
        });
        if (key === 'table') {
            dd.querySelectorAll('[data-tnpc-block]').forEach(function (el) {
                el.setAttribute('style', blockStyleAttr(el.getAttribute('data-tnpc-block')));
            });
        }
    }

    function syncBoxInputs(key) {
        var dd = doc();
        if (!dd) return;
        var b = boxOf(key);
        var values = { xMm: b.xMm, yMm: b.yMm, wMm: b.wMm, kPct: Math.round(b.k * 100) };
        Object.keys(values).forEach(function (field) {
            var input = dd.querySelector('[data-tnm-live-edit="tnpc-box"][data-box="' + key + '"][data-field="' + field + '"]');
            if (input && dd.activeElement !== input) input.value = values[field];
        });
        var free = dd.querySelector('[data-tnm-edit="tnpc-box-free"][data-box="' + key + '"]');
        if (free) free.checked = b.free;
    }

    function setBox(key, next) {
        var d = ensureDraft();
        d.boxes = d.boxes || {};
        d.boxes[key] = clampBox(key, next, d.size);
        return d.boxes[key];
    }

    /** Освободить блок из потока, сохранив его текущее место на карточке. */
    function freeBox(key, boxEl) {
        var b = boxOf(key);
        if (b.free) return b;
        var m = measureBox(key, boxEl);
        return setBox(key, Object.assign({}, b, { free: true }, m ? { xMm: m.xMm, yMm: m.yMm, wMm: m.wMm } : {}));
    }

    function startBoxDrag(ev, handleEl) {
        var key = handleEl.getAttribute('data-tnpc-box-drag');
        if (BOX_KEYS.indexOf(key) === -1) return;
        var mode = handleEl.getAttribute('data-mode') || 'move';
        var boxEl = handleEl.closest('[data-tnpc-box]');
        if (!boxEl) return;
        var m = measureBox(key, boxEl);
        if (!m || !isFinite(m.mmPerPx) || m.mmPerPx <= 0) return;
        var b = boxOf(key);
        state.boxDrag = {
            key: key, mode: mode, el: boxEl,
            startX: ev.clientX, startY: ev.clientY,
            mmPerPx: m.mmPerPx, geom: m, b0: b, moved: false
        };
        boxEl.classList.add('box-dragging');
        try { handleEl.setPointerCapture(ev.pointerId); } catch (e) { /* silent */ }
        ev.preventDefault();
        ev.stopPropagation();
    }

    function moveBoxDrag(ev) {
        var dr = state.boxDrag;
        if (!dr) return;
        var dxPx = ev.clientX - dr.startX;
        var dyPx = ev.clientY - dr.startY;
        if (!dr.moved && Math.abs(dxPx) < 2 && Math.abs(dyPx) < 2) return;
        dr.moved = true;
        var dx = dxPx * dr.mmPerPx;
        var dy = dyPx * dr.mmPerPx;
        var g = dr.geom;
        var b0 = dr.b0;
        // Первое движение не-«↕» ручкой освобождает блок из потока карточки
        // ровно в том месте, где он стоял.
        var base = b0.free ? b0 : Object.assign({}, b0, { xMm: g.xMm, yMm: g.yMm, wMm: g.wMm });
        var next = Object.assign({}, base);
        if (dr.mode !== 's') next.free = true;
        if (dr.mode === 'move') {
            next.xMm = base.xMm + dx;
            next.yMm = base.yMm + dy;
        }
        if (dr.mode === 'e' || dr.mode === 'se') next.wMm = base.wMm + dx;
        if (dr.mode === 's' || dr.mode === 'se') {
            var h0 = Math.max(g.hMm, 3);
            next.k = b0.k * Math.max(0.1, (h0 + dy) / h0);
        }
        setBox(dr.key, next);
        patchBoxDom(dr.key);
        syncBoxInputs(dr.key);
        if (dr.key === 'table') syncAllBlockInputs();
        ev.preventDefault();
    }

    function syncAllBlockInputs() {
        visibleRowOrder(ensureDraft()).forEach(function (key) { syncBlockInputs(key); });
    }

    function endBoxDrag() {
        var dr = state.boxDrag;
        state.boxDrag = null;
        if (!dr) return;
        if (dr.el) dr.el.classList.remove('box-dragging');
        if (!dr.moved) return;
        persistSoon();
        refreshFitWarning();
    }

    /** Открыть панель «Лого, QR и блоки» и подсветить настройки оверлея. */
    function focusOverlayConfig(id) {
        state.panels.overlays = true;
        ui().render();
        var dd = doc();
        if (!dd) return;
        var row = dd.querySelector('.tnpc-ov-row[data-ov="' + id + '"]');
        if (!row) return;
        if (typeof row.scrollIntoView === 'function') {
            try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* silent */ }
        }
        row.classList.add('flash');
        setTimeout(function () { row.classList.remove('flash'); }, 1600);
        var ta = row.querySelector('textarea');
        if (ta && typeof ta.focus === 'function') { try { ta.focus(); } catch (e) { /* silent */ } }
    }

    function bindDrag(host) {
        host.addEventListener('pointerdown', function (ev) {
            if (ev.button !== undefined && ev.button !== 0) return;
            var boxHandle = ev.target.closest('[data-tnpc-box-drag]');
            if (boxHandle) { startBoxDrag(ev, boxHandle); return; }
            var blockHandle = ev.target.closest('[data-tnpc-block-resize]');
            if (blockHandle) { startBlockDrag(ev, host, blockHandle); return; }
            var handle = ev.target.closest('[data-tnpc-resize]');
            var ovEl = ev.target.closest('[data-overlay-id]');
            if (!ovEl) { startCardDrag(ev, host); return; }
            if (ev.target.closest('[data-tnm-act]')) return;
            var id = ovEl.getAttribute('data-overlay-id');
            var ov = overlayById(id);
            if (!ov) return;
            var cardEl = ovEl.closest('.tnpc-card');
            if (!cardEl) return;
            var rect = cardEl.getBoundingClientRect();
            var size = clampSize(ensureDraft().size);
            var scale = clampLayout(ensureDraft().layout, size).scale;
            var mmX = rect.width / (size.wMm * scale) || 1;
            var mmY = rect.height / (size.hMm * scale) || 1;
            // Текст оверлея правится кликом, поэтому начинаем перетаскивание
            // только после движения (порог в pointermove). Без этого текстовый
            // блок вообще нельзя было сдвинуть: contenteditable съедал нажатие.
            var editable = ev.target.closest('[contenteditable="true"]');
            state.drag = {
                id: id, resize: !!handle,
                startX: ev.clientX, startY: ev.clientY,
                ox: ov.xMm, oy: ov.yMm, ow: ov.wMm, oh: ov.hMm,
                mmX: mmX, mmY: mmY,
                pending: !!editable && !handle,
                el: ovEl, pointerId: ev.pointerId
            };
            if (state.drag.pending) return;
            host.querySelectorAll('[data-overlay-id]').forEach(function (el) { el.classList.remove('selected'); });
            ovEl.classList.add('selected');
            try { ovEl.setPointerCapture(ev.pointerId); } catch (e) { /* silent */ }
            ev.preventDefault();
        });
        host.addEventListener('pointermove', function (ev) {
            if (state.boxDrag) { moveBoxDrag(ev); return; }
            if (state.blockDrag) { moveBlockDrag(ev); return; }
            if (state.cardDrag) { moveCardDrag(ev, host); return; }
            if (!state.drag) return;
            var dr = state.drag;
            var pxX = ev.clientX - dr.startX;
            var pxY = ev.clientY - dr.startY;
            if (dr.pending) {
                // Ещё не движение, а клик — оставляем правку текста.
                if (Math.abs(pxX) < DRAG_THRESHOLD_PX && Math.abs(pxY) < DRAG_THRESHOLD_PX) return;
                dr.pending = false;
                try { dr.el.setPointerCapture(ev.pointerId); } catch (e) { /* silent */ }
                dr.el.classList.add('selected');
                var active = doc() && doc().activeElement;
                if (active && active !== doc().body && typeof active.blur === 'function') active.blur();
                ev.preventDefault();
            }
            var dx = pxX / dr.mmX;
            var dy = pxY / dr.mmY;
            var ov = overlayById(dr.id);
            if (!ov) return;
            if (dr.resize) { ov.wMm = dr.ow + dx; ov.hMm = dr.oh + dy; }
            else { ov.xMm = dr.ox + dx; ov.yMm = dr.oy + dy; }
            var next = clampOverlay(ov, ensureDraft().size);
            ensureDraft().overlays = ensureDraft().overlays.map(function (o) { return o.id === next.id ? next : o; });
            patchOverlayDom(next);
            syncOverlayInputs(next);
        });
        host.addEventListener('pointerup', function () {
            if (state.boxDrag) { endBoxDrag(); return; }
            if (state.blockDrag) { endBlockDrag(); return; }
            if (state.cardDrag) { endCardDrag(host); return; }
            if (!state.drag) return;
            var wasPending = state.drag.pending;
            state.drag = null;
            if (wasPending) return;   // это был клик по тексту — сохранять нечего
            persistSoon();
        });
        host.addEventListener('pointercancel', function () {
            if (state.boxDrag) { endBoxDrag(); return; }
            if (state.blockDrag) { endBlockDrag(); return; }
            if (state.cardDrag) { endCardDrag(host); return; }
            state.drag = null;
        });
        host.addEventListener('dblclick', function (ev) {
            // Двойной клик по блоку таблицы — его настройки (цвет/шрифт/размер).
            if (ev.target.closest('[data-tnpc-box-drag]')) return;
            var blockOv = ev.target.closest('[data-overlay-id][data-type="block"]');
            if (blockOv) { focusOverlayConfig(blockOv.getAttribute('data-overlay-id')); return; }
            if (!ev.target.closest('[contenteditable="true"]') &&
                !ev.target.closest('[data-tnpc-block-resize]') &&
                !ev.target.closest('[data-tnm-act]')) {
                var blockEl = ev.target.closest('.tnpc-block');
                if (blockEl) {
                    focusBlockConfig(blockEl.getAttribute('data-tnpc-block') || '');
                    return;
                }
            }
            var ovEl = ev.target.closest('[data-overlay-id]');
            if (!ovEl || ovEl.getAttribute('data-type') !== 'qr') return;
            var id = ovEl.getAttribute('data-overlay-id');
            var ov = overlayById(id);
            if (!ov) return;
            var next = root.prompt(bi('Содержимое QR (URL или текст). Пусто — QR маркера игрока.',
                'QR payload (URL or text). Empty — player marker QR.'), ov.payload || '');
            if (next == null) return;
            ov.payload = String(next);
            ensureDraft().overlays = ensureDraft().overlays.map(function (o) { return o.id === ov.id ? clampOverlay(ov, ensureDraft().size) : o; });
            persistSoon();
            rerenderCard();
        });

        // Картинку можно просто перетащить файлом на предпросмотр.
        host.addEventListener('dragover', function (ev) {
            var stage = ev.target.closest('[data-tnpc-stage]');
            if (!stage) return;
            if (!(ev.dataTransfer && ev.dataTransfer.types && Array.prototype.indexOf.call(ev.dataTransfer.types, 'Files') !== -1)) return;
            ev.preventDefault();
            stage.classList.add('drop-ready');
        });
        host.addEventListener('dragleave', function (ev) {
            var stage = ev.target.closest('[data-tnpc-stage]');
            if (stage) stage.classList.remove('drop-ready');
        });
        host.addEventListener('drop', function (ev) {
            var stage = ev.target.closest('[data-tnpc-stage]');
            if (!stage) return;
            stage.classList.remove('drop-ready');
            var files = ev.dataTransfer && ev.dataTransfer.files;
            if (!files || !files.length) return;
            ev.preventDefault();
            var cardEl = stage.querySelector('.tnpc-card');
            var point = { xMm: 6, yMm: 6 };
            if (cardEl) {
                var rect = cardEl.getBoundingClientRect();
                var size = clampSize(ensureDraft().size);
                var scale = clampLayout(ensureDraft().layout, size).scale;
                point = {
                    xMm: Math.max(0, (ev.clientX - rect.left) / (rect.width / (size.wMm * scale) || 1)),
                    yMm: Math.max(0, (ev.clientY - rect.top) / (rect.height / (size.hMm * scale) || 1))
                };
            }
            readImageFile(files[0], point);
        });

        // Строки счётной таблицы можно менять местами прямо на карточке.
        host.addEventListener('dragstart', function (ev) {
            var handle = ev.target.closest('[data-tnpc-row-handle]');
            var row = handle && handle.closest('[data-tnpc-table-row]');
            if (!row || !ev.dataTransfer) return;
            state.tableDragId = handle.getAttribute('data-tnpc-row-handle');
            ev.dataTransfer.effectAllowed = 'move';
            ev.dataTransfer.setData('text/plain', 'tnpc-table-row:' + state.tableDragId);
        });
        host.addEventListener('dragover', function (ev) {
            var row = ev.target.closest('[data-tnpc-table-row]');
            if (!row || !state.tableDragId) return;
            ev.preventDefault();
            row.classList.add('drop-target');
        });
        host.addEventListener('dragleave', function (ev) {
            var row = ev.target.closest('[data-tnpc-table-row]');
            if (row && (!ev.relatedTarget || !row.contains(ev.relatedTarget))) row.classList.remove('drop-target');
        });
        host.addEventListener('drop', function (ev) {
            var row = ev.target.closest('[data-tnpc-table-row]');
            if (!row || !state.tableDragId) return;
            ev.preventDefault();
            host.querySelectorAll('[data-tnpc-table-row].drop-target').forEach(function (item) {
                item.classList.remove('drop-target');
            });
            var sourceId = state.tableDragId;
            var targetId = row.getAttribute('data-tnpc-table-row');
            state.tableDragId = '';
            moveTableRow(sourceId, targetId);
        });
        host.addEventListener('dragend', function () {
            state.tableDragId = '';
            host.querySelectorAll('[data-tnpc-table-row].drop-target').forEach(function (row) {
                row.classList.remove('drop-target');
            });
        });
        host.addEventListener('keydown', function (ev) {
            var handle = ev.target.closest('[data-tnpc-row-handle]');
            if (!handle || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
            ev.preventDefault();
            shiftTableRow(handle.getAttribute('data-tnpc-row-handle'), ev.key === 'ArrowUp' ? -1 : 1);
        });

        // Порядок карточек перетаскиванием свёрнутых строк.
        host.addEventListener('dragstart', function (ev) {
            var row = ev.target.closest('[data-tnpc-order]');
            if (!row || !ev.dataTransfer) return;
            ev.dataTransfer.setData('text/plain', row.getAttribute('data-tnpc-order'));
        });
        host.addEventListener('dragover', function (ev) {
            if (ev.target.closest('[data-tnpc-order]')) ev.preventDefault();
        });
        host.addEventListener('drop', function (ev) {
            var row = ev.target.closest('[data-tnpc-order]');
            if (!row || !ev.dataTransfer) return;
            var srcId = ev.dataTransfer.getData('text/plain');
            if (!srcId) return;
            ev.preventDefault();
            moveCard(srcId, row.getAttribute('data-tnpc-order'));
        });

        // Инлайн-правка текста на карточке: сохраняем на каждый ввод.
        host.addEventListener('input', function (ev) {
            var el = ev.target;
            if (!el || !el.getAttribute) return;
            var field = el.getAttribute('data-tnpc-field');
            var grid = el.getAttribute('data-tnpc-grid');
            var ovText = el.getAttribute('data-tnpc-overlay-text');
            if (field) applyInline(el, field);
            else if (grid) applyGrid(el, grid, false);
            else if (ovText) applyOverlayText(ovText, el.textContent);
        });
        host.addEventListener('blur', function (ev) {
            var el = ev.target;
            if (!el || !el.getAttribute) return;
            var field = el.getAttribute('data-tnpc-field');
            var grid = el.getAttribute('data-tnpc-grid');
            var ovText = el.getAttribute('data-tnpc-overlay-text');
            if (field) applyInline(el, field);
            if (grid) applyGrid(el, grid, true);
            if (ovText) applyOverlayText(ovText, el.textContent);
        }, true);
    }

    function applyOverlayText(id, text) {
        var ov = overlayById(id);
        if (!ov) return;
        ov.text = String(text == null ? '' : text).trim();
        ensureDraft().overlays = ensureDraft().overlays.map(function (o) { return o.id === id ? clampOverlay(ov, ensureDraft().size) : o; });
        persistSoon();
        var input = doc() && doc().querySelector('[data-tnm-live-edit="tnpc-overlay"][data-id="' + id + '"][data-field="text"]');
        if (input && input.value !== ov.text) input.value = ov.text;
    }

    function syncOverlayInputs(o) {
        var d = doc();
        if (!d) return;
        ['xMm', 'yMm', 'wMm', 'hMm'].forEach(function (field) {
            var input = d.querySelector('[data-tnm-live-edit="tnpc-overlay"][data-id="' + o.id + '"][data-field="' + field + '"]');
            if (input && doc().activeElement !== input) input.value = o[field];
        });
    }

    function moveCard(srcId, dstId) {
        var list = ensureDraft().cards;
        var si = -1;
        var di = -1;
        list.forEach(function (c, i) {
            if (c.id === srcId) si = i;
            if (c.id === dstId) di = i;
        });
        if (si < 0 || di < 0 || si === di) return;
        var item = list.splice(si, 1)[0];
        list.splice(di, 0, item);
        list.forEach(function (c, i) { c.order = i; });
        ensureDraft().orderLocked = true;
        persistSoon();
        ui().render();
    }

    function shiftCard(id, delta) {
        var list = ensureDraft().cards;
        var i = -1;
        list.forEach(function (c, k) { if (c.id === id) i = k; });
        var j = i + delta;
        if (i < 0 || j < 0 || j >= list.length) return;
        var tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
        list.forEach(function (c, k) { c.order = k; });
        ensureDraft().orderLocked = true;
        persistSoon();
        ui().render();
    }

    function moveTableRow(sourceId, targetId) {
        var draft = ensureDraft();
        var before = normalizeRowOrder(draft.rowOrder);
        var after = reorderRowOrder(before, sourceId, targetId);
        if (before.join('|') === after.join('|')) return;
        draft.rowOrder = after;
        persistSoon();
        rerenderCard();
    }

    function shiftTableRow(id, delta) {
        var order = visibleRowOrder(ensureDraft());
        var index = order.indexOf(id);
        var targetIndex = index + delta;
        if (index < 0 || targetIndex < 0 || targetIndex >= order.length) return;
        moveTableRow(id, order[targetIndex]);
    }

    function applyInline(el, field) {
        var text = (el.textContent || '').trim();
        var draft = ensureDraft();
        var cid = el.getAttribute('data-cid');
        if (field.indexOf('footer.') === 0) {
            draft.footer[field.split('.')[1]] = text;
            persistSoon();
            return;
        }
        if (field === 'tournamentName' || field === 'subtitle' || field === 'date') {
            var t = ui().tournament() || {};
            var auto = field === 'tournamentName' ? String(t.name || '')
                : field === 'subtitle' ? [t.club, t.course].filter(Boolean).join(' · ')
                    : (core().dateRu ? core().dateRu(t.startDate || t.date || '') : String(t.startDate || t.date || ''));
            // Совпало с данными турнира — снимаем переопределение (снова «живое»).
            draft.text[field] = text === String(auto || '').trim() ? '' : text;
            persistSoon();
            return;
        }
        if (!cid) return;
        var card = findCard(cid);
        if (!card) return;
        if (field === 'names') card.names = text.split(/\s*[+/]\s*/).filter(Boolean);
        else if (field === 'hcps') card.hcps = text.split(/\s*\//).map(function (v) { return v.trim(); }).filter(function (v) { return v !== ''; });
        else if (field === 'fieldHcps') {
            card.fieldHcps = text.split(/\s*\//).map(function (v) {
                var n = parseFloat(String(v).trim().replace(',', '.').replace(/^\+/, '-'));
                return isFinite(n) ? Math.round(n) : null;
            });
            if (!card.fieldHcps.some(function (v) { return v !== null; })) {
                // Очистили поле — снова считаем из точного HCP и ТИ.
                card.edits = card.edits || {};
                delete card.edits.fieldHcps;
                if (!Object.keys(card.edits).length) card.edits = null;
                state.cardsSig = cardsSignature(draft.cards);
                persistSoon();
                syncRowSummary(card);
                return;
            }
        }
        else if (field === 'tee') card.tee = text;
        else if (field === 'startHole') card.startHole = parseInt(text, 10) || card.startHole;
        else if (field === 'startTime') card.startTime = text;
        else if (field === 'flight') card.flight = text;
        else return;
        card.edits = card.edits || {};
        card.edits[field] = true;
        state.cardsSig = cardsSignature(draft.cards);
        persistSoon();
        syncRowSummary(card);
        var masterName = doc() && doc().querySelector('[data-tnpc-master-name]');
        if (masterName && state.activeCardId === cid) masterName.textContent = nameText(card);
    }

    function applyGrid(el, kind, rerender) {
        var h = parseInt(el.getAttribute('data-h'), 10);
        var v = parseInt((el.textContent || '').trim(), 10);
        var draft = ensureDraft();
        if (kind === 'par') {
            if (!isFinite(v) || v < 3 || v > 6) { el.textContent = String(draft.pars[h] || 4); return; }
            draft.pars[h] = v;
        } else if (kind === 'idx') {
            if (!isFinite(v) || v < 1 || v > 18) { el.textContent = String(draft.indexes[h] || (h + 1)); return; }
            draft.indexes[h] = v;
        } else if (kind === 'len') {
            var raw = (el.textContent || '').trim();
            if (!raw || !isFinite(v) || v < 0 || v > 999) {
                el.textContent = draft.lengths && draft.lengths[h] > 0 ? String(draft.lengths[h]) : '';
                return;
            }
            draft.lengths[h] = v;
        } else return;
        persistSoon();
        syncPanelInputs(kind, h, v);
        if (rerender) rerenderCard();
    }

    function syncPanelInputs(kind, h, v) {
        var d = doc();
        if (!d) return;
        var sel = kind === 'par' ? '[data-tnm-live-edit="tnpc-par"][data-h="' + h + '"]'
            : kind === 'idx' ? '[data-tnm-live-edit="tnpc-idx"][data-h="' + h + '"]'
                : '[data-tnm-live-edit="tnpc-len"][data-h="' + h + '"]';
        var input = d.querySelector(sel);
        if (input && d.activeElement !== input) input.value = v;
        // Пересчитываем итоги строк «Пар» и «Длина» независимо от их положения
        // в таблице (блоки теперь отдельные таблицы).
        if (kind === 'par' || kind === 'len') {
            var n = holeCount();
            var outN = Math.min(9, n);
            var draft = ensureDraft();
            var values = kind === 'par' ? draft.pars : (draft.lengths || defaultLengths());
            var sums = n > 9
                ? [kind === 'par' ? parSum(0, outN) : lenSum(values, 0, outN),
                    kind === 'par' ? parSum(outN, n) : lenSum(values, outN, n),
                    kind === 'par' ? parSum(0, n) : lenSum(values, 0, n)]
                : [kind === 'par' ? parSum(0, n) : lenSum(values, 0, n),
                    kind === 'par' ? parSum(0, n) : lenSum(values, 0, n)];
            var blockKey = kind === 'len' ? 'length' : kind;
            var rowSel = kind === 'len' ? ' tr[data-tnpc-len-src="draft"]' : '';
            var row = d.querySelector('.tnpc-card .tnpc-table-row[data-tnpc-table-row="' + blockKey + '"]' + rowSel);
            var cells = row ? row.querySelectorAll('td.sum') : [];
            cells.forEach(function (cell, i) { if (sums[i] != null) cell.textContent = sums[i]; });
        }
    }

    /** Единый источник логотипа, чтобы все его блоки сразу подхватывали замену. */
    function setLogoSource(draft, source) {
        var d = draft || ensureDraft();
        var src = String(source || '');
        d.logoSrc = src;
        var found = false;
        d.overlays = (d.overlays || []).map(function (o) {
            if (o.type !== 'logo') return o;
            found = true;
            // Не дублируем base64 в каждом оверлее: logoSrc — canonical source.
            return clampOverlay(Object.assign({}, o, { src: '', enabled: true }), d.size);
        });
        if (!found) {
            d.overlays.push(clampOverlay({
                id: 'logo', type: 'logo', xMm: 4, yMm: 4, wMm: 28, hMm: 16, enabled: true, src: ''
            }, d.size));
        }
        return d;
    }

    function readImageFile(file, point) {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            ui().toastMsg(bi('Файл больше 2 МБ — сожмите картинку', 'File is larger than 2 MB'), 'error');
            return;
        }
        var okType = /image\/(png|jpeg|svg\+xml)/.test(file.type) || /\.(png|jpe?g|svg)$/i.test(file.name || '');
        if (!okType) {
            ui().toastMsg(bi('Нужен PNG, JPG или SVG', 'PNG, JPG or SVG required'), 'error');
            return;
        }
        var targetId = state.imageTarget || '';
        state.imageTarget = '';
        var reader = new root.FileReader();
        reader.onload = function () {
            var src = String(reader.result || '');
            var d = ensureDraft();
            var target = targetId ? overlayById(targetId) : null;
            if (target) {
                // Файл загружен в существующий блок (кнопка «Загрузить файл…»).
                // Для логотипа обновляем и общий источник: он имеет приоритет
                // при рендере, иначе после замены снова показывался старый файл.
                if (target.type === 'logo') {
                    setLogoSource(d, src);
                } else {
                    target.src = src;
                    target.enabled = true;
                    d.overlays = d.overlays.map(function (o) {
                        return o.id === target.id ? clampOverlay(target, d.size) : o;
                    });
                }
                persistSoon();
                ui().render();
                ui().toastMsg(bi('Файл подставлен в блок — перетащите его на место', 'File set — drag the block into place'));
                return;
            }
            var p = point || { xMm: 4, yMm: 4 };
            var ov = clampOverlay({
                id: 'img-' + Date.now(),
                type: 'image',
                xMm: p.xMm, yMm: p.yMm, wMm: 30, hMm: 20,
                enabled: true, src: src
            }, d.size);
            d.overlays.push(ov);
            state.panels.overlays = true;
            persistSoon();
            ui().render();
            ui().toastMsg(bi('Картинка добавлена на карточку — перетащите её на место', 'Image added — drag it into place'));
        };
        reader.readAsDataURL(file);
    }

    function readLogoFile(file) {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            ui().toastMsg(bi('Логотип больше 2 МБ', 'Logo larger than 2 MB'), 'error');
            return;
        }
        var okType = /image\/(png|jpeg|svg\+xml)/.test(file.type) || /\.(png|jpe?g|svg)$/i.test(file.name || '');
        if (!okType) {
            ui().toastMsg(bi('Нужен PNG, JPG или SVG', 'PNG, JPG or SVG required'), 'error');
            return;
        }
        var reader = new root.FileReader();
        reader.onload = function () {
            setLogoSource(ensureDraft(), String(reader.result || ''));
            persistSoon();
            ui().render();
            ui().toastMsg(bi('Лого добавлено — перетащите его на карточке', 'Logo added — drag it into place'));
        };
        reader.readAsDataURL(file);
    }

    function addOverlay(type) {
        var d = ensureDraft();
        var size = clampSize(d.size);
        var count = d.overlays.filter(function (o) { return o.type === type; }).length;
        var base = {
            id: type + '-' + Date.now(),
            type: type,
            xMm: 4 + count * 6,
            yMm: type === 'qr' ? 4 + count * 4 : size.hMm - 24 - count * 4,
            wMm: type === 'qr' ? 26 : type === 'text' ? 60 : 28,
            hMm: type === 'qr' ? 26 : type === 'text' ? 10 : 16,
            enabled: true,
            payload: '',
            text: type === 'text' ? bi('Текст на карточке', 'Card text') : '',
            src: '',
            fontMm: 3
        };
        if (type === 'qr') d.qrEnabled = true;
        d.overlays.push(clampOverlay(base, size));
        state.panels.overlays = true;
        persistSoon();
        ui().render();
    }

    // ----------------------------------------------------------
    // МОНТИРОВАНИЕ
    // ----------------------------------------------------------
    var stageObserver = null;
    function observeStage() {
        var d = doc();
        if (!d || !root.ResizeObserver) return;
        var stage = d.querySelector('[data-tnpc-stage]');
        if (!stage) return;
        if (stageObserver) { try { stageObserver.disconnect(); } catch (e) { /* silent */ } }
        stageObserver = new root.ResizeObserver(function () { fitStage(); });
        try { stageObserver.observe(stage); } catch (e) { /* silent */ }
    }

    var resizeBound = false;
    function bindResize() {
        if (resizeBound || !root.addEventListener) return;
        resizeBound = true;
        var timer = null;
        root.addEventListener('resize', function () {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
                timer = null;
                if (ui().state.route.view === 'card' && ui().state.route.tab === 'printcards') fitStage();
            }, 120);
        });
    }

    function bindFileInputs(host) {
        var logo = host.querySelector('#tnpc-logo-file');
        if (logo && !logo._tnpc) {
            logo._tnpc = true;
            logo.addEventListener('change', function () {
                readLogoFile(logo.files && logo.files[0]);
                logo.value = '';
            });
        }
        var image = host.querySelector('#tnpc-image-file');
        if (image && !image._tnpc) {
            image._tnpc = true;
            image.addEventListener('change', function () {
                readImageFile(image.files && image.files[0], null);
                image.value = '';
            });
        }
    }

    function mount() {
        var host = ui().rootEl();
        ensureCardStyle();
        if (!host) return;
        if (!host._tnpcDrag) {
            host._tnpcDrag = true;
            bindDrag(host);
        }
        bindFileInputs(host);
        bindResize();
        fitStage();
        observeStage();
        updateSaveLabel();
    }

    // ----------------------------------------------------------
    // ДЕЙСТВИЯ
    // ----------------------------------------------------------
    ui().on('tnpc-print-all', function () { printCards(visibleCards()); });
    ui().on('tnpc-pdf-selected', function () {
        var list = selectedCards();
        if (!list.length) {
            ui().toastMsg(bi('Отметьте галочками карточки для PDF', 'Tick the cards you need in PDF'), 'error');
            return;
        }
        printCards(list);
    });
    ui().on('tnpc-refresh', function () {
        state.scoresAt = 0;
        refreshCards();
        ensureScores();
        ui().render();
        ui().toastMsg(bi('Данные карточек обновлены', 'Cards refreshed from tournament data'));
    });
    ui().on('tnpc-rebuild', function () {
        var d = ensureDraft();
        d.orderLocked = false;
        (d.cards || []).forEach(function (c) { c.edits = null; });
        state.scoresAt = 0;
        state.cardsSig = '';
        refreshCards();
        ensureScores();
        ui().render();
        ui().toastMsg(bi('Карточки пересобраны из данных турнира', 'Cards rebuilt from tournament data'));
    });
    ui().on('tnpc-add', function () { ui().openModal('tnpc-add', {}); });
    ui().on('tnpc-open-card', function (btn) {
        state.activeCardId = btn.getAttribute('data-id');
        ui().render();
    });
    ui().on('tnpc-move-up', function (btn) { shiftCard(btn.getAttribute('data-id'), -1); });
    ui().on('tnpc-move-down', function (btn) { shiftCard(btn.getAttribute('data-id'), 1); });
    ui().on('tnpc-table-row-up', function (btn) { shiftTableRow(btn.getAttribute('data-id'), -1); });
    ui().on('tnpc-table-row-down', function (btn) { shiftTableRow(btn.getAttribute('data-id'), 1); });
    ui().on('tnpc-preview-mode', function () {
        state.preview = state.preview === 'card' ? 'sheet' : 'card';
        state.previewPinned = true;
        ui().render();
    });
    ui().on('tnpc-panel-sizes', function () { state.panels.sizes = !state.panels.sizes; ui().render(); });
    ui().on('tnpc-panel-fields', function () { state.panels.fields = !state.panels.fields; ui().render(); });
    ui().on('tnpc-panel-content', function () { state.panels.content = !state.panels.content; ui().render(); });
    ui().on('tnpc-panel-overlays', function () { state.panels.overlays = !state.panels.overlays; ui().render(); });
    ui().on('tnpc-panel-design', function () { state.panels.design = !state.panels.design; ui().render(); });
    ui().on('tnpc-design-reset', function () {
        ensureDraft().design = defaultDesign();
        persistSoon();
        ui().render();
    });
    ui().on('tnpc-row-reset', function (btn) {
        var key = btn.getAttribute('data-id');
        var d = ensureDraft();
        if (d.rows) delete d.rows[key];
        persistSoon();
        patchBlockDom(key);
        ui().render();
    });
    ui().on('tnpc-row-color-clear', function (btn) {
        var key = btn.getAttribute('data-id');
        var field = btn.getAttribute('data-field');
        var d = ensureDraft();
        var cfg = Object.assign({}, (d.rows || {})[key]);
        delete cfg[field];
        d.rows = d.rows || {};
        d.rows[key] = clampRowCfg(key, cfg, d.style);
        persistSoon();
        patchBlockDom(key);
        ui().render();
    });
    ui().on('live:tnpc-design', function (input) {
        var field = input.getAttribute('data-field');
        var d = ensureDraft();
        var next = Object.assign({}, d.design);
        if (field === 'font') next.font = input.value;
        d.design = clampDesign(next);
        persistSoon();
        patchCardDom(d);
    });
    ui().on('live:tnpc-design-color', function (input) {
        var field = input.getAttribute('data-field');
        var d = ensureDraft();
        var next = Object.assign({}, d.design);
        next[field] = input.value;
        d.design = clampDesign(next);
        persistSoon();
        patchCardDom(d);
    });
    ui().on('live:tnpc-row', function (input) {
        var key = input.getAttribute('data-block');
        var field = input.getAttribute('data-field');
        if (!key || !ROW_FIELD_LIMITS[field]) return;
        var d = ensureDraft();
        var cfg = Object.assign({}, (d.rows || {})[key]);
        cfg[field] = input.value;
        d.rows = d.rows || {};
        d.rows[key] = clampRowCfg(key, cfg, d.style);
        persistSoon();
        patchBlockDom(key);
    });
    ui().on('live:tnpc-row-font', function (input) {
        var key = input.getAttribute('data-block');
        var d = ensureDraft();
        var cfg = Object.assign({}, (d.rows || {})[key]);
        cfg.font = input.value;
        d.rows = d.rows || {};
        d.rows[key] = clampRowCfg(key, cfg, d.style);
        persistSoon();
        patchBlockDom(key);
    });
    ui().on('live:tnpc-row-color', function (input) {
        var key = input.getAttribute('data-block');
        var field = input.getAttribute('data-field');
        if (!key || (field !== 'color' && field !== 'bg')) return;
        var d = ensureDraft();
        var cfg = Object.assign({}, (d.rows || {})[key]);
        cfg[field] = input.value;
        d.rows = d.rows || {};
        d.rows[key] = clampRowCfg(key, cfg, d.style);
        persistSoon();
        patchBlockDom(key);
    });
    ui().on('edit:tnpc-row-bold', function (input) {
        var key = input.getAttribute('data-block');
        var d = ensureDraft();
        var cfg = Object.assign({}, (d.rows || {})[key]);
        cfg.bold = !!input.checked;
        d.rows = d.rows || {};
        d.rows[key] = clampRowCfg(key, cfg, d.style);
        persistSoon();
        patchBlockDom(key);
    });
    ui().on('live:tnpc-len', function (input) {
        var h = parseInt(input.getAttribute('data-h'), 10);
        var v = parseInt(input.value, 10);
        if (!isFinite(h) || h < 0 || h > 17) return;
        if (input.value === '') { ensureDraft().lengths[h] = 0; }
        else if (!isFinite(v) || v < 0 || v > 999) return;
        else ensureDraft().lengths[h] = v;
        persistSoon();
        rerenderCard();
    });
    ui().on('tnpc-len-tee', function (btn) {
        var tee = btn.getAttribute('data-tee') || 'wh';
        ensureDraft().lengths = defaultLengths(tee);
        persistSoon();
        ui().render();
        ui().toastMsg(bi('Длины лунок заполнены по выбранному ТИ', 'Hole lengths filled from the selected tee'));
    });

    ui().on('tnpc-fit-page', function () {
        var d = ensureDraft();
        var size = clampSize(d.size);
        var L = clampLayout(d.layout, size);
        // Максимальный масштаб, при котором выбранное число карточек целиком
        // влезает на лист A4 landscape, и карточка встаёт по центру листа.
        var maxByWidth = (PAGE_W - (L.perSheet === 2 ? L.gapMm : 0)) / (size.wMm * L.perSheet);
        var maxByHeight = PAGE_H / size.hMm;
        var scale = Math.round(Math.min(maxByWidth, maxByHeight, 2) * 100) / 100;
        var total = round1(size.wMm * scale * L.perSheet + (L.perSheet === 2 ? L.gapMm : 0));
        d.layout = clampLayout({
            xMm: Math.max(0, round1((PAGE_W - total) / 2)),
            yMm: Math.max(0, round1((PAGE_H - size.hMm * scale) / 2)),
            scale: scale,
            gapMm: L.gapMm,
            perSheet: L.perSheet
        }, size);
        persistSoon();
        ui().render();
    });
    ui().on('tnpc-style-reset', function () {
        ensureDraft().style = defaultStyle();
        persistSoon();
        ui().render();
    });
    ui().on('tnpc-logo', function () { pickFile('#tnpc-logo-file'); });
    ui().on('tnpc-logo-ph', function () { pickFile('#tnpc-logo-file'); });
    ui().on('tnpc-image-ph', function () { pickFile('#tnpc-image-file'); });
    ui().on('tnpc-overlay-src', function (btn) {
        state.imageTarget = btn.getAttribute('data-id');
        pickFile('#tnpc-image-file');
    });
    ui().on('tnpc-logo-add', function () {
        var d = ensureDraft();
        if (d.logoSrc) addOverlay('logo');
        else pickFile('#tnpc-logo-file');
    });
    ui().on('tnpc-image-add', function () { pickFile('#tnpc-image-file'); });
    ui().on('tnpc-qr-add', function () { addOverlay('qr'); });
    ui().on('tnpc-text-add', function () { addOverlay('text'); });
    ui().on('tnpc-block-add', function (btn) { addBlockOverlay(btn.getAttribute('data-preset') || 'custom'); });
    ui().on('tnpc-ovb-insert', function (btn) {
        var id = btn.getAttribute('data-id');
        var key = btn.getAttribute('data-key');
        var ov = overlayById(id);
        if (!ov || !key) return;
        var token = '{' + key + '}';
        var dd = doc();
        var ta = dd && dd.querySelector('textarea[data-tnm-live-edit="tnpc-overlay"][data-id="' + id + '"]');
        var text = ov.text || '';
        var pos = ta && typeof ta.selectionStart === 'number' && dd.activeElement === ta ? ta.selectionStart : text.length;
        var end = ta && typeof ta.selectionEnd === 'number' && dd.activeElement === ta ? ta.selectionEnd : pos;
        // Кнопка уводит фокус из поля — берём последнюю запомненную позицию курсора.
        if (ta && dd.activeElement !== ta && ta.getAttribute('data-caret')) {
            pos = end = Math.min(text.length, parseInt(ta.getAttribute('data-caret'), 10) || text.length);
        }
        var next = text.slice(0, pos) + token + text.slice(end);
        updateBlockOverlay(id, { text: next });
        if (ta) {
            ta.value = next;
            ta.setAttribute('data-caret', String(pos + token.length));
            try { ta.focus(); ta.setSelectionRange(pos + token.length, pos + token.length); } catch (e) { /* silent */ }
        }
        refreshBlockSample(id);
    });
    ui().on('edit:tnpc-ovb', function (input) {
        var field = input.getAttribute('data-field');
        var patch = {};
        if (field === 'bold') patch.bold = !!input.checked;
        else if (field === 'align' || field === 'border') patch[field] = input.value;
        else return;
        updateBlockOverlay(input.getAttribute('data-id'), patch);
    });
    ui().on('live:tnpc-ovb-color', function (input) {
        var patch = {};
        var field = input.getAttribute('data-field');
        if (field !== 'color' && field !== 'bg') return;
        patch[field] = input.value;
        updateBlockOverlay(input.getAttribute('data-id'), patch);
    });
    ui().on('tnpc-ovb-color-clear', function (btn) {
        var patch = {};
        var field = btn.getAttribute('data-field');
        if (field !== 'color' && field !== 'bg') return;
        patch[field] = '';
        updateBlockOverlay(btn.getAttribute('data-id'), patch);
        ui().render();
    });
    ui().on('live:tnpc-box', function (input) {
        var key = input.getAttribute('data-box');
        var field = input.getAttribute('data-field');
        if (BOX_KEYS.indexOf(key) === -1) return;
        var v = Number(input.value);
        if (!isFinite(v) || input.value === '') return;
        if (field === 'kPct') setBox(key, Object.assign({}, boxOf(key), { k: v / 100 }));
        else if (field === 'xMm' || field === 'yMm' || field === 'wMm') {
            var patch = {};
            patch[field] = v;
            setBox(key, Object.assign({}, freeBox(key), patch));
        } else return;
        persistSoon();
        patchBoxDom(key);
        syncBoxInputs(key);
        if (key === 'table') syncAllBlockInputs();
    });
    ui().on('edit:tnpc-box-free', function (input) {
        var key = input.getAttribute('data-box');
        if (BOX_KEYS.indexOf(key) === -1) return;
        if (input.checked) freeBox(key);
        else setBox(key, Object.assign({}, boxOf(key), { free: false }));
        persistSoon();
        patchBoxDom(key);
        syncBoxInputs(key);
    });
    ui().on('tnpc-box-reset', function (btn) {
        var key = btn.getAttribute('data-box');
        if (BOX_KEYS.indexOf(key) === -1) return;
        var d = ensureDraft();
        setBox(key, defaultBox(key, d.size));
        persistSoon();
        ui().render();
    });
    ui().on('tnpc-reset-ov', function () {
        var d = ensureDraft();
        d.overlays = defaultOverlays().map(function (o) { return clampOverlay(o, d.size); });
        if (d.qrEnabled) d.overlays.forEach(function (o) { if (o.type === 'qr') o.enabled = true; });
        if (d.logoSrc) d.overlays.forEach(function (o) { if (o.type === 'logo') o.enabled = true; });
        persistSoon();
        ui().render();
    });
    ui().on('tnpc-overlay-del', function (btn) {
        var id = btn.getAttribute('data-id');
        ensureDraft().overlays = ensureDraft().overlays.filter(function (o) { return o.id !== id; });
        persistSoon();
        ui().render();
    });
    ui().on('tnpc-del-card', function (btn) {
        var id = btn.getAttribute('data-id');
        var d = ensureDraft();
        d.cards = (d.cards || []).filter(function (c) { return c.id !== id; });
        if (state.activeCardId === id) state.activeCardId = '';
        delete state.selected[id];
        d.orderLocked = true;
        d.cards.forEach(function (c, i) { c.order = i; });
        state.cardsSig = cardsSignature(d.cards);
        persistSoon();
        ui().render();
    });
    ui().on('tnpc-pdf-one', function (btn) {
        var card = findCard(btn.getAttribute('data-id'));
        if (card) printCards([card]);
    });
    ui().on('tnpc-print-one', function (btn) {
        var card = findCard(btn.getAttribute('data-id'));
        if (card) printCards([card]);
    });
    ui().on('tnpc-add-confirm', function () {
        var host = ui().rootEl();
        if (!host) return;
        var name = (host.querySelector('[data-tnpc-new="name"]') || {}).value || '';
        var hcp = (host.querySelector('[data-tnpc-new="hcp"]') || {}).value || '';
        var tee = (host.querySelector('[data-tnpc-new="tee"]') || {}).value || '';
        var hole = (host.querySelector('[data-tnpc-new="hole"]') || {}).value || '1';
        var time = (host.querySelector('[data-tnpc-new="time"]') || {}).value || '';
        if (!name.trim()) return;
        var d = ensureDraft();
        var id = 'manual-' + Date.now();
        d.cards.push({
            id: id,
            playerIds: [],
            names: [name.trim()],
            hcps: [hcp],
            tee: tee,
            startHole: parseInt(hole, 10) || 1,
            startTime: time,
            flight: '',
            manual: true,
            missingPair: false,
            edits: null,
            order: d.cards.length
        });
        state.activeCardId = id;
        ui().closeModal();
        state.cardsSig = cardsSignature(d.cards);
        persistSoon();
        ui().render();
    });

    function pickFile(selector) {
        var host = ui().rootEl();
        var input = host && host.querySelector(selector);
        if (input) input.click();
    }

    // ── Живые правки: сразу в предпросмотр, без потери фокуса ──
    ui().on('live:tnpc-query', function (input) {
        state.query = input.value || '';
        var cards = visibleCards();
        var card = pickActive(cards);
        var list = doc() && doc().querySelector('.tnpc-rows');
        if (list) {
            var holder = doc().createElement('div');
            holder.innerHTML = listHtml(cards, card ? card.id : '');
            var fresh = holder.querySelector('.tnpc-rows');
            if (fresh) list.innerHTML = fresh.innerHTML;
        }
        var chips = doc() && doc().querySelectorAll('.tnpc-status .tnpc-chip');
        if (chips && chips.length > 2) chips[2].textContent = bi('Показано', 'Shown') + ': ' + cards.length;
    });
    ui().on('live:tnpc-layout', function (input) {
        var field = input.getAttribute('data-field');
        var d = ensureDraft();
        var def = defaultLayout();
        if (field === 'scalePct') d.layout.scale = clampNum(Number(input.value) / 100, 0.3, 2, def.scale);
        else if (field === 'gapMm') d.layout.gapMm = clampNum(input.value, 0, 60, def.gapMm);
        else if (field === 'xMm') d.layout.xMm = clampNum(input.value, -50, PAGE_W, def.xMm);
        else if (field === 'yMm') d.layout.yMm = clampNum(input.value, -50, PAGE_H, def.yMm);
        d.layout = clampLayout(d.layout, d.size);
        persistSoon();
        rerenderCard();
        refreshFitWarning();
    });
    ui().on('live:tnpc-size', function (input) {
        var field = input.getAttribute('data-field');
        var d = ensureDraft();
        d.size[field] = clampNum(input.value, 60, field === 'wMm' ? PAGE_W : PAGE_H, field === 'wMm' ? CARD_W : CARD_H);
        d.size = clampSize(d.size);
        d.overlays = d.overlays.map(function (o) { return clampOverlay(o, d.size); });
        d.boxes = clampBoxes(d.boxes, d.size);
        persistSoon();
        rerenderCard();
        refreshFitWarning();
    });
    ui().on('live:tnpc-style', function (input) {
        var field = input.getAttribute('data-field');
        if (!STYLE_FIELDS[field]) return;
        var d = ensureDraft();
        d.style[field] = clampNum(input.value, STYLE_FIELDS[field].min, STYLE_FIELDS[field].max, STYLE_FIELDS[field].def);
        d.style = clampStyle(d.style);
        persistSoon();
        var cardEl = doc() && doc().querySelector('.tnpc-card');
        if (cardEl) cardEl.setAttribute('style', cardStyleAttr(d, Number(cardEl.getAttribute('data-slot')) || 0));
    });
    ui().on('live:tnpc-overlay', function (input) {
        var id = input.getAttribute('data-id');
        var field = input.getAttribute('data-field');
        var ov = overlayById(id);
        if (!ov) return;
        if (field === 'payload' || field === 'text' || field === 'title') ov[field] = input.value;
        else ov[field] = clampNum(input.value, 0, PAGE_W, ov[field]);
        if (field === 'text' && typeof input.selectionStart === 'number') input.setAttribute('data-caret', String(input.selectionStart));
        var d = ensureDraft();
        var next = clampOverlay(ov, d.size);
        d.overlays = d.overlays.map(function (o) { return o.id === id ? next : o; });
        persistSoon();
        patchOverlayDom(next);
        if (field === 'payload' || field === 'text' || field === 'title') rerenderCard();
        if (next.type === 'block' && field === 'text') refreshBlockSample(id);
    });
    ui().on('live:tnpc-footer', function (input) {
        var field = input.getAttribute('data-field');
        ensureDraft().footer[field] = input.value;
        persistSoon();
        rerenderCard();
    });
    ui().on('live:tnpc-text', function (input) {
        var field = input.getAttribute('data-field');
        ensureDraft().text[field] = input.value;
        persistSoon();
        rerenderCard();
    });
    ui().on('live:tnpc-par', function (input) {
        var h = parseInt(input.getAttribute('data-h'), 10);
        var v = parseInt(input.value, 10);
        if (!isFinite(v) || v < 3 || v > 6) return;
        ensureDraft().pars[h] = v;
        persistSoon();
        rerenderCard();
    });
    ui().on('live:tnpc-idx', function (input) {
        var h = parseInt(input.getAttribute('data-h'), 10);
        var v = parseInt(input.value, 10);
        if (!isFinite(v) || v < 1 || v > 18) return;
        ensureDraft().indexes[h] = v;
        persistSoon();
        rerenderCard();
        if (state.panels.fields) refreshIndexWarn();
    });

    ui().on('edit:tnpc-filter', function (input) {
        ensureDraft().filters[input.getAttribute('data-field')] = !!input.checked;
        persistSoon();
        ui().render();
    });
    ui().on('edit:tnpc-pick', function (input) {
        state.selected[input.getAttribute('data-id')] = !!input.checked;
    });
    ui().on('edit:tnpc-holes9', function (input) {
        ensureDraft().holes = input.checked ? 9 : 18;
        persistSoon();
        ui().render();
    });
    ui().on('edit:tnpc-persheet', function (input) {
        ensureDraft().layout.perSheet = Number(input.value) === 1 ? 1 : 2;
        ensureDraft().layout = clampLayout(ensureDraft().layout, ensureDraft().size);
        persistSoon();
        ui().render();
    });
    ui().on('edit:tnpc-show', function (input) {
        ensureDraft().show[input.getAttribute('data-field')] = !!input.checked;
        persistSoon();
        rerenderCard();
    });
    ui().on('edit:tnpc-footer-print', function (input) {
        ensureDraft().footer.print = !!input.checked;
        persistSoon();
        ui().render();
    });
    ui().on('edit:tnpc-fillscores', function (input) {
        ensureDraft().fillScores = !!input.checked;
        state.scoresAt = 0;
        persistSoon();
        ensureScores();
        ui().render();
    });
    ui().on('edit:tnpc-qr-global', function (input) { toggleQr(input.checked); });
    ui().on('edit:tnpc-overlay-on', function (input) {
        var id = input.getAttribute('data-id');
        var d = ensureDraft();
        d.overlays = d.overlays.map(function (o) {
            return o.id === id ? clampOverlay(Object.assign({}, o, { enabled: !!input.checked }), d.size) : o;
        });
        persistSoon();
        rerenderCard();
    });

    function toggleQr(forceOn) {
        var d = ensureDraft();
        d.qrEnabled = forceOn === undefined ? !d.qrEnabled : !!forceOn;
        if (d.qrEnabled) {
            if (!d.overlays.some(function (o) { return o.type === 'qr'; })) {
                d.overlays.push(clampOverlay({ id: 'qr-1', type: 'qr', xMm: d.size.wMm - 30, yMm: 4, wMm: 26, hMm: 26, payload: '' }, d.size));
            }
            d.overlays.forEach(function (o) { if (o.type === 'qr') o.enabled = true; });
        }
        state.panels.overlays = true;
        persistSoon();
        ui().render();
    }

    /** Подсказка панели «Размеры»: вписываем ли карточку в лист A4 landscape. */
    function fitNoteHtml() {
        var draft = ensureDraft();
        var size = clampSize(draft.size);
        var L = clampLayout(draft.layout, size);
        var fit = fitsOnPage(L, size);
        var p = placement(L, size, 0);
        if (fit.ok) {
            return '<p class="tnm-muted tnpc-fit-note">' + esc(bi('Лист A4 альбомный: ', 'A4 sheet, landscape: ') +
                p.per + ' ' + bi('карточка(и) на листе, масштаб печати ', 'card(s) per sheet, print scale ') +
                Math.round(L.scale * 100) + '%.') + '</p>';
        }
        return '<p class="tnpc-alert tnpc-fit-note">⚠ ' + esc(bi('Раскладка ', 'Layout ') + L.xMm + '×' + L.yMm + ' ' +
            bi('мм при масштабе ', 'mm at ') + Math.round(L.scale * 100) + '% ' +
            bi('не влезает в лист A4 (297×210 мм) — при печати карточка вписывается в лист: ',
                'overflows the A4 sheet (297×210 mm) — printing fits the card onto the sheet: ') +
            p.wMm + '×' + p.hMm + ' ' + bi('мм вместо ', 'mm instead of ') +
            round1(size.wMm * L.scale) + '×' + round1(size.hMm * L.scale) + ' ' +
            bi('мм. «Вписать в лист» подберёт максимальный размер.', 'mm. “Fit on page” picks the largest size.')) + '</p>';
    }

    function refreshFitWarning() {
        var d = doc();
        if (!d || !state.panels.sizes) return;
        var panel = d.querySelector('[data-panel="sizes"]');
        if (!panel) return;
        // Заменяем именно подсказку о вписывании: у неё свой класс, поэтому
        // повторная правка размеров не накапливает копии абзаца.
        var existing = panel.querySelector('.tnpc-fit-note');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        var head = panel.querySelector('.tnpc-panel-head');
        if (head && head.parentNode) head.parentNode.insertAdjacentHTML('afterend', fitNoteHtml());
    }

    function refreshIndexWarn() {
        var d = doc();
        if (!d || !state.panels.fields) return;
        var panel = d.querySelector('[data-panel="fields"]');
        if (!panel) return;
        var existing = panel.querySelector('.tnpc-alert');
        var warn = indexWarnHtml();
        if (!warn) {
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
            return;
        }
        if (existing) return;
        panel.insertAdjacentHTML('beforeend', warn);
    }

    ui().modal('tnpc-add', function () {
        return '<div class="tnm-modal-overlay"><div class="tnm-modal"><div class="tnm-modal-card">' +
            '<h3>' + esc(bi('Добавить карточку', 'Add card')) + '</h3>' +
            '<label class="tnm-field">' + esc(bi('Имя', 'Name')) + '<input data-tnpc-new="name"></label>' +
            '<label class="tnm-field">HCP <input data-tnpc-new="hcp"></label>' +
            '<label class="tnm-field">' + esc(bi('ТИ', 'Tee')) + '<input data-tnpc-new="tee"></label>' +
            '<label class="tnm-field">' + esc(bi('Лунка', 'Hole')) +
            '<input type="number" min="1" max="18" data-tnpc-new="hole" value="1"></label>' +
            '<label class="tnm-field">' + esc(bi('Время', 'Time')) + '<input data-tnpc-new="time"></label>' +
            '<div class="tnm-view-head-actions">' +
            ui().btn('tnpc-add-confirm', esc(bi('Добавить', 'Add')), { variant: 'primary' }) +
            ui().btn('close-modal', esc(bi('Отмена', 'Cancel')), { variant: 'ghost' }) +
            '</div></div></div></div>';
    });

    return {
        html: html,
        mount: mount,
        buildCards: buildCards,
        applyCardEdits: applyCardEdits,
        clampOverlay: clampOverlay,
        clampStyle: clampStyle,
        clampSize: clampSize,
        clampLayout: clampLayout,
        normalizeRowOrder: normalizeRowOrder,
        visibleRowOrder: visibleRowOrder,
        reorderRowOrder: reorderRowOrder,
        setLogoSource: setLogoSource,
        foreValues: foreValues,
        teeDisplayName: teeDisplayName,
        teeCode: teeCode,
        defaultDraft: defaultDraft,
        defaultStyle: defaultStyle,
        defaultSize: defaultSize,
        defaultLayout: defaultLayout,
        defaultOverlays: defaultOverlays,
        cardCssText: cardCssText,
        cardStyleAttr: cardStyleAttr,
        slotPos: slotPos,
        cardsPerSheet: cardsPerSheet,
        pageFit: pageFit,
        placement: placement,
        fitsOnPage: fitsOnPage,
        foreMarksHtml: foreMarksHtml,
        playerCount: playerCount,
        pageChunks: pageChunks,
        documentFor: documentFor,
        cardFaceHtml: cardFaceHtml,
        refreshCards: refreshCards,
        visibleCards: visibleCards,
        cardsSignature: cardsSignature,
        fitStage: fitStage,
        STYLE_FIELDS: STYLE_FIELDS,
        SHOW_FIELDS: SHOW_FIELDS,
        TABLE_ROW_KEYS: TABLE_ROW_KEYS,
        ROW_LABELS: ROW_LABELS,
        ROW_FIELD_LIMITS: ROW_FIELD_LIMITS,
        CARD_FONTS: CARD_FONTS,
        defaultLengths: defaultLengths,
        defaultDesign: defaultDesign,
        clampDesign: clampDesign,
        clampRows: clampRows,
        clampRowCfg: clampRowCfg,
        rowCfg: rowCfg,
        blockStyleAttr: blockStyleAttr,
        styleVars: styleVars,
        validColor: validColor,
        safeFont: safeFont,
        lenSum: lenSum,
        CARD_W: CARD_W,
        CARD_H: CARD_H,
        PAGE_W: PAGE_W,
        PAGE_H: PAGE_H,
        isActivePlayer: isActivePlayer,
        mergeManual: mergeManual,
        // блоки целиком (таблица/шапка) и свои блоки
        BOX_KEYS: BOX_KEYS,
        BLOCK_PLACEHOLDERS: BLOCK_PLACEHOLDERS,
        BLOCK_PRESETS: BLOCK_PRESETS,
        defaultBox: defaultBox,
        clampBox: clampBox,
        clampBoxes: clampBoxes,
        boxStyleAttr: boxStyleAttr,
        blockText: blockText,
        blockValues: blockValues,
        addBlockOverlay: addBlockOverlay,
        fieldHcpText: fieldHcpText,
        fieldHcpFor: fieldHcpFor,
        state: state
    };
})(typeof window !== 'undefined' ? window : this);

if (typeof module !== 'undefined' && module.exports) module.exports = TnMgrPrintCards;
