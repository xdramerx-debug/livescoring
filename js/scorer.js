var scRid = null, scPid = null, scRound = null;
var scHole = 1, scScore = 0, scMarker = {};
var scChanging = false;

document.addEventListener('DOMContentLoaded', function() {
    initNav();
    var p = new URLSearchParams(window.location.search);
    scRid = p.get('round'); scPid = p.get('player');
    if (!scRid || !scPid) { document.getElementById('sc-err').classList.remove('hidden'); return; }
    loadSc();
});

function loadSc() {
    db.ref('rounds/' + scRid).on('value', function(sn) {
        scRound = sn.val();
        if (!scRound || !scRound.players || !scRound.players[scPid]) {
            document.getElementById('sc-err').classList.remove('hidden');
            document.getElementById('sc-body').classList.add('hidden');
            return;
        }
        document.getElementById('sc-err').classList.add('hidden');
        document.getElementById('sc-body').classList.remove('hidden');

        var pl = scRound.players[scPid];
        var scorePrefix = currentLang === 'en' ? 'Score: ' : 'Счёт: ';
        document.getElementById('sc-title').textContent = scorePrefix + (pl.name || t('player'));
        document.getElementById('sc-sub').textContent = (scRound.format || 'Stroke') + ' · ' + t('tee_select') + ': ' + fmtTeePill(scRound.tee);
        renderInfo();

        if (!scChanging) {
            var order = holeOrder(scRound.startHole || 1);
            var scores = pl.scores || {};
            var found = false;
            for (var i = 0; i < order.length; i++) {
                if (!(parseInt(scores[order[i]]) >= 1)) { scHole = order[i]; found = true; break; }
            }
            if (!found) scHole = order[order.length - 1];
        }

        buildHoles();
        renderHole();
        renderCard();
    });

    db.ref('markers/' + scRid + '/' + scPid).on('value', function(sn) {
        scMarker = sn.val() || {};
        buildHoles();
        checkVerify();
    });
}

function renderInfo() {
    var el = document.getElementById('sc-info');
    if (!el) return;
    var startLbl = t('start');
    var holeLbl = t('hole');
    el.innerHTML =
        '<div><b>' + startLbl + ':</b> ' + fmtTime(scRound.startTime) + ' · <b>' + holeLbl + ':</b> ' + scRound.startHole + '</div>' +
        '<div><b>' + t('tee_select') + ':</b> ' + fmtTeePill(scRound.tee) + '</div>';
}

function buildHoles() {
    var el = document.getElementById('sc-holes');
    var order = holeOrder(scRound.startHole || 1);
    var scores = scRound.players[scPid].scores || {};
    var html = '';
    order.forEach(function(h) {
        var s = parseInt(scores[h]) || 0, ms = parseInt(scMarker[h]) || 0;
        var cls = h === scHole ? 'active' : '';
        if (s >= 1 && ms >= 1 && s === ms) cls += ' verified';
        else if (s >= 1 && ms >= 1) cls += ' mismatch';
        else if (s >= 1) cls += ' done';
        html += '<button class="hole-btn ' + cls + '" onclick="goSc(' + h + ')">' + h + '</button>';
    });
    el.innerHTML = html;
}

function goSc(h) {
    scChanging = true;
    scHole = h; scScore = 0;
    renderHole(); buildHoles(); checkVerify();
    setTimeout(function() { scChanging = false; }, 100);
}

function renderHole() {
    var par = holePar(scHole);
    document.getElementById('sc-hole').textContent = scHole;
    document.getElementById('sc-par').textContent = par;
    document.getElementById('sc-dist').textContent = holeDist(scHole, scRound.tee) || '—';
    document.getElementById('sc-dl').textContent = fmtTime(holeDeadline(scRound.startTime, scRound.startHole, scHole));

    var scores = scRound.players[scPid].scores || {};
    var saved = parseInt(scores[scHole]) || 0;
    scScore = saved >= 1 ? saved : par;
    updDisp();
}

function adjSc(d) {
    scScore = Math.max(1, Math.min(15, scScore + d));
    vib();
    updDisp();
    animateScoreElement('sc-disp');
}

function updDisp() {
    var par = holePar(scHole);
    document.getElementById('sc-disp').textContent = scScore;
    var r = document.getElementById('sc-result');
    r.textContent = holeResName(scScore, par);
    r.className = 'score-result ' + holeResClass(scScore, par);
}

function checkVerify() {
    var box = document.getElementById('sc-verify');
    var scores = scRound.players[scPid].scores || {};
    var ps = parseInt(scores[scHole]) || 0, ms = parseInt(scMarker[scHole]) || 0;
    if (ps >= 1 && ms >= 1 && ps === ms) box.innerHTML = '<div class="verify-ok">✅ ' + (currentLang === 'en' ? 'Confirmed by marker: ' + ps : 'Подтверждено маркером: ' + ps + ' уд.') + '</div>';
    else if (ps >= 1 && ms >= 1) box.innerHTML = '<div class="verify-fail">⚠️ MISMATCH! ' + (currentLang === 'en' ? 'You: ' : 'Вы: ') + ps + ' | ' + (currentLang === 'en' ? 'Marker: ' : 'Маркер: ') + ms + '</div>';
    else if (ps >= 1) box.innerHTML = '<div class="verify-wait">⏳ ' + (currentLang === 'en' ? 'Awaiting marker confirmation...' : 'Ждём подтверждение маркера') + '</div>';
    else box.innerHTML = '';
}

