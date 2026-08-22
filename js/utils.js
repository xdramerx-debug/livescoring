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

const HCP_TABLE = {
    men: {
        bk: [['+3.5','+2.8',0],['+2.7','+2.0',1],['+1.9','+1.2',2],['+1.1','+0.4',3],['+0.3','0.3',4],['0.4','1.1',5],['1.2','1.9',6],['2.0','2.7',7],['2.8','3.5',8],['3.6','4.3',9],['4.4','5.1',10],['5.2','5.8',11],['5.9','6.6',12],['6.7','7.4',13],['7.5','8.2',14],['8.3','9.0',15],['9.1','9.8',16],['9.9','10.5',17],['10.6','11.3',18],['11.4','12.1',19],['12.2','12.9',20],['13.0','13.7',21],['13.8','14.5',22],['14.6','15.3',23],['15.4','16.0',24],['16.1','16.8',25],['16.9','17.6',26],['17.7','18.4',27],['18.5','19.2',28],['19.3','20.0',29],['20.1','20.7',30],['20.8','21.5',31],['21.6','22.3',32],['22.4','23.1',33],['23.2','23.9',34],['24.0','24.7',35],['24.8','25.5',36],['25.6','26.2',37],['26.3','27.0',38],['27.1','27.8',39],['27.9','28.6',40],['28.7','29.4',41],['29.5','30.2',42],['30.3','30.9',43],['31.0','31.7',44],['31.8','32.5',45],['32.6','33.3',46],['33.4','34.1',47],['34.2','34.9',48],['35.0','35.7',49],['35.8','36.4',50],['36.5','37.2',51],['37.3','38.0',52],['38.1','38.8',53],['38.9','39.6',54],['39.7','40.4',55],['40.5','41.1',56],['41.2','41.9',57],['42.0','42.7',58],['42.8','43.5',59],['43.6','44.3',60],['44.4','45.1',61],['45.2','45.9',62],['46.0','46.6',63],['46.7','47.4',64],['47.5','48.2',65],['48.3','49.0',66],['49.1','49.8',67],['49.9','50.6',68],['50.7','51.3',69],['51.4','52.1',70],['52.2','52.9',71],['53.0','53.7',72],['53.8','54.0',73]],
        bl: [['+3.5','+2.8',0],['+2.7','+1.9',1],['+1.8','+1.1',2],['+1.0','+0.3',3],['+0.2','0.5',4],['0.6','1.4',5],['1.5','2.2',6],['2.3','3.0',7],['3.1','3.8',8],['3.9','4.7',9],['4.8','5.6',10],['5.6','6.3',11],['6.4','7.1',12],['7.2','8.0',13],['8.1','8.8',14],['8.9','9.6',15],['9.7','10.4',16],['10.5','11.3',17],['11.4','12.2',18],['12.2','12.9',19],['13.0','13.7',20],['13.8','14.5',21],['14.6','15.4',22],['15.5','16.2',23],['16.3','17.0',24],['17.1','17.8',25],['17.9','18.7',26],['18.8','19.5',27],['19.6','20.3',28],['20.4','21.1',29],['21.2','22.0',30],['22.1','22.8',31],['22.9','23.6',32],['23.7','24.4',33],['24.5','25.3',34],['25.4','26.1',35],['26.2','26.9',36],['27.0','27.7',37],['27.8','28.6',38],['28.7','29.4',39],['29.5','30.2',40],['30.3','31.0',41],['31.1','31.9',42],['32.0','32.7',43],['32.8','33.5',44],['33.6','34.3',45],['34.4','35.2',46],['35.3','36.0',47],['36.1','36.8',48],['36.9','37.6',49],['37.7','38.5',50],['38.6','39.3',51],['39.4','40.1',52],['40.2','40.9',53],['41.0','41.8',54],['41.9','42.6',55],['42.7','43.4',56],['43.5','44.2',57],['44.3','45.1',58],['45.2','45.9',59],['46.0','46.7',60],['46.8','47.5',61],['47.6','48.4',62],['48.5','49.2',63],['49.3','50.0',64],['50.1','50.8',65],['50.9','51.7',66],['51.8','52.5',67],['52.6','53.3',68],['53.4','54.0',69]],
        wh: [['+3.7','+3.0',0],['+2.9','+2.1',1],['+2.0','+1.3',2],['+1.2','+0.5',3],['+0.4','0.4',4],['0.5','1.2',5],['1.3','2.0',6],['2.1','2.9',7],['2.8','3.5',8],['3.7','4.4',9],['4.5','5.3',10],['5.4','6.1',11],['6.2','6.9',12],['7.0','7.8',13],['7.9','8.6',14],['8.7','9.5',15],['9.6','10.3',16],['10.4','11.2',17],['11.3','12.0',18],['12.1','12.9',19],['13.0','13.7',20],['13.8','14.5',21],['14.6','15.4',22],['15.5','16.2',23],['16.3','17.1',24],['17.2','17.9',25],['18.0','18.8',26],['18.9','19.6',27],['19.7','20.5',28],['20.6','21.3',29],['21.4','22.1',30],['22.2','23.0',31],['23.1','23.8',32],['23.9','24.6',33],['24.7','25.5',34],['25.6','26.3',35],['26.4','27.2',36],['27.3','28.0',37],['28.1','28.8',38],['28.9','29.7',39],['29.8','30.5',40],['30.6','31.3',41],['31.4','32.2',42],['32.3','33.0',43],['33.1','33.9',44],['34.0','34.7',45],['34.8','35.5',46],['35.6','36.4',47],['36.5','37.2',48],['37.3','38.0',49],['38.1','38.9',50],['39.0','39.7',51],['39.8','40.5',52],['40.6','41.4',53],['41.5','42.2',54],['42.3','43.0',55],['43.1','43.8',56],['43.9','44.7',57],['44.8','45.5',58],['45.6','46.3',59],['46.4','47.2',60],['47.3','48.0',61],['48.1','48.8',62],['48.9','49.7',63],['49.8','50.5',64],['50.6','51.4',65]],
        rd: [['+3.1','+2.3',0],['+2.2','+1.5',1],['+1.4','+0.6',2],['+0.5','0.2',3],['0.3','1.0',4],['1.1','1.9',5],['2.0','2.7',6],['2.8','3.5',7],['3.7','4.4',8],['4.5','5.3',9],['5.4','6.1',10],['6.2','6.9',11],['7.0','7.8',12],['7.9','8.6',13],['8.7','9.5',14],['9.6','10.3',15],['10.4','11.2',16],['11.3','12.0',17],['12.1','12.9',18],['13.0','13.7',19],['13.8','14.5',20],['14.6','15.4',21],['15.5','16.2',22],['16.3','17.1',23],['17.2','17.9',24],['18.0','18.8',25],['18.9','19.6',26],['19.7','20.5',27],['20.6','21.3',28],['21.4','22.1',29],['22.2','23.0',30],['23.1','23.8',31],['23.9','24.6',32],['24.7','25.5',33],['25.6','26.3',34],['26.4','27.2',35],['27.3','28.0',36],['28.1','28.8',37],['28.9','29.7',38],['29.8','30.5',39],['30.6','31.3',40]]
    },
    women: {
        bl: [['+6.8','+6.2',0],['+6.1','+5.4',1],['+5.3','+4.7',2],['+4.6','+4.0',3],['+3.9','+3.2',4],['+3.1','+2.5',5],['+2.4','+1.7',6],['+1.6','+0.9',7],['+0.9','0.3',8],['0.3','1.0',9],['1.0','1.7',10],['1.7','2.4',11],['2.4','3.1',12],['3.1','3.8',13],['3.9','4.5',14],['4.6','5.3',15],['5.3','6.0',16],['6.0','6.7',17],['6.8','7.4',18],['7.5','8.2',19],['8.2','8.9',20]],
        wh: [['+5.6','+4.9',0],['+4.8','+4.1',1],['+4.0','+3.3',2],['+3.2','+2.5',3],['+2.4','+1.7',4],['+1.6','+0.9',5],['+0.8','+0.1',6],['0.0','0.7',7],['0.8','1.5',8],['1.6','2.3',9],['2.4','3.1',10],['3.2','3.9',11],['4.0','4.7',12],['4.8','5.5',13],['5.6','6.3',14],['6.4','7.1',15],['7.2','7.9',16],['8.0','8.7',17],['8.8','9.5',18],['9.6','10.3',19],['10.4','11.1',20]],
        rd: [['+3.0','+2.3',0],['+2.2','+1.5',1],['+1.4','+0.6',2],['+0.5','0.2',3],['0.3','1.0',4],['1.1','1.9',5],['2.0','2.7',6],['2.8','3.5',7],['3.7','4.4',8],['4.5','5.3',9],['5.4','6.1',10],['6.2','6.9',11],['7.0','7.8',12],['7.9','8.6',13],['8.7','9.5',14],['9.6','10.3',15]]
    }
};

