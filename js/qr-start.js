// ==========================================================
// QR-СТАРТОВЫЙ ЛИСТ (qr-start.html)
// Печать QR-карточек игроков турнирного протокола.
// Данные читаются из protocols/<pid> (создаётся во вкладке
// админки «Старт турнира 🏁»). У каждого игрока ОДИН QR:
//  • группа из 2+ игроков → групповая счётная карточка
//    (setup-round.html?round&as) — в ней игрок вводит и свой
//    счёт, и счёт маркируемого партнёра;
//  • группа из одного игрока → одиночная карточка scorer.html.
// ==========================================================

function qrGet(id) { try { return document.getElementById(id); } catch (e) { return null; } }

function qrEsc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
// QR генерируется удалёнными сервисами. Чтобы коды не «терялись» при печати
// (троттлинг/таймаут одного провайдера, ленивая загрузка), используем цепочку:
// основной → запасной провайдер → повтор основного, плюс статус загрузки
// и ожидание всех кодов перед печатью (см. qrPrintMode).
function qrProviders(data, size) {
    size = size || 420;
    var e = encodeURIComponent(data);
    return [
        'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=4&data=' + e,
        'https://quickchart.io/qr?size=' + size + '&margin=1&text=' + e,
        'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=2&color=111111&bgcolor=ffffff&data=' + e
    ];
}
function qrUrl(data, size) {
    return qrProviders(data, size)[0];
}
function qrImgOk(img) {
    try { img.setAttribute('data-qr-done', '1'); } catch (e) {}
    qrUpdateStatus();
}
function qrImgFail(img) {
    var n = 0;
    try { n = parseInt(img.getAttribute('data-qr-try') || '0', 10) || 0; } catch (e) {}
    var data = '';
    try { data = decodeURIComponent(img.getAttribute('data-qr') || ''); } catch (e) { data = ''; }
    var urls = data ? qrProviders(data, 420) : [];
    if (data && n + 1 < urls.length) {
        try {
            img.setAttribute('data-qr-try', String(n + 1));
            img.src = urls[n + 1];
        } catch (e) {}
        return;
    }
    // Все попытки исчерпаны — помечаем и показываем заглушку.
    try { img.setAttribute('data-qr-done', 'failed'); } catch (e) {}
    try {
        img.style.display = 'none';
        var box = img.parentNode;
        if (box && !box.querySelector('.qr-fail')) {
            var d = document.createElement('div');
            d.className = 'qr-fail';
            d.textContent = '⚠️ QR не загрузился — нажмите «🔄 QR заново»';
            box.insertBefore(d, img);
        }
    } catch (e) {}
    qrUpdateStatus();
}
// Кнопка «🔄 QR заново»: перезапускает загрузку всех упавших кодов.
function qrRetryFailed() {
    var imgs = [];
    try { imgs = document.querySelectorAll('img[data-qr]') || []; } catch (e) { return; }
    for (var i = 0; i < imgs.length; i++) {
        (function(img) {
            var st = null;
            try { st = img.getAttribute('data-qr-done'); } catch (e) {}
            if (st !== 'failed') return;
            var data = '';
            try { data = decodeURIComponent(img.getAttribute('data-qr') || ''); } catch (e) {}
            if (!data) return;
            try {
                var box = img.parentNode;
                if (box) {
                    var f = box.querySelector('.qr-fail');
                    if (f) box.removeChild(f);
                }
                img.style.display = '';
                img.removeAttribute('data-qr-done');
                img.setAttribute('data-qr-try', '0');
                img.src = qrProviders(data, 420)[0];
            } catch (e) {}
        })(imgs[i]);
    }
    qrUpdateStatus();
}
function qrUpdateStatus() {
    var el = null;
    try { el = document.getElementById('qr-status'); } catch (e) {}
    if (!el) return;
    var imgs = [];
    try { imgs = document.querySelectorAll('img[data-qr]') || []; } catch (e) {}
    var done = 0, failed = 0;
    for (var i = 0; i < imgs.length; i++) {
        var st = null;
        try { st = imgs[i].getAttribute('data-qr-done'); } catch (e) {}
        if (st === 'failed') failed++;
        else if (st) done++;
    }
    var total = imgs.length;
    var txt = '';
    if (!total) txt = '';
    else if (failed) txt = '⚠️ QR: ' + done + '/' + total + ' · не загрузилось: ' + failed;
    else if (done < total) txt = '⏳ QR загружаются: ' + done + '/' + total + '…';
    else txt = '✅ Все QR загружены (' + total + ')';
    try { el.textContent = txt; } catch (e) {}
}
function qrHcp(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var n = parseFloat(v);
    if (isNaN(n)) return '—';
    return n < 0 ? '+' + Math.abs(n).toFixed(1) : Math.abs(n).toFixed(1);
}
function qrTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts);
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}
function qrDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts).slice(0, 10);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function qrTeeName(code) {
    var map = { bk: 'Чёрный', bl: 'Синий', wh: 'Белый', rd: 'Красный' };
    return map[code] || code || '—';
}
function qrFio(p) {
    var parts = [];
    ['lastName', 'firstName', 'middleName'].forEach(function(k) {
        if (p && String(p[k] || '').trim()) parts.push(String(p[k]).trim());
    });
    return parts.join(' ') || (p && p.name) || 'Игрок';
}
function qrFullBase() {
    var loc = window.location;
    var path = loc.pathname;
    var dir = path.substring(0, path.lastIndexOf('/') + 1);
    return loc.origin + dir;
}
function qrPageUrl(page, params) {
    return qrFullBase() + page + '?' + params;
}
// Группы турнира (дивизионы) — лёгкий аналог tnNormalizeDivisions/tnFindDivision
// из js/utils.js (qr-страница utils.js не подключает).
function qrNormDivs(raw) {
    if (!raw) return [];
    var arr = Array.isArray(raw) ? raw.slice() : Object.keys(raw).map(function(k) {
        var d = raw[k] || {};
        if (!d.id) d.id = k;
        return d;
    });
    arr = arr.filter(function(d) { return d && (d.name || d.hcpFrom != null || d.hcpTo != null); });
    var order = { men: 0, women: 1, all: 2 };
    arr.sort(function(a, b) {
        var ga = (a.gender || 'all'), gb = (b.gender || 'all');
        var oa = (order[ga] == null ? 3 : order[ga]), ob = (order[gb] == null ? 3 : order[gb]);
        if (oa !== ob) return oa - ob;
        var fa = (a.hcpFrom === '' || a.hcpFrom == null) ? -999 : parseFloat(a.hcpFrom);
        var fb = (b.hcpFrom === '' || b.hcpFrom == null) ? -999 : parseFloat(b.hcpFrom);
        if (isNaN(fa)) fa = -999;
        if (isNaN(fb)) fb = -999;
        return fa - fb;
    });
    return arr;
}
function qrFindDivision(divs, hcp, gender) {
    if (!divs || !divs.length) return null;
    var h = (hcp === '' || hcp == null) ? null : parseFloat(hcp);
    if (h == null || isNaN(h)) return null;
    gender = gender || 'men';
    for (var i = 0; i < divs.length; i++) {
        var d = divs[i] || {};
        var g = d.gender || 'all';
        if (g !== 'all' && g !== gender) continue;
        var from = (d.hcpFrom === '' || d.hcpFrom == null) ? -999 : parseFloat(d.hcpFrom);
        var to = (d.hcpTo === '' || d.hcpTo == null) ? 999 : parseFloat(d.hcpTo);
        if (isNaN(from)) from = -999;
        if (isNaN(to)) to = 999;
        if (h >= from - 1e-9 && h <= to + 1e-9) return d;
    }
    return null;
}
function qrDivRange(d) {
    var f = (d.hcpFrom === '' || d.hcpFrom == null) ? null : parseFloat(d.hcpFrom);
    var t = (d.hcpTo === '' || d.hcpTo == null) ? null : parseFloat(d.hcpTo);
    if (f != null && !isNaN(f) && t != null && !isNaN(t)) return qrHcp(f) + '–' + qrHcp(t);
    if (t != null && !isNaN(t)) return 'до ' + qrHcp(t);
    if (f != null && !isNaN(f)) return 'от ' + qrHcp(f);
    return '';
}

