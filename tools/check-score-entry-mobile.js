#!/usr/bin/env node
'use strict';
// Offline Chromium integration: real page markup, no production database requests.
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
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
        await page.goto('http://entry.test');
        await page.addStyleTag({ path: path.join(root, 'css/style.css') });
        for (const file of ['course-config', 'date-range', 'dom', 'format', 'i18n', 'utils', 'admin-display']) {
            await page.addScriptTag({ path: path.join(root, 'js', file + '.js') });
        }
        const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
        await page.evaluate(html => {
            document.body.innerHTML = html.replace('admin-section hidden', 'admin-section');
            document.body.style.padding = '8px';
            currentLang = 'ru';
            window.calls = [];
            window.failSave = false;
            window.db = { ref: path => ({ update: value => { calls.push({ path, value }); return failSave ? Promise.reject(new Error('Denied')) : Promise.resolve(); } }) };
            renderScoreEntryPreview();
        }, admin.slice(admin.indexOf('<div id="tab-scorecards"'), admin.indexOf('<div id="tab-rounds"')));
        await page.evaluate(() => initP0MobileEnhancements());
        assert.strictEqual(await page.locator('#p0-sticky-actions').count(), 0, 'Preview never creates global sticky controls');
        for (const width of [320, 390, 430]) {
            await page.setViewportSize({ width, height: 844 });
            for (const mode of ['group', 'solo', 'marker']) {
                await page.selectOption('#score-entry-mode', mode);
                for (const view of ['1', '2', '3', '4', '5']) {
                    await page.click('#v5-scoring-' + view);
                    assert.strictEqual(await page.getAttribute('#score-entry-preview .score-entry', 'data-entry-view'), view);
                    assert.strictEqual(await page.locator('#score-entry-preview .hole-btn').count(), 18);
                    const geometry = await page.evaluate(() => ({
                        overflow: document.documentElement.scrollWidth > innerWidth,
                        fits: Array.from(document.querySelectorAll('#score-entry-preview .hm-bar, #score-entry-preview .hcp-badge')).every(el => {
                            const b = el.getBoundingClientRect(), s = el.closest('.entry-score-square').getBoundingClientRect();
                            return b.left >= s.left && b.right <= s.right && b.top >= s.top && b.bottom <= s.bottom;
                        })
                    }));
                    assert.deepStrictEqual(geometry, { overflow: false, fits: true }, width + '/' + mode + '/' + view);
                }
            }
        }
        await page.click('#score-entry-order [data-move-key="input"][data-delta="-1"]');
        await page.click('#score-entry-order [data-move-key="input"][data-delta="-1"]');
        assert.deepStrictEqual(await page.locator('#score-entry-preview [data-entry-block]').evaluateAll(nodes => nodes.map(n => n.dataset.entryBlock)), ['input', 'info', 'holes']);
        assert.strictEqual(await page.evaluate(() => calls.length), 0, 'Preview/reorder never writes');
        await page.click('#score-entry-apply');
        await page.waitForFunction(() => !scoreEntrySaving);
        assert.deepStrictEqual(await page.evaluate(() => calls[0]), { path: 'settings', value: { scoring_view: '5', scoring_order: ['input', 'info', 'holes'] } });
        assert.strictEqual(await page.evaluate(() => getScoringView()), '5');
        await page.evaluate(() => { failSave = true; });
        await page.click('#v5-scoring-2');
        await page.click('#score-entry-apply');
        await page.waitForFunction(() => !scoreEntrySaving);
        assert.match(await page.textContent('#score-entry-status'), /Не удалось/);
        assert.strictEqual(await page.evaluate(() => getScoringView()), '5', 'Denied save leaves active view unchanged');
        assert.strictEqual(await page.isDisabled('#score-entry-apply'), false);
        assert.deepStrictEqual(await page.evaluate(() => normalizeScoreEntryOrder(['bad', 'input', 'input'])), ['input', 'info', 'holes']);
        if (process.env.ENTRY_SCREENSHOT) {
            await page.selectOption('#score-entry-mode', 'group');
            await page.click('#v5-scoring-1');
            await page.locator('#score-entry-preview').screenshot({ path: process.env.ENTRY_SCREENSHOT });
        }
        // Actual page wrappers, order and handlers are preserved on live updates.
        for (const file of ['setup-round.html', 'scorer.html', 'marker.html']) {
            await page.evaluate(html => {
                const parsed = new DOMParser().parseFromString(html, 'text/html');
                document.body.innerHTML = '';
                parsed.querySelectorAll('.score-entry').forEach(el => document.body.appendChild(el));
                document.querySelectorAll('.hole-nav').forEach(el => {
                    el.innerHTML = '<button class="hole-btn" onclick="window.entryClick=(window.entryClick||0)+1">' + entryHoleContentHTML(12, 5, 1, 54) + '</button>';
                });
                document.querySelectorAll('.score-disp').forEach(el => { el.innerHTML = scoreSquareHTML(12, 1, -54); });
                syncScoreEntryLayouts();
            }, fs.readFileSync(path.join(root, file), 'utf8'));
            const expectedCount = file === 'setup-round.html' ? 2 : 1;
            assert.strictEqual(await page.locator('.score-entry').count(), expectedCount);
            for (const width of [320, 390, 430]) {
            await page.setViewportSize({ width, height: 844 });
            for (const view of ['1', '2', '3', '4', '5']) {
                await page.evaluate(v => { applyView5('scoring', v); applyScoreEntryOrder(['holes', 'input', 'info']); }, view);
                assert.strictEqual(await page.getAttribute('.score-entry', 'data-entry-view'), view);
                assert.deepStrictEqual(await page.locator('.score-entry').first().locator(':scope > [data-entry-block]').evaluateAll(nodes => nodes.map(n => n.dataset.entryBlock)), ['holes', 'input', 'info']);
                assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, file + '/' + view);
            }
            }
            await page.locator('.hole-btn').first().click();
        }
        assert.strictEqual(await page.evaluate(() => window.entryClick), 3, 'Reordering preserves interactive buttons');
        assert.deepStrictEqual(errors, []);
        console.log('PASS: input previews (5 views × 3 modes × 3 widths), atomic save/failure, hierarchy, live page layouts and handlers');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
