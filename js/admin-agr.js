// js/admin-agr.js — интеграция с hcp.rusgolf.ru (база АГР России) в админке;
// вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули).
// Прокси-настройки, поиск игрока в АГР, сопоставление/обрезка ФИО
// (rgNamesMatch/rgGetFioKey/rgCutForRound), синхронизация гандикапов
// (rgPropagateHcpEverywhere). Внешние зависимости: runtime-глобалы admin.js
// (admJsStr, deletePlayer, hasAdminPanelAccess, loadAdmPlayers — вызовы из
// UI-событий, к моменту вызова admin.js загружен; loadAdmPlayers — guarded).
// rgNamesMatch зовёт impNormName из js/admin-players-excel.js (runtime).

// ==========================================
// ИНТЕГРАЦИЯ С hcp.rusgolf.ru (БАЗА АГР РОССИИ)
// ==========================================
var RG_SEARCH_BASE = 'https://hcp.rusgolf.ru/public/player/ru/?search=';
var rgLastResults = [];
var rgSyncState = { running: false, stop: false, stats: null };

function rgIsAdmin() {
    return hasAdminPanelAccess();
}

function rgGetCustomProxy() {
    try { return (localStorage.getItem('pestovo_rg_proxy') || '').trim(); } catch(e) { return ''; }
}

function rgBuildProxyList() {
    var proxies = [];
    var custom = rgGetCustomProxy();
    if (custom && custom.indexOf('{url}') !== -1) {
        proxies.push({
            name: 'custom',
            build: function(target) { return custom.replace('{url}', encodeURIComponent(target)); }
        });
    }
    proxies.push({ name: 'r.jina.ai', build: function(target) { return 'https://r.jina.ai/' + target; } });
    proxies.push({
        name: 'allorigins',
        build: function(target) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(target); }
    });
    proxies.push({
        name: 'codetabs',
        build: function(target) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(target); }
    });
    return proxies;
}

function rgParseHcpValue(s) {
    var cleaned = String(s || '').replace(/\u00a0/g, '').replace(/\s+/g, '');
    if (cleaned === '' || cleaned === '—' || cleaned === '-') return null;
    cleaned = cleaned.replace(',', '.');
    var num;
    if (cleaned.charAt(0) === '+') {
        num = -Math.abs(parseFloat(cleaned.substring(1)));
    } else {
        num = parseFloat(cleaned);
    }
    return isNaN(num) ? null : num;
}

function rgMakeResult(num, fio, gender, hi, hcpDate) {
    var fioParts = String(fio || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    // В базе АГР ФИО обычно: «Фамилия Имя Отчество»
    return {
        number: String(num || '').replace(/\s+/g, '').toUpperCase(),
        fio: String(fio || '').replace(/\s+/g, ' ').trim(),
        lastName: fioParts[0] || '',
        firstName: fioParts[1] || '',
        middleName: fioParts.slice(2).join(' ') || '',
        nameParts: fioParts,
        gender: /^ж/i.test(String(gender || '').trim()) ? 'women' : 'men',
        genderRaw: String(gender || '').trim(),
        hcp: rgParseHcpValue(hi),
        hcpDisplay: String(hi || '').trim() || '—',
        hcpDate: String(hcpDate || '').trim()
    };
}

/** Нормализует first/last name локального игрока, учитывая оба порядка: «Имя Фамилия» и «Фамилия Имя». */
function rgLocalNameParts(u) {
    u = u || {};
    var first = impNormName(u.firstName || '');
    var last = impNormName(u.lastName || '');
    var full = impNormName(u.name || ((u.firstName || '') + ' ' + (u.lastName || '')).trim());
    var parts = full ? full.split(' ').filter(Boolean) : [];
    if (!first && parts.length) first = parts[0];
    if (!last && parts.length > 1) last = parts[parts.length - 1];
    // Если firstName/lastName не заданы, parts[0] — либо имя, либо фамилия
    return { first: first, last: last, full: full, parts: parts };
}

/** Совпадение имён в обоих порядках: «Фамилия Имя» и «Имя Фамилия».
 *  Учитывает формы имён (Наташа = Наталья = Наталия) — режим задаётся в
 *  админке (вкладка «АГР» → «Формы имён»), см. js/name-variants.js.
 *  Режим «off» = прежнее поведение (только точное совпадение строк). */
function rgNamesMatch(localFirst, localLast, remoteFirst, remoteLast, localFull, remoteFull) {
    var legacy = rgNamesMatchLegacy(localFirst, localLast, remoteFirst, remoteLast, localFull, remoteFull);
    var nm = (typeof NameVariants !== 'undefined') ? NameVariants : null;
    if (!nm || !nm.isOn()) return legacy;
    var variant = nm.match(localFirst, localLast, remoteFirst, remoteLast, localFull, remoteFull);
    if (legacy === 'strong') return 'strong';
    if (variant === 'strong') return 'strong';
    if (legacy === 'loose' || variant === 'loose') return 'loose';
    return null;
}

/** Прежнее сравнение строк (без учёта форм имени) — режим «off». */
function rgNamesMatchLegacy(localFirst, localLast, remoteFirst, remoteLast, localFull, remoteFull) {
    var lf = impNormName(localFirst);
    var ll = impNormName(localLast);
    var rf = impNormName(remoteFirst);
    var rl = impNormName(remoteLast);
    var lFull = impNormName(localFull);
    var rFull = impNormName(remoteFull);

    if (lFull && rFull && lFull === rFull) return 'strong';

    // Прямое: Фамилия=Фамилия, Имя=Имя
    if (ll && rl && lf && rf && ll === rl && lf === rf) return 'strong';
    // Обратное: локально Имя Фамилия, в АГР Фамилия Имя (или наоборот)
    if (ll && rl && lf && rf && ll === rf && lf === rl) return 'strong';

    // Только фамилия + имя (одно из полей пустое)
    if (ll && rl && ll === rl && (!lf || !rf || lf === rf)) return lf && rf ? 'strong' : 'loose';
    if (ll && rf && ll === rf && (!lf || !rl || lf === rl)) return lf && rl ? 'strong' : 'loose';
    if (lf && rl && lf === rl && (!ll || !rf || ll === rf)) return ll && rf ? 'strong' : 'loose';

    // Совпадение по частям ФИО (порядок не важен)
    if (lFull && rFull) {
        var lp = lFull.split(' ').filter(Boolean);
        var rp = rFull.split(' ').filter(Boolean);
        if (lp.length >= 2 && rp.length >= 2) {
            var allLocalInRemote = lp.every(function(p) { return rp.indexOf(p) !== -1; });
            var allRemoteMainInLocal = rp.slice(0, 2).every(function(p) { return lp.indexOf(p) !== -1; });
            if (allLocalInRemote || allRemoteMainInLocal) return 'strong';
            // Общая фамилия (одна из частей)
            var shared = lp.filter(function(p) { return rp.indexOf(p) !== -1; });
            if (shared.length >= 1 && (lp.indexOf(rl) !== -1 || rp.indexOf(ll) !== -1 || shared.length >= 2)) {
                return shared.length >= 2 ? 'strong' : 'loose';
            }
        }
    }

    // Слабое: только фамилия
    if (ll && rl && ll === rl) return 'loose';
    if (ll && rf && ll === rf) return 'loose';
    if (lf && rl && lf === rl && lf.length > 2) return 'loose';

    return null;
}

function rgParseHtmlTable(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var tables = doc.querySelectorAll('table');
    var rows = [];
    var foundHeader = false;
    tables.forEach(function(table) {
        var trs = table.querySelectorAll('tr');
        if (!trs.length) return;
        var headerText = (trs[0].textContent || '').toLowerCase();
        if (headerText.indexOf('фамилия') === -1 && headerText.indexOf('фио') === -1) return;
        foundHeader = true;
        trs.forEach(function(tr, i) {
            if (i === 0) return;
            var tds = tr.querySelectorAll('td');
            if (tds.length < 4) return;
            var num = (tds[0].textContent || '').trim();
            if (!/^[A-Za-z]{2}\s?\d{3,}$/.test(num)) return;
            rows.push(rgMakeResult(num, tds[1].textContent, tds[2].textContent, tds[3].textContent, tds[4] ? tds[4].textContent : ''));
        });
    });
    return { valid: foundHeader, rows: rows };
}

function rgParseMarkdownTable(text) {
    var lines = String(text || '').split(/\r?\n/);
    var hasHeader = false;
    lines.forEach(function(l) {
        if (/^\|\s*№/.test(l) || (l.indexOf('Фамилия, Имя, Отчество') !== -1 && l.charAt(0) === '|')) hasHeader = true;
    });
    if (!hasHeader) return { valid: false, rows: [] };
    var rows = [];
    lines.forEach(function(l) {
        if (l.charAt(0) !== '|') return;
        var cells = l.split('|').map(function(c) { return c.trim(); });
        // cells: ['', num, fio, gender, hi, date, '']
        if (cells.length >= 5 && /^[A-Za-z]{2}\s?\d{3,}$/.test(cells[1]) && /муж|жен/i.test(cells[3])) {
            rows.push(rgMakeResult(cells[1], cells[2], cells[3], cells[4], cells[5] || ''));
        }
    });
    return { valid: true, rows: rows };
}

function rgParseResults(text) {
    if (!text) return { valid: false, rows: [] };
    if (text.indexOf('<table') !== -1 || text.indexOf('<html') !== -1) {
        var htmlRes = rgParseHtmlTable(text);
        if (htmlRes.valid) return { valid: true, rows: htmlRes.rows };
    }
    var mdRes = rgParseMarkdownTable(text);
    if (mdRes.valid) return { valid: true, rows: mdRes.rows };
    return { valid: false, rows: [] };
}

function rgFetchViaProxy(query, attempt) {
    attempt = attempt || 0;
    var target = RG_SEARCH_BASE + encodeURIComponent(query);
    var proxies = rgBuildProxyList();
    return new Promise(function(resolve, reject) {
        var i = 0;
        var tryNext = function() {
            if (i >= proxies.length) {
                reject(new Error(currentLang === 'en'
                    ? 'All CORS proxies are unavailable. Configure your own proxy in settings below.'
                    : 'Все прокси недоступны. Настройте свой прокси в блоке настроек ниже.'));
                return;
            }
            var p = proxies[i++];
            var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            var timer = setTimeout(function() { if (ctrl) ctrl.abort(); }, 25000);
            fetch(p.build(target), { signal: ctrl ? ctrl.signal : undefined })
                .then(function(resp) {
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    return resp.text();
                })
                .then(function(text) {
                    clearTimeout(timer);
                    var parsed = rgParseResults(text);
                    if (parsed.valid) {
                        resolve({ rows: parsed.rows, proxy: p.name });
                    } else {
                        throw new Error('unparseable response');
                    }
                })
                .catch(function(err) {
                    clearTimeout(timer);
                    if (err && (err.message === 'HTTP 429') && attempt < 2) {
                        setTimeout(function() {
                            rgFetchViaProxy(query, attempt + 1).then(resolve).catch(reject);
                        }, 8000);
                        return;
                    }
                    tryNext();
                });
        };
        tryNext();
    });
}

function rgMatchInList(players, result) {
    var found = null;
    var foundLoose = null;
    (players || []).some(function(p) {
        var u = p.data || {};
        var local = rgLocalNameParts(u);
        if (!local.full && !local.first && !local.last) return false;
        var match = rgNamesMatch(local.first, local.last, result.firstName, result.lastName, local.full, result.fio);
        if (match === 'strong') {
            found = p;
            return true;
        }
        if (match === 'loose' && !foundLoose) foundLoose = p;
        return false;
    });
    return found || foundLoose;
}

// ВСЕ локальные игроки, совпадающие с записью базы АГР (сначала сильные
// совпадения, при их отсутствии — нечёткие). Дедупликация по id.
// Возврат списка (а не одного первого) нужен, чтобы админ мог выбрать:
// обновить существующего игрока (какого именно, если их несколько)
// или добавить нового — иначе плодились дубли с разными гандикапами.
function rgFindLocalMatchesInList(players, result) {
    var strong = [];
    var loose = [];
    (players || []).forEach(function(p) {
        var u = p.data || {};
        var local = rgLocalNameParts(u);
        if (!local.full && !local.first && !local.last) return;
        var m = rgNamesMatch(local.first, local.last, result.firstName, result.lastName, local.full, result.fio);
        if (m === 'strong') strong.push(p);
        else if (m === 'loose') loose.push(p);
    });
    return strong.length ? strong : loose;
}

function rgFindLocalMatches(result) {
    var localUsers = typeof getKnownPlayersSync === 'function' ? (getKnownPlayersSync() || {}) : {};
    var players = Object.keys(localUsers).map(function(id) { return { id: id, data: localUsers[id] || {} }; });
    return rgFindLocalMatchesInList(players, result);
}

// Совместимость со старыми вызовами: первый найденный локальный игрок
function rgFindLocalMatch(result) {
    var all = rgFindLocalMatches(result);
    return all.length ? all[0] : null;
}

function rgShowStatus(html, cls) {
    var el = document.getElementById('rg-status');
    if (el) {
        el.innerHTML = html ? '<div class="imp-note ' + (cls || '') + '">' + html + '</div>' : '';
    }
}

function rgDoSearch(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    var input = document.getElementById('rg-search-input');
    var resultsEl = document.getElementById('rg-results');
    var btn = document.getElementById('rg-search-btn');
    var q = input ? input.value.trim() : '';
    if (!q) {
        toast(currentLang === 'en' ? '⚠ Enter surname or card number' : '⚠ Введите фамилию или номер карты', 'error');
        return;
    }
    if (resultsEl) resultsEl.innerHTML = '';
    rgShowStatus('<i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Searching RGA database (hcp.rusgolf.ru)...' : 'Идёт поиск в базе АГР (hcp.rusgolf.ru)...'));
    if (btn) btn.disabled = true;

    rgFetchViaProxy(q).then(function(res) {
        if (btn) btn.disabled = false;
        rgLastResults = res.rows;
        if (!res.rows.length) {
            rgShowStatus('<i class="fas fa-circle-question"></i> ' +
                (currentLang === 'en' ? 'Nothing found for «' : 'По запросу «') + q + (currentLang === 'en' ? '». Try surname only.' : '» ничего не найдено. Попробуйте только фамилию.'), 'imp-note-warn');
            return;
        }
        rgShowStatus('<i class="fas fa-check"></i> ' +
            (currentLang === 'en' ? 'Found: ' : 'Найдено: ') + '<b>' + res.rows.length + '</b>' +
            (currentLang === 'en' ? ' · via ' : ' · через ') + res.proxy, '');
        rgRenderResults(res.rows);
    }).catch(function(err) {
        if (btn) btn.disabled = false;
        rgShowStatus('<i class="fas fa-triangle-exclamation"></i> ' + err.message, 'imp-note-err');
    });
}

