'use strict';
const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

async function main() {
    const dom = new JSDOM(`<!doctype html><html lang="ru"><body>
        <details class="page-filters-details"><summary>Фильтры <span class="page-filters-active" hidden></span></summary>
        <input id="search" data-filter-default=""><select id="status" data-filter-default="all"><option value="all">Все</option><option value="active">Live</option></select>
        <input id="from" data-filter-default=""><button id="preset">Период</button></details>
        <button data-act="toggleLang">EN</button></body></html>`, { runScripts: 'outside-only' });
    const { window } = dom;
    const doc = window.document;
    const badge = doc.querySelector('.page-filters-active');
    // Восстановленный период должен учитываться уже при инициализации.
    doc.querySelector('#from').value = '2026-10-01';
    window.eval(fs.readFileSync('js/page-filter-summary.js', 'utf8'));
    doc.dispatchEvent(new window.Event('DOMContentLoaded'));
    assert.strictEqual(badge.textContent, 'Активно: 1');
    doc.querySelector('#search').value = 'Иван';
    doc.querySelector('#search').dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.strictEqual(badge.textContent, 'Активно: 2');
    doc.querySelector('#preset').addEventListener('click', () => { doc.querySelector('#from').value = ''; });
    doc.querySelector('#preset').click();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.strictEqual(badge.textContent, 'Активно: 1');
    doc.documentElement.lang = 'en';
    doc.querySelector('[data-act="toggleLang"]').click();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.strictEqual(badge.textContent, 'Active: 1');
    doc.querySelector('#search').value = '';
    doc.querySelector('#search').dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.strictEqual(badge.hidden, true);
    dom.window.close();
    console.log('Filter summary: restored, changed, preset, language and cleared states passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
