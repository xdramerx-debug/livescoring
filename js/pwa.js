function isIOS() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
    return (window.navigator && window.navigator.standalone === true) || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

if('serviceWorker' in navigator){
    window.addEventListener('load',function(){
        navigator.serviceWorker.register('sw.js').then(function(reg){
            console.log('[PWA] SW registered');
            initBackgroundAlertListener();
            checkPWAInstallPrompt();
            // Периодически проверяем наличие новой версии (для долго открытых вкладок)
            setInterval(function(){ reg.update().catch(function(){}); }, 30*60*1000);
        }).catch(function(err){console.error('[PWA] SW failed',err);});
    });
    navigator.serviceWorker.addEventListener('message',function(event){
        if(event.data&&event.data.type==='SYNC_SCORES')syncOfflineScores();
    });

    // Баннер «Доступна новая версия»: sw.js активирует новую версию сразу
    // (skipWaiting + clients.claim), но загруженная страница продолжает работать
    // на старых ассетах до перезагрузки — предлагаем её явно.
    var pwaHadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function() {
        if (pwaRefreshing) return;
        if (!pwaHadController) { pwaHadController = true; return; } // первая установка SW — не новая версия
        showUpdateBanner();
    });
} else {
    window.addEventListener('load', function() {
        checkPWAInstallPrompt();
    });
}

var pwaRefreshing = false;
function showUpdateBanner() {
    if (document.getElementById('update-banner')) return;
    var b = document.createElement('div');
    b.id = 'update-banner';
    b.className = 'update-banner';
    b.setAttribute('role', 'status');
    var txt = currentLang === 'en' ? '<b>New version available.</b> Reload the page to update.' : '<b>Доступна новая версия.</b> Перезагрузите страницу, чтобы обновиться.';
    var btnTxt = currentLang === 'en' ? 'Reload' : 'Обновить';
    b.innerHTML = '<div class="ub-text">' + txt + '</div><button class="btn btn-g btn-sm" onclick="applyPWAUpdate()"><i class="fas fa-rotate-right"></i> ' + btnTxt + '</button>';
    if (document.body) document.body.appendChild(b);
    setTimeout(function(){ b.classList.add('show'); }, 50);
}
function applyPWAUpdate() {
    pwaRefreshing = true;
    window.location.reload();
}
window.applyPWAUpdate = applyPWAUpdate;

var isOnline=navigator.onLine;

function updateOnlineStatus(){
    var wasOnline=isOnline;isOnline=navigator.onLine;
    var indicator=document.getElementById('online-indicator');
    if(!indicator){indicator=document.createElement('div');indicator.id='online-indicator';indicator.className='online-indicator';document.body.appendChild(indicator);}
    if(isOnline){
        indicator.className='online-indicator online';
        indicator.innerHTML='<i class="fas fa-wifi"></i> ' + (currentLang === 'en' ? 'Online' : 'Онлайн');
        if(!wasOnline){if(typeof toast==='function')toast(currentLang === 'en' ? '🌐 Connection restored' : '🌐 Соединение восстановлено','success');syncOfflineScores();}
        setTimeout(function(){if(indicator)indicator.classList.add('hide');},3000);
    }else{
        indicator.className='online-indicator offline';
        indicator.innerHTML='<i class="fas fa-wifi-slash"></i> ' + (currentLang === 'en' ? 'Offline' : 'Оффлайн');
        if(wasOnline)if(typeof toast==='function')toast(currentLang === 'en' ? '📡 Connection lost' : '📡 Нет соединения','warn');
    }
}

window.addEventListener('online',updateOnlineStatus);
window.addEventListener('offline',updateOnlineStatus);
window.addEventListener('load',function(){if(!navigator.onLine)updateOnlineStatus();});

var OFFLINE_KEY='pestovo_offline_scores';
var offlineSyncInProgress = false;

function readOfflineScores() {
    try {
        var value = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
        return Array.isArray(value) ? value : [];
    } catch (error) {
        console.warn('[PWA] Invalid offline queue was reset', error);
        try { localStorage.removeItem(OFFLINE_KEY); } catch (e) {}
        return [];
    }
}

