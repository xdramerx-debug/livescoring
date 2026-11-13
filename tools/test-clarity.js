'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'js/clarity.js'), 'utf8');
(async function () {
    for (const page of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
        const dom = new JSDOM(fs.readFileSync(path.join(root, page), 'utf8'), { runScripts: 'outside-only', url: 'https://club.example/' + page });
        const w = dom.window;
        w.eval(code);
        await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve));
        assert.strictEqual(w.document.documentElement.dataset.clarityReady, 'true', page + ': boots');
        if (['players.html', 'leaderboard.html'].includes(page)) {
            const search = w.document.querySelector('.clarity-search input');
            assert(search && !search.closest('details'), page + ': search is visible');
        }
        if (page === 'leaderboard.html') assert(w.document.getElementById('lb-status').closest('[hidden]'));
        if (page === 'setup-round.html') {
            assert(w.document.querySelector('#setup > details #fio-resume-card'));
            assert(w.document.querySelector('#grp-timing-preview').closest('details'));
            assert(!w.document.getElementById('save-hole-btn').closest('details'));
        }
        if (page === 'auth.html') {
            const input = w.document.getElementById('login-pass');
            const button = input.nextElementSibling;
            button.click(); assert.strictEqual(input.type, 'text');
            button.click(); assert.strictEqual(input.type, 'password');
        }
        if (page === 'handicap.html') {
            assert(w.document.getElementById('tbl-gender').closest('[hidden]'));
            assert(!w.document.getElementById('calc-gender').closest('[hidden]'));
        }
        if (page === 'qr-start.html') {
            const select = w.document.querySelector('.clarity-print-choice select');
            let printed;
            w.qrPrintMode = mode => { printed = mode; };
            select.value = 'sheet'; select.dispatchEvent(new w.Event('change'));
            w.document.querySelector('.clarity-print-choice + button').click();
            assert.strictEqual(printed, 'sheet');
            assert(w.document.body.classList.contains('clarity-preview-sheet'));
        }
        const ids = Array.from(w.document.querySelectorAll('[id]')).map(n => n.id);
        assert.strictEqual(new Set(ids).size, ids.length, page + ': no duplicate IDs');
        w.close();
    }
    console.log('PASS: clarity progressive enhancements on all routes');
}()).catch(function (error) { console.error(error); process.exit(1); });
