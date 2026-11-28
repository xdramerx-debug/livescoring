#!/usr/bin/env node
'use strict';
// Real Chromium coverage for the canonical touch layout with saved presets 1–5.
// Uses the production CSS, setup-round markup and JS, but never connects to Firebase.
const assert = require('assert');
const playwright = require('playwright');
const binary = require('@sparticuz/chromium');
const { launchBrowser } = require('./browser-check');
const { attachFixture, BASE } = require('./harness/relief-fixture');
const widths = [320, 360, 390, 430, 520, 760, 820];

(async () => {
    const browser = await launchBrowser(playwright, binary);
    try {
        const page = await browser.newPage({
            viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
            serviceWorkers: 'block', reducedMotion: 'reduce'
        });
        page.setDefaultTimeout(5000);
        const errors = await attachFixture(page);
        await page.goto(BASE + 'setup-round.html');
        await page.locator('#pl-name-1').waitFor();

        let checks = 0;
        for (const width of widths) {
            await page.setViewportSize({ width, height: 844 });
            for (const legacyVariant of (width === 390 ? ['1', '2', '3', '4', '5'] : ['1'])) {
                const where = width + 'px / saved view ' + legacyVariant;
                await page.evaluate(v => {
                    setupPlayerOrder = [1];
                    setupPlayerSeq = 1;
                    setupWizardStep = 1;
                    applyView5('roundsetup', v);
                    renderSetupPlayers(false);
                }, legacyVariant);
                const addPlayer = page.locator('#unified-add-btn');
                await addPlayer.tap();
                await addPlayer.tap();
                assert.strictEqual(await page.locator('#player-slots [data-pidx]').count(), 3, where + ' adds players');
                checks++;
                await page.locator('#player-slots [data-pidx="2"] .spc-title').click();
                await page.locator('#pl-name-2').fill('Анна');
                assert(!(await page.locator('#pl-hcp-refresh-2').isVisible()), where + ' lookup needs a full name');
                await page.locator('#pl-last-2').fill('Петрова');
                await page.locator('#pl-gender-2').selectOption('women');
                await page.locator('#pl-tee-2').selectOption('rd');
                await page.locator('#pl-hcp-2').fill('18.2');
                const head3 = page.locator('[data-pidx="3"] .setup-player-head');
                await head3.locator('.spc-title').click();
                assert.strictEqual(await head3.getAttribute('aria-expanded'), 'true', where + ' switches player cards');
                await page.locator('#pl-name-3').fill('Пётр');
                await page.locator('#pl-last-3').fill('Сидоров');
                await head3.locator('.spc-title').click();
                assert.strictEqual(await page.locator('#pl-name-3').isVisible(), false, 'collapse hides player fields');
                await head3.focus();
                await page.keyboard.press('Enter');
                assert.strictEqual(await page.locator('#pl-name-3').isVisible(), true, 'keyboard expands player');
                assert.strictEqual(await page.evaluate(() => setupGetFullName(3)), 'Пётр Сидоров');
                assert.strictEqual(await page.locator('#p0-wizard-steps, #pv-steps, #fio-resume-card').count(), 0);
                await page.locator('#pl-hcp-3').fill('7.1');

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
                    const refreshNeighbor = slots.querySelector('[data-pidx="2"] .spc-remove');
                    const header = slots.querySelector('[data-pidx="3"] .setup-player-head');
                    const add = document.getElementById('unified-add-btn');
                    return {
                        overflow: document.documentElement.scrollWidth > innerWidth + 1,
                        variantClass: Array.from(document.body.classList).find(name => /^st-roundsetup-v[2-5]$/.test(name)) || '1',
                        slotCount: slots.querySelectorAll('[data-pidx]').length,
                        openCount: slots.querySelectorAll('.setup-player-card.open').length,
                        name2: setupGetFullName(2),
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
                        refreshNeighbor: rect(refreshNeighbor),
                        add: rect(add),
                        inputHeights: Array.from(slots.querySelectorAll('input.form-input, select.form-input')).filter(el => {
                            const r = el.getBoundingClientRect();
                            return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
                        }).map(el => el.getBoundingClientRect().height),
                        // The bottom edges of fields on the same row must align.
                        misalignedFields: (function () {
                            let bad = 0;
                            slots.querySelectorAll('.form-row').forEach(row => {
                                const controls = Array.from(row.querySelectorAll('.form-input')).filter(el => {
                                    const r = el.getBoundingClientRect();
                                    const s = getComputedStyle(el);
                                    return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden';
                                });
                                for (let i = 0; i < controls.length; i++) {
                                    for (let j = i + 1; j < controls.length; j++) {
                                        const a = controls[i].getBoundingClientRect();
                                        const b = controls[j].getBoundingClientRect();
                                        const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                                        if (overlap < Math.min(a.height, b.height) * 0.5) continue; // разные линии
                                        if (Math.abs(a.bottom - b.bottom) > 1) bad++;
                                    }
                                }
                            });
                            return bad;
                        })()
                    };
                });
                assert.strictEqual(state.overflow, false, where + ' page has no horizontal overflow');
                assert.strictEqual(state.slotCount, 3, where + ' retains all players');
                assert.strictEqual(state.name2, 'Анна Петрова', where + ' preserves names');
                assert.strictEqual(state.handicap2, '18.2', where + ' preserves handicaps');
                assert(state.visibleFields > 0, where + ' shows player inputs');
                assert.strictEqual(state.offscreenFields, 0, where + ' inputs stay inside viewport');
                assert(state.remove && state.remove.visible, where + ' shows player removal');
                assert(state.remove.height >= 44 && state.remove.width >= 44, where + ' remove target is >=44px (' + JSON.stringify(state.remove) + ')');
                assert(state.add && state.add.height >= 44, where + ' add target is >=44px');
                if (state.header && state.header.visible) {
                    assert(state.header.height >= 44, where + ' accordion header target is >=44px (' + state.header.height + 'px)');
                }
                assert(state.inputHeights.every(height => height >= 44), where + ' visible inputs are >=44px high');
                assert.strictEqual(state.misalignedFields, 0, where + ' поля игрока стоят на одной линии (' + state.misalignedFields + ' «уехавших»)');
                assert(state.refresh && state.refresh.visible, where + ' exposes HCP lookup after a full name');
                assert.strictEqual(await page.locator('#pl-hcp-refresh-2 .setup-hcp-refresh-text').textContent(), 'Обновить гандикап из АГР');
                assert(await page.locator('#pl-hcp-refresh-2 .setup-hcp-refresh-text').isVisible());
                assert(state.refresh.right <= state.refreshNeighbor.left + 1, where + ' lookup does not overlap removal');
                assert(state.refresh.height >= 44 && state.refresh.width >= 44, where + ' HCP lookup target is >=44px (' + JSON.stringify(state.refresh) + ')');
                assert.strictEqual(state.variantClass, '1', where + ' keeps the canonical layout');
                assert.strictEqual(state.openCount, 1, where + ' uses one expanded accordion card');
                checks += 16;

                // Removing/re-adding a player via touch retains the other fields.
                await page.locator('#player-slots [data-pidx="3"] .spc-remove').tap();
                assert.strictEqual(await page.locator('#player-slots [data-pidx]').count(), 2, where + ' removes selected player');
                assert.strictEqual(await page.evaluate(() => setupGetFullName(2)), 'Анна Петрова', where + ' keeps remaining player data');
                await addPlayer.tap();
                assert.strictEqual(await page.locator('#player-slots [data-pidx]').count(), 3, where + ' re-adds a player');
                checks += 3;

                const firstHeader = page.locator('#player-slots [data-pidx="1"] .setup-player-head');
                await firstHeader.locator('.spc-title').tap();
                assert.strictEqual(await firstHeader.getAttribute('aria-expanded'), 'true', where + ' opens a collapsed card');
                assert.strictEqual(await page.locator('#player-slots .setup-player-card.open').count(), 1, where + ' keeps only one card open');
                checks += 2;

                // Live admin preset changes re-render from existing field values.
                const next = String((Number(legacyVariant) % 5) + 1);
                await page.evaluate(v => { applyView5('roundsetup', v); renderSetupPlayers(true); }, next);
                assert.strictEqual(await page.evaluate(() => setupGetFullName(2)), 'Анна Петрова', where + ' -> ' + next + ' preserves the entered name');
                assert.strictEqual(await page.locator('#pl-hcp-2').inputValue(), '18.2', where + ' -> ' + next + ' preserves the handicap');
                checks += 2;
            }
            console.log('  ' + width + 'px: player fields, accordion and 44px touch targets');
        }
        assert.deepStrictEqual(errors, [], 'No uncaught browser errors');
        console.log('PASS (' + checks + ' checks): canonical round setup migrated from stored views 1–5; player fields and interactions; 44px touch targets; ' + widths.join('/') + 'px');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
