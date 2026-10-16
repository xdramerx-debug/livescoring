// Область загрузки QR-стека (аудит 2026-10, docs/IMPROVEMENTS-2026-10.md п.6).
//
// js/vendor/qrcode-generator-1.4.4.js — 57 КБ парсится и выполняется на КАЖДОЙ
// странице, хотя QR рисуют только четыре: admin (печать карточек, tn-mgr-*),
// qr-start (стартовый экран по QR), setup-round (live.js) и tournaments
// (tournament-public.js). Остальные 11 страниц, включая offline.html — страницу,
// которую показывают именно при плохой сети, — грузили библиотеку впустую.
//
// Тест фиксирует правило «страница грузит QR-стек тогда и только тогда, когда
// один из её скриптов вызывает QR-API», чтобы стек не вернули «на всякий случай»
// и не убрали со страницы, которая его действительно использует.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');

// ── 1. Кто вызывает QR-API ──
// ПРОВАЙДЕРЫ — обёртки над QR-API: они обращаются к window.PestovoQr только
// под проверкой и имеют откат на внешний сервис. Наличие провайдера на странице
// само по себе не требует QR-стека, поэтому в список потребителей они не входят.
// utils.js держит qrUrl()/pestovoQrImgHtml(), js/qr-url.js — общую реализацию
// pestovoQrImageUrl(), которую вызывают utils.js, qr-start.js и tn-mgr-core.js.
const PROVIDERS = ['utils.js', 'qr-url.js'];
const QR_CALLS = [
    /PestovoQr/,
    /\bqrUrl\s*\(/,
    /\bpestovoQrImgHtml\s*\(/,
    /[^.\w]qrcode\s*\(/
];
const jsDir = path.join(root, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && !f.startsWith('vendor'));
const callers = new Set();
for (const f of jsFiles) {
    if (PROVIDERS.includes(f) || f === 'qr-code.js') continue;   // провайдеры и сам QR-движок
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    if (QR_CALLS.some(re => re.test(src))) callers.add(f);
}
assert.ok(callers.size > 0, 'найден хотя бы один потребитель QR-API');

// Все обращения к QR-API обязаны быть охраняемыми: тогда страница без стека
// деградирует до внешнего генератора, а не падает. Проверка идёт по скользящему
// окну в 6 строк, потому что типичный паттерн — guard в условии, обращение в
// теле блока на следующей строке (js/qr-start.js:34-35).
const GUARD = /typeof PestovoQr !== 'undefined'|typeof pestovoQrImgHtml === 'function'|(window|root)\.PestovoQr\s*&&|PestovoQr\s*&&/;
for (const f of [...callers, ...PROVIDERS]) {
    const lines = fs.readFileSync(path.join(jsDir, f), 'utf8').split('\n');
    lines.forEach(function (line, i) {
        if (!/PestovoQr|pestovoQrImgHtml\s*\(/.test(line)) return;
        if (/^\s*(\/\/|\*)/.test(line)) return;
        if (/^function (qrUrl|pestovoQrImgHtml)/.test(line)) return;   // однострочные объявления utils.js
        const windowLines = lines.slice(Math.max(0, i - 6), i + 1);
        const guarded = windowLines.some(l => GUARD.test(l));
        assert.ok(guarded,
            'js/' + f + ':' + (i + 1) + ' обращается к QR-API без проверки в пределах 6 строк — страница без QR-стека упадёт: ' + line.trim().slice(0, 120));
    });
}
console.log('Потребители QR-API:', [...callers].sort().join(', '));

// ── 2. Разбор страниц ──
const VENDOR = [
    'js/vendor/qrcode-generator-1.4.4.js',
    'js/vendor/qrcode-generator-utf8.js',
    'js/qr-code.js'
];
const htmlFiles = fs.readdirSync(root).filter(f => f.endsWith('.html'));
assert.ok(htmlFiles.length >= 15, 'HTML-страниц не меньше 15, найдено ' + htmlFiles.length);

const shipping = [];
const clean = [];
for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const scripts = [...src.matchAll(/<script[^>]+src="(js\/[^"?]+)\.js\?v=[0-9a-f]+"/g)].map(m => m[1] + '.js');
    const hasVendor = VENDOR.map(v => src.includes('src="' + v)).filter(Boolean);
    const needs = scripts.filter(s => callers.has(s.replace(/^js\//, '')));

    // Стек грузится тремя тегами вместе: qr-code.js требует generator + utf8-shim.
    assert.ok(hasVendor.length === 0 || hasVendor.length === VENDOR.length,
        f + ': QR-стек загружен частично (' + hasVendor.length + '/' + VENDOR.length + ') — qr-code.js не заработает без generator и utf8');

    if (hasVendor.length) {
        shipping.push(f);
        assert.ok(needs.length > 0,
            f + ': грузит QR-стек (57 КБ), но ни один из её скриптов не вызывает QR-API: ' + scripts.join(', '));
    } else {
        clean.push(f);
        assert.strictEqual(needs.length, 0,
            f + ': не грузит QR-стек, но использует QR-API через ' + needs.join(', '));
    }
}

console.log('Грузят QR-стек (' + shipping.length + '):', shipping.sort().join(', '));
console.log('Без QR-стека (' + clean.length + '):', clean.sort().join(', '));
assert.ok(shipping.length <= 5, 'QR-стек не должен расползаться по страницам: сейчас ' + shipping.length);
assert.ok(clean.length >= 10, 'ожидалось не меньше 10 страниц без QR-стека, есть ' + clean.length);

// ── 3. Размер стека — чтобы экономия оставалась ощутимой ──
const sizes = VENDOR.map(v => fs.statSync(path.join(root, v)).size);
const total = sizes.reduce((a, b) => a + b, 0);
assert.ok(total > 50000, 'QR-стек действительно тяжёлый: ' + total + ' байт');
console.log('QR-стек: ' + total + ' байт × ' + clean.length + ' страниц не загружается = ' +
    Math.round(total * clean.length / 1024) + ' КБ парсинга сэкономлено');

// ── 4. fallback qrUrl остаётся доступным ──
// Если QR-API всё же понадобится на «чистой» странице, qrUrl() из utils.js
// откатится на внешний сервис — это деградация, а не падение.
const provider = fs.readFileSync(path.join(jsDir, 'qr-url.js'), 'utf8');
assert.match(provider, /api\.qrserver\.com/,
    'pestovoQrImageUrl() сохраняет внешний fallback при отсутствии PestovoQr');
assert.match(provider, /window\.PestovoQr\s*&&\s*typeof window\.PestovoQr\.dataUrl === 'function'/,
    'pestovoQrImageUrl() проверяет наличие PestovoQr, а не обращается к нему вслепую');
// qrUrl() из utils.js — тонкий адаптер общей реализации: вызывать её можно
// и без QR-стека, откат на внешний сервис остаётся (было 4 копии построителя).
const utils = fs.readFileSync(path.join(jsDir, 'utils.js'), 'utf8');
assert.match(utils, /return pestovoQrImageUrl\(data, 200\);/,
    'qrUrl() в utils.js делегирует общей реализации, а не держит вторую копию');

console.log('QR vendor scope tests passed');
