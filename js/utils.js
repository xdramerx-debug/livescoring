// ==========================================
// ГОЛЬФ-КЛУБ ПЕСТОВО — ДАННЫЕ СО СКОРКАРТЫ
// ==========================================

const CLUB = 'Гольф-клуб Пестово';
const TOTAL_PAR = 72;
const ADDR = 'МО, г. Мытищи, Никольская ул., 1, Румянцево';

const HOLES = {
    1:  { p:4, hcp:5,  bk:373, bl:339, wh:328, rd:317 },
    2:  { p:4, hcp:13, bk:272, bl:257, wh:257, rd:250 },
    3:  { p:5, hcp:9,  bk:486, bl:475, wh:464, rd:423 },
    4:  { p:3, hcp:11, bk:192, bl:174, wh:161, rd:144 },
    5:  { p:4, hcp:1,  bk:411, bl:382, wh:370, rd:331 },
    6:  { p:4, hcp:15, bk:377, bl:345, wh:333, rd:316 },
    7:  { p:4, hcp:3,  bk:406, bl:380, wh:336, rd:308 },
    8:  { p:3, hcp:7,  bk:181, bl:165, wh:159, rd:132 },
    9:  { p:5, hcp:17, bk:507, bl:459, wh:421, rd:399 },
    10: { p:5, hcp:12, bk:491, bl:470, wh:461, rd:442 },
    11: { p:4, hcp:16, bk:382, bl:362, wh:345, rd:318 },
    12: { p:4, hcp:2,  bk:383, bl:375, wh:365, rd:322 },
    13: { p:3, hcp:18, bk:185, bl:162, wh:138, rd:123 },
    14: { p:4, hcp:4,  bk:374, bl:362, wh:327, rd:323 },
    15: { p:5, hcp:8,  bk:533, bl:517, wh:483, rd:454 },
    16: { p:4, hcp:14, bk:423, bl:391, wh:368, rd:312 },
    17: { p:3, hcp:10, bk:199, bl:188, wh:174, rd:151 },
    18: { p:4, hcp:6,  bk:375, bl:349, wh:335, rd:302 }
};

const TIMINGS = {1:15,2:15,3:20,4:12,5:15,6:15,7:15,8:12,9:20,10:20,11:15,12:15,13:12,14:15,15:20,16:15,17:12,18:15};
const TEES = {bk:'Чёрный',bl:'Синий',wh:'Белый',rd:'Красный'};

const COURSE_RATINGS = {
    men: { bk:{cr:76.0,sr:144}, bl:{cr:73.8,sr:137}, wh:{cr:72.0,sr:135}, rd:{cr:69.2,sr:134} },
    women: { bl:{cr:80.8,sr:143}, wh:{cr:78.6,sr:143}, rd:{cr:75.2,sr:136} }
};

// ==========================================
// ФУНКЦИИ ЛУНОК
// ==========================================
function holePar(h) { return HOLES[h] ? HOLES[h].p : 4; }
function holeDist(h, t) { t = t || 'wh'; return HOLES[h] ? (HOLES[h][t] || 0) : 0; }
function holeHcp(h) { return HOLES[h] ? HOLES[h].hcp : h; }
function holeTiming(h) { return TIMINGS[h] || 15; }
function fmtS(s) { if(s===null||s===undefined||isNaN(s))return'—'; if(s===0)return'E'; return s>0?'+'+s:''+s; }
function scoreClass(s) { if(s===null||s===undefined)return''; return s<0?'s-un':s>0?'s-ov':'s-ev'; }
function holeResClass(s, p) { if(!s||s<=0||!p)return''; var d=s-p; if(d<=-2)return'r-eag'; if(d===-1)return'r-bir'; if(d===0)return'r-par'; if(d===1)return'r-bog'; return'r-dbl'; }
function holeResName(s, p) { if(!s||!p)return''; if(s===1)return'Hole-in-One!'; var d=s-p; if(d<=-3)return'Альбатрос'; if(d===-2)return'Eagle'; if(d===-1)return'Birdie'; if(d===0)return'Par'; if(d===1)return'Bogey'; if(d===2)return'Double'; return'+'+d; }

