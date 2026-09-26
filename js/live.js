var curRid = null;
var curRoundData = null;
var registeredUsers = {};
var availableTournaments = {};
function lGet(id){ try{ return document.getElementById(id); }catch(e){ return null; } }

// QR турнира (?round=&as= / ?player=): компактная шапка и доступное меню.
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
        var nav = document.getElementById('main-nav');
        if (nav) nav.classList.remove('hidden');
        if (typeof applyNavHeight === 'function') applyNavHeight();
        // Шапка теперь всегда видна, но компактная — даже в киоск-режиме (QR)
        ['my-active-rounds-container'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        var ph = document.getElementById('page-head');
        if (ph) {
            ph.classList.remove('hidden');
            ph.classList.add('scoring-compact');
        }
        var hideSel = document.querySelectorAll('footer, .footer');
        for (var i = 0; i < hideSel.length; i++) hideSel[i].classList.add('hidden');
    } catch (e) { console.warn("[silent]", e); }
    return true;
}

// Переменные активной игры
var playHole = 1;
var myUid = null;
var myTargetUid = null;
var myScore = 0;
var targetScore = 0;
var isChanging = false;
var canEditGroup = false;
var groupPaceTimer = null;

// Если администратор меняет клубный дефолт в процессе игры, его получают
// только игроки без сохранённого личного выбора.
document.addEventListener('pestovo-stableford-default-change', function() {
    if (!curRoundData || !canEditGroup) return;
    updateGroupStablefordToggle();
    renderPlayHole();
});

// Защита от гонки: если колбэк авторизации сработает до парсинга этого файла
// (медленная загрузка/кэш SW), подписываемся на раунд и из DOMContentLoaded.
var roundViewListening = false;
function bootRoundViewOnce() {
    if (roundViewListening || !curRid || (typeof pestovoQrAuthPending !== 'undefined' && pestovoQrAuthPending)) return;
    roundViewListening = true;
    initRoundView();
}

function updateGroupPaceAssistant() {
    if (curRoundData) renderPaceAssistant('group-pace-assistant', curRoundData);
}

function updateScoringHeader() {
    var headEl = lGet('page-head');
    var titleEl = lGet('page-title');
    var subEl = lGet('page-sub');
    if (!headEl || !titleEl || !curRoundData) return;
    var order = (typeof getRoundOrder === 'function' ? getRoundOrder(curRoundData) : []);
    var total = order.length || 18;
    var curIdx = order.indexOf(playHole);
    var curNum = curIdx >= 0 ? curIdx + 1 : 1;
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var tnName = (typeof roundTournamentName === 'function' ? roundTournamentName(curRoundData) : curRoundData.tournamentName) || '';
    // Компактная шапка — всё про лунку в одном месте: «Пестово • Лунка 18»,
    // вторая строка «Par 4 · 349 м · 🚩 5/18». Дублирующий блок hole-display
    // в групповом виде скрыт через CSS, чтобы карточки ввода были выше.
    if (titleEl) {
        var clubName = tnName || (isEn ? 'Pestovo' : 'Пестово');
        titleEl.textContent = clubName + ' • ' + (isEn ? 'Hole ' : 'Лунка ') + playHole;
    }
    if (subEl) {
        var prog = '<span class="scoring-progress"><i class="fas fa-flag"></i> ' + curNum + '/' + total + '</span>';
        var par = (typeof holePar === 'function' ? holePar(playHole) : 4);
        var dist = '';
        try {
            var myP = curRoundData.players && curRoundData.players[myUid];
            var myTee = myP && myP.tee ? myP.tee : (curRoundData.tee || 'wh');
            var d = (typeof holeDist === 'function' ? holeDist(playHole, myTee) : 0);
            if (d) dist = ' · ' + d + (isEn ? 'm' : 'м');
        } catch (e) { console.warn("[silent]", e); }
        subEl.innerHTML = prog + ' · Par ' + par + dist;
    }
}

function updateDualCompare() {
    var myComp = lGet('my-compare');
    var markComp = lGet('mark-compare');
    var divider = lGet('dual-divider');
    if (!curRoundData || !myUid) return;
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var myPlayer = curRoundData.players && curRoundData.players[myUid];
    if (!myPlayer) return;

    // Левая половина: мой счёт vs счёт моего маркера для меня.
    // Статус — компактной иконкой (⏳/✅/⚠️), чей ход — подсветкой карточки.
    var myHalf = document.getElementById('dual-half-my');
    if (myComp) {
        var myMarkerId = myPlayer.markedBy;
        var myS = parseInt(myPlayer.scores && myPlayer.scores[playHole]) || myScore || 0;
        var markerS = 0;
        if (myMarkerId) {
            markerS = parseInt(myPlayer.markerScores && myPlayer.markerScores[myMarkerId] && myPlayer.markerScores[myMarkerId][playHole]) || 0;
        }
        if (myS > 0 && markerS > 0) {
            if (myS === markerS) {
                myComp.className = 'dual-half__compare compare-ok';
                myComp.innerHTML = '✅';
                myComp.title = isEn ? 'Match' : 'Совпадает';
                myComp.setAttribute('aria-label', myComp.title);
            } else {
                var delta = myS - markerS;
                var deltaStr = (delta > 0 ? '+' : '') + delta;
                myComp.className = 'dual-half__compare compare-bad';
                myComp.innerHTML = '⚠️ Δ' + deltaStr;
                myComp.title = isEn ? 'Mismatch: you ' + myS + ', marker ' + markerS : 'Расхождение: вы ' + myS + ', маркер ' + markerS;
                myComp.setAttribute('aria-label', myComp.title);
            }
        } else if (myS > 0) {
            myComp.className = 'dual-half__compare compare-wait';
            myComp.innerHTML = '⏳';
            myComp.title = isEn ? 'Waiting for marker' : 'Ждём маркера';
            myComp.setAttribute('aria-label', myComp.title);
        } else {
            myComp.className = 'dual-half__compare';
            myComp.innerHTML = '';
            myComp.title = '';
            myComp.removeAttribute('aria-label');
        }
        // Подсветка хода — по СОХРАНЁННОМУ счёту (черновик myScore не в счёт).
        if (myHalf) {
            var mySaved = parseInt(myPlayer.scores && myPlayer.scores[playHole]) || 0;
            var myMkSaved = myMarkerId ? (parseInt(myPlayer.markerScores && myPlayer.markerScores[myMarkerId] && myPlayer.markerScores[myMarkerId][playHole]) || 0) : 0;
            myHalf.classList.remove('dual-turn', 'dual-wait', 'dual-ok');
            if (mySaved > 0 && myMkSaved > 0) {
                myHalf.classList.add(mySaved === myMkSaved ? 'dual-ok' : 'dual-turn');
            } else if (mySaved > 0) {
                myHalf.classList.add('dual-wait');
            } else {
                myHalf.classList.add('dual-turn');
            }
        }
    }

    // Правая половина: маркируемый — мой ввод vs его собственный счёт
    var markHalf = lGet('marker-input-container');
    if (markComp && myTargetUid) {
        var tp = curRoundData.players && curRoundData.players[myTargetUid];
        if (tp) {
            var tOwn = parseInt(tp.scores && tp.scores[playHole]) || 0;
            var tMine = targetScore || parseInt(tp.markerScores && tp.markerScores[myUid] && tp.markerScores[myUid][playHole]) || 0;
            if (tOwn > 0 && tMine > 0) {
                if (tOwn === tMine) {
                    markComp.className = 'dual-half__compare compare-ok';
                    markComp.innerHTML = '✅';
                    markComp.title = isEn ? 'Match' : 'Совпадает';
                    markComp.setAttribute('aria-label', markComp.title);
                } else {
                    var d2 = tMine - tOwn;
                    var d2Str = (d2 > 0 ? '+' : '') + d2;
                    markComp.className = 'dual-half__compare compare-bad';
                    markComp.innerHTML = '⚠️ Δ' + d2Str;
                    markComp.title = isEn ? 'Mismatch: marker ' + tMine + ', player ' + tOwn : 'Расхождение: маркер ' + tMine + ', игрок ' + tOwn;
                    markComp.setAttribute('aria-label', markComp.title);
                }
            } else if (tMine > 0) {
                markComp.className = 'dual-half__compare compare-wait';
                markComp.innerHTML = '⏳';
                markComp.title = isEn ? 'Waiting for player' : 'Ждём игрока';
                markComp.setAttribute('aria-label', markComp.title);
            } else {
                markComp.className = 'dual-half__compare';
                markComp.innerHTML = '';
                markComp.title = '';
                markComp.removeAttribute('aria-label');
            }
            if (markHalf) {
                var tFinished = (typeof isPlayerFinishedRound === 'function') && isPlayerFinishedRound(curRoundData, myTargetUid);
                var tMineSaved = parseInt(tp.markerScores && tp.markerScores[myUid] && tp.markerScores[myUid][playHole]) || 0;
                markHalf.classList.remove('dual-turn', 'dual-wait', 'dual-ok');
                if (!tFinished) {
                    if (tMineSaved > 0 && tOwn > 0) {
                        markHalf.classList.add(tMineSaved === tOwn ? 'dual-ok' : 'dual-turn');
                    } else if (tMineSaved > 0) {
                        markHalf.classList.add('dual-wait');
                    } else {
                        markHalf.classList.add('dual-turn');
                    }
                }
            }
        }
    }

    // Центральный разделитель: общий статус
    if (divider) {
        var myMarkerId2 = myPlayer.markedBy;
        var myS2 = parseInt(myPlayer.scores && myPlayer.scores[playHole]) || 0;
        var markerS2 = myMarkerId2 ? (parseInt(myPlayer.markerScores && myPlayer.markerScores[myMarkerId2] && myPlayer.markerScores[myMarkerId2][playHole]) || 0) : 0;
        var tOwn2 = 0, tMine2 = 0;
        if (myTargetUid) {
            var tp2 = curRoundData.players && curRoundData.players[myTargetUid];
            tOwn2 = tp2 ? (parseInt(tp2.scores && tp2.scores[playHole]) || 0) : 0;
            tMine2 = tp2 ? (parseInt(tp2.markerScores && tp2.markerScores[myUid] && tp2.markerScores[myUid][playHole]) || 0) : 0;
        }
        divider.classList.remove('compare-match', 'compare-mismatch');
        if ((myS2 && markerS2 && myS2 !== markerS2) || (tOwn2 && tMine2 && tOwn2 !== tMine2)) {
            divider.classList.add('compare-mismatch');
        } else if ((myS2 && markerS2 && myS2 === markerS2) || (tOwn2 && tMine2 && tOwn2 === tMine2)) {
            divider.classList.add('compare-match');
        }
    }
}

