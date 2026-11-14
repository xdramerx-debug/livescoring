'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require('jsdom');
(async function () {
    const document = new JSDOM(fs.readFileSync('index.html', 'utf8')).window.document;
    const host = document.getElementById('club-stats');
    assert(!host.closest('details'), 'club statistics must never be collapsible');
    assert.strictEqual(document.querySelectorAll('#club-stats-title').length, 1);
    const source = fs.readFileSync('js/app.js', 'utf8');
    const fn = source.slice(source.indexOf('function loadClubStats()'), source.indexOf('// Перерисовка блоков главной'));
    const scores = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, i === 0 ? 2 : i === 1 ? 3 : i === 2 ? 7 : 4]));
    const context = { document, Promise, Date, isFinite, currentLang: 'en', holePar: () => 4, t: key => key,
        db: { ref: key => ({ once: () => Promise.resolve({ val: () => key === 'usersPublic' ? { u: { name: 'Player' } } : {
            r: { status: 'completed', createdAt: Date.now(), players: { u: { scores } } },
            scheduled: { status: 'scheduled', players: {} }
        } }) }) } };
    vm.runInNewContext(fn + ';loadClubStats();', context);
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(host.querySelectorAll('.stat').length, 12);
    for (const key of ['st_bogeys', 'st_doubles', 'st_avg_gross', 'st_avg_hole']) assert(!host.textContent.includes(key), key + ' excluded');
    const values = Object.fromEntries(Array.from(host.querySelectorAll('.stat')).map(tile => [tile.querySelector('.stat-l').textContent, tile.querySelector('.stat-n').textContent]));
    assert.strictEqual(values.st_total_rounds, '1');
    assert.strictEqual(values.st_birdies, '1');
    assert.strictEqual(values.st_eagles, '1');
    assert.strictEqual(values.st_pars, '15');
    assert.strictEqual(values.st_holes_played, '18');
    assert.strictEqual(values.st_best_gross, '72');
    console.log('PASS: twelve permanent club highlights, achievements and actual score calculations');
})().catch(e => { console.error(e); process.exit(1); });
