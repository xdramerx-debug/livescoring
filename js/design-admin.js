/* ============================================================
   ВКЛАДКА «ДИЗАЙН 🎨» В АДМИН-ПАНЕЛИ · js/design-admin.js
   ============================================================
   Логика интерфейса выбора шаблонов: единый шаблон для сайта
   или сборка дизайна из шаблонов страниц и блоков.

   Выбор хранится в Firebase settings/design и приходит всем игрокам
   через listener в js/utils.js.
   ============================================================ */
(function(global) {
    'use strict';

    var D = function() { return global.PestovoDesign; };

    /* ---------------------------------------------------------
       Доступ к базе.
       Раньше здесь стояла только проверка global.db. Но db объявлена в
       js/firebase-config.js, и если её объявить через const/let, свойство
       window.db не создаётся — модуль решал, что базы нет, и «сохранял»
       оформление только в localStorage. Поэтому базу ищем несколькими
       способами, а не полагаемся на единственный глобальный алиас.
       --------------------------------------------------------- */
    function getDb() {
        try { if (global.db && typeof global.db.ref === 'function') return global.db; } catch (e) {}
        try {
            // eslint-disable-next-line no-undef
            if (typeof db !== 'undefined' && db && typeof db.ref === 'function') return db;
        } catch (e) {}
        try {
            if (global.firebase && typeof global.firebase.database === 'function') {
                var inst = global.firebase.database();
                if (inst && typeof inst.ref === 'function') return inst;
            }
        } catch (e) {}
        return null;
    }

    // Админ поменял шаблон, но ещё не нажал «Сохранить». Пока правки не
    // сохранены, слушатель/повторное открытие вкладки не должны их затирать.
    var dirty = false;

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function L(ru, en) {
        return (typeof global.currentLang !== 'undefined' && global.currentLang === 'en') ? en : ru;
    }

    function toastMsg(text, type) {
        if (typeof global.toast === 'function') global.toast(text, type || 'info');
    }

    function vibrate(ms) {
        if (typeof global.vib === 'function') { try { global.vib(ms); } catch (e) {} }
    }

    /* ---------------------------------------------------------
       Кнопка выбора шаблона
       --------------------------------------------------------- */
    function presetChip(preset, active, onclick, compact) {
        var label = compact
            ? (preset.id === '0' ? L('Текущий', 'Current') : preset.id + ' · ' + esc(preset.short))
            : esc(preset.name);
        return '<button type="button" class="' + (compact ? 'dsp-chip' : 'dsp-opt') + (active ? ' active' : '') + '"' +
            ' onclick="' + onclick + '" aria-pressed="' + (active ? 'true' : 'false') + '"' +
            ' title="' + esc(preset.tagline) + '">' +
            (compact ? '' : swatchHTML(preset)) +
            '<span>' +
                '<span class="dsp-opt-n">' + label + '</span>' +
                (compact ? '' : '<span class="dsp-opt-d">' + esc(preset.tagline) + '</span>') +
            '</span>' +
        '</button>';
    }

    function swatchHTML(preset) {
        var cells = (preset.swatches || []).map(function(c) {
            return '<i style="background:' + c + '"></i>';
        }).join('');
        return '<span class="dsp-swatch">' + cells + '</span>';
    }

    /* ---------------------------------------------------------
       Отрисовка вкладки
       --------------------------------------------------------- */
    function renderAll() {
        var d = D();
        if (!d) return;
        var s = d.getSettings();

        renderMode(s);
        renderGlobal(s);
        renderPages(s);
        renderBlocks(s);
        renderPreview(s);
        renderStatus(s);
    }

    function renderMode(s) {
        var el = document.getElementById('dsp-mode-wrap');
        if (!el) return;
        el.innerHTML =
            '<div class="dsp-mode-toggle">' +
                '<button type="button" class="dsp-mode-btn' + (s.mode === 'single' ? ' active' : '') + '"' +
                ' onclick="dspAdminSetMode(\'single\')"><i class="fas fa-layer-group"></i> ' +
                L('Единый шаблон для всего сайта', 'One template for the whole site') + '</button>' +
                '<button type="button" class="dsp-mode-btn' + (s.mode === 'mix' ? ' active' : '') + '"' +
                ' onclick="dspAdminSetMode(\'mix\')"><i class="fas fa-puzzle-piece"></i> ' +
                L('Сборка из шаблонов (микс)', 'Mix templates per page and block') + '</button>' +
            '</div>' +
            '<p class="dsp-note" style="margin-top:10px;">' +
                (s.mode === 'mix'
                    ? L('Режим сборки: каждая страница и каждый блок берут свой шаблон. Пустое значение — «как в базовом шаблоне».',
                        'Mix mode: every page and block takes its own template. Empty value — "same as the base template".')
                    : L('Единый режим: весь сайт оформлен одним шаблоном. Точечные настройки страниц и блоков игнорируются.',
                        'Single mode: the whole site uses one template. Per-page and per-block choices are ignored.')) +
            '</p>';
    }

    function renderGlobal(s) {
        var el = document.getElementById('dsp-global-wrap');
        if (!el) return;
        var d = D();
        var html = '<div class="dsp-picker">';
        d.PRESETS.forEach(function(p) {
            html += presetChip(p, s.global === p.id, "dspAdminSetGlobal('" + p.id + "')", false);
        });
        html += '</div>';
        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">' +
            '<button type="button" class="btn btn-og btn-sm" onclick="dspAdminApplyEverywhere()">' +
                '<i class="fas fa-wand-magic-sparkles"></i> ' + L('Применить выбранный шаблон ко всем страницам и блокам', 'Apply the chosen template to every page and block') + '</button>' +
            '<a class="btn btn-ol btn-sm" href="design-preview.html" target="_blank" rel="noopener">' +
                '<i class="fas fa-table-columns"></i> ' + L('Сравнить все шаблоны', 'Compare all templates') + '</a>' +
        '</div>';
        el.innerHTML = html;
    }

    function renderPages(s) {
        var el = document.getElementById('dsp-pages-wrap');
        if (!el) return;
        var d = D();
        var disabled = s.mode === 'single';
        var html = '';
        d.PAGES.forEach(function(p) {
            var cur = s.pages[p.key] || '0';
            html += '<div class="dsp-row"' + (disabled ? ' style="opacity:.5;"' : '') + '>' +
                '<div><div class="dsp-row-t"><i class="fas ' + p.icon + '"></i> ' + esc(p.label) +
                ' <span style="color:var(--muted);font-weight:500;font-size:11px;">' + esc(p.file) + '</span></div>' +
                '<div class="dsp-row-s">' + L('Сейчас: ', 'Now: ') + '<b>' + esc(d.presetName(cur)) + '</b></div></div>' +
                '<div class="dsp-picker dsp-compact">' +
                    d.PRESETS.map(function(pr) {
                        return presetChip(pr, cur === pr.id, "dspAdminSetPage('" + p.key + "','" + pr.id + "')", true);
                    }).join('') +
                '</div>' +
            '</div>';
        });
        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">' +
            '<button type="button" class="btn btn-ol btn-sm" onclick="dspAdminResetPages()">' +
                '<i class="fas fa-rotate-left"></i> ' + L('Сбросить страницы', 'Reset pages') + '</button>' +
        '</div>';
        el.innerHTML = html;
    }

    function renderBlocks(s) {
        var el = document.getElementById('dsp-blocks-wrap');
        if (!el) return;
        var d = D();
        var disabled = s.mode === 'single';
        var html = '';
        d.BLOCKS.forEach(function(b) {
            var cur = s.blocks[b.key] || '0';
            html += '<div class="dsp-row"' + (disabled ? ' style="opacity:.5;"' : '') + '>' +
                '<div><div class="dsp-row-t"><i class="fas ' + b.icon + '"></i> ' + esc(b.label) + '</div>' +
                '<div class="dsp-row-s">' + esc(b.hint) + '<br>' + L('Сейчас: ', 'Now: ') +
                '<b>' + esc(d.presetName(cur)) + '</b></div></div>' +
                '<div class="dsp-picker dsp-compact">' +
                    d.PRESETS.map(function(pr) {
                        return presetChip(pr, cur === pr.id, "dspAdminSetBlock('" + b.key + "','" + pr.id + "')", true);
                    }).join('') +
                '</div>' +
            '</div>';
        });
        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">' +
            '<button type="button" class="btn btn-ol btn-sm" onclick="dspAdminResetBlocks()">' +
                '<i class="fas fa-rotate-left"></i> ' + L('Сбросить блоки', 'Reset blocks') + '</button>' +
        '</div>';
        el.innerHTML = html;
    }

    function renderStatus(s) {
        var el = document.getElementById('dsp-status');
        if (!el) return;
        var d = D();
        var pageCount = Object.keys(s.pages || {}).length;
        var blockCount = Object.keys(s.blocks || {}).length;
        el.innerHTML = '<i class="fas fa-circle-info"></i> ' +
            L('Базовый шаблон: ', 'Base template: ') + '<b>' + esc(d.presetName(s.global)) + '</b> · ' +
            L('режим: ', 'mode: ') + '<b>' + (s.mode === 'mix' ? L('сборка', 'mix') : L('единый', 'single')) + '</b> · ' +
            L('своих шаблонов у страниц: ', 'pages with own template: ') + '<b>' + pageCount + '</b> · ' +
            L('у блоков: ', 'blocks: ') + '<b>' + blockCount + '</b>';
    }

    /* ---------------------------------------------------------
       Живой предпросмотр: базовый шаблон + все 5 альтернатив
       --------------------------------------------------------- */
    function renderPreview(s) {
        var wrap = document.getElementById('dsp-preview-wrap');
        if (!wrap) return;
        var d = D();
        var sample = d.sampleHTML();

        // Первый предпросмотр — «как сейчас на сайте» (с учётом сборки).
        var blocks = s.mode === 'mix' ? s.blocks : {};
        var cells = [{
            id: 'current',
            title: L('Как сейчас на сайте', 'Current site look'),
            sub: esc(d.presetName(s.global)) + (s.mode === 'mix' ? ' + ' + L('сборка', 'mix') : ''),
            preset: s.global,
            blocks: blocks
        }];
        d.PRESETS.forEach(function(p) {
            cells.push({ id: 'p' + p.id, title: p.id + ' · ' + esc(p.name), sub: esc(p.tagline), preset: p.id, blocks: {} });
        });

        wrap.innerHTML = cells.map(function(c) {
            return '<div class="dsp-preview-cell">' +
                '<div class="dsp-preview-head"><b>' + c.title + '</b><span>' + c.sub + '</span></div>' +
                '<div class="dsp-preview-body" id="dsp-preview-' + c.id + '" style="max-height:430px;overflow:auto;"></div>' +
            '</div>';
        }).join('');

        cells.forEach(function(c) {
            var host = document.getElementById('dsp-preview-' + c.id);
            if (!host) return;
            d.mountScope(host, c.preset, { html: sample, blocks: c.blocks, pageKey: 'home' });
        });
    }

    /* ---------------------------------------------------------
       Действия администратора
       --------------------------------------------------------- */
    function setMode(mode) {
        var d = D(); if (!d) return;
        vibrate(20);
        dirty = true;
        d.setMode(mode);
        renderAll();
    }

    function setGlobal(id) {
        var d = D(); if (!d) return;
        vibrate(20);
        dirty = true;
        d.setGlobalPreset(id);
        renderAll();
    }

    function setPage(pageKey, id) {
        var d = D(); if (!d) return;
        vibrate(15);
        dirty = true;
        d.setPagePreset(pageKey, id);
        renderAll();
    }

    function setBlock(blockKey, id) {
        var d = D(); if (!d) return;
        vibrate(15);
        dirty = true;
        d.setBlockPreset(blockKey, id);
        renderAll();
    }

    function applyEverywhere() {
        var d = D(); if (!d) return;
        var s = d.getSettings();
        vibrate(30);
        dirty = true;
        d.applyPresetEverywhere(s.global);
        renderAll();
        toastMsg(L('Шаблон «' + d.presetName(s.global) + '» назначен всем страницам и блокам',
            'Template "' + d.presetName(s.global) + '" assigned to every page and block'), 'success');
    }

    function resetPages() {
        var d = D(); if (!d) return;
        dirty = true;
        d.resetPages(); renderAll();
        toastMsg(L('Страницы вернулись к базовому шаблону', 'Pages follow the base template again'), 'info');
    }

    function resetBlocks() {
        var d = D(); if (!d) return;
        dirty = true;
        d.resetBlocks(); renderAll();
        toastMsg(L('Блоки вернулись к базовому шаблону', 'Blocks follow the base template again'), 'info');
    }

    function resetAll() {
        var d = D(); if (!d) return;
        vibrate(30);
        dirty = true;
        d.resetAll(); renderAll();
        toastMsg(L('Включён текущий дизайн сайта по умолчанию', 'Default site design restored'), 'info');
    }

    /* ---------------------------------------------------------
       Сохранение в Firebase
       --------------------------------------------------------- */
    function save() {
        var d = D(); if (!d) return;
        var s = d.getSettings();
        var payload = {
            mode: s.mode,
            global: s.global,
            pages: s.pages || {},
            blocks: s.blocks || {},
            updatedAt: Date.now()
        };
        if (typeof global.currentUser !== 'undefined' && global.currentUser && global.currentUser.uid) {
            payload.updatedBy = global.currentUser.uid;
        }
        var database = getDb();
        if (!database) {
            toastMsg(L('Оформление сохранено локально (нет подключения к базе)', 'Design saved locally (no database connection)'), 'info');
            return;
        }
        database.ref(d.FIREBASE_PATH).set(payload).then(function() {
            // Сохранилось у всех — локальные правки больше не «несохранённые».
            dirty = false;
            toastMsg(L('✅ Оформление сохранено для всех пользователей', '✅ Design saved for all users'), 'success');
        }).catch(function(err) {
            console.warn('[Design] save error', err);
            // Показываем настоящую причину (например, отказ по правилам доступа),
            // иначе админ видит «сохранено» и не понимает, почему дизайн не применился.
            var reason = (err && (err.message || err.code)) ? ' (' + (err.message || err.code) + ')' : '';
            toastMsg(L('⚠️ Не удалось сохранить оформление' + reason,
                '⚠️ Could not save the design' + reason), 'error');
        });
    }

    /* ---------------------------------------------------------
       Загрузка сохранённых настроек при открытии вкладки
       --------------------------------------------------------- */
    function loadFromFirebase() {
        var d = D(); if (!d) return;
        var database = getDb();
        if (!database) { renderAll(); return; }
        database.ref(d.FIREBASE_PATH).once('value').then(function(sn) {
            var val = sn.val();
            // Если админ уже что-то выбрал, но не нажал «Сохранить», повторное
            // открытие вкладки не должно откатывать его выбор к тому, что в базе.
            if (val && !dirty) d.applySettings(val, { silent: true });
            renderAll();
        }).catch(function() { renderAll(); });
    }

    global.dspAdminRender = renderAll;
    global.dspAdminLoad = loadFromFirebase;
    global.dspAdminSetMode = setMode;
    global.dspAdminSetGlobal = setGlobal;
    global.dspAdminSetPage = setPage;
    global.dspAdminSetBlock = setBlock;
    global.dspAdminApplyEverywhere = applyEverywhere;
    global.dspAdminResetPages = resetPages;
    global.dspAdminResetBlocks = resetBlocks;
    global.dspAdminResetAll = resetAll;
    global.dspAdminSave = save;
})(typeof window !== 'undefined' ? window : this);
