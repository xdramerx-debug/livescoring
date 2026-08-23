var mkRid = null, mkPid = null, mkRound = null;
var mkHole = 1, mkScore = 0, mkScores = {}, mkPScores = {};
var mkChanging = false;

document.addEventListener('DOMContentLoaded', function() {
    initNav();
    var p = new URLSearchParams(window.location.search);
    mkRid = p.get('round'); mkPid = p.get('player');
    if (!mkRid || !mkPid) { document.getElementById('mk-err').classList.remove('hidden'); return; }
    loadMk();
});

function loadMk() {
    db.ref('rounds/' + mkRid).on('value', function(sn) {
        mkRound = sn.val();
        if (!mkRound || !mkRound.players || !mkRound.players[mkPid]) {
            document.getElementById('mk-err').classList.remove('hidden');
            document.getElementById('mk-body').classList.add('hidden');
            return;
        }
        document.getElementById('mk-err').classList.add('hidden');
        document.getElementById('mk-body').classList.remove('hidden');

        var pl = mkRound.players[mkPid];
        document.getElementById('mk-title').textContent = 'Маркер для: ' + (pl.name || 'Игрок');
        document.getElementById('mk-sub').textContent = 'ТИ: ' + TEES[mkRound.tee];
        mkPScores = pl.scores || {};

        if (!mkChanging) {
            var order = holeOrder(mkRound.startHole || 1);
            var found = false;
            for (var i = 0; i < order.length; i++) {
                if (!(parseInt(mkScores[order[i]]) >= 1)) { mkHole = order[i]; found = true; break; }
            }
            if (!found) mkHole = order[order.length - 1];
        }

        buildHoles(); renderHole(); renderSum(); checkVerify();
    });

    db.ref('markers/' + mkRid + '/' + mkPid).on('value', function(sn) {
        mkScores = sn.val() || {};
        buildHoles(); renderSum(); checkVerify();
    });
}

function buildHoles() {
    var el = document.getElementById('mk-holes');
    var order = holeOrder(mkRound.startHole || 1);
    var html = '';
    order.forEach(function(h) {
        var ps = parseInt(mkPScores[h]) || 0, ms = parseInt(mkScores[h]) || 0;
        var cls = h === mkHole ? 'active' : '';
        if (ps >= 1 && ms >= 1 && ps === ms) cls += ' verified';
        else if (ps >= 1 && ms >= 1) cls += ' mismatch';
        else if (ms >= 1 || ps >= 1) cls += ' done';
        html += '<button class="hole-btn ' + cls + '" onclick="goMk(' + h + ')">' + h + '</button>';
    });
    el.innerHTML = html;
}

function goMk(h) {
    mkChanging = true;
    mkHole = h; mkScore = 0;
    renderHole(); checkVerify();
    setTimeout(function() { mkChanging = false; }, 100);
}

function renderHole() {
    var par = holePar(mkHole);
    document.getElementById('mk-hole').textContent = mkHole;
    document.getElementById('mk-par').textContent = par;
    var saved = parseInt(mkScores[mkHole]) || 0;
    mkScore = saved >= 1 ? saved : par;
    updDisp();
}

function adjMk(d) {
    mkScore = Math.max(1, Math.min(15, mkScore + d));
    vib();
    updDisp();
    animateScoreElement('mk-disp');
}

function updDisp() {
    var par = holePar(mkHole);
    document.getElementById('mk-disp').textContent = mkScore;
    var r = document.getElementById('mk-result');
    r.textContent = holeResName(mkScore, par);
    r.className = 'score-result ' + holeResClass(mkScore, par);
}