function saveOfflineScore(roundId,playerId,hole,score){
    var pending=readOfflineScores();
    var itemKey=String(roundId)+'|'+String(playerId)+'|'+String(hole);
    // Для одной лунки нужен только самый свежий несинхронизированный результат.
    pending=pending.filter(function(item){
        return String(item.roundId)+'|'+String(item.playerId)+'|'+String(item.hole)!==itemKey;
    });
    pending.push({roundId:roundId,playerId:playerId,hole:hole,score:score,timestamp:Date.now(),type:'score'});
    try { localStorage.setItem(OFFLINE_KEY,JSON.stringify(pending)); } catch (error) {
        console.error('[PWA] Cannot save offline score', error);
        if(typeof toast==='function')toast(currentLang === 'en' ? 'Cannot save score offline' : 'Не удалось сохранить счёт офлайн','error');
    }
    updateOfflineQueueBadge();
}

// Универсальная офлайн-запись по произвольному пути БД (verified, markers, holeTimes и т.п.).
// Для одного пути храним только последнее значение.
function queueOfflineWrite(path,value){
    if(!path)return;
    var pending=readOfflineScores();
    pending=pending.filter(function(item){
        return !(item.type==='set'&&item.path===path);
    });
    pending.push({type:'set',path:path,value:value,timestamp:Date.now()});
    try { localStorage.setItem(OFFLINE_KEY,JSON.stringify(pending)); } catch (error) {
        console.error('[PWA] Cannot queue offline write', error);
        if(typeof toast==='function')toast(currentLang === 'en' ? 'Cannot save data offline' : 'Не удалось сохранить данные офлайн','error');
    }
    updateOfflineQueueBadge();
}

function syncOfflineScores(){
    if(!navigator.onLine||typeof db==='undefined'||offlineSyncInProgress)return;
    var pending=readOfflineScores();
    if(pending.length===0){
        updateOfflineQueueBadge();
        return;
    }
    offlineSyncInProgress=true;
    var sentIds=pending.map(function(item){
        return item.type==='set'
            ? 'set|'+item.path+'|'+item.timestamp
            : [item.roundId,item.playerId,item.hole,item.timestamp].join('|');
    });
    var promises=pending.map(function(item){
        if(item.type==='score')return db.ref('rounds/'+item.roundId+'/players/'+item.playerId+'/scores/'+item.hole).set(item.score);
        if(item.type==='set'&&item.path)return db.ref(item.path).set(item.value);
        return Promise.resolve();
    });
    Promise.all(promises).then(function(){
        // Не удаляем записи, добавленные во время синхронизации.
        var remaining=readOfflineScores().filter(function(item){
            var key=item.type==='set'
                ? 'set|'+item.path+'|'+item.timestamp
                : [item.roundId,item.playerId,item.hole,item.timestamp].join('|');
            return sentIds.indexOf(key)===-1;
        });
        if(remaining.length) localStorage.setItem(OFFLINE_KEY,JSON.stringify(remaining));
        else localStorage.removeItem(OFFLINE_KEY);
        if(typeof toast==='function')toast((currentLang === 'en' ? '✅ Synced ' : '✅ Синхронизировано ') + pending.length + (currentLang === 'en' ? ' records' : ' записей'),'success');
    }).catch(function(error){
        console.error('[PWA] Offline sync failed',error);
        if(typeof toast==='function')toast(currentLang === 'en' ? 'Sync failed; scores remain on device' : 'Синхронизация не удалась; счёт сохранён на устройстве','warn');
    }).then(function(){
        offlineSyncInProgress=false;
        updateOfflineQueueBadge();
    });
}

function updateOfflineQueueBadge() {
    var pending = readOfflineScores();
    var badgeEl = document.getElementById('offline-queue-badge');

    if (!pending.length) {
        if (badgeEl) badgeEl.classList.add('hide');
        return;
    }

    if (!badgeEl) {
        badgeEl = document.createElement('div');
        badgeEl.id = 'offline-queue-badge';
        badgeEl.className = 'offline-queue-badge';
        if (document.body) document.body.appendChild(badgeEl);
    }

    var badgeText = currentLang === 'en'
        ? pending.length + ' pending scores waiting for sync'
        : pending.length + ' записей ожидают отправки';

    badgeEl.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> ⏳ ' + badgeText;
    badgeEl.classList.remove('hide');
}

window.addEventListener('load', function() { updateOfflineQueueBadge(); });

var deferredPrompt;
window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    deferredPrompt=e;
    if (!isIOS()) {
        setTimeout(function(){if(deferredPrompt)showInstallBanner();},3000);
    }
});