function holePar(h){return HOLES[h]?HOLES[h].p:4;}
function holeDist(h,t){t=t||'wh';return HOLES[h]?(HOLES[h][t]||0):0;}
function holeHcp(h){return HOLES[h]?HOLES[h].hcp:h;}
function holeTiming(h){return TIMINGS[h]||15;}

function parseHcpVal(str){if(typeof str==='number')return str;str=String(str).trim();if(str.charAt(0)==='+')return -parseFloat(str.substring(1));return parseFloat(str);}

function getFieldHcp(exactHcp,tee,gender){
    gender=gender||'men';tee=tee||'wh';
    var table=HCP_TABLE[gender]&&HCP_TABLE[gender][tee];
    if(!table)return 0;
    var val=parseFloat(exactHcp);
    if(isNaN(val))return 0;
    for(var i=0;i<table.length;i++){
        var row=table[i],from=parseHcpVal(row[0]),to=parseHcpVal(row[1]);
        if(val>=Math.min(from,to)&&val<=Math.max(from,to))return row[2];
    }
    return table[table.length-1][2];
}

function stablefordField(strokes,holeNum,fieldHcp){
    if(!strokes||strokes<1)return 0;
    var par=holePar(holeNum),hcpIdx=holeHcp(holeNum),extra=0;
    if(fieldHcp>0&&hcpIdx>0){extra=Math.floor(fieldHcp/18);if(hcpIdx<=(fieldHcp%18))extra++;}
    var nett=strokes-extra,diff=nett-par;
    if(diff<=-3)return 5;if(diff===-2)return 4;if(diff===-1)return 3;if(diff===0)return 2;if(diff===1)return 1;return 0;
}

