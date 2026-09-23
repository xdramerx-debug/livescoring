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
const defaultPassword = '55555'; // мастер-пароль по умолчанию (functions/index.js)
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
    // Без секрета действует мастер-пароль по умолчанию (55555):
    // секретный пароль перестает работать, дефолтный — принимается.
    config.TOURNAMENT_MASTER_PASSWORD_HASH = '';
    await assert.rejects(signIn({ password: expectedPassword }, request), e => e.code === 'permission-denied');
    const defaultResult = await signIn({ password: defaultPassword }, request);
    assert.strictEqual(defaultResult.token, 'signed-token');
    assert.strictEqual(tokenCalls, 2);
    config.TOURNAMENT_MASTER_PASSWORD_HASH = crypto.createHash('sha256').update(expectedPassword).digest('hex');
    counter = { since: Date.now(), count: 5 };
    await assert.rejects(signIn({ password: expectedPassword }, request), e => e.code === 'resource-exhausted');
    assert.strictEqual(tokenCalls, 2, 'rate limit не чеканит токены');
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

    // Fallback по дефолтному 55555 обязан работать с ЛЮБОГО хоста, а не только
    // с localhost: если функция не задеплоена (functions/internal), админка
    // открывается локально (UI, без серверных прав — реальные права всё равно
    // выдаёт серверный custom claim). Регрессия: раньше на проде показывалось
    // «Дефолтный пароль 55555 работает только локально (localhost)».
    function makeInternalClientSandbox(password) {
        const flags = {};
        let customTokenCalls = 0;
        const sandbox = {
            document: {
                addEventListener: () => {},
                getElementById: id => id === 'adm-master-pass' ? { value: password } : null
            },
            localStorage: { getItem: () => null, removeItem: () => {} },
            sessionStorage: {
                getItem: key => flags[key] || null,
                setItem: (key, val) => { flags[key] = val; },
                removeItem: key => { delete flags[key]; }
            },
            currentUser: null, currentUserData: null, currentLang: 'ru',
            location: { hostname: 'pestovo-golf.ru' }, // не-local (production) host
            toast: () => {}, console,
            firebase: {
                auth: { Auth: { Persistence: { SESSION: 'SESSION' } } },
                functions: () => ({ httpsCallable: name => {
                    assert.strictEqual(name, 'tournamentMasterSignIn');
                    return data => {
                        assert.strictEqual(data.password, password);
                        const err = new Error('internal');
                        err.code = 'functions/internal';
                        return Promise.reject(err);
                    };
                } })
            },
            auth: {
                setPersistence: () => Promise.resolve(),
                signInWithCustomToken: () => { customTokenCalls++; return Promise.resolve(); },
                signOut: () => Promise.resolve()
            }
        };
        sandbox.window = sandbox;
        return { sandbox, flags, getCustomTokenCalls: () => customTokenCalls };
    }

    const fallback = makeInternalClientSandbox(defaultPassword);
    vm.runInNewContext(client, fallback.sandbox);
    fallback.sandbox.adminLogin({ preventDefault: () => {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(fallback.flags['pestovo_is_admin'], 'true', 'internal + 55555: админка открывается и на не-local хосте');
    assert.strictEqual(fallback.flags['pestovo_admin_access_source'], 'master');
    assert.strictEqual(fallback.sandbox.isTournamentMaster(), true);
    assert.strictEqual(fallback.getCustomTokenCalls(), 0, 'fallback не запрашивает Firebase-токен');

    // Любой пароль, отличный от 55555, при internal админку НЕ открывает.
    const deny = makeInternalClientSandbox('another-long-master-password');
    vm.runInNewContext(client, deny.sandbox);
    deny.sandbox.adminLogin({ preventDefault: () => {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(deny.flags['pestovo_is_admin'], undefined, 'internal + пароль не 55555: админка не открывается');
    assert.strictEqual(deny.getCustomTokenCalls(), 0);

    console.log('Tournament master authentication tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
