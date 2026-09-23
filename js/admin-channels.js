// js/admin-channels.js — Telegram/VK интеграции админки (бот-токены, чаты,
// тестовые алерты); вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3).
// Настройки хранятся в settings/telegram* и settings/vk*; отправка алертов
// идёт со стороны Cloud Functions / напрямую из API. Внешних зависимостей
// от admin.js нет: только runtime-глобалы (db, toast, currentLang).
// Функции sendTelegramOfficialAlert/sendVKOfficialAlert вызываются guarded
// (typeof) из live/marker/scorer/solo — грузится рядом с admin.js.

// ==========================================
// TELEGRAM BOT SETTINGS & ALERTS (GROUP & CHANNEL)
// ==========================================
function loadTelegramSettings() {
    var gTokInp = document.getElementById('tg-group-bot-token');
    var gChatInp = document.getElementById('tg-group-chat-id');
    var cTokInp = document.getElementById('tg-channel-bot-token');
    var cChatInp = document.getElementById('tg-channel-id');

    if (gTokInp) gTokInp.value = localStorage.getItem('pestovo_tg_group_token') || localStorage.getItem('pestovo_tg_bot_token') || '';
    if (gChatInp) gChatInp.value = localStorage.getItem('pestovo_tg_group_id') || localStorage.getItem('pestovo_tg_chat_id') || '';
    if (cTokInp) cTokInp.value = localStorage.getItem('pestovo_tg_channel_token') || localStorage.getItem('pestovo_tg_bot_token') || '';
    if (cChatInp) cChatInp.value = localStorage.getItem('pestovo_tg_channel_id') || '';

    if (typeof db !== 'undefined') {
        db.ref('settings/telegram').once('value').then(function(sn) {
            var tg = sn.val() || {};
            if (gTokInp && (tg.groupToken || tg.botToken)) gTokInp.value = tg.groupToken || tg.botToken;
            if (gChatInp && (tg.groupId || tg.chatId)) gChatInp.value = tg.groupId || tg.chatId;
            if (cTokInp && (tg.channelToken || tg.botToken)) cTokInp.value = tg.channelToken || tg.botToken;
            if (cChatInp && tg.channelId) cChatInp.value = tg.channelId;
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

    if (gToken) {
        localStorage.setItem('pestovo_tg_group_token', gToken);
        localStorage.setItem('pestovo_tg_bot_token', gToken);
    }
    if (gId) {
        localStorage.setItem('pestovo_tg_group_id', gId);
        localStorage.setItem('pestovo_tg_chat_id', gId);
    }
    if (cToken) localStorage.setItem('pestovo_tg_channel_token', cToken);
    if (cId) localStorage.setItem('pestovo_tg_channel_id', cId);

    if (typeof db !== 'undefined') {
        db.ref('settings/telegram').update({
            groupToken: gToken,
            groupId: gId,
            channelToken: cToken,
            channelId: cId,
            botToken: gToken || cToken,
            chatId: gId,
            updatedAt: Date.now()
        }).then(function() {
            toast(currentLang === 'en' ? '✅ Telegram settings saved!' : '✅ Настройки Telegram сохранены!', 'success');
        });
    } else {
        toast(currentLang === 'en' ? '✅ Telegram settings saved locally!' : '✅ Настройки Telegram сохранены локально!', 'success');
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

    localStorage.setItem('pestovo_tg_group_token', token);
    localStorage.setItem('pestovo_tg_group_id', chatId);

    if (typeof db !== 'undefined') {
        db.ref('settings/telegram').update({
            groupToken: token,
            groupId: chatId,
            botToken: token,
            chatId: chatId,
            updatedAt: Date.now()
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

    localStorage.setItem('pestovo_tg_channel_token', token);
    localStorage.setItem('pestovo_tg_channel_id', chatId);

    if (typeof db !== 'undefined') {
        db.ref('settings/telegram').update({
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

    // Сначала подгружаем из localStorage
    if (tokInp)  tokInp.value  = localStorage.getItem('pestovo_vk_token')    || '';
    if (peerInp) peerInp.value = localStorage.getItem('pestovo_vk_peer_id')  || '';

    // Затем из Firebase (приоритет выше)
    if (typeof db !== 'undefined') {
        db.ref('settings/vk').once('value').then(function(sn) {
            var vk = sn.val() || {};
            if (tokInp  && vk.token)  tokInp.value  = vk.token;
            if (peerInp && vk.peerId) peerInp.value = vk.peerId;
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

    localStorage.setItem('pestovo_vk_token',   token);
    localStorage.setItem('pestovo_vk_peer_id', peerId);

    if (typeof db !== 'undefined') {
        db.ref('settings/vk').set({
            token:     token,
            peerId:    peerId,
            updatedAt: Date.now()
        }).then(function() {
            toast(currentLang === 'en'
                ? '✅ VK settings saved!'
                : '✅ Настройки ВКонтакте сохранены!', 'success');
        }).catch(function(e) {
            console.error('VK save Firebase error:', e);
            toast(currentLang === 'en'
                ? '⚠️ Saved locally (Firebase error: ' + e.message + ')'
                : '⚠️ Сохранено локально (ошибка Firebase: ' + e.message + ')', 'error');
        });
    } else {
        toast(currentLang === 'en'
            ? '✅ VK settings saved locally!'
            : '✅ Настройки ВКонтакте сохранены локально!', 'success');
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

    // Автосохранение перед тестом
    localStorage.setItem('pestovo_vk_token',   token);
    localStorage.setItem('pestovo_vk_peer_id', peerId);
    if (typeof db !== 'undefined') {
        db.ref('settings/vk').set({
            token: token, peerId: peerId, updatedAt: Date.now()
        }).catch(function(){});
    }

    toast(currentLang === 'en'
        ? '⏳ Sending test VK message...'
        : '⏳ Отправка тестового сообщения ВК...', 'info');

    sendVKDirectAlert(token, peerId, 'referee', 1,
        currentLang === 'en' ? 'Club Administrator' : 'Администратор Клуба', []);
}
