var currentSetupMode = 'solo'; // 'solo' or 'group'

document.addEventListener('DOMContentLoaded', function() {
    initNav();
    initSetupPage();
});

function onAuthReady(u, d) {
    navAuth(u, d);
    if (u && d && currentSetupMode === 'solo') {
        fillSetupPlayerDefaults(1, d);
    }
}

function initSetupPage() {
    var holeSel = document.getElementById('setup-hole');
    if (holeSel) {
        holeSel.innerHTML = '';
        for (var i = 1; i <= 18; i++) {
            holeSel.innerHTML += '<option value="' + i + '">' + t('hole') + ' ' + i + ' (' + t('par') + ' ' + holePar(i) + ')</option>';
        }
    }

    var now = new Date();
    var timeInp = document.getElementById('setup-time');
    if (timeInp) {
        timeInp.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    var urlP = new URLSearchParams(window.location.search);
    var modeParam = urlP.get('mode');
    if (modeParam === 'group') {
        setSetupMode('group');
    } else {
        setSetupMode('solo');
    }
}

function setSetupMode(mode) {
    currentSetupMode = mode;
    var btnSolo = document.getElementById('btn-mode-solo');
    var btnGroup = document.getElementById('btn-mode-group');
    var countWrap = document.getElementById('group-count-wrap');
    var fmtSel = document.getElementById('setup-format');

    if (mode === 'solo') {
        if (btnSolo) btnSolo.classList.add('active');
        if (btnGroup) btnGroup.classList.remove('active');
        if (countWrap) countWrap.style.display = 'none';
        if (fmtSel) {
            fmtSel.innerHTML =
                '<option value="Stroke Play">Stroke Play</option>' +
                '<option value="Stableford">Stableford</option>';
        }
    } else {
        if (btnSolo) btnSolo.classList.remove('active');
        if (btnGroup) btnGroup.classList.add('active');
        if (countWrap) countWrap.style.display = 'block';
        if (fmtSel) {
            fmtSel.innerHTML =
                '<option value="Stroke Play">Stroke Play</option>' +
                '<option value="Stableford">Stableford</option>' +
                '<option value="Match Play 1v1">Матч-плей (1х1)</option>' +
                '<option value="Match Play 2v2">Матч-плей (2х2)</option>' +
                '<option value="Scramble">Скрембл (Scramble)</option>';
        }
    }
    renderSetupPlayerSlots();
}

function renderSetupPlayerSlots() {
    var container = document.getElementById('setup-players-container');
    if (!container) return;

    var count = currentSetupMode === 'solo' ? 1 : (parseInt(document.getElementById('setup-count').value) || 2);
    var html = '';

    for (var i = 1; i <= count; i++) {
        var pTitle = currentSetupMode === 'solo' ? 'Данные игрока' : ('Игрок #' + i);
        html += '<div class="card player-search-card" id="sp-card-' + i + '">';
        html += '<h2><i class="fas fa-user"></i> <span>' + pTitle + '</span></h2>';

        html += '<div class="form-group" style="position:relative;margin-bottom:14px;">';
        html += '<label><i class="fas fa-search" style="color:var(--gold);"></i> <span>Поиск игрока (Имя или Фамилия)</span></label>';
        html += '<input type="text" id="sp-search-' + i + '" class="form-input" placeholder="Введите имя или фамилию (напр. во, петр)..." autocomplete="off" oninput="onSetupSearchInput(' + i + ')">';
        html += '<div id="sp-results-' + i + '" class="search-results-list hidden" style="display:none;"></div>';
        html += '</div>';

        html += '<div class="form-row">';
        html += '<div class="form-group" style="flex:1.4 1 140px;"><label>Имя и фамилия</label><input type="text" id="sp-name-' + i + '" class="form-input" placeholder="Иван Петров"><input type="hidden" id="sp-uid-' + i + '" value=""></div>';
        html += '<div class="form-group" style="flex:1 1 100px;"><label>Пол</label><select id="sp-gender-' + i + '" class="form-input" onchange="calcSetupPlayerHcp(' + i + ')"><option value="men">👨 Мужчина</option><option value="women">👩 Женщина</option></select></div>';
        html += '</div>';

        html += '<div class="form-row form-row-3">';
        html += '<div class="form-group"><label>ТИ игрока</label><select id="sp-tee-' + i + '" class="form-input" onchange="calcSetupPlayerHcp(' + i + ')"><option value="bk">⬛ Чёрный</option><option value="bl" selected>🟦 Синий</option><option value="wh">⬜ Белый</option><option value="rd">🟥 Красный</option></select></div>';
        html += '<div class="form-group"><label>Точный HCP</label><input type="text" id="sp-hcp-' + i + '" class="form-input" placeholder="13.0 или +2.4" oninput="calcSetupPlayerHcp(' + i + ')"></div>';
        html += '<div class="form-group"><label>Полевой HCP</label><input type="text" id="sp-field-' + i + '" class="form-input" readonly placeholder="—"></div>';
        html += '</div>';

        html += '</div>';
    }

    container.innerHTML = html;

    if (currentUser && currentUserData) {
        fillSetupPlayerDefaults(1, currentUserData);
    }
}

function fillSetupPlayerDefaults(idx, u) {
    var nameInp = document.getElementById('sp-name-' + idx);
    var uidInp = document.getElementById('sp-uid-' + idx);
    var genderSel = document.getElementById('sp-gender-' + idx);
    var teeSel = document.getElementById('sp-tee-' + idx);
    var hcpInp = document.getElementById('sp-hcp-' + idx);

    if (nameInp && !nameInp.value) nameInp.value = u.name || '';
    if (uidInp) uidInp.value = currentUser ? currentUser.uid : (u.uid || '');
    if (genderSel && u.gender) genderSel.value = u.gender;
    if (teeSel && u.defaultTee) teeSel.value = u.defaultTee;
    if (hcpInp && u.handicap != null) hcpInp.value = fmtExactHcp(u.handicap);

    calcSetupPlayerHcp(idx);
}

function onSetupSearchInput(idx) {
    var searchInp = document.getElementById('sp-search-' + idx);
    var resultsEl = document.getElementById('sp-results-' + idx);
    if (!searchInp || !resultsEl) return;

    var query = normalizeSearchText(searchInp.value);
    if (!query || query.length < 1) {
        resultsEl.style.display = 'none';
        resultsEl.classList.add('hidden');
        return;
    }

    var usersData = getKnownPlayersSync();
    var matches = [];
    var seenKeys = new Set();

    // Если выполнена полная очистка и кэш пуст — сразу выходим, ничего не показываем
    if (!usersData || !Object.keys(usersData).length) {
        resultsEl.style.display = 'none';
        resultsEl.classList.add('hidden');
        return;
    }

    Object.entries(usersData || {}).forEach(function(e) {
        var uid = e[0];
        var u = e[1];
        if (!u) return;
        // Не показываем удалённых и демо-игроков, если включена полная очистка
        if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, u.name)) return;
        if (typeof areDefaultPlayersCleared === 'function' && areDefaultPlayersCleared()) {
            if (typeof DEFAULT_REGISTERED_PLAYERS !== 'undefined' && DEFAULT_REGISTERED_PLAYERS[uid]) return;
        }
        var name = (u.name || '').trim();
        var fn = (u.firstName || '').trim();
        var ln = (u.lastName || '').trim();
        var email = (u.email || '').trim();

        var full = (fn + ' ' + ln).trim() || name;
        if (!full) return;

        var normKey = uid + '_' + normalizeSearchText(full) + '_' + (u.handicap != null ? u.handicap : '');
        if (seenKeys.has(normKey)) return;

        var fnNorm = normalizeSearchText(fn);
        var lnNorm = normalizeSearchText(ln);
        var fullNorm = normalizeSearchText(full);
        var nameNorm = normalizeSearchText(name);
        var emailNorm = normalizeSearchText(email);

        var isMatch = (
            fnNorm.startsWith(query) ||
            lnNorm.startsWith(query) ||
            fullNorm.startsWith(query) ||
            nameNorm.startsWith(query) ||
            fullNorm.includes(query) ||
            nameNorm.includes(query) ||
            emailNorm.includes(query)
        );

        if (isMatch) {
            seenKeys.add(normKey);
            matches.push({
                uid: uid,
                name: full,
                handicap: u.handicap != null ? u.handicap : 0,
                gender: u.gender || 'men',
                defaultTee: u.defaultTee || (u.gender === 'women' ? 'rd' : 'bl'),
                isGuest: !!u.isGuest
            });
        }
    });

    if (matches.length === 0) {
        resultsEl.style.display = 'none';
        resultsEl.classList.add('hidden');
        return;
    }

    var html = '';
    matches.slice(0, 8).forEach(function(m, mIdx) {
        var gIcon = m.gender === 'women' ? '👩' : '👨';
        var hcpText = fmtExactHcp(m.handicap) + ' HCP';
        var guestTag = m.isGuest ? ' <span style="font-size:10px;color:var(--gold);">(Гость)</span>' : '';

        html += '<div class="search-result-item" data-idx="' + mIdx + '" data-uid="' + m.uid + '">';
        html += '<span>' + gIcon + ' <strong style="color:var(--white);font-size:14px;">' + escapeHtml(m.name) + '</strong>' + guestTag + '</span>';
        html += '<span style="color:var(--gold);font-weight:700;font-size:13px;">' + hcpText + '</span>';
        html += '</div>';
    });

    resultsEl.innerHTML = html;
    resultsEl.style.display = 'block';
    resultsEl.classList.remove('hidden');

    resultsEl.querySelectorAll('.search-result-item').forEach(function(item, mIdx) {
        var mObj = matches[mIdx];
        var handleTap = function(evt) {
            if (evt.cancelable) evt.preventDefault();
            evt.stopPropagation();
            selectSetupPlayerMatchObj(idx, mObj);
        };
        item.addEventListener('touchstart', handleTap, { passive: false });
        item.addEventListener('mousedown', handleTap);
        item.addEventListener('click', handleTap);
    });
}

