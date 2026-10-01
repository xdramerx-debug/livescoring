// Contract-level integration checks for the new tournament surface.
// Firebase Emulator is intentionally not required in this repository; the
// pure data paths are exercised by tools/test-tn-admin.js and this test
// verifies that the pages are wired to the same contracts:
//   tn-admin.html  ↔ js/tn-admin.js ↔ js/tn-admin-core.js
//   tn-protocol.html ↔ js/tn-protocol-public.js ↔ tournaments/<id>/protocol
//   admin.html больше не тянет удалённую старую систему (мастер/студия).
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

var adminHtml = read('admin.html');
var adminJs = read('js/admin.js');
var tnAdminHtml = read('tn-admin.html');
var tnAdminJs = read('js/tn-admin.js');
var coreJs = read('js/tn-admin-core.js');
var publicProtoHtml = read('tn-protocol.html');
var publicProtoJs = read('js/tn-protocol-public.js');
var coreTournamentJs = read('js/tournament-core.js');
var swJs = read('sw.js');

// ── 1. Старая система удалена из админки ──
['js/tn-wizard.js', 'js/tn-engine.js', 'js/tn-studio.js', 'js/tournament-admin.js',
    'js/admin-tournaments.js', 'css/tn-wizard.css', 'css/tournament-admin.css',
    'tn-embed-parking', 'tn-wizard-root', 'tn-studio-root', 'tab-start-content',
    'pe-card', 'switchTab(\'studio\'', 'tnStudioOpen', 'tnwOnAdminOpen'].forEach(function (token) {
    check(adminHtml.indexOf(token) === -1, 'admin.html: удалено ' + token);
});
check(adminHtml.indexOf('tn-view.css') !== -1, 'admin.html: стили вкладки «Турниры: вид» сохранены');
check(adminHtml.indexOf('href="tn-admin.html"') !== -1, 'admin.html: таб «Турниры 🏆» ведёт на tn-admin.html');
check(adminJs.indexOf("window.location.href = 'tn-admin.html'") !== -1, 'admin.js: старые имена вкладок редиректят на tn-admin.html');
['tn-studio.js', 'tn-wizard.js', 'tn-engine.js', 'tournament-admin.js', 'admin-tournaments.js'].forEach(function (f) {
    check(!fs.existsSync(path.join(root, 'js', f)), 'файл удалён: js/' + f);
});

// ── 2. Новая страница: шаги и хосты ──
['tna-root', 'admin-login', 'adm-master-pass'].forEach(function (id) {
    check(tnAdminHtml.indexOf('id="' + id + '"') !== -1, 'tn-admin.html: контейнер #' + id);
});
// Хосты старта и быстрого редактора создаёт js/tn-admin.js (шаг 3).
['tab-start-content', 'pe-tn-select', 'pe-editor'].forEach(function (id) {
    check(tnAdminJs.indexOf('id="' + id + '"') !== -1 || tnAdminJs.indexOf("'" + id + "'") !== -1,
        'js/tn-admin.js монтирует хост #' + id);
});
['js/tn-admin-core.js', 'js/tn-admin.js', 'js/admin.js', 'js/start-admin.js', 'js/pe-edit.js',
    'js/tournament-core.js', 'js/utils.js', 'js/firebase-config.js'].forEach(function (src) {
    check(tnAdminHtml.indexOf(src) !== -1, 'tn-admin.html: подключён ' + src);
});
['tnaInit', 'tnaSaveSettings', 'tnaSavePlayers', 'tnaMountStart', 'tnaSaveResults',
    'tnaBuildProtocol', 'tnaPublishProtocol', 'tnaPrintProtocol', 'tnaExportCsv', 'tnaExportExcel',
    'tnaPublicLink', 'tnaDeleteTournament', 'tnaRowsFromRounds', 'tnaGroupsFromProtocols'].forEach(function (fn) {
    check(tnAdminJs.indexOf('function ' + fn) === 0 || tnAdminJs.indexOf('function ' + fn + '(') !== -1,
        'js/tn-admin.js: ' + fn);
});
['defaultConfig', 'normalizeConfig', 'normalizePlayers', 'parseImport', 'buildRow',
    'withPositions', 'buildNominations', 'assembleProtocol', 'buildProtocol',
    'csv', 'protocolDocHtml', 'importTemplateCsv'].forEach(function (fn) {
    check(coreJs.indexOf('function ' + fn + '(') !== -1 || coreJs.indexOf(fn + ':') !== -1,
        'js/tn-admin-core.js: ' + fn);
});
check(coreJs.indexOf("module.exports = api") !== -1, 'ядро экспортируется для Node-тестов');

// ── 3. Публичная страница протокола ──
['tnp-root', 'js/tn-protocol-public.js', 'js/tn-admin-core.js'].forEach(function (token) {
    check(publicProtoHtml.indexOf(token) !== -1, 'tn-protocol.html: ' + token);
});
['tnpInit', 'tnpLiveProtocol', 'tnpPrint', 'tnpExportCsv', 'tnpExportExcel'].forEach(function (fn) {
    check(publicProtoJs.indexOf('function ' + fn) !== -1, 'js/tn-protocol-public.js: ' + fn);
});
check(publicProtoJs.indexOf('protocol.published') !== -1, 'публичная страница читает опубликованный снимок');
check(publicProtoJs.indexOf('calcRoundStats') !== -1, 'live-протокол считается той же математикой (calcRoundStats)');

// ── 4. Контракты данных ──
['source', 'registeredPlayers', 'results', 'protocol', 'divisions'].forEach(function (token) {
    check(tnAdminJs.indexOf(token) !== -1, 'js/tn-admin.js пишет узел: ' + token);
});
check(tnAdminJs.indexOf("'tournaments/'") !== -1 || tnAdminJs.indexOf('tournaments/') !== -1,
    'запись в tournaments/<id> (совместимо со скорингом)');
check(coreTournamentJs.indexOf('protocolRows') !== -1 && coreTournamentJs.indexOf('buildNominations') !== -1,
    'tournament-core.js сохраняет контракты протокола для публичной страницы');
check(tnAdminJs.indexOf('pestovoAutoFinishTournament') !== -1, 'автозавершение переиспользуется из utils.js');
check(tnAdminJs.indexOf('psOpen') !== -1 && tnAdminJs.indexOf('peInit') !== -1,
    'стартовый лист и быстрый редактор переиспользуются (start-admin/pe-edit)');
check(tnAdminJs.indexOf("tnaL(") !== -1 && tnAdminJs.indexOf('currentLang') !== -1, 'двуязычный интерфейс RU/EN');

// ── 5. Старые турниры скрыты из интерфейса ──
['js/tournaments.js', 'js/start-admin.js'].forEach(function (f) {
    var src = read(f);
    check(src.indexOf('fromWizard') !== -1 && src.indexOf('fromStudio') !== -1,
        f + ': турниры старой системы скрыты из интерфейса');
});

// ── 6. Service Worker ──
check(swJs.indexOf('tn-admin.html') !== -1, 'sw.js: новая страница в precache');
check(swJs.indexOf('tn-protocol.html') !== -1, 'sw.js: публичный протокол в precache');
['tn-wizard', 'tn-engine', 'tn-studio.js', 'tournament-admin.js', 'admin-tournaments.js'].forEach(function (token) {
    check(swJs.indexOf(token) === -1, 'sw.js: удалён ' + token);
});

console.log('\n' + total + ' checks, failures: ' + failures);
process.exit(failures ? 1 : 0);
