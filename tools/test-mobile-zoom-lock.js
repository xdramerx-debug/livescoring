// Accessibility regression: page zoom must remain available on every route.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
assert(pages.length >= 15);
pages.forEach(function (page) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const viewport = /<meta\s+name="viewport"\s+content="([^"]*)"/i.exec(html);
    assert(viewport, page + ': viewport exists');
    assert(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?\b/i.test(viewport[1]), page + ': allows zoom');
    assert(/width=device-width/.test(viewport[1]), page + ': responsive width');
});
const js = fs.readFileSync(path.join(root, 'js/ui-events.js'), 'utf8');
assert(!/addEventListener\(name, stopZoom/.test(js), 'does not cancel pinch gestures');
console.log('PASS: zoom remains available on all ' + pages.length + ' pages');
