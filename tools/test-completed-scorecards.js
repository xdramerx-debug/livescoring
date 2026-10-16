#!/usr/bin/env node
'use strict';
// Regression: footer login and the global scorecard view on completed rounds.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async function() {
    const dom = new JSDOM(read('index.html'), { runScripts: 'outside-only', url: 'https://example.test/livescoring/index.html' });
    const w = dom.window, doc = w.document;
    await new Promise(resolve => w.addEventListener('load', resolve, { once: true }));
    for (const file of ['ui-events', 'course-config', 'format', 'dom', 'i18n', 'utils', 'app', 'leaderboard', 'admin-display']) {
        w.eval(read('js/' + file + '.js'));
    }
    w.currentLang = 'ru';
    w.currentUser = null;
    w.currentUserData = null;
    let opened = null;
    w.openPlayerProfileModal = uid => { opened = uid; };
    const link = doc.getElementById('footer-profile');
    assert(link.closest('.footer-grid'));
    assert.strictEqual(link.getAttribute('href'), 'auth.html');
    for (const user of [null, { uid: 'guest', isAnonymous: true }]) {
        w.navAuth(user, null);
        assert.strictEqual(link.onclick, null, 'Guests follow the ordinary login link');
        assert.match(link.textContent, /Войти в профиль/);
    }
    w.navAuth({ uid: 'member' }, { name: 'Иван Петров' });
    assert.match(link.textContent, /Мой профиль/);
    const click = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    assert(click.defaultPrevented);
    assert.strictEqual(opened, 'member');
    w.currentLang = 'en';
    w.applyTranslations();
    assert.match(link.textContent, /My profile/);
    w.navAuth(null, null);
    assert.strictEqual(link.onclick, null, 'Logout restores login navigation');
    assert.match(link.textContent, /Sign in to profile/);
    w.currentLang = 'ru';

    const p1 = { name: 'Анна <тест>', tee: 'rd', fieldHcp: 12, scores: { 10: 4, 11: 5 }, markedBy: 'b', markerScores: { b: { 10: 5 } } };
    const p2 = { name: 'Иван Петров', tee: 'wh', fieldHcp: 0, scores: { 10: 3 } };
    const round = { status: 'completed', holeRange: '10-18', startHole: 10, completedAt: Date.now(), players: { a: p1, b: p2 } };
    const original = JSON.stringify(round);
    const host = doc.createElement('div');
    const admin = read('admin.html');
    const start = admin.indexOf('<div id="tab-scorecards"');
    host.innerHTML = '<div id="round-panel" class="hidden"></div><div id="lb-panel"></div>' + admin.slice(start, admin.indexOf('<div id="tab-', start + 10));
    doc.body.appendChild(host);
    for (const status of ['active', 'completed']) {
        for (const view of ['1', '2', '3', '4', '5']) {
            w.applyView5('scorecard', view);
            host.querySelector('#lb-panel').innerHTML = w.generateGroupHoleTableHTML(Object.assign({}, round, { status }), { showMarker: true });
            const card = host.querySelector('#lb-panel .club-sc');
            assert.strictEqual(card.dataset.scView, view);
            assert.strictEqual(host.querySelectorAll('#lb-panel .club-sc').length, 1, 'One unified card per group');
            assert.strictEqual(card.querySelectorAll('.gsg-layouts .club-sc-hole').length, 9);
            assert.strictEqual(!!card.querySelector('.sc-hole-details'), status === 'completed');
            if (status === 'completed') {
                assert(!card.querySelector('details').open);
                assert.strictEqual(card.querySelectorAll('.sc-result-metrics').length, 2);
                assert.match(card.querySelector('.sc-result-metrics').textContent, /Gross9/);
            }
            assert.strictEqual(card.querySelectorAll('.gsg-layouts .tee-pill').length, 0, 'Tee badges are not repeated per hole');
            const cells = card.querySelectorAll('.gsg-layouts [data-sc-player="a"]');
            assert.strictEqual(cells.length, 9);
            assert.strictEqual(cells[0].dataset.scHole, '10', 'Back-nine playing order is preserved');
            assert(cells[0].classList.contains('cell-mismatch'));
            assert(card.querySelector('.gsg-layouts .hm-bar'));
            assert(!card.querySelector('тест'), 'Player names are escaped');
            assert.match(card.querySelector('.gsg-layouts .club-sc-total').textContent, /Gross 9/);
            assert.match(w.generateGroupHoleTableHTML(Object.assign({}, round, { status, players: { a: p1 } })), new RegExp('data-sc-view="' + view + '"'));
            assert.match(w.generatePestovoScorecardHTML(p1, round), new RegExp('data-sc-view="' + view + '"'), 'History uses the same setting');
        }
    }
    assert.strictEqual(JSON.stringify(round), original, 'Changing display does not change scores');

    w.fillCardScorecardPanel('round-panel', 'completed-1', round);
    w.toggleCardScorecard('round-panel', 'completed-1');
    w.toggleCardScorecard('round-panel', 'completed-1');
    w.previewClubScorecardView('3');
    w.applyView5('scorecard', '2');
    assert.strictEqual(doc.querySelector('#round-panel .club-sc').dataset.scView, '2', 'Hidden completed cards update live');
    assert.strictEqual(doc.querySelector('#club-sc-preview .club-sc').dataset.scView, '3', 'Preview remains independent');
    w.toggleCardScorecard('round-panel', 'completed-1');
    assert.strictEqual(doc.querySelector('#round-panel .club-sc').dataset.scView, '2', 'Reopening uses fresh data, not stale HTML');
    w.renderHomeRecentResults({ 'completed-1': round });
    w.toggleCardScorecard('recent-sc-completed-1', 'completed-1');
    w.applyView5('scorecard', '4');
    w.cachedRoundsById = {}; // An active-round subscription refreshes this cache.
    w.renderHomeRecentResults({ 'completed-1': round });
    assert(!doc.getElementById('recent-sc-completed-1').classList.contains('hidden'), 'Recent-result panel stays open after redraw');
    assert.strictEqual(doc.querySelector('#recent-sc-completed-1 .club-sc').dataset.scView, '4');
    w.applyView5('scorecard', '2');
    w.lbRoundsById['completed-1'] = round;
    w.fillLbScorecardPanel('lb-panel', 'completed-1');
    assert.strictEqual(doc.querySelector('#lb-panel .club-sc').dataset.scView, '2');

    // Every preview combination is local and uses the appropriate draft style.
    w.previewCompletedScorecardView('4');
    for (const players of ['1', '2', '4']) for (const holes of ['9', '18']) for (const status of ['active', 'completed']) {
        doc.getElementById('club-sc-preview-players').value = players;
        doc.getElementById('club-sc-preview-holes').value = holes;
        doc.getElementById('club-sc-preview-status').value = status;
        w.renderClubScorecardPreview();
        const card = doc.querySelector('#club-sc-preview .club-sc');
        assert.strictEqual(card.dataset.scView, status === 'completed' ? '4' : '3');
        assert.strictEqual(card.dataset.scCompleted, String(status === 'completed'));
        if (status === 'completed') assert.strictEqual(card.querySelectorAll('.sc-result-metrics').length, Number(players));
    }
    assert.strictEqual(w.getRoundScorecardView(round), '2', 'Preview cannot change public settings');
    const writes = [], callbacks = {};
    let server = null, reject = false;
    const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
    w.db = { ref: key => ({
        once: () => Promise.resolve({ val: () => '2' }),
        on: (event, cb) => { callbacks[key] = cb; cb({ val: () => key === w.SCORECARD_DISPLAY_PATH ? copy(server) : '2' }); },
        transaction: (update, complete, localEvents) => {
            assert.strictEqual(localEvents, false, 'No optimistic success before server acknowledgement');
            if (reject) return Promise.reject(new Error('Permission denied'));
            const next = update(copy(server));
            if (next === undefined) return Promise.resolve({ committed: false, snapshot: { val: () => copy(server) } });
            server = copy(next);
            writes.push({ key, value: copy(next) });
            return Promise.resolve({ committed: true, snapshot: { val: () => copy(server) } });
        }
    }) };
    assert.strictEqual(await w.saveClubScorecardView('5'), true);
    assert.deepStrictEqual(writes[0], { key: 'settings/scorecard_display', value: { view: '5', completedView: '4', previous: { view: '2', completedView: 'inherit' } } });
    assert.strictEqual(doc.querySelector('#round-panel .club-sc').dataset.scView, '4');
    assert.strictEqual(doc.querySelector('#lb-panel .club-sc').dataset.scView, '4');
    assert.strictEqual(w.getRoundScorecardView({ status: 'active' }), '5');
    assert.strictEqual(w.getRoundScorecardView({ completedAt: 123 }), '4', 'Legacy history uses finished setting');
    assert.strictEqual(w.localStorage.getItem('pestovo_scorecard_view'), '5');
    assert(!doc.getElementById('club-sc-undo').disabled);
    assert.strictEqual(await w.restoreClubScorecardView(), true);
    assert.deepStrictEqual(server, { view: '2', completedView: 'inherit', previous: { view: '5', completedView: '4' } });
    assert.strictEqual(doc.querySelector('#round-panel .club-sc').dataset.scView, '2');
    assert.strictEqual(await w.saveClubScorecardView('2'), false, 'No-op save preserves undo');
    assert.strictEqual(writes.length, 2);

    // A second admin's most recent server state, not a local cached copy, is the undo target.
    server = { view: '1', completedView: '3' };
    w.previewCompletedScorecardView('5');
    await w.saveClubScorecardView('4');
    assert.deepStrictEqual(server.previous, { view: '1', completedView: '3' });
    const acknowledged = copy(server);
    reject = true;
    assert.strictEqual(await w.saveClubScorecardView('1'), false);
    assert.deepStrictEqual(server, acknowledged);
    assert.strictEqual(w.getRoundScorecardView(), '4');
    assert.match(doc.getElementById('club-sc-save-status').textContent, /Не удалось/);
    assert(!doc.getElementById('club-sc-apply').disabled);
    reject = false;
    Object.defineProperty(w.navigator, 'onLine', { value: false, configurable: true });
    assert.strictEqual(await w.saveClubScorecardView('1'), false);
    assert.match(doc.getElementById('club-sc-save-status').textContent, /Нет соединения/);
    Object.defineProperty(w.navigator, 'onLine', { value: true, configurable: true });

    w.bindScorecardDisplaySettings();
    const details = doc.querySelector('#round-panel details');
    details.open = true;
    server = { view: '3', completedView: '1', previous: { view: '4', completedView: '5' } };
    callbacks[w.SCORECARD_DISPLAY_PATH]({ val: () => server });
    assert.strictEqual(doc.querySelector('#round-panel .club-sc').dataset.scView, '1');
    assert.strictEqual(doc.querySelector('#round-panel details'), details, 'Realtime update preserves DOM');
    assert(details.open, 'Realtime update preserves expanded details');
    w.toggleCardScorecard('round-panel', 'completed-1');
    w.toggleCardScorecard('round-panel', 'completed-1');
    assert.strictEqual(doc.querySelector('#round-panel .club-sc').dataset.scView, '1');
    // Removing the new document falls back to the original setting for both states.
    callbacks[w.SCORECARD_DISPLAY_PATH]({ val: () => null });
    assert.strictEqual(w.getRoundScorecardView(round), '2');
    dom.window.close();
    console.log('PASS: footer; completed summaries; five layouts; all preview scenarios; atomic save/undo, migration, errors, realtime and reopening');
})().catch(error => { console.error(error); process.exitCode = 1; });
