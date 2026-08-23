var soloRid = null;
var soloRound = null;
var curHole = 1;
var curScore = 0;
var isChanging = false;
var canEditSolo = false;
var soloAutoSaveTimer = null;

document.addEventListener('DOMContentLoaded', function() {
    initNav();
    var urlP = new URLSearchParams(window.location.search);
    var rid = urlP.get('round');
    if (rid) {
        soloRid = rid;
        loadExistingSolo();
        return;
    }

    var sel = document.getElementById('s-hole');
    if (sel) {
        sel.innerHTML = '';
        for (var i = 1; i <= 18; i++) {
            sel.innerHTML += '<option value="' + i + '">' + t('hole') + ' ' + i + ' (' + t('par') + ' ' + holePar(i) + ')</option>';
        }
    }

    var now = new Date();
    var timeEl = document.getElementById('s-time');
    if (timeEl) {
        timeEl.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    updateTimingPreview();
    if (timeEl) timeEl.addEventListener('change', updateTimingPreview);
    if (sel) sel.addEventListener('change', updateTimingPreview);
});

function initSoloView() {
    if (soloRid) {
        loadExistingSolo();
    } else {
        var sel = document.getElementById('s-hole');
        if (sel) {
            var curVal = sel.value;
            sel.innerHTML = '';
            for (var i = 1; i <= 18; i++) {
                sel.innerHTML += '<option value="' + i + '">' + t('hole') + ' ' + i + ' (' + t('par') + ' ' + holePar(i) + ')</option>';
            }
            if (curVal) sel.value = curVal;
        }
        updateTimingPreview();
    }
}

function onAuthReady(u, d) {
    navAuth(u, d);

    if (u && d) {
        var name = d.name || '';
        var parts = name.split(' ');
        var fn = document.getElementById('s-firstname');
        var ln = document.getElementById('s-lastname');

        if (fn && !fn.value) fn.value = parts[0] || '';
        if (ln && !ln.value) ln.value = parts.slice(1).join(' ') || '';

        if (d.handicap != null) {
            var hcpEl = document.getElementById('s-exact-hcp');
            if (hcpEl && !hcpEl.value) hcpEl.value = fmtExactHcp(d.handicap);
        }
        if (d.gender) {
            var gEl = document.getElementById('s-gender');
            if (gEl) gEl.value = d.gender;
        }

        calcSoloFieldHcp();

        var banner = document.getElementById('guest-banner');
        if (banner) banner.classList.add('hidden');
    } else {
        var banner = document.getElementById('guest-banner');
        if (banner) banner.classList.remove('hidden');
    }
}

function calcSoloFieldHcp() {
    var exact = document.getElementById('s-exact-hcp').value;
    if (!exact && exact !== '0') { document.getElementById('s-field-hcp').value = ''; return; }
    var gender = document.getElementById('s-gender').value;
    var tee = document.getElementById('s-tee').value;
    var field = getFieldHcp(exact, tee, gender);
    document.getElementById('s-field-hcp').value = fmtFieldHcp(field);
}

function updateTimingPreview() {
    var timeEl = document.getElementById('s-time');
    var holeEl = document.getElementById('s-hole');
    if (!timeEl || !holeEl) return;
    var timeStr = timeEl.value;
    var startHole = parseInt(holeEl.value) || 1;
    if (!timeStr) return;
    var parts = timeStr.split(':');
    var now = new Date();
    var startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        parseInt(parts[0]), parseInt(parts[1]), 0);
    var previewEl = document.getElementById('timing-preview');
    if (previewEl) previewEl.innerHTML = buildTimingTable(startDate.getTime(), startHole);
}

