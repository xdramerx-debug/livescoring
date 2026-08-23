const CLUB = 'Гольф-клуб Пестово';
const TOTAL_PAR = 72;
const ADDR = 'МО, г. Мытищи, Никольская ул., 1, Румянцево';

const HOLES = {
    1:{p:4,hcp:5,bk:373,bl:339,wh:328,rd:317},
    2:{p:4,hcp:13,bk:272,bl:257,wh:257,rd:250},
    3:{p:5,hcp:9,bk:486,bl:475,wh:464,rd:423},
    4:{p:3,hcp:11,bk:192,bl:174,wh:161,rd:144},
    5:{p:4,hcp:1,bk:411,bl:382,wh:370,rd:331},
    6:{p:4,hcp:15,bk:377,bl:345,wh:333,rd:316},
    7:{p:4,hcp:3,bk:406,bl:380,wh:336,rd:308},
    8:{p:3,hcp:7,bk:181,bl:165,wh:159,rd:132},
    9:{p:5,hcp:17,bk:507,bl:459,wh:421,rd:399},
    10:{p:5,hcp:12,bk:491,bl:470,wh:461,rd:442},
    11:{p:4,hcp:16,bk:382,bl:362,wh:345,rd:318},
    12:{p:4,hcp:2,bk:383,bl:375,wh:365,rd:322},
    13:{p:3,hcp:18,bk:185,bl:162,wh:138,rd:123},
    14:{p:4,hcp:4,bk:374,bl:362,wh:327,rd:323},
    15:{p:5,hcp:8,bk:533,bl:517,wh:483,rd:454},
    16:{p:4,hcp:14,bk:423,bl:391,wh:368,rd:312},
    17:{p:3,hcp:10,bk:199,bl:188,wh:174,rd:151},
    18:{p:4,hcp:6,bk:375,bl:349,wh:335,rd:302}
};

const TIMINGS = {1:15,2:15,3:20,4:12,5:15,6:15,7:15,8:12,9:20,10:20,11:15,12:15,13:12,14:15,15:20,16:15,17:12,18:15};
const TEES = {bk:'Чёрный',bl:'Синий',wh:'Белый',rd:'Красный'};
const COURSE_RATINGS = {
    men:{bk:{cr:76.0,sr:144},bl:{cr:73.8,sr:137},wh:{cr:72.0,sr:135},rd:{cr:69.2,sr:134}},
    women:{bl:{cr:80.8,sr:153},wh:{cr:78.6,sr:143},rd:{cr:75.2,sr:136}}
};

function holePar(h){return HOLES[h]?HOLES[h].p:4;}
function holeDist(h,t){t=t||'wh';return HOLES[h]?(HOLES[h][t]||0):0;}
function holeHcp(h){return HOLES[h]?HOLES[h].hcp:h;}
function holeTiming(h){return TIMINGS[h]||15;}
function fmtScore(s){if(s===null||s===undefined||isNaN(s))return'—';if(s===0)return'E';return s>0?'+'+s:''+s;}
function scoreClass(s){if(s===null||s===undefined)return'';return s<0?'s-un':s>0?'s-ov':'s-ev';}
function holeResClass(s,p){if(!s||s<1||!p)return'';var d=s-p;if(d<=-2)return'r-eag';if(d===-1)return'r-bir';if(d===0)return'r-par';if(d===1)return'r-bog';return'r-dbl';}
function holeResName(s,p){if(!s||!p)return'';if(s===1)return'Hole-in-One!';var d=s-p;if(d<=-3)return'Альбатрос';if(d===-2)return'Eagle';if(d===-1)return'Birdie';if(d===0)return'Par';if(d===1)return'Bogey';if(d===2)return'Double';return'+'+d;}
function toast(m,t){t=t||'success';var e=document.createElement('div');e.className='toast t-'+t;e.innerHTML=m;document.body.appendChild(e);setTimeout(function(){e.classList.add('t-show');},10);setTimeout(function(){e.classList.remove('t-show');setTimeout(function(){e.remove();},300);},4000);}
function vib(ms){if(navigator.vibrate)navigator.vibrate(ms||50);}
function fmtDate(ts){if(!ts)return'—';return new Date(ts).toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'numeric'});}
function fmtTime(ts){if(!ts)return'—';var d=new Date(ts),h=d.getHours(),m=d.getMinutes();return(h<10?'0':'')+h+':'+(m<10?'0':'')+m;}
function baseUrl(){var loc=window.location,path=loc.pathname,dir=path.substring(0,path.lastIndexOf('/')+1);return loc.origin+dir;}
function qrUrl(data){return'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(data);}

// ==========================================
// БЛОК «МОИ АКТИВНЫЕ РАУНДЫ»
// ==========================================
function loadMyActiveRounds(targetId) {
    var el = document.getElementById(targetId);
    if (!el || typeof db === 'undefined') return;

    db.ref('rounds').on('value', function(snap) {
        var data = snap.val() || {};
        var myActive = [];

        Object.entries(data).forEach(function(e) {
            var id = e[0], r = e[1];
            if (!r || r.status !== 'active') return;

            var localSoloKey = localStorage.getItem('pestovo_solo_key_' + id);
            var localGroupKey = localStorage.getItem('pestovo_group_key_' + id);
            var localActingAs = localStorage.getItem('pestovo_acting_as_' + id);

            var isCreatedByMe = false;

            if (currentUser && r.createdBy === currentUser.uid) {
                isCreatedByMe = true;
            } else if (localSoloKey && r.accessKey === localSoloKey) {
                isCreatedByMe = true;
            } else if (localGroupKey && r.accessKey === localGroupKey) {
                isCreatedByMe = true;
            } else if (currentUser && r.players && r.players[currentUser.uid]) {
                isCreatedByMe = true;
            } else if (localActingAs && r.players && r.players[localActingAs]) {
                isCreatedByMe = true;
            }

            if (isCreatedByMe) {
                myActive.push({ id: id, round: r });
            }
        });

        if (myActive.length === 0) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }

        myActive.sort(function(a, b) { return (b.round.createdAt || 0) - (a.round.createdAt || 0); });

        var html = '<div class="card" style="border:2px solid var(--gold);background:linear-gradient(135deg, rgba(201,168,76,0.12), var(--card));margin-bottom:24px;">';
        html += '<h2 style="color:var(--gold);margin-bottom:12px;"><i class="fas fa-play-circle"></i> Мои активные раунды</h2>';
        html += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">У вас есть начатый раунд. Нажмите, чтобы продолжить игру:</p>';

        myActive.forEach(function(item) {
            var id = item.id, r = item.round;
            var link = r.mode === 'solo' ? 'solo.html?round=' + id : 'live.html?round=' + id;
            var modeIcon = r.mode === 'solo' ? '<i class="fas fa-user"></i> Одиночный' : '<i class="fas fa-users"></i> Групповой';
            var teePill = fmtTeePill(r.tee);
            var playersCount = Object.keys(r.players || {}).length;

            html += '<div class="list-item" style="padding:16px;background:var(--input);border:1px solid var(--border);margin-bottom:10px;flex-wrap:wrap;gap:12px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<div style="font-weight:800;font-size:16px;color:var(--white);"><span class="live-dot" style="width:7px;height:7px;margin-right:6px;"></span> Пестово · ' + modeIcon + '</div>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    'Старт: ' + fmtTime(r.startTime) + ' · С лунки: №' + (r.startHole || 1) + ' · ТИ: ' + teePill + ' · Игроков: ' + playersCount + '</div>';
            html += '</div>';
            html += '<a href="' + link + '" class="btn btn-g"><i class="fas fa-gamepad"></i> Продолжить игру</a>';
            html += '</div>';
        });

        html += '</div>';
        el.innerHTML = html;
        el.classList.remove('hidden');
    });
}

