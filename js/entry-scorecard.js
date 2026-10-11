// js/entry-scorecard.js — счётные карточки на экранах ввода счёта (setup-round.html).
//
// Два вида карточки, у каждого 5 вариантов оформления и свой набор элементов:
//   general — «Общая карточка»: группа 2+ игрока, лунки в строках, игроки в столбцах;
//   hole    — «Счётная карточка по лункам»: один игрок (соло и турнирный QR).
// Настройки админ выбирает во вкладке «Карточки на вводе» и пишет одним объектом в
// settings/entry_scorecard_display (localStorage — офлайн-кэш). Для турнирных раундов
// можно задать отдельный вариант каждой карточки (null = как в обычном раунде).
//
// Остальные страницы (главная, лидерборд, профиль, печать) используют свои рендеры
// из js/utils.js (renderClubScorecard / generateGroupHoleTableHTML) и не меняются.
// Вызовы из setup-round идут через pestovoEntryCardsInto / pestovoEntryRoundCardHTML.

var ENTRY_SC_STORAGE = 'pestovo_entry_scorecard_display';
var ENTRY_SC_FIREBASE = 'settings/entry_scorecard_display';
var ENTRY_SC_VARIANTS = ['1', '2', '3', '4', '5'];
var ENTRY_SC_SIZES = ['s', 'm', 'l'];
var ENTRY_SC_KINDS = ['general', 'hole'];
var ENTRY_SC_SHOW_KEYS = {
    general: ['format', 'tee', 'hcp', 'par', 'hcpMarks', 'marker', 'current', 'subtotal', 'totals', 'thru', 'mismatch', 'legend'],
    hole: ['tee', 'hcp', 'par', 'hcpMarks', 'marker', 'current', 'subtotal', 'totals', 'toPar', 'played', 'mismatch', 'legend']
};
var ENTRY_SC_SHOW_META = {
    format: { ru: 'Формат раунда в шапке', en: 'Round format in the header' },
    tee: { ru: 'Тип ти рядом с именем', en: 'Tee next to the name' },
    hcp: { ru: 'Гандикап игрока (HCP)', en: 'Player handicap (HCP)' },
    par: { ru: 'Пар лунки', en: 'Hole par' },
    hcpMarks: { ru: 'Удары форы (черточки)', en: 'Handicap strokes (marks)' },
    marker: { ru: 'Счёт маркера', en: 'Marker score' },
    current: { ru: 'Подсветка текущей лунки', en: 'Current hole highlight' },
    subtotal: { ru: 'Промежуточные итоги по 9', en: 'Subtotals per 9 holes' },
    totals: { ru: 'Итоговая строка', en: 'Totals row' },
    toPar: { ru: 'Счёт к пару (+/−)', en: 'Score to par (+/−)' },
    played: { ru: 'Сыграно лунок N/M', en: 'Holes played N/M' },
    thru: { ru: 'Статус «на лунке»', en: 'Thru status' },
    mismatch: { ru: 'Подсветка расхождения с маркером', en: 'Marker mismatch highlight' },
    legend: { ru: 'Подсказка «Как читать карточку»', en: 'How-to-read hint' }
};
// Варианты: name/desc — подписи админки; тексты одинаковы для обоих видов по духу.
var ENTRY_SC_VARIANT_META = {
    general: [
        { name: 'Таблица клуба', desc: 'Лунки в строках, игроки в столбцах. Первая колонка закреплена.' },
        { name: 'Блоки по 9', desc: 'Отдельная таблица на каждые девять лунок с итогами блока.' },
        { name: 'Строки игроков', desc: 'Каждый игрок — строка, лунки идут вправо. Удобно при 4+ игроках.' },
        { name: 'Карточки игроков', desc: 'Отдельная карточка на игрока: сетка лунок и итоги.' },
        { name: 'Плитки лунок', desc: 'Плитка на лунку: счёт всех игроков рядом. Без горизонтальной прокрутки.' }
    ],
    hole: [
        { name: 'Бланк клуба', desc: 'Таблица как в бумажной карточке: лунки по горизонтали, итоги девятки.' },
        { name: 'Тройки', desc: 'Лунки группами по три крупными ячейками, итог после каждой девятки.' },
        { name: 'Лента', desc: 'Крупные колонки со счётом, прокрутка вправо. Счёт виден издалека.' },
        { name: 'Список', desc: 'Одна лунка на строку: номер, пар, счёт и отклонение. Без прокрутки.' },
        { name: 'Плитки', desc: 'Плитка на лунку: счёт в центре, отклонение и маркер снизу.' }
    ]
};
var ENTRY_SC_SIZE_META = {
    s: { ru: 'Компактно', en: 'Compact' },
    m: { ru: 'Обычно', en: 'Regular' },
    l: { ru: 'Крупно', en: 'Large' }
};

function entryScBool(value, fallback) {
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    if (value === true || value === 1 || value === '1' || value === 'true') return true;
    return fallback !== false;
}

function entryScNormKind(src, kind) {
    src = src && typeof src === 'object' ? src : {};
    var srcShow = src.show && typeof src.show === 'object' ? src.show : {};
    var show = {};
    ENTRY_SC_SHOW_KEYS[kind].forEach(function(key) { show[key] = entryScBool(srcShow[key], true); });
    return {
        variant: ENTRY_SC_VARIANTS.indexOf(String(src.variant)) !== -1 ? String(src.variant) : '1',
        size: ENTRY_SC_SIZES.indexOf(String(src.size)) !== -1 ? String(src.size) : 'm',
        show: show
    };
}

