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
    function isHiddenFromSite(t) { return !!(t && t.publicAccess === false); }
    function tournamentEntries() {
        return Object.keys(state.tournaments || {}).map(function (key) {
            var t = state.tournaments[key] || {};
            t._key = key;
            return t;
        }).filter(function (t) { return !isHiddenFromSite(t); });
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
        // Пауза турнира (организатор остановил игру) — видна и на публичной странице.
        if (t && t.paused && status !== 'completed') return { text: ru('На паузе', 'Paused'), cls: 'paused', icon: 'fa-pause' };
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
        if (root.PestovoQr && typeof root.PestovoQr.dataUrl === 'function') {
            var local = root.PestovoQr.dataUrl(data, 180);
            if (local) return local;
        }
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
                else if (!state.detailId) renderCatalog();
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
                else renderCatalog();
            });
        }
    }

    function matchesQuery(t) {
        var q = String(state.query || '').toLowerCase().replace(/ё/g, 'е').trim();
        if (!q) return true;
        return String(t.name || '').toLowerCase().replace(/ё/g, 'е').indexOf(q) !== -1;
    }
    function catalogBuckets() {
        var buckets = { active: [], upcoming: [], past: [] };
        tournamentEntries().filter(matchesQuery).forEach(function (t) {
            var c = classification(t);
            if (c.status === 'active') buckets.active.push(t);
            else if (c.past || c.status === 'cancelled') buckets.past.push(t);
            else if (c.upcoming && c.status !== 'draft') buckets.upcoming.push(t);
        });
        buckets.active.sort(function (a, b) { return (dateTs(b.startedAt || b.date) || b.createdAt || 0) - (dateTs(a.startedAt || a.date) || a.createdAt || 0); });
        buckets.upcoming.sort(function (a, b) { return (dateTs(a.date) || a.createdAt || 0) - (dateTs(b.date) || b.createdAt || 0); });
        buckets.past.sort(function (a, b) { return (dateTs(b.finishedAt || b.endDate || b.date) || b.createdAt || 0) - (dateTs(a.finishedAt || a.endDate || a.date) || a.createdAt || 0); });
        return buckets;
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
        var upcomingNode = el('tn-list'), activeNode = el('tn-active-list'), pastNode = el('tn-past-list'), status = el('tn-public-status');
        if (!upcomingNode || !activeNode || !pastNode) return;
        var buckets = catalogBuckets();
        if (status) {
            if (!state.tournamentsLoaded) status.textContent = ru('Загружаем турниры…', 'Loading tournaments…');
            else status.textContent = ru('В игре: ', 'Live: ') + buckets.active.length + ' · ' + ru('предстоящие: ', 'upcoming: ') + buckets.upcoming.length + ' · ' + ru('в архиве: ', 'archived: ') + buckets.past.length;
        }
        activeNode.innerHTML = buckets.active.length
            ? buckets.active.map(activeTournamentHtml).join('')
            : '<div class="tn-active-empty"><i class="fas fa-flag-checkered"></i><div>' + ru('Сейчас нет активного турнира', 'No tournament is live right now') + '</div><small>' + ru('Когда начнётся следующий старт, его лидерборд появится здесь автоматически.', 'The live leaderboard will appear here when the next tournament starts.') + '</small></div>';
        upcomingNode.innerHTML = buckets.upcoming.length
            ? buckets.upcoming.map(cardHtml).join('')
            : '<div class="tn-public-empty"><i class="fas fa-calendar-xmark"></i><div>' + ru('Предстоящих стартов пока нет.', 'There are no upcoming tournaments yet.') + '</div></div>';
        pastNode.innerHTML = buckets.past.length
            ? buckets.past.map(pastTournamentHtml).join('')
            : '<div class="tn-public-empty"><i class="fas fa-box-archive"></i><div>' + ru('В архиве пока нет турниров.', 'The archive is empty.') + '</div></div>';
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
    function activeTournamentHtml(t) {
        var c = classification(t), badge = statusLabel(t, c), formats = tournamentFormats(t);
        var metrics = '<span><i class="fas fa-calendar-day"></i> ' + esc(formatDate(t.date)) + '</span>' +
            '<span><i class="fas fa-location-dot"></i> ' + esc(courseName(t)) + '</span>' +
            '<span><i class="fas fa-users"></i> ' + rosterCount(t) + ' ' + ru('участников', 'players') + '</span>';
        return '<article class="tn-active-card" data-tn-active="' + esc(t._key) + '">' +
            '<header class="tn-active-header"><div class="tn-active-title-wrap"><div class="tn-detail-kicker"><i class="fas fa-satellite-dish"></i> ' + ru('ТУРНИР В ИГРЕ', 'TOURNAMENT LIVE') + '</div>' +
            '<div class="tn-detail-title-row"><h2>' + esc(t.name || ru('Турнир клуба', 'Club tournament')) + '</h2><span class="tn-public-badge ' + badge.cls + '"><i class="fas ' + badge.icon + '"></i> ' + esc(badge.text) + '</span></div>' +
            (t.description ? '<p class="tn-active-description">' + esc(t.description) + '</p>' : '') +
            '<div class="tn-public-meta tn-active-meta">' + metrics + '</div>' +
            '<div class="tn-public-format">' + (formats.length ? formats.slice(0, 4).map(function (format) { return '<span class="tn-public-chip">' + esc(formatLabel(format)) + '</span>'; }).join('') : '') + '</div></div>' +
            '<button type="button" class="btn btn-og btn-sm" data-tn-action="detail" data-tn-id="' + esc(t._key) + '" data-tn-tab="leaderboard"><i class="fas fa-arrow-up-right-from-square"></i> ' + ru('Открыть турнир', 'Open tournament') + '</button></header>' +
            '<div class="tn-active-leaderboard"><div class="tn-active-board-heading"><h3><i class="fas fa-ranking-star"></i> ' + ru('Лидерборд', 'Leaderboard') + '</h3><span class="tn-live-indicator"><i class="fas fa-circle"></i> LIVE</span></div>' + leaderboardHtml(t) + '</div>' +
            '</article>';
    }
    function pastTournamentHtml(t) {
        var c = classification(t), badge = statusLabel(t, c), formats = tournamentFormats(t);
        return '<details class="tn-past-item" data-tn-past="' + esc(t._key) + '"><summary>' +
            '<span class="tn-past-date"><i class="fas fa-calendar-check"></i> ' + esc(formatDate(t.finishedAt || t.endDate || t.date)) + '</span>' +
            '<span class="tn-past-title"><b>' + esc(t.name || ru('Турнир клуба', 'Club tournament')) + '</b><small>' + esc(courseName(t)) + ' · ' + rosterCount(t) + ' ' + ru('участников', 'players') + '</small></span>' +
            '<span class="tn-public-badge ' + badge.cls + '"><i class="fas ' + badge.icon + '"></i> ' + esc(badge.text) + '</span>' +
            '<i class="fas fa-chevron-down tn-past-chevron" aria-hidden="true"></i></summary>' +
            '<div class="tn-past-body"><div class="tn-public-format">' + formats.map(function (format) { return '<span class="tn-public-chip">' + esc(formatLabel(format)) + '</span>'; }).join('') + '</div>' +
            '<div class="tn-active-board-heading"><h3><i class="fas fa-ranking-star"></i> ' + ru('Итоговый лидерборд', 'Final leaderboard') + '</h3></div>' +
            leaderboardHtml(t) +
            '<div class="tn-past-actions"><button type="button" class="btn btn-og btn-sm" data-tn-action="detail" data-tn-id="' + esc(t._key) + '" data-tn-tab="leaderboard"><i class="fas fa-arrow-up-right-from-square"></i> ' + ru('Все результаты', 'Full results') + '</button>' +
            '<button type="button" class="btn btn-og btn-sm" data-tn-action="detail" data-tn-id="' + esc(t._key) + '" data-tn-tab="protocol"><i class="fas fa-file-pdf"></i> ' + ru('Протокол', 'Protocol') + '</button></div></div></details>';
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
        return '<div class="tn-protocol-actions">' + versionNote + (pdfUrl ? '<a class="btn btn-g btn-sm" target="_blank" rel="noopener" href="' + esc(pdfUrl) + '"><i class="fas fa-file-pdf"></i> ' + ru('Скачать PDF', 'Download PDF') + '</a>' : '') + (rows.length ? '<button type="button" class="btn btn-og btn-sm" data-tn-action="print-protocol" data-tn-id="' + esc(t._key) + '"><i class="fas fa-print"></i> ' + ru('Печать / PDF', 'Print / PDF') + '</button><button type="button" class="btn btn-og btn-sm" data-tn-action="csv-protocol" data-tn-id="' + esc(t._key) + '"><i class="fas fa-file-csv"></i> CSV</button><button type="button" class="btn btn-og btn-sm" data-tn-action="excel-protocol" data-tn-id="' + esc(t._key) + '"><i class="fas fa-file-excel"></i> Excel</button>' : '') + '</div>' + (rows.length ? '<div class="tn-public-table-wrap"><table class="tn-public-table"><thead><tr><th>#</th><th>' + ru('Игрок', 'Player') + '</th><th>HCP</th><th>Gross</th><th>Net</th><th>Stableford</th><th>Total</th><th>' + ru('Статус', 'Status') + '</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + (r.position == null ? '—' : r.position) + '</td><td>' + esc(safeName({ name: r.name }, r.key)) + '</td><td>' + esc(r.handicap == null ? '—' : r.handicap) + '</td><td>' + r.gross + '</td><td>' + r.net + '</td><td>' + r.stableford + '</td><td>' + r.total + '</td><td>' + (r.status === 'ACTIVE' ? '—' : '<span class="tn-result-status">' + esc(r.status) + '</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') + nominationHtml(t);
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
        if (tab === 'studio' && root.TnStudioPublic) return root.TnStudioPublic.panelHtml(t, { esc: esc, ru: ru });
        return '<div class="tn-detail-panel"><h2><i class="fas fa-circle-info"></i> ' + ru('О турнире', 'About the tournament') + '</h2><div class="tn-detail-grid"><div class="tn-detail-stat"><b>' + rosterCount(t) + '</b><span>' + ru('участников подтверждено', 'confirmed participants') + '</span></div><div class="tn-detail-stat"><b>' + (t.roundsMeta ? listValue(t.roundsMeta).length : 1) + '</b><span>' + ru('раунд(а)', 'round(s)') + '</span></div><div class="tn-detail-stat"><b>' + esc((t.tees || ['wh']).join(', ').toUpperCase()) + '</b><span>' + ru('доступные ти', 'available tees') + '</span></div></div><p class="tn-detail-description">' + esc(t.description || ru('Регламент турнира и детали старта будут опубликованы организатором.', 'The organiser will publish the tournament regulations and start details.')) + '</p>' + applicationHtml(t, c) + '</div>';
    }
    function renderDetail() {
        var detail = el('tn-public-detail'), catalog = el('tn-public-catalog'), rootNode = el('tn-detail-content'), t = state.tournaments[state.detailId];
        if (!detail || !catalog || !rootNode) return;
        if (t && isHiddenFromSite(t)) {
            state.detailId = null;
            render();
            renderCatalogError(ru('Турнир не найден.', 'Tournament not found.'));
            return;
        }
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
        rootNode.innerHTML = '<div class="tn-detail-hero"><div class="tn-detail-kicker"><i class="fas fa-trophy"></i> ' + ru('Турнир клуба', 'Club tournament') + '</div><div class="tn-detail-title-row"><h1 id="tn-detail-title">' + esc(t.name || '—') + '</h1><span class="tn-public-badge ' + badge.cls + '"><i class="fas ' + badge.icon + '"></i> ' + esc(badge.text) + '</span></div><p class="tn-detail-description">' + esc(t.description || '') + '</p><div class="tn-detail-metrics"><div class="tn-detail-metric"><span>' + ru('Дата', 'Date') + '</span><b>' + esc(formatDate(t.date)) + '</b></div><div class="tn-detail-metric"><span>' + ru('Формат', 'Format') + '</span><b>' + esc(formats.map(formatLabel).join(' · ') || '—') + '</b></div><div class="tn-detail-metric"><span>' + ru('Участники', 'Players') + '</span><b>' + rosterCount(t) + (limit(t) ? '/' + limit(t) : '') + '</b></div></div><div class="tn-course-ref"><i class="fas fa-location-dot"></i><span>' + esc(courseName(t)) + '</span>' + (state.course && state.course.address ? '<span>· ' + esc(state.course.address) + '</span>' : '') + '</div></div><div class="tn-detail-tabs" role="tablist"><button type="button" class="tn-detail-tab ' + (state.detailTab === 'overview' ? 'active' : '') + '" data-tn-detail-tab="overview">' + ru('Обзор', 'Overview') + '</button><button type="button" class="tn-detail-tab ' + (state.detailTab === 'start' ? 'active' : '') + '" data-tn-detail-tab="start">' + ru('Стартовый лист + QR', 'Tee sheet + QR') + '</button><button type="button" class="tn-detail-tab ' + (state.detailTab === 'participants' ? 'active' : '') + '" data-tn-detail-tab="participants">' + ru('Участники и заявка', 'Participants & apply') + '</button><button type="button" class="tn-detail-tab ' + (state.detailTab === 'leaderboard' ? 'active' : '') + '" data-tn-detail-tab="leaderboard">' + ru('Лидерборд', 'Leaderboard') + '</button><button type="button" class="tn-detail-tab ' + (state.detailTab === 'protocol' ? 'active' : '') + '" data-tn-detail-tab="protocol">' + ru('Протокол PDF', 'Protocol PDF') + '</button>' + (t.fromStudio ? '<button type="button" class="tn-detail-tab ' + (state.detailTab === 'studio' ? 'active' : '') + '" data-tn-detail-tab="studio">' + ru('Счёт и карточка', 'Score & card') + '</button>' : '') + '</div>' + detailPanel(t);
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
        if (!state.tournaments[id] || isHiddenFromSite(state.tournaments[id])) return;
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
    function printGroupEntries(t, rows) {
        var rawGroups = t.divisions || t.groups || {}, groups = [];
        if (Array.isArray(rawGroups)) groups = rawGroups.map(function (group, index) { var copy = Object.assign({}, group || {}); copy._id = copy.id || String(index); return copy; });
        else Object.keys(rawGroups).forEach(function (id) { var copy = Object.assign({}, rawGroups[id] || {}); copy._id = copy.id || id; groups.push(copy); });
        if (!groups.length) return [];

        var players = t.players || {}, registrations = t.registeredPlayers || {};
        function sameName(a, b) {
            return String(a || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim() ===
                String(b || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
        }
        function recordFor(row) {
            var key = String(row.key || row.uid || ''), record = players[key] || registrations[key];
            if (record) return record;
            var source = Object.keys(players).map(function (id) { return players[id]; }).concat(Object.keys(registrations).map(function (id) { return registrations[id]; }));
            for (var i = 0; i < source.length; i++) {
                var candidate = source[i] || {};
                if (sameName(candidate.name || candidate.fio, row.name)) return candidate;
            }
            return {};
        }
        function memberHas(group, row, person) {
            var members = group.members || group.players || {}, key = String(row.key || row.uid || '');
            if (Array.isArray(members)) {
                return members.some(function (member) {
                    if (member && typeof member === 'object') return String(member.id || member.uid || member.key || '') === key || sameName(member.name || member.fio, row.name);
                    return String(member) === key || sameName(member, row.name);
                });
            }
            if (!members || typeof members !== 'object') return false;
            if (Object.prototype.hasOwnProperty.call(members, key)) return true;
            if (person && person.uid && Object.prototype.hasOwnProperty.call(members, String(person.uid))) return true;
            return Object.keys(members).some(function (memberId) {
                var value = members[memberId];
                return (String(memberId) === key) || sameName(value && typeof value === 'object' ? (value.name || value.fio) : value, row.name);
            });
        }
        var eligible = rows.filter(function (row) { return !/^(DNS|WD|DNF|DQ)$/i.test(String(row.status || '')); });
        var result = [];
        groups.forEach(function (group) {
            var members = eligible.filter(function (row) {
                var person = recordFor(row), groupId = String(person.groupId || person.divisionId || row.groupId || row.divisionId || '');
                if (groupId && groupId === String(group._id)) return true;
                if (memberHas(group, row, person)) return true;
                var gender = String(group.gender || 'all').toLowerCase();
                var rowGender = String(person.gender || row.gender || '').toLowerCase();
                if (gender && gender !== 'all' && rowGender && gender !== rowGender && !(gender.indexOf('жен') === 0 && rowGender === 'women') && !(gender.indexOf('муж') === 0 && rowGender === 'men')) return false;
                var handicap = Number(person.handicap != null ? person.handicap : row.handicap);
                if (!isFinite(handicap)) return false;
                var min = Number(group.hcpFrom != null ? group.hcpFrom : group.minHcp), max = Number(group.hcpTo != null ? group.hcpTo : group.maxHcp);
                if (isFinite(min) && handicap < min) return false;
                if (isFinite(max) && handicap > max) return false;
                return isFinite(min) || isFinite(max);
            });
            if (members.length) result.push({ id: group._id, name: group.name || group.title || ru('Группа', 'Group') + ' ' + (result.length + 1), rows: members });
        });
        return result;
    }
    function protocolLeaderCard(label, rows, kind) {
        var eligible = rows.filter(function (row) {
            return !/^(DNS|WD|DNF|DQ)$/i.test(String(row.status || '')) && row[kind] != null && isFinite(Number(row[kind]));
        }).slice();
        eligible.sort(function (a, b) {
            var av = Number(a[kind]), bv = Number(b[kind]);
            if (av !== bv) return kind === 'stableford' ? bv - av : av - bv;
            return String(a.name || '').localeCompare(String(b.name || ''), lang() === 'en' ? 'en' : 'ru');
        });
        var rowsHtml = eligible.slice(0, 3).map(function (row, index) {
            var value = kind === 'stableford'
                ? esc(row.stableford) + ' ' + ru('очк.', 'pts')
                : esc(kind === 'gross' ? 'Gross ' + row.gross : 'Net ' + row.net);
            return '<li><span class="leader-medal">' + ['🥇', '🥈', '🥉'][index] + '</span><b>' + esc(safeName({ name: row.name }, row.key)) + '</b><span class="leader-value">' + value + '</span></li>';
        }).join('');
        if (!rowsHtml) rowsHtml = '<li class="leader-empty">' + ru('Нет результатов', 'No results') + '</li>';
        return '<article class="leader-card"><div class="leader-kicker">' + esc(label) + '</div><ol>' + rowsHtml + '</ol></article>';
    }
    function protocolLeadersHtml(t, rows) {
        var groups = printGroupEntries(t, rows), overall = '<div class="leader-grid">' +
            protocolLeaderCard(ru('Абсолют · Best Gross', 'Overall · Best Gross'), rows, 'gross') +
            protocolLeaderCard(ru('Абсолют · Best Net', 'Overall · Best Net'), rows, 'net') +
            protocolLeaderCard(ru('Абсолют · Stableford', 'Overall · Stableford'), rows, 'stableford') + '</div>';
        var groupHtml = groups.map(function (group) {
            return '<div class="group-leader"><h3><i class="fas fa-people-group"></i> ' + esc(group.name) + '</h3>' +
                '<div class="leader-grid">' + protocolLeaderCard(ru('Лидеры зачёта · Net', 'Net classification leaders'), group.rows, 'net') +
                protocolLeaderCard(ru('Лидеры зачёта · Gross', 'Gross classification leaders'), group.rows, 'gross') + '</div></div>';
        }).join('');
        return '<section class="protocol-section"><h2>🏆 ' + ru('Лидеры зачётов и групп', 'Category & group leaders') + '</h2>' + overall + groupHtml + '</section>';
    }
    function nominationPrintHtml(t) {
        var nominations = t.protocol && Array.isArray(t.protocol.nominations) ? t.protocol.nominations : [];
        if (!nominations.length) return '';
        return '<section class="protocol-section"><h2>🏅 ' + ru('Номинации турнира', 'Tournament awards') + '</h2><div class="award-grid">' +
            nominations.map(function (nomination) {
                var winners = nomination.winners || [];
                return '<article class="award-card"><b>' + esc(nomination.label || nomination.id || 'Award') + '</b>' +
                    (winners.length ? '<ol>' + winners.slice(0, 3).map(function (winner) {
                        return '<li>' + esc(safeName({ name: winner.name }, winner.key)) + '</li>';
                    }).join('') + '</ol>' : '<small>' + ru('Результат не определён', 'No eligible result') + '</small>') + '</article>';
            }).join('') + '</div></section>';
    }
    function printProtocol(id) {
        var t = state.tournaments[id], core = getCore();
        if (!t || !core) return;
        var rows = finalProtocolRows(t), win = window.open('', '_blank');
        if (!win) { if (typeof root.toast === 'function') root.toast(ru('Разрешите всплывающие окна для PDF.', 'Allow pop-ups for PDF.'), 'error'); return; }
        var tnRounds = Object.keys(state.rounds || {}).map(function (rid) { return state.rounds[rid]; }).filter(function (round) { return round && String(round.tournamentId) === String(id); });
        var finishedRounds = tnRounds.filter(function (round) { return round.status === 'completed'; }).length;
        var body = '<main class="sheet">' +
            '<header class="hero"><div class="hero-mark">⛳ ' + (lang() === 'en' ? 'GOLF & COUNTRY CLUB PESTOVO' : 'ГОЛЬФ-КЛУБ ПЕСТОВО') + '</div>' +
            '<div class="hero-title">' + ru('Итоговый протокол турнира', 'Tournament finish protocol') + '</div>' +
            '<h1>' + esc(t.name || ru('Турнир клуба', 'Club tournament')) + '</h1>' +
            '<div class="hero-meta"><span><i class="fas fa-calendar-day"></i> ' + esc(formatDate(t.date)) + '</span><span><i class="fas fa-location-dot"></i> ' + esc(courseName(t)) + '</span>' +
            '<span><i class="fas fa-users"></i> ' + rows.length + ' ' + ru('участников', 'players') + '</span></div></header>' +
            '<section class="summary-grid"><div><b>' + rows.length + '</b><span>' + ru('участников', 'Players') + '</span></div><div><b>' + finishedRounds + ' / ' + tnRounds.length + '</b><span>' + ru('завершённых раундов', 'Rounds completed') + '</span></div><div><b>' + printGroupEntries(t, rows).length + '</b><span>' + ru('групп и зачётов', 'Groups & divisions') + '</span></div></section>' +
            protocolLeadersHtml(t, rows) + nominationPrintHtml(t) +
            '<section class="protocol-section"><h2>📋 ' + ru('Итоговая таблица', 'Final standings') + '</h2>' +
            '<div class="table-wrap"><table class="standings"><thead><tr><th>#</th><th>' + ru('Игрок', 'Player') + '</th><th>HCP</th><th>Gross</th><th>Net</th><th>Stableford</th><th>' + ru('Результат', 'Total') + '</th><th>' + ru('Статус', 'Status') + '</th></tr></thead><tbody>' +
            rows.map(function (r) {
                return '<tr><td class="place">' + esc(r.position == null ? '—' : r.position) + '</td><td class="player-name">' + esc(safeName({ name: r.name }, r.key)) + '</td><td>' + esc(r.handicap == null ? '—' : r.handicap) + '</td><td>' + esc(r.gross == null ? '—' : r.gross) + '</td><td>' + esc(r.net == null ? '—' : r.net) + '</td><td>' + esc(r.stableford == null ? '—' : r.stableford) + '</td><td>' + esc(r.total == null ? '—' : r.total) + '</td><td>' + esc(r.status || '—') + '</td></tr>';
            }).join('') + '</tbody></table></div></section>' +
            '<section class="protocol-section"><h2>⛳ ' + ru('Счёт по лункам', 'Hole-by-hole scores') + '</h2>' +
            rows.map(function (r) {
                return '<article class="hole-breakdown"><h3>' + esc(safeName({ name: r.name }, r.key)) + '</h3><div>' +
                    (r.holes || []).map(function (hole) { return '<span><small>' + esc(hole.hole) + '</small><b>' + esc(hole.gross == null ? '—' : hole.gross) + '</b></span>'; }).join('') +
                    '</div></article>';
            }).join('') + '</section>' +
            '<footer class="protocol-footer"><span>' + ru('Сформировано', 'Generated') + ': ' + esc(new Date().toLocaleString(lang() === 'en' ? 'en-GB' : 'ru-RU')) + '</span><span>Гольф-клуб Пестово</span></footer></main>';
        var css = '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;padding:16px 22px;background:#e9ede8;color:#1c2d22;font:11px Inter,Arial,sans-serif}.toolbar{max-width:1100px;margin:0 auto 14px;padding:10px 13px;display:flex;align-items:center;gap:10px;border:1px solid #d5ddcf;border-radius:11px;background:#fff}.toolbar button{padding:9px 15px;border:0;border-radius:8px;background:#17432b;color:#fff;font-weight:800;cursor:pointer}.toolbar button.secondary{background:#fff;border:1px solid #cbd5ca;color:#314437}.toolbar span{font-size:10px;color:#69766c}.sheet{max-width:1100px;margin:auto}.hero{position:relative;overflow:hidden;padding:25px 30px;border:1px solid #b59b5c;border-radius:16px;background:linear-gradient(125deg,#0e3020,#17462d 60%,#24553a);color:#fff;box-shadow:0 14px 30px rgba(19,47,29,.16)}.hero:after{content:"";position:absolute;right:-65px;top:-130px;width:290px;height:290px;border:1px solid rgba(224,199,127,.3);border-radius:50%;box-shadow:0 0 0 22px rgba(224,199,127,.05),0 0 0 48px rgba(224,199,127,.03)}.hero-mark,.hero-title,.hero h1,.hero-meta{position:relative;z-index:1}.hero-mark{color:#e6d29a;font-size:9px;font-weight:900;letter-spacing:2px}.hero-title{margin-top:10px;color:#d8e2d9;font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase}.hero h1{margin:5px 0 12px;font:700 24px Georgia,serif;color:#fff}.hero-meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:#e1e9e2;font-size:10px}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 16px}.summary-grid>div{padding:10px 12px;border:1px solid #d7ddd4;border-radius:10px;background:#fff}.summary-grid b{display:block;color:#17432b;font:700 20px Georgia,serif}.summary-grid span{display:block;margin-top:4px;color:#798379;font-size:8px;font-weight:800;letter-spacing:.7px;text-transform:uppercase}.protocol-section{margin:16px 0}.protocol-section>h2{margin:0 0 9px;padding-bottom:6px;border-bottom:1px solid #c8b578;color:#17432b;font:700 16px Georgia,serif}.leader-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.leader-card,.award-card{break-inside:avoid;border:1px solid #ddd7c4;border-top:3px solid #b59b5c;border-radius:10px;padding:9px 11px;background:#fff}.leader-kicker{color:#807656;font-size:8px;font-weight:900;letter-spacing:.7px;text-transform:uppercase}.leader-card ol,.award-card ol{list-style:none;margin:5px 0 0;padding:0}.leader-card li{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:5px;padding:5px 0;border-top:1px solid #eeece5}.leader-medal{font-size:15px}.leader-value{color:#17432b;font-size:9px;font-weight:800;white-space:nowrap}.leader-empty,.award-card small{color:#8a9188;font-size:10px}.group-leader{margin-top:11px;break-inside:avoid}.group-leader h3{margin:0 0 7px;color:#365340;font-size:11px}.group-leader .leader-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.award-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.award-card>b{color:#17432b;font:700 12px Georgia,serif}.award-card li{padding:4px 0;border-top:1px solid #eeece5}.table-wrap{overflow:hidden;border:1px solid #d6ddd5;border-radius:9px;background:#fff}table.standings{width:100%;border-collapse:collapse}table.standings th,table.standings td{padding:6px 7px;border:1px solid #e0e4dd;text-align:center;font-size:9px}table.standings th{background:#17432b;color:#fff;font-size:8px;text-transform:uppercase;letter-spacing:.4px}table.standings .player-name{text-align:left;font-weight:700}table.standings .place{color:#17432b;font-weight:900}.hole-breakdown{padding:8px 10px;border:1px solid #dde2da;border-radius:9px;margin:7px 0;background:#fff;break-inside:avoid}.hole-breakdown h3{margin:0 0 6px;color:#17432b;font-size:10px}.hole-breakdown>div{display:flex;flex-wrap:wrap;gap:4px}.hole-breakdown span{display:flex;min-width:28px;flex-direction:column;align-items:center;padding:3px 4px;border:1px solid #eceee9;border-radius:5px}.hole-breakdown small{color:#828b81;font-size:7px}.hole-breakdown b{font-size:9px}.protocol-footer{display:flex;justify-content:space-between;gap:16px;margin-top:17px;padding-top:8px;border-top:1px solid #cbd4c8;color:#68766b;font-size:8px}@media(max-width:680px){.toolbar{flex-wrap:wrap}.toolbar span{flex-basis:100%}.leader-grid{grid-template-columns:1fr}.summary-grid{grid-template-columns:repeat(3,1fr)}}@media print{body{padding:0;background:#fff}.toolbar{display:none!important}.hero{box-shadow:none;border-radius:10px}.sheet{max-width:none}.table-wrap{overflow:visible}.protocol-section,.group-leader{break-inside:auto}.hole-breakdown{break-inside:avoid}}@page{size:A4 landscape;margin:9mm}';
        win.document.write('<!doctype html><html lang="' + lang() + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(t.name || 'Tournament') + ' · ' + ru('Протокол', 'Protocol') + '</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"><style>' + css + '</style></head><body><div class="toolbar"><button onclick="window.print()"><i class="fas fa-print"></i> ' + ru('Печать / Сохранить PDF', 'Print / Save PDF') + '</button><button class="secondary" onclick="window.close()">' + ru('Закрыть', 'Close') + '</button><span>' + ru('В диалоге печати выберите «Сохранить как PDF».', 'Choose “Save as PDF” in the print dialog.') + '</span></div>' + body + '</body></html>');
        win.document.close();
        setTimeout(function () { try { win.print(); } catch (e) { /* user can print manually */ } }, 300);
    }
    function downloadCsv(id) {
        var t = state.tournaments[id], core = getCore();
        if (!t || !core) return;
        var rows = finalProtocolRows(t).map(function (row) { var copy = {}; Object.keys(row).forEach(function (key) { copy[key] = row[key]; }); copy.name = safeName({ name: row.name }, row.key); return copy; }), blob = new Blob([core.csv(rows)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = (String(t.name || 'tournament').replace(/[^a-zа-я0-9]+/gi, '_') || 'tournament') + '-protocol.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function downloadExcel(id) {
        var t = state.tournaments[id]; if (!t) return;
        var rows = finalProtocolRows(t), headers = ['#', 'Player', 'HCP', 'Gross', 'Net', 'Stableford', 'Total', 'Status'], html = '<!doctype html><html><head><meta charset="utf-8"></head><body><table><tr>' + headers.map(function (header) { return '<th>' + esc(header) + '</th>'; }).join('') + '</tr>';
        html += rows.map(function (row) { return '<tr><td>' + esc(row.position == null ? '' : row.position) + '</td><td>' + esc(safeName({ name: row.name }, row.key)) + '</td><td>' + esc(row.handicap == null ? '' : row.handicap) + '</td><td>' + esc(row.gross) + '</td><td>' + esc(row.net) + '</td><td>' + esc(row.stableford) + '</td><td>' + esc(row.total) + '</td><td>' + esc(row.status) + '</td></tr>'; }).join('') + '</table></body></html>';
        var blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (String(t.name || 'tournament').replace(/[^a-zа-я0-9]+/gi, '_') || 'tournament') + '-protocol.xls'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
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
        form.querySelectorAll('button[type="submit"]').forEach(function (button) { button.disabled = true; });
        db.ref().update(updates).then(function () {
            if (typeof root.toast === 'function') root.toast(shouldAuto ? ru('Заявка подтверждена!', 'Application approved!') : ru('Заявка отправлена в лист ожидания.', 'Application sent to the waitlist.'), 'success');
            renderDetail();
        }).catch(function (error) {
            var denied = error && (error.code === 'PERMISSION_DENIED' || /permission/i.test(error.message || ''));
            if (typeof root.toast === 'function') root.toast(denied ? ru('Не удалось отправить заявку. Войдите в аккаунт и попробуйте снова.', 'Could not send the application. Sign in and try again.') : ('❌ ' + (error && error.message || error)), 'error');
            form.querySelectorAll('button[type="submit"]').forEach(function (button) { button.disabled = false; });
        });
    }
    function handleClick(event) {
        var node = event.target.closest ? event.target.closest('[data-tn-action],[data-tn-detail-tab]') : null;
        if (!node) return;
        var action = node.getAttribute('data-tn-action'), id = node.getAttribute('data-tn-id');
        if (node.hasAttribute('data-tn-detail-tab')) { state.detailTab = node.getAttribute('data-tn-detail-tab'); renderDetail(); return; }
        if (action === 'detail') openDetail(id, node.getAttribute('data-tn-tab') || 'overview');
        else if (action === 'apply') openDetail(id, 'participants');
        else if (action === 'print-protocol') printProtocol(id);
        else if (action === 'csv-protocol') downloadCsv(id);
        else if (action === 'excel-protocol') downloadExcel(id);
    }
    function init() {
        if (state.initialized) return;
        state.initialized = true;
        var search = el('tn-public-search');
        if (search) search.addEventListener('input', function () { state.query = search.value || ''; renderCatalog(); });
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
