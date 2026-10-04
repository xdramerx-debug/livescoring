#!/usr/bin/env node
'use strict';
/*
 * Вкладка турнира «Счетные карточки» (js/tn-mgr-printcards.js).
 *
 * Проверяет чистое ядро без браузера:
 *   — сборка карточек из участников и стартового листа (связки, парные форматы);
 *   — актуальность: живые данные перекрывают старые, ручные правки (edits) живут;
 *   — раскладка на листе A4: карточка всегда помещается (иначе предпросмотр пуст);
 *   — размеры/кегли: ограничения, CSS-переменные, общий дизайн на все карточки;
 *   — печать: страницы по 1–2 карточки, подписи «Игрок/Маркер/Судья» НЕ печатаются;
 *   — разметка вкладки: одна карточка-эталон (редактируется) + свёрнутый список.
 */

var path = require('path');
var ROOT = path.join(__dirname, '..');
var fails = 0;
var total = 0;

function check(title, cond, extra) {
    total++;
    if (!cond) fails++;
    console.log((cond ? ' ok  ' : 'FAIL ') + ' | ' + title + (extra !== undefined ? ' → ' + extra : ''));
}

global.window = global;
global.TnMgrCore = require(path.join(ROOT, 'js/tn-mgr-core.js'));

var TOURNAMENT = {
    id: 't1',
    name: 'Кубок Пестово',
    startDate: '2026-06-01',
    club: 'Гольф-клуб Пестово',
    course: 'Пестово',
    printScorecards: null
};
var PLAYERS = [
    { id: 'a', fio: 'Иванов Иван', hi: 12, ch: 10, gender: 'men', teamId: 't-1', active: true },
    { id: 'b', fio: 'Петров Пётр', hi: 8, ch: 8, gender: 'men', teamId: 't-1', active: true },
    { id: 'c', fio: 'Сидоров Сидор', hi: 18, ch: 17, gender: 'men', active: true },
    { id: 'd', fio: 'Выбыл', hi: 10, active: false }
];
var ENTRIES = {
    a: { playerId: 'a', startHole: 1, flight: '1', startTime: '09:00', tee: 'wh', format: 'stroke' },
    b: { playerId: 'b', startHole: 1, flight: '1', startTime: '09:00', tee: 'wh', format: 'stroke' },
    c: { playerId: 'c', startHole: 10, flight: '2', startTime: '09:10', tee: 'bl', format: 'stroke' },
    d: { playerId: 'd', startHole: 10, flight: '2', startTime: '09:10', tee: 'bl', format: 'stroke' }
};
var writes = [];

global.TnMgrUI = {
    bi: function (ru) { return ru; },
    state: { route: { tid: 't1', tab: 'printcards', rid: '', view: 'card' } },
    tournament: function () { return TOURNAMENT; },
    playersOf: function () { return PLAYERS.slice(); },
    roundsOf: function () { return [{ id: 'r1', date: '2026-06-01' }]; },
    sheetOf: function () { return { roundId: 'r1', entries: ENTRIES }; },
    playerOf: function () { return null; },
    on: function () {},
    modal: function () {},
    el: function () { return null; },
    btn: function (action, label) { return '<button data-tnm-act="' + action + '">' + label + '</button>'; },
    esc: function (v) { return global.TnMgrCore.esc(v); },
    rootEl: function () { return null; },
    toastMsg: function () {},
    render: function () {},
    closeModal: function () {},
    openModal: function () {},
    baseUrl: function () { return 'https://example.test/'; }
};
global.TnMgrData = {
    write: function (p, v) { writes.push({ path: p, value: v }); return Promise.resolve(); },
    sheetOrder: function (sheet) {
        var e = (sheet && sheet.entries) || {};
        return Object.keys(e).map(function (k) { return Object.assign({ playerId: k }, e[k]); });
    },
    readRoundScores: function () { return Promise.resolve({}); }
};
global.TnMgrIO = { printHtml: function () { return true; } };
global.TnMgr = { hasAccess: function () { return true; } };

var PC = require(path.join(ROOT, 'js/tn-mgr-printcards.js'));

