// js/admin-alerts.js — панель «Вызовы судьи/маршала» в админке;
// вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули).
// Подписка на /alerts (child_added/child_removed), дебонс-рендер панели
// (~300 мс, «волна» обновлений не зависает вкладку), бейдж необработанных,
// ответ игроку через users/<pid>/notifications. Внешние зависимости:
// runtime-глобалы (db, toast, t, currentLang, escapeHtml) и guarded-вызовы
// (switchTab, playBeep и т.п.). knownAlertIds — состояние дедупликации.

var knownAlertIds = {};

// ============================================================
// ДЕБАУНС ПАНЕЛИ «ВЫЗОВЫ» АДМИНА (фикс зависания сайта)
// ------------------------------------------------------------
// Во время активной игры вызовы судьи/маршала приходят подряд —
// каждый это новый снимок ветки alerts. Раньше на КАЖДЫЙ снимок
// перерисовывались статистика + баннер + весь список вызовов, и
// частые уведомления «зависали намертво» админ-панель. Теперь:
// лёгкая обработка на каждый снимок (счётчик на вкладке + пуш через
// глобальный троттлер pwa.js), а тяжёлая перерисовка — не чаще
// одного раза за 300 мс («волна» уведомлений = один рендер).
// ============================================================
var admAlertsRenderTimer = null;
var admAlertsPending = null;
var admGlobalNotificationsEnabled = true;
var admGlobalNotificationsBound = false;
// true, когда настройка реально прочитана из базы (а не значение по умолчанию).
var admGlobalNotificationsKnown = false;
var admGlobalNotificationsTimeout = null;
// Общий переключатель: кнопка показывает ДЕЙСТВИЕ («Отключить для всех» /
// «Включить для всех»), а не состояние, и доступна всегда — даже если чтение
// настройки задерживается (иначе кнопка вечно висела в «Загрузка…»).
function renderGlobalNotificationsSetting() {
    var button = document.getElementById('global-notifications-toggle');
    var status = document.getElementById('global-notifications-status');
    var bar = document.getElementById('admin-global-notify');
    var isEn = typeof currentLang !== 'undefined' && currentLang === 'en';
    var on = admGlobalNotificationsEnabled !== false;
    if (bar) bar.classList.toggle('is-off', admGlobalNotificationsKnown && !on);
    if (button) {
        button.disabled = false;
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
        button.className = 'btn btn-sm ' + (on ? 'btn-danger' : 'btn-g');
        button.innerHTML = '<i class="fas ' + (on ? 'fa-bell-slash' : 'fa-bell') + '"></i> ' +
            (on ? (isEn ? 'Turn off for everyone' : 'Отключить для всех')
                : (isEn ? 'Turn on for everyone' : 'Включить для всех'));
    }
    if (status) {
        if (!admGlobalNotificationsKnown) {
            status.textContent = isEn
                ? 'Setting not loaded yet. Notifications are assumed to be on.'
                : 'Настройка ещё не загружена. Считаем, что уведомления включены.';
        } else if (on) {
            status.textContent = isEn
                ? 'ON: push alerts, club announcements and referee/marshal calls are sent to players.'
                : 'ВКЛЮЧЕНО: push, клубные анонсы и вызовы судей/маршалов отправляются игрокам.';
        } else {
            status.textContent = isEn
                ? 'OFF for everyone: no push alerts, announcements or referee/marshal calls are sent.'
                : 'ВЫКЛЮЧЕНО для всех: push, анонсы и вызовы судей/маршалов игрокам не отправляются.';
        }
    }
}
function loadGlobalNotificationsSetting() {
    if (typeof db === 'undefined' || !db || admGlobalNotificationsBound) return;
    admGlobalNotificationsBound = true;
    var apply = function (snapshot) {
        var value = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null;
        admGlobalNotificationsEnabled = value !== false;
        admGlobalNotificationsKnown = true;
        if (admGlobalNotificationsTimeout) { clearTimeout(admGlobalNotificationsTimeout); admGlobalNotificationsTimeout = null; }
        renderGlobalNotificationsSetting();
    };
    // Если снимок не пришёл за 8 с (нет сети/правил) — не блокируем кнопку.
    admGlobalNotificationsTimeout = setTimeout(function () {
        admGlobalNotificationsTimeout = null;
        if (!admGlobalNotificationsKnown) renderGlobalNotificationsSetting();
    }, 8000);
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('admin-notifications-global', db.ref('settings/notifications_enabled'), apply);
    } else {
        bindSettingsValue('settings/notifications_enabled', apply, function () { renderGlobalNotificationsSetting(); });
    }
}
function toggleGlobalNotifications() {
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? 'No database connection' : 'Нет соединения с базой', 'error');
        return;
    }
    var next = !admGlobalNotificationsEnabled;
    if (!next && typeof confirm === 'function') {
        var question = currentLang === 'en'
            ? 'Turn OFF push and club notifications for ALL players?'
            : 'Отключить push и клубные уведомления для ВСЕХ игроков? Вызовы судей и анонсы не будут отправляться, пока вы не включите их снова.';
        if (!confirm(question)) return;
    }
    var button = document.getElementById('global-notifications-toggle');
    if (button) button.disabled = true;
    db.ref('settings/notifications_enabled').set(next).then(function () {
        admGlobalNotificationsEnabled = next;
        admGlobalNotificationsKnown = true;
        renderGlobalNotificationsSetting();
        toast(next
            ? (currentLang === 'en' ? 'Club notifications turned on for everyone' : 'Уведомления клуба включены для всех')
            : (currentLang === 'en' ? 'Club notifications turned off for everyone' : 'Уведомления клуба выключены для всех'), 'success');
    }).catch(function (error) {
        renderGlobalNotificationsSetting();
        toast('❌ ' + (error && error.message ? error.message : error), 'error');
    });
}
function admAlertsScheduleRender() {
    if (admAlertsRenderTimer) return;
    admAlertsRenderTimer = setTimeout(function() {
        admAlertsRenderTimer = null;
        var p = admAlertsPending;
        admAlertsPending = null;
        if (p) { try { admAlertsRenderPanel(p); } catch (e) { console.warn('[alerts render]', e); } }
    }, 300);
}

