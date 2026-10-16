#!/usr/bin/env node
'use strict';
// Offline Chromium coverage for public tournament layouts and their controls.
// No Firebase connection: the page uses deterministic fixtures and real CSS/JS.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const { chromium } = require('playwright');
const chromiumBinary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
const widths = [320, 360, 390, 430, 768];
const pageLayouts = ['cards', 'timeline', 'compact'];
const rosterVariants = ['1', '2', '3', '4'];
const leaderboardVariants = ['1', '2', '3', '4', '5'];

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function publicMain() {
    const dom = new JSDOM(read('tournaments.html'));
    const main = dom.window.document.querySelector('main.tn-public-main');
    assert(main, 'tournaments.html contains the public main');
    return main.outerHTML;
}

const players = {
    p1: { uid: 'p1', name: 'Иван Иванов', handicap: 12.4, gender: 'men', tee: 'wh', registeredAt: '2026-10-01' },
    p2: { uid: 'p2', name: 'Анна Петрова', handicap: 18.2, gender: 'women', tee: 'rd', registeredAt: '2026-10-02' },
    p3: { uid: 'p3', name: 'Пётр Сидоров', handicap: 7.1, gender: 'men', tee: 'bl', registeredAt: '2026-10-03' },
    guest_4: { name: 'Гость Клуба', handicap: 24.0, gender: 'men', tee: 'wh', guest: true, registeredAt: '2026-10-04' }
};
const tournament = {
    name: 'Осенний кубок Пестово — длинное название турнира',
    date: '2099-09-18',
    endDate: '2099-09-18',
    status: 'upcoming',
    formats: ['Stroke Play (Net)'],
    description: 'Открытый клубный турнир на восемнадцать лунок. Регистрация доступна всем участникам клуба.',
    tees: ['wh', 'bl', 'rd'],
    roundsMeta: [{ name: 'Основной раунд' }],
    registration: { enabled: true, limit: 80, approval: 'manual', waitlist: true },
    registeredPlayers: players,
    waitlist: {},
    divisions: [
        { id: 'men', name: 'Мужчины', gender: 'men', hcpFrom: 0, hcpTo: 30 },
        { id: 'women', name: 'Женщины', gender: 'women', hcpFrom: 0, hcpTo: 54 }
    ]
};
const scores = {};
for (let hole = 1; hole <= 18; hole++) scores[hole] = 4;
const round = {
    tournamentId: 'future', status: 'active', tee: 'wh', startHole: 1,
    players: {
        p1: { name: 'Иван Иванов', gender: 'men', tee: 'wh', exactHcp: 12.4, fieldHcp: 12, scores },
        p2: { name: 'Анна Петрова', gender: 'women', tee: 'rd', exactHcp: 18.2, fieldHcp: 18, scores: Object.assign({}, scores, { 1: 5, 2: 5 }) },
        p3: { name: 'Пётр Сидоров', gender: 'men', tee: 'bl', exactHcp: 7.1, fieldHcp: 7, scores: Object.assign({}, scores, { 1: 3, 2: 3 }) }
    }
};