function rgRenderResults(rows) {
    var el = document.getElementById('rg-results');
    if (!el) return;

    impCollectPlayers(function(players) {
        var hasValid = rows.some(function(r){ return r.hcp != null; });
        var html = '';

        // Bulk toolbar: select all + bulk add button
        if (rows.length) {
            html += '<div class="rg-bulk-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;padding:12px 14px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:12px;">';
            html += '<label class="list-item" style="cursor:pointer;padding:8px 14px;display:flex;align-items:center;gap:10px;margin:0;background:rgba(255,255,255,0.03);border-radius:10px;user-select:none;">';
            html += '<input type="checkbox" id="rg-check-all" onchange="rgToggleAllResults(this)" style="width:20px;height:20px;cursor:pointer;">';
            html += '<span style="font-weight:700;font-size:13px;color:var(--white);">' + (currentLang === 'en' ? 'Select all' : 'Выбрать все') + '</span>';
            html += '</label>';
            html += '<button type="button" class="btn btn-g imp-big-btn" onclick="rgBulkAddSelected()" ' + (hasValid ? '' : 'disabled') + ' style="min-height:42px;">';
            html += '<i class="fas fa-users-plus"></i> <span>' + (currentLang === 'en' ? 'Add selected' : 'Добавить выбранных') + ' (<span id="rg-bulk-count">0</span>)</span>';
            html += '</button>';
            html += '</div>';
        }

        html += '<div class="rg-list">';
        rows.forEach(function(r, i) {
            var dups = rgFindLocalMatchesInList(players, r);
            var firstDup = dups.length ? dups[0] : null;
            var genderIcon = r.gender === 'women' ? '👩' : '👨';
            var hcpVal = r.hcp != null ? fmtExactHcp(r.hcp) : r.hcpDisplay;
            var hcpChanged = firstDup && r.hcp != null && firstDup.data.handicap != null && Math.abs((parseFloat(firstDup.data.handicap) || 0) - r.hcp) > 0.049;
            var isDisabled = r.hcp == null;
            var teeLabel = r.gender === 'women' ? '🟥 ' + (currentLang === 'en' ? 'Red tees' : 'Красные ти') : '🟦 ' + (currentLang === 'en' ? 'Blue tees' : 'Синие ти');

            html += '<div class="rg-card" style="display:flex;align-items:flex-start;gap:10px;">';
            html += '<input type="checkbox" class="rg-result-check" data-rg-idx="' + i + '" ' + (isDisabled ? 'disabled' : '') + ' onchange="rgUpdateBulkCount()" style="width:20px;height:20px;cursor:pointer;margin-top:6px;flex-shrink:0;">';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;">';
            html += '<div class="rg-main" style="flex:1;min-width:160px;">';
            html += '<div class="rg-name">' + genderIcon + ' ' + escapeHtml(r.fio) + '</div>';
            html += '<div class="rg-meta">💳 ' + escapeHtml(r.number) + ' · ' + (r.gender === 'women' ? (currentLang === 'en' ? 'Female' : 'Жен.') : (currentLang === 'en' ? 'Male' : 'Муж.')) +
                ' · ' + teeLabel +
                (r.hcpDate ? ' · ' + (currentLang === 'en' ? 'updated ' : 'обновлён ') + escapeHtml(r.hcpDate) : '') + '</div>';
            if (dups.length) {
                var dupNames = dups.map(function(d) { return escapeHtml(rgPlayerDisplayName(d)); }).join(', ');
                html += '<div class="rg-meta" style="color:var(--gold);">' + (currentLang === 'en' ? 'Already on site' : 'Уже есть на сайте') +
                    (dups.length > 1 ? ' (' + dups.length + ')' : '') + ': ' + dupNames + '</div>';
            }
            html += '</div>';
            html += '<div class="rg-hcp' + (hcpChanged ? ' rg-hcp-changed' : '') + '" style="flex-shrink:0;">' + escapeHtml(hcpVal) + '<span class="rg-hcp-label">HI</span></div>';
            html += '</div>';
            html += '<div class="rg-actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">';
            if (r.hcp == null) {
                html += '<span class="imp-badge imp-badge-err">⚠ ' + (currentLang === 'en' ? 'No HI in RGA base' : 'Нет HI в базе АГР') + '</span>';
            } else {
                // Выбор: обновить СУЩЕСТВУЮЩЕГО игрока (каждого из совпавших)
                // или добавить НОВОГО — чтобы не плодить дублей с разным HCP
                dups.forEach(function(d) {
                    var dIdAttr = admJsStr(d.id);
                    var oldH = d.data.handicap != null ? fmtExactHcp(d.data.handicap) : '—';
                    var dChanged = d.data.handicap != null && Math.abs((parseFloat(d.data.handicap) || 0) - r.hcp) > 0.049;
                    html += '<button type="button" class="btn btn-og btn-sm" onclick="rgUpdateLocalFromResults(' + i + ', \'' + dIdAttr + '\')"><i class="fas fa-rotate"></i> ' +
                        (dChanged
                            ? (currentLang === 'en' ? 'Update existing ' + escapeHtml(rgPlayerDisplayName(d)) + ': HCP ' + oldH + ' → ' + fmtExactHcp(r.hcp)
                                : 'Обновить существующего ' + escapeHtml(rgPlayerDisplayName(d)) + ': HCP ' + oldH + ' → ' + fmtExactHcp(r.hcp))
                            : (currentLang === 'en' ? 'Up to date: ' : 'HCP актуален: ') + escapeHtml(rgPlayerDisplayName(d))) + '</button>';
                });
                if (!dups.length) {
                    html += '<button type="button" class="btn btn-g btn-sm" onclick="rgAddFromResults(' + i + ')"><i class="fas fa-plus"></i> ' +
                        (currentLang === 'en' ? 'Add to site' : 'Добавить на сайт') + '</button>';
                } else {
                    // Дубликат предотвращён: одинаковое ФИО уже есть, предлагаем только обновить HCP и добавить отчество
                    // Кнопка "Добавить как нового" убрана чтобы не было похожих вариантов с разным HCP
                    html += '<span class="imp-badge imp-badge-dup" style="margin-left:6px;">' + (currentLang === 'en' ? 'Duplicate prevented - use update' : 'Дубликат предотвращён - используйте обновление') + '</span>';
                }
            }
            html += '</div>';
            html += '</div>';
            html += '</div>';
        });
        html += '</div>';
        el.innerHTML = html;
        rgUpdateBulkCount();
    });
}

function rgToggleAllResults(master) {
    var checks = document.querySelectorAll('.rg-result-check:not(:disabled)');
    checks.forEach(function(cb){ cb.checked = master.checked; });
    rgUpdateBulkCount();
}

function rgUpdateBulkCount() {
    var checked = document.querySelectorAll('.rg-result-check:checked');
    var label = document.getElementById('rg-bulk-count');
    if (label) label.textContent = String(checked.length);
    var master = document.getElementById('rg-check-all');
    if (master) {
        var all = document.querySelectorAll('.rg-result-check:not(:disabled)');
        var allCount = all.length;
        var checkedCount = checked.length;
        if (!allCount) {
            master.checked = false;
            master.indeterminate = false;
        } else if (checkedCount === 0) {
            master.checked = false;
            master.indeterminate = false;
        } else if (checkedCount === allCount) {
            master.checked = true;
            master.indeterminate = false;
        } else {
            master.checked = false;
            master.indeterminate = true;
        }
    }
}

/** Обрезка гандикапа для турнирного раунда: сначала tournaments/<id>/hcpCut,
 *  затем (legacy) protocols/<pid>/hcpCut. null — обрезки нет. */
function rgCutForRound(rd, tournaments, protocols) {
    if (rd && rd.tournamentId && tournaments && tournaments[rd.tournamentId] &&
        tournaments[rd.tournamentId].hcpCut && typeof tournaments[rd.tournamentId].hcpCut === 'object') {
        return tournaments[rd.tournamentId].hcpCut;
    }
    if (rd && rd.protocolId && protocols && protocols[rd.protocolId] &&
        protocols[rd.protocolId].hcpCut && typeof protocols[rd.protocolId].hcpCut === 'object') {
        return protocols[rd.protocolId].hcpCut;
    }
    return null;
}

