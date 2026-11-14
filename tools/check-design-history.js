#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter(a => a !== '--single-process'), headless: true,
        env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined });
    try {
        for (const width of [320, 390, 768, 1280]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/*', async route => {
                const url = new URL(route.request().url());
                const file = path.join(root, url.pathname.slice(1));
                if (url.hostname === 'history.test' && url.pathname.startsWith('/img/design-history/') && fs.existsSync(file)) {
                    return route.fulfill({ body: fs.readFileSync(file), contentType: 'image/jpeg' });
                }
                return route.abort();
            });
            // Isolated admin fixture, not an authentication bypass shipped to users.
            await page.goto('about:blank');
            const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace('<head>', '<head><base href="http://history.test/">');
            await page.setContent(html);
            for (const file of ['style.css', 'theme-v2.css', 'clarity.css', 'design-history.css']) await page.addStyleTag({ path: path.join(root, 'css', file) });
            await page.evaluate(() => {
                document.getElementById('admin-login').classList.add('hidden');
                document.getElementById('admin-content').classList.remove('hidden');
                document.querySelectorAll('.admin-section').forEach(el => el.classList.add('hidden'));
                document.getElementById('tab-designhistory').classList.remove('hidden');
            });
            await page.addScriptTag({ path: path.join(root, 'js/design-history-data.js') });
            await page.addScriptTag({ path: path.join(root, 'js/admin-design-history.js') });
            await page.evaluate(() => pestovoRenderDesignHistory());
            await page.locator('#dh-range').selectOption('101-187');
            assert((await page.locator('#dh-summary').textContent()).includes('87 из 187'));
            await page.locator('#dh-search').fill('187');
            assert.strictEqual(await page.locator('.dh-card').count(), 1);
            const image = page.locator('.dh-image-button img').first();
            await image.scrollIntoViewIfNeeded();
            await image.evaluate(el => el.decode());
            assert(await image.evaluate(el => el.naturalWidth === 430), 'real historical screenshot loaded');
            assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), 'gallery fits ' + width);
            await page.locator('.dh-image-button').first().click();
            assert(await page.locator('#dh-dialog').isVisible());
            assert(await page.locator('#dh-dialog-next').isDisabled(), 'filtered boundary respected');
            await page.locator('#dh-dialog-screen').click();
            assert((await page.locator('#dh-dialog-image').getAttribute('src')).endsWith('scoring.jpg'));
            await page.keyboard.press('Escape');
            assert(!await page.locator('#dh-dialog').isVisible(), 'native Escape closes modal');
            assert(await page.locator('.dh-image-button').first().evaluate(el => el === document.activeElement), 'focus restored');
            await page.locator('#dh-reset').click();
            assert.strictEqual(await page.locator('.dh-card').count(), 12);
            assert.strictEqual(await page.locator('#dh-range').inputValue(), 'all');
            await page.evaluate(() => document.body.classList.add('sun-mode'));
            assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), 'light gallery fits ' + width);
            await page.waitForTimeout(400);
            if (width === 1280) await page.screenshot({ path: '/tmp/design-history-gallery.png' });
            assert.deepStrictEqual(errors, []);
            await page.close();
        }
        console.log('PASS: design-history gallery at 320/390/768/1280px, real images, search, dialog, keyboard and focus');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