// ============================================================
// СТАТУС СЕРВЕРНОЙ ДОСТАВКИ ВЫЗОВА
// ------------------------------------------------------------
// Боевую отправку вызова в Telegram/VK делает сервер (functions/index.js,
// onAlertCreated) и пишет отчёт в alerts/<id>/delivery. Без этого отчёта
// «сообщение не пришло» было неотличимо от «функция не задеплоена» или
// «токен не сохранился в channels/»: вызов просто висел в панели, а куда и
// кем он отправлялся — не было видно нигде. Кнопки «Проверить Группу/ВК»
// в таких случаях продолжают работать, потому что шлют из браузера.
// ============================================================
function alertDeliveryChannelLabel(label) {
    // Единый словарь названий приёмников — в js/admin-channels.js (там же
    // кнопка «Проверить серверную доставку»); на вкладке «Вызовы» он загружен.
    if (typeof serverDeliveryStatusLabel === 'function') return serverDeliveryStatusLabel(label);
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    if (label === 'telegram:group') return isEn ? 'Telegram (referees group)' : 'Telegram (группа судей)';
    if (label === 'telegram:channel') return isEn ? 'Telegram (club channel)' : 'Telegram (канал клуба)';
    if (label === 'vk') return isEn ? 'VK' : 'ВКонтакте';
    return label;
}

