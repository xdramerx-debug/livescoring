// js/utils-scorecards.js — HTML счётных карточек (экран / бумага).
// Вынесено из js/utils.js, чтобы парсер на страницах входа/офлайна
// не разжёвывал ~25 КБ разметки карточек. Грузится сразу после utils.js.
// Функции остаются глобальными — вызывающий код не менялся.
// Shared screen-only scorecard. Printing and social PNG use their own renderers.
function renderClubScorecard(player, round, opts) {
    opts = opts || {};
    var p = player || {}, r = round || {};
    var en = currentLang === 'en';
    var pid = opts.playerId || '';
    if (!pid && r.players) Object.keys(r.players).some(function(id) { if (r.players[id] === p) { pid = id; return true; } return false; });
    var order = opts.order || getRoundOrder(r);
    var scores = p.scores || {};
    var hcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
    var tee = p.tee || r.tee || 'wh';
    if (typeof tee !== 'string' || !Object.prototype.hasOwnProperty.call(TEES, tee)) tee = 'wh';
    var name = typeof privacyDisplayName === 'function' ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
    var stats = calcRoundStats(scores, hcp, p.exactHcp || 0, order);
    var current = playerCurrentHole(r, pid, p, stats, order);
    var labels = [en ? 'Hole' : 'Лунка', en ? 'Par' : 'Пар', en ? 'Score' : 'Счёт'];
    if (opts.showMarker) labels.push(en ? 'Marker' : 'Маркер');
    var completed = isCompletedScorecard(r);
    var html = '<section class="club-sc" data-sc-completed="' + completed + '" data-sc-view="' + getRoundScorecardView(r) + '" aria-label="' + (en ? 'Scorecard' : 'Счётная карточка') + '">';
    if (!completed) html += '<header class="club-sc-head"><strong>' + escapeHtml(name) + '</strong> ' + fmtTeePill(tee) + '<span>HCP ' + escapeHtml(fmtFieldHcp(hcp)) + '</span></header>';
    if (opts.label) html += '<div class="club-sc-caption">' + escapeHtml(opts.label) + '</div>';
    if (completed) html += '<div class="sc-round-summary">' + scorecardPlayerSummaryHTML(name, tee, hcp, stats, order.length) + '</div>' + scorecardDetailsStartHTML();
    var total = 0, played = 0;
    // Keep the actual playing order, including shotgun starts and nine-hole rounds.
    for (var offset = 0; offset < order.length; offset += 9) {
        var holes = order.slice(offset, offset + 9), gross = 0, count = 0;
        html += '<div class="club-sc-side"><div class="club-sc-caption">' + (en ? 'Holes ' : 'Лунки ') + holes[0] + '–' + holes[holes.length - 1] + '</div>';
        html += '<div class="club-sc-scroll" tabindex="0" aria-label="' + (en ? 'Hole results' : 'Результаты по лункам') + '"><div class="club-sc-grid" style="--sc-holes:' + holes.length + '">';
        html += '<div class="club-sc-labels">' + labels.map(function(label) { return '<div>' + label + '</div>'; }).join('') + '</div>';
        holes.forEach(function(h) {
            var s = parseInt(scores[h], 10) || 0, par = holePar(h);
            if (s > 0) { gross += s; count++; }
            var verify = getHoleVerifyState(p, h);
            var cls = verify === 'mismatch' ? ' cell-mismatch' : '';
            if (h === current) cls += ' sc-cur-tile';
            var strokes = hcpStrokesOnHole(h, hcp);
            var marks = hcpStrokesMarksHTML(hcp, h);
            if (marks) marks = '<span class="club-sc-handicap" role="img" aria-label="' + (en ? 'Handicap strokes: ' : 'Удары форы: ') + strokes + '">' + marks + '</span>';
            var values = [h, par, s > 0 ? s : '—'];
            if (opts.showMarker) {
                var mk = opts.markerScores ? parseInt(opts.markerScores[h], 10) || 0 : getPlayerMarkerScoreForHole(p, h).score;
                values.push(mk > 0 ? mk : '—');
                if (s > 0 && mk > 0 && s !== mk && cls.indexOf('cell-mismatch') < 0) cls += ' cell-mismatch';
            }
            html += '<div class="club-sc-hole' + cls + '" data-sc-player="' + escapeHtml(pid) + '" data-sc-hole="' + h + '"' + (h === current ? ' data-sc-current="1"' : '') + '>';
            values.forEach(function(value, index) {
                var cellClass = ['number', 'par', 'score', 'marker'][index];
                html += '<div class="club-sc-cell club-sc-' + cellClass + (index === 2 && s > 0 ? ' ' + holeResClass(s, par) : '') + '"><span class="club-sc-cell-label">' + labels[index] + '</span><span class="club-sc-value">' + value + (index === 2 ? marks : '') + '</span></div>';
            });
            html += '</div>';
        });
        total += gross; played += count;
        html += '</div></div><div class="club-sc-subtotal">' + (en ? 'Subtotal' : 'Промежуточный итог') + ': <b>' + (count ? gross : '—') + '</b></div></div>';
    }
    html += '<footer class="club-sc-total"><span>Gross <b>' + (played ? total : '—') + '</b></span><span>' + (en ? 'Played ' : 'Сыграно ') + played + '/' + order.length + '</span></footer>';
    if (completed) html += '</div></details>';
    return html + '</section>';
}


