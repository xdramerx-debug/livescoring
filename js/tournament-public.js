// ============================================================
// PUBLIC TOURNAMENTS V2
// ------------------------------------------------------------
// Replaces only the public catalogue renderer. Legacy tournament helpers
// (registration modal, scorecards and formatting) remain available as
// fallbacks. The page is a small hash/query-routed detail view so old links
// and old RTDB tournament records continue to work.
// ============================================================
(function (root) {
    'use strict';

    var state = root.TournamentPublicState = {
        tournaments: {},
        rounds: {},
        protocols: {},
        course: null,
        filter: 'upcoming',
        query: '',
        detailId: null,
        detailTab: 'overview',
        bound: false,
        roundsBound: false,
        protocolsBound: false,
        courseBound: false,
        initialized: false,
        tournamentsLoaded: false
    };

    function el(id) { return document.getElementById(id); }
    function esc(value) {
        if (typeof root.escapeHtml === 'function') return root.escapeHtml(value == null ? '' : String(value));
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }
    function safeUrl(value) {
        var s = String(value == null ? '' : value).trim();
        if (!s || /^(javascript|data|vbscript):/i.test(s)) return '';
        return /^(https?:\/\/|\/|\.\/|\.\.\/)/i.test(s) ? s : '';
    }
    function lang() { return root.currentLang === 'en' ? 'en' : 'ru'; }
    function ru(ruText, enText) { return lang() === 'en' ? enText : ruText; }
    function database() { return root.db && typeof root.db.ref === 'function' ? root.db : null; }
    function getCore() { return root.TournamentCore || null; }
    function dateTs(value) {
        if (typeof root.tnDateTs === 'function') return root.tnDateTs(value);
        if (typeof value === 'number') return value;
        var d = new Date(String(value || ''));
        return isNaN(d.getTime()) ? 0 : d.getTime();
    }
    function formatDate(value) {
        var ts = dateTs(value);
        if (!ts) return '—';
        try { return new Date(ts).toLocaleDateString(lang() === 'en' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return String(value || '—'); }
    }
    function formatTime(value) {
        if (!value) return '';
        var d = new Date(value);
        if (!isNaN(d.getTime()) && typeof value !== 'string') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return String(value).slice(0, 5);
    }
    function listValue(value) {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object') return Object.keys(value).map(function (key) { return value[key]; });
        return [];
    }
    function tournamentEntries() {
        return Object.keys(state.tournaments || {}).map(function (key) {
            var t = state.tournaments[key] || {};
            t._key = key;
            return t;
        });
    }
    function courseName(t) {
        if (state.course && state.course.name) return state.course.name;
        return t.courseName || t.course || ru('Поле клуба', 'Club course');
    }
    function currentRegistration(t) {
        var core = getCore();
        return core ? core.isRegistrationOpen(t) : (String(t.status || 'upcoming') === 'upcoming');
    }
    function classification(t) {
        var core = getCore();
        return core ? core.classify(t) : { status: t.status || 'upcoming', upcoming: t.status !== 'completed', registrationOpen: t.status === 'upcoming', past: t.status === 'completed' };
    }
    function statusLabel(t, c) {
        var status = c.status;
        if (c.registrationOpen) return { text: ru('Регистрация открыта', 'Registration open'), cls: 'registration', icon: 'fa-door-open' };
        if (status === 'active') return { text: ru('Идёт сейчас', 'Live now'), cls: 'live', icon: 'fa-circle' };
        if (status === 'completed') return { text: ru('Завершён', 'Completed'), cls: 'completed', icon: 'fa-check' };
        if (status === 'cancelled') return { text: ru('Отменён', 'Cancelled'), cls: 'cancelled', icon: 'fa-xmark' };
        if (status === 'closed') return { text: ru('Регистрация закрыта', 'Registration closed'), cls: 'closed', icon: 'fa-lock' };
        return { text: ru('Предстоящий', 'Upcoming'), cls: 'upcoming', icon: 'fa-calendar' };
    }
    function formatLabel(value) {
        if (typeof root.pestovoFormatLabel === 'function') return root.pestovoFormatLabel(value);
        var map = { 'Stroke Play (Net)': ru('Нетто', 'Net'), 'Stroke Play (Gross)': ru('Гросс', 'Gross'), Stableford: 'Stableford', 'Match Play 1v1': 'Match Play 1v1', 'Match Play 2v2': 'Match Play 2v2' };
        return map[value] || String(value || '—');
    }
    function tournamentFormats(t) {
        var formats = listValue(t.formats);
        if (!formats.length && t.wizard && t.wizard.scoring) formats = listValue(t.wizard.scoring.systems);
        return formats;
    }
    function roster(t) {
        var raw = t.registeredPlayers || {};
        if (typeof root.tnDedupeRoster === 'function') {
            try { return root.tnDedupeRoster(raw).map(function (x) { return x.rp || x; }); } catch (e) { /* legacy shape fallback */ }
        }
        return Object.keys(raw).map(function (key) { var p = raw[key] || {}; p._key = key; return p; });
    }
    function rosterCount(t) { return roster(t).length; }
    function limit(t) {
        var core = getCore();
        return core ? core.registrationConfig(t).limit : numValue(t.registration && t.registration.limit);
    }
    function numValue(value) { var n = parseInt(value, 10); return isFinite(n) && n > 0 ? n : 0; }
    function safeName(p, key) {
        if (typeof root.privacyDisplayName === 'function') {
            try { return root.privacyDisplayName(p, key); } catch (e) { /* use stored name */ }
        }
        return p.name || [p.lastName, p.firstName].filter(Boolean).join(' ') || '—';
    }
    function isAlreadyApplied(t) {
        var uid = root.currentUser && root.currentUser.uid;
        var name = root.currentUserData && root.currentUserData.name;
        var regs = t.registeredPlayers || {}, waits = t.waitlist || {}, apps = t.applications || {};
        if (uid && (regs[uid] || waits[uid])) return true;
        var normalized = function (v) { return String(v || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim(); };
        if (!name) return false;
        return Object.keys(regs).concat(Object.keys(waits), Object.keys(apps)).some(function (key) {
            var p = regs[key] || waits[key] || apps[key] || {};
            return normalized(p.name) === normalized(name);
        });
    }
    function qrUrl(data) {
        return 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=3&data=' + encodeURIComponent(data);
    }
    function pageUrl(page, query) {
        var path = window.location.pathname;
        var dir = path.substring(0, path.lastIndexOf('/') + 1);
        return window.location.origin + dir + page + (query ? '?' + query : '');
    }
    function bindRealtime(key, ref, callback) {
        if (!ref || typeof ref.on !== 'function') return;
        if (typeof root.bindRealtimeValue === 'function') root.bindRealtimeValue(key, ref, callback);
        else ref.on('value', callback);
    }

    function loadTournamentsV2() {
        var db = database();
        if (!db) {
            renderCatalogError(ru('Нет подключения к базе данных.', 'No database connection.'));
            return;
        }
        if (!state.bound) {
            state.bound = true;
            bindRealtime('public-tournaments-v2', db.ref('tournaments'), function (snapshot) {
                state.tournaments = snapshot && snapshot.val ? (snapshot.val() || {}) : {};
                state.tournamentsLoaded = true;
                render();
            });
        }
        if (!state.roundsBound) {
            state.roundsBound = true;
            bindRealtime('public-tournament-rounds-v2', db.ref('rounds'), function (snapshot) {
                state.rounds = snapshot && snapshot.val ? (snapshot.val() || {}) : {};
                if (state.detailId && state.detailTab === 'leaderboard') renderDetail();
            });
        }
        if (!state.protocolsBound) {
            state.protocolsBound = true;
            bindRealtime('public-tournament-protocols-v2', db.ref('protocols'), function (snapshot) {
                state.protocols = snapshot && snapshot.val ? (snapshot.val() || {}) : {};
                if (state.detailId && (state.detailTab === 'start' || state.detailTab === 'protocol')) renderDetail();
            });
        }
        if (!state.courseBound) {
            state.courseBound = true;
            bindRealtime('public-tournament-course-v2', db.ref('settings/course'), function (snapshot) {
                state.course = snapshot && snapshot.val ? snapshot.val() : null;
                if (state.detailId) renderDetail();
            });
        }
    }

    function matchesFilter(t) {
        var c = classification(t);
        if (state.filter === 'registration') return c.registrationOpen;
        if (state.filter === 'past') return c.past;
        return c.upcoming && !c.past && c.status !== 'cancelled';
    }
    function filteredEntries() {
        var q = String(state.query || '').toLowerCase().replace(/ё/g, 'е').trim();
        return tournamentEntries().filter(function (t) {
            if (!matchesFilter(t)) return false;
            return !q || String(t.name || '').toLowerCase().replace(/ё/g, 'е').indexOf(q) !== -1;
        }).sort(function (a, b) {
            return (dateTs(a.date) || a.createdAt || 0) - (dateTs(b.date) || b.createdAt || 0);
        });
    }
    function setCount(id, n) { var node = el(id); if (node) node.textContent = String(n); }
    function renderCounts() {
        var items = tournamentEntries();
        var upcoming = 0, registration = 0, past = 0;
        items.forEach(function (t) {
            var c = classification(t);
            if (c.registrationOpen) registration++;
            if (c.upcoming && !c.past && c.status !== 'cancelled') upcoming++;
            if (c.past) past++;
        });
        setCount('tn-count-upcoming', upcoming);
        setCount('tn-count-registration', registration);
        setCount('tn-count-past', past);
    }
    function cardHtml(t) {
        var c = classification(t), badge = statusLabel(t, c), formats = tournamentFormats(t), count = rosterCount(t), max = limit(t), full = max > 0 && count >= max;
        var banner = safeUrl(t.banner || t.image || '');
        var regAction = '';
        if (c.registrationOpen && !full && !isAlreadyApplied(t)) {
            regAction = '<button type="button" class="btn btn-g tn-public-apply" data-tn-action="apply" data-tn-id="' + esc(t._key) + '"><i class="fas fa-user-plus"></i> ' + ru('Подать заявку', 'Apply') + '</button>';
        } else if (c.registrationOpen && full) {
            regAction = '<span class="tn-public-note"><i class="fas fa-hourglass-half"></i> ' + ru('Лист ожидания', 'Waitlist') + '</span>';
        } else if (isAlreadyApplied(t)) {
            regAction = '<span class="tn-public-note success"><i class="fas fa-circle-check"></i> ' + ru('Заявка отправлена', 'Application sent') + '</span>';
        }
        return '<article class="tn-public-card" data-tn-card="' + esc(t._key) + '">' +
            '<div class="tn-public-card-banner"' + (banner ? ' style="background-image:linear-gradient(115deg,rgba(11,26,14,.2),rgba(11,26,14,.7)),url(\'' + esc(banner) + '\')"' : '') + '></div>' +
            '<div class="tn-public-card-body"><div class="tn-public-card-top"><h3><button type="button" data-tn-action="detail" data-tn-id="' + esc(t._key) + '">' + esc(t.name || ru('Без названия', 'Untitled')) + '</button></h3>' +
            '<span class="tn-public-badge ' + badge.cls + '"><i class="fas ' + badge.icon + '"></i> ' + esc(badge.text) + '</span></div>' +
            '<div class="tn-public-meta"><span><i class="fas fa-calendar-day"></i> ' + esc(formatDate(t.date)) + '</span><span><i class="fas fa-flag"></i> ' + esc(courseName(t)) + '</span><span><i class="fas fa-users"></i> ' + count + (max ? '/' + max : '') + '</span></div>' +
            '<div class="tn-public-format">' + (formats.length ? formats.slice(0, 3).map(function (f) { return '<span class="tn-public-chip">' + esc(formatLabel(f)) + '</span>'; }).join('') : '<span class="tn-public-chip">' + ru('Формат уточняется', 'Format to be confirmed') + '</span>') + '</div>' +
            '<p class="tn-public-card-desc">' + esc(t.description || ru('Откройте карточку, чтобы увидеть участников, стартовый лист и результаты.', 'Open the card for participants, tee sheet and results.')) + '</p>' +
            '<div class="tn-public-card-actions">' + regAction + '<button type="button" class="btn btn-og btn-sm tn-public-open" data-tn-action="detail" data-tn-id="' + esc(t._key) + '"><i class="fas fa-arrow-right"></i> ' + ru('Подробнее', 'View details') + '</button></div></div></article>';
    }
    function renderCatalog() {
        var rootNode = el('tn-list'), status = el('tn-public-status');
        if (!rootNode) return;
        renderCounts();
        var items = filteredEntries();
        if (status) status.textContent = items.length ? ru('Показано турниров: ', 'Tournaments shown: ') + items.length : ru('По выбранному фильтру турниров не найдено.', 'No tournaments match this filter.');
        rootNode.innerHTML = items.length ? items.map(cardHtml).join('') : '<div class="tn-public-empty"><i class="fas fa-calendar-xmark"></i><div>' + ru('Здесь пока нет турниров.', 'No tournaments here yet.') + '</div><small>' + ru('Попробуйте изменить вкладку или поисковый запрос.', 'Try another tab or search query.') + '</small></div>';
    }
    function renderCatalogError(message) {
        var status = el('tn-public-status');
        if (status) status.innerHTML = '<span class="tn-public-error">' + esc(message) + '</span>';
    }

    function latestProtocol(t) {
        var found = null;
        Object.keys(state.protocols || {}).forEach(function (key) {
            var p = state.protocols[key] || {};
            if (String(p.tournamentId || '') !== String(t._key)) return;
            if (!found || (p.updatedAt || p.createdAt || 0) > (found.updatedAt || found.createdAt || 0)) { found = cloneWithKey(p, key); }
        });
        return found;
    }
    function cloneWithKey(value, key) { var copy = {}; Object.keys(value || {}).forEach(function (k) { copy[k] = value[k]; }); copy._key = key; return copy; }
    function protocolGroups(proto) {
        if (!proto) return [];
        var groups = proto.groups || proto.startingGroups || {};
        return Array.isArray(groups) ? groups : Object.keys(groups).map(function (key) { var g = groups[key] || {}; g._key = key; return g; });
    }
    function groupPlayers(group) { return listValue(group.players || group.members || []); }
    function startListHtml(t) {
        var proto = latestProtocol(t), groups = protocolGroups(proto);
        if (!groups.length) return '<div class="tn-public-empty"><i class="fas fa-clock"></i><div>' + ru('Стартовый лист ещё не опубликован.', 'Tee sheet has not been published yet.') + '</div><small>' + ru('Организатор может добавить его в админ-панели.', 'The organiser can publish it from the admin panel.') + '</small></div>';
        var protoUrl = pageUrl('qr-start.html', 'p=' + encodeURIComponent(proto._key));
        return '<div class="tn-protocol-actions"><span class="tn-public-chip"><i class="fas fa-qrcode"></i> ' + ru('QR ведёт на счётную карточку', 'QR opens the scorecard') + '</span><a class="btn btn-og btn-sm" target="_blank" rel="noopener" href="' + esc(protoUrl) + '"><i class="fas fa-print"></i> ' + ru('Открыть лист для печати', 'Open printable sheet') + '</a></div><div class="tn-start-list">' + groups.sort(function (a, b) { return (a.startTime || 0) - (b.startTime || 0); }).map(function (g, i) {
            var players = groupPlayers(g), names = players.map(function (p) { return esc(safeName(p, p.id || p.uid)); }).join('<br>');
            var time = g.startTime ? formatTime(g.startTime) : '—', hole = g.startHole || g.hole || '1';
            return '<div class="tn-start-row"><strong class="tn-start-time">' + esc(time) + '</strong><span class="tn-start-hole"><i class="fas fa-location-dot"></i> ' + ru('л.', 'hole ') + esc(hole) + '</span><span class="tn-start-names"><b>' + ru('Группа ', 'Group ') + (i + 1) + '</b><br>' + names + '</span><img class="tn-start-qr" loading="lazy" src="' + esc(qrUrl(protoUrl + '&g=' + encodeURIComponent(g._key || i))) + '" alt="QR"></div>';
        }).join('') + '</div>';
    }
    function participantsHtml(t) {
        var people = roster(t), waits = listValue(t.waitlist), max = limit(t);
        return '<div class="tn-detail-grid"><div class="tn-detail-stat"><b>' + people.length + (max ? '/' + max : '') + '</b><span>' + ru('подтверждённых участников', 'confirmed participants') + '</span></div><div class="tn-detail-stat"><b>' + waits.length + '</b><span>' + ru('в листе ожидания', 'on the waitlist') + '</span></div></div>' + (people.length ? '<h3>' + ru('Список участников', 'Participants') + '</h3><div class="tn-public-table-wrap"><table class="tn-public-table"><thead><tr><th>#</th><th>' + ru('Игрок', 'Player') + '</th><th>HCP</th><th>' + ru('Ти', 'Tee') + '</th></tr></thead><tbody>' + people.map(function (p, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(safeName(p, p._key)) + '</td><td>' + esc(p.handicap == null ? '—' : p.handicap) + '</td><td>' + esc(p.tee || '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="tn-protocol-note">' + ru('Подтверждённых участников пока нет.', 'No confirmed participants yet.') + '</div>');
    }
    function playerStatus(row) {
        var status = String(row.status || '').toUpperCase();
        return status && status !== 'ACTIVE' ? '<span class="tn-result-status">' + esc(status) + '</span>' : (row.holes ? '<span class="tn-live-indicator"><i class="fas fa-circle"></i> LIVE</span>' : '—');
    }
    function leaderboardHtml(t) {
        var core = getCore(), rows = core ? core.buildLeaderboard(Object.assign({}, t, { _key: t._key }), state.rounds, state.course) : [];
        if (!rows.length) return '<div class="tn-public-empty"><i class="fas fa-ranking-star"></i><div>' + ru('Результатов пока нет.', 'No scores yet.') + '</div><small>' + ru('Лидерборд обновится автоматически после первого счёта.', 'The leaderboard updates automatically after the first score.') + '</small></div>';
        var formatText = JSON.stringify(t.formats || []) + JSON.stringify(t.wizard && t.wizard.scoring || {}), isStable = /stableford/i.test(formatText), isGross = !isStable && /gross|stroke-gross/i.test(formatText);
        return '<div class="tn-protocol-actions"><span class="tn-live-indicator"><i class="fas fa-circle"></i> ' + (classification(t).status === 'active' ? ru('LIVE · обновляется автоматически', 'LIVE · updates automatically') : ru('Последняя опубликованная версия', 'Last published version')) + '</span><span class="tn-public-chip">' + (isStable ? 'Stableford' : isGross ? ru('Stroke Play · Gross', 'Stroke Play · Gross') : ru('Stroke Play · Net', 'Stroke Play · Net')) + '</span></div>' + '<div class="tn-public-table-wrap"><table class="tn-public-table"><thead><tr><th>#</th><th>' + ru('Игрок', 'Player') + '</th><th>' + ru('Лунки', 'Thru') + '</th><th>Gross</th><th>Net</th><th>Stableford</th><th>' + ru('Статус', 'Status') + '</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + (r.position == null ? '—' : r.position) + '</td><td class="' + (r.holes ? 'tn-live-name' : '') + '">' + esc(safeName({ name: r.name }, r.key)) + '</td><td>' + r.thru + '</td><td>' + (r.gross || '—') + '</td><td>' + (r.net || '—') + '</td><td>' + (r.stableford || '—') + '</td><td>' + playerStatus(r) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }
    function finalProtocolRows(t) {
        if (t.protocol && t.protocol.published && Array.isArray(t.protocol.rows)) return t.protocol.rows;
        var core = getCore();
        return core ? core.protocolRows(Object.assign({}, t, { _key: t._key }), state.rounds, state.course) : [];
    }
    function nominationHtml(t) {
        var nominations = t.protocol && Array.isArray(t.protocol.nominations) ? t.protocol.nominations : [];
        if (!nominations.length) return '';
        return '<h3>' + ru('Номинации', 'Awards') + '</h3><div class="tn-nomination-grid">' + nominations.map(function (nomination) { var winners = nomination.winners || []; return '<div class="tn-nomination"><b>' + esc(nomination.label || nomination.id || ru('Номинация', 'Award')) + '</b>' + (winners.length ? '<ol>' + winners.map(function (winner) { return '<li>' + esc(safeName({ name: winner.name }, winner.key)) + '</li>'; }).join('') + '</ol>' : '<small>' + ru('Результат не определён', 'No eligible result') + '</small>') + '</div>'; }).join('') + '</div>';
    }
    function protocolHtml(t) {
        var rows = finalProtocolRows(t);
        var pdfUrl = t.protocol && safeUrl(t.protocol.pdfUrl || t.protocol.url);
        if (!rows.length && !pdfUrl) return '<div class="tn-public-empty"><i class="fas fa-file-pdf"></i><div>' + ru('Итоговый протокол ещё не опубликован.', 'Final protocol has not been published yet.') + '</div></div>';
        var versionNote = t.protocol && t.protocol.published ? '<span class="tn-public-chip">v' + esc(t.protocol.version || 1) + ' · ' + ru('зафиксирован', 'fixed') + '</span>' : '';
        return '<div class="tn-protocol-actions">' + versionNote + (pdfUrl ? '<a class="btn btn-g btn-sm" target="_blank" rel="noopener" href="' + esc(pdfUrl) + '"><i class="fas fa-file-pdf"></i> ' + ru('Скачать PDF', 'Download PDF') + '</a>' : '') + (rows.length ? '<button type="button" class="btn btn-og btn-sm" data-tn-action="print-protocol" data-tn-id="' + esc(t._key) + '"><i class="fas fa-print"></i> ' + ru('Печать / PDF', 'Print / PDF') + '</button><button type="button" class="btn btn-og btn-sm" data-tn-action="csv-protocol" data-tn-id="' + esc(t._key) + '"><i class="fas fa-file-csv"></i> CSV</button>' : '') + '</div>' + (rows.length ? '<div class="tn-public-table-wrap"><table class="tn-public-table"><thead><tr><th>#</th><th>' + ru('Игрок', 'Player') + '</th><th>HCP</th><th>Gross</th><th>Net</th><th>Stableford</th><th>Total</th><th>' + ru('Статус', 'Status') + '</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + (r.position == null ? '—' : r.position) + '</td><td>' + esc(safeName({ name: r.name }, r.key)) + '</td><td>' + esc(r.handicap == null ? '—' : r.handicap) + '</td><td>' + r.gross + '</td><td>' + r.net + '</td><td>' + r.stableford + '</td><td>' + r.total + '</td><td>' + (r.status === 'ACTIVE' ? '—' : '<span class="tn-result-status">' + esc(r.status) + '</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') + nominationHtml(t);
    }
    function applicationHtml(t, c) {
        if (!c.registrationOpen) return '<div class="tn-protocol-note"><i class="fas fa-lock"></i> ' + ru('Приём заявок закрыт.', 'Applications are closed.') + '</div>';
        if (isAlreadyApplied(t)) return '<div class="tn-protocol-note"><i class="fas fa-circle-check"></i> ' + ru('Ваша заявка уже зарегистрирована. Статус можно уточнить у секретаря.', 'Your application is already registered. Ask the secretary for its status.') + '</div>';
        var max = limit(t), full = max && rosterCount(t) >= max;
        return '<form class="tn-application" id="tn-public-application-form" data-tn-id="' + esc(t._key) + '"><h3><i class="fas fa-user-plus"></i> ' + ru('Заявка на участие', 'Tournament application') + '</h3>' + (full ? '<div class="tn-application-note">' + ru('Лимит подтверждённых участников достигнут. Заявка попадёт в лист ожидания.', 'The confirmed-player limit is reached. Your application will go to the waitlist.') + '</div>' : '') + '<div class="tn-application-grid"><label>' + ru('ФИО', 'Full name') + ' *<input name="name" required maxlength="120" value="' + esc(root.currentUserData && root.currentUserData.name || '') + '"></label><label>HCP<input name="handicap" type="number" min="-10" max="54" step="0.1" value="' + esc(root.currentUserData && root.currentUserData.handicap != null ? root.currentUserData.handicap : '') + '"></label><label>' + ru('Пол', 'Gender') + '<select name="gender"><option value="men">' + ru('Мужчины', 'Men') + '</option><option value="women">' + ru('Девушки', 'Women') + '</option></select></label><label>' + ru('Ти', 'Tee') + '<select name="tee"><option value="wh">' + ru('Белые', 'White') + '</option><option value="rd">' + ru('Красные', 'Red') + '</option><option value="bl">' + ru('Синие', 'Blue') + '</option><option value="bk">' + ru('Чёрные', 'Black') + '</option></select></label><label>Email<input name="email" type="email" maxlength="160" value="' + esc(root.currentUser && root.currentUser.email || '') + '"></label><label>' + ru('Телефон', 'Phone') + '<input name="phone" type="tel" maxlength="32"></label></div><div class="tn-application-actions"><button class="btn btn-g" type="submit"><i class="fas fa-paper-plane"></i> ' + ru('Отправить заявку', 'Submit application') + '</button><span class="tn-application-note">' + ru('Данные используются только для организации турнира.', 'Used only for tournament administration.') + '</span></div></form>';
    }

    function detailPanel(t) {
        var c = classification(t), tab = state.detailTab;
        if (tab === 'start') return '<div class="tn-detail-panel"><h2><i class="fas fa-qrcode"></i> ' + ru('Стартовый лист', 'Tee sheet') + '</h2>' + startListHtml(t) + '</div>';
        if (tab === 'participants') return '<div class="tn-detail-panel"><h2><i class="fas fa-users"></i> ' + ru('Участники', 'Participants') + '</h2>' + participantsHtml(t) + applicationHtml(t, c) + '</div>';
        if (tab === 'leaderboard') return '<div class="tn-detail-panel"><h2><i class="fas fa-ranking-star"></i> ' + ru('Лидерборд', 'Leaderboard') + '</h2>' + leaderboardHtml(t) + '</div>';
        if (tab === 'protocol') return '<div class="tn-detail-panel"><h2><i class="fas fa-file-signature"></i> ' + ru('Итоговый протокол', 'Final protocol') + '</h2>' + protocolHtml(t) + '</div>';
        return '<div class="tn-detail-panel"><h2><i class="fas fa-circle-info"></i> ' + ru('О турнире', 'About the tournament') + '</h2><div class="tn-detail-grid"><div class="tn-detail-stat"><b>' + rosterCount(t) + '</b><span>' + ru('участников подтверждено', 'confirmed participants') + '</span></div><div class="tn-detail-stat"><b>' + (t.roundsMeta ? listValue(t.roundsMeta).length : 1) + '</b><span>' + ru('раунд(а)', 'round(s)') + '</span></div><div class="tn-detail-stat"><b>' + esc((t.tees || ['wh']).join(', ').toUpperCase()) + '</b><span>' + ru('доступные ти', 'available tees') + '</span></div></div><p class="tn-detail-description">' + esc(t.description || ru('Регламент турнира и детали старта будут опубликованы организатором.', 'The organiser will publish the tournament regulations and start details.')) + '</p>' + applicationHtml(t, c) + '</div>';
    }
    function renderDetail() {
        var detail = el('tn-public-detail'), catalog = el('tn-public-catalog'), rootNode = el('tn-detail-content'), t = state.tournaments[state.detailId];
        if (!detail || !catalog || !rootNode) return;
        if (!t) {
            // Keep a direct ?id link alive while the first RTDB snapshot is
            // loading; only clear it after a non-empty snapshot proves that
            // the requested tournament no longer exists.
            if (!state.tournamentsLoaded) {
                catalog.classList.add('hidden'); detail.classList.remove('hidden');
                rootNode.innerHTML = '<div class="tn-public-loading"><i class="fas fa-spinner fa-spin"></i> ' + ru('Загрузка турнира…', 'Loading tournament…') + '</div>';
                return;
            }
            state.detailId = null; catalog.classList.remove('hidden'); detail.classList.add('hidden'); renderCatalogError(ru('Турнир не найден.', 'Tournament not found.')); return;
        }
        t._key = state.detailId;
        var c = classification(t), badge = statusLabel(t, c), formats = tournamentFormats(t);
        catalog.classList.add('hidden'); detail.classList.remove('hidden');
        rootNode.innerHTML = '<div class="tn-detail-hero"><div class="tn-detail-kicker"><i class="fas fa-trophy"></i> ' + ru('Турнир клуба', 'Club tournament') + '</div><div class="tn-detail-title-row"><h1 id="tn-detail-title">' + esc(t.name || '—') + '</h1><span class="tn-public-badge ' + badge.cls + '"><i class="fas ' + badge.icon + '"></i> ' + esc(badge.text) + '</span></div><p class="tn-detail-description">' + esc(t.description || '') + '</p><div class="tn-detail-metrics"><div class="tn-detail-metric"><span>' + ru('Дата', 'Date') + '</span><b>' + esc(formatDate(t.date)) + '</b></div><div class="tn-detail-metric"><span>' + ru('Формат', 'Format') + '</span><b>' + esc(formats.map(formatLabel).join(' · ') || '—') + '</b></div><div class="tn-detail-metric"><span>' + ru('Участники', 'Players') + '</span><b>' + rosterCount(t) + (limit(t) ? '/' + limit(t) : '') + '</b></div></div><div class="tn-course-ref"><i class="fas fa-location-dot"></i><span>' + esc(courseName(t)) + '</span>' + (state.course && state.course.address ? '<span>· ' + esc(state.course.address) + '</span>' : '') + '</div></div><div class="tn-detail-tabs" role="tablist"><button type="button" class="tn-detail-tab ' + (state.detailTab === 'overview' ? 'active' : '') + '" data-tn-detail-tab="overview">' + ru('Обзор', 'Overview') + '</button><button type="button" class="tn-detail-tab ' + (state.detailTab === 'start' ? 'active' : '') + '" data-tn-detail-tab="start">' + ru('Стартовый лист + QR', 'Tee sheet + QR') + '</button><button type="button" class="tn-detail-tab ' + (state.detailTab === 'participants' ? 'active' : '') + '" data-tn-detail-tab="participants">' + ru('Участники и заявка', 'Participants & apply') + '</button><button type="button" class="tn-detail-tab ' + (state.detailTab === 'leaderboard' ? 'active' : '') + '" data-tn-detail-tab="leaderboard">' + ru('Лидерборд', 'Leaderboard') + '</button><button type="button" class="tn-detail-tab ' + (state.detailTab === 'protocol' ? 'active' : '') + '" data-tn-detail-tab="protocol">' + ru('Протокол PDF', 'Protocol PDF') + '</button></div>' + detailPanel(t);
    }
    function render() {
        if (state.detailId) renderDetail();
        else {
            var detail = el('tn-public-detail'), catalog = el('tn-public-catalog');
            if (detail) detail.classList.add('hidden');
            if (catalog) catalog.classList.remove('hidden');
            renderCatalog();
        }
    }
    function openDetail(id, tab) {
        if (!state.tournaments[id]) return;
        state.detailId = id;
        state.detailTab = tab || 'overview';
        try { history.pushState({ tournamentId: id }, '', window.location.pathname + '?id=' + encodeURIComponent(id)); } catch (e) { /* old browsers */ }
        renderDetail();
        window.scrollTo(0, 0);
    }
    function closeDetail() {
        state.detailId = null;
        try { history.pushState({}, '', window.location.pathname); } catch (e) { /* ignore */ }
        render();
        window.scrollTo(0, 0);
    }
    function nominationPrintHtml(t) {
        var nominations = t.protocol && Array.isArray(t.protocol.nominations) ? t.protocol.nominations : [];
        if (!nominations.length) return '';
        return '<h2>Awards / Номинации</h2><ul>' + nominations.map(function (nomination) { return '<li><b>' + esc(nomination.label || nomination.id || 'Award') + '</b>: ' + (nomination.winners || []).map(function (winner) { return esc(safeName({ name: winner.name }, winner.key)); }).join(', ') + '</li>'; }).join('') + '</ul>';
    }
    function printProtocol(id) {
        var t = state.tournaments[id], core = getCore();
        if (!t || !core) return;
        var rows = finalProtocolRows(t), win = window.open('', '_blank');
        if (!win) { if (typeof root.toast === 'function') root.toast(ru('Разрешите всплывающие окна для PDF.', 'Allow pop-ups for PDF.'), 'error'); return; }
        var body = '<h1>' + esc(t.name || 'Tournament') + '</h1><p>' + esc(formatDate(t.date)) + ' · ' + esc(courseName(t)) + '</p><table><tr><th>#</th><th>Player</th><th>HCP</th><th>Gross</th><th>Net</th><th>Stableford</th><th>Total</th><th>Status</th></tr>' + rows.map(function (r) { return '<tr><td>' + (r.position || '—') + '</td><td>' + esc(safeName({ name: r.name }, r.key)) + '</td><td>' + esc(r.handicap == null ? '—' : r.handicap) + '</td><td>' + r.gross + '</td><td>' + r.net + '</td><td>' + r.stableford + '</td><td>' + r.total + '</td><td>' + esc(r.status) + '</td></tr>'; }).join('') + '</table>' + nominationPrintHtml(t) + '<h2>Hole breakdown</h2>' + rows.map(function (r) { return '<h3>' + esc(safeName({ name: r.name }, r.key)) + '</h3><p>' + (r.holes || []).map(function (h) { return h.hole + ': ' + h.gross; }).join(' · ') + '</p>'; }).join('');
        win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(t.name || 'Protocol') + '</title><style>body{font-family:Arial,sans-serif;color:#111;padding:18px;font-size:11px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aaa;padding:5px;text-align:left}th{background:#e9eddc}@media print{button{display:none}}@page{size:A4 landscape;margin:10mm}</style></head><body><button onclick="window.print()">Print / Save PDF</button>' + body + '</body></html>');
        win.document.close();
        setTimeout(function () { try { win.print(); } catch (e) { /* user can print manually */ } }, 300);
    }
    function downloadCsv(id) {
        var t = state.tournaments[id], core = getCore();
        if (!t || !core) return;
        var rows = finalProtocolRows(t).map(function (row) { var copy = {}; Object.keys(row).forEach(function (key) { copy[key] = row[key]; }); copy.name = safeName({ name: row.name }, row.key); return copy; }), blob = new Blob([core.csv(rows)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = (String(t.name || 'tournament').replace(/[^a-zа-я0-9]+/gi, '_') || 'tournament') + '-protocol.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function submitApplication(form) {
        var db = database();
        if (!db) return;
        var id = form.getAttribute('data-tn-id'), t = state.tournaments[id];
        if (!t || !currentRegistration(t)) { if (typeof root.toast === 'function') root.toast(ru('Регистрация закрыта.', 'Registration is closed.'), 'error'); return; }
        var data = new FormData(form), name = String(data.get('name') || '').replace(/\s+/g, ' ').trim(), hcpRaw = String(data.get('handicap') || '').replace(',', '.'), hcp = hcpRaw === '' ? null : parseFloat(hcpRaw);
        if (name.length < 3 || name.split(' ').length < 2) { if (typeof root.toast === 'function') root.toast(ru('Укажите имя и фамилию.', 'Enter first and last name.'), 'error'); return; }
        if (hcp !== null && (!isFinite(hcp) || hcp < -10 || hcp > 54)) { if (typeof root.toast === 'function') root.toast(ru('Гандикап должен быть от −10 до 54.', 'Handicap must be between −10 and 54.'), 'error'); return; }
        if (isAlreadyApplied(t)) { if (typeof root.toast === 'function') root.toast(ru('Такая заявка уже есть.', 'An application already exists.'), 'info'); return; }
        var gender = String(data.get('gender') || 'men') === 'women' ? 'women' : 'men', teeRaw = String(data.get('tee') || 'wh').toLowerCase(), tee = ['bk', 'bl', 'wh', 'ye', 'rd'].indexOf(teeRaw) !== -1 ? teeRaw : 'wh';
        var reg = getCore() ? getCore().registrationConfig(t) : { limit: 0, waitlist: true, approval: 'manual' }, count = rosterCount(t), app = { name: name, handicap: hcp, gender: gender, tee: tee, email: String(data.get('email') || '').trim().slice(0, 160), phone: String(data.get('phone') || '').trim().slice(0, 32), uid: root.currentUser && root.currentUser.uid || null, status: 'pending', createdAt: Date.now() };
        var shouldAuto = reg.approval === 'auto' && (!reg.limit || count < reg.limit), applicationsRef = db.ref('tournaments/' + id + '/applications').push();
        var appId = applicationsRef.key;
        if (!appId) return;
        app.id = appId; app.status = shouldAuto ? 'approved' : 'pending';
        var updates = {};
        updates['tournaments/' + id + '/applications/' + appId] = app;
        if (shouldAuto) updates['tournaments/' + id + '/registeredPlayers/' + (app.uid || ('app_' + appId))] = app;
        else if (reg.waitlist !== false) updates['tournaments/' + id + '/waitlist/' + (app.uid || ('app_' + appId))] = app;
        else { if (typeof root.toast === 'function') root.toast(ru('Лист ожидания отключён.', 'Waitlist is disabled.'), 'error'); return; }
        updates['tournaments/' + id + '/updatedAt'] = Date.now();
        form.querySelectorAll('button[type="submit"]').forEach(function (button) { button.disabled = true; });
        db.ref().update(updates).then(function () {
            if (typeof root.toast === 'function') root.toast(shouldAuto ? ru('Заявка подтверждена!', 'Application approved!') : ru('Заявка отправлена в лист ожидания.', 'Application sent to the waitlist.'), 'success');
            renderDetail();
        }).catch(function (error) {
            if (typeof root.toast === 'function') root.toast('❌ ' + (error && error.message || error), 'error');
            form.querySelectorAll('button[type="submit"]').forEach(function (button) { button.disabled = false; });
        });
    }
    function handleClick(event) {
        var node = event.target.closest ? event.target.closest('[data-tn-action],[data-tn-detail-tab]') : null;
        if (!node) return;
        var action = node.getAttribute('data-tn-action'), id = node.getAttribute('data-tn-id');
        if (node.hasAttribute('data-tn-detail-tab')) { state.detailTab = node.getAttribute('data-tn-detail-tab'); renderDetail(); return; }
        if (action === 'detail') openDetail(id, 'overview');
        else if (action === 'apply') openDetail(id, 'participants');
        else if (action === 'print-protocol') printProtocol(id);
        else if (action === 'csv-protocol') downloadCsv(id);
    }
    function init() {
        if (state.initialized) return;
        state.initialized = true;
        var search = el('tn-public-search');
        if (search) search.addEventListener('input', function () { state.query = search.value || ''; renderCatalog(); });
        document.querySelectorAll('[data-tn-public-filter]').forEach(function (button) { button.addEventListener('click', function () { state.filter = button.getAttribute('data-tn-public-filter') || 'upcoming'; document.querySelectorAll('[data-tn-public-filter]').forEach(function (b) { var on = b === button; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }); renderCatalog(); }); });
        document.addEventListener('click', handleClick);
        document.addEventListener('submit', function (event) { var form = event.target.closest ? event.target.closest('#tn-public-application-form') : null; if (form) { event.preventDefault(); submitApplication(form); } });
        var back = el('tn-detail-back'); if (back) back.addEventListener('click', closeDetail);
        window.addEventListener('popstate', function () { state.detailId = new URLSearchParams(window.location.search).get('id'); state.detailTab = 'overview'; render(); });
        state.detailId = new URLSearchParams(window.location.search).get('id');
        loadTournamentsV2();
        render();
    }
    function onAuthReadyV2(user, data) {
        if (typeof root.navAuth === 'function') root.navAuth(user, data);
        render();
    }

    // Override only the public page entry point; admin uses its own loader.
    root.loadTournaments = loadTournamentsV2;
    root.onAuthReady = onAuthReadyV2;
    root.tnPublicOpenDetail = openDetail;
    root.tnPublicRender = render;
    root.tnPublicPrintProtocol = printProtocol;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(typeof window !== 'undefined' ? window : this);
