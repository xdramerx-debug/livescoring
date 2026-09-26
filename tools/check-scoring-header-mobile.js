#!/usr/bin/env node
'use strict';
// Real markup/CSS and QR rendering, with all network requests isolated from Firebase.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');

(async () => {
    const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args, headless: true,
        env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined });
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        for (const scenario of ['group', 'solo', 'group-qr', 'scorer-qr']) {
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
            const scorer = scenario === 'scorer-qr';
            const file = scorer ? 'scorer.html' : 'setup-round.html';
            await page.goto('http://scoring.test/' + file + (scenario.endsWith('-qr') ? '?round=test&' + (scorer ? 'player' : 'as') + '=p1' : '?round=test'));
            await page.evaluate(html => {
                const parsed = new DOMParser().parseFromString(html, 'text/html');
                parsed.querySelectorAll('script').forEach(el => el.remove());
                document.body.innerHTML = parsed.body.innerHTML;
            }, fs.readFileSync(path.join(root, file), 'utf8'));
            await page.addStyleTag({ path: path.join(root, 'css/style.css') });
            for (const script of ['course-config', 'date-range', 'dom', 'format', 'i18n', 'utils', scorer ? 'scorer' : 'live']) {
                await page.addScriptTag({ path: path.join(root, 'js', script + '.js') });
            }
            await page.evaluate(() => {
                currentLang = 'ru';
                localStorage.clear();
                window.scrollTo({ top: 0, behavior: 'instant' });
                applyNavHeight();
                window.normalHeaderHeight = document.querySelector('.page-head').getBoundingClientRect().height;
                document.body.classList.add('round-active');
                document.querySelector('.page-head').classList.add('scoring-compact');
                document.querySelector('.page-title').textContent = 'Кубок Пестово · Лунка 12';
                document.querySelector('.page-sub').textContent = 'Ввод счёта · 4 игрока';
                applyScoreKiosk();
                applyNavHeight();
                // Keep real page containers; enable the active scoring panel without a DB.
                document.querySelectorAll('.score-entry').forEach(el => {
                    for (let parent = el; parent && parent !== document.body; parent = parent.parentElement) parent.classList.remove('hidden');
                });
                const setup = document.getElementById('setup');
                if (setup) setup.classList.add('hidden');
                const mode = document.getElementById('mode-view');
                if (mode) mode.classList.add('hidden');
            });
            for (const width of [320, 390, 430, 1024]) {
                await page.setViewportSize({ width, height: 844 });
                await page.evaluate(() => { window.scrollTo({ top: 0, behavior: 'instant' }); applyNavHeight(); });
                const geometry = await page.evaluate(() => {
                    const nav = document.getElementById('main-nav').getBoundingClientRect();
                    const head = document.querySelector('.page-head').getBoundingClientRect();
                    const main = document.querySelector('main').getBoundingClientRect();
                    return { navVisible: nav.height > 0, headVisible: head.height > 0,
                        compact: head.height < normalHeaderHeight,
                        noOverlap: head.top >= nav.bottom - 1 && main.top >= head.bottom - 1,
                        overflow: document.documentElement.scrollWidth > innerWidth };
                });
                assert.deepStrictEqual(geometry, { navVisible: true, headVisible: true, compact: true, noOverlap: true, overflow: false }, scenario + '/' + width);
                if (width < 768) assert(await page.locator('#nav-toggle').isVisible(), 'Mobile navigation remains available');
                await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
                assert(await page.locator('.page-head').evaluate(el => {
                    const head = el.getBoundingClientRect();
                    return head.top >= document.getElementById('main-nav').getBoundingClientRect().bottom - 1 && head.bottom < innerHeight;
                }), 'Compact header remains visible while scrolling: ' + scenario);
            }
            if (!scorer && scenario !== 'solo') {
                await page.evaluate(() => {
                    curRid = 'test'; myUid = 'p1'; canEditGroup = true;
                    curRoundData = { status: 'active', players: { p1: { name: 'Создатель', isCreator: true }, p2: { name: 'Игрок', joined: false } } };
                    renderInviteQRs();
                });
                assert(await page.locator('#invite-qrs-card').isVisible());
                assert(await page.locator('#invite-qrs-panel').isVisible());
                assert.strictEqual(await page.locator('#invite-qrs-grid .qr-card').count(), 2, 'Creator also has a reconnect QR');
                await page.evaluate(() => { curRoundData.players.p2.joined = true; applyScoreKiosk(); renderInviteQRs(); });
                assert(await page.locator('#invite-qrs-panel').isVisible(), 'Joining must not auto-collapse QR codes');
                assert.strictEqual(await page.locator('#invite-qrs-grid .qr-joined').count(), 2);
                await page.evaluate(() => { curRoundData.players.p2.scores = { 1: 4 }; applyScoreKiosk(); renderInviteQRs(); });
                assert(await page.locator('#invite-qrs-panel').isVisible(), 'Score updates preserve QR visibility');
                await page.evaluate(() => { toggleInviteQRs(); renderInviteQRs(); });
                assert(!(await page.locator('#invite-qrs-panel').isVisible()), 'Explicit collapse is respected');
                assert(await page.locator('#invite-qrs-card').isVisible(), 'Reconnect button remains available');
                await page.evaluate(() => toggleInviteQRs());
                assert(await page.locator('#invite-qrs-panel').isVisible());
                await page.evaluate(() => { lastInviteSig = null; applyScoreKiosk(); renderInviteQRs(); });
                assert(await page.locator('#invite-qrs-panel').isVisible(), 'Restored round keeps QR access');
            }
            assert.deepStrictEqual(errors, [], scenario);
            await page.close();
        }
        console.log('PASS: compact scoring headers/menu (4 modes × 4 widths), scroll, persistent QR codes and explicit collapse');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