function stablefordExact(strokes,holeNum,exactHcp){
    if(!strokes||strokes<1)return 0;
    var par=holePar(holeNum),hcpIdx=holeHcp(holeNum),hcp=Math.round(parseFloat(exactHcp)||0),extra=0;
    if(hcp>0&&hcpIdx>0){extra=Math.floor(hcp/18);if(hcpIdx<=(hcp%18))extra++;}
    var nett=strokes-extra,diff=nett-par;
    if(diff<=-3)return 5;if(diff===-2)return 4;if(diff===-1)return 3;if(diff===0)return 2;if(diff===1)return 1;return 0;
}

function calcNettScore(strokes,par,hcpIdx,fieldHcp){
    if(!strokes||strokes<1)return 0;
    var extra=0;
    if(fieldHcp>0&&hcpIdx>0){extra=Math.floor(fieldHcp/18);if(hcpIdx<=(fieldHcp%18))extra++;}
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
    var parRemaining=0;
    for(var i=0;i<remaining.length;i++)parRemaining+=holePar(remaining[i]);
    var projected=played.length>0?gross+parRemaining:null;

    return{played:played,remaining:remaining,holesPlayed:played.length,holesRemaining:remaining.length,currentHole:currentHole,gross:gross,parPlayed:parPlayed,toPar:toPar,net:netTotal,netToPar:netToPar,stablefordField:stblField,stablefordExact:stblExact,projected:projected,birdies:birdies,eagles:eagles,pars:pars,bogeys:bogeys,doubles:doubles,holeInOne:hio};
}

function holeDeadline(startTime,startHole,targetHole){if(!startTime)return null;var t=0,h=startHole,c=0;while(c<18){t+=holeTiming(h);if(h===targetHole)break;h=h>=18?1:h+1;c++;}return startTime+t*60000;}
function checkTiming(startTime,startHole,holeNum){var dl=holeDeadline(startTime,startHole,holeNum);if(!dl)return{status:'ok',diff:0,deadline:null};var now=Date.now(),d=Math.round((now-dl)/60000);if(d>5)return{status:'late',diff:d,deadline:dl};if(d>0)return{status:'warning',diff:d,deadline:dl};return{status:'ok',diff:d,deadline:dl};}
function fmtTime(ts){if(!ts)return'—';var d=new Date(ts),h=d.getHours(),m=d.getMinutes();return(h<10?'0':'')+h+':'+(m<10?'0':'')+m;}
function buildTimingNotice(st,sh,ch){var c=checkTiming(st,sh,ch);if(!c.deadline)return'';var dl=fmtTime(c.deadline),nw=fmtTime(Date.now());if(c.status==='late')return'<div class="timing-alert timing-late"><i class="fas fa-exclamation-triangle"></i><div><strong>Отставание!</strong><br>Лунка '+ch+': дедлайн '+dl+', сейчас '+nw+' ('+c.diff+' мин.)</div></div>';if(c.status==='warning')return'<div class="timing-alert timing-warn"><i class="fas fa-clock"></i><div><strong>Близко к дедлайну</strong><br>Лунка '+ch+': '+dl+'</div></div>';var a=Math.abs(c.diff);return'<div class="timing-alert timing-ok"><i class="fas fa-check-circle"></i><div>Лунка '+ch+': в графике'+(a>0?' (запас '+a+' мин.)':'')+'</div></div>';}
function buildTimingTable(st,sh){if(!st)return'';var html='<table class="scorecard"><tr><th>Лунка</th><th>Пар</th><th>Мин</th><th>Дедлайн</th></tr>';var h=sh;for(var i=0;i<18;i++){var dl=holeDeadline(st,sh,h);html+='<tr><td style="font-weight:700">'+h+'</td><td>'+holePar(h)+'</td><td>'+holeTiming(h)+'</td><td>'+fmtTime(dl)+'</td></tr>';h=h>=18?1:h+1;}html+='</table>';return html;}

