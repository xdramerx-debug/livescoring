document.addEventListener('DOMContentLoaded', function() {
    initNav();
    buildCourseCard();
    loadLiveRounds();
    loadRecentResults();
    loadClubStats();
    loadMyActiveRounds('my-active-rounds-container');
    // погодный виджет инициализируется в initNav() с правильным контейнером
});

function onAuthReady(u, d) { navAuth(u, d); }

// Чипы с гандикапами игрока — показываются рядом с именем
// в списках на главной странице: точный и полевой.
// Отображение: ТИ, точный гандикап, полевой гандикап
function buildFieldHcpChip(p) {
    var val = p && p.fieldHcp !== undefined && p.fieldHcp !== null && p.fieldHcp !== ''
        ? fmtFieldHcp(p.fieldHcp) : '—';
    var bandClass = typeof fieldHcpBandClass === 'function' ? fieldHcpBandClass(p && p.fieldHcp) : '';
    var bandTitle = typeof fieldHcpBandTitle === 'function' ? fieldHcpBandTitle(p && p.fieldHcp) : '';
    return '<span class="hcp-chip ' + bandClass + '" title="' + bandTitle + '">' + t('field_hcp_short') + ' ' + val + '</span>';
}

function buildExactHcpChip(p) {
    var val = p && p.exactHcp !== undefined && p.exactHcp !== null && p.exactHcp !== ''
        ? fmtExactHcp(p.exactHcp) : '—';
    return '<span class="hcp-chip hcp-chip-exact">' + t('exact_hcp_short') + ' ' + val + '</span>';
}

function buildPlayerTeeBadge(p, roundData) {
    var teeCode = (p && p.tee) || (roundData && roundData.tee) || 'wh';
    return '<span class="tee-pill tee-' + teeCode + '" style="font-size:9.5px;padding:1px 7px;margin-left:6px;vertical-align:middle;">' + t('tee_' + teeCode) + '</span>';
}

function buildPlayerBadges(p, roundData) {
    // Порядок по требованию: ТИ, точный гандикап, полевой гандикап
    var teeBadge = buildPlayerTeeBadge(p, roundData);
    var exactBadge = buildExactHcpChip(p);
    var fieldBadge = buildFieldHcpChip(p);
    return teeBadge + exactBadge + fieldBadge;
}

function buildCourseCard() {
    var el = document.getElementById('course-card');
    if (!el) return;
    var teeKeys = ['bk','bl','wh','rd'];
    var isEn = currentLang === 'en';

    var outStr = isEn ? 'OUT' : 'OUT';
    var inStr = isEn ? 'IN' : 'IN';
    var totalStr = isEn ? 'TOTAL' : 'ВСЕГО';
    var parStr = isEn ? 'Par' : 'Пар';
    var indexStr = isEn ? 'Index' : 'Индекс';

    var hdrLblLong = isEn ? 'Tee / Hole' : 'ТИ / Лунка';
    var hdrLblShort = isEn ? 'Tee' : 'ТИ';

    // Front 9 (OUT). Заголовками «Первые 9 / Вторые 9» больше не дублируем
    // разбиение девяток — оно и так читается из колонок OUT/IN.
    var html = '<div class="pestovo-modern-scorecard" style="margin-bottom:12px;padding:12px;box-sizing:border-box;max-width:100%;overflow-x:hidden;">';
    html += '<div class="msc-tile-grid msc-grid-9">';

    // Header row
    html += '<div class="msc-tile msc-hdr-lbl"><span class="msc-total-long">' + hdrLblLong + '</span><span class="msc-total-short">' + hdrLblShort + '</span></div>';
    for (var h = 1; h <= 9; h++) html += '<div class="msc-tile msc-hdr-num">' + h + '</div>';
    html += '<div class="msc-tile msc-hdr-tot">' + outStr + '</div>';

    // Tees
    teeKeys.forEach(function(tKey) {
        html += '<div class="msc-tile msc-lbl-' + tKey + '">' + t('tee_' + tKey) + '</div>';
        var sum = 0;
        for (var h = 1; h <= 9; h++) {
            var d = holeDist(h, tKey);
            sum += d;
            html += '<div class="msc-tile msc-val-' + tKey + '">' + d + '</div>';
        }
        html += '<div class="msc-tile msc-tot-' + tKey + '">' + sum + '</div>';
    });

    // Par row
    html += '<div class="msc-tile msc-lbl-par">' + parStr + '</div>';
    var pO = 0;
    for (var h = 1; h <= 9; h++) {
        var p = holePar(h);
        pO += p;
        html += '<div class="msc-tile msc-val-par">' + p + '</div>';
    }
    html += '<div class="msc-tile msc-tot-par">' + pO + '</div>';

    // Index row
    html += '<div class="msc-tile msc-lbl-idx">' + indexStr + '</div>';
    for (var h = 1; h <= 9; h++) {
        html += '<div class="msc-tile msc-val-idx">' + holeHcp(h) + '</div>';
    }
    html += '<div class="msc-tile msc-tot-idx">—</div>';

    html += '</div></div>';

    // Back 9 (IN & TOTAL)
    html += '<div class="pestovo-modern-scorecard" style="padding:12px;box-sizing:border-box;max-width:100%;overflow-x:hidden;">';
    html += '<div class="msc-tile-grid msc-grid-10">';

    // Header row
    html += '<div class="msc-tile msc-hdr-lbl"><span class="msc-total-long">' + hdrLblLong + '</span><span class="msc-total-short">' + hdrLblShort + '</span></div>';
    for (var h = 10; h <= 18; h++) html += '<div class="msc-tile msc-hdr-num">' + h + '</div>';
    html += '<div class="msc-tile msc-hdr-tot">' + inStr + '</div>';
    html += '<div class="msc-tile msc-hdr-tot" style="background:var(--gold);color:var(--bg);"><span class="msc-total-long">' + totalStr + '</span><span class="msc-total-short">Σ</span></div>';

    // Tees
    teeKeys.forEach(function(tKey) {
        html += '<div class="msc-tile msc-lbl-' + tKey + '">' + t('tee_' + tKey) + '</div>';
        var sumI = 0, sumO = 0;
        for (var h = 1; h <= 9; h++) sumO += holeDist(h, tKey);
        for (var h = 10; h <= 18; h++) {
            var d = holeDist(h, tKey);
            sumI += d;
            html += '<div class="msc-tile msc-val-' + tKey + '">' + d + '</div>';
        }
        html += '<div class="msc-tile msc-tot-' + tKey + '">' + sumI + '</div>';
        html += '<div class="msc-tile msc-tot-' + tKey + '" style="font-weight:900;">' + (sumO + sumI) + '</div>';
    });

    // Par row
    html += '<div class="msc-tile msc-lbl-par">' + parStr + '</div>';
    var pI = 0;
    for (var h = 10; h <= 18; h++) {
        var p = holePar(h);
        pI += p;
        html += '<div class="msc-tile msc-val-par">' + p + '</div>';
    }
    html += '<div class="msc-tile msc-tot-par">' + pI + '</div>';
    html += '<div class="msc-tile msc-tot-par" style="font-weight:900;">' + (pO + pI) + '</div>';

    // Index row
    html += '<div class="msc-tile msc-lbl-idx">' + indexStr + '</div>';
    for (var h = 10; h <= 18; h++) {
        html += '<div class="msc-tile msc-val-idx">' + holeHcp(h) + '</div>';
    }
    html += '<div class="msc-tile msc-tot-idx">—</div>';
    html += '<div class="msc-tile msc-tot-idx">—</div>';

    html += '</div></div>';

    el.innerHTML = html;
}