function startSolo() {
    var fnInp = document.getElementById('s-firstname');
    var lnInp = document.getElementById('s-lastname');
    var timeInp = document.getElementById('s-time');
    var hcpInp = document.getElementById('s-exact-hcp');

    var firstName = fnInp.value.trim();
    var lastName = lnInp.value.trim();
    var timeStr = timeInp.value;
    var startHole = parseInt(document.getElementById('s-hole').value) || 1;
    var tee = document.getElementById('s-tee').value;
    var format = document.getElementById('s-format').value;
    var gender = document.getElementById('s-gender').value;
    var exactHcpStr = hcpInp.value;

    if (!firstName) { fnInp.classList.add('is-invalid'); toast(t('msg_name_req'), 'error'); return; }
    if (!lastName) { lnInp.classList.add('is-invalid'); toast(t('msg_name_req'), 'error'); return; }
    if (!timeStr) { timeInp.classList.add('is-invalid'); toast(t('msg_start_time_req'), 'error'); return; }
    if (!exactHcpStr && exactHcpStr !== '0') { hcpInp.classList.add('is-invalid'); toast(t('msg_exact_hcp_req'), 'error'); return; }

    var parsedExact = parseExactHcp(exactHcpStr);
    var fieldHcp = getFieldHcp(parsedExact, tee, gender);
    var fullName = lastName + ' ' + firstName;

    var parts = timeStr.split(':');
    var now = new Date();
    var startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        parseInt(parts[0]), parseInt(parts[1]), 0);
    var startTime = startDate.getTime();

    var accessKey = 'key_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

    var playerId = currentUser ? currentUser.uid : 'guest_' + Date.now();
    var isGuest = !currentUser;

    var players = {};
    players[playerId] = {
        name: fullName,
        firstName: firstName,
        lastName: lastName,
        exactHcp: parsedExact,
        fieldHcp: fieldHcp,
        gender: gender,
        scores: {}
    };

    var ref = db.ref('rounds').push();
    soloRid = ref.key;

    localStorage.setItem('pestovo_solo_key_' + soloRid, accessKey);

    var roundData = {
        mode: 'solo',
        tee: tee,
        format: format,
        startHole: startHole,
        startTime: startTime,
        players: players,
        status: 'active',
        createdAt: Date.now(),
        createdBy: currentUser ? currentUser.uid : playerId,
        accessKey: accessKey,
        isGuest: isGuest
    };

    ref.set(roundData).then(function() {
        toast(t('msg_round_started'));
        window.location.href = 'solo.html?round=' + soloRid;
    });
}

function loadExistingSolo() {
    db.ref('rounds/' + soloRid).on('value', function(sn) {
        soloRound = sn.val();
        if (!soloRound) { toast(currentLang === 'en' ? 'Round not found' : 'Раунд не найден', 'error'); return; }

        document.getElementById('setup').classList.add('hidden');

        var localKey = localStorage.getItem('pestovo_solo_key_' + soloRid);
        var isOwnerUser = currentUser && (soloRound.createdBy === currentUser.uid || (soloRound.players && soloRound.players[currentUser.uid]));
        var isOwnerKey = localKey && (soloRound.accessKey === localKey);

        canEditSolo = (isOwnerUser || isOwnerKey) && soloRound.status === 'active';

        if (canEditSolo) {
            document.getElementById('game').classList.remove('hidden');
            document.getElementById('read-only-view').classList.add('hidden');

            var uid = getPlayerId();
            if (!uid || !soloRound.players) return;
            var player = soloRound.players[uid];
            if (!player) return;

            var scores = player.scores || {};
            var order = holeOrder(soloRound.startHole || 1);

            if (!isChanging) {
                var found = false;
                for (var i = 0; i < order.length; i++) {
                    var h = order[i];
                    var s = parseInt(scores[h]) || 0;
                    if (s < 1) { curHole = h; found = true; break; }
                }
                if (!found) curHole = order[order.length - 1];
            }

            renderRoundInfo('round-info');
            buildHoles();
            renderCurrentHole();
            renderLiveStats('live-stats');
            renderMiniCard('mini-card');

        } else {
            document.getElementById('game').classList.add('hidden');
            document.getElementById('read-only-view').classList.remove('hidden');

            renderRoundInfo('ro-round-info');
            renderLiveStats('ro-live-stats');
            renderMiniCard('ro-mini-card');
        }
    });
}

