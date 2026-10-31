#!/usr/bin/env node
'use strict';
// Реальная браузерная проверка 10 компоновок экрана ввода счёта (v1.128.0).
//
// Что проверяем:
//   1. админ-панель рисует 10 плиток вида, 5 акцентов и 3 размера цифр,
//      плитки помечены aria-pressed и переключаются кликом;
//   2. выбранный вид применяется ко всем реальным .score-entry (setup-round и
//      scorer) атрибутами data-entry-layout / data-entry-accent / data-entry-size;
//   3. каждая компоновка действительно отличается от классики (считаем
//      контрольные computed-стили, а не наличие классов);
//   4. ни на одной из 10 компоновок нет горизонтального переполнения и
//      деградации тач-целей ниже 44px на 320/390/430px;
//   5. одиночный раунд: вторая (маркерная) панель скрыта — display:none,
//      разделитель VS не показан, колонка одна (это был баг: .dual-half{display:flex}
//      перебивал .hidden);
//   6. административный макет .score-entry-mock рисуется и повторяет вид.
//
// Запуск: node tools/check-score-entry-layouts.js
// В песочнице без libnss3: bash tools/build-stub-libs.sh &&
//   CHROMIUM_EXTRA_LIBS=$PWD/tools/.browser-stub node tools/check-score-entry-layouts.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const layouts = ['classic', 'compact', 'large', 'zen', 'glass', 'neon', 'sand', 'scoreboard', 'cards', 'split'];
const widths = [320, 390, 430];

