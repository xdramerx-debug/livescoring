// js/dom.js — DOM-хелперы, вынесенные из js/utils.js
// (docs/CODE-REVIEW.md, п.1/п.3 — дробление по ответственности).
// Здесь только чистые браузерные функции: уведомления (toast), вибрация
// и экранирование HTML. Зависимостей от Firebase и i18n нет (t()/currentLang
// не используются), поэтому файл безопасно грузить до js/utils.js.
// NOTE: course config + score formatting live in js/course-config.js and
// js/format.js; safe HTML builder (esc/html``) — in js/safe-html.js.
// Do not re-add them here or to utils.js.

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
        // Не больше 3 уведомлений на экране — старые убираем, чтобы не мешали вводу счёта.
        // ВАЖНО: сам _pestovoDismiss(true) убирает элемент асинхронно (setTimeout),
        // поэтому здесь удаляем узел синхронно — иначе 4-й тост в пределах 3 секунд
        // вёл бы цикл в бесконечность и зависал весь браузер (P0, найден
        // регресс-тестом v1.69.0).
        while (root.children.length >= 3) {
            try {
                var oldest = root.firstChild;
                if (!oldest) break;
                if (oldest._pestovoDismiss) oldest._pestovoDismiss(true);
                root.removeChild(oldest);
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
                setTimeout(function(){ try{ e.remove(); }catch (_) { console.warn("[silent]", _); } }, instant ? 0 : 320);
            } catch (_) { console.warn("[silent]", _); }
        };
        e._pestovoDismiss=dismiss;
        e.addEventListener('click', function(ev){
            if (ev && ev.target && ev.target.classList && ev.target.classList.contains('toast-x')) {
                ev.stopPropagation(); dismiss(false); return;
            }
            if (typeof opts.onClick === 'function') {
                try { opts.onClick(); } catch (_) { console.warn("[silent]", _); }
                dismiss(false);
            } else {
                dismiss(false);
            }
        });
        root.appendChild(e);
        // Анимация появления на следующем кадре
        setTimeout(function(){ try{ e.classList.add('t-show'); }catch (_) { console.warn("[silent]", _); } },10);
        setTimeout(function(){ dismiss(false); }, duration);
        return e;
    } catch(err) { try{ console.log('[toast]', m); }catch (_) { console.warn("[silent]", _); } return null; }
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
    try { navigator.vibrate(value); } catch (e) { console.warn("[silent]", e); }
}
function escapeHtml(str){
    if(str===null||str===undefined)return'';
    return String(str).replace(/[&<>"']/g,function(c){
        return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
}