// ==========================================
// ПОГОДНЫЙ ВИДЖЕТ И ВЕКТОР ВЕТРА (OPEN-METEO)
// ==========================================
function getWindCardinal(deg) {
    var directions = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
    var idx = Math.round((deg % 360) / 45) % 8;
    return directions[idx];
}

function getWeatherCodeInfo(code) {
    if (code === 0) return { icon: '☀️', text: 'Ясно' };
    if (code >= 1 && code <= 3) return { icon: '🌤️', text: 'Малооблачно' };
    if (code === 45 || code === 48) return { icon: '🌫️', text: 'Туман' };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', text: 'Дождь' };
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { icon: '❄️', text: 'Снег' };
    if (code >= 95) return { icon: '⛈️', text: 'Гроза' };
    return { icon: '🌤️', text: 'Пестово' };
}

function loadPestovoWeather(targetId) {
    var el = document.getElementById(targetId);
    if (!el) return;

    var url = 'https://api.open-meteo.com/v1/forecast?latitude=56.09&longitude=37.62&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&wind_speed_unit=ms';

    if (typeof fetch !== 'undefined') {
        fetch(url).then(function(res) {
            return res.json();
        }).then(function(data) {
            if (!data || !data.current) throw new Error('No data');
            var curr = data.current;
            var temp = Math.round(curr.temperature_2m);
            var tempStr = (temp > 0 ? '+' : '') + temp + '°C';
            var windSpeed = Math.round(curr.wind_speed_10m || 0);
            var windDeg = Math.round(curr.wind_direction_10m || 0);
            var windDir = getWindCardinal(windDeg);
            var weather = getWeatherCodeInfo(curr.weather_code);

            var html = '<div class="weather-widget">' +
                '<div class="weather-item"><span class="weather-icon">' + weather.icon + '</span><b>' + tempStr + '</b> <span style="color:var(--muted);font-size:11px;">(' + weather.text + ')</span></div>' +
                '<div class="weather-divider"></div>' +
                '<div class="weather-item"><i class="fas fa-location-arrow wind-arrow" style="transform:rotate(' + (windDeg - 45) + 'deg);"></i> <b>Ветер: ' + windSpeed + ' м/с ' + windDir + '</b></div>' +
                '</div>';

            el.innerHTML = html;
            el.classList.remove('hidden');
        }).catch(function() {
            var html = '<div class="weather-widget">' +
                '<div class="weather-item"><span class="weather-icon">⛳</span> <b>Пестово</b></div>' +
                '<div class="weather-divider"></div>' +
                '<div class="weather-item"><i class="fas fa-wind" style="color:var(--gold);"></i> <b>Ветер: 3 м/с ЮЗ</b></div>' +
                '</div>';
            el.innerHTML = html;
            el.classList.remove('hidden');
        });
    } else {
        var html = '<div class="weather-widget">' +
            '<div class="weather-item"><span class="weather-icon">⛳</span> <b>Пестово</b></div>' +
            '<div class="weather-divider"></div>' +
            '<div class="weather-item"><i class="fas fa-wind" style="color:var(--gold);"></i> <b>Ветер: 3 м/с ЮЗ</b></div>' +
            '</div>';
        el.innerHTML = html;
        el.classList.remove('hidden');
    }
}

// ==========================================
// ДНЕВНОЙ РЕЖИМ «ЯРКОЕ СОЛНЦЕ» (SUN MODE)
// ==========================================
function initThemeMode() {
    var savedTheme = localStorage.getItem('pestovo_theme');
    if (savedTheme === 'sun' && document.body) {
        document.body.classList.add('sun-mode');
    }
}

function toggleSunMode() {
    if (!document.body) return;
    var isSun = document.body.classList.toggle('sun-mode');
    localStorage.setItem('pestovo_theme', isSun ? 'sun' : 'dark');
    updateSunModeButtons();
    if (typeof toast === 'function') {
        toast(isSun ? '☀️ Включён режим «Яркое солнце»' : '🌙 Включена тёмная тема', 'info');
    }
}

