var curRid = null;
var curRoundData = null;
var registeredUsers = {};
var availableTournaments = {};

// Переменные активной игры
var playHole = 1;
var myUid = null;
var myTargetUid = null;
var myScore = 0;
var targetScore = 0;
var isChanging = false;
var canEditGroup = false;

document.addEventListener('DOMContentLoaded', function() {
    initNav();
    var p = new URLSearchParams(window.location.search);
    curRid = p.get('round');

    // Если сканировали личный QR вида ?round=XYZ&as=PLAYER_ID
    var actingAs = p.get('as');
    if (actingAs && curRid) {
        localStorage.setItem('pestovo_acting_as_' + curRid, actingAs);
        window.history.replaceState(null, null, window.location.pathname + '?round=' + curRid);
    }
});

function onAuthReady(u, d) {
    navAuth(u, d);
    if (curRid) {
        initRoundView();
    }
}

// ==========================================
// СОЗДАНИЕ ГРУППЫ
// ==========================================
function showGroupSetup() {
    document.getElementById('mode-view').classList.add('hidden');
    document.getElementById('group-setup').classList.remove('hidden');

    var sel = document.getElementById('g-hole');
    if (sel) {
        sel.innerHTML = '';
        for (var i = 1; i <= 18; i++) {
            sel.innerHTML += '<option value="' + i + '">Лунка ' + i + ' (Пар ' + holePar(i) + ')</option>';
        }
    }

    var now = new Date();
    var timeInput = document.getElementById('g-time');
    if (timeInput) {
        timeInput.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    db.ref('users').once('value').then(function(sn) {
        registeredUsers = sn.val() || {};
        buildPlayerSlots();
    });

    db.ref('tournaments').once('value').then(function(sn) {
        availableTournaments = sn.val() || {};
        var tnSel = document.getElementById('g-tournament');
        if (tnSel) {
            tnSel.innerHTML = '<option value="">— Без турнира —</option>';
            Object.entries(availableTournaments).forEach(function(e) {
                var t = e[1];
                if (t.status === 'completed') return;
                tnSel.innerHTML += '<option value="' + e[0] + '">' + (t.name || '—') + ' · ' + fmtDate(new Date(t.date).getTime()) + '</option>';
            });
            tnSel.addEventListener('change', onTournamentSelect);
        }
    });
}

function onTournamentSelect() {
    var tid = document.getElementById('g-tournament').value;
    var teeSel = document.getElementById('g-tee');
    var fmtSel = document.getElementById('g-format');

    if (!tid) {
        teeSel.innerHTML = '<option value="bk">⬛ Чёрный</option><option value="bl">🟦 Синий</option><option value="wh" selected>⬜ Белый</option><option value="rd">🟥 Красный</option>';
        fmtSel.innerHTML = '<option value="Stroke Play">Stroke Play</option><option value="Stableford">Stableford</option>';
        return;
    }
    var t = availableTournaments[tid];
    if (!t) return;
    teeSel.innerHTML = ''; 
    (t.tees || ['wh']).forEach(function(tk) { teeSel.innerHTML += '<option value="' + tk + '">' + TEES[tk] + '</option>'; });
    fmtSel.innerHTML = ''; 
    (t.formats || ['Stroke Play']).forEach(function(f) { fmtSel.innerHTML += '<option value="' + f + '">' + f + '</option>'; });
}

function buildPlayerSlots() {
    var count = parseInt(document.getElementById('g-count').value) || 2;
    var el = document.getElementById('player-slots');
    var html = '<h3 style="margin-top:16px;color:var(--gold);"><i class="fas fa-user-plus"></i> Игроки</h3>';

    for (var i = 1; i <= count; i++) {
        html += '<div class="card" style="background:var(--input);padding:16px;margin-bottom:12px;">';
        html += '<h3 style="color:var(--gold);font-size:14px;">Игрок #' + i + '</h3>';
        html += '<div class="form-group"><label>Выбрать из зарегистрированных</label>';
        html += '<select class="form-input" id="pl-select-' + i + '" onchange="fillPlayerFromUser(' + i + ')">';
        html += '<option value="">— Гость / ввести вручную —</option>';
        
        Object.entries(registeredUsers).forEach(function(e) {
            var u = e[1];
            var isCurrent = (i === 1 && currentUser && e[0] === currentUser.uid);
            var sel = isCurrent ? 'selected' : '';
            html += '<option value="' + e[0] + '" ' + sel + '>' + (u.name || '—') + ' (HCP: ' + (u.handicap != null ? u.handicap : '—') + ')</option>';
        });
        
        html += '</select></div>';

        html += '<div class="form-row">';
        html += '<div class="form-group"><label>Имя</label><input type="text" id="pl-name-' + i + '" class="form-input" placeholder="Имя Фамилия"></div>';
        html += '<div class="form-group"><label>Пол</label><select id="pl-gender-' + i + '" class="form-input" onchange="calcPlayerFieldHcp(' + i + ')"><option value="men">Мужчина</option><option value="women">Женщина</option></select></div>';
        html += '</div>';

        html += '<div class="form-row">';
        html += '<div class="form-group"><label>Точный HCP</label><input type="number" id="pl-hcp-' + i + '" class="form-input" step="0.1" placeholder="12.4" oninput="calcPlayerFieldHcp(' + i + ')"></div>';
        html += '<div class="form-group"><label>Полевой (авто)</label><input type="text" id="pl-field-' + i + '" class="form-input" readonly></div>';
        html += '</div></div>';
    }
    el.innerHTML = html;

    setTimeout(function() { fillPlayerFromUser(1); }, 100);
}

function fillPlayerFromUser(idx) {
    var sel = document.getElementById('pl-select-' + idx);
    if (!sel) return;
    var uid = sel.value;
    if (!uid || !registeredUsers[uid]) return;
    var u = registeredUsers[uid];
    
    var nameEl = document.getElementById('pl-name-' + idx);
    var hcpEl = document.getElementById('pl-hcp-' + idx);
    var genderEl = document.getElementById('pl-gender-' + idx);

    if (nameEl) nameEl.value = u.name || '';
    if (hcpEl) hcpEl.value = u.handicap != null ? u.handicap : '';
    if (genderEl && u.gender) genderEl.value = u.gender;
    
    calcPlayerFieldHcp(idx);
}

function calcPlayerFieldHcp(idx) {
    var hcpEl = document.getElementById('pl-hcp-' + idx);
    var genderEl = document.getElementById('pl-gender-' + idx);
    var teeEl = document.getElementById('g-tee');
    
    if (!hcpEl || !genderEl || !teeEl) return;
    var hcp = hcpEl.value;
    var gender = genderEl.value;
    var tee = teeEl.value;

    var fieldEl = document.getElementById('pl-field-' + idx);
    if (!hcp) { 
        if (fieldEl) fieldEl.value = ''; 
        return; 
    }
    
    var field = getFieldHcp(parseFloat(hcp), tee, gender);
    if (fieldEl) fieldEl.value = field;
}

document.addEventListener('change', function(e) {
    if (e.target.id === 'g-tee') {
        var count = parseInt(document.getElementById('g-count').value) || 2;
        for (var i = 1; i <= count; i++) calcPlayerFieldHcp(i);
    }
});

function backToModes() {
    document.getElementById('group-setup').classList.add('hidden');
    document.getElementById('mode-view').classList.remove('hidden');
}

// ==========================================
// СТАРТ И АВТО-МАРКЕРЫ
// ==========================================
function startGroup() {
    var timeStr = document.getElementById('g-time').value;
    var startHole = parseInt(document.getElementById('g-hole').value) || 1;
    var tee = document.getElementById('g-tee').value;
    var format = document.getElementById('g-format').value;
    var count = parseInt(document.getElementById('g-count').value) || 2;
    var tournamentId = document.getElementById('g-tournament') ? document.getElementById('g-tournament').value : '';

    if (!timeStr) { toast('Укажите время старта', 'error'); return; }

    var players = {};
    var pOrder = [];

    for (var i = 1; i <= count; i++) {
        var selectEl = document.getElementById('pl-select-' + i);
        var uid = selectEl ? selectEl.value : '';
        var nameEl = document.getElementById('pl-name-' + i);
        var name = nameEl ? nameEl.value.trim() : '';
        var hcp = document.getElementById('pl-hcp-' + i).value;
        var gender = document.getElementById('pl-gender-' + i).value;

        if (!name) { toast('Заполните имя игрока #' + i, 'error'); return; }

        var pid = uid || 'guest_' + Date.now() + '_' + i;
        var fieldHcp = hcp ? getFieldHcp(parseFloat(hcp), tee, gender) : 0;

        players[pid] = {
            name: name,
            exactHcp: hcp ? parseFloat(hcp) : null,
            fieldHcp: fieldHcp,
            gender: gender,
            scores: {},
            markerScores: {},
            verified: {}
        };
        pOrder.push(pid);
    }

    // Назначаем маркеры по кругу
    var markerAssignments = {};
    for (var i = 0; i < pOrder.length; i++) {
        var markerId = pOrder[i];
        var targetId = pOrder[(i + 1) % pOrder.length];

        players[targetId].markedBy = markerId; 
        markerAssignments[markerId] = {
            targetId: targetId,
            targetName: players[targetId].name
        };
    }

    var parts = timeStr.split(':');
    var now = new Date();
    var startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(parts[0]), parseInt(parts[1]), 0);

    var creatorId = currentUser ? currentUser.uid : pOrder[0];
    var accessKey = 'group_key_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

    var data = {
        mode: 'group',
        tee: tee,
        format: format,
        startHole: startHole,
        startTime: startDate.getTime(),
        players: players,
        markerAssignments: markerAssignments,
        participantsList: pOrder,
        status: 'active',
        createdAt: Date.now(),
        createdBy: creatorId,
        accessKey: accessKey
    };

    if (tournamentId) data.tournamentId = tournamentId;

    var ref = db.ref('rounds').push();
    var newRoundId = ref.key;
    
    // Создатель запоминает ключ раунда и свой ID
    localStorage.setItem('pestovo_group_key_' + newRoundId, accessKey);
    localStorage.setItem('pestovo_acting_as_' + newRoundId, pOrder[0]);

    ref.set(data).then(function() {
        toast('🏌️ Раунд начат!');
        window.location.href = 'live.html?round=' + newRoundId;
    });
}

