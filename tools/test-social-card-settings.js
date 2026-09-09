#!/usr/bin/env node
/**
 * Проверяет новую конфигурацию PNG-карточек для соцсетей без браузера:
 *   node tools/test-social-card-settings.js
 *
 * — нормализацию и локальное сохранение 3 вариантов;
 * — синхронизацию выбранного варианта в Firebase settings/social_card_variant;
 * — рендер трёх макетов на mock-canvas: логотип рисуется ровно один раз
 *   (в шапке), а имя игрока находится ниже прежней позиции y=215.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var storage = {};
var firebaseWrites = [];
var buttonState = {};

function button(id) {
    if (!buttonState[id]) {
        buttonState[id] = {
            attrs: {},
            classList: {
                toggle: function(name, enabled) { buttonState[id][name] = !!enabled; },
                add: function() {}, remove: function() {}
            },
            setAttribute: function(name, value) { this.attrs[name] = String(value); }
        };
    }
    return buttonState[id];
}

function firebaseRef(refPath) {
    return {
        on: function() {},
        once: function() { return Promise.resolve({ val: function() { return null; } }); },
        set: function(value) {
            firebaseWrites.push({ path: refPath, value: value });
            return Promise.resolve();
        },
        update: function() { return Promise.resolve(); },
        remove: function() { return Promise.resolve(); },
        push: function() { return { key: 'test' }; },
        orderByChild: function() { return this; },
        orderByKey: function() { return this; },
        limitToLast: function() { return this; },
        limitToFirst: function() { return this; },
        startAt: function() { return this; },
        endAt: function() { return this; },
        equalTo: function() { return this; }
    };
}

var sandbox = {
    console: console,
    Promise: Promise,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    RegExp: RegExp,
    Error: Error,
    isNaN: isNaN,
    parseInt: parseInt,
    parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    setTimeout: function() { return 0; },
    clearTimeout: function() {},
    setInterval: function() { return 0; },
    clearInterval: function() {},
    currentLang: 'ru',
    navigator: { userAgent: 'node-test', platform: 'node', maxTouchPoints: 0, vibrate: function() {} },
    location: { origin: 'https://example.test', pathname: '/index.html', href: 'https://example.test/index.html' },
    localStorage: {
        getItem: function(key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
        setItem: function(key, value) { storage[key] = String(value); },
        removeItem: function(key) { delete storage[key]; }
    },
    sessionStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
    db: { ref: firebaseRef },
    toast: function() {},
    document: {
        documentElement: { setAttribute: function() {}, style: {} },
        body: { appendChild: function() {}, classList: { add: function() {}, remove: function() {}, toggle: function() {} } },
        addEventListener: function() {},
        removeEventListener: function() {},
        getElementById: function(id) {
            return /^social-card-opt-[123]$/.test(id) ? button(id) : null;
        },
        querySelector: function() { return null; },
        querySelectorAll: function() { return []; },
        createElement: function() {
            return { style: {}, classList: { add: function() {}, remove: function() {}, toggle: function() {} }, appendChild: function() {}, setAttribute: function() {} };
        }
    },
    window: null,
    self: null,
    globalThis: null
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

var ctx = vm.createContext(sandbox);
function load(file) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
}

load('js/utils.js');
load('js/admin.js');

var fails = 0;
var total = 0;
function check(title, actual, expected) {
    total++;
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) fails++;
    console.log((ok ? ' ok  ' : 'FAIL ') + '| ' + title + ' → ' + JSON.stringify(actual) + (ok ? '' : ' (ожид. ' + JSON.stringify(expected) + ')'));
}

console.log('=== Варианты PNG-карточки ===\n');
check('корректный вариант 1', sandbox.normalizeSocialCardVariant('1'), '1');
check('корректный вариант 2', sandbox.normalizeSocialCardVariant(2), '2');
check('корректный вариант 3', sandbox.normalizeSocialCardVariant('3'), '3');
check('некорректный вариант возвращает классический', sandbox.normalizeSocialCardVariant('other'), '1');

sandbox.applySocialCardVariant('2');
check('выбор сохраняется для офлайна', storage.pestovo_social_card_variant, '2');
check('выбранный вариант читается экспортом', sandbox.getSocialCardVariant(), '2');

sandbox.saveSocialCardVariant('3');
check('кнопка 3 становится активной', buttonState['social-card-opt-3']['social-card-variant-active'], true);
check('aria-pressed кнопки 3 обновлён', buttonState['social-card-opt-3'].attrs['aria-pressed'], 'true');
check('вариант отправляется в Firebase', firebaseWrites[firebaseWrites.length - 1], { path: 'settings/social_card_variant', value: '3' });

function makeCanvasContext() {
    var calls = [];
    return {
        calls: calls,
        createLinearGradient: function() { return { addColorStop: function() {} }; },
        fillRect: function() {}, strokeRect: function() {}, save: function() {}, restore: function() {},
        beginPath: function() {}, moveTo: function() {}, lineTo: function() {}, stroke: function() {}, fill: function() {},
        roundRect: function() {}, arc: function() {},
        drawImage: function() { calls.push({ kind: 'image' }); },
        fillText: function(text, x, y) { calls.push({ kind: 'text', text: String(text), y: y }); },
        measureText: function(text) { return { width: String(text).length * 18 }; }
    };
}

console.log('\n=== Макеты canvas ===\n');
['1', '2', '3'].forEach(function(variant) {
    var canvas = makeCanvasContext();
    sandbox.drawSocialCardLayout(canvas, {
        variant: variant,
        logoImg: { width: 1150, height: 770 },
        playerName: 'Иванов Иван',
        format: 'Stroke Play',
        teeName: 'Белый',
        hcp: '12.4',
        date: '09 сент. 2026 г.',
        tournamentName: 'Кубок Пестово',
        scores: { 1: 4, 2: 5, 3: 4, 10: 5, 11: 4, 12: 3 },
        stats: { toPar: -1, gross: 25, stablefordField: 15 },
        outGross: 13,
        inGross: 12,
        totalGross: 25
    });
    var playerText = canvas.calls.filter(function(c) { return c.kind === 'text' && c.text === 'Иванов Иван'; })[0];
    check('вариант ' + variant + ': один логотип только в шапке', canvas.calls.filter(function(c) { return c.kind === 'image'; }).length, 1);
    check('вариант ' + variant + ': имя опущено ниже y=215', !!playerText && playerText.y > 215, true);
});

var adminHtml = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
check('в админке доступны ровно 3 кнопки оформления', (adminHtml.match(/id="social-card-opt-[123]"/g) || []).length, 3);

console.log('\nИтого: ' + total + ' проверок, ошибок: ' + fails);
process.exit(fails ? 1 : 0);
