var scRid = null, scPid = null, scRound = null;
var scHole = 1, scScore = 0, scMarker = {};
var scChanging = false;
var scSaving = false;
var scPaceTimer = null;

function scGet(id){ try{ return document.getElementById(id); }catch(e){ return null; } }

function isScoreKioskUrl() {
    try {
        var q = new URLSearchParams(window.location.search);
        return !!(q.get('round') && (q.get('as') || q.get('player')));
    } catch (e) { return false; }
}
function applyScoreKiosk() {
    if (!isScoreKioskUrl()) return false;
    try {
        document.documentElement.classList.add('score-kiosk');
        document.documentElement.style.setProperty('--nav-h', '0px');
        document.documentElement.style.setProperty('--round-nav-offset', '0px');
        ['main-nav', 'page-head', 'my-active-rounds-container', 'invite-qrs-card'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        var hideSel = document.querySelectorAll('footer, .footer, .page-head, #mobile-drawer-root, .mobile-drawer-container, .nav-toggle');
        for (var i = 0; i < hideSel.length; i++) hideSel[i].classList.add('hidden');
    } catch (e) { console.warn("[silent]", e); }
    return true;
}

document.addEventListener('pestovo-stableford-default-change', function() {
    if (!scRound) return;
    if (typeof updateScStablefordToggle === 'function') updateScStablefordToggle();
    if (typeof updDisp === 'function') updDisp();
});

document.addEventListener('DOMContentLoaded', function() {
    if (typeof initNav === 'function') initNav();
    applyScoreKiosk();
    var p = new URLSearchParams(window.location.search);
    scRid = p.get('round'); scPid = p.get('player');
    if (!scRid || !scPid) {
        var errEl = scGet('sc-err');
        if (errEl) errEl.classList.remove('hidden');
        return;
    }
    if (!(typeof pestovoQrAuthPending !== 'undefined' && pestovoQrAuthPending)) loadSc();
    if (scPaceTimer) { clearInterval(scPaceTimer); scPaceTimer = null; }
    scPaceTimer = setInterval(function() {
        if (scRound && typeof renderPaceAssistant === 'function' && typeof isBatterySaverEnabled === 'function') {
            try { renderPaceAssistant('sc-pace-assistant', scRound); }catch (e) { console.warn("[silent]", e); }
        }
    }, (typeof isBatterySaverEnabled === 'function' && isBatterySaverEnabled()) ? 60000 : 30000);
});

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', function() {
        if (scPaceTimer) { clearInterval(scPaceTimer); scPaceTimer = null; }
    });
}

function onAuthReady(user, data) {
    if (typeof navAuth === 'function') navAuth(user, data);
    if (user && scRid && scPid && !(typeof pestovoQrAuthPending !== 'undefined' && pestovoQrAuthPending)) loadSc();
}

