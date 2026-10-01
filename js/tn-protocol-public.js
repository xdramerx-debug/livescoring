// ============================================================
// tn-protocol-public.js — ПУБЛИЧНАЯ СТРАНИЦА ПРОТОКОЛА (tn-protocol.html)
// ------------------------------------------------------------
// Читает опубликованный снимок протокола tournaments/<id>/protocol
// (его фиксирует админ на шаге 5 в tn-admin.html) и показывает:
// призёров, абсолютный зачёт, зачёты М/Ж и дивизионы, номинации,
// разбивку по игровым группам. Печать/PDF, CSV, Excel.
// Если протокол не опубликован — показывает live-результаты из
// раундов (коли они есть) или объяснение, что ждём публикации.
// ============================================================

var tnpState = {
    tnId: null,
    tn: null,
    rounds: {},
    published: null,   // снимок протокола
    live: null         // протокол из раундов (до публикации)
};

function tnpL(ru, en) {
    return (typeof currentLang !== 'undefined' && currentLang === 'en') ? en : ru;
}

function tnpEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function tnpCore() {
    return (typeof TnAdminCore !== 'undefined') ? TnAdminCore : null;
}

function tnpDb() {
    return (typeof db !== 'undefined' && db) ? db : null;
}

function tnpInit() {
    var id = '';
    try {
        var m = /[?&]id=([^&]+)/.exec(location.search || '');
        if (m) id = decodeURIComponent(m[1]);
        if (!id && location.hash) id = decodeURIComponent(location.hash.replace(/^#/, ''));
    } catch (e) {}
    tnpState.tnId = id;
    var d = tnpDb();
    if (!d || !tnpState.tnId) { tnpRenderMissing(); return; }
    d.ref('tournaments/' + tnpState.tnId).on('value', function (snap) {
        tnpState.tn = (snap && snap.val) ? (snap.val() || {}) : null;
        tnpState.published = (tnpState.tn && tnpState.tn.protocol && tnpState.tn.protocol.published)
            ? tnpState.tn.protocol : null;
        tnpRender();
    }, function (err) { console.warn('[tn-protocol]', err); tnpRenderMissing(); });
    // Live-результаты из раундов — пока протокол не опубликован.
    d.ref('rounds').on('value', function (snap) {
        tnpState.rounds = (snap && snap.val) ? (snap.val() || {}) : {};
        if (!tnpState.published) tnpRender();
    }, function () {});
}

function tnpRoundsOfTournament() {
    var out = {};
    Object.keys(tnpState.rounds || {}).forEach(function (rid) {
        var r = tnpState.rounds[rid] || {};
        if (String(r.tournamentId || '') === String(tnpState.tnId)) out[rid] = r;
    });
    return out;
}

// Протокол из раундов (той же математикой, что и админка).
function tnpLiveProtocol() {
    var core = tnpCore();
    var t = tnpState.tn || {};
    if (!core) return null;
    var cfg = core.normalizeConfig(t.cfg);
    var fioKey = function (p) {
        try {
            if (typeof getPlayerFioKey === 'function') {
                var k = getPlayerFioKey({
                    name: p.name || '', firstName: p.firstName || '',
                    lastName: p.lastName || '', middleName: p.middleName || ''
                });
                if (k) return k;
            }
        } catch (e) {}
        return String(p.name || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    };
    var agg = {};
    var rounds = tnpRoundsOfTournament();
    Object.keys(rounds).forEach(function (rid) {
        var r = rounds[rid] || {};
        var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(r.players || {}) : (r.players || {});
        var order = (typeof getRoundOrder === 'function') ? getRoundOrder(r) : null;
        Object.keys(players).forEach(function (pid) {
            var p = players[pid] || {};
            if (typeof isPlayerDeleted === 'function') { try { if (isPlayerDeleted(pid, p.name)) return; } catch (e) {} }
            var stats = null;
            try { stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order); } catch (e) { stats = null; }
            if (!stats || !stats.holesPlayed) return;
            var key = fioKey(p) || pid;
            var row = agg[key];
            if (!row) {
                row = agg[key] = {
                    pid: pid, name: p.name || '—', gender: p.gender || 'men',
                    handicap: (p.exactHcp != null ? p.exactHcp : (p.handicap != null ? p.handicap : null)),
                    tee: p.tee || r.tee || 'wh', status: 'ACTIVE',
                    fieldHcp: (p.fieldHcp != null ? p.fieldHcp : null),
                    gross: 0, net: 0, stableford: 0, holesPlayed: 0, hasResult: false
                };
            }
            row.gross += stats.gross || 0;
            row.net += stats.net || 0;
            row.stableford += (stats.stablefordField != null ? stats.stablefordField : 0);
            row.holesPlayed += stats.holesPlayed || 0;
            row.hasResult = true;
        });
    });
    var rows = Object.keys(agg).map(function (k) { return agg[k]; });
    if (!rows.length) return null;
    // Ручной ввод результатов (если админ вводил вручную)
    var manual = t.results || {};
    Object.keys(manual).forEach(function (pid) {
        var m = manual[pid] || {};
        var reg = (t.registeredPlayers || {})[pid];
        if (!reg) return;
        var existing = null;
        rows.forEach(function (r) { if (fioKey(r) === fioKey(reg)) existing = r; });
        if (existing) return;
        rows.push(core.buildRow({
            pid: pid, name: reg.name, gender: reg.gender, handicap: reg.handicap,
            tee: reg.tee, status: reg.status
        }, m, cfg, {
            fieldHcp: function (h, tee, g) { return (typeof getFieldHcp === 'function' ? getFieldHcp(h, tee, g) : Math.round(h || 0)); },
            calcStats: function (scores, fh, eh, order) { return calcRoundStats(scores, fh, eh, order); }
        }));
    });
    return core.assembleProtocol(rows, cfg, []);
}

// ---------- Рендер ----------
function tnpRenderMissing() {
    var root = document.getElementById('tnp-root');
    if (!root) return;
    root.innerHTML = '<div class="card" style="text-align:center;padding:40px;">' +
        '<i class="fas fa-triangle-exclamation" style="font-size:30px;color:var(--gold);"></i>' +
        '<p style="margin-top:10px;color:var(--muted);">' + tnpL('Протокол не найден. Проверьте ссылку.', 'Protocol not found. Check the link.') + '</p>' +
        '<a class="btn btn-og" href="tournaments.html">' + tnpL('К турнирам', 'All tournaments') + '</a></div>';
}

function tnpRender() {
    var root = document.getElementById('tnp-root');
    if (!root) return;
    var t = tnpState.tn;
    if (!t) return;
    var snap = tnpState.published;
    var protocol = null;
    if (snap) protocol = snap;
    else protocol = tnpLiveProtocol();

    var title = t.name || tnpL('Турнир', 'Tournament');
    var date = t.date || '';
    var cfg = (tnpCore() ? tnpCore().normalizeConfig(t.cfg) : {});
    var scoringLabel = cfg.scoring === 'stableford' ? 'Stableford'
        : (cfg.netMode === 'gross' ? 'Stroke Play · Gross' : 'Stroke Play · Net');
    var prize = cfg.prizePlaces || 3;

    var html = '<div class="card">' +
        '<div class="tnp-head">' +
        '<div><p class="tnp-kicker"><i class="fas fa-trophy"></i> ' + tnpL('Протокол турнира', 'Tournament protocol') + '</p>' +
        '<h1 style="margin:2px 0 6px;">' + tnpEsc(title) + '</h1>' +
        '<p class="tnp-meta">' + tnpEsc(date) + ' · ' + tnpEsc(scoringLabel) +
        (protocol && protocol.meta ? ' · ' + tnpL(protocol.meta.participants + ' участников', protocol.meta.participants + ' players') : '') + '</p></div>' +
        '<div class="tnp-actions">' +
        '<button class="btn btn-g" id="tnp-print"><i class="fas fa-print"></i> ' + tnpL('Печать / PDF', 'Print / PDF') + '</button>' +
        '<button class="btn btn-og" id="tnp-csv"><i class="fas fa-file-csv"></i> CSV</button>' +
        '<button class="btn btn-og" id="tnp-xls"><i class="fas fa-file-excel"></i> Excel</button>' +
        '</div></div>';

    if (!protocol || !protocol.rows || !protocol.rows.length) {
        html += '<div class="tna-empty"><i class="fas fa-hourglass-start"></i><p>' +
            tnpL('Протокол ещё не опубликован. Как только организатор зафиксирует результаты, они появятся здесь.',
                'The protocol has not been published yet. Once the organiser fixes the results, they will appear here.') + '</p></div>';
        root.innerHTML = html + '</div>';
        tnpBindActions(protocol);
        return;
    }

    if (!snap) {
        html += '<p class="tnp-note"><i class="fas fa-circle-info"></i> ' +
            tnpL('Предварительные результаты — обновляются автоматически. Опубликованный протокол может незначительно отличаться.',
                'Provisional results — updating automatically. The published protocol may differ slightly.') + '</p>';
    } else if (snap.version) {
        html += '<p class="tnp-note"><i class="fas fa-circle-check"></i> ' +
            tnpL('Опубликованная версия v' + snap.version + (snap.fixedAt ? ' · ' + tnpDate(snap.fixedAt) : ''),
                'Published version v' + snap.version + (snap.fixedAt ? ' · ' + tnpDate(snap.fixedAt) : '')) + '</p>';
    }

    var prizeRows = protocol.rows.filter(function (r) { return r.position != null && r.position <= prize; });
    if (prizeRows.length) {
        html += '<h2 class="tnp-h2"><i class="fas fa-medal" style="color:var(--gold);"></i> ' + tnpL('Призёры', 'Prize winners') + '</h2>' +
            tnpTable(prizeRows, prize);
    }
    html += '<h2 class="tnp-h2">' + tnpL('Абсолютный зачёт', 'Overall') + '</h2>' + tnpTable(protocol.rows, prize);
    (protocol.scopes || []).forEach(function (s) {
        if (s.key === 'abs') return;
        html += '<h2 class="tnp-h2">' + tnpEsc(s.name) + '</h2>' + tnpTable(s.rows, prize);
    });
    (protocol.nominations || []).forEach(function (n) {
        html += '<h2 class="tnp-h2">' + tnpEsc(n.label) + '</h2>' + tnpTable(n.rows, prize, true);
    });
    (protocol.perGroup || []).forEach(function (g) {
        html += '<h2 class="tnp-h2">' + tnpEsc(g.name) + '</h2>' + tnpTable(g.rows, prize);
    });
    root.innerHTML = html + '</div>';
    tnpBindActions(protocol);
}

function tnpDate(ts) {
    try { return new Date(ts).toLocaleDateString('ru-RU'); } catch (e) { return ''; }
}

function tnpTable(rows, prize, nomPositions) {
    var out = '<div class="tna-table-wrap"><table class="tna-table"><thead><tr>' +
        '<th class="tna-num">#</th><th>' + tnpL('Игрок', 'Player') + '</th><th class="tna-num">HCP</th>' +
        '<th class="tna-num">' + tnpL('Игр. HCP', 'Playing HCP') + '</th><th class="tna-num">Gross</th>' +
        '<th class="tna-num">Net</th><th class="tna-num">Stbl</th><th>' + tnpL('Статус', 'Status') + '</th>' +
        '</tr></thead><tbody>';
    rows.forEach(function (r) {
        var pos = nomPositions ? r.nomPosition : r.position;
        var isPrize = pos != null && pos <= prize;
        out += '<tr' + (isPrize ? ' class="tna-prize"' : '') + '>' +
            '<td class="tna-num">' + (pos == null ? '—' : pos) + '</td>' +
            '<td>' + tnpEsc(r.name) + '</td>' +
            '<td class="tna-num">' + (r.handicap == null ? '—' : r.handicap) + '</td>' +
            '<td class="tna-num">' + (r.fieldHcp == null ? '—' : r.fieldHcp) + '</td>' +
            '<td class="tna-num">' + (r.gross == null ? '—' : r.gross) + '</td>' +
            '<td class="tna-num">' + (r.net == null ? '—' : r.net) + '</td>' +
            '<td class="tna-num">' + (r.stableford == null ? '—' : r.stableford) + '</td>' +
            '<td>' + tnpEsc(r.status) + '</td></tr>';
    });
    return out + '</tbody></table></div>';
}

function tnpBindActions(protocol) {
    var el = function (id) { return document.getElementById(id); };
    var print = el('tnp-print');
    if (print) print.onclick = function () { tnpPrint(protocol); };
    var csv = el('tnp-csv');
    if (csv) csv.onclick = function () { tnpExportCsv(protocol); };
    var xls = el('tnp-xls');
    if (xls) xls.onclick = function () { tnpExportExcel(protocol); };
}

function tnpPrint(protocol) {
    if (!protocol || !protocol.rows || !protocol.rows.length) return;
    var core = tnpCore();
    var t = tnpState.tn || {};
    var cfg = core.normalizeConfig(t.cfg);
    var scoringLabel = cfg.scoring === 'stableford' ? 'Stableford'
        : (cfg.netMode === 'gross' ? 'Stroke Play · Gross' : 'Stroke Play · Net');
    var doc = core.protocolDocHtml(protocol, {
        name: t.name || '',
        date: t.date || '',
        scoringLabel: scoringLabel,
        participants: protocol.meta ? protocol.meta.participants : null,
        prizePlaces: cfg.prizePlaces || 3
    });
    var w = window.open('', '_blank');
    if (!w) return;
    w.document.write(doc);
    w.document.close();
    w.focus();
    setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}

function tnpExportCsv(protocol) {
    if (!protocol || !protocol.rows) return;
    var core = tnpCore();
    var t = tnpState.tn || {};
    var name = (String(t.name || 'tournament').replace(/[^a-zа-я0-9]+/gi, '_') || 'tournament');
    var blob = new Blob([core.csv(protocol.rows)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '-protocol.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function tnpExportExcel(protocol) {
    if (!protocol || !protocol.rows) return;
    var t = tnpState.tn || {};
    var name = (String(t.name || 'tournament').replace(/[^a-zа-я0-9]+/gi, '_') || 'tournament');
    var esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
        });
    };
    var html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body>' +
        '<table border="1"><tr><th>#</th><th>Игрок</th><th>HCP</th><th>Игр. HCP</th><th>Gross</th><th>Net</th><th>Stbl</th><th>Статус</th></tr>' +
        protocol.rows.map(function (r) {
            return '<tr><td>' + (r.position == null ? '' : r.position) + '</td><td>' + esc(r.name) + '</td><td>' +
                (r.handicap == null ? '' : r.handicap) + '</td><td>' + (r.fieldHcp == null ? '' : r.fieldHcp) + '</td><td>' +
                (r.gross == null ? '' : r.gross) + '</td><td>' + (r.net == null ? '' : r.net) + '</td><td>' +
                (r.stableford == null ? '' : r.stableford) + '</td><td>' + esc(r.status) + '</td></tr>';
        }).join('') + '</table></body></html>';
    var blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '-protocol.xls';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

document.addEventListener('DOMContentLoaded', function () { tnpInit(); });
