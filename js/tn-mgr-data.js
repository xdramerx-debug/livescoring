// ============================================================
// TN-MGR-DATA — слой данных системы турниров
// ------------------------------------------------------------
// Пишет и читает турниры в СУЩЕСТВУЮЩЕМ дереве Realtime Database,
// чтобы публичный каталог (tournaments.html), живое табло и
// страницы ввода счёта продолжали работать без изменений:
//
//   tournaments/<tid>            — карточка турнира (Tournament)
//     rounds/<rid>               — раунды турнира (Round)
//     groups/<gid> + divisions/  — группы (Group, совместимо с публичной
//                                  группировкой tnNormalizeDivisions)
//     players/<pid>              — участники (Player)
//     registeredPlayers/<pid>    — зеркало состава для публичной страницы
//     sheets/<rid>               — стартовый лист (StartingSheet + Entries +
//                                  MarkerAssignment + QRCode)
//     printScorecards            — печатные счётные карточки турнира
//     results/<rid>/<pid>        — результаты (Result)
//     scores/<rid>/<pid>/<hole>  — зеркало счёта для студии/табло
//
//   rounds/<groupRoundId>        — раунд КАЖДОЙ группы для страниц
//                                  ввода счёта (setup-round.html / scorer.html),
//                                  в форме, которую ждёт js/live.js
//
// Никаких новых узлов верхнего уровня: правила database.rules.json
// уже покрывают запись админом/мастер-турнира.
// ============================================================
var TnMgrData = (function (root) {
    'use strict';

    var C = root.TnMgrCore;

    // ----------------------------------------------------------
    // ИНФРАСТРУКТУРА
    // ----------------------------------------------------------
    function database() { return root.db || null; }
    function core() { return root.TnMgrCore || C; }
    function now() { return Date.now(); }
    function currentUid() {
        try {
            if (root.currentUser && root.currentUser.uid) return root.currentUser.uid;
            if (root.auth && root.auth.currentUser) return root.auth.currentUser.uid;
        } catch (e) { /* silent */ }
        return 'admin';
    }
    function pushKey(path) {
        var db = database();
        if (!db) return 'k' + now().toString(36);
        return db.ref(path).push().key;
    }
    function ref(path) {
        var db = database();
        return db ? db.ref(path) : null;
    }
    function read(path) {
        var r = ref(path);
        if (!r) return Promise.resolve(null);
        return r.once('value').then(function (snap) { return snap.val(); }).catch(function () { return null; });
    }
    function write(path, value) {
        var r = ref(path);
        if (!r) return Promise.reject(new Error('Нет соединения с базой'));
        return r.set(value);
    }
    function patch(path, value) {
        var r = ref(path);
        if (!r) return Promise.reject(new Error('Нет соединения с базой'));
        return r.update(value);
    }
    function remove(path) {
        var r = ref(path);
        return r ? r.remove() : Promise.resolve();
    }
    function multi(updates) {
        var db = database();
        if (!db) return Promise.reject(new Error('Нет соединения с базой'));
        var payload = {};
        Object.keys(updates || {}).forEach(function (key) {
            if (updates[key] === undefined) return;
            payload[key] = updates[key];
        });
        return db.ref().update(payload);
    }
    function asMap(value) { return value && typeof value === 'object' ? value : {}; }
    function listOf(value) {
        return Object.keys(asMap(value)).map(function (key) {
            var item = asMap(value)[key] || {};
            if (typeof item === 'object') item.id = item.id || key;
            return item;
        });
    }
    function clean(value) {
        var out = {};
        Object.keys(value || {}).forEach(function (key) {
            if (value[key] !== undefined && value[key] !== null && value[key] !== '') out[key] = value[key];
        });
        return out;
    }

    // ----------------------------------------------------------
    // ПОДПИСКИ
    // ----------------------------------------------------------
    var watchHandles = {};

    /** Список всех турниров (для главного экрана вкладки). */
    function watchTournaments(cb) {
        var r = ref('tournaments');
        if (!r) return function () {};
        var handler = r.on('value', function (snap) {
            cb(asMap(snap.val()));
        }, function () { cb({}); });
        return function () { try { r.off('value', handler); } catch (e) { /* silent */ } };
    }

    /** Один турнир целиком (карточка, участники, группы, счёт). */
    function watchTournament(tid, cb) {
        if (!tid) return function () {};
        var r = ref('tournaments/' + tid);
        if (!r) return function () {};
        var handler = r.on('value', function (snap) {
            cb(snap.val() || null);
        }, function () { cb(null); });
        return function () { try { r.off('value', handler); } catch (e) { /* silent */ } };
    }

    /** Записи раундов группы (для экрана счёта) — живые обновления. */
    function watchGroupRounds(groupRoundIds, cb) {
        var handles = [];
        var cache = {};
        var db = database();
        if (!db) return function () {};
        (groupRoundIds || []).forEach(function (gid) {
            var handler = function (snap) {
                cache[gid] = snap.val() || null;
                cb(cache);
            };
            db.ref('rounds/' + gid).on('value', handler);
            handles.push({ gid: gid, handler: handler });
        });
        return function () {
            handles.forEach(function (item) {
                try { db.ref('rounds/' + item.gid).off('value', item.handler); } catch (e) { /* silent */ }
            });
        };
    }

    // ----------------------------------------------------------
    // ЧЕРНОВИКИ И СПРАВОЧНИК ФОРМАТОВ
    // ----------------------------------------------------------
    var DRAFT_KEY = 'pestovo_tn_mgr_draft';
    var FORMATS_KEY = 'pestovo_tn_mgr_formats';

    function localDraft() {
        try { return JSON.parse(root.localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { return null; }
    }
    function saveDraftLocal(data) {
        try { root.localStorage.setItem(DRAFT_KEY, JSON.stringify(data || {})); } catch (e) { /* silent */ }
    }
    function clearDraftLocal() {
        try { root.localStorage.removeItem(DRAFT_KEY); } catch (e) { /* silent */ }
    }
    /** Автосохранение черновика формы: tnDrafts/<uid> (правила уже разрешают). */
    function saveDraft(data) {
        saveDraftLocal(data);
        var uid = currentUid();
        return patch('tnDrafts/' + uid, { tournament: data || {}, updatedAt: now() }).catch(function () { /* offline */ });
    }
    function loadDraft() {
        var local = localDraft();
        var uid = currentUid();
        return read('tnDrafts/' + uid).then(function (remote) {
            var saved = remote && remote.tournament ? remote.tournament : null;
            if (!saved) return local;
            if (local && (local.updatedAt || 0) > (remote.updatedAt || 0)) return local;
            return saved;
        }).catch(function () { return local; });
    }
    function clearDraft() {
        clearDraftLocal();
        var uid = currentUid();
        return remove('tnDrafts/' + uid).catch(function () { /* silent */ });
    }

    function localFormats() {
        try { return JSON.parse(root.localStorage.getItem(FORMATS_KEY) || '[]') || []; } catch (e) { return []; }
    }
    function saveLocalFormats(list) {
        try { root.localStorage.setItem(FORMATS_KEY, JSON.stringify(list || [])); } catch (e) { /* silent */ }
    }

    /**
     * Справочник форматов: встроенный + пользовательский из данных
     * (tournaments/<tid>/formatsDict, глобальный settings/tnFormats, локальный кэш).
     */
    function loadFormatCatalog(tid) {
        return Promise.all([
            read('settings/tnFormats').catch(function () { return null; }),
            tid ? read('tournaments/' + tid + '/formatsDict').catch(function () { return null; }) : Promise.resolve(null)
        ]).then(function (res) {
            return core().formatCatalog(res[0] || {}, res[1] || {}, localFormats());
        });
    }

    /** Пополняет справочник форматов (турнир + глобальный, best-effort). */
    function addFormat(tid, label) {
        var name = core().trim(label);
        if (!name) return Promise.resolve(null);
        var id = core().formatId(name);
        var record = { id: id, ru: name, en: name, custom: true, addedAt: now(), addedBy: currentUid() };
        var updates = {};
        if (tid) updates['tournaments/' + tid + '/formatsDict/' + id] = record;
        updates['settings/tnFormats/' + id] = record;
        var cached = localFormats().filter(function (item) { return (item.id || core().formatId(item.ru || '')) !== id; });
        cached.push(record);
        saveLocalFormats(cached);
        return multi(updates).catch(function () {
            // settings/ пишут только Firebase-админы — локальный справочник уже обновлён.
            if (!tid) return null;
            return patch('tournaments/' + tid + '/formatsDict/' + id, record).catch(function () { return null; });
        }).then(function () { return record; });
    }

    // ----------------------------------------------------------
    // ТУРНИРЫ
    // ----------------------------------------------------------
    function createTournament(input) {
        var record = core().newTournament(input);
        var tid = pushKey('tournaments');
        var payload = clean(record);
        payload.status = record.status === 'upcoming' ? 'upcoming' : 'draft';
        payload.createdBy = currentUid();
        payload.createdAt = now();
        payload.updatedAt = payload.createdAt;
        var translations = input && input.translations ? input.translations : null;
        if (translations) payload.translations = translations;
        if (input && input.formatsDict) payload.formatsDict = input.formatsDict;
        return write('tournaments/' + tid, payload).then(function () {
            clearDraft();
            return tid;
        });
    }

    function updateTournament(tid, fields) {
        var patchValue = clean(fields);
        if (patchValue.startDate) {
            patchValue.startDate = core().dateIso(patchValue.startDate);
            patchValue.date = patchValue.startDate;
        }
        if (patchValue.startTime) patchValue.startTime = core().timeText(patchValue.startTime, '09:00');
        patchValue.updatedAt = now();
        return patch('tournaments/' + tid, patchValue);
    }

    function setTournamentStatus(tid, status) {
        var patchValue = { status: status, lifecycleStatus: status, updatedAt: now() };
        if (status === 'active') patchValue.startedAt = now();
        if (status === 'completed') patchValue.finishedAt = now();
        return patch('tournaments/' + tid, patchValue);
    }

    // Стартовал ли турнир (по записи турнира, а не по времени в расписании).
    // Нужно, чтобы отличить «турнир уже начат организатором» от «турнир
    // запланирован на будущее»: в первом случае раунды групп сразу открыты
    // для ввода счёта, во втором — ждут своего времени (status 'scheduled').
    function tournamentStarted(tournament) {
        var t = asMap(tournament);
        var status = String(t.lifecycleStatus || t.status || '').toLowerCase();
        return status === 'active' || !!t.startedAt;
    }

    /**
     * Открывает запланированные раунды турнира (status 'scheduled' → 'active').
     * Возвращает количество открытых раундов.
     *
     * Без этого шага принудительный старт («Старт» раньше времени) переводил
     * в active только запись турнира, а раунды групп оставались «запертыми»
     * до планового scheduledStart: игрок, отсканировавший QR со счётной
     * карточки, видел «Турнир ещё не начался» и не мог вводить счёт.
     */
    function openScheduledRounds(tid) {
        if (!tid) return Promise.resolve(0);
        return read('rounds').then(function (all) {
            var updates = {};
            var stamp = now();
            var opened = [];
            Object.keys(asMap(all)).forEach(function (rid) {
                var round = asMap(all)[rid] || {};
                if (String(round.tournamentId || '') !== String(tid)) return;
                if (String(round.status || '') !== 'scheduled') return;
                updates['rounds/' + rid + '/status'] = 'active';
                updates['rounds/' + rid + '/activatedAt'] = stamp;
                opened.push(rid);
            });
            if (!opened.length) return 0;
            return multi(updates).then(function () { return opened.length; }).catch(function () {
                // Раунд — не главное: турнир уже стартовал, а статус раунда
                // пересчитается у других клиентов по времени (utils.js).
                return 0;
            });
        }).catch(function () { return 0; });
    }

    function startTournament(tid) {
        // Сначала открываем раунды, потом переводим турнир в active: если
        // запись упала на середине, игроки всё равно уже могут вводить счёт.
        return openScheduledRounds(tid).then(function () {
            return setTournamentStatus(tid, 'active');
        });
    }

    function forceFinishTournament(tid) {
        if (!tid) return Promise.reject(new Error('Не выбран турнир'));
        var finishRounds;
        if (typeof root.pestovoPreserveTournamentRounds === 'function') {
            finishRounds = root.pestovoPreserveTournamentRounds(tid);
        } else {
            finishRounds = read('rounds').then(function (all) {
                var updates = {};
                var count = 0;
                Object.keys(asMap(all)).forEach(function (rid) {
                    var round = asMap(all)[rid] || {};
                    if (String(round.tournamentId || '') !== String(tid)) return;
                    updates['rounds/' + rid + '/status'] = 'completed';
                    updates['rounds/' + rid + '/completedAt'] = now();
                    updates['rounds/' + rid + '/closedByTournamentFinish'] = true;
                    count++;
                });
                return (Object.keys(updates).length ? multi(updates) : Promise.resolve()).then(function () { return count; });
            });
        }
        return Promise.resolve(finishRounds).then(function (closed) {
            return setTournamentStatus(tid, 'completed').then(function () { return closed || 0; });
        });
    }

    // ----------------------------------------------------------
    // ПАУЗА ТУРНИРА
    // ----------------------------------------------------------
    // Пауза турнира = пауза всех его раундов: используется ТА ЖЕ механика,
    // что и для отдельного раунда (js/utils.js → roundPause/roundResume,
    // поля paused / pausedAt / pauseHistory / totalPausedMs), поэтому
    // страницы ввода счёта, темп игры и табло показывают паузу без изменений.
    // Отличие — флаг rounds/<rid>/pausedByTournament: по нему «Возобновить»
    // снимает только паузу турнира и не трогает раунды, которые организатор
    // остановил вручную раньше.

    /** Турнир сейчас на паузе? */
    function tournamentPaused(tournament) {
        return !!asMap(tournament).paused;
    }

    /** Раунды групп турнира из верхнего уровня rounds/. */
    function tournamentGroupRounds(tid) {
        if (!tid) return Promise.resolve([]);
        return read('rounds').then(function (all) {
            return Object.keys(asMap(all)).map(function (rid) {
                var round = asMap(all)[rid] || {};
                round._rid = rid;
                return round;
            }).filter(function (round) {
                return String(round.tournamentId || '') === String(tid);
            });
        }).catch(function () { return []; });
    }

    function pauseDurationMs(pausedAt, stamp) {
        var from = parseInt(pausedAt, 10) || 0;
        if (!from) return 0;
        // Пауза длиннее суток — мусорные данные (как MAX_PAUSE_INTERVAL_MS в utils.js).
        return Math.max(0, Math.min((stamp || now()) - from, 12 * 60 * 60 * 1000));
    }

    function closePauseHistory(history, stamp, userName) {
        var list = Array.isArray(history) ? history.slice() : [];
        if (list.length && !list[list.length - 1].resumedAt) {
            var last = Object.assign({}, list[list.length - 1]);
            last.resumedAt = stamp;
            last.durationMs = pauseDurationMs(last.pausedAt, stamp);
            last.resumedByName = userName || '';
            list[list.length - 1] = last;
        }
        return list;
    }

    /**
     * Ставит турнир на паузу: запись турнира + все его незавершённые раунды.
     * Раунды, уже стоящие на ручной паузе, не трогаем (и не помечаем флагом),
     * поэтому «Возобновить» вернёт их в то состояние, которое выставил
     * организатор. Возвращает { paused, skipped, already }.
     */
    function pauseTournament(tid, reason, userName) {
        if (!tid) return Promise.reject(new Error('Не выбран турнир'));
        var stamp = now();
        var text = core().trim(reason);
        var actor = core().trim(userName);
        return Promise.all([read('tournaments/' + tid), tournamentGroupRounds(tid)]).then(function (res) {
            var tournament = asMap(res[0]);
            var rounds = res[1] || [];
            if (tournamentPaused(tournament)) {
                return { paused: 0, skipped: rounds.length, already: true };
            }
            var updates = {};
            var history = Array.isArray(tournament.pauseHistory) ? tournament.pauseHistory.slice() : [];
            history.push({
                pausedAt: stamp, reason: text, pausedBy: currentUid(),
                pausedByName: actor, byTournament: true
            });
            updates['tournaments/' + tid + '/paused'] = true;
            updates['tournaments/' + tid + '/pausedAt'] = stamp;
            updates['tournaments/' + tid + '/pauseReason'] = text || null;
            updates['tournaments/' + tid + '/pausedBy'] = currentUid();
            updates['tournaments/' + tid + '/pausedByName'] = actor;
            updates['tournaments/' + tid + '/pauseHistory'] = history;
            updates['tournaments/' + tid + '/updatedAt'] = stamp;

            var paused = 0;
            var skipped = 0;
            rounds.forEach(function (round) {
                var rid = round._rid;
                if (String(round.status || '') === 'completed') return;
                if (round.paused) { skipped++; return; }
                var roundHistory = Array.isArray(round.pauseHistory) ? round.pauseHistory.slice() : [];
                roundHistory.push({
                    pausedAt: stamp, reason: text, pausedBy: currentUid(),
                    pausedByName: actor, tournamentId: tid, byTournament: true
                });
                updates['rounds/' + rid + '/paused'] = true;
                updates['rounds/' + rid + '/pausedAt'] = stamp;
                updates['rounds/' + rid + '/pauseReason'] = text || null;
                updates['rounds/' + rid + '/pausedBy'] = currentUid();
                updates['rounds/' + rid + '/pausedByName'] = actor;
                updates['rounds/' + rid + '/pausedByTournament'] = tid;
                updates['rounds/' + rid + '/pauseHistory'] = roundHistory;
                paused++;
            });
            return multi(updates).then(function () {
                return { paused: paused, skipped: skipped, already: false };
            });
        });
    }

    /**
     * Снимает турнир с паузы: запись турнира + раунды, остановленные турниром.
     * Накопленное время паузы (totalPausedMs) сохраняется — тайминги темпа
     * игры продолжают считаться с учётом остановки.
     */
    function resumeTournament(tid, userName) {
        if (!tid) return Promise.reject(new Error('Не выбран турнир'));
        var stamp = now();
        var actor = core().trim(userName);
        return Promise.all([read('tournaments/' + tid), tournamentGroupRounds(tid)]).then(function (res) {
            var tournament = asMap(res[0]);
            var rounds = res[1] || [];
            var updates = {};
            var resumed = 0;
            rounds.forEach(function (round) {
                if (String(round.pausedByTournament || '') !== String(tid)) return;
                var rid = round._rid;
                var total = (parseInt(round.totalPausedMs, 10) || parseInt(round.totalPauseMs, 10) || 0) +
                    pauseDurationMs(round.pausedAt, stamp);
                updates['rounds/' + rid + '/paused'] = false;
                updates['rounds/' + rid + '/pausedAt'] = null;
                updates['rounds/' + rid + '/pauseReason'] = null;
                updates['rounds/' + rid + '/pausedByTournament'] = null;
                updates['rounds/' + rid + '/totalPausedMs'] = total;
                updates['rounds/' + rid + '/totalPauseMs'] = total;
                updates['rounds/' + rid + '/resumedAt'] = stamp;
                updates['rounds/' + rid + '/pauseHistory'] = closePauseHistory(round.pauseHistory, stamp, actor);
                resumed++;
            });
            var totalTn = (parseInt(tournament.totalPausedMs, 10) || 0) + pauseDurationMs(tournament.pausedAt, stamp);
            updates['tournaments/' + tid + '/paused'] = false;
            updates['tournaments/' + tid + '/pausedAt'] = null;
            updates['tournaments/' + tid + '/pauseReason'] = null;
            updates['tournaments/' + tid + '/resumedAt'] = stamp;
            updates['tournaments/' + tid + '/totalPausedMs'] = totalTn;
            updates['tournaments/' + tid + '/pauseHistory'] = closePauseHistory(tournament.pauseHistory, stamp, actor);
            updates['tournaments/' + tid + '/updatedAt'] = stamp;
            return multi(updates).then(function () {
                return { resumed: resumed, wasPaused: tournamentPaused(tournament) };
            });
        });
    }

    /** Удаление турнира вместе с его раундами групп верхнего уровня. */
    function deleteTournament(tid) {
        return read('rounds').then(function (all) {
            var updates = {};
            updates['tournaments/' + tid] = null;
            Object.keys(asMap(all)).forEach(function (rid) {
                if (String(asMap(all)[rid].tournamentId || '') === String(tid)) updates['rounds/' + rid] = null;
            });
            return multi(updates);
        }).catch(function () {
            return remove('tournaments/' + tid);
        });
    }

    // ----------------------------------------------------------
    // РАУНДЫ
    // ----------------------------------------------------------
    function addRound(tid, input) {
        var rid = pushKey('tournaments/' + tid + '/rounds');
        var record = core().newRound(input || {});
        record.id = rid;
        record.createdAt = now();
        var updates = {};
        updates['tournaments/' + tid + '/rounds/' + rid] = clean(record);
        // days/ — совместимость со «студией» публичной страницы.
        updates['tournaments/' + tid + '/days/' + rid] = clean({ date: record.date, name: record.name });
        return multi(updates).then(function () { return rid; });
    }

    function updateRound(tid, rid, fields) {
        var patchValue = clean(fields);
        if (patchValue.date) patchValue.date = core().dateIso(patchValue.date);
        patchValue.updatedAt = now();
        var updates = {};
        updates['tournaments/' + tid + '/rounds/' + rid] = patchValue;
        if (patchValue.date) updates['tournaments/' + tid + '/days/' + rid + '/date'] = patchValue.date;
        return multi(updates);
    }

    function saveScorecardLayout(tid, rid, layout) {
        if (!tid || !rid) return Promise.reject(new Error('Не выбран раунд'));
        var safe = core().normalizedScorecardLayout(layout || core().defaultScorecardLayout());
        return patch('tournaments/' + tid + '/rounds/' + rid, {
            scorecardLayout: safe,
            updatedAt: now()
        });
    }

    /** Удаление раунда: строки групп, счёт, результаты и стартовый лист. */
    function deleteRound(tid, rid) {
        return read('tournaments/' + tid + '/rounds/' + rid).then(function (round) {
            var updates = {};
            updates['tournaments/' + tid + '/rounds/' + rid] = null;
            updates['tournaments/' + tid + '/days/' + rid] = null;
            updates['tournaments/' + tid + '/scores/' + rid] = null;
            updates['tournaments/' + tid + '/results/' + rid] = null;
            updates['tournaments/' + tid + '/sheets/' + rid] = null;
            Object.keys(asMap(round && round.groupRounds)).forEach(function (key) {
                updates['rounds/' + asMap(round.groupRounds)[key]] = null;
            });
            if (round && round.groupRoundId) updates['rounds/' + round.groupRoundId] = null;
            return multi(updates);
        });
    }

    // ----------------------------------------------------------
    // ГРУППЫ (совместимо с divisions публичной страницы)
    // ----------------------------------------------------------
    function groupRecord(gid, input) {
        var record = core().newGroup(input || {});
        record.id = gid;
        return clean(record);
    }

    function addGroup(tid, input) {
        var gid = pushKey('tournaments/' + tid + '/groups');
        var record = groupRecord(gid, input);
        record.createdAt = now();
        var updates = {};
        updates['tournaments/' + tid + '/groups/' + gid] = record;
        updates['tournaments/' + tid + '/divisions/' + gid] = record;
        return multi(updates).then(function () { return gid; });
    }

    function updateGroup(tid, gid, fields) {
        var record = groupRecord(gid, fields || {});
        var updates = {};
        updates['tournaments/' + tid + '/groups/' + gid] = record;
        updates['tournaments/' + tid + '/divisions/' + gid] = record;
        return multi(updates);
    }

    /** Смена состава группы: у игроков обновляем groupId, у группы — members. */
    function setGroupMembers(tid, gid, memberIds, tournament) {
        var updates = {};
        var members = {};
        (memberIds || []).forEach(function (pid) {
            if (!pid) return;
            members[pid] = playerNameOf(tournament, pid) || true;
            updates['tournaments/' + tid + '/players/' + pid + '/groupId'] = gid;
            updates['tournaments/' + tid + '/registeredPlayers/' + pid + '/groupId'] = gid;
        });
        updates['tournaments/' + tid + '/groups/' + gid + '/members'] = Object.keys(members).length ? members : null;
        updates['tournaments/' + tid + '/divisions/' + gid + '/members'] = Object.keys(members).length ? members : null;
        // Убираем игроков, которые больше не в группе.
        listOf(asMap(tournament && tournament.players)).forEach(function (player) {
            if (player.groupId !== gid) return;
            if ((memberIds || []).indexOf(player.id) !== -1) return;
            updates['tournaments/' + tid + '/players/' + player.id + '/groupId'] = null;
            updates['tournaments/' + tid + '/registeredPlayers/' + player.id + '/groupId'] = null;
        });
        return multi(updates);
    }

    function deleteGroup(tid, gid, tournament) {
        var updates = {};
        updates['tournaments/' + tid + '/groups/' + gid] = null;
        updates['tournaments/' + tid + '/divisions/' + gid] = null;
        listOf(asMap(tournament && tournament.players)).forEach(function (player) {
            if (player.groupId !== gid) return;
            updates['tournaments/' + tid + '/players/' + player.id + '/groupId'] = null;
            updates['tournaments/' + tid + '/registeredPlayers/' + player.id + '/groupId'] = null;
        });
        return multi(updates);
    }

    /** Создаёт равномерные HCP-группы раздельно для мужчин и женщин. */
    function distributeTournamentPlayers(tid, groupsPerGender, tournament) {
        var players = listOf(asMap(tournament && tournament.players));
        if (!players.length) return Promise.reject(new Error('В турнире пока нет участников'));
        var generated = core().distributePlayers(players, groupsPerGender, {
            format: ((tournament && tournament.formats) || [])[0] || '',
            menTee: 'wh', womenTee: 'rd'
        });
        var groupsById = {};
        var groupByPlayer = {};
        generated.forEach(function (group) {
            groupsById[group.id] = group;
            Object.keys(asMap(group.members)).forEach(function (pid) { groupByPlayer[pid] = group; });
        });
        var updates = {};
        listOf(asMap(tournament && tournament.groups)).forEach(function (group) {
            if (groupsById[group.id]) return;
            updates['tournaments/' + tid + '/groups/' + group.id] = null;
            updates['tournaments/' + tid + '/divisions/' + group.id] = null;
        });
        generated.forEach(function (group) {
            var record = Object.assign({}, group, { createdAt: now(), autoDistribution: true });
            updates['tournaments/' + tid + '/groups/' + group.id] = clean(record);
            updates['tournaments/' + tid + '/divisions/' + group.id] = clean(record);
        });
        players.forEach(function (player) {
            var group = groupByPlayer[player.id];
            var groupId = group ? group.id : null;
            updates['tournaments/' + tid + '/players/' + player.id + '/groupId'] = groupId;
            updates['tournaments/' + tid + '/registeredPlayers/' + player.id + '/groupId'] = groupId;
        });
        listOf(asMap(tournament && tournament.sheets)).forEach(function (sheet) {
            var entries = asMap(sheet.entries);
            Object.keys(entries).forEach(function (pid) {
                var group = groupByPlayer[pid];
                if (!group) return;
                updates['tournaments/' + tid + '/sheets/' + sheet.id + '/entries/' + pid + '/groupId'] = group.id;
                updates['tournaments/' + tid + '/sheets/' + sheet.id + '/entries/' + pid + '/groupName'] = group.name;
            });
            updates['tournaments/' + tid + '/sheets/' + sheet.id + '/updatedAt'] = now();
        });
        return multi(updates).then(function () { return generated; });
    }

    function playerNameOf(tournament, pid) {
        var players = asMap(tournament && tournament.players);
        var fromPlayers = players[pid];
        if (fromPlayers) return core().playerFio(fromPlayers);
        var registered = asMap(tournament && tournament.registeredPlayers)[pid];
        return registered ? core().trim(registered.name) : '';
    }

    /** Группа игрока по данным турнира: явная, иначе по диапазону гандикапа. */
    function groupForPlayer(tournament, player) {
        var groups = listOf(asMap(tournament && tournament.groups));
        if (!groups.length) return null;
        if (player && player.groupId) {
            var explicit = groups.filter(function (g) { return g.id === player.groupId; })[0];
            if (explicit) return explicit;
        }
        var hcp = core().effectiveHcp(player || {});
        for (var i = 0; i < groups.length; i++) {
            if (core().groupMatchesPlayer(groups[i], player || {})) return groups[i];
        }
        return null;
    }

    // ----------------------------------------------------------
    // УЧАСТНИКИ
    // ----------------------------------------------------------
    function playerIdFor(input, existing) {
        var uid = core().trim(input && input.uid);
        if (uid && !asMap(existing)[uid]) return uid;
        return 'guest_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    }

    /** Добавляет участника (TournamentPlayer) и зеркало registeredPlayers. */
    function addPlayer(tid, input, tournament) {
        var record = core().newPlayer(input || {});
        var pid = playerIdFor(input, asMap(tournament && tournament.players));
        record.id = pid;
        record.createdAt = now();
        record.addedBy = currentUid();
        var registered = clean({
            name: record.fio,
            handicap: record.hi,
            gender: record.gender,
            tee: record.tee,
            groupId: record.groupId,
            hi: record.hi,
            ch: record.ch,
            source: record.source,
            uid: record.uid,
            status: 'active',
            addedAt: record.createdAt
        });
        var updates = {};
        updates['tournaments/' + tid + '/players/' + pid] = clean(record);
        updates['tournaments/' + tid + '/registeredPlayers/' + pid] = registered;
        if (record.groupId) {
            updates['tournaments/' + tid + '/groups/' + record.groupId + '/members/' + pid] = record.fio;
            updates['tournaments/' + tid + '/divisions/' + record.groupId + '/members/' + pid] = record.fio;
        }
        return multi(updates).then(function () { return pid; });
    }

    /**
     * Правка игрока: синхронизирует запись игрока, зеркало состава и
     * (если есть) строку стартового листа во всех раундах.
     */
    /**
     * Правка участника — точечная (patch), а не перезапись записи:
     * в карточке игрока правятся HI/CH/фора, и остальные поля
     * (ФИО, пол, группа, источник) должны сохраниться.
     */
    function updatePlayer(tid, pid, fields, tournament) {
        var input = fields || {};
        var record = {};
        var updates = {};
        var mirrored = {};
        Object.keys(input).forEach(function (key) {
            var value = input[key] === undefined ? null : input[key];
            record[key] = value;
            updates['tournaments/' + tid + '/players/' + pid + '/' + key] = value;
        });
        if (record.fio !== undefined) {
            record.name = record.fio;
            updates['tournaments/' + tid + '/players/' + pid + '/name'] = record.fio;
            mirrored.name = record.fio;
        }
        if (record.hi !== undefined) { mirrored.handicap = record.hi; mirrored.hi = record.hi; }
        if (record.ch !== undefined) mirrored.ch = record.ch;
        if (record.gender !== undefined) mirrored.gender = record.gender;
        if (record.tee !== undefined) mirrored.tee = record.tee;
        if (record.groupId !== undefined) mirrored.groupId = record.groupId;
        Object.keys(mirrored).forEach(function (key) {
            updates['tournaments/' + tid + '/registeredPlayers/' + pid + '/' + key] = mirrored[key];
        });
        // Перенос участника в другую группу: состав групп и divisions.
        if (fields && fields.groupId) {
            listOf(asMap(tournament && tournament.groups)).forEach(function (group) {
                if (group.id === fields.groupId) return;
                updates['tournaments/' + tid + '/groups/' + group.id + '/members/' + pid] = null;
                updates['tournaments/' + tid + '/divisions/' + group.id + '/members/' + pid] = null;
            });
            var name = record.fio || playerNameOf(tournament, pid);
            updates['tournaments/' + tid + '/groups/' + fields.groupId + '/members/' + pid] = name;
            updates['tournaments/' + tid + '/divisions/' + fields.groupId + '/members/' + pid] = name;
        }
        // Правки в карточке игрока должны сразу отражаться в стартовом листе.
        listOf(asMap(tournament && tournament.sheets)).forEach(function (sheet) {
            var entry = asMap(sheet.entries)[pid];
            if (!entry) return;
            var entryPatch = {};
            if (record.fio !== undefined) entryPatch.playerName = record.fio;
            if (record.hi !== undefined) entryPatch.hi = record.hi;
            if (record.ch !== undefined) entryPatch.ch = record.ch;
            if (record.tee !== undefined) entryPatch.tee = record.tee;
            if (record.format !== undefined) entryPatch.format = record.format;
            if (record.groupId !== undefined) entryPatch.groupId = record.groupId;
            if (!Object.keys(entryPatch).length) return;
            Object.keys(entryPatch).forEach(function (key) {
                updates['tournaments/' + tid + '/sheets/' + sheet.roundId + '/entries/' + pid + '/' + key] = entryPatch[key];
            });
        });
        return multi(updates);
    }

    /** Удаление участника: состав, группы, стартовые листы, счёт. */
    function removePlayer(tid, pid, tournament) {
        var updates = {};
        updates['tournaments/' + tid + '/players/' + pid] = null;
        updates['tournaments/' + tid + '/registeredPlayers/' + pid] = null;
        listOf(asMap(tournament && tournament.groups)).forEach(function (group) {
            updates['tournaments/' + tid + '/groups/' + group.id + '/members/' + pid] = null;
            updates['tournaments/' + tid + '/divisions/' + group.id + '/members/' + pid] = null;
        });
        listOf(asMap(tournament && tournament.sheets)).forEach(function (sheet) {
            updates['tournaments/' + tid + '/sheets/' + sheet.roundId + '/entries/' + pid] = null;
            updates['tournaments/' + tid + '/sheets/' + sheet.roundId + '/markers/' + pid] = null;
        });
        listOf(asMap(tournament && tournament.rounds)).forEach(function (round) {
            updates['tournaments/' + tid + '/scores/' + round.id + '/' + pid] = null;
            updates['tournaments/' + tid + '/results/' + round.id + '/' + pid] = null;
            Object.keys(asMap(round.groupRounds)).forEach(function (index) {
                updates['rounds/' + round.groupRounds[index] + '/players/' + pid] = null;
            });
        });
        return multi(updates);
    }

    /** Массовое добавление (Excel / справочник / ручной ввод). */
    function addPlayers(tid, list, tournament) {
        var created = [];
        return (list || []).reduce(function (chain, input) {
            return chain.then(function () {
                return addPlayer(tid, input, tournament).then(function (pid) {
                    var record = core().newPlayer(input || {});
                    created.push({ id: pid, fio: record.fio, hi: record.hi, gender: record.gender });
                    // Догружаем турнир, чтобы не перезаписывать ключи друг друга.
                    return read('tournaments/' + tid + '/players').then(function (players) {
                        tournament = Object.assign({}, tournament || {}, { players: players || {} });
                    });
                });
            });
        }, Promise.resolve()).then(function () { return created; });
    }

    // ----------------------------------------------------------
    // СПРАВОЧНИК ИГРОКОВ САЙТА: участники турнира как гости
    // ----------------------------------------------------------
    // Участник турнира, которого добавили поиском, вручную или импортом
    // Excel, часто отсутствует в справочнике клуба (users / usersPublic):
    // такого игрока нельзя выбрать из списка в следующем турнире или в
    // live-скоринге, а его гандикап не синхронизируется с админ-панелью.
    // Поэтому состав турнира регистрируется ГОСТЯМИ:
    //   users/<uid>       — полная запись (админка «Игроки и роли», зеркало);
    //   usersPublic/<uid> — публичное зеркало (списки игроков, поиск, live).
    // Найденный/созданный uid сохраняется в players/<pid>/uid, поэтому
    // повторная синхронизация обновляет ту же запись и не плодит дубликаты,
    // а правка гандикапа в админке (pestovoSyncHcpToTournaments) находит
    // участника именно по этому полю.

    /** Нормализованное имя (ё→е, регистр, пробелы) — как в поиске клуба. */
    function normName(value) {
        if (typeof root.normalizeSearchText === 'function') {
            try { return root.normalizeSearchText(value); } catch (e) { /* silent */ }
        }
        return String(value == null ? '' : value).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    }

    /** ФИО участника по частям — в том виде, в котором их ждёт справочник. */
    function directoryParts(player) {
        var record = core().newPlayer(player || {});
        var fio = core().trim(record.fio);
        var gender = record.gender === 'women' ? 'women' : 'men';
        return {
            name: fio,
            firstName: core().trim(record.firstName),
            middleName: core().trim(record.middleName),
            lastName: core().trim(record.lastName),
            gender: gender,
            tee: core().trim(record.tee) || (gender === 'women' ? 'rd' : 'wh'),
            hi: record.hi == null || record.hi === '' ? null : Number(record.hi)
        };
    }

    function directoryKey(parts) {
        var combined = [parts.lastName, parts.firstName, parts.middleName].filter(Boolean).join(' ');
        return normName(combined || parts.name);
    }

    /** Детерминированный гостевой id (тот же, что делает live-скоринг). */
    var guestSeq = 0;
    function guestUidFor(parts) {
        if (typeof root.buildGuestUserId === 'function') {
            try {
                var id = root.buildGuestUserId(parts.name, parts.hi);
                if (id) return String(id);
            } catch (e) { /* silent */ }
        }
        // Запасной вариант (utils.js не загружен, например в тестах): ключ
        // Firebase допускает любые символы кроме . # $ [ ] / — имя сохраняем
        // как есть (кириллица тоже) и добавляем уникальный хвост, иначе два
        // участника, добавленные в одну миллисекунду, получили бы один id.
        var safe = normName(parts.name).replace(/\s+/g, '_').replace(/[.#$[\]/]/g, '').slice(0, 60);
        guestSeq++;
        return 'guest_' + (safe || 'player') + '_' + now().toString(36) + guestSeq.toString(36) +
            Math.random().toString(36).slice(2, 6);
    }

    /**
     * Ищет запись справочника для участника: сначала по явному uid, затем по
     * ФИО (только «сильное» совпадение — однофамильцы остаются разными людьми).
     */
    function findDirectoryUid(users, pub, parts, explicitUid) {
        var wanted = core().trim(explicitUid);
        if (wanted && (asMap(users)[wanted] || asMap(pub)[wanted])) return wanted;
        var key = directoryKey(parts);
        if (!key) return '';
        var samePerson = typeof root.isSamePersonByFio === 'function' ? root.isSamePersonByFio : null;
        var partsOf = typeof root.getNamePartsNormalized === 'function'
            ? root.getNamePartsNormalized
            : function (v) { return normName(v).split(' ').filter(Boolean); };
        var candidates = {};
        Object.keys(asMap(users)).forEach(function (uid) { candidates[uid] = asMap(users)[uid]; });
        Object.keys(asMap(pub)).forEach(function (uid) { if (!candidates[uid]) candidates[uid] = asMap(pub)[uid]; });
        var found = '';
        Object.keys(candidates).forEach(function (uid) {
            if (found) return;
            var u = asMap(candidates[uid]);
            if (!u || u.deleted) return;
            if (typeof root.isPlayerDeleted === 'function' && root.isPlayerDeleted(uid, u.name)) return;
            var name = core().trim(u.name) || [u.lastName, u.firstName, u.middleName].filter(Boolean).join(' ');
            if (!name) return;
            var otherKey = normName(name);
            if (otherKey === key) { found = uid; return; }
            if (!samePerson) return;
            var otherParts = partsOf(name);
            // Порядок «Фамилия Имя Отчество» и «Имя Отчество Фамилия» — один человек.
            if (samePerson(partsOf([parts.lastName, parts.firstName, parts.middleName].filter(Boolean).join(' ')),
                otherParts, key, otherKey) === 'strong') found = uid;
            else if (samePerson(partsOf(parts.name), otherParts, normName(parts.name), otherKey) === 'strong') found = uid;
        });
        return found;
    }

    var DIRECTORY_PUBLIC_FIELDS = ['name', 'firstName', 'lastName', 'middleName', 'gender', 'handicap',
        'defaultTee', 'isGuest', 'createdAt', 'roundsPlayed', 'hcpUpdatedAt', 'hcpSource'];

    function publicMirrorOf(record) {
        var out = {};
        DIRECTORY_PUBLIC_FIELDS.forEach(function (field) {
            if (asMap(record)[field] !== undefined) out[field] = asMap(record)[field];
        });
        return out;
    }

    /**
     * Запись справочника для участника турнира. Существующие данные не
     * затираются: дополняются только пустые поля, гандикап — по режиму
     * (fill — если своего нет, push — всегда из турнира, none — не трогать).
     */
    function directoryRecordFor(parts, uid, existing, tid, mode) {
        var prev = asMap(existing);
        var record = {
            name: core().trim(prev.name) || parts.name,
            firstName: core().trim(prev.firstName) || parts.firstName,
            middleName: core().trim(prev.middleName) || parts.middleName,
            lastName: core().trim(prev.lastName) || parts.lastName,
            gender: prev.gender || parts.gender,
            defaultTee: core().trim(prev.defaultTee) || parts.tee,
            isGuest: prev.isGuest === undefined ? String(uid).indexOf('guest_') === 0 : !!prev.isGuest,
            createdAt: prev.createdAt || now(),
            roundsPlayed: parseInt(prev.roundsPlayed, 10) || 0,
            tnSource: 'tournament',
            tnTournamentId: String(tid || ''),
            tnSyncedAt: now()
        };
        var prevHcp = (prev.handicap != null && prev.handicap !== '') ? Number(prev.handicap) : null;
        var ownHcp = parts.hi;
        var write = mode === 'push' ? ownHcp != null : (ownHcp != null && prevHcp == null);
        if (write) {
            record.handicap = ownHcp;
            record.hcpUpdatedAt = now();
            // АГР — первоисточник: его отметку не перебиваем.
            record.hcpSource = prev.hcpSource === 'rusgolf' ? 'rusgolf' : 'tournament';
        } else if (prevHcp != null) {
            record.handicap = prevHcp;
            if (prev.hcpUpdatedAt) record.hcpUpdatedAt = prev.hcpUpdatedAt;
            if (prev.hcpSource) record.hcpSource = prev.hcpSource;
        }
        return record;
    }

    /** Пишем порциями: на крупном турнире путей много (users + usersPublic). */
    function writeInChunks(updates, size) {
        var keys = Object.keys(updates || {});
        if (!keys.length) return Promise.resolve();
        var db = database();
        if (!db) return Promise.reject(new Error('Нет соединения с базой'));
        var limit = size || 200;
        var chain = Promise.resolve();
        for (var i = 0; i < keys.length; i += limit) {
            (function (chunkKeys) {
                var chunk = {};
                chunkKeys.forEach(function (key) { chunk[key] = updates[key]; });
                chain = chain.then(function () { return db.ref().update(chunk); });
            })(keys.slice(i, i + limit));
        }
        return chain;
    }

    /** Игровой гандикап (CH) для HI + ТИ + пола — как в карточке участника. */
    function directoryFieldHcp(hi, tee, gender) {
        if (hi == null || hi === '' || !isFinite(Number(hi))) return null;
        if (typeof root.getFieldHcp === 'function') {
            try { return root.getFieldHcp(Number(hi), tee || 'wh', gender || 'men'); } catch (e) { /* silent */ }
        }
        return core().courseHandicap ? core().courseHandicap(Number(hi), null, root.TOTAL_PAR || 72) : Math.round(Number(hi));
    }

    /**
     * Регистрирует участников турнира в справочнике сайта (гостями, если их
     * там ещё нет) и сохраняет uid в записи участника.
     * options.handicaps: 'fill' (по умолчанию) | 'push' | 'none'.
     */
    function syncPlayersToDirectory(tid, players, options) {
        var opts = options || {};
        var mode = opts.handicaps === 'push' || opts.handicaps === 'none' ? opts.handicaps : 'fill';
        var list = (players || []).filter(function (player) {
            return player && (core().trim(player.fio) || core().trim(player.name));
        });
        var result = { added: 0, updated: 0, ids: {}, error: '' };
        if (!database() || !list.length) return Promise.resolve(result);
        return Promise.all([read('users'), read('usersPublic')]).then(function (res) {
            var users = asMap(res[0]);
            var pub = asMap(res[1]);
            var updates = {};
            list.forEach(function (player) {
                var parts = directoryParts(player);
                if (!parts.name) return;
                var uid = findDirectoryUid(users, pub, parts, player.uid || player.directoryUid);
                var existing = uid ? (users[uid] || pub[uid]) : null;
                if (uid) result.updated++;
                else { uid = guestUidFor(parts); result.added++; }
                var record = directoryRecordFor(parts, uid, existing, tid, mode);
                var prevUser = asMap(users[uid]);
                updates['users/' + uid] = Object.assign({}, prevUser, record, {
                    role: prevUser.role || 'player'
                });
                updates['usersPublic/' + uid] = Object.assign({}, publicMirrorOf(asMap(pub[uid])), publicMirrorOf(record));
                if (player.id) {
                    updates['tournaments/' + tid + '/players/' + player.id + '/uid'] = uid;
                    updates['tournaments/' + tid + '/players/' + player.id + '/directorySyncedAt'] = now();
                    updates['tournaments/' + tid + '/registeredPlayers/' + player.id + '/uid'] = uid;
                }
                result.ids[player.id || parts.name] = uid;
                // Следующий однофамилец из этого же списка не должен создать дубль.
                users[uid] = updates['users/' + uid];
                pub[uid] = updates['usersPublic/' + uid];
            });
            return writeInChunks(updates).then(function () { return result; });
        }).catch(function (err) {
            result.error = (err && err.message) ? err.message : String(err);
            return result;
        });
    }

    /** Гандикапы турнира → справочник сайта (HI участника перезаписывает профиль). */
    function pushHandicapsToDirectory(tid, players) {
        return syncPlayersToDirectory(tid, players, { handicaps: 'push' });
    }

    /**
     * Гандикапы справочника → участники турнира: HI из профиля (админка/АГР)
     * и пересчитанный CH. Ручной CH организатора не затирается (см. utils.js
     * pestovoSyncHcpToTournaments — та же логика).
     */
    function pullHandicapsFromDirectory(tid, players, tournament) {
        var list = (players || []).filter(function (player) { return player && player.id; });
        var result = { updated: 0, missing: 0, error: '' };
        if (!database() || !list.length) return Promise.resolve(result);
        return Promise.all([read('users'), read('usersPublic'), read('tournaments/' + tid + '/sheets')]).then(function (res) {
            var users = asMap(res[0]);
            var pub = asMap(res[1]);
            var sheets = asMap(res[2]);
            var updates = {};
            list.forEach(function (player) {
                var parts = directoryParts(player);
                var uid = findDirectoryUid(users, pub, parts, player.uid || player.directoryUid);
                if (!uid) { result.missing++; return; }
                var source = asMap(users[uid]).handicap != null ? asMap(users[uid]) : asMap(pub[uid]);
                var hcp = (source.handicap != null && source.handicap !== '') ? Number(source.handicap) : null;
                if (hcp == null || !isFinite(hcp)) { result.missing++; return; }
                var tee = parts.tee || core().trim(source.defaultTee) || 'wh';
                var pid = player.id;
                var oldHi = (player.hi != null && player.hi !== '') ? Number(player.hi) : null;
                var oldCh = (player.ch != null && player.ch !== '') ? Number(player.ch) : null;
                var chIsAuto = oldCh == null || directoryFieldHcp(oldHi, tee, parts.gender) === oldCh;
                var newCh = directoryFieldHcp(hcp, tee, parts.gender);
                if (oldHi === hcp && (!chIsAuto || oldCh === newCh)) return;
                var base = 'tournaments/' + tid + '/players/' + pid;
                updates[base + '/hi'] = hcp;
                updates[base + '/uid'] = uid;
                if (chIsAuto && newCh != null) updates[base + '/ch'] = newCh;
                var mirror = 'tournaments/' + tid + '/registeredPlayers/' + pid;
                updates[mirror + '/handicap'] = hcp;
                updates[mirror + '/hi'] = hcp;
                updates[mirror + '/uid'] = uid;
                if (chIsAuto && newCh != null) updates[mirror + '/ch'] = newCh;
                Object.keys(sheets).forEach(function (rid) {
                    var entry = asMap(asMap(sheets[rid]).entries)[pid];
                    if (!entry) return;
                    var entryPath = 'tournaments/' + tid + '/sheets/' + rid + '/entries/' + pid;
                    updates[entryPath + '/hi'] = hcp;
                    if (chIsAuto && newCh != null) updates[entryPath + '/ch'] = newCh;
                });
                result.updated++;
            });
            return writeInChunks(updates).then(function () { return result; });
        }).catch(function (err) {
            result.error = (err && err.message) ? err.message : String(err);
            return result;
        });
    }

    // ----------------------------------------------------------
    // СТАРТОВЫЙ ЛИСТ
    // ----------------------------------------------------------
    var DEFAULT_COLUMNS = [
        { key: 'position', ru: 'Поз.', en: 'Pos.', on: true, width: 6 },
        { key: 'playerName', ru: 'Игрок', en: 'Player', on: true, width: 26 },
        { key: 'hi', ru: 'HI', en: 'HI', on: true, width: 7 },
        { key: 'ch', ru: 'CH', en: 'CH', on: true, width: 7 },
        { key: 'tee', ru: 'ТИ', en: 'Tee', on: true, width: 8 },
        { key: 'format', ru: 'Формат', en: 'Format', on: true, width: 16 },
        { key: 'groupName', ru: 'Группа', en: 'Group', on: true, width: 12 },
        { key: 'markerName', ru: 'Маркер', en: 'Marker', on: true, width: 18 },
        { key: 'flight', ru: 'Флайт', en: 'Flight', on: true, width: 8 },
        { key: 'startHole', ru: 'Лунка', en: 'Hole', on: true, width: 6 },
        { key: 'startTime', ru: 'Время', en: 'Time', on: true, width: 9 },
        { key: 'order', ru: '№', en: 'No.', on: true, width: 6 }
    ];

    function sheetColumns(sheet) {
        var stored = sheet && Array.isArray(sheet.columns) && sheet.columns.length ? sheet.columns : null;
        if (!stored) return core().clone(DEFAULT_COLUMNS);
        // Храним только размеченные колонки, дополняем новыми из набора по умолчанию.
        var known = {};
        stored.forEach(function (column) { known[column.key] = true; });
        var extras = DEFAULT_COLUMNS.filter(function (column) { return !known[column.key]; });
        return stored.concat(extras);
    }

    function sheetOrder(sheet) {
        return listOf(asMap(sheet && sheet.entries)).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    }

    /** Перестраивает персональные QR и назначения маркеров для всего листа. */
    function markerQrIndex(sourceEntries, rid) {
        var entries = {};
        Object.keys(asMap(sourceEntries)).forEach(function (pid) {
            entries[pid] = Object.assign({}, asMap(sourceEntries)[pid], { playerId: asMap(sourceEntries)[pid].playerId || pid });
        });
        var base = root.baseUrl ? root.baseUrl() : '';
        var buckets = {};
        Object.keys(entries).forEach(function (pid) {
            var entry = entries[pid];
            var key = entry.startGroupId || ((entry.flight || entry.groupId || entry.groupName || entry.startTime) ?
                [entry.flight || '', entry.groupId || entry.groupName || '', entry.startHole || 1, entry.startTime || ''].join('|') : 'single:' + pid);
            buckets[key] = buckets[key] || [];
            buckets[key].push(entry);
        });
        var markers = {};
        Object.keys(buckets).forEach(function (key, groupIndex) {
            var groupEntries = buckets[key].sort(function (a, b) {
                return (a.position || 0) - (b.position || 0) || (a.order || 0) - (b.order || 0) ||
                    String(a.playerId).localeCompare(String(b.playerId), 'ru');
            });
            var inGroup = {};
            groupEntries.forEach(function (item) { inGroup[item.playerId] = true; });
            groupEntries.forEach(function (entry, index) {
                var fallback = groupEntries.length > 1 ? groupEntries[(index + 1) % groupEntries.length].playerId : entry.playerId;
                // Маркер обязан быть из этой же стартовой группы: в раунд
                // rounds/<groupRoundId> попадают только её игроки, поэтому
                // «чужой» маркер получал бы страницу просмотра без ввода счёта.
                var explicit = entry.markerPlayerId || '';
                var markerId = explicit && inGroup[explicit] ? explicit : fallback;
                entry.markerPlayerId = markerId;
                entry.qr = core().scoreUrl(base, entry.groupRoundId || rid, markerId, markerId !== entry.playerId ? Math.max(2, groupEntries.length) : groupEntries.length);
                entry.scoreUrl = entry.qr;
                if (!markers[markerId]) {
                    markers[markerId] = {
                        playerId: markerId, groupId: entry.groupId || '', groupName: entry.groupName || '',
                        flight: entry.flight || '', startGroupId: entry.startGroupId || '', groupRoundId: entry.groupRoundId || '',
                        startHole: entry.startHole || 1, startTime: entry.startTime || '',
                        position: groupIndex + 1, qr: entry.qr, generatedAt: now(), targets: {}
                    };
                }
                markers[markerId].targets[entry.playerId] = true;
            });
        });
        return { entries: entries, markers: markers };
    }

    /**
     * Генерация стартового листа раунда: создаёт (или обновляет)
     * sheets/<rid> и раунды групп rounds/<groupRoundId> для ввода счёта.
     */
    function generateSheet(tid, rid, options, tournament) {
        var o = options || {};
        var round = asMap(asMap(tournament && tournament.rounds)[rid]);
        if (!round.id) return Promise.reject(new Error('Раунд не найден'));
        var base = root.baseUrl ? root.baseUrl() : '';
        var players = listOf(asMap(tournament && tournament.players));
        var groups = listOf(asMap(tournament && tournament.groups));
        // Игроки получают группу из справочника групп (по диапазону гандикапа).
        players = players.map(function (player) {
            var group = groupForPlayer(tournament, player);
            return Object.assign({}, player, { groupName: group ? group.name : '' });
        });
        var built = core().buildSheet({
            players: players,
            groups: groups,
            groupSize: o.groupSize || 4,
            startInterval: o.startInterval || 8,
            firstTeeTime: o.firstTeeTime || round.startTime || (tournament && tournament.startTime) || '09:00',
            tee: o.tee || round.tee || '',
            format: o.format || ((tournament && tournament.formats) || [])[0] || '',
            markMode: o.markMode || 'group',
            groupsPerFlight: o.groupsPerFlight || 3,
            flights: o.flights !== false,
            startMode: o.startMode || 'sequential',
            startHole: o.startHole || 1
        });
        var rawEntries = {};
        built.entries.forEach(function (entry) { rawEntries[entry.playerId] = Object.assign({}, entry); });
        // Каждый QR ведёт в режим маркера, назначенного для счёта именно этого игрока.
        var indexed = markerQrIndex(rawEntries, rid);
        var entries = indexed.entries;
        var markers = indexed.markers;
        var sheet = {
            roundId: rid,
            tournamentId: tid,
            createdAt: now(),
            updatedAt: now(),
            options: clean(Object.assign({}, built.options, {
                firstTeeTime: built.options.firstTeeTime,
                tee: o.tee || round.tee || '',
                format: o.format || ((tournament && tournament.formats) || [])[0] || ''
            })),
            entries: entries,
            markers: markers,
            columns: core().clone(DEFAULT_COLUMNS),
            qr: clean({
                payload: base ? base + 'tournaments.html?id=' + encodeURIComponent(tid) : 'tournament:' + tid,
                generatedAt: now()
            })
        };
        return write('tournaments/' + tid + '/sheets/' + rid, sheet)
            .then(function () { return materializeRound(tid, rid, sheet, tournament); })
            .then(function (info) {
                return patch('tournaments/' + tid + '/rounds/' + rid, clean({
                    sheetAt: now(),
                    groupRounds: info.groupRounds,
                    groupRoundId: info.groupRounds['0'] || ''
                }));
            })
            .then(function () { return sheet; });
    }

    /**
     * Создаёт раунды групп в rounds/ — контракт страниц ввода счёта
     * (setup-round.html / scorer.html / live.js).
     */
    function materializeRound(tid, rid, sheet, tournament) {
        var round = asMap(asMap(tournament && tournament.rounds)[rid]);
        var entries = sheetOrder(sheet);
        // Назначения маркеров считаем тем же кодом, что и QR стартового листа:
        // иначе rounds/<gid>/markerAssignments мог разойтись с напечатанным QR
        // (игрок сканирует карточку и не видит счёт партнёра).
        var markerIndex = markerQrIndex(asMap(sheet && sheet.entries), rid);
        var groups = [];
        var seen = {};
        entries.forEach(function (entry) {
            var key = entry.startGroupId || [entry.flight || '', entry.groupId || entry.groupName || '', entry.startHole || 1, entry.startTime || ''].join('|');
            if (!seen[key]) {
                seen[key] = { key: key, entries: [] };
                groups.push(seen[key]);
            }
            seen[key].entries.push(entry);
        });
        var existing = asMap(round.groupRounds);
        var groupRounds = {};
        var tournamentPlayers = asMap(tournament && tournament.players);
        var updates = {};
        var chains = [];
        groups.forEach(function (group, index) {
            var groupRoundId = (group.entries[0] && group.entries[0].groupRoundId) || existing[index] || pushKey('rounds');
            groupRounds[index] = groupRoundId;
            group.entries.forEach(function (entry) { entry.groupRoundId = groupRoundId; });
            var players = {};
            var markerAssignments = {};
            var participants = [];
            var ids = group.entries.map(function (entry) { return entry.playerId; });
            group.entries.forEach(function (entry) {
                var player = asMap(tournamentPlayers[entry.playerId]);
                var entryRecord = clean({
                    id: entry.playerId,
                    name: entry.playerName,
                    firstName: entry.firstName || player.firstName || '',
                    middleName: entry.middleName || player.middleName || '',
                    lastName: entry.lastName || player.lastName || '',
                    tee: entry.tee || player.tee || '',
                    gender: core().normalizeGender(entry.gender || player.gender) || '',
                    exactHcp: entry.hi !== '' && entry.hi != null ? entry.hi : (player.hi != null ? player.hi : null),
                    fieldHcp: entry.ch !== '' && entry.ch != null ? entry.ch : (player.ch != null ? player.ch : null),
                    isGuest: String(entry.playerId).indexOf('guest_') === 0
                });
                players[entry.playerId] = entryRecord;
                participants.push(entry.playerId);
            });
            // QR открывает ввод от имени маркера, а его назначение указывает
            // на игрока, чей счёт он ведёт. Для старых/вручную добавленных
            // строк без назначения сохраняем безопасное кольцо по составу.
            var ring = group.entries.map(function (entry) { return entry.playerId; });
            group.entries.forEach(function (entry, position) {
                var targetPid = entry.playerId;
                var indexedEntry = markerIndex.entries[entry.playerId] || {};
                var markerId = indexedEntry.markerPlayerId || entry.markerPlayerId ||
                    (ring.length > 1 ? ring[(position + 1) % ring.length] : '');
                if (!markerId || markerId === targetPid) return;
                // Маркера вне этой группы в rounds/<groupRoundId> нет — он не
                // смог бы ввести счёт (страница открывается только участникам).
                if (!players[markerId]) return;
                if (players[targetPid]) players[targetPid].markedBy = markerId;
                markerAssignments[markerId] = clean({
                    targetId: targetPid,
                    targetName: entry.playerName || (players[targetPid] && players[targetPid].name) || '',
                    groupId: entry.groupId || '',
                    tournamentRound: rid
                });
            });
            var flight = group.entries[0].flight || '';
            var startTimeText = group.entries[0].startTime || '09:00';
            var startTs = core().timestampFromDateTime(round.date || (tournament && tournament.startDate), startTimeText);
            var markerPid = group.entries.filter(function (entry) { return entry.markerPlayerId === entry.playerId; })[0];
            var creator = (markerPid && markerPid.playerId && String(markerPid.playerId).indexOf('guest_') !== 0)
                ? markerPid.playerId : currentUid();
            var formats = core().uniq(group.entries.map(function (entry) { return entry.format; }).filter(Boolean));
            var roundMeta = clean({
                mode: 'group',
                tournamentId: tid,
                tournamentName: tournament && tournament.name || '',
                tournamentRoundId: rid,
                tournamentRound: true,
                date: round.date || (tournament && tournament.startDate) || '',
                groupNo: index + 1,
                groupsTotal: groups.length,
                groupName: group.entries[0].groupName || '',
                flight: flight,
                startHole: core().intOf(group.entries[0].startHole, 1) || 1,
                holeRange: '1-18',
                startTime: startTs,
                startTimeText: startTimeText,
                scheduledStart: startTs,
                tee: group.entries[0].tee || 'wh',
                teeLabel: core().teeName(group.entries[0].tee, 'ru'),
                format: formats[0] || '',
                formats: formats,
                // Раунды стартового листа по умолчанию «запланированы» и
                // открываются ровно в момент старта. Но если турнир УЖЕ
                // начат (принудительный «Старт» или плановое время прошло),
                // новый раунд сразу игровой — иначе добавленный в лист игрок
                // снова видел бы «Турнир ещё не начался».
                status: tournamentStarted(tournament) ? 'active' : 'scheduled',
                accessKey: 'tn_' + tid + '_' + rid + '_' + index + '_' + Math.random().toString(36).slice(2, 8),
                createdBy: creator,
                participantsList: participants,
                markerAssignments: markerAssignments,
                updatedAt: now()
            });
            // Сливаем метаданные, сохраняя уже введённый счёт; createdAt
            // ставим только при первом создании раунда группы, а статус
            // живого раунда не сбрасываем: раньше каждая правка стартового
            // листа возвращала rounds/<gid> в 'scheduled', и ввод счёта по QR
            // переставал проходить на сервере («раунд не активен»).
            chains.push(read('rounds/' + groupRoundId).then(function (existingRound) {
                var prev = asMap(existingRound);
                var meta = Object.assign({}, roundMeta);
                if (!prev.createdAt) meta.createdAt = now();
                if (prev.status && prev.status !== 'scheduled') meta.status = prev.status;
                else if (prev.activatedAt) meta.status = 'active';
                return patch('rounds/' + groupRoundId, meta);
            }).catch(function () { /* права/офлайн */ }));
            Object.keys(players).forEach(function (pid) {
                chains.push(patch('rounds/' + groupRoundId + '/players/' + pid, players[pid]).catch(function () { /* silent */ }));
            });
            // Пустые слоты игроков, оставшиеся от прошлой версии листа, убираем.
            chains.push(read('rounds/' + groupRoundId + '/players').then(function (existingPlayers) {
                var stale = {};
                Object.keys(asMap(existingPlayers)).forEach(function (pid) {
                    if (!players[pid]) stale['rounds/' + groupRoundId + '/players/' + pid] = null;
                });
                if (Object.keys(stale).length) return multi(stale).catch(function () { /* silent */ });
                return null;
            }).catch(function () { /* silent */ }));
        });
        // После назначения groupRoundId обновляем payload: QR должен вести
        // на реальный раунд ввода счёта группы, а не на запись турнира.
        var qrIndex = markerQrIndex(asMap(sheet && sheet.entries), rid);
        Object.keys(qrIndex.entries).forEach(function (pid) {
            var qrEntry = qrIndex.entries[pid];
            updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + pid + '/groupRoundId'] = qrEntry.groupRoundId || null;
            updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + pid + '/markerPlayerId'] = qrEntry.markerPlayerId || null;
            updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + pid + '/qr'] = qrEntry.qr || null;
            updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + pid + '/scoreUrl'] = qrEntry.scoreUrl || null;
        });
        updates['tournaments/' + tid + '/sheets/' + rid + '/markers'] = Object.keys(qrIndex.markers).length ? qrIndex.markers : null;
        // Раунды групп, которых больше нет в листе, удаляем.
        Object.keys(existing).forEach(function (index) {
            if (groupRounds[index]) return;
            updates['rounds/' + existing[index]] = null;
        });
        if (Object.keys(updates).length) chains.push(multi(updates).catch(function () { /* silent */ }));
        return Promise.all(chains).then(function () {
            return { groupRounds: groupRounds, groups: groups };
        });
    }

    /** Правка строки стартового листа (инлайн) + синхронизация. */
    function updateSheetEntry(tid, rid, pid, fields, tournament) {
        var sheet = asMap(asMap(tournament && tournament.sheets)[rid]);
        var entry = asMap(asMap(sheet.entries)[pid]);
        if (!entry.playerId) return Promise.resolve(null);
        var next = Object.assign({}, entry, fields || {});
        var updates = {};
        Object.keys(fields || {}).forEach(function (key) {
            updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + pid + '/' + key] = fields[key];
        });
        updates['tournaments/' + tid + '/sheets/' + rid + '/updatedAt'] = now();
        // Правки маркера/состава перестраивают все QR: на каждой карточке
        // ссылка должна открывать ввод от имени назначенного маркера.
        var markerRelated = ['markerPlayerId', 'playerName', 'startTime', 'startHole', 'groupId', 'groupName', 'flight', 'position'];
        var refreshMarkers = fields && markerRelated.some(function (key) { return fields[key] !== undefined; });
        if (refreshMarkers) {
            var prospective = Object.assign({}, asMap(sheet.entries), {});
            prospective[pid] = next;
            var indexed = markerQrIndex(prospective, rid);
            updates['tournaments/' + tid + '/sheets/' + rid + '/markers'] = Object.keys(indexed.markers).length ? indexed.markers : null;
            Object.keys(indexed.entries).forEach(function (entryId) {
                var indexedEntry = indexed.entries[entryId];
                updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + entryId + '/markerPlayerId'] = indexedEntry.markerPlayerId || null;
                updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + entryId + '/qr'] = indexedEntry.qr || null;
                updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + entryId + '/scoreUrl'] = indexedEntry.scoreUrl || null;
            });
        }
        // Синхронизация с участником турнира.
        var playerPatch = {};
        if (fields && fields.playerName) { playerPatch.fio = fields.playerName; playerPatch.name = fields.playerName; }
        if (fields && fields.tee !== undefined) playerPatch.tee = fields.tee;
        if (fields && fields.format !== undefined) playerPatch.format = fields.format;
        if (fields && fields.hi !== undefined) playerPatch.hi = fields.hi;
        if (fields && fields.ch !== undefined) playerPatch.ch = fields.ch;
        if (fields && fields.groupId !== undefined) playerPatch.groupId = fields.groupId;
        Object.keys(playerPatch).forEach(function (key) {
            updates['tournaments/' + tid + '/players/' + pid + '/' + key] = playerPatch[key];
        });
        if (playerPatch.fio) updates['tournaments/' + tid + '/registeredPlayers/' + pid + '/name'] = playerPatch.fio;
        if (playerPatch.hi !== undefined) updates['tournaments/' + tid + '/registeredPlayers/' + pid + '/handicap'] = playerPatch.hi;
        if (playerPatch.tee !== undefined) updates['tournaments/' + tid + '/registeredPlayers/' + pid + '/tee'] = playerPatch.tee;
        if (playerPatch.groupId !== undefined) updates['tournaments/' + tid + '/registeredPlayers/' + pid + '/groupId'] = playerPatch.groupId;
        // Смена группы в листе: обновляем состав групп.
        if (fields && fields.groupId !== undefined && entry.groupId !== fields.groupId) {
            listOf(asMap(tournament && tournament.groups)).forEach(function (group) {
                if (group.id === fields.groupId) return;
                updates['tournaments/' + tid + '/groups/' + group.id + '/members/' + pid] = null;
                updates['tournaments/' + tid + '/divisions/' + group.id + '/members/' + pid] = null;
            });
            if (fields.groupId) {
                updates['tournaments/' + tid + '/groups/' + fields.groupId + '/members/' + pid] = next.playerName || entry.playerName;
                updates['tournaments/' + tid + '/divisions/' + fields.groupId + '/members/' + pid] = next.playerName || entry.playerName;
            }
        }
        return multi(updates).then(function () {
            // Порядок в листе изменился — перенумеровываем строки и строки групп.
            if (fields && (fields.order != null || fields.startTime != null || fields.groupId != null || fields.flight != null)) {
                return read('tournaments/' + tid + '/sheets/' + rid).then(function (fresh) {
                    var ordered = core().recalcSheet(sheetOrder(fresh || sheet));
                    var renumber = {};
                    ordered.forEach(function (item, index) {
                        renumber['tournaments/' + tid + '/sheets/' + rid + '/entries/' + item.playerId + '/order'] = index + 1;
                    });
                    return multi(renumber).catch(function () { /* silent */ });
                });
            }
            return null;
        }).then(function () {
            return read('tournaments/' + tid + '/sheets/' + rid);
        }).then(function (fresh) {
            if (fresh) return materializeRound(tid, rid, fresh, tournament).then(function () { return fresh; });
            return null;
        });
    }

    function addSheetEntry(tid, rid, input, tournament) {
        var sheet = asMap(asMap(tournament && tournament.sheets)[rid]);
        var entry = Object.assign({}, input || {});
        var pid = entry.playerId;
        if (!pid) return Promise.resolve(null);
        var order = sheetOrder(sheet).length + 1;
        entry.order = entry.order || order;
        entry.position = entry.position || 1;
        entry.startGroupId = entry.startGroupId || 'manual_' + pid;
        var prospective = Object.assign({}, asMap(sheet.entries));
        prospective[pid] = entry;
        var indexed = markerQrIndex(prospective, rid);
        var updates = {};
        Object.keys(indexed.entries).forEach(function (entryId) {
            updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + entryId] = clean(indexed.entries[entryId]);
        });
        updates['tournaments/' + tid + '/sheets/' + rid + '/markers'] = indexed.markers;
        updates['tournaments/' + tid + '/sheets/' + rid + '/updatedAt'] = now();
        return multi(updates).then(function () { return read('tournaments/' + tid + '/sheets/' + rid); })
            .then(function (fresh) {
                if (fresh) return materializeRound(tid, rid, fresh, tournament).then(function () { return fresh; });
                return null;
            });
    }

    function removeSheetEntry(tid, rid, pid, tournament) {
        var sheet = asMap(asMap(tournament && tournament.sheets)[rid]);
        var prospective = Object.assign({}, asMap(sheet.entries));
        delete prospective[pid];
        var indexed = markerQrIndex(prospective, rid);
        var updates = {};
        updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + pid] = null;
        Object.keys(indexed.entries).forEach(function (entryId) {
            updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + entryId] = clean(indexed.entries[entryId]);
        });
        updates['tournaments/' + tid + '/sheets/' + rid + '/markers'] = Object.keys(indexed.markers).length ? indexed.markers : null;
        updates['tournaments/' + tid + '/sheets/' + rid + '/updatedAt'] = now();
        return multi(updates).then(function () { return read('tournaments/' + tid + '/sheets/' + rid); })
            .then(function (fresh) {
                if (fresh) return materializeRound(tid, rid, fresh, tournament).then(function () { return fresh; });
                return null;
            });
    }

    function saveSheetColumns(tid, rid, columns) {
        return patch('tournaments/' + tid + '/sheets/' + rid, { columns: columns || [], updatedAt: now() });
    }

    function deleteSheet(tid, rid, tournament) {
        var round = asMap(asMap(tournament && tournament.rounds)[rid]);
        var updates = {};
        updates['tournaments/' + tid + '/sheets/' + rid] = null;
        Object.keys(asMap(round.groupRounds)).forEach(function (index) {
            updates['rounds/' + round.groupRounds[index]] = null;
        });
        updates['tournaments/' + tid + '/rounds/' + rid + '/groupRounds'] = null;
        updates['tournaments/' + tid + '/rounds/' + rid + '/groupRoundId'] = null;
        return multi(updates);
    }

    // ----------------------------------------------------------
    // СЧЁТ И РЕЗУЛЬТАТЫ
    // ----------------------------------------------------------
    function roundGroupRoundIds(tournament, rid) {
        var round = asMap(asMap(tournament && tournament.rounds)[rid]);
        var ids = Object.keys(asMap(round.groupRounds)).map(function (key) { return round.groupRounds[key]; });
        if (round.groupRoundId) ids.push(round.groupRoundId);
        return core().uniq(ids.filter(Boolean));
    }

    /**
     * Чтение счёта раунда: объединяет раунды групп (живой ввод)
     * и зеркало tournaments/<tid>/scores/<rid> (правки организатора).
     */
    function readRoundScores(tid, rid, tournament) {
        var ids = roundGroupRoundIds(tournament || {}, rid);
        return Promise.all([
            Promise.all(ids.map(function (gid) { return read('rounds/' + gid); })),
            read('tournaments/' + tid + '/scores/' + rid)
        ]).then(function (res) {
            var merged = {};
            var rounds = res[0] || [];
            rounds.forEach(function (groupRound) {
                Object.keys(asMap(groupRound && groupRound.players)).forEach(function (pid) {
                    var player = asMap(groupRound.players)[pid];
                    var scores = asMap(player.scores);
                    Object.keys(scores).forEach(function (hole) {
                        merged[pid] = merged[pid] || {};
                        merged[pid][hole] = scores[hole];
                    });
                });
            });
            var mirror = asMap(res[1]);
            Object.keys(mirror).forEach(function (pid) {
                Object.keys(asMap(mirror[pid])).forEach(function (hole) {
                    merged[pid] = merged[pid] || {};
                    if (merged[pid][hole] == null) merged[pid][hole] = asMap(mirror[pid])[hole];
                });
            });
            return merged;
        });
    }

    /** Правка удара: пишем и в раунд группы, и в зеркало турнира. */
    function writeScore(tid, rid, pid, hole, strokes, tournament) {
        var value = strokes === '' || strokes == null ? null : parseInt(strokes, 10);
        var updates = {};
        updates['tournaments/' + tid + '/scores/' + rid + '/' + pid + '/' + hole] = value;
        var ids = roundGroupRoundIds(tournament || {}, rid);
        ids.forEach(function (gid) {
            updates['rounds/' + gid + '/players/' + pid + '/scores/' + hole] = value;
            updates['rounds/' + gid + '/players/' + pid + '/submitted/' + hole] = value == null ? false : true;
            updates['rounds/' + gid + '/players/' + pid + '/holeTimes/' + hole] = now();
        });
        return multi(updates);
    }

    /** Ручная правка HI/CH/форы игрока (доступна администратору). */
    function writePlayerHandicap(tid, pid, fields) {
        return patch('tournaments/' + tid + '/players/' + pid, clean(fields || {}));
    }

    function writePlayerFores(tid, pid, hole, value) {
        return patch('tournaments/' + tid + '/players/' + pid + '/fores', (function () {
            var patchValue = {};
            patchValue[hole] = value === '' || value == null ? null : parseInt(value, 10);
            return patchValue;
        })());
    }

    /** Сохраняет посчитанные результаты раунда (ручные правки не затирает). */
    function saveResults(tid, rid, rows, options) {
        var opts = options || {};
        var updates = {};
        (rows || []).forEach(function (row) {
            var path = 'tournaments/' + tid + '/results/' + rid + '/' + row.playerId;
            var payload = clean({
                playerName: row.playerName,
                gross: row.gross,
                net: row.net,
                points: row.points,
                place: row.place === '' ? null : row.place,
                holesPlayed: row.holesPlayed,
                updatedAt: now()
            });
            if (!row.manual || opts.force) updates[path] = payload;
            else updates[path + '/place'] = row.place === '' ? null : row.place;
        });
        updates['tournaments/' + tid + '/results/' + rid + '/_updatedAt'] = now();
        return multi(updates);
    }

    /** Ручное редактирование результата организатором. */
    function overrideResult(tid, rid, pid, fields) {
        var payload = clean(Object.assign({}, fields || {}, { manual: true, updatedAt: now() }));
        return patch('tournaments/' + tid + '/results/' + rid + '/' + pid, payload);
    }

    return {
        // инфраструктура
        database: database, currentUid: currentUid, ref: ref, read: read, write: write,
        patch: patch, remove: remove, multi: multi, listOf: listOf, asMap: asMap, clean: clean,
        // справочники и черновики
        loadFormatCatalog: loadFormatCatalog, addFormat: addFormat,
        saveDraft: saveDraft, loadDraft: loadDraft, clearDraft: clearDraft,
        // турниры
        createTournament: createTournament, updateTournament: updateTournament,
        deleteTournament: deleteTournament, setTournamentStatus: setTournamentStatus,
        startTournament: startTournament, forceFinishTournament: forceFinishTournament,
        pauseTournament: pauseTournament, resumeTournament: resumeTournament,
        tournamentPaused: tournamentPaused, tournamentGroupRounds: tournamentGroupRounds,
        watchTournaments: watchTournaments, watchTournament: watchTournament, watchGroupRounds: watchGroupRounds,
        // раунды
        addRound: addRound, updateRound: updateRound, saveScorecardLayout: saveScorecardLayout, deleteRound: deleteRound,
        // группы
        addGroup: addGroup, updateGroup: updateGroup, deleteGroup: deleteGroup,
        setGroupMembers: setGroupMembers, groupForPlayer: groupForPlayer,
        distributeTournamentPlayers: distributeTournamentPlayers,
        // участники
        addPlayer: addPlayer, addPlayers: addPlayers, updatePlayer: updatePlayer, removePlayer: removePlayer,
        // справочник игроков сайта (гости из турнира) и синхронизация гандикапов
        syncPlayersToDirectory: syncPlayersToDirectory, pushHandicapsToDirectory: pushHandicapsToDirectory,
        pullHandicapsFromDirectory: pullHandicapsFromDirectory, directoryParts: directoryParts,
        findDirectoryUid: findDirectoryUid, directoryRecordFor: directoryRecordFor,
        directoryFieldHcp: directoryFieldHcp, guestUidFor: guestUidFor, writeInChunks: writeInChunks,
        // стартовый лист
        DEFAULT_COLUMNS: DEFAULT_COLUMNS, sheetColumns: sheetColumns, sheetOrder: sheetOrder,
        generateSheet: generateSheet, updateSheetEntry: updateSheetEntry, addSheetEntry: addSheetEntry,
        removeSheetEntry: removeSheetEntry, saveSheetColumns: saveSheetColumns, deleteSheet: deleteSheet,
        materializeRound: materializeRound,
        // счёт и результаты
        readRoundScores: readRoundScores, writeScore: writeScore,
        writePlayerHandicap: writePlayerHandicap, writePlayerFores: writePlayerFores,
        saveResults: saveResults, overrideResult: overrideResult,
        roundGroupRoundIds: roundGroupRoundIds
    };
})(typeof window !== 'undefined' ? window : this);