/** Обновляет HCP и официальное ФИО игрока во всех местах: users, кэш, раунды, история, турниры. */
function rgPropagateHcpEverywhere(userId, r, playerData) {
    if (r == null || r.hcp == null) return Promise.resolve();
    var hcp = r.hcp;
    var gender = (playerData && playerData.gender) || r.gender || 'men';
    var remoteFirst = String(r.firstName || '').trim();
    var remoteMiddle = String(r.middleName || '').trim();
    var remoteLast = String(r.lastName || '').trim();
    var hasOfficialName = !!(remoteFirst && remoteLast);
    var officialName = hasOfficialName ? rgAgrNameSiteOrder(r) : '';
    var updates = {
        handicap: hcp,
        hcpUpdatedAt: Date.now(),
        hcpSource: 'rusgolf'
    };
    if (r.number) updates.rusgolfNumber = r.number;
    if (r.hcpDate) updates.rusgolfHcpDate = r.hcpDate;

    // ФИО в автодобавлении должно совпадать с последней записью АГР. Обновляем
    // все части вместе, а не только добавляем отсутствующее отчество: так также
    // корректно применяются исправления имени или фамилии.
    if (hasOfficialName) {
        updates.name = officialName;
        updates.firstName = remoteFirst;
        updates.middleName = remoteMiddle;
        updates.lastName = remoteLast;
    }

    var applyLocalUpdate = function(cur) {
        cur = cur || {};
        Object.keys(updates).forEach(function(key) { cur[key] = updates[key]; });
        return cur;
    };

    if (typeof cachedRegisteredUsers !== 'undefined') {
        if (cachedRegisteredUsers[userId]) {
            cachedRegisteredUsers[userId] = applyLocalUpdate(cachedRegisteredUsers[userId]);
        } else if (playerData) {
            cachedRegisteredUsers[userId] = applyLocalUpdate(Object.assign({}, playerData));
        }
        try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch (e) { console.warn("[silent]", e); }
    }
    try {
        var custom = {};
        var existing = localStorage.getItem('pestovo_custom_players');
        if (existing) custom = JSON.parse(existing) || {};
        if (custom[userId]) {
            custom[userId] = applyLocalUpdate(custom[userId]);
            localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
        }
    } catch (e) { console.warn("[silent]", e); }

    if (typeof db === 'undefined') return Promise.resolve();

    var fbUpdates = {};
    Object.keys(updates).forEach(function(key) {
        fbUpdates['users/' + userId + '/' + key] = updates[key];
    });

    return Promise.all([
        db.ref('rounds').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; }),
        db.ref('tournaments').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; }),
        db.ref('users/' + userId + '/history').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; }),
        db.ref('protocols').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; })
    ]).then(function(res) {
        var rounds = res[0];
        var tournaments = res[1];
        var history = res[2];
        var protocols = res[3] || {};

        Object.keys(rounds).forEach(function(rid) {
            var rd = rounds[rid];
            if (!rd || !rd.players) return;
            Object.keys(rd.players).forEach(function(pid) {
                var p = rd.players[pid];
                if (!p || pid !== userId) return;
                var tee = p.tee || rd.tee || 'wh';
                var g = p.gender || gender;
                // Турнирный раунд: точный гандикап пересчитываем С УЧЁТОМ обрезки
                // турнира, чтобы после смены HCP игрок попал в правильную группу.
                var isTn = (typeof isTournamentRound === 'function') ? isTournamentRound(rd) : !!(rd.tournamentId || rd.protocolId);
                var cut = isTn ? rgCutForRound(rd, tournaments, protocols) : null;
                var exact = hcp;
                if (cut && typeof tnApplyHcpCut === 'function') {
                    try { exact = tnApplyHcpCut(hcp, g, cut).effective; } catch (e) { console.warn("[silent]", e); }
                }
                var fieldHcp = (typeof getFieldHcp === 'function') ? getFieldHcp(exact, tee, g) : Math.round(exact);
                var playerPath = 'rounds/' + rid + '/players/' + pid + '/';
                fbUpdates[playerPath + 'exactHcp'] = exact;
                if (isTn || p.exactHcpRaw !== undefined) fbUpdates[playerPath + 'exactHcpRaw'] = hcp;
                fbUpdates[playerPath + 'fieldHcp'] = fieldHcp;
                if (hasOfficialName) {
                    fbUpdates[playerPath + 'name'] = officialName;
                    fbUpdates[playerPath + 'firstName'] = remoteFirst;
                    fbUpdates[playerPath + 'middleName'] = remoteMiddle;
                    fbUpdates[playerPath + 'lastName'] = remoteLast;
                }
            });
        });

        Object.keys(tournaments).forEach(function(tid) {
            var tn = tournaments[tid];
            if (!tn || !tn.registeredPlayers) return;
            Object.keys(tn.registeredPlayers).forEach(function(pid) {
                var rp = tn.registeredPlayers[pid];
                if (!rp) return;
                var sameId = pid === userId || (rp.uid && rp.uid === userId);
                if (!sameId) return;
                var playerPath = 'tournaments/' + tid + '/registeredPlayers/' + pid + '/';
                fbUpdates[playerPath + 'handicap'] = hcp;
                if (hasOfficialName) {
                    fbUpdates[playerPath + 'name'] = officialName;
                    fbUpdates[playerPath + 'firstName'] = remoteFirst;
                    fbUpdates[playerPath + 'middleName'] = remoteMiddle;
                    fbUpdates[playerPath + 'lastName'] = remoteLast;
                }
            });
        });

        Object.keys(history).forEach(function(hKey) {
            var h = history[hKey];
            if (!h) return;
            var tee = h.tee || 'wh';
            var g = h.gender || gender;
            var fieldHcp = (typeof getFieldHcp === 'function') ? getFieldHcp(hcp, tee, g) : Math.round(hcp);
            var historyPath = 'users/' + userId + '/history/' + hKey + '/';
            fbUpdates[historyPath + 'exactHcp'] = hcp;
            fbUpdates[historyPath + 'fieldHcp'] = fieldHcp;
            if (hasOfficialName) {
                fbUpdates[historyPath + 'name'] = officialName;
                fbUpdates[historyPath + 'firstName'] = remoteFirst;
                fbUpdates[historyPath + 'middleName'] = remoteMiddle;
                fbUpdates[historyPath + 'lastName'] = remoteLast;
            }
        });

        return db.ref().update(fbUpdates);
    }).catch(function(err) {
        console.warn('rgPropagateHcpEverywhere:', err);
        return db.ref('users/' + userId).update(updates);
    });
}

function rgUpdateHcpOfSilent(userId, r, playerData) {
    return rgPropagateHcpEverywhere(userId, r, playerData);
}

function rgBulkAddSelected() {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var checks = document.querySelectorAll('.rg-result-check:checked');
    if (!checks.length) {
        toast(currentLang === 'en' ? '⚠ Select at least one player' : '⚠ Выберите хотя бы одного игрока', 'error');
        return;
    }
    var indices = [];
    checks.forEach(function(cb){
        var v = parseInt(cb.getAttribute('data-rg-idx'));
        if (!isNaN(v)) indices.push(v);
    });

    var added = 0, updated = 0, skipped = 0;
    var seenIds = {};

    indices.forEach(function(idx){
        var r = rgLastResults[idx];
        if (!r || r.hcp == null) { skipped++; return; }
        var uniqKey = (r.number || '') + '|' + (r.fio || '');
        if (seenIds[uniqKey]) { skipped++; return; }
        seenIds[uniqKey] = true;

        var existing = rgFindLocalMatch(r);
        if (existing) {
            rgUpdateHcpOfSilent(existing.id, r, existing.data);
            updated++;
        } else {
            rgCreateNewPlayerFromAgr(r);
            added++;
        }
    });

    var msg = '✅ ' + (currentLang === 'en' ? 'Bulk add: ' : 'Массовое добавление: ') +
        added + ' ' + (currentLang === 'en' ? 'added' : 'добавлено') +
        ', ' + updated + ' ' + (currentLang === 'en' ? 'updated' : 'обновлено') +
        (skipped ? ', ' + skipped + ' ' + (currentLang === 'en' ? 'skipped' : 'пропущено') : '');
    toast(msg, 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    rgRenderResults(rgLastResults);
}

// Имя в порядке сайта: «Имя [Отчество] Фамилия» (в базе АГР — «Фамилия Имя Отчество»)
function rgAgrNameSiteOrder(r) {
    var parts = [r.firstName, r.middleName, r.lastName].map(function(s) { return String(s || '').trim(); }).filter(Boolean);
    return parts.join(' ') || (r.fio || 'Игрок');
}

// Создаёт НОВУЮ запись игрока из результата базы АГР.
// Сохраняет имя, фамилию, ОТЧЕСТВО и гандикап (отчество — отдельно в middleName).
function rgCreateNewPlayerFromAgr(r) {
    var baseName = rgAgrNameSiteOrder(r) || r.fio || 'player';
    var norm = impNormName(baseName).replace(/\s+/g, '_');
    var numPart = String(r.number || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    var newId = 'user_' + norm + (numPart ? '_' + numPart : '') + '_' + Date.now().toString().slice(-6);
    if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[newId]) {
        newId = newId + '_' + Math.random().toString(36).substring(2,4);
    }
    var playerData = {
        name: rgAgrNameSiteOrder(r),
        firstName: r.firstName || '',
        lastName: r.lastName || '',
        middleName: r.middleName || '',
        email: '',
        handicap: r.hcp,
        gender: r.gender,
        defaultTee: r.gender === 'women' ? 'rd' : 'bl',
        role: 'player',
        createdAt: Date.now(),
        roundsPlayed: 0,
        bestGross: null,
        bestStableford: null,
        rusgolfNumber: r.number,
        rusgolfHcpDate: r.hcpDate,
        hcpUpdatedAt: Date.now(),
        hcpSource: 'rusgolf'
    };
    impSaveLocalPlayer(newId, playerData);
    if (typeof db !== 'undefined') {
        db.ref('users/' + newId).set(playerData).catch(function(err) {
            console.warn('RUSGOLF player save notice:', err);
        });
    }
    return { id: newId, name: playerData.name };
}

function rgAddFromResults(idx) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgLastResults[idx];
    if (!r) return;
    if (r.hcp == null) {
        toast(currentLang === 'en' ? '⚠ This player has no HI in the RGA base' : '⚠ У этого игрока нет HI в базе АГР', 'error');
        return;
    }
    // Если похожий игрок уже есть на сайте — НЕ создаём дубль: обновляем его HCP.
    // Чтобы создать вторую запись, есть отдельная кнопка «Добавить как нового игрока».
    var existing = rgFindLocalMatch(r);
    if (existing) {
        rgUpdateHcpOf(existing.id, r);
        return;
    }

    var created = rgCreateNewPlayerFromAgr(r);
    toast('🎉 ' + (currentLang === 'en' ? 'Player ' : 'Игрок ') + created.name + (currentLang === 'en' ? ' added (HCP ' : ' добавлен (HCP ') + fmtExactHcp(r.hcp) + ')', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    rgRenderResults(rgLastResults);
}

// Обновляет HCP конкретного СУЩЕСТВУЮЩЕГО игрока, выбранного из совпадений
function rgUpdateLocalFromResults(idx, userId) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgLastResults[idx];
    if (!r || r.hcp == null || !userId) return;
    rgUpdateHcpOf(userId, r);
}

// Добавляет игрока как НОВОГО, даже если похожие записи уже есть на сайте
function rgAddAsNewFromResults(idx) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgLastResults[idx];
    if (!r) return;
    if (r.hcp == null) {
        toast(currentLang === 'en' ? '⚠ This player has no HI in the RGA base' : '⚠ У этого игрока нет HI в базе АГР', 'error');
        return;
    }
    var created = rgCreateNewPlayerFromAgr(r);
    toast('🎉 ' + (currentLang === 'en' ? 'Player ' : 'Игрок ') + created.name + (currentLang === 'en' ? ' added as NEW (HCP ' : ' добавлен как новый (HCP ') + fmtExactHcp(r.hcp) + ')', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    rgRenderResults(rgLastResults);
}

function rgUpdateHcpOf(userId, r, playerData) {
    var localData = playerData || (typeof cachedRegisteredUsers !== 'undefined' ? cachedRegisteredUsers[userId] : null) || {};
    toast('🔄 ' + (currentLang === 'en' ? 'HCP updated: ' : 'Гандикап обновлён: ') + (r.fio || localData.name || '') + ' → ' + fmtExactHcp(r.hcp), 'success');
    rgPropagateHcpEverywhere(userId, r, localData).then(function() {
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();
    }).catch(function(err) {
        toast('⚠️ ' + (currentLang === 'en' ? 'Save error: ' : 'Ошибка сохранения: ') + (err && err.message ? err.message : err), 'error');
    });
    if (rgLastResults && rgLastResults.length) rgRenderResults(rgLastResults);
}

function rgUpdateFromResults(idx) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgLastResults[idx];
    if (!r || r.hcp == null) return;
    var existing = rgFindLocalMatch(r);
    if (existing) rgUpdateHcpOf(existing.id, r);
}

// -------- МАССОВАЯ СИНХРОНИЗАЦИЯ ---------

function rgSyncProgressHtml(cur, total, stats) {
    var pct = total ? Math.round((cur / total) * 100) : 0;
    var html = '<div class="rg-progress-wrap">';
    html += '<div class="rg-progress"><div class="rg-progress-fill" style="width:' + pct + '%;"></div></div>';
    html += '<div class="rg-progress-text">' + (currentLang === 'en' ? 'Processed ' : 'Обработано ') + cur + '/' + total +
        ' · <span style="color:#2ecc71;">' + (currentLang === 'en' ? 'updated ' : 'обновлено ') + (stats.updatedList ? stats.updatedList.length : stats.updated) + '</span>' +
        ' · <span style="color:var(--muted);">' + (currentLang === 'en' ? 'actual ' : 'актуально ') + (stats.actualList ? stats.actualList.length : stats.actual) + '</span>' +
        ' · <span style="color:var(--gold);">' + (currentLang === 'en' ? 'need choice ' : 'выбор ') + stats.conflicts.length + '</span>' +
        ' · <span style="color:var(--red);">' + (currentLang === 'en' ? 'not found ' : 'не найдено ') + (stats.notFoundList ? stats.notFoundList.length : stats.notFound) + '</span>' +
        (stats.noHcpList && stats.noHcpList.length ? ' · <span style="color:var(--muted);">' + (currentLang === 'en' ? 'no HI ' : 'нет HI ') + stats.noHcpList.length + '</span>' : '') +
        '</div>';
    html += '</div>';
    return html;
}

function rgPlayerDisplayName(p) {
    if (!p) return '—';
    var u = p.data || {};
    return u.name || ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || p.id || '—';
}

function rgGetFioKey(u) {
    if (!u) return '';
    // С учётом форм имени: «Наташа Смирнова» и «Смирнова Наталия» — один ключ.
    // Отчество в ключ не входит (отец/сын разделяются rgSplitByPatronymic).
    if (typeof NameVariants !== 'undefined' && NameVariants.isOn()) {
        var vk = NameVariants.groupKey(u);
        if (vk) return vk;
    }
    var fn = (u.firstName || '').toString().trim();
    var mn = (u.middleName || '').toString().trim();
    var ln = (u.lastName || '').toString().trim();
    var name = (u.name || '').toString().trim();
    var combined = (fn + ' ' + mn + ' ' + ln).replace(/\s+/g, ' ').trim() || name;
    return impNormName(combined);
}

