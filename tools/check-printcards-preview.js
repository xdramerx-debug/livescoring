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
        teeLabel: card ? (card.querySelector('[data-tnpc-field="tee"]') || {}).textContent || '' : '',
        tableRows: card ? Array.prototype.map.call(card.querySelectorAll('[data-tnpc-table-row]'), function (row) {
            return row.getAttribute('data-tnpc-table-row');
        }) : [],
        blockKeys: card ? Array.prototype.map.call(card.querySelectorAll('[data-tnpc-block]'), function (block) {
            return block.getAttribute('data-tnpc-block');
        }) : [],
        blockHandles: card ? card.querySelectorAll('[data-tnpc-block-resize]').length : 0,
        lengthText: card ? (card.querySelector('[data-tnpc-table-row="length"]') || {}).textContent || '' : '',
        holeOrder: card ? Array.prototype.slice.call(card.querySelector('[data-tnpc-table-row="holes"]')
            .querySelectorAll('td')).slice(1).map(function (cell) { return cell.textContent.trim(); }) : [],
        holeCells: card ? card.querySelectorAll('.tnpc-block[data-tnpc-block="holes"] tr:first-child td').length : 0,
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
    check('колонки идут 1–9, OUT, 10–18, IN, TOTAL',
        m.holeOrder.join(',') === '1,2,3,4,5,6,7,8,9,OUT,10,11,12,13,14,15,16,17,18,IN,TOTAL',
        m.holeOrder.join(','));
    check('Фора расположена после Индекса и перед Ударами',
        m.tableRows.indexOf('fore') === m.tableRows.indexOf('index') + 1 &&
        m.tableRows.indexOf('strokes') === m.tableRows.indexOf('fore') + 1, m.tableRows.join(','));
    check('строка «Длина» идёт после «Пар» и до «Индекса», с длинами справочника',
        m.blockKeys.join(',') === 'holes,par,length,index,fore,strokes' && /328/.test(m.lengthText),
        m.blockKeys.join(',') + ' | ' + m.lengthText.slice(0, 40));
    check('у каждого блока таблицы три ручки растягивания',
        m.blockHandles === m.blockKeys.length * 3, m.blockHandles + ' ручек на ' + m.blockKeys.length + ' блоков');
    check('ТИ показан цветом, не кодом', !/^(wh|bl|rd|bk)$/i.test(m.teeLabel), m.teeLabel);
    check('подписи снизу видны на экране', m.footOnScreen === 3, m.footOnScreen);
    check('на экране нет предупреждений о раскладке', m.alert === '', m.alert);

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

    // 5. Строки таблицы можно менять прямо в предпросмотре.
    await page.click('.tnpc-table-row[data-tnpc-table-row="fore"] [data-tnm-act="tnpc-table-row-down"]');
    await page.waitForTimeout(150);
    let movedRows = await page.evaluate(function () {
        return Array.prototype.map.call(document.querySelectorAll('.tnpc-card [data-tnpc-table-row]'), function (row) {
            return row.getAttribute('data-tnpc-table-row');
        });
    });
    check('кнопка ↓ меняет порядок строк на карточке', movedRows.join(',') === 'holes,par,length,index,strokes,fore', movedRows.join(','));
    await page.waitForTimeout(700);
    const savedRows = await page.evaluate(function () {
        const saved = window.db.__get('tournaments/t1/printScorecards');
        return saved && saved.rowOrder || [];
    });
    check('новый порядок строк сохранён в турнире', savedRows.join(',') === 'holes,par,length,index,strokes,fore', savedRows.join(','));
    await page.click('.tnpc-table-row[data-tnpc-table-row="fore"] [data-tnm-act="tnpc-table-row-up"]');

    // 6. Размеры меняются мгновенно и применяются ко всем карточкам.
    await page.click('[data-tnm-act="tnpc-panel-sizes"]');
    await page.waitForSelector('[data-panel="sizes"]');
    // Раскладка по умолчанию (105.86×39.68 мм, масштаб 120%) крупнее листа
    // A4 landscape: панель честно об этом пишет, а печать вписывает карточку в лист.
    const sizes = await page.evaluate(function () {
        const panel = document.querySelector('[data-panel="sizes"]');
        const card = document.querySelector('.tnpc-card');
        const page = document.querySelector('[data-tnpc-page]');
        const note = (panel.querySelector('.tnpc-alert') || panel.querySelector('.tnm-muted') || {}).textContent || '';
        const cs = card ? getComputedStyle(card) : {};
        function field(name) {
            const input = panel.querySelector('[data-tnm-live-edit="tnpc-layout"][data-field="' + name + '"]');
            return input ? input.value : null;
        }
        return {
            note: note.trim(),
            x: parseFloat(card && card.style.left),
            y: parseFloat(card && card.style.top),
            scale: cs && cs.transform ? cs.transform : '',
            cardW: card ? card.getBoundingClientRect().width : 0,
            pageW: page ? page.getBoundingClientRect().width : 0,
            pageH: page ? page.getBoundingClientRect().height : 0,
            perSheet: panel.querySelector('[data-tnm-edit="tnpc-persheet"]').value,
            scalePct: field('scalePct'), xMm: field('xMm'), yMm: field('yMm')
        };
    });
    check('панель размеров объясняет вписывание в лист', /вписывается в лист/.test(sizes.note), sizes.note);
    check('в подсказке указан фактический размер карточки', /\d+(\.\d+)?×\d+(\.\d+)? мм/.test(sizes.note), sizes.note);
    check('масштаб по умолчанию 120%', sizes.scalePct === '120', sizes.scalePct);
    check('смещение по умолчанию 105.86x39.68 мм', sizes.xMm === '105.86' && sizes.yMm === '39.68',
        sizes.xMm + 'x' + sizes.yMm);
    check('вписанная карточка не выходит за лист A4 landscape',
        sizes.cardW <= sizes.pageW + 1 && sizes.x >= 0 && sizes.y >= 0,
        'card ' + Math.round(sizes.cardW) + 'px в листе ' + Math.round(sizes.pageW) + 'x' + Math.round(sizes.pageH) + 'px');
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

    // 6a. Панель «Цвет и шрифт»: общие цвета и настройки каждого блока.
    await page.click('[data-tnm-act="tnpc-panel-design"]');
    await page.waitForSelector('[data-panel="design"]');
    const designBefore = await page.evaluate(function () {
        const card = document.querySelector('.tnpc-card');
        const ink = card.getAttribute('style').match(/--tnpc-ink:(#[0-9a-fA-F]+)/);
        return {
            blockCfgs: document.querySelectorAll('[data-block-cfg]').length,
            ink: ink ? ink[1] : ''
        };
    });
    check('панель «Цвет и шрифт» отдаёт настройки всех блоков',
        designBefore.blockCfgs === 6, designBefore.blockCfgs + ' блоков');
    await page.evaluate(function () {
        const input = document.querySelector('[data-tnm-live-edit="tnpc-design-color"][data-field="ink"]');
        input.value = '#001f7a';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(150);
    const designAfter = await page.evaluate(function () {
        const card = document.querySelector('.tnpc-card');
        const ink = card.getAttribute('style').match(/--tnpc-ink:(#[0-9a-fA-F]+)/);
        return { ink: ink ? ink[1] : '' };
    });
    check('смена цвета текста применяется к карточке сразу',
        designAfter.ink === '#001f7a', designAfter.ink);
    // Растягивание блока «Пар» за нижнюю ручку (↕ высота строк).
    // На странице админки предпросмотр расположен ниже панелей; браузерная
    // мышь работает только в viewport, поэтому перед drag прокручиваем к handle.
    await page.locator('.tnpc-block[data-tnpc-block="par"] .tnpc-block-h-h').scrollIntoViewIfNeeded();
    const parHandle = await page.evaluate(function () {
        const el = document.querySelector('.tnpc-block[data-tnpc-block="par"] .tnpc-block-h-h');
        const b = el.getBoundingClientRect();
        return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
    });
    const parBefore = await page.evaluate(function () {
        return document.querySelector('.tnpc-block[data-tnpc-block="par"] td').getBoundingClientRect().height;
    });
    await page.mouse.move(parHandle.cx, parHandle.cy);
    await page.mouse.down();
    await page.mouse.move(parHandle.cx, parHandle.cy + 40, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const parAfter = await page.evaluate(function () {
        const stored = window.db.__get('tournaments/t1/printScorecards');
        const td = document.querySelector('.tnpc-block[data-tnpc-block="par"] td');
        return {
            saved: stored && stored.rows && stored.rows.par && stored.rows.par.heightMm || null,
            rowH: td ? td.getBoundingClientRect().height : 0
        };
    });
    check('ручка ↕ растягивает блок «Пар» (высота строк растёт и сохраняется)',
        parAfter.saved !== null && parAfter.rowH > parBefore + 10,
        'сохранено ' + parAfter.saved + ' мм, ' + Math.round(parBefore) + 'px → ' + Math.round(parAfter.rowH) + 'px');
    // вернём цвета карточки по умолчанию
    await page.click('[data-tnm-act="tnpc-design-reset"]');
    await page.waitForTimeout(300);

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
    // Стартовый лист в заглушке сохранён без привязки к раундам групп —
    // вкладка обязана пересобрать её сама, иначе QR ведёт в никуда.
    await page.waitForFunction(function () {
        const sheet = window.db.__get('tournaments/t1/sheets/r1') || {};
        const entries = sheet.entries || {};
        return Object.keys(entries).length > 0 && Object.keys(entries).every(function (pid) {
            return !!entries[pid].groupRoundId && !!entries[pid].markerPlayerId;
        });
    }, null, { timeout: 8000 });
    const healed = await page.evaluate(function () {
        const sheet = window.db.__get('tournaments/t1/sheets/r1') || {};
        const entries = sheet.entries || {};
        const pids = Object.keys(entries);
        const rounds = {};
        pids.forEach(function (pid) { rounds[entries[pid].groupRoundId] = window.db.__get('rounds/' + entries[pid].groupRoundId); });
        const gid = pids.length ? entries[pids[0]].groupRoundId : '';
        return {
            linked: pids.every(function (pid) { return !!entries[pid].qr; }),
            modeGroup: Object.keys(rounds).every(function (id) { return !!rounds[id] && rounds[id].mode === 'group'; }),
            assignment: !!(gid && rounds[gid] && rounds[gid].markerAssignments && Object.keys(rounds[gid].markerAssignments).length),
            gid: gid
        };
    });
    check('карточки получают привязку к раунду ввода счёта из стартового листа',
        healed.linked && healed.modeGroup && healed.assignment, JSON.stringify(healed));
    // Персональный QR совпадает с QR листа и открывает игрока карточки как «Я».
    // Назначение его маркера сохраняется отдельно.
    const qrPlayer = await page.evaluate(function () {
        const img = document.querySelector('.tnpc-overlay[data-type="qr"] img[data-qr]');
        if (!img) return { ok: false, why: 'нет QR' };
        const src = img.getAttribute('src') || '';
        const raw = src.split(/[?&]data=/)[1] || '';
        const payload = decodeURIComponent(raw.replace(/&amp;.*$/, ''));
        const sheet = window.db.__get('tournaments/t1/sheets/r1') || {};
        const entries = sheet.entries || {};
        const subject = Object.keys(entries).filter(function (pid) { return entries[pid].qr === payload; })[0];
        if (!subject) return { ok: false, why: 'ссылка не совпадает с QR листа: ' + payload };
        const entry = entries[subject];
        const round = window.db.__get('rounds/' + entry.groupRoundId) || {};
        const as = decodeURIComponent((payload.match(/[?&]as=([^&#]+)/) || [])[1] || '');
        const assignment = (round.markerAssignments || {})[entry.markerPlayerId];
        return {
            ok: subject === as && !!round.players[as] && round.players[as].name === entry.playerName &&
                !!assignment && assignment.targetId === subject &&
                payload.indexOf('setup-round.html') !== -1 && payload.indexOf('round=' + entry.groupRoundId) !== -1,
            subject: subject, marker: entry.markerPlayerId, as: as,
            target: assignment && assignment.targetId, payload: payload
        };
    });
    check('QR карточки выбирает игрока с тем же ФИО как Я, не меняя назначение маркера',
        qrPlayer.ok, JSON.stringify(qrPlayer));

    // Замена логотипа через панель должна обновить и превью, и общий источник.
    await page.locator('#tnpc-logo-file').setInputFiles({
        name: 'logo-one.svg', mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#d22"/></svg>')
    });
    await page.waitForFunction(function () {
        const saved = window.db.__get('tournaments/t1/printScorecards');
        return !!(saved && saved.logoSrc);
    }, null, { timeout: 5000 });
    const firstLogo = await page.evaluate(function () {
        const saved = window.db.__get('tournaments/t1/printScorecards');
        return saved && saved.logoSrc || '';
    });
    check('загруженный логотип появился в общем источнике', firstLogo.indexOf('data:image/svg+xml;base64,') === 0);
    await page.click('[data-tnm-act="tnpc-overlay-src"][data-id="logo"]');
    await page.locator('#tnpc-image-file').setInputFiles({
        name: 'logo-two.svg', mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#26c"/></svg>')
    });
    await page.waitForFunction(function (previous) {
        const saved = window.db.__get('tournaments/t1/printScorecards');
        const img = document.querySelector('.tnpc-overlay[data-overlay-id="logo"] img');
        return !!(saved && saved.logoSrc && saved.logoSrc !== previous && img && img.getAttribute('src') === saved.logoSrc);
    }, firstLogo, { timeout: 5000 });
    const replacedLogo = await page.evaluate(function () {
        const saved = window.db.__get('tournaments/t1/printScorecards');
        const img = document.querySelector('.tnpc-overlay[data-overlay-id="logo"] img');
        return { source: saved && saved.logoSrc || '', rendered: img && img.getAttribute('src') || '' };
    });
    check('повторная загрузка логотипа заменяет прежний в превью и базе',
        !!replacedLogo.source && replacedLogo.source !== firstLogo && replacedLogo.rendered === replacedLogo.source,
        replacedLogo.source.slice(0, 48));

    // 8. Печать: подписи «Игрок / Маркер / Судья» не попадают на бумагу.
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
    check('внешняя рамка карточки на печать не идёт', printed.indexOf('.tnpc-card{border:0!important}') !== -1);
    check('фора в печати — наклонными черточками в углу клетки счёта',
        printed.indexOf('<i class="tnpc-mark"></i>') !== -1 &&
        printed.indexOf('.tnpc-marks{position:absolute;top:.15mm;right:.15mm') !== -1);
    const marksWide = await page.evaluate(function () {
        const cell = document.querySelector('.tnpc-empty .tnpc-marks');
        if (!cell) return null;
        const box = cell.getBoundingClientRect();
        const parent = cell.parentNode.getBoundingClientRect();
        return { inTopRight: box.right >= parent.right - 3 && box.top <= parent.top + 3 };
    });
    check('черточки стоят в правом верхнем углу клетки счёта',
        !!marksWide && marksWide.inTopRight, JSON.stringify(marksWide));
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
