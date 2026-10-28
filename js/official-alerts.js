// js/official-alerts.js — отправка алертов о вызове судьи/маршала в
// Telegram и VK; вынесено из js/utils.js (docs/CODE-REVIEW.md, п.1/п.3).
// Формирование текста (buildOfficialCallText), JSONP-отправка в VK,
// Bot API Telegram. Боевую отправку вызова делает БРАУЗЕР того, кто нажал
// кнопку (pestovoDeliverOfficialCall) — Cloud Functions не требуются.
// Потребители (live/marker/scorer/solo и utils.js) зовут функции
// typeof-guarded, порядок загрузки не критичен; грузится рядом с utils.js.
// Load-time кода нет.
//
// Это классический двойник src/official-alerts.js (ESM-копия уходит в бандл
// dist/livescoring-modules.js, который и грузят страницы). Наборы имён
// обязаны совпадать — проверяет tools/test-esm-parity.js.
//
// ── Токены ────────────────────────────────────────────────────────────────
// Токены читаются из ветки channels/ (database.rules.json: ".read":
// "auth != null"), кэшируются в памяти страницы и НЕ сохраняются в
// localStorage. Любой вошедший (включая анонимную QR-сессию) может их
// прочитать — это осознанная плата за доставку без сервера
// (docs/CODE-AUDIT-2026-10-2.md, находка 1; подробности и компенсации —
// в docs/release-1.123.0.md).
//
// Переключатель settings/alert_delivery_mode: 'client' (по умолчанию) — шлёт
// браузер; 'server' — шлёт Cloud Function onAlertCreated, браузер молчит.

// ==========================================
// TELEGRAM BOT OFFICIAL ALERTS (GROUP & CHANNEL)
// ==========================================
// Формат сообщения о вызове судьи/маршала (общий для Telegram и ВКонтакте):
//   Вызов Судьи / Вызов Маршала
//   Кто вызвал: Имя Фамилия игрока
//   Лунка: №N
//   Время: ЧЧ:ММ
//   Состав флайта: Имя Фамилия, ... (все игроки, играющие на поле
//   вместе с вызвавшим; для группового раунда)
function buildOfficialCallText(type, holeNum, callerName, flightNames, withHtml) {
    var isHtml = !!withHtml;
    var esc = isHtml ? escapeHtml : function(v) { return String(v); };
    var timeStr = typeof fmtTime === 'function' ? fmtTime(Date.now()) : new Date().toLocaleTimeString('ru-RU');
    var title = type === 'referee' ? '🚨 Вызов Судьи' : '🚨 Вызов Маршала';
    var bOpen = isHtml ? '<b>' : '', bClose = isHtml ? '</b>' : '';
    var parts = [];
    parts.push(isHtml ? '<b>' + title + '</b>' : title);
    parts.push(bOpen + 'Кто вызвал:' + bClose + ' ' + esc(callerName || 'Игрок'));
    parts.push(bOpen + 'Лунка:' + bClose + ' №' + holeNum);
    parts.push(bOpen + 'Время:' + bClose + ' ' + timeStr);
    var flight = (flightNames || []).map(function(n) { return String(n || '').trim(); }).filter(Boolean);
    if (flight.length) {
        parts.push(bOpen + 'Состав флайта:' + bClose + ' ' + esc(flight.join(', ')));
    }
    return parts.join('\n');
}

