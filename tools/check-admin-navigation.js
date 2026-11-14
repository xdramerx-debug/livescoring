#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
(async () => {
    const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter(a => a !== '--single-process'), headless: true, env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined });
    try {
        for (const width of [320, 390, 768, 1280]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            await page.route('**/*', r => r.abort());
            await page.setContent(fs.readFileSync(path.join(root, 'admin.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
            for (const css of ['style', 'theme-v2', 'design-presets', 'tn-manager', 'clarity', 'pr164', 'pr164-adapter', 'admin-navigation']) await page.addStyleTag({ path: path.join(root, 'css', css + '.css') });
            await page.evaluate(() => {
                document.getElementById('admin-content').classList.remove('hidden');
                window.seRender = function () {};
                window.pushAdminRefreshStatus = function () {};
            });
            const source = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');
            await page.addScriptTag({ content: source.slice(source.indexOf('function switchAdminGroup('), source.indexOf('function switchTab(t,')) + '\nwindow.switchTab = function(t,b){switchTabApply(t,b);};' });
            await page.evaluate(() => {
                document.querySelectorAll('.admin-nav button').forEach(b => b.addEventListener('click', () => window[b.dataset.act](b.dataset.arg, b)));
            });
            for (const light of [false, true]) {
                await page.evaluate(light => document.body.classList.toggle('sun-mode', light), light);
                for (const group of ['ops', 'tournaments', 'people', 'look', 'system']) {
                    await page.locator('.admin-nav-group[data-arg="' + group + '"]').click();
                    assert.strictEqual(await page.locator('.admin-tabs:not(.hidden)').count(), 1);
                    assert.strictEqual(await page.locator('.admin-nav-group[aria-pressed="true"]').count(), 1);
                    const tabs = page.locator('.admin-tabs[data-admin-group="' + group + '"] .admin-tab');
                    for (let i = 0; i < await tabs.count(); i++) {
                        const tab = tabs.nth(i);
                        const key = await tab.getAttribute('data-arg');
                        await tab.click();
                        assert(!(await page.locator('#tab-' + key).getAttribute('class')).split(' ').includes('hidden'), key + ' panel opens');
                        assert.strictEqual(await tab.getAttribute('aria-pressed'), 'true');
                        assert.strictEqual(await page.locator('.admin-tab[aria-pressed="true"]').count(), 1);
                    }
                }
                await page.locator('.admin-nav-group[data-arg="look"]').click();
                await page.locator('.admin-tab[data-arg="scorecards"]').click();
                const overlaps = await page.locator('.sev-variants .sev-card').evaluateAll(cards => cards.some(card => {
                    const box = card.getBoundingClientRect(), desc = card.querySelector('.sev-card-desc').getBoundingClientRect();
                    return desc.bottom > box.bottom + 1;
                }));
                assert(!overlaps, 'variant descriptions contained at ' + width);
                assert.strictEqual(await page.locator('.admin-nav details').count(), 0);
                const overflow = await page.locator('.admin-nav').evaluate(el => el.scrollWidth > el.clientWidth + 1);
                assert(!overflow, 'menu stays in its container at ' + width);
                if (!light) await page.screenshot({ path: '/tmp/admin-navigation-' + width + '.png', fullPage: true });
            }
            await page.close();
        }
        console.log('PASS: all admin groups/tools switch to correct panels; pressed states, visible tools, contained descriptions, four widths and both themes');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
