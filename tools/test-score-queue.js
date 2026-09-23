'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '../js/pwa.js'), 'utf8');
const sleep = () => new Promise(resolve => setTimeout(resolve, 20));
(async () => {
    const storage = {};
    const localStorage = { getItem: key => storage[key] || null, setItem: (key, val) => { storage[key] = val; }, removeItem: key => { delete storage[key]; } };
    const calls = [];
    const window = { addEventListener: () => {}, navigator: {}, location: { href:'' } };
    const document = { getElementById: () => null, body: { appendChild: () => {} }, createElement: () => ({ classList: { add: () => {}, remove: () => {} }, style: {} }), addEventListener: () => {} };
    const navigator = { onLine:true, userAgent:'Node' };
    const ctx = { window, document, navigator, localStorage, setInterval: () => {}, setTimeout: () => {},
        Promise, Date, Math, console, currentUser:{uid:'u2'}, currentLang:'en',
        pestovoScoreSend: a => { calls.push(a); return Promise.resolve({ok:true}); },
        db: {ref: key => ({once: async () => ({val: () => key.includes('markedBy') ? 'u2' : null}), set: () => { throw new Error('direct score set forbidden'); }})} };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    ctx.queueOfflineScoreAction({roundId:'r1',requestId:'queue_request_12345678',authUid:'u2',operations:[]});
    assert.strictEqual(ctx.hasPendingScoreActions(), true);
    ctx.queueOfflineScoreAction({roundId:'r1',requestId:'queue_request_87654321',authUid:'u2',operations:[]});
    ctx.syncOfflineScores(); await sleep();
    assert.deepStrictEqual(calls.map(c => c.requestId), ['queue_request_12345678','queue_request_87654321']);
    assert.strictEqual(ctx.hasPendingScoreActions(), false);
    storage.pestovo_offline_scores = JSON.stringify([{type:'set',path:'markers/r1/u1/2',value:5,timestamp:Date.now()}]);
    ctx.syncOfflineScores(); await sleep();
    assert.strictEqual(calls[2].operations[0].kind, 'marker');
    assert.strictEqual(calls[2].actorPlayerId, 'u2');
    assert.strictEqual(ctx.hasPendingScoreActions(), false);
    storage.pestovo_offline_scores = JSON.stringify([{type:'set',path:'rounds/r1/players/u1/markerScores/u2/3',value:4,timestamp:Date.now()}]);
    ctx.syncOfflineScores(); await sleep();
    assert.strictEqual(calls[3].operations[0].kind, 'marker');
    assert.strictEqual(calls[3].operations[0].hole, 3);
    assert.strictEqual(calls[3].actorPlayerId, 'u2');
    assert.strictEqual(calls[3].qrAccess, true);
    assert.strictEqual(ctx.hasPendingScoreActions(), false);
    console.log('Score queue: sequential replay and legacy marker migration passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