function qrPrintMode(mode) {
    document.body.classList.remove('print-cards', 'print-sheet');
    if (mode === 'sheet') document.body.classList.add('print-sheet');
    else document.body.classList.add('print-cards');
    // Печать карточек — только после загрузки всех QR (иначе на бумаге будут
    // пустые места). Ждём максимум 15 секунд, затем печатаем как есть.
    if (mode === 'sheet') { window.print(); return; }
    qrPrintWhenReady(0);
}
function qrPrintWhenReady(waitedMs) {
    var imgs = [];
    try { imgs = document.querySelectorAll('img[data-qr]') || []; } catch (e) {}
    if (!imgs.length) { window.print(); return; }
    var pending = 0;
    for (var i = 0; i < imgs.length; i++) {
        var st = null;
        try { st = imgs[i].getAttribute('data-qr-done'); } catch (e) { st = '1'; }
        if (!st) pending++;
    }
    if (!pending || waitedMs >= 15000) {
        if (pending) qrUpdateStatus();
        window.print();
        return;
    }
    qrUpdateStatus();
    setTimeout(function() { qrPrintWhenReady(waitedMs + 300); }, 300);
}
if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('afterprint', function() {
        var b = document.body;
        if (b) b.classList.remove('print-cards', 'print-sheet');
    });
}

