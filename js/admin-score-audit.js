// Журнал фактически подтверждённых сервером действий со счётом (30 дней).
(function(root) {
    var cache = {};
    var seq = 0;
    function el(id) { return document.getElementById(id); }
    function en() { return root.currentLang === 'en'; }
    function esc(x) { return typeof root.escapeHtml === 'function' ? root.escapeHtml(String(x == null ? '' : x)) : String(x == null ? '' : x).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
    function localDay(ts) { var d = new Date(ts); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
    function name(x) { return String(x || '').toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
    function daysFor(day) {
        var out = [];
        if (day) {
            var base = Date.parse(day + 'T00:00:00Z');
            if (!isFinite(base) || base > Date.now() + 86400000 || base < Date.now() - 31 * 86400000) return [];
            // Day in the browser's time zone can span two UTC partitions.
            [-1, 0, 1].forEach(function(delta) { out.push(new Date(base + delta * 86400000).toISOString().slice(0, 10)); });
        } else {
            for (var i = 0; i <= 30; i++) out.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
        }
        return out;
    }
    function read(day) {
        if (cache[day]) return Promise.resolve(cache[day]);
        return root.db.ref('scoreAudit/' + day).once('value').then(function(sn) { return (cache[day] = sn.val() || {}); });
    }
    function render(list) {
        var q = name(el('sa-search') && el('sa-search').value);
        var selected = el('sa-date') && el('sa-date').value;
        var entries = list.filter(function(e) {
            if (e.at < Date.now() - 30 * 86400000) return false;
            if (selected && localDay(e.at) !== selected) return false;
            var fio = name(e.playerName), id = name(e.playerId);
            return !q || id.indexOf(q) !== -1 || q.split(' ').every(function(part) { return fio.indexOf(part) !== -1; });
        }).sort(function(a, b) { return b.at - a.at || String(b.id).localeCompare(String(a.id)); });
        var target = el('sa-results'); if (!target) return;
        var labels = en() ? { score:'Player score',marker:'Marker confirmation',studio:'Tournament score',entered:'Entered',corrected:'Corrected',cleared:'Cleared',saved_again:'Saved again' }
            : { score:'Счёт игрока',marker:'Счёт маркера',studio:'Счёт турнира',entered:'Ввёл',corrected:'Исправил',cleared:'Удалил',saved_again:'Повторно сохранил' };
        if (!entries.length) { target.innerHTML = '<p class="empty">' + (en() ? 'No actions found for these filters.' : 'По выбранным условиям действий не найдено.') + '</p>'; return; }
        target.innerHTML = '<p style="color:var(--muted);font-size:12px;">' + entries.length + (en() ? ' actions (server confirmed)' : ' действий (подтверждены сервером)') + '</p>' + entries.slice(0, 1000).map(function(e) {
            var when = new Date(e.at).toLocaleString(en() ? 'en-GB' : 'ru-RU');
            var value = e.oldScore == null ? '—' : esc(e.oldScore);
            var next = e.newScore == null ? '—' : esc(e.newScore);
            return '<div class="card" style="padding:12px;margin:8px 0;border-left:3px solid var(--gold);">' +
                '<b>' + esc(e.playerName || e.playerId) + '</b> <small>' + esc(e.playerId) + '</small> · ' +
                esc(labels[e.action] || e.action) + ': <strong>' + value + ' → ' + next + '</strong> · ' +
                (en() ? 'Hole ' : 'Лунка ') + esc(e.hole) + '<br>' +
                '<small>' + esc(when) + ' · ' + esc(labels[e.kind] || e.kind) + ' · ' +
                (e.tournamentDayId ? (en() ? 'Tournament day ' : 'День турнира ') + esc(e.tournamentDayId) : (en() ? 'Round ' : 'Раунд ') + esc(e.roundId || '—')) +
                '</small>' + (e.queuedAt && Math.abs(e.at - e.queuedAt) > 60000 ? '<br><small>' + (en() ? 'Entered offline: ' : 'Введено на устройстве: ') + esc(new Date(e.queuedAt).toLocaleString(en() ? 'en-GB' : 'ru-RU')) + '</small>' : '') +
                '<br><small>' + (en() ? 'By: ' : 'Кто: ') + esc(e.actorLabel || '—') +
                (e.actorType === 'qr' ? (en() ? ' · QR identity unverified' : ' · личность по QR не подтверждена') : '') +
                (e.actorType === 'unverified-direct' ? (en() ? ' · legacy direct write, author unverified' : ' · старая прямая запись, автор не подтверждён') : '') +
                '</small></div>';
        }).join('') + (entries.length > 1000 ? '<p>Показана первая 1000 записей. Уточните дату и поиск.</p>' : '');
    }
    var last = [];
    root.saLoad = function() {
        var date = el('sa-date'), result = el('sa-results');
        if (!date || !result) return;
        if (!date.value && !date.dataset.initialized) { date.value = localDay(Date.now()); date.dataset.initialized = '1'; }
        var days = daysFor(date.value);
        if (!days.length) { result.textContent = en() ? 'Choose a date from the last 30 days.' : 'Выберите дату за последние 30 дней.'; return; }
        var token = ++seq;
        result.textContent = en() ? 'Loading actions…' : 'Загрузка действий…';
        Promise.all(days.map(read)).then(function(snaps) {
            if (token !== seq) return;
            var found = {};
            snaps.forEach(function(s) { Object.keys(s || {}).forEach(function(id) { found[id] = s[id]; }); });
            last = Object.keys(found).map(function(id) { return found[id]; }).filter(function(e) { return e && typeof e.at === 'number'; });
            render(last);
        }).catch(function(err) { if (token === seq) result.textContent = '❌ ' + (err && err.message || err); });
    };
    root.saFilter = function() { render(last); };
    // Reload clears stale cache so recent events appear without a hard reload.
    root.saRefresh = function() { cache = {}; root.saLoad(); };
})(typeof window !== 'undefined' ? window : this);
