// Единственный клиентский маршрут для счёта: сервер проверяет доступ и
// атомарно фиксирует значение + событие. Без сети очередь хранит неизменный
// requestId, а не имитирует успешное серверное сохранение.
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
    function send(action) { return client().httpsCallable(action.studio ? 'studioScoreWrite' : 'scoreWrite')(action).then(function(result) { return result.data; }); }
    root.pestovoScoreSend = send;
    function pending() {
        return typeof root.hasPendingScoreActions === 'function' && root.hasPendingScoreActions();
    }
    function transient(err) {
        var code = String(err && err.code || '').replace(/^functions\//, '');
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
