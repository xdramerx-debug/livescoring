#!/usr/bin/env node
/**
 * Страница «Турниры» (js/tournament-public.js), вкладка «Стартовый лист»:
 * стартовый лист, опубликованный из админки (protocols/tnm_<tid>_<rid>,
 * source:'tn-manager'), виден на странице турнира вместе с QR групп;
 * ссылка ?id=<tid>&tab=start сразу открывает вкладку старта.
 *
 *   node tools/test-tournament-public-start.js   (нужен jsdom, иначе SKIP)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var JSDOM;
try { JSDOM = require('jsdom').JSDOM; } catch (e) {
    console.log('SKIP: jsdom не установлен — тест страницы турниров пропущен');
    process.exit(0);
}
var ROOT = path.join(__dirname, '..');
var fails = 0;
var total = 0;
function check(title, cond, extra) {
    total++;
    if (!cond) fails++;
    console.log((cond ? ' ok  ' : 'FAIL ') + ' | ' + title + (extra !== undefined ? ' → ' + extra : ''));
}

var DATA = {
    tournaments: {
        tnA: { name: 'Кубок клуба', date: '2026-09-01', status: 'upcoming', lifecycleStatus: 'registration', createdAt: 1 },
        tnB: { name: 'Другой турнир', date: '2026-09-02', status: 'upcoming', createdAt: 2 }
    },
    protocols: {
        tnm_tnA_r1: {
            source: 'tn-manager', tournamentId: 'tnA', tournamentRoundId: 'r1', name: 'Раунд 1', date: '2026-09-01', scheme: 'single1',
            groups: {
                g2: { groupNo: 2, startHole: 1, startTimeText: '09:08', startTime: 2, flight: '2',
                    players: [{ id: 'p4', name: 'Сидоров Сидор', exactHcp: 20.1, fieldHcp: 22 }, { id: 'p5', name: 'Козлов Иван', exactHcp: 3, fieldHcp: 3 },
                        { id: 'p6', name: 'Орлов Пётр' }] },
                g1: { groupNo: 1, startHole: 1, startTimeText: '09:00', startTime: 1, flight: '1',
                    players: [{ id: 'p1', name: 'Иванов Иван', exactHcp: 12.4, fieldHcp: 14 }, { id: 'p2', name: 'Петров Пётр', exactHcp: 8, fieldHcp: 9 },
                        { id: 'p3', name: 'Смирнов Алексей', exactHcp: 15, fieldHcp: 17 }] }
            }
        },
        // протокол чужого турнира не должен попасть на страницу tnA
        tnm_tnB_r1: { source: 'tn-manager', tournamentId: 'tnB', tournamentRoundId: 'r1', date: '2026-09-02',
            groups: { g1: { groupNo: 1, startHole: 1, startTimeText: '10:00', players: [{ id: 'x', name: 'Чужой Игрок' }] } } }
    }
};

function render(url, data, core) {
    var html = fs.readFileSync(path.join(ROOT, 'tournaments.html'), 'utf8')
        .replace(/<script\b[^>]*src=[^>]*><\/script>/gi, '');
    var dom = new JSDOM(html, { runScripts: 'outside-only', url: url });
    var win = dom.window;
    function get(p) {
        var node = data;
        String(p || '').split('/').filter(Boolean).forEach(function (k) { node = node && typeof node === 'object' ? node[k] : undefined; });
        return node === undefined ? null : node;
    }
    win.db = {
        ref: function (p) {
            return {
                on: function (ev, cb) { cb({ val: function () { return get(p); } }); return cb; },
                off: function () {},
                once: function () { return win.Promise.resolve({ val: function () { return get(p); } }); }
            };
        }
    };
    win.currentLang = 'ru';
    if (core) win.TournamentCore = core;
    win.eval(fs.readFileSync(path.join(ROOT, 'js/tournament-public.js'), 'utf8'));
    // init() ждёт DOMContentLoaded — отдаём управление циклу событий.
    return new Promise(function (resolve) { setTimeout(function () { resolve(win); }, 30); });
}

(async function () {
var win = await render('https://example.test/tournaments.html?id=tnA&tab=start', DATA);
var text = win.document.body.textContent;
var htmlOut = win.document.body.innerHTML;
check('ссылка ?tab=start открывает вкладку «Стартовый лист»', text.indexOf('Стартовый лист') !== -1 && !!win.document.querySelector('.tn-start-list'));
check('опубликованный лист из админки показан: все игроки', ['Иванов Иван', 'Петров Пётр', 'Смирнов Алексей', 'Сидоров Сидор', 'Козлов Иван', 'Орлов Пётр']
    .every(function (n) { return text.indexOf(n) !== -1; }));
check('протокол другого турнира не попадает на страницу', text.indexOf('Чужой Игрок') === -1);
var rows = win.document.querySelectorAll('.tn-start-row');
check('по строке на стартовую группу', rows.length === 2, rows.length);
check('группы по времени старта', rows.length === 2 && rows[0].textContent.indexOf('09:00') !== -1 && rows[1].textContent.indexOf('09:08') !== -1);
check('у группы подпись «Флайт N»', rows.length && rows[0].textContent.indexOf('Флайт 1') !== -1);
check('у игроков точный и полевой HCP', htmlOut.indexOf('HCP 12.4') !== -1 && /полевой 14/.test(text));
check('QR у каждой группы', win.document.querySelectorAll('.tn-start-qr').length === 2);
check('ссылка на лист для печати с QR (qr-start.html?p=…)', htmlOut.indexOf('qr-start.html?p=tnm_tnA_r1') !== -1);

// Без публикации — понятная заглушка.
var empty = await render('https://example.test/tournaments.html?id=tnA&tab=start', { tournaments: DATA.tournaments, protocols: {} });
check('без публикации — «Стартовый лист ещё не опубликован»', empty.document.body.textContent.indexOf('ещё не опубликован') !== -1);

// Многодневный турнир: два раунда — заголовок у каждого.
var multi = JSON.parse(JSON.stringify(DATA));
multi.protocols.tnm_tnA_r2 = { source: 'tn-manager', tournamentId: 'tnA', tournamentRoundId: 'r2', name: 'Раунд 2', date: '2026-09-02',
    groups: { g1: { groupNo: 1, startHole: 10, startTimeText: '08:30', players: [{ id: 'p1', name: 'Иванов Иван' }] } } };
var mw = await render('https://example.test/tournaments.html?id=tnA&tab=start', multi);
var titles = mw.document.querySelectorAll('.tn-start-round-title');
check('многодневный турнир: заголовок у каждого раунда по порядку', titles.length === 2 &&
    titles[0].textContent.indexOf('Раунд 1') !== -1 && titles[1].textContent.indexOf('Раунд 2') !== -1, titles.length);

// Значения лидерборда считаются недоверенными: атрибуты, JSON с лунками и
// содержимое карточки не должны превращаться в HTML, а кнопка работает через делегирование.
var hostileRow = {
    key: 'key" data-owned="yes&<',
    name: `O'Neil <img src=x onerror=alert(1)> &`,
    status: '<img src=x onerror=alert(1)>',
    thru: '<svg onload=alert(1)>',
    gross: 50,
    net: 45,
    stableford: 36,
    position: 1,
    holes: [{ hole: '<img src=x onerror=alert(1)>', gross: '<svg onload=alert(1)>' }]
};
var hostileBoard = await render('https://example.test/tournaments.html?id=tnA&tab=leaderboard', DATA, {
    classify: function(t) { return { status: t.status || 'upcoming', registrationOpen: t.status === 'upcoming' }; },
    isRegistrationOpen: function(t) { return t.status === 'upcoming'; },
    registrationConfig: function() { return { limit: 0 }; },
    buildLeaderboard: function() { return [hostileRow]; }
});
var playerCardButton = hostileBoard.document.querySelector('[data-tn-player-card]');
check('лидерборд: динамические данные экранированы в атрибутах', !!playerCardButton &&
    playerCardButton.dataset.key === hostileRow.key && playerCardButton.dataset.name === hostileRow.name &&
    JSON.parse(playerCardButton.dataset.holes)[0].hole === hostileRow.holes[0].hole &&
    !playerCardButton.hasAttribute('onclick') && !hostileBoard.document.querySelector('#tn-detail-content img, #tn-detail-content svg'));
if (playerCardButton) playerCardButton.click();
var cardBody = hostileBoard.document.getElementById('tn-player-card-body');
check('лидерборд: карточка показывает недоверенные поля только как текст', !!cardBody &&
    hostileBoard.document.getElementById('tn-player-card-overlay').style.display === 'flex' &&
    !cardBody.querySelector('img,svg') && cardBody.textContent.indexOf('<img src=x') !== -1);

console.log('\n' + (fails ? '✗ ' + fails + ' / ' + total : 'All tournament-public start tests passed ✔ (' + total + ' checks)'));
process.exit(fails ? 1 : 0);
})().catch(function (err) { console.error('ОШИБКА СЦЕНАРИЯ:', err && err.stack || err); process.exit(1); });