function renderAlertDeliveryStatus(d) {
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    // Кто обязан был отправить вызов. alertDeliveryMode живёт в
    // js/admin-channels.js и грузится вместе с админкой; страховка typeof —
    // чтобы панель не падала, если файл ещё не исполнен (тесты, старый кэш).
    var mode = (typeof alertDeliveryMode !== 'undefined' && alertDeliveryMode === 'server')
        ? 'server' : 'client';
    if (!d) {
        return '<div class="alert-delivery-status">📡 ' + escapeHtml(mode === 'server'
            ? (isEn
                ? 'No server delivery report: Cloud Function onAlertCreated did not process this call (not deployed / outdated, or the call predates the update). Telegram and VK got nothing.'
                : 'Нет отчёта серверной доставки: Cloud Function onAlertCreated не обработала вызов (не задеплоена/устарела или вызов создан до обновления). В Telegram и ВК ничего не ушло.')
            : (isEn
                ? 'No delivery report: the call was to be sent by the player browser, but no status was recorded. Most often the database rules are not deployed (run firebase deploy --only database), or the call predates the update. Check the judges chat.'
                : 'Нет отчёта о доставке: вызов должен был отправить браузер игрока, но статус не записан. Чаще всего не задеплоены правила базы (выполните firebase deploy --only database) или вызов создан до обновления. Проверьте судейский чат.')) + '</div>';
    }
    if (d.skipped === 'server_mode') {
        return '<div class="alert-delivery-status">📡 ' + escapeHtml(isEn
            ? 'The browser did not send anything: delivery mode is “Server”, so Cloud Function onAlertCreated is responsible.'
            : 'Браузер ничего не отправлял: режим доставки «Сервер», за доставку отвечает Cloud Function onAlertCreated.') + '</div>';
    }
    if (d.skipped === 'error') {
        return '<div class="alert-delivery-status is-bad">📡 ❌ ' + escapeHtml(String(d.error || (isEn ? 'delivery failed' : 'сбой доставки'))) + '</div>';
    }
    if (d.skipped === 'notifications_disabled') {
        return '<div class="alert-delivery-status is-bad">📡 ' + escapeHtml(isEn
            ? 'Skipped: club notifications are turned OFF for everyone.'
            : 'Пропущено: уведомления клуба выключены для всех.') + '</div>';
    }
    if (d.skipped === 'rate_limited') {
        return '<div class="alert-delivery-status">📡 ' + escapeHtml(isEn
            ? 'Skipped: duplicate call from the same player (anti-spam).'
            : 'Пропущено: повторный вызов того же игрока (защита от спама).') + '</div>';
    }

    var parts = [];
    var hasError = false;
    var hasSent = false;
    var channels = d.channels || {};
    ['telegram:group', 'telegram:channel', 'vk'].forEach(function (label) {
        var state = channels[label];
        if (!state) return;
        var name = escapeHtml(alertDeliveryChannelLabel(label));
        if (state === 'sent') { hasSent = true; parts.push(name + ' ✅'); }
        else if (state === 'not_configured') { parts.push(name + ' ⚪ ' + escapeHtml(isEn ? 'not configured' : 'не настроен')); }
        else { hasError = true; parts.push(name + ' ❌ ' + escapeHtml(String(state).replace(/^error:\s*/, ''))); }
    });
    if (channels.error) { hasError = true; parts.push('❌ ' + escapeHtml(String(channels.error).replace(/^error:\s*/, ''))); }
    if (typeof d.push === 'number') {
        parts.push('push: ' + d.push + (isEn ? ' admin(s)' : ' админ.'));
        if (d.push > 0) hasSent = true;
    }
    if (!parts.length) {
        parts.push(escapeHtml(isEn ? 'no channels configured' : 'каналы не настроены'));
    }
    var kind = hasError ? ' is-bad' : (hasSent ? ' is-ok' : '');
    // by: 'client' пишет браузер игрока (js/official-alerts.js), by: 'server' —
    // Cloud Function. У старых отчётов поля нет: их делал только сервер.
    var byClient = d.by === 'client';
    var prefix = byClient
        ? (isEn ? 'Browser delivery: ' : 'Доставка из браузера: ')
        : (isEn ? 'Server delivery: ' : 'Серверная доставка: ');
    return '<div class="alert-delivery-status' + kind + '">📡 ' +
        escapeHtml(prefix) + parts.join(' · ') +
        (d.at ? ' <span style="opacity:0.7">(' + escapeHtml(typeof fmtTime === 'function' ? fmtTime(d.at) : '') + ')</span>' : '') +
        '</div>';
}