// ==========================================
// ПРОВЕРКА ДОСТУПА К РАУНДУ
// ==========================================
function getActingUid() {
    if (!curRoundData || !curRoundData.players) return null;

    // 1. Проверяем токен локального игрока (?as=PID или localStorage)
    var storedUid = localStorage.getItem('pestovo_acting_as_' + curRid);
    if (storedUid && curRoundData.players[storedUid]) {
        return storedUid;
    }

    // 2. Проверяем залогиненного пользователя Firebase Auth
    if (currentUser && curRoundData.players[currentUser.uid]) {
        return currentUser.uid;
    }

    // 3. Проверяем если это создатель через ключ accessKey
    var localKey = localStorage.getItem('pestovo_group_key_' + curRid);
    if (localKey && curRoundData.accessKey === localKey) {
        // Возвращаем первого игрока раунда
        return Object.keys(curRoundData.players)[0];
    }

    return null;
}

function initRoundView() {
    db.ref('rounds/' + curRid).on('value', function(sn) {
        curRoundData = sn.val();
        if (!curRoundData) {
            toast('Раунд не найден', 'error');
            return;
        }

        document.getElementById('mode-view').classList.add('hidden');

        // Определяем кто мы
        myUid = getActingUid();
        canEditGroup = (myUid !== null) && (curRoundData.status === 'active');

        if (canEditGroup) {
            // МЫ УЧАСТНИК — Включаем активный ввод счёта
            document.getElementById('active-scoring-view').classList.remove('hidden');
            document.getElementById('group-view').classList.add('hidden');

            var myPlayer = curRoundData.players[myUid];
            document.getElementById('my-player-name-title').textContent = myPlayer ? myPlayer.name : 'Мой счёт';

            if (curRoundData.markerAssignments && curRoundData.markerAssignments[myUid]) {
                myTargetUid = curRoundData.markerAssignments[myUid].targetId;
                var targetPlayer = curRoundData.players[myTargetUid];
                document.getElementById('mark-player-name').textContent = targetPlayer ? targetPlayer.name : 'Партнёр';
                document.getElementById('marker-input-container').classList.remove('hidden');
            } else {
                document.getElementById('marker-input-container').classList.add('hidden');
            }

            if (!isChanging) {
                findCurrentHole();
            }

            renderPlayHole();
            buildPlayHolesNav();
            renderPlaySummary();
            renderInviteQRs();

        } else {
            // ЗРИТЕЛЬ — Показываем только просмотр лидерборда
            document.getElementById('active-scoring-view').classList.add('hidden');
            document.getElementById('group-view').classList.remove('hidden');

            document.getElementById('gv-info').innerHTML = '<div><b>Старт:</b> ' + fmtTime(curRoundData.startTime) + ' · <b>С лунки:</b> ' + curRoundData.startHole + '</div>';
            renderGVPlayers(curRoundData);
            renderInviteQRs();
        }
    });
}

