// Test bootstrap (used via `node --require` in tools/run-tests.js).
// ------------------------------------------------------------
// js/utils.js was split: course config + score-formatting helpers now live
// in js/course-config.js and js/format.js, loaded BEFORE utils.js in the
// browser. Tests that load utils.js in isolation (via vm/require) would miss
// those globals. Rather than editing every test's loader, we transparently
// prepend the foundation modules whenever a test reads js/utils.js from disk.
//
// course-config.js declares its constants with `var` and the helpers as
// function declarations, so re-reading utils.js (and the prepended modules)
// is safe — redeclaration of var/function is allowed in the same context.
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const readFileSyncOrig = fs.readFileSync;

const courseConfig = readFileSyncOrig(path.join(ROOT, 'js/course-config.js'), 'utf8');
const formatHelpers = readFileSyncOrig(path.join(ROOT, 'js/format.js'), 'utf8');
const domHelpers = readFileSyncOrig(path.join(ROOT, 'js/dom.js'), 'utf8');
const i18nHelpers = readFileSyncOrig(path.join(ROOT, 'js/i18n.js'), 'utf8');

const PREFIX = courseConfig + '\n' + formatHelpers + '\n' + domHelpers + '\n' + i18nHelpers + '\n';

function isUtilsJs(p) {
    if (p == null) return false;
    return String(p).replace(/\\/g, '/').endsWith('js/utils.js');
}

fs.readFileSync = function (p, opts) {
    if (isUtilsJs(p)) {
        const content = readFileSyncOrig.apply(this, arguments);
        return PREFIX + content;
    }
    return readFileSyncOrig.apply(this, arguments);
};