// Нормализация всего объекта настроек (и для БД, и для localStorage, и для драфта админки).
function normalizeEntryScorecardSettings(value) {
    var src = value && typeof value === 'object' ? value : {};
    var tn = src.tournament && typeof src.tournament === 'object' ? src.tournament : {};
    var override = function(v) { return ENTRY_SC_VARIANTS.indexOf(String(v)) !== -1 ? String(v) : null; };
    return {
        general: entryScNormKind(src.general, 'general'),
        hole: entryScNormKind(src.hole, 'hole'),
        tournament: { general: override(tn.general), hole: override(tn.hole) }
    };
}

var entryScSettings = (function() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(ENTRY_SC_STORAGE) || 'null'); } catch (e) { console.warn('[entry-sc] local cache read failed', e); }
    return normalizeEntryScorecardSettings(raw);
})();

function getEntryScorecardSettings() {
    return JSON.parse(JSON.stringify(entryScSettings));
}

// Хосты — контейнеры карточек на экране. При смене настроек перерисовываем их на месте.
var entryScHosts = [];

function setEntryScorecardSettings(value) {
    entryScSettings = normalizeEntryScorecardSettings(value);
    try { localStorage.setItem(ENTRY_SC_STORAGE, JSON.stringify(entryScSettings)); } catch (e) { console.warn('[entry-sc] local cache write failed', e); }
    entryScRefreshHosts();
    try { if (typeof renderEntryScorecardAdmin === 'function') renderEntryScorecardAdmin(false); } catch (e) { console.warn('[entry-sc] admin refresh failed', e); }
    return getEntryScorecardSettings();
}

function entryScRefreshHosts() {
    entryScHosts = entryScHosts.filter(function(el) { return el && el.isConnected; });
    entryScHosts.forEach(function(el) {
        if (typeof el.__escBuild !== 'function') return;
        try { el.innerHTML = el.__escBuild(); } catch (e) { console.warn('[entry-sc] redraw failed', e); }
    });
}

// Вывод карточки в контейнер с запоминанием билдера: новые данные и смена настроек
// перерисовывают карточку, не трогая соседние блоки страницы.
function pestovoEntryCardsInto(el, build) {
    if (!el || typeof build !== 'function') return;
    el.__escBuild = build;
    if (entryScHosts.indexOf(el) === -1) entryScHosts.push(el);
    el.innerHTML = build();
}

function entryScIsTournament(round) {
    try { return !!round && typeof isTournamentRound === 'function' && isTournamentRound(round); } catch (e) { return false; }
}

// Итоговые параметры карточки для раунда: вид (с учётом турнирного переопределения),
// размер и видимые элементы.
function entryScResolve(kind, round) {
    var base = entryScSettings[kind] || normalizeEntryScorecardSettings(null)[kind];
    var variant = base.variant;
    if (entryScIsTournament(round) && entryScSettings.tournament && entryScSettings.tournament[kind]) {
        variant = entryScSettings.tournament[kind];
    }
    return { variant: variant, size: base.size, show: Object.assign({}, base.show) };
}

// ── Общие помощники ──────────────────────────────────────────────────────────

function entryScEsc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function entryScEn() {
    return typeof currentLang !== 'undefined' && currentLang === 'en';
}

function entryScTx(ru, en) {
    return entryScEn() ? en : ru;
}

function entryScHcpLabel() {
    try {
        var v = t('field_hcp_short');
        if (v && v !== 'field_hcp_short') return v;
    } catch (e) { console.warn('[silent]', e); }
    return 'HCP';
}

function entryScBand(fhcp) {
    try { return typeof fieldHcpBandClass === 'function' ? fieldHcpBandClass(fhcp) : ''; } catch (e) { return ''; }
}

function entryScFmtScore(value) {
    try { return fmtScore(value); } catch (e) { return String(value); }
}

function entryScScoreCls(value) {
    try { return scoreClass(value); } catch (e) { return ''; }
}

function entryScTeePill(tee) {
    try { return typeof fmtTeePill === 'function' ? fmtTeePill(tee) : ''; } catch (e) { return ''; }
}

function entryScHcpChip(fhcp) {
    var txt = '';
    try { txt = fmtFieldHcp(fhcp); } catch (e) { txt = String(fhcp); }
    return '<span class="hcp-chip ' + entryScBand(fhcp) + '">' + entryScEsc(entryScHcpLabel()) + ' ' + entryScEsc(txt) + '</span>';
}

function entryScShortName(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0] || '—';
    return parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '.';
}

// Данные одного игрока: ячейки по лункам в порядке игры + итоги.
function entryScPlayerInfo(pid, p, r, order, opts) {
    p = p || {};
    r = r || {};
    var hcp = (p.fieldHcp !== undefined && p.fieldHcp !== null && p.fieldHcp !== '')
        ? p.fieldHcp : (r.fieldHcp !== undefined && r.fieldHcp !== null ? r.fieldHcp : 0);
    var scores = p.scores || {};
    var stats = { gross: 0, toPar: null, holesPlayed: 0, currentHole: null };
    try { stats = calcRoundStats(scores, hcp, p.exactHcp || 0, order); } catch (e) { console.warn('[silent]', e); }
    var cur = null;
    try { cur = playerCurrentHole(r, pid, p, stats, order); } catch (e) { cur = stats.currentHole || null; }
    var name = p.name || '—';
    try { name = typeof privacyDisplayName === 'function' ? privacyDisplayName(p, pid) : playerDisplayName(p, pid); } catch (e) { console.warn('[silent]', e); }
    var thru = '';
    try { thru = typeof playerHoleStatusText === 'function' ? playerHoleStatusText(r, pid, p, stats, order) : ''; } catch (e) { console.warn('[silent]', e); }
    var tee = (p && p.tee) || r.tee || 'wh';
    try { tee = pestovoNormalizeTeeCode(tee); } catch (e) { tee = 'wh'; }
    var cells = [];
    order.forEach(function(h) {
        var s = parseInt(scores[h], 10) || 0;
        var par = holePar(h);
        var mk = 0;
        if (opts.showMarker) {
            if (opts.markerScores) mk = parseInt(opts.markerScores[h], 10) || 0;
            else { try { mk = getPlayerMarkerScoreForHole(p, h).score || 0; } catch (e) { mk = 0; } }
        }
        var verify = 'none';
        try { verify = getHoleVerifyState(p, h); } catch (e) { console.warn('[silent]', e); }
        var mismatch = verify === 'mismatch' || (opts.showMarker && s > 0 && mk > 0 && s !== mk);
        cells.push({
            h: h, par: par, s: s, mk: mk, mismatch: !!mismatch,
            res: s > 0 ? holeResClass(s, par) : '',
            delta: s > 0 ? s - par : null,
            cur: cur === h
        });
    });
    return {
        pid: pid, p: p, name: name, tee: tee, hcp: hcp, cells: cells, thru: thru, cur: cur,
        gross: stats.gross || 0, toPar: stats.toPar, played: stats.holesPlayed || 0, total: order.length,
        order: order
    };
}

