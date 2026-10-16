#!/usr/bin/env node
'use strict';
// Two independent browser contexts (devices), real application renderers and
// real sw.js. Only Firebase transport is substituted by a local HTTP/SSE server.
// No production credentials/data, no writes to the club's Firebase database.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');

(async function() {
    const values = { 'settings/scorecard_view': '1', 'settings/notifications_enabled': false };
    const listeners = new Set();
    let revision = 0;
    const api = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Cache-Control', 'no-store');
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        const url = new URL(req.url, 'http://test');
        const key = url.searchParams.get('path');
        if (url.pathname === '/events') {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
            const entry = { key, res };
            listeners.add(entry);
            res.write('data: ' + JSON.stringify(values) + '\n\n');
            req.on('close', () => listeners.delete(entry));
            return;
        }
        if (req.method === 'POST') {
            let body = '';
            for await (const chunk of req) body += chunk;
            const data = JSON.parse(body);
            if (data.revision !== revision) { res.writeHead(409); res.end(); return; }
            values[key] = data.value;
            revision++;
            for (const entry of listeners) entry.res.write('data: ' + JSON.stringify(values) + '\n\n');
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ value: values[key] ?? null, revision }));
    });
    await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
    // Different origin, just like Firebase: production SW must not cache settings.
    const apiOrigin = 'http://127.0.0.1:' + api.address().port;
    const adminSource = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
    const from = adminSource.indexOf('<div id="tab-scorecards"');
    const fragment = adminSource.slice(from, adminSource.indexOf('<div id="tab-', from + 10)).replace('admin-section hidden', 'admin-section');
    const transport = `
        window.currentUser = null; window.currentUserData = null;
        var watchers = {}, latest = null, source;
        function connectTransport() {
            if (source) source.close();
            if (!navigator.onLine) return;
            source = new EventSource('${apiOrigin}/events');
            source.onmessage = function(e) {
                latest = JSON.parse(e.data);
                Object.keys(watchers).forEach(function(key) { watchers[key].forEach(function(cb) { cb({ val: function() { return latest[key] == null ? null : latest[key]; } }); }); });
            };
        }
        window.addEventListener('offline', function() { if (source) source.close(); });
        window.addEventListener('online', connectTransport);
        connectTransport();
        window.db = { ref: function(key) {
            var query = '?path=' + encodeURIComponent(key);
            return {
                once: async function() { var r = await fetch('${apiOrigin}/data' + query, { cache: 'no-store' }); var d = await r.json(); return { val: function() { return d.value; } }; },
                on: function(event, cb) {
                    (watchers[key] || (watchers[key] = [])).push(cb);
                    if (latest) cb({ val: function() { return latest[key] == null ? null : latest[key]; } });
                },
                transaction: async function(update) {
                    for (var i = 0; i < 5; i++) {
                        var r = await fetch('${apiOrigin}/data' + query, { cache: 'no-store' }); var old = await r.json();
                        var value = update(old.value);
                        if (value === undefined) return { committed: false, snapshot: { val: function() { return old.value; } } };
                        var saved = await fetch('${apiOrigin}/data' + query, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: value, revision: old.revision }) });
                        if (saved.status === 409) continue;
                        if (!saved.ok) throw new Error('Write rejected');
                        var result = await saved.json();
                        return { committed: true, snapshot: { val: function() { return result.value; } } };
                    }
                    throw new Error('Transaction conflict');
                }
            };
        } };
    `;
    const fixture = `<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="css/style.css"></head><body>
        <div id="admin-fixture">${fragment}</div><div id="active-card"></div><div id="finished-card"></div>
        <script>${transport}</script>
        ${['ui-events','course-config','format','dom','i18n','utils','admin-display','pwa'].map(f => '<script src="js/' + f + '.js"></script>').join('')}
        <script>
        window.fixtureRound = { status: 'completed', holeRange: '1-9', players: {
            a: { name: 'Анна Тестовая', tee: 'rd', fieldHcp: 12, scores: { 1: 4, 2: 5 } },
            b: { name: 'Борис Тестовый', tee: 'wh', fieldHcp: 0, scores: { 1: 3, 2: 4 } }
        } };
        window.reopenFixture = function() {
            document.getElementById('finished-card').innerHTML = generateGroupHoleTableHTML(fixtureRound);
            document.getElementById('active-card').innerHTML = generateGroupHoleTableHTML(Object.assign({}, fixtureRound, { status: 'active' }));
        };
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('admin-fixture').hidden = !location.search.includes('admin');
            reopenFixture(); renderClubScorecardPreview();
        });
        </script></body></html>`;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://test');
        if (url.pathname === '/scorecard-test.html') {
            res.setHeader('Content-Type', 'text/html'); res.end(fixture); return;
        }
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
        const mime = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
        res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    let browser;
    try {
        browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter(arg => arg !== '--single-process'), headless: true,
            env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined });
        console.log('PWA check: browser started');
        const adminContext = await browser.newContext();
        const playerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const admin = await adminContext.newPage(), player = await playerContext.newPage();
        const errors = [];
        for (const page of [admin, player]) page.on('pageerror', e => errors.push(e.message));
        console.log('PWA check: contexts ready');
        await admin.goto(origin + '/scorecard-test.html?admin');
        await player.goto(origin + '/scorecard-test.html');
        console.log('PWA check: pages loaded, waiting for SW');
        await player.waitForFunction(() => !!navigator.serviceWorker.controller);
        await player.reload();
        await player.waitForFunction(() => !!navigator.serviceWorker.controller && document.querySelector('#finished-card .club-sc'));
        // Deterministically warm the offline shell; all app code is served unchanged.
        await player.evaluate(async () => {
            const keys = await caches.keys();
            const cache = await caches.open(keys.find(key => key.startsWith('pestovo-v')));
            await cache.add(location.href);
            await Promise.all(Array.from(document.scripts).filter(s => s.src).map(s => cache.add(s.src)));
            await cache.add('css/style.css');
        });
        console.log('PWA check: SW cached; saving new styles');
        await player.locator('#finished-card summary').click();
        await player.evaluate(() => { window.detailsBefore = document.querySelector('#finished-card details'); });
        assert.strictEqual(await admin.evaluate(async () => { previewClubScorecardView('3'); previewCompletedScorecardView('5'); return saveClubScorecardView(); }), true);
        await player.waitForFunction(() => document.querySelector('#finished-card .club-sc').dataset.scView === '5');
        assert.strictEqual(await player.getAttribute('#active-card .club-sc', 'data-sc-view'), '3');
        assert.strictEqual(await player.evaluate(() => detailsBefore === document.querySelector('#finished-card details') && detailsBefore.open), true);
        assert.strictEqual(await player.evaluate(() => document.querySelector('#finished-card').scrollWidth <= innerWidth), true);
        // Independent devices: there is no shared localStorage/storage event here.
        assert.strictEqual(await player.evaluate(() => JSON.parse(localStorage.getItem(SCORECARD_DISPLAY_STORAGE)).completedView), '5');
        await player.evaluate(() => reopenFixture());
        assert.strictEqual(await player.getAttribute('#finished-card .club-sc', 'data-sc-view'), '5');
        console.log('PWA check: testing offline reload');
        await playerContext.setOffline(true);
        await player.reload();
        await player.waitForFunction(() => !!document.querySelector('#finished-card .club-sc'));
        assert.strictEqual(await player.getAttribute('#finished-card .club-sc', 'data-sc-view'), '5', 'Offline PWA uses cached completed style');
        assert.strictEqual(await player.getAttribute('#active-card .club-sc', 'data-sc-view'), '3');
        assert.strictEqual(await admin.evaluate(async () => { previewCompletedScorecardView('inherit'); return saveClubScorecardView('2'); }), true);
        assert.strictEqual(await player.getAttribute('#finished-card .club-sc', 'data-sc-view'), '5', 'Offline client does not fabricate a fresh setting');
        console.log('PWA check: reconnecting');
        await playerContext.setOffline(false);
        await player.waitForFunction(() => document.querySelector('#finished-card .club-sc').dataset.scView === '2');
        await admin.evaluate(() => restoreClubScorecardView());
        await player.waitForFunction(() => document.querySelector('#finished-card .club-sc').dataset.scView === '5');
        assert.strictEqual(await player.getAttribute('#active-card .club-sc', 'data-sc-view'), '3');
        const apiCached = await player.evaluate(async apiOrigin => {
            for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) if (req.url.startsWith(apiOrigin)) return true;
            return false;
        }, apiOrigin);
        assert.strictEqual(apiCached, false, 'SW never caches settings API responses');
        assert.deepStrictEqual(errors, []);
        console.log('PASS: independent admin/player, realtime without reload, preserved details, reopen, real SW control, offline reload, reconnect, inherited view and rollback');
    } finally {
        if (browser) await browser.close();
        console.log('PWA check: browser closed');
        for (const entry of listeners) entry.res.end();
        api.closeAllConnections(); server.closeAllConnections();
        await Promise.all([new Promise(resolve => api.close(resolve)), new Promise(resolve => server.close(resolve))]);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
