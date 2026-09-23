// js/admin-exports.js — экспорт данных админки: CSV всех раундов и
// JSON-бэкап; вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3).
// Внешних зависимостей от admin.js нет: runtime-глобалы (db, toast,
// currentLang, escapeHtml), Blob/download и guarded-хелперы. Функции
// доступны из onclick HTML; грузится в admin.html рядом с admin.js.

function exportAllRoundsCSV() {
    if (typeof db === 'undefined') return;
    db.ref('rounds').once('value').then(function(sn) {
        var data = sn.val() || {};
        var rounds = Object.entries(data);
        if (!rounds.length) { toast(currentLang === 'en' ? 'No rounds to export' : 'Нет раундов для экспорта', 'error'); return; }

        var headers = ['Round ID', 'Date', 'Time', 'Mode', 'Format', 'Tee', 'Status', 'Player Name', 'HCP', 'Gross', 'ToPar', 'Net', 'Stableford'];
        for (var h = 1; h <= 18; h++) headers.push('Hole ' + h);

        var rows = [headers];

        rounds.forEach(function(e) {
            var rid = e[0], r = e[1];
            var dateStr = fmtDate(r.createdAt);
            var timeStr = fmtTime(r.startTime);

            Object.entries(r.players || {}).forEach(function(pe) {
                var p = pe[1] || {};
                // Удалённые в админке игроки в архив не попадают.
                if (typeof isPlayerDeleted === 'function') {
                    try { if (isPlayerDeleted(pe[0], p.name)) return; } catch (e) { console.warn("[silent]", e); }
                }
                var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, getRoundOrder(r));
                var row = [
                    rid,
                    dateStr,
                    timeStr,
                    r.mode || 'group',
                    (typeof pestovoRoundFormatBadge === 'function') ? pestovoRoundFormatBadge(r, 'Stroke') : (r.format || 'Stroke'),
                    (p && p.tee) || r.tee || 'wh',
                    r.status || 'active',
                    '"' + (p.name || '').replace(/"/g, '""') + '"',
                    fmtExactHcp(p.exactHcp),
                    stats.gross || 0,
                    fmtScore(stats.toPar),
                    stats.net || 0,
                    stats.stablefordField || 0
                ];
                for (var h = 1; h <= 18; h++) {
                    row.push(p.scores && p.scores[h] ? p.scores[h] : '');
                }
                rows.push(row);
            });
        });

        var csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(function(e) { return e.join(','); }).join('\n');
        var encodedUri = encodeURI(csvContent);
        var link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'Pestovo_Golf_Full_Archive_' + Date.now() + '.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast('📄 Full CSV archive exported!', 'success');
    });
}

function downloadJSONBackup() {
    if (typeof db === 'undefined') return;
    db.ref().once('value').then(function(sn) {
        var fullData = sn.val() || {};
        var jsonStr = JSON.stringify(fullData, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'Pestovo_Database_Backup_' + Date.now() + '.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast('💾 Database JSON backup downloaded!', 'success');
    });
}
