// js/admin-channels.js — Telegram/VK интеграции админки (бот-токены, чаты,
// тестовые алерты); вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3).
//
// СЕКРЕТЫ. Токены бота и VK access token хранятся в ветке `channels/` —
// у неё `.read` только для админа/мастера (database.rules.json). Раньше они
// лежали в `settings/telegram` и `settings/vk`, а у `/settings` `.read: true`:
// то есть живой токен бота читался из интернета без авторизации
// (docs/CODE-AUDIT-2026-10-2.md, находка 1). В RTDB нельзя сузить чтение
// потомка ниже родителя, поэтому секретам нужна отдельная ветка.
// В `settings/telegram` и `settings/vk` правила теперь пропускают только
// удаление (`.validate: "!newData.exists()"`) — записать туда токен снова не
// получится, а `migrateLegacyChannelSecrets()` вычищает старые значения.
//
// Токены НЕ сохраняются в localStorage: на общем планшете админки их читал бы
// любой скрипт и любой следующий пользователь устройства. ID чатов — не секрет,
// они кэшируются локально, чтобы панель открывалась без сети.
//
// Боевую отправку алертов игрока делает сервер (functions/index.js,
// onAlertCreated) — клиентские sendTelegramOfficialAlert/sendVKOfficialAlert
// остались только как путь для админских «проверить соединение».
// Внешних зависимостей от admin.js нет: только runtime-глобалы
// (db, toast, currentLang).

// Ключи, в которых прежние версии держали токены. Вычищаются при загрузке.
var CHANNEL_SECRET_STORE_KEYS = ['pestovo_tg_group_token', 'pestovo_tg_bot_token',
    'pestovo_tg_channel_token', 'pestovo_vk_token'];

function channelStoreGet(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
}
function channelStoreSet(key, value) {
    try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); }
    catch (e) { console.warn('[channels] localStorage unavailable', e); }
}
// Токены больше не живут в браузере: удаляем то, что оставили прошлые версии.
function purgeChannelSecretsFromStorage() {
    CHANNEL_SECRET_STORE_KEYS.forEach(function(key) {
        try { localStorage.removeItem(key); } catch (e) { /* приватный режим */ }
    });
}

// Перенос секретов из публичного /settings в админский /channels + удаление
// старых узлов. Идемпотентно: вызывается при загрузке панели.
function migrateLegacyChannelSecrets() {
    if (typeof db === 'undefined' || !db) return Promise.resolve();
    var updates = {};
    return Promise.all([
        db.ref('settings/telegram').once('value').catch(function() { return null; }),
        db.ref('settings/vk').once('value').catch(function() { return null; })
    ]).then(function(snaps) {
        var tg = (snaps[0] && snaps[0].val()) || null;
        var vk = (snaps[1] && snaps[1].val()) || null;
        if (tg) {
            updates['channels/telegram'] = {
                groupToken: tg.groupToken || tg.botToken || '',
                groupId: tg.groupId || tg.chatId || '',
                channelToken: tg.channelToken || '',
                channelId: tg.channelId || '',
                botToken: tg.botToken || tg.groupToken || '',
                chatId: tg.chatId || tg.groupId || '',
                migratedAt: Date.now()
            };
            updates['settings/telegram'] = null;
        }
        if (vk) {
            updates['channels/vk'] = { token: vk.token || '', peerId: vk.peerId || '', migratedAt: Date.now() };
            updates['settings/vk'] = null;
        }
        if (!Object.keys(updates).length) return null;
        return db.ref().update(updates).then(function() {
            console.info('[channels] секреты перенесены из /settings в /channels');
        }).catch(function(err) {
            console.warn('[channels] перенос секретов не удался', err && err.message);
        });
    });
}

