// Read-only gallery. Loaded only after opening Admin → Appearance → PR history.
(function (root) {
    'use strict';
    function bi(ru, en) { return document.documentElement.lang === 'en' ? en : ru; }
    var mounted = false;
    root.pestovoRenderDesignHistory = function () {
        if (mounted) return;
        var section = document.getElementById('tab-designhistory');
        if (!section) return;
        var data = root.pestovoDesignHistoryData;
        var grid = section.querySelector('#dh-grid');
        if (!data || !Array.isArray(data.prs) || !data.range || !Number.isInteger(data.range.to)) {
            grid.textContent = bi("Не удалось загрузить каталог. Перезагрузите страницу и попробуйте снова.", "Unable to load the catalog. Reload the page and try again.");
            return;
        }
        mounted = true;
        var page = 0;
        var size = 12;
        var filtered = [];
        var selected = null;
        var selectedScreen = 'home';
        var opener = null;
        var search = section.querySelector('#dh-search');
        var status = section.querySelector('#dh-status');
        var range = section.querySelector('#dh-range');
        var order = section.querySelector('#dh-order');
        var screen = section.querySelector('#dh-screen');
        var dialog = section.querySelector('#dh-dialog');
        var titles = { home: bi("Главная страница", "Home"), scoring: bi("Ввод счёта", "Score entry") };
        function element(tag, cls, text) {
            var node = document.createElement(tag);
            if (cls) node.className = cls;
            if (text !== undefined) node.textContent = text;
            return node;
        }
        function button(text, callback) {
            var node = element('button', 'btn btn-ol', text);
            node.type = 'button';
            node.addEventListener('click', callback);
            return node;
        }
        function screenshot(pr, kind) {
            // Paths derive only from validated PR numbers, never from untrusted titles or URLs.
            return 'img/design-history/pr-' + pr.number + '-' + kind + '.jpg';
        }
        function date(pr) {
            return new Date(pr.date).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'ru-RU', { timeZone: 'UTC' });
        }
        function renderDialog() {
            var pr = selected;
            section.querySelector('#dh-dialog-title').textContent = 'PR #' + pr.number + ' · ' + titles[selectedScreen];
            section.querySelector('#dh-dialog-sub').textContent = pr.title;
            var img = section.querySelector('#dh-dialog-image');
            img.src = screenshot(pr, selectedScreen);
            img.alt = titles[selectedScreen] + bi(" для PR #", " for PR #") + pr.number + bi(" — реконструкция", " — reconstruction");
            section.querySelector('#dh-dialog-note').textContent = pr.staticScoring && selectedScreen === 'scoring' ? bi("Статическая реконструкция: исходный JS этого PR не запускается. Показана его HTML-разметка с демонстрационными полями.", "Static reconstruction: this PR’s JavaScript cannot run. Its HTML is shown with demo fields.") : bi("Реконструкция из коммита · демонстрационные данные · 430 × 1100 px", "Commit reconstruction · demo data · 430 × 1100 px");
            var original = section.querySelector('#dh-original');
            original.href = img.src;
            section.querySelector('#dh-dialog-source').href = 'https://github.com/xdramerx-debug/livescoring/pull/' + pr.number;
            var index = filtered.indexOf(pr);
            section.querySelector('#dh-dialog-prev').disabled = index <= 0;
            section.querySelector('#dh-dialog-next').disabled = index >= filtered.length - 1;
            section.querySelector('#dh-dialog-screen').textContent = selectedScreen === 'home' ? bi("Показать ввод счёта", "Show score entry") : bi("Показать главную", "Show home");
        }
        function open(pr, kind, trigger) {
            selected = pr; selectedScreen = kind; opener = trigger;
            renderDialog();
            dialog.showModal();
        }
        function move(delta) {
            var next = filtered[filtered.indexOf(selected) + delta];
            if (next) { selected = next; renderDialog(); }
        }
        function render() {
            titles = { home: bi('Главная страница', 'Home'), scoring: bi('Ввод счёта', 'Score entry') };
            var query = search.value.trim().toLocaleLowerCase('ru');
            var number = /^#?\d+$/.test(query) ? Number(query.replace('#', '')) : null;
            filtered = data.prs.filter(function (pr) {
                if (!Number.isInteger(pr.number) || pr.number < 1 || pr.number > data.range.to) return false;
                if (range.value === '1-100' && pr.number > 100) return false;
                if (range.value === '101-187' && pr.number < 101) return false;
                if (status.value === 'merged' && !pr.merged) return false;
                if (status.value === 'closed' && pr.merged) return false;
                return !query || (number !== null ? pr.number === number : (pr.title + ' ' + pr.commit).toLocaleLowerCase('ru').indexOf(query) !== -1);
            }).sort(function (a, b) { return order.value === 'desc' ? b.number - a.number : a.number - b.number; });
            var pages = Math.max(1, Math.ceil(filtered.length / size));
            page = Math.min(page, pages - 1);
            grid.replaceChildren();
            filtered.slice(page * size, (page + 1) * size).forEach(function (pr) {
                var card = element('article', 'dh-card');
                var header = element('div', 'dh-card-head');
                var link = element('a', 'dh-pr-link', 'PR #' + pr.number);
                link.href = 'https://github.com/xdramerx-debug/livescoring/pull/' + pr.number;
                link.target = '_blank'; link.rel = 'noopener noreferrer';
                header.append(link, element('span', 'dh-state', pr.merged ? bi("Слит · ", "Merged · ") + date(pr) : bi("Закрыт без слияния", "Closed without merge")));
                card.append(header, element('h3', '', pr.title));
                var shots = element('div', 'dh-shots');
                ['home', 'scoring'].filter(function (kind) { return screen.value === 'both' || screen.value === kind; }).forEach(function (kind) {
                    var shot = element('figure', 'dh-shot');
                    var trigger = element('button', 'dh-image-button');
                    trigger.type = 'button';
                    trigger.setAttribute('aria-label', bi("Увеличить: ", "Enlarge: ") + titles[kind] + ', PR #' + pr.number);
                    var img = element('img');
                    img.src = screenshot(pr, kind); img.alt = titles[kind] + ' · PR #' + pr.number;
                    img.setAttribute('loading', 'lazy'); img.decoding = 'async'; img.width = 430; img.height = 1100;
                    img.addEventListener('error', function () {
                        trigger.replaceChildren(element('span', 'dh-image-error', bi("Снимок не загрузился. Откройте изображение по ссылке ниже.", "Image failed to load. Open the original using the link below.")));
                    });
                    trigger.append(img);
                    trigger.addEventListener('click', function () { open(pr, kind, trigger); });
                    var caption = element('figcaption', '', titles[kind]);
                    shot.append(trigger, caption);
                    shots.append(shot);
                });
                var meta = element('p', 'dh-meta', (pr.merged ? bi("После слияния · ", "After merge · ") : bi("Последняя версия PR · ", "Last PR version · ")) + pr.commit.slice(0, 8));
                card.append(shots, meta);
                if (pr.captureWarnings && pr.captureWarnings.length) card.append(element('p', 'dh-meta', pr.staticScoring ? bi("Статическая реконструкция ввода: исходный JS PR не запускается.", "Static score-entry reconstruction: the original JavaScript cannot run.") : bi("Исходный JS выдал предупреждения при реконструкции.", "The original JavaScript reported warnings during reconstruction.")));
                grid.append(card);
            });
            if (!filtered.length) grid.append(element('p', 'dh-empty', bi("Ничего не найдено. Измените запрос или сбросьте фильтры.", "Nothing found. Change your search or reset the filters.")));
            section.querySelector('#dh-summary').textContent = bi("Найдено PR: ", "PRs found: ") + filtered.length + bi(" из ", " of ") + data.prs.length + bi(". Страница ", ". Page ") + (page + 1) + bi(" из ", " of ") + pages + '.';
            var pager = section.querySelector('#dh-pager');
            pager.replaceChildren();
            var prev = button(bi("← Назад", "← Previous"), function () { page--; render(); grid.scrollIntoView({ block: 'start' }); });
            var next = button(bi("Далее →", "Next →"), function () { page++; render(); grid.scrollIntoView({ block: 'start' }); });
            prev.disabled = page === 0; next.disabled = page >= pages - 1;
            pager.append(prev, element('span', '', (page + 1) + ' / ' + pages), next);
        }
        [search, status, range, order, screen].forEach(function (control) {
            control.addEventListener(control === search ? 'input' : 'change', function () { page = 0; render(); });
        });
        section.querySelector('#dh-reset').addEventListener('click', function () {
            search.value = ''; status.value = 'all'; range.value = 'all'; order.value = 'asc'; screen.value = 'both'; page = 0; render(); search.focus();
        });
        section.querySelector('#dh-dialog-close').addEventListener('click', function () { dialog.close(); });
        section.querySelector('#dh-dialog-prev').addEventListener('click', function () { move(-1); });
        section.querySelector('#dh-dialog-next').addEventListener('click', function () { move(1); });
        section.querySelector('#dh-dialog-screen').addEventListener('click', function () { selectedScreen = selectedScreen === 'home' ? 'scoring' : 'home'; renderDialog(); });
        dialog.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
            if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
        });
        dialog.addEventListener('close', function () { if (opener && document.contains(opener)) opener.focus(); });
        if (typeof MutationObserver !== 'undefined') new MutationObserver(function () {
            render();
            if (selected && dialog.open) renderDialog();
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
        render();
    };
})(window);
