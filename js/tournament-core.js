// ============================================================
// TOURNAMENT CORE — pure domain helpers for the public/admin redesign
// ------------------------------------------------------------
// No DOM, Firebase, browser globals or UI strings. The module accepts the
// existing RTDB-shaped tournament/round objects and preserves old fields.
// It is intentionally UMD so the same rules are tested in Node and used in
// the static pages.
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.TournamentCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var STATUS = {
        DRAFT: 'draft',
        REGISTRATION: 'registration',
        CLOSED: 'closed',
        ACTIVE: 'active',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    };
    var PUBLIC_STATUSES = [STATUS.REGISTRATION, STATUS.CLOSED, STATUS.ACTIVE, STATUS.COMPLETED, STATUS.CANCELLED];
    var ROLE_IDS = ['judge', 'secretary', 'marshal', 'observer'];

    function clone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value == null ? null : value));
    }
    function str(value) { return String(value == null ? '' : value).trim(); }
    function num(value, fallback) {
        var n = parseFloat(value);
        return isFinite(n) ? n : (fallback == null ? 0 : fallback);
    }
    function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj || {}, key); }
    function nowMs(value) {
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'number' && isFinite(value)) return value < 100000000000 ? value * 1000 : value;
        var parsed = Date.parse(str(value));
        return isFinite(parsed) ? parsed : 0;
    }
    function dateStart(value) {
        var s = str(value);
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0).getTime();
        return nowMs(value);
    }
    function dateEnd(value) {
        var s = str(value);
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).getTime();
        return nowMs(value);
    }
    function firstDefined(values, fallback) {
        for (var i = 0; i < values.length; i++) {
            if (values[i] !== undefined && values[i] !== null && str(values[i]) !== '') return values[i];
        }
        return fallback;
    }

    function registrationConfig(tournament) {
        var t = tournament || {};
        var wizard = t.wizard || {};
        var format = wizard.format || {};
        var from = t.registration || {};
        return {
            enabled: from.enabled !== false,
            openAt: firstDefined([from.openAt, from.open, format.regOpen], ''),
            closeAt: firstDefined([from.closeAt, from.close, format.regClose], ''),
            limit: Math.max(0, parseInt(firstDefined([from.limit, from.maxParticipants, wizard.participants && wizard.participants.limit], 0), 10) || 0),
            waitlist: from.waitlist !== false,
            approval: firstDefined([from.approval, wizard.participants && wizard.participants.moderation], 'manual')
        };
    }

    // Convert old upcoming status into the new public lifecycle without
    // changing the persisted legacy field. Registration dates win over the
    // old status, which makes migrated records useful immediately.
    function lifecycleStatus(tournament, at) {
        var t = tournament || {};
        var explicit = str(t.lifecycleStatus || (t.lifecycle && t.lifecycle.status));
        if (explicit === 'published') explicit = STATUS.REGISTRATION;
        // An explicit terminal/live state is authoritative. Registration and
        // closed states still respect their configured window below so a stale
        // client cannot keep the public form open forever.
        if ([STATUS.CANCELLED, STATUS.COMPLETED, STATUS.ACTIVE, STATUS.DRAFT].indexOf(explicit) !== -1) return explicit;
        var legacy = str(t.status);
        if (legacy === STATUS.CANCELLED || legacy === STATUS.COMPLETED || legacy === STATUS.ACTIVE) return legacy;
        if (legacy === STATUS.DRAFT) return STATUS.DRAFT;
        var ts = at == null ? Date.now() : nowMs(at) || Date.now();
        var reg = registrationConfig(t);
        var start = firstDefined([t.startedAt, t.startAt, t.date], '');
        var end = firstDefined([t.finishedAt, t.endDate, t.date], '');
        if (explicit === STATUS.REGISTRATION && reg.closeAt && ts > dateEnd(reg.closeAt)) return STATUS.CLOSED;
        if (explicit === STATUS.REGISTRATION && end && dateEnd(end) < ts) return STATUS.COMPLETED;
        if (explicit === STATUS.CLOSED) return STATUS.CLOSED;
        if (legacy === 'closed') return STATUS.CLOSED;
        if (reg.closeAt && ts > dateEnd(reg.closeAt) && !t.startedAt && legacy !== STATUS.ACTIVE) return STATUS.CLOSED;
        if (end && dateEnd(end) < ts && legacy === 'upcoming') return STATUS.COMPLETED;
        if (start && ts >= dateStart(start) && legacy === 'upcoming') return STATUS.ACTIVE;
        if (reg.openAt && ts >= dateStart(reg.openAt) && (!reg.closeAt || ts <= dateEnd(reg.closeAt))) return STATUS.REGISTRATION;
        return legacy === 'upcoming' || !legacy ? STATUS.REGISTRATION : STATUS.DRAFT;
    }

    function isPast(tournament, at) {
        var status = lifecycleStatus(tournament, at);
        if (status === STATUS.COMPLETED || status === STATUS.CANCELLED) return true;
        var end = firstDefined([(tournament || {}).endDate, (tournament || {}).date], '');
        return !!end && dateEnd(end) < (at == null ? Date.now() : nowMs(at));
    }
    function isRegistrationOpen(tournament, at) {
        var t = tournament || {};
        var status = lifecycleStatus(t, at);
        if (status === STATUS.CANCELLED || status === STATUS.COMPLETED || status === STATUS.ACTIVE || status === STATUS.CLOSED || status === STATUS.DRAFT) return false;
        var reg = registrationConfig(t);
        if (!reg.enabled) return false;
        var ts = at == null ? Date.now() : nowMs(at) || Date.now();
        if (reg.openAt && ts < dateStart(reg.openAt)) return false;
        if (reg.closeAt && ts > dateEnd(reg.closeAt)) return false;
        var end = firstDefined([t.finishedAt, t.endDate, t.date], '');
        if (end && dateEnd(end) < ts) return false;
        return true;
    }
    function classify(tournament, at) {
        var status = lifecycleStatus(tournament, at);
        return {
            status: status,
            // Drafts are private admin records and must never leak into the
            // public catalogue. Registration, closed and live events share
            // the public upcoming/current bucket; completed/cancelled events
            // are handled by the past view.
            upcoming: status === STATUS.REGISTRATION || status === STATUS.CLOSED || status === STATUS.ACTIVE,
            registrationOpen: isRegistrationOpen(tournament, at),
            past: isPast(tournament, at)
        };
    }

    function legacyStatus(status) {
        if (status === STATUS.ACTIVE) return STATUS.ACTIVE;
        if (status === STATUS.COMPLETED) return STATUS.COMPLETED;
        if (status === STATUS.CANCELLED) return STATUS.CANCELLED;
        if (status === STATUS.DRAFT) return STATUS.DRAFT;
        // Existing admin/start code expects upcoming for both registration
        // and closed-before-start tournaments.
        return 'upcoming';
    }
    var TRANSITIONS = {};
    TRANSITIONS[STATUS.DRAFT] = [STATUS.REGISTRATION, STATUS.CANCELLED];
    TRANSITIONS[STATUS.REGISTRATION] = [STATUS.CLOSED, STATUS.ACTIVE, STATUS.CANCELLED];
    TRANSITIONS[STATUS.CLOSED] = [STATUS.REGISTRATION, STATUS.ACTIVE, STATUS.CANCELLED];
    TRANSITIONS[STATUS.ACTIVE] = [STATUS.COMPLETED, STATUS.CANCELLED];
    TRANSITIONS[STATUS.COMPLETED] = [STATUS.ACTIVE, STATUS.CANCELLED];
    TRANSITIONS[STATUS.CANCELLED] = [STATUS.DRAFT, STATUS.REGISTRATION];
    function canTransition(from, to) {
        from = str(from) || STATUS.DRAFT;
        to = str(to);
        return from === to || (TRANSITIONS[from] || []).indexOf(to) !== -1;
    }
    function transition(tournament, to, at) {
        var t = tournament || {};
        var from = lifecycleStatus(t, at);
        to = str(to);
        if (!PUBLIC_STATUSES.concat([STATUS.DRAFT]).includes(to)) return { ok: false, error: 'unknown_status', from: from, to: to };
        if (!canTransition(from, to)) return { ok: false, error: 'invalid_transition', from: from, to: to };
        return {
            ok: true,
            from: from,
            to: to,
            patch: {
                lifecycleStatus: to,
                status: legacyStatus(to),
                lifecycleChangedAt: at == null ? Date.now() : nowMs(at) || Date.now()
            }
        };
    }

    function applyHcpCut(exactHcp, gender, cut) {
        var raw = exactHcp === '' || exactHcp == null ? 0 : parseFloat(exactHcp);
        if (!isFinite(raw)) raw = 0;
        var out = { raw: raw, afterPercent: raw, capped: raw, effective: raw, cappedByMax: false, cutApplied: false };
        var cfg = cut || {}, eff = raw;
        if (cfg.enabled) {
            var pct = parseFloat(cfg.percent);
            if (!isFinite(pct) || pct <= 0) pct = 100;
            pct = Math.min(100, pct);
            if (pct < 100) { eff = Math.round(raw * pct) / 100; out.cutApplied = true; }
        }
        out.afterPercent = Math.round(eff * 10) / 10;
        var maxEnabled = cfg.maxEnabled === undefined || cfg.maxEnabled === null
            ? (cfg.maxMen !== '' && cfg.maxMen != null) || (cfg.maxWomen !== '' && cfg.maxWomen != null)
            : cfg.maxEnabled === true;
        var maxValue = gender === 'women' ? cfg.maxWomen : cfg.maxMen;
        maxValue = maxValue === '' || maxValue == null ? null : parseFloat(maxValue);
        if (maxEnabled && isFinite(maxValue) && eff > maxValue) {
            eff = maxValue;
            out.cappedByMax = true;
            out.cutApplied = true;
        }
        out.capped = eff;
        out.effective = Math.round(eff * 10) / 10;
        return out;
    }

    function validateConfig(config) {
        var c = config || {};
        var errors = [];
        var info = c.info || {};
        var format = c.format || {};
        var rounds = Array.isArray(format.rounds) ? format.rounds : [];
        var scoring = c.scoring || {};
        var participants = c.participants || {};
        if (!str(info.nameRu || info.name)) errors.push('name_required');
        if (!rounds.length || !rounds.some(function (r) { return r && str(r.date); })) errors.push('round_date_required');
        if (rounds.some(function (r) { return r && str(r.date) && !dateStart(r.date); })) errors.push('round_date_invalid');
        if (!Array.isArray(scoring.systems) || !scoring.systems.length) errors.push('scoring_required');
        if (format.regOpen && !dateStart(format.regOpen)) errors.push('registration_open_invalid');
        if (format.regClose && !dateEnd(format.regClose)) errors.push('registration_close_invalid');
        if (format.regOpen && format.regClose && dateStart(format.regOpen) > dateEnd(format.regClose)) errors.push('registration_window_invalid');
        if (participants.hcpMin !== '' && participants.hcpMax !== '' && participants.hcpMin != null && participants.hcpMax != null && num(participants.hcpMin) > num(participants.hcpMax)) errors.push('handicap_range_invalid');
        if (participants.limit !== '' && participants.limit != null && (!isFinite(parseInt(participants.limit, 10)) || parseInt(participants.limit, 10) < 0 || parseInt(participants.limit, 10) > 5000)) errors.push('participant_limit_invalid');
        var hcp = scoring.hcp || {};
        if (hcp.allowancePct !== '' && hcp.allowancePct != null && (num(hcp.allowancePct) < 0 || num(hcp.allowancePct) > 100)) errors.push('allowance_invalid');
        var dist = c.prizes && c.prizes.distribution;
        if (Array.isArray(dist) && dist.reduce(function (sum, row) { return sum + Math.max(0, num(row && row.pct)); }, 0) > 100.0001) errors.push('distribution_over_100');
        var flights = c.flights || {};
        if (flights.groupSize != null && [2, 3, 4, '2', '3', '4'].indexOf(flights.groupSize) === -1) errors.push('group_size_invalid');
        return errors;
    }

    function flatten(value, prefix, out) {
        out = out || {};
        prefix = prefix || '';
        if (value == null || typeof value !== 'object') { out[prefix] = value; return out; }
        if (Array.isArray(value)) {
            out[prefix] = value.length;
            value.forEach(function (v, i) { flatten(v, prefix ? prefix + '.' + i : String(i), out); });
            return out;
        }
        Object.keys(value).forEach(function (key) { flatten(value[key], prefix ? prefix + '.' + key : key, out); });
        return out;
    }
    function diff(before, after) {
        var a = flatten(before || {}), b = flatten(after || {}), keys = {}, changes = [];
        Object.keys(a).forEach(function (k) { keys[k] = true; });
        Object.keys(b).forEach(function (k) { keys[k] = true; });
        Object.keys(keys).sort().forEach(function (k) {
            if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changes.push({ path: k, before: a[k], after: b[k] });
        });
        return changes;
    }
    function audit(event, actor, changes, extra) {
        var row = {
            event: str(event) || 'updated',
            at: Date.now(),
            by: str(actor && (actor.uid || actor.email || actor.name)) || str(actor) || 'unknown',
            changes: Array.isArray(changes) ? clone(changes) : [],
            source: 'tournament-management-v2'
        };
        Object.keys(extra || {}).forEach(function (key) { row[key] = clone(extra[key]); });
        return row;
    }

    function protocolState(tournament) {
        var source = tournament && tournament.protocol || tournament || {};
        return {
            version: Math.max(0, parseInt(source.version, 10) || 0),
            state: ['live', 'fixed', 'published'].indexOf(str(source.state)) !== -1 ? str(source.state) : 'live',
            fixed: source.fixed === true,
            published: source.published === true,
            updatedAt: source.updatedAt || null,
            updatedBy: source.updatedBy || null
        };
    }
    function protocolTransition(tournament, target, actor) {
        var current = protocolState(tournament), to = str(target);
        if (['live', 'fixed', 'published'].indexOf(to) === -1) return { ok: false, error: 'unknown_protocol_state', from: current.state, to: to };
        if (to === 'fixed' && current.state === 'published') return { ok: false, error: 'published_is_immutable', from: current.state, to: to };
        if (to === 'published' && current.state !== 'fixed' && current.state !== 'published') return { ok: false, error: 'fix_before_publish', from: current.state, to: to };
        var stamp = Date.now(), patch = { version: current.version + (to === 'fixed' ? 1 : 0), state: to, fixed: to === 'fixed' || to === 'published', published: to === 'published', updatedAt: stamp, updatedBy: str(actor && (actor.uid || actor.email || actor.name)) || str(actor) || 'unknown' };
        if (to === 'fixed') { patch.fixedAt = stamp; patch.fixedBy = patch.updatedBy; }
        if (to === 'published') { patch.publishedAt = stamp; patch.publishedBy = patch.updatedBy; }
        return { ok: true, from: current.state, to: to, patch: patch };
    }
    function protocolSnapshot(tournament, rows, actor, options) {
        var current = protocolState(tournament), next = current.version + 1, by = str(actor && (actor.uid || actor.email || actor.name)) || str(actor) || 'unknown', opts = options || {};
        return { version: next, state: 'fixed', fixed: true, published: false, fixedAt: Date.now(), fixedBy: by, rows: clone(rows || []), nominations: clone(opts.nominations || []), source: 'rounds+settings/course' };
    }

    function cloneConfig(tournament, includeParticipants) {
        var source = clone(tournament || {});
        var copy = clone(source || {});
        delete copy._key;
        delete copy.audit;
        delete copy.updatedAt;
        delete copy.updatedBy;
        delete copy.startedAt;
        delete copy.finishedAt;
        delete copy.lifecycleChangedAt;
        copy.protocol = { version: 0, state: 'live', fixed: false, published: false };
        copy.roles = {};
        copy.status = STATUS.DRAFT;
        copy.lifecycleStatus = STATUS.DRAFT;
        copy.createdAt = Date.now();
        copy.clonedFrom = source.id || source._key || null;
        copy.registration = clone(copy.registration || {});
        if (copy.registration) {
            copy.registration.openAt = '';
            copy.registration.closeAt = '';
        }
        if (copy.wizard && copy.wizard.format) {
            copy.wizard.format = clone(copy.wizard.format);
            (copy.wizard.format.rounds || []).forEach(function (round) { round.date = ''; });
            copy.wizard.format.regOpen = '';
            copy.wizard.format.regClose = '';
        }
        if (!includeParticipants) {
            delete copy.registeredPlayers;
            delete copy.waitlist;
            delete copy.applications;
            delete copy.groups;
            delete copy.flights;
        }
        return copy;
    }

    function normalizeParticipants(value) {
        var source = value || {};
        var list = Array.isArray(source) ? source : Object.keys(source).map(function (key) {
            var p = clone(source[key] || {});
            p._key = key;
            return p;
        });
        var seen = {}, seenNames = {};
        return list.filter(function (p) {
            var name = str(p.name || [p.lastName, p.firstName].filter(Boolean).join(' ')).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
            var key = str(p.uid || p.id || name);
            // A missing UID is common in public applications. Do not create a
            // second participant record merely because the same person came
            // from a different import path.
            if (!key || seen[key] || (name && seenNames[name])) return false;
            seen[key] = true;
            if (name) seenNames[name] = true;
            p.name = name ? str(p.name || [p.lastName, p.firstName].filter(Boolean).join(' ')) : '—';
            var h = p.handicap != null && p.handicap !== '' ? num(String(p.handicap).replace(',', '.')) : null;
            p.handicap = h == null || !isFinite(h) ? null : Math.round(h * 10) / 10;
            p.gender = p.gender === 'women' || p.gender === 'female' || p.gender === 'w' ? 'women' : 'men';
            p.status = str(p.status).toUpperCase() || 'PENDING';
            return true;
        });
    }

    function courseHoles(course) {
        var holes = course && course.holes;
        if (!holes || (Array.isArray(holes) && !holes.length)) {
            holes = [];
            for (var i = 1; i <= 18; i++) holes.push({ num: i, par: 4, si: i });
        }
        if (!Array.isArray(holes)) holes = Object.keys(holes).map(function (key) { return holes[key]; });
        if (!holes.length) {
            for (var j = 1; j <= 18; j++) holes.push({ num: j, par: 4, si: j });
        }
        return holes.map(function (h, i) {
            return { num: parseInt(h.num, 10) || i + 1, par: num(h.par, 4), si: num(h.si, i + 1) };
        }).sort(function (a, b) { return a.num - b.num; });
    }
    function allocation(handicap, holes) {
        var out = {}, n = Math.max(0, Math.round(num(handicap)));
        holes.forEach(function (h) { out[h.num] = 0; });
        var ordered = holes.slice().sort(function (a, b) { return a.si - b.si; });
        for (var i = 0; i < n; i++) out[ordered[i % ordered.length].num]++;
        return out;
    }
    function stableford(gross, par, received) {
        var toPar = gross - received - par;
        if (toPar <= -3) return 5;
        if (toPar === -2) return 4;
        if (toPar === -1) return 3;
        if (toPar === 0) return 2;
        if (toPar === 1) return 1;
        return 0;
    }
    function roundStats(player, course) {
        var holes = courseHoles(course), scores = player && player.scores || {}, hcp = num(player && (player.fieldHcp != null ? player.fieldHcp : player.handicap), 0), alloc = allocation(hcp, holes);
        var gross = 0, net = 0, points = 0, played = 0, breakdown = [];
        holes.forEach(function (hole) {
            var score = parseInt(scores[hole.num], 10);
            if (!isFinite(score) || score <= 0) return;
            var received = alloc[hole.num] || 0;
            gross += score;
            net += score - received;
            points += stableford(score, hole.par, received);
            played++;
            breakdown.push({ hole: hole.num, par: hole.par, si: hole.si, gross: score, net: score - received, stableford: stableford(score, hole.par, received) });
        });
        return { gross: gross, net: net, stableford: points, holes: played, breakdown: breakdown };
    }
    function statusRank(status) {
        return { DQ: 4, WD: 3, DNS: 2, DNF: 1 }[str(status).toUpperCase()] || 0;
    }
    function sumLast(scores, count) {
        var list = (scores || []).slice(-count);
        return list.reduce(function (sum, item) { return sum + num(item.value); }, 0);
    }
    function tieBreakCompare(aScores, bScores, methods) {
        var selected = Array.isArray(methods) && methods.length ? methods : ['countback'];
        for (var i = 0; i < selected.length; i++) {
            var method = selected[i], result = 0;
            if (method === 'countback') {
                [9, 6, 3, 1].some(function (count) {
                    var a = sumLast(aScores, count), b = sumLast(bScores, count);
                    if (a !== b) { result = a - b; return true; }
                    return false;
                });
            } else if (method === 'last-hole') result = sumLast(aScores, 1) - sumLast(bScores, 1);
            else if (method === 'stroke-index') {
                var aa = (aScores || []).slice().sort(function (x, y) { return num(x.si) - num(y.si); });
                var bb = (bScores || []).slice().sort(function (x, y) { return num(x.si) - num(y.si); });
                for (var j = 0; j < Math.min(aa.length, bb.length); j++) {
                    if (num(aa[j].value) !== num(bb[j].value)) { result = num(aa[j].value) - num(bb[j].value); break; }
                }
            }
            if (result !== 0) return result;
        }
        return 0;
    }
    function buildLeaderboard(tournament, rounds, course) {
        var map = {}, t = tournament || {}, rows = [], formatText = JSON.stringify(t.formats || []) + ' ' + JSON.stringify(t.wizard && t.wizard.scoring && t.wizard.scoring.systems || []);
        var stable = /stableford/i.test(formatText), grossMode = !stable && /gross|stroke-gross/i.test(formatText), tieMethods = t.wizard && t.wizard.scoring && t.wizard.scoring.tieBreaks;
        Object.keys(rounds || {}).forEach(function (rid) {
            var round = rounds[rid] || {};
            if (String(round.tournamentId || '') !== String(t._key || t.id || t.tournamentId || '')) return;
            Object.keys(round.players || {}).forEach(function (pid) {
                var player = round.players[pid] || {}, key = String(player.uid || pid || player.name || '');
                if (!key) return;
                var row = map[key];
                if (!row) row = map[key] = { key: key, name: player.name || '—', gender: player.gender === 'women' || player.gender === 'female' || player.gender === 'w' ? 'women' : 'men', handicap: player.exactHcp != null ? player.exactHcp : player.handicap, status: str(player.status || (round.playerStatuses && round.playerStatuses[pid])).toUpperCase() || 'ACTIVE', gross: 0, net: 0, stableford: 0, holes: 0, rounds: 0, byRound: {}, breakdown: [], _tieBreak: [] };
                var stats = roundStats(player, course);
                row.name = row.name === '—' ? (player.name || '—') : row.name;
                row.gross += stats.gross;
                row.net += stats.net;
                row.stableford += stats.stableford;
                row.holes += stats.holes;
                row.rounds++;
                row.byRound[rid] = stats;
                row.breakdown = row.breakdown.concat(stats.breakdown);
                row._tieBreak = row._tieBreak.concat(stats.breakdown.map(function (hole) {
                    return { num: hole.hole, par: hole.par, si: hole.si, value: stable ? hole.stableford : (grossMode ? hole.gross : hole.net) };
                }));
                if (statusRank(player.status) > statusRank(row.status)) row.status = str(player.status).toUpperCase();
            });
        });
        // Explicit DNS/WD/DNF/DQ rows may be present in registration even if
        // the player never produced a scorecard. They must be visible in the
        // final protocol, but ordinary pending registrations stay hidden.
        Object.keys(t.registeredPlayers || {}).forEach(function (pid) {
            var participant = t.registeredPlayers[pid] || {}, status = str(participant.status).toUpperCase(), key = String(participant.uid || pid);
            if (!status || ['DNS', 'WD', 'DNF', 'DQ'].indexOf(status) === -1 || map[key] || map[pid]) return;
            map[key] = { key: key, name: participant.name || '—', gender: participant.gender === 'women' || participant.gender === 'female' || participant.gender === 'w' ? 'women' : 'men', handicap: participant.handicap, status: status, gross: 0, net: 0, stableford: 0, holes: 0, rounds: 0, byRound: {}, breakdown: [], _tieBreak: [] };
        });
        rows = Object.keys(map).map(function (key) { return map[key]; });
        rows.sort(function (a, b) {
            var ar = statusRank(a.status), br = statusRank(b.status);
            if (ar !== br) return ar - br;
            var aMetric = stable ? a.stableford : grossMode ? a.gross : a.net, bMetric = stable ? b.stableford : grossMode ? b.gross : b.net;
            if (aMetric !== bMetric) return stable ? bMetric - aMetric : aMetric - bMetric;
            var tie = tieBreakCompare(a._tieBreak, b._tieBreak, tieMethods);
            if (tie !== 0) return stable ? -tie : tie;
            if (a.gross !== b.gross) return a.gross - b.gross;
            return str(a.name).localeCompare(str(b.name));
        });
        var previous = null;
        rows.forEach(function (row, index) {
            var metric = stable ? row.stableford : grossMode ? row.gross : row.net;
            if (row.status !== 'ACTIVE' && row.status !== 'FINAL') row.position = null;
            else if (previous && previous.metric === metric && tieBreakCompare(previous.tie, row._tieBreak, tieMethods) === 0) row.position = previous.position;
            else row.position = index + 1;
            if (row.position != null) previous = { metric: metric, tie: row._tieBreak, position: row.position };
            row.metric = metric;
            var parPlayed = (row.breakdown || []).reduce(function (sum, h) { return sum + (num(h && h.par, 4) || 4); }, 0);
            row.toPar = row.holes > 0 ? (row.gross - parPlayed) : null;
            row.thru = row.holes;
            delete row._tieBreak;
        });
        return rows;
    }
    function holesPar(holes) { return (holes || []).reduce(function (sum, h) { return sum + num(h.par, 4); }, 0); }
    function protocolRows(tournament, rounds, course) {
        var text = JSON.stringify((tournament || {}).formats || []) + ' ' + JSON.stringify(tournament && tournament.wizard && tournament.wizard.scoring && tournament.wizard.scoring.systems || []);
        var stable = /stableford/i.test(text), grossMode = !stable && /gross|stroke-gross/i.test(text);
        return buildLeaderboard(tournament, rounds, course).map(function (row) {
            return { key: row.key, position: row.position, name: row.name, gender: row.gender, handicap: row.handicap, gross: row.gross, net: row.net, stableford: row.stableford, total: stable ? row.stableford : grossMode ? row.gross : row.net, thru: row.thru, status: row.status, holes: row.breakdown, metric: row.metric };
        });
    }
    function buildNominations(rows, nominations) {
        var ids = nominations === undefined ? ['best-gross', 'best-net'] : (Array.isArray(nominations) ? nominations : []);
        var eligible = (rows || []).filter(function (row) { return row && (row.status === 'ACTIVE' || row.status === 'FINAL' || !row.status); });
        return ids.map(function (item) {
            var id = typeof item === 'string' ? item : item && (item.id || item.kind);
            id = str(id) || 'best-net';
            var lower = id.toLowerCase(), gender = null;
            if (/women|female|ladies|жен/.test(lower)) gender = 'women';
            else if (/men|male|муж/.test(lower)) gender = 'men';
            var pool = eligible.filter(function (row) { return !gender || row.gender === gender; });
            var high = /stableford|points|stbl/.test(lower), gross = /gross|gross/.test(lower);
            var sorted = pool.slice().sort(function (a, b) {
                var av = high ? num(a.stableford) : gross ? num(a.gross) : num(a.net), bv = high ? num(b.stableford) : gross ? num(b.gross) : num(b.net);
                if (av !== bv) return high ? bv - av : av - bv;
                return str(a.name).localeCompare(str(b.name));
            });
            return { id: id, label: typeof item === 'object' && item.label ? str(item.label) : id, winners: sorted.slice(0, 3).map(function (row) { return clone(row); }) };
        });
    }
    function csv(rows) {
        var cols = ['position', 'name', 'handicap', 'gross', 'net', 'stableford', 'total', 'status'];
        function cell(v) {
            var s = String(v == null ? '' : v);
            // Prevent formula execution when a player/imported text starts
            // with a spreadsheet formula marker. Numeric negatives remain
            // numeric, while arbitrary text receives a harmless apostrophe.
            if (/^[=+@]/.test(s) || (/^-/.test(s) && !isFinite(Number(s)))) s = "'" + s;
            return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }
        return '\ufeff' + cols.join(';') + '\n' + (rows || []).map(function (row) { return cols.map(function (key) { return cell(row[key]); }).join(';'); }).join('\n');
    }

    return {
        STATUS: STATUS,
        ROLE_IDS: ROLE_IDS,
        clone: clone,
        nowMs: nowMs,
        registrationConfig: registrationConfig,
        lifecycleStatus: lifecycleStatus,
        isPast: isPast,
        isRegistrationOpen: isRegistrationOpen,
        classify: classify,
        legacyStatus: legacyStatus,
        canTransition: canTransition,
        transition: transition,
        validateConfig: validateConfig,
        applyHcpCut: applyHcpCut,
        flatten: flatten,
        diff: diff,
        audit: audit,
        protocolState: protocolState,
        protocolTransition: protocolTransition,
        protocolSnapshot: protocolSnapshot,
        cloneConfig: cloneConfig,
        normalizeParticipants: normalizeParticipants,
        courseHoles: courseHoles,
        roundStats: roundStats,
        tieBreakCompare: tieBreakCompare,
        buildLeaderboard: buildLeaderboard,
        protocolRows: protocolRows,
        buildNominations: buildNominations,
        csv: csv
    };
});
