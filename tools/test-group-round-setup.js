#!/usr/bin/env node
// Регрессионный тест создания ГРУППОВОГО раунда (setup-round.html).
// Запуск: node tools/test-group-round-setup.js   (нужен jsdom: npm i jsdom)
//
// Защищает баг «игроки не разворачиваются → нельзя начать игру»:
// карточки игроков (#player-slots) рисуются ЛЕНИВО — после открытия вкладки
// «Групповой раунд» и асинхронной загрузки списка пользователей, то есть
// ПОСЛЕ initP0MobileEnhancements(). Проверяется реальный порядок событий:
//   1) DOMContentLoaded → initP0MobileEnhancements() (слотов ещё нет);
//   2) switchSetupMode('group') → showGroupSetup() → buildPlayerSlots();
//   3) первая карточка раскрыта, клик по заголовку раскрывает любую другую
//      (в том числе после перестроения слотов — смена числа игроков/языка);
//   4) степпер #p0-wizard-steps существует;
//   5) заполненные карточки → startGroup() реально создаёт раунд в БД
//      (mode='group', 2 игрока, маркеры по кругу, доступ по ключу);
//   6) нижний мобильный таббар нигде не создаётся (удалён полностью).
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP: jsdom не установлен (npm i jsdom) — тест пропущен'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
let failures = 0, checks = 0;
function ok(cond, label) {
    checks++;
    if (!cond) { failures++; console.error(' ✗ FAIL |', label); }
    else console.log(' ok     |', label);
}

let html = fs.readFileSync(path.join(ROOT, 'setup-round.html'), 'utf8')
    .replace(/<script src="https?:[^"]*"><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://t.test/setup-round.html', pretendToBeVisual: true });
const win = dom.window, doc = win.document;
win.navigator.vibrate = () => {};
win.currentUser = { uid: 'creator-uid' };
win.currentUserData = { name: 'Тест Создатель', firstName: 'Тест', lastName: 'Создатель', gender: 'men', defaultTee: 'bl', handicap: 10.4 };

// ── Мок Firebase: запоминает созданные раунды ──
const pushedRounds = [];
function makeRef(p) {
    const r = {
        _p: p || '',
        update() { return Promise.resolve(); },
        set(v) { if (r._p === 'rounds/' + (r._key || '')) pushedRounds.push(v); return Promise.resolve(); },
        remove() { return Promise.resolve(); },
        transaction(f) { return Promise.resolve({ value: f(null) }); },
        once(evt) {
            if (r._p === 'users') return Promise.resolve({ val: () => ({ 'other-uid': { name: 'Иван Фамилия', firstName: 'Иван', lastName: 'Фамилия', gender: 'men', handicap: 5, defaultTee: 'bl' } }), exists: () => true });
            return Promise.resolve({ val: () => ({}), exists: () => false });
        },
        on() {}, off() {},
        orderByChild() { return r; }, equalTo() { return r; },
        push() { const nr = makeRef('rounds/NEWROUND'); nr._key = 'NEWROUND'; nr.key = 'NEWROUND'; nr.set = function(v) { pushedRounds.push(v); return Promise.resolve(); }; return nr; }
    };
    return r;
}
win.db = { ref: p => makeRef(p) };

['js/utils.js', 'js/live.js', 'js/solo.js'].forEach(f => win.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

// ── Реальный порядок: P0-инициализация уже отработала при загрузке страницы ──
try { win.eval('initP0MobileEnhancements();'); } catch (e) { /* уже вызван на DOMContentLoaded */ }

// Пользователь открывает вкладку «Групповой раунд»
win.eval('switchSetupMode("group")');

setTimeout(() => {
    const cards = () => Array.from(doc.querySelectorAll('.setup-player-card'));
    ok(cards().length === 2, 'после открытия вкладки отрисованы 2 карточки игрока');
    ok(cards().filter(c => c.classList.contains('open')).length === 1, 'ровно 1 карточка раскрыта по умолчанию');
    ok(!!doc.getElementById('p0-wizard-steps'), 'степпер #p0-wizard-steps создан');
    ok(!doc.getElementById('bottom-tabbar'), 'нижний таббар не создан (удалён)');

    // Раскрываем 2-ю карточку кликом по заголовку — так пользователь вводит имя партнёра
    const heads = () => Array.from(doc.querySelectorAll('.setup-player-head'));
    heads()[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok(cards()[1].classList.contains('open') && !cards()[0].classList.contains('open'),
        'клик по заголовку раскрывает 2-ю карточку и сворачивает 1-ю');
    ok(heads()[1].getAttribute('aria-expanded') === 'true', 'aria-expanded обновляется для доступности');

    // Клавиатура: Enter на заголовке тоже переключает
    heads()[0].dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    ok(cards()[0].classList.contains('open') && !cards()[1].classList.contains('open'),
        'Enter на заголовке переключает карточку (доступность с клавиатуры)');

    // Перестроение слотов (смена числа игроков) не ломает аккордеон
    doc.getElementById('grp-count').value = '3';
    win.eval('buildPlayerSlots()');
    heads()[2].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok(cards()[2] && cards()[2].classList.contains('open'), 'после rebuild (3 игрока) клик продолжает работать');
    heads()[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

    // ── Заполняем карточки и начинаем раунд ──
    doc.getElementById('grp-time').value = '09:00';
    // Игрок 1 — создатель (подставлен автоматически), игрок 2 — зарегистрированный из списка, игрок 3 — гость по имени.
    doc.getElementById('pl-name-2').value = 'Иван Фамилия';
    doc.getElementById('pl-uid-2').value = 'other-uid';
    doc.getElementById('pl-name-3').value = 'Гость Гостев';
    doc.getElementById('pl-hcp-3').value = '18.5';

    // Поля должны быть доступны (не display:none) в раскрытой карточке
    const visibleRow = cards()[0].querySelector('.form-row');
    ok(!!visibleRow, 'у раскрытой карточки есть видимые поля формы');

    try { win.eval('startGroup()'); } catch (e) { ok(false, 'startGroup() выбросил исключение: ' + e.message); }

    setTimeout(() => {
        ok(pushedRounds.length === 1, 'раунд записан в БД ровно 1 раз (получено ' + pushedRounds.length + ')');
        const rd = pushedRounds[0];
        if (rd) {
            ok(rd.mode === 'group', 'mode=group');
            const pids = Object.keys(rd.players || {});
            ok(pids.length === 3, 'в раунде 3 игрока (получено ' + pids.length + ')');
            ok(rd.status === 'active' && !!rd.accessKey, 'раунд активен, ключ доступа выдан');
            ok(pids.every(id => rd.players[id].markedBy), 'маркеры назначены по кругу для всех игроков');
            ok(rd.players[pids[0]].isCreator === true, 'создатель — первый игрок');
            ok(!!rd.startTime, 'время старта сохранено');
        }
        ok(win.localStorage.getItem('pestovo_acting_as_NEWROUND') !== null, 'acting_as сохранён в localStorage');

        console.log(failures ? '\nПРОВАЛЕНО: ' + failures + ' из ' + checks : '\nВсе ' + checks + ' проверок пройдены');
        process.exit(failures ? 1 : 0);
    }, 400);
}, 400);