// ==========================================
// UI УТИЛИТЫ
// ==========================================
function toast(m, t) { t=t||'success'; var e=document.createElement('div'); e.className='toast t-'+t; e.innerHTML=m; document.body.appendChild(e); setTimeout(function(){e.classList.add('t-show');},10); setTimeout(function(){e.classList.remove('t-show');setTimeout(function(){e.remove();},300);},4000); }
function vib(ms) { if (navigator.vibrate) navigator.vibrate(ms||50); }
function fmtDate(ts) { if(!ts)return'—'; return new Date(ts).toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'numeric'}); }
function fmtTime(ts) { if(!ts)return'—'; var d=new Date(ts),h=d.getHours(),m=d.getMinutes(); return(h<10?'0':'')+h+':'+(m<10?'0':'')+m; }
function initNav() { var tg=document.getElementById('nav-toggle'),mn=document.getElementById('nav-menu'); if(tg&&mn)tg.addEventListener('click',function(){tg.classList.toggle('active');mn.classList.toggle('open');}); window.addEventListener('scroll',function(){var n=document.getElementById('main-nav');if(n){if(window.scrollY>50)n.classList.add('nav-scrolled');else n.classList.remove('nav-scrolled');}}); }
function navAuth(u, d) { var e=document.getElementById('nav-auth'); if(!e)return; if(u&&d)e.innerHTML='<div class="nav-user"><span class="nav-uname">'+(d.name||'')+'</span><button class="btn btn-og btn-sm" onclick="doLogout()"><i class="fas fa-sign-out-alt"></i></button></div>'; else e.innerHTML='<a href="auth.html" class="btn btn-g btn-sm">Войти</a>'; }
function doLogout() { auth.signOut().then(function(){window.location.href='auth.html';}); }
function holeOrder(sh) { var o=[],h=sh||1; for(var i=0;i<18;i++){o.push(h);h=h>=18?1:h+1;} return o; }

// ==========================================
// РАСЧЁТЫ (Stableford и Stats)
// ==========================================
function getFieldHcp(exactHcp, tee, gender) {
    // Упрощенный расчет для совместимости, так как таблица огромная.
    // Если нужна точная таблица, она находится в handicap.html, здесь используем WHS формулу:
    // Field HCP = Exact HCP * (SR / 113) + (CR - Par)
    if (!exactHcp) return 0;
    gender = gender || 'men';
    tee = tee || 'wh';
    var rating = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][tee];
    if (!rating) return Math.round(exactHcp);
    var field = (exactHcp * (rating.sr / 113)) + (rating.cr - TOTAL_PAR);
    return Math.round(field);
}

function stablefordField(strokes, holeNum, fieldHcp) {
    if (!strokes || strokes < 1) return 0;
    var par = holePar(holeNum), hcpIdx = holeHcp(holeNum), extra = 0;
    if (fieldHcp > 0 && hcpIdx > 0) { extra = Math.floor(fieldHcp/18); if (hcpIdx <= (fieldHcp%18)) extra++; }
    var nett = strokes - extra, diff = nett - par;
    if (diff <= -3) return 5; if (diff === -2) return 4; if (diff === -1) return 3; if (diff === 0) return 2; if (diff === 1) return 1; return 0;
}

function stablefordExact(strokes, holeNum, exactHcp) {
    if (!strokes || strokes < 1) return 0;
    var par = holePar(holeNum), hcpIdx = holeHcp(holeNum), hcp = Math.round(parseFloat(exactHcp)||0), extra = 0;
    if (hcp > 0 && hcpIdx > 0) { extra = Math.floor(hcp/18); if (hcpIdx <= (hcp%18)) extra++; }
    var nett = strokes - extra, diff = nett - par;
    if (diff <= -3) return 5; if (diff === -2) return 4; if (diff === -1) return 3; if (diff === 0) return 2; if (diff === 1) return 1; return 0;
}

