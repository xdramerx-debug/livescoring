// js/admin-tournaments.js — вкладка «Турниры» админки; вынесено из
// js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули). Содержит:
// список турниров (loadTournaments), заявки/снятие, ЛИСТ ОЖИДАНИЯ
// (waitlist), ГРУППЫ ПО ГАНДИКАПУ (дивизионы) и умное создание групп
// (tnAutoDivisions, tnBandNum, tnAutoGroupCount), синхронизацию групп в
// ростер (tnSyncDivisionsToRoster, tnDivOpen). Внешние зависимости:
// runtime-глобалы (db, toast, t, currentLang, escapeHtml) и guarded-вызовы
// (loadAdmPlayers, hasAdminPanelAccess и т.п.). Вызовы loadTournaments()
// из admin.js — typeof-guarded. Грузится в admin.html рядом с admin.js.

// ==========================================
// ТУРНИРЫ
// ==========================================
// Уникальное число заявленных участников: гостевые записи и синхронизированные
// записи одного человека могут лежать под разными ключами — считаем по ФИО.
function admUniqueRegCount(regPlayers) {
    var seen = {};
    var n = 0;
    Object.keys(regPlayers || {}).forEach(function(k) {
        var rp = regPlayers[k] || {};
        var key = '';
        if (typeof getPlayerFioKey === 'function') {
            try { key = getPlayerFioKey(rp); } catch (e) { console.warn("[silent]", e); }
        }
        if (!key) {
            var nm = String(rp.name || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
            key = nm || ('id:' + k);
        }
        if (!seen[key]) { seen[key] = true; n++; }
    });
    return n;
}
var tnDivOpen = {};
// Какие панели «Лист ожидания» турниров раскрыты.
var tnWaitOpen = {};

// ==========================================
// ЛИСТ ОЖИДАНИЯ ТУРНИРА (waitlist)
// ------------------------------------------------------------
// Игроки, записавшиеся на турнир (страница «Турниры»), попадают не
// сразу в состав (registeredPlayers), а в отдельный список
// tournaments/<id>/waitlist. Здесь администратор выбирает, кого
// добавить в турнир (или убрать из ожидания).
// ==========================================
function tnToggleWaitlist(tnId) {
    tnWaitOpen[tnId] = !tnWaitOpen[tnId];
    var panel = document.getElementById('tn-waitlist-' + tnId);
    if (panel) panel.classList.toggle('hidden', !tnWaitOpen[tnId]);
    if (typeof vib === 'function') { try { vib(20); } catch (e) { console.warn("[silent]", e); } }
}

function tnWaitNameNorm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function tnWaitlistAdminHtml(tnId, tVal) {
    var en = currentLang === 'en';
    var waitlist = tVal.waitlist || {};
    var items = [];
    Object.keys(waitlist).forEach(function(k) {
        items.push({ key: k, w: waitlist[k] || {} });
    });
    items.sort(function(a, b) {
        var ha = parseFloat(a.w.handicap), hb = parseFloat(b.w.handicap);
        if (isNaN(ha) && isNaN(hb)) return String(a.w.name || '').localeCompare(String(b.w.name || ''));
        if (isNaN(ha)) return 1;
        if (isNaN(hb)) return -1;
        if (ha !== hb) return ha - hb;
        return String(a.w.name || '').localeCompare(String(b.w.name || ''));
    });

    var html = '<div style="padding:10px 4px 4px;border-top:1px dashed var(--border);margin-top:8px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">';
    html += '<span style="font-size:13px;font-weight:800;color:var(--gold);"><i class="fas fa-hourglass-half"></i> ' +
        (en ? 'Waitlist' : 'Лист ожидания') + ' · ' + items.length + '</span>';
    if (items.length) {
        html += '<button type="button" class="btn btn-g btn-sm" onclick="tnWaitlistAddAll(\'' + tnId + '\')"><i class="fas fa-user-check"></i> ' +
            (en ? 'Add all to tournament' : 'Добавить всех в турнир') + '</button>';
    }
    html += '</div>';
    html += '<div style="font-size:11.5px;color:var(--muted);margin-top:4px;">' +
        (en ? 'Players sign up here from the site. Add them to the tournament roster (or remove them) — only added players count for the start list and the leaderboard.' :
              'Игроки записываются сюда со страницы «Турниры». Добавляйте их в состав турнира (или убирайте) — только добавленные попадают в стартовый лист и лидерборд.') + '</div>';
    if (!items.length) {
        html += '<p style="font-size:12px;color:var(--muted);text-align:center;padding:10px 0;">' + (en ? 'Waitlist is empty' : 'Список ожидания пуст') + '</p>';
    }
    items.forEach(function(it) {
        var w = it.w;
        var gIcon = (typeof pestovoNormGender === 'function' && pestovoNormGender(w.gender) === 'women') ? '👩' : '👨';
        var hcp = (w.handicap != null && w.handicap !== '') ? fmtExactHcp(w.handicap) : '—';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 10px;margin-top:6px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:8px;">';
        html += '<div style="min-width:180px;flex:1;">';
        html += '<div style="font-weight:700;color:var(--white);">' + gIcon + ' ' + escapeHtml(w.name || '—') + '</div>';
        html += '<div style="font-size:11.5px;color:var(--muted);margin-top:2px;">' +
            'HCP: <b style="color:var(--text);">' + hcp + '</b>' +
            ' · ' + fmtTeePill(w.tee || 'wh') +
            (w.phone ? ' · ' + escapeHtml(w.phone) : '') +
            (w.registeredAt ? ' · ' + (en ? 'signed up' : 'записан') + ' ' + fmtDate(w.registeredAt) : '') +
            '</div></div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
        html += '<button type="button" class="btn btn-g btn-sm" onclick="tnWaitlistAddToTournament(\'' + tnId + '\',\'' + escapeHtml(it.key) + '\')"><i class="fas fa-user-check"></i> ' + (en ? 'Add to tournament' : 'Добавить в турнир') + '</button>';
        html += '<button type="button" class="btn btn-r btn-sm" onclick="tnWaitlistRemove(\'' + tnId + '\',\'' + escapeHtml(it.key) + '\')" title="' + (en ? 'Remove from waitlist' : 'Убрать из ожидания') + '"><i class="fas fa-xmark"></i></button>';
        html += '</div></div>';
    });
    html += '</div>';
    return html;
}

// Перенос одного игрока из листа ожидания в состав (registeredPlayers).
// Дубли по ФИО не создаются: если игрок уже в составе — просто убираем
// его из ожидания. Ключ записи в составе: uid для игроков с аккаунтом
// (бейдж «Вы записаны» работает по нему), иначе уникальный ключ.
function tnWaitlistAddToTournament(tnId, wKey) {
    if (typeof db === 'undefined' || !db) return;
    var en = currentLang === 'en';
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val() || {};
        var w = (tVal.waitlist || {})[wKey];
        if (!w) return;
        var reg = tVal.registeredPlayers || {};
        // Дедуп по ФИО НЕЗАВИСИМО от порядка слов: запись в составе могла
        // сохраниться как «Имя Отчество Фамилия», а в ожидании — наоборот.
        var existingKey = (typeof pestovoNameKeyInList === 'function')
            ? pestovoNameKeyInList(w.name, reg)
            : '';
        if (!existingKey) {
            var normName = tnWaitNameNorm(w.name);
            Object.keys(reg).forEach(function(k) {
                if (existingKey) return;
                if (tnWaitNameNorm((reg[k] || {}).name) === normName) existingKey = k;
            });
        }
        var updates = {};
        if (existingKey) {
            updates['tournaments/' + tnId + '/waitlist/' + wKey] = null;
            return db.ref().update(updates).then(function() {
                toast((en ? 'Already in the roster — removed from waitlist: ' : 'Уже в составе — убран из ожидания: ') + (w.name || ''), 'info');
            });
        }
        var key = (w.uid && !/^user_/.test(String(w.uid))) ? String(w.uid) :
            ('wl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
        var entry = {};
        Object.keys(w).forEach(function(f) { entry[f] = w[f]; });
        entry.addedAt = Date.now();
        updates['tournaments/' + tnId + '/registeredPlayers/' + key] = entry;
        updates['tournaments/' + tnId + '/waitlist/' + wKey] = null;
        return db.ref().update(updates).then(function() {
            toast('✅ ' + (en ? 'Added to the tournament: ' : 'Добавлен в турнир: ') + (w.name || ''), 'success');
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// «Добавить всех»: одна пакетная запись (update) на весь список ожидания.
function tnWaitlistAddAll(tnId) {
    if (typeof db === 'undefined' || !db) return;
    var en = currentLang === 'en';
    var waitlist = (typeof tnTnVals !== 'undefined' && tnTnVals[tnId] && tnTnVals[tnId].waitlist) || {};
    var keys = Object.keys(waitlist);
    if (!keys.length) { toast(en ? 'Waitlist is empty' : 'Список ожидания пуст', 'info'); return; }
    if (!confirm((en ? 'Add all ' : 'Добавить всех ') + keys.length + (en ? ' players to the tournament?' : ' игроков в турнир?'))) return;
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val() || {};
        var reg = tVal.registeredPlayers || {};
        // Состав для проверки дублей: записи + то, что добавляем сейчас.
        // Совпадение — strong по ФИО (порядок слов не важен).
        var known = {};
        Object.keys(reg).forEach(function(k) { known[k] = reg[k]; });
        var wl = tVal.waitlist || {};
        var updates = {};
        var added = 0, skipped = 0;
        Object.keys(wl).forEach(function(k) {
            var w = wl[k] || {};
            var isDup = (typeof pestovoNameInList === 'function')
                ? pestovoNameInList(w.name, known)
                : (Object.keys(known).some(function(kk) {
                    return tnWaitNameNorm((known[kk] || {}).name) === tnWaitNameNorm(w.name);
                }));
            if (isDup) {
                updates['tournaments/' + tnId + '/waitlist/' + k] = null;
                skipped++;
                return;
            }
            var key = (w.uid && !/^user_/.test(String(w.uid))) ? String(w.uid) :
                ('wl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
            var entry = {};
            Object.keys(w).forEach(function(f) { entry[f] = w[f]; });
            entry.addedAt = Date.now();
            known[key] = entry;
            updates['tournaments/' + tnId + '/registeredPlayers/' + key] = entry;
            updates['tournaments/' + tnId + '/waitlist/' + k] = null;
            added++;
        });
        return db.ref().update(updates).then(function() {
            toast('✅ ' + (en ? 'Added to the tournament: ' : 'Добавлено в турнир: ') + added +
                (skipped ? (en ? ' · already in roster: ' : ' · уже в составе: ') + skipped : ''), 'success');
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// Убрать игрока из листа ожидания (без подтверждения — запись обратима:
// игрок может записаться повторно со страницы «Турниры»).
function tnWaitlistRemove(tnId, wKey) {
    if (typeof db === 'undefined' || !db) return;
    db.ref('tournaments/' + tnId + '/waitlist/' + wKey).remove().then(function() {
        toast(currentLang === 'en' ? 'Removed from the waitlist' : 'Убран из списка ожидания', 'info');
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}
// Инлайн-редактирование группы: tnDivEditing[tnId] = divId.
var tnDivEditing = {};
// Кэш последних значений турниров из подписки — для перерисовки
// панели «Группы HCP» без обращения к базе.
var tnTnVals = {};

function loadTournaments() {
    if (typeof db === 'undefined' || !db) {
        var tnEmpty = document.getElementById('tn-list');
        if (tnEmpty) tnEmpty.innerHTML = '<div class="empty"><i class="fas fa-wifi"></i><p>' + (currentLang === 'en' ? 'No database connection' : 'Нет соединения с базой') + '</p></div>';
        return;
    }
    // Одна подписка: bindRealtimeValue не плодит дубли при повторных заходах на вкладку.
    bindRealtimeValue('admin-tournaments-list', db.ref('tournaments'), function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data);
        var el = document.getElementById('tn-list');
        if (!el) return;

        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>' + (currentLang === 'en' ? 'No tournaments' : 'Нет турниров') + '</p></div>';
            return;
        }

        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });

        var formatLabel = currentLang === 'en' ? 'Formats: ' : 'Форматы: ';
        var teeLabel = currentLang === 'en' ? 'Tees: ' : 'ТИ: ';
        var waitLabel = currentLang === 'en' ? 'Waitlist: ' : 'Ожидание: ';

        var html = '';
        tnTnVals = {};
        entries.forEach(function(e) {
            var id = e[0], tVal = e[1];
            tnTnVals[id] = tVal;
            var formatsStr = (tVal.formats || []).join(', ') || '—';
            var teesStr = (tVal.tees || []).map(function(k) { return t('tee_' + k); }).join(', ') || '—';
            var regPlayers = tVal.registeredPlayers || {};
            var regCount = admUniqueRegCount(regPlayers);
            var waitlistVal = tVal.waitlist || {};
            var waitCount = Object.keys(waitlistVal).length;

            var tnStatus = tVal.status || 'upcoming';
            var tnEn = currentLang === 'en';
            var tnDivisions = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tVal) : [];
            var tnStatusHtml = tnStatus === 'active'
                ? '<span class="tn-status tn-a">🔴 ' + (tnEn ? 'Active' : 'Активный') + '</span>'
                : tnStatus === 'completed'
                ? '<span class="tn-status tn-d">✅ ' + (tnEn ? 'Completed' : 'Завершён') + '</span>'
                : '<span class="tn-status tn-u">📅 ' + (tnEn ? 'Upcoming' : 'Предстоящий') + '</span>';

            html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:8px;flex-direction:column;align-items:stretch;">';
            html += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<strong style="color:var(--white);">' + escapeHtml(tVal.name || '—') + '</strong> ' + tnStatusHtml;
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    fmtDate((typeof tnDateTs === 'function') ? tnDateTs(tVal.date) : Date.parse(tVal.date)) + ' · ' + formatLabel + formatsStr + ' · ' + teeLabel + teesStr + ' · ' + (tnEn ? 'Players: ' : 'Заявлено: ') + regCount +
                    (waitCount ? ' · ' + waitLabel + '<b style="color:var(--gold);">' + waitCount + '</b>' : '') + '</div>';
            if (tnDivisions.length) {
                html += '<div style="margin-top:6px;">';
                tnDivisions.forEach(function(d) {
                    // Имя группы ИЛИ диапазон HCP — но не оба сразу: названия
                    // вида «Мужчины 0–12» уже содержат диапазон, и бейдж с
                    // ним двоил информацию.
                    var rg = (typeof tnDivisionRangeText === 'function') ? tnDivisionRangeText(d) : '';
                    html += '<span class="tn-div-chip">' + escapeHtml(d.name || rg || '—') + '</span>';
                });
                html += '</div>';
            }
            html += '</div>';
            html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start;">';
            if (tnStatus === 'upcoming') {
                html += '<button class="btn btn-g btn-sm" onclick="tnStartTournament(\'' + id + '\')" title="' + (tnEn ? 'Start before the scheduled time' : 'Начать раньше запланированного времени') + '"><i class="fas fa-play"></i> ' + (tnEn ? 'Start' : 'Старт') + '</button>';
            } else if (tnStatus === 'active') {
                html += '<button class="btn btn-og btn-sm" onclick="tnFinishTournament(\'' + id + '\')"><i class="fas fa-flag-checkered"></i> ' + (tnEn ? 'Finish' : 'Финиш') + '</button>';
            } else {
                html += '<button class="btn btn-og btn-sm" onclick="tnReopenTournament(\'' + id + '\')"><i class="fas fa-rotate-left"></i> ' + (tnEn ? 'Reopen' : 'Открыть снова') + '</button>';
                html += '<button class="btn btn-g btn-sm" onclick="tnOpenProtocolModal(\'' + id + '\')"><i class="fas fa-file-pdf"></i> ' + (tnEn ? 'Protocol PDF' : 'Протокол (PDF)') + '</button>';
            }
            if (tnStatus === 'upcoming' && regCount > 0) {
                html += '<button class="btn btn-og btn-sm" onclick="openFlightGeneratorModal(\'' + id + '\')"><i class="fas fa-users-gear"></i> ' + (tnEn ? 'Flights' : 'Флайты') + '</button>';
            }
            html += '<button class="btn btn-og btn-sm" onclick="tnToggleDivPanel(\'' + id + '\')"><i class="fas fa-layer-group"></i> ' + (tnEn ? 'HCP groups' : 'Группы HCP') + ' (' + tnDivisions.length + ')</button>';
            if (regCount > 0) {
                html += '<button class="btn btn-og btn-sm" onclick="exportTournamentRosterCSV(\'' + id + '\')"><i class="fas fa-file-csv"></i> CSV</button>';
            }
            // ЛИСТ ОЖИДАНИЯ: заявившиеся игроки (ещё не в составе) — сюда.
            // Администратор выбирает оттуда участников и добавляет в турнир.
            html += '<button class="btn btn-og btn-sm" onclick="tnToggleWaitlist(\'' + id + '\')" title="' + (tnEn ? 'Players who signed up but are not in the roster yet. Pick who gets a place.' : 'Игроки, записавшиеся, но ещё не в составе. Выберите, кого добавить в турнир.') + '"><i class="fas fa-hourglass-half"></i> ' + (tnEn ? 'Waitlist' : 'Ожидание') + ' (' + waitCount + ')</button>';
            // Удаление турнира всегда каскадное: вместе с раундами и протоколами.
            html += '<button class="btn btn-r btn-sm" title="' + (tnEn ? 'Delete tournament with all its rounds and group protocols' : 'Удалить турнир вместе со всеми его раундами и протоколами групп') + '" onclick="deleteTn(\'' + id + '\')"><i class="fas fa-trash"></i></button>';
            html += '</div></div>';
            html += '<div id="tn-div-' + id + '" class="tn-div-block' + (tnDivOpen[id] ? '' : ' hidden') + '">' + tnDivisionsEditorHtml(id, tnDivisions, tVal) + '</div>';
            html += '<div id="tn-waitlist-' + id + '" class="tn-div-block' + (tnWaitOpen[id] ? '' : ' hidden') + '">' + tnWaitlistAdminHtml(id, tVal) + '</div>';
            html += '</div>';
        });

        el.innerHTML = html;
    });
}

function exportTournamentRosterCSV(tnId) {
    if (typeof db === 'undefined') return;
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal || !tVal.registeredPlayers) return;

        var rows = [['#', 'Name', 'Handicap', 'Gender', 'Tee', 'Registered Date']];
        var idx = 1;
        var seenCsv = {};
        Object.values(tVal.registeredPlayers).forEach(function(p) {
            var key = '';
            if (typeof getPlayerFioKey === 'function') {
                try { key = getPlayerFioKey(p); } catch (e) { console.warn("[silent]", e); }
            }
            if (!key) key = String(p.name || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
            if (key && seenCsv[key]) return; // дубликат того же игрока — пропускаем
            if (key) seenCsv[key] = true;
            rows.push([
                idx++,
                '"' + (p.name || '').replace(/"/g, '""') + '"',
                p.handicap != null ? fmtExactHcp(p.handicap) : '—',
                p.gender || 'men',
                p.tee || 'wh',
                fmtDate(p.registeredAt)
            ]);
        });

        var csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.map(function(e) { return e.join(','); }).join('\n');
        var encodedUri = encodeURI(csvContent);
        var link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'Tournament_' + (tVal.name || 'Roster').replace(/\s+/g, '_') + '_Participants.csv');
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast('📄 CSV roster exported!', 'success');
    });
}

// Удаление турнира — полный каскад: карточка турнира, протоколы групп и
// ВСЕ раунды этого турнира. Раунды убираются и из истории игроков (с
// пересчётом roundsPlayed / bestGross / bestStableford), чтобы после
// удаления турнира в «Истории» и статистике не оставалось его следов.
function deleteTn(id) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db || typeof pestovoDeleteTournamentCascade !== 'function') {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    // Сначала считаем, что именно уйдёт (раунды турнира + протоколы групп),
    // и только потом просим подтверждение с цифрами: удаление турнира — это
    // удаление и всех его раундов, включая записи в истории игроков.
    Promise.all([
        db.ref('tournaments/' + id).once('value').catch(function() { return null; }),
        pestovoTournamentRoundIdsFull(id).catch(function() { return []; }),
        db.ref('protocols').once('value').catch(function() { return null; })
    ]).then(function(res) {
        var tv = (res[0] && res[0].val()) || {};
        var tnName = tv.name || (en ? 'this tournament' : 'этот турнир');
        var roundIds = res[1] || [];
        var protos = (res[2] && res[2].val()) || {};
        var protoIds = Object.keys(protos).filter(function(pid) {
            var p = protos[pid] || {};
            return p.tournamentId === id || p.tnId === id;
        });
        var rc = roundIds.length, pc = protoIds.length;
        var msg = en
            ? 'Delete tournament "' + tnName + '" together with ' + rc + ' round(s) and ' + pc +
              ' group protocol(s)? Rounds of this tournament will be removed from the players history and statistics too. This cannot be undone.'
            : 'Удалить турнир «' + tnName + '» вместе со всеми его раундами (' + rc + ') и протоколами групп (' + pc + ')? ' +
              'Раунды этого турнира исчезнут и из истории игроков, и из их статистики. Отменить это будет нельзя.';
        if (!confirm(msg)) return null;
        return pestovoDeleteTournamentCascade(id).then(function(sum) {
            var parts = en
                ? 'Tournament deleted · rounds: ' + (sum.rounds || 0) + ' · protocols: ' + (sum.protocols || 0)
                : 'Турнир удалён · раундов удалено: ' + (sum.rounds || 0) + ' · протоколов: ' + (sum.protocols || 0);
            if (sum.players) {
                parts += en ? ' · history recalculated for ' + sum.players + ' player(s)'
                            : ' · история ' + sum.players + ' игрока(ов) пересчитана';
            }
            toast(parts, 'info');
            if (typeof loadTournaments === 'function') loadTournaments();
            if (typeof loadAdmRounds === 'function') loadAdmRounds();
            if (typeof myplayRenderToday === 'function') { try { myplayRenderToday(); } catch (e) { console.warn("[silent]", e); } }
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}
function tnStartTournament(id) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(en ? 'Start this tournament now (before the scheduled time)? The live leaderboard will become available and the planned rounds will open for scoring.' : 'Начать турнир сейчас (раньше запланированного времени)? Станет доступен live-лидерборд, а запланированные раунды откроются для ввода счёта.')) return;
    // Старт турнира открывает и его раунды: созданные протоколом заранее
    // раунды (status='scheduled') становятся активными — игроки могут вводить счёт.
    var startJob = (typeof pestovoStartTournamentNow === 'function')
        ? pestovoStartTournamentNow(id)
        : db.ref('tournaments/' + id).update({ status: 'active', startedAt: Date.now() }).then(function() { return 0; });
    startJob.then(function(opened) {
        toast((en ? '🚀 Tournament started!' : '🚀 Турнир начат!') +
            (opened ? (en ? ' Rounds opened: ' + opened : ' · открыто раундов: ' + opened) : ''), 'success');
        if (typeof vib === 'function') vib([60, 40, 60]);
        if (typeof loadTournaments === 'function') loadTournaments();
        if (typeof loadAdmRounds === 'function') loadAdmRounds();
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function tnFinishTournament(id) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(en ? 'Finish this tournament? Results will be marked as final.' : 'Завершить турнир? Результаты будут помечены как итоговые.')) return;
    db.ref('tournaments/' + id).update({ status: 'completed', finishedAt: Date.now() }).then(function() {
        // Завершение ≠ удаление: счета, введённые на турнире, сохраняем.
        // Открытые раунды этого турнира доводим до «завершён» и записываем
        // в историю игроков — как после обычного финиша раунда.
        return pestovoPreserveTournamentRounds(id).then(function(kept) {
            var extra = kept
                ? (en ? ' · ' + kept + ' round(s) saved to player history' : ' · раундов сохранено в историю игроков: ' + kept)
                : '';
            toast((en ? '🏁 Tournament completed!' : '🏁 Турнир завершён!') + extra, 'success');
            if (typeof loadTournaments === 'function') loadTournaments();
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function tnReopenTournament(id) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(en ? 'Reopen this tournament (back to upcoming)?' : 'Открыть турнир снова (вернуть в предстоящие)?')) return;
    db.ref('tournaments/' + id).update({ status: 'upcoming', finishedAt: null }).then(function() {
        toast(en ? '↩️ Tournament reopened' : '↩️ Турнир снова открыт', 'info');
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// ==========================================
// ГРУППЫ УЧАСТНИКОВ ПО ГАНДИКАПУ (дивизионы)
// Пример: «Мужчины 0–12» (мужчины, HCP 0–12, синие ТИ).
// Хранятся в tournaments/<id>/divisions.
// ==========================================
function tnToggleDivPanel(id) {
    var panel = document.getElementById('tn-div-' + id);
    if (panel) {
        var willOpen = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        tnDivOpen[id] = willOpen;
    }
}

// ── БЛОК «ОБРЕЗКА ГАНДИКАПА» В КАРТОЧКЕ ТУРНИРА ──
// СТОИТ ВЫШЕ групп и умного распределения: сначала админ указывает, будет ли
// гандикап обрезан (процент / максимум по полу), и только потом запускает
// «Умные группы» — те режут по ОБРЕЗАННЫМ гандикапам (tnApplyHcpCut).
// Данные — те же, что у стартового листа: tournaments/<id>/hcpCut.
function tnCutBoxHtml(tnId, tVal) {
    var en = currentLang === 'en';
    var cut = (tVal && typeof tVal.hcpCut === 'object' && tVal.hcpCut) ? tVal.hcpCut : null;
    var cutOn = !!(cut && cut.enabled === true);
    var maxOn = cut
        ? ((cut.maxEnabled === undefined || cut.maxEnabled === null)
            ? ((cut.maxMen !== '' && cut.maxMen != null) || (cut.maxWomen !== '' && cut.maxWomen != null))
            : (cut.maxEnabled === true))
        : false;
    var pct = (cut && cut.percent !== '' && cut.percent != null) ? cut.percent : 90;
    var maxM = (cut && cut.maxMen !== '' && cut.maxMen != null) ? String(cut.maxMen) : '';
    var maxW = (cut && cut.maxWomen !== '' && cut.maxWomen != null) ? String(cut.maxWomen) : '';
    var stateTxt = (cutOn || maxOn)
        ? (en ? 'Cut is ON — smart groups and the start list use the cut handicaps' : 'Обрезка включена — умные группы и стартовый лист считают от обрезанного HCP')
        : (en ? 'Cut is off — handicaps are used as-is' : 'Обрезка выключена — гандикапы используются как есть');
    var html = '<div class="tn-cut-box" style="background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.35);border-radius:10px;padding:10px 12px;margin-bottom:12px;">';
    html += '<div style="font-weight:800;color:var(--gold);font-size:13.5px;margin-bottom:6px;"><i class="fas fa-scissors"></i> ' +
        (en ? 'Handicap cut (this tournament only)' : 'Обрезка гандикапа (только для этого турнира)') + '</div>';
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">';
    html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--white);font-weight:700;">' +
        '<input type="checkbox" id="tn-cut-enabled-' + tnId + '" ' + (cutOn ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer;"> ' +
        (en ? '✂ Cut by percent' : '✂ Обрезать на процент') + '</label>';
    html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--white);font-weight:700;">' +
        '<input type="checkbox" id="tn-cut-max-enabled-' + tnId + '" ' + (maxOn ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer;"> ' +
        (en ? '✂ Cap by gender max' : '✂ Ограничить максимум по полу') + '</label>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">';
    html += '<div class="form-group" style="flex:0 1 120px;margin:0;"><label style="font-size:11px;">' + (en ? 'Percent (e.g. 90 = 90%)' : 'Процент (напр. 90 = 90%)') + '</label>' +
        '<input type="number" id="tn-cut-percent-' + tnId + '" class="form-input" min="1" max="100" step="1" style="padding:7px 10px;font-size:12.5px;" value="' + pct + '"></div>';
    html += '<div class="form-group" style="flex:1 1 110px;margin:0;"><label style="font-size:11px;">' + (en ? 'Max exact HCP — men' : 'Макс. точный HCP — мужчины') + '</label>' +
        '<input type="text" id="tn-cut-maxmen-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" placeholder="' + (en ? 'no limit' : 'без лимита') + '" value="' + maxM.replace(/"/g, '&quot;') + '"></div>';
    html += '<div class="form-group" style="flex:1 1 110px;margin:0;"><label style="font-size:11px;">' + (en ? 'Max exact HCP — women' : 'Макс. точный HCP — девушки') + '</label>' +
        '<input type="text" id="tn-cut-maxwomen-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" placeholder="' + (en ? 'no limit' : 'без лимита') + '" value="' + maxW.replace(/"/g, '&quot;') + '"></div>';
    html += '<button class="btn btn-g btn-sm" onclick="tnApplyCutBox(\'' + tnId + '\')"><i class="fas fa-check"></i> ' + (en ? 'Apply cut' : 'Применить обрезку') + '</button>';
    html += '</div>';
    html += '<div style="font-size:11.5px;color:var(--muted);margin-top:6px;"><i class="fas fa-circle-info"></i> ' + stateTxt + '.</div>';
    html += '<p style="font-size:11px;color:var(--muted);margin:6px 0 0;"><i class="fas fa-circle-info"></i> ' +
        (en ? 'The percent applies first, then the gender max. Course handicap is calculated from the cut exact value. Example: exact 36 → 90% = 32.4 → max 28 → plays off 28.0. After “Apply” the start list and groups recalculate immediately.'
            : 'Сначала применяется процент, затем максимум по полу. Полевой гандикап считается от обрезанного точного. Пример: точный 36 → 90% = 32.4 → макс. 28 → играет с 28.0. После «Применить» стартовый лист и группы пересчитаются сразу.') + '</p>';
    html += '</div>';
    return html;
}

// «Применить обрезку» в карточке турнира: значения — из полей (даже если
// фокус ещё в поле), записываем в tournaments/<id>/hcpCut в том же формате,
// что и стартовый лист (psCutObject), — везде считают одинаково.
function tnApplyCutBox(tnId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    var g = function(id) { return document.getElementById(id); };
    var enCb = g('tn-cut-enabled-' + tnId);
    var maxCb = g('tn-cut-max-enabled-' + tnId);
    var pctEl = g('tn-cut-percent-' + tnId);
    var mmEl = g('tn-cut-maxmen-' + tnId);
    var mwEl = g('tn-cut-maxwomen-' + tnId);
    var cut = { enabled: !!(enCb && enCb.checked), maxEnabled: !!(maxCb && maxCb.checked), percent: 100, maxMen: null, maxWomen: null };
    if (pctEl) {
        var n = parseFloat(pctEl.value);
        cut.percent = isNaN(n) ? 100 : Math.max(1, Math.min(100, n));
    }
    [['maxMen', mmEl], ['maxWomen', mwEl]].forEach(function(pair) {
        if (!pair[1]) return;
        var s = String(pair[1].value == null ? '' : pair[1].value).trim().replace(',', '.');
        if (s === '') return;
        var m = parseFloat(s);
        if (!isNaN(m)) cut[pair[0]] = m;
    });
    // Сколько заявленных участников затронет (по ОБРЕЗАННОМУ HCP).
    var tVal = tnTnVals[tnId];
    var reg = (tVal && tVal.registeredPlayers) || {};
    var total = 0, hit = 0;
    Object.keys(reg).forEach(function(k) {
        var rp = reg[k] || {};
        var raw = (rp.handicap === '' || rp.handicap == null) ? null : parseFloat(rp.handicap);
        if (raw == null || isNaN(raw)) return;
        total++;
        try {
            var eff = tnApplyHcpCut(raw, rp.gender || 'men', cut).effective;
            if (Math.abs(eff - raw) >= 0.049) hit++;
        } catch (e) { console.warn("[silent]", e); }
    });
    db.ref('tournaments/' + tnId + '/hcpCut').set(cut).then(function() {
        var parts = [];
        if (cut.enabled) parts.push(cut.percent + '%');
        if (cut.maxEnabled) {
            var lims = [];
            if (cut.maxMen != null) lims.push((en ? 'men' : 'муж') + ' ≤ ' + cut.maxMen);
            if (cut.maxWomen != null) lims.push((en ? 'women' : 'жен') + ' ≤ ' + cut.maxWomen);
            parts.push((en ? 'max' : 'макс') + (lims.length ? ' (' + lims.join(', ') + ')' : ''));
        }
        if (!parts.length) {
            toast(en ? '✂ Cut is off — start list unchanged' : '✂ Обрезка выключена — стартовый лист без изменений', 'info');
        } else {
            toast((en ? '✂ Cut applied (' : '✂ Обрезка применена (') + parts.join(' + ') + '): ' +
                (en ? 'affects' : 'затронуто') + ' ' + hit + ' / ' + total, 'success');
        }
        if (typeof vib === 'function') vib([40, 30, 40]);
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// Перерисовка только панели «Группы HCP» конкретного турнира (по кэшу
// tnTnVals, без обращения к базе) — для инлайн-редактирования групп.
function tnReRenderDivPanel(tnId) {
    var tVal = tnTnVals[tnId];
    if (!tVal) return;
    var panel = document.getElementById('tn-div-' + tnId);
    if (!panel) return;
    var divs = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tVal) : [];
    panel.innerHTML = tnDivisionsEditorHtml(tnId, divs, tVal);
}

// Селектор формата группы по гандикапу: форматы турнира (+ стандартные),
// пусто — «наследуется» от протокола/турнира.
function tnFormatOptionsHtml(tVal, sel) {
    var en = currentLang === 'en';
    var list = (tVal && Array.isArray(tVal.formats) && tVal.formats.length)
        ? tVal.formats.slice()
        : ['Stroke Play', 'Stableford'];
    var used = {};
    var html = '<option value=""' + (!sel ? ' selected' : '') + '>' + (en ? '— (inherit)' : '— (наследуется)') + '</option>';
    list.forEach(function(f) {
        if (!f || used[f]) return;
        used[f] = true;
        var v = escapeHtml(String(f)).replace(/"/g, '&quot;');
        html += '<option value="' + v + '"' + (String(f) === String(sel || '') ? ' selected' : '') + '>' + escapeHtml(String(f)) + '</option>';
    });
    if (sel && !used[sel]) {
        html += '<option value="' + escapeHtml(String(sel)).replace(/"/g, '&quot;') + '" selected>' + escapeHtml(String(sel)) + '</option>';
    }
    return html;
}

// Синхронизирует ТИ и формат групп по гандикапу обратно в список участников
// турнира (registeredPlayers): игрок «мужчины 0–12 · стабфорд · белые ТИ»
// получает в списке именно эти ТИ и формат.
function tnSyncDivisionsToRoster(tnId) {
    if (typeof db === 'undefined' || !db) return;
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal) return;
        var divisions = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tVal) : [];
        if (!divisions.length) return;
        var reg = tVal.registeredPlayers || {};
        var updates = {};
        Object.keys(reg).forEach(function(k) {
            var rp = reg[k] || {};
            var rawHcp = (rp.handicap === '' || rp.handicap == null) ? null : parseFloat(rp.handicap);
            var gender = rp.gender || 'men';
            var eff = rawHcp;
            if (rawHcp != null && tVal.hcpCut && typeof tnApplyHcpCut === 'function') {
                try { eff = tnApplyHcpCut(rawHcp, gender, tVal.hcpCut).effective; } catch (e) { console.warn("[silent]", e); }
            }
            var d = (typeof tnFindDivision === 'function')
                ? tnFindDivision(tVal, eff, gender, { pid: k, name: rp.name || '' })
                : null;
            if (!d) return;
            if (d.tee) updates['tournaments/' + tnId + '/registeredPlayers/' + k + '/tee'] = d.tee;
            if (d.format) updates['tournaments/' + tnId + '/registeredPlayers/' + k + '/format'] = d.format;
        });
        if (Object.keys(updates).length) {
            return db.ref().update(updates).catch(function() {});
        }
    }).catch(function() {});
}

function tnDivisionsEditorHtml(tnId, divisions, tVal) {
    var en = currentLang === 'en';
    divisions = divisions || [];
    // СНАЧАЛА — обрезка гандикапа (выше групп и умного распределения):
    // админ сначала указывает, будет ли HCP порезан, и только потом
    // запускает умное распределение — оно режет по обрезанным гандикапам.
    var html = tnCutBoxHtml(tnId, tVal || {});
    html += '<div style="font-weight:800;color:var(--gold);font-size:13.5px;margin-bottom:8px;"><i class="fas fa-layer-group"></i> ' +
        (en ? 'Handicap groups' : 'Группы участников по гандикапу') + '</div>';
    if (!divisions.length) {
        html += '<p style="font-size:12px;color:var(--muted);margin:0 0 10px;">' +
            (en ? 'No groups yet. Example: “Men 0–12” (men, HCP 0–12, blue tees) and “Men 12.1–28” (men, HCP 12.1–28, white tees).'
                : 'Групп пока нет. Пример: «Мужчины 0–12» (мужчины, HCP 0–12, синие ТИ) и «Мужчины 12.1–28» (мужчины, HCP 12.1–28, белые ТИ).') + '</p>';
    } else {
        divisions.forEach(function(d) {
            var rg = (typeof tnDivisionRangeText === 'function') ? tnDivisionRangeText(d) : '';
            var g = (typeof tnDivisionGenderText === 'function') ? tnDivisionGenderText(d.gender) : (d.gender || '');
            var teeTxt = d.tee ? t('tee_' + d.tee) : '';
            if (tnDivEditing[tnId] === d.id) {
                // Инлайн-редактирование группы: название, пол, диапазон HCP, ТИ.
                html += '<div class="tn-div-edit" style="background:rgba(255,255,255,0.04);border:1px solid rgba(201,168,76,0.4);border-radius:10px;padding:10px;margin-bottom:8px;">';
                html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">';
                html += '<div class="form-group" style="flex:2 1 150px;margin:0;"><label style="font-size:11px;">' + (en ? 'Group name' : 'Название группы') + '</label>' +
                    '<input type="text" id="tnde-name-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" value="' + String(d.name || '').replace(/"/g, '&quot;') + '"></div>';
                html += '<div class="form-group" style="flex:1 1 100px;margin:0;"><label style="font-size:11px;">' + (en ? 'Gender' : 'Пол') + '</label>' +
                    '<select id="tnde-gender-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' +
                    '<option value="men"' + (d.gender === 'men' ? ' selected' : '') + '>' + (en ? 'Men' : 'Мужчины') + '</option>' +
                    '<option value="women"' + (d.gender === 'women' ? ' selected' : '') + '>' + (en ? 'Women' : 'Девушки') + '</option>' +
                    '<option value="all"' + ((d.gender || 'all') === 'all' ? ' selected' : '') + '>' + (en ? 'All' : 'Все') + '</option></select></div>';
                html += '<div class="form-group" style="flex:0 1 76px;margin:0;"><label style="font-size:11px;">HCP ' + (en ? 'from' : 'от') + '</label>' +
                    '<input type="text" id="tnde-from-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" value="' + (d.hcpFrom === '' || d.hcpFrom == null ? '' : d.hcpFrom) + '"></div>';
                html += '<div class="form-group" style="flex:0 1 76px;margin:0;"><label style="font-size:11px;">HCP ' + (en ? 'to' : 'до') + '</label>' +
                    '<input type="text" id="tnde-to-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" value="' + (d.hcpTo === '' || d.hcpTo == null ? '' : d.hcpTo) + '"></div>';
                html += '<div class="form-group" style="flex:1 1 110px;margin:0;"><label style="font-size:11px;">' + t('tee_select') + '</label>' +
                    '<select id="tnde-tee-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' +
                    '<option value=""' + (!d.tee ? ' selected' : '') + '>—</option><option value="bk"' + (d.tee === 'bk' ? ' selected' : '') + '>' + t('tee_bk') + '</option>' +
                    '<option value="bl"' + (d.tee === 'bl' ? ' selected' : '') + '>' + t('tee_bl') + '</option>' +
                    '<option value="wh"' + (d.tee === 'wh' ? ' selected' : '') + '>' + t('tee_wh') + '</option>' +
                    '<option value="rd"' + (d.tee === 'rd' ? ' selected' : '') + '>' + t('tee_rd') + '</option></select></div>';
                html += '<div class="form-group" style="flex:1 1 150px;margin:0;"><label style="font-size:11px;">' + (en ? 'Format' : 'Формат') + '</label>' +
                    '<select id="tnde-format-' + tnId + '-' + d.id + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' + tnFormatOptionsHtml(tVal, d.format) + '</select></div>';
                html += '<button class="btn btn-g btn-sm" onclick="tnSaveDivision(\'' + tnId + '\',\'' + d.id + '\')"><i class="fas fa-check"></i> ' + (en ? 'Save' : 'Сохранить') + '</button>';
                html += '<button class="btn btn-og btn-sm" onclick="tnCancelEditDiv(\'' + tnId + '\')"><i class="fas fa-xmark"></i> ' + (en ? 'Cancel' : 'Отмена') + '</button>';
                html += '</div></div>';
            } else {
                // Мета: если есть название — только ТИ (название вида
                // «Мужчины 0–12» уже содержит пол и диапазон — не дублируем).
                var fmtTxt = d.format ? escapeHtml(String(d.format)) : '';
                var meta = d.name
                    ? ((teeTxt ? escapeHtml(teeTxt) : '') + (fmtTxt ? ' · ' + fmtTxt : ''))
                    : escapeHtml(g) + (rg ? ' · HCP ' + escapeHtml(rg) : '') + (teeTxt ? ' · ' + escapeHtml(teeTxt) : '') + (fmtTxt ? ' · ' + fmtTxt : '');
                // ✨ — группа создана «Умными группами» (auto): повторный
                // запуск распределителя заменит только такие.
                var autoMark = d.auto === true
                    ? ' <i class="fas fa-wand-magic-sparkles" style="color:var(--gold);font-size:10.5px;" title="' + (en ? 'Created by smart groups' : 'Создана «Умными группами»') + '"></i>'
                    : '';
                // «Умные группы» хранят точный состав — показываем число игроков,
                // чтобы админ сразу видел равенство групп (22/22/22).
                var membersObj = (d.members && typeof d.members === 'object') ? d.members : null;
                var membersTxt = membersObj
                    ? '<span class="tn-div-meta" style="color:var(--blue);"><i class="fas fa-users"></i> ' + Object.keys(membersObj).length + '</span>'
                    : '';
                html += '<div class="tn-div-row"><span class="tn-div-name">' + escapeHtml(d.name || '—') + autoMark + '</span>' +
                    (meta ? '<span class="tn-div-meta">' + meta + '</span>' : '') + membersTxt +
                    '<span style="margin-left:auto;display:flex;gap:6px;">' +
                    '<button class="btn btn-og btn-sm" title="' + (en ? 'Edit group' : 'Изменить группу') + '" onclick="tnEditDivision(\'' + tnId + '\',\'' + d.id + '\')"><i class="fas fa-pen"></i></button>' +
                    '<button class="btn btn-r btn-sm" title="' + (en ? 'Delete group' : 'Удалить группу') + '" onclick="tnDeleteDivision(\'' + tnId + '\',\'' + d.id + '\')"><i class="fas fa-trash"></i></button>' +
                    '</span></div>';
            }
        });
    }
    // Умное создание: РАВНЫЕ по числу игроков группы по фактическим HCP,
    // минимум 3 мужские + 3 женские (С УЧЁТОМ обрезки — блок выше:
    // сначала обрезка, потом распределение).
    var autoCnt = parseInt((tVal && tVal.autoGroupCount) || 0, 10) || 0;
    var cntOpts = '<option value="0"' + (autoCnt === 0 ? ' selected' : '') + '>' + (en ? 'Auto (min. 3)' : 'Авто (мин. 3)') + '</option>';
    [2, 3, 4, 5, 6, 8].forEach(function(n) {
        cntOpts += '<option value="' + n + '"' + (autoCnt === n ? ' selected' : '') + '>' + n + '</option>';
    });
    html += '<div style="margin-top:10px;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">';
    html += '<div class="form-group" style="flex:0 1 170px;margin:0;"><label style="font-size:11px;">' + (en ? 'Groups per gender' : 'Групп на каждый пол') + '</label>' +
        '<select id="tnd-count-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' + cntOpts + '</select></div>';
    html += '<button class="btn btn-g btn-sm" onclick="tnAutoDivisions(\'' + tnId + '\')"><i class="fas fa-wand-magic-sparkles"></i> ' +
        (en ? 'Smart groups (equal counts)' : '✨ Умные группы (поровну игроков)') + '</button>';
    html += '</div>';
    html += '<p style="font-size:11px;color:var(--muted);margin:6px 0 0;"><i class="fas fa-circle-info"></i> ' +
        (en ? 'Groups are equal by player count and go from the lowest handicap (group 1) to the highest. The exact list of players is saved in each group.'
            : 'Группы равны по числу игроков и идут от самых низких гандикапов (группа 1) к высоким. Точный список игроков сохраняется в каждой группе.') + '</p>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:flex-end;">';
    html += '<div class="form-group" style="flex:2 1 150px;margin:0;"><label style="font-size:11px;">' + (en ? 'Group name' : 'Название группы') + '</label>' +
        '<input type="text" id="tnd-name-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" placeholder="' + (en ? 'Men 0–12' : 'Мужчины 0–12') + '"></div>';
    html += '<div class="form-group" style="flex:1 1 100px;margin:0;"><label style="font-size:11px;">' + (en ? 'Gender' : 'Пол') + '</label>' +
        '<select id="tnd-gender-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' +
        '<option value="men">' + (en ? 'Men' : 'Мужчины') + '</option>' +
        '<option value="women">' + (en ? 'Women' : 'Девушки') + '</option>' +
        '<option value="all">' + (en ? 'All' : 'Все') + '</option></select></div>';
    html += '<div class="form-group" style="flex:0 1 76px;margin:0;"><label style="font-size:11px;">HCP ' + (en ? 'from' : 'от') + '</label>' +
        '<input type="text" id="tnd-from-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" placeholder="0"></div>';
    html += '<div class="form-group" style="flex:0 1 76px;margin:0;"><label style="font-size:11px;">HCP ' + (en ? 'to' : 'до') + '</label>' +
        '<input type="text" id="tnd-to-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;" placeholder="12"></div>';
    html += '<div class="form-group" style="flex:1 1 110px;margin:0;"><label style="font-size:11px;">' + t('tee_select') + '</label>' +
        '<select id="tnd-tee-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' +
        '<option value="">—</option><option value="bk">' + t('tee_bk') + '</option><option value="bl">' + t('tee_bl') + '</option>' +
        '<option value="wh">' + t('tee_wh') + '</option><option value="rd">' + t('tee_rd') + '</option></select></div>';
    html += '<div class="form-group" style="flex:1 1 150px;margin:0;"><label style="font-size:11px;">' + (en ? 'Format' : 'Формат') + '</label>' +
        '<select id="tnd-format-' + tnId + '" class="form-input" style="padding:7px 10px;font-size:12.5px;">' + tnFormatOptionsHtml(tVal, '') + '</select></div>';
    html += '<button class="btn btn-g btn-sm" onclick="tnAddDivision(\'' + tnId + '\')"><i class="fas fa-plus"></i> ' + (en ? 'Add' : 'Добавить') + '</button>';
    html += '</div>';
    return html;
}

// Инлайн-редактирование группы: режим правки одной группы + перерисовка
// панели. Данные берутся из кэша tnTnVals (заполняется подпиской).
function tnEditDivision(tnId, divId) {
    tnDivEditing[tnId] = divId;
    tnReRenderDivPanel(tnId);
}

function tnCancelEditDiv(tnId) {
    delete tnDivEditing[tnId];
    tnReRenderDivPanel(tnId);
}

// Сохранение правок группы: имя, пол, HCP от/до, ТИ.
function tnSaveDivision(tnId, divId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    var g = function(id) { return document.getElementById(id); };
    var nameEl = g('tnde-name-' + tnId + '-' + divId);
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
        toast(en ? '⚠️ Enter the group name' : '⚠️ Укажите название группы', 'error');
        if (nameEl && nameEl.focus) nameEl.focus();
        return;
    }
    var from = tnParseDivBound(g('tnde-from-' + tnId + '-' + divId) ? g('tnde-from-' + tnId + '-' + divId).value : '');
    var to = tnParseDivBound(g('tnde-to-' + tnId + '-' + divId) ? g('tnde-to-' + tnId + '-' + divId).value : '');
    if (isNaN(from) || isNaN(to)) {
        toast(en ? '⚠️ Invalid HCP range (use numbers like 0, 12.1)' : '⚠️ Некорректный диапазон HCP (нужны числа, например 0, 12.1)', 'error');
        return;
    }
    if (from !== '' && to !== '' && from > to) {
        toast(en ? '⚠️ “HCP from” must be less than “HCP to”' : '⚠️ «HCP от» должен быть меньше «HCP до»', 'error');
        return;
    }
    var genderEl = g('tnde-gender-' + tnId + '-' + divId);
    var teeEl = g('tnde-tee-' + tnId + '-' + divId);
    var fmtEl = g('tnde-format-' + tnId + '-' + divId);
    delete tnDivEditing[tnId];
    db.ref('tournaments/' + tnId + '/divisions/' + divId).update({
        name: name,
        gender: genderEl ? genderEl.value : 'men',
        hcpFrom: from,
        hcpTo: to,
        tee: teeEl ? teeEl.value : '',
        format: fmtEl ? fmtEl.value : ''
    }).then(function() {
        toast(en ? '✅ Group updated' : '✅ Группа обновлена', 'success');
        try { tnSyncDivisionsToRoster(tnId); } catch (eSync) { console.warn("[silent]", eSync); }
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}


function tnParseDivBound(raw) {
    var s = String(raw == null ? '' : raw).trim().replace(',', '.');
    if (s === '') return '';
    var v = (typeof parseExactHcp === 'function') ? parseExactHcp(s) : parseFloat(s);
    return isNaN(v) ? NaN : Math.round(v * 10) / 10;
}

function tnAddDivision(tnId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    var g = function(id) { return document.getElementById(id); };
    var nameEl = g('tnd-name-' + tnId);
    var name = nameEl ? nameEl.value.trim() : '';
    if (!name) {
        toast(en ? '⚠️ Enter the group name' : '⚠️ Укажите название группы', 'error');
        if (nameEl && nameEl.focus) nameEl.focus();
        return;
    }
    var genderEl = g('tnd-gender-' + tnId);
    var teeEl = g('tnd-tee-' + tnId);
    var fmtEl = g('tnd-format-' + tnId);
    var from = tnParseDivBound(g('tnd-from-' + tnId) ? g('tnd-from-' + tnId).value : '');
    var to = tnParseDivBound(g('tnd-to-' + tnId) ? g('tnd-to-' + tnId).value : '');
    if (isNaN(from) || isNaN(to)) {
        toast(en ? '⚠️ Invalid HCP range (use numbers like 0, 12.1)' : '⚠️ Некорректный диапазон HCP (нужны числа, например 0, 12.1)', 'error');
        return;
    }
    if (from !== '' && to !== '' && from > to) {
        toast(en ? '⚠️ “HCP from” must be less than “HCP to”' : '⚠️ «HCP от» должен быть меньше «HCP до»', 'error');
        return;
    }
    tnDivOpen[tnId] = true;
    db.ref('tournaments/' + tnId + '/divisions').push({
        name: name,
        gender: genderEl ? genderEl.value : 'men',
        hcpFrom: from,
        hcpTo: to,
        tee: teeEl ? teeEl.value : '',
        format: fmtEl ? fmtEl.value : '',
        createdAt: Date.now()
    }).then(function() {
        toast(en ? '✅ Group added' : '✅ Группа добавлена', 'success');
        try { tnSyncDivisionsToRoster(tnId); } catch (eSync) { console.warn("[silent]", eSync); }
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function tnDeleteDivision(tnId, divId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    if (!confirm(en ? 'Delete this handicap group?' : 'Удалить эту группу по гандикапу?')) return;
    tnDivOpen[tnId] = true;
    db.ref('tournaments/' + tnId + '/divisions/' + divId).remove().then(function() {
        toast(en ? 'Group deleted' : 'Группа удалена', 'info');
        try { tnSyncDivisionsToRoster(tnId); } catch (eSync) { console.warn("[silent]", eSync); }
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

// ==========================================
// ВЫЗОВЫ СУДЕЙ/МАРШАЛОВ И УВЕДОМЛЕНИЯ
// ==========================================

// Число для названия умной группы: целые — без «.0», плюсовые — с «+».
function tnBandNum(v) {
    var s = (typeof fmtExactHcp === 'function') ? fmtExactHcp(v) : String(v);
    return String(s).replace(/\.0$/, '');
}

// ── Умные группы: правила распределения ──
//   • МИНИМУМ 3 группы на каждый пол (если игроков этого пола ≥ 3);
//   • больше 3 — только когда игроков реально много: в группе не больше
//     TN_AUTO_MAX_PER_GROUP человек (мягкий предел);
//   • группы РАВНЫ по числу игроков (22/22/22, а не 22/44);
//   • состав каждой группы фиксируется явно (members), поэтому игрок
//     никогда не «теряется» между диапазонами HCP, а группа не бывает пустой;
//   • группы нумеруются по возрастанию гандикапа: 1 — самые низкие HCP.
var TN_AUTO_MIN_PER_GENDER = 3;
var TN_AUTO_MAX_PER_GROUP = 24;

// Сколько групп создавать для n игроков одного пола. wanted — число из поля
// в админке (0/пусто = авто).
function tnAutoGroupCount(n, wanted) {
    n = parseInt(n, 10) || 0;
    if (n <= 0) return 0;
    var cnt = parseInt(wanted, 10);
    if (!cnt || cnt < 1) {
        cnt = Math.max(TN_AUTO_MIN_PER_GENDER, Math.ceil(n / TN_AUTO_MAX_PER_GROUP));
    }
    if (cnt > n) cnt = n;
    return Math.max(1, cnt);
}

// Умное создание групп по гандикапу: участники турнира делятся по полу,
// сортируются по точному HCP и режутся на равные по числу игроков bands
// (по умолчанию 3 мужские + 3 женские). Границы bands — по реальным
// гандикапам участников, чтобы в каждой группе было поровну игроков.
function tnAutoDivisions(tnId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) {
        toast(en ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal) return;
        var reg = tVal.registeredPlayers || {};
        var keys = Object.keys(reg);
        if (!keys.length) {
            toast(en ? '⚠️ No registered players — nobody to split into groups' : '⚠️ Нет заявленных участников — некого делить на группы', 'error');
            return;
        }
        // Дедуп по ФИО: один человек — один голос в разбивке.
        var seen = {};
        var men = [];
        var women = [];
        keys.forEach(function(k) {
            var rp = reg[k] || {};
            var fioKey = '';
            if (typeof getPlayerFioKey === 'function') {
                try { fioKey = getPlayerFioKey(rp); } catch (e) { console.warn("[silent]", e); }
            }
            if (!fioKey) fioKey = String(rp.name || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
            if (fioKey && seen[fioKey]) return;
            if (fioKey) seen[fioKey] = true;
            var h = (rp.handicap === '' || rp.handicap == null) ? null : parseFloat(rp.handicap);
            if (h != null && isNaN(h)) h = null;
            // Обрезка гандикапа (блок в панели выше): режем по ОБРЕЗАННОМУ
            // точному HCP — именно с ним играет игрок, и группы строим от него.
            if (h != null && tVal && tVal.hcpCut && typeof tnApplyHcpCut === 'function') {
                try { h = tnApplyHcpCut(h, rp.gender || 'men', tVal.hcpCut).effective; } catch (e) { console.warn("[silent]", e); }
            }
            var item = { key: k, fioKey: fioKey, name: rp.name || '', hcp: h, sortHcp: (h == null ? 54 : h) };
            if ((rp.gender || 'men') === 'women') women.push(item);
            else men.push(item);
        });

        var bandsOf = function(arr, count) {
            arr.sort(function(a, b) {
                return (a.sortHcp - b.sortHcp) || String(a.name || '').localeCompare(String(b.name || ''));
            });
            var n = arr.length;
            if (!n) return [];
            count = Math.max(1, Math.min(count, n));
            var base = Math.floor(n / count);
            var rem = n % count;
            var bands = [];
            var pos = 0;
            for (var i = 0; i < count; i++) {
                // Лишние игроки распределяются по первым группам — разница
                // в размерах не больше одного человека.
                var take = base + (i < rem ? 1 : 0);
                if (take <= 0) break;
                bands.push(arr.slice(pos, pos + take));
                pos += take;
            }
            return bands;
        };

        var r1 = function(v) { return Math.round(v * 10) / 10; };
        var plan = [];
        // Сколько групп просит админ (0/пусто — авто: минимум 3, но не больше
        // TN_AUTO_MAX_PER_GROUP игроков в группе).
        var wantedEl = document.getElementById('tnd-count-' + tnId);
        var wanted = wantedEl ? wantedEl.value : (tVal.autoGroupCount || 0);
        var addGender = function(arr, gender, teeStrong, teeRest, titleWord) {
            var count = tnAutoGroupCount(arr.length, wanted);
            if (!count) return;
            var bands = bandsOf(arr, count);
            // Границы диапазонов идут «встык»: следующая группа начинается
            // с (максимум предыдущей + 0.1), поэтому у игроков на границе
            // не возникает двух подходящих групп.
            var prevTo = null;
            bands.forEach(function(band, bi) {
                if (!band.length) return; // пустых групп не создаём
                var known = band.map(function(x) { return x.hcp; }).filter(function(v) { return v != null; });
                var mn = known.length ? Math.min.apply(null, known) : 54;
                var mx = known.length ? Math.max.apply(null, known) : 54;
                var from = (prevTo == null) ? r1(mn) : r1(prevTo + 0.1);
                var to = r1(mx);
                if (from > to) from = to;
                prevTo = to;
                // Точный состав группы (ключ заявки → нормализованное ФИО):
                // в ростере и лидерборде группа определяется по составу, а не
                // по границам HCP — игрок на границе не «уплывёт» в соседнюю.
                var members = {};
                band.forEach(function(x) {
                    if (x.key) members[x.key] = x.fioKey || '';
                });
                plan.push({
                    // «Мужчины 1 · 0–12»: номер группы сразу показывает порядок
                    // по гандикапу, скобки с диапазоном не дублируют название.
                    name: titleWord + ' ' + (bi + 1) + ' · ' + tnBandNum(from) + '–' + tnBandNum(to),
                    gender: gender,
                    hcpFrom: from,
                    hcpTo: to,
                    tee: bi === 0 ? teeStrong : teeRest,
                    format: '',
                    count: band.length,
                    bandNo: bi + 1,
                    members: members
                });
            });
        };
        addGender(men, 'men', 'bl', 'wh', en ? 'Men' : 'Мужчины');
        addGender(women, 'women', 'rd', 'rd', en ? 'Women' : 'Девушки');

        if (!plan.length) {
            toast(en ? '⚠️ Nobody to split into groups' : '⚠️ Некого делить на группы', 'error');
            return;
        }
        var preview = plan.map(function(d) {
            return '• ' + d.name + ' (' + d.count + ' ' + (en ? 'pl.' : 'игр.') + ')';
        }).join('\n');
        // Если на турнире включена обрезка — показываем, что границы групп
        // считались от ОБРЕЗАННЫХ гандикапов.
        var cut = (tVal && typeof tVal.hcpCut === 'object' && tVal.hcpCut) ? tVal.hcpCut : null;
        var cutOn = !!(cut && (cut.enabled === true ||
            (cut.maxEnabled !== false && ((cut.maxMen !== '' && cut.maxMen != null) || (cut.maxWomen !== '' && cut.maxWomen != null)))));
        var cutNote = cutOn
            ? (en ? '\n\n✂ Uses the CUT handicaps (cut settings from the block above).' : '\n\n✂ Границы считаются от ОБРЕЗАННЫХ гандикапов (настройки обрезки — в блоке выше).')
            : '';
        var q = en
            ? 'Create ' + plan.length + ' handicap groups by actual handicaps (equal player counts)?\n\n' + preview + cutNote
            : 'Создать ' + plan.length + ' групп по фактическим гандикапам (поровну игроков)?\n\n' + preview + cutNote;
        if (!confirm(q)) return;

        tnDivOpen[tnId] = true;
        var ref = db.ref('tournaments/' + tnId + '/divisions');
        // Повторный запуск: сначала убираем группы, созданные РАЗЫМ умным
        // распределителем (flag auto) — ручные группы админа не трогаем.
        var oldAuto = (typeof tnNormalizeDivisions === 'function')
            ? tnNormalizeDivisions(tVal).filter(function(d) { return d.auto === true; })
            : [];
        var chain = Promise.resolve();
        oldAuto.forEach(function(d) {
            if (!d.id) return;
            chain = chain.then(function() { return ref.child(d.id).remove(); });
        });
        chain = chain.then(function() {
            // Запоминаем выбранное число групп на пол (0 = авто), чтобы
            // повторный запуск и перезагрузка страницы сохраняли настройку.
            return db.ref('tournaments/' + tnId + '/autoGroupCount')
                .set(parseInt(wanted, 10) || 0).catch(function() {});
        });
        chain = chain.then(function() {
            var c = Promise.resolve();
            plan.forEach(function(d) {
                c = c.then(function() {
                    return ref.push({
                        name: d.name,
                        gender: d.gender,
                        hcpFrom: d.hcpFrom,
                        hcpTo: d.hcpTo,
                        tee: d.tee,
                        format: d.format || '',
                        members: d.members || {},
                        bandNo: d.bandNo || null,
                        createdAt: Date.now(),
                        auto: true
                    });
                });
            });
            return c;
        });
        chain.then(function() {
            var menN = plan.filter(function(d) { return d.gender === 'men'; }).length;
            var womenN = plan.filter(function(d) { return d.gender === 'women'; }).length;
            // ТИ групп уходят обратно в список участников турнира: игроки
            // «Мужчины 0–12» получают синие ТИ, «Девушки» — красные и т.д.
            try { tnSyncDivisionsToRoster(tnId); } catch (eSync) { console.warn("[silent]", eSync); }
            toast((en ? '✨ Smart groups created: ' : '✨ Умные группы созданы: ') + plan.length +
                ' (' + (en ? 'men ' : 'муж. ') + menN + (en ? ', women ' : ', жен. ') + womenN + ')', 'success');
        }).catch(function(err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}
