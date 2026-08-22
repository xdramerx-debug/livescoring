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
        }).catch(function(err){console.error('[PWA] SW failed',err);});
    });
    navigator.serviceWorker.addEventListener('message',function(event){
        if(event.data&&event.data.type==='SYNC_SCORES')syncOfflineScores();
    });
} else {
    window.addEventListener('load', function() {
        checkPWAInstallPrompt();
    });
}

var isOnline=navigator.onLine;

function updateOnlineStatus(){
    var wasOnline=isOnline;isOnline=navigator.onLine;
    var indicator=document.getElementById('online-indicator');
    if(!indicator){indicator=document.createElement('div');indicator.id='online-indicator';indicator.className='online-indicator';document.body.appendChild(indicator);}
    if(isOnline){
        indicator.className='online-indicator online';
        indicator.innerHTML='<i class="fas fa-wifi"></i> Онлайн';
        if(!wasOnline){if(typeof toast==='function')toast('🌐 Соединение восстановлено','success');syncOfflineScores();}
        setTimeout(function(){if(indicator)indicator.classList.add('hide');},3000);
    }else{
        indicator.className='online-indicator offline';
        indicator.innerHTML='<i class="fas fa-wifi-slash"></i> Оффлайн';
        if(wasOnline)if(typeof toast==='function')toast('📡 Нет соединения','warn');
    }
}

window.addEventListener('online',updateOnlineStatus);
window.addEventListener('offline',updateOnlineStatus);
window.addEventListener('load',function(){if(!navigator.onLine)updateOnlineStatus();});

var OFFLINE_KEY='pestovo_offline_scores';

function saveOfflineScore(roundId,playerId,hole,score){
    var pending=JSON.parse(localStorage.getItem(OFFLINE_KEY)||'[]');
    pending.push({roundId:roundId,playerId:playerId,hole:hole,score:score,timestamp:Date.now(),type:'score'});
    localStorage.setItem(OFFLINE_KEY,JSON.stringify(pending));
}

function syncOfflineScores(){
    if(!navigator.onLine||typeof db==='undefined')return;
    var pending=JSON.parse(localStorage.getItem(OFFLINE_KEY)||'[]');
    if(pending.length===0)return;
    var promises=pending.map(function(item){
        if(item.type==='score')return db.ref('rounds/'+item.roundId+'/players/'+item.playerId+'/scores/'+item.hole).set(item.score);
        return Promise.resolve();
    });
    Promise.all(promises).then(function(){
        localStorage.removeItem(OFFLINE_KEY);
        if(typeof toast==='function')toast('✅ Синхронизировано '+pending.length+' записей','success');
    });
}

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
    banner.innerHTML='<div class="install-content"><div><strong>📱 Установить приложение</strong><div style="font-size:12px;color:var(--muted);margin-top:2px;">Работает оффлайн</div></div><div style="display:flex;gap:8px;"><button class="btn btn-og btn-sm" onclick="dismissInstall()">Позже</button><button class="btn btn-g btn-sm" onclick="installPWA()">Установить</button></div></div>';
    document.body.appendChild(banner);
    setTimeout(function(){banner.classList.add('show');},100);
}

function showIOSInstallBanner() {
    if (localStorage.getItem('pwa_install_dismissed')) return;
    if (document.getElementById('ios-install-banner')) return;

    var banner = document.createElement('div');
    banner.id = 'ios-install-banner';
    banner.className = 'ios-install-banner';
    banner.innerHTML =
        '<div class="ios-install-header">' +
        '<img src="img/logo.png" alt="Пестово" class="ios-install-logo">' +
        '<div><strong>📱 Установить на экран «Домой» (iPhone)</strong><div style="font-size:12px;color:var(--muted);margin-top:2px;">Необходимо для работы Push-уведомлений на iOS</div></div>' +
        '<button class="ios-install-close" onclick="dismissIOSInstall()">&times;</button>' +
        '</div>' +
        '<div class="ios-install-steps">' +
        '<div class="ios-step"><span class="ios-num">1</span> Нажмите кнопку <strong>«Поделиться»</strong> <i class="fas fa-arrow-up-from-bracket" style="color:var(--gold);"></i> в Safari</div>' +
        '<div class="ios-step"><span class="ios-num">2</span> Выберите <strong>«На экран "Домой"»</strong> <i class="far fa-plus-square" style="color:var(--gold);"></i></div>' +
        '<div class="ios-step"><span class="ios-num">3</span> Нажмите <strong>«Добавить»</strong> и запустите иконку с экрана</div>' +
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
        if (typeof toast === 'function') toast('Уведомления поддерживаются при добавлении приложения на экран «Домой»', 'warn');
        if (typeof callback === 'function') callback(false);
        return;
    }
    Notification.requestPermission().then(function(perm) {
        if (perm === 'granted') {
            if (typeof toast === 'function') toast('🔔 Пуш-уведомления вызовов включены!', 'success');
            initBackgroundAlertListener();
            if (typeof callback === 'function') callback(true);
        } else {
            if (typeof toast === 'function') toast('Уведомления отклонены браузером', 'warn');
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
                    var title = a.type === 'referee' ? '🚨 ВЫЗОВ СУДЬИ!' : '🚨 ВЫЗОВ МАРШАЛА!';
                    var body = 'Лунка №' + a.hole + ' | Игрок: ' + (a.playerName || 'Игрок') + (typeof fmtTime === 'function' ? ' (' + fmtTime(a.time) + ')' : '');
                    showPushNotification(title, body, 'admin.html');
                }
            }
        });
    });
}
