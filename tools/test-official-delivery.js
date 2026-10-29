#!/usr/bin/env node
'use strict';
/*
 * tools/test-official-delivery.js — доставка вызова судьи/маршала во время раунда.
 *
 * Зачем. Жалоба с поля: «тестовые уведомления приходят и в ВК, и в Telegram,
 * а когда игрок жмёт «Вызвать судью» — нет». Кнопки «Проверить Группу/Канал/ВК»
 * в админке отправляют сообщение значением из поля ввода, поэтому они проходят
 * даже тогда, когда боевой путь сломан. Боевой путь другой: игрок → alerts/<id>
 * → рассылка по токенам из ветки channels/.
 *
 * Кто именно рассылает, задаёт settings/alert_delivery_mode:
 *   'client' (по умолчанию) — браузер того, кто нажал кнопку. Cloud Functions
 *            не нужны вообще; токены читаются из channels/ (database.rules.json:
 *            ".read": "auth != null") и живут только в памяти страницы;
 *   'server' — Cloud Function onAlertCreated через Admin SDK, браузер молчит.
 * Второй отправитель молчит всегда, поэтому дублей нет ни в одном из режимов.
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
 *     доставки в панели «Вызовы», экранирование причины отказа и переключатель
 *     режима доставки (подпись, предупреждение о токенах, запись в базу).
 *  9. Клиентская доставка в vm-песочнице: реальные запросы в Telegram и VK
 *     JSONP, дедупликация двух точек входа, режимы client/server, глобальный
 *     выключатель, старые имена полей, один бот на группу и канал, пустые
 *     настройки, отказ одного канала, незадеплоенные правила и запрещённая
 *     запись отчёта.
 * 10. Проводка: вызов приносит alertId, запись в alerts/ приносит createdBy,
 *     в админке есть селектор режима и обработчики.
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

    // Записи режима доставки проверяются в следующих звеньях цепочки, поэтому
    // переменная обязана жить в области видимости функции, а не одного .then().
    let modeWrites = [];

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
        // Кто виноват в отсутствии отчёта, зависит от режима доставки: в
        // браузерном (по умолчанию) — незадеплоенные правила базы, в серверном
        // — Cloud Function. Подсказка обязана называть свою причину.
        win.alertDeliveryMode = 'client';
        const noneClient = win.renderAlertDeliveryStatus(undefined);
        ok(/Нет отчёта о доставке/.test(noneClient) && /firebase deploy --only database/.test(noneClient),
            'без delivery в режиме «Браузер» — подсказка про деплой правил базы');
        win.alertDeliveryMode = 'server';
        const none = win.renderAlertDeliveryStatus(undefined);
        ok(/Нет отчёта серверной доставки/.test(none),
            'без delivery в режиме «Сервер» — явная подсказка, а не тишина');
        win.alertDeliveryMode = 'client';
        const byClient = win.renderAlertDeliveryStatus({
            by: 'client', channels: { 'telegram:group': 'sent', vk: 'sent' }, sent: 2, at: Date.now()
        });
        ok(/Доставка из браузера/.test(byClient) && /is-ok/.test(byClient),
            'отчёт браузера игрока подписан как браузерный, а не серверный');
        const serverSkip = win.renderAlertDeliveryStatus({ skipped: 'server_mode' });
        ok(/режим доставки «Сервер»/.test(serverSkip),
            'молчание браузера в серверном режиме объясняется в панели');
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

        // 4.7 Переключатель режима доставки: чтение из базы, подпись режима,
        // предупреждение о видимости токенов и запись settings/alert_delivery_mode.
        win.t = function (k) { return k; }; // словарь не нужен — проверяем ключи
        win.document.body.insertAdjacentHTML('beforeend',
            '<select id="alert-delivery-mode"><option value="client"></option><option value="server"></option></select>' +
            '<small id="alert-delivery-mode-note"></small>' +
            '<p id="alert-delivery-warn" class="hidden"></p>');
        modeWrites = mockDb({ 'settings/alert_delivery_mode': 'server' });
        win.loadAlertDeliveryMode();
        return tick().then(tick);
    }).then(function () {
        const sel = win.document.getElementById('alert-delivery-mode');
        const note = win.document.getElementById('alert-delivery-mode-note');
        const warn = win.document.getElementById('alert-delivery-warn');
        eq(win.alertDeliveryMode, 'server', 'loadAlertDeliveryMode прочитал режим из базы');
        eq(sel.value, 'server', 'селектор показывает сохранённый режим');
        eq(note.getAttribute('data-i18n'), 'srv_delivery_mode_server_note',
            'подпись режима живёт в data-i18n — смена языка её перезаполнит');
        ok(/hidden/.test(warn.className),
            'в серверном режиме предупреждение о токенах скрыто (браузер их не читает)');

        win.saveAlertDeliveryMode('client');
        return tick().then(tick);
    }).then(function () {
        const warn = win.document.getElementById('alert-delivery-warn');
        const note = win.document.getElementById('alert-delivery-mode-note');
        const w = modeWrites.filter(function (x) { return x.path === 'settings/alert_delivery_mode'; })[0];
        ok(!!w && w.op === 'set' && w.value === 'client',
            'saveAlertDeliveryMode пишет settings/alert_delivery_mode = client');
        eq(win.alertDeliveryMode, 'client', 'режим переключён на браузерный');
        eq(note.getAttribute('data-i18n'), 'srv_delivery_mode_client_note', 'подпись режима обновлена');
        ok(!/hidden/.test(warn.className) && warn.getAttribute('data-i18n') === 'srv_delivery_client_warn',
            'в браузерном режиме показано предупреждение о видимости токенов вошедшим');
        ok(toasts.some(function (x) { return /srv_delivery_mode_saved/.test(x.m); }),
            'админ получает подтверждение сохранения режима');
    });
}

// ── 5. Клиентская доставка: браузер игрока (режим по умолчанию) ───────────
// Cloud Functions для вызова судьи больше не обязательны: сообщение отправляет
// тот, кто нажал кнопку. Проверяем реальные запросы — иначе «не работает» и
// «работает» снова неотличимы друг от друга.
const clientSrc = read('js/official-alerts.js');
const CLIENT_NEEDED = ['buildOfficialCallText', 'pestovoOfficialChannels',
    'sendTelegramSilentAlert', 'vkBuildAlertText', 'vkSendMessageJsonp',
    'sendVKSilentAlert', 'pestovoRecordClientDelivery', 'pestovoDeliverOfficialCall',
    'sendTelegramOfficialAlert', 'sendVKOfficialAlert'];
const clientParts = [];
CLIENT_NEEDED.forEach(function (name) {
    const body = fnBody(clientSrc, name);
    ok(!!body, 'клиент: извлечена функция ' + name);
    // fnBody возвращает тело вместе со скобками, но без сигнатуры. Песочница
    // исполняется в нестрогом режиме, где объявление функции внутри блока
    // всплывает в глобальную область — ровно так работает и серверная часть.
    if (body) clientParts.push(body);
});
const CLIENT_EXPOSE = CLIENT_NEEDED.map(function (n) {
    return '\nthis.' + n + ' = ' + n + ';';
}).join('');

function makeClientSandbox(channelsValue, mode, opts) {
    opts = opts || {};
    const calls = [], scripts = [], writes = [], toasts = [];
    const sandbox = {
        console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
        Date: Date, Math: Math, JSON: JSON, Object: Object, String: String,
        encodeURIComponent: encodeURIComponent, AbortController: AbortController,
        calls: calls, scripts: scripts, writes: writes, toasts: toasts,
        toast: function (m, k) { toasts.push({ m: String(m), k: k }); },
        escapeHtml: function (v) {
            return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
            });
        },
        fmtTime: function () { return '12:00'; },
        db: {
            ref: function (p) {
                return {
                    once: function () {
                        if (opts.dbError) return Promise.reject(new Error(opts.dbError));
                        let v = null;
                        if (p === 'channels') v = channelsValue;
                        else if (p === 'settings/alert_delivery_mode') v = mode;
                        return Promise.resolve({ val: function () { return v; } });
                    },
                    update: function (payload) { writes.push({ path: p, op: 'update', payload: payload }); return Promise.resolve(); },
                    set: function (payload) { writes.push({ path: p, op: 'set', payload: payload }); return Promise.resolve(); }
                };
            }
        },
        fetch: function (url, init) {
            calls.push({ url: String(url), init: init || {} });
            const body = opts.telegramResponse;
            if (body instanceof Error) return Promise.reject(body);
            const payload = body === undefined ? { ok: true, result: { message_id: 1 } } : body;
            return Promise.resolve({ json: function () { return Promise.resolve(payload); } });
        },
        document: {
            // cleanup() в vkSendMessageJsonp вынимает <script> из DOM, поэтому
            // узлам нужен removeChild — иначе в вывод летит пойманный TypeError.
            head: {
                appendChild: function (el) { el.parentNode = sandbox.document.head; scripts.push(el); },
                removeChild: function (el) { el.parentNode = null; }
            },
            body: {
                appendChild: function (el) { el.parentNode = sandbox.document.body; scripts.push(el); },
                removeChild: function (el) { el.parentNode = null; }
            },
            createElement: function (tag) {
                return { tagName: String(tag).toUpperCase(), src: '', parentNode: null, onerror: null };
            }
        }
    };
    sandbox.window = sandbox;
    if (opts.notificationsEnabled !== undefined) {
        sandbox.pestovoCheckGlobalNotificationsEnabled = function () {
            return Promise.resolve(opts.notificationsEnabled);
        };
    }
    vm.createContext(sandbox);
    vm.runInContext(clientParts.join('\n\n') + CLIENT_EXPOSE, sandbox);
    return sandbox;
}

// VK отвечает JSONP-коллбэком: пока его не вызвать, промис не разрешится.
function flushJsonp(sandbox, payload) {
    sandbox.scripts.forEach(function (sc) {
        const m = /callback=([^&]+)/.exec(sc.src || '');
        if (m && typeof sandbox[m[1]] === 'function') sandbox[m[1]](payload || { response: 42 });
    });
}
function pump(sandbox, rounds) {
    let chain = Promise.resolve();
    for (let i = 0; i < (rounds || 8); i++) {
        chain = chain.then(function () {
            return new Promise(function (r) { setTimeout(r, 0); });
        }).then(function () { flushJsonp(sandbox); });
    }
    return chain;
}
function tgBody(call) {
    try { return JSON.parse(call.init.body || '{}'); } catch (e) { return {}; }
}

const FULL_CLIENT = {
    telegram: { groupToken: 'TG_GROUP', groupId: '-1001', channelToken: 'TG_CHAN', channelId: '@club' },
    vk: { token: 'VK_TOKEN', peerId: '2000000001' }
};

function runClientChecks() {
    // 5.1 Режим 'client': уходят и Telegram (группа + канал), и ВКонтакте.
    let sb = makeClientSandbox(FULL_CLIENT, 'client');
    let report = sb.sendTelegramOfficialAlert('referee', 7, 'Иван Петров',
        ['Иван Петров', 'Пётр Иванов'], null, 'AID1');
    return pump(sb).then(function () { return report; }).then(function (r) {
        const tg = sb.calls.filter(function (c) { return /api\.telegram\.org/.test(c.url); });
        eq(tg.length, 2, 'клиент: два запроса в Telegram — группа и канал');
        ok(tg.every(function (c) { return c.init.method === 'POST'; }), 'клиент: Telegram — POST');
        const groupCall = tg.filter(function (c) { return /botTG_GROUP\//.test(c.url); })[0];
        const chanCall = tg.filter(function (c) { return /botTG_CHAN\//.test(c.url); })[0];
        ok(!!groupCall && !!chanCall, 'клиент: токен подставлен в URL обоих ботов');
        if (groupCall) {
            eq(tgBody(groupCall).chat_id, '-1001', 'клиент: chat_id группы');
            eq(tgBody(groupCall).parse_mode, 'HTML', 'клиент: группа получает HTML-разметку');
            ok(/Вызов Судьи/.test(tgBody(groupCall).text) && /Состав флайта/.test(tgBody(groupCall).text),
                'клиент: в тексте вызова есть заголовок и состав флайта');
        }
        if (chanCall) eq(tgBody(chanCall).chat_id, '@club', 'клиент: chat_id канала клуба');

        eq(sb.scripts.length, 1, 'клиент: один JSONP-запрос в ВКонтакте');
        const vkSrc = sb.scripts[0] ? sb.scripts[0].src : '';
        ok(/^https:\/\/api\.vk\.com\/method\/messages\.send\?/.test(vkSrc),
            'клиент: VK — messages.send на api.vk.com');
        ok(/access_token=VK_TOKEN/.test(vkSrc) && /peer_id=2000000001/.test(vkSrc),
            'клиент: токен и peer_id подставлены в VK-запрос');
        ok(/callback=/.test(vkSrc) && /random_id=\d+/.test(vkSrc) && /v=5\.199/.test(vkSrc),
            'клиент: VK-запрос с callback, random_id и версией API');
        ok(!/<b>/.test(decodeURIComponent(vkSrc)), 'клиент: в VK уходит обычный текст, без HTML-тегов');

        eq(r.channels, { 'telegram:group': 'sent', 'telegram:channel': 'sent', vk: 'sent' },
            'клиент: отчёт — все три приёмника доставлены');
        eq(r.sent, 3, 'клиент: счётчик доставленных равен трём');
        eq(sb.toasts.length, 0, 'клиент: игрок не видит ни одного тоста о доставке');

        eq(sb.writes.length, 1, 'клиент: отчёт о доставке записан один раз');
        const w = sb.writes[0] || {};
        eq(w.path, 'alerts/AID1/delivery', 'клиент: отчёт пишется в alerts/<id>/delivery');
        eq(w.op, 'update', 'клиент: отчёт пишется update(), а не set() — leaf push от сервера выживает');
        ok(w.payload && w.payload.by === 'client', 'клиент: отчёт помечен by: "client"');
        ok(w.payload && w.payload.channels && w.payload.channels.vk === 'sent',
            'клиент: в отчёте видно статус каждого приёмника');
    }).then(function () {
        // 5.2 Дедупликация: onSent зовёт обе точки входа подряд.
        sb = makeClientSandbox(FULL_CLIENT, 'client');
        report = sb.sendTelegramOfficialAlert('marshal', 3, 'Анна Смирнова', [], null, 'AID2')
            .then(function () {
                return sb.sendVKOfficialAlert('marshal', 3, 'Анна Смирнова', [], 'AID2');
            });
        return pump(sb).then(function () { return report; });
    }).then(function (r) {
        eq(sb.calls.filter(function (c) { return /api\.telegram\.org/.test(c.url); }).length, 2,
            'дедупликация: второй вход не удвоил Telegram (группа + канал, а не четыре)');
        eq(sb.scripts.length, 1, 'дедупликация: второй вход не удвоил ВКонтакте');
        eq(sb.writes.length, 1, 'дедупликация: отчёт о доставке записан один раз');
        ok(r && r.channels && r.channels.vk === 'sent', 'дедупликация: второй вход получил тот же отчёт');
    }).then(function () {
        // 5.3 Режим 'server': браузер молчит, иначе судейский чат получит дубль.
        sb = makeClientSandbox(FULL_CLIENT, 'server');
        report = sb.sendTelegramOfficialAlert('referee', 7, 'Иван Петров', [], null, 'AID3');
        return pump(sb).then(function () { return report; });
    }).then(function (r) {
        eq(sb.calls.length, 0, 'режим server: браузер не ходит в Telegram');
        eq(sb.scripts.length, 0, 'режим server: браузер не ходит в ВКонтакте');
        eq(r.skipped, 'server_mode', 'режим server: отчёт помечен server_mode');
        eq(sb.writes.length, 0, 'режим server: браузер не пишет отчёт — его напишет функция');
    }).then(function () {
        // 5.4 Глобальный выключатель уведомлений клуба.
        sb = makeClientSandbox(FULL_CLIENT, 'client', { notificationsEnabled: false });
        report = sb.sendTelegramOfficialAlert('referee', 7, 'Иван Петров', [], null, 'AID4');
        return pump(sb).then(function () { return report; });
    }).then(function (r) {
        eq(sb.calls.length, 0, 'уведомления выключены: браузер ничего не отправляет');
        eq(sb.scripts.length, 0, 'уведомления выключены: ВКонтакте тоже молчит');
        eq(r.skipped, 'notifications_disabled', 'уведомления выключены: причина записана в отчёт');
    }).then(function () {
        // 5.5 Старые имена полей (их оставляет migrateLegacyChannelSecrets).
        sb = makeClientSandbox({
            telegram: { botToken: 'LEGACY_TG', chatId: '-1002' },
            vk: { token: 'VK_TOKEN', peerId: 2000000002 }
        }, 'client');
        report = sb.sendTelegramOfficialAlert('referee', 5, 'Ольга Кузнецова', [], null, 'AID5');
        return pump(sb).then(function () { return report; });
    }).then(function (r) {
        ok(/botLEGACY_TG\//.test((sb.calls[0] || {}).url || ''),
            'клиент: понимает старые botToken/chatId');
        eq(tgBody(sb.calls[0] || { init: {} }).chat_id, '-1002', 'клиент: старый chatId принят');
        ok(/peer_id=2000000002/.test((sb.scripts[0] || {}).src || ''),
            'клиент: числовой peer_id приводится к строке');
        eq(r.channels['telegram:group'], 'sent', 'клиент: старый формат доставлен');
        eq(r.channels['telegram:channel'], 'not_configured', 'клиент: канала нет — статус not_configured');
    }).then(function () {
        // 5.6 Один бот на группу и канал (подсказка «или использовать один и тот же бот»).
        sb = makeClientSandbox({
            telegram: { groupToken: 'TG_GROUP', groupId: '-1001', channelId: '@club' },
            vk: {}
        }, 'client');
        report = sb.sendTelegramOfficialAlert('referee', 9, 'Иван Петров', [], null, 'AID6');
        return pump(sb).then(function () { return report; });
    }).then(function (r) {
        const tg = sb.calls.filter(function (c) { return /api\.telegram\.org/.test(c.url); });
        eq(tg.length, 2, 'один бот: ушли и группа, и канал');
        ok(tg.every(function (c) { return /botTG_GROUP\//.test(c.url); }),
            'один бот: для канала взят токен группы');
        eq(r.channels['telegram:channel'], 'sent', 'один бот: канал доставлен');
        eq(r.channels.vk, 'not_configured', 'без токена ВК статус not_configured, а не ошибка');
        eq(sb.scripts.length, 0, 'без токена ВК запрос в ВКонтакте не создаётся');
    }).then(function () {
        // 5.7 Ничего не настроено: запросов нет, но отчёт обязан появиться —
        // иначе админ снова увидит «тишину» вместо причины.
        sb = makeClientSandbox({}, 'client');
        report = sb.sendTelegramOfficialAlert('referee', 1, 'Иван Петров', [], null, 'AID7');
        return pump(sb).then(function () { return report; });
    }).then(function (r) {
        eq(sb.calls.length, 0, 'пустые channels/: ни одного запроса');
        eq(sb.scripts.length, 0, 'пустые channels/: ВКонтакте не трогается');
        eq(r.channels, { 'telegram:group': 'not_configured', 'telegram:channel': 'not_configured', vk: 'not_configured' },
            'пустые channels/: все приёмники помечены not_configured');
        eq(r.sent, 0, 'пустые channels/: доставлено ноль');
        eq((sb.writes[0] || {}).path, 'alerts/AID7/delivery', 'пустые channels/: отчёт всё равно записан');
    }).then(function () {
        // 5.8 Отказ Telegram не отменяет ВКонтакте и не показывается игроку.
        sb = makeClientSandbox(FULL_CLIENT, 'client', {
            telegramResponse: { ok: false, description: 'Bad Request: chat not found' }
        });
        report = sb.sendTelegramOfficialAlert('referee', 2, 'Иван Петров', [], null, 'AID8');
        return pump(sb).then(function () { return report; });
    }).then(function (r) {
        ok(/^error: /.test(r.channels['telegram:group']) && /chat not found/.test(r.channels['telegram:group']),
            'отказ Telegram: причина попала в отчёт');
        eq(r.channels.vk, 'sent', 'отказ Telegram не отменил доставку в ВКонтакте');
        eq(r.sent, 1, 'отказ Telegram: счётчик доставленных честный');
        eq(sb.toasts.length, 0, 'отказ Telegram: игрок не видит ошибку (только «Судья вызван»)');
        const w = sb.writes[0] || {};
        ok(w.payload && w.payload.channels && /chat not found/.test(w.payload.channels['telegram:group']),
            'отказ Telegram: причина сохранена в alerts/<id>/delivery для админа');
    }).then(function () {
        // 5.9 Правила не задеплоены (чтение channels/ запрещено): страница жива.
        sb = makeClientSandbox(null, 'client', { dbError: 'permission_denied' });
        report = sb.sendTelegramOfficialAlert('referee', 4, 'Иван Петров', [], null, 'AID9');
        return pump(sb).then(function () { return report; }).then(function (r) {
            eq(sb.calls.length, 0, 'чтение channels/ запрещено: запросов нет');
            ok(r && r.channels && r.channels['telegram:group'] === 'not_configured',
                'чтение channels/ запрещено: отчёт объясняет, что настройки недоступны');
        });
    }).then(function () {
        // 5.10 Запись отчёта запрещена (старые правила): доставка не страдает.
        sb = makeClientSandbox(FULL_CLIENT, 'client');
        sb.db.ref = function (p) {
            return {
                once: function () {
                    let v = null;
                    if (p === 'channels') v = FULL_CLIENT;
                    else if (p === 'settings/alert_delivery_mode') v = 'client';
                    return Promise.resolve({ val: function () { return v; } });
                },
                update: function () { return Promise.reject(new Error('permission_denied')); }
            };
        };
        report = sb.sendTelegramOfficialAlert('referee', 6, 'Иван Петров', [], null, 'AID10');
        return pump(sb).then(function () { return report; });
    }).then(function (r) {
        eq(r.channels['telegram:group'], 'sent',
            'запись отчёта запрещена: доставка всё равно выполнена');
        eq(r.channels.vk, 'sent', 'запись отчёта запрещена: ВКонтакте тоже доставлен');
    });
}

// ── 6. Статика: вызов обязан приносить alertId, а запись — createdBy ──────
function checkClientWiring() {
    const call = read('js/official-call.js');
    const solo = read('js/solo.js');
    const utils = read('js/utils.js');
    const admin = read('admin.html');
    const ch = read('js/admin-channels.js');
    const adminJs = read('js/admin.js');

    ok(/sendTelegramOfficialAlert\(ctx\.type, call\.hole, pName, members, null, call\.alertId\)/.test(call),
        'official-call.js передаёт alertId в Telegram-точку входа');
    ok(/sendVKOfficialAlert\(ctx\.type, call\.hole, pName, members, call\.alertId\)/.test(call),
        'official-call.js передаёт alertId в VK-точку входа');
    // v1.126.0: собственной рассылки в solo.js больше нет — и одиночный, и
    // групповой раунд идут через общий pestovoCallOfficial (js/official-call.js),
    // который передаёт call.alertId (проверено двумя строками выше).
    ok(/pestovoCallOfficial\(\{/.test(read('js/live.js')),
        'live.js: вызов судьи/маршала идёт через общий pestovoCallOfficial');
    ok(!/sendTelegramOfficialAlert/.test(solo) && !/sendVKOfficialAlert/.test(solo),
        'solo.js: собственная рассылка удалена (одна реализация — official-call.js)');

    const req = fnBody(utils, 'requestOfficialCall') || '';
    ok(/createdBy: myAuth && myAuth\.uid \? myAuth\.uid : ''/.test(req),
        'requestOfficialCall пишет createdBy — по нему правила разрешают отчёт о доставке');
    ok(/call\.alertId = ref\.key/.test(req), 'requestOfficialCall возвращает alertId вызывающему коду');

    ok(/id="alert-delivery-mode"[^>]*data-act="saveAlertDeliveryMode"/.test(admin),
        'admin.html: селектор режима доставки связан с обработчиком');
    ok(/<option value="client"/.test(admin) && /<option value="server"/.test(admin),
        'admin.html: у режима два значения — client и server');
    ok(/id="alert-delivery-warn"/.test(admin) && /id="alert-delivery-mode-note"/.test(admin),
        'admin.html: есть место для подписи режима и предупреждения о токенах');
    ok(/data-act="testServerDelivery"/.test(admin), 'admin.html: кнопка серверной проверки сохранена');

    ok(/function loadAlertDeliveryMode/.test(ch) && /function saveAlertDeliveryMode/.test(ch),
        'admin-channels.js: режим доставки читается и сохраняется');
    ok(/db\.ref\('settings\/alert_delivery_mode'\)\.set\(mode\)/.test(ch),
        'admin-channels.js: режим пишется в settings/alert_delivery_mode');
    ok(/srv_delivery_client_warn/.test(ch),
        'admin-channels.js: в браузерном режиме показывается предупреждение о видимости токенов');
    ok(/typeof loadAlertDeliveryMode === 'function'/.test(adminJs) && /loadAlertDeliveryMode\(\)/.test(adminJs),
        'admin.js загружает режим доставки вместе с остальными настройками');
}

runChecks().then(function () {
    checkAdminSide();
    checkClientWiring();
    return checkUiBehaviour();
}).then(function () {
    return runClientChecks();
}).then(function () {
    console.log('');
    console.log(failures ? ('ПРОВАЛЕНО: ' + failures + ' из ' + checks) : ('ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (' + checks + ')'));
    process.exit(failures ? 1 : 0);
}).catch(function (err) {
    console.error(err);
    process.exit(1);
});