// Группы по девять лунок (порядок игры сохраняется, в т.ч. старт с 10-й и шотган).
function entryScChunks(cells) {
    var out = [];
    for (var i = 0; i < cells.length; i += 9) {
        var part = cells.slice(i, i + 9);
        var st = entryScChunkStats(part);
        out.push({ from: part[0].h, to: part[part.length - 1].h, cells: part, gross: st.gross, count: st.count, parPlayed: st.parPlayed, parSum: st.parSum, delta: st.delta });
    }
    return out;
}

function entryScChunkStats(cells) {
    var st = { gross: 0, count: 0, parPlayed: 0, parSum: 0, delta: 0 };
    cells.forEach(function(c) {
        st.parSum += c.par;
        if (c.s > 0) { st.gross += c.s; st.count++; st.parPlayed += c.par; }
    });
    st.delta = st.gross - st.parPlayed;
    return st;
}

function entryScChunkLabel(ch) {
    return entryScTx('Лунки ', 'Holes ') + ch.from + '–' + ch.to;
}

// Значение ячейки: счёт (или тире) + удары форы.
function entryScScoreHTML(c, info, show) {
    var marks = '';
    if (show.hcpMarks) {
        try { marks = hcpStrokesMarksHTML(info.hcp, c.h); } catch (e) { marks = ''; }
        if (marks) marks = '<span class="esc-hm">' + marks + '</span>';
    }
    return '<span class="esc-val' + (c.res ? ' ' + c.res : '') + '">' + (c.s > 0 ? c.s : '—') + marks + '</span>';
}

function entryScMarkerHTML(c, opts, show) {
    if (!opts.showMarker || !show.marker) return '';
    var label = entryScTx('Счёт маркера ', 'Marker score ');
    return '<span class="esc-mk' + (c.mismatch && show.mismatch ? ' is-mm' : '') + '" title="' + entryScEsc(label + (c.mk > 0 ? c.mk : '—')) + '">' +
        '<i class="esc-mk-lbl" aria-hidden="true">' + entryScTx('М', 'M') + '</i>' + (c.mk > 0 ? c.mk : '—') + '</span>';
}

// Ячейка лунки: data-sc-player + data-sc-hole (совместимо с utils.js). Строки/плитки/шапки
// лунок несут data-sc-row — чтобы счёт ячеек по data-sc-hole был однозначным.
function entryScCellAttrs(info, c, show) {
    var cls = '';
    if (show.current && c.cur) cls += ' esc-cur';
    if (show.mismatch && c.mismatch) cls += ' esc-mm cell-mismatch';
    return {
        cls: cls,
        attrs: ' data-sc-player="' + entryScEsc(info.pid) + '" data-sc-hole="' + c.h + '"' + (c.cur ? ' data-sc-current="1"' : '')
    };
}

function entryScSubLine(ch, extraCls) {
    var val = ch.count ? '<b>' + ch.gross + '</b> <small class="' + entryScScoreCls(ch.delta) + '">' + entryScEsc(entryScFmtScore(ch.delta)) + '</small>' : '<b>—</b>';
    return '<div class="esc-sub' + (extraCls ? ' ' + extraCls : '') + '"><span>' + entryScEsc(entryScChunkLabel(ch)) + '</span>' + val + '</div>';
}

// ── Счётная карточка по лункам (один игрок) ─────────────────────────────────

function entryScHoleFoot(info, show) {
    if (!show.totals) return '';
    var en = entryScEn();
    var parts = ['<span>' + (en ? 'Gross' : 'Брутто') + ' <b>' + (info.played ? info.gross : '—') + '</b></span>'];
    if (show.toPar) parts.push('<span class="' + entryScScoreCls(info.toPar) + ' esc-topar">' + entryScEsc(info.played ? entryScFmtScore(info.toPar) : '—') + '</span>');
    if (show.played) parts.push('<span>' + (en ? 'Played ' : 'Сыграно ') + info.played + '/' + info.total + '</span>');
    return '<footer class="esc-foot">' + parts.join('') + '</footer>';
}

