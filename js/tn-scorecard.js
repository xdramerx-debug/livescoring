// ==========================================================
// СЧЁТНАЯ КАРТОЧКА ИГРОКА ИЗ ЛИДЕРБОРДА ТУРНИРА (tournaments.html)
// ----------------------------------------------------------
// На странице «Турниры» игрок открывает live-лидерборд своего турнира.
// Клик по строке игрока показывает его счётную карточку — посчётно, по
// лункам, с гроссом/нетто/стейблфордом, маркиром и зачётной группой.
//
// Оформление выбирает администратор в админ-панели, вкладка «Данные»
// (settings/tn_scorecard_variant), три варианта:
//   1 · Официальный бланк — классическая карточка с лунками, паром,
//       индексом, нетто и очков стейблфорда (как бумажный бланк клуба);
//   2 · Плитки лунок — крупные плитки по лункам с цветом результата;
//   3 · Турнирная сводка — шапка-«табло» с местом, группой и лентой счёта.
//
// Данные карточку предоставляет js/tournaments.js: он строит их из того же
// снапшота раундов, что и лидерборд, поэтому карточка живёт в реальном времени
// и не делает отдельных запросов.
// ==========================================================
'use strict';

var tnScState = {
    tnId: null,
    key: null,
    cards: {},       // tnId → { fioKey: cardData }
    variant: null    // локальное переопределение варианта (кнопки в модалке)
};

