// ESM canonical official-alert senders (Telegram/VK referee-marshal alerts).
// Mirrors js/official-alerts.js — the classic-script copy that legacy pages
// load. Consumers call these via typeof guards, load order does not matter.
// TELEGRAM BOT OFFICIAL ALERTS (GROUP & CHANNEL)
// ==========================================
// Формат сообщения о вызове судьи/маршала (общий для Telegram и ВКонтакте):
//   Вызов Судьи / Вызов Маршала
//   Кто вызвал: Имя Фамилия игрока
//   Лунка: №N
//   Время: ЧЧ:ММ
//   Состав флайта: Имя Фамилия, ... (все игроки, играющие на поле
//   вместе с вызвавшим; для группового раунда)
export function buildOfficialCallText(type, holeNum, callerName, flightNames, withHtml) {
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

// Внутренний «молчаливый» отправитель: используется, когда вызов делает
// ИГРОК с поля — он не должен видеть «Тайм-аут соединения» / «Ошибка сети»
// в тосте (он уже нажал «Вызвать судью» и видит «🚨 Судья вызван»).
export function sendTelegramDirectAlert(token, chat, labelName, type, holeNum, playerName, flightNames) {
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
export function sendTelegramSilentAlert(token, chat, type, holeNum, playerName, flightNames) {
    token = (token || '').trim();
    chat = (chat || '').trim();
    if (!token || !chat) return; // нет настроек — тихо выходим

    var text = buildOfficialCallText(type, holeNum, playerName, flightNames, true);

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { try { controller.abort(); } catch (e) { console.warn("[silent]", e); } }, 6000) : null;

    var fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML' })
    };
    if (controller) fetchOptions.signal = controller.signal;

    fetch('https://api.telegram.org/bot' + token + '/sendMessage', fetchOptions)
    .then(function(res) {
        if (timeoutId) clearTimeout(timeoutId);
        return res.json();
    })
    .then(function(data) {
        if (!data || !data.ok) {
            console.warn('⚠️ Telegram silent send failed:', data && data.description);
        }
    })
    .catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        // Намеренно НЕ показываем toast — игрок уже получил «🚨 Судья вызван».
        // Тайм-аут / ошибка сети — внутренняя кухня отправки уведомления админу,
        // а вызов уже зафиксирован в Firebase (`alerts/<id>`) и виден в админке.
        console.warn('⚠️ Telegram silent send error (suppressed):', err && err.message);
    });
}

export function sendTelegramOfficialAlert(type, holeNum, playerName, flightNames, targetMode) {
    // ВАЖНО: этот вызов делает ИГРОК. Никаких тостов об ошибках сети / таймаутах
    // Telegram ему показывать нельзя — он уже видит «🚨 Судья вызван». Если Telegram
    // настроен и отвечает — это плюс. Если нет — вызов всё равно лежит в Firebase
    // и админ увидит его в панели «Вызовы».
    var groupToken = (localStorage.getItem('pestovo_tg_group_token') || localStorage.getItem('pestovo_tg_bot_token') || '').trim();
    var groupId = (localStorage.getItem('pestovo_tg_group_id') || localStorage.getItem('pestovo_tg_chat_id') || '').trim();

    var channelToken = (localStorage.getItem('pestovo_tg_channel_token') || groupToken || '').trim();
    var channelId = (localStorage.getItem('pestovo_tg_channel_id') || '').trim();

    if (groupToken && groupId && (targetMode === 'group' || !targetMode)) {
        sendTelegramSilentAlert(groupToken, groupId, type, holeNum, playerName, flightNames);
    }
    if (channelToken && channelId && (targetMode === 'channel' || !targetMode)) {
        sendTelegramSilentAlert(channelToken, channelId, type, holeNum, playerName, flightNames);
    }

    if (!groupToken && !channelToken && typeof db !== 'undefined') {
        db.ref('settings/telegram').once('value').then(function(sn) {
            var tg = sn.val() || {};
            var gTok = (tg.groupToken || tg.botToken || '').trim();
            var gId = (tg.groupId || tg.chatId || '').trim();
            var cTok = (tg.channelToken || gTok || '').trim();
            var cId = (tg.channelId || '').trim();

            if (gTok && gId && (targetMode === 'group' || !targetMode)) {
                sendTelegramSilentAlert(gTok, gId, type, holeNum, playerName, flightNames);
            }
            if (cTok && cId && (targetMode === 'channel' || !targetMode)) {
                sendTelegramSilentAlert(cTok, cId, type, holeNum, playerName, flightNames);
            }
        });
    }
}

