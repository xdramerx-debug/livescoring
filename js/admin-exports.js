// js/admin-exports.js — экспорт данных админки: CSV всех раундов и
// JSON-бэкап; вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3).
// Внешних зависимостей от admin.js нет: runtime-глобалы (db, toast,
// currentLang, escapeHtml), Blob/download и guarded-хелперы. Функции
// доступны из onclick HTML; грузится в admin.html рядом с admin.js.

// Безопасная ячейка CSV: кавычки/запятые/переводы строк — в кавычки,
// ведущие = + - @ таб — с префиксом ' (formula injection в Excel: имя
// игрока «=HYPERLINK(...)» иначе выполнялось бы при открытии экспорта).
function admCsvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n\r;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
}

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
                    admCsvCell(rid),
                    admCsvCell(dateStr),
                    admCsvCell(timeStr),
                    admCsvCell(r.mode || 'group'),
                    admCsvCell((typeof pestovoRoundFormatBadge === 'function') ? pestovoRoundFormatBadge(r, 'Stroke') : (r.format || 'Stroke')),
                    admCsvCell((p && p.tee) || r.tee || 'wh'),
                    admCsvCell(r.status || 'active'),
                    admCsvCell(p.name || ''),
                    admCsvCell(fmtExactHcp(p.exactHcp)),
                    admCsvCell(stats.gross || 0),
                    admCsvCell(fmtScore(stats.toPar)),
                    admCsvCell(stats.net || 0),
                    admCsvCell(stats.stablefordField || 0)
                ];
                for (var h = 1; h <= 18; h++) {
                    row.push(admCsvCell(p.scores && p.scores[h] ? p.scores[h] : ''));
                }
                rows.push(row);
            });
        });

        var csvContent = rows.map(function(e) { return e.join(','); }).join('\n');
        // encodeURIComponent, а не encodeURI: '#'/национальные символы в данных
        // обрезали или ломали data:-URI.
        var encodedUri = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvContent);
        var link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'Pestovo_Golf_Full_Archive_' + Date.now() + '.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast('📄 Full CSV archive exported!', 'success');
    }).catch(function(err) {
        toast('❌ ' + (currentLang === 'en' ? 'Export failed: ' : 'Ошибка экспорта: ') + (err && err.message || err), 'error');
    });
}

function downloadJSONBackup() {
    if (typeof db === 'undefined') return;
    // Чтение КОРНЯ (db.ref()) при .read:false в rules всегда падает с
    // permission_denied: в RTDB чтение не «объединяет» права потомков.
    // Раньше кнопка бэкапа молча ничего не делала. Читаем только те узлы,
    // которые правила явно дают админу.
    var nodes = ['users', 'settings', 'rounds', 'tournaments', 'protocols', 'markers',
                 'markerAssignments', 'alerts', 'broadcasts', 'leaderboard', 'reactions',
                 'tnTemplates', 'push_subscriptions', 'scoreAudit'];
    var result = {};
    var failed = [];
    var chain = Promise.resolve();
    nodes.forEach(function(n) {
        chain = chain.then(function() {
            return db.ref(n).once('value').then(function(sn) { result[n] = sn.val(); })
                .catch(function(err) {
                    failed.push(n);
                    result[n] = { _backupError: String(err && err.code || err) };
                });
        });
    });
    chain.then(function() {
        var jsonStr = JSON.stringify(result, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'Pestovo_Database_Backup_' + Date.now() + '.json';
        document.body.appendChild(link);
        link.click();
        link.remove();
        if (failed.length) {
            toast('⚠️ ' + (currentLang === 'en' ? 'Backup saved, unavailable nodes: ' : 'Бэкап сохранён, недоступны узлы: ') + failed.join(', '), 'warn');
        } else {
            toast('💾 ' + (currentLang === 'en' ? 'Database JSON backup downloaded!' : 'JSON-бэкап базы скачан!'), 'success');
        }
    }).catch(function(err) {
        toast('❌ ' + (currentLang === 'en' ? 'Backup failed: ' : 'Ошибка бэкапа: ') + (err && err.message || err), 'error');
    });
}
