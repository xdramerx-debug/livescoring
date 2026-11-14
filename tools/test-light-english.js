'use strict';
const fs = require('fs');
const assert = require('assert');
const { JSDOM } = require('jsdom');
(async () => {
    for (const file of fs.readdirSync('.').filter(f => f.endsWith('.html'))) {
        const dom = new JSDOM(fs.readFileSync(file, 'utf8'));
        const document = dom.window.document;
        const walker = document.createTreeWalker(document.body, 4);
        while (walker.nextNode()) {
            const n = walker.currentNode;
            if (!/[а-яё]/i.test(n.textContent)) continue;
            assert(n.parentElement.closest('script,style,[data-i18n],[data-clarity-ru],[data-password-toggle]'), file + ': unlocalized static interface text: ' + n.textContent.trim());
        }
        dom.window.close();
    }
    const dom = new JSDOM('<html lang="ru"><body><span data-i18n="nav_stats"></span><button class="sun-mode-btn"></button></body></html>', { url: 'https://example.test/' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.localStorage = dom.window.localStorage;
    let themeRefreshes = 0;
    global.updateSunModeButtons = () => { themeRefreshes++; };
    const module = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('src/i18n.js', 'utf8')).toString('base64'));
    assert.strictEqual(window.currentLang, 'ru');
    module.toggleLang();
    assert.strictEqual(window.currentLang, 'en', 'legacy renderers see the live ESM language');
    assert.strictEqual(document.documentElement.lang, 'en');
    assert.strictEqual(document.querySelector('[data-i18n]').textContent, 'Statistics');
    assert.strictEqual(localStorage.getItem('pestovo_lang'), 'en');
    assert.strictEqual(themeRefreshes, 1, 'theme button text refreshes on language switch');
    module.toggleLang();
    assert.strictEqual(window.currentLang, 'ru');
    assert.strictEqual(document.querySelector('[data-i18n]').textContent, 'Статистика');
    // Invalid preferences and browser storage restrictions must not break boot/toggle.
    for (const source of ['js/i18n.js', 'src/i18n.js']) {
        for (const mode of ['invalid', 'blocked']) {
            const isolated = new JSDOM('<html><body><span data-i18n="nav_stats"></span></body></html>', { runScripts: 'outside-only', url: 'https://example.test/' });
            if (mode === 'invalid') isolated.window.localStorage.setItem('pestovo_lang', 'xx');
            else Object.defineProperty(isolated.window, 'localStorage', { get() { throw new Error('Storage denied'); } });
            isolated.window.eval(fs.readFileSync(source, 'utf8').replace(/export /g, ''));
            assert.strictEqual(isolated.window.currentLang, 'ru', source + ': safe default');
            isolated.window.toggleLang();
            assert.strictEqual(isolated.window.document.documentElement.lang, 'en');
            assert.strictEqual(isolated.window.document.querySelector('[data-i18n]').textContent, 'Statistics');
            isolated.window.close();
        }
    }
    dom.window.close();
    delete global.window; delete global.document; delete global.localStorage; delete global.updateSunModeButtons;
    console.log('PASS: all static Russian UI text has localization metadata; actual ESM language changes propagate to legacy renderers and theme controls');
})().catch(e => { console.error(e); process.exit(1); });