function checkPWAInstallPrompt() {
    if (localStorage.getItem('pwa_install_dismissed')) return;
    if (isStandalone()) return;

    if (isIOS()) {
        setTimeout(showIOSInstallBanner, 2000);
    }
}

function showInstallBanner(){
    if(localStorage.getItem('pwa_install_dismissed'))return;
    var banner=document.createElement('div');
    banner.id='install-banner';banner.className='install-banner';
    var titleStr = currentLang === 'en' ? '📱 Install Web App' : '📱 Установить приложение';
    var subStr = currentLang === 'en' ? 'Works offline' : 'Работает оффлайн';
    var laterStr = currentLang === 'en' ? 'Later' : 'Позже';
    var installStr = currentLang === 'en' ? 'Install' : 'Установить';

    banner.innerHTML='<div class="install-content"><div><strong>' + titleStr + '</strong><div style="font-size:12px;color:var(--muted);margin-top:2px;">' + subStr + '</div></div><div style="display:flex;gap:8px;"><button class="btn btn-og btn-sm" onclick="dismissInstall()">' + laterStr + '</button><button class="btn btn-g btn-sm" onclick="installPWA()">' + installStr + '</button></div></div>';
    document.body.appendChild(banner);
    setTimeout(function(){banner.classList.add('show');},100);
}

function showIOSInstallBanner() {
    if (localStorage.getItem('pwa_install_dismissed')) return;
    if (document.getElementById('ios-install-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'ios-install-banner';
    banner.className = 'ios-install-banner';

    var headerStr = currentLang === 'en' ? '📱 Add to Home Screen (iPhone)' : '📱 Установить на экран «Домой» (iPhone)';
    var subStr = currentLang === 'en' ? 'Required for Push notifications on iOS' : 'Необходимо для работы Push-уведомлений на iOS';
    var step1Str = currentLang === 'en' ? 'Tap <strong>"Share"</strong> button <i class="fas fa-arrow-up-from-bracket" style="color:var(--gold);"></i> in Safari' : 'Нажмите кнопку <strong>«Поделиться»</strong> <i class="fas fa-arrow-up-from-bracket" style="color:var(--gold);"></i> в Safari';
    var step2Str = currentLang === 'en' ? 'Select <strong>"Add to Home Screen"</strong> <i class="far fa-plus-square" style="color:var(--gold);"></i>' : 'Выберите <strong>«На экран "Домой"»</strong> <i class="far fa-plus-square" style="color:var(--gold);"></i>';
    var step3Str = currentLang === 'en' ? 'Tap <strong>"Add"</strong> and launch icon from Home Screen' : 'Нажмите <strong>«Добавить»</strong> и запустите иконку с экрана';

    banner.innerHTML =
        '<div class="ios-install-header">' +
        '<img src="img/logo.png" alt="Pestovo" class="ios-install-logo">' +
        '<div><strong>' + headerStr + '</strong><div style="font-size:12px;color:var(--muted);margin-top:2px;">' + subStr + '</div></div>' +
        '<button class="ios-install-close" onclick="dismissIOSInstall()">&times;</button>' +
        '</div>' +
        '<div class="ios-install-steps">' +
        '<div class="ios-step"><span class="ios-num">1</span> ' + step1Str + '</div>' +
        '<div class="ios-step"><span class="ios-num">2</span> ' + step2Str + '</div>' +
        '<div class="ios-step"><span class="ios-num">3</span> ' + step3Str + '</div>' +
        '</div>';

    document.body.appendChild(banner);
    setTimeout(function() { banner.classList.add('show'); }, 100);
}

function installPWA(){if(!deferredPrompt)return;deferredPrompt.prompt();deferredPrompt.userChoice.then(function(){deferredPrompt=null;var b=document.getElementById('install-banner');if(b)b.remove();});}
function dismissInstall(){localStorage.setItem('pwa_install_dismissed','1');var b=document.getElementById('install-banner');if(b)b.remove();}
function dismissIOSInstall(){localStorage.setItem('pwa_install_dismissed','1');var b=document.getElementById('ios-install-banner');if(b)b.remove();}
window.installPWA=installPWA;window.dismissInstall=dismissInstall;window.dismissIOSInstall=dismissIOSInstall;
setInterval(function(){if(navigator.onLine)syncOfflineScores();},60000);

// ==========================================
// ПУШ-УВЕДОМЛЕНИЯ ВЫЗОВОВ (СУДЬЯ / МАРШАЛ)
// ==========================================
function requestNotificationPermission(callback) {
    if (!('Notification' in window)) {
        if (typeof toast === 'function') toast(currentLang === 'en' ? 'Notifications supported when added to Home Screen' : 'Уведомления поддерживаются при добавлении приложения на экран «Домой»', 'warn');
        if (typeof callback === 'function') callback(false);
        return;
    }
    Notification.requestPermission().then(function(perm) {
        if (perm === 'granted') {
            if (typeof toast === 'function') toast(currentLang === 'en' ? '🔔 Call push notifications enabled!' : '🔔 Пуш-уведомления вызовов включены!', 'success');
            initBackgroundAlertListener();
            if (typeof callback === 'function') callback(true);
        } else {
            if (typeof toast === 'function') toast(currentLang === 'en' ? 'Notifications declined by browser' : 'Уведомления отклонены браузером', 'warn');
            if (typeof callback === 'function') callback(false);
        }
    });
}

function showPushNotification(title, body, targetUrl) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    var options = {
        body: body || '',
        icon: 'img/logo.png',
        badge: 'img/logo.png',
        vibrate: [200, 100, 200],
        data: { url: targetUrl || 'admin.html' }
    };

    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(function(reg) {
            reg.showNotification(title, options);
        }).catch(function() {
            try { new Notification(title, options); } catch(e) {}
        });
    } else {
        try { new Notification(title, options); } catch(e) {}
    }
}

