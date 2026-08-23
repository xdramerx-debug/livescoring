document.addEventListener('DOMContentLoaded', function() { initNav(); loadTournaments(); });
function onAuthReady(u, d) { navAuth(u, d); }

function loadTournaments() {
    db.ref('tournaments').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data);
        var el = document.getElementById('tn-list');
        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>' + (currentLang === 'en' ? 'No tournaments created yet' : 'Нет турниров') + '</p><p style="font-size:12px;margin-top:8px;">' + t('admin_only_tournaments') + '</p></div>';
            return;
        }
        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });
        
        var formatLabel = currentLang === 'en' ? 'Formats: ' : 'Форматы: ';
        var teeLabel = currentLang === 'en' ? 'Tees: ' : 'ТИ: ';

        var html = '';
        entries.forEach(function(e) {
            var tVal = e[1];
            var statusCls = tVal.status === 'active' ? 'tn-a' : tVal.status === 'completed' ? 'tn-d' : 'tn-u';
            var statusText = tVal.status === 'active' ? (currentLang === 'en' ? '🔴 Active' : '🔴 Активный') : tVal.status === 'completed' ? (currentLang === 'en' ? '✅ Completed' : '✅ Завершён') : (currentLang === 'en' ? '📅 Upcoming' : '📅 Предстоящий');
            var formatsStr = (tVal.formats || []).join(' · ') || '—';
            var teesStr = (tVal.tees || []).map(function(k) { return t('tee_' + k); }).join(' · ');
            
            html += '<div class="tn-card">';
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">';
            html += '<div style="flex:1;"><div class="tn-name">' + (tVal.name || '—') + '</div>';
            html += '<div class="tn-meta"><span><i class="fas fa-calendar"></i> ' + fmtDate(new Date(tVal.date).getTime()) + '</span></div>';
            html += '<div style="margin-top:8px;font-size:12px;color:var(--muted);">' + formatLabel + formatsStr + '</div>';
            html += '<div style="font-size:12px;color:var(--muted);">' + teeLabel + teesStr + '</div>';
            html += '</div><span class="tn-status ' + statusCls + '">' + statusText + '</span>';
            html += '</div></div>';
        });
        el.innerHTML = html;
    });
}
