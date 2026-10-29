// js/score-pad.js — клавиатура счёта, проверка «странного» результата,
// отмена последней лунки, крупный UI. Общий для scorer / marker / setup-round.
'use strict';

function pestovoPadIsEn() {
    return typeof currentLang !== 'undefined' && currentLang === 'en';
}

function pestovoScoreIsUnusual(score, par) {
    score = parseInt(score, 10) || 0;
    par = parseInt(par, 10) || 4;
    if (score < 1) return false;
    return score === 1 || score >= par + 3 || score >= 8;
}

function pestovoConfirmUnusualScore(score, par, hole) {
    score = parseInt(score, 10) || 0;
    par = parseInt(par, 10) || 4;
    hole = parseInt(hole, 10) || 0;
    if (!pestovoScoreIsUnusual(score, par)) return Promise.resolve(true);
    var isEn = pestovoPadIsEn();
    var text = isEn
        ? ('Hole ' + hole + ': ' + score + ' strokes (par ' + par + '). Save this score?')
        : ('Лунка ' + hole + ': ' + score + ' уд. (пар ' + par + '). Сохранить этот счёт?');
    if (typeof uiConfirm === 'function') {
        return uiConfirm({
            title: isEn ? 'Check the score' : 'Проверьте счёт',
            text: text,
            confirmLabel: isEn ? 'Save' : 'Сохранить',
            cancelLabel: isEn ? 'Back' : 'Назад',
            danger: score >= par + 3 || score >= 8
        });
    }
    return Promise.resolve(typeof confirm === 'function' ? confirm(text) : true);
}

function pestovoPadContext() {
    var scBody = typeof document !== 'undefined' ? document.getElementById('sc-body') : null;
    if (scBody && !scBody.classList.contains('hidden') && typeof scScore === 'number') return 'sc';
    var mkBody = typeof document !== 'undefined' ? document.getElementById('mk-body') : null;
    if (mkBody && !mkBody.classList.contains('hidden') && typeof mkScore === 'number') return 'mk';
    if (typeof myScore === 'number') return 'play';
    if (typeof scScore === 'number') return 'sc';
    if (typeof mkScore === 'number') return 'mk';
    return null;
}

function pestovoPadCurrentPar() {
    var hole = 1;
    var ctx = pestovoPadContext();
    if (ctx === 'sc' && typeof scHole === 'number') hole = scHole;
    else if (ctx === 'mk' && typeof mkHole === 'number') hole = mkHole;
    else if (typeof playHole === 'number') hole = playHole;
    return typeof holePar === 'function' ? holePar(hole) : 4;
}

function pestovoPadApply(n) {
    n = Math.max(1, Math.min(15, parseInt(n, 10) || 0));
    if (!(n >= 1)) return;
    var ctx = pestovoPadContext();
    if (ctx === 'sc') {
        scScore = n;
        if (typeof updDisp === 'function') updDisp();
        if (typeof animateScoreElement === 'function') animateScoreElement('sc-disp');
    } else if (ctx === 'mk') {
        mkScore = n;
        if (typeof updDisp === 'function') updDisp();
        if (typeof animateScoreElement === 'function') animateScoreElement('mk-disp');
    } else if (ctx === 'play') {
        var who = window.pestovoPadTarget === 'mark' ? 'mark' : 'my';
        if (who === 'mark' && typeof targetScore === 'number') {
            targetScore = n;
            if (typeof updScoreDisplay === 'function') updScoreDisplay('mark', targetScore);
            if (typeof animateScoreElement === 'function') animateScoreElement('mark-disp');
        } else {
            myScore = n;
            if (typeof updScoreDisplay === 'function') updScoreDisplay('my', myScore);
            if (typeof animateScoreElement === 'function') animateScoreElement('my-disp');
        }
        if (typeof updateDualCompare === 'function') updateDualCompare();
    }
    if (typeof vib === 'function') vib();
}

function setScorePad(n) {
    pestovoPadApply(n);
}

function setScorePadPar() {
    pestovoPadApply(pestovoPadCurrentPar());
}

function pestovoLastSavedHole(scores, order) {
    var last = null;
    (order || []).forEach(function (h) {
        if (parseInt(scores && scores[h], 10) >= 1) last = h;
    });
    return last;
}

