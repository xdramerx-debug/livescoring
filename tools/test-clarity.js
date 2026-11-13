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
        if (page === 'qr-start.html') w.eval(fs.readFileSync(path.join(root, 'js/qr-start.js'), 'utf8'));
        w.eval(code);
        await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve));
        assert.strictEqual(w.document.documentElement.dataset.clarityReady, 'true', page + ': boots');
        const more = w.document.querySelector('.clarity-nav-more');
        if (more) {
            assert.deepStrictEqual(Array.from(more.querySelectorAll('.clarity-nav-panel > a')).map(a => a.getAttribute('href')).sort(), ['handicap.html', 'players.html', 'stats.html', 'tournaments.html'], page + ': consistent secondary routes');
            const active = more.querySelector('a.active');
            if (active) assert.strictEqual(active.getAttribute('aria-current'), 'page');
        }
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
        if (['scorer.html', 'marker.html', 'setup-round.html'].includes(page)) {
            assert(!w.document.querySelector('.score-pad').closest('details'), 'primary input is not hidden');
            assert.strictEqual(w.document.querySelector('[data-act="toggleLargeUi"]').closest('details'), null, 'size is a direct action');
            const method = w.document.querySelector('[data-score-input-method]');
            method.value = 'stepper'; method.dispatchEvent(new w.Event('change'));
            assert.strictEqual(w.localStorage.getItem('pestovo_score_input'), 'stepper');
            assert.strictEqual(w.document.body.dataset.scoreInput, 'stepper');
            for (let n = 1; n <= 15; n++) assert(w.document.querySelector('.score-pad [data-arg="' + n + '"]'), 'all scores are directly reachable');
        }
        if (page === 'handicap.html') {
            w.initNav = function () {};
            w.eval(fs.readFileSync(path.join(root, 'js/course-config.js'), 'utf8'));
            w.getFieldHcp = () => 12; w.fmtFieldHcp = String;
            w.eval(fs.readFileSync(path.join(root, 'js/handicap.js'), 'utf8'));
            const gender = w.document.getElementById('calc-gender');
            const tee = w.document.getElementById('calc-tee');
            gender.value = 'women'; tee.value = 'bk'; w.syncCalcTees();
            assert(tee.querySelector('[value="bk"]').disabled, 'unsupported women tees disabled');
            assert(w.COURSE_RATINGS[gender.value][tee.value], 'fallback selection has a rating');
            const hcp = w.document.getElementById('calc-hcp');
            hcp.value = '12'; w.calcField();
            assert(!w.document.getElementById('calc-result').classList.contains('hidden'));
            hcp.value = ''; w.calcField();
            assert(w.document.getElementById('calc-result').classList.contains('hidden'));

            assert(w.document.getElementById('tbl-gender').closest('[hidden]'));
            assert(!w.document.getElementById('calc-gender').closest('[hidden]'));
        }
        if (page === 'qr-start.html') {
            const select = w.document.querySelector('.clarity-print-choice select');
            let printed;
            w.qrPrintMode = mode => { printed = mode; };
            select.value = 'sheet'; select.dispatchEvent(new w.Event('change'));
            w.document.getElementById('qr-print-selected').click();
            assert.strictEqual(printed, 'sheet');
            assert(w.document.body.classList.contains('clarity-preview-sheet'));
        }
        const ids = Array.from(w.document.querySelectorAll('[id]')).map(n => n.id);
        assert.strictEqual(new Set(ids).size, ids.length, page + ': no duplicate IDs');
        w.close();
    }
    console.log('PASS: clarity progressive enhancements on all routes');
}()).catch(function (error) { console.error(error); process.exit(1); });
