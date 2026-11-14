'use strict';
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
(async () => {
    const dom = new JSDOM(fs.readFileSync('admin.html', 'utf8'), { runScripts: 'outside-only' });
    const w = dom.window;
    // Exercise the actual navigation functions without booting Firebase.
    const source = fs.readFileSync('js/admin.js', 'utf8');
    const start = source.indexOf('var adminTabGeneration = 0;');
    const end = source.indexOf('\n}\n', start) + 3;
    w.eval(source.slice(start, end));
    const pending = {};
    w.pestovoEnsureAdminTab = tab => new Promise(resolve => { pending[tab] = resolve; });
    const applied = [];
    w.switchTabApply = (tab, button) => { applied.push(tab); assert.strictEqual(button.getAttribute('data-arg'), tab); };
    const first = w.switchTab('scoreentry');
    const second = w.switchTab('rusgolf');
    pending.rusgolf(); await second;
    pending.scoreentry(); await first;
    assert.deepStrictEqual(applied, ['rusgolf'], 'late lazy load cannot override the latest navigation');
    const button = w.document.querySelector('.admin-tab[data-arg="rusgolf"]');
    assert(!button.closest('.admin-tabs').classList.contains('hidden'), 'direct navigation reveals the correct group');
    assert.strictEqual(w.document.querySelector('.admin-nav-group.active').getAttribute('data-arg'), button.closest('.admin-tabs').getAttribute('data-admin-group'));
    dom.window.close();
    console.log('PASS: latest admin navigation wins; direct calls synchronize visible groups');
})().catch(e => { console.error(e); process.exitCode = 1; });