function tnScL(ru, en) {
    return (typeof currentLang !== 'undefined' && currentLang === 'en') ? en : ru;
}
function tnScEsc(v) {
    if (typeof escapeHtml === 'function') return escapeHtml(v == null ? '' : String(v));
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function tnScNum(v) {
    var n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
}
function tnScHcp(v) {
    return (typeof fmtExactHcp === 'function') ? fmtExactHcp(v) : String(v == null ? '—' : v);
}
function tnScTee(code) {
    if (typeof fmtTeePill === 'function') { try { return fmtTeePill(code); } catch (e) {} }
    var t = (typeof TEES !== 'undefined') ? TEES : {};
    return '<span>' + tnScEsc(t[code] || code || '—') + '</span>';
}

// Лунки раунда в порядке игры (для шотгана — от стартовой лунки).
function tnScOrder(round) {
    if (typeof getRoundOrder === 'function') {
        try { return getRoundOrder(round); } catch (e) {}
    }
    return (typeof roundHoles === 'function') ? roundHoles(round && round.startHole, round && round.holeRange) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
}
function tnScPar(h) { return (typeof holePar === 'function') ? holePar(h) : 4; }
function tnScSi(h) { return (typeof holeHcp === 'function') ? holeHcp(h) : h; }
function tnScStrokes(fieldHcp, si) {
    // Сколько ударов «снимает» гандикап на этой лунке (WHS-деление по индексу).
    var fh = tnScNum(fieldHcp);
    if (fh > 0) return Math.floor(fh / 18) + (si <= (fh % 18) ? 1 : 0);
    if (fh < 0) {
        var abs = Math.abs(fh);
        return -(Math.floor(abs / 18) + ((19 - si) <= (abs % 18) ? 1 : 0));
    }
    return 0;
}
function tnScNet(strokes, par, si, fieldHcp) {
    if (typeof calcNettScore === 'function') {
        try { return calcNettScore(strokes, par, si, fieldHcp); } catch (e) {}
    }
    return strokes - tnScStrokes(fieldHcp, si);
}
function tnScStbl(strokes, h, fieldHcp) {
    if (typeof stablefordField === 'function') {
        try { return stablefordField(strokes, h, fieldHcp); } catch (e) {}
    }
    return 0;
}
// Цвет лунки по результату относительно пара.
function tnScResultClass(strokes, par) {
    var d = strokes - par;
    if (strokes <= 0) return 'na';
    if (d <= -2) return 'eagle';
    if (d === -1) return 'birdie';
    if (d === 0) return 'par';
    if (d === 1) return 'bogey';
    return 'bogey2';
}
function tnScFmtPlus(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return v > 0 ? '+' + v : (v === 0 ? 'E' : String(v));
}

// ── Реестр карточек открытого лидерборда ──
function tnScSetCards(tnId, map) {
    tnScState.cards[tnId] = map || {};
}
function tnScGetCard(tnId, key) {
    var map = tnScState.cards[tnId] || {};
    return map[key] || null;
}

// Вид по умолчанию берётся из настройки администратора; выбор стрелками в
// самой модалке действует, только пока админ не сменил настройку (globalSeen).
function tnScVariant() {
    var g = (typeof getTnCardVariant === 'function') ? getTnCardVariant() : '1';
    if (tnScState.variant) {
        if (tnScState.globalSeen && tnScState.globalSeen !== g) tnScState.variant = null;
        else return tnScState.variant;
    }
    tnScState.globalSeen = g;
    return g;
}
function tnScSetVariant(v) {
    tnScState.variant = (['1', '2', '3'].indexOf(String(v)) !== -1) ? String(v) : '1';
    tnScRerender();
}

// Открытая карточка должна перерисовываться, когда админ сменил вариант
// (global listener в utils.js) или когда пришли новые счета.
function tnScRerender() {
    if (!tnScState.tnId || !tnScState.key) return;
    var modal = (typeof document !== 'undefined') ? document.getElementById('tnsc-modal') : null;
    if (!modal || modal.classList.contains('hidden')) return;
    var card = tnScGetCard(tnScState.tnId, tnScState.key);
    var body = document.getElementById('tnsc-body');
    if (!body) return;
    if (!card) {
        body.innerHTML = '<div class="tnsc-empty">' + tnScL('Счётная карточка уже недоступна — закройте окно и откройте лидерборд заново.', 'Scorecard is no longer available — reopen the leaderboard.') + '</div>';
        return;
    }
    body.innerHTML = tnScRender(card);
}

// ── Оболочка модалки ──
function tnScOpen(tnId, key) {
    var card = tnScGetCard(tnId, key);
    var modal = document.getElementById('tnsc-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tnsc-modal';
        modal.className = 'modal hidden';
        modal.innerHTML =
            '<div class="modal-bg" onclick="tnScClose()"></div>' +
            '<div class="modal-body tnsc-modal-body">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="tnScClose()"><i class="fas fa-arrow-left"></i> ' + tnScL('Назад', 'Back') + '</button>' +
            '<button type="button" class="modal-close-btn" onclick="tnScClose()">×</button>' +
            '</div>' +
            '<div id="tnsc-body" class="tnsc-scroll"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modal);
    }
    tnScState.tnId = tnId;
    tnScState.key = key;
    tnScState.variant = null; // всегда открываем вариант, выбранный админом
    var body = document.getElementById('tnsc-body');
    if (body) body.innerHTML = card ? tnScRender(card)
        : '<div class="tnsc-empty">' + tnScL('Счётная карточка не найдена.', 'Scorecard not found.') + '</div>';
    modal.classList.remove('hidden');
    if (body) body.scrollTop = 0;
    try { if (typeof vib === 'function') vib(20); } catch (e) {}
}
function tnScClose() {
    var modal = document.getElementById('tnsc-modal');
    if (modal) modal.classList.add('hidden');
    tnScState.tnId = null;
    tnScState.key = null;
}
// Esc закрывает карточку (как и другие модалки сайта).
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', function(ev) {
        if (ev && (ev.key === 'Escape' || ev.keyCode === 27)) {
            var m = document.getElementById('tnsc-modal');
            if (m && !m.classList.contains('hidden')) tnScClose();
        }
    });
}

