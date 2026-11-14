#!/usr/bin/env node
'use strict';
// Compare key visual properties against the immutable PR164 stylesheet, without Firebase.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
const sample = '<div id="visual-sample"><section class="hero"><div class="hero-content"><h1 class="hero-title">Пестово</h1><p class="hero-sub">Карточка</p></div></section><div class="card"><h2>Карточка</h2><button class="btn btn-g">Сохранить</button><input class="form-input" value="12.4"></div><div class="page-head"><h1 class="page-title">Заголовок</h1></div><div class="score-entry"><div class="score-disp">5</div><button class="score-minus">−</button><div class="hole-val">4</div></div></div>';
function measure() {
    const properties = { '.hero': ['minHeight', 'paddingTop', 'paddingBottom', 'backgroundImage'], '.hero-title': ['fontSize', 'fontFamily', 'color'], '.hero-sub': ['fontSize', 'color'], '.card': ['backgroundColor', 'borderRadius', 'borderTopColor', 'boxShadow'], '.btn-g': ['backgroundImage', 'borderRadius', 'color'], '.form-input': ['backgroundColor', 'borderRadius', 'color'], '.page-title': ['fontFamily', 'fontSize', 'fontWeight', 'color'], '.score-disp': ['fontFamily', 'fontSize', 'color'], '.score-minus': ['backgroundColor', 'borderRadius'], '.hole-val': ['fontSize', 'color'] };
    return Object.fromEntries(Object.entries(properties).map(([selector, props]) => {
        const style = getComputedStyle(document.querySelector('#visual-sample ' + selector));
        return [selector, Object.fromEntries(props.map(prop => [prop, style[prop]]))];
    }));
}
(async () => {
    const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter(a => a !== '--single-process'), headless: true, env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined });
    try {
        for (const width of [390, 1280]) {
          for (const light of [false, true]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            await page.route('**/*', route => {
                const url = new URL(route.request().url());
                const file = path.join(root, url.pathname.slice(1));
                if (url.hostname !== 'visual.test' || route.request().resourceType() === 'script' || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
                return route.fulfill({ path: file });
            });
            const base = '<base href="http://visual.test/"><style>*,*::before,*::after{transition:none!important;animation:none!important}</style>';
            await page.setContent('<head>' + base + '<link rel="stylesheet" href="css/pr164.css"></head><body>' + sample + '</body>');
            await page.locator('#visual-sample .card').evaluate(el => getComputedStyle(el).backgroundColor);
            await page.waitForLoadState('load');
            await page.evaluate(light => document.body.classList.toggle('sun-mode', light), light);
            const expected = await page.evaluate(measure);
            for (const name of fs.readdirSync(root).filter(f => f.endsWith('.html') && fs.readFileSync(path.join(root, f), 'utf8').includes('css/pr164.css'))) {
                let html = fs.readFileSync(path.join(root, name), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace('<head>', '<head>' + base).replace('</body>', sample + '</body>');
                await page.setContent(html, { waitUntil: 'load' });
                await page.evaluate(light => document.body.classList.toggle('sun-mode', light), light);
                const actual = await page.evaluate(measure);
                assert.deepStrictEqual(actual, expected, name + ' uses PR164 components at ' + width);
                if (name === 'index.html' && width === 390 && !light) await page.screenshot({ path: '/tmp/pr164-restored-home.png' });
            }
            await page.close();
          }
        }
        console.log('PASS: PR164 shared visual components across all shared-theme pages at mobile and desktop widths');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
