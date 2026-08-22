if('serviceWorker' in navigator){
    window.addEventListener('load',function(){
        navigator.serviceWorker.register('sw.js').then(function(reg){console.log('[PWA] SW registered');}).catch(function(err){console.error('[PWA] SW failed',err);});
    });
    navigator.serviceWorker.addEventListener('message',function(event){
        if(event.data&&event.data.type==='SYNC_SCORES')syncOfflineScores();
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
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredPrompt=e;setTimeout(function(){if(deferredPrompt)showInstallBanner();},3000);});

function showInstallBanner(){
    if(localStorage.getItem('pwa_install_dismissed'))return;
    var banner=document.createElement('div');
    banner.id='install-banner';banner.className='install-banner';
    banner.innerHTML='<div class="install-content"><div><strong>📱 Установить приложение</strong><div style="font-size:12px;color:var(--muted);margin-top:2px;">Работает оффлайн</div></div><div style="display:flex;gap:8px;"><button class="btn btn-og btn-sm" onclick="dismissInstall()">Позже</button><button class="btn btn-g btn-sm" onclick="installPWA()">Установить</button></div></div>';
    document.body.appendChild(banner);
    setTimeout(function(){banner.classList.add('show');},100);
}

function installPWA(){if(!deferredPrompt)return;deferredPrompt.prompt();deferredPrompt.userChoice.then(function(){deferredPrompt=null;var b=document.getElementById('install-banner');if(b)b.remove();});}
function dismissInstall(){localStorage.setItem('pwa_install_dismissed','1');var b=document.getElementById('install-banner');if(b)b.remove();}
window.installPWA=installPWA;window.dismissInstall=dismissInstall;
setInterval(function(){if(navigator.onLine)syncOfflineScores();},60000);