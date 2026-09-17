// Contract-level integration checks for the static tournament v2 surface.
// Firebase Emulator is intentionally not required in this repository; the
// pure data paths are exercised by test-tournament-core.js and this test
// verifies that the public/admin pages are wired to the same contracts.
'use strict';
var fs = require('fs');
var path = require('path');
var root = path.resolve(__dirname, '..');
var failures = 0;
var total = 0;
function check(value, label) {
    total++;
    if (!value) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
var publicHtml = read('tournaments.html');
var publicJs = read('js/tournament-public.js');
var adminHtml = read('admin.html');
var adminJs = read('js/tournament-admin.js');
var coreJs = read('js/tournament-core.js');
var wizardJs = read('js/tn-wizard.js');
var security = read('docs/tournament-security.md');

['upcoming', 'registration', 'past'].forEach(function (filter) {
    check(publicHtml.indexOf('data-tn-public-filter="' + filter + '"') !== -1, 'public filter: ' + filter);
});
['tn-public-catalog', 'tn-public-detail', 'tn-list', 'tn-detail-content', 'tn-public-search'].forEach(function (id) {
    check(publicHtml.indexOf('id="' + id + '"') !== -1, 'public container: ' + id);
});
['Стартовый лист + QR', 'Участники и заявка', 'Лидерборд', 'Протокол PDF'].forEach(function (label) {
    check(publicHtml.indexOf(label) !== -1 || publicJs.indexOf(label) !== -1, 'public detail capability: ' + label);
});
['api.qrserver.com', 'window.open', 'Blob', 'protocolRows', 'registeredPlayers', 'applications', 'waitlist'].forEach(function (token) {
    check(publicJs.indexOf(token) !== -1, 'public runtime contract: ' + token);
});
['tn-pane-manage', 'tournament-admin.js', 'tournament-admin.css', 'tournament-core.js'].forEach(function (token) {
    check(adminHtml.indexOf(token) !== -1, 'admin wiring: ' + token);
});
['tnwSubTabDefs', 'tnwRenderWizard', 'cloneTournament', 'importExcel', 'protocolSnapshot', 'audit', 'assertWrite'].forEach(function (token) {
    check(adminJs.indexOf(token) !== -1, 'admin capability: ' + token);
});
check((wizardJs.match(/id: '[-a-z]+'/g) || []).length >= 10, 'legacy wizard still exposes ten steps');
['courseRef: \'settings/course\'', 'registeredPlayers', 'rounds', 'settings/course'].forEach(function (token) {
    check(coreJs.indexOf(token) !== -1 || publicJs.indexOf(token) !== -1 || wizardJs.indexOf(token) !== -1, 'single-source contract: ' + token);
});
['escapeHtml', 'safeUrl', '5 * 1024 * 1024', '500', 'formula'].forEach(function (token) {
    check(publicJs.indexOf(token) !== -1 || adminJs.indexOf(token) !== -1 || coreJs.indexOf(token) !== -1 || security.indexOf(token) !== -1, 'security contract: ' + token);
});
check(security.indexOf("role').val() == 'admin'") !== -1, 'security docs require server-side admin role');
check(security.indexOf('published') !== -1 && security.indexOf('RLS') !== -1, 'security docs describe protocol publication and RLS');

console.log('\n' + total + ' checks, failures: ' + failures);
process.exit(failures ? 1 : 0);