function findCurrentHole() {
    var order = holeOrder(curRoundData.startHole || 1);
    var myScores = (curRoundData.players[myUid] && curRoundData.players[myUid].scores) || {};
    playHole = order[0];
    for (var i = 0; i < order.length; i++) {
        if (!(parseInt(myScores[order[i]]) > 0)) {
            playHole = order[i];
            break;
        }
    }
}

// ==========================================
// ЛОГИКА ВВОДА СЧЁТА
// ==========================================
function buildPlayHolesNav() {
    if (!canEditGroup) return;
    var el = document.getElementById('play-holes-nav');
    var order = holeOrder(curRoundData.startHole || 1);
    var myScores = (curRoundData.players[myUid] && curRoundData.players[myUid].scores) || {};
    var myVerified = (curRoundData.players[myUid] && curRoundData.players[myUid].verified) || {};

    var html = '';
    order.forEach(function(h) {
        var s = parseInt(myScores[h]) || 0;
        var v = myVerified[h];
        var cls = h === playHole ? 'active' : '';

        if (s > 0) {
            if (v === true) cls += ' verified';
            else if (v === false) cls += ' mismatch';
            else cls += ' done';
        }

        html += '<button class="hole-btn ' + cls + '" onclick="goPlayHole(' + h + ')">' + h + '</button>';
    });
    el.innerHTML = html;
}