// ── Шапка карточки (общая для всех вариантов) ──
function tnScHeadHtml(card, variant) {
    var variants = ['1', '2', '3'];
    var switcher = '<div class="tnsc-variants">' +
        '<span class="tnsc-variants-lbl">' + tnScL('Вид карточки', 'Card style') + '</span>' +
        variants.map(function(v) {
            return '<button type="button" class="tnsc-var' + (v === variant ? ' on' : '') + '" onclick="tnScSetVariant(\'' + v + '\')" title="' +
                tnScEsc(tnScVariantTitle(v)) + '">' + v + '</button>';
        }).join('') +
        '</div>';
    var meta = '';
    if (card.divName) meta += '<span class="tnsc-chip tnsc-chip-div"><i class="fas fa-layer-group"></i> ' + tnScL('Группа:', 'Group:') + ' ' + tnScEsc(card.divName) + '</span>';
    if (card.groupLabel) meta += '<span class="tnsc-chip tnsc-chip-flight"><i class="fas fa-users"></i> ' + tnScEsc(card.groupLabel) + (card.startHole ? ' · ' + tnScL('лунка ', 'hole ') + card.startHole : '') + '</span>';
    if (card.startTimeTxt) meta += '<span class="tnsc-chip"><i class="fas fa-clock"></i> ' + tnScEsc(card.startTimeTxt) + '</span>';
    if (card.teeTxt) meta += '<span class="tnsc-chip">' + tnScL('ТИ:', 'Tees:') + ' ' + card.teeTxt + '</span>';
    if (card.markerName) meta += '<span class="tnsc-chip"><i class="fas fa-user-check"></i> ' + tnScL('маркирует: ', 'marks: ') + tnScEsc(card.markerName) + '</span>';

    var hcpLine = '';
    if (card.hcpRaw !== null && card.hcpRaw !== undefined && card.effHcp !== null && card.effHcp !== undefined &&
        Math.abs(parseFloat(card.effHcp) - parseFloat(card.hcpRaw)) >= 0.05) {
        hcpLine = '<span class="tnsc-hcp">' + tnScL('Точный', 'Exact') + ' <b>' + tnScHcp(card.hcpRaw) + '</b>' +
            ' <span class="tnsc-cut">✂ ' + tnScHcp(card.effHcp) + '</span></span>';
    } else {
        hcpLine = '<span class="tnsc-hcp">' + tnScL('Точный', 'Exact') + ' <b>' + tnScHcp(card.effHcp != null ? card.effHcp : card.hcpRaw) + '</b>' +
            (card.fieldHcp !== null && card.fieldHcp !== undefined ? ' · ' + tnScL('Игровой', 'Course') + ' <b>' + (typeof fmtFieldHcp === 'function' ? fmtFieldHcp(card.fieldHcp) : card.fieldHcp) + '</b>' : '') +
            '</span>';
    }

    return '<div class="tnsc-head">' +
        '<div class="tnsc-head-main">' +
        '<div class="tnsc-name">' + tnScEsc(card.name || '—') + (card.position ? ' <span class="tnsc-pos">' + (card.position === 1 ? '🥇' : card.position === 2 ? '🥈' : card.position === 3 ? '🥉' : '') + ' ' + card.position + '</span>' : '') + '</div>' +
        '<div class="tnsc-sub">' + tnScEsc(card.tournamentName || '') + (card.dateTxt ? ' · ' + tnScEsc(card.dateTxt) : '') + ' · ' + tnScEsc(card.format || 'Stroke Play') + '</div>' +
        '<div class="tnsc-meta">' + meta + '</div>' +
        '</div>' +
        '<div class="tnsc-head-right">' + hcpLine + switcher + '</div>' +
        '</div>';
}
function tnScVariantTitle(v) {
    if (v === '2') return tnScL('2 · Плитки лунок', '2 · Hole tiles');
    if (v === '3') return tnScL('3 · Турнирная сводка', '3 · Tournament board');
    return tnScL('1 · Официальный бланк', '1 · Official card');
}

// ── Итоговая строка (общая) ──
function tnScTotalsHtml(card) {
    var t = card.totals || {};
    function tile(label, value, cls) {
        return '<div class="tnsc-tile' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><b>' + value + '</b></div>';
    }
    return '<div class="tnsc-tiles">' +
        tile(tnScL('Лунок', 'Holes'), (t.holes || 0) + '/18', '') +
        tile(tnScL('Гросс', 'Gross'), (t.gross || 0) + (t.toPar !== null && t.toPar !== undefined ? ' (' + tnScFmtPlus(t.toPar) + ')' : ''), '') +
        tile(tnScL('Нетто', 'Net'), (t.net || 0) + (t.netToPar !== null && t.netToPar !== undefined ? ' (' + tnScFmtPlus(t.netToPar) + ')' : ''), 'tnsc-tile-net') +
        tile(tnScL('Стейблфорд', 'Stableford'), (t.stbl || 0), 'tnsc-tile-stbl') +
        tile(tnScL('Бёрди · Иглы', 'Birdies · Eagles'), (t.birdies || 0) + ' · ' + (t.eagles || 0), '') +
        '</div>';
}

