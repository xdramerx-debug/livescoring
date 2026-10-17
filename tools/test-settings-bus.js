#!/usr/bin/env node
'use strict';
/*
 * Шина настроек: одна подписка на /settings вместо десятка одиночных ключей.
 *
 * Замер 2026-10 (docs/CODE-AUDIT-2026-10-2.md, находка 6): 327 RTDB-подписок
 * на 15 страницах, из них 281 — на отдельные ключи settings/* (23–25 на
 * страницу). После шины: 59 подписок, settings/* — 0, вместо них один Listen
 * на корень ветки на страницу.
 *
 * Регресс, который этот тест ловит: pestovoRefPath вырезала префикс ссылки
 * как «scheme:// + всё до первого слеша», и у тестовых ссылок вида
 * 'stub://settings/design' первым сегментом считался settings — он принимался
 * за хост. Шина молча не включалась: зелёные проверки при неизменном счётчике
 * подписок. Поэтому здесь проверяется и разбор пути, и фактическое число
 * вызовов .on('value').
 *
 * Запуск: node tools/test-settings-bus.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function ok(cond, msg) {
    if (cond) console.log('  ok  - ' + msg);
    else { failed++; console.error('  FAIL - ' + msg); }
}

// ── Песочница со счётчиком реальных подписок ──────────────────────────────
function makeSandbox(refToString) {
    const realOn = [];          // пути, на которые реально повесили .on('value')
    const listeners = {};       // путь → [callback]
    const store = {
        design: { primary: '#123456' },
        tn_gender_split: 'on',
        hidden_pages: { stats: true }
    };
    const tree = { settings: store };
    function snapFor(key) {
        const parts = String(key || '').split('/').filter(Boolean);
        let value = tree;
        for (const p of parts) value = (value && typeof value === 'object') ? value[p] : null;
        if (value === undefined) value = null;
        return {
            key: parts.length ? parts[parts.length - 1] : null,
            val: () => value,
            exists: () => value !== null,
            hasChildren: () => !!value && typeof value === 'object' && Object.keys(value).length > 0,
            numChildren: () => (value && typeof value === 'object') ? Object.keys(value).length : 0,
            forEach: (cb) => {
                if (!value || typeof value !== 'object') return false;
                return Object.keys(value).some((k) => cb(snapFor((key ? key + '/' : '') + k)) === true);
            },
            child: (k) => snapFor((key ? key + '/' : '') + k),
            exportVal: () => value
        };
    }
    function makeRef(key) {
        const ref = {
            key: key,
            ref: () => ref,
            child: (k) => makeRef((key ? key + '/' : '') + k),
            on: (ev, cb) => {
                if (ev === 'value') {
                    realOn.push(key);
                    (listeners[key] = listeners[key] || []).push(cb);
                    cb(snapFor(key));
                }
                return ref;
            },
            off: () => ref,
            once: () => Promise.resolve(snapFor(key)),
            set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(),
            push: () => makeRef(key + '/pushed'),
            orderByChild: () => ref, orderByKey: () => ref, orderByValue: () => ref,
            equalTo: () => ref, limitToFirst: () => ref, limitToLast: () => ref,
            startAt: () => ref, endAt: () => ref,
            goOnline: () => Promise.resolve(), goOffline: () => Promise.resolve(),
            keepSynced: () => Promise.resolve(),
            toString: () => refToString(key)
        };
        return ref;
    }
    const db = { ref: (p) => makeRef(String(p || '')), goOnline: () => Promise.resolve(), goOffline: () => Promise.resolve() };

    const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
    const sandbox = {
        console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
        db: db,
        document: {
            addEventListener() {}, getElementById: () => null, querySelector: () => null,
            querySelectorAll: () => [], createElement: el,
            documentElement: { style: { setProperty() {} }, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
            body: el(), head: el()
        },
        window: {},
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        navigator: { language: 'ru', onLine: true, vibrate() {} },
        location: { search: '', pathname: '/index.html', href: 'https://club.test/index.html' },
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
        requestAnimationFrame: () => 0, cancelAnimationFrame() {},
        matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
        Object, Array, String, Number, Boolean, JSON, Math, Date, RegExp, Error, TypeError, Promise,
        isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, fetch: () => Promise.reject(new Error('no net'))
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'utils.js'), 'utf8'), sandbox, { filename: 'js/utils.js' });
    return { sandbox, realOn, listeners, store, snapFor };
}

// ── 1. Разбор пути ссылки ─────────────────────────────────────────────────
{
    const { sandbox } = makeSandbox((key) => 'stub://' + key);
    ok(typeof sandbox.pestovoRefPath === 'function', 'js/utils.js: pestovoRefPath определена');
    ok(sandbox.pestovoRefPath({ toString: () => 'stub://settings/design' }) === 'settings/design',
        'pestovoRefPath: stub://settings/design → settings/design (хоста нет, путь не съедается)');
    ok(sandbox.pestovoRefPath({ toString: () => 'stub://rounds' }) === 'rounds',
        'pestovoRefPath: stub://rounds → rounds');
    ok(sandbox.pestovoRefPath({ toString: () => 'https://club.firebaseio.com/settings/design' }) === 'settings/design',
        'pestovoRefPath: боевой URL → settings/design');
    ok(sandbox.pestovoRefPath({ toString: () => 'https://club.firebaseio.com/settings/design?x=1' }) === 'settings/design',
        'pestovoRefPath: query-параметры отбрасываются');
    ok(sandbox.pestovoRefPath({ toString: () => 'https://club.firebaseio.com/' }) === '',
        'pestovoRefPath: корень базы → пустая строка');
}

// ── 2. Одна подписка на ветку вместо N ключей ─────────────────────────────
{
    const { sandbox, realOn } = makeSandbox((key) => 'stub://' + key);

    const paths = ['settings/design', 'settings/tn_gender_split', 'settings/hidden_pages', 'settings/missing_key'];
    paths.forEach((p) => sandbox.bindSettingsValue(p, () => {}));
    paths.forEach((p) => sandbox.bindRealtimeValue('k:' + p, sandbox.db.ref(p), () => {}));
    sandbox.bindRealtimeValue('k:root', sandbox.db.ref('settings'), () => {});

    // Шина создаётся один раз на страницу: сколько бы ключей settings ни
    // подписали (здесь 9, плюс те, что utils.js подписывает при загрузке),
    // реальный Listen должен быть ровно один — на корень ветки.
    const settingsListens = realOn.filter((p) => p === 'settings' || p.indexOf('settings/') === 0);
    ok(settingsListens.length === 1 && settingsListens[0] === 'settings',
        'все подписки на settings/* → ровно один .on("value") на "settings" (получено: ' +
        JSON.stringify(settingsListens) + '; остальные Listen: ' +
        JSON.stringify(Array.from(new Set(realOn.filter((p) => p.indexOf('settings') !== 0)))) + ')');
}

// ── 3. Значения доходят до подписчиков ────────────────────────────────────
{
    const { sandbox, listeners, store } = makeSandbox((key) => 'stub://' + key);
    const got = {};
    sandbox.bindSettingsValue('settings/design', (sn) => { got.design = sn.val(); });
    sandbox.bindSettingsValue('settings/tn_gender_split', (sn) => { got.split = sn.val(); });
    sandbox.bindSettingsValue('settings/missing_key', (sn) => { got.missing = sn.val(); got.missingExists = sn.exists(); });
    sandbox.bindSettingsValue('settings/hidden_pages', (sn) => {
        got.hiddenChildren = sn.numChildren();
        got.hiddenStats = sn.child('stats').val();
    });
    ok(got.design && got.design.primary === '#123456', 'подписчик settings/design получил значение');
    ok(got.split === 'on', 'подписчик settings/tn_gender_split получил значение');
    ok(got.missing === null && got.missingExists === false, 'отсутствующий ключ → val()=null, exists()=false');
    ok(got.hiddenChildren === 1 && got.hiddenStats === true, 'child()/numChildren() работают на объекте');

    // Обновление ветки должно разослаться всем подписчикам.
    store.tn_gender_split = 'off';
    listeners['settings'].forEach((cb) => cb({ val: () => store }));
    ok(got.split === 'off', 'изменение /settings рассылается подписчикам');
}

// ── 4. Прямых подписок на settings/* в клиентском коде не осталось ─────────
{
    const jsDir = path.join(ROOT, 'js');
    const offenders = [];
    for (const f of fs.readdirSync(jsDir)) {
        if (!f.endsWith('.js')) continue;
        const src = fs.readFileSync(path.join(jsDir, f), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');
        if (/db\.ref\((['"])settings\/[^)]*\)\.on\(/.test(src)) offenders.push('js/' + f);
    }
    ok(offenders.length === 0, 'в js/*.js нет прямых db.ref("settings/…").on(…)' +
        (offenders.length ? ': ' + offenders.join(', ') : ''));
}

if (failed) { console.error('\nПровалено проверок: ' + failed); process.exit(1); }
console.log('\nВсе проверки шины настроек пройдены ✔');