function entryScHoleLayout1(info, show, opts) {
    var en = entryScEn();
    var lbl = { hole: en ? 'Hole' : 'Лунка', par: en ? 'Par' : 'Пар', score: en ? 'Score' : 'Счёт', sum: en ? 'Sum' : 'Итог', marker: en ? 'Marker' : 'Маркер' };
    var out = '';
    entryScChunks(info.cells).forEach(function(ch) {
        out += '<div class="esc-blank"><div class="esc-cap">' + entryScEsc(entryScChunkLabel(ch)) + '</div>' +
            '<div class="esc-scroll" tabindex="0" aria-label="' + entryScEsc(entryScChunkLabel(ch)) + '"><table class="esc-tbl"><tbody>';
        out += '<tr class="esc-tr-h"><th scope="row">' + lbl.hole + '</th>' + ch.cells.map(function(c) { return '<td class="esc-hn">' + c.h + '</td>'; }).join('') +
            (show.subtotal ? '<td class="esc-tsum">' + lbl.sum + '</td>' : '') + '</tr>';
        if (show.par) {
            out += '<tr class="esc-tr-p"><th scope="row">' + lbl.par + '</th>' + ch.cells.map(function(c) { return '<td>' + c.par + '</td>'; }).join('') +
                (show.subtotal ? '<td class="esc-tsum">' + ch.parSum + '</td>' : '') + '</tr>';
        }
        out += '<tr class="esc-tr-s"><th scope="row">' + lbl.score + '</th>' + ch.cells.map(function(c) {
            var a = entryScCellAttrs(info, c, show);
            return '<td class="esc-tc' + a.cls + '"' + a.attrs + '>' + entryScScoreHTML(c, info, show) + '</td>';
        }).join('') + (show.subtotal ? '<td class="esc-tsum"><b>' + (ch.count ? ch.gross : '—') + '</b></td>' : '') + '</tr>';
        if (opts.showMarker && show.marker) {
            out += '<tr class="esc-tr-m"><th scope="row">' + lbl.marker + '</th>' + ch.cells.map(function(c) {
                return '<td class="' + (c.mismatch && show.mismatch ? 'esc-mm' : '') + '">' + (c.mk > 0 ? c.mk : '—') + '</td>';
            }).join('') + (show.subtotal ? '<td></td>' : '') + '</tr>';
        }
        out += '</tbody></table></div></div>';
    });
    return out;
}

function entryScHoleLayout2(info, show, opts) {
    var en = entryScEn();
    var out = '';
    entryScChunks(info.cells).forEach(function(ch) {
        for (var i = 0; i < ch.cells.length; i += 3) {
            var trio = ch.cells.slice(i, i + 3);
            out += '<div class="esc-trio">' + trio.map(function(c) {
                var a = entryScCellAttrs(info, c, show);
                return '<div class="esc-trio-c' + a.cls + '"' + a.attrs + '>' +
                    '<span class="esc-trio-no">' + c.h + '</span>' +
                    (show.par ? '<span class="esc-trio-par">' + (en ? 'Par ' : 'Пар ') + c.par + '</span>' : '') +
                    entryScScoreHTML(c, info, show) +
                    (show.toPar && c.delta !== null ? '<span class="esc-dl ' + entryScScoreCls(c.delta) + '">' + entryScEsc(entryScFmtScore(c.delta)) + '</span>' : '') +
                    entryScMarkerHTML(c, opts, show) + '</div>';
            }).join('') + '</div>';
        }
        if (show.subtotal) out += entryScSubLine(ch);
    });
    return out;
}

function entryScHoleLayout3(info, show, opts) {
    var en = entryScEn();
    var rows = { head: [], par: [], score: [], marker: [] };
    var sumHead = '<span class="esc-rb-cell esc-rb-sum">Σ</span>';
    entryScChunks(info.cells).forEach(function(ch) {
        ch.cells.forEach(function(c) {
            var a = entryScCellAttrs(info, c, show);
            rows.head.push('<span class="esc-rb-cell esc-rb-n' + (show.current && c.cur ? ' esc-cur' : '') + '">' + c.h + '</span>');
            rows.par.push('<span class="esc-rb-cell">' + c.par + '</span>');
            rows.score.push('<span class="esc-rb-cell esc-rb-sc' + a.cls + '"' + a.attrs + '>' + entryScScoreHTML(c, info, show) + '</span>');
            rows.marker.push('<span class="esc-rb-cell' + (c.mismatch && show.mismatch ? ' esc-mm' : '') + '">' + (opts.showMarker && show.marker && c.mk > 0 ? c.mk : '') + '</span>');
        });
        if (show.subtotal) {
            rows.head.push(sumHead);
            rows.par.push('<span class="esc-rb-cell esc-rb-sum">' + ch.parSum + '</span>');
            rows.score.push('<span class="esc-rb-cell esc-rb-sum"><b>' + (ch.count ? ch.gross : '—') + '</b></span>');
            rows.marker.push('<span class="esc-rb-cell esc-rb-sum"></span>');
        }
    });
    var line = function(kind, label, items) {
        return '<div class="esc-rb-row esc-rb-' + kind + '"><span class="esc-rb-lbl">' + entryScEsc(label) + '</span>' + items.join('') + '</div>';
    };
    var out = '<div class="esc-scroll esc-rb-wrap" tabindex="0" aria-label="' + entryScEsc(en ? 'Hole results' : 'Результаты по лункам') + '"><div class="esc-rb">';
    out += line('head', en ? 'Hole' : 'Лунка', rows.head);
    if (show.par) out += line('par', en ? 'Par' : 'Пар', rows.par);
    out += line('score', en ? 'Score' : 'Счёт', rows.score);
    if (opts.showMarker && show.marker) out += line('marker', en ? 'Marker' : 'Маркер', rows.marker);
    return out + '</div></div>';
}

function entryScHoleLayout4(info, show, opts) {
    var en = entryScEn();
    var out = '<div class="esc-list">';
    entryScChunks(info.cells).forEach(function(ch) {
        ch.cells.forEach(function(c) {
            var a = entryScCellAttrs(info, c, show);
            out += '<div class="esc-li' + a.cls + '"' + a.attrs + '>' +
                '<span class="esc-li-no">' + c.h + '</span>' +
                (show.par ? '<span class="esc-li-par">' + (en ? 'Par ' : 'Пар ') + c.par + '</span>' : '') +
                '<span class="esc-li-sc">' + entryScScoreHTML(c, info, show) + '</span>' +
                (show.toPar && c.delta !== null ? '<span class="esc-li-d ' + entryScScoreCls(c.delta) + '">' + entryScEsc(entryScFmtScore(c.delta)) + '</span>' : '') +
                entryScMarkerHTML(c, opts, show) + '</div>';
        });
        if (show.subtotal) out += entryScSubLine(ch, 'esc-sub-row');
    });
    return out + '</div>';
}

