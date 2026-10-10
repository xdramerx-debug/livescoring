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
// Стартовый лист: группа 1 (a, b) играет вместе, c — в своей группе.
// groupRoundId — раунд ввода счёта (rounds/<gid>), markerPlayerId — кто ведёт
// счёт игрока (здесь кольцо: a → b, b → a).
var ENTRIES = {
    a: { playerId: 'a', playerName: 'Иванов Иван', startHole: 1, flight: '1', startTime: '09:00', tee: 'wh', format: 'stroke', groupRoundId: 'gA', markerPlayerId: 'b', position: 1 },
    b: { playerId: 'b', playerName: 'Петров Пётр', startHole: 1, flight: '1', startTime: '09:00', tee: 'wh', format: 'stroke', groupRoundId: 'gA', markerPlayerId: 'a', position: 2 },
    c: { playerId: 'c', playerName: 'Сидоров Сидор', startHole: 10, flight: '2', startTime: '09:10', tee: 'bl', format: 'stroke', groupRoundId: 'gB', markerPlayerId: 'c', position: 1 },
    d: { playerId: 'd', playerName: 'Выбыл', startHole: 10, flight: '2', startTime: '09:10', tee: 'bl', format: 'stroke', groupRoundId: 'gB', markerPlayerId: 'c', position: 2 }
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
    normalizedOrder.join(',') === 'holes,par,length,index,strokes,fore', normalizedOrder.join(','));
check('строку можно переставить в сохранённом порядке',
    PC.reorderRowOrder(d.rowOrder, 'strokes', 'holes').join(',') === 'strokes,holes,par,length,index,fore');
check('порядок перемещения учитывает скрытые строки',
    PC.visibleRowOrder({ rowOrder: d.rowOrder, show: { par: false } }).join(',') === 'holes,length,index,fore,strokes');
check('строка «Длина» появляется у старых турниров на своём месте (после «Пар»)',
    PC.normalizeRowOrder(['holes', 'par', 'index', 'fore', 'strokes']).join(',') === 'holes,par,length,index,fore,strokes');
check('размер карточки по умолчанию 200×147 мм', d.size.wMm === 200 && d.size.hMm === 147);
check('две карточки на листе по умолчанию', d.layout.perSheet === 2);
check('смещение по умолчанию 105.86×39.68 мм', d.layout.xMm === 105.86 && d.layout.yMm === 39.68);
check('масштаб печати по умолчанию 120%', d.layout.scale === 1.2);
check('зазор между карточками по умолчанию 17 мм', d.layout.gapMm === 17);
check('при масштабе 120% и карточке 200×147 на лист входит одна карточка', PC.cardsPerSheet(d.layout, d.size) === 1);
check('вписанная раскладка всегда помещается на лист A4', (function () {
    var p = PC.placement(d.layout, d.size, 0);
    return p.xMm + p.wMm <= PC.PAGE_W + 0.01 && p.yMm + p.hMm <= PC.PAGE_H + 0.01;
})(), JSON.stringify(PC.placement(d.layout, d.size, 0)));
check('классическая раскладка 2×147 мм даёт две карточки на листе',
    PC.cardsPerSheet({ xMm: 0, yMm: 5, scale: 1, gapMm: 3, perSheet: 2 }, { wMm: 147, hMm: 200 }) === 2);
// Альбомная карточка 200×147 мм умещается парой на листе только при масштабе
// меньше 100%. Здесь проверяем, что масштабирование «внутрь» корректно
// работает — иначе пользователь не сможет напечатать две карточки в ряд.
check('альбомная карточка 200×147 умещается парой при масштабе 70%',
    PC.cardsPerSheet({ xMm: 0, yMm: 5, scale: 0.7, gapMm: 3, perSheet: 2 }, { wMm: 200, hMm: 147 }) === 2);
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
check('18 длин лунок по умолчанию (белые ТИ справочника)', (function () {
    var lens = PC.defaultLengths();
    return lens.length === 18 && lens[0] === 328 && lens[3] === 161 && d.lengths.join() === lens.join();
})(), PC.defaultLengths().slice(0, 4).join(','));
check('длины пересчитываются по выбранному ТИ', PC.defaultLengths('bk')[0] === 361 && PC.defaultLengths('rd')[0] === 295);
check('итог длин считает только заполненные клетки',
    PC.lenSum([0, 300, 400, ''], 0, 4) === 700 && PC.lenSum([0, 0], 0, 2) === '');
