/* ============================================================
   СИСТЕМА ШАБЛОНОВ ОФОРМЛЕНИЯ · js/design-system.js
   ============================================================
   Подключается в <head>, поэтому атрибуты шаблона ставятся ДО первой
   отрисовки — страница не «мигает» базовым дизайном.

   Что умеет:
     — 5 альтернативных шаблонов + «Текущий» (пресет 0) по умолчанию;
     — единый шаблон для всего сайта ИЛИ сборка из шаблонов:
       свой шаблон для каждой страницы и для каждого блока;
     — хранение выбора в Firebase settings/design (+ localStorage как
       офлайн-резерв), поэтому дизайн приходит всем игрокам;
     — рендер образца разметки для предпросмотра в админке.

   Файл полностью самостоятельный: не требует utils.js, Firebase и jQuery.
   ============================================================ */
(function(global) {
    'use strict';

    var STORAGE_KEY = 'pestovo_design_settings';
    var FIREBASE_PATH = 'settings/design';
    var PRESET_IDS = ['0', '1', '2', '3', '4', '5'];

    /* ---------------------------------------------------------
       РЕЕСТР ШАБЛОНОВ
       swatches — цвета для «пробника» в админке,
       diffs — характерные отличия от предыдущего шаблона.
       --------------------------------------------------------- */
    var DESIGN_PRESETS = [
        {
            id: '0',
            name: 'Текущий · Классика Пестово',
            short: 'Текущий',
            tagline: 'Штатный дизайн сайта — по умолчанию',
            swatches: ['#0b1a0e', '#132218', '#c9a84c', '#dde5df'],
            diffs: [
                'Тёмно-зелёное стекло с золотом — исходный вид сайта',
                'Ничего не переопределяется: работают правила css/style.css'
            ]
        },
        {
            id: '1',
            name: 'Модерн-минимал',
            short: 'Минимал',
            tagline: 'Светлая воздушная тема: белые карточки, тонкие линии, много воздуха',
            swatches: ['#f4f6f4', '#ffffff', '#1a472a', '#b8912f'],
            diffs: [
                '<b>Фон:</b> светлый #f4f6f4 вместо тёмно-зелёного',
                '<b>Карточки:</b> белые, без блюра, тонкая линия 1px и мягкая тень',
                '<b>Типографика:</b> Inter 800, заголовки без капса, трекинг −0.02em',
                '<b>Кнопки:</b> прямоугольные 6px, зелёная заливка без градиента',
                '<b>Таблицы:</b> зебра + разделители-«волоски», цифры табличные',
                '<b>Шапка/подвал:</b> белые, подвал светло-серый'
            ]
        },
        {
            id: '2',
            name: 'Неон-найт',
            short: 'Неон',
            tagline: 'Кибер-тема: неон-циан и маджента, свечение, сетка, острые углы',
            swatches: ['#05070f', '#0d1424', '#00e5ff', '#ff2fb3'],
            diffs: [
                '<b>Фон:</b> почти чёрный с сеткой 44px и розовым пятном',
                '<b>Карточки:</b> срезанный угол (clip-path) и неоновая кромка',
                '<b>Цифры:</b> моноширинный шрифт со свечением',
                '<b>Кнопки:</b> 2px радиус, капс, трекинг 0.12em, glow',
                '<b>Бейджи:</b> прямоугольные «терминальные» со свечением',
                '<b>Шапка:</b> бегущая неоновая линия циан→маджента'
            ]
        },
        {
            id: '3',
            name: 'Наследие клуба',
            short: 'Наследие',
            tagline: 'Клубная классика: сукно, латунь, серифные заголовки, двойные рамки',
            swatches: ['#0e1710', '#16241a', '#c9a84c', '#f2ecdb'],
            diffs: [
                '<b>Рамки:</b> двойные «паспарту» (inset-тени) и радиус 2px',
                '<b>Типографика:</b> Playfair Display, курсив в подзаголовках',
                '<b>Заголовок страницы:</b> орнамент ❖ по бокам',
                '<b>Главный экран:</b> золотая рамка-паспарту вокруг контента',
                '<b>Кнопки:</b> латунный градиент с внутренней фаской',
                '<b>Таблицы:</b> «гроссбух» — двойная линейка под шапкой'
            ]
        },
        {
            id: '4',
            name: 'Спорт-ТВ',
            short: 'Спорт-ТВ',
            tagline: 'Трансляция: графит, кислотный лайм, капс с наклоном, жёсткие тени',
            swatches: ['#0c0e11', '#191e26', '#c8ff2e', '#ff5a1f'],
            diffs: [
                '<b>Углы:</b> нулевые радиусы + «жёсткая» тень 6px 6px 0',
                '<b>Заголовки:</b> капс, наклон (italic), вес 900',
                '<b>Карточки:</b> акцентная полоса слева 5px (лайм → оранжевый)',
                '<b>Цифры:</b> 42px, наклон, табличные, трекинг −0.04em',
                '<b>Бейджи:</b> залитые «флажки» без радиусов',
                '<b>Подвал:</b> диагональный срез (clip-path)'
            ]
        },
        {
            id: '5',
            name: 'Аврора-стекло',
            short: 'Аврора',
            tagline: 'Стекло и сияние: полупрозрачные панели, блюр, большие радиусы',
            swatches: ['#0a1020', '#8b7cf6', '#3ddad7', '#f2f5ff'],
            diffs: [
                '<b>Фон:</b> три пятна «северного сияния» (фиолет/бирюза/роза)',
                '<b>Карточки:</b> rgba(255,255,255,.08) + blur(20px), радиус 22px',
                '<b>Шапка:</b> плавающая пилюля со стеклянным блюром',
                '<b>Заголовки:</b> градиентный текст (background-clip:text)',
                '<b>Кнопки:</b> пилюли с градиентом фиолет→бирюза',
                '<b>Бейджи:</b> стеклянные пилюли с блюром'
            ]
        }
    ];

    /* ---------------------------------------------------------
       СТРАНИЦЫ, для которых выбирается шаблон
       --------------------------------------------------------- */
    var DESIGN_PAGES = [
        { key: 'home', label: 'Главная', file: 'index.html', icon: 'fa-house' },
        { key: 'setup-round', label: 'Новый раунд', file: 'setup-round.html', icon: 'fa-flag-checkered' },
        { key: 'rounds', label: 'Все раунды', file: 'leaderboard.html', icon: 'fa-list-ol' },
        { key: 'players', label: 'Игроки', file: 'players.html', icon: 'fa-users' },
        { key: 'tournaments', label: 'Турниры', file: 'tournaments.html', icon: 'fa-trophy' },
        { key: 'stats', label: 'Статистика', file: 'stats.html', icon: 'fa-chart-column' },
        { key: 'order-of-merit', label: 'Зачёт сезона', file: 'order-of-merit.html', icon: 'fa-medal' },
        { key: 'handicap', label: 'Гандикапы', file: 'handicap.html', icon: 'fa-id-card' },
        { key: 'guide', label: 'Книга поля', file: 'guide.html', icon: 'fa-map-location-dot' },
        { key: 'feed', label: 'Лента событий', file: 'feed.html', icon: 'fa-rss' },
        { key: 'predictor', label: 'Симулятор WHS', file: 'predictor.html', icon: 'fa-calculator' },
        { key: 'assistant', label: 'Помощник', file: 'assistant.html', icon: 'fa-robot' },
        { key: 'admin', label: 'Админ-панель', file: 'admin.html', icon: 'fa-shield-halved' },
        { key: 'auth', label: 'Вход / регистрация', file: 'auth.html', icon: 'fa-right-to-bracket' },
        { key: 'scorer', label: 'Скоринг (счёт)', file: 'scorer.html', icon: 'fa-pen-to-square' },
        { key: 'marker', label: 'Маркер', file: 'marker.html', icon: 'fa-user-check' },
        { key: 'tv', label: 'ТВ-табло', file: 'tv.html', icon: 'fa-tv' },
        { key: 'offline', label: 'Офлайн-страница', file: 'offline.html', icon: 'fa-wifi' }
    ];

    /* ---------------------------------------------------------
       БЛОКИ, для которых выбирается шаблон
       --------------------------------------------------------- */
    var DESIGN_BLOCKS = [
        { key: 'nav', label: 'Шапка и навигация', icon: 'fa-bars', attr: 'data-dspb-nav',
          hint: 'Фон шапки, логотип, пункты меню, подсветка активного раздела, имя игрока.' },
        { key: 'hero', label: 'Главный экран (hero)', icon: 'fa-image', attr: 'data-dspb-hero',
          hint: 'Первый экран главной: фон, логотип, заголовок, подзаголовок, кнопки.' },
        { key: 'page-head', label: 'Заголовок страницы', icon: 'fa-heading', attr: 'data-dspb-page-head',
          hint: 'Плашка с названием страницы и подписью на внутренних страницах.' },
        { key: 'card', label: 'Карточки и панели', icon: 'fa-square', attr: 'data-dspb-card',
          hint: 'Все карточки: контент, списки, карточки раундов, режимы, авторизация.' },
        { key: 'buttons', label: 'Кнопки', icon: 'fa-hand-pointer', attr: 'data-dspb-buttons',
          hint: 'Основные, контурные и опасные кнопки: форма, заливка, тени, ховер.' },
        { key: 'forms', label: 'Формы и поля ввода', icon: 'fa-keyboard', attr: 'data-dspb-forms',
          hint: 'Поля, селекты, подписи, фокус и ошибки валидации.' },
        { key: 'stats', label: 'Цифры и статистика', icon: 'fa-chart-simple', attr: 'data-dspb-stats',
          hint: 'Плитки показателей, крупные числа, подписи метрик.' },
        { key: 'table', label: 'Таблицы и списки строк', icon: 'fa-table', attr: 'data-dspb-table',
          hint: 'Таблицы результатов, строки списков, зебра, шапки, ховер строки.' },
        { key: 'badges', label: 'Бейджи и статусы', icon: 'fa-tag', attr: 'data-dspb-badges',
          hint: 'Статусы раундов, LIVE-метка, чипы гандикапа, даты, пилюли.' },
        { key: 'footer', label: 'Подвал', icon: 'fa-window-minimize', attr: 'data-dspb-footer',
          hint: 'Нижний блок: колонки, ссылки, копирайт, номер версии сайта.' },
        { key: 'tabs', label: 'Вкладки и переключатели', icon: 'fa-folder-tree', attr: 'data-dspb-tabs',
          hint: 'Вкладки админки, панели фильтров, пресеты дат.' },
        { key: 'live-card', label: 'Карточка раунда', icon: 'fa-stopwatch', attr: 'data-dspb-live-card',
          hint: 'Карточки живых раундов и лент: заголовок, имена, счёт.' }
    ];

    /* ---------------------------------------------------------
       СОСТОЯНИЕ
       --------------------------------------------------------- */
    var FILE_TO_PAGE = {};
    DESIGN_PAGES.forEach(function(p) { FILE_TO_PAGE[p.file] = p.key; });
    FILE_TO_PAGE['design-preview.html'] = 'preview';
    FILE_TO_PAGE['hcp-badge-preview.html'] = 'preview';

    function normalizePreset(value) {
        value = String(value === undefined || value === null ? '' : value);
        return PRESET_IDS.indexOf(value) !== -1 ? value : '0';
    }

    function defaultSettings() {
        return { mode: 'single', global: '0', pages: {}, blocks: {} };
    }

    function normalizeSettings(raw) {
        var out = defaultSettings();
        if (!raw || typeof raw !== 'object') return out;
        out.mode = (raw.mode === 'mix') ? 'mix' : 'single';
        out.global = normalizePreset(raw.global);
        if (raw.pages && typeof raw.pages === 'object') {
            DESIGN_PAGES.forEach(function(p) {
                var v = normalizePreset(raw.pages[p.key]);
                if (v !== '0') out.pages[p.key] = v;
            });
        }
        if (raw.blocks && typeof raw.blocks === 'object') {
            DESIGN_BLOCKS.forEach(function(b) {
                var v = normalizePreset(raw.blocks[b.key]);
                if (v !== '0') out.blocks[b.key] = v;
            });
        }
        return out;
    }

    var settings = defaultSettings();
    try {
        settings = normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch (e) { settings = defaultSettings(); }

    function currentPageKey() {
        try {
            var path = window.location.pathname;
            var file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
            return FILE_TO_PAGE[file] || '';
        } catch (e) { return ''; }
    }

    // ?dsp=N — быстрый локальный предпросмотр шаблона (ничего не сохраняет)
    function urlPresetOverride() {
        try {
            var m = /[?&]dsp=([0-5])/.exec(window.location.search || '');
            return m ? m[1] : '';
        } catch (e) { return ''; }
    }

    function effectivePresetForPage() {
        var page = currentPageKey();
        var override = urlPresetOverride();
        if (override) return override;
        if (page && settings.pages[page]) return settings.pages[page];
        return settings.global;
    }

    /* ---------------------------------------------------------
       ПРИМЕНЕНИЕ АТРИБУТОВ
       scope — <html> на реальных страницах или .dsp-scope в предпросмотре.
       --------------------------------------------------------- */
    function applyToScope(scope, opts) {
        if (!scope || !scope.setAttribute) return;
        var o = opts || {};
        var pagePreset = normalizePreset(o.pagePreset === undefined ? settings.global : o.pagePreset);
        var blocks = o.blocks || settings.blocks;
        var mode = o.mode || settings.mode;
        var pageKey = o.pageKey === undefined ? currentPageKey() : o.pageKey;

        scope.setAttribute('data-dsp-mode', mode === 'mix' ? 'mix' : 'single');
        if (pageKey) scope.setAttribute('data-dsp-page', pageKey); else scope.removeAttribute('data-dsp-page');

        if (pagePreset === '0') {
            scope.removeAttribute('data-dsp');
        } else {
            scope.setAttribute('data-dsp', pagePreset);
        }

        // Шаблон блока определяется здесь, а не каскадом CSS: берём личный
        // шаблон блока, иначе — шаблон страницы/сайта. Так у каждого блока
        // всегда ровно одно подходящее правило, и сборка из разных шаблонов
        // работает предсказуемо независимо от порядка правил в файле.
        DESIGN_BLOCKS.forEach(function(b) {
            var own = normalizePreset(blocks[b.key]);
            var resolved = (own !== '0') ? own : pagePreset;
            if (resolved === '0') scope.removeAttribute(b.attr);
            else scope.setAttribute(b.attr, resolved);
        });
    }

    function applyDesignSystem() {
        var root = document.documentElement;
        applyToScope(root, {
            pagePreset: effectivePresetForPage(),
            blocks: settings.blocks,
            mode: settings.mode,
            pageKey: currentPageKey()
        });
        try {
            document.body.setAttribute('data-dsp-ready', '1');
        } catch (e) {}
    }

    function persistLocal() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {}
    }

    /* ---------------------------------------------------------
       ПУБЛИЧНОЕ API
       --------------------------------------------------------- */
    var api = {
        PRESET_IDS: PRESET_IDS,
        PRESETS: DESIGN_PRESETS,
        PAGES: DESIGN_PAGES,
        BLOCKS: DESIGN_BLOCKS,
        FIREBASE_PATH: FIREBASE_PATH,
        STORAGE_KEY: STORAGE_KEY,

        presetById: function(id) {
            id = String(id);
            for (var i = 0; i < DESIGN_PRESETS.length; i++) {
                if (DESIGN_PRESETS[i].id === id) return DESIGN_PRESETS[i];
            }
            return DESIGN_PRESETS[0];
        },
        presetName: function(id) { return api.presetById(id).name; },
        normalizePreset: normalizePreset,
        getSettings: function() {
            return JSON.parse(JSON.stringify(settings));
        },
        currentPageKey: currentPageKey,
        effectivePresetForPage: effectivePresetForPage,
        applyToScope: applyToScope,
        apply: applyDesignSystem,

        // Применяет настройки, пришедшие из Firebase (listener в utils.js)
        applySettings: function(raw, opts) {
            settings = normalizeSettings(raw);
            persistLocal();
            applyDesignSystem();
            if (!opts || !opts.silent) notifyRender();
            return api.getSettings();
        },

        setMode: function(mode) {
            settings.mode = (mode === 'mix') ? 'mix' : 'single';
            persistLocal();
            applyDesignSystem();
            notifyRender();
            return api.getSettings();
        },

        setGlobalPreset: function(id) {
            settings.global = normalizePreset(id);
            persistLocal();
            applyDesignSystem();
            notifyRender();
            return api.getSettings();
        },

        setPagePreset: function(pageKey, id) {
            var v = normalizePreset(id);
            if (v === '0') delete settings.pages[pageKey];
            else settings.pages[pageKey] = v;
            persistLocal();
            applyDesignSystem();
            notifyRender();
            return api.getSettings();
        },

        setBlockPreset: function(blockKey, id) {
            var v = normalizePreset(id);
            if (v === '0') delete settings.blocks[blockKey];
            else settings.blocks[blockKey] = v;
            persistLocal();
            applyDesignSystem();
            notifyRender();
            return api.getSettings();
        },

        // «Собрать всё из одного шаблона»: страницы и блоки = выбранный пресет
        applyPresetEverywhere: function(id) {
            var v = normalizePreset(id);
            settings.global = v;
            settings.pages = {};
            settings.blocks = {};
            if (v !== '0') {
                DESIGN_PAGES.forEach(function(p) { settings.pages[p.key] = v; });
                DESIGN_BLOCKS.forEach(function(b) { settings.blocks[b.key] = v; });
            }
            persistLocal();
            applyDesignSystem();
            notifyRender();
            return api.getSettings();
        },

        resetPages: function() {
            settings.pages = {};
            persistLocal(); applyDesignSystem(); notifyRender();
            return api.getSettings();
        },

        resetBlocks: function() {
            settings.blocks = {};
            persistLocal(); applyDesignSystem(); notifyRender();
            return api.getSettings();
        },

        resetAll: function() {
            settings = defaultSettings();
            persistLocal(); applyDesignSystem(); notifyRender();
            return api.getSettings();
        },

        // Предпросмотр в изолированной области (админка, страница сравнения)
        mountScope: function(el, presetId, opts) {
            if (!el) return el;
            el.classList.add('dsp-scope');
            var o = opts || {};
            applyToScope(el, {
                pagePreset: normalizePreset(presetId),
                blocks: o.blocks || {},
                mode: o.blocks ? 'mix' : 'single',
                pageKey: o.pageKey || 'home'
            });
            if (o.html !== undefined) el.innerHTML = o.html;
            return el;
        },

        sampleHTML: function() { return sampleHTML(); }
    };

    // Часть компонентов перерисовывается из данных: если страница открыта,
    // обновляем её сразу, чтобы смена шаблона была видна без перезагрузки.
    function notifyRender() {
        try {
            if (typeof global.loadPlayers === 'function' && document.getElementById('players-grid')) global.loadPlayers();
            if (typeof global.loadStats === 'function' && document.getElementById('general-stats')) global.loadStats();
            if (typeof global.loadLB === 'function' && document.getElementById('lb-container')) global.loadLB();
            if (typeof global.loadTournaments === 'function' && document.getElementById('tournaments-list')) global.loadTournaments();
        } catch (e) {}
        try {
            var ev = document.createEvent ? document.createEvent('Event') : null;
            if (ev) { ev.initEvent('pestovo:design-applied', true, false); document.dispatchEvent(ev); }
        } catch (e) {}
    }

    /* ---------------------------------------------------------
       ОБРАЗЕЦ РАЗМЕТКИ ДЛЯ ПРЕДПРОСМОТРА
       Используются реальные классы сайта, поэтому шаблон в предпросмотре
       выглядит ровно так же, как на настоящей странице.
       --------------------------------------------------------- */
    function sampleHTML() {
        return '' +
        '<nav class="nav"><div class="container nav-c">' +
            '<a href="#" class="nav-brand" onclick="return false"><span class="nav-brand-text">Пестово</span></a>' +
            '<div class="nav-menu">' +
                '<a href="#" class="nav-link active" onclick="return false">Главная</a>' +
                '<a href="#" class="nav-link" onclick="return false">Раунды</a>' +
                '<a href="#" class="nav-link" onclick="return false">Статистика</a>' +
            '</div>' +
            '<div class="nav-auth"><span class="nav-uname">Иван Петров</span></div>' +
        '</div></nav>' +

        '<div class="hero"><div class="hero-content">' +
            '<div class="hero-sub">Гольф-клуб Пестово</div>' +
            '<h1 class="hero-title">Лайв-скоринг сезона 2026</h1>' +
            '<p class="hero-desc">18 лунок · Пар 72 · Гандикап WHS</p>' +
            '<div class="hero-btns"><a href="#" class="btn btn-g" onclick="return false">Начать раунд</a>' +
            '<a href="#" class="btn btn-og" onclick="return false">Все раунды</a></div>' +
        '</div></div>' +

        '<div class="page-head"><div class="container">' +
            '<h1 class="page-title">Статистика сезона</h1>' +
            '<p class="page-sub">Сыграно 248 раундов · 36 игроков</p>' +
        '</div></div>' +

        '<main class="container" style="padding:22px 18px 30px;">' +
            '<div class="stats-grid" style="margin-bottom:18px;">' +
                '<div class="stat"><i class="fas fa-flag"></i><div class="stat-n">248</div><div class="stat-l">Раундов</div></div>' +
                '<div class="stat"><i class="fas fa-trophy"></i><div class="stat-n">12.4</div><div class="stat-l">Средний счёт</div></div>' +
                '<div class="stat"><i class="fas fa-users"></i><div class="stat-n">36</div><div class="stat-l">Игроков</div></div>' +
            '</div>' +

            '<div class="card"><h2><i class="fas fa-stopwatch"></i> Раунды сейчас</h2>' +
                '<div class="live-round-card" style="padding:14px;margin-bottom:12px;">' +
                    '<div class="round-hdr"><span class="round-course">Pestovo · 18 лунок</span>' +
                    '<span class="live-badge"><span class="live-dot"></span> LIVE</span></div>' +
                    '<div class="round-p-n">Иван Петров · HCP 12.4</div>' +
                    '<div style="margin-top:8px;"><span class="tn-status tn-u"><i class="fas fa-golf-ball-tee"></i> Лунка 7</span> ' +
                    '<span class="tn-status tn-d">−2</span> <span class="tn-status tn-a">Богey</span></div>' +
                '</div>' +
                '<table class="lb-table"><thead><tr><th>Игрок</th><th>Счёт</th><th>Статус</th></tr></thead>' +
                '<tbody>' +
                    '<tr><td>Иван Петров</td><td>−2</td><td><span class="tn-status tn-d">Завершён</span></td></tr>' +
                    '<tr><td>Ольга Морозова</td><td>+3</td><td><span class="tn-status tn-u">Играет</span></td></tr>' +
                    '<tr><td>Сергей Волков</td><td>+7</td><td><span class="tn-status tn-a">DQ</span></td></tr>' +
                '</tbody></table>' +
            '</div>' +

            '<div class="card"><h2><i class="fas fa-sliders"></i> Настройки раунда</h2>' +
                '<div class="form-group"><label>Имя игрока</label>' +
                '<input class="form-input" value="Иван Петров" readonly></div>' +
                '<div class="form-group"><label>Формат</label>' +
                '<select class="form-input"><option>Stableford</option><option>Stroke play</option></select></div>' +
                '<div class="admin-tabs" style="margin:10px 0;">' +
                    '<button type="button" class="admin-tab active">Раунды</button>' +
                    '<button type="button" class="admin-tab">Данные</button>' +
                '</div>' +
                '<div class="hero-btns" style="justify-content:flex-start;">' +
                    '<button type="button" class="btn btn-g">Сохранить</button>' +
                    '<button type="button" class="btn btn-og">Отмена</button>' +
                    '<button type="button" class="btn btn-danger">Удалить</button>' +
                '</div>' +
                '<div class="dsp-sample-holes" style="margin-top:14px;">' +
                    '<div class="dsp-sample-hole">1<b>4</b></div><div class="dsp-sample-hole">2<b>5</b></div>' +
                    '<div class="dsp-sample-hole">3<b>3</b></div><div class="dsp-sample-hole">4<b>4</b></div>' +
                    '<div class="dsp-sample-hole">5<b>4</b></div><div class="dsp-sample-hole">6<b>5</b></div>' +
                    '<div class="dsp-sample-hole">7<b>3</b></div><div class="dsp-sample-hole">8<b>4</b></div>' +
                    '<div class="dsp-sample-hole">9<b>4</b></div>' +
                '</div>' +
            '</div>' +
        '</main>' +

        '<footer class="footer"><div class="container">' +
            '<div class="footer-grid">' +
                '<div><div class="footer-title">Пестово</div>' +
                '<p class="footer-desc">Официальная система лайв-скоринга гольф-клуба.</p></div>' +
                '<div><div class="footer-sub">Разделы</div>' +
                '<a href="#" class="footer-link" onclick="return false">Все раунды</a>' +
                '<a href="#" class="footer-link" onclick="return false">Статистика</a></div>' +
                '<div><div class="footer-sub">Сервисы</div>' +
                '<a href="#" class="footer-link" onclick="return false">Помощник</a>' +
                '<a href="#" class="footer-link" onclick="return false">Книга поля</a></div>' +
            '</div>' +
            '<div class="footer-bottom">© 2024 Гольф-клуб Пестово</div>' +
            '<p class="site-version">Версия сайта: <span class="version-number">—</span></p>' +
        '</div></footer>';
    }

    global.DESIGN_PRESETS = DESIGN_PRESETS;
    global.DESIGN_PAGES = DESIGN_PAGES;
    global.DESIGN_BLOCKS = DESIGN_BLOCKS;
    global.PestovoDesign = api;

    // Мгновенное применение — до первой отрисовки страницы.
    applyDesignSystem();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyDesignSystem);
    }
})(typeof window !== 'undefined' ? window : this);