function getPlayerId() {
    if (!soloRound || !soloRound.players) return null;
    if (currentUser && soloRound.players[currentUser.uid]) {
        return currentUser.uid;
    }
    return Object.keys(soloRound.players)[0];
}

function renderRoundInfo(targetId) {
    var el = document.getElementById(targetId);
    if (!el) return;
    var uid = getPlayerId();
    if (!uid || !soloRound || !soloRound.players) return;
    var p = soloRound.players[uid];
    if (!p) return;
    var guestBadge = soloRound.isGuest ? '<span style="background:rgba(201,168,76,0.15);color:var(--gold);padding:2px 8px;border-radius:12px;font-size:10px;margin-left:6px;">' + t('guest') + '</span>' : '';

    var courseHcpLbl = currentLang === 'en' ? 'Course' : 'пол.';
    var startLbl = t('start');
    var holeLbl = t('hole');

    el.innerHTML =
        '<div style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + uid + '\',\'' + soloRid + '\')"><b><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + (p.name || t('player')) + '</b>' + guestBadge + ' · <b>HCP:</b> ' + fmtExactHcp(p.exactHcp) + ' (' + courseHcpLbl + ' ' + fmtFieldHcp(p.fieldHcp) + ')</div>' +
        '<div><b>' + startLbl + ':</b> ' + fmtTime(soloRound.startTime) + ' · <b>' + holeLbl + ':</b> ' + soloRound.startHole + ' · <b>' + t('tee_select') + ':</b> ' + fmtTeePill(soloRound.tee) + ' · <b>' + t('format_select') + ':</b> ' + soloRound.format + '</div>';
}

function buildHoles() {
    var el = document.getElementById('g-holes');
    if (!el) return;
    var uid = getPlayerId();
    if (!uid || !soloRound || !soloRound.players) return;
    var p = soloRound.players[uid];
    var scores = (p && p.scores) || {};
    var order = holeOrder(soloRound.startHole || 1);
    var html = '';
    order.forEach(function(h) {
        var cls = h === curHole ? 'active' : '';
        var s = parseInt(scores[h]) || 0;
        if (s >= 1 && h !== curHole) cls += ' done';
        html += '<button class="hole-btn ' + cls + '" onclick="goHole(' + h + ')">' + h + '</button>';
    });
    el.innerHTML = html;
}

function goHole(h) {
    if (!canEditSolo) return;
    isChanging = true;
    curHole = h;
    curScore = 0;
    renderCurrentHole();
    buildHoles();
    setTimeout(function() { isChanging = false; }, 100);
}

function renderCurrentHole() {
    var par = holePar(curHole);
    var dist = holeDist(curHole, soloRound.tee);

    document.getElementById('g-hole').textContent = curHole;
    document.getElementById('g-par').textContent = par;
    document.getElementById('g-dist').textContent = dist > 0 ? dist : '—';

    var dl = holeDeadline(soloRound.startTime, soloRound.startHole, curHole);
    document.getElementById('g-deadline').textContent = fmtTime(dl);

    var uid = getPlayerId();
    var scores = (uid && soloRound && soloRound.players && soloRound.players[uid] && soloRound.players[uid].scores) || {};
    var savedScore = parseInt(scores[curHole]) || 0;

    curScore = savedScore > 0 ? savedScore : par;
    updateDisplay();
}

function adjSolo(delta) {
    if (!canEditSolo) return;
    curScore = Math.max(1, Math.min(15, curScore + delta));
    vib();
    updateDisplay();
    animateScoreElement('g-disp');

    clearTimeout(soloAutoSaveTimer);
    soloAutoSaveTimer = setTimeout(function() {
        saveSolo(true);
    }, 800);
}

function updateDisplay() {
    var par = holePar(curHole);
    document.getElementById('g-disp').textContent = curScore;
    var name = holeResName(curScore, par);
    var cls = holeResClass(curScore, par);
    var r = document.getElementById('g-result');
    r.textContent = name;
    r.className = 'score-result ' + cls;
}

