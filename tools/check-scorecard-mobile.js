#!/usr/bin/env node
'use strict';
// Real Chromium, deterministic data; never connects to the production database.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const chromiumBinary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');

(async function() {
    const browser = await chromium.launch({ executablePath: await chromiumBinary.executablePath(), args: chromiumBinary.args, headless: true, env: process.env.CHROMIUM_EXTRA_LIBS ? Object.assign({}, process.env, { LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS }) : undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
        await page.goto('http://scorecard.test');
        await page.addStyleTag({ path: path.join(root, 'css/style.css') });
        // js/ui-events.js обязателен: inline-обработчиков в разметке больше нет,
        // клики по [data-act] ловит его слушатель на document. Без него кнопка
        // предпросмотра ничего не меняет, а фичевый скрипт падает на pestovoOnAction.
        for (const file of ['ui-events', 'course-config', 'date-range', 'dom', 'format', 'i18n', 'utils', 'admin-display']) {
            await page.addScriptTag({ path: path.join(root, 'js', file + '.js') });
        }
        const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
        const scStart = admin.indexOf('<div id="tab-scorecards"');
        const fragment = admin.slice(scStart, admin.indexOf('<div id="tab-', scStart + 10));
        await page.evaluate(html => {
            document.body.innerHTML = html.replace('admin-section hidden', 'admin-section');
            document.body.style.padding = '8px';
            currentLang = 'ru';
            window.saveCalls = [];
            window.failSave = false;
            window.settingsServer = null;
            window.db = { ref: path => ({
                once: () => Promise.resolve({ val: () => '1' }),
                transaction: (update, complete, localEvents) => {
                    if (failSave) return Promise.reject(new Error('Denied'));
                    const value = update(settingsServer);
                    if (value === undefined) return Promise.resolve({ committed: false });
                    saveCalls.push({ path, value, localEvents });
                    settingsServer = value;
                    return Promise.resolve({ committed: true, snapshot: { val: () => value } });
                }
            }) };
            renderClubScorecardPreview();
        }, fragment);
        for (const width of [320, 390, 430]) {
            await page.setViewportSize({ width, height: 844 });
            for (const variant of ['1', '2', '3', '4', '5']) {
                await page.click('#v5-scorecard-' + variant);
                const target = await page.locator('#v5-scorecard-' + variant).boundingBox();
                assert(target.height >= 44 && target.x >= 0 && target.x + target.width <= width + 1);
                for (const players of ['1', '2', '4']) for (const holes of ['9', '18']) for (const status of ['active', 'completed']) {
                    await page.evaluate(({ players, holes, status, variant }) => {
                        document.getElementById('club-sc-preview-players').value = players;
                        document.getElementById('club-sc-preview-holes').value = holes;
                        document.getElementById('club-sc-preview-status').value = status;
                        clubScorecardCompletedDraft = variant;
                        renderClubScorecardPreview();
                    }, { players, holes, status, variant });
                    const label = [width, variant, players, holes, status].join('/');
                    const card = page.locator('#club-sc-preview .club-sc');
                    assert.strictEqual(await card.getAttribute('data-sc-view'), variant, label);
                    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No page overflow: ' + label);
                    if (status === 'completed') {
                        assert.strictEqual(await card.locator('.sc-player-summary').count(), Number(players));
                        assert.strictEqual(await card.locator('.sc-result-metrics').count(), Number(players));
                        assert.strictEqual(await card.locator('[data-sc-hole]:visible').count(), 0, 'Hole detail initially collapsed: ' + label);
                        await card.locator('.sc-hole-details > summary').focus();
                        await page.keyboard.press('Enter');
                        assert.strictEqual(await card.locator('details').getAttribute('open'), '');
                    }
                    assert.strictEqual(await card.locator('[data-sc-player][data-sc-hole]:visible').count(), Number(players) * Number(holes), label);
                    if (players !== '1') {
                        assert.strictEqual(await card.locator('.club-sc-group-scroll').isVisible(), variant === '4');
                        assert.strictEqual(await card.locator('.gsg-layouts .tee-pill').count(), 0, 'No tee badges repeated per hole');
                        if (variant !== '4') {
                            const columns = await card.locator('.club-sc-grid').first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
                            assert.strictEqual(columns, ['2', '5'].includes(variant) ? 3 : 10, label);
                        }
                    } else {
                        const scrolling = await card.locator('.club-sc-scroll').first().evaluate(el => el.scrollWidth > el.clientWidth + 1);
                        assert.strictEqual(scrolling, variant === '3', 'Solo scrolling: ' + label);
                    }
                    assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Expanded card fits: ' + label);
                }
            }
        }
        assert.strictEqual(await page.evaluate(() => saveCalls.length), 0, 'All preview combinations are local');
        await page.selectOption('#club-sc-completed-view', '4');
        await page.click('#club-sc-apply');
        await page.waitForFunction(() => !clubScorecardSaving);
        assert.deepStrictEqual(await page.evaluate(() => saveCalls[0]), { path: 'settings/scorecard_display', value: { view: '5', completedView: '4', previous: { view: '1', completedView: 'inherit' } }, localEvents: false });
        assert.match(await page.textContent('#club-sc-saved'), /общий — 5.*завершённые — 4/);
        await page.click('#club-sc-undo');
        await page.waitForFunction(() => !clubScorecardSaving);
        assert.strictEqual(await page.evaluate(() => getRoundScorecardView({ status: 'completed' })), '1');
        await page.evaluate(() => { failSave = true; });
        await page.click('#v5-scorecard-3');
        await page.click('#club-sc-apply');
        await page.waitForFunction(() => !clubScorecardSaving);
        assert.strictEqual(await page.evaluate(() => getRoundScorecardView()), '1');
        assert.match(await page.textContent('#club-sc-save-status'), /Не удалось/);
        assert.strictEqual(await page.isDisabled('#club-sc-apply'), false);
        assert.deepStrictEqual(errors, []);
        if (process.env.SCORECARD_SCREENSHOT) {
            await page.locator('#tab-scorecards').screenshot({ path: process.env.SCORECARD_SCREENSHOT });
        }
        console.log('PASS: 180 mobile preview combinations; completed summaries, keyboard details, compact names, atomic save and undo');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