function calcNettScore(strokes, par, hcpIdx, fieldHcp) {
    if (!strokes || strokes < 1) return 0;
    var extra = 0;
    if (fieldHcp > 0 && hcpIdx > 0) { extra = Math.floor(fieldHcp/18); if (hcpIdx <= (fieldHcp%18)) extra++; }
    return strokes - extra;
}

function calcRoundStats(scores, fieldHcp, exactHcp, holesOrder) {
    holesOrder = holesOrder || [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
    var played=[], remaining=[], gross=0, parPlayed=0, netTotal=0, stblField=0, stblExact=0;
    var birdies=0, eagles=0, pars=0, bogeys=0, doubles=0, hio=0, currentHole=null;

    for (var i = 0; i < holesOrder.length; i++) {
        var h = holesOrder[i], s = scores[h] ? parseInt(scores[h]) : 0, par = holePar(h);
        if (s >= 1) {
            played.push(h); gross += s; parPlayed += par;
            netTotal += calcNettScore(s, par, holeHcp(h), fieldHcp||0);
            var diff = s - par;
            if (diff <= -2) eagles++; else if (diff === -1) birdies++; else if (diff === 0) pars++; else if (diff === 1) bogeys++; else doubles++;
            if (s === 1) hio++;
            stblField += stablefordField(s, h, fieldHcp||0);
            stblExact += stablefordExact(s, h, exactHcp||0);
        } else {
            remaining.push(h);
            if (currentHole === null) currentHole = h;
        }
    }
    var toPar = played.length > 0 ? gross - parPlayed : null;
    return { played:played, remaining:remaining, holesPlayed:played.length, currentHole:currentHole, gross:gross, toPar:toPar, net:netTotal, stablefordField:stblField, stablefordExact:stblExact, birdies:birdies, eagles:eagles, pars:pars, holeInOne:hio };
}

// ==========================================
// ТОЧНАЯ СКОРКАРТА ПЕСТОВО (КАК НА ФОТО)
// Для HTML-представления и PDF печати
// ==========================================

function generatePestovoScorecardHTML(player, roundData, isPrint) {
    var p = player;
    var sc = p.scores || {};
    var fHcp = p.fieldHcp || 0;
    var eHcp = p.exactHcp || 0;
    var fmt = roundData.format || 'Stroke Play';
    var date = fmtDate(roundData.completedAt || roundData.createdAt);
    var startTime = fmtTime(roundData.startTime);
    var tee = roundData.tee || 'wh';

    // Подсчёты
    var outGross=0, inGross=0, outStbl=0, inStbl=0;
    for(var i=1;i<=9;i++){var s=parseInt(sc[i])||0;if(s>0){outGross+=s;outStbl+=stablefordField(s,i,fHcp);}}
    for(var i=10;i<=18;i++){var s=parseInt(sc[i])||0;if(s>0){inGross+=s;inStbl+=stablefordField(s,i,fHcp);}}
    var totGross = outGross + inGross;
    var totStbl = outStbl + inStbl;

    // Шапка как на фото
    var html = '<div class="pestovo-card-wrap">';
    html += '<div class="pc-header">';
    html += '<div class="pc-col"><div><strong>Игрок:</strong> ' + (p.name||'—') + '</div><div><strong>Турнир:</strong> ' + (roundData.tournamentName||'—') + '</div></div>';
    html += '<div class="pc-col"><div><strong>Формат:</strong> ' + fmt + '</div></div>';
    html += '<div class="pc-col"><div><strong>Точный гандикап:</strong> ' + (eHcp||'—') + '</div></div>';
    html += '<div class="pc-col"><div><strong>Раунд:</strong> ' + (roundData.startHole===10?'2':'1') + '</div><div><strong>Время старта:</strong> ' + startTime + '</div><div><strong>Дата:</strong> ' + date + '</div></div>';
    html += '</div>';

    // ОСНОВНАЯ ТАБЛИЦА (18 лунок в ряд)
    html += '<div class="pc-table-wrap"><table class="pc-table">';
    
    // 1. Строка заголовков
    html += '<tr><th class="pc-lbl">ТИ</th><th class="pc-lbl">Лунка</th>';
    for(var i=1;i<=9;i++) html += '<th>'+i+'</th>';
    html += '<th class="pc-tot">Аут</th>';
    for(var i=10;i<=18;i++) html += '<th>'+i+'</th>';
    html += '<th class="pc-tot">Ин</th><th class="pc-tot">Итого</th></tr>';

    // 2. Черный ти
    html += '<tr><td colspan="2" class="pc-lbl" style="background:#000;color:#fff;">Чёрный</td>';
    for(var i=1;i<=9;i++) html += '<td>'+HOLES[i].bk+'</td>';
    html += '<td class="pc-tot">3205</td>';
    for(var i=10;i<=18;i++) html += '<td>'+HOLES[i].bk+'</td>';
    html += '<td class="pc-tot">3345</td><td class="pc-tot">6550</td></tr>';

    // 3. Синий ти
    html += '<tr><td colspan="2" class="pc-lbl" style="background:#2980b9;color:#fff;">Синий</td>';
    for(var i=1;i<=9;i++) html += '<td>'+HOLES[i].bl+'</td>';
    html += '<td class="pc-tot">2976</td>';
    for(var i=10;i<=18;i++) html += '<td>'+HOLES[i].bl+'</td>';
    html += '<td class="pc-tot">3176</td><td class="pc-tot">6152</td></tr>';

    // 4. Белый ти
    html += '<tr><td colspan="2" class="pc-lbl">Белый</td>';
    for(var i=1;i<=9;i++) html += '<td>'+HOLES[i].wh+'</td>';
    html += '<td class="pc-tot">2829</td>';
    for(var i=10;i<=18;i++) html += '<td>'+HOLES[i].wh+'</td>';
    html += '<td class="pc-tot">2996</td><td class="pc-tot">5825</td></tr>';

    // 5. Красный ти
    html += '<tr><td colspan="2" class="pc-lbl" style="background:#c0392b;color:#fff;">Красный</td>';
    for(var i=1;i<=9;i++) html += '<td>'+HOLES[i].rd+'</td>';
    html += '<td class="pc-tot">2620</td>';
    for(var i=10;i<=18;i++) html += '<td>'+HOLES[i].rd+'</td>';
    html += '<td class="pc-tot">2747</td><td class="pc-tot">5367</td></tr>';

    // 6. Пар
    html += '<tr><td colspan="2" class="pc-lbl pc-par">Пар</td>';
    for(var i=1;i<=9;i++) html += '<td class="pc-par">'+HOLES[i].p+'</td>';
    html += '<td class="pc-tot pc-par">36</td>';
    for(var i=10;i<=18;i++) html += '<td class="pc-par">'+HOLES[i].p+'</td>';
    html += '<td class="pc-tot pc-par">36</td><td class="pc-tot pc-par">72</td></tr>';

    // 7. Индекс
    html += '<tr><td colspan="2" class="pc-lbl pc-idx">Индекс</td>';
    for(var i=1;i<=9;i++) html += '<td class="pc-idx">'+HOLES[i].hcp+'</td>';
    html += '<td class="pc-idx"></td>';
    for(var i=10;i<=18;i++) html += '<td class="pc-idx">'+HOLES[i].hcp+'</td>';
    html += '<td class="pc-idx"></td><td class="pc-idx"></td></tr>';

    // 8. СЧЁТ ИГРОКА (пустые квадраты)
    html += '<tr><td colspan="2" class="pc-lbl pc-score-lbl">Счёт</td>';
    for(var i=1;i<=9;i++) {
        var s = parseInt(sc[i])||'';
        html += '<td class="pc-score-box"><b>' + s + '</b></td>';
    }
    html += '<td class="pc-tot pc-score-box"><b>'+(outGross||'')+'</b></td>';
    for(var i=10;i<=18;i++) {
        var s = parseInt(sc[i])||'';
        html += '<td class="pc-score-box"><b>' + s + '</b></td>';
    }
    html += '<td class="pc-tot pc-score-box"><b>'+(inGross||'')+'</b></td><td class="pc-tot pc-score-box"><b>'+(totGross||'')+'</b></td></tr>';

    // 9. STABLEFORD (опционально)
    if (fmt.toLowerCase().indexOf('stableford') !== -1) {
        html += '<tr><td colspan="2" class="pc-lbl">Очки (Stblfd)</td>';
        for(var i=1;i<=9;i++) {
            var s = parseInt(sc[i])||0;
            html += '<td>' + (s>0?stablefordField(s,i,fHcp):'') + '</td>';
        }
        html += '<td class="pc-tot">'+(outStbl||'')+'</td>';
        for(var i=10;i<=18;i++) {
            var s = parseInt(sc[i])||0;
            html += '<td>' + (s>0?stablefordField(s,i,fHcp):'') + '</td>';
        }
        html += '<td class="pc-tot">'+(inStbl||'')+'</td><td class="pc-tot"><b>'+(totStbl||'')+'</b></td></tr>';
    }

    html += '</table></div>';

    // Подписи снизу
    html += '<div class="pc-footer">';
    html += '<div><strong>Подписи:</strong> Игрок ___________________</div>';
    html += '<div>Маркер ___________________</div>';
    html += '<div>Судья ___________________</div>';
    html += '</div>';

    html += '</div>';
    return html;
}

// ==========================================
// ПЕЧАТЬ И СКАЧИВАНИЕ PDF
// ==========================================
function downloadScorecard(roundId) {
    db.ref('rounds/'+roundId).once('value').then(function(sn){
        var r=sn.val();if(!r){toast('Раунд не найден','error');return;}
        var pl=r.players||{};
        var w=window.open('','_blank');
        
        // CSS специально для печати (принудительно чёрный цвет и границы)
        var css = `
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .pestovo-card-wrap { border: 2px solid #000; border-radius: 8px; padding: 16px; margin-bottom: 30px; page-break-inside: avoid; }
            .pc-header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; font-size: 12px; }
            .pc-col { display: flex; flex-direction: column; gap: 4px; }
            .pc-table { width: 100%; border-collapse: collapse; text-align: center; font-size: 11px; }
            .pc-table th, .pc-table td { border: 1px solid #000; padding: 6px 2px; }
            .pc-table th { background: #e0e0e0; font-weight: bold; }
            .pc-lbl { text-align: left; padding-left: 8px; font-weight: bold; width: 60px; }
            .pc-tot { background: #f5f5f5; font-weight: bold; }
            .pc-par { background: #d4edda; }
            .pc-idx { color: #555; font-size: 10px; }
            .pc-score-lbl { font-size: 14px; text-transform: uppercase; }
            .pc-score-box { height: 28px; font-size: 16px; color: #000 !important; }
            .pc-footer { display: flex; justify-content: space-between; margin-top: 20px; font-size: 12px; font-weight: bold; }
        `;

        var h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Счётная карточка</title><style>'+css+'</style></head><body>';
        
        Object.values(pl).forEach(function(p) {
            h += generatePestovoScorecardHTML(p, r, true);
        });
        
        h += '</body></html>';
        w.document.write(h);
        w.document.close();
        setTimeout(function(){ w.print(); }, 500);
    });
}