function animateHoleTransition(newHole) {
    try {
        var btns = document.querySelectorAll('#play-holes-nav .hole-btn');
        for (var i = 0; i < btns.length; i++) {
            var b = btns[i];
            var onclick = b.getAttribute('onclick') || '';
            if (onclick.indexOf('goPlayHole(' + newHole + ')') !== -1) {
                b.classList.add('hole-enter-anim');
                (function(btn){
                    setTimeout(function(){ btn.classList.remove('hole-enter-anim'); }, 800);
                })(b);
                try { b.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'}); } catch (e) { console.warn("[silent]", e); }
                break;
            }
        }
    } catch (e) { console.warn("[silent]", e); }
    if (typeof vib === 'function') {
        try { vib([35, 40, 35]); } catch (e) { console.warn("[silent]", e); }
    }
}

function startGroupPaceTicker() {
    if (groupPaceTimer) clearInterval(groupPaceTimer);
    updateGroupPaceAssistant();
    groupPaceTimer = setInterval(function() {
        updateGroupPaceAssistant();
    }, isBatterySaverEnabled() ? 60000 : 30000);
}

document.addEventListener('DOMContentLoaded', function() {
    initNav();
    applyScoreKiosk();
    // Вид страницы ввода счёта (5 вариантов) — выбирает админ, действует для всех.
    if (typeof pestovoBindView5 === 'function') pestovoBindView5('scoring', function() { try { syncView5BodyClasses(); } catch (e) { console.warn("[silent]", e); } });
    var p = new URLSearchParams(window.location.search);
    curRid = p.get('round');

    var actingAs = p.get('as');
    if (actingAs && curRid) {
        localStorage.setItem('pestovo_acting_as_' + curRid, actingAs);
        // Keep `as` in the URL: Safari/ITP and camera-opened tabs otherwise
        // drop localStorage and fall back to view-only.
        // Служебные параметры ссылки сохраняем: раньше они терялись при
        // перезаписи URL — не открывался диалог завершения (?finish=1) и
        // терялась метка перехода из поиска по ФИО (?fio=1).
        var keptQuery = 'round=' + encodeURIComponent(curRid) + '&as=' + encodeURIComponent(actingAs);
        ['fio', 'finish', 'player'].forEach(function(param) {
            var value = p.get(param);
            if (value) keptQuery += '&' + param + '=' + encodeURIComponent(value);
        });
        window.history.replaceState(null, null, window.location.pathname + '?' + keptQuery);
    }

    // не ждём авторизацию: гость с ключом раунда тоже должен сразу попасть в счёт
    if (curRid) bootRoundViewOnce();
    else if (p.get('mode') === 'group') switchSetupMode('group');

    // погодный виджет инициализируется в initNav() с правильным контейнером
});

function onAuthReady(u, d) {
    navAuth(u, d);
    // Доступ участника мог определиться только после входа в аккаунт:
    // если слушатель уже подписан как гость — перепроверяем права с учётом uid.
    if (roundViewListening && u && myUid === null && curRoundData) {
        roundViewListening = false;
        try { db.ref('rounds/' + curRid).off('value'); } catch (e) { console.warn("[silent]", e); }
    }
    bootRoundViewOnce();
    // Дефолты формы одиночного раунда (обе вкладки живут на одной странице)
    if (typeof soloAuthReady === 'function') soloAuthReady(u, d);
}

// ==========================================
// ВКЛАДКИ РЕЖИМА: ОДИНОЧНЫЙ / ГРУППОВОЙ
// ==========================================
var setupGroupInited = false;

function switchSetupMode(mode) {
    var tabSolo = document.getElementById('tab-solo');
    var tabGroup = document.getElementById('tab-group');
    var soloPane = document.getElementById('solo-setup');
    var groupPane = document.getElementById('group-setup');
    if (!tabSolo || !tabGroup || !soloPane || !groupPane) return;

    var isGroup = (mode === 'group');
    tabSolo.classList.toggle('active', !isGroup);
    tabGroup.classList.toggle('active', isGroup);
    soloPane.classList.toggle('hidden', isGroup);
    groupPane.classList.toggle('hidden', !isGroup);

    // Форма группы инициализируется лениво — при первом открытии вкладки
    if (isGroup && !setupGroupInited) {
        setupGroupInited = true;
        showGroupSetup();
    }
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
}

// ==========================================
// СОЗДАНИЕ ГРУППЫ
// ==========================================
function showGroupSetup() {
    var sel = document.getElementById('grp-hole');
    if (sel) {
        var rangeEl = document.getElementById('grp-range');
        buildStartHoleOptions(sel, rangeEl ? rangeEl.value : '1-18');
    }

    // Дефолт «сейчас» ставим только в пустое поле: showGroupSetup
    // вызывается повторно (смена языка, повторная инициализация), и
    // введённое игроком время не должно затираяться.
    var now = new Date();
    var timeInput = document.getElementById('grp-time');
    if (timeInput && !timeInput.value) {
        timeInput.value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    }

    var teeSel = document.getElementById('grp-tee');
    if (teeSel && currentUserData && currentUserData.defaultTee) {
        teeSel.value = currentUserData.defaultTee;
    }

    updateGroupTimingPreview();

    db.ref('usersPublic').once('value').then(function(sn) {
        registeredUsers = sn.val() || {};
        buildPlayerSlots();
    }).catch(function(err) {
        // Если список пользователей не загрузился (сеть/правила) — всё равно
        // рисуем слоты игроков: без них форму нельзя заполнить и раунд не
        // создать. Теряется только автоподстановка зарегистрированных игроков.
        try { console.warn('[group] users load failed, slots without autofill', err); } catch (e) { console.warn("[silent]", e); }
        registeredUsers = {};
        buildPlayerSlots();
    });

}

// Турнир в групповом раунде больше не выбирается: в турнир попадают только
// зарегистрированные участники (раздел «Турниры»). Функция оставлена
// для совместимости — на странице больше нет селекта #grp-tournament.
function bindPlayerSlotsAccordion() {
    var container = document.getElementById('player-slots');
    if (!container || container._accordionBound) return;
    container._accordionBound = true;

    var toggle = function(head) {
        var card = head.closest ? head.closest('.setup-player-card') : null;
        if (!card) return;
        var wasOpen = card.classList.contains('open');
        var cards = container.querySelectorAll('.setup-player-card');
        for (var k = 0; k < cards.length; k++) {
            cards[k].classList.remove('open');
            var h = cards[k].querySelector('.setup-player-head');
            if (h) h.setAttribute('aria-expanded', 'false');
        }
        if (!wasOpen) {
            card.classList.add('open');
            head.setAttribute('aria-expanded', 'true');
        }
    };

    container.addEventListener('click', function(e) {
        var head = e.target && e.target.closest ? e.target.closest('.setup-player-head') : null;
        // Клики по полям внутри карточки раскрытие не переключают.
        if (head && container.contains(head)) toggle(head);
    });
    container.addEventListener('keydown', function(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var head = e.target && e.target.closest ? e.target.closest('.setup-player-head') : null;
        if (head && container.contains(head)) { e.preventDefault(); toggle(head); }
    });
}

// Степпер «Параметры → Игроки → Старт» над формой группы (мобильный сценарий,
// см. docs/mobile-audit.md). Раньше создавался в initP0MobileEnhancements() по
// таймингу DOMContentLoaded — до отрисовки слотов — и потому не появлялся вовсе.
function ensurePlayerWizardSteps(playerCount) {
    if (!(playerCount > 1)) return;
    // Мастер «По шагам» (админ-вариант 5) ведёт свой степпер —
    // статический мобильный не дублируем.
    try { if (typeof setupVariant === 'function' && setupVariant() === '5') return; } catch (e) { /* игнорируем */ }
    if (document.getElementById('p0-wizard-steps')) return;
    var isEn = false;
    try { isEn = currentLang === 'en'; } catch (e) { isEn = false; }
    var labels = isEn ? ['Settings', 'Players', 'Start'] : ['Параметры', 'Игроки', 'Старт'];
    var steps = document.createElement('div');
    steps.id = 'p0-wizard-steps';
    steps.className = 'p0-wizard-steps';
    steps.innerHTML = labels.map(function(txt, i) {
        return '<div class="p0-step' + (i === 0 ? ' active' : '') + '"><span>' + (i + 1) + '</span>' + txt + '</div>';
    }).join('');
    // v1.69.0: единая форма — якорь изменился (#unified-setup-card),
    // старый #group-setup оставлен для совместимости.
    var anchor = document.querySelector('#unified-setup-card') ||
                 document.querySelector('#group-setup .setup-card') ||
                 document.querySelector('.setup-card');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(steps, anchor);
}

function buildPlayerSlots() {
    // v1.69.0: единая форма создания раунда — слоты игроков рисует
    // js/round-setup.js (кнопка «Добавить игрока», сохранение введённого,
    // 5 админских вариантов отображения). Старая разметка с селектором
    // количества игроков больше не используется.
    if (typeof renderSetupPlayers === 'function' && document.getElementById('player-slots')) {
        renderSetupPlayers(true);
        return;
    }
    var cntEl = lGet('grp-count');
    var count = cntEl ? (parseInt(cntEl.value) || 2) : 2;
    var el = lGet('player-slots'); if (!el) return;
    var html = '<h3 class="setup-subhead"><i class="fas fa-user-plus"></i> ' + t('players_label') + '</h3>';

    var namePlaceholder = currentLang === 'en' ? 'John Doe' : 'Имя Фамилия';

    bindPlayerSlotsAccordion();

    for (var i = 1; i <= count; i++) {
        // Первая карточка раскрыта по умолчанию (open), остальные свёрнуты —
        // раскрытие переключается кликом по заголовку (см. bindPlayerSlotsAccordion).
        html += '<div class="setup-player-card' + (i === 1 ? ' open' : '') + '">';
        html += '<div class="setup-player-head" role="button" tabindex="0" aria-expanded="' + (i === 1 ? 'true' : 'false') + '"><span><i class="fas fa-user"></i> ' + t('player') + ' #' + i + '</span><i class="fas fa-chevron-down" aria-hidden="true"></i></div>';
        
        html += '<div class="form-row form-row-3">';
        html += '<div class="form-group" style="flex:1.4 1 120px;position:relative;"><label>' + t('first_name') + ' & ' + t('last_name') + '</label><input type="text" id="pl-name-' + i + '" class="form-input" placeholder="' + namePlaceholder + '"><input type="hidden" id="pl-uid-' + i + '" value=""></div>';
        html += '<div class="form-group" style="flex:1 1 90px;"><label>' + t('middle_name') + '</label><input type="text" id="pl-mid-' + i + '" class="form-input" placeholder="' + (currentLang === 'en' ? 'Jr.' : 'Отчество') + '"></div>';
        html += '<div class="form-group" style="flex:1 1 90px;"><label>' + t('gender_label') + '</label><select id="pl-gender-' + i + '" class="form-input" onchange="onPlayerGenderOrTeeChange(' + i + ')"><option value="men">' + t('men') + '</option><option value="women">' + t('women') + '</option></select></div>';
        html += '</div>';

        html += '<div class="form-row form-row-3">';
        html += '<div class="form-group" style="flex:1 1 90px;"><label>' + t('tee_select') + '</label><select id="pl-tee-' + i + '" class="form-input" onchange="calcPlayerFieldHcp(' + i + ')"><option value="bk">' + t('tee_opt_bk') + '</option><option value="bl" selected>' + t('tee_opt_bl') + '</option><option value="wh">' + t('tee_opt_wh') + '</option><option value="rd">' + t('tee_opt_rd') + '</option></select></div>';
        html += '<div class="form-group" style="flex:1 1 90px;"><label>' + t('exact_hcp') + '</label><input type="text" inputmode="decimal" id="pl-hcp-' + i + '" class="form-input" placeholder="+2.4 / 12.4" oninput="calcPlayerFieldHcp(' + i + ')"></div>';
        html += '<div class="form-group" style="flex:1 1 90px;"><label>' + t('field_auto') + '</label><input type="text" id="pl-field-' + i + '" class="form-input" readonly placeholder="—"></div>';
        html += '</div></div>';
    }
    el.innerHTML = html;

    for (var i = 1; i <= count; i++) {
        (function(idx) {
            var nameInp = document.getElementById('pl-name-' + idx);
            if (typeof initPlayerSearchAutofill === 'function') {
                initPlayerSearchAutofill({
                    searchInputId: 'pl-name-' + idx,
                    onSelect: function(matchedUser) {
                        var nEl = document.getElementById('pl-name-' + idx);
                        var uEl = document.getElementById('pl-uid-' + idx);
                        var midEl = document.getElementById('pl-mid-' + idx);
                        var gEl = document.getElementById('pl-gender-' + idx);
                        var tEl = document.getElementById('pl-tee-' + idx);
                        var hEl = document.getElementById('pl-hcp-' + idx);

                        // Имя+фамилию вставляем без отчества — оно в отдельном поле.
                        // Не берём строку подсказки («Фамилия Имя Отчество»), чтобы
                        // фамилия не попала в имя.
                        var parts = (typeof resolvePlayerNameParts === 'function')
                            ? resolvePlayerNameParts(matchedUser)
                            : matchedUser;
                        if (nEl) {
                            nEl.value = ((parts.firstName || '') + ' ' + (parts.lastName || '')).trim();
                        }
                        if (uEl) uEl.value = matchedUser.uid;
                        if (midEl) midEl.value = parts.middleName || '';
                        if (gEl) gEl.value = matchedUser.gender;

                        if (tEl) {
                            if (matchedUser.defaultTee) {
                                tEl.value = matchedUser.defaultTee;
                            } else if (matchedUser.gender === 'women') {
                                tEl.value = 'rd';
                            } else {
                                tEl.value = 'bl';
                            }
                        }

                        if (hEl) hEl.value = fmtExactHcp(matchedUser.handicap);

                        calcPlayerFieldHcp(idx);
                        if (typeof toast === 'function') toast('👤 ' + (currentLang === 'en' ? 'Selected player: ' : 'Выбран игрок: ') + matchedUser.name + ' (' + fmtExactHcp(matchedUser.handicap) + ' HCP)', 'info');
                    },
                    onClear: function() {
                        var uEl = document.getElementById('pl-uid-' + idx);
                        var midEl = document.getElementById('pl-mid-' + idx);
                        var hEl = document.getElementById('pl-hcp-' + idx);
                        var fEl = document.getElementById('pl-field-' + idx);
                        if (uEl) uEl.value = '';
                        if (midEl) midEl.value = '';
                        if (hEl) hEl.value = '';
                        if (fEl) fEl.value = '';
                    }
                });
            }
        })(i);
    }

    if (currentUser && currentUserData) {
        var p1Name = document.getElementById('pl-name-1');
        var p1Uid = document.getElementById('pl-uid-1');
        var p1Mid = document.getElementById('pl-mid-1');
        var p1Gender = document.getElementById('pl-gender-1');
        var p1Tee = document.getElementById('pl-tee-1');
        var p1Hcp = document.getElementById('pl-hcp-1');

        if (p1Name && !p1Name.value) {
            if (currentUserData.firstName || currentUserData.lastName) {
                p1Name.value = ((currentUserData.firstName || '') + ' ' + (currentUserData.lastName || '')).trim();
            } else {
                p1Name.value = currentUserData.name || '';
            }
        }
        if (p1Mid) p1Mid.value = currentUserData.middleName || '';
        if (p1Uid) p1Uid.value = currentUser.uid;
        if (p1Gender && currentUserData.gender) p1Gender.value = currentUserData.gender;
        if (p1Tee) {
            if (currentUserData.defaultTee) p1Tee.value = currentUserData.defaultTee;
            else if (currentUserData.gender === 'women') p1Tee.value = 'rd';
            else p1Tee.value = 'bl';
        }
        if (p1Hcp && currentUserData.handicap != null) p1Hcp.value = fmtExactHcp(currentUserData.handicap);

        calcPlayerFieldHcp(1);
    }

    ensurePlayerWizardSteps(count);
}

function onPlayerGenderOrTeeChange(idx) {
    var genderEl = document.getElementById('pl-gender-' + idx);
    var teeEl = document.getElementById('pl-tee-' + idx);
    if (genderEl && teeEl) {
        var g = genderEl.value;
        if (g === 'women' && (teeEl.value === 'bk' || teeEl.value === 'bl')) {
            teeEl.value = 'rd';
        } else if (g === 'men' && teeEl.value === 'rd') {
            teeEl.value = 'bl';
        }
    }
    calcPlayerFieldHcp(idx);
    // Единая форма: обновляем цвет ТИ / метку карточки (js/round-setup.js)
    if (typeof markSetupPlayerMeta === 'function') markSetupPlayerMeta(idx);
}

function calcPlayerFieldHcp(idx) {
    var hcpEl = document.getElementById('pl-hcp-' + idx);
    var genderEl = document.getElementById('pl-gender-' + idx);
    var teeEl = document.getElementById('pl-tee-' + idx);
    
    if (!hcpEl || !genderEl || !teeEl) return;
    var hcp = hcpEl.value;
    var gender = genderEl.value;
    var tee = teeEl.value;

    var fieldEl = document.getElementById('pl-field-' + idx);
    if (!hcp && hcp !== '0') { 
        if (fieldEl) fieldEl.value = ''; 
        return; 
    }
    
    var field = getFieldHcp(hcp, tee, gender);
    if (fieldEl) fieldEl.value = fmtFieldHcp(field);
}

function updateGroupTimingPreview() {
    var timeEl = document.getElementById('grp-time');
    var holeEl = document.getElementById('grp-hole');
    var rangeEl = document.getElementById('grp-range');
    if (!timeEl || !holeEl) return;
    var timeStr = timeEl.value;
    var startHole = parseInt(holeEl.value) || 1;
    var holeRange = rangeEl ? rangeEl.value : '1-18';
    if (!timeStr) return;
    var parts = timeStr.split(':');
    var now = new Date();
    var startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        parseInt(parts[0]), parseInt(parts[1]), 0);
    var previewEl = document.getElementById('grp-timing-preview');
    if (previewEl) previewEl.innerHTML = buildTimingTable(startDate.getTime(), startHole, holeRange);
}

// При смене «сколько лунок» перестраиваем список стартовых лунок под выбранный
// диапазон (1-9 → только лунки 1-9, 10-18 → только 10-18) и подстраиваем выбор
function applyRangeToStartHole(mode) {
    var rangeId = mode === 'solo' ? 's-range' : 'grp-range';
    var holeId = mode === 'solo' ? 's-hole' : 'grp-hole';
    var rangeEl = document.getElementById(rangeId);
    var holeEl = document.getElementById(holeId);
    if (!rangeEl || !holeEl) return;
    buildStartHoleOptions(holeEl, rangeEl.value);
    if (mode === 'solo') updateTimingPreview();
    else updateGroupTimingPreview();
}

document.addEventListener('change', function(e) {
    if (e.target.id === 'grp-time' || e.target.id === 'grp-hole') {
        updateGroupTimingPreview();
    } else if (e.target.id === 'grp-range') {
        applyRangeToStartHole('group');
    } else if (e.target.id === 's-range') {
        applyRangeToStartHole('solo');
    }
});

// ==========================================
// СТАРТ И АВТО-МАРКЕРЫ
// ==========================================
var groupStarting = false;

