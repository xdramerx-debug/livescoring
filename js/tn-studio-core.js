// Общее ядро публичных таблиц счёта и результатов турниров.
// Без DOM и Firebase: используется tn-studio-public.js и проверяется в Node.
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.TnStudioCore = api;
})(typeof window !== 'undefined' ? window : this, function () {
    function str(value) { return value == null ? '' : String(value); }
    function num(value) {
        if (value == null || value === '') return null;
        var parsed = parseFloat(str(value).replace(',', '.').replace('+', ''));
        return isFinite(parsed) ? parsed : null;
    }
    function asMap(value) {
        return value && typeof value === 'object' ? value : {};
    }
    function listOf(map) {
        return Object.keys(asMap(map)).map(function (key) {
            var item = map[key] || {};
            item._key = key;
            return item;
        });
    }
    function formatIso(iso) {
        var match = str(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return match ? match[3] + '.' + match[2] + '.' + match[1] : '';
    }
    function normalizeName(value) {
        return str(value).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
    }
    function divisionOf(playerKey, divisions) {
        var found = null;
        Object.keys(asMap(divisions)).forEach(function (id) {
            var division = divisions[id] || {};
            if (asMap(division.members)[playerKey]) found = id;
        });
        return found;
    }
    function courseHandicap(hi, rating, par) {
        var handicapIndex = num(hi);
        if (handicapIndex == null) return null;
        if (!rating || rating.sr == null || rating.cr == null) return Math.round(handicapIndex);
        return Math.round(handicapIndex * (rating.sr / 113) + (rating.cr - (par || 72)));
    }
    function strokesOnHole(si, courseHandicapValue) {
        var index = parseInt(si, 10) || 0;
        var handicap = parseInt(courseHandicapValue, 10) || 0;
        if (!index || !handicap) return 0;
        if (handicap > 0) {
            var whole = Math.floor(handicap / 18);
            if (index <= handicap % 18) whole++;
            return whole;
        }
        var abs = Math.abs(handicap);
        var negative = -Math.floor(abs / 18);
        if ((19 - index) <= abs % 18) negative--;
        return negative;
    }
    function stableford(strokes, par, received) {
        var gross = parseInt(strokes, 10);
        if (!gross || gross < 1) return null;
        var net = gross - (parseInt(received, 10) || 0);
        return Math.max(0, 2 - (net - par));
    }
    function scoreAt(scores, hole) {
        if (!scores) return null;
        var raw = scores[hole] != null ? scores[hole] : scores[String(hole)];
        if (raw == null || raw === '') return null;
        var score = parseInt(raw, 10);
        return isFinite(score) && score > 0 ? score : null;
    }
    function sumSlice(holes, from, to, field) {
        var total = 0, played = 0, distance = 0, par = 0;
        holes.forEach(function (hole) {
            if (hole.hole < from || hole.hole > to) return;
            distance += hole.dist || 0;
            par += hole.par || 0;
            if (hole[field] != null) { total += hole[field]; played++; }
        });
        return { total: played ? total : null, played: played, dist: distance, par: par };
    }
    function playerCard(scores, course, tee, courseHandicapValue) {
        var holes = [];
        for (var hole = 1; hole <= 18; hole++) {
            var gross = scoreAt(scores, hole);
            var par = course.par(hole);
            var received = strokesOnHole(course.si(hole), courseHandicapValue || 0);
            holes.push({
                hole: hole,
                dist: course.dist(hole, tee) || 0,
                par: par,
                si: course.si(hole),
                recv: received,
                gross: gross,
                ptsGross: gross == null ? null : stableford(gross, par, 0),
                ptsNet: gross == null ? null : stableford(gross, par, received)
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
        for (var hole = 0; hole < 18; hole++) {
            var best = null;
            (cards || []).forEach(function (card) {
                var score = card.holes[hole].gross;
                if (score == null) return;
                if (best == null || score < best) best = score;
            });
            if (best != null) { gross += best; played++; }
        }
        return { gross: played ? gross : null, played: played };
    }
    function formatId(tournament, division) {
        if (tournament && tournament.fourBall) return 'fourball';
        var format = division && division.format;
        if (!format) return 'stableford';
        var label = String(format).toLowerCase();
        if (/(stroke|gross|net\b|нетто|гросс|на счёт|удар)/.test(label)) return 'stroke';
        return 'stableford';
    }
    function fmtHcp(value) {
        var raw = str(value).trim();
        if (!raw) return '';
        var plus = raw.charAt(0) === '+';
        var handicap = num(raw);
        if (handicap == null) return raw;
        if (plus || handicap < 0) return '+' + Math.abs(handicap).toFixed(1).replace('.', ',');
        return handicap.toFixed(1).replace('.', ',');
    }
    function hcpLabel(from, to) {
        var low = fmtHcp(from), high = fmtHcp(to);
        if (!low && !high) return '—';
        if (low && high) return low + ' – ' + high;
        if (low) return low + ' –';
        return '– ' + high;
    }

    return {
        formatIso: formatIso,
        normalizeName: normalizeName,
        listOf: listOf,
        divisionOf: divisionOf,
        courseHandicap: courseHandicap,
        strokesOnHole: strokesOnHole,
        stableford: stableford,
        scoreAt: scoreAt,
        playerCard: playerCard,
        betterBall: betterBall,
        formatId: formatId,
        fmtHcp: fmtHcp,
        hcpLabel: hcpLabel
    };
});
