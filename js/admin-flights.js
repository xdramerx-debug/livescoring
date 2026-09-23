// js/admin-flights.js — «Автоматическая разбивка на флайты» (вкладка «Турниры»)
// админки; вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули).
// Модалка flight-gen-modal: настройки (размер/старт/интервал), предпросмотр
// с расстановкой игроков, создание раундов. Зависимостей от остального
// admin.js нет — только runtime-глобалы (db, toast, t, escapeHtml, currentLang)
// и guarded-вызовы (normalizeSearchText, fmtExactHcp, fmtTeePill,
// loadTournaments, loadAdmRounds). Грузится в admin.html рядом с admin.js.

// ==========================================
// АВТОМАТИЧЕСКАЯ РАЗБИВКА НА ФЛАЙТЫ
// ==========================================
// Состояние предпросмотра флайтов: состав, формат каждого флайта, настройки.
var fgPreviewState = null;
var fgPlayersCount = 0;

// Дедуп по uid/имени: один человек не должен попасть в два флайта.
function fgCollectPlayers(tVal) {
    var normOf = function(nm) {
        if (typeof normalizeSearchText === 'function') {
            try { return normalizeSearchText(nm); } catch (e) { console.warn("[silent]", e); }
        }
        return String(nm || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    };
    var seen = {};
    var players = [];
    Object.keys((tVal && tVal.registeredPlayers) || {}).forEach(function(rk) {
        var rp = tVal.registeredPlayers[rk] || {};
        var key = rp.uid ? ('uid:' + rp.uid) : ('name:' + normOf(rp.name));
        if (!key || seen[key]) return;
        seen[key] = true;
        players.push({ key: rk, rp: rp });
    });
    return players;
}

// Варианты формата для флайта: сначала форматы турнира, потом общие.
function fgFlightFormatOptions(tVal) {
    var out = [];
    var seen = {};
    var push = function(f) {
        if (!f || seen[f]) return;
        seen[f] = true;
        out.push(f);
    };
    ((tVal && tVal.formats) || []).forEach(push);
    if (typeof PESTOVO_FORMAT_PRESETS !== 'undefined') PESTOVO_FORMAT_PRESETS.forEach(push);
    else ['Stroke Play', 'Stroke Play (Gross)', 'Stroke Play (Net)', 'Stableford', 'Match Play 1v1', 'Scramble'].forEach(push);
    return out;
}

function fgFormatLabel(f) {
    if (typeof pestovoFormatLabel === 'function') {
        try { return pestovoFormatLabel(f); } catch (e) { console.warn("[silent]", e); }
    }
    return String(f);
}

function fgFlightSizes(total, size) {
    if (typeof pestovoBalancedFlightSizes === 'function') {
        try { return pestovoBalancedFlightSizes(total, size); } catch (e) { console.warn("[silent]", e); }
    }
    // Запасной вариант: обычная нарезка (без балансировки).
    var out = [];
    var left = total;
    while (left > size) { out.push(size); left -= size; }
    if (left > 0) out.push(left);
    return out;
}

// Строка-подсказка: как разобьются игроки при выбранном размере.
function fgSizesPreviewText(total, size) {
    var en = currentLang === 'en';
    var sizes = fgFlightSizes(total, size);
    if (!sizes.length) return '';
    var txt = sizes.join(' + ');
    var small = sizes.filter(function(x) { return x < 3; });
    var warn = '';
    if (size >= 3 && small.length) {
        warn = ' <span style="color:var(--red,#e74c3c);">⚠️ ' +
            (en ? 'a flight of 2 is unavoidable — add players or pick pairs' : 'двойки не избежать — добавьте игроков или выберите пары') + '</span>';
    }
    return (en ? 'Flights: ' : 'Флайты: ') + '<b>' + txt + '</b>' + warn;
}

function fgUpdateSizesPreview() {
    var sizeEl = document.getElementById('fg-size');
    var prevEl = document.getElementById('fg-sizes-preview');
    if (!sizeEl || !prevEl) return;
    var size = parseInt(sizeEl.value, 10) || 4;
    prevEl.innerHTML = fgSizesPreviewText(fgPlayersCount, size);
}

// Шаг 1: настройки разбивки.
function fgSettingsHtml(tnId, tVal, players, d) {
    d = d || {};
    var en = currentLang === 'en';
    var html = '<h2 style="color:var(--gold);margin-bottom:8px;"><i class="fas fa-users-gear"></i> ' + (en ? 'Flight Generator' : 'Разбивка на Флайты') + '</h2>';
    html += '<p style="font-size:13px;color:var(--muted);margin-bottom:20px;">' + (en ? 'Total participants: ' : 'Всего участников: ') + '<b>' + players.length + '</b></p>';

    html += '<div class="card" style="background:var(--input);padding:16px;text-align:left;margin-bottom:12px;">';
    html += '<div class="form-group"><label>' + (en ? 'Players per flight:' : 'Игроков во флайте:') + '</label>';
    var p4Str = en ? '4 Players' : '4 игрока';
    var p3Str = en ? '3 Players' : '3 игрока';
    var p2Str = en ? '2 Players' : '2 игрока';
    var sz = d.size || '4';
    html += '<select id="fg-size" class="form-input" onchange="fgUpdateSizesPreview()">' +
        '<option value="4"' + (sz === '4' ? ' selected' : '') + '>' + p4Str + '</option>' +
        '<option value="3"' + (sz === '3' ? ' selected' : '') + '>' + p3Str + '</option>' +
        '<option value="2"' + (sz === '2' ? ' selected' : '') + '>' + p2Str + '</option></select></div>';
    html += '<div id="fg-sizes-preview" style="font-size:12.5px;color:var(--muted);margin:-6px 0 10px;"></div>';

    html += '<div class="form-group"><label>' + (en ? 'First Flight Start Time:' : 'Время старта 1-го флайта:') + '</label>';
    html += '<input type="time" id="fg-time" class="form-input" value="' + escapeHtml(d.time || '10:00') + '"></div>';

    html += '<div class="form-group"><label>' + (en ? 'Interval between flights (min):' : 'Интервал между флайтами (мин):') + '</label>';
    html += '<input type="number" id="fg-interval" class="form-input" value="' + escapeHtml(d.interval || '10') + '" min="5" max="30"></div>';
    html += '</div>';

    html += '<div style="display:flex;gap:12px;">';
    html += '<button class="btn btn-og" style="flex:1;" onclick="closeFlightGenModal()">' + t('cancel_btn') + '</button>';
    html += '<button class="btn btn-g" style="flex:1;" onclick="fgBuildPreview(\'' + tnId + '\')"><i class="fas fa-eye"></i> ' + (en ? 'Preview' : 'Предпросмотр') + '</button>';
    html += '</div>';
    return html;
}

function openFlightGeneratorModal(tnId) {
    if (typeof db === 'undefined') return;
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal || !tVal.registeredPlayers) {
            toast(currentLang === 'en' ? 'No registered players for this tournament' : 'Нет зарегистрированных участников для разбивки', 'error');
            return;
        }

        var players = fgCollectPlayers(tVal);
        if (!players.length) {
            toast(currentLang === 'en' ? 'No registered players for this tournament' : 'Нет зарегистрированных участников для разбивки', 'error');
            return;
        }
        fgPlayersCount = players.length;
        fgPreviewState = null;

        var modalEl = document.getElementById('flight-gen-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'flight-gen-modal';
            modalEl.className = 'modal hidden';
            modalEl.innerHTML =
                '<div class="modal-bg" onclick="closeFlightGenModal()"></div>' +
                '<div class="modal-body" style="max-width:640px;text-align:center;">' +
                '<div class="modal-top-bar">' +
                '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeFlightGenModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
                '<button type="button" class="modal-close-btn" onclick="closeFlightGenModal()">&times;</button>' +
                '</div>' +
                '<div id="flight-gen-modal-body"></div>' +
                '</div>';
            if (document.body) document.body.appendChild(modalEl);
        }

        var bodyEl = document.getElementById('flight-gen-modal-body');
        bodyEl.innerHTML = fgSettingsHtml(tnId, tVal, players, { size: '4', time: '10:00', interval: '10' });
        fgUpdateSizesPreview();
        modalEl.classList.remove('hidden');
    });
}

