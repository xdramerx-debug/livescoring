// Сводка активных фильтров остаётся видимой, даже когда панель свёрнута.
(function () {
    'use strict';
    function init() {
        var details = document.querySelector('.page-filters-details');
        if (!details) return;
        var badge = details.querySelector('.page-filters-active');
        if (!badge) return;
        var fields = details.querySelectorAll('[data-filter-default]');
        function update() {
            var count = 0;
            Array.prototype.forEach.call(fields, function (field) {
                if ((field.value || '').trim() !== field.getAttribute('data-filter-default')) count++;
            });
            badge.hidden = count === 0;
            var en = document.documentElement.lang === 'en';
            badge.textContent = count ? (en ? 'Active: ' : 'Активно: ') + count : '';
        }
        details.addEventListener('input', update);
        details.addEventListener('change', update);
        // Пресеты и сброс дат меняют значения программно, без input/change.
        details.addEventListener('click', function () { setTimeout(update, 0); });
        // Переключатель языка находится вне панели.
        document.addEventListener('click', function (event) {
            if (event.target.closest && event.target.closest('[data-act="toggleLang"]')) setTimeout(update, 0);
        });
        update();
    }
    document.addEventListener('DOMContentLoaded', init);
}());