// ----------------------------------------------------------
// 1. Сборка карточек из живых данных
// ----------------------------------------------------------
var cards = PC.buildCards(PLAYERS, global.TnMgrData.sheetOrder({ entries: ENTRIES }), {});
check('связка teamId даёт одну карточку на двоих', cards.filter(function (c) {
    return c.playerIds.slice().sort().join(',') === 'a,b';
}).length === 1);
check('одиночка — своя карточка', cards.filter(function (c) { return c.playerIds.join() === 'c'; }).length === 1);
var ids = [];
cards.forEach(function (c) { (c.playerIds || []).forEach(function (id) { ids.push(id); }); });
check('нет дублей playerId', ids.length === ids.filter(function (id, i) { return ids.indexOf(id) === i; }).length, ids.join(','));
check('карточки отсортированы по времени старта', cards.map(function (c) { return c.startTime; }).join(',') === '09:00,09:10,09:10');

var pairOnly = PC.buildCards(
    [{ id: 'x', fio: 'А', pairId: 'p1', hi: 4 }],
    [{ playerId: 'x', startHole: 3, flight: 'A', format: 'fourball' }],
    {}
);
check('неполная связка помечается', pairOnly[0] && pairOnly[0].missingPair === true);

var pairByGroup = PC.buildCards(
    [{ id: 'm', fio: 'М', active: true }, { id: 'n', fio: 'Н', active: true }],
    [{ playerId: 'm', startGroupId: 'g9', format: 'fourball' }, { playerId: 'n', startGroupId: 'g9', format: 'fourball' }],
    {}
);
check('парный формат + одна стартовая группа = общая карточка', pairByGroup.length === 1 && pairByGroup[0].playerIds.length === 2);

check('неактивный игрок распознаётся', PC.isActivePlayer({ active: false }) === false);
check('выбывший игрок распознаётся', PC.isActivePlayer({ withdrawn: true }) === false);

// ----------------------------------------------------------
// 2. Актуальность: живые данные против сохранённых карточек
// ----------------------------------------------------------
var stored = [
    { id: cards[1].id, names: ['Своё Имя'], hcps: ['9.9'], tee: 'bk', startHole: 10, startTime: '09:10', edits: { names: true } },
    { id: cards[0].id, names: ['Устаревшее'], hcps: ['1'], tee: 'rd', startHole: 1, startTime: '09:00' }
];
var fresh = PC.applyCardEdits(PC.buildCards(PLAYERS, global.TnMgrData.sheetOrder({ entries: ENTRIES }), {}), stored);
var edited = fresh.filter(function (c) { return c.id === cards[1].id; })[0];
var untouched = fresh.filter(function (c) { return c.id === cards[0].id; })[0];
check('ручная правка имени переживает обновление данных', edited.names.join() === 'Своё Имя');
check('пометка о ручной правке сохраняется', edited.edits && edited.edits.names === true);
check('непомеченные поля берутся из живых данных',
    untouched.names.join(',') === 'Иванов Иван,Петров Пётр' && untouched.hcps.join(',') === '12,8',
    untouched.names.join(',') + ' | ' + untouched.hcps.join(','));

var merged = PC.mergeManual(
    [{ id: 'auto-c', playerIds: ['c'], names: ['Сидоров'], manual: false }],
    [{ id: 'manual-1', playerIds: [], names: ['Гость'], manual: true }]
);
check('ручная карточка не пропадает', merged.some(function (c) { return c.manual && c.names[0] === 'Гость'; }));
check('ручная карточка не дублирует занятого игрока', !PC.mergeManual(
    [{ id: 'auto-a', playerIds: ['a'], names: ['Иванов'], manual: false }],
    [{ id: 'manual-a', playerIds: ['a'], names: ['Иванов'], manual: true }]
).some(function (c) { return c.id === 'manual-a' && (c.playerIds || []).length; }));

check('сигнатура карточек меняется при смене данных',
    PC.cardsSignature([{ id: 'x', names: ['А'], order: 0 }]) !== PC.cardsSignature([{ id: 'x', names: ['Б'], order: 0 }]));

// ----------------------------------------------------------
// 3. Раскладка: карточка обязана помещаться на лист A4
// ----------------------------------------------------------
var d = PC.defaultDraft();
var normalizedOrder = PC.normalizeRowOrder(['strokes', 'fore', 'fore', 'unknown']);
check('порядок строк безопасно дополняется и очищается от дублей',
    normalizedOrder.join(',') === 'strokes,fore,holes,par,index');
check('строку можно переставить в сохранённом порядке',
    PC.reorderRowOrder(d.rowOrder, 'strokes', 'holes').join(',') === 'strokes,holes,par,index,fore');
