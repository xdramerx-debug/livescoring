'use strict';
const assert = require('assert');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'css/pr164.css'))).digest('hex'), '6002ea98ab85216d3299a34b2f8ef21b1e7a80ce2a4470d9ad486719c737475b', 'unaltered stylesheet from merge f5cff893 (PR164)');
let pages = 0;
for (const name of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
    const html = read(name);
    if (!html.includes('css/style.css')) continue; // QR print document already uses its original standalone styling.
    pages++;
    assert(html.includes('css/pr164.css'), name + ': original design linked');
    assert(html.indexOf('css/pr164.css') > html.indexOf('css/clarity.css'), name + ': historical appearance takes precedence');
    assert(html.indexOf('css/pr164-adapter.css') > html.indexOf('css/pr164.css'));
    assert(!html.includes('clarity-nav-more'), name + ': direct legacy navigation');
}
assert.strictEqual(pages, 14);
for (const name of ['theme-v2', 'product-ux', 'clarity']) assert(read('css/' + name + '.css').includes('@layer post164-compat'), name + ': new controls are subordinate to the historical design');
const home = read('index.html');
assert(home.indexOf('<section class="hero">') < home.indexOf('id="my-active-rounds-container"'));
assert(home.indexOf('id="active-tournament-section"') < home.indexOf('id="live-rounds"'));
assert.strictEqual((home.match(/<div class="hero-btns">([\s\S]*?)<\/div>/)[1].match(/<a /g) || []).length, 2);
assert(read('js/clarity.js').includes("var method = 'stepper'"), 'legacy input default with explicit pad preference retained');
assert(read('css/pr164-adapter.css').includes('.pv-bottomnav { display: none !important; }'));
assert(read('admin.html').includes('История PR · 1–187'), 'new archive is preserved');
console.log('PASS: exact PR164 stylesheet, all 14 shared-theme routes, legacy navigation/hero/input and retained PR archive');
