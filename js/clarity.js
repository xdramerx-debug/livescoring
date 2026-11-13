// Progressive disclosure only: score writes, calculations and permissions stay in their modules.
(function () {
    'use strict';
    function en() { return document.documentElement.lang === 'en'; }
    function text(ru, english) { return en() ? english : ru; }
    function fold(nodes, ru, english, open) {
        nodes = nodes.filter(Boolean);
        if (!nodes.length) return null;
        var details = document.createElement('details');
        details.className = 'clarity-disclosure';
        details.open = !!open;
        var summary = document.createElement('summary');
        summary.dataset.clarityRu = ru;
        summary.dataset.clarityEn = english;
        summary.textContent = text(ru, english);
        details.appendChild(summary);
        nodes[0].parentNode.insertBefore(details, nodes[0]);
        nodes.forEach(function (node) { details.appendChild(node); });
        return details;
    }
    function labels() {
        document.querySelectorAll('[data-clarity-ru]').forEach(function (node) {
            node.textContent = en() ? node.dataset.clarityEn : node.dataset.clarityRu;
        });
    }
    function boot() {
        if (document.documentElement.dataset.clarityReady) return;
        document.documentElement.dataset.clarityReady = "true";
        // Primary navigation stays task-oriented; secondary destinations remain one click away.
        var menu = document.getElementById('nav-menu');
        if (menu) {
            var secondary = Array.from(menu.querySelectorAll('.nav-link')).filter(function (link) {
                return ['players.html', 'tournaments.html', 'stats.html', 'handicap.html'].indexOf(link.getAttribute('href')) !== -1;
            });
            var more = fold(secondary, 'Ещё', 'More');
            if (more) {
                more.className = 'clarity-nav-more';
                if (more.querySelector('.active')) more.classList.add('active');
                var menuPanel = document.createElement('div');
                menuPanel.className = 'clarity-nav-panel';
                secondary.forEach(function (link) { menuPanel.appendChild(link); });
                more.appendChild(menuPanel);
                document.addEventListener('click', function (event) { if (!more.contains(event.target)) more.open = false; });
                document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && more.open) { more.open = false; more.querySelector('summary').focus(); } });
            }
        }
        var guestLink = document.querySelector('.auth-guest a');
        if (guestLink && typeof window.getSafeAuthRedirect === 'function') guestLink.href = window.getSafeAuthRedirect();
        var toolbar = document.getElementById('qr-toolbar');
        if (toolbar) {
            var printButtons = Array.from(toolbar.querySelectorAll('[data-act="qrPrintMode"]'));
            var chooser = document.createElement('label');
            chooser.className = 'clarity-print-choice';
            chooser.textContent = text('Документ: ', 'Document: ');
            var select = document.createElement('select');
            [['cards', text('QR-карточки', 'QR cards')], ['sheet', text('Стартовый лист', 'Tee sheet')]].forEach(function (item) {
                var option = document.createElement('option'); option.value = item[0]; option.textContent = item[1]; select.appendChild(option);
            });
            chooser.appendChild(select); toolbar.appendChild(chooser);
            var print = document.createElement('button'); print.type = 'button'; print.className = 'btn btn-g';
            print.dataset.clarityRu = 'Печать'; print.dataset.clarityEn = 'Print';
            print.addEventListener('click', function () { if (typeof window.qrPrintMode === 'function') window.qrPrintMode(select.value); });
            toolbar.appendChild(print);
            printButtons.forEach(function (button) { button.hidden = true; });
            var previewDocument = function () {
                document.body.classList.toggle('clarity-preview-sheet', select.value === 'sheet');
                document.body.classList.toggle('clarity-preview-cards', select.value === 'cards');
                var layout = document.getElementById('qr-layout');
                if (layout) layout.closest('label').hidden = select.value === 'sheet';
            };
            select.addEventListener('change', previewDocument); previewDocument();
        }
        // A visible explanation is better than suppressing version information altogether.
        document.querySelectorAll('.site-version').forEach(function (node) {
            fold([node], 'О приложении', 'About this app');
        });
        document.querySelectorAll('.nav-toggle:not([aria-label])').forEach(function (node) {
            node.setAttribute('aria-label', text('Открыть меню', 'Open menu'));
        });
        document.querySelectorAll('input[type="password"]').forEach(function (input) {
            if (!input.id) return;
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'clarity-password';
            button.setAttribute('aria-controls', input.id);
            button.setAttribute('aria-pressed', 'false');
            function update() {
                var shown = input.type === 'text';
                button.textContent = shown ? text('Скрыть пароль', 'Hide password') : text('Показать пароль', 'Show password');
                button.setAttribute('aria-pressed', String(shown));
            }
            button.addEventListener('click', function () {
                input.type = input.type === 'password' ? 'text' : 'password';
                update();
            });
            input.insertAdjacentElement('afterend', button);
            update();
        });
        // Preserve every specialised format and timing option, but keep the first screen short.
        var timing = document.getElementById('grp-timing-preview');
        if (timing) {
            var heading = timing.previousElementSibling;
            fold([heading, timing], 'План прохождения', 'Pace plan');
        }
        var resume = document.getElementById('fio-resume-card');
        var setup = document.getElementById('setup');
        if (resume && setup) {
            var recovery = fold([resume], 'Найти незавершённый раунд', 'Find an unfinished round');
            setup.insertBefore(recovery, setup.firstChild);
        }
        document.querySelectorAll('.score-pad').forEach(function (pad) {
            fold([pad], 'Быстрый выбор числа', 'Quick number selection');
        });
        // Rare settings remain reachable without hiding safety-critical undo/verification.
        ['group-stableford-control', 'sc-stableford-control'].forEach(function (id) {
            fold([document.getElementById(id)], 'Отображение очков', 'Points display');
        });
        document.querySelectorAll('.score-toolbar [data-act="toggleLargeUi"]').forEach(function (button) {
            fold([button], 'Размер интерфейса', 'Interface size');
        });
        // Reference table uses exactly the calculator's gender/tee; no second visible form.
        var tableGender = document.getElementById('tbl-gender');
        if (tableGender) {
            var card = tableGender.closest('.card');
            var output = document.getElementById('hcp-tables');
            var disclosure = fold([card, output], 'Таблица для выбранных ТИ', 'Table for selected tees');
            card.hidden = true;
            var syncTable = function () {
                if (!disclosure.open) return;
                tableGender.value = document.getElementById('calc-gender').value;
                if (typeof window.onGenderChange === 'function') window.onGenderChange();
                document.getElementById('tbl-tee').value = document.getElementById('calc-tee').value;
                if (typeof window.showTable === 'function') window.showTable();
            };
            disclosure.addEventListener('toggle', syncTable);
            ['calc-gender', 'calc-tee'].forEach(function (id) {
                document.getElementById(id).addEventListener('change', syncTable);
            });
        }
        var design = document.getElementById('tab-design');
        if (design) fold(Array.from(design.querySelectorAll(':scope > .card')).slice(1), 'Расширенное оформление страниц и блоков', 'Advanced page and block styles');
        // Administrative integrations are configuration, not the operational call queue.
        var alerts = document.getElementById('tab-alerts');
        if (alerts) {
            var cards = Array.from(alerts.querySelectorAll(':scope > .card'));
            fold(cards.slice(1), 'Настройки доставки вызовов и интеграции', 'Call delivery and integrations');
        }
        document.querySelectorAll('.page-filters-details > summary [data-i18n="filters_search_toggle"]').forEach(function (node) {
            node.removeAttribute('data-i18n');
            node.dataset.clarityRu = 'Фильтры'; node.dataset.clarityEn = 'Filters';
        });
        labels();
        new MutationObserver(labels).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
}());
