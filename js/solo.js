var soloRid = null;
var soloRound = null;
var curHole = 1;
var curScore = 0;
var soloIsChanging = false;
var canEditSolo = false;
var soloDirty = false;
var soloPaceTimer = null;
function sGet(id){ try{ return document.getElementById(id); }catch(e){ return null; } }

function setSoloForceFinishBtnVisible(visible) {
    var btn = sGet('solo-force-finish-btn');
    if (!btn) return;
    if (visible) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

// Новый клубный дефолт применяем только пока игрок не сохранил личный выбор.
document.addEventListener('pestovo-stableford-default-change', function() {
    if (!soloRound || !canEditSolo) return;
    updateSoloStablefordToggle();
    updateDisplay();
});

document.addEventListener('DOMContentLoaded', function() {
    initNav();
    initSoloForm();
    // Вид страницы ввода счёта (5 вариантов) — выбирает админ, действует для всех.
    if (typeof pestovoBindView5 === 'function') pestovoBindView5('scoring', function() { try { syncView5BodyClasses(); } catch (e) { console.warn("[silent]", e); } });
    var urlP = new URLSearchParams(window.location.search);
    var rid = urlP.get('round');
    if (rid) {
        // Если live.js уже делегировал этот раунд сюда — не запускаем повторно
        if (window._pestovoSoloBooted !== rid) {
            soloRid = rid;
            if (!(typeof pestovoQrAuthPending !== 'undefined' && pestovoQrAuthPending)) loadExistingSolo();
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
    updateSoloPauseUI();
}

function handleSoloPauseToggle() {
    if (!soloRid || !soloRound) return;
    if (soloRound.paused) {
        var myName = (soloRound.players && soloRound.players[getPlayerId()])
            ? (soloRound.players[getPlayerId()].name || '') : '';
        roundResume(soloRid, soloRound, myName, getPlayerId()).then(function() {
            toast(currentLang === 'en' ? '✅ Round resumed. Timings unpaused.' : '✅ Раунд возобновлён. Тайминги запущены.', 'success');
        }).catch(function(err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    } else {
        openRoundPauseModal(soloRid, soloRound, function() {
            updateSoloPauseUI();
        });
    }
}

function updateSoloPauseUI() {
    var banner = sGet('solo-pause-banner');
    var btnText = sGet('solo-pause-btn-text');
    var btnIcon = sGet('solo-pause-btn-icon');
    var isPaused = !!(soloRound && soloRound.paused);

    if (btnText && btnIcon) {
        if (isPaused) {
            btnIcon.className = 'fas fa-play';
            btnText.textContent = (currentLang === 'en' ? 'Resume' : 'Возобновить');
        } else {
            btnIcon.className = 'fas fa-pause';
            btnText.textContent = (currentLang === 'en' ? 'Pause' : 'Пауза');
        }
    }

    if (!banner) return;
    if (!isPaused) {
        banner.innerHTML = '';
        banner.classList.add('hidden');
        return;
    }
    banner.classList.remove('hidden');
    var totalMs = typeof getRoundTotalPauseMs === 'function' ? getRoundTotalPauseMs(soloRound) : 0;
    var durStr = typeof formatPaceMinutes === 'function' ? formatPaceMinutes(totalMs / 60000) : '';
    var reasonStr = soloRound.pauseReason ? (' · ' + escapeHtml(soloRound.pauseReason)) : '';
    var isEn = currentLang === 'en';
    banner.innerHTML =
        '<div class="round-pause-card is-paused-anim">' +
        '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:200px;">' +
        '<i class="fas fa-pause-circle" style="color:#f39c12;font-size:24px;"></i>' +
        '<div><strong style="color:var(--white);font-size:14px;display:block;">' +
        (isEn ? '⏸ Round is Paused' : '⏸ Раунд на паузе') + '</strong>' +
        '<span style="font-size:12px;color:rgba(255,255,255,0.85);">' +
        (isEn ? 'Timings frozen · Duration: ' : 'Тайминги остановлены · Длительность: ') +
        '<b>' + durStr + '</b>' + reasonStr + '</span></div></div>' +
        '<button type="button" class="btn btn-g btn-sm" onclick="handleSoloPauseToggle()" style="font-weight:700;">' +
        '<i class="fas fa-play"></i> ' + (isEn ? 'Resume Play' : 'Возобновить игру') + '</button>' +
        '</div>';
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
    var midSearch = document.getElementById('s-middlename');
    if (midSearch && typeof initPlayerSearchAutofill === 'function') {
        initPlayerSearchAutofill({
            searchInputId: 's-middlename',
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
    if (u && soloRid && !soloRound && !(typeof pestovoQrAuthPending !== 'undefined' && pestovoQrAuthPending)) loadExistingSolo();
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
        // v1.69.0: единая форма — заполняем первую карточку игрока профилем
        // (пустые поля), если пользователь авторизовался после отрисовки.
        try { if (typeof applyUnifiedUserDefaults === 'function') applyUnifiedUserDefaults(); } catch (e) { console.warn('[silent]', e); }
    }
}

function calcSoloFieldHcp() {
    var exEl = sGet('s-exact-hcp'); if (!exEl) return;
    var exact = exEl.value;
    var fieldEl = sGet('s-field-hcp');
    if (!exact && exact !== '0') { if (fieldEl) fieldEl.value = ''; return; }
    var genderEl = sGet('s-gender'); var teeEl = sGet('s-tee');
    if (!genderEl || !teeEl) return;
    var gender = genderEl.value;
    var tee = teeEl.value;
    if (typeof getFieldHcp !== 'function' || typeof fmtFieldHcp !== 'function') return;
    var field = getFieldHcp(exact, tee, gender);
    if (fieldEl) fieldEl.value = fmtFieldHcp(field);
}
function updateTimingPreview() {
    var timeEl = sGet('s-time');
    var holeEl = sGet('s-hole');
    var rangeEl = sGet('s-range');
    if (!timeEl || !holeEl) return;
    var timeStr = timeEl.value;
    var startHole = parseInt(holeEl.value) || 1;
    var holeRange = rangeEl ? rangeEl.value : '1-18';
    if (!timeStr) return;
    var parts = timeStr.split(':');
    var now = new Date();
    var startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        parseInt(parts[0]) || 0, parseInt(parts[1]) || 0, 0);
    var previewEl = sGet('timing-preview');
    if (previewEl && typeof buildTimingTable === 'function') {
        try { previewEl.innerHTML = buildTimingTable(startDate.getTime(), startHole, holeRange); }catch (e) { console.warn("[silent]", e); }
    }
}

var soloStarting = false;

// Собираем данные одиночного раунда из доступной формы:
//   • наследственная вёрстка с отдельными полями Имя/Фамилия (s-*);
//   • v1.69.0: единая форма создания раунда — первая карточка игрока
//     (pl-name-1 = «Имя Фамилия», общие параметры grp-time/grp-hole/…).
function collectSoloInput() {
    var fnInp = document.getElementById('s-firstname');
    if (fnInp) {
        var lnInp = document.getElementById('s-lastname');
        var midInp = document.getElementById('s-middlename');
        var timeInp = document.getElementById('s-time');
        var hcpInp = document.getElementById('s-exact-hcp');
        return {
            firstName: fnInp.value.trim(),
            lastName: lnInp ? lnInp.value.trim() : '',
            middleName: midInp ? midInp.value.trim() : '',
            timeStr: timeInp ? timeInp.value : '',
            startHole: (function() { var e = document.getElementById('s-hole'); return e ? (parseInt(e.value) || 1) : 1; })(),
            tee: (function() { var e = document.getElementById('s-tee'); return e ? e.value : 'bl'; })(),
            format: (function() { var e = document.getElementById('s-format'); return e ? e.value : 'Stroke Play'; })(),
            holeRange: (function() { var e = document.getElementById('s-range'); return e ? e.value : '1-18'; })(),
            gender: (function() { var e = document.getElementById('s-gender'); return e ? e.value : 'men'; })(),
            exactHcpStr: hcpInp ? hcpInp.value : '',
            uid: window.sSelectedUid || (currentUser ? currentUser.uid : null),
            nameInput: fnInp,
            timeInput: timeInp,
            hcpInput: hcpInp
        };
    }

    if (typeof getSetupPlayers !== 'function') return null;
    var ps = getSetupPlayers();
    if (!ps.length) return null;
    var p = ps[0];
    var parts = String(p.name || '').split(/\s+/).filter(Boolean);
    var timeEl = document.getElementById('grp-time');
    var holeEl = document.getElementById('grp-hole');
    var fmtEl = document.getElementById('grp-format');
    var rangeEl = document.getElementById('grp-range');
    return {
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' ') || '',
        middleName: p.middleName,
        timeStr: timeEl ? timeEl.value : '',
        startHole: holeEl ? (parseInt(holeEl.value) || 1) : 1,
        tee: p.tee,
        format: fmtEl ? fmtEl.value : 'Stroke Play',
        holeRange: rangeEl ? rangeEl.value : '1-18',
        gender: p.gender,
        exactHcpStr: p.hcpStr,
        uid: p.uid,
        nameInput: document.getElementById('pl-name-' + p.idx),
        timeInput: timeEl,
        hcpInput: document.getElementById('pl-hcp-' + p.idx)
    };
}

function startSolo() {
    if (soloStarting) return;

    var src = collectSoloInput();
    if (!src) return;

    var firstName = src.firstName;
    var lastName = src.lastName;
    var middleName = src.middleName;
    var timeStr = src.timeStr;
    var startHole = src.startHole;
    var tee = src.tee;
    var format = src.format;
    var holeRange = src.holeRange;
    var gender = src.gender;
    var exactHcpStr = src.exactHcpStr;

    if (!firstName || !lastName) {
        if (src.nameInput) src.nameInput.classList.add('is-invalid');
        toast(t('fio_full_req'), 'error');
        return;
    }
    if (!timeStr) { if (src.timeInput) src.timeInput.classList.add('is-invalid'); toast(t('msg_start_time_req'), 'error'); return; }
    if (!exactHcpStr && exactHcpStr !== '0') { if (src.hcpInput) src.hcpInput.classList.add('is-invalid'); toast(t('msg_exact_hcp_req'), 'error'); return; }
    // Выбранный из списка зарегистрированных игрок (единая форма):
    // передаём его uid дальше, как это делала старая форма через sSelectedUid.
    try { window.sSelectedUid = src.uid || null; } catch (e) { /* игнорируем */ }

    var parsedExact = parseExactHcp(exactHcpStr);
    var fieldHcp = getFieldHcp(parsedExact, tee, gender);
    firstName = sanitizeNameRaw(firstName);
    middleName = sanitizeNameRaw(middleName);
    lastName = sanitizeNameRaw(lastName);
    var fullName = sanitizeNameRaw(((firstName + ' ' + (middleName ? middleName + ' ' : '')) + lastName).trim());

    function proceedToCreate() {
        var parts = timeStr.split(':');
        var now = new Date();
        var startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
            parseInt(parts[0]), parseInt(parts[1]), 0);
        var startTime = startDate.getTime();
        var accessKey = 'key_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
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
                createRound(typeof e === 'string' ? e : null);
            }
        } else {
            createRound(null);
        }
    }

    // 1 сессия на игрока по ФИО: проверяем активные раунды перед стартом
    if (typeof pestovoFindActiveRoundsByFio === 'function') {
        soloStarting = true;
        if (typeof toast === 'function') toast(currentLang === 'en' ? 'Checking active sessions...' : '⏳ Проверка активных сессий...', 'info');
        pestovoFindActiveRoundsByFio(fullName).then(function(matches) {
            if (matches && matches.length) {
                // Турнирные раунды отдельны от соло/групповых: игрок в турнире
                // не может начать новый обычный раунд (жёсткий запрет, без
                // кнопки «начать всё равно»).
                var tnRounds = (typeof pestovoTournamentRounds === 'function')
                    ? pestovoTournamentRounds(matches)
                    : matches.filter(function(m) {
                        return (typeof isTournamentRound === 'function') && isTournamentRound(m.round);
                    });
                if (tnRounds.length) {
                    soloStarting = false;
                    toast(currentLang === 'en'
                        ? '⛔ Player is in a tournament round — solo/group rounds are not available.'
                        : '⛔ Игрок участвует в турнирном раунде — соло/групповые раунды недоступны.', 'error');
                    return;
                }
                soloStarting = false;
                if (typeof pestovoShowFioConflictModal === 'function') {
                    // Владелец может продолжить незавершённый раунд или, если
                    // это чужая/застрявшая сессия, всё равно начать новый раунд.
                    pestovoShowFioConflictModal(matches, function() { proceedToCreate(); });
                } else {
                    toast(currentLang === 'en' ? 'Player already has active round' : 'У игрока уже есть активный раунд', 'error');
                }
                return;
            }
            soloStarting = false;
            proceedToCreate();
        }).catch(function() {
            soloStarting = false;
            proceedToCreate();
        });
        return;
    }

    proceedToCreate();
}

var soloRoundHandler = null;

function loadExistingSolo() {
    if (!soloRid) return;
    // Защита от дублей подписки (повторный вызов, смена языка и т.п.)
    if (soloRoundHandler) {
        try { db.ref('rounds/' + soloRid).off('value', soloRoundHandler); } catch (e) { console.warn("[silent]", e); }
    }
    soloRoundHandler = function(sn) {
        soloRound = sn.val();
        if (!soloRound) { toast(currentLang === 'en' ? 'Round not found' : 'Раунд не найден', 'error'); return; }

        // Это групповой раунд — передаём его live.js (обе вкладки на setup-round.html)
        if (soloRound.mode === 'group') {
            var gid = soloRid;
            try { db.ref('rounds/' + gid).off('value', soloRoundHandler); } catch (e) { console.warn("[silent]", e); }
            soloRoundHandler = null;
            soloRid = null;
            soloRound = null;
            curRid = gid;
            if (typeof bootRoundViewOnce === 'function') bootRoundViewOnce();
            return;
        }

        var setupEl = sGet('setup'); if (setupEl) setupEl.classList.add('hidden');
        var pageHeadEl = sGet('page-head');
        if (pageHeadEl) pageHeadEl.classList.add('hidden');
        if (typeof updateRoundEventBanner === 'function') updateRoundEventBanner(soloRound);
        try { document.body.classList.add('round-active'); } catch (e) { console.warn("[silent]", e); }
        var navEl = sGet('main-nav');
        if (navEl) { try { document.documentElement.style.setProperty('--round-nav-offset', (navEl.offsetHeight + 16) + 'px'); } catch (e) { console.warn("[silent]", e); } }

        var localKey = localStorage.getItem('pestovo_solo_key_' + soloRid);
        var isOwnerUser = currentUser && (soloRound.createdBy === currentUser.uid || (soloRound.players && soloRound.players[currentUser.uid]));
        var isOwnerKey = localKey && (soloRound.accessKey === localKey);
        // Продолжение по ФИО с другого устройства (?as=<playerId>): ввод счёта
        // разрешён, а завершение защищено отдельной проверкой владельца.
        var isAsResume = false;
        try {
            var asPid = new URLSearchParams(window.location.search).get('as');
            isAsResume = !!(asPid && soloRound.players && soloRound.players[asPid]);
        } catch (e) { console.warn("[silent]", e); }

        var resumeUid = getPlayerId();
        canEditSolo = (isOwnerUser || isOwnerKey || isAsResume) &&
            (typeof isRoundOpenForScoring === 'function'
                ? isRoundOpenForScoring(soloRound, Date.now(), resumeUid)
                : soloRound.status === 'active');

        if (canEditSolo) {
            var gameEl = sGet('game'); if (gameEl) gameEl.classList.remove('hidden');
            var roEl = sGet('read-only-view'); if (roEl) roEl.classList.add('hidden');

            // Кнопка принудительного завершения скрыта до попытки завершения
            // с неподтверждёнными результатами (см. finishSolo).
            if (soloRound.status === 'completed') setSoloForceFinishBtnVisible(false);
            else if (!soloSkippedHoles().length) setSoloForceFinishBtnVisible(false);

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

            // Ссылка «Завершить раунд» из поиска по ФИО (?finish=1).
            if (typeof pestovoUrlWantsFinish === 'function' && pestovoUrlWantsFinish()
                && typeof pestovoConsumeFinishOnce === 'function' && pestovoConsumeFinishOnce(soloRid)) {
                setTimeout(function() { try { finishSolo(); } catch (e) { console.warn("[silent]", e); } }, 1200);
            }

        } else {
            var gameEl2 = sGet('game'); if (gameEl2) gameEl2.classList.add('hidden');
            var roEl2 = sGet('read-only-view'); if (roEl2) roEl2.classList.remove('hidden');
            setSoloForceFinishBtnVisible(false);

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
    // Продолжение по ФИО с другого устройства: ссылка содержит ?as=<playerId>
    // (как в групповых раундах через getActingUid).
    try {
        var urlAs = new URLSearchParams(window.location.search).get('as');
        if (urlAs && soloRound.players[urlAs]) return urlAs;
    } catch (e) { console.warn("[silent]", e); }
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
    // Бейдж «Гость» убран везде по требованию клуба.
    var guestBadge = '';

    var courseHcpLbl = currentLang === 'en' ? 'Course' : 'пол.';
    var startLbl = t('start');
    var holeLbl = t('hole');

    var pTee = (p && p.tee) || soloRound.tee || 'wh';
    el.innerHTML =
        '<div style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + uid + '\',\'' + soloRid + '\')"><b><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(playerDisplayName(p, uid)) + '</b>' + guestBadge + ' · <b>HCP:</b> ' + fmtExactHcp(p.exactHcp) + ' (' + courseHcpLbl + ' ' + fmtFieldHcp(p.fieldHcp) + ')</div>' +
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
        // Текущая лунка, на которой счёт ещё НЕ записан, мигает серым —
        // сразу видно, где игрок сейчас находится (вместо цветовой подсветки).
        if (h === curHole && !(s >= 1) && canEditSolo) cls += ' cur-blink';

        html += '<button type="button" class="hole-btn ' + cls + '" onclick="goHole(' + h + ')" aria-label="' + (currentLang === 'en' ? 'Hole ' : 'Лунка ') + h + '" aria-pressed="' + (h === curHole ? 'true' : 'false') + '">' +
            entryHoleContentHTML(s, null, h, fieldHcp) + '</button>';
    });
    el.innerHTML = html;
}

function doGoHole(h) {
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

function goHole(h) {
    if (!canEditSolo) return;
    var uid = getPlayerId();
    if (!uid || !soloRound) { doGoHole(h); return; }
    var p = soloRound.players && soloRound.players[uid];
    var scores = (p && p.scores) || {};
    var order = getRoundOrder(soloRound);
    // При перепрыгивании через лунки без счёта — компактный выбор
    // (ввести на пропущенной / пропустить). Учитывается порядок игры
    // со стартовой лунки: будущие лунки игрока не считаются пропущенными.
    pestovoGuardHoleJump({
        rid: soloRid, pid: uid, order: order, from: curHole, to: h,
        isMissing: function(x) { return !(parseInt(scores[x]) > 0); },
        performJump: function(target) { doGoHole(target); },
        enterHole: function(missed) { doGoHole(missed); }
    });
}

function renderCurrentHole() {
    if (typeof holePar !== 'function' || typeof holeDist !== 'function' || typeof holeDeadline !== 'function' || typeof fmtTime !== 'function') return;
    var par = holePar(curHole);
    var uid = getPlayerId();
    var p = uid && soloRound && soloRound.players && soloRound.players[uid];
    var pTee = (p && p.tee) || (soloRound && soloRound.tee) || 'wh';
    var dist = holeDist(curHole, pTee);
    var gh = sGet('g-hole'); if (gh) gh.textContent = curHole;
    var gp = sGet('g-par'); if (gp) gp.textContent = par;
    var gd = sGet('g-dist'); if (gd) gd.textContent = dist > 0 ? dist : '—';
    if (soloRound) {
        try {
            // Дедлайн — по раунду целиком: иначе пауза не сдвигает план, и после
            // возобновления игрок видит «отставание» там, где время стояло.
            var dl = (typeof roundHoleDeadlineTs === 'function')
                ? roundHoleDeadlineTs(soloRound, curHole)
                : holeDeadline(soloRound.startTime, soloRound.startHole, curHole);
            var gdl = sGet('g-deadline'); if (gdl) gdl.textContent = fmtTime(dl);
        } catch (e) { console.warn("[silent]", e); }
    }
    var uid2 = getPlayerId();
    var scores = (uid2 && soloRound && soloRound.players && soloRound.players[uid2] && soloRound.players[uid2].scores) || {};
    var savedScore = parseInt(scores[curHole]) || 0;

    // Живое обновление данных не должно затирать ввод: пока счёт не сохранён
    // кнопкой, оставляем введённое значение на экране.
    if (!soloDirty) {
        curScore = savedScore > 0 ? savedScore : par;
    }
    updateDisplay();
    updateSoloActionButton();
    updateSoloPaceAssistant();
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

var soloSaveInFlight = false;
var soloSaveWatchdog = null;

function saveSolo() {
    if (!canEditSolo) {
        toast(t('msg_edit_disabled'), 'error');
        return;
    }
    // Защита от «пулемётного» ввода (#15): пока запись лунки не завершилась,
    // повторные нажатия игнорируются, а сторожевой таймер (3 c) гарантирует
    // разблокировку — интерфейс больше не зависает от быстрых тапов.
    if (soloSaveInFlight) return;
    if (curScore < 1) { toast(t('msg_score_min'), 'error'); return; }

    soloSaveInFlight = true;
    soloSaveWatchdog = setTimeout(function() { soloSaveInFlight = false; }, 3000);

    soloIsChanging = true;
    soloDirty = false;
    var savedHole = curHole;
    var scoreToSave = curScore; // фиксируем счёт до колбэка: ниже curScore может сбрасываться в 0

    var uid = getPlayerId();

    // Ввод/исправление счёта снимает ранее нажатый «Пропустить».
    try { if (typeof pestovoSkipDropAckHoles === 'function') pestovoSkipDropAckHoles(soloRid, uid, [savedHole]); } catch (e) { console.warn("[silent]", e); }

    var soloQueued = false;
    pestovoScoreWrite(soloRid, [{kind:'score',playerId:uid,hole:savedHole,score:scoreToSave}], uid).then(function(res) {
        if (res && res.offline) { soloQueued = true; return null; }
        return recordHoleCompletionTime(soloRid, uid, savedHole, Date.now());
    }).then(function() {
        if (soloQueued) {
            var pendingOrder = getRoundOrder(soloRound);
            var pendingIdx = pendingOrder.indexOf(savedHole);
            if (pendingIdx >= 0 && pendingIdx < pendingOrder.length - 1) { curHole = pendingOrder[pendingIdx + 1]; curScore = 0; }
            rememberResumeHole(soloRid, uid, curHole);
            renderCurrentHole(); buildHoles(); renderMiniCard('mini-card');
            soloIsChanging = false;
            if (soloSaveWatchdog) { clearTimeout(soloSaveWatchdog); soloSaveWatchdog = null; }
            soloSaveInFlight = false;
            return;
        }
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

        var p = soloRound.players && soloRound.players[uid];
        if (p) {
            // Оптимистично отражаем счёт и время лунки ЛОКАЛЬНО ДО отрисовки.
            // Раньше данные проставлялись после renderX(), поэтому на мобильных
            // (медленный/отложенный echo Firebase) тайминги и «Пройдено» не
            // обновлялись до прихода снапшота. Firebase-снапшот перезапишет
            // локальную копию фактическими данными (они совпадают).
            p.scores = p.scores || {};
            p.scores[savedHole] = scoreToSave;
            p.holeTimes = p.holeTimes || {};
            if (!(parseInt(p.holeTimes[savedHole]) > 0)) {
                p.holeTimes[savedHole] = Date.now();
            }
        }

        showTimingNotice(savedHole);
        renderCurrentHole();
        buildHoles();
        // Уведомление о пропущенных лунках больше не всплывает автоматически:
        // компактный выбор показывается только при ручном переходе через лунку.

        updateSoloActionButton();
        renderMiniCard('mini-card');
        // Темп игры/тайминги — пересчёт по уже обновлённым локальным данным,
        // не дожидаясь echo Firebase (актуально на мобильных сетях).
        renderLiveStats('live-stats');
        updateSoloPaceAssistant();
        // Если после ввода все лунки теперь заполнены — прячем кнопку
        // принудительного завершения (больше не нужна).
        try { if (!soloSkippedHoles().length) setSoloForceFinishBtnVisible(false); } catch (_) {}

        setTimeout(function() { soloIsChanging = false; }, 200);
        if (soloSaveWatchdog) { clearTimeout(soloSaveWatchdog); soloSaveWatchdog = null; }
        soloSaveInFlight = false;
    }).catch(function(errSave) {
        try { console.warn('[solo] save failed', errSave); } catch (e) { console.warn("[silent]", e); }
        toast(currentLang === 'en' ? '⚠️ Could not save — check connection' : '⚠️ Не удалось сохранить — проверьте соединение', 'error');
        if (soloSaveWatchdog) { clearTimeout(soloSaveWatchdog); soloSaveWatchdog = null; }
        soloSaveInFlight = false;
        soloIsChanging = false;
    });
}

function showTimingNotice(hole) {
    var el = document.getElementById('timing-notice');
    if (el) {
        // Раунд передаётся целиком — только так пауза участвует в расчёте.
        el.innerHTML = buildTimingNotice(soloRound.startTime, soloRound.startHole, hole, soloRound);
        var check = checkTiming(soloRound.startTime, soloRound.startHole, hole, soloRound);
        if (check.status === 'late' && check.diff > 0) {
            toast('⏰ ' + (currentLang === 'en' ? 'Pace lag ' : 'Отставание ') + check.diff + (currentLang === 'en' ? ' min' : ' мин'), 'warn');
        }
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

    // Несохранённый ввод: счёт изменён, но ещё не подтверждён.
    // Отдельного уведомления больше нет — состояние показывает сама кнопка.
    var hasUnsaved = canEditSolo && soloDirty && curScore >= 1;
    btn.classList.toggle('has-unsaved', hasUnsaved);

    var icon = btn.querySelector('i');

    if (playedCount >= holeCount && !hasUnsaved) {
        btn.onclick = function() { finishSolo(); };
        btn.className = 'btn btn-g btn-block btn-lg';
        if (txt) txt.innerHTML = currentLang === 'en' ? '🏆 Finish Round' : '🏆 Завершить раунд';
        if (icon) icon.className = 'fas fa-flag-checkered';
    } else if (hasUnsaved) {
        // Изменения ещё не записаны — кнопка всегда сохраняет результат,
        // даже на последней лунке (иначе ввод потерялся бы при завершении).
        btn.onclick = function() { saveSolo(); };
        btn.className = 'btn btn-g btn-block btn-lg has-unsaved';
        if (txt) txt.innerHTML = t('solo_save_result_btn');
        if (icon) icon.className = 'fas fa-check';
    } else {
        btn.onclick = function() { saveSolo(); };
        btn.className = 'btn btn-g btn-block';
        if (txt) txt.innerHTML = t('solo_next_keep_btn');
        if (icon) icon.className = 'fas fa-arrow-right';
    }
}

// ── ПРОПУЩЕННЫЕ ЛУНКИ ──
// Список лунок раунда, на которых счёт ещё не введён (до текущей включительно).
function soloSkippedHoles() {
    if (!soloRound) return [];
    var uid = getPlayerId();
    var p = uid && soloRound.players && soloRound.players[uid];
    var scores = (p && p.scores) || {};
    var order = getRoundOrder(soloRound);
    var out = [];
    order.forEach(function(h) {
        if (!(parseInt(scores[h]) > 0)) out.push(h);
    });
    return out;
}

// Предупреждение о пропущенных лунках: список с кнопками перехода
// («вбить счёт») и вариантом «продолжить с пропуском».
function renderMiniCard(targetId) {
    var el = document.getElementById(targetId);
    if (!el) return;
    var uid = getPlayerId();
    if (!uid || !soloRound || !soloRound.players) return;
    var p = soloRound.players[uid];
    if (!p) return;

    if (typeof generatePestovoScorecardHTML === 'function') {
        el.innerHTML = generatePestovoScorecardHTML(p, soloRound, { compact: true });
    }
}

var soloFinishing = false;

// Сессия открыта по ФИО с чужого устройства (?as=...), а не владельцем
// (свой аккаунт или access-key на устройстве). Завершать такой раунд можно
// только после проверки владения — другой игрок не должен закрыть чужую игру.
function soloIsFioResume() {
    if (!soloRound) return false;
    try {
        var as = new URLSearchParams(window.location.search).get('as');
        if (!as) return false;
    } catch (e) { return false; }
    var uid = getPlayerId();
    if (!uid) return false;
    if (currentUser && (soloRound.createdBy === currentUser.uid ||
        (soloRound.players && soloRound.players[currentUser.uid]))) return false;
    var localKey = localStorage.getItem('pestovo_solo_key_' + soloRid);
    if (localKey && soloRound.accessKey === localKey) return false;
    // Турнирная карточка участника (QR из стартового листа): завершает сам
    // игрок, подтверждение владельца не требуется.
    if (typeof pestovoIsTournamentCardHolder === 'function' && pestovoIsTournamentCardHolder(soloRound, uid)) return false;
    return true;
}

function finishSolo() {
    if (!canEditSolo) return;
    if (soloFinishing) return;
    if (soloRound && soloRound.status === 'completed') return;

    // 1) Чужое устройство по ФИО: завершать может только владелец раунда.
    var finishUid = getPlayerId();
    if (soloIsFioResume() && !(typeof pestovoFioVerified === 'function' && pestovoFioVerified(soloRid, finishUid))) {
        if (typeof pestovoVerifyRoundOwner === 'function') {
            pestovoVerifyRoundOwner(soloRound, soloRid, finishUid, function(ok) { if (ok) finishSolo(); });
            return;
        }
    }

    // 2) Пропущенные лунки: компактный выбор — исправить или завершить как есть.
    var skipped = soloSkippedHoles();
    if (skipped.length) {
        // Кнопка «завершить принудительно» показывается только при попытке
        // завершения с неподтверждёнными результатами — до этого скрыта.
        setSoloForceFinishBtnVisible(true);
        pestovoShowFinishMissingModal(skipped, {
            onEnter: function(h) { goHole(h); },
            onContinue: function() { goHole(skipped[0]); },
            onFinishAnyway: function() { doFinishSolo(); }
        });
        return;
    }
    setSoloForceFinishBtnVisible(false);
    doFinishSolo();
}

function doFinishSolo() {
    if (soloFinishing) return;
    if (!soloRound || soloRound.status === 'completed') return;
    soloFinishing = true;
    setSoloForceFinishBtnVisible(false);

    var finalizeSolo = function() {
        // Фиксируем, кто завершил раунд: в карточках раунда показываем имя завершившего
        var finisherUid = getPlayerId();
        var finisherName = (finisherUid && soloRound && soloRound.players && soloRound.players[finisherUid])
            ? (soloRound.players[finisherUid].name || '') : '';
        var finishUpdate = { status: 'completed', completedAt: Date.now(), autoCompleted: false };
        if (finisherUid) finishUpdate.completedBy = finisherUid;
        if (finisherName) finishUpdate.completedByName = finisherName;
        db.ref('rounds/' + soloRid).update(finishUpdate).then(function() {
            // Перечитываем раунд после записи и пишем историю ровно один раз
            // (транзакция-клейм): двойной клик/второе устройство/маркер не
            // должны оставлять в профиле дубль раунда.
            return db.ref('rounds/' + soloRid).once('value');
        }).then(function(sn) {
            var fresh = sn && sn.val();
            if (!fresh) return;

            // Турнирный соло-раунд: возможное автозавершение турнира (все раунды сыграны).
            if (fresh.tournamentId && typeof pestovoAutoFinishTournament === 'function') {
                try { pestovoAutoFinishTournament(fresh.tournamentId); } catch (_) { console.warn("[silent]", _); }
            }

            if (fresh.status !== 'completed') return;
            return pestovoClaimRoundHistory(soloRid).then(function(claimed) {
                if (claimed && typeof saveHistory === 'function') {
                    try { saveHistory(soloRid, fresh); } catch (e) { console.warn("[silent]", e); }
                }
            });
        }).catch(function(err) {
            // Молчаливый отказ скрывал проблему: RULES запрещают прямую запись
            // статуса раунда тому, кто его не создавал (QR-карточка турнира).
            soloFinishing = false;
            if (typeof toast === 'function') {
                toast(currentLang === 'en'
                    ? ('⚠️ Could not finish the round: ' + (err && err.code || err && err.message || err) + '. Scores are saved — contact the referee/committee.')
                    : ('⚠️ Не удалось завершить раунд: ' + (err && err.code || err && err.message || err) + '. Счёт сохранён — обратитесь к судье/в комитет.'), 'error');
            }
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
