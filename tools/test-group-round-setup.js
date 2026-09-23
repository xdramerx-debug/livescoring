#!/usr/bin/env node
// Регрессионный тест создания РАУНДА в единой форме (setup-round.html, v1.69.0).
// Запуск: node tools/test-group-round-setup.js   (нужен jsdom: npm i jsdom)
//
// Защищает сценарий «единая форма создания раунда»:
//   • вкладки «Одиночный/Групповой» больше нет — один блок #setup с
//     карточками игроков (#player-slots) и кнопкой «Добавить игрока»;
//   • карточки рисуются лениво (после асинхронной загрузки пользователей),
//     аккордеон: первая раскрыта, клик по заголовку переключает;
//   • «Добавить игрока» увеличивает состав (1 → соло, 2+ → группа),
//     «убрать игрока» — уменьшает (но не ниже 1); после удаления индексы
//     могут идти с «дыркой» — старт должен учитывать реальные карточки;
//   • заполненные карточки → startGroup() реально создаёт раунд в БД
//     (mode='group', маркеры по кругу, доступ по ключу);
//   • 1 игрок → startSolo() создаёт mode='solo'.
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
    .replace(/<script src="https?:[^\"]*"><\/script>/g, '');
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

['js/course-config.js', 'js/format.js', 'js/utils.js', 'js/live.js', 'js/solo.js', 'js/round-setup.js'].forEach(f => win.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

// ── Реальный порядок: P0-инициализация уже отработала при загрузке страницы ──
try { win.eval('initP0MobileEnhancements();'); } catch (e) { /* уже вызван на DOMContentLoaded */ }

// Пользователь открывает страницу «Раунд» — единая форма
ok(!doc.getElementById('setup-tabs'), 'вкладки «Одиночный/Групповой» удалены из разметки');
ok(!!doc.getElementById('unified-setup-card'), 'единая форма #unified-setup-card в разметке');
ok(!!doc.getElementById('unified-add-btn'), 'кнопка «Добавить игрока» в разметке');
win.eval('initUnifiedSetup()');

setTimeout(() => {
    const cards = () => Array.from(doc.querySelectorAll('#player-slots .setup-player-card'));

    ok(cards().length === 1, 'по умолчанию отрисована 1 карточка (соло)');
    ok(cards().filter(c => c.classList.contains('open')).length === 1, 'ровно 1 карточка раскрыта');
    ok(cards()[0].querySelector('#pl-name-1').value.indexOf('Тест') === 0, 'первая карточка заполнена текущим пользователем');
    ok(doc.getElementById('unified-count-badge').textContent === '1', 'счётчик игроков = 1');
    ok(/соло/i.test(doc.getElementById('unified-mode-note').textContent), 'подсказка режима: соло');

    // ── «Добавить игрока»: 1 → 2 → 3 ──
    win.eval('addSetupPlayer()');
    ok(cards().length === 2, 'после «Добавить игрока» — 2 карточки');
    ok(doc.getElementById('unified-count-badge').textContent === '2', 'счётчик игроков = 2');
    ok(/групп/i.test(doc.getElementById('unified-mode-note').textContent), 'подсказка режима: группа');
    ok(!!doc.getElementById('p0-wizard-steps'), 'степпер #p0-wizard-steps создан (2 игрока)');
    ok(!doc.getElementById('bottom-tabbar'), 'нижний таббар не создан (удалён)');
    win.eval('addSetupPlayer()');
    ok(cards().length === 3, 'третья карточка добавлена');

    // Аккордеон: клик по заголовку раскрывает нужную и сворачивает остальные
    // («Добавить игрока» раскрывает новую карточку — сначала фиксируем состояние)
    const heads = () => Array.from(doc.querySelectorAll('.setup-player-head'));
    heads()[0].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok(cards()[0].classList.contains('open') && !cards()[2].classList.contains('open'),
        'клик по заголовку 1 раскрывает 1-ю и сворачивает 3-ю');
    heads()[2].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    ok(cards()[2].classList.contains('open') && !cards()[0].classList.contains('open'),
        'клик по заголовку раскрывает 3-ю карточку и сворачивает 1-ю');
    ok(heads()[2].getAttribute('aria-expanded') === 'true', 'aria-expanded обновляется для доступности');

    // Клавиатура: Enter на заголовке тоже переключает
    heads()[0].dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    ok(cards()[0].classList.contains('open') && !cards()[2].classList.contains('open'),
        'Enter на заголовке переключает карточку (доступность с клавиатуры)');

    // ── Удаление: 3 → 2 → 1, ниже 1 нельзя ──
    win.eval('removeSetupPlayer(3)');
    ok(cards().length === 2, '«Убрать игрока» удаляет карточку (3 → 2)');
    win.eval('removeSetupPlayer(2)');
    ok(cards().length === 1, '«Убрать игрока» удаляет карточку (2 → 1)');
    win.eval('removeSetupPlayer(1)');
    ok(cards().length === 1, 'последнего игрока удалить нельзя');

    // ── Снова до трёх: индексы с «дыркой» (создатель 1 + добавленные 4, 5) ──
    win.eval('addSetupPlayer()');
    win.eval('addSetupPlayer()');
    ok(cards().length === 3, 'состав снова 3 игрока');
    ok(cards().map(c => c.getAttribute('data-pidx')).join(',') === '1,4,5',
        'индексы карточек с дыркой (1,4,5) — стартовая логика это учитывает');

    // ── Заполняем карточки и начинаем групповой раунд ──
    doc.getElementById('grp-time').value = '09:00';
    // Игрок 1 — создатель (подставлен автоматически), игрок 4 — зарегистрированный из списка, игрок 5 — гость по имени.
    doc.getElementById('pl-name-4').value = 'Иван Фамилия';
    doc.getElementById('pl-uid-4').value = 'other-uid';
    doc.getElementById('pl-name-5').value = 'Гость Гостев';
    doc.getElementById('pl-hcp-5').value = '18.5';

    // Поля должны быть доступны (не display:none) в раскрытой карточке
    heads()[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    const visibleRow = cards()[1].querySelector('.form-row');
    ok(!!visibleRow, 'у раскрытой карточки есть видимые поля формы');

    const before = pushedRounds.length;
    try { win.eval('startGroup()'); } catch (e) { ok(false, 'startGroup() выбросил исключение: ' + e.message); }

    setTimeout(() => {
        ok(pushedRounds.length === before + 1, 'групповой раунд записан в БД ровно 1 раз (получено +' + (pushedRounds.length - before) + ')');
        const rd = pushedRounds[pushedRounds.length - 1];
        if (rd) {
            ok(rd.mode === 'group', 'mode=group');
            const pids = Object.keys(rd.players || {});
            ok(pids.length === 3, 'в раунде 3 игрока (получено ' + pids.length + ')');
            ok(rd.status === 'active' && !!rd.accessKey, 'раунд активен, ключ доступа выдан');
            ok(pids.every(id => rd.players[id].markedBy), 'маркеры назначены по кругу для всех игроков');
            ok(rd.players[pids[0]].isCreator === true, 'создатель — первый игрок');
            ok(!!rd.startTime, 'время старта сохранено');
            ok(rd.players[pids[2]].name === 'Гость Гостев', 'игрок из карточки с «дыркой» индекса (4) в раунде');
        }
        ok(win.localStorage.getItem('pestovo_acting_as_NEWROUND') !== null, 'acting_as сохранён в localStorage');

        // ── 1 игрок → одиночный раунд (startUnifiedRound) ──
        win.eval('setupPlayerOrder = [1]; setupPlayerSeq = 1; renderSetupPlayers(true);');
        doc.getElementById('grp-time').value = '10:00';
        const beforeSolo = pushedRounds.length;
        try { win.eval('startUnifiedRound()'); } catch (e) { ok(false, 'startUnifiedRound() выбросил исключение: ' + e.message); }

        setTimeout(() => {
            ok(pushedRounds.length === beforeSolo + 1, 'соло-раунд записан в БД ровно 1 раз (получено +' + (pushedRounds.length - beforeSolo) + ')');
            const solo = pushedRounds[pushedRounds.length - 1];
            if (solo) {
                ok(solo.mode === 'solo', 'mode=solo для одиночного раунда');
                const sp = Object.keys(solo.players || {});
                ok(sp.length === 1, 'в соло-раунде 1 игрок');
            }

            console.log(failures ? '\nПРОВАЛЕНО: ' + failures + ' из ' + checks : '\nВсе ' + checks + ' проверок пройдены');
            process.exit(failures ? 1 : 0);
        }, 400);
    }, 400);
}, 400);
