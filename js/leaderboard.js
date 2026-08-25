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

    var isEn = currentLang === 'en';
    var stblShort = isEn ? 'Pts' : 'Стб';
    var stblF = isEn ? 'Stb (fld)' : 'Стб (пол)';
    var stblE = isEn ? 'Stb (exc)' : 'Стб (игр)';

    var rows = list.map(function(p) {
        var posCls = p.position <= 3 ? 'lb-' + p.position : '';
        var holeInfo = p.holesPlayed >= 18 ? 'F' : (p.currentHole ? (isEn ? 'Hole #' : 'лунка №') + p.currentHole : '—');
        var gross = p.gross || '—';
        var net = p.net || '—';

        return '<div class="rlb-row" onclick="openPlayerProfileModal(\'' + p.pid + '\',\'' + id + '\')">' +
            '<span class="rlb-pos ' + posCls + '">' + (p.tied ? 'T' : '') + p.position + '</span>' +
            '<div class="rlb-player">' + fmtUserAvatar(p, 28) +
            '<div class="rlb-pcol"><span class="rlb-name">' + (p.name || '—') + '</span>' +
            '<span class="rlb-thru">' + holeInfo + '</span></div></div>' +
            '<span class="rlb-par ' + scoreClass(p.toPar) + '">' + fmtScore(p.toPar) + '</span>' +
            '<span class="rlb-num">' + gross + '</span>' +
            '<span class="rlb-num">' + net + '</span>' +
            '<span class="rlb-num rlb-stbl">' + p.stblField + '</span>' +
            '<span class="rlb-num rlb-dim">' + p.stblExact + '</span>' +
            '<div class="rlb-sub">' + holeInfo + ' · Gross ' + gross + ' · Net ' + net + ' · ' + stblShort + ' ' + p.stblField + '/' + p.stblExact + '</div>' +
            '</div>';
    }).join('');

    var badge = isLive 
        ? '<span class="live-badge"><span class="live-dot" style="width:7px;height:7px;"></span> LIVE</span>' 
        : '<span class="tn-status tn-d">' + (isEn ? 'Completed' : 'Завершён') + '</span>';
        
    var downloadBtn = !isLive 
        ? '<div class="rl-actions"><button class="btn btn-og btn-sm" onclick="downloadScorecard(\'' + id + '\')"><i class="fas fa-download"></i> ' + (isEn ? 'Scorecard' : 'Счётная карточка') + '</button>' +
          '<button class="btn btn-g btn-sm" onclick="exportRoundPNG(\'' + id + '\')"><i class="fas fa-image"></i> ' + t('share_card') + '</button></div>'
        : '';

    var head = '<div class="rlb-row rlb-head">' +
        '<span class="rlb-pos">#</span>' +
        '<span class="rlb-hpl">' + t('player') + '</span>' +
        '<span class="rlb-par">±Par</span>' +
        '<span class="rlb-num">' + t('gross') + '</span>' +
        '<span class="rlb-num">' + t('net') + '</span>' +
        '<span class="rlb-num">' + stblF + '</span>' +
        '<span class="rlb-num">' + stblE + '</span></div>';

    var ts = r.startTime || r.createdAt;
    var soloWord = isEn ? ' · Solo' : ' · Одиночный';

    return '<div class="card rl-card">' +
        '<div class="rl-head"><div class="rl-hinfo">' +
        '<div class="rl-title"><i class="fas fa-flag"></i>' + fmtDate(ts) + ' · ' + fmtTime(ts) + '</div>' +
        '<div class="rl-sub">' + (r.format || 'Stroke Play') + ' · ' + fmtTeePill(r.tee) + (r.mode === 'solo' ? soloWord : '') + '</div>' +
        '</div>' + badge + '</div>' +
        '<div class="rlb">' + head + rows + '</div>' +
        downloadBtn + '</div>';
}
