'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'score-pad.js'), 'utf8');
const sandbox = { window: {}, document: { addEventListener: function () {} }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

assert.strictEqual(sandbox.pestovoScoreIsUnusual(4, 4), false);
assert.strictEqual(sandbox.pestovoScoreIsUnusual(5, 4), false);
assert.strictEqual(sandbox.pestovoScoreIsUnusual(6, 4), false);
assert.strictEqual(sandbox.pestovoScoreIsUnusual(7, 4), true);
assert.strictEqual(sandbox.pestovoScoreIsUnusual(1, 4), true);
assert.strictEqual(sandbox.pestovoScoreIsUnusual(8, 5), true);
assert.strictEqual(sandbox.pestovoLastSavedHole({ 1: 4, 2: 5, 3: 0 }, [1, 2, 3, 4]), 2);
assert.strictEqual(sandbox.pestovoLastSavedHole({}, [1, 2, 3]), null);

const html = ['scorer.html', 'marker.html', 'setup-round.html'].map(function (f) {
    return fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
}).join('\n');
assert.ok(html.indexOf('data-act="setScorePad"') !== -1, 'клавиатура есть в разметке');
assert.ok(html.indexOf('data-act="undoLastHole"') !== -1, 'отмена лунки есть в разметке');
assert.ok(html.indexOf('js/score-pad.js') !== -1, 'score-pad.js подключён');
assert.ok(html.indexOf('field-more') !== -1, 'вызов судьи спрятан в details');
console.log('ok - score-pad');