function rgFindDuplicateGroups(allPlayers) {
    var groups = {};
    (allPlayers || []).forEach(function(p) {
        var u = p.data || {};
        var key = rgGetFioKey(u);
        if (!key) return;
        if (!groups[key]) groups[key] = { key: key, displayName: rgPlayerDisplayName(p), players: [] };
        groups[key].players.push(p);
    });
    var result = [];
    Object.keys(groups).forEach(function(k) {
        var g = groups[k];
        // «Иванов Иван Иванович» и «Иванов Иван Петрович» — разные люди,
        // поэтому группу с одинаковым именем+фамилией делим по отчеству.
        rgSplitByPatronymic(g.players).forEach(function(sub) {
            if (sub.length > 1) {
                result.push({ key: k, displayName: rgPlayerDisplayName(sub[0]), players: sub });
            }
        });
    });
    return result;
}

/** Делит игроков с одинаковым именем+фамилией на подгруппы по отчеству. */
function rgSplitByPatronymic(players) {
    var nm = (typeof NameVariants !== 'undefined') ? NameVariants : null;
    if (!nm || !nm.isOn()) return [players || []];
    var out = [];
    (players || []).forEach(function(p) {
        var data = p.data || {};
        for (var i = 0; i < out.length; i++) {
            var clash = out[i].some(function(q) { return nm.patronymicClash(data, q.data || {}); });
            if (!clash) { out[i].push(p); return; }
        }
        out.push([p]);
    });
    return out;
}