function goPlayHole(h) {
    if (!canEditGroup) return;
    isChanging = true;
    playHole = h;
    myScore = 0;
    targetScore = 0;
    renderPlayHole();
    buildPlayHolesNav();
    setTimeout(function() { isChanging = false; }, 100);
}

function renderPlayHole() {
    if (!canEditGroup) return;
    var par = holePar(playHole);
    var dist = holeDist(playHole, curRoundData.tee);

    document.getElementById('play-hole').textContent = playHole;
    document.getElementById('play-par').textContent = par;
    document.getElementById('play-dist').textContent = dist > 0 ? dist : '—';

    // Мой счёт
    var mySaved = parseInt(curRoundData.players[myUid] && curRoundData.players[myUid].scores && curRoundData.players[myUid].scores[playHole]) || 0;
    myScore = mySaved > 0 ? mySaved : par;

    // Счёт маркируемого игрока
    if (myTargetUid) {
        var targetSaved = parseInt(curRoundData.players[myTargetUid] && curRoundData.players[myTargetUid].markerScores && curRoundData.players[myTargetUid].markerScores[myUid] && curRoundData.players[myTargetUid].markerScores[myUid][playHole]) || 0;
        targetScore = targetSaved > 0 ? targetSaved : par;
    }

    updScoreDisplay('my', myScore);
    updScoreDisplay('mark', targetScore);

    var myFieldHcp = (curRoundData.players[myUid] && curRoundData.players[myUid].fieldHcp) || 0;
    var net = calcNettScore(myScore, par, holeHcp(playHole), myFieldHcp);
    document.getElementById('my-net-badge').textContent = 'Net: ' + net;

    checkPlayVerification();
}

function adjScore(who, delta) {
    if (!canEditGroup) return;
    if (who === 'my') {
        myScore = Math.max(1, Math.min(15, myScore + delta));
        updScoreDisplay('my', myScore);
        var myFieldHcp = (curRoundData.players[myUid] && curRoundData.players[myUid].fieldHcp) || 0;
        var net = calcNettScore(myScore, holePar(playHole), holeHcp(playHole), myFieldHcp);
        document.getElementById('my-net-badge').textContent = 'Net: ' + net;
    } else {
        targetScore = Math.max(1, Math.min(15, targetScore + delta));
        updScoreDisplay('mark', targetScore);
    }
    vib();
}

function updScoreDisplay(who, score) {
    var par = holePar(playHole);
    document.getElementById(who + '-disp').textContent = score;
    var r = document.getElementById(who + '-result');
    r.textContent = holeResName(score, par);
    r.className = 'score-result ' + holeResClass(score, par);
}