function renderCourseHolesStrip(activeEntries) {
    var stripEl = document.getElementById('course-holes-strip');
    if (!stripEl) return;

    var isEn = currentLang === 'en';
    var holeCount = {};
    var latestStart = { 1: 0, 10: 0 };
    for (var i = 1; i <= 18; i++) holeCount[i] = 0;

    // Статистика по девяткам для подсказки «С какой лунки лучше стартовать»:
    // сколько игроков сейчас в поле на каждой девятке и их суммарный гандикап.
    var nine = {
        front: { players: 0, hcpSum: 0 },
        back: { players: 0, hcpSum: 0 }
    };

    var totalPlayers = 0;

    (activeEntries || []).forEach(function(e) {
        var r = e[1] || {};
        // В блоке «Сейчас на поле» показываем последний активный старт с
        // двух стартовых ти. Время берётся из самого раунда, а не из времени
        // создания записи, поэтому остаётся верным для отложенного старта.
        var startHole = parseInt(r.startHole) || 1;
        var startTime = parseInt(r.startTime) || 0;
        if ((startHole === 1 || startHole === 10) && startTime > latestStart[startHole]) {
            latestStart[startHole] = startTime;
        }
        var players = r.players || {};
        var order = getRoundOrder(r);
        Object.entries(players).forEach(function(pe) {
            var p = pe[1];
            if (p && typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], p.name)) return;
            totalPlayers++;
            var scores = p.scores || {};
            var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, order);
            if (stats.currentHole && holeCount[stats.currentHole] !== undefined) {
                holeCount[stats.currentHole]++;
                // Игрок физически находится на этой лунке — учитываем его
                // в загруженности соответствующей девятки вместе с гандикапом.
                var side = stats.currentHole <= 9 ? nine.front : nine.back;
                side.players++;
                var hcpVal = (p.fieldHcp !== undefined && p.fieldHcp !== null && p.fieldHcp !== '')
                    ? (parseFloat(p.fieldHcp) || 0)
                    : (parseFloat(p.exactHcp) || 0);
                side.hcpSum += hcpVal;
            }
        });
    });

    var totalLabel = t('total_players_on_course');

    var lastStartLabel = isEn ? 'Latest tee start' : 'Последний старт';
    var holeLabel = isEn ? 'Hole' : 'Лунка';
    var noStartLabel = '—';

    // Компактный блок «Сейчас на поле»: одна строка «Всего игроков на поле»,
    // ниже — «Последний старт». Без дублирования количества игроков и статистики.
    var html = '<div class="chs-strip-title"><i class="fas fa-map"></i> ' + t('field_map_title') + '</div>' +
        '<div class="chs-total-bar"><span class="chs-total-icon"><i class="fas fa-users"></i></span>' +
        '<span class="chs-total-lbl">' + totalLabel + ':</span>' +
        '<b class="chs-total-val">' + totalPlayers + '</b></div>' +
        '<div class="chs-starts" aria-label="' + lastStartLabel + '">' +
            '<span class="chs-starts-title"><i class="fas fa-clock"></i> ' + lastStartLabel + ':</span>' +
            '<span class="chs-start-pill"><span>' + holeLabel + ' 1</span><b>' + (latestStart[1] ? fmtTime(latestStart[1]) : noStartLabel) + '</b></span>' +
            '<span class="chs-start-pill"><span>' + holeLabel + ' 10</span><b>' + (latestStart[10] ? fmtTime(latestStart[10]) : noStartLabel) + '</b></span>' +
        '</div>';

    html += '<div class="chs-grid">';
    for (var h = 1; h <= 18; h++) {
        var cnt = holeCount[h];
        var busy = cnt > 0;
        var title = isEn
            ? 'Hole ' + h + (busy ? ' — ' + cnt + ' ' + (cnt === 1 ? 'player' : 'players') + ' playing' : ' — free')
            : 'Лунка ' + h + (busy ? ' — идёт игра (' + cnt + ' ' + pluralN(cnt, 'игрок', 'игрока', 'игроков') + ')' : ' — свободна');
        html += '<div class="chs-cell ' + (busy ? 'chs-busy' : 'chs-free') + '" title="' + title + '">' +
            '<span class="chs-n">' + h + '</span>' +
            '<i class="fas fa-circle chs-dot' + (busy ? ' chs-live' : '') + '"></i>' +
            (busy ? '<span class="chs-cnt">' + cnt + '</span>' : '') +
            '</div>';
    }
    html += '</div>';

    // Разворачиваемая вкладка-подсказка: с какой лунки лучше стартовать прямо сейчас.
    // По умолчанию свёрнута («карточки свёрнуты»).
    html += buildStartHintHTML(nine, isEn);

    // Блок «Карта лунок и старты» всегда полностью развёрнут: без кнопки
    // свернуть/развернуть. Внутри — счётчик игроков, старты и карта лунок.
    stripEl.innerHTML = html;
}

