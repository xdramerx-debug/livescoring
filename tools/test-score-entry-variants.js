#!/usr/bin/env node
/**
 * Regression tests for the shared, flexible score-entry display settings.
 * Old numbered score-entry presets and per-variant saving are intentionally gone.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const passed = [];
function check(condition, message) { assert.ok(condition, message); passed.push(message); }
function section(html, id) {
    const dom = new JSDOM(html);
    const node = dom.window.document.getElementById(id);
    assert(node, 'admin.html includes #' + id);
    return node.outerHTML;
}

(async function main() {
    const admin = read('admin.html');
    const setup = new JSDOM(read('setup-round.html')).window.document;
    const scorer = new JSDOM(read('scorer.html')).window.document;
    const app = new JSDOM('<!doctype html><html><body>' + [
        section(admin, 'tab-scoreentry'), section(admin, 'tab-tncards'),
        ...Array.from(setup.querySelectorAll('.score-entry')).map(node => node.outerHTML),
        scorer.querySelector('.score-entry').outerHTML
    ].join('\n') + '</body></html>', { runScripts: 'outside-only', url: 'https://example.test/admin.html' });
    const win = app.window, doc = win.document;
    win.currentLang = 'ru';
    win.toast = function() {};
    win.vib = function() {};
    const writes = [], listeners = {};
    win.db = { ref: pathName => ({
        set: value => { writes.push({ path: pathName, value: JSON.parse(JSON.stringify(value)) }); return Promise.resolve(); },
        on: (event, callback) => { listeners[pathName] = callback; },
        once: () => Promise.resolve({ val: () => null })
    }) };

    ['ui-events', 'course-config', 'format', 'dom', 'i18n', 'utils', 'admin-display'].forEach(file => {
        win.eval(read('js/' + file + '.js'));
    });

    const scoreDefaults = win.normalizePestovoDisplaySettings('scoring', {
        order: ['holes', 'holes', 'invalid'], visible: { input: false, myScore: false, par: false }
    });
    check(scoreDefaults.visible.input === true && scoreDefaults.visible.myScore === true,
        'score input and My score panel remain required');
    check(scoreDefaults.visible.par === false && scoreDefaults.order.join(',') === 'holes,info,input',
        'score display visibility and order are normalized');
    const tournamentDefaults = win.normalizePestovoDisplaySettings('tournaments', {
        layout: 'old-five-style', order: ['archive', 'archive', 'invalid'], visible: { search: false }
    });
    check(tournamentDefaults.layout === 'cards' && tournamentDefaults.order.join(',') === 'archive,active,upcoming',
        'tournament defaults replace the removed numeric layouts');
    check(tournamentDefaults.visible.search === false && tournamentDefaults.visible.toolbar === true,
        'tournament elements normalize with global defaults');

    win.renderPestovoDisplayAdmin('scoring', true);
    win.renderPestovoDisplayAdmin('tournamentScoring', true);
    check(doc.querySelectorAll('#score-entry-display-elements input[data-screen-display-toggle="scoring"]').length === win.PESTOVO_SCORE_DISPLAY_KEYS.length,
        'score-entry editor renders a toggle for every screen element');
    check(doc.querySelectorAll('#tn-score-display-elements input[data-screen-display-toggle="tournamentScoring"]').length === win.PESTOVO_SCORE_DISPLAY_KEYS.length,
        'tournament QR editor renders a toggle for every screen element');
    check(doc.querySelector('#score-entry-display-elements input[data-display-key="input"]').disabled &&
        doc.querySelector('#score-entry-display-elements input[data-display-key="myScore"]').disabled,
        'required score-entry blocks are visibly locked in the editor');
    check(!doc.getElementById('score-entry-list') && !doc.getElementById('score-entry-show') &&
        !doc.querySelector('[id^="v5-scoring-"]'), 'old numbered score-entry controls are removed');

    win.setPestovoDisplaySettings('scoring', {
        order: ['holes', 'input', 'info'], visible: { par: false, distance: false, markerScore: false, input: false, myScore: false }
    });
    // v1.126.0: на странице раунда один экран ввода счёта (соло и группа
    // вместе) + отдельный скорерский на scorer.html.
    const roots = Array.from(doc.querySelectorAll('.score-entry'));
    check(roots.length === 2, 'real unified round and QR score-entry markup is included');
    roots.forEach(root => {
        check(root.querySelector('[data-entry-block="holes"]') === root.children[0],
            'shared block order is applied to a live score-entry screen');
        check(root.querySelector('[data-display-key="par"]').getAttribute('data-display-hidden') === 'true',
            'element visibility hides par on the live score-entry screen');
        check(root.querySelector('[data-display-key="input"]').hasAttribute('data-display-hidden') === false,
            'required input remains visible on every live score-entry screen');
    });
    check(roots.every(root => root.querySelector('[data-display-key="distance"]').getAttribute('data-display-hidden') === 'true'),
        'individual nested hole fields can be hidden');
    check(doc.querySelector('#marker-input-container').getAttribute('data-display-hidden') === 'true',
        'marker score panel visibility is applied');
    check(doc.querySelector('#dual-score-panel').getAttribute('data-display-marker-hidden') === 'true',
        'the dual-score panel collapses cleanly when marker input is hidden');

    win.setPestovoDisplaySettings('tournamentScoring', {
        order: ['input', 'info', 'holes'], visible: { par: true, distance: false, markerScore: true }
    });
    win.pestovoApplyScoringDisplay({ tournamentId: 'cup-2026' });
    const effectiveOrder = Array.from(doc.querySelector('#dual-score-panel').closest('.score-entry').children)
        .filter(node => node.hasAttribute('data-entry-block')).map(node => node.getAttribute('data-entry-block'));
    check(effectiveOrder.join(',') === 'input,info,holes', 'tournament QR round uses its independent block order');
    check(doc.querySelector('#play-par').closest('[data-display-key="par"]').getAttribute('data-display-hidden') !== 'true' &&
        doc.querySelector('#play-dist').closest('[data-display-key="distance"]').getAttribute('data-display-hidden') === 'true',
        'tournament visibility overrides the shared score-entry visibility');
    check(!doc.getElementById('dual-score-panel').hasAttribute('data-display-marker-hidden'),
        'tournament override restores marker panel layout');

    // A changed setting is written to the shared Firebase path, not to per-view records.
    win.renderPestovoDisplayAdmin('scoring', true);
    win.setPestovoDisplayDraftVisible('scoring', 'pace', false);
    win.savePestovoDisplaySettings('scoring');
    await new Promise(resolve => setTimeout(resolve, 0));
    const sharedSave = writes.find(item => item.path === 'settings/scoring_display');
    check(!!sharedSave && sharedSave.value.visible.pace === false && sharedSave.value.visible.input === true,
        'global score-entry settings save atomically to settings/scoring_display');
    check(!writes.some(item => /scoring_(?:variants|view|order|show|active)/.test(item.path)),
        'legacy score-entry variant paths are never written');

    win.resetPestovoDisplaySettings('tournamentScoring');
    await new Promise(resolve => setTimeout(resolve, 0));
    const resetSave = writes.find(item => item.path === 'settings/tournament_scoring_display');
    check(!!resetSave && resetSave.value.order === null && Object.keys(resetSave.value.visible).length === 0,
        'tournament QR settings can be reset to inherit the global score-entry display');

    const pageAttrs = ['setup-round.html', 'scorer.html'].map(file => new JSDOM(read(file)).window.document);
    pageAttrs.forEach(page => {
        check(page.querySelectorAll('.score-entry [data-screen-display="scoring"]').length > 0,
            'display settings are attached to real elements in ' + (page.querySelector('#dual-score-panel') ? 'setup-round.html' : 'scorer.html'));
        check(page.querySelectorAll('.score-entry [data-entry-block]').length === 3,
            'all score-entry screens expose the three reorderable blocks');
    });
    check(!/data-entry-view|data-entry-hide|st-scoring-v[2-5]/.test(read('css/style.css')),
        'legacy score-entry variant selectors are removed from CSS');
    console.log('PASS: flexible score-entry settings — ' + passed.length + ' checks');
    app.window.close();
})().catch(error => { console.error(error); process.exit(1); });
