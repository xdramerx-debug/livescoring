#!/usr/bin/env node
'use strict';
// Real browser + production markup under a Pages-like subpath. No production data or writes.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const binary = require('@sparticuz/chromium');
const { launchBrowser } = require('./browser-check');
const { attachFixture, BASE } = require('./harness/relief-fixture');
const ROOT = path.join(__dirname, '..');
const PAGES = fs.readdirSync(ROOT).filter(name => name.endsWith('.html'));

async function assertFits(page, description) {
    const geometry = await page.evaluate(() => {
        const nav = document.getElementById('main-nav');
        const mast = document.querySelector('.relief-mast');
        const frame = document.querySelector('.relief-mast-frame');
        return {
            overflow: document.documentElement.scrollWidth - innerWidth,
            overlaps: !!(mast && frame && nav && mast.getBoundingClientRect().height &&
                frame.getBoundingClientRect().top + 1 < nav.getBoundingClientRect().bottom)
        };
    });
    assert(geometry.overflow <= 1, description + ': horizontal page overflow ' + geometry.overflow + 'px');
    assert(!geometry.overlaps, description + ': heading is covered by the fixed header');
}

function roundFixture(hole = 1, scores = { 1: 5 }) {
    const now = Date.now();
    return {
        status: 'active', format: 'Stroke Play', startHole: hole, holeRange: '1-18',
        createdAt: now, startTime: now, tee: 'wh',
        players: { p: { name: 'Тестовый игрок', joined: true, fieldHcp: 18, exactHcp: 17.2, tee: 'wh', scores } }
    };
}

async function checkLiveCourse(page) {
    await page.goto(BASE + 'index.html');
    await page.evaluate(rounds => {
        window.homeLastRoundsData = rounds;
        renderHomeLiveRounds(rounds);
    }, { front: roundFixture(), back: roundFixture(10, {}) });
    const map = page.locator('#course-holes-strip');
    assert.strictEqual(await map.locator('.chs-cell').count(), 18);
    assert.strictEqual(await map.locator('.chs-busy').count(), 2);
    assert.strictEqual(await map.locator('.chs-total-val').textContent(), '2');
    for (const time of await map.locator('.chs-start-pill b').allTextContents()) assert.match(time, /\d{1,2}:\d\d/);
    assert.strictEqual(await page.locator('#pv-chip-live-count').textContent(), '2');
    await assertFits(page, 'populated live course');
    const hint = map.locator('#chs-hint-toggle');
    await hint.click();
    assert.strictEqual(await hint.getAttribute('aria-expanded'), 'false');
    await page.evaluate(() => renderHomeLiveRounds(window.homeLastRoundsData));
    assert(!(await map.locator('#chs-hint-body').isVisible()), 'hint stays collapsed across a live update');
    await hint.click();
    assert(await map.locator('#chs-hint-body').isVisible());
}

async function checkScoring(page, file, prefix) {
    await page.goto(BASE + file + '?round=fixture&player=p');
    await page.evaluate(({ round, prefix }) => {
        const originalRef = db.ref.bind(db);
        db.ref = key => {
            const ref = originalRef(key);
            if (key === 'rounds/fixture') ref.on = (_event, cb) => { cb({ val: () => round }); return ref; };
            return ref;
        };
        if (prefix === 'sc') loadSc(); else loadMk();
    }, { round: roundFixture(), prefix });
    const entry = page.locator(`#${prefix}-body`);
    assert(await entry.isVisible(), file + ': render a real round');
    assert.strictEqual(await entry.locator('.hole-btn').count(), 18);
    await assertFits(page, file + ' with a populated round');
    const plus = entry.locator('.score-plus');
    const number = entry.locator(`#${prefix}-disp .score-gross`);
    const before = Number(await number.textContent()) || 0;
    await plus.click();
    assert.strictEqual((await number.textContent()).trim(), String(before + 1));
    assert(await entry.locator(`#${prefix}-save-btn`).isEnabled());
}

async function checkScoreGeometry(page) {
    await page.goto(BASE + 'leaderboard.html');
    const geometry = await page.evaluate(() => {
        const host = document.getElementById('lb-container');
        const p = { name: 'Тестовый игрок', fieldHcp: 18, scores: { 1: 5 } };
        host.innerHTML = window.renderClubScorecard(p, { status: 'completed', players: { p } }, { compact: true });
        const square = host.querySelector('.club-sc-score .club-sc-value');
        const mark = square.querySelector('.club-sc-handicap');
        const digit = square.querySelector('.sc-digit');
        const box = square.getBoundingClientRect();
        const hcp = mark.getBoundingClientRect();
        const score = digit.getBoundingClientRect();
        return {
            centered: Math.abs((score.left + score.right) / 2 - (box.left + box.right) / 2) < 1,
            corner: hcp.top < score.top && hcp.left > score.left && getComputedStyle(mark).position === 'absolute',
            mark: mark.querySelectorAll('.hm-bar').length,
            score: digit.textContent
        };
    });
    assert.deepStrictEqual(geometry, { centered: true, corner: true, mark: 1, score: '5' });
    await assertFits(page, 'card with handicap slash');
}

