// ESM canonical DOM helpers (toast notifications, vibrate, escapeHtml).
// Mirrors js/dom.js — the classic-script copy that the legacy pages load.
// Pure browser helpers: no Firebase and no i18n dependencies, safe to load
// before js/utils.js. Exposes globals on window during the migration
// (see src/course-config.js).
export var TOAST_DURATION_MS = 3000;

export function ensureToastRoot(){
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

export function toastIconFor(toastType){
    if (toastType === 'error') return '<i class="fas fa-triangle-exclamation"></i>';
    if (toastType === 'warn') return '<i class="fas fa-bell"></i>';
    if (toastType === 'info') return '<i class="fas fa-circle-info"></i>';
    return '<i class="fas fa-circle-check"></i>';
}

export function toast(m, toastType, opts){
    toastType = toastType || 'success';
    opts = opts || {};
    var duration = parseInt(opts.duration) > 0 ? parseInt(opts.duration) : TOAST_DURATION_MS;
    try {
        if (typeof document === 'undefined' || !document.body) return null;
        var root = ensureToastRoot();
        if (!root) return null;
        while (root.children.length >= 3) {
            try {
                var oldest = root.firstChild;
                if (!oldest) break;
                if (oldest._pestovoDismiss) oldest._pestovoDismiss(true);
                root.removeChild(oldest);
            } catch (_) { break; }
        }
        var e = document.createElement('div');
        e.className = 'toast t-' + toastType;
        e.setAttribute('role', 'status');
        e.innerHTML = '<span class="toast-ico">' + toastIconFor(toastType) + '</span>' +
            '<span class="toast-msg">' + m + '</span>' +
            '<button type="button" class="toast-x" aria-label="×">×</button>' +
            '<span class="toast-bar"><span style="animation-duration:' + duration + 'ms"></span></span>';
        var dismissed = false;
        var dismiss = function (instant) {
            if (dismissed) return; dismissed = true;
            try {
                e.classList.remove('t-show');
                e.classList.add('t-hide');
                setTimeout(function () { try { e.remove(); } catch (_) { /* noop */ } }, instant ? 0 : 320);
            } catch (_) { /* noop */ }
        };
        e._pestovoDismiss = dismiss;
        e.addEventListener('click', function (ev) {
            if (ev && ev.target && ev.target.classList && ev.target.classList.contains('toast-x')) {
                ev.stopPropagation(); dismiss(false); return;
            }
            if (typeof opts.onClick === 'function') {
                try { opts.onClick(); } catch (_) { /* noop */ }
                dismiss(false);
            } else {
                dismiss(false);
            }
        });
        root.appendChild(e);
        setTimeout(function () { try { e.classList.add('t-show'); } catch (_) { /* noop */ } }, 10);
        setTimeout(function () { dismiss(false); }, duration);
        return e;
    } catch (err) { return null; }
}

export function toastSequence(items, opts){
    opts = opts || {};
    var list = (items || []).slice();
    if (!list.length) return;
    var gap = parseInt(opts.gap) > 0 ? parseInt(opts.gap) : 350;
    var step = TOAST_DURATION_MS + gap;
    list.forEach(function (it, idx) {
        setTimeout(function () {
            if (typeof it === 'string') toast(it, opts.type || 'warn', opts.toastOpts || {});
            else toast(it.msg || it.html || '', it.type || opts.type || 'warn', it.opts || opts.toastOpts || {});
        }, idx * step);
    });
}

export function isPlayerModeEnabled(key){
    try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
}

export function vib(pattern){
    if (!navigator.vibrate) return;
    var value = pattern === undefined || pattern === null ? 50 : pattern;
    if (isPlayerModeEnabled('pestovo_strong_vibration')) {
        if (Array.isArray(value)) {
            value = value.map(function (part, index) {
                if (index % 2 === 0) return Math.min(650, Math.max(35, Math.round((parseInt(part) || 0) * 1.45)));
                return Math.min(260, Math.max(20, Math.round((parseInt(part) || 0) * 0.9)));
            });
        } else {
            value = Math.min(650, Math.max(70, Math.round((parseInt(value) || 50) * 1.5)));
        }
    }
    try { navigator.vibrate(value); } catch (e) { /* noop */ }
}

export function escapeHtml(str){
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

if (typeof window !== 'undefined') {
    Object.assign(window, { TOAST_DURATION_MS, ensureToastRoot, toastIconFor, toast, toastSequence, isPlayerModeEnabled, vib, escapeHtml });
}
