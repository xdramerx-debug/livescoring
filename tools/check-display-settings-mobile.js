#!/usr/bin/env node
'use strict';
// Offline Chromium audit: all new global display controls at narrow touch widths.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const { chromium } = require('playwright');
const chromiumBinary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
const widths = [320, 360, 390, 430, 520, 768];
const selectorGroups = [
    ['other page settings', '.page-display-variant-btn', 15],
    ['tournament layout selector', '#tournaments-display-layout', 1],
    ['tournament elements', '#tournaments-display-elements .screen-display-option', 13],
    ['score-entry elements', '#score-entry-display-elements .screen-display-option', 19],
    ['score-entry layout tiles', '#score-entry-display-layouts .score-layout-tile', 10],
    ['score-entry accents', '#score-entry-display-accent .score-accent-swatch', 5],
    ['score-entry digit sizes', '#score-entry-display-size .score-size-btn', 3],
    ['tournament QR elements', '#tn-score-display-elements .screen-display-option', 19],
    ['tournament section order', '#tournaments-display-order [data-display-order-move]', 6],
    ['score-entry block order', '#score-entry-display-order [data-display-order-move]', 6],
    ['tournament QR block order', '#tn-score-display-order [data-display-order-move]', 6],
    ['save/reset actions', '[data-display-save], [data-display-reset]', 6]
];
const allSelectors = selectorGroups.map(group => group[1]).join(',');
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function adminSection(document, id) {
    const element = document.getElementById(id);
    assert(element, 'admin.html contains #' + id);
    return element.outerHTML.replace('class="admin-section hidden"', 'class="admin-section"');
}
const source = new JSDOM(read('admin.html')).window.document;
const fragments = ['tab-tournamentsview', 'tab-data', 'tab-tncards', 'tab-scoreentry']
    .map(id => adminSection(source, id)).join('\n');

(async function() {
    const browser = await chromium.launch({
        executablePath: await chromiumBinary.executablePath(), args: chromiumBinary.args, headless: true,
        env: process.env.CHROMIUM_EXTRA_LIBS
            ? Object.assign({}, process.env, { LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS }) : undefined
    });
    try {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.fulfill({
            contentType: 'text/html', body: '<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'
        }));
        await page.goto('http://display-settings-mobile.test');
        await page.addStyleTag({ path: path.join(root, 'css/style.css') });
        await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important;}' });
        await page.evaluate(html => {
            document.body.innerHTML = html;
            document.body.style.padding = '8px';
            currentLang = 'ru'; window.db = null; window.toast = function() {}; window.vib = function() {};
            localStorage.clear();
        }, fragments);
        // js/ui-events.js обязателен: inline-обработчиков в разметке больше нет,
        // клики по [data-act] ловит его слушатель на document. Без него кнопка
        // предпросмотра ничего не меняет, а фичевый скрипт падает на pestovoOnAction.
        for (const file of ['ui-events', 'course-config', 'date-range', 'dom', 'format', 'i18n', 'utils', 'utils-scorecards', 'admin-display']) {
            await page.addScriptTag({ path: path.join(root, 'js', file + '.js') });
        }
        await page.evaluate(() => {
            renderPageDisplaySettingsGrid();
            renderPestovoDisplayAdmin('tournaments', true);
            renderPestovoDisplayAdmin('scoring', true);
            renderPestovoDisplayAdmin('tournamentScoring', true);
        });

        for (const width of widths) {
            await page.setViewportSize({ width, height: 844 });
            const result = await page.evaluate(({ groups, selector }) => {
                const rows = Array.from(document.querySelectorAll(selector)).map(element => {
                    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
                    return { height: rect.height, left: rect.left, right: rect.right, width: rect.width,
                        display: style.display, visibility: style.visibility, selector: element.tagName.toLowerCase() };
                });
                const counts = {};
                groups.forEach(([name, groupSelector]) => { counts[name] = document.querySelectorAll(groupSelector).length; });
                return { coarse: matchMedia('(pointer: coarse)').matches, rows,
                    pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, counts };
            }, { groups: selectorGroups, selector: allSelectors });
            assert.strictEqual(result.coarse, true, 'emulated touch pointer is coarse at ' + width + 'px');
            assert.strictEqual(result.pageOverflow, false, 'admin display editor has no page-level horizontal overflow at ' + width + 'px');
            for (const [name, , minimum] of selectorGroups) {
                assert(result.counts[name] >= minimum,
                    'renders all ' + name + ' controls (' + result.counts[name] + ' at ' + width + 'px)');
            }
            assert(result.rows.length >= selectorGroups.reduce((sum, group) => sum + group[2], 0),
                'all display targets are present at ' + width + 'px');
            const undersized = result.rows.filter(row => row.height < 44);
            assert.deepStrictEqual(undersized, [], 'all display tap targets are at least 44px at ' + width + 'px');
            const clipped = result.rows.filter(row => row.width <= 0 || row.left < -1 || row.right > width + 1 ||
                row.display === 'none' || row.visibility === 'hidden');
            assert.deepStrictEqual(clipped, [], 'all display controls remain visible inside the viewport at ' + width + 'px');
            console.log('  ' + width + 'px: ' + result.rows.length + ' visible controls, all ≥44px, no horizontal overflow');
        }

        // Exercise real taps in each editor, but do not persist when offline.
        await page.locator('#tournaments-display-elements input[data-display-key="search"]').check();
        await page.locator('#score-entry-display-elements input[data-display-key="par"]').check();
        await page.locator('#tn-score-display-elements input[data-display-key="qr"]').check();
        await page.locator('#score-entry-display-layouts [data-score-layout="split"]').click();
        assert.strictEqual(await page.evaluate(() => document.querySelector('#score-entry-display-layouts .is-active').getAttribute('data-score-layout')),
            'split', 'layout tile is tappable at 390px');
        await page.locator('#score-entry-display-accent [data-score-accent="emerald"]').click();
        await page.locator('#score-entry-display-size [data-score-size="xl"]').click();
        await page.locator('#tournaments-display-order [data-display-order-move="down"]').first().click();
        await page.locator('#score-entry-display-order [data-display-order-move="down"]').first().click();
        assert.strictEqual(await page.locator('[data-display-save]').count(), 3, 'all shared settings have a save/apply action');
        assert.deepStrictEqual(errors, []);
        console.log('PASS: global display settings are usable on 320–768px touch screens');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
