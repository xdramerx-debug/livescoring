// UI-тест страницы ввода счёта (запуск: node tools/test-round-page-ui.js)
// Поднимает НАСТОЯЩИЙ setup-round.html в jsdom, выполняет настоящие
// js/utils.js и js/live.js и проверяет разметку и поведение:
//   • отсчёт до старта турнира (QR открыт раньше времени) — ввод счёта закрыт;
//   • в момент старта раунд открывается сам, без перезагрузки страницы;
//   • серия быстрых нажатий «Подтвердить» даёт ровно одну запись в базу;
//   • кнопка называется «Подтвердить»;
//   • «Завершить раунд» держит предупреждение и не перебрасывает на лунку.
// Если jsdom не установлен — тест пропускается (не падает).
'use strict';
const fs = require('fs');
const path = require('path');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('SKIP: jsdom не установлен (npm i jsdom) — UI-тест пропущен'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
let failures = 0, checks = 0;
function ok(cond, label) {
    checks++;
    if (!cond) { failures++; console.error(' ✗', label); }
    else console.log(' ok   |', label);
}

const ROUND_ID = 'R1';
const html = fs.readFileSync(path.join(ROOT, 'setup-round.html'), 'utf8')
    .replace(/<script src="https?:[^"]*"><\/script>/g, '');   // Firebase/FontAwesome не нужны

const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://example.test/setup-round.html?round=' + ROUND_ID + '&as=me',
    pretendToBeVisual: true
});
const win = dom.window;
const doc = win.document;

// ── Фейковая база: считаем записи ──
const dbState = { updates: [], sets: [], round: null };
function makeRef(p) {
    const ref = {
        _p: p || '',
        update(obj) { dbState.updates.push({ path: ref._p, obj }); return Promise.resolve(); },
        set(val) { dbState.sets.push({ path: ref._p, val }); return Promise.resolve(); },
        remove() { return Promise.resolve(); },
        transaction(fn) { return Promise.resolve({ value: fn(null) }); },
        once() {
            if (ref._p === 'rounds') return Promise.resolve({ val: () => ({ [ROUND_ID]: dbState.round }) });
            if (ref._p.indexOf('rounds/') === 0) return Promise.resolve({ val: () => dbState.round });
            return Promise.resolve({ val: () => null });
        },
        on() {}, off() {}, orderByChild() { return ref; }, equalTo() { return ref; },
        push() { return Promise.resolve({ key: 'newRound' }); }
    };
    return ref;
}
win.db = { ref: p => makeRef(p) };
win.confirm = () => true;
win.navigator.vibrate = () => {};