// ==========================================
// TELEGRAM BOT SETTINGS & ALERTS (GROUP & CHANNEL)
// ==========================================
function loadTelegramSettings() {
    var gTokInp = document.getElementById('tg-group-bot-token');
    var gChatInp = document.getElementById('tg-group-chat-id');
    var cTokInp = document.getElementById('tg-channel-bot-token');
    var cChatInp = document.getElementById('tg-channel-id');

    // Из кэша — только ID чатов (не секрет). Токены приходят исключительно из БД.
    if (gChatInp) gChatInp.value = channelStoreGet('pestovo_tg_group_id') || channelStoreGet('pestovo_tg_chat_id');
    if (cChatInp) cChatInp.value = channelStoreGet('pestovo_tg_channel_id');
    if (gTokInp) gTokInp.value = '';
    if (cTokInp) cTokInp.value = '';

    if (typeof db !== 'undefined') {
        migrateLegacyChannelSecrets().then(function() {
            return db.ref('channels/telegram').once('value');
        }).then(function(sn) {
            var tg = sn.val() || {};
            if (gTokInp && (tg.groupToken || tg.botToken)) gTokInp.value = tg.groupToken || tg.botToken;
            if (gChatInp && (tg.groupId || tg.chatId)) {
                gChatInp.value = tg.groupId || tg.chatId;
                channelStoreSet('pestovo_tg_group_id', gChatInp.value);
            }
            if (cTokInp && (tg.channelToken || tg.botToken)) cTokInp.value = tg.channelToken || tg.botToken;
            if (cChatInp && tg.channelId) {
                cChatInp.value = tg.channelId;
                channelStoreSet('pestovo_tg_channel_id', tg.channelId);
            }
        }).catch(function(err) {
            console.warn('[channels] не удалось прочитать настройки Telegram', err && err.message);
        });
    }
}

function saveTelegramSettings(targetMode) {
    var gTokInp = document.getElementById('tg-group-bot-token');
    var gChatInp = document.getElementById('tg-group-chat-id');
    var cTokInp = document.getElementById('tg-channel-bot-token');
    var cChatInp = document.getElementById('tg-channel-id');

    var gToken = gTokInp ? gTokInp.value.trim() : '';
    var gId = gChatInp ? gChatInp.value.trim() : '';
    var cToken = cTokInp ? cTokInp.value.trim() : '';
    var cId = cChatInp ? cChatInp.value.trim() : '';

    channelStoreSet('pestovo_tg_group_id', gId);
    channelStoreSet('pestovo_tg_chat_id', gId);
    channelStoreSet('pestovo_tg_channel_id', cId);
    purgeChannelSecretsFromStorage();

    if (typeof db === 'undefined') {
        toast(currentLang === 'en'
            ? '⚠️ No database connection — token was not saved'
            : '⚠️ Нет подключения к базе — токен не сохранён', 'error');
        return;
    }

    // Пустое поле токена НЕ означает «удалить токен». loadTelegramSettings()
    // сначала очищает поля, а значения приходят из channels/ асинхронно: если
    // нажать «Сохранить» до их прихода (или когда чтение ветки не удалось),
    // рабочий токен затирался пустой строкой. После этого «Проверить Группу»
    // продолжало присылать сообщение — тест шлёт из браузера значением из
    // поля, — а вызовы судьи во время раунда переставали доходить: сервер
    // (onAlertCreated) читает именно channels/telegram и находил там пустоту.
    // Поэтому сохраняем слиянием: пустое поле оставляет прежнее значение.
    db.ref('channels/telegram').once('value').catch(function () { return null; }).then(function (sn) {
        var stored = (sn && sn.val()) || {};
        var kept = [];
        var mergedGroupToken = gToken;
        var mergedChannelToken = cToken;
        var mergedGroupId = gId;
        var mergedChannelId = cId;
        if (!mergedGroupToken && (stored.groupToken || stored.botToken)) {
            mergedGroupToken = stored.groupToken || stored.botToken;
            kept.push(currentLang === 'en' ? 'group token' : 'токен группы');
        }
        if (!mergedChannelToken && (stored.channelToken || stored.botToken)) {
            mergedChannelToken = stored.channelToken || stored.botToken;
            kept.push(currentLang === 'en' ? 'channel token' : 'токен канала');
        }
        if (!mergedGroupId && (stored.groupId || stored.chatId)) {
            mergedGroupId = stored.groupId || stored.chatId;
            kept.push(currentLang === 'en' ? 'group chat id' : 'chat id группы');
        }
        if (!mergedChannelId && stored.channelId) {
            mergedChannelId = stored.channelId;
            kept.push(currentLang === 'en' ? 'channel id' : 'id канала');
        }

        return db.ref('channels/telegram').update({
            groupToken: mergedGroupToken,
            groupId: mergedGroupId,
            channelToken: mergedChannelToken,
            channelId: mergedChannelId,
            botToken: mergedGroupToken || mergedChannelToken,
            chatId: mergedGroupId,
            updatedAt: Date.now()
        }).then(function () {
            // Старая публичная копия не должна оставаться в базе.
            return db.ref('settings/telegram').remove().catch(function () {});
        }).then(function () {
            var okText = currentLang === 'en' ? '✅ Telegram settings saved!' : '✅ Настройки Telegram сохранены!';
            if (kept.length) {
                okText += currentLang === 'en'
                    ? ' Kept saved values for empty fields: ' + kept.join(', ') + '.'
                    : ' Пустые поля оставлены без изменений: ' + kept.join(', ') + '.';
            }
            toast(okText + (currentLang === 'en'
                ? ' Check delivery with “Test server delivery”.'
                : ' Проверьте доставку кнопкой «Проверить серверную доставку».'), 'success');
        });
    }).catch(function (err) {
        // Молчать здесь нельзя: несохранённый токен — это ровно тот случай,
        // когда тесты в админке проходят, а во время раунда ничего не уходит.
        toast('⚠️ ' + (currentLang === 'en' ? 'Not saved: ' : 'Не сохранено: ') + (err && err.message || err) +
            (currentLang === 'en'
                ? ' — calls during a round will not be delivered.'
                : ' — вызовы во время раунда доставляться не будут.'), 'error');
    });
}

