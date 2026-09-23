// js/admin-broadcasts.js — «Push-анонсы и рассылки клуба» (админка);
// вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули).
// Выбор аудитории (все / турнир / протокол), счётчик получателей, отправка
// push через Cloud Function, история анонсов с удалением. Внешних
// зависимостей от admin.js нет: только runtime-глобалы (db, toast, t,
// currentLang) и guarded-вызовы (sendPushToAll и т.п.). openAdminPanel()
// и switchTab('broadcasts') зовут loadClubBroadcastsHistory()/
// loadBroadcastAudienceOptions()/pushAdminInit() в runtime.

// ==========================================
// PUSH-АНОНСЫ И РАССЫЛКИ КЛУБА
// ==========================================
// ----------------------------------------------------------
// Адрес анонса: всем / турниру (его заявки) / стартовому протоколу.
// Снимок получателей пишется прямо в запись broadcasts/<id>
// (audience.uids), поэтому страница игрока проверяет только свой uid и
// не читает ради анонса турнирные таблицы.
// ----------------------------------------------------------
var bcAudience = { tournaments: null, protocols: null, reg: {}, regLoading: {}, proto: {}, protoLoading: {} };

function bcEl(id) { try { return document.getElementById(id); } catch (e) { return null; } }
function bcT(ru, en) { return (typeof currentLang !== 'undefined' && currentLang === 'en') ? en : ru; }
function bcKey(id, fallback) {
    try {
        if (typeof t === 'function') {
            var v = t(id);
            if (v && v !== id) return v;
        }
    } catch (e) { console.warn("[silent]", e); }
    return fallback;
}

// Загружаем списки для выбора аудитории (один раз, при открытии вкладки).
function loadBroadcastAudienceOptions() {
    if (typeof db === 'undefined' || !db) return;
    if (bcAudience.tournaments && bcAudience.protocols) { bcAudienceTypeChange(); return; }
    Promise.all([db.ref('tournaments').once('value'), db.ref('protocols').once('value')]).then(function(sn) {
        bcAudience.tournaments = sn[0].val() || {};
        bcAudience.protocols = sn[1].val() || {};
        bcFillTournamentOptions();
        bcAudienceTypeChange();
    }).catch(function(err) {
        console.warn('[broadcast] audience options', err);
    });
}

function bcFillTournamentOptions() {
    var sel = bcEl('bc-aud-tn');
    if (!sel) return;
    var list = Object.keys(bcAudience.tournaments || {}).map(function(id) {
        var t0 = bcAudience.tournaments[id] || {};
        return { id: id, name: String(t0.name || id), date: String(t0.date || '') };
    });
    list.sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var html = '<option value="">' + escapeHtml(bcT('— выберите турнир —', '— pick a tournament —')) + '</option>';
    list.slice(0, 60).forEach(function(x) {
        html += '<option value="' + escapeHtml(x.id) + '">' + escapeHtml((x.date ? x.date + ' · ' : '') + x.name) + '</option>';
    });
    sel.innerHTML = html;
    var prev = bcAudience.selTn;
    if (prev) sel.value = prev;
}

function bcFillProtocolOptions(tnId) {
    var sel = bcEl('bc-aud-proto');
    if (!sel) return;
    var list = Object.keys(bcAudience.protocols || {}).map(function(id) {
        var d = bcAudience.protocols[id] || {};
        return { id: id, tnId: String(d.tournamentId || ''), name: String(d.name || id), date: String(d.date || ''), players: parseInt(d.playersCount, 10) || 0 };
    }).filter(function(x) { return !tnId || x.tnId === String(tnId); });
    list.sort(function(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''); });
    var html = '<option value="">' + escapeHtml(bcT('— выберите протокол —', '— pick a start list —')) + '</option>';
    list.slice(0, 60).forEach(function(x) {
        html += '<option value="' + escapeHtml(x.id) + '">' + escapeHtml((x.date ? x.date + ' · ' : '') + x.name + (x.players ? ' (' + x.players + ')' : '')) + '</option>';
    });
    sel.innerHTML = html;
}

