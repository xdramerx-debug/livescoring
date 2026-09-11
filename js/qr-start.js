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
// Нормализация ФИО для сопоставления с составом «умных групп»
// (та же нормализация, что в js/utils.js → tnDivisionFioKey).
function qrNormFio(name) {
    return String(name == null ? '' : name).toLowerCase().replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}
function qrFindDivision(divs, hcp, gender, memberRef) {
    if (!divs || !divs.length) return null;
    // Точный состав «умных групп» важнее диапазона HCP (границы соседних
    // групп могут соприкасаться).
    if (memberRef) {
        var pid = '', fio = '';
        if (typeof memberRef === 'object') {
            pid = memberRef.pid != null ? String(memberRef.pid) : '';
            fio = String(memberRef.fio || '');
        } else {
            pid = String(memberRef);
        }
        for (var mi = 0; mi < divs.length; mi++) {
            var dm = divs[mi] || {};
            var mm = dm.members;
            if (!mm || typeof mm !== 'object') continue;
            if (pid && Object.prototype.hasOwnProperty.call(mm, pid)) return dm;
            if (fio) {
                var mkeys = Object.keys(mm);
                for (var mk = 0; mk < mkeys.length; mk++) {
                    if (String(mm[mkeys[mk]] || '') === fio) return dm;
                }
            }
        }
    }
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

// Схемы старта, где группу подписывают «лунка + буква волны» (1А, 1Б, 10А, 18А…):
// шотган со всех лунок, шотган/поочерёдный старт с 1-й и 10-й.
// При старте только с одной лунки («1», «10») номера групп — простые.
function qrShotgunLetterScheme(scheme) {
    return scheme === 'all18' || scheme === '1-10' || scheme === '1-10-shot';
}
function qrWaveLetter(idx) {
    // Алфавит волн — общий с админкой и TV (js/utils.js), включая английскую
    // раскладку букв. Без utils.js (печать офлайн/тесты) остаётся русский.
    if (typeof pestovoWaveLetter === 'function') return pestovoWaveLetter(idx);
    idx = Math.max(0, parseInt(idx, 10) || 0);
    var alphabet = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
    if (idx < alphabet.length) return alphabet.charAt(idx);
    return String(idx + 1);
}
// Форматная линия записи: вся из протокола или своя у группы.
function qrFormatsList(obj) {
    if (typeof pestovoRoundFormats === 'function') return pestovoRoundFormats(obj);
    var out = [];
    function add(f) {
        f = String(f == null ? '' : f).trim();
        if (f && f !== '__custom__' && out.indexOf(f) === -1) out.push(f);
    }
    if (obj) {
        if (Array.isArray(obj.formats)) obj.formats.forEach(add);
        add(obj.format);
    }
    return out;
}
function qrFormatsLabel(obj) {
    var list = qrFormatsList(obj);
    return list.length ? list.join(' + ') : '';
}
// Формат группы: если у группы свой формат — только он, иначе — вся линия протокола.
function qrGroupFormatsLabel(g, doc) {
    var own = (g && g.format) ? String(g.format).trim() : '';
    if (own) return own;
    return qrFormatsLabel(doc);
}
function qrGroupWaveIndex(entries, i) {
    entries = entries || [];
    var g = entries[i] && entries[i].g;
    if (!g) return 0;
    // Волна, записанная админкой при сохранении протокола, важнее пересчёта:
    // группы после сохранения могли переставить, а её номер должен остаться.
    var saved = parseInt(g.startWave, 10);
    if (g.startWave !== null && g.startWave !== undefined && !isNaN(saved)) return saved;
    var hole = parseInt(g.startHole, 10) || 1;
    var n = 0;
    for (var j = 0; j < i; j++) {
        if ((parseInt((entries[j].g || {}).startHole, 10) || 1) === hole) n++;
    }
    return n;
}
// Сколько групп стартует с той же лунки, что и i-я. Одна — буква не нужна:
// «Группа 1», а не «Группа 1А» (требование клуба: буква только при 2+ группах
// на лунке, тогда идут 1А и 1Б).
function qrHoleGroupCount(entries, i) {
    entries = entries || [];
    var hole = parseInt((entries[i] && entries[i].g || {}).startHole, 10) || 1;
    var n = 0;
    for (var j = 0; j < entries.length; j++) {
        if ((parseInt((entries[j].g || {}).startHole, 10) || 1) === hole) n++;
    }
    return n;
}
function qrGroupLabel(g, i, entries, scheme) {
    g = g || {};
    entries = entries || [];
    var lang = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'en' : 'ru';
    var base = lang === 'en' ? 'Group ' : 'Группа ';
    if (qrShotgunLetterScheme(scheme)) {
        var hole = parseInt(g.startHole, 10) || 1;
        var letter;
        if (g.startWaveLetter !== null && g.startWaveLetter !== undefined) {
            // Пустая строка тут осмысленна: группа на лунке одна — буквы нет.
            letter = String(g.startWaveLetter);
        } else {
            letter = qrHoleGroupCount(entries, i) > 1 ? qrWaveLetter(qrGroupWaveIndex(entries, i)) : '';
        }
        return base + hole + letter;
    }
    var gno = g.groupNo || ((entries[i] && entries[i].key) ? String(entries[i].key).replace('g', '') : (i + 1));
    return base + gno;
}
function qrSortGroups(entries, scheme) {
    entries = entries || [];
    if (!qrShotgunLetterScheme(scheme)) {
        entries.sort(function(a, b) {
            return (parseInt(String(a.key).replace('g', ''), 10) || 0) - (parseInt(String(b.key).replace('g', ''), 10) || 0);
        });
        return entries;
    }
    entries.sort(function(a, b) {
        var ha = parseInt((a.g || {}).startHole, 10) || 1;
        var hb = parseInt((b.g || {}).startHole, 10) || 1;
        if (ha !== hb) return ha - hb;
        var ta = (a.g && a.g.startTime) || 0;
        var tb = (b.g && b.g.startTime) || 0;
        if (ta !== tb) return ta - tb;
        return 0;
    });
    return entries;
}

// ── РАСКЛАДКА QR-КАРТОЧЕК: 3 ВАРИАНТА ОТОБРАЖЕНИЯ ──
//   single — 1 игрок на карточку (2 карточки в ряду) — классика;
//   pair   — 2 игрока на карточку, ПОДЕЛЕНУЮ НА ДВЕ ЧАСТИ ВЕРТИКАЛЬНО
//            (лево/право, у каждого свой QR);
//   quad   — 4 игрока на карточку (сетка 2×2).
// Выбор сохраняется в localStorage и дублируется в ?layout= (ссылку можно
// пересылать — получатель увидит ту же раскладку).
var QR_LAYOUTS = ['single', 'pair', 'quad'];
var qrLastDoc = null, qrLastDivs = null;
// Запасной вариант, если localStorage недоступен (приватный режим и т.п.).
var qrLayoutMemory = null;

function qrGetLayout() {
    try {
        var param = new URLSearchParams(window.location.search).get('layout');
        if (param && QR_LAYOUTS.indexOf(param) !== -1) return param;
    } catch (e) {}
    try {
        var saved = window.localStorage.getItem('pestovo_qr_layout');
        if (saved && QR_LAYOUTS.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    if (qrLayoutMemory && QR_LAYOUTS.indexOf(qrLayoutMemory) !== -1) return qrLayoutMemory;
    return 'single';
}

function qrSetLayout(mode) {
    if (QR_LAYOUTS.indexOf(mode) === -1) mode = 'single';
    qrLayoutMemory = mode;
    try { window.localStorage.setItem('pestovo_qr_layout', mode); } catch (e) {}
    // Дублируем выбор в URL: пересланная ссылка открывает ту же раскладку.
    try {
        var u = new URL(window.location.href);
        u.searchParams.set('layout', mode);
        window.history.replaceState(null, '', u.toString());
    } catch (e) {}
    var sel = qrGet('qr-layout');
    if (sel) sel.value = mode;
    if (qrLastDoc) qrRender(qrLastDoc, qrLastDivs);
}

// Колонка одного игрока внутри карточки (единая для всех трёх раскладок).
function qrPlayerColHtml(g, geIdx, groupEntries, scheme, p) {
    var members = g.players || [];
    var rid = g.roundId;
    var startHoleTxt = (g.startHole === 10 ? '10' : String(g.startHole || 1));
    // Один QR на игрока:
    //   группа 2+ → групповая карточка (свой счёт + счёт маркируемого партнёра);
    //   группа из одного → одиночная карточка scorer.html.
    var isGroupCard = members.length > 1;
    var scoreUrl = isGroupCard
        ? qrPageUrl('setup-round.html', 'round=' + encodeURIComponent(rid) + '&as=' + encodeURIComponent(p.id))
        : qrPageUrl('scorer.html', 'round=' + encodeURIComponent(rid) + '&player=' + encodeURIComponent(p.id));
    var markTarget = null;
    (g.markers || []).forEach(function(mk) { if (mk.markerId === p.id) markTarget = mk; });
    var markName = markTarget ? qrFio(findPl(g, markTarget.targetId)) : '';

    // Зачётная группа игрока (по обрезанному гандикапу — он записан в exactHcp).
    // Имя группы ИЛИ диапазон HCP — но не оба сразу: названия вида
    // «Мужчины 0–12» уже содержат диапазон, и старый бейдж «название · 0–12»
    // двоил информацию.
    var pdiv = qrFindDivision(qrLastDivs, p.exactHcp, p.gender, { pid: p.id, fio: qrNormFio(qrFio(p)) });
    var pdivHtml = '';
    if (pdiv) {
        var prg = qrDivRange(pdiv);
        var pdivTxt = pdiv.name ? pdiv.name : (prg ? 'HCP ' + prg : '');
        if (pdivTxt) pdivHtml = '<span class="div-badge">🏆 ' + qrEsc(pdivTxt) + '</span>';
    }

    var html = '<div class="pcol">';
    html += '<div class="grp-row">';
    html += '<span class="grp-badge">' + qrEsc(qrGroupLabel(g, geIdx, groupEntries, scheme)) + '</span>';
    html += '<span class="time-badge">⏱ ' + qrTime(g.startTime) + ' · ЛУНКА ' + startHoleTxt + '</span>';
    html += pdivHtml + '</div>';
    html += '<div class="pname">' + qrEsc(qrFio(p)) + '</div>';
    html += '<div class="pmeta">';
    html += '<span>ТИ: <b>' + qrTeeName(p.tee) + '</b></span>';
    html += '<span>Точный HCP: <b>' + qrHcp(p.exactHcp) + '</b></span>';
    html += '<span>Полевой HCP: <b>' + qrHcp(p.fieldHcp) + '</b></span>';
    html += (markName ? '<span class="mark-chip">👁 Маркирует: <b>' + qrEsc(markName) + '</b></span>' : '');
    html += '</div>';
    html += '<div class="qr-grid">';
    html += '<div class="qr-box"><div class="qr-lbl">' +
        (isGroupCard
            ? '📱 Моя карточка — свой счёт и счёт маркируемого партнёра'
            : '📱 Моя карточка — ввод счёта') +
        '</div>' +
        // loading="eager": все коды грузятся сразу, а не при прокрутке —
        // иначе в печать уходят пустые места. onerror — цепочка провайдеров.
        // Ссылку под QR-кодом не печатаем (требование клуба): код крупнее
        // и считывается с телефона быстрее. Адрес остаётся в data-qr.
        '<img loading="eager" decoding="async" src="' + qrUrl(scoreUrl) + '" data-qr="' + encodeURIComponent(scoreUrl) + '" data-qr-try="0" onload="qrImgOk(this)" onerror="qrImgFail(this)" alt="QR"></div>';
    html += '</div>';
    html += '</div>';
    return html;
}

// «Состав флайта» под карточкой: игроки карточки выделяются жирным.
function qrMembersNote(members, cardIds) {
    cardIds = cardIds || [];
    var names = members.map(function(m) {
        return cardIds.indexOf(m.id) !== -1
            ? '<b style="color:#6d5717;">' + qrEsc(qrFio(m)) + '</b>'
            : qrEsc(qrFio(m));
    });
    return '<div class="members-note"><b>Состав флайта:</b> ' + names.join(' · ') + '</div>';
}

function qrRender(doc, divs) {
    var content = qrGet('qr-content');
    if (!content) return;
    var loading = qrGet('qr-loading'); if (loading) loading.classList.add('hidden');
    content.classList.remove('hidden');
    divs = divs || [];
    qrLastDoc = doc;
    qrLastDivs = divs;

    var layout = qrGetLayout();
    var layoutSel = qrGet('qr-layout');
    if (layoutSel) layoutSel.value = layout;

    var groupEntries = Object.keys(doc.groups || {}).map(function(k) {
        return { key: k, g: doc.groups[k] || {} };
    });
    qrSortGroups(groupEntries, doc.scheme);

    var totalPlayers = 0;
    groupEntries.forEach(function(ge) { totalPlayers += (ge.g.players || []).length; });

    var titleHtml = '';
    titleHtml += '<h1 class="qr-h">🏌️ Стартовый протокол</h1>';
    titleHtml += '<p class="sub">' +
        (doc.tournamentName ? '🏆 ' + qrEsc(doc.tournamentName) + ' · ' : '') +
        qrEsc(doc.name || '') + (doc.date ? ' · ' + qrDate(new Date(doc.date + 'T00:00:00')) : '') +
        (qrFormatsLabel(doc) ? ' · ' + qrEsc(qrFormatsLabel(doc)) : '') +
        ' · групп: ' + groupEntries.length + ' · игроков: ' + totalPlayers + '</p>';

    // ── Стартовый лист: визуально отделённые флайты (группы) ──
    // Каждый флайт — свой блок с шапкой «Группа · Лунка · Время»:
    // сразу видно, что с 1-й лунки стартуют эти игроки, а со 2-й — эти.
    var sheetHtml = '<div class="sheet"><div class="flights">';
    groupEntries.forEach(function(ge, geIdx) {
        var g = ge.g;
        var members = g.players || [];
        var glabel = qrGroupLabel(g, geIdx, groupEntries, doc.scheme);
        var holeTxt = (g.startHole === 10 ? '10' : String(g.startHole || 1));
        var cntTxt = members.length + ' ' + (members.length === 1 ? 'игрок' : (members.length < 5 ? 'игрока' : 'игроков'));
        sheetHtml += '<div class="flight-block">';
        sheetHtml += '<div class="flight-head">' +
            '<span class="flight-title">🚩 ' + qrEsc(glabel) + '</span>' +
            '<span class="flight-hole">Лунка ' + qrEsc(holeTxt) + '</span>' +
            '<span class="flight-time">⏱ ' + qrTime(g.startTime) + '</span>' +
            (qrGroupFormatsLabel(g, doc) ? '<span class="flight-fmt">🏌 ' + qrEsc(qrGroupFormatsLabel(g, doc)) + '</span>' : '') +
            (parseInt(g.startOrder, 10) ? '<span class="flight-queue">' + qrEsc((typeof currentLang !== 'undefined' && currentLang === 'en') ? 'tee-off #' : 'старт №') + ' ' + parseInt(g.startOrder, 10) + '</span>' : '') +
            '<span class="flight-count">' + qrEsc(cntTxt) + '</span>' +
            '</div>';
        sheetHtml += '<table><thead><tr>' +
            '<th style="width:26px;">№</th><th>Игрок</th><th>ТИ</th><th>Точный HCP</th><th>Полевой HCP</th><th>Маркирует</th>' +
            '</tr></thead><tbody>';
        members.forEach(function(p, i) {
            sheetHtml += '<tr>' +
                '<td class="flight-num">' + (i + 1) + '</td>' +
                '<td><b>' + qrEsc(qrFio(p)) + '</b>' + qrDivInline(p, divs) + '</td>' +
                '<td>' + qrTeeName(p.tee) + '</td>' +
                '<td>' + qrHcp(p.exactHcp) + '</td>' +
                '<td>' + qrHcp(p.fieldHcp) + '</td>' +
                '<td>' + qrEsc(qrMarkedName(g, p)) + '</td>' +
                '</tr>';
        });
        sheetHtml += '</tbody></table></div>';
    });
    sheetHtml += '</div></div>';

    // ── QR-карточки: раскладка — из селектора в панели (3 варианта) ──
    var cardsHtml = '<div class="pcards pcards-' + layout + '">';
    groupEntries.forEach(function(ge, geIdx) {
        var g = ge.g;
        var members = g.players || [];
        var cardWrap = function(sub, cls, inner) {
            var ids = sub.map(function(m) { return m.id; });
            return '<div class="pcard ' + cls + '">' + inner + qrMembersNote(members, ids) + '</div>';
        };
        if (layout === 'pair') {
            // Пары по порядку флайта: 2 игрока на карточку, разделённую
            // вертикально на две части (у каждого свой QR и данные).
            for (var pi = 0; pi < members.length; pi += 2) {
                var pair = members.slice(pi, pi + 2);
                if (!pair.length) continue;
                var innerPair = '<div class="pcard-halves">' +
                    pair.map(function(m) { return qrPlayerColHtml(g, geIdx, groupEntries, doc.scheme, m); }).join('<div class="pcol-divider"></div>') +
                    '</div>';
                cardsHtml += cardWrap(pair, 'pcard-pair', innerPair);
            }
        } else if (layout === 'quad') {
            // По 4 игрока на карточку (сетка 2×2).
            for (var qi = 0; qi < members.length; qi += 4) {
                var quad = members.slice(qi, qi + 4);
                if (!quad.length) continue;
                var innerQuad = '<div class="pgrid4">' +
                    quad.map(function(m) { return qrPlayerColHtml(g, geIdx, groupEntries, doc.scheme, m); }).join('') +
                    '</div>';
                cardsHtml += cardWrap(quad, 'pcard-quad', innerQuad);
            }
        } else {
            // Классика: 1 игрок — 1 карточка.
            members.forEach(function(p) {
                if (!p || !p.id) return;
                cardsHtml += cardWrap([p], 'pcard-single', qrPlayerColHtml(g, geIdx, groupEntries, doc.scheme, p));
            });
        }
    });
    cardsHtml += '</div>';

    var cardsTitle = '<h1 class="qr-h" style="font-size:19px;">🏌️ QR-карточки игроков</h1>' +
        '<p class="sub">' + (doc.tournamentName ? '🏆 ' + qrEsc(doc.tournamentName) + ' · ' : '') + qrEsc(doc.name || '') +
        ' · групп: ' + groupEntries.length + ' · игроков: ' + totalPlayers + (qrFormatsLabel(doc) ? ' · ' + qrEsc(qrFormatsLabel(doc)) : '') + '</p>';
    content.innerHTML = '<div class="sheet-wrap">' + titleHtml + sheetHtml + '</div>' +
        '<div class="cards-wrap"><div class="qr-cards-head">' + cardsTitle + '</div>' + cardsHtml + '</div>';

    // Предупреждение, если нет ни одной карточки
    if (!totalPlayers) {
        content.innerHTML = '<div class="errbox"><h2>ℹ️ Пустой протокол</h2><p>В этом протоколе нет игроков.</p></div>';
    }
}

// Подпись зачётной группы в строке стартового листа (таблица).
// Имя группы ИЛИ диапазон HCP — но не оба сразу (чтобы не дублировать).
function qrDivInline(p, divs) {
    if (!divs || !divs.length) return '';
    var d = qrFindDivision(divs, p.exactHcp, p.gender);
    if (!d) return '';
    var rg = qrDivRange(d);
    var txt = d.name ? d.name : (rg ? 'HCP ' + rg : '');
    if (!txt) return '';
    return ' <span class="div-inline">· ' + qrEsc(txt) + '</span>';
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