// Состояние вкладки-подсказки сохраняется между перерисовками ленты:
// блок «Сейчас на поле» обновляется в реальном времени.
var startHintOpen = false;

function toggleStartHint() {
    startHintOpen = !startHintOpen;
    var body = document.getElementById('chs-hint-body');
    var icon = document.getElementById('chs-hint-icon');
    var btn = document.getElementById('chs-hint-toggle');
    if (body) body.classList.toggle('hidden', !startHintOpen);
    if (icon) icon.className = startHintOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    if (btn) btn.setAttribute('aria-expanded', startHintOpen ? 'true' : 'false');
}

function buildStartHintHTML(nine, isEn) {
    var front = nine.front, back = nine.back;
    var fAvg = front.players ? front.hcpSum / front.players : 0;
    var bAvg = back.players ? back.hcpSum / back.players : 0;

    // Совокупная «загруженность» девятки: каждый игрок в поле и высокий средний
    // гандикап (чем выше гандикап, тем медленнее темп игры) увеличивают риск
    // задержек. Стартуем с той девятки, где загрузка меньше.
    var fLoad = front.players * 3 + fAvg;
    var bLoad = back.players * 3 + bAvg;

    var recoHole = null;
    var why = '';
    if (front.players === 0 && back.players === 0) {
        why = isEn
            ? '💡 The course is free right now — you can start from any hole (hole 1 by default).'
            : '💡 Поле сейчас свободно — можно стартовать с любой лунки (по умолчанию с лунки 1).';
    } else if (Math.abs(fLoad - bLoad) < 1) {
        why = isEn
            ? '💡 Both nines are similarly loaded right now — start from any hole (hole 1 by default).'
            : '💡 Загруженность девяток сейчас примерно одинаковая — можно стартовать с любой лунки (по умолчанию с лунки 1).';
    } else {
        var winner = fLoad < bLoad ? front : back;
        var loser = fLoad < bLoad ? back : front;
        var winnerAvg = fLoad < bLoad ? fAvg : bAvg;
        var loserAvg = fLoad < bLoad ? bAvg : fAvg;
        recoHole = fLoad < bLoad ? 1 : 10;

        var parts = [];
        if (winner.players === 0) {
            parts.push(isEn ? 'no one is playing there right now' : 'там сейчас никто не играет');
        } else {
            if (winner.players < loser.players) {
                parts.push(isEn ? 'fewer players on that nine' : 'на этой девятке сейчас меньше игроков');
            }
            if (loser.players > 0 && winnerAvg < loserAvg - 0.5) {
                parts.push(isEn
                    ? 'their average handicap is lower, so play moves faster'
                    : 'средний гандикап играющих ниже — игра идёт быстрее');
            }
            if (!parts.length) {
                parts.push(isEn ? 'that nine is lighter right now' : 'эта девятка сейчас менее загружена');
            }
        }

        var startPhrase = isEn ? '💡 Better to start from ' : '💡 Лучше стартовать ';
        var startHoleName = recoHole === 1
            ? (isEn ? 'the first nine — hole 1' : 'с первой девятки — с лунки 1')
            : (isEn ? 'the second nine — hole 10' : 'со второй девятки — с лунки 10');
        why = startPhrase + startHoleName + ': ' + parts.join(', ') + '.';
    }

    var bodyCls = startHintOpen ? '' : ' hidden';
    var iconCls = startHintOpen ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    var ariaExp = startHintOpen ? 'true' : 'false';

    var recoHtml = '';
    if (recoHole) {
        var recoLbl = isEn ? 'Recommended start' : 'Рекомендуемый старт';
        var holeLbl = isEn ? 'Hole' : 'Лунка';
        recoHtml = '<span class="chs-hint-start"><i class="fas fa-flag-checkered"></i> ' + recoLbl + ': <b>' + holeLbl + ' ' + recoHole + '</b></span>';
    }

    var fmtAvg = function (n) { return n > 0 ? (Math.round(n * 10) / 10).toFixed(1) : '—'; };
    var playersLbl = function (n) {
        return isEn ? (n === 1 ? 'player in the field' : 'players in the field') : pluralN(n, 'игрок в поле', 'игрока в поле', 'игроков в поле');
    };
    var avgLbl = isEn ? 'avg handicap' : 'средний HCP';
    var frontTitle = isEn ? 'First nine' : 'Первая девятка';
    var backTitle = isEn ? 'Second nine' : 'Вторая девятка';
    var holesSpan = function (a, b) { return isEn ? ' (holes ' + a + '–' + b + ')' : ' (лунки ' + a + '–' + b + ')'; };

    var frontBetter = recoHole === 1;
    var backBetter = recoHole === 10;

    var noteTxt = isEn
        ? 'The hint takes into account everyone on the course right now: how loaded each nine is and the average handicap of the players (the higher the handicap, the slower the pace). Choose your start hole when you begin a round.'
        : 'Подсказка учитывает всех, кто сейчас в поле: загруженность каждой девятки и средний гандикап играющих (чем выше гандикап, тем медленнее темп). Стартовую лунку можно выбрать при создании раунда.';

    var html = '<div class="chs-hint">' +
        '<button type="button" class="chs-hint-toggle" id="chs-hint-toggle" onclick="toggleStartHint()" aria-expanded="' + ariaExp + '">' +
        '<span class="chs-hint-title"><i class="fas fa-lightbulb"></i> ' + t('start_hint_title') + '</span>' +
        '<i class="' + iconCls + '" id="chs-hint-icon"></i>' +
        '</button>' +
        '<div class="chs-hint-body' + bodyCls + '" id="chs-hint-body">' +
        '<div class="chs-hint-reco">' + recoHtml + '<span class="chs-hint-why">' + why + '</span></div>' +
        '<div class="chs-hint-nines">' +
        '<div class="chs-hint-nine' + (frontBetter ? ' is-better' : '') + '">' +
        '<div class="chs-hint-nine-t">' + (frontBetter ? '<i class="fas fa-circle-check"></i> ' : '') + frontTitle + holesSpan(1, 9) + '</div>' +
        '<div class="chs-hint-nine-stats">' +
        '<div class="chs-hint-stat"><b>' + front.players + '</b><span>' + playersLbl(front.players) + '</span></div>' +
        '<div class="chs-hint-stat"><b>' + fmtAvg(fAvg) + '</b><span>' + avgLbl + '</span></div>' +
        '</div>' +
        '</div>' +
        '<div class="chs-hint-nine' + (backBetter ? ' is-better' : '') + '">' +
        '<div class="chs-hint-nine-t">' + (backBetter ? '<i class="fas fa-circle-check"></i> ' : '') + backTitle + holesSpan(10, 18) + '</div>' +
        '<div class="chs-hint-nine-stats">' +
        '<div class="chs-hint-stat"><b>' + back.players + '</b><span>' + playersLbl(back.players) + '</span></div>' +
        '<div class="chs-hint-stat"><b>' + fmtAvg(bAvg) + '</b><span>' + avgLbl + '</span></div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<p class="chs-hint-note">' + noteTxt + '</p>' +
        '</div>' +
        '</div>';

    return html;
}

