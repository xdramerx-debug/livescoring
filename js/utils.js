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
    women:{bl:{cr:80.8,sr:143},wh:{cr:78.6,sr:143},rd:{cr:75.2,sr:136}}
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
function initNav(){var tg=document.getElementById('nav-toggle'),mn=document.getElementById('nav-menu');if(tg&&mn)tg.addEventListener('click',function(){tg.classList.toggle('active');mn.classList.toggle('open');});window.addEventListener('scroll',function(){var n=document.getElementById('main-nav');if(n){if(window.scrollY>50)n.classList.add('nav-scrolled');else n.classList.remove('nav-scrolled');}});}
function navAuth(u,d){var e=document.getElementById('nav-auth');if(!e)return;if(u&&d)e.innerHTML='<div class="nav-user"><span class="nav-uname">'+(d.name||'')+'</span><button class="btn btn-og btn-sm" onclick="doLogout()"><i class="fas fa-sign-out-alt"></i></button></div>';else e.innerHTML='<a href="auth.html" class="btn btn-g btn-sm">Войти</a>';}
function doLogout(){auth.signOut().then(function(){window.location.href='auth.html';});}
function holeOrder(sh){var o=[],h=parseInt(sh)||1;for(var i=0;i<18;i++){o.push(h);h=h>=18?1:h+1;}return o;}

function holeDeadline(startTime,startHole,targetHole){if(!startTime)return null;var t=0,h=parseInt(startHole)||1,c=0;while(c<18){t+=holeTiming(h);if(h===targetHole)break;h=h>=18?1:h+1;c++;}return startTime+t*60000;}
function checkTiming(startTime,startHole,holeNum){var dl=holeDeadline(startTime,startHole,holeNum);if(!dl)return{status:'ok',diff:0,deadline:null};var now=Date.now(),d=Math.round((now-dl)/60000);if(d>5)return{status:'late',diff:d,deadline:dl};if(d>0)return{status:'warning',diff:d,deadline:dl};return{status:'ok',diff:d,deadline:dl};}
function buildTimingNotice(st,sh,ch){var c=checkTiming(st,sh,ch);if(!c.deadline)return'';var dl=fmtTime(c.deadline),nw=fmtTime(Date.now());if(c.status==='late')return'<div class="timing-alert timing-late"><i class="fas fa-exclamation-triangle"></i><div><strong>Отставание!</strong><br>Лунка '+ch+': дедлайн '+dl+', сейчас '+nw+' ('+c.diff+' мин.)</div></div>';if(c.status==='warning')return'<div class="timing-alert timing-warn"><i class="fas fa-clock"></i><div><strong>Близко к дедлайну</strong><br>Лунка '+ch+': '+dl+'</div></div>';var a=Math.abs(c.diff);return'<div class="timing-alert timing-ok"><i class="fas fa-check-circle"></i><div>Лунка '+ch+': в графике'+(a>0?' (запас '+a+' мин.)':'')+'</div></div>';}
function buildTimingTable(st,sh){if(!st)return'';var html='<table class="scorecard"><tr><th>Лунка</th><th>Пар</th><th>Мин</th><th>Дедлайн</th></tr>';var h=parseInt(sh)||1;for(var i=0;i<18;i++){var dl=holeDeadline(st,sh,h);html+='<tr><td style="font-weight:700">'+h+'</td><td>'+holePar(h)+'</td><td>'+holeTiming(h)+'</td><td>'+fmtTime(dl)+'</td></tr>';h=h>=18?1:h+1;}html+='</table>';return html;}

const ADMIN_LOGIN='admin';
const ADMIN_PASS='pestovo2024';

function getFieldHcp(exactHcp,tee,gender){
    if(exactHcp===null||exactHcp===undefined||isNaN(exactHcp))return 0;
    gender=gender||'men';tee=tee||'wh';
    var rating=COURSE_RATINGS[gender]&&COURSE_RATINGS[gender][tee];
    var val=parseFloat(exactHcp);
    if(!rating)return Math.round(val);
    var field=(val*(rating.sr/113))+(rating.cr-TOTAL_PAR);
    return Math.round(field);
}

