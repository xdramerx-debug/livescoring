// ==========================================================
// QR-СТАРТОВЫЙ ЛИСТ (qr-start.html)
// Печать QR-карточек игроков турнирного протокола.
// Данные читаются из protocols/<pid> (создаётся во вкладке
// админки «Старт турнира 🏁»). Карточка каждого игрока
// содержит QR «Моя карточка» (scorer.html) и, если игрок
// кого-то маркирует, QR карточки маркера (marker.html).
// ==========================================================

function qrGet(id) { try { return document.getElementById(id); } catch (e) { return null; } }

function qrEsc(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function qrUrl(data, size) {
    size = size || 420;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=4&data=' + encodeURIComponent(data);
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

function qrPrintMode(mode) {
    document.body.classList.remove('print-cards', 'print-sheet');
    if (mode === 'sheet') document.body.classList.add('print-sheet');
    else document.body.classList.add('print-cards');
    window.print();
}
if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('afterprint', function() {
        var b = document.body;
        if (b) b.classList.remove('print-cards', 'print-sheet');
    });
}

function qrRender(doc) {
    var content = qrGet('qr-content');
    if (!content) return;
    var loading = qrGet('qr-loading'); if (loading) loading.classList.add('hidden');
    content.classList.remove('hidden');

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
                '<td><b>' + qrEsc(qrFio(p)) + '</b></td>' +
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
            var scoreUrl = qrPageUrl('scorer.html', 'round=' + encodeURIComponent(rid) + '&player=' + encodeURIComponent(p.id));
            // Кого маркирует этот игрок?
            var markTarget = null;
            (g.markers || []).forEach(function(mk) {
                if (mk.markerId === p.id) markTarget = mk;
            });
            var isMarked = false;
            (g.markers || []).forEach(function(mk) { if (mk.targetId === p.id) isMarked = true; });

            cardsHtml += '<div class="pcard">';
            cardsHtml += '<div class="grp-row">' +
                '<span class="grp-badge">ГРУППА №' + (g.groupNo || ge.key.replace('g', '')) + '</span>' +
                '<span class="time-badge">⏱ ' + qrTime(g.startTime) + ' · ЛУНКА ' + startHoleTxt + '</span>' +
                '</div>';
            cardsHtml += '<div class="pname">' + qrEsc(qrFio(p)) + '</div>';
            cardsHtml += '<div class="pmeta">' +
                '<span>ТИ: <b>' + qrTeeName(p.tee) + '</b></span>' +
                '<span>Точный HCP: <b>' + qrHcp(p.exactHcp) + '</b></span>' +
                '<span>Полевой HCP: <b>' + qrHcp(p.fieldHcp) + '</b></span>' +
                '</div>';

            cardsHtml += '<div class="qr-grid">';
            cardsHtml += '<div class="qr-box"><div class="qr-lbl">📱 Моя карточка — ввод счёта</div>' +
                '<img src="' + qrUrl(scoreUrl) + '" alt="QR"><div class="qr-url">' + qrEsc(scoreUrl) + '</div></div>';
            if (markTarget) {
                var mkUrl = qrPageUrl('marker.html', 'round=' + encodeURIComponent(rid) + '&player=' + encodeURIComponent(markTarget.targetId));
                cardsHtml += '<div class="qr-box"><div class="qr-lbl">👁 Маркер: счёт игрока<br>' + qrEsc(qrFio(findPl(g, markTarget.targetId))) + '</div>' +
                    '<img src="' + qrUrl(mkUrl) + '" alt="QR"><div class="qr-url">' + qrEsc(mkUrl) + '</div></div>';
            } else if (members.length === 1) {
                cardsHtml += '<div class="qr-box" style="display:flex;align-items:center;justify-content:center;border:none;background:transparent;"><div style="color:#999;font-size:10.5px;line-height:1.5;">Группа из одного<br>игрока — маркер<br>не назначается</div></div>';
            } else {
                cardsHtml += '<div class="qr-box" style="display:flex;align-items:center;justify-content:center;border:none;background:transparent;"><div style="color:#999;font-size:10.5px;line-height:1.5;">Карточки партнёров<br>сканируют они сами</div></div>';
            }
            cardsHtml += '</div>';

            if (markTarget) {
                cardsHtml += '<div class="mark-note">👁 <b>Вы маркируете: ' + qrEsc(qrFio(findPl(g, markTarget.targetId))) + '</b> — сканируйте QR справа после каждого удара партнёра, чтобы подтвердить его счёт.</div>';
            } else if (isMarked) {
                var mkName = '';
                (g.markers || []).forEach(function(mk) { if (mk.targetId === p.id) mkName = qrFio(findPl(g, mk.markerId)); });
                cardsHtml += '<div class="mark-note">👁 Ваш маркер: <b>' + qrEsc(mkName) + '</b> — он подтверждает ваши результаты.</div>';
            }

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
        qrRender(doc);
    }).catch(function(errData) {
        console.error('[qr-start] load error', errData);
        var loading = qrGet('qr-loading'); if (loading) loading.classList.add('hidden');
        var err = qrGet('qr-error'); if (err) err.classList.remove('hidden');
        var errText = qrGet('qr-error-text');
        if (errText) errText.textContent = String(errData && errData.message || errData);
    });
}

document.addEventListener('DOMContentLoaded', qrInit);