function qrRender(doc, divs) {
    var content = qrGet('qr-content');
    if (!content) return;
    var loading = qrGet('qr-loading'); if (loading) loading.classList.add('hidden');
    content.classList.remove('hidden');
    divs = divs || [];

    var groupEntries = Object.keys(doc.groups || {})
        .sort(function(a, b) { return (parseInt(a.replace('g', '')) || 0) - (parseInt(b.replace('g', '')) || 0); })
        .map(function(k) { return { key: k, g: doc.groups[k] || {} }; });

    var totalPlayers = 0;
    groupEntries.forEach(function(ge) { totalPlayers += (ge.g.players || []).length; });

    var titleHtml = '';
    titleHtml += '<h1 class="qr-h">🏌️ Стартовый протокол</h1>';
    titleHtml += '<p class="sub">' +
        (doc.tournamentName ? '🏆 ' + qrEsc(doc.tournamentName) + ' · ' : '') +
        qrEsc(doc.name || '') + (doc.date ? ' · ' + qrDate(new Date(doc.date + 'T00:00:00')) : '') +
        (doc.format ? ' · ' + qrEsc(doc.format) : '') +
        ' · групп: ' + groupEntries.length + ' · игроков: ' + totalPlayers + '</p>';

    // ── Стартовый лист (таблица) ──
    var sheetHtml = '<div class="sheet">';
    sheetHtml += '<table><thead><tr>' +
        '<th>Группа</th><th>Время</th><th>Лунка</th><th>Игрок</th><th>ТИ</th><th>Точный HCP</th><th>Полевой HCP</th><th>Маркирует</th>' +
        '</tr></thead><tbody>';
    groupEntries.forEach(function(ge) {
        var g = ge.g;
        var members = g.players || [];
        members.forEach(function(p, i) {
            var gno = g.groupNo || ge.key.replace('g', '');
            sheetHtml += '<tr>' +
                (i === 0 ? '<td rowspan="' + members.length + '" class="flag-g"><b>№' + gno + '</b></td>' : '') +
                (i === 0 ? '<td rowspan="' + members.length + '"><b>' + qrTime(g.startTime) + '</b></td>' : '') +
                (i === 0 ? '<td rowspan="' + members.length + '">' + (g.startHole === 10 ? '10' : String(g.startHole || 1)) + '</td>' : '') +
                '<td><b>' + qrEsc(qrFio(p)) + '</b>' + qrDivInline(p, divs) + '</td>' +
                '<td>' + qrTeeName(p.tee) + '</td>' +
                '<td>' + qrHcp(p.exactHcp) + '</td>' +
                '<td>' + qrHcp(p.fieldHcp) + '</td>' +
                '<td>' + qrEsc(qrMarkedName(g, p)) + '</td>' +
                '</tr>';
        });
    });
    sheetHtml += '</tbody></table></div>';

    // ── QR-карточки ──
    var cardsHtml = '<div class="pcards">';
    groupEntries.forEach(function(ge) {
        var g = ge.g;
        var members = g.players || [];
        var rid = g.roundId;
        var startHoleTxt = (g.startHole === 10 ? '10' : String(g.startHole || 1));
        members.forEach(function(p) {
            if (!p || !p.id) return;
            // Один QR на игрока:
            //   группа 2+ → групповая карточка (свой счёт + счёт маркируемого партнёра);
            //   группа из одного → одиночная карточка scorer.html.
            var isGroupCard = members.length > 1;
            var scoreUrl = isGroupCard
                ? qrPageUrl('setup-round.html', 'round=' + encodeURIComponent(rid) + '&as=' + encodeURIComponent(p.id))
                : qrPageUrl('scorer.html', 'round=' + encodeURIComponent(rid) + '&player=' + encodeURIComponent(p.id));
            // Кого маркирует этот игрок?
            var markTarget = null;
            (g.markers || []).forEach(function(mk) {
                if (mk.markerId === p.id) markTarget = mk;
            });
            var markName = markTarget ? qrFio(findPl(g, markTarget.targetId)) : '';

            // Зачётная группа игрока (по обрезанному гандикапу — он записан в exactHcp).
            var pdiv = qrFindDivision(divs, p.exactHcp, p.gender);
            var pdivHtml = '';
            if (pdiv && pdiv.name) {
                var prg = qrDivRange(pdiv);
                pdivHtml = '<span class="div-badge">🏆 ' + qrEsc(pdiv.name) + (prg ? ' · ' + qrEsc(prg) : '') + '</span>';
            }

            cardsHtml += '<div class="pcard">';
            cardsHtml += '<div class="grp-row">' +
                '<span class="grp-badge">ГРУППА №' + (g.groupNo || ge.key.replace('g', '')) + '</span>' +
                '<span class="time-badge">⏱ ' + qrTime(g.startTime) + ' · ЛУНКА ' + startHoleTxt + '</span>' +
                pdivHtml +
                '</div>';
            cardsHtml += '<div class="pname">' + qrEsc(qrFio(p)) + '</div>';
            cardsHtml += '<div class="pmeta">' +
                '<span>ТИ: <b>' + qrTeeName(p.tee) + '</b></span>' +
                '<span>Точный HCP: <b>' + qrHcp(p.exactHcp) + '</b></span>' +
                '<span>Полевой HCP: <b>' + qrHcp(p.fieldHcp) + '</b></span>' +
                (markName ? '<span class="mark-chip">👁 Маркирует: <b>' + qrEsc(markName) + '</b></span>' : '') +
                '</div>';

            cardsHtml += '<div class="qr-grid">';
            cardsHtml += '<div class="qr-box"><div class="qr-lbl">' +
                (isGroupCard
                    ? '📱 Моя карточка — свой счёт и счёт маркируемого партнёра'
                    : '📱 Моя карточка — ввод счёта') +
                '</div>' +
                // loading="eager": все коды грузятся сразу, а не при прокрутке —
                // иначе в печать уходят пустые места. onerror — цепочка провайдеров.
                '<img loading="eager" decoding="async" src="' + qrUrl(scoreUrl) + '" data-qr="' + encodeURIComponent(scoreUrl) + '" data-qr-try="0" onload="qrImgOk(this)" onerror="qrImgFail(this)" alt="QR"><div class="qr-url">' + qrEsc(scoreUrl) + '</div></div>';
            cardsHtml += '</div>';

            var memberNames = members.map(function(m) {
                if (m.id === p.id) return '<b style="color:#6d5717;">' + qrEsc(qrFio(m)) + '</b>';
                return qrEsc(qrFio(m));
            });
            cardsHtml += '<div class="members-note">Группа: ' + memberNames.join(' · ') + '</div>';
            cardsHtml += '</div>';
        });
    });
    cardsHtml += '</div>';

    var cardsTitle = '<h1 class="qr-h" style="font-size:19px;">🏌️ QR-карточки игроков</h1>' +
        '<p class="sub">' + (doc.tournamentName ? '🏆 ' + qrEsc(doc.tournamentName) + ' · ' : '') + qrEsc(doc.name || '') +
        ' · групп: ' + groupEntries.length + ' · игроков: ' + totalPlayers + (doc.format ? ' · ' + qrEsc(doc.format) : '') + '</p>';
    content.innerHTML = '<div class="sheet-wrap">' + titleHtml + sheetHtml + '</div>' +
        '<div class="cards-wrap"><div class="qr-cards-head">' + cardsTitle + '</div>' + cardsHtml + '</div>';

    // Предупреждение, если нет ни одной карточки
    if (!totalPlayers) {
        content.innerHTML = '<div class="errbox"><h2>ℹ️ Пустой протокол</h2><p>В этом протоколе нет игроков.</p></div>';
    }
}