function undoLastHole() {
    var isEn = pestovoPadIsEn();
    var ctx = pestovoPadContext();
    var order, scores, rid, pid, kind, actor;
    if (ctx === 'sc' && scRound && scPid) {
        order = typeof getRoundOrder === 'function' ? getRoundOrder(scRound) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
        scores = (scRound.players[scPid] && scRound.players[scPid].scores) || {};
        rid = scRid; pid = scPid; kind = 'score'; actor = scPid;
    } else if (ctx === 'mk' && mkRound && mkPid) {
        order = typeof getRoundOrder === 'function' ? getRoundOrder(mkRound) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
        scores = mkScores || {};
        rid = mkRid; pid = mkPid; kind = 'marker';
        actor = (mkRound.players[mkPid] && mkRound.players[mkPid].markedBy) ||
            (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) || null;
    } else if (ctx === 'play' && typeof curRoundData !== 'undefined' && curRoundData && typeof myUid !== 'undefined') {
        order = typeof getRoundOrder === 'function' ? getRoundOrder(curRoundData) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
        scores = (curRoundData.players[myUid] && curRoundData.players[myUid].scores) || {};
        rid = curRid; pid = myUid; kind = 'score'; actor = myUid;
    } else {
        if (typeof toast === 'function') toast(isEn ? 'Nothing to undo' : 'Нечего отменять', 'info');
        return;
    }
    var last = pestovoLastSavedHole(scores, order);
    if (!last) {
        if (typeof toast === 'function') toast(isEn ? 'No saved hole yet' : 'Нет сохранённой лунки', 'info');
        return;
    }
    var ask = isEn
        ? ('Clear the score on hole ' + last + '?')
        : ('Удалить счёт на лунке ' + last + '?');
    var go = function (ok) {
        if (!ok) return;
        if (typeof pestovoScoreWrite !== 'function') return;
        pestovoScoreWrite(rid, [{ kind: kind, playerId: pid, hole: last, score: null }], actor).then(function () {
            if (ctx === 'sc') {
                if (scRound.players[scPid].scores) delete scRound.players[scPid].scores[last];
                scHole = last; scScore = 0;
                if (typeof renderHole === 'function') renderHole();
                if (typeof buildHoles === 'function') buildHoles();
                if (typeof renderCard === 'function') renderCard();
            } else if (ctx === 'mk') {
                delete mkScores[last];
                mkHole = last; mkScore = 0;
                if (typeof renderHole === 'function') renderHole();
                if (typeof buildHoles === 'function') buildHoles();
            } else if (ctx === 'play' && typeof goPlayHole === 'function') {
                goPlayHole(last);
            }
            if (typeof toast === 'function') toast(isEn ? ('Hole ' + last + ' cleared') : ('Лунка ' + last + ': счёт снят'), 'success');
            if (typeof vib === 'function') vib([30, 40, 30]);
        }).catch(function () {
            if (typeof toast === 'function') toast(isEn ? 'Could not undo' : 'Не удалось отменить', 'error');
        });
    };
    if (typeof uiConfirm === 'function') {
        uiConfirm({
            title: isEn ? 'Undo last hole' : 'Отменить последнюю лунку',
            text: ask,
            confirmLabel: isEn ? 'Clear' : 'Удалить',
            cancelLabel: isEn ? 'Back' : 'Назад',
            danger: true
        }).then(go);
    } else go(true);
}

function toggleLargeUi() {
    var on = false;
    try { on = localStorage.getItem('pestovo_large_ui') === '1'; } catch (e) { on = false; }
    try { localStorage.setItem('pestovo_large_ui', on ? '0' : '1'); } catch (e) { /* ignore */ }
    if (typeof applyPlayerModes === 'function') applyPlayerModes();
    if (typeof toast === 'function') {
        toast(pestovoPadIsEn()
            ? (on ? 'Compact numbers' : 'Large numbers on')
            : (on ? 'Обычный размер' : 'Крупные цифры'), 'info');
    }
}

function applyLbTvMode() {
    try {
        var q = new URLSearchParams(window.location.search || '');
        if (q.get('tv') === '1' && document.body) {
            document.documentElement.classList.add('lb-tv');
            document.body.classList.add('lb-tv');
        }
    } catch (e) { /* ignore */ }
}

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () {
        applyLbTvMode();
        document.querySelectorAll('.dual-half--my').forEach(function (el) {
            el.addEventListener('click', function () { window.pestovoPadTarget = 'my'; });
        });
        document.querySelectorAll('.dual-half--mark').forEach(function (el) {
            el.addEventListener('click', function () { window.pestovoPadTarget = 'mark'; });
        });
    });
}