function rgRenderDuplicateGroups(groups) {
    if (!groups || !groups.length) return '';
    var en = currentLang === 'en';
    var html = '<div class="card" style="border:2px solid var(--red);background:rgba(224,90,74,0.08);margin-top:18px;">';
    html += '<h3 style="color:var(--red);font-size:15px;margin-bottom:10px;"><i class="fas fa-clone"></i> ' + (en ? 'Duplicate names - choose handicap' : 'Одинаковые ФИО - выберите гандикап') + ' (' + groups.length + ')</h3>';
    html += '<p style="color:var(--muted);font-size:12px;margin-bottom:14px;">' + (en ? 'Same first/last/middle names with different handicaps were found. Use "Change handicap" to set correct HCP for each, or delete extra duplicates.' : 'Найдены игроки с одинаковыми именем, фамилией и отчеством, но разными гандикапами. Используйте "Изменить гандикап" чтобы указать у кого какой HCP, или удалите лишние дубликаты.') + '</p>';
    groups.forEach(function(g, gi) {
        html += '<div style="margin-bottom:16px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:10px;">';
        html += '<div style="font-weight:800;color:var(--white);margin-bottom:8px;">' + escapeHtml(g.displayName) + ' <span style="color:var(--muted);font-weight:400;">(' + g.players.length + ')</span></div>';
        g.players.forEach(function(pl, pi) {
            var u = pl.data || {};
            var curHcp = u.handicap != null ? fmtExactHcp(u.handicap) : '—';
            var safeId = String(pl.id).replace(/'/g, "\\'");
            var inputId = 'rg-dup-hcp-' + gi + '-' + pi;
            html += '<div class="list-item" style="padding:10px;gap:10px;flex-wrap:wrap;">';
            html += '<div style="flex:1;min-width:160px;"><strong style="color:var(--gold);">' + escapeHtml(rgPlayerDisplayName(pl)) + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);">ID: ' + escapeHtml(pl.id) + (u.rusgolfNumber ? ' · 💳 ' + escapeHtml(u.rusgolfNumber) : '') + '</div></div>';
            html += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
            html += '<span style="font-size:12px;color:var(--muted);">' + (en ? 'Current HCP' : 'Текущий HCP') + ': <b>' + curHcp + '</b></span>';
            html += '<input type="text" id="' + inputId + '" class="form-input" style="width:90px;padding:6px 8px;font-size:13px;" placeholder="' + curHcp + '" value="' + (u.handicap!=null? String(u.handicap).replace('+','') : '') + '">';
            html += '<button class="btn btn-g btn-sm" onclick="rgChangeDuplicateHcp(\'' + safeId + '\', \'' + inputId + '\')"><i class="fas fa-rotate"></i> ' + (en ? 'Change HCP' : 'Изменить гандикап') + '</button>';
            html += '<button class="btn btn-r btn-sm" onclick="deletePlayer(\'' + safeId + '\', \'' + admJsStr(u.name) + '\')"><i class="fas fa-trash"></i></button>';
            html += '</div></div>';
        });
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function rgChangeDuplicateHcp(userId, inputId) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var inp = document.getElementById(inputId);
    if (!inp) return;
    var raw = inp.value.trim();
    if (!raw) {
        toast(currentLang === 'en' ? '⚠ Enter new HCP' : '⚠ Введите новый HCP', 'error');
        return;
    }
    var parsed = (typeof impParseHcpStrict === 'function') ? impParseHcpStrict(raw) : null;
    var newHcp;
    if (parsed && parsed.val != null) newHcp = parsed.val;
    else newHcp = (typeof parseExactHcp === 'function') ? parseExactHcp(raw) : parseFloat(raw);
    if (newHcp == null || isNaN(newHcp)) {
        toast(currentLang === 'en' ? '⚠ Invalid HCP' : '⚠ Некорректный HCP', 'error');
        return;
    }
    if (typeof db === 'undefined') {
        if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[userId]) {
            cachedRegisteredUsers[userId].handicap = newHcp;
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch (e) { console.warn("[silent]", e); }
        }
        toast('✅ HCP ' + fmtExactHcp(newHcp) + ' ' + (currentLang === 'en' ? 'set for ' : 'установлен для ') + userId, 'success');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        return;
    }
    db.ref('users/' + userId).update({ handicap: newHcp, hcpUpdatedAt: Date.now(), hcpSource: 'manual' }).then(function(){
        return db.ref('rounds').once('value');
    }).then(function(sn){
        var rounds = sn.val() || {};
        var updates = {};
        Object.keys(rounds).forEach(function(rid){
            var rd = rounds[rid];
            if (!rd || !rd.players || !rd.players[userId]) return;
            var tee = rd.players[userId].tee || rd.tee || 'wh';
            var g = rd.players[userId].gender || 'men';
            var fieldHcp = (typeof getFieldHcp === 'function') ? getFieldHcp(newHcp, tee, g) : Math.round(newHcp);
            updates['rounds/' + rid + '/players/' + userId + '/exactHcp'] = newHcp;
            updates['rounds/' + rid + '/players/' + userId + '/fieldHcp'] = fieldHcp;
        });
        if (Object.keys(updates).length) return db.ref().update(updates);
    }).then(function(){
        toast('✅ HCP ' + fmtExactHcp(newHcp) + ' ' + (currentLang === 'en' ? 'updated for ' : 'обновлён у ') + userId, 'success');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        impCollectPlayers(function(all){
            var dups = rgFindDuplicateGroups(all);
            var el = document.getElementById('rg-sync-manual');
            if (el && dups.length) {
                var existing = document.getElementById('rg-duplicates-block');
                var html = '<div id="rg-duplicates-block">' + rgRenderDuplicateGroups(dups) + '</div>';
                if (existing) existing.outerHTML = html;
                else el.insertAdjacentHTML('beforeend', html);
            }
        });
    }).catch(function(err){
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}



function rgSyncResultListsHtml(stats) {
    var en = currentLang === 'en';
    var sections = [
        { key: 'updatedList', title: en ? 'Updated' : 'Обновлено', color: '#2ecc71', icon: 'fa-rotate', empty: en ? 'No updates' : 'Нет обновлений',
          row: function(item) {
              return escapeHtml(item.name) + ' · HCP ' +
                  (item.oldHcp != null ? fmtExactHcp(item.oldHcp) : '—') + ' → <b>' + fmtExactHcp(item.newHcp) + '</b>' +
                  (item.rusgolfNumber ? ' <span class="rg-meta">💳 ' + escapeHtml(item.rusgolfNumber) + '</span>' : '');
          }
        },
        { key: 'actualList', title: en ? 'Already up to date' : 'Уже актуально', color: 'var(--muted)', icon: 'fa-check', empty: en ? 'None' : 'Нет',
          row: function(item) {
              return escapeHtml(item.name) + ' · HCP <b>' + (item.hcp != null ? fmtExactHcp(item.hcp) : '—') + '</b>';
          }
        },
        { key: 'notFoundList', title: en ? 'Not found in RGA' : 'Не найдено в базе АГР', color: 'var(--red)', icon: 'fa-circle-xmark', empty: en ? 'All found' : 'Все найдены',
          row: function(item) {
              return escapeHtml(item.name) + (item.query ? ' <span class="rg-meta">«' + escapeHtml(item.query) + '»</span>' : '');
          }
        },
        { key: 'noHcpList', title: en ? 'Found but no HI' : 'Найден, но нет HI', color: 'var(--gold)', icon: 'fa-triangle-exclamation', empty: '',
          row: function(item) {
              return escapeHtml(item.name) + (item.fio ? ' → ' + escapeHtml(item.fio) : '');
          }
        }
    ];
    var html = '<div class="rg-sync-results" style="margin-top:16px;">';
    sections.forEach(function(sec) {
        var list = stats[sec.key] || [];
        if (!list.length && sec.key === 'noHcpList') return;
        html += '<div class="rg-sync-section" style="margin-bottom:14px;">';
        html += '<div style="font-weight:800;font-size:14px;color:' + sec.color + ';margin-bottom:8px;"><i class="fas ' + sec.icon + '"></i> ' +
            sec.title + ' <span style="opacity:.8;">(' + list.length + ')</span></div>';
        if (!list.length) {
            html += '<p style="color:var(--muted);font-size:12px;margin:0 0 8px;">' + sec.empty + '</p>';
        } else {
            html += '<div class="rg-sync-list">';
            list.forEach(function(item) {
                html += '<div class="rg-sync-row" style="padding:8px 12px;border:1px solid var(--border);border-left:3px solid ' + sec.color +
                    ';border-radius:8px;margin-bottom:6px;background:rgba(255,255,255,0.03);font-size:13px;color:var(--white);">' +
                    sec.row(item) + '</div>';
            });
            html += '</div>';
        }
        html += '</div>';
    });
    html += '</div>';
    return html;
}

function rgBuildSearchQuery(u) {
    var local = rgLocalNameParts(u);
    var rawName = String(u.name || '').replace(/\s+/g, ' ').trim();
    var rawFirst = String(u.firstName || '').trim();
    var rawLast = String(u.lastName || '').trim();
    // АГР ищет лучше по «Фамилия Имя»
    if (rawLast && rawFirst) return rawLast + ' ' + rawFirst;
    if (local.last && local.first) {
        // Если name = «Имя Фамилия» (как в solo: lastName + ' ' + firstName наоборот),
        // last/first из полей надёжнее. Иначе берём name as-is.
        return (rawLast || local.last) + ' ' + (rawFirst || local.first);
    }
    if (rawName) {
        var parts = rawName.split(' ');
        // Пробуем оба порядка: если 2+ слова, ищем как есть (часто «Фамилия Имя» в solo)
        return rawName;
    }
    return rawLast || rawFirst || '';
}

/**
 * Список запросов к базе АГР: сначала «как записано на сайте», затем —
 * с полными (паспортными) формами имени («Наташа» → «Наталья», «Наталия»),
 * в конце — обратный порядок слов. Запросы пробуются по очереди и только
 * если предыдущий ничего не нашёл, поэтому лишнего трафика почти нет.
 */
function rgBuildSearchQueries(u) {
    var local = rgLocalNameParts(u);
    var first = (u && u.firstName) || local.first;
    var last = (u && u.lastName) || local.last;
    var nm = (typeof NameVariants !== 'undefined') ? NameVariants : null;
    var mode = nm ? nm.getMode() : 'off';
    var list = [];

    var primary = rgBuildSearchQuery(u);
    if (primary) list.push(primary);
    if (nm && nm.isOn()) {
        (nm.queryVariants(first, last) || []).forEach(function(q) { list.push(q); });
    }
    if (local.first && local.last) {
        var primaryIsLastFirst = impNormName(primary).indexOf(local.last) === 0;
        list.push(primaryIsLastFirst ? (first + ' ' + last) : (last + ' ' + first));
    }

    var seen = {}, out = [];
    list.forEach(function(q) {
        var clean = String(q || '').replace(/\s+/g, ' ').trim();
        var k = impNormName(clean);
        if (!k || seen[k]) return;
        seen[k] = true;
        out.push(clean);
    });
    var limit = { off: 2, A: 3, B: 4, C: 5 }[mode] || 2;
    return out.slice(0, limit);
}

function rgClassifyRemoteMatches(u, rows) {
    var local = rgLocalNameParts(u);
    var strong = [];
    var loose = [];
    (rows || []).forEach(function(r) {
        var m = rgNamesMatch(local.first, local.last, r.firstName, r.lastName, local.full, r.fio);
        if (m === 'strong') strong.push(r);
        else if (m === 'loose') loose.push(r);
    });
    // Дедуп по номеру карты
    var dedupe = function(arr) {
        var seen = {};
        return arr.filter(function(r) {
            var k = (r.number || '') + '|' + impNormName(r.fio);
            if (seen[k]) return false;
            seen[k] = true;
            return true;
        });
    };
    return { strong: dedupe(strong), loose: dedupe(loose) };
}

function rgSyncStop() {
    rgSyncState.stop = true;
    var btn = document.getElementById('rg-sync-stop');
    if (btn) btn.classList.add('hidden');
    rgShowSyncProgressNote(currentLang === 'en' ? '⏹ Stopping after current player...' : '⏹ Останавливаю после текущего игрока...');
}

function rgShowSyncProgressNote(text) {
    var el = document.getElementById('rg-sync-progress');
    if (el) el.insertAdjacentHTML('beforeend', '<p style="color:var(--muted);font-size:12px;margin-top:6px;">' + text + '</p>');
}

// -------- ВЫБОР КАТЕГОРИИ СИНХРОНИЗАЦИИ ---------
// all — все игроки; notfound — не найденные в прошлый раз; new — новые
// (без HCP или ни разу не синхронизированные через АГР); stale — с
// устаревшими данными (синхронизация старше 30 дней); conflicts —
// требующие ручного выбора по итогам прошлого запуска.
var RG_SYNC_SCOPE_KEY = 'pestovo_rg_sync_scope';
var RG_LAST_SYNC_KEY = 'pestovo_rg_last_sync';

function rgGetSyncScope() {
    var sel = document.getElementById('rg-sync-scope');
    var v = sel ? sel.value : 'all';
    if (['all', 'notfound', 'new', 'stale', 'conflicts'].indexOf(v) === -1) v = 'all';
    try { localStorage.setItem(RG_SYNC_SCOPE_KEY, v); } catch (e) { console.warn("[silent]", e); }
    return v;
}

function rgRestoreSyncScope() {
    try {
        var v = localStorage.getItem(RG_SYNC_SCOPE_KEY) || 'all';
        var sel = document.getElementById('rg-sync-scope');
        if (sel) sel.value = v;
        return v;
    } catch (e) { return 'all'; }
}

function rgSyncScopeLabel(scope) {
    var en = currentLang === 'en';
    if (scope === 'notfound') return en ? 'not found last time' : 'не найденные в прошлый раз';
    if (scope === 'new') return en ? 'new players' : 'новые игроки';
    if (scope === 'stale') return en ? 'outdated data' : 'с устаревшими данными';
    if (scope === 'conflicts') return en ? 'need manual choice' : 'требующие выбора';
    return en ? 'all players' : 'все игроки';
}

function rgLoadLastSyncSummary() {
    try {
        var raw = localStorage.getItem(RG_LAST_SYNC_KEY);
        var v = raw ? JSON.parse(raw) : null;
        if (v && typeof v === 'object') {
            return {
                ts: v.ts || 0,
                notFound: Array.isArray(v.notFound) ? v.notFound : [],
                conflicts: Array.isArray(v.conflicts) ? v.conflicts : []
            };
        }
    } catch (e) { console.warn("[silent]", e); }
    return { ts: 0, notFound: [], conflicts: [] };
}

function rgSaveLastSyncSummary(stats) {
    try {
        var nf = (stats.notFoundList || []).map(function(item) {
            return { id: item.id || '', name: item.name || '' };
        });
        var cf = (stats.conflicts || []).filter(function(c) { return c && !c.resolved; }).map(function(c) {
            return { id: (c.player && c.player.id) || '', name: rgPlayerDisplayName(c.player) };
        });
        localStorage.setItem(RG_LAST_SYNC_KEY, JSON.stringify({ ts: Date.now(), notFound: nf, conflicts: cf }));
    } catch (e) { console.warn("[silent]", e); }
}

function rgInStoredList(p, storedList) {
    if (!storedList || !storedList.length) return false;
    var pid = p.id || '';
    var pname = rgPlayerDisplayName(p);
    var pnm = '';
    try { pnm = impNormName(pname); } catch (e) { pnm = String(pname || '').toLowerCase().trim(); }
    for (var i = 0; i < storedList.length; i++) {
        var st = storedList[i] || {};
        if (pid && st.id && st.id === pid) return true;
        var snm = '';
        try { snm = impNormName(st.name || ''); } catch (e2) { snm = String(st.name || '').toLowerCase().trim(); }
        if (pnm && snm && pnm === snm) return true;
    }
    return false;
}

function rgIsSyncNew(u) {
    u = u || {};
    if (u.handicap == null || u.handicap === '') return true;
    return !u.hcpUpdatedAt && u.hcpSource !== 'rusgolf' && !u.rusgolfNumber;
}

function rgIsSyncStale(u) {
    u = u || {};
    var ts = parseInt(u.hcpUpdatedAt, 10) || 0;
    if (!ts) return false;
    return (Date.now() - ts) > 30 * 86400000;
}

// Дедуп по ФИО (имя + отчество + фамилия), без учета HCP — чтобы не было сдваивания.
function rgDedupeSyncList(players) {
    var seenNames = {};
    var list = [];
    (players || []).forEach(function(p) {
        if (!p.data || !(p.data.name || p.data.firstName || p.data.lastName)) return;
        var key = rgGetFioKey(p.data) || impNormName(p.data.name || ((p.data.firstName || '') + ' ' + (p.data.lastName || '')));
        if (key && seenNames[key]) {
            var prev = seenNames[key];
            var preferNew = (!p.data.isGuest && prev.data.isGuest) || (p.data.email && !prev.data.email);
            if (preferNew) {
                list[prev.idx] = p;
                seenNames[key] = { idx: prev.idx, data: p.data };
            }
            return;
        }
        if (key) seenNames[key] = { idx: list.length, data: p.data };
        list.push(p);
    });
    return list;
}

function rgFilterSyncListByScope(list, scope) {
    if (scope === 'all' || !scope) return list;
    var last = rgLoadLastSyncSummary();
    if (scope === 'notfound') {
        return list.filter(function(p) { return rgInStoredList(p, last.notFound); });
    }
    if (scope === 'conflicts') {
        return list.filter(function(p) { return rgInStoredList(p, last.conflicts); });
    }
    if (scope === 'new') {
        return list.filter(function(p) { return rgIsSyncNew(p.data); });
    }
    if (scope === 'stale') {
        return list.filter(function(p) { return rgIsSyncStale(p.data); });
    }
    return list;
}

// Подсказка со счётчиками по каждой категории под кнопкой синхронизации.
function rgRefreshSyncScopeHint() {
    rgRestoreSyncScope();
    var hintEl = document.getElementById('rg-sync-scope-hint');
    if (!hintEl) return;
    var en = currentLang === 'en';
    hintEl.innerHTML = '<span style="color:var(--muted);font-size:12px;"><i class="fas fa-spinner fa-spin"></i> ' +
        (en ? 'Counting players…' : 'Считаю игроков…') + '</span>';
    try {
        impCollectPlayers(function(players) {
            var list = rgDedupeSyncList(players);
            var last = rgLoadLastSyncSummary();
            var cNew = 0, cStale = 0, cNf = 0, cCf = 0;
            list.forEach(function(p) {
                if (rgIsSyncNew(p.data)) cNew++;
                if (rgIsSyncStale(p.data)) cStale++;
                if (rgInStoredList(p, last.notFound)) cNf++;
                if (rgInStoredList(p, last.conflicts)) cCf++;
            });
            var bits = [
                (en ? 'Total: <b>' : 'Всего: <b>') + list.length + '</b>',
                (en ? 'New: <b>' : 'Новых: <b>') + cNew + '</b>',
                (en ? 'Not found last time: <b>' : 'Не найдено в прошлый раз: <b>') + cNf + '</b>',
                (en ? 'Need choice: <b>' : 'На выбор: <b>') + cCf + '</b>',
                (en ? 'Outdated: <b>' : 'Устаревших: <b>') + cStale + '</b>'
            ];
            hintEl.innerHTML = '<span style="color:var(--muted);font-size:12px;"><i class="fas fa-users"></i> ' +
                bits.join(' · ') + '</span>';
        });
    } catch (e) {
        hintEl.innerHTML = '';
    }
}

function rgSyncAll() {
    if (rgSyncState.running) return;
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var syncScope = rgGetSyncScope();
    var scopeTxt = rgSyncScopeLabel(syncScope);
    if (!confirm(currentLang === 'en'
        ? 'Check handicaps in the RGA database (' + scopeTxt + ')? With many players this may take several minutes.'
        : 'Проверить гандикапы в базе АГР (' + scopeTxt + ')? При большом списке это может занять несколько минут.')) return;

    impCollectPlayers(function(players) {
        var list = rgDedupeSyncList(players);

        if (!list.length) {
            toast(currentLang === 'en' ? 'No players found' : 'Игроки не найдены', 'error');
            return;
        }

        // Фильтр категории: только выбранные игроки (не найденные, новые и т.д.).
        list = rgFilterSyncListByScope(list, syncScope);
        if (!list.length) {
            toast(currentLang === 'en'
                ? 'No players in this category (' + scopeTxt + ')'
                : 'Нет игроков в этой категории (' + scopeTxt + ')', 'info');
            return;
        }

        rgSyncState = {
            running: true,
            stop: false,
            stats: {
                updated: 0,
                actual: 0,
                notFound: 0,
                noHcp: 0,
                conflicts: [],
                updatedList: [],
                actualList: [],
                notFoundList: [],
                noHcpList: []
            }
        };
        var stats = rgSyncState.stats;
        rgSyncConflictsRef = stats.conflicts;
        var progressEl = document.getElementById('rg-sync-progress');
        var manualEl = document.getElementById('rg-sync-manual');
        var resultsEl = document.getElementById('rg-sync-results');
        var syncBtn = document.getElementById('rg-sync-btn');
        var stopBtn = document.getElementById('rg-sync-stop');
        if (progressEl) progressEl.innerHTML = rgSyncProgressHtml(0, list.length, stats);
        if (manualEl) manualEl.innerHTML = '';
        if (resultsEl) resultsEl.innerHTML = '';
        if (syncBtn) syncBtn.disabled = true;
        if (stopBtn) stopBtn.classList.remove('hidden');

        var i = 0;
        var processed = 0;

        var refreshProgress = function() {
            if (!progressEl) return;
            var fill = progressEl.querySelector('.rg-progress-fill');
            if (fill) fill.style.width = Math.round((processed / list.length) * 100) + '%';
            var text = progressEl.querySelector('.rg-progress-text');
            if (text) {
                text.innerHTML = (currentLang === 'en' ? 'Processed ' : 'Обработано ') + processed + '/' + list.length +
                    ' · <span style="color:#2ecc71;">' + (currentLang === 'en' ? 'updated ' : 'обновлено ') + stats.updatedList.length + '</span>' +
                    ' · <span style="color:var(--muted);">' + (currentLang === 'en' ? 'actual ' : 'актуально ') + stats.actualList.length + '</span>' +
                    ' · <span style="color:var(--gold);">' + (currentLang === 'en' ? 'need choice ' : 'выбор ') + stats.conflicts.length + '</span>' +
                    ' · <span style="color:var(--red);">' + (currentLang === 'en' ? 'not found ' : 'не найдено ') + stats.notFoundList.length + '</span>';
            }
        };

        var renderConflicts = function() {
            if (!manualEl) return;
            if (!stats.conflicts.length) {
                if (!rgSyncState.running) return;
                return;
            }
            var html = '<h3 style="color:var(--gold);font-size:15px;margin:18px 0 10px;"><i class="fas fa-user-pen"></i> ' +
                (currentLang === 'en' ? 'Choose the right player (' : 'Выберите нужного игрока (') + stats.conflicts.length + ')</h3>';
            html += '<p style="color:var(--muted);font-size:12px;margin-bottom:12px;">' +
                (currentLang === 'en'
                    ? 'Several matches found — choose: update an existing player (which one) or add a new one.'
                    : 'Найдено несколько совпадений — выберите: обновить существующего игрока (какого именно) или добавить нового.') + '</p>';
            stats.conflicts.forEach(function(c, ci) {
                if (c.resolved) {
                    var resolvedNote = c.addedNew
                        ? (currentLang === 'en' ? ' — added as NEW player' : ' — добавлен как новый игрок')
                        : (c.resolvedHcp != null ? ' → HCP ' + fmtExactHcp(c.resolvedHcp) : '');
                    html += '<div class="rg-conflict" data-conflict-idx="' + ci + '"><div style="color:#2ecc71;font-weight:700;font-size:13px;padding:8px 0;"><i class="fas fa-check-circle"></i> ' +
                        escapeHtml(rgPlayerDisplayName(c.player)) + resolvedNote + '</div></div>';
                    return;
                }
                html += '<div class="rg-conflict" data-conflict-idx="' + ci + '">';
                html += '<div class="rg-conflict-title">' + escapeHtml(rgPlayerDisplayName(c.player)) +
                    ' <span class="rg-conflict-hcp">' + (c.player.data.handicap != null ? (currentLang === 'en' ? 'current HCP ' : 'текущий HCP ') + fmtExactHcp(c.player.data.handicap) : (currentLang === 'en' ? 'no HCP' : 'без HCP')) + '</span></div>';
                // 1) Несколько записей в базе АГР — выбрать, какая из них
                (c.candidates || []).forEach(function(r, ri) {
                    html += '<div class="rg-cand">';
                    html += '<div class="rg-cand-info"><b>' + escapeHtml(r.fio) + '</b><span class="rg-meta">💳 ' + escapeHtml(r.number) + ' · ' + (r.gender === 'women' ? 'Жен.' : 'Муж.') + (r.hcpDate ? ' · ' + escapeHtml(r.hcpDate) : '') + '</span></div>';
                    html += '<div class="rg-hcp">' + (r.hcp != null ? fmtExactHcp(r.hcp) : '—') + '<span class="rg-hcp-label">HI</span></div>';
                    html += '<button type="button" class="btn btn-g btn-sm" ' + (r.hcp == null ? 'disabled' : '') + ' onclick="rgResolveConflict(' + ci + ',' + ri + ')"><i class="fas fa-check"></i> ' + (currentLang === 'en' ? 'This one' : 'Это он') + '</button>';
                    html += '</div>';
                });
                // 2) Несколько ЛОКАЛЬНЫХ игроков с таким именем — выбрать, кого обновить
                (c.localCandidates || []).forEach(function(lc, li) {
                    html += '<div class="rg-cand" style="border-left:3px solid var(--gold);">';
                    html += '<div class="rg-cand-info"><b>' + escapeHtml(rgPlayerDisplayName(lc)) + '</b><span class="rg-meta">' + (currentLang === 'en' ? 'on site' : 'на сайте') + (lc.data.rusgolfNumber ? ' · 💳 ' + escapeHtml(lc.data.rusgolfNumber) : '') + '</span></div>';
                    html += '<div class="rg-hcp">' + (lc.data.handicap != null ? fmtExactHcp(lc.data.handicap) : '—') + '<span class="rg-hcp-label">HCP</span></div>';
                    html += '<button type="button" class="btn btn-g btn-sm" onclick="rgResolveLocalConflict(' + ci + ',' + li + ')"><i class="fas fa-rotate"></i> ' + (currentLang === 'en' ? 'Update this one' : 'Обновить этого') + '</button>';
                    html += '</div>';
                });
                // 3) Добавить как НОВОГО игрока (по найденной записи АГР)
                var remoteForNew = c.remote || (c.candidates || []).filter(function(x) { return x.hcp != null; })[0];
                if (remoteForNew && remoteForNew.hcp != null) {
                    html += '<div class="rg-cand" style="border-left:3px solid #2ecc71;">';
                    html += '<div class="rg-cand-info"><b>' + (currentLang === 'en' ? 'Add as a NEW player' : 'Добавить как нового игрока') + '</b><span class="rg-meta">' + escapeHtml(remoteForNew.fio || '') + (remoteForNew.number ? ' · 💳 ' + escapeHtml(remoteForNew.number) : '') + '</span></div>';
                    html += '<div class="rg-hcp">' + fmtExactHcp(remoteForNew.hcp) + '<span class="rg-hcp-label">HI</span></div>';
                    html += '<button type="button" class="btn btn-g btn-sm" onclick="rgResolveAddNew(' + ci + ')"><i class="fas fa-user-plus"></i> ' + (currentLang === 'en' ? 'Add new' : 'Добавить нового') + '</button>';
                    html += '</div>';
                }
                html += '</div>';
            });
            manualEl.innerHTML = html;
        };

        var finishAll = function() {
            rgSyncState.running = false;
            if (syncBtn) syncBtn.disabled = false;
            if (stopBtn) stopBtn.classList.add('hidden');
            renderConflicts();
            stats.updated = stats.updatedList.length;
            stats.actual = stats.actualList.length;
            stats.notFound = stats.notFoundList.length;
            stats.noHcp = stats.noHcpList.length;

            var listsHtml = rgSyncResultListsHtml(stats);
            // После синхронизации проверяем дубликаты по ФИО и предлагаем выбрать гандикап
            (function(statsCopy, listsHtmlCopy, progressElCopy, resultsElCopy) {
                impCollectPlayers(function(allPlayers) {
                    var dupGroups = rgFindDuplicateGroups(allPlayers);
                    var dupHtml = rgRenderDuplicateGroups(dupGroups);
                    if (resultsElCopy) {
                        resultsElCopy.innerHTML = listsHtmlCopy + dupHtml;
                    } else if (progressElCopy) {
                        progressElCopy.insertAdjacentHTML('beforeend', listsHtmlCopy + dupHtml);
                    }
                    if (dupGroups.length) {
                        var manualEl = document.getElementById('rg-sync-manual');
                        if (manualEl) {
                            if (!document.getElementById('rg-duplicates-block')) {
                                manualEl.insertAdjacentHTML('beforeend', '<div id="rg-duplicates-block">' + dupHtml + '</div>');
                            }
                        }
                    }
                });
            })(stats, listsHtml, progressEl, resultsEl);

            var msg = (currentLang === 'en' ? '✅ Sync finished: ' : '✅ Синхронизация завершена: ') +
                (currentLang === 'en' ? stats.updated + ' updated, ' : stats.updated + ' обновлено, ') +
                (currentLang === 'en' ? stats.actual + ' up to date, ' : stats.actual + ' актуально, ') +
                (currentLang === 'en' ? stats.conflicts.filter(function(c){return !c.resolved;}).length + ' to choose, ' : stats.conflicts.filter(function(c){return !c.resolved;}).length + ' на выбор, ') +
                (currentLang === 'en' ? stats.notFound + ' not found' : stats.notFound + ' не найдено');
            // Запоминаем «не найдено» и «на выбор» — их можно догнать отдельно.
            try { rgSaveLastSyncSummary(stats); } catch (eSave) { console.warn("[silent]", eSave); }
            try { rgRefreshSyncScopeHint(); } catch (eHint) { console.warn("[silent]", eHint); }
            toast(msg, 'success');
            if (progressEl) progressEl.insertAdjacentHTML('beforeend', '<p style="font-size:13px;font-weight:700;color:var(--gold);margin-top:8px;">' + msg + '</p>');
            if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
            if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();
        };

        var processNext = function() {
            if (rgSyncState.stop || i >= list.length) { finishAll(); return; }
            var p = list[i++];
            var u = p.data || {};
            var displayName = rgPlayerDisplayName(p);
            var local = rgLocalNameParts(u);
            // Список запросов: как записано → полные формы имени → обратный порядок слов.
            // Пример: «Смирнова Наташа» → «Смирнова Наташа», «Смирнова Наталья»,
            // «Смирнова Наталия», «Наташа Смирнова».
            var queries = rgBuildSearchQueries(u);
            if (!queries.length) queries = [displayName];
            var query = queries[0];

            var tryFetch = function(idx) {
                var q = queries[idx];
                if (!q) return Promise.reject(new Error('empty query'));
                return rgFetchViaProxy(q).then(function(res) {
                    var classified = rgClassifyRemoteMatches(u, res.rows);
                    if (!classified.strong.length && !classified.loose.length && idx + 1 < queries.length) {
                        return tryFetch(idx + 1);
                    }
                    return { res: res, classified: classified, usedQuery: q };
                });
            };

            // Применить найденную в АГР запись к локальному игроку.
            // ВАЖНО: если на сайте НЕСКОЛЬКО игроков с таким именем (обычно
            // с разными гандикапами) — не угадываем, а показываем выбор:
            // обновить существующего (какого именно) или добавить нового.
            var applyRemote = function(remoteRec) {
                var localMatches = rgFindLocalMatchesInList(players, remoteRec);
                if (localMatches.length > 1) {
                    stats.conflicts.push({ player: p, candidates: [], localCandidates: localMatches, remote: remoteRec });
                    renderConflicts();
                    return;
                }
                var target = localMatches.length ? localMatches[0] : p;
                var curHcp = (target.data.handicap != null && !isNaN(parseFloat(target.data.handicap))) ? parseFloat(target.data.handicap) : null;
                if (curHcp === null || Math.abs(curHcp - remoteRec.hcp) > 0.049) {
                    rgUpdateHcpOf(target.id, remoteRec, target.data);
                    stats.updatedList.push({
                        id: target.id,
                        name: rgPlayerDisplayName(target),
                        oldHcp: curHcp,
                        newHcp: remoteRec.hcp,
                        rusgolfNumber: remoteRec.number,
                        fio: remoteRec.fio
                    });
                    // Обновляем локальную копию, чтобы дедуп/последующие шаги видели новый HCP
                    if (target === p) u.handicap = remoteRec.hcp;
                } else {
                    stats.actualList.push({ id: target.id, name: rgPlayerDisplayName(target), hcp: curHcp, fio: remoteRec.fio });
                }
            };

            tryFetch(0).then(function(pack) {
                var strong = pack.classified.strong;
                var loose = pack.classified.loose;
                var usedQuery = pack.usedQuery;

                if (strong.length === 1 && strong[0].hcp != null) {
                    applyRemote(strong[0]);
                } else if (strong.length === 1 && strong[0].hcp == null) {
                    stats.noHcpList.push({ id: p.id, name: displayName, fio: strong[0].fio, number: strong[0].number });
                } else if (strong.length > 1) {
                    stats.conflicts.push({ player: p, candidates: strong, localCandidates: null, remote: null });
                    renderConflicts();
                } else if (loose.length === 1 && loose[0].hcp != null && local.first && local.last) {
                    // Одно нечёткое совпадение при полном ФИО — тоже обновляем
                    applyRemote(loose[0]);
                } else if (loose.length) {
                    stats.conflicts.push({ player: p, candidates: loose, localCandidates: null, remote: null });
                    renderConflicts();
                } else {
                    stats.notFoundList.push({ id: p.id, name: displayName, query: usedQuery });
                }
            }).catch(function() {
                stats.notFoundList.push({ id: p.id, name: displayName, query: query || displayName });
            }).then(function() {
                processed++;
                refreshProgress();
                setTimeout(processNext, 400);
            });
        };

        processNext();
    });
}

var rgSyncConflictsRef = [];
function rgResolveConflict(ci, ri) {
    var c = rgSyncConflictsRef[ci];
    if (!c) return;
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = c.candidates[ri];
    if (!r || r.hcp == null) return;
    rgUpdateHcpOf(c.player.id, r, c.player.data);
    c.resolved = true;
    c.resolvedHcp = r.hcp;
    if (rgSyncState && rgSyncState.stats && rgSyncState.stats.updatedList) {
        var oldHcp = c.player.data && c.player.data.handicap != null ? parseFloat(c.player.data.handicap) : null;
        rgSyncState.stats.updatedList.push({
            id: c.player.id,
            name: rgPlayerDisplayName(c.player),
            oldHcp: oldHcp,
            newHcp: r.hcp,
            rusgolfNumber: r.number,
            fio: r.fio
        });
    }
    var manualEl = document.getElementById('rg-sync-manual');
    var card = manualEl ? manualEl.querySelector('[data-conflict-idx="' + ci + '"]') : null;
    if (card) {
        card.innerHTML = '<div style="color:#2ecc71;font-weight:700;font-size:13px;padding:8px 0;"><i class="fas fa-check-circle"></i> ' +
            escapeHtml(rgPlayerDisplayName(c.player)) + ' → HCP ' + fmtExactHcp(r.hcp) + '</div>';
    }
}

// Конфликт «на сайте несколько игроков с одним именем»: выбрать, кого обновить
function rgResolveLocalConflict(ci, li) {
    var c = rgSyncConflictsRef[ci];
    if (!c || !rgIsAdmin()) return;
    var localCands = c.localCandidates || [];
    var lc = localCands[li];
    var remote = c.remote || (c.candidates && c.candidates[0]);
    if (!lc || !remote || remote.hcp == null) return;

    rgUpdateHcpOf(lc.id, remote, lc.data);
    c.resolved = true;
    c.resolvedHcp = remote.hcp;
    c.resolvedLocalId = lc.id;
    if (rgSyncState && rgSyncState.stats && rgSyncState.stats.updatedList) {
        var oldHcp = lc.data && lc.data.handicap != null ? parseFloat(lc.data.handicap) : null;
        rgSyncState.stats.updatedList.push({
            id: lc.id,
            name: rgPlayerDisplayName(lc),
            oldHcp: oldHcp,
            newHcp: remote.hcp,
            rusgolfNumber: remote.number,
            fio: remote.fio
        });
    }
    var manualEl = document.getElementById('rg-sync-manual');
    var card = manualEl ? manualEl.querySelector('[data-conflict-idx="' + ci + '"]') : null;
    if (card) {
        card.innerHTML = '<div style="color:#2ecc71;font-weight:700;font-size:13px;padding:8px 0;"><i class="fas fa-check-circle"></i> ' +
            (currentLang === 'en' ? 'Updated: ' : 'Обновлено: ') + escapeHtml(rgPlayerDisplayName(lc)) + ' → HCP ' + fmtExactHcp(remote.hcp) + '</div>';
    }
}

// Конфликт: добавить игрока как НОВОГО (по выбранной записи АГР)
function rgResolveAddNew(ci) {
    var c = rgSyncConflictsRef[ci];
    if (!c || !rgIsAdmin()) return;
    var remote = c.remote || (c.candidates || []).filter(function(x) { return x.hcp != null; })[0];
    if (!remote || remote.hcp == null) return;

    rgCreateNewPlayerFromAgr(remote);
    c.resolved = true;
    c.resolvedHcp = remote.hcp;
    c.addedNew = true;
    var msgNew = (currentLang === 'en' ? 'Added as new player: ' : 'Добавлен как новый игрок: ') + (remote.fio || '');
    if (typeof toast === 'function') toast('🎉 ' + msgNew + ' (HCP ' + fmtExactHcp(remote.hcp) + ')', 'success');
    var manualEl = document.getElementById('rg-sync-manual');
    var card = manualEl ? manualEl.querySelector('[data-conflict-idx="' + ci + '"]') : null;
    if (card) {
        card.innerHTML = '<div style="color:#2ecc71;font-weight:700;font-size:13px;padding:8px 0;"><i class="fas fa-check-circle"></i> ' +
            escapeHtml(rgPlayerDisplayName(c.player)) + ' — ' + (currentLang === 'en' ? 'added as NEW player' : 'добавлен как новый игрок') + ' (HCP ' + fmtExactHcp(remote.hcp) + ')</div>';
    }
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();
}

// -------- МАССОВАЯ ПРОВЕРКА ГАНДИКАПА ИЗ EXCEL ---------

// Каждая строка файла: { idx, firstName, lastName, name, query, proxy, error, done, results: [ {number,fio,...}, ... ] }
var rgBatchRows = [];
var rgBatchState = { running: false, stop: false };

function rgBatchHeaderKey(raw) {
    var s = impNormName(raw).replace(/[.:]/g, '');
    if (['имя', 'first name', 'firstname', 'first_name', 'given name'].indexOf(s) !== -1) return 'firstName';
    if (['фамилия', 'last name', 'lastname', 'last_name', 'surname', 'family name'].indexOf(s) !== -1) return 'lastName';
    if (['фио', 'имя фамилия', 'full name', 'фамилия имя отчество', 'игрок', 'player'].indexOf(s) !== -1) return 'fio';
    return null;
}

function rgBatchDownloadTemplate() {
    if (typeof XLSX === 'undefined') {
        toast(currentLang === 'en' ? '❌ Excel library not loaded (check internet)' : '❌ Библиотека Excel не загрузилась (проверьте интернет)', 'error');
        return;
    }
    var rows = [
        ['Имя', 'Фамилия'],
        ['Иван', 'Тестов'],
        ['Мария', 'Тестова']
    ];
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 28 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Игроки');
    XLSX.writeFile(wb, 'Shablon_Proverki_AGR.xlsx');
    toast('📋 ' + (currentLang === 'en' ? 'Template downloaded' : 'Шаблон скачан'), 'success');
}

function rgBatchParseRows(jsonRows) {
    var keys = {};
    var rows = [];
    if (jsonRows.length) {
        Object.keys(jsonRows[0]).forEach(function(h) {
            var k = rgBatchHeaderKey(h);
            if (k && !keys[k]) keys[k] = h;
        });
    }
    jsonRows.forEach(function(r, i) {
        var firstName = '', lastName = '', fio = '';
        if (keys.firstName) firstName = String(r[keys.firstName] || '').trim();
        if (keys.lastName) lastName = String(r[keys.lastName] || '').trim();
        if (keys.fio) fio = String(r[keys.fio] || '').trim();

        if ((!firstName || !lastName) && fio) {
            var fioParts = fio.split(/\s+/).filter(Boolean);
            if (!lastName) lastName = fioParts[0] || '';
            if (!firstName) firstName = fioParts.slice(1).join(' ') || '';
        }
        if (!firstName && lastName) { var s = impSplitName(lastName); firstName = s.firstName; lastName = s.lastName; }
        if (!lastName && firstName) { var s2 = impSplitName(firstName); firstName = s2.firstName; lastName = s2.lastName; }

        var name = (firstName + ' ' + lastName).replace(/\s+/g, ' ').trim();
        if (!name) return;
        rows.push({ idx: i, firstName: firstName, lastName: lastName, name: name });
    });
    // Дедуп по нормализованному имени
    var seen = {};
    return rows.filter(function(r) {
        var k = impNormName(r.name);
        if (seen[k]) return false;
        seen[k] = true;
        return true;
    });
}


// Чтение игроков из файла для проверки гандикапа: сканируем ВСЕ листы
// (как «Участники стартового листа») и все столбцы — имена ищутся по
// заголовкам «Имя/Фамилия/ФИО/Отчество…», а не только в первых двух
// колонках первой страницы. Возвращает [{idx, firstName, lastName, name, sheet}].
function rgBatchRowsFromWorkbook(wb) {
    var sheetNames = (wb && wb.SheetNames) ? wb.SheetNames.filter(function(n) { return !!wb.Sheets[n]; }) : [];
    var multi = sheetNames.length > 1;
    var rows = [];
    sheetNames.forEach(function(name, si) {
        var label = multi ? String(name || ('Лист ' + (si + 1))) : '';
        var parsed = null;
        try {
            if (typeof XLSX !== 'undefined' && typeof psParseExcelGrid === 'function') {
                var grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
                parsed = psParseExcelGrid(grid);
            }
        } catch (e) { parsed = null; }
        var valid = (parsed && parsed.valid && parsed.valid.length) ? parsed.valid : [];
        if (!valid.length) {
            // Заголовков/распознавания не хватило — пробуем простой разбор
            // (объекты по первой строке) как запасной вариант.
            try {
                var json = (typeof XLSX !== 'undefined') ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) : [];
                valid = rgBatchParseRows(json || []).map(function(r) {
                    return { firstName: r.firstName, lastName: r.lastName, middleName: '', name: r.name };
                });
            } catch (e2) { valid = []; }
        }
        valid.forEach(function(r) {
            var firstName = String((r && r.firstName) || '').trim();
            var lastName = String((r && r.lastName) || '').trim();
            var middleName = String((r && r.middleName) || '').trim();
            var name = (r && r.name) ? String(r.name).trim() : [firstName, middleName, lastName].filter(Boolean).join(' ');
            if (!name) return;
            rows.push({ idx: rows.length, firstName: firstName, lastName: lastName, middleName: middleName, name: name, sheet: label });
        });
    });
    // Дедуп по нормализованному ФИО: один игрок на нескольких листах — один раз.
    var seen = {};
    return rows.filter(function(r) {
        var k = impNormName(r.name);
        if (!k || seen[k]) return false;
        seen[k] = true;
        return true;
    });
}

function rgBatchHandleFile(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var statusEl = document.getElementById('rg-batch-status');
    var resultsEl = document.getElementById('rg-batch-results');

    if (typeof XLSX === 'undefined') {
        toast(currentLang === 'en' ? '❌ Excel library not loaded (check internet)' : '❌ Библиотека Excel не загрузилась (проверьте интернет)', 'error');
        input.value = '';
        return;
    }
    if (rgBatchState.running) {
        toast(currentLang === 'en' ? '⚠ Wait for the current search to finish' : '⚠ Дождитесь окончания текущего поиска', 'error');
        input.value = '';
        return;
    }

    if (statusEl) statusEl.innerHTML = '<p style="color:var(--muted);font-size:13px;"><i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Reading file...' : 'Чтение файла...') + '</p>';
    if (resultsEl) resultsEl.innerHTML = '';

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            var sheetNames = (wb.SheetNames || []).filter(function(n) { return !!wb.Sheets[n]; });
            if (!sheetNames.length) throw new Error(currentLang === 'en' ? 'no sheets' : 'нет листов в файле');
            // Все листы и все столбцы: имена находятся по заголовкам, а не
            // только в первых двух колонках первой страницы.
            var rows = rgBatchRowsFromWorkbook(wb);
            if (!rows.length) {
                if (statusEl) statusEl.innerHTML = '<div class="imp-note imp-note-err"><i class="fas fa-triangle-exclamation"></i> ' +
                    (currentLang === 'en' ? 'No player rows found on any sheet. Name columns (Имя / Фамилия / ФИО) are required.' : 'Строки с игроками не найдены ни на одном листе. Нужны столбцы с именами («Имя», «Фамилия», «ФИО»).') + '</div>';
                return;
            }
            if (statusEl) statusEl.innerHTML = '<div class="imp-note"><i class="fas fa-table-list"></i> ' +
                (currentLang === 'en'
                    ? 'Sheets: ' + sheetNames.length + ' · players found: ' + rows.length
                    : 'Листов: ' + sheetNames.length + ' · найдено игроков: ' + rows.length) + '</div>';
            rgBatchStartSearch(rows);
        } catch (err) {
            console.warn('RGA batch parse error:', err);
            if (statusEl) statusEl.innerHTML = '<div class="imp-note imp-note-err"><i class="fas fa-triangle-exclamation"></i> ' +
                (currentLang === 'en' ? 'Failed to read file: ' : 'Не удалось прочитать файл: ') + (err.message || err) + '</div>';
        }
        input.value = '';
    };
    reader.onerror = function() {
        if (statusEl) statusEl.innerHTML = '<div class="imp-note imp-note-err"><i class="fas fa-triangle-exclamation"></i> ' + (currentLang === 'en' ? 'File read error.' : 'Ошибка чтения файла.') + '</div>';
        input.value = '';
    };
    reader.readAsArrayBuffer(file);
}