// ── Настройки каналов (токены) ────────────────────────────────────────────
// Один поход в базу на страницу, дальше — кэш в памяти на 5 минут. Кэш живёт
// на самой функции (._state), а не в top-level var: у файла есть ESM-двойник,
// и tools/test-esm-parity.js сверяет наборы имён — внутренние переменные
// пришлось бы экспортировать и вешать на window.
// В localStorage токены НЕ пишутся: на общем планшете их прочитал бы любой.
function pestovoOfficialChannels(force) {
    var st = pestovoOfficialChannels._state ||
        (pestovoOfficialChannels._state = { at: 0, cfg: null, promise: null });
    var TTL = 5 * 60 * 1000;
    var empty = { telegram: {}, vk: {}, mode: 'client', readAt: 0 };

    if (!force && st.cfg && Date.now() - st.at < TTL) return Promise.resolve(st.cfg);
    if (!force && st.promise) return st.promise;
    if (typeof db === 'undefined' || !db) return Promise.resolve(empty);

    st.promise = Promise.all([
        db.ref('channels').once('value').catch(function(err) {
            // Правила не задеплоены / нет сети: доставка невозможна, но страница
            // обязана работать дальше.
            console.warn('[alerts] channels read failed', err && err.message);
            return null;
        }),
        db.ref('settings/alert_delivery_mode').once('value').catch(function() { return null; })
    ]).then(function(snaps) {
        var v = (snaps[0] && snaps[0].val()) || {};
        var tg = v.telegram || {};
        var vk = v.vk || {};
        var mode = String((snaps[1] && snaps[1].val()) || 'client');
        var groupToken = String(tg.groupToken || tg.botToken || '').trim();
        var groupId = String(tg.groupId || tg.chatId || '').trim();
        var channelId = String(tg.channelId || '').trim();
        st.cfg = {
            telegram: {
                groupToken: groupToken,
                groupId: groupId,
                // «Или использовать один и тот же бот» (подсказка в админке):
                // для канала достаточно ID, токен берём у группы.
                channelToken: String(tg.channelToken || '').trim() || (channelId ? groupToken : ''),
                channelId: channelId
            },
            vk: {
                token: String(vk.token || '').trim(),
                peerId: String(vk.peerId == null ? '' : vk.peerId).trim()
            },
            mode: mode === 'server' ? 'server' : 'client',
            readAt: Date.now()
        };
        st.at = Date.now();
        st.promise = null;
        return st.cfg;
    }).catch(function(err) {
        st.promise = null;
        console.warn('[alerts] channels unavailable', err && err.message);
        return empty;
    });
    return st.promise;
}

// Внутренний «молчаливый» отправитель: используется, когда вызов делает
// ИГРОК с поля — он не должен видеть «Тайм-аут соединения» / «Ошибка сети»
// в тосте (он уже нажал «Вызвать судью» и видит «🚨 Судья вызван»).
function sendTelegramDirectAlert(token, chat, labelName, type, holeNum, playerName, flightNames) {
    if (typeof pestovoGlobalNotificationsSettingReady === 'function' && !pestovoGlobalNotificationsSettingReady()) {
        pestovoCheckGlobalNotificationsEnabled().then(function (enabled) {
            if (enabled) sendTelegramDirectAlert(token, chat, labelName, type, holeNum, playerName, flightNames);
        });
        return;
    }
    if (typeof pestovoAreGlobalNotificationsEnabled === 'function' && !pestovoAreGlobalNotificationsEnabled()) {
        if (typeof toast === 'function') toast(currentLang === 'en' ? 'Club notifications are globally disabled.' : 'Уведомления клуба глобально отключены.', 'warn');
        return;
    }
    token = (token || '').trim();
    chat = (chat || '').trim();

    if (!token || !chat) {
        toast('⚠️ Укажите Bot Token и Chat ID / Username для ' + (labelName || 'Telegram'), 'error');
        return;
    }

    var text = buildOfficialCallText(type, holeNum, playerName, flightNames, true);

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { try { controller.abort(); } catch (e) { console.warn("[silent]", e); } }, 6000) : null;

    var fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chat,
            text: text,
            parse_mode: 'HTML'
        })
    };
    if (controller) fetchOptions.signal = controller.signal;

    fetch('https://api.telegram.org/bot' + token + '/sendMessage', fetchOptions)
    .then(function(res) {
        if (timeoutId) clearTimeout(timeoutId);
        return res.json();
    })
    .then(function(data) {
        if (data && data.ok) {
            console.log('✅ Telegram alert delivered to ' + labelName + ':', data.result);
            toast('✅ Telegram сообщение доставлено в ' + (labelName || 'чат') + '!', 'success');
        } else {
            var errDesc = (data && data.description) ? data.description : 'Ошибка Telegram API';
            console.error('❌ Telegram Bot API Error (' + labelName + '):', errDesc);
            toast('❌ Ошибка Telegram (' + (labelName || 'чат') + '): ' + errDesc, 'error');
        }
    })
    .catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        var isAbort = err && err.name === 'AbortError';
        var errMsg = isAbort ? 'Таймаут соединения (6 сек)' : (err ? err.message : 'Ошибка сети');
        console.error('❌ Telegram Fetch Error (' + labelName + '):', err);
        toast('❌ Ошибка сети / Таймаут Telegram: ' + errMsg, 'error');
    });
}