(async () => {
    const browser = await launchBrowser(playwright, binary);
    try {
        const desktop = await browser.newContext({ viewport: { width: 1440, height: 950 }, serviceWorkers: 'block' });
        const page = await desktop.newPage();
        const errors = await attachFixture(page);
        for (const width of [1440, 320]) {
            await page.setViewportSize({ width, height: 900 });
            for (const file of PAGES) {
                await page.goto(BASE + file);
                assert(await page.locator('html.relief-ui').count(), file + ': design is wired');
                assert(await page.evaluate(() => !!document.querySelector('link[href^="css/relief.css?v="]').sheet), file + ': stylesheet loads');
                await assertFits(page, file + ' at ' + width);
                await page.evaluate(() => { document.body.classList.add('sun-mode'); });
                await assertFits(page, file + ' in sunlight at ' + width);
            }
        }
        await checkScoreGeometry(page);
        await checkLiveCourse(page);
        await checkScoring(page, 'scorer.html', 'sc');
        await checkScoring(page, 'marker.html', 'mk');
        await page.goto(BASE + 'qr-start.html');
        await page.emulateMedia({ media: 'print' });
        assert(!(await page.locator('#qr-toolbar').isVisible()), 'print hides the themed toolbar');
        await page.emulateMedia({ media: 'screen' });

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(BASE + 'index.html');
        const scene = page.locator('.relief-scene');
        assert(await scene.locator('img').evaluate(img => img.complete && img.naturalWidth > 0), 'local terrain image loads under /livescoring/');
        assert(await page.locator('.relief-guest-controls .relief-sign-in').isVisible(), 'desktop guest can open sign-in');
        await scene.hover({ position: { x: 35, y: 40 } });
        await page.waitForFunction(() => !!document.querySelector('.relief-scene').style.getPropertyValue('--scene-x'));
        await page.mouse.move(10, 10);
        await page.waitForFunction(() => !document.querySelector('.relief-scene').style.getPropertyValue('--scene-x'));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await scene.hover({ position: { x: 35, y: 40 } });
        assert.strictEqual(await scene.locator('figure').evaluate(el => getComputedStyle(el).transform), 'none', 'reduced motion disables tilt');
        assert.strictEqual(await scene.evaluate(el => el.style.getPropertyValue('--scene-x')), '');

        await page.goto(BASE + 'index.html?dsp=1');
        assert(!(await scene.isVisible()), 'saved alternate designs retain the classic hero structure');
        assert(await page.locator('.hero-logo').isVisible());
        await page.goto(BASE + 'stats.html?dsp=3');
        assert(!(await page.locator('.relief-mast-mark').isVisible()), 'alternate masthead hides the Relief ornament');
        await page.goto(BASE + 'index.html');
        await page.evaluate(() => {
            window.PestovoDesign.setBlockPreset('hero', '3');
        });
        assert(!(await scene.isVisible()), 'block overrides still work independently');
        assert(await page.locator('.relief-shortcuts').isVisible());
        await page.evaluate(() => window.PestovoDesign.resetAll());
        assert(await scene.isVisible());
        assert.deepStrictEqual(errors, []);

        const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
        const touch = await mobile.newPage();
        const mobileErrors = await attachFixture(touch);
        await touch.goto(BASE + 'index.html');
        await touch.locator('#nav-toggle').tap();
        assert.strictEqual(await touch.locator('#nav-toggle').getAttribute('aria-expanded'), 'true');
        const drawer = touch.locator('#mobile-drawer-root');
        assert(await drawer.locator('.relief-sign-in').isVisible(), 'mobile guest can open sign-in');
        await drawer.locator('.sun-mode-btn').tap();
        assert.strictEqual(await drawer.locator('.sun-mode-btn').getAttribute('aria-pressed'), 'true');
        assert.strictEqual(await touch.locator('body').evaluate(el => getComputedStyle(el).colorScheme), 'light');
        await drawer.locator('.lang-btn').tap();
        assert.strictEqual(await touch.locator('html').getAttribute('lang'), 'en');
        await drawer.locator('.mobile-drawer-close').tap();
        assert.strictEqual(await touch.locator('#nav-toggle').getAttribute('aria-expanded'), 'false');
        await touch.locator('.hero-btns a[href="setup-round.html"]').tap();
        await touch.waitForURL('**/setup-round.html');
        assert(await touch.locator('#unified-add-btn').isVisible());
        await touch.locator('#unified-add-btn').tap();
        assert.strictEqual(await touch.locator('#player-slots [data-pidx]').count(), 2);
        await assertFits(touch, 'touch round setup with two players in sun mode');
        assert.deepStrictEqual(mobileErrors, []);
        console.log(`PASS: ${PAGES.length} pages × 2 widths × 2 themes; live map, scoring, HCP mark, mobile entry, presets, motion and QR print`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
