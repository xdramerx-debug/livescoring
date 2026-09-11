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
const TEE_ORDER = ['bk', 'bl', 'wh', 'rd'];
const COURSE_RATINGS = {
    men:{bk:{cr:76.0,sr:144},bl:{cr:73.8,sr:137},wh:{cr:72.0,sr:135},rd:{cr:69.2,sr:134}},
    women:{bl:{cr:80.8,sr:153},wh:{cr:78.6,sr:143},rd:{cr:75.2,sr:136}}
};

function holePar(h){return HOLES[h]?HOLES[h].p:4;}
function holeDist(h,teeCode){teeCode=teeCode||'wh';return HOLES[h]?(HOLES[h][teeCode]||0):0;}
function holeHcp(h){return HOLES[h]?HOLES[h].hcp:h;}
function holeTiming(h){return TIMINGS[h]||15;}
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
// Длительность всех уведомлений — 3 секунды (единый стандарт Pestovo).
// Внизу каждого уведомления идёт зелёная полоса, которая плавно угасает
// (сжимается и теряет яркость) ровно за это время.
var TOAST_DURATION_MS = 3000;
function ensureToastRoot(){
    if (typeof document === 'undefined' || !document.body) return null;
    var root = document.getElementById('toast-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'toast-root';
        root.className = 'toast-root';
        root.setAttribute('aria-live', 'polite');
        document.body.appendChild(root);
    }
    return root;
}
function toastIconFor(toastType){
    if (toastType === 'error') return '<i class="fas fa-triangle-exclamation"></i>';
    if (toastType === 'warn') return '<i class="fas fa-bell"></i>';
    if (toastType === 'info') return '<i class="fas fa-circle-info"></i>';
    return '<i class="fas fa-circle-check"></i>';
}
// Красивые неблокирующие уведомления: стек сверху по центру, иконка,
// текст, кнопка закрытия и зелёная полоса-таймер на 3 секунды, которая
// наглядно угасает по истечению времени. Тап по уведомлению закрывает его
// (или выполняет opts.onClick, если задан).
function toast(m,toastType,opts){
    toastType=toastType||'success';
    opts=opts||{};
    var duration = parseInt(opts.duration) > 0 ? parseInt(opts.duration) : TOAST_DURATION_MS;
    try {
        if (typeof document === 'undefined' || !document.body) return null;
        var root = ensureToastRoot();
        if (!root) return null;
        // Не больше 3 уведомлений на экране — старые убираем, чтобы не мешали вводу счёта
        while (root.children.length >= 3) {
            try {
                var oldest = root.firstChild;
                if (oldest && oldest._pestovoDismiss) oldest._pestovoDismiss(true);
                else root.removeChild(oldest);
            } catch(_) { break; }
        }
        var e=document.createElement('div');
        e.className='toast t-'+toastType;
        e.setAttribute('role','status');
        var barMs = duration;
        e.innerHTML='<span class="toast-ico">'+toastIconFor(toastType)+'</span>'+
            '<span class="toast-msg">'+m+'</span>'+
            '<button type="button" class="toast-x" aria-label="×">×</button>'+
            '<span class="toast-bar"><span style="animation-duration:'+barMs+'ms"></span></span>';
        var dismissed=false;
        var dismiss=function(instant){
            if (dismissed) return; dismissed=true;
            try {
                e.classList.remove('t-show');
                e.classList.add('t-hide');
                setTimeout(function(){ try{ e.remove(); }catch(_){} }, instant ? 0 : 320);
            } catch(_) {}
        };
        e._pestovoDismiss=dismiss;
        e.addEventListener('click', function(ev){
            if (ev && ev.target && ev.target.classList && ev.target.classList.contains('toast-x')) {
                ev.stopPropagation(); dismiss(false); return;
            }
            if (typeof opts.onClick === 'function') {
                try { opts.onClick(); } catch(_) {}
                dismiss(false);
            } else {
                dismiss(false);
            }
        });
        root.appendChild(e);
        // Анимация появления на следующем кадре
        setTimeout(function(){ try{ e.classList.add('t-show'); }catch(_){} },10);
        setTimeout(function(){ dismiss(false); }, duration);
        return e;
    } catch(err) { try{ console.log('[toast]', m); }catch(_){} return null; }
}
// Последовательный показ уведомлений: каждое следующее — после исчезновения
// предыдущего (интервал = длительность + небольшая пауза). Используется для
// поочерёдных предупреждений о лунках (сначала лунка 1, потом 2 и т.д.).
function toastSequence(items, opts){
    opts = opts || {};
    var list = (items || []).slice();
    if (!list.length) return;
    var gap = parseInt(opts.gap) > 0 ? parseInt(opts.gap) : 350;
    var step = TOAST_DURATION_MS + gap;
    list.forEach(function(it, idx){
        setTimeout(function(){
            if (typeof it === 'string') toast(it, opts.type || 'warn', opts.toastOpts || {});
            else toast(it.msg || it.html || '', it.type || opts.type || 'warn', it.opts || opts.toastOpts || {});
        }, idx * step);
    });
}
function isPlayerModeEnabled(key){
    try { return localStorage.getItem(key) === '1'; } catch(e) { return false; }
}
function vib(pattern){
    if (!navigator.vibrate) return;
    var value = pattern === undefined || pattern === null ? 50 : pattern;
    // Усиленный режим меняет только длительность вибрации, сохраняя ритм паттерна.
    if (isPlayerModeEnabled('pestovo_strong_vibration')) {
        if (Array.isArray(value)) {
            value = value.map(function(part, index) {
                if (index % 2 === 0) return Math.min(650, Math.max(35, Math.round((parseInt(part) || 0) * 1.45)));
                return Math.min(260, Math.max(20, Math.round((parseInt(part) || 0) * 0.9)));
            });
        } else {
            value = Math.min(650, Math.max(70, Math.round((parseInt(value) || 50) * 1.5)));
        }
    }
    try { navigator.vibrate(value); } catch(e) {}
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
    if(!ts)return'—';
    try {
        var d=new Date(ts),h=d.getHours(),m=d.getMinutes();
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

function baseUrl(){var loc=window.location,path=loc.pathname,dir=path.substring(0,path.lastIndexOf('/')+1);return loc.origin+dir;}
function qrUrl(data){return'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(data);}
function escapeHtml(str){
    if(str===null||str===undefined)return'';
    return String(str).replace(/[&<>"']/g,function(c){
        return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
}

// Одна Firebase-подписка на логический виджет. Повторный рендер (например, при
// смене языка или фильтра) переиспользует последний снимок, не создавая дублей.
var realtimeValueBindings = Object.create(null);
function bindRealtimeValue(key, firebaseRef, render) {
    if (!key || !firebaseRef || typeof render !== 'function') return;
    var binding = realtimeValueBindings[key];
    if (!binding) {
        binding = realtimeValueBindings[key] = { render: render, snapshot: null };
        firebaseRef.on('value', function(snapshot) {
            binding.snapshot = snapshot;
            binding.render(snapshot);
        }, function(error) {
            console.error('[Firebase] ' + key + ':', error);
        });
    } else {
        binding.render = render;
        if (binding.snapshot) binding.render(binding.snapshot);
    }
}

// ==========================================
// ФИЛЬТР ПО ДАТАМ (общий для списков раундов)
// Период задаётся парой input[type=date]: «Дата с» включается с 00:00:00.000,
// «Дата по» — по 23:59:59.999 того же дня, чтобы вечерние раунды последнего
// дня периода тоже попадали в выборку.
// ==========================================
var DATE_RANGE_PRESETS = ['today', '7d', '30d', 'month', 'year', 'all'];

function dateInputToStartTs(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value === null || value === undefined ? '' : value).trim());
    if (!m) return null;
    var ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
    return isNaN(ts) ? null : ts;
}

function dateInputToEndTs(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value === null || value === undefined ? '' : value).trim());
    if (!m) return null;
    var ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999).getTime();
    return isNaN(ts) ? null : ts;
}

// Timestamp -> значение для input[type=date] в локальной таймзоне пользователя.
function tsToDateInputValue(ts) {
    if (!ts) return '';
    var d = new Date(ts), mo = d.getMonth() + 1, da = d.getDate();
    return d.getFullYear() + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
}

// Дата раунда для фильтра: время старта, а у старых записей без startTime — создание.
function getRoundFilterTs(r) {
    if (!r || typeof r !== 'object') return 0;
    return Number(r.startTime) || Number(r.createdAt) || 0;
}

// Быстрые пресеты периода. 'all' — пустые границы (без ограничения).
function datePresetRange(presetId) {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var from = null;
    if (presetId === 'today') from = today;
    else if (presetId === '7d') from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
    else if (presetId === '30d') from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    else if (presetId === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);
    else if (presetId === 'year') from = new Date(today.getFullYear(), 0, 1);
    if (!from) return { from: '', to: '' };
    return { from: tsToDateInputValue(from.getTime()), to: tsToDateInputValue(today.getTime()) };
}

// Текущее состояние фильтра: границы в мс + признак некорректного ввода.
function readDateRange(fromEl, toEl) {
    var fromValue = fromEl ? (fromEl.value || '') : '';
    var toValue = toEl ? (toEl.value || '') : '';
    var from = fromValue ? dateInputToStartTs(fromValue) : null;
    var to = toValue ? dateInputToEndTs(toValue) : null;
    var invalid = (from !== null && to !== null && from > to);
    return {
        from: from, to: to, fromValue: fromValue, toValue: toValue,
        invalid: invalid,
        active: !invalid && (from !== null || to !== null)
    };
}

// Фильтрация пар [id, round] по периоду. Раунды без даты в выборку не попадают.
function filterEntriesByDateRange(entries, range) {
    if (!range || !range.active) return entries.slice();
    return entries.filter(function(e) {
        var ts = getRoundFilterTs(e && e[1]);
        if (!ts) return false;
        if (range.from !== null && ts < range.from) return false;
        if (range.to !== null && ts > range.to) return false;
        return true;
    });
}

// Сводка «сколько раундов за период» над списком.
function renderRoundsPeriodSummary(el, range, count, total) {
    if (!el) return;
    var isEn = currentLang === 'en';
    var html = '<i class="fas fa-calendar-check"></i> ';
    if (range && range.active) {
        var fromTxt = range.from !== null ? fmtDate(range.from) : (isEn ? 'the beginning' : 'с начала');
        var toTxt = range.to !== null ? fmtDate(range.to) : (isEn ? 'today' : 'сегодня');
        html += '<span class="rs-period">' + escapeHtml(fromTxt + ' — ' + toTxt) + '</span>' +
                '<span class="rs-sep">·</span>' + t('rounds_found_label') + ': <b>' + count + '</b>';
        if (typeof total === 'number' && total !== count) {
            html += ' <span class="rs-dim">' + (isEn ? 'of' : 'из') + ' ' + total + '</span>';
        }
    } else {
        html += t('rounds_total_label') + ': <b>' + count + '</b>';
    }
    el.innerHTML = html;
}

var dateRangeFilters = Object.create(null);

// Подключение виджета «дата с / дата по» к списку.
// cfg: { key, fromId, toId, presetsId, resetId, hintId, summaryId, onChange }
function initDateRangeFilter(cfg) {
    if (!cfg) return null;
    var fromEl = document.getElementById(cfg.fromId);
    var toEl = document.getElementById(cfg.toId);
    if (!fromEl || !toEl) return null;
    var presetsEl = cfg.presetsId ? document.getElementById(cfg.presetsId) : null;
    var resetEl = cfg.resetId ? document.getElementById(cfg.resetId) : null;
    var hintEl = cfg.hintId ? document.getElementById(cfg.hintId) : null;
    var storeKey = 'pestovo_date_filter_' + cfg.key;

    function persist() {
        try {
            localStorage.setItem(storeKey, JSON.stringify({ from: fromEl.value || '', to: toEl.value || '' }));
        } catch (e) {}
    }

    // Какой пресет соответствует текущим границам ('' — произвольный период).
    function activePreset() {
        var r = readDateRange(fromEl, toEl);
        if (!r.fromValue && !r.toValue) return 'all';
        for (var i = 0; i < DATE_RANGE_PRESETS.length; i++) {
            var p = DATE_RANGE_PRESETS[i];
            if (p === 'all') continue;
            var pr = datePresetRange(p);
            if (pr.from === r.fromValue && pr.to === r.toValue) return p;
        }
        return '';
    }

    function renderPresets() {
        if (!presetsEl) return;
        var active = activePreset();
        presetsEl.innerHTML = DATE_RANGE_PRESETS.map(function(p) {
            return '<button type="button" class="date-chip' + (active === p ? ' active' : '') +
                   '" data-preset="' + p + '">' + t('date_preset_' + p) + '</button>';
        }).join('');
    }

    // Не даём выбрать «с» позже «по» прямо в нативном календаре.
    function syncMinMax() {
        if (toEl.value) fromEl.setAttribute('max', toEl.value); else fromEl.removeAttribute('max');
        if (fromEl.value) toEl.setAttribute('min', fromEl.value); else toEl.removeAttribute('min');
    }

    function updateHint() {
        var invalid = readDateRange(fromEl, toEl).invalid;
        fromEl.classList.toggle('is-invalid', invalid);
        toEl.classList.toggle('is-invalid', invalid);
        if (hintEl) {
            hintEl.textContent = invalid ? t('date_filter_invalid') : '';
            hintEl.classList.toggle('hidden', !invalid);
        }
    }

    function fire() {
        updateHint();
        if (typeof cfg.onChange === 'function') cfg.onChange(api.getRange());
    }

    var api = {
        key: cfg.key,
        getRange: function() { return readDateRange(fromEl, toEl); },
        renderPresets: renderPresets,
        lastSummary: null,
        renderSummary: function(count, total) {
            api.lastSummary = { count: count, total: total };
            renderRoundsPeriodSummary(cfg.summaryId ? document.getElementById(cfg.summaryId) : null, api.getRange(), count, total);
        },
        rerenderSummary: function() {
            if (api.lastSummary) api.renderSummary(api.lastSummary.count, api.lastSummary.total);
        }
    };

    // Возвращаем прошлый период после перезагрузки страницы.
    try {
        var saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
        if (saved && typeof saved === 'object') {
            if (saved.from) fromEl.value = saved.from;
            if (saved.to) toEl.value = saved.to;
        }
    } catch (e) {}

    fromEl.addEventListener('change', function() { syncMinMax(); persist(); renderPresets(); fire(); });
    toEl.addEventListener('change', function() { syncMinMax(); persist(); renderPresets(); fire(); });

    if (presetsEl) {
        presetsEl.addEventListener('click', function(e) {
            var btn = e.target && e.target.closest ? e.target.closest('.date-chip') : null;
            var preset = btn && btn.getAttribute('data-preset');
            if (!preset) return;
            var r = datePresetRange(preset);
            fromEl.value = r.from;
            toEl.value = r.to;
            syncMinMax();
            persist();
            renderPresets();
            fire();
        });
    }

    if (resetEl) {
        resetEl.addEventListener('click', function() {
            fromEl.value = '';
            toEl.value = '';
            syncMinMax();
            persist();
            renderPresets();
            fire();
        });
    }

    syncMinMax();
    renderPresets();
    updateHint();
    dateRangeFilters[api.key] = api;
    return api;
}

function getDateRangeFilter(key) { return dateRangeFilters[key] || null; }

// Перерисовка подписей пресетов и сводки при смене языка (зовется из applyTranslations).
function refreshDateRangeFilters() {
    Object.keys(dateRangeFilters).forEach(function(k) {
        var api = dateRangeFilters[k];
        if (!api) return;
        api.renderPresets();
        api.rerenderSummary();
    });
}

// Глобальный fallback для битых <img> (заменяет инлайн-обработчики onerror — лучше для CSP).
// Слушаем в фазе capture: ошибки ресурсов не всплывают.
document.addEventListener('error', function(e) {
    var el = e && e.target;
    if (el && el.tagName === 'IMG') { el.style.display = 'none'; }
}, true);

// ==========================================
// ЗАПИСЬ В БД С ПОДДЕРЖКОЙ ОФЛАЙНА
// Без сети промис Firebase не резолвится до восстановления соединения —
// UI «замирал» после «Сохранить», а перезагрузка страницы теряла счёт.
// Дублируем запись в локальную очередь (js/pwa.js) и сразу продолжаем.
// ==========================================
function isOfflineNow() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}
function dbSetWithOfflineQueue(path, value) {
    var writePromise;
    try { writePromise = db.ref(path).set(value); } catch (e) { writePromise = Promise.reject(e); }
    if (isOfflineNow()) {
        if (typeof queueOfflineWrite === 'function') queueOfflineWrite(path, value);
        writePromise.catch(function() {});
        return Promise.resolve({ offline: true });
    }
    return writePromise;
}
function dbUpdateWithOfflineQueue(updates) {
    var writePromise;
    try { writePromise = db.ref().update(updates); } catch (e) { writePromise = Promise.reject(e); }
    if (isOfflineNow()) {
        if (typeof queueOfflineWrite === 'function') {
            Object.keys(updates || {}).forEach(function(p) { queueOfflineWrite(p, updates[p]); });
        }
        writePromise.catch(function() {});
        return Promise.resolve({ offline: true });
    }
    return writePromise;
}

// Санитизация имён/текстов перед записью в БД: убираем HTML/JS-инъекции на входе,
// чтобы все места, где имя рендерится в innerHTML, были безопасны.
function sanitizeNameRaw(str){
    if(str===null||str===undefined)return'';
    var s=String(str);
    s=s.replace(/[<>&"'`{}\\\/\[\]();:]/g,'');   // потенциально опасная для HTML разметка
    s=s.replace(/\s+/g,' ').trim();
    if(s.length>60)s=s.substring(0,60).trim();
    return s;
}

// ==========================================
// МЕЖДУНАРОДНЫЙ ЯЗЫКОВОЙ ПЕРЕКЛЮЧАТЕЛЬ (RU / EN)
// ==========================================
var currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('pestovo_lang')) || 'ru';

var I18N = {
    ru: {
        brand_name: 'Пестово',
        nav_home: 'Главная', nav_round: 'Раунд', nav_leaderboard: 'Все раунды',
        bn_home: 'Главная', bn_round: 'Раунд', bn_rounds: 'Табло', bn_guide: 'Поле', bn_menu: 'Меню',
        nav_guide: 'Книга поля', nav_feed: 'Лента событий', nav_predictor: 'Симулятор WHS', nav_oom: 'Зачёт сезона',
        nav_players: 'Игроки', nav_tournaments: 'Турниры', nav_stats: 'Статистика',
        nav_handicaps: 'Гандикапы', nav_admin: 'Админ', nav_login: 'Войти',
        nav_assistant: 'Помощник',
        footer_club: '© 2024 Гольф-клуб Пестово',
        tab_design: 'Дизайн 🎨',
        design_admin_title: 'Шаблоны оформления сайта',
        design_admin_sub: 'Текущий дизайн + 5 альтернативных шаблонов. Шаблон можно назначить всему сайту, отдельной странице или отдельному блоку — так собирается собственный дизайн из готовых частей.',
        design_mode_title: 'Режим оформления',
        design_global_title: 'Базовый шаблон сайта',
        design_preview_title: 'Живой предпросмотр',
        design_preview_sub: 'Слева — как сайт выглядит сейчас с выбранными настройками, дальше — каждый шаблон целиком.',
        design_save_btn: 'Сохранить оформление для всех',
        design_reset_btn: 'Вернуть текущий дизайн',
        design_pages_title: 'Шаблон для каждой страницы',
        design_pages_sub: 'Работает в режиме «Сборка из шаблонов». Значение «Текущий» — страница оформлена базовым шаблоном сайта.',
        design_blocks_title: 'Шаблон для каждого блока',
        design_blocks_sub: 'Блок со своим шаблоном перекрывает шаблон страницы — так собирается уникальный дизайн из разных частей.',
        tab_assistant: 'Помощник',
        assistant_admin_title: 'Настройка «Помощника»',
        assistant_admin_sub: 'Добавляйте PDF-документы по ссылке — помощник сможет отвечать на вопросы по ним. Нажмите «Сохранить и перестроить», чтобы обновить базу знаний для всех игроков.',
        assistant_hide_page: 'Показывать страницу «Помощник» всем',
        assistant_hide_page_hint: 'Снимите галочку, чтобы полностью убрать страницу помощника из меню и закрыть к ней доступ.',
        assistant_add_source_title: 'Добавить документ (PDF по ссылке)',
        assistant_source_name: 'Название документа',
        assistant_source_url: 'Ссылка на PDF',
        assistant_add_btn: 'Добавить',
        assistant_sources_title: 'Источники базы знаний',
        assistant_rebuild_btn: 'Сохранить и перестроить индекс',
        assistant_delete_btn: 'Удалить',
        assistant_sub: 'Онлайн-помощник по документам клуба',
        assistant_title: 'Умный помощник Пестово',
        assistant_clear: 'Очистить',
        assistant_placeholder: 'Напишите ваш вопрос…',
        assistant_send: 'Отправить',

        hero_sub: 'Цифровая счётная карточка Пестово',
        hero_title: 'Лайв-скоринг и электронные карточки Пестово',
        hero_desc: '18 лунок · Пар 72',
        btn_start_game: 'Начать игру',
        btn_view_scores: 'Все раунды',
        sec_now_playing: 'Сейчас на поле',
        sec_active_tournament: 'Активный турнир',
        sec_my_active: 'Мои активные раунды',
        continue_round: 'Продолжить игру',
        sec_club_stats: 'Клуб в цифрах',
        sec_course_card: 'Поле клуба',
        sec_recent_results: 'Последние результаты',
        all_rounds: 'Все раунды',
        no_active_players: 'Сейчас никто не играет',
        course_card_sub: '18 лунок · Пар 72 · Все ТИ (метры)',
        address_str: '📍 МО, г. Мытищи, Никольская ул., 1, Румянцево',
        nav_header: 'Навигация',
        more_header: 'Ещё',

        tee_bk: 'Чёрный', tee_bl: 'Синий', tee_wh: 'Белый', tee_rd: 'Красный',
        tee_opt_bk: '⬛ Чёрный', tee_opt_bl: '🟦 Синий', tee_opt_wh: '⬜ Белый', tee_opt_rd: '🟥 Красный',
        hole: 'Лунка', par: 'Пар', index: 'Индекс', gross: 'Gross',
        hole_lbl: 'Лунка', par_lbl: 'Пар', dist_lbl: 'Метры', deadline_lbl: 'Дедлайн',
        stbl_field: 'Stableford (пол.)', stbl_exact: 'Stableford (игр.)',
        out: 'Аут', in_side: 'Ин', total: 'Итого', meters: 'Метры', deadline: 'Дедлайн',
        format_match_1v1: 'Матч-плей (1х1)',
        format_match_2v2: 'Матч-плей (2х2)',
        format_scramble: 'Скрембл (Scramble)',
        voice_score_btn: 'Голос',
        hole_map_btn: '2D Схема',
        analytics_title: 'Аналитика',
        voice_not_supported: 'Голосовой ввод не поддерживается вашим браузером',
        no_data: 'Нет данных',
        select_hole_title: 'Выберите лунку:',
        putts_label: 'Патты:',
        forecast_input_title: 'Данные для прогноза',
        select_registered_player: 'Выберите зарегистрированного игрока:',
        planned_tee: 'Планируемый ТИ:',
        guide_sub: 'Тактический гид и советы тренера Пестово',
        save_group: 'Сохранить Группу',
        test_group: 'Проверить Группу',
        save_channel: 'Сохранить Канал',
        test_channel: 'Проверить Канал',
        save_vk: 'Сохранить настройки ВКонтакте',
        test_vk: 'Проверить отправку в ВКонтакте',
        tg_integration_title: 'Интеграция Telegram: Группа Судей & Канал Клуба',
        tg_integration_sub: 'Вы можете настроить отправку уведомлений отдельно для Группы Судей/Маршалов и для Канала Клуба.',
        tg_group_title: '1. Telegram Группа (Вызовы Судей и Маршалов)',
        tg_group_sub: '💡 Добавьте бота в группу судей. Chat ID обычно начинается с -100...',
        tg_channel_title: '2. Telegram Канал (Анонсы и Результаты)',
        tg_channel_sub: '💡 Назначьте бота Администратором канала с правом публикации сообщений.',
        placeholder_tg_channel_id: '@pestovo_golf или -1001987654321',
        vk_integration_title: 'Интеграция ВКонтакте (VK API)',
        vk_integration_sub: 'При вызове судьи или маршала уведомление мгновенно отправится в беседу или личные сообщения ВКонтакте.',
        vk_token_lbl: 'VK Access Token Сообщества',
        placeholder_vk_peer_id: '2000000001 (беседа) или 123456789 (пользователь)',
        placeholder_bc_title: '🏆 Чемпионат Пестово 2024',
        placeholder_bc_body: 'Регистрация на турнир открыта! Старт в субботу в 10:00.',
        share_card: 'Поделиться в соцсетях (PNG)',
        download_png: 'Скачать картинку (PNG)',
        share_native: 'Поделиться в приложении',

        page_title_live: 'Начать раунд',
        page_sub_live: 'Одиночный или групповой раунд — переключайте вкладки',
        round_setup: 'Настройки раунда',
        group_setup_title: 'Настройка группы',
        solo_round: 'Одиночный раунд', group_round: 'Групповой раунд',
        solo_desc: 'Играете один. Сами вводите свой счёт на каждой лунке.',
        group_desc: 'От 2 до 4 игроков. Двойной ввод (свой счёт + счёт партнёра).',
        mode_solo_title: 'Одиночный раунд',
        mode_solo_desc: 'Играете один. Сами вводите свой счёт на каждой лунке.',
        mode_group_title: 'Групповой раунд',
        mode_group_desc: 'От 2 до 4 игроков. Двойной ввод (свой счёт + счёт партнёра).',
        mode_start: 'Начать',
        tournament_opt: 'Турнир (опционально)',
        no_tournament: '— Без турнира —',
        start_time: 'Время старта', start_hole: 'Стартовая лунка', holes_count: 'Сколько лунок',
        tee_select: 'ТИ', format_select: 'Формат',
        player_count: 'Количество игроков',
        player_count_1: '1 игрок', player_count_2: '2 игрока', player_count_3: '3 игрока', player_count_4: '4 игрока',
        player_data: 'Данные игрока',
        select_registered: 'Выбрать из зарегистрированных',
        guest_manual: '— Гость / ввести вручную —',
        first_name: 'Имя', last_name: 'Фамилия', middle_name: 'Отчество (необязательно)', gender_label: 'Пол',
        placeholder_first_name: 'Имя', placeholder_last_name: 'Фамилия', placeholder_middle_name: 'Отчество',
        placeholder_tn_name: 'Чемпионат Пестово',
        placeholder_hcp_calc: '+2.4 или 12.4',
        men: 'Мужчина', women: 'Девушка',
        exact_hcp: 'Точный гандикап', field_hcp: 'Полевой гандикап',
        field_auto: 'Полевой (авто)',
        start_round_btn: 'Начать раунд', back_btn: 'Назад',
        timings_title: 'Тайминги',
        pace_of_play: 'Темп игры',
        pace_current_hole: 'Текущая лунка',
        pace_completed: 'Пройдено',
        pace_delay: 'Общее отставание',
        pace_buffer: 'Запас',
        pace_on_time: 'В графике',
        pace_warning: 'Небольшое отставание',
        pace_late: 'Отставание',
        pace_severe: 'Сильное отставание',
        pace_pending: 'Тайминг появится после сохранения лунок',
        pace_deadline: 'Плановый дедлайн',
        pace_hole_norm: 'Норма',
        pace_in_progress: 'в процессе',
        time_and_hole: 'Время и лунка',
        game_format: 'Формат игры',

        my_score: 'Мой счёт',
        marker_for: 'Маркер для',
        score_of_player: 'Счёт игрока:',
        score_col_you: '(вы вводите свой счёт)',
        score_col_marked: '(того, за кем вы ведёте счёт)',
        save_hole: 'Сохранить лунку', finish_round: 'Завершить раунд',
        // Кнопка ввода счёта: игрок ПОДТВЕРЖДАЕТ результат лунки (переход к
        // следующей лунке происходит автоматически, поэтому в названии его нет).
        next_hole_btn: 'Подтвердить результат',
        solo_next_hole_btn: 'Подтвердить результат',
        solo_save_result_btn: '✅ Подтвердить результат',
        solo_next_keep_btn: '➡️ Следующая лунка',
        skipped_holes_title: 'Не введён счёт',
        skipped_holes_goto: 'Перейти к лунке',
        skipped_holes_skip: 'Продолжить с пропуском',
        skipped_holes_finish_q: 'На лунке(ах) {holes} нет счёта. Завершить раунд всё равно?',
        score_of_player: 'Ваш счёт',
        score_of_marked: 'Счёт маркируемого',
        tn_start_pending_title: 'Турнир ещё не начался',
        tn_start_countdown_label: 'До старта осталось',
        tn_start_at: 'Старт:',
        tn_start_gate_hint: 'Ввод счёта откроется автоматически ровно в момент старта — обновлять страницу не нужно.',
        tn_start_gate_started: '🏁 Турнир стартовал — можно вводить счёт!',
        finish_blocked_title: 'Раунд пока нельзя завершить',
        finish_blocked_hint: 'Уведомление исчезнет само, как только все лунки будут подтверждены.',
        show_stableford_points: 'Показывать очки Stableford',
        show_stableford_points_hint: 'Очки с учётом полевой форы будут показаны рядом с введённым счётом. Эта настройка сохраняется только для вас.',
        stableford_default: 'Stableford по умолчанию',
        stableford_default_hint: 'Показывать очки Stableford рядом со счётом всем игрокам, которые ещё не выбрали личную настройку.',
        save_stableford_default: 'Сохранить настройку Stableford',
        confirm_final_hole: 'Зафиксировать 18-ю лунку',
        waiting_for_marker: '⏳ Ваш счёт введён. Ожидаем подтверждение от маркера',
        hole_finalized_both: '✅ Счёт зафиксирован и подтверждён обеими сторонами!',
        mismatch_error: '⚠️ Несовпадение с маркером! Исправьте результат.',
        call_referee: 'Вызвать судью', call_marshal: 'Вызвать маршала',
        call_sent: 'Вызов отправлен',
        call_accepted: 'принял вызов',
        call_on_way: 'едет',
        call_retry_in: 'Повторный вызов через',
        call_cooldown: 'Повторный вызов будет доступен через',
        read_only_mode: 'Режим просмотра. Ввод счёта доступен только участникам раунда.',
        view_only_group_desc: 'Режим просмотра. Ввод счёта доступен только участникам раунда.',
        round_score: 'Счёт раунда', hole_scorecard: 'Счётная карточка по лункам',
        group_summary: 'Сводка группы',
        connect_players: 'Подключение игроков группы',
        connect_players_title: 'Подключение игроков группы',
        connect_players_desc: 'Дайте отсканировать QR-код другим игрокам, чтобы они открыли счётную карточку со своих телефонов.',
        scan_to_play: 'Сканируй, чтобы играть за этого игрока',
        invite_qrs_collapse: 'Свернуть QR-коды подключения',
        invite_qrs_expand: 'Развернуть QR-коды подключения',
        joined_in_game: 'В игре',
        waiting_join: 'Ожидает подключения',
        ready_to_score: 'готовы вводить счёт',
        ready_to_score_one: 'готов вводить счёт',
        of_word: 'из',
        all_joined: 'Все игроки подключены',
        qr_reconnect_hint: 'QR сохранён — можно переподключиться',
        marker_score_short: 'М',
        legend_player_score: 'счёт игрока',
        legend_marker_score: 'счёт маркера',
        legend_mismatch: 'расхождение',
        round_progress: 'Прогресс раунда',
        finished_f: 'Завершил (F)',

        res_hio: 'Hole-in-One!', res_albatross: 'Альбатрос', res_eagle: 'Eagle',
        res_birdie: 'Birdie', res_par: 'Par', res_bogey: 'Bogey', res_double: 'Double',

        weather_clear: 'Ясно', weather_cloudy: 'Малооблачно', weather_fog: 'Туман',
        weather_rain: 'Дождь', weather_snow: 'Снег', weather_thunder: 'Гроза',
        wind_label: 'Ветер',

        status_label: 'Статус', status_all: 'Все', status_active: 'Live', status_completed: 'Завершённые',
        date_filter_label: 'Период', date_from_label: 'Дата с', date_to_label: 'Дата по',
        date_filter_reset: 'Сбросить',
        date_preset_today: 'Сегодня', date_preset_7d: '7 дней', date_preset_30d: '30 дней',
        date_preset_month: 'Этот месяц', date_preset_year: 'Этот год', date_preset_all: 'Всё время',
        date_filter_invalid: 'Дата «с» позже даты «по»',
        rounds_found_label: 'Найдено раундов', rounds_total_label: 'Всего раундов',
        period_label: 'Период', period_all_time: 'за всё время',
        no_rounds_in_period: 'Нет раундов за выбранный период',
        all_players: 'Все игроки',
        type_registered: 'Только зарегистрированные',
        type_guests: 'Только гости',
        sort_rounds: 'По раундам', sort_gross: 'По лучшему Gross', sort_name: 'По имени',
        player_type: 'Тип игрока',
        sort_by: 'Сортировка',
        role_admin: 'Администратор',
        role_referee: 'Судья',
        role_marshal: 'Маршал',
        role_player: 'Игрок',
        export_csv_btn: 'Экспортировать все раунды в CSV',
        download_backup_btn: 'Скачать бэкап базы (JSON)',
        generate_flights_btn: 'Сформировать флайты',
        register_tournament_btn: 'Записаться на турнир',
        registered_badge: 'Вы зарегистрированы ✅',
        cancel_registration: 'Отменить запись',
        participants_list: 'Список участников',
        registered_count: 'Заявлено участников',
        msg_tournament_registered: '🎉 Вы успешно записались на турнир!',
        msg_registration_cancelled: 'Запись на турнир отменена',
        confirm_registration: 'Подтвердить запись на турнир',
        tools_title: 'Инструменты и функции',
        gps_rangefinder: 'GPS-Дальномер до грина',
        shot_tracking: 'Детальный трекинг ударов (FIR/GIR/Putts)',
        tv_mode: 'ТВ-Трансляция (Clubhouse TV)',
        h2h_duel: 'Сравнение игроков 1v1 (Head-to-Head)',
        enabled_lbl: 'Включено ✅',
        disabled_lbl: 'Выключено ❌',
        send_broadcast_title: 'Отправить Push-анонс клуба',
        send_broadcast_sub: 'Сообщение будет отправлено на смартфоны всех игроков клуба.',
        broadcast_title_lbl: 'Заголовок анонса',
        broadcast_body_lbl: 'Текст сообщения',
        broadcast_link_lbl: 'Ссылка (опционально)',
        send_broadcast_btn: 'Отправить анонс всем игрокам',
        bc_audience_lbl: 'Кому отправить',
        bc_aud_all_pwa: 'Всем + PWA-уведомления (включая гостей)',
        tab_scores: 'Счёт ⛳',
        scores_editor_title: 'Редактор счёта всех раундов',
        scores_editor_sub: 'Редактируйте счёт любой лунки любого игрока — активного, запланированного или завершённого раунда. Найдите игрока или раунд поиском, раскройте карточку, внесите правки и сохраните.',
        scores_search_fio: 'Поиск по ФИО игрока',
        scores_search_date: 'Дата раунда',
        scores_search_status: 'Статус раунда',
        bc_aud_all: 'Всем игрокам клуба',
        bc_aud_tournament: 'Турниру (его registrations)',
        bc_aud_protocol: 'Игрокам стартового протокола',
        bc_aud_tn_lbl: 'Турнир',
        bc_aud_proto_lbl: 'Стартовый протокол',
        bc_aud_none: '— выберите —',
        bc_aud_hint: 'Адресный анонс увидят только адресаты: страница игрока проверяет, есть ли он в списке получателей, и лишнего не показывает.',
        bc_aud_count: 'Получателей',
        bc_aud_none_sel: 'Анонс некому отправлять: в списке получателей нет ни одного игрока',
        bc_aud_count_btn: 'Отправить анонс',
        feed_announcements_title: 'Анонсы клуба',
        feed_announcements_empty: 'Пока нет анонсов',
        broadcast_history_title: 'История отправленных анонсов',
        edit_profile: 'Редактировать профиль',
        save_profile: 'Сохранить профиль',
        cancel_btn: 'Отмена',
        expand_scorecard: 'Показать карточку',
        collapse_scorecard: 'Свернуть карточку',
        expand_round: 'Развернуть раунд',
        collapse_round: 'Свернуть раунд',
        expand_all_rounds: 'Развернуть все',
        collapse_all_rounds: 'Свернуть все',
        live_rounds_hint: 'Видно, кто сейчас на поле. Нажмите на строку, чтобы развернуть детали',
        field_map_title: 'Карта лунок и старты',
        privacy_title: 'Конфиденциальность имён (ФИО)',
        privacy_sub: 'Скрывать полные имена игроков (имя, фамилия, отчество) от других игроков и гостей. Вместо ФИО показываются инициалы или маска, а гандикап и история раундов остаются видны.',
        privacy_global_lbl: 'Скрывать ФИО всех игроков от других (глобально)',
        privacy_global_sub: 'Включите, чтобы скрыть полные имена сразу для всех игроков.',
        privacy_mask_lbl: 'Формат скрытия имени',
        privacy_opt_initials: 'Инициалы (И. Т.)',
        privacy_opt_masked: 'Полная маскировка (Игрок №N)',
        privacy_save_btn: 'Сохранить настройки приватности',
        privacy_hide_btn: 'Скрыть имя',
        privacy_show_btn: 'Показать имя',
        my_round_tag: 'Мой раунд',
        current_round_tag: 'Текущий',
        leader_lbl: 'Лидер',
        sc_topar_lbl: 'To-par по ходу',
        to_current_hole: 'К текущей лунке',
        card_marker_lbl: 'Маркер',
        no_current_hole: 'Текущая лунка ещё не определена',
        avatar_label: 'Аватар профиля',
        upload_photo: 'Загрузить фото',
        choose_preset: 'Или выберите иконку',
        phone_label: 'Телефон',
        default_tee: 'Предпочитаемый ТИ по умолчанию',
        msg_profile_saved: '✅ Профиль обновлён!',
        search_label: 'Поиск игрока',
        search_placeholder: 'Поиск по имени...',
        page_title_handicaps: 'Полевые гандикапы',
        page_sub_handicaps: 'Пестово · Пар 72',
        admin_login_title: 'Вход в админ-панель',
        remember_me: 'Запомнить меня',
        forgot_password: 'Забыли пароль?',
        admin_logout: 'Выйти из админки',
        tournament_date_label: 'Дата',
        tournament_name_label: 'Название',
        all_genders: 'Все', men_plural: 'Мужчины', women_plural: 'Девушки',
        quick_calc: 'Быстрый расчёт',
        full_table: 'Посмотреть полную таблицу',
        full_table_title: 'Посмотреть полную таблицу',
        full_table_sub: 'Выберите пол и ТИ — таблица появится ниже',
        tbl_gender: 'Пол игрока',
        tbl_select_gender: '— Пол —',
        tbl_select_tee: '— ТИ —',
        select_gender_first: '— Сначала пол —',
        from_col: 'Показатель от', to_col: 'Показатель до',
        round_history: 'История раундов',

        // Режимы интерфейса игрока
        large_ui_mode: 'Крупный шрифт и кнопки',
        strong_vibration_mode: 'Усиленная вибрация',
        high_contrast_mode: 'Более заметные цвета статусов',
        battery_saver_mode: 'Экономия батареи',
        player_modes_title: 'Мои настройки',
        my_preferences_title: 'Мои настройки',
        mode_on: 'Вкл.',
        mode_off: 'Выкл.',

        // Solo & Guest
        solo_sub: 'Гольф-клуб Пестово',
        current_score: 'Текущий счёт',
        view_mode_notice: 'Режим просмотра.',

        // Admin & Auth
        admin_login: 'Вход в админ-панель',
        admin_panel: 'Админ-панель',
        admin_desc: 'Войдите с мастер-паролем или авторизуйтесь через аккаунт с правами администратора.',
        username: 'Логин', password: 'Пароль',
        login_btn: 'Войти', register_btn: 'Регистрация', create_account: 'Создать аккаунт',
        continue_guest: 'Продолжить как гость',
        tab_rounds: 'Раунды', tab_alerts: 'Вызовы 🚨', tab_groups: 'Группы сейчас ⏱️', tab_tournaments: 'Турниры 🏆',
        tab_start: 'Старт турнира 🏁',
        tab_players: 'Игроки и роли', tab_data: 'Данные',
        tab_importexport: 'Импорт/Экспорт 📊', tab_rusgolf: 'RUSGOLF 🇷🇺',
        imp_exp_title: 'Импорт и экспорт игроков (Excel)',
        imp_exp_sub: 'Выгружайте список игроков в таблицу Excel и импортируйте игроков обратно: имя, фамилия и точный гандикап.',
        rg_title: 'Проверка гандикапа — база АГР России',
        rg_sub: 'Поиск точного гандикапа (HI) игрока в официальной базе Ассоциации гольфа России (hcp.rusgolf.ru) с возможностью добавить игрока к себе на сайт.',
        all_tournaments: 'Все турниры',
        create_tournament: 'Создать турнир',
        tournament_name: 'Название', tournament_date: 'Дата',
        available_formats: 'Доступные форматы', available_tees: 'Доступные ТИ',
        create_btn: 'Создать',
        admin_only_tournaments: 'Турниры создаёт только администратор.',
        admin_panel_link: 'Админка',
        referee_marshal_calls: 'Вызовы судей и маршалов',
        admin_groups_title: 'Группы, которые сейчас играют',
        admin_groups_sub: 'Контроль темпа игры по активным групповым раундам',
        admin_no_groups: 'Сейчас нет активных групповых раундов',
        admin_group_players: 'Игроки',
        admin_start_time: 'Стартовое время',
        admin_start_hole: 'Стартовая лунка',
        admin_current_hole: 'Текущая лунка',
        admin_hole_timings: 'Тайминги прохождения лунок',
        admin_total_delay: 'Общее отставание',
        enable_push_notifications: 'Включить Push-уведомления',
        manage_players_roles: 'Управление игроками и ролями',
        manage_players_sub: 'Назначайте права Администратора другим игрокам. Администраторы получают полный доступ к этой панели.',
        data_management: 'Управление данными',
        data_danger_sub: 'Осторожно — действия необратимы.',
        page_visibility_title: 'Управление видимостью страниц и функций',
        page_visibility_sub: 'Снимите галочку с любой страницы или функции, чтобы полностью скрыть её из меню навигации для игроков.',
        save_visibility_btn: 'Сохранить настройки',
        hcp_variant_title: 'Стиль галочки гандикапа',
        hcp_variant_sub: 'Зелёная галочка «гандикап синхронизирован» и дата обновления показаны во вкладке «Игроки», личном профиле и в списке админки. Выбор действует для всех игроков.',
        hcp_variant_1: '1 · Компактная галочка',
        hcp_variant_2: '2 · Пилюля «обновлён»',
        hcp_variant_3: '3 · Галочка на аватаре',
        social_card_variant_title: 'Оформление PNG-карточки для соцсетей',
        social_card_variant_sub: 'Выберите один из трёх вариантов. Выбранное оформление применится ко всем новым PNG-карточкам при экспорте.',
        social_card_variant_1: '1 · Классика',
        social_card_variant_2: '2 · Акцент на результате',
        social_card_variant_3: '3 · Турнирная',
        group_card_variant_title: 'Отображение группового раунда на главной',
        group_card_variant_sub: 'Выберите стиль единой карточки группового раунда для главной страницы. Настройка применяется для всех пользователей.',
        group_card_variant_1: '1 · Сводная матрица',
        group_card_variant_2: '2 · Сравнительная таблица',
        group_card_variant_3: '3 · Лидерборд флайта',
        tn_card_variant_title: 'Счётная карточка игрока в лидерборде турнира',
        tn_card_variant_sub: 'Игрок нажимает на свою строку в лидерборде турнира (страница «Турниры») — открывается его счётная карточка. Выберите один из трёх видов. Настройка применяется для всех пользователей.',
        tn_card_variant_1: '1 · Официальный бланк',
        tn_card_variant_2: '2 · Плитки лунок',
        tn_card_variant_3: '3 · Турнирная сводка',
        tn_card_preview: 'Примеры — так карточка выглядит у игрока:',
        players_display_title: 'Отображение страницы «Игроки»',
        players_display_sub: 'Выберите один из трёх вариантов оформления списка игроков. Настройка применяется для всех пользователей.',
        players_display_variant_1: '1 · Карточки',
        players_display_variant_2: '2 · Компактный список',
        players_display_variant_3: '3 · Витрина',
        stats_display_title: 'Отображение страницы «Статистика»',
        stats_display_sub: 'Выберите один из трёх вариантов оформления статистики клуба. Настройка применяется для всех пользователей.',
        stats_display_variant_1: '1 · Карточки',
        stats_display_variant_2: '2 · Сводка',
        stats_display_variant_3: '3 · Дашборд',
        rounds_display_title: 'Отображение страницы «Все раунды»',
        rounds_display_sub: 'Выберите один из трёх вариантов списка раундов. Настройка применяется для всех пользователей.',
        rounds_display_variant_1: '1 · Текущий список',
        rounds_display_variant_2: '2 · Таблица',
        rounds_display_variant_3: '3 · Витрина раундов',
        home_display_title: 'Отображение страницы «Главная»',
        home_display_sub: 'Выберите один из трёх вариантов оформления главной страницы. Настройка применяется для всех пользователей.',
        home_display_variant_1: '1 · Классика',
        home_display_variant_2: '2 · Компактная',
        home_display_variant_3: '3 · Витрина',
        guide_display_title: 'Отображение страницы «Книга поля»',
        guide_display_sub: 'Выберите один из трёх вариантов оформления книги поля. Настройка применяется для всех пользователей.',
        guide_display_variant_1: '1 · Карточка лунки',
        guide_display_variant_2: '2 · Компактная',
        guide_display_variant_3: '3 · Таблоид',
        feed_display_title: 'Отображение страницы «Лента событий»',
        feed_display_sub: 'Выберите один из трёх вариантов оформления ленты событий. Настройка применяется для всех пользователей.',
        feed_display_variant_1: '1 · Лента',
        feed_display_variant_2: '2 · Компактная',
        feed_display_variant_3: '3 · Афиша',
        predictor_display_title: 'Отображение страницы «Симулятор WHS»',
        predictor_display_sub: 'Выберите один из трёх вариантов оформления симулятора. Настройка применяется для всех пользователей.',
        predictor_display_variant_1: '1 · Стандарт',
        predictor_display_variant_2: '2 · Компактный',
        predictor_display_variant_3: '3 · Дашборд',
        'order-of-merit_display_title': 'Отображение страницы «Зачёт сезона»',
        'order-of-merit_display_sub': 'Выберите один из трёх вариантов оформления таблицы зачёта сезона. Настройка применяется для всех пользователей.',
        'order-of-merit_display_variant_1': '1 · Таблица',
        'order-of-merit_display_variant_2': '2 · Компактная',
        'order-of-merit_display_variant_3': '3 · Пьедестал',
        tournaments_display_title: 'Отображение страницы «Турниры»',
        tournaments_display_sub: 'Выберите один из трёх вариантов оформления списка турниров. Настройка применяется для всех пользователей.',
        tournaments_display_variant_1: '1 · Список',
        tournaments_display_variant_2: '2 · Компактный',
        tournaments_display_variant_3: '3 · Витрина',
        handicap_display_title: 'Отображение страницы «Гандикапы»',
        handicap_display_sub: 'Выберите один из трёх вариантов оформления калькулятора и таблиц гандикапов. Настройка применяется для всех пользователей.',
        handicap_display_variant_1: '1 · Стандарт',
        handicap_display_variant_2: '2 · Компактный',
        handicap_display_variant_3: '3 · Витрина',
        assistant_display_title: 'Отображение страницы «Помощник»',
        assistant_display_sub: 'Выберите один из трёх вариантов оформления чата помощника. Настройка применяется для всех пользователей.',
        assistant_display_variant_1: '1 · Классический чат',
        assistant_display_variant_2: '2 · Компактный',
        assistant_display_variant_3: '3 · Крупный',
        all_players_joined: 'Все игроки уже вошли в раунд',
        tab_broadcasts: 'Анонсы 📢',
        delete_all_rounds: 'Удалить все раунды',
        delete_all_data: 'Удалить всех игроков и раунды',
        delete_all_data_sub: 'Полностью удаляет всех игроков и все раунды. Данные исчезнут из всех списков, статистики и автоподбора и не появятся снова.',
        wipe_everything: 'Удалить все данные',
        wipe_everything_sub: 'Удаляет абсолютно всё: турниры, игроков, раунды, историю, маркеры, протоколы, трансляции, реакции, демо-имена и все локальные кэши. Настройки дизайна и доступа в админку сохраняются.',
        full_name: 'Имя и фамилия',
        repeat_password: 'Повторите пароль',

        // Scorer & Marker
        scorer_title: 'Ввод счёта',
        marker_title: '👁️ Маркер',
        confirm_score_sub: 'Подтверждение счёта',
        marker_notice_title: 'Вы — маркер',
        marker_notice_desc: 'Введите наблюдаемый счёт. Подтверждается только при совпадении.',
        confirm_btn: 'Подтвердить',

        // Stats
        page_title_stats: 'Статистика клуба',
        page_sub_stats: 'Аналитика по всем раундам',
        total_stats: 'Общая статистика',
        top_players: 'Топ игроков',
        club_records: 'Рекорды клуба',
        hole_difficulty: 'Сложность лунок',

        // Offline & Error
        offline_title: 'Нет соединения',
        offline_desc: 'Проверьте интернет-соединение. Ваши результаты сохраняются локально.',
        refresh_btn: 'Обновить', error_title: 'Ошибка', qr_invalid: 'QR-код недействителен.',

        // Toast Messages
        msg_start_time_req: 'Укажите время старта',
        msg_name_req: 'Заполните имя игрока',
        msg_exact_hcp_req: 'Укажите точный гандикап',
        msg_round_started: '🏌️ Раунд начат!',
        msg_saved_hole: '✅ Сохранено на лунке ',
        msg_edit_disabled: 'Редактирование запрещено',
        msg_score_min: 'Счёт должен быть ≥ 1',
        msg_finish_confirm: 'Завершить раунд?',
        msg_round_finished: '🏁 Раунд завершён!',

        player: 'Игрок', players_label: 'Игроки', guest: 'ГОСТЬ', start: 'Старт', date: 'Дата', format: 'Формат',
        round_leader: 'Лидер раунда', no_completed: 'Пока нет завершённых раундов',

        unsaved_score_hint: 'Счёт не сохранён — нажмите кнопку «Сохранить»',
        start_hint_title: 'С какой лунки лучше стартовать?',
        field_hcp_short: 'пол. HCP',
        exact_hcp_short: 'точн. HCP',
        total_players_on_course: 'Всего игроков на поле',
        total_players_label: 'Всего игроков',
        free_holes_label: 'Свободные лунки',
        busy_holes_label: 'Занятые лунки',
        tee_label: 'ТИ'
    },
    en: {
        brand_name: 'Pestovo',
        nav_home: 'Home', nav_round: 'Round', nav_leaderboard: 'All Rounds',
        bn_home: 'Home', bn_round: 'Round', bn_rounds: 'Board', bn_guide: 'Course', bn_menu: 'Menu',
        nav_guide: 'Course Guide', nav_feed: 'Live Feed', nav_predictor: 'WHS Predictor', nav_oom: 'Order of Merit',
        nav_players: 'Players', nav_tournaments: 'Tournaments', nav_stats: 'Statistics',
        nav_handicaps: 'Handicaps', nav_admin: 'Admin', nav_login: 'Login',
        nav_assistant: 'Assistant',
        footer_club: '© 2024 Pestovo Golf Club',
        tab_design: 'Design 🎨',
        design_admin_title: 'Site design templates',
        design_admin_sub: 'The current design + 5 alternative templates. A template can be applied to the whole site, to a single page or to a single block — this is how a custom design is assembled from ready-made parts.',
        design_mode_title: 'Design mode',
        design_global_title: 'Base site template',
        design_preview_title: 'Live preview',
        design_preview_sub: 'On the left — how the site looks now with the current settings, then every template in full.',
        design_save_btn: 'Save the design for everyone',
        design_reset_btn: 'Restore the current design',
        design_pages_title: 'Template for each page',
        design_pages_sub: 'Works in the "Mix templates" mode. "Current" means the page follows the base site template.',
        design_blocks_title: 'Template for each block',
        design_blocks_sub: 'A block with its own template overrides the page template — this is how a unique design is assembled from different parts.',
        tab_assistant: 'Assistant',
        assistant_admin_title: 'Assistant settings',
        assistant_admin_sub: 'Add PDF documents by link — the assistant can answer questions based on them. Click "Save and rebuild" to refresh the knowledge base for all players.',
        assistant_hide_page: 'Show the "Assistant" page to everyone',
        assistant_hide_page_hint: 'Uncheck to completely remove the assistant page from the menu and block access to it.',
        assistant_add_source_title: 'Add document (PDF by link)',
        assistant_source_name: 'Document name',
        assistant_source_url: 'PDF link',
        assistant_add_btn: 'Add',
        assistant_sources_title: 'Knowledge base sources',
        assistant_rebuild_btn: 'Save and rebuild index',
        assistant_delete_btn: 'Delete',
        assistant_title: 'Pestovo Smart Assistant',
        assistant_clear: 'Clear',
        assistant_placeholder: 'Type your question…',
        assistant_send: 'Send',

        hero_sub: 'Pestovo Digital Scorecard',
        hero_title: 'Pestovo Live Scoring & Digital Scorecards',
        hero_desc: '18 Holes · Par 72',
        btn_start_game: 'Start Game',
        btn_view_scores: 'All Rounds',
        sec_now_playing: 'Currently Playing',
        sec_active_tournament: 'Active tournament',
        sec_my_active: 'My Active Rounds',
        continue_round: 'Continue Playing',
        sec_club_stats: 'Club Statistics',
        sec_course_card: 'Course Map',
        sec_recent_results: 'Recent Results',
        all_rounds: 'All Rounds',
        no_active_players: 'No active players on course',
        course_card_sub: '18 Holes · Par 72 · All Tees (meters)',
        address_str: '📍 Pestovo Golf Club, Mytishchi, Moscow Region',
        nav_header: 'Navigation',
        more_header: 'More',

        tee_bk: 'Black', tee_bl: 'Blue', tee_wh: 'White', tee_rd: 'Red',
        tee_opt_bk: '⬛ Black', tee_opt_bl: '🟦 Blue', tee_opt_wh: '⬜ White', tee_opt_rd: '🟥 Red',
        hole: 'Hole', par: 'Par', index: 'Index', gross: 'Gross',
        hole_lbl: 'Hole', par_lbl: 'Par', dist_lbl: 'Meters', deadline_lbl: 'Deadline',
        stbl_field: 'Stableford (Course)', stbl_exact: 'Stableford (Playing)',
        out: 'Out', in_side: 'In', total: 'Total', meters: 'Meters', deadline: 'Deadline',
        format_match_1v1: 'Match Play (1v1)',
        format_match_2v2: 'Match Play (2v2)',
        format_scramble: 'Scramble',
        voice_score_btn: 'Voice',
        hole_map_btn: '2D Map',
        analytics_title: 'Analytics',
        voice_not_supported: 'Voice input is not supported by your browser',
        no_data: 'No data',
        select_hole_title: 'Select Hole:',
        putts_label: 'Putts:',
        forecast_input_title: 'Handicap Predictor Data',
        select_registered_player: 'Select Registered Player:',
        planned_tee: 'Planned Tee:',
        guide_sub: 'Tactical Guide & Pestovo Pro Coach Tips',
        save_group: 'Save Group',
        test_group: 'Test Group',
        save_channel: 'Save Channel',
        test_channel: 'Test Channel',
        save_vk: 'Save VKontakte Settings',
        test_vk: 'Test VK Message',
        tg_integration_title: 'Telegram Integration: Referee Group & Club Channel',
        tg_integration_sub: 'Configure notification settings for Referee/Marshal Group and Club Channel.',
        tg_group_title: '1. Telegram Group (Referee/Marshal Calls)',
        tg_group_sub: '💡 Add bot to referee group. Chat ID usually starts with -100...',
        tg_channel_title: '2. Telegram Channel (Announcements & Results)',
        tg_channel_sub: '💡 Set bot as Channel Administrator with Post Messages permission.',
        placeholder_tg_channel_id: '@pestovo_golf or -1001987654321',
        vk_integration_title: 'VKontakte Integration (VK API)',
        vk_integration_sub: 'Referee/marshal call notifications will be sent instantly to your VK chat or DM.',
        vk_token_lbl: 'VK Community Access Token',
        placeholder_vk_peer_id: '2000000001 (chat) or 123456789 (user)',
        placeholder_bc_title: '🏆 Pestovo Championship 2024',
        placeholder_bc_body: 'Tournament registration is open! Start on Saturday at 10:00.',
        share_card: 'Share Scorecard (PNG)',
        download_png: 'Download Image (PNG)',
        share_native: 'Share to Apps',

        page_title_live: 'Start Round',
        page_sub_live: 'Solo or group round — switch tabs',
        round_setup: 'Round Settings',
        group_setup_title: 'Group Setup',
        solo_round: 'Solo Round', group_round: 'Group Round',
        solo_desc: 'Play solo. Enter your own score for each hole.',
        group_desc: '2 to 4 players. Dual entry (your score + partner score).',
        mode_solo_title: 'Solo Round',
        mode_solo_desc: 'Play solo. Enter your own score for each hole.',
        mode_group_title: 'Group Round',
        mode_group_desc: '2 to 4 players. Dual entry (your score + partner score).',
        mode_start: 'Start',
        tournament_opt: 'Tournament (optional)',
        no_tournament: '— No Tournament —',
        start_time: 'Start Time', start_hole: 'Start Hole', holes_count: 'Number of Holes',
        tee_select: 'Tee', format_select: 'Format',
        player_count: 'Number of Players',
        player_count_1: '1 Player', player_count_2: '2 Players', player_count_3: '3 Players', player_count_4: '4 Players',
        player_data: 'Player Details',
        select_registered: 'Select from registered users',
        guest_manual: '— Guest / enter manually —',
        first_name: 'First Name', last_name: 'Last Name', middle_name: 'Middle Name (optional)', gender_label: 'Gender',
        placeholder_first_name: 'John', placeholder_last_name: 'Doe', placeholder_middle_name: 'Jr.',
        placeholder_tn_name: 'Pestovo Championship',
        placeholder_hcp_calc: '+2.4 or 12.4',
        men: 'Male', women: 'Female',
        exact_hcp: 'Exact Handicap', field_hcp: 'Course Handicap',
        field_auto: 'Course HCP (auto)',
        start_round_btn: 'Start Round', back_btn: 'Back',
        timings_title: 'Hole Timings',
        pace_of_play: 'Pace of Play',
        pace_current_hole: 'Current hole',
        pace_completed: 'Completed',
        pace_delay: 'Total delay',
        pace_buffer: 'Buffer',
        pace_on_time: 'On pace',
        pace_warning: 'Slightly behind',
        pace_late: 'Behind pace',
        pace_severe: 'Severely behind',
        pace_pending: 'Timing appears after holes are saved',
        pace_deadline: 'Planned deadline',
        pace_hole_norm: 'Target',
        pace_in_progress: 'in progress',
        time_and_hole: 'Time and Hole',
        game_format: 'Game Format',

        my_score: 'My Score',
        marker_for: 'Marker for',
        score_of_player: 'Player score:',
        score_col_you: '(you enter your own score)',
        score_col_marked: '(the player you are marking for)',
        save_hole: 'Save Hole', finish_round: 'Finish Round',
        next_hole_btn: 'Confirm result',
        solo_next_hole_btn: 'Confirm result',
        solo_save_result_btn: '✅ Confirm result',
        solo_next_keep_btn: '➡️ Next hole',
        skipped_holes_title: 'Score not entered',
        skipped_holes_goto: 'Go to hole',
        skipped_holes_skip: 'Continue with gaps',
        skipped_holes_finish_q: 'No score on hole(s) {holes}. Finish the round anyway?',
        score_of_player: 'Your score',
        score_of_marked: 'Marked player’s score',
        tn_start_pending_title: 'The tournament has not started yet',
        tn_start_countdown_label: 'Starts in',
        tn_start_at: 'Start:',
        tn_start_gate_hint: 'Score entry opens automatically at the start time — no need to refresh the page.',
        tn_start_gate_started: '🏁 The tournament has started — you can enter scores now!',
        finish_blocked_title: 'The round cannot be finished yet',
        finish_blocked_hint: 'This notice disappears on its own as soon as every hole is confirmed.',
        show_stableford_points: 'Show Stableford points',
        show_stableford_points_hint: 'Handicap-adjusted points will appear next to the entered score. This setting is saved only for you.',
        stableford_default: 'Default Stableford display',
        stableford_default_hint: 'Show Stableford points next to the score for every player who has not selected a personal preference.',
        save_stableford_default: 'Save Stableford setting',
        confirm_final_hole: 'Finalize Hole 18',
        waiting_for_marker: '⏳ Your score is in. Waiting for the marker to confirm',
        hole_finalized_both: '✅ Score confirmed and finalized by both sides!',
        mismatch_error: '⚠️ Score mismatch with marker! Please correct before proceeding.',
        call_referee: 'Call Referee', call_marshal: 'Call Marshal',
        call_sent: 'Call sent',
        call_accepted: 'accepted the call',
        call_on_way: 'is on the way',
        call_retry_in: 'Call again in',
        call_cooldown: 'Another call will be available in',
        read_only_mode: 'View mode. Score entry is available to active players only.',
        view_only_group_desc: 'View mode. Score entry is available to active players only.',
        round_score: 'Round Score', hole_scorecard: 'Hole Scorecard',
        group_summary: 'Group Summary',
        connect_players: 'Connect Players',
        connect_players_title: 'Connect Group Players',
        connect_players_desc: 'Let other players scan their QR code to open their scorecard on their phones.',
        scan_to_play: 'Scan to play for this player',
        invite_qrs_collapse: 'Collapse player QR codes',
        invite_qrs_expand: 'Expand player QR codes',
        joined_in_game: 'In game',
        waiting_join: 'Waiting to join',
        ready_to_score: 'ready to score',
        ready_to_score_one: 'ready to score',
        of_word: 'of',
        all_joined: 'All players connected',
        qr_reconnect_hint: 'QR kept — you can reconnect',
        marker_score_short: 'M',
        legend_player_score: "player's score",
        legend_marker_score: "marker's score",
        legend_mismatch: 'mismatch',
        round_progress: 'Round Progress',
        finished_f: 'Finished (F)',

        res_hio: 'Hole-in-One!', res_albatross: 'Albatross', res_eagle: 'Eagle',
        res_birdie: 'Birdie', res_par: 'Par', res_bogey: 'Bogey', res_double: 'Double',

        weather_clear: 'Clear', weather_cloudy: 'Partly Cloudy', weather_fog: 'Fog',
        weather_rain: 'Rain', weather_snow: 'Snow', weather_thunder: 'Storm',
        wind_label: 'Wind',

        status_label: 'Status', status_all: 'All', status_active: 'Live', status_completed: 'Completed',
        date_filter_label: 'Period', date_from_label: 'From', date_to_label: 'To',
        date_filter_reset: 'Reset',
        date_preset_today: 'Today', date_preset_7d: '7 days', date_preset_30d: '30 days',
        date_preset_month: 'This month', date_preset_year: 'This year', date_preset_all: 'All time',
        date_filter_invalid: 'Start date is after the end date',
        rounds_found_label: 'Rounds found', rounds_total_label: 'Total rounds',
        period_label: 'Period', period_all_time: 'all time',
        no_rounds_in_period: 'No rounds in the selected period',
        all_players: 'All Players',
        type_registered: 'Registered Only',
        type_guests: 'Guests Only',
        sort_rounds: 'By Rounds', sort_gross: 'By Best Gross', sort_name: 'By Name',
        player_type: 'Player Type',
        sort_by: 'Sort By',
        role_admin: 'Chief Administrator',
        role_referee: 'Referee',
        role_marshal: 'Marshal',
        role_player: 'Player',
        export_csv_btn: 'Export All Rounds to CSV',
        download_backup_btn: 'Download Database Backup (JSON)',
        generate_flights_btn: 'Generate Tournament Flights',
        register_tournament_btn: 'Register for Tournament',
        registered_badge: 'Registered ✅',
        cancel_registration: 'Cancel Registration',
        participants_list: 'Registered Roster',
        registered_count: 'Registered Players',
        msg_tournament_registered: '🎉 Successfully registered for tournament!',
        msg_registration_cancelled: 'Registration cancelled',
        confirm_registration: 'Confirm Tournament Registration',
        tools_title: 'Tools & Features',
        gps_rangefinder: 'GPS Rangefinder',
        shot_tracking: 'Advanced Shot Tracking (FIR/GIR/Putts)',
        tv_mode: 'TV Broadcast Mode',
        h2h_duel: 'Head-to-Head Duel 1v1',
        enabled_lbl: 'Enabled ✅',
        disabled_lbl: 'Disabled ❌',
        send_broadcast_title: 'Send Club Push Announcement',
        send_broadcast_sub: 'Message will be sent to smartphones of all club players.',
        broadcast_title_lbl: 'Announcement Title',
        broadcast_body_lbl: 'Message Text',
        broadcast_link_lbl: 'Link (optional)',
        send_broadcast_btn: 'Send Broadcast to All Players',
        bc_audience_lbl: 'Audience',
        bc_aud_all_pwa: 'Everyone + PWA notifications (incl. guests)',
        tab_scores: 'Scores ⛳',
        scores_editor_title: 'All-rounds score editor',
        scores_editor_sub: 'Edit any hole of any player — active, scheduled or completed round. Find a player or round via search, expand the card, make changes and save.',
        scores_search_fio: 'Search by player name',
        scores_search_date: 'Round date',
        scores_search_status: 'Round status',
        bc_aud_all: 'All club players',
        bc_aud_tournament: 'Tournament (its registrations)',
        bc_aud_protocol: 'Players of the start list',
        bc_aud_tn_lbl: 'Tournament',
        bc_aud_proto_lbl: 'Start protocol',
        bc_aud_none: '— pick one —',
        bc_aud_hint: 'A targeted announcement is shown to its addressees only: the player page checks the recipient list and hides everything else.',
        bc_aud_count: 'Recipients',
        bc_aud_none_sel: 'Nobody to send to: the recipient list is empty',
        bc_aud_count_btn: 'Send announcement',
        feed_announcements_title: 'Club announcements',
        feed_announcements_empty: 'No announcements yet',
        broadcast_history_title: 'Sent Announcements History',
        edit_profile: 'Edit Profile',
        save_profile: 'Save Profile',
        cancel_btn: 'Cancel',
        expand_scorecard: 'Expand Scorecard',
        collapse_scorecard: 'Collapse Scorecard',
        expand_round: 'Expand round',
        collapse_round: 'Collapse round',
        expand_all_rounds: 'Expand all',
        collapse_all_rounds: 'Collapse all',
        live_rounds_hint: 'You can see who is on the course now. Tap a row to expand details',
        field_map_title: 'Hole map & starts',
        privacy_title: 'Name privacy (Full name)',
        privacy_sub: 'Hide players\' full names (first, last, patronymic) from other players and guests. Initials or a mask are shown instead, while handicap and round history remain visible.',
        privacy_global_lbl: 'Hide all players\' full names from others (globally)',
        privacy_global_sub: 'Enable to hide full names for all players at once.',
        privacy_mask_lbl: 'Hidden name format',
        privacy_opt_initials: 'Initials (I. T.)',
        privacy_opt_masked: 'Full mask (Player #N)',
        privacy_save_btn: 'Save privacy settings',
        privacy_hide_btn: 'Hide name',
        privacy_show_btn: 'Show name',
        my_round_tag: 'My round',
        current_round_tag: 'Current',
        leader_lbl: 'Leader',
        sc_topar_lbl: 'To-par by hole',
        to_current_hole: 'To current hole',
        card_marker_lbl: 'Marker',
        no_current_hole: 'Current hole is not set yet',
        avatar_label: 'Profile Avatar',
        upload_photo: 'Upload Photo',
        choose_preset: 'Or choose icon preset',
        phone_label: 'Phone Number',
        default_tee: 'Default Preferred Tee',
        msg_profile_saved: '✅ Profile updated!',
        search_label: 'Search Player',
        search_placeholder: 'Search by name...',
        page_title_handicaps: 'Course Handicaps',
        page_sub_handicaps: 'Pestovo · Par 72',
        admin_login_title: 'Admin Panel Login',
        remember_me: 'Remember me',
        forgot_password: 'Forgot password?',
        admin_logout: 'Log out Admin',
        tournament_date_label: 'Date',
        tournament_name_label: 'Name',
        all_genders: 'All', men_plural: 'Male', women_plural: 'Female',
        quick_calc: 'Quick Calculator',
        full_table: 'View Full Table',
        full_table_title: 'View Full Table',
        full_table_sub: 'Select gender and tee — table will appear below',
        tbl_gender: 'Player Gender',
        tbl_select_gender: '— Gender —',
        tbl_select_tee: '— Tee —',
        select_gender_first: '— Gender First —',
        from_col: 'Handicap From', to_col: 'Handicap To',
        round_history: 'Round History',

        // Player interface modes
        large_ui_mode: 'Large text and buttons',
        strong_vibration_mode: 'Stronger vibration',
        high_contrast_mode: 'High-visibility status colors',
        battery_saver_mode: 'Battery saver',
        player_modes_title: 'My preferences',
        my_preferences_title: 'My preferences',
        mode_on: 'On',
        mode_off: 'Off',

        // Solo & Guest
        solo_sub: 'Pestovo Golf Club',
        current_score: 'Current Score',
        view_mode_notice: 'View mode.',

        // Admin & Auth
        admin_login: 'Admin Panel Login',
        admin_panel: 'Admin Panel',
        admin_desc: 'Log in with master password or authenticate with an admin account.',
        username: 'Username', password: 'Password',
        login_btn: 'Log In', register_btn: 'Register', create_account: 'Create Account',
        continue_guest: 'Continue as Guest',
        tab_rounds: 'Rounds', tab_alerts: 'Alerts 🚨', tab_groups: 'Groups now ⏱️', tab_tournaments: 'Tournaments 🏆',
        tab_start: 'Tournament Start 🏁',
        tab_players: 'Players & Roles', tab_data: 'Data',
        tab_importexport: 'Import/Export 📊', tab_rusgolf: 'RUSGOLF 🇷🇺',
        imp_exp_title: 'Player Import & Export (Excel)',
        imp_exp_sub: 'Export the player list to an Excel table and import players back: first name, last name and exact handicap.',
        rg_title: 'Handicap Lookup — RGA Database',
        rg_sub: 'Look up a player\'s exact Handicap Index (HI) in the official Russian Golf Association database (hcp.rusgolf.ru) and add players to your site.',
        all_tournaments: 'All Tournaments',
        create_tournament: 'Create Tournament',
        tournament_name: 'Name', tournament_date: 'Date',
        available_formats: 'Available Formats', available_tees: 'Available Tees',
        create_btn: 'Create',
        admin_only_tournaments: 'Tournaments are created by administrators only.',
        admin_panel_link: 'Admin Panel',
        referee_marshal_calls: 'Referee & Marshal Calls',
        admin_groups_title: 'Groups currently playing',
        admin_groups_sub: 'Pace monitoring for active group rounds',
        admin_no_groups: 'There are no active group rounds',
        admin_group_players: 'Players',
        admin_start_time: 'Start time',
        admin_start_hole: 'Start hole',
        admin_current_hole: 'Current hole',
        admin_hole_timings: 'Hole-by-hole timing',
        admin_total_delay: 'Total delay',
        enable_push_notifications: 'Enable Push Notifications',
        manage_players_roles: 'Manage Players & Roles',
        manage_players_sub: 'Assign Administrator rights to other players. Administrators get full access to this panel.',
        data_management: 'Data Management',
        data_danger_sub: 'Caution — actions are irreversible.',
        page_visibility_title: 'Manage Page & Feature Visibility',
        page_visibility_sub: 'Uncheck any page or feature to completely hide it from the navigation menu for players.',
        save_visibility_btn: 'Save Settings',
        hcp_variant_title: 'Handicap checkmark style',
        hcp_variant_sub: 'The green “handicap synced” checkmark and update date are shown in the Players tab, player profile and the admin list. The choice applies to all players.',
        hcp_variant_1: '1 · Compact check',
        hcp_variant_2: '2 · “Updated” pill',
        hcp_variant_3: '3 · Check on avatar',
        social_card_variant_title: 'Social PNG scorecard style',
        social_card_variant_sub: 'Choose one of three layouts. The selected design is used for every newly exported PNG scorecard.',
        social_card_variant_1: '1 · Classic',
        social_card_variant_2: '2 · Result focus',
        social_card_variant_3: '3 · Tournament',
        group_card_variant_title: 'Group round card layout on home page',
        group_card_variant_sub: 'Choose the layout for the unified group round card on the home page. Applies to all users.',
        group_card_variant_1: '1 · Summary Matrix',
        group_card_variant_2: '2 · Comparison Table',
        group_card_variant_3: '3 · Flight Leaderboard',
        tn_card_variant_title: 'Player scorecard in the tournament leaderboard',
        tn_card_variant_sub: 'A player taps their row in the tournament leaderboard (Tournaments page) and their scorecard opens. Pick one of three styles. Applies to all users.',
        tn_card_variant_1: '1 · Official card',
        tn_card_variant_2: '2 · Hole tiles',
        tn_card_variant_3: '3 · Tournament board',
        tn_card_preview: 'Preview — how the card looks for a player:',
        players_display_title: '“Players” page layout',
        players_display_sub: 'Choose one of three player-list layouts. The setting applies to all users.',
        players_display_variant_1: '1 · Cards',
        players_display_variant_2: '2 · Compact list',
        players_display_variant_3: '3 · Showcase',
        stats_display_title: '“Statistics” page layout',
        stats_display_sub: 'Choose one of three club-statistics layouts. The setting applies to all users.',
        stats_display_variant_1: '1 · Cards',
        stats_display_variant_2: '2 · Summary',
        stats_display_variant_3: '3 · Dashboard',
        rounds_display_title: '“All Rounds” page layout',
        rounds_display_sub: 'Choose one of three round-list layouts. The setting applies to all users.',
        rounds_display_variant_1: '1 · Current list',
        rounds_display_variant_2: '2 · Table',
        rounds_display_variant_3: '3 · Round showcase',
        home_display_title: '“Home” page layout',
        home_display_sub: 'Choose one of three home page layouts. The setting applies to all users.',
        home_display_variant_1: '1 · Classic',
        home_display_variant_2: '2 · Compact',
        home_display_variant_3: '3 · Showcase',
        guide_display_title: '“Course Guide” page layout',
        guide_display_sub: 'Choose one of three course-guide layouts. The setting applies to all users.',
        guide_display_variant_1: '1 · Hole card',
        guide_display_variant_2: '2 · Compact',
        guide_display_variant_3: '3 · Tabloid',
        feed_display_title: '“Event Feed” page layout',
        feed_display_sub: 'Choose one of three feed layouts. The setting applies to all users.',
        feed_display_variant_1: '1 · Feed',
        feed_display_variant_2: '2 · Compact',
        feed_display_variant_3: '3 · Poster',
        predictor_display_title: '“WHS Simulator” page layout',
        predictor_display_sub: 'Choose one of three simulator layouts. The setting applies to all users.',
        predictor_display_variant_1: '1 · Standard',
        predictor_display_variant_2: '2 · Compact',
        predictor_display_variant_3: '3 · Dashboard',
        'order-of-merit_display_title': '“Season Ranking” page layout',
        'order-of-merit_display_sub': 'Choose one of three season-ranking layouts. The setting applies to all users.',
        'order-of-merit_display_variant_1': '1 · Table',
        'order-of-merit_display_variant_2': '2 · Compact',
        'order-of-merit_display_variant_3': '3 · Podium',
        tournaments_display_title: '“Tournaments” page layout',
        tournaments_display_sub: 'Choose one of three tournament-list layouts. The setting applies to all users.',
        tournaments_display_variant_1: '1 · List',
        tournaments_display_variant_2: '2 · Compact',
        tournaments_display_variant_3: '3 · Showcase',
        handicap_display_title: '“Handicaps” page layout',
        handicap_display_sub: 'Choose one of three handicap calculator and table layouts. The setting applies to all users.',
        handicap_display_variant_1: '1 · Standard',
        handicap_display_variant_2: '2 · Compact',
        handicap_display_variant_3: '3 · Showcase',
        assistant_display_title: '“Assistant” page layout',
        assistant_display_sub: 'Choose one of three assistant-chat layouts. The setting applies to all users.',
        assistant_display_variant_1: '1 · Classic chat',
        assistant_display_variant_2: '2 · Compact',
        assistant_display_variant_3: '3 · Large',
        all_players_joined: 'All players have already joined the round',
        tab_broadcasts: 'Announcements 📢',
        delete_all_rounds: 'Delete All Rounds',
        delete_all_data: 'Delete All Players & Rounds',
        delete_all_data_sub: 'Permanently removes every player and every round. Data disappears from all lists, stats and autocomplete and will not reappear.',
        wipe_everything: 'Delete all data',
        wipe_everything_sub: 'Erases absolutely everything: tournaments, players, rounds, history, markers, protocols, broadcasts, reactions, demo names and all local caches. Design and admin access settings are kept.',
        full_name: 'Full Name',
        repeat_password: 'Repeat Password',

        // Scorer & Marker
        scorer_title: 'Score Entry',
        marker_title: '👁️ Marker',
        confirm_score_sub: 'Score Confirmation',
        marker_notice_title: 'You are a Marker',
        marker_notice_desc: 'Enter observed score. Confirmed only when scores match.',
        confirm_btn: 'Confirm',

        // Stats
        page_title_stats: 'Club Statistics',
        page_sub_stats: 'Analytics across all rounds',
        total_stats: 'General Statistics',
        top_players: 'Top Players',
        club_records: 'Club Records',
        hole_difficulty: 'Hole Difficulty',

        // Offline & Error
        offline_title: 'No Connection',
        offline_desc: 'Check your internet connection. Your scores are saved locally.',
        refresh_btn: 'Refresh', error_title: 'Error', qr_invalid: 'QR code is invalid.',

        // Toast Messages
        msg_start_time_req: 'Specify start time',
        msg_name_req: 'Enter player name',
        msg_exact_hcp_req: 'Specify exact handicap',
        msg_round_started: '🏌️ Round Started!',
        msg_saved_hole: '✅ Saved for Hole ',
        msg_edit_disabled: 'Editing disabled',
        msg_score_min: 'Score must be ≥ 1',
        msg_finish_confirm: 'Finish round?',
        msg_round_finished: '🏁 Round Completed!',

        player: 'Player', players_label: 'Players', guest: 'GUEST', start: 'Start', date: 'Date', format: 'Format',
        round_leader: 'Round Leader', no_completed: 'No completed rounds yet',

        unsaved_score_hint: 'Score is not saved yet — press the “Save” button',
        start_hint_title: 'Which hole is best to start from?',
        field_hcp_short: 'Course HCP',
        exact_hcp_short: 'Exact HCP',
        total_players_on_course: 'Total players on course',
        total_players_label: 'Total players',
        free_holes_label: 'Free holes',
        busy_holes_label: 'Busy holes',
        tee_label: 'Tee'
    }
};

// Год копирайта всегда актуален
(function(){ var y = new Date().getFullYear(); if (I18N.ru) I18N.ru.footer_club = '© ' + y + ' Гольф-клуб Пестово'; if (I18N.en) I18N.en.footer_club = '© ' + y + ' Pestovo Golf Club'; })();

function t(key) {
    var lang = (typeof currentLang !== 'undefined' && currentLang) ? currentLang : 'ru';
    try {
        if (I18N[lang] && I18N[lang][key] !== undefined) {
            return I18N[lang][key];
        }
        if (I18N['ru'] && I18N['ru'][key] !== undefined) {
            return I18N['ru'][key];
        }
    } catch(e) {}
    return key;
}

function toggleLang() {
    currentLang = currentLang === 'ru' ? 'en' : 'ru';
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('pestovo_lang', currentLang);
    }
    try { document.documentElement.setAttribute('lang', currentLang); } catch(e) {}
    applyTranslations();
    updateLangButtons();
    if (typeof applyPlayerModes === 'function') applyPlayerModes();
    if (typeof refreshOfficialCallBindings === 'function') refreshOfficialCallBindings();
    if (typeof renderAdmGroups === 'function') renderAdmGroups();
    // Список раундов в админке перерисовываем только при открытой панели —
    // иначе подписали бы на данные rounds тех, у кого нет доступа.
    if (typeof loadAdmRounds === 'function' && typeof hasAdminPanelAccess === 'function' && hasAdminPanelAccess()) {
        var admContent = document.getElementById('admin-content');
        if (admContent && !admContent.classList.contains('hidden')) loadAdmRounds();
    }
    if (typeof buildMobileDrawer === 'function') {
        var drawerRoot = document.getElementById('mobile-drawer-root');
        var wasOpen = drawerRoot && drawerRoot.classList.contains('open');
        buildMobileDrawer();
        if (wasOpen && drawerRoot) drawerRoot.classList.add('open');
    }
    if (typeof toast === 'function') {
        toast(currentLang === 'en' ? '🇬🇧 English language enabled' : '🇷🇺 Выбран русский язык', 'info');
    }
    if (typeof loadLiveRounds === 'function') loadLiveRounds();
    if (typeof loadRecentResults === 'function') loadRecentResults();
    if (typeof loadLB === 'function') loadLB();
    if (typeof loadPlayers === 'function') loadPlayers();
    if (typeof loadStats === 'function') loadStats();
    if (typeof loadPestovoWeather === 'function') loadPestovoWeather('nav-weather-container');
    if (typeof showGroupSetup === 'function' && document.getElementById('group-setup') && !document.getElementById('group-setup').classList.contains('hidden')) {
        showGroupSetup();
    }
    if (typeof initRoundView === 'function' && typeof curRid !== 'undefined' && curRid) {
        initRoundView();
    }
    if (typeof initSoloView === 'function') {
        initSoloView();
    }
    if (typeof updateHcpTable === 'function') updateHcpTable();
    if (typeof loadClubStats === 'function') loadClubStats();
    if (typeof loadMyActiveRounds === 'function') {
        loadMyActiveRounds('my-active-rounds-container');
    }
}

function updateLangButtons() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.lang-btn').forEach(function(btn) {
        btn.innerHTML = currentLang === 'en' ? '🇬🇧 EN' : '🇷🇺 RU';
    });
}

function applyTranslations() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        if (key && I18N[currentLang] && I18N[currentLang][key] !== undefined) {
            el.innerHTML = I18N[currentLang][key];
        }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-placeholder');
        if (key && I18N[currentLang] && I18N[currentLang][key] !== undefined) {
            el.setAttribute('placeholder', I18N[currentLang][key]);
        }
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
        var key = el.getAttribute('data-i18n-title');
        if (key && I18N[currentLang] && I18N[currentLang][key] !== undefined) {
            el.setAttribute('title', I18N[currentLang][key]);
        }
    });
    // Подписи пресетов и сводка фильтра по датам строятся через t() — обновляем их тоже.
    if (typeof refreshDateRangeFilters === 'function') refreshDateRangeFilters();
}

/* Применяем переводы и тему мгновенно (скрипт внизу <body> — DOM уже распаршен),
   чтобы не было «вспышки» исходного текста/темы при загрузке */
try { if (document.documentElement) document.documentElement.setAttribute('lang', currentLang); } catch(e) {}
applyTranslations();
document.addEventListener('DOMContentLoaded', function() {
    applyTranslations();
    updateFooterYear();
});

// Динамический год копирайта (никогда не устареет)
function updateFooterYear() {
    if (typeof document === 'undefined') return;
    var year = new Date().getFullYear();
    document.querySelectorAll('.footer-bottom p').forEach(function(p) {
        p.innerHTML = p.innerHTML.replace(/(©|&copy;)\s*\d{4}/g, '$1 ' + year).replace(/&copy;\s*\d{4}/g, '&copy; ' + year);
    });
}
updateFooterYear();

// ==========================================
// БЛОК «МОИ АКТИВНЫЕ РАУНДЫ»
// ==========================================
function loadMyActiveRounds(targetId) {
    var el = document.getElementById(targetId);
    if (!el || typeof db === 'undefined') return;

    bindRealtimeValue('my-active-rounds:' + targetId, db.ref('rounds'), function(snap) {
        var data = snap.val() || {};
        if (typeof sweepStaleRounds === 'function') data = sweepStaleRounds(data) || {};
        var myActive = [];

        Object.entries(data).forEach(function(e) {
            var id = e[0], r = e[1];
            if (!r || r.status !== 'active') return;

            var localSoloKey = localStorage.getItem('pestovo_solo_key_' + id);
            var localGroupKey = localStorage.getItem('pestovo_group_key_' + id);
            var localActingAs = localStorage.getItem('pestovo_acting_as_' + id);

            var isCreatedByMe = false;
            var resumePid = null;

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
                // Жёстко прописываем ?as=<игрок>: даже если localStorage
                // стёрся (другое устройство/кэш), продолжение НЕ откроется
                // в режиме «только просмотр».
                if (localActingAs && r.players && r.players[localActingAs]) resumePid = localActingAs;
                else if (currentUser && r.players && r.players[currentUser.uid]) resumePid = currentUser.uid;
                else if (r.creatorPlayerId && r.players && r.players[r.creatorPlayerId]) resumePid = r.creatorPlayerId;
                else if (r.mode === 'solo') resumePid = Object.keys(r.players || {})[0] || null;
                myActive.push({ id: id, round: r, resumePid: resumePid });
            }
        });

        if (myActive.length === 0) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }

        myActive.sort(function(a, b) { return (b.round.createdAt || 0) - (a.round.createdAt || 0); });

        var html = '<div class="card" style="border:2px solid var(--gold);background:linear-gradient(135deg, rgba(201,168,76,0.12), var(--card));margin-bottom:24px;">';
        html += '<h2 style="color:var(--gold);margin-bottom:12px;"><i class="fas fa-play-circle"></i> ' + t('sec_my_active') + '</h2>';
        html += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">' + (currentLang === 'en' ? 'You have an active round in progress:' : 'У вас есть начатый раунд. Нажмите, чтобы продолжить игру:') + '</p>';

        myActive.forEach(function(item) {
            var id = item.id, r = item.round;
            var link = 'setup-round.html?round=' + id + (item.resumePid ? '&as=' + encodeURIComponent(item.resumePid) : '');
            var modeIcon = r.mode === 'solo' ? '<i class="fas fa-user"></i> ' + t('solo_round') : '<i class="fas fa-users"></i> ' + t('group_round');
            var teePill = fmtRoundTeePills(r);
            var resume = getRoundResumeState(id, r);
            var pace = resume.metrics;
            var paceState = paceStatus(pace.overallDelay);
            var progressPercent = resume.holeCount ? Math.min(100, Math.round((resume.holesPlayed / resume.holeCount) * 100)) : 0;
            var playersCount = Object.keys(r.players || {}).length;
            var progressLabel = currentLang === 'en' ? 'Progress' : 'Прогресс';
            var currentHoleLabel = currentLang === 'en' ? 'Current hole' : 'Текущая лунка';
            var paceLabel = currentLang === 'en' ? 'Pace' : 'Темп';

            html += '<div class="list-item resume-round-card" style="padding:16px;background:var(--input);border:1px solid var(--border);margin-bottom:10px;flex-wrap:wrap;gap:12px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<div style="font-weight:800;font-size:16px;color:var(--white);"><span class="live-dot" style="width:7px;height:7px;margin-right:6px;"></span> ' + t('brand_name') + ' · ' + modeIcon + '</div>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    t('start') + ': ' + fmtTime(r.startTime) + ' · ' + t('hole') + ': №' + (r.startHole || 1) + ' · ' + t('tee_select') + ': ' + teePill + ' · ' + t('player') + ': ' + playersCount + '</div>';
            html += '<div class="resume-round-meta">' +
                    '<span><b>' + currentHoleLabel + ':</b> №' + resume.currentHole + '</span>' +
                    '<span><b>' + progressLabel + ':</b> ' + resume.holesPlayed + '/' + resume.holeCount + '</span>' +
                    '<span style="color:' + paceState.color + '"><b>' + paceLabel + ':</b> ' + formatPaceDelta(pace.overallDelay) + '</span>' +
                    '</div>';
            html += '<div class="resume-progress-track" aria-label="' + progressLabel + '">' +
                    '<span style="width:' + progressPercent + '%;background:' + paceState.color + ';"></span></div>';
            html += '</div>';
            html += '<a href="' + link + '" class="btn btn-g resume-round-button" style="align-self:center;"><i class="fas fa-gamepad"></i> ' + t('continue_round') + '</a>';
            html += '</div>';
        });

        html += '</div>';
        el.innerHTML = html;
        el.classList.remove('hidden');
    });
}

// ==========================================
// СЕССИЯ ИГРОКА ПО ФИО (1 активная сессия)
// ==========================================
// Стирание ВСЕХ локальных игровых сессий (после «Удалить все данные»
// в админке): ключи доступа к раундам, роль «действующего игрока»,
// сохранённые текущие лунки и отметки пропусков.
function pestovoWipeLocalSessions(reload) {
    var prefixes = [
        'pestovo_solo_key_', 'pestovo_group_key_', 'pestovo_acting_as_',
        'pestovo_resume_hole_', 'pestovo_skip_ack_', 'pestovo_finish_req_'
    ];
    [localStorage, sessionStorage].forEach(function(store) {
        var keys = [];
        try {
            for (var i = 0; i < store.length; i++) keys.push(store.key(i));
        } catch (e) { return; }
        keys.forEach(function(k) {
            if (!k) return;
            for (var j = 0; j < prefixes.length; j++) {
                if (k.indexOf(prefixes[j]) === 0) { try { store.removeItem(k); } catch (e) {} break; }
            }
        });
    });
    if (reload && typeof window !== 'undefined' && /setup-round\.html/.test(window.location.pathname + window.location.search)) {
        try { window.location.reload(); } catch (e) {}
    }
}

// Сессия привязана к имени и фамилии. Если телефон разрядился —
// игрок может зайти с другого устройства по ФИО и продолжить игру.
// Блокировка повторного старта: нельзя создать новый раунд, если
// предыдущий не завершён.
function pestovoNormalizeFio(str) {
    return String(str == null ? '' : str).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function pestovoFioTokens(str) {
    var n = pestovoNormalizeFio(str);
    if (!n) return [];
    return n.split(' ').filter(function(w) { return w.length >= 2; });
}

// Совпадение ФИО: все токены поиска должны присутствовать в имени игрока
// КАК ОТДЕЛЬНЫЕ СЛОВА (с точностью до «ё»→«е»). Пример: поиск «Иван Петров»
// найдёт «Иван Петрович Петров», но НЕ найдёт «Иван Петровский» — раньше
// подстрочное совпадение («петров» ⊂ «петровский») ложно блокировало старт
// нового раунда из-за чужой активной сессии.
function pestovoFioTokensMatch(playerName, searchFio) {
    var pNorm = pestovoNormalizeFio(playerName);
    var searchTokens = pestovoFioTokens(searchFio);
    if (!pNorm || !searchTokens.length) return false;
    var playerWords = pNorm.split(' ').filter(Boolean);
    for (var i = 0; i < searchTokens.length; i++) {
        var tok = searchTokens[i];
        var found = playerWords.some(function(w) { return w === tok; });
        if (!found) return false;
    }
    return true;
}

function pestovoCollectActiveRoundsByFio(data, searchFio) {
    var out = [];
    var normSearch = pestovoNormalizeFio(searchFio);
    if (!normSearch) return out;
    Object.entries(data || {}).forEach(function(e) {
        var rid = e[0], r = e[1];
        if (!r || (r.status !== 'active' && r.status !== 'scheduled')) return;
        var players = r.players || {};
        Object.entries(players).forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pid, p && p.name)) return;
            var name = (p && p.name) || '';
            // также проверяем firstName+lastName отдельно
            if (!name && p) {
                name = ((p.firstName || '') + ' ' + (p.middleName || '') + ' ' + (p.lastName || '')).trim();
            }
            if (pestovoFioTokensMatch(name, normSearch)) {
                out.push({ roundId: rid, round: r, playerId: pid, player: p });
            }
        });
    });
    return out;
}

function pestovoFindActiveRoundsByFio(fio) {
    return new Promise(function(resolve, reject) {
        if (typeof db === 'undefined' || !db) { resolve([]); return; }
        db.ref('rounds').once('value').then(function(sn) {
            var data = sn.val() || {};
            if (typeof sweepStaleRounds === 'function') data = sweepStaleRounds(data) || {};
            var res = pestovoCollectActiveRoundsByFio(data, fio);
            resolve(res);
        }).catch(function(err) {
            console.warn('[session] find by fio failed', err);
            resolve([]);
        });
    });
}

function pestovoCheckFioConflictsForGroup(fioList) {
    // fioList: array of strings (full names)
    return new Promise(function(resolve) {
        if (!fioList || !fioList.length) { resolve([]); return; }
        pestovoFindActiveRoundsByFio('').then(function() {}); // dummy to ensure db ready
        if (typeof db === 'undefined' || !db) { resolve([]); return; }
        db.ref('rounds').once('value').then(function(sn) {
            var data = sn.val() || {};
            if (typeof sweepStaleRounds === 'function') data = sweepStaleRounds(data) || {};
            var conflicts = [];
            fioList.forEach(function(fio) {
                if (!pestovoNormalizeFio(fio)) return;
                var matches = pestovoCollectActiveRoundsByFio(data, fio);
                if (matches.length) {
                    matches.forEach(function(m) {
                        conflicts.push({ inputFio: fio, roundId: m.roundId, round: m.round, playerId: m.playerId, player: m.player });
                    });
                }
            });
            resolve(conflicts);
        }).catch(function() { resolve([]); });
    });
}

function pestovoRenderFioResumeListHtml(matches, opts) {
    opts = opts || {};
    if (!matches || !matches.length) {
        return '<div class=\"empty\" style=\"padding:12px;\"><p>' + (currentLang === 'en' ? 'No active rounds found for this name.' : 'Активных раундов для этого имени не найдено.') + '</p></div>';
    }
    var html = '<div style=\"display:flex;flex-direction:column;gap:10px;\">';
    matches.forEach(function(item) {
        var r = item.round, rid = item.roundId;
        var link = 'setup-round.html?round=' + rid + '&as=' + item.playerId;
        var resume = (typeof getRoundResumeState === 'function') ? getRoundResumeState(rid, r) : { currentHole: r.startHole || 1, holesPlayed: 0, holeCount: 18, metrics: { overallDelay: 0 } };
        var modeIcon = r.mode === 'solo' ? '<i class=\"fas fa-user\"></i> ' + (typeof t === 'function' ? t('solo_round') : 'Solo') : '<i class=\"fas fa-users\"></i> ' + (typeof t === 'function' ? t('group_round') : 'Group');
        var startDate = r.startTime ? new Date(r.startTime) : null;
        var dateStr = startDate ? (startDate.toLocaleDateString() + ' ' + fmtTime(r.startTime)) : '—';
        var curHole = resume.currentHole || r.startHole || 1;
        var played = resume.holesPlayed || 0;
        var total = resume.holeCount || getRoundHoleCount(r) || 18;
        var playerName = item.player && item.player.name ? item.player.name : (item.inputFio || '');
        html += '<div class=\"list-item\" style=\"padding:12px;flex-wrap:wrap;gap:8px;\">' +
            '<div style=\"flex:1;min-width:180px;\">' +
            '<div style=\"font-weight:800;color:var(--white);\"><i class=\"fas fa-circle-play\" style=\"color:var(--gold);\"></i> ' + escapeHtml(playerName) + ' · ' + modeIcon + '</div>' +
            '<div style=\"font-size:12px;color:var(--muted);margin-top:4px;\">' + (currentLang === 'en' ? 'Start' : 'Старт') + ': ' + dateStr + ' · ' + (currentLang === 'en' ? 'Hole' : 'Лунка') + ': №' + curHole + ' · ' + played + '/' + total + '</div>' +
            (r.tournamentName ? '<div style=\"font-size:11px;color:var(--gold);margin-top:2px;\"><i class=\"fas fa-trophy\"></i> ' + escapeHtml(r.tournamentName) + '</div>' : '') +
            '</div>' +
            '<div style=\"display:flex;flex-direction:column;gap:6px;align-self:center;\">' +
            '<a href=\"' + link + '\" class=\"btn btn-g btn-sm\"><i class=\"fas fa-play\"></i> ' + (currentLang === 'en' ? 'Continue' : 'Продолжить') + '</a>' +
            '<a href=\"' + link + '&finish=1\" class=\"btn btn-ol btn-sm\"><i class=\"fas fa-flag-checkered\"></i> ' + (currentLang === 'en' ? 'Finish round' : 'Завершить раунд') + '</a>' +
            '</div></div>';
    });
    html += '</div>';
    return html;
}

// Блокировка старта нового раунда, если у игрока уже есть активный
function pestovoShowFioConflictModal(conflicts, onContinueAnyway) {
    var overlayId = 'fio-conflict-modal';
    var existing = document.getElementById(overlayId);
    if (existing) existing.remove();
    var html = '<div id="' + overlayId + '" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;padding:16px;">' +
        '<div class="card" style="max-width:520px;width:100%;max-height:85vh;overflow:auto;border:2px solid var(--gold);">' +
        '<h2 style="color:var(--gold);"><i class="fas fa-triangle-exclamation"></i> ' + (currentLang === 'en' ? 'Active round exists' : 'Есть незавершённый раунд') + '</h2>' +
        '<p style="font-size:13px;color:var(--muted);margin-bottom:12px;">' +
        (currentLang === 'en' ? 'This player already has an active round. You cannot start a new one until the previous is finished. You can continue the existing round:' : 'У этого игрока уже есть незавершённый раунд. Нельзя создать новый, пока предыдущий не завершён. Можно продолжить существующий:') +
        '</p>' +
        pestovoRenderFioResumeListHtml(conflicts) +
        '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">' +
        '<button class="btn btn-ol btn-sm" onclick="document.getElementById(\'' + overlayId + '\').remove()"><i class="fas fa-xmark"></i> ' + (currentLang === 'en' ? 'Cancel' : 'Отмена') + '</button>' +
        (onContinueAnyway ? '<button class="btn btn-r btn-sm" id="fio-conflict-continue"><i class="fas fa-forward"></i> ' + (currentLang === 'en' ? 'Start anyway (admin)' : 'Начать всё равно') + '</button>' : '') +
        '</div></div></div>';
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstChild);
    // Колбэк «Начать всё равно» вешаем слушателем, а не сериализуем в
    // inline-onclick: там он терял замыкание (proceedWithGroupStart /
    // proceedToCreate — локальные функции), и кнопка молча не работала —
    // игрок не мог ни создать раунд, ни закрыть чужую зависшую сессию.
    var continueBtn = document.getElementById('fio-conflict-continue');
    if (continueBtn && onContinueAnyway) {
        continueBtn.addEventListener('click', function() {
            var overlay = document.getElementById(overlayId);
            if (overlay) overlay.remove();
            try {
                if (typeof onContinueAnyway === 'function') onContinueAnyway();
                else if (typeof onContinueAnyway === 'string') {
                    try { (new Function(onContinueAnyway))(); } catch (e) { console.warn('[fio-conflict]', e); }
                }
            } catch (e) {
                console.warn('[fio-conflict] continue failed', e);
            }
        });
    }
}

// ==========================================
// ПОГОДНЫЙ ВИДЖЕТ И ВЕКТОР ВЕТРА В ШАПКЕ
// ==========================================
function getWindCardinal(deg) {
    var directions = currentLang === 'en' 
        ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
        : ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
    var idx = Math.round((deg % 360) / 45) % 8;
    return directions[idx];
}

function getWeatherCodeInfo(code) {
    if (code === 0) return { icon: '☀️', text: t('weather_clear') };
    if (code >= 1 && code <= 3) return { icon: '🌤️', text: t('weather_cloudy') };
    if (code === 45 || code === 48) return { icon: '🌫️', text: t('weather_fog') };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', text: t('weather_rain') };
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { icon: '❄️', text: t('weather_snow') };
    if (code >= 95) return { icon: '⛈️', text: t('weather_thunder') };
    return { icon: '🌤️', text: 'Pestovo' };
}

function loadPestovoWeather(targetId) {
    targetId = targetId || 'nav-weather-container';
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
                '<div class="weather-item"><span class="weather-icon">' + weather.icon + '</span><b>' + tempStr + '</b> <span class="weather-desc" style="color:var(--muted);font-size:10px;">(' + weather.text + ')</span></div>' +
                '<div class="weather-divider"></div>' +
                '<div class="weather-item"><i class="fas fa-location-arrow wind-arrow" style="transform:rotate(' + (windDeg - 45) + 'deg);"></i> <b>' + windSpeed + ' m/s ' + windDir + '</b></div>' +
                '</div>';

            el.innerHTML = html;
            el.classList.remove('hidden');
        }).catch(function() {
            var html = '<div class="weather-widget">' +
                '<div class="weather-item"><span class="weather-icon">⛳</span> <b>Pestovo</b></div>' +
                '<div class="weather-divider"></div>' +
                '<div class="weather-item"><i class="fas fa-wind" style="color:var(--gold);"></i> <b>3 m/s SW</b></div>' +
                '</div>';
            el.innerHTML = html;
            el.classList.remove('hidden');
        });
    } else {
        var html = '<div class="weather-widget">' +
            '<div class="weather-item"><span class="weather-icon">⛳</span> <b>Pestovo</b></div>' +
            '<div class="weather-divider"></div>' +
            '<div class="weather-item"><i class="fas fa-wind" style="color:var(--gold);"></i> <b>3 m/s SW</b></div>' +
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
        toast(isSun ? (currentLang === 'en' ? '☀️ Sun mode enabled' : '☀️ Включён режим «Яркое солнце»') : (currentLang === 'en' ? '🌙 Dark mode enabled' : '🌙 Включена тёмная тема'), 'info');
    }
}

function updateSunModeButtons() {
    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');
    document.querySelectorAll('.sun-mode-btn').forEach(function(btn) {
        btn.innerHTML = isSun ? '<i class="fas fa-sun"></i> ' + (currentLang === 'en' ? 'Sun ✅' : 'Солнце ✅') : '<i class="far fa-sun"></i> ' + (currentLang === 'en' ? 'Sun' : 'Солнце');
    });
}

// ==========================================
// РЕЖИМЫ ИНТЕРФЕЙСА ИГРОКА
// ==========================================
var PLAYER_MODE_STORAGE_KEYS = [
    'pestovo_large_ui',
    'pestovo_strong_vibration',
    'pestovo_high_contrast',
    'pestovo_battery_saver'
];

function isBatterySaverEnabled() {
    return isPlayerModeEnabled('pestovo_battery_saver');
}

function applyPlayerModes() {
    if (!document.body) return;
    document.body.classList.toggle('large-ui', isPlayerModeEnabled('pestovo_large_ui'));
    document.body.classList.toggle('high-contrast-status', isPlayerModeEnabled('pestovo_high_contrast'));
    document.body.classList.toggle('battery-saver', isBatterySaverEnabled());

    // Режим экономии батареи не держит экран постоянно включённым.
    if (isBatterySaverEnabled() && typeof wakeLockSentinel !== 'undefined' && wakeLockSentinel) {
        try { wakeLockSentinel.release(); } catch(e) {}
        wakeLockSentinel = null;
    } else if (!isBatterySaverEnabled()) {
        acquireWakeLockIfAllowed();
    }
}

function togglePlayerMode(key) {
    if (PLAYER_MODE_STORAGE_KEYS.indexOf(key) === -1) return;
    var enabled = !isPlayerModeEnabled(key);
    try { localStorage.setItem(key, enabled ? '1' : '0'); } catch(e) {}
    applyPlayerModes();
    if (typeof soloRound !== 'undefined' && soloRound && typeof startSoloPaceTicker === 'function') startSoloPaceTicker();
    if (typeof curRoundData !== 'undefined' && curRoundData && typeof startGroupPaceTicker === 'function') startGroupPaceTicker();
    if (typeof buildMobileDrawer === 'function') {
        var drawer = document.getElementById('mobile-drawer-root');
        var wasOpen = drawer && drawer.classList.contains('open');
        buildMobileDrawer();
        if (wasOpen && drawer) drawer.classList.add('open');
    }
    var labels = {
        pestovo_large_ui: t('large_ui_mode'),
        pestovo_strong_vibration: t('strong_vibration_mode'),
        pestovo_high_contrast: t('high_contrast_mode'),
        pestovo_battery_saver: t('battery_saver_mode')
    };
    toast((enabled ? '✅ ' : '❌ ') + labels[key] + (enabled ? (currentLang === 'en' ? ' enabled' : ' включён') : (currentLang === 'en' ? ' disabled' : ' выключен')), 'info');
}

function playerModeRow(key, labelKey, icon) {
    var enabled = isPlayerModeEnabled(key);
    return '<div class="player-mode-row">' +
        '<span><i class="fas ' + icon + '"></i> ' + t(labelKey) + '</span>' +
        '<button type="button" class="player-mode-button ' + (enabled ? 'active' : '') + '" aria-pressed="' + (enabled ? 'true' : 'false') + '" onclick="togglePlayerMode(\'' + key + '\')">' + (enabled ? t('mode_on') : t('mode_off')) + '</button>' +
        '</div>';
}

initThemeMode(); // применяем сразу, до первой отрисовки — без вспышки тёмной темы
applyPlayerModes();
document.addEventListener('DOMContentLoaded', function() {
    initThemeMode();
    applyPlayerModes();
});

// ==========================================
// ФИРМЕННЫЕ БЕЙДЖИ РЕЗУЛЬТАТОВ И ТИ
// ==========================================
function getRoundTeeCodes(r) {
    if (!r) return ['wh'];
    if (typeof r === 'string') return [r];
    if (Array.isArray(r)) {
        var arr = [];
        r.forEach(function(code) {
            if (code && arr.indexOf(code) === -1) arr.push(code);
        });
        return arr.length ? arr : ['wh'];
    }
    var teesFound = [];
    var players = r.players || {};
    var playerEntries = Object.entries(players).filter(function(pe) {
        return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name));
    });

    if (playerEntries.length > 0) {
        playerEntries.forEach(function(pe) {
            var p = pe[1];
            var code = (p && p.tee) || r.tee || 'wh';
            if (code && teesFound.indexOf(code) === -1) {
                teesFound.push(code);
            }
        });
    }

    if (!teesFound.length) {
        teesFound.push(r.tee || 'wh');
    }

    teesFound.sort(function(a, b) {
        var idxA = TEE_ORDER.indexOf(a);
        var idxB = TEE_ORDER.indexOf(b);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });

    return teesFound;
}

function fmtTeePill(teeCode) {
    if (!teeCode) teeCode = 'wh';
    if (typeof teeCode === 'object' && teeCode !== null) {
        return fmtRoundTeePills(teeCode);
    }
    var nameKey = 'tee_' + teeCode;
    var name = t(nameKey);
    if (!name || name === nameKey) name = TEES[teeCode] || 'White';
    return '<span class="tee-pill tee-' + teeCode + '">' + name + '</span>';
}

function fmtRoundTeePills(r) {
    var codes = getRoundTeeCodes(r);
    var pills = codes.map(function(c) {
        var nameKey = 'tee_' + c;
        var name = t(nameKey);
        if (!name || name === nameKey) name = TEES[c] || 'White';
        return '<span class="tee-pill tee-' + c + '">' + name + '</span>';
    });
    return '<span class="round-tee-pills">' + pills.join('') + '</span>';
}

function fmtRoundTeesText(r) {
    var codes = getRoundTeeCodes(r);
    return codes.map(function(c) {
        var nameKey = 'tee_' + c;
        var name = t(nameKey);
        if (!name || name === nameKey) name = TEES[c] || 'White';
        return name;
    }).join(', ');
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
    el.innerHTML = '';
}

// ==========================================
// КОНФЕТТИ ПРИ ВВОДЕ СЧЁТА — ЭФФЕКТ ОТКЛЮЧЁН
// (функция оставлена как no-op для совместимости со старыми вызовами)
// ==========================================
function triggerVictoryConfetti() {
    return; // конфетти при вводе счёта больше не показываются
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
    buildMobileDrawer();

    var tg = document.getElementById('nav-toggle');
    if (tg) {
        tg.setAttribute('aria-label', currentLang === 'en' ? 'Open menu' : 'Открыть меню');
        tg.setAttribute('aria-expanded', 'false');
        tg.setAttribute('aria-controls', 'mobile-drawer-root');
        tg.onclick = function(e) {
            e.stopPropagation();
            toggleMobileDrawer();
        };
    }

    window.addEventListener('scroll', function() {
        var n = document.getElementById('main-nav');
        if (n) {
            if (window.scrollY > 50) n.classList.add('nav-scrolled');
            else n.classList.remove('nav-scrolled');
        }
        // На каждом скролле пересчитываем высоту шапки: при появлении/скрытии
        // статус-бара iOS или изменении размеров шапки (mobile-меню) отступы
        // и scroll-padding должны оставаться синхронными.
        applyNavHeight();
    }, { passive: true });

    // resize / orientationchange / visualViewport — высота шапки может
    // меняться (например, при повороте экрана или открытии клавиатуры).
    window.addEventListener('resize', applyNavHeight);
    window.addEventListener('orientationchange', function() {
        setTimeout(applyNavHeight, 250);
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', applyNavHeight);
    }

    loadPestovoWeather('nav-weather-container');
    // Высота нужна до первой отрисовки, иначе заголовки страниц на мобильном
    // на мгновение «прячутся» под фиксированной шапкой.
    applyNavHeight();
    setTimeout(applyNavHeight, 50);
    setTimeout(applyNavHeight, 400);
}

// ==========================================
// ДИНАМИЧЕСКАЯ ВЫСОТА ФИКСИРОВАННОЙ ШАПКИ
// Пересчитывает реальную высоту #main-nav и записывает её в CSS-переменную
// --nav-h. Все page-head / main / scroll-padding используют эту переменную,
// поэтому отступы всегда совпадают с шапкой, в том числе:
//   - на iOS в PWA-режиме (env(safe-area-inset-top) добавляет высоту)
//   - при переключении состояния .nav-scrolled (шапка становится плотнее)
//   - при разных размерах шрифта/иконок на мобильных
// ==========================================
function applyNavHeight() {
    if (typeof document === 'undefined') return;
    var navEl = document.getElementById('main-nav');
    if (!navEl) return;
    // offsetHeight учитывает padding, border, но НЕ учитывает safe-area-inset-top.
    // В PWA на iOS шапка визуально выше из-за статус-бара — добавляем
    // env(safe-area-inset-top) явно, иначе контент «уезжает» под «чёлку».
    var baseH = navEl.offsetHeight || 0;
    var safeTop = 0;
    try {
        var probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;top:0;left:0;height:env(safe-area-inset-top);width:1px;pointer-events:none;visibility:hidden;';
        document.body.appendChild(probe);
        safeTop = Math.max(0, probe.getBoundingClientRect().height);
        document.body.removeChild(probe);
    } catch (e) {
        safeTop = 0;
    }
    // Если шапка уже учитывает safe-area-inset-top в собственном padding-top
    // (см. media display-mode: standalone в style.css), не дублируем.
    var padTop = parseFloat(getComputedStyle(navEl).paddingTop) || 0;
    var extraSafe = safeTop > padTop ? (safeTop - padTop) : 0;
    var totalH = baseH + extraSafe;
    if (totalH > 0) {
        document.documentElement.style.setProperty('--nav-h', totalH + 'px');
    }
}

function buildMobileDrawer() {
    if (typeof document === 'undefined') return;
    var container = document.getElementById('mobile-drawer-root');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mobile-drawer-root';
        container.className = 'mobile-drawer-container';
        if (document.body) document.body.appendChild(container);
    }

    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');
    var isEn = currentLang === 'en';

    var sunTxt = isSun ? (isEn ? 'Sun ✅' : 'Солнце ✅') : (isEn ? 'Sun' : 'Солнце');
    var sunPrefix = isSun ? 'fas' : 'far';

    var authBtnMarkup = '';
    var isUserLoggedIn = (typeof currentUser !== 'undefined' && currentUser && typeof currentUserData !== 'undefined' && currentUserData);

    if (isUserLoggedIn) {
        var avatarMarkup = fmtUserAvatar(currentUserData, 32);
        authBtnMarkup = '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--input);padding:10px 14px;border-radius:var(--rs);border:1px solid var(--border);cursor:pointer;" onclick="closeMobileDrawer();openPlayerProfileModal(\'' + currentUser.uid + '\')">' +
            '<div style="display:flex;align-items:center;gap:10px;">' + avatarMarkup + '<strong style="color:var(--gold);font-size:14px;">' + (currentUserData.name || '') + '</strong></div>' +
            '<button class="btn btn-og btn-sm" onclick="event.stopPropagation();doLogout()"><i class="fas fa-sign-out-alt"></i></button>' +
            '</div>';
    } else {
        authBtnMarkup = '<a href="auth.html" class="btn btn-g btn-block" onclick="closeMobileDrawer()"><i class="fas fa-sign-in-alt"></i> ' + t('nav_login') + '</a>';
    }

    var menuBodyMarkup = '<div class="mobile-drawer-group">' +
        '<div class="mobile-drawer-group-title">⛳ ' + (isEn ? 'Game & Rounds' : 'Игра и Раунды') + '</div>' +
        '<a href="index.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-home"></i> <span data-i18n="nav_home">' + t('nav_home') + '</span></a>' +
        '<a href="setup-round.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-gamepad"></i> <span data-i18n="nav_round">' + t('nav_round') + '</span></a>' +
        '<a href="leaderboard.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-trophy"></i> <span data-i18n="nav_leaderboard">' + t('nav_leaderboard') + '</span></a>' +
        '</div>' +

        '<div class="mobile-drawer-group">' +
        '<div class="mobile-drawer-group-title">📖 ' + (isEn ? 'Club & Features' : 'Клуб и Сервисы') + '</div>' +
        '<a href="guide.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-book-bookmark"></i> <span data-i18n="nav_guide">' + t('nav_guide') + '</span></a>' +
        '<a href="feed.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-rss"></i> <span data-i18n="nav_feed">' + t('nav_feed') + '</span></a>' +
        '<a href="predictor.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-calculator"></i> <span data-i18n="nav_predictor">' + t('nav_predictor') + '</span></a>' +
        '<a href="order-of-merit.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-crown"></i> <span data-i18n="nav_oom">' + t('nav_oom') + '</span></a>' +
        '</div>' +

        '<div class="mobile-drawer-group">' +
        '<div class="mobile-drawer-group-title">👥 ' + (isEn ? 'Community & Stats' : 'Сообщество и Инфо') + '</div>' +
        '<a href="players.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-users"></i> <span data-i18n="nav_players">' + t('nav_players') + '</span></a>' +
        '<a href="tournaments.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-list"></i> <span data-i18n="nav_tournaments">' + t('nav_tournaments') + '</span></a>' +
        '<a href="stats.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-chart-bar"></i> <span data-i18n="nav_stats">' + t('nav_stats') + '</span></a>' +
        '<a href="handicap.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-calculator"></i> <span data-i18n="nav_handicaps">' + t('nav_handicaps') + '</span></a>' +
        '<a href="assistant.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-robot"></i> <span data-i18n="nav_assistant">' + t('nav_assistant') + '</span></a>' +
        '</div>';

    // В самом конце бокового меню — отдельная вкладка «Мои настройки» с тогглами
    // режимов игрока. Видимость управляется админом (isMyPreferencesEnabled).
    if (typeof isMyPreferencesEnabled === 'function' ? isMyPreferencesEnabled() : true) {
        menuBodyMarkup += '<div class="mobile-drawer-group mobile-drawer-group-preferences" data-group="my-preferences">' +
            '<div class="mobile-drawer-group-title"><i class="fas fa-gear"></i> ' + t('my_preferences_title') + '</div>' +
            '<div class="my-preferences-inline" data-my-preferences-inline>' +
                playerModeRow('pestovo_large_ui', 'large_ui_mode', 'fa-text-height') +
                playerModeRow('pestovo_strong_vibration', 'strong_vibration_mode', 'fa-mobile-screen-button') +
                playerModeRow('pestovo_high_contrast', 'high_contrast_mode', 'fa-circle-half-stroke') +
                playerModeRow('pestovo_battery_saver', 'battery_saver_mode', 'fa-battery-quarter') +
            '</div>' +
        '</div>';
    }

    var html =
        '<div class="mobile-drawer-backdrop" onclick="closeMobileDrawer()" aria-hidden="true"></div>' +
        '<div class="mobile-drawer-panel" role="dialog" aria-modal="true" aria-label="' + (isEn ? 'Navigation menu' : 'Меню навигации') + '">' +
            '<div class="mobile-drawer-header">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<img src="img/logo.png" alt="Logo" class="nav-logo" onerror="this.style.display=\'none\'">' +
                    '<span class="nav-brand-text" data-i18n="brand_name">' + t('brand_name') + '</span>' +
                '</div>' +
                '<button class="mobile-drawer-close" onclick="closeMobileDrawer()" aria-label="' + (isEn ? 'Close menu' : 'Закрыть меню') + '">&times;</button>' +
            '</div>' +

            '<div class="mobile-drawer-body">' + menuBodyMarkup + '</div>' +

            '<div class="mobile-drawer-footer">' +
            '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
                '<button class="sun-mode-btn" style="flex:1;justify-content:center;" onclick="toggleSunMode()"><i class="' + sunPrefix + ' fa-sun"></i> ' + sunTxt + '</button>' +
                    '<button class="lang-btn" style="flex:1;justify-content:center;" onclick="toggleLang()">' + (isEn ? '🇬🇧 EN' : '🇷🇺 RU') + '</button>' +
                '</div>' +
                '<div id="mobile-drawer-auth">' + authBtnMarkup + '</div>' +
            '</div>' +
        '</div>';

    container.innerHTML = html;

    var curPage = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname.split('/').pop() || 'index.html' : 'index.html';
    if (container.querySelectorAll) {
        container.querySelectorAll('.mobile-drawer-link').forEach(function(link) {
            if (link.getAttribute('href') === curPage) {
                link.classList.add('active');
            }
        });
    }

    if (typeof applyPageVisibilitySettings === 'function') {
        applyPageVisibilitySettings();
    }
}

/* Прячем нижнюю навигацию, когда открыта экранная клавиатура (фокус в поле ввода) */
document.addEventListener('focusin', function(e) {
    if (!e || !e.target) return;
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        document.body.classList.add('kb-open');
    }
});
document.addEventListener('focusout', function(e) {
    setTimeout(function() {
        var a = document.activeElement;
        var tag = a && a.tagName;
        if (!(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) {
            document.body.classList.remove('kb-open');
        }
    }, 120);
});

// ==========================================
// SCREEN WAKE LOCK — экран не гаснет во время раунда
// ==========================================
var wakeLockSentinel = null;
var wakeLockVisibilityListenerAttached = false;

function acquireWakeLockIfAllowed() {
    if (typeof document === 'undefined' || isBatterySaverEnabled() || !('wakeLock' in navigator)) return;
    var curPage = (window.location && window.location.pathname) ? (window.location.pathname.split('/').pop() || '') : '';
    var SCORING_PAGES = ['setup-round.html', 'scorer.html', 'marker.html'];
    if (SCORING_PAGES.indexOf(curPage) === -1 || wakeLockSentinel) return;
    navigator.wakeLock.request('screen').then(function(s) {
        wakeLockSentinel = s;
        s.addEventListener('release', function() { wakeLockSentinel = null; });
    }).catch(function() { /* тихо игнорируем — не критично */ });
}

function initWakeLock() {
    if (typeof document === 'undefined' || isBatterySaverEnabled()) return;
    if (!('wakeLock' in navigator)) return;
    acquireWakeLockIfAllowed();
    if (!wakeLockVisibilityListenerAttached) {
        wakeLockVisibilityListenerAttached = true;
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') acquireWakeLockIfAllowed();
        });
    }
}
initWakeLock();

function openMobileDrawer() {
    buildMobileDrawer();
    var container = document.getElementById('mobile-drawer-root');
    var tg = document.getElementById('nav-toggle');
    if (container) container.classList.add('open');
    if (tg) { tg.classList.add('active'); tg.setAttribute('aria-expanded', 'true'); }
    if (typeof document !== 'undefined' && document.body && document.body.style) document.body.style.overflow = 'hidden';
}

function closeMobileDrawer() {
    var container = document.getElementById('mobile-drawer-root');
    var tg = document.getElementById('nav-toggle');
    if (container) container.classList.remove('open');
    if (tg) { tg.classList.remove('active'); tg.setAttribute('aria-expanded', 'false'); }
    if (typeof document !== 'undefined' && document.body && document.body.style) document.body.style.overflow = '';
}

// A11Y: клавиша Esc закрывает открытую модалку (верхнюю) или боковое меню
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    var modals = document.querySelectorAll('.modal:not(.hidden)');
    if (modals.length) {
        var top = modals[modals.length - 1];
        var closeBtn = top.querySelector('.modal-close-btn, .modal-close');
        if (closeBtn) { closeBtn.click(); } else { top.classList.add('hidden'); }
        return;
    }
    var drawer = document.getElementById('mobile-drawer-root');
    if (drawer && drawer.classList.contains('open')) closeMobileDrawer();
});

function toggleMobileDrawer() {
    var container = document.getElementById('mobile-drawer-root');
    if (container && container.classList.contains('open')) {
        closeMobileDrawer();
    } else {
        openMobileDrawer();
    }
}

function fmtUserAvatar(u, sizePx) {
    sizePx = sizePx || 40;
    if (u && u.avatar) {
        if (u.avatar.startsWith('data:') || u.avatar.startsWith('http') || u.avatar.startsWith('img/')) {
            return '<img src="' + u.avatar + '" alt="Avatar" class="user-avatar-img" style="width:' + sizePx + 'px;height:' + sizePx + 'px;">';
        }
        return '<div class="lb-avatar" style="width:' + sizePx + 'px;height:' + sizePx + 'px;font-size:' + Math.round(sizePx * 0.5) + 'px;">' + u.avatar + '</div>';
    }
    var initial = (u && u.name) ? u.name.charAt(0).toUpperCase() : '?';
    return '<div class="lb-avatar" style="width:' + sizePx + 'px;height:' + sizePx + 'px;font-size:' + Math.round(sizePx * 0.45) + 'px;">' + initial + '</div>';
}

function handleAvatarFileUpload(fileInputEl, callback) {
    if (!fileInputEl || !fileInputEl.files || !fileInputEl.files[0]) return;
    var file = fileInputEl.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            var maxDim = 160;
            var w = img.width;
            var h = img.height;
            if (w > h) {
                if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
            } else {
                if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            if (typeof callback === 'function') callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
function isToolsMenuEnabled() {
    // Администратор может включить/выключить отображение кнопки «Меню» (Инструменты и функции).
    // По умолчанию кнопка скрыта — вкл/выкл делается из админ-панели (вкладка «Данные»).
    try {
        return localStorage.getItem('pestovo_tools_menu_enabled') === '1';
    } catch(e) { return false; }
}

// Включение/выключение вкладки «Мои настройки» в боковом меню
// (тоггл в админ-панели, вкладка «Данные»). По умолчанию ВКЛ — это
// основной блок настроек игрока, который должен быть у всех.
function isMyPreferencesEnabled() {
    try {
        var v = localStorage.getItem('pestovo_my_preferences_enabled');
        // По умолчанию — включено. Если ключ явно установлен в '0' — выключено.
        return v === null || v === undefined || v === '1';
    } catch(e) { return true; }
}

function navAuth(u, d) {
    var e = document.getElementById('nav-auth');
    if (!e) return;
    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');

    var sunBtn = '<button class="sun-mode-btn" onclick="toggleSunMode()">' + (isSun ? '<i class="fas fa-sun"></i> ' + (currentLang === 'en' ? 'Sun ✅' : 'Солнце ✅') : '<i class="far fa-sun"></i> ' + (currentLang === 'en' ? 'Sun' : 'Солнце')) + '</button>';
    var langBtn = '<button class="lang-btn" onclick="toggleLang()">' + (currentLang === 'en' ? '🇬🇧 EN' : '🇷🇺 RU') + '</button>';
    var playerModesBtn = '<button class="player-modes-launcher" title="' + t('player_modes_title') + '" aria-label="' + t('player_modes_title') + '" onclick="event.stopPropagation();openMobileDrawer()"><i class="fas fa-sliders"></i></button>';
    // Кнопка «Меню» (Инструменты) показывается только если администратор явно включил это
    var toolsBtn = isToolsMenuEnabled()
        ? '<button class="lang-btn" onclick="openToolsMenu()"><i class="fas fa-toolbox"></i> ' + (currentLang === 'en' ? 'Tools' : 'Меню') + '</button>'
        : '';

    if (u && d) {
        var avatarMarkup = fmtUserAvatar(d, 30);
        e.innerHTML = '<div class="nav-user" style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + u.uid + '\')">' +
            sunBtn + langBtn + playerModesBtn + toolsBtn + avatarMarkup +
            '<span class="nav-uname">' + (d.name || '') + '</span>' +
            '<button class="btn btn-og btn-sm" onclick="event.stopPropagation();doLogout()"><i class="fas fa-sign-out-alt"></i></button>' +
            '</div>';
    } else {
        e.innerHTML = '<div style="display:flex;align-items:center;gap:6px;">' + sunBtn + langBtn + playerModesBtn + toolsBtn + '<a href="auth.html" class="btn btn-g btn-sm" style="padding:5px 10px;font-size:11px;" data-i18n="nav_login">' + t('nav_login') + '</a></div>';
    }
}

function doLogout(){if(typeof auth!=='undefined'&&auth&&auth.signOut){auth.signOut().then(function(){window.location.reload();});}else{window.location.reload();}}
function holeOrder(sh){var o=[],h=parseInt(sh)||1;for(var i=0;i<18;i++){o.push(h);h=h>=18?1:h+1;}return o;}

// ==========================================
// ВЫБОР КОЛИЧЕСТВА ЛУНОК (holeRange)
// '1-9' | '10-18' | '1-18' (по умолчанию)
// ==========================================
function roundHoles(startHole, holeRange) {
    startHole = parseInt(startHole) || 1;
    if (holeRange === '1-9') return [1,2,3,4,5,6,7,8,9];
    if (holeRange === '10-18') return [10,11,12,13,14,15,16,17,18];
    return holeOrder(startHole); // 18 лунок, порядок со стартовой лунки (shotgun)
}
function roundHoleCount(holeRange) {
    return (holeRange === '1-9' || holeRange === '10-18') ? 9 : 18;
}
function getRoundOrder(rd) { return roundHoles((rd && rd.startHole) || 1, rd && rd.holeRange); }
function getRoundHoleCount(rd) { return roundHoleCount(rd && rd.holeRange); }

// Заполняет выпадающий список «Стартовая лунка» лунками выбранного диапазона:
// '1-9' → только 1-9, '10-18' → только 10-18, '1-18' (и другое) → все 18.
// Если текущее значение выпадающего списка уже входит в диапазон — сохраняем его.
function buildStartHoleOptions(holeEl, holeRange) {
    if (!holeEl) return;
    holeRange = holeRange || '1-18';
    var from = 1, to = 18;
    if (holeRange === '1-9') { from = 1; to = 9; }
    else if (holeRange === '10-18') { from = 10; to = 18; }
    var cur = parseInt(holeEl.value);
    if (!cur || cur < from || cur > to) {
        cur = (holeRange === '10-18') ? 10 : 1;
    }
    var html = '';
    for (var i = from; i <= to; i++) {
        html += '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + t('hole') + ' ' + i + ' (' + t('par') + ' ' + holePar(i) + ')</option>';
    }
    holeEl.innerHTML = html;
    holeEl.value = cur;
}

// Состояние подтверждения счёта игрока на лунке h — по фактическим данным, а не только по флагу verified:
//  'confirmed' — счёт игрока и маркера введены и совпадают (флаг мог устареть — данные важнее)
//  'mismatch'  — введённые счёта расходятся (или несовпадение зафиксировано флагом verified === false,
//                например внешним маркером через marker.html, чьих данных в раунде нет)
//  'pending'   — счёт игрока введён, но маркер ещё не подтвердил
//  'none'      — счёт ещё не введён
function getHoleVerifyState(p, h) {
    p = p || {};
    var ps = parseInt(p.scores && p.scores[h]) || 0;
    var markerId = p.markedBy;
    var ms = markerId ? (parseInt(p.markerScores && p.markerScores[markerId] && p.markerScores[markerId][h]) || 0) : 0;
    var v = p.verified && p.verified[h];

    // Фактические данные приоритетнее флага: флаг мог не обновиться,
    // если маркер ввёл счёт позже игрока или счёт исправили
    if (ps >= 1 && ms >= 1) return (ps === ms) ? 'confirmed' : 'mismatch';
    if (v === false) return 'mismatch';
    if (v === true) return 'confirmed';
    if (ps >= 1) return 'pending';
    return 'none';
}

// Проверка счёта ТОЛЬКО для одного игрока и его маркера (турнирное правило):
// чужой флайт / другие пары группы не блокируют финиш. Возвращает те же поля,
// что и collectRoundVerification, но только по лункам игрока pid, плюс детали
// details[h] = { ps, ms, playerName, markerName, state } для уведомлений.
function collectPlayerVerification(r, pid) {
    var order = getRoundOrder(r);
    var players = Object.entries((r && r.players) || {}).filter(function(pe){ return pe[0] === pid; });
    var mismatch = {}, unconfirmed = {}, missing = {}, details = {};
    if (!pid || !players.length) {
        return { order: order, mismatch: mismatch, unconfirmed: unconfirmed, missing: missing, details: details, canFinish: true, total: order.length, pid: pid || null, firstIssue: null };
    }
    var p = players[0][1] || {};
    var playerName = p.name || (currentLang === 'en' ? 'Player' : 'Игрок');
    var markerId = p.markedBy;
    var markerName = '';
    try {
        var mk = markerId && r.players ? r.players[markerId] : null;
        markerName = (mk && mk.name) ? mk.name : '';
    } catch(_) { markerName = ''; }
    if (r && r.mode === 'solo') {
        order.forEach(function(h){
            var sc = (p.scores) || {};
            if (!(parseInt(sc[h]) >= 1)) missing[h] = true;
        });
    } else {
        order.forEach(function(h){
            var st = getHoleVerifyState(p, h);
            var ps = parseInt(p.scores && p.scores[h]) || 0;
            var ms = markerId ? (parseInt(p.markerScores && p.markerScores[markerId] && p.markerScores[markerId][h]) || 0) : 0;
            details[h] = { ps: ps, ms: ms, playerName: playerName, markerName: markerName, state: st };
            if (st === 'mismatch') {
                var label = (ps >= 1 && ms >= 1) ? (playerName + ' (' + ps + '\u2260' + ms + ')') : playerName;
                mismatch[h] = [label];
            } else if (st !== 'confirmed') {
                unconfirmed[h] = [playerName];
            }
        });
    }
    var canFinish = Object.keys(mismatch).length === 0 && Object.keys(unconfirmed).length === 0;
    var v = { order: order, mismatch: mismatch, unconfirmed: unconfirmed, missing: missing, details: details, canFinish: canFinish, total: order.length, pid: pid, playerName: playerName, markerName: markerName };
    v.firstIssue = getFirstVerificationIssue(v);
    return v;
}

// Первая проблемная лунка в порядке раунда: сначала несовпадения, затем
// неподтверждённые. Возвращает { kind:'mismatch'|'unconfirmed', hole, detail }
// или null, если всё подтверждено.
function getFirstVerificationIssue(v) {
    if (!v || v.canFinish) return null;
    var order = v.order || Object.keys(v.mismatch || {}).concat(Object.keys(v.unconfirmed || {}));
    var mis = v.mismatch || {}, unc = v.unconfirmed || {};
    var i, h;
    for (i = 0; i < order.length; i++) {
        h = order[i];
        if (mis[h]) return { kind: 'mismatch', hole: h, detail: (v.details && v.details[h]) || null, totalMismatches: Object.keys(mis).length, totalUnconfirmed: Object.keys(unc).length };
    }
    for (i = 0; i < order.length; i++) {
        h = order[i];
        if (unc[h]) return { kind: 'unconfirmed', hole: h, detail: (v.details && v.details[h]) || null, totalMismatches: Object.keys(mis).length, totalUnconfirmed: Object.keys(unc).length };
    }
    return null;
}

// Красивый текст уведомления о первой проблемной лунке (показываем ОДНУ лунку,
// а не все сразу; счётчик «ещё N» подсказывает, сколько осталось).
function verificationIssueToastHtml(issue, v) {
    if (!issue) return '';
    var isEn = currentLang === 'en';
    var h = issue.hole;
    var d = issue.detail || {};
    var ps = parseInt(d.ps) || 0, ms = parseInt(d.ms) || 0;
    var markerBit = d.markerName ? ' (' + escapeHtml(d.markerName) + ')' : '';
    if (issue.kind === 'mismatch') {
        var scoreBit = (ps >= 1 && ms >= 1)
            ? (isEn ? ('You: <b>' + ps + '</b>, marker' + markerBit + ': <b>' + ms + '</b>') : ('Вы: <b>' + ps + '</b>, маркер' + markerBit + ': <b>' + ms + '</b>'))
            : (isEn ? 'scores do not match' : 'счета не совпадают');
        var more = '';
        var rest = (issue.totalMismatches - 1) + issue.totalUnconfirmed;
        if (rest > 0) more = isEn ? ('<br><span style="opacity:.85;font-size:12px;">+' + rest + ' more hole' + (rest === 1 ? '' : 's') + ' to check</span>') : ('<br><span style="opacity:.85;font-size:12px;">ещё лунок к проверке: ' + rest + '</span>');
        return (isEn ? ('⚠️ <b>Mismatch on hole ' + h + '</b><br>' + scoreBit) : ('⚠️ <b>Несовпадение на лунке ' + h + '</b><br>' + scoreBit)) + more;
    }
    var what = ps >= 1
        ? (isEn ? ('Your score <b>' + ps + '</b> is waiting for marker' + markerBit + ' confirmation') : ('Ваш счёт <b>' + ps + '</b> ждёт подтверждения маркера' + markerBit))
        : (isEn ? 'score is not entered yet' : 'счёт ещё не введён');
    var restU = issue.totalUnconfirmed - 1;
    var moreU = restU > 0 ? (isEn ? ('<br><span style="opacity:.85;font-size:12px;">+' + restU + ' more unconfirmed hole' + (restU === 1 ? '' : 's') + '</span>') : ('<br><span style="opacity:.85;font-size:12px;">ещё неподтверждённых лунок: ' + restU + '</span>')) : '';
    return (isEn ? ('⏳ <b>Hole ' + h + ' is not confirmed</b><br>' + what) : ('⏳ <b>Лунка ' + h + ' не подтверждена</b><br>' + what)) + moreU;
}

// Показывает уведомление о первой проблемной лунке (3 сек, тап — перейти к лунке).
// onGoToHole(hole) — callback для перехода (например, goPlayHole).
function showVerificationIssueToast(v, onGoToHole) {
    var issue = (v && v.firstIssue) || getFirstVerificationIssue(v);
    if (!issue) return null;
    var html = verificationIssueToastHtml(issue, v);
    var type = issue.kind === 'mismatch' ? 'error' : 'warn';
    return toast(html, type, { onClick: function(){ if (typeof onGoToHole === 'function') onGoToHole(issue.hole); } });
}

// Собирает информацию о «незавершённых» лунках раунда для проверки перед финишем:
//  - mismatch: лунки, где есть несовпадение счёта (по фактическим данным игрок/маркер или флагу verified === false)
//  - unconfirmed: лунки, где счёт ещё не подтверждён всеми / не введён
// onlyPid (опционально): проверять только одного игрока и его маркера.
//  Групповой финиш всегда вызывает с onlyPid = текущий игрок.
function collectRoundVerification(r, onlyPid) {
    var order = getRoundOrder(r);
    var players = Object.entries((r && r.players) || {});
    if (onlyPid) players = players.filter(function(pe){ return pe[0] === onlyPid; });
    var mismatch = {}, unconfirmed = {};
    var missing = {};
    if (r && r.mode === 'solo') {
        // В сольном раунде нет маркера — игрок вводит счёт сам за себя,
        // поэтому проверка маркеров НЕ нужна: раунд можно завершить в любой момент
        // (например, после 1–2 лунок). Лунки без счёта показываем только как справку
        // в списке `missing` и они НЕ блокируют завершение (canFinish остаётся true).
        order.forEach(function(h){
            var allScored = true;
            players.forEach(function(pe){
                var sc = (pe[1] && pe[1].scores) || {};
                if (!(parseInt(sc[h]) >= 1)) allScored = false;
            });
            if (!allScored) missing[h] = true;
        });
    } else {
        order.forEach(function(h){
            var mismatchForHole = {}, unconfForHole = {};
            players.forEach(function(pe){
                var p = pe[1] || {};
                var name = p.name || (currentLang === 'en' ? 'Player' : 'Игрок');
                var st = getHoleVerifyState(p, h);
                if (st === 'mismatch') {
                    // Показываем расхождение цифрами: «Имя (4≠5)» — когда известны оба счёта
                    var ps = parseInt(p.scores && p.scores[h]) || 0;
                    var mkId = p.markedBy;
                    var ms = mkId ? (parseInt(p.markerScores && p.markerScores[mkId] && p.markerScores[mkId][h]) || 0) : 0;
                    var label = (ps >= 1 && ms >= 1) ? (name + ' (' + ps + '\u2260' + ms + ')') : name;
                    mismatchForHole[label] = true;
                } else if (st !== 'confirmed') {
                    unconfForHole[name] = true;
                }
            });
            if (Object.keys(mismatchForHole).length > 0) mismatch[h] = Object.keys(mismatchForHole);
            else if (Object.keys(unconfForHole).length > 0) unconfirmed[h] = Object.keys(unconfForHole);
        });
    }
    var canFinish = Object.keys(mismatch).length === 0 && Object.keys(unconfirmed).length === 0;
    return { order: order, mismatch: mismatch, unconfirmed: unconfirmed, missing: missing, canFinish: canFinish, total: order.length };
}

function buildVerificationReportHtml(v) {
    if (!v) return '';
    var isEn = currentLang === 'en';
    var parts = [];
    var misKeys = Object.keys(v.mismatch || {});
    var uncKeys = Object.keys(v.unconfirmed || {});
    if (misKeys.length) {
        var misList = misKeys.map(function(h){ return '#' + h + (v.mismatch[h].length ? ' (' + v.mismatch[h].join(', ') + ')' : ''); }).join(', ');
        parts.push('<div class="timing-alert timing-late"><i class="fas fa-exclamation-triangle"></i><div><strong>' + (isEn ? 'Score mismatch on holes: ' : 'Несовпадения на лунках: ') + '</strong>' + misList + '</div></div>');
    }
    if (uncKeys.length) {
        var uncList = uncKeys.map(function(h){ return '#' + h + (v.unconfirmed[h].length ? ' (' + v.unconfirmed[h].join(', ') + ')' : ''); }).join(', ');
        parts.push('<div class="timing-alert timing-warn"><i class="fas fa-clock"></i><div><strong>' + (isEn ? 'Score not confirmed on holes: ' : 'Счёт не подтверждён на лунках: ') + '</strong>' + uncList + '</div></div>');
    }
    if (v.canFinish) {
        parts.push('<div class="verify-ok">✅ ' + (isEn ? 'All ' + v.total + ' holes are confirmed.' : 'Все ' + v.total + ' лунок подтверждены.') + '</div>');
    }
    return parts.join('');
}

function holeDeadline(startTime,startHole,targetHole){if(!startTime)return null;var tVal=0,h=parseInt(startHole)||1,c=0;while(c<18){tVal+=holeTiming(h);if(h===targetHole)break;h=h>=18?1:h+1;c++;}return startTime+tVal*60000;}
function checkTiming(startTime,startHole,holeNum){var dl=holeDeadline(startTime,startHole,holeNum);if(!dl)return{status:'ok',diff:0,deadline:null};var now=Date.now(),d=Math.round((now-dl)/60000);if(d>5)return{status:'late',diff:d,deadline:dl};if(d>0)return{status:'warning',diff:d,deadline:dl};return{status:'ok',diff:d,deadline:dl};}
function buildTimingNotice(st,sh,ch){var c=checkTiming(st,sh,ch);if(!c.deadline)return'';var dl=fmtTime(c.deadline),nw=fmtTime(Date.now());if(c.status==='late')return'<div class="timing-alert timing-late"><i class="fas fa-exclamation-triangle"></i><div><strong>' + (currentLang === 'en' ? 'Pace Lag!' : 'Отставание!') + '</strong><br>' + t('hole') + ' ' + ch + ': deadline ' + dl + ', now ' + nw + ' (' + c.diff + ' min)</div></div>';if(c.status==='warning')return'<div class="timing-alert timing-warn"><i class="fas fa-clock"></i><div><strong>' + (currentLang === 'en' ? 'Deadline Approaching' : 'Близко к дедлайну') + '</strong><br>' + t('hole') + ' ' + ch + ': ' + dl + '</div></div>';var a=Math.abs(c.diff);return'<div class="timing-alert timing-ok"><i class="fas fa-check-circle"></i><div>' + t('hole') + ' ' + ch + ': ' + (currentLang === 'en' ? 'On Pace' : 'в графике') + (a>0?' (' + (currentLang === 'en' ? 'buffer ' : 'запас ') + a + ' min)':'') + '</div></div>';}
function buildTimingTable(st, sh, holeRange) {
    if (!st) return '';
    var startHole = parseInt(sh) || 1;
    var order = roundHoles(startHole, holeRange);
    var count = order.length;
    var lastHole = order[order.length - 1];

    var dlFinish = holeDeadline(st, startHole, lastHole);
    var totalMin = Math.round((dlFinish - st) / 60000);
    var hrs = Math.floor(totalMin / 60);
    var mins = totalMin % 60;
    var durationStr = hrs + (currentLang === 'en' ? 'h ' : 'ч ') + (mins < 10 ? '0' : '') + mins + (currentLang === 'en' ? 'm' : 'мин');

    var startStr = fmtTime(st);
    var finishStr = fmtTime(dlFinish);

    var html = '<div class="timing-summary-card">';
    html += '<div class="timing-pills-row">';
    html += '  <div class="timing-pill"><span class="tp-lbl">' + (currentLang === 'en' ? 'Start' : 'Старт') + '</span><span class="tp-val">' + startStr + '</span></div>';
    if (count === 18) {
        var dl9 = holeDeadline(st, startHole, order[8]);
        html += '  <div class="timing-pill"><span class="tp-lbl">' + (currentLang === 'en' ? 'Turn (9h)' : '9 лунок') + '</span><span class="tp-val">' + fmtTime(dl9) + '</span></div>';
    }
    html += '  <div class="timing-pill tp-finish"><span class="tp-lbl">' + (currentLang === 'en' ? (count === 18 ? 'Finish (18h)' : 'Finish') : 'Финиш') + '</span><span class="tp-val">' + finishStr + '</span></div>';
    html += '</div>';
    html += '<div class="timing-total-badge"><i class="fas fa-clock"></i> ' + (currentLang === 'en' ? 'Pace of Play: ' : 'Норматив раунда: ') + '<b>' + durationStr + '</b></div>';

    html += '<details class="timing-details"><summary><i class="fas fa-list-ol"></i> ' + (currentLang === 'en' ? 'Hole-by-Hole Deadlines' : 'Детализация по лункам') + '</summary>';
    html += '<div class="timing-grid">';

    order.forEach(function(h) {
        var dl = holeDeadline(st, startHole, h);
        var tMin = holeTiming(h);
        html += '<div class="timing-grid-item">';
        html += '  <span class="tg-hole">' + (currentLang === 'en' ? 'Hole ' : 'Л.') + h + ' <small>(P' + holePar(h) + '·' + tMin + 'm)</small></span>';
        html += '  <span class="tg-time">' + fmtTime(dl) + '</span>';
        html += '</div>';
    });
    html += '</div></details>';
    html += '</div>';
    return html;
}

// ==========================================
// ТЕМП ИГРЫ / ТАЙМИНГИ ПРОХОЖДЕНИЯ ЛУНОК
// ==========================================
function paceStatus(delayMinutes) {
    if (delayMinutes === null || delayMinutes === undefined || isNaN(delayMinutes)) {
        return { key: 'pending', color: '#9eb5a5', label: t('pace_pending') };
    }
    var delay = Math.round(parseFloat(delayMinutes) || 0);
    if (delay <= 2) return { key: 'ok', color: '#2ecc71', label: t('pace_on_time') };
    if (delay <= 5) return { key: 'warning', color: '#f39c12', label: t('pace_warning') };
    if (delay <= 10) return { key: 'late', color: '#e67e22', label: t('pace_late') };
    return { key: 'severe', color: '#e05a4a', label: t('pace_severe') };
}

function formatPaceMinutes(minutes) {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
    var value = Math.max(0, Math.round(parseFloat(minutes) || 0));
    if (value < 1) return currentLang === 'en' ? '<1 min' : '<1 мин';
    if (value >= 60) {
        var hours = Math.floor(value / 60);
        var rest = value % 60;
        return hours + (currentLang === 'en' ? 'h' : 'ч') + (rest ? ' ' + rest + (currentLang === 'en' ? 'm' : 'мин') : '');
    }
    return value + (currentLang === 'en' ? ' min' : ' мин');
}

function formatPaceDelta(minutes) {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
    var value = Math.round(parseFloat(minutes) || 0);
    if (value > 0) return '+' + value + (currentLang === 'en' ? ' min' : ' мин');
    if (value < 0) return (currentLang === 'en' ? 'buffer ' : 'запас ') + Math.abs(value) + (currentLang === 'en' ? ' min' : ' мин');
    return currentLang === 'en' ? 'on time' : 'в графике';
}

function getPaceParticipants(roundData) {
    if (!roundData || !roundData.players) return [];
    var ids = Array.isArray(roundData.participantsList) && roundData.participantsList.length
        ? roundData.participantsList.slice()
        : Object.keys(roundData.players);
    return ids.map(function(id) {
        return { id: id, player: roundData.players[id] };
    }).filter(function(item) {
        return item.player && !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(item.id, item.player.name));
    });
}

function getPaceHoleTime(player, hole) {
    if (!player) return null;
    var candidates = [
        player.holeTimes && player.holeTimes[hole],
        player.scoreTimes && player.scoreTimes[hole],
        player.completedHoles && player.completedHoles[hole]
    ];
    for (var i = 0; i < candidates.length; i++) {
        var value = parseInt(candidates[i]);
        if (value > 0) return value;
    }
    return null;
}

function getGroupPaceHoleTime(roundData, hole, participants) {
    var rootTime = roundData && roundData.holeTimes && parseInt(roundData.holeTimes[hole]);
    if (rootTime > 0) return rootTime;

    var times = (participants || []).map(function(item) {
        return getPaceHoleTime(item.player, hole);
    }).filter(function(value) { return value !== null; });
    // Для старых раундов, где root holeTimes ещё нет, считаем лунку
    // завершённой группой в момент, когда последний игрок отправил счёт.
    if (times.length === (participants || []).length && times.length > 0) {
        return Math.max.apply(Math, times);
    }
    return null;
}

function getRoundPaceMetrics(roundData, nowValue) {
    var now = nowValue || Date.now();
    var order = getRoundOrder(roundData || {});
    var participants = getPaceParticipants(roundData);
    var isGroup = !!(roundData && roundData.mode === 'group' && participants.length > 1);
    var startTime = parseInt(roundData && roundData.startTime) || 0;
    var startHole = parseInt(roundData && roundData.startHole) || 1;
    var timeline = [];
    var completedHoles = [];
    var currentHole = order.length ? order[0] : startHole;
    var previousTime = startTime || now;
    var hasTimingData = false;
    var lastCompletedIdx = -1;

    order.forEach(function(hole, idx) {
        var complete;
        if (isGroup) {
            complete = participants.length > 0 && participants.every(function(item) {
                return parseInt(item.player.scores && item.player.scores[hole]) >= 1;
            });
        } else {
            var soloPlayer = participants.length ? participants[0].player : null;
            complete = !!(soloPlayer && parseInt(soloPlayer.scores && soloPlayer.scores[hole]) >= 1);
        }

        var completedAt = isGroup
            ? getGroupPaceHoleTime(roundData, hole, participants)
            : getPaceHoleTime(participants.length ? participants[0].player : null, hole);
        var durationMin = null;
        var holeDelay = null;

        if (complete) {
            completedHoles.push(hole);
            lastCompletedIdx = idx;
            if (completedAt && startTime) {
                hasTimingData = true;
                durationMin = Math.max(0, (completedAt - previousTime) / 60000);
                holeDelay = durationMin - holeTiming(hole);
                previousTime = Math.max(previousTime, completedAt);
            }
        }

        timeline.push({
            hole: hole,
            complete: complete,
            inProgress: false,
            completedAt: completedAt,
            durationMin: durationMin,
            expectedMin: holeTiming(hole),
            delayMin: holeDelay
        });
    });

    // Текущая лунка — после самой дальней сыгранной (не первой пропущенной).
    // Если введены 1,2,3 и 7 — закончил 7, сейчас на 8.
    var currentIdx = -1;
    if (lastCompletedIdx >= 0) {
        if (lastCompletedIdx + 1 < timeline.length) {
            currentIdx = lastCompletedIdx + 1;
            currentHole = timeline[currentIdx].hole;
        } else {
            // Все лунки сыграны — оставляем последнюю для итогового темпа
            currentHole = order.length ? order[order.length - 1] : startHole;
            currentIdx = -1;
        }
    } else {
        currentHole = order.length ? order[0] : startHole;
        currentIdx = 0;
    }
    if (currentIdx >= 0 && timeline[currentIdx]) {
        var currentItem = timeline[currentIdx];
        var currentStart = previousTime;
        currentItem.inProgress = true;
        currentItem.durationMin = startTime ? Math.max(0, (now - currentStart) / 60000) : null;
        currentItem.delayMin = startTime ? currentItem.durationMin - currentItem.expectedMin : null;
    }
    var firstIncompleteIndex = currentIdx >= 0 ? currentIdx : -1;
    // Если все завершены — firstIncompleteIndex остаётся -1, actualReference = previousTime

    var expectedDeadline = startTime ? holeDeadline(startTime, startHole, currentHole) : null;
    var actualReference = firstIncompleteIndex >= 0 ? now : (previousTime || now);
    var overallDelay = (expectedDeadline && actualReference) ? (actualReference - expectedDeadline) / 60000 : null;

    return {
        order: order,
        participants: participants,
        isGroup: isGroup,
        currentHole: currentHole,
        holesCompleted: completedHoles.length,
        holeCount: order.length,
        completedHoles: completedHoles,
        timeline: timeline,
        expectedDeadline: expectedDeadline,
        actualReference: actualReference,
        overallDelay: overallDelay,
        hasTimingData: hasTimingData,
        startTime: startTime,
        startHole: startHole
    };
}

function getRoundResumePlayerId(roundId, roundData) {
    if (!roundData || !roundData.players) return null;
    var stored = null;
    try { stored = localStorage.getItem('pestovo_acting_as_' + roundId); } catch(e) {}
    if (stored && roundData.players[stored]) return stored;
    if (typeof currentUser !== 'undefined' && currentUser && roundData.players[currentUser.uid]) return currentUser.uid;
    if (roundData.createdBy && roundData.players[roundData.createdBy]) return roundData.createdBy;
    var ids = Array.isArray(roundData.participantsList) && roundData.participantsList.length
        ? roundData.participantsList
        : Object.keys(roundData.players);
    return ids.length ? ids[0] : null;
}

function getSavedResumeHole(roundId, playerId, order, player) {
    if (!roundId || !playerId || !order || !order.length) return null;
    var value = null;
    try { value = parseInt(localStorage.getItem('pestovo_resume_hole_' + roundId + '_' + playerId)); } catch(e) {}
    if (order.indexOf(value) === -1) return null;
    if (player && player.verified && player.verified[value] === true) return null;
    return value;
}

function rememberResumeHole(roundId, playerId, hole) {
    if (!roundId || !playerId || !hole) return;
    try {
        localStorage.setItem('pestovo_resume_hole_' + roundId + '_' + playerId, String(hole));
        localStorage.setItem('pestovo_last_round_id', String(roundId));
    } catch(e) {}
}

function getRoundResumeState(roundId, roundData) {
    var metrics = getRoundPaceMetrics(roundData);
    var playerId = getRoundResumePlayerId(roundId, roundData);
    var player = playerId && roundData && roundData.players ? roundData.players[playerId] : null;
    var order = metrics.order;
    var resumeHole = getSavedResumeHole(roundId, playerId, order, player);
    if (!resumeHole) {
        resumeHole = metrics.currentHole || (order.length ? order[0] : 1);
    }
    var played = 0;
    if (player && player.scores) {
        order.forEach(function(h) { if (parseInt(player.scores[h]) >= 1) played++; });
    } else {
        played = metrics.holesCompleted;
    }
    return {
        playerId: playerId,
        currentHole: resumeHole,
        holesPlayed: played,
        holeCount: metrics.holeCount,
        metrics: metrics
    };
}

function renderPaceHoleTimeline(metrics) {
    if (!metrics || !metrics.timeline) return '';
    return metrics.timeline.map(function(item) {
        var state = item.complete || item.inProgress ? paceStatus(item.delayMin) : paceStatus(null);
        var marker = item.complete ? '✓ ' : item.inProgress ? '▶ ' : '';
        var duration = item.durationMin === null ? '—' : formatPaceMinutes(item.durationMin);
        var title = currentLang === 'en'
            ? 'Hole ' + item.hole + ': ' + duration + ' / target ' + item.expectedMin + ' min'
            : 'Лунка ' + item.hole + ': ' + duration + ' / норма ' + item.expectedMin + ' мин';
        var holePrefix = currentLang === 'en' ? 'H.' : 'Л.';
        return '<span class="pace-hole pace-hole-' + state.key + '" title="' + title + '">' + marker + holePrefix + item.hole + ' · ' + duration + '</span>';
    }).join('');
}

function renderPaceAssistant(targetId, roundData) {
    var el = document.getElementById(targetId);
    if (!el || !roundData) return;
    var metrics = getRoundPaceMetrics(roundData);
    var state = paceStatus(metrics.overallDelay);
    var delayText = formatPaceDelta(metrics.overallDelay);
    var currentDeadline = metrics.expectedDeadline ? fmtTime(metrics.expectedDeadline) : '—';
    var title = t('pace_of_play');
    var note = '';
    if (!metrics.hasTimingData) note = '<div class="pace-note">' + t('pace_pending') + '</div>';

    var html = '<div class="pace-assistant pace-state-' + state.key + '" style="--pace-color:' + state.color + ';">';
    html += '<div class="pace-assistant-header"><strong><i class="fas fa-stopwatch"></i> ' + title + '</strong><span class="pace-status-label">' + state.label + '</span></div>';
    html += '<div class="pace-assistant-grid">';
    html += '<div><span>' + t('pace_current_hole') + '</span><b>№' + metrics.currentHole + '</b></div>';
    html += '<div><span>' + t('pace_completed') + '</span><b>' + metrics.holesCompleted + '/' + metrics.holeCount + '</b></div>';
    html += '<div><span>' + t('pace_delay') + '</span><b>' + delayText + '</b></div>';
    html += '</div>';
    html += '<div class="pace-assistant-deadline"><i class="fas fa-clock"></i> ' + t('pace_deadline') + ': <b>' + currentDeadline + '</b></div>';
    html += note;
    html += '</div>';
    el.innerHTML = html;
}

function recordHoleCompletionTime(roundId, playerId, hole, timestamp) {
    if (typeof db === 'undefined' || !roundId || !playerId || !hole) return Promise.resolve();
    var path = 'rounds/' + roundId + '/players/' + playerId + '/holeTimes/' + hole;
    var value = timestamp || Date.now();
    return db.ref(path).transaction(function(existing) {
        return parseInt(existing) > 0 ? existing : value;
    }).catch(function(error) {
        console.warn('[Pace] Cannot save hole time', error);
    });
}

function recordGroupHoleCompletion(roundId, hole, timestamp) {
    if (typeof db === 'undefined' || !roundId || !hole) return Promise.resolve();
    return db.ref('rounds/' + roundId).once('value').then(function(snapshot) {
        var roundData = snapshot.val();
        if (!roundData || roundData.mode !== 'group') return;
        var participants = getPaceParticipants(roundData);
        if (!participants.length || !participants.every(function(item) {
            return parseInt(item.player.scores && item.player.scores[hole]) >= 1;
        })) return;
        var path = 'rounds/' + roundId + '/holeTimes/' + hole;
        var value = timestamp || Date.now();
        return db.ref(path).transaction(function(existing) {
            return parseInt(existing) > 0 ? existing : value;
        });
    }).catch(function(error) {
        console.warn('[Pace] Cannot save group hole time', error);
    });
}

// ==========================================
// ВЫЗОВ СУДЬИ / МАРШАЛА С КУЛДАУНОМ 5 МИНУТ
// ==========================================
var OFFICIAL_CALL_COOLDOWN_MS = 5 * 60 * 1000;
var officialCallBindings = Object.create(null);

function officialCallKey(roundId, playerId, type) {
    return String(roundId || '') + '|' + String(playerId || '') + '|' + String(type || '');
}

function readLocalOfficialCall(roundId, playerId, type) {
    try {
        var raw = localStorage.getItem('pestovo_official_call_' + officialCallKey(roundId, playerId, type));
        if (!raw) return null;
        var value = JSON.parse(raw);
        return value && parseInt(value.time) > 0 ? value : null;
    } catch(e) { return null; }
}

function saveLocalOfficialCall(roundId, playerId, type, call) {
    try {
        localStorage.setItem('pestovo_official_call_' + officialCallKey(roundId, playerId, type), JSON.stringify({
            time: call.time,
            cooldownUntil: call.cooldownUntil,
            alertId: call.alertId || '',
            response: call.response || null
        }));
    } catch(e) {}
}

function getOfficialCallState(alerts, roundId, playerId, type) {
    var matches = Object.entries(alerts || {}).map(function(entry) {
        return Object.assign({}, entry[1] || {}, { alertId: entry[0] });
    }).filter(function(alert) {
        return String(alert.roundId || '') === String(roundId || '') &&
            String(alert.playerId || '') === String(playerId || '') &&
            String(alert.type || '') === String(type || '') && parseInt(alert.time) > 0;
    });
    matches.sort(function(a, b) { return parseInt(a.time) - parseInt(b.time); });

    var localCall = readLocalOfficialCall(roundId, playerId, type);
    var serverCall = matches.length ? matches[matches.length - 1] : null;
    var call = serverCall;
    if (localCall && (!call || parseInt(localCall.time) > parseInt(call.time))) {
        call = Object.assign({}, localCall);
    }
    if (!call) return { call: null, remainingMs: 0, accepted: false, available: true };

    var callTime = parseInt(call.time) || 0;
    var cooldownUntil = parseInt(call.cooldownUntil) || (callTime + OFFICIAL_CALL_COOLDOWN_MS);
    var remainingMs = Math.max(0, cooldownUntil - Date.now());
    return {
        call: call,
        remainingMs: remainingMs,
        accepted: !!(call.response && parseInt(call.response.respondedAt) > 0),
        available: remainingMs <= 0
    };
}

function formatOfficialCountdown(ms) {
    var totalSeconds = Math.max(0, Math.ceil((parseInt(ms) || 0) / 1000));
    var mins = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return (mins < 10 ? '0' : '') + mins + ':' + (seconds < 10 ? '0' : '') + seconds;
}

function getOfficialRoleName(type) {
    return type === 'marshal'
        ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
        : (currentLang === 'en' ? 'Referee' : 'Судья');
}

function getOfficialCallButtonLabel(type) {
    return type === 'marshal' ? t('call_marshal') : t('call_referee');
}

function getOfficialCallIcon(type) {
    return type === 'marshal' ? 'fa-shield-halved' : 'fa-gavel';
}

function renderOfficialCallButtons(config, alerts) {
    if (!config || !config.roundId || !config.playerId) return;
    var canEdit = typeof config.canEdit === 'function' ? config.canEdit() : config.canEdit !== false;
    var prefix = config.prefix || 'official';
    ['referee', 'marshal'].forEach(function(type) {
        var btn = document.getElementById(prefix + '-' + type + '-call-btn');
        if (!btn) return;
        var state = getOfficialCallState(alerts || {}, config.roundId, config.playerId, type);
        var enabled = canEdit && state.available;
        var role = getOfficialRoleName(type);
        var isAccepted = state.accepted && !state.available;
        var label = enabled
            ? getOfficialCallButtonLabel(type)
            : (isAccepted ? role + ' ' + t('call_on_way') : t('call_sent'));

        btn.disabled = !enabled;
        btn.className = 'btn btn-sm official-call-btn ' + (type === 'marshal' ? 'btn-warning' : 'btn-danger') +
            (enabled ? ' official-call-ready' : isAccepted ? ' official-call-accepted' : ' official-call-sent');
        btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        btn.innerHTML = '<i class="fas ' + getOfficialCallIcon(type) + '"></i> ' + label;

        var statusEl = document.getElementById(prefix + '-' + type + '-call-status');
        if (!statusEl) return;
        if (!state.call || state.available) {
            statusEl.innerHTML = '';
            statusEl.className = 'official-call-status hidden';
            return;
        }

        var statusHtml = '';
        if (state.accepted) {
            var acceptedAt = parseInt(state.call.response.respondedAt) || 0;
            statusHtml = '<strong>' + role + ' ' + t('call_accepted') + ' ' + fmtTime(acceptedAt) + '</strong>' +
                ' · ' + role + ' ' + t('call_on_way');
        } else {
            statusHtml = '<strong>' + t('call_sent') + '</strong>' +
                (state.call.time ? ' · ' + fmtTime(state.call.time) : '');
        }
        statusHtml += '<br><span>' + t('call_cooldown') + ' <b>' + formatOfficialCountdown(state.remainingMs) + '</b></span>';
        statusEl.innerHTML = statusHtml;
        statusEl.className = 'official-call-status ' + (state.accepted ? 'accepted' : 'sent');
    });
}

function refreshOfficialCallBindings() {
    Object.keys(officialCallBindings).forEach(function(key) {
        var binding = officialCallBindings[key];
        if (binding) renderOfficialCallButtons(binding.config, binding.alerts || {});
    });
}

function ensureOfficialCallTicker(key) {
    var binding = officialCallBindings[key];
    if (!binding || binding.timer) return;
    var tick = function() {
        var current = officialCallBindings[key];
        if (!current) return;
        renderOfficialCallButtons(current.config, current.alerts || {});
        current.timer = setTimeout(tick, isBatterySaverEnabled() ? 30000 : 1000);
    };
    binding.timer = setTimeout(tick, isBatterySaverEnabled() ? 30000 : 1000);
}

function reconcileOfficialCallResponse(binding, notification) {
    if (!binding || !notification || notification.type !== 'call_response') return;
    var alertId = notification.alertId || '';
    var alert = alertId && binding.alerts ? binding.alerts[alertId] : null;
    if (alert && String(alert.playerId || '') !== String(binding.config.playerId || '')) alert = null;
    var response = {
        status: 'accepted',
        responderRole: notification.responderRole,
        respondedAt: parseInt(notification.time) || Date.now()
    };

    if (alert) {
        alert.response = Object.assign({}, alert.response || {}, response);
        saveLocalOfficialCall(binding.config.roundId, binding.config.playerId, alert.type, alert);
    } else {
        // Если чтение alerts недоступно, локальная запись всё равно переводит
        // кнопку в состояние «едет» после push-уведомления от администратора.
        ['referee', 'marshal'].forEach(function(type) {
            var local = readLocalOfficialCall(binding.config.roundId, binding.config.playerId, type);
            if (local && (!alertId || local.alertId === alertId)) {
                local.response = response;
                saveLocalOfficialCall(binding.config.roundId, binding.config.playerId, type, local);
            }
        });
    }
    renderOfficialCallButtons(binding.config, binding.alerts || {});
}

function listenForOfficialCallState(config) {
    if (typeof db === 'undefined' || !config || !config.roundId || !config.playerId) return;
    var key = officialCallKey(config.roundId, config.playerId, config.prefix || 'official');
    if (!officialCallBindings[key]) {
        officialCallBindings[key] = { config: config, alerts: {}, timer: null };
        db.ref('alerts').orderByChild('roundId').equalTo(String(config.roundId)).on('value', function(snapshot) {
            var binding = officialCallBindings[key];
            if (!binding) return;
            binding.alerts = snapshot.val() || {};
            renderOfficialCallButtons(binding.config, binding.alerts);
        });
        db.ref('users/' + config.playerId + '/notifications').orderByChild('type').equalTo('call_response').on('child_added', function(snapshot) {
            var binding = officialCallBindings[key];
            if (binding) reconcileOfficialCallResponse(binding, snapshot.val());
        });
    } else {
        officialCallBindings[key].config = config;
    }
    ensureOfficialCallTicker(key);
    renderOfficialCallButtons(officialCallBindings[key].config, officialCallBindings[key].alerts || {});
}

function requestOfficialCall(config) {
    if (typeof db === 'undefined' || !config || !config.roundId || !config.playerId || !config.type) return Promise.resolve(false);
    var type = config.type;
    var localState = getOfficialCallState({}, config.roundId, config.playerId, type);
    if (localState.remainingMs > 0) {
        renderOfficialCallButtons(config, {});
        toast(t('call_cooldown') + ' ' + formatOfficialCountdown(localState.remainingMs), 'warn');
        return Promise.resolve(false);
    }

    // Чтение списка вызовов может быть запрещено правилами Firebase для игрока.
    // В этом случае локальный таймер всё равно защищает от обычного спама,
    // а сам вызов не должен блокироваться — продолжаем с пустым списком.
    var alertsPromise = db.ref('alerts').orderByChild('roundId').equalTo(String(config.roundId)).once('value')
        .then(function(snapshot) { return snapshot.val() || {}; })
        .catch(function(error) {
            console.warn('[Calls] Cannot read existing calls; using local cooldown', error);
            return {};
        });

    return alertsPromise.then(function(alerts) {
        var state = getOfficialCallState(alerts, config.roundId, config.playerId, type);
        if (state.remainingMs > 0) {
            renderOfficialCallButtons(config, alerts);
            toast(t('call_cooldown') + ' ' + formatOfficialCountdown(state.remainingMs), 'warn');
            return false;
        }

        var hole = typeof config.hole === 'function' ? config.hole() : config.hole;
        var role = getOfficialRoleName(type);
        var confirmText = currentLang === 'en'
            ? 'Call ' + role.toLowerCase() + ' to hole ' + hole + '?'
            : 'Вызвать ' + (type === 'marshal' ? 'маршала' : 'судью') + ' на лунку ' + hole + '?';
        if (!window.confirm(confirmText)) return false;

        var now = Date.now();
        var playerName = typeof config.playerName === 'function' ? config.playerName() : config.playerName;
        var flightMembers = typeof config.flightMembers === 'function' ? config.flightMembers() : config.flightMembers;
        var call = {
            roundId: config.roundId,
            type: type,
            hole: hole,
            playerId: config.playerId,
            playerName: playerName || (currentLang === 'en' ? 'Player' : 'Игрок'),
            flightMembers: flightMembers || [],
            time: now,
            createdAt: now,
            cooldownUntil: now + OFFICIAL_CALL_COOLDOWN_MS,
            status: 'active',
            state: 'sent'
        };
        var ref = db.ref('alerts').push();
        call.alertId = ref.key;
        return ref.set(call).then(function() {
            saveLocalOfficialCall(config.roundId, config.playerId, type, call);
            var binding = officialCallBindings[officialCallKey(config.roundId, config.playerId, config.prefix || 'official')];
            if (binding) {
                binding.alerts = binding.alerts || {};
                binding.alerts[ref.key] = call;
                renderOfficialCallButtons(binding.config, binding.alerts);
            }
            if (typeof config.onSent === 'function') config.onSent(call);
            return true;
        });
    }).catch(function(error) {
        toast((currentLang === 'en' ? '❌ Call failed: ' : '❌ Не удалось отправить вызов: ') + (error && error.message ? error.message : error), 'error');
        return false;
    });
}

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
    var num = Math.round(parseFloat(val) || 0);
    if (num < 0) {
        return '+' + Math.abs(num);
    }
    return String(num);
}

// Цветовая градация игрового гандикапа для счётных карточек и чипов.
// Зелёный — свободные лунки, гандикап кодируется отдельной шкалой:
// +/скретч (<=0), 1–10, 11–20, 21–36, 37+.
function fieldHcpBandClass(val) {
    var hcp = parseFloat(val);
    if (isNaN(hcp)) return 'hcp-band-unknown';
    if (hcp <= 0) return 'hcp-band-plus';
    if (hcp <= 10) return 'hcp-band-1-10';
    if (hcp <= 20) return 'hcp-band-11-20';
    if (hcp <= 36) return 'hcp-band-21-36';
    return 'hcp-band-37';
}

function fieldHcpBandTitle(val) {
    var hcp = parseFloat(val);
    if (isNaN(hcp)) return '';
    if (hcp <= 0) return 'HCP + / scratch';
    if (hcp <= 10) return 'HCP 1–10';
    if (hcp <= 20) return 'HCP 11–20';
    if (hcp <= 36) return 'HCP 21–36';
    return 'HCP 37+';
}

const PESTOVO_MEN_HCP_TABLE = {
    bk: [
        { min: -3.5, max: -2.8, hcp: 0 }, { min: -2.7, max: -2.0, hcp: 1 }, { min: -1.9, max: -1.2, hcp: 2 },
        { min: -1.1, max: -0.4, hcp: 3 }, { min: -0.3, max: 0.3, hcp: 4 }, { min: 0.4, max: 1.1, hcp: 5 },
        { min: 1.2, max: 1.9, hcp: 6 }, { min: 2.0, max: 2.7, hcp: 7 }, { min: 2.8, max: 3.5, hcp: 8 },
        { min: 3.6, max: 4.3, hcp: 9 }, { min: 4.4, max: 5.1, hcp: 10 }, { min: 5.2, max: 5.8, hcp: 11 },
        { min: 5.9, max: 6.6, hcp: 12 }, { min: 6.7, max: 7.4, hcp: 13 }, { min: 7.5, max: 8.2, hcp: 14 },
        { min: 8.3, max: 9.0, hcp: 15 }, { min: 9.1, max: 9.8, hcp: 16 }, { min: 9.9, max: 10.5, hcp: 17 },
        { min: 10.6, max: 11.3, hcp: 18 }, { min: 11.4, max: 12.1, hcp: 19 }, { min: 12.2, max: 12.9, hcp: 20 },
        { min: 13.0, max: 13.7, hcp: 21 }, { min: 13.8, max: 14.5, hcp: 22 }, { min: 14.6, max: 15.3, hcp: 23 },
        { min: 15.4, max: 16.0, hcp: 24 }, { min: 16.1, max: 16.8, hcp: 25 }, { min: 16.9, max: 17.6, hcp: 26 },
        { min: 17.7, max: 18.4, hcp: 27 }, { min: 18.5, max: 19.2, hcp: 28 }, { min: 19.3, max: 20.0, hcp: 29 },
        { min: 20.1, max: 20.7, hcp: 30 }, { min: 20.8, max: 21.5, hcp: 31 }, { min: 21.6, max: 22.3, hcp: 32 },
        { min: 22.4, max: 23.1, hcp: 33 }, { min: 23.2, max: 23.9, hcp: 34 }, { min: 24.0, max: 24.7, hcp: 35 },
        { min: 24.8, max: 25.5, hcp: 36 }, { min: 25.6, max: 26.2, hcp: 37 }, { min: 26.3, max: 27.0, hcp: 38 },
        { min: 27.1, max: 27.8, hcp: 39 }, { min: 27.9, max: 28.6, hcp: 40 }, { min: 28.7, max: 29.4, hcp: 41 },
        { min: 29.5, max: 30.2, hcp: 42 }, { min: 30.3, max: 30.9, hcp: 43 }, { min: 31.0, max: 31.7, hcp: 44 },
        { min: 31.8, max: 32.5, hcp: 45 }, { min: 32.6, max: 33.3, hcp: 46 }, { min: 33.4, max: 34.1, hcp: 47 },
        { min: 34.2, max: 34.9, hcp: 48 }, { min: 35.0, max: 35.7, hcp: 49 }, { min: 35.8, max: 36.4, hcp: 50 },
        { min: 36.5, max: 37.2, hcp: 51 }, { min: 37.3, max: 38.0, hcp: 52 }, { min: 38.1, max: 38.8, hcp: 53 },
        { min: 38.9, max: 39.6, hcp: 54 }, { min: 39.7, max: 40.4, hcp: 55 }, { min: 40.5, max: 41.1, hcp: 56 },
        { min: 41.2, max: 41.9, hcp: 57 }, { min: 42.0, max: 42.7, hcp: 58 }, { min: 42.8, max: 43.5, hcp: 59 },
        { min: 43.6, max: 44.3, hcp: 60 }, { min: 44.4, max: 45.1, hcp: 61 }, { min: 45.2, max: 45.9, hcp: 62 },
        { min: 46.0, max: 46.6, hcp: 63 }, { min: 46.7, max: 47.4, hcp: 64 }, { min: 47.5, max: 48.2, hcp: 65 },
        { min: 48.3, max: 49.0, hcp: 66 }, { min: 49.1, max: 49.8, hcp: 67 }, { min: 49.9, max: 50.6, hcp: 68 },
        { min: 50.7, max: 51.3, hcp: 69 }, { min: 51.4, max: 52.1, hcp: 70 }, { min: 52.2, max: 52.9, hcp: 71 },
        { min: 53.0, max: 53.7, hcp: 72 }, { min: 53.8, max: 54.0, hcp: 73 }
    ],
    bl: [
        { min: -3.5, max: -2.8, hcp: -2 }, { min: -2.7, max: -1.9, hcp: -1 }, { min: -1.8, max: -1.1, hcp: 0 },
        { min: -1.0, max: -0.3, hcp: 1 }, { min: -0.2, max: 0.5, hcp: 2 }, { min: 0.6, max: 1.4, hcp: 3 },
        { min: 1.5, max: 2.2, hcp: 4 }, { min: 2.3, max: 3.0, hcp: 5 }, { min: 3.1, max: 3.8, hcp: 6 },
        { min: 3.9, max: 4.7, hcp: 7 }, { min: 4.8, max: 5.5, hcp: 8 }, { min: 5.6, max: 6.3, hcp: 9 },
        { min: 6.4, max: 7.1, hcp: 10 }, { min: 7.2, max: 8.0, hcp: 11 }, { min: 8.1, max: 8.8, hcp: 12 },
        { min: 8.9, max: 9.6, hcp: 13 }, { min: 9.7, max: 10.4, hcp: 14 }, { min: 10.5, max: 11.3, hcp: 15 },
        { min: 11.4, max: 12.1, hcp: 16 }, { min: 12.2, max: 12.9, hcp: 17 }, { min: 13.0, max: 13.7, hcp: 18 },
        { min: 13.8, max: 14.5, hcp: 19 }, { min: 14.6, max: 15.4, hcp: 20 }, { min: 15.5, max: 16.2, hcp: 21 },
        { min: 16.3, max: 17.0, hcp: 22 }, { min: 17.1, max: 17.8, hcp: 23 }, { min: 17.9, max: 18.7, hcp: 24 },
        { min: 18.8, max: 19.5, hcp: 25 }, { min: 19.6, max: 20.3, hcp: 26 }, { min: 20.4, max: 21.1, hcp: 27 },
        { min: 21.2, max: 22.0, hcp: 28 }, { min: 22.1, max: 22.8, hcp: 29 }, { min: 22.9, max: 23.6, hcp: 30 },
        { min: 23.7, max: 24.4, hcp: 31 }, { min: 24.5, max: 25.3, hcp: 32 }, { min: 25.4, max: 26.1, hcp: 33 },
        { min: 26.2, max: 26.9, hcp: 34 }, { min: 27.0, max: 27.7, hcp: 35 }, { min: 27.8, max: 28.6, hcp: 36 },
        { min: 28.7, max: 29.4, hcp: 37 }, { min: 29.5, max: 30.2, hcp: 38 }, { min: 30.3, max: 31.0, hcp: 39 },
        { min: 31.1, max: 31.9, hcp: 40 }, { min: 32.0, max: 32.7, hcp: 41 }, { min: 32.8, max: 33.5, hcp: 42 },
        { min: 33.6, max: 34.3, hcp: 43 }, { min: 34.4, max: 35.2, hcp: 44 }, { min: 35.3, max: 36.0, hcp: 45 },
        { min: 36.1, max: 36.8, hcp: 46 }, { min: 36.9, max: 37.6, hcp: 47 }, { min: 37.7, max: 38.5, hcp: 48 },
        { min: 38.6, max: 39.3, hcp: 49 }, { min: 39.4, max: 40.1, hcp: 50 }, { min: 40.2, max: 40.9, hcp: 51 },
        { min: 41.0, max: 41.8, hcp: 52 }, { min: 41.9, max: 42.6, hcp: 53 }, { min: 42.7, max: 43.4, hcp: 54 },
        { min: 43.5, max: 44.2, hcp: 55 }, { min: 44.3, max: 45.1, hcp: 56 }, { min: 45.2, max: 45.9, hcp: 57 },
        { min: 46.0, max: 46.7, hcp: 58 }, { min: 46.8, max: 47.5, hcp: 59 }, { min: 47.6, max: 48.4, hcp: 60 },
        { min: 48.5, max: 49.2, hcp: 61 }, { min: 49.3, max: 50.0, hcp: 62 }, { min: 50.1, max: 50.8, hcp: 63 },
        { min: 50.9, max: 51.7, hcp: 64 }, { min: 51.8, max: 52.5, hcp: 65 }, { min: 52.6, max: 53.3, hcp: 66 },
        { min: 53.4, max: 54.0, hcp: 67 }
    ],
    wh: [
        { min: -3.7, max: -3.0, hcp: -4 }, { min: -2.9, max: -2.1, hcp: -3 }, { min: -2.0, max: -1.3, hcp: -2 },
        { min: -1.2, max: -0.5, hcp: -1 }, { min: -0.4, max: 0.4, hcp: 0 }, { min: 0.5, max: 1.2, hcp: 1 },
        { min: 1.3, max: 2.0, hcp: 2 }, { min: 2.1, max: 2.9, hcp: 3 }, { min: 3.0, max: 3.7, hcp: 4 },
        { min: 3.8, max: 4.6, hcp: 5 }, { min: 4.7, max: 5.4, hcp: 6 }, { min: 5.5, max: 6.2, hcp: 7 },
        { min: 6.3, max: 7.1, hcp: 8 }, { min: 7.2, max: 7.9, hcp: 9 }, { min: 8.0, max: 8.7, hcp: 10 },
        { min: 8.8, max: 9.6, hcp: 11 }, { min: 9.7, max: 10.4, hcp: 12 }, { min: 10.5, max: 11.3, hcp: 13 },
        { min: 11.4, max: 12.1, hcp: 14 }, { min: 12.2, max: 12.9, hcp: 15 }, { min: 13.0, max: 13.8, hcp: 16 },
        { min: 13.9, max: 14.6, hcp: 17 }, { min: 14.7, max: 15.4, hcp: 18 }, { min: 15.5, max: 16.3, hcp: 19 },
        { min: 16.4, max: 17.1, hcp: 20 }, { min: 17.2, max: 17.9, hcp: 21 }, { min: 18.0, max: 18.8, hcp: 22 },
        { min: 18.9, max: 19.6, hcp: 23 }, { min: 19.7, max: 20.5, hcp: 24 }, { min: 20.6, max: 21.3, hcp: 25 },
        { min: 21.4, max: 22.1, hcp: 26 }, { min: 22.2, max: 23.0, hcp: 27 }, { min: 23.1, max: 23.8, hcp: 28 },
        { min: 23.9, max: 24.6, hcp: 29 }, { min: 24.7, max: 25.5, hcp: 30 }, { min: 25.6, max: 26.3, hcp: 31 },
        { min: 26.4, max: 27.2, hcp: 32 }, { min: 27.3, max: 28.0, hcp: 33 }, { min: 28.1, max: 28.8, hcp: 34 },
        { min: 28.9, max: 29.7, hcp: 35 }, { min: 29.8, max: 30.5, hcp: 36 }, { min: 30.6, max: 31.3, hcp: 37 },
        { min: 31.4, max: 32.2, hcp: 38 }, { min: 32.3, max: 33.0, hcp: 39 }, { min: 33.1, max: 33.9, hcp: 40 },
        { min: 34.0, max: 34.7, hcp: 41 }, { min: 34.8, max: 35.5, hcp: 42 }, { min: 35.6, max: 36.4, hcp: 43 },
        { min: 36.5, max: 37.2, hcp: 44 }, { min: 37.3, max: 38.0, hcp: 45 }, { min: 38.1, max: 38.9, hcp: 46 },
        { min: 39.0, max: 39.7, hcp: 47 }, { min: 39.8, max: 40.5, hcp: 48 }, { min: 40.6, max: 41.4, hcp: 49 },
        { min: 41.5, max: 42.2, hcp: 50 }, { min: 42.3, max: 43.1, hcp: 51 }, { min: 43.2, max: 43.9, hcp: 52 },
        { min: 44.0, max: 44.7, hcp: 53 }, { min: 44.8, max: 45.6, hcp: 54 }, { min: 45.7, max: 46.4, hcp: 55 },
        { min: 46.5, max: 47.2, hcp: 56 }, { min: 47.3, max: 48.1, hcp: 57 }, { min: 48.2, max: 48.9, hcp: 58 },
        { min: 49.0, max: 49.8, hcp: 59 }, { min: 49.9, max: 50.6, hcp: 60 }, { min: 50.7, max: 51.4, hcp: 61 },
        { min: 51.5, max: 52.3, hcp: 62 }, { min: 52.4, max: 53.1, hcp: 63 }, { min: 53.2, max: 53.9, hcp: 64 },
        { min: 54.0, max: 54.0, hcp: 65 }
    ],
    rd: [
        { min: -3.1, max: -2.3, hcp: -6 }, { min: -2.2, max: -1.5, hcp: -5 }, { min: -1.4, max: -0.6, hcp: -4 },
        { min: -0.5, max: 0.2, hcp: -3 }, { min: 0.3, max: 1.0, hcp: -2 }, { min: 1.1, max: 1.9, hcp: -1 },
        { min: 2.0, max: 2.7, hcp: 0 }, { min: 2.8, max: 3.6, hcp: 1 }, { min: 3.7, max: 4.4, hcp: 2 },
        { min: 4.5, max: 5.3, hcp: 3 }, { min: 5.4, max: 6.1, hcp: 4 }, { min: 6.2, max: 6.9, hcp: 5 },
        { min: 7.0, max: 7.8, hcp: 6 }, { min: 7.9, max: 8.6, hcp: 7 }, { min: 8.7, max: 9.5, hcp: 8 },
        { min: 9.6, max: 10.3, hcp: 9 }, { min: 10.4, max: 11.2, hcp: 10 }, { min: 11.3, max: 12.0, hcp: 11 },
        { min: 12.1, max: 12.9, hcp: 12 }, { min: 13.0, max: 13.7, hcp: 13 }, { min: 13.8, max: 14.5, hcp: 14 },
        { min: 14.6, max: 15.4, hcp: 15 }, { min: 15.5, max: 16.2, hcp: 16 }, { min: 16.3, max: 17.1, hcp: 17 },
        { min: 17.2, max: 17.9, hcp: 18 }, { min: 18.0, max: 18.8, hcp: 19 }, { min: 18.9, max: 19.6, hcp: 20 },
        { min: 19.7, max: 20.4, hcp: 21 }, { min: 20.5, max: 21.3, hcp: 22 }, { min: 21.4, max: 22.1, hcp: 23 },
        { min: 22.2, max: 23.0, hcp: 24 }, { min: 23.1, max: 23.8, hcp: 25 }, { min: 23.9, max: 24.7, hcp: 26 },
        { min: 24.8, max: 25.5, hcp: 27 }, { min: 25.6, max: 26.3, hcp: 28 }, { min: 26.4, max: 27.2, hcp: 29 },
        { min: 27.3, max: 28.0, hcp: 30 }, { min: 28.1, max: 28.9, hcp: 31 }, { min: 29.0, max: 29.7, hcp: 32 },
        { min: 29.8, max: 30.6, hcp: 33 }, { min: 30.7, max: 31.4, hcp: 34 }, { min: 31.5, max: 32.2, hcp: 35 },
        { min: 32.3, max: 33.1, hcp: 36 }, { min: 33.2, max: 33.9, hcp: 37 }, { min: 34.0, max: 34.8, hcp: 38 },
        { min: 34.9, max: 35.6, hcp: 39 }, { min: 35.7, max: 36.5, hcp: 40 }, { min: 36.6, max: 37.3, hcp: 41 },
        { min: 37.4, max: 38.2, hcp: 42 }, { min: 38.3, max: 39.0, hcp: 43 }, { min: 39.1, max: 39.8, hcp: 44 },
        { min: 39.9, max: 40.7, hcp: 45 }, { min: 40.8, max: 41.5, hcp: 46 }, { min: 41.6, max: 42.4, hcp: 47 },
        { min: 42.5, max: 43.2, hcp: 48 }, { min: 43.3, max: 44.1, hcp: 49 }, { min: 44.2, max: 44.9, hcp: 50 },
        { min: 45.0, max: 45.7, hcp: 51 }, { min: 45.8, max: 46.6, hcp: 52 }, { min: 46.7, max: 47.4, hcp: 53 },
        { min: 47.5, max: 48.3, hcp: 54 }, { min: 48.4, max: 49.1, hcp: 55 }, { min: 49.2, max: 50.0, hcp: 56 },
        { min: 50.1, max: 50.8, hcp: 57 }, { min: 50.9, max: 51.6, hcp: 58 }, { min: 51.7, max: 52.5, hcp: 59 },
        { min: 52.6, max: 53.3, hcp: 60 }, { min: 53.4, max: 54.0, hcp: 61 }
    ]
};

const PESTOVO_WOMEN_HCP_TABLE = {
    bl: [
        { min: -6.8, max: -6.2, hcp: 0 }, { min: -6.1, max: -5.4, hcp: 1 }, { min: -5.3, max: -4.7, hcp: 2 },
        { min: -4.6, max: -4.0, hcp: 3 }, { min: -3.9, max: -3.2, hcp: 4 }, { min: -3.1, max: -2.5, hcp: 5 },
        { min: -2.4, max: -1.7, hcp: 6 }, { min: -1.6, max: -1.0, hcp: 7 }, { min: -0.9, max: -0.3, hcp: 8 },
        { min: -0.2, max: 0.5, hcp: 9 }, { min: 0.6, max: 1.2, hcp: 10 }, { min: 1.3, max: 1.9, hcp: 11 },
        { min: 2.0, max: 2.7, hcp: 12 }, { min: 2.8, max: 3.4, hcp: 13 }, { min: 3.5, max: 4.2, hcp: 14 },
        { min: 4.3, max: 4.9, hcp: 15 }, { min: 5.0, max: 5.6, hcp: 16 }, { min: 5.7, max: 6.4, hcp: 17 },
        { min: 6.5, max: 7.1, hcp: 18 }, { min: 7.2, max: 7.9, hcp: 19 }, { min: 8.0, max: 8.6, hcp: 20 },
        { min: 8.7, max: 9.3, hcp: 21 }, { min: 9.4, max: 10.1, hcp: 22 }, { min: 10.2, max: 10.8, hcp: 23 },
        { min: 10.9, max: 11.5, hcp: 24 }, { min: 11.6, max: 12.3, hcp: 25 }, { min: 12.4, max: 13.0, hcp: 26 },
        { min: 13.1, max: 13.8, hcp: 27 }, { min: 13.9, max: 14.5, hcp: 28 }, { min: 14.6, max: 15.2, hcp: 29 },
        { min: 15.3, max: 16.0, hcp: 30 }, { min: 16.1, max: 16.7, hcp: 31 }, { min: 16.8, max: 17.5, hcp: 32 },
        { min: 17.6, max: 18.2, hcp: 33 }, { min: 18.3, max: 18.9, hcp: 34 }, { min: 19.0, max: 19.7, hcp: 35 },
        { min: 19.8, max: 20.4, hcp: 36 }, { min: 20.5, max: 21.1, hcp: 37 }, { min: 21.2, max: 21.9, hcp: 38 },
        { min: 22.0, max: 22.6, hcp: 39 }, { min: 22.7, max: 23.4, hcp: 40 }, { min: 23.5, max: 24.1, hcp: 41 },
        { min: 24.2, max: 24.8, hcp: 42 }, { min: 24.9, max: 25.6, hcp: 43 }, { min: 25.7, max: 26.3, hcp: 44 },
        { min: 26.4, max: 27.1, hcp: 45 }, { min: 27.2, max: 27.8, hcp: 46 }, { min: 27.9, max: 28.5, hcp: 47 },
        { min: 28.6, max: 29.3, hcp: 48 }, { min: 29.4, max: 30.0, hcp: 49 }, { min: 30.1, max: 30.7, hcp: 50 },
        { min: 30.8, max: 31.5, hcp: 51 }, { min: 31.6, max: 32.2, hcp: 52 }, { min: 32.3, max: 33.0, hcp: 53 },
        { min: 33.1, max: 33.7, hcp: 54 }, { min: 33.8, max: 34.4, hcp: 55 }, { min: 34.5, max: 35.2, hcp: 56 },
        { min: 35.3, max: 35.9, hcp: 57 }, { min: 36.0, max: 36.7, hcp: 58 }, { min: 36.8, max: 37.4, hcp: 59 },
        { min: 37.5, max: 38.1, hcp: 60 }, { min: 38.2, max: 38.9, hcp: 61 }, { min: 39.0, max: 39.6, hcp: 62 },
        { min: 39.7, max: 40.3, hcp: 63 }, { min: 40.4, max: 41.1, hcp: 64 }, { min: 41.2, max: 41.8, hcp: 65 },
        { min: 41.9, max: 42.6, hcp: 66 }, { min: 42.7, max: 43.3, hcp: 67 }, { min: 43.4, max: 44.0, hcp: 68 },
        { min: 44.1, max: 44.8, hcp: 69 }, { min: 44.9, max: 45.5, hcp: 70 }, { min: 45.6, max: 46.3, hcp: 71 },
        { min: 46.4, max: 47.0, hcp: 72 }, { min: 47.1, max: 47.7, hcp: 73 }, { min: 47.8, max: 48.5, hcp: 74 },
        { min: 48.6, max: 49.2, hcp: 75 }, { min: 49.3, max: 50.0, hcp: 76 }, { min: 50.1, max: 50.7, hcp: 77 },
        { min: 50.8, max: 51.4, hcp: 78 }, { min: 51.5, max: 52.2, hcp: 79 }, { min: 52.3, max: 52.9, hcp: 80 },
        { min: 53.0, max: 53.6, hcp: 81 }, { min: 53.7, max: 54.0, hcp: 82 }
    ],
    wh: [
        { min: -5.6, max: -4.9, hcp: 0 }, { min: -4.8, max: -4.1, hcp: 1 }, { min: -4.0, max: -3.3, hcp: 2 },
        { min: -3.2, max: -2.5, hcp: 3 }, { min: -2.4, max: -1.7, hcp: 4 }, { min: -1.6, max: -0.9, hcp: 5 },
        { min: -0.8, max: -0.1, hcp: 6 }, { min: 0.0, max: 0.7, hcp: 7 }, { min: 0.8, max: 1.5, hcp: 8 },
        { min: 1.6, max: 2.2, hcp: 9 }, { min: 2.3, max: 3.0, hcp: 10 }, { min: 3.1, max: 3.8, hcp: 11 },
        { min: 3.9, max: 4.6, hcp: 12 }, { min: 4.7, max: 5.4, hcp: 13 }, { min: 5.5, max: 6.2, hcp: 14 },
        { min: 6.3, max: 7.0, hcp: 15 }, { min: 7.1, max: 7.8, hcp: 16 }, { min: 7.9, max: 8.6, hcp: 17 },
        { min: 8.7, max: 9.4, hcp: 18 }, { min: 9.5, max: 10.1, hcp: 19 }, { min: 10.2, max: 10.9, hcp: 20 },
        { min: 11.0, max: 11.7, hcp: 21 }, { min: 11.8, max: 12.5, hcp: 22 }, { min: 12.6, max: 13.3, hcp: 23 },
        { min: 13.4, max: 14.1, hcp: 24 }, { min: 14.2, max: 14.9, hcp: 25 }, { min: 15.0, max: 15.7, hcp: 26 },
        { min: 15.8, max: 16.5, hcp: 27 }, { min: 16.6, max: 17.3, hcp: 28 }, { min: 17.4, max: 18.0, hcp: 29 },
        { min: 18.1, max: 18.8, hcp: 30 }, { min: 18.9, max: 19.6, hcp: 31 }, { min: 19.7, max: 20.4, hcp: 32 },
        { min: 20.5, max: 21.2, hcp: 33 }, { min: 21.3, max: 22.0, hcp: 34 }, { min: 22.1, max: 22.8, hcp: 35 },
        { min: 22.9, max: 23.6, hcp: 36 }, { min: 23.7, max: 24.4, hcp: 37 }, { min: 24.5, max: 25.2, hcp: 38 },
        { min: 25.3, max: 25.9, hcp: 39 }, { min: 26.0, max: 26.7, hcp: 40 }, { min: 26.8, max: 27.5, hcp: 41 },
        { min: 27.6, max: 28.3, hcp: 42 }, { min: 28.4, max: 29.1, hcp: 43 }, { min: 29.2, max: 29.9, hcp: 44 },
        { min: 30.0, max: 30.7, hcp: 45 }, { min: 30.8, max: 31.5, hcp: 46 }, { min: 31.6, max: 32.3, hcp: 47 },
        { min: 32.4, max: 33.1, hcp: 48 }, { min: 33.2, max: 33.9, hcp: 49 }, { min: 34.0, max: 34.6, hcp: 50 },
        { min: 34.7, max: 35.4, hcp: 51 }, { min: 35.5, max: 36.2, hcp: 52 }, { min: 36.3, max: 37.0, hcp: 53 },
        { min: 37.1, max: 37.8, hcp: 54 }, { min: 37.9, max: 38.6, hcp: 55 }, { min: 38.7, max: 39.4, hcp: 56 },
        { min: 39.5, max: 40.2, hcp: 57 }, { min: 40.3, max: 41.0, hcp: 58 }, { min: 41.1, max: 41.8, hcp: 59 },
        { min: 41.9, max: 42.5, hcp: 60 }, { min: 42.6, max: 43.3, hcp: 61 }, { min: 43.4, max: 44.1, hcp: 62 },
        { min: 44.2, max: 44.9, hcp: 63 }, { min: 45.0, max: 45.7, hcp: 64 }, { min: 45.8, max: 46.5, hcp: 65 },
        { min: 46.6, max: 47.3, hcp: 66 }, { min: 47.4, max: 48.1, hcp: 67 }, { min: 48.2, max: 48.9, hcp: 68 },
        { min: 49.0, max: 49.7, hcp: 69 }, { min: 49.8, max: 50.4, hcp: 70 }, { min: 50.5, max: 51.2, hcp: 71 },
        { min: 51.3, max: 52.0, hcp: 72 }, { min: 52.1, max: 52.8, hcp: 73 }, { min: 52.9, max: 53.6, hcp: 74 },
        { min: 53.7, max: 54.0, hcp: 75 }
    ],
    rd: [
        { min: -3.0, max: -2.3, hcp: 0 }, { min: -2.2, max: -1.5, hcp: 1 }, { min: -1.4, max: -0.6, hcp: 2 },
        { min: -0.5, max: 0.2, hcp: 3 }, { min: 0.3, max: 1.0, hcp: 4 }, { min: 1.1, max: 1.9, hcp: 5 },
        { min: 2.0, max: 2.7, hcp: 6 }, { min: 2.8, max: 3.5, hcp: 7 }, { min: 3.6, max: 4.4, hcp: 8 },
        { min: 4.5, max: 5.2, hcp: 9 }, { min: 5.3, max: 6.0, hcp: 10 }, { min: 6.1, max: 6.8, hcp: 11 },
        { min: 6.9, max: 7.7, hcp: 12 }, { min: 7.8, max: 8.5, hcp: 13 }, { min: 8.6, max: 9.3, hcp: 14 },
        { min: 9.4, max: 10.2, hcp: 15 }, { min: 10.3, max: 11.0, hcp: 16 }, { min: 11.1, max: 11.8, hcp: 17 },
        { min: 11.9, max: 12.7, hcp: 18 }, { min: 12.8, max: 13.5, hcp: 19 }, { min: 13.6, max: 14.3, hcp: 20 },
        { min: 14.4, max: 15.2, hcp: 21 }, { min: 15.3, max: 16.0, hcp: 22 }, { min: 16.1, max: 16.8, hcp: 23 },
        { min: 16.9, max: 17.6, hcp: 24 }, { min: 17.7, max: 18.5, hcp: 25 }, { min: 18.6, max: 19.3, hcp: 26 },
        { min: 19.4, max: 20.1, hcp: 27 }, { min: 20.2, max: 21.0, hcp: 28 }, { min: 21.1, max: 21.8, hcp: 29 },
        { min: 21.9, max: 22.6, hcp: 30 }, { min: 22.7, max: 23.5, hcp: 31 }, { min: 23.6, max: 24.3, hcp: 32 },
        { min: 24.4, max: 25.1, hcp: 33 }, { min: 25.2, max: 26.0, hcp: 34 }, { min: 26.1, max: 26.8, hcp: 35 },
        { min: 26.9, max: 27.6, hcp: 36 }, { min: 27.7, max: 28.4, hcp: 37 }, { min: 28.5, max: 29.3, hcp: 38 },
        { min: 29.4, max: 30.1, hcp: 39 }, { min: 30.2, max: 30.9, hcp: 40 }, { min: 31.0, max: 31.8, hcp: 41 },
        { min: 31.9, max: 32.6, hcp: 42 }, { min: 32.7, max: 33.4, hcp: 43 }, { min: 33.5, max: 34.3, hcp: 44 },
        { min: 34.4, max: 35.1, hcp: 45 }, { min: 35.2, max: 35.9, hcp: 46 }, { min: 36.0, max: 36.8, hcp: 47 },
        { min: 36.9, max: 37.6, hcp: 48 }, { min: 37.7, max: 38.4, hcp: 49 }, { min: 38.5, max: 39.3, hcp: 50 },
        { min: 39.4, max: 40.1, hcp: 51 }, { min: 40.2, max: 40.9, hcp: 52 }, { min: 41.0, max: 41.7, hcp: 53 },
        { min: 41.8, max: 42.6, hcp: 54 }, { min: 42.7, max: 43.4, hcp: 55 }, { min: 43.5, max: 44.2, hcp: 56 },
        { min: 44.3, max: 45.1, hcp: 57 }, { min: 45.2, max: 45.9, hcp: 58 }, { min: 46.0, max: 46.7, hcp: 59 },
        { min: 46.8, max: 47.6, hcp: 60 }, { min: 47.7, max: 48.4, hcp: 61 }, { min: 48.5, max: 49.2, hcp: 62 },
        { min: 49.3, max: 50.1, hcp: 63 }, { min: 50.2, max: 50.9, hcp: 64 }, { min: 51.0, max: 51.7, hcp: 65 },
        { min: 51.8, max: 52.5, hcp: 66 }, { min: 52.6, max: 53.4, hcp: 67 }, { min: 53.5, max: 54.0, hcp: 68 }
    ]
};

function getFieldHcp(exactHcp, teeCode, gender) {
    var parsed = parseExactHcp(exactHcp);
    gender = gender || 'men'; teeCode = teeCode || 'wh';

    if (gender === 'men' && PESTOVO_MEN_HCP_TABLE[teeCode]) {
        var list = PESTOVO_MEN_HCP_TABLE[teeCode];
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (parsed >= r.min - 0.001 && parsed <= r.max + 0.001) {
                return r.hcp;
            }
        }
    } else if (gender === 'women' && PESTOVO_WOMEN_HCP_TABLE[teeCode]) {
        var list = PESTOVO_WOMEN_HCP_TABLE[teeCode];
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (parsed >= r.min - 0.001 && parsed <= r.max + 0.001) {
                return r.hcp;
            }
        }
    }

    var rating = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][teeCode];
    if (!rating) return Math.round(parsed);
    var field = (parsed * (rating.sr / 113)) + (rating.cr - TOTAL_PAR);
    return Math.round(field);
}

function generateHcpTable(gender, teeCode) {
    gender = gender || 'men'; teeCode = teeCode || 'wh';

    if (gender === 'men' && PESTOVO_MEN_HCP_TABLE[teeCode]) {
        return PESTOVO_MEN_HCP_TABLE[teeCode].map(function(r) {
            return [fmtExactHcp(r.min), fmtExactHcp(r.max), fmtFieldHcp(r.hcp)];
        });
    } else if (gender === 'women' && PESTOVO_WOMEN_HCP_TABLE[teeCode]) {
        return PESTOVO_WOMEN_HCP_TABLE[teeCode].map(function(r) {
            return [fmtExactHcp(r.min), fmtExactHcp(r.max), fmtFieldHcp(r.hcp)];
        });
    }

    var rating = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][teeCode];
    if (!rating) return [];
    var rows = [];
    var maxPlus = -5.0;
    var maxHandicap = 54.0;

    var curStart = maxPlus;
    var curField = getFieldHcp(curStart, teeCode, gender);

    for (var x = -4.9; x <= maxHandicap + 0.05; x += 0.1) {
        var exactVal = Math.round(x * 10) / 10;
        var f = getFieldHcp(exactVal, teeCode, gender);
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

// Кол-во ударов полевой форы (course handicap) на конкретной лунке.
// Фора раздаётся по индексам лунок: индекс 1 — самая сложная лунка, получает удар первой и т.д.
// fieldHcp = 18 -> по 1 удару на каждой лунке; 19 -> +доп. удар на лунке с индексом 1;
// отрицательная фора раздаётся с самой простой лунки (индекс 18).
function hcpStrokesOnHole(holeNum,fieldHcp){
    fieldHcp=parseInt(fieldHcp)||0;
    if(!fieldHcp)return 0;
    var idx=holeHcp(holeNum);
    if(!idx)return 0;
    if(fieldHcp>0){
        var n=Math.floor(fieldHcp/18);
        if(idx<=(fieldHcp%18))n++;
        return n;
    }
    var a=Math.abs(fieldHcp);
    var m=-Math.floor(a/18);
    if((19-idx)<=(a%18))m--;
    return m;
}

// Маленькие чёрточки-индикаторы ударов форы для квадратика с номером лунки.
function hcpStrokesMarksHTML(fieldHcp,holeNum){
    var n=hcpStrokesOnHole(holeNum,fieldHcp);
    if(!n)return '';
    var neg=n<0,cnt=Math.abs(n),bars=[];
    for(var i=0;i<cnt;i++)bars.push('<span class="hm-bar"></span>');
    var title;
    if(currentLang==='en'){
        title=cnt+(cnt===1?' handicap stroke':' handicap strokes')+(neg?' (given)':'');
    }else{
        title='Фора: '+cnt+' '+pluralN(cnt,'удар','удара','ударов')+(neg?' (минусовая)':'');
    }
    return '<span class="hcp-marks'+(neg?' hm-minus':'')+'" title="'+title+'">'+bars.join('')+'</span>';
}

function pluralN(n,one,few,many){
    var m10=n%10,m100=n%100;
    if(m10===1&&m100!==11)return one;
    if(m10>=2&&m10<=4&&(m100<10||m100>=20))return few;
    return many;
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

// Настройка отображения очков Stableford. Если игрок ещё не выбрал своё
// значение, используется клубный дефолт из settings/stableford_display_default.
// Дефолт ВЫКЛЮЧЕН: очки Stableford не показываются рядом со счётом, пока игрок
// (или администратор клуба) явно не включит их в своём раунде/настройках.
var pestovoStablefordDisplayDefault = false;

function normalizeStablefordDisplayValue(value) {
    if (value === true || value === 1 || value === '1' || value === 'true') return true;
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    return null;
}

function isStablefordDisplayDefaultEnabled() {
    return pestovoStablefordDisplayDefault !== false;
}

function isPlayerStablefordDisplayEnabled(player) {
    var personalValue = player && normalizeStablefordDisplayValue(player.stablefordDisplay);
    return personalValue === null ? isStablefordDisplayDefaultEnabled() : personalValue;
}

function stablefordPointsText(points) {
    points = Math.max(0, parseInt(points) || 0);
    if (currentLang === 'en') {
        return points + ' Stableford ' + (points === 1 ? 'point' : 'points');
    }
    return points + ' ' + pluralN(points, 'очко', 'очка', 'очков') + ' Stableford';
}

// Разметка крупного счёта: gross остаётся главным, а очки отображаются рядом,
// например: 4 (3 очка Stableford). Используется в каждом экране ввода счёта.
function scoreWithStablefordHTML(score, holeNum, fieldHcp, showStableford) {
    var gross = parseInt(score) || 0;
    if (gross < 1) return '—';
    var html = '<span class="score-gross">' + gross + '</span>';
    if (showStableford) {
        var points = stablefordField(gross, holeNum, fieldHcp || 0);
        var label = stablefordPointsText(points);
        html += '<span class="score-stableford-points" aria-label="' + label + '">(' + label + ')</span>';
    }
    return html;
}

function syncStablefordDisplayDefault(value) {
    var normalized = normalizeStablefordDisplayValue(value);
    // Отсутствующий ключ settings/stableford_display_default — выключенный
    // дефолт: по умолчанию очки Stableford не показываются ни у кого.
    pestovoStablefordDisplayDefault = normalized === null ? false : normalized;
    try {
        document.dispatchEvent(new CustomEvent('pestovo-stableford-default-change'));
    } catch (e) {}
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
    var maxPlayedIdx=-1;

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
            if(i>maxPlayedIdx) maxPlayedIdx=i;
        }else{
            remaining.push(h);
        }
    }
    if(maxPlayedIdx>=0){
        if(maxPlayedIdx+1<holesOrder.length) currentHole=holesOrder[maxPlayedIdx+1];
        else currentHole=null;
    }else{
        currentHole=holesOrder.length?holesOrder[0]:null;
    }
    var toPar=played.length>0?gross-parPlayed:null;
    var netToPar=played.length>0?netTotal-parPlayed:null;
    var projected=played.length>0?gross+(TOTAL_PAR-parPlayed):null;
    return{played:played,remaining:remaining,holesPlayed:played.length,holesRemaining:remaining.length,currentHole:currentHole,gross:gross,parPlayed:parPlayed,toPar:toPar,net:netTotal,netToPar:netToPar,projected:projected,stablefordField:stblField,stablefordExact:stblExact,birdies:birdies,eagles:eagles,pars:pars,bogeys:bogeys,doubles:doubles,holeInOne:hio};
}

// ==========================================
// СЧЁТНАЯ КАРТОЧКА: ВКЛАДКИ ДЕВЯТОК, НАКОПИТЕЛЬНЫЙ TO-PAR,
// ПОДСВЕТКА ТЕКУЩЕЙ ЛУНКИ И БЫСТРЫЙ ПЕРЕХОД К НЕЙ
// ==========================================

// Вкладки «Первые 9 / Вторые 9 / Все 18» удалены: карточка всегда
// показывает все лунки выбранного диапазона сразу.
function holeNineClass(h) { return h <= 9 ? 'sc-h-front' : 'sc-h-back'; }

// Строка накопительного to-par удалена по требованию клуба: блок
// «To-par по ходу» больше не отображается ни на одной странице.
// Функция сохранена для совместимости — она по-прежнему считает
// накопительный run (нужен для продолжения счёта со второй девятки),
// но не возвращает разметку.
function buildToParRowHTML(order, sc, startRun, gridClass, wrapClass) {
    var run = startRun || 0;
    var playedAny = false;

    order.forEach(function(i) {
        var s = parseInt(sc[i]) || 0;
        if (s >= 1) {
            playedAny = true;
            run += s - holePar(i);
        }
    });

    if (!playedAny) return { html: '', run: run };
    return { html: '', run: run };
}

// Переход к текущей лунке игрока: плитка подсвечивается и прокручивается в центр экрана.
function scrollToPlayerCurrentHole(pid) {
    var tile = document.querySelector('.sc-cur-tile[data-sc-player="' + pid + '"]');
    if (!tile) {
        if (typeof toast === 'function') toast(t('no_current_hole'), 'info');
        return;
    }
    // Все лунки всегда видны (вкладки девяток удалены).
    if (typeof tile.scrollIntoView === 'function') {
        tile.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
    tile.classList.add('sc-cur-flash');
    setTimeout(function() { tile.classList.remove('sc-cur-flash'); }, 1800);
}

// Счёт, который маркер игрока ввёл ЗА этого игрока на лунке.
// Хранится в карточке самого игрока: p.markerScores[markedBy][hole].
// Возвращает { score, markerId } (score = 0, если маркер ещё не вводил).
function getPlayerMarkerScoreForHole(p, h) {
    p = p || {};
    var mkId = p.markedBy || null;
    var ms = 0;
    if (mkId && p.markerScores && p.markerScores[mkId]) {
        ms = parseInt(p.markerScores[mkId][h]) || 0;
    }
    // Запасной вариант: маркер мог ввести счёт под другим ключом
    // (например, после переназначения маркеров) — ищем любое значение на лунке.
    if (!ms && p.markerScores) {
        var keys = Object.keys(p.markerScores);
        for (var i = 0; i < keys.length; i++) {
            var v = parseInt(p.markerScores[keys[i]] && p.markerScores[keys[i]][h]) || 0;
            if (v >= 1) { ms = v; if (!mkId) mkId = keys[i]; break; }
        }
    }
    return { score: ms, markerId: mkId };
}

// Есть ли у игрока хоть один введённый маркером счёт (для компактных слоёв).
function playerHasAnyMarkerScore(p, order) {
    if (!p || !p.markerScores) return false;
    for (var i = 0; i < (order || []).length; i++) {
        if (getPlayerMarkerScoreForHole(p, order[i]).score >= 1) return true;
    }
    return false;
}

// Мини-легенда двойной карточки «игрок + маркер» (страница ввода результатов).
function buildDualScorecardLegendHTML() {
    return '<div class="dual-card-legend">' +
        '<span class="dcl-item"><i class="fas fa-user"></i> ' + t('legend_player_score') + '</span>' +
        '<span class="dcl-item dcl-marker"><i class="fas fa-pen-nib"></i> ' + t('marker_score_short') + ' — ' + t('legend_marker_score') + '</span>' +
        '<span class="dcl-item dcl-mismatch"><i class="fas fa-triangle-exclamation"></i> ' + t('legend_mismatch') + '</span>' +
        '</div>';
}

function generateGroupHoleTableHTML(r, opts) {
    opts = opts || {};
    var players = r.players || {};
    var playerEntries = Object.entries(players).filter(function(pe) {
        // Удалённые и навсегда заблокированные демо-игроки не показываются
        return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name));
    });
    if (!playerEntries.length) return '';

    var order = getRoundOrder(r);

    // Режим showMarker (страница ввода результатов группового раунда):
    // формат карточки — тот же, что на главной («Сейчас на поле»), но рядом
    // со счётом игрока виден и счёт, который ввёл его маркер.
    var legend = opts.showMarker ? buildDualScorecardLegendHTML() : '';

    // Если в раунде 1 игрок — показываем одиночную карточку
    if (playerEntries.length === 1) {
        return legend + renderSinglePlayerScorecardHTML(r, playerEntries[0], order, opts);
    }

    // Для группового раунда показываем единую карточку в одном из 3 вариантов:
    // 1 · Сводная матрица (Summary Matrix)
    // 2 · Сравнительная таблица (Comparison Table)
    // 3 · Лидерборд флайта (Flight Leaderboard)
    var variant = opts.variant || getGroupCardVariant();
    if (variant === '2') {
        return legend + renderGroupTableHTML(r, playerEntries, order, opts);
    } else if (variant === '3') {
        return legend + renderGroupLeaderboardHTML(r, playerEntries, order, opts);
    } else {
        return legend + renderGroupMatrixHTML(r, playerEntries, order, opts);
    }
}

function renderSinglePlayerScorecardHTML(r, pe, order, opts) {
    opts = opts || {};
    var compact = !!opts.compact;
    var holeCount = order.length;
    var courseHcpLbl = t('field_hcp_short');
    var pid = pe[0], p = pe[1];
    var sc = p.scores || {};
    var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
    var stats = calcRoundStats(sc, fieldHcp || 0, p.exactHcp || 0, order);
    var thruText = stats.holesPlayed >= holeCount ? t('finished_f') : (stats.currentHole ? t('hole') + ' №' + stats.currentHole : '');

    var pTee = (p && p.tee) || r.tee || 'wh';
    var pTeeBadge = '<span class="tee-pill tee-' + pTee + '" style="font-size:9.5px;padding:1px 7px;margin-left:6px;vertical-align:middle;">' + t('tee_' + pTee) + '</span>';
    var pHcpBadge = '<span class="hcp-chip ' + fieldHcpBandClass(fieldHcp) + '" title="' + fieldHcpBandTitle(fieldHcp) + '">' + courseHcpLbl + ' ' + fmtFieldHcp(fieldHcp) + '</span>';

    var isFinished = stats.holesPlayed >= holeCount;
    var curHole = isFinished ? null : stats.currentHole;

    var html = '<div class="no-scroll-view-container">';
    if (compact) {
        html += '<div class="noscroll-player-block">';
        html += '<div class="noscroll-player-hdr noscroll-player-hdr--compact">';
        html += '<div class="npch-id">';
        var pName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
        html += '<span class="noscroll-player-name"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(pName) + '</span>' + pTeeBadge + pHcpBadge;
        var mkPid = p.markedBy;
        var mkP = (mkPid && r.players && r.players[mkPid]) ? r.players[mkPid] : null;
        if (mkP && !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(mkPid, mkP.name))) {
            var mkName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(mkP, mkPid) : playerDisplayName(mkP, mkPid);
            if (mkName && mkName !== '—') {
                html += '<span class="npch-marker"><i class="fas fa-pen-nib"></i> ' + t('card_marker_lbl') + ': ' + escapeHtml(mkName) + '</span>';
            }
        }
        html += '</div>';
        if (curHole) {
            html += '<button type="button" class="sc-to-cur-btn" onclick="event.stopPropagation();scrollToPlayerCurrentHole(\'' + pid + '\')"><i class="fas fa-location-crosshairs"></i> ' + t('to_current_hole') + ' · #' + curHole + '</button>';
        }
        html += '</div>';
    } else {
        html += '<div class="noscroll-player-block" onclick="openPlayerProfileModal(\'' + pid + '\',\'' + (r.roundId || '') + '\')" style="cursor:pointer;">';
        html += '<div class="noscroll-player-hdr">';
        html += '<div>';
        html += '<span class="noscroll-player-name"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(playerDisplayName(p, pid)) + pTeeBadge + pHcpBadge + '</span>';
        html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">📍 ' + thruText + ' · Gross: ' + (stats.gross || 0) + '</div>';
        if (curHole) {
            html += '<button type="button" class="sc-to-cur-btn" onclick="event.stopPropagation();scrollToPlayerCurrentHole(\'' + pid + '\')"><i class="fas fa-location-crosshairs"></i> ' + t('to_current_hole') + ' · #' + curHole + '</button>';
        }
        html += '</div>';
        html += '<div class="' + scoreClass(stats.toPar) + '" style="font-size:22px;font-weight:800;">' + fmtScore(stats.toPar) + '</div>';
        html += '</div>';
    }

    html += '<div class="sc-tabs-wrap" data-view="all">';
    html += '<div class="noscroll-grid">';
    order.forEach(function(i) {
        var s = parseInt(sc[i]) || 0;
        var par = holePar(i);
        var cls = holeResClass(s, par) + ' ' + holeNineClass(i);
        if (getHoleVerifyState(p, i) === 'mismatch') cls += ' cell-mismatch';
        var isCur = (curHole !== null && i === curHole);
        if (isCur) cls += ' sc-cur-tile';
        var stbl = s > 0 ? stablefordField(s, i, fieldHcp) : null;
        var stblTitle = currentLang === 'en'
            ? (stbl !== null ? stbl + ' Stableford ' + (stbl === 1 ? 'point' : 'points') : 'No Stableford points yet')
            : (stbl !== null ? 'Очки Stableford: ' + stbl : 'Очков Stableford пока нет');
        if (isCur) {
            stblTitle = (currentLang === 'en' ? 'Current hole. ' : 'Текущая лунка. ') + stblTitle;
        }

        var mkLineHtml = '';
        if (opts.showMarker) {
            var mk = getPlayerMarkerScoreForHole(p, i);
            if (mk.score >= 1) {
                var mkMm = (s >= 1 && s !== mk.score) ? ' mk-mismatch' : '';
                mkLineHtml = '<div class="noscroll-marker' + mkMm + '">' + t('marker_score_short') + ' ' + mk.score + '</div>';
            }
        }
        html += '<div class="noscroll-tile ' + cls + '" title="' + stblTitle + '" data-sc-player="' + pid + '" data-sc-hole="' + i + '"' + (isCur ? ' data-sc-current="1"' : '') + '>';
        html += '<div class="noscroll-hole"><span>#' + i + '</span>' + hcpStrokesMarksHTML(fieldHcp, i) + '</div>';
        html += '<div class="noscroll-score">' + (s > 0 ? s : '—') + '</div>';
        html += mkLineHtml;
        html += '<div class="noscroll-tile-bot"><span class="noscroll-idx">idx ' + holeHcp(i) + '</span><span class="noscroll-stbl">' + (stbl !== null ? stbl + ' pt' : '—') + '</span></div>';
        html += '</div>';
    });
    html += '</div>';

    html += buildToParRowHTML(order, sc, 0, 'noscroll-grid').html;
    html += '</div>';

    var totG = 0, parTotal = 0;
    order.forEach(function(i) { var s = parseInt(sc[i]) || 0; if (s > 0) totG += s; parTotal += holePar(i); });
    if (!compact) {
        html += '<div class="noscroll-totals">';
        html += '<span>' + (currentLang === 'en' ? 'Holes' : 'Лунки') + ': <b>' + stats.holesPlayed + '/' + holeCount + '</b></span>';
        html += '<span>' + t('par') + ': <b>' + parTotal + '</b></span>';
        html += '<span>' + t('total') + ': <b>' + (totG > 0 ? totG : '—') + '</b></span>';
        html += '</div>';
    }

    html += '</div></div>';
    return html;
}

// ВАРИАНТ 1: СВОДНАЯ МАТРИЦА ФЛАЙТА
function renderGroupMatrixHTML(r, playerEntries, order, opts) {
    var holeCount = order.length;
    var html = '<div class="group-matrix-card">';

    // 1. Шапка со всеми игроками группы в один ряд
    html += '<div class="group-matrix-players">';
    playerEntries.forEach(function(pe, pIdx) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
        var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);
        var pTee = (p && p.tee) || r.tee || 'wh';
        var pTeeBadge = '<span class="tee-pill tee-' + pTee + '" style="font-size:9.5px;padding:1px 6px;">' + t('tee_' + pTee) + '</span>';
        var pHcpBadge = '<span class="hcp-chip ' + fieldHcpBandClass(fieldHcp) + '" style="font-size:9.5px;padding:1px 6px;">' + t('field_hcp_short') + ' ' + fmtFieldHcp(fieldHcp) + '</span>';
        var pName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
        var thruTxt = stats.holesPlayed >= holeCount ? t('finished_f') : (stats.currentHole ? t('hole') + ' №' + stats.currentHole : '—');

        html += '<div class="gm-player-chip">';
        html += '<div class="gm-p-top"><strong class="gm-p-name"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(pName) + '</strong>' + pTeeBadge + pHcpBadge + '</div>';
        html += '<div class="gm-p-stats">';
        html += '<span>📍 ' + thruTxt + '</span>';
        html += '<span>Gross: <b>' + (stats.gross || 0) + '</b></span>';
        html += '<span class="' + scoreClass(stats.toPar) + '" style="font-weight:800;">' + fmtScore(stats.toPar) + '</span>';
        html += '<span style="color:#2ecc71;font-weight:700;">' + stats.stablefordField + ' pt</span>';
        html += '</div></div>';
    });
    html += '</div>';

    // 2. Сводная матрица по лункам
    html += '<div class="gm-grid-wrap"><div class="noscroll-grid gm-noscroll-grid">';
    order.forEach(function(i) {
        var par = holePar(i);
        var idx = holeHcp(i);
        var isCurHoleAny = false;
        var tilesForHole = '';

        playerEntries.forEach(function(pe, pIdx) {
            var pid = pe[0], p = pe[1];
            var sc = p.scores || {};
            var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
            var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);
            var s = parseInt(sc[i]) || 0;
            var isCur = (stats.currentHole === i && stats.holesPlayed < holeCount);
            if (isCur) isCurHoleAny = true;

            var cls = (s > 0 ? holeResClass(s, par) : 'r-empty') + (isCur ? ' sc-cur-tile' : '');
            if (getHoleVerifyState(p, i) === 'mismatch') cls += ' cell-mismatch';
            var stbl = s > 0 ? stablefordField(s, i, fieldHcp) : null;
            var pInitial = (p.name || '').trim().split(/\s+/)[0] || ('P' + (pIdx + 1));

            // Слой маркера (только страница ввода результатов): под счётом
            // игрока — счёт, который ввёл его маркер. При расхождении —
            // красная обводка ячейки.
            var mkRowHtml = '';
            var mkCellCls = '';
            if (opts.showMarker) {
                var mk = getPlayerMarkerScoreForHole(p, i);
                if (mk.score >= 1) {
                    var mkMm = (s >= 1 && s !== mk.score);
                    if (mkMm) mkCellCls = ' gm-mismatch';
                    mkRowHtml = '<div class="gm-tile-marker' + (mkMm ? ' mk-mismatch' : '') + '">' +
                        '<span class="gm-tile-mname">' + t('marker_score_short') + '</span>' +
                        '<span class="gm-tile-mscore">' + mk.score + '</span>' +
                        '</div>';
                }
            }

            tilesForHole += '<div class="gm-tile-cell' + mkCellCls + '" title="' + escapeHtml(p.name || '') + ' · #' + i + ': ' + (s > 0 ? s : '—') + '">' +
                '<div class="gm-tile-row ' + cls + '">' +
                '<span class="gm-tile-pname">' + escapeHtml(pInitial.substring(0, 5)) + '</span>' +
                '<span class="gm-tile-score">' + (s > 0 ? s : '—') + '</span>' +
                '<span class="gm-tile-stbl">' + (stbl !== null ? stbl + 'p' : '·') + '</span>' +
                '</div>' + mkRowHtml +
                '</div>';
        });

        html += '<div class="gm-hole-col' + (isCurHoleAny ? ' gm-cur-col' : '') + '">' +
            '<div class="gm-hole-hdr"><span>#' + i + '</span><small>P' + par + ' · i' + idx + '</small></div>' +
            '<div class="gm-hole-scores">' + tilesForHole + '</div>' +
            '</div>';
    });
    html += '</div></div>';

    // 3. Итоги флайта
    html += '<div class="gm-totals-row">';
    html += '<div class="gm-tot-title"><i class="fas fa-calculator"></i> ' + t('total') + ':</div>';
    html += '<div class="gm-tot-items">';
    playerEntries.forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
        var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);
        var pName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
        var pInitial = pName.split(/\s+/)[0] || pName;

        html += '<div class="gm-tot-item">' +
            '<span class="gm-tot-name">' + escapeHtml(pInitial) + ':</span>' +
            '<b class="gm-tot-val">' + (stats.gross || 0) + '</b>' +
            '<span class="gm-tot-topar ' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</span>' +
            '<span class="gm-tot-stbl">' + stats.stablefordField + ' pt</span>' +
            '</div>';
    });
    html += '</div></div>';

    html += '</div>';
    return html;
}

// ВАРИАНТ 2: СРАВНИТЕЛЬНАЯ ТАБЛИЦА ФЛАЙТА
// Строка счёта маркера под счётом игрока (только страница ввода результатов).
function buildFlightTableMarkerCellHTML(p, h, ownScore) {
    var mk = getPlayerMarkerScoreForHole(p, h);
    if (mk.score < 1) return '';
    var mm = (ownScore >= 1 && ownScore !== mk.score) ? ' mk-mismatch' : '';
    return '<div class="ft-marker' + mm + '">' + t('marker_score_short') + ': ' + mk.score + '</div>';
}

function renderGroupTableHTML(r, playerEntries, order, opts) {
    var html = '<div class="group-flight-table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;margin-bottom:10px;">';
    html += '<table class="group-flight-table" style="width:100%;min-width:320px;border-collapse:collapse;font-size:12px;text-align:center;">';

    // thead: Player headers
    html += '<thead><tr style="background:rgba(201,168,76,0.14);border-bottom:1px solid var(--border);">';
    html += '<th style="padding:8px 6px;text-align:left;white-space:nowrap;min-width:85px;color:var(--gold);">' + (currentLang === 'en' ? 'Hole · Par' : 'Лунка · Пар') + '</th>';
    playerEntries.forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var pTee = (p && p.tee) || r.tee || 'wh';
        var pTeeBadge = '<span class="tee-pill tee-' + pTee + '" style="font-size:9px;padding:0 5px;">' + t('tee_' + pTee) + '</span>';
        var pName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
        var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);

        html += '<th style="padding:8px 6px;min-width:95px;border-left:1px solid rgba(255,255,255,0.06);">';
        html += '<div style="font-weight:700;color:var(--white);">' + escapeHtml(pName) + '</div>';
        html += '<div style="margin-top:2px;">' + pTeeBadge + ' <span class="hcp-chip" style="font-size:9.5px;padding:0 5px;">' + fmtFieldHcp(fieldHcp) + '</span></div>';
        html += '<div style="font-size:11px;margin-top:2px;color:var(--gold);">Gross: <b>' + (stats.gross || 0) + '</b> <span class="' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</span></div>';
        html += '</th>';
    });
    html += '</tr></thead>';

    // tbody
    html += '<tbody>';
    var frontHoles = order.filter(function(h) { return h <= 9; });
    var backHoles = order.filter(function(h) { return h > 9; });

    // Front 9
    frontHoles.forEach(function(h) {
        var par = holePar(h);
        var idx = holeHcp(h);
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">';
        html += '<td style="padding:6px 6px;text-align:left;font-weight:600;color:var(--gold);">#' + h + ' <span style="color:var(--muted);font-weight:400;font-size:11px;">(P' + par + ' · i' + idx + ')</span></td>';
        playerEntries.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var s = parseInt(p.scores && p.scores[h]) || 0;
            var cls = s > 0 ? holeResClass(s, par) : 'r-empty';
            var stbl = s > 0 ? stablefordField(s, h, p.fieldHcp || 0) : null;
            html += '<td style="padding:4px 6px;border-left:1px solid rgba(255,255,255,0.04);">';
            html += '<span class="ft-score-cell ' + cls + '" style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;min-width:24px;">' + (s > 0 ? s : '—') + '</span>';
            if (stbl !== null) html += ' <small style="color:#2ecc71;font-size:10px;font-weight:600;">' + stbl + 'p</small>';
            if (opts.showMarker) html += buildFlightTableMarkerCellHTML(p, h, s);
            html += '</td>';
        });
        html += '</tr>';
    });

    // OUT Subtotal
    if (frontHoles.length > 0) {
        var outPar = frontHoles.reduce(function(acc, h) { return acc + holePar(h); }, 0);
        html += '<tr style="background:rgba(255,255,255,0.06);font-weight:700;border-bottom:1px solid var(--border);">';
        html += '<td style="padding:6px 6px;text-align:left;color:var(--white);">OUT (1-9) <small style="color:var(--muted);">(' + outPar + ')</small></td>';
        playerEntries.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var outGross = frontHoles.reduce(function(acc, h) { return acc + (parseInt(p.scores && p.scores[h]) || 0); }, 0);
            var outStbl = frontHoles.reduce(function(acc, h) {
                var s = parseInt(p.scores && p.scores[h]) || 0;
                return acc + (s > 0 ? stablefordField(s, h, p.fieldHcp || 0) : 0);
            }, 0);
            html += '<td style="padding:6px 6px;color:var(--gold);border-left:1px solid rgba(255,255,255,0.06);">' + (outGross > 0 ? outGross : '—') + ' <small style="color:#2ecc71;">(' + outStbl + ' pt)</small></td>';
        });
        html += '</tr>';
    }

    // Back 9
    backHoles.forEach(function(h) {
        var par = holePar(h);
        var idx = holeHcp(h);
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">';
        html += '<td style="padding:6px 6px;text-align:left;font-weight:600;color:var(--gold);">#' + h + ' <span style="color:var(--muted);font-weight:400;font-size:11px;">(P' + par + ' · i' + idx + ')</span></td>';
        playerEntries.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var s = parseInt(p.scores && p.scores[h]) || 0;
            var cls = s > 0 ? holeResClass(s, par) : 'r-empty';
            var stbl = s > 0 ? stablefordField(s, h, p.fieldHcp || 0) : null;
            html += '<td style="padding:4px 6px;border-left:1px solid rgba(255,255,255,0.04);">';
            html += '<span class="ft-score-cell ' + cls + '" style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;min-width:24px;">' + (s > 0 ? s : '—') + '</span>';
            if (stbl !== null) html += ' <small style="color:#2ecc71;font-size:10px;font-weight:600;">' + stbl + 'p</small>';
            if (opts.showMarker) html += buildFlightTableMarkerCellHTML(p, h, s);
            html += '</td>';
        });
        html += '</tr>';
    });

    // IN Subtotal
    if (backHoles.length > 0) {
        var inPar = backHoles.reduce(function(acc, h) { return acc + holePar(h); }, 0);
        html += '<tr style="background:rgba(255,255,255,0.06);font-weight:700;border-bottom:1px solid var(--border);">';
        html += '<td style="padding:6px 6px;text-align:left;color:var(--white);">IN (10-18) <small style="color:var(--muted);">(' + inPar + ')</small></td>';
        playerEntries.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var inGross = backHoles.reduce(function(acc, h) { return acc + (parseInt(p.scores && p.scores[h]) || 0); }, 0);
            var inStbl = backHoles.reduce(function(acc, h) {
                var s = parseInt(p.scores && p.scores[h]) || 0;
                return acc + (s > 0 ? stablefordField(s, h, p.fieldHcp || 0) : 0);
            }, 0);
            html += '<td style="padding:6px 6px;color:var(--gold);border-left:1px solid rgba(255,255,255,0.06);">' + (inGross > 0 ? inGross : '—') + ' <small style="color:#2ecc71;">(' + inStbl + ' pt)</small></td>';
        });
        html += '</tr>';
    }

    // TOTAL Row
    var totPar = order.reduce(function(acc, h) { return acc + holePar(h); }, 0);
    html += '<tr style="background:rgba(201,168,76,0.18);font-weight:800;border-top:2px solid var(--gold);">';
    html += '<td style="padding:8px 6px;text-align:left;color:var(--gold);font-size:13px;">' + t('total') + ' <small style="color:var(--white);">(' + totPar + ')</small></td>';
    playerEntries.forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
        var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);
        html += '<td style="padding:8px 6px;border-left:1px solid rgba(255,255,255,0.08);">';
        html += '<div style="font-size:15px;color:var(--white);">' + (stats.gross || 0) + ' <span class="' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</span></div>';
        html += '<div style="color:#2ecc71;font-size:11px;font-weight:700;">' + stats.stablefordField + ' pt Stbl</div>';
        html += '</td>';
    });
    html += '</tr>';

    html += '</tbody></table></div>';
    return html;
}

// ВАРИАНТ 3: ЛИДЕРБОРД ФЛАЙТА И ВИЗУАЛЬНЫЙ ТРЕК
function renderGroupLeaderboardHTML(r, playerEntries, order, opts) {
    var holeCount = order.length;
    var html = '<div class="flight-leaderboard-card">';

    // Сортировка участников флайта по результату toPar, затем по gross
    var ranked = playerEntries.slice().sort(function(a, b) {
        var statsA = calcRoundStats(a[1].scores || {}, a[1].fieldHcp || 0, a[1].exactHcp || 0, order);
        var statsB = calcRoundStats(b[1].scores || {}, b[1].fieldHcp || 0, b[1].exactHcp || 0, order);
        if (statsA.toPar === null && statsB.toPar === null) return 0;
        if (statsA.toPar === null) return 1;
        if (statsB.toPar === null) return -1;
        if (statsA.toPar !== statsB.toPar) return statsA.toPar - statsB.toPar;
        return (statsA.gross || 0) - (statsB.gross || 0);
    });

    var rankMedals = ['🥇', '🥈', '🥉'];

    ranked.forEach(function(pe, rankIdx) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
        var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);
        var pTee = (p && p.tee) || r.tee || 'wh';
        var pTeeBadge = '<span class="tee-pill tee-' + pTee + '" style="font-size:9.5px;padding:1px 6px;">' + t('tee_' + pTee) + '</span>';
        var pHcpBadge = '<span class="hcp-chip ' + fieldHcpBandClass(fieldHcp) + '" style="font-size:9.5px;padding:1px 6px;">' + t('field_hcp_short') + ' ' + fmtFieldHcp(fieldHcp) + '</span>';
        var pName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
        var rankLabel = rankIdx < 3 ? rankMedals[rankIdx] : ('#' + (rankIdx + 1));
        var thruTxt = stats.holesPlayed >= holeCount ? t('finished_f') : (stats.currentHole ? (t('hole') + ' №' + stats.currentHole + ' · ' + stats.holesPlayed + '/' + holeCount) : '—');

        html += '<div class="flb-player-card" style="background:rgba(19,34,24,0.85);border:1px solid var(--border);border-radius:var(--rs);padding:12px;margin-bottom:8px;">';

        // Top Row: Rank, Player Name, Badges, To Par, Gross, Stbl
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">';
        html += '<div style="display:flex;align-items:center;gap:8px;min-width:0;">';
        html += '<span class="flb-rank" style="font-size:16px;font-weight:800;color:var(--gold);min-width:26px;text-align:center;">' + rankLabel + '</span>';
        html += '<div><span style="font-weight:700;color:var(--white);font-size:14px;">' + escapeHtml(pName) + '</span> ' + pTeeBadge + pHcpBadge;
        html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">📍 ' + thruTxt + '</div></div>';
        html += '</div>';

        html += '<div style="text-align:right;">';
        html += '<div style="font-size:18px;font-weight:800;" class="' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</div>';
        html += '<div style="font-size:11px;color:var(--muted);">Gross: <b>' + (stats.gross || 0) + '</b> · <span style="color:#2ecc71;font-weight:700;">' + stats.stablefordField + ' pt</span></div>';
        html += '</div>';
        html += '</div>';

        // Bottom Row: Hole-by-Hole Mini Visual Strip
        html += '<div class="flb-hole-strip" style="display:flex;gap:3px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 0;">';
        order.forEach(function(h) {
            var s = parseInt(sc[h]) || 0;
            var par = holePar(h);
            var cls = s > 0 ? holeResClass(s, par) : 'r-empty';
            var isCur = (stats.currentHole === h && stats.holesPlayed < holeCount);
            var stbl = s > 0 ? stablefordField(s, h, fieldHcp) : null;
            var tip = '#' + h + ' (P' + par + '): ' + (s > 0 ? (s + (stbl !== null ? ' · ' + stbl + 'p' : '')) : '—');
            var mmCls = '';
            if (opts.showMarker) {
                var mkOwn = getPlayerMarkerScoreForHole(p, h);
                if (mkOwn.score >= 1) {
                    tip += ' · ' + t('marker_score_short') + ': ' + mkOwn.score;
                    if (s >= 1 && s !== mkOwn.score) mmCls = ' flb-mm';
                }
            }

            html += '<div class="flb-mini-tile ' + cls + (isCur ? ' flb-cur' : '') + mmCls + '" title="' + tip + '" style="flex:1;min-width:18px;height:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:3px;font-size:9.5px;font-weight:700;">' +
                '<span style="font-size:7.5px;opacity:0.75;line-height:1;">' + h + '</span>' +
                '<span style="font-size:10px;line-height:1;font-weight:800;">' + (s > 0 ? s : '·') + '</span>' +
                '</div>';
        });
        html += '</div>';

        // Вторая полоса — счёта маркера этого игрока (только страница ввода).
        if (opts.showMarker && playerHasAnyMarkerScore(p, order)) {
            html += '<div class="flb-marker-cap"><i class="fas fa-pen-nib"></i> ' + t('marker_score_short') + ' — ' + t('legend_marker_score') + '</div>';
            html += '<div class="flb-hole-strip flb-marker-strip" style="display:flex;gap:3px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:2px 0 4px;">';
            order.forEach(function(h) {
                var mk = getPlayerMarkerScoreForHole(p, h);
                var ownS = parseInt(sc[h]) || 0;
                var mm = (mk.score >= 1 && ownS >= 1 && ownS !== mk.score) ? ' flb-mm' : '';
                var tipM = '#' + h + ': ' + t('marker_score_short') + ' ' + (mk.score >= 1 ? mk.score : '—');
                html += '<div class="flb-mini-tile flb-marker-tile' + mm + '" title="' + tipM + '" style="flex:1;min-width:18px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:10px;font-weight:800;">' +
                    (mk.score >= 1 ? mk.score : '·') +
                    '</div>';
            });
            html += '</div>';
        }

        html += '</div>';
    });

    html += '</div>';
    return html;
}

// ==========================================
// ГАНДИКАП: ЗЕЛЁНАЯ ГАЛОЧКА СИНХРОНИЗАЦИИ + ДАТА ОБНОВЛЕНИЯ
// Гандикап считается «синхронизированным», если он установлен и у записи
// есть hcpUpdatedAt — он проставляется при синхронизации с базой АГР
// (RUSGOLF), импорте Excel и ручном изменении в админ-панели.
// ==========================================
function getHcpSyncInfo(u) {
    u = u || {};
    if (u.handicap === null || u.handicap === undefined || !u.hcpUpdatedAt) {
        return { ok: false };
    }
    return {
        ok: true,
        ts: Number(u.hcpUpdatedAt),
        dateStr: fmtDate(u.hcpUpdatedAt),
        source: u.hcpSource || '',
        sourceLabel: hcpSourceLabel(u.hcpSource)
    };
}

function hcpSourceLabel(src) {
    var isEn = currentLang === 'en';
    if (src === 'rusgolf') return isEn ? 'RUSGOLF (AGR database)' : 'База АГР России (RUSGOLF)';
    if (src === 'excel') return isEn ? 'Excel import' : 'Импорт Excel';
    if (src === 'manual') return isEn ? 'Manual update' : 'Ручное обновление';
    return isEn ? 'Handicap sync' : 'Синхронизация гандикапа';
}

function hcpSyncTooltip(info) {
    var isEn = currentLang === 'en';
    return (isEn ? 'Handicap updated: ' : 'Гандикап обновлён: ') + info.dateStr +
        ' · ' + (isEn ? 'Source: ' : 'Источник: ') + info.sourceLabel;
}

// Короткая дата «09.09.26» для компактных бейджей.
function fmtHcpShortDate(ts) {
    var d = new Date(Number(ts));
    if (!d.getTime()) return '';
    var mo = d.getMonth() + 1, da = d.getDate();
    return (da < 10 ? '0' : '') + da + '.' + (mo < 10 ? '0' : '') + mo + '.' + String(d.getFullYear()).slice(2);
}

// Выбранный вариант оформления бейджа: 1/2/3.
// ГЛОБАЛЬНЫЙ выбор делается в админ-панели (вкладка «Данные» → «Стиль
// галочки гандикапа») и хранится в Firebase settings/hcp_badge_variant —
// он применяется на всех устройствах игроков. Кэшируем в localStorage
// для офлайн-режима; hcp-badge-preview.html использует тот же ключ
// для локального предпросмотра.
var pestovoHcpBadgeVariant = (function() {
    try {
        var v = localStorage.getItem('pestovo_hcp_badge_variant');
        if (v === '1' || v === '2' || v === '3') return v;
    } catch (e) {}
    return '1';
})();

function getHcpBadgeVariant() {
    return pestovoHcpBadgeVariant;
}

// Локальный выбор (страница предпросмотра) — обновляет только состояние
// этого браузера, не трогая глобальную настройку в Firebase.
function setHcpBadgeVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    pestovoHcpBadgeVariant = v;
    try { localStorage.setItem('pestovo_hcp_badge_variant', v); } catch (e) {}
}

// Применяет глобальный вариант (из админ-панели или Firebase) и
// перерисовывает открытые списки/элементы.
function applyHcpBadgeVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    pestovoHcpBadgeVariant = v;
    try { localStorage.setItem('pestovo_hcp_badge_variant', v); } catch (e) {}
    refreshHcpBadgeVariantUI();
}

function refreshHcpBadgeVariantUI() {
    // Вкладка «Игроки» (players.html)
    try {
        if (typeof loadPlayers === 'function' && document.getElementById('players-grid')) loadPlayers();
    } catch (e) {}
    // Админ-панель: список «Игроки и роли» (только при открытой панели)
    try {
        if (typeof hasAdminPanelAccess === 'function' && hasAdminPanelAccess() &&
            typeof loadAdmPlayers === 'function' &&
            document.getElementById('admin-content') &&
            !document.getElementById('admin-content').classList.contains('hidden')) {
            loadAdmPlayers();
        }
    } catch (e) {}
    // Подсветка выбранного варианта в админ-панели
    try {
        if (typeof markAdmHcpVariantButtons === 'function') markAdmHcpVariantButtons();
    } catch (e) {}
    // Страница предпросмотра вариантов (если открыта)
    try {
        if (typeof window !== 'undefined' && typeof window.hcpBadgePreviewRerender === 'function') window.hcpBadgePreviewRerender();
    } catch (e) {}
}

// Зелёная галочка на углу аватара (вариант 3): оборачивает разметку аватара.
function hcpAvatarWrapHtml(avatarHtml, info) {
    if (!info || !info.ok) return avatarHtml;
    return '<span class="hcp-avatar-wrap">' + avatarHtml +
        '<span class="hcp-avatar-badge" title="' + escapeHtml(hcpSyncTooltip(info)) + '"><i class="fas fa-check"></i></span></span>';
}

// Фрагмент для карточки игрока (вкладка «Игроки» и админка): вставляется
// сразу после значения HCP. Возвращает '' у игроков без синхронизации.
function hcpSyncBadgeHtml(u) {
    var info = getHcpSyncInfo(u);
    if (!info.ok) return '';
    var v = getHcpBadgeVariant();
    var isEn = currentLang === 'en';
    var short = fmtHcpShortDate(info.ts);
    var tip = escapeHtml(hcpSyncTooltip(info));
    if (v === '2') {
        // Вариант 2: светящийся зелёный «пилюля»-бейдж
        return '<span class="hcp-sync-pill" title="' + tip + '"><i class="fas fa-circle-check"></i> ' +
            (isEn ? 'updated ' : 'обновлён ') + short + '</span>';
    }
    if (v === '3') {
        // Вариант 3: текст даты (галочка уже на аватаре)
        return ' <span class="hcp-date" title="' + tip + '">' + (isEn ? 'updated ' : 'обновлён ') + short + '</span>';
    }
    // Вариант 1: компактная галочка + дата рядом с HCP
    return ' <i class="fas fa-circle-check hcp-check" title="' + tip + '"></i> <span class="hcp-date" title="' + tip + '">' + short + '</span>';
}

// Разметка статуса гандикапа для личного профиля игрока.
// Возвращает { meta: ..., banner: ... }:
//   meta — замена строки «HCP: …» в шапке профиля (null = обычный вид)
//   banner — отдельный зелёный баннер (используется только вариантом 2)
function buildHcpProfileSyncHtml(u) {
    var info = getHcpSyncInfo(u);
    if (!info.ok) return { meta: null, banner: '' };
    var v = getHcpBadgeVariant();
    var isEn = currentLang === 'en';
    var hcpVal = fmtExactHcp(u.handicap);
    var tip = escapeHtml(hcpSyncTooltip(info));

    if (v === '2') {
        return {
            meta: null,
            banner: '<div class="hcp-sync-banner">' +
                '<span class="hsb-icon"><i class="fas fa-circle-check"></i></span>' +
                '<span style="flex:1;min-width:180px;">' +
                '<span style="display:block;font-size:14px;font-weight:800;color:#2ecc71;">' +
                (isEn ? 'Handicap synced & up to date' : 'Гандикап синхронизирован') + '</span>' +
                '<span style="display:block;font-size:12px;color:var(--muted);margin-top:3px;line-height:1.5;">' +
                '<i class="fas fa-golf-ball"></i> HCP: ' + hcpVal + ' · ' +
                '<i class="fas fa-calendar-check"></i> ' + (isEn ? 'Updated ' : 'Обновлено ') + info.dateStr +
                ' · ' + (isEn ? 'Source: ' : 'Источник: ') + info.sourceLabel + '</span></span>' +
                '</div>'
        };
    }

    // Варианты 1 и 3 — зелёная строка HCP с галочкой, датой и источником
    return {
        meta: '<span class="hcp-profile-sync" title="' + tip + '">' +
            '<i class="fas fa-circle-check"></i> <i class="fas fa-golf-ball"></i> HCP: ' + hcpVal +
            ' · ' + (isEn ? 'updated ' : 'обновлён ') + info.dateStr +
            ' <span class="hcp-source">(' + info.sourceLabel + ')</span></span>',
        banner: ''
    };
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
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closePModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closePModal()">&times;</button>' +
            '</div>' +
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
            var displayName = playerDisplayName(p, playerId);
            u = {
                name: displayName !== '—' ? displayName : t('guest'),
                // Для турнира в раунде может стоять обрезанный HCP — в карточке
                // профиля показываем настоящий (exactHcpRaw), если он записан.
                handicap: (p.exactHcpRaw != null && p.exactHcpRaw !== '') ? p.exactHcpRaw : (p.exactHcp || null),
                gender: p.gender || 'men',
                isGuest: true,
                roundsPlayed: 1
            };
        }

        if (!u) {
            if (bodyEl) bodyEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:30px;">' + (currentLang === 'en' ? 'Player profile not found' : 'Профиль игрока не найден') + '</p>';
            return;
        }

        var isMe = (currentUser && currentUser.uid === playerId);
        var gIcon = u.gender === 'women' ? '👩' : '👨';
        // Бейдж «Гость» убран везде по требованию клуба — гости никак не помечаются.
        var guestBadge = '';

        var roundsWord = currentLang === 'en' ? 'rounds' : 'раундов';
        var teePillMarkup = u.defaultTee ? fmtTeePill(u.defaultTee) : '';

        // Статус синхронизации гандикапа: зелёная галочка + дата обновления
        var hcpSync = (typeof buildHcpProfileSyncHtml === 'function') ? buildHcpProfileSyncHtml(u) : { meta: null, banner: '' };
        var plainHcpSpan = '<span><i class="fas fa-golf-ball"></i> HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') + '</span>';

        var html = '<div class="profile-head" style="margin-bottom:16px;">';
        var profileAvatarHtml = fmtUserAvatar(u, 80);
        if (hcpSync.meta !== null && getHcpBadgeVariant() === '3') {
            // Вариант 3: зелёная галочка-«верификация» на углу аватара
            var hcpInfo3 = getHcpSyncInfo(u);
            profileAvatarHtml = hcpAvatarWrapHtml(profileAvatarHtml, hcpInfo3);
        }
        html += profileAvatarHtml;
        html += '<div style="flex:1;"><div class="profile-name">' + gIcon + ' ' + escapeHtml(privacyDisplayName(u, playerId)) + guestBadge + '</div>';
        html += '<div class="profile-meta">';
        html += hcpSync.meta !== null ? hcpSync.meta : plainHcpSpan;
        if (teePillMarkup) html += '<span><i class="fas fa-golf-ball-tee"></i> Tee: ' + teePillMarkup + '</span>';
        html += '<span><i class="fas fa-flag"></i> ' + (u.roundsPlayed || 0) + ' ' + roundsWord + '</span>';
        var hTag = currentLang === 'en' ? 'h' : 'л';
        if (u.bestGross) html += '<span><i class="fas fa-trophy"></i> Gross (18' + hTag + '): ' + u.bestGross + '</span>';
        html += '</div>';
        if (hcpSync.banner) html += hcpSync.banner;

        if (isMe) {
            html += '<button class="btn btn-og btn-sm" style="margin-top:10px;" onclick="renderProfileEditForm(\'' + playerId + '\')"><i class="fas fa-user-pen"></i> ' + t('edit_profile') + '</button>';
        }

        html += '</div></div>';

        if (rd && rd.players && rd.players[playerId]) {
            var roundPlayer = rd.players[playerId];
            var roundPlayerTee = (roundPlayer && roundPlayer.tee) || (rd && rd.tee) || 'wh';
            html += '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);">';
            html += '<h3 style="color:var(--gold);margin-bottom:14px;font-family:var(--ff);font-size:18px;">' +
                    '<i class="fas fa-table"></i> ' + (currentLang === 'en' ? 'Round Scorecard' : 'Счётная карточка раунда') + ' (' + pestovoRoundFormatBadge(rd, 'Stroke') + ' · ' + t('tee_select') + ': ' + fmtTeePill(roundPlayerTee) + ')' +
                    '</h3>';
            
            if (typeof generatePestovoScorecardHTML === 'function') {
                html += generatePestovoScorecardHTML(roundPlayer, rd, { compact: true });
            }
            html += '</div>';
        }

        db.ref('users/' + playerId + '/history').once('value').then(function(hSn) {
            var history = hSn.val() || {};
            var entries = Object.entries(history);
            entries.sort(function(a, b) { return (b[1].date || 0) - (a[1].date || 0); });

            if (entries.length > 0) {
                var roundsList = entries.map(function(e) { return Object.assign({}, e[1], { _key: e[0] }); });
                html += renderTrophyCabinet(u, roundsList);
                html += renderScoringDistributionBar(roundsList);

                html += '<h3 style="color:var(--gold);margin:24px 0 12px;font-family:var(--ff);font-size:18px;"><i class="fas fa-history"></i> ' + t('round_history') + ' (' + entries.length + ')</h3>';

                entries.forEach(function(entry, idx) {
                    var hKey = entry[0];
                    var r = entry[1];
                    var cardId = 'pr-card-' + idx;
                    var btnTxtId = 'pr-btn-txt-' + idx;
                    var btnIconId = 'pr-btn-icon-' + idx;

                    var isFull = r.holes === 18;
                    var fullTag = isFull ? ' <span style="color:#2ecc71;font-size:10px;font-weight:700;">(18' + hTag + ')</span>' : ' <span style="color:var(--muted);font-size:10px;">(' + (r.holes || 1) + hTag + ')</span>';

                    html += '<div class="card" style="padding:14px;margin-bottom:12px;border:1px solid var(--border);background:var(--card-bg);">';
                    
                    html += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">';
                    // Турнирный раунд подписываем НАЗВАНИЕМ ТУРНИРА и датой —
                    // без повтора бренда и лишней служебной строки.
                    var isTnRound = !!(r.tournamentId || r.tournamentName);
                    var headTitle = isTnRound
                        ? escapeHtml(r.tournamentName || (currentLang === 'en' ? 'Tournament' : 'Турнир'))
                        : t('brand_name');
                    html += '<div style="flex:1;min-width:180px;">';
                    html += '<strong style="color:var(--white);font-size:15px;"><i class="fas ' + (isTnRound ? 'fa-trophy' : 'fa-golf-ball-tee') + '" style="color:var(--gold);font-size:12px;"></i> ' + headTitle + '</strong>' + fullTag;
                    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' +
                            fmtDate(r.date) + ' · ' + pestovoRoundFormatBadge(r, 'Stroke') + ' · ' + t('tee_select') + ': ' + (r.tee ? fmtTeePill(r.tee) : '—') +
                            (isTnRound ? '' : ' · ' + (r.mode === 'solo' ? '👤 Solo' : '👥 Group')) + '</div>';
                    if (isTnRound && r.roundName) {
                        html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + escapeHtml(r.roundName) + '</div>';
                    }
                    html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' +
                            (r.holeInOne ? '🎯 ' + r.holeInOne + ' · ' : '') +
                            '🦅 ' + (r.eagles || 0) + ' · 🐦 ' + (r.birdies || 0) + ' · Par ' + (r.pars || 0) + '</div></div>';

                    html += '<div style="text-align:right;">';
                    html += '<div style="font-size:22px;font-weight:800;color:var(--white);">' + r.gross + ' <span style="font-size:12px;color:var(--muted);font-weight:600;">Gross</span></div>';
                    html += '<div class="' + scoreClass(r.toPar) + '" style="font-size:14px;font-weight:700;">' + fmtScore(r.toPar) + '</div>';
                    html += '</div></div>';

                    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;gap:8px;">';
                    html += '<button class="btn btn-og btn-sm" onclick="toggleProfileRoundCard(\'' + cardId + '\')"><i class="fas fa-chevron-down" id="' + btnIconId + '"></i> <span id="' + btnTxtId + '">' + (currentLang === 'en' ? 'Expand Scorecard' : 'Развернуть карточку') + '</span></button>';

                    var isAdminOrOwner = (currentUser && (currentUser.uid === playerId || (currentUserData && currentUserData.role === 'admin') || sessionStorage.getItem('pestovo_is_admin') === 'true'));
                    if (isAdminOrOwner) {
                        html += '<button class="btn btn-r btn-sm" onclick="deletePlayerHistoryRecord(\'' + playerId + '\', \'' + hKey + '\')" title="' + (currentLang === 'en' ? 'Delete Round' : 'Удалить из истории') + '"><i class="fas fa-trash"></i></button>';
                    }
                    html += '</div>';

                    html += '<div id="' + cardId + '" class="hidden" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);">';
                    
                    var pObj = {
                        name: u.name || 'Игрок',
                        scores: r.scores || {},
                        fieldHcp: r.fieldHcp || 0,
                        exactHcp: r.exactHcp || 0,
                        tee: r.tee || 'wh'
                    };
                    var rObj = {
                        tee: r.tee || 'wh',
                        format: r.format || 'Stroke Play',
                        formats: r.formats || null,
                        holeRange: r.holeRange || '1-18',
                        startHole: r.startHole || 1,
                        completedAt: r.date
                    };

                    if (typeof generatePestovoScorecardHTML === 'function') {
                        html += generatePestovoScorecardHTML(pObj, rObj, { compact: true });
                    }

                    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">';
                    if (r.roundId) {
                        html += '<button class="btn btn-og btn-sm" onclick="openPrintScorecardModal(\'' + r.roundId + '\')"><i class="fas fa-print"></i> ' + (currentLang === 'en' ? 'Print (A4)' : 'Печать (A4)') + '</button>';
                        if (r.status === 'completed') {
                            html += '<button class="btn btn-g btn-sm" onclick="exportRoundPNG(\'' + r.roundId + '\')"><i class="fas fa-image"></i> PNG</button>';
                        }
                    }
                    html += '</div>';

                    html += '</div></div>';
                });
            }

            if (bodyEl) bodyEl.innerHTML = html;
        }).catch(function() {
            if (bodyEl) bodyEl.innerHTML = html;
        });
    });
}

function toggleProfileRoundCard(cardId) {
    var card = document.getElementById(cardId);
    var btnTxt = document.getElementById(cardId.replace('pr-card-', 'pr-btn-txt-'));
    var icon = document.getElementById(cardId.replace('pr-card-', 'pr-btn-icon-'));
    if (!card) return;

    if (card.style.display === 'none' || card.classList.contains('hidden')) {
        card.style.display = 'block';
        card.classList.remove('hidden');
        if (btnTxt) btnTxt.textContent = currentLang === 'en' ? 'Collapse' : 'Свернуть карточку';
        if (icon) icon.className = 'fas fa-chevron-up';
    } else {
        card.style.display = 'none';
        card.classList.add('hidden');
        if (btnTxt) btnTxt.textContent = currentLang === 'en' ? 'Expand Scorecard' : 'Развернуть карточку';
        if (icon) icon.className = 'fas fa-chevron-down';
    }
}

function deletePlayerHistoryRecord(userId, historyKey) {
    if (!userId || !historyKey) return;
    var confirmMsg = currentLang === 'en' ? 'Delete this round from history?' : 'Удалить этот раунд из истории?';
    if (!confirm(confirmMsg)) return;

    db.ref('users/' + userId + '/history/' + historyKey).remove().then(function() {
        db.ref('users/' + userId + '/history').once('value').then(function(sn) {
            var history = sn.val() || {};
            var rounds = Object.values(history);
            var count = rounds.length;
            var bestG = null;
            var bestS = null;

            rounds.forEach(function(r) {
                if (r.holes === 18 && r.gross) {
                    if (bestG === null || r.gross < bestG) bestG = r.gross;
                }
                if (r.holes === 18 && r.stablefordField) {
                    if (bestS === null || r.stablefordField > bestS) bestS = r.stablefordField;
                }
            });

            db.ref('users/' + userId).update({
                roundsPlayed: count,
                bestGross: bestG,
                bestStableford: bestS
            });

            toast(currentLang === 'en' ? 'Round deleted from history' : 'Раунд удалён из истории', 'info');
            if (typeof vib === 'function') vib(30);
            if (typeof openPlayerProfileModal === 'function') openPlayerProfileModal(userId);
        });
    }).catch(function(err) {
        toast('⚠️ Ошибка: ' + err.message, 'error');
    });
}

function closePModal() {
    var modalEl = document.getElementById('pmodal');
    if (modalEl) modalEl.classList.add('hidden');
}

// ==========================================
// ФОРМА РЕДАКТИРОВАНИЯ И КАСТОМИЗАЦИИ ПРОФИЛЯ
// ==========================================
function renderProfileEditForm(playerId) {
    var bodyEl = document.getElementById('pmodal-body');
    if (!bodyEl || typeof db === 'undefined') return;

    db.ref('users/' + playerId).once('value').then(function(sn) {
        var u = sn.val() || {};

        var firstName = u.firstName || (u.name ? u.name.split(' ')[0] : '');
        var lastName = u.lastName || (u.name ? u.name.split(' ').slice(1).join(' ') : '');
        var middleName = u.middleName || '';
        var phone = u.phone || '';
        var hcp = u.handicap != null ? fmtExactHcp(u.handicap) : '';
        var gender = u.gender || 'men';
        var defaultTee = u.defaultTee || 'wh';
        var currentAvatar = u.avatar || '';

        var html = '<h2 style="color:var(--gold);margin-bottom:16px;"><i class="fas fa-user-gear"></i> ' + t('edit_profile') + '</h2>';

        // Avatar Section
        html += '<div class="form-group"><label><i class="fas fa-image"></i> ' + t('avatar_label') + '</label>';
        html += '<div style="display:flex;align-items:center;gap:16px;margin:10px 0;flex-wrap:wrap;">';
        html += '<div id="edit-avatar-preview">' + fmtUserAvatar(u, 64) + '</div>';
        html += '<input type="file" id="edit-avatar-file" accept="image/*" style="display:none;" onchange="onAvatarFileSelected(this)">';
        html += '<button type="button" class="btn btn-og btn-sm" onclick="document.getElementById(\'edit-avatar-file\').click()"><i class="fas fa-upload"></i> ' + t('upload_photo') + '</button>';
        html += '</div>';

        // Presets
        html += '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">' + t('choose_preset') + ':</div>';
        html += '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">';
        var presets = ['⛳', '🏆', '🦅', '👑', '⭐', '👤'];
        presets.forEach(function(icon) {
            html += '<button type="button" class="preset-avatar-btn" onclick="selectPresetAvatar(\'' + icon + '\')">' + icon + '</button>';
        });
        html += '</div></div>';

        // Form Inputs
        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('first_name') + '</label><input type="text" id="edit-fn" class="form-input" value="' + escapeHtml(firstName) + '"></div>';
        html += '<div class="form-group"><label>' + t('last_name') + '</label><input type="text" id="edit-ln" class="form-input" value="' + escapeHtml(lastName) + '"></div>';
        html += '</div>';
        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('middle_name') + '</label><input type="text" id="edit-mid" class="form-input" value="' + escapeHtml(middleName) + '" placeholder="' + (currentLang === 'en' ? 'Middle name (optional)' : 'Отчество (необязательно)') + '"></div>';
        html += '</div>';

        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('exact_hcp') + '</label><input type="text" id="edit-hcp" class="form-input" value="' + hcp + '" placeholder="+2.4 / 12.4"></div>';
        html += '<div class="form-group"><label>' + t('gender_label') + '</label><select id="edit-gender" class="form-input">' +
                '<option value="men" ' + (gender === 'men' ? 'selected' : '') + '>' + t('men') + '</option>' +
                '<option value="women" ' + (gender === 'women' ? 'selected' : '') + '>' + t('women') + '</option>' +
                '</select></div>';
        html += '</div>';

        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('phone_label') + '</label><input type="text" id="edit-phone" class="form-input" value="' + phone + '" placeholder="+7 (999) 000-00-00"></div>';
        html += '<div class="form-group"><label>' + t('default_tee') + '</label><select id="edit-tee" class="form-input">' +
                '<option value="bk" ' + (defaultTee === 'bk' ? 'selected' : '') + '>⬛ ' + t('tee_bk') + '</option>' +
                '<option value="bl" ' + (defaultTee === 'bl' ? 'selected' : '') + '>🟦 ' + t('tee_bl') + '</option>' +
                '<option value="wh" ' + (defaultTee === 'wh' ? 'selected' : '') + '>⬜ ' + t('tee_wh') + '</option>' +
                '<option value="rd" ' + (defaultTee === 'rd' ? 'selected' : '') + '>🟥 ' + t('tee_rd') + '</option>' +
                '</select></div>';
        html += '</div>';

        html += '<input type="hidden" id="edit-avatar-val" value="' + currentAvatar + '">';

        html += '<div style="display:flex;gap:12px;margin-top:20px;">';
        html += '<button type="button" class="btn btn-og" style="flex:1;" onclick="openPlayerProfileModal(\'' + playerId + '\')">' + t('cancel_btn') + '</button>';
        html += '<button type="button" class="btn btn-g" style="flex:1;" onclick="saveUserProfileData(\'' + playerId + '\')"><i class="fas fa-save"></i> ' + t('save_profile') + '</button>';
        html += '</div>';

        bodyEl.innerHTML = html;
    });
}

function selectPresetAvatar(icon) {
    var valEl = document.getElementById('edit-avatar-val');
    if (valEl) valEl.value = icon;
    var preview = document.getElementById('edit-avatar-preview');
    if (preview) preview.innerHTML = fmtUserAvatar({ avatar: icon, name: 'User' }, 64);
}

function onAvatarFileSelected(inp) {
    handleAvatarFileUpload(inp, function(dataUrl) {
        var valEl = document.getElementById('edit-avatar-val');
        if (valEl) valEl.value = dataUrl;
        var preview = document.getElementById('edit-avatar-preview');
        if (preview) preview.innerHTML = fmtUserAvatar({ avatar: dataUrl, name: 'User' }, 64);
    });
}

function saveUserProfileData(playerId) {
    var fnInp = document.getElementById('edit-fn');
    var lnInp = document.getElementById('edit-ln');
    var midInp = document.getElementById('edit-mid');
    var hcpInp = document.getElementById('edit-hcp');
    var genderInp = document.getElementById('edit-gender');
    var phoneInp = document.getElementById('edit-phone');
    var teeInp = document.getElementById('edit-tee');
    var avatarInp = document.getElementById('edit-avatar-val');

    var firstName = fnInp ? sanitizeNameRaw(fnInp.value) : '';
    var middleName = midInp ? sanitizeNameRaw(midInp.value) : '';
    var lastName = lnInp ? sanitizeNameRaw(lnInp.value) : '';
    // Полное имя: «Имя [Отчество] Фамилия»
    var fullName = ((firstName + ' ' + (middleName ? middleName + ' ' : '')) + lastName).trim() || 'Player';
    var exactHcp = hcpInp ? parseExactHcp(hcpInp.value) : 0;
    var gender = genderInp ? genderInp.value : 'men';
    var phone = phoneInp ? phoneInp.value.trim().replace(/[^\d+\-() ]/g, '').substring(0, 20) : '';
    var defaultTee = teeInp ? teeInp.value : 'wh';
    var avatar = avatarInp ? avatarInp.value : '';

    var updates = {
        name: fullName,
        firstName: firstName,
        middleName: middleName || null,
        lastName: lastName,
        handicap: exactHcp,
        gender: gender,
        phone: phone,
        defaultTee: defaultTee,
        avatar: avatar
    };

    db.ref('users/' + playerId).update(updates).then(function() {
        if (currentUserData) {
            Object.assign(currentUserData, updates);
        }
        toast(t('msg_profile_saved'), 'success');
        openPlayerProfileModal(playerId);
        if (typeof loadPlayers === 'function') loadPlayers();
        if (typeof loadLB === 'function') loadLB();
    });
}

// ==========================================
// МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ ЗАВЕРШЕНИЯ РАУНДА
// ==========================================
function openFinishConfirmModal(roundId, onConfirmCallback, onCloseCallback, opts) {
    if (typeof db === 'undefined' || !roundId) return;
    window._pestovoFinishModalOnClose = (typeof onCloseCallback === 'function') ? onCloseCallback : null;
    // opts: { playerId } — турнирное завершение проверяет ТОЛЬКО игрока и его маркера,
    // а не всю группу. onGoToHole(hole) — переход к проблемной лунке из модалки.
    var scopedPid = null, modalGoToHole = null;
    if (opts && typeof opts === 'object') { scopedPid = opts.playerId || null; modalGoToHole = opts.onGoToHole || null; }
    else if (typeof opts === 'string' && opts) { scopedPid = opts; }
    window._pestovoFinishModalGoToHole = (typeof modalGoToHole === 'function') ? modalGoToHole : null;

    db.ref('rounds/' + roundId).once('value').then(function(sn) {
        var r = sn.val();
        if (!r) return;

        var modalEl = document.getElementById('finish-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'finish-modal';
            modalEl.className = 'modal hidden';
            modalEl.innerHTML =
                '<div class="modal-bg" onclick="closeFinishModal()"></div>' +
                '<div class="modal-body" style="max-width:560px;">' +
                '<div class="modal-top-bar">' +
                '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeFinishModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
                '<button type="button" class="modal-close-btn" onclick="closeFinishModal()">&times;</button>' +
                '</div>' +
                '<div id="finish-modal-body"></div>' +
                '</div>';
            if (document.body) document.body.appendChild(modalEl);
        }

        var bodyEl = document.getElementById('finish-modal-body');
        var order = getRoundOrder(r);
        var holeCount = order.length;
        var players = Object.entries(r.players || {}).filter(function(pe) {
            // Удалённые и навсегда заблокированные демо-игроки не показываются
            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name)) return false;
            // Турнирное завершение: в модалке показываем только меня (проверка — я + мой маркер)
            if (scopedPid && pe[0] !== scopedPid) return false;
            return true;
        });
        var verification = scopedPid ? collectPlayerVerification(r, scopedPid) : collectRoundVerification(r);

        var titleStr = currentLang === 'en' ? '🏁 Finish Round Confirmation' : '🏁 Подтверждение завершения раунда';
        var subStr = currentLang === 'en' ? 'Please review final scores before finishing:' : 'Пожалуйста, проверьте итоговые результаты перед завершением:';
        var finishBtnStr = currentLang === 'en' ? '🏁 Finish & Save Round' : '🏁 Завершить раунд';
        var continueBtnStr = currentLang === 'en' ? '← Continue Playing' : '← Продолжить игру';

        var html = '<h2 style="color:var(--gold);font-family:var(--ff);margin-bottom:6px;">' + titleStr + '</h2>';
        html += '<p style="font-size:13px;color:var(--muted);margin-bottom:20px;">' + subStr + '</p>';

        players.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);

            html += '<div class="list-item" style="padding:14px;margin-bottom:10px;flex-wrap:wrap;gap:8px;">';
            html += '<div style="flex:1;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(playerDisplayName(p, pid)) + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + t('hole') + 's: ' + stats.holesPlayed + ' / ' + holeCount + ' · Gross: ' + (stats.gross || 0) + '</div></div>';
            html += '<div style="text-align:right;"><div class="' + scoreClass(stats.toPar) + '" style="font-weight:800;font-size:18px;">' + fmtScore(stats.toPar) + '</div></div>';
            html += '</div>';
        });

        if (!verification.canFinish) {
            if (scopedPid && verification.firstIssue) {
                // Компактная подсказка вместо большого блока: только ПЕРВАЯ проблемная
                // лунка по порядку + кнопка перехода к ней. Остальное — через уведомления.
                var fIssue = verification.firstIssue;
                var fHtml = verificationIssueToastHtml(fIssue, verification);
                html += '<div style="margin:16px 0;" id="finish-verification-report">';
                html += '<div class="timing-alert ' + (fIssue.kind === 'mismatch' ? 'timing-late' : 'timing-warn') + '"><i class="fas ' + (fIssue.kind === 'mismatch' ? 'fa-triangle-exclamation' : 'fa-clock') + '"></i><div>' + fHtml + '</div></div>';
                html += '<button type="button" class="btn btn-og btn-block" style="margin-top:10px;" onclick="finishModalGoToHole(' + fIssue.hole + ')"><i class="fas fa-arrow-right"></i> ' + (currentLang === 'en' ? 'Go to hole ' + fIssue.hole : 'Перейти к лунке ' + fIssue.hole) + '</button>';
                html += '</div>';
            } else {
                html += '<div style="margin:16px 0;" id="finish-verification-report">' + buildVerificationReportHtml(verification) + '</div>';
            }
            if (currentLang === 'en') {
                html += '<div class="timing-alert timing-late" style="margin-bottom:4px;"><i class="fas fa-ban"></i><div><strong>' + (scopedPid ? 'The round cannot be finished until your scores are confirmed by your marker.' : 'The round cannot be finished until all scores are confirmed and matches are resolved.') + '</strong></div></div>';
            } else {
                html += '<div class="timing-alert timing-late" style="margin-bottom:4px;"><i class="fas fa-ban"></i><div><strong>' + (scopedPid ? 'Раунд нельзя завершить, пока ваш маркер не подтвердит ваши счета.' : 'Раунд нельзя завершить, пока все счета не подтверждены и не устранены несовпадения.') + '</strong></div></div>';
            }
        }

        html += '<div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;">';
        html += '<button class="btn btn-og" style="flex:1;" onclick="closeFinishModal()">' + continueBtnStr + '</button>';
        html += '<button class="btn btn-g" style="flex:1;" id="confirm-finish-btn">' + finishBtnStr + '</button>';
        html += '</div>';

        if (bodyEl) bodyEl.innerHTML = html;
        modalEl.classList.remove('hidden');

        var confirmBtn = document.getElementById('confirm-finish-btn');
        if (confirmBtn) {
            if (!verification.canFinish) {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.45';
                confirmBtn.style.cursor = 'not-allowed';
                confirmBtn.style.pointerEvents = 'none';
            } else {
                confirmBtn.onclick = function() {
                    closeFinishModal();
                    if (typeof onConfirmCallback === 'function') onConfirmCallback();
                };
            }
        }
    });
}

function closeFinishModal() {
    var modalEl = document.getElementById('finish-modal');
    if (modalEl) modalEl.classList.add('hidden');
    if (typeof window._pestovoFinishModalOnClose === 'function') {
        var cb = window._pestovoFinishModalOnClose;
        window._pestovoFinishModalOnClose = null;
        cb();
    }
}

// Переход к проблемной лунке из модалки завершения (закрывает модалку и зовёт onGoToHole).
function finishModalGoToHole(hole) {
    closeFinishModal();
    if (typeof window._pestovoFinishModalGoToHole === 'function') {
        try { window._pestovoFinishModalGoToHole(hole); } catch(_) {}
    }
}

// ==========================================
// ПРОПУЩЕННЫЕ ЛУНКИ — КОМПАКТНЫЙ ВЫБОР ПРИ ПЕРЕХОДЕ
// ==========================================
// При ручном переходе на другую лунку проверяем только лунки, которые
// игрок ПЕРЕПРЫГИВАЕТ по своему порядку игры (с учётом стартовой лунки
// и шотгана). Лунки, до которых он ещё не дошёл, пропущенными не считаются.
// Нажатая кнопка «Пропустить» запоминает решение до конца раунда:
// уведомление больше не мешает вводу и снова показывается только при
// завершении раунда (исправление результата).
function pestovoSkipAckKey(rid, pid) { return 'pestovo_skip_ack_' + rid + '_' + pid; }

function pestovoSkipGetAck(rid, pid) {
    try {
        var raw = localStorage.getItem(pestovoSkipAckKey(rid, pid));
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}

function pestovoSkipAddAck(rid, pid, holes) {
    var map = pestovoSkipGetAck(rid, pid);
    (holes || []).forEach(function(h) { map[h] = Date.now(); });
    try { localStorage.setItem(pestovoSkipAckKey(rid, pid), JSON.stringify(map)); } catch (e) {}
    return map;
}

function pestovoSkipClearAck(rid, pid) {
    try { localStorage.removeItem(pestovoSkipAckKey(rid, pid)); } catch (e) {}
}

// Исправление/ввод результата на лунке снимает ранее нажатый «Пропустить»
// именно для этих лунок (блок снова может предупреждать о пропусках).
function pestovoSkipDropAckHoles(rid, pid, holes) {
    var map = pestovoSkipGetAck(rid, pid);
    var changed = false;
    (holes || []).forEach(function(h) {
        var k = String(h);
        if (map[k] !== undefined) { delete map[k]; changed = true; }
    });
    if (!changed) return;
    try {
        if (Object.keys(map).length) localStorage.setItem(pestovoSkipAckKey(rid, pid), JSON.stringify(map));
        else localStorage.removeItem(pestovoSkipAckKey(rid, pid));
    } catch (e) {}
}

// Лунки без счёта на отрезке [fromIdx; toIdx) по порядку игры игрока.
// acked-лунки (на которые игрок осознанно нажал «Пропустить») исключаются.
function pestovoMissingHolesAhead(order, isMissing, fromHole, toHole, ackMap) {
    var fromIdx = order.indexOf(fromHole);
    var toIdx = order.indexOf(toHole);
    var out = [];
    if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return out;
    for (var i = fromIdx; i < toIdx; i++) {
        var h = order[i];
        if (ackMap && ackMap[h]) continue;
        try { if (isMissing(h)) out.push(h); } catch (e) {}
    }
    return out;
}

function pestovoCloseSkipModal() {
    var m = document.getElementById('pestovo-skip-modal');
    if (m) m.classList.add('hidden');
}

// Компактная модалка-выбор: ровно ОДНА пропущенная лунка + действия.
// cb('enter', h)  — ввести счёт на пропущенной лунке;
// cb('skip', h)   — пропустить её и продолжить переход;
// cb('skipall', holes) — пропустить все перепрыгиваемые лунки до конца раунда.
function pestovoShowSkipChoiceModal(hole, allMissing, cb) {
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var modal = document.getElementById('pestovo-skip-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pestovo-skip-modal';
        modal.className = 'modal hidden';
        modal.innerHTML =
            '<div class="modal-bg" onclick="pestovoCloseSkipModal()"></div>' +
            '<div class="modal-body" style="max-width:440px;">' +
            '<button type="button" class="modal-close-btn" onclick="pestovoCloseSkipModal()">&times;</button>' +
            '<div id="pestovo-skip-modal-body"></div>' +
            '</div>';
        document.body.appendChild(modal);
    }
    var moreCnt = Math.max(0, (allMissing || []).length - 1);
    var body =
        '<div class="skip-choice"><div class="skip-choice-ic"><i class="fas fa-triangle-exclamation"></i></div>' +
        '<h2 style="color:#f3b23c;margin:0 0 6px;">' + (en ? 'Hole ' + hole + ' has no score' : 'Лунка ' + hole + ' — счёт не введён') + '</h2>' +
        '<p style="font-size:13px;color:var(--muted);margin:0 0 16px;">' +
        (en ? 'Enter the score on this hole, or skip it and keep moving.' : 'Введите счёт на этой лунке или пропустите её и двигайтесь дальше.') +
        (moreCnt ? ' ' + (en ? (moreCnt + ' more hole(s) ahead without a score.') : ('Ещё пропущено лунок впереди: ' + moreCnt + '.')) : '') +
        '</p>' +
        '<button type="button" class="btn btn-g btn-block" id="psk-enter"><i class="fas fa-pen"></i> ' +
        (en ? 'Enter score on hole ' + hole : 'Ввести счёт на лунке ' + hole) + '</button>' +
        '<button type="button" class="btn btn-ol btn-block" style="margin-top:8px;" id="psk-skip"><i class="fas fa-forward"></i> ' +
        (en ? 'Skip and continue' : 'Пропустить и продолжить') + '</button>' +
        '<button type="button" class="skip-choice-all" id="psk-skipall">' +
        (en ? 'Continue with skips until the round is finished' : 'Продолжить с пропуском (не напоминать до завершения раунда)') +
        '</button></div>';
    document.getElementById('pestovo-skip-modal-body').innerHTML = body;
    modal.classList.remove('hidden');
    document.getElementById('psk-enter').onclick = function() { pestovoCloseSkipModal(); cb && cb('enter', hole); };
    document.getElementById('psk-skip').onclick = function() { pestovoCloseSkipModal(); cb && cb('skip', hole); };
    var allBtn = document.getElementById('psk-skipall');
    if (allBtn) allBtn.onclick = function() { pestovoCloseSkipModal(); cb && cb('skipall', allMissing); };
}

// Перехват перехода по лункам: при пропуске показываем компактный выбор.
// opts = { rid, pid, order, isMissing(h), from, to, performJump(h), enterHole(h) }
// performJump(to) вызывается, когда переход разрешён (или пропуск подтверждён).
// enterHole(h) — перейти к вводу пропущенной лунки.
function pestovoGuardHoleJump(opts) {
    if (!opts) return;
    var ack = pestovoSkipGetAck(opts.rid, opts.pid);
    var missing = pestovoMissingHolesAhead(opts.order || [], opts.isMissing, opts.from, opts.to, ack);
    if (!missing.length) { opts.performJump && opts.performJump(opts.to); return; }
    pestovoShowSkipChoiceModal(missing[0], missing, function(action, val) {
        if (action === 'enter') {
            opts.enterHole ? opts.enterHole(val) : opts.performJump && opts.performJump(val);
        } else if (action === 'skip') {
            pestovoSkipAddAck(opts.rid, opts.pid, [val]);
            // рекурсия: если впереди остались ещё непропущенные лунки — спросим про следующую
            pestovoGuardHoleJump(opts);
        } else if (action === 'skipall') {
            pestovoSkipAddAck(opts.rid, opts.pid, (val || []).slice());
            opts.performJump && opts.performJump(opts.to);
        }
    });
}

// Сессия открыта по ссылке «Продолжить по ФИО» (?as=<pid>) с устройства,
// которое не является владельцем (нет аккаунта игрока и нет access-key).
function pestovoIsFioResume(rd, rid, pid) {
    if (!rd || !pid) return false;
    var asParam = null;
    try { asParam = new URLSearchParams(window.location.search).get('as'); } catch (e) { return false; }
    if (!asParam || String(asParam) !== String(pid)) return false;
    if (typeof currentUser !== 'undefined' && currentUser) {
        if (rd.createdBy === currentUser.uid) return false;
        if (rd.players && rd.players[currentUser.uid]) return false;
    }
    var key = (rd.mode === 'solo')
        ? localStorage.getItem('pestovo_solo_key_' + rid)
        : localStorage.getItem('pestovo_group_key_' + rid);
    if (key && rd.accessKey === key) return false;
    return true;
}

function pestovoFioVerified(rid, pid) {
    try { return sessionStorage.getItem('pestovo_fio_verified_' + rid + '_' + pid) === '1'; }
    catch (e) { return false; }
}
function pestovoFioMarkVerified(rid, pid) {
    try { sessionStorage.setItem('pestovo_fio_verified_' + rid + '_' + pid, '1'); } catch (e) {}
}

// Проверка владения раундом перед завершением на не-своём устройстве:
// последние 4 цифры телефона из профиля; если телефона нет — полное ФИО.
function pestovoVerifyRoundOwner(rd, rid, pid, cb) {
    var p = rd && rd.players ? rd.players[pid] : null;
    if (!p) { cb && cb(false); return; }
    if (pestovoFioVerified(rid, pid)) { cb && cb(true); return; }
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var modal = document.getElementById('pestovo-skip-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pestovo-skip-modal';
        modal.className = 'modal hidden';
        modal.innerHTML =
            '<div class="modal-bg" onclick="pestovoCloseVerifyModal()"></div>' +
            '<div class="modal-body" style="max-width:440px;">' +
            '<button type="button" class="modal-close-btn" onclick="pestovoCloseVerifyModal()">&times;</button>' +
            '<div id="pestovo-skip-modal-body"></div></div>';
        document.body.appendChild(modal);
    }
    window.pestovoCloseVerifyModal = function() { modal.classList.add('hidden'); cb && cb(false); };

    var askName = function() {
        var full = p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
        document.getElementById('pestovo-skip-modal-body').innerHTML =
            '<div class="skip-choice"><div class="skip-choice-ic"><i class="fas fa-shield-halved"></i></div>' +
            '<h2 style="color:var(--gold);margin:0 0 6px;">' + (en ? 'Confirm it is your round' : 'Подтвердите, что это ваш раунд') + '</h2>' +
            '<p style="font-size:13px;color:var(--muted);">' +
            (en ? 'Another player cannot finish this round. Type the full name of the card holder exactly.' : 'Другой игрок не может завершить этот раунд. Введите полное ФИО владельца карточки.') + '</p>' +
            '<input type="text" class="form-input" id="psk-owner-name" placeholder="' + (en ? 'Full name' : 'Полное ФИО') + '">' +
            '<button class="btn btn-g btn-block" id="psk-owner-ok" style="margin-top:10px;">' + (en ? 'Confirm and finish' : 'Подтвердить и завершить') + '</button></div>';
        modal.classList.remove('hidden');
        document.getElementById('psk-owner-ok').onclick = function() {
            var v = (document.getElementById('psk-owner-name').value || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
            var want = full.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
            if (v && want && v === want) {
                modal.classList.add('hidden');
                pestovoFioMarkVerified(rid, pid);
                cb && cb(true);
            } else if (typeof toast === 'function') {
                toast(en ? 'Name does not match the card' : 'ФИО не совпадает с карточкой', 'error');
            }
        };
    };

    if (typeof db === 'undefined' || !db) { askName(); return; }
    db.ref('users/' + pid).once('value').then(function(sn) {
        var u = sn.val() || {};
        var digits = String(u.phone || '').replace(/\D/g, '');
        if (digits.length >= 4) {
            var last4 = digits.slice(-4);
            document.getElementById('pestovo-skip-modal-body').innerHTML =
                '<div class="skip-choice"><div class="skip-choice-ic"><i class="fas fa-shield-halved"></i></div>' +
                '<h2 style="color:var(--gold);margin:0 0 6px;">' + (en ? 'Confirm it is your round' : 'Подтвердите, что это ваш раунд') + '</h2>' +
                '<p style="font-size:13px;color:var(--muted);">' +
                (en ? 'Another player cannot finish this round. Enter the last 4 digits of the phone number from the profile.' : 'Другой игрок не может завершить этот раунд. Введите последние 4 цифры телефона из профиля.') + '</p>' +
                '<input type="tel" inputmode="numeric" class="form-input" id="psk-owner-phone" placeholder="••••">' +
                '<button class="btn btn-g btn-block" id="psk-owner-ok" style="margin-top:10px;">' + (en ? 'Confirm and finish' : 'Подтвердить и завершить') + '</button></div>';
            modal.classList.remove('hidden');
            var inp = document.getElementById('psk-owner-phone');
            if (inp) inp.focus();
            document.getElementById('psk-owner-ok').onclick = function() {
                var v = (inp.value || '').replace(/\D/g, '').slice(-4);
                if (v === last4) {
                    modal.classList.add('hidden');
                    pestovoFioMarkVerified(rid, pid);
                    cb && cb(true);
                } else if (typeof toast === 'function') {
                    toast(en ? 'Phone digits do not match' : 'Цифры телефона не совпадают', 'error');
                }
            };
        } else {
            askName();
        }
    }).catch(askName);
}

// Модалка при завершении раунда: все лунки без счёта (независимо от
// нажатых ранее «Пропустить») + выбор «исправить» или «завершить как есть».
function pestovoShowFinishMissingModal(missing, opts) {
    opts = opts || {};
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var modal = document.getElementById('pestovo-skip-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pestovo-skip-modal';
        modal.className = 'modal hidden';
        modal.innerHTML =
            '<div class="modal-bg" onclick="pestovoCloseSkipModal()"></div>' +
            '<div class="modal-body" style="max-width:480px;">' +
            '<button type="button" class="modal-close-btn" onclick="pestovoCloseSkipModal()">&times;</button>' +
            '<div id="pestovo-skip-modal-body"></div>' +
            '</div>';
        document.body.appendChild(modal);
    }
    var chips = (missing || []).map(function(h) {
        return '<button type="button" class="shb-hole-btn" data-hole="' + h + '">' +
            (en ? 'Hole ' : 'Лунка ') + h + '</button>';
    }).join('');
    var body =
        '<div class="skip-choice"><div class="skip-choice-ic"><i class="fas fa-flag-checkered"></i></div>' +
        '<h2 style="color:#f3b23c;margin:0 0 6px;">' + (en ? 'Some holes have no score' : 'Не на всех лунках введён счёт') + '</h2>' +
        '<p style="font-size:13px;color:var(--muted);margin:0 0 10px;">' +
        (en ? 'Tap a hole to enter the score, or finish the round anyway.' : 'Нажмите на лунку, чтобы ввести счёт, либо завершите раунд без них.') + '</p>' +
        '<div class="skip-finish-holes">' + chips + '</div>' +
        '<button type="button" class="btn btn-g btn-block" id="psk-finish-anyway" style="margin-top:14px;"><i class="fas fa-flag-checkered"></i> ' +
        (en ? 'Finish anyway' : 'Завершить раунд') + '</button>' +
        '<button type="button" class="btn btn-og btn-block" style="margin-top:8px;" id="psk-continue"><i class="fas fa-arrow-left"></i> ' +
        (en ? 'Continue playing' : 'Продолжить игру') + '</button></div>';
    document.getElementById('pestovo-skip-modal-body').innerHTML = body;
    modal.classList.remove('hidden');
    Array.prototype.forEach.call(modal.querySelectorAll('.shb-hole-btn'), function(btn) {
        btn.onclick = function() {
            var h = parseInt(btn.getAttribute('data-hole'), 10);
            pestovoCloseSkipModal();
            if (typeof opts.onEnter === 'function') opts.onEnter(h);
        };
    });
    document.getElementById('psk-finish-anyway').onclick = function() {
        pestovoCloseSkipModal();
        if (typeof opts.onFinishAnyway === 'function') opts.onFinishAnyway();
    };
    document.getElementById('psk-continue').onclick = function() {
        pestovoCloseSkipModal();
        if (typeof opts.onContinue === 'function') opts.onContinue();
    };
}

// ==========================================
// СКОРКАРТА ПЕСТОВО (КАК НА ФОТО — 18 ЛУНОК)
// ==========================================
function generatePestovoScorecardHTML(player, roundData, opts) {
    opts = opts || {};
    var compact = !!opts.compact;
    var p = player || {};
    var sc = p.scores || {};
    var fHcp = p.fieldHcp || 0;
    var eHcp = p.exactHcp || 0;
    var teeCode = (p && p.tee) || (roundData && roundData.tee) || 'wh';
    // Форматная линия целиком («Stableford + Gross»), а не только основной формат.
    var fmt = pestovoRoundFormatsLabel(roundData) || (roundData && roundData.format) || 'Stroke Play';
    var date = fmtDate((roundData && (roundData.completedAt || roundData.createdAt)) || Date.now());

    var order = getRoundOrder(roundData);
    var holeRange = (roundData && roundData.holeRange) || '1-18';
    var front = order.filter(function(h){ return h <= 9; });
    var back = order.filter(function(h){ return h >= 10; });

    var pStats = calcRoundStats(sc, fHcp || 0, eHcp || 0, order);
    var pCurHole = pStats.holesPlayed >= order.length ? null : pStats.currentHole;

    var totG = 0, totS = 0, totPar = 0;
    order.forEach(function(i) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) {
            totG += s;
            totS += stablefordField(s, i, fHcp);
        }
        totPar += holePar(i);
    });

    var html = '<div class="pestovo-modern-scorecard">';

    // 1. Top HUD Header. В компактном режиме шапка не выводится: имя, ТИ,
    // HCP, формат и дата уже показаны на странице над карточкой.
    if (!compact) {
        html += '<div class="msc-card-hdr">';
        html += '  <div class="msc-player-title"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(playerDisplayName(p, null)) + '</div>';
        html += '  <div class="msc-meta-pills">';
        html += '    <span class="msc-pill hcp-band ' + fieldHcpBandClass(fHcp) + '" title="' + fieldHcpBandTitle(fHcp) + '">HCP: <b>' + fmtExactHcp(eHcp) + '</b> (' + fmtFieldHcp(fHcp) + ')</span>';
        html += '    <span class="msc-pill">' + fmtTeePill(teeCode) + '</span>';
        html += '    <span class="msc-pill">' + fmt + ' · ' + holeRange + ' · ' + date + '</span>';
        html += '  </div>';
        html += '</div>';
    }

    // Тайл лунки: фора (как при вводе счёта), номер лунки, счёт, индекс и очки Stableford.
    // Расстояние на тайле не показывается — карточка остаётся компактной без скроллов.
    var tileHTML = function(i) {
        var s = parseInt(sc[i]) || 0;
        var par = holePar(i);
        var hcp = holeHcp(i);
        var badgeCls = (s > 0 ? holeResClass(s, par) : '') + ' ' + holeNineClass(i);
        // Несовпадение с маркером — ячейка мигает серым, чтобы игроки видели расхождение
        if (getHoleVerifyState(p, i) === 'mismatch') badgeCls += ' cell-mismatch';
        // Текущая лунка игрока — золотая рамка и пульсация
        var isCur = (pCurHole !== null && i === pCurHole);
        if (isCur) badgeCls += ' sc-cur-tile';
        var stbl = s > 0 ? stablefordField(s, i, fHcp) : null;
        var stblTitle = currentLang === 'en'
            ? (stbl !== null ? stbl + ' Stableford ' + (stbl === 1 ? 'point' : 'points') : 'No Stableford points yet')
            : (stbl !== null ? 'Очки Stableford: ' + stbl : 'Очков Stableford пока нет');
        if (isCur) {
            stblTitle = (currentLang === 'en' ? 'Current hole. ' : 'Текущая лунка. ') + stblTitle;
        }

        var html = '<div class="msc-tile ' + badgeCls + '" title="' + stblTitle + '" data-sc-hole="' + i + '"' + (isCur ? ' data-sc-current="1"' : '') + '>';
        html += '  <div class="msc-tile-top"><span class="msc-hole-num">#' + i + '</span>' + hcpStrokesMarksHTML(fHcp, i) + '</div>';
        html += '  <div class="msc-tile-score">' + (s > 0 ? s : '—') + '</div>';
        html += '  <div class="msc-tile-bot"><span class="msc-hole-idx">idx ' + hcp + '</span><span class="msc-hole-stbl">' + (stbl !== null ? stbl + ' pt' : '—') + '</span></div>';
        html += '</div>';
        return html;
    };

    // Вкладки «Первые 9 / Вторые 9 / Все 18» удалены: карточка всегда
    // показывает все лунки выбранного диапазона сразу.
    html += '<div class="sc-tabs-wrap" data-view="all">';

    var frontRun = 0;

    if (front.length) {
        html += '<div class="msc-tile-grid">';
        front.forEach(function(i) {
            html += tileHTML(i);
        });
        html += '</div>';
        var frontToPar = buildToParRowHTML(front, sc, 0, 'msc-tile-grid', 'sc-h-front');
        frontRun = frontToPar.run;
        html += frontToPar.html;
        var outG = 0, outS = 0;
        front.forEach(function(i){ var s=parseInt(sc[i])||0; if(s>0){ outG+=s; outS+=stablefordField(s,i,fHcp);} });
        html += '<div class="msc-totals-strip sc-h-front">';
        html += '  <span>OUT: <b>' + (outG > 0 ? outG : '—') + '</b></span>';
        html += '  <span>Stbl: <b>' + outS + 'p</b></span>';
        html += '</div>';
    }

    if (back.length) {
        html += '<div class="msc-tile-grid" style="margin-top:10px;">';
        back.forEach(function(i) {
            html += tileHTML(i);
        });
        html += '</div>';
        html += buildToParRowHTML(back, sc, frontRun, 'msc-tile-grid', 'sc-h-back').html;
        var inG = 0, inS = 0;
        back.forEach(function(i){ var s=parseInt(sc[i])||0; if(s>0){ inG+=s; inS+=stablefordField(s,i,fHcp);} });
        html += '<div class="msc-totals-strip sc-h-back">';
        html += '  <span>IN: <b>' + (inG > 0 ? inG : '—') + '</b></span>';
        html += '  <span>Stbl: <b>' + inS + 'p</b></span>';
        html += '</div>';
    }

    html += '</div>'; // /sc-tabs-wrap

    html += '<div class="msc-grand-strip">';
    html += '  <span>GROSS: <b>' + (totG > 0 ? totG : '—') + '</b></span>';
    html += '  <span>STABLEFORD: <b>' + totS + 'p</b></span>';
    html += '</div>';

    html += '</div>'; // End pestovo-modern-scorecard

    return html;
}

// ==========================================
// ПЕЧАТЬ ОФИЦИАЛЬНОЙ СЧЁТНОЙ КАРТОЧКИ (IMG_1113.JPEG REPLICA)
// ==========================================
function generateExactPestovoPaperScorecardHTML(player, roundData) {
    var p = player || {};
    var sc = p.scores || {};
    var fHcp = p.fieldHcp || 0;
    var eHcp = p.exactHcp || 0;
    var teeCode = (p && p.tee) || (roundData && roundData.tee) || 'wh';
    // Форматная линия целиком («Stableford + Gross»), а не только основной формат.
    var fmt = pestovoRoundFormatsLabel(roundData) || (roundData && roundData.format) || 'Stroke Play';
    var tName = (roundData && roundData.tournamentName) || '—';
    var date = fmtDate((roundData && (roundData.completedAt || roundData.createdAt)) || Date.now());
    var startTime = fmtTime(roundData && roundData.startTime);

    var outG = 0, inG = 0, outS = 0, inS = 0;
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) { outG += s; outS += stablefordField(s, i, fHcp); }
    }
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) { inG += s; inS += stablefordField(s, i, fHcp); }
    }
    var totG = outG + inG, totS = outS + inS;

    var pOut = 0, pIn = 0;
    for (var i = 1; i <= 9; i++) pOut += holePar(i);
    for (var i = 10; i <= 18; i++) pIn += holePar(i);

    var html = '<div class="paper-scorecard-wrap">';

    // Top Header with Logo
    html += '<div class="psc-top-header">';
    html += '  <div class="psc-logo-brand">';
    html += '    <img src="img/logo.png" alt="Pestovo" class="psc-logo" onerror="this.style.display=\'none\'">';
    html += '    <div><div class="psc-club-title">ГОЛЬФ-КЛУБ «ПЕСТОВО»</div><div class="psc-club-sub">Официальная счётная карточка</div></div>';
    html += '  </div>';
    html += '</div>';

    // Player & Meta Block (Matching IMG_1113.jpeg)
    html += '<div class="psc-meta-grid">';
    html += '  <div class="psc-meta-left">';
    html += '    <div><b>Игрок:</b> ' + escapeHtml(p.name || '___________________________') + '</div>';
    html += '    <div><b>Турнир:</b> ' + escapeHtml(tName || '') + ' &nbsp;&nbsp;&nbsp;&nbsp; <b>Формат:</b> ' + escapeHtml(fmt || '') + '</div>';
    html += '  </div>';
    html += '  <div class="psc-meta-right">';
    html += '    <div><b>Точный гандикап:</b> ' + fmtExactHcp(eHcp) + ' &nbsp;&nbsp; (Игровой: ' + fmtFieldHcp(fHcp) + ')</div>';
    html += '    <table class="psc-meta-table">';
    html += '      <tr><th>Раунд</th><th>Время старта</th><th>Дата</th></tr>';
    html += '      <tr><td>1</td><td>' + startTime + '</td><td>' + date + '</td></tr>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    // Grid Table Showing ONLY Played Tee
    html += '<div class="psc-table-wrap">';
    html += '<table class="psc-grid-table">';
    html += '<thead><tr><th style="width:75px;">ТИ \\ Лунка</th>';
    for (var i = 1; i <= 9; i++) html += '<th>' + i + '</th>';
    html += '<th class="psc-tot-col">Аут</th>';
    for (var i = 10; i <= 18; i++) html += '<th>' + i + '</th>';
    html += '<th class="psc-tot-col">Ин</th><th class="psc-tot-col">Итого</th></tr></thead>';

    html += '<tbody>';

    // SINGLE PLAYED TEE ROW (Only the Tee played by the player)
    var teeName = TEES[teeCode] || 'Белый';
    var teeClass = 'psc-tee-' + teeCode;
    var dO = 0, dI = 0;
    for (var i = 1; i <= 9; i++) dO += (HOLES[i][teeCode] || HOLES[i].wh);
    for (var i = 10; i <= 18; i++) dI += (HOLES[i][teeCode] || HOLES[i].wh);

    html += '<tr><td class="psc-lbl-tee ' + teeClass + '">' + teeName + '</td>';
    for (var i = 1; i <= 9; i++) html += '<td>' + (HOLES[i][teeCode] || HOLES[i].wh) + '</td>';
    html += '<td class="psc-tot-col">' + dO + '</td>';
    for (var i = 10; i <= 18; i++) html += '<td>' + (HOLES[i][teeCode] || HOLES[i].wh) + '</td>';
    html += '<td class="psc-tot-col">' + dI + '</td><td class="psc-tot-col">' + (dO + dI) + '</td></tr>';

    // Пар
    html += '<tr class="psc-row-par"><td class="psc-lbl-bold">Пар</td>';
    for (var i = 1; i <= 9; i++) html += '<td>' + HOLES[i].p + '</td>';
    html += '<td class="psc-tot-col">' + pOut + '</td>';
    for (var i = 10; i <= 18; i++) html += '<td>' + HOLES[i].p + '</td>';
    html += '<td class="psc-tot-col">' + pIn + '</td><td class="psc-tot-col">' + (pOut + pIn) + '</td></tr>';

    // Индекс
    html += '<tr class="psc-row-idx"><td class="psc-lbl-bold">Индекс</td>';
    for (var i = 1; i <= 9; i++) html += '<td>' + HOLES[i].hcp + '</td>';
    html += '<td class="psc-tot-col">—</td>';
    for (var i = 10; i <= 18; i++) html += '<td>' + HOLES[i].hcp + '</td>';
    html += '<td class="psc-tot-col">—</td><td class="psc-tot-col">—</td></tr>';

    // Счёт Игрока
    html += '<tr class="psc-row-score"><td class="psc-lbl-bold">Счёт</td>';
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        html += '<td class="psc-score-cell">' + (s > 0 ? '<b>' + s + '</b>' : '') + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (outG > 0 ? outG : '') + '</b></td>';
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        html += '<td class="psc-score-cell">' + (s > 0 ? '<b>' + s + '</b>' : '') + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (inG > 0 ? inG : '') + '</b></td>';
    html += '<td class="psc-tot-col"><b>' + (totG > 0 ? totG : '') + '</b></td></tr>';

    // Stableford
    html += '<tr><td class="psc-lbl-bold">Stableford</td>';
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        var pts = s > 0 ? stablefordField(s, i, fHcp) : '';
        html += '<td>' + pts + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (outS > 0 ? outS : '') + '</b></td>';
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        var pts = s > 0 ? stablefordField(s, i, fHcp) : '';
        html += '<td>' + pts + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (inS > 0 ? inS : '') + '</b></td>';
    html += '<td class="psc-tot-col"><b>' + (totS > 0 ? totS : '') + '</b></td></tr>';

    html += '</tbody></table></div>';

    // Signatures Footer
    html += '<div class="psc-signatures">';
    html += '  <span><b>Подписи:</b></span>';
    html += '  <span><b>Игрок:</b> ____________________</span>';
    html += '  <span><b>Маркер:</b> ____________________</span>';
    html += '  <span><b>Судья:</b> ____________________</span>';
    html += '</div>';

    html += '</div>';

    return html;
}

function openPrintScorecardModal(roundId, playerId) {
    if (typeof db === 'undefined' || !roundId) return;

    db.ref('rounds/' + roundId).once('value').then(function(sn) {
        var r = sn.val();
        if (!r || !r.players) {
            toast(currentLang === 'en' ? 'Round not found' : 'Раунд не найден', 'error');
            return;
        }

        var playersList = Object.entries(r.players);
        if (!playersList.length) return;

        var modalEl = document.getElementById('print-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'print-modal';
            modalEl.className = 'modal hidden';
            modalEl.innerHTML =
                '<div class="modal-bg" onclick="closePrintModal()"></div>' +
                '<div class="modal-body" style="max-width:880px;">' +
                '<div class="modal-top-bar">' +
                '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closePrintModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
                '<button type="button" class="modal-close-btn" onclick="closePrintModal()">&times;</button>' +
                '</div>' +
                '<div id="print-modal-body"></div>' +
                '</div>';
            if (document.body) document.body.appendChild(modalEl);
        }

    var bodyEl = document.getElementById('print-modal-body');

    // Печатается карточка каждого игрока раунда: на листе A4 (landscape)
    // помещается 2 карточки, при печати видна только сама карточка.
    var html = '<div class="print-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">';
    html += '<h2 style="color:var(--gold);margin:0;"><i class="fas fa-print"></i> ' + (currentLang === 'en' ? 'Print Official Scorecard' : 'Печать официальной счётной карточки') + '</h2>';
    html += '<div style="display:flex;gap:8px;">';
    html += '<button type="button" class="btn btn-g" onclick="window.print()"><i class="fas fa-print"></i> ' + (currentLang === 'en' ? 'Print' : 'Распечатать') + '</button>';
    html += '<button type="button" class="btn btn-og" onclick="closePrintModal()">' + (currentLang === 'en' ? 'Close' : 'Закрыть') + '</button>';
    html += '</div></div>';

    if (playersList.length > 1) {
        html += '<p class="no-print" style="color:var(--muted);font-size:12px;margin-bottom:10px;"><i class="fas fa-circle-info"></i> ' +
            (currentLang === 'en' ? 'Cards for all ' + playersList.length + ' players — 2 per A4 sheet.' : 'Карточки всех игроков (' + playersList.length + ') — по 2 на лист A4.') + '</p>';
    }

    html += '<div id="printable-scorecard" class="print-cards-grid">';
    playersList.forEach(function(pe) {
        html += generateExactPestovoPaperScorecardHTML(pe[1], r);
    });
    html += '</div>';

    if (bodyEl) bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');
    });
}

function closePrintModal() {
    var modalEl = document.getElementById('print-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function downloadScorecard(roundId) {
    openPrintScorecardModal(roundId);
}

// ==========================================
// ИСТОРИЯ
// ==========================================
function saveHistory(roundId,rd){
    var players=rd.players||{};
    Object.entries(players).forEach(function(pe){
        var pid=pe[0],p=pe[1],sc=p.scores||{},fH=p.fieldHcp||0,eH=p.exactHcp||0;
        var stats=calcRoundStats(sc,fH,eH,getRoundOrder(rd));
        if(stats.gross<=0)return;
        var isGuestPlayer=String(pid).indexOf('guest_')===0;
        // В профиль игрока всегда идёт НАСТОЯЩИЙ гандикап: турнирная обрезка
        // (hcpCut) относится только к этому турниру и не должна менять HCP
        // игрока глобально. exactHcpRaw — значение до обрезки.
        var rawHcp=(p.exactHcpRaw!=null&&p.exactHcpRaw!=='')?p.exactHcpRaw:eH;
        var cutApplied=(p.exactHcpRaw!=null&&p.exactHcpRaw!==''&&
            (parseFloat(p.exactHcpRaw)||0)!==(parseFloat(p.exactHcp)||0));
        if(isGuestPlayer && typeof resolveOrCreatePlayerUser==='function'){
            // Идемпотентное разрешение игрока: переиспользуем существующую запись
            // (по детерминированному id или по имени) вместо создания новой —
            // иначе один игрок плодил дубликаты в users после каждого раунда.
            resolveOrCreatePlayerUser({
                uid:null,
                name:p.name||'Гость',
                firstName:p.firstName||'',
                lastName:p.lastName||'',
                exactHcp:rawHcp,
                exactHcpRaw:rawHcp,
                // флаг: в раунде значение было обрезано турниром
                hcpFromTournamentCut:cutApplied,
                gender:p.gender||'men',
                isGuest:true
            }).then(function(userId){
                if(userId)saveHistoryEntry(userId,roundId,rd,p,stats);
            }).catch(function(){});
        }else{saveHistoryEntry(pid,roundId,rd,p,stats);}
    });
}

function saveHistoryEntry(userId,roundId,rd,p,stats){
    // Турнирные раунды помечаем турниром: в профиле игрока показываем название
    // турнира и дату (без дублирования «Пестово · Пестово»).
    var tnName=(rd.tournamentName||'').toString().trim();
    var entry={
        roundId:roundId,date:rd.completedAt||Date.now(),tee:(p&&p.tee)||rd.tee||'wh',format:rd.format||'Stroke Play',
        mode:rd.mode||'group',startHole:rd.startHole||1,holeRange:rd.holeRange||'1-18',gross:stats.gross,toPar:stats.toPar,
        net:stats.net,netToPar:stats.netToPar,stablefordField:stats.stablefordField,stablefordExact:stats.stablefordExact,
        holes:stats.holesPlayed,scores:p.scores||{},birdies:stats.birdies,eagles:stats.eagles,
        pars:stats.pars,holeInOne:stats.holeInOne,exactHcp:p.exactHcp||0,
        exactHcpRaw:(p.exactHcpRaw!=null&&p.exactHcpRaw!=='')?p.exactHcpRaw:(p.exactHcp||0),
        fieldHcp:p.fieldHcp||0,gender:p.gender||'men',status:'completed'
    };
    if(rd.tournamentId)entry.tournamentId=rd.tournamentId;
    if(tnName)entry.tournamentName=tnName;
    var roundName=(rd.roundName||rd.protocolName||'').toString().trim();
    if(rd.tournamentId&&roundName)entry.roundName=roundName;
    db.ref('users/'+userId+'/history').push(entry);
    db.ref('users/'+userId+'/roundsPlayed').transaction(function(v){return(v||0)+1;});
    if(stats.holesPlayed===getRoundHoleCount(rd)){
        db.ref('users/'+userId+'/bestGross').transaction(function(v){if(!v||stats.gross<v)return stats.gross;return v;});
        db.ref('users/'+userId+'/bestStableford').transaction(function(v){if(!v||stats.stablefordField>v)return stats.stablefordField;return v;});
    }
}


// ==========================================
// АВТОЗАВЕРШЕНИЕ ПРОСРОЧЕННЫХ РАУНДОВ
// ==========================================
// Раунд «живёт» только день старта: если игрок начал раунд вчера и не
// завершил его, на следующий день раунд автоматически переводится в статус
// «завершён автоматически» (autoCompleted=true). Проверка выполняется на
// клиентах при чтении списка раундов (главная, все раунды, админка) —
// первый открывший приложение игрок «подметает» базу за всех.
var __pestovoStaleRoundSweepIds = {};

function getRoundDayStartMs(ts) {
    var d = new Date(parseInt(ts, 10) || 0);
    if (isNaN(d.getTime())) return 0;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isRoundStaleForAutoComplete(r) {
    if (!r || typeof r !== 'object' || r.status !== 'active') return false;
    var startTs = parseInt(r.startTime, 10) || parseInt(r.createdAt, 10) || 0;
    if (!startTs) return false;
    var startDay = getRoundDayStartMs(startTs);
    if (!startDay) return false;
    var todayDay = getRoundDayStartMs(Date.now());
    // Раунд считается «вчерашним», если день его старта строго раньше сегодняшнего дня
    return startDay < todayDay;
}

// Принимает объект rounds из снапшота, переводит просроченные активные раунды
// в «completed» (локально сразу + записью в Firebase) и возвращает тот же объект.
function sweepStaleRounds(data) {
    if (!data || typeof data !== 'object') return data;
    Object.keys(data).forEach(function(id) {
        var r = data[id];
        if (!isRoundStaleForAutoComplete(r)) return;

        var nowMs = Date.now();
        // Локальный патч — чтобы текущий рендер сразу показал раунд завершённым
        r.status = 'completed';
        r.autoCompleted = true;
        r.autoCompletedAt = nowMs;
        if (!r.completedAt) r.completedAt = nowMs;

        // Пишем в базу только один раз за жизнь вкладки на каждый раунд
        if (typeof db === 'undefined' || __pestovoStaleRoundSweepIds[id]) return;
        __pestovoStaleRoundSweepIds[id] = true;

        var roundId = id;
        var roundData = r;
        var update = {
            status: 'completed',
            autoCompleted: true,
            autoCompletedAt: nowMs,
            completedAt: roundData.completedAt
        };
        db.ref('rounds/' + roundId).update(update).then(function() {
            // Все раунды турнира могут оказаться завершёнными после этого
            // авто-закрытия — проверяем и закрываем сам турнир автоматически.
            if (roundData.tournamentId) {
                try { pestovoAutoFinishTournament(roundData.tournamentId); } catch (e) {}
            }
            // Историю сохраняем атомарно ровно один раз (транзакция-клейм):
            // даже если sweep запустили одновременно несколько клиентов,
            // записи в users/<uid>/history не задвоятся.
            return pestovoClaimRoundHistory(roundId).then(function(claimed) {
                if (claimed && typeof saveHistory === 'function') {
                    try { saveHistory(roundId, roundData); } catch (e) {}
                }
            });
        }).catch(function() {
            delete __pestovoStaleRoundSweepIds[roundId];
        });
    });
    return data;
}

// ==========================================
// ЗАЯВКА НА ЗАПИСЬ ИСТОРИИ РАУНДА (идемпотентно)
// ==========================================
// Раунд могут «закрывать» несколько клиентов одновременно (игрок, маркер,
// автозакрытие, завершение турнира). Право записать историю получает только
// один — через транзакцию по rounds/<rid>/historyRecorded.
// Возвращает Promise<boolean>: true — можно писать историю этого раунда.
function pestovoClaimRoundHistory(roundId) {
    if (!roundId || typeof db === 'undefined' || !db) return Promise.resolve(false);
    var claimId = 'claim_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    return db.ref('rounds/' + roundId + '/historyRecorded').transaction(function(v) {
        if (v === null || v === undefined || v === false) return claimId;
        return undefined; // кто-то уже забрал — отменяем транзакцию
    }).then(function(res) {
        return !!(res && res.committed && res.snapshot && String(res.snapshot.val()) === claimId);
    }).catch(function() { return false; });
}

// Общая работа с раундами турнира при его завершении или удалении.
//   mode 'complete' — кнопка «Завершить»: открытые раунды переводятся в
//     completed и ПОСЛЕ этого попадают в историю игроков (как любой
//     завершённый раунд). Результаты никуда не деваются: турнир остаётся
//     в «Истории» и статистике каждого игрока.
//   mode 'delete'   — кнопка «Удалить»: сначала убираем раунды из истории
//     игроков (с пересчётом bestGross/bestStableford), затем сносим сами
//     раунды вместе с маркерами. Удалённый турнир не оставляет следов.
// Возвращает Promise<{ closed, rounds, players }>.
function pestovoFinalizeTournamentRounds(tnId, mode) {
    var out = { closed: 0, rounds: 0, players: 0 };
    if (!tnId || typeof db === 'undefined' || !db) return Promise.resolve(out);

    if (mode === 'delete') {
        return pestovoTournamentRoundIdsFull(tnId).then(function(ids) {
            out.rounds = ids.length;
            if (!ids.length) return out;
            return Promise.all(ids.map(function(rid) {
                return db.ref('rounds/' + rid).once('value').then(function(rs) {
                    var rd = (rs && rs.val()) || {};
                    return pestovoRemoveRoundFromPlayers(rid, rd.players || {});
                }).catch(function() { return 0; });
            })).then(function(list) {
                out.players = list.reduce(function(a, b) { return a + (b || 0); }, 0);
                var updates = {};
                ids.forEach(function(rid) {
                    updates['rounds/' + rid] = null;
                    updates['markers/' + rid] = null;
                    updates['markerAssignments/' + rid] = null;
                });
                return db.ref().update(updates).catch(function() {}).then(function() { return out; });
            });
        }).catch(function() { return out; });
    }

    return db.ref('rounds').orderByChild('tournamentId').equalTo(tnId).once('value').then(function(sn) {
        var rounds = (sn && sn.val()) || {};
        var ids = Object.keys(rounds);
        out.rounds = ids.length;
        if (!ids.length) return out;
        return Promise.all(ids.map(function(rid) {
            var rd = rounds[rid] || {};
            var needClose = rd.status !== 'completed';
            var patch = needClose
                ? { status: 'completed', completedAt: Date.now(), closedByTournamentFinish: true }
                : null;
            return (patch ? db.ref('rounds/' + rid).update(patch) : Promise.resolve())
                .then(function() {
                    if (patch) { rd.status = 'completed'; if (!rd.completedAt) rd.completedAt = Date.now(); }
                    // Идемпотентно: раунд, уже записанный в историю, повторно
                    // не удваивается.
                    return pestovoClaimRoundHistory(rid);
                })
                .then(function(claimed) {
                    if (!claimed) return false;
                    if (typeof saveHistory === 'function') { try { saveHistory(rid, rd); } catch (e) {} }
                    return true;
                })
                .catch(function() { return false; });
        })).then(function(res) {
            out.closed = res.filter(function(x) { return x; }).length;
            return out;
        });
    }).catch(function() { return out; });
}

// Все раунды турнира: и те, где записан tournamentId, и те, что пришли из
// протокола групп (у части старых записей tournamentId отсутствует).
function pestovoTournamentRoundIdsFull(tnId) {
    if (typeof db === 'undefined' || !db) return Promise.resolve([]);
    var found = {};
    return db.ref('protocols').once('value').catch(function() { return null; }).then(function(psn) {
        var protocols = (psn && psn.val()) || {};
        var protoIds = [];
        Object.keys(protocols).forEach(function(pid) {
            var p = protocols[pid];
            if (p && (p.tournamentId === tnId || p.tnId === tnId)) protoIds.push(pid);
        });
        return db.ref('rounds').orderByChild('tournamentId').equalTo(tnId).once('value').then(function(sn) {
            var rounds = (sn && sn.val()) || {};
            Object.keys(rounds).forEach(function(rid) { found[rid] = true; });
            if (!protoIds.length) return null;
            return Promise.all(protoIds.map(function(pid) {
                return db.ref('rounds').orderByChild('protocolId').equalTo(pid).once('value').then(function(s2) {
                    var rr = (s2 && s2.val()) || {};
                    Object.keys(rr).forEach(function(rid) { found[rid] = true; });
                }).catch(function() {});
            }));
        });
    }).then(function() { return Object.keys(found); }).catch(function() { return Object.keys(found); });
}

// Удаляет раунд из истории всех его игроков и пересчитывает статистику
// (roundsPlayed / bestGross / bestStableford) по оставшимся раундам.
// Аккаунты, у которых истории нет (гостевые id), не создаём.
function pestovoRemoveRoundFromPlayers(rid, players) {
    if (typeof db === 'undefined' || !db) return Promise.resolve(0);
    var pids = Object.keys(players || {});
    if (!pids.length) return Promise.resolve(0);
    var touched = 0;
    return Promise.all(pids.map(function(pid) {
        return db.ref('users/' + pid).once('value').then(function(sn) {
            var u = sn.val();
            if (!u || !u.history) return null;
            var hist = u.history;
            var updates = {};
            var remaining = [];
            var hit = false;
            Object.keys(hist).forEach(function(hk) {
                var item = hist[hk];
                if (!item) return;
                if (item.roundId === rid) { updates['users/' + pid + '/history/' + hk] = null; hit = true; }
                else remaining.push(item);
            });
            if (!hit) return null;
            var bestG = null, bestS = null;
            remaining.forEach(function(item) {
                if (item.holes === 18 && item.gross) {
                    if (bestG === null || item.gross < bestG) bestG = item.gross;
                }
                if (item.holes === 18 && item.stablefordField) {
                    if (bestS === null || item.stablefordField > bestS) bestS = item.stablefordField;
                }
            });
            touched++;
            updates['users/' + pid + '/roundsPlayed'] = remaining.length;
            updates['users/' + pid + '/bestGross'] = bestG;
            updates['users/' + pid + '/bestStableford'] = bestS;
            return db.ref().update(updates).catch(function() {});
        }).catch(function() { return null; });
    })).then(function() { return touched; });
}

// Публичная обёртка для кнопки «Завершить» в админке.
function pestovoPreserveTournamentRounds(tnId) {
    return pestovoFinalizeTournamentRounds(tnId, 'complete').then(function(res) { return res.closed; });
}

// Публичная обёртка для кнопки «Удалить»: раунды + их влияние на историю.
function pestovoDeleteTournamentRounds(tnId) {
    return pestovoFinalizeTournamentRounds(tnId, 'delete');
}

// Полный каскад удаления турнира: раунды (и их влияние на историю игроков) →
// протоколы групп → карточка турнира → маркеры. Возвращает Promise со сводкой
// { rounds, protocols }, чтобы админ видел, что именно было удалено.
function pestovoDeleteTournamentCascade(tnId) {
    var summary = { rounds: 0, protocols: 0 };
    if (!tnId || typeof db === 'undefined' || !db) return Promise.resolve(summary);
    return pestovoDeleteTournamentRounds(tnId).then(function(res) {
        summary.rounds = (res && res.rounds) || 0;
        summary.players = (res && res.players) || 0;
        return db.ref('protocols').once('value').catch(function() { return null; });
    }).then(function(sn) {
        var protocols = (sn && sn.val()) || {};
        var updates = {};
        var n = 0;
        Object.keys(protocols).forEach(function(pid) {
            var p = protocols[pid];
            if (p && (p.tournamentId === tnId || p.tnId === tnId)) { updates['protocols/' + pid] = null; n++; }
        });
        summary.protocols = n;
        // Карточка турнира удаляется в ту же мульти-запись: если связь
        // оборвётся на середине, протоколы не останутся «висячими».
        updates['tournaments/' + tnId] = null;
        return db.ref().update(updates).catch(function() {});
    }).then(function() { return summary; });
}

// ==========================================
// АВТОЗАВЕРШЕНИЕ ТУРНИРА: ВСЕ РАУНДЫ СЫГРАНЫ
// ==========================================
// Турнир помечается «завершённым» не только вручную (кнопка «Финиш» в
// админке), но и автоматически: как только у турнира появляется хотя бы
// один раунд и ВСЕ его раунды в статусе completed (все игроки ввели
// счета и завершили игру) — статус турнира переводится в completed.
// Это открывает карточку турнира для экспорта протокола (PDF).
// Возвращает Promise<boolean> — стал ли турнир завершённым именно сейчас.
var __pestovoTnAutoFinishInFlight = {};
function pestovoAutoFinishTournament(tnId) {
    if (!tnId || typeof db === 'undefined' || !db) return Promise.resolve(false);
    if (__pestovoTnAutoFinishInFlight[tnId]) return Promise.resolve(false);
    __pestovoTnAutoFinishInFlight[tnId] = true;
    var done = function(v){ delete __pestovoTnAutoFinishInFlight[tnId]; return v; };
    return db.ref('rounds').orderByChild('tournamentId').equalTo(tnId).once('value').then(function(sn) {
        var rounds = (sn && sn.val()) || {};
        var ids = Object.keys(rounds);
        if (!ids.length) return done(false);
        var allDone = ids.every(function(rid) { return rounds[rid] && rounds[rid].status === 'completed'; });
        if (!allDone) return done(false);
        return db.ref('tournaments/' + tnId + '/status').once('value').then(function(stSn) {
            var st = stSn && stSn.val();
            if (st !== 'active') return done(false); // ещё не начинали или уже завершён
            return db.ref('tournaments/' + tnId).update({
                status: 'completed',
                finishedAt: Date.now(),
                finishedAutomatically: true
            }).then(function() {
                // Уведомление о завершении и о доступном протоколе — ТОЛЬКО
                // администратору: игроки не должны видеть служебное сообщение
                // о протоколе завершения (он нужен судейской коллегии).
                try {
                    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
                    if (pestovoIsAdminViewer() && typeof toast === 'function') toast(isEn
                        ? '🏁 All rounds completed — the tournament is finished automatically. The results protocol (PDF) is now available.'
                        : '🏁 Все раунды завершены — турнир завершён автоматически. Протокол результатов (PDF) теперь доступен.', 'success');
                } catch (e) {}
                return done(true);
            }).catch(function() { return done(false); });
        });
    }).catch(function() { return done(false); });
}

// Бейдж статуса завершённого раунда:
//  — авто-завершение: «Завершён автоматически»;
//  — обычное завершение: имя игрока, который завершил раунд;
//  — старые записи без данных о завершении: просто «Завершён».
function buildRoundCompletedBadgeHTML(r) {
    var isEn = (typeof currentLang !== 'undefined') && currentLang === 'en';
    if (r && r.autoCompleted) {
        return '<span class="tn-status tn-auto" title="' + (isEn ? 'The round was closed automatically the next day' : 'Раунд закрыт автоматически на следующий день') + '"><i class="fas fa-clock-rotate-left"></i> ' + (isEn ? 'Auto-completed' : 'Завершён автоматически') + '</span>';
    }
    var who = r && r.completedByName ? String(r.completedByName).trim() : '';
    if (who) {
        var shown = (typeof escapeHtml === 'function') ? escapeHtml(who) : who;
        return '<span class="tn-status tn-d"><i class="fas fa-user-check"></i> ' + (isEn ? 'Completed by ' : 'Завершил(а) · ') + shown + '</span>';
    }
    return '<span class="tn-status tn-d">' + (isEn ? 'Completed' : 'Завершён') + '</span>';
}


// ==========================================
// ГЛОБАЛЬНЫЕ ВАРИАНТЫ ОТОБРАЖЕНИЯ СТРАНИЦ
// ==========================================
// Администратор выбирает оформление один раз для всего клуба. Значение
// дублируется в localStorage только как офлайн-резерв, а Firebase остаётся
// источником истины для новых устройств. Вариант 1 — текущий вид страниц.
var PAGE_DISPLAY_VARIANTS = ['1', '2', '3'];
var PAGE_DISPLAY_VARIANT_CONFIG = {
    home: { storage: 'pestovo_home_display_variant', firebase: 'settings/home_display_variant' },
    players: { storage: 'pestovo_players_display_variant', firebase: 'settings/players_display_variant' },
    stats: { storage: 'pestovo_stats_display_variant', firebase: 'settings/stats_display_variant' },
    rounds: { storage: 'pestovo_all_rounds_display_variant', firebase: 'settings/all_rounds_display_variant' },
    guide: { storage: 'pestovo_guide_display_variant', firebase: 'settings/guide_display_variant' },
    feed: { storage: 'pestovo_feed_display_variant', firebase: 'settings/feed_display_variant' },
    predictor: { storage: 'pestovo_predictor_display_variant', firebase: 'settings/predictor_display_variant' },
    'order-of-merit': { storage: 'pestovo_oom_display_variant', firebase: 'settings/oom_display_variant' },
    tournaments: { storage: 'pestovo_tournaments_display_variant', firebase: 'settings/tournaments_display_variant' },
    handicap: { storage: 'pestovo_handicap_display_variant', firebase: 'settings/handicap_display_variant' },
    assistant: { storage: 'pestovo_assistant_display_variant', firebase: 'settings/assistant_display_variant' }
};

var pestovoPageDisplayVariants = (function() {
    var state = {};
    Object.keys(PAGE_DISPLAY_VARIANT_CONFIG).forEach(function(page) {
        var cfg = PAGE_DISPLAY_VARIANT_CONFIG[page];
        var value = '';
        try { value = localStorage.getItem(cfg.storage) || ''; } catch (e) {}
        state[page] = PAGE_DISPLAY_VARIANTS.indexOf(String(value)) !== -1 ? String(value) : '1';
    });
    return state;
})();

function normalizePageDisplayVariant(page, value) {
    return PAGE_DISPLAY_VARIANTS.indexOf(String(value === undefined || value === null ? '' : value)) !== -1
        ? String(value) : '1';
}

function getPageDisplayVariant(page) {
    return PAGE_DISPLAY_VARIANT_CONFIG[page] ? (pestovoPageDisplayVariants[page] || '1') : '1';
}

function applyPageDisplayVariant(page, value) {
    if (!PAGE_DISPLAY_VARIANT_CONFIG[page]) return '1';
    var variant = normalizePageDisplayVariant(page, value);
    pestovoPageDisplayVariants[page] = variant;
    try { localStorage.setItem(PAGE_DISPLAY_VARIANT_CONFIG[page].storage, variant); } catch (e) {}
    syncPageDisplayBodyClasses();

    // Перерисовка выполняется только если соответствующая страница открыта.
    // Это позволяет менять оформление в админке без перезагрузки вкладки.
    try {
        if (page === 'players' && typeof loadPlayers === 'function' && document.getElementById('players-grid')) loadPlayers();
        if (page === 'stats' && typeof loadStats === 'function' && document.getElementById('general-stats')) loadStats();
        if (page === 'rounds' && typeof loadLB === 'function' && document.getElementById('lb-container')) loadLB();
    } catch (e) {}
    try {
        if (typeof markAdmPageDisplayVariantButtons === 'function') markAdmPageDisplayVariantButtons(page);
    } catch (e) {}
    return variant;
}

// Синхронизирует CSS-классы вида «pd-<страница>-v2/v3» на <body>.
// Варианты большинства страниц реализованы чисто на CSS, поэтому переключение
// класса мгновенно меняет оформление без перерендера данных. Вариант «1»
// сохраняет исходный вид (классов нет).
function syncPageDisplayBodyClasses() {
    if (typeof document === 'undefined' || !document.body) return;
    try {
        Object.keys(PAGE_DISPLAY_VARIANT_CONFIG).forEach(function(page) {
            var cur = getPageDisplayVariant(page);
            ['2', '3'].forEach(function(v) {
                document.body.classList.toggle('pd-' + page + '-v' + v, cur === v);
            });
        });
    } catch (e) {}
}

function normalizePlayersDisplayVariant(value) { return normalizePageDisplayVariant('players', value); }
function getPlayersDisplayVariant() { return getPageDisplayVariant('players'); }
function applyPlayersDisplayVariant(value) { return applyPageDisplayVariant('players', value); }
function normalizeStatsDisplayVariant(value) { return normalizePageDisplayVariant('stats', value); }
function getStatsDisplayVariant() { return getPageDisplayVariant('stats'); }
function applyStatsDisplayVariant(value) { return applyPageDisplayVariant('stats', value); }
function normalizeAllRoundsDisplayVariant(value) { return normalizePageDisplayVariant('rounds', value); }
function getAllRoundsDisplayVariant() { return getPageDisplayVariant('rounds'); }
function applyAllRoundsDisplayVariant(value) { return applyPageDisplayVariant('rounds', value); }
function normalizeHomeDisplayVariant(value) { return normalizePageDisplayVariant('home', value); }
function getHomeDisplayVariant() { return getPageDisplayVariant('home'); }
function applyHomeDisplayVariant(value) { return applyPageDisplayVariant('home', value); }
function getGuideDisplayVariant() { return getPageDisplayVariant('guide'); }
function getFeedDisplayVariant() { return getPageDisplayVariant('feed'); }
function getPredictorDisplayVariant() { return getPageDisplayVariant('predictor'); }
function getOomDisplayVariant() { return getPageDisplayVariant('order-of-merit'); }
function getTournamentsDisplayVariant() { return getPageDisplayVariant('tournaments'); }
function getHandicapDisplayVariant() { return getPageDisplayVariant('handicap'); }
function getAssistantDisplayVariant() { return getPageDisplayVariant('assistant'); }

// Применяем выбранные варианты сразу (скрипт подключён в конце <body>),
// чтобы страница не «мигала» исходным оформлением при загрузке.
try { syncPageDisplayBodyClasses(); } catch (e) {}
document.addEventListener('DOMContentLoaded', function() { syncPageDisplayBodyClasses(); });

// ==========================================
// PNG-КАРТОЧКИ ДЛЯ СОЦСЕТЕЙ
// ==========================================
// Оформление выбирается администратором для всего клуба. Значение держим и
// локально, чтобы экспорт продолжал работать в офлайне.
var SOCIAL_CARD_VARIANTS = ['1', '2', '3'];

function normalizeSocialCardVariant(value) {
    value = String(value === undefined || value === null ? '' : value);
    return SOCIAL_CARD_VARIANTS.indexOf(value) !== -1 ? value : '1';
}

var pestovoSocialCardVariant = (function() {
    try { return normalizeSocialCardVariant(localStorage.getItem('pestovo_social_card_variant')); } catch (e) {}
    return '1';
})();

function getSocialCardVariant() {
    return pestovoSocialCardVariant;
}

function applySocialCardVariant(value) {
    var variant = normalizeSocialCardVariant(value);
    pestovoSocialCardVariant = variant;
    try { localStorage.setItem('pestovo_social_card_variant', variant); } catch (e) {}
    try {
        if (typeof markAdmSocialCardVariantButtons === 'function') markAdmSocialCardVariantButtons();
    } catch (e) {}
    return variant;
}

// ==========================================
// ОТОБРАЖЕНИЕ КАРТОЧКИ ГРУППОВОГО РАУНДА
// ==========================================
// Стиль единой карточки группового раунда на главной странице.
// Варианты: '1' - Сводная матрица, '2' - Сравнительная таблица, '3' - Лидерборд флайта
var GROUP_CARD_VARIANTS = ['1', '2', '3'];

function normalizeGroupCardVariant(value) {
    value = String(value === undefined || value === null ? '' : value);
    return GROUP_CARD_VARIANTS.indexOf(value) !== -1 ? value : '1';
}

var pestovoGroupCardVariant = (function() {
    try { return normalizeGroupCardVariant(localStorage.getItem('pestovo_group_card_variant')); } catch (e) {}
    return '1';
})();

function getGroupCardVariant() {
    return pestovoGroupCardVariant;
}

function applyGroupCardVariant(value) {
    var variant = normalizeGroupCardVariant(value);
    pestovoGroupCardVariant = variant;
    try { localStorage.setItem('pestovo_group_card_variant', variant); } catch (e) {}
    try {
        if (typeof markAdmGroupCardVariantButtons === 'function') markAdmGroupCardVariantButtons();
    } catch (e) {}
    try {
        if (typeof loadLiveRounds === 'function') loadLiveRounds();
        if (typeof loadRecentResults === 'function') loadRecentResults();
    } catch (e) {}
    return variant;
}

// ==========================================
// СЧЁТНАЯ КАРТОЧКА ИГРОКА В ЛИДЕРБОРДЕ ТУРНИРА
// ==========================================
// На странице «Турниры» клик по игроку в лидерборде открывает его счётную
// карточку. Оформление выбирает администратор для всего клуба
// (админ-панель → «Данные»): 1 · Официальный бланк, 2 · Плитки лунок,
// 3 · Турнирная сводка. Хранится в settings/tn_scorecard_variant.
var TN_CARD_VARIANTS = ['1', '2', '3'];

function normalizeTnCardVariant(value) {
    value = String(value === undefined || value === null ? '' : value);
    return TN_CARD_VARIANTS.indexOf(value) !== -1 ? value : '1';
}

var pestovoTnCardVariant = (function() {
    try { return normalizeTnCardVariant(localStorage.getItem('pestovo_tn_scorecard_variant')); } catch (e) {}
    return '1';
})();

function getTnCardVariant() {
    return pestovoTnCardVariant;
}

function applyTnCardVariant(value) {
    var variant = normalizeTnCardVariant(value);
    pestovoTnCardVariant = variant;
    try { localStorage.setItem('pestovo_tn_scorecard_variant', variant); } catch (e) {}
    try {
        if (typeof markAdmTnCardVariantButtons === 'function') markAdmTnCardVariantButtons();
    } catch (e) {}
    // Открытая карточка/лидерборд перерисовываются сразу — админ видит
    // результат без перезагрузки страницы.
    try {
        if (typeof tnScRerender === 'function') tnScRerender();
        if (typeof rerenderOpenTnLeaderboards === 'function') rerenderOpenTnLeaderboards();
    } catch (e) {}
    return variant;
}

// ==========================================
// ЛИДЕРБОРД ТУРНИРА — 5 вариантов (требование #7)
// ==========================================
// На странице «Турниры» live-лидерборд турнира может отображаться 5 способами.
// Выбор делает только админ (админ-панель → «Данные» → вид лидерборда турнира),
// хранится в settings/tournament_leaderboard_variant, применяется для всех.
var TN_LB_VARIANTS = ['1', '2', '3', '4', '5'];

function normalizeTnLbVariant(value) {
    value = String(value === undefined || value === null ? '' : value);
    return TN_LB_VARIANTS.indexOf(value) !== -1 ? value : '1';
}

var pestovoTnLbVariant = (function() {
    try { return normalizeTnLbVariant(localStorage.getItem('pestovo_tn_lb_variant')); } catch (e) {}
    return '1';
})();

function getTnLbVariant() {
    return pestovoTnLbVariant;
}

function applyTnLbVariant(value) {
    var variant = normalizeTnLbVariant(value);
    pestovoTnLbVariant = variant;
    try { localStorage.setItem('pestovo_tn_lb_variant', variant); } catch (e) {}
    try {
        if (typeof markAdmTnLbVariantButtons === 'function') markAdmTnLbVariantButtons();
    } catch (e) {}
    try {
        if (typeof rerenderOpenTnLeaderboards === 'function') rerenderOpenTnLeaderboards();
    } catch (e) {}
    return variant;
}

// ==========================================
// ГРУППЫ НА СТРАНИЦЕ ТУРНИРОВ (вкл/выкл для всех)
// ==========================================
// По умолчанию дивизионы/гандикапные группы игрокам НЕ показываются:
// на активном турнире сразу открывается лидерборд. Включает только админ
// (settings/tn_groups_visible).
// По умолчанию группы видны (поведение до появления настройки);
// админ может полностью скрыть их переключателем (хранится '0').
var pestovoTnGroupsVisible = true;
try {
    var pestovoTnGroupsStored = localStorage.getItem('pestovo_tn_groups_visible');
    if (pestovoTnGroupsStored !== null) pestovoTnGroupsVisible = pestovoTnGroupsStored === '1';
} catch (e) {}

function getTnGroupsVisible() { return !!pestovoTnGroupsVisible; }
function applyTnGroupsVisible(v) {
    pestovoTnGroupsVisible = (v === true || v === '1' || v === 1);
    try { localStorage.setItem('pestovo_tn_groups_visible', pestovoTnGroupsVisible ? '1' : '0'); } catch (e) {}
    try { if (typeof markAdmTnGroupsVisible === 'function') markAdmTnGroupsVisible(); } catch (e) {}
    try { if (typeof tnRenderList === 'function') tnRenderList(); } catch (e) {}
    try { if (typeof rerenderOpenTnLeaderboards === 'function') rerenderOpenTnLeaderboards(); } catch (e) {}
    return pestovoTnGroupsVisible;
}

// ==========================================
// 4 ВАРИАНТА СПИСКА УЧАСТНИКОВ/ГРУПП (settings/tn_roster_variant)
// ==========================================
var TN_ROSTER_VARIANTS = ['1', '2', '3', '4'];
function normalizeTnRosterVariant(v) {
    v = String(v === undefined || v === null ? '' : v);
    return TN_ROSTER_VARIANTS.indexOf(v) !== -1 ? v : '1';
}
var pestovoTnRosterVariant = '1';
try { pestovoTnRosterVariant = normalizeTnRosterVariant(localStorage.getItem('pestovo_tn_roster_variant')); } catch (e) {}
function getTnRosterVariant() { return pestovoTnRosterVariant; }
function applyTnRosterVariant(v) {
    pestovoTnRosterVariant = normalizeTnRosterVariant(v);
    try { localStorage.setItem('pestovo_tn_roster_variant', pestovoTnRosterVariant); } catch (e) {}
    try { if (typeof markAdmTnRosterVariantButtons === 'function') markAdmTnRosterVariantButtons(); } catch (e) {}
    try { if (typeof tnRenderList === 'function') tnRenderList(); } catch (e) {}
    return pestovoTnRosterVariant;
}

// ─────────────────────────────────────────────────────────
// АДМИНСКИЕ ВИДЫ ОТОБРАЖЕНИЯ (5 вариантов, выбирает только админ)
//   homeTournament — блок «Активный турнир» на главной;
//   scorecard      — счётная карточка по лункам во время раунда;
//   scoring        — страница ввода счёта (одиночный и групповой раунд).
// Хранение: settings/<key> в Firebase + кэш в localStorage, применяется
// для ВСЕХ пользователей (читается при загрузке страницы).
// ─────────────────────────────────────────────────────────
var PESTOVO_VIEW5_KEYS = ['1', '2', '3', '4', '5'];
var PESTOVO_VIEW5_CONFIG = {
    homeTournament: { storage: 'pestovo_home_tournament_view', firebase: 'settings/home_tournament_view' },
    scorecard:      { storage: 'pestovo_scorecard_view',       firebase: 'settings/scorecard_view' },
    scoring:        { storage: 'pestovo_scoring_view',         firebase: 'settings/scoring_view' }
};

function normalizeView5(value) {
    value = String(value === undefined || value === null ? '' : value);
    return PESTOVO_VIEW5_KEYS.indexOf(value) !== -1 ? value : '1';
}

var pestovoView5State = (function() {
    var st = {};
    Object.keys(PESTOVO_VIEW5_CONFIG).forEach(function(k) {
        var v = '';
        try { v = localStorage.getItem(PESTOVO_VIEW5_CONFIG[k].storage) || ''; } catch (e) {}
        st[k] = normalizeView5(v);
    });
    return st;
})();

function getView5(name) {
    return PESTOVO_VIEW5_CONFIG[name] ? (pestovoView5State[name] || '1') : '1';
}

function applyView5(name, value) {
    if (!PESTOVO_VIEW5_CONFIG[name]) return '1';
    var v = normalizeView5(value);
    pestovoView5State[name] = v;
    try { localStorage.setItem(PESTOVO_VIEW5_CONFIG[name].storage, v); } catch (e) {}
    try { syncView5BodyClasses(); } catch (e) {}
    try { if (typeof markAdmView5Buttons === 'function') markAdmView5Buttons(name); } catch (e) {}
    return v;
}

// CSS-классы на <body>: st-scoring-v2 … st-scorecard-v5 — варианты
// оформления применяются мгновенно, без перезагрузки страницы.
function syncView5BodyClasses() {
    if (typeof document === 'undefined' || !document.body) return;
    try {
        Object.keys(PESTOVO_VIEW5_CONFIG).forEach(function(name) {
            var cur = getView5(name);
            PESTOVO_VIEW5_KEYS.forEach(function(v) {
                if (v === '1') return;
                document.body.classList.toggle('st-' + name + '-v' + v, cur === v);
            });
        });
    } catch (e) {}
}

// Живая подписка на значение из Firebase: вызывается страницами при старте.
// cb вызывается и когда настройки нет (значение по умолчанию «1»).
function pestovoBindView5(name, cb) {
    var cfg = PESTOVO_VIEW5_CONFIG[name];
    if (!cfg) return;
    var fire = function(val) { try { cb(applyView5(name, val)); } catch (e) {} };
    if (typeof db === 'undefined' || !db) { fire(null); return; }
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('view5-' + name, db.ref(cfg.firebase), function(sn) { fire(sn.val()); });
    } else {
        db.ref(cfg.firebase).once('value').then(function(sn) { fire(sn.val()); }).catch(function() { fire(null); });
    }
}

function getHomeTournamentView() { return getView5('homeTournament'); }
function getRoundScorecardView() { return getView5('scorecard'); }
function getScoringView() { return getView5('scoring'); }

if (typeof window !== 'undefined') {
    window.getView5 = getView5;
    window.applyView5 = applyView5;
    window.normalizeView5 = normalizeView5;
    window.pestovoBindView5 = pestovoBindView5;
    window.syncView5BodyClasses = syncView5BodyClasses;
    window.getHomeTournamentView = getHomeTournamentView;
    window.getRoundScorecardView = getRoundScorecardView;
    window.getScoringView = getScoringView;
}

// QR-картинка с цепочкой провайдеров (основной → запасной → повтор):
// внешний сервис иногда отдаёт таймаут — тогда код автоматически
// перегружается с другого провайдера, «пустых» QR у игроков не остаётся.
function pestovoQrImgHtml(data, size, cls) {
    size = size || 200;
    var urls = [
        'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=2&data=' + encodeURIComponent(data),
        'https://quickchart.io/qr?size=' + size + '&margin=1&text=' + encodeURIComponent(data),
        'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=2&color=111111&bgcolor=ffffff&data=' + encodeURIComponent(data)
    ];
    return '<img src="' + urls[0] + '" data-qr-src="' + encodeURIComponent(data) + '" data-qr-try="0"' +
        (cls ? ' class="' + cls + '"' : '') + ' alt="QR" loading="eager" decoding="async"' +
        ' onload="pestovoQrImgOk(this)" onerror="pestovoQrImgFail(this)">';
}
function pestovoQrImgOk(img) {
    try { img.setAttribute('data-qr-done', '1'); } catch (e) {}
}
function pestovoQrImgFail(img) {
    var n = 0;
    try { n = parseInt(img.getAttribute('data-qr-try') || '0', 10) || 0; } catch (e) {}
    var data = '';
    try { data = decodeURIComponent(img.getAttribute('data-qr-src') || ''); } catch (e) {}
    var urls = [
        'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=2&data=' + encodeURIComponent(data),
        'https://quickchart.io/qr?size=200&margin=1&text=' + encodeURIComponent(data),
        'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=2&color=111111&bgcolor=ffffff&data=' + encodeURIComponent(data)
    ];
    if (data && n + 1 < urls.length) {
        try {
            img.setAttribute('data-qr-try', String(n + 1));
            img.src = urls[n + 1];
        } catch (e) {}
    }
}
if (typeof window !== 'undefined') {
    window.pestovoQrImgHtml = pestovoQrImgHtml;
    window.pestovoQrImgOk = pestovoQrImgOk;
    window.pestovoQrImgFail = pestovoQrImgFail;
}

// Предзагрузка QR-картинок в кэш браузера: вызывается сразу после создания
// группового раунда, чтобы коды были готовы к сканированию мгновенно.
function pestovoPrewarmQrImages(urls) {
    (urls || []).forEach(function(u) {
        try {
            var im = new Image();
            im.onload = function() {};
            im.onerror = function() {};
            im.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=2&data=' + encodeURIComponent(u);
        } catch (e) {}
    });
}
if (typeof window !== 'undefined') window.pestovoPrewarmQrImages = pestovoPrewarmQrImages;

// Логотип нужен только как обычный элемент шапки — фон PNG намеренно остаётся
// чистым, без водяного знака.
var pestovoCardLogoImg = null;
var pestovoCardLogoLoaded = false;
function loadPestovoCardLogo() {
    return new Promise(function(resolve) {
        if (pestovoCardLogoLoaded) { resolve(pestovoCardLogoImg); return; }
        try {
            var img = new Image();
            img.onload = function() {
                pestovoCardLogoImg = img;
                pestovoCardLogoLoaded = true;
                resolve(img);
            };
            img.onerror = function() {
                pestovoCardLogoLoaded = true;
                pestovoCardLogoImg = null;
                resolve(null);
            };
            img.src = baseUrl() + 'img/logo.png';
        } catch (e) {
            pestovoCardLogoLoaded = true;
            resolve(null);
        }
    });
}

function drawSocialCardFrame(ctx, variant) {
    // Чистый фон без логотипа: это сохраняет контраст счёта и делает карточку
    // аккуратной в лентах соцсетей.
    var bgGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
    bgGrad.addColorStop(0, variant === '2' ? '#152e1a' : '#0b1a0e');
    bgGrad.addColorStop(0.5, '#132817');
    bgGrad.addColorStop(1, '#071209');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 8;
    ctx.strokeRect(30, 30, 1020, 1020);
    ctx.strokeStyle = 'rgba(201,168,76,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, 996, 996);
}

function drawCardForegroundLogo(ctx, img, cx, cy, maxW, maxH) {
    if (!img || !img.width || !img.height) return;
    var scale = Math.min(maxW / img.width, maxH / img.height);
    var w = img.width * scale;
    var h = img.height * scale;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
}

function drawFittedCanvasText(ctx, text, x, y, maxWidth, size, minSize, fontFamily) {
    text = String(text === undefined || text === null ? '' : text);
    var currentSize = size;
    var family = fontFamily || '"Inter", sans-serif';
    ctx.font = 'bold ' + currentSize + 'px ' + family;
    while (currentSize > minSize && ctx.measureText(text).width > maxWidth) {
        currentSize -= 2;
        ctx.font = 'bold ' + currentSize + 'px ' + family;
    }
    if (ctx.measureText(text).width > maxWidth) {
        while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) {
            text = text.slice(0, -1);
        }
        text += '…';
    }
    ctx.fillText(text, x, y);
}

function drawSocialCardHeader(ctx, data, cfg) {
    cfg = cfg || {};
    var isEn = typeof currentLang !== 'undefined' && currentLang === 'en';
    var label = cfg.label || (isEn ? 'LIVE SCORECARD' : 'СЧЁТНАЯ КАРТОЧКА');
    var meta = data.format + ' · ' + (isEn ? 'TEE' : 'ТИ') + ': ' + data.teeName + ' · HCP: ' + data.hcp;

    // Небольшой логотип расположен непосредственно над именем, а не в фоне.
    drawCardForegroundLogo(ctx, data.logoImg, 540, cfg.logoY || 142, 165, 110);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#c9a84c';
    ctx.font = '700 17px "Inter", sans-serif';
    ctx.fillText(label, 540, cfg.labelY || 78);

    var dividerY = cfg.dividerY || 222;
    ctx.beginPath();
    ctx.moveTo(250, dividerY);
    ctx.lineTo(830, dividerY);
    ctx.strokeStyle = 'rgba(201,168,76,0.78)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Имя начинается заметно ниже, чем в прежней карточке: под знаком клуба.
    ctx.fillStyle = '#ffffff';
    drawFittedCanvasText(ctx, data.playerName, 540, cfg.nameY || 286, 880, 48, 30, '"Playfair Display", Georgia, serif');

    ctx.fillStyle = '#c9a84c';
    ctx.font = '600 18px "Inter", sans-serif';
    drawFittedCanvasText(ctx, meta, 540, cfg.metaY || 324, 900, 18, 13, '"Inter", sans-serif');

    ctx.fillStyle = '#9eb5a5';
    ctx.font = '500 16px "Inter", sans-serif';
    ctx.fillText(data.date, 540, cfg.dateY || 350);
}

function drawSocialCardTotalBar(ctx, outGross, inGross, totalGross, y) {
    y = y || 870;
    ctx.fillStyle = '#101f13';
    ctx.fillRect(60, y, 960, 50);
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 1;
    ctx.strokeRect(60, y, 960, 50);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 18px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OUT: ' + (outGross || '—') + '   ·   IN: ' + (inGross || '—') + '   ·   TOTAL 18: ' + (totalGross || '—'), 540, y + 32);
}

function drawSocialCardFooter(ctx, variant) {
    ctx.textAlign = 'center';
    ctx.fillStyle = variant === '2' ? 'rgba(201,168,76,0.88)' : 'rgba(201,168,76,0.65)';
    ctx.font = '600 17px "Inter", sans-serif';
    ctx.fillText('GOLF CLUB PESTOVO · LIVE SCORING', 540, 996);
}

function drawSocialCardResultHero(ctx, stats) {
    ctx.fillStyle = '#132218';
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(60, 376, 960, 142, 16);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#9eb5a5';
    ctx.font = '700 15px "Inter", sans-serif';
    ctx.fillText('GROSS', 240, 416);
    ctx.fillText('STABLEFORD', 840, 416);
    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 42px "Inter", sans-serif';
    ctx.fillText(String(stats.gross || 0), 240, 470);
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(String(stats.stablefordField || 0), 840, 470);

    ctx.strokeStyle = 'rgba(201,168,76,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(380, 400);
    ctx.lineTo(380, 494);
    ctx.moveTo(700, 400);
    ctx.lineTo(700, 494);
    ctx.stroke();

    ctx.fillStyle = '#9eb5a5';
    ctx.font = '700 14px "Inter", sans-serif';
    ctx.fillText('TO PAR', 540, 414);
    ctx.fillStyle = stats.toPar < 0 ? '#2ecc71' : stats.toPar > 0 ? '#e05a4a' : '#ffffff';
    ctx.font = 'bold 58px "Playfair Display", Georgia, serif';
    ctx.fillText(fmtScore(stats.toPar), 540, 477);
}

function drawSocialCardLayout(ctx, data) {
    var variant = normalizeSocialCardVariant(data.variant);
    var scoreColor = data.stats.toPar < 0 ? '#2ecc71' : data.stats.toPar > 0 ? '#e05a4a' : '#ffffff';

    drawSocialCardFrame(ctx, variant);

    if (variant === '2') {
        drawSocialCardHeader(ctx, data, {
            label: typeof currentLang !== 'undefined' && currentLang === 'en' ? 'ROUND RESULT' : 'РЕЗУЛЬТАТ РАУНДА',
            nameY: 286, metaY: 324, dateY: 350
        });
        drawSocialCardResultHero(ctx, data.stats);
        drawScorecardGridRow(ctx, data.scores, 1, 9, 550);
        drawScorecardGridRow(ctx, data.scores, 10, 18, 738);
    } else if (variant === '3') {
        drawSocialCardHeader(ctx, data, {
            label: typeof currentLang !== 'undefined' && currentLang === 'en' ? 'TOURNAMENT SCORECARD' : 'ТУРНИРНАЯ КАРТОЧКА',
            nameY: 276, metaY: 342, dateY: 364
        });
        if (data.tournamentName) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#9eb5a5';
            drawFittedCanvasText(ctx, data.tournamentName, 540, 312, 860, 17, 13, '"Inter", sans-serif');
        }
        drawKPICard(ctx, 80, 388, 220, 108, 'TO PAR', fmtScore(data.stats.toPar), scoreColor);
        drawKPICard(ctx, 430, 388, 220, 108, 'GROSS', String(data.stats.gross || 0), '#c9a84c');
        drawKPICard(ctx, 780, 388, 220, 108, 'STABLEFORD', String(data.stats.stablefordField || 0), '#2ecc71');
        drawScorecardGridRow(ctx, data.scores, 1, 9, 530);
        drawScorecardGridRow(ctx, data.scores, 10, 18, 712);
        drawSocialCardTotalBar(ctx, data.outGross, data.inGross, data.totalGross, 875);
    } else {
        drawSocialCardHeader(ctx, data, { nameY: 286, metaY: 324, dateY: 350 });
        drawKPICard(ctx, 80, 376, 220, 108, 'TO PAR', fmtScore(data.stats.toPar), scoreColor);
        drawKPICard(ctx, 430, 376, 220, 108, 'GROSS', String(data.stats.gross || 0), '#c9a84c');
        drawKPICard(ctx, 780, 376, 220, 108, 'STABLEFORD', String(data.stats.stablefordField || 0), '#2ecc71');
        drawScorecardGridRow(ctx, data.scores, 1, 9, 518);
        drawScorecardGridRow(ctx, data.scores, 10, 18, 700);
        drawSocialCardTotalBar(ctx, data.outGross, data.inGross, data.totalGross, 870);
    }

    drawSocialCardFooter(ctx, variant);
}

function exportRoundPNG(roundId, playerId) {
    if (typeof db === 'undefined' || !roundId) return;

    toast(currentLang === 'en' ? '⏳ Generating PNG scorecard...' : '⏳ Генерируем PNG-карточку...', 'info');

    // Логотип рисуется компактно в шапке, непосредственно над именем игрока.
    loadPestovoCardLogo().then(function(logoImg) {
        db.ref('rounds/' + roundId).once('value').then(function(sn) {
            var r = sn.val();
            // PNG/социальная карточка разрешена только для завершённого раунда.
            // Проверка остаётся и в UI, и здесь — прямой вызов функции не должен
            // позволить поделиться незавершённым результатом.
            if (!r || r.status !== 'completed' || !r.players) {
                toast(currentLang === 'en'
                    ? 'A social scorecard is available after the round is completed.'
                    : 'Поделиться карточкой можно только после завершения раунда.', 'info');
                return;
            }

            var playersList = Object.entries(r.players);
            if (!playersList.length) return;
            var pid = playerId || playersList[0][0];
            if (!r.players[pid]) pid = playersList[0][0];
            var p = r.players[pid];
            if (!p) return;

            var canvas = document.createElement('canvas');
            canvas.width = 1080;
            canvas.height = 1080;
            var ctx = canvas.getContext('2d');
            var scores = p.scores || {};
            var order = getRoundOrder(r);
            var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, order);
            var outGross = 0, inGross = 0;
            for (var i = 1; i <= 9; i++) {
                var frontScore = parseInt(scores[i]) || 0;
                if (frontScore > 0) outGross += frontScore;
            }
            for (var j = 10; j <= 18; j++) {
                var backScore = parseInt(scores[j]) || 0;
                if (backScore > 0) inGross += backScore;
            }

            var teeName = t('tee_' + ((p && p.tee) || r.tee || 'wh'));
            drawSocialCardLayout(ctx, {
                variant: getSocialCardVariant(),
                logoImg: logoImg,
                playerName: playerDisplayName(p, pid),
                format: pestovoRoundFormatBadge(r, 'Stroke Play'),
                teeName: teeName,
                hcp: fmtExactHcp(p.exactHcp),
                date: fmtDate(r.completedAt || r.createdAt || Date.now()),
                tournamentName: r.tournamentName || '',
                scores: scores,
                stats: stats,
                outGross: outGross,
                inGross: inGross,
                totalGross: outGross + inGross
            });

            var dataUrl = canvas.toDataURL('image/png');
            openPNGExportModal(dataUrl, playerDisplayName(p, pid), roundId, pid, playersList);
        }).catch(function(error) {
            console.warn('[PNG] Cannot load round for export', error);
            toast(currentLang === 'en' ? 'Could not generate the PNG scorecard' : 'Не удалось сформировать PNG-карточку', 'error');
        });
    });
}

function drawKPICard(ctx, x, y, w, h, label, value, valColor) {
    // Непрозрачная подложка сохраняет KPI контрастными на чистом фоне.
    ctx.fillStyle = '#132218';
    ctx.strokeStyle = '#1e3525';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#9eb5a5';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + 32);

    ctx.fillStyle = valColor || '#ffffff';
    ctx.font = 'bold 38px "Inter", sans-serif';
    ctx.fillText(value, x + w / 2, y + 84);
}

function drawScorecardGridRow(ctx, scores, startHole, endHole, startY) {
    var startX = 60;
    var labelW = 110;
    var holeW = 85;
    var totW = 85;
    var row1H = 36;
    var row2H = 36;
    var row3H = 65;

    // --- ROW 1: HOLE NUMBERS ---
    ctx.fillStyle = '#101f13';
    ctx.fillRect(startX, startY, labelW + holeW * 9 + totW, row1H);
    ctx.strokeStyle = '#1e3525';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, startY, labelW + holeW * 9 + totW, row1H);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(' HOLE', startX + 10, startY + 24);

    ctx.textAlign = 'center';
    var parSum = 0;
    for (var i = startHole; i <= endHole; i++) {
        var colX = startX + labelW + (i - startHole) * holeW;
        ctx.fillText(String(i), colX + holeW / 2, startY + 24);
        parSum += holePar(i);
    }
    var totX = startX + labelW + holeW * 9;
    ctx.fillText(startHole === 1 ? 'OUT' : 'IN', totX + totW / 2, startY + 24);

    // --- ROW 2: PAR ---
    var y2 = startY + row1H;
    ctx.fillStyle = 'rgba(46, 204, 113, 0.10)';
    ctx.fillRect(startX, y2, labelW + holeW * 9 + totW, row2H);
    ctx.strokeStyle = '#1e3525';
    ctx.strokeRect(startX, y2, labelW + holeW * 9 + totW, row2H);

    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(' PAR', startX + 10, y2 + 24);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    for (var i = startHole; i <= endHole; i++) {
        var colX = startX + labelW + (i - startHole) * holeW;
        ctx.fillText(String(holePar(i)), colX + holeW / 2, y2 + 24);
    }
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(String(parSum), totX + totW / 2, y2 + 24);

    // --- ROW 3: SCORE ---
    var y3 = y2 + row2H;
    ctx.fillStyle = '#132218';
    ctx.fillRect(startX, y3, labelW + holeW * 9 + totW, row3H);
    ctx.strokeStyle = '#1e3525';
    ctx.strokeRect(startX, y3, labelW + holeW * 9 + totW, row3H);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 16px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(' SCORE', startX + 10, y3 + 38);

    ctx.textAlign = 'center';
    var scoreSum = 0;
    for (var i = startHole; i <= endHole; i++) {
        var s = parseInt(scores[i]) || 0;
        var par = holePar(i);
        var colX = startX + labelW + (i - startHole) * holeW;

        if (s > 0) {
            scoreSum += s;
            var diff = s - par;
            var circleColor = '#132218';

            if (diff <= -2 || s === 1) circleColor = '#f39c12';
            else if (diff === -1) circleColor = '#2ecc71';
            else if (diff === 0) circleColor = '#2c3e50';
            else if (diff === 1) circleColor = '#5aade0';
            else circleColor = '#e05a4a';

            // Score Badge Circle
            ctx.fillStyle = circleColor;
            ctx.beginPath();
            ctx.arc(colX + holeW / 2, y3 + row3H / 2, 22, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px "Inter", sans-serif';
            ctx.fillText(String(s), colX + holeW / 2, y3 + row3H / 2 + 7);
        } else {
            ctx.fillStyle = '#3a523e';
            ctx.font = '18px "Inter", sans-serif';
            ctx.fillText('—', colX + holeW / 2, y3 + row3H / 2 + 6);
        }
    }

    ctx.fillStyle = scoreSum > 0 ? '#c9a84c' : '#3a523e';
    ctx.font = 'bold 22px "Inter", sans-serif';
    ctx.fillText(scoreSum > 0 ? String(scoreSum) : '—', totX + totW / 2, y3 + row3H / 2 + 7);
}

function drawHoleGridRow(ctx, scores, markerScores, startHole, endHole, startY) {
    var startX = 60;
    var cellW = 96;
    var cellH = 95;

    // Header Row
    ctx.fillStyle = '#101f13';
    ctx.fillRect(startX, startY, cellW * 10, 36);
    ctx.strokeStyle = '#1e3525';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, startY, cellW * 10, 36);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(startHole === 1 ? 'FRONT 9' : 'BACK 9', startX + cellW / 2, startY + 24);

    for (var i = startHole; i <= endHole; i++) {
        var colX = startX + (i - startHole + 1) * cellW;
        ctx.fillText(String(i), colX + cellW / 2, startY + 24);
    }

    // Scores Row
    var rowY = startY + 36;
    ctx.fillStyle = '#132218';
    ctx.fillRect(startX, rowY, cellW * 10, cellH);
    ctx.strokeRect(startX, rowY, cellW * 10, cellH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Inter", sans-serif';
    ctx.fillText('SCORE', startX + cellW / 2, rowY + 35);
    ctx.fillStyle = '#9b59b6';
    ctx.font = '12px "Inter", sans-serif';
    ctx.fillText('MARKER', startX + cellW / 2, rowY + 68);

    for (var i = startHole; i <= endHole; i++) {
        var s = parseInt(scores[i]) || 0;
        var ms = parseInt(markerScores[i]) || 0;
        var par = holePar(i);
        var colX = startX + (i - startHole + 1) * cellW;

        if (s > 0) {
            var diff = s - par;
            var circleColor = '#132218';

            if (diff <= -2 || s === 1) circleColor = '#f39c12';
            else if (diff === -1) circleColor = '#2ecc71';
            else if (diff === 0) circleColor = '#2c3e50';
            else if (diff === 1) circleColor = '#5aade0';
            else circleColor = '#e05a4a';

            // Top: Player Score Badge
            ctx.fillStyle = circleColor;
            ctx.beginPath();
            ctx.arc(colX + cellW / 2, rowY + 30, 20, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px "Inter", sans-serif';
            ctx.fillText(String(s), colX + cellW / 2, rowY + 37);

            // Bottom: Marker Score (With Strikethrough if Mismatch)
            if (ms > 0) {
                var isMatch = (ms === s);
                var mText = 'M: ' + ms;
                ctx.font = '13px "Inter", sans-serif';
                var textX = colX + cellW / 2;
                var textY = rowY + 74;

                if (isMatch) {
                    ctx.fillStyle = '#9b59b6';
                    ctx.fillText(mText, textX, textY);
                } else {
                    ctx.fillStyle = '#e05a4a';
                    ctx.fillText(mText, textX, textY);

                    // Draw Strikethrough line
                    var textW = ctx.measureText(mText).width;
                    ctx.beginPath();
                    ctx.moveTo(textX - textW / 2 - 2, textY - 4);
                    ctx.lineTo(textX + textW / 2 + 2, textY - 4);
                    ctx.strokeStyle = '#e05a4a';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }
            }
        } else {
            ctx.fillStyle = '#3a523e';
            ctx.font = '18px "Inter", sans-serif';
            ctx.fillText('—', colX + cellW / 2, rowY + 45);
        }
    }
}

function downloadPNGImage(pngDataUrl, fileName) {
    fileName = fileName || 'Pestovo_Scorecard.png';
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    var dataURLtoBlob = function(dataurl) {
        var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {type:mime});
    };

    var blob = null;
    try {
        blob = dataURLtoBlob(pngDataUrl);
    } catch(e) {}

    if (navigator.share && blob) {
        try {
            var file = new File([blob], fileName, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: 'Пестово Счётная Карточка',
                    text: 'Официальная карточка раунда'
                }).then(function() {
                    console.log('✅ Web Share succeeded');
                }).catch(function(err) {
                    if (err && err.name !== 'AbortError') {
                        fallbackIOSDownload(pngDataUrl, blob, fileName, isIOS);
                    }
                });
                return;
            }
        } catch (e) {
            console.warn('Web Share file error:', e);
        }
    }

    fallbackIOSDownload(pngDataUrl, blob, fileName, isIOS);
}

function fallbackIOSDownload(pngDataUrl, blob, fileName, isIOS) {
    if (isIOS) {
        var blobUrl = blob ? URL.createObjectURL(blob) : pngDataUrl;
        var win = window.open(blobUrl, '_blank');
        if (!win) {
            window.location.href = blobUrl;
        }
        toast(currentLang === 'en' ? '📱 Long press image and choose "Save to Photos"!' : '📱 Зажмите изображение пальцем и выберите «Сохранить в Фото»!', 'info');
    } else {
        var a = document.createElement('a');
        a.href = pngDataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast(currentLang === 'en' ? '✅ PNG Scorecard downloaded!' : '✅ PNG Карточка успешно скачана!', 'success');
    }
}

function openPNGExportModal(pngDataUrl, playerName, roundId, activePid, playersList) {
    var modalEl = document.getElementById('png-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'png-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closePNGModal()"></div>' +
            '<div class="modal-body" style="max-width:560px;text-align:center;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closePNGModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closePNGModal()">&times;</button>' +
            '</div>' +
            '<div id="png-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('png-modal-body');
    var fileName = 'Pestovo_' + (playerName || 'Card').replace(/\s+/g, '_') + '.png';

    var html = '<h2 style="color:var(--gold);margin-bottom:12px;"><i class="fas fa-image"></i> ' + t('share_card') + '</h2>';

    // Group Player Selector (If Group Round with >1 players)
    if (playersList && playersList.length > 1 && roundId) {
        html += '<div style="margin-bottom:16px;background:var(--input);padding:12px;border-radius:var(--rs);border:1px solid var(--border);">';
        html += '<label style="font-size:12px;color:var(--gold);display:block;margin-bottom:6px;font-weight:700;"><i class="fas fa-users"></i> ' + (currentLang === 'en' ? 'Select Group Player Card:' : 'Выберите карточку игрока группы:') + '</label>';
        html += '<select class="form-input" style="max-width:320px;margin:0 auto;text-align:center;font-weight:700;" onchange="exportRoundPNG(\'' + roundId + '\', this.value)">';
        playersList.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var sel = pid === activePid ? 'selected' : '';
            html += '<option value="' + pid + '" ' + sel + '>' + escapeHtml(playerDisplayName(p, pid)) + '</option>';
        });
        html += '</select></div>';
    }

    html += '<img src="' + pngDataUrl + '" alt="Pestovo Card" style="width:100%;max-width:440px;border-radius:12px;border:2px solid var(--gold);box-shadow:0 8px 32px rgba(0,0,0,0.5);margin-bottom:12px;">';
    html += '<p style="font-size:11px;color:var(--muted);margin-bottom:14px;"><i class="fas fa-mobile-screen-button"></i> ' + (currentLang === 'en' ? 'On iPhone / iPad: Tap button to Share or long-press image to Save to Photos' : 'На iPhone: нажмите кнопку для отправки или зажмите картинку пальцем для сохранения в Фото') + '</p>';

    html += '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">';
    html += '<button type="button" class="btn btn-g" style="flex:1;min-width:180px;" onclick="downloadPNGImage(\'' + pngDataUrl + '\', \'' + fileName + '\')"><i class="fas fa-download"></i> ' + t('download_png') + '</button>';

    if (navigator.share) {
        html += '<button type="button" class="btn btn-og" style="flex:1;min-width:180px;" onclick="downloadPNGImage(\'' + pngDataUrl + '\', \'' + fileName + '\')"><i class="fas fa-share-nodes"></i> ' + t('share_native') + '</button>';
    }
    html += '</div>';

    if (bodyEl) bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');
}

function closePNGModal() {
    var modalEl = document.getElementById('png-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function renderTrophyCabinet(u, rounds) {
    var totalEagles = 0, totalBirdies = 0, totalHIO = 0;
    (rounds || []).forEach(function(r) {
        if (r.eagles) totalEagles += r.eagles;
        if (r.birdies) totalBirdies += r.birdies;
        if (r.holeInOne) totalHIO += r.holeInOne;
    });

    var trophies = [];
    if (totalHIO > 0) trophies.push({ icon: '🎯', title: 'Hole-in-One', desc: 'Hole-in-One!' });
    if (totalEagles > 0) trophies.push({ icon: '🦅', title: 'Eagle Hunter', desc: totalEagles + ' Eagles' });
    if (totalBirdies >= 5) trophies.push({ icon: '🐦', title: 'Birdie Master', desc: totalBirdies + ' Birdies' });
    if (u.roundsPlayed >= 10) trophies.push({ icon: '👑', title: 'Century Player', desc: u.roundsPlayed + ' Rounds' });
    else if (u.roundsPlayed >= 1) trophies.push({ icon: '⛳', title: 'Pestovo Golfer', desc: u.roundsPlayed + ' Rounds' });

    if (!trophies.length) return '';

    var html = '<div class="trophy-cabinet" style="margin:16px 0;padding:12px;background:var(--input);border-radius:var(--rs);border:1px solid var(--border);">';
    html += '<div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:8px;text-transform:uppercase;"><i class="fas fa-award"></i> ' + (currentLang === 'en' ? 'Trophy Cabinet & Badges' : 'Витрина наград и достижений') + '</div>';
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
    trophies.forEach(function(tVal) {
        html += '<div class="trophy-badge" style="background:rgba(201,168,76,0.12);border:1px solid var(--gold);padding:6px 12px;border-radius:20px;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--white);">';
        html += '<span>' + tVal.icon + '</span><span>' + tVal.title + ' <small style="color:var(--muted);font-weight:400;">(' + tVal.desc + ')</small></span>';
        html += '</div>';
    });
    html += '</div></div>';
    return html;
}

function renderScoringDistributionBar(rounds) {
    var eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0;
    (rounds || []).forEach(function(r) {
        if (r.eagles) eagles += r.eagles;
        if (r.birdies) birdies += r.birdies;
        if (r.pars) pars += r.pars;
        if (r.bogeys) bogeys += r.bogeys;
        if (r.doubles) doubles += r.doubles;
    });

    var total = eagles + birdies + pars + bogeys + doubles;
    if (total === 0) return '';

    var pEag = Math.round((eagles / total) * 100);
    var pBir = Math.round((birdies / total) * 100);
    var pPar = Math.round((pars / total) * 100);
    var pBog = Math.round((bogeys / total) * 100);
    var pDbl = Math.round((doubles / total) * 100);

    var html = '<div class="scoring-dist-wrap" style="margin:16px 0;padding:12px;background:var(--input);border-radius:var(--rs);border:1px solid var(--border);">';
    html += '<div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:8px;text-transform:uppercase;"><i class="fas fa-chart-pie"></i> ' + (currentLang === 'en' ? 'Scoring Distribution' : 'Распределение результатов ударов') + '</div>';
    html += '<div style="height:12px;border-radius:6px;overflow:hidden;display:flex;background:var(--border);margin-bottom:8px;">';
    if (pEag > 0) html += '<div style="width:' + pEag + '%;background:#f39c12;" title="Eagle ' + pEag + '%"></div>';
    if (pBir > 0) html += '<div style="width:' + pBir + '%;background:#2ecc71;" title="Birdie ' + pBir + '%"></div>';
    if (pPar > 0) html += '<div style="width:' + pPar + '%;background:#555555;" title="Par ' + pPar + '%"></div>';
    if (pBog > 0) html += '<div style="width:' + pBog + '%;background:#5aade0;" title="Bogey ' + pBog + '%"></div>';
    if (pDbl > 0) html += '<div style="width:' + pDbl + '%;background:#e05a4a;" title="Double+ ' + pDbl + '%"></div>';
    html += '</div>';

    html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);flex-wrap:wrap;gap:6px;">';
    html += '<span style="color:#f39c12;">🦅 Eagle ' + pEag + '%</span>';
    html += '<span style="color:#2ecc71;">🐦 Birdie ' + pBir + '%</span>';
    html += '<span>⚪ Par ' + pPar + '%</span>';
    html += '<span style="color:#5aade0;">🔷 Bogey ' + pBog + '%</span>';
    html += '<span style="color:#e05a4a;">🟥 Dbl+ ' + pDbl + '%</span>';
    html += '</div></div>';

    return html;
}

function sharePNGNative(dataUrl, fileName) {
    fetch(dataUrl).then(function(res) { return res.blob(); }).then(function(blob) {
        var file = new File([blob], fileName || 'Pestovo_Card.png', { type: 'image/png' });
        if (navigator.share) {
            navigator.share({
                title: 'Pestovo Golf Scorecard',
                text: 'My score at Pestovo Golf Club!',
                files: [file]
            }).catch(function() {});
        }
    });
}

// ==========================================
// МЕНЮ ИНСТРУМЕНТОВ И ФУНКЦИЙ (TOOLS MENU)
// ==========================================
function openToolsMenu() {
    var modalEl = document.getElementById('tools-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'tools-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closeToolsModal()"></div>' +
            '<div class="modal-body" style="max-width:520px;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeToolsModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closeToolsModal()">&times;</button>' +
            '</div>' +
            '<div id="tools-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('tools-modal-body');
    if (!bodyEl) return;

    var isGps = localStorage.getItem('pestovo_gps_enabled') === '1';
    var isShotTrack = localStorage.getItem('pestovo_shot_tracking_enabled') === '1';

    var html = '<h2 style="color:var(--gold);margin-bottom:12px;"><i class="fas fa-toolbox"></i> ' + t('tools_title') + '</h2>';
    html += '<p style="font-size:13px;color:var(--muted);margin-bottom:20px;">' + (currentLang === 'en' ? 'Toggle optional features on/off or launch standalone tools:' : 'Включайте и выключайте отдельные функции или запускайте инструменты:') + '</p>';

    // Feature 1: GPS Rangefinder
    html += '<div class="list-item" style="padding:14px;margin-bottom:12px;flex-wrap:wrap;gap:10px;">';
    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-location-crosshairs" style="color:var(--gold);"></i> ' + t('gps_rangefinder') + '</strong>';
    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (currentLang === 'en' ? 'Live GPS distance in meters to green & club recommendation' : 'Точный расчёт дистанции в метрах до грина по GPS и рекомендация клюшки') + '</div></div>';
    html += '<div style="display:flex;gap:8px;align-items:center;">';
    html += '<button class="btn ' + (isGps ? 'btn-g' : 'btn-og') + ' btn-sm" onclick="toggleFeatureSetting(\'pestovo_gps_enabled\')">' + (isGps ? t('enabled_lbl') : t('disabled_lbl')) + '</button>';
    html += '<button class="btn btn-og btn-sm" onclick="openGPSRangefinderModal()"><i class="fas fa-expand"></i></button>';
    html += '</div></div>';

    // Feature 2: Shot Tracking
    html += '<div class="list-item" style="padding:14px;margin-bottom:12px;flex-wrap:wrap;gap:10px;">';
    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-chart-line" style="color:var(--gold);"></i> ' + t('shot_tracking') + '</strong>';
    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (currentLang === 'en' ? 'Record FIR (Fairway), GIR (Green) & Putts per hole' : 'Дополнительный ввод точности драйва, выхода на грин и числа паттов') + '</div></div>';
    html += '<div><button class="btn ' + (isShotTrack ? 'btn-g' : 'btn-og') + ' btn-sm" onclick="toggleFeatureSetting(\'pestovo_shot_tracking_enabled\')">' + (isShotTrack ? t('enabled_lbl') : t('disabled_lbl')) + '</button></div>';
    html += '</div>';

    // Feature 3: TV Broadcast Mode
    html += '<div class="list-item" style="padding:14px;margin-bottom:12px;flex-wrap:wrap;gap:10px;">';
    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-tv" style="color:var(--gold);"></i> ' + t('tv_mode') + '</strong>';
    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (currentLang === 'en' ? 'Fullscreen auto-scrolling leaderboard for Clubhouse TV panels' : 'Полноэкранная ТВ-трансляция для телевизоров в клубном доме') + '</div></div>';
    html += '<div><a href="tv.html" target="_blank" class="btn btn-g btn-sm"><i class="fas fa-desktop"></i> ' + (currentLang === 'en' ? 'Open TV Page' : 'Открыть ТВ') + '</a></div>';
    html += '</div>';

    // Feature 4: Head-to-Head 1v1
    html += '<div class="list-item" style="padding:14px;margin-bottom:12px;flex-wrap:wrap;gap:10px;">';
    html += '<div style="flex:1;min-width:180px;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-handshake-simple" style="color:var(--gold);"></i> ' + t('h2h_duel') + '</strong>';
    html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (currentLang === 'en' ? 'Compare stats and direct head-to-head match history between 2 players' : 'Прямое сравнение результатов двух игроков и история личных встреч') + '</div></div>';
    html += '<div><button class="btn btn-og btn-sm" onclick="closeToolsModal();openHeadToHeadModal();"><i class="fas fa-chart-column"></i> ' + (currentLang === 'en' ? 'Compare 1v1' : 'Сравнить 1v1') + '</button></div>';
    html += '</div>';

    bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');
}

function closeToolsModal() {
    var modalEl = document.getElementById('tools-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function toggleFeatureSetting(key) {
    var curr = localStorage.getItem(key) === '1';
    localStorage.setItem(key, curr ? '0' : '1');
    toast(curr ? (currentLang === 'en' ? 'Feature Disabled' : 'Функция выключена') : (currentLang === 'en' ? 'Feature Enabled ✅' : 'Функция включена ✅'), 'info');
    openToolsMenu();
    if (typeof renderPlayHole === 'function') renderPlayHole();
    if (typeof renderCurrentHole === 'function') renderCurrentHole();
}

// ==========================================
// FEATURE 1: GPS-ДАЛЬНОМЕР И РЕКОМЕНДАЦИЯ КЛЮШКИ
// ==========================================
const HOLE_GREENS = {
    1: { lat: 56.0912, lon: 37.6210 }, 2: { lat: 56.0925, lon: 37.6225 }, 3: { lat: 56.0938, lon: 37.6240 },
    4: { lat: 56.0918, lon: 37.6255 }, 5: { lat: 56.0905, lon: 37.6235 }, 6: { lat: 56.0892, lon: 37.6215 },
    7: { lat: 56.0880, lon: 37.6200 }, 8: { lat: 56.0872, lon: 37.6220 }, 9: { lat: 56.0895, lon: 37.6250 },
    10: { lat: 56.0910, lon: 37.6270 }, 11: { lat: 56.0928, lon: 37.6285 }, 12: { lat: 56.0945, lon: 37.6275 },
    13: { lat: 56.0952, lon: 37.6255 }, 14: { lat: 56.0935, lon: 37.6230 }, 15: { lat: 56.0920, lon: 37.6205 },
    16: { lat: 56.0902, lon: 37.6185 }, 17: { lat: 56.0885, lon: 37.6170 }, 18: { lat: 56.0898, lon: 37.6198 }
};

function calcGPSDistanceMeters(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

function suggestGolfClub(meters) {
    if (meters > 210) return 'Driver / 3-Wood';
    if (meters > 185) return '4-Hybrid / 4-Iron';
    if (meters > 170) return '5-Iron';
    if (meters > 155) return '6-Iron';
    if (meters > 140) return '7-Iron';
    if (meters > 125) return '8-Iron';
    if (meters > 110) return '9-Iron';
    if (meters > 90) return 'Pitching Wedge (PW)';
    if (meters > 70) return 'Gap Wedge (GW)';
    return 'Sand Wedge / Putter';
}

function openGPSRangefinderModal(holeNum) {
    holeNum = holeNum || (typeof playHole !== 'undefined' ? playHole : (typeof curHole !== 'undefined' ? curHole : 1));

    var modalEl = document.getElementById('gps-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'gps-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closeGPSModal()"></div>' +
            '<div class="modal-body" style="max-width:480px;text-align:center;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeGPSModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closeGPSModal()">&times;</button>' +
            '</div>' +
            '<div id="gps-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('gps-modal-body');
    if (!bodyEl) return;

    var green = HOLE_GREENS[holeNum] || HOLE_GREENS[1];

    var html = '<h2 style="color:var(--gold);margin-bottom:8px;"><i class="fas fa-location-crosshairs"></i> GPS Rangefinder</h2>';
    html += '<div style="font-size:16px;font-weight:700;color:var(--white);margin-bottom:16px;">' + t('hole') + ' #' + holeNum + ' (' + t('par') + ' ' + holePar(holeNum) + ')</div>';

    html += '<div id="gps-status-card" class="card" style="background:var(--input);padding:20px;border-color:var(--gold);margin-bottom:16px;">';
    html += '<div class="loading"><div class="spinner"></div><p style="margin-top:8px;font-size:13px;color:var(--muted);">' + (currentLang === 'en' ? 'Acquiring GPS position...' : 'Определяем GPS-координаты...') + '</p></div>';
    html += '</div>';

    html += '<div class="form-group"><label>' + t('hole') + ':</label><select class="form-input" style="max-width:200px;margin:0 auto;" onchange="openGPSRangefinderModal(parseInt(this.value))">';
    for (var i = 1; i <= 18; i++) {
        var sel = i === holeNum ? 'selected' : '';
        html += '<option value="' + i + '" ' + sel + '>' + t('hole') + ' #' + i + '</option>';
    }
    html += '</select></div>';

    bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            var userLat = pos.coords.latitude;
            var userLon = pos.coords.longitude;
            var distCenter = calcGPSDistanceMeters(userLat, userLon, green.lat, green.lon);
            var distFront = Math.max(10, distCenter - 14);
            var distBack = distCenter + 14;
            var club = suggestGolfClub(distCenter);

            var cardEl = document.getElementById('gps-status-card');
            if (cardEl) {
                var cHtml = '<div style="font-size:11px;color:#2ecc71;font-weight:700;margin-bottom:10px;"><i class="fas fa-satellite"></i> GPS ACTIVE (±' + Math.round(pos.coords.accuracy || 3) + 'm)</div>';
                cHtml += '<div style="display:flex;justify-content:space-around;align-items:center;margin:12px 0;">';
                cHtml += '<div><div style="font-size:10px;color:var(--muted);">FRONT</div><div style="font-size:18px;font-weight:700;color:var(--text);">' + distFront + 'm</div></div>';
                cHtml += '<div style="background:rgba(201,168,76,0.15);padding:10px 18px;border-radius:12px;border:1px solid var(--gold);"><div style="font-size:11px;color:var(--gold);font-weight:700;">CENTER</div><div style="font-size:36px;font-weight:800;color:var(--white);line-height:1;">' + distCenter + 'm</div></div>';
                cHtml += '<div><div style="font-size:10px;color:var(--muted);">BACK</div><div style="font-size:18px;font-weight:700;color:var(--text);">' + distBack + 'm</div></div>';
                cHtml += '</div>';
                cHtml += '<div style="font-size:13px;color:var(--gold);font-weight:700;margin-top:10px;"><i class="fas fa-golf-ball-tee"></i> ' + (currentLang === 'en' ? 'Suggested Club: ' : 'Рекомендуемая клюшка: ') + '<b>' + club + '</b></div>';
                cardEl.innerHTML = cHtml;
            }
        }, function(err) {
            var cardEl = document.getElementById('gps-status-card');
            if (cardEl) {
                var distCenter = holeDist(holeNum, 'wh');
                var club = suggestGolfClub(distCenter);
                cardEl.innerHTML = '<div style="font-size:11px;color:var(--gold);font-weight:700;margin-bottom:8px;"><i class="fas fa-flag"></i> ' + (currentLang === 'en' ? 'Course Yardage' : 'Дистанция по карте Пестово') + '</div>' +
                    '<div style="font-size:36px;font-weight:800;color:var(--white);">' + distCenter + 'm</div>' +
                    '<div style="font-size:12px;color:var(--gold);margin-top:6px;">' + (currentLang === 'en' ? 'Suggested Club: ' : 'Рекомендуемая клюшка: ') + '<b>' + club + '</b></div>';
            }
        }, { enableHighAccuracy: true, timeout: 8000 });
    }
}

function closeGPSModal() {
    var modalEl = document.getElementById('gps-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

// ==========================================
// FEATURE 4: HEAD-TO-HEAD DUEL 1v1
// ==========================================
function openHeadToHeadModal(p1Id, p2Id) {
    var modalEl = document.getElementById('h2h-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'h2h-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closeH2HModal()"></div>' +
            '<div class="modal-body" style="max-width:580px;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeH2HModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closeH2HModal()">&times;</button>' +
            '</div>' +
            '<div id="h2h-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('h2h-modal-body');
    if (!bodyEl || typeof db === 'undefined') return;

    db.ref('users').once('value').then(function(sn) {
        var users = sn.val() || {};
        var userEntries = Object.entries(users);
        if (userEntries.length < 2) {
            bodyEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:30px;">' + (currentLang === 'en' ? 'Need at least 2 registered players' : 'Требуется минимум 2 зарегистрированных игрока') + '</p>';
            modalEl.classList.remove('hidden');
            return;
        }

        var uid1 = p1Id || userEntries[0][0];
        var uid2 = p2Id || (userEntries[1] ? userEntries[1][0] : userEntries[0][0]);
        if (uid1 === uid2 && userEntries[1]) uid2 = userEntries[1][0];

        var u1 = users[uid1] || {};
        var u2 = users[uid2] || {};

        var html = '<h2 style="color:var(--gold);margin-bottom:14px;"><i class="fas fa-handshake-simple"></i> ' + t('h2h_duel') + '</h2>';

        // Player Selectors
        html += '<div class="form-row" style="margin-bottom:20px;">';
        html += '<div class="form-group"><label>Player 1</label><select class="form-input" onchange="openHeadToHeadModal(this.value, \'' + uid2 + '\')">';
        userEntries.forEach(function(e) {
            var sel = e[0] === uid1 ? 'selected' : '';
            html += '<option value="' + e[0] + '" ' + sel + '>' + escapeHtml(e[1].name || 'Player') + '</option>';
        });
        html += '</select></div>';

        html += '<div class="form-group"><label>Player 2</label><select class="form-input" onchange="openHeadToHeadModal(\'' + uid1 + '\', this.value)">';
        userEntries.forEach(function(e) {
            var sel = e[0] === uid2 ? 'selected' : '';
            html += '<option value="' + e[0] + '" ' + sel + '>' + escapeHtml(e[1].name || 'Player') + '</option>';
        });
        html += '</select></div>';
        html += '</div>';

        // Head-to-Head Comparison Table
        html += '<div class="card" style="background:var(--input);padding:16px;">';
        html += '<div style="display:flex;justify-content:space-around;align-items:center;margin-bottom:16px;text-align:center;">';
        html += '<div>' + fmtUserAvatar(u1, 52) + '<div style="font-weight:700;color:var(--gold);margin-top:4px;">' + escapeHtml(u1.name || 'Player 1') + '</div></div>';
        html += '<div style="font-size:24px;font-weight:900;color:var(--white);">VS</div>';
        html += '<div style="font-size:24px;font-weight:900;color:var(--white);">' + fmtUserAvatar(u2, 52) + '<div style="font-weight:700;color:var(--gold);margin-top:4px;">' + escapeHtml(u2.name || 'Player 2') + '</div></div>';
        html += '</div>';

        // Metrics Rows
        html += drawH2HRow('Exact HCP', fmtExactHcp(u1.handicap), fmtExactHcp(u2.handicap));
        html += drawH2HRow('Rounds Played', String(u1.roundsPlayed || 0), String(u2.roundsPlayed || 0));
        html += drawH2HRow('Best Gross (18h)', String(u1.bestGross || '—'), String(u2.bestGross || '—'));
        html += drawH2HRow('Best Stableford', String(u1.bestStableford || '—'), String(u2.bestStableford || '—'));

        html += '</div>';

        bodyEl.innerHTML = html;
        modalEl.classList.remove('hidden');
    });
}

function drawH2HRow(label, v1, v2) {
    return '<div class="list-item" style="padding:10px;margin-bottom:6px;">' +
        '<div style="font-weight:700;color:var(--white);width:30%;text-align:center;">' + v1 + '</div>' +
        '<div style="font-size:11px;color:var(--muted);width:40%;text-align:center;text-transform:uppercase;">' + label + '</div>' +
        '<div style="font-weight:700;color:var(--white);width:30%;text-align:center;">' + v2 + '</div>' +
        '</div>';
}

function closeH2HModal() {
    var modalEl = document.getElementById('h2h-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

// ==========================================
// FEATURE 3: OFFICIAL PDF SCORECARD EXPORT
// ==========================================
function downloadOfficialScorecardPDF(roundData) {
    if (!roundData) {
        toast(t('no_data') || 'Нет данных раунда', 'error');
        return;
    }

    var pName = roundData.playerName || 'Игрок';
    var mName = roundData.markerName || 'Маркёр';
    var dateStr = fmtDate(roundData.createdAt || Date.now());
    var timeStr = fmtTime(roundData.createdAt || Date.now());
    var teeCode = roundData.tee || 'wh';
    var format = pestovoRoundFormatsLabel(roundData) || roundData.format || 'Stroke Play';
    var exactHcp = roundData.exactHandicap != null ? fmtExactHcp(roundData.exactHandicap) : '—';
    var fieldHcp = roundData.fieldHandicap != null ? fmtFieldHcp(roundData.fieldHandicap) : '—';

    var printWin = window.open('', '_blank');
    if (!printWin) {
        toast('Пожалуйста, разрешите всплывающие окна для печати PDF', 'error');
        return;
    }

    var html = '<!DOCTYPE html><html><head><title>Pestovo_Scorecard_' + pName.replace(/\s+/g, '_') + '</title>' +
        '<meta charset="utf-8">' +
        '<style>' +
        'body{font-family:Arial,sans-serif;padding:20px;color:#000;background:#fff;font-size:12px;}' +
        '.header{text-align:center;border-bottom:2px solid #c9a84c;padding-bottom:10px;margin-bottom:15px;}' +
        '.header h1{margin:0;font-size:18px;color:#132218;letter-spacing:1px;}' +
        '.header h2{margin:4px 0 0;font-size:12px;color:#c9a84c;font-weight:700;}' +
        '.meta-table{width:100%;border-collapse:collapse;margin-bottom:15px;}' +
        '.meta-table td{padding:6px;border:1px solid #ccc;font-size:11px;}' +
        '.grid-table{width:100%;border-collapse:collapse;margin-bottom:15px;text-align:center;}' +
        '.grid-table th,.grid-table td{border:1px solid #333;padding:5px 2px;font-size:11px;}' +
        '.grid-table th{background:#132218;color:#fff;}' +
        '.out-in-row{background:#f0f0f0;font-weight:700;}' +
        '.sigs{display:flex;justify-content:space-between;margin-top:30px;padding-top:15px;border-top:1px dashed #666;}' +
        '.sig-box{width:45%;font-size:11px;}' +
        '.stamp-box{text-align:center;border:2px solid #c9a84c;border-radius:8px;padding:8px;margin-top:20px;color:#c9a84c;font-weight:700;}' +
        '</style></head><body>' +
        '<div class="header">' +
        '<h1>⛳ ГОЛЬФ-КЛУБ «ПЕСТОВО»</h1>' +
        '<h2>ОФИЦИАЛЬНАЯ СЧЁТНАЯ КАРТОЧКА / OFFICIAL SCORECARD</h2>' +
        '</div>' +
        '<table class="meta-table">' +
        '<tr><td><b>Игрок:</b> ' + pName + '</td><td><b>Маркёр:</b> ' + mName + '</td><td><b>Дата:</b> ' + dateStr + ' ' + timeStr + '</td></tr>' +
        '<tr><td><b>Точный HCP:</b> ' + exactHcp + '</td><td><b>Игровой HCP:</b> ' + fieldHcp + '</td><td><b>ТИ:</b> ' + (TEES[teeCode]||teeCode) + ' · <b>Формат:</b> ' + format + '</td></tr>' +
        '</table>' +
        '<table class="grid-table">' +
        '<thead><tr><th>Л.</th>';

    for (var i = 1; i <= 18; i++) html += '<th>' + i + '</th>';
    html += '<th>OUT</th><th>IN</th><th>ВСЕГО</th></tr></thead><tbody>';

    html += '<tr><td><b>PAR</b></td>';
    var outPar = 0, inPar = 0;
    for (var h = 1; h <= 18; h++) {
        var p = holePar(h);
        if (h <= 9) outPar += p; else inPar += p;
        html += '<td>' + p + '</td>';
    }
    html += '<td class="out-in-row">' + outPar + '</td><td class="out-in-row">' + inPar + '</td><td class="out-in-row">' + (outPar + inPar) + '</td></tr>';

    html += '<tr><td><b>SCORE</b></td>';
    var outScore = 0, inScore = 0, totalScore = 0;
    var scores = roundData.scores || {};
    for (var h = 1; h <= 18; h++) {
        var s = scores[h];
        if (s != null && s > 0) {
            totalScore += s;
            if (h <= 9) outScore += s; else inScore += s;
            html += '<td style="font-weight:700;">' + s + '</td>';
        } else {
            html += '<td>—</td>';
        }
    }
    html += '<td class="out-in-row">' + (outScore || '—') + '</td><td class="out-in-row">' + (inScore || '—') + '</td><td class="out-in-row">' + (totalScore || '—') + '</td></tr>';

    html += '</tbody></table>' +
        '<div class="sigs">' +
        '<div class="sig-box">Подпись игрока: _______________________</div>' +
        '<div class="sig-box">Подпись маркёра: _______________________</div>' +
        '</div>' +
        '<div class="stamp-box">ГСК ГОЛЬФ-КЛУБА ПЕСТОВО · ПОДТВЕРЖДЕНО</div>' +
        '<script>window.onload = function() { window.print(); };</script>' +
        '</body></html>';

    printWin.document.write(html);
    printWin.document.close();
}

// ==========================================
// FEATURE 4: MATCH PLAY VISUAL TRACKER
// ==========================================
function calcMatchPlayStatus(p1Scores, p2Scores, p1Name, p2Name) {
    p1Name = p1Name || 'Игрок 1';
    p2Name = p2Name || 'Игрок 2';
    p1Scores = p1Scores || {};
    p2Scores = p2Scores || {};

    var p1HolesWon = 0;
    var p2HolesWon = 0;
    var holesCompleted = 0;
    var holeHistory = [];

    for (var h = 1; h <= 18; h++) {
        var s1 = p1Scores[h];
        var s2 = p2Scores[h];

        if (s1 != null && s1 > 0 && s2 != null && s2 > 0) {
            holesCompleted++;
            if (s1 < s2) {
                p1HolesWon++;
                holeHistory.push({ hole: h, winner: 1 });
            } else if (s2 < s1) {
                p2HolesWon++;
                holeHistory.push({ hole: h, winner: 2 });
            } else {
                holeHistory.push({ hole: h, winner: 0 });
            }
        }
    }

    var lead = p1HolesWon - p2HolesWon;
    var absLead = Math.abs(lead);
    var remaining = 18 - holesCompleted;

    var statusText = '';
    var state = 'active';

    if (absLead > remaining && holesCompleted > 0) {
        state = 'final';
        var winnerName = lead > 0 ? p1Name : p2Name;
        statusText = '🏆 ПОБЕДА ' + winnerName.toUpperCase() + ' ' + absLead + ' & ' + remaining;
    } else if (absLead === remaining && remaining > 0) {
        state = 'dormie';
        var leaderName = lead > 0 ? p1Name : p2Name;
        statusText = '🔥 ' + leaderName.toUpperCase() + ' ' + absLead + ' UP (DORMIE)';
    } else if (lead === 0) {
        statusText = '⚖️ ALL SQUARE (Ничья)';
    } else {
        var leaderName = lead > 0 ? p1Name : p2Name;
        statusText = '⚡ ' + leaderName.toUpperCase() + ' ' + absLead + ' UP (' + remaining + ' л. осталось)';
    }

    return {
        p1HolesWon: p1HolesWon,
        p2HolesWon: p2HolesWon,
        holesCompleted: holesCompleted,
        remaining: remaining,
        lead: lead,
        state: state,
        statusText: statusText,
        holeHistory: holeHistory
    };
}

function renderMatchPlayTrackerHTML(matchStatus) {
    if (!matchStatus) return '';
    var html = '<div class="card setup-card" style="border-color:var(--gold);background:rgba(201,168,76,0.06);margin-bottom:12px;">' +
        '<div style="font-size:12px;color:var(--gold);font-weight:700;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">' +
        '<span><i class="fas fa-swords"></i> Match Play Status</span>' +
        '<span style="font-size:10px;color:var(--muted);">' + matchStatus.holesCompleted + '/18 holes</span>' +
        '</div>' +
        '<div style="font-size:14px;font-weight:800;color:var(--white);text-align:center;padding:8px 0;background:rgba(0,0,0,0.3);border-radius:8px;margin-bottom:8px;">' +
        matchStatus.statusText +
        '</div>' +
        '<div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;">';

    for (var i = 0; i < matchStatus.holeHistory.length; i++) {
        var item = matchStatus.holeHistory[i];
        var bg = item.winner === 1 ? '#2ecc71' : (item.winner === 2 ? '#e05a4a' : 'var(--muted)');
        var lbl = item.winner === 1 ? 'W1' : (item.winner === 2 ? 'W2' : 'AS');
        html += '<div style="background:' + bg + ';color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;">Л.' + item.hole + ': ' + lbl + '</div>';
    }

    html += '</div></div>';
    return html;
}

function toggleActiveScorecard(panelId) {
    var panel = document.getElementById(panelId);
    var icon = document.getElementById(panelId + '-icon');
    var txt = document.getElementById(panelId + '-txt');
    if (!panel) return;

    var isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        panel.classList.remove('hidden');
        if (icon) icon.className = 'fas fa-chevron-up';
        if (txt) txt.textContent = currentLang === 'en' ? 'Collapse Scorecard' : 'Свернуть счётную карточку';
    } else {
        panel.classList.add('hidden');
        if (icon) icon.className = 'fas fa-chevron-down';
        if (txt) txt.textContent = currentLang === 'en' ? 'Expand Scorecard' : 'Развернуть счётную карточку';
    }
}

// Состав флайта: имена всех игроков раунда, играющих на поле вместе с
// вызвавшим (кроме самого вызвавшего). Порядок — как в participantsList.
function getFlightPlayerNames(roundData, excludeUid) {
    if (!roundData || !roundData.players) return [];
    var order = (Array.isArray(roundData.participantsList) && roundData.participantsList.length)
        ? roundData.participantsList
        : Object.keys(roundData.players);
    var names = [];
    order.forEach(function(pid) {
        if (pid === excludeUid) return;
        var p = roundData.players[pid];
        if (p && p.name) names.push(p.name);
    });
    return names;
}

// ==========================================
// TELEGRAM BOT OFFICIAL ALERTS (GROUP & CHANNEL)
// ==========================================
// Формат сообщения о вызове судьи/маршала (общий для Telegram и ВКонтакте):
//   Вызов Судьи / Вызов Маршала
//   Кто вызвал: Имя Фамилия игрока
//   Лунка: №N
//   Время: ЧЧ:ММ
//   Состав флайта: Имя Фамилия, ... (все игроки, играющие на поле
//   вместе с вызвавшим; для группового раунда)
function buildOfficialCallText(type, holeNum, callerName, flightNames, withHtml) {
    var isHtml = !!withHtml;
    var esc = isHtml ? (typeof escapeHtml === 'function' ? escapeHtml : function(v) { return String(v); }) : function(v) { return String(v); };
    var timeStr = typeof fmtTime === 'function' ? fmtTime(Date.now()) : new Date().toLocaleTimeString('ru-RU');
    var title = type === 'referee' ? '🚨 Вызов Судьи' : '🚨 Вызов Маршала';
    var bOpen = isHtml ? '<b>' : '', bClose = isHtml ? '</b>' : '';
    var parts = [];
    parts.push(isHtml ? '<b>' + title + '</b>' : title);
    parts.push(bOpen + 'Кто вызвал:' + bClose + ' ' + esc(callerName || 'Игрок'));
    parts.push(bOpen + 'Лунка:' + bClose + ' №' + holeNum);
    parts.push(bOpen + 'Время:' + bClose + ' ' + timeStr);
    var flight = (flightNames || []).map(function(n) { return String(n || '').trim(); }).filter(Boolean);
    if (flight.length) {
        parts.push(bOpen + 'Состав флайта:' + bClose + ' ' + esc(flight.join(', ')));
    }
    return parts.join('\n');
}

// Внутренний «молчаливый» отправитель: используется, когда вызов делает
// ИГРОК с поля — он не должен видеть «Тайм-аут соединения» / «Ошибка сети»
// в тосте (он уже нажал «Вызвать судью» и видит «🚨 Судья вызван»).
function sendTelegramDirectAlert(token, chat, labelName, type, holeNum, playerName, flightNames) {
    token = (token || '').trim();
    chat = (chat || '').trim();

    if (!token || !chat) {
        toast('⚠️ Укажите Bot Token и Chat ID / Username для ' + (labelName || 'Telegram'), 'error');
        return;
    }

    var text = buildOfficialCallText(type, holeNum, playerName, flightNames, true);

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { try { controller.abort(); } catch(e){} }, 6000) : null;

    var fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: chat,
            text: text,
            parse_mode: 'HTML'
        })
    };
    if (controller) fetchOptions.signal = controller.signal;

    fetch('https://api.telegram.org/bot' + token + '/sendMessage', fetchOptions)
    .then(function(res) {
        if (timeoutId) clearTimeout(timeoutId);
        return res.json();
    })
    .then(function(data) {
        if (data && data.ok) {
            console.log('✅ Telegram alert delivered to ' + labelName + ':', data.result);
            toast('✅ Telegram сообщение доставлено в ' + (labelName || 'чат') + '!', 'success');
        } else {
            var errDesc = (data && data.description) ? data.description : 'Ошибка Telegram API';
            console.error('❌ Telegram Bot API Error (' + labelName + '):', errDesc);
            toast('❌ Ошибка Telegram (' + (labelName || 'чат') + '): ' + errDesc, 'error');
        }
    })
    .catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        var isAbort = err && err.name === 'AbortError';
        var errMsg = isAbort ? 'Таймаут соединения (6 сек)' : (err ? err.message : 'Ошибка сети');
        console.error('❌ Telegram Fetch Error (' + labelName + '):', err);
        toast('❌ Ошибка сети / Таймаут Telegram: ' + errMsg, 'error');
    });
}

// «Молчаливый» вариант: та же логика, но без тостов на ошибках и успехах.
// Используется, когда вызов инициирует ИГРОК — он не должен получать
// «Тайм-аут соединения» или «Ошибка сети», только «🚨 Судья вызван».
function sendTelegramSilentAlert(token, chat, type, holeNum, playerName, flightNames) {
    token = (token || '').trim();
    chat = (chat || '').trim();
    if (!token || !chat) return; // нет настроек — тихо выходим

    var text = buildOfficialCallText(type, holeNum, playerName, flightNames, true);

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function() { try { controller.abort(); } catch(e){} }, 6000) : null;

    var fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML' })
    };
    if (controller) fetchOptions.signal = controller.signal;

    fetch('https://api.telegram.org/bot' + token + '/sendMessage', fetchOptions)
    .then(function(res) {
        if (timeoutId) clearTimeout(timeoutId);
        return res.json();
    })
    .then(function(data) {
        if (!data || !data.ok) {
            console.warn('⚠️ Telegram silent send failed:', data && data.description);
        }
    })
    .catch(function(err) {
        if (timeoutId) clearTimeout(timeoutId);
        // Намеренно НЕ показываем toast — игрок уже получил «🚨 Судья вызван».
        // Тайм-аут / ошибка сети — внутренняя кухня отправки уведомления админу,
        // а вызов уже зафиксирован в Firebase (`alerts/<id>`) и виден в админке.
        console.warn('⚠️ Telegram silent send error (suppressed):', err && err.message);
    });
}

function sendTelegramOfficialAlert(type, holeNum, playerName, flightNames, targetMode) {
    // ВАЖНО: этот вызов делает ИГРОК. Никаких тостов об ошибках сети / таймаутах
    // Telegram ему показывать нельзя — он уже видит «🚨 Судья вызван». Если Telegram
    // настроен и отвечает — это плюс. Если нет — вызов всё равно лежит в Firebase
    // и админ увидит его в панели «Вызовы».
    var groupToken = (localStorage.getItem('pestovo_tg_group_token') || localStorage.getItem('pestovo_tg_bot_token') || '').trim();
    var groupId = (localStorage.getItem('pestovo_tg_group_id') || localStorage.getItem('pestovo_tg_chat_id') || '').trim();

    var channelToken = (localStorage.getItem('pestovo_tg_channel_token') || groupToken || '').trim();
    var channelId = (localStorage.getItem('pestovo_tg_channel_id') || '').trim();

    if (groupToken && groupId && (targetMode === 'group' || !targetMode)) {
        sendTelegramSilentAlert(groupToken, groupId, type, holeNum, playerName, flightNames);
    }
    if (channelToken && channelId && (targetMode === 'channel' || !targetMode)) {
        sendTelegramSilentAlert(channelToken, channelId, type, holeNum, playerName, flightNames);
    }

    if (!groupToken && !channelToken && typeof db !== 'undefined') {
        db.ref('settings/telegram').once('value').then(function(sn) {
            var tg = sn.val() || {};
            var gTok = (tg.groupToken || tg.botToken || '').trim();
            var gId = (tg.groupId || tg.chatId || '').trim();
            var cTok = (tg.channelToken || gTok || '').trim();
            var cId = (tg.channelId || '').trim();

            if (gTok && gId && (targetMode === 'group' || !targetMode)) {
                sendTelegramSilentAlert(gTok, gId, type, holeNum, playerName, flightNames);
            }
            if (cTok && cId && (targetMode === 'channel' || !targetMode)) {
                sendTelegramSilentAlert(cTok, cId, type, holeNum, playerName, flightNames);
            }
        });
    }
}

// ==========================================
// VK API OFFICIAL ALERTS
// Использует JSONP (<script>-тег) для обхода CORS-ограничений браузера.
// VK API официально поддерживает JSONP через параметр callback=.
// ==========================================

/**
 * Низкоуровневая отправка через JSONP — единственный способ вызвать
 * VK API из браузера без серверного прокси (обходит CORS).
 *
 * @param {string} token     - Access Token сообщества VK
 * @param {string} peerId    - Peer ID беседы / пользователя
 * @param {string} text      - Текст сообщения
 * @param {boolean} silent   - true = без тостов об ошибках
 */
function vkSendMessageJsonp(token, peerId, text, silent) {
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) {
        if (!silent) toast('⚠️ Укажите VK Access Token и Peer ID в настройках', 'error');
        return;
    }

    var cbName = '_vkCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    var randomId = Math.floor(Math.random() * 2000000000);
    var timeoutId = null;
    var script = null;

    var cleanup = function() {
        try { if (script && script.parentNode) script.parentNode.removeChild(script); } catch(e) {}
        try { delete window[cbName]; } catch(e) { window[cbName] = undefined; }
        if (timeoutId) clearTimeout(timeoutId);
    };

    window[cbName] = function(data) {
        cleanup();
        if (data && (data.response !== undefined) && data.response) {
            if (!silent) {
                console.log('✅ VK message sent, id:', data.response);
                toast('✅ Сообщение ВКонтакте доставлено!', 'success');
            }
        } else {
            var errCode = data && data.error && data.error.error_code;
            var errMsg  = data && data.error && data.error.error_msg
                          ? data.error.error_msg
                          : 'Ошибка VK API';
            console.error('❌ VK API Error ' + errCode + ':', errMsg, data);
            if (!silent) {
                toast('❌ VK API: ' + errMsg, 'error');
            } else {
                console.warn('⚠️ VK silent send failed (code ' + errCode + '):', errMsg);
            }
        }
    };

    var url = 'https://api.vk.com/method/messages.send' +
              '?access_token=' + encodeURIComponent(token) +
              '&peer_id='      + encodeURIComponent(peerId) +
              '&message='      + encodeURIComponent(text) +
              '&random_id='    + randomId +
              '&v=5.199' +
              '&callback='    + cbName;

    script = document.createElement('script');
    script.src = url;
    script.onerror = function() {
        cleanup();
        if (!silent) {
            toast('❌ Ошибка сети при отправке в VK (JSONP)', 'error');
        } else {
            console.warn('⚠️ VK JSONP network error (suppressed)');
        }
    };

    // Таймаут 10 секунд
    timeoutId = setTimeout(function() {
        cleanup();
        if (!silent) {
            toast('❌ Таймаут соединения с VK (10 сек)', 'error');
        } else {
            console.warn('⚠️ VK JSONP timeout (suppressed)');
        }
    }, 10000);

    (document.head || document.body).appendChild(script);
}

/**
 * Формирует текст уведомления о вызове судьи/маршала (обычный текст для VK).
 */
function vkBuildAlertText(type, holeNum, playerName, flightNames) {
    return buildOfficialCallText(type, holeNum, playerName, flightNames, false);
}

/**
 * Прямая отправка с тостами (для теста из админки).
 */
function sendVKDirectAlert(token, peerId, type, holeNum, playerName, flightNames) {
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) {
        toast('⚠️ Укажите VK Access Token и Peer ID в настройках', 'error');
        return;
    }
    var text = vkBuildAlertText(type, holeNum, playerName, flightNames);
    vkSendMessageJsonp(token, peerId, text, false);
}

/**
 * «Молчаливый» вариант для ИГРОКА: без тостов об ошибках.
 */
function sendVKSilentAlert(token, peerId, type, holeNum, playerName, flightNames) {
    token = (token || '').trim();
    peerId = (peerId || '').trim();
    if (!token || !peerId) return;
    var text = vkBuildAlertText(type, holeNum, playerName, flightNames);
    vkSendMessageJsonp(token, peerId, text, true);
}

/**
 * Точка входа при вызове судьи/маршала ИГРОКОМ.
 * Читает настройки из localStorage → Firebase, отправляет молча.
 */
function sendVKOfficialAlert(type, holeNum, playerName, flightNames) {
    var vkToken  = (localStorage.getItem('pestovo_vk_token')   || '').trim();
    var vkPeerId = (localStorage.getItem('pestovo_vk_peer_id') || '').trim();

    if (vkToken && vkPeerId) {
        sendVKSilentAlert(vkToken, vkPeerId, type, holeNum, playerName, flightNames);
    } else if (typeof db !== 'undefined') {
        db.ref('settings/vk').once('value').then(function(sn) {
            var vk = sn.val() || {};
            var token = (vk.token  || '').trim();
            var peer  = (vk.peerId || '').trim();
            if (token && peer) {
                sendVKSilentAlert(token, peer, type, holeNum, playerName, flightNames);
            }
        }).catch(function(e) {
            console.warn('⚠️ VK: не удалось загрузить настройки из Firebase:', e);
        });
    }
}

// Глобальный дефолт показа Stableford синхронизируется на всех страницах.
// Личный выбор игрока хранится в rounds/<round>/players/<player>/stablefordDisplay
// и поэтому не перезаписывается этой настройкой.
if (typeof db !== 'undefined') {
    try {
        db.ref('settings/stableford_display_default').on('value', function(sn) {
            syncStablefordDisplayDefault(sn.val());
        });
    } catch (e) {}
}

// ==========================================
// DYNAMIC PAGE VISIBILITY MANAGEMENT
// ==========================================
var MANAGED_PAGES = [
    'guide.html',
    'feed.html',
    'predictor.html',
    'order-of-merit.html',
    'players.html',
    'tournaments.html',
    'stats.html',
    'handicap.html',
    'assistant.html'
];

function getHiddenPages() {
    try {
        var local = localStorage.getItem('pestovo_hidden_pages');
        return local ? JSON.parse(local) : {};
    } catch(e) {
        return {};
    }
}

function applyPageVisibilitySettings() {
    if (typeof document === 'undefined') return;

    var hiddenPages = getHiddenPages();
    var curPage = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname.split('/').pop() || 'index.html' : 'index.html';

    // «Турнир (опционально)» в групповом раунде больше не показывается:
    // участие в турнире — только через регистрацию в разделе «Турниры».
    var isTournamentsHidden = (hiddenPages['tournaments.html'] === true || hiddenPages['tournaments'] === true);
    void isTournamentsHidden;

    MANAGED_PAGES.forEach(function(page) {
        var key = page.replace('.html', '');
        var isHidden = (hiddenPages[page] === true || hiddenPages[key] === true);
        var links = document.querySelectorAll('a[href*="' + page + '"]');
        links.forEach(function(link) {
            if (isHidden) {
                link.classList.add('nav-page-hidden');
                link.style.setProperty('display', 'none', 'important');
            } else {
                link.classList.remove('nav-page-hidden');
                link.style.removeProperty('display');
            }
        });
    });

    var groups = document.querySelectorAll('.mobile-drawer-group, .nav-group, .menu-group, .footer-group');
    groups.forEach(function(group) {
        var links = group.querySelectorAll('a');
        if (links.length > 0) {
            var visibleCount = 0;
            links.forEach(function(l) {
                if (l.style.display !== 'none' && !l.classList.contains('nav-page-hidden')) {
                    visibleCount++;
                }
            });
            if (visibleCount === 0) {
                group.style.setProperty('display', 'none', 'important');
            } else {
                group.style.removeProperty('display');
            }
        }
    });

    // Группа «Мои настройки» (без ссылок, но с тогглами) тоже можно скрывать через админку
    if (typeof isMyPreferencesEnabled === 'function' && !isMyPreferencesEnabled()) {
        var prefGroups = document.querySelectorAll('.mobile-drawer-group-preferences');
        prefGroups.forEach(function(g) {
            g.style.setProperty('display', 'none', 'important');
        });
    } else {
        var prefGroupsShow = document.querySelectorAll('.mobile-drawer-group-preferences');
        prefGroupsShow.forEach(function(g) {
            g.style.removeProperty('display');
        });
    }

    if (MANAGED_PAGES.includes(curPage) && (hiddenPages[curPage] === true || hiddenPages[curPage.replace('.html', '')] === true)) {
        var mainEl = document.querySelector('main') || document.body;
        if (mainEl && !document.getElementById('page-hidden-notice')) {
            var homeText = (typeof t === 'function' ? t('nav_home') : (currentLang === 'en' ? 'Home' : 'Главная'));
            mainEl.innerHTML =
                '<div class="container" style="padding:60px 20px;text-align:center;" id="page-hidden-notice">' +
                '<div class="card" style="max-width:500px;margin:0 auto;padding:40px;border:2px solid var(--gold);">' +
                '<div style="font-size:56px;color:var(--gold);margin-bottom:16px;"><i class="fas fa-eye-slash"></i></div>' +
                '<h2 style="color:var(--white);margin-bottom:10px;font-size:22px;">' + (currentLang === 'en' ? 'Page Hidden' : 'Страница скрыта администратором') + '</h2>' +
                '<p style="color:var(--muted);font-size:14px;margin-bottom:24px;line-height:1.6;">' + (currentLang === 'en' ? 'This page has been temporarily hidden by the club administrator.' : 'Эта страница временно убрана из доступа администратором клуба.') + '</p>' +
                '<a href="index.html" class="btn btn-g btn-lg"><i class="fas fa-home"></i> ' + homeText + '</a>' +
                '</div>' +
                '</div>';
        }
    }
}

if (typeof db !== 'undefined') {
    try {
        db.ref('settings/hidden_pages').on('value', function(sn) {
            var hp = sn.val() || {};
            localStorage.setItem('pestovo_hidden_pages', JSON.stringify(hp));
            applyPageVisibilitySettings();
        });
        // Синхронизация переключателя «Меню инструментов» между устройствами
        db.ref('settings/tools_menu_enabled').on('value', function(sn) {
            var v = sn.val();
            var enabled = (v === true || v === '1' || v === 1);
            try { localStorage.setItem('pestovo_tools_menu_enabled', enabled ? '1' : '0'); } catch(e) {}
            // Перерисовываем навигацию, чтобы кнопка появилась/исчезла сразу
            if (typeof navAuth === 'function' && typeof currentUser !== 'undefined') {
                navAuth(currentUser, currentUserData || null);
            }
            if (typeof buildMobileDrawer === 'function') buildMobileDrawer();
        });
        // Синхронизация переключателя «Мои настройки» между устройствами
        db.ref('settings/my_preferences_enabled').on('value', function(sn) {
            var v = sn.val();
            // По умолчанию ВКЛ — если ключа нет, не трогаем localStorage
            if (v === null || v === undefined) return;
            var enabled = (v === true || v === '1' || v === 1);
            try { localStorage.setItem('pestovo_my_preferences_enabled', enabled ? '1' : '0'); } catch(e) {}
            if (typeof buildMobileDrawer === 'function') buildMobileDrawer();
            if (typeof applyPageVisibilitySettings === 'function') applyPageVisibilitySettings();
        });
        // Глобальный выбор стиля галочки гандикапа (админ-панель → «Данные»)
        db.ref('settings/hcp_badge_variant').on('value', function(sn) {
            var v = sn.val();
            if ((v === '1' || v === '2' || v === '3') && v !== pestovoHcpBadgeVariant) {
                applyHcpBadgeVariant(v);
            }
        });
        // Глобальный выбор оформления PNG-карточки для социальных сетей.
        db.ref('settings/social_card_variant').on('value', function(sn) {
            var v = sn.val();
            if (SOCIAL_CARD_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoSocialCardVariant) {
                applySocialCardVariant(String(v));
            }
        });
        // Глобальный выбор стиля карточки группового раунда на главной.
        db.ref('settings/group_round_card_variant').on('value', function(sn) {
            var v = sn.val();
            if (GROUP_CARD_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoGroupCardVariant) {
                applyGroupCardVariant(String(v));
            }
        });
        // Глобальный выбор оформления счётной карточки игрока в лидерборде турнира.
        db.ref('settings/tn_scorecard_variant').on('value', function(sn) {
            var v = sn.val();
            if (TN_CARD_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoTnCardVariant) {
                applyTnCardVariant(String(v));
            }
        });
        // Глобальный выбор вида лидерборда турнира — 5 вариантов (требование #7).
        db.ref('settings/tournament_leaderboard_variant').on('value', function(sn) {
            var v = sn.val();
            if (TN_LB_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoTnLbVariant) {
                applyTnLbVariant(String(v));
            }
        });
        // Видимость гандикапных групп/дивизионов на странице турниров.
        // Нет настройки в базе → дефолт «показывать» (группы скрывает
        // только явный false/0 из админки).
        db.ref('settings/tn_groups_visible').on('value', function(sn) {
            var v = sn.val();
            if (v === null || typeof v === 'undefined') v = true;
            applyTnGroupsVisible(v === true || v === '1' || v === 1);
        });
        // 4 варианта списка участников/групп.
        db.ref('settings/tn_roster_variant').on('value', function(sn) {
            var v = sn.val();
            if (TN_ROSTER_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoTnRosterVariant) {
                applyTnRosterVariant(String(v));
            }
        });
        // Сброс ВСЕХ локальных сессий после очистки данных в админке.
        db.ref('settings/sessions_reset_ts').on('value', function(sn) {
            var ts = parseInt(sn.val(), 10) || 0;
            if (!ts) return;
            var known = 0;
            try { known = parseInt(localStorage.getItem('pestovo_sessions_reset_last') || '0', 10) || 0; } catch (e) {}
            if (ts > known) {
                try { localStorage.setItem('pestovo_sessions_reset_last', String(ts)); } catch (e) {}
                pestovoWipeLocalSessions();
            }
        });
        // Шаблоны оформления сайта (админ-панель → «Дизайн 🎨»).
        // Ключа settings/design может не быть — тогда работает текущий дизайн,
        // ничего не переопределяется.
        db.ref('settings/design').on('value', function(sn) {
            var val = sn.val();
            if (typeof PestovoDesign === 'undefined') return;
            if (val && typeof val === 'object') {
                PestovoDesign.applySettings(val);
            } else {
                // Админ сбросил оформление: возвращаем базовый дизайн.
                PestovoDesign.applySettings(null);
            }
        });
        // Глобальные варианты страниц: по умолчанию используется вариант 1,
        // поэтому отсутствие ключа в старой базе ничего не меняет.
        Object.keys(PAGE_DISPLAY_VARIANT_CONFIG).forEach(function(page) {
            var cfg = PAGE_DISPLAY_VARIANT_CONFIG[page];
            db.ref(cfg.firebase).on('value', function(sn) {
                var value = sn.val();
                if (PAGE_DISPLAY_VARIANTS.indexOf(String(value)) !== -1 && String(value) !== getPageDisplayVariant(page)) {
                    applyPageDisplayVariant(page, String(value));
                }
            });
        });
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', function() {
    applyPageVisibilitySettings();
});

// Нормализация ключа для Firebase (нельзя . $ # [ ] /)
function firebaseSafeKeyStr(s) { return String(s).replace(/[.$#\[\]\/]/g, '_'); }

// Детерминированный id гостя: одно и то же имя + HCP всегда даёт один и тот же id,
// чтобы игрок не дублировался в users при повторных раундах (соло, группа, турниры).
// Детерминированный id гостя: одно и то же ФИО всегда даёт один и тот же id,
// чтобы игрок не дублировался в users при повторных раундах (соло, группа, турниры).
// HCP НЕ входит в ключ — одинаковое имя с разным HCP это один и тот же человек,
// гандикап просто обновляется. Это предотвращает сдваивание игроков.
function buildGuestUserId(cleanName, exactHcp) {
    // exactHcp игнорируется для детерминизма по имени, чтобы не плодить дубли
    return firebaseSafeKeyStr('guest_' + cleanName.toLowerCase().replace(/\s+/g, '_'));
}

// Полный ФИО-ключ для дедупликации: имя + отчество + фамилия в нормализованном виде
function getPlayerFioKey(u) {
    if (!u) return '';
    var first = (u.firstName || '').toString();
    var middle = (u.middleName || '').toString();
    var last = (u.lastName || '').toString();
    var name = (u.name || '').toString();
    var combined = (first + ' ' + middle + ' ' + last).replace(/\s+/g, ' ').trim() || name;
    return normalizeSearchText(combined);
}

function getNamePartsNormalized(nameStr) {
    var s = normalizeSearchText(nameStr || '');
    return s ? s.split(' ').filter(Boolean) : [];
}

// Проверка совпадения по ФИО: учитывает оба порядка «Имя Фамилия» и «Фамилия Имя»
// и наличие отчества. Возвращает 'strong', 'loose' или null.
//
// ВАЖНО: 'strong' означает «точно тот же человек» — только такие записи
// объединяются автоматически. Раньше сюда попадали РАЗНЫЕ люди с одной
// общей частью ФИО (например, однофамильцы или тёзки) — из-за этого при
// создании группового раунда два игрока получали один id и раунд не
// создавался с ошибкой «дублирующий игрок».
function isSamePersonByFio(localParts, remoteParts, localFullNorm, remoteFullNorm) {
    if (!localParts.length || !remoteParts.length) return null;
    // Полное совпадение нормализованной строки
    if (localFullNorm && remoteFullNorm && localFullNorm === remoteFullNorm) return 'strong';
    var allLocalInRemote = localParts.every(function(p) { return remoteParts.indexOf(p) !== -1; });
    var allRemoteInLocal = remoteParts.every(function(p) { return localParts.indexOf(p) !== -1; });
    // Одинаковый набор частей в любом порядке («Иван Петров» = «Петров Иван»)
    if (allLocalInRemote && allRemoteInLocal) return 'strong';
    // Одно ФИО — подмножество другого, отличающийся максимум на одно слово:
    // например, добавили отчество («Иван Петров» → «Иван Петрович Петров»).
    // Больший разрыв (совпала только фамилия из трёх слов) объединять нельзя.
    var diff = Math.abs(localParts.length - remoteParts.length);
    if (diff <= 1 && (allLocalInRemote || allRemoteInLocal)) return 'strong';
    // Одна общая длинная часть (например, только фамилия или только имя) —
    // разные люди совпасть не должны: возвращаем 'loose' как подсказку,
    // но НЕ как основание для автоматического объединения.
    var shared = localParts.filter(function(p) { return remoteParts.indexOf(p) !== -1; });
    if (shared.length === 1 && shared[0].length > 2) {
        return 'loose';
    }
    return null;
}

function dedupePlayerEntriesByFio(entries) {
    // entries: array of [id, userData] or array of player objects with name
    // Возвращает отфильтрованный массив без дублей по ФИО
    var seen = {};
    var result = [];
    // Сортируем по приоритету: не гость > гость, больше раундов > меньше
    var sorted = (entries || []).slice().sort(function(a,b){
        var aIsArr = Array.isArray(a);
        var bIsArr = Array.isArray(b);
        var aData = aIsArr ? a[1] : a;
        var bData = bIsArr ? b[1] : b;
        var aId = aIsArr ? a[0] : (aData.id || aData.uid || '');
        var bId = bIsArr ? b[0] : (bData.id || bData.uid || '');
        var aGuest = !!(aData.isGuest || String(aId).indexOf('guest_')===0);
        var bGuest = !!(bData.isGuest || String(bId).indexOf('guest_')===0);
        if (aGuest !== bGuest) return aGuest ? 1 : -1;
        var aRounds = aData.roundsPlayed || 0;
        var bRounds = bData.roundsPlayed || 0;
        return bRounds - aRounds;
    });
    sorted.forEach(function(entry){
        var isArr = Array.isArray(entry);
        var data = isArr ? entry[1] : entry;
        var key = getPlayerFioKey(data) || normalizeSearchText(data.name || '');
        if (!key) {
            result.push(entry);
            return;
        }
        if (seen[key]) return;
        seen[key] = true;
        result.push(entry);
    });
    return result;
}

function dedupeRoundPlayersByFio(playersObj) {
    // playersObj: { pid: playerData }
    // Возвращает новый объект без дублей по ФИО (оставляет приоритетную запись)
    if (!playersObj || typeof playersObj !== 'object') return playersObj;
    var entries = Object.entries(playersObj);
    var deduped = dedupePlayerEntriesByFio(entries);
    var out = {};
    deduped.forEach(function(e){ out[e[0]] = e[1]; });
    return out;
}



function hcpKey1(v) {
    var n = parseFloat(v);
    if (isNaN(n)) n = 0;
    return Math.round(n * 10) / 10;
}

// ==========================================
// ЕДИНАЯ ИДЕМПОТЕНТНАЯ РЕГИСТРАЦИЯ ИГРОКА
// Возвращает Promise<userId>. Гарантирует, что один и тот же человек
// (одно имя / один uid) получает ОДНУ запись в users во всех режимах:
// одиночный раунд, групповой раунд, завершение раунда (история).
// Никогда не создаёт вторую запись, если игрок уже есть (по uid или по имени).
// ==========================================
function resolveOrCreatePlayerUser(p) {
    p = p || {};
    if (!p.name) return Promise.resolve(null);

    var cleanName = sanitizeNameRaw(p.name);
    if (!cleanName) return Promise.resolve(null);
    if (isBlockedDemoPlayer(null, cleanName)) return Promise.resolve(null);
    var parts = cleanName.split(' ');
    var firstName = p.firstName ? sanitizeNameRaw(p.firstName) : (parts[0] || cleanName);
    var middleName = p.middleName ? sanitizeNameRaw(p.middleName) : '';
    var lastName = p.lastName ? sanitizeNameRaw(p.lastName) : (parts.slice(1).join(' ') || '');
    var exactHcp = parseExactHcp(p.exactHcp != null ? p.exactHcp : (p.handicap || 0));
    // Гандикап для ПРОФИЛЯ: всегда исходный (до турнирной обрезки). Обрезка
    // гандикапа — настройка конкретного турнира, она не имеет права менять
    // глобальный HCP игрока (требование: «игрок с 54 и максимумом 28 остаётся
    // 54 в профиле, на главной и в RusGolf»).
    var profileHcp = (p.exactHcpRaw != null && p.exactHcpRaw !== '')
        ? parseExactHcp(p.exactHcpRaw)
        : (p.handicap != null && p.handicap !== '' ? parseExactHcp(p.handicap) : exactHcp);
    var fromTnCut = p.hcpFromTournamentCut === true;
    var gender = p.gender || 'men';
    var defaultTee = p.tee || p.defaultTee || (gender === 'women' ? 'rd' : 'bl');

    // Патч для обновления: гандикап — только настоящий, отчество только если было пусто и теперь есть
    var buildPatchForExisting = function(existingData) {
        existingData = existingData || {};
        var patch = {};
        // Если значение пришло из турнира с обрезкой, а у игрока уже есть
        // свой HCP — профиль не трогаем вообще.
        var hasOwn = existingData.handicap !== null && existingData.handicap !== undefined && existingData.handicap !== '';
        if (!(fromTnCut && hasOwn)) patch.handicap = profileHcp;
        // Имя/фамилия — обновляем только если у существующего они пустые
        if (!existingData.firstName && firstName) patch.firstName = firstName;
        if (!existingData.lastName && lastName) patch.lastName = lastName;
        // Отчество — добавляем если его не было (требование: добавление отчества если не было)
        if (!existingData.middleName && middleName) {
            patch.middleName = middleName;
            // Обновляем полное имя на формат «Имя Отчество Фамилия»
            var newFull = (firstName + ' ' + middleName + ' ' + lastName).replace(/\s+/g, ' ').trim() || cleanName;
            patch.name = newFull;
        }
        // Если у существующего нет имени вообще — ставим новое
        if (!existingData.name && cleanName) patch.name = cleanName;
        if (!existingData.gender && gender) patch.gender = gender;
        return patch;
    };

    var updateLocalCaches = function(id, data) {
        if (!id) return;
        try {
            var custom = {};
            var existing = localStorage.getItem('pestovo_custom_players');
            if (existing) custom = JSON.parse(existing) || {};
            if (!custom[id]) {
                custom[id] = data;
                localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
            } else {
                // Обновляем гандикап и отчество если нужно, не создавая дубль
                var cur = custom[id] || {};
                if (data.handicap != null) cur.handicap = data.handicap;
                if (data.middleName && !cur.middleName) {
                    cur.middleName = data.middleName;
                    cur.name = data.name || cur.name;
                    cur.firstName = data.firstName || cur.firstName;
                    cur.lastName = data.lastName || cur.lastName;
                }
                custom[id] = cur;
                localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
            }
        } catch(e) {}
        if (typeof cachedRegisteredUsers !== 'undefined') {
            if (cachedRegisteredUsers[id]) {
                var cur = cachedRegisteredUsers[id] || {};
                if (data.handicap != null) cur.handicap = data.handicap;
                if (data.middleName && !cur.middleName) {
                    cur.middleName = data.middleName;
                    cur.name = data.name || cur.name;
                    cur.firstName = data.firstName || cur.firstName;
                    cur.lastName = data.lastName || cur.lastName;
                } else if (!cur.name && data.name) {
                    cur.name = data.name;
                }
                cachedRegisteredUsers[id] = Object.assign({}, cur, { handicap: data.handicap != null ? data.handicap : cur.handicap });
            } else {
                cachedRegisteredUsers[id] = Object.assign({}, cachedRegisteredUsers[id] || {}, data);
            }
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch(e) {}
        }
    };

    var finish = function(id, finalData) {
        var cacheData = { name: finalData && finalData.name ? finalData.name : cleanName, firstName: firstName, lastName: lastName, handicap: profileHcp, gender: gender, defaultTee: defaultTee };
        if (middleName) cacheData.middleName = middleName;
        if (finalData && finalData.middleName) cacheData.middleName = finalData.middleName;
        if (finalData && finalData.name) cacheData.name = finalData.name;
        updateLocalCaches(id, cacheData);
        return id;
    };

    if (p.uid) {
        var uidKey = firebaseSafeKeyStr(String(p.uid));
        if (!uidKey) return Promise.resolve(null);
        var uidData = {
            name: cleanName,
            firstName: firstName,
            lastName: lastName,
            handicap: profileHcp,
            gender: gender,
            defaultTee: defaultTee,
            role: 'player',
            isGuest: !!p.isGuest || uidKey.indexOf('guest_') === 0,
            createdAt: Date.now(),
            roundsPlayed: 0
        };
        if (middleName) uidData.middleName = middleName;
        if (typeof db === 'undefined') return Promise.resolve(finish(uidKey, uidData));
        return db.ref('users/' + uidKey).once('value').then(function(sn) {
            if (!sn.exists()) {
                return db.ref('users/' + uidKey).set(uidData).catch(function(){}).then(function() { return uidKey; });
            }
            var existing = sn.val() || {};
            var patch = buildPatchForExisting(existing);
            // Гандикап обновляем только настоящим значением (см. profileHcp):
            // турнирная обрезка в профиль не пишется. Отчество добавляем, если не было
            return db.ref('users/' + uidKey).update(patch).catch(function(){}).then(function() { return uidKey; });
        }).catch(function() { return uidKey; }).then(function(id){ return finish(id, uidData); });
    }

    var candidateId = buildGuestUserId(cleanName, profileHcp);
    if (!candidateId || candidateId === 'guest__') return Promise.resolve(null);

    var guestData = {
        name: cleanName,
        firstName: firstName,
        lastName: lastName,
        handicap: profileHcp,
        gender: gender,
        defaultTee: defaultTee,
        role: 'player',
        isGuest: true,
        createdAt: Date.now(),
        roundsPlayed: 0
    };
    if (middleName) guestData.middleName = middleName;

    if (typeof db === 'undefined') return Promise.resolve(finish(candidateId, guestData));

    // Ищем существующего игрока по ФИО (без учета HCP) — чтобы не плодить дубликаты
    // Одинаковое имя + разный HCP = один и тот же человек (гандикап обновляется)
    return db.ref('users').once('value').then(function(usn) {
        var users = usn.val() || {};
        var found = null;
        var foundData = null;
        var cleanParts = getNamePartsNormalized(cleanName);
        var cleanFullNorm = normalizeSearchText(cleanName);
        Object.keys(users).forEach(function(key) {
            var u = users[key] || {};
            if (isPlayerDeleted(key, u.name)) return;
            if (isBlockedDemoPlayer(key, u.name)) return;
            var existingFioKey = getPlayerFioKey(u);
            if (!existingFioKey) return;
            var existingParts = getNamePartsNormalized(u.name || ((u.firstName||'')+' '+(u.middleName||'')+' '+(u.lastName||'')));
            var existingFullNorm = normalizeSearchText(u.name || '');
            var match = isSamePersonByFio(existingParts, cleanParts, existingFullNorm, cleanFullNorm);
            // Также проверяем прямое совпадение ключа
            if (match !== 'strong' && existingFioKey === cleanFullNorm) match = 'strong';
            // Только 'strong' объединяет записи. 'loose' (совпала одна часть —
            // например, только фамилия у однофамильцев) обязан создавать
            // ОТДЕЛЬНУЮ запись, иначе два разных игрока слипаются в один id
            // и групповой раунд не создаётся («дублирующий игрок»).
            if (match !== 'strong') return;
            // Выбираем лучшего: не гость приоритетнее, больше раундов приоритетнее
            var better;
            if (!found) better = true;
            else {
                var foundIsGuest = !!foundData.isGuest || String(found).indexOf('guest_') === 0;
                var curIsGuest = !!u.isGuest || String(key).indexOf('guest_') === 0;
                if (foundIsGuest && !curIsGuest) better = true;
                else if (foundIsGuest === curIsGuest) better = ((u.roundsPlayed || 0) > (foundData.roundsPlayed || 0));
                else better = false;
            }
            if (better) { found = key; foundData = u; }
        });
        if (found) {
            var patch = buildPatchForExisting(foundData);
            return db.ref('users/' + found).update(patch).catch(function(){}).then(function() { return found; });
        }
        // Проверяем детерминированный id
        return db.ref('users/' + candidateId).once('value').then(function(sn) {
            if (sn.exists()) {
                var existing = sn.val() || {};
                var patch = buildPatchForExisting(existing);
                return db.ref('users/' + candidateId).update(patch).catch(function(){}).then(function(){ return candidateId; });
            }
            return db.ref('users/' + candidateId).set(guestData).catch(function(){}).then(function(){ return candidateId; });
        });
    }).catch(function() {
        return candidateId;
    }).then(function(id){
        return finish(id, guestData);
    });
}


function registerGuestPlayerInDatabase(p) {
    return resolveOrCreatePlayerUser(p);
}
if (typeof window !== 'undefined') {
    window.registerGuestPlayerInDatabase = registerGuestPlayerInDatabase;
    window.resolveOrCreatePlayerUser = resolveOrCreatePlayerUser;
}

function normalizeSearchText(str) {
    if (!str) return '';
    return str.toString().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}
if (typeof window !== 'undefined') {
    window.normalizeSearchText = normalizeSearchText;
}

// ==========================================
// УДАЛЁННЫЕ ИГРОКИ (ЗАЩИТА ОТ «ВОСКРЕШЕНИЯ»)
// Запоминаем id и нормализованное имя удалённых в админке игроков,
// чтобы локальный кэш и история раундов не возвращали их в списки
// ==========================================
function getDeletedPlayerIds() {
    try {
        var raw = localStorage.getItem('pestovo_deleted_player_ids');
        if (raw) {
            var list = JSON.parse(raw);
            if (Array.isArray(list)) return list;
        }
    } catch(e) {}
    return [];
}

function isPlayerDeleted(id, name) {
    // Навсегда заблокированные демо-игроки проверяются в первую очередь
    if (typeof isBlockedDemoPlayer === 'function' && isBlockedDemoPlayer(id, name)) return true;
    var list = getDeletedPlayerIds();
    if (!list.length) return false;
    if (id && list.indexOf(id) !== -1) return true;
    var nm = name ? normalizeSearchText(name) : '';
    return !!nm && list.indexOf(nm) !== -1;
}

function markPlayerDeleted(id, name) {
    try {
        var list = getDeletedPlayerIds();
        var add = function(v) {
            if (v && list.indexOf(v) === -1) list.push(v);
        };
        add(id);
        add(name ? normalizeSearchText(name) : '');
        localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify(list));
    } catch(e) {}
}

// ==========================================
// НАВСЕГДА ЗАБЛОКИРОВАННЫЕ ДЕМО-ИГРОКИ
// Старые версии сайта жёстко «подмешивали» в списки игроков демо-записи
// (Петр Один, Пётр Петров, Александр Иванов, Анна Воробьёва и т.д.).
// Из-за этого при каждом обновлении сайта они появлялись снова.
// Демо-список полностью УДАЛЁН из кода, а все известные id и имена
// навсегда заблокированы: даже если их запись осталась в Firebase
// (users / rounds) или в локальных кэшах старых версий, они нигде
// больше не показываются и не могут быть созданы заново.
// ==========================================
var BLOCKED_DEMO_PLAYER_IDS = [
    'user_petr_odin_17',
    'user_petr_odin_21',
    'user_petr_p',
    'user_vasya_p',
    'user_anna_v',
    'user_alex_i',
    'user_ekaterina_p',
    'user_dmitry_s',
    'user_elena_k'
];

// Нормализованные имена (ё → е, нижний регистр, схлопнутые пробелы),
// включая варианты «Фамилия Имя», чтобы заблокировать и ghost-записи.
var BLOCKED_DEMO_PLAYER_NAMES = [
    'петр один',
    'один петр',
    'петр петров',
    'петров петр',
    'вася петров',
    'петров вася',
    'анна воробьева',
    'воробьева анна',
    'александр иванов',
    'иванов александр',
    'екатерина петрова',
    'петрова екатерина',
    'дмитрий смирнов',
    'смирнов дмитрий',
    'елена кузнецова',
    'кузнецова елена'
];

function isBlockedDemoPlayer(id, name) {
    if (id && BLOCKED_DEMO_PLAYER_IDS.indexOf(id) !== -1) return true;
    // ghost-записи из истории раундов имеют вид guest_name_имя_фамилия
    if (id && String(id).indexOf('guest_name_') === 0) {
        var ghostName = String(id).slice('guest_name_'.length).replace(/_/g, ' ').replace(/ё/g, 'е');
        ghostName = ghostName.replace(/\s+/g, ' ').trim();
        if (ghostName && BLOCKED_DEMO_PLAYER_NAMES.indexOf(ghostName) !== -1) return true;
    }
    if (name) {
        var nm = normalizeSearchText(name);
        if (nm && BLOCKED_DEMO_PLAYER_NAMES.indexOf(nm) !== -1) return true;
    }
    return false;
}
if (typeof window !== 'undefined') {
    window.isBlockedDemoPlayer = isBlockedDemoPlayer;
    window.BLOCKED_DEMO_PLAYER_IDS = BLOCKED_DEMO_PLAYER_IDS;
    window.BLOCKED_DEMO_PLAYER_NAMES = BLOCKED_DEMO_PLAYER_NAMES;
}

// Флаг «полной очистки» сохранён для обратной совместимости с админкой.
// Встроенных демо-игроков в коде больше нет.
function areDefaultPlayersCleared() {
    try { return localStorage.getItem('pestovo_defaults_cleared') === 'true'; } catch(e) { return false; }
}

// Встроенные демо-игроки навсегда удалены из кода — кэш игроков стартует пустым.
var cachedRegisteredUsers = {};

function purgeBlockedFromPlayerCaches() {
    var clean = function(raw) {
        if (!raw) return raw;
        try {
            var obj = JSON.parse(raw);
            if (obj && typeof obj === 'object') {
                Object.keys(obj).forEach(function(k) {
                    try {
                        var u = obj[k];
                        if (isBlockedDemoPlayer(k, u && u.name)) delete obj[k];
                    } catch(_){}
                });
            }
            return obj;
        } catch(e) {
            return {};
        }
    };
    try {
        var c1 = localStorage.getItem('pestovo_cached_users');
        if (c1) {
            var cleaned1 = clean(c1);
            localStorage.setItem('pestovo_cached_users', JSON.stringify(cleaned1));
        }
    } catch(e) {}
    try {
        var c2 = localStorage.getItem('pestovo_custom_players');
        if (c2) {
            var cleaned2 = clean(c2);
            localStorage.setItem('pestovo_custom_players', JSON.stringify(cleaned2));
        }
    } catch(e) {}
}

// Полностью стирает локальный кэш игроков (и в памяти, и в localStorage),
// а также «прячет» встроенных демо-игроков, чтобы после удаления всех данных
// в админке ни один игрок нигде не всплыл заново.
function wipeLocalPlayerCaches() {
    try {
        localStorage.removeItem('pestovo_cached_users');
        localStorage.removeItem('pestovo_custom_players');
        localStorage.setItem('pestovo_defaults_cleared', 'true');
        // Сброс списка удалённых игроков — после полной очистки база пуста,
        // никакие id не должны считаться «удалёнными» (чтобы не мешали новой работе)
        localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify([]));
    } catch(e) {}

    if (typeof cachedRegisteredUsers === 'object' && cachedRegisteredUsers) {
        Object.keys(cachedRegisteredUsers).forEach(function(k) {
            delete cachedRegisteredUsers[k];
        });
    }
    lastRemoteUserIds = null;
}

if (typeof window !== 'undefined') {
    window.wipeLocalPlayerCaches = wipeLocalPlayerCaches;
    window.areDefaultPlayersCleared = areDefaultPlayersCleared;
}

function syncKnownPlayersCache() {
    if (areDefaultPlayersCleared()) {
        try {
            localStorage.removeItem('pestovo_cached_users');
            localStorage.removeItem('pestovo_custom_players');
        } catch(e) {}
        return;
    }

    var deletedIds = [];
    try {
        var dRaw = localStorage.getItem('pestovo_deleted_player_ids');
        if (dRaw) deletedIds = JSON.parse(dRaw) || [];
    } catch(e) {}

    var mergeCache = function(obj) {
        Object.keys(obj).forEach(function(k) {
            if (isPlayerDeleted(k, obj[k] && obj[k].name)) return;
            if (obj[k] && obj[k].name) {
                var nKey = normalizeSearchText(obj[k].name);
                if (nKey && deletedIds.indexOf(nKey) !== -1) return;
            }
            cachedRegisteredUsers[k] = obj[k];
        });
    };

    try {
        var localCached = localStorage.getItem('pestovo_cached_users');
        if (localCached) {
            var p1 = JSON.parse(localCached);
            if (p1 && typeof p1 === 'object') mergeCache(p1);
        }
    } catch(e) {}

    try {
        var custom = localStorage.getItem('pestovo_custom_players');
        if (custom) {
            var p2 = JSON.parse(custom);
            if (p2 && typeof p2 === 'object') mergeCache(p2);
        }
    } catch(e) {}

    // Дедуп по ФИО в локальном кэше, чтобы не было сдваивания
    try {
        var entries = Object.entries(cachedRegisteredUsers);
        var deduped = dedupePlayerEntriesByFio(entries);
        // Очищаем и перезаписываем только дедуплицированными
        Object.keys(cachedRegisteredUsers).forEach(function(k){ delete cachedRegisteredUsers[k]; });
        deduped.forEach(function(en){ cachedRegisteredUsers[en[0]] = en[1]; });
    } catch(e) {}

    purgeBlockedFromPlayerCaches();
}

syncKnownPlayersCache();

var lastRemoteUserIds = null;

if (typeof db !== 'undefined') {
    try {
        db.ref('users').on('value', function(sn) {
            var val = sn.val();
            // Сброс: если после очистки БД в Firebase нет пользователей (val === null) —
            // полностью вычищаем in-memory кэш и localStorage, чтобы демо/удалённые
            // игроки не «воскрешали» при обновлении страницы.
            if (!val || typeof val !== 'object' || Object.keys(val).length === 0) {
                Object.keys(cachedRegisteredUsers).forEach(function(k) {
                    delete cachedRegisteredUsers[k];
                });
                lastRemoteUserIds = [];
                try {
                    localStorage.removeItem('pestovo_cached_users');
                    localStorage.removeItem('pestovo_custom_players');
                    localStorage.setItem('pestovo_defaults_cleared', 'true');
                } catch(e) {}
                return;
            }
            Object.assign(cachedRegisteredUsers, val);
            // Игрок, которого удалили в Firebase, должен исчезнуть из локального кэша
            // (Object.assign только добавляет, поэтому удаляем ключи из прошлого снапшота)
            if (lastRemoteUserIds) {
                lastRemoteUserIds.forEach(function(key) {
                    if (!Object.prototype.hasOwnProperty.call(val, key)) {
                        delete cachedRegisteredUsers[key];
                        // Также убираем guest_name_-записи, ссылающиеся на удалённого игрока
                        var removed = cachedRegisteredUsers[key];
                        if (removed && removed.name) {
                            var ghostKey = 'guest_name_' + removed.name.toLowerCase().replace(/\s+/g, '_');
                            delete cachedRegisteredUsers[ghostKey];
                        }
                    }
                });
            }
            lastRemoteUserIds = Object.keys(val);
            // Убираем ghost-записи гостевых игроков, для которых уже существует
            // реальная запись в users с тем же именем (иначе игрок отображался дважды)
            Object.keys(cachedRegisteredUsers).forEach(function(k) {
                if (k.indexOf('guest_name_') !== 0) return;
                var ghost = cachedRegisteredUsers[k];
                if (!ghost || !ghost.name) return;
                var gName = normalizeSearchText(ghost.name);
                var hasReal = Object.keys(val).some(function(rk) {
                    var ru = val[rk];
                    if (!ru || !ru.name) return false;
                    if (normalizeSearchText(ru.name) !== gName) return false;
                    return true; // одинаковое имя = один игрок, HCP не разделяет
                });
                if (hasReal) delete cachedRegisteredUsers[k];
            });
            // Вычищаем из кэша всех игроков, помеченных как удалённые,
            // а также навсегда заблокированных демо-игроков
            var deleted = [];
            try {
                var dRaw = localStorage.getItem('pestovo_deleted_player_ids');
                if (dRaw) deleted = JSON.parse(dRaw) || [];
            } catch(e) {}
            Object.keys(cachedRegisteredUsers).forEach(function(k) {
                var u = cachedRegisteredUsers[k];
                if (!u) return;
                if (isPlayerDeleted(k, u.name)) { delete cachedRegisteredUsers[k]; return; }
                if (deleted.indexOf(k) !== -1) { delete cachedRegisteredUsers[k]; return; }
                if (u.name) {
                    var nKey = normalizeSearchText(u.name);
                    if (nKey && deleted.indexOf(nKey) !== -1) delete cachedRegisteredUsers[k];
                }
            });
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch(e) {}
        });
        db.ref('rounds').on('value', function(sn) {
            var roundsData = sn.val() || {};
            // Когда все раунды удалены (очистка БД) — раунды не должны «воскрешать»
            // гостевые записи игроков из несуществующих раундов.
            if (!roundsData || typeof roundsData !== 'object' || Object.keys(roundsData).length === 0) {
                return;
            }
            Object.values(roundsData).forEach(function(r) {
                if (r && r.players && typeof r.players === 'object') {
                    Object.entries(r.players).forEach(function(pe) {
                        var pid = pe[0], p = pe[1];
                        if (p && p.name) {
                            var pName = p.name.trim();
                            var normName = normalizeSearchText(pName);
                            // Усиленная проверка: не воскрешаем удалённых и навсегда
                            // заблокированных демо-игроков ни по uid, ни по имени
                            var deleted = [];
                            try {
                                var dRaw = localStorage.getItem('pestovo_deleted_player_ids');
                                if (dRaw) deleted = JSON.parse(dRaw) || [];
                            } catch(e) {}
                            var isDel = (deleted.indexOf(pid) !== -1) || (normName && deleted.indexOf(normName) !== -1) || isBlockedDemoPlayer(pid, pName);
                            if (isDel) return;
                            var key = pid.startsWith('guest_') ? ('guest_name_' + pName.toLowerCase().replace(/\s+/g, '_')) : pid;
                            // Не перезаписываем существующую запись, если игрок уже в кэше с корректными данными —
                            // и только добавляем гостевую запись, если её действительно нет.
                            // Дополнительно: если игрок с таким же именем и HCP уже есть в кэше
                            // (зарегистрированный или гостевой из users) — ghost-дубль не создаём.
                            if (!cachedRegisteredUsers[key]) {
                                var dupInCache = Object.keys(cachedRegisteredUsers).some(function(ck) {
                                    if (ck === key) return false;
                                    var cu = cachedRegisteredUsers[ck];
                                    if (!cu || !cu.name) return false;
                                    if (normalizeSearchText(cu.name) !== normName) return false;
                                    return true; // дедуп по имени, без учета HCP
                                });
                                if (!dupInCache) {
                                    var parts = pName.split(' ');
                                    cachedRegisteredUsers[key] = {
                                        name: pName,
                                        firstName: parts[0] || pName,
                                        lastName: parts.slice(1).join(' ') || '',
                                        handicap: (p.exactHcpRaw != null ? p.exactHcpRaw : (p.exactHcp != null ? p.exactHcp : (p.fieldHcp || 0))),
                                        gender: p.gender || 'men',
                                        defaultTee: p.tee || (p.gender === 'women' ? 'rd' : 'bl'),
                                        isGuest: true
                                    };
                                }
                            }
                        }
                    });
                }
            });
        });
    } catch(e) {}
}

function getKnownPlayersSync() {
    syncKnownPlayersCache();
    return cachedRegisteredUsers;
}

function loadAllRegisteredUsers(callback) {
    if (typeof callback === 'function') {
        callback(getKnownPlayersSync());
    }
}


// ==========================================
// ФИО: разбор частей и отображение
// «Фамилия Имя Отчество» — только визуал автоподбора.
// В поля формы всегда кладём firstName/lastName/middleName по смыслу.
// ==========================================
function looksLikePatronymic(s) {
    s = normalizeSearchText(s || '');
    if (!s) return false;
    return /(ович|евич|ич|овна|евна|ична|инична)$/.test(s);
}

function looksLikeLastName(s) {
    s = normalizeSearchText(s || '');
    if (!s || s.length < 3) return false;
    return /(ов|ева|ова|ев|ин|ына|ина|ын|ский|цкий|ская|цкая|енко|ук|юк|ко)$/.test(s);
}

function joinNameParts(parts) {
    return (parts || []).map(function(x) { return String(x || '').trim(); }).filter(Boolean).join(' ');
}

function formatFioLastFirstMiddle(firstName, lastName, middleName) {
    return joinNameParts([lastName, firstName, middleName]);
}

function resolvePlayerNameParts(u) {
    u = u || {};
    var first = String(u.firstName || '').replace(/\s+/g, ' ').trim();
    var middle = String(u.middleName || '').replace(/\s+/g, ' ').trim();
    var last = String(u.lastName || '').replace(/\s+/g, ' ').trim();
    var name = String(u.name || '').replace(/\s+/g, ' ').trim();
    var tokens = name ? name.split(' ').filter(Boolean) : [];

    // Если имя и отчество перепутаны в полях — меняем местами.
    if (first && middle && looksLikePatronymic(first) && !looksLikePatronymic(middle)) {
        var swapped = first;
        first = middle;
        middle = swapped;
    }

    // Имя+отчество в одном поле firstName: «Иван Иванович»
    if (!middle && first && first.indexOf(' ') !== -1) {
        var fp = first.split(' ').filter(Boolean);
        if (fp.length >= 2 && looksLikePatronymic(fp[fp.length - 1])) {
            middle = fp.slice(1).join(' ');
            first = fp[0];
        }
    }

    // Отчество попало в фамилию: «Иванович Петров» или «Петров Иванович»
    if (!middle && last && last.indexOf(' ') !== -1) {
        var lp = last.split(' ').filter(Boolean);
        if (lp.length >= 2 && looksLikePatronymic(lp[0])) {
            middle = lp[0];
            last = lp.slice(1).join(' ');
        } else if (lp.length >= 2 && looksLikePatronymic(lp[lp.length - 1])) {
            middle = lp[lp.length - 1];
            last = lp.slice(0, -1).join(' ');
        }
    }

    // Добираем недостающие части из полного name, учитывая разные порядки.
    if (tokens.length >= 3 && (!first || !last || !middle)) {
        var t0 = tokens[0];
        var t1 = tokens[1];
        var tLast = tokens[tokens.length - 1];
        var tMid = tokens.slice(1, -1).join(' ');
        var tRest = tokens.slice(2).join(' ');
        if (looksLikeLastName(t0) && looksLikePatronymic(t1) && !looksLikePatronymic(tLast)) {
            // «Фамилия Отчество Имя»
            if (!last) last = t0;
            if (!middle) middle = t1;
            if (!first) first = tokens.slice(2).join(' ');
        } else if (looksLikeLastName(t0) && looksLikePatronymic(tLast)) {
            // «Фамилия Имя Отчество»
            if (!last) last = t0;
            if (!first) first = t1;
            if (!middle) middle = tRest;
        } else if (looksLikePatronymic(t1) || looksLikeLastName(tLast)) {
            // «Имя Отчество Фамилия»
            if (!first) first = t0;
            if (!middle) middle = tMid;
            if (!last) last = tLast;
        } else if (looksLikeLastName(t0)) {
            if (!last) last = t0;
            if (!first) first = t1;
            if (!middle) middle = tRest;
        } else {
            if (!first) first = t0;
            if (!last) last = tLast;
            if (!middle) middle = tMid;
        }
    } else if (tokens.length === 2 && (!first || !last)) {
        if (looksLikeLastName(tokens[0]) && !looksLikeLastName(tokens[1])) {
            if (!last) last = tokens[0];
            if (!first) first = tokens[1];
        } else {
            if (!first) first = tokens[0];
            if (!last) last = tokens[1];
        }
    } else if (tokens.length === 1) {
        if (!first && !last) first = tokens[0];
    }

    var displayName = formatFioLastFirstMiddle(first, last, middle) || name;
    return {
        firstName: first,
        lastName: last,
        middleName: middle,
        displayName: displayName,
        storedName: name
    };
}

if (typeof window !== 'undefined') {
    window.resolvePlayerNameParts = resolvePlayerNameParts;
    window.formatFioLastFirstMiddle = formatFioLastFirstMiddle;
}

var currentAutocompleteMatches = [];
var currentAutocompleteCallback = null;
var activeAutocompleteDropdown = null;

function handlePlayerSelect(evt, idx) {
    if (evt) {
        if (evt.preventDefault) evt.preventDefault();
        if (evt.stopPropagation) evt.stopPropagation();
    }
    var match = currentAutocompleteMatches[idx];
    if (match && typeof currentAutocompleteCallback === 'function') {
        currentAutocompleteCallback(match);
    }
    if (activeAutocompleteDropdown) {
        activeAutocompleteDropdown.style.display = 'none';
        activeAutocompleteDropdown.classList.add('hidden');
    }
}

function attachPlayerNameAutocomplete(inputEl, containerEl, onSelectCallback) {
    if (!inputEl) return;
    initPlayerSearchAutofill({
        searchInputId: inputEl.id,
        onSelect: onSelectCallback,
        onClear: null
    });
}

function initPlayerSearchAutofill(opts) {
    opts = opts || {};
    var searchInputId = opts.searchInputId;
    var onSelect = opts.onSelect;
    var onClear = opts.onClear;

    var inputEl = document.getElementById(searchInputId);
    if (!inputEl) return;

    inputEl.setAttribute('autocomplete', 'off');
    inputEl.setAttribute('autocorrect', 'off');

    var parent = inputEl.parentElement;
    if (parent) {
        parent.style.position = 'relative';
        parent.style.overflow = 'visible';
    }

    var oldDropdown = parent ? parent.querySelector('.autocomplete-suggestions') : null;
    if (oldDropdown) oldDropdown.remove();

    var dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-suggestions hidden';
    dropdown.style.display = 'none';

    if (parent) {
        parent.appendChild(dropdown);
    } else {
        document.body.appendChild(dropdown);
    }

    var activeMatches = [];
    var highlightedIdx = -1;

    var updateHighlight = function() {
        var items = dropdown.querySelectorAll('.autocomplete-item');
        items.forEach(function(item, i) {
            if (i === highlightedIdx) {
                item.classList.add('active-keyboard');
                try { item.scrollIntoView({ block: 'nearest' }); } catch(e) {}
            } else {
                item.classList.remove('active-keyboard');
            }
        });
    };

    var triggerSelection = function(match) {
        if (!match) return;
        if (typeof onSelect === 'function') {
            onSelect(match);
        }
        dropdown.style.display = 'none';
        dropdown.classList.add('hidden');
        highlightedIdx = -1;
        try { inputEl.blur(); } catch(e) {}
    };

    var handleInput = function() {
        var query = inputEl.value.trim().toLowerCase();
        if (!query || query.length < 1) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
            if (typeof onClear === 'function') onClear();
            return;
        }

        var usersData = getKnownPlayersSync();
        var matches = [];
        var seenKeys = {};

        Object.entries(usersData || {}).forEach(function(e) {
            var uid = e[0];
            var u = e[1];
            var name = (u.name || '').trim();
            var parts = resolvePlayerNameParts(u);
            var fn = parts.firstName;
            var mn = parts.middleName;
            var ln = parts.lastName;
            var email = (u.email || '').trim();

            // Подсказка и выбранная строка: «Фамилия Имя Отчество».
            // Части first/last/middle при этом остаются своими — ими заполняем поля.
            var full = parts.displayName || name;
            if (!full) return;

            // Защита: не показывать удалённых в админке игроков
            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, name)) return;

            // Короткая старая запись «Имя Фамилия» и обновлённая запись
            // «Имя Отчество Фамилия» — один человек. Ключ без HCP и отчества
            // убирает старый guest-вариант из автодобавления после синхронизации.
            var normKey = (fn && ln)
                ? normalizeSearchText(fn + ' ' + ln)
                : normalizeSearchText(full);
            var isGuestEntry = !!u.isGuest || String(uid).indexOf('guest_') === 0;
            var prevUid = seenKeys[normKey];
            if (prevUid !== undefined) {
                // Приоритет: зарегистрированная запись, затем запись с полным ФИО.
                var prev = usersData[prevUid] || {};
                var prevIsGuest = !!prev.isGuest || String(prevUid).indexOf('guest_') === 0;
                var prevMiddle = String(prev.middleName || '').trim();
                var preferNew = (prevIsGuest && !isGuestEntry) ||
                    (prevIsGuest === isGuestEntry && !prevMiddle && !!mn);
                if (preferNew) {
                    matches = matches.filter(function(m) { return m.uid !== prevUid; });
                } else {
                    return;
                }
            }

            var fnLower = fn.toLowerCase();
            var mnLower = mn.toLowerCase();
            var lnLower = ln.toLowerCase();
            var fullLower = full.toLowerCase();
            var nameLower = name.toLowerCase();

            var isPrefixMatch = (fnLower.startsWith(query) || mnLower.startsWith(query) || lnLower.startsWith(query) || fullLower.startsWith(query) || nameLower.startsWith(query) || fullLower.includes(query));

            if (isPrefixMatch) {
                seenKeys[normKey] = uid;
                var playerObj = {
                    uid: uid,
                    name: full,
                    firstName: fn,
                    lastName: ln,
                    middleName: mn,
                    handicap: u.handicap != null ? u.handicap : 0,
                    gender: u.gender || 'men',
                    defaultTee: u.defaultTee || (u.gender === 'women' ? 'rd' : 'bl'),
                    isGuest: isGuestEntry
                };
                matches.push(playerObj);
            }
        });

        if (matches.length === 0) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
            return;
        }

        activeMatches = matches;
        currentAutocompleteMatches = matches;
        currentAutocompleteCallback = onSelect;
        activeAutocompleteDropdown = dropdown;
        highlightedIdx = -1;

        var html = '';
        matches.slice(0, 8).forEach(function(m, idx) {
            var gIcon = m.gender === 'women' ? '👩' : '👨';
            var hcpText = fmtExactHcp(m.handicap) + ' HCP';
            // Пометка «Гость» в подсказках убрана — все игроки выглядят одинаково.
            var guestTag = '';

            html += '<div class="autocomplete-item" data-idx="' + idx + '" style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);min-height:44px;">';
            html += '<span>' + gIcon + ' <strong style="color:var(--white);font-size:14px;">' + escapeHtml(m.name) + '</strong>' + guestTag + '</span>';
            html += '<span style="color:var(--gold);font-weight:700;font-size:13px;">' + hcpText + '</span>';
            html += '</div>';
        });

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
        dropdown.classList.remove('hidden');

        dropdown.querySelectorAll('.autocomplete-item').forEach(function(item) {
            // На телефоне список нужно уметь ПРОКРУЧИВАТЬ: раньше touchstart
            // с preventDefault мгновенно выбирал строку под пальцем и не давал
            // скроллу сработать (было видно только ~3 имени из 7+).
            // Теперь выбор происходит на touchend только если палец не
            // сместился (это был тап, а не прокрутка списка).
            var touch = null;
            var suppressClick = false;

            item.addEventListener('touchstart', function(evt) {
                var t = evt.touches && evt.touches[0];
                touch = t ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
            }, { passive: true });

            item.addEventListener('touchmove', function(evt) {
                if (!touch) return;
                var t = evt.touches && evt.touches[0];
                if (t && (Math.abs(t.clientY - touch.y) > 10 || Math.abs(t.clientX - touch.x) > 10)) {
                    touch.moved = true; // это жест прокрутки, а не тап
                }
            }, { passive: true });

            item.addEventListener('touchend', function(evt) {
                if (!touch) return;
                var dt = Date.now() - touch.t;
                var wasTap = !touch.moved && dt < 600;
                touch = null;
                if (!wasTap) { suppressClick = true; setTimeout(function(){ suppressClick = false; }, 400); return; }
                evt.preventDefault();
                evt.stopPropagation();
                var idx = parseInt(item.getAttribute('data-idx'));
                var match = activeMatches[idx];
                if (match) triggerSelection(match);
                suppressClick = true;
                setTimeout(function(){ suppressClick = false; }, 400);
            });

            item.addEventListener('mousedown', function(evt) {
                if (suppressClick) return;
                evt.preventDefault();
                evt.stopPropagation();
                var idx = parseInt(item.getAttribute('data-idx'));
                var match = activeMatches[idx];
                if (match) triggerSelection(match);
            });

            item.addEventListener('click', function(evt) {
                if (suppressClick) { evt.preventDefault(); evt.stopPropagation(); return; }
                evt.stopPropagation();
                var idx = parseInt(item.getAttribute('data-idx'));
                var match = activeMatches[idx];
                if (match) triggerSelection(match);
            });
        });
    };

    inputEl.addEventListener('keydown', function(e) {
        if (dropdown.style.display === 'none' || activeMatches.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIdx = (highlightedIdx + 1) % activeMatches.length;
            updateHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIdx = (highlightedIdx - 1 + activeMatches.length) % activeMatches.length;
            updateHighlight();
        } else if (e.key === 'Enter') {
            if (highlightedIdx >= 0 && highlightedIdx < activeMatches.length) {
                e.preventDefault();
                triggerSelection(activeMatches[highlightedIdx]);
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
        }
    });

    inputEl.addEventListener('input', handleInput);
    inputEl.addEventListener('focus', handleInput);

    document.addEventListener('touchstart', function(e) {
        if (e.target !== inputEl && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
        }
    });
    document.addEventListener('click', function(e) {
        if (e.target !== inputEl && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
        }
    });
}

// ==========================================
// КОНФИДЕНЦИАЛЬНОСТЬ ИМЁН (ФИО)
// Админ может скрывать полные имена игроков (имя/фамилия/отчество) от других
// игроков и гостей. Вместо ФИО показываются инициалы («И. Т.») или маска
// («Игрок №N»). Гандикап и история раундов остаются доступны. Админ и сам
// игрок всегда видят своё имя. Настройки: settings/privacy в Firebase:
//   { enabled: bool, maskMode: 'initials'|'masked', players: { uid: bool } }
// Для конкретного игрока players[uid]=true — скрыть (перекрывает глобальный
// выключатель), players[uid]=false — показывать, даже если включено глобально.
// ==========================================
var pestovoPrivacy = { enabled: false, maskMode: 'initials', players: {}, loaded: false };

function initPrivacySettings() {
    // Начальные значения из локального кэша (офлайн/при первом кадре)
    try {
        var cached = localStorage.getItem('pestovo_privacy');
        if (cached) {
            var c = JSON.parse(cached);
            if (c && typeof c === 'object') {
                pestovoPrivacy.enabled = c.enabled === true;
                pestovoPrivacy.maskMode = c.maskMode === 'masked' ? 'masked' : 'initials';
                pestovoPrivacy.players = c.players || {};
            }
        }
    } catch (e) {}

    if (typeof db === 'undefined') { pestovoPrivacy.loaded = true; return; }
    try {
        db.ref('settings/privacy').on('value', function(sn) {
            var v = sn.val() || {};
            pestovoPrivacy.enabled = v.enabled === true;
            pestovoPrivacy.maskMode = v.maskMode === 'masked' ? 'masked' : 'initials';
            pestovoPrivacy.players = v.players || {};
            pestovoPrivacy.loaded = true;
            try {
                localStorage.setItem('pestovo_privacy', JSON.stringify({
                    enabled: pestovoPrivacy.enabled,
                    maskMode: pestovoPrivacy.maskMode,
                    players: pestovoPrivacy.players
                }));
            } catch (e2) {}
            // После обновления настроек приватности — перерисуем открытые блоки на главной
            if (typeof renderPrivacySensitiveHome === 'function') renderPrivacySensitiveHome();
        }, function() {});
    } catch (e) { pestovoPrivacy.loaded = true; }
}

// Текущий пользователь — администратор (по данным профиля или флагу сессии).
// Нужен для служебных уведомлений, которые видны только админу
// (завершение турнира, доступность протокола результатов).
function pestovoIsAdminViewer() {
    try {
        if (typeof hasAdminPanelAccess === 'function') return !!hasAdminPanelAccess();
    } catch (e) {}
    try {
        if (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.role === 'admin') return true;
        if (sessionStorage.getItem('pestovo_is_admin') === 'true') return true;
    } catch (e) {}
    return false;
}

function privacyIsAdmin() {
    return pestovoIsAdminViewer();
}

function privacyShouldHide(pid) {
    if (typeof currentUser !== 'undefined' && currentUser && pid && currentUser.uid === pid) return false;
    if (privacyIsAdmin()) return false;
    if (!pid) return false;
    var ind = pestovoPrivacy.players && pestovoPrivacy.players[pid];
    if (ind === false) return false;   // явное «показывать» для этого игрока
    if (ind === true) return true;     // явное «скрыть» для этого игрока
    return pestovoPrivacy.enabled === true;
}

function privacyMaskNumber(s) {
    var h = 0;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return (h % 999) + 1;
}

function privacyMaskName(name, pid) {
    if (pestovoPrivacy.maskMode === 'masked') {
        var word = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'Player' : 'Игрок';
        return word + ' №' + privacyMaskNumber(pid || name);
    }
    // Инициалы: «Иван Тестов» → «И. Т.»
    var parts = String(name || '').replace(/\s+/g, ' ').trim().split(' ');
    var initials = parts.filter(Boolean).slice(0, 2).map(function(w) { return w.charAt(0).toUpperCase() + '.'; }).join(' ');
    return initials || '?';
}

function playerDisplayName(p, pid) {
    if (!p) return '—';
    var name = p.name && String(p.name).trim();
    if (!name && (p.firstName || p.lastName || p.middleName)) {
        name = [p.firstName, p.middleName, p.lastName].filter(function(x) {
            return x && String(x).trim();
        }).map(function(x) { return String(x).trim(); }).join(' ');
    }
    return name || '—';
}

function privacyDisplayName(p, pid) {
    if (!p) return '—';
    var name = playerDisplayName(p, pid);
    if (privacyShouldHide(pid)) return privacyMaskName(name, pid);
    return name;
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof initPrivacySettings === 'function') initPrivacySettings();
});

// ============================================================
// РАЗМЕРЫ ФЛАЙТОВ БЕЗ ГРУПП ПО 2 ЧЕЛОВЕКА
// ------------------------------------------------------------
// pestovoBalancedFlightSizes(total, preferSize) возвращает массив размеров
// флайтов (сумма = total), в котором нет групп по 1–2 человека, если это
// вообще возможно. Хвост по 2 перераспределяется: вместо 4+4+…+2 получаются
// тройки (например 14 игроков → 4+4+3+3, 9 игроков → 3+3+3).
// Неизбежные исключения: total<=5 при preferSize>=3 (5 = 3+2) и total<=2.
// preferSize 1–2 означает явный выбор админа — уважаем его как есть.
// Используется и в «Старте турнира», и в генераторе флайтов.
// ============================================================
function pestovoBalancedFlightSizes(total, preferSize) {
    total = Math.max(0, parseInt(total, 10) || 0);
    preferSize = parseInt(preferSize, 10) || 4;
    if (total <= 0) return [];
    if (total === 1) return [1];
    if (total === 2) return [2];
    if (preferSize <= 2) {
        // Явный выбор админа: режем строго по размеру, хвост как есть.
        var outSmall = [];
        var left = total;
        while (left > preferSize) { outSmall.push(preferSize); left -= preferSize; }
        outSmall.push(left);
        return outSmall;
    }
    if (preferSize >= 4) {
        var full = Math.floor(total / 4);
        var rem = total % 4;
        var out = [];
        var i;
        if (rem === 0) {
            for (i = 0; i < full; i++) out.push(4);
            return out;
        }
        if (rem === 3) {
            for (i = 0; i < full; i++) out.push(4);
            out.push(3);
            return out;
        }
        if (rem === 2) {
            // total>=6 здесь всегда (меньшие разобраны выше): 6 → 3+3, 10 → 4+3+3.
            for (i = 0; i < full - 1; i++) out.push(4);
            out.push(3); out.push(3);
            return out;
        }
        // rem === 1: забираем две четвёрки и делаем три тройки (13 → 4+3+3+3)
        if (full >= 2) {
            for (i = 0; i < full - 2; i++) out.push(4);
            out.push(3); out.push(3); out.push(3);
            return out;
        }
        // total = 5 или 9: 5 → 3+2 (неизбежно), 9 → 3+3+3
        if (total === 9) return [3, 3, 3];
        return [3, 2];
    }
    // preferSize === 3: базовые тройки, хвост по 1–2 чиним четвёрками.
    var full3 = Math.floor(total / 3);
    var rem3 = total % 3;
    var out3 = [];
    var j;
    if (rem3 === 0) {
        for (j = 0; j < full3; j++) out3.push(3);
        return out3;
    }
    if (rem3 === 1) {
        if (full3 < 1) return [total]; // total=1 уже обработан выше
        for (j = 0; j < full3 - 1; j++) out3.push(3);
        out3.push(4); // 7 → 3+4, 4 → 4
        return out3;
    }
    // rem3 === 2: две тройки + хвост 2 → две четвёрки (8 → 4+4)
    if (full3 >= 2) {
        for (j = 0; j < full3 - 2; j++) out3.push(3);
        out3.push(4); out3.push(4);
        return out3;
    }
    return [3, 2]; // total = 5, неизбежно
}

// ============================================================
// ФОРМАТЫ ИГРЫ ТУРНИРА (единый список для всего сайта)
// ------------------------------------------------------------
// Gross — игра на валовые удары без учёта гандикапа,
// Net — с учётом гандикапа. Строки хранятся как есть в поле
// tournaments/<id>/formats и rounds/<id>/format.
// ============================================================
var PESTOVO_FORMAT_PRESETS = [
    'Stroke Play',
    'Stroke Play (Gross)',
    'Stroke Play (Net)',
    'Stableford',
    'Match Play 1v1',
    'Match Play 2v2',
    'Scramble',
    'Texas Scramble',
    'Greensomes'
];

function pestovoFormatLabel(f) {
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    if (f === 'Stroke Play') return en ? 'Stroke Play' : 'Stroke Play';
    if (f === 'Stroke Play (Gross)') return en ? 'Gross (no handicap)' : 'Гросс (без учёта HCP)';
    if (f === 'Stroke Play (Net)') return en ? 'Net (with handicap)' : 'Нетто (с учётом HCP)';
    if (f === 'Stableford') return en ? 'Stableford (points)' : 'Stableford (очки)';
    if (f === 'Match Play 1v1') return en ? 'Match Play (1v1)' : 'Match Play (1×1)';
    if (f === 'Match Play 2v2') return en ? 'Match Play (2v2)' : 'Match Play (2×2)';
    return String(f == null ? '' : f);
}

// ============================================================
// ТУРНИРНЫЕ ГРУППЫ ПО ГАНДИКАПУ (дивизионы) + ОБРЕЗКА ГАНДИКАПА
// ------------------------------------------------------------
// Дивизион турнира: { id, name, gender: 'men'|'women'|'all',
//                     hcpFrom, hcpTo, tee: 'bk'|'bl'|'wh'|'rd'|'' }
// Хранится в tournaments/<id>/divisions (объект или массив).
// Обрезка гандикапа (только для текущего турнира):
//   cut = { enabled, percent, maxEnabled, maxMen, maxWomen }
// Сначала применяется процент, затем максимум по полу.
// ============================================================
function tnNormalizeDivisions(tVal) {
    var raw = tVal ? tVal.divisions : null;
    if (!raw) return [];
    var arr = Array.isArray(raw) ? raw.slice() : Object.keys(raw).map(function(k) {
        var d = raw[k] || {};
        if (!d.id) d.id = k;
        return d;
    });
    arr = arr.filter(function(d) { return d && (d.name || d.hcpFrom != null || d.hcpTo != null); });
    arr.sort(function(a, b) {
        var ga = (a.gender || 'all'), gb = (b.gender || 'all');
        var order = { men: 0, women: 1, all: 2 };
        if ((order[ga] == null ? 3 : order[ga]) !== (order[gb] == null ? 3 : order[gb])) {
            return (order[ga] == null ? 3 : order[ga]) - (order[gb] == null ? 3 : order[gb]);
        }
        var fa = (a.hcpFrom === '' || a.hcpFrom == null) ? -999 : parseFloat(a.hcpFrom);
        var fb = (b.hcpFrom === '' || b.hcpFrom == null) ? -999 : parseFloat(b.hcpFrom);
        if (isNaN(fa)) fa = -999;
        if (isNaN(fb)) fb = -999;
        return fa - fb;
    });
    return arr;
}

function tnDivisionGenderOk(divGender, playerGender) {
    var g = divGender || 'all';
    if (g === 'all') return true;
    // Страховка от неканоничных значений пола в старых данных
    // ('f'/'female'/'жен' → 'women', прочее — 'men').
    var p = playerGender;
    if (p !== 'men' && p !== 'women') {
        var s = String(p == null ? '' : p).toLowerCase();
        if (s === 'w' || s === 'f' || s === 'women' || s === 'woman' || s === 'female' || s.indexOf('жен') === 0 || s.indexOf('дев') === 0) p = 'women';
        else p = 'men';
    }
    return p === g;
}

// Точный состав группы, созданной «Умными группами» (auto).
// Хранится как { <ключ заявки>: <нормализованное ФИО> } — это позволяет
// однозначно определить группу игрока даже там, где ключ в раунде отличается
// от ключа заявки (турнирный протокол создаёт игроков по uid/ФИО).
function tnDivisionMembers(d) {
    if (!d || !d.members || typeof d.members !== 'object') return null;
    return d.members;
}

// Нормализованный ключ ФИО (для сопоставления по имени, как в tnDedupeRoster).
function tnDivisionFioKey(name) {
    var s = String(name == null ? '' : name).toLowerCase().replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
    return s;
}

// Входит ли игрок в точный состав группы. memberRef — строка (pid) либо
// объект { pid, name, fioKey }.
function tnDivisionHasMember(d, memberRef) {
    var members = tnDivisionMembers(d);
    if (!members) return false;
    var pid = '', fio = '';
    if (memberRef && typeof memberRef === 'object') {
        pid = memberRef.pid != null ? String(memberRef.pid) : '';
        fio = memberRef.fioKey || tnDivisionFioKey(memberRef.name || memberRef.fio || '');
    } else if (memberRef != null) {
        pid = String(memberRef);
        fio = tnDivisionFioKey(memberRef);
    }
    if (pid && Object.prototype.hasOwnProperty.call(members, pid)) return true;
    if (fio) {
        var keys = Object.keys(members);
        for (var i = 0; i < keys.length; i++) {
            if (String(members[keys[i]] || '') === fio) return true;
        }
    }
    return false;
}

function tnFindDivision(tVal, handicap, gender, memberRef) {
    var divs = tnNormalizeDivisions(tVal);
    if (!divs.length) return null;
    gender = gender || 'men';
    // 1. Точный состав «умных групп» важнее диапазона гандикапа: границы
    //    соседних групп могут соприкасаться (28–28 и 28–28), и по диапазону
    //    игрок попадал бы не в свою группу.
    if (memberRef) {
        for (var mi = 0; mi < divs.length; mi++) {
            var dm = divs[mi];
            if (!tnDivisionGenderOk(dm.gender, gender)) continue;
            if (tnDivisionHasMember(dm, memberRef)) return dm;
        }
    }
    // 2. Диапазон гандикапа (ручные группы и старые данные без состава).
    // Округляем до 0.1 — точный гандикап и границы групп хранятся с шагом
    // 0.1, а сравнение «в лоб» плавает из-за двоичных ошибок (35.9 против
    // границы 36, 36.04 и т.п.). Без этого игрок на границе мог выпасть
    // в «Без группы».
    var h = (handicap === '' || handicap == null) ? null : parseFloat(handicap);
    if (h == null || isNaN(h)) return null;
    h = Math.round(h * 10) / 10;
    for (var i = 0; i < divs.length; i++) {
        var d = divs[i];
        if (!tnDivisionGenderOk(d.gender, gender)) continue;
        var from = (d.hcpFrom === '' || d.hcpFrom == null) ? -999 : parseFloat(d.hcpFrom);
        var to = (d.hcpTo === '' || d.hcpTo == null) ? 999 : parseFloat(d.hcpTo);
        if (isNaN(from)) from = -999;
        if (isNaN(to)) to = 999;
        from = Math.round(from * 10) / 10;
        to = Math.round(to * 10) / 10;
        if (h + 1e-9 >= from && h - 1e-9 <= to) return d;
    }
    return null;
}

function tnDivisionRangeText(div) {
    if (!div) return '';
    var f = (div.hcpFrom === '' || div.hcpFrom == null) ? null : parseFloat(div.hcpFrom);
    var t = (div.hcpTo === '' || div.hcpTo == null) ? null : parseFloat(div.hcpTo);
    var fmt = function(v) {
        if (v == null || isNaN(v)) return '';
        if (typeof fmtExactHcp === 'function') return fmtExactHcp(v);
        return String(v);
    };
    if (f != null && !isNaN(f) && t != null && !isNaN(t)) return fmt(f) + '–' + fmt(t);
    if (f != null && !isNaN(f)) return fmt(f) + '+';
    if (t != null && !isNaN(t)) return '–' + fmt(t);
    return '';
}

function tnDivisionGenderText(g) {
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    if (g === 'men') return en ? 'Men' : 'Мужчины';
    if (g === 'women') return en ? 'Women' : 'Девушки';
    return en ? 'All' : 'Все';
}

// Обрезка точного гандикапа для турнира.
// cut = { enabled: bool, percent: 1..100,
//         maxEnabled: bool, maxMen: number|null, maxWomen: number|null }
// Порядок (с v1.46.0): СНАЧАЛА процент, ЗАТЕМ максимум по полу.
//   точный HCP → процент → новый точный обрезанный → (максимум по полу) → полевой.
// Процент и максимум включаются НЕЗАВИСИМО: можно резать только процентами,
// только максимумом по полу или и тем, и другим сразу.
// Возвращает { raw, afterPercent, capped, effective, cappedByMax, cutApplied }.
function tnApplyHcpCut(exactHcp, gender, cut) {
    var raw = (exactHcp === '' || exactHcp == null) ? 0 : parseFloat(exactHcp);
    if (isNaN(raw)) raw = 0;
    var out = { raw: raw, afterPercent: raw, capped: raw, effective: raw, cappedByMax: false, cutApplied: false };
    cut = cut || {};
    // Шаг 1: процент (если включён).
    var eff = raw;
    if (cut.enabled) {
        var pct = parseFloat(cut.percent);
        if (isNaN(pct) || pct <= 0) pct = 100;
        if (pct > 100) pct = 100;
        if (pct < 100 - 1e-9) {
            eff = Math.round(raw * pct) / 100;
            out.cutApplied = true;
        }
    }
    out.afterPercent = Math.round(eff * 10) / 10;
    // Шаг 2: максимум по полу (если включён).
    // Старые протоколы (до v1.46.0) флага maxEnabled не имеют — для них максимум
    // действует, как раньше, если значение задано.
    var maxOn = (cut.maxEnabled === undefined || cut.maxEnabled === null)
        ? ((cut.maxMen !== '' && cut.maxMen != null) || (cut.maxWomen !== '' && cut.maxWomen != null))
        : (cut.maxEnabled === true);
    var maxV = null;
    if ((gender || 'men') === 'women') maxV = (cut.maxWomen === '' || cut.maxWomen == null) ? null : parseFloat(cut.maxWomen);
    else maxV = (cut.maxMen === '' || cut.maxMen == null) ? null : parseFloat(cut.maxMen);
    if (maxOn && maxV != null && !isNaN(maxV) && eff > maxV) {
        eff = maxV;
        out.cappedByMax = true;
        out.cutApplied = true;
    }
    out.capped = eff;
    out.effective = Math.round(eff * 10) / 10;
    return out;
}

// Полевой гандикап турнира с учётом обрезки (сначала процент, затем максимум по полу).
function tnTournamentFieldHcp(exactHcp, teeCode, gender, cut) {
    var eff = tnApplyHcpCut(exactHcp, gender, cut).effective;
    if (typeof getFieldHcp === 'function') {
        try { return getFieldHcp(eff, teeCode || 'wh', gender || 'men'); } catch (e) {}
    }
    return Math.round(eff || 0);
}

// Название турнира для баннера и главной. Протокол хранит «Кубок · старт» в protocolName —
// суффикс старта убираем, чтобы на карточке и главной было имя турнира.
function roundTournamentName(r) {
    if (!r || typeof r !== 'object') return '';
    var name = String(r.tournamentName || '').trim();
    if (!name) {
        var proto = String(r.protocolName || '').trim();
        if (proto) name = proto.replace(/\s*[·•]\s*(старт|start)\s*$/i, '').trim();
    }
    return name;
}

function isTournamentRound(r) {
    if (!r || typeof r !== 'object') return false;
    if (r.tournamentId || r.protocolId) return true;
    return !!roundTournamentName(r);
}

function updateRoundEventBanner(roundData) {
    var banner = (typeof document !== 'undefined') ? document.getElementById('round-event-banner') : null;
    if (!banner) return;
    var name = roundTournamentName(roundData);
    if (!name) {
        banner.classList.add('hidden');
        return;
    }
    banner.classList.remove('hidden');
    var title = document.getElementById('round-event-title');
    var sub = document.getElementById('round-event-sub');
    if (title) title.textContent = name;
    if (sub) {
        var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        var bits = [];
        if (roundData && roundData.groupNo) bits.push((isEn ? 'Group ' : 'Группа ') + roundData.groupNo);
        if (roundData && roundData.format) bits.push(roundData.format);
        sub.textContent = bits.join(' · ');
    }
}
// ==========================================================
// СТАРТ ТУРНИРА: РАУНДЫ АКТИВНЫ ТОЛЬКО ПОСЛЕ СТАРТА
// ----------------------------------------------------------
// Раунды, созданные из стартового протокола заранее, получают статус
// «scheduled» и поле scheduledStart (момент старта турнира). Игрок, который
// отсканировал QR раньше времени, видит таймер обратного отсчёта и НЕ может
// вводить счёт. Раунд становится игровым ровно в момент старта:
//   1) автоматически — по совпадению даты и времени (см. pestovoAutoStartRounds),
//   2) вручную — кнопкой «Старт» в админ-меню (tnStartTournament).
// ==========================================================

// Статус раунда, который ещё не стартовал (создан протоколом заранее).
var ROUND_STATUS_SCHEDULED = 'scheduled';

// Время старта турнира из даты (YYYY-MM-DD) и времени (HH:MM).
function pestovoStartTsFromParts(dateStr, timeStr) {
    var d = String(dateStr || '').trim();
    var tm = String(timeStr || '').trim();
    if (!d) return 0;
    if (!tm) tm = '09:00';
    var ts = new Date(d + 'T' + (tm.indexOf(':') === 4 ? tm : tm + ':00')).getTime();
    if (!isNaN(ts)) return ts;
    // Запасной разбор: «9:00» / «09:00:00»
    var parts = tm.split(':');
    var base = new Date(d + 'T00:00:00').getTime();
    if (isNaN(base)) return 0;
    return base + ((parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60) * 1000;
}

// Момент старта раунда: явное поле scheduledStart (ставится при создании из
// протокола) → startTime раунда → 0, если раунд не турнирный/без времени.
function roundScheduledStartTs(r) {
    if (!r || typeof r !== 'object') return 0;
    return parseInt(r.scheduledStart, 10) || parseInt(r.startTime, 10) || 0;
}

// Открыт ли раунд для ввода счёта прямо сейчас.
// «active» — всегда; «scheduled» — только когда наступил момент старта;
// «completed» и прочие — нет. Раунды без статуса (старые данные) считаем
// активными, чтобы не ломать обычные раунды.
// Открыт ли раунд для ввода счёта. playerId (необязательный) — если раунд
// уже завершён, но ИМЕННО ЭТОТ игрок ещё не сдал свою карточку (не отмечен в
// finishedPlayers), ввод ему остаётся доступен: раньше первый завершивший
// переводил всю группу в «режим просмотра», и остальные не могли доиграть.
function isRoundOpenForScoring(r, nowTs, playerId) {
    if (!r || typeof r !== 'object') return false;
    var st = String(r.status || 'active');
    if (st === 'scheduled') {
        var startTs = roundScheduledStartTs(r);
        if (!startTs) return false;             // без времени старта не открываем
        return (parseInt(nowTs, 10) || Date.now()) >= startTs;
    }
    if (st === 'completed') {
        if (!playerId) return false;
        var pid = String(playerId);
        var players = r.players || {};
        if (!players[pid]) return false;        // наблюдателю ввод не открываем
        if (r.finishedPlayers && r.finishedPlayers[pid]) return false;
        return true;
    }
    return st === 'active' || st === '';
}

// Игрок уже завершил свою карточку в этом раунде?
function isPlayerFinishedRound(r, playerId) {
    if (!r || !playerId) return false;
    var pid = String(playerId);
    if (r.finishedPlayers && r.finishedPlayers[pid]) return true;
    if (String(r.status || '') === 'completed' && String(r.completedBy || '') === pid) return true;
    return false;
}

// Есть ли в раунде игроки, которые ещё не сдали карточку (и повод держать
// раунд открытым, даже если кто-то уже нажал «Завершить»).
function roundPendingPlayers(r) {
    if (!r || typeof r !== 'object') return [];
    var players = r.players || {};
    var fin = r.finishedPlayers || {};
    return Object.keys(players).filter(function(pid) {
        if (fin[pid]) return false;
        if (String(r.status || '') === 'completed' && String(r.completedBy || '') === pid) return false;
        return true;
    });
}

// Раунд «заперт» стартом турнира: создан заранее, старт ещё не наступил.
function isRoundGatedByStart(r, nowTs) {
    if (!r || typeof r !== 'object') return false;
    if (String(r.status || 'active') !== ROUND_STATUS_SCHEDULED) return false;
    return !isRoundOpenForScoring(r, nowTs);
}

// Сколько миллисекунд осталось до старта (0 — если уже можно играть).
function roundStartCountdownMs(r, nowTs) {
    if (!isRoundGatedByStart(r, nowTs)) return 0;
    var startTs = roundScheduledStartTs(r);
    var left = startTs - ((parseInt(nowTs, 10) || Date.now()));
    return left > 0 ? left : 0;
}

// «01:05:09» — часы:минуты:секунды; до часа показываем «05:09»,
// больше суток — «2 дн. 05:09:00».
function formatStartCountdown(ms) {
    var total = Math.max(0, Math.ceil((parseInt(ms, 10) || 0) / 1000));
    var d = Math.floor(total / 86400);
    var h = Math.floor((total % 86400) / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var hh = (h < 10 ? '0' : '') + h;
    var mm = (m < 10 ? '0' : '') + m;
    var ss = (s < 10 ? '0' : '') + s;
    if (d > 0) {
        var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        return d + (isEn ? 'd ' : ' дн. ') + hh + ':' + mm + ':' + ss;
    }
    return h > 0 ? (hh + ':' + mm + ':' + ss) : (mm + ':' + ss);
}

// Какие «запланированные» раунды пора открыть (старт наступил).
// Возвращает { roundIds: [...], tournamentIds: [...] } — чистая функция,
// её проверяют автотесты; запись в базу делает pestovoActivateRounds.
function roundsDueForStart(roundsData, nowTs) {
    var now = parseInt(nowTs, 10) || Date.now();
    var roundIds = [], tournamentIds = [], seenTn = {};
    Object.keys(roundsData || {}).forEach(function(rid) {
        var r = roundsData[rid];
        if (!r || typeof r !== 'object') return;
        if (String(r.status || '') !== ROUND_STATUS_SCHEDULED) return;
        if (!isRoundOpenForScoring(r, now)) return;
        roundIds.push(rid);
        var tnId = r.tournamentId;
        if (tnId && !seenTn[tnId]) { seenTn[tnId] = true; tournamentIds.push(tnId); }
    });
    return { roundIds: roundIds, tournamentIds: tournamentIds };
}

// Открывает раунды, у которых наступил старт, и переводит их турниры в active.
// Вызывается админ-панелью (подписка на раунды + таймер) и страницей игрока,
// когда отсчёт дошёл до нуля. Ошибки записи не критичны: статус пересчитается
// у других клиентов по времени (isRoundOpenForScoring).
function pestovoActivateRounds(due, opts) {
    opts = opts || {};
    if (typeof db === 'undefined' || !db || !due) return Promise.resolve({ rounds: 0, tournaments: 0 });
    var updates = {};
    var now = Date.now();
    (due.roundIds || []).forEach(function(rid) {
        updates['rounds/' + rid + '/status'] = 'active';
        updates['rounds/' + rid + '/activatedAt'] = now;
    });
    (due.tournamentIds || []).forEach(function(tnId) {
        updates['tournaments/' + tnId + '/status'] = 'active';
        updates['tournaments/' + tnId + '/startedAt'] = now;
    });
    if (!Object.keys(updates).length) return Promise.resolve({ rounds: 0, tournaments: 0 });
    return db.ref().update(updates).then(function() {
        return { rounds: (due.roundIds || []).length, tournaments: (due.tournamentIds || []).length };
    }).catch(function(err) {
        if (!opts.silent && typeof console !== 'undefined') {
            try { console.warn('[Tournament start] cannot activate rounds', err); } catch (e) {}
        }
        return { rounds: 0, tournaments: 0, error: err };
    });
}

// Проход по снимку раундов: открыть всё, что пора, и сообщить об этом.
// Используется админ-панелью на каждом обновлении списка раундов.
function pestovoAutoStartRounds(roundsData, opts) {
    opts = opts || {};
    var due = roundsDueForStart(roundsData, Date.now());
    if (!due.roundIds.length) return Promise.resolve(null);
    return pestovoActivateRounds(due, opts).then(function(res) {
        if (res && res.rounds && opts.notify !== false && typeof toast === 'function') {
            var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
            toast('🏁 ' + (isEn
                ? 'Tournament started: ' + res.rounds + ' round(s) opened for scoring'
                : 'Турнир стартовал: открыто раундов для ввода счёта — ' + res.rounds), 'success');
        }
        return res;
    });
}

// Старт турнира вручную из админ-меню: сам турнир + все его запланированные
// раунды становятся активными сразу, не дожидаясь времени.
function pestovoStartTournamentNow(tnId) {
    if (typeof db === 'undefined' || !db || !tnId) return Promise.resolve(false);
    var now = Date.now();
    // При старте подтягиваем гандикапные группы турнира: ТИ группы («ти
    // стартовой группы» = ТИ дивизиона из «умных групп» или ручной группы)
    // применяется к игрокам раунда этой группы (#1.60). Если группы нет —
    // действует ТИ, сохранённый в раунде при создании протокола.
    return Promise.all([
        db.ref('rounds').once('value'),
        db.ref('tournaments/' + tnId + '/divisions').once('value').catch(function() { return null; })
    ]).then(function(res) {
        var data = res[0].val() || {};
        var divRaw = (res[1] && res[1].val) ? res[1].val() : null;
        var divisions = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions({ divisions: divRaw }) : [];
        var updates = {};
        updates['tournaments/' + tnId + '/status'] = 'active';
        updates['tournaments/' + tnId + '/startedAt'] = now;
        var opened = 0;
        Object.keys(data).forEach(function(rid) {
            var r = data[rid];
            if (!r || typeof r !== 'object') return;
            if (String(r.tournamentId || '') !== String(tnId)) return;
            var isScheduled = String(r.status || '') === ROUND_STATUS_SCHEDULED;
            if (isScheduled) {
                updates['rounds/' + rid + '/status'] = 'active';
                updates['rounds/' + rid + '/activatedAt'] = now;
                opened++;
            }
            // ТИ по гандикапной группе игрока
            if (divisions.length && r.players) {
                Object.keys(r.players).forEach(function(pid) {
                    var p = r.players[pid] || {};
                    var hcp = (p.exactHcp != null) ? p.exactHcp : (p.exactHcpRaw != null ? p.exactHcpRaw : p.handicap);
                    var div = (typeof tnFindDivision === 'function')
                        ? tnFindDivision({ divisions: divRaw }, hcp, p.gender || 'men', { pid: pid, name: p.name || '' })
                        : null;
                    if (div && div.tee && div.tee !== p.tee) {
                        updates['rounds/' + rid + '/players/' + pid + '/tee'] = div.tee;
                    }
                });
            }
        });
        return db.ref().update(updates).then(function() { return opened; });
    }).catch(function() {
        // Нет доступа к ветке rounds — стартуем хотя бы сам турнир
        return db.ref('tournaments/' + tnId).update({ status: 'active', startedAt: now }).then(function() { return 0; });
    });
}

// =========================================================
// ФОРМАТЫ ИГРЫ · ИЕРАРХИЯ СТАРТА · АДРЕСНЫЕ PUSH-АНОНСЫ
// ---------------------------------------------------------
// Общий слой для админки старта (js/start-admin.js), печати
// QR-карточек (js/qr-start.js), TV-экрана (tv.html), страницы счёта
// (js/scorer.js), ленты (js/feed.js) и рассылки анонсов (js/admin.js).
//
// ФОРМАТЫ. Раунд несёт формат в двух полях: format — основной
// (обратная совместимость со старыми записями) и formats — вся
// форматная линия протокола (например Stableford + Gross). Группа со
// своим форматом пишет один формат, группа без своего — всю линию.
//
// ИЕРАРХИЯ СТАРТА: турнир → протокол → волна (время) → лунка → группа
// → игроки. При сохранении протокола в каждый раунд записываются
// startWave / startWaveLetter / startOrder / groupsTotal, поэтому
// буквы волн («1А», «1Б») не пересчитываются в каждом экране по-своему.
// Буква нужна только когда на лунке две и больше групп — требование клуба.
//
// АНОНСЫ. broadcast.audience решает, кому показывать сообщение:
// 'all' — всем, 'roster' — участникам турнира, 'protocol' — игрокам
// стартового протокола. uids — снимок адресатов на момент отправки,
// чтобы страница игрока проверяла только свой uid и не читала базу.
// =========================================================

var PS_WAVE_ALPHABET_RU = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
var PS_WAVE_ALPHABET_EN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function pestovoLang() {
    try { return (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'en' : 'ru'; } catch (e) { return 'ru'; }
}

// Буква волны: 0 → «А», 1 → «Б»… дальше — номер (27-я волна редка, но пусть будет).
function pestovoWaveLetter(idx, lang) {
    var i = Math.max(0, parseInt(idx, 10) || 0);
    var alpha = (lang || pestovoLang()) === 'en' ? PS_WAVE_ALPHABET_EN : PS_WAVE_ALPHABET_RU;
    if (i < alpha.length) return alpha.charAt(i);
    return String(i + 1);
}

// Форматы игры одной записи: раунда, протокола или группы.
// Принимает и массив, и «разреженный объект» из Firebase ({0:…,1:…}),
// и старую запись без formats (только format).
function pestovoRoundFormats(src) {
    var out = [];
    function add(f) {
        f = String(f == null ? '' : f).trim();
        if (!f || f === '__custom__') return;
        if (out.indexOf(f) === -1) out.push(f);
    }
    if (!src) return out;
    if (typeof src !== 'object') { add(src); return out; }
    var list = src.formats;
    if (list && !Array.isArray(list) && typeof list === 'object') {
        list = Object.keys(list)
            .sort(function(a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0); })
            .map(function(k) { return list[k]; });
    }
    if (Array.isArray(list)) list.forEach(add);
    else if (typeof list === 'string') add(list);
    add(src.format);                     // основной формат (для старых записей — единственный)
    if (src.formatCustom) add(src.formatCustom); // свой формат одной строкой — всегда последним
    return out;
}

// Подпись формата для списков и шапок: вся форматная линия раунда, а не
// только основной формат (старые раунды без formats подписываются как раньше).
function pestovoRoundFormatBadge(r, fallback) {
    var txt = pestovoRoundFormatsLabel(r);
    if (!txt) txt = String((r && r.format) || '').trim();
    return txt || (fallback || 'Stroke Play');
}

// Подпись форматов для шапок и карточек: «Stableford + Gross».
// opts.localize — человеческие названия («Stableford (очки) + …»),
// opts.sep — разделитель (по умолчанию « + », для списков удобно « · »).
function pestovoRoundFormatsLabel(src, opts) {
    opts = opts || {};
    var list = pestovoRoundFormats(src);
    if (!list.length) return '';
    if (!opts.localize) return list.join(opts.sep || ' + ');
    var names = list.map(function(f) {
        return (typeof pestovoFormatLabel === 'function') ? pestovoFormatLabel(f) : f;
    });
    return names.join(opts.sep || ' + ');
}

// Одна строка раскладки к единому виду: и черновик админки
// ({members, startHole, startTime, format}), и раунд из базы
// ({players, groupNo, startWave, startWaveLetter, …}).
function pestovoStartRow(src, i) {
    src = src || {};
    var hole = parseInt(src.startHole, 10) || 1;
    if (hole < 1 || hole > 18) hole = 1;
    var members = Array.isArray(src.members) ? src.members : null;
    var count;
    if (members) count = members.length;
    else if (src.players && typeof src.players === 'object') count = Object.keys(src.players).length;
    else if (typeof src.playersCount === 'number') count = src.playersCount;
    else count = 0;
    return {
        key: String(src.roundId || src.id || src.key || ('row' + i)),
        order: i,          // индекс во ВХОДЯЩЕМ списке — чтобы после сортировки
                           // можно было вернуться к своей группе
        hole: hole,
        ts: Number(src.startTime) || 0,
        groupNo: parseInt(src.groupNo, 10) || (i + 1),
        count: count,
        members: members,
        status: String(src.status || ''),
        startWave: (src.startWave === null || src.startWave === undefined) ? null : parseInt(src.startWave, 10),
        startWaveLetter: (src.startWaveLetter === null || src.startWaveLetter === undefined) ? '' : String(src.startWaveLetter),
        startOrder: (src.startOrder === null || src.startOrder === undefined) ? null : parseInt(src.startOrder, 10),
        groupsTotal: (src.groupsTotal === null || src.groupsTotal === undefined) ? null : parseInt(src.groupsTotal, 10),
        tournamentName: String(src.tournamentName || ''),
        protocolName: String(src.protocolName || ''),
        formats: pestovoRoundFormats(src),
        raw: src
    };
}

// Строки, упорядоченные по очереди tee-off: время → лунка → номер группы.
//
// Волна (порядковый номер группы на своей лунке) и буква пересчитываются
// ВСЕГДА, когда в списке виден весь протокол: после переноса группы на другую
// лунку записанные раньше буквы устарели, и две группы получили бы «1А».
// Если передана частичная выборка (TV или счётная страница открывают один
// раунд из восьми) — считать нечего, берём startWave/startWaveLetter из базы.
function pestovoStartRows(list) {
    var arr = list ? Array.prototype.slice.call(list) : [];
    var rows = arr.map(pestovoStartRow);
    rows.sort(function(a, b) {
        if (a.ts !== b.ts) return a.ts - b.ts;
        if (a.hole !== b.hole) return a.hole - b.hole;
        return a.groupNo - b.groupNo;
    });
    var declaredTotal = 0;
    rows.forEach(function(r) {
        if (r.groupsTotal && r.groupsTotal > declaredTotal) declaredTotal = r.groupsTotal;
    });
    var partial = declaredTotal > rows.length;   // видны не все группы протокола
    var onHole = {};
    rows.forEach(function(r) {
        r.derivedWave = onHole[r.hole] || 0;
        onHole[r.hole] = r.derivedWave + 1;
    });
    rows.forEach(function(r, i) {
        r.holeTotal = onHole[r.hole] || 1;
        r.seq = (partial && r.startOrder !== null && !isNaN(r.startOrder)) ? r.startOrder : (i + 1);
        r.startWave = (partial && r.startWave !== null && !isNaN(r.startWave)) ? r.startWave : r.derivedWave;
        var savedLetter = (partial && r.startWaveLetter) ? String(r.startWaveLetter) : '';
        r.letter = savedLetter || (r.holeTotal > 1 ? pestovoWaveLetter(r.startWave) : '');
        if (!r.groupsTotal || isNaN(r.groupsTotal)) r.groupsTotal = rows.length;
    });
    return rows;
}

// Порядок показа стартового листа: лунка → время (1А, 1Б, …, 10А) — так его
// сортируют админка и печать QR. Очередь tee-off остаётся хронологической
// (rows): это очередь на первый тей, а не список лунок.
function pestovoStartDisplayOrder(rows) {
    return (rows || []).slice().sort(function(a, b) {
        if (a.hole !== b.hole) return a.hole - b.hole;
        if (a.ts !== b.ts) return a.ts - b.ts;
        return a.groupNo - b.groupNo;
    });
}

// Подпись группы в иерархии. shotgun-схемы (лунка + буква) — «Группа 1А»,
// остальные — «Группа 3» по номеру группы.
function pestovoStartGroupTitle(row, opts) {
    opts = opts || {};
    if (!row) return '';
    var base = (opts.lang || pestovoLang()) === 'en' ? 'Group ' : 'Группа ';
    if (!opts.holeLetter) return base + row.groupNo;
    return base + row.hole + (row.letter || '');
}

// Дерево иерархии: волны (по времени старта) → лунки → группы.
// Нужно TV-экрану, печати QR-карточек и предпросмотру в админке.
function pestovoStartHierarchy(list, opts) {
    opts = opts || {};
    var rows = opts.rows ? list : pestovoStartRows(list);
    var waves = [];
    var byTs = {};
    rows.forEach(function(r) {
        var w = byTs[r.ts];
        if (!w) {
            w = byTs[r.ts] = { ts: r.ts, holes: [], holesById: {}, groups: [], count: 0, players: 0 };
            waves.push(w);
        }
        var h = w.holesById[r.hole];
        if (!h) {
            h = w.holesById[r.hole] = { hole: r.hole, groups: [], count: 0, players: 0 };
            w.holes.push(h);
        }
        h.groups.push(r); h.count++; h.players += r.count;
        w.groups.push(r); w.count++; w.players += r.count;
    });
    waves.sort(function(a, b) { return a.ts - b.ts; });
    waves.forEach(function(w, wi) {
        w.no = wi + 1;
        w.holes.sort(function(a, b) { return a.hole - b.hole; });
        w.holes.forEach(function(h) {
            h.groups.sort(function(a, b) {
                if (a.startWave !== b.startWave) return a.startWave - b.startWave;
                return a.groupNo - b.groupNo;
            });
        });
    });
    var players = 0;
    rows.forEach(function(r) { players += r.count; });
    return { waves: waves, rows: rows, display: pestovoStartDisplayOrder(rows), total: rows.length, players: players };
}

// ── PUSH-АНОНСЫ: КОМУ АДРЕСОВАНО ──────────────────────────
// Аудитория приводится к одному виду; записей без audience (все, что
// отправлены до этого релиза) это не меняет: они по-прежнему адресованы всем.
function pestovoBroadcastAudience(a) {
    if (!a || typeof a !== 'object') return { type: 'all', tournamentId: '', tournamentName: '', protocolId: '', protocolName: '', uids: null, count: 0 };
    var type = String(a.type || 'all');
    if (type !== 'roster' && type !== 'protocol') type = 'all';
    var uids = null, n = 0;
    if (a.uids && typeof a.uids === 'object') {
        uids = {};
        Object.keys(a.uids).forEach(function(k) {
            var v = a.uids[k];
            if (!k || v === false || v === null) return;
            uids[String(k)] = true;
            n++;
        });
    }
    return {
        type: type,
        includePwa: a.includePwa === true,
        tournamentId: String(a.tournamentId || ''),
        tournamentName: String(a.tournamentName || ''),
        protocolId: String(a.protocolId || ''),
        protocolName: String(a.protocolName || ''),
        uids: uids,
        count: n
    };
}

// Запись в broadcasts/<id>.
function pestovoBroadcastPayload(o) {
    o = o || {};
    var link = String(o.link || '').trim() || 'tournaments.html';
    return {
        title: String(o.title || '').trim(),
        body: String(o.body || '').trim(),
        link: link,
        time: Number(o.time) || Date.now(),
        sentBy: String(o.sentBy || 'admin'),
        audience: pestovoBroadcastAudience(o.audience)
    };
}

// Показать ли анонс этому зрителю: ctx = { uid, isAdmin }.
// Адресный анонс видят только адресаты (и админ — чтобы проверить текст);
// гость без uid видит только общие анонсы.
function pestovoBroadcastMatches(b, ctx) {
    ctx = ctx || {};
    var aud = pestovoBroadcastAudience(b && b.audience);
    if (aud.type === 'all') return true;
    if (ctx.isAdmin) return true;
    var uid = (ctx.uid === null || ctx.uid === undefined) ? '' : String(ctx.uid);
    if (!uid) return false;
    if (!aud.uids || !aud.count) return false;
    return !!aud.uids[uid];
}

// Кто смотрит анонсы прямо сейчас: uid вошедшего игрока + признак админа.
// Нужен одному месту, иначе pwa-уведомление и лента начнут фильтровать по-разному.
function pestovoBroadcastViewerCtx() {
    var uid = '';
    try {
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) uid = String(currentUser.uid);
    } catch (e) {}
    return {
        uid: uid,
        isAdmin: (typeof pestovoIsAdminViewer === 'function') ? pestovoIsAdminViewer() : false
    };
}

// Подпись аудитории для истории админки и карточек ленты.
function pestovoBroadcastAudienceLabel(b, lang) {
    var L = lang || pestovoLang();
    var aud = pestovoBroadcastAudience(b && b.audience);
    if (aud.type === 'all') {
        if (aud.includePwa) return L === 'en' ? 'All players + PWA push (incl. guests)' : 'Всем игрокам + PWA-уведомления (включая гостей)';
        return L === 'en' ? 'All club players' : 'Всем игрокам клуба';
    }
    var name = aud.type === 'protocol' ? (aud.protocolName || aud.tournamentName || '') : (aud.tournamentName || '');
    var who = aud.type === 'protocol'
        ? (L === 'en' ? 'Start list' : 'Стартовый протокол')
        : (L === 'en' ? 'Tournament' : 'Турнир');
    var out = who + (name ? ': ' + name : '');
    if (aud.count) out += ' · ' + aud.count + (L === 'en' ? ' players' : ' игр.');
    return out;
}

// Лента анонсов зрителю: новые сверху, только адресованные ему.
function pestovoBroadcastFeed(data, ctx, limit) {
    var src = data || {};
    var arr = [];
    Object.keys(src).forEach(function(k) {
        var b = src[k];
        if (!b || typeof b !== 'object') return;
        if (!pestovoBroadcastMatches(b, ctx)) return;
        arr.push({
            id: k,
            title: String(b.title || ''),
            body: String(b.body || ''),
            link: String(b.link || 'tournaments.html'),
            time: Number(b.time) || 0,
            audience: b.audience
        });
    });
    arr.sort(function(a, b) { return b.time - a.time; });
    if (limit && limit > 0) arr = arr.slice(0, limit);
    return arr;
}

if (typeof window !== 'undefined') {
    window.roundTournamentName = roundTournamentName;
    window.isTournamentRound = isTournamentRound;
    window.updateRoundEventBanner = updateRoundEventBanner;
    window.isRoundOpenForScoring = isRoundOpenForScoring;
    window.isRoundGatedByStart = isRoundGatedByStart;
    window.roundScheduledStartTs = roundScheduledStartTs;
    window.roundStartCountdownMs = roundStartCountdownMs;
    window.formatStartCountdown = formatStartCountdown;
    window.roundsDueForStart = roundsDueForStart;
    window.pestovoActivateRounds = pestovoActivateRounds;
    window.pestovoAutoStartRounds = pestovoAutoStartRounds;
    window.pestovoStartTournamentNow = pestovoStartTournamentNow;
    window.pestovoStartTsFromParts = pestovoStartTsFromParts;
    window.ROUND_STATUS_SCHEDULED = ROUND_STATUS_SCHEDULED;
    window.pestovoWaveLetter = pestovoWaveLetter;
    window.pestovoRoundFormats = pestovoRoundFormats;
    window.pestovoRoundFormatsLabel = pestovoRoundFormatsLabel;
    window.pestovoRoundFormatBadge = pestovoRoundFormatBadge;
    window.pestovoStartRow = pestovoStartRow;
    window.pestovoStartRows = pestovoStartRows;
    window.pestovoStartDisplayOrder = pestovoStartDisplayOrder;
    window.pestovoStartHierarchy = pestovoStartHierarchy;
    window.pestovoStartGroupTitle = pestovoStartGroupTitle;
    window.pestovoBroadcastAudience = pestovoBroadcastAudience;
    window.pestovoBroadcastPayload = pestovoBroadcastPayload;
    window.pestovoBroadcastMatches = pestovoBroadcastMatches;
    window.pestovoBroadcastViewerCtx = pestovoBroadcastViewerCtx;
    window.pestovoBroadcastAudienceLabel = pestovoBroadcastAudienceLabel;
    window.pestovoBroadcastFeed = pestovoBroadcastFeed;
}