// Предзагрузка QR-кодов подключения: вызывается сразу после создания раунда,
// чтобы к моменту открытия панели «Подключение игроков» коды были в кэше
// браузера и открывались мгновенно (иногда внешний сервис отвечал медленно).
function prewarmInviteQrImages(roundId, players) {
    if (typeof pestovoPrewarmQrImages !== 'function') return;
    var base = baseUrl();
    var urls = [];
    Object.entries(players || {}).forEach(function(pe) {
        var pid = pe[0];
        urls.push(base + 'setup-round.html?round=' + roundId + '&as=' + pid);
    });
    pestovoPrewarmQrImages(urls);
}

function startGroup() {
    if (groupStarting) return;

    var timeStr = document.getElementById('grp-time').value;
    var startHole = parseInt(document.getElementById('grp-hole').value) || 1;
    var format = document.getElementById('grp-format').value;
    var holeRange = document.getElementById('grp-range') ? document.getElementById('grp-range').value : '1-18';
    // v1.69.0: состав группы = карточки игроков, реально присутствующие в
    // форме (кнопка «Добавить игрока»). Индексы необязательно подряд —
    // после удаления игрока в списке могут быть «дырки».
    var slotIdxs = (typeof setupPlayerIndices === 'function') ? setupPlayerIndices() : [];
    if (!slotIdxs.length) slotIdxs = [1, 2];

    if (!timeStr) { toast(t('msg_start_time_req'), 'error'); return; }

    var selectedUids = [];
    var inputs = [];

    for (var si = 0; si < slotIdxs.length; si++) {
        var i = slotIdxs[si];
        var uidEl = document.getElementById('pl-uid-' + i);
        var uid = uidEl ? uidEl.value : '';
        var nameEl = document.getElementById('pl-name-' + i);
        var name = nameEl ? sanitizeNameRaw(nameEl.value) : '';
        var midEl = document.getElementById('pl-mid-' + i);
        var midName = midEl ? sanitizeNameRaw(midEl.value) : '';
        var nameParts = name ? name.split(' ') : [];
        var fullName = name;
        if (midName) {
            fullName = nameParts.length >= 2
                ? (nameParts[0] + ' ' + midName + ' ' + nameParts.slice(1).join(' '))
                : ((name + ' ' + midName).trim());
        }
        var hcpStr = document.getElementById('pl-hcp-' + i).value;
        var gender = document.getElementById('pl-gender-' + i).value;
        var playerTee = document.getElementById('pl-tee-' + i) ? document.getElementById('pl-tee-' + i).value : 'wh';

        if (uid) {
            if (selectedUids.indexOf(uid) !== -1) {
                var dupName = name || uid;
                toast((currentLang === 'en' ? 'Duplicate player selected: ' : 'Выбран дублирующий игрок: ') + dupName, 'error');
                return;
            }
            selectedUids.push(uid);
        }

        if (!name) { toast(t('msg_name_req') + ' #' + i, 'error'); return; }

        inputs.push({
            idx: i,
            uid: uid,
            name: fullName,
            firstName: nameParts[0] || '',
            lastName: nameParts.slice(1).join(' ') || '',
            middleName: midName,
            hcpStr: hcpStr,
            gender: gender,
            tee: playerTee,
            parsedHcp: parseExactHcp(hcpStr),
            fieldHcp: hcpStr ? getFieldHcp(parseExactHcp(hcpStr), playerTee, gender) : 0
        });
    }

    function proceedWithGroupStart() {
        groupStarting = true;

        var resolver = typeof resolveOrCreatePlayerUser === 'function'
            ? resolveOrCreatePlayerUser
            : (typeof registerGuestPlayerInDatabase === 'function' ? registerGuestPlayerInDatabase : null);

        var resolveOne = function(inp) {
            if (inp.uid) return Promise.resolve(inp.uid);
            if (resolver) {
                try {
                    return resolver({
                        uid: null,
                        name: inp.name,
                        firstName: inp.firstName,
                        lastName: inp.lastName,
                        middleName: inp.middleName,
                        exactHcp: inp.parsedHcp,
                        gender: inp.gender,
                        tee: inp.tee
                    }).catch(function() { return null; });
                } catch (e) {
                    return Promise.resolve(null);
                }
            }
            return Promise.resolve(null);
        };

        var resolveAll = Promise.all(inputs.map(resolveOne));

        resolveAll.then(function(resolvedIds) {
        var players = {};
        var pOrder = [];
        var seenIds = {};
        var seenNames = {};

        for (var j = 0; j < inputs.length; j++) {
            var inp = inputs[j];
            var pid = resolvedIds[j] || ('guest_' + Date.now() + '_' + inp.idx);
            // Два разных поля с одним игроком (одинаковое имя без выбора из списка)
            // после разрешения дают одинаковый id — это настоящий дубль.
            // Если же имена РАЗНЫЕ, а id совпал (записи случайно слиплись по
            // похожему ФИО), не блокируем старт — выдаём второму игроку
            // уникальный гостевой id, иначе группа не создавалась вовсе.
            if (seenIds[pid]) {
                var normName = (typeof normalizeSearchText === 'function')
                    ? normalizeSearchText(inp.name)
                    : String(inp.name || '').toLowerCase().trim();
                if (!normName || seenNames[pid] === normName) {
                    toast((currentLang === 'en' ? 'Duplicate player in group: ' : 'Дублирующий игрок в группе: ') + inp.name, 'error');
                    groupStarting = false;
                    return;
                }
                pid = 'guest_' + Date.now() + '_' + inp.idx + '_' + Math.random().toString(36).slice(2, 7);
                while (seenIds[pid]) pid += 'x';
            }
            seenIds[pid] = true;
            seenNames[pid] = (typeof normalizeSearchText === 'function')
                ? normalizeSearchText(inp.name)
                : String(inp.name || '').toLowerCase().trim();

            players[pid] = {
                name: inp.name,
                firstName: inp.firstName || '',
                lastName: inp.lastName || '',
                middleName: inp.middleName || '',
                exactHcp: inp.parsedHcp,
                fieldHcp: inp.fieldHcp,
                gender: inp.gender,
                tee: inp.tee,
                isGuest: String(pid).indexOf('guest_') === 0,
                scores: {},
                holeTimes: {},
                markerScores: {},
                submitted: {},
                markerSubmitted: {},
                verified: {}
            };
            pOrder.push(pid);
        }

        var markerAssignments = {};
        for (var m = 0; m < pOrder.length; m++) {
            var markerId = pOrder[m];
            var targetId = pOrder[(m + 1) % pOrder.length];

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

        var flightTee = (pOrder.length > 0 && players[pOrder[0]] && players[pOrder[0]].tee) ? players[pOrder[0]].tee : 'wh';

        // Создатель раунда — первый игрок (pOrder[0]). Он уже вошёл в раунд на своём устройстве.
        if (pOrder.length > 0 && players[pOrder[0]]) {
            players[pOrder[0]].isCreator = true;
            players[pOrder[0]].joined = true;
            players[pOrder[0]].joinedAt = Date.now();
        }

        var data = {
            mode: 'group',
            tee: flightTee,
            format: format,
            holeRange: holeRange,
            startHole: startHole,
            startTime: startDate.getTime(),
            players: players,
            holeTimes: {},
            markerAssignments: markerAssignments,
            participantsList: pOrder,
            status: 'active',
            createdAt: Date.now(),
            createdBy: creatorId,
            creatorPlayerId: pOrder[0],
            accessKey: accessKey
        };

        var ref = db.ref('rounds').push();
        var newRoundId = ref.key;

        localStorage.setItem('pestovo_group_key_' + newRoundId, accessKey);
        localStorage.setItem('pestovo_acting_as_' + newRoundId, pOrder[0]);

        // QR-коды подключения начинаем генерировать СРАЗУ после нажатия
        // «Начать раунд» — к моменту открытия панели они уже в кэше браузера.
        prewarmInviteQrImages(newRoundId, players);
        ref.set(data).then(function() {
            toast(t('msg_round_started'));
            window.location.href = 'setup-round.html?round=' + newRoundId;
        }).catch(function(err) {
            groupStarting = false;
            toast('⚠️ Ошибка запуска раунда: ' + err.message, 'error');
        });
    }).catch(function(err) {
        groupStarting = false;
        toast('⚠️ Ошибка запуска раунда: ' + (err && err.message ? err.message : err), 'error');
    });
    }

    var fullNamesForCheck = inputs.map(function(x) { return x.name; });
    if (typeof pestovoCheckFioConflictsForGroup === 'function') {
        try { if (typeof toast === 'function') toast('Проверка активных сессий...', 'info'); } catch (e) { console.warn("[silent]", e); }
        pestovoCheckFioConflictsForGroup(fullNamesForCheck).then(function(conflicts) {
            if (conflicts && conflicts.length) {
                // Турнирные раунды отдельны от соло/групповых: игрок в турнире
                // не может начать новый групповой раунд (жёсткий запрет).
                var tnRounds = (typeof pestovoTournamentRounds === 'function')
                    ? pestovoTournamentRounds(conflicts)
                    : conflicts.filter(function(c) {
                        return (typeof isTournamentRound === 'function') && isTournamentRound(c.round);
                    });
                if (tnRounds.length) {
                    groupStarting = false;
                    toast(currentLang === 'en'
                        ? '⛔ A player is in a tournament round — group rounds are not available.'
                        : '⛔ Игрок участвует в турнирном раунде — новый групповой раунд недоступен.', 'error');
                    return;
                }
                if (typeof pestovoShowFioConflictModal === 'function') {
                    pestovoShowFioConflictModal(conflicts, function() { proceedWithGroupStart(); });
                } else {
                    var names = conflicts.map(function(c){ return c.fio || c.inputFio || ''; }).join(', ');
                    toast('⚠️ У игроков уже есть активные раунды: ' + names, 'error');
                }
                return;
            }
            proceedWithGroupStart();
        }).catch(function() {
            proceedWithGroupStart();
        });
    } else {
        proceedWithGroupStart();
    }
}

// ==========================================
// ЛИЧНОЕ ОТОБРАЖЕНИЕ STABLEFORD В ГРУППОВОМ РАУНДЕ
// ==========================================
function updateGroupStablefordToggle() {
    var toggle = document.getElementById('group-stableford-toggle');
    var control = document.getElementById('group-stableford-control');
    if (!toggle) return;

    var player = curRoundData && curRoundData.players && myUid ? curRoundData.players[myUid] : null;
    toggle.checked = isPlayerStablefordDisplayEnabled(player);
    toggle.disabled = !canEditGroup || !player;
    if (control) control.classList.toggle('is-disabled', toggle.disabled);
}

function toggleGroupStablefordDisplay(enabled) {
    if (!canEditGroup || !curRid || !myUid || !curRoundData || !curRoundData.players || !curRoundData.players[myUid]) return;

    enabled = !!enabled;
    // Отображаем новый выбор сразу, а затем сохраняем его именно в карточке
    // этого игрока текущего раунда — другие игроки не затрагиваются.
    curRoundData.players[myUid].stablefordDisplay = enabled;
    renderPlayHole();
    updateGroupStablefordToggle();

    db.ref('rounds/' + curRid + '/players/' + myUid + '/stablefordDisplay').set(enabled).then(function() {
        toast(enabled
            ? (currentLang === 'en' ? 'Stableford points are shown' : 'Очки Stableford показаны')
            : (currentLang === 'en' ? 'Stableford points are hidden' : 'Очки Stableford скрыты'), 'info');
    }).catch(function(error) {
        console.warn('[Stableford] Cannot save personal display setting', error);
        toast(currentLang === 'en' ? 'Could not save the Stableford setting' : 'Не удалось сохранить настройку Stableford', 'error');
    });
}

// ==========================================
// ПРОВЕРКА ДОСТУПА К РАУНДУ
// ==========================================
function getActingUid() {
    if (!curRoundData || !curRoundData.players) return null;

    var urlAs = null;
    try { urlAs = new URLSearchParams(window.location.search).get('as'); } catch (e) { console.warn("[silent]", e); }
    if (urlAs && curRoundData.players[urlAs]) {
        return urlAs;
    }

    var storedUid = localStorage.getItem('pestovo_acting_as_' + curRid);
    if (storedUid && curRoundData.players[storedUid]) {
        return storedUid;
    }

    if (currentUser && curRoundData.players[currentUser.uid]) {
        return currentUser.uid;
    }

    var localKey = localStorage.getItem('pestovo_group_key_' + curRid);
    if (localKey && curRoundData.accessKey === localKey) {
        return Object.keys(curRoundData.players)[0];
    }

    return null;
}

var roundViewHandler = null;

// ==========================================
// ОДНА ТЯЖЁЛАЯ ПЕРЕРИСОВКА НА КАДР
// ==========================================
// Быстрый ввод счёта (несколько нажатий подряд) рождает серию снимков
// Firebase. Раньше на КАЖДЫЙ снимок заново строились карточка группы,
// QR-коды, темп игры и кнопки вызова судьи — на телефоне эти перерисовки
// складывались в очередь и главный поток вставал намертво.
// Теперь: состояние обновляется сразу, а тяжёлый рендер выполняется не чаще
// одного раза за кадр и пропускается, если данные не изменились.
var roundRenderQueued = false;
var roundRenderTimer = null;

function scheduleRoundRender() {
    if (roundRenderQueued) return;
    roundRenderQueued = true;
    var run = function() {
        if (!roundRenderQueued) return;
        roundRenderQueued = false;
        if (roundRenderTimer) { clearTimeout(roundRenderTimer); roundRenderTimer = null; }
        try { renderRoundViewParts(); } catch (e) { try { console.warn('[round render]', e); } catch (_) { console.warn("[silent]", _); } }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 16);
    // requestAnimationFrame не срабатывает в фоновой вкладке — страховка,
    // чтобы после возврата на страницу данные не остались «вчерашними».
    roundRenderTimer = setTimeout(run, 300);
}

function renderRoundViewParts() {
    if (!curRoundData) return;
    renderStartGate();
    if (canEditGroup) {
        renderPlayHole();
        buildPlayHolesNav();
        renderPlaySummary();
        renderInviteQRs();
        startGroupPaceTicker();
    } else {
        renderGVPlayers(curRoundData);
    }
    renderFinishBlockNotice();
}

function initRoundView() {
    // Защита от дублей подписки (например, при смене языка страница перерисовывается)
    if (roundViewHandler) {
        try { db.ref('rounds/' + curRid).off('value', roundViewHandler); } catch (e) { console.warn("[silent]", e); }
    }
    roundViewHandler = function(sn) { applyRoundState(sn.val()); };
    db.ref('rounds/' + curRid).on('value', roundViewHandler);
}

// Применение снимка раунда: только состояние и видимость блоков. Тяжёлый
// рендер уходит в scheduleRoundRender() (не чаще одного раза за кадр).
// Эту же функцию вызывает таймер старта — когда отсчёт дошёл до нуля.
function applyRoundState(data) {
    curRoundData = data;
    if (!curRoundData || typeof curRoundData !== 'object') {
        toast(currentLang === 'en' ? 'Round not found' : 'Раунд не найден', 'error');
        return;
    }

    // Раунд с mode='solo' обслуживает solo.js — делегируем ему
    if (curRoundData.mode === 'solo') {
        try { db.ref('rounds/' + curRid).off('value', roundViewHandler); } catch (e) { console.warn("[silent]", e); }
        roundViewHandler = null;
        roundViewListening = false;
        if (typeof bootSoloRoundView === 'function') bootSoloRoundView(curRid);
        return;
    }

    var setupEl = document.getElementById('setup');
    if (setupEl) setupEl.classList.add('hidden');
    var modeView = document.getElementById('mode-view');
    if (modeView) modeView.classList.add('hidden');

    // Раунд уже начат — шапка остаётся видимой, но компактной (требование: всегда видна, меньше во время ввода)
    var pageHeadEl = lGet('page-head');
    if (pageHeadEl) {
        pageHeadEl.classList.remove('hidden');
        pageHeadEl.classList.add('scoring-compact');
    }
    if (typeof updateRoundEventBanner === 'function') updateRoundEventBanner(curRoundData);
    try { document.body.classList.add('round-active'); } catch (e) { console.warn("[silent]", e); }
    if (typeof applyNavHeight === 'function') applyNavHeight();
    applyScoreKiosk();
    // Обновляем компактную шапку прогрессом раунда
    if (typeof updateScoringHeader === 'function') updateScoringHeader();

    myUid = getActingUid();
    // Раунд открывается для ввода счёта ровно в момент старта турнира:
    // созданные протоколом заранее раунды имеют status='scheduled' и ждут
    // времени старта (или кнопки «Старт» в админ-меню).
    canEditGroup = (myUid !== null) && isRoundOpenForScoring(curRoundData, Date.now(), myUid);

    // Если текущий игрок подключился/вошёл в раунд — отмечаем его в базе.
    // До старта турнира не отмечаем: игрок ещё не в игре.
    if (canEditGroup && myUid && curRoundData.players && curRoundData.players[myUid]) {
        if (!curRoundData.players[myUid].joined) {
            try {
                db.ref('rounds/' + curRid + '/players/' + myUid + '/joined').set(true);
                db.ref('rounds/' + curRid + '/players/' + myUid + '/joinedAt').set(Date.now());
            } catch (e) { console.warn("[silent]", e); }
        }
    }

    var activeView = lGet('active-scoring-view');
    var groupView = lGet('group-view');

    if (canEditGroup) {
        if (activeView) activeView.classList.remove('hidden');
        if (groupView) groupView.classList.add('hidden');

        var myPlayer = curRoundData.players && curRoundData.players[myUid];
        var myTitle = lGet('my-player-name-title');
        if (myTitle) myTitle.textContent = myPlayer ? myPlayer.name : (typeof t === 'function' ? t('my_score') : 'My score');
        updateGroupStablefordToggle();

        var markContainer = lGet('marker-input-container');
        var dualPanel = lGet('dual-score-panel');
        if (curRoundData.markerAssignments && curRoundData.markerAssignments[myUid]) {
            myTargetUid = curRoundData.markerAssignments[myUid].targetId;
            var targetPlayer = curRoundData.players && curRoundData.players[myTargetUid];
            var markTitle = lGet('mark-player-name');
            if (markTitle) markTitle.textContent = targetPlayer ? targetPlayer.name : (currentLang === 'en' ? 'Partner' : 'Партнёр');
            if (markContainer) markContainer.classList.remove('hidden');
            if (dualPanel) dualPanel.classList.remove('single');
        } else {
            if (markContainer) markContainer.classList.add('hidden');
            if (dualPanel) dualPanel.classList.add('single');
            myTargetUid = null;
        }

        if (!isChanging) {
            findCurrentHole();
        }

        listenForCallResponses();
        listenForOfficialCallState({
            roundId: curRid,
            playerId: myUid,
            prefix: 'group',
            canEdit: function() { return canEditGroup; },
            hole: function() { return playHole; },
            playerName: function() {
                return curRoundData.players && curRoundData.players[myUid]
                    ? curRoundData.players[myUid].name : 'Player';
            },
            flightMembers: function() {
                return typeof getFlightPlayerNames === 'function'
                    ? getFlightPlayerNames(curRoundData, myUid) : [];
            }
        });

    } else {
        if (activeView) activeView.classList.add('hidden');
        if (groupView) groupView.classList.remove('hidden');
        setGroupForceFinishBtnVisible(false);
        renderGroupViewHeaderNotice();
    }

    updateGroupPauseUI();

    // Тяжёлые блоки (карточка группы, QR, темп игры, баннеры) рисуем через
    // планировщик: максимум один раз за кадр, даже если снимков пришло много.
    scheduleRoundRender();

    // Ссылка «Завершить раунд» из поиска по ФИО (?finish=1): открываем диалог
    // завершения один раз на сессию вкладки, после того как данные прогрузились.
    if (canEditGroup && typeof pestovoUrlWantsFinish === 'function' && pestovoUrlWantsFinish()
        && typeof pestovoConsumeFinishOnce === 'function' && pestovoConsumeFinishOnce(curRid)) {
        setTimeout(function() { try { finishGroupRound(); } catch (e) { console.warn("[silent]", e); } }, 1200);
    }
}

function handleGroupPauseToggle() {
    if (!curRid || !curRoundData) return;
    if (curRoundData.paused) {
        var myName = (myUid && curRoundData.players && curRoundData.players[myUid])
            ? (curRoundData.players[myUid].name || '') : '';
        roundResume(curRid, curRoundData, myName, myUid).then(function() {
            toast(currentLang === 'en' ? '✅ Round resumed. Timings unpaused.' : '✅ Раунд возобновлён. Тайминги запущены.', 'success');
        }).catch(function(err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    } else {
        openRoundPauseModal(curRid, curRoundData, function() {
            updateGroupPauseUI();
        });
    }
}

function updateGroupPauseUI() {
    var banner = lGet('group-pause-banner');
    var btnText = lGet('group-pause-btn-text');
    var btnIcon = lGet('group-pause-btn-icon');
    var isPaused = !!(curRoundData && curRoundData.paused);

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
    var totalMs = typeof getRoundTotalPauseMs === 'function' ? getRoundTotalPauseMs(curRoundData) : 0;
    var durStr = typeof formatPaceMinutes === 'function' ? formatPaceMinutes(totalMs / 60000) : '';
    var reasonStr = curRoundData.pauseReason ? (' · ' + escapeHtml(curRoundData.pauseReason)) : '';
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
        '<button type="button" class="btn btn-g btn-sm" onclick="handleGroupPauseToggle()" style="font-weight:700;">' +
        '<i class="fas fa-play"></i> ' + (isEn ? 'Resume Play' : 'Возобновить игру') + '</button>' +
        '</div>';
}

function renderGroupViewHeaderNotice() {
    var gv = lGet('group-view');
    if (!gv) return;
    var noticeBox = lGet('gv-finished-notice');
    if (!noticeBox) {
        noticeBox = document.createElement('div');
        noticeBox.id = 'gv-finished-notice';
        gv.insertBefore(noticeBox, gv.firstChild);
    }
    var isFin = myUid && typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(curRoundData, myUid);
    if (isFin) {
        var myP = (curRoundData && curRoundData.players && curRoundData.players[myUid]) || {};
        var myScores = myP.scores || {};
        var played = Object.values(myScores).filter(function(v){ return parseInt(v) >= 1; }).length;
        var isEn = currentLang === 'en';
        noticeBox.innerHTML =
            '<div class="card" style="background:rgba(46,204,113,0.12);border-color:#2ecc71;padding:14px;margin-bottom:12px;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
            '<div><strong style="color:var(--white);font-size:14px;"><i class="fas fa-flag-checkered" style="color:#2ecc71;"></i> ' +
            (isEn ? 'You finished this round (' + played + ' holes).' : 'Вы завершили этот раунд (' + played + ' лунок).') + '</strong>' +
            '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' +
            (isEn ? 'Your partners are still playing. Scores update in real time.' : 'Ваши партнёры ещё продолжают игру. Результаты обновляются в реальном времени.') + '</div></div>' +
            '<a href="leaderboard.html" class="btn btn-g btn-sm" style="font-weight:700;"><i class="fas fa-trophy"></i> ' +
            (isEn ? 'Leaderboard' : 'Табло раундов') + '</a>' +
            '</div></div>';
    } else {
        noticeBox.innerHTML = '';
    }
}

function pestovoUrlWantsFinish() {
    try { return new URLSearchParams(window.location.search).get('finish') === '1'; } catch (e) { return false; }
}
function pestovoConsumeFinishOnce(rid) {
    var k = 'pestovo_finish_req_' + rid;
    try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage) {
            if (sessionStorage.getItem(k) === '1') return false;
            sessionStorage.setItem(k, '1');
        }
    } catch (e) { console.warn("[silent]", e); }
    return true;
}

// Текущая лунка игрока. Пересчитывается только при смене раунда: пока игрок
// стоит на своей лунке, обновления базы НЕ перебрасывают его на первую
// неподтверждённую (раньше при каждом снимке его кидало на лунку 1).
var playHoleRoundId = null;

function findCurrentHole(force) {
    var order = getRoundOrder(curRoundData);
    if (!force && playHoleRoundId === curRid && order.indexOf(playHole) !== -1) return;
    playHoleRoundId = curRid;
    var myPlayer = (curRoundData.players && curRoundData.players[myUid]) || {};
    var savedResumeHole = getSavedResumeHole(curRid, myUid, order, myPlayer);
    if (savedResumeHole) {
        playHole = savedResumeHole;
        return;
    }
    playHole = order[0];
    for (var i = 0; i < order.length; i++) {
        // Данные важнее флага: лунка с фактическим несовпадением снова становится текущей
        if (getHoleVerifyState(myPlayer, order[i]) !== 'confirmed') {
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
    var el = lGet('play-holes-nav');
    if (!el) return;
    var order = getRoundOrder(curRoundData);
    var myPlayer = curRoundData.players && curRoundData.players[myUid];
    var myScores = (myPlayer && myPlayer.scores) || {};
    var mySubmitted = (myPlayer && myPlayer.submitted) || {};
    var myFieldHcp = (myPlayer && (myPlayer.fieldHcp !== undefined ? myPlayer.fieldHcp : curRoundData.fieldHcp)) || 0;

    var html = '';
    order.forEach(function(h) {
        var s = parseInt(myScores[h]) || 0;
        var sub = mySubmitted[h] === true;
        var cls = h === playHole ? 'active' : '';

        // Состояние лунки: confirmed — зелёная, mismatch — мигает красным,
        // счёт введён, но маркер не подтвердил — мигает серым (pending), а не зелёная.
        var vState = getHoleVerifyState(myPlayer, h);
        if (vState === 'confirmed') {
            cls += ' verified';
        } else if (vState === 'mismatch') {
            cls += ' mismatch';
        } else if (sub || s > 0) {
            cls += ' pending';
        }
        // Текущая лунка, где свой счёт ещё не подтверждён, мигает серым:
        // видно, на какой лунке игрок находится прямо сейчас.
        if (h === playHole && vState !== 'confirmed' && !(sub && s > 0)) cls += ' cur-blink';

        var mkForHole = (typeof getPlayerMarkerScoreForHole === 'function') ? getPlayerMarkerScoreForHole(myPlayer, h).score : 0;
        html += '<button type="button" class="hole-btn ' + cls + '" onclick="goPlayHole(' + h + ')" aria-label="' + (currentLang === 'en' ? 'Hole ' : 'Лунка ') + h + '" aria-pressed="' + (h === playHole ? 'true' : 'false') + '">' +
            entryHoleContentHTML(s, mkForHole, h, myFieldHcp) + '</button>';
    });
    el.innerHTML = html;
    applyPlayHolesCollapsed();
    // В свёрнутой полосе текущая лунка всегда в видимой области.
    try {
        if (el.classList.contains('holes-collapsed')) {
            var activeBtn = el.querySelector('.hole-btn.active');
            if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
    } catch (e) { console.warn("[silent]", e); }
}

function doPlayHole(h) {
    isChanging = true;
    playHole = h;
    myScore = 0;
    targetScore = 0;
    rememberResumeHole(curRid, myUid, h);
    renderPlayHole();
    buildPlayHolesNav();
    setTimeout(function() { isChanging = false; }, 100);
}

function goPlayHole(h) {
    if (!canEditGroup) return;
    var myPlayer = curRoundData && curRoundData.players && curRoundData.players[myUid];
    var scores = (myPlayer && myPlayer.scores) || {};
    var order = getRoundOrder(curRoundData);
    // Компактный выбор при перепрыгивании через лунки без счёта.
    // Учитывается порядок игры со стартовой лунки группы (шотган).
    pestovoGuardHoleJump({
        rid: curRid, pid: myUid, order: order, from: playHole, to: h,
        isMissing: function(x) { return !(parseInt(scores[x]) > 0); },
        performJump: function(target) { doPlayHole(target); },
        enterHole: function(missed) { doPlayHole(missed); }
    });
}

function renderPlayHole() {
    if (!canEditGroup) return;
    var par = holePar(playHole);
    var myPlayer = (curRoundData && curRoundData.players && curRoundData.players[myUid]) || {};
    var myTee = myPlayer.tee || curRoundData.tee || 'wh';
    var dist = holeDist(playHole, myTee);

    var playHoleEl = lGet('play-hole');
    var playParEl = lGet('play-par');
    var playDistEl = lGet('play-dist');
    if (playHoleEl) playHoleEl.textContent = playHole;
    if (playParEl) playParEl.textContent = par;
    if (playDistEl) playDistEl.textContent = dist > 0 ? dist : '—';

    var order = getRoundOrder(curRoundData);
    var isLastHole = (playHole === order[order.length - 1]);

    var mySubmittedLast = !!(myPlayer.submitted && myPlayer.submitted[playHole] === true);

    var btnIcon = lGet('save-hole-btn-icon');
    var btnText = lGet('save-hole-btn-text');
    var btn = lGet('save-hole-btn');

    if (btnIcon && btnText && btn) {
        if (isLastHole && mySubmittedLast) {
            // Результат последней лунки введён — кнопка становится «Завершить раунд»
            btnIcon.className = 'fas fa-flag-checkered';
            btnText.textContent = t('finish_round');
            btn.onclick = function() { finishGroupRound(); };
        } else {
            // Кнопка ПОДТВЕРЖДАЕТ результат лунки (переход дальше — автоматически).
            btnIcon.className = 'fas fa-check';
            btnText.textContent = t('next_hole_btn');
            btn.onclick = function() { saveHoleScores(); };
        }
    }

    var mySaved = parseInt(curRoundData.players[myUid] && curRoundData.players[myUid].scores && curRoundData.players[myUid].scores[playHole]) || 0;
    if (mySaved > 0) {
        myScore = mySaved;
    } else if (!(myScore >= 1)) {
        myScore = par;
    }

    var targetFinished = myTargetUid && typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(curRoundData, myTargetUid);
    if (myTargetUid) {
        var targetSaved = parseInt(curRoundData.players[myTargetUid] && curRoundData.players[myTargetUid].markerScores && curRoundData.players[myTargetUid].markerScores[myUid] && curRoundData.players[myTargetUid].markerScores[myUid][playHole]) || 0;
        if (targetSaved > 0) {
            targetScore = targetSaved;
        } else if (!(targetScore >= 1)) {
            targetScore = par;
        }
    }

    updScoreDisplay('my', myScore);
    updScoreDisplay('mark', targetScore);

    var markContainer = lGet('marker-input-container');
    if (markContainer) {
        var markBtns = markContainer.querySelector('.score-btns') || markContainer.querySelector('.dual-half__controls');
        var markDisp = lGet('mark-disp');
        var markRes = lGet('mark-result');
        if (targetFinished && !dualEditing.mark) {
            var tp = (curRoundData && curRoundData.players && curRoundData.players[myTargetUid]) || {};
            var tpScores = tp.scores || {};
            var tpHoles = Object.values(tpScores).filter(function(v){ return parseInt(v) >= 1; }).length;
            if (markBtns) markBtns.style.display = 'none';
            if (markDisp) markDisp.innerHTML = '<span style="font-size:22px;color:var(--gold);"><i class="fas fa-flag-checkered"></i> ✓</span>';
            if (markRes) markRes.textContent = (currentLang === 'en' ? 'Finished (' + tpHoles + 'h)' : 'Завершил(а) (' + tpHoles + ' л.)');
        } else {
            if (markBtns) markBtns.style.display = '';
        }
    }

    var trackerEl = lGet('match-play-tracker-container');
    if (trackerEl) {
        var mStatus = null;
        var playersM = (curRoundData && curRoundData.players) || {};
        var isMatchFmt = (typeof pestovoIsMatchFormat === 'function')
            ? pestovoIsMatchFormat(curRoundData && curRoundData.format)
            : (curRoundData && (curRoundData.format === 'Match Play 1v1' || curRoundData.format === 'Match Play 2v2'));
        if (curRoundData && isMatchFmt && myTargetUid) {
            var myScoresObj = (playersM[myUid] && playersM[myUid].scores) || {};
            var targetScoresObj = (playersM[myTargetUid] && playersM[myTargetUid].scores) || {};
            var myName = (playersM[myUid] && playersM[myUid].name) || (currentUserData && currentUserData.name) || 'Player 1';
            var targetName = (playersM[myTargetUid] && playersM[myTargetUid].name) || 'Opponent';
            var is2v2 = curRoundData.format === 'Match Play 2v2';
            if (is2v2 && Object.keys(playersM).length >= 4 && typeof calcMatchPlayStatusSides === 'function') {
                var oppPids = Object.keys(playersM).filter(function(pid) {
                    return pid !== myUid && pid !== myTargetUid;
                }).slice(0, 2);
                if (oppPids.length) {
                    var sideB = oppPids.map(function(pid) { return (playersM[pid] || {}).scores || {}; });
                    var aName2 = myName + ' + ' + targetName;
                    var bName2 = oppPids.map(function(pid) { return (playersM[pid] || {}).name || '—'; }).join(' + ');
                    mStatus = calcMatchPlayStatusSides([myScoresObj, targetScoresObj], sideB, aName2, bName2);
                }
            }
            if (!mStatus && typeof calcMatchPlayStatus === 'function') {
                mStatus = calcMatchPlayStatus(myScoresObj, targetScoresObj, myName, targetName);
            }
        }
        trackerEl.innerHTML = mStatus ? renderMatchPlayTrackerHTML(mStatus) : '';
    }

    checkPlayVerification();
    updateGroupPaceAssistant();
    updateGroupPauseUI();
    updateScoringHeader();
    updateDualCompare();
    // Авто-скролл активной лунки в видимую область (удобно на телефоне)
    try {
        var activeBtn = document.querySelector('#play-holes-nav .hole-btn.active');
        if (activeBtn) activeBtn.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'});
    } catch (e) { console.warn("[silent]", e); }
}

function adjScore(who, delta) {
    if (!canEditGroup) return;
    if (who === 'mark' && myTargetUid && typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(curRoundData, myTargetUid)) return;
    if (who === 'my') {
        myScore = Math.max(1, Math.min(15, myScore + delta));
        updScoreDisplay('my', myScore);
        animateScoreElement('my-disp');
    } else {
        targetScore = Math.max(1, Math.min(15, targetScore + delta));
        updScoreDisplay('mark', targetScore);
        animateScoreElement('mark-disp');
    }
    if (typeof updateDualCompare === 'function') updateDualCompare();
    vib();
}

function updScoreDisplay(who, score) {
    if (typeof holePar !== 'function') return;
    // Пока открыто прямое редактирование — не затирать ввод живым обновлением.
    if (typeof dualEditing !== 'undefined' && dualEditing[who]) return;
    var par = holePar(playHole);
    var dispEl = lGet(who + '-disp');
    var resEl = lGet(who + '-result');
    var scoredPlayerId = who === 'my' ? myUid : myTargetUid;
    var scoredPlayer = curRoundData && curRoundData.players && scoredPlayerId
        ? curRoundData.players[scoredPlayerId] : null;
    var fieldHcp = scoredPlayer && scoredPlayer.fieldHcp !== undefined
        ? scoredPlayer.fieldHcp : ((curRoundData && curRoundData.fieldHcp) || 0);
    var showStableford = isPlayerStablefordDisplayEnabled(scoredPlayer);

    if (dispEl) dispEl.innerHTML = scoreWithStablefordHTML(score, playHole, fieldHcp, showStableford);
    if (resEl) {
        // Относительный счёт вместо слова: «E · Пар», «-1 · Бёрди», «+1 · Боги».
        var sd = score - par;
        var rel = (typeof fmtScore === 'function') ? fmtScore(sd) : (sd === 0 ? 'E' : (sd > 0 ? '+' + sd : '' + sd));
        var nm = holeResName(score, par);
        resEl.textContent = (score >= 1 && par > 0) ? (rel + (nm ? ' · ' + nm : '')) : '—';
        resEl.className = 'score-result ' + holeResClass(score, par);
    }
}

// Прямое редактирование счёта: тап по крупной цифре открывает цифровую клавиатуру.
var dualEditing = { my: false, mark: false };

function editDualScore(who) {
    if (!canEditGroup || dualEditing[who]) return;
    if (who !== 'my' && who !== 'mark') return;
    if (who === 'mark' && myTargetUid && typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(curRoundData, myTargetUid)) return;
    var dispEl = lGet(who + '-disp');
    if (!dispEl) return;
    var cur = who === 'my' ? myScore : targetScore;
    if (!(cur >= 1)) cur = (typeof holePar === 'function' ? holePar(playHole) : 4);
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    dualEditing[who] = true;
    dispEl.innerHTML = '<input id="dual-edit-' + who + '" class="dual-score-input" type="number" inputmode="numeric" pattern="[0-9]*" min="1" max="15" value="' + cur + '" aria-label="' + (isEn ? 'Score, 1 to 15' : 'Счёт, от 1 до 15') + '">';
    var inp = lGet('dual-edit-' + who);
    if (inp) {
        inp.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter') { ev.preventDefault(); commitDualEdit(who); }
            else if (ev.key === 'Escape') { ev.preventDefault(); cancelDualEdit(who); }
        });
        inp.addEventListener('blur', function() { commitDualEdit(who); });
        inp.addEventListener('click', function(ev) { ev.stopPropagation(); });
        try { inp.focus(); inp.select(); } catch (e) { console.warn("[silent]", e); }
    }
    if (typeof vib === 'function') vib(10);
}

function commitDualEdit(who) {
    if (!dualEditing[who]) return;
    var inp = lGet('dual-edit-' + who);
    var v = inp ? parseInt(inp.value, 10) : NaN;
    dualEditing[who] = false;
    // Вне диапазона 1–15 или пусто — молча возвращаем прежнее значение.
    if (v >= 1 && v <= 15) {
        if (who === 'my') myScore = v; else targetScore = v;
    }
    updScoreDisplay(who, who === 'my' ? myScore : targetScore);
    if (typeof updateDualCompare === 'function') updateDualCompare();
    if (typeof animateScoreElement === 'function') animateScoreElement(who + '-disp');
    if (typeof vib === 'function') vib();
}

function cancelDualEdit(who) {
    if (!dualEditing[who]) return;
    dualEditing[who] = false;
    updScoreDisplay(who, who === 'my' ? myScore : targetScore);
    if (typeof updateDualCompare === 'function') updateDualCompare();
}

// Сворачивание сетки лунок в горизонтальную полосу (состояние — в localStorage).
function getPlayHolesCollapsed() {
    var v = null;
    try { v = localStorage.getItem('pestovo_play_holes_collapsed'); } catch (e) { console.warn("[silent]", e); }
    // По умолчанию свёрнуто: карточки ввода сразу у большого пальца.
    return v === null ? true : v === '1';
}

function applyPlayHolesCollapsed() {
    var nav = lGet('play-holes-nav');
    var btn = lGet('play-holes-toggle');
    var c = getPlayHolesCollapsed();
    if (nav) nav.classList.toggle('holes-collapsed', c);
    if (btn) {
        var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        btn.setAttribute('aria-expanded', c ? 'false' : 'true');
        var lbl = btn.querySelector('[data-holes-toggle-label]');
        if (lbl) lbl.textContent = isEn ? 'Holes' : 'Лунки';
        var chev = lGet('play-holes-toggle-chev');
        if (chev) chev.className = 'fas ' + (c ? 'fa-chevron-down' : 'fa-chevron-up');
    }
}

function togglePlayHolesNav() {
    var next = !getPlayHolesCollapsed();
    try { localStorage.setItem('pestovo_play_holes_collapsed', next ? '1' : '0'); } catch (e) { console.warn("[silent]", e); }
    applyPlayHolesCollapsed();
    // В полосе сразу показываем текущую лунку.
    try {
        var nav = lGet('play-holes-nav');
        var activeBtn = nav && nav.querySelector('.hole-btn.active');
        if (nav && nav.classList.contains('holes-collapsed') && activeBtn) {
            activeBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
    } catch (e) { console.warn("[silent]", e); }
    if (typeof vib === 'function') vib(10);
}

function checkPlayVerification() {
    var box = lGet('play-verify-status');
    if (!box || !curRoundData || !curRoundData.players) return;

    var myPlayer = curRoundData.players[myUid];
    if (!myPlayer) return;

    var myS = parseInt(myPlayer.scores && myPlayer.scores[playHole]) || 0;
    var mySub = myPlayer.submitted && myPlayer.submitted[playHole] === true;
    var myMarkerId = myPlayer.markedBy;
    var markerS = 0;
    var markerSub = false;

    // Читаем счёт маркера из ТЕКУЩЕГО игрока (myPlayer.markerScores[myMarkerId]),
    // а НЕ из данных маркера (mp.markerScores[myUid]) — иначе читается собственный
    // ввод маркера для другого игрока, а не то, что маркер ввёл для нас.
    if (myMarkerId) {
        markerS = parseInt(myPlayer.markerScores && myPlayer.markerScores[myMarkerId] && myPlayer.markerScores[myMarkerId][playHole]) || 0;
        if (myPlayer.markerSubmitted && myPlayer.markerSubmitted[myMarkerId] && myPlayer.markerSubmitted[myMarkerId][playHole] === true) {
            markerSub = true;
        } else if (markerS > 0) {
            markerSub = true;
        }
    }

    if (myS > 0 && markerS > 0 && myS === markerS && (mySub || markerSub)) {
        box.innerHTML = '<div class="verify-ok">✅ ' + (currentLang === 'en' ? 'Hole ' + playHole + ' score confirmed & finalized by both sides (' + myS + ')' : 'Счёт на лунке ' + playHole + ' подтверждён и зафиксирован обеими сторонами (' + myS + ' уд.)') + '</div>';
    } else if (myS > 0 && markerS > 0 && myS !== markerS) {
        box.innerHTML = '<div class="verify-fail">⚠️ ' + t('mismatch_error') + ' (' + (currentLang === 'en' ? 'You: ' : 'Вы: ') + myS + ' | ' + (currentLang === 'en' ? 'Marker: ' : 'Маркер: ') + markerS + ')</div>';
    } else {
        // Ожидание маркера отдельным блоком НЕ показываем — только уведомление 3 сек при сохранении.
        box.innerHTML = '';
    }

    if (typeof updateDualCompare === 'function') updateDualCompare();

    // ОБРАТНАЯ СВЕРКА: игрок вводит счёт того, кого маркирует. Если тот уже
    // подтвердил СВОЙ счёт и он отличается — несовпадение видно обоим:
    // и маркируемому (блок выше), и тому, кто вводит счёт маркером.
    var boxMark = lGet('play-verify-status-mark');
    if (boxMark) {
        if (myTargetUid) {
            var tp = curRoundData.players[myTargetUid] || {};
            var tOwn = parseInt(tp.scores && tp.scores[playHole]) || 0;
            var tOwnSub = !!(tp.submitted && tp.submitted[playHole] === true);
            var tMine = parseInt(curRoundData.players[myTargetUid] && curRoundData.players[myTargetUid].markerScores && curRoundData.players[myTargetUid].markerScores[myUid] && curRoundData.players[myTargetUid].markerScores[myUid][playHole]) || 0;
            var tName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(tp, myTargetUid) : (tp.name || '');
            if (tOwn > 0 && tMine > 0 && tOwn !== tMine) {
                boxMark.innerHTML = '<div class="verify-fail">⚠️ ' +
                    (currentLang === 'en'
                        ? 'Mismatch for ' + escapeHtml(tName) + ': entered ' + tMine + ', player confirmed ' + tOwn
                        : 'Несовпадение у ' + escapeHtml(tName) + ': вы ввели ' + tMine + ', игрок подтвердил ' + tOwn) +
                    '</div>';
            } else {
                boxMark.innerHTML = '';
            }
        } else {
            boxMark.innerHTML = '';
        }
    }
}

// ==========================================
// ЗАЩИТА ОТ «ПУЛЕМЁТНОГО» НАЖАТИЯ КНОПКИ
// ==========================================
// Пока запись лунки не завершилась, повторные нажатия игнорируются, а сама
// кнопка блокируется. Без этого серия быстрых taps ставила в очередь десятки
// записей и перерисовок — на телефоне интерфейс вставал намертво.
var saveHoleInFlight = false;
var saveHoleWatchdog = null;

function setSaveBtnBusy(busy) {
    var btn = lGet('save-hole-btn');
    if (!btn) return;
    btn.disabled = !!busy;
    if (btn.classList) btn.classList.toggle('btn-busy', !!busy);
    var icon = lGet('save-hole-btn-icon');
    if (icon && busy) icon.className = 'fas fa-circle-notch fa-spin';
}

function releaseSaveLock() {
    saveHoleInFlight = false;
    if (saveHoleWatchdog) { clearTimeout(saveHoleWatchdog); saveHoleWatchdog = null; }
    setSaveBtnBusy(false);
    try { renderPlayHole(); } catch (e) { console.warn("[silent]", e); }
    setTimeout(function() { isChanging = false; }, 200);
}

function saveHoleScores() {
    if (!canEditGroup) { toast(t('msg_edit_disabled'), 'error'); return; }
    if (saveHoleInFlight) return;
    var targetIsFinished = myTargetUid && typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(curRoundData, myTargetUid);
    if (myScore < 1 || (myTargetUid && !targetIsFinished && targetScore < 1)) { toast(t('msg_score_min'), 'error'); return; }

    saveHoleInFlight = true;
    setSaveBtnBusy(true);
    // Страховка: если сеть «зависла» и обещание не разрешится, кнопка
    // разблокируется сама — иначе игрок не сможет продолжить раунд.
    saveHoleWatchdog = setTimeout(function() {
        if (saveHoleInFlight) releaseSaveLock();
    }, 8000);

    isChanging = true;
    var h = playHole;
    var updates = {};

    // Ввод/исправление счёта снимает «Пропустить и не напоминать».
    try { if (typeof pestovoSkipDropAckHoles === 'function') pestovoSkipDropAckHoles(curRid, myUid, [h]); } catch (e) { console.warn("[silent]", e); }

    var savedAt = Date.now();
    updates['rounds/' + curRid + '/players/' + myUid + '/scores/' + h] = myScore;
    updates['rounds/' + curRid + '/players/' + myUid + '/submitted/' + h] = true;
    // holeTimes — только если ещё не было (как в solo.js через transaction), чтобы не переписывать время первой сдачи
    var myPlForTime = curRoundData.players && curRoundData.players[myUid];
    var myExistingHT = parseInt(myPlForTime && myPlForTime.holeTimes && myPlForTime.holeTimes[h]) || 0;
    if (!(myExistingHT > 0)) {
        updates['rounds/' + curRid + '/players/' + myUid + '/holeTimes/' + h] = savedAt;
    }

    if (myTargetUid && !targetIsFinished) {
        updates['rounds/' + curRid + '/players/' + myTargetUid + '/markerScores/' + myUid + '/' + h] = targetScore;
        updates['rounds/' + curRid + '/players/' + myTargetUid + '/markerSubmitted/' + myUid + '/' + h] = true;
        // Время завершения лунки для игрока, за которого маркер ввёл счёт.
        var tgtPlForTime = curRoundData.players && curRoundData.players[myTargetUid];
        var tgtExistingHT = parseInt(tgtPlForTime && tgtPlForTime.holeTimes && tgtPlForTime.holeTimes[h]) || 0;
        if (!(tgtExistingHT > 0)) {
            updates['rounds/' + curRid + '/players/' + myTargetUid + '/holeTimes/' + h] = savedAt;
        }
        updates['markers/' + curRid + '/' + myTargetUid + '/' + h] = targetScore;

        // Синхронизируем verified игрока, за которого вводим счёт: сравниваем с его собственным счётом.
        // Раньше флаг не обновлялся, если игрок сохранил свой счёт раньше маркера — из-за этого
        // раунд нельзя было завершить: висело «не подтверждено», хотя в данных уже было видно несовпадение.
        var targetPlayer = curRoundData.players ? curRoundData.players[myTargetUid] : null;
        var targetPs = parseInt(targetPlayer && targetPlayer.scores && targetPlayer.scores[h]) || 0;
        if (targetPs >= 1) {
            updates['rounds/' + curRid + '/players/' + myTargetUid + '/verified/' + h] = (targetPs === targetScore);
        } else {
            updates['rounds/' + curRid + '/players/' + myTargetUid + '/verified/' + h] = 'pending';
        }
    }

    var myPlayer = curRoundData.players[myUid];
    var myMarkerId = myPlayer && myPlayer.markedBy;

    var markerS = 0;
    var markerSub = false;

    // Читаем счёт маркера из ТЕКУЩЕГО игрока (myPlayer.markerScores[myMarkerId]),
    // а НЕ из данных маркера — это то, что маркер ввёл для нас.
    if (myMarkerId) {
        markerS = parseInt(myPlayer.markerScores && myPlayer.markerScores[myMarkerId] && myPlayer.markerScores[myMarkerId][h]) || 0;
        if (myPlayer.markerSubmitted && myPlayer.markerSubmitted[myMarkerId] && myPlayer.markerSubmitted[myMarkerId][h] === true) {
            markerSub = true;
        } else if (markerS > 0) {
            markerSub = true;
        }
    }

    var markerIsFinished = myMarkerId && typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(curRoundData, myMarkerId);
    var bothSubmittedAndMatch = (markerSub && markerS > 0 && markerS === myScore);
    var bothSubmittedAndMismatch = (markerSub && markerS > 0 && markerS !== myScore);

    // verified вычисляется ТОЧНО как на сервере (functions/score-audit.js):
    // есть отметка маркера → сверка с его счётом, нет отметки → 'pending'.
    // Завершённость маркера тут ни при чём: раньше клиент ставил true только
    // потому, что маркер дошёл до конца раунда, — сервер тут же перезаписывал
    // флаг на false/'pending', и табло мигало противоречием.
    if (markerS > 0) {
        updates['rounds/' + curRid + '/players/' + myUid + '/verified/' + h] = (markerS === myScore);
    } else {
        updates['rounds/' + curRid + '/players/' + myUid + '/verified/' + h] = 'pending';
    }

    // Все изменения счёта и подтверждения выполняются атомарно на сервере.
    // Локальные updates выше оставлены только для расчёта отображения; они
    // никогда не отправляются напрямую в RTDB.
    var scoreOps = [{kind:'score',playerId:myUid,hole:h,score:myScore}];
    if (myTargetUid && !targetIsFinished) scoreOps.push({kind:'marker',playerId:myTargetUid,hole:h,score:targetScore});
    pestovoScoreWrite(curRid, scoreOps, myUid).then(function(res) {
        if (res && res.offline) {
            var pendingOrder = getRoundOrder(curRoundData);
            var pendingIdx = pendingOrder.indexOf(h);
            var prevHole = playHole;
            if (pendingIdx >= 0 && pendingIdx < pendingOrder.length - 1) {
                playHole = pendingOrder[pendingIdx + 1]; myScore = 0; targetScore = 0;
            }
            rememberResumeHole(curRid, myUid, playHole);
            renderPlayHole(); buildPlayHolesNav();
            if (prevHole !== playHole && typeof animateHoleTransition === 'function') animateHoleTransition(playHole);
            return;
        }
        var order = getRoundOrder(curRoundData);
        var idx = order.indexOf(h);

        // Оптимистично отражаем сохранённые счёта/время лунки в ЛОКАЛЬНОЙ
        // копии раунда ДО перерисовки. На мобильных (медленный/отложенный echo
        // Firebase) без этого темп игры и «Пройдено» не обновлялись до прихода
        // снапшота. Фактические данные из Firebase перезапишут локальную копию.
        if (curRoundData && curRoundData.players) {
            var myPlayerLocal = curRoundData.players[myUid];
            if (myPlayerLocal) {
                myPlayerLocal.scores = myPlayerLocal.scores || {};
                myPlayerLocal.scores[h] = myScore;
                myPlayerLocal.submitted = myPlayerLocal.submitted || {};
                myPlayerLocal.submitted[h] = true;
                myPlayerLocal.holeTimes = myPlayerLocal.holeTimes || {};
                if (!(parseInt(myPlayerLocal.holeTimes[h]) > 0)) myPlayerLocal.holeTimes[h] = savedAt;
                if (markerS > 0) myPlayerLocal.verified = Object.assign({}, myPlayerLocal.verified, (function(){ var o={}; o[h]=(markerS === myScore); return o; })());
                else myPlayerLocal.verified = Object.assign({}, myPlayerLocal.verified, (function(){ var o={}; o[h]='pending'; return o; })());
            }
            if (myTargetUid) {
                var tgtLocal = curRoundData.players[myTargetUid];
                if (tgtLocal) {
                    tgtLocal.markerScores = tgtLocal.markerScores || {};
                    tgtLocal.markerScores[myUid] = tgtLocal.markerScores[myUid] || {};
                    tgtLocal.markerScores[myUid][h] = targetScore;
                    tgtLocal.markerSubmitted = tgtLocal.markerSubmitted || {};
                    tgtLocal.markerSubmitted[myUid] = tgtLocal.markerSubmitted[myUid] || {};
                    tgtLocal.markerSubmitted[myUid][h] = true;
                    tgtLocal.holeTimes = tgtLocal.holeTimes || {};
                    if (!(parseInt(tgtLocal.holeTimes[h]) > 0)) tgtLocal.holeTimes[h] = savedAt;
                }
            }
        }

        var saveMarkerName = '';
        try { saveMarkerName = (myMarkerId && curRoundData.players[myMarkerId] && curRoundData.players[myMarkerId].name) || ''; } catch (_) { console.warn("[silent]", _); }
        if (bothSubmittedAndMismatch) {
            // Несовпадение — самый важный сигнал: показываем его раньше
            // остальных тостов, даже если маркер уже завершил раунд.
            toast(currentLang === 'en'
                ? ('⚠️ <b>Mismatch on hole ' + h + '!</b><br>You: <b>' + myScore + '</b>, marker' + (saveMarkerName ? ' (' + escapeHtml(saveMarkerName) + ')' : '') + ': <b>' + markerS + '</b>')
                : ('⚠️ <b>Несовпадение на лунке ' + h + '!</b><br>Вы: <b>' + myScore + '</b>, маркер' + (saveMarkerName ? ' (' + escapeHtml(saveMarkerName) + ')' : '') + ': <b>' + markerS + '</b>'), 'error');
            vib([200, 100, 200]);
        } else if (markerIsFinished) {
            toast(currentLang === 'en'
                ? ('✅ <b>Hole ' + h + ':</b> your score <b>' + myScore + '</b> saved.')
                : ('✅ <b>Лунка ' + h + ':</b> ваш счёт <b>' + myScore + '</b> зафиксирован.'), 'success');
            var parM = holePar(h);
            var dM = myScore - parM;
            if (myScore === 1 || dM <= -1) {
                triggerVictoryConfetti();
            }
            if (idx >= 0 && idx < order.length - 1) {
                playHole = order[idx + 1];
                myScore = 0;
                targetScore = 0;
            }
        } else if (bothSubmittedAndMatch) {
            toast(currentLang === 'en'
                ? ('✅ <b>Hole ' + h + ' confirmed:</b> ' + myScore + ' strokes')
                : ('✅ <b>Лунка ' + h + ' подтверждена:</b> ' + myScore + ' уд.'), 'success');
            var par = holePar(h);
            var d = myScore - par;
            if (myScore === 1 || d <= -1) {
                triggerVictoryConfetti();
            }
            if (idx >= 0 && idx < order.length - 1) {
                playHole = order[idx + 1];
                myScore = 0;
                targetScore = 0;
            }
        } else {
            toast(currentLang === 'en'
                ? ('⏳ <b>Hole ' + h + ':</b> your score <b>' + myScore + '</b> is saved. Waiting for marker' + (saveMarkerName ? ' (' + escapeHtml(saveMarkerName) + ')' : '') + '.')
                : ('⏳ <b>Лунка ' + h + ':</b> ваш счёт <b>' + myScore + '</b> сохранён. Ждём маркера' + (saveMarkerName ? ' (' + escapeHtml(saveMarkerName) + ')' : '') + '.'), 'info');
            vib();
            if (idx >= 0 && idx < order.length - 1) {
                playHole = order[idx + 1];
                myScore = 0;
                targetScore = 0;
            }
        }

        recordGroupHoleCompletion(curRid, h, savedAt);
        rememberResumeHole(curRid, myUid, playHole);
        renderPlayHole();
        buildPlayHolesNav();
        renderPlaySummary();
        // Авто-переход: подсветка следующей лунки + вибрация
        if (typeof animateHoleTransition === 'function' && playHole !== h) {
            animateHoleTransition(playHole);
        } else if (typeof vib === 'function') {
            try { vib([30, 40, 30]); } catch (e) { console.warn("[silent]", e); }
        }
        // Темп игры/тайминги — пересчёт по обновлённым локальным данным,
        // не дожидаясь echo Firebase (актуально на мобильных сетях).
        updateGroupPaceAssistant();
    }, function(err) {
        // Запись не прошла (нет сети / правила базы) — кнопку обязательно
        // разблокируем, иначе игрок не сможет продолжить раунд.
        try { console.warn('[live] save hole failed', err); } catch (e) { console.warn("[silent]", e); }
        toast(currentLang === 'en'
            ? '⚠️ Could not save the score — check the connection and try again'
            : '⚠️ Не удалось сохранить счёт — проверьте соединение и попробуйте ещё раз', 'error');
    }).then(releaseSaveLock, releaseSaveLock);
}

// Состояние панелей счётных карточек на странице раунда: по умолчанию
// карточка группы развёрнута (это рабочий документ игроков), а ручной выбор
// запоминается и переживает перерисовки в реальном времени.
function scorecardPrefKey(panelId) { return 'pestovo_sc_' + panelId + '_' + (curRid || ''); }

function ensureScorecardOpen(panelId) {
    var panel = lGet(panelId);
    if (!panel || !panel.classList.contains('hidden')) return;
    var pref = null;
    try { pref = localStorage.getItem(scorecardPrefKey(panelId)); } catch (e) { console.warn("[silent]", e); }
    if (pref === 'closed') return;
    if (typeof toggleActiveScorecard === 'function') toggleActiveScorecard(panelId);
}

function togglePersistedScorecard(panelId) {
    if (typeof toggleActiveScorecard === 'function') toggleActiveScorecard(panelId);
    try {
        var panel = lGet(panelId);
        localStorage.setItem(scorecardPrefKey(panelId),
            (panel && panel.classList.contains('hidden')) ? 'closed' : 'open');
    } catch (e) { console.warn("[silent]", e); }
    if (typeof vib === 'function') vib(15);
}

function renderPlaySummary() {
    var el = lGet('play-group-summary');
    if (!el || !curRoundData) return;
    // Перестраиваем карточку группы только когда её данные действительно
    // изменились: сборка таблицы на 18 лунок — самая дорогая операция страницы.
    var sig = groupSummarySignature();
    if (sig && sig === lastSummarySig) return;
    lastSummarySig = sig;
    // Единая карточка группы — в том же формате, что на главной странице
    // («Сейчас на поле», одна на всех), плюс слой маркера: рядом со счётом
    // игрока виден и счёт, который ввёл его маркер.
    curRoundData.roundId = curRid;
    el.innerHTML = '<div class="live-group-unified-card">' +
        generateGroupHoleTableHTML(curRoundData, { showMarker: true }) + '</div>';
    ensureScorecardOpen('group-sc-panel');
}

// ==========================================
// МЕМОИЗАЦИЯ ТЯЖЁЛЫХ БЛОКОВ
// ==========================================
// Подписи данных: если ничего не изменилось — блок не перерисовывается.
// Особенно важно для QR-кодов: каждая перерисовка заново создаёт <img> и
// браузер перезапрашивает картинки у внешнего сервиса.
var lastSummarySig = null;
var lastInviteSig = null;

function groupSummarySignature() {
    var r = curRoundData;
    if (!r || !r.players) return '';
    var parts = [String(curRid), String(currentLang || 'ru'), String(r.status || ''), String(r.markerAssignments ? Object.keys(r.markerAssignments).length : 0)];
    Object.keys(r.players).sort().forEach(function(pid) {
        var p = r.players[pid] || {};
        parts.push(pid,
            JSON.stringify(p.scores || {}),
            JSON.stringify(p.submitted || {}),
            JSON.stringify(p.verified || {}),
            JSON.stringify(p.markerScores || {}),
            String(p.fieldHcp == null ? '' : p.fieldHcp));
    });
    // Отметки о завершении карточек и пауза тоже меняют карточку: без них
    // строка сдавшего игрока продолжала подсвечивать «его текущую лунку»,
    // пока кто-нибудь другой не введёт счёт.
    parts.push('fin:' + Object.keys(r.finishedPlayers || {}).sort().join(','));
    parts.push('st:' + String(r.status || '') + (r.paused ? ':paused' : ''));
    return parts.join('|');
}

function inviteSignature() {
    var r = curRoundData;
    if (!r || !r.players) return '';
    var parts = [String(curRid), String(currentLang || 'ru'), canEditGroup ? '1' : '0'];
    Object.keys(r.players).sort().forEach(function(pid) {
        var p = r.players[pid] || {};
        parts.push(pid, String(p.name || ''), isPlayerEnteredRound(p, pid, r) ? '1' : '0');
    });
    try { parts.push('pref:' + String(localStorage.getItem(invitePrefKey()) || '')); } catch (e) { console.warn("[silent]", e); }
    return parts.join('|');
}

// Сброс подписей — когда нужно гарантированно перерисовать (смена языка и т.п.).
var startGateTimer = null;
var startGateLastText = null;

function renderStartGate() {
    var gate = lGet('round-start-gate');
    if (!gate || !curRoundData) return;
    var now = Date.now();
    var gated = isRoundGatedByStart(curRoundData, now);

    if (!gated) {
        if (startGateTimer) { clearInterval(startGateTimer); startGateTimer = null; }
        startGateLastText = null;
        gate.classList.add('hidden');
        return;
    }

    gate.classList.remove('hidden');

    var titleEl = lGet('round-start-title');
    if (titleEl) titleEl.textContent = t('tn_start_pending_title');
    var labelEl = lGet('round-start-label');
    if (labelEl) labelEl.textContent = t('tn_start_countdown_label');
    var hintEl = lGet('round-start-hint');
    if (hintEl) hintEl.textContent = t('tn_start_gate_hint');
    var atEl = lGet('round-start-at');
    if (atEl) atEl.textContent = fmtTime(roundScheduledStartTs(curRoundData));

    // Текст таймера меняем только когда он изменился — раз в секунду.
    var txt = formatStartCountdown(roundStartCountdownMs(curRoundData, now));
    if (startGateLastText !== txt) {
        startGateLastText = txt;
        var valEl = lGet('round-start-countdown');
        if (valEl) valEl.textContent = txt;
    }

    if (!startGateTimer) {
        startGateTimer = setInterval(function() {
            if (!curRoundData) return;
            if (isRoundGatedByStart(curRoundData, Date.now())) { renderStartGate(); return; }
            // Время старта наступило — открываем раунд.
            clearInterval(startGateTimer);
            startGateTimer = null;
            openScheduledRound();
        }, 1000);
    }
}

// Старт наступил прямо на открытой странице игрока: открываем раунд локально
// и пробуем зафиксировать статус в базе (админ-панель сделает то же самое).
function openScheduledRound() {
    var snap = {};
    snap[curRid] = curRoundData;
    try { pestovoActivateRounds(roundsDueForStart(snap, Date.now()), { silent: true, notify: false }); } catch (e) { console.warn("[silent]", e); }
    if (curRoundData) curRoundData.status = 'active';
    toast(t('tn_start_gate_started'), 'success');
    if (typeof vib === 'function') vib([80, 40, 80]);
    applyRoundState(curRoundData);
}

// ==========================================
// ПОСТОЯННОЕ ПРЕДУПРЕЖДЕНИЕ ПЕРЕД ЗАВЕРШЕНИЕМ
// ==========================================
// Раунд нельзя завершить, пока есть неподтверждённые лунки или несовпадения.
// Предупреждение «горит» на экране, пока проблема не исправлена, и НЕ
// перебрасывает игрока на эти лунки (счёт за него там вводит маркер).
var finishBlockShown = false;

function buildFinishBlockHtml(v) {
    var isEn = currentLang === 'en';
    var order = v.order || [];
    var markerName = v.markerName ? escapeHtml(v.markerName) : (isEn ? 'the marker' : 'маркера');
    var rows = '', count = 0, hidden = 0;
    order.forEach(function(h) {
        var d = (v.details && v.details[h]) || {};
        var text = '', cls = '';
        if (v.mismatch[h]) {
            cls = 'fbn-bad';
            text = isEn
                ? ('Hole ' + h + ': you <b>' + (parseInt(d.ps) || 0) + '</b> ≠ marker <b>' + (parseInt(d.ms) || 0) + '</b>')
                : ('Лунка ' + h + ': у вас <b>' + (parseInt(d.ps) || 0) + '</b> ≠ у маркера <b>' + (parseInt(d.ms) || 0) + '</b>');
        } else if (v.unconfirmed[h]) {
            cls = 'fbn-warn';
            text = (parseInt(d.ps) >= 1)
                ? (isEn
                    ? ('Hole ' + h + ': your <b>' + d.ps + '</b> is not confirmed by ' + markerName)
                    : ('Лунка ' + h + ': ваш счёт <b>' + d.ps + '</b> не подтверждён — ждём ' + markerName))
                : (isEn ? ('Hole ' + h + ': no score entered') : ('Лунка ' + h + ': счёт не введён'));
        } else {
            return;
        }
        count++;
        if (count > 6) { hidden++; return; }
        rows += '<li class="fbn-row ' + cls + '"><i class="fas ' +
            (cls === 'fbn-bad' ? 'fa-triangle-exclamation' : 'fa-hourglass-half') +
            '"></i><span>' + text + '</span></li>';
    });
    if (hidden > 0) {
        rows += '<li class="fbn-row fbn-more">' + (isEn ? 'and ' + hidden + ' more…' : 'и ещё ' + hidden + '…') + '</li>';
    }
    var forceBtn = '<button type="button" class="btn btn-og btn-sm btn-block" style="margin-top:10px;justify-content:center;font-weight:700;" onclick="openForceFinishModal(curRid, curRoundData, { playerId: myUid, isGroup: true })"><i class="fas fa-flag-checkered"></i> ' +
        (isEn ? 'Force finish with current scores' : 'Завершить принудительно с текущим счётом') + '</button>';
    return '<div class="finish-block">' +
        '<div class="fbn-head"><i class="fas fa-ban"></i> ' + t('finish_blocked_title') + '</div>' +
        '<ul class="fbn-list">' + rows + '</ul>' +
        '<div class="fbn-hint"><i class="fas fa-circle-info"></i> ' + t('finish_blocked_hint') + '</div>' +
        forceBtn +
        '</div>';
}

function setGroupForceFinishBtnVisible(visible) {
    var btn = lGet('group-force-finish-btn');
    if (!btn) return;
    if (visible) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

function renderFinishBlockNotice(v) {
    var box = lGet('finish-block-notice');
    if (!box) { setGroupForceFinishBtnVisible(false); return; }
    if (!v && finishBlockShown && canEditGroup && curRoundData && myUid && typeof collectPlayerVerification === 'function') {
        try { v = collectPlayerVerification(curRoundData, myUid); } catch (e) { v = null; }
    }
    if (!finishBlockShown) {
        if (box.innerHTML) box.innerHTML = '';
        box.classList.add('hidden');
        setGroupForceFinishBtnVisible(false);
        return;
    }
    if (!v || v.canFinish) {
        // Всё исправлено — предупреждение гаснет само.
        finishBlockShown = false;
        box.innerHTML = '';
        box.classList.add('hidden');
        setGroupForceFinishBtnVisible(false);
        toast(currentLang === 'en'
            ? '✅ All holes are confirmed — the round can be finished'
            : '✅ Все лунки подтверждены — раунд можно завершить', 'success');
        return;
    }
    box.classList.remove('hidden');
    box.innerHTML = buildFinishBlockHtml(v);
    setGroupForceFinishBtnVisible(true);
}

// ==========================================
// ГЕНЕРАЦИЯ QR ДЛЯ ПОДКЛЮЧЕНИЯ ИГРОКОВ
// ==========================================
// Проверка: вошёл ли уже игрок в раунд (создатель, подключившийся, с введённым счётом)
function isPlayerEnteredRound(p, pid, roundData) {
    if (!p) return false;
    // 1. Создатель ручного группового раунда — QR не нужен.
    // Турнирный протокол: createdBy = админ и participantsList[0] НЕ считаются «в игре»
    // до скана QR (запись joined / joinedAt).
    if (p.isCreator) return true;
    if (roundData && roundData.creatorPlayerId && roundData.creatorPlayerId === pid) return true;
    // 2. Игрок уже вошёл в раунд (открыл карточку/подключился)
    if (p.joined === true || p.entered === true || p.joinedAt || p.connected === true) return true;
    // 3. Игрок начал вводить счёт или подтверждать лунки
    if (p.scores && Object.values(p.scores).some(function(v) { return parseInt(v) >= 1; })) return true;
    if (p.submitted && Object.keys(p.submitted).length > 0) return true;
    if (p.markerScores && Object.values(p.markerScores).some(function(tgt) {
        return tgt && Object.values(tgt).some(function(v) { return parseInt(v) >= 1; });
    })) return true;
    // 4. Текущий пользователь на этом устройстве
    if (typeof myUid !== 'undefined' && myUid && myUid === pid) return true;
    return false;
}

// Ключ запомненного состояния панели QR-кодов этого раунда.
function invitePrefKey() { return 'pestovo_invite_open_' + (curRid || ''); }

// Сколько игроков уже подключились к раунду (готовы вводить счёт).
function countJoinedPlayers() {
    var total = 0, joined = 0;
    Object.entries((curRoundData && curRoundData.players) || {}).forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pid, p && p.name)) return;
        total++;
        if (isPlayerEnteredRound(p, pid, curRoundData)) joined++;
    });
    return { joined: joined, total: total };
}