check('строка форы включена по умолчанию и идёт сразу после индекса',
    d.show.fore === true && d.rowOrder.indexOf('fore') === d.rowOrder.indexOf('index') + 1);
check('строка «Длина» включена по умолчанию и стоит после «Пар»',
    d.show.length === true && d.rowOrder.indexOf('length') === d.rowOrder.indexOf('par') + 1);
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
check('все размеры описаны переменными в мм',
    vars.split(';').filter(Boolean).filter(function (part) {
        return part.slice(part.indexOf(':') + 1).slice(-2) === 'mm';
    }).length === Object.keys(PC.STYLE_FIELDS).length, vars);
check('цвета и шрифт карточки описаны переменными',
    /--tnpc-ink:#111111/.test(vars) && /--tnpc-paper:#ffffff/.test(vars) &&
    /--tnpc-linec:#111111/.test(vars) && /--tnpc-sumbg:#efefef/.test(vars) &&
    /--tnpc-font:Arial,Helvetica,sans-serif/.test(vars), vars);
var css = PC.cardCssText();
check('CSS карточки использует переменные', css.indexOf('font-size:var(--tnpc-title') !== -1 &&
    css.indexOf('height:var(--tnpc-row-h') !== -1);
check('CSS карточки красится переменными дизайна',
    css.indexOf('background:var(--tnpc-paper,#fff)') !== -1 &&
    css.indexOf('color:var(--tnpc-ink,#111)') !== -1 &&
    css.indexOf('font-family:var(--tnpc-font,Arial,Helvetica,sans-serif)') !== -1 &&
    css.indexOf('solid var(--tnpc-linec,#111)') !== -1 &&
    css.indexOf('background:var(--tnpc-b-bg,var(--tnpc-sumbg,#efefef))') !== -1);
check('блоки таблицы — отдельные обёртки со своими переменными',
    css.indexOf('.tnpc-block{position:relative}') !== -1 &&
    css.indexOf('.tnpc-block+.tnpc-block{margin-top:calc(var(--tnpc-line,0.25mm) * -1)}') !== -1);
check('CSS карточки общий для экрана и печати', PC.documentFor([cards[0]]).indexOf(css) !== -1);

// ----------------------------------------------------------
// 4a. Дизайн и блоки: цвета, шрифты, свои размеры каждой строки
// ----------------------------------------------------------
var designClamped = PC.clampDesign({ font: 'Impact, Charcoal, sans-serif', ink: 'красный', paper: '#fff', line: '#0a0a0a', sumBg: 12345 });
check('дизайн по умолчанию чинит некорректные цвета',
    designClamped.ink === '#111111' && designClamped.paper === '#fff' && designClamped.sumBg === '#efefef' &&
    designClamped.line === '#0a0a0a' && designClamped.font === 'Impact, Charcoal, sans-serif');
check('чужой шрифт отбрасывается', PC.clampDesign({ font: 'Comic Sans, cursive' }).font === '' &&
    PC.safeFont('Tahoma, Geneva, sans-serif') === 'Tahoma, Geneva, sans-serif');
check('цвет допускается только hex', PC.validColor('#abc') && PC.validColor('#a1b2c3') &&
    !PC.validColor('red') && !PC.validColor('#12345'));

var rowsClamped = PC.clampRows({
    par: { fontMm: 8, heightMm: 99, color: '#b00', bg: '#ffd', font: 'Georgia, serif', bold: true, junk: 1 },
    holes: { labWMm: 20 },
    fore: { color: 'nope' }
}, PC.defaultStyle());
check('свои размеры блока клампятся и чистятся от мусора',
    rowsClamped.par.fontMm === 8 && rowsClamped.par.heightMm === 18 &&
    rowsClamped.par.color === '#b00' && rowsClamped.par.bg === '#ffd' &&
    rowsClamped.par.font === 'Georgia, serif' && rowsClamped.par.bold === true &&
    rowsClamped.par.junk === undefined);
check('блок без настроек наследует общие размеры',
    rowsClamped.fore === undefined && rowsClamped.holes.labWMm === 20 &&
    PC.rowCfg('strokes').fontMm === 2.9 && PC.rowCfg('index').heightMm === 6.4 &&
    PC.rowCfg('length').labWMm === 15);
