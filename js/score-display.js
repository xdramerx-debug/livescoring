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

const PESTOVO_DEFAULT_HOLE_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

/**
 * Лента лунок на карточке: кнопка на лунку с её состоянием.
 *
 * Копии в marker.js, scorer.js и solo.js разошлись не переименованиями, а
 * тем, ЧЕЙ счёт считается «введённым». У маркера это его собственный счёт
 * (он подтверждающий), у игрока — его собственный (ждёт подтверждения
 * маркера), а в одиночном раунде маркера нет вообще: вместо
 * verified/mismatch/pending там одна метка done. Поэтому состояния считает
 * страница (ctx.stateClass), а разметка кнопки общая.
 *
 * @param {Object} ctx
 * @param {Element} ctx.el          контейнер ленты (mk-holes / sc-holes / play-holes-nav)
 * @param {Object} ctx.round        объект раунда — по нему считается порядок лунок
 * @param {number} ctx.currentHole  открытая лунка
 * @param {number} ctx.fieldHcp     гандикап поля игрока — уходит в квадрат счёта
 * @param {string} ctx.go           имя обработчика перехода ('goMk'/'goSc'/'goHole')
 * @param {Function} ctx.playerScore  (hole) => счёт игрока
 * @param {Function} [ctx.markerScore] (hole) => счёт маркера; нет — значит нет и маркера
 * @param {Function} ctx.stateClass   (hole, playerScore, markerScore) => ' классы через пробел'
 */
function pestovoBuildHoles(ctx) {
    var el = ctx.el;
    if (!el) return;
    var order = (typeof getRoundOrder === 'function' ? getRoundOrder(ctx.round) : PESTOVO_DEFAULT_HOLE_ORDER);
    var html = '';
    order.forEach(function (h) {
        var s = parseInt(ctx.playerScore(h), 10) || 0;
        var ms = parseInt(ctx.markerScore ? ctx.markerScore(h) : 0, 10) || 0;
        var state = ctx.stateClass(h, s, ms) || '';
        var active = h === ctx.currentHole;
        // Не onclick=, а делегирование: данные в data-атрибутах, один слушатель
        // на document в js/ui-events.js. Так CSP обходится без 'unsafe-inline'.
        html += '<button type="button" class="hole-btn' + (active ? ' active' : '') + state +
            '" data-act="' + ctx.go + '" data-arg="' + h + '" aria-label="' +
            (currentLang === 'en' ? 'Hole ' : 'Лунка ') + h + '" aria-pressed="' +
            (active ? 'true' : 'false') + '">' +
            entryHoleContentHTML(s, ms, h, ctx.fieldHcp) + '</button>';
    });
    el.innerHTML = html;
}

/**
 * Перерисовать шапку лунки: номер, пар, дальность и дедлайн, а заодно
 * выставить текущий счёт (сохранённый или par).
 *
 * Раньше функция жила копиями в marker.js (378 байт) и scorer.js (1244 байта):
 * у скорера дополнительно есть дальность до лунки (нужна чашка игрока) и
 * дедлайн с учётом пауз. Разница — не переименования, а состав шапки, поэтому
 * ids.dist/ids.dl необязательны: чего на странице нет, то не рисуем.
 *
 * @param {Object} ctx
 * @param {number} ctx.hole        номер лунки (mkHole / scHole)
 * @param {Object} ctx.round       объект раунда (mkRound / scRound)
 * @param {string} ctx.pid         id игрока внутри раунда (mkPid / scPid)
 * @param {Function} ctx.get       доступ к узлу по id (mkGet / scGet)
 * @param {Object} ctx.ids         { hole, par, dist?, dl? } — id узлов шапки
 * @param {string} [ctx.tee]       чашка игрока для дальности ('wh' по умолчанию)
 * @param {Function} ctx.setScore  (value) — записать счёт в глобал страницы
 * @param {Function} ctx.update    () — обновить блок счёта (updDisp страницы)
 * @param {boolean} [ctx.strict]   без игрока в раунде шапку не продолжать
 *                                 (поведение scorer.js; marker.js показывал par)
 */
function pestovoRenderHole(ctx) {
    var par = (typeof holePar === 'function' ? holePar(ctx.hole) : 4);
    var holeEl = ctx.get(ctx.ids.hole);
    if (holeEl) holeEl.textContent = ctx.hole;
    var parEl = ctx.get(ctx.ids.par);
    if (parEl) parEl.textContent = par;

    if (ctx.ids.dist) {
        var distEl = ctx.get(ctx.ids.dist);
        if (distEl) {
            distEl.textContent = (typeof holeDist === 'function' ? holeDist(ctx.hole, ctx.tee) : '—') || '—';
        }
    }
    // Дедлайн с учётом пауз раунда: пауза продлевает план, а не «съедается».
    if (ctx.ids.dl) {
        var dlEl = ctx.get(ctx.ids.dl);
        if (dlEl && typeof fmtTime === 'function' && ctx.round) {
            var dlTs = (typeof roundHoleDeadlineTs === 'function')
                ? roundHoleDeadlineTs(ctx.round, ctx.hole)
                : (typeof holeDeadline === 'function'
                    ? holeDeadline(ctx.round.startTime, ctx.round.startHole, ctx.hole) : null);
            dlEl.textContent = dlTs ? fmtTime(dlTs) : '—';
        }
    }

    var player = ctx.round && ctx.round.players ? ctx.round.players[ctx.pid] : null;
    if (!player && ctx.strict) return;
    var scores = player ? (player.scores || {}) : {};
    var saved = parseInt(scores[ctx.hole]) || 0;
    ctx.setScore(saved >= 1 ? saved : par);
    if (typeof ctx.update === 'function') ctx.update();
}

if (typeof window !== 'undefined') {
    window.pestovoUpdScoreDisplay = pestovoUpdScoreDisplay;
    window.pestovoCheckVerify = pestovoCheckVerify;
    window.pestovoBuildHoles = pestovoBuildHoles;
    window.pestovoRenderHole = pestovoRenderHole;
}
