// js/kiosk-mode-detect.js — по ссылке вида ?round=…&as=… (или &player=…)
// страница открывается в режиме «киоск счёта»: класс на <html> включает
// крупный шрифт и скрывает лишнее. Раньше этот код был встроенным <script>
// на scorer.html и setup-round.html — вынесен, чтобы CSP жил без
// 'unsafe-inline' (docs/IMPROVEMENTS-2026-10.md, п.2).
(function(){try{var q=new URLSearchParams(location.search);if(q.get('round')&&(q.get('as')||q.get('player'))){document.documentElement.classList.add('score-kiosk');}}catch(e){}})();