function entryScHoleLayout5(info, show, opts) {
    var en = entryScEn();
    var out = '<div class="esc-tiles">';
    entryScChunks(info.cells).forEach(function(ch) {
        ch.cells.forEach(function(c) {
            var a = entryScCellAttrs(info, c, show);
            out += '<div class="esc-tile' + a.cls + '"' + a.attrs + '>' +
                '<div class="esc-tile-top"><b>' + c.h + '</b>' + (show.par ? '<span>' + (en ? 'Par ' : 'Пар ') + c.par + '</span>' : '') + '</div>' +
                '<div class="esc-tile-sc">' + entryScScoreHTML(c, info, show) + '</div>' +
                '<div class="esc-tile-bot">' +
                (show.toPar && c.delta !== null ? '<span class="esc-dl ' + entryScScoreCls(c.delta) + '">' + entryScEsc(entryScFmtScore(c.delta)) + '</span>' : '<span></span>') +
                entryScMarkerHTML(c, opts, show) + '</div></div>';
        });
        if (show.subtotal) out += entryScSubLine(ch, 'esc-sub-tile');
    });
    return out + '</div>';
}

var ENTRY_SC_HOLE_LAYOUTS = {
    '1': entryScHoleLayout1,
    '2': entryScHoleLayout2,
    '3': entryScHoleLayout3,
    '4': entryScHoleLayout4,
    '5': entryScHoleLayout5
};

// Счётная карточка по лункам для одного игрока (соло, турнирный QR, просмотр).
function entryScHoleHTML(player, round, opts, cfg) {
    opts = opts || {};
    var r = round || {};
    var pid = opts.playerId || '';
    if (!pid && r.players) {
        Object.keys(r.players).some(function(id) { if (r.players[id] === player) { pid = id; return true; } return false; });
    }
    cfg = cfg || entryScResolve('hole', r);
    var order = opts.order || getRoundOrder(r);
    var info = entryScPlayerInfo(pid, player || {}, r, order, opts);
    var show = cfg.show;
    var en = entryScEn();
    var legend = (opts.showMarker && show.legend) ? buildDualScorecardLegendHTML() : '';
    var layout = ENTRY_SC_HOLE_LAYOUTS[cfg.variant] || entryScHoleLayout1;
    var head = '<header class="esc-head"><strong class="esc-name">' + entryScEsc(info.name) + '</strong>' +
        (show.tee ? entryScTeePill(info.tee) : '') + (show.hcp ? entryScHcpChip(info.hcp) : '') + legend + '</header>';
    return '<section class="esc esc-hole esc-v' + cfg.variant + ' esc-sz-' + cfg.size + '" data-sc-kind="hole" data-sc-variant="' + cfg.variant + '" aria-label="' +
        entryScEsc(en ? 'Hole scorecard' : 'Счётная карточка по лункам') + '">' +
        head + '<div class="esc-body">' + layout(info, show, opts) + '</div>' + entryScHoleFoot(info, show) + '</section>';
}

// ── Общая карточка группы (2+ игрока) ───────────────────────────────────────

function entryScPlayerHead(info, show) {
    var names = String(info.name || '—').replace(/\s+/g, ' ').trim() || '—';
    var parts = names.split(' ');
    var first = parts.length > 1 ? parts.slice(0, -1).join(' ') : names;
    var last = parts.length > 1 ? parts[parts.length - 1] : '';
    return '<span class="esc-pn" title="' + entryScEsc(names) + '"><span class="esc-pn-t">' + entryScEsc(first) + '</span>' +
        (last ? '<span class="esc-pn-t">' + entryScEsc(last) + '</span>' : '') + '</span>' +
        '<span class="esc-pb">' + (show.tee ? entryScTeePill(info.tee) : '') + (show.hcp ? entryScHcpChip(info.hcp) : '') + '</span>';
}

// Строки-диапазоны по девяти лункам (индексы в order).
function entryScRanges(total) {
    var out = [];
    for (var i = 0; i < total; i += 9) out.push([i, Math.min(total, i + 9)]);
    return out;
}

function entryScGroupTotal(info, show) {
    var en = entryScEn();
    var topar = info.played ? entryScFmtScore(info.toPar) : '—';
    return '<div class="esc-gtot-g">' + (info.played ? info.gross : '—') + '</div>' +
        '<div class="esc-gtot-tp ' + entryScScoreCls(info.toPar) + '">' + entryScEsc(topar) + '</div>' +
        (show.played ? '<div class="esc-gtot-p">' + (en ? 'played ' : 'сыграно ') + info.played + '/' + info.total + '</div>' : '');
}

function entryScGroupTotPar(order) {
    var sum = 0;
    order.forEach(function(h) { sum += holePar(h); });
    return sum;
}

