#!/usr/bin/env node
/**
 * Кнопки удаления данных в админке (js/admin-groups.js).
 *
 *   node tools/test-admin-wipe.js
 *
 * Регрессия на баг «нажимаю удалить все данные — игроки не удаляются»:
 * правила БД (database.rules.json) не разрешают запись в сами ветки
 * (users/rounds/…), только в дочерние узлы. Прежний код делал один
 * атомарный мульти-path update по веткам — сервер отклонял весь запрос, и
 * не удалялось НИЧЕГО. Проверяем, что теперь:
 *   1) при запрете записи в ветку удаляются все её дети (users/<uid>,
 *      usersPublic/<uid>, …) и игроки действительно исчезают из базы;
 *   2) публичная витрина usersPublic тоже очищается (иначе игроки остаются
 *      на страницах «Игроки», лидербордах и в автоподборе);
 *   3) если не удалось ничего — это честно сказано в тосте, а не «удалено»;
 *   4) серверная функция wipeAllData имеет приоритет (правила БД ей не мешают);
 *   5) без серверной сессии (локальный вход по 55555) очистка не врёт об успехе;
 *   6) «Удалить все раунды» чистит раунды и историю игроков;
 *   7) собственный аккаунт администратора сохраняется (иначе админ потеряет
 *      доступ к панели).
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var ADMIN_GROUPS = fs.readFileSync(path.join(ROOT, 'js/admin-groups.js'), 'utf8');

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

/**
 * Фейковая RTDB с «правилами»: какие ветки запрещено писать целиком
 * (denyBranch) и под какими путями запрещены записи вообще (denyAll, как
 * users для мастер-сессии: «auth.uid != 'tournament-master'»).
 */
function makeFakeDb(opts) {
    opts = opts || {};
    var denyBranch = opts.denyBranch || [];
    var denyAll = opts.denyAll || [];
    var log = { branchDeletes: [], childDeletes: [], sets: [] };
    function prohibited(pathStr) {
        return denyAll.some(function(p) {
            return pathStr === p || pathStr.indexOf(p + '/') === 0;
        });
    }
    function ref(pathStr) {
        var p = pathStr || '';
        var api = {
            once: function() { return Promise.resolve({ val: function() { return clone(getPath(store, p)); } }); },
            set: function(v) {
                if (prohibited(p)) return Promise.reject(new Error('PERMISSION_DENIED'));
                log.sets.push(p);
                setPath(store, p, typeof v === 'object' && v ? clone(v) : v);
                return Promise.resolve();
            },
            update: function(obj) {
                var keys = Object.keys(obj || {});
                // Мульти-path update атомарен: если хотя бы один путь запрещён —
                // отклоняется весь запрос (так ведёт себя Firebase).
                var denied = keys.some(function(k) { return prohibited(k); });
                if (denied) return Promise.reject(new Error('PERMISSION_DENIED'));
                keys.forEach(function(k) {
                    log.childDeletes.push(k);
                    setPath(store, k, obj[k] === null ? null : clone(obj[k]));
                });
                return Promise.resolve();
            },
            remove: function() {
                if (prohibited(p) || denyBranch.indexOf(p) !== -1) return Promise.reject(new Error('PERMISSION_DENIED'));
                log.branchDeletes.push(p);
                setPath(store, p, null);
                return Promise.resolve();
            },
            on: function() {}, off: function() {}
        };
        return api;
    }
    var store = clone(opts.store || {});
    return { ref: ref, _store: store, _log: log };
}