function renderUnifiedGroupScorecardHTML(r, playerEntries, order, opts) {
    opts = opts || {};
    r = r || {};
    playerEntries = playerEntries || [];
    order = (order && order.length) ? order : getRoundOrder(r);
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var view = '1';
    try { view = getRoundScorecardView(r); } catch (e) { view = '1'; }
    var n = playerEntries.length;
    var countTxt = en
        ? (n + ' ' + (n === 1 ? 'player' : 'players'))
        : (n + ' ' + pluralN(n, 'игрок', 'игрока', 'игроков'));
    var title = (en ? 'Group scorecard' : 'Общая карточка') + ' · ' + countTxt;
    var fmtTxt = '';
    try {
        fmtTxt = (typeof pestovoRoundFormatBadge === 'function')
            ? pestovoRoundFormatBadge(r, 'Stroke Play')
            : (r.format || 'Stroke Play');
    } catch (e) { fmtTxt = r.format || ''; }
    var esc = (typeof escapeHtml === 'function')
        ? escapeHtml
        : function(v) { return String(v == null ? '' : v); };
    var infos = playerEntries.map(function(pe, index) {
        var pid = pe[0], p = pe[1] || {};
        var tee = p.tee || r.tee || 'wh';
        if (typeof tee !== 'string' || (typeof TEES !== 'undefined' && !Object.prototype.hasOwnProperty.call(TEES, tee))) tee = 'wh';
        var fhcp = (p.fieldHcp !== undefined && p.fieldHcp !== null && p.fieldHcp !== '')
            ? p.fieldHcp
            : ((r.fieldHcp !== undefined && r.fieldHcp !== null) ? r.fieldHcp : 0);
        var scores = p.scores || {};
        var stats = { gross: 0, toPar: null, holesPlayed: 0, currentHole: null };
        try { stats = calcRoundStats(scores, fhcp, p.exactHcp || 0, order); } catch (e) { console.warn("[silent]", e); }
        var cur = null;
        try {
            cur = (typeof playerCurrentHole === 'function')
                ? playerCurrentHole(r, pid, p, stats, order)
                : (stats.currentHole || null);
        } catch (e) { cur = stats.currentHole || null; }
        var name = p.name || '—';
        try {
            name = (typeof privacyDisplayName === 'function')
                ? privacyDisplayName(p, pid)
                : playerDisplayName(p, pid);
        } catch (e) { console.warn("[silent]", e); }
        var thru = '';
        try {
            thru = (typeof playerHoleStatusText === 'function')
                ? playerHoleStatusText(r, pid, p, stats, order)
                : '';
        } catch (e) { console.warn("[silent]", e); }
        var parts = String(name).trim().split(/\s+/);
        var shortName = (index + 1) + '. ' + parts[0] + (parts.length > 1 ? ' ' + parts[parts.length - 1].charAt(0) + '.' : '');
        return { pid: pid, p: p, tee: tee, fhcp: fhcp, scores: scores, stats: stats, current: cur, name: name, shortName: shortName, thru: thru };
    });

    function nameHTML(name) {
        var raw = String(name || '—').replace(/\s+/g, ' ').trim() || '—';
        var parts = raw.split(' ').filter(Boolean);
        var first = parts.length > 1 ? parts.slice(0, -1).join(' ') : raw;
        var last = parts.length > 1 ? parts[parts.length - 1] : '';
        var lines = '<span class="gsg-pname-line">' + esc(first) + '</span>';
        if (last) lines += '<span class="gsg-pname-line">' + esc(last) + '</span>';
        return '<div class="gsg-pname">' + lines + '</div>';
    }
    var completed = isCompletedScorecard(r);
    var html = '<section class="club-sc club-sc-group" data-sc-completed="' + completed + '" data-sc-view="' + esc(view) + '" data-sc-players="' + n + '" aria-label="' + esc(title) + '">';
    html += '<header class="club-sc-head club-sc-group-head"><strong><i class="fas fa-users"></i> ' + esc(title) + '</strong>';
    if (fmtTxt) html += '<span class="gsg-format">' + esc(fmtTxt) + '</span>';
    if (opts.showMarker) html += buildDualScorecardLegendHTML();
    html += '</header>';
    if (opts.label) html += '<div class="club-sc-caption">' + esc(opts.label) + '</div>';
    html += '<div class="sc-round-summary">' + infos.map(function(inf, i) { return scorecardPlayerSummaryHTML(inf.name, inf.tee, inf.fhcp, completed ? inf.stats : null, order.length, i + 1); }).join('') + '</div>';
    if (completed) html += scorecardDetailsStartHTML();
    html += '<div class="club-sc-group-scroll" tabindex="0" aria-label="' + esc(en ? 'Group scores by holes' : 'Счёт группы по лункам') + '">';
    html += '<table class="gsg-table" style="min-width:' + (78 + n * 118) + 'px"><thead><tr>';
    html += '<th class="gsg-hole" scope="col">' + esc(en ? 'Hole · Par' : 'Лунка · Пар') + '</th>';
    infos.forEach(function(inf) {
        html += '<th class="gsg-player" scope="col" data-sc-player="' + esc(inf.pid) + '" title="' + esc(inf.name) + '">' + nameHTML(inf.shortName) + '</th>';
    });
    html += '</tr></thead><tbody>';

    // Порядок игры сохраняем как есть (включая шотган и девятки):
    // строки идут в порядке order, промежуточный итог — после каждых 9 сыгранных.
    var gridCells = {};
    var hasChunks = order.length > 9;
    for (var offset = 0; offset < order.length; offset += 9) {
        var holes = order.slice(offset, offset + 9);
        if (hasChunks) {
            html += '<tr class="gsg-chunk"><td class="gsg-hole" colspan="' + (n + 1) + '">' +
                esc((en ? 'Holes ' : 'Лунки ') + holes[0] + '–' + holes[holes.length - 1]) + '</td></tr>';
        }
        holes.forEach(function(h) {
            var par = 4;
            try { par = holePar(h); } catch (e) { console.warn("[silent]", e); }
            var anyCur = infos.some(function(inf) { return inf.current === h; });
            html += '<tr class="gsg-row' + (anyCur ? ' gsg-cur-row' : '') + '" data-sc-hole="' + h + '">';
            html += '<td class="gsg-hole"><span class="gsg-hole-num">#' + h + '</span> <span class="gsg-hole-par">P' + par + '</span></td>';
            infos.forEach(function(inf) {
                var s = parseInt(inf.scores[h], 10) || 0;
                var scoreCls = 'r-empty';
                try { scoreCls = s > 0 ? holeResClass(s, par) : 'r-empty'; } catch (e) { console.warn("[silent]", e); }
                var verify = 'none';
                try { verify = (typeof getHoleVerifyState === 'function') ? getHoleVerifyState(inf.p, h) : 'none'; } catch (e) { console.warn("[silent]", e); }
                var isCur = inf.current === h;
                var tdCls = 'gsg-cell' + (isCur ? ' gsg-cur' : '') + (verify === 'mismatch' ? ' cell-mismatch' : '');
                var strokes = 0, marks = '';
                try { strokes = hcpStrokesOnHole(h, inf.fhcp); marks = hcpStrokesMarksHTML(inf.fhcp, h); } catch (e) { console.warn("[silent]", e); }
                var hcpBadge = '';
                if (marks) hcpBadge = '<span class="club-sc-handicap" role="img" aria-label="' + esc((en ? 'Handicap strokes: ' : 'Удары форы: ') + strokes) + '">' + marks + '</span>';
                var mkHtml = '';
                if (opts.showMarker) {
                    var mk = { score: 0 };
                    try { mk = getPlayerMarkerScoreForHole(inf.p, h); } catch (e) { console.warn("[silent]", e); }
                    if (mk && mk.score >= 1) {
                        var mm = (s >= 1 && s !== mk.score);
                        if (mm && tdCls.indexOf('cell-mismatch') < 0) tdCls += ' cell-mismatch';
                        var mkTip = (en ? 'Marker ' : 'Маркер ') + mk.score;
                        // Без префикса «М:». Совпадение — точка у цифры игрока,
                        // расхождение — цифра маркера другим цветом и точка.
                        if (s >= 1 && !mm) {
                            mkHtml = '<span class="gsg-marker gsg-marker-ok" title="' + esc(mkTip) + '" aria-label="' + esc(mkTip) + '"><i class="gsg-mk-dot" aria-hidden="true"></i></span>';
                        } else {
                            mkHtml = '<span class="gsg-marker' + (mm ? ' mk-mismatch' : '') + '" title="' + esc(mkTip) + '" aria-label="' + esc(mkTip) + '"><i class="gsg-mk-dot" aria-hidden="true"></i>' + mk.score + '</span>';
                        }
                    }
                }
                var scoreHtml = '<span class="gsg-score ' + scoreCls + '"><span class="gsg-val">' + (s > 0 ? s : '—') + hcpBadge + '</span></span>' + mkHtml;
                var cellAttrs = ' data-sc-player="' + esc(inf.pid) + '" data-sc-hole="' + h + '"' + (isCur ? ' data-sc-current="1"' : '');
                html += '<td class="' + tdCls + '"' + cellAttrs + '>' + scoreHtml + '</td>';
                if (!gridCells[h]) gridCells[h] = [];
                gridCells[h].push('<div class="club-sc-cell gsg-grid-score ' + tdCls + '"' + cellAttrs + '><span class="club-sc-cell-label" title="' + esc(inf.name) + '">' + esc(inf.shortName) + '</span><span>' + scoreHtml + '</span></div>');
            });
            html += '</tr>';
        });
        if (hasChunks) {
            html += '<tr class="gsg-subtotal"><td class="gsg-hole gsg-sub-lbl">' +
                esc((en ? 'Holes ' : 'Лунки ') + holes[0] + '–' + holes[holes.length - 1]) + '</td>';
            infos.forEach(function(inf) {
                var gross = 0, cnt = 0, pPar = 0;
                holes.forEach(function(h) {
                    var s = parseInt(inf.scores[h], 10) || 0;
                    if (s > 0) {
                        gross += s; cnt++;
                        try { pPar += holePar(h); } catch (e) { console.warn("[silent]", e); }
                    }
                });
                var cell = '—';
                if (cnt > 0) {
                    var d = gross - pPar, dTxt = String(d), dCls = '';
                    try { dTxt = fmtScore(d); dCls = scoreClass(d); } catch (e) { console.warn("[silent]", e); }
                    cell = '<b>' + gross + '</b> <small class="' + dCls + '">' + esc(dTxt) + '</small>';
                }
                html += '<td class="gsg-cell gsg-sub">' + cell + '</td>';
            });
            html += '</tr>';
        }
    }

    var totPar = 0;
    order.forEach(function(h) { try { totPar += holePar(h); } catch (e) { console.warn("[silent]", e); } });
    var totLbl = 'Итого';
    try { totLbl = t('total'); } catch (e) { console.warn("[silent]", e); }
    html += '<tr class="gsg-total"><td class="gsg-hole gsg-total-lbl">' + esc(totLbl) + ' <small>(' + totPar + ')</small></td>';
    infos.forEach(function(inf) {
        var st = inf.stats || {};
        var played = st.holesPlayed || 0;
        var toParT = '—', toParCls = '';
        try { toParT = fmtScore(st.toPar); toParCls = scoreClass(st.toPar); } catch (e) { console.warn("[silent]", e); }
        html += '<td class="gsg-cell gsg-total-cell"><div class="gsg-total-gross">' + (played ? (st.gross || 0) : '—') + '</div>' +
            '<div class="gsg-total-topar ' + toParCls + '">' + esc(toParT) + '</div>' +
            '<div class="gsg-total-played">' + played + '/' + order.length + '</div></td>';
    });
    html += '</tr></tbody></table></div>';
    // All layouts are present so a live admin change also updates already-open
    // and collapsed completed rounds without losing their expansion state.
    html += '<div class="gsg-layouts">';
    for (var side = 0; side < order.length; side += 9) {
        var sideHoles = order.slice(side, side + 9);
        html += '<div class="club-sc-side"><div class="club-sc-caption">' + esc((en ? 'Holes ' : 'Лунки ') + sideHoles[0] + '–' + sideHoles[sideHoles.length - 1]) + '</div>';
        html += '<div class="club-sc-scroll" tabindex="0" aria-label="' + esc(en ? 'Group scores by holes' : 'Счёт группы по лункам') + '"><div class="club-sc-grid" style="--sc-holes:' + sideHoles.length + '">';
        html += '<div class="club-sc-labels"><div>' + (en ? 'Hole' : 'Лунка') + '</div><div>' + (en ? 'Par' : 'Пар') + '</div>';
        infos.forEach(function(inf) {
            html += '<div class="gsg-grid-name" title="' + esc(inf.name) + '">' + nameHTML(inf.shortName) + '</div>';
        });
        html += '</div>';
        sideHoles.forEach(function(h) {
            html += '<div class="club-sc-hole"><div class="club-sc-cell club-sc-number"><span class="club-sc-cell-label">' + (en ? 'Hole' : 'Лунка') + '</span>' + h + '</div><div class="club-sc-cell club-sc-par"><span class="club-sc-cell-label">' + (en ? 'Par' : 'Пар') + '</span>' + holePar(h) + '</div>' + gridCells[h].join('') + '</div>';
        });
        html += '</div></div><div class="club-sc-subtotal">';
        infos.forEach(function(inf) {
            var gross = 0, played = 0;
            sideHoles.forEach(function(h) { var score = parseInt(inf.scores[h], 10) || 0; if (score > 0) { gross += score; played++; } });
            html += '<span>' + esc(inf.shortName) + ': <b>' + (played ? gross : '—') + '</b></span> ';
        });
        html += '</div></div>';
    }
    html += '<div class="club-sc-total">';
    infos.forEach(function(inf) {
        html += '<span>' + esc(inf.shortName) + ' · Gross <b>' + (inf.stats.holesPlayed ? inf.stats.gross : '—') + '</b> <span class="' + scoreClass(inf.stats.toPar) + '">' + esc(fmtScore(inf.stats.toPar)) + '</span> · ' + inf.stats.holesPlayed + '/' + order.length + '</span>';
    });
    html += '</div></div>';
    if (completed) return html + '</div></details></section>';
    // Кто где сейчас — живой статус флайта одной строкой.
    var thruBits = infos.map(function(inf) {
        return '<span class="gsg-thru"><b>' + esc(inf.shortName) + ':</b> ' + esc(inf.thru || '') + '</span>';
    }).join('');
    html += '<footer class="club-sc-total club-sc-group-total">' + thruBits + '</footer>';
    return html + '</section>';
}