check('стиль блока отдаётся CSS-переменными и цветом', (function () {
    PC.state.draft = PC.defaultDraft();
    PC.state.draft._tid = 't1';
    PC.state.draft.rows = PC.clampRows({
        par: { fontMm: 8, heightMm: 18, color: '#b00', bg: '#ffd', font: 'Georgia, serif', bold: true }
    }, PC.state.draft.style);
    var attr = PC.blockStyleAttr('par');
    var plain = PC.blockStyleAttr('strokes');
    var ok = /--tnpc-table:8mm/.test(attr) && /--tnpc-row-h:18mm/.test(attr) &&
        attr.indexOf('color:#b00') !== -1 && attr.indexOf('--tnpc-b-bg:#ffd') !== -1 &&
        attr.indexOf('font-family:Georgia, serif') !== -1 && attr.indexOf('font-weight:800') !== -1 &&
        plain === '--tnpc-table:2.9mm;--tnpc-row-h:6.4mm;--tnpc-lab-w:15mm;';
    PC.state.draft = null;
    return ok;
})(), 'свои переменные и цвет у блока, минимум — у остальных');

// ----------------------------------------------------------
// 5. Печать: страницы, содержимое, подписи снизу
// ----------------------------------------------------------
var allCards = PC.buildCards(PLAYERS, global.TnMgrData.sheetOrder({ entries: ENTRIES }), {});
var docHtml = PC.documentFor(allCards);
check('страниц по две карточки в классической раскладке', (function () {
    PC.state.draft = null;
    // Чтобы пара карточек 200×147 влезла на A4 landscape, ставим масштаб
    // 0.7 (по 140мм ширины каждая + 3мм зазор = 283мм ≤ 297мм).
    TOURNAMENT.printScorecards = { layout: { xMm: 0, yMm: 5, scale: 0.7, gapMm: 3, perSheet: 2 }, holes: 18 };
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
check('строка «Длина» печатается с длинами лунок и итогами',
    docHtml.indexOf('>Длина</span>') !== -1 && docHtml.indexOf('>328</td>') !== -1 &&
    /<td class="sum">(\d+)<\/td>/.test(docHtml));
check('строку «Длина» можно выключить в «Составе информации»', (function () {
    PC.state.draft = null;
    TOURNAMENT.printScorecards = { show: { length: false }, holes: 18 };
    var noLen = PC.documentFor([allCards[0]]);
    PC.state.draft = null;
    TOURNAMENT.printScorecards = null;
    PC.state.draft = null;
    return noLen.indexOf('>Длина</span>') === -1 && noLen.indexOf('data-tnpc-block="length"') === -1;
})());
check('блоки таблицы — отдельные обёртки с ручками только на экране',
    docHtml.indexOf('data-tnpc-block="holes"') !== -1 &&
    docHtml.indexOf('data-tnpc-block-resize') === -1 &&
    docHtml.indexOf('class="tnpc-block-h') === -1);
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
    docHtml.indexOf('left:90.8mm;top:34.04mm') !== -1 &&
    docHtml.indexOf('transform:scale(1.03)') !== -1, 'раскладка 105.86×39.68 при 120%');
check('классическая раскладка ставит две карточки в ряд', (function () {
    PC.state.draft = null;
    TOURNAMENT.printScorecards = { layout: { xMm: 0, yMm: 5, scale: 0.7, gapMm: 3, perSheet: 2 }, holes: 18 };
    var html = PC.documentFor(allCards);
    PC.state.draft = null;
    TOURNAMENT.printScorecards = null;
    return html.indexOf('left:0mm;top:5mm') !== -1 && html.indexOf('left:143mm;top:5mm') !== -1;
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
    docHtml.indexOf('.tnpc-marks{position:absolute;top:.15mm;right:.15mm') !== -1);
// Наклон рисуется linear-gradient — он одинаково выводится и на экране, и
// в печати (transform:rotate() ряд браузеров на бумагу теряет).
check('черточки наклонные', /tnpc-mark[^}]*linear-gradient\(125deg/.test(docHtml));
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
// Требование клуба: если фора у игрока есть, наклонные черточки видны в клетках
// «Удары» ВСЕГДА — даже когда строка «Фора» снята в «Составе информации».
check('строка «Фора» скрыта — сама строка не печатается', (function () {
    PC.state.draft = null;
    TOURNAMENT.printScorecards = { show: { fore: false }, holes: 18 };
    var noFore = PC.documentFor([allCards[0]]);
    PC.state.draft = null;
    TOURNAMENT.printScorecards = null;
    PC.state.draft = null;
    return noFore.indexOf('>Фора</span>') === -1;
})());
check('строка «Фора» скрыта — черточки в клетках счёта остаются', (function () {
    PC.state.draft = null;
    TOURNAMENT.printScorecards = { show: { fore: false }, holes: 18 };
    var noFore = PC.documentFor([allCards[0]]);
    PC.state.draft = null;
    TOURNAMENT.printScorecards = null;
    PC.state.draft = null;
    return noFore.indexOf('<i class="tnpc-mark">') !== -1 &&
        marksInRow(noFore, 'Удары 1').join(',') === expected.join(',');
})(), 'черточек столько же, сколько ударов форы на лунке');
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
['sizes', 'fields', 'content', 'overlays', 'design'].forEach(function (panel) { PC.state.panels[panel] = true; });
var panelsHtml = PC.html();
check('вкладка жива со всеми открытыми панелями', panelsHtml.length > tabHtml.length);
check('панель размеров объясняет вписывание в лист', /вписывается в лист/.test(panelsHtml));
check('панель «Цвет и шрифт» настраивает карточку и каждый блок',
    panelsHtml.indexOf('data-panel="design"') !== -1 &&
    panelsHtml.indexOf('data-tnm-live-edit="tnpc-design-color"') !== -1 &&
    panelsHtml.indexOf('data-block-cfg="par"') !== -1 &&
    panelsHtml.indexOf('data-tnm-live-edit="tnpc-row"') !== -1);
check('подсказка о вписывании помечена своим классом (правка размеров не копит копии)',
    panelsHtml.indexOf('tnpc-fit-note') !== -1);
check('подсказка про печать альбомным листом', /Ориентация: Альбомная \(авто\)/.test(panelsHtml));
check('подсказка про черточки форы', /наклонными черточками/.test(panelsHtml));
check('внешняя рамка на бумагу не идёт', PC.documentFor([allCards[0]]).indexOf('.tnpc-card{border:0!important}') !== -1);
['sizes', 'fields', 'content', 'overlays', 'design'].forEach(function (panel) { PC.state.panels[panel] = false; });
check('ровно одна карточка-эталон на экране', (tabHtml.match(/class="tnpc-card"/g) || []).length === 1,
    (tabHtml.match(/class="tnpc-card"/g) || []).length);
check('эталон редактируется на месте', tabHtml.indexOf('contenteditable="true"') !== -1);
check('у каждого блока таблицы — три ручки растягивания (↕ ↔ ↘)',
    tabHtml.indexOf('data-tnpc-block="holes"') !== -1 &&
    tabHtml.indexOf('data-tnpc-block="length"') !== -1 &&
    (tabHtml.match(/data-tnpc-block-resize="holes"/g) || []).length === 3);
check('длины лунок редактируются прямо в клетках карточки',
    tabHtml.indexOf('data-tnpc-grid="len"') !== -1);
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
check('панель цвета и шрифта доступна', tabHtml.indexOf('tnpc-panel-design') !== -1);
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
// QR на карточке принадлежит самому игроку: после сканирования он выбран как «Я».
// В разметке & экранируется как &amp;, поэтому вынимаем только хвост data=.
function qrPayloads(html) {
    var out = [];
    (html.match(/create-qr-code\/[^"']*?(?:&amp;|&)data=[^"'&]+/g) || []).forEach(function (chunk) {
        out.push(decodeURIComponent(chunk.replace(/^.*(?:&amp;|&)data=/, '')));
    });
    (html.match(/data-qr="([^"]+)"/g) || []).forEach(function (attr) {
        out.push(decodeURIComponent(attr.replace(/^data-qr="/, '').replace(/"$/, '')));
    });
    return out;
}
var qrLinks = qrPayloads(qrHtml);
check('QR-код рисуется по ссылке ввода счёта', qrHtml.indexOf('data-qr') !== -1 && qrHtml.indexOf('create-qr-code') !== -1 &&
    qrLinks.some(function (url) { return url.indexOf('setup-round.html') !== -1; }));
check('QR ведёт в раунд группы, а не в раунд турнира',
    qrLinks.length > 0 && qrLinks.every(function (url) { return url.indexOf('round=gA') !== -1; }), qrLinks.join(' , '));
check('QR на карточке принадлежит самому игроку, а не его маркеру',
    qrLinks.some(function (url) { return /[?&]as=a\b/.test(url); }) &&
    !qrLinks.some(function (url) { return /[?&]as=b\b/.test(url); }), qrLinks.join(' , '));
check('подпись QR показывает ФИО игрока в поле Я', qrHtml.indexOf('Персональный QR — «Я»: Иванов Иван') !== -1);
check('старый QR маркера и смена маркера не подменяют игрока карточки', (function () {
    var sheet = { entries: {} };
    Object.keys(ENTRIES).forEach(function (pid) { sheet.entries[pid] = Object.assign({}, ENTRIES[pid]); });
    sheet.entries.a.markerPlayerId = 'c';   // c играет в другой группе
    sheet.entries.a.qr = 'https://example.test/setup-round.html?round=gA&as=b';
    sheet.entries.a.scoreUrl = sheet.entries.a.qr;
    var savedSheet = global.TnMgrUI.sheetOf;
    global.TnMgrUI.sheetOf = function () { return sheet; };
    var links = qrPayloads(PC.html());
    global.TnMgrUI.sheetOf = savedSheet;
    return links.length > 0 && links.every(function (url) { return /[?&]as=a\b/.test(url); });
})());
['a', 'b', 'c'].forEach(function (pid) {
    var card = Object.assign({}, allCards[0], { playerIds: [pid], names: [ENTRIES[pid].playerName] });
    var links = qrPayloads(PC.documentFor([card]));
    check('печатная карточка ' + ENTRIES[pid].playerName + ' открывает именно этого игрока',
        links.length > 0 && links.every(function (link) {
            var url = new URL(link);
            return url.searchParams.get('as') === pid && url.searchParams.get('round') === ENTRIES[pid].groupRoundId;
        }));
});
(function () {
    var overlays = PC.state.draft.overlays;
    PC.state.draft.overlays = overlays.concat([{ id: 'qr-2', type: 'qr', xMm: 70, yMm: 4, wMm: 26, hMm: 26, enabled: true }]);
    var pair = Object.assign({}, allCards[0], { playerIds: ['a', 'b'], names: ['Иванов Иван', 'Петров Пётр'] });
    var links = qrPayloads(PC.documentFor([pair]));
    check('два QR на парной карточке соответствуют двум игрокам по порядку',
        links.length >= 2 && new URL(links[0]).searchParams.get('as') === 'a' && new URL(links[1]).searchParams.get('as') === 'b');
    PC.state.draft.overlays = overlays;
})();
check('без привязки к раунду группы QR не печатается (не ведёт в никуда)', (function () {
    var sheet = { entries: {} };
    Object.keys(ENTRIES).forEach(function (pid) {
        sheet.entries[pid] = Object.assign({}, ENTRIES[pid]);
        delete sheet.entries[pid].groupRoundId;
    });
    var savedSheet = global.TnMgrUI.sheetOf;
    global.TnMgrUI.sheetOf = function () { return sheet; };
    var printed = PC.documentFor(PC.state.draft.cards);
    global.TnMgrUI.sheetOf = savedSheet;
    return printed.indexOf('create-qr-code') === -1 && printed.indexOf('data-qr') === -1;
})());
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
check('сохранённые длины, стили блоков и цвета переживают загрузку', (function () {
    PC.state.draft = null;
    TOURNAMENT.printScorecards = {
        holes: 18,
        lengths: [100, 0, 300],
        rows: { par: { fontMm: 7, color: '#0a0' } },
        design: { ink: '#222222', paper: '#fffff0', line: '#333333', sumBg: '#dddddd', font: 'Georgia, serif' }
    };
    PC.html();
    var loaded = PC.state.draft;
    var ok = loaded.lengths[0] === 100 && loaded.lengths[1] === 0 && loaded.lengths[2] === 300 &&
        loaded.lengths[17] === 335 &&
        loaded.rows.par.fontMm === 7 && loaded.rows.par.color === '#0a0' &&
        loaded.design.ink === '#222222' && loaded.design.paper === '#fffff0' &&
        loaded.design.font === 'Georgia, serif';
    PC.state.draft = null;
    TOURNAMENT.printScorecards = null;
    PC.state.draft = null;
    return ok;
})(), 'короткий массив длин дополняется справочником');

// ----------------------------------------------------------
// 10. Перетаскивание в редакторе: карточка по листу и свой текст
// ----------------------------------------------------------
PC.state.draft = null;
PC.state.activeCardId = '';
PC.state.preview = 'sheet';
TOURNAMENT.printScorecards = { overlays: [
    { id: 'txt-1', type: 'text', xMm: 12, yMm: 150, wMm: 60, hMm: 10, enabled: true, text: 'Спонсор этапа', fontMm: 3 },
    { id: 'qr-1', type: 'qr', xMm: 110, yMm: 4, wMm: 26, hMm: 26, enabled: true }
] };
var dragHtml = PC.html();
check('на карточке есть ручка перетаскивания по листу',
    dragHtml.indexOf('data-tnpc-card-move="1"') !== -1 && dragHtml.indexOf('class="tnpc-move"') !== -1);
check('ручка перетаскивания карточки не попадает в печать',
    PC.documentFor([allCards[0]]).indexOf('class="tnpc-move"') === -1);
check('подсказка объясняет, как двигать карточку по листу', /ручку ✥/.test(dragHtml));
check('подсказка объясняет, что свой текст тоже перетаскивается',
    /добавленный текст перетаскиваются|лого, QR и добавленный текст/i.test(dragHtml));
check('текстовый оверлей живёт в перетаскиваемом контейнере',
    dragHtml.indexOf('data-overlay-id="txt-1"') !== -1 &&
    /data-overlay-id="txt-1"[\s\S]{0,400}data-tnpc-overlay-text="txt-1"/.test(dragHtml));
check('у оверлея есть уголок изменения размера', dragHtml.indexOf('data-tnpc-resize="txt-1"') !== -1);

PC.state.previewPinned = true;
PC.state.preview = 'card';
var cardOnlyHtml = PC.html();
check('в режиме «только карточка» ручки перетаскивания по листу нет',
    cardOnlyHtml.indexOf('data-tnpc-card-move') === -1 && cardOnlyHtml.indexOf('card-only') !== -1);
PC.state.preview = 'sheet';
PC.state.previewPinned = false;

// Место карточки на листе по-прежнему правится числами —drag не ломает панель.
PC.state.draft.layout.xMm = 42;
PC.state.draft.layout.yMm = 17;
var movedHtml = PC.html();
var movedTo = PC.placement(PC.state.draft.layout, PC.state.draft.size, 0);
check('место карточки на листе берётся из раскладки (X/Y в мм)',
    movedHtml.indexOf('left:' + movedTo.xMm + 'mm;top:' + movedTo.yMm + 'mm;') !== -1,
    movedTo.xMm + '/' + movedTo.yMm);
PC.state.panels.sizes = true;
var sizesHtml = PC.html();
check('панель размеров показывает то же место карточки',
    /data-field="xMm"[^>]*value="42"|value="42"[^>]*data-field="xMm"/.test(sizesHtml.replace(/></g, '> <')) ||
    sizesHtml.indexOf('value="42"') !== -1);
PC.state.panels.sizes = false;
PC.state.draft = null;
TOURNAMENT.printScorecards = null;

// ----------------------------------------------------------
// 9. Точный + полевой гандикап на карточке
// ----------------------------------------------------------
TOURNAMENT.printScorecards = null;
PC.state.draft = null;
PC.state.cardsSig = '';
PC.html();
(function () {
    var c = PC.buildCards(PLAYERS, global.TnMgrData.sheetOrder({ entries: ENTRIES }), {});
    var single = c.filter(function (x) { return (x.playerIds || []).indexOf('c') !== -1; })[0];
    var face = PC.cardFaceHtml(single, true);
    check('на карточке точный HCP', face.indexOf('Точный HCP') !== -1 && face.indexOf('>18<') !== -1);
    check('на карточке полевой HCP', face.indexOf('Полевой HCP') !== -1 && face.indexOf('data-tnpc-field="fieldHcps"') !== -1 && face.indexOf('>17<') !== -1);
    check('SHOW_FIELDS содержит переключатель полевого HCP', !!PC.SHOW_FIELDS.fieldHcp && PC.SHOW_FIELDS.fieldHcp.def === true);
    var edited = Object.assign({}, single, { fieldHcps: [20], edits: { fieldHcps: true } });
    check('ручная правка полевого HCP имеет приоритет', PC.fieldHcpFor(edited, 0) === 20 && PC.fieldHcpText(edited) === '20');
    check('плюсовой полевой HCP показывается со знаком +', PC.fieldHcpText(Object.assign({}, single, { fieldHcps: [-2], edits: { fieldHcps: true } })) === '+2');
    PC.state.draft.show.fieldHcp = false;
    check('полевой HCP можно скрыть', PC.cardFaceHtml(single, true).indexOf('Полевой HCP') === -1);
    PC.state.draft.show.fieldHcp = true;
})();

// ----------------------------------------------------------
// 10. Блоки целиком: таблица и шапка двигаются и масштабируются
// ----------------------------------------------------------
(function () {
    var size = PC.defaultSize();
    var def = PC.defaultBox('table', size);
    check('по умолчанию таблица в потоке карточки (не свободная), масштаб 100%', def.free === false && def.k === 1);
    var cl = PC.clampBox('table', { free: 1, xMm: -50, yMm: 9999, wMm: 2, k: 99 }, size);
    check('границы блока: X≥0, Y в карточке, ширина ≥15 мм, масштаб ≤300%',
        cl.free === true && cl.xMm === 0 && cl.yMm <= size.hMm - 3 && cl.wMm === 15 && cl.k === 3, JSON.stringify(cl));
    check('масштаб блока не меньше 40%', PC.clampBox('head', { k: 0.01 }, size).k === 0.4);
    var boxes = PC.clampBoxes(null, size);
    check('у черновика два блока целиком', PC.BOX_KEYS.join(',') === 'table,head' && !!boxes.table && !!boxes.head);

    var c = PC.state.draft.cards[0];
    var baseFace = PC.cardFaceHtml(c, true);
    check('при настройках по умолчанию таблица и шапка без inline-места',
        /class="tnpc-body tnpc-box" data-tnpc-box="table" style=""/.test(baseFace) &&
        /class="tnpc-head tnpc-box" data-tnpc-box="head" style=""/.test(baseFace));
    var baseFont = PC.blockStyleAttr('par');
    PC.state.draft.boxes = { table: { free: true, xMm: 12, yMm: 40, wMm: 150, k: 1.5 }, head: { free: false, k: 1.2 } };
    var face = PC.cardFaceHtml(c, true);
    check('свободная таблица стоит в своей точке и ширине',
        /data-tnpc-box="table" style="left:12mm;top:40mm;width:150mm;/.test(face) && face.indexOf('tnpc-body tnpc-box free') !== -1);
    check('при свободной таблице подписи прижаты к низу карточки', face.indexOf('tnpc-card-inner tb-free') !== -1 &&
        PC.cardCssText().indexOf('.tnpc-card-inner.tb-free .tnpc-foot{margin-top:auto}') !== -1);
    var parFont = parseFloat((/--tnpc-table:([\d.]+)mm/.exec(PC.blockStyleAttr('par')) || [])[1]);
    var parBase = parseFloat((/--tnpc-table:([\d.]+)mm/.exec(baseFont) || [])[1]);
    check('масштаб таблицы увеличивает кегль всех строк', Math.abs(parFont - parBase * 1.5) < 0.02, parBase + ' → ' + parFont);
    check('масштаб шапки увеличивает кегли шапки', /--tnpc-name:[\d.]+mm/.test(PC.boxStyleAttr('head')) && face.indexOf('tnpc-head tnpc-box free') === -1);
    check('ручки блоков не попадают в печать', face.indexOf('data-tnpc-box-drag') === -1);
    var screenFace = PC.cardFaceHtml(c, false);
    check('на экране у таблицы и шапки есть ручки ✥/↔/↕/↘',
        (screenFace.match(/data-tnpc-box-drag="table"/g) || []).length === 4 && (screenFace.match(/data-tnpc-box-drag="head"/g) || []).length === 4);
    check('CSS печати скрывает ручки блоков', PC.documentFor([c]).indexOf('.tnpc-box-move,.tnpc-box-h{display:none!important}') !== -1);
    PC.state.panels.sizes = true;
    var panel = PC.html();
    check('в панели «Размеры» есть настройки блоков целиком',
        panel.indexOf('data-tnm-live-edit="tnpc-box"') !== -1 && panel.indexOf('data-tnm-edit="tnpc-box-free"') !== -1 &&
        panel.indexOf('data-tnm-act="tnpc-box-reset"') !== -1);
    PC.state.panels.sizes = false;
    var persisted = writes.length;
    return persisted;
})();

// ----------------------------------------------------------
// 11. Свои блоки: шаблон с подстановками (маркер, гандикапы…)
// ----------------------------------------------------------
(function () {
    var prevPlayerOf = global.TnMgrUI.playerOf;
    global.TnMgrUI.playerOf = function (id) { return PLAYERS.filter(function (p) { return p.id === id; })[0] || null; };
    var c = PC.state.draft.cards.filter(function (x) { return (x.playerIds || []).length === 1 && x.playerIds[0] === 'a'; })[0] ||
        { id: 'solo-a', playerIds: ['a'], names: ['Иванов Иван'], hcps: [12], fieldHcps: [10], tee: 'wh', startHole: 1, startTime: '09:00', flight: '1' };
    check('маркер игрока — из стартового листа', PC.blockText('Маркер: {marker}', c) === 'Маркер: Петров Пётр', PC.blockText('Маркер: {marker}', c));
    check('фамилия и имя маркера по отдельности', PC.blockText('{markerLast} / {markerFirst}', c) === 'Петров / Пётр', PC.blockText('{markerLast} / {markerFirst}', c));
    check('данные игрока и старта', PC.blockText('{lastName} {firstName}: л.{hole} {time} флайт {flight}', c) === 'Иванов Иван: л.1 09:00 флайт 1',
        PC.blockText('{lastName} {firstName}: л.{hole} {time} флайт {flight}', c));
    check('гандикапы в блоке', PC.blockText('{hcp}|{fieldHcp}', c) === '12|10', PC.blockText('{hcp}|{fieldHcp}', c));
    check('турнир в блоке', PC.blockText('{tournament}', c) === 'Кубок Пестово');
    check('неизвестная подстановка остаётся как есть', PC.blockText('{нет} {unknown}', c) === '{нет} {unknown}');
    var solo = { id: 'solo-c', playerIds: ['c'], names: ['Сидоров Сидор'], hcps: [18] };
    check('без маркера (сам себе) подстановка пустая', PC.blockText('Маркер: {marker}', solo) === 'Маркер: ');
    check('все подстановки описаны для панели', PC.BLOCK_PLACEHOLDERS.length >= 16 &&
        PC.BLOCK_PLACEHOLDERS.every(function (ph) { return Object.prototype.hasOwnProperty.call(PC.blockValues(c), ph.key); }));

    var ov = PC.clampOverlay({ id: 'b1', type: 'block', text: 'Маркер: {marker}', title: 'Маркер', align: 'center', border: 'bottom',
        color: '#123456', bg: 'red', bold: 1, xMm: 5, yMm: 100, wMm: 80, hMm: 8, enabled: true });
    check('тип «блок» сохраняется', ov.type === 'block');
    check('оформление блока нормализовано', ov.align === 'center' && ov.border === 'bottom' && ov.color === '#123456' && ov.bg === '' && ov.bold === true,
        JSON.stringify(ov));
    check('у прочих оверлеев нет полей блока', !('align' in PC.clampOverlay({ id: 'q', type: 'qr' })));
    PC.state.draft.overlays = [ov];
    var face = PC.cardFaceHtml(c, true);
    check('блок печатается со значениями карточки', face.indexOf('Маркер: Петров Пётр') !== -1 && face.indexOf('tnpc-ov-block bd-bottom b') !== -1);
    check('стиль блока применяется', face.indexOf('text-align:center;color:#123456;') !== -1);
    PC.state.draft.overlays = [];
    var added = PC.addBlockOverlay('marker');
    check('пресет «Маркер» добавляет блок', added.type === 'block' && added.text === 'Маркер: {marker}' && PC.state.draft.overlays.length === 1);
    var added2 = PC.addBlockOverlay('markerSign');
    check('пресет «Подпись маркера» — с рамкой', added2.border === 'box' && /\{markerLast\}/.test(added2.text));
    PC.state.panels.overlays = true;
    var panel = PC.html();
    check('в панели блока есть шаблон и подстановки', panel.indexOf('<textarea') !== -1 && panel.indexOf('data-tnm-act="tnpc-ovb-insert"') !== -1 &&
        panel.indexOf('data-key="marker"') !== -1);
    check('в панели есть кнопки добавления пресетов', panel.indexOf('data-tnm-act="tnpc-block-add"') !== -1);
    PC.state.panels.overlays = false;
    PC.state.draft.overlays = [];
    global.TnMgrUI.playerOf = prevPlayerOf;
})();

// Сохранение: блоки целиком и свои блоки переживают перезагрузку черновика.
(function () {
    var stored = { boxes: { table: { free: true, xMm: 7, yMm: 50, wMm: 120, k: 0.8 } },
        overlays: [{ id: 'b2', type: 'block', text: '{player}', xMm: 5, yMm: 5, wMm: 40, hMm: 8, enabled: true }] };
    TOURNAMENT.printScorecards = stored;
    PC.state.draft = null;
    PC.html();
    var d2 = PC.state.draft;
    check('блок «Таблица» загружается из сохранённого дизайна', d2.boxes.table.free === true && d2.boxes.table.xMm === 7 && d2.boxes.table.k === 0.8,
        JSON.stringify(d2.boxes.table));
    check('свой блок загружается из сохранённого дизайна', (d2.overlays || []).some(function (o) { return o.id === 'b2' && o.type === 'block'; }));
    PC.state.draft = null;
    TOURNAMENT.printScorecards = null;
})();

console.log('\n' + (fails ? '✗ ' + fails + ' / ' + total : 'All tn-mgr-printcards tests passed ✔ (' + total + ' checks)'));
process.exit(fails ? 1 : 0);
