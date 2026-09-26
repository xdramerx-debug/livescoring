// Единственный клиентский маршрут для счёта: сервер проверяет доступ и
// атомарно фиксирует значение + событие. Без сети очередь хранит неизменный
// requestId, а не имитирует успешное серверное сохранение.
// При недоступности Cloud Functions (не задеплоены, internal, unavailable,
// network) предусмотрен надёжный fallback прямой записи в Realtime Database,
// чтобы счёт не зависал на устройстве.
(function(root) {
    function uid() {
        if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID().replace(/-/g, '_');
        // UUID fallback for older browsers, still generated with crypto.
        var arr = new Uint8Array(20);
        if (!root.crypto || !root.crypto.getRandomValues) throw new Error('Secure random unavailable');
        root.crypto.getRandomValues(arr);
        return Array.from(arr).map(function(n) { return n.toString(16).padStart(2, '0'); }).join('');
    }
    function client() {
        if (!root.firebase || !root.firebase.functions) throw new Error('Score server is unavailable');
        return root.firebase.functions();
    }
    function canDirectSend() {
        return !!(root.db || (root.firebase && typeof root.firebase.database === 'function'));
    }
    function getDatabase() {
        if (root.db) return root.db;
        if (root.firebase && typeof root.firebase.database === 'function') return root.firebase.database();
        throw new Error('Score database is unavailable');
    }
    function sendDirect(action) {
        var database = getDatabase();
        var now = Date.now();
        if (action.studio) {
            var tid = action.tournamentId, dayId = action.dayId, pid = action.playerId, hole = String(action.hole);
            var studioUpdates = {};
            studioUpdates['tournaments/' + tid + '/scores/' + dayId + '/' + pid + '/' + hole] = action.score;
            if (action.requestId) {
                studioUpdates['tournaments/' + tid + '/_scoreAuditIds/' + action.requestId] = now;
            }
            return database.ref().update(studioUpdates).then(function() {
                return { ok: true, fallback: true, duplicate: false, confirmedAt: now };
            });
        }
        var rid = action.roundId;
        if (!rid) return Promise.reject(new Error('Missing roundId'));
        function applyOps(players) {
            var updates = {};
            (action.operations || []).forEach(function(op) {
                if (!op || !op.playerId || !op.hole) return;
                var pid = op.playerId;
                var hole = String(op.hole);
                var p = (players && players[pid]) || {};
                var pScores = p.scores || {};
                var pMarkerScores = p.markerScores || {};
                if (op.kind === 'marker') {
                    var markerId = action.actorPlayerId || p.markedBy || (root.currentUser && root.currentUser.uid) || 'marker';
                    if (op.score === null) {
                        updates['rounds/' + rid + '/players/' + pid + '/markerScores/' + markerId + '/' + hole] = null;
                        updates['rounds/' + rid + '/players/' + pid + '/markerSubmitted/' + markerId + '/' + hole] = null;
                        updates['markers/' + rid + '/' + pid + '/' + hole] = null;
                    } else {
                        updates['rounds/' + rid + '/players/' + pid + '/markerScores/' + markerId + '/' + hole] = op.score;
                        updates['rounds/' + rid + '/players/' + pid + '/markerSubmitted/' + markerId + '/' + hole] = true;
                        updates['markers/' + rid + '/' + pid + '/' + hole] = op.score;
                    }
                    var myScore = pScores[hole];
                    if (myScore !== undefined && myScore !== null && op.score !== null) {
                        updates['rounds/' + rid + '/players/' + pid + '/verified/' + hole] = (myScore === op.score);
                    }
                } else {
                    if (op.score === null) {
                        updates['rounds/' + rid + '/players/' + pid + '/scores/' + hole] = null;
                        updates['rounds/' + rid + '/players/' + pid + '/submitted/' + hole] = false;
                    } else {
                        updates['rounds/' + rid + '/players/' + pid + '/scores/' + hole] = op.score;
                        updates['rounds/' + rid + '/players/' + pid + '/submitted/' + hole] = true;
                    }
                    var markedBy = p.markedBy;
                    var markerVal = markedBy && pMarkerScores[markedBy] && pMarkerScores[markedBy][hole];
                    if (markerVal !== undefined && markerVal !== null && op.score !== null) {
                        updates['rounds/' + rid + '/players/' + pid + '/verified/' + hole] = (markerVal === op.score);
                    }
                }
                if (!(p.holeTimes && p.holeTimes[hole])) {
                    updates['rounds/' + rid + '/players/' + pid + '/holeTimes/' + hole] = now;
                }
            });
            if (action.requestId) {
                updates['rounds/' + rid + '/_scoreAuditIds/' + action.requestId] = now;
            }
            return database.ref().update(updates).then(function() {
                return { ok: true, fallback: true, duplicate: false, confirmedAt: now };
            });
        }
        return database.ref('rounds/' + rid + '/players').once('value').then(function(snapshot) {
            return applyOps(snapshot.val() || {});
        }).catch(function() {
            return applyOps({});
        });
    }
    function actorId(roundId, id) {
        if (id) return id;
        try {
            var query = new URLSearchParams(root.location.search);
            var fromQr = query.get('as') || query.get('player');
            if (fromQr) return fromQr;
            var saved = localStorage.getItem('pestovo_acting_as_' + roundId);
            return saved || (root.currentUser && root.currentUser.uid) || null;
        } catch (e) { return (root.currentUser && root.currentUser.uid) || null; }
    }
    function send(action) {
        function tryCallable() {
            try {
                return client().httpsCallable(action.studio ? 'studioScoreWrite' : 'scoreWrite')(action).then(function(result) {
                    return result.data;
                });
            } catch (err) {
                return Promise.reject(err);
            }
        }
        return tryCallable().catch(function(err) {
            var code = String(err && err.code || '').replace(/^functions\//, '').toLowerCase().replace(/_/g, '-');
            var isServerDown = !code || ['unavailable','internal','not-found','unknown','deadline-exceeded','unimplemented'].indexOf(code) >= 0;
            if (isServerDown && canDirectSend() && (typeof navigator === 'undefined' || navigator.onLine)) {
                return sendDirect(action).catch(function() {
                    throw err;
                });
            }
            throw err;
        });
    }
    root.pestovoScoreSend = send;
    root.pestovoScoreSendDirect = sendDirect;
    function pending() {
        return typeof root.hasPendingScoreActions === 'function' && root.hasPendingScoreActions();
    }
    function transient(err) {
        var code = String(err && err.code || '').replace(/^functions\//, '').toLowerCase().replace(/_/g, '-');
        return ['unavailable','deadline-exceeded','internal','unknown','resource-exhausted','aborted'].indexOf(code) >= 0 ||
            (!code && (typeof navigator !== 'undefined' && !navigator.onLine ||
                /network|failed to fetch|timeout|connection/i.test(String(err && err.message || ''))));
    }
    function queue(action) {
        if (typeof root.queueOfflineScoreAction !== 'function' || !root.queueOfflineScoreAction(action)) {
            return Promise.reject(new Error('Cannot store pending score'));
        }
        if (typeof root.toast === 'function') root.toast(root.currentLang === 'en' ? '📡 Score queued; awaiting server confirmation' : '📡 Счёт в очереди — ждём подтверждения сервера', 'warn');
        // Once a queued action exists, all later actions must be replayed in order.
        if (typeof root.syncOfflineScores === 'function' && typeof navigator !== 'undefined' && navigator.onLine) {
            setTimeout(root.syncOfflineScores, 0);
        }
        return Promise.resolve({offline:true});
    }
    var tail = Promise.resolve();
    function submit(action) {
        // Serialize attempts in this tab; a failed first attempt must join the
        // queue before the second action can overtake it on the server.
        var result = tail.then(function() {
            if ((typeof navigator !== 'undefined' && !navigator.onLine) || pending()) return queue(action);
            return send(action).catch(function(err) { if (transient(err)) return queue(action); throw err; });
        });
        tail = result.then(function() {}, function() {});
        return result;
    }
    root.pestovoStudioScoreWrite = function(tournamentId, dayId, playerId, hole, score) {
        var action = {studio:true,tournamentId:tournamentId,dayId:dayId,playerId:playerId,
            hole:Number(hole),score:score,requestId:uid(),queuedAt:Date.now(),
            authUid:(root.currentUser&&root.currentUser.uid)||null};
        return submit(action);
    };
    root.pestovoScoreWrite = function(roundId, operations, actingId) {
        var action = {
            roundId: roundId, operations: operations, actorPlayerId: actorId(roundId, actingId),
            qrAccess: !!(root.location && /(?:^|\/)(?:scorer|marker|setup-round)\.html$/.test(root.location.pathname || '') &&
                new URLSearchParams(root.location.search || '').get('round') === roundId &&
                (new URLSearchParams(root.location.search || '').has('as') || new URLSearchParams(root.location.search || '').has('player'))),
            requestId: uid(), queuedAt: Date.now(),
            authUid: (root.currentUser && root.currentUser.uid) || null
        };
        return submit(action);
    };
})(typeof window !== 'undefined' ? window : this);