// ==========================================
// БЛОК «СЕЙЧАС НА ПОЛЕ»: ЕДИНЫЙ СПИСОК ИГРОКОВ
// Все игроки всех активных раундов — в одном списке:
// ИМЯ · ЛУНКА · СЧЁТ · СТАРТ. Тап по строке — детали
// (бейджи, gross, счётная карточка, «Продолжить»).
// ==========================================

// Блок перерисовывается в реальном времени, поэтому состояние раскрытия
// строк храним отдельно от DOM и дублируем в localStorage.
var liveWhoOpen = {};
// Последние данные раундов из подписки: перерисовка списка и открытие счётной
// карточки не должны делать повторных запросов к БД.
var cachedRoundsById = {};

function liveWhoStoreKey(roundId, pid) { return 'pestovo_live_who_open_' + roundId + '_' + pid; }

function getLiveWhoOpen(roundId, pid) {
    var k = roundId + ':' + pid;
    if (Object.prototype.hasOwnProperty.call(liveWhoOpen, k)) return liveWhoOpen[k];
    var saved = null;
    try { saved = localStorage.getItem(liveWhoStoreKey(roundId, pid)); } catch (e) {}
    // По умолчанию строка свёрнута: постоянно виден только «кто на поле»
    liveWhoOpen[k] = (saved === '1');
    return liveWhoOpen[k];
}

function setLiveWhoOpen(roundId, pid, open, persist) {
    liveWhoOpen[roundId + ':' + pid] = !!open;
    if (persist !== false) {
        try { localStorage.setItem(liveWhoStoreKey(roundId, pid), open ? '1' : '0'); } catch (e) {}
    }
}