// Сохранить секрет в channels/ и СООБЩИТЬ, если запись не удалась.
// Раньше ошибка проглатывалась (.catch(function(){})): тестовое сообщение
// приходило (тест шлёт из браузера значением из поля), админ считал
// интеграцию рабочей, а боевая доставка во время раунда — серверная
// (onAlertCreated читает channels/ через Admin SDK) — токенов не находила.
// Именно так выглядит «тесты проходят, а на лунке ничего не приходит».
function persistChannelSecrets(path, values) {
    if (typeof db === 'undefined' || !db) return Promise.resolve(false);
    return db.ref(path).update(values).then(function () {
        // Старая публичная копия (/settings) не должна оставаться в базе.
        return db.ref(path === 'channels/vk' ? 'settings/vk' : 'settings/telegram').remove().catch(function () {}).then(function () { return true; });
    }).catch(function (err) {
        toast((currentLang === 'en'
            ? '⚠️ The test message is sent from the browser, but the token was NOT saved to the database: '
            : '⚠️ Тестовое сообщение уйдёт из браузера, но токен НЕ сохранён в базу: ') +
            (err && err.message || err) +
            (currentLang === 'en'
                ? '. Calls during a round are delivered by the server — they will not arrive.'
                : '. Вызовы во время раунда отправляет сервер — они доходить не будут.'), 'error');
        return false;
    });
}

function testTelegramGroupAlert() {
    var gTokInp = document.getElementById('tg-group-bot-token');
    var gChatInp = document.getElementById('tg-group-chat-id');
    var token = gTokInp ? gTokInp.value.trim() : '';
    var chatId = gChatInp ? gChatInp.value.trim() : '';

    if (!token || !chatId) {
        toast('⚠️ Укажите Group Bot Token и Group Chat ID перед проверкой', 'error');
        return;
    }

    channelStoreSet('pestovo_tg_group_id', chatId);
    purgeChannelSecretsFromStorage();

    persistChannelSecrets('channels/telegram', {
        groupToken: token,
        groupId: chatId,
        botToken: token,
        chatId: chatId,
        updatedAt: Date.now()
    });

    sendTelegramDirectAlert(token, chatId, 'Группу', 'referee', 1, 'Администратор Клуба', []);
}