// ── ВАРИАНТ 1 · Официальный бланк ──
function tnScRenderV1(rounds) {
    return rounds.map(function(rd) {
        var order = rd.order;
        var front = order.slice(0, 9);
        var back = order.slice(9);
        var hasBack = back.length > 0;
        // Строка таблицы: метка + ячейки первых девяти + «Аут» + ячейки
        // вторых девяти + «Ин» + «Итого». Ячейки приходят уже подписанными.
        function row(label, cells, outV, inV, totV, cls) {
            var html = '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="tnsc-lbl">' + label + '</td>';
            for (var i = 0; i < front.length; i++) {
                html += '<td' + (i === 8 && hasBack ? ' class="tnsc-sep"' : '') + '>' + (cells[i] === '' || cells[i] == null ? '' : cells[i]) + '</td>';
            }
            html += '<td class="tnsc-tot">' + (hasBack ? outV : '') + '</td>';
            if (hasBack) {
                for (var j = 9; j < order.length; j++) {
                    html += '<td' + (j === 9 ? ' class="tnsc-sep"' : '') + '>' + (cells[j] === '' || cells[j] == null ? '' : cells[j]) + '</td>';
                }
                html += '<td class="tnsc-tot">' + inV + '</td>';
            }
            html += '<td class="tnsc-tot tnsc-tot-main">' + totV + '</td></tr>';
            return html;
        }
        function sums(list, fn) {
            var o = 0, i = 0;
            list.forEach(function(h) {
                var v = fn(h) || 0;
                if (front.indexOf(h) !== -1) o += v; else i += v;
            });
            return { out: o, inn: i, tot: o + i };
        }
        var parS = sums(order, function(h) { return tnScPar(h); });
        var scoreS = sums(order, function(h) { return tnScNum(rd.scores[h]) || 0; });
        var netS = sums(order, function(h) {
            var s = tnScNum(rd.scores[h]);
            return s > 0 ? tnScNet(s, tnScPar(h), tnScSi(h), rd.fieldHcp) : 0;
        });
        var stblS = sums(order, function(h) {
            var s = tnScNum(rd.scores[h]);
            return s > 0 ? tnScStbl(s, h, rd.fieldHcp) : 0;
        });

        var head = '<tr><td class="tnsc-lbl">' +
            (rd.startHole > 1 && hasBack ? tnScL('Лунка · порядок игры', 'Hole · play order') : tnScL('Лунка', 'Hole')) + '</td>';
        front.forEach(function(h, idx) { head += '<th' + (idx === 8 && hasBack ? ' class="tnsc-sep"' : '') + '>' + h + '</th>'; });
        if (hasBack) {
            head += '<th class="tnsc-tot">' + tnScL('Аут', 'Out') + '</th>';
            back.forEach(function(h, idx) { head += '<th' + (idx === 0 ? ' class="tnsc-sep"' : '') + '>' + h + '</th>'; });
            head += '<th class="tnsc-tot">' + tnScL('Ин', 'In') + '</th>';
        }
        head += '<th class="tnsc-tot tnsc-tot-main">' + tnScL('Итого', 'Total') + '</th></tr>';

        var html = '<div class="tnsc-paper">';
        if (rd.label) html += '<div class="tnsc-round-label">' + tnScEsc(rd.label) + '</div>';
        html += '<div class="tnsc-table-wrap"><table class="tnsc-table">' +
            '<thead>' + head + '</thead><tbody>' +
            row(tnScL('Пар', 'Par'), order.map(function(h) { return tnScPar(h); }), parS.out, parS.inn, parS.tot, 'tnsc-row-par') +
            row(tnScL('Индекс', 'HCP index'), order.map(function(h) { return tnScSi(h); }), '—', '—', '—', 'tnsc-row-si') +
            row(tnScL('HCP (удары)', 'HCP shots'), order.map(function(h) {
                var st = tnScStrokes(rd.fieldHcp, tnScSi(h));
                return st > 0 ? '−' + st : (st < 0 ? '+' + Math.abs(st) : '·');
            }), '', '', '', 'tnsc-row-strokes') +
            row(tnScL('Счёт', 'Score'), order.map(function(h) { var s = tnScNum(rd.scores[h]); return s > 0 ? s : ''; }), scoreS.out, scoreS.inn, scoreS.tot, 'tnsc-row-score') +
            row(tnScL('Нетто', 'Net'), order.map(function(h) {
                var s = tnScNum(rd.scores[h]);
                return s > 0 ? tnScNet(s, tnScPar(h), tnScSi(h), rd.fieldHcp) : '';
            }), netS.out, netS.inn, netS.tot, 'tnsc-row-net') +
            row(tnScL('Стейблфорд', 'Stableford'), order.map(function(h) {
                var s = tnScNum(rd.scores[h]);
                return s > 0 ? tnScStbl(s, h, rd.fieldHcp) : '';
            }), stblS.out, stblS.inn, stblS.tot, 'tnsc-row-stbl') +
            '</tbody></table></div></div>';
        return html;
    }).join('');
}

