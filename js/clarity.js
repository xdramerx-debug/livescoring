// Behaviour for static interface controls. Structure belongs to HTML/page renderers.
(function () {
    'use strict';
    function en() { return document.documentElement.lang === 'en'; }
    function labels() {
        document.querySelectorAll('[data-clarity-ru]').forEach(function (node) {
            node.textContent = en() ? node.dataset.clarityEn : node.dataset.clarityRu;
        });
        document.querySelectorAll('[data-password-toggle]').forEach(function (button) {
            var input = document.getElementById(button.dataset.passwordToggle);
            var shown = input && input.type === 'text';
            button.textContent = en() ? (shown ? 'Hide password' : 'Show password') : (shown ? 'Скрыть пароль' : 'Показать пароль');
            button.setAttribute('aria-pressed', String(!!shown));
        });
    }
    function boot() {
        if (document.documentElement.dataset.clarityReady) return;
        document.documentElement.dataset.clarityReady = 'true';
        document.querySelectorAll('.clarity-nav-more').forEach(function (more) {
            document.addEventListener('click', function (event) { if (!more.contains(event.target)) more.open = false; });
            document.addEventListener('keydown', function (event) {
                if (event.key === 'Escape' && more.open) { more.open = false; more.querySelector('summary').focus(); }
            });
        });
        var guest = document.querySelector('.auth-guest a');
        if (guest && typeof window.getSafeAuthRedirect === 'function') guest.href = window.getSafeAuthRedirect();
        document.querySelectorAll('[data-password-toggle]').forEach(function (button) {
            button.addEventListener('click', function () {
                var input = document.getElementById(button.dataset.passwordToggle);
                if (input) input.type = input.type === 'password' ? 'text' : 'password';
                labels();
            });
        });
        var method = 'pad';
        try { method = localStorage.getItem('pestovo_score_input') === 'stepper' ? 'stepper' : 'pad'; } catch (e) { /* private browsing */ }
        function applyMethod(value) {
            document.body.dataset.scoreInput = value;
            document.querySelectorAll('[data-score-input-method]').forEach(function (select) { select.value = value; });
        }
        applyMethod(method);
        document.querySelectorAll('[data-score-input-method]').forEach(function (select) {
            select.addEventListener('change', function () {
                var value = select.value === 'stepper' ? 'stepper' : 'pad';
                applyMethod(value);
                try { localStorage.setItem('pestovo_score_input', value); } catch (e) { /* private browsing */ }
            });
        });
        // Preference disclosures survive reload; score and verification panels are not affected.
        document.querySelectorAll('details.clarity-disclosure').forEach(function (details, index) {
            if (details.id === 'hcp-table-disclosure') return;
            var key = 'pestovo_disclosure:' + location.pathname + ':' + (details.id || index);
            try { details.open = localStorage.getItem(key) === '1'; } catch (e) { /* optional preference */ }
            details.addEventListener('toggle', function () {
                try { localStorage.setItem(key, details.open ? '1' : '0'); } catch (e) { /* optional preference */ }
            });
        });
        labels();
        new MutationObserver(labels).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
}());
