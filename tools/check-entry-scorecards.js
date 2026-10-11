#!/usr/bin/env node
'use strict';
// Счётные карточки на экранах ввода счёта — проверка в реальном Chromium.
// Никогда не подключается к боевой базе: db — мок, запись фиксируется в памяти.
//
//   CHROMIUM_EXTRA_LIBS=$PWD/tools/.browser-stub node tools/check-entry-scorecards.js
//
// Проверяет на ширинах 320 / 390 / 430 px:
//  • вкладка админки: 5 видов для каждой карточки, касание ≥ 44 px, превью обновляется;
//  • превью и вид на экране ввода (10 видов × размеры s/m/l) не создают прокрутку страницы;
//  • прокрутка только внутри .esc-scroll (широкие таблицы), не у страницы;
//  • «Применить для всех» пишет settings/entry_scorecard_display, а превью — нет;
//  • скриншоты складываются в /tmp/entry-sc-shots (вне репозитория).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const chromiumBinary = require('@sparticuz/chromium');

const root = path.join(__dirname, '..');
const shots = '/tmp/entry-sc-shots';

(async function() {
    const browser = await chromium.launch({
        executablePath: await chromiumBinary.executablePath(),
        args: chromiumBinary.args,
        headless: true,
        env: process.env.CHROMIUM_EXTRA_LIBS ? Object.assign({}, process.env, {
            LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS + ':' + (process.env.LD_LIBRARY_PATH || '')
        }) : process.env
    });
    try {
        fs.mkdirSync(shots, { recursive: true });
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
        await page.goto('http://entry-scorecards.test');
        await page.addStyleTag({ path: path.join(root, 'css/style.css') });
        await page.addStyleTag({ path: path.join(root, 'css/entry-scorecard.css') });
        for (const file of ['course-config', 'date-range', 'dom', 'format', 'i18n', 'utils', 'entry-scorecard', 'admin-entry-scorecard']) {
            await page.addScriptTag({ path: path.join(root, 'js', file + '.js') });
        }
        const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
        const start = admin.indexOf('<div id="tab-entrycards"');
        const end = admin.indexOf('<div id="tab-', start + 10);
        assert(start > 0 && end > start, 'Вкладка tab-entrycards есть в admin.html');
        const fragment = admin.slice(start, end);

        await page.evaluate(html => {
            document.body.innerHTML = html.replace('admin-section hidden', 'admin-section');
            document.body.style.padding = '8px';
            window.saveCalls = [];
            window.failSave = false;
            window.db = { ref: function(p) { return { set: function(v) { saveCalls.push({ path: p, value: v }); return failSave ? Promise.reject(new Error('Denied')) : Promise.resolve(); } }; } };
            renderEntryScorecardAdmin();
        }, fragment);

        const noPageOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

        for (const width of [320, 390, 430]) {
            await page.setViewportSize({ width, height: 844 });
            for (const kind of ['general', 'hole']) {
                await page.evaluate(k => entryScAdmSetKind(k), kind);
                for (const v of ['1', '2', '3', '4', '5']) {
                    await page.click('.esc-admin-variants .esc-var-btn:nth-of-type(' + v + ')');
                    const btn = await page.locator('.esc-admin-variants .esc-var-btn').nth(Number(v) - 1).evaluate(b => {
                        const r = b.getBoundingClientRect();
                        return { h: r.height, left: r.left, right: r.right };
                    });
                    assert(btn.h >= 44 && btn.left >= 0 && btn.right <= width + 1, 'Кнопка вида касается ≥44px и помещается: ' + width + '/' + kind + '/' + v + ' ' + JSON.stringify(btn));
                    assert.strictEqual(await page.getAttribute('.esc-admin-variants .esc-var-btn:nth-of-type(' + v + ')', 'aria-pressed'), 'true', 'Вид отмечен: ' + kind + '/' + v);
                    assert.strictEqual(await page.locator('#esc-admin-preview section.esc-v' + v).count(), 1, 'Превью показывает вид ' + v);
                    assert.strictEqual(await noPageOverflow(), true, 'Нет прокрутки страницы в админке: ' + width + '/' + kind + '/' + v);
                    if (width === 390) {
                        await page.locator('#esc-admin-preview').screenshot({ path: path.join(shots, 'admin-' + kind + '-v' + v + '.png') });
                    }
                }
            }
        }
        assert.strictEqual(await page.evaluate(() => saveCalls.length), 0, 'Превью и выбор видов ничего не пишут в базу');

        // Вид на экране ввода: карточки всех видов и размеров без прокрутки страницы.
        const round = {
            name: 'Проверка', status: 'active', holeRange: '1-18', startHole: 1, tee: 'wh', format: 'Stroke Play',
            players: {
                a: { name: 'Анна Смирнова', tee: 'wh', fieldHcp: 12, exactHcp: 12, scores: { 1: 4, 2: 5, 3: 3, 4: 4, 5: 6, 6: 4, 7: 3 }, markedBy: 'b', markerScores: { b: { 1: 4, 2: 6, 3: 3, 4: 4, 5: 6, 6: 4, 7: 3 } } },
                b: { name: 'Иван Кузнецов', tee: 'bl', fieldHcp: 18, exactHcp: 18, scores: { 1: 5, 2: 5, 3: 4, 4: 5, 5: 5 } },
                c: { name: 'Пётр Орлов', tee: 'rd', fieldHcp: 6, exactHcp: 6, scores: { 1: 4, 2: 4, 3: 4, 4: 3, 5: 5, 6: 4 } },
                d: { name: 'Ольга Белова с очень длинной фамилией', tee: 'wh', fieldHcp: 24, exactHcp: 24, scores: { 1: 6, 2: 7, 3: 5 } }
            }
        };
        await page.evaluate(r => {
            window.testRound = r;
            var host = document.createElement('div');
            host.id = 'entry-group-host';
            var holeHost = document.createElement('div');
            holeHost.id = 'entry-hole-host';
            document.body.appendChild(host);
            document.body.appendChild(holeHost);
            var order = getRoundOrder(r);
            window.groupBuild = function() {
                return pestovoEntryRoundCardHTML(r, { showMarker: true, compact: true });
            };
            window.holeBuild = function() {
                return entryScHoleHTML(r.players.a, r, { playerId: 'a', order: order, showMarker: true }, entryScResolve('hole', r));
            };
            pestovoEntryCardsInto(host, groupBuild);
            pestovoEntryCardsInto(holeHost, holeBuild);
        }, round);

        for (const width of [320, 390, 430]) {
            await page.setViewportSize({ width, height: 844 });
            for (const v of ['1', '2', '3', '4', '5']) {
                for (const size of ['s', 'm', 'l']) {
                    await page.evaluate(([vv, ss]) => {
                        setEntryScorecardSettings({ general: { variant: vv, size: ss }, hole: { variant: vv, size: ss } });
                    }, [v, size]);
                    assert.strictEqual(await page.locator('#entry-group-host section.esc-general.esc-v' + v + '.esc-sz-' + size).count(), 1, 'Общая карточка перерисована: ' + v + '/' + size);
                    assert.strictEqual(await page.locator('#entry-hole-host section.esc-hole.esc-v' + v + '.esc-sz-' + size).count(), 1, 'Счётная карточка перерисована: ' + v + '/' + size);
                    assert.strictEqual(await noPageOverflow(), true, 'Нет прокрутки страницы на экране ввода: ' + width + '/' + v + '/' + size);
                    if (width === 390 && size === 'm') {
                        await page.locator('#entry-group-host').screenshot({ path: path.join(shots, 'group-v' + v + '.png') });
                        await page.locator('#entry-hole-host').screenshot({ path: path.join(shots, 'hole-v' + v + '.png') });
                    }
                }
            }
        }
        // Прокрутка внутри блока (а не страницы) допустима только для широких видов.
        await page.evaluate(() => setEntryScorecardSettings({ general: { variant: '1', size: 'm' }, hole: { variant: '1', size: 'm' } }));
        await page.setViewportSize({ width: 320, height: 844 });
        const scrollInside = await page.evaluate(() => {
            var sc = document.querySelector('#entry-group-host .esc-scroll');
            return sc ? sc.scrollWidth > sc.clientWidth : false;
        });
        assert.strictEqual(scrollInside, true, 'Таблица «Таблица клуба» на 320 px прокручивается внутри своего блока');
        assert.strictEqual(await noPageOverflow(), true, 'На 320 px страница не прокручивается');

        // Сохранение: мок-база получает нормализованный объект.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => { entryScAdmSetKind('general'); entryScAdmSetVariant('4'); });
        assert.strictEqual(await page.evaluate(() => saveCalls.length), 0, 'До сохранения база не трогается');
        await page.click('#entry-sc-settings button:has-text("Применить для всех")');
        await page.waitForFunction(() => saveCalls.length === 1);
        const saved = await page.evaluate(() => saveCalls[0]);
        assert.strictEqual(saved.path, 'settings/entry_scorecard_display');
        assert.strictEqual(saved.value.general.variant, '4');
        assert.strictEqual(await page.evaluate(() => getEntryScorecardSettings().general.variant), '4');
        assert.strictEqual(await page.evaluate(() => document.querySelector('#entry-group-host section').className.indexOf('esc-v4') !== -1), true, 'Открытая карточка перерисована после сохранения');

        assert.deepStrictEqual(errors, [], 'Нет ошибок JavaScript на странице: ' + errors.join('; '));
        await page.evaluate(() => setEntryScorecardSettings(null));
        console.log('check-entry-scorecards: все проверки пройдены ✔ (скриншоты: ' + shots + ')');
    } finally {
        await browser.close();
    }
})().catch(function(e) {
    console.error('check-entry-scorecards FAIL:', e && e.message ? e.message : e);
    process.exit(1);
});
