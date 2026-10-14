// Киоск-режим ввода счёта (аудит 2026-10, docs/IMPROVEMENTS-2026-10.md п.13).
//
// Обе функции были продублированы в js/scorer.js и js/live.js. isScoreKioskUrl()
// совпадала побайтово, applyScoreKiosk() отличалась одной строкой: scorer.js
// брал шапку через querySelector('.page-head'), live.js — через
// getElementById('page-head'). Расхождение не случайное, а следствие разной
// разметки страниц: в scorer.html у шапки только класс, в setup-round.html есть
// и id, и класс. Общая версия проверяет оба варианта, поэтому подходит обеим
// страницам и больше не разъезжается.
//
// Подключается на scorer.html и setup-round.html ДО scorer.js/live.js, которые
// вызывают applyScoreKiosk() при инициализации и после смены раунда.
// Режим определяется URL: ?round=<id> плюс ?as=<markerId> или ?player=<id> —
// то есть вход по QR-коду на конкретный раунд конкретного игрока.

function isScoreKioskUrl() {
    try {
        var q = new URLSearchParams(window.location.search);
        return !!(q.get('round') && (q.get('as') || q.get('player')));
    } catch (e) { return false; }
}

function applyScoreKiosk() {
    if (!isScoreKioskUrl()) return false;
    try {
        document.documentElement.classList.add('score-kiosk');
        var nav = document.getElementById('main-nav');
        if (nav) nav.classList.remove('hidden');
        if (typeof applyNavHeight === 'function') applyNavHeight();
        ['my-active-rounds-container'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        // Шапка остаётся видимой, но компактной. id есть не на всех страницах
        // (scorer.html — только класс), поэтому проверяем оба селектора.
        var ph = document.getElementById('page-head') || document.querySelector('.page-head');
        if (ph) {
            ph.classList.remove('hidden');
            ph.classList.add('scoring-compact');
        }
        var hideSel = document.querySelectorAll('footer, .footer');
        for (var i = 0; i < hideSel.length; i++) hideSel[i].classList.add('hidden');
    } catch (e) { console.warn('[silent]', e); }
    return true;
}
