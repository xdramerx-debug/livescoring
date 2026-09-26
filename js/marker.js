var mkRid = null, mkPid = null, mkRound = null;
var mkHole = 1, mkScore = 0, mkScores = {}, mkPScores = {};
var mkChanging = false;
var mkSaving = false;
var mkPaceTimer = null;

function mkGet(id){ try{ return document.getElementById(id); }catch(e){ return null; } }

document.addEventListener('pestovo-stableford-default-change', function() {
    if (mkRound && typeof updDisp === 'function') updDisp();
});

document.addEventListener('DOMContentLoaded', function() {
    if (typeof initNav === 'function') initNav();
    var p = new URLSearchParams(window.location.search);
    mkRid = p.get('round'); mkPid = p.get('player');
    if (!mkRid || !mkPid) {
        var errEl = mkGet('mk-err'); if (errEl) errEl.classList.remove('hidden');
        return;
    }
    if (!(typeof pestovoQrAuthPending !== 'undefined' && pestovoQrAuthPending)) loadMk();
    if (mkPaceTimer) { clearInterval(mkPaceTimer); mkPaceTimer = null; }
    mkPaceTimer = setInterval(function() {
        if (mkRound && typeof renderPaceAssistant === 'function' && typeof isBatterySaverEnabled === 'function') {
            try{ renderPaceAssistant('mk-pace-assistant', mkRound); }catch (e) { console.warn("[silent]", e); }
        }
    }, (typeof isBatterySaverEnabled === 'function' && isBatterySaverEnabled()) ? 60000 : 30000);
});

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', function() {
        if (mkPaceTimer) { clearInterval(mkPaceTimer); mkPaceTimer = null; }
    });
}

function onAuthReady(user, data) {
    if (typeof navAuth === 'function') navAuth(user, data);
    if (user && mkRid && mkPid && !(typeof pestovoQrAuthPending !== 'undefined' && pestovoQrAuthPending)) loadMk();
}