// Вариант 1: одна таблица, лунки в строках, игроки в столбцах.
function entryScGroupLayout1(infos, show, opts, order) {
    var en = entryScEn();
    var n = infos.length;
    var out = '<div class="esc-scroll" tabindex="0" aria-label="' + entryScEsc(en ? 'Group scores by holes' : 'Счёт группы по лункам') + '">' +
        '<table class="esc-gtbl" style="min-width:' + (78 + n * 118) + 'px"><thead><tr><th class="esc-gh" scope="col">' + (en ? 'Hole' : 'Лунка') + (show.par ? ' · ' + (en ? 'Par' : 'Пар') : '') + '</th>' +
        infos.map(function(info) { return '<th class="esc-gp" scope="col" data-sc-player="' + entryScEsc(info.pid) + '">' + entryScPlayerHead(info, show) + '</th>'; }).join('') +
        '</tr></thead><tbody>';
    entryScRanges(order.length).forEach(function(rg) {
        for (var j = rg[0]; j < rg[1]; j++) {
            var h = order[j];
            var anyCur = infos.some(function(info) { return info.cells[j].cur; });
            out += '<tr class="esc-gr' + (show.current && anyCur ? ' esc-gr-cur' : '') + '" data-sc-row="' + h + '">' +
                '<th class="esc-gh" scope="row">#' + h + (show.par ? ' <small>P' + holePar(h) + '</small>' : '') + '</th>' +
                infos.map(function(info) {
                    var c = info.cells[j], a = entryScCellAttrs(info, c, show);
                    return '<td class="esc-gc' + a.cls + '"' + a.attrs + '>' + entryScScoreHTML(c, info, show) + entryScMarkerHTML(c, opts, show) + '</td>';
                }).join('') + '</tr>';
        }
        if (show.subtotal) {
            out += '<tr class="esc-gsub"><th class="esc-gh" scope="row">' + entryScEsc(entryScTx('Лунки ', 'Holes ') + order[rg[0]] + '–' + order[rg[1] - 1]) + '</th>' +
                infos.map(function(info) {
                    var st = entryScChunkStats(info.cells.slice(rg[0], rg[1]));
                    return '<td>' + (st.count ? '<b>' + st.gross + '</b> <small class="' + entryScScoreCls(st.delta) + '">' + entryScEsc(entryScFmtScore(st.delta)) + '</small>' : '—') + '</td>';
                }).join('') + '</tr>';
        }
    });
    if (show.totals) {
        out += '<tr class="esc-gtot"><th class="esc-gh" scope="row">' + (en ? 'Total' : 'Итого') + ' <small>(' + entryScGroupTotPar(order) + ')</small></th>' +
            infos.map(function(info) { return '<td>' + entryScGroupTotal(info, show) + '</td>'; }).join('') + '</tr>';
    }
    return out + '</tbody></table></div>';
}

// Вариант 2: отдельная таблица на каждые девять лунок.
function entryScGroupLayout2(infos, show, opts, order) {
    var en = entryScEn();
    var head = '<thead><tr><th class="esc-gh" scope="col">' + (en ? 'Hole' : 'Лунка') + '</th>' +
        infos.map(function(info) { return '<th class="esc-gp" scope="col" data-sc-player="' + entryScEsc(info.pid) + '">' + entryScPlayerHead(info, show) + '</th>'; }).join('') +
        '</tr></thead>';
    var out = '';
    entryScRanges(order.length).forEach(function(rg) {
        var caption = entryScTx('Лунки ', 'Holes ') + order[rg[0]] + '–' + order[rg[1] - 1];
        out += '<div class="esc-gblock"><div class="esc-cap">' + entryScEsc(caption) + '</div><div class="esc-scroll" tabindex="0" aria-label="' + entryScEsc(caption) + '">' +
            '<table class="esc-gtbl esc-gfixed">' + head + '<tbody>';
        for (var j = rg[0]; j < rg[1]; j++) {
            var h = order[j];
            var anyCur = infos.some(function(info) { return info.cells[j].cur; });
            out += '<tr class="esc-gr' + (show.current && anyCur ? ' esc-gr-cur' : '') + '" data-sc-row="' + h + '">' +
                '<th class="esc-gh" scope="row">#' + h + (show.par ? ' <small>P' + holePar(h) + '</small>' : '') + '</th>' +
                infos.map(function(info) {
                    var c = info.cells[j], a = entryScCellAttrs(info, c, show);
                    return '<td class="esc-gc' + a.cls + '"' + a.attrs + '>' + entryScScoreHTML(c, info, show) + entryScMarkerHTML(c, opts, show) + '</td>';
                }).join('') + '</tr>';
        }
        if (show.subtotal) {
            out += '<tr class="esc-gsub"><th class="esc-gh" scope="row">' + entryScEsc(en ? 'Subtotal' : 'Итог блока') + '</th>' +
                infos.map(function(info) {
                    var st = entryScChunkStats(info.cells.slice(rg[0], rg[1]));
                    return '<td>' + (st.count ? '<b>' + st.gross + '</b> <small class="' + entryScScoreCls(st.delta) + '">' + entryScEsc(entryScFmtScore(st.delta)) + '</small>' : '—') + '</td>';
                }).join('') + '</tr>';
        }
        out += '</tbody></table></div></div>';
    });
    if (show.totals) {
        out += '<div class="esc-gblock esc-gblock-tot"><div class="esc-cap">' + (en ? 'Total' : 'Итого') + ' · ' + entryScGroupTotPar(order) + '</div><div class="esc-scroll">' +
            '<table class="esc-gtbl esc-gfixed">' + head + '<tbody><tr class="esc-gtot"><th class="esc-gh" scope="row">' + (en ? 'Total' : 'Итого') + '</th>' +
            infos.map(function(info) { return '<td>' + entryScGroupTotal(info, show) + '</td>'; }).join('') + '</tr></tbody></table></div></div>';
    }
    return out;
}

