#!/usr/bin/env node
'use strict';
// Offline Chromium integration: real score-entry markup, global settings and touch targets.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const setup = new (require('jsdom').JSDOM)(read('setup-round.html')).window.document;
const scorer = new (require('jsdom').JSDOM)(read('scorer.html')).window.document;
const fixture = [
    ...Array.from(setup.querySelectorAll('.score-entry')).map(node => node.outerHTML),
    scorer.querySelector('.score-entry').outerHTML
].join('\n');

(async () => {
    const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args, headless: true,
        env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.fulfill({
            contentType: 'text/html', body: '<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'
        }));
        await page.goto('http://score-entry-mobile.test');
        await page.addStyleTag({ path: path.join(root, 'css/style.css') });
        await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important;}' });
        await page.evaluate(html => {
            document.body.innerHTML = html;
            document.body.style.cssText = 'margin:0;padding:8px;';
            currentLang = 'ru'; window.db = null;
            document.querySelectorAll('.score-entry').forEach((entry, index) => {
                entry.setAttribute('data-test-mode', index < 2 ? (index === 0 ? 'group' : 'solo') : 'qr');
                entry.querySelectorAll('.hole-nav').forEach(nav => {
                    nav.innerHTML = Array.from({ length: 18 }, (_, i) => '<button type="button" class="hole-btn" data-hole="' + (i + 1) + '" onclick="window.holeTapped=(window.holeTapped||0)+1">' + (i + 1) + '</button>').join('');
                });
                entry.querySelectorAll('.dual-half__name').forEach((label, i) => {
                    label.textContent = i ? 'Счёт игрока: Александр Сергеевич Иванов' : 'Мой счёт: Михаил Петров';
                });
            });
        }, fixture);
        // js/ui-events.js обязателен: inline-обработчиков в разметке больше нет,
        // клики по [data-act] ловит его слушатель на document. Без него кнопка
        // предпросмотра ничего не меняет, а фичевый скрипт падает на pestovoOnAction.
        for (const file of ['ui-events', 'course-config', 'format', 'dom', 'i18n', 'utils', 'live']) {
            await page.addScriptTag({ path: path.join(root, 'js', file + '.js') });
        }
        await page.evaluate(() => {
            setPestovoDisplaySettings('scoring', {
                order: ['info', 'holes', 'input'],
                visible: { distance: false, deadline: false, pace: false, markerScore: true }
            });
            setPestovoDisplaySettings('tournamentScoring', {
                order: ['holes', 'input', 'info'], visible: { par: false, markerScore: false }
            });
            pestovoApplyScoringDisplay({ mode: 'group' });
        });
        assert.strictEqual(await page.evaluate(() => scoreEntryPlayerLabel('my', { firstName: 'Иван', lastName: 'Иванов', name: 'Иванов Иван' })),
            'Мой счёт: Иван Иванов', 'my-score label uses the exact prefix and full first-name/surname order');
        assert.strictEqual(await page.evaluate(() => scoreEntryPlayerLabel('marker', { name: 'Анна Петрова' })),
            'Счёт игрока: Анна Петрова', 'marker label uses the exact prefix and full name without parentheses');
        assert.strictEqual(await page.evaluate(() => { currentLang = 'en'; return scoreEntryPlayerLabel('my', { name: 'Anna Petrov' }); }),
            'My score: Anna Petrov', 'English score label keeps both name parts');

        for (const width of [320, 360, 390, 430, 768]) {
            await page.setViewportSize({ width, height: 844 });
            for (const mode of ['group', 'solo', 'qr']) {
                await page.evaluate(({ mode }) => {
                    const round = mode === 'qr' ? { tournamentId: 'cup' } : { mode: mode };
                    const config = getPestovoDisplaySettings('scoring');
                    config.order = mode === 'solo' ? ['holes', 'input', 'info'] : ['info', 'holes', 'input'];
                    setPestovoDisplaySettings('scoring', config);
                    pestovoApplyScoringDisplay(round);
                    if (mode === 'qr') {
                        const override = getPestovoDisplaySettings('tournamentScoring');
                        override.order = ['holes', 'input', 'info'];
                        setPestovoDisplaySettings('tournamentScoring', override);
                        pestovoApplyScoringDisplay(round);
                    }
                }, { mode });
                const report = await page.evaluate(mode => {
                    const root = document.querySelector('[data-test-mode="' + mode + '"]');
                    const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, height: r.height }; };
                    const blocks = Array.from(root.children).filter(el => el.hasAttribute('data-entry-block')).map(el => el.dataset.entryBlock);
                    const taps = Array.from(root.querySelectorAll('.hole-btn,.dual-btn,.score-plus,.score-minus,.btn-block'));
                    const labels = Array.from(root.querySelectorAll('.dual-half__name')).map(el => rect(el));
                    return {
                        overflow: document.documentElement.scrollWidth > innerWidth + 1,
                        root: rect(root), blocks,
                        taps: taps.map(el => ({ height: rect(el).height, left: rect(el).left, right: rect(el).right })),
                        labelsFit: labels.every(box => box.left >= -1 && box.right <= innerWidth + 1),
                        hiddenPar: root.querySelector('[data-display-key="par"]')?.getAttribute('data-display-hidden') === 'true'
                    };
                }, mode);
                assert.strictEqual(report.overflow, false, 'no page-level horizontal overflow: ' + width + 'px / ' + mode);
                assert(report.root.width > 0 && report.root.right <= width + 1, 'score card fits viewport: ' + width + 'px / ' + mode);
                assert(report.labelsFit, 'full names remain inside score panels: ' + width + 'px / ' + mode);
                assert(report.taps.every(target => target.height >= 44 && target.left >= -1 && target.right <= width + 1),
                    'every score action remains a visible 44px+ touch target: ' + width + 'px / ' + mode);
                if (mode === 'solo') assert.deepStrictEqual(report.blocks, ['holes', 'input', 'info'], 'solo order applies');
                else if (mode === 'qr') {
                    assert.deepStrictEqual(report.blocks, ['holes', 'input', 'info'], 'QR override order applies');
                    assert.strictEqual(report.hiddenPar, true, 'QR-only visibility override applies');
                } else assert.deepStrictEqual(report.blocks, ['info', 'holes', 'input'], 'global score-entry order applies');
                console.log('  ' + width + 'px / ' + mode + ': fits, targets ≥44px, order and visibility applied');
            }
        }
        await page.locator('.hole-nav .hole-btn').first().click();
        assert.strictEqual(await page.evaluate(() => window.holeTapped), 1, 'reordered hole navigation retains click handlers');
        assert.deepStrictEqual(errors, [], 'no uncaught score-entry browser errors');
        console.log('PASS: redesigned score-entry screens at 320–768px');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
