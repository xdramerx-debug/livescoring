var soloRid = null;
var soloRound = null;
var curHole = 1;
var curScore = 0;
var soloIsChanging = false;
var canEditSolo = false;
// Результат записывается только по кнопке «Сохранить»: автосохранения при
// изменении счёта больше нет. Флаг отмечает ещё не записанный ввод.
var soloDirty = false;
var soloPaceTimer = null;

// Новый клубный дефолт применяем только пока игрок не сохранил личный выбор.
document.addEventListener('pestovo-stableford-default-change', function() {
    if (!soloRound || !canEditSolo) return;
    updateSoloStablefordToggle();
    updateDisplay();
});

document.addEventListener('DOMContentLoaded', function() {
    initNav();
    initSoloForm();
    var urlP = new URLSearchParams(window.location.search);
    var rid = urlP.get('round');
    if (rid) {
        // Если live.js уже делегировал этот раунд сюда — не запускаем повторно
        if (window._pestovoSoloBooted !== rid) {
            soloRid = rid;
            loadExistingSolo();
        }
        return;
    }

    var sel = document.getElementById('s-hole');
    if (sel) {
        var rangeEl0 = document.getElementById('s-range');
        buildStartHoleOptions(sel, rangeEl0 ? rangeEl0.value : '1-18');
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

function updateSoloPaceAssistant() {
    if (soloRound) renderPaceAssistant('solo-pace-assistant', soloRound);
}

function startSoloPaceTicker() {
    if (soloPaceTimer) clearInterval(soloPaceTimer);
    updateSoloPaceAssistant();
    soloPaceTimer = setInterval(function() {
        updateSoloPaceAssistant();
    }, isBatterySaverEnabled() ? 60000 : 30000);
}

function initSoloForm() {
    var fnInp = document.getElementById('s-firstname');
    var lnInp = document.getElementById('s-lastname');

    var handleSoloSelect = function(matchedUser) {
        var fnInp = document.getElementById('s-firstname');
        var lnInp = document.getElementById('s-lastname');
        var midInp = document.getElementById('s-middlename');
        var gEl = document.getElementById('s-gender');
        var hEl = document.getElementById('s-exact-hcp');
        var tEl = document.getElementById('s-tee');

        // Не разбираем строку подсказки («Фамилия Имя Отчество») — только поля по смыслу.
        var parts = (typeof resolvePlayerNameParts === 'function')
            ? resolvePlayerNameParts(matchedUser)
            : matchedUser;
        if (fnInp) fnInp.value = parts.firstName || '';
        if (lnInp) lnInp.value = parts.lastName || '';
        if (midInp) midInp.value = parts.middleName || '';
        if (gEl) gEl.value = matchedUser.gender;
        if (hEl) hEl.value = fmtExactHcp(matchedUser.handicap);
        // ТИ: предпочитаемый игроком; если не задан — мужчина → синие, девушка → красные
        if (tEl) {
            if (matchedUser.defaultTee) tEl.value = matchedUser.defaultTee;
            else tEl.value = (matchedUser.gender === 'women') ? 'rd' : 'bl';
        }

        window.sSelectedUid = matchedUser.uid;
        calcSoloFieldHcp();
        if (typeof toast === 'function') toast('👤 ' + (currentLang === 'en' ? 'Selected player: ' : 'Выбран игрок: ') + matchedUser.name + ' (' + fmtExactHcp(matchedUser.handicap) + ' HCP)', 'info');
    };

    var handleSoloClear = function() {
        window.sSelectedUid = null;
    };

    if (fnInp && typeof initPlayerSearchAutofill === 'function') {
        initPlayerSearchAutofill({
            searchInputId: 's-firstname',
            onSelect: handleSoloSelect,
            onClear: handleSoloClear
        });
    }
    if (lnInp && typeof initPlayerSearchAutofill === 'function') {
        initPlayerSearchAutofill({
            searchInputId: 's-lastname',
            onSelect: handleSoloSelect,
            onClear: handleSoloClear
        });
    }
}

function initSoloView() {
    if (soloRid) {
        loadExistingSolo();
    } else {
        var sel = document.getElementById('s-hole');
        if (sel) {
            var rangeEl = document.getElementById('s-range');
            buildStartHoleOptions(sel, rangeEl ? rangeEl.value : '1-18');
        }
        updateTimingPreview();
    }
}

function soloAuthReady(u, d) {
    // navAuth уже вызван в onAuthReady (js/live.js) — здесь только дефолты формы соло
    if (u && d) {
        var fn = document.getElementById('s-firstname');
        var ln = document.getElementById('s-lastname');
        var mid = document.getElementById('s-middlename');

        if (d.middleName || d.firstName || d.lastName) {
            if (fn && !fn.value) fn.value = d.firstName || '';
            if (ln && !ln.value) ln.value = d.lastName || '';
            if (mid && !mid.value) mid.value = d.middleName || '';
        } else {
            var name = d.name || '';
            var parts = name.split(' ');
            if (fn && !fn.value) fn.value = parts[0] || '';
            if (ln && !ln.value) ln.value = parts.slice(1).join(' ') || '';
        }

        if (d.handicap != null) {
            var hcpEl = document.getElementById('s-exact-hcp');
            if (hcpEl && !hcpEl.value) hcpEl.value = fmtExactHcp(d.handicap);
        }
        if (d.gender) {
            var gEl = document.getElementById('s-gender');
            if (gEl) gEl.value = d.gender;
        }
        var teeEl = document.getElementById('s-tee');
        if (d.defaultTee) {
            if (teeEl) teeEl.value = d.defaultTee;
        } else if (d.gender && teeEl) {
            // По правилу клуба: мужчина → синие ти, девушка → красные ти
            teeEl.value = (d.gender === 'women') ? 'rd' : 'bl';
        }

        calcSoloFieldHcp();
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

// Смена пола в одиночном режиме: автоматически подставляем ТИ
// (мужчина → синие ти, девушка → красные ти) и пересчитываем полевой HCP
function onSoloGenderChange() {
    var gEl = document.getElementById('s-gender');
    var tEl = document.getElementById('s-tee');
    if (gEl && tEl) {
        tEl.value = (gEl.value === 'women') ? 'rd' : 'bl';
    }
    calcSoloFieldHcp();
}

function updateTimingPreview() {
    var timeEl = document.getElementById('s-time');
    var holeEl = document.getElementById('s-hole');
    var rangeEl = document.getElementById('s-range');
    if (!timeEl || !holeEl) return;
    var timeStr = timeEl.value;
    var startHole = parseInt(holeEl.value) || 1;
    var holeRange = rangeEl ? rangeEl.value : '1-18';
    if (!timeStr) return;
    var parts = timeStr.split(':');
    var now = new Date();
    var startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        parseInt(parts[0]), parseInt(parts[1]), 0);
    var previewEl = document.getElementById('timing-preview');
    if (previewEl) previewEl.innerHTML = buildTimingTable(startDate.getTime(), startHole, holeRange);
}

var soloStarting = false;

function startSolo() {
    // Защита от двойного нажатия: иначе создавалось два раунда и два игрока
    if (soloStarting) return;

    var fnInp = document.getElementById('s-firstname');
    var lnInp = document.getElementById('s-lastname');
    var midInp = document.getElementById('s-middlename');
    var timeInp = document.getElementById('s-time');
    var hcpInp = document.getElementById('s-exact-hcp');

    var firstName = fnInp.value.trim();
    var lastName = lnInp.value.trim();
    var middleName = midInp ? midInp.value.trim() : '';
    var timeStr = timeInp.value;
    var startHole = parseInt(document.getElementById('s-hole').value) || 1;
    var tee = document.getElementById('s-tee').value;
    var format = document.getElementById('s-format').value;
    var holeRange = document.getElementById('s-range') ? document.getElementById('s-range').value : '1-18';
    var gender = document.getElementById('s-gender').value;
    var exactHcpStr = hcpInp.value;

    if (!firstName) { fnInp.classList.add('is-invalid'); toast(t('msg_name_req'), 'error'); return; }
    if (!lastName) { lnInp.classList.add('is-invalid'); toast(t('msg_name_req'), 'error'); return; }
    if (!timeStr) { timeInp.classList.add('is-invalid'); toast(t('msg_start_time_req'), 'error'); return; }
    if (!exactHcpStr && exactHcpStr !== '0') { hcpInp.classList.add('is-invalid'); toast(t('msg_exact_hcp_req'), 'error'); return; }

    var parsedExact = parseExactHcp(exactHcpStr);
    var fieldHcp = getFieldHcp(parsedExact, tee, gender);
    // Полное имя: «Имя [Отчество] Фамилия» — firstName/middleName/lastName
    // остаются в отдельных полях для поиска АГР
    firstName = sanitizeNameRaw(firstName);
    middleName = sanitizeNameRaw(middleName);
    lastName = sanitizeNameRaw(lastName);
    var fullName = sanitizeNameRaw(((firstName + ' ' + (middleName ? middleName + ' ' : '')) + lastName).trim());

    var parts = timeStr.split(':');
    var now = new Date();
    var startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        parseInt(parts[0]), parseInt(parts[1]), 0);
    var startTime = startDate.getTime();

    var accessKey = 'key_' + Math.random().toString(36).substring(2) + Date.now().toString(36);

    // Идемпотентное определение id игрока: существующий (по uid или имени) не создаётся заново,
    // новый игрок получает один детерминированный guest-id на все режимы
    var chosenUid = window.sSelectedUid || (currentUser ? currentUser.uid : null);

    var createRound = function(playerId) {
        playerId = playerId || chosenUid || ('guest_' + Date.now());
        var isGuest = String(playerId).indexOf('guest_') === 0;

        var players = {};
        players[playerId] = {
            name: fullName,
            firstName: firstName,
            lastName: lastName,
            middleName: middleName,
            exactHcp: parsedExact,
            fieldHcp: fieldHcp,
            gender: gender,
            scores: {},
            holeTimes: {}
        };

        var ref = db.ref('rounds').push();
        soloRid = ref.key;

        localStorage.setItem('pestovo_solo_key_' + soloRid, accessKey);

        var roundData = {
            mode: 'solo',
            tee: tee,
            format: format,
            holeRange: holeRange,
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
            window.location.href = 'setup-round.html?round=' + soloRid;
        }).catch(function(err) {
            soloStarting = false;
            toast('⚠️ ' + (currentLang === 'en' ? 'Round start error: ' : 'Ошибка запуска раунда: ') + err.message, 'error');
        });
    };

    soloStarting = true;

    var resolver = typeof resolveOrCreatePlayerUser === 'function'
        ? resolveOrCreatePlayerUser
        : (typeof registerGuestPlayerInDatabase === 'function' ? registerGuestPlayerInDatabase : null);

    if (resolver) {
        try {
            resolver({
                uid: chosenUid,
                name: fullName,
                firstName: firstName,
                lastName: lastName,
                middleName: middleName,
                exactHcp: parsedExact,
                gender: gender,
                tee: tee
            }).then(function(resolvedId) {
                createRound(resolvedId);
            }).catch(function() {
                createRound(null);
            });
        } catch (e) {
            // Совместимость со старым кэшем utils.js (синхронная версия регистрации)
            createRound(typeof e === 'string' ? e : null);
        }
    } else {
        createRound(null);
    }
}

var soloRoundHandler = null;

function loadExistingSolo() {
    if (!soloRid) return;
    // Защита от дублей подписки (повторный вызов, смена языка и т.п.)
    if (soloRoundHandler) {
        try { db.ref('rounds/' + soloRid).off('value', soloRoundHandler); } catch (e) {}
    }
    soloRoundHandler = function(sn) {
        soloRound = sn.val();
        if (!soloRound) { toast(currentLang === 'en' ? 'Round not found' : 'Раунд не найден', 'error'); return; }

        // Это групповой раунд — передаём его live.js (обе вкладки на setup-round.html)
        if (soloRound.mode === 'group') {
            var gid = soloRid;
            try { db.ref('rounds/' + gid).off('value', soloRoundHandler); } catch (e) {}
            soloRoundHandler = null;
            soloRid = null;
            soloRound = null;
            curRid = gid;
            if (typeof bootRoundViewOnce === 'function') bootRoundViewOnce();
            return;
        }

        document.getElementById('setup').classList.add('hidden');

        // Раунд уже начат — блок «Начать раунд / переключайте вкладки» больше не нужен:
        // показываем только шапку, меню, ввод счёта и остальное содержимое раунда.
        var pageHeadEl = document.getElementById('page-head');
        if (pageHeadEl) pageHeadEl.classList.add('hidden');

        // Фиксированная шапка (nav) не должна перекрывать ввод счёта: page-head,
        // дававший отступ, скрыт — компенсируем высотой nav отступ сверху main.
        document.body.classList.add('round-active');
        var navEl = document.getElementById('main-nav');
        if (navEl) document.documentElement.style.setProperty('--round-nav-offset', (navEl.offsetHeight + 16) + 'px');

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
            updateSoloStablefordToggle();

            var scores = player.scores || {};
            var order = getRoundOrder(soloRound);

            if (!soloIsChanging) {
                var savedResumeHole = getSavedResumeHole(soloRid, uid, order, player);
                if (savedResumeHole) {
                    curHole = savedResumeHole;
                } else {
                    var found = false;
                    for (var i = 0; i < order.length; i++) {
                        var h = order[i];
                        var s = parseInt(scores[h]) || 0;
                        if (s < 1) { curHole = h; found = true; break; }
                    }
                    if (!found) curHole = order[order.length - 1];
                }
            }


            renderRoundInfo('round-info');
            buildHoles();
            renderCurrentHole();
            renderLiveStats('live-stats');
            renderMiniCard('mini-card');
            listenForCallResponsesSolo();
            listenForOfficialCallState({
                roundId: soloRid,
                playerId: uid,
                prefix: 'solo',
                canEdit: function() { return canEditSolo; },
                hole: function() { return curHole; },
                playerName: function() {
                    return soloRound.players && soloRound.players[uid] ? soloRound.players[uid].name : 'Player';
                },
                flightMembers: []
            });
            startSoloPaceTicker();

        } else {
            document.getElementById('game').classList.add('hidden');
            document.getElementById('read-only-view').classList.remove('hidden');

            renderRoundInfo('ro-round-info');
            renderLiveStats('ro-live-stats');
            renderMiniCard('ro-mini-card');
            startSoloPaceTicker();
        }
    };
    db.ref('rounds/' + soloRid).on('value', soloRoundHandler);
}

// Точка входа из live.js: соло-раунд, открытый как setup-round.html?round=ID
function bootSoloRoundView(rid) {
    if (!rid) return;
    if (window._pestovoSoloBooted === rid) return;
    window._pestovoSoloBooted = rid;
    soloRid = rid;
    soloRoundHandler = null; // свежая подписка
    loadExistingSolo();
}

function getPlayerId() {
    if (!soloRound || !soloRound.players) return null;
    if (currentUser && soloRound.players[currentUser.uid]) {
        return currentUser.uid;
    }
    return Object.keys(soloRound.players)[0];
}

function updateSoloStablefordToggle() {
    var toggle = document.getElementById('solo-stableford-toggle');
    var control = document.getElementById('solo-stableford-control');
    if (!toggle) return;

    var uid = getPlayerId();
    var player = uid && soloRound && soloRound.players ? soloRound.players[uid] : null;
    toggle.checked = isPlayerStablefordDisplayEnabled(player);
    toggle.disabled = !canEditSolo || !player;
    if (control) control.classList.toggle('is-disabled', toggle.disabled);
}

function toggleSoloStablefordDisplay(enabled) {
    var uid = getPlayerId();
    if (!canEditSolo || !soloRid || !uid || !soloRound || !soloRound.players || !soloRound.players[uid]) return;

    enabled = !!enabled;
    // Настройка записывается в карточку игрока этого раунда, поэтому не
    // изменяет вид счёта у других игроков группы или на другом устройстве.
    soloRound.players[uid].stablefordDisplay = enabled;
    updateDisplay();
    updateSoloStablefordToggle();

    db.ref('rounds/' + soloRid + '/players/' + uid + '/stablefordDisplay').set(enabled).then(function() {
        toast(enabled
            ? (currentLang === 'en' ? 'Stableford points are shown' : 'Очки Stableford показаны')
            : (currentLang === 'en' ? 'Stableford points are hidden' : 'Очки Stableford скрыты'), 'info');
    }).catch(function(error) {
        console.warn('[Stableford] Cannot save personal display setting', error);
        toast(currentLang === 'en' ? 'Could not save the Stableford setting' : 'Не удалось сохранить настройку Stableford', 'error');
    });
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

    var pTee = (p && p.tee) || soloRound.tee || 'wh';
    el.innerHTML =
        '<div style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + uid + '\',\'' + soloRid + '\')"><b><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(p.name || t('player')) + '</b>' + guestBadge + ' · <b>HCP:</b> ' + fmtExactHcp(p.exactHcp) + ' (' + courseHcpLbl + ' ' + fmtFieldHcp(p.fieldHcp) + ')</div>' +
        '<div><b>' + startLbl + ':</b> ' + fmtTime(soloRound.startTime) + ' · <b>' + holeLbl + ':</b> ' + soloRound.startHole + ' · <b>' + t('tee_select') + ':</b> ' + fmtTeePill(pTee) + ' · <b>' + t('format_select') + ':</b> ' + soloRound.format + '</div>';
}

function buildHoles() {
    var el = document.getElementById('g-holes');
    if (!el) return;
    var uid = getPlayerId();
    if (!uid || !soloRound || !soloRound.players) return;
    var p = soloRound.players[uid];
    var scores = (p && p.scores) || {};
    var fieldHcp = (p && (p.fieldHcp !== undefined ? p.fieldHcp : soloRound.fieldHcp)) || 0;

    var html = '';
    var order = getRoundOrder(soloRound);
    order.forEach(function(h) {
        var cls = h === curHole ? 'active' : '';
        var s = parseInt(scores[h]) || 0;
        if (s >= 1 && h !== curHole) cls += ' done';

        html += '<button class="hole-btn ' + cls + '" onclick="goHole(' + h + ')" style="min-height:38px;padding:2px;font-size:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;">' +
            '<span class="hbn-line" style="line-height:1;"><span class="hbn-num" style="font-size:9px;opacity:0.75;">#' + h + '</span>' + hcpStrokesMarksHTML(fieldHcp, h) + '</span>' +
            '<span style="font-size:13px;font-weight:800;line-height:1.2;margin-top:1px;">' + (s >= 1 ? s : '—') + '</span>' +
            '</button>';
    });
    el.innerHTML = html;
}

function goHole(h) {
    if (!canEditSolo) return;
    soloIsChanging = true;
    // Переход на другую лунку сбрасывает несохранённый ввод: результат
    // записывается только по кнопке «Сохранить».
    soloDirty = false;
    curHole = h;
    curScore = 0;
    rememberResumeHole(soloRid, getPlayerId(), h);
    renderCurrentHole();
    buildHoles();
    setTimeout(function() { soloIsChanging = false; }, 100);
}

function renderCurrentHole() {
    var par = holePar(curHole);
    var uid = getPlayerId();
    var p = uid && soloRound && soloRound.players && soloRound.players[uid];
    var pTee = (p && p.tee) || (soloRound && soloRound.tee) || 'wh';
    var dist = holeDist(curHole, pTee);

    document.getElementById('g-hole').textContent = curHole;
    document.getElementById('g-par').textContent = par;
    document.getElementById('g-dist').textContent = dist > 0 ? dist : '—';

    var dl = holeDeadline(soloRound.startTime, soloRound.startHole, curHole);
    document.getElementById('g-deadline').textContent = fmtTime(dl);

    var uid = getPlayerId();
    var scores = (uid && soloRound && soloRound.players && soloRound.players[uid] && soloRound.players[uid].scores) || {};
    var savedScore = parseInt(scores[curHole]) || 0;

    // Живое обновление данных не должно затирать ввод: пока счёт не сохранён
    // кнопкой, оставляем введённое значение на экране.
    if (!soloDirty) {
        curScore = savedScore > 0 ? savedScore : par;
    }
    updateDisplay();
    updateSoloActionButton();
    updateSoloPaceAssistant();

    var trackContainer = document.getElementById('shot-tracking-container');
    if (trackContainer) {
        if (localStorage.getItem('pestovo_shot_tracking_enabled') === '1') {
            trackContainer.classList.remove('hidden');
        } else {
            trackContainer.classList.add('hidden');
        }
    }
}

function adjSolo(delta) {
    if (!canEditSolo) return;
    curScore = Math.max(1, Math.min(15, curScore + delta));
    vib();
    updateDisplay();
    animateScoreElement('g-disp');
    // Автосохранения нет: счёт попадёт в базу только после нажатия «Сохранить».
    soloDirty = true;
    updateSoloActionButton();
}

function updateDisplay() {
    var par = holePar(curHole);
    var uid = getPlayerId();
    var player = uid && soloRound && soloRound.players ? soloRound.players[uid] : null;
    var fieldHcp = player && player.fieldHcp !== undefined
        ? player.fieldHcp : ((soloRound && soloRound.fieldHcp) || 0);
    var showStableford = isPlayerStablefordDisplayEnabled(player);
    var scoreEl = document.getElementById('g-disp');
    if (scoreEl) scoreEl.innerHTML = scoreWithStablefordHTML(curScore, curHole, fieldHcp, showStableford);
    var name = holeResName(curScore, par);
    var cls = holeResClass(curScore, par);
    var r = document.getElementById('g-result');
    if (r) {
        r.textContent = name;
        r.className = 'score-result ' + cls;
    }
}

function saveSolo() {
    if (!canEditSolo) {
        toast(t('msg_edit_disabled'), 'error');
        return;
    }
    if (curScore < 1) { toast(t('msg_score_min'), 'error'); return; }

    soloIsChanging = true;
    soloDirty = false;
    var savedHole = curHole;
    var scoreToSave = curScore; // фиксируем счёт до колбэка: ниже curScore может сбрасываться в 0

    var uid = getPlayerId();
    var path = 'rounds/' + soloRid + '/players/' + uid + '/scores/' + savedHole;

    dbSetWithOfflineQueue(path, scoreToSave).then(function(res) {
        if (res && res.offline) return null;
        return recordHoleCompletionTime(soloRid, uid, savedHole, Date.now());
    }).then(function() {
        var par = holePar(savedHole);
        var d = scoreToSave - par;

        if (scoreToSave === 1) { toast('🎯 HOLE-IN-ONE!!!', 'info'); vib([100, 50, 100, 50, 100]); }
        else if (d <= -2) { toast('🦅 EAGLE!', 'info'); vib([80, 50, 80]); }
        else if (d === -1) { toast('🐦 Birdie!', 'success'); vib([50, 50]); }
        else if (d === 0) { toast('✅ Par'); vib(); }
        else if (d === 1) { toast('Bogey'); vib(); }
        else { toast('Double+', 'warn'); vib(); }

        var order = getRoundOrder(soloRound);
        var idx = order.indexOf(savedHole);
        if (idx >= 0 && idx < order.length - 1) {
            curHole = order[idx + 1];
            curScore = 0;
        }

        rememberResumeHole(soloRid, uid, curHole);
        showTimingNotice(savedHole);
        renderCurrentHole();
        buildHoles();

        var p = soloRound.players && soloRound.players[uid];
        if (p) {
            p.scores = p.scores || {};
            p.scores[savedHole] = scoreToSave;
        }

        updateSoloActionButton();
        renderMiniCard('mini-card');

        setTimeout(function() { soloIsChanging = false; }, 200);
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
    var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, getRoundOrder(soloRound));

    var playedLbl = currentLang === 'en' ? 'Completed' : 'Пройдено';
    var projLbl = currentLang === 'en' ? 'Projected' : 'Прогноз';

    var html = '<div class="stats-grid">';
    html += '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">' + stats.holesPlayed + '/' + getRoundHoleCount(soloRound) + '</div><div class="stat-l">' + playedLbl + '</div></div>';
    html += '<div class="stat"><i class="fas fa-golf-ball-tee"></i><div class="stat-n">' + (stats.gross || '—') + '</div><div class="stat-l">Gross</div></div>';
    html += '<div class="stat"><i class="fas fa-chart-line"></i><div class="stat-n ' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</div><div class="stat-l">± Par</div></div>';
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

function updateSoloActionButton() {
    var btn = document.getElementById('btn-solo-action');
    var txt = document.getElementById('btn-solo-action-txt');
    if (!btn) return;

    var uid = getPlayerId();
    if (!uid || !soloRound || !soloRound.players) return;
    var p = soloRound.players[uid];
    var scores = (p && p.scores) || {};

    var order = getRoundOrder(soloRound);
    var holeCount = order.length;
    var playedCount = 0;
    order.forEach(function(h) {
        if (parseInt(scores[h]) > 0) playedCount++;
    });

    // Несохранённый ввод: счёт изменён, но кнопка «Сохранить» ещё не нажата.
    var hasUnsaved = canEditSolo && soloDirty && curScore >= 1;
    var hint = document.getElementById('solo-unsaved-hint');
    if (hint) hint.classList.toggle('hidden', !hasUnsaved);
    btn.classList.toggle('has-unsaved', hasUnsaved);

    var icon = btn.querySelector('i');

    if (hasUnsaved) {
        // Изменения ещё не записаны — кнопка всегда сохраняет результат,
        // даже на последней лунке (иначе ввод потерялся бы при завершении).
        btn.onclick = function() { saveSolo(); };
        btn.className = 'btn btn-g btn-block btn-lg has-unsaved';
        if (txt) txt.innerHTML = currentLang === 'en' ? '💾 Save Result' : '💾 Сохранить результат';
        if (icon) icon.className = 'fas fa-save';
    } else if (playedCount >= holeCount) {
        btn.onclick = function() { finishSolo(); };
        btn.className = 'btn btn-g btn-block btn-lg';
        if (txt) txt.innerHTML = currentLang === 'en' ? '🏆 Finish Round' : '🏆 Завершить раунд';
        if (icon) icon.className = 'fas fa-flag-checkered';
    } else {
        btn.onclick = function() { saveSolo(); };
        btn.className = 'btn btn-g btn-block';
        if (txt) txt.innerHTML = currentLang === 'en' ? '➡️ Next Hole' : '➡️ Сохранить и следующая лунка';
        if (icon) icon.className = 'fas fa-arrow-right';
    }
}

function renderMiniCard(targetId) {
    var el = document.getElementById(targetId);
    if (!el) return;
    var uid = getPlayerId();
    if (!uid || !soloRound || !soloRound.players) return;
    var p = soloRound.players[uid];
    if (!p) return;

    if (typeof generatePestovoScorecardHTML === 'function') {
        el.innerHTML = generatePestovoScorecardHTML(p, soloRound);
    }
}

var soloFinishing = false;

function finishSolo() {
    if (!canEditSolo) return;
    // Защита от повторного завершения (двойной клик): иначе история и roundsPlayed задваивались
    if (soloFinishing) return;
    if (soloRound && soloRound.status === 'completed') return;
    soloFinishing = true;

    var finalizeSolo = function() {
        db.ref('rounds/' + soloRid + '/status').set('completed').catch(function(){ soloFinishing = false; });
        db.ref('rounds/' + soloRid + '/completedAt').set(Date.now());

        db.ref('rounds/' + soloRid).once('value').then(function(sn) {
            var r = sn.val();
            if (r) saveHistory(soloRid, r);
        });
    };

    // После завершения раунда карточка не предлагается к печати/скачиванию —
    // переходим сразу к списку раундов.
    if (typeof openFinishConfirmModal === 'function') {
        openFinishConfirmModal(soloRid, function() {
            soloFinishing = true;
            finalizeSolo();

            toast(t('msg_round_finished'));
            setTimeout(function() {
                window.location.href = 'leaderboard.html';
            }, 800);
        }, function() {
            // Модалка закрыта без подтверждения — снимаем блокировку повторного завершения
            soloFinishing = false;
        });
    } else {
        if (!confirm(t('msg_finish_confirm'))) { soloFinishing = false; return; }
        finalizeSolo();

        toast(t('msg_round_finished'));
        setTimeout(function() {
            window.location.href = 'leaderboard.html';
        }, 800);
    }
}

function callOfficialSolo(type) {
    if (!canEditSolo) return;
    var uid = getPlayerId();
    requestOfficialCall({
        roundId: soloRid,
        playerId: uid,
        prefix: 'solo',
        type: type,
        hole: function() { return curHole; },
        playerName: function() {
            return (soloRound && soloRound.players && soloRound.players[uid])
                ? soloRound.players[uid].name : 'Player';
        },
        flightMembers: [],
        canEdit: function() { return canEditSolo; },
        onSent: function(call) {
            if (typeof sendTelegramOfficialAlert === 'function') sendTelegramOfficialAlert(type, call.hole, call.playerName, []);
            if (typeof sendVKOfficialAlert === 'function') sendVKOfficialAlert(type, call.hole, call.playerName, []);
            toast('🚨 ' + getOfficialRoleName(type) + (currentLang === 'en' ? ' called to hole ' : ' вызван на лунку ') + call.hole + '!', 'warn');
            vib([100, 50, 100]);
        }
    });
}

// Слушаем «ответы» на вызовы, которые админ оставил в `users/<uid>/notifications`.
// Каждое новое уведомление с type === 'call_response' показываем тостом
// «Судья/маршал едет» и сразу помечаем как прочитанное.
function listenForCallResponsesSolo() {
    if (typeof db === 'undefined') return;
    var uid = getPlayerId();
    if (!uid) return;
    if (window._pestovoCallResponsesListening && window._pestovoCallResponsesUid === uid) return;
    window._pestovoCallResponsesListening = true;
    window._pestovoCallResponsesUid = uid;

    db.ref('users/' + uid + '/notifications').orderByChild('type').equalTo('call_response').on('child_added', function(sn) {
        var n = sn.val();
        if (!n || n.read) return;

        var who = n.responderRole === 'marshal'
            ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
            : (currentLang === 'en' ? 'Referee' : 'Судья');
        var txt = currentLang === 'en'
            ? '🚗 ' + who + ' is on the way to you!'
            : '🚗 ' + who + ' едет к вам!';

        toast(txt, 'success');
        if (typeof vib === 'function') vib([80, 40, 80, 40, 80]);

        // Помечаем прочитанным, чтобы не показывать тост повторно
        db.ref('users/' + uid + '/notifications/' + sn.key + '/read').set(true).catch(function(){});
    });
}
