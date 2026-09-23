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
function admAlertsScheduleRender() {
    if (admAlertsRenderTimer) return;
    admAlertsRenderTimer = setTimeout(function() {
        admAlertsRenderTimer = null;
        var p = admAlertsPending;
        admAlertsPending = null;
        if (p) { try { admAlertsRenderPanel(p); } catch (e) { console.warn('[alerts render]', e); } }
    }, 300);
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
                bannerEl.innerHTML = '<div class="card" style="background:rgba(224,90,74,0.18);border:2px solid var(--red);margin-bottom:16px;cursor:pointer;" onclick="switchTab(\'alerts\', document.querySelector(\'[data-i18n=tab_alerts]\'))">' +
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
                    html += '<button class="btn btn-g btn-sm" style="background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;border:none;" onclick="respondToAlert(\'' + id + '\', \'' + a.type + '\', \'' + (a.playerId || '') + '\')"><i class="fas fa-car"></i> ' + acceptCallText + '</button>';
                }
                html += '<button class="btn btn-r btn-sm" onclick="closeAlert(\'' + id + '\')">' + (currentLang === 'en' ? 'Dismiss Alert' : 'Закрыть вызов') + '</button>';
                html += '</div>';
                html += '</div>';
            });

            c.innerHTML = html;
        }

        if (hasNewAlert) {
            var first = entries[0] && entries[0][1] ? entries[0][1] : {};
            var firstWho = first.type === 'marshal'
                ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
                : (currentLang === 'en' ? 'Referee' : 'Судья');
            toast((currentLang === 'en'
                ? '🚨 ' + firstWho + ' called to hole ' + (first.hole || '—')
                : '🚨 ' + firstWho + ' вызван на лунку ' + (first.hole || '—')) +
                (entries.length > 1 ? (currentLang === 'en' ? ' (+' + (entries.length - 1) + ' more)' : ' (+' + (entries.length - 1) + ' ещё)') : ''),
                'error');
            try { vib([200, 100, 200]); } catch (eVib) { console.warn("[silent]", eVib); }
        }
}

function listenForAlerts() {
    if (typeof db === 'undefined' || !db) return;
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

    var updates = {};
    updates['alerts/' + alertId + '/response'] = responseData;
    updates['users/' + playerId + '/notifications/' + alertId] = notification;

    db.ref().update(updates).then(function() {
        var who = responderRole === 'marshal'
            ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
            : (currentLang === 'en' ? 'Referee' : 'Судья');
        toast((currentLang === 'en' ? '✅ ' + who + ' is on the way! Player notified.' : '✅ ' + who + ' едет! Игрок уведомлён.'), 'success');
        if (typeof vib === 'function') vib([50, 30, 50]);
    }).catch(function(err) {
        toast((currentLang === 'en' ? '❌ Response failed: ' : '❌ Ошибка отправки ответа: ') + (err && err.message ? err.message : err), 'error');
    });
}
