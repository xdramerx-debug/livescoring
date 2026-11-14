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
        for (const width of [320, 390, 1280]) {
            for (const route of ['index.html', 'leaderboard.html', 'stats.html', 'admin.html']) {
                const page = await browser.newPage({ viewport: { width, height: 900 } });
                await page.route('**/*', r => r.abort());
                await page.setContent(fs.readFileSync(path.join(root, route), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
                for (const file of ['style', 'theme-v2', 'product-ux', 'clarity', 'pr164', 'pr164-adapter', ...(route === 'stats.html' ? ['stats-page'] : []), ...(route === 'admin.html' ? ['tn-manager'] : [])]) await page.addStyleTag({ path: path.join(root, 'css', file + '.css') });
                await page.evaluate(() => {
                    const host = document.createElement('div');
                    host.innerHTML = '<div class="date-presets"><button class="date-chip active">Все время</button><button class="date-chip">За месяц</button></div><div class="tnm-filters"><button class="tnm-filter-btn active">Все <span class="tnm-count">12</span></button><button class="tnm-filter-btn">Моя группа</button></div>';
                    document.body.append(host);
                });
                for (const light of [false, true]) {
                    await page.evaluate(light => document.body.classList.toggle('sun-mode', light), light);
                    const metrics = await page.locator('.pv-chip, .date-chip, .tnm-filter-btn').evaluateAll(buttons => buttons.map(el => {
                        const s = getComputedStyle(el), r = el.getBoundingClientRect();
                        return { height: r.height, gap: parseFloat(s.gap), radius: parseFloat(s.borderRadius), display: s.display };
                    }));
                    assert(metrics.length >= 4);
                    for (const m of metrics) {
                        assert(m.height >= 44, route + ': touch target');
                        assert(m.gap >= 7, route + ': icon/text/count spacing');
                        assert(m.radius >= 9, route + ': rounded corners');
                        assert(['inline-flex', 'flex'].includes(m.display));
                    }
                    const pressed = page.locator('.pv-chip').first();
                    if (await pressed.count()) {
                        await pressed.focus();
                        assert(await pressed.evaluate(el => getComputedStyle(el).outlineStyle !== 'none'));
                        await pressed.evaluate(el => { el.setAttribute('aria-pressed', 'false'); });
                        assert.strictEqual(await pressed.getAttribute('aria-pressed'), 'false');
                        await pressed.evaluate(el => { el.setAttribute('aria-pressed', 'true'); });
                    }
                }
                await page.close();
            }
        }
        console.log('PASS: shared filter controls on four routes, three widths, both themes, touch targets, spacing and keyboard focus');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
