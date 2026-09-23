// Логика новой вкладки «Турниры · создание».
// Без DOM и Firebase: страница вешает объект на window, тесты берут module.exports.
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.TnStudioCore = api;
})(typeof window !== 'undefined' ? window : this, function () {
    var CLUB = 'Пестово Гольф Клуб';

    function str(v) { return v == null ? '' : String(v); }
    function num(v) {
        if (v == null || v === '') return null;
        var n = parseFloat(str(v).replace(',', '.').replace('+', ''));
        return isFinite(n) ? n : null;
    }
    function round1(n) { return Math.round(n * 10) / 10; }

    function formatIso(iso) {
        var m = str(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
    }
    function formatRange(start, end) {
        var a = formatIso(start);
        var b = formatIso(end || start);
        if (!a && !b) return '—';
        if (!b || a === b) return (a || b) + '–' + (b || a);
        return a + '–' + b;
    }
    function isoOk(iso) { return /^\d{4}-\d{2}-\d{2}$/.test(str(iso)); }

    function normalizeName(value) {
        return str(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
    }
    function nameKey(value) {
        return normalizeName(value).split(' ').filter(Boolean).sort().join(' ');
    }
    function userList(users) {
        var out = [];
        Object.keys(users || {}).forEach(function (id) {
            var u = users[id] || {};
            if (!u.name) return;
            out.push({
                id: id,
                name: str(u.name).replace(/\s+/g, ' ').trim(),
                handicap: u.handicap == null || u.handicap === '' ? null : num(u.handicap),
                gender: u.gender === 'women' || u.gender === 'female' || u.gender === 'w' ? 'women' : 'men'
            });
        });
        return out;
    }
    function matchUsers(query, users) {
        var q = normalizeName(query);
        var words = q.split(' ').filter(Boolean);
        if (!q) return { status: 'empty', users: [] };
        var list = userList(users);
        var key = nameKey(q);
        var exact = list.filter(function (u) { return normalizeName(u.name) === q || nameKey(u.name) === key; });
        if (exact.length === 1) return { status: 'one', users: exact };
        if (exact.length > 1) return { status: 'many', users: exact };
        if (words.length < 2) return { status: 'short', users: [] };
        var partial = list.filter(function (u) {
            var uw = nameKey(u.name).split(' ').filter(Boolean);
            return words.every(function (w) { return uw.indexOf(w) !== -1; });
        });
        if (partial.length === 1) return { status: 'one', users: partial };
        if (partial.length > 1) return { status: 'many', users: partial };
        return { status: 'none', users: [] };
    }
    function namesFromSheet(rows) {
        var table = Array.isArray(rows) ? rows : [];
        if (!table.length) return [];
        var header = (table[0] || []).map(function (cell) { return normalizeName(cell); });
        var col = 0;
        var start = 0;
        var headerHit = -1;
        header.forEach(function (cell, i) {
            if (headerHit !== -1) return;
            if (/фио|фамили|name|player|игрок|гольфист|участ/.test(cell)) headerHit = i;
        });
        if (headerHit !== -1) { col = headerHit; start = 1; }
        var names = [];
        for (var r = start; r < table.length; r++) {
            var row = table[r] || [];
            var value = str(Array.isArray(row) ? row[col] : '').replace(/\s+/g, ' ').trim();
            if (!value) continue;
            if (normalizeName(value) === 'фио' || normalizeName(value) === 'name') continue;
            names.push(value);
        }
        return names;
    }

    function asMap(value) {
        if (!value || typeof value !== 'object') return {};
        return value;
    }
    function listOf(map) {
        return Object.keys(asMap(map)).map(function (key) {
            var item = map[key] || {};
            item._key = key;
            return item;
        });
    }
    function isPublic(t) { return !t || t.publicAccess !== false; }
    function overlaps(start, end, from, to) {
        var a = str(start || '');
        var b = str(end || start || '');
        if (!a) return false;
        if (from && b < from) return false;
        if (to && a > to) return false;
        return true;
    }
    function divisionOf(playerKey, divisions) {
        var found = null;
        Object.keys(asMap(divisions)).forEach(function (id) {
            var members = asMap(divisions[id].members);
            if (members[playerKey]) found = id;
        });
        return found;
    }
    function unassigned(roster, divisions) {
        return listOf(roster).filter(function (p) { return !divisionOf(p._key, divisions); });
    }

    function courseHandicap(hi, rating, par) {
        var n = num(hi);
        if (n == null) return null;
        if (!rating || rating.sr == null || rating.cr == null) return Math.round(n);
        return Math.round(n * (rating.sr / 113) + (rating.cr - (par || 72)));
    }
    function strokesOnHole(si, ch) {
        var idx = parseInt(si, 10) || 0;
        var field = parseInt(ch, 10) || 0;
        if (!idx || !field) return 0;
        if (field > 0) {
            var n = Math.floor(field / 18);
            if (idx <= (field % 18)) n++;
            return n;
        }
        var abs = Math.abs(field);
        var m = -Math.floor(abs / 18);
        if ((19 - idx) <= (abs % 18)) m--;
        return m;
    }
    function stableford(strokes, par, received) {
        var g = parseInt(strokes, 10);
        if (!g || g < 1) return null;
        var net = g - (parseInt(received, 10) || 0);
        return Math.max(0, 2 - (net - par));
    }
    function scoreAt(scores, hole) {
        if (!scores) return null;
        var raw = scores[hole] != null ? scores[hole] : scores[String(hole)];
        if (raw == null || raw === '') return null;
        var n = parseInt(raw, 10);
        return isFinite(n) && n > 0 ? n : null;
    }
    function sumSlice(holes, from, to, field) {
        var total = 0, played = 0, dist = 0, par = 0;
        holes.forEach(function (h) {
            if (h.hole < from || h.hole > to) return;
            dist += h.dist || 0;
            par += h.par || 0;
            if (h[field] != null) { total += h[field]; played++; }
        });
        return { total: played ? total : null, played: played, dist: dist, par: par };
    }
    function playerCard(scores, course, tee, ch) {
        var holes = [];
        for (var h = 1; h <= 18; h++) {
            var gross = scoreAt(scores, h);
            var par = course.par(h);
            var recv = strokesOnHole(course.si(h), ch || 0);
            holes.push({
                hole: h,
                dist: course.dist(h, tee) || 0,
                par: par,
                si: course.si(h),
                recv: recv,
                gross: gross,
                ptsGross: gross == null ? null : stableford(gross, par, 0),
                ptsNet: gross == null ? null : stableford(gross, par, recv)
            });
        }
        function pack(from, to) {
            return {
                dist: sumSlice(holes, from, to, 'dist').dist,
                par: sumSlice(holes, from, to, 'par').par,
                gross: sumSlice(holes, from, to, 'gross'),
                ptsGross: sumSlice(holes, from, to, 'ptsGross'),
                ptsNet: sumSlice(holes, from, to, 'ptsNet')
            };
        }
        return { holes: holes, out: pack(1, 9), inn: pack(10, 18), all: pack(1, 18) };
    }
    function betterBall(cards) {
        var gross = 0, played = 0;
        for (var h = 0; h < 18; h++) {
            var best = null;
            (cards || []).forEach(function (card) {
                var g = card.holes[h].gross;
                if (g == null) return;
                if (best == null || g < best) best = g;
            });
            if (best != null) { gross += best; played++; }
        }
        return { gross: played ? gross : null, played: played };
    }
    function formatId(tournament, division) {
        if (tournament && tournament.fourBall) return 'fourball';
        var f = division && division.format;
        return f === 'stroke' ? 'stroke' : 'stableford';
    }
    function legacyFormats(tournament, divisions) {
        if (tournament && tournament.fourBall) return ['Four-ball'];
        var set = {};
        Object.keys(asMap(divisions)).forEach(function (id) {
            set[asMap(divisions)[id].format === 'stroke' ? 'Stroke Play (Gross)' : 'Stableford'] = true;
        });
        return Object.keys(set);
    }
    function legacyTees(divisions) {
        var set = {};
        Object.keys(asMap(divisions)).forEach(function (id) {
            var tee = asMap(divisions)[id].tee;
            if (tee) set[tee] = true;
        });
        return Object.keys(set);
    }
    function fmtHcp(v) {
        var raw = str(v).trim();
        if (!raw) return '';
        var plus = raw.charAt(0) === '+';
        var n = num(raw);
        if (n == null) return raw;
        if (plus || n < 0) return '+' + Math.abs(n).toFixed(1).replace('.', ',');
        return n.toFixed(1).replace('.', ',');
    }
    function hcpLabel(from, to) {
        var a = fmtHcp(from), b = fmtHcp(to);
        if (!a && !b) return '—';
        if (a && b) return a + ' – ' + b;
        if (a) return a + ' –';
        return '– ' + b;
    }

    function columnHit(key, want) {
        var n = normalizeName(key);
        if (!n || !want) return false;
        if (n === want || n.indexOf(want + ' ') === 0 || n.indexOf(' ' + want) !== -1) return true;
        return want.length >= 4 && n.indexOf(want) !== -1;
    }
    function pickCell(row, names) {
        var keys = Object.keys(row || {});
        for (var i = 0; i < names.length; i++) {
            var want = names[i];
            var hit = keys.filter(function (key) { return columnHit(key, want); })[0];
            if (hit) return row[hit];
        }
        return '';
    }
    function gridRecords(table) {
        var header = (table[0] || []).map(function (cell) { return normalizeName(cell); });
        var named = header.some(function (cell) { return /фио|фамили|name|player|гандикап|handicap|hcp|пол|gender|ти|tee/.test(cell); });
        if (!named) {
            return table.map(function (row) {
                var cells = Array.isArray(row) ? row : [];
                return { фио: cells[0], hcp: cells[1], пол: cells[2], ти: cells[3] };
            });
        }
        return table.slice(1).map(function (row) {
            var obj = {};
            header.forEach(function (label, i) { obj[label || ('c' + i)] = Array.isArray(row) ? row[i] : ''; });
            return obj;
        });
    }
    function genderCode(raw) {
        var s = normalizeName(raw);
        if (!s) return 'men';
        return /жен|female|woman|^w$|^f$/.test(s) ? 'women' : 'men';
    }
    function teeCode(raw) {
        var s = normalizeName(raw);
        if (!s) return 'wh';
        if (s === 'bk' || s.indexOf('черн') !== -1 || s.indexOf('black') !== -1) return 'bk';
        if (s === 'bl' || s.indexOf('син') !== -1 || s.indexOf('blue') !== -1) return 'bl';
        if (s === 'rd' || s.indexOf('крас') !== -1 || s.indexOf('red') !== -1) return 'rd';
        if (s === 'ye' || s.indexOf('желт') !== -1 || s.indexOf('yellow') !== -1) return 'ye';
        if (s === 'wh' || s.indexOf('бел') !== -1 || s.indexOf('white') !== -1) return 'wh';
        return 'wh';
    }
    function hcpCell(raw) {
        if (raw == null || str(raw).trim() === '') return { ok: true, value: null };
        var n = num(raw);
        if (n == null || n < -10 || n > 54) return { ok: false };
        return { ok: true, value: n };
    }
    function rosterRowsFromSheet(rows) {
        var table = Array.isArray(rows) ? rows : [];
        var players = [], invalid = [], truncated = false, seen = 0;
        if (!table.length) return { players: players, invalid: invalid, truncated: false };
        var objects = table.every(function (row) { return row && typeof row === 'object' && !Array.isArray(row); });
        var records = objects ? table : gridRecords(table);
        records.forEach(function (row, index) {
            if (seen >= 500) { truncated = true; return; }
            var name = str(pickCell(row, ['фио', 'фамили', 'name', 'player', 'игрок', 'гольфист', 'участ'])).replace(/\s+/g, ' ').trim();
            if (!name || normalizeName(name) === 'фио' || normalizeName(name) === 'name') return;
            seen++;
            var hcp = hcpCell(pickCell(row, ['гандикап', 'handicap', 'hcp', 'hi']));
            if (!hcp.ok) { invalid.push({ row: index + 1, name: name, reason: 'hcp' }); return; }
            players.push({
                name: name,
                handicap: hcp.value,
                gender: genderCode(pickCell(row, ['пол', 'gender'])),
                tee: teeCode(pickCell(row, ['ти', 'tee']))
            });
        });
        return { players: players, invalid: invalid, truncated: truncated };
    }

    function asList(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value.filter(Boolean);
        return Object.keys(value).map(function (key) { return value[key]; }).filter(Boolean);
    }
    function fullName(person) {
        var p = person || {};
        var first = str(p.firstName).trim(), middle = str(p.middleName).trim(), last = str(p.lastName).trim();
        if (first || last) return [first, middle, last].filter(Boolean).join(' ');
        return str(p.name).replace(/\s+/g, ' ').trim();
    }
    function shortName(person) {
        var p = person || {};
        var first = str(p.firstName).trim(), last = str(p.lastName).trim();
        if (last || first) return [last, first].filter(Boolean).join(' ');
        return str(p.name).replace(/\s+/g, ' ').trim();
    }
    function samePerson(a, b) {
        if (!a || !b) return false;
        var left = [a._key, a.uid, a.id].filter(function (id) { return id != null && id !== ''; }).map(String);
        var right = [b._key, b.uid, b.id].filter(function (id) { return id != null && id !== ''; }).map(String);
        if (left.some(function (id) { return right.indexOf(id) !== -1; })) return true;
        var an = nameKey(fullName(a) || a.name);
        var bn = nameKey(fullName(b) || b.name);
        return !!(an && bn && an === bn);
    }
    function clockLabel(ts) {
        if (ts == null || ts === '') return '';
        var text = str(ts).trim();
        var hm = text.match(/^(\d{1,2}):(\d{2})/);
        if (hm && !/^\d{10,}$/.test(text)) {
            var hour = parseInt(hm[1], 10);
            if (hour >= 0 && hour < 24) return (hour < 10 ? '0' : '') + hour + ':' + hm[2];
        }
        var n = Number(ts);
        if (!isFinite(n) || n < 10000000000) return text;
        var date = new Date(n);
        if (isNaN(date.getTime())) return text;
        var h = date.getHours(), m = date.getMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }
    function slashMarks(n) {
        var v = parseInt(n, 10) || 0;
        if (v <= 0) return '';
        return new Array(Math.min(v, 6) + 1).join('/');
    }
    function findStart(protocols, tournamentId, player, date) {
        var matches = [];
        Object.keys(protocols || {}).forEach(function (pid) {
            var proto = protocols[pid] || {};
            if (String(proto.tournamentId || '') !== String(tournamentId || '')) return;
            asList(proto.groups).forEach(function (group) {
                if (!group) return;
                var people = asList(group.players);
                var hit = null;
                people.forEach(function (gp) { if (!hit && samePerson(player, gp)) hit = gp; });
                if (!hit) return;
                var marker = null;
                asList(group.markers).forEach(function (mk) {
                    if (marker || !mk) return;
                    var target = { id: mk.targetId, name: mk.targetName };
                    if (samePerson(hit, target) || samePerson(player, target)) marker = mk;
                });
                var markerPerson = null;
                if (marker) people.forEach(function (gp) {
                    if (!markerPerson && String(gp.id || '') === String(marker.markerId || '')) markerPerson = gp;
                });
                matches.push({
                    protocolId: pid,
                    date: str(proto.date || '').slice(0, 10),
                    createdAt: proto.updatedAt || proto.createdAt || 0,
                    roundId: group.roundId || '',
                    startHole: parseInt(group.startHole, 10) || 1,
                    startTime: group.startTime,
                    format: group.format || '',
                    groupSize: people.length,
                    player: hit,
                    marker: marker ? {
                        id: marker.markerId || '',
                        name: markerPerson ? shortName(markerPerson) : shortName({ name: marker.markerName })
                    } : null
                });
            });
        });
        var pool = matches;
        var want = str(date || '').slice(0, 10);
        if (want) {
            var dated = matches.filter(function (item) { return item.date === want; });
            pool = dated.length ? dated : matches.filter(function (item) { return !item.date; });
        }
        pool.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        return pool[0] || null;
    }

    return {
        CLUB: CLUB,
        formatIso: formatIso,
        formatRange: formatRange,
        isoOk: isoOk,
        normalizeName: normalizeName,
        nameKey: nameKey,
        userList: userList,
        matchUsers: matchUsers,
        namesFromSheet: namesFromSheet,
        listOf: listOf,
        isPublic: isPublic,
        overlaps: overlaps,
        divisionOf: divisionOf,
        unassigned: unassigned,
        courseHandicap: courseHandicap,
        strokesOnHole: strokesOnHole,
        stableford: stableford,
        scoreAt: scoreAt,
        playerCard: playerCard,
        betterBall: betterBall,
        formatId: formatId,
        legacyFormats: legacyFormats,
        legacyTees: legacyTees,
        fmtHcp: fmtHcp,
        hcpLabel: hcpLabel,
        round1: round1,
        rosterRowsFromSheet: rosterRowsFromSheet,
        genderCode: genderCode,
        teeCode: teeCode,
        fullName: fullName,
        shortName: shortName,
        clockLabel: clockLabel,
        slashMarks: slashMarks,
        findStart: findStart
    };
});