function saveSolo(isAuto) {
    if (!canEditSolo) {
        if (!isAuto) toast(t('msg_edit_disabled'), 'error');
        return;
    }
    if (curScore < 1) { if (!isAuto) toast(t('msg_score_min'), 'error'); return; }

    isChanging = true;
    var savedHole = curHole;

    var uid = getPlayerId();
    var path = 'rounds/' + soloRid + '/players/' + uid + '/scores/' + savedHole;

    db.ref(path).set(curScore).then(function() {
        var par = holePar(savedHole);
        var d = curScore - par;

        if (!isAuto) {
            if (curScore === 1) { toast('🎯 HOLE-IN-ONE!!!', 'info'); vib([100, 50, 100, 50, 100]); triggerVictoryConfetti(); }
            else if (d <= -2) { toast('🦅 EAGLE!', 'info'); vib([80, 50, 80]); triggerVictoryConfetti(); }
            else if (d === -1) { toast('🐦 Birdie!', 'success'); vib([50, 50]); triggerVictoryConfetti(); }
            else if (d === 0) { toast('✅ Par'); vib(); }
            else if (d === 1) { toast('Bogey'); vib(); }
            else { toast('Double+', 'warn'); vib(); }

            var order = holeOrder(soloRound.startHole);
            var idx = order.indexOf(savedHole);
            if (idx >= 0 && idx < order.length - 1) {
                curHole = order[idx + 1];
                curScore = 0;
            }
        } else if (curScore === 1 || d <= -1) {
            triggerVictoryConfetti();
        }

        showTimingNotice(savedHole);
        renderCurrentHole();
        buildHoles();

        var p = soloRound.players && soloRound.players[uid];
        if (p) {
            p.scores = p.scores || {};
            p.scores[savedHole] = curScore;
            var stats = calcRoundStats(p.scores, p.fieldHcp || 0, p.exactHcp || 0, holeOrder(soloRound.startHole));
            renderHoleProgressBar('solo-progress-bar', stats.holesPlayed);
        }

        setTimeout(function() { isChanging = false; }, 200);
    });
}

function showTimingNotice(hole) {
    var el = document.getElementById('timing-notice');
    if (el) {
        el.innerHTML = buildTimingNotice(soloRound.startTime, soloRound.startHole, hole);
        var check = checkTiming(soloRound.startTime, soloRound.startHole, hole);
        if (check.status === 'late') toast((currentLang === 'en' ? '⏰ Pace Lag ' : '⏰ Отставание ') + check.diff + ' min!', 'warn');
    }
}

function renderLiveStats(targetId) {
    var el = document.getElementById(targetId);
    if (!el) return;
    var uid = getPlayerId();
    if (!uid || !soloRound || !soloRound.players) return;
    var p = soloRound.players[uid];
    if (!p) return;
    var scores = p.scores || {};
    var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, holeOrder(soloRound.startHole));

    renderHoleProgressBar('solo-progress-bar', stats.holesPlayed);

    var playedLbl = currentLang === 'en' ? 'Completed' : 'Пройдено';
    var projLbl = currentLang === 'en' ? 'Projected' : 'Прогноз';

    var html = '<div class="stats-grid">';
    html += '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">' + stats.holesPlayed + '/18</div><div class="stat-l">' + playedLbl + '</div></div>';
    html += '<div class="stat"><i class="fas fa-golf-ball-tee"></i><div class="stat-n">' + (stats.gross || '—') + '</div><div class="stat-l">Gross</div></div>';
    html += '<div class="stat"><i class="fas fa-chart-line"></i><div class="stat-n ' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</div><div class="stat-l">± Par</div></div>';
    html += '<div class="stat"><i class="fas fa-calculator"></i><div class="stat-n">' + (stats.net || '—') + '</div><div class="stat-l">Net</div></div>';
    html += '<div class="stat"><i class="fas fa-star"></i><div class="stat-n" style="color:var(--gold);">' + stats.stablefordField + '</div><div class="stat-l">' + t('stbl_field') + '</div></div>';
    html += '<div class="stat"><i class="fas fa-star-half-alt"></i><div class="stat-n" style="color:var(--muted);">' + stats.stablefordExact + '</div><div class="stat-l">' + t('stbl_exact') + '</div></div>';

    if (stats.holesRemaining > 0 && stats.holesPlayed > 0) {
        html += '<div class="stat"><i class="fas fa-chart-bar"></i><div class="stat-n">' + (stats.projected || '—') + '</div><div class="stat-l">' + projLbl + '</div></div>';
    }
    html += '</div>';

    if (stats.holesRemaining > 0) {
        var subText = currentLang === 'en' 
            ? 'Remaining: ' + stats.holesRemaining + ' holes · Projected score at par' 
            : 'Осталось: ' + stats.holesRemaining + ' лунок · Прогноз при игре в пар';
        html += '<p style="color:var(--muted);font-size:12px;margin-top:12px;text-align:center;">' + subText + '</p>';
    }

    el.innerHTML = html;
}