function playerInitials(name) {
    var words = String(name || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!words.length) return '?';
    var ini = words[0].charAt(0).toUpperCase();
    if (words.length > 1) ini += words[words.length - 1].charAt(0).toUpperCase();
    return ini;
}

// Компактная полоса «N из M готовы вводить счёт»: видна всегда, но не мешает
// основной задаче — вводу счёта. Когда все подключились — slim-плашка.
function renderJoinStatus() {
    var box = lGet('invite-join-status');
    if (!box || !curRoundData) return;
    var counts = countJoinedPlayers();
    var joined = counts.joined, total = counts.total;
    if (!total) { box.innerHTML = ''; return; }
    var pct = Math.max(0, Math.min(100, Math.round(joined / total * 100)));
    if (joined >= total) {
        box.innerHTML = '<div class="join-status all-joined"><span class="join-check"><i class="fas fa-circle-check"></i></span>' +
            '<span>' + t('all_joined') + ' · ' + joined + '/' + total + '</span></div>';
        return;
    }
    var dots = '';
    Object.entries(curRoundData.players || {}).forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pid, p && p.name)) return;
        var entered = isPlayerEnteredRound(p, pid, curRoundData);
        var nm = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : (p.name || '');
        dots += '<span class="join-dot' + (entered ? ' is-joined' : '') + '" title="' + escapeHtml(nm) + '">' + escapeHtml(playerInitials(nm)) + '</span>';
    });
    var readyWord = (joined === 1) ? t('ready_to_score_one') : t('ready_to_score');
    box.innerHTML = '<div class="join-status">' +
        '<div class="join-dots">' + dots + '</div>' +
        '<div class="join-mid"><div class="join-text"><b>' + joined + ' ' + t('of_word') + ' ' + total + '</b> ' + readyWord + '</div>' +
        '<div class="join-bar"><div class="join-fill" style="width:' + pct + '%"></div></div></div>' +
        '</div>';
}

