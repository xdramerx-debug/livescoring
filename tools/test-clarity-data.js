'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const context = { document: { addEventListener() {} }, Object, Array, Set, Number, String, console,
    filterEntriesByDateRange(entries, range) {
        if (!range || !range.active) return entries;
        return entries.filter(([, r]) => r.startTime >= range.from && r.startTime <= range.to);
    } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/stats.js'), 'utf8'), context);
const rounds = {
    a: { status: 'completed', startTime: 100, format: 'Stroke Play' },
    b: { status: 'completed', startTime: 200, format: 'Stableford' },
    c: { status: 'scheduled', startTime: 100, format: 'Stroke Play' },
    d: { status: 'active', startTime: 150 },
    invalid: null
};
assert.deepStrictEqual(Object.keys(context.statsFilterRounds(rounds, null, '')), ['a', 'b', 'd']);
assert.deepStrictEqual(Object.keys(context.statsFilterRounds(rounds, { active: true, from: 100, to: 150 }, 'Stroke Play')), ['a', 'd']);
assert.deepStrictEqual(Object.keys(context.statsFilterRounds(rounds, { invalid: true }, '')), []);
assert.deepStrictEqual(Object.keys(context.statsFilterRounds(rounds, null, 'Stableford')), ['b']);
assert.strictEqual(rounds.c.status, 'scheduled', 'filter never mutates round data');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const dom = new JSDOM(html);
assert(dom.window.document.querySelector('[data-admin-group="system"] [data-arg="scoreaudit"]'));
assert(dom.window.document.querySelector('[data-admin-group="system"] [data-arg="hcplog"]'));
assert(!dom.window.document.querySelector('[data-admin-group="ops"] [data-arg="scoreaudit"]'));
assert(dom.window.document.querySelector('#tab-integrations #tg-group-bot-token'));
assert(dom.window.document.querySelector('#tab-alerts #admin-alerts-list'));
assert(!dom.window.document.querySelector('#tab-alerts #tg-group-bot-token'));
assert(dom.window.document.querySelector('[data-admin-group="look"] > [data-arg="entrycards"]'));
assert(!dom.window.document.querySelector('.admin-nav details'), 'all administrative tools are directly visible in their group');
assert(!dom.window.document.querySelector('[data-arg="roundsetup"]'), 'legacy setup choices are no longer exposed');
dom.window.close();
console.log('PASS: statistics boundaries, format filtering, immutability and administrative destinations');
