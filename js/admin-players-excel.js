// js/admin-players-excel.js — импорт/экспорт игроков через Excel (админка);
// вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули).
// Разбор xlsx (библиотека XLSX грузится страницей), превью с дедупликацией
// (режимы A/B/C с учётом форм имён из js/name-variants.js — guarded), запись
// в /players, экспорт текущего списка. Внешние зависимости: runtime-глобалы
// и guarded-вызовы (NameVariants, loadAdmPlayers, t, toast).

// ==========================================
// ИМПОРТ / ЭКСПОРТ ИГРОКОВ ЧЕРЕЗ EXCEL
// ==========================================
var impParsedRows = [];

function impNormName(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Ключ игрока для поиска дублей. В режимах A/B/C учитывает формы имени
 *  («Наташа Смирнова» = «Смирнова Наталия»), в режиме «off» — как раньше. */
function impNameKey(d) {
    d = d || {};
    if (typeof NameVariants !== 'undefined' && NameVariants.isOn()) {
        var k = NameVariants.groupKey(d);
        if (k) return k;
    }
    return impNormName(d.name || ((d.firstName || '') + ' ' + (d.lastName || '')).trim());
}

function impSplitName(name) {
    var parts = String(name || '').replace(/\s+/g, ' ').trim().split(' ');
    return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
}

function impCollectPlayers(callback) {
    var localUsers = typeof getKnownPlayersSync === 'function' ? (getKnownPlayersSync() || {}) : {};
    var mergePlayers = function(remoteUsers, roundsData) {
        var combined = Object.assign({}, localUsers, remoteUsers || {});
        // Добавляем всех, кто играл раунды (гости, временные uid, незарегистрированные)
        Object.keys(roundsData || {}).forEach(function(rid) {
            var r = roundsData[rid];
            if (!r || !r.players) return;
            Object.keys(r.players).forEach(function(pid) {
                var p = r.players[pid];
                if (!p || !p.name) return;
                if (combined[pid]) {
                    // Дополняем firstName/lastName, если в users их нет
                    var existing = combined[pid];
                    if (!existing.firstName && p.firstName) existing.firstName = p.firstName;
                    if (!existing.lastName && p.lastName) existing.lastName = p.lastName;
                    if (existing.handicap == null) {
                        var rawImp = (p.exactHcpRaw != null) ? p.exactHcpRaw : p.exactHcp;
                        if (rawImp != null) existing.handicap = rawImp;
                    }
                    if (!existing.gender && p.gender) existing.gender = p.gender;
                    return;
                }
                var parts = String(p.name || '').replace(/\s+/g, ' ').trim().split(' ');
                combined[pid] = {
                    name: p.name,
                    firstName: p.firstName || parts[0] || '',
                    lastName: p.lastName || parts.slice(1).join(' ') || '',
                    handicap: (p.exactHcpRaw != null ? p.exactHcpRaw : (p.exactHcp != null ? p.exactHcp : (p.handicap != null ? p.handicap : null))),
                    gender: p.gender || 'men',
                    isGuest: !!p.isGuest || String(pid).indexOf('guest_') === 0,
                    role: 'player',
                    roundsPlayed: 1
                };
            });
        });
        callback(Object.entries(combined).filter(function(e) {
            // Удалённые и навсегда заблокированные демо-игроки не попадают в экспорт
            return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(e[0], e[1] && e[1].name));
        }).map(function(e) {
            return { id: e[0], data: e[1] || {} };
        }));
    };
    if (typeof db !== 'undefined') {
        Promise.all([
            db.ref('users').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; }),
            db.ref('rounds').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; })
        ]).then(function(res) {
            mergePlayers(res[0], res[1]);
        }).catch(function() {
            mergePlayers(null, null);
        });
    } else {
        mergePlayers(null, null);
    }
}

