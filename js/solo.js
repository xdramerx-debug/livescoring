// ═════════════════════════════════════════════════════════════════
// ОДИНОЧНЫЙ РАУНД — СЛОЙ СОВМЕСТИМОСТИ (v1.126.0)
// ─────────────────────────────────────────────────────────────────
// До v1.126.0 одиночный раунд был отдельной подсистемой: своя форма
// создания (startSolo), своя разметка (#game), свой экран ввода счёта,
// своя запись (saveSolo) и своё завершение (finishSolo). Групповой раунд
// жил в js/live.js своей жизнью. Две подсистемы расходились: правки в
// одной не попадали в другую (пауза, темп, карточки, гандикапы).
//
// Теперь страница одна — setup-round.html:
//   • создание раунда — единая форма (js/round-setup.js) и одна точка
//     входа pestovoCreateRound() в js/live.js; режим выводится из состава
//     (1 игрок → mode='solo', 2+ → mode='group');
//   • ввод результатов — единый экран #active-scoring-view (js/live.js)
//     и одна запись saveHoleScores(); отсутствие маркера означает, что
//     счёт финальный сразу;
//   • просмотр — единый #group-view; завершение — finishGroupRound().
//
// Этот файл оставлен только как совместимый слой: на его имена ссылаются
// старые QR-ссылки, js/live.js и js/utils.js. Никакой собственной логики
// ввода счёта здесь больше нет — дублировать её нельзя.
// ═════════════════════════════════════════════════════════════════

// Права на ввод счёта объявляет и поддерживает единый движок
// (js/live.js: canEditGroup + алиас canEditSolo). Своей копии здесь нет,
// чтобы два значения не разъехались.

// Историческое имя создания раунда. Всегда идёт через единую точку входа:
// состав берётся из единой формы, режим определяется по числу игроков.
function startSolo() {
    if (typeof pestovoCreateRound === 'function') return pestovoCreateRound();
    if (typeof startGroup === 'function') return startGroup();
}

// Открыть существующий раунд (одиночный или групповой) единым движком.
// Сохранено для старых ссылок/скриптов, которые звали bootSoloRoundView().
function bootSoloRoundView(rid) {
    if (!rid) return;
    if (typeof curRid === 'undefined' || typeof bootRoundViewOnce !== 'function') return;
    if (window._pestovoSoloBooted === rid) return;
    window._pestovoSoloBooted = rid;
    curRid = rid;
    if (typeof roundViewListening !== 'undefined') roundViewListening = false;
    bootRoundViewOnce();
}

// Хук готовности авторизации (его вызывает js/live.js): заполняем пустые
// поля первой карточки игрока в единой форме создания раунда.
function soloAuthReady(u, d) {
    if (!u || !d) return;
    try {
        if (typeof applyUnifiedUserDefaults === 'function') applyUnifiedUserDefaults();
    } catch (e) { console.warn('[silent]', e); }
}
