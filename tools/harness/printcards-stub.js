/*
 * Заглушка окружения для tools/harness/printcards.html.
 * In-memory Firebase RTDB + детерминированный турнир (6 участников, раунд,
 * стартовый лист со временами и парной связкой) — чтобы вкладка
 * «Счетные карточки» открывалась в браузере без настоящей базы.
 * Используется только проверкой tools/check-printcards-preview.js.
 */
(function (root) {
    'use strict';

    function splitPath(p) {
        return String(p || '').split('/').filter(function (part) { return part !== ''; });
    }

    function makeDb() {
        var data = {};
        var seq = 0;
        var listeners = [];

        function get(path) {
            var node = data;
            splitPath(path).forEach(function (key) {
                node = node && typeof node === 'object' ? node[key] : undefined;
            });
            return node === undefined ? null : node;
        }
        function snapshot(path) {
            var parts = splitPath(path);
            return {
                key: parts[parts.length - 1] || null,
                val: function () { return get(path); },
                exists: function () { return get(path) != null; }
            };
        }
        function notify(changed) {
            listeners.slice().forEach(function (item) {
                var lp = item.path;
                var related = !lp || !changed || changed === lp ||
                    changed.indexOf(lp + '/') === 0 || lp.indexOf(changed + '/') === 0;
                if (related) item.cb(snapshot(lp));
            });
        }
        function setAt(path, value) {
            var parts = splitPath(path);
            if (!parts.length) { data = value && typeof value === 'object' ? value : {}; notify(''); return; }
            var node = data;
            for (var i = 0; i < parts.length - 1; i++) {
                if (!node[parts[i]] || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
                node = node[parts[i]];
            }
            var last = parts[parts.length - 1];
            if (value === null || value === undefined) delete node[last];
            else node[last] = value;
            notify(parts.join('/'));
        }
        function applyUpdates(base, obj) {
            Object.keys(obj || {}).forEach(function (key) {
                setAt(base ? base + '/' + key : key, obj[key]);
            });
        }
        function makeRef(path) {
            path = path || '';
            var ref = {
                key: splitPath(path).slice(-1)[0] || null,
                once: function () { return Promise.resolve(snapshot(path)); },
                set: function (value) { setAt(path, value); return Promise.resolve(); },
                update: function (obj) { applyUpdates(path, obj); return Promise.resolve(); },
                remove: function () { setAt(path, null); return Promise.resolve(); },
                push: function (value) {
                    var key = 'k' + (++seq);
                    var child = makeRef(path ? path + '/' + key : key);
                    if (value !== undefined) child.set(value);
                    return child;
                },
                child: function (name) { return makeRef(path ? path + '/' + name : name); },
                on: function (event, cb) { listeners.push({ path: path, cb: cb }); cb(snapshot(path)); return cb; },
                off: function (event, cb) {
                    listeners = listeners.filter(function (item) { return !(item.path === path && item.cb === cb); });
                }
            };
            ['orderByChild', 'orderByKey', 'orderByValue', 'limitToLast', 'limitToFirst',
                'startAt', 'endAt', 'equalTo'].forEach(function (method) {
                ref[method] = function () { return ref; };
            });
            return ref;
        }
        var db = { ref: function (path) { return makeRef(path); } };
        db.__get = get;
        db.__set = setAt;
        return db;
    }

    root.db = makeDb();
    root.currentLang = 'ru';
    root.currentUser = { uid: 'test-admin' };
    root.currentUserData = { role: 'admin' };
    root.toast = function () {};
    root.t = function (key) { return key; };
    root.escapeHtml = function (s) { return String(s == null ? '' : s); };
    root.baseUrl = function () { return 'https://example.test/'; };
    root.uiConfirm = function () { return Promise.resolve(true); };
    root.copyOrShare = function () {};
    root.getKnownPlayersSync = function () { return {}; };
    root.TEES = { bk: 'Чёрный', bl: 'Синий', wh: 'Белый', rd: 'Красный' };
    root.TOTAL_PAR = 72;
    root.COURSE_RATINGS = {};
    root.CLUB = 'Гольф-клуб Пестово';
    root.hasAdminPanelAccess = function () { return true; };
    root.switchTab = function () { if (root.TnMgr) root.TnMgr.open(); };

    // Печать: ловим готовый документ вместо настоящего окна печати.
    root.printed = [];
    root.open = function () {
        var fakeDoc = {
            html: '',
            open: function () { this.html = ''; },
            write: function (chunk) { this.html += chunk; },
            close: function () {},
            querySelectorAll: function () { return []; }
        };
        var fakeWin = {
            document: fakeDoc,
            focus: function () {},
            print: function () { root.printed.push(fakeDoc.html); },
            close: function () {}
        };
        return fakeWin;
    };

    // ── Турнир: 6 участников, парная связка, раунд и стартовый лист ──
    var players = {
        p1: { id: 'p1', fio: 'Иванов Иван', hi: 12.4, gender: 'men', tee: 'wh', active: true },
        p2: { id: 'p2', fio: 'Петров Пётр', hi: 8.1, gender: 'men', tee: 'wh', active: true, teamId: 'team-1' },
        p3: { id: 'p3', fio: 'Сидорова Анна', hi: 18.6, gender: 'women', tee: 'rd', active: true, teamId: 'team-1' },
        p4: { id: 'p4', fio: 'Кузнецов Олег', hi: 4.2, gender: 'men', tee: 'bk', active: true },
        p5: { id: 'p5', fio: 'Смирнова Мария', hi: 24.0, gender: 'women', tee: 'rd', active: true },
        p6: { id: 'p6', fio: 'Выбывший Игрок', hi: 15.0, gender: 'men', tee: 'wh', active: false }
    };
    var entries = {
        p1: { playerId: 'p1', playerName: 'Иванов Иван', tee: 'wh', format: 'stroke', flight: 'A', startGroupId: 'g1', startHole: 1, startTime: '09:00', order: 1 },
        p2: { playerId: 'p2', playerName: 'Петров Пётр', tee: 'wh', format: 'fourball', flight: 'A', startGroupId: 'g1', startHole: 1, startTime: '09:00', order: 2 },
        p3: { playerId: 'p3', playerName: 'Сидорова Анна', tee: 'rd', format: 'fourball', flight: 'A', startGroupId: 'g1', startHole: 1, startTime: '09:00', order: 3 },
        p4: { playerId: 'p4', playerName: 'Кузнецов Олег', tee: 'bk', format: 'stroke', flight: 'B', startGroupId: 'g2', startHole: 10, startTime: '09:10', order: 4 },
        p5: { playerId: 'p5', playerName: 'Смирнова Мария', tee: 'rd', format: 'stroke', flight: 'B', startGroupId: 'g2', startHole: 10, startTime: '09:10', order: 5 },
        p6: { playerId: 'p6', playerName: 'Выбывший Игрок', tee: 'wh', format: 'stroke', flight: 'B', startGroupId: 'g2', startHole: 10, startTime: '09:10', order: 6 }
    };
    root.db.__set('tournaments/t1', {
        id: 't1',
        name: 'Кубок Пестово',
        startDate: '2026-06-01',
        startTime: '09:00',
        club: 'Гольф-клуб Пестово',
        course: 'Пестово',
        formats: ['Индивидуальный стаблфорд'],
        status: 'upcoming',
        players: players,
        rounds: { r1: { id: 'r1', date: '2026-06-01', startTime: '09:00' } },
        sheets: {
            r1: {
                roundId: 'r1',
                tournamentId: 't1',
                entries: entries,
                columns: [],
                updatedAt: 1
            }
        },
        scores: { r1: { p1: { 1: 4, 2: 5 }, p4: { 10: 3 } } }
    });

    root.location.hash = '#tnm/t1/printcards';
})(typeof window !== 'undefined' ? window : this);