function updateSunModeButtons() {
    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');
    document.querySelectorAll('.sun-mode-btn').forEach(function(btn) {
        btn.innerHTML = isSun ? '<i class="fas fa-sun"></i> Солнце ✅' : '<i class="far fa-sun"></i> Солнце';
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initThemeMode();
});

// ==========================================
// ФИРМЕННЫЕ БЕЙДЖИ РЕЗУЛЬТАТОВ И ТИ
// ==========================================
function fmtTeePill(t) {
    t = t || 'wh';
    var name = TEES[t] || 'Белый';
    return '<span class="tee-pill tee-' + t + '">' + name + '</span>';
}

function fmtScoreBadge(s, p) {
    if (!s || s < 1 || !p) return '—';
    var diff = s - p;
    var name = holeResName(s, p);
    var cls = 'badge-par';
    if (diff <= -2 || s === 1) cls = 'badge-eag';
    else if (diff === -1) cls = 'badge-bir';
    else if (diff === 0) cls = 'badge-par';
    else if (diff === 1) cls = 'badge-bog';
    else cls = 'badge-dbl';

    return '<span class="' + cls + '">' + name + ' (' + s + ')</span>';
}

// ==========================================
// ПРОГРЕСС-БАР РАУНДА
// ==========================================
function renderHoleProgressBar(targetId, holesPlayed) {
    var el = document.getElementById(targetId);
    if (!el) return;
    var cnt = Math.max(0, Math.min(18, holesPlayed || 0));
    var pct = Math.round((cnt / 18) * 100);
    el.innerHTML =
        '<div class="progress-track-wrap">' +
        '<div class="progress-track-head"><span><i class="fas fa-flag"></i> Прогресс раунда</span><span>' + cnt + ' / 18 лунок (' + pct + '%)</span></div>' +
        '<div class="progress-track-bar"><div class="progress-track-fill" style="width:' + pct + '%;"></div></div>' +
        '</div>';
}

// ==========================================
// ВСПЛЕСК КОНФЕТТИ ПРИ BIRDIE / EAGLE / HIO
// ==========================================
function triggerVictoryConfetti() {
    if (typeof document === 'undefined' || !document.body) return;
    var colors = ['#f39c12', '#c9a84c', '#e0c76a', '#2ecc71', '#ffffff'];
    for (var i = 0; i < 35; i++) {
        var p = document.createElement('div');
        p.className = 'confetti-particle';
        var dx = (Math.random() * 200 - 100) + 'px';
        var dur = (1.2 + Math.random() * 0.8) + 's';
        var color = colors[Math.floor(Math.random() * colors.length)];
        var left = (Math.random() * 100) + 'vw';
        
        p.style.left = left;
        p.style.top = '-20px';
        p.style.backgroundColor = color;
        p.style.animationDuration = dur;
        if (p.style.setProperty) {
            p.style.setProperty('--dx', dx);
        }
        document.body.appendChild(p);
        (function(elem) {
            setTimeout(function() { elem.remove(); }, 2000);
        })(p);
    }
}

// ==========================================
// FLIP / SPRING ANIMATION FOR SCORES
// ==========================================
function animateScoreElement(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.classList.remove('score-pulse');
    void el.offsetWidth;
    el.classList.add('score-pulse');
}

function initNav(){
    var tg=document.getElementById('nav-toggle');
    var mn=document.getElementById('nav-menu');
    var ov=document.getElementById('nav-overlay');

    if(!ov){
        ov=document.createElement('div');
        ov.id='nav-overlay';
        ov.className='nav-overlay';
        if(document.body) document.body.appendChild(ov);
    }

    function openNav(){
        if(tg)tg.classList.add('active');
        if(mn)mn.classList.add('open');
        if(ov)ov.classList.add('show');
    }

    function closeNav(){
        if(tg)tg.classList.remove('active');
        if(mn)mn.classList.remove('open');
        if(ov)ov.classList.remove('show');
    }

    if(tg&&mn){
        tg.addEventListener('click',function(e){
            e.stopPropagation();
            if(mn.classList.contains('open')){
                closeNav();
            }else{
                openNav();
            }
        });
    }

    if(ov){
        ov.addEventListener('click',function(){
            closeNav();
        });
    }

    var closeBtn=document.getElementById('nav-menu-close');
    if(!closeBtn&&mn){
        closeBtn=document.createElement('button');
        closeBtn.id='nav-menu-close';
        closeBtn.className='nav-menu-close';
        closeBtn.innerHTML='&times;';
        closeBtn.setAttribute('aria-label','Закрыть меню');
        if(mn.insertBefore) mn.insertBefore(closeBtn,mn.firstChild);
    }
    if(closeBtn){
        closeBtn.addEventListener('click',function(){
            closeNav();
        });
    }

    if(mn&&mn.querySelectorAll){
        mn.querySelectorAll('a').forEach(function(link){
            link.addEventListener('click',function(){
                closeNav();
            });
        });
    }

    document.addEventListener('keydown',function(e){
        if(e.key==='Escape'){
            closeNav();
        }
    });

    window.addEventListener('scroll',function(){
        var n=document.getElementById('main-nav');
        if(n){
            if(window.scrollY>50)n.classList.add('nav-scrolled');
            else n.classList.remove('nav-scrolled');
        }
    });
}

function navAuth(u,d){
    var e=document.getElementById('nav-auth');
    if(!e)return;
    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');
    var sunBtn = '<button class="sun-mode-btn" onclick="toggleSunMode()">' + (isSun ? '<i class="fas fa-sun"></i> Солнце ✅' : '<i class="far fa-sun"></i> Солнце') + '</button>';
    if(u&&d)e.innerHTML='<div class="nav-user">'+sunBtn+'<span class="nav-uname">'+(d.name||'')+'</span><button class="btn btn-og btn-sm" onclick="doLogout()"><i class="fas fa-sign-out-alt"></i></button></div>';
    else e.innerHTML='<div style="display:flex;align-items:center;gap:8px;">'+sunBtn+'<a href="auth.html" class="btn btn-g btn-sm">Войти</a></div>';
}

function doLogout(){auth.signOut().then(function(){window.location.href='auth.html';});}
function holeOrder(sh){var o=[],h=parseInt(sh)||1;for(var i=0;i<18;i++){o.push(h);h=h>=18?1:h+1;}return o;}

function holeDeadline(startTime,startHole,targetHole){if(!startTime)return null;var t=0,h=parseInt(startHole)||1,c=0;while(c<18){t+=holeTiming(h);if(h===targetHole)break;h=h>=18?1:h+1;c++;}return startTime+t*60000;}
function checkTiming(startTime,startHole,holeNum){var dl=holeDeadline(startTime,startHole,holeNum);if(!dl)return{status:'ok',diff:0,deadline:null};var now=Date.now(),d=Math.round((now-dl)/60000);if(d>5)return{status:'late',diff:d,deadline:dl};if(d>0)return{status:'warning',diff:d,deadline:dl};return{status:'ok',diff:d,deadline:dl};}
function buildTimingNotice(st,sh,ch){var c=checkTiming(st,sh,ch);if(!c.deadline)return'';var dl=fmtTime(c.deadline),nw=fmtTime(Date.now());if(c.status==='late')return'<div class="timing-alert timing-late"><i class="fas fa-exclamation-triangle"></i><div><strong>Отставание!</strong><br>Лунка '+ch+': дедлайн '+dl+', сейчас '+nw+' ('+c.diff+' мин.)</div></div>';if(c.status==='warning')return'<div class="timing-alert timing-warn"><i class="fas fa-clock"></i><div><strong>Близко к дедлайну</strong><br>Лунка '+ch+': '+dl+'</div></div>';var a=Math.abs(c.diff);return'<div class="timing-alert timing-ok"><i class="fas fa-check-circle"></i><div>Лунка '+ch+': в графике'+(a>0?' (запас '+a+' мин.)':'')+'</div></div>';}
function buildTimingTable(st,sh){if(!st)return'';var html='<table class="scorecard"><tr><th>Лунка</th><th>Пар</th><th>Мин</th><th>Дедлайн</th></tr>';var h=parseInt(sh)||1;for(var i=0;i<18;i++){var dl=holeDeadline(st,sh,h);html+='<tr><td style="font-weight:700">'+h+'</td><td>'+holePar(h)+'</td><td>'+holeTiming(h)+'</td><td>'+fmtTime(dl)+'</td></tr>';h=h>=18?1:h+1;}html+='</table>';return html;}

const ADMIN_LOGIN='admin';
const ADMIN_PASS='pestovo2024';

function parseExactHcp(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    var s = String(val).trim().replace(',', '.');
    if (s.startsWith('+')) {
        return -Math.abs(parseFloat(s.substring(1)) || 0);
    }
    return parseFloat(s) || 0;
}

function fmtExactHcp(val) {
    if (val === null || val === undefined || isNaN(val) || val === '') return '—';
    var num = parseFloat(val);
    if (isNaN(num)) return '—';
    if (num < 0) {
        return '+' + Math.abs(num).toFixed(1);
    }
    return Math.abs(num).toFixed(1);
}

function fmtFieldHcp(val) {
    if (val === null || val === undefined || isNaN(val) || val === '') return '0';
    return String(Math.abs(Math.round(parseFloat(val) || 0)));
}

function getFieldHcp(exactHcp, tee, gender) {
    var parsed = parseExactHcp(exactHcp);
    gender = gender || 'men'; tee = tee || 'wh';
    var rating = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][tee];
    if (!rating) return Math.round(parsed);
    var field = (parsed * (rating.sr / 113)) + (rating.cr - TOTAL_PAR);
    return Math.round(field);
}

