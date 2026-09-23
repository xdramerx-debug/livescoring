'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../js/firebase-config.js'), 'utf8');
(async () => {
    let callback, anonymousCalls = 0, ready = 0, loaded = 0;
    const auth = { onAuthStateChanged: fn => { callback = fn; }, signInAnonymously: () => { anonymousCalls++; return Promise.resolve(); } };
    const database = () => ({ goOnline: () => {}, ref: () => ({ once: async () => { loaded++; return {val: () => null}; } }) });
    const firebase = {initializeApp: () => {}, database, auth: () => auth};
    const ctx = {firebase,location:{pathname:'/scorer.html',search:'?round=r1&player=u1'},URLSearchParams,
        console,onAuthReady: () => {ready++;}, toast: () => {throw new Error('unexpected auth error');}};
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    assert(ctx.pestovoQrAuthPending);
    callback(null);
    assert.strictEqual(anonymousCalls, 1, 'QR starts technical anonymous session');
    assert.strictEqual(loaded, 0, 'round should not load before auth');
    assert.strictEqual(ready, 0);
    callback({uid:'anonymous-id',isAnonymous:true});
    await new Promise(resolve => setTimeout(resolve,0));
    assert.strictEqual(ready, 1);
    assert.strictEqual(ctx.pestovoQrAuthPending, false);
    assert.strictEqual(ctx.currentUser.uid, 'anonymous-id');
    console.log('QR anonymous Auth: waits for technical session before loading passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
