// js/admin-groups.js — «Группы, которые сейчас играют / контроль темпа» и
// вкладка «Раунды» админки (список, фильтр периода, детали, удаление);
// вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули).
// Внешние зависимости: runtime-глобалы (db, toast, t, currentLang,
// escapeHtml) и safeStorageRemove из admin.js (загружен раньше — вызов
// происходит только из UI-событий). Вызовы loadAdmGroups/loadAdmRounds/
// renderAdmGroups из admin.js — typeof-guarded. Грузится в admin.html
// рядом с admin.js.

// ==========================================
// ГРУППЫ, КОТОРЫЕ СЕЙЧАС ИГРАЮТ / КОНТРОЛЬ ТЕМПА
// ==========================================
var adminGroupsSnapshot = null;
var adminGroupsTimer = null;

function loadAdmGroups() {
    if (typeof db === 'undefined') return;
    bindRealtimeValue('admin-groups', db.ref('rounds'), function(snapshot) {
        adminGroupsSnapshot = snapshot;
        renderAdmGroups();
    });
    if (!adminGroupsTimer) {
        adminGroupsTimer = setInterval(function() { renderAdmGroups(); }, 30000);
    }
}

// Компактный список групп: одна строка на группу (свёрнуто по умолчанию),
// детали — в раскрывающейся панели. Сортировка: отстающие / старт / лунка.
var admGroupsExpanded = {};
var admGroupsSortMode = 'delay';

// ── ДЕЙСТВИЯ С РАУНДОМ ИЗ АДМИНКИ ──
// Раньше эти кнопки вызывали roundResume(id, null) и
// roundForceFinishPlayer(id, pid, null) без данных раунда. Пауза при этом
// обнулялась (тайминги прыгали), а «завершить одного игрока» закрывало ВЕСЬ
// раунд, потому что список участников был пустым. Теперь каждое действие
// сначала читает актуальную карточку раунда.
function admRoundName() {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    return isEn ? 'Admin' : 'Администратор';
}

function admPauseRound(id) {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    readRoundSnapshot(id, null).then(function(r) {
        if (!r) { toast(isEn ? 'Round not found' : 'Раунд не найден', 'error'); return; }
        if (typeof openRoundPauseModal === 'function') openRoundPauseModal(id, r, function() { renderAdmGroups(); renderAdmRounds(admRoundsLastData); });
    });
}