function checkPlayVerification() {
    var box = document.getElementById('play-verify-status');
    var myPlayer = curRoundData.players[myUid];
    var myS = parseInt(myPlayer && myPlayer.scores && myPlayer.scores[playHole]) || 0;
    var myMarkerId = myPlayer && myPlayer.markedBy;
    var markerS = 0;

    if (myMarkerId && curRoundData.players[myMarkerId]) {
        markerS = parseInt(myPlayer.markerScores && myPlayer.markerScores[myMarkerId] && myPlayer.markerScores[myMarkerId][playHole]) || 0;
    }

    if (myS > 0 && markerS > 0 && myS === markerS) {
        box.innerHTML = '<div class="verify-ok">✅ Ваш счёт на лунке ' + playHole + ' подтверждён маркером (' + myS + ' уд.)</div>';
    } else if (myS > 0 && markerS > 0 && myS !== markerS) {
        box.innerHTML = '<div class="verify-fail">⚠️ НЕСОВПАДЕНИЕ! Вы: ' + myS + ' | Маркер: ' + markerS + '</div>';
    } else if (myS > 0) {
        box.innerHTML = '<div class="verify-wait">⏳ Ожидаем подтверждения от вашего маркера...</div>';
    } else {
        box.innerHTML = '';
    }
}

function saveHoleScores() {
    if (!canEditGroup) { toast('Редактирование запрещено', 'error'); return; }
    if (myScore < 1 || (myTargetUid && targetScore < 1)) { toast('Счёт должен быть ≥ 1', 'error'); return; }

    isChanging = true;
    var h = playHole;
    var updates = {};

    // 1. Сохраняем мой счёт
    updates['rounds/' + curRid + '/players/' + myUid + '/scores/' + h] = myScore;

    // 2. Сохраняем счёт партнёра
    if (myTargetUid) {
        updates['rounds/' + curRid + '/players/' + myTargetUid + '/markerScores/' + myUid + '/' + h] = targetScore;
    }

    // 3. Верификация моего счёта
    var myPlayer = curRoundData.players[myUid];
    var myMarkerId = myPlayer && myPlayer.markedBy;
    if (myMarkerId) {
        var myMarkerScore = parseInt(myPlayer.markerScores && myPlayer.markerScores[myMarkerId] && myPlayer.markerScores[myMarkerId][h]) || 0;
        if (myMarkerScore > 0 && myMarkerScore === myScore) {
            updates['rounds/' + curRid + '/players/' + myUid + '/verified/' + h] = true;
        } else if (myMarkerScore > 0) {
            updates['rounds/' + curRid + '/players/' + myUid + '/verified/' + h] = false;
        }
    }

    // 4. Верификация счёта партнёра
    if (myTargetUid) {
        var targetPlayer = curRoundData.players[myTargetUid];
        var targetSelfScore = parseInt(targetPlayer && targetPlayer.scores && targetPlayer.scores[h]) || 0;
        if (targetSelfScore > 0 && targetSelfScore === targetScore) {
            updates['rounds/' + curRid + '/players/' + myTargetUid + '/verified/' + h] = true;
        } else if (targetSelfScore > 0) {
            updates['rounds/' + curRid + '/players/' + myTargetUid + '/verified/' + h] = false;
        }
    }

    db.ref().update(updates).then(function() {
        toast('✅ Сохранено на лунке ' + h);
        vib();

        var order = holeOrder(curRoundData.startHole || 1);
        var idx = order.indexOf(h);
        if (idx >= 0 && idx < order.length - 1) {
            playHole = order[idx + 1];
        }

        renderPlayHole();
        buildPlayHolesNav();
        renderPlaySummary();
        setTimeout(function() { isChanging = false; }, 200);
    });
}

function renderPlaySummary() {
    var el = document.getElementById('play-group-summary');
    if (!el) return;
    var order = holeOrder(curRoundData.startHole || 1);
    var html = '';

    Object.entries(curRoundData.players || {}).forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);
        var isMe = pid === myUid ? ' <span style="font-size:10px;color:var(--gold);">(Вы)</span>' : '';

        html += '<div class="list-item" style="padding:10px;">';
        html += '<div><strong style="color:var(--white);">' + p.name + isMe + '</strong>';
        html += '<div style="font-size:12px;color:var(--muted);">Лунок: ' + stats.holesPlayed + ' / 18</div></div>';
        html += '<div style="text-align:right;">';
        html += '<div class="' + scoreClass(stats.toPar) + '" style="font-weight:800;">' + fmtScore(stats.toPar) + '</div>';
        html += '<div style="font-size:11px;color:var(--muted);">Gross: ' + (stats.gross || 0) + ' · Net: ' + (stats.net || 0) + '</div>';
        html += '</div></div>';
    });

    el.innerHTML = html;
}

