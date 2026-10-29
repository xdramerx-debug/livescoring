// Вызов официального лица: js/official-call.js (общий pestovoCallOfficial).
//
// Почему отдельный тест. Модуль появился из трёх копий callOfficial()
// (live.js, marker.js, scorer.js), и ни одна из них не покрывалась тестами:
// проверить можно было только глазами. Теперь логика одна — значит её можно
// проверить целиком: что уходит в requestOfficialCall и что рассылается в
// onSent. Сами страницы обязаны не держать свою копию — это уже проверяет
// tools/test-scoring-duplicates.js через delegatesTo.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

// ── Песочница: своя на каждый сценарий ────────────────────────────────────
function makeSandbox(lang) {
    const log = { config: null, telegram: [], vk: [], toasts: [], vib: [] };
    const sandbox = {
        console,
        currentLang: lang || 'ru',
        requestOfficialCall: function (config) { log.config = config; return Promise.resolve(true); },
        sendTelegramOfficialAlert: function (type, hole, name, members) { log.telegram.push([type, hole, name, members]); },
        sendVKOfficialAlert: function (type, hole, name, members) { log.vk.push([type, hole, name, members]); },
        toast: function (msg, kind) { log.toasts.push([msg, kind]); },
        vib: function (pattern) { log.vib.push(pattern); },
        getOfficialRoleName: function (type) { return type === 'marshal' ? 'Маршал' : 'Судья'; }
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/official-call.js'), 'utf8'), sandbox,
        { filename: 'official-call.js' });
    return { sandbox, log };
}

function eq(actual, expected, label) {
    // Массивы из песочницы vm имеют другой прототип, поэтому deepStrictEqual
    // на них падает даже при полном совпадении — сравниваем по содержимому.
    assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

// ── 1. Без requestOfficialCall молча выходим, а не падаем ─────────────────
{
    const sandbox = { console };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/official-call.js'), 'utf8'), sandbox,
        { filename: 'official-call.js' });
    assert.strictEqual(sandbox.pestovoCallOfficial({ type: 'marshal' }), undefined,
        'без requestOfficialCall вызов — no-op, страница не должна падать');
}

// ── 2. Маркер: подпись «Marker (Имя)» и префикс mk ────────────────────────
{
    const { sandbox, log } = makeSandbox('ru');
    sandbox.pestovoCallOfficial({
        type: 'marshal',
        roundId: '-rid1',
        playerId: 'uid1',
        prefix: 'mk',
        hole: function () { return 5; },
        playerName: 'Marker (Иван Петров)',
        canEdit: true
    });

    const cfg = log.config;
    assert.ok(cfg, 'requestOfficialCall вызван');
    assert.strictEqual(cfg.prefix, 'mk', 'префикс привязки кнопок — mk');
    assert.strictEqual(cfg.roundId, '-rid1');
    assert.strictEqual(cfg.playerId, 'uid1');
    assert.strictEqual(cfg.type, 'marshal');
    assert.strictEqual(cfg.hole(), 5, 'лунка передана функцией — как и было в трёх копиях');
    eq(cfg.flightMembers, [], 'без flightMembers — пустой список, не undefined');

    // Рассылка: имитируем успешную отправку.
    cfg.onSent({ hole: 5, playerName: 'Marker (Иван Петров)', flightMembers: [] });
    eq(log.telegram, [['marshal', 5, 'Marker (Иван Петров)', []]],
        'Telegram получает тип, лунку, имя и состав флайта');
    eq(log.vk, [['marshal', 5, 'Marker (Иван Петров)', []]], 'VK — то же самое');
    assert.strictEqual(log.toasts.length, 1, 'один тост');
    assert.strictEqual(log.toasts[0][1], 'warn', 'тост уровня warn');
    assert.strictEqual(log.toasts[0][0], '🚨 Маршал вызван на лунку 5!', 'текст тоста');
    eq(log.vib, [[100, 50, 100]], 'вибрация');
}

// ── 3. Игрок: своим именем, English-подпись ───────────────────────────────
{
    const { sandbox, log } = makeSandbox('en');
    sandbox.pestovoCallOfficial({
        type: 'referee',
        roundId: '-rid2',
        playerId: 'uid2',
        prefix: 'sc',
        hole: 12,
        playerName: 'Иван'
    });
    log.config.onSent({ hole: 12, playerName: 'Иван', flightMembers: [] });
    assert.strictEqual(log.toasts[0][0], '🚨 Судья called to hole 12!', 'английская подпись');
    eq(log.telegram, [['referee', 12, 'Иван', []]], 'английский текст не ломает рассылку');
}

// ── 4. Групповой раунд: состав флайта доезжает до рассылки ────────────────
{
    const { sandbox, log } = makeSandbox('ru');
    sandbox.pestovoCallOfficial({
        type: 'marshal',
        roundId: '-rid3',
        playerId: 'uid3',
        prefix: 'group',
        hole: function () { return 7; },
        playerName: function () { return 'Пётр'; },
        flightMembers: function () { return ['Пётр', 'Мария']; },
        canEdit: function () { return true; }
    });
    const cfg = log.config;
    eq(cfg.flightMembers(), ['Пётр', 'Мария'],
        'состав флайта читается в момент вызова, а не в момент сборки конфига');
    assert.strictEqual(typeof cfg.canEdit, 'function', 'canEdit пробрасывается как есть');
    cfg.onSent({ hole: 7, playerName: 'Пётр', flightMembers: ['Пётр', 'Мария'] });
    eq(log.telegram[0][3], ['Пётр', 'Мария'], 'флайт ушёл в рассылку');
    // Важно: имя в оповещении подставляется из call, а не из замыкания страницы.
    cfg.onSent({ hole: 7 });
    assert.strictEqual(log.telegram[1][2], 'Player', 'без имени в call — подставляется Player');
    eq(log.telegram[1][3], [], 'без flightMembers — пусто, а не undefined');
}

// ── 5. Частично отсутствующие окружение: VK и vib не определены ───────────
{
    const sandbox = {
        console, currentLang: 'ru',
        requestOfficialCall: function (cfg) { sandbox.__cfg = cfg; },
        sendTelegramOfficialAlert: function () {},
        toast: function () {},
        getOfficialRoleName: function () { return 'Маршал'; }
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/official-call.js'), 'utf8'), sandbox,
        { filename: 'official-call.js' });
    sandbox.pestovoCallOfficial({ type: 'marshal', roundId: '-r', playerId: 'u', prefix: 'mk', hole: 1, playerName: 'И' });
    assert.doesNotThrow(function () { sandbox.__cfg.onSent({ hole: 1, playerName: 'И' }); },
        'отсутствующие sendVKOfficialAlert и vib — не повод падать в обработчике');
}

// ── 6. Модуль подключён на всех трёх страницах до фичевого скрипта ────────
{
    const pages = { 'marker.html': 'marker.js', 'scorer.html': 'scorer.js', 'setup-round.html': 'live.js' };
    for (const [page, feature] of Object.entries(pages)) {
        const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
        // Ищем именно тег подключения: упоминание пути в комментарии не
        // должно ломать проверку порядка.
        const shared = html.indexOf('src="js/official-call.js');
        assert.ok(shared !== -1, page + ': не подключён js/official-call.js');
        assert.ok(shared < html.indexOf('src="js/' + feature),
            page + ': js/official-call.js обязан идти ДО js/' + feature);
    }
}

console.log('Official call tests passed (общий pestovoCallOfficial: конфиг, рассылка, EN/RU, групповой раунд, 3 страницы)');
