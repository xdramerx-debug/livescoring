'use strict';
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('stats.html', 'utf8');
const document = new JSDOM(html).window.document;
assert(document.body.classList.contains('stats-page'));
assert(document.querySelector('link[href^="css/stats-page.css"]'));
assert.strictEqual(document.querySelectorAll('h1').length, 1);
assert.strictEqual(document.querySelectorAll('main').length, 1);
for (const id of ['stats-date-from', 'stats-date-to', 'stats-format', 'stats-min-rounds', 'stats-date-reset', 'stats-refresh']) {
    const field = document.getElementById(id);
    assert(field, id + ' is preserved');
    assert(!field.closest('details'), id + ' is immediately accessible');
}
for (const id of ['general-stats', 'top-players', 'club-records', 'hole-difficulty']) assert(document.getElementById(id).closest('section'), id + ': labelled section');
assert.strictEqual(document.querySelectorAll('.stats-insights > section').length, 2);
const source = fs.readFileSync('js/stats.js', 'utf8');
assert(source.includes("renderGeneralStatsDisplay(generalItems, variant)"), 'all metrics visible in every admin variant');
assert(!source.includes('stats-more'), 'no hidden secondary metrics');
assert(source.includes('stats-record-card'), 'records have a dedicated card presentation');
console.log('PASS: redesigned stats semantics, visible filters and metrics, preserved controls and scoped stylesheet');
