document.addEventListener('DOMContentLoaded', function() { 
    initNav(); 
    loadLB(); 
});

function onAuthReady(u, d) { navAuth(u, d); }

function loadLB() {
    var status = document.getElementById('lb-status').value;
    var ref = db.ref('rounds');
    if (status !== 'all') ref = ref.orderByChild('status').equalTo(status);

    ref.on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data).sort(function(a, b) { 
            return (b[1].createdAt || 0) - (a[1].createdAt || 0); 
        });
        var el = document.getElementById('lb-container');
        if (!entries.length) { 
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>Нет раундов</p></div>'; 
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
        
        // Форматирование текущей лунки
        var holeInfo = p.holesPlayed >= 18 ? 'F' : (p.currentHole ? 'лунка №' + p.currentHole : '—');
        
        return '<tr><td class="lb-pos ' + posCls + '">' + (p.tied ? 'T' : '') + p.position + '</td>' +
            '<td><div style="display:flex;align-items:center;gap:8px;"><div class="lb-avatar">' + (p.name ? p.name.charAt(0) : '?') + '</div>' +
            '<div><span class="lb-name">' + p.name + '</span><div style="font-size:11px;color:var(--muted);">' + holeInfo + '</div></div></div></td>' +
            '<td class="lb-score ' + scoreClass(p.toPar) + '">' + fmtScore(p.toPar) + '</td>' +
            '<td style="text-align:center;">' + (p.gross || '—') + '</td>' +
            '<td style="text-align:center;">' + (p.net || '—') + '</td>' +
            '<td style="text-align:center;color:var(--gold);font-weight:700;">' + p.stblField + '</td>' +
            '<td style="text-align:center;color:var(--muted);">' + p.stblExact + '</td></tr>';
    }).join('');

    var badge = isLive 
        ? '<span class="live-badge"><span class="live-dot" style="width:7px;height:7px;"></span> LIVE</span>' 
        : '<span class="tn-status tn-d">Завершён</span>';
        
    var downloadBtn = !isLive 
        ? '<button class="btn btn-og btn-sm" onclick="downloadScorecard(\'' + id + '\')" style="margin-top:10px;"><i class="fas fa-download"></i> Счётная карточка</button>' 
        : '';

    return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">' +
        '<div><h2 style="margin-bottom:4px;"><i class="fas fa-flag"></i> Пестово · ' + fmtTime(r.startTime) + '</h2>' +
        '<div style="font-size:12px;color:var(--muted);">' + fmtDate(r.createdAt) + ' · ' + (r.format || 'Stroke Play') + ' · ТИ: ' + TEES[r.tee] +
        (r.mode === 'solo' ? ' · Одиночный' : '') + '</div></div>' + badge + '</div>' +
        '<div style="overflow-x:auto;"><table class="lb-table"><thead><tr>' +
        '<th style="width:44px;">Поз</th><th>Игрок</th><th style="text-align:center;">±Par</th>' +
        '<th style="text-align:center;">Gross</th><th style="text-align:center;">Net</th>' +
        '<th style="text-align:center;">Stblfd(пол)</th><th style="text-align:center;">Stblfd(игр)</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>' + downloadBtn + '</div>';
}