// «Молчаливый» вариант: та же логика, но без тостов на ошибках и успехах.
// Используется, когда вызов инициирует ИГРОК — он не должен получать
// «Тайм-аут соединения» или «Ошибка сети», только «🚨 Судья вызван».
// Возвращает Promise<статус> ('sent' / 'not_configured' / 'error: …') —
// статусы нужны для отчёта о доставке в alerts/<id>/delivery.
function sendTelegramSilentAlert(token, chat, type, holeNum, playerName, flightNames) {
    if (typeof pestovoGlobalNotificationsSettingReady === 'function' && !pestovoGlobalNotificationsSettingReady()) {
        return pestovoCheckGlobalNotificationsEnabled().then(function (enabled) {
            return enabled
                ? sendTelegramSilentAlert(token, chat, type, holeNum, playerName, flightNames)
                : 'disabled';
        });
    }
    if (typeof pestovoAreGlobalNotificationsEnabled === 'function' && !pestovoAreGlobalNotificationsEnabled()) {
        return Promise.resolve('disabled');
    }
    token = (token || '').trim();
    chat = (chat || '').trim();
    if (!token || !chat) return Promise.resolve('not_configured'); // нет настроек — тихо выходим

    var text = buildOfficialCallText(type, holeNum, playerName, flightNames, true);

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { try { controller.abort(); } catch (e) { console.warn("[silent]", e); } }, 6000) : null;

    var fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML' })
    };
    if (controller) fetchOptions.signal = controller.signal;

    return fetch('https://api.telegram.org/bot' + token + '/sendMessage', fetchOptions)
    .then(function(res) {
        if (timeoutId) clearTimeout(timeoutId);
        return res.json();
    })
    .then(function(data) {
        if (data && data.ok) return 'sent';
        var desc = (data && data.description) ? data.description : 'Ошибка Telegram API';
        console.warn('⚠️ Telegram silent send failed:', desc);
        return 'error: ' + desc;
    })
    .catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        // Намеренно НЕ показываем toast — игрок уже получил «🚨 Судья вызван».
        // Тайм-аут / ошибка сети — внутренняя кухня отправки уведомления админу,
        // а вызов уже зафиксирован в Firebase (`alerts/<id>`) и виден в админке.
        var isAbort = err && err.name === 'AbortError';
        console.warn('⚠️ Telegram silent send error (suppressed):', err && err.message);
        return 'error: ' + (isAbort ? 'таймаут (6 сек)' : (err && err.message ? err.message : 'ошибка сети'));
    });
}

/**
 * Точка входа при вызове судьи/маршала ИГРОКОМ: доставляет вызов в Telegram
 * (группа судей и, если настроен, канал клуба) и в ВКонтакте.
 *
 * Обе «официальные» точки входа (Telegram и VK) делегируют в
 * pestovoDeliverOfficialCall, потому что onSent зовёт их подряд: рассылка
 * обязана случиться ОДИН раз, а отчёт о доставке — записаться одним узлом.
 * Сигнатура сохранена: потребители зовут функцию typeof-guarded, а alertId
 * передаётся последним необязательным аргументом.
 */