function updateInviteToggleLabel() {
    var txt = lGet('invite-qrs-txt');
    var panel = lGet('invite-qrs-panel');
    if (!txt) return;
    var counts = (typeof curRoundData !== 'undefined' && curRoundData) ? countJoinedPlayers() : { joined: 0, total: 0 };
    var suffix = counts.total ? (' · ' + counts.joined + '/' + counts.total) : '';
    var open = panel && !panel.classList.contains('hidden');
    txt.textContent = (open ? t('invite_qrs_collapse') : t('invite_qrs_expand')) + suffix;
}

// Сворачивание / разворачивание QR-кодов подключения игроков.
// Выбор запоминается для этого раунда.
function toggleInviteQRs() {
    var panel = lGet('invite-qrs-panel');
    var icon = lGet('invite-qrs-icon');
    if (!panel) return;
    var willOpen = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !willOpen);
    if (icon) icon.className = willOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    try { localStorage.setItem(invitePrefKey(), willOpen ? 'open' : 'closed'); } catch (e) { console.warn("[silent]", e); }
    updateInviteToggleLabel();
    if (typeof vib === 'function') vib(15);
}

function renderInviteQRs() {
    var cardEl = lGet('invite-qrs-card');
    var activeEl = lGet('invite-qrs-grid');
    if (!canEditGroup || !curRoundData || !activeEl) {
        if (cardEl) { try { cardEl.classList.add('hidden'); } catch (e) { console.warn("[silent]", e); } }
        return;
    }
    if (cardEl) { try { cardEl.classList.remove('hidden'); } catch (e) { console.warn("[silent]", e); } }

    // QR-картинки пересоздаём только при реальном изменении списка игроков или
    // их статуса «в игре»: иначе каждое обновление базы перезапрашивало все
    // QR-коды у внешнего сервиса и тормозило страницу на телефоне.
    var invSig = inviteSignature();
    if (invSig && invSig === lastInviteSig) return;
    lastInviteSig = invSig;

    renderJoinStatus();

    // Фоновая предзагрузка всех QR этой группы — даже если панель ещё
    // свёрнута, коды уже загружаются и будут готовы мгновенно.
    try { prewarmInviteQrImages(curRid, curRoundData.players); } catch (ePrew) { console.warn("[silent]", ePrew); }

    // QR-коды доступны для всех игроков группы, включая создателя:
    // любой игрок может повторно подключиться с другого телефона.
    // Ссылка под QR больше не показывается — только сам код (требование клуба).
    var base = baseUrl();
    var html = '';

    Object.entries(curRoundData.players || {}).forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pid, p && p.name)) return;
        var entered = isPlayerEnteredRound(p, pid, curRoundData);
        var url = base + 'setup-round.html?round=' + curRid + '&as=' + pid;
        var nm = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : (p.name || '');

        html += '<div class="qr-card ' + (entered ? 'qr-joined' : 'qr-waiting') + '" style="padding:14px;text-align:center;">';
        html += '<div class="qr-status-badge">' + (entered
            ? '<i class="fas fa-circle-check"></i> ' + t('joined_in_game')
            : '<i class="fas fa-hourglass-half"></i> ' + t('waiting_join')) + '</div>';
        html += '<div class="qr-name" style="color:var(--white);font-weight:700;font-size:14px;margin-bottom:4px;"><i class="fas fa-mobile-alt"></i> ' + escapeHtml(nm) + '</div>';
        html += '<div class="qr-hint">' + (entered ? t('qr_reconnect_hint') : t('scan_to_play')) + '</div>';
        // Цепочка провайдеров: основной → запасной → повтор (QR больше не «пропадает»).
        html += (typeof pestovoQrImgHtml === 'function')
            ? pestovoQrImgHtml(url, 200, 'qr-img')
            : '<img src="' + qrUrl(url) + '" alt="QR" class="qr-img">';
        html += '</div>';
    });

    activeEl.innerHTML = html;

    // Панель открыта по умолчанию даже после подключения всех игроков.
    // Сворачиваем только по явному выбору пользователя, а не по статусу игры.
    var panel = lGet('invite-qrs-panel');
    var icon = lGet('invite-qrs-icon');
    if (panel) {
        var pref = null;
        try { pref = localStorage.getItem(invitePrefKey()); } catch (e) { console.warn("[silent]", e); }
        var shouldOpen = pref !== 'closed';
        panel.classList.toggle('hidden', !shouldOpen);
        if (icon) icon.className = shouldOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    }
    updateInviteToggleLabel();
}

