#!/usr/bin/env node
'use strict';
/*
 * check-printcards-preview.js — живая браузерная проверка вкладки турнира
 * «Счетные карточки» (admin.html → js/tn-mgr-printcards.js).
 *
 * Зачем: предпросмотр рисуется настоящими миллиметрами и масштабируется
 * в fitStage(). В Node/jsdom геометрии нет, поэтому «карточка уехала за
 * пределы блока и её не видно» ловится только в браузере. Проверка
 * поднимает tools/harness/printcards.html (реальные модули менеджера
 * турниров + in-memory база), открывает вкладку и требует:
 *   — карточка-эталон видна ЦЕЛИКОМ на широком и на узком экране;
 *   — на экране ровно одна карточка, остальные свёрнуты и неактивны;
 *   — правка размеров/кеглей мгновенно меняет предпросмотр;
 *   — лого и QR перетаскиваются мышью, QR включается и ведёт на ввод счёта;
 *   — данные карточек берутся из турнира (имена, HCP, время старта);
 *   — в печать/PDF не попадают подписи «Игрок / Маркер / Судья».
 *
 * Запуск:
 *   node tools/check-printcards-preview.js            # пропустится без браузера
 *   node tools/check-printcards-preview.js --require  # падать без браузера (CI)
 * Окружение то же, что у browser-check.js: CHROMIUM_PATH,
 * CHROMIUM_EXTRA_LIBS (tools/build-stub-libs.sh).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HARNESS = '/tools/harness/printcards.html';
const REQUIRE_BROWSER = process.argv.includes('--require');

let fails = 0;
let total = 0;
function check(title, cond, extra) {
    total++;
    if (!cond) fails++;
    console.log((cond ? ' ok  ' : 'FAIL ') + ' | ' + title + (extra !== undefined && extra !== '' ? ' → ' + extra : ''));
}

// ── Локальный сервер (весь репозиторий) ───────────────────────────────────
function startServer() {
    const MIME = {
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
        '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml'
    };
    const server = http.createServer(function (req, res) {
        const url = new URL(req.url, 'http://127.0.0.1');
        let filePath = decodeURIComponent(url.pathname);
        if (filePath === '/') filePath = '/index.html';
        const abs = path.join(ROOT, filePath);
        if (abs.indexOf(ROOT) !== 0) { res.writeHead(403); res.end(); return; }
        fs.readFile(abs, function (err, buf) {
            if (err) { res.writeHead(404); res.end('not found'); return; }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream',
                'Cache-Control': 'no-store'
            });
            res.end(buf);
        });
    });
    return new Promise(function (resolve) {
        server.listen(0, '127.0.0.1', function () { resolve({ server: server, port: server.address().port }); });
    });
}

// ── Браузер (тот же порядок поиска, что в browser-check.js) ──────────────
async function launchBrowser(playwright, chromiumMod) {
    const extraLibs = process.env.CHROMIUM_EXTRA_LIBS;
    const env = extraLibs ? Object.assign({}, process.env, { LD_LIBRARY_PATH: extraLibs }) : undefined;
    const baseArgs = ['--no-sandbox', '--disable-dev-shm-usage'];
    if (process.env.CHROMIUM_PATH) {
        return await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: baseArgs, env: env, headless: true });
    }
    try {
        return await playwright.chromium.launch({ args: baseArgs, env: env, headless: true });
    } catch (e) { /* свой chromium не установлен — пробуем бандл */ }
    if (chromiumMod && typeof chromiumMod.executablePath === 'function') {
        const exec = await chromiumMod.executablePath();
        const args = (chromiumMod.args || [])
            .filter(function (a) { return a !== '--single-process' && a !== '--no-zygote'; })
            .concat(baseArgs);
        return await playwright.chromium.launch({ executablePath: exec, args: args, env: env, headless: true });
    }
    throw new Error('playwright chromium и @sparticuz/chromium недоступны');
}