function testTelegramChannelAlert() {
    var cTokInp = document.getElementById('tg-channel-bot-token');
    var cChatInp = document.getElementById('tg-channel-id');
    var token = cTokInp ? cTokInp.value.trim() : '';
    var chatId = cChatInp ? cChatInp.value.trim() : '';

    if (!token || !chatId) {
        toast('⚠️ Укажите Channel Bot Token и Channel ID перед проверкой', 'error');
        return;
    }

    channelStoreSet('pestovo_tg_channel_id', chatId);
    purgeChannelSecretsFromStorage();

    persistChannelSecrets('channels/telegram', {
        channelToken: token,
        channelId: chatId,
        updatedAt: Date.now()
    });

    sendTelegramDirectAlert(token, chatId, 'Канал', 'referee', 1, 'Администратор Клуба', []);
}
function loadVKSettings() {
    var tokInp  = document.getElementById('vk-access-token');
    var peerInp = document.getElementById('vk-peer-id');

    // Из кэша — только Peer ID (не секрет). Токен приходит только из БД.
    if (peerInp) peerInp.value = channelStoreGet('pestovo_vk_peer_id');
    if (tokInp)  tokInp.value  = '';

    if (typeof db !== 'undefined') {
        migrateLegacyChannelSecrets().then(function() {
            return db.ref('channels/vk').once('value');
        }).then(function(sn) {
            var vk = sn.val() || {};
            if (tokInp  && vk.token)  tokInp.value  = vk.token;
            if (peerInp && vk.peerId) {
                peerInp.value = vk.peerId;
                channelStoreSet('pestovo_vk_peer_id', vk.peerId);
            }
        }).catch(function(e) {
            console.warn('VK loadSettings Firebase error:', e);
        });
    }
}

function saveVKSettings() {
    var tokInp  = document.getElementById('vk-access-token');
    var peerInp = document.getElementById('vk-peer-id');
    var token   = tokInp  ? tokInp.value.trim()  : '';
    var peerId  = peerInp ? peerInp.value.trim() : '';

    // Валидация
    if (!token) {
        toast(currentLang === 'en'
            ? '⚠️ Enter VK Community Access Token'
            : '⚠️ Введите VK Access Token сообщества', 'error');
        return;
    }
    if (!peerId) {
        toast(currentLang === 'en'
            ? '⚠️ Enter VK Peer ID (chat/user ID)'
            : '⚠️ Введите VK Peer ID (беседы или пользователя)', 'error');
        return;
    }
    if (!/^-?\d+$/.test(peerId)) {
        toast(currentLang === 'en'
            ? '⚠️ Peer ID must be a number (e.g. 2000000001 or 123456789)'
            : '⚠️ Peer ID должен быть числом (например 2000000001 или 123456789)', 'error');
        return;
    }

    channelStoreSet('pestovo_vk_peer_id', peerId);
    purgeChannelSecretsFromStorage();

    if (typeof db !== 'undefined') {
        db.ref('channels/vk').set({
            token:     token,
            peerId:    peerId,
            updatedAt: Date.now()
        }).then(function() {
            return db.ref('settings/vk').remove().catch(function() {});
        }).then(function() {
            toast(currentLang === 'en'
                ? '✅ VK settings saved!'
                : '✅ Настройки ВКонтакте сохранены!', 'success');
        }).catch(function(e) {
            console.error('VK save Firebase error:', e);
            toast(currentLang === 'en'
                ? '⚠️ Not saved (Firebase error: ' + e.message + ')'
                : '⚠️ Не сохранено (ошибка Firebase: ' + e.message + ')', 'error');
        });
    } else {
        toast(currentLang === 'en'
            ? '⚠️ No database connection — token was not saved'
            : '⚠️ Нет подключения к базе — токен не сохранён', 'error');
    }
}

