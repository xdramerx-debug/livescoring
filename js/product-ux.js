// js/product-ux.js — продуктовый слой интерфейса (v1.129.0).
//
// Что здесь и почему отдельным файлом:
//   • нижняя навигация на телефоне (ключевые разделы всегда под большим пальцем);
//   • онбординг на один экран (первый визит на главной);
//   • честное состояние сети («нет сети — счёт сохранится локально»);
//   • подсветка изменившейся цифры счёта и haptic при вводе;
//   • шаги создания раунда и sticky-CTA «Начать раунд» на экране раунда.
//
// Файл ничего не знает о Firebase и не дублирует бизнес-логику: кнопки
// вызывают те же data-act-действия, что уже есть на страницах. Поэтому
// отключение файла (или ошибка в нём) не ломает создание раунда.
//
// Подключается на index.html, leaderboard.html и setup-round.html ПОСЛЕ
// js/pwa.js (нужен syncOfflineScores) и до закрытия <body>.
'use strict';

(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.__pvUxLoaded) return;
    window.__pvUxLoaded = true;

    var REDUCED_MOTION = false;
    try {
        REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { REDUCED_MOTION = false; }

    function tr(key, fallback) {
        try {
            if (typeof window.t === 'function') {
                var value = window.t(key);
                if (value && value !== key) return value;
            }
        } catch (e) { /* словарь может быть ещё не готов */ }
        return fallback;
    }

    function el(tag, cls, html) {
        var node = document.createElement(tag);
        if (cls) node.className = cls;
        if (html !== undefined) node.innerHTML = html;
        return node;
    }

    function buzz(ms) {
        try {
            if (typeof window.vib === 'function') { window.vib(ms); return; }
        } catch (e) { /* игнорируем */ }
        try {
            if (navigator && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
        } catch (e) { /* игнорируем */ }
    }

    function currentPage() {
        var file = (window.location.pathname || '/').split('/').pop() || 'index.html';
        return file.replace(/^\//, '') || 'index.html';
    }

    // ─────────────────────────── НИЖНЯЯ НАВИГАЦИЯ ───────────────────────────
    // Только четыре ключевых раздела: остальное живёт в бургер-меню.
    var NAV_ITEMS = [
        { href: 'index.html', icon: 'fa-house', key: 'nav_home', fallback: 'Главная' },
        { href: 'setup-round.html', icon: 'fa-flag', key: 'nav_round', fallback: 'Раунд' },
        { href: 'leaderboard.html', icon: 'fa-trophy', key: 'nav_leaderboard', fallback: 'Все раунды' },
        { href: '#more', icon: 'fa-bars', key: 'more_header', fallback: 'Ещё', more: true }
    ];

    function buildBottomNav() {
        if (document.getElementById('pv-bottomnav')) return;
        var nav = el('nav', 'pv-bottomnav');
        nav.id = 'pv-bottomnav';
        nav.setAttribute('aria-label', tr('pv_main_nav', 'Основная навигация'));
        var page = currentPage();
        NAV_ITEMS.forEach(function (item) {
            var a = document.createElement(item.more ? 'button' : 'a');
            if (item.more) {
                a.type = 'button';
                a.setAttribute('aria-controls', 'mobile-drawer-root');
                a.addEventListener('click', function () {
                    if (typeof window.openMobileDrawer === 'function') window.openMobileDrawer();
                    else { var toggle = document.getElementById('nav-toggle'); if (toggle) toggle.click(); }
                });
            } else a.href = item.href;
            if (page === item.href) a.setAttribute('aria-current', 'page');
            a.innerHTML = '<i class="fas ' + item.icon + '" aria-hidden="true"></i>' +
                '<span>' + (tr(item.key, item.fallback)) + '</span>' +
                '<span class="pv-bn-dot" aria-hidden="true"></span>';
            nav.appendChild(a);
        });
        document.body.appendChild(nav);
        syncBottomNavHeight();
        // Высота панели меняется при повороте экрана и смене размера шрифта:
        // без пересчёта контент либо уезжает под панель, либо получает
        // пустой отступ внизу. Считаем по факту, без «магических» 58 px.
        if (!window.__pvUxNavResize) {
            window.__pvUxNavResize = true;
            var onResize = function () {
                if (window.requestAnimationFrame) window.requestAnimationFrame(syncBottomNavHeight);
                else syncBottomNavHeight();
            };
            window.addEventListener('resize', onResize);
            window.addEventListener('orientationchange', onResize);
        }
    }

    // display:none (десктоп) даёт offsetHeight = 0 — это и есть «панели нет».
    function syncBottomNavHeight() {
        var nav = document.getElementById('pv-bottomnav');
        var height = (nav && nav.offsetHeight) ? nav.offsetHeight : 0;
        document.body.style.setProperty('--bottomnav-h', height + 'px');
    }

    // ─────────────────────────── СОСТОЯНИЕ СЕТИ ───────────────────────────
    // Текст честный: счёт действительно кладётся в локальную очередь
    // (js/pwa.js → queueOfflineScoreAction) и отправляется при появлении сети.
    function buildNetBanner() {
        if (document.getElementById('pv-net-banner')) return;
        var banner = el('div', 'pv-net');
        banner.id = 'pv-net-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'polite');
        banner.hidden = true;
        banner.innerHTML =
            '<i class="fas fa-plug-circle-xmark" aria-hidden="true"></i>' +
            '<span class="pv-net-text">' + tr('pv_offline_text', 'Нет сети. Счёт сохранится локально.') + '</span>' +
            '<button type="button" class="pv-net-btn" data-pv-net="retry">' +
            tr('pv_offline_retry', 'Повторить') + '</button>';
        // Баннер фиксированный (css/product-ux.css) — в <body>, а не в <main>,
        // чтобы он не наследовал отступы и не «уезжал» при прокрутке.
        document.body.appendChild(banner);

        banner.addEventListener('click', function (event) {
            var action = event.target.closest ? event.target.closest('[data-pv-net]') : null;
            if (!action) return;
            try {
                if (typeof window.syncOfflineScores === 'function') window.syncOfflineScores();
                if (typeof window.toast === 'function') window.toast(tr('pv_synced', 'Счёт отправлен'), 'info');
            } catch (e) { console.warn('[pv-ux] sync', e); }
        });
        return banner;
    }

    function syncNetState() {
        var banner = document.getElementById('pv-net-banner') || buildNetBanner();
        if (!banner) return;
        var offline = (typeof navigator !== 'undefined' && navigator.onLine === false);
        banner.hidden = !offline;
        document.body.classList.toggle('pv-offline', offline);
    }

    // ─────────────────────────── ПОДСВЕТКА ИЗМЕНИВШЕЙСЯ ЦИФРЫ ───────────────────────────
    // Наблюдаем за текстом счёта: если значение изменилось — короткая
    // вспышка. Ничего не перерисовываем, поэтому реальные обработчики
    // остаются нетронутыми.
    var lastScores = null;
    function flashChangedScores() {
        if (REDUCED_MOTION || typeof WeakMap !== 'function') return;
        if (!lastScores) lastScores = new WeakMap();
        var nodes = document.querySelectorAll('.pv-live-score, .rlb-par, .pv-mini-par');
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var text = node.textContent;
            var prev = lastScores.get(node);
            if (prev !== undefined && prev !== text && node.classList) {
                node.classList.remove('pv-flash');
                // перезапуск анимации без reflow-хака: снимаем класс в следующем кадре
                (function (target) {
                    if (window.requestAnimationFrame) {
                        window.requestAnimationFrame(function () { target.classList.add('pv-flash'); });
                    } else {
                        target.classList.add('pv-flash');
                    }
                    setTimeout(function () { target.classList.remove('pv-flash'); }, 760);
                })(node);
            }
            lastScores.set(node, text);
        }
    }

    function observeScores() {
        var roots = ['live-rounds', 'lb-container', 'recent-results'];
        var seen = 0;
        roots.forEach(function (id) {
            var node = document.getElementById(id);
            if (!node || typeof MutationObserver !== 'function') return;
            seen++;
            var observer = new MutationObserver(function () { flashChangedScores(); });
            observer.observe(node, { childList: true, subtree: true, characterData: true });
        });
        return seen;
    }

    // ─────────────────────────── HAPTIC ПРИ ВВОДЕ СЧЁТА ───────────────────────────
    function bindHaptics() {
        document.addEventListener('pointerdown', function (event) {
            var target = event.target;
            if (!target || !target.closest) return;
            if (target.closest('.score-pad, .score-pad-key, .entry-score-square, .hole-btn')) buzz(6);
        }, { passive: true });
    }

    // ─────────────────────────── ШАГИ И STICKY-CTA НА ЭКРАНЕ РАУНДА ───────────────────────────
    function setupIsVisible() {
        var setup = document.getElementById('setup');
        if (!setup || setup.classList.contains('hidden')) return false;
        return !!document.getElementById('unified-setup-card');
    }

    function filledPlayerNames() {
        var slots = document.getElementById('player-slots');
        if (!slots) return { filled: 0, total: 0 };
        var idxs = [];
        var cards = slots.querySelectorAll('[data-pidx]');
        for (var i = 0; i < cards.length; i++) idxs.push(cards[i].getAttribute('data-pidx'));
        var filled = 0;
        idxs.forEach(function (idx) {
            var input = document.getElementById('pl-name-' + idx);
            if (input && String(input.value || '').trim()) filled++;
        });
        return { filled: filled, total: idxs.length };
    }

    function setupReady() {
        var names = filledPlayerNames();
        if (!names.total) return false;
        if (names.filled < names.total) return false;
        var time = document.getElementById('grp-time');
        if (time && !time.value) return false;
        return true;
    }

    // Полоса шагов: 1 формат → 2 игроки → 3 старт. Показываем реальное
    // состояние, а не декоративную анимацию: шаг «готов», когда данные есть.
    function buildSteps() {
        if (document.getElementById('pv-steps')) return;
        // Мастер (админ-вариант 5) и мобильный степпер уже рисуют шаги —
        // второй индикатор на экране не нужен.
        if (document.getElementById('p0-wizard-steps')) return;
        var wizard = document.getElementById('unified-wizard');
        if (wizard && !wizard.classList.contains('hidden')) return;
        var card = document.getElementById('unified-setup-card');
        if (!card || !card.parentNode) return;
        var steps = el('div', 'pv-steps');
        steps.id = 'pv-steps';
        steps.setAttribute('role', 'group');
        steps.setAttribute('aria-label', tr('pv_steps_aria', 'Шаги создания раунда'));
        steps.innerHTML =
            '<div class="pv-steps-track" aria-hidden="true">' +
            '<span class="pv-steps-seg" data-pv-seg="1"></span>' +
            '<span class="pv-steps-seg" data-pv-seg="2"></span>' +
            '<span class="pv-steps-seg" data-pv-seg="3"></span>' +
            '</div>' +
            '<div class="pv-steps-labels">' +
            '<span data-pv-lbl="1">1 · ' + tr('wiz_step_1', 'Параметры') + '</span>' +
            '<span data-pv-lbl="2">2 · ' + tr('wiz_step_2', 'Игроки') + '</span>' +
            '<span data-pv-lbl="3">3 · ' + tr('wiz_step_3', 'Старт') + '</span>' +
            '</div>';
        card.parentNode.insertBefore(steps, card);
        return steps;
    }

    // Пишем в DOM только изменившееся: иначе MutationObserver на #setup
    // срабатывает на собственную запись и уходит в бесконечный цикл
    // (замерено: 16 541 мутация за 2 секунды простоя).
    var stepsState = '';

    function updateSteps() {
        var steps = document.getElementById('pv-steps');
        if (!steps) return;
        var names = filledPlayerNames();
        var timeEl = document.getElementById('grp-time');
        var formatEl = document.getElementById('grp-format');
        var done1 = !!(timeEl && timeEl.value && formatEl && formatEl.value);
        var done2 = names.total > 0 && names.filled === names.total;
        var signature = (done1 ? '1' : '0') + (done2 ? '1' : '0') + '|' + currentLangTag();
        if (signature === stepsState) return;
        stepsState = signature;
        var states = [done1, done2, done1 && done2];
        states.forEach(function (done, i) {
            var seg = steps.querySelector('[data-pv-seg="' + (i + 1) + '"]');
            if (seg) {
                seg.classList.toggle('is-done', done && i < 2);
                seg.classList.toggle('is-current', !done && states.slice(0, i).every(Boolean));
            }
            var lbl = steps.querySelector('[data-pv-lbl="' + (i + 1) + '"]');
            if (lbl) {
                var current = !done && states.slice(0, i).every(Boolean);
                var html = '<b>' + (i + 1) + '</b> · ' + tr(['wiz_step_1', 'wiz_step_2', 'wiz_step_3'][i], '');
                if (lbl.innerHTML !== html) lbl.innerHTML = html;
                lbl.style.opacity = current ? '1' : (done ? '0.85' : '0.6');
            }
        });
    }

    // Язык в подписи шага: часть сигнатуры, чтобы смена языка перерисовала шаги.
    function currentLangTag() {
        try { return String(document.documentElement.getAttribute('lang') || currentLangTagFallback()); }
        catch (e) { return 'ru'; }
    }
    function currentLangTagFallback() {
        try { return (typeof currentLang !== 'undefined' && currentLang) || 'ru'; } catch (e) { return 'ru'; }
    }

    function buildCtaDock() {
        if (document.getElementById('pv-cta-dock')) return;
        if (!setupIsVisible()) return;
        var dock = el('div', 'pv-cta-dock');
        dock.id = 'pv-cta-dock';
        dock.innerHTML =
            '<button type="button" class="pv-cta" id="pv-cta-start" data-act="startUnifiedRound">' +
            '<i class="fas fa-play" aria-hidden="true"></i> <span data-i18n="start_round_btn">' +
            tr('start_round_btn', 'Начать раунд') + '</span></button>' +
            '<span class="pv-cta-note" id="pv-cta-note"></span>';
        document.body.appendChild(dock);
        return dock;
    }

    // ── Один «Начать раунд» на экране ──────────────────────────────────────
    // В форме уже есть своя кнопка старта (#unified-start-btn). Плавающий
    // док нужен только пока она за пределами экрана: иначе на странице
    // оказывались две одинаковые кнопки одновременно (аудит 2026-11).
    var inlineCtaVisible = false;
    var ctaObserver = null;
    var ctaScrollBound = false;

    function watchInlineCta() {
        var inline = document.getElementById('unified-start-btn');
        if (!inline) return;
        if (ctaObserver) { try { ctaObserver.disconnect(); } catch (e) { console.warn('[silent]', e); } ctaObserver = null; }
        if (typeof IntersectionObserver !== 'function') return; // jsdom и старые браузеры: док остаётся видимым
        try {
            ctaObserver = new IntersectionObserver(function (entries) {
                for (var i = 0; i < entries.length; i++) {
                    inlineCtaVisible = entries[i].isIntersecting;
                }
                updateCta();
            // Порог 0: док прячется, как только кнопка формы показалась на
            // экране хотя бы краем. С порогом 0.5 кнопка была видна на 40%,
            // док ещё показывался — и «Начать раунд» оказывался дважды.
            }, { threshold: 0 });
            ctaObserver.observe(inline);
        } catch (e) { console.warn('[pv-ux] cta observer', e); }
        // Наблюдатель срабатывает через кадр, а при плавной прокрутке этого
        // кадра не хватает: док и кнопка на миг оказываются на экране вместе.
        // Поэтому прокрутка пересчитывает состояние по фактическому прямоугольнику.
        if (!ctaScrollBound) {
            ctaScrollBound = true;
            var ticking = false;
            window.addEventListener('scroll', function () {
                if (ticking) return;
                ticking = true;
                var run = function () { ticking = false; updateCta(); };
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
                else setTimeout(run, 16);
            }, { passive: true });
        }
    }

    // Сколько кнопке старта осталось до видимости — без наблюдателя (фолбэк).
    function inlineCtaInView() {
        var inline = document.getElementById('unified-start-btn');
        if (!inline || typeof inline.getBoundingClientRect !== 'function') return false;
        var rect = inline.getBoundingClientRect();
        if (!rect.height) return false; // кнопка скрыта (режим просмотра)
        var viewport = window.innerHeight || document.documentElement.clientHeight || 0;
        // Считаем «в кадре» даже частичное перекрытие — как и IntersectionObserver
        // с порогом 0, иначе два пути расчёта дают разный ответ на краю экрана.
        return rect.bottom > 0 && rect.top < viewport;
    }

    function updateCta() {
        var dock = document.getElementById('pv-cta-dock') || buildCtaDock();
        if (!dock) return;
        // Решает прямоугольник: он всегда актуален, тогда как запись наблюдателя
        // отстаёт на кадр. Наблюдатель остаётся триггером пересчёта.
        inlineCtaVisible = inlineCtaInView();
        var visible = setupIsVisible() && !inlineCtaVisible;
        dock.classList.toggle('is-visible', visible);
        if (!visible) return;
        var names = filledPlayerNames();
        var note = document.getElementById('pv-cta-note');
        if (note) {
            note.innerHTML = setupReady()
                ? '<i class="fas fa-circle-check" aria-hidden="true"></i> ' + tr('pv_ready', 'Готово к старту')
                : '<i class="fas fa-circle-info" aria-hidden="true"></i> ' +
                  tr('pv_players_count', 'Игроков') + ': ' + names.filled + '/' + (names.total || 1);
        }
        var btn = document.getElementById('pv-cta-start');
        if (btn) btn.classList.toggle('is-not-ready', !setupReady());
        updateSteps();
    }

    function bindSetupListeners() {
        var setup = document.getElementById('setup');
        if (!setup) return;
        var pending = false;
        var refresh = function () {
            if (pending) return;
            pending = true;
            window.setTimeout(function () {
                pending = false;
                updateCta();
                buildSteps();
                updateSteps();
            }, 0);
        };
        setup.addEventListener('input', refresh);
        setup.addEventListener('change', refresh);
        if (typeof MutationObserver === 'function') {
            try {
                // Свои блоки (шаги, CTA, чипы недавних) живут внутри #setup:
                // их перерисовка — не повод пересчитывать состояние формы.
                var own = '#pv-steps, #pv-cta-dock, #pv-recent';
                new MutationObserver(function (list) {
                    for (var i = 0; i < list.length; i++) {
                        var target = list[i].target;
                        if (target && target.closest && target.closest(own)) continue;
                        refresh();
                        return;
                    }
                }).observe(setup, { childList: true, subtree: true });
            } catch (e) { console.warn('[pv-ux] observe setup', e); }
        }
        refresh();
    }

    // Пересборка собственных подписей после смены языка.
    function refreshOwnLabels() {
        try {
            var nav = document.getElementById('pv-bottomnav');
            if (nav && nav.parentNode) nav.parentNode.removeChild(nav);
            buildBottomNav();
            var dock = document.getElementById('pv-cta-dock');
            if (dock && dock.parentNode) dock.parentNode.removeChild(dock);
            if (setupIsVisible()) buildCtaDock();
            watchInlineCta();
            var recent = document.getElementById('pv-recent');
            if (recent && recent.parentNode) recent.parentNode.removeChild(recent);
            buildRecentPlayers();
            updateCta();
            // Подписи шагов тоже свои: после смены языка их надо обновить,
            // но updateSteps пишет в DOM только при изменении состояния.
            updateSteps();
            var banner = document.getElementById('pv-net-banner');
            if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
            buildNetBanner();
            syncNetState();
        } catch (e) { console.warn('[pv-ux] labels', e); }
    }

    // ─────────────────────────── НЕДАВНИЕ ИГРОКИ ───────────────────────────
    // Кто играл в прошлый раз, вспоминать вручную не нужно. Список копится
    // локально (в базе ничего не пишем) и только на этом устройстве.
    var RECENT_KEY = 'pestovo_recent_players';

    function readRecentPlayers() {
        try {
            var raw = localStorage.getItem(RECENT_KEY);
            var list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list.filter(function (n) { return typeof n === 'string' && n.trim(); }) : [];
        } catch (e) { return []; }
    }

    function rememberRecentPlayers() {
        var slots = document.getElementById('player-slots');
        if (!slots) return;
        var names = [];
        var inputs = slots.querySelectorAll('input[id^="pl-name-"]');
        for (var i = 0; i < inputs.length; i++) {
            var value = String(inputs[i].value || '').trim();
            if (value) names.push(value);
        }
        if (!names.length) return;
        var list = readRecentPlayers();
        names.forEach(function (name) {
            var at = list.indexOf(name);
            if (at !== -1) list.splice(at, 1);
            list.unshift(name);
        });
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))); } catch (e) { /* приватный режим */ }
    }

    // Подставить игрока в первое пустое поле. Значение ставим и через
    // input-событие, чтобы автодополнение и расчёт гандикапа увидели ввод.
    function fillPlayerName(name) {
        var slots = document.getElementById('player-slots');
        if (!slots) return;
        var inputs = slots.querySelectorAll('input[id^="pl-name-"]');
        var target = null;
        for (var i = 0; i < inputs.length; i++) {
            if (!String(inputs[i].value || '').trim()) { target = inputs[i]; break; }
        }
        if (!target && inputs.length) target = inputs[inputs.length - 1];
        if (!target) return;
        target.value = name;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        buzz(8);
        updateCta();
    }

    function buildRecentPlayers() {
        if (document.getElementById('pv-recent')) return;
        var slots = document.getElementById('player-slots');
        if (!slots || !slots.parentNode) return;
        var names = readRecentPlayers();
        if (!names.length) return;
        var box = el('div', 'pv-recent');
        box.id = 'pv-recent';
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', tr('pv_recent_players', 'Недавние игроки'));
        box.innerHTML = '<span class="pv-recent-label">' + tr('pv_recent_players', 'Недавние игроки') + '</span>' +
            names.map(function (name, i) {
                return '<button type="button" class="pv-recent-chip" data-pv-recent="' + i + '">' +
                    '<span class="pv-avatar" aria-hidden="true">' + escapeText(pvInitialsLocal(name)) + '</span>' +
                    escapeText(name) + '</button>';
            }).join('');
        slots.parentNode.insertBefore(box, slots);
        box.addEventListener('click', function (event) {
            var chip = event.target.closest ? event.target.closest('[data-pv-recent]') : null;
            if (!chip) return;
            var idx = parseInt(chip.getAttribute('data-pv-recent'), 10);
            var list = readRecentPlayers();
            if (list[idx]) fillPlayerName(list[idx]);
        });
    }

    function pvInitialsLocal(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '•';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }

    function escapeText(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ─────────────────────────── СБОРКА ───────────────────────────
    function boot() {
        try { buildBottomNav(); } catch (e) { console.warn('[pv-ux] nav', e); }
        try { buildNetBanner(); syncNetState(); } catch (e) { console.warn('[pv-ux] net', e); }
        try { observeScores(); flashChangedScores(); } catch (e) { console.warn('[pv-ux] flash', e); }
        try { bindHaptics(); } catch (e) { console.warn('[pv-ux] haptics', e); }
        try { buildCtaDock(); bindSetupListeners(); watchInlineCta(); updateCta(); } catch (e) { console.warn('[pv-ux] setup', e); }
        try { buildRecentPlayers(); } catch (e) { console.warn('[pv-ux] recent', e); }

        window.addEventListener('online', syncNetState);
        window.addEventListener('offline', syncNetState);
        // Старт раунда — единственный момент, когда состав точно известен:
        // запоминаем его для чипов «Недавние игроки».
        document.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || !target.closest) return;
            if (!target.closest('[data-act="startUnifiedRound"]')) return;
            try { rememberRecentPlayers(); } catch (e) { console.warn('[pv-ux] recent', e); }
        }, true);

        // Прокрутка «к содержимому» из skip-link: фокус, а не только скролл.
        var skip = document.querySelector('.pv-skip-link');
        if (skip) {
            skip.addEventListener('click', function (event) {
                var target = document.getElementById('pv-main');
                if (!target) return;
                event.preventDefault();
                target.scrollIntoView();
                if (typeof target.focus === 'function') target.focus({ preventScroll: true });
            });
        }
        // Язык переключился — перерисовываем только свою разметку.
        // Слушаем <html lang>: js/i18n.js выставляет атрибут в toggleLang(),
        // поэтому не нужно подменять чужие функции (и ломать их порядок).
        refreshOwnLabels();
        if (typeof MutationObserver === 'function' && document.documentElement) {
            try {
                new MutationObserver(refreshOwnLabels).observe(document.documentElement, {
                    attributes: true, attributeFilter: ['lang']
                });
            } catch (e) { console.warn('[pv-ux] i18n', e); }
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    // Публичный контракт для страниц и тестов.
    window.pvUx = {
        buildBottomNav: buildBottomNav,
        syncNetState: syncNetState,
        updateCta: updateCta,
        setupReady: setupReady
    };
})();
