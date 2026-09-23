'use strict';
// Server-owned score mutations. RTDB transaction keeps the before/after values
// and an outbox item in the SAME round commit. The protected day index is
// delivered from that outbox (also on retry), never written by the browser.
module.exports = function createScoreAudit(functions, admin, db) {
    const DAY_MS = 86400000;
    const KEEP_MS = 30 * DAY_MS;
    const validKey = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,120}$/.test(v);
    const dateKey = ms => new Date(ms).toISOString().slice(0, 10);
    const HttpsError = functions.https.HttpsError;
    function fail(code, text) { throw new HttpsError(code, text); }
    function isAdmin(user) { return !!(user && (user.admin === true || user.role === 'admin')); }
    function isMaster(auth, now) {
        return !!(auth && auth.uid === 'tournament-master' && auth.token && auth.token.tournamentMaster === true && auth.token.tournamentMasterUntil > now);
    }
    async function actor(auth, now) {
        if (!auth || !auth.uid) return { uid: null, label: 'QR-доступ (личность не подтверждена)', type: 'qr' };
        if (isMaster(auth, now)) return { uid: auth.uid, label: 'Мастер-пароль (оператор не установлен)', type: 'master', admin: true };
        const u = (await db.ref('users/' + auth.uid).once('value')).val() || {};
        return { uid: auth.uid, label: String(u.name || u.email || auth.uid).slice(0, 120), type: 'account', admin: isAdmin(u) };
    }
    async function deliver(ownerPath, requestId, events) {
        for (const evt of Object.values(events || {})) {
            if (Date.now() - evt.at < KEEP_MS) {
                await db.ref('scoreAudit/' + evt.day + '/' + evt.id).set(evt);
            }
        }
        // Outbox is cleared only after all records have reached the protected index.
        await db.ref(ownerPath + '/_scoreAuditOutbox/' + requestId).remove();
    }
    const scoreWrite = functions.https.onCall(async function (data, context) {
        const now = Date.now();
        const rid = data && data.roundId, requestId = data && data.requestId;
        if (!validKey(rid) || !validKey(requestId) || requestId.length < 16) fail('invalid-argument', 'Invalid round or request ID');
        // Проверяем только реалистичность queuedAt (не в будущем). 30-дневное
        // окно ретеншена обеспечивает purgeScoreAudit, а не эта проверка.
        if (!Number.isSafeInteger(data.queuedAt) || data.queuedAt < 0 || data.queuedAt > now + 5 * 60000) fail('failed-precondition', 'Invalid queuedAt timestamp');
        const operations = data.operations;
        if (!Array.isArray(operations) || !operations.length || operations.length > 72) fail('invalid-argument', 'Invalid score batch');
        const own = data.actorPlayerId;
        if (own != null && !validKey(own)) fail('invalid-argument', 'Invalid player');
        const seen = new Set();
        operations.forEach(function (op) {
            if (!op || !validKey(op.playerId) || !Number.isInteger(op.hole) || op.hole < 1 || op.hole > 18 || !['score', 'marker'].includes(op.kind) ||
                !(Number.isInteger(op.score) && op.score >= 1 && op.score <= 20 || op.score === null)) fail('invalid-argument', 'Invalid score');
            const key = [op.kind, op.playerId, op.hole].join('|');
            if (seen.has(key)) fail('invalid-argument', 'Duplicate hole in batch');
            seen.add(key);
        });
        const who = await actor(context.auth, now);
        const roundRef = db.ref('rounds/' + rid);
        const original = (await roundRef.once('value')).val();
        if (!original || !original.players) fail('not-found', 'Round not found');
        const authPlayer = who.uid && original.players[who.uid] ? who.uid : null;
        const qrAccess = data.qrAccess === true;
        const actorPlayerId = who.admin ? (own || null) : (qrAccess ? own : (authPlayer || own));
        if (!who.admin && (!actorPlayerId || !original.players[actorPlayerId])) fail('permission-denied', 'A player card or administrator is required');
        if (!who.admin && original.status !== 'active' && !(original._scoreAuditIds && original._scoreAuditIds[requestId])) fail('failed-precondition', 'Round is not active');
        // A QR link proves possession of a card, NOT a personal identity. Do not
        // attribute QR saves to a player account supplied by the browser.
        if (!who.admin && (qrAccess || who.uid !== actorPlayerId)) { who.uid = null; who.type = 'qr'; who.label = 'QR-доступ (личность не подтверждена)'; }
        if (!who.admin && operations.some(op => op.score === null)) fail('permission-denied', 'Only administrators can clear a score');
        function allowed(round, op) {
            if (!round.players || !round.players[op.playerId]) return false;
            if (who.admin) return true;
            if (op.kind === 'score') return op.playerId === actorPlayerId;
            return op.playerId !== actorPlayerId && (
                round.players[op.playerId].markedBy === actorPlayerId ||
                !!(round.markerAssignments && round.markerAssignments[actorPlayerId] && round.markerAssignments[actorPlayerId].targetId === op.playerId)
            );
        }
        if (operations.some(op => !allowed(original, op))) fail('permission-denied', 'Not your scorecard');
        // Idempotency across reconnect/retry: transaction callbacks may rerun,
        // so everything they compute lives in the round value, not side effects.
        const tx = await roundRef.transaction(function (round) {
            if (!round || !round.players) return;
            round._scoreAuditIds = round._scoreAuditIds || {};
            if (round._scoreAuditIds[requestId]) return; // already applied
            if (!who.admin && round.status !== 'active') return;
            if (operations.some(op => !allowed(round, op))) return;
            const events = {};
            operations.forEach(function (op, i) {
                const p = round.players[op.playerId];
                const hole = String(op.hole);
                let old;
                let markerId = null;
                if (op.kind === 'marker') {
                    markerId = actorPlayerId;
                    p.markerScores = p.markerScores || {};
                    p.markerScores[markerId] = p.markerScores[markerId] || {};
                    old = p.markerScores[markerId][hole] == null ? null : p.markerScores[markerId][hole];
                    p.markerScores[markerId][hole] = op.score;
                    p.markerSubmitted = p.markerSubmitted || {};
                    p.markerSubmitted[markerId] = p.markerSubmitted[markerId] || {};
                    p.markerSubmitted[markerId][hole] = true;
                } else {
                    p.scores = p.scores || {};
                    old = p.scores[hole] == null ? null : p.scores[hole];
                    if (op.score === null) delete p.scores[hole]; else p.scores[hole] = op.score;
                    p.submitted = p.submitted || {};
                    p.submitted[hole] = op.score !== null;
                }
                p.holeTimes = p.holeTimes || {};
                if (!p.holeTimes[hole]) p.holeTimes[hole] = now;
                const mark = p.markedBy && p.markerScores && p.markerScores[p.markedBy] && p.markerScores[p.markedBy][hole];
                p.verified = p.verified || {};
                p.verified[hole] = mark ? (mark === p.scores[hole] ? true : p.scores[hole] ? false : 'pending') : 'pending';
                const id = requestId + '_' + i;
                events[id] = { id, day: dateKey(now), at: now, queuedAt: data.queuedAt, roundId: rid,
                    tournamentId: round.tournamentId || null, playerId: op.playerId,
                    playerName: String(p.name || [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ') || op.playerId).slice(0, 120),
                    hole: op.hole, kind: op.kind, oldScore: old, newScore: op.score,
                    action: old === null ? 'entered' : op.score === null ? 'cleared' : old === op.score ? 'saved_again' : 'corrected',
                    markerId, actorUid: who.uid, actorLabel: who.label, actorType: who.type };
            });
            round._scoreAuditIds[requestId] = now;
            round._scoreAuditOutbox = round._scoreAuditOutbox || {};
            round._scoreAuditOutbox[requestId] = events;
            return round;
        }, undefined, false);
        if (!tx.committed) {
            const existing = (await roundRef.child('_scoreAuditIds/' + requestId).once('value')).val();
            if (!existing) fail('failed-precondition', 'Round changed or score was already submitted');
        }
        const events = (await roundRef.child('_scoreAuditOutbox/' + requestId).once('value')).val();
        if (events) await deliver('rounds/' + rid, requestId, events);
        // Marker mirror is a legacy read model. The authoritative score and
        // event are already committed together in the round transaction.
        for (const op of operations) {
            if (op.kind === 'marker') await db.ref('markers/' + rid + '/' + op.playerId + '/' + op.hole).set(op.score);
        }
        return { ok: true, duplicate: !tx.committed, confirmedAt: now };
    });
    const onScoreAuditOutbox = functions.database.ref('/rounds/{roundId}/_scoreAuditOutbox/{requestId}').onCreate(async (snapshot, context) => {
        await deliver('rounds/' + context.params.roundId, context.params.requestId, snapshot.val());
    });
    const studioScoreWrite = functions.https.onCall(async (data, context) => {
        const now = Date.now();
        const tid = data && data.tournamentId, dayId = data && data.dayId;
        const pid = data && data.playerId, hole = data && data.hole, score = data && data.score;
        const requestId = data && data.requestId;
        if (![tid, dayId, pid, requestId].every(validKey) || requestId.length < 16 || !Number.isInteger(hole) || hole < 1 || hole > 18 ||
            !(score === null || (Number.isInteger(score) && score >= 1 && score <= 20)) ||
            !Number.isSafeInteger(data.queuedAt) || data.queuedAt < 0 || data.queuedAt > now + 300000) {
            fail('invalid-argument', 'Invalid tournament score');
        }
        const who = await actor(context.auth, now);
        if (!who.admin) fail('permission-denied', 'Administrator required');
        const ref = db.ref('tournaments/' + tid);
        const tx = await ref.transaction(function(t) {
            if (!t || !t.days || !t.days[dayId] || !t.registeredPlayers || !t.registeredPlayers[pid]) return;
            t._scoreAuditIds = t._scoreAuditIds || {};
            if (t._scoreAuditIds[requestId]) return;
            t.scores = t.scores || {};
            t.scores[dayId] = t.scores[dayId] || {};
            t.scores[dayId][pid] = t.scores[dayId][pid] || {};
            const before = t.scores[dayId][pid][hole] == null ? null : t.scores[dayId][pid][hole];
            if (score === null) delete t.scores[dayId][pid][hole]; else t.scores[dayId][pid][hole] = score;
            const evt = { id: requestId + '_0', day: dateKey(now), at: now, queuedAt: data.queuedAt,
                roundId: null, tournamentId: tid, tournamentDayId: dayId, playerId: pid,
                playerName: String(t.registeredPlayers[pid].name || pid).slice(0, 120), hole,
                kind: 'studio', oldScore: before, newScore: score,
                action: before === null ? 'entered' : score === null ? 'cleared' : before === score ? 'saved_again' : 'corrected',
                actorUid: who.uid, actorLabel: who.label, actorType: who.type };
            t._scoreAuditIds[requestId] = now;
            t._scoreAuditOutbox = t._scoreAuditOutbox || {};
            t._scoreAuditOutbox[requestId] = { [evt.id]: evt };
            return t;
        }, undefined, false);
        if (!tx.committed && !(await ref.child('_scoreAuditIds/' + requestId).once('value')).exists()) fail('not-found', 'Tournament or player not found');
        const events = (await ref.child('_scoreAuditOutbox/' + requestId).once('value')).val();
        if (events) await deliver('tournaments/' + tid, requestId, events);
        return { ok: true, duplicate: !tx.committed, confirmedAt: now };
    });
    const onStudioScoreOutbox = functions.database.ref('/tournaments/{tournamentId}/_scoreAuditOutbox/{requestId}').onCreate(async (snapshot, context) => {
        await deliver('tournaments/' + context.params.tournamentId, context.params.requestId, snapshot.val());
    });
    // Best-effort transition safety net for older direct clients. It runs AFTER
    // a direct write, not atomically with it. Cloud Functions use ADMIN authType; browser
    // writes have USER/UNAUTHENTICATED authType. These entries are explicitly
    // marked as legacy/unverified, never represented as server-approved actions.
    const crypto = require('crypto');
    function directTrigger(path, kind) {
        return functions.database.ref(path).onWrite(async function(change, context) {
            if (context.authType === 'ADMIN') return null;
            const old = change.before.val() == null ? null : change.before.val();
            const next = change.after.val() == null ? null : change.after.val();
            if (old === next || (old === null && next === null)) return null;
            const now = Date.now(), p = context.params;
            const rid = p.roundId || null, tid = p.tournamentId || null;
            const pid = p.playerId, hole = Number(p.hole);
            const parent = rid ? (await db.ref('rounds/' + rid + '/players/' + pid).once('value')).val() || {} :
                (await db.ref('tournaments/' + tid + '/registeredPlayers/' + pid).once('value')).val() || {};
            const id = 'legacy_' + crypto.createHash('sha256').update(String(context.eventId || now + ':' + pid + ':' + hole)).digest('hex').slice(0, 44);
            const actorUid = context.auth && context.auth.uid || null;
            const evt = { id, day: dateKey(now), at: now, roundId: rid, tournamentId: tid, tournamentDayId: p.dayId || null,
                playerId: pid, playerName: String(parent.name || pid).slice(0, 120), hole, kind,
                oldScore: old, newScore: next, action: 'legacy_direct_write',
                actorUid, actorLabel: actorUid ? 'Прямая запись: ' + actorUid : 'Прямая запись: автор не установлен',
                actorType: 'unverified-direct' };
            return db.ref('scoreAudit/' + evt.day + '/' + id).set(evt);
        });
    }
    const onDirectPlayerScore = directTrigger('/rounds/{roundId}/players/{playerId}/scores/{hole}', 'score');
    const onDirectMarkerScore = directTrigger('/rounds/{roundId}/players/{playerId}/markerScores/{markerId}/{hole}', 'marker');
    const onDirectMarkerMirror = directTrigger('/markers/{roundId}/{playerId}/{hole}', 'marker');
    const onDirectStudioScore = directTrigger('/tournaments/{tournamentId}/scores/{dayId}/{playerId}/{hole}', 'studio');
    // Daily TTL uses UTC day partitions (and checks the exact cutoff inside
    // the boundary day). Never trust the client clock for retention.
    const purgeScoreAudit = functions.pubsub.schedule('every day 03:00').timeZone('UTC').onRun(async () => {
        const cutoffMs = Date.now() - KEEP_MS;
        const cutoff = dateKey(cutoffMs);
        for (const collection of ['rounds', 'tournaments']) {
            const owners = (await db.ref(collection).once('value')).val() || {};
            for (const id of Object.keys(owners)) {
                const outbox = owners[id] && owners[id]._scoreAuditOutbox || {};
                for (const requestId of Object.keys(outbox)) await deliver(collection + '/' + id, requestId, outbox[requestId]);
            }
        }
        const days = (await db.ref('scoreAudit').once('value')).val() || {};
        for (const day of Object.keys(days)) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > cutoff) continue;
            const updates = {};
            Object.values(days[day] || {}).forEach(evt => {
                if (day === cutoff && evt && Number.isFinite(evt.at) && evt.at >= cutoffMs) return;
                if (evt && validKey(evt.roundId) && validKey(evt.id)) {
                    const reqId = evt.id.replace(/_\d+$/, '');
                    updates['rounds/' + evt.roundId + '/_scoreAuditIds/' + reqId] = null;
                } else if (evt && validKey(evt.tournamentId) && validKey(evt.id)) {
                    updates['tournaments/' + evt.tournamentId + '/_scoreAuditIds/' + evt.id.replace(/_\d+$/, '')] = null;
                }
                if (day === cutoff && evt && validKey(evt.id)) updates['scoreAudit/' + day + '/' + evt.id] = null;
            });
            if (day < cutoff) updates['scoreAudit/' + day] = null;
            if (Object.keys(updates).length) await db.ref().update(updates);
        }
        return null;
    });
    return { scoreWrite, studioScoreWrite, onScoreAuditOutbox, onStudioScoreOutbox, onDirectPlayerScore, onDirectMarkerScore, onDirectMarkerMirror, onDirectStudioScore, purgeScoreAudit };
};