function closeFlightGenModal() {
    var modalEl = document.getElementById('flight-gen-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

// Шаг 2: строим предпросмотр флайтов по настройкам шага 1.
function fgBuildPreview(tnId) {
    if (typeof db === 'undefined') return;
    var sizeEl = document.getElementById('fg-size');
    var timeEl = document.getElementById('fg-time');
    var intEl = document.getElementById('fg-interval');
    var flightSize = Math.min(4, Math.max(1, parseInt(sizeEl ? sizeEl.value : '4', 10) || 4));
    var settings = {
        size: String(flightSize),
        time: (timeEl && timeEl.value) || '10:00',
        interval: String(parseInt(intEl ? intEl.value : '10', 10) || 10)
    };
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal || !tVal.registeredPlayers) return;
        var players = fgCollectPlayers(tVal);
        if (!players.length) return;
        var sizes = fgFlightSizes(players.length, flightSize);
        var defFormat = (tVal.formats && tVal.formats[0]) || 'Stroke Play';
        var flights = [];
        var pos = 0;
        sizes.forEach(function(sz) {
            flights.push({ players: players.slice(pos, pos + sz), format: defFormat });
            pos += sz;
        });
        fgPreviewState = { tnId: tnId, flights: flights, settings: settings };
        fgPlayersCount = players.length;
        fgRenderPreview(tVal);
    });
}

