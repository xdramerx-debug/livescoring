#!/usr/bin/env node
'use strict';
/*
 * Секреты интеграций (токен Telegram-бота, VK access token) не должны быть
 * доступны из интернета. История: они лежали в `settings/telegram` и
 * `settings/vk`, а у `/settings` стоит `.read: true` — то есть живой токен
 * читался без авторизации (docs/CODE-AUDIT-2026-10-2.md, находка 1, P0).
 *
 * В 1.122.0 токены спрятали в ветку `channels/` (чтение только админу/мастеру)
 * и перенесли отправку на Cloud Function. В 1.123.0 заказчик отказался от
 * зависимости от Cloud Functions: вызов судьи обязан уходить из браузера
 * игрока, а значит браузер обязан уметь прочитать токен. Решение — осознанное
 * (подтверждено заказчиком, описано в docs/release-1.123.0.md):
 *   `channels/.read = "auth != null"` — токен виден любому ВОШЕДШЕМУ
 *   (включая анонимную QR-сессию), но по-прежнему не виден из интернета без
 *   авторизации; запись остаётся строго админской.
 *
 * Что проверяем:
 *  1. database.rules.json: ветка `channels` читается только вошедшим
 *     (не `true`!), пишется только админом; в `settings/telegram|vk` разрешено
 *     лишь удаление; отчёт о доставке пишет админ или создатель вызова.
 *  2. `/markers` пишется только на листе `$rid/$pid/$hole` (анонимная QR-сессия
 *     больше не может перезаписать всю ветку), `/reactions` — admin||master.
 *  3. Клиентский код не читает токены из `/settings` и не хранит их в
 *     localStorage; браузер берёт их только из `channels/`, только в память
 *     страницы и никогда не логирует.
 *  4. Боевая отправка — в единственном месте (pestovoDeliverOfficialCall),
 *     с дедупликацией, с учётом режима доставки и глобального выключателя.
 *  5. Сервер (functions/index.js) в режиме 'client' молчит — иначе судейский
 *     чат получил бы два одинаковых сообщения.
 *  6. CSP разрешает VK JSONP (script-src api.vk.com) и Telegram fetch.
 *
 * Запуск: node tools/test-channels-secrets.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function ok(cond, msg) {
    if (cond) console.log('  ok  - ' + msg);
    else { failed++; console.error('  FAIL - ' + msg); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// Извлечение тела функции по имени (со счётчиком скобок) — чтобы утверждения
// касались конкретной функции, а не «где-то в файле есть fetch».
function fnBody(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start === -1) return null;
    let i = src.indexOf('{', start);
    if (i === -1) return null;
    let depth = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
    }
    return null;
}

// ── 1. Правила RTDB ───────────────────────────────────────────────────────
const rules = JSON.parse(read('database.rules.json')).rules;

ok(rules.channels && typeof rules.channels === 'object', 'database.rules.json: ветка /channels существует');
const chRead = (rules.channels || {})['.read'] || '';
const chWrite = (rules.channels || {})['.write'] || '';
ok(chRead.trim() === 'auth != null',
    '/channels.read = "auth != null": токены видны вошедшему (нужно для отправки из браузера), но не интернету');
ok(!/^\s*true\s*$/.test(chRead) && !/^\s*"?\s*true/.test(chRead),
    '/channels.read: НЕ true — без авторизации токен не читается');
ok(/admin/.test(chWrite) && !/tournamentMaster/.test(chWrite) && !/auth != null/.test(chWrite),
    '/channels.write: только админ (игрок не может подменить токен)');

const settings = rules.settings || {};
ok(settings['.read'] === true, '/settings.read остаётся true — поэтому секретов там быть не может');
ok(settings.telegram && settings.telegram['.validate'] === '!newData.exists()',
    'settings/telegram: разрешено только удаление (.validate "!newData.exists()")');
ok(settings.vk && settings.vk['.validate'] === '!newData.exists()',
    'settings/vk: разрешено только удаление (.validate "!newData.exists()")');

// Режим доставки — публичная настройка без секретов: её обязан уметь
// прочитать и браузер игрока, и (опционально) Cloud Function.
const deliveryMode = (((settings.alert_delivery_mode) || {}));
ok(!deliveryMode['.read'] || deliveryMode['.read'] === true,
    'settings/alert_delivery_mode: не закрыт для чтения (браузер игрока читает режим)');
ok(deliveryMode['.validate'] === "newData.isString() && (newData.val() === 'client' || newData.val() === 'server')",
    'settings/alert_delivery_mode: .validate допускает только client|server');

// Отчёт о доставке пишет браузер игрока — значит на leaf нужна своя .write.
const alertId = ((rules.alerts || {})['$id']) || {};
const deliv = alertId.delivery || {};
ok(typeof deliv['.write'] === 'string' && /auth != null/.test(deliv['.write']),
    'alerts/$id/delivery.write существует и требует авторизации');
ok(/createdBy/.test(deliv['.write'] || '') && /playerId/.test(deliv['.write'] || ''),
    'alerts/$id/delivery.write: отчёт пишет админ, создатель вызова или сам игрок');
ok(!deliv['.read'] || deliv['.read'] === false,
    'alerts/$id/delivery: чтение не расширяется отдельно (наследует alerts/$id)');

// ── 2. Права на запись игровых веток (находка 2) ──────────────────────────
const markers = rules.markers || {};
ok(!markers['.write'], '/markers: нет записи на уровне ветки');
const holeRule = ((((markers['$rid'] || {})['$pid'] || {})['$hole']) || {});
ok(typeof holeRule['.write'] === 'string' && holeRule['.write'].length > 0,
    '/markers/$rid/$pid/$hole.write: запись только на листе');
ok(/auth\.uid === \$pid|createdBy|markedBy|markerAssignments|tournamentMaster/.test(holeRule['.write'] || ''),
    '/markers: лист пишут только участники раунда, админ или мастер');
ok(!rules.reactions['.write'] || !/^auth != null$/.test(String(rules.reactions['.write']).trim()),
    '/reactions.write: больше не "auth != null"');
ok(/admin/.test(String(rules.reactions['.write'])) && /tournamentMaster/.test(String(rules.reactions['.write'])),
    '/reactions.write: админ или мастер турниров');

// ── 3. Клиент: ни токенов в /settings, ни токенов в браузере ──────────────
const jsDir = path.join(ROOT, 'js');
const srcDir = path.join(ROOT, 'src');
const clientFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'))
    .map((f) => 'js/' + f)
    .concat(fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).map((f) => 'src/' + f));

// Комментарии не в счёт: в них как раз описано, почему токенов там больше нет.
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/([^:'"\\])\/\/.*$/gm, '$1');
}

// Единственное легальное обращение к settings/telegram|vk — одноразовый
// перенос секретов в /channels внутри admin-channels.js.
const settingsSecretReaders = [];
for (const rel of clientFiles) {
    const src = stripComments(read(rel));
    if (!/settings\/(telegram|vk)/.test(src)) continue;
    if (rel !== 'js/admin-channels.js') { settingsSecretReaders.push(rel); continue; }
    // В admin-channels.js обращения обязаны быть только в функции переноса
    // (чтение + обнуление) и в cleanup-вызовах .remove().
    const outside = src.split('\n').filter((line) => /settings\/(telegram|vk)/.test(line))
        .filter((line) => !/\.remove\(\)|= null;|\.once\('value'\)/.test(line));
    if (outside.length) settingsSecretReaders.push(rel + ' (' + outside[0].trim().slice(0, 60) + ')');
}
ok(settingsSecretReaders.length === 0,
    'клиент не читает/не пишет токены в /settings' +
    (settingsSecretReaders.length ? ': ' + settingsSecretReaders.join(', ') : ''));

const channelsSrc = read('js/admin-channels.js');
const migration = fnBody(channelsSrc, 'migrateLegacyChannelSecrets');
ok(!!migration && /channels\/telegram/.test(migration) && /channels\/vk/.test(migration) &&
    /updates\['settings\/telegram'\] = null/.test(migration) && /updates\['settings\/vk'\] = null/.test(migration),
    'migrateLegacyChannelSecrets переносит секреты в /channels и обнуляет старые узлы');

// В localStorage остаются только ID чатов — ни одного ключа со словом token.
const storeKeys = [];
const keyRe = /channelStore(?:Get|Set)\(\s*'([^']+)'/g;
let m;
while ((m = keyRe.exec(channelsSrc)) !== null) storeKeys.push(m[1]);
ok(storeKeys.length > 0, 'admin-channels.js: локальный кэш настроек используется (' + storeKeys.length + ' ключей)');
const secretKeys = storeKeys.filter((k) => /token|secret|password/i.test(k));
ok(secretKeys.length === 0, 'в localStorage нет ключей с токенами' +
    (secretKeys.length ? ': ' + secretKeys.join(', ') : ''));
ok(/CHANNEL_SECRET_STORE_KEYS/.test(channelsSrc) &&
    /pestovo_tg_group_token/.test(channelsSrc) &&
    /function purgeChannelSecretsFromStorage/.test(channelsSrc),
    'старые токен-ключи вычищаются из localStorage при загрузке');

// Все записи db.ref(...) с токенами идут в channels/.
const tokenWrites = channelsSrc.split('\n')
    .filter((l) => /db\.ref\('([^']+)'\)/.test(l) && /[Tt]oken/.test(l))
    .map((l) => /db\.ref\('([^']+)'\)/.exec(l)[1])
    .filter((p) => p.indexOf('channels/') !== 0);
ok(tokenWrites.length === 0, 'токены пишутся только в channels/*' +
    (tokenWrites.length ? '; исключение: ' + tokenWrites.join(', ') : ''));

// ── 4. Браузерная доставка: единственный отправитель, без утечек токена ───
for (const rel of ['js/official-alerts.js', 'src/official-alerts.js']) {
    const src = read(rel);

    // Токены — только из channels/, только в память страницы.
    const loader = fnBody(src, 'pestovoOfficialChannels');
    ok(!!loader, rel + ': pestovoOfficialChannels определена');
    if (loader) {
        ok(/db\.ref\('channels'\)/.test(loader), rel + ': настройки читаются из ветки channels/');
        ok(!/settings\/(telegram|vk)/.test(loader), rel + ': загрузчик не трогает settings/telegram|vk');
        ok(!/localStorage|sessionStorage/.test(loader), rel + ': токены не сохраняются в storage');
        ok(!/console\.(log|warn|error|debug)\([^)]*(cfg|token|vk|telegram)/.test(loader),
            rel + ': загрузчик не логирует прочитанные токены');
        ok(/settings\/alert_delivery_mode/.test(loader), rel + ': загрузчик читает режим доставки');
    }

    // Обе «официальные» точки входа делегируют в одну функцию — иначе onSent
    // (js/official-call.js зовёт их подряд) отправил бы два сообщения.
    for (const fn of ['sendTelegramOfficialAlert', 'sendVKOfficialAlert']) {
        const body = fnBody(src, fn);
        ok(!!body, rel + ': ' + fn + ' определена');
        if (!body) continue;
        ok(/pestovoDeliverOfficialCall\(/.test(body),
            rel + ': ' + fn + ' делегирует в pestovoDeliverOfficialCall');
        ok(!/fetch\s*\(|api\.telegram\.org|api\.vk\.com|XMLHttpRequest/.test(body),
            rel + ': ' + fn + ' не отправляет сама (единственный отправитель — pestovoDeliverOfficialCall)');
    }

    const deliver = fnBody(src, 'pestovoDeliverOfficialCall');
    ok(!!deliver, rel + ': pestovoDeliverOfficialCall определена');
    if (deliver) {
        ok(/st\.done\[key\]/.test(deliver), rel + ': доставка дедуплицируется по ключу вызова');
        ok(/mode === 'server'/.test(deliver), rel + ': в режиме server браузер молчит (дублей нет)');
        ok(/pestovoCheckGlobalNotificationsEnabled|pestovoAreGlobalNotificationsEnabled/.test(deliver),
            rel + ': глобальный выключатель уведомлений учитывается');
        ok(/pestovoRecordClientDelivery\(/.test(deliver), rel + ': результат пишется в отчёт о доставке');
        ok(!/toast\s*\(/.test(deliver), rel + ': игрок не видит ошибок доставки (только «Судья вызван»)');
        ok(!/localStorage|sessionStorage/.test(deliver), rel + ': доставка не хранит токены в storage');
    }

    const record = fnBody(src, 'pestovoRecordClientDelivery');
    ok(!!record, rel + ': pestovoRecordClientDelivery определена');
    if (record) {
        ok(/by: 'client'/.test(record), rel + ': отчёт помечен by: "client"');
        ok(/\.update\(/.test(record) && !/\.set\(/.test(record),
            rel + ': отчёт пишется update() — leaf delivery/push от сервера не затирается');
        ok(/\.catch\(/.test(record), rel + ': сбой записи отчёта не роняет доставку');
    }
}

// Экспортируемые Cloud Functions объявлены как `exports.name = …(async
// function (…) {…})`, поэтому по имени их не найти — берём тело от маркера.
function exportBody(src, name) {
    const start = src.indexOf('exports.' + name + ' =');
    if (start === -1) return null;
    // Слово "function" встречается и в `functions.database.ref('/alerts/{id}')`,
    // поэтому ищем именно объявление коллбэка, а не первое вхождение подстроки.
    const decl = /(?:async\s+)?function\s*\(/g;
    decl.lastIndex = start;
    const found = decl.exec(src);
    if (!found) return null;
    let i = src.indexOf('{', found.index + found[0].length);
    if (i === -1) return null;
    let depth = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
    }
    return null;
}

// ── 5. Сервер: молчит в режиме 'client' ───────────────────────────────────
const functions = read('functions/index.js');
ok(/function readChannelSettings/.test(functions) && /function deliverOfficialCall/.test(functions),
    'functions/index.js: доставка алертов на сервере (readChannelSettings/deliverOfficialCall)');
const deliver = fnBody(functions, 'deliverOfficialCall') || '';
ok(/readChannelSettings\(/.test(deliver), 'deliverOfficialCall берёт токены через readChannelSettings');
ok(!/settings\/telegram|settings\/vk/.test(functions),
    'functions/index.js не читает токены из /settings');
const modeFn = fnBody(functions, 'deliveryMode');
ok(!!modeFn && /settings\/alert_delivery_mode/.test(modeFn) && /'server'/.test(modeFn),
    'functions/index.js: deliveryMode() читает settings/alert_delivery_mode');
ok(!!modeFn && /return 'client'/.test(modeFn), 'deliveryMode(): режим по умолчанию — client');
const onAlert = exportBody(functions, 'onAlertCreated');
ok(!!onAlert, 'onAlertCreated найдена в functions/index.js');
if (onAlert) {
    ok(/const serverChannels = mode === 'server'/.test(onAlert),
        'onAlertCreated: режим доставки читается до всякой рассылки');
    ok(/if \(serverChannels\) \{/.test(onAlert),
        'onAlertCreated: рассылка в каналы — только в серверном режиме');
    ok(onAlert.indexOf('if (serverChannels)') < onAlert.indexOf('deliverOfficialCall(a)'),
        'onAlertCreated: deliverOfficialCall вызывается внутри серверной ветки');
    ok(/\} else \{/.test(onAlert) && /channels skipped/.test(onAlert),
        'onAlertCreated: в режиме client каналы пропускаются явно (нет дублей с браузером)');
    ok(onAlert.indexOf('sendToSubscriptions(') > onAlert.indexOf('channels skipped'),
        'onAlertCreated: Web Push отправляется после ветки каналов — то есть в любом режиме');
}

// ── 6. CSP: VK JSONP и Telegram fetch обязаны проходить ───────────────────
const hosting = read('firebase.json');
const csp = (hosting.match(/default-src[^"]+/) || [''])[0];
ok(/script-src[^;]*https:\/\/api\.vk\.com/.test(csp),
    'CSP script-src содержит https://api.vk.com (без него JSONP блокируется в проде)');
ok(/connect-src[^;]*https:/.test(csp),
    'CSP connect-src разрешает https: (fetch к api.telegram.org)');
// 'unsafe-inline' в style-src легален и был там до доставки — проверяем
// только script-src, который и решает, пройдёт ли VK JSONP.
const scriptSrc = (csp.match(/script-src[^;]*/) || [''])[0];
ok(/^script-src 'self'/.test(scriptSrc) && !/'unsafe-inline'|'unsafe-eval'|\*/.test(scriptSrc),
    'CSP script-src не ослаблен ради доставки: \'self\' + явные хосты, без unsafe-inline/unsafe-eval/*');

if (failed) { console.error('\nПровалено проверок: ' + failed); process.exit(1); }
console.log('\nВсе проверки секретов интеграций пройдены ✔');