// ── ВАРИАНТ 2 · Плитки лунок ──
function tnScRenderV2(rounds) {
    return rounds.map(function(rd) {
        var tiles = rd.order.map(function(h) {
            var s = tnScNum(rd.scores[h]);
            var par = tnScPar(h);
            var cls = s > 0 ? tnScResultClass(s, par) : 'na';
            var net = s > 0 ? tnScNet(s, par, tnScSi(h), rd.fieldHcp) : null;
            var stbl = s > 0 ? tnScStbl(s, h, rd.fieldHcp) : null;
            return '<div class="tnsc-tile-h ' + cls + '">' +
                '<div class="tnsc-tile-top"><span class="tnsc-tile-no">' + h + '</span>' +
                '<span class="tnsc-tile-par">PAR ' + par + '</span></div>' +
                '<div class="tnsc-tile-score">' + (s > 0 ? s : '·') + '</div>' +
                '<div class="tnsc-tile-foot">' +
                (net !== null ? '<span>' + tnScL('нетто', 'net') + ' ' + net + '</span>' : '<span>—</span>') +
                (stbl !== null ? '<span class="tnsc-tile-stbl">' + stbl + ' ✦</span>' : '') +
                '</div></div>';
        }).join('');
        var outTxt = '<div class="tnsc-tile-sum"><span>' + tnScL('Гросс', 'Gross') + '</span><b>' + rd.totals.gross + '</b></div>' +
            '<div class="tnsc-tile-sum"><span>±</span><b class="' + (typeof scoreClass === 'function' ? scoreClass(rd.totals.toPar) : '') + '">' + tnScFmtPlus(rd.totals.toPar) + '</b></div>' +
            '<div class="tnsc-tile-sum"><span>' + tnScL('Нетто', 'Net') + '</span><b>' + rd.totals.net + '</b></div>' +
            '<div class="tnsc-tile-sum"><span>' + tnScL('Стейблфорд', 'Stableford') + '</span><b>' + rd.totals.stbl + '</b></div>';
        return '<div class="tnsc-tiles-wrap">' +
            (rd.label ? '<div class="tnsc-round-label">' + tnScEsc(rd.label) + '</div>' : '') +
            '<div class="tnsc-grid">' + tiles + '</div>' +
            '<div class="tnsc-tiles-row">' + outTxt + '</div>' +
            '</div>';
    }).join('');
}

// ── ВАРИАНТ 3 · Турнирная сводка (лента счёта) ──
function tnScRenderV3(rounds) {
    return rounds.map(function(rd) {
        var run = 0;
        var strip = rd.order.map(function(h) {
            var s = tnScNum(rd.scores[h]);
            var par = tnScPar(h);
            var cls = s > 0 ? tnScResultClass(s, par) : 'na';
            if (s > 0) run += s - par;
            return '<div class="tnsc-strip-cell ' + cls + '">' +
                '<span class="tnsc-strip-no">' + h + '</span>' +
                '<span class="tnsc-strip-score">' + (s > 0 ? s : '·') + '</span>' +
                '<span class="tnsc-strip-run">' + (s > 0 ? tnScFmtPlus(run) : '') + '</span>' +
                '</div>';
        }).join('');
        var rows = '';
        function line(label, val, cls) {
            rows += '<div class="tnsc-line' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><b>' + val + '</b></div>';
        }
        line(tnScL('Сыграно лунок', 'Holes played'), rd.totals.holes + ' / 18');
        line(tnScL('Гросс', 'Gross'), rd.totals.gross + (rd.totals.par ? ' (' + tnScL('из', 'of') + ' ' + rd.totals.par + ')' : ''));
        line(tnScL('Относительно пара', 'To par'), tnScFmtPlus(rd.totals.toPar), 'tnsc-line-em');
        line(tnScL('Нетто', 'Net'), rd.totals.net + ' (' + tnScFmtPlus(rd.totals.netToPar) + ')');
        line(tnScL('Стейблфорд', 'Stableford'), rd.totals.stbl);
        line(tnScL('Бёрди', 'Birdies'), rd.totals.birdies);
        line(tnScL('Иглы · Орлы', 'Eagles'), rd.totals.eagles);
        if (rd.holeHcpNotes) line('HCP ' + tnScL('лунки', 'hole'), rd.holeHcpNotes);
        var best = rd.best || null;
        return '<div class="tnsc-board">' +
            (rd.label ? '<div class="tnsc-round-label">' + tnScEsc(rd.label) + '</div>' : '') +
            '<div class="tnsc-strip">' + strip + '</div>' +
            '<div class="tnsc-board-cols"><div class="tnsc-lines">' + rows + '</div>' +
            (best ? '<div class="tnsc-best"><span>' + tnScL('Лучшая лунка', 'Best hole') + '</span><b>' + best.hole + ' · ' + best.text + '</b>' +
                '<div class="tnsc-best-note">' + tnScEsc(best.note) + '</div></div>' : '') +
            '</div></div>';
    }).join('');
}