function admAlertsRenderPanel(p) {
    var entries = p.entries;
    // p.allEntries — уже массив пар [id, alert] (Object.entries из admAlertsPending).
    // Раньше здесь вызывался Object.entries второй раз: пары оборачивались ещё раз,
    // e[1] становился парой вместо алерта, и все вызовы считались «судьёй».
    var allEntries = p.allEntries || [];
    var hasNewAlert = p.hasNewAlert;
    var c = document.getElementById('admin-alerts-list');
    var statsEl = document.getElementById('admin-alerts-stats');
    var bannerEl = document.getElementById('admin-top-alerts-banner');

        // === Статистика всех вызовов (требование #5) ===
        if (statsEl) {
            try {
                var totalRef = 0, totalMar = 0, activeRef = 0, activeMar = 0, resolved = 0;
                allEntries.forEach(function(e) {
                    var a = e[1] || {};
                    var isRef = (a.type === 'referee');
                    var isMar = (a.type === 'marshal');
                    if (isRef) totalRef++; else if (isMar) totalMar++; else { totalRef++; } // fallback referee
                    if (String(a.status || 'active') === 'active') {
                        if (isRef || (!isMar && !isRef)) activeRef += isRef || (!isMar && !isRef) ? 1 : 0;
                        if (isMar) activeMar++;
                    } else {
                        resolved++;
                    }
                });
                // Корректный подсчёт активных по типу из alerts
                activeRef = 0; activeMar = 0;
                entries.forEach(function(e) {
                    var a = e[1] || {};
                    if (a.type === 'marshal') activeMar++; else activeRef++;
                });
                var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
                var totalAll = totalRef + totalMar;
                statsEl.innerHTML =
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">' +
                    '<div class="card" style="margin:0;padding:12px 14px;background:rgba(224,90,74,0.08);border:1px solid rgba(224,90,74,0.25);">' +
                    '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">' + (isEn ? 'Total calls' : 'Всего вызовов') + '</div>' +
                    '<div style="font-size:22px;font-weight:800;color:var(--white);margin-top:4px;">' + totalAll + '</div>' +
                    '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (isEn ? 'Referee' : 'Судья') + ': <b style="color:var(--white);">' + totalRef + '</b> · ' + (isEn ? 'Marshal' : 'Маршал') + ': <b style="color:var(--white);">' + totalMar + '</b></div>' +
                    '</div>' +
                    '<div class="card" style="margin:0;padding:12px 14px;background:rgba(255,193,7,0.06);border:1px solid rgba(255,193,7,0.25);">' +
                    '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">' + (isEn ? 'Active now' : 'Активных сейчас') + '</div>' +
                    '<div style="font-size:22px;font-weight:800;color:var(--white);margin-top:4px;">' + entries.length + '</div>' +
                    '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (isEn ? 'Referee' : 'Судья') + ': <b style="color:var(--white);">' + activeRef + '</b> · ' + (isEn ? 'Marshal' : 'Маршал') + ': <b style="color:var(--white);">' + activeMar + '</b></div>' +
                    '</div>' +
                    '<div class="card" style="margin:0;padding:12px 14px;background:rgba(46,204,113,0.06);border:1px solid rgba(46,204,113,0.25);">' +
                    '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">' + (isEn ? 'Resolved' : 'Закрыто') + '</div>' +
                    '<div style="font-size:22px;font-weight:800;color:var(--white);margin-top:4px;">' + resolved + '</div>' +
                    '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (isEn ? 'All time' : 'За всё время') + '</div>' +
                    '</div>' +
                    '</div>';
            } catch (eStats) {
                console.warn('[alerts stats]', eStats);
            }
        }

        if (bannerEl) {
            if (entries.length > 0) {
                bannerEl.innerHTML = '<div class="card" style="background:rgba(224,90,74,0.18);border:2px solid var(--red);margin-bottom:16px;cursor:pointer;" data-act="pestovoOpenAlertsTab">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
                    '<div style="color:var(--red);font-weight:800;font-size:14px;display:flex;align-items:center;gap:8px;">' +
                    '<i class="fas fa-exclamation-triangle" style="font-size:20px;"></i> ' +
                    '<span>🚨 ' + (currentLang === 'en' ? 'ATTENTION: ' + entries.length + ' ACTIVE OFFICIAL CALL(S) ON COURSE!' : 'ВНИМАНИЕ: ' + entries.length + ' АКТИВНЫХ ВЫЗОВА СУДЬИ/МАРШАЛА НА ПОЛЕ!') + '</span>' +
                    '</div>' +
                    '<button class="btn btn-danger btn-sm">' + (currentLang === 'en' ? 'View Calls →' : 'Посмотреть вызовы →') + '</button>' +
                    '</div></div>';
                bannerEl.classList.remove('hidden');
            } else {
                bannerEl.innerHTML = '';
                bannerEl.classList.add('hidden');
            }
        }

        if (entries.length === 0) {
            if (c) c.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">' + (currentLang === 'en' ? 'No active alerts' : 'Нет активных вызовов') + '</p>';
            return;
        }

        if (c) {
            var html = '';
            entries.sort(function(a, b) { return b[1].time - a[1].time; }).forEach(function(e) {
                var id = e[0], a = e[1];
                var icon = a.type === 'referee'
                    ? '<i class="fas fa-gavel" style="color:var(--red);"></i>'
                    : '<i class="fas fa-shield-halved" style="color:var(--blue);"></i>';
                var title = a.type === 'referee' ? (currentLang === 'en' ? 'REFEREE!' : 'СУДЬЯ!') : (currentLang === 'en' ? 'MARSHAL!' : 'МАРШАЛ!');

                var callHeader = currentLang === 'en' ? 'CALL: ' : 'ВЫЗОВ: ';
                var holeLblStr = currentLang === 'en' ? 'Hole' : 'Лунка';
                var playerLblStr = currentLang === 'en' ? 'Player' : 'Игрок';

                var alreadyResponded = !!(a.response && a.response.respondedAt);

                html += '<div class="list-item" style="padding:16px;border-left:4px solid var(--red);background:rgba(224,90,74,0.1);flex-wrap:wrap;gap:10px;">';
                html += '<div style="flex:1;min-width:200px;">';
                html += '<div style="font-weight:800;font-size:16px;color:var(--white);">' + icon + ' ' + callHeader + title + '</div>';
                html += '<div style="color:var(--gold);font-size:14px;margin:4px 0;">' + holeLblStr + ': <b>' + a.hole + '</b> | ' + playerLblStr + ': <b>' + (a.playerName || '—') + '</b></div>';
                if (a.flightMembers && a.flightMembers.length) {
                    var flightLblStr = currentLang === 'en' ? 'Flight' : 'Состав флайта';
                    html += '<div style="font-size:12px;color:var(--blue);margin-top:2px;">' + flightLblStr + ': ' + a.flightMembers.map(function(n) { return escapeHtml(n); }).join(', ') + '</div>';
                }
                html += '<div style="font-size:11px;color:var(--muted);">' + fmtTime(a.time) + '</div>';
                html += renderAlertDeliveryStatus(a.delivery);
                if (alreadyResponded) {
                    var who = a.response.responderRole === 'marshal'
                        ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
                        : (currentLang === 'en' ? 'Referee' : 'Судья');
                    var respondedTxt = currentLang === 'en'
                        ? '✅ ' + who + ' is on the way (' + fmtTime(a.response.respondedAt) + ')'
                        : '✅ ' + who + ' едет (' + fmtTime(a.response.respondedAt) + ')';
                    html += '<div style="font-size:12px;color:#2ecc71;font-weight:700;margin-top:6px;"><i class="fas fa-check-circle"></i> ' + respondedTxt + '</div>';
                }
                html += '</div>';
                html += '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-wrap:wrap;">';
                if (!alreadyResponded) {
                    var acceptCallText = currentLang === 'en' ? 'Accept Call' : 'Вызов принят';
                    html += '<button class="btn btn-g btn-sm" style="background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;border:none;" data-act="respondToAlert" data-arg="' + escapeHtml(id) + '" data-arg2="' + escapeHtml(a.type) + '" data-arg3="' + escapeHtml(a.playerId || '') + '"><i class="fas fa-car"></i> ' + acceptCallText + '</button>';
                }
                html += '<button class="btn btn-r btn-sm" data-act="closeAlert" data-arg="' + escapeHtml(id) + '">' + (currentLang === 'en' ? 'Dismiss Alert' : 'Закрыть вызов') + '</button>';
                html += '</div>';
                html += '</div>';
            });

            c.innerHTML = html;
        }

        if (hasNewAlert) {
            var notifyNewAlert = function (globalEnabled) {
                if (globalEnabled === false || admGlobalNotificationsEnabled === false) return;
                var first = entries[0] && entries[0][1] ? entries[0][1] : {};
                var firstWho = first.type === 'marshal'
                    ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
                    : (currentLang === 'en' ? 'Referee' : 'Судья');
                toast((currentLang === 'en'
                    ? '🚨 ' + firstWho + ' called to hole ' + (first.hole || '—')
                    : '🚨 ' + firstWho + ' вызван на лунку ' + (first.hole || '—')) +
                    (entries.length > 1 ? (currentLang === 'en' ? ' (+' + (entries.length - 1) + ' more)' : ' (+' + (entries.length - 1) + ' ещё)') : ''),
                    'error', { clubNotification: true });
                try { vib([200, 100, 200]); } catch (eVib) { console.warn("[silent]", eVib); }
            };
            var notificationSetting = typeof pestovoCheckGlobalNotificationsEnabled === 'function'
                ? pestovoCheckGlobalNotificationsEnabled() : Promise.resolve(admGlobalNotificationsEnabled !== false);
            notificationSetting.then(notifyNewAlert).catch(function (error) { console.warn('[global notifications]', error); });
        }
}