function exportPlayersExcel() {
    if (typeof XLSX === 'undefined') {
        toast(currentLang === 'en' ? '❌ Excel library not loaded (check internet)' : '❌ Библиотека Excel не загрузилась (проверьте интернет)', 'error');
        return;
    }
    impCollectPlayers(function(players) {
        if (!players.length) {
            toast(currentLang === 'en' ? 'No players to export' : 'Нет игроков для экспорта', 'error');
            return;
        }
        players.sort(function(a, b) {
            return impNormName((a.data.lastName || '') + ' ' + (a.data.firstName || '')).localeCompare(impNormName((b.data.lastName || '') + ' ' + (b.data.firstName || '')));
        });

        var rows = [['Имя', 'Фамилия', 'Точный гандикап']];
        players.forEach(function(p) {
            var u = p.data;
            var firstName = u.firstName || impSplitName(u.name || '').firstName;
            var lastName = u.lastName || impSplitName(u.name || '').lastName;
            var hcpCell = '';
            if (u.handicap !== null && u.handicap !== undefined && !isNaN(parseFloat(u.handicap))) {
                hcpCell = parseFloat(u.handicap) < 0 ? fmtExactHcp(u.handicap) : Math.round(parseFloat(u.handicap) * 10) / 10;
            }
            rows.push([firstName, lastName, hcpCell]);
        });

        var ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 18 }];
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Игроки');
        XLSX.writeFile(wb, 'Pestovo_Igroki_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        toast('📊 ' + (currentLang === 'en' ? 'Exported players: ' : 'Экспортировано игроков: ') + (rows.length - 1), 'success');
    });
}

function downloadPlayersTemplate() {
    if (typeof XLSX === 'undefined') {
        toast(currentLang === 'en' ? '❌ Excel library not loaded (check internet)' : '❌ Библиотека Excel не загрузилась (проверьте интернет)', 'error');
        return;
    }
    var rows = [
        ['Имя', 'Фамилия', 'Точный гандикап', 'Пол (муж/жен — необязательно)'],
        ['Иван', 'Тестов', 12.0, 'муж'],
        ['Мария', 'Тестова', 20.0, 'жен']
    ];
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 18 }, { wch: 30 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Игроки');
    XLSX.writeFile(wb, 'Shablon_Igrokov_Pestovo.xlsx');
    toast('📋 ' + (currentLang === 'en' ? 'Template downloaded' : 'Шаблон скачан'), 'success');
}

function impHeaderKey(raw) {
    var s = impNormName(raw).replace(/[.:]/g, '');
    if (['имя', 'first name', 'firstname', 'first_name', 'given name'].indexOf(s) !== -1) return 'firstName';
    if (['фамилия', 'last name', 'lastname', 'last_name', 'surname', 'family name'].indexOf(s) !== -1) return 'lastName';
    if (['точный гандикап', 'гандикап', 'точный hcp', 'hcp', 'hi', 'handicap', 'handicap index', 'гандикап index'].indexOf(s) !== -1) return 'hcp';
    if (['пол', 'gender', 'sex'].indexOf(s) !== -1) return 'gender';
    if (['фио', 'имя фамилия', 'full name', 'фамилия имя отчество', 'игрок', 'player'].indexOf(s) !== -1) return 'fio';
    return null;
}

function impGenderFromCell(v) {
    var s = impNormName(v);
    if (['ж', 'жен', 'f', 'female', 'w', 'women', 'женский', 'женщина'].indexOf(s) !== -1 || s.indexOf('жен') === 0) return 'women';
    if (['м', 'муж', 'm', 'male', 'men', 'мужской', 'мужчина'].indexOf(s) !== -1 || s.indexOf('муж') === 0) return 'men';
    return 'men';
}