function applyLiveWhoOpenUI(row, open) {
    if (!row) return;
    row.classList.toggle('is-open', !!open);
    var chev = row.querySelector('.lwl-chev');
    if (chev) chev.className = 'fas lwl-chev ' + (open ? 'fa-chevron-up' : 'fa-chevron-down');
    var tg = row.querySelector('.lwl-toggle');
    if (tg) tg.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleLiveWho(roundId, pid) {
    var row = document.querySelector('.lwl-row[data-round-id="' + roundId + '"][data-pid="' + pid + '"]');
    var open = row ? !row.classList.contains('is-open') : !getLiveWhoOpen(roundId, pid);
    setLiveWhoOpen(roundId, pid, open);
    applyLiveWhoOpenUI(row, open);
    if (typeof vib === 'function') vib(15);
}

// Строка доступна с клавиатуры: Enter и Space работают как клик
function liveWhoKey(ev, roundId, pid) {
    if (ev && (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar')) {
        ev.preventDefault();
        toggleLiveWho(roundId, pid);
    }
}

function isMyLiveRound(id, r) {
    if (!r) return false;
    if (currentUser && r.createdBy === currentUser.uid) return true;
    if (currentUser && r.players && r.players[currentUser.uid]) return true;
    var localSoloKey = localStorage.getItem('pestovo_solo_key_' + id);
    var localGroupKey = localStorage.getItem('pestovo_group_key_' + id);
    var localActingAs = localStorage.getItem('pestovo_acting_as_' + id);
    if (localSoloKey && r.accessKey === localSoloKey) return true;
    if (localGroupKey && r.accessKey === localGroupKey) return true;
    if (localActingAs && r.players && r.players[localActingAs]) return true;
    return false;
}

// Строка единого списка «кто сейчас на поле»: имя, текущая лунка, счёт и
// время старта раунда. Детали (бейджи, gross, кнопки) — в раскрытой строке.
function buildLiveWhoRowHTML(id, r, pid, p, players, isMyRound) {
    var order = getRoundOrder(r);

    // Для отображения используем собственные счёта игрока.
    // Если их нет, но есть счёта маркера — показываем их (с пометкой).
    var scores = p.scores || {};
    var hasOwnScores = Object.values(scores).some(function(v) { return parseInt(v) >= 1; });
    var displayScores = scores;
    var markerNote = '';
    if (!hasOwnScores && p.markedBy && players[p.markedBy]) {
        var mkScores = players[p.markedBy].markerScores && players[p.markedBy].markerScores[pid];
        if (mkScores && Object.values(mkScores).some(function(v) { return parseInt(v) >= 1; })) {
            displayScores = mkScores;
            var mkName = privacyDisplayName(players[p.markedBy], p.markedBy) || '';
            markerNote = currentLang === 'en' ? ' (marker: ' + mkName + ')' : ' (маркер: ' + mkName + ')';
        }
    }
    var stats = calcRoundStats(displayScores, p.fieldHcp || 0, p.exactHcp || 0, order);
    var thruText = stats.holesPlayed >= getRoundHoleCount(r)
        ? t('finished_f')
        : t('hole') + ' №' + (stats.currentHole || (parseInt(r.startHole) || 1));

    var open = getLiveWhoOpen(id, pid);
    var panelId = 'live-sc-' + id + '-' + pid;
    var link = 'setup-round.html?round=' + id;
    var soloWord = currentLang === 'en' ? ' · Solo' : ' · Одиночный';

    var details =
        '<div class="lwl-details">' +
        '<div class="lwl-meta">' +
        '<span class="lwl-badges">' + buildPlayerBadges(p, r) + '</span>' +
        '<span class="lwl-extra">Gross: ' + (stats.gross || 0) + ' · ' + (r.format || 'Stroke Play') + (r.mode === 'solo' ? soloWord : '') + markerNote + '</span>' +
        '</div>' +
        '<div class="lwl-actions">' +
        '<button class="btn btn-og btn-sm" onclick="toggleCardScorecard(\'' + panelId + '\',\'' + id + '\')"><i class="fas fa-chevron-down" id="' + panelId + '-icon"></i> <span id="' + panelId + '-txt">' + t('expand_scorecard') + '</span></button>' +
        (isMyRound ? '<a href="' + link + '" class="btn btn-g btn-sm"><i class="fas fa-gamepad"></i> ' + (currentLang === 'en' ? 'Continue' : 'Продолжить') + '</a>' : '') +
        '</div>' +
        '<div id="' + panelId + '" class="card-scorecard-panel hidden"></div>' +
        '</div>';

    return '<div class="lwl-row' + (open ? ' is-open' : '') + (isMyRound ? ' lwl-row-mine' : '') + '" ' +
        'data-round-id="' + id + '" data-pid="' + pid + '" data-panel-id="' + panelId + '">' +
        '<div class="lwl-toggle" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="' + panelId + '" ' +
        'onclick="toggleLiveWho(\'' + id + '\',\'' + pid + '\')" onkeydown="liveWhoKey(event,\'' + id + '\',\'' + pid + '\')">' +
        '<span class="lwl-name"><i class="fas fa-user"></i><span class="lwl-name-txt">' + escapeHtml(privacyDisplayName(p, pid)) + '</span>' +
        (isMyRound ? '<span class="lwl-my"><i class="fas fa-user"></i> ' + t('my_round_tag') + '</span>' : '') +
        '</span>' +
        '<span class="lwl-hole"><i class="fas fa-location-dot"></i> ' + thruText + '</span>' +
        '<span class="lwl-score ' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</span>' +
        '<span class="lwl-start" title="' + (currentLang === 'en' ? 'Round start' : 'Старт раунда') + ' ' + fmtTime(r.startTime) + '"><i class="fas fa-clock"></i> ' + fmtTime(r.startTime) + '</span>' +
        '<i class="fas lwl-chev ' + (open ? 'fa-chevron-up' : 'fa-chevron-down') + '"></i>' +
        '</div>' +
        details +
        '</div>';
}

function loadLiveRounds() {
    var el = document.getElementById('live-rounds');
    if (typeof db === 'undefined') return;

    bindRealtimeValue('home-live-rounds', db.ref('rounds'), function(snap) {
        var data = snap.val() || {};
        var entries = Object.entries(data).filter(function(e) { return e && e[1] && typeof e[1] === 'object' && e[1].status === 'active'; });

        renderCourseHolesStrip(entries);

        if (!el) return;

        if (entries.length === 0) {
            el.innerHTML = '<div class="empty"><i class="fas fa-golf-ball-tee"></i><p>' + t('no_active_players') + '</p><a href="setup-round.html" class="btn btn-g btn-sm" style="margin-top:12px;"><i class="fas fa-play"></i> ' + t('btn_start_game') + '</a></div>';
            return;
        }

        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });

        cachedRoundsById = {};
        entries.forEach(function(e) { cachedRoundsById[e[0]] = e[1]; });

        // Единый список: игроки всех активных раундов, сгруппированные по
        // раундам (свежий старт — выше). Строки свёрнуты по умолчанию:
        // всегда видно имя, лунку и счёт.
        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1];
            var rawPlayers = r.players || {};
            var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(rawPlayers) : rawPlayers;
            var isMyRound = isMyLiveRound(id, r);

            Object.entries(players).forEach(function(pe) {
                var pid = pe[0], p = pe[1];
                if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pid, p && p.name)) return;
                html += buildLiveWhoRowHTML(id, r, pid, p, players, isMyRound);
            });
        });

        el.innerHTML = '<div class="live-who-list">' + html + '</div>';

        // Перерисовка не должна сворачивать уже открытую счётную карточку
        restoreLiveWhoPanels();
    });
}