// ==========================================
// ==========================================
// ВЫЗОВ СУДЬИ / МАРШАЛА
// ==========================================
function callOfficial(type) {
    if (!canEditGroup) return;
    requestOfficialCall({
        roundId: curRid,
        playerId: myUid,
        prefix: 'group',
        type: type,
        hole: function() { return playHole; },
        playerName: function() {
            return (curRoundData && curRoundData.players && curRoundData.players[myUid])
                ? curRoundData.players[myUid].name : 'Player';
        },
        flightMembers: function() {
            return typeof getFlightPlayerNames === 'function'
                ? getFlightPlayerNames(curRoundData, myUid) : [];
        },
        canEdit: function() { return canEditGroup; },
        onSent: function(call) {
            var pName = call.playerName || 'Player';
            var members = call.flightMembers || [];
            if (typeof sendTelegramOfficialAlert === 'function') sendTelegramOfficialAlert(type, call.hole, pName, members);
            if (typeof sendVKOfficialAlert === 'function') sendVKOfficialAlert(type, call.hole, pName, members);
            toast('🚨 ' + getOfficialRoleName(type) + (currentLang === 'en' ? ' called to hole ' : ' вызван на лунку ') + call.hole + '!', 'warn');
            vib([100, 50, 100]);
        }
    });
}