check('порядок перемещения учитывает скрытые строки',
    PC.visibleRowOrder({ rowOrder: d.rowOrder, show: { par: false } }).join(',') === 'holes,index,fore,strokes');
check('размер карточки по умолчанию 147×200 мм', d.size.wMm === 147 && d.size.hMm === 200);
check('две карточки на листе по умолчанию', d.layout.perSheet === 2);
check('смещение по умолчанию 90×40 мм', d.layout.xMm === 90 && d.layout.yMm === 40);
check('масштаб печати по умолчанию 140%', d.layout.scale === 1.4);
check('при масштабе 140% на лист входит одна карточка', PC.cardsPerSheet(d.layout, d.size) === 1);
check('вписанная раскладка всегда помещается на лист A4', (function () {
    var p = PC.placement(d.layout, d.size, 0);
    return p.xMm + p.wMm <= PC.PAGE_W + 0.01 && p.yMm + p.hMm <= PC.PAGE_H + 0.01;
})(), JSON.stringify(PC.placement(d.layout, d.size, 0)));
check('классическая раскладка 2×147 мм даёт две карточки на листе',
    PC.cardsPerSheet({ xMm: 0, yMm: 5, scale: 1, gapMm: 3, perSheet: 2 }, d.size) === 2);
check('слоты не наезжают друг на друга', PC.slotPos(d.layout, d.size, 1).xMm >= d.size.wMm);
check('раскладка за пределами листа помечается, но не теряется', (function () {
    var legacy = PC.defaultDraft();
    legacy.layout = { xMm: 140, yMm: 40, scale: 1 };
    var fit = PC.fitsOnPage(legacy.layout, legacy.size);
    var p = PC.placement(legacy.layout, legacy.size, 0);
    return fit.ok === false && p.fit < 1 && p.xMm + p.wMm <= PC.PAGE_W + 0.01;
})(), 'раскладку вписываем в лист, а не сбрасываем');
check('18 пар, диапазон 3–6', d.pars.length === 18 && d.pars.every(function (p) { return p >= 3 && p <= 6; }));
check('18 индексов, без пропусков', d.indexes.length === 18);
check('строка форы включена по умолчанию и идёт сразу после индекса',
    d.show.fore === true && d.rowOrder.indexOf('fore') === d.rowOrder.indexOf('index') + 1);
check('строка с номерами лунок включена в настраиваемый порядок', d.rowOrder[0] === 'holes');
check('фора рассчитывается по CH и индексу лунки', PC.foreValues(cards[0])[4] === 1);
check('коды и написания ТИ переводятся в названия цветов',
    PC.teeDisplayName('  bl  ') === 'Синие' && PC.teeDisplayName('wh') === 'Белые' &&
    PC.teeDisplayName('rd') === 'Красные' && PC.teeDisplayName('bk') === 'Чёрные' &&
    PC.teeDisplayName('ye') === 'Жёлтые' && PC.teeDisplayName('Синие') === 'Синие');
check('название цвета можно обратно сопоставить коду ТИ', PC.teeCode('Синие') === 'bl' && PC.teeCode('ye') === 'yl');
check('подписи снизу по умолчанию НЕ печатаются', d.footer.print === false);
check('подписи на экране остались', d.footer.player === 'Игрок' && d.footer.marker === 'Маркер' && d.footer.judge === 'Судья');

var clampedStyle = PC.clampStyle({ padMm: 999, titleMm: -5, nameMm: 'abc', rowHMm: 7 });
check('кегли ограничены диапазоном', clampedStyle.padMm === 25 && clampedStyle.titleMm === 2 && clampedStyle.nameMm === 4.6);
check('корректный кегль не искажается', clampedStyle.rowHMm === 7);
var sizeClamped = PC.clampSize({ wMm: 5000, hMm: 1 });
check('размер карточки ограничен листом', sizeClamped.wMm === PC.PAGE_W && sizeClamped.hMm === 60);
var layoutClamped = PC.clampLayout({ xMm: 9000, yMm: -900, scale: 9, perSheet: 5 }, PC.defaultSize());
check('раскладка ограничена листом', layoutClamped.xMm === PC.PAGE_W && layoutClamped.yMm === -50 &&
    layoutClamped.scale === 2 && layoutClamped.perSheet === 2);