var mkLoadStarted = false;
function loadMk() {
    if (mkLoadStarted) return;
    mkLoadStarted = true;
    if (typeof db === 'undefined') {
        var errEl = mkGet('mk-err'); if (errEl) errEl.classList.remove('hidden');
        return;
    }
    db.ref('rounds/' + mkRid).on('value', function(sn) {
        mkRound = sn.val();
        if (!mkRound || !mkRound.players || !mkRound.players[mkPid]) {
            var e1 = mkGet('mk-err'); if (e1) e1.classList.remove('hidden');
            var b1 = mkGet('mk-body'); if (b1) b1.classList.add('hidden');
            return;
        }
        var e2 = mkGet('mk-err'); if (e2) e2.classList.add('hidden');
        var b2 = mkGet('mk-body'); if (b2) b2.classList.remove('hidden');

        var pl = mkRound.players[mkPid];
        var playerTee = (pl && pl.tee) || (mkRound && mkRound.tee) || 'wh';
        var prefix = (typeof t === 'function' ? t('marker_for') : 'Marker for');
        var titleEl = mkGet('mk-title'); if (titleEl) titleEl.textContent = prefix + ': ' + (pl.name || (typeof t === 'function' ? t('player') : 'Player'));
        var subEl = mkGet('mk-sub'); if (subEl) subEl.textContent = (typeof t === 'function' ? t('tee_select') : 'Tee') + ': ' + (typeof fmtTeePill === 'function' ? fmtTeePill(playerTee) : playerTee);
        mkPScores = pl.scores || {};
        if (typeof renderPaceAssistant === 'function') { try{ renderPaceAssistant('mk-pace-assistant', mkRound); }catch (e) { console.warn("[silent]", e); } }
        if (typeof listenForOfficialCallState === 'function') {
            try{
                listenForOfficialCallState({
                    roundId: mkRid,
                    playerId: mkPid,
                    prefix: 'mk',
                    canEdit: true,
                    hole: function() { return mkHole; },
                    playerName: 'Marker (' + (pl.name || 'Player') + ')',
                    flightMembers: []
                });
            }catch (e) { console.warn("[silent]", e); }
        }

        if (!mkChanging) {
            var order = (typeof getRoundOrder === 'function' ? getRoundOrder(mkRound) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
            var savedResumeHole = (typeof getSavedResumeHole === 'function' ? getSavedResumeHole(mkRid, mkPid, order, pl) : null);
            if (savedResumeHole) {
                mkHole = savedResumeHole;
            } else {
                var found = false;
                for (var i = 0; i < order.length; i++) {
                    if (!(parseInt(mkScores[order[i]]) >= 1)) { mkHole = order[i]; found = true; break; }
                }
                if (!found) mkHole = order[order.length - 1];
            }
        }

        // Во время ввода/записи полную перерисовку не запускаем (см. scorer.js):
        // каждый set() возвращается в listener и на быстрых нажатиях замораживал страницу.
        if (!mkChanging && !mkSaving) {
            if (typeof buildHoles === 'function') buildHoles();
            if (typeof renderHole === 'function') renderHole();
            if (typeof renderSum === 'function') renderSum();
            if (typeof checkVerify === 'function') checkVerify();
        }
    });

    try{
        db.ref('markers/' + mkRid + '/' + mkPid).on('value', function(sn) {
            mkScores = sn.val() || {};
            if (typeof buildHoles === 'function') buildHoles();
            if (typeof renderSum === 'function') renderSum();
            if (typeof checkVerify === 'function') checkVerify();
        });
    }catch (e) { console.warn("[silent]", e); }
}

function buildHoles() {
    var el = mkGet('mk-holes');
    if (!el) return;
    if (!mkRound) return;
    var order = (typeof getRoundOrder === 'function' ? getRoundOrder(mkRound) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
    var mkPlayer = (mkRound && mkRound.players && mkRound.players[mkPid]) || {};
    var mkFieldHcp = mkPlayer.fieldHcp !== undefined ? mkPlayer.fieldHcp : ((mkRound && mkRound.fieldHcp) || 0);
    var html = '';
    order.forEach(function(h) {
        var ps = parseInt(mkPScores[h]) || 0, ms = parseInt(mkScores[h]) || 0;
        var cls = h === mkHole ? 'active' : '';
        // confirmed — зелёная, mismatch — мигает красным, введён один счёт — мигает серым
        if (ps >= 1 && ms >= 1 && ps === ms) cls += ' verified';
        else if (ps >= 1 && ms >= 1) cls += ' mismatch';
        else if (ms >= 1 || ps >= 1) cls += ' pending';
        // Текущая лунка, где маркер ещё не ввёл счёт, мигает серым.
        if (h === mkHole && !(ms >= 1)) cls += ' cur-blink';
        html += '<button class="hole-btn ' + cls + '" onclick="goMk(' + h + ')">' +
            '<span class="hbn-line"><span class="hbn-num">' + h + '</span>' + (typeof hcpStrokesMarksHTML === 'function' ? hcpStrokesMarksHTML(mkFieldHcp, h) : '') + '</span>' +
            (typeof hbnScoresHtml === 'function' ? hbnScoresHtml(ps, ms) : '') +
            '</button>';
    });
    el.innerHTML = html;
}

function goMk(h) {
    mkChanging = true;
    mkHole = h; mkScore = 0;
    if (typeof rememberResumeHole === 'function') rememberResumeHole(mkRid, mkPid, h);
    if (typeof renderHole === 'function') renderHole();
    if (typeof checkVerify === 'function') checkVerify();
    setTimeout(function() { mkChanging = false; }, 100);
}

function renderHole() {
    var par = (typeof holePar === 'function' ? holePar(mkHole) : 4);
    var holeEl = mkGet('mk-hole'); if (holeEl) holeEl.textContent = mkHole;
    var parEl = mkGet('mk-par'); if (parEl) parEl.textContent = par;
    var saved = parseInt(mkScores[mkHole]) || 0;
    mkScore = saved >= 1 ? saved : par;
    if (typeof updDisp === 'function') updDisp();
}

function adjMk(d) {
    mkScore = Math.max(1, Math.min(15, mkScore + d));
    if (typeof vib === 'function') vib();
    if (typeof updDisp === 'function') updDisp();
    if (typeof animateScoreElement === 'function') animateScoreElement('mk-disp');
}

function updDisp() {
    var par = (typeof holePar === 'function' ? holePar(mkHole) : 4);
    var player = mkRound && mkRound.players ? mkRound.players[mkPid] : null;
    var fieldHcp = player && player.fieldHcp !== undefined
        ? player.fieldHcp : ((mkRound && mkRound.fieldHcp) || 0);
    var disp = mkGet('mk-disp');
    if (disp && typeof scoreWithStablefordHTML === 'function' && typeof isPlayerStablefordDisplayEnabled === 'function') {
        disp.innerHTML = scoreWithStablefordHTML(mkScore, mkHole, fieldHcp, isPlayerStablefordDisplayEnabled(player));
    }
    var r = mkGet('mk-result');
    if (r) {
        if (typeof holeResName === 'function') r.textContent = holeResName(mkScore, par);
        if (typeof holeResClass === 'function') r.className = 'score-result ' + holeResClass(mkScore, par);
    }
}

function checkVerify() {
    var box = mkGet('mk-verify');
    if (!box) return;
    var ps = parseInt(mkPScores[mkHole]) || 0, ms = parseInt(mkScores[mkHole]) || 0;
    var langIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    if (ps >= 1 && ms >= 1 && ps === ms) box.innerHTML = '<div class="verify-ok">✅ ' + (langIsEn ? 'Matched: ' + ps : 'Совпадает: ' + ps + ' уд.') + '</div>';
    else if (ps >= 1 && ms >= 1) box.innerHTML = '<div class="verify-fail">⚠️ MISMATCH! ' + (langIsEn ? 'Player: ' : 'Игрок: ') + esc(ps) + ' | ' + (langIsEn ? 'Marker: ' : 'Маркер: ') + esc(ms) + '</div>';
    else if (ps >= 1) box.innerHTML = '<div class="verify-wait">🏌️ ' + (langIsEn ? 'Player entered: ' + esc(ps) + '. Awaiting confirmation.' : 'Игрок ввёл: ' + esc(ps) + '. Ожидает подтверждения') + '</div>';
    else box.innerHTML = '';
}

function mkSetSaving(on) {
    mkSaving = !!on;
    var btn = mkGet('mk-save-btn');
    if (btn) btn.disabled = !!on;
}

// Игрок, за которого вводит маркер, уже сдал карточку — подтверждение по
// закрытой карточке не принимается (см. scorer.js).
function mkTargetClosed() {
    if (!mkRound || !mkPid) return false;
    if (typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(mkRound, mkPid)) return true;
    if (typeof isRoundOpenForScoring === 'function') return !isRoundOpenForScoring(mkRound, Date.now(), mkPid);
    return false;
}

function saveMk() {
    // Защита от «пулемётного» нажатия кнопки (см. scorer.js).
    if (mkSaving) return;
    if (mkTargetClosed()) {
        var isEnMk = (typeof currentLang !== 'undefined' && currentLang === 'en');
        if (typeof toast === 'function') toast(isEnMk
            ? '🔒 This player has already finished the round — the card is closed.'
            : '🔒 Игрок уже завершил раунд — карточка закрыта.', 'info');
        return;
    }
    mkSaving = true;
    mkSetSaving(true);
    mkChanging = true;
    var savedHole = mkHole;
    var markerActor = (mkRound.players[mkPid] && mkRound.players[mkPid].markedBy) ||
        (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) || null;
    var p = pestovoScoreWrite(mkRid, [{kind:'marker',playerId:mkPid,hole:savedHole,score:mkScore}], markerActor);
    p.then(function(res) {
        if (res && res.offline) {
            var pendingOrder = getRoundOrder(mkRound);
            var pendingIdx = pendingOrder.indexOf(savedHole);
            if (pendingIdx >= 0 && pendingIdx < pendingOrder.length - 1) { mkHole = pendingOrder[pendingIdx + 1]; mkScore = 0; }
            renderHole(); buildHoles(); renderSum();
            mkChanging = false; mkSetSaving(false);
            return;
        }
        mkScores[savedHole] = mkScore;
        var ps = parseInt(mkPScores[savedHole]) || 0;
        var langIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        if (ps >= 1 && ps === mkScore) {

            if (typeof toast === 'function') toast(langIsEn ? ('✅ <b>Hole ' + savedHole + ' confirmed:</b> ' + mkScore) : ('✅ <b>Лунка ' + savedHole + ' подтверждена:</b> ' + mkScore + ' уд.'));
            if (typeof vib === 'function') vib([50, 50]);
        } else if (ps >= 1) {

            if (typeof toast === 'function') toast(langIsEn ? ('⚠️ <b>Mismatch on hole ' + savedHole + '!</b><br>Player: <b>' + ps + '</b>, marker (you): <b>' + mkScore + '</b>') : ('⚠️ <b>Несовпадение на лунке ' + savedHole + '!</b><br>Игрок: <b>' + ps + '</b>, маркер (вы): <b>' + mkScore + '</b>'), 'error');
        } else {
            if (typeof toast === 'function') toast(langIsEn ? ('👁️ <b>Hole ' + savedHole + ':</b> marker score <b>' + mkScore + '</b> saved. Waiting for player.') : ('👁️ <b>Лунка ' + savedHole + ':</b> счёт маркера <b>' + mkScore + '</b> сохранён. Ждём игрока.'), 'info');
            if (typeof vib === 'function') vib();
        }
        var order = (typeof getRoundOrder === 'function' ? getRoundOrder(mkRound) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
        var idx = order.indexOf(savedHole);
        if (idx >= 0 && idx < order.length - 1) { mkHole = order[idx + 1]; mkScore = 0; }
        if (typeof renderHole === 'function') renderHole();
        if (typeof buildHoles === 'function') buildHoles();
        if (typeof renderSum === 'function') renderSum();
        if (typeof checkVerify === 'function') checkVerify();
        setTimeout(function() { mkChanging = false; }, 200);
        mkSetSaving(false);
    }).catch(function(err){
        console.error('[marker] save failed', err);
        mkChanging = false;
        mkSetSaving(false);
        if (typeof toast === 'function') toast('Ошибка сохранения', 'error');
    });
}

function renderSum() {
    var el = mkGet('mk-sum');
    if (!el) return;
    var match = 0, mis = 0, pend = 0;
    if (!mkRound || !mkRound.players || !mkRound.players[mkPid]) return;
    getRoundOrder(mkRound).forEach(function(h) {
        var ps = parseInt(mkPScores[h], 10) || 0, ms = parseInt(mkScores[h], 10) || 0;
        if (ps > 0 && ms > 0) { if (ps === ms) match++; else mis++; }
        else if (ps > 0 || ms > 0) pend++;
    });
    var player = Object.assign({}, mkRound.players[mkPid], { scores: mkPScores });
    el.innerHTML = renderClubScorecard(player, mkRound, { playerId: mkPid, showMarker: true, markerScores: mkScores }) +
        '<div style="display:flex;gap:16px;padding:12px;font-size:13px;">✅ ' + match + ' · ⚠️ ' + mis + ' · ⏳ ' + pend + '</div>';
}

function callOfficial(type) {
    if (!mkRound || !mkPid) return;
    if (typeof requestOfficialCall !== 'function') return;
    var pName = (mkRound.players[mkPid] && mkRound.players[mkPid].name) || 'Player';
    requestOfficialCall({
        roundId: mkRid,
        playerId: mkPid,
        prefix: 'mk',
        type: type,
        hole: function() { return mkHole; },
        playerName: 'Marker (' + pName + ')',
        flightMembers: [],
        canEdit: true,
        onSent: function(call) {
            if (typeof sendTelegramOfficialAlert === 'function') sendTelegramOfficialAlert(type, call.hole, call.playerName, []);
            if (typeof sendVKOfficialAlert === 'function') sendVKOfficialAlert(type, call.hole, call.playerName, []);
            if (typeof toast === 'function' && typeof getOfficialRoleName === 'function') toast('🚨 ' + getOfficialRoleName(type) + ((typeof currentLang !== 'undefined' && currentLang === 'en') ? ' called to hole ' : ' вызван на лунку ') + call.hole + '!', 'warn');
            if (typeof vib === 'function') vib([100, 50, 100]);
        }
    });
}
