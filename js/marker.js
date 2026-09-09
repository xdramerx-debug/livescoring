var mkRid = null, mkPid = null, mkRound = null;
var mkHole = 1, mkScore = 0, mkScores = {}, mkPScores = {};
var mkChanging = false;
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
    loadMk();
    mkPaceTimer = setInterval(function() {
        if (mkRound && typeof renderPaceAssistant === 'function' && typeof isBatterySaverEnabled === 'function') {
            try{ renderPaceAssistant('mk-pace-assistant', mkRound); }catch(e){}
        }
    }, (typeof isBatterySaverEnabled === 'function' && isBatterySaverEnabled()) ? 60000 : 30000);
});

function loadMk() {
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
        if (typeof renderPaceAssistant === 'function') { try{ renderPaceAssistant('mk-pace-assistant', mkRound); }catch(e){} }
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
            }catch(e){}
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

        if (typeof buildHoles === 'function') buildHoles();
        if (typeof renderHole === 'function') renderHole();
        if (typeof renderSum === 'function') renderSum();
        if (typeof checkVerify === 'function') checkVerify();
    });

    try{
        db.ref('markers/' + mkRid + '/' + mkPid).on('value', function(sn) {
            mkScores = sn.val() || {};
            if (typeof buildHoles === 'function') buildHoles();
            if (typeof renderSum === 'function') renderSum();
            if (typeof checkVerify === 'function') checkVerify();
        });
    }catch(e){}
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
        if (ps >= 1 && ms >= 1 && ps === ms) cls += ' verified';
        else if (ps >= 1 && ms >= 1) cls += ' mismatch';
        else if (ms >= 1 || ps >= 1) cls += ' done';
        html += '<button class="hole-btn ' + cls + '" onclick="goMk(' + h + ')">' +
            '<span class="hbn-line"><span class="hbn-num">' + h + '</span>' + (typeof hcpStrokesMarksHTML === 'function' ? hcpStrokesMarksHTML(mkFieldHcp, h) : '') + '</span>' +
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
    else if (ps >= 1 && ms >= 1) box.innerHTML = '<div class="verify-fail">⚠️ MISMATCH! ' + (langIsEn ? 'Player: ' : 'Игрок: ') + ps + ' | ' + (langIsEn ? 'Marker: ' : 'Маркер: ') + ms + '</div>';
    else if (ps >= 1) box.innerHTML = '<div class="verify-wait">🏌️ ' + (langIsEn ? 'Player entered: ' + ps + '. Awaiting confirmation.' : 'Игрок ввёл: ' + ps + '. Ожидает подтверждения') + '</div>';
    else box.innerHTML = '';
}

function saveMk() {
    mkChanging = true;
    var savedHole = mkHole;
    var p = (typeof dbSetWithOfflineQueue === 'function' ? dbSetWithOfflineQueue('markers/' + mkRid + '/' + mkPid + '/' + savedHole, mkScore) : (typeof db !== 'undefined' ? db.ref('markers/' + mkRid + '/' + mkPid + '/' + savedHole).set(mkScore) : Promise.resolve()));
    p.then(function() {
        mkScores[savedHole] = mkScore;
        var ps = parseInt(mkPScores[savedHole]) || 0;
        var langIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        if (ps >= 1 && ps === mkScore) {
            if (typeof dbSetWithOfflineQueue === 'function') dbSetWithOfflineQueue('rounds/' + mkRid + '/players/' + mkPid + '/verified/' + savedHole, true);
            if (typeof toast === 'function') toast(langIsEn ? '✅ Hole ' + savedHole + ' confirmed!' : '✅ Лунка ' + savedHole + ' подтверждена!');
            if (typeof vib === 'function') vib([50, 50]);
        } else if (ps >= 1) {
            if (typeof dbSetWithOfflineQueue === 'function') dbSetWithOfflineQueue('rounds/' + mkRid + '/players/' + mkPid + '/verified/' + savedHole, false);
            if (typeof toast === 'function') toast(langIsEn ? '⚠️ Mismatch!' : '⚠️ Несовпадение!', 'error');
        } else {
            if (typeof toast === 'function') toast(langIsEn ? '👁️ Waiting for player' : '👁️ Ждём игрока');
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
    }).catch(function(err){
        console.error('[marker] save failed', err);
        mkChanging = false;
        if (typeof toast === 'function') toast('Ошибка сохранения', 'error');
    });
}

function renderSum() {
    var el = mkGet('mk-sum');
    if (!el) return;
    var match = 0, mis = 0, pend = 0;
    var holeHeader = (typeof t === 'function' ? t('hole') : 'Hole');
    var parHeader = (typeof t === 'function' ? t('par') : 'Par');
    var playerHeader = (typeof t === 'function' ? t('player') : 'Player');
    var langIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var markerHeader = langIsEn ? 'Marker' : 'Маркер';
    var statusHeader = langIsEn ? 'Status' : 'Статус';

    var html = '<div style="overflow-x:auto;"><table class="scorecard"><tr><th>' + holeHeader + '</th><th>' + parHeader + '</th><th>' + playerHeader + '</th><th>' + markerHeader + '</th><th>' + statusHeader + '</th></tr>';
    for (var i = 1; i <= 18; i++) {
        var ps = parseInt(mkPScores[i]) || 0, ms = parseInt(mkScores[i]) || 0, icon = '—', bg = '';
        var misCls = '';
        if (ps >= 1 && ms >= 1 && ps === ms) { icon = '✅'; bg = 'background:rgba(46,204,113,.05);'; match++; }
        else if (ps >= 1 && ms >= 1) { icon = '⚠️'; bg = 'background:rgba(224,90,74,.08);'; mis++; misCls = ' class="cell-mismatch"'; }
        else if (ps >= 1 || ms >= 1) { icon = '⏳'; pend++; }
        html += '<tr style="' + bg + '"><td style="font-weight:700;">' + i + '</td><td>' + (typeof holePar === 'function' ? holePar(i) : 4) + '</td><td' + misCls + '>' + (ps >= 1 ? ps : '—') + '</td><td' + misCls + '>' + (ms >= 1 ? ms : '—') + '</td><td style="font-size:16px;">' + icon + '</td></tr>';
    }
    html += '</table></div>';
    html += '<div style="display:flex;gap:16px;padding:12px;font-size:13px;font-weight:700;"><span style="color:#2ecc71;">✅ ' + match + '</span><span style="color:var(--red);">⚠️ ' + mis + '</span><span style="color:var(--gold);">⏳ ' + pend + '</span></div>';
    el.innerHTML = html;
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