// ── Геометрия предпросмотра (выполняется в браузере) ─────────────────────
function measure() {
    const stage = document.querySelector('[data-tnpc-stage]');
    const card = document.querySelector('.tnpc-card');
    function rect(el) {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom };
    }
    function visibleRatio(inner, outer) {
        if (!inner || !outer || !inner.w || !inner.h) return 0;
        const x = Math.max(inner.x, outer.x);
        const y = Math.max(inner.y, outer.y);
        const r = Math.min(inner.right, outer.right);
        const b = Math.min(inner.bottom, outer.bottom);
        if (r <= x || b <= y) return 0;
        return ((r - x) * (b - y)) / (inner.w * inner.h);
    }
    const nameEl = card ? card.querySelector('.tnpc-name') : null;
    const titleEl = card ? card.querySelector('.tnpc-title') : null;
    return {
        cards: document.querySelectorAll('.tnpc-card').length,
        rows: document.querySelectorAll('.tnpc-row').length,
        activeRows: document.querySelectorAll('.tnpc-row.active').length,
        rowEditables: Array.prototype.slice.call(document.querySelectorAll('.tnpc-row [contenteditable]')).length,
        stage: rect(stage),
        card: rect(card),
        stageFit: stage ? stage.getAttribute('data-fit') : null,
        ratio: visibleRatio(rect(card), rect(stage)),
        nameText: nameEl ? nameEl.textContent.trim() : '',
        titleText: titleEl ? titleEl.textContent.trim() : '',
        nameFontMm: nameEl ? parseFloat(getComputedStyle(nameEl).fontSize) : 0,
        metaText: card ? (card.querySelector('.tnpc-meta') || {}).textContent || '' : '',
        holeCells: card ? card.querySelectorAll('.tnpc-table tr:first-child td').length : 0,
        footOnScreen: document.querySelectorAll('.tnpc-foot .tnpc-sign').length,
        overlays: document.querySelectorAll('.tnpc-overlay').length,
        alert: (document.querySelector('.tnpc-alert') || {}).textContent || ''
    };
}

async function openTab(launch, base, viewport) {
    const browser = await launch();
    const context = await browser.newContext({ viewport: viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
    page.on('console', function (m) {
        // Внешние ресурсы (шрифты, api.qrserver.com) заблокированы намеренно.
        if (m.type() === 'error' && /Failed to load resource/.test(m.text())) return;
        if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 200));
    });
    // Всё внешнее (шрифты, api.qrserver.com) блокируем: проверка офлайн.
    await page.route('**/*', function (route) {
        const u = route.request().url();
        if (u.indexOf(base) === 0) return route.continue();
        return route.abort();
    });
    await page.goto(base + HARNESS);
    await page.waitForSelector('.tnpc-card', { timeout: 15000 });
    await page.waitForTimeout(300);
    return { browser: browser, page: page, errors: errors };
}

