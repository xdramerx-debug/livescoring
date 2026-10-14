// Мастер-пароль — FAIL CLOSED (аудит 2026-10, docs/IMPROVEMENTS-2026-10.md п.1).
//
// Секрет TOURNAMENT_MASTER_PASSWORD_HASH по-прежнему не привязан жёстко через
// runWith({secrets}): такая привязка требует обязательного секрета в Secret
// Manager, и без него функция не стартует, а браузер видит «Ошибка входа:
// internal» вместо внятной причины. Деплой без секрета обязан проходить.
//
// Но работать без секрета функция больше НЕ должна: раньше при отсутствующем
// секрете действовал зашитый sha256("55555") — пароль из 5 цифр из публичного
// репозитория, открывавший uid `tournament-master`, который пишет в
// rounds/tournaments/protocols и вызывает wipeAllData (полное удаление данных
// клуба). Теперь без секрета вход отказывает с failed-precondition.
// Единственное исключение — Firebase Emulator (FUNCTIONS_EMULATOR=true), чтобы
// локальная разработка не требовала Secret Manager.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const login = source.slice(source.indexOf('// Мастер-пароль проверяется'), source.indexOf('// ── Валидация входных данных'));
assert.ok(login.length > 500, 'фрагмент tournamentMasterSignIn найден в functions/index.js');

// 1) Объявление функции не должно жёстко привязывать секреты к рантайму.
const decl = source.match(/exports\.tournamentMasterSignIn = functions\.runWith\(([\s\S]*?)\)\.https\.onCall/);
assert.ok(decl, 'tournamentMasterSignIn объявлен через runWith(...).https.onCall');
assert.ok(!/secrets\s*:/.test(decl[1]), 'runWith не должен требовать привязанный секрет (' + decl[1] + ')');
// Проверяем именно объявления runWith(...), а не весь файл: упоминание команды
// `firebase functions:secrets:set` в тексте лога/комментария содержит «secrets:»
// и на жёсткую привязку секрета не влияет.
const runWiths = [...source.matchAll(/runWith\(([\s\S]*?)\)\.https/g)].map(m => m[1]);
assert.ok(runWiths.length > 0, 'в functions/index.js есть объявления runWith(...).https');
runWiths.forEach(function (cfg, i) {
    assert.ok(!/secrets\s*:/.test(cfg), 'runWith #' + i + ' не привязывает secrets жёстко (' + cfg + ')');
});

// Рантайм Cloud Functions обязан быть поддерживаемым: nodejs18 снят с
// поддержки (decommission 2025-10-30), деплой с ним невозможен — callable
// остаётся недоступным («Ошибка входа: internal»).
const fnPkg = JSON.parse(fs.readFileSync(path.join(root, 'functions/package.json'), 'utf8'));
assert.ok(fnPkg.engines && Number(fnPkg.engines.node) >= 20,
    'functions/package.json: нужен Node >= 20 (nodejs18 декомиссирован), сейчас ' + JSON.stringify(fnPkg.engines));

const defaultPassword = '55555';
const secretPassword = 'another-long-master-password';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const defaultHash = sha256(defaultPassword);
const secretHash = sha256(secretPassword);
assert.ok(login.indexOf(defaultHash) !== -1, 'DEFAULT_MASTER_PASSWORD_HASH — это SHA-256 от 55555 (нужен эмулятору)');

class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

function makeSandbox(env, opts) {
    const o = opts || {};
    let counter = null;
    const warnings = [];
    const errors = [];
    const sandbox = {
        require: name => { assert.strictEqual(name, 'crypto'); return crypto; },
        process: { env: env }, Buffer, Date,
        exports: {},
        functions: {
            runWith: () => ({ https: { onCall: callback => callback } }),
            https: { HttpsError },
            logger: { warn: (m) => warnings.push(String(m)), error: (m) => errors.push(String(m)) }
        },
        admin: { auth: () => ({ createCustomToken: () => Promise.resolve('signed-token') }) },
        db: { ref: (p) => ({
            path: p,
            transaction: async function (fn) {
                if (o.transactionFailure) throw o.transactionFailure;
                const value = fn(counter);
                if (!value) return { committed: false };
                counter = value;
                return { committed: true };
            },
            remove: async () => { counter = null; }
        }) }
    };
    vm.runInNewContext(login, sandbox);
    return {
        signIn: sandbox.exports.tournamentMasterSignIn,
        warnings: warnings,
        errors: errors,
        request: o.request || { rawRequest: { ip: '192.0.2.1' } }
    };
}

const EMULATOR = { FUNCTIONS_EMULATOR: 'true' };

