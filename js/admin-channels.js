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

    if (typeof db !== 'undefined') {
        db.ref('channels/telegram').update({
            groupToken: gToken,
            groupId: gId,
            channelToken: cToken,
            channelId: cId,
            botToken: gToken || cToken,
            chatId: gId,
            updatedAt: Date.now()
        }).then(function() {
            // Старая публичная копия не должна оставаться в базе.
            return db.ref('settings/telegram').remove().catch(function() {});
        }).then(function() {
            toast(currentLang === 'en' ? '✅ Telegram settings saved!' : '✅ Настройки Telegram сохранены!', 'success');
        }).catch(function(err) {
            toast('⚠️ ' + (currentLang === 'en' ? 'Not saved: ' : 'Не сохранено: ') + (err && err.message || err), 'error');
        });
    } else {
        toast(currentLang === 'en'
            ? '⚠️ No database connection — token was not saved'
            : '⚠️ Нет подключения к базе — токен не сохранён', 'error');
    }
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

    if (typeof db !== 'undefined') {
        db.ref('channels/telegram').update({
            groupToken: token,
            groupId: chatId,
            botToken: token,
            chatId: chatId,
            updatedAt: Date.now()
        }).then(function() {
            return db.ref('settings/telegram').remove().catch(function() {});
        }).catch(function(){});
    }

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

    if (typeof db !== 'undefined') {
        db.ref('channels/telegram').update({
            channelToken: token,
            channelId: chatId,
            updatedAt: Date.now()
        }).catch(function(){});
    }

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
    if (typeof db !== 'undefined') {
        db.ref('channels/vk').set({
            token: token, peerId: peerId, updatedAt: Date.now()
        }).then(function() {
            return db.ref('settings/vk').remove().catch(function() {});
        }).catch(function(){});
    }

    toast(currentLang === 'en'
        ? '⏳ Sending test VK message...'
        : '⏳ Отправка тестового сообщения ВК...', 'info');

    sendVKDirectAlert(token, peerId, 'referee', 1,
        currentLang === 'en' ? 'Club Administrator' : 'Администратор Клуба', []);
}
