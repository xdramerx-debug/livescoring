// js/score-display.js — общий вывод результата лунки для карточки счёта.
//
// updDisp() была продублирована в js/marker.js и js/scorer.js побайтово
// (по 823 байта), а все 24 отличия — чистые переименования префикса страницы:
// mkRound/mkGet/mkHole против scRound/scGet/scHole. Это самый безопасный из
// оставшихся дубликатов (docs/CODE-REVIEW.md, раздел 3): логика одна, только
// переменные разные, поэтому объединение — параметризация, а не redesign.
//
// Реализация лежит здесь; в marker.js и scorer.js остаются тонкие адаптеры,
// которые только подставляют глобалы своей страницы. Расходиться больше нечему.
//
// Модуль грузится ДО marker.js/scorer.js на marker.html и scorer.html.
'use strict';

/**
 * Обновить блок «счёт / результат лунки» на карточке.
 *
 * @param {Object} ctx
 * @param {number} ctx.hole     номер лунки (mkHole / scHole)
 * @param {Object} ctx.round    объект раунда (mkRound / scRound)
 * @param {string} ctx.pid      id игрока внутри раунда (mkPid / scPid)
 * @param {number} ctx.score    текущий счёт за лунку (mkScore / scScore)
 * @param {Function} ctx.get    доступ к узлу по id (mkGet / scGet)
 * @param {string} ctx.dispId   id блока счёта ('mk-disp' / 'sc-disp')
 * @param {string} ctx.resultId id блока результата ('mk-result' / 'sc-result')
 */
function pestovoUpdScoreDisplay(ctx) {
    var par = (typeof holePar === 'function' ? holePar(ctx.hole) : 4);
    var round = ctx.round;
    var player = round && round.players ? round.players[ctx.pid] : null;
    var fieldHcp = player && player.fieldHcp !== undefined
        ? player.fieldHcp : ((round && round.fieldHcp) || 0);
    var disp = ctx.get(ctx.dispId);
    if (disp && typeof scoreWithStablefordHTML === 'function' && typeof isPlayerStablefordDisplayEnabled === 'function') {
        disp.innerHTML = scoreWithStablefordHTML(ctx.score, ctx.hole, fieldHcp, isPlayerStablefordDisplayEnabled(player));
    }
    var r = ctx.get(ctx.resultId);
    if (r) {
        if (typeof holeResName === 'function') r.textContent = holeResName(ctx.score, par);
        if (typeof holeResClass === 'function') r.className = 'score-result ' + holeResClass(ctx.score, par);
    }
}

/**
 * Блок сверки: счёт игрока против счёта маркера (mk-verify / sc-verify).
 *
 * Копии в marker.js и scorer.js разошлись не переименованиями, а смыслом:
 * маркер показывает третье состояние — «игрок ввёл, ждём подтверждения»,
 * скорер — нет (там это уведомление на 3 секунды при сохранении, отдельный
 * блок в комментарии кода назван лишним). Поэтому состояния сверки общие,
 * а тексты и видимость «ожидания» задаёт страница.
 *
 * @param {Object} ctx
 * @param {Element} ctx.box            контейнер (mkGet('mk-verify') / scGet('sc-verify'))
 * @param {*} ctx.playerScore          счёт игрока на лунке
 * @param {*} ctx.markerScore          счёт маркера на лунке
 * @param {Function} ctx.matched       подпись при совпадении: (n) => текст
 * @param {Function} ctx.playerLabel   подпись счёта игрока при расхождении
 * @param {Function} ctx.markerLabel   подпись счёта маркера при расхождении
 * @param {Function} [ctx.waiting]     подпись ожидания: если не передана —
 *                                     третье состояние не показывается
 */
function pestovoCheckVerify(ctx) {
    var box = ctx.box;
    if (!box) return;
    var ps = parseInt(ctx.playerScore, 10) || 0;
    var ms = parseInt(ctx.markerScore, 10) || 0;
    if (ps >= 1 && ms >= 1 && ps === ms) {
        box.innerHTML = '<div class="verify-ok">✅ ' + ctx.matched(ps) + '</div>';
    } else if (ps >= 1 && ms >= 1) {
        box.innerHTML = '<div class="verify-fail">⚠️ MISMATCH! ' + ctx.playerLabel(ps) +
            ' | ' + ctx.markerLabel(ms) + '</div>';
    } else if (ps >= 1 && ctx.waiting) {
        box.innerHTML = '<div class="verify-wait">🏌️ ' + ctx.waiting(ps) + '</div>';
    } else {
        box.innerHTML = '';
    }
}

if (typeof window !== 'undefined') {
    window.pestovoUpdScoreDisplay = pestovoUpdScoreDisplay;
    window.pestovoCheckVerify = pestovoCheckVerify;
}
