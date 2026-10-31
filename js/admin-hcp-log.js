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
    // Понятная причина вместо сырого PERMISSION_DENIED от Firebase.
    function errorText(err) {
        var raw = String((err && (err.message || err.code)) || err || '');
        if (/index/i.test(raw)) {
            return en()
                ? 'The handicap log has no index for the query. Deploy database.rules.json (".indexOn": ["at"] for hcpLog).'
                : 'В правилах БД нет индекса для журнала. Разверните database.rules.json (узел hcpLog, ".indexOn": ["at"]).';
        }
        if (/permission|denied/i.test(raw)) {
            return en()
                ? 'No access to the handicap log: administrator rights and the deployed database rules are required.'
                : 'Нет доступа к журналу: нужны права администратора и развёрнутые правила БД (узел hcpLog).';
        }
        return raw || (en() ? 'Unknown error' : 'Неизвестная ошибка');
    }
    function showError(target, err) {
        target.innerHTML = '<p class="empty" style="color:var(--red);">❌ ' + esc(errorText(err)) + '</p>';
    }
    function emptyHtml() {
        return '<p class="empty">' +
            (en() ? 'No handicap updates yet.' : 'Записей пока нет.') +
            '</p><p style="color:var(--muted);font-size:12px;margin:0;">' +
            (en()
                ? 'The log is filled when a handicap changes: RUSGOLF lookup in round setup, manual edit in the admin panel, AGR sync or Excel import.'
                : 'Журнал заполняется при изменении гандикапа: запрос RUSGOLF в создании раунда, правка в админке, синхронизация АГР или импорт Excel.') +
            '</p>';
    }
    function render() {
        var target = el('hcp-log-results');
        if (!target) return;
        var list = filtered().sort(function (a, b) { return b.at - a.at; });
        if (!list.length) {
            // «Журнал пуст» и «по фильтру ничего» — разные состояния, и лечатся
            // они по-разному: в первом случае нужно изменить гандикап, во втором
            // — стереть запрос в поиске.
            target.innerHTML = entries.length
                ? '<p class="empty">' + (en() ? 'No records match the search.' : 'По запросу ничего не найдено.') + '</p>'
                : emptyHtml();
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
    function applyValue(target, val) {
        entries = Object.keys(val || {}).map(function (k) { return val[k]; })
            .filter(function (e) { return e && typeof e.at === 'number'; });
        render();
        return entries.length;
    }
    // Честное состояние вместо тишины: раньше без соединения с базой вкладка
    // оставалась пустой и выглядела «сломанной».
    root.hcpLogLoad = function () {
        var target = el('hcp-log-results');
        if (!target) return Promise.resolve(0);
        if (!root.db) {
            target.innerHTML = '<p class="empty">' +
                (en() ? 'No database connection: the log cannot be loaded.' : 'Нет соединения с базой: журнал не загрузить.') +
                '</p>';
            return Promise.resolve(0);
        }
        target.textContent = en() ? 'Loading…' : 'Загрузка…';
        var plain = function () {
            return root.db.ref('hcpLog').once('value').then(function (sn) { return sn.val() || {}; });
        };
        return root.db.ref('hcpLog').orderByChild('at').limitToLast(500).once('value')
            .then(function (sn) { return sn.val() || {}; })
            .catch(function (err) {
                // Нет индекса ".indexOn": ["at"] (правила не развёрнуты) — читаем
                // узел целиком и сортируем на клиенте: журнал важнее скорости.
                try { console.warn('[hcp log] ordered read failed, plain read fallback', err); } catch (e) { console.warn('[silent]', e); }
                return plain().catch(function (err2) {
                    showError(target, err2 || err);
                    return null;
                });
            })
            .then(function (val) {
                if (val == null) return 0;
                return applyValue(target, val);
            })
            .catch(function (err) {
                showError(target, err);
                return 0;
            });
    };
    root.hcpLogFilter = render;
})(typeof window !== 'undefined' ? window : this);