(async function main() {
    let playwright = null, chromiumMod = null;
    try { playwright = require('playwright'); } catch (e) { /* не установлен */ }
    try { chromiumMod = require('@sparticuz/chromium'); } catch (e) { /* не установлен */ }
    if (!playwright) {
        const msg = 'check-printcards: не найден playwright (npm i -D playwright) — проверка пропущена.';
        if (REQUIRE_BROWSER) { console.error(msg); process.exit(2); }
        console.log(msg);
        process.exit(0);
    }
    let launch = function () { return launchBrowser(playwright, chromiumMod); };
    try {
        const probe = await launch();
        await probe.close();
    } catch (e) {
        const msg = 'check-printcards: браузер недоступен (' + e.message + '). Проверка пропущена.';
        if (REQUIRE_BROWSER) { console.error(msg); process.exit(2); }
        console.log(msg);
        process.exit(0);
    }

    const started = await startServer();
    const base = 'http://127.0.0.1:' + started.port;
    console.log('check-printcards: ' + base + HARNESS);

    const wide = await openTab(launch, base, { width: 1280, height: 1000 });
    const page = wide.page;

    // 1. Карточка-эталон видна целиком.
    let m = await page.evaluate(measure);
    check('нет ошибок страницы', wide.errors.length === 0, wide.errors.slice(0, 3).join(' | '));
    check('на экране ровно одна карточка', m.cards === 1, m.cards);
    check('карточка видна целиком (не обрезана блоком)', m.ratio >= 0.98, 'видно ' + Math.round(m.ratio * 100) + '%');
    check('предпросмотр листа отмасштабирован под вкладку', Number(m.stageFit) > 0 && Number(m.stageFit) <= 1.25, m.stageFit);
    check('карточка не пустая по высоте', m.card && m.card.h > 200, m.card && Math.round(m.card.h));
    check('лист A4 помещается в предпросмотр по ширине', m.card && m.stage && m.card.w <= m.stage.w + 1,
        Math.round(m.card && m.card.w) + ' / ' + Math.round(m.stage && m.stage.w));

    // 2. Данные — из турнира (актуальные).
    check('название турнира на карточке', m.titleText === 'Кубок Пестово', m.titleText);
    check('имена игроков из участников', /Иванов Иван/.test(m.nameText), m.nameText);
    check('в шапке дата и клуб', /01\.06\.2026/.test(m.metaText) || /Пестово/.test(m.metaText), m.metaText.trim());
    check('таблица на 18 лунок + подписи + итоги', m.holeCells >= 20, m.holeCells);
    check('подписи снизу видны на экране', m.footOnScreen === 3, m.footOnScreen);
    check('раскладка помещается на лист A4 (без предупреждения)', m.alert.indexOf('за лист A4') === -1, m.alert);

    // 3. Остальные карточки свёрнуты и неактивны.
    check('все карточки перечислены свёрнутыми строками', m.rows === 5 && m.activeRows === 1,
        m.rows + ' строк, активных ' + m.activeRows + ' (в заглушке 6 участников, одна пара)');
    check('в свёрнутых строках нет редактируемых полей', m.rowEditables === 0, m.rowEditables);

    // 4. Смена эталона: кликом по свёрнутой строке.
    const secondName = await page.evaluate(function () {
        const rows = Array.prototype.slice.call(document.querySelectorAll('.tnpc-row:not(.active)'));
        return rows.length ? rows[0].querySelector('[data-tnpc-row-name]').textContent.trim() : '';
    });
    await page.click('.tnpc-row:not(.active) [data-tnm-act="tnpc-open-card"]');
    await page.waitForTimeout(250);
    m = await page.evaluate(measure);
    check('эталон переключился на выбранную карточку', m.nameText === secondName, m.nameText + ' ≠ ' + secondName);
    check('после переключения карточка по-прежнему видна целиком', m.ratio >= 0.98, Math.round(m.ratio * 100) + '%');

    // 5. Размеры меняются мгновенно и применяются ко всем карточкам.
    await page.click('[data-tnm-act="tnpc-panel-sizes"]');
    await page.waitForSelector('[data-panel="sizes"]');
    const before = await page.evaluate(measure);
    await page.evaluate(function () {
        const input = document.querySelector('[data-tnm-live-edit="tnpc-style"][data-field="nameMm"]');
        input.value = '9';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(120);
    const after = await page.evaluate(measure);
    check('кегль имени изменился сразу, без перерисовки вкладки',
        Math.round(after.nameFontMm) > Math.round(before.nameFontMm) + 5,
        before.nameFontMm.toFixed(1) + 'px → ' + after.nameFontMm.toFixed(1) + 'px');
    check('карточка осталась видимой после правки размера', after.ratio >= 0.98, Math.round(after.ratio * 100) + '%');
    await page.waitForTimeout(700);
    const savedDesign = await page.evaluate(function () {
        const stored = window.db.__get('tournaments/t1/printScorecards');
        return (stored && stored.style && stored.style.nameMm) || null;
    });
    check('дизайн сохранился в турнире (общий для всех карточек)', savedDesign === 9, savedDesign);
    // вернём кегль по умолчанию
    await page.evaluate(function () {
        const input = document.querySelector('[data-tnm-live-edit="tnpc-style"][data-field="nameMm"]');
        input.value = '4.6';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 6. QR: добавление, включение и перетаскивание мышью.
    await page.click('[data-tnm-act="tnpc-panel-overlays"]');
    await page.waitForSelector('[data-panel="overlays"]');
    await page.click('[data-tnm-act="tnpc-qr-add"]');
    await page.waitForSelector('.tnpc-overlay[data-type="qr"]');
    await page.waitForTimeout(800);                // даём автосохранению отрисоваться
    const qrId = await page.evaluate(function () {
        const list = document.querySelectorAll('.tnpc-overlay[data-type="qr"]');
        return list[list.length - 1].getAttribute('data-overlay-id');   // только что добавленный
    });
    // Прокручиваем окно (не scrollIntoView: предпросмотр — блок с overflow:hidden).
    await page.evaluate(function (id) {
        document.documentElement.style.scrollBehavior = 'auto';
        const el = document.querySelector('.tnpc-overlay[data-overlay-id="' + id + '"]');
        window.scrollTo(0, window.scrollY + el.getBoundingClientRect().y - 300);
    }, qrId);
    await page.waitForTimeout(300);
    const qrBox = await page.evaluate(function (id) {
        const el = document.querySelector('.tnpc-overlay[data-overlay-id="' + id + '"]');
        const b = el.getBoundingClientRect();
        return { cx: b.x + b.width / 2, cy: b.y + b.height / 2, left: el.style.left, top: el.style.top };
    }, qrId);
    await page.mouse.move(qrBox.cx, qrBox.cy);
    await page.mouse.down();
    await page.mouse.move(qrBox.cx + 60, qrBox.cy + 40, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const qrMoved = await page.evaluate(function (id) {
        const el = document.querySelector('.tnpc-overlay[data-overlay-id="' + id + '"]');
        return { left: el.style.left, top: el.style.top };
    }, qrId);
    check('QR перетаскивается мышью', qrMoved.left !== qrBox.left || qrMoved.top !== qrBox.top,
        qrBox.left + '/' + qrBox.top + ' → ' + qrMoved.left + '/' + qrMoved.top);
    await page.waitForTimeout(700);
    const savedQr = await page.evaluate(function (id) {
        const stored = window.db.__get('tournaments/t1/printScorecards');
        return (stored && stored.overlays || []).filter(function (o) { return o.id === id; })[0] || null;
    }, qrId);
    check('новая позиция QR сохранена в общем дизайне',
        !!savedQr && savedQr.enabled === true && (savedQr.xMm !== 10 || savedQr.yMm !== 8),
        JSON.stringify(savedQr));
    check('QR ведёт на ввод счёта игрока', await page.evaluate(function () {
        const img = document.querySelector('.tnpc-overlay[data-type="qr"] img[data-qr]');
        return !!img && /setup-round\.html|scorer\.html/.test(decodeURIComponent(img.getAttribute('src')));
    }));

    // 7. Печать: подписи «Игрок / Маркер / Судья» не попадают на бумагу.
    await page.click('[data-tnm-act="tnpc-print-all"]');
    await page.waitForTimeout(900);
    const printed = await page.evaluate(function () { return window.printed[window.printed.length - 1] || ''; });
    check('печать отдаёт документ', printed.length > 500, printed.length);
    check('в печати есть карточки турнира', printed.indexOf('Кубок Пестово') !== -1 && printed.indexOf('Иванов Иван') !== -1);
    check('в печати НЕТ подписей «Игрок / Маркер / Судья»',
        printed.indexOf('<div class="tnpc-sign"') === -1 && printed.indexOf('<div class="tnpc-foot') === -1 &&
        printed.indexOf('Судья') === -1 && printed.indexOf('Маркер') === -1);
    check('в печати нет служебной разметки редактора',
        printed.indexOf('<span class="tnpc-handle"') === -1 && printed.indexOf('<span class="tnpc-x"') === -1 &&
        printed.indexOf('contenteditable') === -1);
    check('печать — лист A4 landscape', printed.indexOf('@page{size:A4 landscape;margin:0}') !== -1);
    check('QR-код попал в печать', printed.indexOf('data-qr') !== -1);

    // 8. Узкий экран (телефон организатора в поле).
    await wide.browser.close();
    const narrow = await openTab(launch, base, { width: 390, height: 844 });
    const mn = await narrow.page.evaluate(measure);
    check('на телефоне карточка тоже видна целиком', mn.ratio >= 0.98, 'видно ' + Math.round(mn.ratio * 100) + '%');
    check('на телефоне предпросмотр показывает карточку крупно (без листа A4)',
        await narrow.page.evaluate(function () { return !!document.querySelector('.tnpc-stage.card-mode'); }));
    check('на телефоне карточка читается: ширина не мельче половины экрана', mn.card && mn.card.w >= 300,
        Math.round(mn.card && mn.card.w) + 'px');
    check('на телефоне нет горизонтального переполнения страницы',
        await narrow.page.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth + 1; }));
    check('нет ошибок на узком экране', narrow.errors.length === 0, narrow.errors.slice(0, 3).join(' | '));
    await narrow.browser.close();

    started.server.close();
    console.log('\n' + (fails ? '✗ ' + fails + ' / ' + total : 'check-printcards: все проверки пройдены ✔ (' + total + ')'));
    process.exit(fails ? 1 : 0);
})().catch(function (err) {
    console.error('check-printcards: ' + (err && err.stack || err));
    process.exit(1);
});