function testVKAlert() {
    var tokInp  = document.getElementById('vk-access-token');
    var peerInp = document.getElementById('vk-peer-id');
    var token   = tokInp  ? tokInp.value.trim()  : '';
    var peerId  = peerInp ? peerInp.value.trim() : '';

    if (!token || !peerId) {
        toast(currentLang === 'en'
            ? '⚠️ Enter VK Access Token and Peer ID first'
            : '⚠️ Укажите VK Access Token и Peer ID перед проверкой', 'error');
        return;
    }
    if (!/^-?\d+$/.test(peerId)) {
        toast(currentLang === 'en'
            ? '⚠️ Peer ID must be a number (e.g. 2000000001)'
            : '⚠️ Peer ID должен быть числом (например 2000000001)', 'error');
        return;
    }

    // Автосохранение перед тестом — секрет уходит в админскую ветку channels/
    channelStoreSet('pestovo_vk_peer_id', peerId);
    purgeChannelSecretsFromStorage();
    persistChannelSecrets('channels/vk', {
        token: token, peerId: peerId, updatedAt: Date.now()
    });

    toast(currentLang === 'en'
        ? '⏳ Sending test VK message...'
        : '⏳ Отправка тестового сообщения ВК...', 'info');

    sendVKDirectAlert(token, peerId, 'referee', 1,
        currentLang === 'en' ? 'Club Administrator' : 'Администратор Клуба', []);
}

// ==========================================
// ПРОВЕРКА СЕРВЕРНОЙ ДОСТАВКИ (то, чем реально уходит вызов во время раунда)
// ==========================================
// «Проверить Группу», «Проверить Канал» и «Проверить отправку в ВК» шлют
// сообщение ИЗ БРАУЗЕРА значением из поля: они подтверждают, что токен и
// chat_id верны, но не подтверждают доставку настоящего вызова. Боевой путь
// другой: игрок жмёт «Вызвать судью» → запись в alerts/<id> → Cloud Function
// onAlertCreated читает channels/ через Admin SDK и рассылает. Если функция не
// задеплоена, токен не сохранился в channels/ или VK отклонил запрос — тесты
// в админке всё равно зелёные, а на лунке тишина.
// Кнопка дёргает серверный callable testOfficialCallDelivery, который
// прогоняет тот же код доставки, и показывает отчёт по каждому каналу.
function serverDeliveryStatusLabel(label) {
    var isEn = currentLang === 'en';
    if (label === 'telegram:group') return isEn ? 'Telegram (referees group)' : 'Telegram (группа судей)';
    if (label === 'telegram:channel') return isEn ? 'Telegram (club channel)' : 'Telegram (канал клуба)';
    if (label === 'vk') return isEn ? 'VKontakte' : 'ВКонтакте';
    return label;
}

function renderServerDeliveryStatus(html, kind) {
    var el = document.getElementById('server-delivery-status');
    if (!el) return;
    el.className = 'srv-delivery-status' + (kind ? ' is-' + kind : '');
    el.innerHTML = html;
    el.classList.remove('hidden');
}

