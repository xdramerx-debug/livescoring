#!/usr/bin/env node
'use strict';
/*
 * tools/test-official-delivery.js — доставка вызова судьи/маршала во время раунда.
 *
 * Зачем. Жалоба с поля: «тестовые уведомления приходят и в ВК, и в Telegram,
 * а когда игрок жмёт «Вызвать судью» — нет». Кнопки «Проверить Группу/Канал/ВК»
 * в админке отправляют сообщение ИЗ БРАУЗЕРА значением из поля ввода, поэтому
 * они проходят даже тогда, когда боевой путь сломан. Боевой путь другой:
 *   игрок → alerts/<id> → Cloud Function onAlertCreated → Telegram/VK,
 * и токены он берёт из ветки channels/ через Admin SDK.
 *
 * Что проверяем (реальные причины расхождения теста и боя):
 *  1. VK: сервер обязан слать application/x-www-form-urlencoded. VK API не
 *     поддерживает JSON в теле запроса (dev.vk.com/ru/api/api-requests:
 *     «Значение application/json в настоящее время не поддерживается») —
 *     JSON-тело давало ошибку 100, и вызов в ВК не уходил, хотя JSONP-тест
 *     из браузера проходил.
 *  2. Telegram: понимает и старые имена полей (botToken/chatId), которые
 *     оставляет migrateLegacyChannelSecrets(), и один бот на группу + канал.
 *  3. Отчёт по каждому каналу: sent / not_configured / error — и он пишется
 *     в alerts/<id>/delivery, чтобы админ видел причину, а не гадал.
 *  4. Сбой одного канала не отменяет остальные и не роняет Web Push.
 *  5. Антиспам-ключ — игрок+тип, а не раунд: второй вызов из того же флайта
 *     больше не отбрасывается молча.
 *  6. testOfficialCallDelivery — серверная проверка из админки (тот же код
 *     доставки), только для админа/мастера.
 *  7. Админка: сохранение не затирает токен пустым полем, ошибка записи
 *     в channels/ больше не проглатывается, есть кнопка серверной проверки.
 *  8. Поведение новых кусков админки в jsdom: слияние при сохранении, отчёт
 *     серверной проверки, инструкция при незадеплоенной функции, строка
 *     доставки в панели «Вызовы» и экранирование причины отказа.
 *
 * Запуск: node tools/test-official-delivery.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failures = 0, checks = 0;
function ok(cond, label, extra) {
    checks++;
    if (!cond) { failures++; console.error('FAIL - ' + label + (extra ? '\n       ' + extra : '')); }
    else console.log('ok  - ' + label);
}
function eq(a, b, label) {
    const as = JSON.stringify(a), bs = JSON.stringify(b);
    ok(as === bs, label, as === bs ? '' : 'actual ' + as + ' expected ' + bs);
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

// ── Извлечение тела функции по имени (со счётчиком скобок) ────────────────
function fnBody(src, name) {
    const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
    const m = re.exec(src);
    if (!m) return null;
    const i = src.indexOf('{', m.index);
    if (i === -1) return null;
    let depth = 0;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
    }
    return null;
}

const functionsSrc = read('functions/index.js');

// ── 1. Статические проверки серверного кода ───────────────────────────────
ok(/async function channelPostForm/.test(functionsSrc),
    'functions/index.js: есть отправка form-urlencoded (channelPostForm)');
ok(/channelPostForm\('https:\/\/api\.vk\.com\/method\/messages\.send'/.test(functionsSrc),
    'VK messages.send вызывается через channelPostForm');
ok(!/channelPostJson\('https:\/\/api\.vk\.com/.test(functionsSrc),
    'VK messages.send больше НЕ вызывается с JSON-телом');
const formBody = fnBody(functionsSrc, 'channelPostForm') || '';
ok(/application\/x-www-form-urlencoded/.test(formBody) && /URLSearchParams/.test(formBody),
    'channelPostForm: Content-Type x-www-form-urlencoded + тело из URLSearchParams');
ok(/application\/json в настоящее время не поддерживается|не принимает application\/json/i.test(functionsSrc),
    'причина (VK не принимает JSON) зафиксирована комментарием');

ok(/alerts\/' \+ alertId \+ '\/delivery/.test(functionsSrc) || /\/delivery/.test(functionsSrc),
    'отчёт доставки пишется в alerts/<id>/delivery');
ok(/function recordDelivery/.test(functionsSrc), 'есть recordDelivery');
const alertBlock = functionsSrc.slice(functionsSrc.indexOf('exports.onAlertCreated'));
ok(/recordDelivery\(snap\.key, report\)/.test(alertBlock),
    'onAlertCreated сохраняет отчёт доставки вызова');
ok(/recordDelivery\(snap\.key, null, \{ skipped: 'notifications_disabled' \}\)/.test(alertBlock),
    'глобально выключенные уведомления видны в отчёте (skipped)');
ok(/skipped: 'rate_limited'/.test(alertBlock), 'срабатывание антиспама видно в отчёте');
ok(/const rateKey = 'alert:' \+ \[a\.roundId \|\| 'noround', a\.playerId \|\| 'anon', a\.type\]\.join\(':'\)/.test(alertBlock),
    'антиспам-ключ: раунд + игрок + тип (второй вызов из флайта не отбрасывается)');
ok(!/rateLimited\('alert:' \+ \(a\.roundId \|\| a\.hole \|\| 'anon'\), 2000\)/.test(functionsSrc),
    'прежний ключ «один вызов на раунд» убран');
ok(/deliverOfficialCall\(a\)[\s\S]{0,400}await sendToSubscriptions|report\.sent/.test(alertBlock),
    'доставка в каналы не блокирует Web Push');

ok(/exports\.testOfficialCallDelivery/.test(functionsSrc),
    'есть callable testOfficialCallDelivery (проверка серверного пути из админки)');
const testFnBlock = functionsSrc.slice(functionsSrc.indexOf('exports.testOfficialCallDelivery'));
ok(/isAdminProfile\(profile\)/.test(testFnBlock) && /permission-denied/.test(testFnBlock),
    'testOfficialCallDelivery: только админ/мастер');
ok(/deliverOfficialCall\(a\)/.test(testFnBlock),
    'testOfficialCallDelivery прогоняет тот же deliverOfficialCall');
ok(/globalNotificationsEnabled\(\)/.test(testFnBlock),
    'testOfficialCallDelivery учитывает глобальный выключатель');

// ── 2. Динамические проверки: deliverOfficialCall на фейковом fetch ───────
const NEEDED = ['channelEscHtml', 'officialCallHtml', 'officialCallPlain', 'channelStr',
    'normalizeChannelSettings', 'channelPost', 'channelPostJson', 'channelPostForm',
    'readChannelSettings', 'deliverOfficialCall'];
const parts = [];
const constM = functionsSrc.match(/const CHANNEL_FETCH_TIMEOUT_MS = \d+;/);
const vkVerM = functionsSrc.match(/const VK_API_VERSION = '[^']+';/);
ok(!!constM && !!vkVerM, 'константы каналов извлечены');
parts.push(constM ? constM[0] : 'const CHANNEL_FETCH_TIMEOUT_MS = 6000;');
parts.push(vkVerM ? vkVerM[0] : "const VK_API_VERSION = '5.131';");
NEEDED.forEach(function (name) {
    const body = fnBody(functionsSrc, name);
    ok(!!body, 'извлечена функция ' + name);
    if (body) parts.push(body);
});

function makeSandbox(channelsValue, opts) {
    opts = opts || {};
    const calls = [];
    const responses = opts.responses || {};
    const sandbox = {
        console: console,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        URLSearchParams: URLSearchParams,
        AbortController: AbortController,
        Date: Date,
        calls: calls,
        db: {
            ref: function (p) {
                return {
                    get: function () {
                        if (opts.dbError) return Promise.reject(new Error(opts.dbError));
                        return Promise.resolve({ val: function () { return p === 'channels' ? channelsValue : null; } });
                    },
                    set: function () { return Promise.resolve(); }
                };
            }
        },
        functions: {
            logger: { info: function () {}, warn: function () {}, error: function () {} }
        },
        fetch: function (url, init) {
            calls.push({ url: String(url), init: init || {} });
            const key = /api\.vk\.com/.test(url) ? 'vk' : (/sendMessage/.test(url) ? 'telegram' : 'other');
            const body = responses[key];
            if (body instanceof Error) return Promise.reject(body);
            const payload = body === undefined
                ? (key === 'vk' ? { response: 42 } : { ok: true, result: { message_id: 1 } })
                : body;
            return Promise.resolve({
                status: 200,
                text: function () { return Promise.resolve(typeof payload === 'string' ? payload : JSON.stringify(payload)); }
            });
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(parts.join('\n') + '\nthis.deliverOfficialCall = deliverOfficialCall;' +
        '\nthis.normalizeChannelSettings = normalizeChannelSettings;' +
        '\nthis.officialCallPlain = officialCallPlain;', sandbox);
    return sandbox;
}

const ALERT = {
    type: 'referee', hole: 7, playerName: 'Иван Петров',
    flightMembers: ['Иван Петров', 'Пётр Иванов'], time: Date.now()
};

function findCall(calls, needle) {
    return calls.filter(function (c) { return c.url.indexOf(needle) !== -1; })[0] || null;
}

function runChecks() {
    const full = {
        telegram: { groupToken: 'TG_GROUP', groupId: '-1001', channelToken: 'TG_CHAN', channelId: '@club' },
        vk: { token: 'VK_TOKEN', peerId: '2000000001' }
    };

    // 2.1 Всё настроено: три отправки, все успешны.
    let box = makeSandbox(full);
    return box.deliverOfficialCall(ALERT).then(function (report) {
        eq(report.sent.slice().sort(), ['telegram:channel', 'telegram:group', 'vk'],
            'доставлено во все три приёмника');
        eq(report.results['telegram:group'], 'sent', 'отчёт: telegram:group = sent');
        eq(report.results.vk, 'sent', 'отчёт: vk = sent');
        eq(report.configured, { 'telegram:group': true, 'telegram:channel': true, vk: true },
            'отчёт: все каналы помечены настроенными');

        // 2.2 VK: form-urlencoded, а не JSON.
        const vk = findCall(box.calls, 'api.vk.com/method/messages.send');
        ok(!!vk, 'запрос в VK отправлен');
        if (vk) {
            const ct = (vk.init.headers || {})['Content-Type'] || '';
            ok(/application\/x-www-form-urlencoded/.test(ct),
                'VK: Content-Type x-www-form-urlencoded (VK API не принимает JSON)', ct);
            const body = String(vk.init.body || '');
            ok(body.indexOf('{') === -1, 'VK: тело не JSON', body.slice(0, 80));
            const params = new URLSearchParams(body);
            eq(params.get('peer_id'), '2000000001', 'VK: peer_id в теле запроса');
            eq(params.get('access_token'), 'VK_TOKEN', 'VK: access_token в теле запроса');
            ok(!!params.get('v'), 'VK: версия API передана');
            ok(/^\d+$/.test(params.get('random_id') || ''), 'VK: random_id передан');
            const msg = params.get('message') || '';
            ok(msg.indexOf('Вызов Судьи') !== -1 && msg.indexOf('Иван Петров') !== -1 &&
                msg.indexOf('№7') !== -1 && msg.indexOf('<b>') === -1,
                'VK: текст вызова без HTML-разметки', msg);
        }

        // 2.3 Telegram: JSON c chat_id/text/parse_mode, токен в URL.
        const tg = box.calls.filter(function (c) { return /api\.telegram\.org/.test(c.url); });
        eq(tg.length, 2, 'Telegram: группа + канал');
        const tgGroup = tg.filter(function (c) { return c.url.indexOf('TG_GROUP') !== -1; })[0];
        ok(!!tgGroup, 'Telegram: запрос с токеном группы');
        if (tgGroup) {
            eq(JSON.parse(tgGroup.init.body).chat_id, '-1001', 'Telegram: chat_id группы');
            eq(JSON.parse(tgGroup.init.body).parse_mode, 'HTML', 'Telegram: parse_mode HTML');
            ok(/<b>Лунка:<\/b> №7/.test(JSON.parse(tgGroup.init.body).text), 'Telegram: HTML-разметка сохранена');
        }

        // 2.4 Старые имена полей (botToken/chatId) после миграции из /settings.
        const legacy = makeSandbox({
            telegram: { botToken: 'LEGACY_TG', chatId: '-1009' },
            vk: { token: 'VK2', peerId: 123456 }
        });
        return legacy.deliverOfficialCall(ALERT).then(function (rep2) {
            ok(rep2.sent.indexOf('telegram:group') !== -1,
                'legacy botToken/chatId: группа получает вызов');
            ok(rep2.sent.indexOf('vk') !== -1, 'peer_id числом принимается');
            const vk2 = findCall(legacy.calls, 'api.vk.com');
            eq(new URLSearchParams(String(vk2.init.body)).get('peer_id'), '123456',
                'VK: числовой peer_id приводится к строке');
        });
    }).then(function () {
        // 2.5 Один бот на группу и канал: channelToken пустой, channelId задан.
        const oneBot = makeSandbox({ telegram: { groupToken: 'ONE_BOT', groupId: '-1001', channelId: '@club' } });
        return oneBot.deliverOfficialCall(ALERT).then(function (rep) {
            ok(rep.sent.indexOf('telegram:channel') !== -1,
                'один бот на группу и канал: канал получает вызов');
            const chan = oneBot.calls.filter(function (c) { return c.url.indexOf('ONE_BOT') !== -1; });
            eq(chan.length, 2, 'бот использован для группы и канала');
        });
    }).then(function () {
        // 2.6 Ничего не настроено: отчёт not_configured, ни одного запроса.
        const empty = makeSandbox({});
        return empty.deliverOfficialCall(ALERT).then(function (rep) {
            eq(rep.sent, [], 'пустые channels/: ничего не отправлено');
            eq(rep.results, { 'telegram:group': 'not_configured', 'telegram:channel': 'not_configured', vk: 'not_configured' },
                'пустые channels/: каждый приёмник помечен not_configured');
            eq(empty.calls.length, 0, 'пустые channels/: внешних запросов нет');
        });
    }).then(function () {
        // 2.7 Ошибка VK не отменяет Telegram, и наоборот; причина — в отчёте.
        const vkBroken = makeSandbox({
            telegram: { groupToken: 'TG', groupId: '-1001' },
            vk: { token: 'VK', peerId: '1' }
        }, { responses: { vk: { error: { error_code: 100, error_msg: 'One of the parameters specified was missing or invalid' } } } });
        return vkBroken.deliverOfficialCall(ALERT).then(function (rep) {
            eq(rep.sent, ['telegram:group'], 'ошибка VK не отменила Telegram');
            ok(/^error: code 100/.test(rep.results.vk), 'ошибка VK попала в отчёт с кодом', rep.results.vk);
        });
    }).then(function () {
        const tgBroken = makeSandbox({
            telegram: { groupToken: 'TG', groupId: '-1001' },
            vk: { token: 'VK', peerId: '1' }
        }, { responses: { telegram: { ok: false, error_code: 400, description: 'Bad Request: chat not found' } } });
        return tgBroken.deliverOfficialCall(ALERT).then(function (rep) {
            eq(rep.sent, ['vk'], 'ошибка Telegram не отменила VK');
            eq(rep.results['telegram:group'], 'error: Bad Request: chat not found',
                'причина отказа Telegram — в отчёте');
        });
    }).then(function () {
        // 2.8 Таймаут/обрыв сети: исключение не пробрасывается, причина в отчёте.
        const netDown = makeSandbox({
            telegram: { groupToken: 'TG', groupId: '-1001' },
            vk: { token: 'VK', peerId: '1' }
        }, { responses: { telegram: new Error('network down'), vk: new Error('network down') } });
        return netDown.deliverOfficialCall(ALERT).then(function (rep) {
            eq(rep.sent, [], 'сеть лежит: ничего не доставлено, но и исключения нет');
            eq(rep.results['telegram:group'], 'error: network down', 'сетевая ошибка Telegram в отчёте');
            eq(rep.results.vk, 'error: network down', 'сетевая ошибка VK в отчёте');
        });
    }).then(function () {
        // 2.9 Не-JSON ответ (502 от прокси) не роняет функцию.
        const html502 = makeSandbox({ telegram: { groupToken: 'TG', groupId: '-1' } },
            { responses: { telegram: '<html>502 Bad Gateway</html>' } });
        return html502.deliverOfficialCall(ALERT).then(function (rep) {
            ok(/^error: /.test(rep.results['telegram:group']),
                'не-JSON ответ разобран в ошибку, а не в исключение', rep.results['telegram:group']);
        });
    }).then(function () {
        // 2.10 Ветка channels/ недоступна — отчёт not_configured, без падения.
        const dbDown = makeSandbox(null, { dbError: 'permission-denied' });
        return dbDown.deliverOfficialCall(ALERT).then(function (rep) {
            eq(rep.sent, [], 'channels/ недоступна: доставка не выполнена и не упала');
            eq(dbDown.calls.length, 0, 'channels/ недоступна: внешних запросов нет');
        });
    }).then(function () {
        // 2.11 Текст вызова: маршал, лунка, состав флайта.
        const box2 = makeSandbox({ telegram: { groupToken: 'TG', groupId: '-1' } });
        return box2.deliverOfficialCall({
            type: 'marshal', hole: 12, playerName: 'Anna', flightMembers: ['Anna', '  ', 'Bob'], time: 0
        }).then(function () {
            const sent = JSON.parse(findCall(box2.calls, 'api.telegram.org').init.body).text;
            ok(sent.indexOf('Вызов Маршала') !== -1, 'текст: вызов маршала');
            ok(sent.indexOf('№12') !== -1, 'текст: номер лунки');
            ok(sent.indexOf('Anna, Bob') !== -1, 'текст: состав флайта без пустых имён', sent);
        });
    });
}

// ── 3. Админка: сохранение, ошибки записи и серверная проверка ────────────
function checkAdminSide() {
    const ch = read('js/admin-channels.js');

    const saveFn = fnBody(ch, 'saveTelegramSettings') || '';
    ok(/db\.ref\('channels\/telegram'\)\.once\('value'\)/.test(saveFn),
        'saveTelegramSettings читает сохранённое перед записью');
    ok(/!mergedGroupToken && \(stored\.groupToken \|\| stored\.botToken\)/.test(saveFn),
        'пустое поле токена не затирает сохранённый токен (группа)');
    ok(/!mergedChannelToken/.test(saveFn), 'пустое поле токена не затирает сохранённый токен (канал)');
    ok(/groupToken: mergedGroupToken/.test(saveFn) && /channelToken: mergedChannelToken/.test(saveFn),
        'в базу уходит результат слияния, а не сырое значение полей');
    // Ни одна запись секретов в channels/ не должна остаться без сообщения об
    // ошибке: молчаливый отказ записи — это ровно «тесты зелёные, а во время
    // раунда тишина».
    [['saveTelegramSettings', true], ['saveVKSettings', true], ['persistChannelSecrets', true],
        ['migrateLegacyChannelSecrets', false]].forEach(function (pair) {
        const name = pair[0];
        const body = fnBody(ch, name) || '';
        ok(/channels\//.test(body) || /db\.ref\(path\)/.test(body), name + ' пишет секреты в channels/');
        if (pair[1]) {
            ok(/\.catch\(function\s*\((err|e)\)/.test(body) && /toast\(/.test(body),
                name + ' показывает ошибку записи токена');
        } else {
            ok(/console\.warn\(/.test(body), name + ' сообщает о неудачном переносе секретов');
        }
    });
    const persistCalls = (ch.match(/persistChannelSecrets\('channels\/(telegram|vk)'/g) || []).length;
    ok(persistCalls >= 3, 'persistChannelSecrets вызывается с путём channels/ (' + persistCalls + ' места)');

    const persistFn = fnBody(ch, 'persistChannelSecrets') || '';
    ok(!!persistFn, 'есть persistChannelSecrets (сохранение перед тестом)');
    ok(/toast\(/.test(persistFn) && /err && err\.message/.test(persistFn),
        'persistChannelSecrets показывает ошибку записи токена');
    ok(/(testTelegramGroupAlert|testTelegramChannelAlert|testVKAlert)/.test(ch) &&
        (ch.match(/persistChannelSecrets\(/g) || []).length >= 3,
        'все три браузерных теста сохраняют секрет через persistChannelSecrets');

    ok(/function testServerDelivery/.test(ch), 'есть testServerDelivery (проверка серверного пути)');
    const srv = fnBody(ch, 'testServerDelivery') || '';
    ok(/httpsCallable\('testOfficialCallDelivery'\)/.test(srv),
        'testServerDelivery дёргает серверный callable');
    ok(/unimplemented|NOT_FOUND/.test(srv),
        'незадеплоенная функция rozpoзнаётся и объясняется');
    ok(/firebase deploy --only functions/.test(srv),
        'админу показывается команда деплоя');
    ok(/notifications_disabled|enabled === false/.test(srv),
        'глобальный выключатель уведомлений объясняется');

    const admin = read('admin.html');
    ok(/data-act="testServerDelivery"/.test(admin), 'admin.html: кнопка серверной проверки');
    ok(/id="server-delivery-status"/.test(admin), 'admin.html: область отчёта серверной проверки');
    ok(!/Отправка выполняется напрямую через VK API \(JSONP\) без сторонних серверов/.test(admin),
        'admin.html: убрано неверное «отправка без сторонних серверов»');

    const alerts = read('js/admin-alerts.js');
    ok(/function renderAlertDeliveryStatus/.test(alerts), 'admin-alerts.js: рендер статуса доставки');
    ok(/renderAlertDeliveryStatus\(a\.delivery\)/.test(alerts),
        'панель «Вызовы» показывает статус доставки каждого вызова');
    ok(/skipped === 'notifications_disabled'/.test(alerts) && /skipped === 'rate_limited'/.test(alerts),
        'пропущенные вызовы объясняются в панели');

    const css = read('css/style.css');
    ok(/\.srv-delivery-status/.test(css) && /\.alert-delivery-status/.test(css),
        'стили отчётов доставки есть в css/style.css');
}

// ── 4. Поведение админки в jsdom: слияние при сохранении, отчёты, ошибка записи
function checkUiBehaviour() {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!doctype html><html><body>' +
        '<input id="tg-group-bot-token"><input id="tg-group-chat-id">' +
        '<input id="tg-channel-bot-token"><input id="tg-channel-id">' +
        '<input id="vk-access-token"><input id="vk-peer-id">' +
        '<div id="server-delivery-status" class="srv-delivery-status hidden"></div>' +
        '</body></html>', { runScripts: 'outside-only', url: 'https://club.local/admin.html' });
    const win = dom.window;
    win.currentLang = 'ru';
    const toasts = [];
    win.toast = function (m, k) { toasts.push({ m: String(m), k: k }); };
    win.escapeHtml = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    };
    win.fmtTime = function () { return '12:00'; };
    win.eval(read('js/admin-channels.js'));
    win.eval(read('js/admin-alerts.js'));

    function mockDb(state) {
        const writes = [];
        win.db = {
            ref: function (p) {
                return {
                    once: function () { return Promise.resolve({ val: function () { return state[p] || null; } }); },
                    update: function (v) { writes.push({ path: p, op: 'update', value: v }); return Promise.resolve(); },
                    set: function (v) { writes.push({ path: p, op: 'set', value: v }); return Promise.resolve(); },
                    remove: function () { writes.push({ path: p, op: 'remove' }); return Promise.resolve(); }
                };
            }
        };
        return writes;
    }
    const tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

    // 4.1 Пустое поле токена не затирает сохранённый токен.
    let writes = mockDb({ 'channels/telegram': { groupToken: 'SAVED_TG', groupId: '-1001', channelToken: 'SAVED_CH', channelId: '@club' } });
    win.document.getElementById('tg-group-bot-token').value = '';
    win.document.getElementById('tg-group-chat-id').value = '';
    win.document.getElementById('tg-channel-bot-token').value = '';
    win.document.getElementById('tg-channel-id').value = '';
    win.saveTelegramSettings('group');
    return tick().then(tick).then(function () {
        const upd = writes.filter(function (w) { return w.op === 'update'; })[0];
        ok(!!upd, 'saveTelegramSettings: запись в базу выполнена');
        if (upd) {
            eq(upd.value.groupToken, 'SAVED_TG', 'пустое поле: сохранённый токен группы не затёрт');
            eq(upd.value.channelToken, 'SAVED_CH', 'пустое поле: сохранённый токен канала не затёрт');
            eq(upd.value.groupId, '-1001', 'пустое поле: сохранённый chat id группы не затёрт');
        }
        ok(toasts.some(function (t) { return /Пустые поля оставлены без изменений/.test(t.m); }),
            'админу сообщают, какие поля взяты из базы');

        // 4.2 Заполненное поле перезаписывает сохранённое.
        writes = mockDb({ 'channels/telegram': { groupToken: 'OLD', groupId: '-1' } });
        win.document.getElementById('tg-group-bot-token').value = 'NEW_TOKEN';
        win.document.getElementById('tg-group-chat-id').value = '-1002';
        win.saveTelegramSettings('group');
        return tick().then(tick);
    }).then(function () {
        const upd = writes.filter(function (w) { return w.op === 'update'; })[0];
        ok(!!upd && upd.value.groupToken === 'NEW_TOKEN' && upd.value.groupId === '-1002',
            'заполненное поле перезаписывает сохранённое значение');

        // 4.3 Ошибка записи секрета больше не проглатывается.
        toasts.length = 0;
        win.db = {
            ref: function () {
                return {
                    update: function () { return Promise.reject(new Error('permission_denied')); },
                    remove: function () { return Promise.resolve(); }
                };
            }
        };
        win.persistChannelSecrets('channels/vk', { token: 'X', peerId: '1' });
        return tick().then(tick);
    }).then(function () {
        ok(toasts.some(function (t) { return /НЕ сохранён в базу/.test(t.m) && /permission_denied/.test(t.m); }),
            'отказ записи в channels/ показан админу с причиной');

        // 4.4 Отчёт серверной проверки: успех.
        win.pestovoFunctions = function () {
            return Promise.resolve({
                httpsCallable: function () {
                    return function () {
                        return Promise.resolve({
                            data: {
                                ok: true, enabled: true, reason: '',
                                configured: { 'telegram:group': true, 'telegram:channel': false, vk: true },
                                results: { 'telegram:group': 'sent', 'telegram:channel': 'not_configured', vk: 'sent' },
                                sent: ['telegram:group', 'vk'], at: Date.now()
                            }
                        });
                    };
                }
            });
        };
        win.testServerDelivery();
        return tick().then(tick);
    }).then(function () {
        const el = win.document.getElementById('server-delivery-status');
        ok(/is-ok/.test(el.className), 'успешная проверка подсвечена зелёным');
        ok(/Серверная доставка работает/.test(el.textContent), 'успех: понятный заголовок');
        eq(el.querySelectorAll('span').length, 3, 'отчёт: по строке на каждый приёмник');
        ok(/не настроен/.test(el.textContent), 'ненастроенный канал назван, а не пропущен');

        // 4.5 Функция не задеплоена → инструкция.
        win.pestovoFunctions = function () {
            return Promise.resolve({
                httpsCallable: function () {
                    return function () {
                        const e = new Error('NOT_FOUND: Requested entity was not found.');
                        e.code = 'functions/unimplemented';
                        return Promise.reject(e);
                    };
                }
            });
        };
        win.testServerDelivery();
        return tick().then(tick);
    }).then(function () {
        const el = win.document.getElementById('server-delivery-status');
        ok(/is-bad/.test(el.className), 'незадеплоенная функция подсвечена красным');
        ok(/firebase deploy --only functions/.test(el.textContent),
            'незадеплоенная функция: показана команда деплоя');

        // 4.6 Отчёт доставки в панели «Вызовы» + экранирование причины.
        const none = win.renderAlertDeliveryStatus(undefined);
        ok(/Нет отчёта серверной доставки/.test(none), 'без delivery — явная подсказка, а не тишина');
        const bad = win.renderAlertDeliveryStatus({
            channels: { 'telegram:group': 'sent', vk: 'error: code 100: <img src=x onerror=alert(1)>' },
            configured: { 'telegram:group': true, vk: true }, sent: 1, push: 2, at: Date.now()
        });
        ok(/is-bad/.test(bad), 'ошибка канала подсвечивает строку доставки');
        ok(/push: 2/.test(bad), 'в отчёте видно число подписок админов');
        ok(bad.indexOf('<img') === -1 && bad.indexOf('&lt;img') !== -1,
            'причина отказа экранирована (строка приходит с сервера)');
        const off = win.renderAlertDeliveryStatus({ skipped: 'notifications_disabled' });
        ok(/выключены для всех/.test(off), 'глобальный выключатель объясняется в панели');
    });
}

runChecks().then(function () {
    checkAdminSide();
    return checkUiBehaviour();
}).then(function () {
    console.log('');
    console.log(failures ? ('ПРОВАЛЕНО: ' + failures + ' из ' + checks) : ('ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (' + checks + ')'));
    process.exit(failures ? 1 : 0);
}).catch(function (err) {
    console.error(err);
    process.exit(1);
});