function fgFlightTimeStr(tVal, settings, idx) {
    var parts = String(settings.time || '10:00').split(':');
    var baseTs = (typeof tnDateTs === 'function') ? tnDateTs(tVal.date) : Date.parse(tVal.date);
    if (!baseTs || isNaN(baseTs)) baseTs = Date.now();
    var now = new Date(baseTs);
    var ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        parseInt(parts[0], 10) || 10, parseInt(parts[1], 10) || 0, 0).getTime();
    ts += idx * (parseInt(settings.interval, 10) || 10) * 60000;
    return (typeof fmtTime === 'function') ? fmtTime(ts) : settings.time;
}

// Шаг 2: отрисовка предпросмотра — формат на каждый флайт + перемещение игроков.
function fgRenderPreview(tVal) {
    var st = fgPreviewState;
    if (!st) return;
    var en = currentLang === 'en';
    var bodyEl = document.getElementById('flight-gen-modal-body');
    if (!bodyEl) return;
    var formats = fgFlightFormatOptions(tVal);

    var html = '<h2 style="color:var(--gold);margin-bottom:4px;"><i class="fas fa-eye"></i> ' + (en ? 'Flights Preview' : 'Предпросмотр флайтов') + '</h2>';
    html += '<p style="font-size:12px;color:var(--muted);margin-bottom:12px;">' +
        (en ? 'Set a format per flight, move players with arrows.' : 'Формат — свой у каждого флайта, игроков двигайте стрелками.') + '</p>';

    html += '<div class="card" style="background:var(--input);padding:12px 14px;text-align:left;margin-bottom:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">';
    html += '<div class="form-group" style="flex:1;min-width:120px;margin:0;"><label style="font-size:11px;">' + (en ? 'First flight:' : 'Первый флайт:') + '</label>' +
        '<input type="time" id="fg-time" class="form-input" value="' + escapeHtml(st.settings.time) + '"></div>';
    html += '<div class="form-group" style="flex:1;min-width:120px;margin:0;"><label style="font-size:11px;">' + (en ? 'Interval (min):' : 'Интервал (мин):') + '</label>' +
        '<input type="number" id="fg-interval" class="form-input" value="' + escapeHtml(st.settings.interval) + '" min="5" max="30"></div>';
    html += '</div>';

    st.flights.forEach(function(fl, fi) {
        var timeStr = fgFlightTimeStr(tVal, st.settings, fi);
        var smallWarn = (fl.players.length > 0 && fl.players.length < 3)
            ? ' <span style="color:var(--red,#e74c3c);font-size:11px;">⚠️ ' + (en ? 'less than 3 players' : 'меньше 3 игроков') + '</span>' : '';
        html += '<div class="card" style="background:var(--input);padding:12px 14px;text-align:left;margin-bottom:10px;">';
        html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">';
        html += '<b style="color:var(--white);font-size:13.5px;">' + (en ? 'Flight ' : 'Флайт ') + (fi + 1) + ' · ' + timeStr + '</b>' + smallWarn;
        html += '<select class="form-input" style="flex:1;min-width:150px;padding:6px 8px;font-size:12px;" onchange="fgSetFlightFormat(' + fi + ',this.value)">';
        formats.forEach(function(f) {
            html += '<option value="' + f.replace(/"/g, '&quot;') + '"' + (fl.format === f ? ' selected' : '') + '>' + fgFormatLabel(f) + '</option>';
        });
        html += '</select></div>';
        if (!fl.players.length) {
            html += '<div style="font-size:12px;color:var(--muted);">' + (en ? 'Empty flight — will be skipped' : 'Пустой флайт — будет пропущен') + '</div>';
        }
        fl.players.forEach(function(item, pi) {
            var rp = item.rp || {};
            var hcpTxt = '—';
            if (rp.handicap != null && rp.handicap !== '') {
                var hv = parseFloat(rp.handicap);
                // handicap — пользовательское поле из Firebase: при нечисловом
                // значении строка попадает на экран как есть, поэтому экранируем.
                hcpTxt = isNaN(hv) ? escapeHtml(String(rp.handicap)) : ((typeof fmtExactHcp === 'function') ? fmtExactHcp(hv) : String(hv));
            }
            var teePill = '';
            try { teePill = (typeof fmtTeePill === 'function') ? fmtTeePill(rp.tee || 'wh') : ''; } catch (e) { console.warn("[silent]", e); }
            html += '<div style="display:flex;align-items:center;gap:6px;font-size:12.5px;padding:5px 8px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:4px;">';
            html += '<span style="color:var(--white);font-weight:600;flex:1;min-width:90px;">' + escapeHtml(rp.name || 'Player') + '</span> ' + teePill;
            html += '<span style="color:var(--muted);font-size:11.5px;">HCP ' + hcpTxt + '</span>';
            html += '<span style="display:flex;gap:3px;">';
            html += '<button class="btn btn-og btn-sm" style="padding:3px 7px;" title="↑" onclick="fgMovePlayer(' + fi + ',' + pi + ',\'up\')">↑</button>';
            html += '<button class="btn btn-og btn-sm" style="padding:3px 7px;" title="↓" onclick="fgMovePlayer(' + fi + ',' + pi + ',\'down\')">↓</button>';
            html += '<button class="btn btn-og btn-sm" style="padding:3px 7px;" title="←" onclick="fgMovePlayer(' + fi + ',' + pi + ',\'prev\')">←</button>';
            html += '<button class="btn btn-og btn-sm" style="padding:3px 7px;" title="→" onclick="fgMovePlayer(' + fi + ',' + pi + ',\'next\')">→</button>';
            html += '</span></div>';
        });
        html += '</div>';
    });

    html += '<div style="display:flex;gap:12px;margin-top:4px;">';
    html += '<button class="btn btn-og" style="flex:1;" onclick="fgBackToSettings()"><i class="fas fa-arrow-left"></i> ' + (en ? 'Settings' : 'Настройки') + '</button>';
    html += '<button class="btn btn-g" style="flex:1;" onclick="confirmFlightGeneration(\'' + st.tnId + '\')"><i class="fas fa-play"></i> ' + (en ? 'Create Flights' : 'Создать флайты') + '</button>';
    html += '</div>';

    bodyEl.innerHTML = html;
}

function fgSetFlightFormat(fi, value) {
    if (fgPreviewState && fgPreviewState.flights[fi]) {
        fgPreviewState.flights[fi].format = value;
    }
}

// Перемещение игрока: up/down — внутри флайта, prev/next — в соседний флайт.
function fgMovePlayer(fi, pi, dir) {
    var st = fgPreviewState;
    if (!st || !st.flights[fi]) return;
    if (dir === 'up' || dir === 'down') {
        var arr = st.flights[fi].players;
        var ni = dir === 'up' ? pi - 1 : pi + 1;
        if (ni < 0 || ni >= arr.length) return;
        var tmp = arr[pi]; arr[pi] = arr[ni]; arr[ni] = tmp;
    } else {
        var nfi = dir === 'prev' ? fi - 1 : fi + 1;
        if (nfi < 0 || nfi >= st.flights.length) return;
        var moved = st.flights[fi].players.splice(pi, 1)[0];
        if (!moved) return;
        st.flights[nfi].players.push(moved);
    }
    if (typeof db === 'undefined') return;
    db.ref('tournaments/' + st.tnId).once('value').then(function(sn) {
        // Время/интервал могли поменять — забираем из полей перед перерисовкой.
        var timeEl = document.getElementById('fg-time');
        var intEl = document.getElementById('fg-interval');
        if (timeEl && timeEl.value) st.settings.time = timeEl.value;
        if (intEl && intEl.value) st.settings.interval = intEl.value;
        fgRenderPreview(sn.val());
    });
}

function fgBackToSettings() {
    var st = fgPreviewState;
    if (!st || typeof db === 'undefined') return;
    db.ref('tournaments/' + st.tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal) return;
        var timeEl = document.getElementById('fg-time');
        var intEl = document.getElementById('fg-interval');
        if (timeEl && timeEl.value) st.settings.time = timeEl.value;
        if (intEl && intEl.value) st.settings.interval = intEl.value;
        var players = fgCollectPlayers(tVal);
        fgPlayersCount = players.length;
        var bodyEl = document.getElementById('flight-gen-modal-body');
        if (bodyEl) bodyEl.innerHTML = fgSettingsHtml(st.tnId, tVal, players, st.settings);
        fgUpdateSizesPreview();
    });
}

