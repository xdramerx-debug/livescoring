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
        return patch('tournaments/' + tid, { status: status, updatedAt: now() });
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

    /**
     * Генерация стартового листа раунда: создаёт (или обновляет)
     * sheets/<rid> и раунды групп rounds/<groupRoundId> для ввода счёта.
     */
    function generateSheet(tid, rid, options, tournament) {
        var o = options || {};
        var round = asMap(asMap(tournament && tournament.rounds)[rid]);
        if (!round.id) return Promise.reject(new Error('Раунд не найден'));
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
            flights: o.flights !== false
        });
        var base = root.baseUrl ? root.baseUrl() : '';
        var entries = {};
        var markers = {};
        built.entries.forEach(function (entry) {
            var copy = Object.assign({}, entry);
            copy.qr = core().scoreUrl(base, rid, entry.playerId, 4);
            entries[entry.playerId] = copy;
        });
        // Маркеры и QR: по одному коду на группу/маркера.
        built.groups.forEach(function (group, index) {
            var markerEntry = group.players.filter(function (player) {
                return entries[player.id] && entries[player.id].playerId === entries[player.id].markerPlayerId;
            })[0] || group.players[0];
            var payload = core().scoreUrl(base, rid, markerEntry ? markerEntry.id : '', Math.max(2, group.players.length));
            (group.players || []).forEach(function (player) {
                if (entries[player.id]) entries[player.id].scoreUrl = payload;
            });
            if (markerEntry) {
                var target = group.players.filter(function (player) { return player.id !== markerEntry.id; });
                markers[markerEntry.id] = clean({
                    playerId: markerEntry.id,
                    groupId: group.id || '',
                    groupName: group.name || '',
                    flight: group.flight || '',
                    position: index + 1,
                    qr: payload,
                    generatedAt: now(),
                    targets: target.reduce(function (acc, player) { acc[player.id] = true; return acc; }, {})
                });
            }
        });
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
        var groups = [];
        var seen = {};
        entries.forEach(function (entry) {
            var key = [entry.flight || '', entry.groupId || entry.groupName || '', entry.startTime || ''].join('|');
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
            var groupRoundId = existing[index] || pushKey('rounds');
            groupRounds[index] = groupRoundId;
            var players = {};
            var markerAssignments = {};
            var participants = [];
            var ids = group.entries.map(function (entry) { return entry.playerId; });
            group.entries.forEach(function (entry) {
                var player = asMap(tournamentPlayers[entry.playerId]);
                var markerId = entry.markerPlayerId || '';
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
                if (markerId) {
                    markerAssignments[markerId] = clean({ targetId: markerId, targetName: entry.playerName, groupId: entry.groupId || '', tournamentRound: rid });
                }
            });
            // Маркировка кольцом внутри группы (каждый маркирует следующего).
            var ring = group.entries.map(function (entry) { return entry.playerId; });
            ring.forEach(function (pid, position) {
                var targetPid = ring[(position + 1) % ring.length];
                if (!targetPid || targetPid === pid) return;
                players[pid].markedBy = targetPid;
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
                startHole: 1,
                holeRange: '1-18',
                startTime: startTs,
                startTimeText: startTimeText,
                scheduledStart: startTs,
                tee: group.entries[0].tee || 'wh',
                teeLabel: core().teeName(group.entries[0].tee, 'ru'),
                format: formats[0] || '',
                formats: formats,
                status: 'scheduled',
                accessKey: 'tn_' + tid + '_' + rid + '_' + index + '_' + Math.random().toString(36).slice(2, 8),
                createdBy: creator,
                participantsList: participants,
                markerAssignments: markerAssignments,
                updatedAt: now()
            });
            // Сливаем метаданные, сохраняя уже введённый счёт; createdAt
            // ставим только при первом создании раунда группы.
            chains.push(read('rounds/' + groupRoundId + '/createdAt').then(function (createdAt) {
                var meta = Object.assign({}, roundMeta);
                if (!createdAt) meta.createdAt = now();
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
        // Правка маркера: пересобираем карту маркеров в листе.
        if (fields && fields.markerPlayerId !== undefined) {
            var markers = asMap(sheet.markers);
            var nextMarkers = {};
            Object.keys(markers).forEach(function (key) {
                if (key === pid) return;
                var marker = asMap(markers[key]);
                var targets = Object.assign({}, asMap(marker.targets));
                delete targets[pid];
                nextMarkers[key] = Object.assign({}, marker, { targets: Object.keys(targets).length ? targets : null });
            });
            var markerId = fields.markerPlayerId;
            if (markerId) {
                var markerTargets = Object.assign({}, asMap(asMap(markers[markerId]).targets));
                markerTargets[pid] = true;
                nextMarkers[markerId] = Object.assign({}, asMap(markers[markerId]), clean({
                    playerId: markerId, groupId: next.groupId || '', groupName: next.groupName || '',
                    flight: next.flight || '', qr: next.scoreUrl || '', generatedAt: now()
                }), { targets: markerTargets });
            }
            updates['tournaments/' + tid + '/sheets/' + rid + '/markers'] = Object.keys(nextMarkers).length ? nextMarkers : null;
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
        return patch('tournaments/' + tid + '/sheets/' + rid + '/entries/' + pid, clean(entry))
            .then(function () { return read('tournaments/' + tid + '/sheets/' + rid); })
            .then(function (fresh) {
                if (fresh) return materializeRound(tid, rid, fresh, tournament).then(function () { return fresh; });
                return null;
            });
    }

    function removeSheetEntry(tid, rid, pid, tournament) {
        var updates = {};
        updates['tournaments/' + tid + '/sheets/' + rid + '/entries/' + pid] = null;
        updates['tournaments/' + tid + '/sheets/' + rid + '/markers/' + pid] = null;
        updates['tournaments/' + tid + '/sheets/' + rid + '/updatedAt'] = now();
        return multi(updates).then(function () {
            return read('tournaments/' + tid + '/sheets/' + rid);
        }).then(function (fresh) {
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
        watchTournaments: watchTournaments, watchTournament: watchTournament, watchGroupRounds: watchGroupRounds,
        // раунды
        addRound: addRound, updateRound: updateRound, deleteRound: deleteRound,
        // группы
        addGroup: addGroup, updateGroup: updateGroup, deleteGroup: deleteGroup,
        setGroupMembers: setGroupMembers, groupForPlayer: groupForPlayer,
        // участники
        addPlayer: addPlayer, addPlayers: addPlayers, updatePlayer: updatePlayer, removePlayer: removePlayer,
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
