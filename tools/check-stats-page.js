#!/usr/bin/env node
'use strict';
// Isolated dashboard fixtures: no Firebase/network writes or live player data.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter(a => a !== '--single-process'), headless: true, env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined });
    try {
        for (const width of [320, 390, 768, 1440]) {
            const page = await browser.newPage({ viewport: { width, height: 1000 } });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/*', route => route.abort());
            await page.setContent(fs.readFileSync(path.join(root, 'stats.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
            for (const style of ['style', 'theme-v2', 'design-presets', 'product-ux', 'clarity', 'pr164', 'pr164-adapter', 'stats-page']) await page.addStyleTag({ path: path.join(root, 'css', style + '.css') });
            await page.addScriptTag({ content: `
                window.currentLang = 'ru'; window.initNav = function(){};
                window.escapeHtml = function(s){var el=document.createElement('span');el.textContent=s;return el.innerHTML;};
                window.holePar = function(){return 4;};
                window.t = function(k){return k;};
                window.fixture = {};
                for(var i=0;i<4;i++) fixture['r'+i]={status:'completed',format:'Stroke Play',createdAt:Date.now(),players:{u:{name:'Александр Константинопольский',scores:Object.fromEntries(Array.from({length:18},function(_,h){return [h+1, h%3===0?3:4];}))}}};
                window.db = {ref:function(key){return {once:function(){return Promise.resolve({val:function(){return key==='rounds'?window.fixture:{u:{name:'Александр'}};}});}};}};
            ` });
            await page.addScriptTag({ path: path.join(root, 'js/stats.js') });
            for (const light of [false, true]) {
                await page.evaluate(light => document.body.classList.toggle('sun-mode', light), light);
                for (const variant of ['1', '2', '3']) {
                    await page.evaluate(async variant => { window.getStatsDisplayVariant = () => variant; await loadStats(); }, variant);
                    assert.strictEqual(await page.locator('#general-stats details').count(), 0);
                    assert(await page.locator('#stats-date-from').isVisible());
                    assert.strictEqual(await page.locator('#general-stats').getByText('Всего раундов', { exact: true }).count(), 1);
                    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
                    assert(!overflow, `no horizontal page overflow: ${width} / ${variant} / light=${light}`);
                    if (variant === '1' && !light) await page.screenshot({ path: '/tmp/stats-redesign-' + width + '.png', fullPage: true });
                }
            }
            await page.evaluate(async () => { window.fixture = {}; window.getStatsDisplayVariant = () => '1'; await loadStats(true); });
            assert(await page.locator('#top-players .empty').isVisible());
            assert.strictEqual(await page.locator('#general-stats .stat').count(), 10);
            assert.deepStrictEqual(errors, []);
            await page.close();
        }
        console.log('PASS: redesigned stats, four widths, both themes, all three admin variants, populated/empty samples, no page overflow');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
