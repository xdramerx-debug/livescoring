#!/usr/bin/env node
'use strict';
// Real layout checks for the new progressive-disclosure layer, without external services.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
(async function () {
    const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter(arg => arg !== '--single-process'), headless: true,
        env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined });
    try {
        for (const width of [320, 390, 768, 1280]) {
            for (const name of ['index.html', 'players.html', 'leaderboard.html', 'setup-round.html', 'scorer.html', 'marker.html', 'auth.html', 'stats.html', 'handicap.html', 'qr-start.html']) {
                const page = await browser.newPage({ viewport: { width, height: 844 } });
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                await page.route('**/*', route => route.abort());
                const html = fs.readFileSync(path.join(root, name), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
                await page.setContent(html);
                for (const file of ['style.css', 'theme-v2.css', 'product-ux.css', 'design-presets.css', 'clarity.css']) {
                    await page.addStyleTag({ path: path.join(root, 'css', file) });
                }
                // Reveal score-entry fixtures; no score-writing modules are loaded.
                await page.evaluate(() => {
                    ['sc-body', 'mk-body', 'active-scoring-view'].forEach(id => document.getElementById(id)?.classList.remove('hidden'));
                });
                await page.addScriptTag({ path: path.join(root, 'js/clarity.js') });
                assert.strictEqual(await page.locator('html').getAttribute('data-clarity-ready'), 'true');
                if (['players.html', 'leaderboard.html'].includes(name)) {
                    assert(await page.locator('.clarity-search input').isVisible(), name + ': search visible');
                }
                if (['players.html', 'leaderboard.html', 'stats.html', 'handicap.html'].includes(name)) {
                    const gap = await page.evaluate(() => document.querySelector('main').getBoundingClientRect().top - document.querySelector('.page-head').getBoundingClientRect().bottom + parseFloat(getComputedStyle(document.querySelector('main')).paddingTop));
                    assert(gap >= 16 && gap <= 32, name + ': one compact heading-to-content gap (' + gap + ' at ' + width + ')');
                    assert.strictEqual(await page.locator('.pv-skip-link').getAttribute('href'), '#pv-main');
                }
                if (width === 1280 && name === 'index.html') {
                    const more = page.locator('.clarity-nav-more');
                    assert.strictEqual(await more.locator('.clarity-nav-panel > a').count(), 4, 'all secondary routes grouped');
                    await more.locator('summary').focus();
                    await page.keyboard.press('Enter');
                    assert(await more.locator('a[href="stats.html"]').isVisible(), 'keyboard opens secondary navigation');
                    await page.keyboard.press('Escape');
                    assert.strictEqual(await more.evaluate(el => el.open), false, 'Escape closes navigation');
                    assert(await more.locator('summary').evaluate(el => el === document.activeElement), 'focus returns to menu');
                }
                if (name === 'index.html') {
                    const top = await page.locator('.hero').evaluate(el => el.getBoundingClientRect().top);
                    assert(top >= 60, 'Home content clears fixed header');
                }
                if (['scorer.html', 'marker.html', 'setup-round.html'].includes(name)) {
                    const pad = page.locator('.score-pad').first();
                    assert(await pad.isVisible(), 'Number input is visible by default');
                    assert.strictEqual(await page.locator('[data-act="toggleLargeUi"]').first().evaluate(el => el.closest('details')), null, 'large mode is not nested');
                    await page.evaluate(() => {
                        window.scScore = 0; window.mkScore = 0; window.myScore = 0;
                        window.updDisp = function () {}; window.updScoreDisplay = function () {};
                    });
                    await page.addScriptTag({ path: path.join(root, 'js/ui-events.js') });
                    await page.addScriptTag({ path: path.join(root, 'js/score-pad.js') });
                    assert.strictEqual(await page.evaluate(() => scScore + mkScore + myScore), 0, 'no implicit score');
                    await pad.locator('[data-arg="5"]').click();
                    assert.strictEqual(await page.evaluate(() => scScore + mkScore + myScore), 5, 'score 5 entered with one tap');

                }
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
                assert(!overflow, name + ' fits ' + width + 'px');
                await page.evaluate(() => document.body.classList.add('sun-mode'));
                assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), name + ': light theme fits');
                if (name === 'stats.html' && width === 390) await page.screenshot({ path: '/tmp/design-stats-mobile.png', fullPage: true });
                if (name === 'players.html' && width === 1280) await page.screenshot({ path: '/tmp/design-players-desktop.png', fullPage: true });
                assert.deepStrictEqual(errors, [], name + ': no runtime errors');
                await page.close();
            }
        }
        console.log('PASS: clarity layer on 10 routes × 4 widths, search, score input, home offset and no overflow');
    } finally { await browser.close(); }
}()).catch(error => { console.error(error); process.exit(1); });