function generateHcpTable(gender, tee) {
    var rating = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][tee];
    if (!rating) return [];
    var rows = [];
    var maxPlus = -5.0;
    var maxHandicap = 54.0;

    var curStart = maxPlus;
    var curField = getFieldHcp(curStart, tee, gender);

    for (var x = -4.9; x <= maxHandicap + 0.05; x += 0.1) {
        var exactVal = Math.round(x * 10) / 10;
        var f = getFieldHcp(exactVal, tee, gender);
        if (f !== curField) {
            var prevExact = Math.round((exactVal - 0.1) * 10) / 10;
            rows.push([fmtExactHcp(curStart), fmtExactHcp(prevExact), fmtFieldHcp(curField)]);
            curStart = exactVal;
            curField = f;
        }
    }
    rows.push([fmtExactHcp(curStart), fmtExactHcp(maxHandicap), fmtFieldHcp(curField)]);
    return rows;
}

var HCP_TABLE = {
    get men() {
        return {
            bk: generateHcpTable('men', 'bk'),
            bl: generateHcpTable('men', 'bl'),
            wh: generateHcpTable('men', 'wh'),
            rd: generateHcpTable('men', 'rd')
        };
    },
    get women() {
        return {
            bl: generateHcpTable('women', 'bl'),
            wh: generateHcpTable('women', 'wh'),
            rd: generateHcpTable('women', 'rd')
        };
    }
};
if (typeof window !== 'undefined') {
    window.HCP_TABLE = HCP_TABLE;
}