// ==========================================
// ГЕНЕРАЦИЯ QR ДЛЯ ПОДКЛЮЧЕНИЯ ИГРОКОВ
// ==========================================
function renderInviteQRs() {
    var activeEl = document.getElementById('invite-qrs-grid');
    var gvEl = document.getElementById('gv-qr-grid');
    var base = baseUrl();
    var html = '';

    Object.entries(curRoundData.players || {}).forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var url = base + 'live.html?round=' + curRid + '&as=' + pid;

        html += '<div class="qr-card">';
        html += '<div class="qr-name" style="color:var(--white);"><i class="fas fa-mobile-alt"></i> Игрок: ' + p.name + '</div>';
        html += '<div style="font-size:11px;color:var(--gold);margin-bottom:6px;">Сканируй, чтобы играть за этого игрока</div>';
        html += '<img src="' + qrUrl(url) + '" alt="QR">';
        html += '<div class="qr-url"><a href="' + url + '" target="_blank">' + url + '</a></div>';
        html += '</div>';
    });

    if (activeEl) activeEl.innerHTML = html;
    if (gvEl) gvEl.innerHTML = html;
}

// ==========================================
// ВЫЗОВ СУДЬИ / МАРШАЛА
// ==========================================
function callOfficial(type) {
    if (!canEditGroup) return;
    var typeName = type === 'referee' ? 'Судью' : 'Маршала';
    if (!confirm('Вы действительно хотите вызвать ' + typeName.toLowerCase() + 'а на лунку ' + playHole + '?')) return;

    var pName = (curRoundData && curRoundData.players[myUid]) ? curRoundData.players[myUid].name : 'Игрок';

    db.ref('alerts').push({
        roundId: curRid,
        type: type,
        hole: playHole,
        playerId: myUid,
        playerName: pName,
        time: Date.now(),
        status: 'active'
    }).then(function() {
        toast('🚨 ' + (type === 'referee' ? 'Судья' : 'Маршал') + ' вызван на лунку ' + playHole + '!', 'warn');
        vib([100, 50, 100]);
    });
}

// ==========================================
// РЕЖИМ ПРОСМОТРА (ЗРИТЕЛЬ)
// ==========================================
function renderGVPlayers(r) {
    var el = document.getElementById('gv-players');
    var scEl = document.getElementById('gv-scorecards');
    var order = holeOrder(r.startHole || 1);
    
    var html = '';
    var scHtml = '';

    Object.entries(r.players || {}).forEach(function(pe) {
        var p = pe[1];
        var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);
        var thruTxt = stats.holesPlayed >= 18 ? 'Завершил (F)' : (stats.currentHole ? 'лунка №' + stats.currentHole : '—');

        if (typeof generatePestovoScorecardHTML === 'function') {
            scHtml += generatePestovoScorecardHTML(p, r);
        }

        html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;">' +
            '<div><strong style="color:var(--white);">' + (p.name || '—') + '</strong>' +
            '<div style="font-size:12px;color:var(--gold);font-weight:600;margin-top:2px;">📍 ' + thruTxt + '</div>' +
            '<div style="font-size:11px;color:var(--muted);margin-top:2px;">Gross: ' + (stats.gross || 0) + ' · Net: ' + (stats.net || 0) + ' · Stblfd: ' + stats.stablefordField + '</div>' +
            '</div>' +
            '<div class="' + scoreClass(stats.toPar) + '" style="font-size:20px;font-weight:800;">' + fmtScore(stats.toPar) + '</div></div>';
    });

    el.innerHTML = html;
    if (scEl) scEl.innerHTML = scHtml;
}

function finishGroupRound() {
    if (!canEditGroup) return;
    if (!confirm('Завершить раунд для ВСЕЙ группы?')) return;

    db.ref('rounds/' + curRid + '/status').set('completed');
    db.ref('rounds/' + curRid + '/completedAt').set(Date.now());

    db.ref('rounds/' + curRid).once('value').then(function(sn) {
        var r = sn.val();
        if (r) saveHistory(curRid, r);
    });

    toast('🏁 Раунд завершён!');
    setTimeout(function() {
        if (confirm('Скачать счётные карточки игроков?')) downloadScorecard(curRid);
        window.location.href = 'leaderboard.html';
    }, 1000);
}
