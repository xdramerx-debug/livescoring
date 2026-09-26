'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (_) { console.log('SKIP: install jsdom to run scoring duplicate checks'); process.exit(0); }
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function uniqueIds(doc) {
    const ids = [...doc.querySelectorAll('[id]')].map(el => el.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'IDs must remain unique');
}
async function load(file) {
    const dom = new JSDOM(read(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''), {
        url: 'https://scoring.test/' + file, runScripts: 'outside-only'
    });
    await settle();
    dom.window.eval(read('js/utils.js'));
    dom.window.initP0MobileEnhancements();
    return dom;
}
(async () => {
    // Audit every static page, not only the scoring screens.
    for (const file of fs.readdirSync(root).filter(file => file.endsWith('.html'))) {
        const dom = new JSDOM(read(file));
        uniqueIds(dom.window.document);
        dom.window.close();
    }
    assert.match(read('css/style.css'), /\[hidden\]\s*\{\s*display:none!important;/,
        'Component display rules must respect hidden');
    const dom = await load('setup-round.html');
    try {
        const w = dom.window, d = w.document;
        w.initP0MobileEnhancements(); // repeated initialisation must be harmless
        uniqueIds(d);
        assert.strictEqual(d.querySelectorAll('#score-confirm-bar').length, 1);
        assert.strictEqual(d.querySelectorAll('#p0-sticky-actions').length, 0);
        assert(d.getElementById('score-confirm-bar').hidden);
        w.document.body.classList.add('round-active');
        for (const [view, id, other] of [
            ['active-scoring-view', 'save-hole-btn', 'btn-solo-action'],
            ['game', 'btn-solo-action', 'save-hole-btn']
        ]) {
            d.getElementById('active-scoring-view').classList.add('hidden');
            d.getElementById('game').classList.add('hidden');
            d.getElementById(view).classList.remove('hidden');
            await settle();
            const source = d.getElementById(id), sticky = d.getElementById(id + '-sticky');
            assert(!sticky.hidden);
            assert(d.getElementById(other + '-sticky').hidden);
            let calls = 0;
            source.onclick = () => calls++;
            sticky.click();
            assert.strictEqual(calls, 1);
            source.disabled = true;
            source.innerHTML = '<span id="save-state">Сохранение…</span>';
            await settle();
            assert(sticky.disabled);
            assert.strictEqual(sticky.textContent, 'Сохранение…');
            uniqueIds(d);
            sticky.click();
            assert.strictEqual(calls, 1);
            source.disabled = false;
            source.innerHTML = 'Подтвердить';
            await settle();
        }
        d.body.classList.remove('round-active');
        await settle();
        assert(d.getElementById('score-confirm-bar').hidden);
    } finally { dom.window.close(); }
    const scorer = await load('scorer.html');
    try {
        const w = scorer.window, d = w.document;
        const bar = d.getElementById('p0-sticky-actions');
        assert(bar.hidden);
        d.getElementById('sc-body').classList.remove('hidden');
        await settle();
        assert(!bar.hidden);
        let calls = 0;
        w.saveSc = () => calls++;
        const source = d.getElementById('sc-save-btn'), sticky = d.getElementById('p0-sticky-save');
        source.onclick = w.saveSc;
        sticky.click();
        assert.strictEqual(calls, 1);
        source.disabled = true;
        source.innerHTML = '<span id="save-state">Saved</span>';
        await settle();
        assert(sticky.disabled);
        assert.strictEqual(sticky.textContent, 'Saved');
        assert(!sticky.classList.contains('p0-original-save'));
        uniqueIds(d);
        d.getElementById('sc-body').classList.add('hidden');
        await settle();
        assert(bar.hidden);
    } finally { scorer.window.close(); }
    console.log('PASS: unique page IDs, isolated scoring actions, mode switching, single click and live state sync');
})().catch(error => { console.error(error); process.exit(1); });