var ov = PC.clampOverlay({ xMm: -10, yMm: 500, wMm: 400, hMm: 10, id: 'z', type: 'logo' });
check('оверлей не выходит за карточку по X', ov.xMm >= 0 && ov.xMm + ov.wMm <= PC.CARD_W);
check('оверлей не выходит за карточку по Y', ov.yMm >= 0 && ov.yMm + ov.hMm <= PC.CARD_H);
var ovSmall = PC.clampOverlay({ xMm: 100, yMm: 100, wMm: 40, hMm: 40, id: 'q', type: 'qr' }, { wMm: 100, hMm: 120 });
check('оверлей считается от текущего размера карточки', ovSmall.xMm + ovSmall.wMm <= 100 && ovSmall.yMm + ovSmall.hMm <= 120);

// ----------------------------------------------------------
// 4. CSS-переменные: один источник для экрана и печати
// ----------------------------------------------------------
var vars = PC.styleVars(PC.defaultStyle());
check('переменные размеров в миллиметрах', /--tnpc-title:4\.2mm/.test(vars) && /--tnpc-row-h:6\.4mm/.test(vars), vars);
check('все кегли описаны переменными в мм',
    vars.split('--tnpc-').length - 1 === Object.keys(PC.STYLE_FIELDS).length &&
    vars.split(';').filter(Boolean).every(function (part) { return part.indexOf('mm') === part.length - 2; }), vars);
var css = PC.cardCssText();
check('CSS карточки использует переменные', css.indexOf('font-size:var(--tnpc-title') !== -1 &&
    css.indexOf('height:var(--tnpc-row-h') !== -1);
check('CSS карточки общий для экрана и печати', PC.documentFor([cards[0]]).indexOf(css) !== -1);

// ----------------------------------------------------------
// 5. Печать: страницы, содержимое, подписи снизу
// ----------------------------------------------------------
var allCards = PC.buildCards(PLAYERS, global.TnMgrData.sheetOrder({ entries: ENTRIES }), {});
var docHtml = PC.documentFor(allCards);
check('страниц по две карточки в классической раскладке', (function () {
    PC.state.draft = null;
    TOURNAMENT.printScorecards = { layout: { xMm: 0, yMm: 5, scale: 1, gapMm: 3, perSheet: 2 }, holes: 18 };
    var pages = PC.pageChunks(allCards);
    PC.state.draft = null;
    TOURNAMENT.printScorecards = null;
    return pages.length === Math.ceil(allCards.length / 2);
})(), allCards.length + ' карточек');
check('при масштабе 140% каждая карточка на своём листе', (function () {
    var pages = PC.pageChunks(allCards);
    return pages.length === allCards.length && pages.every(function (chunk) { return chunk.length === 1; });
})(), PC.pageChunks(allCards).length + ' страниц на ' + allCards.length + ' карточек');
check('формат листа A4 landscape', docHtml.indexOf('@page{size:A4 landscape;margin:0}') !== -1);
check('название турнира печатается', docHtml.indexOf('Кубок Пестово') !== -1);
check('клуб и поле печатаются', docHtml.indexOf('Гольф-клуб Пестово · Пестово') !== -1);
check('дата турнира печатается', docHtml.indexOf('01.06.2026') !== -1);
check('имена игроков печатаются', docHtml.indexOf('Иванов Иван + Петров Пётр') !== -1 && docHtml.indexOf('Сидоров Сидор') !== -1);
check('время старта и лунка печатаются', docHtml.indexOf('09:00') !== -1 && docHtml.indexOf('Лунка') !== -1);
check('строки Пар/Индекс/Фора/Удары печатаются', docHtml.indexOf('>Пар</span>') !== -1 && docHtml.indexOf('>Индекс</span>') !== -1 &&
    docHtml.indexOf('>Фора 1</span>') !== -1 && docHtml.indexOf('>Удары</span>') !== -1);
check('колонки идут 1–9, OUT, 10–18, IN, TOTAL',
    docHtml.indexOf('<td>9</td><td class="sum">OUT</td><td>10</td>') !== -1 &&
    docHtml.indexOf('<td>18</td><td class="sum">IN</td><td class="sum">TOTAL</td>') !== -1);
check('ТИ отображается названием цвета, а не кодом', docHtml.indexOf('>Белые</span>') !== -1 &&
    docHtml.indexOf('>wh</span>') === -1 && docHtml.indexOf('>bl</span>') === -1);
check('подписи «Игрок/Маркер/Судья» НЕ печатаются',
    docHtml.indexOf('<div class="tnpc-sign"') === -1 && docHtml.indexOf('<div class="tnpc-foot') === -1);
