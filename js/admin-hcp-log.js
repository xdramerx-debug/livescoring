// js/admin-hcp-log.js — вкладка «Журнал гандикапов» в админке.
// Читает узел hcpLog (пишет pestovoLogHcpChange из js/utils.js): кто, когда и
// какого игрока обновил гандикап, старое и новое значение, источник.
// Показывает: (1) последнее обновление по каждому игроку, (2) историю.
(function (root) {
    var entries = [];
    function el(id) { return document.getElementById(id); }
    function en() { return root.currentLang === 'en'; }
    function esc(x) {
        return typeof root.escapeHtml === 'function'
            ? root.escapeHtml(String(x == null ? '' : x))
            : String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }
    function norm(x) { return String(x || '').toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
    function hcpText(v) {
        if (v == null || v === '' || !isFinite(Number(v))) return '—';
        return typeof root.fmtExactHcp === 'function' ? root.fmtExactHcp(Number(v)) : String(v);
    }
    function when(ts) { return new Date(ts).toLocaleString(en() ? 'en-GB' : 'ru-RU'); }
    var SOURCES = {
        'rusgolf-self': { ru: 'RUSGOLF · своя карточка (сохранено в профиль)', en: 'RUSGOLF · own card (saved to profile)' },
        'rusgolf-form': { ru: 'RUSGOLF · форма создания раунда', en: 'RUSGOLF · round setup form' },
        'manual-admin': { ru: 'Вручную в админке', en: 'Manual edit in admin' },
        'agr-admin': { ru: 'Синхронизация АГР (админ)', en: 'AGR sync (admin)' },
        'excel-import': { ru: 'Импорт Excel', en: 'Excel import' }
    };
    function sourceLabel(code) {
        var s = SOURCES[code];
        return s ? (en() ? s.en : s.ru) : String(code || '—');
    }
    function actorLabel(e) {
        var role = e.actorRole === 'master' ? (en() ? 'master password' : 'мастер-пароль')
            : e.actorRole === 'admin' ? (en() ? 'admin' : 'админ')
            : (en() ? 'player' : 'игрок');
        return esc(e.actorName || '—') + ' <small style="color:var(--muted);">(' + esc(role) + ')</small>';
    }
    function change(e) {
        var old = e.oldHcp == null ? '—' : hcpText(e.oldHcp);
        return '<strong>' + esc(old) + ' → ' + esc(hcpText(e.newHcp)) + '</strong>';
    }
    function filtered() {
        var q = norm(el('hcp-log-search') && el('hcp-log-search').value);
        return entries.filter(function (e) {
            if (!q) return true;
            var hay = norm(e.playerName) + ' ' + norm(e.actorName);
            return q.split(' ').every(function (part) { return hay.indexOf(part) !== -1; });
        });
    }
    function render() {
        var target = el('hcp-log-results');
        if (!target) return;
        var list = filtered().sort(function (a, b) { return b.at - a.at; });
        if (!list.length) {
            target.innerHTML = '<p class="empty">' + (en() ? 'No handicap updates found.' : 'Обновлений гандикапа не найдено.') + '</p>';
            return;
        }
        // Последнее обновление по каждому игроку (по ФИО; при наличии uid — по uid).
        var latest = {}, order = [];
        list.forEach(function (e) {
            var key = e.playerUid ? 'uid:' + e.playerUid : 'name:' + norm(e.playerName);
            if (!latest[key]) { latest[key] = e; order.push(key); }
        });
        var summary = order.slice(0, 200).map(function (key) {
            var e = latest[key];
            return '<div class="list-item" style="padding:10px 12px;margin:6px 0;display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:space-between;">' +
                '<span><b>' + esc(e.playerName || '—') + '</b> · ' + change(e) + '</span>' +
                '<small style="color:var(--muted);">' + esc(when(e.at)) + ' · ' + (en() ? 'by ' : 'кто: ') + actorLabel(e) + '</small>' +
                '</div>';
        }).join('');
        var history = list.slice(0, 300).map(function (e) {
            return '<div class="card" style="padding:10px 12px;margin:6px 0;border-left:3px solid var(--gold);">' +
                '<b>' + esc(e.playerName || '—') + '</b> · ' + change(e) + '<br>' +
                '<small>' + esc(when(e.at)) + ' · ' + (en() ? 'updated by ' : 'обновил: ') + actorLabel(e) + '</small><br>' +
                '<small style="color:var(--muted);">' + esc(sourceLabel(e.source)) + (e.note ? ' · ' + esc(e.note) : '') + '</small>' +
                '</div>';
        }).join('');
        target.innerHTML =
            '<h3 style="margin:14px 0 4px;font-size:15px;">' + (en() ? 'Latest update per player' : 'Последнее обновление по игрокам') + '</h3>' +
            '<p style="color:var(--muted);font-size:12px;margin:0 0 4px;">' + order.length + (en() ? ' players' : ' игроков') + '</p>' +
            summary +
            '<h3 style="margin:18px 0 4px;font-size:15px;">' + (en() ? 'History' : 'История обновлений') + '</h3>' +
            '<p style="color:var(--muted);font-size:12px;margin:0 0 4px;">' + list.length + (en() ? ' updates (last 500 stored)' : ' записей (хранятся последние 500)') + '</p>' +
            history;
    }
    root.hcpLogLoad = function () {
        var target = el('hcp-log-results');
        if (!target || !root.db) return;
        target.textContent = en() ? 'Loading…' : 'Загрузка…';
        root.db.ref('hcpLog').orderByChild('at').limitToLast(500).once('value').then(function (sn) {
            var val = sn.val() || {};
            entries = Object.keys(val).map(function (k) { return val[k]; })
                .filter(function (e) { return e && typeof e.at === 'number'; });
            render();
        }).catch(function (err) {
            target.textContent = '❌ ' + (err && err.message || err);
        });
    };
    root.hcpLogFilter = render;
})(typeof window !== 'undefined' ? window : this);