// Подпись зачётной группы в строке стартового листа (таблица).
function qrDivInline(p, divs) {
    if (!divs || !divs.length) return '';
    var d = qrFindDivision(divs, p.exactHcp, p.gender);
    if (!d || !d.name) return '';
    var rg = qrDivRange(d);
    return ' <span class="div-inline">· ' + qrEsc(d.name) + (rg ? ' (' + qrEsc(rg) + ')' : '') + '</span>';
}

function findPl(g, id) {
    var players = g.players || [];
    for (var i = 0; i < players.length; i++) {
        if (players[i].id === id) return players[i];
    }
    return { lastName: '', firstName: id || '', middleName: '' };
}
function qrMarkedName(g, p) {
    var target = null;
    (g.markers || []).forEach(function(mk) { if (mk.markerId === p.id) target = mk; });
    if (!target) return '—';
    return qrFio(findPl(g, target.targetId));
}

function qrInit() {
    if (typeof db === 'undefined' || !db) {
        var loading = qrGet('qr-loading'); if (loading) loading.classList.add('hidden');
        var err = qrGet('qr-error'); if (err) err.classList.remove('hidden');
        return;
    }
    var params = new URLSearchParams(window.location.search);
    var pid = params.get('p');
    if (!pid) {
        var loading = qrGet('qr-loading'); if (loading) loading.classList.add('hidden');
        var err = qrGet('qr-error'); if (err) err.classList.remove('hidden');
        return;
    }
    db.ref('protocols/' + pid).once('value').then(function(sn) {
        var doc = sn.val();
        if (!doc || !doc.groups) {
            var loading = qrGet('qr-loading'); if (loading) loading.classList.add('hidden');
            var err = qrGet('qr-error'); if (err) err.classList.remove('hidden');
            return;
        }
        // Подтягиваем группы турнира (дивизионы), чтобы показать зачёт на карточках.
        if (doc.tournamentId && typeof db !== 'undefined' && db) {
            db.ref('tournaments/' + doc.tournamentId + '/divisions').once('value').then(function(ds) {
                qrRender(doc, qrNormDivs(ds.val()));
            }).catch(function() {
                qrRender(doc, []);
            });
        } else {
            qrRender(doc, []);
        }
    }).catch(function(errData) {
        console.error('[qr-start] load error', errData);
        var loading = qrGet('qr-loading'); if (loading) loading.classList.add('hidden');
        var err = qrGet('qr-error'); if (err) err.classList.remove('hidden');
        var errText = qrGet('qr-error-text');
        if (errText) errText.textContent = String(errData && errData.message || errData);
    });
}

document.addEventListener('DOMContentLoaded', qrInit);