// Заполнение панели счётной карточки: данные берём из подписки, если они есть
function fillCardScorecardPanel(panelId, roundId, r) {
    var panel = document.getElementById(panelId);
    if (!panel || !r || typeof generateGroupHoleTableHTML !== 'function') return;
    r.roundId = roundId;
    // На главной странице карточка рендерится в «компактном» режиме:
    //   - без табов «Первые 9 / Вторые 9 / Все 18» (показываем все 18 сразу),
    //   - без кликабельности по карточке (открытие профиля игрока недоступно —
    //     имя и так уже видно в строке списка выше),
    //   - без дублирования имени игрока внутри карточки.
    var html = generateGroupHoleTableHTML(r, { compact: true });
    cardPanelHTML[panelId] = html;
    panel.innerHTML = html;
}

// Возвращаем открытые панели счётных карточек после перерисовки списка
function restoreLiveWhoPanels() {
    var rows = document.querySelectorAll('.lwl-row');
    for (var i = 0; i < rows.length; i++) {
        var panelId = rows[i].getAttribute('data-panel-id');
        var roundId = rows[i].getAttribute('data-round-id');
        if (!panelId || !cardPanelOpen[panelId]) continue;
        var panel = document.getElementById(panelId);
        if (!panel) continue;
        panel.classList.remove('hidden');
        var icon = document.getElementById(panelId + '-icon');
        var txt = document.getElementById(panelId + '-txt');
        if (icon) icon.className = 'fas fa-chevron-up';
        if (txt) txt.textContent = t('collapse_scorecard');
        if (cachedRoundsById[roundId]) {
            fillCardScorecardPanel(panelId, roundId, cachedRoundsById[roundId]);
        } else if (cardPanelHTML[panelId]) {
            panel.innerHTML = cardPanelHTML[panelId];
        }
    }
}

// Состояние панелей счётных карточек внутри карточек раундов
var cardPanelOpen = {};
var cardPanelHTML = {};

function toggleCardScorecard(panelId, roundId) {
    var panel = document.getElementById(panelId);
    var icon = document.getElementById(panelId + '-icon');
    var txt = document.getElementById(panelId + '-txt');
    if (!panel) return;

    var isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        panel.classList.remove('hidden');
        cardPanelOpen[panelId] = true;
        if (icon) icon.className = 'fas fa-chevron-up';
        if (txt) txt.textContent = t('collapse_scorecard');

        if (roundId && cachedRoundsById[roundId]) {
            fillCardScorecardPanel(panelId, roundId, cachedRoundsById[roundId]);
            return;
        }
        if (cardPanelHTML[panelId]) {
            panel.innerHTML = cardPanelHTML[panelId];
            return;
        }

        if (roundId && typeof db !== 'undefined') {
            panel.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
            db.ref('rounds/' + roundId).once('value').then(function(sn) {
                var r = sn.val();
                if (r) {
                    fillCardScorecardPanel(panelId, roundId, r);
                } else {
                    panel.innerHTML = '';
                }
            });
        }
    } else {
        panel.classList.add('hidden');
        cardPanelOpen[panelId] = false;
        if (icon) icon.className = 'fas fa-chevron-down';
        if (txt) txt.textContent = t('expand_scorecard');
    }
}