check('слова «Маркер» и «Судья» не попадают в печать',
    docHtml.indexOf('Маркер') === -1 && docHtml.indexOf('Судья') === -1 && docHtml.indexOf('>Игрок<') === -1);
check('служебная разметка редактора не печатается',
    docHtml.indexOf('<span class="tnpc-handle"') === -1 && docHtml.indexOf('<span class="tnpc-x"') === -1 &&
    docHtml.indexOf('contenteditable') === -1);
check('на печати карточка вписана в лист A4 landscape',
    docHtml.indexOf('left:59.04mm;top:26.24mm') !== -1 &&
    docHtml.indexOf('transform:scale(0.918)') !== -1, 'раскладка 90×40 при 140%');
check('классическая раскладка ставит две карточки в ряд', (function () {
    PC.state.draft = null;
    TOURNAMENT.printScorecards = { layout: { xMm: 0, yMm: 5, scale: 1, gapMm: 3, perSheet: 2 }, holes: 18 };
    var html = PC.documentFor(allCards);
    PC.state.draft = null;
    TOURNAMENT.printScorecards = null;
    return html.indexOf('left:0mm;top:5mm') !== -1 && html.indexOf('left:150mm;top:5mm') !== -1;
})());
check('внешняя рамка карточки на печать не идёт',
    docHtml.indexOf('.tnpc-card{border:0!important}') !== -1);

// Одна карточка на лист — по явному выбору организатора.
PC.state.draft = null;
TOURNAMENT.printScorecards = { layout: { xMm: 70, yMm: 5, scale: 1, perSheet: 1 }, holes: 18 };
var docOne = PC.documentFor(allCards);
check('режим «1 карточка на листе» даёт страницу на каждую карточку',
    (docOne.match(/class="page"/g) || []).length === allCards.length);
check('в режиме 1/лист второй слот не используется', docOne.indexOf('left:150mm') === -1);

// Подписи можно вернуть в печать явной галочкой.
PC.state.draft = null;
TOURNAMENT.printScorecards = { footer: { player: 'Игрок', marker: 'Маркер', judge: 'Судья', print: true } };
check('галочка «печатать подписи» возвращает их в печать',
    PC.documentFor([allCards[0]]).indexOf('<div class="tnpc-sign"') !== -1);

// 9 лунок.
PC.state.draft = null;
TOURNAMENT.printScorecards = { holes: 9 };
var doc9 = PC.documentFor([allCards[0]]);
check('9 лунок: OUT и TOTAL после девятой лунки, без IN',
    doc9.indexOf('>IN<') === -1 && doc9.indexOf('>OUT<') !== -1 && doc9.indexOf('>TOTAL<') !== -1 &&
    doc9.indexOf('>TOT<') === -1);

// ----------------------------------------------------------
// 5a. Фора — наклонными черточками в правом верхнем углу клетки счёта
// ----------------------------------------------------------
check('черточки форы рисуются в клетке счёта',
    docHtml.indexOf('<span class="tnpc-marks" title="') !== -1 &&
    docHtml.indexOf('<i class="tnpc-mark"></i>') !== -1);
check('черточки позиционируются в правом верхнем углу',
    docHtml.indexOf('.tnpc-marks{position:absolute;top:.2mm;right:.2mm') !== -1);
