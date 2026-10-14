#!/usr/bin/env node
'use strict';
// Real Chromium coverage for all five round-setup layouts on touch screens.
// Uses the production CSS, setup-round markup and JS, but never connects to Firebase.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
const widths = [320, 360, 390, 430, 520, 760, 820];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function extractPage() {
    const dom = new JSDOM(read('setup-round.html'));
    const setup = dom.window.document.getElementById('setup');
    assert(setup, 'setup-round.html contains #setup');
    const styles = Array.from(dom.window.document.querySelectorAll('style')).map(node => node.textContent).join('\n');
    return { setup: setup.outerHTML, styles };
}

(async () => {
    const browser = await chromium.launch({
        executablePath: await binary.executablePath(),
        args: binary.args,
        headless: true,
        env: process.env.CHROMIUM_EXTRA_LIBS
            ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS }
            : undefined
    });
    try {
        const page = await browser.newPage({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true
        });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body class="score-compact"></body></html>'
        }));
        await page.goto('http://round-setup-mobile.test');
        await page.addStyleTag({ path: path.join(root, 'css/style.css') });
        const pageMarkup = extractPage();
        await page.addStyleTag({ content: pageMarkup.styles });
        await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important;}' });
        await page.evaluate(html => {
            document.body.innerHTML = '<main class="container" style="padding-top:70px;padding-bottom:80px"><div id="setup"></div></main>';
            document.getElementById('setup').outerHTML = html;
            currentLang = 'ru';
            localStorage.clear();
            window.db = null;
            window.currentUser = null;
            window.currentUserData = null;
            window.toast = function() {};
            window.vib = function() {};
        }, pageMarkup.setup);
        for (const file of ['course-config', 'date-range', 'dom', 'format', 'i18n', 'utils', 'live', 'round-setup']) {
            await page.addScriptTag({ path: path.join(root, 'js', file + '.js') });
        }
        await page.evaluate(() => {
            currentLang = 'ru';
            currentUser = null;
            currentUserData = null;
            initPlayerSearchAutofill = function() {};
        });

        let checks = 0;
        for (const width of widths) {
            await page.setViewportSize({ width, height: 844 });
            for (const variant of ['1', '2', '3', '4', '5']) {
                await page.evaluate(v => {
                    setupPlayerOrder = [1];
                    setupPlayerSeq = 1;
                    setupWizardStep = 1;
                    applyView5('roundsetup', v);
                    renderSetupPlayers(false);
                }, variant);
                if (variant === '5') {
                    await page.locator('#unified-next-btn').click();
                    assert.strictEqual(await page.locator('#unif-sec-2').isVisible(), true, width + 'px / v5 enters the players step');
                    checks++;
                }
                await page.locator('#unified-add-btn').click();
                await page.locator('#unified-add-btn').click();
                assert.strictEqual(await page.locator('#player-slots [data-pidx]').count(), 3, width + 'px / view ' + variant + ' adds players');
                checks++;
                if (variant === '1' || variant === '5') await page.locator('#player-slots [data-pidx="2"] .setup-player-head').click();

                await page.locator('#pl-name-2').fill('Анна Петрова');
                await page.locator('#pl-mid-2').fill('Сергеевна');
                await page.locator('#pl-gender-2').selectOption('women');
                await page.locator('#pl-tee-2').selectOption('rd');
                await page.locator('#pl-hcp-2').fill('18.2');
                if (variant === '1' || variant === '5') await page.locator('#player-slots [data-pidx="3"] .setup-player-head').click();
                await page.locator('#pl-name-3').fill('Пётр Сидоров');
                await page.locator('#pl-hcp-3').fill('7.1');
                await page.waitForTimeout(20);

                const state = await page.evaluate(() => {
                    const slots = document.getElementById('player-slots');
                    const rect = el => {
                        if (!el) return null;
                        const r = el.getBoundingClientRect();
                        const style = getComputedStyle(el);
                        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, visible: r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility !== 'hidden', minHeight: style.minHeight };
                    };
                    const refresh = document.getElementById('pl-hcp-refresh-2');
                    const removal = slots.querySelector('[data-pidx="3"] .spc-remove');
                    const header = slots.querySelector('[data-pidx="3"] .setup-player-head');
                    const add = document.getElementById('unified-add-btn');
                    const main = document.querySelector('main');
                    const section = document.getElementById('unif-sec-2');
                    return {
                        overflow: document.documentElement.scrollWidth > innerWidth + 1,
                        mainWidth: main.getBoundingClientRect().width,
                        sectionWidth: section.getBoundingClientRect().width,
                        variantClass: Array.from(document.body.classList).find(name => /^st-roundsetup-v[2-5]$/.test(name)) || '1',
                        slotCount: slots.querySelectorAll('[data-pidx]').length,
                        openCount: slots.querySelectorAll('.setup-player-card.open').length,
                        cards: slots.querySelectorAll('.setup-player-card').length,
                        rows: slots.querySelectorAll('.spc-row').length,
                        richCards: slots.querySelectorAll('.spc-rich').length,
                        grid: slots.classList.contains('unified-slots-grid'),
                        wizardVisible: !document.getElementById('unified-wizard').classList.contains('hidden'),
                        wizardStep: setupWizardStep,
                        name2: document.getElementById('pl-name-2').value,
                        handicap2: document.getElementById('pl-hcp-2').value,
                        visibleFields: Array.from(slots.querySelectorAll('input.form-input, select.form-input')).filter(el => {
                            const r = el.getBoundingClientRect();
                            const s = getComputedStyle(el);
                            return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
                        }).length,
                        offscreenFields: Array.from(slots.querySelectorAll('input.form-input, select.form-input')).filter(el => {
                            const r = el.getBoundingClientRect();
                            const s = getComputedStyle(el);
                            return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && (r.left < -1 || r.right > innerWidth + 1);
                        }).length,
                        remove: rect(removal),
                        header: rect(header),
                        refresh: rect(refresh),
                        add: rect(add),
                        inputHeights: Array.from(slots.querySelectorAll('input.form-input, select.form-input')).filter(el => {
                            const r = el.getBoundingClientRect();
                            return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
                        }).map(el => el.getBoundingClientRect().height),
                        stepHeights: Array.from(document.querySelectorAll('.unified-step')).map(el => el.getBoundingClientRect().height),
                        next: rect(document.getElementById('unified-next-btn'))
                    };
                }, variant);
                assert.strictEqual(state.overflow, false, width + 'px / view ' + variant + ' page has no horizontal overflow');
                assert.strictEqual(state.slotCount, 3, width + 'px / view ' + variant + ' retains all players');
                assert.strictEqual(state.name2, 'Анна Петрова', width + 'px / view ' + variant + ' preserves names');
                assert.strictEqual(state.handicap2, '18.2', width + 'px / view ' + variant + ' preserves handicaps');
                assert(state.visibleFields > 0, width + 'px / view ' + variant + ' shows player inputs');
                assert.strictEqual(state.offscreenFields, 0, width + 'px / view ' + variant + ' inputs stay inside viewport');
                assert(state.remove && state.remove.visible, width + 'px / view ' + variant + ' shows player removal');
                assert(state.remove.height >= 44 && state.remove.width >= 44, width + 'px / view ' + variant + ' remove target is >=44px (' + JSON.stringify(state.remove) + ')');
                assert(state.add && state.add.height >= 44, width + 'px / view ' + variant + ' add target is >=44px');
                if (state.header && state.header.visible) {
                    assert(state.header.height >= 44, width + 'px / view ' + variant + ' accordion header target is >=44px (' + state.header.height + 'px)');
                }
                assert(state.inputHeights.every(height => height >= 44), width + 'px / view ' + variant + ' visible inputs are >=44px high');
                assert(state.refresh && state.refresh.visible, width + 'px / view ' + variant + ' exposes HCP lookup after a full name');
                assert(state.refresh.height >= 44 && state.refresh.width >= 44, width + 'px / view ' + variant + ' HCP lookup target is >=44px (' + JSON.stringify(state.refresh) + ')');
                assert.strictEqual(state.variantClass, variant === '1' ? '1' : 'st-roundsetup-v' + variant, width + 'px / view ' + variant + ' applies its CSS preset');
                if (variant === '1') assert.strictEqual(state.openCount, 1, width + 'px / v1 uses one expanded accordion card');
                if (variant === '2') assert(state.grid && state.cards === 3, width + 'px / v2 renders the open card grid');
                if (variant === '3') assert.strictEqual(state.rows, 3, width + 'px / v3 renders compact rows');
                if (variant === '4') assert.strictEqual(state.richCards, 3, width + 'px / v4 renders rich cards');
                if (variant === '5') {
                    assert(state.wizardVisible, width + 'px / v5 shows the step wizard');
                    assert.strictEqual(state.wizardStep, 2, width + 'px / v5 moves to the player step when players are added');
                    assert(state.stepHeights.every(height => height >= 44), width + 'px / v5 step tabs are >=44px (' + state.stepHeights.join(',') + ')');
                    assert(state.next.height >= 44, width + 'px / v5 next-step target is >=44px');
                }
                checks += 15;

                // Removing/re-adding a player is an actual touch click, not only a string test.
                await page.locator('#player-slots [data-pidx="3"] .spc-remove').click();
                assert.strictEqual(await page.locator('#player-slots [data-pidx]').count(), 2, width + 'px / view ' + variant + ' removes selected player');
                assert.strictEqual(await page.locator('#pl-name-2').inputValue(), 'Анна Петрова', width + 'px / view ' + variant + ' keeps remaining player data');
                await page.locator('#unified-add-btn').click();
                assert.strictEqual(await page.locator('#player-slots [data-pidx]').count(), 3, width + 'px / view ' + variant + ' re-adds a player');
                checks += 3;

                if (variant === '1') {
                    const firstHeader = page.locator('#player-slots [data-pidx="1"] .setup-player-head');
                    await firstHeader.click();
                    assert.strictEqual(await page.locator('#player-slots [data-pidx="1"]').evaluate(el => el.classList.contains('open')), true, width + 'px / v1 opens a collapsed card');
                    assert.strictEqual(await page.locator('#player-slots .setup-player-card.open').count(), 1, width + 'px / v1 keeps only one card open');
                    checks += 2;
                }
                if (variant === '5') {
                    await page.locator('#unified-next-btn').click();
                    assert.strictEqual(await page.locator('#unif-sec-3').isVisible(), true, width + 'px / v5 reaches the start summary');
                    assert.strictEqual(await page.locator('#unified-summary').isVisible(), true, width + 'px / v5 renders the summary');
                    assert.match(await page.locator('#unified-summary').innerText(), /Анна Петрова/);
                    await page.locator('#unified-back-btn').click();
                    assert.strictEqual(await page.locator('#unif-sec-2').isVisible(), true, width + 'px / v5 navigates back to players');
                    await page.locator('.unified-step').first().click();
                    assert.strictEqual(await page.locator('#unif-sec-1').isVisible(), true, width + 'px / v5 step tabs navigate to settings');
                    await page.locator('#unified-next-btn').click();
                    assert.strictEqual(await page.locator('#unif-sec-2').isVisible(), true, width + 'px / v5 advances again');
                    checks += 6;
                }

                // Live admin preset changes re-render from existing field values.
                const next = String((Number(variant) % 5) + 1);
                await page.evaluate(v => { applyView5('roundsetup', v); renderSetupPlayers(true); }, next);
                assert.strictEqual(await page.locator('#pl-name-2').inputValue(), 'Анна Петрова', width + 'px / view ' + variant + ' -> ' + next + ' preserves the entered name');
                assert.strictEqual(await page.locator('#pl-hcp-2').inputValue(), '18.2', width + 'px / view ' + variant + ' -> ' + next + ' preserves the handicap');
                checks += 2;
            }
        }
        assert.deepStrictEqual(errors, [], 'No uncaught browser errors');
        console.log('PASS (' + checks + ' checks): round setup views 1–5; player fields and interactions; 44px touch targets; ' + widths.join('/') + 'px');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