function stablefordField(strokes,holeNum,fieldHcp){
    if(!strokes||strokes<1)return 0;
    var par=holePar(holeNum),hcpIdx=holeHcp(holeNum),extra=0;
    if(fieldHcp>0&&hcpIdx>0){
        extra=Math.floor(fieldHcp/18);
        if(hcpIdx<=(fieldHcp%18))extra++;
    } else if(fieldHcp<0&&hcpIdx>0){
        var absHcp=Math.abs(fieldHcp);
        extra=-Math.floor(absHcp/18);
        if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    var nett=strokes-extra,diff=nett-par;
    if(diff<=-3)return 5;if(diff===-2)return 4;if(diff===-1)return 3;if(diff===0)return 2;if(diff===1)return 1;return 0;
}

function stablefordExact(strokes,holeNum,exactHcp){
    if(!strokes||strokes<1)return 0;
    var par=holePar(holeNum),hcpIdx=holeHcp(holeNum),hcp=Math.round(parseExactHcp(exactHcp)||0),extra=0;
    if(hcp>0&&hcpIdx>0){
        extra=Math.floor(hcp/18);
        if(hcpIdx<=(hcp%18))extra++;
    } else if(hcp<0&&hcpIdx>0){
        var absHcp=Math.abs(hcp);
        extra=-Math.floor(absHcp/18);
        if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    var nett=strokes-extra,diff=nett-par;
    if(diff<=-3)return 5;if(diff===-2)return 4;if(diff===-1)return 3;if(diff===0)return 2;if(diff===1)return 1;return 0;
}

function calcNettScore(strokes,par,hcpIdx,fieldHcp){
    if(!strokes||strokes<1)return 0;
    var extra=0;
    if(fieldHcp>0&&hcpIdx>0){
        extra=Math.floor(fieldHcp/18);
        if(hcpIdx<=(fieldHcp%18))extra++;
    } else if(fieldHcp<0&&hcpIdx>0){
        var absHcp=Math.abs(fieldHcp);
        extra=-Math.floor(absHcp/18);
        if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    return strokes-extra;
}

function calcRoundStats(scores,fieldHcp,exactHcp,holesOrder){
    holesOrder=holesOrder||[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
    var played=[],remaining=[],gross=0,parPlayed=0,netTotal=0,stblField=0,stblExact=0;
    var birdies=0,eagles=0,pars=0,bogeys=0,doubles=0,hio=0,currentHole=null;

    for(var i=0;i<holesOrder.length;i++){
        var h=holesOrder[i],s=scores[h]?parseInt(scores[h]):0,par=holePar(h);
        if(s>=1){
            played.push(h);gross+=s;parPlayed+=par;
            netTotal+=calcNettScore(s,par,holeHcp(h),fieldHcp||0);
            var diff=s-par;
            if(diff<=-2)eagles++;else if(diff===-1)birdies++;else if(diff===0)pars++;else if(diff===1)bogeys++;else doubles++;
            if(s===1)hio++;
            stblField+=stablefordField(s,h,fieldHcp||0);
            stblExact+=stablefordExact(s,h,exactHcp||0);
        }else{
            remaining.push(h);
            if(currentHole===null)currentHole=h;
        }
    }
    var toPar=played.length>0?gross-parPlayed:null;
    var netToPar=played.length>0?netTotal-parPlayed:null;
    var projected=played.length>0?gross+(TOTAL_PAR-parPlayed):null;
    return{played:played,remaining:remaining,holesPlayed:played.length,holesRemaining:remaining.length,currentHole:currentHole,gross:gross,parPlayed:parPlayed,toPar:toPar,net:netTotal,netToPar:netToPar,projected:projected,stablefordField:stblField,stablefordExact:stblExact,birdies:birdies,eagles:eagles,pars:pars,bogeys:bogeys,doubles:doubles,holeInOne:hio};
}

function generateGroupHoleTableHTML(r) {
    var players = r.players || {};
    var playerEntries = Object.entries(players);
    if (!playerEntries.length) return '';

    var pOut = 0, pIn = 0;
    for (var i = 1; i <= 9; i++) pOut += holePar(i);
    for (var i = 10; i <= 18; i++) pIn += holePar(i);

    var html = '<div class="scorecard" style="margin-bottom:12px;"><table>';
    html += '<tr><th style="text-align:left;padding-left:10px;">Игрок / Лунка</th>';
    for (var i = 1; i <= 9; i++) html += '<th>' + i + '</th>';
    html += '<th>Аут</th></tr>';

    html += '<tr class="row-par"><td style="text-align:left;padding-left:10px;font-weight:700;">Пар</td>';
    for (var i = 1; i <= 9; i++) html += '<td>' + holePar(i) + '</td>';
    html += '<td style="font-weight:800;">' + pOut + '</td></tr>';

    playerEntries.forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var outG = 0;
        html += '<tr style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + pid + '\',\'' + (r.roundId || '') + '\')">';
        html += '<td style="text-align:left;padding-left:10px;font-weight:700;color:var(--gold);white-space:nowrap;"><i class="fas fa-user"></i> ' + (p.name || '—') + '</td>';
        for (var i = 1; i <= 9; i++) {
            var s = parseInt(sc[i]) || 0;
            var par = holePar(i);
            var cls = holeResClass(s, par);
            if (s > 0) outG += s;
            html += '<td class="' + cls + '"><b>' + (s > 0 ? s : '') + '</b></td>';
        }
        html += '<td class="row-total"><b>' + (outG > 0 ? outG : '') + '</b></td></tr>';
    });
    html += '</table></div>';

    html += '<div class="scorecard"><table>';
    html += '<tr><th style="text-align:left;padding-left:10px;">Игрок / Лунка</th>';
    for (var i = 10; i <= 18; i++) html += '<th>' + i + '</th>';
    html += '<th>Ин</th><th>Итого</th></tr>';

    html += '<tr class="row-par"><td style="text-align:left;padding-left:10px;font-weight:700;">Пар</td>';
    for (var i = 10; i <= 18; i++) html += '<td>' + holePar(i) + '</td>';
    html += '<td style="font-weight:800;">' + pIn + '</td><td style="font-weight:800;">' + (pOut + pIn) + '</td></tr>';

    playerEntries.forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var outG = 0, inG = 0;
        for (var i = 1; i <= 9; i++) { var s = parseInt(sc[i]) || 0; if (s > 0) outG += s; }
        for (var i = 10; i <= 18; i++) { var s = parseInt(sc[i]) || 0; if (s > 0) inG += s; }
        var totG = outG + inG;

        html += '<tr style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + pid + '\',\'' + (r.roundId || '') + '\')">';
        html += '<td style="text-align:left;padding-left:10px;font-weight:700;color:var(--gold);white-space:nowrap;"><i class="fas fa-user"></i> ' + (p.name || '—') + '</td>';
        for (var i = 10; i <= 18; i++) {
            var s = parseInt(sc[i]) || 0;
            var par = holePar(i);
            var cls = holeResClass(s, par);
            if (s > 0) inG += s;
            html += '<td class="' + cls + '"><b>' + (s > 0 ? s : '') + '</b></td>';
        }
        html += '<td class="row-total"><b>' + (inG > 0 ? inG : '') + '</b></td>';
        html += '<td class="row-total"><b>' + (totG > 0 ? totG : '') + '</b></td></tr>';
    });
    html += '</table></div>';

    return html;
}