['js/utils.js', 'js/live.js'].forEach(function (rel) {
    win.eval(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
});

const START_TS = new Date('2026-09-20T09:00:00').getTime();
function mkRound(status, scheduledStart) {
    return {
        mode: 'group', status: status, scheduledStart: scheduledStart, startTime: scheduledStart,
        tournamentId: 'tn1', tournamentName: 'Кубок Пестово', groupNo: 1, createdAt: scheduledStart,
        startHole: 1, holeRange: '1-18', tee: 'wh', format: 'Stroke Play',
        players: {
            me: { name: 'Иван Тестов', tee: 'wh', exactHcp: 10, fieldHcp: 11, scores: {}, submitted: {}, verified: {}, markerScores: {}, markerSubmitted: {}, markedBy: 'op' },
            op: { name: 'Пётр Маркеров', tee: 'wh', exactHcp: 12, fieldHcp: 13, scores: {}, submitted: {}, verified: {}, markerScores: {}, markerSubmitted: {} }
        },
        markerAssignments: { me: { targetId: 'op', targetName: 'Пётр Маркеров' } },
        participantsList: ['me', 'op']
    };
}
// Тяжёлые блоки рисуются через requestAnimationFrame (одна перерисовка на кадр)
function nextFrame(cb) { setTimeout(cb, 30); }

const gate = doc.getElementById('round-start-gate');
const scoringView = doc.getElementById('active-scoring-view');
const groupView = doc.getElementById('group-view');
const btn = doc.getElementById('save-hole-btn');
const btnTxt = doc.getElementById('save-hole-btn-text');
const notice = doc.getElementById('finish-block-notice');

// ══════════════════════════════════════════════════════════
// 1. QR ОТКРЫТ РАНЬШЕ ВРЕМЕНИ: ТАЙМЕР, ВВОД СЧЁТА ЗАКРЫТ
// ══════════════════════════════════════════════════════════
dbState.round = mkRound('scheduled', START_TS);
win.applyRoundState(dbState.round);

nextFrame(function () {
    ok(!!gate, 'в разметке есть блок отсчёта до старта');
    ok(!!notice, 'в разметке есть блок предупреждения о неподтверждённых лунках');
    ok(!gate.classList.contains('hidden'), 'до старта: таймер показан');
    ok(scoringView.classList.contains('hidden'), 'до старта: ввод счёта скрыт');
    ok(groupView.classList.contains('hidden') === false, 'до старта: доступен режим просмотра состава');
    ok(win.canEditGroup === false, 'до старта: вводить счёт нельзя');
    const shown = doc.getElementById('round-start-countdown').textContent;
    ok(/^(\d+ дн\. )?\d\d:\d\d(:\d\d)?$/.test(shown), 'до старта: таймер показывает время → ' + shown);
    ok(doc.getElementById('round-start-title').textContent.indexOf('не начался') !== -1,
        'до старта: заголовок «Турнир ещё не начался»');
    ok(doc.getElementById('round-start-at').textContent.length > 0, 'до старта: показано время старта');

    // ══════════════════════════════════════════════════════
    // 2. СТАРТ НАСТУПИЛ: ТАЙМЕР УБРАН, ВВОД ОТКРЫТ (БЕЗ ПЕРЕЗАГРУЗКИ)
    // ══════════════════════════════════════════════════════
    dbState.round = mkRound('scheduled', Date.now() - 1000);
    win.applyRoundState(dbState.round);

    nextFrame(function () {
        ok(gate.classList.contains('hidden'), 'после старта: таймер скрыт');
        ok(!scoringView.classList.contains('hidden'), 'после старта: ввод счёта открыт');
        ok(win.canEditGroup === true, 'после старта: игрок может вводить счёт');
        ok(groupView.classList.contains('hidden'), 'после старта: режим просмотра скрыт');

        // ══════════════════════════════════════════════════
        // 2б. ШТОРМ ОБНОВЛЕНИЙ: ОДНА ПЕРЕРИСОВКА НА КАДР
        // ══════════════════════════════════════════════════
        let cardBuilds = 0;
        const realBuild = win.generateGroupHoleTableHTML;
        win.generateGroupHoleTableHTML = function () { cardBuilds++; return realBuild.apply(this, arguments); };
        for (let i = 0; i < 10; i++) {
            dbState.round.players.me.scores[1] = 4 + (i % 5);   // данные меняются → мемоизация не спасает
            win.applyRoundState(dbState.round);                  // 10 снимков базы подряд
        }
        nextFrame(function () {
        ok(cardBuilds === 1, '10 снимков базы подряд → карточка группы перерисована 1 раз (было бы 10) → ' + cardBuilds);

        // А если данные не изменились — карточка не перерисовывается вовсе
        cardBuilds = 0;
        for (let i = 0; i < 5; i++) win.applyRoundState(dbState.round);
        nextFrame(function () {
        ok(cardBuilds === 0, '5 одинаковых снимков → карточка не перерисована вовсе → ' + cardBuilds);
        win.generateGroupHoleTableHTML = realBuild;

        // ══════════════════════════════════════════════════
        // 3. КНОПКА «ПОДТВЕРДИТЬ»
        // ══════════════════════════════════════════════════
        const r = dbState.round;
        win.curRoundData = r;
        win.myUid = 'me';
        win.myTargetUid = 'op';
        win.canEditGroup = true;
        win.playHole = 1;
        win.playHoleRoundId = ROUND_ID;
        win.myScore = 4;
        win.targetScore = 4;
        win.saveHoleInFlight = false;
        win.renderPlayHole();
        ok(btnTxt.textContent.indexOf('Подтвердить') !== -1, 'кнопка называется «Подтвердить ✓» → ' + btnTxt.textContent);
        ok(btnTxt.textContent.indexOf('следующую лунку') === -1, 'старой подписи «на следующую лунку» нет');

        // ══════════════════════════════════════════════════
        // 4. БЫСТРЫЕ НАЖАТИЯ: ОДНА ЗАПИСЬ В БАЗУ
        // ══════════════════════════════════════════════════
        dbState.updates = [];
        for (let i = 0; i < 8; i++) btn.click();          // 8 кликов подряд
        ok(dbState.updates.length === 1, '8 быстрых кликов → запись в базу одна (получилось: ' + dbState.updates.length + ')');
        ok(btn.disabled === true, 'на время записи кнопка заблокирована');

        setTimeout(function () {
            ok(btn.disabled === false, 'после записи кнопка снова доступна');
            ok(win.playHole === 2, 'после подтверждения открыта следующая лунка → ' + win.playHole);

            // ══════════════════════════════════════════════
            // 5. «ЗАВЕРШИТЬ РАУНД»: ПРЕДУПРЕЖДЕНИЕ БЕЗ ПЕРЕХОДА
            // ══════════════════════════════════════════════
            const me = r.players.me;
            const order = win.getRoundOrder(r);
            order.forEach(function (h) {
                me.scores[h] = 4; me.submitted[h] = true; me.verified[h] = true;
                me.markerScores['op'] = me.markerScores['op'] || {};
                me.markerScores['op'][h] = 4;
            });
            // Маркер НЕ ввёл счёт на лунках 1 и 18
            [1, 18].forEach(function (h) { delete me.markerScores['op'][h]; me.verified[h] = 'pending'; });
            delete me.scores[1]; delete me.submitted[1];      // на 1-й нет и счёта игрока
            win.curRoundData = r;
            win.playHole = 18;
            win.groupFinishing = false;
            win.finishBlockShown = false;
            win.renderPlayHole();
            ok(btnTxt.textContent.indexOf('Завершить раунд') !== -1,
                'на последней лунке кнопка «Завершить раунд» → ' + btnTxt.textContent);

            btn.click();                                       // жмём «Завершить раунд»
            ok(!notice.classList.contains('hidden'), 'предупреждение показано');
            ok(notice.innerHTML.indexOf('Лунка 1') !== -1 && notice.innerHTML.indexOf('Лунка 18') !== -1,
                'в предупреждении перечислены лунки 1 и 18');
            ok(win.playHole === 18, 'игрока НЕ перебросило на проблемную лунку (остался на ' + win.playHole + ')');
            ok(r.status !== 'completed', 'раунд не завершён, пока есть неподтверждённые лунки');

            // Предупреждение «горит» и при следующих обновлениях базы
            win.applyRoundState(r);
            nextFrame(function () {
                ok(!notice.classList.contains('hidden'), 'предупреждение горит и после обновления данных');

                // Маркер довёл счёт на 1 и 18 — предупреждение гаснет само
                [1, 18].forEach(function (h) {
                    me.scores[h] = 4; me.submitted[h] = true; me.verified[h] = true;
                    me.markerScores['op'][h] = 4;
                    me.markerSubmitted['op'] = me.markerSubmitted['op'] || {};
                    me.markerSubmitted['op'][h] = true;
                });
                win.applyRoundState(r);
                nextFrame(function () {
                    ok(notice.classList.contains('hidden'), 'после подтверждения всех лунок предупреждение исчезло');
                    ok(win.finishBlockShown === false, 'флаг предупреждения сброшен');

                    console.log(failures
                        ? '\n✗ UI-проверок провалено: ' + failures + ' из ' + checks
                        : '\n✓ UI-проверки страницы раунда пройдены: ' + checks);
                    process.exit(failures ? 1 : 0);
                });
                });
                });
            });
        }, 80);
    });
});