function sendTelegramOfficialAlert(type, holeNum, playerName, flightNames, targetMode, alertId) {
    return pestovoDeliverOfficialCall(type, holeNum, playerName, flightNames, alertId);
}

// ==========================================
// VK API OFFICIAL ALERTS
// Использует JSONP (<script>-тег) для обхода CORS-ограничений браузера.
// VK API официально поддерживает JSONP через параметр callback=.
// Требуется script-src https://api.vk.com в CSP (firebase.json) — без него
// браузер блокирует <script> на api.vk.com и доставка молча не работает.
// ==========================================

/**
 * Низкоуровневая отправка через JSONP — единственный способ вызвать
 * VK API из браузера без серверного прокси (обходит CORS).
 * Возвращает Promise<статус> ('sent' / 'not_configured' / 'error: …').
 *
 * @param {string} token     - Access Token сообщества VK
 * @param {string} peerId    - Peer ID беседы / пользователя
 * @param {string} text      - Текст сообщения
 * @param {boolean} silent   - true = без тостов об ошибках
 */
function vkSendMessageJsonp(token, peerId, text, silent) {
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) {
        if (!silent) toast('⚠️ Укажите VK Access Token и Peer ID в настройках', 'error');
        return Promise.resolve('not_configured');
    }

    return new Promise(function(resolve) {
        var cbName = '_vkCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
        var randomId = Math.floor(Math.random() * 2000000000);
        var timeoutId = null;
        var script = null;
        var settled = false;
        var finish = function(status) {
            if (settled) return;
            settled = true;
            resolve(status);
        };

        var cleanup = function() {
            try { if (script && script.parentNode) script.parentNode.removeChild(script); } catch (e) { console.warn("[silent]", e); }
            try { delete window[cbName]; } catch(e) { window[cbName] = undefined; }
            if (timeoutId) clearTimeout(timeoutId);
        };

        window[cbName] = function(data) {
            cleanup();
            if (data && (data.response !== undefined) && data.response) {
                if (!silent) {
                    console.log('✅ VK message sent, id:', data.response);
                    toast('✅ Сообщение ВКонтакте доставлено!', 'success');
                }
                finish('sent');
            } else {
                var errCode = data && data.error && data.error.error_code;
                var errMsg  = data && data.error && data.error.error_msg
                              ? data.error.error_msg
                              : 'Ошибка VK API';
                console.error('❌ VK API Error ' + errCode + ':', errMsg, data);
                if (!silent) {
                    toast('❌ VK API: ' + errMsg, 'error');
                } else {
                    console.warn('⚠️ VK silent send failed (code ' + errCode + '):', errMsg);
                }
                finish('error: code ' + (errCode || '?') + ': ' + errMsg);
            }
        };

        var url = 'https://api.vk.com/method/messages.send' +
                  '?access_token=' + encodeURIComponent(token) +
                  '&peer_id='      + encodeURIComponent(peerId) +
                  '&message='      + encodeURIComponent(text) +
                  '&random_id='    + randomId +
                  '&v=5.199' +
                  '&callback='    + cbName;

        script = document.createElement('script');
        script.src = url;
        script.onerror = function() {
            cleanup();
            if (!silent) {
                toast('❌ Ошибка сети при отправке в VK (JSONP)', 'error');
            } else {
                console.warn('⚠️ VK JSONP network error (suppressed)');
            }
            finish('error: сеть/CSP (JSONP не загрузился)');
        };

        // Таймаут 10 секунд
        timeoutId = setTimeout(function() {
            cleanup();
            if (!silent) {
                toast('❌ Таймаут соединения с VK (10 сек)', 'error');
            } else {
                console.warn('⚠️ VK JSONP timeout (suppressed)');
            }
            finish('error: таймаут (10 сек)');
        }, 10000);

        (document.head || document.body).appendChild(script);
    });
}

/**
 * Формирует текст уведомления о вызове судьи/маршала (обычный текст для VK).
 */
