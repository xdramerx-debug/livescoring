// Formatting helpers: score + date/time (moved from utils.js)
// Loaded before utils.js on every page (and bundled into src/format.js).
// Uses global t()/currentLang (i18n) only at call time, so load order inside
// the foundation group does not matter.
function fmtScore(s){if(s===null||s===undefined||isNaN(s))return'—';if(s===0)return'E';return s>0?'+'+s:''+s;}
function scoreClass(s){if(s===null||s===undefined)return'';return s<0?'s-un':s>0?'s-ov':'s-ev';}
function holeResClass(s,p){if(!s||s<1||!p)return'';var d=s-p;if(d<=-2)return'r-eag';if(d===-1)return'r-bir';if(d===0)return'r-par';if(d===1)return'r-bog';return'r-dbl';}
function holeResName(s,p){
    if(!s||!p)return'';
    if(s===1)return t('res_hio');
    var d=s-p;
    if(d<=-3)return t('res_albatross');
    if(d===-2)return t('res_eagle');
    if(d===-1)return t('res_birdie');
    if(d===0)return t('res_par');
    if(d===1)return t('res_bogey');
    if(d===2)return t('res_double');
    return '+'+d;
}

function fmtDate(ts){
    if(!ts)return'—';
    var lang = (typeof currentLang !== 'undefined' && currentLang) ? currentLang : 'ru';
    try {
        return new Date(ts).toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU',{day:'2-digit',month:'short',year:'numeric'});
    } catch(e) {
        var d=new Date(ts); return (d.getDate()<10?'0':'')+d.getDate()+'.'+((d.getMonth()+1)<10?'0':'')+(d.getMonth()+1)+'.'+d.getFullYear();
    }
}
function fmtTime(ts){
    if(ts===null||ts===undefined||ts==='')return'—';
    // Время «как есть» («07:25», «7:25:00») — так хранятся старты турнирных
    // групп; раньше уходит в Invalid Date и на экране появлялось «NaN:NaN».
    var hm=/^(\d{1,2}):(\d{2})(:\d{2})?$/.exec(String(ts).trim());
    if(hm){
        var hh=parseInt(hm[1],10),mm=parseInt(hm[2],10);
        if(hh>=0&&hh<24&&mm>=0&&mm<60)return(hh<10?'0':'')+hh+':'+(mm<10?'0':'')+mm;
    }
    // Секунды вместо миллисекунд (старые записи) — приводим к миллисекундам.
    var value=(typeof normalizeTimestampMs==='function')?normalizeTimestampMs(ts):Number(ts);
    if(!value||!isFinite(value))return'—';
    try {
        var d=new Date(value),h=d.getHours(),m=d.getMinutes();
        if(isNaN(h)||isNaN(m))return'—';
        return(h<10?'0':'')+h+':'+(m<10?'0':'')+m;
    } catch(e){ return '—'; }
}

// Дата турнира из input[type=date] («YYYY-MM-DD») в timestamp.
// new Date('2026-09-15') парсится как UTC-полночь и в Москве показывает 14-е,
// поэтому разбираем строку как ЛОКАЛЬНУЮ дату (полдень — защита от DST-сдвигов).
// Числовой timestamp и прочие форматы возвращаем как есть через Date.parse.
function tnDateTs(dateStr) {
    if (typeof dateStr === 'number' && isFinite(dateStr)) return dateStr;
    var s = String(dateStr == null ? '' : dateStr).trim();
    if (!s) return NaN;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
        var ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0).getTime();
        return isNaN(ts) ? NaN : ts;
    }
    var parsed = Date.parse(s);
    return isNaN(parsed) ? NaN : parsed;
}

// Сравнивает дату раунда с текущим локальным днём. Старые записи могли
// хранить timestamp в секундах, поэтому принимаем оба формата.
function normalizeTimestampMs(ts) {
    if (ts instanceof Date) return ts.getTime() || 0;
    var value = Number(ts);
    if (!isFinite(value) || value <= 0) {
        value = (typeof ts === 'string') ? Date.parse(ts) : 0;
    }
    if (value > 0 && value < 100000000000) value *= 1000;
    return isFinite(value) && value > 0 ? value : 0;
}

function isTodayTimestamp(ts, nowTs) {
    var value = normalizeTimestampMs(ts);
    if (!value) return false;
    var current = new Date(normalizeTimestampMs(nowTs || Date.now()));
    var date = new Date(value);
    return !isNaN(date.getTime()) && !isNaN(current.getTime()) &&
        date.getFullYear() === current.getFullYear() &&
        date.getMonth() === current.getMonth() &&
        date.getDate() === current.getDate();
}
