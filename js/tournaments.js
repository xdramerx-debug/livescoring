document.addEventListener('DOMContentLoaded', function() { initNav(); loadTournaments(); });
function onAuthReady(u, d) { navAuth(u, d); }

function loadTournaments() {
    db.ref('tournaments').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data);
        var el = document.getElementById('tn-list');
        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>Нет турниров</p><p style="font-size:12px;margin-top:8px;">Только администратор создаёт турниры</p></div>';
            return;
        }
        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });
        var html = '';
        entries.forEach(function(e) {
            var t = e[1];
            var statusCls = t.status === 'active' ? 'tn-a' : t.status === 'completed' ? 'tn-d' : 'tn-u';
            var statusText = t.status === 'active' ? '🔴 Активный' : t.status === 'completed' ? '✅ Завершён' : '📅 Предстоящий';
            var formatsStr = (t.formats || []).join(' · ') || '—';
            var teesStr = (t.tees || []).map(function(k) { return TEES[k] || k; }).join(' · ');
            html += '<div class="tn-card">';
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">';
            html += '<div style="flex:1;"><div class="tn-name">' + t.name + '</div>';
            html += '<div class="tn-meta"><span><i class="fas fa-calendar"></i> ' + fmtDate(new Date(t.date).getTime()) + '</span></div>';
            html += '<div style="margin-top:8px;font-size:12px;color:var(--muted);">Форматы: ' + formatsStr + '</div>';
            html += '<div style="font-size:12px;color:var(--muted);">ТИ: ' + teesStr + '</div>';
            html += '</div><span class="tn-status ' + statusCls + '">' + statusText + '</span>';
            html += '</div></div>';
        });
        el.innerHTML = html;
    });
}