function runWipe(opts) {
    var db = Object.prototype.hasOwnProperty.call(opts, 'db') ? opts.db : makeFakeDb();
    var toasts = [];
    var sandbox = {
        console: console, Date: Date, Math: Math, JSON: JSON, Promise: Promise,
        setTimeout: function() { return 0; }, clearTimeout: function() {},
        parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, isFinite: isFinite,
        String: String, Number: Number, Array: Array, Object: Object, Boolean: Boolean,
        RegExp: RegExp, Error: Error,
        localStorage: (function() {
            var m = {};
            return {
                getItem: function(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
                setItem: function(k, v) { m[k] = String(v); },
                removeItem: function(k) { delete m[k]; },
                key: function(i) { return Object.keys(m)[i] || null; },
                get length() { return Object.keys(m).length; }
            };
        })(),
        sessionStorage: (function() {
            var m = {};
            return {
                getItem: function(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
                setItem: function(k, v) { m[k] = String(v); },
                removeItem: function(k) { delete m[k]; },
                key: function(i) { return Object.keys(m)[i] || null; },
                get length() { return Object.keys(m).length; }
            };
        })(),
        document: { getElementById: function() { return null; }, querySelector: function() { return null; }, addEventListener: function() {} },
        location: { reload: function() { sandbox._reloaded = true; } },
        currentLang: opts.lang || 'ru',
        currentUser: opts.currentUser !== undefined ? opts.currentUser : { uid: 'admin1' },
        currentUserData: opts.currentUserData !== undefined ? opts.currentUserData : { role: 'admin' },
        auth: opts.auth !== undefined ? opts.auth : { currentUser: { uid: 'admin1' } },
        db: db,
        toast: function(msg, type) { toasts.push({ msg: msg, type: type }); },
        confirm: function() { return opts.confirmResult !== false; },
        prompt: function() { return opts.promptValue === undefined ? 'УДАЛИТЬ' : opts.promptValue; },
        safeStorageGet: function() { return null; },
        safeStorageRemove: function() {},
        wipeLocalPlayerCaches: function() { sandbox._wipedCaches = (sandbox._wipedCaches || 0) + 1; },
        pestovoWipeLocalSessions: function() {},
        syncKnownPlayersCache: function() {},
        vib: function() {},
        bindRealtimeValue: function() {},
        setInterval: function() { return 0; },
        clearInterval: function() {}
    };
    if (opts.firebase) sandbox.firebase = opts.firebase;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(ADMIN_GROUPS, sandbox, { filename: 'js/admin-groups.js' });
    return { sandbox: sandbox, db: db, toasts: toasts };
}

function lastToast(toasts) { return toasts[toasts.length - 1] || { msg: '', type: '' }; }

/* ==========================================================
   1. Админ-сессия, правила запрещают запись в ветки целиком
      (реальная ситуация: .write есть только у users/$uid, rounds/$rid…)
   ========================================================== */
(async function main() {
    var baseStore = {
        users: {
            admin1: { name: 'Админ Клуб', role: 'admin', roundsPlayed: 12 },
            u1: { name: 'Иванов Иван', roundsPlayed: 3 },
            u2: { name: 'Петров Пётр', roundsPlayed: 5 }
        },
        usersPublic: {
            admin1: { name: 'Админ Клуб' },
            u1: { name: 'Иванов Иван' },
            u2: { name: 'Петров Пётр' }
        },
        rounds: { r1: { createdBy: 'u1', players: { u1: {} } }, r2: { createdBy: 'u2' } },
        tournaments: { t1: { name: 'Кубок', registeredPlayers: { u1: true } } },
        markers: { r1: { u1: { 1: 4 } } },
        markerAssignments: { r1: { u1: 'u2' } },
        alerts: { a1: { roundId: 'r1' } },
        protocols: { p1: { rounds: {} } },
        broadcasts: { b1: { title: 'Анонс' } },
        reactions: { r1: { u1: '🔥' } },
        settings: { design_preset: 'classic' }
    };
    var denyBranch = ['users', 'usersPublic', 'rounds', 'tournaments', 'protocols', 'broadcasts'];
    var ctx = runWipe({ db: makeFakeDb({ store: baseStore, denyBranch: denyBranch }) });
    await ctx.sandbox.clearAllData();

    var store = ctx.db._store;
    eq(Object.keys(store.users || {}), ['admin1'], '1) игроки удалены, аккаунт администратора сохранён');
    eq(Object.keys(store.usersPublic || {}), [], '1) публичная витрина usersPublic очищена');
    eq(Object.keys(store.rounds || {}).length, 0, '1) раунды удалены (по узлам)');
    eq(Object.keys(store.tournaments || {}).length, 0, '1) турниры удалены (по узлам)');
    eq(Object.keys(store.protocols || {}).length, 0, '1) протоколы удалены (по узлам)');
    eq(Object.keys(store.broadcasts || {}).length, 0, '1) анонсы удалены (по узлам)');
    ok(lastToast(ctx.toasts).msg.indexOf('полностью удалены') !== -1, '1) тост сообщает об успешной очистке');
    ok(lastToast(ctx.toasts).msg.indexOf('сохранён') !== -1, '1) тост объясняет, что аккаунт админа сохранён');
    ok(ctx.sandbox._wipedCaches === 1, '1) локальный кэш игроков очищен');

    /* ==========================================================
       2. Мастер-сессия, но прав нет даже на удаление детей users
          (кнопка не должна врать «всё удалено»)
       ========================================================== */
    ctx = runWipe({
        db: makeFakeDb({ store: clone(baseStore), denyBranch: ['users', 'usersPublic'], denyAll: ['users'] }),
        currentUser: { uid: 'tournament-master' },
        currentUserData: null,
        auth: { currentUser: { uid: 'tournament-master' } }
    });
    await ctx.sandbox.clearAllData();
    store = ctx.db._store;
    eq(Object.keys(store.users).length, 3, '2) игроки остались (сервер запретил удаление)');
    ok(lastToast(ctx.toasts).type === 'error', '2) тост об ошибке, а не об успехе');
    ok(lastToast(ctx.toasts).msg.indexOf('Удалено частично') !== -1, '2) тост говорит «удалено частично»');
    ok(lastToast(ctx.toasts).msg.indexOf('игроки') !== -1, '2) тост называет ветку, которую не удалось очистить');

    /* ==========================================================
       3. Нет серверной сессии (локальный вход по 55555): очистка не врёт
       ========================================================== */
    ctx = runWipe({
        db: makeFakeDb({ store: clone(baseStore) }),
        auth: { currentUser: null },
        currentUser: null,
        currentUserData: null
    });
    await ctx.sandbox.clearAllData();
    eq(Object.keys(ctx.db._store.users).length, 3, '3) без серверной сессии база не тронута');
    ok(lastToast(ctx.toasts).msg.indexOf('Нет серверной сессии') !== -1, '3) понятная ошибка про сессию');

    /* ==========================================================
       4. Серверная функция wipeAllData (Admin SDK) — правила не мешают
       ========================================================== */
    var called = null;
    ctx = runWipe({
        db: makeFakeDb({ store: clone(baseStore), denyBranch: ['users', 'rounds'], denyAll: ['users'] }),
        firebase: { functions: function() { return { httpsCallable: function(name) {
            return function(data) { called = { name: name, data: data }; return Promise.resolve({ data: { ok: true } }); };
        } }; } }
    });
    await ctx.sandbox.clearAllData();
    eq(called, { name: 'wipeAllData', data: { scope: 'all' } }, '4) админка вызывает серверную wipeAllData');
    ok(lastToast(ctx.toasts).msg.indexOf('полностью удалены') !== -1, '4) успех серверной очистки');

    /* ==========================================================
       5. Новые правила: ветку можно удалить целиком (без перебора детей)
       ========================================================== */
    // Мастер-сессия (своего профиля в users нет — сохранять нечего).
    ctx = runWipe({
        db: makeFakeDb({ store: clone(baseStore) }),
        currentUser: { uid: 'tournament-master' },
        currentUserData: null,
        auth: { currentUser: { uid: 'tournament-master' } }
    });
    await ctx.sandbox.clearAllData();
    store = ctx.db._store;
    eq(store.users || null, null, '5) ветка users удалена одним запросом');
    eq(store.rounds || null, null, '5) ветка rounds удалена одним запросом');
    eq(store.usersPublic || null, null, '5) ветка usersPublic удалена одним запросом');
    ok(ctx.db._log.childDeletes.length === 0, '5) перебор детей не понадобился');

    /* ==========================================================
       6. «Удалить все раунды»: раунды + история игроков
       ========================================================== */
    ctx = runWipe({ db: makeFakeDb({ store: clone(baseStore), denyBranch: ['rounds', 'markers'] }) });
    await ctx.sandbox.clearRounds();
    store = ctx.db._store;
    eq(Object.keys(store.rounds || {}).length, 0, '6) раунды удалены');
    eq(Object.keys(store.protocols || {}).length, 0, '6) протоколы удалены');
    eq(store.users.u1.history || null, null, '6) история игрока очищена');
    eq(store.users.u1.roundsPlayed, 0, '6) счётчик раундов игрока обнулён');
    ok(lastToast(ctx.toasts).msg.indexOf('Все раунды') !== -1, '6) тост об удалении раундов');

    /* ==========================================================
       7. offline-режим (нет db) — чистим только локальные кэши
       ========================================================== */
    ctx = runWipe({ db: undefined, currentLang: 'ru' });
    await ctx.sandbox.clearAllData();
    ok(ctx.sandbox._wipedCaches === 1, '7) оффлайн: локальный кэш игроков очищен');
    eq(lastToast(ctx.toasts).msg, 'Все данные удалены (локальные кэши)', '7) оффлайн: честный тост');

    console.log('');
    if (failures) { console.error('Провалено проверок:', failures, 'из', checks); process.exit(1); }
    console.log('✓ Тесты удаления данных пройдены:', checks);
})().catch(function(err) {
    console.error('Исключение в тесте:', err && err.stack || err);
    process.exit(1);
});