function selectSetupPlayerMatchObj(idx, m) {
    var searchInp = document.getElementById('sp-search-' + idx);
    var resultsEl = document.getElementById('sp-results-' + idx);
    var nameInp = document.getElementById('sp-name-' + idx);
    var uidInp = document.getElementById('sp-uid-' + idx);
    var genderSel = document.getElementById('sp-gender-' + idx);
    var teeSel = document.getElementById('sp-tee-' + idx);
    var hcpInp = document.getElementById('sp-hcp-' + idx);

    if (nameInp) nameInp.value = m.name;
    if (uidInp) uidInp.value = m.uid;
    if (genderSel) genderSel.value = m.gender;
    if (teeSel) {
        if (m.defaultTee) teeSel.value = m.defaultTee;
        else if (m.gender === 'women') teeSel.value = 'rd';
        else teeSel.value = 'bl';
    }
    if (hcpInp) hcpInp.value = fmtExactHcp(m.handicap);

    if (searchInp) {
        searchInp.value = m.name;
        try { searchInp.blur(); } catch(e) {}
    }
    if (resultsEl) {
        resultsEl.style.display = 'none';
        resultsEl.classList.add('hidden');
    }

    calcSetupPlayerHcp(idx);
    toast('👤 Выбран игрок: ' + m.name + ' (' + fmtExactHcp(m.handicap) + ' HCP)', 'info');
}

