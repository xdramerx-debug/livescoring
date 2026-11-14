#!/usr/bin/env node
'use strict';
// Reconstruct PR screenshots from git blobs without checking out/executing old code on the host.
// Usage: CHROMIUM_EXTRA_LIBS=$PWD/tools/.browser-stub node tools/capture-design-history.js [1,50,100]
// Refresh metadata explicitly via gh api repos/xdramerx-debug/livescoring/pulls?state=all&sort=created&direction=asc&per_page=100
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const binary = require('@sparticuz/chromium');
const root = path.join(__dirname, '..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/design-history-data.js'), 'utf8'), context);
const manifest = context.window.pestovoDesignHistoryData;
const selected = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
const prs = manifest.prs.filter(p => !selected || selected.includes(p.number));

// Browser-only deterministic database, no access to production Firebase or credentials.
function seed() {
    const fixed = Date.parse('2026-08-26T10:00:00Z');
    const NativeDate = Date;
    window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [fixed])); }
        static now() { return fixed; }
    };
    const players = {
        demo: { name: 'Алексей Демо', firstName: 'Алексей', lastName: 'Демо', tee: 'wh', gender: 'men', hcp: 18, exactHcp: 18, fieldHcp: 20, scores: { 1: 5, 2: 4, 3: 5 } },
        partner: { name: 'Мария Пример', tee: 'rd', gender: 'women', hcp: 24, fieldHcp: 26, scores: { 1: 5, 2: 5, 3: 4 } }
    };
    const round = { id: 'demo-round', name: 'Демонстрационный раунд', mode: 'group', status: 'active', format: 'Stroke Play', tee: 'wh', startHole: 1, holeRange: '1-18', startTime: fixed - 45 * 60000, createdAt: fixed - 45 * 60000, players };
    const data = { rounds: { 'demo-round': round }, markers: { 'demo-round': { demo: { 1: 5, 2: 4, 3: 5 } } }, users: {}, usersPublic: {}, settings: {}, '.info': { connected: true } };
    function at(p) { return p.split('/').filter(Boolean).reduce((v, k) => v && v[k], data) ?? null; }
    function snap(p) {
        const value = at(p);
        return { key: p.split('/').pop(), val: () => value, exists: () => value !== null, numChildren: () => Object.keys(value || {}).length, child: k => snap(p + '/' + k), forEach: cb => Object.keys(value || {}).some(k => cb(snap(p + '/' + k)) === true) };
    }
    function ref(p) {
        p = p || '';
        const r = { key: p.split('/').pop(), once: () => Promise.resolve(snap(p)), on: (event, cb) => { if (event === 'value') cb(snap(p)); return cb; }, off() {}, child: k => ref(p + '/' + k), set: () => Promise.resolve(), update: () => Promise.resolve(), remove: () => Promise.resolve(), onDisconnect: () => ({ set() {}, remove() {}, cancel() {} }), transaction: () => Promise.resolve({ committed: false, snapshot: snap(p) }) };
        ['orderByChild', 'orderByKey', 'limitToLast', 'limitToFirst', 'equalTo', 'startAt', 'endAt'].forEach(k => { r[k] = () => r; });
        r.push = () => ref(p + '/fixture');
        return r;
    }
    window.db = { ref, goOnline() {}, goOffline() {} };
    window.auth = { currentUser: null, onAuthStateChanged: cb => { setTimeout(() => cb(null), 0); return () => {}; }, signInAnonymously: () => Promise.resolve({ user: { uid: 'demo' } }), signOut: () => Promise.resolve() };
    window.firebase = { apps: [{}], initializeApp() {}, database: () => window.db, auth: () => window.auth, messaging: { isSupported: () => false } };
    window.currentUser = null;
    window.currentUserData = null;
    window.currentLang = 'ru';
    try { localStorage.setItem('pestovo_lang', 'ru'); localStorage.setItem('pestovo_onboarding_done', '1'); } catch (e) { /* isolated origin */ }
}

