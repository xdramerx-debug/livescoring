// js/setup-round-fio.js — блок «продолжить чужой раунд» на setup-round.html:
// поиск активных раундов по ФИО. Вынесено из встроенного <script>, чтобы
// CSP обходился без 'unsafe-inline' (docs/IMPROVEMENTS-2026-10.md, п.2).
function searchFioResume() {
    var inp = document.getElementById('fio-resume-input');
    var resEl = document.getElementById('fio-resume-results');
    if (!inp || !resEl) return;
    var fio = inp.value.trim();
    if (!fio) {
        if (typeof toast === 'function') toast('Введите имя и фамилию', 'warn');
        return;
    }
    resEl.innerHTML = '<p style="color:var(--muted);font-size:13px;"><i class="fas fa-spinner fa-spin"></i> Поиск...</p>';
    if (typeof pestovoFindActiveRoundsByFio === 'function') {
        pestovoFindActiveRoundsByFio(fio).then(function(matches) {
            resEl.innerHTML = pestovoRenderFioResumeListHtml(matches);
            if (!matches.length && typeof toast === 'function') {
                toast('Активных раундов для "' + fio + '" не найдено', 'info');
            }
        });
    } else {
        resEl.innerHTML = '<p style="color:var(--muted);">Функция поиска недоступна</p>';
    }
}
document.addEventListener('DOMContentLoaded', function() {
    var inp = document.getElementById('fio-resume-input');
    if (inp) {
        inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); searchFioResume(); }
        });
    }
});