// Вариант 3: строки — игроки, столбцы — лунки (горизонтальная прокрутка).
function entryScGroupLayout3(infos, show, opts, order) {
    var en = entryScEn();
    var head = '<th class="esc-gh" scope="col">' + (en ? 'Player' : 'Игрок') + '</th>';
    var parRow = '';
    if (show.par) parRow = '<tr class="esc-gpar"><th class="esc-gh" scope="row">' + (en ? 'Par' : 'Пар') + '</th>';
    entryScRanges(order.length).forEach(function(rg) {
        for (var j = rg[0]; j < rg[1]; j++) {
            var h = order[j];
            var anyCur = infos.some(function(info) { return info.cells[j].cur; });
            head += '<th class="esc-gn' + (show.current && anyCur ? ' esc-cur' : '') + '" scope="col" data-sc-row="' + h + '">' + h + '</th>';
            if (show.par) parRow += '<td class="esc-gn-par">' + holePar(h) + '</td>';
        }
        if (show.subtotal) {
            head += '<th class="esc-gsubh" scope="col">' + (en ? 'Sum' : 'Итог') + '</th>';
            if (show.par) {
                var parSum = 0;
                for (var k = rg[0]; k < rg[1]; k++) parSum += holePar(order[k]);
                parRow += '<td class="esc-gn-par">' + parSum + '</td>';
            }
        }
    });
    head += '<th class="esc-gh" scope="col">' + (en ? 'Total' : 'Итого') + '</th>';
    parRow = show.par ? parRow + '<td></td></tr>' : '';
    var body = infos.map(function(info) {
        var row = '<tr data-sc-player="' + entryScEsc(info.pid) + '"><th class="esc-pl" scope="row">' + entryScPlayerHead(info, show) + '</th>';
        entryScRanges(order.length).forEach(function(rg) {
            for (var j = rg[0]; j < rg[1]; j++) {
                var c = info.cells[j], a = entryScCellAttrs(info, c, show);
                row += '<td class="esc-gc esc-gn-c' + a.cls + '"' + a.attrs + '>' + entryScScoreHTML(c, info, show) + entryScMarkerHTML(c, opts, show) + '</td>';
            }
            if (show.subtotal) {
                var st = entryScChunkStats(info.cells.slice(rg[0], rg[1]));
                row += '<td class="esc-gsubc">' + (st.count ? '<b>' + st.gross + '</b>' : '—') + '</td>';
            }
        });
        row += '<td class="esc-gtot-c">' + (show.totals ? entryScGroupTotal(info, show) : '') + '</td></tr>';
        return row;
    }).join('');
    var out = '<div class="esc-scroll" tabindex="0" aria-label="' + entryScEsc(en ? 'Group scores by players' : 'Счёт группы по игрокам') + '">' +
        '<table class="esc-gtbl esc-prow"><thead><tr>' + head + '</tr>' + parRow + '</thead><tbody>' + body + '</tbody></table></div>';
    return out;
}

// Вариант 4: отдельная карточка на каждого игрока, лунки сеткой 3 в ряд.
function entryScGroupLayout4(infos, show, opts) {
    var en = entryScEn();
    return '<div class="esc-pcards">' + infos.map(function(info) {
        var head = '<header class="esc-pc-h"><strong class="esc-pc-n">' + entryScEsc(info.name) + '</strong>' +
            (show.tee ? entryScTeePill(info.tee) : '') + (show.hcp ? entryScHcpChip(info.hcp) : '') +
            '<span class="esc-pc-t">' + (info.played ? info.gross : '—') + (show.toPar ? ' <b class="' + entryScScoreCls(info.toPar) + '">' + entryScEsc(info.played ? entryScFmtScore(info.toPar) : '—') + '</b>' : '') + '</span></header>';
        var grid = '<div class="esc-pgrid">';
        entryScChunks(info.cells).forEach(function(ch) {
            ch.cells.forEach(function(c) {
                var a = entryScCellAttrs(info, c, show);
                grid += '<div class="esc-pg' + a.cls + '"' + a.attrs + '><span class="esc-pg-no">' + c.h + '</span>' +
                    (show.par ? '<span class="esc-pg-par">P' + c.par + '</span>' : '') +
                    '<span class="esc-pg-sc">' + entryScScoreHTML(c, info, show) + '</span>' + entryScMarkerHTML(c, opts, show) + '</div>';
            });
            if (show.subtotal) grid += entryScSubLine(ch, 'esc-pg-sub');
        });
        grid += '</div>';
        var foot = (show.thru && info.thru) ? '<footer class="esc-pc-f">' + entryScEsc(info.thru) + '</footer>' : '';
        if (show.totals && show.played) foot = '<footer class="esc-pc-f">' + (en ? 'Played ' : 'Сыграно ') + info.played + '/' + info.total + (show.thru && info.thru ? ' · ' + entryScEsc(info.thru) : '') + '</footer>';
        return '<article class="esc-pcard" data-sc-player="' + entryScEsc(info.pid) + '">' + head + grid + foot + '</article>';
    }).join('') + '</div>';
}

// Вариант 5: плитка на каждую лунку, внутри — счёт каждого игрока.
function entryScGroupLayout5(infos, show, opts, order) {
    var en = entryScEn();
    var out = '<div class="esc-gtiles">';
    entryScRanges(order.length).forEach(function(rg) {
        for (var j = rg[0]; j < rg[1]; j++) {
            var h = order[j];
            var anyCur = infos.some(function(info) { return info.cells[j].cur; });
            out += '<div class="esc-gt' + (show.current && anyCur ? ' esc-cur' : '') + '" data-sc-row="' + h + '">' +
                '<div class="esc-gt-h"><b>' + h + '</b>' + (show.par ? '<span>' + (en ? 'Par ' : 'Пар ') + holePar(h) + '</span>' : '') + '</div><ul class="esc-gt-l">' +
                infos.map(function(info) {
                    var c = info.cells[j], a = entryScCellAttrs(info, c, show);
                    return '<li class="esc-gt-r' + a.cls + '"' + a.attrs + '><span class="esc-gt-n" title="' + entryScEsc(info.name) + '">' + entryScEsc(entryScShortName(info.name)) + '</span>' +
                        entryScScoreHTML(c, info, show) + entryScMarkerHTML(c, opts, show) + '</li>';
                }).join('') + '</ul></div>';
        }
        if (show.subtotal) {
            out += '<div class="esc-gt-sub"><span>' + entryScEsc(entryScTx('Лунки ', 'Holes ') + order[rg[0]] + '–' + order[rg[1] - 1]) + '</span>' +
                infos.map(function(info) {
                    var st = entryScChunkStats(info.cells.slice(rg[0], rg[1]));
                    return '<em>' + entryScEsc(entryScShortName(info.name)) + ' <b>' + (st.count ? st.gross : '—') + '</b></em>';
                }).join('') + '</div>';
        }
    });
    out += '</div>';
    if (show.totals) {
        out += '<footer class="esc-gt-f">' + infos.map(function(info) {
            return '<span><b>' + entryScEsc(entryScShortName(info.name)) + '</b> ' + (info.played ? info.gross : '—') +
                ' <i class="' + entryScScoreCls(info.toPar) + '">' + entryScEsc(info.played ? entryScFmtScore(info.toPar) : '—') + '</i></span>';
        }).join('') + '</footer>';
    }
    return out;
}