(async function() {
    const browser = await chromium.launch({
        executablePath: await chromiumBinary.executablePath(),
        args: chromiumBinary.args,
        headless: true,
        env: process.env.CHROMIUM_EXTRA_LIBS
            ? Object.assign({}, process.env, { LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS })
            : undefined
    });
    try {
        const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
            serviceWorkers: 'block'
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route => route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>'
        }));
        await page.goto('http://tournaments-mobile.test');
        await page.addStyleTag({ path: path.join(root, 'css/style.css') });
        await page.addStyleTag({ path: path.join(root, 'css/tournament-redesign.css') });
        await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important;}' });
        await page.evaluate(html => { document.body.innerHTML = html; }, publicMain());
        // js/ui-events.js обязателен: inline-обработчиков в разметке больше нет,
        // клики по [data-act] ловит его слушатель на document. Без него кнопка
        // предпросмотра ничего не меняет, а фичевый скрипт падает на pestovoOnAction.
        for (const file of ['ui-events', 'course-config', 'date-range', 'dom', 'format', 'i18n', 'utils', 'tournament-core', 'tournaments', 'tournament-public']) {
            await page.addScriptTag({ path: path.join(root, 'js', file + '.js') });
        }
        await page.evaluate(({ tournament, players, round }) => {
            currentLang = 'ru';
            localStorage.clear();
            window.db = null;
            window.toast = function() {};
            const state = window.TournamentPublicState;
            state.tournaments = { future: Object.assign({}, tournament) };
            state.rounds = { r1: round };
            state.protocols = {};
            state.course = { name: 'Поле Пестово', address: 'Московская область' };
            state.tournamentsLoaded = true;
            state.detailId = null;
            state.detailTab = 'overview';
            state.query = '';
            state.initialized = true;
            window.tnPublicRender();
            document.getElementById('tn-public-detail').classList.remove('hidden');
            document.getElementById('tn-public-catalog').classList.add('hidden');
            const lbPanel = document.createElement('div');
            lbPanel.id = 'tnlb-display';
            document.body.appendChild(lbPanel);
            // Isolate deterministic score aggregation while keeping the real
            // tournament leaderboard renderer and all five presentation branches.
            window.calcRoundStats = function(scoreValues) {
                const holes = Object.keys(scoreValues || {}).filter(key => scoreValues[key] !== '' && scoreValues[key] != null).length;
                const gross = Object.keys(scoreValues || {}).reduce((total, key) => total + (parseInt(scoreValues[key], 10) || 0), 0);
                return { holesPlayed: holes, gross, parPlayed: holes * 4, net: gross - 10, stablefordField: holes * 2 };
            };
            window.tnLbRounds = { r1: round };
            window.tnCache.display = Object.assign({}, tournament, { registeredPlayers: players, status: 'active' });
            window.tnScBuildCards = function() {};
        }, { tournament, players, round });

        // Every public page preset is a live CSS/JS behavior, not just a stored value.
        for (const width of widths) {
            await page.setViewportSize({ width, height: 844 });
            for (const variant of pageLayouts) {
                await page.evaluate(layout => {
                    setPestovoDisplaySettings('tournaments', {
                        layout, order: ['active', 'upcoming', 'archive'], visible: {}
                    });
                    tnPublicRender();
                }, variant);
                const catalog = await page.evaluate(() => {
                    const cards = Array.from(document.querySelectorAll('#tn-list .tn-public-card'));
                    const main = document.querySelector('.tn-public-main');
                    const rect = element => {
                        const r = element.getBoundingClientRect();
                        return { width: r.width, height: r.height, left: r.left, right: r.right };
                    };
                    const card = cards[0];
                    const actionable = card && card.querySelector('.tn-public-open');
                    const actionRect = actionable && rect(actionable);
                    return {
                        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
                        coarsePointer: matchMedia('(pointer: coarse)').matches,
                        cardCount: cards.length,
                        contentWidth: main ? main.getBoundingClientRect().width : 0,
                        contentHeight: main ? main.getBoundingClientRect().height : 0,
                        nameVisible: !!(card && card.querySelector('h3 button') && card.querySelector('h3 button').getBoundingClientRect().width),
                        actionHeight: actionRect ? actionRect.height : 0,
                        actionLeft: actionRect ? actionRect.left : 0,
                        actionRight: actionRect ? actionRect.right : 0,
                        actionMinHeight: actionable ? getComputedStyle(actionable).minHeight : '',
                        actionMatches: actionable ? { pageBtn: actionable.matches('.tn-public-main .btn'), smBtn: actionable.matches('.tn-public-main .btn.btn-sm') } : null,
                        actionCssHeight: actionable ? getComputedStyle(actionable).height : '',
                        actionTransform: actionable ? getComputedStyle(actionable).transform : '',
                        cardGeometry: card ? Object.fromEntries(['.tn-public-card','.tn-public-card-body','.tn-public-card-top','.tn-public-meta','.tn-public-card-actions'].map(sel => { const el = card.querySelector(sel) || (card.matches(sel) ? card : null); const r = el && el.getBoundingClientRect(); return [sel, r ? { left: r.left, right: r.right, width: r.width, height: r.height, minWidth: getComputedStyle(el).minWidth } : null]; })) : null,
                        actionInViewport: !!(actionRect && actionRect.left >= 0 && actionRect.right <= innerWidth + 1),
                        layout: main ? main.getAttribute('data-tournaments-layout') : ''
                    };
                });
                assert.strictEqual(catalog.cardCount, 1, 'Catalog rendered for ' + width + 'px / page layout ' + variant);
                assert.strictEqual(catalog.layout, variant, 'Selected public tournament layout is applied');
                assert.strictEqual(catalog.pageOverflow, false, 'Catalog fits viewport: ' + width + 'px / layout ' + variant);
                assert(catalog.nameVisible, 'Tournament name is present: ' + width + 'px / variant ' + variant);
                assert(catalog.actionInViewport, 'Catalog action is within viewport: ' + width + 'px / variant ' + variant + ' ' + JSON.stringify(catalog));
                assert(catalog.actionHeight >= 44, 'Catalog action has 44px touch target: ' + width + 'px / variant ' + variant + ' (' + catalog.actionHeight + 'px)');

                // Open actual detail view and exercise all five tab actions.
                await page.evaluate(() => window.tnPublicOpenDetail('future', 'overview'));
                const tabs = await page.locator('#tn-detail-content .tn-detail-tab').count();
                assert(tabs >= 5, 'All detail tabs rendered: ' + width + 'px / variant ' + variant);
                const tabReport = await page.evaluate(() => {
                    const wrap = document.querySelector('.tn-detail-tabs');
                    const rect = el => { const r = el.getBoundingClientRect(); return { height: r.height, top: r.top, bottom: r.bottom }; };
                    return {
                        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
                        stripOverflow: wrap ? wrap.scrollWidth > wrap.clientWidth + 1 : false,
                        tabsFit: wrap ? Array.from(wrap.querySelectorAll('.tn-detail-tab')).every(el => { const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect(); return r.left >= w.left - 1 && r.right <= w.right + 1; }) : false,
                        heights: Array.from(document.querySelectorAll('.tn-detail-tab')).map(el => rect(el).height),
                        titleWidth: document.querySelector('#tn-detail-title')?.getBoundingClientRect().width || 0,
                        tabCount: document.querySelectorAll('.tn-detail-tab').length
                    };
                });
                assert.strictEqual(tabReport.pageOverflow, false, 'Detail fits viewport: ' + width + 'px / variant ' + variant);
                assert(tabReport.stripOverflow || tabReport.tabsFit, 'Detail tabs are visible or available by horizontal touch scroll: ' + width + 'px / variant ' + variant);
                assert(tabReport.heights.every(height => height >= 44), 'Detail tab targets are >=44px: ' + width + 'px / variant ' + variant + ' (' + tabReport.heights.join(',') + ')');
                for (const tab of ['start', 'participants', 'leaderboard', 'protocol', 'overview']) {
                    await page.locator('[data-tn-detail-tab="' + tab + '"]').click();
                    assert.strictEqual(await page.locator('.tn-detail-panel').count(), 1, 'Detail tab ' + tab + ' renders: ' + width + 'px / variant ' + variant);
                }
                await page.evaluate(() => {
                    TournamentPublicState.detailId = null;
                    TournamentPublicState.detailTab = 'overview';
                    tnPublicRender();
                });
            }
        }

        // Exercise every participant-list presentation, with and without groups.
        for (const width of widths) {
            await page.setViewportSize({ width, height: 844 });
            for (const groupsVisible of [false, true]) {
                await page.evaluate(show => {
                    applyTnGroupsVisible(show);
                    document.getElementById('tn-public-detail').classList.remove('hidden');
                    document.getElementById('tn-public-catalog').classList.add('hidden');
                    const fixture = Object.assign({}, TournamentPublicState.tournaments.future);
                    const html = tnRosterGroupedHtml('future', fixture, fixture.registeredPlayers, Object.keys(fixture.registeredPlayers).length);
                    document.getElementById('tn-detail-content').innerHTML = '<div id="roster-check">' + html + '</div>';
                }, groupsVisible);
                for (const variant of rosterVariants) {
                    await page.evaluate(v => {
                        applyTnRosterVariant(v);
                        const fixture = Object.assign({}, TournamentPublicState.tournaments.future);
                        const html = tnRosterGroupedHtml('future', fixture, fixture.registeredPlayers, Object.keys(fixture.registeredPlayers).length);
                        document.getElementById('tn-detail-content').innerHTML = '<div id="roster-check">' + html + '</div>';
                    }, variant);
                    const roster = await page.evaluate(() => {
                        const host = document.getElementById('roster-check');
                        const name = host && host.querySelector('strong');
                        const target = name && name.getBoundingClientRect();
                        const wrapper = host && host.querySelector('.tn-roster-table, .tn-roster-group-list');
                        const tableWrap = host && host.querySelector('[style*="overflow-x:auto"]');
                        return {
                            pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
                            contentWidth: host ? host.getBoundingClientRect().width : 0,
                            contentHeight: host ? host.getBoundingClientRect().height : 0,
                            nameVisible: !!(target && target.width > 0 && target.left >= 0 && target.right <= innerWidth + 1),
                            nameText: name ? name.textContent : '',
                            groupCount: host ? host.querySelectorAll('.tn-group').length : 0,
                            tableCount: host ? host.querySelectorAll('table').length : 0,
                            listRows: host ? host.querySelectorAll('.tn-roster-player-row').length : 0,
                            scrollContainer: !!(wrapper || tableWrap),
                            nestedOverflow: tableWrap ? tableWrap.scrollWidth > tableWrap.clientWidth + 1 : false
                        };
                    });
                    assert.strictEqual(roster.pageOverflow, false, 'Roster fits viewport: ' + width + 'px / groups ' + groupsVisible + ' / view ' + variant);
                    assert(roster.contentWidth > 0 && roster.contentHeight > 0, 'Roster layout has dimensions: ' + width + 'px / groups ' + groupsVisible + ' / view ' + variant);
                    assert(roster.nameVisible, 'Roster name remains visible: ' + width + 'px / groups ' + groupsVisible + ' / view ' + variant);
                    assert(roster.nameText.length > 0, 'Roster contains participant text: ' + width + 'px / view ' + variant);
                    if (variant === '1' || variant === '4') {
                        assert(roster.tableCount > 0, 'Table roster variant ' + variant + ' renders a table');
                        assert(roster.scrollContainer, 'Table roster variant ' + variant + ' is inside a touch-scroll container');
                    } else assert.strictEqual(roster.listRows, 4, 'Card/list roster variant ' + variant + ' renders all participants');
                    if (groupsVisible) assert(roster.groupCount >= 2, 'Grouped roster creates group panels: ' + width + 'px / view ' + variant);
                }
            }
        }

        // Exercise each internal tournament leaderboard renderer with mobile CSS.
        for (const width of widths) {
            await page.setViewportSize({ width, height: 844 });
            for (const variant of leaderboardVariants) {
                await page.evaluate(v => {
                    applyTnGroupsVisible(false);
                    applyTnLbVariant(v);
                    const panel = document.getElementById('tnlb-display');
                    panel.innerHTML = '';
                    tnCache.display.status = 'active';
                    tnLbRounds = { r1: Object.assign({}, TournamentPublicState.rounds.r1, { tournamentId: 'display' }) };
                    renderTnLeaderboard('display');
                }, variant);
                const board = await page.evaluate(() => {
                    const panel = document.getElementById('tnlb-display');
                    const name = panel.querySelector('.tn-lb-card-name, .tn-lb-live-name, .tn-lb-table .lb-card-main, table .lb-card-main');
                    const rect = name && name.getBoundingClientRect();
                    const scrolls = Array.from(panel.querySelectorAll('[style*="overflow-x:auto"]'));
                    return {
                        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
                        panelWidth: panel.getBoundingClientRect().width,
                        panelHeight: panel.getBoundingClientRect().height,
                        nameVisible: !!(rect && rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth + 1),
                        nameText: name ? name.textContent : '',
                        variantClass: panel.querySelector('.tn-lb-variant')?.className || '',
                        panelText: panel.innerText,
                        rounds: Object.keys(window.tnLbRounds || {}),
                        roundTournamentId: window.tnLbRounds && window.tnLbRounds.r1 && window.tnLbRounds.r1.tournamentId,
                        cacheReady: !!window.tnCache.display,
                        cardCount: panel.querySelectorAll('.tn-lb-card').length,
                        liveRows: panel.querySelectorAll('.tn-lb-live-row').length,
                        rows: panel.querySelectorAll('tbody tr').length,
                        scorecardOpens: (panel.querySelector('[onclick*="tnScOpen"]') || {}).getAttribute?.('onclick') || '',
                        hasHorizontalScroll: scrolls.some(el => el.scrollWidth > el.clientWidth + 1),
                        scrollWrapperCount: scrolls.length
                    };
                });
                assert.strictEqual(board.pageOverflow, false, 'Leaderboard fits viewport: ' + width + 'px / view ' + variant);
                assert(board.panelWidth > 0 && board.panelHeight > 0, 'Leaderboard layout has dimensions: ' + width + 'px / view ' + variant);
                assert(board.nameVisible, 'Leaderboard player name remains visible: ' + width + 'px / view ' + variant + ' ' + JSON.stringify(board));
                assert(board.nameText.length > 0, 'Leaderboard contains player text: ' + width + 'px / view ' + variant);
                assert.match(board.variantClass, new RegExp('tn-lb-v' + variant), 'Leaderboard applied requested style ' + variant);
                if (variant === '3') assert(board.cardCount >= 3, 'Card grid variant renders all competitors');
                else if (variant === '5') assert(board.liveRows >= 3, 'Live-list variant renders all competitors');
                else {
                    assert(board.rows >= 3, 'Table variant ' + variant + ' renders all competitors');
                    assert(board.scrollWrapperCount > 0, 'Table variant ' + variant + ' is inside a touch-scroll container');
                }
                assert(board.scorecardOpens.includes('tnScOpen'), 'Leaderboard entries keep their scorecard action: ' + width + 'px / view ' + variant);
            }
        }

        assert.deepStrictEqual(errors, [], 'No uncaught browser errors');
        console.log('PASS: tournament page layouts (3), roster layouts (4 × grouped/flat), leaderboard layouts (5), detail tabs, 320–768px touch viewports');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exit(1); });