// ==========================================
// ГАНДИКАП: ЗЕЛЁНАЯ ГАЛОЧКА СИНХРОНИЗАЦИИ + ДАТА ОБНОВЛЕНИЯ
// Гандикап считается «синхронизированным», если он установлен и у записи
// есть hcpUpdatedAt — он проставляется при синхронизации с базой АГР
// (RUSGOLF), импорте Excel и ручном изменении в админ-панели.
// ==========================================

function generateExactPestovoPaperScorecardHTML(player, roundData) {
    var p = player || {};
    var sc = p.scores || {};
    var fHcp = p.fieldHcp || 0;
    var eHcp = p.exactHcp || 0;
    var teeCode = pestovoNormalizeTeeCode((p && p.tee) || (roundData && roundData.tee) || 'wh');
    // Форматная линия целиком («Stableford + Gross»), а не только основной формат.
    var fmt = pestovoRoundFormatsLabel(roundData) || (roundData && roundData.format) || 'Stroke Play';
    var tName = (roundData && roundData.tournamentName) || '—';
    var date = fmtDate((roundData && (roundData.completedAt || roundData.createdAt)) || Date.now());
    var startTime = fmtTime(roundData && roundData.startTime);

    var outG = 0, inG = 0, outS = 0, inS = 0;
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) { outG += s; outS += stablefordField(s, i, fHcp); }
    }
    for (i = 10; i <= 18; i++) {
        s = parseInt(sc[i]) || 0;
        if (s > 0) { inG += s; inS += stablefordField(s, i, fHcp); }
    }
    var totG = outG + inG, totS = outS + inS;

    var pOut = 0, pIn = 0;
    for (i = 1; i <= 9; i++) pOut += holePar(i);
    for (i = 10; i <= 18; i++) pIn += holePar(i);

    var html = '<div class="paper-scorecard-wrap">';

    // Top Header with Logo
    html += '<div class="psc-top-header">';
    html += '  <div class="psc-logo-brand">';
    html += '    <img src="img/logo.png" alt="Pestovo" class="psc-logo" data-img-fail="hide">';
    html += '    <div><div class="psc-club-title">ГОЛЬФ-КЛУБ «ПЕСТОВО»</div><div class="psc-club-sub">Официальная счётная карточка</div></div>';
    html += '  </div>';
    html += '</div>';

    // Player & Meta Block (Matching IMG_1113.jpeg)
    html += '<div class="psc-meta-grid">';
    html += '  <div class="psc-meta-left">';
    html += '    <div><b>Игрок:</b> ' + escapeHtml(p.name || '___________________________') + '</div>';
    html += '    <div><b>Турнир:</b> ' + escapeHtml(tName || '') + ' &nbsp;&nbsp;&nbsp;&nbsp; <b>Формат:</b> ' + escapeHtml(fmt || '') + '</div>';
    html += '  </div>';
    html += '  <div class="psc-meta-right">';
    html += '    <div><b>Точный гандикап:</b> ' + fmtExactHcp(eHcp) + ' &nbsp;&nbsp; (Игровой: ' + fmtFieldHcp(fHcp) + ')</div>';
    html += '    <table class="psc-meta-table">';
    html += '      <tr><th>Раунд</th><th>Время старта</th><th>Дата</th></tr>';
    html += '      <tr><td>1</td><td>' + startTime + '</td><td>' + date + '</td></tr>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    // Grid Table Showing ONLY Played Tee
    html += '<div class="psc-table-wrap">';
    html += '<table class="psc-grid-table">';
    html += '<thead><tr><th style="width:75px;">ТИ \\ Лунка</th>';
    for (i = 1; i <= 9; i++) html += '<th>' + i + '</th>';
    html += '<th class="psc-tot-col">Аут</th>';
    for (i = 10; i <= 18; i++) html += '<th>' + i + '</th>';
    html += '<th class="psc-tot-col">Ин</th><th class="psc-tot-col">Итого</th></tr></thead>';

    html += '<tbody>';

    // SINGLE PLAYED TEE ROW (Only the Tee played by the player)
    var teeName = TEES[teeCode] || 'Белый';
    var teeClass = 'psc-tee-' + teeCode;
    var dO = 0, dI = 0;
    for (i = 1; i <= 9; i++) dO += (HOLES[i][teeCode] || HOLES[i].wh);
    for (i = 10; i <= 18; i++) dI += (HOLES[i][teeCode] || HOLES[i].wh);

    html += '<tr><td class="psc-lbl-tee ' + teeClass + '">' + teeName + '</td>';
    for (i = 1; i <= 9; i++) html += '<td>' + (HOLES[i][teeCode] || HOLES[i].wh) + '</td>';
    html += '<td class="psc-tot-col">' + dO + '</td>';
    for (i = 10; i <= 18; i++) html += '<td>' + (HOLES[i][teeCode] || HOLES[i].wh) + '</td>';
    html += '<td class="psc-tot-col">' + dI + '</td><td class="psc-tot-col">' + (dO + dI) + '</td></tr>';

    // Пар
    html += '<tr class="psc-row-par"><td class="psc-lbl-bold">Пар</td>';
    for (i = 1; i <= 9; i++) html += '<td>' + HOLES[i].p + '</td>';
    html += '<td class="psc-tot-col">' + pOut + '</td>';
    for (i = 10; i <= 18; i++) html += '<td>' + HOLES[i].p + '</td>';
    html += '<td class="psc-tot-col">' + pIn + '</td><td class="psc-tot-col">' + (pOut + pIn) + '</td></tr>';

    // Индекс
    html += '<tr class="psc-row-idx"><td class="psc-lbl-bold">Индекс</td>';
    for (i = 1; i <= 9; i++) html += '<td>' + HOLES[i].hcp + '</td>';
    html += '<td class="psc-tot-col">—</td>';
    for (i = 10; i <= 18; i++) html += '<td>' + HOLES[i].hcp + '</td>';
    html += '<td class="psc-tot-col">—</td><td class="psc-tot-col">—</td></tr>';

    // Счёт Игрока
    html += '<tr class="psc-row-score"><td class="psc-lbl-bold">Счёт</td>';
    for (i = 1; i <= 9; i++) {
        s = parseInt(sc[i]) || 0;
        html += '<td class="psc-score-cell">' + (s > 0 ? '<b>' + s + '</b>' : '') + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (outG > 0 ? outG : '') + '</b></td>';
    for (i = 10; i <= 18; i++) {
        s = parseInt(sc[i]) || 0;
        html += '<td class="psc-score-cell">' + (s > 0 ? '<b>' + s + '</b>' : '') + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (inG > 0 ? inG : '') + '</b></td>';
    html += '<td class="psc-tot-col"><b>' + (totG > 0 ? totG : '') + '</b></td></tr>';

    // Stableford
    html += '<tr><td class="psc-lbl-bold">Stableford</td>';
    for (i = 1; i <= 9; i++) {
        s = parseInt(sc[i]) || 0;
        var pts = s > 0 ? stablefordField(s, i, fHcp) : '';
        html += '<td>' + pts + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (outS > 0 ? outS : '') + '</b></td>';
    for (i = 10; i <= 18; i++) {
        s = parseInt(sc[i]) || 0;
        pts = s > 0 ? stablefordField(s, i, fHcp) : '';
        html += '<td>' + pts + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (inS > 0 ? inS : '') + '</b></td>';
    html += '<td class="psc-tot-col"><b>' + (totS > 0 ? totS : '') + '</b></td></tr>';

    html += '</tbody></table></div>';

    // Signatures Footer
    html += '<div class="psc-signatures">';
    html += '  <span><b>Подписи:</b></span>';
    html += '  <span><b>Игрок:</b> ____________________</span>';
    html += '  <span><b>Маркер:</b> ____________________</span>';
    html += '  <span><b>Судья:</b> ____________________</span>';
    html += '</div>';

    html += '</div>';

    return html;
}