var scLoadStarted = false;
function loadSc() {
    if (scLoadStarted) return;
    scLoadStarted = true;
    if (typeof db === 'undefined') {
        var errEl = scGet('sc-err');
        if (errEl) errEl.classList.remove('hidden');
        return;
    }
    db.ref('rounds/' + scRid).on('value', function(sn) {
        scRound = sn.val();
        if (!scRound || !scRound.players || !scRound.players[scPid]) {
            var e1 = scGet('sc-err'); if (e1) e1.classList.remove('hidden');
            var b1 = scGet('sc-body'); if (b1) b1.classList.add('hidden');
            return;
        }
        var e2 = scGet('sc-err'); if (e2) e2.classList.add('hidden');
        var b2 = scGet('sc-body'); if (b2) b2.classList.remove('hidden');

        var pl = scRound.players[scPid];
        if (pl && !pl.joined) {
            try {
                db.ref('rounds/' + scRid + '/players/' + scPid + '/joined').set(true);
                db.ref('rounds/' + scRid + '/players/' + scPid + '/joinedAt').set(Date.now());
            } catch (e) { console.warn("[silent]", e); }
        }
        applyScoreKiosk();
        if (typeof updateScStablefordToggle === 'function') updateScStablefordToggle();
        var playerTee = (pl && pl.tee) || (scRound && scRound.tee) || 'wh';
        var langIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        var scorePrefix = langIsEn ? 'Score: ' : 'Счёт: ';
        var playerLabel = scorePrefix + (pl.name || (typeof t === 'function' ? t('player') : 'Player'));
        var tnName = (typeof roundTournamentName === 'function') ? roundTournamentName(scRound) : (scRound.tournamentName || '');
        var titleEl = scGet('sc-title');
        if (titleEl) titleEl.textContent = tnName || playerLabel;
        var subEl = scGet('sc-sub');
        if (subEl) {
            var bits = [];
            if (tnName) bits.push(playerLabel);
            bits.push((typeof pestovoRoundFormatBadge === 'function') ? pestovoRoundFormatBadge(scRound, 'Stroke') : (scRound.format || 'Stroke'));
            bits.push((typeof t === 'function' ? t('tee_select') : 'Tee') + ': ' + (typeof fmtTeePill === 'function' ? fmtTeePill(playerTee) : playerTee));
            subEl.innerHTML = bits.join(' · ');
        }
        if (typeof updateRoundEventBanner === 'function') updateRoundEventBanner(scRound);
        if (typeof renderInfo === 'function') renderInfo();
        if (typeof renderPaceAssistant === 'function') { try{ renderPaceAssistant('sc-pace-assistant', scRound); }catch (e) { console.warn("[silent]", e); } }
        if (typeof listenForOfficialCallState === 'function') {
            try{
                listenForOfficialCallState({
                    roundId: scRid,
                    playerId: scPid,
                    prefix: 'sc',
                    canEdit: true,
                    hole: function() { return scHole; },
                    playerName: function() { return pl.name || 'Player'; },
                    flightMembers: []
                });
            }catch (e) { console.warn("[silent]", e); }
        }

        if (!scChanging) {
            var order = (typeof getRoundOrder === 'function' ? getRoundOrder(scRound) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
            var scores = pl.scores || {};
            var savedResumeHole = (typeof getSavedResumeHole === 'function' ? getSavedResumeHole(scRid, scPid, order, pl) : null);
            if (savedResumeHole) {
                scHole = savedResumeHole;
            } else {
                var found = false;
                for (var i = 0; i < order.length; i++) {
                    if (!(parseInt(scores[order[i]]) >= 1)) { scHole = order[i]; found = true; break; }
                }
                if (!found) scHole = order[order.length - 1];
            }
        }

        // Во время активного ввода счёта (scChanging) и пока идёт запись в базу
        // (scSaving) полную перерисовку не запускаем: каждый set() в Firebase
        // прилетает обратно в этот listener, и на быстрых нажатиях цепочка
        // «запись → value → перерисовка ×3 блоков» замораживала страницу на телефоне.
        if (!scChanging && !scSaving) {
            if (typeof buildHoles === 'function') buildHoles();
            if (typeof renderHole === 'function') renderHole();
            if (typeof renderCard === 'function') renderCard();
        }
    });

    try {
        db.ref('markers/' + scRid + '/' + scPid).on('value', function(sn) {
            scMarker = sn.val() || {};
            if (typeof buildHoles === 'function') buildHoles();
            if (typeof checkVerify === 'function') checkVerify();
        });
    } catch (e) { console.warn("[silent]", e); }
}

function renderInfo() {
    var el = scGet('sc-info');
    if (!el) return;
    var startLbl = (typeof t === 'function' ? t('start') : 'Start');
    var holeLbl = (typeof t === 'function' ? t('hole') : 'Hole');
    var pl = scRound && scRound.players && scRound.players[scPid];
    var playerTee = (pl && pl.tee) || (scRound && scRound.tee) || 'wh';
    try {
        el.innerHTML =
            '<div><b>' + startLbl + ':</b> ' + (typeof fmtTime === 'function' ? fmtTime(scRound.startTime) : '') + ' · <b>' + holeLbl + ':</b> ' + scRound.startHole + '</div>' +
            '<div><b>' + (typeof t === 'function' ? t('tee_select') : 'Tee') + ':</b> ' + (typeof fmtTeePill === 'function' ? fmtTeePill(playerTee) : playerTee) + '</div>';
    } catch (e) { console.warn("[silent]", e); }
}

function updateScStablefordToggle() {
    var toggle = scGet('sc-stableford-toggle');
    var control = scGet('sc-stableford-control');
    if (!toggle) return;
    var player = scRound && scRound.players ? scRound.players[scPid] : null;
    if (typeof isPlayerStablefordDisplayEnabled === 'function') toggle.checked = isPlayerStablefordDisplayEnabled(player);
    toggle.disabled = !player || (scRound && scRound.status !== 'active');
    if (control) control.classList.toggle('is-disabled', toggle.disabled);
}

function toggleScStablefordDisplay(enabled) {
    var player = scRound && scRound.players ? scRound.players[scPid] : null;
    if (!scRid || !scPid || !player || (scRound && scRound.status !== 'active')) return;
    enabled = !!enabled;
    player.stablefordDisplay = enabled;
    if (typeof updDisp === 'function') updDisp();
    updateScStablefordToggle();
    if (typeof db !== 'undefined') {
        db.ref('rounds/' + scRid + '/players/' + scPid + '/stablefordDisplay').set(enabled).catch(function(error) {
            console.warn('[Stableford] Cannot save personal display setting', error);
            if (typeof toast === 'function') toast((typeof currentLang !== 'undefined' && currentLang === 'en' ? 'Could not save the Stableford setting' : 'Не удалось сохранить настройку Stableford'), 'error');
        });
    }
}

function buildHoles() {
    var el = scGet('sc-holes');
    if (!el) return;
    if (!scRound || !scRound.players || !scRound.players[scPid]) return;
    var order = (typeof getRoundOrder === 'function' ? getRoundOrder(scRound) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
    var scPlayer = scRound.players[scPid] || {};
    var scores = scPlayer.scores || {};
    var scFieldHcp = scPlayer.fieldHcp !== undefined ? scPlayer.fieldHcp : ((scRound && scRound.fieldHcp) || 0);
    var html = '';
    order.forEach(function(h) {
        var s = parseInt(scores[h]) || 0, ms = parseInt(scMarker[h]) || 0;
        var cls = h === scHole ? 'active' : '';
        // confirmed — зелёная, mismatch — мигает красным, счёт введён без подтверждения — мигает серым
        if (s >= 1 && ms >= 1 && s === ms) cls += ' verified';
        else if (s >= 1 && ms >= 1) cls += ' mismatch';
        else if (s >= 1) cls += ' pending';
        // Текущая лунка без введённого счёта мигает серым (как в основном вводе).
        if (h === scHole && !(s >= 1)) cls += ' cur-blink';
        html += '<button type="button" class="hole-btn ' + cls + '" onclick="goSc(' + h + ')" aria-label="' + (currentLang === 'en' ? 'Hole ' : 'Лунка ') + h + '" aria-pressed="' + (h === scHole ? 'true' : 'false') + '">' +
            entryHoleContentHTML(s, ms, h, scFieldHcp) + '</button>';
    });
    el.innerHTML = html;
}

function goSc(h) {
    scChanging = true;
    scHole = h; scScore = 0;
    if (typeof rememberResumeHole === 'function') rememberResumeHole(scRid, scPid, h);
    if (typeof renderHole === 'function') renderHole();
    if (typeof buildHoles === 'function') buildHoles();
    if (typeof checkVerify === 'function') checkVerify();
    setTimeout(function() { scChanging = false; }, 100);
}

function renderHole() {
    var par = (typeof holePar === 'function' ? holePar(scHole) : 4);
    var pl = scRound && scRound.players && scRound.players[scPid];
    var playerTee = (pl && pl.tee) || (scRound && scRound.tee) || 'wh';
    var holeEl = scGet('sc-hole'); if (holeEl) holeEl.textContent = scHole;
    var parEl = scGet('sc-par'); if (parEl) parEl.textContent = par;
    var distEl = scGet('sc-dist'); if (distEl) distEl.textContent = (typeof holeDist === 'function' ? holeDist(scHole, playerTee) : '—') || '—';
    var dlEl = scGet('sc-dl');
    if (dlEl && typeof fmtTime === 'function') {
        // Дедлайн с учётом пауз раунда (пауза продлевает план, а не «съедается»)
        var dlTs = (typeof roundHoleDeadlineTs === 'function')
            ? roundHoleDeadlineTs(scRound, scHole)
            : (typeof holeDeadline === 'function' ? holeDeadline(scRound.startTime, scRound.startHole, scHole) : null);
        dlEl.textContent = dlTs ? fmtTime(dlTs) : '—';
    }
    if (!scRound || !scRound.players || !scRound.players[scPid]) return;
    var scores = scRound.players[scPid].scores || {};
    var saved = parseInt(scores[scHole]) || 0;
    scScore = saved >= 1 ? saved : par;
    if (typeof updDisp === 'function') updDisp();
}

function adjSc(d) {
    scScore = Math.max(1, Math.min(15, scScore + d));
    if (typeof vib === 'function') vib();
    if (typeof updDisp === 'function') updDisp();
    if (typeof animateScoreElement === 'function') animateScoreElement('sc-disp');
}

function updDisp() {
    var par = (typeof holePar === 'function' ? holePar(scHole) : 4);
    var player = scRound && scRound.players ? scRound.players[scPid] : null;
    var fieldHcp = player && player.fieldHcp !== undefined
        ? player.fieldHcp : ((scRound && scRound.fieldHcp) || 0);
    var disp = scGet('sc-disp');
    if (disp && typeof scoreWithStablefordHTML === 'function' && typeof isPlayerStablefordDisplayEnabled === 'function') {
        disp.innerHTML = scoreWithStablefordHTML(scScore, scHole, fieldHcp, isPlayerStablefordDisplayEnabled(player));
    }
    var r = scGet('sc-result');
    if (r) {
        if (typeof holeResName === 'function') r.textContent = holeResName(scScore, par);
        if (typeof holeResClass === 'function') r.className = 'score-result ' + holeResClass(scScore, par);
    }
}

function checkVerify() {
    var box = scGet('sc-verify');
    if (!box) return;
    if (!scRound || !scRound.players || !scRound.players[scPid]) return;
    var scores = scRound.players[scPid].scores || {};
    var ps = parseInt(scores[scHole]) || 0, ms = parseInt(scMarker[scHole]) || 0;
    var langIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    if (ps >= 1 && ms >= 1 && ps === ms) box.innerHTML = '<div class="verify-ok">✅ ' + (langIsEn ? 'Confirmed by marker: ' + ps : 'Подтверждено маркером: ' + ps + ' уд.') + '</div>';
    else if (ps >= 1 && ms >= 1) box.innerHTML = '<div class="verify-fail">⚠️ MISMATCH! ' + (langIsEn ? 'You: ' : 'Вы: ') + ps + ' | ' + (langIsEn ? 'Marker: ' : 'Маркер: ') + ms + '</div>';
    // Ожидание маркера отдельным блоком НЕ показываем — только уведомление 3 сек при сохранении.
    else box.innerHTML = '';
}

function scSetSaving(on) {
    scSaving = !!on;
    var btn = scGet('sc-save-btn');
    if (btn) btn.disabled = !!on;
}

// Карточка игрока закрыта (он завершил раунд, в т.ч. досрочно) — ввод по нему
// больше не принимается: иначе «доигрывающая» группа получала правки в уже
// сданную карточку, и результат переставал совпадать с протоколом.
function scTargetClosed() {
    if (!scRound || !scPid) return false;
    if (typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(scRound, scPid)) return true;
    if (typeof isRoundOpenForScoring === 'function') return !isRoundOpenForScoring(scRound, Date.now(), scPid);
    return false;
}

function scClosedMessage() {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    if (typeof toast === 'function') toast(isEn
        ? '🔒 This player has already finished the round — the card is closed.'
        : '🔒 Игрок уже завершил раунд — карточка закрыта.', 'info');
}

function saveSc() {
    if (scScore < 1) { if (typeof toast === 'function' && typeof t === 'function') toast(t('msg_score_min'), 'error'); return; }
    if (scTargetClosed()) { scClosedMessage(); return; }
    // Защита от «пулемётного» нажатия кнопки: пока запись в базу не завершилась,
    // повторные вызовы игнорируем. Раньше каждый тап запускал свой saveSc →
    // несколько параллельных set() и перерисовок, что вешало страницу на телефоне.
    if (scSaving) return;
    scSaving = true;
    scSetSaving(true);
    scChanging = true;
    var savedHole = scHole;
    var scQueued = false;
    var setPromise = pestovoScoreWrite(scRid, [{kind:'score',playerId:scPid,hole:savedHole,score:scScore}], scPid);
    setPromise.then(function(res) {
        var wentOffline = res && res.offline;
        if (wentOffline) { scQueued = true; return null; }
        if (typeof recordHoleCompletionTime === 'function') return recordHoleCompletionTime(scRid, scPid, savedHole, Date.now());
        return null;
    }).then(function() {
        if (scQueued) {
            var pendingOrder = getRoundOrder(scRound);
            var pendingIdx = pendingOrder.indexOf(savedHole);
            if (pendingIdx >= 0 && pendingIdx < pendingOrder.length - 1) { scHole = pendingOrder[pendingIdx + 1]; scScore = 0; }
            if (typeof rememberResumeHole === 'function') rememberResumeHole(scRid, scPid, scHole);
            renderHole(); buildHoles(); renderCard();
            scChanging = false; scSetSaving(false);
            return;
        }
        if (scRound && scRound.players && scRound.players[scPid]) {
            scRound.players[scPid].scores = scRound.players[scPid].scores || {};
            scRound.players[scPid].scores[savedHole] = scScore;
            scRound.players[scPid].holeTimes = scRound.players[scPid].holeTimes || {};
            if (!(parseInt(scRound.players[scPid].holeTimes[savedHole]) > 0)) {
                scRound.players[scPid].holeTimes[savedHole] = Date.now();
            }
        }
        var ms = parseInt(scMarker[savedHole]) || 0;
        var langIsEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        if (ms >= 1 && ms === scScore) {

            if (typeof toast === 'function') toast(langIsEn ? ('✅ <b>Hole ' + savedHole + ' confirmed:</b> ' + scScore) : ('✅ <b>Лунка ' + savedHole + ' подтверждена:</b> ' + scScore + ' уд.'));
            if (typeof vib === 'function') vib([50, 50]);
        } else if (ms >= 1 && ms !== scScore) {

            if (typeof toast === 'function') toast(langIsEn ? ('⚠️ <b>Mismatch on hole ' + savedHole + '!</b><br>You: <b>' + scScore + '</b>, marker: <b>' + ms + '</b>') : ('⚠️ <b>Несовпадение на лунке ' + savedHole + '!</b><br>Вы: <b>' + scScore + '</b>, маркер: <b>' + ms + '</b>'), 'error');
        } else {
            if (typeof toast === 'function') toast(langIsEn ? ('⏳ <b>Hole ' + savedHole + ':</b> your score <b>' + scScore + '</b> is saved. Waiting for marker.') : ('⏳ <b>Лунка ' + savedHole + ':</b> ваш счёт <b>' + scScore + '</b> сохранён. Ждём маркера.'), 'info');
            if (typeof vib === 'function') vib();
        }
        var par = (typeof holePar === 'function' ? holePar(savedHole) : 4);
        if (scScore === 1 || (scScore - par) <= -1) {
            if (typeof triggerVictoryConfetti === 'function') triggerVictoryConfetti();
        }
        var noticeEl = scGet('sc-notice');
        if (noticeEl && typeof buildTimingNotice === 'function') noticeEl.innerHTML = buildTimingNotice(scRound.startTime, scRound.startHole, savedHole, scRound);
        var order = (typeof getRoundOrder === 'function' ? getRoundOrder(scRound) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
        var idx = order.indexOf(savedHole);
        if (idx >= 0 && idx < order.length - 1) { scHole = order[idx + 1]; scScore = 0; }
        if (typeof rememberResumeHole === 'function') rememberResumeHole(scRid, scPid, scHole);
        if (typeof renderHole === 'function') renderHole();
        if (typeof buildHoles === 'function') buildHoles();
        if (typeof renderCard === 'function') renderCard();
        if (typeof renderPaceAssistant === 'function') { try{ renderPaceAssistant('sc-pace-assistant', scRound); }catch (e) { console.warn("[silent]", e); } }
        setTimeout(function() { scChanging = false; }, 200);
        scSetSaving(false);
    }).catch(function(err){
        console.error('[scorer] save failed', err);
        scChanging = false;
        scSetSaving(false);
        if (typeof toast === 'function') toast('Ошибка сохранения', 'error');
    });
}

function renderCard() {
    var el = scGet('sc-card');
    if (!el) return;
    if (!scRound || !scRound.players || !scRound.players[scPid]) return;
    el.innerHTML = renderClubScorecard(scRound.players[scPid], scRound, { playerId: scPid, showMarker: true });
}

function callOfficial(type) {
    if (!scRound || !scPid) return;
    var pName = (scRound.players[scPid] && scRound.players[scPid].name) || 'Player';
    if (typeof requestOfficialCall !== 'function') return;
    requestOfficialCall({
        roundId: scRid,
        playerId: scPid,
        prefix: 'sc',
        type: type,
        hole: function() { return scHole; },
        playerName: pName,
        flightMembers: [],
        canEdit: true,
        onSent: function(call) {
            if (typeof sendTelegramOfficialAlert === 'function') sendTelegramOfficialAlert(type, call.hole, pName, []);
            if (typeof sendVKOfficialAlert === 'function') sendVKOfficialAlert(type, call.hole, pName, []);
            if (typeof toast === 'function' && typeof getOfficialRoleName === 'function') toast('🚨 ' + getOfficialRoleName(type) + ((typeof currentLang !== 'undefined' && currentLang === 'en') ? ' called to hole ' : ' вызван на лунку ') + call.hole + '!', 'warn');
            if (typeof vib === 'function') vib([100, 50, 100]);
        }
    });
}