function renderMiniCard(targetId) {
    var el = document.getElementById(targetId);
    if (!el) return;
    var uid = getPlayerId();
    if (!uid || !soloRound || !soloRound.players) return;
    var p = soloRound.players[uid];
    if (!p) return;
    var scores = p.scores || {};
    var fieldHcp = p.fieldHcp || 0;
    var exactHcp = p.exactHcp || 0;

    var courseHcpLbl = currentLang === 'en' ? 'Course' : 'пол.';
    var holeHeader = t('hole');
    var parHeader = t('par');
    var scoreHeader = currentLang === 'en' ? 'Score' : 'Счёт';
    var outHeader = t('out');
    var inHeader = t('in_side');
    var totalHeader = t('total');

    var html = '<div style="margin-bottom:12px;font-size:14px;color:var(--gold);font-weight:700;cursor:pointer;" onclick="openPlayerProfileModal(\'' + uid + '\',\'' + soloRid + '\')">' +
        '<i class="fas fa-user-circle"></i> ' + (p.name || t('player')) + ' · HCP: ' + fmtExactHcp(exactHcp) + ' (' + courseHcpLbl + ' ' + fmtFieldHcp(fieldHcp) + ')' +
        '</div>';

    html += '<div class="scorecard" style="margin-bottom:12px;"><table><tr><th>' + holeHeader + '</th>';
    for (var i = 1; i <= 9; i++) html += '<th>' + i + '</th>';
    html += '<th>' + outHeader + '</th></tr><tr class="row-par"><td>' + parHeader + '</td>';
    var pO = 0;
    for (var i = 1; i <= 9; i++) { var pv = holePar(i); pO += pv; html += '<td>' + pv + '</td>'; }
    html += '<td>' + pO + '</td></tr><tr><td>' + scoreHeader + '</td>';
    var gO = 0;
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(scores[i]) || 0, par = holePar(i), cls = holeResClass(s, par);
        if (s >= 1) gO += s;
        html += '<td class="' + cls + '"><b>' + (s >= 1 ? s : '') + '</b></td>';
    }
    html += '<td class="row-total"><b>' + (gO > 0 ? gO : '') + '</b></td></tr>';

    html += '<tr><td>Stblfd (' + courseHcpLbl + ')</td>';
    var sfO = 0;
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(scores[i]) || 0;
        if (s >= 1) { var pts = stablefordField(s, i, fieldHcp); sfO += pts; html += '<td>' + pts + '</td>'; }
        else html += '<td></td>';
    }
    html += '<td class="row-total"><b>' + sfO + '</b></td></tr>';

    html += '<tr><td>Stblfd (playing)</td>';
    var seO = 0;
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(scores[i]) || 0;
        if (s >= 1) { var pts = stablefordExact(s, i, exactHcp); seO += pts; html += '<td>' + pts + '</td>'; }
        else html += '<td></td>';
    }
    html += '<td class="row-total"><b>' + seO + '</b></td></tr></table></div>';

    html += '<div class="scorecard"><table><tr><th>' + holeHeader + '</th>';
    for (var i = 10; i <= 18; i++) html += '<th>' + i + '</th>';
    html += '<th>' + inHeader + '</th><th>' + totalHeader + '</th></tr><tr class="row-par"><td>' + parHeader + '</td>';
    var pI = 0;
    for (var i = 10; i <= 18; i++) { var pv = holePar(i); pI += pv; html += '<td>' + pv + '</td>'; }
    html += '<td>' + pI + '</td><td>' + (pO + pI) + '</td></tr><tr><td>' + scoreHeader + '</td>';
    var gI = 0;
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(scores[i]) || 0, par = holePar(i), cls = holeResClass(s, par);
        if (s >= 1) gI += s;
        html += '<td class="' + cls + '"><b>' + (s >= 1 ? s : '') + '</b></td>';
    }
    html += '<td class="row-total"><b>' + (gI > 0 ? gI : '') + '</b></td><td class="row-total"><b>' + ((gO + gI) > 0 ? (gO + gI) : '') + '</b></td></tr>';

    html += '<tr><td>Stblfd (' + courseHcpLbl + ')</td>';
    var sfI = 0;
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(scores[i]) || 0;
        if (s >= 1) { var pts = stablefordField(s, i, fieldHcp); sfI += pts; html += '<td>' + pts + '</td>'; }
        else html += '<td></td>';
    }
    html += '<td class="row-total"><b>' + sfI + '</b></td><td class="row-total"><b>' + (sfO + sfI) + '</b></td></tr>';

    html += '<tr><td>Stblfd (playing)</td>';
    var seI = 0;
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(scores[i]) || 0;
        if (s >= 1) { var pts = stablefordExact(s, i, exactHcp); seI += pts; html += '<td>' + pts + '</td>'; }
        else html += '<td></td>';
    }
    html += '<td class="row-total"><b>' + seI + '</b></td><td class="row-total"><b>' + (seO + seI) + '</b></td></tr></table></div>';

    el.innerHTML = html;
}