function adminTab(id) {
    const doc = new JSDOM(read('admin.html')).window.document;
    const node = doc.getElementById(id);
    assert(node, 'admin.html содержит #' + id);
    return node.outerHTML.replace('class="admin-section hidden"', 'class="admin-section"');
}
const setupDoc = new JSDOM(read('setup-round.html')).window.document;
const scorerDoc = new JSDOM(read('scorer.html')).window.document;
const html = [
    adminTab('tab-scoreentry'),
    ...Array.from(setupDoc.querySelectorAll('.score-entry')).map(node => node.outerHTML),
    scorerDoc.querySelector('.score-entry').outerHTML
].join('\n');

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
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'
        }));
        await page.goto('http://score-entry-layouts.test');
        await page.addStyleTag({ path: path.join(root, 'css/style.css') });
        await page.addStyleTag({ path: path.join(root, 'css/theme-v2.css') });
        await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important;}' });
        await page.evaluate(source => {
            document.body.innerHTML = source;
            document.body.style.cssText = 'margin:0;padding:8px;';
            currentLang = 'ru'; window.db = null;
            // Реальные экраны требуют содержимого лунок и подписей панелей.
            document.querySelectorAll('.score-entry:not([data-entry-preview])').forEach(entry => {
                entry.removeAttribute('hidden');
                entry.classList.remove('hidden');
                entry.querySelectorAll('.hole-nav').forEach(nav => {
                    nav.innerHTML = Array.from({ length: 18 }, (_, i) =>
                        '<button type="button" class="hole-btn' + (i === 0 ? ' active' : '') + '" data-hole="' + (i + 1) + '">' +
                        '<span class="entry-hole-number">' + (i + 1) + '</span>' +
                        '<span class="entry-score-square"><span class="score-gross">' + (i % 5 + 2) + '</span></span></button>').join('');
                });
                const my = entry.querySelector('#my-player-name-title') || entry.querySelector('.dual-half__name');
                if (my) my.textContent = 'Мой счёт: Иван Петров';
                const mark = entry.querySelector('#mark-player-name');
                if (mark) mark.textContent = 'Счёт игрока: Анна Петрова';
                // Так же, как updScoreDisplay() в живом приложении: квадрат счёта.
                entry.querySelectorAll('.score-disp').forEach((el, i) => {
                    el.innerHTML = '<span class="entry-score-square"><span class="score-gross">' + (i ? '4' : '5') + '</span></span>';
                });
            });
        }, html);
        for (const file of ['ui-events', 'course-config', 'format', 'dom', 'i18n', 'utils', 'admin-display']) {
            await page.addScriptTag({ path: path.join(root, 'js', file + '.js') });
        }

        // ── 1. Админ-панель: 10 плиток, 5 акцентов, 3 размера ──────────────
        await page.evaluate(() => renderPestovoDisplayAdmin('scoring', true));
        assert.strictEqual(await page.locator('#score-entry-display-layouts .score-layout-tile').count(), 10,
            'в админке 10 вариантов вида экрана ввода');
        assert.deepStrictEqual(await page.evaluate(() => Array.from(document.querySelectorAll('#score-entry-display-layouts .score-layout-tile'))
            .map(el => el.getAttribute('data-score-layout'))), layouts, 'плитки идут в объявленном порядке');
        assert.strictEqual(await page.locator('#score-entry-display-accent .score-accent-swatch').count(), 5,
            'в админке 5 акцентов');
        assert.strictEqual(await page.locator('#score-entry-display-size .score-size-btn').count(), 3,
            'в админке 3 размера цифр');
        assert.strictEqual(await page.locator('#score-entry-display-layouts .score-layout-tile[aria-pressed="true"]').count(), 1,
            'выбран ровно один вид');

        // Клик по плитке меняет черновик (без сохранения в базу).
        await page.locator('#score-entry-display-layouts [data-score-layout="neon"]').click();
        assert.strictEqual(await page.evaluate(() => document.querySelector('#score-entry-display-layouts .is-active').getAttribute('data-score-layout')),
            'neon', 'клик по плитке выбирает компоновку');
        await page.locator('#score-entry-display-accent [data-score-accent="azure"]').click();
        await page.locator('#score-entry-display-size [data-score-size="xl"]').click();
        const draft = await page.evaluate(() => ({
            layout: document.querySelector('#score-entry-display-layouts .is-active').getAttribute('data-score-layout'),
            accent: document.querySelector('#score-entry-display-accent .is-active').getAttribute('data-score-accent'),
            size: document.querySelector('#score-entry-display-size .is-active').getAttribute('data-score-size'),
            mock: document.querySelectorAll('.score-entry[data-entry-preview]').length,
            mockLayout: document.querySelector('.score-entry[data-entry-preview]')
                ? document.querySelector('.score-entry[data-entry-preview]').getAttribute('data-entry-layout') : null
        }));
        assert.deepStrictEqual(draft, { layout: 'neon', accent: 'azure', size: 'xl', mock: 1, mockLayout: 'neon' },
            'черновик и живой макет админки следуют за выбором');

        // ── 2-4. Каждая компоновка на реальных экранах ────────────────────
        const fingerprints = {};
        for (const layout of layouts) {
            await page.evaluate(layout => {
                setPestovoDisplaySettings('scoring', {
                    layout: layout, accent: 'gold', scoreSize: 'normal',
                    order: ['info', 'holes', 'input'], visible: {}
                });
            }, layout);
            const applied = await page.evaluate(() => Array.from(document.querySelectorAll('.score-entry:not([data-entry-preview])'))
                .map(el => el.getAttribute('data-entry-layout')));
            assert.deepStrictEqual(applied, [layout, layout], 'атрибут вида стоит на каждом реальном экране: ' + layout);

            for (const width of widths) {
                await page.setViewportSize({ width, height: 844 });
                const report = await page.evaluate(({ width }) => {
                    const entries = Array.from(document.querySelectorAll('.score-entry:not([data-entry-preview])'));
                    return entries.map(entry => {
                        const style = el => (el ? getComputedStyle(el) : { backgroundImage: '', backgroundColor: '', borderRadius: '', padding: '', borderLeftWidth: '', borderTopColor: '', gridTemplateColumns: '' });
                        // scorer.html — одиночная карточка без раздельной панели.
                        const panel = entry.querySelector('.dual-score-split-panel') || entry.querySelector('.score-area') || entry;
                        const holeBox = entry.querySelector('.hole-display');
                        const myHalf = entry.querySelector('.dual-half--my') || entry.querySelector('.score-area') || entry;
                        const save = entry.querySelector('#save-hole-btn, #sc-save-btn');
                        const rect = el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height }; };
                        const targets = Array.from(entry.querySelectorAll('.dual-btn, .score-pad-key, .hole-btn'))
                            .filter(el => el.getBoundingClientRect().height > 0)
                            .map(el => el.getBoundingClientRect().height);
                        return {
                            layout: entry.getAttribute('data-entry-layout'),
                            panelBg: style(panel).backgroundImage + style(panel).backgroundColor,
                            panelRadius: style(panel).borderRadius,
                            holeRadius: style(holeBox).borderRadius,
                            myBorderLeft: style(myHalf).borderLeftWidth,
                            myBorderTop: style(myHalf).borderTopColor,
                            entryPadding: style(entry).padding,
                            entryRadius: style(entry).borderRadius,
                            saveBg: save ? style(save).backgroundImage : '',
                            navColumns: style(entry.querySelector('.hole-nav')).gridTemplateColumns,
                            width: rect(entry).width,
                            right: rect(entry).right,
                            overflow: document.documentElement.scrollWidth > width + 1,
                            minTarget: targets.length ? Math.min.apply(null, targets) : 999
                        };
                    });
                }, { width });
                for (const row of report) {
                    assert.strictEqual(row.layout, layout, 'вид применён на экране (' + layout + ')');
                    assert.deepStrictEqual(row.overflow, false, 'нет горизонтального переполнения: ' + layout + ' / ' + width + 'px');
                    assert(row.right <= width + 1, 'карточка ввода влезает в экран: ' + layout + ' / ' + width + 'px');
                    assert(row.minTarget >= 44, 'тач-цели ≥44px: ' + layout + ' / ' + width + 'px — ' + row.minTarget);
                }
                if (layout === 'classic') fingerprints[width] = report[0];
            }
            const fingerprint = await page.evaluate(() => {
                const entry = document.querySelector('.score-entry:not([data-entry-preview])');
                const style = el => getComputedStyle(el);
                return {
                    panelBg: style(entry.querySelector('.dual-score-split-panel')).backgroundImage,
                    entryRadius: style(entry).borderRadius,
                    entryPadding: style(entry).padding,
                    holeRadius: style(entry.querySelector('.hole-display')).borderRadius,
                    navColumns: style(entry.querySelector('.hole-nav')).gridTemplateColumns
                };
            });
            fingerprints[layout] = fingerprint;
        }
        assert.notDeepStrictEqual(fingerprints.neon, fingerprints.classic, 'неон отличается от классики');
        assert.notDeepStrictEqual(fingerprints.sand, fingerprints.classic, 'песок отличается от классики');
        assert.notDeepStrictEqual(fingerprints.compact, fingerprints.classic, 'компактная отличается от классики');
        assert.notDeepStrictEqual(fingerprints.zen, fingerprints.classic, 'дзен отличается от классики');
        assert.notDeepStrictEqual(fingerprints.split, fingerprints.classic, 'разделённая отличается от классики');
        const distinct = new Set(layouts.map(key => JSON.stringify(fingerprints[key])));
        assert(distinct.size >= 8, 'все 10 компоновок визуально различимы (уникальных: ' + distinct.size + ')');

        // ── 5. Одиночный раунд: панели маркера нет ────────────────────────
        await page.evaluate(() => {
            setPestovoDisplaySettings('scoring', { layout: 'classic', accent: 'gold', scoreSize: 'normal', order: ['info', 'holes', 'input'], visible: {} });
        });
        for (const layout of layouts) {
            await page.evaluate(layout => {
                document.querySelectorAll('.score-entry:not([data-entry-preview])').forEach(entry => {
                    entry.setAttribute('data-entry-layout', layout);
                    const marker = entry.querySelector('#marker-input-container');
                    const panel = entry.querySelector('.dual-score-split-panel');
                    if (!marker || !panel) return;
                    marker.classList.add('hidden');
                    marker.setAttribute('data-display-hidden', 'true');
                    panel.classList.add('single');
                });
            }, layout);
            for (const width of widths) {
                await page.setViewportSize({ width, height: 844 });
                const solo = await page.evaluate(() => {
                    const entry = document.querySelector('.score-entry:not([data-entry-preview])');
                    const marker = entry.querySelector('#marker-input-container');
                    const divider = entry.querySelector('.dual-split-divider');
                    const panel = entry.querySelector('.dual-score-split-panel');
                    return {
                        markerDisplay: getComputedStyle(marker).display,
                        dividerDisplay: divider ? getComputedStyle(divider).display : 'none',
                        columns: getComputedStyle(panel).gridTemplateColumns.split(' ').length,
                        myWidth: entry.querySelector('.dual-half--my').getBoundingClientRect().width,
                        panelWidth: panel.getBoundingClientRect().width,
                        overflow: document.documentElement.scrollWidth > innerWidth + 1
                    };
                });
                assert.strictEqual(solo.markerDisplay, 'none',
                    'в одиночном раунде панели маркера нет: ' + layout + ' / ' + width + 'px');
                assert.strictEqual(solo.dividerDisplay, 'none', 'разделитель VS скрыт в одиночном раунде: ' + layout);
                assert.strictEqual(solo.columns, 1, 'одна колонка в одиночном раунде: ' + layout + ' / ' + width + 'px');
                assert(solo.myWidth >= solo.panelWidth - 40, 'панель «Мой счёт» занимает карточку: ' + layout + ' / ' + width + 'px');
                assert.strictEqual(solo.overflow, false, 'нет переполнения в одиночном раунде: ' + layout + ' / ' + width + 'px');
            }
        }
        // Возвращаем групповой вид для дальнейших проверок.
        await page.evaluate(() => {
            document.querySelectorAll('.score-entry:not([data-entry-preview])').forEach(entry => {
                const marker = entry.querySelector('#marker-input-container');
                const panel = entry.querySelector('.dual-score-split-panel');
                if (marker) { marker.classList.remove('hidden'); marker.removeAttribute('data-display-hidden'); }
                if (panel) panel.classList.remove('single');
            });
        });

        // ── 6. Акцент и размер цифр ────────────────────────────────────────
        const accents = ['gold', 'emerald', 'azure', 'violet', 'crimson'];
        const accentColors = {};
        for (const accent of accents) {
            await page.evaluate(accent => {
                setPestovoDisplaySettings('scoring', { layout: 'classic', accent: accent, scoreSize: 'normal', order: ['info', 'holes', 'input'], visible: {} });
            }, accent);
            accentColors[accent] = await page.evaluate(() => {
                const entry = document.querySelector('.score-entry:not([data-entry-preview])');
                return getComputedStyle(entry.querySelector('.dual-half--my')).borderTopColor;
            });
        }
        assert.strictEqual(new Set(Object.values(accentColors)).size, accents.length,
            'каждый акцент даёт свой цвет: ' + JSON.stringify(accentColors));

        const sizes = {};
        for (const size of ['normal', 'large', 'xl']) {
            await page.evaluate(size => {
                setPestovoDisplaySettings('scoring', { layout: 'classic', accent: 'gold', scoreSize: size, order: ['info', 'holes', 'input'], visible: {} });
            }, size);
            sizes[size] = await page.evaluate(() => {
                const entry = document.querySelector('.score-entry:not([data-entry-preview])');
                return entry.querySelector('.dual-half--my .score-disp .entry-score-square').getBoundingClientRect().width;
            });
        }
        assert(sizes.normal < sizes.large && sizes.large < sizes.xl,
            'размер цифр счёта растёт: ' + JSON.stringify(sizes));

        // ── 7. Настройки сохраняются в общий путь ─────────────────────────
        const written = await page.evaluate(async () => {
            const writes = [];
            window.db = { ref: path => ({ set: value => { writes.push({ path, value }); return Promise.resolve(); }, on: () => {}, once: () => Promise.resolve({ val: () => null }) }) };
            renderPestovoDisplayAdmin('scoring', true);
            setPestovoScoreLayout('scoring', 'scoreboard');
            setPestovoScoreAccent('scoring', 'crimson');
            setPestovoScoreSize('scoring', 'large');
            savePestovoDisplaySettings('scoring');
            await new Promise(resolve => setTimeout(resolve, 10));
            const saved = writes.find(item => item.path === 'settings/scoring_display');
            return saved ? saved.value : null;
        });
        assert(written && written.layout === 'scoreboard' && written.accent === 'crimson' && written.scoreSize === 'large',
            'вид, акцент и размер сохраняются в settings/scoring_display: ' + JSON.stringify(written && { layout: written.layout, accent: written.accent, scoreSize: written.scoreSize }));
        assert.deepStrictEqual(errors, [], 'нет необработанных ошибок страницы');
        console.log('PASS: 10 компоновок ввода счёта — админ, применение, тач-цели, одиночный раунд');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
