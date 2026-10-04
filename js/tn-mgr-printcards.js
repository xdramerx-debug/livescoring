// ============================================================
// TN-MGR-PRINTCARDS — вкладка «Счетные карточки» турнира
// ------------------------------------------------------------
// Печатный конструктор карточек (по умолчанию 147×200 мм, лист A4
// landscape, 1 или 2 карточки на лист). Дизайн ОДИН на турнир:
// размер карточки и её место на листе, все кегли и отступы, строки
// таблицы, состав информации, лого / QR / текстовые оверлеи
// (перетаскиваются и растягиваются мышью), подписи снизу.
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

    var CARD_W = 147;      // мм — размер карточки по умолчанию
    var CARD_H = 200;
    var PAGE_W = 297;      // мм — A4 landscape
    var PAGE_H = 210;

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
        sumWMm: { min: 3, max: 30, def: 9, step: 0.5, ru: 'Колонки OUT/IN/TOT', en: 'Totals columns' },
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
        hcp: { def: true, ru: 'HCP', en: 'Handicap' },
        tee: { def: true, ru: 'ТИ (ти-бокс)', en: 'Tee' },
        hole: { def: true, ru: 'Стартовая лунка', en: 'Start hole' },
        time: { def: true, ru: 'Время старта', en: 'Start time' },
        group: { def: true, ru: 'Флайт / группа', en: 'Flight' },
        par: { def: true, ru: 'Строка «Пар»', en: 'Par row' },
        index: { def: true, ru: 'Строка «Индекс»', en: 'Index row' },
        strokes: { def: true, ru: 'Строка «Удары»', en: 'Strokes row' },
        totals: { def: true, ru: 'Колонки OUT/IN/TOT', en: 'OUT/IN/TOT columns' }
    };
    var SHOW_KEYS = Object.keys(SHOW_FIELDS);

    /** Поля карточки, которые можно править вручную прямо на эталоне. */
    var CARD_TEXT_FIELDS = ['names', 'hcps', 'tee', 'startHole', 'startTime', 'flight'];

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
        progress: '',
        panels: { sizes: false, fields: false, content: false, overlays: false },
        activeCardId: '',
        query: '',
        preview: 'sheet',        // 'sheet' — лист A4, 'card' — только карточка
        previewPinned: false,    // пользователь выбрал вид вручную
        imageTarget: '',         // оверлей, в который грузим картинку
        scores: null,            // { pid: { hole: strokes } } — live-счёт (опция)
        scoresAt: 0,
        remoteUpdatedAt: -1,
        cardsSig: ''
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
    function defaultSize() { return { wMm: CARD_W, hMm: CARD_H }; }
    function clampSize(size) {
        var src = size || {};
        return {
            wMm: round1(clampNum(src.wMm, 60, PAGE_W, CARD_W)),
            hMm: round1(clampNum(src.hMm, 60, PAGE_H, CARD_H))
        };
    }
    /**
     * Место карточки на листе A4. По умолчанию две карточки в ряд
     * (147+3+147 = 297 мм) — лист используется целиком.
     */
    function defaultLayout() { return { xMm: 0, yMm: 5, scale: 1, gapMm: 3, perSheet: 2 }; }
    function clampLayout(layout, size) {
        var src = layout || {};
        var card = clampSize(size);
        var scale = Math.round(clampNum(src.scale, 0.3, 2, 1) * 100) / 100;
        // Зазор между карточками не может съесть место, которого нет на листе.
        var maxGap = Math.max(0, round1(PAGE_W - card.wMm * scale));
        return {
            xMm: round1(clampNum(src.xMm, -50, PAGE_W, 0)),
            yMm: round1(clampNum(src.yMm, -50, PAGE_H, 5)),
            scale: scale,
            gapMm: round1(clampNum(src.gapMm, 0, maxGap, 3)),
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
    /** Помещается ли раскладка на лист A4 landscape. */
    function fitsOnPage(layout, size) {
        var L = clampLayout(layout, size);
        var card = clampSize(size);
        var last = slotPos(L, card, L.perSheet - 1);
        return {
            ok: last.xMm + card.wMm * L.scale <= PAGE_W + 0.01 && L.yMm + card.hMm * L.scale <= PAGE_H + 0.01,
            right: round1(last.xMm + card.wMm * L.scale),
            bottom: round1(L.yMm + card.hMm * L.scale)
        };
    }
    /** Старые раскладки (карточка за пределами листа) чиним на вписанную. */
    function migrateLayout(layout, size) {
        var L = clampLayout(layout, size);
        if (fitsOnPage(L, size).ok) return L;
        var fixed = defaultLayout();
        fixed.perSheet = L.perSheet;
        fixed.scale = Math.min(L.scale, 1);
        if (!fitsOnPage(fixed, size).ok) fixed = Object.assign(defaultLayout(), { perSheet: 1, scale: 1 });
        return clampLayout(fixed, size);
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
            type: ['logo', 'qr', 'text', 'image'].indexOf(o.type) !== -1 ? o.type : 'logo',
            enabled: !!o.enabled,
            payload: o.payload == null ? '' : String(o.payload),
            text: o.text == null ? '' : String(o.text),
            src: o.src == null ? '' : String(o.src)
        });
    }

    function defaultDraft() {
        return {
            size: defaultSize(),
            layout: defaultLayout(),
            style: defaultStyle(),
            holes: 18,
            pars: defaultPars(),
            indexes: defaultIndexes(),
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
        base.layout = migrateLayout(stored.layout, base.size);
        base.style = clampStyle(stored.style);
        if (stored.holes === 9) base.holes = 9;
        if (Array.isArray(stored.pars) && stored.pars.length) base.pars = stored.pars.slice(0, 18);
        if (Array.isArray(stored.indexes) && stored.indexes.length) base.indexes = stored.indexes.slice(0, 18);
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
        if (state.dirty || state.drag) return;
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
            return [c.id, (c.names || []).join('+'), (c.hcps || []).join('/'), c.tee, c.startHole, c.startTime,
                c.flight, c.manual ? 1 : 0, c.order].join('|');
        }).join(';');
    }

    function currentRid() {
        var rid = ui().state.route.rid || '';
        var rounds = ui().roundsOf();
        if (!rid && rounds[0]) rid = rounds[0].id;
        return rid;
    }

    /** Пересобрать карточки из текущих данных турнира (дизайн не трогает). */
    function refreshCards() {
        var draft = ensureDraft();
        var players = ui().playersOf();
        var rid = currentRid();
        var sheet = ui().sheetOf(rid) || {};
        var entries = data().sheetOrder(sheet);
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

    function strokesOf(card) {
        var draft = ensureDraft();
        var n = holeCount();
        var out = [];
        var i;
        if (!draft.fillScores || !state.scores) {
            for (i = 0; i < n; i++) out.push('');
            return out;
        }
        var pid = (card.playerIds || [])[0];
        var map = (pid && state.scores[pid]) || {};
        for (i = 0; i < n; i++) out.push(map[i + 1] == null ? '' : map[i + 1]);
        return out;
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
    function styleVars(style) {
        var s = clampStyle(style);
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
            '--tnpc-line:' + s.lineMm + 'mm;';
    }

    function cardStyleAttr(draft, slot, local) {
        var d = draft || ensureDraft();
        var size = clampSize(d.size);
        var L = clampLayout(d.layout, size);
        var p = local ? { xMm: 0, yMm: 0 } : slotPos(L, size, slot || 0);
        return 'left:' + p.xMm + 'mm;top:' + p.yMm + 'mm;width:' + size.wMm + 'mm;height:' + size.hMm + 'mm;' +
            'transform:scale(' + L.scale + ');' + styleVars(d.style);
    }

    /**
     * CSS внутренностей карточки — ОДИН текст для предпросмотра и для
     * печати, поэтому экран всегда показывает то, что ляжет на бумагу.
     */
    function cardCssText() {
        return '.tnpc-card{position:absolute;background:#fff;color:#111;box-sizing:border-box;' +
            'font-family:Arial,Helvetica,sans-serif;overflow:hidden;transform-origin:top left;' +
            'border:calc(var(--tnpc-line,0.25mm) * 1.6) solid #111}' +
            '.tnpc-card-inner{position:relative;width:100%;height:100%;padding:var(--tnpc-pad,5mm);' +
            'box-sizing:border-box;display:flex;flex-direction:column}' +
            '.tnpc-head{text-align:center;border-bottom:var(--tnpc-line,0.25mm) solid #111;' +
            'padding-bottom:var(--tnpc-head-gap,2mm);margin-bottom:var(--tnpc-head-gap,2mm);flex:0 0 auto}' +
            '.tnpc-title{font-weight:800;font-size:var(--tnpc-title,4.2mm);line-height:1.15;letter-spacing:.01em}' +
            '.tnpc-subtitle{font-size:var(--tnpc-meta,3.1mm);margin-top:.6mm;color:#333}' +
            '.tnpc-name{font-weight:800;font-size:var(--tnpc-name,4.6mm);margin-top:1.4mm;line-height:1.15}' +
            '.tnpc-meta{font-size:var(--tnpc-meta,3.1mm);margin-top:.8mm;line-height:1.25}' +
            '.tnpc-body{flex:1 1 auto;min-height:0}' +
            '.tnpc-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:var(--tnpc-table,2.9mm)}' +
            '.tnpc-table td{border:var(--tnpc-line,0.25mm) solid #111;text-align:center;' +
            'padding:.5mm .2mm;height:var(--tnpc-row-h,6.4mm);overflow:hidden}' +
            '.tnpc-table .lab{text-align:left;font-weight:700;width:var(--tnpc-lab-w,15mm);padding-left:1mm}' +
            '.tnpc-table .sum{font-weight:800;background:#efefef;width:var(--tnpc-sum-w,9mm)}' +
            '.tnpc-empty{background:#fff}' +
            '.tnpc-foot{display:flex;gap:4mm;margin-top:var(--tnpc-foot-gap,4mm);flex:0 0 auto}' +
            '.tnpc-sign{flex:1;border-top:var(--tnpc-line,0.25mm) solid #111;padding-top:1.2mm;' +
            'font-size:var(--tnpc-foot,2.8mm);text-align:center;min-height:calc(var(--tnpc-foot,2.8mm) * 2)}' +
            '.tnpc-overlay{position:absolute;box-sizing:border-box}' +
            '.tnpc-overlay img{width:100%;height:100%;object-fit:contain;display:block}' +
            '.tnpc-ov-text{width:100%;height:100%;overflow:hidden;white-space:pre-wrap;text-align:left;' +
            'font-size:var(--tnpc-ov-font,3mm);line-height:1.2}';
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
        return bi('Текст', 'Text');
    }

    function qrPayloadFor(card, ov) {
        var ids = (card && card.playerIds) || [];
        var idx = 0;
        var n = 0;
        ensureDraft().overlays.forEach(function (item) {
            if (item.type === 'qr' && item.id === ov.id) idx = n;
            if (item.type === 'qr') n++;
        });
        var pid = ids[idx] || ids[0];
        if (!pid) return ov.payload || '';
        var rid = currentRid() || tid();
        var entry = {};
        try {
            var sheet = ui().sheetOf(rid) || {};
            data().sheetOrder(sheet).forEach(function (e) { if (e.playerId === pid) entry = e; });
        } catch (e) { /* silent */ }
        var base = ui().baseUrl ? ui().baseUrl() : (root.location ? (root.location.origin + '/') : '');
        var roundId = entry.groupRoundId || rid;
        return core().scoreUrl(base, roundId, pid, ids.length);
    }

    function tableHtml(card, printMode) {
        var d = ensureDraft();
        var n = holeCount();
        var pars = d.pars;
        var idx = d.indexes;
        var strokes = strokesOf(card);
        var holes = [];
        for (var i = 0; i < n; i++) holes.push(i + 1);
        var outN = Math.min(9, n);
        var inN = n > 9 ? n - 9 : 0;
        var showTotals = d.show.totals !== false;
        var ed = printMode ? '' : ' contenteditable="true"';

        function cells(kind, arr, editable) {
            var html = '';
            holes.forEach(function (h, k) {
                var v = arr[k] == null ? '' : arr[k];
                if (kind === 'strokes') html += '<td class="tnpc-empty">' + esc(v) + '</td>';
                else if (!printMode && editable) {
                    html += '<td><span' + ed + ' data-tnpc-grid="' + kind + '" data-h="' + k + '">' + esc(v) + '</span></td>';
                } else html += '<td>' + esc(v) + '</td>';
            });
            return html;
        }
        function sums(kind) {
            if (!showTotals) return '';
            if (!inN) return '<td class="sum">' + sumFor(kind, 0, n) + '</td>';
            return '<td class="sum">' + sumFor(kind, 0, outN) + '</td>' +
                '<td class="sum">' + sumFor(kind, outN, n) + '</td>' +
                '<td class="sum">' + sumFor(kind, 0, n) + '</td>';
        }
        function sumFor(kind, from, to) {
            if (kind === 'par') return parSum(from, to);
            if (kind === 'st') return sumValues(strokes.slice(from, to));
            return '';
        }
        var labels = showTotals ? (inN ? ['OUT', 'IN', 'TOT'] : ['TOT']) : [];
        var rows = '<tr><td class="lab">№</td>' + cells('no', holes, false) +
            labels.map(function (s) { return '<td class="sum">' + s + '</td>'; }).join('') + '</tr>';
        if (d.show.par !== false) {
            rows += '<tr><td class="lab">' + esc(bi('Пар', 'Par')) + '</td>' + cells('par', pars, true) + sums('par') + '</tr>';
        }
        if (d.show.index !== false) {
            rows += '<tr><td class="lab">' + esc(bi('Индекс', 'Index')) + '</td>' + cells('idx', idx, true) + sums('idx') + '</tr>';
        }
        if (d.show.strokes !== false) {
            rows += '<tr><td class="lab">' + esc(bi('Удары', 'Strokes')) + '</td>' + cells('strokes', strokes, false) + sums('st') + '</tr>';
        }
        return '<div class="tnpc-body"><table class="tnpc-table"><tbody>' + rows + '</tbody></table></div>';
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
        if (sh.hcp !== false) {
            bits.push('HCP <span' + ed + ' data-tnpc-field="hcps"' + cid + '>' + esc(hcpText(card)) + '</span>');
        }
        if (sh.tee !== false) {
            bits.push(esc(bi('ТИ', 'Tee')) + ' <span' + ed + ' data-tnpc-field="tee"' + cid + '>' + esc(card.tee || '—') + '</span>');
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
        return '<div class="tnpc-card-inner">' +
            '<div class="tnpc-head">' +
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
        return '<article class="tnpc-card" data-cid="' + esc(card.id) + '" data-slot="' + (slot || 0) + '" style="' +
            cardStyleAttr(d, slot || 0, local) + '">' + cardFaceHtml(card, printMode) + '</article>';
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
        var ghost = L.perSheet === 2
            ? '<div class="tnpc-ghost" style="left:' + slotPos(L, size, 1).xMm + 'mm;top:' + L.yMm + 'mm;' +
              'width:' + round1(size.wMm * L.scale) + 'mm;height:' + round1(size.hMm * L.scale) + 'mm;"></div>'
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
        bits.push('HCP ' + hcpText(card));
        if (card.tee) bits.push(bi('ТИ', 'Tee') + ' ' + card.tee);
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
            ui().btn('tnpc-panel-overlays', esc(bi('Лого и QR', 'Logo & QR')),
                { icon: 'fas fa-qrcode', variant: state.panels.overlays ? 'primary' : 'ghost' }) +
            ui().btn('tnpc-panel-content', esc(bi('Состав информации', 'Card content')),
                { icon: 'fas fa-list-check', variant: state.panels.content ? 'primary' : 'ghost' }) +
            ui().btn('tnpc-panel-fields', esc(bi('Лунки, пар, индекс', 'Holes, par, index')),
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
        var fit = fitsOnPage(L, size);
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
            (fit.ok ? '' : '<p class="tnpc-alert">⚠ ' + esc(bi('Карточка выходит за лист A4 (', 'Card overflows the A4 sheet (')) +
                fit.right + '×' + fit.bottom + ' ' + esc(bi('мм при 297×210). Нажмите «Вписать в лист».', 'mm vs 297×210). Click “Fit on page”.')) + '</p>') +
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
            '</div>';
    }

    function fieldsPanelHtml() {
        if (!state.panels.fields) return '';
        var d = ensureDraft();
        var pars = '';
        var idx = '';
        for (var i = 0; i < 18; i++) {
            pars += '<input type="number" min="3" max="6" data-tnm-live-edit="tnpc-par" data-h="' + i +
                '" value="' + esc(d.pars[i] || 4) + '" title="Пар ' + (i + 1) + '">';
            idx += '<input type="number" min="1" max="18" data-tnm-live-edit="tnpc-idx" data-h="' + i +
                '" value="' + esc(d.indexes[i] || (i + 1)) + '" title="SI ' + (i + 1) + '">';
        }
        return '<div class="tnm-card tnpc-panel" data-panel="fields">' +
            '<div class="tnpc-panel-head"><b><i class="fas fa-table"></i> ' +
            esc(bi('Лунки, пар и индекс — общие для всех карточек', 'Holes, par and index — shared by all cards')) + '</b>' +
            '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-holes9"' + (d.holes === 9 ? ' checked' : '') + '> ' +
            esc(bi('Только 9 лунок', '9 holes only')) + '</label>' +
            '</div>' +
            '<p class="tnm-muted">' + esc(bi('Пар 3–6', 'Par 3–6')) + '</p><div class="tnpc-fields">' + pars + '</div>' +
            '<p class="tnm-muted">' + esc(bi('Индекс 1–18', 'Index 1–18')) + '</p><div class="tnpc-fields">' + idx + '</div>' +
            indexWarnHtml() +
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
        var rows = (d.overlays || []).map(function (ov) {
            var o = clampOverlay(ov, d.size);
            var payload = '';
            if (o.type === 'qr') {
                payload = '<label class="tnpc-num wide"><span>' + esc(bi('Ссылка QR (пусто — QR маркера игрока)', 'QR link (empty — player marker QR)')) + '</span>' +
                    '<input type="text" value="' + esc(o.payload) + '" data-tnm-live-edit="tnpc-overlay" data-id="' + esc(o.id) +
                    '" data-field="payload"></label>';
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
                numField('tnpc-overlay', 'xMm', 'X, ' + bi('мм', 'mm'), o.xMm, 0, PAGE_W, 0.5, ' data-id="' + esc(o.id) + '"') +
                numField('tnpc-overlay', 'yMm', 'Y, ' + bi('мм', 'mm'), o.yMm, 0, PAGE_H, 0.5, ' data-id="' + esc(o.id) + '"') +
                numField('tnpc-overlay', 'wMm', bi('Ширина, мм', 'Width, mm'), o.wMm, 5, PAGE_W, 0.5, ' data-id="' + esc(o.id) + '"') +
                numField('tnpc-overlay', 'hMm', bi('Высота, мм', 'Height, mm'), o.hMm, 5, PAGE_H, 0.5, ' data-id="' + esc(o.id) + '"') +
                '</div>' + payload + '</div>';
        }).join('');
        return '<div class="tnm-card tnpc-panel" data-panel="overlays">' +
            '<div class="tnpc-panel-head"><b><i class="fas fa-qrcode"></i> ' +
            esc(bi('Лого, QR и текст на карточке', 'Logo, QR and text on the card')) + '</b>' +
            '<div class="tnpc-panel-actions">' +
            ui().btn('tnpc-qr-add', esc(bi('+ QR', 'Add QR')), { icon: 'fas fa-qrcode', variant: 'ghost', small: true }) +
            ui().btn('tnpc-logo-add', esc(bi('+ Лого', 'Add logo')), { icon: 'fas fa-image', variant: 'ghost', small: true }) +
            ui().btn('tnpc-text-add', esc(bi('+ Текст', 'Add text')), { icon: 'fas fa-font', variant: 'ghost', small: true }) +
            ui().btn('tnpc-image-add', esc(bi('+ Картинка', 'Add image')), { icon: 'fas fa-photo-film', variant: 'ghost', small: true }) +
            ui().btn('tnpc-reset-ov', esc(bi('Сбросить позиции', 'Reset overlays')), { icon: 'fas fa-up-down-left-right', variant: 'ghost', small: true }) +
            '</div></div>' +
            '<p class="tnm-muted">' + esc(bi('Перетаскивайте блоки мышью прямо на карточке, тяните за золотой уголок — изменить размер. ' +
                'Двойной клик по QR — своя ссылка. Картинку можно просто перетащить файлом на предпросмотр.',
                'Drag blocks on the card, pull the gold corner to resize. Double-click a QR for a custom link. ' +
                'You can also drop an image file onto the preview.')) + '</p>' +
            '<label class="tnpc-check"><input type="checkbox" data-tnm-edit="tnpc-qr-global"' + (d.qrEnabled ? ' checked' : '') + '> ' +
            esc(bi('QR-коды маркеров включены (ссылка на ввод счёта игрока)', 'Marker QR codes on (link to the player score entry)')) + '</label>' +
            (rows || '<p class="tnm-muted">' + esc(bi('Оверлеев нет — добавьте лого или QR.', 'No overlays — add a logo or QR.')) + '</p>') +
            '</div>';
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
            (sheet ? '' : '<p class="tnpc-alert">⚠ ' + esc(bi('Нет стартового листа: время старта, лунка и QR берутся из участников. ' +
                'Создайте лист на вкладке «Стартовый лист», чтобы карточки стали полностью актуальными.',
                'No tee sheet yet: start time, hole and QR come from the roster. Create the sheet to make the cards fully up to date.')) + '</p>');
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
            '<span><i class="fas fa-hand-pointer"></i> ' + esc(bi('лого и QR перетаскиваются, уголок — размер', 'drag logo/QR, corner resizes')) + '</span>' +
            '<span><i class="fas fa-file-arrow-down"></i> ' + esc(bi('картинку можно перетащить файлом на лист', 'drop an image file onto the sheet')) + '</span>' +
            '<span><i class="fas fa-ruler"></i> ' + esc(bi('размеры — в панели «Размеры и место на листе»', 'sizes live in the “Sizes” panel')) + '</span>' +
            '</div>' +
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
        return '<style>@page{size:A4 landscape;margin:0}html,body{margin:0;padding:0;background:#fff}' +
            '.page{width:' + PAGE_W + 'mm;height:' + PAGE_H + 'mm;position:relative;page-break-after:always;overflow:hidden}' +
            cardCssText() +
            '.tnpc-handle,.tnpc-x,.tnpc-tag,.tnpc-warn,.tnpc-ph,.tnpc-noprint,.tnpc-ghost{display:none!important}' +
            '</style>';
    }

    /** Раскладка карточек по листам: 1 или 2 на лист A4 landscape. */
    function pageChunks(cards) {
        var per = clampLayout(ensureDraft().layout, ensureDraft().size).perSheet;
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

    function bindDrag(host) {
        host.addEventListener('pointerdown', function (ev) {
            var handle = ev.target.closest('[data-tnpc-resize]');
            var ovEl = ev.target.closest('[data-overlay-id]');
            if (!ovEl) return;
            if (ev.target.closest('[data-tnm-act]')) return;
            if (ev.target.closest('[contenteditable="true"]')) return;
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
            state.drag = {
                id: id, resize: !!handle,
                startX: ev.clientX, startY: ev.clientY,
                ox: ov.xMm, oy: ov.yMm, ow: ov.wMm, oh: ov.hMm,
                mmX: mmX, mmY: mmY
            };
            host.querySelectorAll('[data-overlay-id]').forEach(function (el) { el.classList.remove('selected'); });
            ovEl.classList.add('selected');
            try { ovEl.setPointerCapture(ev.pointerId); } catch (e) { /* silent */ }
            ev.preventDefault();
        });
        host.addEventListener('pointermove', function (ev) {
            if (!state.drag) return;
            var dr = state.drag;
            var dx = (ev.clientX - dr.startX) / dr.mmX;
            var dy = (ev.clientY - dr.startY) / dr.mmY;
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
            if (!state.drag) return;
            state.drag = null;
            persistSoon();
        });
        host.addEventListener('dblclick', function (ev) {
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
            if (field) applyInline(el, field, false);
            else if (grid) applyGrid(el, grid, false);
            else if (ovText) applyOverlayText(ovText, el.textContent);
        });
        host.addEventListener('blur', function (ev) {
            var el = ev.target;
            if (!el || !el.getAttribute) return;
            var field = el.getAttribute('data-tnpc-field');
            var grid = el.getAttribute('data-tnpc-grid');
            var ovText = el.getAttribute('data-tnpc-overlay-text');
            if (field) applyInline(el, field, true);
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

    function applyInline(el, field, rerender) {
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
        if (rerender && field === 'names') syncRowSummary(card);
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
        } else return;
        persistSoon();
        syncPanelInputs(kind, h, v);
        if (rerender) rerenderCard();
    }

    function syncPanelInputs(kind, h, v) {
        var d = doc();
        if (!d) return;
        var sel = kind === 'par' ? '[data-tnm-live-edit="tnpc-par"][data-h="' + h + '"]'
            : '[data-tnm-live-edit="tnpc-idx"][data-h="' + h + '"]';
        var input = d.querySelector(sel);
        if (input && d.activeElement !== input) input.value = v;
        // Суммы OUT/IN/TOT в строке «Пар» пересчитываем на месте.
        if (kind === 'par') {
            var n = holeCount();
            var outN = Math.min(9, n);
            var sums = [parSum(0, outN), n > 9 ? parSum(outN, n) : null, parSum(0, n)];
            var cells = d.querySelectorAll('.tnpc-card .tnpc-table tr:nth-child(' + parRowIndex() + ') td.sum');
            cells.forEach(function (cell, i) { if (sums[i] != null) cell.textContent = sums[i]; });
        }
    }

    /** Строка «Пар» в таблице карточки (первой всегда идёт строка «№»). */
    function parRowIndex() { return 2; }

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
                target.src = src;
                target.enabled = true;
                d.overlays = d.overlays.map(function (o) {
                    return o.id === target.id ? clampOverlay(target, d.size) : o;
                });
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
            var d = ensureDraft();
            d.logoSrc = String(reader.result || '');
            d.overlays = d.overlays.map(function (o) {
                return o.type === 'logo' ? clampOverlay(Object.assign({}, o, { enabled: true }), d.size) : o;
            });
            if (!d.overlays.some(function (o) { return o.type === 'logo'; })) {
                d.overlays.push(clampOverlay({ id: 'logo', type: 'logo', xMm: 4, yMm: 4, wMm: 28, hMm: 16, enabled: true }, d.size));
            }
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
    ui().on('tnpc-preview-mode', function () {
        state.preview = state.preview === 'card' ? 'sheet' : 'card';
        state.previewPinned = true;
        ui().render();
    });
    ui().on('tnpc-panel-sizes', function () { state.panels.sizes = !state.panels.sizes; ui().render(); });
    ui().on('tnpc-panel-fields', function () { state.panels.fields = !state.panels.fields; ui().render(); });
    ui().on('tnpc-panel-content', function () { state.panels.content = !state.panels.content; ui().render(); });
    ui().on('tnpc-panel-overlays', function () { state.panels.overlays = !state.panels.overlays; ui().render(); });
    ui().on('tnpc-fit-page', function () {
        var d = ensureDraft();
        var size = clampSize(d.size);
        var per = clampLayout(d.layout, size).perSheet;
        var total = size.wMm * per + (per === 2 ? clampLayout(d.layout, size).gapMm : 0);
        d.layout = clampLayout({
            xMm: Math.max(0, round1((PAGE_W - total) / 2)),
            yMm: Math.max(0, round1((PAGE_H - size.hMm) / 2)),
            scale: 1,
            gapMm: clampLayout(d.layout, size).gapMm,
            perSheet: per
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
        if (field === 'scalePct') d.layout.scale = clampNum(Number(input.value) / 100, 0.3, 2, 1);
        else if (field === 'perSheet') d.layout.perSheet = Number(input.value) === 1 ? 1 : 2;
        else if (field === 'gapMm') d.layout.gapMm = clampNum(input.value, 0, 60, 3);
        else if (field === 'xMm') d.layout.xMm = clampNum(input.value, -50, PAGE_W, 0);
        else if (field === 'yMm') d.layout.yMm = clampNum(input.value, -50, PAGE_H, 5);
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
        if (field === 'payload' || field === 'text') ov[field] = input.value;
        else ov[field] = clampNum(input.value, 0, PAGE_W, ov[field]);
        var d = ensureDraft();
        var next = clampOverlay(ov, d.size);
        d.overlays = d.overlays.map(function (o) { return o.id === id ? next : o; });
        persistSoon();
        patchOverlayDom(next);
        if (field === 'payload' || field === 'text') rerenderCard();
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

    function refreshFitWarning() {
        var d = doc();
        if (!d || !state.panels.sizes) return;
        var panel = d.querySelector('[data-panel="sizes"]');
        if (!panel) return;
        var draft = ensureDraft();
        var fit = fitsOnPage(clampLayout(draft.layout, draft.size), clampSize(draft.size));
        var existing = panel.querySelector('.tnpc-alert');
        if (fit.ok) {
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
            return;
        }
        if (existing) return;
        var p = d.createElement('p');
        p.className = 'tnpc-alert';
        p.textContent = '⚠ ' + bi('Карточка выходит за лист A4 (', 'Card overflows the A4 sheet (') +
            fit.right + '×' + fit.bottom + ' ' + bi('мм при 297×210). Нажмите «Вписать в лист».', 'mm vs 297×210). Click “Fit on page”.');
        var head = panel.querySelector('.tnpc-panel-head');
        if (head && head.parentNode) head.parentNode.insertBefore(p, head.nextSibling);
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
        defaultDraft: defaultDraft,
        defaultStyle: defaultStyle,
        defaultSize: defaultSize,
        defaultLayout: defaultLayout,
        defaultOverlays: defaultOverlays,
        styleVars: styleVars,
        cardCssText: cardCssText,
        cardStyleAttr: cardStyleAttr,
        slotPos: slotPos,
        fitsOnPage: fitsOnPage,
        pageChunks: pageChunks,
        documentFor: documentFor,
        cardFaceHtml: cardFaceHtml,
        refreshCards: refreshCards,
        visibleCards: visibleCards,
        cardsSignature: cardsSignature,
        fitStage: fitStage,
        STYLE_FIELDS: STYLE_FIELDS,
        SHOW_FIELDS: SHOW_FIELDS,
        CARD_W: CARD_W,
        CARD_H: CARD_H,
        PAGE_W: PAGE_W,
        PAGE_H: PAGE_H,
        isActivePlayer: isActivePlayer,
        mergeManual: mergeManual,
        state: state
    };
})(typeof window !== 'undefined' ? window : this);

if (typeof module !== 'undefined' && module.exports) module.exports = TnMgrPrintCards;
