#!/usr/bin/env node
// Regression coverage for the self-only RUSGOLF handicap refresh on setup-round.
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = '<!doctype html><html><body><div id="player-slots">' +
    '<div class="setup-player-card" data-pidx="1"><span id="spc-avatar-1"></span><span id="spc-meta-1"></span>' +
    '<input id="pl-name-1" value="Иван Иванов"><input id="pl-uid-1" value="user-1">' +
    '<select id="pl-gender-1"><option value="men" selected>Men</option><option value="women">Women</option></select>' +
    '<select id="pl-tee-1"><option value="bl" selected>Blue</option></select>' +
    '<input id="pl-hcp-1" value="15.0"><input id="pl-field-1" value="16">' +
    '<button type="button" id="pl-hcp-refresh-1" class="setup-hcp-refresh">Refresh</button></div></div></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://test.local/setup-round.html' });
const win = dom.window;
win.currentUser = { uid: 'user-1' };
win.currentUserData = { uid: 'user-1', firstName: 'Иван', lastName: 'Иванов', gender: 'men', handicap: 15 };
win.currentLang = 'ru';
win.t = key => key;
win.toast = (message, kind) => { win.__toasts.push({ message, kind }); };
win.__toasts = [];
win.__updates = [];
win.__queries = [];
win.__calcCalls = [];
win.fmtExactHcp = value => Number(value).toFixed(1);
win.calcPlayerFieldHcp = idx => {
    win.__calcCalls.push(idx);
    const field = win.document.getElementById('pl-field-' + idx);
    if (field) field.value = '12';
};
win.db = { ref: p => ({
    update: value => { win.__updates.push({ path: p, value }); return Promise.resolve(); },
    once: () => Promise.resolve({ exists: () => p === 'usersPublic/user-1' })
}) };
win.PestovoRusgolf = {
    fetchViaProxy: query => {
        win.__queries.push(query);
        return Promise.resolve({ rows: [{ fio: 'Иван Иванов', number: 'RG-001', hcp: 8.3, gender: 'men', hcpDate: '2026-10-01' }] });
    }
};
win.eval(fs.readFileSync(path.join(ROOT, 'js/round-setup.js'), 'utf8'));

let failures = 0, checks = 0;
function check(condition, message) {
    checks++;
    if (!condition) { failures++; console.error('FAIL:', message); }
    else console.log('ok:', message);
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

(async function run() {
    check(!win.document.getElementById('pl-hcp-refresh-1').classList.contains('hidden'), 'refresh button is visible when the selected uid is the current user');
    win.eval('refreshSetupPlayerHandicap(1)');
    await wait(20);
    check(win.__queries[0] === 'Иван Иванов', 'RUSGOLF lookup uses the selected player name');
    check(win.document.getElementById('pl-hcp-1').value === '8.3', 'exact handicap input is updated from a unique exact match');
    check(win.__updates.some(item => item.path === 'users/user-1' && item.value.handicap === 8.3 && item.value.hcpSource === 'rusgolf'), 'official handicap is saved to the signed-in user profile');
    check(win.__updates.some(item => item.path === 'usersPublic/user-1' && item.value.handicap === 8.3), 'existing public profile mirror receives the refreshed handicap');
    check(win.__calcCalls.includes(1), 'field handicap is recalculated after refresh');
    check(win.__toasts.some(item => item.kind === 'success'), 'success feedback is shown');
    check(!win.document.getElementById('pl-hcp-refresh-1').disabled, 'button is re-enabled after completion');

    const beforeUpdates = win.__updates.length;
    win.PestovoRusgolf.fetchViaProxy = query => Promise.resolve({ rows: [
        { fio: 'Иван Иванов', number: 'RG-002', hcp: 6.1, gender: 'men' },
        { fio: 'Иван Иванов', number: 'RG-003', hcp: 7.2, gender: 'men' }
    ] });
    win.eval('refreshSetupPlayerHandicap(1)');
    await wait(20);
    check(win.document.getElementById('pl-hcp-1').value === '8.3', 'ambiguous matches do not overwrite the current handicap');
    check(win.__updates.length === beforeUpdates, 'ambiguous matches are not written to Firebase');
    check(win.__toasts.some(item => item.kind === 'warn' && item.message.indexOf('несколько') !== -1), 'ambiguous matches explain that manual verification is needed');

    win.document.getElementById('pl-uid-1').value = 'another-user';
    win.eval('markSetupPlayerMeta(1)');
    check(win.document.getElementById('pl-hcp-refresh-1').classList.contains('hidden'), 'refresh button is hidden for a player other than the current user');
    const beforeQueries = win.__queries.length;
    win.eval('refreshSetupPlayerHandicap(1)');
    await wait(5);
    check(win.__queries.length === beforeQueries, 'a non-current player cannot trigger a RUSGOLF lookup');

    console.log('\n' + (failures ? 'FAILED ' + failures + ' / ' + checks : 'Passed ' + checks + ' checks'));
    process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