/** Все запросы для строки таблицы: как записано + полные формы имени + обратный порядок. */
function rgBatchBuildQueries(row) {
    var list = rgBuildSearchQueries({ firstName: row.firstName, lastName: row.lastName, name: row.name });
    var q = list[0] || row.name;
    return { q: q, alt: list.slice(1) };
}

function rgBatchStartSearch(rows) {
    rgBatchState = { running: true, stop: false, players: null };
    rgBatchRows = rows.map(function(r) {
        return { idx: r.idx, firstName: r.firstName, lastName: r.lastName, name: r.name, sheet: r.sheet || '', query: '', proxy: '', error: '', done: false, results: [] };
    });

    var statusEl = document.getElementById('rg-batch-status');
    var resultsEl = document.getElementById('rg-batch-results');
    if (statusEl) statusEl.innerHTML = '';
    rgBatchRender(0, rows.length);

    var processed = 0;
    var total = rows.length;

    var processNext = function() {
        if (rgBatchState.stop || processed >= total) {
            rgBatchState.running = false;
            rgBatchRender(processed, total);
            if (statusEl) {
                var found = rgBatchRows.filter(function(r) { return r.done && r.results.length; }).length;
                var notFound = rgBatchRows.filter(function(r) { return r.done && !r.results.length && !r.error; }).length;
                statusEl.innerHTML = '<div class="imp-note"><i class="fas fa-check"></i> ' +
                    (currentLang === 'en' ? 'Search finished. Found: <b>' : 'Поиск завершён. Найдено: <b>') + found + '</b>' +
                    (currentLang === 'en' ? ' · Not found: <b>' : ' · Не найдено: <b>') + notFound + '</b></div>';
            }
            return;
        }
        var row = rgBatchRows[processed];
        var queries = rgBatchBuildQueries(row);
        row.query = queries.q;

        var allQueries = [queries.q].concat(queries.alt || []);
        var tryFetch = function(idx) {
            var q = allQueries[idx];
            if (!q) return Promise.reject(new Error('empty query'));
            return rgFetchViaProxy(q).then(function(res) {
                if (!res.rows.length && idx + 1 < allQueries.length) return tryFetch(idx + 1);
                return res;
            });
        };

        tryFetch(0).then(function(res) {
            row.query = queries.q;
            row.results = res.rows;
            row.proxy = res.proxy;
            row.done = true;
        }).catch(function(err) {
            row.error = err && err.message ? err.message : String(err);
            row.done = true;
        }).then(function() {
            processed++;
            rgBatchRender(processed, total);
            setTimeout(processNext, 350);
        });
    };

    processNext();
}