function listenForAlerts() {
    if (typeof db === 'undefined' || !db) return;
    loadGlobalNotificationsSetting();
    // Одна подписка: bindRealtimeValue не плодит дубли при повторных заходах на вкладку.
    // ВАЖНО: слушаем ветку alerts ЦЕЛИКОМ и фильтруем «активные» на клиенте.
    // Запрос orderByChild('status').equalTo('active') в базе без индекса
    // (правила Firebase) молча ничего не возвращал — из-за этого вызов судьи
    // или маршала не появлялся в админ-меню.
    bindRealtimeValue('admin-alerts-all', db.ref('alerts'), function(sn) {
        var allAlerts = sn.val() || {};
        var alerts = {};
        Object.keys(allAlerts).forEach(function(k) {
            var a = allAlerts[k] || {};
            if (String(a.status || 'active') === 'active') alerts[k] = a;
        });
        var entries = Object.entries(alerts);

        // Лёгкая обработка на каждый снимок: счётчик на вкладке (без рендера).
        updateAdminAlertsBadge(entries.length);

        // Новые вызовы: пуш-уведомление — через ГЛОБАЛЬНЫЙ ТРОТТЛЕР в pwa.js
        // (не чаще 1 раза в 4 секунды, с дедупликацией), чтобы шквал
        // уведомлений не «зависал» страницу.
        var hasNewAlert = false;
        entries.forEach(function(e) {
            var id = e[0], a = e[1];
            if (!knownAlertIds[id]) {
                knownAlertIds[id] = true;
                hasNewAlert = true;
                var title = a.type === 'referee' ? (currentLang === 'en' ? '🚨 REFEREE CALL!' : '🚨 ВЫЗОВ СУДЬИ!') : (currentLang === 'en' ? '🚨 MARSHAL CALL!' : '🚨 ВЫЗОВ МАРШАЛА!');
                var body = (currentLang === 'en' ? 'Hole #' : 'Лунка №') + a.hole + ' | ' + (currentLang === 'en' ? 'Player: ' : 'Игрок: ') + (a.playerName || 'Player') + ' (' + fmtTime(a.time) + ')';
                if (a.flightMembers && a.flightMembers.length) {
                    body += ' | ' + (currentLang === 'en' ? 'Flight: ' : 'Флайт: ') + a.flightMembers.join(', ');
                }
                // Уведомление показываем и на первом снимке (админ только что
                // открыл панель, а вызов уже висит) — раньше такой вызов
                // оставался «незамеченным»: ни тоста, ни push.
                if (typeof showPushNotification === 'function') {
                    try { showPushNotification(title, body, 'admin.html'); } catch (ePush) { console.warn("[silent]", ePush); }
                }
            }
        });

        // Подборка памяти: вызовы, исчезнувшие из базы, в «известных» не нужны.
        var knownKeys = Object.keys(knownAlertIds);
        if (knownKeys.length > 200) {
            var presentNow = {};
            Object.keys(allAlerts).forEach(function(k) { presentNow[k] = true; });
            knownKeys.forEach(function(k) { if (!presentNow[k]) delete knownAlertIds[k]; });
        }

        // Тяжёлая перерисовка панели — не чаще одного раза за 300 мс.
        admAlertsPending = { entries: entries, allEntries: Object.entries(allAlerts), hasNewAlert: hasNewAlert };
        admAlertsScheduleRender();
    });
}

