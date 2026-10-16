#!/usr/bin/env node
/** Regression tests for global tournament-page layout, order and visibility settings. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const passed = [];
function check(condition, message) { assert.ok(condition, message); passed.push(message); }

(async function main() {
    const html = read('admin.html');
    const adminDocument = new JSDOM(html).window.document;
    const section = adminDocument.getElementById('tab-tournamentsview');
    assert(section, 'admin.html contains the tournament display tab');
    const catalogMarkup = '<main class="tn-public-main"><section id="tn-public-catalog">' +
        '<div data-screen-display="tournaments" data-display-key="toolbar"></div>' +
        '<label data-screen-display="tournaments" data-display-key="search"></label>' +
        '<section data-screen-display="tournaments" data-display-key="activeSection" data-display-section="active"></section>' +
        '<section data-screen-display="tournaments" data-display-key="upcomingSection" data-display-section="upcoming"></section>' +
        '<section data-screen-display="tournaments" data-display-key="archiveSection" data-display-section="archive"></section>' +
        '<div data-screen-display="tournaments" data-display-key="cardMeta"></div>' +
        '</section></main>';
    const dom = new JSDOM('<!doctype html><html><body>' + section.outerHTML + catalogMarkup + '</body></html>', {
        runScripts: 'outside-only', url: 'https://example.test/admin.html'
    });
    const win = dom.window, doc = win.document;
    const writes = [], listeners = {};
    win.currentLang = 'ru'; win.toast = function() {}; win.vib = function() {};
    win.db = { ref: pathName => ({
        set(value) { writes.push({ path: pathName, value: JSON.parse(JSON.stringify(value)) }); return Promise.resolve(); },
        on(event, callback) { listeners[pathName] = callback; },
        once() { return Promise.resolve({ val: () => null }); }
    }) };
    // Реестр обработчиков живёт в js/ui-events.js; здесь подключается только
    // часть страницы, поэтому регистрация — заглушка.
    win.pestovoOnAction = function () {};
    ['course-config', 'format', 'dom', 'i18n', 'utils', 'admin-display'].forEach(file => win.eval(read('js/' + file + '.js')));

    const defaults = win.getPestovoDisplaySettings('tournaments');
    check(defaults.layout === 'cards' && defaults.order.join(',') === 'active,upcoming,archive',
        'responsive cards are the default layout and section order');
    check(win.pageDisplayVariantKeys('tournaments').length === 0,
        'legacy numeric tournament page variants are no longer available');
    win.renderPestovoDisplayAdmin('tournaments', true);
    check(doc.querySelectorAll('#tournaments-display-elements input[data-screen-display-toggle="tournaments"]').length === win.PESTOVO_TOURNAMENT_DISPLAY_KEYS.length,
        'tournament editor renders every configurable display element');
    check(doc.querySelectorAll('#tournaments-display-order [data-display-order-move]').length === 6,
        'tournament editor renders move-up/down controls for all sections');
    check(doc.getElementById('tournaments-display-layout').value === 'cards',
        'admin layout selector shows the default');

    win.setPestovoDisplaySettings('tournaments', {
        layout: 'timeline', order: ['archive', 'active', 'upcoming'],
        visible: { search: false, upcomingSection: false, cardMeta: false, detailTabs: false }
    });
    check(doc.querySelector('.tn-public-main').getAttribute('data-tournaments-layout') === 'timeline',
        'selected tournament composition is applied to the public main');
    const reorderedSections = Array.from(doc.querySelector('#tn-public-catalog').children)
        .filter(node => node.hasAttribute('data-display-section'));
    check(reorderedSections[0].getAttribute('data-display-section') === 'archive',
        'catalog sections are reordered globally');
    check(doc.querySelector('.tn-public-main [data-display-key="search"]').getAttribute('data-display-hidden') === 'true' &&
        doc.querySelector('.tn-public-main [data-display-key="upcomingSection"]').getAttribute('data-display-hidden') === 'true' &&
        doc.querySelector('.tn-public-main [data-display-key="cardMeta"]').getAttribute('data-display-hidden') === 'true',
        'visibility settings hide the requested public elements');
    check(doc.getElementById('tournaments-display-layout').value === 'timeline',
        'public settings update the admin preview controls');

    win.renderPestovoDisplayAdmin('tournaments', true);
    win.setPestovoDisplayDraftLayout('compact');
    win.setPestovoDisplayDraftVisible('tournaments', 'cardFormats', false);
    win.movePestovoDisplayDraftOrder('tournaments', 2, -1);
    win.savePestovoDisplaySettings('tournaments');
    await new Promise(resolve => setTimeout(resolve, 0));
    const saved = writes.find(item => item.path === 'settings/tournaments_display');
    check(!!saved && saved.value.layout === 'compact' && saved.value.visible.cardFormats === false,
        'global tournament layout and visibility save atomically');
    check(saved.value.order.join(',') === 'archive,upcoming,active', 'section order is persisted');
    check(!writes.some(item => /tournaments_display_variant/.test(item.path)),
        'removed numbered tournament setting is never written');

    const page = new JSDOM(read('tournaments.html')).window.document;
    ['toolbar', 'search', 'activeSection', 'upcomingSection', 'archiveSection'].forEach(key => {
        check(page.querySelector('[data-screen-display="tournaments"][data-display-key="' + key + '"]'),
            'tournaments.html exposes the ' + key + ' setting');
    });
    const publicJs = read('js/tournament-public.js');
    ['cardBanner', 'cardMeta', 'cardFormats', 'cardDescription', 'detailHero', 'detailDescription', 'detailMetrics', 'detailTabs'].forEach(key => {
        check(publicJs.indexOf('data-display-key="' + key + '"') !== -1,
            'dynamic tournament content exposes the ' + key + ' setting');
    });
    const css = read('css/tournament-redesign.css');
    check(css.includes('data-tournaments-layout="timeline"') && css.includes('data-tournaments-layout="compact"'),
        'new tournament compositions are implemented in the responsive stylesheet');
    check(!/pd-tournaments-v[2-5]|tournaments_view_variant_/.test(css + read('css/style.css') + read('js/admin-display.js')),
        'old tournament page variants are removed from runtime code and CSS');
    console.log('PASS: tournament display settings — ' + passed.length + ' checks');
    dom.window.close();
})().catch(error => { console.error(error); process.exit(1); });