// Тип аудитории: показываем/прячем выбор источника и пересчитываем получателей.
function bcAudienceTypeChange() {
    var type = (bcEl('bc-audience') || {}).value || 'all';
    var pick = bcEl('bc-aud-pick');
    var pg = bcEl('bc-aud-proto-group');
    if (pick) pick.classList.toggle('hidden', type === 'all');
    if (pg) pg.classList.toggle('hidden', type !== 'protocol');
    if (type === 'protocol') bcFillProtocolOptions((bcEl('bc-aud-tn') || {}).value || '');
    bcRefreshAudienceCount();
}

function bcAudienceSourceChange() {
    var type = (bcEl('bc-audience') || {}).value || 'all';
    if (type === 'protocol') bcFillProtocolOptions((bcEl('bc-aud-tn') || {}).value || '');
    bcRefreshAudienceCount();
}

// Уids адресатов выбранной аудитории. cb({uids:{uid:true}, total, real, tournamentName, protocolId, protocolName}).
function bcAudienceUids(type, tnId, protoId, cb) {
    var out = { uids: {}, total: 0, real: 0, tournamentName: '', protocolId: protoId || '', protocolName: '' };
    if (type !== 'roster' && type !== 'protocol') { cb(out); return; }
    var tn = (bcAudience.tournaments || {})[tnId] || null;
    if (tn) out.tournamentName = String(tn.name || '');

    function addId(rawId) {
        var id = String(rawId || '');
        if (!id) return;
        out.total++;
        if (id.indexOf('gst_') === 0) return;      // гость без аккаунта — пуш не дойдёт
        if (!out.uids[id]) { out.uids[id] = true; out.real++; }
    }

    if (type === 'roster') {
        if (!tnId) { cb(out); return; }
        if (bcAudience.reg[tnId]) { Object.keys(bcAudience.reg[tnId]).forEach(addId); cb(out); return; }
        // Аудитория «турниру» = состав + лист ожидания: записавшиеся
        // (ещё не подтверждённые) игроки тоже должны получать анонсы.
        Promise.all([
            db.ref('tournaments/' + tnId + '/registeredPlayers').once('value').catch(function() { return null; }),
            db.ref('tournaments/' + tnId + '/waitlist').once('value').catch(function() { return null; })
        ]).then(function(sn) {
            var reg = (sn[0] && sn[0].val && sn[0].val()) || {};
            var wl = (sn[1] && sn[1].val && sn[1].val()) || {};
            bcAudience.reg[tnId] = reg;
            Object.keys(reg).forEach(addId);
            Object.keys(wl).forEach(addId);
            cb(out);
        }).catch(function() { cb(out); });
        return;
    }

    if (!protoId) { cb(out); return; }
    var doc = bcAudience.proto[protoId];
    if (doc) { bcCountProtocolPlayers(doc, addId); cb(out); return; }
    db.ref('protocols/' + protoId).once('value').then(function(sn) {
        var d = sn.val() || {};
        bcAudience.proto[protoId] = d;
        out.protocolName = String(d.name || '');
        if (!out.tournamentName && d.tournamentName) out.tournamentName = String(d.tournamentName);
        bcCountProtocolPlayers(d, addId);
        cb(out);
    }).catch(function() { cb(out); });
}

function bcCountProtocolPlayers(doc, addId) {
    var groups = (doc && doc.groups) || {};
    Object.keys(groups).forEach(function(gk) {
        var pl = (groups[gk] || {}).players || [];
        (Array.isArray(pl) ? pl : Object.keys(pl).map(function(k) { return pl[k]; })).forEach(function(p) {
            if (p) addId(p.id || p.uid || '');
        });
    });
}

