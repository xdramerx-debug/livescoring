// ESM canonical safe-HTML builder. Mirrors js/safe-html.js.
// See docs/CODE-REVIEW.md / IMPROVEMENTS-IMPL.md for the XSS rationale.
export function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

export function html() {
    var strings = arguments[0];
    var values = Array.prototype.slice.call(arguments, 1);
    var out = '';
    for (var i = 0; i < strings.length; i++) {
        out += strings[i];
        if (i < values.length) out += esc(values[i]);
    }
    return out;
}

export function setSafeHtml(el, content) {
    if (el) el.innerHTML = (content == null ? '' : String(content));
}

if (typeof window !== 'undefined') {
    Object.assign(window, { esc, html, setSafeHtml });
}