var globalAlertsKnown = {};
var bgAlertsListenerAttached = false;

function initBackgroundAlertListener() {
    if (!('Notification' in window) || Notification.permission !== 'granted' || typeof db === 'undefined' || bgAlertsListenerAttached) return;
    bgAlertsListenerAttached = true;

    db.ref('alerts').orderByChild('status').equalTo('active').on('value', function(sn) {
        var alerts = sn.val() || {};
        var isFirstRun = Object.keys(globalAlertsKnown).length === 0;

        Object.entries(alerts).forEach(function(e) {
            var id = e[0], a = e[1];
            if (!globalAlertsKnown[id]) {
                globalAlertsKnown[id] = true;
                if (!isFirstRun) {
                    var title = a.type === 'referee' ? (currentLang === 'en' ? '🚨 REFEREE CALL!' : '🚨 ВЫЗОВ СУДЬИ!') : (currentLang === 'en' ? '🚨 MARSHAL CALL!' : '🚨 ВЫЗОВ МАРШАЛА!');
                    var body = (currentLang === 'en' ? 'Hole #' : 'Лунка №') + a.hole + ' | ' + (currentLang === 'en' ? 'Player: ' : 'Игрок: ') + (a.playerName || 'Player') + (typeof fmtTime === 'function' ? ' (' + fmtTime(a.time) + ')' : '');
                    showPushNotification(title, body, 'admin.html');
                }
            }
        });
    });
}

var globalBroadcastsKnown = {};
var bgBroadcastListenerAttached = false;

function initBackgroundBroadcastListener() {
    if (typeof db === 'undefined' || bgBroadcastListenerAttached) return;
    bgBroadcastListenerAttached = true;

    db.ref('broadcasts').on('value', function(sn) {
        var broadcasts = sn.val() || {};
        var isFirstRun = Object.keys(globalBroadcastsKnown).length === 0;

        Object.entries(broadcasts).forEach(function(e) {
            var id = e[0], b = e[1];
            if (!globalBroadcastsKnown[id]) {
                globalBroadcastsKnown[id] = true;
                if (!isFirstRun) {
                    var title = b.title || (currentLang === 'en' ? '📢 Pestovo Announcement' : '📢 Анонс Пестово');
                    var body = b.body || '';
                    var targetUrl = b.link || 'tournaments.html';

                    if (typeof showPushNotification === 'function') {
                        showPushNotification(title, body, targetUrl);
                    }
                    if (typeof toast === 'function') {
                        toast('📢 <b>' + title + '</b><br>' + body, 'info');
                    }
                    if (typeof vib === 'function') vib([150, 50, 150]);
                }
            }
        });
    });
}

window.addEventListener('load', function() {
    initBackgroundBroadcastListener();
});
