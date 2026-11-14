#!/usr/bin/env node
'use strict';
// Idempotent source-location edits: preserve HTML formatting, IDs and handlers.
const fs = require('fs');
const crypto = require('crypto');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const translations = JSON.parse(fs.readFileSync('tools/ui-english-translations.json', 'utf8'));
const source = fs.readFileSync('js/i18n.js', 'utf8');
const context = { document: new JSDOM('').window.document, localStorage: { getItem: () => 'ru' }, console };
vm.runInNewContext(source, context);
const entries = [];
const dictionary = context.I18N;
function keyFor(ru) {
    const existing = Object.keys(dictionary.ru).find(k => dictionary.ru[k] === ru && dictionary.en[k] === translations[ru]);
    if (existing) return existing;
    const key = 'ui_' + crypto.createHash('sha256').update(ru).digest('hex').slice(0, 10);
    if (!entries.some(e => e.key === key) && !dictionary.ru[key]) entries.push({ key, ru, en: translations[ru] });
    return key;
}
let total = 0;
for (const file of fs.readdirSync('.').filter(f => f.endsWith('.html'))) {
    let html = fs.readFileSync(file, 'utf8');
    const dom = new JSDOM(html, { includeNodeLocations: true });
    const document = dom.window.document;
    const edits = [], tagged = new Set();
    const walker = document.createTreeWalker(document.body, 4);
    while (walker.nextNode()) {
        const node = walker.currentNode, parent = node.parentElement, text = node.textContent.trim();
        if (!translations[text] || parent.closest('script, style, [data-i18n], [data-clarity-ru], [data-password-toggle]')) continue;
        const loc = dom.nodeLocation(node);
        if (!loc) continue;
        const key = keyFor(text);
        if (!parent.children.length && parent.childNodes.length === 1 && !tagged.has(parent)) {
            const tag = dom.nodeLocation(parent).startTag;
            edits.push([tag.endOffset - 1, tag.endOffset - 1, ' data-i18n="' + key + '"']);
            tagged.add(parent);
        } else {
            const raw = html.slice(loc.startOffset, loc.endOffset);
            const trimmed = raw.trim();
            edits.push([loc.startOffset, loc.endOffset, raw.replace(trimmed, '<span data-i18n="' + key + '">' + trimmed + '</span>')]);
        }
    }
    for (const el of document.querySelectorAll('[placeholder], [title], [aria-label]')) {
        for (const attr of ['placeholder', 'title', 'aria-label']) {
            const value = el.getAttribute(attr);
            if (!translations[value] || el.hasAttribute('data-i18n-' + attr)) continue;
            const tag = dom.nodeLocation(el)?.startTag;
            if (tag) edits.push([tag.endOffset - 1, tag.endOffset - 1, ' data-i18n-' + attr + '="' + keyFor(value) + '"']);
        }
    }
    for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) html = html.slice(0, start) + value + html.slice(end);
    if (edits.length) fs.writeFileSync(file, html);
    total += edits.length;
    dom.window.close();
}
for (const file of ['js/i18n.js', 'src/i18n.js']) {
    let text = fs.readFileSync(file, 'utf8');
    for (const lang of ['ru', 'en']) text = text.replace('    ' + lang + ': {', '    ' + lang + ': {\n' + entries.map(e => '        ' + e.key + ': ' + JSON.stringify(e[lang]) + ',').join('\n'));
    fs.writeFileSync(file, text);
}
console.log('Localized ' + total + ' static text/attribute occurrences with ' + entries.length + ' new RU/EN keys.');
