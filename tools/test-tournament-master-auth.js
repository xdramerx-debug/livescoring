// Сервер выдаёт право записи только после проверки секрета; клиентский флаг не даёт прав.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const login = source.slice(source.indexOf('// Мастер-пароль проверяется'), source.indexOf('// ── Валидация входных данных'));
const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8')).rules;
assert.strictEqual(rules['.write'], false, 'root must not grant any authenticated user admin rights');
assert.strictEqual(rules['.read'], false, 'attempt counters must not be readable by clients');
assert.match(rules.tournaments.$id['.write'], /auth\.token\.tournamentMaster === true/);
assert.match(rules.rounds.$rid['.write'], /auth\.token\.tournamentMaster === true/);
assert.match(rules.users.$uid['.write'], /auth\.uid != 'tournament-master'/);
assert.match(rules.users.$uid['.write'], /newData\.child\('admin'\)\.val\(\) === data\.child\('admin'\)\.val\(\)/);
assert.match(rules.users.$uid['.write'], /newData\.child\('role'\)\.val\(\) === 'player'/);
assert.match(rules.protocols.$id['.write'], /tournamentId/);

let counter = null, tokenCalls = 0;
const expectedPassword = 'test-password-with-enough-entropy';
const config = { TOURNAMENT_MASTER_PASSWORD_HASH: crypto.createHash('sha256').update(expectedPassword).digest('hex') };
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const sandbox = {
    require: name => { assert.strictEqual(name, 'crypto'); return crypto; },
    process: { env: config }, Buffer, Date,
    exports: {},
    functions: { runWith: () => ({ https: { onCall: callback => callback } }), https: { HttpsError } },
    admin: { auth: () => ({ createCustomToken: (uid, claims) => {
        tokenCalls++;
        assert.strictEqual(uid, 'tournament-master');
        assert.strictEqual(claims.tournamentMaster, true);
        assert.ok(claims.tournamentMasterUntil > Date.now());
        return Promise.resolve('signed-token');
    } }) },
    db: { ref: () => ({
        transaction: async function (fn) {
            const value = fn(counter);
            if (!value) return { committed: false };
            counter = value;
            return { committed: true };
        },
        remove: async () => { counter = null; }
    }) }
};
vm.runInNewContext(login, sandbox);
const signIn = sandbox.exports.tournamentMasterSignIn;
const request = { rawRequest: { ip: '192.0.2.1' } };
(async function () {
    await assert.rejects(signIn({ password: 'wrong' }, request), e => e.code === 'permission-denied');
    assert.strictEqual(tokenCalls, 0, 'invalid password cannot mint token');
    const result = await signIn({ password: expectedPassword }, request);
    assert.strictEqual(result.token, 'signed-token');
    assert.strictEqual(tokenCalls, 1);
    config.TOURNAMENT_MASTER_PASSWORD_HASH = '';
    await assert.rejects(signIn({ password: expectedPassword }, request), e => e.code === 'failed-precondition');
    config.TOURNAMENT_MASTER_PASSWORD_HASH = crypto.createHash('sha256').update(expectedPassword).digest('hex');
    counter = { since: Date.now(), count: 5 };
    await assert.rejects(signIn({ password: expectedPassword }, request), e => e.code === 'resource-exhausted');
    assert.strictEqual(tokenCalls, 1);
    const client = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');
    assert.match(client, /httpsCallable\('tournamentMasterSignIn'\)/);
    assert.match(client, /signInWithCustomToken/);
    assert.doesNotMatch(client, /PESTOVO_TEMP_MASTER_PASSWORD|verifyMasterPassword/);
    // В браузере пароль всегда идёт в callable; одна лишь sessionStorage не
    // даёт права редактировать и не заменяет Firebase Auth custom token.
    const flags = {};
    let opened = 0, signedOut = 0;
    const clientSandbox = {
        document: { addEventListener: () => {}, getElementById: id => id === 'adm-master-pass' ? { value: expectedPassword } : null },
        localStorage: { getItem: () => null, removeItem: () => {} },
        sessionStorage: {
            getItem: key => flags[key] || null,
            setItem: (key, val) => { flags[key] = val; },
            removeItem: key => { delete flags[key]; }
        },
        currentUser: null, currentUserData: null, currentLang: 'ru',
        toast: () => {}, console,
        firebase: {
            auth: { Auth: { Persistence: { SESSION: 'SESSION' } } },
            functions: () => ({ httpsCallable: name => {
                assert.strictEqual(name, 'tournamentMasterSignIn');
                return data => {
                    assert.strictEqual(data.password, expectedPassword);
                    return Promise.resolve({ data: { token: 'signed-token' } });
                };
            } })
        },
        auth: {
            setPersistence: mode => { assert.strictEqual(mode, 'SESSION'); return Promise.resolve(); },
            signInWithCustomToken: token => {
                assert.strictEqual(token, 'signed-token');
                clientSandbox.currentUser = { uid: 'tournament-master' };
                return Promise.resolve();
            },
            signOut: () => { signedOut++; clientSandbox.currentUser = null; return Promise.resolve(); }
        }
    };
    clientSandbox.window = clientSandbox;
    vm.runInNewContext(client, clientSandbox);
    clientSandbox.openAdminPanel = () => { opened++; };
    clientSandbox.adminLogin({ preventDefault: () => {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(opened, 1);
    assert.strictEqual(clientSandbox.isTournamentMaster(), true);
    clientSandbox.adminLogout();
    assert.strictEqual(signedOut, 1);
    assert.strictEqual(clientSandbox.hasAdminPanelAccess(), false);
    console.log('Tournament master authentication tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
