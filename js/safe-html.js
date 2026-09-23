// ============================================================
// Safe HTML builder — primary, safe-by-default defense vs XSS.
// ------------------------------------------------------------
// Every user-controlled value MUST be escaped. Two ways to build
// markup safely:
//
//   1) esc(value)                  — escape a single value for text/attr.
//   2) html`<b>${playerName}</b>`  — tagged template; ALL interpolations
//                                     are escaped automatically. Assign its
//                                     result straight to el.innerHTML.
//
// Only literal text inside the template is trusted. Never concatenate
// untrusted data into the template via string concatenation — pass it as
// an interpolation so it gets escaped.
//
// This module is dependency-free and loaded BEFORE js/utils.js on every
// page, so `esc`/`html` are available everywhere (including marker.js).
// ============================================================
'use strict';

// Escape & < > " ' — identical to utils.escapeHtml.
function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// Tagged template literal. Each interpolated value is escaped; the static
// parts of the template are trusted (they are authored by us).
//   el.innerHTML = html`<span class="name">${playerName}</span>`;
function html() {
    var strings = arguments[0];
    var values = Array.prototype.slice.call(arguments, 1);
    var out = '';
    for (var i = 0; i < strings.length; i++) {
        out += strings[i];
        if (i < values.length) out += esc(values[i]);
    }
    return out;
}

// Set innerHTML from an already-safe string / html`` result.
function setSafeHtml(el, content) {
    if (el) el.innerHTML = (content == null ? '' : String(content));
}

if (typeof window !== 'undefined') {
    window.esc = esc;
    window.html = html;
    window.setSafeHtml = setSafeHtml;
}