function fmtExactHcp(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var num = parseFloat(v);
    if (num < 0) return '+' + Math.abs(num).toFixed(1);
    return num.toFixed(1);
}

function fmtFieldHcp(v) {
    if (v === null || v === undefined || isNaN(v)) return '0';
    var num = parseInt(v);
    if (num < 0) return '+' + Math.abs(num);
    return '' + num;
}

function generateHcpTable(gender, tee) {
    var rating = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][tee];
    if (!rating) return [];
    var rows = [];
    var startExact = -5.0;
    var maxExact = 54.0;

    var curStart = startExact;
    var curField = getFieldHcp(curStart, tee, gender);

    for (var x = -4.9; x <= maxExact + 0.05; x += 0.1) {
        var exactVal = Math.round(x * 10) / 10;
        var f = getFieldHcp(exactVal, tee, gender);
        if (f !== curField) {
            var prevExact = Math.round((exactVal - 0.1) * 10) / 10;
            rows.push([
                fmtExactHcp(curStart),
                fmtExactHcp(prevExact),
                fmtFieldHcp(curField)
            ]);
            curStart = exactVal;
            curField = f;
        }
    }
    rows.push([
        fmtExactHcp(curStart),
        fmtExactHcp(maxExact),
        fmtFieldHcp(curField)
    ]);
    return rows;
}

const HCP_TABLE = {
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

function stablefordField(strokes,holeNum,fieldHcp){
    if(!strokes||strokes<1)return 0;
    var par=holePar(holeNum),hcpIdx=holeHcp(holeNum),extra=0;
    if(fieldHcp>0&&hcpIdx>0){
        extra=Math.floor(fieldHcp/18);if(hcpIdx<=(fieldHcp%18))extra++;
    }else if(fieldHcp<0&&hcpIdx>0){
        var absHcp=Math.abs(fieldHcp);
        extra=-Math.floor(absHcp/18);if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    var nett=strokes-extra,diff=nett-par;
    if(diff<=-3)return 5;if(diff===-2)return 4;if(diff===-1)return 3;if(diff===0)return 2;if(diff===1)return 1;return 0;
}

function stablefordExact(strokes,holeNum,exactHcp){
    if(!strokes||strokes<1)return 0;
    var par=holePar(holeNum),hcpIdx=holeHcp(holeNum),hcp=Math.round(parseFloat(exactHcp)||0),extra=0;
    if(hcp>0&&hcpIdx>0){
        extra=Math.floor(hcp/18);if(hcpIdx<=(hcp%18))extra++;
    }else if(hcp<0&&hcpIdx>0){
        var absHcp=Math.abs(hcp);
        extra=-Math.floor(absHcp/18);if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    var nett=strokes-extra,diff=nett-par;
    if(diff<=-3)return 5;if(diff===-2)return 4;if(diff===-1)return 3;if(diff===0)return 2;if(diff===1)return 1;return 0;
}

function calcNettScore(strokes,par,hcpIdx,fieldHcp){
    if(!strokes||strokes<1)return 0;
    var extra=0;
    if(fieldHcp>0&&hcpIdx>0){
        extra=Math.floor(fieldHcp/18);if(hcpIdx<=(fieldHcp%18))extra++;
    }else if(fieldHcp<0&&hcpIdx>0){
        var absHcp=Math.abs(fieldHcp);
        extra=-Math.floor(absHcp/18);if((19-hcpIdx)<=(absHcp%18))extra--;
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

// ==========================================
// СКОРКАРТА ПЕСТОВО (КАК НА ФОТО — 18 ЛУНОК)
// ==========================================
function generatePestovoScorecardHTML(player, roundData) {
    var p = player || {};
    var sc = p.scores || {};
    var fHcp = p.fieldHcp || 0;
    var eHcp = p.exactHcp || 0;
    var fmt = roundData.format || 'Stroke Play';
    var date = fmtDate(roundData.completedAt || roundData.createdAt);
    var startTime = fmtTime(roundData.startTime);

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