function fmtScore(s){if(s===null||s===undefined||isNaN(s))return'—';if(s===0)return'E';return s>0?'+'+s:''+s;}
function scoreClass(s){if(s===null||s===undefined)return'';return s<0?'s-un':s>0?'s-ov':'s-ev';}
function holeResClass(s,p){if(!s||s<1||!p)return'';var d=s-p;if(d<=-2)return'r-eag';if(d===-1)return'r-bir';if(d===0)return'r-par';if(d===1)return'r-bog';return'r-dbl';}
function holeResName(s,p){if(!s||!p)return'';if(s===1)return'Hole-in-One!';var d=s-p;if(d<=-3)return'Альбатрос';if(d===-2)return'Eagle';if(d===-1)return'Birdie';if(d===0)return'Par';if(d===1)return'Bogey';if(d===2)return'Double';return'+'+d;}
function fmtDate(ts){if(!ts)return'—';return new Date(ts).toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'numeric'});}

function toast(m,t){t=t||'success';var e=document.createElement('div');e.className='toast t-'+t;e.innerHTML=m;document.body.appendChild(e);setTimeout(function(){e.classList.add('t-show');},10);setTimeout(function(){e.classList.remove('t-show');setTimeout(function(){e.remove();},300);},4000);}
function vib(ms){if(navigator.vibrate)navigator.vibrate(ms||50);}
function initNav(){var tg=document.getElementById('nav-toggle'),mn=document.getElementById('nav-menu');if(tg&&mn)tg.addEventListener('click',function(){tg.classList.toggle('active');mn.classList.toggle('open');});window.addEventListener('scroll',function(){var n=document.getElementById('main-nav');if(n){if(window.scrollY>50)n.classList.add('nav-scrolled');else n.classList.remove('nav-scrolled');}});}
function navAuth(u,d){var e=document.getElementById('nav-auth');if(!e)return;if(u&&d)e.innerHTML='<div class="nav-user"><span class="nav-uname">'+(d.name||'')+'</span><button class="btn btn-og btn-sm" onclick="doLogout()"><i class="fas fa-sign-out-alt"></i></button></div>';else e.innerHTML='<a href="auth.html" class="btn btn-g btn-sm">Войти</a>';}
function doLogout(){auth.signOut().then(function(){window.location.href='auth.html';});}
function holeOrder(sh){var o=[],h=sh||1;for(var i=0;i<18;i++){o.push(h);h=h>=18?1:h+1;}return o;}

const ADMIN_LOGIN='admin';
const ADMIN_PASS='pestovo2024';