function finishSolo() {
    if (!canEditSolo) return;
    if (!confirm(t('msg_finish_confirm'))) return;
    db.ref('rounds/' + soloRid + '/status').set('completed');
    db.ref('rounds/' + soloRid + '/completedAt').set(Date.now());

    db.ref('rounds/' + soloRid).once('value').then(function(sn) {
        var r = sn.val();
        if (r) saveHistory(soloRid, r);
    });

    toast(t('msg_round_finished'));
    setTimeout(function() {
        if (confirm(currentLang === 'en' ? 'Download player scorecard?' : 'Скачать счётную карточку?')) downloadScorecard(soloRid);
        window.location.href = 'players.html';
    }, 1000);
}

function callOfficial(type) {
    if (!canEditSolo) return;
    var typeName = type === 'referee' ? (currentLang === 'en' ? 'referee' : 'судью') : (currentLang === 'en' ? 'marshal' : 'маршала');
    if (!confirm((currentLang === 'en' ? 'Do you want to call a ' + typeName + ' to hole ' : 'Вы действительно хотите вызвать ' + typeName + ' на лунку ') + curHole + '?')) return;

    var uid = getPlayerId();
    var pName = (soloRound && soloRound.players && soloRound.players[uid]) ? soloRound.players[uid].name : 'Player';

    db.ref('alerts').push({
        roundId: soloRid,
        type: type,
        hole: curHole,
        playerId: uid,
        playerName: pName,
        time: Date.now(),
        status: 'active'
    }).then(function() {
        toast('🚨 ' + (type === 'referee' ? (currentLang === 'en' ? 'Referee' : 'Судья') : (currentLang === 'en' ? 'Marshal' : 'Маршал')) + (currentLang === 'en' ? ' called to hole ' : ' вызван на лунку ') + curHole + '!', 'warn');
        vib([100, 50, 100]);
    });
}
