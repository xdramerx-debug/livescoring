#!/usr/bin/env node
/**
 * Серверная очистка данных: Cloud Function wipeAllData (functions/index.js).
 *
 *   node tools/test-functions-wipe.js
 *
 * Функция вызывается кнопками «Удалить всех игроков и раунды» / «Удалить все
 * данные» и работает через Admin SDK — правила RTDB (которые запрещают
 * клиентам удалять ветки целиком) ей не мешают. Проверяем:
 *   1) без авторизации — unauthenticated;
 *   2) обычный игрок — permission-denied (чужую базу не очистит);
 *   3) мастер-пароль (claim tournamentMaster) — очистка всех данных;
 *   4) просроченный мастер-claim — отказ;
 *   5) администратор клуба — очистка, но его собственный профиль сохраняется;
 *   6) scope: 'rounds' — только раунды, история игроков обнуляется, игроки целы.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var createChildPager = require('../functions/paging').createChildPager;

var ROOT = path.join(__dirname, '..');
var source = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
var BEGIN = '// ── Удаление данных клуба';
var END = '// ── Валидация входных данных';
var start = source.indexOf(BEGIN);
var stop = source.indexOf(END);
if (start === -1 || stop === -1 || stop < start) {
    console.error('Не найдены маркеры функции wipeAllData в functions/index.js');
    process.exit(1);
}
var wipeCode = source.slice(start, stop);

var failures = 0;
var checks = 0;
function ok(cond, label) {
    checks++;
    if (!cond) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function eq(actual, expected, label) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    checks++;
    if (a !== e) {
        failures++;
        console.error('FAIL', label, '\n  actual:  ', a, '\n  expected:', e);
    } else console.log('ok  -', label);
}

function clone(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
function getPath(store, p) {
    if (!p) return store;
    var parts = String(p).split('/');
    var cur = store;
    for (var i = 0; i < parts.length; i++) {
        if (!cur || typeof cur !== 'object') return null;
        cur = cur[parts[i]];
    }
    return cur === undefined ? null : cur;
}
function setPath(store, p, value) {
    var parts = String(p).split('/');
    var cur = store;
    for (var i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
    }
    if (value === null) delete cur[parts[parts.length - 1]];
    else cur[parts[parts.length - 1]] = value;
}

function makeDb(store) {
    var log = { updates: [] };
    return {
        _store: store,
        _log: log,
        ref: function(p) {
            var key = p || '';
            // orderByKey().startAfter().limitToFirst().get() — на этом работает
            // постраничный обход functions/paging.js.
            function query() {
                var state = { after: null, limit: Infinity };
                var q = {
                    orderByKey: function() { return q; },
                    startAfter: function(v) { state.after = v; return q; },
                    limitToFirst: function(n) { state.limit = n; return q; },
                    get: function() {
                        var value = getPath(store, key) || {};
                        var keys = Object.keys(value)
                            .filter(function(k) { return state.after === null || k > state.after; })
                            .sort()
                            .slice(0, state.limit);
                        var out = {};
                        keys.forEach(function(k) { out[k] = clone(value[k]); });
                        return Promise.resolve({ val: function() { return out; } });
                    }
                };
                return q;
            }
            return {
                get: function() { return Promise.resolve({ val: function() { return clone(getPath(store, key)); } }); },
                orderByKey: query,
                update: function(obj) {
                    log.updates.push(Object.keys(obj));
                    Object.keys(obj).forEach(function(k) { setPath(store, k, obj[k] === null ? null : clone(obj[k])); });
                    return Promise.resolve();
                }
            };
        }
    };
}

function runWipe(data, context, store) {
    var db = makeDb(clone(store));
    var exportsObj = {};
    class HttpsError extends Error {
        constructor(code, message) { super(message); this.code = code; }
    }
    var sandbox = {
        console: console, Date: Date, Object: Object, JSON: JSON, Promise: Promise,
        Array: Array, String: String, Error: Error, Number: Number, Boolean: Boolean,
        MASTER_UID: 'tournament-master',
        exports: exportsObj,
        db: db,
        // Инжектим настоящий постраничный обход поверх той же заглушки db —
        // так тест гоняет сам functions/paging.js, а не его копию.
        forEachChildPage: createChildPager(db),
        functions: {
            runWith: function() { return { https: { onCall: function(cb) { return cb; } } }; },
            https: { HttpsError: HttpsError },
            logger: { warn: function() {}, error: function() {} }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(wipeCode, sandbox, { filename: 'functions/wipe.js' });
    return sandbox.exports.wipeAllData(data, context).then(function(res) {
        return { res: res, db: db };
    }, function(err) {
        return { err: err, db: db };
    });
}

var STORE = {
    users: {
        admin1: { name: 'Админ Клуб', role: 'admin' },
        u1: { name: 'Иванов Иван', roundsPlayed: 4, history: { h1: { roundId: 'r1' } } },
        u2: { name: 'Петров Пётр' }
    },
    usersPublic: { admin1: { name: 'Админ Клуб' }, u1: { name: 'Иванов Иван' } },
    rounds: { r1: { createdBy: 'u1' }, r2: { createdBy: 'u2' } },
    tournaments: { t1: { name: 'Кубок' } },
    markers: { r1: { u1: {} } },
    markerAssignments: { r1: { u1: 'u2' } },
    alerts: { a1: { roundId: 'r1' } },
    protocols: { p1: { rounds: {} } },
    broadcasts: { b1: { title: 'Анонс' } },
    reactions: { r1: { u1: '🔥' } },
    settings: { design_preset: 'classic' },
    // Ветки, которые прежний список очистки не трогал (находка 3).
    scoreAudit: { '2026-10-01': { e1: { id: 'e1', roundId: 'r1', playerName: 'Иванов Иван' } } },
    hcpLog: { l1: { playerName: 'Иванов Иван', newHcp: 12 } },
    leaderboard: { lb1: { name: 'Иванов Иван' } },
    push_subscriptions: { s1: { endpoint: 'https://push.example', uid: 'u1' } },
    errorReports: { er1: { msg: 'boom', uid: 'u1' } },
    tnDrafts: { u1: { name: 'Черновик' } },
    tnTemplates: { t1: { name: 'Шаблон' } },
    channels: { telegram: { groupToken: 'SECRET' } },
    vapid: { privateKey: 'SECRET' }
};

(async function main() {
    // 1. Без авторизации
    var r = await runWipe({ scope: 'all' }, {}, STORE);
    ok(r.err && r.err.code === 'unauthenticated', '1) без авторизации — unauthenticated');
    eq(Object.keys(r.db._store.users).length, 3, '1) база не тронута');

    // 2. Обычный игрок
    r = await runWipe({ scope: 'all' }, { auth: { uid: 'u1', token: {} } }, STORE);
    ok(r.err && r.err.code === 'permission-denied', '2) обычный игрок — permission-denied');
    eq(Object.keys(r.db._store.users).length, 3, '2) база не тронута');

    // 3. Мастер-пароль (действующий claim)
    r = await runWipe({ scope: 'all' }, {
        auth: { uid: 'tournament-master', token: { tournamentMaster: true, tournamentMasterUntil: Date.now() + 3600000 } }
    }, STORE);
    ok(r.res && r.res.ok === true, '3) мастер: ok');
    eq(Object.keys(r.db._store.users || {}).length, 0, '3) мастер: все игроки удалены');
    eq(Object.keys(r.db._store.usersPublic || {}).length, 0, '3) мастер: публичная витрина очищена');
    eq(Object.keys(r.db._store.rounds || {}).length, 0, '3) мастер: раунды удалены');
    eq(Object.keys(r.db._store.tournaments || {}).length, 0, '3) мастер: турниры удалены');
    ok(r.db._store.settings && r.db._store.settings.design_preset === 'classic', '3) настройки клуба сохранены');
    ok(r.res.keptSelf === false, '3) мастер: keptSelf=false');
    // Ветки с персональными данными, которые прежний список очистки пропускал
    // (docs/CODE-AUDIT-2026-10-2.md, находка 3): аудит счёта с именами игроков,
    // журнал гандикапов, push-подписки, отчёты об ошибках, черновики и шаблоны.
    ['scoreAudit', 'hcpLog', 'leaderboard', 'push_subscriptions', 'errorReports',
     'tnDrafts', 'tnTemplates'].forEach(function(branch) {
        eq(Object.keys(r.db._store[branch] || {}).length, 0, '3) мастер: ' + branch + ' очищен');
    });
    // Конфигурация и секреты интеграций не являются «данными клуба»: их потеря
    // означала бы, что после очистки клуб остаётся без оформления и без бота.
    ok(r.db._store.channels && r.db._store.channels.telegram.groupToken === 'SECRET', '3) мастер: channels сохранены');
    ok(r.db._store.vapid && r.db._store.vapid.privateKey === 'SECRET', '3) мастер: vapid сохранены');

    // 4. Просроченный мастер-claim
    r = await runWipe({ scope: 'all' }, {
        auth: { uid: 'tournament-master', token: { tournamentMaster: true, tournamentMasterUntil: Date.now() - 1000 } }
    }, STORE);
    ok(r.err && r.err.code === 'permission-denied', '4) просроченный claim — permission-denied');
    eq(Object.keys(r.db._store.users).length, 3, '4) база не тронута');

    // 5. Администратор клуба — свой профиль сохраняется
    r = await runWipe({ scope: 'all' }, { auth: { uid: 'admin1', token: {} } }, STORE);
    ok(r.res && r.res.ok === true, '5) админ: ok');
    eq(Object.keys(r.db._store.users || {}), ['admin1'], '5) админ: чужие профили удалены, свой сохранён');
    eq(Object.keys(r.db._store.usersPublic || {}), ['admin1'], '5) админ: своё публичное зеркало сохранено');
    ok(r.res.keptSelf === true, '5) админ: keptSelf=true');
    eq(Object.keys(r.db._store.rounds || {}).length, 0, '5) админ: раунды удалены');

    // 6. Только раунды (кнопка «Удалить все раунды»)
    r = await runWipe({ scope: 'rounds' }, { auth: { uid: 'admin1', token: {} } }, STORE);
    ok(r.res && r.res.scope === 'rounds', '6) scope=rounds');
    eq(Object.keys(r.db._store.rounds || {}).length, 0, '6) раунды удалены');
    eq(Object.keys(r.db._store.users).length, 3, '6) игроки не тронуты');
    eq(r.db._store.users.u1.roundsPlayed, 0, '6) счётчик раундов обнулён');
    eq(r.db._store.users.u1.history || null, null, '6) история игрока удалена');
    eq(Object.keys(r.db._store.protocols || {}).length, 0, '6) протоколы удалены');
    // Аудит счёта удалённых раундов — те же персональные данные: он не должен
    // переживать раунды ещё 30 дней. Турнирный аудит при этом остаётся.
    eq(getPath(r.db._store, 'scoreAudit/2026-10-01/e1'), null, '6) аудит удалённых раундов вычищен');
    eq(Object.keys(r.db._store.tournaments || {}).length, 1, '6) турниры не тронуты');
    eq(Object.keys(r.db._store.hcpLog || {}).length, 1, '6) журнал гандикапов не тронут');

    // 7. Клиентский фолбэк очистки обязан знать те же ветки, что и сервер:
    //    расходимость списков — это «Все данные удалены» при живых игроках.
    var serverList = (wipeCode.match(/WIPE_ALL_BRANCHES = \[([^\]]+)\]/) || [])[1] || '';
    var clientSource = fs.readFileSync(path.join(ROOT, 'js/admin-groups.js'), 'utf8');
    var clientList = (clientSource.match(/WIPE_ALL_DB_BRANCHES = \[([^\]]+)\]/) || [])[1] || '';
    var parseList = function(text) {
        return (text.match(/'([^']+)'/g) || []).map(function(x) { return x.slice(1, -1); }).sort();
    };
    eq(parseList(clientList), parseList(serverList), '7) списки веток клиента и сервера совпадают');
    ok(parseList(serverList).length >= 17, '7) список очистки покрывает все ветки с данными');
    ['settings', 'vapid', 'channels'].forEach(function(branch) {
        ok(parseList(serverList).indexOf(branch) === -1, '7) ' + branch + ' намеренно не удаляется');
    });

    console.log('');
    if (failures) { console.error('Провалено проверок:', failures, 'из', checks); process.exit(1); }
    console.log('✓ Тесты серверной очистки пройдены:', checks);
})().catch(function(err) {
    console.error('Исключение в тесте:', err && err.stack || err);
    process.exit(1);
});