// Слушаем «ответы» на вызовы, которые админ оставил в `users/<myUid>/notifications`.
// Каждое новое уведомление с type === 'call_response' показываем тостом
// «Судья/маршал едет» и сразу помечаем как прочитанное.
function listenForCallResponses() {
    if (typeof db === 'undefined' || !myUid) return;
    if (window._pestovoCallResponsesListening) return;
    window._pestovoCallResponsesListening = true;

    db.ref('users/' + myUid + '/notifications').orderByChild('type').equalTo('call_response').on('child_added', function(sn) {
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
        db.ref('users/' + myUid + '/notifications/' + sn.key + '/read').set(true).catch(function(){});
    });
}

// ==========================================
// РЕЖИМ ПРОСМОТРА (ЗРИТЕЛЬ)
// ==========================================
function renderGVPlayers(r) {
    var el = lGet('gv-players');
    var scCardEl = lGet('gv-scorecard-card');
    var order = getRoundOrder(r);
    var allPlayers = r.players || {};
    
    if (el) {
        var html = '';
        Object.entries(allPlayers).forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            // Удалённые и навсегда заблокированные демо-игроки не показываются
            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pid, p && p.name)) return;
            // Для отображения: если нет своих счётов, берём счёты маркера
            var scores = p.scores || {};
            var hasOwnScores = Object.values(scores).some(function(v) { return parseInt(v) >= 1; });
            var displayScores = scores;
            var markerNote = '';
            if (!hasOwnScores && p.markedBy && allPlayers[p.markedBy]) {
                var mkScores = allPlayers[p.markedBy].markerScores && allPlayers[p.markedBy].markerScores[pid];
                if (mkScores && Object.values(mkScores).some(function(v) { return parseInt(v) >= 1; })) {
                    displayScores = mkScores;
                    var mkName = privacyDisplayName(allPlayers[p.markedBy], p.markedBy);
                    // Имя маркера — пользовательская строка: экранируем (вставляется в HTML).
                    markerNote = currentLang === 'en' ? ' (marker: ' + escapeHtml(mkName) + ')' : ' (маркер: ' + escapeHtml(mkName) + ')';
                }
            }
            var stats = calcRoundStats(displayScores, p.fieldHcp || 0, p.exactHcp || 0, order);
            // Только для зрителей: сдавший карточку (в т.ч. досрочно) больше не
            // «на лунке» — показываем отметку о завершении его раунда.
            var thruTxt = (typeof playerHoleStatusText === 'function')
                ? playerHoleStatusText(r, pid, p, stats, order)
                : (stats.holesPlayed >= getRoundHoleCount(r) ? t('finished_f') : (stats.currentHole ? t('hole') + ' №' + stats.currentHole : '—'));
            var pTee = (p && p.tee) || r.tee || 'wh';
            var pTeeBadge = '<span class="tee-pill tee-' + pTee + '" style="font-size:9.5px;padding:1px 7px;margin-left:6px;vertical-align:middle;">' + t('tee_' + pTee) + '</span>';

            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;cursor:pointer;" onclick="openPlayerProfileModal(\'' + pid + '\',\'' + curRid + '\')">' +
                '<div><strong style="color:var(--white);font-size:16px;"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(privacyDisplayName(p, pid)) + pTeeBadge + '</strong>' +
                '<div style="font-size:12px;color:var(--gold);font-weight:600;margin-top:2px;">📍 ' + thruTxt + markerNote + '</div>' +
                '<div style="font-size:12px;color:var(--muted);margin-top:2px;">Gross: ' + (stats.gross || 0) + ' · Stableford: ' + stats.stablefordField + '</div>' +
                '</div>' +
                '<div style="text-align:right;">' +
                '<div class="' + scoreClass(stats.toPar) + '" style="font-size:24px;font-weight:800;">' + fmtScore(stats.toPar) + '</div>' +
                '<button class="btn btn-og btn-sm" style="margin-top:4px;padding:3px 8px;font-size:10px;"><i class="fas fa-id-card"></i> ' + (currentLang === 'en' ? 'Card' : 'Карточка') + '</button>' +
                '</div></div>';
        });
        el.innerHTML = html;
    }

    if (scCardEl) {
        r.roundId = curRid;
        scCardEl.innerHTML = generateGroupHoleTableHTML(r, { compact: true, showMarker: true });
        ensureScorecardOpen('gv-sc-panel');
    }
}