function calcSetupPlayerHcp(idx) {
    var hcpInp = document.getElementById('sp-hcp-' + idx);
    var genderSel = document.getElementById('sp-gender-' + idx);
    var teeSel = document.getElementById('sp-tee-' + idx);
    var fieldInp = document.getElementById('sp-field-' + idx);

    if (!hcpInp || !genderSel || !teeSel || !fieldInp) return;

    var hcp = hcpInp.value;
    var gender = genderSel.value;
    var tee = teeSel.value;

    if (!hcp && hcp !== '0') {
        fieldInp.value = '';
        return;
    }

    var parsed = parseExactHcp(hcp);
    var field = getFieldHcp(parsed, tee, gender);
    fieldInp.value = fmtFieldHcp(field);
}

function submitSetupRound() {
    var timeStr = document.getElementById('setup-time').value;
    var startHole = parseInt(document.getElementById('setup-hole').value) || 1;
    var format = document.getElementById('setup-format').value;
    var count = currentSetupMode === 'solo' ? 1 : (parseInt(document.getElementById('setup-count').value) || 2);

    if (!timeStr) {
        toast('⚠️ Укажите время старта раунда', 'error');
        return;
    }

    var parts = timeStr.split(':');
    var now = new Date();
    var startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(parts[0]), parseInt(parts[1]), 0);
    var startTime = startDate.getTime();

    if (currentSetupMode === 'solo') {
        var nameInp = document.getElementById('sp-name-1');
        var uidInp = document.getElementById('sp-uid-1');
        var genderSel = document.getElementById('sp-gender-1');
        var teeSel = document.getElementById('sp-tee-1');
        var hcpInp = document.getElementById('sp-hcp-1');

        var name = nameInp ? sanitizeNameRaw(nameInp.value) : '';
        if (!name) { toast('⚠️ Укажите имя игрока', 'error'); return; }

        var uid = uidInp ? uidInp.value : '';
        var gender = genderSel ? genderSel.value : 'men';
        var tee = teeSel ? teeSel.value : 'wh';
        var exactHcp = parseExactHcp(hcpInp ? hcpInp.value : '0');
        var fieldHcp = getFieldHcp(exactHcp, tee, gender);

        var regId = registerGuestPlayerInDatabase({
            uid: uid,
            name: name,
            exactHcp: exactHcp,
            gender: gender,
            tee: tee
        });
        if (!uid && regId) uid = regId;

        var pid = uid || (currentUser ? currentUser.uid : 'guest_' + Date.now());
        var isGuest = !uid && !currentUser;

        var players = {};
        players[pid] = {
            name: name,
            exactHcp: exactHcp,
            fieldHcp: fieldHcp,
            gender: gender,
            tee: tee,
            isGuest: isGuest,
            scores: {},
            submitted: false
        };

        var accessKey = 'key_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        var data = {
            mode: 'solo',
            tee: tee,
            format: format,
            startHole: startHole,
            startTime: startTime,
            players: players,
            status: 'active',
            createdAt: Date.now(),
            createdBy: pid,
            accessKey: accessKey
        };

        var ref = db.ref('rounds').push();
        var newRoundId = ref.key;

        localStorage.setItem('pestovo_solo_key_' + newRoundId, accessKey);
        localStorage.setItem('pestovo_acting_as_' + newRoundId, pid);

        ref.set(data).then(function() {
            toast(t('msg_round_started'));
            window.location.href = 'solo.html?round=' + newRoundId;
        }).catch(function(err) {
            toast('⚠️ Ошибка запуска: ' + err.message, 'error');
        });

    } else {
        // GROUP MODE
        var players = {};
        var pOrder = [];
        var selectedUids = [];

        for (var i = 1; i <= count; i++) {
            var nameInp = document.getElementById('sp-name-' + i);
            var uidInp = document.getElementById('sp-uid-' + i);
            var genderSel = document.getElementById('sp-gender-' + i);
            var teeSel = document.getElementById('sp-tee-' + i);
            var hcpInp = document.getElementById('sp-hcp-' + i);

            var name = nameInp ? sanitizeNameRaw(nameInp.value) : '';
            if (!name) { toast('⚠️ Укажите имя игрока #' + i, 'error'); return; }

            var uid = uidInp ? uidInp.value : '';
            var gender = genderSel ? genderSel.value : 'men';
            var playerTee = teeSel ? teeSel.value : 'wh';
            var exactHcp = parseExactHcp(hcpInp ? hcpInp.value : '0');
            var fieldHcp = getFieldHcp(exactHcp, playerTee, gender);

            var regId = registerGuestPlayerInDatabase({
                uid: uid,
                name: name,
                exactHcp: exactHcp,
                gender: gender,
                tee: playerTee
            });
            if (!uid && regId) uid = regId;

            if (uid) {
                if (selectedUids.indexOf(uid) !== -1) {
                    toast('⚠️ Выбран дублирующий игрок: ' + name, 'error');
                    return;
                }
                selectedUids.push(uid);
            }

            var pid = uid || ('guest_' + Date.now() + '_' + i);
            players[pid] = {
                name: name,
                exactHcp: exactHcp,
                fieldHcp: fieldHcp,
                gender: gender,
                tee: playerTee,
                isGuest: !uid,
                scores: {},
                markerScores: {},
                submitted: {},
                markerSubmitted: {},
                verified: {}
            };
            pOrder.push(pid);
        }

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

        var flightTee = pOrder.length > 0 && players[pOrder[0]] ? players[pOrder[0]].tee : 'wh';
        var creatorId = currentUser ? currentUser.uid : pOrder[0];
        var accessKey = 'group_key_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

        var data = {
            mode: 'group',
            tee: flightTee,
            format: format,
            startHole: startHole,
            startTime: startTime,
            players: players,
            markerAssignments: markerAssignments,
            participantsList: pOrder,
            status: 'active',
            createdAt: Date.now(),
            createdBy: creatorId,
            accessKey: accessKey
        };

        var ref = db.ref('rounds').push();
        var newRoundId = ref.key;

        localStorage.setItem('pestovo_group_key_' + newRoundId, accessKey);
        localStorage.setItem('pestovo_acting_as_' + newRoundId, pOrder[0]);

        ref.set(data).then(function() {
            toast(t('msg_round_started'));
            window.location.href = 'live.html?round=' + newRoundId;
        }).catch(function(err) {
            toast('⚠️ Ошибка запуска: ' + err.message, 'error');
        });
    }
}
