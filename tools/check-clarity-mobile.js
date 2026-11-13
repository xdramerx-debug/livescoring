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
        for (const width of [320, 390, 768]) {
            for (const name of ['index.html', 'players.html', 'leaderboard.html', 'setup-round.html', 'scorer.html', 'marker.html', 'auth.html', 'handicap.html', 'qr-start.html']) {
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
                if (name === 'index.html') {
                    const top = await page.locator('.hero').evaluate(el => el.getBoundingClientRect().top);
                    assert(top >= 60, 'Home content clears fixed header');
                }
                if (['scorer.html', 'marker.html', 'setup-round.html'].includes(name)) {
                    const pad = page.locator('.score-pad').first();
                    assert(!await pad.isVisible(), 'Quick input starts collapsed');
                    await pad.locator('..').locator('summary').click();
                    assert(await pad.isVisible(), 'Quick input remains available');
                }
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
                assert(!overflow, name + ' fits ' + width + 'px');
                assert.deepStrictEqual(errors, [], name + ': no runtime errors');
                await page.close();
            }
        }
        console.log('PASS: clarity layer on 9 routes × 3 widths, search, score input, home offset and no overflow');
    } finally { await browser.close(); }
}()).catch(error => { console.error(error); process.exit(1); });