function bcRefreshAudienceCount() {
    var el = bcEl('bc-aud-count');
    if (!el) return;
    var type = (bcEl('bc-audience') || {}).value || 'all';
    if (type === 'all') {
        el.textContent = bcT('Получателей: все игроки клуба', 'Recipients: all club players');
        el.style.color = 'var(--muted)';
        return;
    }
    bcAudienceUids(type, (bcEl('bc-aud-tn') || {}).value || '', (bcEl('bc-aud-proto') || {}).value || '', function(res) {
        var picked = (type === 'protocol') ? ((bcEl('bc-aud-proto') || {}).value || '') : ((bcEl('bc-aud-tn') || {}).value || '');
        var txt;
        if (!res.total && !picked) txt = bcT('Выберите турнир или протокол', 'Pick a tournament or a start list');
        else if (!res.total) txt = bcT('Анонс некому отправлять: в списке получателей нет ни одного игрока', 'Nobody to send to: the recipient list is empty');
        else if (!res.real) txt = bcT('Адресатов нет: у игроков нет аккаунтов клуба', 'No addressees: these players have no club accounts');
        else txt = bcT('Получателей: ', 'Recipients: ') + res.real + (res.real < res.total ? ' (' + bcT('без аккаунтов: ', 'no accounts: ') + (res.total - res.real) + ')' : '');
        el.textContent = txt;
        el.style.color = (res.total && res.real) ? 'var(--gold)' : 'var(--muted)';
    });
}

// ============================================
// ФОНОВЫЕ WEB PUSH: статус и инициализация VAPID
// ============================================
function pushAdminDefaultFnUrl() {
    var projectId = 'livescore-b77e4';
    try {
        if (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) projectId = firebaseConfig.projectId;
        else if (typeof db !== 'undefined' && db && db.app && db.app.options) projectId = db.app.options.projectId || projectId;
    } catch (e) { console.warn("[silent]", e); }
    return 'https://us-central1-' + projectId + '.cloudfunctions.net/vapidSetup';
}

function pushAdminRefreshStatus() {
    var box = document.getElementById('push-status');
    if (!box) return;
    if (typeof db === 'undefined' || !db) { box.textContent = '⚠️ Нет соединения с базой'; return; }
    var urlInp = document.getElementById('push-fn-url');
    if (urlInp && !urlInp.value) {
        db.ref('settings/push_function_url').once('value').then(function(sn) {
            if (sn.val() && urlInp) urlInp.value = sn.val();
        });
    }
    Promise.all([
        db.ref('settings/vapid_public_key').once('value'),
        db.ref('push_subscriptions').once('value')
    ]).then(function(res) {
        var pub = res[0].val();
        var subs = res[1].val() || {};
        var n = Object.keys(subs).length;
        var nUsers = Object.keys(subs).filter(function(k) { return subs[k] && subs[k].uid; }).length;
        var nAdmins = Object.keys(subs).filter(function(k) { return subs[k] && subs[k].isAdmin; }).length;
        box.innerHTML = (pub
            ? '✅ VAPID публичный ключ: <code>' + String(pub).slice(0, 24) + '…</code><br>'
            : '⚠️ VAPID-ключи ещё не созданы — нажмите «Создать/проверить VAPID-ключи».<br>') +
            'Устройств с подпиской: <strong>' + n + '</strong> · из них игроков: ' + nUsers + ' · админов: ' + nAdmins;
    }).catch(function(err) { box.textContent = '⚠️ ' + (err && err.message ? err.message : err); });
}

