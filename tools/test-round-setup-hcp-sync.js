#!/usr/bin/env node
// Regression coverage for the RUSGOLF handicap refresh on setup-round.
// Кнопка «RUSGOLF» видна сразу после ввода имени и фамилии у ЛЮБОЙ карточки,
// поиск идёт по ФИО (как в админке), при нескольких совпадениях — выбор игрока.
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = '<!doctype html><html><body><div id="player-slots">' +
    '<div class="setup-player-card" data-pidx="1"><span id="spc-avatar-1"></span><span id="spc-meta-1"></span>' +
    '<input id="pl-name-1" value="Иван Иванов"><input id="pl-uid-1" value="user-1">' +
    '<select id="pl-gender-1"><option value="men" selected>Men</option><option value="women">Women</option></select>' +
    '<select id="pl-tee-1"><option value="bl" selected>Blue</option></select>' +
    '<input id="pl-hcp-1" value="15.0"><input id="pl-field-1" value="16">' +
    '<button type="button" id="pl-hcp-refresh-1" class="setup-hcp-refresh">Refresh</button></div>' +
    '<div class="setup-player-card" data-pidx="2"><span id="spc-avatar-2"></span><span id="spc-meta-2"></span>' +
    '<input id="pl-name-2" value="Пётр Петров"><input id="pl-uid-2" value="">' +
    '<select id="pl-gender-2"><option value="men" selected>Men</option><option value="women">Women</option></select>' +
    '<select id="pl-tee-2"><option value="bl" selected>Blue</option></select>' +
    '<input id="pl-hcp-2" value=""><input id="pl-field-2" value="">' +
    '<button type="button" id="pl-hcp-refresh-2" class="setup-hcp-refresh hidden">Refresh</button></div>' +
    '</div></body></html>';
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://test.local/setup-round.html' });
const win = dom.window;
win.currentUser = { uid: 'user-1' };
win.currentUserData = { uid: 'user-1', firstName: 'Иван', lastName: 'Иванов', gender: 'men', handicap: 15 };
win.currentLang = 'ru';
win.t = key => key;
win.escapeHtml = value => String(value == null ? '' : value);
win.toast = (message, kind) => { win.__toasts.push({ message, kind }); };
win.__toasts = [];
win.__updates = [];
win.__logs = [];
win.__calcCalls = [];
win.fmtExactHcp = value => Number(value).toFixed(1);
win.calcPlayerFieldHcp = idx => {
    win.__calcCalls.push(idx);
    const field = win.document.getElementById('pl-field-' + idx);
    if (field) field.value = '12';
};
win.db = { ref: p => ({
    update: value => { win.__updates.push({ path: p, value }); return Promise.resolve(); },
    once: () => Promise.resolve({ exists: () => p === 'usersPublic/user-1' })
}) };
win.pestovoLogHcpChange = entry => { win.__logs.push(entry); return Promise.resolve(true); };
// Настоящий клиент RUSGOLF: проверяем и общий разбор ФИО, и поиск по вариантам запроса.
win.eval(fs.readFileSync(path.join(ROOT, 'js/rusgolf-client.js'), 'utf8'));
let rowsForQuery = () => [{ fio: 'Иванов Иван Иванович', number: 'RG-001', hcp: 8.3, gender: 'men', hcpDate: '2026-10-01' }];
win.PestovoRusgolf.fetchViaProxy = query => {
    win.__queries.push(query);
    return Promise.resolve({ rows: rowsForQuery(query), proxy: 'test' });
};
win.__queries = [];
win.eval(fs.readFileSync(path.join(ROOT, 'js/round-setup.js'), 'utf8'));

