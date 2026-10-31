#!/usr/bin/env node
// UI-тест ЕДИНОГО экрана раунда (v1.126.0): одиночный и групповой раунд
// обслуживает одна страница setup-round.html, одна форма создания и один
// экран ввода результатов.
//
// Запуск: node tools/test-unified-round-page.js   (нужен jsdom)
//
// Что защищаем:
//   • в разметке нет отдельных одиночных экранов (#game / #read-only-view) —
//     соло-раунд открывается в общем #active-scoring-view;
//   • одиночный раунд (mode='solo', один игрок, без маркера) доступен для
//     ввода счёта и показывает панель маркера скрытой;
//   • ввод счёта записывает ТОЛЬКО свой счёт (никаких marker-операций),
//     сразу помечает лунку подтверждённой (verified=true) и ведёт дальше;
//   • тост не обещает «ждём маркера» — в соло подтверждать некому;
//   • лента лунок считает введённую лунку подтверждённой (getHoleVerifyState);
//   • QR-подключения и панель «счёт игрока» в одиночном раунде не показываются;
//   • блок дедлайна/данных раунда (раньше только в соло) есть на общем экране.
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
    if (!cond) { failures++; console.error(' ✗', label); }
    else console.log(' ok   |', label);
}

const ROUND_ID = 'SOLO1';

// ── 1. Разметка: один экран ввода, одиночных экранов больше нет ──
const rawHtml = fs.readFileSync(path.join(ROOT, 'setup-round.html'), 'utf8');
ok(!/id="game"/.test(rawHtml), 'в setup-round.html нет отдельного одиночного экрана #game');
ok(!/id="read-only-view"/.test(rawHtml), 'нет отдельного одиночного экрана просмотра #read-only-view');
ok(!/id="g-disp"/.test(rawHtml), 'нет дублирующего индикатора счёта g-disp');
ok(/id="active-scoring-view"/.test(rawHtml), 'есть общий экран ввода #active-scoring-view');
ok(/id="play-deadline"/.test(rawHtml), 'на общем экране есть дедлайн лунки (раньше только в соло)');
ok(/id="play-round-info"/.test(rawHtml), 'на общем экране есть строка данных раунда');

const html = rawHtml.replace(/<script src="https?:[^"]*"><\/script>/g, '');
const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/setup-round.html?round=' + ROUND_ID + '&as=me',
    pretendToBeVisual: true
});
const win = dom.window;
const doc = win.document;

// ── Фейковая база ──
const dbState = { round: null, updates: [] };
function makeRef(p) {
    const ref = {
        _p: p || '',
        update(obj) { dbState.updates.push({ path: ref._p, obj }); return Promise.resolve(); },
        set() { return Promise.resolve(); },
        remove() { return Promise.resolve(); },
        transaction(fn) { return Promise.resolve({ value: fn(null) }); },
        once() { return Promise.resolve({ val: () => dbState.round }); },
        on() {}, off() {}, orderByChild() { return ref; }, equalTo() { return ref; },
        push() { return Promise.resolve({ key: 'newRound' }); }
    };
    return ref;
}
win.db = { ref: p => makeRef(p) };
win.confirm = () => true;
win.navigator.vibrate = () => {};
// jsdom не реализует scrollIntoView — страница зовёт его для активной лунки.
win.Element.prototype.scrollIntoView = function () {};

// Скрипты в порядке страницы (без Firebase — вместо него фейковая база).
['js/ui-events.js', 'js/course-config.js', 'js/format.js', 'js/date-range.js', 'js/safe-html.js',
    'js/dom.js', 'js/i18n.js', 'js/official-alerts.js', 'js/utils.js',
    'js/score-kiosk.js', 'js/score-display.js', 'js/live.js',
    'js/solo.js', 'js/round-setup.js', 'js/score-write.js'].forEach(function (rel) {
    win.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
});

// Тост перехватываем после загрузки скриптов (dom.js создаёт настоящий toast).
const toasts = [];
win.toast = function (message, kind, opts) { toasts.push({ message: String(message), kind: kind, opts: opts }); };
// Запись счёта фиксируем на уровне «серверного» API: так проверяем ровно те
// операции, которые страница отправляет.
const writes = [];
win.pestovoScoreWrite = function (rid, ops, actor) {
    writes.push({ rid: rid, ops: ops, actor: actor });
    return Promise.resolve({ ok: true });
};

const START_TS = Date.now() - 3600 * 1000;
function mkSoloRound() {
    return {
        mode: 'solo',
        status: 'active',
        startHole: 1,
        holeRange: '1-18',
        tee: 'wh',
        format: 'Stroke Play',
        startTime: START_TS,
        createdAt: START_TS,
        createdBy: 'me',
        accessKey: 'key_solo',
        markerAssignments: {},
        participantsList: ['me'],
        players: {
            me: {
                name: 'Иван Соло', firstName: 'Иван', lastName: 'Соло',
                tee: 'wh', exactHcp: 10, fieldHcp: 11,
                scores: {}, submitted: {}, verified: {}, holeTimes: {}
            }
        }
    };
}

dbState.round = mkSoloRound();
win.applyRoundState(dbState.round);

function nextFrame(cb) { setTimeout(cb, 40); }