// ==========================================
// УНИВЕРСАЛЬНОЕ МОДАЛЬНОЕ ОКНО ПРОФИЛЯ И СЧЁТНОЙ КАРТОЧКИ
// ==========================================
function openPlayerProfileModal(playerId, roundId) {
    var modalEl = document.getElementById('pmodal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'pmodal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closePModal()"></div>' +
            '<div class="modal-body">' +
            '<button class="modal-close" onclick="closePModal()">&times;</button>' +
            '<div id="pmodal-body"><div class="loading"><div class="spinner"></div></div></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('pmodal-body');
    if (bodyEl) bodyEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modalEl.classList.remove('hidden');

    if (typeof db === 'undefined') return;

    var userPromise = db.ref('users/' + playerId).once('value').then(function(sn) { return sn.val(); }).catch(function() { return null; });
    var roundPromise = roundId ? db.ref('rounds/' + roundId).once('value').then(function(sn) { return sn.val(); }).catch(function() { return null; }) : Promise.resolve(null);

    Promise.all([userPromise, roundPromise]).then(function(res) {
        var u = res[0];
        var rd = res[1];

        if (!u && rd && rd.players && rd.players[playerId]) {
            var p = rd.players[playerId];
            u = {
                name: p.name || 'Гость',
                handicap: p.exactHcp || null,
                gender: p.gender || 'men',
                isGuest: true,
                roundsPlayed: 1
            };
        }

        if (!u) {
            if (bodyEl) bodyEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:30px;">Профиль игрока не найден</p>';
            return;
        }

        var gIcon = u.gender === 'women' ? '👩' : '👨';
        var guestBadge = u.isGuest ? '<span style="background:rgba(201,168,76,0.15);color:var(--gold);padding:2px 8px;border-radius:12px;font-size:10px;margin-left:6px;">ГОСТЬ</span>' : '';

        var html = '<div class="profile-head">';
        html += '<div class="profile-avatar">' + (u.name ? u.name.charAt(0) : '?') + '</div>';
        html += '<div><div class="profile-name">' + gIcon + ' ' + (u.name || '—') + guestBadge + '</div>';
        html += '<div class="profile-meta">';
        html += '<span><i class="fas fa-golf-ball"></i> HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') + '</span>';
        html += '<span><i class="fas fa-flag"></i> ' + (u.roundsPlayed || 0) + ' раундов</span>';
        if (u.bestGross) html += '<span><i class="fas fa-trophy"></i> Gross (18л): ' + u.bestGross + '</span>';
        html += '</div></div></div>';

        if (rd && rd.players && rd.players[playerId]) {
            var roundPlayer = rd.players[playerId];
            html += '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);">';
            html += '<h3 style="color:var(--gold);margin-bottom:14px;font-family:var(--ff);font-size:18px;">' +
                    '<i class="fas fa-table"></i> Счётная карточка раунда (' + (rd.format || 'Stroke') + ' · ТИ: ' + fmtTeePill(rd.tee) + ')' +
                    '</h3>';
            
            if (typeof generatePestovoScorecardHTML === 'function') {
                html += generatePestovoScorecardHTML(roundPlayer, rd);
            }
            html += '</div>';
        }

        db.ref('users/' + playerId + '/history').once('value').then(function(hSn) {
            var history = hSn.val() || {};
            var rounds = Object.values(history);
            rounds.sort(function(a, b) { return (b.date || 0) - (a.date || 0); });

            if (rounds.length > 0) {
                html += '<h3 style="color:var(--gold);margin:24px 0 12px;font-family:var(--ff);font-size:18px;"><i class="fas fa-history"></i> История раундов</h3>';
                rounds.forEach(function(r) {
                    var isFull = r.holes === 18;
                    var fullTag = isFull ? ' <span style="color:#2ecc71;font-size:10px;">(18л)</span>' : ' <span style="color:var(--muted);font-size:10px;">(' + r.holes + 'л)</span>';

                    html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;">';
                    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);">Пестово</strong>' + fullTag;
                    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' +
                            fmtDate(r.date) + ' · ' + (r.format || 'Stroke') + ' · ТИ: ' + (r.tee ? fmtTeePill(r.tee) : '—') +
                            ' · ' + (r.mode === 'solo' ? '👤' : '👥') + '</div>';
                    html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' +
                            (r.holeInOne ? '🎯 ' + r.holeInOne + ' · ' : '') +
                            '🦅 ' + (r.eagles || 0) + ' · 🐦 ' + (r.birdies || 0) + ' · Par ' + (r.pars || 0) + '</div></div>';
                    html += '<div style="text-align:right;">';
                    html += '<div style="font-size:22px;font-weight:800;color:var(--white);">' + r.gross + '</div>';
                    html += '<div class="' + scoreClass(r.toPar) + '" style="font-size:14px;font-weight:700;">' + fmtScore(r.toPar) + '</div>';
                    if (r.roundId) {
                        html += '<button class="btn btn-og btn-sm" style="margin-top:6px;" onclick="event.stopPropagation();downloadScorecard(\'' + r.roundId + '\')"><i class="fas fa-download"></i></button>';
                    }
                    html += '</div></div>';
                });
            }

            if (bodyEl) bodyEl.innerHTML = html;
        }).catch(function() {
            if (bodyEl) bodyEl.innerHTML = html;
        });
    });
}

function closePModal() {
    var modalEl = document.getElementById('pmodal');
    if (modalEl) modalEl.classList.add('hidden');
}