let failures = 0, checks = 0;
function check(condition, message) {
    checks++;
    if (!condition) { failures++; console.error('FAIL:', message); }
    else console.log('ok:', message);
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

(async function run() {
    win.eval('markSetupPlayerMeta(1)');
    win.eval('markSetupPlayerMeta(2)');
    check(win.document.getElementById('pl-hcp-refresh-1').classList.contains('hidden') === false,
        'у своей карточки кнопка видна, когда введены имя и фамилия');
    check(win.document.getElementById('pl-hcp-refresh-2').classList.contains('hidden') === false,
        'у карточки другого игрока кнопка тоже видна сразу после ввода имени и фамилии');

    win.eval('refreshSetupPlayerHandicap(1)');
    await wait(20);
    check(win.__queries[0] === 'Иван Иванов', 'поиск в RUSGOLF идёт по введённым имени и фамилии');
    check(win.document.getElementById('pl-hcp-1').value === '8.3', 'точное совпадение подставляет гандикап (регистр/порядок ФИО не важны)');
    check(win.__updates.some(item => item.path === 'users/user-1' && item.value.handicap === 8.3 && item.value.hcpSource === 'rusgolf'), 'гандикап своей карточки сохраняется в профиль');
    check(win.__updates.some(item => item.path === 'usersPublic/user-1' && item.value.handicap === 8.3), 'публичный профиль получает обновление');
    check(win.__calcCalls.includes(1), 'полевой гандикап пересчитывается после синхронизации');
    check(win.__toasts.some(item => item.kind === 'success'), 'показывается подтверждение');
    check(!win.document.getElementById('pl-hcp-refresh-1').disabled, 'кнопка снова активна после завершения');

    // Смена ФИО прячет кнопку (нужны имя и фамилия) и снова показывает после ввода.
    win.document.getElementById('pl-name-2').value = 'Пётр';
    win.eval('markSetupPlayerMeta(2)');
    check(win.document.getElementById('pl-hcp-refresh-2').classList.contains('hidden'), 'одно слово — кнопка скрыта');
    win.document.getElementById('pl-name-2').value = 'Пётр Петров';
    win.eval('markSetupPlayerMeta(2)');
    check(!win.document.getElementById('pl-hcp-refresh-2').classList.contains('hidden'), 'после ввода имени и фамилии кнопка снова видна');

    // Чужая (гостевая) карточка: гандикап подставляется в форму, профиль не трогаем.
    rowsForQuery = () => [{ fio: 'Петров Пётр', number: 'RG-777', hcp: 12.4, gender: 'men' }];
    const beforeUpdates = win.__updates.length;
    win.eval('refreshSetupPlayerHandicap(2)');
    await wait(20);
    check(win.document.getElementById('pl-hcp-2').value === '12.4', 'гандикап чужой карточки подставляется в форму раунда');
    check(win.__updates.length === beforeUpdates, 'профиль другого игрока не перезаписывается');
    check(win.__logs.some(entry => entry.source === 'rusgolf-form' && entry.newHcp === 12.4), 'изменение попадает в журнал гандикапов (форма раунда)');

    // Поиск перебирает варианты запроса: «Фамилия Имя» находят друг друга.
    rowsForQuery = () => [];
    let seen = [];
    win.PestovoRusgolf.fetchViaProxy = query => {
        seen.push(query);
        win.__queries.push(query);
        if (query === 'Петров Пётр') return Promise.resolve({ rows: [{ fio: 'Петров Пётр', number: 'RG-777', hcp: 12.4, gender: 'men' }] });
        return Promise.resolve({ rows: [] });
    };
    win.document.getElementById('pl-hcp-2').value = '';
    win.eval('refreshSetupPlayerHandicap(2)');
    await wait(20);
    check(seen.length >= 2, 'если прямой запрос пуст, перебираются варианты написания ФИО');
    check(win.document.getElementById('pl-hcp-2').value === '12.4', 'гандикап найден по варианту запроса');

    // Несколько совпадений → окно выбора, как список результатов в админке.
    rowsForQuery = () => [
        { fio: 'Петров Пётр', number: 'RG-002', hcp: 6.1, gender: 'men' },
        { fio: 'Петров Пётр', number: 'RG-003', hcp: 7.2, gender: 'men' }
    ];
    win.PestovoRusgolf.fetchViaProxy = query => { win.__queries.push(query); return Promise.resolve({ rows: rowsForQuery(query) }); };
    win.document.getElementById('pl-hcp-2').value = '';
    win.eval('refreshSetupPlayerHandicap(2)');
    await wait(20);
    check(!!win.document.getElementById('setup-hcp-picker'), 'при нескольких совпадениях открывается выбор игрока');
    check(win.document.getElementById('pl-hcp-2').value === '', 'без выбора игрока гандикап не подставляется');
    check(win.document.querySelectorAll('#setup-hcp-picker .setup-hcp-choice').length === 2, 'в списке выбора показаны все найденные игроки');
    win.eval('pickSetupHcpCandidate(2, 1)');
    await wait(20);
    check(win.document.getElementById('pl-hcp-2').value === '7.2', 'выбранный игрок подставляет свой гандикап');
    check(!win.document.getElementById('setup-hcp-picker'), 'окно выбора закрывается после выбора');

    // Пустой результат — понятное предупреждение, ничего не меняется.
    rowsForQuery = () => [];
    win.document.getElementById('pl-hcp-2').value = '';
    win.eval('refreshSetupPlayerHandicap(2)');
    await wait(20);
    check(win.document.getElementById('pl-hcp-2').value === '', 'при отсутствии совпадений гандикап не меняется');
    check(win.__toasts.some(item => item.kind === 'warn' && item.message.indexOf('не найдено') !== -1), 'сообщение «совпадение не найдено»');

    // «Формы имён» включены в админке: Наташа ≠ Наталия при выключенном
    // автоприменении → игрок предлагается на выбор (как блок «выберите
    // нужного игрока» в админке), а не подставляется молча.
    win.eval(fs.readFileSync(path.join(ROOT, 'js/name-variants.js'), 'utf8'));
    win.NameVariants.setMode('B');
    win.NameVariants.setAutoApply(false);
    win.document.getElementById('pl-name-2').value = 'Наташа Смирнова';
    win.document.getElementById('pl-hcp-2').value = '';
    rowsForQuery = () => [{ fio: 'Смирнова Наталия Петровна', number: 'RG-900', hcp: 21.6, gender: 'women', hcpDate: '2026-09-01' }];
    win.PestovoRusgolf.fetchViaProxy = query => { win.__queries.push(query); return Promise.resolve({ rows: rowsForQuery(query) }); };
    win.eval('refreshSetupPlayerHandicap(2)');
    await wait(20);
    check(!!win.document.getElementById('setup-hcp-picker'), 'формы имён: один неточный кандидат предлагается на выбор');
    check(win.document.getElementById('pl-hcp-2').value === '', 'формы имён: без подтверждения гандикап не подставляется');
    win.eval('pickSetupHcpCandidate(2, 0)');
    await wait(20);
    check(win.document.getElementById('pl-hcp-2').value === '21.6', 'формы имён: выбранный вариант подставляет гандикап');
    win.NameVariants.setMode('off');

    // Без имени и фамилии поиск не запускается.
    win.document.getElementById('pl-name-2').value = 'Пётр';
    const beforeQueries = win.__queries.length;
    win.eval('refreshSetupPlayerHandicap(2)');
    await wait(5);
    check(win.__queries.length === beforeQueries, 'поиск не запускается без имени и фамилии');

    console.log('\n' + (failures ? 'FAILED ' + failures + ' / ' + checks : 'Passed ' + checks + ' checks'));
    process.exit(failures ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
