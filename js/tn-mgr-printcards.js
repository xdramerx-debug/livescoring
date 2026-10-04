// ============================================================
// TN-MGR-PRINTCARDS — вкладка «Счетные карточки» турнира
// Печатный конструктор 147×200 мм. Overlay (лого/QR) общие
// на весь турнир. Данные: tournaments/<tid>/printScorecards
// ============================================================
var TnMgrPrintCards = (function (root) {
    'use strict';

    var CARD_W = 147;
    var CARD_H = 200;
    var PAGE_W = 297;
    var PAGE_H = 210;

    function ui() { return root.TnMgrUI; }
    function core() { return root.TnMgrCore; }
    function data() { return root.TnMgrData; }
    function io() { return root.TnMgrIO; }
    function esc(v) { return core().esc(v); }
    function bi(ru, en) { return ui().bi(ru, en); }

    var state = {
        draft: null,
        saveTimer: null,
        saveStatus: '',
        dirty: false,
        selected: {},
        drag: null,
        visible: { from: 0, to: 24 },
        progress: '',
        fieldsOpen: false
    };

    function tid() { return ui().state.route.tid || ''; }

    function canWrite() {
        if (root.TnMgr && typeof root.TnMgr.hasAccess === 'function' && !root.TnMgr.hasAccess()) return false;
        var t = ui().tournament();
        return !!(tid() && t);
    }

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

    function defaultOverlays() {
        return [
            { id: 'logo', type: 'logo', xMm: 4, yMm: 4, wMm: 28, hMm: 16, enabled: false, src: '' },
            { id: 'qr-1', type: 'qr', xMm: 115, yMm: 4, wMm: 26, hMm: 26, enabled: false, payload: '' }
        ];
    }

    function defaultDraft() {
        return {
            layout: { xMm: 140, yMm: 40, scale: 1 },
            holes: 18,
            pars: defaultPars(),
            indexes: defaultIndexes(),
            footer: { player: 'Игрок', marker: 'Маркер', judge: 'Судья' },
            overlays: defaultOverlays(),
            cards: [],
            filters: { selectedOnly: false, activeOnly: false },
            logoSrc: '',
            qrEnabled: false,
            orderLocked: false,
            updatedAt: 0
        };
    }

    function clampNum(v, min, max, fallback) {
        var n = parseFloat(v);
        if (!isFinite(n)) n = fallback;
        if (n < min) n = min;
        if (n > max) n = max;
        return n;
    }

    function clampOverlay(ov) {
        var w = clampNum(ov.wMm, 8, CARD_W, 24);
        var h = clampNum(ov.hMm, 8, CARD_H, 24);
        var x = clampNum(ov.xMm, 0, CARD_W - w, 0);
        var y = clampNum(ov.yMm, 0, CARD_H - h, 0);
        return Object.assign({}, ov, { xMm: x, yMm: y, wMm: w, hMm: h });
    }

    function loadDraft() {
        var t = ui().tournament() || {};
        var stored = t.printScorecards;
        var base = defaultDraft();
        if (!stored || typeof stored !== 'object') return base;
        var layout = stored.layout || {};
        base.layout.xMm = clampNum(layout.xMm, -100, 300, 140);
        base.layout.yMm = clampNum(layout.yMm, -100, 200, 40);
        base.layout.scale = clampNum(layout.scale, 0.5, 2, 1);
        if (stored.holes === 9) base.holes = 9;
        if (Array.isArray(stored.pars) && stored.pars.length) base.pars = stored.pars.slice(0, 18);
        if (Array.isArray(stored.indexes) && stored.indexes.length) base.indexes = stored.indexes.slice(0, 18);
        if (stored.footer) base.footer = Object.assign(base.footer, stored.footer);
        if (Array.isArray(stored.overlays)) base.overlays = stored.overlays.map(clampOverlay);
        if (Array.isArray(stored.cards)) base.cards = stored.cards;
        if (stored.filters) base.filters = Object.assign(base.filters, stored.filters);
        base.logoSrc = stored.logoSrc || '';
        base.qrEnabled = !!stored.qrEnabled;
        base.orderLocked = !!stored.orderLocked;
        return base;
    }

    function ensureDraft() {
        if (!state.draft || state.draft._tid !== tid()) {
            state.draft = loadDraft();
            state.draft._tid = tid();
            state.dirty = false;
        }
        return state.draft;
    }

    function persistSoon() {
        if (!canWrite()) return;
        state.saveStatus = 'saving';
        updateSaveLabel();
        if (state.saveTimer) clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(persistNow, 400);
    }

    function persistNow() {
        if (!canWrite()) return Promise.resolve();
        var draft = ensureDraft();
        var payload = {
            layout: draft.layout,
            holes: draft.holes,
            pars: draft.pars,
            indexes: draft.indexes,
            footer: draft.footer,
            overlays: draft.overlays,
            cards: draft.cards,
            filters: draft.filters,
            logoSrc: draft.logoSrc || null,
            qrEnabled: !!draft.qrEnabled,
            orderLocked: !!draft.orderLocked,
            updatedAt: Date.now()
        };
        state.saveStatus = 'saving';
        updateSaveLabel();
        return data().write('tournaments/' + tid() + '/printScorecards', payload).then(function () {
            state.dirty = false;
            state.saveStatus = 'saved';
            updateSaveLabel();
        }).catch(function (err) {
            state.saveStatus = 'error';
            updateSaveLabel();
            ui().toastMsg(bi('Не удалось сохранить карточки', 'Could not save scorecards') + ': ' + (err && err.message ? err.message : err));
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
            var hole = 1;
            var time = '';
            var flight = '';
            unique.forEach(function (id) {
                var p = byId[id];
                var e = entriesByPid[id] || {};
                names.push(core().playerFio(p));
                var hcp = p.hi != null ? p.hi : (p.handicap != null ? p.handicap : (e.hi != null ? e.hi : ''));
                hcps.push(hcp === '' || hcp == null ? '—' : hcp);
                tees.push(e.tee || p.tee || '');
                if (e.startHole) hole = e.startHole;
                if (e.startTime) time = e.startTime;
                if (e.flight) flight = e.flight;
            });
            var expectedPair = unique.length > 1 || extra.pairLike;
            return Object.assign({
                id: extra.id || ('auto-' + unique.join('-')),
                playerIds: unique,
                names: names,
                hcps: hcps,
                tee: tees.filter(Boolean)[0] || tees[0] || '',
                startHole: hole || 1,
                startTime: time || '',
                flight: flight || '',
                manual: false,
                missingPair: !!(expectedPair && unique.length === 1)
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

    function rebuild(keepOrder) {
        var draft = ensureDraft();
        var players = ui().playersOf();
        var rid = ui().state.route.rid || '';
        var rounds = ui().roundsOf();
        if (!rid && rounds[0]) rid = rounds[0].id;
        var sheet = ui().sheetOf(rid) || {};
        var entries = data().sheetOrder(sheet);
        var auto = buildCards(players, entries, { activeOnly: false });
        auto = mergeManual(auto, draft.cards);
        if (keepOrder || draft.orderLocked) auto = applyStoredOrder(auto, draft.cards);
        draft.cards = auto;
        persistSoon();
    }

    function visibleCards() {
        var draft = ensureDraft();
        var list = (draft.cards || []).slice();
        if (!list.length) {
            rebuild(false);
            list = draft.cards || [];
        }
        if (draft.filters.activeOnly) {
            var players = {};
            ui().playersOf().forEach(function (p) { players[p.id] = p; });
            list = list.filter(function (c) {
                return (c.playerIds || []).some(function (id) { return isActivePlayer(players[id] || { id: id, active: true }); }) || c.manual;
            });
        }
        if (draft.filters.selectedOnly) {
            list = list.filter(function (c) { return state.selected[c.id]; });
        }
        return list;
    }

    function holeCount() { return ensureDraft().holes === 9 ? 9 : 18; }

    function parSum(from, to) {
        var pars = ensureDraft().pars;
        var s = 0;
        for (var i = from; i < to; i++) s += Number(pars[i]) || 0;
        return s;
    }

    function nameText(card) {
        return (card.names || []).join(' + ');
    }
    function hcpText(card) {
        return (card.hcps || []).join(' / ');
    }

    function overlayHtml(ov, card, printMode) {
        ov = clampOverlay(ov);
        var style = 'left:' + ov.xMm + 'mm;top:' + ov.yMm + 'mm;width:' + ov.wMm + 'mm;height:' + ov.hMm + 'mm;';
        var inner = '';
        if (ov.type === 'logo') {
            var src = ensureDraft().logoSrc || ov.src;
            if (src) inner = '<img alt="logo" src="' + esc(src) + '">';
            else if (!printMode) inner = '<div class="tnpc-ph" data-tnm-act="tnpc-logo-ph">' + esc(bi('Загрузить лого', 'Upload logo')) + '</div>';
        } else {
            if (!ensureDraft().qrEnabled && !printMode) {
                inner = '<div class="tnpc-ph" data-tnm-act="tnpc-qr-enable">' + esc(bi('Включить QR-коды маркеров', 'Enable marker QR codes')) + '</div>';
            } else if (ensureDraft().qrEnabled) {
                var payload = ov.payload || qrPayloadFor(card, ov);
                if (payload) {
                    inner = '<img data-qr alt="qr" src="' + esc(core().qrImageUrl(payload, 280)) + '">';
                }
            }
        }
        var chrome = printMode ? '' : (
            '<span class="tnpc-handle" data-tnpc-resize="' + esc(ov.id) + '"></span>' +
            '<span class="tnpc-x" data-tnm-act="tnpc-overlay-del" data-id="' + esc(ov.id) + '">×</span>'
        );
        return '<div class="tnpc-overlay" data-overlay-id="' + esc(ov.id) + '" data-type="' + esc(ov.type) + '" style="' + style + '">' +
            inner + chrome + '</div>';
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
        var rid = (ui().roundsOf()[0] || {}).id || tid();
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
        var n = holeCount();
        var pars = ensureDraft().pars;
        var idx = ensureDraft().indexes;
        var holes = [];
        for (var i = 0; i < n; i++) holes.push(i + 1);
        var outN = Math.min(9, n);
        var inN = n > 9 ? n - 9 : 0;
        function cells(kind, arr, editable) {
            var html = '';
            holes.forEach(function (h, i) {
                var v = arr[i] == null ? '' : arr[i];
                if (kind === 'strokes') html += '<td class="tnpc-empty"></td>';
                else if (!printMode && editable) {
                    html += '<td><span contenteditable="true" data-tnpc-grid="' + kind + '" data-h="' + i + '">' + esc(v) + '</span></td>';
                } else html += '<td>' + esc(v) + '</td>';
            });
            return html;
        }
        var outP = parSum(0, outN);
        var inP = inN ? parSum(outN, n) : '';
        var totP = parSum(0, n);
        var summaries = inN ? ['OUT', 'IN', 'TOT'] : ['TOT'];
        function sums(kind) {
            if (kind === 'par') {
                if (!inN) return '<td class="sum">' + totP + '</td>';
                return '<td class="sum">' + outP + '</td><td class="sum">' + inP + '</td><td class="sum">' + totP + '</td>';
            }
            if (!inN) return '<td class="sum"></td>';
            return '<td class="sum"></td><td class="sum"></td><td class="sum"></td>';
        }
        return '<table class="tnpc-table"><tbody>' +
            '<tr><td class="lab">№</td>' + cells('no', holes, false) + summaries.map(function (s) { return '<td class="sum">' + s + '</td>'; }).join('') + '</tr>' +
            '<tr><td class="lab">Пар</td>' + cells('par', pars, true) + sums('par') + '</tr>' +
            '<tr><td class="lab">Индекс</td>' + cells('idx', idx, true) + sums('idx') + '</tr>' +
            '<tr><td class="lab">Удары</td>' + cells('strokes', [], false) + sums('st') + '</tr>' +
            '</tbody></table>';
    }

    function cardFaceHtml(card, printMode) {
        var t = ui().tournament() || {};
        var draft = ensureDraft();
        var date = core().dateRu ? core().dateRu(t.startDate || t.date || '') : (t.startDate || '');
        var warn = (!printMode && card.missingPair) ? '<div class="tnpc-warn">⚠ ' + esc(bi('нет пары', 'no partner')) + '</div>' : '';
        var ov = (draft.overlays || []).map(function (o) { return overlayHtml(o, card, printMode); }).join('');
        var ed = printMode ? '' : ' contenteditable="true"';
        return '<div class="tnpc-card-inner">' +
            '<div class="tnpc-head">' +
            '<div class="tnpc-title"' + ed + ' data-tnpc-field="tournamentName">' + esc(t.name || '') + '</div>' +
            '<div class="tnpc-meta"><span' + ed + ' data-tnpc-field="date">' + esc(date) + '</span></div>' +
            '<div class="tnpc-name"><span' + ed + ' data-tnpc-field="names" data-cid="' + esc(card.id) + '">' + esc(nameText(card)) + '</span></div>' +
            '<div class="tnpc-meta">HCP <span' + ed + ' data-tnpc-field="hcps" data-cid="' + esc(card.id) + '">' + esc(hcpText(card)) + '</span>' +
            ' · ТИ <span' + ed + ' data-tnpc-field="tee" data-cid="' + esc(card.id) + '">' + esc(card.tee || '') + '</span>' +
            ' · ' + esc(bi('Лунка', 'Hole')) + ' <span' + ed + ' data-tnpc-field="startHole" data-cid="' + esc(card.id) + '">' + esc(card.startHole || '') + '</span>' +
            ' · <span' + ed + ' data-tnpc-field="startTime" data-cid="' + esc(card.id) + '">' + esc(card.startTime || '') + '</span></div>' +
            warn +
            '</div>' +
            tableHtml(card, printMode) +
            '<div class="tnpc-foot">' +
            '<div class="tnpc-sign"><span' + ed + ' data-tnpc-field="footer.player">' + esc(draft.footer.player) + '</span></div>' +
            '<div class="tnpc-sign"><span' + ed + ' data-tnpc-field="footer.marker">' + esc(draft.footer.marker) + '</span></div>' +
            '<div class="tnpc-sign"><span' + ed + ' data-tnpc-field="footer.judge">' + esc(draft.footer.judge) + '</span></div>' +
            '</div>' + ov +
            '</div>';
    }

    function previewStyle() {
        var L = ensureDraft().layout;
        return 'left:' + L.xMm + 'mm;top:' + L.yMm + 'mm;transform:scale(' + L.scale + ');';
    }

    function cardShellHtml(card, printMode) {
        return '<article class="tnpc-card" data-cid="' + esc(card.id) + '" style="' + previewStyle() + '">' +
            cardFaceHtml(card, printMode) + '</article>';
    }

    function toolbarHtml() {
        var d = ensureDraft();
        var L = d.layout;
        return '<div class="tnpc-toolbar">' +
            '<label>X мм <input type="number" data-tnm-live-edit="tnpc-layout" data-field="xMm" min="-100" max="300" value="' + esc(L.xMm) + '"></label>' +
            '<label>Y мм <input type="number" data-tnm-live-edit="tnpc-layout" data-field="yMm" min="-100" max="200" value="' + esc(L.yMm) + '"></label>' +
            '<label>' + esc(bi('Масштаб %', 'Scale %')) + ' <input type="number" data-tnm-live-edit="tnpc-layout" data-field="scalePct" min="50" max="200" value="' + esc(Math.round(L.scale * 100)) + '"></label>' +
            '<label><input type="checkbox" data-tnm-edit="tnpc-filter" data-field="selectedOnly"' + (d.filters.selectedOnly ? ' checked' : '') + '> ' + esc(bi('Только выбранные игроки', 'Selected only')) + '</label>' +
            '<label><input type="checkbox" data-tnm-edit="tnpc-filter" data-field="activeOnly"' + (d.filters.activeOnly ? ' checked' : '') + '> ' + esc(bi('Только активные', 'Active only')) + '</label>' +
            ui().btn('tnpc-pdf-all', esc(bi('Сохранить все в PDF', 'Save all to PDF')), { icon: 'fas fa-file-pdf', variant: 'primary' }) +
            ui().btn('tnpc-print-all', esc(bi('Печать всех', 'Print all')), { icon: 'fas fa-print' }) +
            ui().btn('tnpc-rebuild', esc(bi('Пересобрать', 'Rebuild')), { icon: 'fas fa-rotate', variant: 'ghost' }) +
            ui().btn('tnpc-add', esc(bi('+ Добавить карточку', 'Add card')), { icon: 'fas fa-plus', variant: 'ghost' }) +
            ui().btn('tnpc-fields', esc(bi('Настроить поля', 'Field setup')), { icon: 'fas fa-table', variant: 'ghost' }) +
            ui().btn('tnpc-logo', esc(bi('Загрузить лого', 'Upload logo')), { icon: 'fas fa-image', variant: 'ghost' }) +
            ui().btn('tnpc-qr', esc(d.qrEnabled ? bi('QR включены', 'QR on') : bi('Включить QR-коды', 'Enable QR')), { icon: 'fas fa-qrcode', variant: 'ghost' }) +
            ui().btn('tnpc-qr-add', esc(bi('Ещё QR', 'Add QR')), { icon: 'fas fa-plus', variant: 'ghost' }) +
            ui().btn('tnpc-reset-ov', esc(bi('Сбросить позиции', 'Reset overlays')), { icon: 'fas fa-up-down-left-right', variant: 'ghost' }) +
            '<input type="file" id="tnpc-logo-file" accept="image/png,image/jpeg,image/svg+xml" hidden>' +
            '<span class="tnpc-save" id="tnpc-save"></span>' +
            '<span class="tnpc-progress">' + esc(state.progress) + '</span>' +
            '</div>';
    }

    function fieldsPanelHtml() {
        if (!state.fieldsOpen) return '';
        var d = ensureDraft();
        var pars = '';
        var idx = '';
        for (var i = 0; i < 18; i++) {
            pars += '<input type="number" min="3" max="6" data-tnm-live-edit="tnpc-par" data-h="' + i + '" value="' + esc(d.pars[i] || 4) + '" title="Пар ' + (i + 1) + '">';
            idx += '<input type="number" min="1" max="18" data-tnm-live-edit="tnpc-idx" data-h="' + i + '" value="' + esc(d.indexes[i] || (i + 1)) + '" title="SI ' + (i + 1) + '">';
        }
        return '<div class="tnm-card">' +
            '<label><input type="checkbox" data-tnm-edit="tnpc-holes9"' + (d.holes === 9 ? ' checked' : '') + '> ' +
            esc(bi('Только 9 лунок', '9 holes only')) + '</label>' +
            '<p class="tnm-muted">Пар 3–6</p><div class="tnpc-fields">' + pars + '</div>' +
            '<p class="tnm-muted">Индекс 1–18</p><div class="tnpc-fields">' + idx + '</div>' +
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
        return '<p class="tnm-muted">⚠ ' + esc(bi('Индекс лунки повторяется — это предупреждение, сохранение не блокируется.', 'Duplicate stroke index — warning only.')) + '</p>';
    }

    function gridHtml() {
        var cards = visibleCards();
        if (!cards.length) {
            return '<div class="tnm-empty"><i class="fas fa-id-card"></i>' + esc(bi('Нет карточек. Нажмите «Пересобрать».', 'No cards. Click Rebuild.')) + '</div>';
        }
        var from = state.visible.from;
        var to = Math.min(cards.length, state.visible.to);
        var html = '<div class="tnpc-grid" id="tnpc-grid">';
        for (var i = from; i < to; i++) {
            var c = cards[i];
            html += '<div class="tnpc-sheet" draggable="true" data-tnpc-order="' + esc(c.id) + '">' +
                '<label class="tnpc-sel"><input type="checkbox" data-tnm-edit="tnpc-pick" data-id="' + esc(c.id) + '"' + (state.selected[c.id] ? ' checked' : '') + '></label>' +
                '<div class="tnpc-sheet-a4">' + cardShellHtml(c, false) + '</div>' +
                '<div class="tnpc-card-actions">' +
                ui().btn('tnpc-pdf-one', 'PDF', { data: { id: c.id }, variant: 'ghost' }) +
                ui().btn('tnpc-print-one', esc(bi('Печать', 'Print')), { data: { id: c.id }, variant: 'ghost' }) +
                ui().btn('tnpc-del-card', esc(bi('Удалить', 'Delete')), { data: { id: c.id }, variant: 'ghost' }) +
                '</div></div>';
        }
        html += '</div>';
        if (cards.length > to) html += '<p class="tnm-muted">' + esc(bi('Показаны', 'Showing') + ' ' + to + ' / ' + cards.length) + '</p>';
        return html;
    }

    function html() {
        if (!tid()) return '<div class="tnm-card">' + esc(bi('Турнир не выбран', 'No tournament')) + '</div>';
        ensureDraft();
        if (!(ensureDraft().cards || []).length) rebuild(false);
        return '<div class="tnpc-wrap tnm-tab-body">' + toolbarHtml() + fieldsPanelHtml() + gridHtml() + '</div>';
    }

    function printCss() {
        return '<style>@page{size:A4 landscape;margin:0}body{margin:0;background:#fff}' +
            '.page{width:' + PAGE_W + 'mm;height:' + PAGE_H + 'mm;position:relative;page-break-after:always;overflow:hidden}' +
            '.tnpc-card{position:absolute;width:' + CARD_W + 'mm;height:' + CARD_H + 'mm;background:#fff;color:#111;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;overflow:hidden;border:none}' +
            '.tnpc-card-inner{position:relative;width:100%;height:100%;padding:5mm;box-sizing:border-box}' +
            '.tnpc-head{text-align:center;border-bottom:0.3mm solid #111;padding-bottom:2mm;margin-bottom:2mm}' +
            '.tnpc-title{font-weight:800;font-size:4.2mm}.tnpc-name{font-weight:800;font-size:4.4mm;margin-top:1.5mm}' +
            '.tnpc-meta{font-size:3.1mm;margin-top:1mm}' +
            '.tnpc-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:2.8mm}' +
            '.tnpc-table th,.tnpc-table td{border:0.25mm solid #111;text-align:center;padding:1.1mm 0.2mm;height:6.2mm}' +
            '.tnpc-table .lab{text-align:left;font-weight:700;width:16mm;padding-left:1mm}' +
            '.tnpc-table .sum{font-weight:800;background:#efefef}' +
            '.tnpc-foot{display:flex;gap:4mm;margin-top:4mm}' +
            '.tnpc-sign{flex:1;border-top:0.3mm solid #111;padding-top:1.5mm;font-size:2.8mm;text-align:center}' +
            '.tnpc-overlay{position:absolute} .tnpc-overlay img{width:100%;height:100%;object-fit:contain}' +
            '.tnpc-handle,.tnpc-x,.tnpc-warn,.tnpc-ph{display:none!important}</style>';
    }

    function documentFor(cards) {
        var L = ensureDraft().layout;
        var pages = cards.map(function (c) {
            return '<section class="page"><article class="tnpc-card" style="left:' + L.xMm + 'mm;top:' + L.yMm +
                'mm;transform:scale(' + L.scale + ');transform-origin:top left">' + cardFaceHtml(c, true) + '</article></section>';
        }).join('');
        return '<!DOCTYPE html><html><head><meta charset="utf-8">' + printCss() + '</head><body>' + pages + '</body></html>';
    }

    function printCards(cards, label) {
        state.progress = bi('Готовлю PDF (0/' + cards.length + ')', 'Preparing PDF (0/' + cards.length + ')');
        ui().render();
        var i = 0;
        function tick() {
            i++;
            state.progress = (label || bi('Готовлю PDF', 'Preparing PDF')) + ' (' + Math.min(i, cards.length) + '/' + cards.length + ')';
            var el = document.querySelector('.tnpc-progress');
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
        if (!cards.length) { state.progress = ''; return; }
        tick();
    }

    function bindDrag(host) {
        host.addEventListener('pointerdown', function (ev) {
            var handle = ev.target.closest('[data-tnpc-resize]');
            var ovEl = ev.target.closest('[data-overlay-id]');
            if (!ovEl) return;
            if (ev.target.closest('[data-tnm-act]')) return;
            var id = ovEl.getAttribute('data-overlay-id');
            var ov = ensureDraft().overlays.filter(function (o) { return o.id === id; })[0];
            if (!ov) return;
            var cardEl = ovEl.closest('.tnpc-card');
            if (!cardEl) return;
            var rect = cardEl.getBoundingClientRect();
            var mmX = rect.width / CARD_W;
            var mmY = rect.height / CARD_H;
            state.drag = {
                id: id,
                resize: !!handle,
                startX: ev.clientX,
                startY: ev.clientY,
                ox: ov.xMm,
                oy: ov.yMm,
                ow: ov.wMm,
                oh: ov.hMm,
                mmX: mmX,
                mmY: mmY
            };
            try { ovEl.setPointerCapture(ev.pointerId); } catch (e) { /* silent */ }
            ev.preventDefault();
        });
        host.addEventListener('pointermove', function (ev) {
            if (!state.drag) return;
            var d = state.drag;
            var dx = (ev.clientX - d.startX) / d.mmX;
            var dy = (ev.clientY - d.startY) / d.mmY;
            var ov = ensureDraft().overlays.filter(function (o) { return o.id === d.id; })[0];
            if (!ov) return;
            if (d.resize) {
                ov.wMm = d.ow + dx;
                ov.hMm = d.oh + dy;
            } else {
                ov.xMm = d.ox + dx;
                ov.yMm = d.oy + dy;
            }
            ov = clampOverlay(ov);
            ensureDraft().overlays = ensureDraft().overlays.map(function (o) { return o.id === ov.id ? ov : o; });
            host.querySelectorAll('[data-overlay-id="' + ov.id + '"]').forEach(function (el) {
                el.style.left = ov.xMm + 'mm';
                el.style.top = ov.yMm + 'mm';
                el.style.width = ov.wMm + 'mm';
                el.style.height = ov.hMm + 'mm';
            });
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
            var ov = ensureDraft().overlays.filter(function (o) { return o.id === id; })[0];
            if (!ov) return;
            var next = root.prompt(bi('Содержимое QR (URL или текст)', 'QR payload (URL or text)'), ov.payload || '');
            if (next == null) return;
            ov.payload = String(next);
            persistSoon();
            ui().render();
        });
        host.addEventListener('dragstart', function (ev) {
            var row = ev.target.closest('[data-tnpc-order]');
            if (!row) return;
            ev.dataTransfer.setData('text/plain', row.getAttribute('data-tnpc-order'));
        });
        host.addEventListener('dragover', function (ev) {
            if (ev.target.closest('[data-tnpc-order]')) ev.preventDefault();
        });
        host.addEventListener('drop', function (ev) {
            var row = ev.target.closest('[data-tnpc-order]');
            var srcId = ev.dataTransfer.getData('text/plain');
            if (!row || !srcId) return;
            ev.preventDefault();
            var dstId = row.getAttribute('data-tnpc-order');
            var list = ensureDraft().cards;
            var si = -1, di = -1;
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
        });
        host.addEventListener('blur', function (ev) {
            var el = ev.target;
            if (!el || !el.getAttribute) return;
            var field = el.getAttribute('data-tnpc-field');
            var grid = el.getAttribute('data-tnpc-grid');
            if (field) applyInline(el, field);
            if (grid) applyGrid(el, grid);
        }, true);
        var grid = host.querySelector('#tnpc-grid');
        if (grid) {
            grid.addEventListener('scroll', function () {
                var cards = visibleCards();
                if (cards.length <= 40) return;
                state.visible.to = Math.min(cards.length, state.visible.to + 8);
            });
        }
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
        if (!cid) return;
        var card = draft.cards.filter(function (c) { return c.id === cid; })[0];
        if (!card) return;
        if (field === 'names') card.names = text.split(/\s*[+/]\s*/);
        else if (field === 'hcps') card.hcps = text.split(/\s*\/\s*/);
        else if (field === 'tee') card.tee = text;
        else if (field === 'startHole') card.startHole = parseInt(text, 10) || card.startHole;
        else if (field === 'startTime') card.startTime = text;
        persistSoon();
    }

    function applyGrid(el, kind) {
        var h = parseInt(el.getAttribute('data-h'), 10);
        var v = parseInt((el.textContent || '').trim(), 10);
        var draft = ensureDraft();
        if (kind === 'par') {
            if (v < 3 || v > 6) { el.textContent = String(draft.pars[h] || 4); return; }
            draft.pars[h] = v;
        } else if (kind === 'idx') {
            if (v < 1 || v > 18) { el.textContent = String(draft.indexes[h] || (h + 1)); return; }
            draft.indexes[h] = v;
        }
        persistSoon();
        ui().render();
    }

    function readLogoFile(file) {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            ui().toastMsg(bi('Логотип больше 2 МБ', 'Logo larger than 2 MB'));
            return;
        }
        var okType = /image\/(png|jpeg|svg\+xml)/.test(file.type) || /\.(png|jpe?g|svg)$/i.test(file.name || '');
        if (!okType) {
            ui().toastMsg(bi('Нужен PNG, JPG или SVG', 'PNG, JPG or SVG required'));
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            ensureDraft().logoSrc = String(reader.result || '');
            ensureDraft().overlays.forEach(function (o) {
                if (o.type === 'logo') o.enabled = true;
            });
            persistSoon();
            ui().render();
        };
        reader.readAsDataURL(file);
    }

    var mounted = false;
    function mount() {
        var host = ui().rootEl();
        if (!host) return;
        if (!host._tnpcDrag) {
            host._tnpcDrag = true;
            bindDrag(host);
        }
        var file = host.querySelector('#tnpc-logo-file');
        if (file && !file._tnpc) {
            file._tnpc = true;
            file.addEventListener('change', function () {
                readLogoFile(file.files && file.files[0]);
                file.value = '';
            });
        }
        updateSaveLabel();
        mounted = true;
    }

    ui().on('tnpc-pdf-all', function () { printCards(visibleCards()); });
    ui().on('tnpc-print-all', function () { printCards(visibleCards(), bi('Печать', 'Print')); });
    ui().on('tnpc-rebuild', function () { ensureDraft().orderLocked = false; rebuild(false); ui().render(); });
    ui().on('tnpc-add', function () { ui().openModal('tnpc-add', {}); });
    ui().on('tnpc-fields', function () { state.fieldsOpen = !state.fieldsOpen; ui().render(); });
    ui().on('tnpc-logo', function () {
        var f = ui().rootEl().querySelector('#tnpc-logo-file');
        if (f) f.click();
    });
    ui().on('tnpc-logo-ph', function () {
        var f = ui().rootEl().querySelector('#tnpc-logo-file');
        if (f) f.click();
    });
    ui().on('tnpc-qr', function () { toggleQr(); });
    ui().on('tnpc-qr-enable', function () { toggleQr(true); });
    ui().on('tnpc-qr-add', function () {
        ensureDraft().qrEnabled = true;
        var n = ensureDraft().overlays.filter(function (o) { return o.type === 'qr'; }).length + 1;
        ensureDraft().overlays.push(clampOverlay({
            id: 'qr-' + Date.now(), type: 'qr', xMm: 115, yMm: 4 + n * 28, wMm: 26, hMm: 26, payload: '', enabled: true
        }));
        persistSoon();
        ui().render();
    });
    ui().on('tnpc-reset-ov', function () {
        ensureDraft().overlays = defaultOverlays();
        if (ensureDraft().qrEnabled) ensureDraft().overlays[1].enabled = true;
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
        ensureDraft().cards = ensureDraft().cards.filter(function (c) { return c.id !== id; });
        persistSoon();
        ui().render();
    });
    ui().on('tnpc-pdf-one', function (btn) {
        var id = btn.getAttribute('data-id');
        var card = visibleCards().filter(function (c) { return c.id === id; })[0];
        if (card) printCards([card]);
    });
    ui().on('tnpc-print-one', function (btn) {
        var id = btn.getAttribute('data-id');
        var card = visibleCards().filter(function (c) { return c.id === id; })[0];
        if (card) printCards([card]);
    });
    ui().on('tnpc-add-confirm', function () {
        var host = ui().rootEl();
        var name = (host.querySelector('[data-tnpc-new="name"]') || {}).value || '';
        var hcp = (host.querySelector('[data-tnpc-new="hcp"]') || {}).value || '';
        var tee = (host.querySelector('[data-tnpc-new="tee"]') || {}).value || '';
        var hole = (host.querySelector('[data-tnpc-new="hole"]') || {}).value || '1';
        var time = (host.querySelector('[data-tnpc-new="time"]') || {}).value || '';
        if (!name.trim()) return;
        ensureDraft().cards.push({
            id: 'manual-' + Date.now(),
            playerIds: [],
            names: [name.trim()],
            hcps: [hcp],
            tee: tee,
            startHole: parseInt(hole, 10) || 1,
            startTime: time,
            flight: '',
            manual: true,
            missingPair: false,
            order: ensureDraft().cards.length
        });
        ui().closeModal();
        persistSoon();
        ui().render();
    });
    ui().on('live:tnpc-layout', function (input) {
        var field = input.getAttribute('data-field');
        var L = ensureDraft().layout;
        if (field === 'scalePct') L.scale = clampNum(Number(input.value) / 100, 0.5, 2, 1);
        else if (field === 'xMm') L.xMm = clampNum(input.value, -100, 300, 140);
        else if (field === 'yMm') L.yMm = clampNum(input.value, -100, 200, 40);
        persistSoon();
        var host = ui().rootEl();
        host.querySelectorAll('.tnpc-card').forEach(function (el) {
            el.style.left = L.xMm + 'mm';
            el.style.top = L.yMm + 'mm';
            el.style.transform = 'scale(' + L.scale + ')';
        });
    });
    ui().on('live:tnpc-par', function (input) {
        var h = parseInt(input.getAttribute('data-h'), 10);
        var v = parseInt(input.value, 10);
        if (v >= 3 && v <= 6) { ensureDraft().pars[h] = v; persistSoon(); }
    });
    ui().on('live:tnpc-idx', function (input) {
        var h = parseInt(input.getAttribute('data-h'), 10);
        var v = parseInt(input.value, 10);
        if (v >= 1 && v <= 18) { ensureDraft().indexes[h] = v; persistSoon(); }
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

    function toggleQr(forceOn) {
        var d = ensureDraft();
        d.qrEnabled = forceOn === true ? true : !d.qrEnabled;
        if (ensureDraft().qrEnabled) {
            var has = ensureDraft().overlays.some(function (o) { return o.type === 'qr'; });
            if (!has) ensureDraft().overlays.push(clampOverlay({ id: 'qr-1', type: 'qr', xMm: 115, yMm: 4, wMm: 26, hMm: 26, payload: '' }));
            ensureDraft().overlays.forEach(function (o) { if (o.type === 'qr') o.enabled = true; });
        }
        persistSoon();
        ui().render();
    }

    ui().modal('tnpc-add', function () {
        return '<div class="tnm-modal"><div class="tnm-modal-card">' +
            '<h3>' + esc(bi('Добавить карточку', 'Add card')) + '</h3>' +
            '<label class="tnm-field">' + esc(bi('Имя', 'Name')) + '<input data-tnpc-new="name"></label>' +
            '<label class="tnm-field">HCP <input data-tnpc-new="hcp"></label>' +
            '<label class="tnm-field">ТИ <input data-tnpc-new="tee"></label>' +
            '<label class="tnm-field">' + esc(bi('Лунка', 'Hole')) + '<input type="number" min="1" max="18" data-tnpc-new="hole" value="1"></label>' +
            '<label class="tnm-field">' + esc(bi('Время', 'Time')) + '<input data-tnpc-new="time"></label>' +
            '<div class="tnm-view-head-actions">' +
            ui().btn('tnpc-add-confirm', esc(bi('Добавить', 'Add')), { variant: 'primary' }) +
            ui().btn('close-modal', esc(bi('Отмена', 'Cancel')), { variant: 'ghost' }) +
            '</div></div></div>';
    });

    return {
        html: html,
        mount: mount,
        buildCards: buildCards,
        clampOverlay: clampOverlay,
        defaultDraft: defaultDraft,
        CARD_W: CARD_W,
        CARD_H: CARD_H,
        isActivePlayer: isActivePlayer,
        mergeManual: mergeManual,
        state: state
    };
})(typeof window !== 'undefined' ? window : this);

if (typeof module !== 'undefined' && module.exports) module.exports = TnMgrPrintCards;
