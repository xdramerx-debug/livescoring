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
        for (const width of [320, 390, 768, 900, 1024, 1280, 1568]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            await page.route('**/*', r => r.abort());
            await page.setContent(fs.readFileSync(path.join(root, 'setup-round.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''));
            for (const file of ['style', 'theme-v2', 'product-ux', 'clarity', 'pr164', 'pr164-adapter']) await page.addStyleTag({ path: path.join(root, 'css', file + '.css') });
            await page.evaluate(() => {
                const labels = { nav_home: 'Home', nav_round: 'Play', nav_leaderboard: 'Results', nav_players: 'Players', nav_tournaments: 'Tournaments', nav_stats: 'Statistics', nav_handicaps: 'Handicaps', brand_name: 'Pestovo' };
                document.querySelectorAll('[data-i18n]').forEach(el => { if (labels[el.dataset.i18n]) el.textContent = labels[el.dataset.i18n]; });
                document.getElementById('nav-auth').innerHTML = '<div class="nav-user"><button class="sun-mode-btn">☼ Sun</button><button class="lang-btn">EN</button><button class="nav-profile-trigger"><span class="nav-uname">Alexander K.</span></button><button class="btn nav-logout">↪</button></div>';
                document.getElementById('nav-weather-container').innerHTML = '<div class="weather-widget"><div class="weather-item"><span class="weather-icon">☀️</span><b>+12°C</b></div><div class="weather-item"><b>3 m/s ЮЗ</b></div></div>';
                for (const cls of ['pv-bottomnav', 'pv-cta-dock is-visible']) { const el = document.createElement('div'); el.className = cls; el.textContent = 'Floating'; document.body.append(el); }
                document.getElementById('setup').classList.remove('hidden');
            });
            for (const light of [false, true]) {
                await page.evaluate(light => document.body.classList.toggle('sun-mode', light), light);
                const measurements = await page.evaluate(() => {
                    const weather = document.querySelector('#nav-weather-container .weather-item').getBoundingClientRect();
                    const brand = document.querySelector('.nav-brand').getBoundingClientRect();
                    const menu = document.querySelector(innerWidth > 768 ? '.nav-menu' : '.nav-toggle').getBoundingClientRect();
                    return { weather: { left: weather.left, right: weather.right }, brandRight: brand.right, menuLeft: menu.left, ring: getComputedStyle(document.querySelector('.nav-logo')).boxShadow, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
                });
                assert.strictEqual(measurements.ring, 'none');
                assert(measurements.weather.left >= measurements.brandRight - 1, 'weather after brand ' + width);
                assert(measurements.weather.right <= measurements.menuLeft + 1, 'weather fits before navigation ' + width + JSON.stringify(measurements));
                assert(!measurements.overflow, 'no page overflow ' + width);
                assert.strictEqual(await page.locator('.pv-bottomnav').isVisible(), false);
                assert.strictEqual(await page.locator('.pv-cta-dock').isVisible(), false);
                assert.strictEqual(await page.locator('#unified-start-btn').evaluate(el => getComputedStyle(el).position), 'static');
            }
            await page.close();
        }
        console.log('PASS: header logo/weather clearance at seven widths in both themes; bottom menu and dock hidden, original start remains static');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