// ==========================================
// БЛОК «ПОСЛЕДНИЕ РЕЗУЛЬТАТЫ»: список раундов в одну строку
// Внешний вид совпадает с «Сейчас на поле»: каждая завершённая карточка —
// одна строка (дата · игроки · итог), по тапу разворачивается с деталями,
// счётной карточкой и кнопками.
// ==========================================
var recentRoundOpen = {};

function recentRowStoreKey(id) { return 'pestovo_recent_open_' + id; }

function getRecentOpen(id) {
    if (Object.prototype.hasOwnProperty.call(recentRoundOpen, id)) return recentRoundOpen[id];
    var saved = null;
    try { saved = localStorage.getItem(recentRowStoreKey(id)); } catch (e) {}
    recentRoundOpen[id] = (saved === '1');
    return recentRoundOpen[id];
}

function setRecentOpen(id, open, persist) {
    recentRoundOpen[id] = !!open;
    if (persist !== false) {
        try { localStorage.setItem(recentRowStoreKey(id), open ? '1' : '0'); } catch (e) {}
    }
}

function applyRecentOpenUI(row, open) {
    if (!row) return;
    row.classList.toggle('is-open', !!open);
    var chev = row.querySelector('.lwl-chev');
    if (chev) chev.className = 'fas lwl-chev ' + (open ? 'fa-chevron-up' : 'fa-chevron-down');
    var tg = row.querySelector('.lwl-toggle');
    if (tg) tg.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function toggleRecentRound(id) {
    var row = document.querySelector('.recent-row[data-round-id="' + id + '"]');
    var open = row ? !row.classList.contains('is-open') : !getRecentOpen(id);
    setRecentOpen(id, open);
    applyRecentOpenUI(row, open);
    if (typeof vib === 'function') vib(15);
}

function recentKey(ev, id) {
    if (ev && (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar')) {
        ev.preventDefault();
        toggleRecentRound(id);
    }
}

function buildRecentRowHTML(id, r) {
    var rawPlayers = r.players || {};
    var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(rawPlayers) : rawPlayers;
    var order = getRoundOrder(r);
    var soloWord = currentLang === 'en' ? ' · Solo' : ' · Одиночный';
    var completedWord = currentLang === 'en' ? 'Completed' : 'Завершён';
    var dateStr = fmtDate(r.completedAt || r.createdAt);

    var playerNames = [];
    var pHtml = '';
    Object.entries(players).forEach(function(pe) {
        var pid = pe[0], p = pe[1], scores = p.scores || {};
        var playerBadges = buildPlayerBadges(p, r);
        var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, order);
        playerNames.push(privacyDisplayName(p, pid));

        // Имена игроков уже перечислены в свёрнутой строке раунда выше,
        // поэтому в развёрнутых деталях не дублируем их — оставляем ТИ, HCP и результат.
        pHtml += '<div class="round-p" style="align-items:flex-start;">' +
            '<div style="flex:1;">' +
            '<div class="round-p-n">' + playerBadges + '</div>' +
            '<div style="font-size:12px;color:var(--muted);margin-top:2px;">Gross: ' + (stats.gross || 0) + ' · Stableford: ' + stats.stablefordField + '</div></div>' +
            '<div style="text-align:right;">' +
            '<div class="round-p-score ' + scoreClass(stats.toPar) + '" style="font-size:16px;">' + fmtScore(stats.toPar) + '</div>' +
            '</div></div>';
    });

    var panelId = 'recent-sc-' + id;
    var open = getRecentOpen(id);
    var namesStr = playerNames.length ? playerNames.join(', ') : '—';

    // ВАЖНО: блок «ТИ: ...» уровня раунда здесь НЕ выводится — ТИ уже
    // показан у каждого игрока (бейдж buildPlayerBadges: ТИ · точн. HCP · пол. HCP).
    // Раньше дублирующая строка «ТИ: Синий» выводилась дважды подряд.
    var details =
        '<div class="lwl-details">' +
        '<div class="lwl-recent-players">' + pHtml + '</div>' +
        '<div class="lwl-actions">' +
        '<button class="btn btn-og btn-sm" onclick="toggleCardScorecard(\'' + panelId + '\',\'' + id + '\')"><i class="fas fa-chevron-down" id="' + panelId + '-icon"></i> <span id="' + panelId + '-txt">' + t('expand_scorecard') + '</span></button>' +
        '<button class="btn btn-g btn-sm" onclick="exportRoundPNG(\'' + id + '\')"><i class="fas fa-image"></i> ' + t('share_card') + '</button>' +
        '</div>' +
        '<div id="' + panelId + '" class="card-scorecard-panel hidden" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"></div>' +
        '</div>';

    return '<div class="lwl-row recent-row' + (open ? ' is-open' : '') + '" data-round-id="' + id + '">' +
        '<div class="lwl-toggle" role="button" tabindex="0" aria-expanded="' + (open ? 'true' : 'false') + '" ' +
        'onclick="toggleRecentRound(\'' + id + '\')" onkeydown="recentKey(event,\'' + id + '\')">' +
        '<span class="lwl-name"><i class="fas fa-flag-checkered"></i><span class="lwl-name-txt">' + dateStr + '</span></span>' +
        '<span class="lwl-hole"><i class="fas fa-user"></i> ' + escapeHtml(namesStr) + '</span>' +
        '<span class="lwl-score"><span class="tn-status tn-d">' + completedWord + '</span></span>' +
        '<span class="lwl-start">' + (r.format || 'Stroke Play') + '</span>' +
        '<i class="fas lwl-chev ' + (open ? 'fa-chevron-up' : 'fa-chevron-down') + '"></i>' +
        '</div>' +
        details +
        '</div>';
}

function loadRecentResults() {
    var el = document.getElementById('recent-results');
    if (!el || typeof db === 'undefined') return;

    bindRealtimeValue('home-recent-results', db.ref('rounds'), function(snap) {
        var data = snap.val() || {};
        var entries = Object.entries(data).filter(function(e) { return e && e[1] && typeof e[1] === 'object' && e[1].status === 'completed'; });

        if (entries.length === 0) {
            el.innerHTML = '<div class="empty"><i class="fas fa-clock"></i><p>' + t('no_completed') + '</p></div>';
            return;
        }

        entries.sort(function(a, b) {
            var timeA = a[1].completedAt || a[1].createdAt || 0;
            var timeB = b[1].completedAt || b[1].createdAt || 0;
            return timeB - timeA;
        });

        entries = entries.slice(0, 5);

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], r = e[1];
            html += buildRecentRowHTML(id, r);
        });

        el.innerHTML = '<div class="live-who-list">' + html + '</div>';

        // Восстанавливаем уже открытые панели счётных карточек после перерисовки
        restoreLiveWhoPanels();
    });
}