// ==========================================
// СКОРКАРТА ПЕСТОВО (КАК НА ФОТО — 18 ЛУНОК)
// ==========================================
function generatePestovoScorecardHTML(player, roundData) {
    var p = player || {};
    var sc = p.scores || {};
    var fHcp = p.fieldHcp || 0;
    var eHcp = p.exactHcp || 0;
    var fmt = (roundData && roundData.format) || 'Stroke Play';
    var date = fmtDate((roundData && (roundData.completedAt || roundData.createdAt)) || Date.now());
    var startTime = fmtTime(roundData && roundData.startTime);

    var outG=0,inG=0,outS=0,inS=0;
    for(var i=1;i<=9;i++){var s=parseInt(sc[i])||0;if(s>0){outG+=s;outS+=stablefordField(s,i,fHcp);}}
    for(var i=10;i<=18;i++){var s=parseInt(sc[i])||0;if(s>0){inG+=s;inS+=stablefordField(s,i,fHcp);}}
    var totG=outG+inG,totS=outS+inS;

    var pOut=0,pIn=0;
    for(var i=1;i<=9;i++)pOut+=holePar(i);
    for(var i=10;i<=18;i++)pIn+=holePar(i);

    var html='<div class="pestovo-card-wrap">';

    // Шапка
    html+='<div class="pc-header">';
    html+='<div class="pc-col"><strong>Игрок:</strong> '+(p.name||'—')+'</div>';
    html+='<div class="pc-col"><strong>Точный гандикап:</strong> '+(fmtExactHcp(eHcp))+' · <strong>Полевой:</strong> '+(fmtFieldHcp(fHcp))+'</div>';
    html+='<div class="pc-col"><strong>Формат:</strong> '+fmt+' · <strong>Старт:</strong> '+startTime+' · <strong>Дата:</strong> '+date+'</div>';
    html+='</div>';

    // Таблица Front 9
    html+='<div class="pc-table-wrap"><table class="pc-table">';
    html+='<tr><th class="pc-lbl">ТИ</th><th class="pc-lbl">Лунка</th>';
    for(var i=1;i<=9;i++)html+='<th>'+i+'</th>';
    html+='<th class="pc-tot">Аут</th>';
    for(var i=10;i<=18;i++)html+='<th>'+i+'</th>';
    html+='<th class="pc-tot">Ин</th><th class="pc-tot">Итого</th></tr>';

    // Чёрный ти
    var bkOut=0,bkIn=0;for(var i=1;i<=9;i++)bkOut+=HOLES[i].bk;for(var i=10;i<=18;i++)bkIn+=HOLES[i].bk;
    html+='<tr><td colspan="2" class="pc-lbl" style="background:#1a1a1a;color:#fff;">Чёрный</td>';
    for(var i=1;i<=9;i++)html+='<td>'+HOLES[i].bk+'</td>';
    html+='<td class="pc-tot">'+bkOut+'</td>';
    for(var i=10;i<=18;i++)html+='<td>'+HOLES[i].bk+'</td>';
    html+='<td class="pc-tot">'+bkIn+'</td><td class="pc-tot">'+(bkOut+bkIn)+'</td></tr>';

    // Синий ти
    var blOut=0,blIn=0;for(var i=1;i<=9;i++)blOut+=HOLES[i].bl;for(var i=10;i<=18;i++)blIn+=HOLES[i].bl;
    html+='<tr><td colspan="2" class="pc-lbl" style="background:#2980b9;color:#fff;">Синий</td>';
    for(var i=1;i<=9;i++)html+='<td>'+HOLES[i].bl+'</td>';
    html+='<td class="pc-tot">'+blOut+'</td>';
    for(var i=10;i<=18;i++)html+='<td>'+HOLES[i].bl+'</td>';
    html+='<td class="pc-tot">'+bkIn+'</td><td class="pc-tot">'+(blOut+blIn)+'</td></tr>';

    // Белый ти
    var whOut=0,whIn=0;for(var i=1;i<=9;i++)whOut+=HOLES[i].wh;for(var i=10;i<=18;i++)whIn+=HOLES[i].wh;
    html+='<tr><td colspan="2" class="pc-lbl">Белый</td>';
    for(var i=1;i<=9;i++)html+='<td>'+HOLES[i].wh+'</td>';
    html+='<td class="pc-tot">'+whOut+'</td>';
    for(var i=10;i<=18;i++)html+='<td>'+HOLES[i].wh+'</td>';
    html+='<td class="pc-tot">'+whIn+'</td><td class="pc-tot">'+(whOut+whIn)+'</td></tr>';

    // Красный ти
    var rdOut=0,rdIn=0;for(var i=1;i<=9;i++)rdOut+=HOLES[i].rd;for(var i=10;i<=18;i++)rdIn+=HOLES[i].rd;
    html+='<tr><td colspan="2" class="pc-lbl" style="background:#c0392b;color:#fff;">Красный</td>';
    for(var i=1;i<=9;i++)html+='<td>'+HOLES[i].rd+'</td>';
    html+='<td class="pc-tot">'+rdOut+'</td>';
    for(var i=10;i<=18;i++)html+='<td>'+HOLES[i].rd+'</td>';
    html+='<td class="pc-tot">'+rdIn+'</td><td class="pc-tot">'+(rdOut+rdIn)+'</td></tr>';

    // Пар
    html+='<tr><td colspan="2" class="pc-lbl pc-par">Пар</td>';
    for(var i=1;i<=9;i++)html+='<td class="pc-par">'+HOLES[i].p+'</td>';
    html+='<td class="pc-tot pc-par">'+pOut+'</td>';
    for(var i=10;i<=18;i++)html+='<td class="pc-par">'+HOLES[i].p+'</td>';
    html+='<td class="pc-tot pc-par">'+pIn+'</td><td class="pc-tot pc-par">'+(pOut+pIn)+'</td></tr>';

    // Индекс
    html+='<tr><td colspan="2" class="pc-lbl pc-idx">Индекс</td>';
    for(var i=1;i<=9;i++)html+='<td class="pc-idx">'+HOLES[i].hcp+'</td>';
    html+='<td class="pc-idx"></td>';
    for(var i=10;i<=18;i++)html+='<td class="pc-idx">'+HOLES[i].hcp+'</td>';
    html+='<td class="pc-idx"></td><td class="pc-idx"></td></tr>';

    // СЧЁТ
    html+='<tr><td colspan="2" class="pc-lbl pc-score-lbl">Счёт</td>';
    for(var i=1;i<=9;i++){var s=parseInt(sc[i])||0;html+='<td class="pc-score-box"><b>'+(s>0?s:'')+'</b></td>';}
    html+='<td class="pc-tot pc-score-box"><b>'+(outG>0?outG:'')+'</b></td>';
    for(var i=10;i<=18;i++){var s=parseInt(sc[i])||0;html+='<td class="pc-score-box"><b>'+(s>0?s:'')+'</b></td>';}
    html+='<td class="pc-tot pc-score-box"><b>'+(inG>0?inG:'')+'</b></td>';
    html+='<td class="pc-tot pc-score-box"><b>'+(totG>0?totG:'')+'</b></td></tr>';

    // Stableford
    html+='<tr><td colspan="2" class="pc-lbl">Stblfd</td>';
    for(var i=1;i<=9;i++){var s=parseInt(sc[i])||0;html+='<td>'+(s>0?stablefordField(s,i,fHcp):'')+'</td>';}
    html+='<td class="pc-tot">'+(outS>0?outS:'')+'</td>';
    for(var i=10;i<=18;i++){var s=parseInt(sc[i])||0;html+='<td>'+(s>0?stablefordField(s,i,fHcp):'')+'</td>';}
    html+='<td class="pc-tot">'+(inS>0?inS:'')+'</td>';
    html+='<td class="pc-tot"><b>'+(totS>0?totS:'')+'</b></td></tr>';

    html+='</table></div>';

    // Подписи
    html+='<div class="pc-footer"><div><strong>Подписи:</strong> Игрок ___________________</div><div>Маркер ___________________</div><div>Судья ___________________</div></div>';
    html+='</div>';
    return html;
}