function handlePlayersFileSelect(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var statusEl = document.getElementById('imp-status');
    var previewEl = document.getElementById('imp-preview');

    if (typeof XLSX === 'undefined') {
        toast(currentLang === 'en' ? '❌ Excel library not loaded (check internet)' : '❌ Библиотека Excel не загрузилась (проверьте интернет)', 'error');
        input.value = '';
        return;
    }

    if (statusEl) statusEl.innerHTML = '<p style="color:var(--muted);font-size:13px;"><i class="fas fa-spinner fa-spin"></i> ' + (currentLang === 'en' ? 'Reading file...' : 'Чтение файла...') + '</p>';
    if (previewEl) previewEl.innerHTML = '';

    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            if (!wb.SheetNames.length) throw new Error(currentLang === 'en' ? 'no sheets' : 'нет листов в файле');

            // ТО ЖЕ ЧТЕНИЕ, ЧТО И «УЧАСТНИКИ СТАРТОВОГО ЛИСТА» (start-admin.js):
            // сканируем ВСЕ листы и ВСЕ столбцы каждого — имена ищутся по
            // заголовкам (ИФ/ФИО/Имя+Фамилия, Точный гандикап/HCP, Пол, ТИ),
            // а не только первый лист с известными заголовками.
            var validRows = [];
            var invalidRows = [];
            var seenNameKey = {};
            var en = currentLang === 'en';
            var useGrid = (typeof psParseExcelGrid === 'function' && typeof XLSX !== 'undefined');
            if (useGrid) {
                wb.SheetNames.forEach(function(sheetName) {
                    var ws = wb.Sheets[sheetName];
                    if (!ws) return;
                    var grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                    var res = psParseExcelGrid(grid);
                    (res.valid || []).forEach(function(rec) {
                        var name = ((rec.firstName || '') + ' ' + (rec.lastName || '')).replace(/\s+/g, ' ').trim();
                        if (!name) return;
                        // Дубль того же человека в пределах файла — одна строка
                        // (поздний лист переопределяет ранний, как в стартовом листе).
                        var key = impNameKey({ firstName: rec.firstName, lastName: rec.lastName });
                        for (var i = 0; i < validRows.length; i++) {
                            if (impNameKey({ firstName: validRows[i].firstName, lastName: validRows[i].lastName }) === key) {
                                validRows.splice(i, 1);
                                break;
                            }
                        }
                        validRows.push({
                            idx: 0, // перенумеруем ниже
                            firstName: rec.firstName || '',
                            lastName: rec.lastName || '',
                            name: name,
                            hcp: (rec.hcp != null && rec.hcp !== '') ? rec.hcp : null,
                            hcpRaw: (rec.hcp != null && rec.hcp !== '') ? String(rec.hcp) : '',
                            gender: rec.gender || 'men',
                            dup: null,
                            error: null
                        });
                    });
                    (res.invalid || []).forEach(function(rec) {
                        var name = String(rec.name || ((rec.firstName || '') + ' ' + (rec.lastName || ''))).replace(/\s+/g, ' ').trim();
                        invalidRows.push({
                            idx: 0,
                            firstName: rec.firstName || '',
                            lastName: rec.lastName || '',
                            name: name,
                            hcp: null,
                            hcpRaw: '',
                            gender: 'men',
                            dup: null,
                            error: String(rec.err || (rec.errors && rec.errors.length ? rec.errors.join(', ') : (en ? 'no name' : 'нет имени')))
                        });
                    });
                });
            }
            // Резерв: если парсер стартового листа недоступен — старая логика
            // по первому листу (заголовки из первой строки).
            if (!useGrid || (!validRows.length && !invalidRows.length)) {
                var first = wb.Sheets[wb.SheetNames[0]];
                var json = first ? XLSX.utils.sheet_to_json(first, { defval: '' }) : [];
                var mapped = impMapRows(json || []);
                validRows = validRows.length || invalidRows.length ? validRows : mapped.validRows;
                invalidRows = invalidRows.length || validRows.length ? invalidRows : mapped.invalidRows;
            }

            // Нумерация строк для чекбоксов предпросмотра.
            var nIdx = 0;
            validRows.forEach(function(r) { r.idx = nIdx++; });
            invalidRows.forEach(function(r) { r.idx = nIdx++; });

            if (!validRows.length && !invalidRows.length) {
                if (statusEl) statusEl.innerHTML = '<div class="imp-note imp-note-err"><i class="fas fa-triangle-exclamation"></i> ' +
                    (en ? 'No data rows found in the file (all sheets scanned).' : 'Во всех листах файла не найдено строк с данными.') + '</div>';
                return;
            }
            impParsedRows = validRows.concat(invalidRows);
            impRenderPreview(validRows, invalidRows);
            if (statusEl) statusEl.innerHTML = '';
        } catch (err) {
            console.warn('Import parse error:', err);
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

function impParseHcpStrict(raw) {
    var s = String(raw).replace(/\u00a0/g, '').replace(/\s+/g, '').trim();
    if (s === '' || s === '—' || s === '-') return { err: 'empty' };
    var plus = false;
    if (s.charAt(0) === '+') { plus = true; s = s.substring(1); }
    if (!/^\-?\d+([.,]\d+)?$/.test(s)) return { err: 'bad' };
    s = s.replace(',', '.');
    var v = parseFloat(s);
    if (plus) v = -Math.abs(v);
    if (v < -6 || v > 60) return { err: 'range' };
    return { val: v };
}

function impMapRows(jsonRows) {
    var keys = {};
    var validRows = [];
    var invalidRows = [];

    if (jsonRows.length) {
        Object.keys(jsonRows[0]).forEach(function(h) {
            var k = impHeaderKey(h);
            if (k && !keys[k]) keys[k] = h;
        });
    }

    jsonRows.forEach(function(r, i) {
        var firstName = '', lastName = '', fio = '';
        if (keys.firstName) firstName = String(r[keys.firstName] || '').trim();
        if (keys.lastName) lastName = String(r[keys.lastName] || '').trim();
        if (keys.fio) fio = String(r[keys.fio] || '').trim();

        if (!firstName && !lastName && !fio) {
            invalidRows.push({ idx: i, error: currentLang === 'en' ? 'no name' : 'нет имени', firstName: '', lastName: '', name: '', hcp: null, gender: 'men', dup: null });
            return;
        }

        if ((!firstName || !lastName) && fio) {
            var fioParts = fio.split(/\s+/);
            if (!lastName) lastName = fioParts[0] || '';
            if (!firstName) firstName = fioParts.slice(1).join(' ') || '';
        }
        if (!firstName && lastName) { var swap = impSplitName(lastName); firstName = swap.firstName; lastName = swap.lastName; }
        if (!lastName && firstName) { var swap2 = impSplitName(firstName); firstName = swap2.firstName; lastName = swap2.lastName; }

        var hcpRaw = keys.hcp ? String(r[keys.hcp] === 0 || r[keys.hcp] === '0' ? '0' : (r[keys.hcp] || '')).trim() : '';
        var hcp = null;
        var err = null;
        if (!keys.hcp || hcpRaw === '' || hcpRaw === '—') {
            err = currentLang === 'en' ? 'no handicap' : 'нет гандикапа';
        } else {
            var parsedHcp = impParseHcpStrict(hcpRaw);
            if (parsedHcp.err === 'empty') {
                err = currentLang === 'en' ? 'no handicap' : 'нет гандикапа';
            } else if (parsedHcp.err === 'bad') {
                err = currentLang === 'en' ? 'bad handicap: ' + hcpRaw : 'некорректный HCP: ' + hcpRaw;
            } else if (parsedHcp.err === 'range') {
                err = currentLang === 'en' ? 'HCP out of range: ' + hcpRaw : 'HCP вне диапазона: ' + hcpRaw;
            } else {
                hcp = parsedHcp.val;
            }
        }

        var gender = keys.gender ? impGenderFromCell(r[keys.gender]) : 'men';
        var name = (firstName + ' ' + lastName).replace(/\s+/g, ' ').trim();

        validRows.push({
            idx: i,
            firstName: firstName,
            lastName: lastName,
            name: name,
            hcp: hcp,
            hcpRaw: hcpRaw,
            gender: gender,
            dup: null,
            error: err
        });
    });

    validRows = validRows.filter(function(r) {
        if (r.error) { r.checked = false; invalidRows.push(r); return false; }
        return true;
    });

    return { validRows: validRows, invalidRows: invalidRows };
}

function impRenderPreview(validRows, invalidRows) {
    var previewEl = document.getElementById('imp-preview');
    if (!previewEl) return;

    impCollectPlayers(function(existingPlayers) {
        var byName = {};
        existingPlayers.forEach(function(p) {
            var nm = impNameKey(p.data);
            if (nm) byName[nm] = p;
        });

        validRows.forEach(function(r) {
            var key = impNameKey({ firstName: r.firstName, lastName: r.lastName });
            r.dup = byName[key] || null;
            r.checked = true;
        });

        var newCount = validRows.filter(function(r) { return !r.dup; }).length;
        var dupCount = validRows.length - newCount;

        var html = '<div class="imp-note">' +
            '<i class="fas fa-table-list"></i> ' +
            (currentLang === 'en' ? 'Rows in file: <b>' : 'Строк в файле: <b>') + (validRows.length + invalidRows.length) + '</b>' +
            (currentLang === 'en' ? ' · New: <b>' : ' · Новых: <b>') + newCount + '</b>' +
            (currentLang === 'en' ? ' · Existing (HCP update): <b>' : ' · Уже есть (обновление HCP): <b>') + dupCount + '</b>' +
            (invalidRows.length ? (currentLang === 'en' ? ' · With errors: <b>' : ' · С ошибками: <b>') + invalidRows.length + '</b>' : '') +
            '</div>';

        html += '<div class="imp-list">';
        html += '<label class="imp-row imp-row-head">' +
            '<input type="checkbox" id="imp-check-all" checked onchange="impToggleAll(this)">' +
            '<span style="font-weight:700;color:var(--gold);">' + (currentLang === 'en' ? 'Choose all' : 'Выбрать все') + '</span></label>';

        var renderRow = function(r, i, invalid) {
            var badge = '';
            if (invalid) {
                badge = '<span class="imp-badge imp-badge-err">⚠ ' + escapeHtml(r.error) + '</span>';
            } else if (r.dup) {
                var oldHcp = r.dup.data.handicap != null ? fmtExactHcp(r.dup.data.handicap) : '—';
                badge = '<span class="imp-badge imp-badge-dup">' + (currentLang === 'en' ? 'Update' : 'Обновит') + ' HCP ' + oldHcp + ' → ' + fmtExactHcp(r.hcp) + '</span>';
            } else {
                badge = '<span class="imp-badge imp-badge-new">' + (currentLang === 'en' ? 'New player' : 'Новый игрок') + '</span>';
            }
            var genderIcon = r.gender === 'women' ? '👩' : '👨';
            return '<label class="imp-row">' +
                '<input type="checkbox" ' + (invalid ? 'disabled' : (r.checked ? 'checked' : '')) + ' data-imp-idx="' + r.idx + '" onchange="impRowToggle(this)">' +
                '<span class="imp-info"><span class="imp-name">' + genderIcon + ' ' + escapeHtml((r.firstName || '') + ' ' + (r.lastName || '')) + '</span>' +
                '<span class="imp-sub">HCP: ' + (r.hcp != null ? fmtExactHcp(r.hcp) : '—') + '</span></span>' +
                badge + '</label>';
        };

        validRows.forEach(function(r, i) { html += renderRow(r, i, false); });
        invalidRows.forEach(function(r, i) { html += renderRow(r, i, true); });
        html += '</div>';

        html += '<div class="rg-actions" style="margin-top:14px;">' +
            '<button type="button" class="btn btn-g imp-big-btn" onclick="confirmPlayersImport()"><i class="fas fa-file-import"></i> <span>' +
            (currentLang === 'en' ? 'Import selected' : 'Импортировать выбранное') + ' (<span id="imp-count-label">' + validRows.length + '</span>)</span></button>' +
            '<button type="button" class="btn btn-og imp-big-btn" onclick="impCancelPreview()"><i class="fas fa-xmark"></i> <span>' + (currentLang === 'en' ? 'Cancel' : 'Отмена') + '</span></button>' +
            '</div>';

        previewEl.innerHTML = html;
        impUpdateCountLabel();
    });
}

function impRowToggle(cb) {
    var idx = parseInt(cb.getAttribute('data-imp-idx'));
    impParsedRows.forEach(function(r) { if (r.idx === idx) r.checked = cb.checked; });
    impUpdateCountLabel();
}

function impToggleAll(master) {
    document.querySelectorAll('#imp-preview input[data-imp-idx]').forEach(function(cb) {
        if (!cb.disabled) {
            cb.checked = master.checked;
            var idx = parseInt(cb.getAttribute('data-imp-idx'));
            impParsedRows.forEach(function(r) { if (r.idx === idx) r.checked = cb.checked; });
        }
    });
    impUpdateCountLabel();
}

function impUpdateCountLabel() {
    var label = document.getElementById('imp-count-label');
    if (label) label.textContent = String(impParsedRows.filter(function(r) { return r.checked; }).length);
}

function impCancelPreview() {
    var previewEl = document.getElementById('imp-preview');
    if (previewEl) previewEl.innerHTML = '';
    var statusEl = document.getElementById('imp-status');
    if (statusEl) statusEl.innerHTML = '';
    impParsedRows = [];
}

function impSaveLocalPlayer(newId, playerData) {
    if (typeof cachedRegisteredUsers !== 'undefined') {
        cachedRegisteredUsers[newId] = playerData;
        try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch (e) { console.warn("[silent]", e); }
    }
    try {
        var custom = {};
        var existing = localStorage.getItem('pestovo_custom_players');
        if (existing) custom = JSON.parse(existing) || {};
        custom[newId] = playerData;
        localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
    } catch (e) { console.warn("[silent]", e); }
}

function confirmPlayersImport() {
    var selected = impParsedRows.filter(function(r) { return r.checked && !r.error; });
    if (!selected.length) {
        toast(currentLang === 'en' ? '⚠ Select at least one row' : '⚠ Выберите хотя бы одну строку', 'error');
        return;
    }

    var created = 0, updated = 0, failed = 0;
    var completed = 0;
    var total = selected.length;
    var finished = false;
    var finish = function() {
        completed++;
        if (completed < total || finished) return;
        finished = true;
        var msg = (currentLang === 'en' ? '✅ Import complete: ' : '✅ Импорт завершён: ') +
                  (currentLang === 'en' ? created + ' created, ' : created + ' создано, ') +
                  (currentLang === 'en' ? updated + ' updated' : updated + ' обновлено') +
                  (failed ? (currentLang === 'en' ? ', ' + failed + ' failed' : ', ' + failed + ' ошибок') : '');
        toast(msg, failed ? 'error' : 'success');
        if (typeof vib === 'function') vib([50, 30, 50]);
        impCancelPreview();
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    };

    selected.forEach(function(r) {
        if (r.dup) {
            // Синхронизируем локальный кэш, иначе список игроков покажет старый HCP до перезагрузки
            try {
                if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[r.dup.id]) {
                    cachedRegisteredUsers[r.dup.id].handicap = r.hcp;
                    cachedRegisteredUsers[r.dup.id].gender = r.gender;
                    cachedRegisteredUsers[r.dup.id].hcpUpdatedAt = Date.now();
                    cachedRegisteredUsers[r.dup.id].hcpSource = 'excel';
                    try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch (e2) { console.warn("[silent]", e2); }
                }
            } catch (e) { console.warn("[silent]", e); }
            if (typeof db !== 'undefined' && db) {
                db.ref('users/' + r.dup.id).update({
                    handicap: r.hcp,
                    gender: r.gender,
                    hcpUpdatedAt: Date.now(),
                    hcpSource: 'excel'
                }).then(function() { updated++; finish(); }).catch(function() { failed++; finish(); });
            } else {
                updated++;
                finish();
            }
        } else {
            var newId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
            var playerData = {
                name: r.name,
                firstName: r.firstName,
                lastName: r.lastName,
                email: '',
                handicap: r.hcp,
                gender: r.gender,
                defaultTee: r.gender === 'women' ? 'rd' : 'wh',
                role: 'player',
                createdAt: Date.now(),
                roundsPlayed: 0,
                bestGross: null,
                bestStableford: null,
                hcpSource: 'excel'
            };
            impSaveLocalPlayer(newId, playerData);
            created++;
            if (typeof db !== 'undefined' && db) {
                db.ref('users/' + newId).set(playerData).then(finish).catch(finish);
            } else {
                finish();
            }
        }
    });
}
