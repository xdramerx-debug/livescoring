// ============================================================
// tn-admin-core.js — ЯДРО НОВОЙ ТУРНИРНОЙ СИСТЕМЫ (чистая логика)
// ------------------------------------------------------------
// Страница tn-admin.html: создать турнир → добавить участников →
// старт (start-admin) → результаты → протокол с призёрами.
//
// Этот модуль — только вычисления (без DOM и Firebase), поэтому его
// проверяют автотесты (tools/test-tn-admin.js). UI-слой — js/tn-admin.js.
//
// Модель данных (Firebase RTDB):
//   tournaments/<id>              — турнир новой системы (source: 'tn-admin')
//     cfg: { scoring, netMode, genderSplit, divisions[], prizePlaces,
//            groupSize, method, scheme, interval, startTime }
//     registeredPlayers/<pid>     — участники { name, handicap, gender, tee, status }
//     results/<pid>               — ручной ввод { mode:'holes'|'total', holes{}, gross, stableford, status }
//     divisions[]                 — дивизионы по гандикапу (совместимы с utils.tnNormalizeDivisions)
//     protocol                    — снимок финального протокола (для публичной страницы)
//   rounds/<rid>, protocols/<pid> — создаются переиспользуемым стартом (js/start-admin.js)
// ============================================================
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.TnAdminCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var VERSION = '1.0.0';

    var SCORING = { STROKE: 'stroke', STABLEFORD: 'stableford' };
    var NET_MODE = { NET: 'net', GROSS: 'gross' };
    var STATUS = { ACTIVE: 'ACTIVE', DQ: 'DQ', DNS: 'DNS' };
    // Статусы, которые участвуют в борьбе за места. DQ/DNS идут в конец
    // протокола без места.
    var RANKED_STATUSES = ['ACTIVE'];

    // ----------------------------------------------------------
    // Мелкие хелперы
    // ----------------------------------------------------------
    function str(v) { return String(v == null ? '' : v).trim(); }
    function num(v, fallback) {
        if (v === '' || v == null) return fallback;
        var n = parseFloat(v);
        return isNaN(n) ? fallback : n;
    }
    function clone(v) {
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(clone);
        var out = {};
        Object.keys(v).forEach(function (k) { out[k] = clone(v[k]); });
        return out;
    }
    function genderNorm(g) {
        var s = str(g).toLowerCase();
        if (!s) return 'men';
        if (s === 'women' || s === 'woman' || s === 'female' || s === 'w' || s === 'f' ||
            s.indexOf('жен') === 0 || s.indexOf('дев') === 0 || s === 'ж') return 'women';
        return 'men';
    }
    function statusNorm(s) {
        var v = str(s).toUpperCase();
        if (v === 'DQ' || v === 'WD' || v === 'DNS' || v === 'DNF') return v === 'WD' || v === 'DNF' ? 'DQ' : v;
        return STATUS.ACTIVE;
    }
    function statusRank(s) {
        return RANKED_STATUSES.indexOf(statusNorm(s)) === 0 ? 0 : 1;
    }
    function isRanked(row) { return statusRank(row.status) === 0; }

    // ----------------------------------------------------------
    // Конфигурация турнира
    // ----------------------------------------------------------
    function defaultDivisions() {
        return [
            { id: 'd1', name: 'Дивизион 1', hcpFrom: 0, hcpTo: 9.9, gender: 'all' },
            { id: 'd2', name: 'Дивизион 2', hcpFrom: 10, hcpTo: 18.9, gender: 'all' },
            { id: 'd3', name: 'Дивизион 3', hcpFrom: 19, hcpTo: '', gender: 'all' }
        ];
    }

    function defaultConfig() {
        return {
            scoring: SCORING.STROKE,          // 'stroke' | 'stableford'
            netMode: NET_MODE.NET,            // по чему основные места: 'net' | 'gross'
            genderSplit: true,                // отдельный зачёт мужчин/женщин
            divisions: defaultDivisions(),    // дивизионы по гандикапу ('' = без предела)
            prizePlaces: 3,                   // призовых мест в номинациях/дивизионах/группах
            groupSize: 4,                     // размер игровой группы (шаг «Старт»)
            method: 'hcpSnake',               // порядок распределения (шаг «Старт»)
            scheme: '1',                      // схема старта (шаг «Старт»)
            interval: 8,                      // интервал старта, минут
            startTime: '09:00'                // время первого старта
        };
    }

    function normalizeConfig(raw) {
        var cfg = defaultConfig();
        var src = raw && typeof raw === 'object' ? raw : {};
        cfg.scoring = String(src.scoring || '').toLowerCase() === SCORING.STABLEFORD ? SCORING.STABLEFORD : SCORING.STROKE;
        cfg.netMode = src.netMode === NET_MODE.GROSS ? NET_MODE.GROSS : NET_MODE.NET;
        cfg.genderSplit = src.genderSplit !== false;
        cfg.prizePlaces = Math.max(1, Math.min(10, parseInt(src.prizePlaces, 10) || 3));
        cfg.groupSize = Math.max(1, Math.min(6, parseInt(src.groupSize, 10) || 4));
        cfg.method = str(src.method) || 'hcpSnake';
        cfg.scheme = str(src.scheme) || '1';
        cfg.interval = Math.max(1, Math.min(30, parseInt(src.interval, 10) || 8));
        cfg.startTime = /^\d{1,2}:\d{2}$/.test(str(src.startTime)) ? str(src.startTime) : '09:00';
        // Массив (даже пустой) — явный выбор админа; отсутствие поля — дефолт.
        var divs = Array.isArray(src.divisions) ? src.divisions
            : (src.divisions == null ? cfg.divisions : []);
        cfg.divisions = divs
            .filter(function (d) { return d && (str(d.name) || d.hcpFrom != null || d.hcpTo != null); })
            .map(function (d, i) {
                return {
                    id: str(d.id) || ('d' + (i + 1)),
                    name: str(d.name) || ('Дивизион ' + (i + 1)),
                    hcpFrom: d.hcpFrom === '' || d.hcpFrom == null ? '' : num(d.hcpFrom, ''),
                    hcpTo: d.hcpTo === '' || d.hcpTo == null ? '' : num(d.hcpTo, ''),
                    gender: (d.gender === 'men' || d.gender === 'women') ? d.gender : 'all'
                };
            });
        return cfg;
    }

    function validateConfig(cfg) {
        var errors = [];
        var c = normalizeConfig(cfg);
        c.divisions.forEach(function (d) {
            var from = d.hcpFrom === '' ? null : d.hcpFrom;
            var to = d.hcpTo === '' ? null : d.hcpTo;
            if (from != null && to != null && from > to) {
                errors.push('division_range: ' + (d.name || d.id));
            }
        });
        return errors;
    }

    // Гандикап из любой записи: число или строка с запятой/мусором.
    function parseHcpValue(v) {
        if (v === '' || v == null) return null;
        if (typeof v === 'number') return isNaN(v) ? null : v;
        var h = str(v).replace(',', '.').replace(/[^\d.+-]/g, '');
        if (h === '' || h === '.' || h === '-' || h === '+') return null;
        var n = parseFloat(h);
        return isNaN(n) ? null : n;
    }

    // ----------------------------------------------------------
    // Участники
    // ----------------------------------------------------------
    // Нормализация одной строки (ручной ввод / импорт / база игроков).
    function normalizePlayer(raw, index) {
        var src = raw || {};
        var name = str(src.name) || [str(src.lastName), str(src.firstName), str(src.middleName)]
            .filter(function (w) { return !!w; }).join(' ');
        if (!name) name = [str(src.firstName), str(src.middleName), str(src.lastName)]
            .filter(function (w) { return !!w; }).join(' ');
        if (!name) return null;
        var player = {
            pid: str(src.pid || src.uid || src.id) || ('p' + (index + 1)),
            name: name,
            handicap: parseHcpValue(src.handicap),
            gender: genderNorm(src.gender),
            tee: normalizeTee(src.tee) || 'wh',
            status: statusNorm(src.status),
            source: str(src.source) || 'manual'
        };
        if (src.firstName || src.lastName || src.middleName) {
            player.firstName = str(src.firstName);
            player.lastName = str(src.lastName);
            player.middleName = str(src.middleName);
        }
        return player;
    }

    function normalizePlayers(list) {
        var arr = Array.isArray(list) ? list : (list && typeof list === 'object'
            ? Object.keys(list).map(function (k) {
                var p = list[k] || {};
                p.pid = p.pid || k;
                return p;
            })
            : []);
        return arr.map(function (p, i) { return normalizePlayer(p, i); })
            .filter(function (p) { return !!p && !!p.name; });
    }

    // Разбор импорта Excel/CSV. Принимает:
    //   rows = [{ 'ФИО': '…', 'Гандикап': 12.4, 'Пол': 'м', 'Ти': 'wh' }, …]
    //   или  [['Иванов Иван', 12.4, 'м', 'wh'], …]
    //   или  текст CSV (с разделителем ; , или табом, первой строкой заголовок).
    // Формат совместим со стартовым листом (js/start-admin.js): ФИО, точный
    // гандикап, пол, ТИ. Неизвестные/битые строки попадают в issues.
    function parseImport(input) {
        var rows = [];
        if (typeof input === 'string') rows = parseCsvText(input);
        else if (Array.isArray(input)) rows = input;
        else if (input && typeof input === 'object') {
            rows = Object.keys(input).map(function (k) { return input[k]; });
        }
        var players = [], issues = [];
        rows.forEach(function (row, i) {
            if (row == null) return;
            var cells = Array.isArray(row) ? row.map(function (c) { return c == null ? '' : String(c).trim(); })
                : (typeof row === 'string' ? splitDelimited(row) : objectRowToCells(row));
            var nonEmpty = cells.some(function (c) { return !!str(c); });
            if (!nonEmpty) return;
            var looksHeader = /фамил|фио|игрок|name|hcp|гандип|пол|gender|ти|tee/i.test(cells.join(' '));
            if (i === 0 && looksHeader) return;
            var raw = cellsToPlayer(cells);
            if (!raw.name) { issues.push({ row: i + 1, reason: 'empty_name', cells: cells }); return; }
            players.push(normalizePlayer(raw, players.length));
        });
        return { players: players, issues: issues };
    }

    function objectRowToCells(row) {
        var keys = Object.keys(row);
        var map = { name: '', handicap: '', gender: '', tee: '' };
        keys.forEach(function (k) {
            var lk = k.toLowerCase();
            var v = str(row[k]);
            if (/фамил|фио|игрок|player|name/.test(lk)) map.name = v;
            else if (/hcp|гандип|handicap|index/.test(lk)) map.handicap = v;
            else if (/пол|gender|sex/.test(lk)) map.gender = v;
            else if (/ти|tee/.test(lk)) map.tee = v;
        });
        return [map.name, map.handicap, map.gender, map.tee];
    }

    function cellsToPlayer(cells) {
        // Порядок колонок как в шаблоне: ФИО · Гандикап · Пол · Ти.
        // Если колонок меньше — недостающее выводим из того, что есть.
        var name = str(cells[0]);
        var hcpRaw = str(cells[1]);
        var genderRaw = str(cells[2]);
        var teeRaw = str(cells[3]);
        // ФИО может быть одной ячейкой или тремя (Фамилия Имя Отчество)
        var parts = name.split(/\s+/).filter(function (w) { return !!w; });
        var player = { name: name, source: 'import' };
        if (parts.length >= 2) {
            player.lastName = parts[0];
            player.firstName = parts[1] || '';
            player.middleName = parts.slice(2).join(' ');
        } else {
            player.firstName = parts[0] || '';
        }
        if (hcpRaw) player.handicap = parseHcpValue(hcpRaw);
        if (genderRaw) player.gender = genderNorm(genderRaw);
        if (teeRaw) player.tee = normalizeTee(teeRaw);
        return player;
    }

    function normalizeTee(raw) {
        var s = str(raw).toLowerCase();
        if (!s) return 'wh';
        if (/^(bk|black|ч[её]рн)/.test(s)) return 'bk';
        if (/^(bl|blue|син)/.test(s)) return 'bl';
        if (/^(rd|red|крас)/.test(s)) return 'rd';
        if (/^(yl|yellow|ж[её]лт)/.test(s)) return 'wh'; // жёлтых ти на поле нет
        if (/^(wh|white|бел)/.test(s)) return 'wh';
        return 'wh';
    }

    function detectDelim(head) {
        head = String(head == null ? '' : head);
        if (head.indexOf('\t') !== -1) return '\t';
        if ((head.match(/;/g) || []).length < (head.match(/,/g) || []).length) return ',';
        return ';';
    }

    function splitDelimited(line) {
        return String(line).split(detectDelim(line)).map(function (c) { return str(c); });
    }

    function parseCsvText(text) {
        var lines = String(text == null ? '' : text).split(/\r?\n/);
        var delim = detectDelim(lines[0] || '');
        return lines.filter(function (l) { return str(l) !== ''; }).map(function (line) {
            return line.split(delim).map(function (c) { return str(c); });
        });
    }

    // Шаблон импорта (CSV) — чтобы админ знал формат.
    function importTemplateCsv() {
        return '\ufeff' + ['ФИО', 'Гандикап', 'Пол', 'Ти'].join(';') + '\n' +
            ['Иванов Иван Петрович', '12.4', 'м', 'wh'].join(';') + '\n' +
            ['Петрова Мария', '18.0', 'ж', 'rd'].join(';') + '\n';
    }

    // ----------------------------------------------------------
    // Результаты
    // ----------------------------------------------------------
    // deps.fieldHcp(exactHcp, tee, gender) → игровой (field) гандикап
    // deps.calcStats(holes, fieldHcp, exactHcp, order) → { gross, net, stableford, holesPlayed }
    // deps.holePar(h) → пар лунки
    function buildRow(player, result, cfg, deps) {
        deps = deps || {};
        var fieldHcpFn = typeof deps.fieldHcp === 'function' ? deps.fieldHcp : function (h) { return Math.round(num(h, 0)); };
        var row = {
            pid: player.pid,
            name: player.name,
            gender: player.gender,
            handicap: player.handicap == null ? null : player.handicap,
            tee: player.tee || 'wh',
            status: statusNorm((result && result.status) || player.status),
            fieldHcp: null,
            gross: null,
            net: null,
            stableford: null,
            holesPlayed: 0,
            toPar: null,
            hasResult: false
        };
        if (row.handicap != null) {
            try { row.fieldHcp = fieldHcpFn(row.handicap, row.tee, row.gender); } catch (e) { row.fieldHcp = null; }
        }
        if (!result) return row;
        var mode = result.mode === 'holes' ? 'holes' : 'total';
        if (mode === 'holes' && result.holes && typeof result.holes === 'object') {
            var order = [];
            for (var h = 1; h <= 18; h++) order.push(h);
            var stats = null;
            if (typeof deps.calcStats === 'function') {
                try { stats = deps.calcStats(result.holes, row.fieldHcp || 0, row.handicap || 0, order); } catch (e) { stats = null; }
            }
            if (stats) {
                row.gross = stats.gross;
                row.net = stats.net;
                row.stableford = stats.stablefordField != null ? stats.stablefordField : stats.stableford;
                row.holesPlayed = stats.holesPlayed || 0;
                row.toPar = stats.toPar;
                row.hasResult = (stats.holesPlayed || 0) > 0;
            } else {
                // Фолбэк: сумма ударов по введённым лункам (если функция
                // статистики из utils.js недоступна).
                var sum = 0, cnt = 0;
                for (var hh = 1; hh <= 18; hh++) {
                    var v = result.holes[hh];
                    if (v != null && v !== '' && !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0) {
                        sum += parseInt(v, 10);
                        cnt++;
                    }
                }
                if (cnt) {
                    row.gross = sum;
                    row.net = row.fieldHcp != null && cfg.scoring !== SCORING.STABLEFORD ? sum - row.fieldHcp : null;
                    row.holesPlayed = cnt;
                    row.hasResult = true;
                }
            }
        } else {
            if (result.gross != null && result.gross !== '') {
                row.gross = num(result.gross, null);
                row.hasResult = row.gross != null;
            }
            if (result.stableford != null && result.stableford !== '') {
                row.stableford = num(result.stableford, null);
                row.hasResult = row.stableford != null;
            }
            // Нетто из итога: gross − игровой гандикап
            if (row.gross != null && row.fieldHcp != null && cfg.scoring !== SCORING.STABLEFORD) {
                row.net = row.gross - row.fieldHcp;
            }
            if (row.net == null && result.net != null && result.net !== '') {
                row.net = num(result.net, null);
                row.hasResult = true;
            }
        }
        return row;
    }

    // Метрика, по которой идёт борьба (место).
    function metricOf(row, cfg) {
        if (!row || !row.hasResult) return null;
        if (cfg.scoring === SCORING.STABLEFORD) return row.stableford;
        return cfg.netMode === NET_MODE.GROSS ? row.gross : row.net;
    }

    // Компаратор: stableford — больше лучше; stroke — меньше лучше.
    // Тай-брейки: вторичная метрика → гросс → имя.
    function compareRows(a, b, cfg) {
        var am = metricOf(a, cfg), bm = metricOf(b, cfg);
        var stable = cfg.scoring === SCORING.STABLEFORD;
        if (am == null && bm == null) return str(a.name).localeCompare(str(b.name), 'ru');
        if (am == null) return 1;
        if (bm == null) return -1;
        if (am !== bm) return stable ? bm - am : am - bm;
        // вторичная метрика
        var as = cfg.netMode === NET_MODE.GROSS ? a.net : a.gross;
        var bs = cfg.netMode === NET_MODE.GROSS ? b.net : b.gross;
        if (as != null && bs != null && as !== bs) return stable ? bs - as : as - bs;
        if (a.gross != null && b.gross != null && a.gross !== b.gross) return a.gross - b.gross;
        return str(a.name).localeCompare(str(b.name), 'ru');
    }

    // Сортировка с местами (1,2,2,4). DQ/DNS — в конец без места.
    function withPositions(rows, cfg) {
        var ranked = rows.filter(isRanked).slice().sort(function (a, b) { return compareRows(a, b, cfg); });
        var unranked = rows.filter(function (r) { return !isRanked(r); });
        var prev = null;
        ranked.forEach(function (row, i) {
            var m = metricOf(row, cfg);
            var tie = prev && prev.metric === m && prev.net === row.net && prev.gross === row.gross;
            row.position = tie ? prev.position : (i + 1);
            row.metric = m;
            if (!tie) prev = { metric: m, net: row.net, gross: row.gross, position: row.position };
        });
        unranked.forEach(function (row) { row.position = null; row.metric = null; });
        return ranked.concat(unranked);
    }

    // ----------------------------------------------------------
    // Дивизионы и группы
    // ----------------------------------------------------------
    function divisionOf(player, cfg) {
        if (!cfg || !cfg.divisions || !cfg.divisions.length) return null;
        var hcp = player.handicap;
        if (hcp == null) return null;
        for (var i = 0; i < cfg.divisions.length; i++) {
            var d = cfg.divisions[i];
            if (d.gender && d.gender !== 'all' && d.gender !== player.gender) continue;
            var from = d.hcpFrom === '' || d.hcpFrom == null ? null : parseFloat(d.hcpFrom);
            var to = d.hcpTo === '' || d.hcpTo == null ? null : parseFloat(d.hcpTo);
            if (from != null && hcp < from - 0.001) continue;
            if (to != null && hcp > to + 0.001) continue;
            return d;
        }
        return null;
    }

    // ----------------------------------------------------------
    // Номинации (призовые места)
    // ----------------------------------------------------------
    // kind: 'gross' | 'net' | 'stableford'
    function nominationValue(row, kind) {
        if (kind === 'stableford') return row.stableford;
        return kind === 'gross' ? row.gross : row.net;
    }

    function buildNominations(rows, cfg) {
        var places = cfg.prizePlaces || 3;
        var genders = cfg.genderSplit ? ['men', 'women'] : ['all'];
        var kinds = cfg.scoring === SCORING.STABLEFORD ? ['stableford'] : ['gross', 'net'];
        var labels = {
            gross: cfg.scoring === SCORING.STABLEFORD ? 'Гросс' : 'Best Gross',
            net: 'Best Net',
            stableford: 'Best Stableford'
        };
        var out = [];
        kinds.forEach(function (kind) {
            genders.forEach(function (g) {
                var pool = rows.filter(function (r) {
                    return isRanked(r) && r.hasResult && nominationValue(r, kind) != null &&
                        (g === 'all' || r.gender === g);
                });
                if (!pool.length) return;
                pool.sort(function (a, b) {
                    var av = nominationValue(a, kind), bv = nominationValue(b, kind);
                    if (av !== bv) return kind === 'stableford' ? bv - av : av - bv;
                    return str(a.name).localeCompare(str(b.name), 'ru');
                });
                var top = pool.slice(0, places).map(function (r, i) {
                    var c = clone(r);
                    c.nomPosition = i + 1;
                    return c;
                });
                var genderLabel = g === 'men' ? ' · Мужчины' : g === 'women' ? ' · Женщины' : '';
                out.push({
                    id: kind + '-' + g,
                    kind: kind,
                    gender: g,
                    label: labels[kind] + genderLabel,
                    rows: top
                });
            });
        });
        return out;
    }

    // ----------------------------------------------------------
    // Сборка протокола
    // ----------------------------------------------------------
    // Общая сборка из готовых строк (любой источник: ручной ввод или раунды).
    // rows — массив строк buildRow; groups — [{ name, members: [pid] }].
    function assembleProtocol(rows, cfg, groups) {
        cfg = normalizeConfig(cfg);
        rows = (rows || []).map(clone);
        rows.forEach(function (r) {
            var div = divisionOf(r, cfg);
            if (div) { r.divisionId = div.id; r.divisionName = div.name; }
        });

        var absolute = withPositions(rows, cfg);

        // Зачёты: абсолют + (опц.) мужчины/женщины + дивизионы
        var scopes = [{ key: 'abs', name: 'Абсолютный зачёт', rows: absolute }];
        if (cfg.genderSplit) {
            ['men', 'women'].forEach(function (g) {
                var pool = absolute.filter(function (r) { return r.gender === g; });
                if (!pool.length) return;
                scopes.push({
                    key: 'gender:' + g,
                    name: g === 'men' ? 'Мужчины' : 'Женщины',
                    rows: withPositions(pool.map(clone), cfg)
                });
            });
        }
        cfg.divisions.forEach(function (d) {
            var pool = absolute.filter(function (r) { return r.divisionId === d.id; });
            if (!pool.length) return;
            var range = divisionRangeText(d);
            scopes.push({
                key: 'div:' + d.id,
                name: d.name + (range ? ' (' + range + ')' : ''),
                rows: withPositions(pool.map(clone), cfg)
            });
        });

        // По игровым группам (стартовый лист)
        var byPid = {};
        absolute.forEach(function (r) { byPid[r.pid] = r; });
        var perGroup = groups
            .filter(function (g) { return g && Array.isArray(g.members) && g.members.length; })
            .map(function (g, i) {
                var pool = g.members.map(function (pid) { return byPid[pid]; }).filter(function (r) { return !!r; });
                return {
                    key: 'group:' + i,
                    name: str(g.name) || ('Группа ' + (i + 1)),
                    rows: withPositions(pool.map(clone), cfg)
                };
            });

        var nominations = buildNominations(absolute, cfg);

        return {
            rows: absolute,
            scopes: scopes,
            perGroup: perGroup,
            nominations: nominations,
            meta: {
                scoring: cfg.scoring,
                netMode: cfg.netMode,
                prizePlaces: cfg.prizePlaces,
                participants: rows.length,
                withResults: absolute.filter(function (r) { return r.hasResult; }).length,
                generatedAt: Date.now()
            }
        };
    }

    // state = { players, results, cfg, groups }
    //   players  — массив нормализованных участников
    //   results  — { pid: { mode, holes{}, gross, stableford, net, status } } или null
    //   groups   — [{ name, members: [pid] }] игровые группы (необязательно)
    //   deps     — { fieldHcp, calcStats, holePar }
    function buildProtocol(state, deps) {
        var cfg = normalizeConfig(state && state.cfg);
        var players = normalizePlayers(state && state.players);
        var results = (state && state.results) || {};
        var groups = Array.isArray(state && state.groups) ? state.groups : [];
        var rows = players.map(function (p) {
            return buildRow(p, results[p.pid] || null, cfg, deps);
        });
        var protocol = assembleProtocol(rows, cfg, groups);
        protocol.meta.participants = players.length;
        return protocol;
    }

    function divisionRangeText(d) {
        var from = d.hcpFrom === '' || d.hcpFrom == null ? null : d.hcpFrom;
        var to = d.hcpTo === '' || d.hcpTo == null ? null : d.hcpTo;
        if (from == null && to == null) return '';
        if (from == null) return 'до ' + to;
        if (to == null) return 'от ' + from;
        return from + '–' + to;
    }

    // ----------------------------------------------------------
    // Экспорт
    // ----------------------------------------------------------
    function csvCell(v) {
        var s = String(v == null ? '' : v);
        if (/^[=+@]/.test(s) || (/^-/.test(s) && !isFinite(Number(s)))) s = "'" + s;
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function csv(rows, cols) {
        var columns = cols || ['position', 'name', 'handicap', 'fieldHcp', 'gross', 'net', 'stableford', 'status'];
        var head = columns.join(';');
        var lines = (rows || []).map(function (r) {
            return columns.map(function (c) { return csvCell(r[c]); }).join(';');
        });
        return '\ufeff' + head + '\n' + lines.join('\n');
    }

    function scoreText(row) {
        if (!row || !row.hasResult) return '—';
        if (row.stableford != null && row.gross == null) return String(row.stableford);
        if (row.net != null && row.gross != null) return row.gross + ' / ' + row.net;
        if (row.gross != null) return String(row.gross);
        if (row.net != null) return String(row.net);
        return '—';
    }

    // Печатный документ протокола (self-contained HTML для window.print).
    function protocolDocHtml(protocol, meta) {
        meta = meta || {};
        var esc = function (s) {
            return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
            });
        };
        var title = esc(meta.name || 'Протокол турнира');
        var sub = esc([meta.date, meta.scoringLabel, meta.participants != null ? meta.participants + ' участников' : '']
            .filter(function (x) { return !!x; }).join(' · '));
        var html = '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">' +
            '<title>' + title + '</title><style>' +
            'body{font-family:Inter,Arial,sans-serif;color:#14251a;margin:24px;font-size:13px}' +
            'h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:22px 0 8px}' +
            '.sub{color:#5b6b60;margin:0 0 18px}' +
            'table{border-collapse:collapse;width:100%;margin-bottom:10px}' +
            'th,td{border:1px solid #c9d4cc;padding:5px 8px;text-align:left}' +
            'th{background:#eef3ef;font-weight:600}' +
            'td.n,th.n{text-align:center;width:44px}' +
            '.prize{background:#fdf6e3;font-weight:700}' +
            '.st{color:#8a5a00}' +
            '@media print{body{margin:8mm}}' +
            '</style></head><body>';
        html += '<h1>' + title + '</h1><p class="sub">' + sub + '</p>';

        function table(rows, showPrize) {
            var out = '<table><thead><tr>' +
                '<th class="n">№</th><th>Игрок</th><th class="n">HCP</th><th class="n">Игр. HCP</th>' +
                '<th class="n">Gross</th><th class="n">Net</th><th class="n">Stbl</th><th>Статус</th>' +
                '</tr></thead><tbody>';
            rows.forEach(function (r) {
                var prize = showPrize && r.position != null && r.position <= (meta.prizePlaces || 3);
                out += '<tr' + (prize ? ' class="prize"' : '') + '>' +
                    '<td class="n">' + (r.position == null ? '—' : r.position) + '</td>' +
                    '<td>' + esc(r.name) + '</td>' +
                    '<td class="n">' + (r.handicap == null ? '—' : r.handicap) + '</td>' +
                    '<td class="n">' + (r.fieldHcp == null ? '—' : r.fieldHcp) + '</td>' +
                    '<td class="n">' + (r.gross == null ? '—' : r.gross) + '</td>' +
                    '<td class="n">' + (r.net == null ? '—' : r.net) + '</td>' +
                    '<td class="n">' + (r.stableford == null ? '—' : r.stableford) + '</td>' +
                    '<td' + (r.status !== 'ACTIVE' ? ' class="st"' : '') + '>' + esc(r.status) + '</td></tr>';
            });
            return out + '</tbody></table>';
        }

        // Призёры (топ-N абсолютного зачёта) — главный блок протокола
        var winners = protocol.rows.filter(function (r) { return r.position != null && r.position <= (meta.prizePlaces || 3); });
        if (winners.length) {
            html += '<h2>Призёры</h2>' + table(winners, true);
        }
        (protocol.scopes || []).forEach(function (s) {
            if (s.key === 'abs') return;
            html += '<h2>' + esc(s.name) + '</h2>' + table(s.rows, true);
        });
        (protocol.nominations || []).forEach(function (n) {
            html += '<h2>' + esc(n.label) + '</h2>' + table(n.rows, false);
        });
        (protocol.perGroup || []).forEach(function (g) {
            html += '<h2>' + esc(g.name) + '</h2>' + table(g.rows, true);
        });
        html += '<h2>Полный протокол</h2>' + table(protocol.rows, true);
        html += '</body></html>';
        return html;
    }

    return {
        VERSION: VERSION,
        SCORING: SCORING,
        NET_MODE: NET_MODE,
        STATUS: STATUS,
        defaultConfig: defaultConfig,
        defaultDivisions: defaultDivisions,
        normalizeConfig: normalizeConfig,
        validateConfig: validateConfig,
        normalizePlayer: normalizePlayer,
        normalizePlayers: normalizePlayers,
        normalizeTee: normalizeTee,
        parseImport: parseImport,
        importTemplateCsv: importTemplateCsv,
        genderNorm: genderNorm,
        statusNorm: statusNorm,
        divisionRangeText: divisionRangeText,
        divisionOf: divisionOf,
        buildRow: buildRow,
        metricOf: metricOf,
        compareRows: compareRows,
        withPositions: withPositions,
        buildNominations: buildNominations,
        assembleProtocol: assembleProtocol,
        buildProtocol: buildProtocol,
        csv: csv,
        scoreText: scoreText,
        protocolDocHtml: protocolDocHtml
    };
});