// ==========================================
// VK API OFFICIAL ALERTS
// Использует JSONP (<script>-тег) для обхода CORS-ограничений браузера.
// VK API официально поддерживает JSONP через параметр callback=.
// ==========================================

/**
 * Низкоуровневая отправка через JSONP — единственный способ вызвать
 * VK API из браузера без серверного прокси (обходит CORS).
 *
 * @param {string} token     - Access Token сообщества VK
 * @param {string} peerId    - Peer ID беседы / пользователя
 * @param {string} text      - Текст сообщения
 * @param {boolean} silent   - true = без тостов об ошибках
 */
export function vkSendMessageJsonp(token, peerId, text, silent) {
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) {
        if (!silent) toast('⚠️ Укажите VK Access Token и Peer ID в настройках', 'error');
        return;
    }

    var cbName = '_vkCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    var randomId = Math.floor(Math.random() * 2000000000);
    var timeoutId = null;
    var script = null;

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
    };

    // Таймаут 10 секунд
    timeoutId = setTimeout(function() {
        cleanup();
        if (!silent) {
            toast('❌ Таймаут соединения с VK (10 сек)', 'error');
        } else {
            console.warn('⚠️ VK JSONP timeout (suppressed)');
        }
    }, 10000);

    (document.head || document.body).appendChild(script);
}

/**
 * Формирует текст уведомления о вызове судьи/маршала (обычный текст для VK).
 */
export function vkBuildAlertText(type, holeNum, playerName, flightNames) {
    return buildOfficialCallText(type, holeNum, playerName, flightNames, false);
}

/**
 * Прямая отправка с тостами (для теста из админки).
 */
export function sendVKDirectAlert(token, peerId, type, holeNum, playerName, flightNames) {
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
export function sendVKSilentAlert(token, peerId, type, holeNum, playerName, flightNames) {
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) return;
    var text = vkBuildAlertText(type, holeNum, playerName, flightNames);
    vkSendMessageJsonp(token, peerId, text, true);
}

/**
 * Точка входа при вызове судьи/маршала ИГРОКОМ.
 * Читает настройки из localStorage → Firebase, отправляет молча.
 */
export function sendVKOfficialAlert(type, holeNum, playerName, flightNames) {
    var vkToken  = (localStorage.getItem('pestovo_vk_token')   || '').trim();
    var vkPeerId = (localStorage.getItem('pestovo_vk_peer_id') || '').trim();

    if (vkToken && vkPeerId) {
        sendVKSilentAlert(vkToken, vkPeerId, type, holeNum, playerName, flightNames);
    } else if (typeof db !== 'undefined') {
        db.ref('settings/vk').once('value').then(function(sn) {
            var vk = sn.val() || {};
            var token = (vk.token  || '').trim();
            var peer  = (vk.peerId || '').trim();
            if (token && peer) {
                sendVKSilentAlert(token, peer, type, holeNum, playerName, flightNames);
            }
        }).catch(function(e) {
            console.warn('⚠️ VK: не удалось загрузить настройки из Firebase:', e);
        });
    }
}

if (typeof window !== 'undefined') {
    Object.assign(window, { buildOfficialCallText, sendTelegramDirectAlert, sendTelegramSilentAlert, sendTelegramOfficialAlert, vkSendMessageJsonp, vkBuildAlertText, sendVKDirectAlert, sendVKSilentAlert, sendVKOfficialAlert });
}
