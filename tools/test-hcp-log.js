#!/usr/bin/env node
// Журнал обновлений гандикапа: запись (utils.js → pestovoLogHcpChange),
// интеграция с созданием раунда (round-setup.js) и рендер вкладки админки
// (admin-hcp-log.js). Чистый jsdom, без сети.
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let failures = 0, checks = 0;
function check(condition, message) {
    checks++;
    if (!condition) { failures++; console.error('FAIL:', message); }
    else console.log('ok:', message);
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Достаём из utils.js только блок журнала (utils.js — большой глобальный файл).
function extractHcpLogBlock() {
    const src = fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8');
    const start = src.indexOf('function pestovoHcpLogText(');
    const end = src.indexOf('// ==========================================\n// ДНЕВНОЙ РЕЖИМ');
    if (start < 0 || end < 0 || end <= start) throw new Error('pestovoLogHcpChange block not found in utils.js');
    return src.slice(start, end);
}

function makeWindow(extraHtml) {
    const html = '<!doctype html><html><body>' + (extraHtml || '') + '</body></html>';
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://test.local/page.html' });
    const win = dom.window;
    win.__pushed = [];
    win.__toasts = [];
    win.currentLang = 'ru';
    win.toast = (message, kind) => { win.__toasts.push({ message, kind }); };
    win.fmtExactHcp = value => Number(value).toFixed(1);
    win.db = {
        ref: p => ({
            push: value => { win.__pushed.push({ path: p, value }); return Promise.resolve({ key: 'k' + win.__pushed.length }); },
            update: value => { win.__updates = (win.__updates || []).concat([{ path: p, value }]); return Promise.resolve(); },
            once: () => Promise.resolve({ exists: () => false, val: () => null })
        })
    };
    return win;
}

(async function run() {
    // ── 1. pestovoLogHcpChange: запись и поля ───────────────────────────────
    let win = makeWindow();
    win.currentUser = { uid: 'user-1', email: 'ivan@example.com' };
    win.currentUserData = { name: 'Иван Иванов', role: 'player' };
    win.eval(extractHcpLogBlock());

    await win.pestovoLogHcpChange({ playerUid: 'user-1', playerName: '  Иванов   Иван ', oldHcp: 15, newHcp: 8.3, source: 'rusgolf-self' });
    check(win.__pushed.length === 1 && win.__pushed[0].path === 'hcpLog', 'log entry is pushed to hcpLog');
    const rec = win.__pushed[0] && win.__pushed[0].value || {};
    check(rec.actorUid === 'user-1' && rec.actorName === 'Иван Иванов', 'entry records who made the change (actorUid/actorName)');
    check(rec.actorRole === 'player', 'player role is recorded for a non-admin');
    check(rec.playerName === 'Иванов Иван', 'player name is normalised (spaces collapsed)');
    check(rec.oldHcp === 15 && rec.newHcp === 8.3, 'old and new handicap are stored');
    check(rec.source === 'rusgolf-self' && rec.playerUid === 'user-1', 'source and player uid are stored');
    check(typeof rec.at === 'number' && rec.at > 0, 'timestamp is stored as a number');

    // Без oldHcp поле не пишется вовсе (правило БД требует число или отсутствие поля).
    await win.pestovoLogHcpChange({ playerName: 'Петров Пётр', oldHcp: null, newHcp: 4, source: 'excel-import' });
    check(!('oldHcp' in win.__pushed[1].value), 'missing old handicap is omitted, not stored as null');

    // Администратор и мастер-пароль помечаются роли.
    win.currentUser = { uid: 'tournament-master' };
    win.currentUserData = {};
    await win.pestovoLogHcpChange({ playerName: 'Сидоров Сидор', newHcp: 10, source: 'manual-admin' });
    check(win.__pushed[2].value.actorRole === 'master' && win.__pushed[2].value.actorName === 'Мастер-пароль', 'master-password session is recorded as master');

    // Без входа запись не пишется (нельзя анонимно подписать журнал).
    win.currentUser = null;
    const okNoUser = await win.pestovoLogHcpChange({ playerName: 'Аноним', newHcp: 1, source: 'x' });
    check(okNoUser === false && win.__pushed.length === 3, 'no entry is written without a signed-in user');

    // Ошибка записи не должна бросать исключение (обновление HCP важнее журнала).
    win.currentUser = { uid: 'user-1' };
    win.db = { ref: () => ({ push: () => Promise.reject(new Error('PERMISSION_DENIED')) }) };
    const failed = await win.pestovoLogHcpChange({ playerName: 'Иван Иванов', newHcp: 5, source: 'rusgolf-self' });
    check(failed === false, 'a failed log write resolves to false instead of throwing');

    // ── 2. Создание раунда: обновление своего гандикапа попадает в журнал ──
    const slots = '<div id="player-slots"><div class="setup-player-card" data-pidx="1"><span id="spc-avatar-1"></span><span id="spc-meta-1"></span>' +
        '<input id="pl-name-1" value="Иван Иванов"><input id="pl-uid-1" value="user-1">' +
        '<select id="pl-gender-1"><option value="men" selected>Men</option><option value="women">Women</option></select>' +
        '<select id="pl-tee-1"><option value="bl" selected>Blue</option></select>' +
        '<input id="pl-hcp-1" value="15.0"><input id="pl-field-1" value="16">' +
        '<button type="button" id="pl-hcp-refresh-1" class="setup-hcp-refresh hidden">RUSGOLF</button></div></div>';
    win = makeWindow(slots);
    win.currentUser = { uid: 'user-1' };
    win.currentUserData = { uid: 'user-1', firstName: 'Иван', lastName: 'Иванов', gender: 'men', handicap: 15 };
    win.calcPlayerFieldHcp = () => {};
    win.t = key => key;
    win.PestovoRusgolf = {
        fetchViaProxy: (query, attempt, opts) => {
            win.__opts = opts;
            return Promise.resolve({ rows: [{ fio: 'Иванов Иван Иванович', number: 'RG-001', hcp: 8.3, gender: 'men', hcpDate: '2026-10-01' }] });
        }
    };
    win.eval(extractHcpLogBlock());
    win.eval(fs.readFileSync(path.join(ROOT, 'js/round-setup.js'), 'utf8'));

    win.eval('syncSetupHcpRefreshButton(1)');
    check(!win.document.getElementById('pl-hcp-refresh-1').classList.contains('hidden'), 'refresh button is shown for the own card with first and last name');
    win.eval('refreshSetupPlayerHandicap(1)');
    await wait(30);
    const logged = (win.__pushed || []).find(item => item.path === 'hcpLog');
    check(!!logged, 'updating own handicap writes a hcpLog entry');
    check(logged && logged.value.playerName === 'Иванов Иван Иванович', 'log stores the official RUSGOLF name of the player');
    check(logged && logged.value.oldHcp === 15 && logged.value.newHcp === 8.3, 'log stores 15 → 8.3');
    check(logged && logged.value.actorUid === 'user-1' && logged.value.source === 'rusgolf-self', 'log records the player who updated it');
    check(win.__opts && win.__opts.timeoutMs === 8000, 'RUSGOLF lookup uses a short per-proxy timeout');

    // Строка другого игрока: кнопка скрыта и поиска нет (как и раньше).
    win.document.getElementById('pl-uid-1').value = 'another-user';
    win.eval('markSetupPlayerMeta(1)');
    check(win.document.getElementById('pl-hcp-refresh-1').classList.contains('hidden'), 'refresh button is hidden for another player');

    // Своё ФИО, введённое вручную (без подсказки) — строка снова считается своей.
    win.document.getElementById('pl-uid-1').value = '';
    win.document.getElementById('pl-name-1').value = 'Иванов Иван';
    win.eval('markSetupPlayerMeta(1)');
    check(win.document.getElementById('pl-uid-1').value === 'user-1', 'typing own full name links the row to the current user');
    check(!win.document.getElementById('pl-hcp-refresh-1').classList.contains('hidden'), 'button appears after own name is typed manually');

    // Общий дедлайн: если RUSGOLF молчит, кнопка разблокируется и показывает ошибку.
    win.PestovoRusgolf.fetchViaProxy = () => new Promise(() => {});
    win.eval('SETUP_HCP_LOOKUP_DEADLINE_MS = 60;');
    win.eval('refreshSetupPlayerHandicap(1)');
    check(win.document.getElementById('pl-hcp-refresh-1').disabled === true, 'button is disabled while the lookup runs');
    await wait(150);
    check(win.document.getElementById('pl-hcp-refresh-1').disabled === false, 'button is re-enabled after the lookup deadline');
    check(win.__toasts.some(item => item.kind === 'error' && /не ответил/.test(item.message)), 'a timeout explains what happened');

    // ── 3. Вкладка админки: рендер «последнее обновление» и истории ──────────
    win = makeWindow('<div id="hcp-log-search-wrap"><input id="hcp-log-search" value=""></div><div id="hcp-log-results"></div>');
    win.currentLang = 'ru';
    const now = Date.now();
    const entries = {
        a: { at: now - 3600000, actorUid: 'u1', actorName: 'Иван Иванов', actorRole: 'player', playerName: 'Иванов Иван', oldHcp: 15, newHcp: 14.2, source: 'rusgolf-self' },
        b: { at: now - 60000, actorUid: 'adm', actorName: 'Админ', actorRole: 'admin', playerName: 'Иванов Иван', oldHcp: 14.2, newHcp: 13.9, source: 'manual-admin' },
        c: { at: now - 120000, actorUid: 'u2', actorName: 'Петр Петров', actorRole: 'player', playerName: 'Сидоров Сидор', newHcp: 5, source: 'rusgolf-form' }
    };
    win.db = {
        ref: p => ({
            orderByChild: () => ({ limitToLast: () => ({ once: () => Promise.resolve({ val: () => (p === 'hcpLog' ? entries : null) }) }) })
        })
    };
    win.eval(fs.readFileSync(path.join(ROOT, 'js/admin-hcp-log.js'), 'utf8'));
    await win.hcpLogLoad();
    await wait(10);
    const html = win.document.getElementById('hcp-log-results').innerHTML;
    check(html.indexOf('Последнее обновление по игрокам') !== -1, 'admin tab shows the per-player latest-update block');
    check(html.indexOf('13.9') !== -1 && html.indexOf('Админ') !== -1, 'latest update shows the newest value and who changed it');
    check(html.indexOf('Сидоров Сидор') !== -1 && html.indexOf('Петр Петров') !== -1, 'history lists the other player and their updater');
    check(html.indexOf('RUSGOLF · своя карточка') !== -1, 'source is shown in human-readable form');

    // Поиск по имени фильтрует историю.
    win.document.getElementById('hcp-log-search').value = 'Сидоров';
    win.hcpLogFilter();
    const filtered = win.document.getElementById('hcp-log-results').innerHTML;
    check(filtered.indexOf('Сидоров Сидор') !== -1 && filtered.indexOf('Иванов Иван') === -1, 'search narrows the log to the matching player');

    // Пустой журнал не падает.
    win.document.getElementById('hcp-log-search').value = 'никто';
    win.hcpLogFilter();
    check(win.document.getElementById('hcp-log-results').innerHTML.indexOf('не найдено') !== -1, 'empty result renders a message');

    console.log('\n' + (failures ? 'FAILED ' + failures + ' / ' + checks : 'Passed ' + checks + ' checks'));
    process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
