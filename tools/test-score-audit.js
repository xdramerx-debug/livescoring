'use strict';
const assert = require('assert');
const path = require('path');
const create = require('../functions/score-audit');
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const state = {
    users: { u1: { name: 'Иванов Иван', role: 'player' }, adm: { name: 'Судья', role: 'admin' } },
    rounds: { r1: { status: 'active', players: { u1: { name: 'Иванов Иван', scores: {}, markedBy: 'u2' }, u2: { name: 'Петров Пётр', scores: {} } }, markerAssignments: { u2: { targetId: 'u1' } } } },
    tournaments: { tn1: { registeredPlayers: { u1: { name: 'Иванов Иван' } }, days: { d1: { date: '2026-09-23' } } } }
};
function get(key) { return key.split('/').filter(Boolean).reduce((o, p) => o && o[p], state); }
function set(key, value) {
    const parts = key.split('/').filter(Boolean);
    if (!parts.length) throw new Error('root set forbidden');
    const last = parts.pop();
    let curr = state;
    parts.forEach(p => { curr[p] = curr[p] || {}; curr = curr[p]; });
    if (value == null) delete curr[last]; else curr[last] = clone(value);
}
function ref(key) {
    key = key || '';
    return {
        child: child => ref(key + '/' + child),
        once: async () => ({ val: () => clone(get(key)), exists: () => get(key) != null }),
        set: async value => set(key, value),
        remove: async () => set(key, null),
        update: async paths => { for (const [p, v] of Object.entries(paths)) set(p, v); },
        transaction: async callback => {
            const val = callback(clone(get(key)));
            if (val === undefined) return { committed: false };
            set(key, val);
            return { committed: true };
        }
    };
}
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const functions = {
    https: { onCall: f => f, HttpsError },
    database: { ref: () => ({ onCreate: f => f, onWrite: f => f }) },
    pubsub: { schedule: () => ({ timeZone: () => ({ onRun: f => f }) }) }
};
const api = create(functions, {}, { ref });
const now = Date.now();
const call = (id, operations, uid, acting, qrAccess) => api.scoreWrite({ roundId: 'r1', requestId: id,
    queuedAt: now, actorPlayerId: acting, operations, qrAccess: !!qrAccess }, { auth: uid ? { uid } : null });
(async () => {
    const one = [{kind:'score',playerId:'u1',hole:1,score:4}];
    const two = [{kind:'score',playerId:'u1',hole:1,score:5}];
    assert.strictEqual((await call('first_request_1234567890', one, 'u1', 'u1')).ok, true);
    const day = new Date().toISOString().slice(0, 10);
    let log = state.scoreAudit[day];
    assert.strictEqual(log.first_request_1234567890_0.oldScore, null);
    assert.strictEqual(log.first_request_1234567890_0.newScore, 4);
    assert.strictEqual(log.first_request_1234567890_0.actorUid, 'u1');
    assert.strictEqual(state.rounds.r1.players.u1.scores[1], 4);
    assert.strictEqual((await call('first_request_1234567890', one, 'u1', 'u1')).duplicate, true);
    assert.strictEqual(Object.keys(log).length, 1);
    await call('second_request_1234567890', two, 'u1', 'u1');
    assert.strictEqual(log.second_request_1234567890_0.oldScore, 4);
    assert.strictEqual(log.second_request_1234567890_0.action, 'corrected');
    await assert.rejects(call('wrong_player_1234567890', [{kind:'score',playerId:'u2',hole:1,score:4}], 'u1', 'u1'), e => e.code === 'permission-denied');
    await assert.rejects(call('invalid_score_1234567890', [{kind:'score',playerId:'u1',hole:19,score:4}], 'u1', 'u1'), e => e.code === 'invalid-argument');
    await call('qr_player_request_1234567890', [{kind:'score',playerId:'u2',hole:2,score:4}], null, 'u2');
    assert.strictEqual(log.qr_player_request_1234567890_0.actorType, 'qr');
    assert.strictEqual(log.qr_player_request_1234567890_0.actorUid, null);
    await call('qr_other_account_1234567890', [{kind:'score',playerId:'u2',hole:3,score:5}], 'u1', 'u2', true);
    assert.strictEqual(log.qr_other_account_1234567890_0.actorType, 'qr');
    assert.strictEqual(log.qr_other_account_1234567890_0.actorUid, null);
    assert.strictEqual(state.rounds.r1.players.u2.scores[3], 5);
    await call('marker_request_1234567890', [{kind:'marker',playerId:'u1',hole:1,score:5}], 'u2', 'u2');
    assert.strictEqual(state.rounds.r1.players.u1.verified[1], true);
    assert.strictEqual(log.marker_request_1234567890_0.markerId, 'u2');
    assert.strictEqual(state.markers.r1.u1[1], 5);
    await assert.rejects(call('no_admin_clear_1234567890', [{kind:'score',playerId:'u1',hole:1,score:null}], 'u1', 'u1'), e => e.code === 'permission-denied');
    await call('admin_clear_1234567890', [{kind:'score',playerId:'u1',hole:1,score:null}], 'adm', null);
    assert.strictEqual(log.admin_clear_1234567890_0.action, 'cleared');
    assert.strictEqual(log.admin_clear_1234567890_0.actorLabel, 'Судья');
    const studio = {tournamentId:'tn1',dayId:'d1',playerId:'u1',hole:1,score:4,requestId:'studio_request_1234567890',queuedAt:now};
    await api.studioScoreWrite(studio, {auth:{uid:'adm'}});
    assert.strictEqual(log.studio_request_1234567890_0.kind, 'studio');
    assert.strictEqual(state.tournaments.tn1.scores.d1.u1[1], 4);
    await assert.rejects(api.studioScoreWrite({...studio,requestId:'studio_no_admin_1234567890'}, {auth:{uid:'u1'}}), e => e.code === 'permission-denied');
    assert.strictEqual((await api.studioScoreWrite(studio, {auth:{uid:'adm'}})).duplicate, true);
    // Direct writes are reported separately, without claiming their author was verified.
    await api.onDirectPlayerScore({before:{val:()=>5},after:{val:()=>6}},
        {authType:'USER',auth:{uid:'u1'},eventId:'legacy-event',params:{roundId:'r1',playerId:'u1',hole:'1'}});
    const legacyEvent = Object.values(state.scoreAudit[day]).find(e => e.action === 'legacy_direct_write');
    assert.strictEqual(legacyEvent.actorType, 'unverified-direct');
    assert.strictEqual(legacyEvent.oldScore, 5);
    assert.strictEqual(legacyEvent.newScore, 6);
    const cutoffMs = Date.now() - 30 * 86400000;
    const cutoffDay = new Date(cutoffMs).toISOString().slice(0, 10);
    state.scoreAudit[cutoffDay] = state.scoreAudit[cutoffDay] || {};
    state.scoreAudit[cutoffDay].expired = {id:'expired',at:cutoffMs-1000,roundId:'r1'};
    state.scoreAudit[cutoffDay].fresh = {id:'fresh',at:cutoffMs+1000,roundId:'r1'};
    await api.purgeScoreAudit();
    assert.strictEqual(get('scoreAudit/'+cutoffDay+'/expired'), undefined);
    assert(get('scoreAudit/'+cutoffDay+'/fresh'), 'newer events on boundary day must survive');
        const rules = require('../database.rules.json').rules;
    assert.strictEqual(rules.scoreAudit['.write'], false);
    assert.match(rules.scoreAudit['.read'], /tournamentMasterUntil > now/);
    console.log('Score audit: authenticated/QR/marker/admin/idempotency/studio tests passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