function admResumeRound(id) {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    readRoundSnapshot(id, null).then(function(r) {
        if (!r) { toast(isEn ? 'Round not found' : 'Раунд не найден', 'error'); return; }
        return roundResume(id, r, admRoundName(), (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : '');
    }).then(function(res) {
        if (res && res.resumed === false) {
            toast(isEn ? 'The round is not paused' : 'Раунд и так не на паузе', 'info');
        } else {
            toast(isEn ? '✅ Round resumed — timings continue from the pause moment' : '✅ Раунд возобновлён — тайминги продолжаются с момента паузы', 'success');
        }
        renderAdmGroups();
        renderAdmRounds(admRoundsLastData);
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function admForceFinishOnePlayer(id, pid) {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var reason = isEn ? 'Force finished by administrator' : 'Завершено администратором';
    if (!confirm(isEn
        ? 'Finish this player\u2019s round? His scores are kept, other players continue.'
        : 'Завершить раунд этого игрока? Его счёта сохранятся, остальные продолжат игру.')) return;
    // (roundId, playerId, roundData, reason, finisherName) — данные раунда
    // дочитает сама утилита.
    roundForceFinishPlayer(id, pid, null, reason, admRoundName()).then(function() {
        toast(isEn ? '✅ Player finished' : '✅ Игрок завершён', 'success');
        renderAdmGroups();
        renderAdmRounds(admRoundsLastData);
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function admForceFinishAllPlayers(id) {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var reason = isEn ? 'Closed by administrator' : 'Закрыто администратором';
    if (!confirm(isEn
        ? 'Force finish the whole round? Every unsubmitted card is closed with the current scores.'
        : 'Принудительно завершить весь раунд? Все несданные карточки будут закрыты с текущими счетами.')) return;
    roundForceFinishAll(id, null, reason, admRoundName()).then(function() {
        toast(isEn ? '✅ Round finished' : '✅ Раунд завершён', 'success');
        renderAdmGroups();
        renderAdmRounds(admRoundsLastData);
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function admGroupsSort(v) {
    admGroupsSortMode = v || 'delay';
    renderAdmGroups();
}

function admToggleGroupRow(id) {
    admGroupsExpanded[id] = !admGroupsExpanded[id];
    renderAdmGroups();
}

function admGroupsExpandAll(expand) {
    var data = adminGroupsSnapshot && typeof adminGroupsSnapshot.val === 'function'
        ? (adminGroupsSnapshot.val() || {}) : {};
    Object.keys(data).forEach(function(id) { admGroupsExpanded[id] = !!expand; });
    renderAdmGroups();
}

function renderAdmGroups() {
    var el = document.getElementById('adm-groups');
    if (!el) return;
    var sortSel = document.getElementById('adm-groups-sort');
    if (sortSel && sortSel.value) admGroupsSortMode = sortSel.value;
    var data = adminGroupsSnapshot && typeof adminGroupsSnapshot.val === 'function'
        ? (adminGroupsSnapshot.val() || {}) : {};
    var groups = Object.entries(data).filter(function(entry) {
        var roundData = entry[1];
        return roundData && roundData.status === 'active' && roundData.mode === 'group' &&
            getPaceParticipants(roundData).length > 1;
    });

    if (!groups.length) {
        el.innerHTML = '<div class="empty"><i class="fas fa-users-slash"></i><p>' + t('admin_no_groups') + '</p></div>';
        return;
    }

    var metricsCache = {};
    groups.forEach(function(entry) {
        try { metricsCache[entry[0]] = getRoundPaceMetrics(entry[1]); } catch (e) { metricsCache[entry[0]] = { overallDelay: 0 }; }
    });
    var curHoleOf = function(entry) {
        var m = metricsCache[entry[0]] || {};
        var rd = entry[1] || {};
        return m.currentHole || ((m.order && m.order.length) ? m.order[0] : rd.startHole || 1);
    };
    if (admGroupsSortMode === 'start') {
        groups.sort(function(a, b) { return (a[1].startTime || 0) - (b[1].startTime || 0); });
    } else if (admGroupsSortMode === 'hole') {
        groups.sort(function(a, b) { return curHoleOf(a) - curHoleOf(b); });
    } else {
        // «Сначала отстающие»: по величине отставания от графика.
        groups.sort(function(a, b) {
            var delayA = (metricsCache[a[0]] && metricsCache[a[0]].overallDelay) || 0;
            var delayB = (metricsCache[b[0]] && metricsCache[b[0]].overallDelay) || 0;
            return delayB - delayA;
        });
    }

    var html = '';
    groups.forEach(function(entry, index) {
        var rid = entry[0];
        var roundData = entry[1];
        var metrics = metricsCache[rid] || {};
        var state = paceStatus(metrics.overallDelay);
        var participants = getPaceParticipants(roundData);
        var names = participants.map(function(item) {
            var pTee = (item.player && item.player.tee) || roundData.tee || 'wh';
            return escapeHtml(item.player.name || t('player')) + ' ' + fmtTeePill(pTee);
        }).join(' · ');
        var currentHole = curHoleOf(entry);
        var noTimingNote = !metrics.hasTimingData
            ? '<div class="pace-note">' + t('pace_pending') + '</div>' : '';
        var groupLabel = currentLang === 'en' ? 'Group ' + (index + 1) : 'Группа ' + (index + 1);
        var expanded = !!admGroupsExpanded[rid];

        // Компактная строка: название, лунка, отставание, статус.
        html += '<div class="list-item adm-group-row pace-state-' + state.key + '" style="--pace-color:' + state.color + ';padding:9px 12px;gap:8px;cursor:pointer;border-left:3px solid ' + state.color + ';" onclick="admToggleGroupRow(\'' + rid + '\')">';
        html += '<i class="fas ' + (expanded ? 'fa-chevron-up' : 'fa-chevron-down') + '" style="color:var(--gold);font-size:11px;"></i>';
        html += '<span class="live-dot" style="width:7px;height:7px;"></span>';
        html += '<b style="color:var(--white);font-size:13px;">' + groupLabel + '</b>';
        // В игре считаются только те, кто ещё не сдал карточку.
        var stillPlaying = (metrics.activeParticipants && metrics.activeParticipants.length) || participants.length;
        html += '<span style="font-size:12px;color:var(--muted);">' + stillPlaying + '/' + participants.length + ' ' + (currentLang === 'en' ? 'pl.' : 'игр.') + ' · №' + currentHole + '</span>';
        html += '<b class="admin-group-delay" style="font-size:13px;">' + formatPaceDelta(metrics.overallDelay) + '</b>';
        html += '<span class="admin-group-status" style="margin-left:auto;">' + state.label + '</span>';
        html += '</div>';

        // Раскрытая панель: состав, метрики, тайминги лунок.
        html += '<div class="' + (expanded ? '' : 'hidden') + '" style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px;padding:10px 12px;margin:-6px 0 6px;">';
        html += '<div class="admin-group-card pace-state-' + state.key + '" style="--pace-color:' + state.color + ';margin:0;border:none;background:transparent;padding:0;">';
        html += '<div class="admin-group-players" style="margin-bottom:8px;"><i class="fas fa-users"></i> ' + names + '</div>';
        html += '<div class="admin-group-meta">';
        html += '<div><span>' + t('admin_start_time') + '</span><b>' + fmtTime(roundData.startTime) + '</b></div>';
        html += '<div><span>' + t('admin_start_hole') + '</span><b>№' + (roundData.startHole || 1) + '</b></div>';
        html += '<div><span>' + t('admin_current_hole') + '</span><b>№' + currentHole + '</b></div>';
        html += '<div><span>' + t('tee_select') + '</span><b>' + fmtRoundTeePills(roundData) + '</b></div>';
        html += '<div><span>' + t('admin_total_delay') + '</span><b class="admin-group-delay">' + formatPaceDelta(metrics.overallDelay) + '</b></div>';
        html += '</div>';
        html += '<div class="admin-group-timeline-title"><i class="fas fa-list-ol"></i> ' + t('admin_hole_timings') + '</div>';
        html += '<div class="pace-timeline">' + renderPaceHoleTimeline(metrics) + '</div>';
        html += noTimingNote;
        html += '</div></div>';
    });

    el.innerHTML = html;
}

var adminAutoStartTimer = null;

// Последний снимок раундов: нужен, чтобы смена периода (пресет/даты)
// перерисовывала список без повторного чтения базы.
var admRoundsLastData = {};
var admRoundsDateFilter = null;

// Фильтр периода во вкладке «Раунды» (поля adm-date-from / adm-date-to,
// пресеты и сводка «показано N из M» уже есть в admin.html). Функция
// создаёт фильтр при первом обращении и переиспользует его дальше —
// её вызывают loadAdmRounds() и renderAdmRounds().
function ensureAdmRoundsDateFilter() {
    if (admRoundsDateFilter) return admRoundsDateFilter;
    if (typeof initDateRangeFilter !== 'function') return null;
    admRoundsDateFilter = initDateRangeFilter({
        key: 'adm-rounds',
        fromId: 'adm-date-from',
        toId: 'adm-date-to',
        presetsId: 'adm-date-presets',
        resetId: 'adm-date-reset',
        hintId: 'adm-date-hint',
        summaryId: 'adm-rounds-summary',
        onChange: function() { renderAdmRounds(admRoundsLastData || {}); }
    });
    return admRoundsDateFilter;
}

function loadAdmRounds() {
    if (typeof db === 'undefined' || !db) return;
    ensureAdmRoundsDateFilter();
    // Одна подписка на раунды: повторные вызовы (фильтр по датам, смена языка,
    // удаление/создание раунда) только перерисовывают список по последнему снимку.
    bindRealtimeValue('admin-rounds', db.ref('rounds'), function(sn) {
        var data = sn.val() || {};
        admRoundsLastData = data;
        // Автозакрытие вчерашних незавершённых раундов («завершён автоматически»)
        if (typeof sweepStaleRounds === 'function') data = sweepStaleRounds(data) || {};
        // Автостарт турнира: раунды, созданные протоколом заранее, открываются
        // в момент старта (совпадение даты и времени) — статус active пишется
        // в базу, а их турнир переходит из «предстоящий» в «активный».
        if (typeof pestovoAutoStartRounds === 'function') {
            try { pestovoAutoStartRounds(data, { notify: true, silent: true }); } catch (e) { console.warn("[silent]", e); }
        }
        renderAdmRounds(data);
    });
    // Таймер автостарта: турнир стартует по времени, даже если в базе
    // ничего не меняется и новые снимки раундов не приходят.
    if (!adminAutoStartTimer) {
        adminAutoStartTimer = setInterval(function() {
            if (typeof db === 'undefined' || !db) return;
            db.ref('rounds').once('value').then(function(sn) {
                var data = sn.val() || {};
                if (typeof pestovoAutoStartRounds === 'function') {
                    pestovoAutoStartRounds(data, { notify: true, silent: true });
                }
            }).catch(function() {});
        }, 30000);
    }
}

// Компактный список раундов: одна строка на раунд, детали — в раскрывающейся
// панели. По умолчанию всё свёрнуто; состояние запоминается при обновлениях.
var admRoundsExpanded = {};

function admToggleRoundRow(id) {
    admRoundsExpanded[id] = !admRoundsExpanded[id];
    var panel = document.getElementById('adm-r-' + id);
    var chev = document.getElementById('adm-r-chev-' + id);
    if (panel) panel.classList.toggle('hidden', !admRoundsExpanded[id]);
    if (chev) chev.className = 'fas ' + (admRoundsExpanded[id] ? 'fa-chevron-up' : 'fa-chevron-down');
}

function admRoundsExpandAll(expand) {
    document.querySelectorAll('#adm-rounds [id^="adm-r-"]').forEach(function(panel) {
        var id = panel.id.replace(/^adm-r-/, '');
        if (!id || id.indexOf('chev-') === 0) return;
        admRoundsExpanded[id] = !!expand;
        panel.classList.toggle('hidden', !expand);
        var chev = document.getElementById('adm-r-chev-' + id);
        if (chev) chev.className = 'fas ' + (expand ? 'fa-chevron-up' : 'fa-chevron-down');
    });
}

function admRoundDetailsHtml(id, r) {
    var html = '';
    var tnName = (typeof roundTournamentName === 'function') ? roundTournamentName(r) : (r.tournamentName || '');
    if (tnName) {
        html += '<div style="font-size:12px;color:var(--gold);margin-bottom:8px;"><i class="fas fa-trophy"></i> ' + escapeHtml(tnName) +
            (r.groupNo ? ' · ' + (currentLang === 'en' ? 'Group ' : 'Группа ') + r.groupNo : '') + '</div>';
    }
    var plist = Object.entries(r.players || {});
    if (!plist.length) {
        html += '<div style="font-size:12px;color:var(--muted);">' + (currentLang === 'en' ? 'No players' : 'Нет игроков') + '</div>';
        return html;
    }
    if (r.status === 'active') {
        var isEn = currentLang === 'en';
        var isPaused = !!r.paused;
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.06);">';
        if (isPaused) {
            html += '<button type="button" class="btn btn-g btn-sm" onclick="admResumeRound(\'' + id + '\')"><i class="fas fa-play"></i> ' + (isEn ? 'Resume' : 'Возобновить') + '</button>';
        } else {
            html += '<button type="button" class="btn btn-ol btn-sm" onclick="admPauseRound(\'' + id + '\')"><i class="fas fa-pause"></i> ' + (isEn ? 'Pause Round' : 'Пауза') + '</button>';
        }
        html += '<button type="button" class="btn btn-ol btn-sm" onclick="admForceFinishAllPlayers(\'' + id + '\')"><i class="fas fa-forward"></i> ' + (isEn ? 'Force Finish All' : 'Завершить принудительно (всех)') + '</button>';
        html += '</div>';
    }
    var order = [];
    try { order = (typeof getRoundOrder === 'function') ? getRoundOrder(r) : []; } catch (eOrd) { order = []; }
    html += '<div style="display:flex;flex-direction:column;gap:4px;">';
    plist.forEach(function(pe) {
        var p = pe[1] || {};
        var stats = { gross: 0, toPar: null, net: 0, stablefordField: 0, holesPlayed: 0 };
        try {
            if (typeof calcRoundStats === 'function') {
                stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order) || stats;
            }
        } catch (eSt) { console.warn("[silent]", eSt); }
        var pTee = (p && p.tee) || r.tee || 'wh';
        var isFin = typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(r, pe[0]);
        html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:8px;">';
        html += '<span style="color:var(--white);font-weight:600;flex:1;min-width:120px;">' + escapeHtml(p.name || t('player')) + '</span> ';
        if (isFin) {
            html += '<span style="color:#2ecc71;font-size:11px;font-weight:700;"><i class="fas fa-check-circle"></i> ' + (currentLang === 'en' ? 'Finished' : 'Финиш') + '</span> ';
        } else if (r.status === 'active') {
            html += '<button type="button" class="btn btn-ol btn-sm" style="padding:2px 6px;font-size:10px;" onclick="admForceFinishOnePlayer(\'' + id + '\',\'' + pe[0] + '\')" title="' + (currentLang === 'en' ? 'Force finish player' : 'Завершить игрока') + '"><i class="fas fa-flag-checkered"></i></button> ';
        }
        html += fmtTeePill(pTee);
        html += '<span style="color:var(--muted);">HCP ' + (p.exactHcp != null ? fmtExactHcp(p.exactHcp) : '—') + '</span>';
        html += '<span style="color:var(--muted);">Gross <b style="color:var(--white);">' + (stats.gross || 0) + '</b></span>';
        html += '<span class="' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</span>';
        html += '<span style="color:var(--muted);">Net <b style="color:var(--white);">' + (stats.net || 0) + '</b></span>';
        html += '<span style="color:var(--muted);">Stbl <b style="color:var(--gold);">' + (stats.stablefordField || 0) + '</b></span>';
        html += '<span style="color:var(--muted);font-size:11px;">' + (stats.holesPlayed || 0) + '/18</span>';
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function renderAdmRounds(data) {
    var el = document.getElementById('adm-rounds');
    if (!el) return;

    var dateFilter = ensureAdmRoundsDateFilter();
    var range = dateFilter ? dateFilter.getRange() : { active: false, from: null, to: null, invalid: false };

    var allEntries = Object.entries(data).filter(function(e) { return e && e[1] && typeof e[1] === 'object'; });
    var totalRounds = allEntries.length;
    var entries = filterEntriesByDateRange(allEntries, range);
    entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });

    if (dateFilter) dateFilter.renderSummary(entries.length, totalRounds);

    if (!entries.length) {
        var emptyText = range.active
            ? (currentLang === 'en' ? 'No rounds in the selected period' : 'Нет раундов за выбранный период')
            : (currentLang === 'en' ? 'No rounds' : 'Нет раундов');
        el.innerHTML = '<div class="empty"><i class="fas fa-flag"></i><p>' + emptyText + '</p></div>';
        return;
    }

    var playersStr = currentLang === 'en' ? ' pl.' : ' игр.';
    var soloStr = currentLang === 'en' ? ' · Solo' : ' · Соло';

    var html = '';
    entries.forEach(function(e) {
        var id = e[0], r = e[1], pc = Object.keys(r.players || {}).length;
        var expanded = !!admRoundsExpanded[id];
        var badge = (typeof buildRoundStatusBadgeHTML === 'function')
            ? buildRoundStatusBadgeHTML(r)
            : (r.status === 'active'
                ? '<span class="tn-status tn-a"><span class="live-dot" style="width:6px;height:6px;"></span> Live</span>'
                : (r.status === 'scheduled'
                    ? '<span class="tn-status tn-u"><i class="fas fa-hourglass-half"></i> ' +
                      (currentLang === 'en' ? 'Scheduled' : 'Запланирован') + '</span>'
                    : ((typeof buildRoundCompletedBadgeHTML === 'function')
                        ? buildRoundCompletedBadgeHTML(r)
                        : '<span class="tn-status tn-d">' + (currentLang === 'en' ? 'Completed' : 'Завершён') + '</span>')));

        html += '<div class="list-item adm-round-row" style="padding:9px 12px;flex-wrap:wrap;gap:8px;cursor:pointer;" onclick="admToggleRoundRow(\'' + id + '\')">';
        html += '<i id="adm-r-chev-' + id + '" class="fas ' + (expanded ? 'fa-chevron-up' : 'fa-chevron-down') + '" style="color:var(--gold);font-size:11px;"></i>';
        html += '<div style="flex:1;min-width:180px;font-size:12.5px;"><strong style="color:var(--white);">' +
                // Дату показываем ту же, по которой работает фильтр периода (старт раунда).
                fmtDate(getRoundFilterTs(r)) + '</strong> <span style="color:var(--muted);">' + fmtTime(r.startTime) + ' · ' + pc + playersStr + ' · ' +
                escapeHtml((typeof pestovoRoundFormatBadge === 'function') ? pestovoRoundFormatBadge(r, 'Stroke') : (r.format || 'Stroke')) + (r.mode === 'solo' ? soloStr : '') + '</span> ' + badge + '</div>';
        html += '<div style="display:flex;gap:6px;" onclick="event.stopPropagation()">';
        if (r.status === 'completed') {
            html += '<button class="btn btn-og btn-sm" onclick="downloadScorecard(\'' + id + '\')"><i class="fas fa-download"></i></button>';
        }
        html += '<button class="btn btn-r btn-sm" onclick="deleteRound(\'' + id + '\')"><i class="fas fa-trash"></i></button>';
        html += '</div></div>';
        html += '<div id="adm-r-' + id + '" class="' + (expanded ? '' : 'hidden') + '" style="background:rgba(255,255,255,0.02);border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px;padding:10px 12px;margin:-6px 0 6px;">' +
            admRoundDetailsHtml(id, r) + '</div>';
    });

    el.innerHTML = html;
}

function deleteRound(id) {
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(currentLang === 'en' ? 'Delete round?' : 'Удалить раунд?')) return;

    db.ref('rounds/' + id).once('value').then(function(sn) {
        var r = sn.val();
        if (r && r.players) {
            Object.keys(r.players).forEach(function(pid) {
                db.ref('users/' + pid + '/history').once('value').then(function(hSn) {
                    // Всё считаем из ОДНОГО снимка: повторное чтение сразу после
                    // remove() возвращало бы ещё не удалённые записи из кэша и
                    // портило bestGross/bestStableford.
                    var hist = hSn.val() || {};
                    var updates = {};
                    var remaining = [];
                    Object.entries(hist).forEach(function(he) {
                        if (he[1] && he[1].roundId === id) {
                            updates['users/' + pid + '/history/' + he[0]] = null;
                        } else if (he[1]) {
                            remaining.push(he[1]);
                        }
                    });
                    var bestG = null, bestS = null;
                    remaining.forEach(function(item) {
                        if (item.holes === 18 && item.gross) {
                            if (bestG === null || item.gross < bestG) bestG = item.gross;
                        }
                        if (item.holes === 18 && item.stablefordField) {
                            if (bestS === null || item.stablefordField > bestS) bestS = item.stablefordField;
                        }
                    });
                    updates['users/' + pid + '/roundsPlayed'] = remaining.length;
                    updates['users/' + pid + '/bestGross'] = bestG;
                    updates['users/' + pid + '/bestStableford'] = bestS;
                    db.ref().update(updates).catch(function() {});
                }).catch(function() {});
            });
        }

        db.ref('rounds/' + id).remove();
        db.ref('markers/' + id).remove();
        db.ref('markerAssignments/' + id).remove();
        toast(currentLang === 'en' ? 'Round deleted' : 'Раунд удалён', 'info');
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// ==========================================
// УДАЛЕНИЕ ДАННЫХ: РАУНДЫ / ИГРОКИ / ВСЁ
// ==========================================
// Причина бага «нажимаю удалить все данные — игроки не удаляются»:
// database.rules.json разрешает запись только в ДОЧЕРНИЕ узлы
// (users/$uid, rounds/$rid, tournaments/$id, …) и запрещает запись в сами
// ветки. Прежний код делал один атомарный мульти-path update
// ({users:null, rounds:null, …}); сервер проверяет права на КАЖДЫЙ путь и
// отклоняет весь запрос целиком — поэтому не удалялось вообще ничего.
// Теперь очистка идёт в несколько слоёв:
//   1) Cloud Function wipeAllData (Admin SDK) — если развёрнута: удаляет всё
//      на сервере, правила БД ей не мешают;
//   2) иначе — из браузера: сначала ветка целиком, а если правила не
//      разрешают — каждый ребёнок отдельно (users/<uid>, usersPublic/<uid>),
//      на что прав у администратора/мастера достаточно;
//   3) всё, что удалить не удалось, честно перечисляется в тосте — никаких
//      «Все данные удалены» при живых игроках.
var WIPE_ALL_DB_BRANCHES = [
    'users', 'usersPublic', 'rounds', 'tournaments', 'markers',
    'markerAssignments', 'alerts', 'protocols', 'broadcasts', 'reactions'
];

// «Удалить все раунды» — раунды и всё, что к ним привязано, без игроков.
var WIPE_ROUNDS_DB_BRANCHES = ['rounds', 'markers', 'markerAssignments', 'alerts', 'protocols'];

var WIPE_PATH_LABELS = {
    users: { ru: 'игроки', en: 'players' },
    usersPublic: { ru: 'публичные профили', en: 'public profiles' },
    rounds: { ru: 'раунды', en: 'rounds' },
    tournaments: { ru: 'турниры', en: 'tournaments' },
    markers: { ru: 'маркеры', en: 'markers' },
    markerAssignments: { ru: 'назначения маркеров', en: 'marker assignments' },
    alerts: { ru: 'вызовы', en: 'alerts' },
    protocols: { ru: 'протоколы', en: 'protocols' },
    broadcasts: { ru: 'анонсы', en: 'broadcasts' },
    reactions: { ru: 'реакции', en: 'reactions' }
};

function wipeIsEn() {
    return (typeof currentLang !== 'undefined' && currentLang === 'en');
}

// Есть ли серверная Firebase-сессия. В «локальном» входе по 55555 (когда
// callable недоступна) auth.currentUser пуст, и любая запись в базу будет
// отклонена правилами — честно сообщаем об этом до начала очистки.
function wipeHasServerSession() {
    try {
        if (typeof auth !== 'undefined' && auth && !auth.currentUser) return false;
    } catch (e) { console.warn("[silent]", e); }
    return true;
}

function wipeCurrentUid() {
    try {
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) return currentUser.uid;
    } catch (e) { console.warn("[silent]", e); }
    try {
        if (typeof auth !== 'undefined' && auth && auth.currentUser && auth.currentUser.uid) return auth.currentUser.uid;
    } catch (e) { console.warn("[silent]", e); }
    return null;
}

// Свой аккаунт администратора (не мастер) сохраняем: удалив его, админ
// потерял бы доступ к панели (роль admin живёт в users/<uid>).
function wipeKeepSelfUid() {
    var uid = wipeCurrentUid();
    if (!uid || uid === 'tournament-master') return null;
    var isAdmin = false;
    try {
        isAdmin = !!(currentUserData && (currentUserData.admin === true || currentUserData.role === 'admin'));
    } catch (e) { console.warn("[silent]", e); }
    return isAdmin ? uid : null;
}

function wipeNoSessionToast() {
    toast(wipeIsEn()
        ? '⚠️ No server session: log in again (master password or admin account) — nothing was deleted'
        : '⚠️ Нет серверной сессии: войдите в админку заново (мастер-пароль или аккаунт администратора) — данные НЕ удалены', 'error');
}

// ── Удаление из браузера (когда Cloud Function недоступна) ─────────────────
// Мульти-path update по дочерним путям: права проверяются на каждый путь
// отдельно, и все они (users/<uid>, usersPublic/<uid>, …) разрешены ролям
// администратора и мастера.
function wipeDeleteChunk(path, keys) {
    var updates = {};
    keys.forEach(function(k) { updates[path + '/' + k] = null; });
    return db.ref().update(updates);
}

function wipeBranchChildren(path, chunkSize, keepKeys) {
    var chunk = chunkSize || 200;
    return db.ref(path).once('value').then(function(sn) {
        var val = sn.val();
        if (!val || typeof val !== 'object') return 0;
        var keys = Object.keys(val).filter(function(k) {
            return !(keepKeys && keepKeys.indexOf(k) !== -1);
        });
        var done = 0;
        var chain = Promise.resolve();
        for (var i = 0; i < keys.length; i += chunk) {
            (function(part) {
                chain = chain.then(function() {
                    return wipeDeleteChunk(path, part).then(function() { done += part.length; });
                });
            })(keys.slice(i, i + chunk));
        }
        return chain.then(function() { return done; });
    });
}

// Удаляет ветку целиком; если правила запрещают запись в саму ветку —
// удаляет всех её детей по отдельности (работает и без новых правил БД).
function wipeDbBranch(path, opts) {
    opts = opts || {};
    var keepKeys = opts.keepKeys || null;
    var branchAttempt = (keepKeys && keepKeys.length)
        ? Promise.reject(new Error('keep-keys'))
        : db.ref(path).remove();
    return branchAttempt.then(function() {
        return { path: path, ok: true, mode: 'branch', count: null };
    }).catch(function(branchErr) {
        return wipeBranchChildren(path, opts.chunkSize, keepKeys).then(function(count) {
            return { path: path, ok: true, mode: 'children', count: count };
        }, function(err) {
            return { path: path, ok: false, mode: 'children', error: err || branchErr };
        });
    });
}

// После удаления раундов у оставшихся игроков не должно остаться истории
// и агрегатов из этих раундов.
function wipeRoundsResetPlayersStats() {
    if (typeof db === 'undefined' || !db) return Promise.resolve();
    return db.ref('users').once('value').then(function(sn) {
        var users = sn.val() || {};
        var updates = {};
        Object.keys(users).forEach(function(uid) {
            updates['users/' + uid + '/history'] = null;
            updates['users/' + uid + '/roundsPlayed'] = 0;
            updates['users/' + uid + '/bestGross'] = null;
            updates['users/' + uid + '/bestStableford'] = null;
        });
        return Object.keys(updates).length ? db.ref().update(updates) : null;
    }).catch(function(err) { console.warn('[wipe] stats reset skipped', err); });
}

function wipeServerCall(scope) {
    return new Promise(function(resolve, reject) {
        try {
            if (typeof firebase === 'undefined' || !firebase.functions) {
                reject(new Error('Cloud Functions недоступны'));
                return;
            }
            firebase.functions().httpsCallable('wipeAllData')({ scope: scope }).then(function(res) {
                resolve((res && res.data) || {});
            }).catch(reject);
        } catch (e) { reject(e); }
    });
}

// 1) серверная функция (Admin SDK) — правил БД не боится;
// 2) браузерный фолбэк — по доступным путям.
function wipeDatabase(scope) {
    var branches = scope === 'rounds' ? WIPE_ROUNDS_DB_BRANCHES : WIPE_ALL_DB_BRANCHES;
    var keepUid = scope === 'rounds' ? null : wipeKeepSelfUid();
    return wipeServerCall(scope).then(function(res) {
        return { ok: true, via: 'server', failures: [], keptSelf: !!res.keptSelf };
    }).catch(function(serverErr) {
        try { console.warn('[wipe] server wipe unavailable, browser fallback', serverErr); } catch (e) {}
        var results = [];
        var chain = Promise.resolve();
        branches.forEach(function(path) {
            chain = chain.then(function() {
                return wipeDbBranch(path, {
                    chunkSize: 200,
                    keepKeys: (path === 'users' && keepUid) ? [keepUid] : null
                }).then(function(r) { results.push(r); });
            });
        });
        if (scope === 'rounds') chain = chain.then(wipeRoundsResetPlayersStats);
        return chain.then(function() {
            var failures = results.filter(function(r) { return !r.ok; }).map(function(r) {
                return { path: r.path, error: r.error };
            });
            return { ok: !failures.length, via: 'browser', failures: failures, keptSelf: !!keepUid };
        });
    });
}

function wipeFailureNames(failures) {
    var lang = wipeIsEn() ? 'en' : 'ru';
    return failures.map(function(f) {
        var label = WIPE_PATH_LABELS[f.path];
        return label ? (label[lang] || f.path) : f.path;
    }).join(', ');
}

function wipeResultToast(res, opts) {
    opts = opts || {};
    var en = wipeIsEn();
    if (res.ok) {
        var base = opts.scope === 'rounds'
            ? (en ? 'All rounds and history deleted' : 'Все раунды и история удалены')
            : (en ? 'All players and rounds deleted everywhere' : 'Все игроки и раунды полностью удалены');
        if (res.keptSelf) base += en ? ' (your admin account was kept)' : ' (ваш аккаунт администратора сохранён)';
        toast(base, 'info');
        return;
    }
    var names = wipeFailureNames(res.failures || []);
    toast(en
        ? '⚠️ Partially deleted. Not deleted: ' + names + '. Administrator rights (or deployed rules/functions) are required.'
        : '⚠️ Удалено частично. Не удалось удалить: ' + names + '. Нужны права администратора (или развёрнутые правила/функции).', 'error');
}

// ── Кнопки админки ─────────────────────────────────────────────────────────
function clearRounds() {
    var en = wipeIsEn();
    if (!confirm(en ? 'Delete ALL rounds and history? This cannot be undone!' : 'Удалить ВСЕ раунды и всю историю? Это необратимо!') ||
        !confirm(en ? 'Are you sure?' : 'Точно уверены?')) return;

    if (typeof db === 'undefined' || !db) {
        try { if (typeof pestovoWipeLocalSessions === 'function') pestovoWipeLocalSessions(); } catch (e) { console.warn("[silent]", e); }
        toast(en ? 'No database connection: local sessions cleared' : 'Нет соединения с базой: локальные сессии очищены', 'info');
        return Promise.resolve();
    }
    if (!wipeHasServerSession()) { wipeNoSessionToast(); return Promise.resolve(); }

    return wipeDatabase('rounds').then(function(res) {
        // Сбрасываем игровые сессии на всех устройствах.
        safeAfterWipeStep(function() { if (typeof pestovoWipeLocalSessions === 'function') pestovoWipeLocalSessions(); });
        safeAfterWipeStep(function() { db.ref('settings/sessions_reset_ts').set(Date.now()).catch(function() {}); });
        safeAfterWipeStep(function() { if (typeof loadAdmRounds === 'function') loadAdmRounds(); });
        safeAfterWipeStep(function() { if (typeof loadAdmGroups === 'function') loadAdmGroups(); });
        safeAfterWipeStep(function() { if (typeof loadAdmPlayers === 'function') loadAdmPlayers(); });
        wipeResultToast(res, { scope: 'rounds' });
    }).catch(function(err) {
        toast((en ? 'Error: ' : 'Ошибка: ') + (err && err.message ? err.message : err) +
            (en ? ' — data was NOT deleted' : ' — данные НЕ удалены'), 'error');
    });
}

// Полностью удаляет ВСЕХ игроков И все раунды, чтобы после этого нигде
// (списки, автоподбор, история, статистика, лидерборды) не осталось следов.
function clearAllData() {
    var en = wipeIsEn();
    var msg1 = en
        ? 'Delete ALL players AND ALL rounds? Everything will be permanently removed and cannot be recovered!'
        : 'Удалить ВСЕХ игроков И ВСЕ раунды? Все данные будут удалены безвозвратно и нигде не появятся снова!';
    var msg2 = en
        ? 'This is irreversible. Are you absolutely sure?'
        : 'Это действие необратимо. Вы абсолютно уверены?';

    if (!confirm(msg1) || !confirm(msg2)) return;

    if (typeof db === 'undefined' || !db) {
        // Оффлайн-режим: чистим только локальные кэши
        if (typeof wipeLocalPlayerCaches === 'function') wipeLocalPlayerCaches();
        try {
            localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify([]));
        } catch (e) { console.warn("[silent]", e); }
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        if (typeof loadAdmRounds === 'function') loadAdmRounds();
        toast(en ? 'All data deleted (offline caches)' : 'Все данные удалены (локальные кэши)', 'info');
        return Promise.resolve();
    }
    if (!wipeHasServerSession()) { wipeNoSessionToast(); return Promise.resolve(); }

    return wipeDatabase('all').then(function(res) {
        // Локальные кэши и «прячем» игроков: каждый шаг в своём try/catch,
        // чтобы сбой локального кэша не выглядел как неудачное удаление.
        safeAfterWipeStep(function() { if (typeof wipeLocalPlayerCaches === 'function') wipeLocalPlayerCaches(); });
        safeAfterWipeStep(function() { localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify([])); });
        safeAfterWipeStep(function() { if (typeof pestovoWipeLocalSessions === 'function') pestovoWipeLocalSessions(); });
        // Сброс ВСЕХ сессий на устройствах игроков (доступ к раундам,
        // текущие лунки, FIO-сессии) — клиенты слушают этот ключ.
        safeAfterWipeStep(function() { db.ref('settings/sessions_reset_ts').set(Date.now()).catch(function() {}); });
        safeAfterWipeStep(function() { if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache(); });
        safeAfterWipeStep(function() { if (typeof loadAdmPlayers === 'function') loadAdmPlayers(); });
        safeAfterWipeStep(function() { if (typeof loadAdmRounds === 'function') loadAdmRounds(); });
        safeAfterWipeStep(function() { if (typeof loadAdmTournaments === 'function') loadAdmTournaments(); });
        wipeResultToast(res, { scope: 'all' });
        if (res.ok && typeof vib === 'function') { try { vib([60, 40, 60]); } catch (e) { console.warn("[silent]", e); } }
    }).catch(function(err) {
        // Ошибка базы: данные НЕ удалены — сообщаем честно.
        toast((en ? 'Error: ' : 'Ошибка: ') + (err && err.message ? err.message : err) +
            (en ? ' — data was NOT deleted' : ' — данные НЕ удалены'), 'error');
    });
}

// Любой шаг после успешного удаления данных не должен «превращаться» в
// ошибку удаления: локалку и открытые списки обновляем «мягко».
function safeAfterWipeStep(fn) {
    try { fn(); } catch (e) { try { console.warn('[wipe] step failed', e); } catch (_) { console.warn("[silent]", _); } }
}

// Удаляет АБСОЛЮТНО ВСЕ данные: турниры, игроков, раунды, историю, маркеры,
// протоколы, трансляции, реакции, алерты, а также все локальные кэши и
// «демо-имена». Настройки (дизайн, доступ в админку, интеграции) сохраняются,
// чтобы после очистки админка осталась доступной.
var WIPE_ALL_KEEP_LOCAL_KEYS = [
    'pestovo_is_admin', 'pestovo_admin_access_source', 'pestovo_admin_access_remember',
    'pestovo_adm_logged_in', 'pestovo_adm_remember', 'pestovo_lang', 'pestovo_theme',
    'pestovo_saved_email', 'pestovo_saved_remember'
];

function wipeAllLocalData() {
    [localStorage, sessionStorage].forEach(function(storageObj) {
        var keys = [];
        try {
            for (var i = 0; i < storageObj.length; i++) keys.push(storageObj.key(i));
        } catch(e) { return; }
        keys.forEach(function(k) {
            if (!k) return;
            if (WIPE_ALL_KEEP_LOCAL_KEYS.indexOf(k) !== -1) return;
            if (k.indexOf('pestovo_') !== 0 && k !== 'pwa_install_dismissed') return;
            safeStorageRemove(storageObj, k);
        });
    });
    if (typeof wipeLocalPlayerCaches === 'function') wipeLocalPlayerCaches();
    try { localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify([])); } catch (e) { console.warn("[silent]", e); }
    try { localStorage.setItem('pestovo_defaults_cleared', 'true'); } catch (e) { console.warn("[silent]", e); }
}

function wipeEverything() {
    var en = wipeIsEn();
    var msg1 = en
        ? 'Delete ABSOLUTELY EVERYTHING? Tournaments, players, rounds, history, markers, protocols, broadcasts, demo names and all local caches will be permanently erased!'
        : 'Удалить АБСОЛЮТНО ВСЕ данные? Турниры, игроки, раунды, история, маркеры, протоколы, трансляции, демо-имена и все локальные кэши будут стёрты безвозвратно!';
    var msg2 = en
        ? 'This cannot be undone. Type DELETE to confirm.'
        : 'Это действие необратимо. Введите УДАЛИТЬ для подтверждения.';
    var word = en ? 'DELETE' : 'УДАЛИТЬ';

    if (!confirm(msg1)) return;
    var typed = prompt(msg2, '');
    if (typed === null) return;
    if (String(typed).trim().toUpperCase() !== word && String(typed).trim().toUpperCase() !== 'DELETE') {
        toast(en ? 'Cancelled: confirmation word did not match' : 'Отменено: слово подтверждения не совпало', 'info');
        return;
    }

    var finish = function(res) {
        safeAfterWipeStep(function() { wipeAllLocalData(); });
        // Сбрасываем локальные сессии на всех устройствах после полной очистки.
        safeAfterWipeStep(function() {
            if (typeof db !== 'undefined' && db) {
                db.ref('settings/sessions_reset_ts').set(Date.now()).catch(function() {});
            }
        });
        safeAfterWipeStep(function() { if (typeof pestovoWipeLocalSessions === 'function') pestovoWipeLocalSessions(); });
        safeAfterWipeStep(function() { if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache(); });
        safeAfterWipeStep(function() { if (typeof loadAdmPlayers === 'function') loadAdmPlayers(); });
        safeAfterWipeStep(function() { if (typeof loadAdmRounds === 'function') loadAdmRounds(); });
        safeAfterWipeStep(function() { if (typeof loadAdmTournaments === 'function') loadAdmTournaments(); });
        wipeResultToast(res, { scope: 'all' });
        if (res.ok && typeof vib === 'function') { try { vib([60, 40, 60]); } catch (e) { console.warn("[silent]", e); } }
        if (res.ok) setTimeout(function() { location.reload(); }, 1200);
    };

    if (typeof db === 'undefined' || !db) { finish({ ok: true, via: 'offline', failures: [], keptSelf: false }); return Promise.resolve(); }
    if (!wipeHasServerSession()) { wipeNoSessionToast(); return Promise.resolve(); }

    return wipeDatabase('all').then(finish).catch(function(err) {
        toast((en ? 'Error: ' : 'Ошибка: ') + (err && err.message ? err.message : err) +
            (en ? ' — data was NOT deleted' : ' — данные НЕ удалены'), 'error');
    });
}
