/* ============================================================
   СТРАНИЦА СРАВНЕНИЯ ШАБЛОНОВ · js/design-preview.js
   ============================================================
   Показывает все 6 вариантов оформления (текущий + 5 новых):
     — целиком, на образце реальной разметки;
     — по блокам, чтобы видеть характерные отличия;
     — таблицей отличий;
     — в конструкторе, где дизайн собирается из шаблонов блоков.
   ============================================================ */
(function(global) {
    'use strict';

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /* ---------------------------------------------------------
       Образцы блоков — те же классы, что на боевых страницах
       --------------------------------------------------------- */
    function blockSample(key) {
        switch (key) {
            case 'nav':
                return '<nav class="nav"><div class="container nav-c">' +
                    '<a href="#" class="nav-brand" onclick="return false"><span class="nav-brand-text">Пестово</span></a>' +
                    '<div class="nav-menu">' +
                        '<a href="#" class="nav-link active" onclick="return false">Главная</a>' +
                        '<a href="#" class="nav-link" onclick="return false">Раунды</a>' +
                        '<a href="#" class="nav-link" onclick="return false">Статистика</a>' +
                    '</div><div class="nav-auth"><span class="nav-uname">Иван Петров</span></div>' +
                '</div></nav>' +
                '<div style="height:70px"></div>';

            case 'hero':
                return '<div class="hero"><div class="hero-content">' +
                    '<div class="hero-sub">Гольф-клуб Пестово</div>' +
                    '<h1 class="hero-title">Лайв-скоринг сезона 2026</h1>' +
                    '<p class="hero-desc">18 лунок · Пар 72 · Гандикап WHS</p>' +
                    '<div class="hero-btns"><a href="#" class="btn btn-g" onclick="return false">Начать раунд</a>' +
                    '<a href="#" class="btn btn-og" onclick="return false">Все раунды</a></div>' +
                '</div></div>';

            case 'page-head':
                return '<div class="page-head"><div class="container">' +
                    '<h1 class="page-title">Статистика сезона</h1>' +
                    '<p class="page-sub">Сыграно 248 раундов · 36 игроков</p>' +
                '</div></div>';

            case 'card':
                return '<div class="container" style="padding:18px;">' +
                    '<div class="card"><h2><i class="fas fa-flag"></i> Карточка раунда</h2>' +
                    '<h3>Заголовок внутри карточки</h3>' +
                    '<p style="color:var(--muted);font-size:13px;">Описание блока и поясняющий текст — так выглядит обычный контент карточки.</p>' +
                    '<div class="list-item" style="padding:10px 12px;margin-top:10px;">Элемент списка</div>' +
                    '</div></div>';

            case 'buttons':
                return '<div class="container" style="padding:18px;display:flex;gap:10px;flex-wrap:wrap;">' +
                    '<button type="button" class="btn btn-g">Основная</button>' +
                    '<button type="button" class="btn btn-og">Контурная</button>' +
                    '<button type="button" class="btn btn-ol">Светлая</button>' +
                    '<button type="button" class="btn btn-r">Опасная</button>' +
                    '<button type="button" class="btn btn-warning">Внимание</button>' +
                '</div>';

            case 'forms':
                return '<div class="container" style="padding:18px;">' +
                    '<div class="form-group"><label>Имя игрока</label><input class="form-input" value="Иван Петров" readonly></div>' +
                    '<div class="form-group"><label>Формат игры</label>' +
                    '<select class="form-input"><option>Stableford</option><option>Stroke play</option></select></div>' +
                    '<div class="form-group"><label>Дата</label><input class="form-input" type="date" value="2026-09-09" readonly></div>' +
                '</div>';

            case 'stats':
                return '<div class="container" style="padding:18px;"><div class="stats-grid">' +
                    '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">248</div><div class="stat-l">Раундов</div></div>' +
                    '<div class="stat"><i class="fas fa-trophy"></i><div class="stat-n">12.4</div><div class="stat-l">Средний счёт</div></div>' +
                    '<div class="stat"><i class="fas fa-users"></i><div class="stat-n">36</div><div class="stat-l">Игроков</div></div>' +
                '</div></div>';

            case 'table':
                return '<div class="container" style="padding:18px;">' +
                    '<table class="lb-table"><thead><tr><th>Игрок</th><th>HCP</th><th>Счёт</th><th>Статус</th></tr></thead><tbody>' +
                    '<tr><td>Иван Петров</td><td>12.4</td><td>−2</td><td><span class="tn-status tn-d">Завершён</span></td></tr>' +
                    '<tr><td>Ольга Морозова</td><td>18.1</td><td>+3</td><td><span class="tn-status tn-u">Играет</span></td></tr>' +
                    '<tr><td>Сергей Волков</td><td>7.8</td><td>+7</td><td><span class="tn-status tn-a">DQ</span></td></tr>' +
                    '</tbody></table>' +
                    '<div class="lwl-row" style="padding:10px 12px;margin-top:10px;">Строка списка · Pestovo · 18 лунок</div>' +
                '</div>';

            case 'badges':
                return '<div class="container" style="padding:18px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
                    '<span class="tn-status tn-d"><i class="fas fa-user-check"></i> Завершён</span>' +
                    '<span class="tn-status tn-u"><i class="fas fa-golf-ball-tee"></i> Лунка 7</span>' +
                    '<span class="tn-status tn-a"><i class="fas fa-triangle-exclamation"></i> DQ</span>' +
                    '<span class="live-badge"><span class="live-dot"></span> LIVE</span>' +
                    '<span class="hcp-chip">HCP 12.4</span>' +
                    '<span class="date-chip">09.09.2026</span>' +
                '</div>';

            case 'footer':
                return '<footer class="footer"><div class="container">' +
                    '<div class="footer-grid">' +
                        '<div><div class="footer-title">Пестово</div>' +
                        '<p class="footer-desc">Официальная система лайв-скоринга гольф-клуба.</p></div>' +
                        '<div><div class="footer-sub">Разделы</div>' +
                        '<a href="#" class="footer-link" onclick="return false">Все раунды</a>' +
                        '<a href="#" class="footer-link" onclick="return false">Статистика</a></div>' +
                        '<div><div class="footer-sub">Сервисы</div>' +
                        '<a href="#" class="footer-link" onclick="return false">Помощник</a></div>' +
                    '</div>' +
                    '<div class="footer-bottom">© 2024 Гольф-клуб Пестово</div>' +
                    '<p class="site-version">Версия сайта: <span class="version-number">—</span></p>' +
                '</div></footer>';

            case 'tabs':
                return '<div class="container" style="padding:18px;">' +
                    '<div class="admin-tabs">' +
                        '<button type="button" class="admin-tab active">Раунды</button>' +
                        '<button type="button" class="admin-tab">Турниры</button>' +
                        '<button type="button" class="admin-tab">Данные</button>' +
                    '</div>' +
                    '<div class="date-presets" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">' +
                        '<span class="date-chip">Сегодня</span><span class="date-chip">Неделя</span><span class="date-chip">Сезон</span>' +
                    '</div>' +
                '</div>';

            case 'live-card':
            default:
                return '<div class="container" style="padding:18px;">' +
                    '<div class="live-round-card" style="padding:14px;">' +
                        '<div class="round-hdr"><span class="round-course">Pestovo · 18 лунок</span>' +
                        '<span class="live-badge"><span class="live-dot"></span> LIVE</span></div>' +
                        '<div class="round-p-n">Иван Петров · HCP 12.4</div>' +
                        '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">' +
                            '<span class="tn-status tn-u">Лунка 7</span><span class="tn-status tn-d">−2</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="dsp-sample-holes" style="margin-top:12px;">' +
                        '<div class="dsp-sample-hole">1<b>4</b></div><div class="dsp-sample-hole">2<b>5</b></div>' +
                        '<div class="dsp-sample-hole">3<b>3</b></div><div class="dsp-sample-hole">4<b>4</b></div>' +
                        '<div class="dsp-sample-hole">5<b>4</b></div><div class="dsp-sample-hole">6<b>5</b></div>' +
                        '<div class="dsp-sample-hole">7<b>3</b></div><div class="dsp-sample-hole">8<b>4</b></div>' +
                        '<div class="dsp-sample-hole">9<b>4</b></div>' +
                    '</div>' +
                '</div>';
        }
    }

    /* ---------------------------------------------------------
       1. Все шаблоны целиком
       --------------------------------------------------------- */
    function renderGallery() {
        var host = document.getElementById('dsp-gal');
        var d = global.PestovoDesign;
        if (!host || !d) return;
        var sample = d.sampleHTML();
        host.innerHTML = d.PRESETS.map(function(p) {
            return '<div class="dsp-gallery-cell">' +
                '<div class="dsp-gallery-head"><h3>' + (p.id === '0' ? 'Текущий · ' : 'Шаблон ' + p.id + ' · ') + esc(p.name) + '</h3>' +
                '<p>' + esc(p.tagline) + '</p></div>' +
                '<div id="dsp-gal-' + p.id + '" style="max-height:520px;overflow:auto;"></div>' +
            '</div>';
        }).join('');
        d.PRESETS.forEach(function(p) {
            d.mountScope(document.getElementById('dsp-gal-' + p.id), p.id, { html: sample, pageKey: 'home' });
        });
    }

    /* ---------------------------------------------------------
       2. Сравнение по блокам
       --------------------------------------------------------- */
    function renderBlocks() {
        var host = document.getElementById('dsp-blocks');
        var d = global.PestovoDesign;
        if (!host || !d) return;
        var html = '';
        d.BLOCKS.forEach(function(b) {
            html += '<div class="card" style="margin-bottom:18px;">' +
                '<h2><i class="fas ' + b.icon + '"></i> ' + esc(b.label) + '</h2>' +
                '<p class="dsp-note" style="margin-bottom:12px;">' + esc(b.hint) + '</p>' +
                '<div class="dsp-gallery">' +
                    d.PRESETS.map(function(p) {
                        return '<div class="dsp-gallery-cell">' +
                            '<div class="dsp-gallery-head"><h3 style="font-size:12px;">' +
                            (p.id === '0' ? 'Текущий' : p.id + ' · ' + esc(p.short)) + '</h3></div>' +
                            '<div id="dsp-blk-' + b.key + '-' + p.id + '" style="max-height:320px;overflow:auto;"></div>' +
                        '</div>';
                    }).join('') +
                '</div></div>';
        });
        host.innerHTML = html;
        d.BLOCKS.forEach(function(b) {
            d.PRESETS.forEach(function(p) {
                var blocks = {};
                blocks[b.key] = p.id;
                d.mountScope(document.getElementById('dsp-blk-' + b.key + '-' + p.id), '0', {
                    html: blockSample(b.key),
                    blocks: blocks,
                    pageKey: 'home'
                });
            });
        });
    }

    /* ---------------------------------------------------------
       3. Матрица характерных отличий
       --------------------------------------------------------- */
    function renderMatrix() {
        var host = document.getElementById('dsp-matrix');
        var d = global.PestovoDesign;
        if (!host || !d) return;
        var rows = d.PRESETS.map(function(p) {
            var items = (p.diffs || []).map(function(x) { return '<li>' + x + '</li>'; }).join('');
            return '<tr><td><b>' + (p.id === '0' ? 'Текущий' : p.id) + '</b><br>' + esc(p.name) + '</td>' +
                '<td><ul class="dsp-diff">' + items + '</ul></td></tr>';
        }).join('');
        host.innerHTML = '<table><thead><tr><th style="width:220px;">Шаблон</th>' +
            '<th>Характерные отличия от предыдущего</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    /* ---------------------------------------------------------
       4. Конструктор: сборка дизайна из шаблонов блоков
       --------------------------------------------------------- */
    var builder = { base: '0', blocks: {} };

    function renderBuilder() {
        var ctrl = document.getElementById('dsp-builder-controls');
        var d = global.PestovoDesign;
        if (!ctrl || !d) return;

        var html = '<div class="dsp-row"><div><div class="dsp-row-t">Базовый шаблон страницы</div>' +
            '<div class="dsp-row-s">Фон, типографика и все блоки, для которых не выбран свой шаблон.</div></div>' +
            '<div class="dsp-picker dsp-compact">' +
                d.PRESETS.map(function(p) {
                    return '<button type="button" class="dsp-chip' + (builder.base === p.id ? ' active' : '') + '"' +
                        ' onclick="dspBuilderSetBase(\'' + p.id + '\')">' +
                        (p.id === '0' ? 'Текущий' : p.id + ' · ' + esc(p.short)) + '</button>';
                }).join('') +
            '</div></div>';

        d.BLOCKS.forEach(function(b) {
            var cur = builder.blocks[b.key] || '0';
            html += '<div class="dsp-row"><div><div class="dsp-row-t">' + esc(b.label) + '</div>' +
                '<div class="dsp-row-s">Сейчас: <b>' + esc(d.presetName(cur)) + '</b></div></div>' +
                '<div class="dsp-picker dsp-compact">' +
                    d.PRESETS.map(function(p) {
                        return '<button type="button" class="dsp-chip' + (cur === p.id ? ' active' : '') + '"' +
                            ' onclick="dspBuilderSetBlock(\'' + b.key + '\',\'' + p.id + '\')">' +
                            (p.id === '0' ? 'Текущий' : p.id + ' · ' + esc(p.short)) + '</button>';
                    }).join('') +
                '</div></div>';
        });

        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">' +
            '<button type="button" class="btn btn-og btn-sm" onclick="dspBuilderFill()">' +
            '<i class="fas fa-wand-magic-sparkles"></i> Собрать всё из базового шаблона</button>' +
            '<button type="button" class="btn btn-ol btn-sm" onclick="dspBuilderReset()">' +
            '<i class="fas fa-rotate-left"></i> Сбросить</button>' +
        '</div>';
        ctrl.innerHTML = html;

        var view = document.getElementById('dsp-builder-view');
        if (view) {
            global.PestovoDesign.mountScope(view, builder.base, {
                html: global.PestovoDesign.sampleHTML(),
                blocks: builder.blocks,
                pageKey: 'home'
            });
        }
        var label = document.getElementById('dsp-builder-label');
        if (label) {
            var parts = Object.keys(builder.blocks).map(function(k) {
                var b = null;
                d.BLOCKS.forEach(function(x) { if (x.key === k) b = x; });
                return (b ? b.label : k) + ' → ' + d.presetName(builder.blocks[k]);
            });
            label.textContent = 'База: ' + d.presetName(builder.base) +
                (parts.length ? ' · Сборка: ' + parts.join('; ') : ' · Сборка не задана');
        }
    }

    global.dspBuilderSetBase = function(id) {
        builder.base = global.PestovoDesign.normalizePreset(id);
        renderBuilder();
    };
    global.dspBuilderSetBlock = function(key, id) {
        var v = global.PestovoDesign.normalizePreset(id);
        if (v === '0') delete builder.blocks[key]; else builder.blocks[key] = v;
        renderBuilder();
    };
    global.dspBuilderFill = function() {
        var d = global.PestovoDesign;
        builder.blocks = {};
        if (builder.base !== '0') {
            d.BLOCKS.forEach(function(b) { builder.blocks[b.key] = builder.base; });
        }
        renderBuilder();
    };
    global.dspBuilderReset = function() {
        builder = { base: '0', blocks: {} };
        renderBuilder();
    };

    function init() {
        var d = global.PestovoDesign;
        if (!d) return;
        renderGallery();
        renderBlocks();
        renderMatrix();
        renderBuilder();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(typeof window !== 'undefined' ? window : this);