// Счётчик активных вызовов прямо на вкладке «Вызовы 🚨» — админ видит
// необработанный вызов судьи/маршала из любой вкладки панели.
function updateAdminAlertsBadge(count) {
    var tabBtn = document.querySelector('.admin-tab[onclick*="\'alerts\'"]');
    if (!tabBtn) return;
    var base = (currentLang === 'en') ? 'Calls' : 'Вызовы';
    var icon = '🚨';
    var n = parseInt(count, 10) || 0;
    tabBtn.setAttribute('data-i18n', 'tab_alerts');
    tabBtn.innerHTML = base + ' ' + icon +
        (n > 0 ? ' <span class="adm-alerts-badge" style="display:inline-block;min-width:18px;padding:0 5px;margin-left:4px;border-radius:9px;background:var(--red);color:#fff;font-size:11px;font-weight:800;line-height:18px;text-align:center;">' + n + '</span>' : '');
}

function closeAlert(id) {
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    db.ref('alerts/' + id + '/status').set('resolved').catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// Ответ админа на вызов: записывает в `alerts/<id>/response` и шлёт уведомление
// игроку в `users/<playerId>/notifications` — клиент игрока подхватит его при следующем
// заходе в live/solo и покажет тост «Судья/маршал едет».
function respondToAlert(alertId, alertType, playerId) {
    if (!alertId) return;
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!playerId) {
        toast(currentLang === 'en' ? '⚠️ Player ID is unknown for this alert' : '⚠️ Не удалось определить игрока для ответа', 'error');
        return;
    }

    var now = Date.now();
    var responderRole = (alertType === 'marshal') ? 'marshal' : 'referee';

    var responseData = {
        status: 'accepted',
        responderRole: responderRole,
        respondedAt: now,
        respondedBy: currentUser ? currentUser.uid : 'admin'
    };

    var notification = {
        type: 'call_response',
        alertId: alertId,
        responderRole: responderRole,
        time: now,
        read: false
    };

    var settingPromise = typeof pestovoCheckGlobalNotificationsEnabled === 'function'
        ? pestovoCheckGlobalNotificationsEnabled()
        : Promise.resolve(admGlobalNotificationsEnabled !== false);
    settingPromise.then(function (globalEnabled) {
        var notificationsEnabled = globalEnabled !== false && admGlobalNotificationsEnabled !== false;
        var updates = {};
        updates['alerts/' + alertId + '/response'] = responseData;
        if (notificationsEnabled) updates['users/' + playerId + '/notifications/' + alertId] = notification;

        return db.ref().update(updates).then(function() {
            var who = responderRole === 'marshal'
                ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
                : (currentLang === 'en' ? 'Referee' : 'Судья');
            toast(notificationsEnabled
                ? (currentLang === 'en' ? '✅ ' + who + ' is on the way! Player notified.' : '✅ ' + who + ' едет! Игрок уведомлён.')
                : (currentLang === 'en' ? '✅ ' + who + ' is on the way. Player notifications are globally disabled.' : '✅ ' + who + ' едет. Уведомления игрокам глобально отключены.'), 'success');
            if (typeof vib === 'function') vib([50, 30, 50]);
        });
    }).catch(function(err) {
        toast((currentLang === 'en' ? '❌ Response failed: ' : '❌ Ошибка отправки ответа: ') + (err && err.message ? err.message : err), 'error');
    });
}