function saveSc() {
    if (scScore < 1) { toast(t('msg_score_min'), 'error'); return; }
    scChanging = true;
    var savedHole = scHole;

    db.ref('rounds/' + scRid + '/players/' + scPid + '/scores/' + savedHole).set(scScore).then(function() {
        var ms = parseInt(scMarker[savedHole]) || 0;
        if (ms >= 1 && ms === scScore) {
            db.ref('rounds/' + scRid + '/players/' + scPid + '/verified/' + savedHole).set(true);
            toast(currentLang === 'en' ? '✅ Confirmed!' : '✅ Подтверждено!'); vib([50, 50]);
        } else if (ms >= 1 && ms !== scScore) {
            db.ref('rounds/' + scRid + '/players/' + scPid + '/verified/' + savedHole).set(false);
            toast(currentLang === 'en' ? '⚠️ Mismatch!' : '⚠️ Несовпадение!', 'error');
        } else {
            toast(currentLang === 'en' ? '⏳ Waiting for marker...' : '⏳ Ждём маркера'); vib();
        }

        var par = holePar(savedHole);
        if (scScore === 1 || (scScore - par) <= -1) {
            triggerVictoryConfetti();
        }

        document.getElementById('sc-notice').innerHTML = buildTimingNotice(scRound.startTime, scRound.startHole, savedHole);

        var order = holeOrder(scRound.startHole);
        var idx = order.indexOf(savedHole);
        if (idx >= 0 && idx < order.length - 1) { scHole = order[idx + 1]; scScore = 0; }

        renderHole(); buildHoles(); renderCard();
        setTimeout(function() { scChanging = false; }, 200);
    });
}

function renderCard() {
    var el = document.getElementById('sc-card');
    var scores = scRound.players[scPid].scores || {};
    var verified = scRound.players[scPid].verified || {};

    var holeHeader = t('hole');
    var parHeader = t('par');
    var scoreHeader = currentLang === 'en' ? 'Score' : 'Счёт';
    var outHeader = t('out');
    var inHeader = t('in_side');
    var totalHeader = t('total');

    var html = '<div class="scorecard"><table><tr><th>' + holeHeader + '</th>';
    for (var i = 1; i <= 9; i++) html += '<th>' + i + '</th>';
    html += '<th>' + outHeader + '</th></tr><tr class="row-par"><td>' + parHeader + '</td>';
    var pO = 0;
    for (var i = 1; i <= 9; i++) { var pv = holePar(i); pO += pv; html += '<td>' + pv + '</td>'; }
    html += '<td>' + pO + '</td></tr><tr><td>' + scoreHeader + '</td>';
    var gO = 0;
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(scores[i]) || 0, cls = holeResClass(s, holePar(i)), v = '';
        if (verified[i] === true) v = ' ✅'; else if (verified[i] === false) v = ' ⚠️'; else if (s >= 1) v = ' ⏳';
        if (s >= 1) gO += s;
        html += '<td class="' + cls + '">' + (s >= 1 ? s + v : '') + '</td>';
    }
    html += '<td class="row-total">' + (gO > 0 ? gO : '') + '</td></tr></table></div>';

    html += '<div class="scorecard"><table><tr><th>' + holeHeader + '</th>';
    for (var i = 10; i <= 18; i++) html += '<th>' + i + '</th>';
    html += '<th>' + inHeader + '</th><th>' + totalHeader + '</th></tr><tr class="row-par"><td>' + parHeader + '</td>';
    var pI = 0;
    for (var i = 10; i <= 18; i++) { var pv = holePar(i); pI += pv; html += '<td>' + pv + '</td>'; }
    html += '<td>' + pI + '</td><td>' + (pO + pI) + '</td></tr><tr><td>' + scoreHeader + '</td>';
    var gI = 0;
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(scores[i]) || 0, cls = holeResClass(s, holePar(i)), v = '';
        if (verified[i] === true) v = ' ✅'; else if (verified[i] === false) v = ' ⚠️'; else if (s >= 1) v = ' ⏳';
        if (s >= 1) gI += s;
        html += '<td class="' + cls + '">' + (s >= 1 ? s + v : '') + '</td>';
    }
    html += '<td class="row-total">' + (gI > 0 ? gI : '') + '</td><td class="row-total">' + ((gO + gI) > 0 ? (gO + gI) : '') + '</td></tr></table></div>';
    el.innerHTML = html;
}

function callOfficial(type) {
    var typeName = type === 'referee' ? (currentLang === 'en' ? 'referee' : 'судью') : (currentLang === 'en' ? 'marshal' : 'маршала');
    if (!confirm((currentLang === 'en' ? 'Do you want to call a ' + typeName + ' to hole ' : 'Вы действительно хотите вызвать ' + typeName + ' на лунку ') + scHole + '?')) return;

    var pName = (scRound && scRound.players[scPid]) ? scRound.players[scPid].name : 'Player';

    db.ref('alerts').push({
        roundId: scRid,
        type: type,
        hole: scHole,
        playerId: scPid,
        playerName: pName,
        time: Date.now(),
        status: 'active'
    }).then(function() {
        toast('🚨 ' + (type === 'referee' ? (currentLang === 'en' ? 'Referee' : 'Судья') : (currentLang === 'en' ? 'Marshal' : 'Маршал')) + (currentLang === 'en' ? ' called to hole ' : ' вызван на лунку ') + scHole + '!', 'warn');
        vib([100, 50, 100]);
    });
}