const scoringView = doc.getElementById('active-scoring-view');
const readOnlyView = doc.getElementById('group-view');
const saveBtn = doc.getElementById('save-hole-btn');

nextFrame(function () {
    ok(!scoringView.classList.contains('hidden'), 'соло-раунд: открыт общий экран ввода счёта');
    ok(readOnlyView.classList.contains('hidden'), 'соло-раунд: режим просмотра скрыт');
    ok(win.canEditGroup === true, 'соло-раунд: владелец может вводить счёт');
    ok(win.canEditSolo === true, 'canEditSolo — алиас общего движка (совместимость)');
    ok(win.isSinglePlayerRound(dbState.round) === true, 'isSinglePlayerRound() распознаёт mode=solo');

    const markerBox = doc.getElementById('marker-input-container');
    const dualPanel = doc.getElementById('dual-score-panel');
    ok(markerBox.classList.contains('hidden'), 'соло-раунд: панель «счёт игрока» (маркер) скрыта');
    ok(dualPanel.classList.contains('single'), 'соло-раунд: счёт вводится в одной панели');
    // Регрессия v1.128.0: класс .hidden на панели маркера не работал, потому
    // что .dual-half{display:flex!important} стоял в CSS ниже .hidden при
    // равной специфичности — второй блок ввода счёта всё равно показывался.
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    ok(/\.dual-half\.hidden\s*\{[^}]*display\s*:\s*none\s*!important/.test(css),
        'соло-раунд: .dual-half.hidden действительно скрывает второй блок ввода');
    ok(css.indexOf('.dual-half.hidden') > css.indexOf('.dual-half{'),
        'соло-раунд: правило скрытия идёт после flex-правила панели');
    const stylesheetHidesMark = /\.dual-score-split-panel[^{]*:has\(\.dual-half--mark\.hidden\)[^{]*\{[^}]*display\s*:\s*none\s*!important/.test(css) ||
        /\.dual-score-split-panel\.single[^{]*\.dual-half--mark[^{]*\{[^}]*display\s*:\s*none\s*!important/.test(css);
    ok(stylesheetHidesMark, 'соло-раунд: маркерная панель скрыта и в компоновках (single/…:has)');

    const invite = doc.getElementById('invite-qrs-card');
    ok(invite.classList.contains('hidden'), 'соло-раунд: QR-подключения скрыты (подключать некого)');

    const info = doc.getElementById('play-round-info');
    ok(!!info && info.innerHTML.indexOf('Иван Соло') !== -1, 'строка данных раунда заполнена игроком');
    const dl = doc.getElementById('play-deadline');
    ok(!!dl && dl.textContent !== '—', 'дедлайн лунки рассчитан → ' + (dl ? dl.textContent : ''));

    // ── Ввод счёта на лунке ──
    win.curRoundData = dbState.round;
    win.myUid = 'me';
    win.myTargetUid = null;
    win.canEditGroup = true;
    win.playHole = 1;
    win.playHoleRoundId = ROUND_ID;
    win.myScore = 5;
    win.saveHoleInFlight = false;
    win.renderPlayHole();

    ok(doc.getElementById('play-hole').textContent === '1', 'экран показывает текущую лунку 1');
    ok(doc.getElementById('save-hole-btn-text').textContent.indexOf('Подтвердить') !== -1,
        'кнопка подтверждения та же, что в групповом раунде');

    toasts.length = 0;
    saveBtn.click();

    setTimeout(function () {
        ok(writes.length === 1, 'нажатие «Подтвердить» даёт одну запись счёта');
        const ops = (writes[0] && writes[0].ops) || [];
        ok(ops.length === 1 && ops[0].kind === 'score', 'в соло пишется только свой счёт (без marker-операций)');
        ok(ops[0] && ops[0].playerId === 'me' && ops[0].hole === 1 && ops[0].score === 5,
            'операция: свой счёт 5 на лунке 1');

        const me = dbState.round.players.me;
        ok(me.scores['1'] === 5, 'локальная карточка: счёт записан');
        ok(me.verified['1'] === true, 'локальная карточка: лунка сразу подтверждена (маркера нет)');
        ok(win.getHoleVerifyState(me, '1') === 'confirmed', 'лента лунок: введённая лунка — confirmed');
        ok(win.playHole === 2, 'после подтверждения открыта следующая лунка → ' + win.playHole);

        const texts = toasts.map(t => t.message).join(' | ');
        ok(texts.indexOf('Ждём маркера') === -1, 'тост не обещает подтверждения маркера');
        ok(texts.indexOf('сохранено') !== -1, 'тост сообщает, что счёт сохранён');

        // ── Завершение раунда без маркера доступно ──
        win.finishBlockShown = false;
        doc.getElementById('finish-block-notice').classList.add('hidden');
        win.renderPlayHole();
        win.finishGroupRound();
        nextFrame(function () {
            const notice = doc.getElementById('finish-block-notice');
            ok(notice.classList.contains('hidden'),
                'соло-раунд не блокируется «неподтверждёнными» лунками (маркера нет)');

            console.log(failures
                ? '\n✗ Провалено проверок: ' + failures + ' из ' + checks
                : '\n✓ Единый экран раунда: ' + checks + ' проверок пройдено');
            process.exit(failures ? 1 : 0);
        });
    }, 120);
});
