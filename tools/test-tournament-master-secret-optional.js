// Секрет TOURNAMENT_MASTER_PASSWORD_HASH строго опционален: функция обязана
// деплоиться и работать без него (мастер-пароль по умолчанию 55555). Жёсткая
// привязка runWith({secrets}) без созданного секрета роняет функцию на старте,
// и браузер видит «Ошибка входа: internal» вместо формы входа.
// После фикса от 2026-09-23 секрет читается ТОЛЬКО из env (если привязан),
// без сложного REST-фетча Secret Manager, который давал internal.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const login = source.slice(source.indexOf('// Мастер-пароль проверяется'), source.indexOf('// ── Валидация входных данных'));

// 1) Объявление функции не должно жёстко привязывать секреты к рантайму.
const decl = source.match(/exports\.tournamentMasterSignIn = functions\.runWith\(([\s\S]*?)\)\.https\.onCall/);
assert.ok(decl, 'tournamentMasterSignIn объявлен через runWith(...).https.onCall');
assert.ok(!/secrets\s*:/.test(decl[1]), 'runWith не должен требовать привязанный секрет (' + decl[1] + ')');
assert.ok(!/secrets\s*:/.test(source), 'functions/index.js не должен жёстко привязывать secrets');

// Рантайм Cloud Functions обязан быть поддерживаемым: nodejs18 снят с
// поддержки (decommission 2025-10-30), деплой с ним невозможен — callable
// остаётся недоступным («Ошибка входа: internal»).
const fnPkg = JSON.parse(fs.readFileSync(path.join(root, 'functions/package.json'), 'utf8'));
assert.ok(fnPkg.engines && Number(fnPkg.engines.node) >= 20,
    'functions/package.json: нужен Node >= 20 (nodejs18 декомиссирован), сейчас ' + JSON.stringify(fnPkg.engines));

const defaultPassword = '55555';
const secretPassword = 'another-long-master-password';
const defaultHash = crypto.createHash('sha256').update(defaultPassword).digest('hex');
assert.ok(login.indexOf(defaultHash) !== -1, 'DEFAULT_MASTER_PASSWORD_HASH — это SHA-256 от 55555');

class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

function makeSandbox(env) {
    let counter = null;
    const sandbox = {
        require: name => { assert.strictEqual(name, 'crypto'); return crypto; },
        process: { env: env }, Buffer, Date,
        exports: {},
        functions: {
            runWith: opts => ({ https: { onCall: callback => callback } }),
            https: { HttpsError },
            logger: { warn: () => {}, error: () => {} }
        },
        admin: { auth: () => ({ createCustomToken: () => Promise.resolve('signed-token') }) },
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
    return { signIn: sandbox.exports.tournamentMasterSignIn, request: { rawRequest: { ip: '192.0.2.1' } } };
}

(async function () {
    // 2) Без секрета действует 55555.
    const offline = makeSandbox({});
    const result = await offline.signIn({ password: defaultPassword }, offline.request);
    assert.strictEqual(result.token, 'signed-token');
    await assert.rejects(offline.signIn({ password: secretPassword }, offline.request), e => e.code === 'permission-denied');

    // 3) Секрет из env имеет приоритет: 55555 перестаёт приниматься.
    const secretHash = crypto.createHash('sha256').update(secretPassword).digest('hex');
    const withSecret = makeSandbox({ TOURNAMENT_MASTER_PASSWORD_HASH: secretHash });
    const secretResult = await withSecret.signIn({ password: secretPassword }, withSecret.request);
    assert.strictEqual(secretResult.token, 'signed-token');
    await assert.rejects(withSecret.signIn({ password: defaultPassword }, withSecret.request), e => e.code === 'permission-denied');

    // 4) Мусор в секрете — отказ (fail-closed), а не тихий откат к 55555.
    const badSecret = makeSandbox({ TOURNAMENT_MASTER_PASSWORD_HASH: 'not-a-sha256-hash' });
    await assert.rejects(badSecret.signIn({ password: defaultPassword }, badSecret.request), e => e.code === 'failed-precondition');

    // 5) Явно привязанный env-секрет работает и обходится без сети.
    const viaEnv = makeSandbox({ TOURNAMENT_MASTER_PASSWORD_HASH: defaultHash });
    const envResult = await viaEnv.signIn({ password: defaultPassword }, viaEnv.request);
    assert.strictEqual(envResult.token, 'signed-token');

    // 6) Функция не должна содержать fetch к metadata.google.internal / secretmanager
    // — это источник internal ошибок, теперь читаем только env.
    assert.ok(!/metadata\.google\.internal/.test(source), 'не должно быть fetch к metadata.google.internal');
    assert.ok(!/secretmanager\.googleapis\.com/.test(source), 'не должно быть fetch к secretmanager.googleapis.com');

    console.log('Tournament master secret optionality tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