check('черточки наклонные', docHtml.indexOf('transform:rotate(25deg)') !== -1);
function marksInRow(html, label) {
    var at = html.indexOf('>' + label + '</span>');
    if (at === -1) return null;
    var row = html.slice(at, html.indexOf('</tr>', at));
    return row.split('<td class="tnpc-empty">').slice(1)
        .map(function (cell) { return (cell.match(/tnpc-mark"/g) || []).length; });
}
var indexes = PC.defaultDraft().indexes;
var expected = indexes.map(function (si) { return si <= 10 ? 1 : 0; });   // игрок a: CH 10
check('по черточке на каждый удар форы лунки (CH 10)', marksInRow(docHtml, 'Удары 1').join(',') === expected.join(','),
    marksInRow(docHtml, 'Удары 1').join(','));
var expectedB = indexes.map(function (si) { return si <= 8 ? 1 : 0; });   // игрок b: CH 8
check('у второго игрока связки свои черточки (CH 8)', marksInRow(docHtml, 'Удары 2').join(',') === expectedB.join(','),
    marksInRow(docHtml, 'Удары 2').join(','));
check('у связки строка «Удары» своя у каждого игрока',
    docHtml.indexOf('>Удары 1</span>') !== -1 && docHtml.indexOf('>Удары 2</span>') !== -1);
check('у одиночки строка «Удары» без номера',
    PC.documentFor([allCards[2]]).indexOf('>Удары</span>') !== -1);
check('без строки форы черточек тоже нет', (function () {
    PC.state.draft = null;
    TOURNAMENT.printScorecards = { show: { fore: false }, holes: 18 };
    var noFore = PC.documentFor([allCards[0]]);
    PC.state.draft = null;
    TOURNAMENT.printScorecards = null;
    PC.state.draft = null;
    return noFore.indexOf('<i class="tnpc-mark">') === -1;
})());
check('минусовая фора — красные черточки', (function () {
    var marks = PC.foreMarksHtml({ names: ['А'], fieldHcps: [-2] }, 12, 0);
    return marks.indexOf('tnpc-marks minus') !== -1 && marks.indexOf('(минусовая)') !== -1;
})(), 'лунка с индексом 18 забирает удар у плюсового игрока');
check('подпись черточек доступна для чтения с экрана',
    docHtml.indexOf('title="Фора: 1 удар') !== -1);

// ----------------------------------------------------------
// 6. Разметка вкладки: эталон + свёрнутый список
// ----------------------------------------------------------
PC.state.draft = null;
PC.state.activeCardId = '';
TOURNAMENT.printScorecards = null;
var tabHtml = PC.html();
check('вкладка отдаёт разметку', tabHtml.indexOf('tnpc-wrap') !== -1);
// Все панели открыты: любая опечатка в панели роняет вкладку целиком.
['sizes', 'fields', 'content', 'overlays'].forEach(function (panel) { PC.state.panels[panel] = true; });
var panelsHtml = PC.html();
check('вкладка жива со всеми открытыми панелями', panelsHtml.length > tabHtml.length);
check('панель размеров объясняет вписывание в лист', /вписывается в лист/.test(panelsHtml));
check('подсказка о вписывании помечена своим классом (правка размеров не копит копии)',
    panelsHtml.indexOf('tnpc-fit-note') !== -1);
check('подсказка про печать альбомным листом', /Ориентация: Альбомная \(авто\)/.test(panelsHtml));
check('подсказка про черточки форы', /наклонными черточками/.test(panelsHtml));
check('внешняя рамка на бумагу не идёт', PC.documentFor([allCards[0]]).indexOf('.tnpc-card{border:0!important}') !== -1);
['sizes', 'fields', 'content', 'overlays'].forEach(function (panel) { PC.state.panels[panel] = false; });
check('ровно одна карточка-эталон на экране', (tabHtml.match(/class="tnpc-card"/g) || []).length === 1,
    (tabHtml.match(/class="tnpc-card"/g) || []).length);
check('эталон редактируется на месте', tabHtml.indexOf('contenteditable="true"') !== -1);
check('строки таблицы можно перемещать перетаскиванием и стрелками',
    tabHtml.indexOf('data-tnpc-row-handle="holes"') !== -1 &&
    tabHtml.indexOf('data-tnm-act="tnpc-table-row-up"') !== -1 &&
    tabHtml.indexOf('data-tnm-act="tnpc-table-row-down"') !== -1);
check('все карточки перечислены свёрнутыми строками',
    (tabHtml.match(/class="tnpc-row( active)?"/g) || []).length === allCards.length,
    (tabHtml.match(/class="tnpc-row( active)?"/g) || []).length);
check('активна ровно одна строка — у эталона', (tabHtml.match(/class="tnpc-row active"/g) || []).length === 1);
check('свёрнутые строки неактивны (без редактирования)', (function () {
    var rows = tabHtml.split('<div class="tnpc-row').slice(1).join('');
    return rows.indexOf('contenteditable') === -1;
})());
check('у свёрнутой карточки нет таблицы с лунками', (function () {
    var rowPart = tabHtml.slice(tabHtml.indexOf('<div class="tnpc-rows">'));
    return rowPart.indexOf('tnpc-table') === -1;
})());
check('предпросмотр листа A4 на месте', tabHtml.indexOf('data-tnpc-stage') !== -1 && tabHtml.indexOf('data-tnpc-page') !== -1);
check('панель размеров доступна', tabHtml.indexOf('tnpc-panel-sizes') !== -1);
check('панель лого и QR доступна', tabHtml.indexOf('tnpc-panel-overlays') !== -1);
check('панель состава информации доступна', tabHtml.indexOf('tnpc-panel-content') !== -1);
check('строка актуальности данных показана', tabHtml.indexOf('Участников: 4') !== -1 && tabHtml.indexOf('Карточек: 3') !== -1);
check('предупреждение о недостающем стартовом листе отсутствует, если лист есть',
    tabHtml.indexOf('Нет стартового листа') === -1);

// Эталон можно сменить — тогда редактируется другая карточка.
PC.state.activeCardId = allCards[1].id;
var second = PC.html();
check('эталон переключается на выбранную карточку', second.indexOf('data-cid="' + allCards[1].id + '" data-slot') !== -1);
check('прежний эталон становится свёрнутой строкой', second.indexOf('<div class="tnpc-row" data-cid="' + allCards[0].id + '"') !== -1);

// QR включается и получает ссылку на ввод счёта игрока.
PC.state.draft = null;
PC.state.activeCardId = '';
TOURNAMENT.printScorecards = { qrEnabled: true, overlays: [{ id: 'qr-1', type: 'qr', xMm: 100, yMm: 4, wMm: 26, hMm: 26, enabled: true }] };
var qrHtml = PC.html();
check('QR-код рисуется по ссылке ввода счёта', qrHtml.indexOf('data-qr') !== -1 && qrHtml.indexOf('create-qr-code') !== -1 &&
    qrHtml.indexOf('setup-round.html') !== -1);
check('отключенный оверлей не печатается', (function () {
    PC.state.draft.overlays.push({ id: 'logo', type: 'logo', xMm: 4, yMm: 4, wMm: 20, hMm: 10, enabled: false, src: 'data:image/png;base64,AA' });
    var printed = PC.documentFor([allCards[0]]);
    return printed.indexOf('data:image/png;base64,AA') === -1;
})());
check('включённый лого печатается', (function () {
    PC.state.draft.overlays = [{ id: 'logo', type: 'logo', xMm: 4, yMm: 4, wMm: 20, hMm: 10, enabled: true, src: 'data:image/png;base64,BB' }];
    return PC.documentFor([allCards[0]]).indexOf('data:image/png;base64,BB') !== -1;
})());
var logoDraft = PC.defaultDraft();
logoDraft.logoSrc = 'data:image/png;base64,OLD';
logoDraft.overlays = [{ id: 'logo', type: 'logo', xMm: 4, yMm: 4, wMm: 20, hMm: 10, enabled: true, src: 'data:image/png;base64,OLD' }];
PC.setLogoSource(logoDraft, 'data:image/png;base64,NEW');
check('замена лого обновляет единый источник и сбрасывает старый источник блока',
    logoDraft.logoSrc === 'data:image/png;base64,NEW' && logoDraft.overlays[0].src === '');
logoDraft._tid = 't1';
PC.state.draft = logoDraft;
var refreshedLogo = PC.cardFaceHtml(allCards[0], false);
check('предпросмотр после замены лого использует новый файл',
    refreshedLogo.indexOf('data:image/png;base64,NEW') !== -1 && refreshedLogo.indexOf('data:image/png;base64,OLD') === -1);
PC.state.draft = PC.defaultDraft();
PC.state.draft._tid = 't1';
check('текстовый оверлей печатается', (function () {
    PC.state.draft.overlays = [{ id: 'txt', type: 'text', xMm: 4, yMm: 150, wMm: 60, hMm: 10, enabled: true, text: 'Дресс-код: строгий', fontMm: 3 }];
    return PC.documentFor([allCards[0]]).indexOf('Дресс-код: строгий') !== -1;
})());

// Сохранение дизайна идёт в узел турнира.
PC.state.draft = null;
TOURNAMENT.printScorecards = null;
writes.length = 0;
PC.html();
PC.refreshCards();
check('дизайн сохраняется в tournaments/<tid>/printScorecards', writes.every(function (w) {
    return w.path === 'tournaments/t1/printScorecards';
}), writes.map(function (w) { return w.path; }).join(','));

console.log('\n' + (fails ? '✗ ' + fails + ' / ' + total : 'All tn-mgr-printcards tests passed ✔ (' + total + ' checks)'));
process.exit(fails ? 1 : 0);