(async () => {
    const browser = await chromium.launch({ executablePath: await binary.executablePath(), args: binary.args.filter(a => a !== '--single-process'), headless: true,
        env: process.env.CHROMIUM_EXTRA_LIBS ? { ...process.env, LD_LIBRARY_PATH: process.env.CHROMIUM_EXTRA_LIBS } : undefined });
    try {
        for (const pr of prs) {
            const cache = new Map();
            var blob = function (file) {
                if (!cache.has(file)) {
                    try { cache.set(file, execFileSync('git', ['show', pr.commit + ':' + file], { maxBuffer: 24 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })); }
                    catch (e) { cache.set(file, null); }
                }
                return cache.get(file);
            };
            const ctx = await browser.newContext({ viewport: manifest.viewport, deviceScaleFactor: 1, locale: 'ru-RU', timezoneId: 'UTC', serviceWorkers: 'block', reducedMotion: 'reduce' });
            await ctx.addInitScript(seed);
            const warnings = [];
            await ctx.route('**/*', async route => {
                const url = new URL(route.request().url());
                if (url.hostname !== 'history.test') {
                    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(root, 'css/fonts-local.css'), 'utf8').replace(/\.\.\/fonts\//g, 'http://history.test/__fonts/') });
                    if (url.pathname.endsWith('/css/all.min.css')) return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(root, 'css/fontawesome-subset.css'), 'utf8').replace(/\.\.\/fonts\//g, 'http://history.test/__fonts/') });
                    return route.fulfill({ contentType: 'application/javascript', body: '/* external requests disabled for reconstruction */' });
                }
                const file = decodeURIComponent(url.pathname.slice(1));
                if (file.startsWith('__fonts/')) return route.fulfill({ body: fs.readFileSync(path.join(root, 'fonts', path.basename(file))), contentType: 'font/woff2' });
                if (file === 'js/firebase-config.js' || file === 'sw.js') return route.fulfill({ contentType: 'application/javascript', body: '/* fixture supplies globals; no production connection */' });
                const bytes = blob(file);
                if (!bytes) return route.fulfill({ status: 404, body: '' });
                const ext = path.extname(file);
                const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' }[ext] || 'application/octet-stream';
                return route.fulfill({ contentType: type, body: bytes });
            });
            for (const [kind, file] of [['home', 'index.html'], ['scoring', 'scorer.html']]) {
                const page = await ctx.newPage();
                page.on('pageerror', e => warnings.push(kind + ': ' + e.message));
                await page.goto('http://history.test/' + file + '?round=demo-round&player=demo', { waitUntil: 'load', timeout: 30000 });
                await page.evaluate(() => document.fonts.ready);
                await page.waitForTimeout(300);
                if (kind === 'scoring') {
                    await page.evaluate(() => {
                        if (typeof scRound !== 'undefined' && scRound) {
                            scHole = 4; scScore = 5;
                            if (typeof renderHole === 'function') renderHole();
                            if (typeof buildHoles === 'function') buildHoles();
                        }
                    });
                    if (!await page.locator('#sc-body').isVisible()) {
                        // Some historical PRs shipped invalid JS. Do not silently repair their source.
                        // Reveal their original HTML shell and clearly label this fallback in metadata/UI.
                        pr.staticScoring = true;
                        warnings.push('scoring: исходный JS не запустился; статическая разметка с демонстрационными полями');
                        await page.evaluate(() => {
                            document.getElementById('sc-body').classList.remove('hidden');
                            document.getElementById('sc-err').classList.add('hidden');
                            const fields = { 'sc-title': 'Счёт: Алексей Демо', 'sc-sub': 'Stroke Play · ТИ: Белый', 'sc-hole': '4', 'sc-par': '3', 'sc-dist': '161', 'sc-disp': '5' };
                            Object.keys(fields).forEach(id => { const el = document.getElementById(id); if (el) el.textContent = fields[id]; });
                        });
                    } else { pr.staticScoring = false; }
                }
                await page.evaluate(() => {
                    document.querySelectorAll('.pwa-install-banner, .pv-onboarding, #pwa-install-banner').forEach(el => el.remove());
                    window.scrollTo(0, 0);
                });
                await page.screenshot({ path: path.join(root, pr[kind]), type: 'jpeg', quality: 78, fullPage: false, animations: 'disabled' });
                await page.close();
            }
            pr.captureWarnings = [...new Set(warnings)].slice(0, 12);
            pr.captured = true;
            await ctx.close();
            fs.writeFileSync(path.join(root, 'js/design-history-data.js'), '// Reconstructed from git commits with demo data; see tools/capture-design-history.js.\nwindow.pestovoDesignHistoryData = ' + JSON.stringify(manifest, null, 2) + ';\n');
            console.log('PR ' + pr.number + ': captured both screens' + (warnings.length ? ' (' + warnings.length + ' runtime warnings)' : ''));
        }
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