// Список игроков для пакетного поиска — с кэшем на время прогона: без него
// каждый перерендер rgBatchRender дёргал бы users+rounds из базы заново
// (десятки лишних чтений на один запуск). Сбрасывается при старте поиска
// и после любого добавления/обновления игрока из результатов.
function rgBatchGetPlayers(callback) {
    if (rgBatchState.players) { callback(rgBatchState.players); return; }
    impCollectPlayers(function(players) {
        rgBatchState.players = players || [];
        callback(rgBatchState.players);
    });
}

function rgBatchRender(processed, total) {
    var resultsEl = document.getElementById('rg-batch-results');
    if (!resultsEl) return;

    rgBatchGetPlayers(function(players) {
        var html = '';
        var pct = total ? Math.round((processed / total) * 100) : 0;
        var doneRows = rgBatchRows.filter(function(r) { return r.done; });
        var foundCount = doneRows.filter(function(r) { return r.results.length; }).length;

        html += '<div class="rg-progress-wrap" style="margin-top:14px;">' +
            '<div class="rg-progress"><div class="rg-progress-fill" style="width:' + pct + '%;"></div></div>' +
            '<div class="rg-progress-text">' + (currentLang === 'en' ? 'Processed ' : 'Обработано ') + processed + '/' + total +
            ' · <span style="color:#2ecc71;">' + (currentLang === 'en' ? 'found ' : 'найдено ') + foundCount + '</span></div></div>';

        // Toolbar: add selected + stop
        var selectable = rgBatchRows.some(function(r) { return r.results.some(function(x) { return x.hcp != null; }); });
        html += '<div class="rg-bulk-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:12px 0;padding:12px 14px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.25);border-radius:12px;">';
        html += '<label class="list-item" style="cursor:pointer;padding:8px 14px;display:flex;align-items:center;gap:10px;margin:0;background:rgba(255,255,255,0.03);border-radius:10px;user-select:none;">' +
            '<input type="checkbox" id="rg-batch-check-all" onchange="rgBatchToggleAll(this)" style="width:20px;height:20px;cursor:pointer;">' +
            '<span style="font-weight:700;font-size:13px;color:var(--white);">' + (currentLang === 'en' ? 'Select all found' : 'Выбрать всех найденных') + '</span></label>';
        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
        html += '<button type="button" class="btn btn-g imp-big-btn" onclick="rgBatchAddSelected()" ' + (selectable ? '' : 'disabled') + ' style="min-height:42px;">' +
            '<i class="fas fa-users-plus"></i> <span>' + (currentLang === 'en' ? 'Add selected' : 'Добавить выбранных') + ' (<span id="rg-batch-bulk-count">0</span>)</span></button>';
        html += '<button type="button" class="btn btn-r imp-big-btn ' + (rgBatchState.running ? '' : 'hidden') + '" onclick="rgBatchStop()" style="min-height:42px;">' +
            '<i class="fas fa-stop"></i> <span>' + (currentLang === 'en' ? 'Stop' : 'Остановить') + '</span></button>';
        html += '</div></div>';

        html += '<div class="rg-list">';
        rgBatchRows.forEach(function(row, ri) {
            if (!row.done) {
                html += '<div class="rg-card" style="opacity:.55;">' +
                    '<div style="flex:1;min-width:0;"><div class="rg-name">' + escapeHtml(row.name) + '</div>' +
                    '<div class="rg-meta"><i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Searching...' : 'Поиск...') + '</div></div></div>';
                return;
            }
            var statusBadge;
            if (row.error) {
                statusBadge = '<span class="imp-badge imp-badge-err">⚠ ' + (currentLang === 'en' ? 'Error' : 'Ошибка') + '</span>';
            } else if (!row.results.length) {
                statusBadge = '<span class="imp-badge" style="background:rgba(224,90,74,0.15);color:var(--red);">' + (currentLang === 'en' ? 'Not found' : 'Не найдено') + '</span>';
            } else {
                statusBadge = '<span class="imp-badge imp-badge-new">' + (currentLang === 'en' ? 'Found ' : 'Найдено ') + row.results.length + '</span>';
            }
            html += '<div class="rg-card" style="flex-direction:column;align-items:stretch;gap:8px;">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
                '<div style="font-weight:800;font-size:15px;color:var(--white);">' + escapeHtml(row.name) +
                (row.sheet ? ' <span class="imp-badge" style="font-weight:600;">' + escapeHtml(row.sheet) + '</span>' : '') +
                '</div>' + statusBadge + '</div>';
            if (row.error) {
                html += '<div class="rg-meta" style="color:var(--red);">' + escapeHtml(row.error) + '</div>';
            }
            if (row.query) {
                html += '<div class="rg-meta">' + (currentLang === 'en' ? 'Query: ' : 'Запрос: ') + '«' + escapeHtml(row.query) + '»</div>';
            }
            row.results.forEach(function(r, ii) {
                var dup = rgMatchInList(players, r);
                var genderIcon = r.gender === 'women' ? '👩' : '👨';
                var hcpVal = r.hcp != null ? fmtExactHcp(r.hcp) : r.hcpDisplay;
                var hcpChanged = dup && r.hcp != null && dup.data.handicap != null && Math.abs((parseFloat(dup.data.handicap) || 0) - r.hcp) > 0.049;
                var isDisabled = r.hcp == null;
                html += '<div style="display:flex;align-items:flex-start;gap:10px;border-top:1px solid var(--border);padding-top:10px;margin-top:2px;">';
                html += '<input type="checkbox" class="rg-batch-check" data-ri="' + ri + '" data-ii="' + ii + '" ' + (isDisabled ? 'disabled' : (r.selected ? 'checked' : '')) + ' onchange="rgBatchRowToggle(this)" style="width:20px;height:20px;cursor:pointer;margin-top:6px;flex-shrink:0;">';
                html += '<div style="flex:1;min-width:0;">';
                html += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;">';
                html += '<div class="rg-main" style="flex:1;min-width:160px;">';
                html += '<div class="rg-name">' + genderIcon + ' ' + escapeHtml(r.fio) + '</div>';
                html += '<div class="rg-meta">💳 ' + escapeHtml(r.number) + ' · ' + (r.gender === 'women' ? (currentLang === 'en' ? 'Female' : 'Жен.') : (currentLang === 'en' ? 'Male' : 'Муж.')) +
                    (r.hcpDate ? ' · ' + (currentLang === 'en' ? 'updated ' : 'обновлён ') + escapeHtml(r.hcpDate) : '') + '</div>';
                if (dup) html += '<div class="rg-meta" style="color:var(--gold);">' + (currentLang === 'en' ? 'Already on site' : 'Уже есть на сайте') + ': ' + escapeHtml(dup.data.name || dup.id) + '</div>';
                html += '</div>';
                html += '<div class="rg-hcp' + (hcpChanged ? ' rg-hcp-changed' : '') + '" style="flex-shrink:0;">' + escapeHtml(hcpVal) + '<span class="rg-hcp-label">HI</span></div>';
                html += '</div>';
                html += '<div class="rg-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">';
                if (r.hcp == null) {
                    html += '<span class="imp-badge imp-badge-err">⚠ ' + (currentLang === 'en' ? 'No HI in RGA base' : 'Нет HI в базе АГР') + '</span>';
                } else if (dup) {
                    html += '<button type="button" class="btn btn-og btn-sm" onclick="rgBatchUpdateOne(' + ri + ',' + ii + ')"><i class="fas fa-rotate"></i> ' +
                        (hcpChanged
                            ? (currentLang === 'en' ? 'Update HCP ' + fmtExactHcp(dup.data.handicap) + ' → ' + fmtExactHcp(r.hcp)
                                : 'Обновить HCP ' + fmtExactHcp(dup.data.handicap) + ' → ' + fmtExactHcp(r.hcp))
                            : (currentLang === 'en' ? 'HCP is up to date' : 'HCP актуален')) + '</button>';
                } else {
                    html += '<button type="button" class="btn btn-g btn-sm" onclick="rgBatchAddOne(' + ri + ',' + ii + ')"><i class="fas fa-plus"></i> ' +
                        (currentLang === 'en' ? 'Add to site' : 'Добавить на сайт') + '</button>';
                }
                html += '</div>';
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';
        });
        html += '</div>';
        resultsEl.innerHTML = html;
        rgBatchUpdateBulkCount();
    });
}

function rgBatchResult(ri, ii) {
    var row = rgBatchRows[ri];
    if (!row || !row.results[ii]) return null;
    return row.results[ii];
}

function rgBatchRowToggle(cb) {
    var ri = parseInt(cb.getAttribute('data-ri'));
    var ii = parseInt(cb.getAttribute('data-ii'));
    var r = rgBatchResult(ri, ii);
    if (r) r.selected = cb.checked;
    rgBatchUpdateBulkCount();
}

function rgBatchToggleAll(master) {
    document.querySelectorAll('.rg-batch-check:not(:disabled)').forEach(function(cb) {
        cb.checked = master.checked;
        var ri = parseInt(cb.getAttribute('data-ri'));
        var ii = parseInt(cb.getAttribute('data-ii'));
        var r = rgBatchResult(ri, ii);
        if (r) r.selected = master.checked;
    });
    rgBatchUpdateBulkCount();
}

function rgBatchUpdateBulkCount() {
    var checked = document.querySelectorAll('.rg-batch-check:checked');
    var label = document.getElementById('rg-batch-bulk-count');
    if (label) label.textContent = String(checked.length);
}

function rgBatchStop() {
    rgBatchState.stop = true;
    rgBatchState.running = false;
}

/** Добавляет одного игрока (или обновляет HCP, если он уже есть на сайте). */
function rgBatchAddResult(r) {
    if (!r || r.hcp == null) return;
    var existing = rgFindLocalMatch(r);
    if (existing) {
        rgUpdateHcpOfSilent(existing.id, r, existing.data);
        return;
    }
    rgCreateNewPlayerFromAgr(r);
}

function rgBatchAddOne(ri, ii) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgBatchResult(ri, ii);
    if (!r || r.hcp == null) return;
    rgBatchAddResult(r);
    toast('🎉 ' + (currentLang === 'en' ? 'Player ' : 'Игрок ') + r.fio + (currentLang === 'en' ? ' added (HCP ' : ' добавлен (HCP ') + fmtExactHcp(r.hcp) + ')', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    r.selected = false;
    rgBatchState.players = null;
    rgBatchRender(rgBatchRows.filter(function(x) { return x.done; }).length, rgBatchRows.length);
}

function rgBatchUpdateOne(ri, ii) {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var r = rgBatchResult(ri, ii);
    if (!r || r.hcp == null) return;
    var existing = rgFindLocalMatch(r);
    if (existing) {
        rgUpdateHcpOf(existing.id, r);
        r.selected = false;
        rgBatchState.players = null;
        rgBatchRender(rgBatchRows.filter(function(x) { return x.done; }).length, rgBatchRows.length);
    }
}

function rgBatchAddSelected() {
    if (!rgIsAdmin()) {
        toast(currentLang === 'en' ? '⛔ Admins only' : '⛔ Только для администратора', 'error');
        return;
    }
    var selected = [];
    rgBatchRows.forEach(function(row) {
        row.results.forEach(function(r) {
            if (r.selected && r.hcp != null) selected.push(r);
        });
    });
    if (!selected.length) {
        toast(currentLang === 'en' ? '⚠ Select at least one player' : '⚠ Выберите хотя бы одного игрока', 'error');
        return;
    }

    var added = 0, updated = 0;
    var seen = {};
    selected.forEach(function(r) {
        var uniqKey = (r.number || '') + '|' + impNormName(r.fio);
        if (seen[uniqKey]) return;
        seen[uniqKey] = true;
        var existing = rgFindLocalMatch(r);
        if (existing) {
            rgUpdateHcpOfSilent(existing.id, r, existing.data);
            updated++;
        } else {
            rgBatchAddResult(r);
            added++;
        }
        r.selected = false;
    });

    var msg = '✅ ' + (currentLang === 'en' ? 'Bulk add: ' : 'Массовое добавление: ') +
        added + ' ' + (currentLang === 'en' ? 'added' : 'добавлено') +
        ', ' + updated + ' ' + (currentLang === 'en' ? 'updated' : 'обновлено');
    toast(msg, 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();
    rgBatchState.players = null;
    rgBatchRender(rgBatchRows.filter(function(x) { return x.done; }).length, rgBatchRows.length);
}



// -------- НАСТРОЙКИ ПРОКСИ ---------

function loadRusgolfProxySettings() {
    var input = document.getElementById('rg-proxy-input');
    if (!input) return;
    var applyVal = function(v) {
        if (v && input) input.value = v;
        var note = document.getElementById('rg-proxy-status');
        if (note) note.textContent = '';
    };
    var saved = '';
    try { saved = localStorage.getItem('pestovo_rg_proxy') || ''; } catch (e) { console.warn("[silent]", e); }
    applyVal(saved);
    if (typeof db !== 'undefined') {
        db.ref('settings/rusgolf/proxy').once('value').then(function(sn) {
            var v = sn.val();
            if (v) {
                applyVal(String(v));
                try { localStorage.setItem('pestovo_rg_proxy', String(v)); } catch (e) { console.warn("[silent]", e); }
            }
        }).catch(function(){});
    }
}

function saveRusgolfProxySettings() {
    var input = document.getElementById('rg-proxy-input');
    var v = input ? input.value.trim() : '';
    if (v && v.indexOf('{url}') === -1) {
        toast(currentLang === 'en' ? '⚠ Proxy template must contain {url}' : '⚠ Шаблон прокси должен содержать {url}', 'error');
        return;
    }
    try { localStorage.setItem('pestovo_rg_proxy', v); } catch (e) { console.warn("[silent]", e); }
    if (typeof db !== 'undefined') {
        db.ref('settings/rusgolf').update({ proxy: v, updatedAt: Date.now() }).catch(function(){});
    }
    var note = document.getElementById('rg-proxy-status');
    if (note) note.textContent = v ? '✅' : '✓';
    toast(currentLang === 'en' ? '✅ Proxy settings saved' : '✅ Настройки прокси сохранены', 'success');
}
