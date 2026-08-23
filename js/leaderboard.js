document.addEventListener('DOMContentLoaded', function() { 
    initNav(); 
    loadLB(); 
});

function onAuthReady(u, d) { navAuth(u, d); }

function loadLB() {
    var statusSelect = document.getElementById('lb-status');
    var status = statusSelect ? statusSelect.value : 'all';

    var searchInput = document.getElementById('lb-search');
    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';

    db.ref('rounds').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data).filter(function(e) { return e && e[1] && typeof e[1] === 'object'; });

        if (status !== 'all') {
            entries = entries.filter(function(e) { return e[1].status === status; });
        }

        if (query) {
            entries = entries.filter(function(e) {
                var r = e[1];
                var players = Object.values(r.players || {});
                return players.some(function(p) { return (p.name || '').toLowerCase().includes(query); });
            });
        }

        entries.sort(function(a, b) { 
            return (b[1].createdAt || 0) - (a[1].createdAt || 0); 
        });

        var el = document.getElementById('lb-container');
        if (!el) return;

        if (!entries.length) { 
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>' + (currentLang === 'en' ? 'No rounds found' : 'Нет раундов') + '</p></div>'; 
            return; 
        }
        var html = '';
        entries.forEach(function(e) { html += renderRound(e[0], e[1]); });
        el.innerHTML = html;
    });
}

function renderRound(id, r) {
    var isLive = r.status === 'active';
    var players = r.players || {};
    var order = holeOrder(r.startHole || 1);

    var list = Object.entries(players).map(function(pe) {
        var pid = pe[0], p = pe[1], sc = p.scores || {};
        var stats = calcRoundStats(sc, p.fieldHcp || 0, p.exactHcp || 0, order);
        return {
            pid: pid,
            name: p.name, 
            gross: stats.gross, 
            toPar: stats.toPar, 
            net: stats.net,
            stblField: stats.stablefordField, 
            stblExact: stats.stablefordExact,
            holesPlayed: stats.holesPlayed, 
            currentHole: stats.currentHole
        };
    });

    list.sort(function(a, b) {
        if (a.toPar === null && b.toPar === null) return 0;
        if (a.toPar === null) return 1;
        if (b.toPar === null) return -1;
        return a.toPar - b.toPar;
    });

    var pos = 1;
    list.forEach(function(p, i) {
        if (i > 0 && p.toPar === list[i - 1].toPar) { 
            p.position = list[i - 1].position; 
            p.tied = true; 
        } else { 
            p.position = pos; 
            p.tied = false; 
        }
        pos++;
    });

    var rows = list.map(function(p) {
        var posCls = p.position <= 3 ? 'lb-' + p.position : '';
        var holeInfo = p.holesPlayed >= 18 ? 'F' : (p.currentHole ? (currentLang === 'en' ? 'Hole #' : 'лунка №') + p.currentHole : '—');
        
        return '<tr style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + p.pid + '\',\'' + id + '\')"><td class="lb-pos ' + posCls + '">' + (p.tied ? 'T' : '') + p.position + '</td>' +
            '<td><div style="display:flex;align-items:center;gap:8px;"><div class="lb-avatar">' + (p.name ? p.name.charAt(0) : '?') + '</div>' +
            '<div><span class="lb-name" style="color:var(--gold);">' + (p.name || '—') + '</span><div style="font-size:11px;color:var(--muted);">' + holeInfo + '</div></div></div></td>' +
            '<td class="lb-score ' + scoreClass(p.toPar) + '">' + fmtScore(p.toPar) + '</td>' +
            '<td style="text-align:center;">' + (p.gross || '—') + '</td>' +
            '<td style="text-align:center;">' + (p.net || '—') + '</td>' +
            '<td style="text-align:center;color:var(--gold);font-weight:700;">' + p.stblField + '</td>' +
            '<td style="text-align:center;color:var(--muted);">' + p.stblExact + '</td></tr>';
    }).join('');

    var badge = isLive 
        ? '<span class="live-badge"><span class="live-dot" style="width:7px;height:7px;"></span> LIVE</span>' 
        : '<span class="tn-status tn-d">' + (currentLang === 'en' ? 'Completed' : 'Завершён') + '</span>';
        
    var downloadBtn = !isLive 
        ? '<button class="btn btn-og btn-sm" onclick="downloadScorecard(\'' + id + '\')" style="margin-top:10px;"><i class="fas fa-download"></i> ' + (currentLang === 'en' ? 'Scorecard' : 'Счётная карточка') + '</button>' 
        : '';

    var posHeader = currentLang === 'en' ? 'Pos' : 'Поз';
    var playerHeader = t('player');
    var soloWord = currentLang === 'en' ? ' · Solo' : ' · Одиночный';

    return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">' +
        '<div><h2 style="margin-bottom:4px;"><i class="fas fa-flag"></i> ' + t('brand_name') + ' · ' + fmtTime(r.startTime) + '</h2>' +
        '<div style="font-size:12px;color:var(--muted);">' + fmtDate(r.createdAt) + ' · ' + (r.format || 'Stroke Play') + ' · ' + t('tee_select') + ': ' + fmtTeePill(r.tee) +
        (r.mode === 'solo' ? soloWord : '') + '</div></div>' + badge + '</div>' +
        '<div style="overflow-x:auto;"><table class="lb-table"><thead><tr>' +
        '<th style="width:44px;">' + posHeader + '</th><th>' + playerHeader + '</th><th style="text-align:center;">±Par</th>' +
        '<th style="text-align:center;">Gross</th><th style="text-align:center;">Net</th>' +
        '<th style="text-align:center;">' + t('stbl_field') + '</th><th style="text-align:center;">' + t('stbl_exact') + '</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' + downloadBtn + '</div>';
}
