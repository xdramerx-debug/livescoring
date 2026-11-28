#!/usr/bin/env node
'use strict';
// Signed-in header and drawer using the actual page markup, CSS and navigation.
const assert = require('assert');
const playwright = require('playwright');
const binary = require('@sparticuz/chromium');
const { launchBrowser } = require('./browser-check');
const { attachFixture, BASE } = require('./harness/relief-fixture');

const LONG_NAME = 'Александра Владимировна Смирнова-Кузнецова';

async function checkHeader(page, width, lang) {
    await page.setViewportSize({ width, height: 844 });
    const where = `${width}px/${lang}`;
    const drawerMode = width <= 1050;
    const toggle = page.locator('#nav-toggle');
    const menu = page.locator('#nav-menu');
    const drawer = page.locator('#mobile-drawer-root');
    assert.strictEqual(await toggle.isVisible(), drawerMode, where + ': correct menu button');
    assert.strictEqual(await menu.isVisible(), !drawerMode, where + ': correct horizontal menu');
    await drawer.locator('.nav-profile-trigger').waitFor({ state: 'hidden', timeout: 2000 });
    const geometry = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const nav = rect('#main-nav');
        const brand = rect('#main-nav .nav-brand');
        const weather = rect('#nav-weather-container');
        const end = rect(innerWidth <= 1050 ? '#nav-toggle' : '#nav-menu');
        return {
            height: nav.height,
            fits: document.documentElement.scrollWidth <= innerWidth + 1,
            clearance: brand.right <= weather.left + 1 && weather.right <= end.left + 1 && end.right <= innerWidth + 1
        };
    });
    assert(geometry.fits && geometry.clearance, where + ': logo, weather and navigation do not overlap: ' + JSON.stringify(geometry));
    assert(geometry.height > 0 && geometry.height < 80, where + ': single-row header');

    if (drawerMode) {
        await toggle.press('Enter');
        assert.strictEqual(await toggle.getAttribute('aria-expanded'), 'true');
        assert.strictEqual(await page.locator(':focus').getAttribute('class'), 'mobile-drawer-close');
    }
    const controls = drawerMode ? drawer : menu;
    const profile = controls.locator('.nav-profile-trigger');
    const logout = controls.locator('.nav-logout');
    assert.strictEqual(await profile.locator('.nav-uname').textContent(), 'Александра С.', where + ': use a short name');
    assert.strictEqual(await profile.getAttribute('title'), LONG_NAME, where + ': tooltip has the full name');
    assert((await profile.getAttribute('aria-label')).includes(LONG_NAME), where + ': accessible name has the full name');
    assert.strictEqual(await controls.locator('.relief-sign-in').count(), 0, where + ': profile replaces sign-in');
    for (const control of [profile, logout, controls.locator('.sun-mode-btn'), controls.locator('.lang-btn')]) {
        await control.scrollIntoViewIfNeeded();
        const box = await control.boundingBox();
        assert(box && box.x >= -1 && box.x + box.width <= width + 1, where + ': account control fits: ' + JSON.stringify(box));
        if (drawerMode) assert(box.height >= 44, where + ': account controls are touch-sized');
    }
    if (drawerMode) {
        await page.keyboard.press('Shift+Tab');
        assert(await logout.evaluate(el => el === document.activeElement), where + ': focus wraps inside the drawer');
        await page.keyboard.press('Escape');
        assert.strictEqual(await toggle.getAttribute('aria-expanded'), 'false');
        assert(await toggle.evaluate(el => el === document.activeElement), where + ': focus returns to the menu button');
    }
}

(async () => {
    const browser = await launchBrowser(playwright, binary);
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
        const errors = await attachFixture(page);
        await page.goto(BASE + 'index.html');
        await page.locator('#nav-weather-container .weather-widget').waitFor();
        await page.evaluate(longName => {
            window.currentUser = { uid: 'member' };
            window.currentUserData = { name: longName, firstName: 'Александра', lastName: 'Смирнова-Кузнецова', handicap: 14.2 };
            navAuth(currentUser, currentUserData);
        }, LONG_NAME);
        for (const lang of ['ru', 'en']) {
            if (lang === 'en') await page.evaluate(() => { toggleLang(); navAuth(currentUser, currentUserData); });
            for (const width of [320, 390, 768, 1024, 1050, 1051, 1181, 1321, 1440]) await checkHeader(page, width, lang);
        }

        // Optional pages must be suppressed everywhere, including the new shortcuts.
        const optional = page.locator('a[href="stats.html"]');
        assert(await page.locator('.relief-shortcut[href="stats.html"]').isVisible());
        await page.evaluate(() => {
            localStorage.setItem('pestovo_hidden_pages', JSON.stringify({ stats: true }));
            applyPageVisibilitySettings();
        });
        await page.setViewportSize({ width: 1050, height: 844 });
        await page.locator('#nav-toggle').click();
        assert(await page.locator('#mobile-drawer-root a[href="players.html"]').isVisible());
        assert((await optional.count()) >= 4);
        assert(await optional.evaluateAll(links => links.every(link => getComputedStyle(link).display === 'none')));
        await page.setViewportSize({ width: 1051, height: 844 });
        await page.waitForFunction(() => document.getElementById('nav-toggle').getAttribute('aria-expanded') === 'false');
        assert(!(await page.locator('#mobile-drawer-root .mobile-drawer-panel').isVisible()));
        assert.deepStrictEqual(errors, []);
        console.log('PASS: signed-in header and drawer, 9 widths in RU/EN, optional links and keyboard navigation');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
