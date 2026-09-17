// ============================================================
// ТУРНИРНЫЙ ДВИЖОК (чистая доменная логика, без DOM и Firebase)
// ------------------------------------------------------------
// Слой сервисов для «Новой версии создания турнира»:
//   TN_CONFIG              — справочники (типы, форматы, ти-боксы,
//                            системы подсчёта, тай-брейки, номинации…)
//   HandicapService        — WHS: Course/Playing Handicap, allowance, cap
//   ScoringService         — стратегии подсчёта (Stroke/Gross/Net,
//                            Stableford, Modified Stableford, Match Play,
//                            Skins, Best Ball, Scramble)
//   TieBreakService        — countback 9/6/3/1, последняя лунка,
//                            stroke index, sudden death
//   PairingService         — флайты, группы, tee times / shotgun /
//                            two-tee, re-pairing по лидерборду
//   CutService             — отсечка (top-N + ties)
//   LeaderboardService     — сборка лидерборда (позиции, thru, today,
//                            gross/net/очки, проекция)
//   Exporters              — CSV / JSON / печатные HTML-шаблоны
//                            (scorecard, tee times, лидерборд)
//
// Модуль расширяем: новая система подсчёта = новая запись в
// ScoringService.STRATEGIES (+ словарь TN_CONFIG.scoringSystems),
// новый тай-брейк = новая запись в TieBreakService.METHODS.
//
// Файл НЕ зависит от браузера: работает и на странице (window.TnEngine /
// window.TN_CONFIG), и в Node (module.exports) для автотестов.
// ============================================================
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.TnEngine = api.TnEngine;
        root.TN_CONFIG = api.TN_CONFIG;
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ========================================================
    // СПРАВОЧНИКИ (всё редактируемое и двуязычное — здесь,
    // без хардкода в UI и сервисах)
    // ========================================================
    var TN_CONFIG = {

        // Типы турниров (шаг 1)
        tournamentTypes: [
            { id: 'stroke',            nameRu: 'Stroke Play',               nameEn: 'Stroke Play' },
            { id: 'match',             nameRu: 'Match Play',                nameEn: 'Match Play' },
            { id: 'stableford',        nameRu: 'Stableford',                nameEn: 'Stableford' },
            { id: 'modified-stableford', nameRu: 'Modified Stableford',     nameEn: 'Modified Stableford' },
            { id: 'scramble',          nameRu: 'Scramble (Texas/Florida)',  nameEn: 'Scramble (Texas/Florida)' },
            { id: 'best-ball',         nameRu: 'Best Ball',                 nameEn: 'Best Ball' },
            { id: 'four-ball',         nameRu: 'Four-ball',                 nameEn: 'Four-ball' },
            { id: 'foursomes',         nameRu: 'Foursomes',                 nameEn: 'Foursomes' },
            { id: 'skins',             nameRu: 'Skins',                     nameEn: 'Skins' },
            { id: 'bogey-par',         nameRu: 'Bogey / Par',               nameEn: 'Bogey / Par' },
            { id: 'combined',          nameRu: 'Комбинированный',           nameEn: 'Combined' }
        ],

        // Категории участников (шаг 1)
        categories: [
            { id: 'pro',       nameRu: 'Профессиональный', nameEn: 'Professional' },
            { id: 'amateur',   nameRu: 'Любительский',     nameEn: 'Amateur' },
            { id: 'junior',    nameRu: 'Юношеский',        nameEn: 'Junior' },
            { id: 'senior',    nameRu: 'Ветеранский',      nameEn: 'Senior' },
            { id: 'ladies',    nameRu: 'Женский',          nameEn: 'Ladies' },
            { id: 'mixed',     nameRu: 'Смешанный',        nameEn: 'Mixed' },
            { id: 'corporate', nameRu: 'Корпоративный',    nameEn: 'Corporate' }
        ],

        // Уровни турнира (шаг 1)
        levels: [
            { id: 'club',        nameRu: 'Клубный',                    nameEn: 'Club' },
            { id: 'regional',    nameRu: 'Региональный',               nameEn: 'Regional' },
            { id: 'national',    nameRu: 'Национальный',               nameEn: 'National' },
            { id: 'international', nameRu: 'Международный',            nameEn: 'International' },
            { id: 'qualifier',   nameRu: 'Квалификационный (WAGR/EGA/R&A)', nameEn: 'Qualifier (WAGR/EGA/R&A)' }
        ],

        // Ти-боксы (единый список для поля и турнира)
        teeBoxes: [
            { id: 'bk', nameRu: 'Чёрные',  nameEn: 'Black',  color: '#1c1c1c' },
            { id: 'bl', nameRu: 'Синие',   nameEn: 'Blue',   color: '#2f6fde' },
            { id: 'wh', nameRu: 'Белые',   nameEn: 'White',  color: '#e8e8e8' },
            { id: 'ye', nameRu: 'Жёлтые',  nameEn: 'Yellow', color: '#e9c83c' },
            { id: 'rd', nameRu: 'Красные', nameEn: 'Red',    color: '#d64545' }
        ],

        // Способы старта раунда (шаг 2/5)
        startTypes: [
            { id: 'shotgun',   nameRu: 'Shotgun start',   nameEn: 'Shotgun start' },
            { id: 'tee-times', nameRu: 'Tee times',       nameEn: 'Tee times' },
            { id: 'two-tee',   nameRu: 'Two-tee start',   nameEn: 'Two-tee start' }
        ],

        // Системы подсчёта (шаг 3) → ключи ScoringService.STRATEGIES
        scoringSystems: [
            { id: 'stroke-gross',        nameRu: 'Stroke Play · Gross',     nameEn: 'Stroke Play · Gross' },
            { id: 'stroke-net',          nameRu: 'Stroke Play · Net',       nameEn: 'Stroke Play · Net' },
            { id: 'stableford',          nameRu: 'Stableford',              nameEn: 'Stableford' },
            { id: 'modified-stableford', nameRu: 'Modified Stableford',     nameEn: 'Modified Stableford' },
            { id: 'match-play',          nameRu: 'Match Play',              nameEn: 'Match Play' },
            { id: 'skins',               nameRu: 'Skins (carry-over)',      nameEn: 'Skins (carry-over)' },
            { id: 'best-ball',           nameRu: 'Best Ball',               nameEn: 'Best Ball' },
            { id: 'scramble',            nameRu: 'Scramble',                nameEn: 'Scramble' }
        ],

        // Системы гандикапа (шаг 3)
        handicapSystems: [
            { id: 'whs',    nameRu: 'WHS (World Handicap System)', nameEn: 'WHS (World Handicap System)' },
            { id: 'ega',    nameRu: 'EGA',                         nameEn: 'EGA' },
            { id: 'usga',   nameRu: 'USGA (legacy)',               nameEn: 'USGA (legacy)' },
            { id: 'custom', nameRu: 'Кастомная формула',           nameEn: 'Custom formula' }
        ],

        // Allowance по умолчанию (подсказки, поле ввода свободное)
        allowancePresets: [100, 95, 85, 75],

        // Тай-брейки (порядок задаётся drag&drop/кнопками)
        tieBreaks: [
            { id: 'countback',    nameRu: 'Countback (9/6/3/1)',            nameEn: 'Countback (9/6/3/1)' },
            { id: 'last-hole',    nameRu: 'По последней лунке',             nameEn: 'Last hole' },
            { id: 'stroke-index', nameRu: 'По stroke index',                nameEn: 'By stroke index' },
            { id: 'sudden-death', nameRu: 'Sudden death (плей-офф)',        nameEn: 'Sudden death (play-off)' }
        ],

        // Максимальный счёт на лунке
        maxScoreModes: [
            { id: 'netdb', nameRu: 'Net Double Bogey (WHS)', nameEn: 'Net Double Bogey (WHS)' },
            { id: 'esc',   nameRu: 'ESC (Equitable Stroke)', nameEn: 'ESC (Equitable Stroke Control)' },
            { id: 'none',  nameRu: 'Без ограничения',        nameEn: 'No limit' }
        ],

        // Способы регистрации участников (шаг 4)
        registrationMethods: [
            { id: 'public-form', nameRu: 'Публичная форма',      nameEn: 'Public form' },
            { id: 'import',      nameRu: 'Импорт CSV/Excel/JSON', nameEn: 'CSV/Excel/JSON import' },
            { id: 'manual',      nameRu: 'Ручное добавление',    nameEn: 'Manual entry' },
            { id: 'invitations', nameRu: 'Приглашения',          nameEn: 'Invitations' }
        ],

        // Каталог полей заявки (конструктор, шаг 4)
        formFieldCatalog: [
            { id: 'fullName',  nameRu: 'ФИО',                  nameEn: 'Full name',        locked: true },
            { id: 'gender',    nameRu: 'Пол',                  nameEn: 'Gender' },
            { id: 'birthDate', nameRu: 'Дата рождения',        nameEn: 'Date of birth' },
            { id: 'club',      nameRu: 'Клуб',                 nameEn: 'Club' },
            { id: 'country',   nameRu: 'Страна',               nameEn: 'Country' },
            { id: 'handicap',  nameRu: 'Индекс гандикапа',     nameEn: 'Handicap index' },
            { id: 'phone',     nameRu: 'Телефон',              nameEn: 'Phone' },
            { id: 'email',     nameRu: 'Email',                nameEn: 'Email' },
            { id: 'telegram',  nameRu: 'Telegram',             nameEn: 'Telegram' },
            { id: 'tshirt',    nameRu: 'Размер футболки',      nameEn: 'T-shirt size' },
            { id: 'cart',      nameRu: 'Нужна карта (cart)',   nameEn: 'Cart needed' },
            { id: 'dinner',    nameRu: 'Ужин/банкет',          nameEn: 'Dinner/banquet' }
        ],

        // Критерии авто-формирования флайтов (шаг 5)
        flightCriteria: [
            { id: 'handicap', nameRu: 'По гандикапу',  nameEn: 'By handicap' },
            { id: 'rating',   nameRu: 'По рейтингу',   nameEn: 'By rating' },
            { id: 'age',      nameRu: 'По возрасту',   nameEn: 'By age' },
            { id: 'gender',   nameRu: 'По полу',       nameEn: 'By gender' },
            { id: 'random',   nameRu: 'Случайно',      nameEn: 'Random' }
        ],

        // Роли судейской команды (шаг 6)
        officialRoles: [
            { id: 'director', nameRu: 'Директор турнира',   nameEn: 'Tournament Director' },
            { id: 'referee',  nameRu: 'Рефери',             nameEn: 'Referee' },
            { id: 'marshal',  nameRu: 'Маршал',             nameEn: 'Marshal' },
            { id: 'scorer',   nameRu: 'Счётчик',            nameEn: 'Scorer' }
        ],

        // Номинации (шаг 7)
        nominations: [
            { id: 'best-gross',     nameRu: 'Best Gross',            nameEn: 'Best Gross',        needsHoles: false },
            { id: 'best-net',       nameRu: 'Best Net',              nameEn: 'Best Net',          needsHoles: false },
            { id: 'longest-drive',  nameRu: 'Longest Drive',         nameEn: 'Longest Drive',     needsHoles: true },
            { id: 'closest-to-pin', nameRu: 'Closest to Pin',        nameEn: 'Closest to Pin',    needsHoles: true },
            { id: 'hole-in-one',    nameRu: 'Hole-in-One',           nameEn: 'Hole-in-One',       needsHoles: true },
            { id: 'best-senior',    nameRu: 'Best Senior',           nameEn: 'Best Senior',       needsHoles: false },
            { id: 'best-junior',    nameRu: 'Best Junior',           nameEn: 'Best Junior',       needsHoles: false },
            { id: 'best-lady',      nameRu: 'Best Lady',             nameEn: 'Best Lady',         needsHoles: false },
            { id: 'best-team',      nameRu: 'Best Team',             nameEn: 'Best Team',         needsHoles: false }
        ],

        // Виды наград (шаг 7)
        awardTypes: [
            { id: 'trophy',      nameRu: 'Кубок',            nameEn: 'Trophy' },
            { id: 'medal',       nameRu: 'Медаль',           nameEn: 'Medal' },
            { id: 'diploma',     nameRu: 'Грамота/диплом',   nameEn: 'Diploma' },
            { id: 'certificate', nameRu: 'Сертификат',       nameEn: 'Certificate' },
            { id: 'cash',        nameRu: 'Денежный приз',    nameEn: 'Cash prize' }
        ],

        // Уровни спонсоров (шаг 7)
        sponsorLevels: [
            { id: 'title',    nameRu: 'Титульный',     nameEn: 'Title' },
            { id: 'gold',     nameRu: 'Золотой',       nameEn: 'Gold' },
            { id: 'silver',   nameRu: 'Серебряный',    nameEn: 'Silver' },
            { id: 'partner',  nameRu: 'Партнёр',       nameEn: 'Partner' },
            { id: 'hole',     nameRu: 'Холь-спонсор',  nameEn: 'Hole sponsor' }
        ],

        // Соцсети для автопостинга (шаг 8)
        socialNetworks: [
            { id: 'telegram',  nameRu: 'Telegram',   nameEn: 'Telegram' },
            { id: 'vk',        nameRu: 'VK',         nameEn: 'VK' },
            { id: 'instagram', nameRu: 'Instagram',  nameEn: 'Instagram' },
            { id: 'youtube',   nameRu: 'YouTube',    nameEn: 'YouTube' }
        ],

        // Каналы уведомлений (шаг 9)
        notifyChannels: [
            { id: 'email', nameRu: 'Email', nameEn: 'Email' },
            { id: 'sms',   nameRu: 'SMS',   nameEn: 'SMS' },
            { id: 'push',  nameRu: 'Push',  nameEn: 'Push' }
        ],

        // Шаблоны уведомлений (шаг 9)
        notifyTemplates: [
            { id: 'registration', nameRu: 'Подтверждение регистрации', nameEn: 'Registration confirmed' },
            { id: 'tee-times',    nameRu: 'Публикация tee times',      nameEn: 'Tee times published' },
            { id: 'round-start',  nameRu: 'Старт раунда',              nameEn: 'Round start' },
            { id: 'results',      nameRu: 'Итоги турнира',             nameEn: 'Final results' }
        ],

        // Таблица очков Stableford по умолчанию (редактируется, шаг 3).
        // Ключ — «очков за результат нетто относительно пара»:
        // '<=-4', '-3', '-2', '-1', '0', '+1', '>=+2'
        defaultStablefordTable: { 'lte-4': 6, '-3': 5, '-2': 4, '-1': 3, '0': 2, '+1': 1, 'gte+2': 0 },

        // Modified Stableford по умолчанию (вариант PGA/ISPS)
        defaultModifiedStablefordTable: { 'lte-4': 8, '-3': 8, '-2': 5, '-1': 2, '0': 0, '+1': -1, 'gte+2': -3 },

        // Дефолтный фоновый интервал между группами (pace of play)
        defaultIntervalMin: 10
    };

    // Ярлык элемента справочника по id (двуязычно).
    function cfgLabel(list, id, lang) {
        var item = null;
        (list || []).forEach(function (x) { if (x.id === id) item = x; });
        if (!item) return String(id == null ? '' : id);
        return (lang === 'en') ? (item.nameEn || item.nameRu) : (item.nameRu || item.nameEn);
    }

    // ========================================================
    // ВНУТРЕННИЕ УТИЛИТЫ
    // ========================================================
    function roundHalfUp(x) { // WHS округление: .5 → вверх
        return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5);
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function num(v, fallback) {
        var n = parseFloat(v);
        return isFinite(n) ? n : (fallback || 0);
    }
    function deepClone(o) { return JSON.parse(JSON.stringify(o == null ? null : o)); }
    // Детерминированный ГПСЧ (mulberry32) — «случайные» флайты воспроизводимы по seed.
    function seededRng(seed) {
        var a = (seed >>> 0) || 1;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function fmtSigned(n) { return n > 0 ? '+' + n : (n === 0 ? 'E' : String(n)); }

    // Нормализация лунок поля: всегда массив [{num, par, si, yards:{tee:yd}}]
    function courseHoles(course) {
        if (!course || !course.holes) return [];
        var arr = Array.isArray(course.holes) ? course.holes.slice()
            : Object.keys(course.holes).map(function (k) { return course.holes[k]; });
        arr = arr.filter(function (h) { return h && h.num != null; });
        arr.sort(function (a, b) { return num(a.num) - num(b.num); });
        return arr.map(function (h) {
            return {
                num: num(h.num),
                par: clamp(num(h.par, 4), 3, 6),
                si: clamp(num(h.si, num(h.num)), 1, 36),
                yards: h.yards || {}
            };
        });
    }
    function coursePar(course) {
        return courseHoles(course).reduce(function (s, h) { return s + h.par; }, 0);
    }

    // ========================================================
    // HandicapService — WHS
    // ------------------------------------------------------------
    // Course Handicap  = HI × (Slope / 113) + (Course Rating − Par)
    // Playing Handicap = Course Handicap × Allowance%
    // Cap — потолок на индекс/результат (как настроено в турнире).
    // ========================================================
    var HandicapService = {
        // teeRating: { slope, cr, par }
        courseHandicap: function (hi, teeRating) {
            var slope = num(teeRating && teeRating.slope, 113) || 113;
            var cr = num(teeRating && teeRating.cr, teeRating && teeRating.par);
            var par = num(teeRating && teeRating.par, cr);
            return roundHalfUp(num(hi) * (slope / 113) + (cr - par));
        },
        playingHandicap: function (hi, teeRating, allowancePct, cap) {
            var idx = num(hi);
            if (cap != null && isFinite(parseFloat(cap)) && parseFloat(cap) > 0) idx = Math.min(idx, parseFloat(cap));
            var ch = HandicapService.courseHandicap(idx, teeRating);
            var pct = allowancePct == null ? 100 : num(allowancePct, 100);
            return roundHalfUp(ch * (pct / 100));
        },
        // Распределение ударов форы по лункам через stroke index.
        // ph>0 — получает удары на лунках с меньшим SI, ph<0 («плюсовый») — отдаёт на больших SI.
        // Возвращает { holeNum: strokes }.
        strokesAllocation: function (ph, holes) {
            var res = {};
            var hs = (holes || []).map(function (h) { return { num: h.num, si: h.si }; });
            hs.forEach(function (h) { res[h.num] = 0; });
            if (!hs.length || !ph) return res;
            var N = hs.length;
            var abs = Math.abs(Math.round(ph));
            var sign = ph > 0 ? 1 : -1;
            var sorted = hs.slice().sort(function (a, b) { return sign > 0 ? a.si - b.si : b.si - a.si; });
            for (var i = 0; i < abs; i++) res[sorted[i % N].num] += sign;
            return res;
        },
        // Командный гандикап (скрембл / four-ball): проценты от низшего к высшему.
        // weights — массив процентов, напр. [25, 20, 15, 10].
        teamHandicap: function (playerHis, weights) {
            var sorted = (playerHis || []).map(function (x) { return num(x); }).sort(function (a, b) { return a - b; });
            if (!sorted.length) return 0;
            var w = weights && weights.length ? weights : [25, 20, 15, 10];
            var sum = 0;
            sorted.forEach(function (hi, i) { sum += hi * (num(w[Math.min(i, w.length - 1)], 0) / 100); });
            return Math.round(sum * 10) / 10;
        },
        // Net Double Bogey — максимальный учитываемый счёт на лунке (WHS):
        // par + 2 + удары форы на лунке.
        netDoubleBogey: function (par, strokesReceived) {
            return num(par) + 2 + Math.max(0, num(strokesReceived));
        }
    };

    // ========================================================
    // ScoringService — стратегии подсчёта
    // ------------------------------------------------------------
    // Ключ таблицы Stableford по результату нетто к пару: toPar ключ
    // 'lte-4' (альбатрос и лучше), '-3', '-2', '-1', '0', '+1', 'gte+2'.
    // ========================================================
    function sTableLookup(table, toPar) {
        var tb = table || TN_CONFIG.defaultStablefordTable;
        if (toPar <= -4) return num(tb['lte-4']);
        if (toPar === -3) return num(tb['-3']);
        if (toPar === -2) return num(tb['-2']);
        if (toPar === -1) return num(tb['-1']);
        if (toPar === 0)  return num(tb['0']);
        if (toPar === 1)  return num(tb['+1']);
        return num(tb['gte+2']);
    }

    var ScoringService = {
        // Применение максимума на лунке (net double bogey / ESC 7..10 / без лимита).
        applyMaxScore: function (gross, hole, strokesReceived, mode) {
            var g = num(gross);
            if (mode === 'netdb') return Math.min(g, HandicapService.netDoubleBogey(hole.par, strokesReceived));
            if (mode === 'esc') return Math.min(g, 10); // современный ESC не нужен при WHS, оставлен верхний предел
            return g;
        },
        // Разбор одной лунки: gross → {net, toPar, points(stableford), modifiedPoints}
        holeResult: function (gross, hole, strokesReceived, opts) {
            var o = opts || {};
            var maxMode = o.maxScoreMode || 'netdb';
            var counted = ScoringService.applyMaxScore(gross, hole, strokesReceived, maxMode);
            var net = counted - num(strokesReceived);
            var toPar = counted - num(hole.par);
            var netToPar = toPar - num(strokesReceived); // результат нетто относительно пара
            return {
                gross: num(gross),
                counted: counted,
                net: net,
                toPar: toPar,
                points: sTableLookup(o.stablefordTable, netToPar),
                modifiedPoints: sTableLookup(o.modifiedTable || TN_CONFIG.defaultModifiedStablefordTable, netToPar),
                color: toPar <= -2 ? 'eagle' : toPar === -1 ? 'birdie' : toPar === 0 ? 'par' : toPar === 1 ? 'bogey' : 'double'
            };
        },
        pointsForToPar: function (netToPar, table) { return sTableLookup(table, netToPar); },

        // ---------- СТРАТЕГИИ ----------
        // aggregate(holes[], ctx) → { value, unit, label } для сортировки.
        // direction: 'low' (меньше — лучше) | 'high' (больше — лучше).
        STRATEGIES: {
            'stroke-gross': {
                direction: 'low', unit: 'strokes',
                aggregate: function (holes) {
                    return holes.reduce(function (s, h) { return s + num(h.gross); }, 0);
                }
            },
            'stroke-net': {
                direction: 'low', unit: 'strokes',
                aggregate: function (holes) {
                    return holes.reduce(function (s, h) { return s + num(h.net); }, 0);
                }
            },
            'stableford': {
                direction: 'high', unit: 'points',
                aggregate: function (holes) {
                    return holes.reduce(function (s, h) { return s + num(h.points); }, 0);
                }
            },
            'modified-stableford': {
                direction: 'high', unit: 'points',
                aggregate: function (holes) {
                    return holes.reduce(function (s, h) { return s + num(h.modifiedPoints); }, 0);
                }
            },
            'scramble': { // команда играет один мяч: сумма gross команды
                direction: 'low', unit: 'strokes', team: true,
                aggregate: function (holes) {
                    return holes.reduce(function (s, h) { return s + num(h.gross); }, 0);
                }
            },
            'best-ball': { // лучший net игроков команды на каждой лунке
                direction: 'low', unit: 'strokes', team: true,
                aggregate: function (holes) {
                    return holes.reduce(function (s, h) { return s + num(h.net); }, 0);
                },
                teamHole: function (playersHoleResults) { // [{net,...}] → лучший
                    var best = null;
                    playersHoleResults.forEach(function (r) { if (best == null || num(r.net) < best) best = num(r.net); });
                    return best == null ? 0 : best;
                }
            },
            'match-play': { // сравнение пар hole-by-hole (net)
                direction: 'high', unit: 'holes', headToHead: true,
                aggregate: function (holes) { return holes.length; } // счёт ведёт matchScore()
            },
            'skins': { // carry-over: лунку забирает единоличный лучший net
                direction: 'high', unit: 'skins', headToHead: true,
                aggregate: function (holes) { return num(holes[0] && holes[0].skins); }
            }
        },

        strategyDirection: function (systemId) {
            var s = ScoringService.STRATEGIES[systemId];
            return s ? s.direction : 'low';
        },

        // Match Play: aHoles/bHoles — массивы {net} по лункам (одинаковой длины).
        // Возвращает { aUp, bUp, thru, closed: bool, status: '3&2' | '1 up' | 'AS' }.
        matchScore: function (aHoles, bHoles) {
            var up = 0, thru = 0, closed = false;
            var total = Math.max(aHoles.length, bHoles.length);
            for (var i = 0; i < total; i++) {
                var a = aHoles[i], b = bHoles[i];
                if (!a || !b || a.net == null || b.net == null) break;
                thru++;
                if (a.net < b.net) up++; else if (a.net > b.net) up--;
                var remain = total - thru;
                if (remain > 0 && Math.abs(up) > remain) { closed = true; break; }
            }
            var status;
            if (up === 0) status = closed ? (thru + ' up') : 'AS';
            else if (closed) status = Math.abs(up) + '&' + (total - thru);
            else status = Math.abs(up) + ' up';
            return { aUp: Math.max(up, 0), bUp: Math.max(-up, 0), diff: up, thru: thru, closed: closed, status: status };
        },

        // Skins с carry-over: playersHoles[h] — массив net по игрокам на лунке h.
        // Возвращает { skinsPerPlayer: [], carriedSkins, decided: {hole: playerIdx|null} }
        skinsScore: function (playersHoles, playersCount) {
            var decided = {}, skins = [], carried = 0, i;
            for (i = 0; i < playersCount; i++) skins.push(0);
            for (var h = 0; h < playersHoles.length; h++) {
                carried++;
                var nets = playersHoles[h] || [];
                var best = null, bestIdx = -1, tie = false;
                for (i = 0; i < nets.length; i++) {
                    var v = num(nets[i]);
                    if (best == null || v < best) { best = v; bestIdx = i; tie = false; }
                    else if (v === best) tie = true;
                }
                if (bestIdx >= 0 && !tie) { skins[bestIdx] += carried; decided[h + 1] = bestIdx; carried = 0; }
                else decided[h + 1] = null;
            }
            return { skinsPerPlayer: skins, carriedSkins: carried, decided: decided };
        }
    };

    // ========================================================
    // TieBreakService
    // ------------------------------------------------------------
    // scores — массив результатов лунок игрока: [{num, par, si, value}]
    // (value = то, что сравниваем: net / gross / points).
    // Все методы возвращают <0 / 0 / >0 для sort-низ/выс по direction 'low'.
    // Под direction 'high' LeaderboardService сам инвертирует.
    // ========================================================
    var TieBreakService = {
        METHODS: {
            // Countback: сумма по последним 9, 6, 3, 1 лункам (WHS-правило).
            countback: function (aScores, bScores) {
                var seq = [9, 6, 3, 1];
                for (var k = 0; k < seq.length; k++) {
                    var n = seq[k];
                    var sa = TieBreakService._sumLast(aScores, n);
                    var sb = TieBreakService._sumLast(bScores, n);
                    if (sa !== sb) return sa - sb;
                }
                return 0;
            },
            // По последней лунке.
            'last-hole': function (aScores, bScores) {
                return TieBreakService._sumLast(aScores, 1) - TieBreakService._sumLast(bScores, 1);
            },
            // По лункам с наименьшим stroke index (самым сложным): 1, 2, 3…
            'stroke-index': function (aScores, bScores) {
                var bySi = function (s) {
                    return s.slice().sort(function (x, y) { return num(x.si) - num(y.si); });
                };
                var sa = bySi(aScores), sb = bySi(bScores);
                for (var i = 0; i < Math.min(sa.length, sb.length); i++) {
                    if (num(sa[i].value) !== num(sb[i].value)) return num(sa[i].value) - num(sb[i].value);
                }
                return 0;
            },
            // Sudden death: на табло равны до плей-офф — метод не расставляет,
            // но фиксирует, что требуется дополнительная лунка.
            'sudden-death': function () { return 0; }
        },
        _sumLast: function (scores, n) {
            var s = (scores || []).slice(-n);
            return s.reduce(function (acc, x) { return acc + num(x.value); }, 0);
        },
        // methods — упорядоченный список id методов (приоритет по порядку).
        // Возвращает: <0/0/>0; 0 означает «ничья сохраняется».
        compare: function (aScores, bScores, methods) {
            var ms = (methods && methods.length ? methods : ['countback']);
            for (var i = 0; i < ms.length; i++) {
                var m = TieBreakService.METHODS[ms[i]];
                if (!m) continue;
                var r = m(aScores, bScores);
                if (r !== 0) return r;
            }
            return 0;
        }
    };

    // ========================================================
    // PairingService — флайты, группы, tee times, re-pairing
    // ========================================================
    var PairingService = {
        // Авто-флайты: сортировка по критерию + нарезка на флайты.
        // players: [{id, name, handicap, rating, age, gender}]
        // opts: { by, flightSize | flightsCount, seed }
        makeFlights: function (players, opts) {
            var o = opts || {};
            var by = o.by || 'handicap';
            var arr = (players || []).slice();
            if (by === 'random') {
                var rnd = seededRng(o.seed || Date.now());
                for (var i = arr.length - 1; i > 0; i--) {
                    var j = Math.floor(rnd() * (i + 1));
                    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
                }
            } else if (by === 'gender') {
                var ord = { men: 0, women: 1 };
                arr.sort(function (a, b) { return (ord[a.gender] == null ? 2 : ord[a.gender]) - (ord[b.gender] == null ? 2 : ord[b.gender]); });
            } else {
                var key = by === 'rating' ? 'rating' : by === 'age' ? 'age' : 'handicap';
                var desc = key === 'rating'; // рейтинг: выше — первый; hcp/age: ниже — первый
                arr.sort(function (a, b) {
                    var d = num(a[key]) - num(b[key]);
                    return desc ? -d : d;
                });
            }
            var size = Math.max(2, num(o.flightSize, 0));
            var count = Math.max(1, num(o.flightsCount, 0));
            if (!size && count) size = Math.ceil(arr.length / count) || 1;
            if (!size) size = arr.length || 1;
            var flights = [];
            for (var f = 0; f < arr.length; f += size) flights.push(arr.slice(f, f + size));
            return flights;
        },
        // Нарезка игроков на стартовые группы по 2/3/4.
        makeGroups: function (players, groupSize) {
            var size = clamp(num(groupSize, 4), 2, 4);
            var groups = [];
            var arr = (players || []).slice();
            for (var i = 0; i < arr.length; i += size) groups.push(arr.slice(i, i + size));
            return groups;
        },
        // Расписание старта.
        // groups: массив групп. opts: { startType, firstTime 'HH:MM', intervalMin, holesCount }
        // → [{ groupIndex, time 'HH:MM', startHole, tee }]
        buildTeeTimes: function (groups, opts) {
            var o = opts || {};
            var type = o.startType || 'tee-times';
            var interval = Math.max(4, num(o.intervalMin, TN_CONFIG.defaultIntervalMin));
            var start = String(o.firstTime || '09:00').split(':');
            var t0 = num(start[0], 9) * 60 + num(start[1], 0);
            var holesCount = clamp(num(o.holesCount, 18), 9, 36);
            var pad = function (n) { return (n < 10 ? '0' : '') + n; };
            var out = [];
            (groups || []).forEach(function (g, idx) {
                var mins = t0, hole = 1;
                if (type === 'shotgun') {
                    hole = (idx % holesCount) + 1;
                    mins = t0 + Math.floor(idx / holesCount) * interval;
                } else if (type === 'two-tee' && holesCount >= 18) {
                    // очередь: попеременно 1-я и 10-я лунки в одни и те же минуты
                    hole = idx % 2 === 0 ? 1 : 10;
                    mins = t0 + Math.floor(idx / 2) * interval;
                } else {
                    hole = 1;
                    mins = t0 + idx * interval;
                }
                out.push({
                    groupIndex: idx,
                    time: pad(Math.floor(mins / 60) % 24) + ':' + pad(mins % 60),
                    startHole: hole,
                    tee: String(hole)
                });
            });
            return out;
        },
        // Re-pairing после раунда: группы по позиции лидерборда
        // (лидеры стартуют последними — разворачиваем порядок блоков,
        // сохраняя состав позиций внутри группы).
        rePairing: function (leaderboardRows, groupSize) {
            var size = clamp(num(groupSize, 4), 2, 4);
            var rows = (leaderboardRows || []).slice(); // уже отсортированы, лучший первый
            var groups = [];
            for (var i = 0; i < rows.length; i += size) groups.push(rows.slice(i, i + size));
            return groups.reverse();
        }
    };

    // ========================================================
    // CutService — отсечка (top-N и ties)
    // ------------------------------------------------------------
    // rows — отсортированный лидерборд (по результату, лучший первый).
    // opts: { topN, includeTies }. Возвращает { kept, cutPlayers, cutScore }.
    // ========================================================
    var CutService = {
        applyCut: function (rows, opts) {
            var o = opts || {};
            var topN = Math.max(1, num(o.topN, 65));
            var withTies = o.includeTies !== false;
            var list = (rows || []).slice();
            if (list.length <= topN) {
                return { kept: list, cutPlayers: [], cutScore: list.length ? list[list.length - 1].value : null };
            }
            var cutScore = list[topN - 1].value;
            var kept = [], cutPlayers = [];
            if (!withTies) {
                // без ties — ровно topN по порядку лидерборда
                kept = list.slice(0, topN);
                cutPlayers = list.slice(topN);
            } else {
                list.forEach(function (r) {
                    if (r.value <= cutScore) kept.push(r);
                    else cutPlayers.push(r);
                });
            }
            return { kept: kept, cutPlayers: cutPlayers, cutScore: cutScore };
        }
    };

    // ========================================================
    // LeaderboardService
    // ------------------------------------------------------------
    // players: [{ id, name, club, country, hi, teamId }]
    // rounds:  [{ scores: { playerId: [g1..gN] }, thru: { playerId: n } }]
    // opts: { course, system, allowancePct, cap, teeRatings: {playerId: {slope,cr,par}},
    //         stablefordTable, modifiedTable, maxScoreMode, tieMethods }
    // ========================================================
    var LeaderboardService = {
        build: function (players, rounds, opts) {
            var o = opts || {};
            var system = o.system || 'stroke-net';
            var course = o.course || { holes: [] };
            var holes = courseHoles(course);
            var N = holes.length || 18;
            var rows = (players || []).map(function (p) {
                var tee = (o.teeRatings && o.teeRatings[p.id]) || { slope: 113, cr: coursePar(course) || N * 4, par: coursePar(course) || N * 4 };
                var ph = HandicapService.playingHandicap(p.hi, tee, o.allowancePct, o.cap);
                var alloc = HandicapService.strokesAllocation(ph, holes);
                var roundTotals = [], roundDetails = [], totalHoles = 0, lastRoundHoles = 0;
                (rounds || []).forEach(function (r) {
                    var gs = (r.scores && r.scores[p.id]) || [];
                    var thru = Math.min((r.thru && r.thru[p.id] != null ? num(r.thru[p.id]) : gs.length), N);
                    var details = [];
                    var finishedAny = false;
                    for (var h = 0; h < thru; h++) {
                        var hole = holes[h] || { num: h + 1, par: 4, si: h + 1 };
                        if (gs[h] == null) continue;
                        finishedAny = true;
                        details.push(ScoringService.holeResult(gs[h], hole, alloc[hole.num] || 0, {
                            maxScoreMode: o.maxScoreMode,
                            stablefordTable: o.stablefordTable,
                            modifiedTable: o.modifiedTable
                        }));
                    }
                    var strat = ScoringService.STRATEGIES[system] || ScoringService.STRATEGIES['stroke-net'];
                    roundTotals.push(finishedAny ? strat.aggregate(details) : null);
                    roundDetails.push(details);
                    totalHoles += details.length;
                    if (r === rounds[rounds.length - 1]) lastRoundHoles = details.length;
                });
                var strat = ScoringService.STRATEGIES[system] || ScoringService.STRATEGIES['stroke-net'];
                var allDetails = [];
                roundDetails.forEach(function (d) { allDetails = allDetails.concat(d); });
                var gross = allDetails.reduce(function (s, d) { return s + d.gross; }, 0);
                var net = allDetails.reduce(function (s, d) { return s + d.net; }, 0);
                var points = allDetails.reduce(function (s, d) { return s + d.points; }, 0);
                var value = 0;
                roundTotals.forEach(function (tv) { if (tv != null) value += tv; });
                var toPar = allDetails.reduce(function (s, d) { return s + d.toPar; }, 0);
                var last = roundDetails.length ? roundDetails[roundDetails.length - 1] : [];
                var today = strat.aggregate(last);
                return {
                    id: p.id, name: p.name, club: p.club || '', country: p.country || '',
                    hi: num(p.hi), playingHandicap: ph,
                    rounds: roundTotals, total: value, value: value,
                    gross: gross, net: net, points: points, toPar: toPar,
                    thru: lastRoundHoles, totalHoles: totalHoles,
                    today: last.length ? today : null,
                    _details: roundDetails,
                    _flat: allDetails.map(function (d, i) {
                        var hole = holes[i] || { num: i + 1, par: 4, si: i + 1 };
                        var v = system === 'stableford' ? d.points : system === 'modified-stableford' ? d.modifiedPoints
                            : system === 'stroke-gross' ? d.gross : d.net;
                        return { num: hole.num, par: hole.par, si: hole.si, value: num(v) };
                    })
                };
            });
            // Сортировка: направление стратегии + тай-брейки.
            var dir = ScoringService.strategyDirection(system);
            var sign = dir === 'high' ? -1 : 1;
            rows.sort(function (a, b) {
                if (a.value !== b.value) return sign * (a.value - b.value);
                var tb = TieBreakService.compare(a._flat, b._flat, o.tieMethods);
                return sign * tb;
            });
            // Позиции с разделением мест при полной ничьей (1, 2, 2, 4 …)
            var pos = 0;
            rows.forEach(function (r, i) {
                if (i > 0 && r.value === rows[i - 1].value &&
                    TieBreakService.compare(r._flat, rows[i - 1]._flat, o.tieMethods) === 0) {
                    r.position = pos;
                } else {
                    pos = i + 1;
                    r.position = pos;
                }
            });
            return rows;
        },
        // Проекция финального результата: текущий результат + пар по оставшимся лункам.
        projected: function (row, course, system) {
            var holes = courseHoles(course);
            var N = holes.length || 18;
            var remaining = Math.max(0, N - num(row.thru));
            if (system === 'stableford' || system === 'modified-stableford') return row.total + remaining * 2;
            return num(row.toPar) + 0; // к базе прибавлять нечего: проекция = текущий toPar
        }
    };

    // ========================================================
    // Exporters — CSV / JSON / печатные HTML (брендированные)
    // ========================================================
    function csvCell(v) {
        var s = String(v == null ? '' : v);
        if (/[",\n;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
        return s;
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    var Exporters = {
        toCSV: function (rows, columns) {
            var head = (columns || []).map(function (c) { return csvCell(c.title); }).join(';');
            var body = (rows || []).map(function (r) {
                return (columns || []).map(function (c) {
                    var v = typeof c.value === 'function' ? c.value(r) : r[c.value];
                    return csvCell(v);
                }).join(';');
            }).join('\n');
            return '﻿' + head + '\n' + body; // BOM для Excel
        },
        toJSON: function (data) { return JSON.stringify(data, null, 2); },

        // --- Печатные шаблоны (возвращают готовый HTML-документ) ---
        _printShell: function (title, brand, bodyHtml) {
            var logo = brand && brand.logo ? '<img src="' + esc(brand.logo) + '" alt="" style="height:44px;vertical-align:middle;margin-right:10px;">' : '';
            var club = brand && brand.name ? esc(brand.name) : '';
            return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
                'body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px;}' +
                'h1{font-size:18px;margin:0;}h2{font-size:14px;margin:18px 0 6px;} ' +
                '.ph-head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px;}' +
                'table{border-collapse:collapse;width:100%;}th,td{border:1px solid #444;padding:4px 5px;text-align:center;font-size:11px;}' +
                'th{background:#eee;}td.l,th.l{text-align:left;}' +
                '.sig{display:inline-block;width:40%;border-top:1px solid #000;margin-top:48px;padding-top:4px;font-size:11px;}' +
                '.muted{color:#555;font-size:10px;}' +
                '@media print{body{margin:8mm;} .ph-page{page-break-after:always;}}' +
                '</style></head><body>' +
                '<div class="ph-head"><div>' + logo + '<span style="font-size:16px;font-weight:700;">' + club + '</span></div>' +
                '<div style="text-align:right;"><h1>' + esc(title) + '</h1><div class="muted">' + esc((brand && brand.date) || '') + '</div></div></div>' +
                bodyHtml + '</body></html>';
        },

        // Официальная scorecard: пар, SI, ярдажи по ти, строки игроков, подписи.
        scorecardHtml: function (course, players, opts) {
            var o = opts || {};
            var holes = courseHoles(course);
            var N = holes.length;
            var par = coursePar(course);
            var tees = TN_CONFIG.teeBoxes.filter(function (tb) {
                return holes.some(function (h) { return h.yards && h.yards[tb.id]; });
            });
            var head = '<tr><th class="l">№</th>' + holes.map(function (h) { return '<th>' + h.num + '</th>'; }).join('') + '<th>Σ</th></tr>';
            var parRow = '<tr><td class="l"><b>Par</b></td>' + holes.map(function (h) { return '<td>' + h.par + '</td>'; }).join('') + '<td><b>' + par + '</b></td></tr>';
            var siRow = '<tr><td class="l">SI</td>' + holes.map(function (h) { return '<td>' + h.si + '</td>'; }).join('') + '<td></td></tr>';
            var yardRows = tees.map(function (tb) {
                var sum = holes.reduce(function (s, h) { return s + num(h.yards && h.yards[tb.id]); }, 0);
                return '<tr><td class="l" style="color:' + tb.color + ';font-weight:700;">' + esc(tb.nameEn) + '</td>' +
                    holes.map(function (h) { return '<td>' + (h.yards && h.yards[tb.id] ? h.yards[tb.id] : '—') + '</td>'; }).join('') +
                    '<td>' + (sum || '—') + '</td></tr>';
            }).join('');
            var alloc = function (p) {
                var tee = (o.teeRatings && o.teeRatings[p.id]) || {};
                var ph = HandicapService.playingHandicap(p.hi, { slope: tee.slope || 113, cr: tee.cr || par, par: par }, o.allowancePct, o.cap);
                return { ph: ph, map: HandicapService.strokesAllocation(ph, holes) };
            };
            var playerRows = (players || []).map(function (p) {
                var a = alloc(p);
                var cells = holes.map(function (h) {
                    var n = Math.abs(num(a.map[h.num]));
                    var dots = '';
                    for (var d = 0; d < n; d++) dots += '•';
                    return '<td style="height:26px;">' + (dots ? ' <span class="muted">' + dots + '</span>' : '') + '</td>';
                }).join('');
                return '<tr><td class="l">' + esc(p.name) + ' <span class="muted">(HCP ' + a.ph + ')</span></td>' + cells + '<td></td></tr>';
            }).join('');
            var body = '<table>' + head + parRow + siRow + yardRows + playerRows + '</table>' +
                '<div style="display:flex;justify-content:space-between;">' +
                '<span class="sig">' + esc(o.markerLabel || 'Маркер / Marker') + '</span>' +
                '<span class="sig">' + esc(o.playerLabel || 'Игрок / Player') + '</span></div>';
            return Exporters._printShell(o.title || 'Scorecard', o.brand, body);
        },

        // Стартовая ведомость (tee times).
        teeTimesHtml: function (teeTimes, groups, opts) {
            var o = opts || {};
            var rows = (teeTimes || []).map(function (tt) {
                var g = groups[tt.groupIndex] || [];
                var names = g.map(function (p) { return esc(p.name || p); }).join('<br>');
                return '<tr><td>' + esc(tt.time) + '</td><td>' + esc(tt.startHole) + '</td><td class="l">' + names + '</td></tr>';
            }).join('');
            var body = '<table><tr><th>' + esc(o.timeLabel || 'Время') + '</th><th>' + esc(o.holeLabel || 'Лунка') + '</th><th class="l">' + esc(o.playersLabel || 'Игроки') + '</th></tr>' + rows + '</table>';
            return Exporters._printShell(o.title || 'Tee Times', o.brand, body);
        },

        // Лидерборд (промежуточный/итоговый).
        leaderboardHtml: function (rows, opts) {
            var o = opts || {};
            var cols = ['#', (o.nameLabel || 'Игрок'), (o.clubLabel || 'Клуб')];
            var maxRounds = 0;
            (rows || []).forEach(function (r) { maxRounds = Math.max(maxRounds, (r.rounds || []).length); });
            for (var i = 1; i <= maxRounds; i++) cols.push('R' + i);
            cols.push((o.totalLabel || 'Итог'), 'Thru', (o.todayLabel || 'Сегодня'), '±');
            var body = '<table><tr>' + cols.map(function (c, k) { return '<th class="' + (k === 1 || k === 2 ? 'l' : '') + '">' + esc(c) + '</th>'; }).join('') + '</tr>' +
                (rows || []).map(function (r) {
                    var tds = [r.position, esc(r.name), esc(r.club || '—')];
                    for (var k = 0; k < maxRounds; k++) tds.push(r.rounds[k] != null ? r.rounds[k] : '—');
                    tds.push(r.total, r.thru, r.today != null ? r.today : '—', fmtSigned(num(r.toPar)));
                    return '<tr>' + tds.map(function (v, k2) { return '<td class="' + (k2 === 1 || k2 === 2 ? 'l' : '') + '">' + v + '</td>'; }).join('') + '</tr>';
                }).join('') + '</table>';
            return Exporters._printShell(o.title || 'Leaderboard', o.brand, body);
        },

        // Диплом/грамота (массовая генерация: по листу на участника).
        diplomaHtml: function (awards, opts) {
            var o = opts || {};
            var pages = (awards || []).map(function (a) {
                return '<div class="ph-page" style="text-align:center;padding:60px 20px;">' +
                    '<div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#8a6d1d;">' + esc(o.subtitle || 'Награда турнира') + '</div>' +
                    '<h1 style="font-size:30px;margin:10px 0;">' + esc(a.title || '') + '</h1>' +
                    '<div style="font-size:22px;font-weight:700;">' + esc(a.playerName || '') + '</div>' +
                    '<div style="margin-top:8px;font-size:13px;">' + esc(a.result || '') + '</div>' +
                    '<div style="margin-top:60px;"><span class="sig" style="width:30%;">' + esc(o.signLabel || 'Директор турнира') + '</span></div></div>';
            }).join('');
            return Exporters._printShell(o.title || 'Diplomas', o.brand, pages);
        }
    };

    // ========================================================
    // ФАСАД
    // ========================================================
    var TnEngine = {
        Handicap: HandicapService,
        Scoring: ScoringService,
        TieBreak: TieBreakService,
        Pairing: PairingService,
        Cut: CutService,
        Leaderboard: LeaderboardService,
        Exporters: Exporters,
        cfgLabel: cfgLabel,
        utils: {
            roundHalfUp: roundHalfUp,
            courseHoles: courseHoles,
            coursePar: coursePar,
            seededRng: seededRng,
            deepClone: deepClone,
            fmtSigned: fmtSigned
        },
        VERSION: '1.0.0'
    };

    return { TnEngine: TnEngine, TN_CONFIG: TN_CONFIG };
});