function pushAdminInit() {
    var urlInp = document.getElementById('push-fn-url');
    var url = (urlInp && urlInp.value.trim()) || pushAdminDefaultFnUrl();
    if (urlInp && urlInp.value.trim() && typeof db !== 'undefined' && db) {
        db.ref('settings/push_function_url').set(urlInp.value.trim()).catch(function() {});
    }
    var box = document.getElementById('push-status');
    if (box) box.textContent = '⏳ Вызываю Cloud Function… (' + url + ')';
    fetch(url, { method: 'GET' }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(function(data) {
        if (!data || !data.publicKey) throw new Error('Функция не вернула публичный ключ');
        if (typeof db !== 'undefined' && db) db.ref('settings/vapid_public_key').set(data.publicKey).catch(function() {});
        if (box) box.innerHTML = '✅ Ключи готовы. Игроки с включёнными уведомлениями начнут получать пуши при закрытом приложении в течение минуты.';
        toast('✅ VAPID готов: фоновые пуши включены', 'success');
        setTimeout(pushAdminRefreshStatus, 1500);
    }).catch(function(err) {
        if (box) box.innerHTML = '⚠️ Не удалось вызвать функцию: ' + (err && err.message ? err.message : err) +
            '<br>Проверьте деплой: <code>cd functions && npm i && firebase deploy --only functions</code>';
    });
}

function sendClubBroadcast() {
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    var titleInp = document.getElementById('bc-title');
    var bodyInp = document.getElementById('bc-body');
    var linkInp = document.getElementById('bc-link');

    var title = titleInp ? titleInp.value.trim() : '';
    var body = bodyInp ? bodyInp.value.trim() : '';
    var link = linkInp ? linkInp.value : 'tournaments.html';

    if (!title || !body) {
        toast(currentLang === 'en' ? 'Specify title and message text' : 'Заполните заголовок и текст анонса', 'error');
        return;
    }

    var audSel = bcEl('bc-audience');
    var type = audSel ? (audSel.value || 'all') : 'all';
    var tnSel = bcEl('bc-aud-tn'), prSel = bcEl('bc-aud-proto');
    var tnId = tnSel ? (tnSel.value || '') : '';
    var protoId = prSel ? (prSel.value || '') : '';

    if (type === 'all' || type === 'all_pwa') {
        // «Все + PWA»: анонс получают все открытые приложения (включая гостей
        // без аккаунта) с включёнными уведомлениями — push показывается на
        // каждом устройстве с разрешением Notification.
        var audAll = { type: 'all', includePwa: type === 'all_pwa' };
        var who = (type === 'all_pwa')
            ? (currentLang === 'en' ? 'all players + PWA push subscribers' : 'всем игрокам и PWA-подписчикам')
            : (currentLang === 'en' ? 'all club players' : 'всем игрокам клуба');
        var rec0 = (typeof pestovoBroadcastPayload === 'function')
            ? pestovoBroadcastPayload({ title: title, body: body, link: link, time: Date.now(), sentBy: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : 'admin', audience: audAll })
            : { title: title, body: body, link: link || 'tournaments.html', time: Date.now(), sentBy: 'admin', audience: audAll };
        var ask0 = (currentLang === 'en' ? 'Send push to ' : 'Отправить Push-анонс ') + who + '?\n\n' + (currentLang === 'en' ? 'Title: ' : 'Заголовок: ') + title;
        if (!confirm(ask0)) return;
        db.ref('broadcasts').push(rec0).then(function() {
            var tInp = document.getElementById('bc-title');
            var bInp = document.getElementById('bc-body');
            if (tInp) tInp.value = '';
            if (bInp) bInp.value = '';
            try { bcRefreshAudienceCount(); } catch (eR) { console.warn("[silent]", eR); }
            toast('📢 ' + (currentLang === 'en' ? 'Announcement sent to ' : 'Анонс отправлен: ') + who);
            if (typeof showPushNotification === 'function') showPushNotification(rec0.title, rec0.body, rec0.link);
        });
        return;
    }

    bcAudienceUids(type, tnId, protoId, function(res) {
        if (!res.real) {
            toast(bcKey('bc_aud_none_sel', bcT('Анонс некому отправлять: список получателей пуст', 'Nobody to send to: the recipient list is empty')), 'error');
            return;
        }
        var audience = {
            type: type,
            tournamentId: (type === 'protocol') ? (((bcAudience.protocols || {})[protoId] || {}).tournamentId || '') : (tnId || ''),
            tournamentName: res.tournamentName || '',
            protocolId: type === 'protocol' ? protoId : '',
            protocolName: res.protocolName || '',
            uids: res.uids,
            count: res.real
        };
        bcSendBroadcast(title, body, link, audience, res);
    });
}

// Непосредственно отправка: payload нормализуется общим слоем (js/utils.js),
// поэтому у записи всегда есть audience — и старые клиенты, и лента игроков
// читают одно и то же поле.
function bcSendBroadcast(title, body, link, audience, res) {
    var who = (typeof pestovoBroadcastAudienceLabel === 'function')
        ? pestovoBroadcastAudienceLabel({ audience: audience })
        : bcT('всем игрокам клуба', 'all club players');
    var cnt = res && res.real ? ('\n\n' + bcT('Получателей: ', 'Recipients: ') + res.real + '\n') : '\n';
    var ask = bcT('Отправить Push-анонс — ' + who + '?' + cnt + 'Заголовок: ',
        'Send a push announcement to ' + who + '?' + cnt + 'Title: ') + title;
    if (!confirm(ask)) return;

    var rec = (typeof pestovoBroadcastPayload === 'function')
        ? pestovoBroadcastPayload({
            title: title, body: body, link: link,
            time: Date.now(),
            sentBy: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : 'admin',
            audience: audience
        })
        : {
            title: title, body: body, link: link || 'tournaments.html',
            time: Date.now(),
            sentBy: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : 'admin',
            audience: audience
        };

    db.ref('broadcasts').push(rec).then(function() {
        // Форму чистим, как и раньше: после отправки анонса админ не должен
        // случайно отправить тот же текст второй раз.
        var titleInp = document.getElementById('bc-title');
        var bodyInp = document.getElementById('bc-body');
        if (titleInp) titleInp.value = '';
        if (bodyInp) bodyInp.value = '';
        try { bcRefreshAudienceCount(); } catch (eRef) { console.warn("[silent]", eRef); }
        toast('📢 ' + bcT('Анонс отправлен: ', 'Announcement sent to ') + who);
        if (typeof loadBroadcastAudienceOptions === 'function') { try { loadBroadcastAudienceOptions(); } catch (e) { console.warn("[silent]", e); } }
        if (typeof showPushNotification === 'function') {
            showPushNotification(rec.title, rec.body, rec.link);
        }
    });
}

function loadClubBroadcastsHistory() {
    if (typeof db === 'undefined' || !db) return;
    // Одна подписка: bindRealtimeValue не плодит дубли при повторных заходах на вкладку.
    bindRealtimeValue('admin-broadcasts', db.ref('broadcasts'), function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data).sort(function(a, b) { return b[1].time - a[1].time; });
        var el = document.getElementById('admin-broadcasts-list');
        if (!el) return;

        if (!entries.length) {
            el.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">' + (currentLang === 'en' ? 'No broadcast announcements sent yet' : 'Пока нет отправленных анонсов') + '</p>';
            return;
        }

        var html = '';
        entries.forEach(function(e) {
            var id = e[0], b = e[1];
            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<strong style="color:var(--gold);font-size:15px;"><i class="fas fa-bullhorn"></i> ' + escapeHtml(b.title || 'Announcement') + '</strong>';
            html += '<div style="font-size:13px;color:var(--white);margin:4px 0;">' + escapeHtml(b.body || '') + '</div>';
            var audTxt = (typeof pestovoBroadcastAudienceLabel === 'function') ? pestovoBroadcastAudienceLabel(b) : '';
            html += '<div style="font-size:11px;color:var(--muted);">' + fmtDate(b.time) + ' · ' + fmtTime(b.time) + ' · Link: ' + escapeHtml(b.link || 'tournaments.html') +
                (audTxt ? ' · <span style="color:var(--gold);">' + escapeHtml(audTxt) + '</span>' : '') + '</div>';
            html += '</div>';
            html += '<button class="btn btn-r btn-sm" onclick="deleteBroadcast(\'' + id + '\')"><i class="fas fa-trash"></i></button>';
            html += '</div>';
        });

        el.innerHTML = html;
    });
}

function deleteBroadcast(id) {
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(currentLang === 'en' ? 'Delete announcement?' : 'Удалить анонс?')) return;
    db.ref('broadcasts/' + id).remove().catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}
