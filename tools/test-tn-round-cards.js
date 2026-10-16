#!/usr/bin/env node
/** Regression tests for the global tournament-QR score-entry override editor. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const passed = [];
function check(condition, message) { assert.ok(condition, message); passed.push(message); }

(async function main() {
    const admin = new JSDOM(read('admin.html')).window.document;
    const panel = admin.getElementById('tab-tncards');
    assert(panel, 'admin.html has the tournament score-entry tab');
    const markup = [panel.outerHTML,
        '<main class="tn-public-main"><section id="tn-public-catalog">' +
        '<div data-display-section="active"></div><div data-display-section="upcoming"></div><div data-display-section="archive"></div>' +
        '</section></main>',
        ...Array.from(new JSDOM(read('setup-round.html')).window.document.querySelectorAll('.score-entry')).map(node => node.outerHTML)
    ].join('\n');
    const dom = new JSDOM('<!doctype html><html><body>' + markup + '</body></html>', {
        runScripts: 'outside-only', url: 'https://example.test/admin.html'
    });
    const win = dom.window, doc = win.document;
    const writes = [], listeners = {};
    win.currentLang = 'ru'; win.toast = function() {}; win.vib = function() {};
    win.db = { ref: pathName => ({
        set(value) { writes.push({ path: pathName, value: JSON.parse(JSON.stringify(value)) }); return Promise.resolve(); },
        on(event, callback) { listeners[pathName] = callback; },
        once() { return Promise.resolve({ val: () => null }); }
    }) };
    ['ui-events', 'course-config', 'format', 'dom', 'i18n', 'utils', 'admin-display'].forEach(file => win.eval(read('js/' + file + '.js')));

    const settings = win.normalizePestovoDisplaySettings('tournamentScoring', {
        order: ['input', 'holes'], visible: { qr: false, par: false, input: false, myScore: false }
    });
    check(settings.order.join(',') === 'input,holes,info', 'partial QR block order is completed safely');
    check(settings.visible.qr === false && settings.visible.input === true && settings.visible.myScore === true,
        'tournament override supports element visibility but keeps required score panels');

    win.setPestovoDisplaySettings('scoring', { order: ['holes', 'input', 'info'], visible: { par: false, distance: false } });
    win.setPestovoDisplaySettings('tournamentScoring', {
        order: ['input', 'info', 'holes'], visible: { par: true, distance: false, pace: false }
    });
    const shared = win.pestovoEffectiveScoringDisplay({ mode: 'group' });
    const tournament = win.pestovoEffectiveScoringDisplay({ tournamentId: 'cup-2026' });
    check(shared.order.join(',') === 'holes,input,info' && shared.visible.par === false,
        'regular rounds inherit the global score-entry settings');
    check(tournament.order.join(',') === 'input,info,holes' && tournament.visible.par === true && tournament.visible.distance === false,
        'tournament QR rounds inherit shared defaults and apply their overrides');

    win.renderPestovoDisplayAdmin('tournamentScoring', true);
    check(doc.querySelectorAll('#tn-score-display-elements input[data-screen-display-toggle="tournamentScoring"]').length === win.PESTOVO_SCORE_DISPLAY_KEYS.length,
        'tournament tab renders all flexible element toggles');
    check(doc.querySelectorAll('#tn-score-display-order [data-display-order-move]').length === 6,
        'tournament tab renders accessible up/down ordering controls');
    check(doc.querySelector('#tn-score-display-elements input[data-display-key="input"]').disabled &&
        doc.querySelector('#tn-score-display-elements input[data-display-key="myScore"]').disabled,
        'required panels cannot be hidden for QR scoring');
    check(!doc.getElementById('tn-card-variants') && !doc.getElementById('tn-card-blocks') &&
        !!doc.getElementById('tn-score-display-settings'), 'legacy tournament-card variant UI is fully replaced');

    const source = ['js/utils.js', 'js/admin-display.js', 'js/admin.js', 'admin.html', 'setup-round.html']
        .map(read).join('\n');
    check(!/tn_round_card_view|tn_round_card_blocks|applyTnRoundCardView|renderTnRoundCardAdmin|tn-hide-/.test(source),
        'old tournament-card settings, functions and hide classes are removed');

    win.setPestovoDisplayDraftVisible('tournamentScoring', 'qr', false);
    win.movePestovoDisplayDraftOrder('tournamentScoring', 0, 1);
    win.savePestovoDisplaySettings('tournamentScoring');
    await new Promise(resolve => setTimeout(resolve, 0));
    const saved = writes.find(item => item.path === 'settings/tournament_scoring_display');
    check(!!saved && saved.value.visible.qr === false && saved.value.visible.input === undefined &&
        win.pestovoEffectiveScoringDisplay({ tournamentId: 'cup-2026' }).visible.input === true,
        'tournament QR override saves globally while the required input stays enabled');
    check(saved.value.order.join(',') === 'info,input,holes', 'edited QR block order is persisted');

    win.resetPestovoDisplaySettings('tournamentScoring');
    await new Promise(resolve => setTimeout(resolve, 0));
    const reset = writes.filter(item => item.path === 'settings/tournament_scoring_display').pop();
    check(reset.value.order === null && Object.keys(reset.value.visible).length === 0,
        'reset clears tournament-only overrides so all QR screens inherit common settings');

    const page = new JSDOM(read('setup-round.html')).window.document;
    ['holeInfo', 'holes', 'input', 'myScore', 'markerScore', 'qr', 'scorecard', 'officials', 'finish', 'stableford'].forEach(key => {
        check(page.querySelector('[data-screen-display="scoring"][data-display-key="' + key + '"]'),
            'QR score-entry markup exposes the ' + key + ' element setting');
    });
    console.log('PASS: tournament QR score-entry settings — ' + passed.length + ' checks');
    dom.window.close();
})().catch(error => { console.error(error); process.exit(1); });
