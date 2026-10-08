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

    function buildProxyList() {
        var proxies = [];
        var custom = '';
        try { custom = (root.localStorage.getItem('pestovo_rg_proxy') || '').trim(); } catch (e) { /* storage is optional */ }
        if (custom && custom.indexOf('{url}') !== -1) {
            proxies.push({ name: 'custom', build: function (target) { return custom.replace('{url}', encodeURIComponent(target)); } });
        }
        proxies.push({ name: 'r.jina.ai', build: function (target) { return 'https://r.jina.ai/' + target; } });
        proxies.push({ name: 'allorigins', build: function (target) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(target); } });
        proxies.push({ name: 'codetabs', build: function (target) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(target); } });
        return proxies;
    }

    // opts.timeoutMs — таймаут одного прокси (по умолчанию 25 с, как раньше).
    function fetchViaProxy(query, attempt, opts) {
        attempt = attempt || 0;
        opts = opts || {};
        var perProxyMs = opts.timeoutMs > 0 ? opts.timeoutMs : 25000;
        var target = SEARCH_BASE + encodeURIComponent(String(query || '').trim());
        var proxies = buildProxyList();
        var fetchFn = root.fetch;
        if (typeof fetchFn !== 'function') return Promise.reject(new Error('Fetch is unavailable'));
        return new Promise(function (resolve, reject) {
            var index = 0;
            function tryNext() {
                if (index >= proxies.length) {
                    reject(new Error(root.currentLang === 'en'
                        ? 'All Rusgolf search proxies are unavailable.'
                        : 'Все прокси поиска АГР недоступны.'));
                    return;
                }
                var proxy = proxies[index++];
                var controller = typeof root.AbortController === 'function' ? new root.AbortController() : null;
                var timer = setTimeout(function () { if (controller) controller.abort(); }, perProxyMs);
                fetchFn(proxy.build(target), { signal: controller ? controller.signal : undefined })
                    .then(function (response) {
                        if (!response.ok) throw new Error('HTTP ' + response.status);
                        return response.text();
                    })
                    .then(function (text) {
                        clearTimeout(timer);
                        var parsed = parseResults(text);
                        if (!parsed.valid) throw new Error('unparseable response');
                        resolve({ rows: parsed.rows, proxy: proxy.name });
                    })
                    .catch(function (error) {
                        clearTimeout(timer);
                        if (error && error.message === 'HTTP 429' && attempt < 2) {
                            setTimeout(function () { fetchViaProxy(query, attempt + 1, opts).then(resolve).catch(reject); }, 8000);
                            return;
                        }
                        tryNext();
                    });
            }
            tryNext();
        });
    }

    root.PestovoRusgolf = {
        SEARCH_BASE: SEARCH_BASE,
        parseHcpValue: parseHcpValue,
        makeResult: makeResult,
        parseResults: parseResults,
        buildProxyList: buildProxyList,
        fetchViaProxy: fetchViaProxy
    };
})(typeof window !== 'undefined' ? window : globalThis);