// Сверяем предпросмотр с актуальными заявками: убранных игроков выкидываем,
// новых — добавляем в последний флайт, пустые флайты удаляем.
function fgSyncStatePlayers(st, players) {
    var byKey = {};
    players.forEach(function(item) { byKey[item.key] = item; });
    var seenKeys = {};
    st.flights.forEach(function(fl) {
        fl.players = fl.players.filter(function(item) {
            if (!byKey[item.key]) return false;
            if (seenKeys[item.key]) return false;
            seenKeys[item.key] = true;
            return true;
        });
    });
    var missing = players.filter(function(item) { return !seenKeys[item.key]; });
    if (missing.length && st.flights.length) {
        st.flights[st.flights.length - 1].players =
            st.flights[st.flights.length - 1].players.concat(missing);
    }
    st.flights = st.flights.filter(function(fl) { return fl.players.length > 0; });
}

function confirmFlightGeneration(tnId) {
    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        return;
    }
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal || !tVal.registeredPlayers) return;

        var players = fgCollectPlayers(tVal);
        if (!players.length) return;

        var st = (fgPreviewState && fgPreviewState.tnId === tnId) ? fgPreviewState : null;
        if (!st || !st.flights || !st.flights.length) {
            // Прямой путь без предпросмотра: сбалансированная нарезка.
            var sizeEl = document.getElementById('fg-size');
            var flightSize = Math.min(4, Math.max(1, parseInt(sizeEl ? sizeEl.value : '4', 10) || 4));
            var sizes = fgFlightSizes(players.length, flightSize);
            var defFormat = (tVal.formats && tVal.formats[0]) || 'Stroke Play';
            var flights = [];
            var pos = 0;
            sizes.forEach(function(sz) {
                flights.push({ players: players.slice(pos, pos + sz), format: defFormat });
                pos += sz;
            });
            var timeEl = document.getElementById('fg-time');
            var intEl = document.getElementById('fg-interval');
            st = {
                tnId: tnId,
                flights: flights,
                settings: {
                    size: String(flightSize),
                    time: (timeEl && timeEl.value) || '10:00',
                    interval: String(parseInt(intEl ? intEl.value : '10', 10) || 10)
                }
            };
        } else {
            // Забираем время/интервал из полей предпросмотра.
            var pTimeEl = document.getElementById('fg-time');
            var pIntEl = document.getElementById('fg-interval');
            if (pTimeEl && pTimeEl.value) st.settings.time = pTimeEl.value;
            if (pIntEl && pIntEl.value) st.settings.interval = pIntEl.value;
            fgSyncStatePlayers(st, players);
        }
        if (!st.flights.length) {
            toast(currentLang === 'en' ? 'No players for flights' : 'Нет игроков для флайтов', 'error');
            return;
        }

        var parts = String(st.settings.time || '10:00').split(':');
        // Дату турнира разбираем как локальную (tnDateTs), иначе старт
        // уедет на день назад из-за UTC-полуночи.
        var baseTs = (typeof tnDateTs === 'function') ? tnDateTs(tVal.date) : Date.parse(tVal.date);
        if (!baseTs || isNaN(baseTs)) baseTs = Date.now();
        var now = new Date(baseTs);
        var baseStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(parts[0], 10) || 10, parseInt(parts[1], 10) || 0, 0).getTime();
        var intervalMin = parseInt(st.settings.interval, 10) || 10;

        var tournamentTees = tVal.tees || ['wh'];
        var tournamentFormat = (tVal.formats && tVal.formats[0]) || 'Stroke Play';

        var flightsCreated = 0;

        st.flights.forEach(function(fl) {
            if (!fl.players.length) return;
            var flightStartTime = baseStartTime + (flightsCreated * intervalMin * 60000);
            var roundPlayers = {};
            var pOrder = [];

            fl.players.forEach(function(item) {
                var rp = item.rp;
                // Гостям — стабильный ключ заявки, а не Date.now()+idx:
                // старый вариант давал одинаковые pid в разных флайтах.
                var pid = rp.uid || ('guest_' + item.key);
                var tee = rp.tee || tournamentTees[0];
                var gender = rp.gender || 'men';
                var exactHcp = (rp.handicap == null || rp.handicap === '') ? 0 : rp.handicap;
                var fieldHcp = (typeof getFieldHcp === 'function')
                    ? getFieldHcp(exactHcp, tee, gender)
                    : Math.round(parseFloat(exactHcp) || 0);

                roundPlayers[pid] = {
                    name: rp.name || 'Player',
                    exactHcp: exactHcp,
                    fieldHcp: fieldHcp,
                    gender: gender,
                    tee: tee,
                    scores: {},
                    markerScores: {},
                    submitted: {},
                    markerSubmitted: {},
                    verified: {}
                };
                pOrder.push(pid);
            });

            var markerAssignments = {};
            for (var m = 0; m < pOrder.length; m++) {
                var mId = pOrder[m];
                var tId = pOrder[(m + 1) % pOrder.length];
                roundPlayers[tId].markedBy = mId;
                markerAssignments[mId] = { targetId: tId, targetName: roundPlayers[tId].name };
            }

            var roundData = {
                mode: 'group',
                tee: tournamentTees[0],
                format: fl.format || tournamentFormat,
                startHole: 1,
                startTime: flightStartTime,
                players: roundPlayers,
                markerAssignments: markerAssignments,
                participantsList: pOrder,
                status: 'active',
                tournamentId: tnId,
                tournamentName: tVal.name || '',
                createdAt: Date.now(),
                createdBy: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : 'admin',
                accessKey: 'group_key_' + Math.random().toString(36).substring(2)
            };

            db.ref('rounds').push(roundData);
            flightsCreated++;
        });

        db.ref('tournaments/' + tnId).update({ status: 'active', startedAt: Date.now() }).then(function() {
            fgPreviewState = null;
            toast((currentLang === 'en' ? '🎉 Created ' : '🎉 Создано ') + flightsCreated + (currentLang === 'en' ? ' active flights!' : ' активных флайтов!'), 'success');
            closeFlightGenModal();
            if (typeof loadTournaments === 'function') loadTournaments();
            if (typeof loadAdmRounds === 'function') loadAdmRounds();
        }).catch(function(err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}
