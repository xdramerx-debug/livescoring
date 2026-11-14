#!/usr/bin/env node
'use strict';
// Real browser, local static resources, no Firebase or external requests.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter(a => a !== '--single-process'), headless: true, env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined });
    try {
        for (const width of [390, 1280]) {
            for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
                const page = await browser.newPage({ viewport: { width, height: 900 } });
                const errors = [];
                page.on('pageerror', e => errors.push(e.message));
                await page.route('**/*', route => {
                    const url = new URL(route.request().url());
                    const asset = path.join(root, url.pathname.slice(1));
                    if (url.hostname !== 'ui.test' || !asset.startsWith(root + '/') || !fs.existsSync(asset) || !fs.statSync(asset).isFile()) return route.abort();
                    if (route.request().resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(asset, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '') });
                    return route.fulfill({ path: asset });
                });
                await page.goto('http://ui.test/' + file);
                await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
                await page.evaluate(() => { localStorage.setItem('pestovo_lang', 'en'); });
                await page.addScriptTag({ path: path.join(root, 'js/i18n.js') });
                await page.addScriptTag({ path: path.join(root, 'js/clarity.js') });
                await page.evaluate(() => { currentLang = 'en'; document.documentElement.lang = 'en'; applyTranslations(); });
                for (const light of [false, true]) {
                    await page.evaluate(light => {
                        document.body.classList.toggle('sun-mode', light);
                        const nav = document.getElementById('main-nav');
                        if (nav) document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px');
                    }, light);
                    assert.strictEqual(await page.locator('html').getAttribute('lang'), 'en');
                    const missed = await page.locator('[data-i18n]').evaluateAll(nodes => nodes.filter(n => !n.closest('script,style') && /[а-яё]/i.test(n.textContent)).map(n => n.getAttribute('data-i18n')));
                    assert.deepStrictEqual(missed, [], file + ': English translation values');
                    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
                    assert(!overflow, file + ': no page overflow at ' + width + ' / light=' + light);
                    if (light && file === 'tournaments.html') {
                        await page.evaluate(() => {
                            const el = document.createElement('div');
                            el.id = 'theme-fixture';
                            el.innerHTML = '<div class="tn-search">Search</div><article class="tn-public-card"><h3>Tournament</h3><span class="tn-public-badge completed">Completed</span></article><div class="tn-detail-hero">Details</div>';
                            document.body.append(el);
                        });
                        const surfaces = await page.locator('#theme-fixture > *').evaluateAll(nodes => nodes.map(n => ({ bg: getComputedStyle(n).backgroundColor, color: getComputedStyle(n).color })));
                        for (const surface of surfaces) {
                            assert.strictEqual(surface.bg, 'rgb(255, 255, 255)', 'new tournament surface is light');
                            assert.notStrictEqual(surface.color, 'rgb(255, 255, 255)', 'dark text on light surface');
                        }
                    }
                    if (light && ['stats.html', 'index.html', 'tournaments.html', 'admin.html'].includes(file)) await page.screenshot({ path: '/tmp/light-en-' + file.replace('.html', '') + '-' + width + '.png', fullPage: true });
                }
                await page.evaluate(() => { currentLang = 'ru'; document.documentElement.lang = 'ru'; applyTranslations(); });
                assert.strictEqual(await page.locator('html').getAttribute('lang'), 'ru', 'language can switch back');
                assert.deepStrictEqual(errors, [], file + ': no browser errors');
                await page.close();
            }
        }
        console.log('PASS: all root HTML routes, English/Russian switching, light/dark, 390/1280px, local assets, no overflow or browser errors, tournament surfaces');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
