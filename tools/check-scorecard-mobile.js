#!/usr/bin/env node
'use strict';
// Real Chromium, deterministic data; never connects to the production database.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const chromiumBinary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');

(async function() {
    const browser = await chromium.launch({ executablePath: await chromiumBinary.executablePath(), args: chromiumBinary.args, headless: true, env: process.env.CHROMIUM_EXTRA_LIBS ? Object.assign({}, process.env, { LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS }) : undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
        await page.goto('http://scorecard.test');
        await page.addStyleTag({ path: path.join(root, 'css/style.css') });
        for (const file of ['course-config', 'date-range', 'dom', 'format', 'i18n', 'utils', 'admin-display']) {
            await page.addScriptTag({ path: path.join(root, 'js', file + '.js') });
        }
        const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
        const fragment = admin.slice(admin.indexOf('<div id="tab-scorecards"'), admin.indexOf('<div id="tab-rounds"'));
        await page.evaluate(html => {
            document.body.innerHTML = html.replace('admin-section hidden', 'admin-section');
            document.body.style.padding = '8px';
            currentLang = 'ru';
            window.saveCalls = [];
            window.failSave = false;
            window.db = { ref: path => ({ set: value => { saveCalls.push({ path, value }); return failSave ? Promise.reject(new Error('Denied')) : Promise.resolve(); } }) };
            renderClubScorecardPreview();
        }, fragment);
        for (const width of [320, 390, 430]) {
            await page.setViewportSize({ width, height: 844 });
            for (const variant of ['1', '2', '3', '4', '5']) {
                await page.click('#v5-scorecard-' + variant);
                assert.strictEqual(await page.getAttribute('#club-sc-preview .club-sc', 'data-sc-view'), variant);
                assert.strictEqual(await page.locator('#club-sc-preview [data-sc-hole]').count(), 18);
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
                assert.strictEqual(overflow, false, 'No page overflow: ' + width + '/' + variant);
                assert.strictEqual(await page.locator('#club-sc-preview .hm-bar').first().isVisible(), true);
                assert.strictEqual(await page.getAttribute('#v5-scorecard-' + variant, 'aria-pressed'), 'true');
                const measured = await page.evaluate(() => {
                    const scroll = document.querySelector('.club-sc-scroll');
                    return { client: scroll.clientWidth, scroll: scroll.scrollWidth };
                });
                assert.strictEqual(measured.scroll > measured.client + 1, variant === '3', 'Only large tape scrolls horizontally: ' + width + '/' + variant);
            }
        }
        assert.strictEqual(await page.evaluate(() => saveCalls.length), 0, 'Preview does not write global settings');
        await page.click('#club-sc-apply');
        await page.waitForFunction(() => !clubScorecardSaving);
        assert.deepStrictEqual(await page.evaluate(() => saveCalls[0]), { path: 'settings/scorecard_view', value: '5' });
        assert.strictEqual(await page.evaluate(() => getRoundScorecardView()), '5');
        // Other cards update live, but an un-applied admin preview stays selected.
        await page.evaluate(() => {
            const host = document.createElement('div');
            host.id = 'public-card';
            host.innerHTML = renderClubScorecard({ name: 'Player', tee: 'bl', scores: {}, fieldHcp: -18 }, { holeRange: '1-9' });
            document.body.appendChild(host);
            applyView5('scorecard', '2');
        });
        assert.strictEqual(await page.getAttribute('#public-card .club-sc', 'data-sc-view'), '2');
        assert.strictEqual(await page.getAttribute('#club-sc-preview .club-sc', 'data-sc-view'), '5');
        await page.evaluate(() => { failSave = true; });
        await page.click('#v5-scorecard-4');
        await page.click('#club-sc-apply');
        await page.waitForFunction(() => !clubScorecardSaving);
        assert.strictEqual(await page.evaluate(() => getRoundScorecardView()), '2', 'Failed write leaves global selection intact');
        assert.match(await page.textContent('#club-sc-save-status'), /Не удалось/);
        assert.strictEqual(await page.isDisabled('#club-sc-apply'), false);
        assert.deepStrictEqual(errors, []);
        if (process.env.SCORECARD_SCREENSHOT) {
            await page.evaluate(() => previewClubScorecardView('1'));
            await page.locator('#club-sc-preview').screenshot({ path: process.env.SCORECARD_SCREENSHOT });
        }
        console.log('PASS: five mobile layouts at 320/390/430px; preview, global apply, realtime, failed save');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