function checkVerify() {
    var box = document.getElementById('mk-verify');
    var ps = parseInt(mkPScores[mkHole]) || 0, ms = parseInt(mkScores[mkHole]) || 0;
    if (ps >= 1 && ms >= 1 && ps === ms) box.innerHTML = '<div class="verify-ok">✅ Совпадает: ' + ps + ' уд.</div>';
    else if (ps >= 1 && ms >= 1) box.innerHTML = '<div class="verify-fail">⚠️ НЕСОВПАДЕНИЕ! Игрок: ' + ps + ' | Маркер: ' + ms + '</div>';
    else if (ps >= 1) box.innerHTML = '<div class="verify-wait">🏌️ Игрок ввёл: ' + ps + '. Ожидает подтверждения</div>';
    else box.innerHTML = '';
}

function saveMk() {
    mkChanging = true;
    var savedHole = mkHole;
    db.ref('markers/' + mkRid + '/' + mkPid + '/' + savedHole).set(mkScore).then(function() {
        var ps = parseInt(mkPScores[savedHole]) || 0;
        if (ps >= 1 && ps === mkScore) {
            db.ref('rounds/' + mkRid + '/players/' + mkPid + '/verified/' + savedHole).set(true);
            toast('✅ Лунка ' + savedHole + ' подтверждена!'); vib([50, 50]);
        } else if (ps >= 1) {
            db.ref('rounds/' + mkRid + '/players/' + mkPid + '/verified/' + savedHole).set(false);
            toast('⚠️ Несовпадение!', 'error');
        } else { toast('👁️ Ждём игрока'); vib(); }

        var order = holeOrder(mkRound.startHole || 1);
        var idx = order.indexOf(savedHole);
        if (idx >= 0 && idx < order.length - 1) { mkHole = order[idx + 1]; mkScore = 0; }

        renderHole(); buildHoles(); renderSum(); checkVerify();
        setTimeout(function() { mkChanging = false; }, 200);
    });
}

function renderSum() {
    var el = document.getElementById('mk-sum');
    var match = 0, mis = 0, pend = 0;
    var html = '<div style="overflow-x:auto;"><table class="scorecard"><tr><th>Лунка</th><th>Пар</th><th>Игрок</th><th>Маркер</th><th>Статус</th></tr>';
    for (var i = 1; i <= 18; i++) {
        var ps = parseInt(mkPScores[i]) || 0, ms = parseInt(mkScores[i]) || 0, icon = '—', bg = '';
        if (ps >= 1 && ms >= 1 && ps === ms) { icon = '✅'; bg = 'background:rgba(46,204,113,.05);'; match++; }
        else if (ps >= 1 && ms >= 1) { icon = '⚠️'; bg = 'background:rgba(224,90,74,.08);'; mis++; }
        else if (ps >= 1 || ms >= 1) { icon = '⏳'; pend++; }
        html += '<tr style="' + bg + '"><td style="font-weight:700;">' + i + '</td><td>' + holePar(i) + '</td><td>' + (ps >= 1 ? ps : '—') + '</td><td>' + (ms >= 1 ? ms : '—') + '</td><td style="font-size:16px;">' + icon + '</td></tr>';
    }
    html += '</table></div>';
    html += '<div style="display:flex;gap:16px;padding:12px;font-size:13px;font-weight:700;"><span style="color:#2ecc71;">✅ ' + match + '</span><span style="color:var(--red);">⚠️ ' + mis + '</span><span style="color:var(--gold);">⏳ ' + pend + '</span></div>';
    el.innerHTML = html;
}

function callOfficial(type) {
    var typeName = type === 'referee' ? 'Судью' : 'Маршала';
    if (!confirm('Вы действительно хотите вызвать ' + typeName.toLowerCase() + 'а на лунку ' + mkHole + '?')) return;

    var pName = (mkRound && mkRound.players[mkPid]) ? mkRound.players[mkPid].name : 'Игрок';

    db.ref('alerts').push({
        roundId: mkRid,
        type: type,
        hole: mkHole,
        playerId: mkPid,
        playerName: 'Маркер (' + pName + ')',
        time: Date.now(),
        status: 'active'
    }).then(function() {
        toast('🚨 ' + (type === 'referee' ? 'Судья' : 'Маршал') + ' вызван на лунку ' + mkHole + '!', 'warn');
        vib([100, 50, 100]);
    });
}