var ENTRY_SC_GROUP_LAYOUTS = {
    '1': entryScGroupLayout1,
    '2': entryScGroupLayout2,
    '3': entryScGroupLayout3,
    '4': entryScGroupLayout4,
    '5': entryScGroupLayout5
};

// Общая карточка группы: playerEntries = [[pid, player], ...].
function entryScGroupHTML(round, playerEntries, order, opts, cfg) {
    opts = opts || {};
    var r = round || {};
    playerEntries = playerEntries || [];
    order = (order && order.length) ? order : getRoundOrder(r);
    cfg = cfg || entryScResolve('general', r);
    var show = cfg.show;
    var en = entryScEn();
    var n = playerEntries.length;
    var infos = playerEntries.map(function(pe) { return entryScPlayerInfo(pe[0], pe[1] || {}, r, order, opts); });
    var countTxt = en ? (n + ' ' + (n === 1 ? 'player' : 'players')) : (n + ' ' + pluralN(n, 'игрок', 'игрока', 'игроков'));
    var title = (en ? 'Group scorecard' : 'Общая карточка') + ' · ' + countTxt;
    var fmtTxt = '';
    if (show.format) {
        try { fmtTxt = typeof pestovoRoundFormatBadge === 'function' ? pestovoRoundFormatBadge(r, 'Stroke Play') : (r.format || ''); } catch (e) { fmtTxt = r.format || ''; }
    }
    var head = '<header class="esc-head esc-ghead"><strong><i class="fas fa-users" aria-hidden="true"></i> ' + entryScEsc(title) + '</strong>' +
        (fmtTxt ? '<span class="esc-format">' + entryScEsc(fmtTxt) + '</span>' : '') +
        (opts.showMarker && show.legend ? buildDualScorecardLegendHTML() : '') + '</header>';
    var layout = ENTRY_SC_GROUP_LAYOUTS[cfg.variant] || entryScGroupLayout1;
    var thru = '';
    if (show.thru && cfg.variant !== '4') {
        thru = '<footer class="esc-gfoot">' + infos.map(function(info) {
            return '<span class="esc-thru"><b>' + entryScEsc(info.name) + ':</b> ' + entryScEsc(info.thru || '') + '</span>';
        }).join('') + '</footer>';
    }
    return '<section class="esc esc-general esc-v' + cfg.variant + ' esc-sz-' + cfg.size + '" data-sc-kind="general" data-sc-variant="' + cfg.variant + '" data-sc-players="' + n + '" style="--esc-n:' + n + '" aria-label="' + entryScEsc(title) + '">' +
        head + '<div class="esc-body">' + layout(infos, show, opts, order) + '</div>' + thru + '</section>';
}

// Единая точка для экранов ввода: один игрок → счётная карточка по лункам,
// два и больше → общая карточка группы. Список игроков как в generateGroupHoleTableHTML.
function pestovoEntryRoundCardHTML(round, opts) {
    opts = opts || {};
    var r = round || {};
    var entries = Object.entries(r.players || {}).filter(function(pe) {
        return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name));
    });
    if (!entries.length) return '';
    var order = getRoundOrder(r);
    if (entries.length === 1) {
        return entryScHoleHTML(entries[0][1], r, Object.assign({}, opts, { playerId: entries[0][0], order: order }), entryScResolve('hole', r));
    }
    return entryScGroupHTML(r, entries, order, opts, entryScResolve('general', r));
}

// Живая подписка на settings/entry_scorecard_display (как у остальных настроек экранов).
function initEntryScorecardSettings() {
    if (typeof db === 'undefined' || !db) return;
    var ref = db.ref(ENTRY_SC_FIREBASE);
    var receive = function(snapshot) {
        var value = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null;
        setEntryScorecardSettings(value);
    };
    if (typeof bindRealtimeValue === 'function') bindRealtimeValue('entry-scorecard-display', ref, receive);
    else ref.on('value', receive);
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        try { initEntryScorecardSettings(); } catch (e) { console.warn('[entry-sc] init failed', e); }
    });
}
if (typeof window !== 'undefined') {
    window.ENTRY_SC_VARIANT_META = ENTRY_SC_VARIANT_META;
    window.ENTRY_SC_SHOW_KEYS = ENTRY_SC_SHOW_KEYS;
    window.ENTRY_SC_SHOW_META = ENTRY_SC_SHOW_META;
    window.ENTRY_SC_SIZE_META = ENTRY_SC_SIZE_META;
    window.normalizeEntryScorecardSettings = normalizeEntryScorecardSettings;
    window.getEntryScorecardSettings = getEntryScorecardSettings;
    window.setEntryScorecardSettings = setEntryScorecardSettings;
    window.entryScResolve = entryScResolve;
    window.entryScHoleHTML = entryScHoleHTML;
    window.entryScGroupHTML = entryScGroupHTML;
    window.pestovoEntryRoundCardHTML = pestovoEntryRoundCardHTML;
    window.pestovoEntryCardsInto = pestovoEntryCardsInto;
    window.initEntryScorecardSettings = initEntryScorecardSettings;
}