function vkBuildAlertText(type, holeNum, playerName, flightNames) {
    return buildOfficialCallText(type, holeNum, playerName, flightNames, false);
}

/**
 * Прямая отправка с тостами (для теста из админки).
 */
function sendVKDirectAlert(token, peerId, type, holeNum, playerName, flightNames) {
    if (typeof pestovoGlobalNotificationsSettingReady === 'function' && !pestovoGlobalNotificationsSettingReady()) {
        pestovoCheckGlobalNotificationsEnabled().then(function (enabled) {
            if (enabled) sendVKDirectAlert(token, peerId, type, holeNum, playerName, flightNames);
        });
        return;
    }
    if (typeof pestovoAreGlobalNotificationsEnabled === 'function' && !pestovoAreGlobalNotificationsEnabled()) {
        if (typeof toast === 'function') toast(currentLang === 'en' ? 'Club notifications are globally disabled.' : 'Уведомления клуба глобально отключены.', 'warn');
        return;
    }
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) {
        toast('⚠️ Укажите VK Access Token и Peer ID в настройках', 'error');
        return;
    }
    var text = vkBuildAlertText(type, holeNum, playerName, flightNames);
    vkSendMessageJsonp(token, peerId, text, false);
}

/**
 * «Молчаливый» вариант для ИГРОКА: без тостов об ошибках.
 */
function sendVKSilentAlert(token, peerId, type, holeNum, playerName, flightNames) {
    if (typeof pestovoGlobalNotificationsSettingReady === 'function' && !pestovoGlobalNotificationsSettingReady()) {
        return pestovoCheckGlobalNotificationsEnabled().then(function (enabled) {
            return enabled
                ? sendVKSilentAlert(token, peerId, type, holeNum, playerName, flightNames)
                : 'disabled';
        });
    }
    if (typeof pestovoAreGlobalNotificationsEnabled === 'function' && !pestovoAreGlobalNotificationsEnabled()) {
        return Promise.resolve('disabled');
    }
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) return Promise.resolve('not_configured');
    var text = vkBuildAlertText(type, holeNum, playerName, flightNames);
    return vkSendMessageJsonp(token, peerId, text, true);
}

/**
 * Точка входа при вызове судьи/маршала ИГРОКОМ со стороны ВКонтакте.
 * Делегирует в общую доставку (см. sendTelegramOfficialAlert).
 */
function sendVKOfficialAlert(type, holeNum, playerName, flightNames, alertId) {
    return pestovoDeliverOfficialCall(type, holeNum, playerName, flightNames, alertId);
}

