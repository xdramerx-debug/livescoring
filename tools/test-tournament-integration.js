// Контрактные проверки удаления администратора турниров при сохранении публичных страниц.
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
let failures = 0;
let total = 0;
function check(value, label) {
    total++;
    if (!value) { failures++; console.error('FAIL', label); }
    else console.log('ok  -', label);
}
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }

const adminHtml = read('admin.html');
const adminJs = read('js/admin.js');
const publicHtml = read('tournaments.html');
const publicTournament = read('js/tournament-public.js');
const publicStudio = read('js/tn-studio-public.js');
const scorecard = read('js/tn-scorecard.js');
const studioCore = read('js/tn-studio-core.js');
const oldPublicList = read('js/tournaments.js');
const sharedUtils = read('js/utils.js');
const sharedCss = read('css/style.css');
const sw = read('sw.js');
const i18n = read('js/i18n.js') + read('src/i18n.js');

// Удалены страница создания, редактор/стартовый лист, опубликованный протокол,
// генератор флайтов и только их тестовые наборы.
[
    'tn-admin.html', 'js/tn-admin.js', 'js/tn-admin-core.js', 'css/tn-admin.css',
    'js/start-admin.js', 'js/pe-edit.js', 'tn-protocol.html', 'js/tn-protocol-public.js',
    'js/admin-flights.js', 'docs/tn-admin.md',
    'tools/test-tn-admin.js', 'tools/test-tn-admin-ui.js', 'tools/test-start-admin.js',
    'tools/test-pe-edit.js', 'tools/test-scenario-formats-hierarchy.js'
].forEach(function (file) {
    check(!exists(file), file + ' удалён');
});
check(exists('tools/test-group-round-setup.js'), 'тест стандартной формы раунда сохранён');

// В админке больше нет ссылки на создание, загрузки генератора или legacy-перехода.
check(!adminHtml.includes('tn-admin.html'), 'admin.html не ссылается на страницу создания турнира');
check(!adminHtml.includes('js/admin-flights.js'), 'admin.html не загружает генератор флайтов');
check(!adminHtml.includes('css/tn-studio.css'), 'админка не загружает стили публичной таблицы счёта');
check(adminHtml.includes('tab_tournaments_view'), 'настройки вида публичных таблиц турниров сохранены');
check(!adminJs.includes('tn-admin.html'), 'admin.js не содержит legacy-переходов');
check(!/t === 'tournaments' \|\| t === 'start'/.test(adminJs), 'старые вкладки больше не перенаправляют в удалённую систему');

// Публичные страницы, регистрация и скоринг продолжают использовать собственные модули.
[
    'js/tournament-core.js', 'js/tn-studio-core.js', 'js/tn-studio-public.js',
    'js/tournaments.js', 'js/tn-scorecard.js', 'js/tournament-public.js', 'js/score-write.js'
].forEach(function (src) {
    check(publicHtml.includes(src), 'tournaments.html сохраняет ' + src);
});
check(publicTournament.includes('registeredPlayers') && publicTournament.includes('waitlist'),
    'публичный каталог сохраняет регистрации и лист ожидания');
check(publicTournament.includes('registrationOpen') && publicTournament.includes("'tournaments/'"),
    'публичная регистрация использует существующую базу турниров');
check(scorecard.includes('function tnScOpen') && scorecard.includes("modal.id = 'tnsc-modal'"),
    'публичный scorecard сохранён с динамической модалкой');
check(scorecard.includes('function tnScRender') && oldPublicList.includes('tnScOpen'),
    'scorecard продолжает открываться из публичной таблицы турниров');
check(publicStudio.includes('data-studio-act') && publicStudio.includes('function panelHtml'),
    'публичные таблицы счёта/результатов сохранены');
check(!/\bdb\.ref\([^)]*\)\.(?:set|update|remove)\(/.test(publicStudio),
    'публичная таблица счёта только отображает данные');
check(oldPublicList.includes('fromWizard') && oldPublicList.includes('fromStudio'),
    'фильтрация старых записей в независимом каталоге сохранена');
check(sharedUtils.includes('function pestovoStartHierarchy(') && sharedUtils.includes('function roundsDueForStart('),
    'общая логика иерархии стартовых флайтов и автостарта раундов сохранена');
check(sharedUtils.includes('function isRoundOpenForScoring(') && sharedUtils.includes('function roundStartCountdownMs('),
    'общий scoring gate и отсчёт времени сохранены');
check(sharedCss.includes('.group-flight-table') && sharedCss.includes('.tn-lb-flight') && sharedCss.includes('.tnsc-chip-flight'),
    'публичные таблицы, лидерборд и scorecard сохраняют flight-стили');

// Core для публичных таблиц оставляет только используемые read-only вычисления.
[
    'formatIso', 'normalizeName', 'listOf', 'divisionOf', 'courseHandicap',
    'playerCard', 'betterBall', 'formatId', 'fmtHcp', 'hcpLabel'
].forEach(function (name) {
    check(studioCore.includes('function ' + name + '('), 'публичное ядро сохраняет ' + name);
});
[
    'matchUsers', 'namesFromSheet', 'rosterRowsFromSheet', 'findStart',
    'legacyFormats', 'protocolDocHtml', 'importTemplateCsv'
].forEach(function (name) {
    check(!studioCore.includes(name), 'из публичного ядра удалён админский helper ' + name);
});

// Тесты scoring gate теперь зависят только от utils/live, не от удалённой админки.
const startGateTest = read('tools/test-tournament-start-gate.js');
const liveTest = read('tools/test-tournament-live.js');
check(startGateTest.includes("'js', 'live.js'") && startGateTest.includes("'js', 'utils.js'"),
    'scoring gate тесты utils/live сохранены');
check(!/start-admin|psRoundStartStatus|psSaveProtocol/.test(startGateTest),
    'из scoring gate удалены тесты админского стартового листа');
check(!/start-admin|psParseExcelGrid/.test(liveTest),
    'live-тесты не читают удалённый стартовый модуль');

// Удалённые файлы и ключи не остаются в precache/словарях.
[
    'tn-admin.html', 'tn-protocol.html', 'css/tn-admin.css', 'js/start-admin.js',
    'js/pe-edit.js', 'js/tn-admin.js', 'js/tn-admin-core.js',
    'js/tn-protocol-public.js', 'js/admin-flights.js'
].forEach(function (asset) {
    check(!sw.includes(asset), 'Service Worker не кэширует ' + asset);
});
[
    'tab_studio:', 'tab_start:', 'all_tournaments:', 'create_tournament:',
    'available_formats:', 'available_tees:', 'generate_flights_btn:', 'admin_only_tournaments:'
].forEach(function (key) {
    check(!i18n.includes(key), 'удалён мёртвый перевод ' + key);
});

console.log('\n' + total + ' checks, failures: ' + failures);
process.exit(failures ? 1 : 0);