// Собирает «игровые» данные раунда для одного игрока.
function tnScRoundBlock(rd, opts) {
    opts = opts || {};
    var scores = rd.scores || {};
    var order = tnScOrder(rd.round || {});
    var gross = 0, parSum = 0, netSum = 0, stbl = 0, birdies = 0, eagles = 0;
    var best = null;
    order.forEach(function(h) {
        var s = tnScNum(scores[h]);
        if (s <= 0) return;
        var par = tnScPar(h);
        gross += s; parSum += par;
        netSum += tnScNet(s, par, tnScSi(h), rd.fieldHcp);
        stbl += tnScStbl(s, h, rd.fieldHcp);
        var d = s - par;
        if (d === -1) birdies++;
        if (d <= -2) eagles++;
        if (!best || d < best.diff) best = { hole: h, diff: d };
    });
    var holesPlayed = order.filter(function(h) { return tnScNum(scores[h]) > 0; }).length;
    var bestText = '', bestNote = '';
    if (best) {
        var diff = best.diff;
        bestText = (diff === 0 ? tnScL('пар', 'par') : diff < 0 ? (diff === -1 ? tnScL('бёрди', 'birdie') : tnScL('игл', 'eagle')) : (diff === 1 ? tnScL('боги', 'bogey') : '+' + diff));
        bestNote = tnScL('PAR ' + tnScPar(best.hole) + ' · счёт ' + tnScNum(scores[best.hole]), 'PAR ' + tnScPar(best.hole) + ' · score ' + tnScNum(scores[best.hole]));
    }
    return {
        order: order,
        scores: scores,
        fieldHcp: rd.fieldHcp,
        startHole: tnScNum((rd.round && rd.round.startHole) || 1) || 1,
        label: rd.label || '',
        totals: {
            holes: holesPlayed, gross: gross, par: parSum, toPar: holesPlayed ? gross - parSum : null,
            net: netSum, netToPar: holesPlayed ? netSum - parSum : null, stbl: stbl,
            birdies: birdies, eagles: eagles
        },
        best: best ? { hole: best.hole, text: bestText, note: bestNote } : null,
        holeHcpNotes: ''
    };
}

// ── Сборка модалки ──
function tnScRender(card) {
    var variant = tnScVariant();
    var roundsHtml = '';
    if (variant === '2') roundsHtml = tnScRenderV2(card.rounds);
    else if (variant === '3') roundsHtml = tnScRenderV3(card.rounds);
    else roundsHtml = tnScRenderV1(card.rounds);

    var foot = '';
    if (card.cutNote) foot += '<div class="tnsc-note"><i class="fas fa-scissors"></i> ' + tnScEsc(card.cutNote) + '</div>';
    if (card.markerNote) foot += '<div class="tnsc-note"><i class="fas fa-user-check"></i> ' + tnScEsc(card.markerNote) + '</div>';
    foot += '<div class="tnsc-foot">' + tnScL('Пестово · лайв-скоринг', 'Pestovo · live scoring') +
        (card.roundLabelPrefix ? ' · ' + tnScEsc(card.roundLabelPrefix) : '') + '</div>';

    return '<div class="tnsc-wrap tnsc-v' + variant + '">' +
        tnScHeadHtml(card, variant) +
        tnScTotalsHtml(card) +
        '<div class="tnsc-rounds">' + roundsHtml + '</div>' +
        foot +
        '</div>';
}

if (typeof window !== 'undefined') {
    window.tnScOpen = tnScOpen;
    window.tnScClose = tnScClose;
    window.tnScSetCards = tnScSetCards;
    window.tnScGetCard = tnScGetCard;
    window.tnScRender = tnScRender;
    window.tnScRerender = tnScRerender;
    window.tnScSetVariant = tnScSetVariant;
    window.tnScRoundBlock = tnScRoundBlock;
}