function downloadScorecard(roundId){
    db.ref('rounds/'+roundId).once('value').then(function(sn){
        var r=sn.val();if(!r){toast('Раунд не найден','error');return;}
        var pl=r.players||{},tee=r.tee||'wh',fmt=r.format||'Stroke Play';
        var w=window.open('','_blank');
        var css='body{font-family:Arial,sans-serif;padding:20px;color:#333}h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;color:#1a472a;margin:18px 0 8px}.inf{font-size:12px;color:#666;margin-bottom:14px}table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px}th,td{border:1px solid #ccc;padding:5px 4px;text-align:center}th{background:#1a472a;color:#fff;font-size:10px}.pr td{background:#e8f5e9;font-weight:700}.hc td{background:#f5f5f5;color:#999;font-size:9px}.tot{font-weight:900;background:#f9f3e3}.sig{display:flex;gap:30px;margin-top:28px}.sig-b{flex:1;text-align:center}.sig-l{border-bottom:2px solid #333;height:36px;margin-bottom:5px}.sig-t{font-size:10px;color:#666}';
        var h='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Счётная карточка</title><style>'+css+'</style></head><body>';
        h+='<h1>⛳ Гольф-клуб Пестово</h1>';
        h+='<div class="inf">'+fmt+' · ТИ: '+TEES[tee]+' · '+fmtDate(r.completedAt||r.createdAt)+'</div>';
        Object.entries(pl).forEach(function(pe){
            var p=pe[1],sc=p.scores||{},name=p.name||'Игрок';
            var stats=calcRoundStats(sc,p.fieldHcp||0,p.exactHcp||0);
            h+='<h2>Счётная карточка '+name+'</h2>';
            h+='<div class="inf">HCP: '+(p.exactHcp||'—')+' · Полевой: '+(p.fieldHcp||0)+' · Gross: '+(stats.gross||'—')+' ('+fmtScore(stats.toPar)+') · Net: '+stats.net+' · Stblfd: '+stats.stablefordField+'</div>';
        });
        h+='<div class="sig"><div class="sig-b"><div class="sig-l"></div><div class="sig-t">Игрок</div></div><div class="sig-b"><div class="sig-l"></div><div class="sig-t">Маркер</div></div><div class="sig-b"><div class="sig-l"></div><div class="sig-t">Судья</div></div></div>';
        h+='</body></html>';w.document.write(h);w.document.close();setTimeout(function(){w.print();},500);
    });
}

function saveHistoryEntry(userId, roundId, rd, p, stats) {
    var sc = p.scores || {};
    var fH = p.fieldHcp || 0;
    var eH = p.exactHcp || 0;

    // Сохраняем раунд в историю в любом случае (даже 9 лунок)
    db.ref('users/' + userId + '/history').push({
        roundId: roundId,
        date: rd.completedAt || Date.now(),
        tee: rd.tee || 'wh',
        format: rd.format || 'Stroke Play',
        mode: rd.mode || 'group',
        startHole: rd.startHole || 1,
        gross: stats.gross,
        toPar: stats.toPar,
        net: stats.net,
        netToPar: stats.netToPar,
        stablefordField: stats.stablefordField,
        stablefordExact: stats.stablefordExact,
        holes: stats.holesPlayed,
        scores: sc,
        birdies: stats.birdies,
        eagles: stats.eagles,
        pars: stats.pars,
        holeInOne: stats.holeInOne,
        exactHcp: eH,
        fieldHcp: fH,
        gender: p.gender || 'men'
    });

    // Увеличиваем счетчик сыгранных раундов
    db.ref('users/' + userId + '/roundsPlayed').transaction(function(v) {
        return (v || 0) + 1;
    });

    // ОБНОВЛЯЕМ РЕКОРДЫ ТОЛЬКО ЕСЛИ СЫГРАНО 18 ЛУНОК!
    if (stats.holesPlayed === 18) {
        db.ref('users/' + userId + '/bestGross').transaction(function(v) {
            if (!v || stats.gross < v) return stats.gross;
            return v;
        });
        db.ref('users/' + userId + '/bestStableford').transaction(function(v) {
            if (!v || stats.stablefordField > v) return stats.stablefordField;
            return v;
        });
    }
}

function saveHistoryEntry(userId,roundId,rd,p,stats){
    db.ref('users/'+userId+'/history').push({roundId:roundId,date:rd.completedAt||Date.now(),tee:rd.tee||'wh',format:rd.format||'Stroke Play',mode:rd.mode||'group',startHole:rd.startHole||1,gross:stats.gross,toPar:stats.toPar,net:stats.net,netToPar:stats.netToPar,stablefordField:stats.stablefordField,stablefordExact:stats.stablefordExact,holes:stats.holesPlayed,scores:p.scores||{},birdies:stats.birdies,eagles:stats.eagles,pars:stats.pars,holeInOne:stats.holeInOne,exactHcp:p.exactHcp||0,fieldHcp:p.fieldHcp||0,gender:p.gender||'men'});
    db.ref('users/'+userId+'/roundsPlayed').transaction(function(v){return(v||0)+1;});
    db.ref('users/'+userId+'/bestGross').transaction(function(v){if(!v||stats.gross<v)return stats.gross;return v;});
    db.ref('users/'+userId+'/bestStableford').transaction(function(v){if(!v||stats.stablefordField>v)return stats.stablefordField;return v;});
}