function testServerDelivery() {
    var isEn = currentLang === 'en';
    renderServerDeliveryStatus(isEn
        ? '⏳ Asking the server to deliver a test call…'
        : '⏳ Просим сервер доставить тестовый вызов…', 'pending');

    if (typeof pestovoFunctions !== 'function') {
        renderServerDeliveryStatus(isEn
            ? '❌ Cloud Functions SDK is not available on this page.'
            : '❌ На этой странице недоступен SDK Cloud Functions.', 'bad');
        return;
    }

    pestovoFunctions().then(function (fns) {
        return fns.httpsCallable('testOfficialCallDelivery')({ type: 'referee' });
    }).then(function (res) {
        var r = (res && res.data) || {};
        var lines = [];
        var order = ['telegram:group', 'telegram:channel', 'vk'];
        var sentCount = (r.sent || []).length;
        var failed = 0;

        if (r.enabled === false) {
            renderServerDeliveryStatus((isEn
                ? '❌ Club notifications are turned OFF for everyone (settings/notifications_enabled) — the server skips delivery of real calls too. Turn them on in the “Calls” tab.'
                : '❌ Уведомления клуба выключены для всех (settings/notifications_enabled) — сервер так же пропускает и настоящие вызовы. Включите их на вкладке «Вызовы».'), 'bad');
            return;
        }

        order.forEach(function (label) {
            var state = (r.results || {})[label];
            var configured = (r.configured || {})[label];
            if (state === 'sent') {
                lines.push('✅ ' + escapeHtml(serverDeliveryStatusLabel(label)) + ' — ' + (isEn ? 'delivered' : 'доставлено'));
            } else if (configured === false || state === 'not_configured') {
                lines.push('⚪ ' + escapeHtml(serverDeliveryStatusLabel(label)) + ' — ' +
                    (isEn ? 'not configured (token/chat id are empty in channels/)' : 'не настроен (в channels/ пусто)'));
            } else if (state) {
                failed++;
                lines.push('❌ ' + escapeHtml(serverDeliveryStatusLabel(label)) + ' — ' + escapeHtml(String(state).replace(/^error:\s*/, '')));
            }
        });
        if ((r.results || {}).error) {
            failed++;
            lines.push('❌ ' + escapeHtml(String(r.results.error).replace(/^error:\s*/, '')));
        }

        var head;
        var kind;
        if (r.reason === 'not_configured' || (!sentCount && !failed)) {
            head = isEn
                ? '⚠️ The server has no channels configured. Save the tokens with the “Save” buttons — the browser test sends on its own and does not prove anything.'
                : '⚠️ На сервере не настроен ни один канал. Сохраните токены кнопками «Сохранить»: проверка из браузера шлёт сама по себе и ничего не доказывает.';
            kind = 'warn';
        } else if (sentCount && !failed) {
            head = isEn
                ? '✅ Server delivery works: a call from the course will reach these channels.'
                : '✅ Серверная доставка работает: вызов с поля дойдёт до этих каналов.';
            kind = 'ok';
        } else {
            head = isEn
                ? '⚠️ The server responded, but not everything was delivered — real calls will behave the same way.'
                : '⚠️ Сервер ответил, но доставлено не всё — настоящие вызовы поведут себя так же.';
            kind = failed && !sentCount ? 'bad' : 'warn';
        }
        renderServerDeliveryStatus('<div style="font-weight:700;margin-bottom:6px;">' + head + '</div>' +
            (lines.length
                ? '<div style="display:flex;flex-direction:column;gap:3px;">' +
                  lines.map(function (line) { return '<span>' + line + '</span>'; }).join('') + '</div>'
                : '') +
            '<div style="margin-top:8px;font-size:11px;opacity:0.75;">' + (isEn
                ? 'Path: player → alerts/&lt;id&gt; → Cloud Function onAlertCreated → Telegram/VK. Delivery status of each real call is shown in the “Calls” tab.'
                : 'Путь: игрок → alerts/&lt;id&gt; → Cloud Function onAlertCreated → Telegram/VK. Статус доставки каждого настоящего вызова виден на вкладке «Вызовы».') + '</div>',
            kind);
    }).catch(function (err) {
        var code = String((err && err.code) || '');
        var msg = String((err && err.message) || '');
        var text;
        if (/unimplemented|not[-_ ]?found|NOT_FOUND|Requested entity/i.test(code + ' ' + msg)) {
            text = isEn
                ? '❌ Cloud Function testOfficialCallDelivery is not deployed (or is outdated). Run: cd functions && npm i && firebase deploy --only functions. Until then calls from the course are NOT sent to Telegram/VK — only the browser test works.'
                : '❌ Cloud Function testOfficialCallDelivery не задеплоена (или устарела). Выполните: cd functions && npm i && firebase deploy --only functions. Пока этого нет, вызовы с поля в Telegram/VK НЕ уходят — работает только проверка из браузера.';
        } else if (/permission-denied|unauthenticated/i.test(code + ' ' + msg)) {
            text = isEn
                ? '❌ Administrator rights are required (users/<uid>: admin: true or role: "admin").'
                : '❌ Нужны права администратора (users/<uid>: admin: true или role: "admin").';
        } else if (/resource-exhausted/i.test(code + ' ' + msg)) {
            text = isEn ? '⚠️ Too often — wait a few seconds and try again.' : '⚠️ Слишком часто — подождите несколько секунд и повторите.';
        } else if (/unavailable|network|Failed to fetch|CORS/i.test(code + ' ' + msg)) {
            text = (isEn
                ? '❌ The function is unreachable (network/region): '
                : '❌ Функция недоступна (сеть/регион): ') + msg;
        } else {
            text = '❌ ' + (msg || code || (isEn ? 'unknown error' : 'неизвестная ошибка'));
        }
        renderServerDeliveryStatus(escapeHtml(text), 'bad');
    });
}