// ==========================================
// ПЕЧАТЬ
// ==========================================
function downloadScorecard(roundId){
    db.ref('rounds/'+roundId).once('value').then(function(sn){
        var r=sn.val();if(!r){toast('Раунд не найден','error');return;}
        var pl=r.players||{};
        var w=window.open('','_blank');

        var css='body{font-family:Arial,sans-serif;margin:0;padding:20px;background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
            +'.pestovo-card-wrap{border:2px solid #000;border-radius:8px;padding:16px;margin-bottom:30px;page-break-inside:avoid;}'
            +'.pc-header{display:flex;justify-content:space-between;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:10px;font-size:12px;flex-wrap:wrap;gap:8px;}'
            +'.pc-col{display:flex;flex-direction:column;gap:4px;}'
            +'.pc-col strong{color:#000;}'
            +'.pc-table-wrap{overflow-x:auto;}'
            +'.pc-table{width:100%;border-collapse:collapse;text-align:center;font-size:11px;}'
            +'.pc-table th,.pc-table td{border:1px solid #000;padding:6px 3px;}'
            +'.pc-table th{background:#e0e0e0;font-weight:bold;}'
            +'.pc-lbl{text-align:left!important;padding-left:8px!important;font-weight:bold;width:60px;}'
            +'.pc-tot{background:#f5f5f5;font-weight:bold;}'
            +'.pc-par{background:#d4edda;}'
            +'.pc-idx{color:#555;font-size:10px;}'
            +'.pc-score-lbl{font-size:14px;text-transform:uppercase;}'
            +'.pc-score-box{height:28px;font-size:16px;color:#000!important;}'
            +'.pc-footer{display:flex;justify-content:space-between;margin-top:20px;font-size:12px;font-weight:bold;flex-wrap:wrap;gap:12px;}';

        var h='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Счётная карточка — Пестово</title><style>'+css+'</style></head><body>';

        Object.values(pl).forEach(function(p){
            h+=generatePestovoScorecardHTML(p,r);
        });

        h+='</body></html>';
        w.document.write(h);w.document.close();
        setTimeout(function(){w.print();},500);
    });
}

// ==========================================
// ИСТОРИЯ
// ==========================================
function saveHistory(roundId,rd){
    var players=rd.players||{};
    Object.entries(players).forEach(function(pe){
        var pid=pe[0],p=pe[1],sc=p.scores||{},fH=p.fieldHcp||0,eH=p.exactHcp||0;
        var stats=calcRoundStats(sc,fH,eH,holeOrder(rd.startHole));
        if(stats.gross<=0)return;
        var isGuestPlayer=pid.indexOf('guest_')===0;
        if(isGuestPlayer){
            db.ref('users').orderByChild('name').equalTo(p.name||'Гость').once('value').then(function(usn){
                var existingId=null,existing=usn.val()||{};
                Object.entries(existing).forEach(function(ue){if(ue[1].isGuest===true)existingId=ue[0];});
                if(existingId){saveHistoryEntry(existingId,roundId,rd,p,stats);}
                else{
                    var newRef=db.ref('users').push();
                    newRef.set({name:p.name||'Гость',firstName:p.firstName||'',lastName:p.lastName||'',email:'',role:'guest',gender:p.gender||'men',handicap:eH||null,createdAt:Date.now(),roundsPlayed:0,bestGross:null,bestStableford:null,isGuest:true}).then(function(){saveHistoryEntry(newRef.key,roundId,rd,p,stats);});
                }
            });
        }else{saveHistoryEntry(pid,roundId,rd,p,stats);}
    });
}

function saveHistoryEntry(userId,roundId,rd,p,stats){
    db.ref('users/'+userId+'/history').push({
        roundId:roundId,date:rd.completedAt||Date.now(),tee:rd.tee||'wh',format:rd.format||'Stroke Play',
        mode:rd.mode||'group',startHole:rd.startHole||1,gross:stats.gross,toPar:stats.toPar,
        net:stats.net,netToPar:stats.netToPar,stablefordField:stats.stablefordField,stablefordExact:stats.stablefordExact,
        holes:stats.holesPlayed,scores:p.scores||{},birdies:stats.birdies,eagles:stats.eagles,
        pars:stats.pars,holeInOne:stats.holeInOne,exactHcp:p.exactHcp||0,fieldHcp:p.fieldHcp||0,gender:p.gender||'men'
    });
    db.ref('users/'+userId+'/roundsPlayed').transaction(function(v){return(v||0)+1;});
    if(stats.holesPlayed===18){
        db.ref('users/'+userId+'/bestGross').transaction(function(v){if(!v||stats.gross<v)return stats.gross;return v;});
        db.ref('users/'+userId+'/bestStableford').transaction(function(v){if(!v||stats.stablefordField>v)return stats.stablefordField;return v;});
    }
}