// ── Общая доставка вызова: Telegram (группа + канал) и ВКонтакте ──────────
// Единственное место, где боевой вызов судьи/маршала уходит наружу из браузера.
// Возвращает Promise<отчёт> — карта приёмник → статус.
function pestovoDeliverOfficialCall(type, holeNum, playerName, flightNames, alertId) {
    var st = pestovoDeliverOfficialCall._state ||
        (pestovoDeliverOfficialCall._state = { done: {} });

    // Дедупликация: onSent вызывает и sendTelegramOfficialAlert, и
    // sendVKOfficialAlert — без защиты судейский чат получил бы два одинаковых
    // сообщения. Ключ — id вызова, а без него тип+лунка+имя+5-секундное окно.
    var key = alertId ? 'id:' + alertId
        : 'k:' + [type, holeNum, playerName, Math.floor(Date.now() / 5000)].join('|');
    if (st.done[key]) return st.done[key].promise;

    // Глобальный выключатель уведомлений клуба (settings/notifications_enabled)
    // проверяется так же, как в pwa.js: настройка могла ещё не загрузиться.
    var gate = (typeof pestovoCheckGlobalNotificationsEnabled === 'function')
        ? pestovoCheckGlobalNotificationsEnabled().catch(function() { return true; })
        : Promise.resolve(true);

    var report = gate.then(function(enabled) {
        if (enabled === false) return { skipped: 'notifications_disabled' };
        return pestovoOfficialChannels().then(function(cfg) {
            if (cfg.mode === 'server') {
                // Режим 'server': доставку делает Cloud Function onAlertCreated.
                if (typeof console !== 'undefined' && console.debug) {
                    console.debug('[alerts] delivery mode = server, browser stays silent');
                }
                return { skipped: 'server_mode' };
            }

            var tg = cfg.telegram || {};
            var vk = cfg.vk || {};
            var results = {};
            var configured = {
                'telegram:group': !!(tg.groupToken && tg.groupId),
                'telegram:channel': !!(tg.channelToken && tg.channelId),
                'vk': !!(vk.token && vk.peerId)
            };
            var jobs = [];
            if (configured['telegram:group']) {
                jobs.push(sendTelegramSilentAlert(tg.groupToken, tg.groupId, type, holeNum, playerName, flightNames)
                    .then(function(s) { results['telegram:group'] = s; }));
            } else results['telegram:group'] = 'not_configured';
            if (configured['telegram:channel']) {
                jobs.push(sendTelegramSilentAlert(tg.channelToken, tg.channelId, type, holeNum, playerName, flightNames)
                    .then(function(s) { results['telegram:channel'] = s; }));
            } else results['telegram:channel'] = 'not_configured';
            if (configured.vk) {
                jobs.push(sendVKSilentAlert(vk.token, vk.peerId, type, holeNum, playerName, flightNames)
                    .then(function(s) { results.vk = s; }));
            } else results.vk = 'not_configured';

            if (!configured['telegram:group'] && !configured['telegram:channel'] && !configured.vk) {
                console.warn('[alerts] в channels/ ничего не настроено — вызов никуда не отправлен');
            }
            return Promise.all(jobs).then(function() {
                return pestovoRecordClientDelivery(alertId, results, configured);
            });
        });
    }).catch(function(err) {
        // Игрок уже увидел «🚨 Судья вызван», а вызов записан в alerts/ —
        // падать здесь нечему.
        console.warn('[alerts] delivery failed', err && err.message);
        return { skipped: 'error', error: String((err && err.message) || err).slice(0, 200) };
    });

    // Отчёт кэшируем синхронно: второй вход (VK) получит тот же промис и не
    // станет слать повторно, даже если первый ещё не завершился.
    st.done[key] = { promise: report, at: Date.now() };
    Object.keys(st.done).forEach(function(k) {
        if (Date.now() - st.done[k].at > 60000) delete st.done[k];
    });
    return report;
}

// Отчёт о доставке пишется в сам вызов — alerts/<id>/delivery — и показывается
// в панели «Вызовы» админки. Без него «сообщение не пришло» неотличимо от
// «токен не сохранили» и «браузер заблокировал запрос».
// Правила разрешают запись создателю вызова (alerts/$id/delivery/.write):
// playerId для QR-сессии — это игрок, а не авторизованный анонимный uid,
// поэтому requestOfficialCall дополнительно пишет createdBy.
// Запись best-effort: если правила не задеплоены, доставка всё равно выполнена.
function pestovoRecordClientDelivery(alertId, results, configured) {
    var report = {
        by: 'client',
        at: Date.now(),
        channels: results || {},
        configured: configured || {}
    };
    var sent = 0;
    Object.keys(results || {}).forEach(function(k) { if (results[k] === 'sent') sent++; });
    report.sent = sent;
    if (!alertId || typeof db === 'undefined' || !db) return Promise.resolve(report);
    // update(), а не set(): сервер (functions/index.js) в любой момент пишет
    // вложенный leaf alerts/<id>/delivery/push, и полная перезапись узла его
    // бы стёрла — панель «Вызовы» потеряла бы счётчик пуш-уведомлений.
    return db.ref('alerts/' + alertId + '/delivery').update(report).then(function() {
        return report;
    }).catch(function(err) {
        console.warn('[alerts] delivery report not saved', err && err.message);
        return report;
    });
}