function loadClubStats() {
    var el = document.getElementById('club-stats');
    if (!el) return;

    Promise.all([db.ref('rounds').once('value'), db.ref('users').once('value')]).then(function(snaps) {
        var rounds = snaps[0].val() || {};
        var users = snaps[1].val() || {};
        var totalRounds = Object.keys(rounds).length;
        var totalPlayers = Object.keys(users).filter(function(uid) {
            var u = users[uid];
            return !(u && typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, u.name));
        }).length;
        var completedRounds = 0, activeRounds = 0;
        var birdies = 0, eagles = 0, pars = 0, bogeys = 0;
        var best = Infinity, totalHolesPlayed = 0;

        Object.values(rounds).forEach(function(r) {
            if (r.status === 'completed') completedRounds++;
            if (r.status === 'active') activeRounds++;
            Object.values(r.players || {}).forEach(function(p) {
                // Удалённые и навсегда заблокированные демо-игроки не учитываются
                if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(null, p && p.name)) return;
                var scores = p.scores || {};
                var gross = 0, holesPlayed = 0;
                Object.entries(scores).forEach(function(se) {
                    var h = se[0], s = parseInt(se[1]) || 0;
                    if (s <= 0) return;
                    gross += s; holesPlayed++; totalHolesPlayed++;
                    var d = s - holePar(h);
                    if (d <= -2) eagles++; else if (d === -1) birdies++; else if (d === 0) pars++; else if (d === 1) bogeys++;
                });
                if (holesPlayed === 18 && gross > 0 && gross < best) best = gross;
            });
        });

        var lTotalRounds = currentLang === 'en' ? 'Total Rounds' : 'Всего раундов';
        var lActiveRounds = currentLang === 'en' ? 'Currently Playing' : 'Сейчас играют';
        var lCompletedRounds = currentLang === 'en' ? 'Completed Rounds' : 'Завершено';
        var lPlayers = currentLang === 'en' ? 'Total Players' : 'Игроков';
        var lBestGross = currentLang === 'en' ? 'Best Gross (18h)' : 'Лучший Gross (18л)';
        var lHolesPlayed = currentLang === 'en' ? 'Holes Played' : 'Лунок сыграно';

        el.innerHTML =
            '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">' + totalRounds + '</div><div class="stat-l">' + lTotalRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-circle-play"></i><div class="stat-n">' + activeRounds + '</div><div class="stat-l">' + lActiveRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-check-circle"></i><div class="stat-n">' + completedRounds + '</div><div class="stat-l">' + lCompletedRounds + '</div></div>' +
            '<div class="stat"><i class="fas fa-users"></i><div class="stat-n">' + totalPlayers + '</div><div class="stat-l">' + lPlayers + '</div></div>' +
            '<div class="stat"><i class="fas fa-star"></i><div class="stat-n">' + (best < Infinity ? best : '—') + '</div><div class="stat-l">' + lBestGross + '</div></div>' +
            '<div class="stat"><i class="fas fa-fire"></i><div class="stat-n">' + birdies + '</div><div class="stat-l">Birdies</div></div>' +
            '<div class="stat"><i class="fas fa-bolt"></i><div class="stat-n">' + eagles + '</div><div class="stat-l">Eagles</div></div>' +
            '<div class="stat"><i class="fas fa-circle-check"></i><div class="stat-n">' + pars + '</div><div class="stat-l">Pars</div></div>' +
            '<div class="stat"><i class="fas fa-circle-xmark"></i><div class="stat-n">' + bogeys + '</div><div class="stat-l">Bogeys</div></div>' +
            '<div class="stat"><i class="fas fa-golf-ball-tee"></i><div class="stat-n">' + totalHolesPlayed + '</div><div class="stat-l">' + lHolesPlayed + '</div></div>';
    });
}

// Перерисовка блоков главной после изменения настроек приватности имён.
// bindRealtimeValue кэширует последний snapshot, поэтому повторный вызов
// loadLiveRounds()/loadRecentResults() перерисовывает из него же.
function renderPrivacySensitiveHome() {
    if (typeof loadLiveRounds === 'function') loadLiveRounds();
    if (typeof loadRecentResults === 'function') loadRecentResults();
}
