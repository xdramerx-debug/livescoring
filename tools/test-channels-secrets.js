#!/usr/bin/env node
'use strict';
/*
 * Секреты интеграций (токен Telegram-бота, VK access token) не должны быть
 * доступны из интернета. История: они лежали в `settings/telegram` и
 * `settings/vk`, а у `/settings` стоит `.read: true` — то есть живой токен
 * читался без авторизации, а клиент ещё и отправлял алерты напрямую через
 * api.telegram.org из браузера (docs/CODE-AUDIT-2026-10-2.md, находка 1, P0).
 *
 * Что проверяем:
 *  1. database.rules.json: ветка `channels` читается только админом/мастером,
 *     пишется только админом; в `settings/telegram|vk` разрешено лишь удаление.
 *  2. `/markers` пишется только на листе `$rid/$pid/$hole` (анонимная QR-сессия
 *     больше не может перезаписать всю ветку), `/reactions` — admin||master.
 *  3. Клиентский код не читает токены из `/settings` и не хранит их в
 *     localStorage; боевую отправку делает сервер.
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
ok(/admin/.test(chRead) && /tournamentMaster/.test(chRead),
    '/channels.read: только админ или мастер турниров');
ok(!/auth != null/.test(chRead) && !/^\s*true\s*$/.test(chRead),
    '/channels.read: нет открытого доступа (auth != null / true)');
ok(/admin/.test(chWrite) && !/tournamentMaster/.test(chWrite),
    '/channels.write: только админ');

const settings = rules.settings || {};
ok(settings['.read'] === true, '/settings.read остаётся true — поэтому секретов там быть не может');
ok(settings.telegram && settings.telegram['.validate'] === '!newData.exists()',
    'settings/telegram: разрешено только удаление (.validate "!newData.exists()")');
ok(settings.vk && settings.vk['.validate'] === '!newData.exists()',
    'settings/vk: разрешено только удаление (.validate "!newData.exists()")');

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

// ── 4. Боевая отправка — на сервере, а не из браузера ─────────────────────
for (const rel of ['js/official-alerts.js', 'src/official-alerts.js']) {
    const src = read(rel);
    for (const fn of ['sendTelegramOfficialAlert', 'sendVKOfficialAlert']) {
        const body = fnBody(src, fn);
        ok(!!body, rel + ': ' + fn + ' определена');
        if (!body) continue;
        ok(!/fetch\s*\(|api\.telegram\.org|api\.vk\.com|XMLHttpRequest/.test(body),
            rel + ': ' + fn + ' не ходит в Telegram/VK из браузера (делает сервер)');
    }
}

const functions = read('functions/index.js');
ok(/function readChannelSettings/.test(functions) && /function deliverOfficialCall/.test(functions),
    'functions/index.js: доставка алертов на сервере (readChannelSettings/deliverOfficialCall)');
const deliver = fnBody(functions, 'deliverOfficialCall') || '';
ok(/readChannelSettings\(/.test(deliver), 'deliverOfficialCall берёт токены через readChannelSettings');
ok(!/settings\/telegram|settings\/vk/.test(functions),
    'functions/index.js не читает токены из /settings');

if (failed) { console.error('\nПровалено проверок: ' + failed); process.exit(1); }
console.log('\nВсе проверки секретов интеграций пройдены ✔');