(async function () {
    // 2) Fail closed: без секрета на проде вход отказывает, токен не выдаётся.
    const prod = makeSandbox({});
    await assert.rejects(prod.signIn({ password: defaultPassword }, prod.request),
        e => e.code === 'failed-precondition',
        'без секрета мастер-вход обязан отказать с failed-precondition');
    await assert.rejects(prod.signIn({ password: secretPassword }, prod.request),
        e => e.code === 'failed-precondition');
    assert.ok(prod.errors.some(m => /TOURNAMENT_MASTER_PASSWORD_HASH/.test(m) && /not set/.test(m)),
        'отказ без секрета пишется в лог с именем секрета и командой установки');

    // 3) Эмулятор: дефолтный пароль работает, чтобы локальная разработка и
    //    тесты не требовали Secret Manager.
    const emu = makeSandbox(EMULATOR);
    const emuResult = await emu.signIn({ password: defaultPassword }, emu.request);
    assert.strictEqual(emuResult.token, 'signed-token');
    await assert.rejects(emu.signIn({ password: secretPassword }, emu.request), e => e.code === 'permission-denied');
    assert.ok(emu.warnings.some(m => /emulator only/.test(m)),
        'работа на дефолтном пароле в эмуляторе логируется как предупреждение');

    // 4) Секрет имеет приоритет: правильный пароль проходит, 55555 — нет.
    const withSecret = makeSandbox({ TOURNAMENT_MASTER_PASSWORD_HASH: secretHash });
    const secretResult = await withSecret.signIn({ password: secretPassword }, withSecret.request);
    assert.strictEqual(secretResult.token, 'signed-token');
    await assert.rejects(withSecret.signIn({ password: defaultPassword }, withSecret.request),
        e => e.code === 'permission-denied');

    // 5) Мусор в секрете — отказ (fail-closed), а не тихий откат к 55555.
    const badSecret = makeSandbox({ TOURNAMENT_MASTER_PASSWORD_HASH: 'not-a-sha256-hash' });
    await assert.rejects(badSecret.signIn({ password: defaultPassword }, badSecret.request),
        e => e.code === 'failed-precondition');
    await assert.rejects(badSecret.signIn({ password: secretPassword }, badSecret.request),
        e => e.code === 'failed-precondition');

    // 6) Секрет, выставленный в общеизвестный дефолт, эквивалентен отсутствию
    //    пароля — на проде отвергается (в эмуляторе разрешён).
    const defaultAsSecret = makeSandbox({ TOURNAMENT_MASTER_PASSWORD_HASH: defaultHash });
    await assert.rejects(defaultAsSecret.signIn({ password: defaultPassword }, defaultAsSecret.request),
        e => e.code === 'failed-precondition',
        'секрет = sha256("55555") обязан отвергаться на проде');
    assert.ok(defaultAsSecret.errors.some(m => /well-known default/.test(m)),
        'отказ секрету-дефолту объяснён в логе');
    const defaultAsSecretEmu = makeSandbox(Object.assign({ TOURNAMENT_MASTER_PASSWORD_HASH: defaultHash }, EMULATOR));
    assert.strictEqual((await defaultAsSecretEmu.signIn({ password: defaultPassword }, defaultAsSecretEmu.request)).token, 'signed-token');

    // 7) Отказ RTDB-транзакции rate-limit не должен обходить ограничение и
    //    выдавать мастер-токен: вход fail-closed при недоступном счётчике.
    const unavailable = makeSandbox({ TOURNAMENT_MASTER_PASSWORD_HASH: secretHash }, { transactionFailure: new Error('database unavailable') });
    await assert.rejects(
        unavailable.signIn({ password: secretPassword }, unavailable.request),
        e => e.code === 'unavailable'
    );

    // 8) Лимит попыток: 6-й запрос с того же IP отклоняется до проверки пароля.
    const limited = makeSandbox({ TOURNAMENT_MASTER_PASSWORD_HASH: secretHash });
    for (let i = 0; i < 5; i++) {
        await assert.rejects(limited.signIn({ password: 'wrong-password' }, limited.request), e => e.code === 'permission-denied');
    }
    await assert.rejects(limited.signIn({ password: secretPassword }, limited.request),
        e => e.code === 'resource-exhausted',
        'после 5 неудач верный пароль отклоняется как resource-exhausted');

    // 9) Ключ лимита: без rawRequest.ip берётся первый хоп x-forwarded-for,
    //    иначе все клиенты делили бы одно ведро 'unknown' и блокировали друг друга.
    // Заголовок может приходить в любом регистре — проверяем оба варианта.
    for (const header of ['x-forwarded-for', 'X-Forwarded-For']) {
        const headers = {};
        headers[header] = '203.0.113.7, 10.0.0.1';
        const xff = makeSandbox({ TOURNAMENT_MASTER_PASSWORD_HASH: secretHash }, {
            request: { rawRequest: { headers: headers } }
        });
        const r = await xff.signIn({ password: secretPassword }, xff.request);
        assert.strictEqual(r.token, 'signed-token', 'вход по ' + header + ' без rawRequest.ip');
    }

    // 10) Функция не должна содержать fetch к metadata.google.internal /
    //     secretmanager — это источник internal ошибок, читаем только env.
    assert.ok(!/metadata\.google\.internal/.test(source), 'не должно быть fetch к metadata.google.internal');
    assert.ok(!/secretmanager\.googleapis\.com/.test(source), 'не должно быть fetch к secretmanager.googleapis.com');

    console.log('Tournament master secret (fail-closed) tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
