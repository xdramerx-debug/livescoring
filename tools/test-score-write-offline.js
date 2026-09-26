'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const code = fs.readFileSync(path.join(__dirname, '../js/score-write.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
(async () => {
    const queued = [];
    const sent = [];
    const window = {
        crypto: { randomUUID: (() => { let id = 0; return () => '12345678-1234-1234-1234-' + String(++id).padStart(12, '0'); })() },
        currentUser: { uid: 'signedInElsewhere' },
        location: { pathname: '/scorer.html', search: '?round=r1&player=p2' },
        URLSearchParams, setTimeout, toast: () => {},
        queueOfflineScoreAction: a => { queued.push(a); return true; },
        hasPendingScoreActions: () => queued.length > 0,
        firebase: { functions: () => ({ httpsCallable: () => a => { sent.push(a); return Promise.resolve({ data: {ok:true} }); } }) }
    };
    const navigator = { onLine: false };
    vm.runInNewContext(code, { window, navigator, URLSearchParams, Uint8Array, Array, Promise, setTimeout });
    const first = await window.pestovoScoreWrite('r1', [{kind:'score',playerId:'p2',hole:1,score:4}], 'p2');
    assert.strictEqual(first.offline, true);
    assert.strictEqual(sent.length, 0);
    assert.strictEqual(queued[0].qrAccess, true);
    assert.strictEqual(queued[0].authUid, 'signedInElsewhere');
    navigator.onLine = true;
    await window.pestovoScoreWrite('r1', [{kind:'score',playerId:'p2',hole:1,score:5}], 'p2');
    assert.strictEqual(queued.length, 2, 'later action must not overtake a queued action');
    assert.strictEqual(sent.length, 0);
    queued.length = 0;
    let failOnce = true;
    window.firebase.functions = () => ({ httpsCallable: () => a => {
        sent.push(a);
        if (failOnce) { failOnce = false; return Promise.reject({code:'functions/unavailable'}); }
        return Promise.resolve({data:{ok:true}});
    } });
    const a = window.pestovoScoreWrite('r1', [{kind:'score',playerId:'p2',hole:2,score:4}], 'p2');
    const b = window.pestovoScoreWrite('r1', [{kind:'score',playerId:'p2',hole:2,score:5}], 'p2');
    assert.strictEqual((await a).offline, true);
    assert.strictEqual((await b).offline, true);
    assert.strictEqual(queued.length, 2, 'failed first request joins queue before second');
    assert.strictEqual(sent.length, 1);
    assert.notStrictEqual(queued[0].requestId, queued[1].requestId);
    queued.length = 0;
    await window.pestovoScoreWrite('r1', [{kind:'score',playerId:'p2',hole:3,score:4}], 'p2');
    assert.strictEqual(sent.length, 2, 'online write reaches server when queue is empty');
    window.firebase.functions = () => ({httpsCallable: () => () => Promise.reject({code:'functions/permission-denied'})});
    await assert.rejects(window.pestovoScoreWrite('r1', [{kind:'score',playerId:'p2',hole:4,score:4}], 'p2'));
    assert.strictEqual(queued.length, 0, 'permission errors are not queued as network failures');

    // Прямой RTDB fallback при недоступности Cloud Functions (не задеплоена, internal, unavailable)
    const dbUpdates = [];
    window.db = {
        ref: path => ({
            once: () => Promise.resolve({ val: () => ({ players: { p2: { name: 'Player 2', scores: {} } } }) }),
            update: updates => { dbUpdates.push(updates); return Promise.resolve(); }
        })
    };
    window.firebase.functions = () => ({ httpsCallable: () => () => Promise.reject({ code: 'functions/internal', message: 'internal' }) });
    const directRes = await window.pestovoScoreWrite('r1', [{kind:'score',playerId:'p2',hole:5,score:4}], 'p2');
    assert.strictEqual(directRes.ok, true, 'direct fallback succeeds');
    assert.strictEqual(directRes.fallback, true, 'fallback flag is set');
    assert.strictEqual(queued.length, 0, 'successful fallback must not be queued as offline');
    assert.strictEqual(dbUpdates.length, 1);
    assert.strictEqual(dbUpdates[0]['rounds/r1/players/p2/scores/5'], 4);
    assert.strictEqual(dbUpdates[0]['rounds/r1/players/p2/submitted/5'], true);

    const studioRes = await window.pestovoStudioScoreWrite('tn1', 'd1', 'p2', 5, 4);
    assert.strictEqual(studioRes.ok, true, 'studio fallback succeeds');
    assert.strictEqual(studioRes.fallback, true);
    assert.strictEqual(dbUpdates.length, 2);
    assert.strictEqual(dbUpdates[1]['tournaments/tn1/scores/d1/p2/5'], 4);

    await tick();
    console.log('Score write: offline, QR, ordered replay, network failures and direct fallback passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
