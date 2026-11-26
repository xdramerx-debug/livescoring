// Shared Rusgolf AГР transport/parser used by the admin and round setup.
// Keep the network/proxy behaviour in one place so both flows interpret the
// official directory's HTML and r.jina.ai markdown responses identically.
(function (root) {
    'use strict';

    var SEARCH_BASE = 'https://hcp.rusgolf.ru/public/player/ru/?search=';

    function parseHcpValue(value) {
        var cleaned = String(value || '').replace(/\u00a0/g, '').replace(/\s+/g, '');
        if (!cleaned || cleaned === '—' || cleaned === '-') return null;
        cleaned = cleaned.replace(',', '.');
        var num = cleaned.charAt(0) === '+'
            ? -Math.abs(parseFloat(cleaned.substring(1)))
            : parseFloat(cleaned);
        return isNaN(num) ? null : num;
    }

    function makeResult(number, fio, gender, hcp, hcpDate) {
        var parts = String(fio || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
        return {
            number: String(number || '').replace(/\s+/g, '').toUpperCase(),
            fio: String(fio || '').replace(/\s+/g, ' ').trim(),
            lastName: parts[0] || '',
            firstName: parts[1] || '',
            middleName: parts.slice(2).join(' ') || '',
            nameParts: parts,
            gender: /^ж/i.test(String(gender || '').trim()) ? 'women' : 'men',
            genderRaw: String(gender || '').trim(),
            hcp: parseHcpValue(hcp),
            hcpDisplay: String(hcp || '').trim() || '—',
            hcpDate: String(hcpDate || '').trim()
        };
    }

    function parseHtmlTable(html) {
        if (!root.DOMParser) return { valid: false, rows: [] };
        var doc = new root.DOMParser().parseFromString(String(html || ''), 'text/html');
        var tables = doc.querySelectorAll('table');
        var rows = [];
        var foundHeader = false;
        tables.forEach(function (table) {
            var trs = table.querySelectorAll('tr');
            if (!trs.length) return;
            var headerText = (trs[0].textContent || '').toLowerCase();
            if (headerText.indexOf('фамилия') === -1 && headerText.indexOf('фио') === -1) return;
            foundHeader = true;
            trs.forEach(function (tr, index) {
                if (index === 0) return;
                var cells = tr.querySelectorAll('td');
                if (cells.length < 4) return;
                var number = (cells[0].textContent || '').trim();
                if (!/^[A-Za-z]{2}\s?\d{3,}$/.test(number)) return;
                rows.push(makeResult(number, cells[1].textContent, cells[2].textContent,
                    cells[3].textContent, cells[4] ? cells[4].textContent : ''));
            });
        });
        return { valid: foundHeader, rows: rows };
    }

    function parseMarkdownTable(text) {
        var lines = String(text || '').split(/\r?\n/);
        var hasHeader = lines.some(function (line) {
            return /^\|\s*№/.test(line) || (line.indexOf('Фамилия, Имя, Отчество') !== -1 && line.charAt(0) === '|');
        });
        if (!hasHeader) return { valid: false, rows: [] };
        var rows = [];
        lines.forEach(function (line) {
            if (line.charAt(0) !== '|') return;
            var cells = line.split('|').map(function (cell) { return cell.trim(); });
            if (cells.length >= 5 && /^[A-Za-z]{2}\s?\d{3,}$/.test(cells[1]) && /муж|жен/i.test(cells[3])) {
                rows.push(makeResult(cells[1], cells[2], cells[3], cells[4], cells[5] || ''));
            }
        });
        return { valid: true, rows: rows };
    }

    function parseResults(text) {
        if (!text) return { valid: false, rows: [] };
        var value = String(text);
        if (value.indexOf('<table') !== -1 || value.indexOf('<html') !== -1) {
            var html = parseHtmlTable(value);
            if (html.valid) return html;
        }
        return parseMarkdownTable(value);
    }

    // ── Сопоставление ФИО ────────────────────────────────────────────────
    // Одни и те же правила используют админка (js/admin-agr.js) и форма
    // создания раунда: сравнение по частям ФИО в любом порядке («Иван Иванов»
    // = «Иванов Иван Иванович»), а при включённых «Формах имён»
    // (js/name-variants.js, настройка settings/nameMatching) — ещё и формы
    // имени: Наташа = Наталья = Наталия.
    function normalizeName(value) {
        return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
    }

    function nameTokens(value) {
        var normalized = normalizeName(value);
        return normalized ? normalized.split(' ').filter(Boolean) : [];
    }

    function rowNameParts(row) {
        row = row || {};
        var parts = [];
        if (row.fio) parts = nameTokens(row.fio);
        if (!parts.length) parts = nameTokens([row.lastName, row.firstName, row.middleName].filter(Boolean).join(' '));
        return parts;
    }

    /**
     * Насколько ФИО из базы АГР подходит к введённому запросу:
     *   'strong' — совпали имя и фамилия (порядок слов не важен);
     *   'loose'  — совпала фамилия, а имя отличается формой/написанием
     *              (Наташа ≠ Наталья при выключенном автоприменении) — такого
     *              игрока нужно подтвердить вручную, как в админке;
     *   null     — не подходит.
     */
    function matchKind(query, row) {
        var local = nameTokens(query);
        var remote = rowNameParts(row);
        if (local.length < 2 || remote.length < 2) return null;

        // При запросе из 2 слов (имя+фамилия) отчество remote не участвует в
        // матчинге: иначе "Сергей Петров" ошибочно совпадает с "Волощук Сергей
        // Петрович" (отчество "Петрович" похоже на фамилию запроса).
        var remoteCore = (local.length === 2 && remote.length >= 3) ? remote.slice(0, 2) : remote;
        var remoteCoreFull = remoteCore.join(' ');

        var nm = (typeof root.NameVariants !== 'undefined' && root.NameVariants) ? root.NameVariants : null;
        var variant = null;
        if (nm && typeof nm.match === 'function' && nm.isOn && nm.isOn()) {
            variant = nm.match(local[0], local[local.length - 1], remoteCore[0], remoteCore[1] || '',
                local.join(' '), remoteCoreFull);
        }

        var everyLocalInRemote = local.every(function (token) { return remoteCore.indexOf(token) !== -1; });
        var remoteMainInLocal = remote.slice(0, 2).every(function (token) { return local.indexOf(token) !== -1; });
        if (everyLocalInRemote || remoteMainInLocal || variant === 'strong') return 'strong';

        // Fallback: точное совпадение всех токенов запроса в полном ФИО remote,
        // но только если ни один токен запроса не совпал ИСКЛЮЧИТЕЛЬНО с
        // отчеством (index >= 2). Это сохраняет защиту от ложного "Петров"~"Петрович".
        if (local.length === 2 && remote.length >= 3) {
            var everyInFull = local.every(function (token) { return remote.indexOf(token) !== -1; });
            var patronymicOnly = local.some(function (token) {
                return remote.indexOf(token) >= 2 && remoteCore.indexOf(token) === -1;
            });
            if (everyInFull && !patronymicOnly) return 'strong';
        }

        return variant === 'loose' ? 'loose' : null;
    }

    /** Сильное совпадение: в ФИО из базы есть и имя, и фамилия запроса. */
    function namesMatch(query, row) {
        return matchKind(query, row) === 'strong';
    }

    /** Варианты запроса: как ввели, обратный порядок и одна длинная часть (фамилия). */
    function queryVariants(query) {
        // В запрос идёт исходное написание (регистр сохраняем), нормализация — только для длины.
        var raw = String(query || '').trim().split(/\s+/).filter(Boolean);
        var out = [];
        var push = function (value) {
            var v = String(value || '').trim();
            if (v && out.indexOf(v) === -1) out.push(v);
        };
        push(String(query || '').trim());
        if (raw.length >= 2) {
            push(raw.slice().reverse().join(' '));
            var longest = raw.slice().sort(function (a, b) { return b.length - a.length; })[0];
            if (longest && longest.length >= 3) push(longest);
        }
        return out;
    }

    function dedupeRows(rows) {
        var seen = {}, out = [];
        (rows || []).forEach(function (row) {
            if (!row) return;
            var key = String(row.number || '') || (normalizeName(row.fio) + '|' + row.hcp);
            if (seen[key]) return;
            seen[key] = true;
            out.push(row);
        });
        return out;
    }

    // opts: { timeoutMs, gender, number }
    // → { rows, matches, unique, status: 'ok'|'none'|'ambiguous', queries }
    function searchByName(query, opts) {
        opts = opts || {};
        var variants = queryVariants(query);
        if (!variants.length) return Promise.resolve({ rows: [], matches: [], unique: null, status: 'none', queries: [] });
        var found = [];
        var attempted = [];
        var index = 0;
        // Транспорт берём из публичного API: страницы и тесты могут подменить
        // PestovoRusgolf.fetchViaProxy, поиск по ФИО продолжит работать.
        var transport = (root.PestovoRusgolf && root.PestovoRusgolf.fetchViaProxy) || fetchViaProxy;
        function attempt() {
            if (index >= variants.length) return Promise.resolve();
            var variant = variants[index++];
            attempted.push(variant);
            return transport(variant, 0, { timeoutMs: opts.timeoutMs }).then(function (result) {
                var rows = (result && result.rows) || [];
                var matches = rows.filter(function (row) { return row && row.hcp != null && matchKind(query, row); });
                if (matches.length) {
                    found = found.concat(matches);
                    return;
                }
                // Совпадений нет — пробуем следующий вариант написания.
                return attempt();
            }).catch(function () {
                // Прокси/сеть не ответили по первому варианту — пробуем дальше,
                // ошибку отдаём только если не ответил ни один.
                if (index >= variants.length) throw new Error(root.currentLang === 'en'
                    ? 'RUSGOLF is unavailable. Try again later.'
                    : 'RUSGOLF недоступен. Попробуйте позже.');
                return attempt();
            });
        }
        return attempt().then(function () {
            var matches = dedupeRows(found);
            if (opts.gender) {
                var byGender = matches.filter(function (row) { return !row.gender || row.gender === opts.gender; });
                if (byGender.length) matches = byGender;
            }
            if (opts.number) {
                var normalizedNumber = String(opts.number).replace(/\s+/g, '').toUpperCase();
                var byNumber = matches.filter(function (row) {
                    return String(row.number || '').replace(/\s+/g, '').toUpperCase() === normalizedNumber;
                });
                if (byNumber.length) matches = byNumber;
            }
            // Точные совпадения — первыми: человек выбирает из понятного списка,
            // как в админке (вкладка «RUSGOLF» → «Найти»).
            var exact = matches.filter(function (row) { return matchKind(query, row) === 'strong'; });
            matches.sort(function (a, b) {
                var ka = matchKind(query, a) === 'strong' ? 0 : 1;
                var kb = matchKind(query, b) === 'strong' ? 0 : 1;
                return ka - kb;
            });
            var unique = exact.length === 1 ? exact[0] : null;
            return {
                rows: dedupeRows(found),
                matches: matches,
                exact: exact,
                unique: unique,
                status: !matches.length ? 'none' : (unique ? 'ok' : 'ambiguous'),
                queries: attempted
            };
        });
    }

    function buildProxyList() {
        var proxies = [];
        var custom = '';
        try { custom = (root.localStorage.getItem('pestovo_rg_proxy') || '').trim(); } catch (e) { /* storage is optional */ }
        if (custom && custom.indexOf('{url}') !== -1) {
            proxies.push({ name: 'custom', build: function (target) { return custom.replace('{url}', encodeURIComponent(target)); } });
        }
        proxies.push({ name: 'r.jina.ai', build: function (target) { return 'https://r.jina.ai/' + target; } });
        proxies.push({ name: 'allorigins-raw', build: function (target) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(target); } });
        proxies.push({ name: 'codetabs', build: function (target) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(target); } });
        proxies.push({ name: 'corsproxy.org', build: function (target) { return 'https://corsproxy.org/?url=' + encodeURIComponent(target); } });
        proxies.push({ name: 'everyorigin-raw', build: function (target) { return 'https://everyorigin.jwvbremen.nl/api/raw?url=' + encodeURIComponent(target); } });
        return proxies;
    }

    // JSONP — обходит CORS (загружается как <script>). Основной fallback для github.io.
    function fetchViaJsonp(target, timeoutMs) {
        function jsonpOnce(name, buildUrl) {
            return new Promise(function (resolve, reject) {
                var done = false;
                var cbName = '__pestovoRusgolfJsonp_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
                var script = root.document && root.document.createElement ? root.document.createElement('script') : null;
                var timer = setTimeout(function () { cleanup(); if (!done) { done = true; reject(new Error('jsonp timeout')); } }, timeoutMs || 12000);
                function cleanup() {
                    clearTimeout(timer);
                    try { delete root[cbName]; } catch (e) { root[cbName] = undefined; }
                    if (script && script.parentNode) script.parentNode.removeChild(script);
                }
                root[cbName] = function (data) {
                    if (done) return;
                    done = true;
                    cleanup();
                    var contents = '';
                    if (data && typeof data === 'object') contents = data.contents || data.body || data.responseText || '';
                    else if (typeof data === 'string') contents = data;
                    if (!contents) { reject(new Error('jsonp empty')); return; }
                    var parsed = parseResults(contents);
                    if (!parsed.valid) { reject(new Error('jsonp unparseable')); return; }
                    resolve({ rows: parsed.rows, proxy: name });
                };
                if (!script) { cleanup(); reject(new Error('no document')); return; }
                script.src = buildUrl(cbName);
                script.onerror = function () { if (done) return; done = true; cleanup(); reject(new Error('jsonp error')); };
                (root.document.head || root.document.body || root.document.documentElement).appendChild(script);
            });
        }
        var endpoints = [
            { name: 'allorigins-jsonp', url: function (cb) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(target) + '&callback=' + encodeURIComponent(cb); } },
            { name: 'allorigins-jsonp2', url: function (cb) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(target) + '&callback=' + encodeURIComponent(cb) + '&disableCache=true'; } }
        ];
        return new Promise(function (resolve, reject) {
            var failed = 0;
            var done = false;
            endpoints.forEach(function (ep) {
                jsonpOnce(ep.name, ep.url).then(function (r) { if (!done) { done = true; resolve(r); } }).catch(function () {
                    failed++;
                    if (!done && failed >= endpoints.length) { done = true; reject(new Error('jsonp all failed')); }
                });
            });
        });
    }

    // Сначала пробуем серверную функцию rusgolfSearch (без CORS). При успехе
    // прокси не трогаем. При сбое/отсутствии — fetch-прокси и JSONP параллельно.
    function fetchViaProxy(query, attempt, opts) {
        var fnFactory = typeof root.pestovoFunctions === 'function' ? root.pestovoFunctions : null;
        var q = String(query || '').trim();
        var target = SEARCH_BASE + encodeURIComponent(q);
        var perProxyMs = (opts && opts.timeoutMs > 0) ? opts.timeoutMs : 25000;
        if (!q) return Promise.reject(new Error('empty query'));

        function fallback() {
            return new Promise(function (resolve, reject) {
                var failed = 0;
                var done = false;
                var attempts = [
                    fetchViaPublicProxies(query, attempt, opts),
                    fetchViaJsonp(target, perProxyMs)
                ];
                attempts.forEach(function (p) {
                    Promise.resolve(p).then(function (result) {
                        if (done) return;
                        done = true;
                        resolve(result);
                    }).catch(function () {
                        failed++;
                        if (!done && failed >= attempts.length) {
                            done = true;
                            reject(new Error(root.currentLang === 'en'
                                ? 'RUSGOLF is unavailable. Try again later.'
                                : 'RUSGOLF недоступен. Попробуйте позже.'));
                        }
                    });
                });
            });
        }

        if (!fnFactory) return fallback();
        return Promise.resolve()
            .then(function () { return fnFactory(); })
            .then(function (fns) { return fns.httpsCallable('rusgolfSearch')({ query: q }); })
            .then(function (res) {
                var parsed = parseResults(res && res.data && res.data.html);
                if (!parsed.valid) throw new Error('unparseable server response');
                return { rows: parsed.rows, proxy: 'server' };
            })
            .catch(function () { return fallback(); });
    }

    function fetchViaPublicProxies(query, attempt, opts) {
        opts = opts || {};
        var perProxyMs = opts.timeoutMs > 0 ? opts.timeoutMs : 25000;
        var target = SEARCH_BASE + encodeURIComponent(String(query || '').trim());
        var proxies = buildProxyList();
        var fetchFn = root.fetch;
        if (typeof fetchFn !== 'function') return Promise.reject(new Error('Fetch is unavailable'));
        if (!proxies.length) return Promise.reject(new Error('No Rusgolf proxies configured'));
        return new Promise(function (resolve, reject) {
            var done = false;
            var failed = 0;
            var controllers = [];
            var timers = [];
            function finish() {
                controllers.forEach(function (c) { if (c) { try { c.abort(); } catch (e) { /* уже завершён */ } } });
                timers.forEach(function (t) { clearTimeout(t); });
            }
            proxies.forEach(function (proxy) {
                var controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
                controllers.push(controller);
                timers.push(setTimeout(function () { if (controller) controller.abort(); }, perProxyMs));
                fetchFn(proxy.build(target), { signal: controller ? controller.signal : undefined })
                    .then(function (response) {
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.text();
                    })
                    .then(function (text) {
                        var parsed = parseResults(text);
                        if (!parsed.valid) throw new Error('unparseable response');
                        if (done) return;
                        done = true;
                        finish();
                        resolve({ rows: parsed.rows, proxy: proxy.name });
                    })
                    .catch(function () {
                        failed++;
                        if (!done && failed >= proxies.length) {
                            done = true;
                            finish();
                            reject(new Error(root.currentLang === 'en'
                                ? 'All Rusgolf search proxies are unavailable.'
                                : 'Все прокси поиска АГР недоступны.'));
                        }
                    });
            });
        });
    }

    root.PestovoRusgolf = {
        SEARCH_BASE: SEARCH_BASE,
        parseHcpValue: parseHcpValue,
        makeResult: makeResult,
        parseResults: parseResults,
        normalizeName: normalizeName,
        nameTokens: nameTokens,
        namesMatch: namesMatch,
        queryVariants: queryVariants,
        searchByName: searchByName,
        buildProxyList: buildProxyList,
        fetchViaProxy: fetchViaProxy
    };
})(typeof window !== 'undefined' ? window : globalThis);