var groupFinishing = false;

// ── ПРОПУЩЕННЫЕ ЛУНКИ (групповой раунд) ──
// Лунки, на которых игрок ещё не подтвердил свой счёт.
function groupSkippedHoles() {
    if (!curRoundData) return [];
    var myPlayer = curRoundData.players && curRoundData.players[myUid];
    var scores = (myPlayer && myPlayer.scores) || {};
    var submitted = (myPlayer && myPlayer.submitted) || {};
    var order = getRoundOrder(curRoundData);
    var out = [];
    order.forEach(function(h) {
        if (!(parseInt(scores[h]) > 0) || submitted[h] !== true) out.push(h);
    });
    return out;
}

// Предупреждение о пропущенных лунках с кнопками перехода
// («вбить счёт») и вариантом «продолжить с пропуском».
function finishGroupRound() {
    if (!canEditGroup) return;
    // Защита от повторного завершения (двойной клик): иначе история и roundsPlayed задваивались
    if (groupFinishing) return;
    // Уже сдал карточку в этом раунде — повторно не завершаем.
    if (typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(curRoundData, myUid)) return;

    // Турнирная проверка: ТОЛЬКО я и мой маркер (другие пары группы не блокируют финиш).
    // Раунд не завершается, пока есть неподтверждённые лунки или несовпадения.
    // Показываем ПОСТОЯННОЕ предупреждение списком проблемных лунок — оно
    // гаснет само, когда всё исправлено. На эти лунки игрока НЕ перебрасываем:
    // счёт там подтверждает маркер, а не он.
    // ВАЖНО: эта проверка идёт ДО проверки владельца — иначе гость, открывший
    // раунд по ссылке (?as=), вместо списка неподтверждённых лунок получал
    // модалку «подтвердите, что это ваш раунд» и не понимал, что делать.
    var verification = (typeof collectPlayerVerification === 'function')
        ? collectPlayerVerification(curRoundData, myUid)
        : collectRoundVerification(curRoundData, myUid);
    if (!verification.canFinish) {
        finishBlockShown = true;
        renderFinishBlockNotice(verification);
        vib([200, 100, 200]);
        return;
    }
    // Все лунки подтверждены — предупреждение (если висело) убираем.
    if (finishBlockShown) {
        finishBlockShown = false;
        renderFinishBlockNotice(verification);
    }

    // Чужое устройство по ссылке «Продолжить по ФИО»: завершить раунд может
    // только владелец (проверка телефона/ФИО), но не тот, кто ввёл чужое имя.
    // Проверяется ПОСЛЕ неподтверждённых лунок — см. комментарий выше.
    if (typeof pestovoIsFioResume === 'function' && pestovoIsFioResume(curRoundData, curRid, myUid) &&
        !(typeof pestovoFioVerified === 'function' && pestovoFioVerified(curRid, myUid))) {
        if (typeof pestovoVerifyRoundOwner === 'function') {
            pestovoVerifyRoundOwner(curRoundData, curRid, myUid, function(ok) { if (ok) finishGroupRound(); });
            return;
        }
    }

    // Компактное уведомление о незаполненных/неподтверждённых лунках
    // (как в одиночном раунде): ввести сейчас, перейти к первой, либо
    // завершить как есть.
    var skipped = groupSkippedHoles();
    if (skipped.length && typeof pestovoShowFinishMissingModal === 'function') {
        pestovoShowFinishMissingModal(skipped, {
            onEnter: function(h) { try { goPlayHole(h); } catch (e) { console.warn("[silent]", e); } },
            onContinue: function() { try { goPlayHole(skipped[0]); } catch (e) { console.warn("[silent]", e); } },
            onFinishAnyway: function() { doFinishGroupRound(); }
        });
        return;
    }

    doFinishGroupRound();
}

function doFinishGroupRound() {
    if (groupFinishing) return;
    groupFinishing = true;

    var finalizeGroup = function() {
        // Фиксируем, кто завершил раунд: в карточках раунда показываем имя завершившего
        var finisherUid = myUid;
        var finisherName = (finisherUid && curRoundData && curRoundData.players && curRoundData.players[finisherUid])
            ? (curRoundData.players[finisherUid].name || '') : '';
        var finishUpdate = { autoCompleted: false };
        if (finisherUid) {
            finishUpdate['finishedPlayers/' + finisherUid] = { at: Date.now(), name: finisherName || '' };
            finishUpdate.completedBy = finisherUid;
        }
        if (finisherName) finishUpdate.completedByName = finisherName;
        // Раунд закрывается только когда ВСЕ участники сдали карточки:
        // иначе те, кто ещё не ввёл счёт, видели «режим просмотра».
        var finMap = {};
        Object.keys(curRoundData.finishedPlayers || {}).forEach(function(k) { finMap[k] = true; });
        if (finisherUid) finMap[finisherUid] = true;
        var pending = Object.keys(curRoundData.players || {}).filter(function(id) { return !finMap[id]; });
        if (!pending.length) {
            finishUpdate.status = 'completed';
            finishUpdate.completedAt = Date.now();
        } else {
            // Частичное завершение: группа продолжает играть, кто не сдал —
            // вводит счёт; в раунде видно, кто уже финишировал.
            finishUpdate.partialFinish = true;
        }
        db.ref('rounds/' + curRid).update(finishUpdate).then(function() {
            // Сохраняем историю для финишировавшего игрока сразу
            try {
                var pObj = curRoundData && curRoundData.players && curRoundData.players[finisherUid];
                if (pObj && typeof saveHistoryEntry === 'function') {
                    var order = getRoundOrder(curRoundData);
                    var st = calcRoundStats(pObj.scores || {}, pObj.fieldHcp || 0, pObj.exactHcp || 0, order);
                    saveHistoryEntry(finisherUid, curRid, curRoundData, pObj, st);
                }
            } catch (e) { console.warn("[silent]", e); }
            // Перечитываем раунд ПОСЛЕ записи: статус 'completed' появляется,
            // только когда карточки сдали ВСЕ участники группы.
            return db.ref('rounds/' + curRid).once('value');
        }).then(function(sn) {
            var fresh = sn && sn.val();
            if (!fresh) return;

            // Если это турнирный раунд и после него сыграны все раунды турнира —
            // турнир завершается автоматически (открывается экспорт протокола).
            if (fresh.tournamentId && typeof pestovoAutoFinishTournament === 'function') {
                try { pestovoAutoFinishTournament(fresh.tournamentId); } catch (_) { console.warn("[silent]", _); }
            }

            // ВАЖНО: история пишется один раз на раунд и только когда раунд
            // действительно завершён. Раньше saveHistory вызывался на КАЖДОМ
            // частичном завершении (каждый сдавший карточку клиент писал
            // историю всем участникам) — из-за этого в профилях появлялись
            // одинаковые дубли раундов. Транзакция-клейм гарантирует запись
            // ровно один раз, даже если финишируют несколько клиентов сразу.
            // При частичном завершении (часть группы ещё играет) в историю
            // не пишем: её запишет последний сдавший, либо авто-завершение
            // просроченного раунда на следующий день.
            if (fresh.status !== 'completed') return;
            return pestovoClaimRoundHistory(curRid).then(function(claimed) {
                if (claimed && typeof saveHistory === 'function') {
                    try { saveHistory(curRid, fresh); } catch (e) { console.warn("[silent]", e); }
                }
            });
        }).catch(function(err) {
            // Раньше отказ записи (например, RULES: QR-игрок турнирного раунда
            // не создавал раунд и не может писать finishedPlayers/status)
            // проглатывался молча: игрок видел тост успеха и уходил, а раунд
            // оставался активным. Показываем проблему явно.
            groupFinishing = false;
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
        openFinishConfirmModal(curRid, function() {
            groupFinishing = true;
            finalizeGroup();

            toast(t('msg_round_finished'));
            setTimeout(function() {
                window.location.href = 'leaderboard.html';
            }, 800);
        }, function() {
            // Модалка закрыта без подтверждения — снимаем блокировку повторного завершения
            groupFinishing = false;
        }, { playerId: myUid, onGoToHole: function(hole){ try { goPlayHole(hole); } catch (_) { console.warn("[silent]", _); } } });
    } else {
        if (!confirm(t('msg_finish_confirm'))) { groupFinishing = false; return; }

        finalizeGroup();

        toast(t('msg_round_finished'));
        setTimeout(function() {
            window.location.href = 'leaderboard.html';
        }, 800);
    }
}