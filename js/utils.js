// NOTE: shared foundations were extracted and are loaded BEFORE this file
// on every page: js/course-config.js (course data), js/format.js (score
// formatting), js/safe-html.js (esc/html`` builder), js/dom.js (toast/vibrate/
// escapeHtml). Do not re-add them here.

function baseUrl(){var loc=window.location,path=loc.pathname,dir=path.substring(0,path.lastIndexOf('/')+1);return loc.origin+dir;}
function qrUrl(data){return'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(data);}
// NOTE: escapeHtml() now lives in js/dom.js (loaded before utils.js).

// Одна Firebase-подписка на логический виджет. Повторный рендер (например, при
// смене языка или фильтра) переиспользует последний снимок, не создавая дублей.
var realtimeValueBindings = Object.create(null);
function bindRealtimeValue(key, firebaseRef, render) {
    if (!key || !firebaseRef || typeof render !== 'function') return;
    var binding = realtimeValueBindings[key];
    if (!binding) {
        binding = realtimeValueBindings[key] = { render: render, snapshot: null };
        firebaseRef.on('value', function(snapshot) {
            binding.snapshot = snapshot;
            binding.render(snapshot);
        }, function(error) {
            console.error('[Firebase] ' + key + ':', error);
        });
    } else {
        binding.render = render;
        if (binding.snapshot) binding.render(binding.snapshot);
    }
}


// Глобальный fallback для битых <img> (заменяет инлайн-обработчики onerror — лучше для CSP).
// Слушаем в фазе capture: ошибки ресурсов не всплывают.
document.addEventListener('error', function(e) {
    var el = e && e.target;
    if (el && el.tagName === 'IMG') { el.style.display = 'none'; }
}, true);

// ==========================================
// ЗАПИСЬ В БД С ПОДДЕРЖКОЙ ОФЛАЙНА
// Без сети промис Firebase не резолвится до восстановления соединения —
// UI «замирал» после «Сохранить», а перезагрузка страницы теряла счёт.
// Дублируем запись в локальную очередь (js/pwa.js) и сразу продолжаем.
// ==========================================
function isOfflineNow() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}
function sanitizeNameRaw(str){
    if(str===null||str===undefined)return'';
    var s=String(str);
    s=s.replace(/[<>&"'`{}\\\/\[\]();:]/g,'');   // потенциально опасная для HTML разметка
    s=s.replace(/\s+/g,' ').trim();
    if(s.length>60)s=s.substring(0,60).trim();
    return s;
}


// ==========================================
// БЛОК «МОИ АКТИВНЫЕ РАУНДЫ»
// ==========================================
function loadMyActiveRounds(targetId) {
    var el = document.getElementById(targetId);
    if (!el || typeof db === 'undefined') return;

    bindRealtimeValue('my-active-rounds:' + targetId, db.ref('rounds'), function(snap) {
        var data = snap.val() || {};
        if (typeof sweepStaleRounds === 'function') data = sweepStaleRounds(data) || {};
        var myActive = [];

        Object.entries(data).forEach(function(e) {
            var id = e[0], r = e[1];
            if (!r || r.status !== 'active') return;

            var localSoloKey = localStorage.getItem('pestovo_solo_key_' + id);
            var localGroupKey = localStorage.getItem('pestovo_group_key_' + id);
            var localActingAs = localStorage.getItem('pestovo_acting_as_' + id);

            var isCreatedByMe = false;
            var resumePid = null;

            if (currentUser && r.createdBy === currentUser.uid) {
                isCreatedByMe = true;
            } else if (localSoloKey && r.accessKey === localSoloKey) {
                isCreatedByMe = true;
            } else if (localGroupKey && r.accessKey === localGroupKey) {
                isCreatedByMe = true;
            } else if (currentUser && r.players && r.players[currentUser.uid]) {
                isCreatedByMe = true;
            } else if (localActingAs && r.players && r.players[localActingAs]) {
                isCreatedByMe = true;
            }

            if (isCreatedByMe) {
                // Жёстко прописываем ?as=<игрок>: даже если localStorage
                // стёрся (другое устройство/кэш), продолжение НЕ откроется
                // в режиме «только просмотр».
                if (localActingAs && r.players && r.players[localActingAs]) resumePid = localActingAs;
                else if (currentUser && r.players && r.players[currentUser.uid]) resumePid = currentUser.uid;
                else if (r.creatorPlayerId && r.players && r.players[r.creatorPlayerId]) resumePid = r.creatorPlayerId;
                else if (r.mode === 'solo') resumePid = Object.keys(r.players || {})[0] || null;
                myActive.push({ id: id, round: r, resumePid: resumePid });
            }
        });

        if (myActive.length === 0) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }

        myActive.sort(function(a, b) { return (b.round.createdAt || 0) - (a.round.createdAt || 0); });

        var html = '<div class="card" style="border:2px solid var(--gold);background:linear-gradient(135deg, rgba(201,168,76,0.12), var(--card));margin-bottom:24px;">';
        html += '<h2 style="color:var(--gold);margin-bottom:12px;"><i class="fas fa-play-circle"></i> ' + t('sec_my_active') + '</h2>';
        html += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">' + (currentLang === 'en' ? 'You have an active round in progress:' : 'У вас есть начатый раунд. Нажмите, чтобы продолжить игру:') + '</p>';

        myActive.forEach(function(item) {
            var id = item.id, r = item.round;
            var link = 'setup-round.html?round=' + id + (item.resumePid ? '&as=' + encodeURIComponent(item.resumePid) : '');
            var modeIcon = r.mode === 'solo' ? '<i class="fas fa-user"></i> ' + t('solo_round') : '<i class="fas fa-users"></i> ' + t('group_round');
            var teePill = fmtRoundTeePills(r);
            var resume = getRoundResumeState(id, r);
            var pace = resume.metrics;
            var paceState = resume.closed
                ? { key: 'done', status: 'done', color: '#2ecc71', label: (currentLang === 'en' ? 'Finished' : 'Завершён') }
                : paceStatus(pace.overallDelay);
            var progressPercent = resume.holeCount ? Math.min(100, Math.round((resume.holesPlayed / resume.holeCount) * 100)) : 0;
            var playersCount = Object.keys(r.players || {}).length;
            var progressLabel = currentLang === 'en' ? 'Progress' : 'Прогресс';
            var currentHoleLabel = currentLang === 'en' ? 'Current hole' : 'Текущая лунка';
            var paceLabel = currentLang === 'en' ? 'Pace' : 'Темп';

            html += '<div class="list-item resume-round-card" style="padding:16px;background:var(--input);border:1px solid var(--border);margin-bottom:10px;flex-wrap:wrap;gap:12px;">';
            html += '<div style="flex:1;min-width:200px;">';
            html += '<div style="font-weight:800;font-size:16px;color:var(--white);"><span class="live-dot" style="width:7px;height:7px;margin-right:6px;"></span> ' + t('brand_name') + ' · ' + modeIcon + '</div>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' +
                    t('start') + ': ' + fmtTime(r.startTime) + ' · ' + t('hole') + ': №' + (r.startHole || 1) + ' · ' + t('tee_select') + ': ' + teePill + ' · ' + t('player') + ': ' + playersCount + '</div>';
            html += '<div class="resume-round-meta">' +
                    '<span><b>' + currentHoleLabel + ':</b> ' + (resume.closed ? escapeHtml(resume.statusText) : '№' + resume.currentHole) + '</span>' +
                    '<span><b>' + progressLabel + ':</b> ' + resume.holesPlayed + '/' + resume.holeCount + '</span>' +
                    '<span style="color:' + paceState.color + '"><b>' + paceLabel + ':</b> ' + formatPaceDelta(pace.overallDelay) + '</span>' +
                    '</div>';
            html += '<div class="resume-progress-track" aria-label="' + progressLabel + '">' +
                    '<span style="width:' + progressPercent + '%;background:' + paceState.color + ';"></span></div>';
            html += '</div>';
            html += '<a href="' + link + '" class="btn btn-g resume-round-button" style="align-self:center;"><i class="fas fa-gamepad"></i> ' + t('continue_round') + '</a>';
            html += '</div>';
        });

        html += '</div>';
        el.innerHTML = html;
        el.classList.remove('hidden');
    });
}

// ==========================================
// СЕССИЯ ИГРОКА ПО ФИО (1 активная сессия)
// ==========================================
// Стирание ВСЕХ локальных игровых сессий (после «Удалить все данные»
// в админке): ключи доступа к раундам, роль «действующего игрока»,
// сохранённые текущие лунки и отметки пропусков.
function pestovoWipeLocalSessions(reload) {
    var prefixes = [
        'pestovo_solo_key_', 'pestovo_group_key_', 'pestovo_acting_as_',
        'pestovo_resume_hole_', 'pestovo_skip_ack_', 'pestovo_finish_req_'
    ];
    [localStorage, sessionStorage].forEach(function(store) {
        var keys = [];
        try {
            for (var i = 0; i < store.length; i++) keys.push(store.key(i));
        } catch (e) { return; }
        keys.forEach(function(k) {
            if (!k) return;
            for (var j = 0; j < prefixes.length; j++) {
                if (k.indexOf(prefixes[j]) === 0) { try { store.removeItem(k); } catch (e) { console.warn("[silent]", e); } break; }
            }
        });
    });
    if (reload && typeof window !== 'undefined' && /setup-round\.html/.test(window.location.pathname + window.location.search)) {
        try { window.location.reload(); } catch (e) { console.warn("[silent]", e); }
    }
}

// Сессия привязана к имени и фамилии. Если телефон разрядился —
// игрок может зайти с другого устройства по ФИО и продолжить игру.
// Блокировка повторного старта: нельзя создать новый раунд, если
// предыдущий не завершён.
function pestovoNormalizeFio(str) {
    return String(str == null ? '' : str).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function pestovoFioTokens(str) {
    var n = pestovoNormalizeFio(str);
    if (!n) return [];
    return n.split(' ').filter(function(w) { return w.length >= 2; });
}

// Совпадение ФИО: все токены поиска должны присутствовать в имени игрока
// КАК ОТДЕЛЬНЫЕ СЛОВА (с точностью до «ё»→«е»). Пример: поиск «Иван Петров»
// найдёт «Иван Петрович Петров», но НЕ найдёт «Иван Петровский» — раньше
// подстрочное совпадение («петров» ⊂ «петровский») ложно блокировало старт
// нового раунда из-за чужой активной сессии.
function pestovoFioTokensMatch(playerName, searchFio) {
    var pNorm = pestovoNormalizeFio(playerName);
    var searchTokens = pestovoFioTokens(searchFio);
    if (!pNorm || !searchTokens.length) return false;
    var playerWords = pNorm.split(' ').filter(Boolean);
    for (var i = 0; i < searchTokens.length; i++) {
        var tok = searchTokens[i];
        var found = playerWords.some(function(w) { return w === tok; });
        if (!found) return false;
    }
    return true;
}

function pestovoCollectActiveRoundsByFio(data, searchFio) {
    var out = [];
    var normSearch = pestovoNormalizeFio(searchFio);
    if (!normSearch) return out;
    Object.entries(data || {}).forEach(function(e) {
        var rid = e[0], r = e[1];
        if (!r || (r.status !== 'active' && r.status !== 'scheduled')) return;
        var players = r.players || {};
        Object.entries(players).forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pid, p && p.name)) return;
            var name = (p && p.name) || '';
            // также проверяем firstName+lastName отдельно
            if (!name && p) {
                name = ((p.firstName || '') + ' ' + (p.middleName || '') + ' ' + (p.lastName || '')).trim();
            }
            if (pestovoFioTokensMatch(name, normSearch)) {
                out.push({ roundId: rid, round: r, playerId: pid, player: p });
            }
        });
    });
    return out;
}

// Из списка активных сессий (результат pestovoCollectActiveRoundsByFio /
// pestovoFindActiveRoundsByFio) — только ТУРНИРНЫЕ раунды. Турнирные раунды
// живут отдельно от соло/групповых: игрок в турнире не может начать новый
// обычный раунд.
function pestovoTournamentRounds(matches) {
    return (matches || []).filter(function(m) {
        return (typeof isTournamentRound === 'function') && isTournamentRound(m && m.round);
    });
}

function pestovoFindActiveRoundsByFio(fio) {
    return new Promise(function(resolve, reject) {
        if (typeof db === 'undefined' || !db) { resolve([]); return; }
        db.ref('rounds').once('value').then(function(sn) {
            var data = sn.val() || {};
            if (typeof sweepStaleRounds === 'function') data = sweepStaleRounds(data) || {};
            var res = pestovoCollectActiveRoundsByFio(data, fio);
            resolve(res);
        }).catch(function(err) {
            console.warn('[session] find by fio failed', err);
            resolve([]);
        });
    });
}

function pestovoCheckFioConflictsForGroup(fioList) {
    // fioList: array of strings (full names)
    return new Promise(function(resolve) {
        if (!fioList || !fioList.length) { resolve([]); return; }
        pestovoFindActiveRoundsByFio('').then(function() {}); // dummy to ensure db ready
        if (typeof db === 'undefined' || !db) { resolve([]); return; }
        db.ref('rounds').once('value').then(function(sn) {
            var data = sn.val() || {};
            if (typeof sweepStaleRounds === 'function') data = sweepStaleRounds(data) || {};
            var conflicts = [];
            fioList.forEach(function(fio) {
                if (!pestovoNormalizeFio(fio)) return;
                var matches = pestovoCollectActiveRoundsByFio(data, fio);
                if (matches.length) {
                    matches.forEach(function(m) {
                        conflicts.push({ inputFio: fio, roundId: m.roundId, round: m.round, playerId: m.playerId, player: m.player });
                    });
                }
            });
            resolve(conflicts);
        }).catch(function() { resolve([]); });
    });
}

function pestovoRenderFioResumeListHtml(matches, opts) {
    opts = opts || {};
    if (!matches || !matches.length) {
        return '<div class=\"empty\" style=\"padding:12px;\"><p>' + (currentLang === 'en' ? 'No active rounds found for this name.' : 'Активных раундов для этого имени не найдено.') + '</p></div>';
    }
    var html = '<div style=\"display:flex;flex-direction:column;gap:10px;\">';
    matches.forEach(function(item) {
        var r = item.round, rid = item.roundId;
        // fio=1 — метка «пришли из поиска по ФИО»: только такой переход
        // требует подтверждения владельца перед завершением раунда.
        var link = 'setup-round.html?round=' + rid + '&as=' + item.playerId + '&fio=1';
        var resume = (typeof getRoundResumeState === 'function') ? getRoundResumeState(rid, r) : { currentHole: r.startHole || 1, holesPlayed: 0, holeCount: 18, metrics: { overallDelay: 0 } };
        var modeIcon = r.mode === 'solo' ? '<i class=\"fas fa-user\"></i> ' + (typeof t === 'function' ? t('solo_round') : 'Solo') : '<i class=\"fas fa-users\"></i> ' + (typeof t === 'function' ? t('group_round') : 'Group');
        var startDate = r.startTime ? new Date(r.startTime) : null;
        var dateStr = startDate ? (startDate.toLocaleDateString() + ' ' + fmtTime(r.startTime)) : '—';
        var curHole = resume.closed ? null : (resume.currentHole || r.startHole || 1);
        var played = resume.holesPlayed || 0;
        var total = resume.holeCount || getRoundHoleCount(r) || 18;
        var playerName = item.player && item.player.name ? item.player.name : (item.inputFio || '');
        html += '<div class=\"list-item\" style=\"padding:12px;flex-wrap:wrap;gap:8px;\">' +
            '<div style=\"flex:1;min-width:180px;\">' +
            '<div style=\"font-weight:800;color:var(--white);\"><i class=\"fas fa-circle-play\" style=\"color:var(--gold);\"></i> ' + escapeHtml(playerName) + ' · ' + modeIcon + '</div>' +
            '<div style=\"font-size:12px;color:var(--muted);margin-top:4px;\">' + (currentLang === 'en' ? 'Start' : 'Старт') + ': ' + dateStr + ' · ' + (currentLang === 'en' ? 'Hole' : 'Лунка') + ': ' + (curHole ? '№' + curHole : escapeHtml(resume.statusText || (currentLang === 'en' ? 'finished' : 'завершён'))) + ' · ' + played + '/' + total + '</div>' +
            (r.tournamentName ? '<div style=\"font-size:11px;color:var(--gold);margin-top:2px;\"><i class=\"fas fa-trophy\"></i> ' + escapeHtml(r.tournamentName) + '</div>' : '') +
            '</div>' +
            '<div style=\"display:flex;flex-direction:column;gap:6px;align-self:center;\">' +
            '<a href=\"' + link + '\" class=\"btn btn-g btn-sm\"><i class=\"fas fa-play\"></i> ' + (currentLang === 'en' ? 'Continue' : 'Продолжить') + '</a>' +
            '<a href=\"' + link + '&finish=1\" class=\"btn btn-ol btn-sm\"><i class=\"fas fa-flag-checkered\"></i> ' + (currentLang === 'en' ? 'Finish round' : 'Завершить раунд') + '</a>' +
            '</div></div>';
    });
    html += '</div>';
    return html;
}

// Блокировка старта нового раунда, если у игрока уже есть активный
function pestovoShowFioConflictModal(conflicts, onContinueAnyway) {
    var overlayId = 'fio-conflict-modal';
    var existing = document.getElementById(overlayId);
    if (existing) existing.remove();
    var html = '<div id="' + overlayId + '" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.65);display:flex;align-items:center;justify-content:center;padding:16px;">' +
        '<div class="card" style="max-width:520px;width:100%;max-height:85vh;overflow:auto;border:2px solid var(--gold);">' +
        '<h2 style="color:var(--gold);"><i class="fas fa-triangle-exclamation"></i> ' + (currentLang === 'en' ? 'Active round exists' : 'Есть незавершённый раунд') + '</h2>' +
        '<p style="font-size:13px;color:var(--muted);margin-bottom:12px;">' +
        (currentLang === 'en' ? 'This player already has an active round. You cannot start a new one until the previous is finished. You can continue the existing round:' : 'У этого игрока уже есть незавершённый раунд. Нельзя создать новый, пока предыдущий не завершён. Можно продолжить существующий:') +
        '</p>' +
        pestovoRenderFioResumeListHtml(conflicts) +
        '<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">' +
        '<button class="btn btn-ol btn-sm" onclick="document.getElementById(\'' + overlayId + '\').remove()"><i class="fas fa-xmark"></i> ' + (currentLang === 'en' ? 'Cancel' : 'Отмена') + '</button>' +
        (onContinueAnyway ? '<button class="btn btn-r btn-sm" id="fio-conflict-continue"><i class="fas fa-forward"></i> ' + (currentLang === 'en' ? 'Start anyway (admin)' : 'Начать всё равно') + '</button>' : '') +
        '</div></div></div>';
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstChild);
    // Колбэк «Начать всё равно» вешаем слушателем, а не сериализуем в
    // inline-onclick: там он терял замыкание (proceedWithGroupStart /
    // proceedToCreate — локальные функции), и кнопка молча не работала —
    // игрок не мог ни создать раунд, ни закрыть чужую зависшую сессию.
    var continueBtn = document.getElementById('fio-conflict-continue');
    if (continueBtn && onContinueAnyway) {
        continueBtn.addEventListener('click', function() {
            var overlay = document.getElementById(overlayId);
            if (overlay) overlay.remove();
            try {
                if (typeof onContinueAnyway === 'function') onContinueAnyway();
                else if (typeof onContinueAnyway === 'string') {
                    try { (new Function(onContinueAnyway))(); } catch (e) { console.warn('[fio-conflict]', e); }
                }
            } catch (e) {
                console.warn('[fio-conflict] continue failed', e);
            }
        });
    }
}

// ==========================================
// ПОГОДНЫЙ ВИДЖЕТ И ВЕКТОР ВЕТРА В ШАПКЕ
// ==========================================
function getWindCardinal(deg) {
    var directions = currentLang === 'en' 
        ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
        : ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
    var idx = Math.round((deg % 360) / 45) % 8;
    return directions[idx];
}

function getWeatherCodeInfo(code) {
    if (code === 0) return { icon: '☀️', text: t('weather_clear') };
    if (code >= 1 && code <= 3) return { icon: '🌤️', text: t('weather_cloudy') };
    if (code === 45 || code === 48) return { icon: '🌫️', text: t('weather_fog') };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', text: t('weather_rain') };
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { icon: '❄️', text: t('weather_snow') };
    if (code >= 95) return { icon: '⛈️', text: t('weather_thunder') };
    return { icon: '🌤️', text: 'Pestovo' };
}

function loadPestovoWeather(targetId) {
    targetId = targetId || 'nav-weather-container';
    var el = document.getElementById(targetId);
    if (!el) return;

    var url = 'https://api.open-meteo.com/v1/forecast?latitude=56.09&longitude=37.62&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&wind_speed_unit=ms';

    if (typeof fetch !== 'undefined') {
        fetch(url).then(function(res) {
            return res.json();
        }).then(function(data) {
            if (!data || !data.current) throw new Error('No data');
            var curr = data.current;
            var temp = Math.round(curr.temperature_2m);
            var tempStr = (temp > 0 ? '+' : '') + temp + '°C';
            var windSpeed = Math.round(curr.wind_speed_10m || 0);
            var windDeg = Math.round(curr.wind_direction_10m || 0);
            var windDir = getWindCardinal(windDeg);
            var weather = getWeatherCodeInfo(curr.weather_code);

            var html = '<div class="weather-widget">' +
                '<div class="weather-item"><span class="weather-icon">' + weather.icon + '</span><b>' + tempStr + '</b> <span class="weather-desc" style="color:var(--muted);font-size:10px;">(' + weather.text + ')</span></div>' +
                '<div class="weather-divider"></div>' +
                '<div class="weather-item"><i class="fas fa-location-arrow wind-arrow" style="transform:rotate(' + (windDeg - 45) + 'deg);"></i> <b>' + windSpeed + ' m/s ' + windDir + '</b></div>' +
                '</div>';

            el.innerHTML = html;
            el.classList.remove('hidden');
        }).catch(function() {
            var html = '<div class="weather-widget">' +
                '<div class="weather-item"><span class="weather-icon">⛳</span> <b>Pestovo</b></div>' +
                '<div class="weather-divider"></div>' +
                '<div class="weather-item"><i class="fas fa-wind" style="color:var(--gold);"></i> <b>3 m/s SW</b></div>' +
                '</div>';
            el.innerHTML = html;
            el.classList.remove('hidden');
        });
    } else {
        var html = '<div class="weather-widget">' +
            '<div class="weather-item"><span class="weather-icon">⛳</span> <b>Pestovo</b></div>' +
            '<div class="weather-divider"></div>' +
            '<div class="weather-item"><i class="fas fa-wind" style="color:var(--gold);"></i> <b>3 m/s SW</b></div>' +
            '</div>';
        el.innerHTML = html;
        el.classList.remove('hidden');
    }
}

// ==========================================
// ДНЕВНОЙ РЕЖИМ «ЯРКОЕ СОЛНЦЕ» (SUN MODE)
// ==========================================
function initThemeMode() {
    var savedTheme = localStorage.getItem('pestovo_theme');
    if (savedTheme === 'sun' && document.body) {
        document.body.classList.add('sun-mode');
    }
}

function toggleSunMode() {
    if (!document.body) return;
    var isSun = document.body.classList.toggle('sun-mode');
    localStorage.setItem('pestovo_theme', isSun ? 'sun' : 'dark');
    updateSunModeButtons();
    if (typeof toast === 'function') {
        toast(isSun ? (currentLang === 'en' ? '☀️ Sun mode enabled' : '☀️ Включён режим «Яркое солнце»') : (currentLang === 'en' ? '🌙 Dark mode enabled' : '🌙 Включена тёмная тема'), 'info');
    }
}

function updateSunModeButtons() {
    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');
    document.querySelectorAll('.sun-mode-btn').forEach(function(btn) {
        btn.innerHTML = isSun ? '<i class="fas fa-sun"></i> ' + (currentLang === 'en' ? 'Sun ✅' : 'Солнце ✅') : '<i class="far fa-sun"></i> ' + (currentLang === 'en' ? 'Sun' : 'Солнце');
    });
}

// ==========================================
// РЕЖИМЫ ИНТЕРФЕЙСА ИГРОКА
// ==========================================
var PLAYER_MODE_STORAGE_KEYS = [
    'pestovo_large_ui',
    'pestovo_strong_vibration',
    'pestovo_high_contrast',
    'pestovo_battery_saver'
];

function isBatterySaverEnabled() {
    return isPlayerModeEnabled('pestovo_battery_saver');
}

function applyPlayerModes() {
    if (!document.body) return;
    document.body.classList.toggle('large-ui', isPlayerModeEnabled('pestovo_large_ui'));
    document.body.classList.toggle('high-contrast-status', isPlayerModeEnabled('pestovo_high_contrast'));
    document.body.classList.toggle('battery-saver', isBatterySaverEnabled());

    // Режим экономии батареи не держит экран постоянно включённым.
    if (isBatterySaverEnabled() && typeof wakeLockSentinel !== 'undefined' && wakeLockSentinel) {
        try { wakeLockSentinel.release(); } catch (e) { console.warn("[silent]", e); }
        wakeLockSentinel = null;
    } else if (!isBatterySaverEnabled()) {
        acquireWakeLockIfAllowed();
    }
}

// Boot-вызовы на загрузке скрипта.
// ВАЖНО (docs/MODULES-MIGRATION.md): фундамент (course-config/format/safe-html/
// dom/i18n/official-alerts) может приехать не классическими <script>, а одним
// отложенным <script type="module" src="dist/livescoring-modules.js">. Модульные
// скрипты выполняются ПОСЛЕ всех классических, поэтому на этом месте глобалы
// dom.js (isPlayerModeEnabled) могут быть ещё не созданы — раньше это валило
// весь utils.js (ReferenceError на строке инициализации), и страница оставалась
// без половины функций. Вызовы идемпотентны и повторяются на DOMContentLoaded
// (модульный бандл к этому моменту уже выполнен), поэтому здесь они просто
// защищены проверкой зависимости.
if (typeof isPlayerModeEnabled === 'function') {
    initThemeMode(); // применяем сразу, до первой отрисовки — без вспышки тёмной темы
    applyPlayerModes();
}
document.addEventListener('DOMContentLoaded', function() {
    initThemeMode();
    applyPlayerModes();
    initWakeLock();
});

// ==========================================
// ФИРМЕННЫЕ БЕЙДЖИ РЕЗУЛЬТАТОВ И ТИ
// ==========================================
function getRoundTeeCodes(r) {
    if (!r) return ['wh'];
    if (typeof r === 'string') return [r];
    if (Array.isArray(r)) {
        var arr = [];
        r.forEach(function(code) {
            if (code && arr.indexOf(code) === -1) arr.push(code);
        });
        return arr.length ? arr : ['wh'];
    }
    var teesFound = [];
    var players = r.players || {};
    var playerEntries = Object.entries(players).filter(function(pe) {
        return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name));
    });

    if (playerEntries.length > 0) {
        playerEntries.forEach(function(pe) {
            var p = pe[1];
            var code = (p && p.tee) || r.tee || 'wh';
            if (code && teesFound.indexOf(code) === -1) {
                teesFound.push(code);
            }
        });
    }

    if (!teesFound.length) {
        teesFound.push(r.tee || 'wh');
    }

    teesFound.sort(function(a, b) {
        var idxA = TEE_ORDER.indexOf(a);
        var idxB = TEE_ORDER.indexOf(b);
        if (idxA === -1 && idxB === -1) return 0;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });

    return teesFound;
}

function fmtTeePill(teeCode) {
    if (!teeCode) teeCode = 'wh';
    if (typeof teeCode === 'object' && teeCode !== null) {
        return fmtRoundTeePills(teeCode);
    }
    var nameKey = 'tee_' + teeCode;
    var name = t(nameKey);
    if (!name || name === nameKey) name = TEES[teeCode] || 'White';
    return '<span class="tee-pill tee-' + teeCode + '">' + name + '</span>';
}

function fmtRoundTeePills(r) {
    var codes = getRoundTeeCodes(r);
    var pills = codes.map(function(c) {
        var nameKey = 'tee_' + c;
        var name = t(nameKey);
        if (!name || name === nameKey) name = TEES[c] || 'White';
        return '<span class="tee-pill tee-' + c + '">' + name + '</span>';
    });
    return '<span class="round-tee-pills">' + pills.join('') + '</span>';
}
function triggerVictoryConfetti() {
    return; // конфетти при вводе счёта больше не показываются
}

// ==========================================
// FLIP / SPRING ANIMATION FOR SCORES
// ==========================================
function animateScoreElement(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.classList.remove('score-pulse');
    void el.offsetWidth;
    el.classList.add('score-pulse');
}

/* ==========================================================
   МОБИЛЬНЫЕ ДИАЛОГИ (v1.68.0): копирование/шаринг и uiConfirm
   ========================================================== */

// Скопировать текст или, если доступен системный «Поделиться», предложить его.
// На телефоне это штатный лист шаринга, на десктопе — буфер обмена.
// Возвращает Promise<boolean> — удалось ли что-то сделать.
function copyOrShare(text, okMsg) {
    var done = function() { try { if (typeof toast === 'function') toast(okMsg, 'success'); } catch (e) { console.warn("[silent]", e); } };
    // 1) системный шаринг — лучший UX на мобильном
    if (typeof navigator !== 'undefined' && navigator.share) {
        return navigator.share({ text: text }).then(function() { return true; })
            .catch(function() { return _copyText(text).then(done, function(){}); });
    }
    // 2) буфер обмена
    return _copyText(text).then(function() { done(); return true; }, function() { return false; });
}
function _copyText(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    // старый фолбэк: скрытый textarea + execCommand
    return new Promise(function(res, rej) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            ok ? res() : rej(new Error('execCommand failed'));
        } catch (e) { rej(e); }
    });
}

// Стилизованное подтверждение (bottom-sheet на телефоне / центр на десктопе).
// Возвращает Promise<boolean>. В окружениях без DOM (jsdom/SSR) падает на
// нативный confirm, чтобы существующие тесты продолжали работать.
function uiConfirm(opts) {
    if (typeof document === 'undefined' || !document.body) {
        return Promise.resolve(typeof confirm === 'function' ? confirm(opts && opts.text || '') : true);
    }
    return new Promise(function(resolve) {
        var o = opts || {};
        var root = document.createElement('div');
        root.className = 'modal uic-root';
        root.setAttribute('role', 'alertdialog');
        root.innerHTML =
            '<div class="modal-bg"></div>' +
            '<div class="modal-body uic-body">' +
            (o.title ? '<h3 class="uic-title">' + o.title + '</h3>' : '') +
            '<p class="uic-text">' + (o.text || '') + '</p>' +
            '<div class="modal-actions uic-actions">' +
            '<button type="button" class="btn btn-ol" data-uic="no">' + (o.cancelLabel || 'Отмена') + '</button>' +
            '<button type="button" class="btn ' + (o.danger ? 'btn-danger' : 'btn-g') + '" data-uic="yes">' + (o.confirmLabel || 'OK') + '</button>' +
            '</div></div>';
        document.body.appendChild(root);
        function close(v) {
            try { root.remove(); } catch (e) { console.warn("[silent]", e); }
            resolve(v);
        }
        root.addEventListener('click', function(e) {
            var t = e.target;
            if (t.closest && t.closest('[data-uic="yes"]')) return close(true);
            if (t.closest && t.closest('[data-uic="no"]')) return close(false);
            if (t.classList.contains('modal-bg')) return close(false);
        });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { document.removeEventListener('keydown', esc); close(false); }
        });
    });
}

// Нижний мобильный таббар (buildBottomTabbar) удалён по требованию:
// навигация на телефоне — через верхнее меню и мобильный drawer.
function initP0MobileEnhancements(){
    var isEn = false;
    try { isEn = currentLang === 'en'; } catch (e) { isEn = false; }

    // hole-nav: ensure active hole scrolled into view (for horizontal snap mode)
    try{
        var hn=document.querySelector('.hole-nav');
        if(hn){
            var active=hn.querySelector('.hole-btn.active');
            if(active && typeof active.scrollIntoView==='function'){
                active.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});
            }
            hn.style.scrollBehavior='smooth';
        }
    }catch(e){ console.warn('[P0] hole-nav', e); }

    // Long-press на кнопках ± : держи, чтобы повторять.
    // Делегирование на document — работает и для блоков, дорисованных позже
    // (js/live.js, js/solo.js рисуют кнопки после загрузки данных).
    try{
        if(!window._p0HoldBound){
            window._p0HoldBound=true;
            var holdTimer=null, holdInt=null, holdBtn=null;
            var startHold = function (btn) {
                stopHold();
                holdBtn=btn;
                holdTimer=setTimeout(function(){
                    holdInt=setInterval(function(){
                        btn.click();
                        try{ if(navigator.vibrate) navigator.vibrate(18); }catch (e) { console.warn("[silent]", e); }
                    }, 120);
                }, 450);
            };
            var stopHold = function () {
                if(holdTimer) clearTimeout(holdTimer);
                if(holdInt) clearInterval(holdInt);
                holdTimer=null; holdInt=null; holdBtn=null;
            };
            var targetOf = function (e) {
                var t=e.target;
                while(t && t!==document){
                    if(t.classList && (t.classList.contains('score-minus')||t.classList.contains('score-plus'))) return t;
                    t=t.parentNode;
                }
                return null;
            };
            document.addEventListener('touchstart', function(e){ var b=targetOf(e); if(b) startHold(b); }, {passive:true});
            document.addEventListener('touchend', stopHold, {passive:true});
            document.addEventListener('touchcancel', stopHold, {passive:true});
            document.addEventListener('mousedown', function(e){ var b=targetOf(e); if(b) startHold(b); });
            document.addEventListener('mouseup', stopHold);
            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                window.addEventListener('scroll', function(){ if(holdInt) stopHold(); }, {passive:true});
            }
        }
    }catch(e){ console.warn('[P0] long-press', e); }

    // setup-round wizard (степпер + аккордеон карточек игроков) переехал в
    // js/live.js (ensurePlayerWizardSteps / bindPlayerSlotsAccordion): слоты
    // игроков рисуются лениво, после DOMContentLoaded, поэтому привязка по
    // таймингу здесь не срабатывала и карточки не раскрывались.

    // sticky scorer actions: закрепляем существующие кнопки «Сохранить»/«Дальше»
    try{
        var saveBtn=document.querySelector('#sc-save-btn, .btn-save-hole, [data-action="save-hole"]');
        // fallback: find any button with text Save / Сохранить inside scorer
        if(!saveBtn){
            var btns=document.querySelectorAll('.score-entry:not([data-entry-preview]) button');
            for(var i=0;i<btns.length;i++){ var tx=(btns[i].textContent||'').toLowerCase(); if(tx.indexOf('сохран')!==-1){ saveBtn=btns[i]; break; } }
        }
        if(saveBtn && !document.getElementById('p0-sticky-actions')){
            var bar=document.createElement('div');
            bar.id='p0-sticky-actions';
            bar.className='p0-sticky-actions';
            bar.innerHTML='';
            var clone=saveBtn.cloneNode(true);
            clone.id='p0-sticky-save';
            // КРИТИЧНО: cloneNode(true) копирует атрибут onclick="saveSc()".
            // Без removeAttribute клон вызывал обработчик ДВАЖДЫ за один тап
            // (скопированный inline-onclick + добавленный ниже listener).
            clone.removeAttribute('onclick');
            clone.addEventListener('click', function(e){ e.preventDefault(); saveBtn.click(); });
            bar.appendChild(clone);
            // next hole button if exists
            var nextBtn=document.querySelector('#sc-next-btn, [data-action="next-hole"]');
            if(nextBtn){
                var clone2=nextBtn.cloneNode(true);
                clone2.id='p0-sticky-next';
                clone2.removeAttribute('onclick');
                clone2.addEventListener('click', function(e){ e.preventDefault(); nextBtn.click(); });
                bar.appendChild(clone2);
            }
            if(document.body) document.body.appendChild(bar);
            // hide original when sticky visible on mobile only via CSS
            saveBtn.classList.add('p0-original-save');
            if(nextBtn) nextBtn.classList.add('p0-original-save');
        }
    }catch(e){ console.warn('[P0] sticky actions', e); }
}
function initNav(){
    buildMobileDrawer();

    var tg = document.getElementById('nav-toggle');
    if (tg) {
        tg.setAttribute('aria-label', currentLang === 'en' ? 'Open menu' : 'Открыть меню');
        tg.setAttribute('aria-expanded', 'false');
        tg.setAttribute('aria-controls', 'mobile-drawer-root');
        tg.onclick = function(e) {
            e.stopPropagation();
            toggleMobileDrawer();
        };
    }

    window.addEventListener('scroll', function() {
        var n = document.getElementById('main-nav');
        if (n) {
            if (window.scrollY > 50) n.classList.add('nav-scrolled');
            else n.classList.remove('nav-scrolled');
        }
        // На каждом скролле пересчитываем высоту шапки: при появлении/скрытии
        // статус-бара iOS или изменении размеров шапки (mobile-меню) отступы
        // и scroll-padding должны оставаться синхронными.
        applyNavHeight();
    }, { passive: true });

    // resize / orientationchange / visualViewport — высота шапки может
    // меняться (например, при повороте экрана или открытии клавиатуры).
    window.addEventListener('resize', applyNavHeight);
    window.addEventListener('orientationchange', function() {
        setTimeout(applyNavHeight, 250);
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', applyNavHeight);
    }

    loadPestovoWeather('nav-weather-container');
    // Высота нужна до первой отрисовки, иначе заголовки страниц на мобильном
    // на мгновение «прячутся» под фиксированной шапкой.
    applyNavHeight();
    setTimeout(applyNavHeight, 50);
    setTimeout(applyNavHeight, 400);
}

// ==========================================
// ДИНАМИЧЕСКАЯ ВЫСОТА ФИКСИРОВАННОЙ ШАПКИ
// Пересчитывает реальную высоту #main-nav и записывает её в CSS-переменную
// --nav-h. Все page-head / main / scroll-padding используют эту переменную,
// поэтому отступы всегда совпадают с шапкой, в том числе:
//   - на iOS в PWA-режиме (env(safe-area-inset-top) добавляет высоту)
//   - при переключении состояния .nav-scrolled (шапка становится плотнее)
//   - при разных размерах шрифта/иконок на мобильных
// ==========================================
function applyNavHeight() {
    if (typeof document === 'undefined') return;
    var navEl = document.getElementById('main-nav');
    if (!navEl) return;
    // offsetHeight учитывает padding, border, но НЕ учитывает safe-area-inset-top.
    // В PWA на iOS шапка визуально выше из-за статус-бара — добавляем
    // env(safe-area-inset-top) явно, иначе контент «уезжает» под «чёлку».
    var baseH = navEl.offsetHeight || 0;
    var safeTop = 0;
    try {
        var probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;top:0;left:0;height:env(safe-area-inset-top);width:1px;pointer-events:none;visibility:hidden;';
        document.body.appendChild(probe);
        safeTop = Math.max(0, probe.getBoundingClientRect().height);
        document.body.removeChild(probe);
    } catch (e) {
        safeTop = 0;
    }
    // Если шапка уже учитывает safe-area-inset-top в собственном padding-top
    // (см. media display-mode: standalone в style.css), не дублируем.
    var padTop = parseFloat(getComputedStyle(navEl).paddingTop) || 0;
    var extraSafe = safeTop > padTop ? (safeTop - padTop) : 0;
    var totalH = baseH + extraSafe;
    if (totalH > 0) {
        document.documentElement.style.setProperty('--nav-h', totalH + 'px');
    }
}

function buildMobileDrawer() {
    if (typeof document === 'undefined') return;
    var container = document.getElementById('mobile-drawer-root');
    if (!container) {
        container = document.createElement('div');
        container.id = 'mobile-drawer-root';
        container.className = 'mobile-drawer-container';
        if (document.body) document.body.appendChild(container);
    }

    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');
    var isEn = currentLang === 'en';

    var sunTxt = isSun ? (isEn ? 'Sun ✅' : 'Солнце ✅') : (isEn ? 'Sun' : 'Солнце');
    var sunPrefix = isSun ? 'fas' : 'far';

    var authBtnMarkup = '';
    var isUserLoggedIn = (typeof currentUser !== 'undefined' && currentUser && typeof currentUserData !== 'undefined' && currentUserData);

    if (isUserLoggedIn) {
        var avatarMarkup = fmtUserAvatar(currentUserData, 32);
        authBtnMarkup = '<div style="display:flex;align-items:center;justify-content:space-between;background:var(--input);padding:10px 14px;border-radius:var(--rs);border:1px solid var(--border);cursor:pointer;" onclick="closeMobileDrawer();openPlayerProfileModal(\'' + currentUser.uid + '\')">' +
            '<div style="display:flex;align-items:center;gap:10px;">' + avatarMarkup + '<strong style="color:var(--gold);font-size:14px;">' + (currentUserData.name || '') + '</strong></div>' +
            '<button class="btn btn-og btn-sm" onclick="event.stopPropagation();doLogout()"><i class="fas fa-sign-out-alt"></i></button>' +
            '</div>';
    } else {
        authBtnMarkup = '<a href="auth.html" class="btn btn-g btn-block" onclick="closeMobileDrawer()"><i class="fas fa-sign-in-alt"></i> ' + t('nav_login') + '</a>';
    }

    var menuBodyMarkup = '<div class="mobile-drawer-group">' +
        '<div class="mobile-drawer-group-title">⛳ ' + (isEn ? 'Game & Rounds' : 'Игра и Раунды') + '</div>' +
        '<a href="index.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-home"></i> <span data-i18n="nav_home">' + t('nav_home') + '</span></a>' +
        '<a href="setup-round.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-gamepad"></i> <span data-i18n="nav_round">' + t('nav_round') + '</span></a>' +
        '<a href="leaderboard.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-trophy"></i> <span data-i18n="nav_leaderboard">' + t('nav_leaderboard') + '</span></a>' +
        '</div>' +

        '<div class="mobile-drawer-group">' +
        '<div class="mobile-drawer-group-title">👥 ' + (isEn ? 'Community & Stats' : 'Сообщество и Инфо') + '</div>' +
        '<a href="players.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-users"></i> <span data-i18n="nav_players">' + t('nav_players') + '</span></a>' +
        '<a href="tournaments.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-list"></i> <span data-i18n="nav_tournaments">' + t('nav_tournaments') + '</span></a>' +
        '<a href="stats.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-chart-bar"></i> <span data-i18n="nav_stats">' + t('nav_stats') + '</span></a>' +
        '<a href="handicap.html" class="mobile-drawer-link" onclick="closeMobileDrawer()"><i class="fas fa-calculator"></i> <span data-i18n="nav_handicaps">' + t('nav_handicaps') + '</span></a>' +
        '</div>';

    var html =
        '<div class="mobile-drawer-backdrop" onclick="closeMobileDrawer()" aria-hidden="true"></div>' +
        '<div class="mobile-drawer-panel" role="dialog" aria-modal="true" aria-label="' + (isEn ? 'Navigation menu' : 'Меню навигации') + '">' +
            '<div class="mobile-drawer-header">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<img src="img/logo.png" alt="Logo" class="nav-logo" onerror="this.style.display=\'none\'">' +
                    '<span class="nav-brand-text" data-i18n="brand_name">' + t('brand_name') + '</span>' +
                '</div>' +
                '<button class="mobile-drawer-close" onclick="closeMobileDrawer()" aria-label="' + (isEn ? 'Close menu' : 'Закрыть меню') + '">&times;</button>' +
            '</div>' +

            '<div class="mobile-drawer-body">' + menuBodyMarkup + '</div>' +

            '<div class="mobile-drawer-footer">' +
            '<div style="display:flex;gap:6px;margin-bottom:12px;">' +
                '<button class="sun-mode-btn" style="flex:1;justify-content:center;" onclick="toggleSunMode()"><i class="' + sunPrefix + ' fa-sun"></i> ' + sunTxt + '</button>' +
                    '<button class="lang-btn" style="flex:1;justify-content:center;" onclick="toggleLang()">' + (isEn ? '🇬🇧 EN' : '🇷🇺 RU') + '</button>' +
                '</div>' +
                '<div id="mobile-drawer-auth">' + authBtnMarkup + '</div>' +
            '</div>' +
        '</div>';

    container.innerHTML = html;

    var curPage = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname.split('/').pop() || 'index.html' : 'index.html';
    if (container.querySelectorAll) {
        container.querySelectorAll('.mobile-drawer-link').forEach(function(link) {
            if (link.getAttribute('href') === curPage) {
                link.classList.add('active');
            }
        });
    }

    if (typeof applyPageVisibilitySettings === 'function') {
        applyPageVisibilitySettings();
    }
}

/* Прячем нижнюю навигацию, когда открыта экранная клавиатура (фокус в поле ввода) */
document.addEventListener('focusin', function(e) {
    if (!e || !e.target) return;
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        document.body.classList.add('kb-open');
    }
});
document.addEventListener('focusout', function(e) {
    setTimeout(function() {
        var a = document.activeElement;
        var tag = a && a.tagName;
        if (!(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) {
            document.body.classList.remove('kb-open');
        }
    }, 120);
});

// ==========================================
// SCREEN WAKE LOCK — экран не гаснет во время раунда
// ==========================================
var wakeLockSentinel = null;
var wakeLockVisibilityListenerAttached = false;

function acquireWakeLockIfAllowed() {
    if (typeof document === 'undefined' || isBatterySaverEnabled() || !('wakeLock' in navigator)) return;
    var curPage = (window.location && window.location.pathname) ? (window.location.pathname.split('/').pop() || '') : '';
    var SCORING_PAGES = ['setup-round.html', 'scorer.html', 'marker.html'];
    if (SCORING_PAGES.indexOf(curPage) === -1 || wakeLockSentinel) return;
    navigator.wakeLock.request('screen').then(function(s) {
        wakeLockSentinel = s;
        s.addEventListener('release', function() { wakeLockSentinel = null; });
    }).catch(function() { /* тихо игнорируем — не критично */ });
}

function initWakeLock() {
    if (typeof document === 'undefined' || isBatterySaverEnabled()) return;
    if (!('wakeLock' in navigator)) return;
    acquireWakeLockIfAllowed();
    if (!wakeLockVisibilityListenerAttached) {
        wakeLockVisibilityListenerAttached = true;
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') acquireWakeLockIfAllowed();
        });
    }
}
// Wake lock на загрузке — под той же защитой, что и режимы игрока выше:
// при ESM-бандле глобалы dom.js появляются позже, поэтому здесь достаточно
// проверки, а реальная инициализация идёт на DOMContentLoaded.
if (typeof isPlayerModeEnabled === 'function') initWakeLock();

function openMobileDrawer() {
    buildMobileDrawer();
    var container = document.getElementById('mobile-drawer-root');
    var tg = document.getElementById('nav-toggle');
    if (container) container.classList.add('open');
    if (tg) { tg.classList.add('active'); tg.setAttribute('aria-expanded', 'true'); }
    if (typeof document !== 'undefined' && document.body && document.body.style) document.body.style.overflow = 'hidden';
}

function closeMobileDrawer() {
    var container = document.getElementById('mobile-drawer-root');
    var tg = document.getElementById('nav-toggle');
    if (container) container.classList.remove('open');
    if (tg) { tg.classList.remove('active'); tg.setAttribute('aria-expanded', 'false'); }
    if (typeof document !== 'undefined' && document.body && document.body.style) document.body.style.overflow = '';
}

// A11Y: клавиша Esc закрывает открытую модалку (верхнюю) или боковое меню
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    var modals = document.querySelectorAll('.modal:not(.hidden)');
    if (modals.length) {
        var top = modals[modals.length - 1];
        var closeBtn = top.querySelector('.modal-close-btn, .modal-close');
        if (closeBtn) { closeBtn.click(); } else { top.classList.add('hidden'); }
        return;
    }
    var drawer = document.getElementById('mobile-drawer-root');
    if (drawer && drawer.classList.contains('open')) closeMobileDrawer();
});

function toggleMobileDrawer() {
    var container = document.getElementById('mobile-drawer-root');
    if (container && container.classList.contains('open')) {
        closeMobileDrawer();
    } else {
        openMobileDrawer();
    }
}

function fmtUserAvatar(u, sizePx) {
    sizePx = sizePx || 40;
    if (u && u.avatar) {
        if (u.avatar.startsWith('data:') || u.avatar.startsWith('http') || u.avatar.startsWith('img/')) {
            return '<img src="' + u.avatar + '" alt="Avatar" class="user-avatar-img" style="width:' + sizePx + 'px;height:' + sizePx + 'px;">';
        }
        return '<div class="lb-avatar" style="width:' + sizePx + 'px;height:' + sizePx + 'px;font-size:' + Math.round(sizePx * 0.5) + 'px;">' + u.avatar + '</div>';
    }
    var initial = (u && u.name) ? u.name.charAt(0).toUpperCase() : '?';
    return '<div class="lb-avatar" style="width:' + sizePx + 'px;height:' + sizePx + 'px;font-size:' + Math.round(sizePx * 0.45) + 'px;">' + initial + '</div>';
}

function handleAvatarFileUpload(fileInputEl, callback) {
    if (!fileInputEl || !fileInputEl.files || !fileInputEl.files[0]) return;
    var file = fileInputEl.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            var maxDim = 160;
            var w = img.width;
            var h = img.height;
            if (w > h) {
                if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
            } else {
                if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            if (typeof callback === 'function') callback(dataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
function navAuth(u, d) {
    var e = document.getElementById('nav-auth');
    if (!e) return;
    var isSun = document.body && document.body.classList && document.body.classList.contains('sun-mode');

    var sunBtn = '<button class="sun-mode-btn" onclick="toggleSunMode()">' + (isSun ? '<i class="fas fa-sun"></i> ' + (currentLang === 'en' ? 'Sun ✅' : 'Солнце ✅') : '<i class="far fa-sun"></i> ' + (currentLang === 'en' ? 'Sun' : 'Солнце')) + '</button>';
    var langBtn = '<button class="lang-btn" onclick="toggleLang()">' + (currentLang === 'en' ? '🇬🇧 EN' : '🇷🇺 RU') + '</button>';

    if (u && d) {
        var avatarMarkup = fmtUserAvatar(d, 30);
        e.innerHTML = '<div class="nav-user" style="cursor:pointer;" onclick="openPlayerProfileModal(\'' + u.uid + '\')">' +
            sunBtn + langBtn + avatarMarkup +
            '<span class="nav-uname">' + (d.name || '') + '</span>' +
            '<button class="btn btn-og btn-sm" onclick="event.stopPropagation();doLogout()"><i class="fas fa-sign-out-alt"></i></button>' +
            '</div>';
    } else {
        e.innerHTML = '<div style="display:flex;align-items:center;gap:6px;">' + sunBtn + langBtn + '<a href="auth.html" class="btn btn-g btn-sm" style="padding:5px 10px;font-size:11px;" data-i18n="nav_login">' + t('nav_login') + '</a></div>';
    }
}

// Дефолтный обработчик готовности авторизации (вызывается из js/firebase-config.js,
// когда onAuthStateChanged отработал). Страницы со своей логикой (admin, live,
// tournaments, tournament-public) переопределяют
// onAuthReady в своём скрипте — он загружается позже и потому выигрывает.
// Раньше одиннадцать страниц держали идентичную копию `navAuth(u, d)`
// (docs/CODE-REVIEW.md, п.2 — дублирование) — теперь копия здесь одна.
function onAuthReady(u, d) { navAuth(u, d); }

function doLogout(){if(typeof auth!=='undefined'&&auth&&auth.signOut){auth.signOut().then(function(){window.location.reload();});}else{window.location.reload();}}
function holeOrder(sh){var o=[],h=parseInt(sh)||1;for(var i=0;i<18;i++){o.push(h);h=h>=18?1:h+1;}return o;}

// ==========================================
// ВЫБОР КОЛИЧЕСТВА ЛУНОК (holeRange)
// '1-9' | '10-18' | '1-18' (по умолчанию)
// ==========================================
function roundHoles(startHole, holeRange) {
    startHole = parseInt(startHole) || 1;
    if (holeRange === '1-9') return [1,2,3,4,5,6,7,8,9];
    if (holeRange === '10-18') return [10,11,12,13,14,15,16,17,18];
    return holeOrder(startHole); // 18 лунок, порядок со стартовой лунки (shotgun)
}
function roundHoleCount(holeRange) {
    return (holeRange === '1-9' || holeRange === '10-18') ? 9 : 18;
}
function getRoundOrder(rd) { return roundHoles((rd && rd.startHole) || 1, rd && rd.holeRange); }
function getRoundHoleCount(rd) { return roundHoleCount(rd && rd.holeRange); }

// Заполняет выпадающий список «Стартовая лунка» лунками выбранного диапазона:
// '1-9' → только 1-9, '10-18' → только 10-18, '1-18' (и другое) → все 18.
// Если текущее значение выпадающего списка уже входит в диапазон — сохраняем его.
function buildStartHoleOptions(holeEl, holeRange) {
    if (!holeEl) return;
    holeRange = holeRange || '1-18';
    var from = 1, to = 18;
    if (holeRange === '1-9') { from = 1; to = 9; }
    else if (holeRange === '10-18') { from = 10; to = 18; }
    var cur = parseInt(holeEl.value);
    if (!cur || cur < from || cur > to) {
        cur = (holeRange === '10-18') ? 10 : 1;
    }
    var html = '';
    for (var i = from; i <= to; i++) {
        html += '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + t('hole') + ' ' + i + ' (' + t('par') + ' ' + holePar(i) + ')</option>';
    }
    holeEl.innerHTML = html;
    holeEl.value = cur;
}

// Состояние подтверждения счёта игрока на лунке h — по фактическим данным, а не только по флагу verified:
//  'confirmed' — счёт игрока и маркера введены и совпадают (флаг мог устареть — данные важнее)
//  'mismatch'  — введённые счёта расходятся (или несовпадение зафиксировано флагом verified === false,
//                например внешним маркером через marker.html, чьих данных в раунде нет)
//  'pending'   — счёт игрока введён, но маркер ещё не подтвердил
//  'none'      — счёт ещё не введён
function getHoleVerifyState(p, h) {
    p = p || {};
    var ps = parseInt(p.scores && p.scores[h]) || 0;
    var markerId = p.markedBy;
    var ms = markerId ? (parseInt(p.markerScores && p.markerScores[markerId] && p.markerScores[markerId][h]) || 0) : 0;
    var v = p.verified && p.verified[h];

    // Фактические данные приоритетнее флага: флаг мог не обновиться,
    // если маркер ввёл счёт позже игрока или счёт исправили
    if (ps >= 1 && ms >= 1) return (ps === ms) ? 'confirmed' : 'mismatch';
    if (v === false) return 'mismatch';
    if (v === true) return 'confirmed';
    if (ps >= 1) return 'pending';
    return 'none';
}

// Проверка счёта ТОЛЬКО для одного игрока и его маркера (турнирное правило):
// чужой флайт / другие пары группы не блокируют финиш. Возвращает те же поля,
// что и collectRoundVerification, но только по лункам игрока pid, плюс детали
// details[h] = { ps, ms, playerName, markerName, state } для уведомлений.
function collectPlayerVerification(r, pid) {
    var order = getRoundOrder(r);
    var players = Object.entries((r && r.players) || {}).filter(function(pe){ return pe[0] === pid; });
    var mismatch = {}, unconfirmed = {}, missing = {}, details = {};
    if (!pid || !players.length) {
        return { order: order, mismatch: mismatch, unconfirmed: unconfirmed, missing: missing, details: details, canFinish: true, total: order.length, pid: pid || null, firstIssue: null };
    }
    var p = players[0][1] || {};
    var playerName = p.name || (currentLang === 'en' ? 'Player' : 'Игрок');
    var markerId = p.markedBy;
    var markerName = '';
    var markerIsFinished = markerId && (typeof isPlayerFinishedRound === 'function' ? isPlayerFinishedRound(r, markerId) : false);
    try {
        var mk = markerId && r.players ? r.players[markerId] : null;
        markerName = (mk && mk.name) ? mk.name : '';
    } catch(_) { markerName = ''; }
    if (r && r.mode === 'solo') {
        order.forEach(function(h){
            var sc = (p.scores) || {};
            if (!(parseInt(sc[h]) >= 1)) missing[h] = true;
        });
    } else {
        order.forEach(function(h){
            var st = getHoleVerifyState(p, h);
            var ps = parseInt(p.scores && p.scores[h]) || 0;
            var ms = markerId ? (parseInt(p.markerScores && p.markerScores[markerId] && p.markerScores[markerId][h]) || 0) : 0;
            details[h] = { ps: ps, ms: ms, playerName: playerName, markerName: markerName, state: st, markerIsFinished: markerIsFinished };
            if (st === 'mismatch') {
                var label = (ps >= 1 && ms >= 1) ? (playerName + ' (' + ps + '\u2260' + ms + ')') : playerName;
                mismatch[h] = [label];
            } else if (st !== 'confirmed') {
                // Если маркер уже завершил свой раунд, введённый счёт игрока не блокирует завершение
                if (markerIsFinished && ps >= 1) {
                    // маркер завершил ранее — собственный счёт игрока признаётся окончательным
                } else {
                    unconfirmed[h] = [playerName];
                }
            }
        });
    }
    var canFinish = Object.keys(mismatch).length === 0 && Object.keys(unconfirmed).length === 0;
    var v = { order: order, mismatch: mismatch, unconfirmed: unconfirmed, missing: missing, details: details, canFinish: canFinish, total: order.length, pid: pid, playerName: playerName, markerName: markerName, markerIsFinished: markerIsFinished };
    v.firstIssue = getFirstVerificationIssue(v);
    return v;
}

// Первая проблемная лунка в порядке раунда: сначала несовпадения, затем
// неподтверждённые. Возвращает { kind:'mismatch'|'unconfirmed', hole, detail }
// или null, если всё подтверждено.
function getFirstVerificationIssue(v) {
    if (!v || v.canFinish) return null;
    var order = v.order || Object.keys(v.mismatch || {}).concat(Object.keys(v.unconfirmed || {}));
    var mis = v.mismatch || {}, unc = v.unconfirmed || {};
    var i, h;
    for (i = 0; i < order.length; i++) {
        h = order[i];
        if (mis[h]) return { kind: 'mismatch', hole: h, detail: (v.details && v.details[h]) || null, totalMismatches: Object.keys(mis).length, totalUnconfirmed: Object.keys(unc).length };
    }
    for (i = 0; i < order.length; i++) {
        h = order[i];
        if (unc[h]) return { kind: 'unconfirmed', hole: h, detail: (v.details && v.details[h]) || null, totalMismatches: Object.keys(mis).length, totalUnconfirmed: Object.keys(unc).length };
    }
    return null;
}

// Красивый текст уведомления о первой проблемной лунке (показываем ОДНУ лунку,
// а не все сразу; счётчик «ещё N» подсказывает, сколько осталось).
function verificationIssueToastHtml(issue, v) {
    if (!issue) return '';
    var isEn = currentLang === 'en';
    var h = issue.hole;
    var d = issue.detail || {};
    var ps = parseInt(d.ps) || 0, ms = parseInt(d.ms) || 0;
    var markerBit = d.markerName ? ' (' + escapeHtml(d.markerName) + ')' : '';
    if (issue.kind === 'mismatch') {
        var scoreBit = (ps >= 1 && ms >= 1)
            ? (isEn ? ('You: <b>' + ps + '</b>, marker' + markerBit + ': <b>' + ms + '</b>') : ('Вы: <b>' + ps + '</b>, маркер' + markerBit + ': <b>' + ms + '</b>'))
            : (isEn ? 'scores do not match' : 'счета не совпадают');
        var more = '';
        var rest = (issue.totalMismatches - 1) + issue.totalUnconfirmed;
        if (rest > 0) more = isEn ? ('<br><span style="opacity:.85;font-size:12px;">+' + rest + ' more hole' + (rest === 1 ? '' : 's') + ' to check</span>') : ('<br><span style="opacity:.85;font-size:12px;">ещё лунок к проверке: ' + rest + '</span>');
        return (isEn ? ('⚠️ <b>Mismatch on hole ' + h + '</b><br>' + scoreBit) : ('⚠️ <b>Несовпадение на лунке ' + h + '</b><br>' + scoreBit)) + more;
    }
    var what = ps >= 1
        ? (isEn ? ('Your score <b>' + ps + '</b> is waiting for marker' + markerBit + ' confirmation') : ('Ваш счёт <b>' + ps + '</b> ждёт подтверждения маркера' + markerBit))
        : (isEn ? 'score is not entered yet' : 'счёт ещё не введён');
    var restU = issue.totalUnconfirmed - 1;
    var moreU = restU > 0 ? (isEn ? ('<br><span style="opacity:.85;font-size:12px;">+' + restU + ' more unconfirmed hole' + (restU === 1 ? '' : 's') + '</span>') : ('<br><span style="opacity:.85;font-size:12px;">ещё неподтверждённых лунок: ' + restU + '</span>')) : '';
    return (isEn ? ('⏳ <b>Hole ' + h + ' is not confirmed</b><br>' + what) : ('⏳ <b>Лунка ' + h + ' не подтверждена</b><br>' + what)) + moreU;
}

// Показывает уведомление о первой проблемной лунке (3 сек, тап — перейти к лунке).
// onGoToHole(hole) — callback для перехода (например, goPlayHole).
function collectRoundVerification(r, onlyPid) {
    var order = getRoundOrder(r);
    var players = Object.entries((r && r.players) || {});
    if (onlyPid) players = players.filter(function(pe){ return pe[0] === onlyPid; });
    var mismatch = {}, unconfirmed = {};
    var missing = {};
    if (r && r.mode === 'solo') {
        // В сольном раунде нет маркера — игрок вводит счёт сам за себя,
        // поэтому проверка маркеров НЕ нужна: раунд можно завершить в любой момент
        // (например, после 1–2 лунок). Лунки без счёта показываем только как справку
        // в списке `missing` и они НЕ блокируют завершение (canFinish остаётся true).
        order.forEach(function(h){
            var allScored = true;
            players.forEach(function(pe){
                var sc = (pe[1] && pe[1].scores) || {};
                if (!(parseInt(sc[h]) >= 1)) allScored = false;
            });
            if (!allScored) missing[h] = true;
        });
    } else {
        order.forEach(function(h){
            var mismatchForHole = {}, unconfForHole = {};
            players.forEach(function(pe){
                var p = pe[1] || {};
                var name = p.name || (currentLang === 'en' ? 'Player' : 'Игрок');
                var st = getHoleVerifyState(p, h);
                if (st === 'mismatch') {
                    // Показываем расхождение цифрами: «Имя (4≠5)» — когда известны оба счёта
                    var ps = parseInt(p.scores && p.scores[h]) || 0;
                    var mkId = p.markedBy;
                    var ms = mkId ? (parseInt(p.markerScores && p.markerScores[mkId] && p.markerScores[mkId][h]) || 0) : 0;
                    var label = (ps >= 1 && ms >= 1) ? (name + ' (' + ps + '\u2260' + ms + ')') : name;
                    mismatchForHole[label] = true;
                } else if (st !== 'confirmed') {
                    unconfForHole[name] = true;
                }
            });
            if (Object.keys(mismatchForHole).length > 0) mismatch[h] = Object.keys(mismatchForHole);
            else if (Object.keys(unconfForHole).length > 0) unconfirmed[h] = Object.keys(unconfForHole);
        });
    }
    var canFinish = Object.keys(mismatch).length === 0 && Object.keys(unconfirmed).length === 0;
    return { order: order, mismatch: mismatch, unconfirmed: unconfirmed, missing: missing, canFinish: canFinish, total: order.length };
}

function buildVerificationReportHtml(v) {
    if (!v) return '';
    var isEn = currentLang === 'en';
    var parts = [];
    var misKeys = Object.keys(v.mismatch || {});
    var uncKeys = Object.keys(v.unconfirmed || {});
    if (misKeys.length) {
        var misList = misKeys.map(function(h){ return '#' + h + (v.mismatch[h].length ? ' (' + v.mismatch[h].join(', ') + ')' : ''); }).join(', ');
        parts.push('<div class="timing-alert timing-late"><i class="fas fa-exclamation-triangle"></i><div><strong>' + (isEn ? 'Score mismatch on holes: ' : 'Несовпадения на лунках: ') + '</strong>' + misList + '</div></div>');
    }
    if (uncKeys.length) {
        var uncList = uncKeys.map(function(h){ return '#' + h + (v.unconfirmed[h].length ? ' (' + v.unconfirmed[h].join(', ') + ')' : ''); }).join(', ');
        parts.push('<div class="timing-alert timing-warn"><i class="fas fa-clock"></i><div><strong>' + (isEn ? 'Score not confirmed on holes: ' : 'Счёт не подтверждён на лунках: ') + '</strong>' + uncList + '</div></div>');
    }
    if (v.canFinish) {
        parts.push('<div class="verify-ok">✅ ' + (isEn ? 'All ' + v.total + ' holes are confirmed.' : 'Все ' + v.total + ' лунок подтверждены.') + '</div>');
    }
    return parts.join('');
}

// ==========================================
// ТАЙМИНГИ И ПАУЗА РАУНДА
// ==========================================
// Правила, которые делают тайминги устойчивыми к битым данным:
//   1) любой timestamp приводится к миллисекундам (normalizeTimestampMs
//      различает секунды и миллисекунды) и проверяется на разумность;
//   2) пауза не может увести старт раунда в будущее и не может превышать
//      время, которое раунд уже идёт;
//   3) на время паузы темп «заморожен»: фактическое время отсчитывается от
//      момента постановки на паузу, а не от «сейчас»;
//   4) сдвигают дедлайны только те паузы, которые закончились раньше дедлайна;
//   5) ни одна показанная людям дельта не может быть абсурдной: значения вне
//      ±MAX_PACE_MINUTES считаются недостоверными и не выводятся.
// Без этих проверок одна битая запись паузы (сбитые часы устройства,
// секунды вместо миллисекунд, задвоенное возобновление) превращала «Темп
// игры» в «запас 2193923839 минут» на раунде, который начался три минуты
// назад.
var PACE_MIN_VALID_TS = 946684800000;            // 2000-01-01 — раньше не бывает
var PACE_MAX_FUTURE_MS = 24 * 60 * 60 * 1000;    // старт максимум на сутки вперёд
var MAX_PACE_MINUTES = 24 * 60;                  // крупнее суток — данные битые
var MAX_PAUSE_INTERVAL_MS = 12 * 60 * 60 * 1000; // пауза длиннее суток — мусор

// timestamp → миллисекунды с проверкой разумности (0 — если данные битые).
function paceSafeTs(value, minTs, maxTs) {
    var ms = 0;
    try {
        ms = (typeof normalizeTimestampMs === 'function')
            ? normalizeTimestampMs(value)
            : (parseInt(value, 10) || 0);
    } catch (e) { ms = 0; }
    if (!ms || !isFinite(ms) || ms <= 0 || ms < PACE_MIN_VALID_TS) return 0;
    if (minTs && ms < minTs) return 0;
    if (maxTs && ms > maxTs) return 0;
    return ms;
}

// Сколько миллисекунд паузы пришлось на промежуток до момента ts
// («игровое» время: реальное время минус простой).
function pauseMsBefore(intervals, ts) {
    if (!intervals || !intervals.length || !ts) return 0;
    var sum = 0;
    for (var i = 0; i < intervals.length; i++) {
        var iv = intervals[i];
        if (!iv || !(iv.to > iv.from) || iv.from > ts) continue;
        sum += Math.min(iv.to, ts) - iv.from;
    }
    return sum;
}

// Обратное преобразование: «игровому» моменту соответствует реальный момент,
// сдвинутый на все паузы, закончившиеся до него.
function playingTsToReal(playingTs, intervals) {
    if (!playingTs) return 0;
    var t = playingTs;
    for (var i = 0; i < 4; i++) {
        var next = playingTs + pauseMsBefore(intervals, t);
        if (next === t) break;
        t = next;
    }
    return t;
}

// Интервалы пауз раунда [{from,to}] в миллисекундах: из pauseHistory, а для
// старых раундов без истории — из открытой паузы (pausedAt). Пересечения
// склеиваются, заведомо невозможные интервалы отбрасываются: так задвоенное
// возобновление или «пауза» длиной в тысячелетие не уводят тайминги в минус.
function getRoundPauseIntervals(r, nowTs) {
    var out = [];
    if (!r || typeof r !== 'object') return out;
    var now = paceSafeTs(nowTs, 0, 0) || Date.now();
    var raw = [];
    function push(from, to, open) {
        if (!from || from > now) return;
        var end;
        if (to && to <= now) end = to;
        else if (open) end = now;      // пауза идёт прямо сейчас
        else return;                   // закрытая пауза без валидного resumedAt — данных нет
        if (end - from <= 0 || end - from > MAX_PAUSE_INTERVAL_MS) return;
        raw.push({ from: from, to: end });
    }
    var hist = Array.isArray(r.pauseHistory) ? r.pauseHistory : [];
    hist.forEach(function(p) {
        if (!p) return;
        push(paceSafeTs(p.pausedAt, 0, now), paceSafeTs(p.resumedAt, 0, now), !!r.paused && !p.resumedAt);
    });
    if (r.paused && !histHasOpenPause(hist, r, now)) push(paceSafeTs(r.pausedAt, 0, now), 0, true);
    if (!raw.length) return out;
    raw.sort(function(a, b) { return a.from - b.from; });
    out.push({ from: raw[0].from, to: raw[0].to });
    for (var i = 1; i < raw.length; i++) {
        var last = out[out.length - 1], cur = raw[i];
        if (cur.from <= last.to) { if (cur.to > last.to) last.to = cur.to; continue; }
        out.push(cur);
    }
    return out;
}

// Момент фактического старта раунда (без пауз) в миллисекундах. Строка
// «09:00», секунды вместо миллисекунд и мусор из старых записей больше не
// превращаются в «тайминг»: вместо абсурдного числа получаем «нет данных».
function roundRawStartTs(r) {
    if (!r || typeof r !== 'object') return 0;
    var maxTs = Date.now() + PACE_MAX_FUTURE_MS;
    var st = paceSafeTs(r.teeOffMs, 0, maxTs) ||
             paceSafeTs(r.startTimeMs, 0, maxTs) ||
             paceSafeTs(r.scheduledStart, 0, maxTs);
    if (!st && r.startTime && typeof pestovoStartTsFromParts === 'function' && (r.date || r.createdAt)) {
        try {
            var d = r.date || new Date(r.createdAt).toISOString().slice(0, 10);
            st = paceSafeTs(pestovoStartTsFromParts(d, r.startTime), 0, maxTs);
        } catch (e) { st = 0; }
    }
    if (!st) st = paceSafeTs(r.startTime, 0, maxTs);
    return st;
}

// Есть ли в истории незакрытая пауза, совпадающая с текущей (pausedAt):
// иначе открытую паузу посчитают дважды — иhistory, и полем pausedAt.
function histHasOpenPause(hist, r, now) {
    if (!Array.isArray(hist) || !hist.length) return false;
    var last = hist[hist.length - 1];
    if (!last || last.resumedAt) return false;
    var pausedAt = paceSafeTs(r && r.pausedAt, 0, now);
    var from = paceSafeTs(last.pausedAt, 0, now);
    return !!from && !!pausedAt && from === pausedAt;
}

// Общее время паузы раунда в миллисекундах (завершённые паузы + текущая
// активная). Накопленное при возобновлении поле и история пауз сверяются
// через максимум: ни задвоенное возобновление, ни раунд без pauseHistory не
// искажают тайминги. Сумма ограничена временем жизни раунда — пауза не может
// длиться дольше, чем раунд идёт, поэтому битый pausedAt (секунды вместо
// миллисекунд, сбойные часы) не уводит дедлайны в тысячелетнее будущее.
function getRoundTotalPauseMs(r, nowTs) {
    if (!r || typeof r !== 'object') return 0;
    var now = paceSafeTs(nowTs, 0, 0) || Date.now();
    var stored = Math.max(0, parseInt(r.totalPausedMs, 10) || parseInt(r.totalPauseMs, 10) || 0);
    var intervals = getRoundPauseIntervals(r, now);
    var fromHistory = intervals.reduce(function(acc, iv) { return acc + (iv.to - iv.from); }, 0);
    var total = Math.max(stored, fromHistory);
    var start = roundRawStartTs(r);
    if (start) {
        var budget = Math.max(0, now - start);
        if (total > budget) total = budget;
    }
    return total > 0 ? total : 0;
}

// Эффективное время старта раунда с учётом всех пауз: на время паузы все
// плановые дедлайны по лункам отодвигаются ровно на её длительность.
// Сдвиг ограничен моментом «сейчас» — эффективный старт не может оказаться в
// будущем, иначе дедлайны уезжают на тысячи лет и вместо темпа показывается
// абсурдный «запас».
function roundEffectiveStartTime(r, nowTs) {
    if (!r || typeof r !== 'object') return 0;
    var st = roundRawStartTs(r);
    if (!st) return 0;
    var now = paceSafeTs(nowTs, 0, 0) || Date.now();
    var eff = st + getRoundTotalPauseMs(r, now);
    var limit = now > st ? now : st;
    return eff > limit ? limit : eff;
}

// Суммарный норматив (минуты) от стартовой лунки до целевой включительно.
function holeExpectedMinutes(startHole, targetHole) {
    var target = parseInt(targetHole, 10);
    var h = parseInt(startHole, 10) || 1;
    var total = 0, c = 0;
    while (c < 18) {
        total += holeTiming(h);
        if (h === target) break;
        h = h >= 18 ? 1 : h + 1;
        c++;
    }
    return total;
}

function holeDeadline(startTime, startHole, targetHole, pauseMs) {
    var st = 0, sh = startHole;
    if (startTime && typeof startTime === 'object') {
        st = roundEffectiveStartTime(startTime);
        sh = startHole || startTime.startHole;
    } else {
        st = paceSafeTs(startTime, 0, 0);
        if (st) st += Math.max(0, parseInt(pauseMs, 10) || 0);
    }
    if (!st) return null;
    var dl = st + holeExpectedMinutes(sh, targetHole) * 60000;
    return isFinite(dl) ? dl : null;
}

// Плановый дедлайн лунки конкретного раунда (реальное время, паузы учтены).
// Единая точка для всех страниц: соло, групповой ввод, маркер, админка.
function roundHoleDeadlineTs(r, hole, nowTs) {
    if (!r || typeof r !== 'object') return null;
    var start = roundRawStartTs(r);
    if (!start) return null;
    var minutes = holeExpectedMinutes(r.startHole, hole);
    var dl = playingTsToReal(start + minutes * 60000, getRoundPauseIntervals(r, nowTs));
    return dl && isFinite(dl) ? dl : null;
}

function checkTiming(startTime, startHole, holeNum, roundOrPauseMs) {
    var isPaused = false;
    var pauseReason = '';
    var totalPauseMs = 0;
    var effStartTime = 0;
    var roundObj = null;

    if (startTime && typeof startTime === 'object') roundObj = startTime;
    else if (roundOrPauseMs && typeof roundOrPauseMs === 'object') roundObj = roundOrPauseMs;

    if (roundObj) {
        startHole = startHole || roundObj.startHole;
        isPaused = !!roundObj.paused;
        pauseReason = roundObj.pauseReason || '';
        totalPauseMs = getRoundTotalPauseMs(roundObj);
        effStartTime = roundEffectiveStartTime(roundObj);
    } else {
        var pMs = typeof roundOrPauseMs === 'number' ? Math.max(0, roundOrPauseMs) : 0;
        effStartTime = (paceSafeTs(startTime, 0, 0) || 0) + pMs;
    }

    var dl = roundObj
        ? roundHoleDeadlineTs(roundObj, holeNum)
        : holeDeadline(effStartTime, startHole, holeNum);
    if (!dl) return { status: 'ok', diff: 0, deadline: null, isPaused: false };

    if (isPaused) {
        return {
            status: 'paused',
            diff: 0,
            deadline: dl,
            isPaused: true,
            pauseReason: pauseReason,
            pauseDurationMs: totalPauseMs
        };
    }

    var now = Date.now();
    // Раунд ещё не начался (отложенный старт) — сравнивать не с чем.
    if (roundObj) {
        var rawStart = roundRawStartTs(roundObj);
        if (rawStart && now < rawStart) return { status: 'pending', diff: 0, deadline: dl, isPaused: false };
    }
    var d = Math.round((now - dl) / 60000);
    if (!isFinite(d)) return { status: 'ok', diff: 0, deadline: dl, isPaused: false };
    if (Math.abs(d) > MAX_PACE_MINUTES) return { status: 'unknown', diff: 0, deadline: dl, isPaused: false };
    if (d > 5) return { status: 'late', diff: d, deadline: dl, isPaused: false };
    if (d > 0) return { status: 'warning', diff: d, deadline: dl, isPaused: false };
    return { status: 'ok', diff: d, deadline: dl, isPaused: false };
}

function buildTimingNotice(st, sh, ch, round) {
    var c = checkTiming(st, sh, ch, round);
    if (!c.deadline && !c.isPaused) return '';
    // Раунд ещё не стартовал или данные о таймингах недостоверны — баннер не
    // показываем: «в графике» без данных и абсурдные цифры только путают.
    if (!c.isPaused && (c.status === 'pending' || c.status === 'unknown')) return '';
    var isEn = currentLang === 'en';
    if (c.isPaused) {
        var pReason = c.pauseReason ? (' · ' + escapeHtml(c.pauseReason)) : '';
        var durStr = formatPaceMinutes((c.pauseDurationMs || 0) / 60000);
        return '<div class="timing-alert timing-warn"><i class="fas fa-pause-circle"></i><div><strong>' +
            (isEn ? 'Round Paused' : 'Раунд на паузе') + '</strong>' + pReason + '<br>' +
            t('hole') + ' ' + ch + ': ' + (isEn ? 'timing frozen · pause ' : 'тайминги остановлены · пауза ') + durStr + '</div></div>';
    }
    var dl = fmtTime(c.deadline), nw = fmtTime(Date.now());
    var minWord = isEn ? ' min' : ' мин';
    if (c.status === 'late') return '<div class="timing-alert timing-late"><i class="fas fa-exclamation-triangle"></i><div><strong>' + (isEn ? 'Pace Lag!' : 'Отставание!') + '</strong><br>' + t('hole') + ' ' + ch + ': ' + (isEn ? 'deadline ' : 'дедлайн ') + dl + (isEn ? ', now ' : ', сейчас ') + nw + ' (+' + c.diff + minWord + ')</div></div>';
    if (c.status === 'warning') return '<div class="timing-alert timing-warn"><i class="fas fa-clock"></i><div><strong>' + (isEn ? 'Deadline Approaching' : 'Близко к дедлайну') + '</strong><br>' + t('hole') + ' ' + ch + ': ' + dl + '</div></div>';
    var a = Math.abs(c.diff);
    return '<div class="timing-alert timing-ok"><i class="fas fa-check-circle"></i><div>' + t('hole') + ' ' + ch + ': ' + (isEn ? 'On Pace' : 'в графике') + (a > 0 ? ' (' + (isEn ? 'buffer ' : 'запас ') + a + minWord + ')' : '') + '</div></div>';
}
function buildTimingTable(st, sh, holeRange) {
    if (!st) return '';
    // План по лункам строим только по достоверной дате старта: «0» и мусорные
    // timestamp'ы (год вне 1970..2100) иначе превращаются в «369696 часов».
    var startTs = parseInt(st, 10) || 0;
    if (!isFinite(startTs) || startTs <= 0) return '';
    var startYear = new Date(startTs).getFullYear();
    if (startYear < 1970 || startYear > 2100) return '';
    var startHole = parseInt(sh) || 1;
    var order = roundHoles(startHole, holeRange);
    var count = order.length;
    var lastHole = order[order.length - 1];

    var dlFinish = holeDeadline(startTs, startHole, lastHole);
    var totalMin = Math.round((dlFinish - startTs) / 60000);
    var hrs = Math.floor(totalMin / 60);
    var mins = totalMin % 60;
    var durationStr = hrs + (currentLang === 'en' ? 'h ' : 'ч ') + (mins < 10 ? '0' : '') + mins + (currentLang === 'en' ? 'm' : 'мин');

    var startStr = fmtTime(startTs);
    var finishStr = fmtTime(dlFinish);

    var html = '<div class="timing-summary-card">';
    html += '<div class="timing-pills-row">';
    html += '  <div class="timing-pill"><span class="tp-lbl">' + (currentLang === 'en' ? 'Start' : 'Старт') + '</span><span class="tp-val">' + startStr + '</span></div>';
    if (count === 18) {
        var dl9 = holeDeadline(startTs, startHole, order[8]);
        html += '  <div class="timing-pill"><span class="tp-lbl">' + (currentLang === 'en' ? 'Turn (9h)' : '9 лунок') + '</span><span class="tp-val">' + fmtTime(dl9) + '</span></div>';
    }
    html += '  <div class="timing-pill tp-finish"><span class="tp-lbl">' + (currentLang === 'en' ? (count === 18 ? 'Finish (18h)' : 'Finish') : 'Финиш') + '</span><span class="tp-val">' + finishStr + '</span></div>';
    html += '</div>';
    html += '<div class="timing-total-badge"><i class="fas fa-clock"></i> ' + (currentLang === 'en' ? 'Pace of Play: ' : 'Норматив раунда: ') + '<b>' + durationStr + '</b></div>';

    html += '<details class="timing-details"><summary><i class="fas fa-list-ol"></i> ' + (currentLang === 'en' ? 'Hole-by-Hole Deadlines' : 'Детализация по лункам') + '</summary>';
    html += '<div class="timing-grid">';

    order.forEach(function(h) {
        var dl = holeDeadline(startTs, startHole, h);
        var tMin = holeTiming(h);
        html += '<div class="timing-grid-item">';
        html += '  <span class="tg-hole">' + (currentLang === 'en' ? 'Hole ' : 'Л.') + h + ' <small>(P' + holePar(h) + '·' + tMin + 'm)</small></span>';
        html += '  <span class="tg-time">' + fmtTime(dl) + '</span>';
        html += '</div>';
    });
    html += '</div></details>';
    html += '</div>';
    return html;
}

// ==========================================
// ТЕМП ИГРЫ / ТАЙМИНГИ ПРОХОЖДЕНИЯ ЛУНОК
// ==========================================
// Статус темпа игры. Принимает либо дельту в минутах, либо объект раунда.
// Абсурдные значения (битые таймстампы) в «отставание» не превращаются:
// вместо них состояние «данных нет».
function paceStatus(delayMinutes, isPaused) {
    var pendingState = {
        key: 'pending', status: 'pending', color: '#9eb5a5',
        label: t('pace_pending'), text: t('pace_pending')
    };
    if (typeof delayMinutes === 'object' && delayMinutes !== null) {
        var r = delayMinutes;
        isPaused = !!r.paused;
        var metrics = getRoundPaceMetrics(r);
        delayMinutes = metrics.overallDelay;
    }
    if (isPaused || delayMinutes === 'paused') {
        return { key: 'paused', status: 'paused', color: '#f39c12', label: currentLang === 'en' ? 'Paused' : 'На паузе', text: currentLang === 'en' ? '⏸ Paused' : '⏸ На паузе' };
    }
    if (delayMinutes === null || delayMinutes === undefined || isNaN(delayMinutes)) return pendingState;
    var delay = Math.round(parseFloat(delayMinutes) || 0);
    if (!isFinite(delay) || Math.abs(delay) > MAX_PACE_MINUTES) return pendingState;
    if (delay <= 2) return { key: 'ok', status: 'ok', color: '#2ecc71', label: t('pace_on_time'), text: t('pace_on_time') };
    if (delay <= 5) return { key: 'warning', status: 'warning', color: '#f39c12', label: t('pace_warning'), text: t('pace_warning') };
    if (delay <= 10) return { key: 'late', status: 'late', color: '#e67e22', label: t('pace_late'), text: t('pace_late') };
    return { key: 'severe', status: 'severe', color: '#e05a4a', label: t('pace_severe'), text: t('pace_severe') };
}

function formatPaceMinutes(minutes) {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
    var value = Math.max(0, Math.round(parseFloat(minutes) || 0));
    if (!isFinite(value) || value > MAX_PACE_MINUTES) return '—';
    if (value < 1) return currentLang === 'en' ? '<1 min' : '<1 мин';
    if (value >= 60) {
        var hours = Math.floor(value / 60);
        var rest = value % 60;
        return hours + (currentLang === 'en' ? 'h' : 'ч') + (rest ? ' ' + rest + (currentLang === 'en' ? 'm' : 'мин') : '');
    }
    return value + (currentLang === 'en' ? ' min' : ' мин');
}

// Дельта темпа: «+7 мин» (отставание) / «запас 5 мин» / «в графике».
// Числа вне разумных границ не показываются вовсе — «нет данных» честнее,
// чем «запас 2193923839 мин».
function formatPaceDelta(minutes) {
    var isEn = currentLang === 'en';
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '—';
    var value = Math.round(parseFloat(minutes) || 0);
    if (!isFinite(value) || Math.abs(value) > MAX_PACE_MINUTES) return isEn ? 'no data' : 'нет данных';
    if (value > 0) return '+' + value + (isEn ? ' min' : ' мин');
    if (value < 0) return (isEn ? 'buffer ' : 'запас ') + Math.abs(value) + (isEn ? ' min' : ' мин');
    return isEn ? 'on time' : 'в графике';
}
function getPaceParticipants(roundData) {
    if (!roundData || !roundData.players) return [];
    var ids = Array.isArray(roundData.participantsList) && roundData.participantsList.length
        ? roundData.participantsList.slice()
        : Object.keys(roundData.players);
    return ids.map(function(id) {
        return { id: id, player: roundData.players[id] };
    }).filter(function(item) {
        return item.player && !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(item.id, item.player.name));
    });
}

// Фактическое время прохождения лунки игроком (мс). Проверяется диапазон:
// времена лунок, лежащие до старта или в «будущем», — битые, они не должны
// участвовать в расчёте темпа.
function getPaceHoleTime(player, hole, minTs, maxTs) {
    if (!player) return null;
    var candidates = [
        player.holeTimes && player.holeTimes[hole],
        player.scoreTimes && player.scoreTimes[hole],
        player.completedHoles && player.completedHoles[hole]
    ];
    for (var i = 0; i < candidates.length; i++) {
        var value = (minTs || maxTs) ? paceSafeTs(candidates[i], minTs, maxTs) : (parseInt(candidates[i]) || 0);
        if (value > 0) return value;
    }
    return null;
}

function getGroupPaceHoleTime(roundData, hole, participants, minTs, maxTs) {
    var rootTime = (minTs || maxTs)
        ? paceSafeTs(roundData && roundData.holeTimes && roundData.holeTimes[hole], minTs, maxTs)
        : (parseInt(roundData && roundData.holeTimes && roundData.holeTimes[hole]) || 0);
    if (rootTime > 0) return rootTime;

    var times = (participants || []).map(function(item) {
        return getPaceHoleTime(item.player, hole, minTs, maxTs);
    }).filter(function(value) { return value !== null; });
    // Для старых раундов, где root holeTimes ещё нет, считаем лунку
    // завершённой группой в момент, когда последний игрок отправил счёт.
    if (times.length === (participants || []).length && times.length > 0) {
        return Math.max.apply(Math, times);
    }
    return null;
}

function getRoundPaceMetrics(roundData, nowValue) {
    var now = paceSafeTs(nowValue, 0, 0) || Date.now();
    var order = getRoundOrder(roundData || {});
    var participants = getPaceParticipants(roundData);
    // Кто ещё в игре. Сдавший карточку (обычно или досрочно) из расчёта темпа
    // группы выпадает: иначе лунки после его «отметки о завершении» никогда не
    // считаются пройденными и темп намертво зависает на одной лунке.
    var playing = participants.filter(function(item) {
        return !(typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(roundData, item.id));
    });
    var paceRoster = playing.length ? playing : participants;
    var isGroup = !!(roundData && roundData.mode === 'group' && paceRoster.length > 1);
    var isPaused = !!(roundData && roundData.paused);
    var totalPauseMs = getRoundTotalPauseMs(roundData, now);
    var pauseIntervals = getRoundPauseIntervals(roundData, now);
    var rawStart = roundRawStartTs(roundData);
    // В «игровой» шкале (реальное время минус паузы) старт = сам момент старта,
    // а нормативы лунков — обычная сумма темпа по лункам.
    var startTime = rawStart;
    var startHole = parseInt(roundData && roundData.startHole) || 1;
    // Пока раунд на паузе, отсчёт стоит на моменте её начала.
    var refNow = now;
    if (isPaused) {
        var pausedAtTs = paceSafeTs(roundData.pausedAt, 0, now);
        if (pausedAtTs) refNow = Math.max(pausedAtTs, rawStart || pausedAtTs);
    }
    var refPlaying = Math.max(startTime || refNow, refNow - pauseMsBefore(pauseIntervals, refNow));
    var timeline = [];
    var completedHoles = [];
    var currentHole = order.length ? order[0] : startHole;
    var previousTime = startTime || refPlaying;
    var hasTimingData = false;
    var lastCompletedIdx = -1;

    order.forEach(function(hole, idx) {
        var complete;
        if (isGroup) {
            complete = paceRoster.length > 0 && paceRoster.every(function(item) {
                return parseInt(item.player.scores && item.player.scores[hole]) >= 1;
            });
        } else {
            var soloPlayer = paceRoster.length ? paceRoster[0].player : null;
            complete = !!(soloPlayer && parseInt(soloPlayer.scores && soloPlayer.scores[hole]) >= 1);
        }

        var completedAt = isGroup
            ? getGroupPaceHoleTime(roundData, hole, paceRoster, rawStart, now)
            : getPaceHoleTime(paceRoster.length ? paceRoster[0].player : null, hole, rawStart, now);
        var durationMin = null;
        var holeDelay = null;

        if (complete) {
            completedHoles.push(hole);
            lastCompletedIdx = idx;
            if (completedAt && startTime) {
                hasTimingData = true;
                // Длительность лунки считается в «игровой» шкале: простой на
                // паузе не записывается в активное время лунки.
                var playAt = Math.max(previousTime, completedAt - pauseMsBefore(pauseIntervals, completedAt));
                durationMin = Math.max(0, (playAt - previousTime) / 60000);
                holeDelay = durationMin - holeTiming(hole);
                previousTime = playAt;
            }
        }

        timeline.push({
            hole: hole,
            complete: complete,
            inProgress: false,
            isPaused: isPaused,
            completedAt: completedAt,
            durationMin: durationMin,
            expectedMin: holeTiming(hole),
            delayMin: holeDelay
        });
    });

    // Текущая лунка — после самой дальней сыгранной (не первой пропущенной).
    // Если введены 1,2,3 и 7 — закончил 7, сейчас на 8.
    var currentIdx = -1;
    if (lastCompletedIdx >= 0) {
        if (lastCompletedIdx + 1 < timeline.length) {
            currentIdx = lastCompletedIdx + 1;
            currentHole = timeline[currentIdx].hole;
        } else {
            // Все лунки сыграны — оставляем последнюю для итогового темпа
            currentHole = order.length ? order[order.length - 1] : startHole;
            currentIdx = -1;
        }
    } else {
        currentHole = order.length ? order[0] : startHole;
        currentIdx = 0;
    }
    if (currentIdx >= 0 && timeline[currentIdx]) {
        var currentItem = timeline[currentIdx];
        currentItem.inProgress = true;
        // Во время паузы длительность текущей лунки заморожена (refNow = pausedAt).
        currentItem.durationMin = startTime ? Math.max(0, (refPlaying - previousTime) / 60000) : null;
        currentItem.delayMin = (startTime && currentItem.durationMin !== null)
            ? currentItem.durationMin - currentItem.expectedMin
            : null;
    }
    var firstIncompleteIndex = currentIdx >= 0 ? currentIdx : -1;
    // Если все лунки завершены — firstIncompleteIndex = -1, отсчёт идёт по
    // последней сохранённой лунке, и темп больше не «капает».

    var playDeadline = startTime ? startTime + holeExpectedMinutes(startHole, currentHole) * 60000 : 0;
    var expectedDeadline = playDeadline ? playingTsToReal(playDeadline, pauseIntervals) : null;
    var actualReference = firstIncompleteIndex >= 0
        ? (startTime ? refPlaying : 0)
        : (previousTime || refPlaying);
    var overallDelay = (playDeadline && actualReference) ? (actualReference - playDeadline) / 60000 : null;
    if (overallDelay !== null && (!isFinite(overallDelay) || Math.abs(overallDelay) > MAX_PACE_MINUTES)) overallDelay = null;

    var elapsedMin = rawStart
        ? Math.max(0, Math.round(((isPaused ? refNow : now) - rawStart - (isPaused ? 0 : totalPauseMs)) / 60000))
        : 0;

    return {
        order: order,
        participants: participants,
        activeParticipants: playing.length ? playing : participants,
        allPlayersFinished: !!participants.length && !playing.length,
        isGroup: isGroup,
        isPaused: isPaused,
        pausedAt: roundData ? roundData.pausedAt : null,
        pauseReason: roundData ? roundData.pauseReason : null,
        totalPauseMs: totalPauseMs,
        currentHole: currentHole,
        holesCompleted: completedHoles.length,
        holeCount: order.length,
        completedHoles: completedHoles,
        timeline: timeline,
        expectedDeadline: expectedDeadline,
        actualReference: actualReference,
        overallDelay: overallDelay,
        elapsedMin: elapsedMin,
        hasTimingData: hasTimingData,
        startTime: startTime ? roundEffectiveStartTime(roundData, now) : 0,
        startHole: startHole
    };
}

// Лунки, которые стоит подсвечивать как «идёт игра» на карте поля и в
// списках: текущая лунка КАЖДОГО игрока, который ещё не завершил свой раунд.
// Возвращает массив номеров лунок (пустой — если на поле никого не осталось).
function roundActiveHoles(r) {
    var out = [];
    if (!r || !r.players) return out;
    var order = getRoundOrder(r);
    Object.keys(r.players).forEach(function(pid) {
        var p = r.players[pid] || {};
        if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pid, p.name)) return;
        var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);
        var hole = playerCurrentHole(r, pid, p, stats, order);
        if (hole) out.push(hole);
    });
    return out;
}

// Завершил ли игрок свой раунд: сдал карточку (в т.ч. досрочно/принудительно)
// или сыграл все лунки диапазона. Такой игрок больше НЕ «находится на лунке».
function isPlayerRoundClosed(r, playerId, stats, order) {
    if (typeof isPlayerFinishedRound === 'function' && isPlayerFinishedRound(r, playerId)) return true;
    // Раунд закрыт автозавершением (доигрывали «на бумаге» на следующий день) —
    // на поле уже никого нет.
    if (r && r.autoCompleted) return true;
    var total = (order && order.length) ? order.length : getRoundHoleCount(r || {});
    if (stats && total && stats.holesPlayed >= total) return true;
    return false;
}

// Текущая лунка игрока (null — раунд завершён или ещё не начат).
function playerCurrentHole(r, playerId, player, stats, order) {
    order = order && order.length ? order : getRoundOrder(r || {});
    if (isPlayerRoundClosed(r, playerId, stats, order)) return null;
    var hole = stats && stats.currentHole ? stats.currentHole : null;
    if (!hole) return null;
    return order.indexOf(hole) !== -1 ? hole : (order[0] || hole);
}

// Подпись строки игрока в списках: «Лунка №7 · 5/18» либо отметка о
// завершении («Завершил (F)», при досрочном завершении — с причиной).
function playerHoleStatusText(r, playerId, player, stats, order, opts) {
    opts = opts || {};
    var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var fin = (r && r.finishedPlayers) ? r.finishedPlayers[String(playerId)] : null;
    var hole = playerCurrentHole(r, playerId, player, stats, order);
    if (hole === null) {
        if (fin && (fin.forced || fin.reason || fin.forcedReason)) {
            var why = String(fin.forcedReason || fin.reason || '').trim();
            var early = isEn ? 'Finished early' : 'Завершил досрочно';
            return why ? early + ' · ' + why : early;
        }
        return typeof t === 'function' ? t('finished_f') : (isEn ? 'Finished' : 'Завершён');
    }
    var label = (typeof t === 'function' ? t('hole') : (isEn ? 'Hole' : 'Лунка')) + ' №' + hole;
    if (opts.withProgress) {
        var total = (order && order.length) ? order.length : getRoundHoleCount(r || {});
        label += ' · ' + ((stats && stats.holesPlayed) || 0) + '/' + total;
    }
    return label;
}
function getRoundResumePlayerId(roundId, roundData) {
    if (!roundData || !roundData.players) return null;
    var stored = null;
    try { stored = localStorage.getItem('pestovo_acting_as_' + roundId); } catch (e) { console.warn("[silent]", e); }
    if (stored && roundData.players[stored]) return stored;
    if (typeof currentUser !== 'undefined' && currentUser && roundData.players[currentUser.uid]) return currentUser.uid;
    if (roundData.createdBy && roundData.players[roundData.createdBy]) return roundData.createdBy;
    var ids = Array.isArray(roundData.participantsList) && roundData.participantsList.length
        ? roundData.participantsList
        : Object.keys(roundData.players);
    return ids.length ? ids[0] : null;
}

function getSavedResumeHole(roundId, playerId, order, player) {
    if (!roundId || !playerId || !order || !order.length) return null;
    var value = null;
    try { value = parseInt(localStorage.getItem('pestovo_resume_hole_' + roundId + '_' + playerId)); } catch (e) { console.warn("[silent]", e); }
    if (order.indexOf(value) === -1) return null;
    if (player && player.verified && player.verified[value] === true) return null;
    return value;
}

function rememberResumeHole(roundId, playerId, hole) {
    if (!roundId || !playerId || !hole) return;
    try {
        localStorage.setItem('pestovo_resume_hole_' + roundId + '_' + playerId, String(hole));
        localStorage.setItem('pestovo_last_round_id', String(roundId));
    } catch (e) { console.warn("[silent]", e); }
}

function getRoundResumeState(roundId, roundData) {
    var metrics = getRoundPaceMetrics(roundData);
    var playerId = getRoundResumePlayerId(roundId, roundData);
    var player = playerId && roundData && roundData.players ? roundData.players[playerId] : null;
    var order = metrics.order;
    var resumeHole = getSavedResumeHole(roundId, playerId, order, player);
    if (!resumeHole) {
        resumeHole = metrics.currentHole || (order.length ? order[0] : 1);
    }
    var played = 0;
    if (player && player.scores) {
        order.forEach(function(h) { if (parseInt(player.scores[h]) >= 1) played++; });
    } else {
        played = metrics.holesCompleted;
    }
    // Кто сдал карточку (обычно или досрочно) — тот не «продолжает с лунки N»:
    // иначе карточка активного раунда предлагает доигрывать сыгранное.
    var closed = !!player && isPlayerRoundClosed(roundData, playerId, { holesPlayed: played }, order);
    return {
        playerId: playerId,
        currentHole: resumeHole,
        holesPlayed: played,
        holeCount: metrics.holeCount,
        closed: closed,
        statusText: closed ? playerHoleStatusText(roundData, playerId, player, { holesPlayed: played }, order) : '',
        metrics: metrics
    };
}

function renderPaceHoleTimeline(metrics) {
    if (!metrics || !metrics.timeline) return '';
    return metrics.timeline.map(function(item) {
        var state = item.complete || item.inProgress ? paceStatus(item.delayMin) : paceStatus(null);
        var marker = item.complete ? '✓ ' : item.inProgress ? '▶ ' : '';
        var duration = item.durationMin === null ? '—' : formatPaceMinutes(item.durationMin);
        var title = currentLang === 'en'
            ? 'Hole ' + item.hole + ': ' + duration + ' / target ' + item.expectedMin + ' min'
            : 'Лунка ' + item.hole + ': ' + duration + ' / норма ' + item.expectedMin + ' мин';
        var holePrefix = currentLang === 'en' ? 'H.' : 'Л.';
        return '<span class="pace-hole pace-hole-' + state.key + '" title="' + title + '">' + marker + holePrefix + item.hole + ' · ' + duration + '</span>';
    }).join('');
}

function renderPaceAssistant(targetId, roundData) {
    var el = document.getElementById(targetId);
    if (!el || !roundData) return;
    var metrics = getRoundPaceMetrics(roundData);
    var isPaused = !!(roundData && roundData.paused);
    var state = paceStatus(metrics.overallDelay, isPaused);
    var delayText = isPaused
        ? ('⏸ ' + (currentLang === 'en' ? 'Frozen (paused ' : 'Заморожен (пауза ') + formatPaceMinutes((metrics.totalPauseMs || 0) / 60000) + ')')
        : formatPaceDelta(metrics.overallDelay);
    var currentDeadline = metrics.expectedDeadline ? fmtTime(metrics.expectedDeadline) : '—';
    var title = t('pace_of_play');
    var note = '';
    if (isPaused) {
        var reasonText = roundData.pauseReason ? (' · ' + escapeHtml(roundData.pauseReason)) : '';
        note = '<div class="pace-note" style="color:#f39c12;"><i class="fas fa-pause-circle"></i> ' +
            (currentLang === 'en' ? 'Pace & timings frozen during pause' : 'Тайминги заморожены на время паузы') + reasonText + '</div>';
    } else if (!metrics.hasTimingData) {
        note = '<div class="pace-note">' + t('pace_pending') + '</div>';
    }

    var html = '<div class="pace-assistant pace-state-' + state.key + '" style="--pace-color:' + state.color + ';">';
    html += '<div class="pace-assistant-header"><strong><i class="fas ' + (isPaused ? 'fa-pause-circle' : 'fa-stopwatch') + '"></i> ' + title + '</strong><span class="pace-status-label">' + state.label + '</span></div>';
    html += '<div class="pace-assistant-grid">';
    html += '<div><span>' + t('pace_current_hole') + '</span><b>№' + metrics.currentHole + (isPaused ? ' <small style="color:#f39c12;">(' + (currentLang === 'en' ? 'paused' : 'пауза') + ')</small>' : '') + '</b></div>';
    html += '<div><span>' + t('pace_completed') + '</span><b>' + metrics.holesCompleted + '/' + metrics.holeCount + '</b></div>';
    html += '<div><span>' + t('pace_delay') + '</span><b>' + delayText + '</b></div>';
    html += '</div>';
    html += '<div class="pace-assistant-deadline"><i class="fas fa-clock"></i> ' + t('pace_deadline') + ': <b>' + currentDeadline + '</b>' + (isPaused ? ' <small style="color:#f39c12;">(' + (currentLang === 'en' ? 'extended' : 'продлён') + ')</small>' : '') + '</div>';
    html += note;
    html += '</div>';
    el.innerHTML = html;
}

function recordHoleCompletionTime(roundId, playerId, hole, timestamp) {
    if (typeof db === 'undefined' || !roundId || !playerId || !hole) return Promise.resolve();
    var path = 'rounds/' + roundId + '/players/' + playerId + '/holeTimes/' + hole;
    var value = timestamp || Date.now();
    return db.ref(path).transaction(function(existing) {
        return parseInt(existing) > 0 ? existing : value;
    }).catch(function(error) {
        console.warn('[Pace] Cannot save hole time', error);
    });
}

function recordGroupHoleCompletion(roundId, hole, timestamp) {
    if (typeof db === 'undefined' || !roundId || !hole) return Promise.resolve();
    return db.ref('rounds/' + roundId).once('value').then(function(snapshot) {
        var roundData = snapshot.val();
        if (!roundData || roundData.mode !== 'group') return;
        var participants = getPaceParticipants(roundData);
        if (!participants.length || !participants.every(function(item) {
            return parseInt(item.player.scores && item.player.scores[hole]) >= 1;
        })) return;
        var path = 'rounds/' + roundId + '/holeTimes/' + hole;
        var value = timestamp || Date.now();
        return db.ref(path).transaction(function(existing) {
            return parseInt(existing) > 0 ? existing : value;
        });
    }).catch(function(error) {
        console.warn('[Pace] Cannot save group hole time', error);
    });
}

// ==========================================
// ВЫЗОВ СУДЬИ / МАРШАЛА С КУЛДАУНОМ 5 МИНУТ
// ==========================================
var OFFICIAL_CALL_COOLDOWN_MS = 5 * 60 * 1000;
var officialCallBindings = Object.create(null);

function officialCallKey(roundId, playerId, type) {
    return String(roundId || '') + '|' + String(playerId || '') + '|' + String(type || '');
}

function readLocalOfficialCall(roundId, playerId, type) {
    try {
        var raw = localStorage.getItem('pestovo_official_call_' + officialCallKey(roundId, playerId, type));
        if (!raw) return null;
        var value = JSON.parse(raw);
        return value && parseInt(value.time) > 0 ? value : null;
    } catch(e) { return null; }
}

function saveLocalOfficialCall(roundId, playerId, type, call) {
    try {
        localStorage.setItem('pestovo_official_call_' + officialCallKey(roundId, playerId, type), JSON.stringify({
            time: call.time,
            cooldownUntil: call.cooldownUntil,
            alertId: call.alertId || '',
            response: call.response || null
        }));
    } catch (e) { console.warn("[silent]", e); }
}

function getOfficialCallState(alerts, roundId, playerId, type) {
    var matches = Object.entries(alerts || {}).map(function(entry) {
        return Object.assign({}, entry[1] || {}, { alertId: entry[0] });
    }).filter(function(alert) {
        return String(alert.roundId || '') === String(roundId || '') &&
            String(alert.playerId || '') === String(playerId || '') &&
            String(alert.type || '') === String(type || '') && parseInt(alert.time) > 0;
    });
    matches.sort(function(a, b) { return parseInt(a.time) - parseInt(b.time); });

    var localCall = readLocalOfficialCall(roundId, playerId, type);
    var serverCall = matches.length ? matches[matches.length - 1] : null;
    var call = serverCall;
    if (localCall && (!call || parseInt(localCall.time) > parseInt(call.time))) {
        call = Object.assign({}, localCall);
    }
    if (!call) return { call: null, remainingMs: 0, accepted: false, available: true };

    var callTime = parseInt(call.time) || 0;
    var cooldownUntil = parseInt(call.cooldownUntil) || (callTime + OFFICIAL_CALL_COOLDOWN_MS);
    var remainingMs = Math.max(0, cooldownUntil - Date.now());
    return {
        call: call,
        remainingMs: remainingMs,
        accepted: !!(call.response && parseInt(call.response.respondedAt) > 0),
        available: remainingMs <= 0
    };
}

function formatOfficialCountdown(ms) {
    var totalSeconds = Math.max(0, Math.ceil((parseInt(ms) || 0) / 1000));
    var mins = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return (mins < 10 ? '0' : '') + mins + ':' + (seconds < 10 ? '0' : '') + seconds;
}

function getOfficialRoleName(type) {
    return type === 'marshal'
        ? (currentLang === 'en' ? 'Marshal' : 'Маршал')
        : (currentLang === 'en' ? 'Referee' : 'Судья');
}

function getOfficialCallButtonLabel(type) {
    return type === 'marshal' ? t('call_marshal') : t('call_referee');
}

function getOfficialCallIcon(type) {
    return type === 'marshal' ? 'fa-shield-halved' : 'fa-gavel';
}

function renderOfficialCallButtons(config, alerts) {
    if (!config || !config.roundId || !config.playerId) return;
    var canEdit = typeof config.canEdit === 'function' ? config.canEdit() : config.canEdit !== false;
    var prefix = config.prefix || 'official';
    ['referee', 'marshal'].forEach(function(type) {
        var btn = document.getElementById(prefix + '-' + type + '-call-btn');
        if (!btn) return;
        var state = getOfficialCallState(alerts || {}, config.roundId, config.playerId, type);
        var enabled = canEdit && state.available;
        var role = getOfficialRoleName(type);
        var isAccepted = state.accepted && !state.available;
        var label = enabled
            ? getOfficialCallButtonLabel(type)
            : (isAccepted ? role + ' ' + t('call_on_way') : t('call_sent'));

        btn.disabled = !enabled;
        btn.className = 'btn btn-sm official-call-btn ' + (type === 'marshal' ? 'btn-warning' : 'btn-danger') +
            (enabled ? ' official-call-ready' : isAccepted ? ' official-call-accepted' : ' official-call-sent');
        btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        btn.innerHTML = '<i class="fas ' + getOfficialCallIcon(type) + '"></i> ' + label;

        var statusEl = document.getElementById(prefix + '-' + type + '-call-status');
        if (!statusEl) return;
        if (!state.call || state.available) {
            statusEl.innerHTML = '';
            statusEl.className = 'official-call-status hidden';
            return;
        }

        var statusHtml = '';
        if (state.accepted) {
            var acceptedAt = parseInt(state.call.response.respondedAt) || 0;
            statusHtml = '<strong>' + role + ' ' + t('call_accepted') + ' ' + fmtTime(acceptedAt) + '</strong>' +
                ' · ' + role + ' ' + t('call_on_way');
        } else {
            statusHtml = '<strong>' + t('call_sent') + '</strong>' +
                (state.call.time ? ' · ' + fmtTime(state.call.time) : '');
        }
        statusHtml += '<br><span>' + t('call_cooldown') + ' <b>' + formatOfficialCountdown(state.remainingMs) + '</b></span>';
        statusEl.innerHTML = statusHtml;
        statusEl.className = 'official-call-status ' + (state.accepted ? 'accepted' : 'sent');
    });
}

function refreshOfficialCallBindings() {
    Object.keys(officialCallBindings).forEach(function(key) {
        var binding = officialCallBindings[key];
        if (binding) renderOfficialCallButtons(binding.config, binding.alerts || {});
    });
}

function ensureOfficialCallTicker(key) {
    var binding = officialCallBindings[key];
    if (!binding || binding.timer) return;
    var tick = function() {
        var current = officialCallBindings[key];
        if (!current) return;
        renderOfficialCallButtons(current.config, current.alerts || {});
        current.timer = setTimeout(tick, isBatterySaverEnabled() ? 30000 : 1000);
    };
    binding.timer = setTimeout(tick, isBatterySaverEnabled() ? 30000 : 1000);
}

function reconcileOfficialCallResponse(binding, notification) {
    if (!binding || !notification || notification.type !== 'call_response') return;
    var alertId = notification.alertId || '';
    var alert = alertId && binding.alerts ? binding.alerts[alertId] : null;
    if (alert && String(alert.playerId || '') !== String(binding.config.playerId || '')) alert = null;
    var response = {
        status: 'accepted',
        responderRole: notification.responderRole,
        respondedAt: parseInt(notification.time) || Date.now()
    };

    if (alert) {
        alert.response = Object.assign({}, alert.response || {}, response);
        saveLocalOfficialCall(binding.config.roundId, binding.config.playerId, alert.type, alert);
    } else {
        // Если чтение alerts недоступно, локальная запись всё равно переводит
        // кнопку в состояние «едет» после push-уведомления от администратора.
        ['referee', 'marshal'].forEach(function(type) {
            var local = readLocalOfficialCall(binding.config.roundId, binding.config.playerId, type);
            if (local && (!alertId || local.alertId === alertId)) {
                local.response = response;
                saveLocalOfficialCall(binding.config.roundId, binding.config.playerId, type, local);
            }
        });
    }
    renderOfficialCallButtons(binding.config, binding.alerts || {});
}

function listenForOfficialCallState(config) {
    if (typeof db === 'undefined' || !config || !config.roundId || !config.playerId) return;
    var key = officialCallKey(config.roundId, config.playerId, config.prefix || 'official');
    if (!officialCallBindings[key]) {
        officialCallBindings[key] = { config: config, alerts: {}, timer: null };
        db.ref('alerts').orderByChild('roundId').equalTo(String(config.roundId)).on('value', function(snapshot) {
            var binding = officialCallBindings[key];
            if (!binding) return;
            binding.alerts = snapshot.val() || {};
            renderOfficialCallButtons(binding.config, binding.alerts);
        });
        db.ref('users/' + config.playerId + '/notifications').orderByChild('type').equalTo('call_response').on('child_added', function(snapshot) {
            var binding = officialCallBindings[key];
            if (binding) reconcileOfficialCallResponse(binding, snapshot.val());
        });
    } else {
        officialCallBindings[key].config = config;
    }
    ensureOfficialCallTicker(key);
    renderOfficialCallButtons(officialCallBindings[key].config, officialCallBindings[key].alerts || {});
}

function requestOfficialCall(config) {
    if (typeof db === 'undefined' || !config || !config.roundId || !config.playerId || !config.type) return Promise.resolve(false);
    var type = config.type;
    var localState = getOfficialCallState({}, config.roundId, config.playerId, type);
    if (localState.remainingMs > 0) {
        renderOfficialCallButtons(config, {});
        toast(t('call_cooldown') + ' ' + formatOfficialCountdown(localState.remainingMs), 'warn');
        return Promise.resolve(false);
    }

    // Чтение списка вызовов может быть запрещено правилами Firebase для игрока.
    // В этом случае локальный таймер всё равно защищает от обычного спама,
    // а сам вызов не должен блокироваться — продолжаем с пустым списком.
    var alertsPromise = db.ref('alerts').orderByChild('roundId').equalTo(String(config.roundId)).once('value')
        .then(function(snapshot) { return snapshot.val() || {}; })
        .catch(function(error) {
            console.warn('[Calls] Cannot read existing calls; using local cooldown', error);
            return {};
        });

    return alertsPromise.then(function(alerts) {
        var state = getOfficialCallState(alerts, config.roundId, config.playerId, type);
        if (state.remainingMs > 0) {
            renderOfficialCallButtons(config, alerts);
            toast(t('call_cooldown') + ' ' + formatOfficialCountdown(state.remainingMs), 'warn');
            return false;
        }

        var hole = typeof config.hole === 'function' ? config.hole() : config.hole;
        var role = getOfficialRoleName(type);
        var confirmText = currentLang === 'en'
            ? 'Call ' + role.toLowerCase() + ' to hole ' + hole + '?'
            : 'Вызвать ' + (type === 'marshal' ? 'маршала' : 'судью') + ' на лунку ' + hole + '?';
        if (!window.confirm(confirmText)) return false;

        var now = Date.now();
        var playerName = typeof config.playerName === 'function' ? config.playerName() : config.playerName;
        var flightMembers = typeof config.flightMembers === 'function' ? config.flightMembers() : config.flightMembers;
        var call = {
            roundId: config.roundId,
            type: type,
            hole: hole,
            playerId: config.playerId,
            playerName: playerName || (currentLang === 'en' ? 'Player' : 'Игрок'),
            flightMembers: flightMembers || [],
            time: now,
            createdAt: now,
            cooldownUntil: now + OFFICIAL_CALL_COOLDOWN_MS,
            status: 'active',
            state: 'sent'
        };
        var ref = db.ref('alerts').push();
        call.alertId = ref.key;
        return ref.set(call).then(function() {
            saveLocalOfficialCall(config.roundId, config.playerId, type, call);
            var binding = officialCallBindings[officialCallKey(config.roundId, config.playerId, config.prefix || 'official')];
            if (binding) {
                binding.alerts = binding.alerts || {};
                binding.alerts[ref.key] = call;
                renderOfficialCallButtons(binding.config, binding.alerts);
            }
            if (typeof config.onSent === 'function') config.onSent(call);
            return true;
        });
    }).catch(function(error) {
        toast((currentLang === 'en' ? '❌ Call failed: ' : '❌ Не удалось отправить вызов: ') + (error && error.message ? error.message : error), 'error');
        return false;
    });
}

function parseExactHcp(val) {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    var s = String(val).trim().replace(',', '.');
    if (s.startsWith('+')) {
        return -Math.abs(parseFloat(s.substring(1)) || 0);
    }
    return parseFloat(s) || 0;
}

function fmtExactHcp(val) {
    if (val === null || val === undefined || isNaN(val) || val === '') return '—';
    var num = parseFloat(val);
    if (isNaN(num)) return '—';
    if (num < 0) {
        return '+' + Math.abs(num).toFixed(1);
    }
    return Math.abs(num).toFixed(1);
}

function fmtFieldHcp(val) {
    if (val === null || val === undefined || isNaN(val) || val === '') return '0';
    var num = Math.round(parseFloat(val) || 0);
    if (num < 0) {
        return '+' + Math.abs(num);
    }
    return String(num);
}

// Цветовая градация игрового гандикапа для счётных карточек и чипов.
// Зелёный — свободные лунки, гандикап кодируется отдельной шкалой:
// +/скретч (<=0), 1–10, 11–20, 21–36, 37+.
function fieldHcpBandClass(val) {
    var hcp = parseFloat(val);
    if (isNaN(hcp)) return 'hcp-band-unknown';
    if (hcp <= 0) return 'hcp-band-plus';
    if (hcp <= 10) return 'hcp-band-1-10';
    if (hcp <= 20) return 'hcp-band-11-20';
    if (hcp <= 36) return 'hcp-band-21-36';
    return 'hcp-band-37';
}

function fieldHcpBandTitle(val) {
    var hcp = parseFloat(val);
    if (isNaN(hcp)) return '';
    if (hcp <= 0) return 'HCP + / scratch';
    if (hcp <= 10) return 'HCP 1–10';
    if (hcp <= 20) return 'HCP 11–20';
    if (hcp <= 36) return 'HCP 21–36';
    return 'HCP 37+';
}

const PESTOVO_MEN_HCP_TABLE = {
    bk: [
        { min: -3.5, max: -2.8, hcp: 0 }, { min: -2.7, max: -2.0, hcp: 1 }, { min: -1.9, max: -1.2, hcp: 2 },
        { min: -1.1, max: -0.4, hcp: 3 }, { min: -0.3, max: 0.3, hcp: 4 }, { min: 0.4, max: 1.1, hcp: 5 },
        { min: 1.2, max: 1.9, hcp: 6 }, { min: 2.0, max: 2.7, hcp: 7 }, { min: 2.8, max: 3.5, hcp: 8 },
        { min: 3.6, max: 4.3, hcp: 9 }, { min: 4.4, max: 5.1, hcp: 10 }, { min: 5.2, max: 5.8, hcp: 11 },
        { min: 5.9, max: 6.6, hcp: 12 }, { min: 6.7, max: 7.4, hcp: 13 }, { min: 7.5, max: 8.2, hcp: 14 },
        { min: 8.3, max: 9.0, hcp: 15 }, { min: 9.1, max: 9.8, hcp: 16 }, { min: 9.9, max: 10.5, hcp: 17 },
        { min: 10.6, max: 11.3, hcp: 18 }, { min: 11.4, max: 12.1, hcp: 19 }, { min: 12.2, max: 12.9, hcp: 20 },
        { min: 13.0, max: 13.7, hcp: 21 }, { min: 13.8, max: 14.5, hcp: 22 }, { min: 14.6, max: 15.3, hcp: 23 },
        { min: 15.4, max: 16.0, hcp: 24 }, { min: 16.1, max: 16.8, hcp: 25 }, { min: 16.9, max: 17.6, hcp: 26 },
        { min: 17.7, max: 18.4, hcp: 27 }, { min: 18.5, max: 19.2, hcp: 28 }, { min: 19.3, max: 20.0, hcp: 29 },
        { min: 20.1, max: 20.7, hcp: 30 }, { min: 20.8, max: 21.5, hcp: 31 }, { min: 21.6, max: 22.3, hcp: 32 },
        { min: 22.4, max: 23.1, hcp: 33 }, { min: 23.2, max: 23.9, hcp: 34 }, { min: 24.0, max: 24.7, hcp: 35 },
        { min: 24.8, max: 25.5, hcp: 36 }, { min: 25.6, max: 26.2, hcp: 37 }, { min: 26.3, max: 27.0, hcp: 38 },
        { min: 27.1, max: 27.8, hcp: 39 }, { min: 27.9, max: 28.6, hcp: 40 }, { min: 28.7, max: 29.4, hcp: 41 },
        { min: 29.5, max: 30.2, hcp: 42 }, { min: 30.3, max: 30.9, hcp: 43 }, { min: 31.0, max: 31.7, hcp: 44 },
        { min: 31.8, max: 32.5, hcp: 45 }, { min: 32.6, max: 33.3, hcp: 46 }, { min: 33.4, max: 34.1, hcp: 47 },
        { min: 34.2, max: 34.9, hcp: 48 }, { min: 35.0, max: 35.7, hcp: 49 }, { min: 35.8, max: 36.4, hcp: 50 },
        { min: 36.5, max: 37.2, hcp: 51 }, { min: 37.3, max: 38.0, hcp: 52 }, { min: 38.1, max: 38.8, hcp: 53 },
        { min: 38.9, max: 39.6, hcp: 54 }, { min: 39.7, max: 40.4, hcp: 55 }, { min: 40.5, max: 41.1, hcp: 56 },
        { min: 41.2, max: 41.9, hcp: 57 }, { min: 42.0, max: 42.7, hcp: 58 }, { min: 42.8, max: 43.5, hcp: 59 },
        { min: 43.6, max: 44.3, hcp: 60 }, { min: 44.4, max: 45.1, hcp: 61 }, { min: 45.2, max: 45.9, hcp: 62 },
        { min: 46.0, max: 46.6, hcp: 63 }, { min: 46.7, max: 47.4, hcp: 64 }, { min: 47.5, max: 48.2, hcp: 65 },
        { min: 48.3, max: 49.0, hcp: 66 }, { min: 49.1, max: 49.8, hcp: 67 }, { min: 49.9, max: 50.6, hcp: 68 },
        { min: 50.7, max: 51.3, hcp: 69 }, { min: 51.4, max: 52.1, hcp: 70 }, { min: 52.2, max: 52.9, hcp: 71 },
        { min: 53.0, max: 53.7, hcp: 72 }, { min: 53.8, max: 54.0, hcp: 73 }
    ],
    bl: [
        { min: -3.5, max: -2.8, hcp: -2 }, { min: -2.7, max: -1.9, hcp: -1 }, { min: -1.8, max: -1.1, hcp: 0 },
        { min: -1.0, max: -0.3, hcp: 1 }, { min: -0.2, max: 0.5, hcp: 2 }, { min: 0.6, max: 1.4, hcp: 3 },
        { min: 1.5, max: 2.2, hcp: 4 }, { min: 2.3, max: 3.0, hcp: 5 }, { min: 3.1, max: 3.8, hcp: 6 },
        { min: 3.9, max: 4.7, hcp: 7 }, { min: 4.8, max: 5.5, hcp: 8 }, { min: 5.6, max: 6.3, hcp: 9 },
        { min: 6.4, max: 7.1, hcp: 10 }, { min: 7.2, max: 8.0, hcp: 11 }, { min: 8.1, max: 8.8, hcp: 12 },
        { min: 8.9, max: 9.6, hcp: 13 }, { min: 9.7, max: 10.4, hcp: 14 }, { min: 10.5, max: 11.3, hcp: 15 },
        { min: 11.4, max: 12.1, hcp: 16 }, { min: 12.2, max: 12.9, hcp: 17 }, { min: 13.0, max: 13.7, hcp: 18 },
        { min: 13.8, max: 14.5, hcp: 19 }, { min: 14.6, max: 15.4, hcp: 20 }, { min: 15.5, max: 16.2, hcp: 21 },
        { min: 16.3, max: 17.0, hcp: 22 }, { min: 17.1, max: 17.8, hcp: 23 }, { min: 17.9, max: 18.7, hcp: 24 },
        { min: 18.8, max: 19.5, hcp: 25 }, { min: 19.6, max: 20.3, hcp: 26 }, { min: 20.4, max: 21.1, hcp: 27 },
        { min: 21.2, max: 22.0, hcp: 28 }, { min: 22.1, max: 22.8, hcp: 29 }, { min: 22.9, max: 23.6, hcp: 30 },
        { min: 23.7, max: 24.4, hcp: 31 }, { min: 24.5, max: 25.3, hcp: 32 }, { min: 25.4, max: 26.1, hcp: 33 },
        { min: 26.2, max: 26.9, hcp: 34 }, { min: 27.0, max: 27.7, hcp: 35 }, { min: 27.8, max: 28.6, hcp: 36 },
        { min: 28.7, max: 29.4, hcp: 37 }, { min: 29.5, max: 30.2, hcp: 38 }, { min: 30.3, max: 31.0, hcp: 39 },
        { min: 31.1, max: 31.9, hcp: 40 }, { min: 32.0, max: 32.7, hcp: 41 }, { min: 32.8, max: 33.5, hcp: 42 },
        { min: 33.6, max: 34.3, hcp: 43 }, { min: 34.4, max: 35.2, hcp: 44 }, { min: 35.3, max: 36.0, hcp: 45 },
        { min: 36.1, max: 36.8, hcp: 46 }, { min: 36.9, max: 37.6, hcp: 47 }, { min: 37.7, max: 38.5, hcp: 48 },
        { min: 38.6, max: 39.3, hcp: 49 }, { min: 39.4, max: 40.1, hcp: 50 }, { min: 40.2, max: 40.9, hcp: 51 },
        { min: 41.0, max: 41.8, hcp: 52 }, { min: 41.9, max: 42.6, hcp: 53 }, { min: 42.7, max: 43.4, hcp: 54 },
        { min: 43.5, max: 44.2, hcp: 55 }, { min: 44.3, max: 45.1, hcp: 56 }, { min: 45.2, max: 45.9, hcp: 57 },
        { min: 46.0, max: 46.7, hcp: 58 }, { min: 46.8, max: 47.5, hcp: 59 }, { min: 47.6, max: 48.4, hcp: 60 },
        { min: 48.5, max: 49.2, hcp: 61 }, { min: 49.3, max: 50.0, hcp: 62 }, { min: 50.1, max: 50.8, hcp: 63 },
        { min: 50.9, max: 51.7, hcp: 64 }, { min: 51.8, max: 52.5, hcp: 65 }, { min: 52.6, max: 53.3, hcp: 66 },
        { min: 53.4, max: 54.0, hcp: 67 }
    ],
    wh: [
        { min: -3.7, max: -3.0, hcp: -4 }, { min: -2.9, max: -2.1, hcp: -3 }, { min: -2.0, max: -1.3, hcp: -2 },
        { min: -1.2, max: -0.5, hcp: -1 }, { min: -0.4, max: 0.4, hcp: 0 }, { min: 0.5, max: 1.2, hcp: 1 },
        { min: 1.3, max: 2.0, hcp: 2 }, { min: 2.1, max: 2.9, hcp: 3 }, { min: 3.0, max: 3.7, hcp: 4 },
        { min: 3.8, max: 4.6, hcp: 5 }, { min: 4.7, max: 5.4, hcp: 6 }, { min: 5.5, max: 6.2, hcp: 7 },
        { min: 6.3, max: 7.1, hcp: 8 }, { min: 7.2, max: 7.9, hcp: 9 }, { min: 8.0, max: 8.7, hcp: 10 },
        { min: 8.8, max: 9.6, hcp: 11 }, { min: 9.7, max: 10.4, hcp: 12 }, { min: 10.5, max: 11.3, hcp: 13 },
        { min: 11.4, max: 12.1, hcp: 14 }, { min: 12.2, max: 12.9, hcp: 15 }, { min: 13.0, max: 13.8, hcp: 16 },
        { min: 13.9, max: 14.6, hcp: 17 }, { min: 14.7, max: 15.4, hcp: 18 }, { min: 15.5, max: 16.3, hcp: 19 },
        { min: 16.4, max: 17.1, hcp: 20 }, { min: 17.2, max: 17.9, hcp: 21 }, { min: 18.0, max: 18.8, hcp: 22 },
        { min: 18.9, max: 19.6, hcp: 23 }, { min: 19.7, max: 20.5, hcp: 24 }, { min: 20.6, max: 21.3, hcp: 25 },
        { min: 21.4, max: 22.1, hcp: 26 }, { min: 22.2, max: 23.0, hcp: 27 }, { min: 23.1, max: 23.8, hcp: 28 },
        { min: 23.9, max: 24.6, hcp: 29 }, { min: 24.7, max: 25.5, hcp: 30 }, { min: 25.6, max: 26.3, hcp: 31 },
        { min: 26.4, max: 27.2, hcp: 32 }, { min: 27.3, max: 28.0, hcp: 33 }, { min: 28.1, max: 28.8, hcp: 34 },
        { min: 28.9, max: 29.7, hcp: 35 }, { min: 29.8, max: 30.5, hcp: 36 }, { min: 30.6, max: 31.3, hcp: 37 },
        { min: 31.4, max: 32.2, hcp: 38 }, { min: 32.3, max: 33.0, hcp: 39 }, { min: 33.1, max: 33.9, hcp: 40 },
        { min: 34.0, max: 34.7, hcp: 41 }, { min: 34.8, max: 35.5, hcp: 42 }, { min: 35.6, max: 36.4, hcp: 43 },
        { min: 36.5, max: 37.2, hcp: 44 }, { min: 37.3, max: 38.0, hcp: 45 }, { min: 38.1, max: 38.9, hcp: 46 },
        { min: 39.0, max: 39.7, hcp: 47 }, { min: 39.8, max: 40.5, hcp: 48 }, { min: 40.6, max: 41.4, hcp: 49 },
        { min: 41.5, max: 42.2, hcp: 50 }, { min: 42.3, max: 43.1, hcp: 51 }, { min: 43.2, max: 43.9, hcp: 52 },
        { min: 44.0, max: 44.7, hcp: 53 }, { min: 44.8, max: 45.6, hcp: 54 }, { min: 45.7, max: 46.4, hcp: 55 },
        { min: 46.5, max: 47.2, hcp: 56 }, { min: 47.3, max: 48.1, hcp: 57 }, { min: 48.2, max: 48.9, hcp: 58 },
        { min: 49.0, max: 49.8, hcp: 59 }, { min: 49.9, max: 50.6, hcp: 60 }, { min: 50.7, max: 51.4, hcp: 61 },
        { min: 51.5, max: 52.3, hcp: 62 }, { min: 52.4, max: 53.1, hcp: 63 }, { min: 53.2, max: 53.9, hcp: 64 },
        { min: 54.0, max: 54.0, hcp: 65 }
    ],
    rd: [
        { min: -3.1, max: -2.3, hcp: -6 }, { min: -2.2, max: -1.5, hcp: -5 }, { min: -1.4, max: -0.6, hcp: -4 },
        { min: -0.5, max: 0.2, hcp: -3 }, { min: 0.3, max: 1.0, hcp: -2 }, { min: 1.1, max: 1.9, hcp: -1 },
        { min: 2.0, max: 2.7, hcp: 0 }, { min: 2.8, max: 3.6, hcp: 1 }, { min: 3.7, max: 4.4, hcp: 2 },
        { min: 4.5, max: 5.3, hcp: 3 }, { min: 5.4, max: 6.1, hcp: 4 }, { min: 6.2, max: 6.9, hcp: 5 },
        { min: 7.0, max: 7.8, hcp: 6 }, { min: 7.9, max: 8.6, hcp: 7 }, { min: 8.7, max: 9.5, hcp: 8 },
        { min: 9.6, max: 10.3, hcp: 9 }, { min: 10.4, max: 11.2, hcp: 10 }, { min: 11.3, max: 12.0, hcp: 11 },
        { min: 12.1, max: 12.9, hcp: 12 }, { min: 13.0, max: 13.7, hcp: 13 }, { min: 13.8, max: 14.5, hcp: 14 },
        { min: 14.6, max: 15.4, hcp: 15 }, { min: 15.5, max: 16.2, hcp: 16 }, { min: 16.3, max: 17.1, hcp: 17 },
        { min: 17.2, max: 17.9, hcp: 18 }, { min: 18.0, max: 18.8, hcp: 19 }, { min: 18.9, max: 19.6, hcp: 20 },
        { min: 19.7, max: 20.4, hcp: 21 }, { min: 20.5, max: 21.3, hcp: 22 }, { min: 21.4, max: 22.1, hcp: 23 },
        { min: 22.2, max: 23.0, hcp: 24 }, { min: 23.1, max: 23.8, hcp: 25 }, { min: 23.9, max: 24.7, hcp: 26 },
        { min: 24.8, max: 25.5, hcp: 27 }, { min: 25.6, max: 26.3, hcp: 28 }, { min: 26.4, max: 27.2, hcp: 29 },
        { min: 27.3, max: 28.0, hcp: 30 }, { min: 28.1, max: 28.9, hcp: 31 }, { min: 29.0, max: 29.7, hcp: 32 },
        { min: 29.8, max: 30.6, hcp: 33 }, { min: 30.7, max: 31.4, hcp: 34 }, { min: 31.5, max: 32.2, hcp: 35 },
        { min: 32.3, max: 33.1, hcp: 36 }, { min: 33.2, max: 33.9, hcp: 37 }, { min: 34.0, max: 34.8, hcp: 38 },
        { min: 34.9, max: 35.6, hcp: 39 }, { min: 35.7, max: 36.5, hcp: 40 }, { min: 36.6, max: 37.3, hcp: 41 },
        { min: 37.4, max: 38.2, hcp: 42 }, { min: 38.3, max: 39.0, hcp: 43 }, { min: 39.1, max: 39.8, hcp: 44 },
        { min: 39.9, max: 40.7, hcp: 45 }, { min: 40.8, max: 41.5, hcp: 46 }, { min: 41.6, max: 42.4, hcp: 47 },
        { min: 42.5, max: 43.2, hcp: 48 }, { min: 43.3, max: 44.1, hcp: 49 }, { min: 44.2, max: 44.9, hcp: 50 },
        { min: 45.0, max: 45.7, hcp: 51 }, { min: 45.8, max: 46.6, hcp: 52 }, { min: 46.7, max: 47.4, hcp: 53 },
        { min: 47.5, max: 48.3, hcp: 54 }, { min: 48.4, max: 49.1, hcp: 55 }, { min: 49.2, max: 50.0, hcp: 56 },
        { min: 50.1, max: 50.8, hcp: 57 }, { min: 50.9, max: 51.6, hcp: 58 }, { min: 51.7, max: 52.5, hcp: 59 },
        { min: 52.6, max: 53.3, hcp: 60 }, { min: 53.4, max: 54.0, hcp: 61 }
    ]
};

const PESTOVO_WOMEN_HCP_TABLE = {
    bl: [
        { min: -6.8, max: -6.2, hcp: 0 }, { min: -6.1, max: -5.4, hcp: 1 }, { min: -5.3, max: -4.7, hcp: 2 },
        { min: -4.6, max: -4.0, hcp: 3 }, { min: -3.9, max: -3.2, hcp: 4 }, { min: -3.1, max: -2.5, hcp: 5 },
        { min: -2.4, max: -1.7, hcp: 6 }, { min: -1.6, max: -1.0, hcp: 7 }, { min: -0.9, max: -0.3, hcp: 8 },
        { min: -0.2, max: 0.5, hcp: 9 }, { min: 0.6, max: 1.2, hcp: 10 }, { min: 1.3, max: 1.9, hcp: 11 },
        { min: 2.0, max: 2.7, hcp: 12 }, { min: 2.8, max: 3.4, hcp: 13 }, { min: 3.5, max: 4.2, hcp: 14 },
        { min: 4.3, max: 4.9, hcp: 15 }, { min: 5.0, max: 5.6, hcp: 16 }, { min: 5.7, max: 6.4, hcp: 17 },
        { min: 6.5, max: 7.1, hcp: 18 }, { min: 7.2, max: 7.9, hcp: 19 }, { min: 8.0, max: 8.6, hcp: 20 },
        { min: 8.7, max: 9.3, hcp: 21 }, { min: 9.4, max: 10.1, hcp: 22 }, { min: 10.2, max: 10.8, hcp: 23 },
        { min: 10.9, max: 11.5, hcp: 24 }, { min: 11.6, max: 12.3, hcp: 25 }, { min: 12.4, max: 13.0, hcp: 26 },
        { min: 13.1, max: 13.8, hcp: 27 }, { min: 13.9, max: 14.5, hcp: 28 }, { min: 14.6, max: 15.2, hcp: 29 },
        { min: 15.3, max: 16.0, hcp: 30 }, { min: 16.1, max: 16.7, hcp: 31 }, { min: 16.8, max: 17.5, hcp: 32 },
        { min: 17.6, max: 18.2, hcp: 33 }, { min: 18.3, max: 18.9, hcp: 34 }, { min: 19.0, max: 19.7, hcp: 35 },
        { min: 19.8, max: 20.4, hcp: 36 }, { min: 20.5, max: 21.1, hcp: 37 }, { min: 21.2, max: 21.9, hcp: 38 },
        { min: 22.0, max: 22.6, hcp: 39 }, { min: 22.7, max: 23.4, hcp: 40 }, { min: 23.5, max: 24.1, hcp: 41 },
        { min: 24.2, max: 24.8, hcp: 42 }, { min: 24.9, max: 25.6, hcp: 43 }, { min: 25.7, max: 26.3, hcp: 44 },
        { min: 26.4, max: 27.1, hcp: 45 }, { min: 27.2, max: 27.8, hcp: 46 }, { min: 27.9, max: 28.5, hcp: 47 },
        { min: 28.6, max: 29.3, hcp: 48 }, { min: 29.4, max: 30.0, hcp: 49 }, { min: 30.1, max: 30.7, hcp: 50 },
        { min: 30.8, max: 31.5, hcp: 51 }, { min: 31.6, max: 32.2, hcp: 52 }, { min: 32.3, max: 33.0, hcp: 53 },
        { min: 33.1, max: 33.7, hcp: 54 }, { min: 33.8, max: 34.4, hcp: 55 }, { min: 34.5, max: 35.2, hcp: 56 },
        { min: 35.3, max: 35.9, hcp: 57 }, { min: 36.0, max: 36.7, hcp: 58 }, { min: 36.8, max: 37.4, hcp: 59 },
        { min: 37.5, max: 38.1, hcp: 60 }, { min: 38.2, max: 38.9, hcp: 61 }, { min: 39.0, max: 39.6, hcp: 62 },
        { min: 39.7, max: 40.3, hcp: 63 }, { min: 40.4, max: 41.1, hcp: 64 }, { min: 41.2, max: 41.8, hcp: 65 },
        { min: 41.9, max: 42.6, hcp: 66 }, { min: 42.7, max: 43.3, hcp: 67 }, { min: 43.4, max: 44.0, hcp: 68 },
        { min: 44.1, max: 44.8, hcp: 69 }, { min: 44.9, max: 45.5, hcp: 70 }, { min: 45.6, max: 46.3, hcp: 71 },
        { min: 46.4, max: 47.0, hcp: 72 }, { min: 47.1, max: 47.7, hcp: 73 }, { min: 47.8, max: 48.5, hcp: 74 },
        { min: 48.6, max: 49.2, hcp: 75 }, { min: 49.3, max: 50.0, hcp: 76 }, { min: 50.1, max: 50.7, hcp: 77 },
        { min: 50.8, max: 51.4, hcp: 78 }, { min: 51.5, max: 52.2, hcp: 79 }, { min: 52.3, max: 52.9, hcp: 80 },
        { min: 53.0, max: 53.6, hcp: 81 }, { min: 53.7, max: 54.0, hcp: 82 }
    ],
    wh: [
        { min: -5.6, max: -4.9, hcp: 0 }, { min: -4.8, max: -4.1, hcp: 1 }, { min: -4.0, max: -3.3, hcp: 2 },
        { min: -3.2, max: -2.5, hcp: 3 }, { min: -2.4, max: -1.7, hcp: 4 }, { min: -1.6, max: -0.9, hcp: 5 },
        { min: -0.8, max: -0.1, hcp: 6 }, { min: 0.0, max: 0.7, hcp: 7 }, { min: 0.8, max: 1.5, hcp: 8 },
        { min: 1.6, max: 2.2, hcp: 9 }, { min: 2.3, max: 3.0, hcp: 10 }, { min: 3.1, max: 3.8, hcp: 11 },
        { min: 3.9, max: 4.6, hcp: 12 }, { min: 4.7, max: 5.4, hcp: 13 }, { min: 5.5, max: 6.2, hcp: 14 },
        { min: 6.3, max: 7.0, hcp: 15 }, { min: 7.1, max: 7.8, hcp: 16 }, { min: 7.9, max: 8.6, hcp: 17 },
        { min: 8.7, max: 9.4, hcp: 18 }, { min: 9.5, max: 10.1, hcp: 19 }, { min: 10.2, max: 10.9, hcp: 20 },
        { min: 11.0, max: 11.7, hcp: 21 }, { min: 11.8, max: 12.5, hcp: 22 }, { min: 12.6, max: 13.3, hcp: 23 },
        { min: 13.4, max: 14.1, hcp: 24 }, { min: 14.2, max: 14.9, hcp: 25 }, { min: 15.0, max: 15.7, hcp: 26 },
        { min: 15.8, max: 16.5, hcp: 27 }, { min: 16.6, max: 17.3, hcp: 28 }, { min: 17.4, max: 18.0, hcp: 29 },
        { min: 18.1, max: 18.8, hcp: 30 }, { min: 18.9, max: 19.6, hcp: 31 }, { min: 19.7, max: 20.4, hcp: 32 },
        { min: 20.5, max: 21.2, hcp: 33 }, { min: 21.3, max: 22.0, hcp: 34 }, { min: 22.1, max: 22.8, hcp: 35 },
        { min: 22.9, max: 23.6, hcp: 36 }, { min: 23.7, max: 24.4, hcp: 37 }, { min: 24.5, max: 25.2, hcp: 38 },
        { min: 25.3, max: 25.9, hcp: 39 }, { min: 26.0, max: 26.7, hcp: 40 }, { min: 26.8, max: 27.5, hcp: 41 },
        { min: 27.6, max: 28.3, hcp: 42 }, { min: 28.4, max: 29.1, hcp: 43 }, { min: 29.2, max: 29.9, hcp: 44 },
        { min: 30.0, max: 30.7, hcp: 45 }, { min: 30.8, max: 31.5, hcp: 46 }, { min: 31.6, max: 32.3, hcp: 47 },
        { min: 32.4, max: 33.1, hcp: 48 }, { min: 33.2, max: 33.9, hcp: 49 }, { min: 34.0, max: 34.6, hcp: 50 },
        { min: 34.7, max: 35.4, hcp: 51 }, { min: 35.5, max: 36.2, hcp: 52 }, { min: 36.3, max: 37.0, hcp: 53 },
        { min: 37.1, max: 37.8, hcp: 54 }, { min: 37.9, max: 38.6, hcp: 55 }, { min: 38.7, max: 39.4, hcp: 56 },
        { min: 39.5, max: 40.2, hcp: 57 }, { min: 40.3, max: 41.0, hcp: 58 }, { min: 41.1, max: 41.8, hcp: 59 },
        { min: 41.9, max: 42.5, hcp: 60 }, { min: 42.6, max: 43.3, hcp: 61 }, { min: 43.4, max: 44.1, hcp: 62 },
        { min: 44.2, max: 44.9, hcp: 63 }, { min: 45.0, max: 45.7, hcp: 64 }, { min: 45.8, max: 46.5, hcp: 65 },
        { min: 46.6, max: 47.3, hcp: 66 }, { min: 47.4, max: 48.1, hcp: 67 }, { min: 48.2, max: 48.9, hcp: 68 },
        { min: 49.0, max: 49.7, hcp: 69 }, { min: 49.8, max: 50.4, hcp: 70 }, { min: 50.5, max: 51.2, hcp: 71 },
        { min: 51.3, max: 52.0, hcp: 72 }, { min: 52.1, max: 52.8, hcp: 73 }, { min: 52.9, max: 53.6, hcp: 74 },
        { min: 53.7, max: 54.0, hcp: 75 }
    ],
    rd: [
        { min: -3.0, max: -2.3, hcp: 0 }, { min: -2.2, max: -1.5, hcp: 1 }, { min: -1.4, max: -0.6, hcp: 2 },
        { min: -0.5, max: 0.2, hcp: 3 }, { min: 0.3, max: 1.0, hcp: 4 }, { min: 1.1, max: 1.9, hcp: 5 },
        { min: 2.0, max: 2.7, hcp: 6 }, { min: 2.8, max: 3.5, hcp: 7 }, { min: 3.6, max: 4.4, hcp: 8 },
        { min: 4.5, max: 5.2, hcp: 9 }, { min: 5.3, max: 6.0, hcp: 10 }, { min: 6.1, max: 6.8, hcp: 11 },
        { min: 6.9, max: 7.7, hcp: 12 }, { min: 7.8, max: 8.5, hcp: 13 }, { min: 8.6, max: 9.3, hcp: 14 },
        { min: 9.4, max: 10.2, hcp: 15 }, { min: 10.3, max: 11.0, hcp: 16 }, { min: 11.1, max: 11.8, hcp: 17 },
        { min: 11.9, max: 12.7, hcp: 18 }, { min: 12.8, max: 13.5, hcp: 19 }, { min: 13.6, max: 14.3, hcp: 20 },
        { min: 14.4, max: 15.2, hcp: 21 }, { min: 15.3, max: 16.0, hcp: 22 }, { min: 16.1, max: 16.8, hcp: 23 },
        { min: 16.9, max: 17.6, hcp: 24 }, { min: 17.7, max: 18.5, hcp: 25 }, { min: 18.6, max: 19.3, hcp: 26 },
        { min: 19.4, max: 20.1, hcp: 27 }, { min: 20.2, max: 21.0, hcp: 28 }, { min: 21.1, max: 21.8, hcp: 29 },
        { min: 21.9, max: 22.6, hcp: 30 }, { min: 22.7, max: 23.5, hcp: 31 }, { min: 23.6, max: 24.3, hcp: 32 },
        { min: 24.4, max: 25.1, hcp: 33 }, { min: 25.2, max: 26.0, hcp: 34 }, { min: 26.1, max: 26.8, hcp: 35 },
        { min: 26.9, max: 27.6, hcp: 36 }, { min: 27.7, max: 28.4, hcp: 37 }, { min: 28.5, max: 29.3, hcp: 38 },
        { min: 29.4, max: 30.1, hcp: 39 }, { min: 30.2, max: 30.9, hcp: 40 }, { min: 31.0, max: 31.8, hcp: 41 },
        { min: 31.9, max: 32.6, hcp: 42 }, { min: 32.7, max: 33.4, hcp: 43 }, { min: 33.5, max: 34.3, hcp: 44 },
        { min: 34.4, max: 35.1, hcp: 45 }, { min: 35.2, max: 35.9, hcp: 46 }, { min: 36.0, max: 36.8, hcp: 47 },
        { min: 36.9, max: 37.6, hcp: 48 }, { min: 37.7, max: 38.4, hcp: 49 }, { min: 38.5, max: 39.3, hcp: 50 },
        { min: 39.4, max: 40.1, hcp: 51 }, { min: 40.2, max: 40.9, hcp: 52 }, { min: 41.0, max: 41.7, hcp: 53 },
        { min: 41.8, max: 42.6, hcp: 54 }, { min: 42.7, max: 43.4, hcp: 55 }, { min: 43.5, max: 44.2, hcp: 56 },
        { min: 44.3, max: 45.1, hcp: 57 }, { min: 45.2, max: 45.9, hcp: 58 }, { min: 46.0, max: 46.7, hcp: 59 },
        { min: 46.8, max: 47.6, hcp: 60 }, { min: 47.7, max: 48.4, hcp: 61 }, { min: 48.5, max: 49.2, hcp: 62 },
        { min: 49.3, max: 50.1, hcp: 63 }, { min: 50.2, max: 50.9, hcp: 64 }, { min: 51.0, max: 51.7, hcp: 65 },
        { min: 51.8, max: 52.5, hcp: 66 }, { min: 52.6, max: 53.4, hcp: 67 }, { min: 53.5, max: 54.0, hcp: 68 }
    ]
};

function getFieldHcp(exactHcp, teeCode, gender) {
    var parsed = parseExactHcp(exactHcp);
    gender = gender || 'men'; teeCode = teeCode || 'wh';

    if (gender === 'men' && PESTOVO_MEN_HCP_TABLE[teeCode]) {
        var list = PESTOVO_MEN_HCP_TABLE[teeCode];
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (parsed >= r.min - 0.001 && parsed <= r.max + 0.001) {
                return r.hcp;
            }
        }
    } else if (gender === 'women' && PESTOVO_WOMEN_HCP_TABLE[teeCode]) {
        var list = PESTOVO_WOMEN_HCP_TABLE[teeCode];
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (parsed >= r.min - 0.001 && parsed <= r.max + 0.001) {
                return r.hcp;
            }
        }
    }

    var rating = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][teeCode];
    if (!rating) return Math.round(parsed);
    var field = (parsed * (rating.sr / 113)) + (rating.cr - TOTAL_PAR);
    return Math.round(field);
}

function generateHcpTable(gender, teeCode) {
    gender = gender || 'men'; teeCode = teeCode || 'wh';

    if (gender === 'men' && PESTOVO_MEN_HCP_TABLE[teeCode]) {
        return PESTOVO_MEN_HCP_TABLE[teeCode].map(function(r) {
            return [fmtExactHcp(r.min), fmtExactHcp(r.max), fmtFieldHcp(r.hcp)];
        });
    } else if (gender === 'women' && PESTOVO_WOMEN_HCP_TABLE[teeCode]) {
        return PESTOVO_WOMEN_HCP_TABLE[teeCode].map(function(r) {
            return [fmtExactHcp(r.min), fmtExactHcp(r.max), fmtFieldHcp(r.hcp)];
        });
    }

    var rating = COURSE_RATINGS[gender] && COURSE_RATINGS[gender][teeCode];
    if (!rating) return [];
    var rows = [];
    var maxPlus = -5.0;
    var maxHandicap = 54.0;

    var curStart = maxPlus;
    var curField = getFieldHcp(curStart, teeCode, gender);

    for (var x = -4.9; x <= maxHandicap + 0.05; x += 0.1) {
        var exactVal = Math.round(x * 10) / 10;
        var f = getFieldHcp(exactVal, teeCode, gender);
        if (f !== curField) {
            var prevExact = Math.round((exactVal - 0.1) * 10) / 10;
            rows.push([fmtExactHcp(curStart), fmtExactHcp(prevExact), fmtFieldHcp(curField)]);
            curStart = exactVal;
            curField = f;
        }
    }
    rows.push([fmtExactHcp(curStart), fmtExactHcp(maxHandicap), fmtFieldHcp(curField)]);
    return rows;
}

var HCP_TABLE = {
    get men() {
        return {
            bk: generateHcpTable('men', 'bk'),
            bl: generateHcpTable('men', 'bl'),
            wh: generateHcpTable('men', 'wh'),
            rd: generateHcpTable('men', 'rd')
        };
    },
    get women() {
        return {
            bl: generateHcpTable('women', 'bl'),
            wh: generateHcpTable('women', 'wh'),
            rd: generateHcpTable('women', 'rd')
        };
    }
};
if (typeof window !== 'undefined') {
    window.HCP_TABLE = HCP_TABLE;
}

// Кол-во ударов полевой форы (course handicap) на конкретной лунке.
// Фора раздаётся по индексам лунок: индекс 1 — самая сложная лунка, получает удар первой и т.д.
// fieldHcp = 18 -> по 1 удару на каждой лунке; 19 -> +доп. удар на лунке с индексом 1;
// отрицательная фора раздаётся с самой простой лунки (индекс 18).
function hcpStrokesOnHole(holeNum,fieldHcp){
    fieldHcp=parseInt(fieldHcp)||0;
    if(!fieldHcp)return 0;
    var idx=holeHcp(holeNum);
    if(!idx)return 0;
    if(fieldHcp>0){
        var n=Math.floor(fieldHcp/18);
        if(idx<=(fieldHcp%18))n++;
        return n;
    }
    var a=Math.abs(fieldHcp);
    var m=-Math.floor(a/18);
    if((19-idx)<=(a%18))m--;
    return m;
}

// Маленькие чёрточки-индикаторы ударов форы для квадратика с номером лунки.
function hcpStrokesMarksHTML(fieldHcp,holeNum){
    var n=hcpStrokesOnHole(holeNum,fieldHcp);
    if(!n)return '';
    var neg=n<0,cnt=Math.abs(n),bars=[];
    for(var i=0;i<cnt;i++)bars.push('<span class="hm-bar"></span>');
    var title;
    if(currentLang==='en'){
        title=cnt+(cnt===1?' handicap stroke':' handicap strokes')+(neg?' (given)':'');
    }else{
        title='Фора: '+cnt+' '+pluralN(cnt,'удар','удара','ударов')+(neg?' (минусовая)':'');
    }
    return '<span class="hcp-marks'+(neg?' hm-minus':'')+'" title="'+title+'">'+bars.join('')+'</span>';
}

// Счёт игрока и маркера внутри квадратика лунки (страницы ввода результата).
// Строка абсолютно позиционирована внизу кнопки и не меняет её размер, поэтому
// сетка лунок остаётся стабильной. Счёт игрока — без метки, счёт маркера —
// с меткой «М» (marker_score_short) и синим цветом, чтобы было видно, чей он.
function hbnScoresHtml(playerScore, markerScore) {
    var p = parseInt(playerScore) >= 1 ? parseInt(playerScore) : 0;
    var m = parseInt(markerScore) >= 1 ? parseInt(markerScore) : 0;
    if (!p && !m) return '';
    var pTitle = (typeof t === 'function' ? t('legend_player_score') : 'счёт игрока');
    var mTitle = (typeof t === 'function' ? t('legend_marker_score') : 'счёт маркера');
    var mLbl = (typeof t === 'function' ? t('marker_score_short') : 'M');
    var html = '<span class="hbn-scores">';
    if (p) html += '<span class="hbn-s hbn-s-player" title="' + pTitle + '">' + p + '</span>';
    if (m) html += '<span class="hbn-s hbn-s-marker" title="' + mTitle + '"><span class="hbn-s-lbl">' + mLbl + '</span>' + m + '</span>';
    html += '</span>';
    return html;
}

function pluralN(n,one,few,many){
    var m10=n%10,m100=n%100;
    if(m10===1&&m100!==11)return one;
    if(m10>=2&&m10<=4&&(m100<10||m100>=20))return few;
    return many;
}

function stablefordField(strokes,holeNum,fieldHcp){
    if(!strokes||strokes<1)return 0;
    var par=holePar(holeNum),hcpIdx=holeHcp(holeNum),extra=0;
    if(fieldHcp>0&&hcpIdx>0){
        extra=Math.floor(fieldHcp/18);
        if(hcpIdx<=(fieldHcp%18))extra++;
    } else if(fieldHcp<0&&hcpIdx>0){
        var absHcp=Math.abs(fieldHcp);
        extra=-Math.floor(absHcp/18);
        if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    var nett=strokes-extra,diff=nett-par;
    return Math.max(0, 2 - diff);
}

function stablefordExact(strokes,holeNum,exactHcp){
    if(!strokes||strokes<1)return 0;
    var par=holePar(holeNum),hcpIdx=holeHcp(holeNum),hcp=Math.round(parseExactHcp(exactHcp)||0),extra=0;
    if(hcp>0&&hcpIdx>0){
        extra=Math.floor(hcp/18);
        if(hcpIdx<=(hcp%18))extra++;
    } else if(hcp<0&&hcpIdx>0){
        var absHcp=Math.abs(hcp);
        extra=-Math.floor(absHcp/18);
        if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    var nett=strokes-extra,diff=nett-par;
    return Math.max(0, 2 - diff);
}

// Настройка отображения очков Stableford. Если игрок ещё не выбрал своё
// значение, используется клубный дефолт из settings/stableford_display_default.
// Дефолт ВЫКЛЮЧЕН: очки Stableford не показываются рядом со счётом, пока игрок
// (или администратор клуба) явно не включит их в своём раунде/настройках.
var pestovoStablefordDisplayDefault = false;

function normalizeStablefordDisplayValue(value) {
    if (value === true || value === 1 || value === '1' || value === 'true') return true;
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    return null;
}

function isStablefordDisplayDefaultEnabled() {
    return pestovoStablefordDisplayDefault !== false;
}

function isPlayerStablefordDisplayEnabled(player) {
    var personalValue = player && normalizeStablefordDisplayValue(player.stablefordDisplay);
    return personalValue === null ? isStablefordDisplayDefaultEnabled() : personalValue;
}

function stablefordPointsText(points) {
    points = Math.max(0, parseInt(points) || 0);
    if (currentLang === 'en') {
        return points + ' Stableford ' + (points === 1 ? 'point' : 'points');
    }
    return points + ' ' + pluralN(points, 'очко', 'очка', 'очков') + ' Stableford';
}

// Shared score square: handicap is attached to the score, never the hole number.
function scoreSquareHTML(score, hole, fieldHcp) {
    var n = parseInt(score, 10) || 0;
    var strokes = hcpStrokesOnHole(hole, fieldHcp || 0);
    var marks = hcpStrokesMarksHTML(fieldHcp || 0, hole);
    return '<span class="entry-score-square"><span class="score-gross">' + (n > 0 ? n : '—') + '</span>' +
        (marks ? '<span class="entry-handicap" role="img" aria-label="' + (currentLang === 'en' ? 'Handicap strokes: ' : 'Удары форы: ') + strokes + '">' + marks + '</span>' : '') + '</span>';
}

function entryHoleContentHTML(score, marker, hole, fieldHcp) {
    return '<span class="entry-hole-number">' + hole + '<small>' + (currentLang === 'en' ? 'Par ' : 'Пар ') + holePar(hole) + '</small></span>' +
        scoreSquareHTML(score, hole, fieldHcp) +
        (marker === null ? '' : '<span class="entry-marker">' + (currentLang === 'en' ? 'M ' : 'М ') + (parseInt(marker, 10) > 0 ? parseInt(marker, 10) : '—') + '</span>');
}

// Разметка крупного счёта: gross остаётся главным, а очки отображаются рядом,
// например: 4 (3 очка Stableford). Используется в каждом экране ввода счёта.
function scoreWithStablefordHTML(score, holeNum, fieldHcp, showStableford) {
    var gross = parseInt(score) || 0;
    var html = scoreSquareHTML(gross, holeNum, fieldHcp);
    if (showStableford && gross > 0) {
        var points = stablefordField(gross, holeNum, fieldHcp || 0);
        var label = stablefordPointsText(points);
        html += '<span class="score-stableford-points" aria-label="' + label + '">(' + label + ')</span>';
    }
    return html;
}

function syncStablefordDisplayDefault(value) {
    var normalized = normalizeStablefordDisplayValue(value);
    // Отсутствующий ключ settings/stableford_display_default — выключенный
    // дефолт: по умолчанию очки Stableford не показываются ни у кого.
    pestovoStablefordDisplayDefault = normalized === null ? false : normalized;
    try {
        if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
            document.dispatchEvent(new CustomEvent('pestovo-stableford-default-change'));
        }
    } catch (e) { console.warn("[silent]", e); }
}

function calcNettScore(strokes,par,hcpIdx,fieldHcp){
    if(!strokes||strokes<1)return 0;
    var extra=0;
    if(fieldHcp>0&&hcpIdx>0){
        extra=Math.floor(fieldHcp/18);
        if(hcpIdx<=(fieldHcp%18))extra++;
    } else if(fieldHcp<0&&hcpIdx>0){
        var absHcp=Math.abs(fieldHcp);
        extra=-Math.floor(absHcp/18);
        if((19-hcpIdx)<=(absHcp%18))extra--;
    }
    return strokes-extra;
}

function calcRoundStats(scores,fieldHcp,exactHcp,holesOrder){
    holesOrder=holesOrder||[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
    var played=[],remaining=[],gross=0,parPlayed=0,netTotal=0,stblField=0,stblExact=0;
    var birdies=0,eagles=0,pars=0,bogeys=0,doubles=0,hio=0,currentHole=null;
    var maxPlayedIdx=-1;

    for(var i=0;i<holesOrder.length;i++){
        var h=holesOrder[i], rawScore = (scores && scores[h] != null) ? scores[h] : '';
        var rawStr = String(rawScore).trim();
        var isPickup = (rawStr === 'X' || rawStr === 'x' || rawStr === '0' || rawStr === '-');
        var s = (!isPickup && rawStr) ? parseInt(rawStr, 10) : 0;
        var par=holePar(h);
        if(s>=1 || isPickup){
            played.push(h);parPlayed+=par;
            if (s>=1) {
                gross+=s;
                netTotal+=calcNettScore(s,par,holeHcp(h),fieldHcp||0);
                var diff=s-par;
                if(diff<=-2)eagles++;else if(diff===-1)birdies++;else if(diff===0)pars++;else if(diff===1)bogeys++;else doubles++;
                if(s===1)hio++;
                stblField+=stablefordField(s,h,fieldHcp||0);
                stblExact+=stablefordExact(s,h,exactHcp||0);
            } else {
                doubles++;
            }
            if(i>maxPlayedIdx) maxPlayedIdx=i;
        }else{
            remaining.push(h);
        }
    }
    if(maxPlayedIdx>=0){
        if(maxPlayedIdx+1<holesOrder.length) currentHole=holesOrder[maxPlayedIdx+1];
        else currentHole=null;
    }else{
        currentHole=holesOrder.length?holesOrder[0]:null;
    }
    var toPar=played.length>0?gross-parPlayed:null;
    var netToPar=played.length>0?netTotal-parPlayed:null;
    var courseTotalPar = (typeof TOTAL_PAR !== 'undefined' ? TOTAL_PAR : 72);
    var projected=played.length>0?gross+(courseTotalPar-parPlayed):null;
    return{played:played,remaining:remaining,holesPlayed:played.length,holesRemaining:remaining.length,currentHole:currentHole,gross:gross,parPlayed:parPlayed,toPar:toPar,net:netTotal,netToPar:netToPar,projected:projected,stablefordField:stblField,stablefordExact:stblExact,birdies:birdies,eagles:eagles,pars:pars,bogeys:bogeys,doubles:doubles,holeInOne:hio};
}

// ==========================================
// СЧЁТНАЯ КАРТОЧКА: ВКЛАДКИ ДЕВЯТОК, НАКОПИТЕЛЬНЫЙ TO-PAR,
// ПОДСВЕТКА ТЕКУЩЕЙ ЛУНКИ И БЫСТРЫЙ ПЕРЕХОД К НЕЙ
// ==========================================

// Вкладки «Первые 9 / Вторые 9 / Все 18» удалены: карточка всегда
// показывает все лунки выбранного диапазона сразу.
function holeNineClass(h) { return h <= 9 ? 'sc-h-front' : 'sc-h-back'; }

// Строка накопительного to-par удалена по требованию клуба: блок
// «To-par по ходу» больше не отображается ни на одной странице.
// Функция сохранена для совместимости — она по-прежнему считает
// накопительный run (нужен для продолжения счёта со второй девятки),
// но не возвращает разметку.
function buildToParRowHTML(order, sc, startRun, gridClass, wrapClass) {
    var run = startRun || 0;
    var playedAny = false;

    order.forEach(function(i) {
        var s = parseInt(sc[i]) || 0;
        if (s >= 1) {
            playedAny = true;
            run += s - holePar(i);
        }
    });

    if (!playedAny) return { html: '', run: run };
    return { html: '', run: run };
}

// Переход к текущей лунке игрока: плитка подсвечивается и прокручивается в центр экрана.
function scrollToPlayerCurrentHole(pid) {
    var tile = document.querySelector('.sc-cur-tile[data-sc-player="' + pid + '"]');
    if (!tile) {
        if (typeof toast === 'function') toast(t('no_current_hole'), 'info');
        return;
    }
    // Все лунки всегда видны (вкладки девяток удалены).
    if (typeof tile.scrollIntoView === 'function') {
        tile.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    }
    tile.classList.add('sc-cur-flash');
    setTimeout(function() { tile.classList.remove('sc-cur-flash'); }, 1800);
}

// Счёт, который маркер игрока ввёл ЗА этого игрока на лунке.
// Хранится в карточке самого игрока: p.markerScores[markedBy][hole].
// Возвращает { score, markerId } (score = 0, если маркер ещё не вводил).
function getPlayerMarkerScoreForHole(p, h) {
    p = p || {};
    var mkId = p.markedBy || null;
    var ms = 0;
    if (mkId && p.markerScores && p.markerScores[mkId]) {
        ms = parseInt(p.markerScores[mkId][h]) || 0;
    }
    // Запасной вариант: маркер мог ввести счёт под другим ключом
    // (например, после переназначения маркеров) — ищем любое значение на лунке.
    if (!ms && p.markerScores) {
        var keys = Object.keys(p.markerScores);
        for (var i = 0; i < keys.length; i++) {
            var v = parseInt(p.markerScores[keys[i]] && p.markerScores[keys[i]][h]) || 0;
            if (v >= 1) { ms = v; if (!mkId) mkId = keys[i]; break; }
        }
    }
    return { score: ms, markerId: mkId };
}

// Есть ли у игрока хоть один введённый маркером счёт (для компактных слоёв).
function playerHasAnyMarkerScore(p, order) {
    if (!p || !p.markerScores) return false;
    for (var i = 0; i < (order || []).length; i++) {
        if (getPlayerMarkerScoreForHole(p, order[i]).score >= 1) return true;
    }
    return false;
}

// Мини-легенда двойной карточки «игрок + маркер» (страница ввода результатов).
function buildDualScorecardLegendHTML() {
    return '<div class="dual-card-legend">' +
        '<span class="dcl-item"><i class="fas fa-user"></i> ' + t('legend_player_score') + '</span>' +
        '<span class="dcl-item dcl-marker"><i class="fas fa-pen-nib"></i> ' + t('marker_score_short') + ' — ' + t('legend_marker_score') + '</span>' +
        '<span class="dcl-item dcl-mismatch"><i class="fas fa-triangle-exclamation"></i> ' + t('legend_mismatch') + '</span>' +
        '</div>';
}

// Shared screen-only scorecard. Printing and social PNG use their own renderers.
function renderClubScorecard(player, round, opts) {
    opts = opts || {};
    var p = player || {}, r = round || {};
    var en = currentLang === 'en';
    var pid = opts.playerId || '';
    if (!pid && r.players) Object.keys(r.players).some(function(id) { if (r.players[id] === p) { pid = id; return true; } return false; });
    var order = opts.order || getRoundOrder(r);
    var scores = p.scores || {};
    var hcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
    var tee = p.tee || r.tee || 'wh';
    if (typeof tee !== 'string' || !Object.prototype.hasOwnProperty.call(TEES, tee)) tee = 'wh';
    var name = typeof privacyDisplayName === 'function' ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
    var stats = calcRoundStats(scores, hcp, p.exactHcp || 0, order);
    var current = playerCurrentHole(r, pid, p, stats, order);
    var labels = [en ? 'Hole' : 'Лунка', en ? 'Par' : 'Пар', en ? 'Score' : 'Счёт'];
    if (opts.showMarker) labels.push(en ? 'Marker' : 'Маркер');
    var html = '<section class="club-sc" data-sc-view="' + getRoundScorecardView() + '" aria-label="' + (en ? 'Scorecard' : 'Счётная карточка') + '">';
    html += '<header class="club-sc-head"><strong>' + escapeHtml(name) + '</strong> ' + fmtTeePill(tee) + '<span>HCP ' + escapeHtml(fmtFieldHcp(hcp)) + '</span></header>';
    if (opts.label) html += '<div class="club-sc-caption">' + escapeHtml(opts.label) + '</div>';
    var total = 0, played = 0;
    // Keep the actual playing order, including shotgun starts and nine-hole rounds.
    for (var offset = 0; offset < order.length; offset += 9) {
        var holes = order.slice(offset, offset + 9), gross = 0, count = 0;
        html += '<div class="club-sc-side"><div class="club-sc-caption">' + (en ? 'Holes ' : 'Лунки ') + holes[0] + '–' + holes[holes.length - 1] + '</div>';
        html += '<div class="club-sc-scroll" tabindex="0" aria-label="' + (en ? 'Hole results' : 'Результаты по лункам') + '"><div class="club-sc-grid" style="--sc-holes:' + holes.length + '">';
        html += '<div class="club-sc-labels">' + labels.map(function(label) { return '<div>' + label + '</div>'; }).join('') + '</div>';
        holes.forEach(function(h) {
            var s = parseInt(scores[h], 10) || 0, par = holePar(h);
            if (s > 0) { gross += s; count++; }
            var verify = getHoleVerifyState(p, h);
            var cls = verify === 'mismatch' ? ' cell-mismatch' : '';
            if (h === current) cls += ' sc-cur-tile';
            var strokes = hcpStrokesOnHole(h, hcp);
            var marks = hcpStrokesMarksHTML(hcp, h);
            if (marks) marks = '<span class="club-sc-handicap" role="img" aria-label="' + (en ? 'Handicap strokes: ' : 'Удары форы: ') + strokes + '">' + marks + '</span>';
            var values = [h, par, s > 0 ? s : '—'];
            if (opts.showMarker) {
                var mk = opts.markerScores ? parseInt(opts.markerScores[h], 10) || 0 : getPlayerMarkerScoreForHole(p, h).score;
                values.push(mk > 0 ? mk : '—');
                if (s > 0 && mk > 0 && s !== mk && cls.indexOf('cell-mismatch') < 0) cls += ' cell-mismatch';
            }
            html += '<div class="club-sc-hole' + cls + '" data-sc-player="' + escapeHtml(pid) + '" data-sc-hole="' + h + '"' + (h === current ? ' data-sc-current="1"' : '') + '>';
            values.forEach(function(value, index) {
                var cellClass = ['number', 'par', 'score', 'marker'][index];
                html += '<div class="club-sc-cell club-sc-' + cellClass + (index === 2 && s > 0 ? ' ' + holeResClass(s, par) : '') + '"><span class="club-sc-cell-label">' + labels[index] + '</span><span class="club-sc-value">' + value + (index === 2 ? marks : '') + '</span></div>';
            });
            html += '</div>';
        });
        total += gross; played += count;
        html += '</div></div><div class="club-sc-subtotal">' + (en ? 'Subtotal' : 'Промежуточный итог') + ': <b>' + (count ? gross : '—') + '</b></div></div>';
    }
    html += '<footer class="club-sc-total"><span>Gross <b>' + (played ? total : '—') + '</b></span><span>' + (en ? 'Played ' : 'Сыграно ') + played + '/' + order.length + '</span></footer>';
    return html + '</section>';
}

function generateGroupHoleTableHTML(r, opts) {
    opts = opts || {};
    var players = r.players || {};
    var playerEntries = Object.entries(players).filter(function(pe) {
        // Удалённые и навсегда заблокированные демо-игроки не показываются
        return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name));
    });
    if (!playerEntries.length) return '';

    var order = getRoundOrder(r);

    // Режим showMarker (страница ввода результатов группового раунда):
    // формат карточки — тот же, что на главной («Сейчас на поле»), но рядом
    // со счётом игрока виден и счёт, который ввёл его маркер.
    var legend = opts.showMarker ? buildDualScorecardLegendHTML() : '';

    // Один игрок — личная карточка. Несколько — ОДНА общая карточка на всех
    // с именами и ударами играющих (требование клуба, 2026-09-26).
    if (playerEntries.length === 1) {
        return legend + renderClubScorecard(playerEntries[0][1], r, Object.assign({}, opts, { playerId: playerEntries[0][0], order: order }));
    }
    return legend + renderUnifiedGroupScorecardHTML(r, playerEntries, order, opts);
}

// ОБЩАЯ КАРТОЧКА ГРУППЫ: одна на весь флайт (2+ игрока).
// Строки — лунки в порядке игры, столбцы — игроки (имя, ТИ, фора).
// В ячейках — удары (счёт) каждого игрока, на экранах ввода — и счёт маркера.
// Незаполненный счёт — тире; фора — наклонными чёрточками внутри счёта
// (как в личной карточке); расхождение с маркером подсвечивается,
// текущая лунка каждого игрока — пунктирной рамкой ячейки.
function renderUnifiedGroupScorecardHTML(r, playerEntries, order, opts) {
    opts = opts || {};
    r = r || {};
    playerEntries = playerEntries || [];
    order = (order && order.length) ? order : getRoundOrder(r);
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var view = '1';
    try { view = getRoundScorecardView(); } catch (e) { view = '1'; }
    var n = playerEntries.length;
    var countTxt = en
        ? (n + ' ' + (n === 1 ? 'player' : 'players'))
        : (n + ' ' + pluralN(n, 'игрок', 'игрока', 'игроков'));
    var title = (en ? 'Group scorecard' : 'Общая карточка') + ' · ' + countTxt;
    var fmtTxt = '';
    try {
        fmtTxt = (typeof pestovoRoundFormatBadge === 'function')
            ? pestovoRoundFormatBadge(r, 'Stroke Play')
            : (r.format || 'Stroke Play');
    } catch (e) { fmtTxt = r.format || ''; }
    var esc = (typeof escapeHtml === 'function')
        ? escapeHtml
        : function(v) { return String(v == null ? '' : v); };
    var infos = playerEntries.map(function(pe) {
        var pid = pe[0], p = pe[1] || {};
        var tee = p.tee || r.tee || 'wh';
        if (typeof tee !== 'string' || (typeof TEES !== 'undefined' && !Object.prototype.hasOwnProperty.call(TEES, tee))) tee = 'wh';
        var fhcp = (p.fieldHcp !== undefined && p.fieldHcp !== null && p.fieldHcp !== '')
            ? p.fieldHcp
            : ((r.fieldHcp !== undefined && r.fieldHcp !== null) ? r.fieldHcp : 0);
        var scores = p.scores || {};
        var stats = { gross: 0, toPar: null, holesPlayed: 0, currentHole: null };
        try { stats = calcRoundStats(scores, fhcp, p.exactHcp || 0, order); } catch (e) { console.warn("[silent]", e); }
        var cur = null;
        try {
            cur = (typeof playerCurrentHole === 'function')
                ? playerCurrentHole(r, pid, p, stats, order)
                : (stats.currentHole || null);
        } catch (e) { cur = stats.currentHole || null; }
        var name = p.name || '—';
        try {
            name = (typeof privacyDisplayName === 'function')
                ? privacyDisplayName(p, pid)
                : playerDisplayName(p, pid);
        } catch (e) { console.warn("[silent]", e); }
        var thru = '';
        try {
            thru = (typeof playerHoleStatusText === 'function')
                ? playerHoleStatusText(r, pid, p, stats, order)
                : '';
        } catch (e) { console.warn("[silent]", e); }
        return { pid: pid, p: p, tee: tee, fhcp: fhcp, scores: scores, stats: stats, current: cur, name: name, thru: thru };
    });

    var html = '<section class="club-sc club-sc-group" data-sc-view="' + esc(view) + '" data-sc-players="' + n + '" aria-label="' + esc(title) + '">';
    html += '<header class="club-sc-head club-sc-group-head"><strong><i class="fas fa-users"></i> ' + esc(title) + '</strong>';
    if (fmtTxt) html += '<span class="gsg-format">' + esc(fmtTxt) + '</span>';
    html += '</header>';
    if (opts.label) html += '<div class="club-sc-caption">' + esc(opts.label) + '</div>';
    html += '<div class="club-sc-group-scroll" tabindex="0" aria-label="' + esc(en ? 'Group scores by holes' : 'Счёт группы по лункам') + '">';
    html += '<table class="gsg-table"><thead><tr>';
    html += '<th class="gsg-hole" scope="col">' + esc(en ? 'Hole · Par' : 'Лунка · Пар') + '</th>';
    infos.forEach(function(inf) {
        var teeName = inf.tee;
        try {
            teeName = t('tee_' + inf.tee);
            if (!teeName || teeName === 'tee_' + inf.tee) teeName = (typeof TEES !== 'undefined' && TEES[inf.tee]) || inf.tee;
        } catch (e) { console.warn("[silent]", e); }
        var band = '';
        try { band = (typeof fieldHcpBandClass === 'function') ? fieldHcpBandClass(inf.fhcp) : ''; } catch (e) { console.warn("[silent]", e); }
        var hcpShort = 'HCP';
        try { hcpShort = t('field_hcp_short'); } catch (e) { console.warn("[silent]", e); }
        var hcpVal = inf.fhcp;
        try { hcpVal = fmtFieldHcp(inf.fhcp); } catch (e) { console.warn("[silent]", e); }
        html += '<th class="gsg-player" scope="col" data-sc-player="' + esc(inf.pid) + '">';
        html += '<div class="gsg-pname">' + esc(inf.name) + '</div>';
        html += '<div class="gsg-pbadges"><span class="tee-pill tee-' + esc(inf.tee) + '">' + esc(teeName) + '</span>' +
            '<span class="hcp-chip ' + esc(band) + '">' + esc(hcpShort) + ' ' + esc(hcpVal) + '</span></div>';
        html += '</th>';
    });
    html += '</tr></thead><tbody>';

    // Порядок игры сохраняем как есть (включая шотган и девятки):
    // строки идут в порядке order, промежуточный итог — после каждых 9 сыгранных.
    var hasChunks = order.length > 9;
    for (var offset = 0; offset < order.length; offset += 9) {
        var holes = order.slice(offset, offset + 9);
        if (hasChunks) {
            html += '<tr class="gsg-chunk"><td class="gsg-hole" colspan="' + (n + 1) + '">' +
                esc((en ? 'Holes ' : 'Лунки ') + holes[0] + '–' + holes[holes.length - 1]) + '</td></tr>';
        }
        holes.forEach(function(h) {
            var par = 4;
            try { par = holePar(h); } catch (e) { console.warn("[silent]", e); }
            var anyCur = infos.some(function(inf) { return inf.current === h; });
            html += '<tr class="gsg-row' + (anyCur ? ' gsg-cur-row' : '') + '" data-sc-hole="' + h + '">';
            html += '<td class="gsg-hole"><span class="gsg-hole-num">#' + h + '</span> <span class="gsg-hole-par">P' + par + '</span></td>';
            infos.forEach(function(inf) {
                var s = parseInt(inf.scores[h], 10) || 0;
                var scoreCls = 'r-empty';
                try { scoreCls = s > 0 ? holeResClass(s, par) : 'r-empty'; } catch (e) { console.warn("[silent]", e); }
                var verify = 'none';
                try { verify = (typeof getHoleVerifyState === 'function') ? getHoleVerifyState(inf.p, h) : 'none'; } catch (e) { console.warn("[silent]", e); }
                var isCur = inf.current === h;
                var tdCls = 'gsg-cell' + (isCur ? ' gsg-cur' : '') + (verify === 'mismatch' ? ' cell-mismatch' : '');
                var strokes = 0, marks = '';
                try { strokes = hcpStrokesOnHole(h, inf.fhcp); marks = hcpStrokesMarksHTML(inf.fhcp, h); } catch (e) { console.warn("[silent]", e); }
                var hcpBadge = '';
                if (marks) hcpBadge = '<span class="club-sc-handicap" role="img" aria-label="' + esc((en ? 'Handicap strokes: ' : 'Удары форы: ') + strokes) + '">' + marks + '</span>';
                var mkHtml = '';
                if (opts.showMarker) {
                    var mk = { score: 0 };
                    try { mk = getPlayerMarkerScoreForHole(inf.p, h); } catch (e) { console.warn("[silent]", e); }
                    if (mk && mk.score >= 1) {
                        var mm = (s >= 1 && s !== mk.score);
                        if (mm && tdCls.indexOf('cell-mismatch') < 0) tdCls += ' cell-mismatch';
                        var mkLbl = 'М';
                        try { mkLbl = t('marker_score_short'); } catch (e) { console.warn("[silent]", e); }
                        mkHtml = '<span class="gsg-marker' + (mm ? ' mk-mismatch' : '') + '">' + esc(mkLbl) + ': ' + mk.score + '</span>';
                    }
                }
                html += '<td class="' + tdCls + '" data-sc-player="' + esc(inf.pid) + '" data-sc-hole="' + h + '"' + (isCur ? ' data-sc-current="1"' : '') + '>' +
                    '<span class="gsg-score ' + scoreCls + '"><span class="gsg-val">' + (s > 0 ? s : '—') + hcpBadge + '</span></span>' + mkHtml + '</td>';
            });
            html += '</tr>';
        });
        if (hasChunks) {
            html += '<tr class="gsg-subtotal"><td class="gsg-hole gsg-sub-lbl">' +
                esc((en ? 'Holes ' : 'Лунки ') + holes[0] + '–' + holes[holes.length - 1]) + '</td>';
            infos.forEach(function(inf) {
                var gross = 0, cnt = 0, pPar = 0;
                holes.forEach(function(h) {
                    var s = parseInt(inf.scores[h], 10) || 0;
                    if (s > 0) {
                        gross += s; cnt++;
                        try { pPar += holePar(h); } catch (e) { console.warn("[silent]", e); }
                    }
                });
                var cell = '—';
                if (cnt > 0) {
                    var d = gross - pPar, dTxt = String(d), dCls = '';
                    try { dTxt = fmtScore(d); dCls = scoreClass(d); } catch (e) { console.warn("[silent]", e); }
                    cell = '<b>' + gross + '</b> <small class="' + dCls + '">' + esc(dTxt) + '</small>';
                }
                html += '<td class="gsg-cell gsg-sub">' + cell + '</td>';
            });
            html += '</tr>';
        }
    }

    var totPar = 0;
    order.forEach(function(h) { try { totPar += holePar(h); } catch (e) { console.warn("[silent]", e); } });
    var totLbl = 'Итого';
    try { totLbl = t('total'); } catch (e) { console.warn("[silent]", e); }
    html += '<tr class="gsg-total"><td class="gsg-hole gsg-total-lbl">' + esc(totLbl) + ' <small>(' + totPar + ')</small></td>';
    infos.forEach(function(inf) {
        var st = inf.stats || {};
        var played = st.holesPlayed || 0;
        var toParT = '—', toParCls = '';
        try { toParT = fmtScore(st.toPar); toParCls = scoreClass(st.toPar); } catch (e) { console.warn("[silent]", e); }
        html += '<td class="gsg-cell gsg-total-cell"><div class="gsg-total-gross">' + (played ? (st.gross || 0) : '—') + '</div>' +
            '<div class="gsg-total-topar ' + toParCls + '">' + esc(toParT) + '</div>' +
            '<div class="gsg-total-played">' + played + '/' + order.length + '</div></td>';
    });
    html += '</tr></tbody></table></div>';
    // Кто где сейчас — живой статус флайта одной строкой.
    var thruBits = infos.map(function(inf) {
        return '<span class="gsg-thru"><b>' + esc(inf.name) + ':</b> ' + esc(inf.thru || '') + '</span>';
    }).join('');
    html += '<footer class="club-sc-total club-sc-group-total">' + thruBits + '</footer>';
    return html + '</section>';
}

function renderSinglePlayerScorecardHTML(r, pe, order, opts) {
    return renderClubScorecard(pe[1], r, Object.assign({}, opts || {}, { playerId: pe[0], order: order }));
}

// ВАРИАНТ 1: СВОДНАЯ МАТРИЦА ФЛАЙТА
function renderGroupMatrixHTML(r, playerEntries, order, opts) {
    var holeCount = order.length;
    var html = '<div class="group-matrix-card">';

    // 1. Шапка со всеми игроками группы в один ряд
    html += '<div class="group-matrix-players">';
    playerEntries.forEach(function(pe, pIdx) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
        var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);
        var pTee = (p && p.tee) || r.tee || 'wh';
        var pTeeBadge = '<span class="tee-pill tee-' + pTee + '" style="font-size:9.5px;padding:1px 6px;">' + t('tee_' + pTee) + '</span>';
        var pHcpBadge = '<span class="hcp-chip ' + fieldHcpBandClass(fieldHcp) + '" style="font-size:9.5px;padding:1px 6px;">' + t('field_hcp_short') + ' ' + fmtFieldHcp(fieldHcp) + '</span>';
        var pName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
        var thruTxt = playerHoleStatusText(r, pid, p, stats, order);

        html += '<div class="gm-player-chip">';
        html += '<div class="gm-p-top"><strong class="gm-p-name"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(pName) + '</strong>' + pTeeBadge + pHcpBadge + '</div>';
        html += '<div class="gm-p-stats">';
        html += '<span>📍 ' + thruTxt + '</span>';
        html += '<span>Gross: <b>' + (stats.gross || 0) + '</b></span>';
        html += '<span class="' + scoreClass(stats.toPar) + '" style="font-weight:800;">' + fmtScore(stats.toPar) + '</span>';
        html += '<span style="color:#2ecc71;font-weight:700;">' + stats.stablefordField + ' pt</span>';
        html += '</div></div>';
    });
    html += '</div>';

    // 2. Сводная матрица по лункам
    html += '<div class="gm-grid-wrap"><div class="noscroll-grid gm-noscroll-grid">';
    order.forEach(function(i) {
        var par = holePar(i);
        var idx = holeHcp(i);
        var isCurHoleAny = false;
        var tilesForHole = '';

        playerEntries.forEach(function(pe, pIdx) {
            var pid = pe[0], p = pe[1];
            var sc = p.scores || {};
            var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
            var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);
            var s = parseInt(sc[i]) || 0;
            var isCur = playerCurrentHole(r, pid, p, stats, order) === i;
            if (isCur) isCurHoleAny = true;

            var cls = (s > 0 ? holeResClass(s, par) : 'r-empty') + (isCur ? ' sc-cur-tile' : '');
            if (getHoleVerifyState(p, i) === 'mismatch') cls += ' cell-mismatch';
            var stbl = s > 0 ? stablefordField(s, i, fieldHcp) : null;
            var pInitial = (p.name || '').trim().split(/\s+/)[0] || ('P' + (pIdx + 1));

            // Слой маркера (только страница ввода результатов): под счётом
            // игрока — счёт, который ввёл его маркер. При расхождении —
            // красная обводка ячейки.
            var mkRowHtml = '';
            var mkCellCls = '';
            if (opts.showMarker) {
                var mk = getPlayerMarkerScoreForHole(p, i);
                if (mk.score >= 1) {
                    var mkMm = (s >= 1 && s !== mk.score);
                    if (mkMm) mkCellCls = ' gm-mismatch';
                    mkRowHtml = '<div class="gm-tile-marker' + (mkMm ? ' mk-mismatch' : '') + '">' +
                        '<span class="gm-tile-mname">' + t('marker_score_short') + '</span>' +
                        '<span class="gm-tile-mscore">' + mk.score + '</span>' +
                        '</div>';
                }
            }

            tilesForHole += '<div class="gm-tile-cell' + mkCellCls + '" title="' + escapeHtml(p.name || '') + ' · #' + i + ': ' + (s > 0 ? s : '—') + '">' +
                '<div class="gm-tile-row ' + cls + '">' +
                '<span class="gm-tile-pname">' + escapeHtml(pInitial.substring(0, 5)) + '</span>' +
                '<span class="gm-tile-score">' + (s > 0 ? s : '—') + '</span>' +
                '<span class="gm-tile-stbl">' + (stbl !== null ? stbl + 'p' : '·') + '</span>' +
                '</div>' + mkRowHtml +
                '</div>';
        });

        html += '<div class="gm-hole-col' + (isCurHoleAny ? ' gm-cur-col' : '') + '">' +
            '<div class="gm-hole-hdr"><span>#' + i + '</span><small>P' + par + ' · i' + idx + '</small></div>' +
            '<div class="gm-hole-scores">' + tilesForHole + '</div>' +
            '</div>';
    });
    html += '</div></div>';

    // 3. Итоги флайта
    html += '<div class="gm-totals-row">';
    html += '<div class="gm-tot-title"><i class="fas fa-calculator"></i> ' + t('total') + ':</div>';
    html += '<div class="gm-tot-items">';
    playerEntries.forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
        var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);
        var pName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
        var pInitial = pName.split(/\s+/)[0] || pName;

        html += '<div class="gm-tot-item">' +
            '<span class="gm-tot-name">' + escapeHtml(pInitial) + ':</span>' +
            '<b class="gm-tot-val">' + (stats.gross || 0) + '</b>' +
            '<span class="gm-tot-topar ' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</span>' +
            '<span class="gm-tot-stbl">' + stats.stablefordField + ' pt</span>' +
            '</div>';
    });
    html += '</div></div>';

    html += '</div>';
    return html;
}

// ВАРИАНТ 2: СРАВНИТЕЛЬНАЯ ТАБЛИЦА ФЛАЙТА
// Строка счёта маркера под счётом игрока (только страница ввода результатов).
function buildFlightTableMarkerCellHTML(p, h, ownScore) {
    var mk = getPlayerMarkerScoreForHole(p, h);
    if (mk.score < 1) return '';
    var mm = (ownScore >= 1 && ownScore !== mk.score) ? ' mk-mismatch' : '';
    return '<div class="ft-marker' + mm + '">' + t('marker_score_short') + ': ' + mk.score + '</div>';
}

function renderGroupTableHTML(r, playerEntries, order, opts) {
    var html = '<div class="group-flight-table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;margin-bottom:10px;">';
    html += '<table class="group-flight-table" style="width:100%;min-width:320px;border-collapse:collapse;font-size:12px;text-align:center;">';

    // thead: Player headers
    html += '<thead><tr style="background:rgba(201,168,76,0.14);border-bottom:1px solid var(--border);">';
    html += '<th style="padding:8px 6px;text-align:left;white-space:nowrap;min-width:85px;color:var(--gold);">' + (currentLang === 'en' ? 'Hole · Par' : 'Лунка · Пар') + '</th>';
    playerEntries.forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var pTee = (p && p.tee) || r.tee || 'wh';
        var pTeeBadge = '<span class="tee-pill tee-' + pTee + '" style="font-size:9px;padding:0 5px;">' + t('tee_' + pTee) + '</span>';
        var pName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
        var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);

        html += '<th style="padding:8px 6px;min-width:95px;border-left:1px solid rgba(255,255,255,0.06);">';
        html += '<div style="font-weight:700;color:var(--white);">' + escapeHtml(pName) + '</div>';
        html += '<div style="margin-top:2px;">' + pTeeBadge + ' <span class="hcp-chip" style="font-size:9.5px;padding:0 5px;">' + fmtFieldHcp(fieldHcp) + '</span></div>';
        html += '<div style="font-size:11px;margin-top:2px;color:var(--gold);">Gross: <b>' + (stats.gross || 0) + '</b> <span class="' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</span></div>';
        html += '</th>';
    });
    html += '</tr></thead>';

    // tbody
    html += '<tbody>';
    var frontHoles = order.filter(function(h) { return h <= 9; });
    var backHoles = order.filter(function(h) { return h > 9; });

    // Front 9
    frontHoles.forEach(function(h) {
        var par = holePar(h);
        var idx = holeHcp(h);
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">';
        html += '<td style="padding:6px 6px;text-align:left;font-weight:600;color:var(--gold);">#' + h + ' <span style="color:var(--muted);font-weight:400;font-size:11px;">(P' + par + ' · i' + idx + ')</span></td>';
        playerEntries.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var s = parseInt(p.scores && p.scores[h]) || 0;
            var cls = s > 0 ? holeResClass(s, par) : 'r-empty';
            var stbl = s > 0 ? stablefordField(s, h, p.fieldHcp || 0) : null;
            html += '<td style="padding:4px 6px;border-left:1px solid rgba(255,255,255,0.04);">';
            html += '<span class="ft-score-cell ' + cls + '" style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;min-width:24px;">' + (s > 0 ? s : '—') + '</span>';
            if (stbl !== null) html += ' <small style="color:#2ecc71;font-size:10px;font-weight:600;">' + stbl + 'p</small>';
            if (opts.showMarker) html += buildFlightTableMarkerCellHTML(p, h, s);
            html += '</td>';
        });
        html += '</tr>';
    });

    // OUT Subtotal
    if (frontHoles.length > 0) {
        var outPar = frontHoles.reduce(function(acc, h) { return acc + holePar(h); }, 0);
        html += '<tr style="background:rgba(255,255,255,0.06);font-weight:700;border-bottom:1px solid var(--border);">';
        html += '<td style="padding:6px 6px;text-align:left;color:var(--white);">OUT (1-9) <small style="color:var(--muted);">(' + outPar + ')</small></td>';
        playerEntries.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var outGross = frontHoles.reduce(function(acc, h) { return acc + (parseInt(p.scores && p.scores[h]) || 0); }, 0);
            var outStbl = frontHoles.reduce(function(acc, h) {
                var s = parseInt(p.scores && p.scores[h]) || 0;
                return acc + (s > 0 ? stablefordField(s, h, p.fieldHcp || 0) : 0);
            }, 0);
            html += '<td style="padding:6px 6px;color:var(--gold);border-left:1px solid rgba(255,255,255,0.06);">' + (outGross > 0 ? outGross : '—') + ' <small style="color:#2ecc71;">(' + outStbl + ' pt)</small></td>';
        });
        html += '</tr>';
    }

    // Back 9
    backHoles.forEach(function(h) {
        var par = holePar(h);
        var idx = holeHcp(h);
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">';
        html += '<td style="padding:6px 6px;text-align:left;font-weight:600;color:var(--gold);">#' + h + ' <span style="color:var(--muted);font-weight:400;font-size:11px;">(P' + par + ' · i' + idx + ')</span></td>';
        playerEntries.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var s = parseInt(p.scores && p.scores[h]) || 0;
            var cls = s > 0 ? holeResClass(s, par) : 'r-empty';
            var stbl = s > 0 ? stablefordField(s, h, p.fieldHcp || 0) : null;
            html += '<td style="padding:4px 6px;border-left:1px solid rgba(255,255,255,0.04);">';
            html += '<span class="ft-score-cell ' + cls + '" style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;min-width:24px;">' + (s > 0 ? s : '—') + '</span>';
            if (stbl !== null) html += ' <small style="color:#2ecc71;font-size:10px;font-weight:600;">' + stbl + 'p</small>';
            if (opts.showMarker) html += buildFlightTableMarkerCellHTML(p, h, s);
            html += '</td>';
        });
        html += '</tr>';
    });

    // IN Subtotal
    if (backHoles.length > 0) {
        var inPar = backHoles.reduce(function(acc, h) { return acc + holePar(h); }, 0);
        html += '<tr style="background:rgba(255,255,255,0.06);font-weight:700;border-bottom:1px solid var(--border);">';
        html += '<td style="padding:6px 6px;text-align:left;color:var(--white);">IN (10-18) <small style="color:var(--muted);">(' + inPar + ')</small></td>';
        playerEntries.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var inGross = backHoles.reduce(function(acc, h) { return acc + (parseInt(p.scores && p.scores[h]) || 0); }, 0);
            var inStbl = backHoles.reduce(function(acc, h) {
                var s = parseInt(p.scores && p.scores[h]) || 0;
                return acc + (s > 0 ? stablefordField(s, h, p.fieldHcp || 0) : 0);
            }, 0);
            html += '<td style="padding:6px 6px;color:var(--gold);border-left:1px solid rgba(255,255,255,0.06);">' + (inGross > 0 ? inGross : '—') + ' <small style="color:#2ecc71;">(' + inStbl + ' pt)</small></td>';
        });
        html += '</tr>';
    }

    // TOTAL Row
    var totPar = order.reduce(function(acc, h) { return acc + holePar(h); }, 0);
    html += '<tr style="background:rgba(201,168,76,0.18);font-weight:800;border-top:2px solid var(--gold);">';
    html += '<td style="padding:8px 6px;text-align:left;color:var(--gold);font-size:13px;">' + t('total') + ' <small style="color:var(--white);">(' + totPar + ')</small></td>';
    playerEntries.forEach(function(pe) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
        var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);
        html += '<td style="padding:8px 6px;border-left:1px solid rgba(255,255,255,0.08);">';
        html += '<div style="font-size:15px;color:var(--white);">' + (stats.gross || 0) + ' <span class="' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</span></div>';
        html += '<div style="color:#2ecc71;font-size:11px;font-weight:700;">' + stats.stablefordField + ' pt Stbl</div>';
        html += '</td>';
    });
    html += '</tr>';

    html += '</tbody></table></div>';
    return html;
}

// ВАРИАНТ 3: ЛИДЕРБОРД ФЛАЙТА И ВИЗУАЛЬНЫЙ ТРЕК
function renderGroupLeaderboardHTML(r, playerEntries, order, opts) {
    var holeCount = order.length;
    var html = '<div class="flight-leaderboard-card">';

    // Сортировка участников флайта по результату toPar, затем по gross
    var ranked = playerEntries.slice().sort(function(a, b) {
        var statsA = calcRoundStats(a[1].scores || {}, a[1].fieldHcp || 0, a[1].exactHcp || 0, order);
        var statsB = calcRoundStats(b[1].scores || {}, b[1].fieldHcp || 0, b[1].exactHcp || 0, order);
        if (statsA.toPar === null && statsB.toPar === null) return 0;
        if (statsA.toPar === null) return 1;
        if (statsB.toPar === null) return -1;
        if (statsA.toPar !== statsB.toPar) return statsA.toPar - statsB.toPar;
        return (statsA.gross || 0) - (statsB.gross || 0);
    });

    var rankMedals = ['🥇', '🥈', '🥉'];

    ranked.forEach(function(pe, rankIdx) {
        var pid = pe[0], p = pe[1];
        var sc = p.scores || {};
        var fieldHcp = p.fieldHcp !== undefined ? p.fieldHcp : (r.fieldHcp || 0);
        var stats = calcRoundStats(sc, fieldHcp, p.exactHcp || 0, order);
        var pTee = (p && p.tee) || r.tee || 'wh';
        var pTeeBadge = '<span class="tee-pill tee-' + pTee + '" style="font-size:9.5px;padding:1px 6px;">' + t('tee_' + pTee) + '</span>';
        var pHcpBadge = '<span class="hcp-chip ' + fieldHcpBandClass(fieldHcp) + '" style="font-size:9.5px;padding:1px 6px;">' + t('field_hcp_short') + ' ' + fmtFieldHcp(fieldHcp) + '</span>';
        var pName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(p, pid) : playerDisplayName(p, pid);
        var rankLabel = rankIdx < 3 ? rankMedals[rankIdx] : ('#' + (rankIdx + 1));
        var thruTxt = playerHoleStatusText(r, pid, p, stats, order, { withProgress: true });

        html += '<div class="flb-player-card" style="background:rgba(19,34,24,0.85);border:1px solid var(--border);border-radius:var(--rs);padding:12px;margin-bottom:8px;">';

        // Top Row: Rank, Player Name, Badges, To Par, Gross, Stbl
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">';
        html += '<div style="display:flex;align-items:center;gap:8px;min-width:0;">';
        html += '<span class="flb-rank" style="font-size:16px;font-weight:800;color:var(--gold);min-width:26px;text-align:center;">' + rankLabel + '</span>';
        html += '<div><span style="font-weight:700;color:var(--white);font-size:14px;">' + escapeHtml(pName) + '</span> ' + pTeeBadge + pHcpBadge;
        html += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">📍 ' + thruTxt + '</div></div>';
        html += '</div>';

        html += '<div style="text-align:right;">';
        html += '<div style="font-size:18px;font-weight:800;" class="' + scoreClass(stats.toPar) + '">' + fmtScore(stats.toPar) + '</div>';
        html += '<div style="font-size:11px;color:var(--muted);">Gross: <b>' + (stats.gross || 0) + '</b> · <span style="color:#2ecc71;font-weight:700;">' + stats.stablefordField + ' pt</span></div>';
        html += '</div>';
        html += '</div>';

        // Bottom Row: Hole-by-Hole Mini Visual Strip
        html += '<div class="flb-hole-strip" style="display:flex;gap:3px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:4px 0;">';
        order.forEach(function(h) {
            var s = parseInt(sc[h]) || 0;
            var par = holePar(h);
            var cls = s > 0 ? holeResClass(s, par) : 'r-empty';
            var isCur = playerCurrentHole(r, pid, p, stats, order) === h;
            var stbl = s > 0 ? stablefordField(s, h, fieldHcp) : null;
            var tip = '#' + h + ' (P' + par + '): ' + (s > 0 ? (s + (stbl !== null ? ' · ' + stbl + 'p' : '')) : '—');
            var mmCls = '';
            if (opts.showMarker) {
                var mkOwn = getPlayerMarkerScoreForHole(p, h);
                if (mkOwn.score >= 1) {
                    tip += ' · ' + t('marker_score_short') + ': ' + mkOwn.score;
                    if (s >= 1 && s !== mkOwn.score) mmCls = ' flb-mm';
                }
            }

            html += '<div class="flb-mini-tile ' + cls + (isCur ? ' flb-cur' : '') + mmCls + '" title="' + tip + '" style="flex:1;min-width:18px;height:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:3px;font-size:9.5px;font-weight:700;">' +
                '<span style="font-size:7.5px;opacity:0.75;line-height:1;">' + h + '</span>' +
                '<span style="font-size:10px;line-height:1;font-weight:800;">' + (s > 0 ? s : '·') + '</span>' +
                '</div>';
        });
        html += '</div>';

        // Вторая полоса — счёта маркера этого игрока (только страница ввода).
        if (opts.showMarker && playerHasAnyMarkerScore(p, order)) {
            html += '<div class="flb-marker-cap"><i class="fas fa-pen-nib"></i> ' + t('marker_score_short') + ' — ' + t('legend_marker_score') + '</div>';
            html += '<div class="flb-hole-strip flb-marker-strip" style="display:flex;gap:3px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:2px 0 4px;">';
            order.forEach(function(h) {
                var mk = getPlayerMarkerScoreForHole(p, h);
                var ownS = parseInt(sc[h]) || 0;
                var mm = (mk.score >= 1 && ownS >= 1 && ownS !== mk.score) ? ' flb-mm' : '';
                var tipM = '#' + h + ': ' + t('marker_score_short') + ' ' + (mk.score >= 1 ? mk.score : '—');
                html += '<div class="flb-mini-tile flb-marker-tile' + mm + '" title="' + tipM + '" style="flex:1;min-width:18px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:3px;font-size:10px;font-weight:800;">' +
                    (mk.score >= 1 ? mk.score : '·') +
                    '</div>';
            });
            html += '</div>';
        }

        html += '</div>';
    });

    html += '</div>';
    return html;
}

// ==========================================
// ГАНДИКАП: ЗЕЛЁНАЯ ГАЛОЧКА СИНХРОНИЗАЦИИ + ДАТА ОБНОВЛЕНИЯ
// Гандикап считается «синхронизированным», если он установлен и у записи
// есть hcpUpdatedAt — он проставляется при синхронизации с базой АГР
// (RUSGOLF), импорте Excel и ручном изменении в админ-панели.
// ==========================================
function getHcpSyncInfo(u) {
    u = u || {};
    if (u.handicap === null || u.handicap === undefined || !u.hcpUpdatedAt) {
        return { ok: false };
    }
    return {
        ok: true,
        ts: Number(u.hcpUpdatedAt),
        dateStr: fmtDate(u.hcpUpdatedAt),
        source: u.hcpSource || '',
        sourceLabel: hcpSourceLabel(u.hcpSource)
    };
}

function hcpSourceLabel(src) {
    var isEn = currentLang === 'en';
    if (src === 'rusgolf') return isEn ? 'RUSGOLF (AGR database)' : 'База АГР России (RUSGOLF)';
    if (src === 'excel') return isEn ? 'Excel import' : 'Импорт Excel';
    if (src === 'manual') return isEn ? 'Manual update' : 'Ручное обновление';
    return isEn ? 'Handicap sync' : 'Синхронизация гандикапа';
}

function hcpSyncTooltip(info) {
    var isEn = currentLang === 'en';
    return (isEn ? 'Handicap updated: ' : 'Гандикап обновлён: ') + info.dateStr +
        ' · ' + (isEn ? 'Source: ' : 'Источник: ') + info.sourceLabel;
}

// Короткая дата «09.09.26» для компактных бейджей.
function fmtHcpShortDate(ts) {
    var d = new Date(Number(ts));
    if (!d.getTime()) return '';
    var mo = d.getMonth() + 1, da = d.getDate();
    return (da < 10 ? '0' : '') + da + '.' + (mo < 10 ? '0' : '') + mo + '.' + String(d.getFullYear()).slice(2);
}

// Выбранный вариант оформления бейджа: 1/2/3.
// ГЛОБАЛЬНЫЙ выбор делается в админ-панели (вкладка «Данные» → «Стиль
// галочки гандикапа») и хранится в Firebase settings/hcp_badge_variant —
// он применяется на всех устройствах игроков. Кэшируем в localStorage
// для офлайн-режима; hcp-badge-preview.html использует тот же ключ
// для локального предпросмотра.
var pestovoHcpBadgeVariant = (function() {
    try {
        var v = localStorage.getItem('pestovo_hcp_badge_variant');
        if (v === '1' || v === '2' || v === '3') return v;
    } catch (e) { console.warn("[silent]", e); }
    return '1';
})();

function getHcpBadgeVariant() {
    return pestovoHcpBadgeVariant;
}

// Локальный выбор (страница предпросмотра) — обновляет только состояние
// этого браузера, не трогая глобальную настройку в Firebase.
function setHcpBadgeVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    pestovoHcpBadgeVariant = v;
    try { localStorage.setItem('pestovo_hcp_badge_variant', v); } catch (e) { console.warn("[silent]", e); }
}

// Применяет глобальный вариант (из админ-панели или Firebase) и
// перерисовывает открытые списки/элементы.
function applyHcpBadgeVariant(v) {
    if (v !== '1' && v !== '2' && v !== '3') return;
    pestovoHcpBadgeVariant = v;
    try { localStorage.setItem('pestovo_hcp_badge_variant', v); } catch (e) { console.warn("[silent]", e); }
    refreshHcpBadgeVariantUI();
}

function refreshHcpBadgeVariantUI() {
    // Вкладка «Игроки» (players.html)
    try {
        if (typeof loadPlayers === 'function' && document.getElementById('players-grid')) loadPlayers();
    } catch (e) { console.warn("[silent]", e); }
    // Админ-панель: список «Игроки и роли» (только при открытой панели)
    try {
        if (typeof hasAdminPanelAccess === 'function' && hasAdminPanelAccess() &&
            typeof loadAdmPlayers === 'function' &&
            document.getElementById('admin-content') &&
            !document.getElementById('admin-content').classList.contains('hidden')) {
            loadAdmPlayers();
        }
    } catch (e) { console.warn("[silent]", e); }
    // Подсветка выбранного варианта в админ-панели
    try {
        if (typeof markAdmHcpVariantButtons === 'function') markAdmHcpVariantButtons();
    } catch (e) { console.warn("[silent]", e); }
    // Страница предпросмотра вариантов (если открыта)
    try {
        if (typeof window !== 'undefined' && typeof window.hcpBadgePreviewRerender === 'function') window.hcpBadgePreviewRerender();
    } catch (e) { console.warn("[silent]", e); }
}

// Зелёная галочка на углу аватара (вариант 3): оборачивает разметку аватара.
function hcpAvatarWrapHtml(avatarHtml, info) {
    if (!info || !info.ok) return avatarHtml;
    return '<span class="hcp-avatar-wrap">' + avatarHtml +
        '<span class="hcp-avatar-badge" title="' + escapeHtml(hcpSyncTooltip(info)) + '"><i class="fas fa-check"></i></span></span>';
}

// Фрагмент для карточки игрока (вкладка «Игроки» и админка): вставляется
// сразу после значения HCP. Возвращает '' у игроков без синхронизации.
function hcpSyncBadgeHtml(u) {
    var info = getHcpSyncInfo(u);
    if (!info.ok) return '';
    var v = getHcpBadgeVariant();
    var isEn = currentLang === 'en';
    var short = fmtHcpShortDate(info.ts);
    var tip = escapeHtml(hcpSyncTooltip(info));
    if (v === '2') {
        // Вариант 2: светящийся зелёный «пилюля»-бейдж
        return '<span class="hcp-sync-pill" title="' + tip + '"><i class="fas fa-circle-check"></i> ' +
            (isEn ? 'updated ' : 'обновлён ') + short + '</span>';
    }
    if (v === '3') {
        // Вариант 3: текст даты (галочка уже на аватаре)
        return ' <span class="hcp-date" title="' + tip + '">' + (isEn ? 'updated ' : 'обновлён ') + short + '</span>';
    }
    // Вариант 1: компактная галочка + дата рядом с HCP
    return ' <i class="fas fa-circle-check hcp-check" title="' + tip + '"></i> <span class="hcp-date" title="' + tip + '">' + short + '</span>';
}

// Разметка статуса гандикапа для личного профиля игрока.
// Возвращает { meta: ..., banner: ... }:
//   meta — замена строки «HCP: …» в шапке профиля (null = обычный вид)
//   banner — отдельный зелёный баннер (используется только вариантом 2)
function buildHcpProfileSyncHtml(u) {
    var info = getHcpSyncInfo(u);
    if (!info.ok) return { meta: null, banner: '' };
    var v = getHcpBadgeVariant();
    var isEn = currentLang === 'en';
    var hcpVal = fmtExactHcp(u.handicap);
    var tip = escapeHtml(hcpSyncTooltip(info));

    if (v === '2') {
        return {
            meta: null,
            banner: '<div class="hcp-sync-banner">' +
                '<span class="hsb-icon"><i class="fas fa-circle-check"></i></span>' +
                '<span style="flex:1;min-width:180px;">' +
                '<span style="display:block;font-size:14px;font-weight:800;color:#2ecc71;">' +
                (isEn ? 'Handicap synced & up to date' : 'Гандикап синхронизирован') + '</span>' +
                '<span style="display:block;font-size:12px;color:var(--muted);margin-top:3px;line-height:1.5;">' +
                '<i class="fas fa-golf-ball"></i> HCP: ' + hcpVal + ' · ' +
                '<i class="fas fa-calendar-check"></i> ' + (isEn ? 'Updated ' : 'Обновлено ') + info.dateStr +
                ' · ' + (isEn ? 'Source: ' : 'Источник: ') + info.sourceLabel + '</span></span>' +
                '</div>'
        };
    }

    // Варианты 1 и 3 — зелёная строка HCP с галочкой, датой и источником
    return {
        meta: '<span class="hcp-profile-sync" title="' + tip + '">' +
            '<i class="fas fa-circle-check"></i> <i class="fas fa-golf-ball"></i> HCP: ' + hcpVal +
            ' · ' + (isEn ? 'updated ' : 'обновлён ') + info.dateStr +
            ' <span class="hcp-source">(' + info.sourceLabel + ')</span></span>',
        banner: ''
    };
}

// ==========================================
// УНИВЕРСАЛЬНОЕ МОДАЛЬНОЕ ОКНО ПРОФИЛЯ И СЧЁТНОЙ КАРТОЧКИ
// ==========================================
function openPlayerProfileModal(playerId, roundId) {
    var modalEl = document.getElementById('pmodal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'pmodal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closePModal()"></div>' +
            '<div class="modal-body">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closePModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closePModal()">&times;</button>' +
            '</div>' +
            '<div id="pmodal-body"><div class="loading"><div class="spinner"></div></div></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('pmodal-body');
    if (bodyEl) bodyEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modalEl.classList.remove('hidden');

    if (typeof db === 'undefined') return;

    var userPromise = db.ref('usersPublic/' + playerId).once('value').then(function(sn) { return sn.val(); }).catch(function() { return null; });
    var roundPromise = roundId ? db.ref('rounds/' + roundId).once('value').then(function(sn) { return sn.val(); }).catch(function() { return null; }) : Promise.resolve(null);

    Promise.all([userPromise, roundPromise]).then(function(res) {
        var u = res[0];
        var rd = res[1];

        if (!u && rd && rd.players && rd.players[playerId]) {
            var p = rd.players[playerId];
            var displayName = playerDisplayName(p, playerId);
            u = {
                name: displayName !== '—' ? displayName : t('guest'),
                // Для турнира в раунде может стоять обрезанный HCP — в карточке
                // профиля показываем настоящий (exactHcpRaw), если он записан.
                handicap: (p.exactHcpRaw != null && p.exactHcpRaw !== '') ? p.exactHcpRaw : (p.exactHcp || null),
                gender: p.gender || 'men',
                isGuest: true,
                roundsPlayed: 1
            };
        }

        if (!u) {
            if (bodyEl) bodyEl.innerHTML = '<p style="color:var(--muted);text-align:center;padding:30px;">' + (currentLang === 'en' ? 'Player profile not found' : 'Профиль игрока не найден') + '</p>';
            return;
        }

        var isMe = (currentUser && currentUser.uid === playerId);
        var gIcon = u.gender === 'women' ? '👩' : '👨';
        // Бейдж «Гость» убран везде по требованию клуба — гости никак не помечаются.
        var guestBadge = '';

        var roundsWord = currentLang === 'en' ? 'rounds' : 'раундов';
        var teePillMarkup = u.defaultTee ? fmtTeePill(u.defaultTee) : '';

        // Статус синхронизации гандикапа: зелёная галочка + дата обновления
        var hcpSync = (typeof buildHcpProfileSyncHtml === 'function') ? buildHcpProfileSyncHtml(u) : { meta: null, banner: '' };
        var plainHcpSpan = '<span><i class="fas fa-golf-ball"></i> HCP: ' + (u.handicap != null ? fmtExactHcp(u.handicap) : '—') + '</span>';

        var html = '<div class="profile-head" style="margin-bottom:16px;">';
        var profileAvatarHtml = fmtUserAvatar(u, 80);
        if (hcpSync.meta !== null && getHcpBadgeVariant() === '3') {
            // Вариант 3: зелёная галочка-«верификация» на углу аватара
            var hcpInfo3 = getHcpSyncInfo(u);
            profileAvatarHtml = hcpAvatarWrapHtml(profileAvatarHtml, hcpInfo3);
        }
        html += profileAvatarHtml;
        html += '<div style="flex:1;"><div class="profile-name">' + gIcon + ' ' + escapeHtml(privacyDisplayName(u, playerId)) + guestBadge + '</div>';
        html += '<div class="profile-meta">';
        html += hcpSync.meta !== null ? hcpSync.meta : plainHcpSpan;
        if (teePillMarkup) html += '<span><i class="fas fa-golf-ball-tee"></i> Tee: ' + teePillMarkup + '</span>';
        html += '<span><i class="fas fa-flag"></i> ' + (u.roundsPlayed || 0) + ' ' + roundsWord + '</span>';
        var hTag = currentLang === 'en' ? 'h' : 'л';
        if (u.bestGross) html += '<span><i class="fas fa-trophy"></i> Gross (18' + hTag + '): ' + u.bestGross + '</span>';
        html += '</div>';
        if (hcpSync.banner) html += hcpSync.banner;

        if (isMe) {
            html += '<button class="btn btn-og btn-sm" style="margin-top:10px;" onclick="renderProfileEditForm(\'' + playerId + '\')"><i class="fas fa-user-pen"></i> ' + t('edit_profile') + '</button>';
        }

        html += '</div></div>';

        if (rd && rd.players && rd.players[playerId]) {
            var roundPlayer = rd.players[playerId];
            var roundPlayerTee = (roundPlayer && roundPlayer.tee) || (rd && rd.tee) || 'wh';
            html += '<div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);">';
            html += '<h3 style="color:var(--gold);margin-bottom:14px;font-family:var(--ff);font-size:18px;">' +
                    '<i class="fas fa-table"></i> ' + (currentLang === 'en' ? 'Round Scorecard' : 'Счётная карточка раунда') + ' (' + pestovoRoundFormatBadge(rd, 'Stroke') + ' · ' + t('tee_select') + ': ' + fmtTeePill(roundPlayerTee) + ')' +
                    '</h3>';
            
            if (typeof generatePestovoScorecardHTML === 'function') {
                html += generatePestovoScorecardHTML(roundPlayer, rd, { compact: true });
            }
            html += '</div>';
        }

        db.ref('users/' + playerId + '/history').once('value').then(function(hSn) {
            var history = hSn.val() || {};
            // Дубли раундов (один roundId несколько раз — следствие старого
            // группового финиша) схлопываем в один раунд ещё при чтении.
            var allRounds = pestovoPickHistoryUnique(Object.entries(history));
            allRounds.sort(function(a, b) { return (b.date || 0) - (a.date || 0); });

            if (allRounds.length > 0) {
                html += renderTrophyCabinet(u, allRounds);
                html += renderScoringDistributionBar(allRounds);

                html += '<h3 style="color:var(--gold);margin:24px 0 12px;font-family:var(--ff);font-size:18px;"><i class="fas fa-history"></i> ' + t('round_history') + ' (' + allRounds.length + ')</h3>';
                // Вкладки «Клубные раунды» / «Турнирные раунды» и фильтры
                // рисуются отдельным рендером (pestovoInitProfileHistory).
                html += '<div id="pr-history-root" data-player-id="' + escapeHtml(playerId) + '"></div>';
            }

            if (bodyEl) bodyEl.innerHTML = html;
            if (allRounds.length > 0) {
                pestovoInitProfileHistory(playerId, u, allRounds);
            }
            // На всякий случай чистим дубли этого игрока прямо в базе
            // (идемпотентно, без блокировки отрисовки).
            try { pestovoDedupeUserHistory(playerId); } catch (e) { console.warn("[silent]", e); }
        }).catch(function() {
            if (bodyEl) bodyEl.innerHTML = html;
        });
    });
}

// ==========================================
// ПРОФИЛЬ ИГРОКА: ВКЛАДКИ И ФИЛЬТРЫ ИСТОРИИ
// ==========================================
// Турнирные раунды вынесены в отдельную вкладку и НЕ дублируются в общем
// списке. Все карточки по умолчанию свёрнуты.
var __pestovoProfileHistory = {};
var __pestovoProfileCardSeq = 0;

function pestovoProfileIsTournamentRound(r) {
    if (!r) return false;
    if (r.tournamentId || r.tournamentName || r.protocolId) return true;
    // На случай иных турнирных форматов — общий признак турнирного раунда.
    if (typeof isTournamentRound === 'function') { try { return !!isTournamentRound(r); } catch (e) { console.warn("[silent]", e); } }
    return false;
}

function pestovoInitProfileHistory(playerId, u, rounds) {
    __pestovoProfileHistory[playerId] = {
        rounds: rounds || [],
        u: u,
        tab: 'club',
        sort: 'date_desc',
        onlyFull: false
    };
    __pestovoProfileCardSeq = 0;
    var root = document.getElementById('pr-history-root');
    if (root) pestovoRenderProfileHistory(playerId);
}

function pestovoProfileHistorySetTab(playerId, tab) {
    var st = __pestovoProfileHistory[playerId];
    if (!st || st.tab === tab) return;
    st.tab = tab;
    pestovoRenderProfileHistory(playerId);
}

function pestovoProfileHistorySetSort(playerId, sort) {
    var st = __pestovoProfileHistory[playerId];
    if (!st) return;
    st.sort = sort;
    pestovoRenderProfileHistory(playerId);
}

function pestovoProfileHistoryToggleFull(playerId) {
    var st = __pestovoProfileHistory[playerId];
    if (!st) return;
    st.onlyFull = !st.onlyFull;
    pestovoRenderProfileHistory(playerId);
}

function pestovoSortHistoryItems(items, sort) {
    items.sort(function(a, b) {
        if (sort === 'date_asc') return (a.date || 0) - (b.date || 0) || String(a._key).localeCompare(String(b._key));
        if (sort === 'gross_best') {
            var ga = a.gross || 0, gb = b.gross || 0;
            if (ga !== gb) return ga - gb;
            return (b.date || 0) - (a.date || 0);
        }
        if (sort === 'stableford_best') {
            var sa = a.stablefordField || 0, sb = b.stablefordField || 0;
            if (sb !== sa) return sb - sa;
            return (b.date || 0) - (a.date || 0);
        }
        if (sort === 'birdies') {
            var ba = a.birdies || 0, bb = b.birdies || 0;
            if (bb !== ba) return bb - ba;
            return (b.date || 0) - (a.date || 0);
        }
        // date_desc по умолчанию
        return (b.date || 0) - (a.date || 0) || String(b._key).localeCompare(String(a._key));
    });
}

function pestovoProfileHistoryToolbarHtml(playerId) {
    var st = __pestovoProfileHistory[playerId];
    if (!st) return '';
    var en = currentLang === 'en';
    var rounds = st.rounds;
    var clubCount = rounds.filter(function(r) { return !pestovoProfileIsTournamentRound(r); }).length;
    var tnCount = rounds.length - clubCount;

    var sortOptions = [
        { v: 'date_desc', l: en ? 'Newest first (by date)' : 'Сначала новые (по дате)' },
        { v: 'date_asc', l: en ? 'Oldest first (by date)' : 'Сначала старые (по дате)' },
        { v: 'gross_best', l: en ? 'Best Gross score' : 'Лучший счёт Gross' },
        { v: 'stableford_best', l: en ? 'Best Stableford' : 'Лучший Stableford' },
        { v: 'birdies', l: en ? 'Most birdies' : 'Больше всего бёрди' }
    ];
    var optionsHtml = sortOptions.map(function(o) {
        return '<option value="' + o.v + '"' + (st.sort === o.v ? ' selected' : '') + '>' + o.l + '</option>';
    }).join('');

    var h = '';
    h += '<div class="tn-tabs" role="tablist" style="margin:2px 0 10px;">';
    h += '<button type="button" class="tn-tab' + (st.tab === 'club' ? ' active' : '') + '" onclick="pestovoProfileHistorySetTab(\'' + playerId + '\',\'club\')">' +
         '<i class="fas fa-golf-ball-tee"></i> ' + (en ? 'Club rounds' : 'Клубные раунды') +
         ' <span class="tn-tab-count">' + clubCount + '</span></button>';
    h += '<button type="button" class="tn-tab' + (st.tab === 'tn' ? ' active' : '') + '" onclick="pestovoProfileHistorySetTab(\'' + playerId + '\',\'tn\')">' +
         '<i class="fas fa-trophy"></i> ' + (en ? 'Tournament rounds' : 'Турнирные раунды') +
         ' <span class="tn-tab-count">' + tnCount + '</span></button>';
    h += '</div>';

    h += '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;">';
    h += '<div class="form-group" style="flex:1;min-width:180px;margin:0;">';
    h += '<label style="font-size:11px;margin-bottom:4px;">' + (en ? 'Sort / filter rounds' : 'Сортировка и фильтр раундов') + '</label>';
    h += '<select class="form-input" style="padding:8px 10px;font-size:12.5px;" onchange="pestovoProfileHistorySetSort(\'' + playerId + '\',this.value)">' + optionsHtml + '</select>';
    h += '</div>';
    h += '<button type="button" class="tn-tab' + (st.onlyFull ? ' active' : '') + '" style="padding:8px 12px;" onclick="pestovoProfileHistoryToggleFull(\'' + playerId + '\')">' +
         '<i class="fas fa-list-ol"></i> ' + (en ? '18 holes only' : 'Только 18 лунок') + '</button>';
    h += '</div>';
    return h;
}

function pestovoProfileRoundCardHtml(playerId, u, r) {
    var en = currentLang === 'en';
    var hTag = en ? 'h' : 'л';
    var seq = ++__pestovoProfileCardSeq;
    var cardId = 'pr-card-' + seq;
    var btnTxtId = 'pr-btn-txt-' + seq;
    var btnIconId = 'pr-btn-icon-' + seq;

    var isFull = r.holes === 18;
    var fullTag = isFull ? ' <span style="color:#2ecc71;font-size:10px;font-weight:700;">(18' + hTag + ')</span>' : ' <span style="color:var(--muted);font-size:10px;">(' + (r.holes || 1) + hTag + ')</span>';

    var h = '<div class="card" style="padding:12px 14px;margin-bottom:10px;border:1px solid var(--border);background:var(--card-bg);">';
    // Вся шапка — сворачивает/разворачивает карточку (по умолчанию свёрнута).
    h += '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;cursor:pointer;" onclick="toggleProfileRoundCard(\'' + cardId + '\')">';
    // Турнирный раунд подписываем НАЗВАНИЕМ ТУРНИРА и датой —
    // без повтора бренда и лишней служебной строки.
    var isTnRound = pestovoProfileIsTournamentRound(r);
    var tnTitle = r.tournamentName
        || (r.roundName ? String(r.roundName).replace(/\s*[·•]\s*(старт|start)\s*$/i, '').trim() : '')
        || (en ? 'Tournament' : 'Турнир');
    var headTitle = isTnRound ? escapeHtml(tnTitle) : t('brand_name');
    h += '<div style="flex:1;min-width:180px;">';
    h += '<strong style="color:var(--white);font-size:14.5px;"><i class="fas ' + (isTnRound ? 'fa-trophy' : 'fa-golf-ball-tee') + '" style="color:var(--gold);font-size:12px;"></i> ' + headTitle + '</strong>' + fullTag;
    h += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' +
            fmtDate(r.date) + ' · ' + pestovoRoundFormatBadge(r, 'Stroke') + ' · ' + t('tee_select') + ': ' + (r.tee ? fmtTeePill(r.tee) : '—') +
            (isTnRound ? '' : ' · ' + (r.mode === 'solo' ? '👤 Solo' : '👥 Group')) + '</div>';
    if (isTnRound && r.roundName) {
        h += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' + escapeHtml(r.roundName) + '</div>';
    }
    h += '<div style="font-size:11px;color:var(--muted);margin-top:2px;">' +
            (r.holeInOne ? '🎯 ' + r.holeInOne + ' · ' : '') +
            '🦅 ' + (r.eagles || 0) + ' · 🐦 ' + (r.birdies || 0) + ' · Par ' + (r.pars || 0) + '</div></div>';

    h += '<div style="text-align:right;display:flex;align-items:center;gap:10px;">';
    h += '<div><div style="font-size:22px;font-weight:800;color:var(--white);line-height:1;">' + r.gross + ' <span style="font-size:12px;color:var(--muted);font-weight:600;">Gross</span></div>' +
         '<div class="' + scoreClass(r.toPar) + '" style="font-size:14px;font-weight:700;">' + fmtScore(r.toPar) + '</div></div>';
    h += '<i class="fas fa-chevron-down" id="' + btnIconId + '" style="color:var(--gold);font-size:12px;width:14px;"></i>';
    h += '</div></div>';

    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;gap:8px;">';
    h += '<button type="button" class="btn btn-og btn-sm" onclick="event.stopPropagation();toggleProfileRoundCard(\'' + cardId + '\')"><span id="' + btnTxtId + '">' + (en ? 'Expand scorecard' : 'Развернуть карточку') + '</span></button>';

    var isAdminOrOwner = (currentUser && (currentUser.uid === playerId || (currentUserData && currentUserData.role === 'admin') || pestovoIsAdminViewer()));
    if (isAdminOrOwner) {
        h += '<button type="button" class="btn btn-r btn-sm" onclick="event.stopPropagation();deletePlayerHistoryRecord(\'' + playerId + '\', \'' + r._key + '\')" title="' + (en ? 'Delete Round' : 'Удалить из истории') + '"><i class="fas fa-trash"></i></button>';
    }
    h += '</div>';

    // Свёрнуто по умолчанию: класс hidden + display:none.
    h += '<div id="' + cardId + '" class="hidden" style="display:none;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);">';

    var pObj = {
        name: (u && u.name) || 'Игрок',
        scores: r.scores || {},
        fieldHcp: r.fieldHcp || 0,
        exactHcp: r.exactHcp || 0,
        tee: r.tee || 'wh'
    };
    var rObj = {
        tee: r.tee || 'wh',
        format: r.format || 'Stroke Play',
        formats: r.formats || null,
        holeRange: r.holeRange || '1-18',
        startHole: r.startHole || 1,
        completedAt: r.date
    };

    if (typeof generatePestovoScorecardHTML === 'function') {
        h += generatePestovoScorecardHTML(pObj, rObj, { compact: true });
    }

    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">';
    if (r.roundId) {
        h += '<button type="button" class="btn btn-og btn-sm" onclick="event.stopPropagation();openPrintScorecardModal(\'' + r.roundId + '\')"><i class="fas fa-print"></i> ' + (en ? 'Print (A4)' : 'Печать (A4)') + '</button>';
        if (r.status === 'completed') {
            h += '<button type="button" class="btn btn-g btn-sm" onclick="event.stopPropagation();exportRoundPNG(\'' + r.roundId + '\')"><i class="fas fa-image"></i> PNG</button>';
        }
    }
    h += '</div>';

    h += '</div></div>';
    return h;
}

function pestovoRenderProfileHistory(playerId) {
    var st = __pestovoProfileHistory[playerId];
    var root = document.getElementById('pr-history-root');
    if (!st || !root) return;
    var en = currentLang === 'en';

    root.innerHTML = pestovoProfileHistoryToolbarHtml(playerId) + '<div id="pr-history-list"></div>';
    var listEl = document.getElementById('pr-history-list');
    var wantTn = st.tab === 'tn';
    var items = st.rounds.filter(function(r) { return pestovoProfileIsTournamentRound(r) === wantTn; });
    if (st.onlyFull) items = items.filter(function(r) { return r.holes === 18; });
    pestovoSortHistoryItems(items, st.sort);

    if (!items.length) {
        var msg = wantTn
            ? (st.onlyFull
                ? (en ? 'No 18-hole tournament rounds' : 'Нет турнирных раундов на 18 лунок')
                : (en ? 'No tournament rounds yet' : 'Турнирных раундов пока нет'))
            : (st.onlyFull
                ? (en ? 'No 18-hole club rounds' : 'Нет клубных раундов на 18 лунок')
                : (en ? 'No club rounds yet' : 'Клубных раундов пока нет'));
        listEl.innerHTML = '<div class="empty" style="padding:24px;"><i class="fas ' + (wantTn ? 'fa-trophy' : 'fa-golf-ball-tee') + '"></i><p>' + msg + '</p></div>';
        return;
    }

    var html = '';
    if (wantTn) {
        // Группируем турнирные раунды по турнирам: отдельный турнир —
        // отдельный блок с заголовком, раунды не перемешаны с клубными.
        var groups = {};
        var gOrder = [];
        items.forEach(function(r) {
            var gk = r.tournamentId || r.protocolId || ('name:' + (r.tournamentName || (en ? 'Tournament' : 'Турнир')));
            if (!Object.prototype.hasOwnProperty.call(groups, gk)) { groups[gk] = []; gOrder.push(gk); }
            groups[gk].push(r);
        });
        gOrder.sort(function(a, b) {
            var ma = Math.max.apply(null, groups[a].map(function(x) { return x.date || 0; }));
            var mb = Math.max.apply(null, groups[b].map(function(x) { return x.date || 0; }));
            return mb - ma;
        });
        gOrder.forEach(function(gk) {
            var list = groups[gk];
            var name = list[0].tournamentName
                || (list[0].roundName ? String(list[0].roundName).replace(/\s*[·•]\s*(старт|start)\s*$/i, '').trim() : '')
                || (en ? 'Tournament' : 'Турнир');
            html += '<div style="margin:14px 0 8px;padding:8px 12px;border-radius:10px;background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.28);">' +
                    '<strong style="color:var(--gold);font-size:13px;"><i class="fas fa-trophy"></i> ' + escapeHtml(name) + '</strong>' +
                    ' <span class="tn-tab-count" style="margin-left:6px;">' + list.length + '</span></div>';
            list.forEach(function(r) { html += pestovoProfileRoundCardHtml(playerId, st.u, r); });
        });
    } else {
        items.forEach(function(r) { html += pestovoProfileRoundCardHtml(playerId, st.u, r); });
    }
    listEl.innerHTML = html;
}

function toggleProfileRoundCard(cardId) {
    var card = document.getElementById(cardId);
    var btnTxt = document.getElementById(cardId.replace('pr-card-', 'pr-btn-txt-'));
    var icon = document.getElementById(cardId.replace('pr-card-', 'pr-btn-icon-'));
    if (!card) return;

    if (card.style.display === 'none' || card.classList.contains('hidden')) {
        card.style.display = 'block';
        card.classList.remove('hidden');
        if (btnTxt) btnTxt.textContent = currentLang === 'en' ? 'Collapse' : 'Свернуть карточку';
        if (icon) icon.className = 'fas fa-chevron-up';
    } else {
        card.style.display = 'none';
        card.classList.add('hidden');
        if (btnTxt) btnTxt.textContent = currentLang === 'en' ? 'Expand Scorecard' : 'Развернуть карточку';
        if (icon) icon.className = 'fas fa-chevron-down';
    }
}

function deletePlayerHistoryRecord(userId, historyKey) {
    if (!userId || !historyKey) return;
    var confirmMsg = currentLang === 'en' ? 'Delete this round from history?' : 'Удалить этот раунд из истории?';
    if (!confirm(confirmMsg)) return;

    db.ref('users/' + userId + '/history/' + historyKey).remove().then(function() {
        db.ref('users/' + userId + '/history').once('value').then(function(sn) {
            var history = sn.val() || {};
            var rounds = Object.values(history);
            var count = rounds.length;
            var bestG = null;
            var bestS = null;

            rounds.forEach(function(r) {
                if (r.holes === 18 && r.gross) {
                    if (bestG === null || r.gross < bestG) bestG = r.gross;
                }
                if (r.holes === 18 && r.stablefordField) {
                    if (bestS === null || r.stablefordField > bestS) bestS = r.stablefordField;
                }
            });

            db.ref('users/' + userId).update({
                roundsPlayed: count,
                bestGross: bestG,
                bestStableford: bestS
            });

            toast(currentLang === 'en' ? 'Round deleted from history' : 'Раунд удалён из истории', 'info');
            if (typeof vib === 'function') vib(30);
            if (typeof openPlayerProfileModal === 'function') openPlayerProfileModal(userId);
        });
    }).catch(function(err) {
        toast('⚠️ Ошибка: ' + err.message, 'error');
    });
}

function closePModal() {
    var modalEl = document.getElementById('pmodal');
    if (modalEl) modalEl.classList.add('hidden');
}

// ==========================================
// ФОРМА РЕДАКТИРОВАНИЯ И КАСТОМИЗАЦИИ ПРОФИЛЯ
// ==========================================
function renderProfileEditForm(playerId) {
    var bodyEl = document.getElementById('pmodal-body');
    if (!bodyEl || typeof db === 'undefined') return;

    db.ref('users/' + playerId).once('value').then(function(sn) {
        var u = sn.val() || {};

        var firstName = u.firstName || (u.name ? u.name.split(' ')[0] : '');
        var lastName = u.lastName || (u.name ? u.name.split(' ').slice(1).join(' ') : '');
        var middleName = u.middleName || '';
        var phone = u.phone || '';
        var hcp = u.handicap != null ? fmtExactHcp(u.handicap) : '';
        var gender = u.gender || 'men';
        var defaultTee = u.defaultTee || 'wh';
        var currentAvatar = u.avatar || '';

        var html = '<h2 style="color:var(--gold);margin-bottom:16px;"><i class="fas fa-user-gear"></i> ' + t('edit_profile') + '</h2>';

        // Avatar Section
        html += '<div class="form-group"><label><i class="fas fa-image"></i> ' + t('avatar_label') + '</label>';
        html += '<div style="display:flex;align-items:center;gap:16px;margin:10px 0;flex-wrap:wrap;">';
        html += '<div id="edit-avatar-preview">' + fmtUserAvatar(u, 64) + '</div>';
        html += '<input type="file" id="edit-avatar-file" accept="image/*" style="display:none;" onchange="onAvatarFileSelected(this)">';
        html += '<button type="button" class="btn btn-og btn-sm" onclick="document.getElementById(\'edit-avatar-file\').click()"><i class="fas fa-upload"></i> ' + t('upload_photo') + '</button>';
        html += '</div>';

        // Presets
        html += '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">' + t('choose_preset') + ':</div>';
        html += '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">';
        var presets = ['⛳', '🏆', '🦅', '👑', '⭐', '👤'];
        presets.forEach(function(icon) {
            html += '<button type="button" class="preset-avatar-btn" onclick="selectPresetAvatar(\'' + icon + '\')">' + icon + '</button>';
        });
        html += '</div></div>';

        // Form Inputs
        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('first_name') + '</label><input type="text" id="edit-fn" class="form-input" value="' + escapeHtml(firstName) + '"></div>';
        html += '<div class="form-group"><label>' + t('last_name') + '</label><input type="text" id="edit-ln" class="form-input" value="' + escapeHtml(lastName) + '"></div>';
        html += '</div>';
        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('middle_name') + '</label><input type="text" id="edit-mid" class="form-input" value="' + escapeHtml(middleName) + '" placeholder="' + (currentLang === 'en' ? 'Middle name (optional)' : 'Отчество (необязательно)') + '"></div>';
        html += '</div>';

        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('exact_hcp') + '</label><input type="text" inputmode="decimal" id="edit-hcp" class="form-input" value="' + hcp + '" placeholder="+2.4 / 12.4"></div>';
        html += '<div class="form-group"><label>' + t('gender_label') + '</label><select id="edit-gender" class="form-input">' +
                '<option value="men" ' + (gender === 'men' ? 'selected' : '') + '>' + t('men') + '</option>' +
                '<option value="women" ' + (gender === 'women' ? 'selected' : '') + '>' + t('women') + '</option>' +
                '</select></div>';
        html += '</div>';

        html += '<div class="form-row">';
        html += '<div class="form-group"><label>' + t('phone_label') + '</label><input type="tel" inputmode="tel" autocomplete="tel" id="edit-phone" class="form-input" value="' + phone + '" placeholder="+7 (999) 000-00-00"></div>';
        html += '<div class="form-group"><label>' + t('default_tee') + '</label><select id="edit-tee" class="form-input">' +
                '<option value="bk" ' + (defaultTee === 'bk' ? 'selected' : '') + '>⬛ ' + t('tee_bk') + '</option>' +
                '<option value="bl" ' + (defaultTee === 'bl' ? 'selected' : '') + '>🟦 ' + t('tee_bl') + '</option>' +
                '<option value="wh" ' + (defaultTee === 'wh' ? 'selected' : '') + '>⬜ ' + t('tee_wh') + '</option>' +
                '<option value="rd" ' + (defaultTee === 'rd' ? 'selected' : '') + '>🟥 ' + t('tee_rd') + '</option>' +
                '</select></div>';
        html += '</div>';

        html += '<input type="hidden" id="edit-avatar-val" value="' + currentAvatar + '">';

        html += '<div style="display:flex;gap:12px;margin-top:20px;">';
        html += '<button type="button" class="btn btn-og" style="flex:1;" onclick="openPlayerProfileModal(\'' + playerId + '\')">' + t('cancel_btn') + '</button>';
        html += '<button type="button" class="btn btn-g" style="flex:1;" onclick="saveUserProfileData(\'' + playerId + '\')"><i class="fas fa-save"></i> ' + t('save_profile') + '</button>';
        html += '</div>';

        bodyEl.innerHTML = html;
    });
}

function selectPresetAvatar(icon) {
    var valEl = document.getElementById('edit-avatar-val');
    if (valEl) valEl.value = icon;
    var preview = document.getElementById('edit-avatar-preview');
    if (preview) preview.innerHTML = fmtUserAvatar({ avatar: icon, name: 'User' }, 64);
}

function onAvatarFileSelected(inp) {
    handleAvatarFileUpload(inp, function(dataUrl) {
        var valEl = document.getElementById('edit-avatar-val');
        if (valEl) valEl.value = dataUrl;
        var preview = document.getElementById('edit-avatar-preview');
        if (preview) preview.innerHTML = fmtUserAvatar({ avatar: dataUrl, name: 'User' }, 64);
    });
}

function saveUserProfileData(playerId) {
    var fnInp = document.getElementById('edit-fn');
    var lnInp = document.getElementById('edit-ln');
    var midInp = document.getElementById('edit-mid');
    var hcpInp = document.getElementById('edit-hcp');
    var genderInp = document.getElementById('edit-gender');
    var phoneInp = document.getElementById('edit-phone');
    var teeInp = document.getElementById('edit-tee');
    var avatarInp = document.getElementById('edit-avatar-val');

    var firstName = fnInp ? sanitizeNameRaw(fnInp.value) : '';
    var middleName = midInp ? sanitizeNameRaw(midInp.value) : '';
    var lastName = lnInp ? sanitizeNameRaw(lnInp.value) : '';
    // Полное имя: «Имя [Отчество] Фамилия»
    var fullName = ((firstName + ' ' + (middleName ? middleName + ' ' : '')) + lastName).trim() || 'Player';
    var exactHcp = hcpInp ? parseExactHcp(hcpInp.value) : 0;
    var gender = genderInp ? genderInp.value : 'men';
    var phone = phoneInp ? phoneInp.value.trim().replace(/[^\d+\-() ]/g, '').substring(0, 20) : '';
    var defaultTee = teeInp ? teeInp.value : 'wh';
    var avatar = avatarInp ? avatarInp.value : '';

    var updates = {
        name: fullName,
        firstName: firstName,
        middleName: middleName || null,
        lastName: lastName,
        handicap: exactHcp,
        gender: gender,
        phone: phone,
        defaultTee: defaultTee,
        avatar: avatar
    };

    db.ref('users/' + playerId).update(updates).then(function() {
        if (currentUserData) {
            Object.assign(currentUserData, updates);
        }
        toast(t('msg_profile_saved'), 'success');
        openPlayerProfileModal(playerId);
        if (typeof loadPlayers === 'function') loadPlayers();
        if (typeof loadLB === 'function') loadLB();
    });
}

// ==========================================
// МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ ЗАВЕРШЕНИЯ РАУНДА
// ==========================================
function openFinishConfirmModal(roundId, onConfirmCallback, onCloseCallback, opts) {
    if (typeof db === 'undefined' || !roundId) return;
    window._pestovoFinishModalOnClose = (typeof onCloseCallback === 'function') ? onCloseCallback : null;
    // opts: { playerId } — турнирное завершение проверяет ТОЛЬКО игрока и его маркера,
    // а не всю группу. onGoToHole(hole) — переход к проблемной лунке из модалки.
    var scopedPid = null, modalGoToHole = null;
    if (opts && typeof opts === 'object') { scopedPid = opts.playerId || null; modalGoToHole = opts.onGoToHole || null; }
    else if (typeof opts === 'string' && opts) { scopedPid = opts; }
    window._pestovoFinishModalGoToHole = (typeof modalGoToHole === 'function') ? modalGoToHole : null;

    db.ref('rounds/' + roundId).once('value').then(function(sn) {
        var r = sn.val();
        if (!r) return;

        var modalEl = document.getElementById('finish-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'finish-modal';
            modalEl.className = 'modal hidden';
            modalEl.innerHTML =
                '<div class="modal-bg" onclick="closeFinishModal()"></div>' +
                '<div class="modal-body" style="max-width:560px;">' +
                '<div class="modal-top-bar">' +
                '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeFinishModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
                '<button type="button" class="modal-close-btn" onclick="closeFinishModal()">&times;</button>' +
                '</div>' +
                '<div id="finish-modal-body"></div>' +
                '</div>';
            if (document.body) document.body.appendChild(modalEl);
        }

        var bodyEl = document.getElementById('finish-modal-body');
        var order = getRoundOrder(r);
        var holeCount = order.length;
        var players = Object.entries(r.players || {}).filter(function(pe) {
            // Удалённые и навсегда заблокированные демо-игроки не показываются
            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(pe[0], pe[1] && pe[1].name)) return false;
            // Турнирное завершение: в модалке показываем только меня (проверка — я + мой маркер)
            if (scopedPid && pe[0] !== scopedPid) return false;
            return true;
        });
        var verification = scopedPid ? collectPlayerVerification(r, scopedPid) : collectRoundVerification(r);

        var titleStr = currentLang === 'en' ? '🏁 Finish Round Confirmation' : '🏁 Подтверждение завершения раунда';
        var subStr = currentLang === 'en' ? 'Please review final scores before finishing:' : 'Пожалуйста, проверьте итоговые результаты перед завершением:';
        var finishBtnStr = currentLang === 'en' ? '🏁 Finish & Save Round' : '🏁 Завершить раунд';
        var continueBtnStr = currentLang === 'en' ? '← Continue Playing' : '← Продолжить игру';

        var html = '<h2 style="color:var(--gold);font-family:var(--ff);margin-bottom:6px;">' + titleStr + '</h2>';
        html += '<p style="font-size:13px;color:var(--muted);margin-bottom:20px;">' + subStr + '</p>';

        players.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);

            html += '<div class="list-item" style="padding:14px;margin-bottom:10px;flex-wrap:wrap;gap:8px;">';
            html += '<div style="flex:1;"><strong style="color:var(--white);font-size:15px;"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' + escapeHtml(playerDisplayName(p, pid)) + '</strong>';
            html += '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + t('hole') + 's: ' + stats.holesPlayed + ' / ' + holeCount + ' · Gross: ' + (stats.gross || 0) + '</div></div>';
            html += '<div style="text-align:right;"><div class="' + scoreClass(stats.toPar) + '" style="font-weight:800;font-size:18px;">' + fmtScore(stats.toPar) + '</div></div>';
            html += '</div>';
        });

        if (!verification.canFinish) {
            if (scopedPid && verification.firstIssue) {
                // Компактная подсказка вместо большого блока: только ПЕРВАЯ проблемная
                // лунка по порядку + кнопка перехода к ней. Остальное — через уведомления.
                var fIssue = verification.firstIssue;
                var fHtml = verificationIssueToastHtml(fIssue, verification);
                html += '<div style="margin:16px 0;" id="finish-verification-report">';
                html += '<div class="timing-alert ' + (fIssue.kind === 'mismatch' ? 'timing-late' : 'timing-warn') + '"><i class="fas ' + (fIssue.kind === 'mismatch' ? 'fa-triangle-exclamation' : 'fa-clock') + '"></i><div>' + fHtml + '</div></div>';
                html += '<button type="button" class="btn btn-og btn-block" style="margin-top:10px;" onclick="finishModalGoToHole(' + fIssue.hole + ')"><i class="fas fa-arrow-right"></i> ' + (currentLang === 'en' ? 'Go to hole ' + fIssue.hole : 'Перейти к лунке ' + fIssue.hole) + '</button>';
                html += '</div>';
            } else {
                html += '<div style="margin:16px 0;" id="finish-verification-report">' + buildVerificationReportHtml(verification) + '</div>';
            }
            if (currentLang === 'en') {
                html += '<div class="timing-alert timing-late" style="margin-bottom:4px;"><i class="fas fa-ban"></i><div><strong>' + (scopedPid ? 'The round cannot be finished until your scores are confirmed by your marker.' : 'The round cannot be finished until all scores are confirmed and matches are resolved.') + '</strong></div></div>';
            } else {
                html += '<div class="timing-alert timing-late" style="margin-bottom:4px;"><i class="fas fa-ban"></i><div><strong>' + (scopedPid ? 'Раунд нельзя завершить, пока ваш маркер не подтвердит ваши счета.' : 'Раунд нельзя завершить, пока все счета не подтверждены и не устранены несовпадения.') + '</strong></div></div>';
            }
        }

        var forceBtnHtml = '';
        if (!verification.canFinish) {
            forceBtnHtml = '<button type="button" class="btn btn-danger" style="flex:1;min-height:44px;" id="force-finish-modal-btn"><i class="fas fa-flag-checkered"></i> ' +
                (currentLang === 'en' ? 'Force finish as is' : 'Завершить принудительно') + '</button>';
        }

        html += '<div style="display:flex;gap:12px;margin-top:24px;flex-wrap:wrap;">';
        html += '<button class="btn btn-og" style="flex:1;min-height:44px;" onclick="closeFinishModal()">' + continueBtnStr + '</button>';
        if (forceBtnHtml) {
            html += forceBtnHtml;
        } else {
            html += '<button class="btn btn-g" style="flex:1;min-height:44px;" id="confirm-finish-btn">' + finishBtnStr + '</button>';
        }
        html += '</div>';

        if (bodyEl) bodyEl.innerHTML = html;
        modalEl.classList.remove('hidden');

        var forceModalBtn = document.getElementById('force-finish-modal-btn');
        if (forceModalBtn) {
            forceModalBtn.onclick = function() {
                closeFinishModal();
                openForceFinishModal(roundId, r, { playerId: scopedPid, isGroup: r.mode === 'group' });
            };
        }

        var confirmBtn = document.getElementById('confirm-finish-btn');
        if (confirmBtn) {
            confirmBtn.onclick = function() {
                closeFinishModal();
                if (typeof onConfirmCallback === 'function') onConfirmCallback();
            };
        }
    });
}

function closeFinishModal() {
    var modalEl = document.getElementById('finish-modal');
    if (modalEl) modalEl.classList.add('hidden');
    if (typeof window._pestovoFinishModalOnClose === 'function') {
        var cb = window._pestovoFinishModalOnClose;
        window._pestovoFinishModalOnClose = null;
        cb();
    }
}

// Переход к проблемной лунке из модалки завершения (закрывает модалку и зовёт onGoToHole).
function finishModalGoToHole(hole) {
    closeFinishModal();
    if (typeof window._pestovoFinishModalGoToHole === 'function') {
        try { window._pestovoFinishModalGoToHole(hole); } catch (_) { console.warn("[silent]", _); }
    }
}

// ==========================================
// ПРИНУДИТЕЛЬНОЕ ЗАВЕРШЕНИЕ И ПАУЗА РАУНДА (ПРОФЕССИОНАЛЬНЫЙ ИНСТРУМЕНТ)
// ==========================================
// Самый свежий снимок раунда: из базы, а если база недоступна — из переданной
// карточки. Нужен, чтобы действия администратора и маршала (пауза,
// принудительное завершение) опирались на фактический состав раунда, а не на
// устаревшие данные: «завершить одного игрока» вслепую раньше закрывало весь
// раунд, и остальные теряли возможность доиграть.
function readRoundSnapshot(roundId, roundData) {
    if (typeof db === 'undefined' || !db || !roundId) return Promise.resolve(roundData || null);
    return db.ref('rounds/' + roundId).once('value').then(function(sn) {
        var fresh = sn && sn.val();
        return fresh || roundData || null;
    }).catch(function() { return roundData || null; });
}

// Актуальное состояние паузы: дочитывается из базы, потому что клиенты часто
// зовут pause/resume по устаревшей карточке раунда (админка, второе
// устройство). Без этого возобновление «вслепую» обнуляло накопленное время
// паузы и тайминги раунда прыгали.
function readRoundPauseState(roundId, roundData) {
    function pick(r) {
        r = r || {};
        return {
            paused: !!r.paused,
            pausedAt: paceSafeTs(r.pausedAt, 0, 0) || 0,
            total: Math.max(0, parseInt(r.totalPausedMs, 10) || parseInt(r.totalPauseMs, 10) || 0),
            pauseHistory: Array.isArray(r.pauseHistory) ? r.pauseHistory.slice() : [],
            pauseReason: String(r.pauseReason || '')
        };
    }
    if (typeof db === 'undefined' || !db || !roundId) return Promise.resolve(pick(roundData));
    return db.ref('rounds/' + roundId).once('value').then(function(sn) {
        return pick((sn && sn.val()) || roundData);
    }).catch(function() { return pick(roundData); });
}

function roundPause(roundId, roundData, reason, userName, userId) {
    if (typeof db === 'undefined' || !roundId) return Promise.reject(new Error('No db'));
    var now = Date.now();
    var trimmed = String(reason || '').trim();
    return readRoundPauseState(roundId, roundData).then(function(st) {
        var updates = {
            paused: true,
            pauseReason: trimmed,
            pausedBy: userId || '',
            pausedByName: userName || ''
        };
        if (st.paused && st.pausedAt) {
            // Раунд уже стоит на паузе: точку заморозки не передвигаем, иначе
            // уже отсчитанные минуты паузы обнулились бы.
            updates.pauseHistory = st.pauseHistory;
            return db.ref('rounds/' + roundId).update(updates);
        }
        var history = st.pauseHistory.slice();
        history.push({
            pausedAt: now,
            reason: trimmed,
            pausedBy: userId || '',
            pausedByName: userName || ''
        });
        updates.pausedAt = now;
        updates.pauseHistory = history;
        return db.ref('rounds/' + roundId).update(updates);
    });
}

function roundResume(roundId, roundData, userName, userId) {
    if (typeof db === 'undefined' || !roundId) return Promise.reject(new Error('No db'));
    var now = Date.now();
    return readRoundPauseState(roundId, roundData).then(function(st) {
        if (!st.paused && !st.pausedAt) {
            // Не на паузе — ничего не пишем: «возобновление» вслепую раньше
            // затирало totalPausedMs, и весь учёт пауз терялся.
            return { resumed: false, durationMs: 0, totalMs: st.total };
        }
        var pausedAt = st.pausedAt || now;
        var duration = Math.max(0, Math.min(now - pausedAt, MAX_PAUSE_INTERVAL_MS));
        var newTotal = st.total + duration;
        var history = st.pauseHistory.slice();
        if (history.length > 0 && !history[history.length - 1].resumedAt) {
            history[history.length - 1].resumedAt = now;
            history[history.length - 1].durationMs = duration;
            history[history.length - 1].resumedByName = userName || '';
        }
        var updates = {
            paused: false,
            pausedAt: null,
            totalPausedMs: newTotal,
            totalPauseMs: newTotal,
            pauseReason: null,
            pauseHistory: history
        };
        var logEntry = {
            pausedAt: pausedAt,
            resumedAt: now,
            durationMs: duration,
            reason: st.pauseReason || '',
            pausedByName: (roundData && roundData.pausedByName) || '',
            resumedByName: userName || ''
        };
        return db.ref('rounds/' + roundId).update(updates).then(function() {
            try {
                return db.ref('rounds/' + roundId + '/pauseLog').push(logEntry);
            } catch (e) {
                return Promise.resolve();
            }
        }).then(function() {
            return { resumed: true, durationMs: duration, totalMs: newTotal };
        });
    });
}

function roundForceFinishPlayer(roundId, a2, a3, a4, a5) {
    if (typeof db === 'undefined' || !roundId) return Promise.reject(new Error('Invalid params'));
    var roundData, playerId, reason, finisherName;
    if (typeof a2 === 'object' && a2 !== null) {
        roundData = a2;
        playerId = a3;
        reason = a4;
        finisherName = a5;
    } else {
        playerId = a2;
        roundData = (typeof a3 === 'object' && a3 !== null) ? a3 : null;
        reason = a4;
        finisherName = a5;
    }
    if (!playerId) return Promise.reject(new Error('Invalid playerId'));

    var now = Date.now();
    var pid = String(playerId);
    // Состав раунда и счёта — из свежего снимка: тогда «завершить игрока»
    // корректно и из админки, и с устройства маркера.
    return readRoundSnapshot(roundId, roundData).then(function(round) {
    roundData = round || roundData;
    var p = (roundData && roundData.players && roundData.players[pid]) || {};
    var pName = finisherName || p.name || 'Player';
    var order = getRoundOrder(roundData || {});
    var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);

    var finishUpdate = {
        autoCompleted: false
    };
    finishUpdate['finishedPlayers/' + pid] = {
        at: now,
        name: p.name || pName,
        // Кто именно завершил (для администратора/маршала это не сам игрок)
        // и как зовут игрока — чтобы списки могли показать корректную подпись.
        playerName: p.name || pName,
        byName: finisherName || '',
        forced: true,
        forcedReason: String(reason || '').trim(),
        reason: String(reason || '').trim(),
        holesPlayed: stats.holesPlayed,
        gross: stats.gross
    };

    var finMap = {};
    Object.keys((roundData && roundData.finishedPlayers) || {}).forEach(function(k) { finMap[k] = true; });
    finMap[pid] = true;
    var pending = Object.keys((roundData && roundData.players) || {}).filter(function(id) { return !finMap[id]; });

    if (!pending.length) {
        finishUpdate.status = 'completed';
        finishUpdate.completedAt = now;
        finishUpdate.completedBy = pid;
        finishUpdate.completedByName = pName;
        finishUpdate.forcedFinish = true;
        if (reason) finishUpdate.forcedReason = reason;
    } else {
        finishUpdate.partialFinish = true;
    }

    return db.ref('rounds/' + roundId).update(finishUpdate).then(function() {
        try {
            saveHistoryEntry(pid, roundId, roundData, p, stats);
        } catch (e) { console.warn("[silent]", e); }

        if (!pending.length && typeof pestovoClaimRoundHistory === 'function') {
            pestovoClaimRoundHistory(roundId).then(function(claimed) {
                if (claimed && typeof saveHistory === 'function') {
                    db.ref('rounds/' + roundId).once('value').then(function(sn) {
                        var fresh = sn && sn.val();
                        if (fresh) saveHistory(roundId, fresh);
                    });
                }
            });
        }
        // Раунд закрыт принудительно (игрок снят с игры/досрочный финиш):
        // турнир тоже должен завершиться автоматически, если это был
        // последний незакрытый раунд.
        if (!pending.length && roundData && roundData.tournamentId && typeof pestovoAutoFinishTournament === 'function') {
            try { pestovoAutoFinishTournament(roundData.tournamentId); } catch (e) { console.warn("[silent]", e); }
        }
        return { isComplete: !pending.length, remaining: pending.length };
    });
    });
}

function roundForceFinishAll(roundId, roundData, reason, finisherName) {
    if (typeof db === 'undefined' || !roundId) return Promise.reject(new Error('Invalid params'));
    var now = Date.now();
    return readRoundSnapshot(roundId, roundData).then(function(round) {
    roundData = round || roundData;
    var finishUpdate = {
        status: 'completed',
        completedAt: now,
        forcedFinish: true,
        forcedReason: String(reason || '').trim(),
        forcedByName: finisherName || '',
        autoCompleted: false
    };
    var players = (roundData && roundData.players) || {};
    var order = getRoundOrder(roundData || {});
    Object.keys(players).forEach(function(pid) {
        if (!roundData.finishedPlayers || !roundData.finishedPlayers[pid]) {
            var p = players[pid] || {};
            var stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);
            finishUpdate['finishedPlayers/' + pid] = {
                at: now,
                name: p.name || 'Player',
                forced: true,
                reason: String(reason || '').trim(),
                holesPlayed: stats.holesPlayed,
                gross: stats.gross
            };
        }
    });

    return db.ref('rounds/' + roundId).update(finishUpdate).then(function() {
        return db.ref('rounds/' + roundId).once('value');
    }).then(function(sn) {
        var fresh = sn && sn.val();
        // Раунд закрыт целиком (принудительно, «Завершить раунд» в админке):
        // проверяем автозавершение турнира — это «другой способ» закрыть раунд.
        var tnId = (fresh && fresh.tournamentId) || (roundData && roundData.tournamentId);
        if (tnId && typeof pestovoAutoFinishTournament === 'function') {
            try { pestovoAutoFinishTournament(tnId); } catch (e) { console.warn("[silent]", e); }
        }
        if (fresh && typeof pestovoClaimRoundHistory === 'function') {
            return pestovoClaimRoundHistory(roundId).then(function(claimed) {
                if (claimed && typeof saveHistory === 'function') {
                    try { saveHistory(roundId, fresh); } catch (e) { console.warn("[silent]", e); }
                }
            });
        }
    });
    });
}

function openRoundPauseModal(roundId, roundData, onDone) {
    if (typeof document === 'undefined' || !roundId) return;
    var modalEl = document.getElementById('round-pause-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'round-pause-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closeRoundPauseModal()"></div>' +
            '<div class="modal-body" style="max-width:480px;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeRoundPauseModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closeRoundPauseModal()">&times;</button>' +
            '</div>' +
            '<div id="round-pause-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('round-pause-modal-body');
    if (!bodyEl) return;

    var isEn = currentLang === 'en';
    var title = isEn ? '⏸ Pause Round' : '⏸ Поставить раунд на паузу';
    var desc = isEn
        ? 'Pace-of-play timings and hole deadlines will be frozen during the pause. Deadlines for all remaining holes will automatically be extended by the pause duration.'
        : 'Тайминги и нормативы темпа игры будут остановлены на время паузы. Дедлайны по всем оставшимся лункам автоматически сдвинутся на длительность паузы.';

    var html = '<h2 style="color:var(--gold);font-family:var(--ff);margin-bottom:6px;">' + title + '</h2>';
    html += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">' + desc + '</p>';

    html += '<div class="form-group" style="margin-bottom:16px;">';
    html += '<label style="font-size:12px;font-weight:600;color:var(--white);margin-bottom:6px;display:block;">' +
        (isEn ? 'Pause reason:' : 'Причина паузы:') + '</label>';
    html += '<select id="rpm-reason-select" class="form-input" style="width:100%;margin-bottom:8px;" onchange="var c=document.getElementById(\'rpm-reason-custom\');if(c)c.classList.toggle(\'hidden\',this.value!==\'other\');">';
    html += '<option value="weather">' + (isEn ? '⛈ Thunderstorm / Bad weather' : '⛈ Гроза / Непогода') + '</option>';
    html += '<option value="lunch">' + (isEn ? '🍽 Break / Lunch' : '🍽 Перерыв / Обед') + '</option>';
    html += '<option value="marshal">' + (isEn ? '🚨 Marshal / Referee stop' : '🚨 Остановка маршалом / судьёй') + '</option>';
    html += '<option value="delay">' + (isEn ? '🔍 Course delay / Lost ball' : '🔍 Задержка на поле / Поиск мяча') + '</option>';
    html += '<option value="tech">' + (isEn ? '⚙️ Technical pause' : '⚙️ Техническая пауза') + '</option>';
    html += '<option value="other">' + (isEn ? '📝 Other reason…' : '📝 Другая причина…') + '</option>';
    html += '</select>';
    html += '<input type="text" id="rpm-reason-custom" class="form-input hidden" placeholder="' +
        (isEn ? 'Type reason...' : 'Укажите причину...') + '" style="width:100%;">';
    html += '</div>';

    html += '<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;">';
    html += '<button type="button" class="btn btn-og" style="flex:1;" onclick="closeRoundPauseModal()">' +
        (isEn ? 'Cancel' : 'Отмена') + '</button>';
    html += '<button type="button" class="btn btn-warning" style="flex:1;font-weight:700;" id="rpm-confirm-btn">' +
        '<i class="fas fa-pause"></i> ' + (isEn ? 'Pause Round' : 'Поставить на паузу') + '</button>';
    html += '</div>';

    bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');

    var btn = document.getElementById('rpm-confirm-btn');
    if (btn) {
        btn.onclick = function() {
            var sel = document.getElementById('rpm-reason-select');
            var custom = document.getElementById('rpm-reason-custom');
            var val = (sel && sel.value) || 'weather';
            var reason = '';
            if (val === 'other' && custom && custom.value.trim()) {
                reason = custom.value.trim();
            } else if (sel && sel.options && sel.selectedIndex >= 0) {
                reason = sel.options[sel.selectedIndex].text;
            }
            var myName = (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.name) ||
                         (typeof currentUser !== 'undefined' && currentUser && currentUser.displayName) || 'Игрок';
            var myId = (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) || '';

            btn.disabled = true;
            roundPause(roundId, roundData, reason, myName, myId).then(function() {
                closeRoundPauseModal();
                toast(isEn ? '⏸ Round paused. Timings frozen.' : '⏸ Раунд на паузе. Тайминги заморожены.', 'warn');
                if (typeof onDone === 'function') onDone(true);
            }).catch(function(err) {
                btn.disabled = false;
                toast('❌ ' + (err && err.message ? err.message : err), 'error');
            });
        };
    }
}

function closeRoundPauseModal() {
    var modalEl = document.getElementById('round-pause-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function openForceFinishModal(roundId, roundData, opts) {
    if (typeof document === 'undefined' || !roundId) return;
    opts = opts || {};
    var isGroup = opts.isGroup || (roundData && roundData.mode === 'group');
    var targetPid = opts.playerId || (typeof getActingUid === 'function' ? getActingUid() : null);
    var canFinishAll = opts.canFinishAll || opts.isAdmin;

    var modalEl = document.getElementById('round-force-finish-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'round-force-finish-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closeForceFinishModal()"></div>' +
            '<div class="modal-body" style="max-width:540px;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeForceFinishModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closeForceFinishModal()">&times;</button>' +
            '</div>' +
            '<div id="round-force-finish-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('round-force-finish-modal-body');
    if (!bodyEl) return;

    var isEn = currentLang === 'en';
    var title = isEn ? '⚡ Force Finish Round' : '⚡ Принудительное завершение раунда';
    var desc = isEn
        ? 'All scores entered so far will be saved to the scorecard and recorded in player history. Unplayed holes will remain empty.'
        : 'Все введённые к этому моменту результаты будут зафиксированы в карточке и пойдут в историю. Несыгранные лунки останутся незаполненными.';

    var order = getRoundOrder(roundData || {});
    var players = (roundData && roundData.players) || {};
    var pIds = Object.keys(players);
    if (!targetPid && pIds.length) targetPid = pIds[0];
    var myPlayer = players[targetPid] || {};
    var myStats = calcRoundStats(myPlayer.scores || {}, myPlayer.fieldHcp || 0, myPlayer.exactHcp || 0, order);

    var html = '<h2 style="color:var(--gold);font-family:var(--ff);margin-bottom:6px;">' + title + '</h2>';
    html += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">' + desc + '</p>';

    // Сводка сохраняемого счёта
    html += '<div class="list-item" style="padding:12px;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.25);border-radius:10px;margin-bottom:16px;">';
    html += '<div style="flex:1;"><strong style="color:var(--white);font-size:14px;"><i class="fas fa-user-circle" style="color:var(--gold);"></i> ' +
        escapeHtml(playerDisplayName(myPlayer, targetPid)) + '</strong>';
    html += '<div style="font-size:12px;color:var(--gold);margin-top:2px;">' +
        (isEn ? 'Played holes: ' : 'Сыграно лунок: ') + '<b>' + myStats.holesPlayed + ' / ' + order.length + '</b>' +
        ' · Gross: <b>' + (myStats.gross || 0) + '</b> · Stbl: <b>' + myStats.stablefordField + '</b></div></div>';
    html += '<div style="text-align:right;"><div class="' + scoreClass(myStats.toPar) + '" style="font-size:18px;font-weight:800;">' + fmtScore(myStats.toPar) + '</div></div>';
    html += '</div>';

    // Выбор области действия для группового раунда
    if (isGroup && pIds.length > 1) {
        var otherCount = pIds.length - 1;
        html += '<div style="margin-bottom:14px;padding:10px;background:rgba(255,255,255,0.02);border:1px solid var(--border);border-radius:8px;">';
        html += '<div style="font-size:12px;font-weight:700;color:var(--white);margin-bottom:8px;">' +
            (isEn ? 'Who is finishing:' : 'Для кого завершить:') + '</div>';
        html += '<label style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;cursor:pointer;">' +
            '<input type="radio" name="rfm-scope" value="self" checked style="margin-top:3px;">' +
            '<div><strong style="color:var(--white);font-size:13px;">' + (isEn ? '👤 Only for me (' + escapeHtml(myPlayer.name || 'Player') + ')' : '👤 Только для меня (' + escapeHtml(myPlayer.name || 'Игрок') + ')') + '</strong>' +
            '<div style="font-size:11.5px;color:var(--muted);">' + (isEn ? 'Other group players (' + otherCount + ') will continue playing.' : 'Другие игроки группы (' + otherCount + ') продолжат играть в этом раунде.') + '</div></div>' +
            '</label>';
        if (canFinishAll) {
            html += '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">' +
                '<input type="radio" name="rfm-scope" value="all" style="margin-top:3px;">' +
                '<div><strong style="color:var(--gold);font-size:13px;">' + (isEn ? '👥 For all group players' : '👥 Для всей группы целиком') + '</strong>' +
                '<div style="font-size:11.5px;color:var(--muted);">' + (isEn ? 'Finishes the round for everyone, saving current scores.' : 'Завершает раунд для всех участников с сохранением текущих очков каждого.') + '</div></div>' +
                '</label>';
        }
        html += '</div>';
    }

    // Выбор причины
    html += '<div class="form-group" style="margin-bottom:16px;">';
    html += '<label style="font-size:12px;font-weight:600;color:var(--white);margin-bottom:6px;display:block;">' +
        (isEn ? 'Reason for early finish:' : 'Причина досрочного завершения:') + '</label>';
    html += '<select id="rfm-reason-select" class="form-input" style="width:100%;margin-bottom:8px;" onchange="var c=document.getElementById(\'rfm-reason-custom\');if(c)c.classList.toggle(\'hidden\',this.value!==\'other\');">';
    html += '<option value="wd">' + (isEn ? '🛑 Player decision / Withdrawal (WD)' : '🛑 Сход / По решению игрока (WD)') + '</option>';
    html += '<option value="darkness">' + (isEn ? '🌙 Darkness / Nightfall' : '🌙 Наступление темноты') + '</option>';
    html += '<option value="weather">' + (isEn ? '⛈ Bad weather / Heavy rain' : '⛈ Погода / Сильный дождь') + '</option>';
    html += '<option value="injury">' + (isEn ? '🚑 Injury / Medical reason' : '🚑 Травма / Плохое самочувствие') + '</option>';
    html += '<option value="time">' + (isEn ? '⏰ Out of time' : '⏰ Нехватка времени') + '</option>';
    html += '<option value="other">' + (isEn ? '📝 Other reason…' : '📝 Другая причина…') + '</option>';
    html += '</select>';
    html += '<input type="text" id="rfm-reason-custom" class="form-input hidden" placeholder="' +
        (isEn ? 'Type reason...' : 'Укажите причину...') + '" style="width:100%;">';
    html += '</div>';

    html += '<div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;">';
    html += '<button type="button" class="btn btn-og" style="flex:1;" onclick="closeForceFinishModal()">' +
        (isEn ? '← Back to game' : '← Назад к игре') + '</button>';
    html += '<button type="button" class="btn btn-danger" style="flex:1.3;font-weight:700;" id="rfm-confirm-btn">' +
        '<i class="fas fa-flag-checkered"></i> ' + (isEn ? 'Force Finish & Save' : 'Завершить принудительно') + '</button>';
    html += '</div>';

    bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');

    var btn = document.getElementById('rfm-confirm-btn');
    if (btn) {
        btn.onclick = function() {
            var sel = document.getElementById('rfm-reason-select');
            var custom = document.getElementById('rfm-reason-custom');
            var val = (sel && sel.value) || 'wd';
            var reason = '';
            if (val === 'other' && custom && custom.value.trim()) {
                reason = custom.value.trim();
            } else if (sel && sel.options && sel.selectedIndex >= 0) {
                reason = sel.options[sel.selectedIndex].text;
            }

            var scopeRadio = document.querySelector('input[name="rfm-scope"]:checked');
            var scope = scopeRadio ? scopeRadio.value : 'self';

            var myName = (myPlayer && myPlayer.name) ||
                         (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.name) || 'Player';

            btn.disabled = true;
            if (isGroup && scope === 'all' && canFinishAll) {
                roundForceFinishAll(roundId, roundData, reason, myName).then(function() {
                    closeForceFinishModal();
                    toast(isEn ? '✅ Round force-finished for all players. Scores saved.' : '✅ Раунд принудительно завершён для всех игроков. Очки сохранены.', 'success');
                    setTimeout(function() { window.location.href = 'leaderboard.html'; }, 800);
                }).catch(function(err) {
                    btn.disabled = false;
                    toast('❌ ' + (err && err.message ? err.message : err), 'error');
                });
            } else {
                roundForceFinishPlayer(roundId, roundData, targetPid, reason, myName).then(function(res) {
                    closeForceFinishModal();
                    var msg = isEn
                        ? '✅ Round finished early. Your score is saved! Partners continue playing.'
                        : '✅ Раунд завершён досрочно. Ваши очки сохранены! Партнёры продолжают игру.';
                    toast(msg, 'success');
                    setTimeout(function() {
                        if (res && res.isComplete) window.location.href = 'leaderboard.html';
                        else window.location.href = 'leaderboard.html';
                    }, 800);
                }).catch(function(err) {
                    btn.disabled = false;
                    toast('❌ ' + (err && err.message ? err.message : err), 'error');
                });
            }
        };
    }
}

function closeForceFinishModal() {
    var modalEl = document.getElementById('round-force-finish-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

// ==========================================
// ПРОПУЩЕННЫЕ ЛУНКИ — КОМПАКТНЫЙ ВЫБОР ПРИ ПЕРЕХОДЕ
// ==========================================
// При ручном переходе на другую лунку проверяем только лунки, которые
// игрок ПЕРЕПРЫГИВАЕТ по своему порядку игры (с учётом стартовой лунки
// и шотгана). Лунки, до которых он ещё не дошёл, пропущенными не считаются.
// Нажатая кнопка «Пропустить» запоминает решение до конца раунда:
// уведомление больше не мешает вводу и снова показывается только при
// завершении раунда (исправление результата).
function pestovoSkipAckKey(rid, pid) { return 'pestovo_skip_ack_' + rid + '_' + pid; }

function pestovoSkipGetAck(rid, pid) {
    try {
        var raw = localStorage.getItem(pestovoSkipAckKey(rid, pid));
        return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
}

function pestovoSkipAddAck(rid, pid, holes) {
    var map = pestovoSkipGetAck(rid, pid);
    (holes || []).forEach(function(h) { map[h] = Date.now(); });
    try { localStorage.setItem(pestovoSkipAckKey(rid, pid), JSON.stringify(map)); } catch (e) { console.warn("[silent]", e); }
    return map;
}
function pestovoSkipDropAckHoles(rid, pid, holes) {
    var map = pestovoSkipGetAck(rid, pid);
    var changed = false;
    (holes || []).forEach(function(h) {
        var k = String(h);
        if (map[k] !== undefined) { delete map[k]; changed = true; }
    });
    if (!changed) return;
    try {
        if (Object.keys(map).length) localStorage.setItem(pestovoSkipAckKey(rid, pid), JSON.stringify(map));
        else localStorage.removeItem(pestovoSkipAckKey(rid, pid));
    } catch (e) { console.warn("[silent]", e); }
}

// Лунки без счёта на отрезке [fromIdx; toIdx) по порядку игры игрока.
// acked-лунки (на которые игрок осознанно нажал «Пропустить») исключаются.
function pestovoMissingHolesAhead(order, isMissing, fromHole, toHole, ackMap) {
    var fromIdx = order.indexOf(fromHole);
    var toIdx = order.indexOf(toHole);
    var out = [];
    if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return out;
    for (var i = fromIdx; i < toIdx; i++) {
        var h = order[i];
        if (ackMap && ackMap[h]) continue;
        try { if (isMissing(h)) out.push(h); } catch (e) { console.warn("[silent]", e); }
    }
    return out;
}

function pestovoCloseSkipModal() {
    var m = document.getElementById('pestovo-skip-modal');
    if (m) m.classList.add('hidden');
}

// Компактная модалка-выбор: ровно ОДНА пропущенная лунка + действия.
// cb('enter', h)  — ввести счёт на пропущенной лунке;
// cb('skip', h)   — пропустить её и продолжить переход;
// cb('skipall', holes) — пропустить все перепрыгиваемые лунки до конца раунда.
function pestovoShowSkipChoiceModal(hole, allMissing, cb) {
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var modal = document.getElementById('pestovo-skip-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pestovo-skip-modal';
        modal.className = 'modal hidden';
        modal.innerHTML =
            '<div class="modal-bg" onclick="pestovoCloseSkipModal()"></div>' +
            '<div class="modal-body" style="max-width:440px;">' +
            '<button type="button" class="modal-close-btn" onclick="pestovoCloseSkipModal()">&times;</button>' +
            '<div id="pestovo-skip-modal-body"></div>' +
            '</div>';
        document.body.appendChild(modal);
    }
    var moreCnt = Math.max(0, (allMissing || []).length - 1);
    var body =
        '<div class="skip-choice"><div class="skip-choice-ic"><i class="fas fa-triangle-exclamation"></i></div>' +
        '<h2 style="color:#f3b23c;margin:0 0 6px;">' + (en ? 'Hole ' + hole + ' has no score' : 'Лунка ' + hole + ' — счёт не введён') + '</h2>' +
        '<p style="font-size:13px;color:var(--muted);margin:0 0 16px;">' +
        (en ? 'Enter the score on this hole, or skip it and keep moving.' : 'Введите счёт на этой лунке или пропустите её и двигайтесь дальше.') +
        (moreCnt ? ' ' + (en ? (moreCnt + ' more hole(s) ahead without a score.') : ('Ещё пропущено лунок впереди: ' + moreCnt + '.')) : '') +
        '</p>' +
        '<button type="button" class="btn btn-g btn-block" id="psk-enter"><i class="fas fa-pen"></i> ' +
        (en ? 'Enter score on hole ' + hole : 'Ввести счёт на лунке ' + hole) + '</button>' +
        '<button type="button" class="btn btn-ol btn-block" style="margin-top:8px;" id="psk-skip"><i class="fas fa-forward"></i> ' +
        (en ? 'Skip and continue' : 'Пропустить и продолжить') + '</button>' +
        '<button type="button" class="skip-choice-all" id="psk-skipall">' +
        (en ? 'Continue with skips until the round is finished' : 'Продолжить с пропуском (не напоминать до завершения раунда)') +
        '</button></div>';
    document.getElementById('pestovo-skip-modal-body').innerHTML = body;
    modal.classList.remove('hidden');
    document.getElementById('psk-enter').onclick = function() { pestovoCloseSkipModal(); cb && cb('enter', hole); };
    document.getElementById('psk-skip').onclick = function() { pestovoCloseSkipModal(); cb && cb('skip', hole); };
    var allBtn = document.getElementById('psk-skipall');
    if (allBtn) allBtn.onclick = function() { pestovoCloseSkipModal(); cb && cb('skipall', allMissing); };
}

// Перехват перехода по лункам: при пропуске показываем компактный выбор.
// opts = { rid, pid, order, isMissing(h), from, to, performJump(h), enterHole(h) }
// performJump(to) вызывается, когда переход разрешён (или пропуск подтверждён).
// enterHole(h) — перейти к вводу пропущенной лунки.
function pestovoGuardHoleJump(opts) {
    if (!opts) return;
    var ack = pestovoSkipGetAck(opts.rid, opts.pid);
    var missing = pestovoMissingHolesAhead(opts.order || [], opts.isMissing, opts.from, opts.to, ack);
    if (!missing.length) { opts.performJump && opts.performJump(opts.to); return; }
    pestovoShowSkipChoiceModal(missing[0], missing, function(action, val) {
        if (action === 'enter') {
            opts.enterHole ? opts.enterHole(val) : opts.performJump && opts.performJump(val);
        } else if (action === 'skip') {
            pestovoSkipAddAck(opts.rid, opts.pid, [val]);
            // рекурсия: если впереди остались ещё непропущенные лунки — спросим про следующую
            pestovoGuardHoleJump(opts);
        } else if (action === 'skipall') {
            pestovoSkipAddAck(opts.rid, opts.pid, (val || []).slice());
            opts.performJump && opts.performJump(opts.to);
        }
    });
}

// Переход из поиска «Продолжить по ФИО» помечается в ссылке (fio=1):
// это единственный случай, когда раунд открывает не его владелец и перед
// завершением нужно подтвердить владение (телефон/ФИО).
function pestovoUrlFromFioSearch() {
    try { return String(new URLSearchParams(window.location.search).get('fio') || '') === '1'; }
    catch (e) { return false; }
}

// Игрок открывает ТУРНИРНУЮ карточку по своей ссылке/QR.
// Стартовый протокол выдаёт отдельный код на каждого участника, состав
// фиксирует судейская коллегия, а счёт подтверждает маркер — поэтому
// требовать «ФИО владельца» здесь нельзя: иначе второй игрок группы не мог
// сдать свою карточку после того, как первый завершил раунд.
// Переход из поиска по ФИО (fio=1) остаётся защищённым.
function pestovoIsTournamentCardHolder(rd, pid) {
    if (!rd || !pid) return false;
    if (typeof isTournamentRound !== 'function' || !isTournamentRound(rd)) return false;
    if (!rd.players || !rd.players[pid]) return false;
    return !pestovoUrlFromFioSearch();
}

// Сессия открыта по ссылке «Продолжить по ФИО» (?as=<pid>) с устройства,
// которое не является владельцем (нет аккаунта игрока и нет access-key).
function pestovoIsFioResume(rd, rid, pid) {
    if (!rd || !pid) return false;
    var asParam = null;
    try { asParam = new URLSearchParams(window.location.search).get('as'); } catch (e) { return false; }
    if (!asParam || String(asParam) !== String(pid)) return false;
    if (typeof currentUser !== 'undefined' && currentUser) {
        if (rd.createdBy === currentUser.uid) return false;
        if (rd.players && rd.players[currentUser.uid]) return false;
    }
    var key = (rd.mode === 'solo')
        ? localStorage.getItem('pestovo_solo_key_' + rid)
        : localStorage.getItem('pestovo_group_key_' + rid);
    if (key && rd.accessKey === key) return false;
    // Турнирная карточка участника (QR из стартового листа) — не «чужое
    // устройство»: каждый участник группы завершает свою карточку сам.
    if (pestovoIsTournamentCardHolder(rd, pid)) return false;
    return true;
}

function pestovoFioVerified(rid, pid) {
    try { return sessionStorage.getItem('pestovo_fio_verified_' + rid + '_' + pid) === '1'; }
    catch (e) { return false; }
}
function pestovoFioMarkVerified(rid, pid) {
    try { sessionStorage.setItem('pestovo_fio_verified_' + rid + '_' + pid, '1'); } catch (e) { console.warn("[silent]", e); }
}

// Проверка владения раундом перед завершением на не-своём устройстве:
// последние 4 цифры телефона из профиля; если телефона нет — полное ФИО.
function pestovoVerifyRoundOwner(rd, rid, pid, cb) {
    var p = rd && rd.players ? rd.players[pid] : null;
    if (!p) { cb && cb(false); return; }
    if (pestovoFioVerified(rid, pid)) { cb && cb(true); return; }
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var modal = document.getElementById('pestovo-skip-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pestovo-skip-modal';
        modal.className = 'modal hidden';
        modal.innerHTML =
            '<div class="modal-bg" onclick="pestovoCloseVerifyModal()"></div>' +
            '<div class="modal-body" style="max-width:440px;">' +
            '<button type="button" class="modal-close-btn" onclick="pestovoCloseVerifyModal()">&times;</button>' +
            '<div id="pestovo-skip-modal-body"></div></div>';
        document.body.appendChild(modal);
    }
    window.pestovoCloseVerifyModal = function() { modal.classList.add('hidden'); cb && cb(false); };

    var askName = function() {
        var full = p.name || ((p.firstName || '') + ' ' + (p.lastName || '')).trim();
        document.getElementById('pestovo-skip-modal-body').innerHTML =
            '<div class="skip-choice"><div class="skip-choice-ic"><i class="fas fa-shield-halved"></i></div>' +
            '<h2 style="color:var(--gold);margin:0 0 6px;">' + (en ? 'Confirm it is your round' : 'Подтвердите, что это ваш раунд') + '</h2>' +
            '<p style="font-size:13px;color:var(--muted);">' +
            (en ? 'Another player cannot finish this round. Type the full name of the card holder exactly.' : 'Другой игрок не может завершить этот раунд. Введите полное ФИО владельца карточки.') + '</p>' +
            '<input type="text" class="form-input" id="psk-owner-name" placeholder="' + (en ? 'Full name' : 'Полное ФИО') + '">' +
            '<button class="btn btn-g btn-block" id="psk-owner-ok" style="margin-top:10px;">' + (en ? 'Confirm and finish' : 'Подтвердить и завершить') + '</button></div>';
        modal.classList.remove('hidden');
        document.getElementById('psk-owner-ok').onclick = function() {
            var v = (document.getElementById('psk-owner-name').value || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
            var want = full.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
            if (v && want && v === want) {
                modal.classList.add('hidden');
                pestovoFioMarkVerified(rid, pid);
                cb && cb(true);
            } else if (typeof toast === 'function') {
                toast(en ? 'Name does not match the card' : 'ФИО не совпадает с карточкой', 'error');
            }
        };
    };

    if (typeof db === 'undefined' || !db) { askName(); return; }
    db.ref('usersPublic/' + pid).once('value').then(function(sn) {
        var u = sn.val() || {};
        var digits = String(u.phoneLast4 || '');
        if (digits.length >= 4) {
            var last4 = digits.slice(-4);
            document.getElementById('pestovo-skip-modal-body').innerHTML =
                '<div class="skip-choice"><div class="skip-choice-ic"><i class="fas fa-shield-halved"></i></div>' +
                '<h2 style="color:var(--gold);margin:0 0 6px;">' + (en ? 'Confirm it is your round' : 'Подтвердите, что это ваш раунд') + '</h2>' +
                '<p style="font-size:13px;color:var(--muted);">' +
                (en ? 'Another player cannot finish this round. Enter the last 4 digits of the phone number from the profile.' : 'Другой игрок не может завершить этот раунд. Введите последние 4 цифры телефона из профиля.') + '</p>' +
                '<input type="tel" inputmode="numeric" class="form-input" id="psk-owner-phone" placeholder="••••">' +
                '<button class="btn btn-g btn-block" id="psk-owner-ok" style="margin-top:10px;">' + (en ? 'Confirm and finish' : 'Подтвердить и завершить') + '</button></div>';
            modal.classList.remove('hidden');
            var inp = document.getElementById('psk-owner-phone');
            if (inp) inp.focus();
            document.getElementById('psk-owner-ok').onclick = function() {
                var v = (inp.value || '').replace(/\D/g, '').slice(-4);
                if (v === last4) {
                    modal.classList.add('hidden');
                    pestovoFioMarkVerified(rid, pid);
                    cb && cb(true);
                } else if (typeof toast === 'function') {
                    toast(en ? 'Phone digits do not match' : 'Цифры телефона не совпадают', 'error');
                }
            };
        } else {
            askName();
        }
    }).catch(askName);
}

// Модалка при завершении раунда: все лунки без счёта (независимо от
// нажатых ранее «Пропустить») + выбор «исправить» или «завершить как есть».
function pestovoShowFinishMissingModal(missing, opts) {
    opts = opts || {};
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    var modal = document.getElementById('pestovo-skip-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pestovo-skip-modal';
        modal.className = 'modal hidden';
        modal.innerHTML =
            '<div class="modal-bg" onclick="pestovoCloseSkipModal()"></div>' +
            '<div class="modal-body" style="max-width:480px;">' +
            '<button type="button" class="modal-close-btn" onclick="pestovoCloseSkipModal()">&times;</button>' +
            '<div id="pestovo-skip-modal-body"></div>' +
            '</div>';
        document.body.appendChild(modal);
    }
    var chips = (missing || []).map(function(h) {
        return '<button type="button" class="shb-hole-btn" data-hole="' + h + '">' +
            (en ? 'Hole ' : 'Лунка ') + h + '</button>';
    }).join('');
    var body =
        '<div class="skip-choice"><div class="skip-choice-ic"><i class="fas fa-flag-checkered"></i></div>' +
        '<h2 style="color:#f3b23c;margin:0 0 6px;">' + (en ? 'Some holes have no score' : 'Не на всех лунках введён счёт') + '</h2>' +
        '<p style="font-size:13px;color:var(--muted);margin:0 0 10px;">' +
        (en ? 'Tap a hole to enter the score, or finish the round anyway.' : 'Нажмите на лунку, чтобы ввести счёт, либо завершите раунд без них.') + '</p>' +
        '<div class="skip-finish-holes">' + chips + '</div>' +
        '<button type="button" class="btn btn-g btn-block" id="psk-finish-anyway" style="margin-top:14px;"><i class="fas fa-flag-checkered"></i> ' +
        (en ? 'Finish anyway' : 'Завершить раунд') + '</button>' +
        '<button type="button" class="btn btn-og btn-block" style="margin-top:8px;" id="psk-continue"><i class="fas fa-arrow-left"></i> ' +
        (en ? 'Continue playing' : 'Продолжить игру') + '</button></div>';
    document.getElementById('pestovo-skip-modal-body').innerHTML = body;
    modal.classList.remove('hidden');
    Array.prototype.forEach.call(modal.querySelectorAll('.shb-hole-btn'), function(btn) {
        btn.onclick = function() {
            var h = parseInt(btn.getAttribute('data-hole'), 10);
            pestovoCloseSkipModal();
            if (typeof opts.onEnter === 'function') opts.onEnter(h);
        };
    });
    document.getElementById('psk-finish-anyway').onclick = function() {
        pestovoCloseSkipModal();
        if (typeof opts.onFinishAnyway === 'function') opts.onFinishAnyway();
    };
    document.getElementById('psk-continue').onclick = function() {
        pestovoCloseSkipModal();
        if (typeof opts.onContinue === 'function') opts.onContinue();
    };
}

// ==========================================
// СКОРКАРТА ПЕСТОВО (КАК НА ФОТО — 18 ЛУНОК)
// ==========================================
function generatePestovoScorecardHTML(player, roundData, opts) {
    return renderClubScorecard(player, roundData, opts);
}

// ==========================================
// ПЕЧАТЬ ОФИЦИАЛЬНОЙ СЧЁТНОЙ КАРТОЧКИ (IMG_1113.JPEG REPLICA)
// ==========================================
function generateExactPestovoPaperScorecardHTML(player, roundData) {
    var p = player || {};
    var sc = p.scores || {};
    var fHcp = p.fieldHcp || 0;
    var eHcp = p.exactHcp || 0;
    var teeCode = (p && p.tee) || (roundData && roundData.tee) || 'wh';
    // Форматная линия целиком («Stableford + Gross»), а не только основной формат.
    var fmt = pestovoRoundFormatsLabel(roundData) || (roundData && roundData.format) || 'Stroke Play';
    var tName = (roundData && roundData.tournamentName) || '—';
    var date = fmtDate((roundData && (roundData.completedAt || roundData.createdAt)) || Date.now());
    var startTime = fmtTime(roundData && roundData.startTime);

    var outG = 0, inG = 0, outS = 0, inS = 0;
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) { outG += s; outS += stablefordField(s, i, fHcp); }
    }
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        if (s > 0) { inG += s; inS += stablefordField(s, i, fHcp); }
    }
    var totG = outG + inG, totS = outS + inS;

    var pOut = 0, pIn = 0;
    for (var i = 1; i <= 9; i++) pOut += holePar(i);
    for (var i = 10; i <= 18; i++) pIn += holePar(i);

    var html = '<div class="paper-scorecard-wrap">';

    // Top Header with Logo
    html += '<div class="psc-top-header">';
    html += '  <div class="psc-logo-brand">';
    html += '    <img src="img/logo.png" alt="Pestovo" class="psc-logo" onerror="this.style.display=\'none\'">';
    html += '    <div><div class="psc-club-title">ГОЛЬФ-КЛУБ «ПЕСТОВО»</div><div class="psc-club-sub">Официальная счётная карточка</div></div>';
    html += '  </div>';
    html += '</div>';

    // Player & Meta Block (Matching IMG_1113.jpeg)
    html += '<div class="psc-meta-grid">';
    html += '  <div class="psc-meta-left">';
    html += '    <div><b>Игрок:</b> ' + escapeHtml(p.name || '___________________________') + '</div>';
    html += '    <div><b>Турнир:</b> ' + escapeHtml(tName || '') + ' &nbsp;&nbsp;&nbsp;&nbsp; <b>Формат:</b> ' + escapeHtml(fmt || '') + '</div>';
    html += '  </div>';
    html += '  <div class="psc-meta-right">';
    html += '    <div><b>Точный гандикап:</b> ' + fmtExactHcp(eHcp) + ' &nbsp;&nbsp; (Игровой: ' + fmtFieldHcp(fHcp) + ')</div>';
    html += '    <table class="psc-meta-table">';
    html += '      <tr><th>Раунд</th><th>Время старта</th><th>Дата</th></tr>';
    html += '      <tr><td>1</td><td>' + startTime + '</td><td>' + date + '</td></tr>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    // Grid Table Showing ONLY Played Tee
    html += '<div class="psc-table-wrap">';
    html += '<table class="psc-grid-table">';
    html += '<thead><tr><th style="width:75px;">ТИ \\ Лунка</th>';
    for (var i = 1; i <= 9; i++) html += '<th>' + i + '</th>';
    html += '<th class="psc-tot-col">Аут</th>';
    for (var i = 10; i <= 18; i++) html += '<th>' + i + '</th>';
    html += '<th class="psc-tot-col">Ин</th><th class="psc-tot-col">Итого</th></tr></thead>';

    html += '<tbody>';

    // SINGLE PLAYED TEE ROW (Only the Tee played by the player)
    var teeName = TEES[teeCode] || 'Белый';
    var teeClass = 'psc-tee-' + teeCode;
    var dO = 0, dI = 0;
    for (var i = 1; i <= 9; i++) dO += (HOLES[i][teeCode] || HOLES[i].wh);
    for (var i = 10; i <= 18; i++) dI += (HOLES[i][teeCode] || HOLES[i].wh);

    html += '<tr><td class="psc-lbl-tee ' + teeClass + '">' + teeName + '</td>';
    for (var i = 1; i <= 9; i++) html += '<td>' + (HOLES[i][teeCode] || HOLES[i].wh) + '</td>';
    html += '<td class="psc-tot-col">' + dO + '</td>';
    for (var i = 10; i <= 18; i++) html += '<td>' + (HOLES[i][teeCode] || HOLES[i].wh) + '</td>';
    html += '<td class="psc-tot-col">' + dI + '</td><td class="psc-tot-col">' + (dO + dI) + '</td></tr>';

    // Пар
    html += '<tr class="psc-row-par"><td class="psc-lbl-bold">Пар</td>';
    for (var i = 1; i <= 9; i++) html += '<td>' + HOLES[i].p + '</td>';
    html += '<td class="psc-tot-col">' + pOut + '</td>';
    for (var i = 10; i <= 18; i++) html += '<td>' + HOLES[i].p + '</td>';
    html += '<td class="psc-tot-col">' + pIn + '</td><td class="psc-tot-col">' + (pOut + pIn) + '</td></tr>';

    // Индекс
    html += '<tr class="psc-row-idx"><td class="psc-lbl-bold">Индекс</td>';
    for (var i = 1; i <= 9; i++) html += '<td>' + HOLES[i].hcp + '</td>';
    html += '<td class="psc-tot-col">—</td>';
    for (var i = 10; i <= 18; i++) html += '<td>' + HOLES[i].hcp + '</td>';
    html += '<td class="psc-tot-col">—</td><td class="psc-tot-col">—</td></tr>';

    // Счёт Игрока
    html += '<tr class="psc-row-score"><td class="psc-lbl-bold">Счёт</td>';
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        html += '<td class="psc-score-cell">' + (s > 0 ? '<b>' + s + '</b>' : '') + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (outG > 0 ? outG : '') + '</b></td>';
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        html += '<td class="psc-score-cell">' + (s > 0 ? '<b>' + s + '</b>' : '') + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (inG > 0 ? inG : '') + '</b></td>';
    html += '<td class="psc-tot-col"><b>' + (totG > 0 ? totG : '') + '</b></td></tr>';

    // Stableford
    html += '<tr><td class="psc-lbl-bold">Stableford</td>';
    for (var i = 1; i <= 9; i++) {
        var s = parseInt(sc[i]) || 0;
        var pts = s > 0 ? stablefordField(s, i, fHcp) : '';
        html += '<td>' + pts + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (outS > 0 ? outS : '') + '</b></td>';
    for (var i = 10; i <= 18; i++) {
        var s = parseInt(sc[i]) || 0;
        var pts = s > 0 ? stablefordField(s, i, fHcp) : '';
        html += '<td>' + pts + '</td>';
    }
    html += '<td class="psc-tot-col"><b>' + (inS > 0 ? inS : '') + '</b></td>';
    html += '<td class="psc-tot-col"><b>' + (totS > 0 ? totS : '') + '</b></td></tr>';

    html += '</tbody></table></div>';

    // Signatures Footer
    html += '<div class="psc-signatures">';
    html += '  <span><b>Подписи:</b></span>';
    html += '  <span><b>Игрок:</b> ____________________</span>';
    html += '  <span><b>Маркер:</b> ____________________</span>';
    html += '  <span><b>Судья:</b> ____________________</span>';
    html += '</div>';

    html += '</div>';

    return html;
}

function openPrintScorecardModal(roundId, playerId) {
    if (typeof db === 'undefined' || !roundId) return;

    db.ref('rounds/' + roundId).once('value').then(function(sn) {
        var r = sn.val();
        if (!r || !r.players) {
            toast(currentLang === 'en' ? 'Round not found' : 'Раунд не найден', 'error');
            return;
        }

        var playersList = Object.entries(r.players);
        if (!playersList.length) return;

        var modalEl = document.getElementById('print-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'print-modal';
            modalEl.className = 'modal hidden';
            modalEl.innerHTML =
                '<div class="modal-bg" onclick="closePrintModal()"></div>' +
                '<div class="modal-body" style="max-width:880px;">' +
                '<div class="modal-top-bar">' +
                '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closePrintModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
                '<button type="button" class="modal-close-btn" onclick="closePrintModal()">&times;</button>' +
                '</div>' +
                '<div id="print-modal-body"></div>' +
                '</div>';
            if (document.body) document.body.appendChild(modalEl);
        }

    var bodyEl = document.getElementById('print-modal-body');

    // Печатается карточка каждого игрока раунда: на листе A4 (landscape)
    // помещается 2 карточки, при печати видна только сама карточка.
    var html = '<div class="print-toolbar" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">';
    html += '<h2 style="color:var(--gold);margin:0;"><i class="fas fa-print"></i> ' + (currentLang === 'en' ? 'Print Official Scorecard' : 'Печать официальной счётной карточки') + '</h2>';
    html += '<div style="display:flex;gap:8px;">';
    html += '<button type="button" class="btn btn-g" onclick="window.print()"><i class="fas fa-print"></i> ' + (currentLang === 'en' ? 'Print' : 'Распечатать') + '</button>';
    html += '<button type="button" class="btn btn-og" onclick="closePrintModal()">' + (currentLang === 'en' ? 'Close' : 'Закрыть') + '</button>';
    html += '</div></div>';

    if (playersList.length > 1) {
        html += '<p class="no-print" style="color:var(--muted);font-size:12px;margin-bottom:10px;"><i class="fas fa-circle-info"></i> ' +
            (currentLang === 'en' ? 'Cards for all ' + playersList.length + ' players — 2 per A4 sheet.' : 'Карточки всех игроков (' + playersList.length + ') — по 2 на лист A4.') + '</p>';
    }

    html += '<div id="printable-scorecard" class="print-cards-grid">';
    playersList.forEach(function(pe) {
        html += generateExactPestovoPaperScorecardHTML(pe[1], r);
    });
    html += '</div>';

    if (bodyEl) bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');
    });
}

function closePrintModal() {
    var modalEl = document.getElementById('print-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function downloadScorecard(roundId) {
    openPrintScorecardModal(roundId);
}

// ==========================================
// ИСТОРИЯ
// ==========================================
function saveHistory(roundId,rd){
    var players=rd.players||{};
    Object.entries(players).forEach(function(pe){
        var pid=pe[0],p=pe[1],sc=p.scores||{},fH=p.fieldHcp||0,eH=p.exactHcp||0;
        var stats=calcRoundStats(sc,fH,eH,getRoundOrder(rd));
        if(stats.gross<=0)return;
        var isGuestPlayer=String(pid).indexOf('guest_')===0;
        // В профиль игрока всегда идёт НАСТОЯЩИЙ гандикап: турнирная обрезка
        // (hcpCut) относится только к этому турниру и не должна менять HCP
        // игрока глобально. exactHcpRaw — значение до обрезки.
        var rawHcp=(p.exactHcpRaw!=null&&p.exactHcpRaw!=='')?p.exactHcpRaw:eH;
        var cutApplied=(p.exactHcpRaw!=null&&p.exactHcpRaw!==''&&
            (parseFloat(p.exactHcpRaw)||0)!==(parseFloat(p.exactHcp)||0));
        if(isGuestPlayer && typeof resolveOrCreatePlayerUser==='function'){
            // Идемпотентное разрешение игрока: переиспользуем существующую запись
            // (по детерминированному id или по имени) вместо создания новой —
            // иначе один игрок плодил дубликаты в users после каждого раунда.
            resolveOrCreatePlayerUser({
                uid:null,
                name:p.name||'Гость',
                firstName:p.firstName||'',
                lastName:p.lastName||'',
                exactHcp:rawHcp,
                exactHcpRaw:rawHcp,
                // флаг: в раунде значение было обрезано турниром
                hcpFromTournamentCut:cutApplied,
                gender:p.gender||'men',
                isGuest:true
            }).then(function(userId){
                if(userId)saveHistoryEntry(userId,roundId,rd,p,stats);
            }).catch(function(){});
        }else{saveHistoryEntry(pid,roundId,rd,p,stats);}
    });
}

function saveHistoryEntry(userId,roundId,rd,p,stats){
    // Турнирные раунды помечаем турниром: в профиле игрока показываем название
    // турнира и дату (без дублирования «Пестово · Пестово»). Для раундов,
    // заведённых через протокол турнира (без tournamentId), название берём
    // из protocolName — иначе раунд не попал бы во вкладку «Турнирные».
    var tnName=(rd.tournamentName||'').toString().trim();
    if(!tnName && typeof roundTournamentName==='function'){
        tnName=(roundTournamentName(rd)||'').toString().trim();
    }
    var entry={
        roundId:roundId,date:rd.completedAt||Date.now(),tee:(p&&p.tee)||rd.tee||'wh',format:rd.format||'Stroke Play',
        mode:rd.mode||'group',startHole:rd.startHole||1,holeRange:rd.holeRange||'1-18',gross:stats.gross,toPar:stats.toPar,
        net:stats.net,netToPar:stats.netToPar,stablefordField:stats.stablefordField,stablefordExact:stats.stablefordExact,
        holes:stats.holesPlayed,scores:p.scores||{},birdies:stats.birdies,eagles:stats.eagles,
        pars:stats.pars,holeInOne:stats.holeInOne,exactHcp:p.exactHcp||0,
        exactHcpRaw:(p.exactHcpRaw!=null&&p.exactHcpRaw!=='')?p.exactHcpRaw:(p.exactHcp||0),
        fieldHcp:p.fieldHcp||0,gender:p.gender||'men',status:'completed'
    };
    if(rd.tournamentId)entry.tournamentId=rd.tournamentId;
    if(rd.protocolId)entry.protocolId=rd.protocolId;
    if(tnName)entry.tournamentName=tnName;
    var roundName=(rd.roundName||rd.protocolName||'').toString().trim();
    if((rd.tournamentId||rd.protocolId||tnName)&&roundName)entry.roundName=roundName;

    function writeEntry() {
        db.ref('users/'+userId+'/history').push(entry);
        db.ref('users/'+userId+'/roundsPlayed').transaction(function(v){return(v||0)+1;});
        if(stats.holesPlayed===getRoundHoleCount(rd)){
            db.ref('users/'+userId+'/bestGross').transaction(function(v){if(!v||stats.gross<v)return stats.gross;return v;});
            db.ref('users/'+userId+'/bestStableford').transaction(function(v){if(!v||stats.stablefordField>v)return stats.stablefordField;return v;});
        }
    }

    // Идемпотентность на уровне игрока: если этот раунд УЖЕ лежит в его
    // истории (записал другой клиент, завершавший групповой раунд, либо
    // это повторный вызов), второй раз не пишем — иначе в профиле
    // появлялись одинаковые дубли раундов и задваивался roundsPlayed.
    // Если проверку выполнить не удалось (сбой чтения/прав), пишем как
    // раньше: дубли на уровне раунда всё равно отсекает клейм
    // historyRecorded и плановая дедупликация.
    try {
        db.ref('users/'+userId+'/history').orderByChild('roundId').equalTo(roundId).limitToFirst(1).once('value').then(function(sn){
            var exists = !!(sn && (typeof sn.exists === 'function' ? sn.exists() : (sn.numChildren && sn.numChildren() > 0)));
            if (!exists) writeEntry();
        }).catch(writeEntry);
    } catch (e) {
        writeEntry();
    }
}

// ==========================================
// ДЕДУПЛИКАЦИЯ ИСТОРИИ РАУНДОВ
// ==========================================
// Ключ группы «одинаковых» записей: по roundId, а для старых записей без
// roundId — по детерминированной сигнатуре (дата + итог + счёт по лункам).
function pestovoHistoryEntryGroupKey(r) {
    r = r || {};
    if (r.roundId) return 'rid:' + r.roundId;
    var scoresSig = '';
    try { scoresSig = JSON.stringify(r.scores || {}); } catch (e) { scoresSig = ''; }
    return 'sig:' + [r.date, r.gross, r.holes, r.toPar, r.net, r.stablefordField, scoresSig].join('|');
}

// Из списка пар [key, entry] оставляет по одной запись на раунд.
// Из дублей выбирается самая полная: больше сыгранных лунок, затем больше
// gross (запись не «обрезана» на середине), затем самая ранняя по ключу.
// Возвращает массив объектов записи с добавленным полем _key.
function pestovoPickHistoryUnique(entries) {
    var groups = {};
    var order = [];
    (entries || []).forEach(function(e) {
        if (!e || !e[1] || typeof e[1] !== 'object') return;
        var gk = pestovoHistoryEntryGroupKey(e[1]);
        if (!Object.prototype.hasOwnProperty.call(groups, gk)) { groups[gk] = []; order.push(gk); }
        groups[gk].push(e);
    });
    var out = [];
    order.forEach(function(gk) {
        var list = groups[gk];
        if (list.length === 1) {
            out.push(Object.assign({}, list[0][1], { _key: list[0][0] }));
            return;
        }
        var tnFlag = function(e) {
            return (e[1].tournamentId || e[1].tournamentName || e[1].protocolId) ? 1 : 0;
        };
        list.sort(function(a, b) {
            var ha = a[1].holes || 0, hb = b[1].holes || 0;
            if (hb !== ha) return hb - ha;
            var ga = a[1].gross || 0, gb = b[1].gross || 0;
            if (gb !== ga) return gb - ga;
            // При равной полноте сохраняем запись с турнирной пометкой,
            // чтобы раунд попал в турнирную вкладку.
            var ta = tnFlag(a), tb = tnFlag(b);
            if (tb !== ta) return tb - ta;
            var da = a[1].date || 0, db2 = b[1].date || 0;
            if (da !== db2) return da - db2;
            return String(a[0]) < String(b[0]) ? -1 : (String(a[0]) > String(b[0]) ? 1 : 0);
        });
        out.push(Object.assign({}, list[0][1], { _key: list[0][0] }));
    });
    return out;
}

// Сводные показатели по списку уникальных записей истории:
// roundsPlayed / bestGross / bestStableford.
function pestovoHistoryBestStats(rounds) {
    var bestG = null, bestS = null;
    (rounds || []).forEach(function(item) {
        if (item && item.holes === 18 && item.gross) {
            if (bestG === null || item.gross < bestG) bestG = item.gross;
        }
        if (item && item.holes === 18 && item.stablefordField) {
            if (bestS === null || item.stablefordField > bestS) bestS = item.stablefordField;
        }
    });
    return { roundsPlayed: (rounds || []).length, bestGross: bestG, bestStableford: bestS };
}

var __pestovoUserHistoryDeduped = {};

// Чистит дубли раундов в истории ОДНОГО игрока и выравнивает счётчики
// (roundsPlayed / bestGross / bestStableford). Идемпотентно: если дублей
// нет и счётчики верные, ничего не пишет. Возвращает Promise<boolean>
// (true — в базу внесены изменения).
function pestovoDedupeUserHistory(userId, userVal) {
    if (!userId || typeof db === 'undefined' || !db) return Promise.resolve(false);
    var run = function(u) {
        if (!u) return false;
        var hist = u.history || {};
        var pairs = Object.entries(hist);
        var unique = pestovoPickHistoryUnique(pairs);
        var keepKeys = {};
        unique.forEach(function(r) { keepKeys[r._key] = true; });
        var removeKeys = pairs.map(function(e) { return e[0]; }).filter(function(k) { return !keepKeys[k]; });
        var stats = pestovoHistoryBestStats(unique);
        var updates = {};
        removeKeys.forEach(function(k) { updates['users/' + userId + '/history/' + k] = null; });
        if ((u.roundsPlayed || 0) !== stats.roundsPlayed) updates['users/' + userId + '/roundsPlayed'] = stats.roundsPlayed;
        if ((u.bestGross || null) !== stats.bestGross) updates['users/' + userId + '/bestGross'] = stats.bestGross;
        if ((u.bestStableford || null) !== stats.bestStableford) updates['users/' + userId + '/bestStableford'] = stats.bestStableford;
        if (!Object.keys(updates).length) return false;
        return db.ref().update(updates).then(function() { return true; }).catch(function() { return false; });
    };
    if (userVal) {
        try { return Promise.resolve(run(userVal)); } catch (e) { return Promise.resolve(false); }
    }
    if (__pestovoUserHistoryDeduped[userId]) return Promise.resolve(false);
    __pestovoUserHistoryDeduped[userId] = true;
    return db.ref('users/' + userId).once('value').then(function(sn) {
        return run(sn && sn.val());
    }).catch(function() { return false; });
}

var __pestovoGlobalHistoryDedupeRunning = false;

// Глобальная разовая чистка дублей по ВСЕМ игрокам (запускает админ).
// Защита от параллельного/повторного запуска — транзакция-клейм по
// settings/migrations/historyDedupeV2. Дубли раньше плодил групповой
// финиш (saveHistory вызывал каждый завершающий клиент).
function pestovoDedupeAllPlayerHistoryOnce() {
    if (typeof db === 'undefined' || !db || __pestovoGlobalHistoryDedupeRunning) return Promise.resolve(0);
    __pestovoGlobalHistoryDedupeRunning = true;
    var release = function(v) { __pestovoGlobalHistoryDedupeRunning = false; return v; };
    var claimId = 'claim_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    var flagPath = 'settings/migrations/historyDedupeV2';

    // Клейм допускает «зависший» running старше 30 минут.
    return db.ref(flagPath).transaction(function(v) {
        if (v && v.status === 'done') return undefined;
        if (v && v.status === 'running' && v.at && (Date.now() - v.at) < 30 * 60 * 1000) return undefined;
        return { status: 'running', at: Date.now(), claim: claimId,
                 by: (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) || 'admin' };
    }).then(function(res) {
        if (!res.committed || !res.snapshot || res.snapshot.child('claim').val() !== claimId) return release(0);

        var listUserIds = function() {
            // Лёгкий список пользователей через REST shallow=true (без вытягивания
            // всех scorecard'ов), с фолбэком на полное чтение SDK.
            if (typeof fetch === 'function' && typeof firebaseConfig !== 'undefined' && firebaseConfig && firebaseConfig.databaseURL) {
                return fetch(firebaseConfig.databaseURL + '/users.json?shallow=true').then(function(resp) {
                    if (!resp.ok) throw new Error('shallow failed');
                    return resp.json();
                }).then(function(obj) {
                    return obj && typeof obj === 'object' ? Object.keys(obj) : [];
                }).catch(function() {
                    return db.ref('users').once('value').then(function(sn) { return Object.keys(sn.val() || {}); });
                });
            }
            return db.ref('users').once('value').then(function(sn) { return Object.keys(sn.val() || {}); });
        };

        return listUserIds().then(function(ids) {
            var removedUsers = 0, removedEntries = 0;
            var chain = Promise.resolve();
            ids.forEach(function(uid) {
                chain = chain.then(function() {
                    return db.ref('users/' + uid).once('value').then(function(sn) {
                        var u = sn && sn.val();
                        if (!u || !u.history) return;
                        var before = Object.keys(u.history).length;
                        return Promise.resolve(pestovoDedupeUserHistory(uid, u)).then(function(changed) {
                            if (changed) {
                                removedUsers++;
                                var after = pestovoPickHistoryUnique(Object.entries(u.history)).length;
                                removedEntries += Math.max(0, before - after);
                            }
                        }).catch(function() {});
                    }).catch(function() {});
                });
            });
            return chain.then(function() {
                return db.ref(flagPath).update({
                    status: 'done', at: Date.now(), claim: claimId,
                    finishedAt: Date.now(), users: removedUsers, removedEntries: removedEntries
                }).catch(function() {});
            }).then(function() {
                return release(removedEntries);
            });
        });
    }).catch(function() { return release(0); });
}


// ==========================================
// АВТОЗАВЕРШЕНИЕ ПРОСРОЧЕННЫХ РАУНДОВ
// ==========================================
// Раунд «живёт» только день старта: если игрок начал раунд вчера и не
// завершил его, на следующий день раунд автоматически переводится в статус
// «завершён автоматически» (autoCompleted=true). Проверка выполняется на
// клиентах при чтении списка раундов (главная, все раунды, админка) —
// первый открывший приложение игрок «подметает» базу за всех.
var __pestovoStaleRoundSweepIds = {};

function getRoundDayStartMs(ts) {
    var d = new Date(parseInt(ts, 10) || 0);
    if (isNaN(d.getTime())) return 0;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isRoundStaleForAutoComplete(r) {
    if (!r || typeof r !== 'object' || r.status !== 'active') return false;
    var startTs = parseInt(r.startTime, 10) || parseInt(r.createdAt, 10) || 0;
    if (!startTs) return false;
    var startDay = getRoundDayStartMs(startTs);
    if (!startDay) return false;
    var todayDay = getRoundDayStartMs(Date.now());
    // Раунд считается «вчерашним», если день его старта строго раньше сегодняшнего дня
    return startDay < todayDay;
}

// Принимает объект rounds из снапшота, переводит просроченные активные раунды
// в «completed» (локально сразу + записью в Firebase) и возвращает тот же объект.
function sweepStaleRounds(data) {
    if (!data || typeof data !== 'object') return data;
    Object.keys(data).forEach(function(id) {
        var r = data[id];
        if (!isRoundStaleForAutoComplete(r)) return;

        var nowMs = Date.now();
        // Локальный патч — чтобы текущий рендер сразу показал раунд завершённым
        r.status = 'completed';
        r.autoCompleted = true;
        r.autoCompletedAt = nowMs;
        r.paused = false;
        r.pausedAt = null;
        r.pauseReason = null;
        if (!r.completedAt) r.completedAt = nowMs;

        // Пишем в базу только один раз за жизнь вкладки на каждый раунд
        if (typeof db === 'undefined' || __pestovoStaleRoundSweepIds[id]) return;
        __pestovoStaleRoundSweepIds[id] = true;

        var roundId = id;
        var roundData = r;
        var update = {
            status: 'completed',
            autoCompleted: true,
            autoCompletedAt: nowMs,
            completedAt: roundData.completedAt,
            // Автозакрытие закрытой «на следующий день» карточки снимает и
            // паузу: иначе завершённый раунд вечно висит с бейджем «На паузе»,
            // а его тайминги считаются замороженными.
            paused: null,
            pausedAt: null,
            pauseReason: null
        };
        db.ref('rounds/' + roundId).update(update).then(function() {
            // Все раунды турнира могут оказаться завершёнными после этого
            // авто-закрытия — проверяем и закрываем сам турнир автоматически.
            if (roundData.tournamentId) {
                try { pestovoAutoFinishTournament(roundData.tournamentId); } catch (e) { console.warn("[silent]", e); }
            }
            // Историю сохраняем атомарно ровно один раз (транзакция-клейм):
            // даже если sweep запустили одновременно несколько клиентов,
            // записи в users/<uid>/history не задвоятся.
            return pestovoClaimRoundHistory(roundId).then(function(claimed) {
                if (claimed && typeof saveHistory === 'function') {
                    try { saveHistory(roundId, roundData); } catch (e) { console.warn("[silent]", e); }
                }
            });
        }).catch(function() {
            delete __pestovoStaleRoundSweepIds[roundId];
        });
    });
    // Страховка автозавершения турниров: раунд мог быть закрыт другим
    // способом (принудительно, админом, со второго устройства) — тогда вызова
    // автозавершения в этом клиенте не было вовсе. Проверяем снимок целиком.
    try { pestovoAutoFinishTournamentsFromSnapshot(data); } catch (e) { console.warn("[silent]", e); }
    return data;
}

// ==========================================
// ЗАЯВКА НА ЗАПИСЬ ИСТОРИИ РАУНДА (идемпотентно)
// ==========================================
// Раунд могут «закрывать» несколько клиентов одновременно (игрок, маркер,
// автозакрытие, завершение турнира). Право записать историю получает только
// один — через транзакцию по rounds/<rid>/historyRecorded.
// Возвращает Promise<boolean>: true — можно писать историю этого раунда.
function pestovoClaimRoundHistory(roundId) {
    if (!roundId || typeof db === 'undefined' || !db) return Promise.resolve(false);
    var claimId = 'claim_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    return db.ref('rounds/' + roundId + '/historyRecorded').transaction(function(v) {
        if (v === null || v === undefined || v === false) return claimId;
        return undefined; // кто-то уже забрал — отменяем транзакцию
    }).then(function(res) {
        return !!(res && res.committed && res.snapshot && String(res.snapshot.val()) === claimId);
    }).catch(function() { return false; });
}

// Общая работа с раундами турнира при его завершении или удалении.
//   mode 'complete' — кнопка «Завершить»: открытые раунды переводятся в
//     completed и ПОСЛЕ этого попадают в историю игроков (как любой
//     завершённый раунд). Результаты никуда не деваются: турнир остаётся
//     в «Истории» и статистике каждого игрока.
//   mode 'delete'   — кнопка «Удалить»: сначала убираем раунды из истории
//     игроков (с пересчётом bestGross/bestStableford), затем сносим сами
//     раунды вместе с маркерами. Удалённый турнир не оставляет следов.
// Возвращает Promise<{ closed, rounds, players, alerts, errors }>.
function pestovoFinalizeTournamentRounds(tnId, mode) {
    // errors[] — отклонённые записи. Раньше они гасились .catch() и сводка
    // рапортовала «раунды удалены», хотя база оставалась прежней (правила
    // могли не пустить запись: например, сессия по мастер-паролю без прав
    // на users/<uid>/history). Теперь ошибки доезжают до админа.
    var out = { closed: 0, rounds: 0, players: 0, errors: [] };
    if (!tnId || typeof db === 'undefined' || !db) return Promise.resolve(out);

    if (mode === 'delete') {
        return pestovoTournamentRoundIdsFull(tnId).then(function(ids) {
            out.rounds = ids.length;
            if (!ids.length) return out;
            return Promise.all(ids.map(function(rid) {
                return db.ref('rounds/' + rid).once('value').then(function(rs) {
                    var rd = (rs && rs.val()) || {};
                    return pestovoRemoveRoundFromPlayers(rid, rd.players || {});
                }).catch(function() { return 0; });
            })).then(function(list) {
                out.players = list.reduce(function(a, b) { return a + (b || 0); }, 0);
                var updates = {};
                ids.forEach(function(rid) {
                    updates['rounds/' + rid] = null;
                    updates['markers/' + rid] = null;
                    updates['markerAssignments/' + rid] = null;
                });
                var removedRounds = false;
                return db.ref().update(updates).then(function() {
                    removedRounds = true;
                }).catch(function(err) {
                    out.errors.push(err && err.message ? err.message : String(err));
                }).then(function() {
                    if (!removedRounds) return 0;
                    // Вызовы маршала/судьи (alerts/<id>) живут по roundId:
                    // без этой чистки удалённый раунд оставляет в админке
                    // «вечные» вызовы на несуществующий раунд. Чистка —
                    // лучшим усилием: отказ правил на alerts не должен
                    // отменять уже выполненное удаление раундов.
                    return pestovoRemoveAlertsForRounds(ids).catch(function() { return 0; });
                }).then(function(removed) { out.alerts = removed || 0; return out; });
            });
        }).catch(function(err) {
            out.errors.push(err && err.message ? err.message : String(err));
            return out;
        });
    }

    return db.ref('rounds').orderByChild('tournamentId').equalTo(tnId).once('value').then(function(sn) {
        var rounds = (sn && sn.val()) || {};
        var ids = Object.keys(rounds);
        out.rounds = ids.length;
        if (!ids.length) return out;
        return Promise.all(ids.map(function(rid) {
            var rd = rounds[rid] || {};
            var needClose = rd.status !== 'completed';
            var patch = needClose
                ? { status: 'completed', completedAt: Date.now(), closedByTournamentFinish: true }
                : null;
            return (patch ? db.ref('rounds/' + rid).update(patch) : Promise.resolve())
                .then(function() {
                    if (patch) { rd.status = 'completed'; if (!rd.completedAt) rd.completedAt = Date.now(); }
                    // Идемпотентно: раунд, уже записанный в историю, повторно
                    // не удваивается.
                    return pestovoClaimRoundHistory(rid);
                })
                .then(function(claimed) {
                    if (!claimed) return false;
                    if (typeof saveHistory === 'function') { try { saveHistory(rid, rd); } catch (e) { console.warn("[silent]", e); } }
                    return true;
                })
                .catch(function() { return false; });
        })).then(function(res) {
            out.closed = res.filter(function(x) { return x; }).length;
            return out;
        });
    }).catch(function() { return out; });
}

// Все раунды турнира: и те, где записан tournamentId, и те, что пришли из
// протокола групп (у части старых записей tournamentId отсутствует).
function pestovoTournamentRoundIdsFull(tnId) {
    if (typeof db === 'undefined' || !db) return Promise.resolve([]);
    var found = {};
    return db.ref('protocols').once('value').catch(function() { return null; }).then(function(psn) {
        var protocols = (psn && psn.val()) || {};
        var protoIds = [];
        Object.keys(protocols).forEach(function(pid) {
            var p = protocols[pid];
            if (p && (p.tournamentId === tnId || p.tnId === tnId)) protoIds.push(pid);
        });
        return db.ref('rounds').orderByChild('tournamentId').equalTo(tnId).once('value').then(function(sn) {
            var rounds = (sn && sn.val()) || {};
            Object.keys(rounds).forEach(function(rid) { found[rid] = true; });
            if (!protoIds.length) return null;
            return Promise.all(protoIds.map(function(pid) {
                return db.ref('rounds').orderByChild('protocolId').equalTo(pid).once('value').then(function(s2) {
                    var rr = (s2 && s2.val()) || {};
                    Object.keys(rr).forEach(function(rid) { found[rid] = true; });
                }).catch(function() {});
            }));
        });
    }).then(function() { return Object.keys(found); }).catch(function() { return Object.keys(found); });
}

// Удаляет раунд из истории всех его игроков и пересчитывает статистику
// (roundsPlayed / bestGross / bestStableford) по оставшимся раундам.
// Аккаунты, у которых истории нет (гостевые id), не создаём.
function pestovoRemoveRoundFromPlayers(rid, players) {
    if (typeof db === 'undefined' || !db) return Promise.resolve(0);
    var pids = Object.keys(players || {});
    if (!pids.length) return Promise.resolve(0);
    var touched = 0;
    return Promise.all(pids.map(function(pid) {
        return db.ref('users/' + pid).once('value').then(function(sn) {
            var u = sn.val();
            if (!u || !u.history) return null;
            var hist = u.history;
            var updates = {};
            var remaining = [];
            var hit = false;
            Object.keys(hist).forEach(function(hk) {
                var item = hist[hk];
                if (!item) return;
                if (item.roundId === rid) { updates['users/' + pid + '/history/' + hk] = null; hit = true; }
                else remaining.push(item);
            });
            if (!hit) return null;
            var bestG = null, bestS = null;
            remaining.forEach(function(item) {
                if (item.holes === 18 && item.gross) {
                    if (bestG === null || item.gross < bestG) bestG = item.gross;
                }
                if (item.holes === 18 && item.stablefordField) {
                    if (bestS === null || item.stablefordField > bestS) bestS = item.stablefordField;
                }
            });
            touched++;
            updates['users/' + pid + '/roundsPlayed'] = remaining.length;
            updates['users/' + pid + '/bestGross'] = bestG;
            updates['users/' + pid + '/bestStableford'] = bestS;
            return db.ref().update(updates).catch(function() {});
        }).catch(function() { return null; });
    })).then(function() { return touched; });
}

// Убирает вызовы (alerts) удалённых раундов. Записи alerts/<id> привязаны к
// раунду полем roundId, поэтому после удаления раунда они повисают навсегда.
// Возвращает Promise<number> — сколько вызовов удалено.
function pestovoRemoveAlertsForRounds(roundIds) {
    if (typeof db === 'undefined' || !db || !roundIds || !roundIds.length) return Promise.resolve(0);
    var wanted = {};
    roundIds.forEach(function(rid) { wanted[String(rid)] = true; });
    return db.ref('alerts').once('value').catch(function() { return null; }).then(function(sn) {
        var alerts = (sn && sn.val()) || {};
        var updates = {};
        var n = 0;
        Object.keys(alerts).forEach(function(id) {
            var a = alerts[id];
            if (a && wanted[String(a.roundId)]) { updates['alerts/' + id] = null; n++; }
        });
        if (!n) return 0;
        return db.ref().update(updates).then(function() { return n; }).catch(function() { return 0; });
    });
}

// Публичная обёртка для кнопки «Завершить» в админке.
function pestovoPreserveTournamentRounds(tnId) {
    return pestovoFinalizeTournamentRounds(tnId, 'complete').then(function(res) { return res.closed; });
}

// Публичная обёртка для кнопки «Удалить»: раунды + их влияние на историю.
function pestovoDeleteTournamentRounds(tnId) {
    return pestovoFinalizeTournamentRounds(tnId, 'delete');
}

// Полный каскад удаления турнира: раунды (и их влияние на историю игроков) →
// протоколы групп → карточка турнира → маркеры. Возвращает Promise со сводкой
// { rounds, protocols, players, errors }, чтобы админ видел, что именно было
// удалено (и что не удалось удалить).
function pestovoDeleteTournamentCascade(tnId) {
    var summary = { rounds: 0, protocols: 0, players: 0, alerts: 0, errors: [], aborted: false };
    if (!tnId || typeof db === 'undefined' || !db) return Promise.resolve(summary);
    return pestovoDeleteTournamentRounds(tnId).then(function(res) {
        summary.errors = (res && res.errors) ? res.errors.slice() : [];
        if (summary.errors.length) {
            // Раунды удалить не удалось — карточку турнира и протоколы НЕ
            // трогаем: иначе получились бы «висячие» раунды без турнира
            // (ровно то, с чего начиналась эта ошибка). Админ видит причину
            // и может повторить после устранения.
            summary.aborted = true;
            summary.rounds = 0;
            summary.players = 0;
            return null;
        }
        summary.rounds = (res && res.rounds) || 0;
        summary.players = (res && res.players) || 0;
        summary.alerts = (res && res.alerts) || 0;
        return db.ref('protocols').once('value').catch(function() { return null; });
    }).then(function(sn) {
        if (summary.aborted) return summary;
        var protocols = (sn && sn.val()) || {};
        var updates = {};
        var n = 0;
        Object.keys(protocols).forEach(function(pid) {
            var p = protocols[pid];
            if (p && (p.tournamentId === tnId || p.tnId === tnId)) { updates['protocols/' + pid] = null; n++; }
        });
        summary.protocols = n;
        // Карточка турнира удаляется в ту же мульти-запись: если связь
        // оборвётся на середине, протоколы не останутся «висячими».
        updates['tournaments/' + tnId] = null;
        return db.ref().update(updates).catch(function(err) {
            summary.errors.push(err && err.message ? err.message : String(err));
        });
    }).then(function() { return summary; });
}

// Сколько чего уйдёт вместе с турниром: его раунды (включая привязанные
// только через протокол группы) и протоколы групп. Цифры показываем админу
// в диалоге подтверждения — удаление турнира всегда каскадное: раунды и их
// следы в истории игроков уходят вместе с карточкой турнира.
// Возвращает Promise<{ name, rounds, protocols }>.
function pestovoTournamentDeleteSummary(tnId) {
    var summary = { name: '', rounds: 0, protocols: 0 };
    if (!tnId || typeof db === 'undefined' || !db) return Promise.resolve(summary);
    return Promise.all([
        db.ref('tournaments/' + tnId).once('value').catch(function() { return null; }),
        pestovoTournamentRoundIdsFull(tnId).catch(function() { return []; }),
        db.ref('protocols').once('value').catch(function() { return null; })
    ]).then(function(res) {
        var t = (res[0] && res[0].val()) || {};
        summary.name = String(t.name || '');
        summary.rounds = (res[1] || []).length;
        var protocols = (res[2] && res[2].val()) || {};
        summary.protocols = Object.keys(protocols).filter(function(pid) {
            var p = protocols[pid];
            return !!p && (p.tournamentId === tnId || p.tnId === tnId);
        }).length;
        return summary;
    }).catch(function() { return summary; });
}

// ==========================================
// АВТОЗАВЕРШЕНИЕ ТУРНИРА: ВСЕ РАУНДЫ СЫГРАНЫ
// ==========================================
// Турнир помечается «завершённым» не только вручную (кнопка «Финиш» в
// админке), но и автоматически: как только у турнира появляется хотя бы
// один раунд и ВСЕ его раунды в статусе completed (все игроки ввели
// счета и завершили игру) — статус турнира переводится в completed.
// Это открывает карточку турнира для экспорта протокола (PDF).
// Возвращает Promise<boolean> — стал ли турнир завершённым именно сейчас.
var __pestovoTnAutoFinishInFlight = {};
// Турниры, по которым в этой вкладке уже принимали решение (завершён или
// уже был завершён): повторно читать базу на каждом снимке раундов не нужно.
var __pestovoTnAutoFinishDone = {};

// Статусы турнира, которые автозавершение НЕ трогает: завершённый/отменённый
// менять не нужно, а черновик не должен попадать в публичный каталог.
var TN_AUTO_FINISH_SKIP_STATUSES = ['completed', 'cancelled', 'draft'];

// Чистая функция: турниры, у которых есть хотя бы один раунд и ВСЕ раунды
// завершены. Проверяется автотестами и используется страховочным проходом
// по снимку раундов.
function tournamentsReadyToAutoFinish(roundsData) {
    var byTn = {};
    Object.keys(roundsData || {}).forEach(function(rid) {
        var r = roundsData[rid];
        if (!r || typeof r !== 'object') return;
        var tnId = r.tournamentId;
        if (!tnId) return;
        if (!byTn[tnId]) byTn[tnId] = { total: 0, completed: 0 };
        byTn[tnId].total++;
        if (String(r.status || '') === 'completed') byTn[tnId].completed++;
    });
    return Object.keys(byTn).filter(function(tnId) {
        return byTn[tnId].total > 0 && byTn[tnId].completed === byTn[tnId].total;
    });
}

// Страховочный проход: раунд мог быть закрыт другим способом (принудительно,
// админом, автозакрытием на следующий день, вторым устройством) — тогда вызова
// автозавершения могло не быть вовсе. Проверяем снимок раундов и доводим
// сыгранные турниры до статуса «завершён».
function pestovoAutoFinishTournamentsFromSnapshot(roundsData) {
    var ready = tournamentsReadyToAutoFinish(roundsData);
    if (!ready.length || typeof db === 'undefined' || !db) return Promise.resolve([]);
    return Promise.all(ready.map(function(tnId) {
        return pestovoAutoFinishTournament(tnId).then(function(changed) { return changed ? tnId : null; })
            .catch(function() { return null; });
    })).then(function(res) { return res.filter(function(x) { return !!x; }); });
}

function pestovoAutoFinishTournament(tnId) {
    if (!tnId || typeof db === 'undefined' || !db) return Promise.resolve(false);
    if (__pestovoTnAutoFinishDone[tnId]) return Promise.resolve(false);
    if (__pestovoTnAutoFinishInFlight[tnId]) return Promise.resolve(false);
    __pestovoTnAutoFinishInFlight[tnId] = true;
    var done = function(v){ delete __pestovoTnAutoFinishInFlight[tnId]; return v; };
    // Раунды турнира: и с tournamentId, и привязанные только через протокол
    // группы (у части старых записей tournamentId отсутствует).
    return Promise.all([
        db.ref('rounds').once('value').catch(function() { return null; }),
        (typeof pestovoTournamentRoundIdsFull === 'function'
            ? pestovoTournamentRoundIdsFull(tnId).catch(function() { return []; })
            : Promise.resolve([])),
        db.ref('tournaments/' + tnId).once('value').catch(function() { return null; })
    ]).then(function(res) {
        var all = (res[0] && res[0].val && res[0].val()) || {};
        var extraIds = res[1] || [];
        var tournament = (res[2] && res[2].val && res[2].val()) || null;
        var rounds = {};
        Object.keys(all).forEach(function(rid) {
            var r = all[rid];
            if (r && typeof r === 'object' && String(r.tournamentId || '') === String(tnId)) rounds[rid] = r;
        });
        extraIds.forEach(function(rid) { if (all[rid] && !rounds[rid]) rounds[rid] = all[rid]; });

        var ids = Object.keys(rounds);
        if (!ids.length) return done(false);
        var allDone = ids.every(function(rid) { return String(rounds[rid].status || '') === 'completed'; });
        if (!allDone) return done(false);

        // Завершаем турнир независимо от того, успел ли он получить статус
        // «active»: раунды могли открыться по времени старта, пока карточка
        // турнира ещё «предстоящая». Не трогаем только завершённые/отменённые
        // турниры и черновики.
        var st = String((tournament && tournament.status) || (tournament && tournament.lifecycleStatus) || '');
        // Карточки турнира нет (удалён, а раунды остались) — создавать
        // пустой узел tournaments/<id> нельзя.
        if (!tournament) {
            __pestovoTnAutoFinishDone[tnId] = true;
            return done(false);
        }
        if (TN_AUTO_FINISH_SKIP_STATUSES.indexOf(st) !== -1) {
            __pestovoTnAutoFinishDone[tnId] = true;
            return done(false);
        }
        return db.ref('tournaments/' + tnId).update({
            status: 'completed',
            // Публичный каталог v2 читает lifecycleStatus: без него карточка
            // сыгранного турнира оставалась во вкладке «Предстоящие».
            lifecycleStatus: 'completed',
            finishedAt: Date.now(),
            finishedAutomatically: true,
            finishedFrom: st || 'unknown',
            roundsCompleted: ids.length
        }).then(function() {
            __pestovoTnAutoFinishDone[tnId] = true;
            // Уведомление о завершении и о доступном протоколе — ТОЛЬКО
            // администратору: игроки не должны видеть служебное сообщение
            // о протоколе завершения (он нужен судейской коллегии).
            try {
                var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
                if (pestovoIsAdminViewer() && typeof toast === 'function') toast(isEn
                    ? '🏁 All rounds completed — the tournament is finished automatically. The results protocol (PDF) is now available.'
                    : '🏁 Все раунды завершены — турнир завершён автоматически. Протокол результатов (PDF) теперь доступен.', 'success');
            } catch (e) { console.warn("[silent]", e); }
            return done(true);
        }).catch(function() { return done(false); });
    }).catch(function() { return done(false); });
}

// Бейдж статуса завершённого раунда:
//  — принудительное/досрочное завершение: «Досрочно завершён» + причина;
//  — авто-завершение: «Завершён автоматически»;
//  — обычное завершение: имя игрока, который завершил раунд;
//  — старые записи без данных о завершении: просто «Завершён».
function buildRoundCompletedBadgeHTML(r) {
    var isEn = (typeof currentLang !== 'undefined') && currentLang === 'en';
    if (r && r.forcedFinish) {
        var reasonText = r.forcedReason ? (' · ' + escapeHtml(r.forcedReason)) : '';
        return '<span class="tn-status tn-f" title="' + (isEn ? 'Force finished' : 'Досрочно завершён') + reasonText + '"><i class="fas fa-flag-checkered"></i> ' + (isEn ? 'Early finish' : 'Досрочно') + reasonText + '</span>';
    }
    if (r && r.autoCompleted) {
        return '<span class="tn-status tn-auto" title="' + (isEn ? 'The round was closed automatically the next day' : 'Раунд закрыт автоматически на следующий день') + '"><i class="fas fa-clock-rotate-left"></i> ' + (isEn ? 'Auto-completed' : 'Завершён автоматически') + '</span>';
    }
    var who = r && r.completedByName ? String(r.completedByName).trim() : '';
    if (who) {
        var shown = escapeHtml(who);
        return '<span class="tn-status tn-d"><i class="fas fa-user-check"></i> ' + (isEn ? 'Completed by ' : 'Завершил(а) · ') + shown + '</span>';
    }
    return '<span class="tn-status tn-d">' + (isEn ? 'Completed' : 'Завершён') + '</span>';
}

// Единый генератор бейджа статуса любого раунда:
//  - на паузе: оранжевый бейдж ⏸ Пауза
//  - запланирован: песочные часы ⏳
//  - завершён: бейдж завершения
//  - активный: 🟢 Live
function buildRoundStatusBadgeHTML(r) {
    var isEn = (typeof currentLang !== 'undefined') && currentLang === 'en';
    if (!r) return '';
    if (r.paused) {
        var pReason = r.pauseReason ? (' · ' + escapeHtml(r.pauseReason)) : '';
        return '<span class="tn-status tn-p" title="' + (isEn ? 'Round paused' : 'Раунд на паузе') + pReason + '"><i class="fas fa-pause"></i> ' + (isEn ? 'Paused' : 'На паузе') + '</span>';
    }
    var st = String(r.status || 'active');
    if (st === 'scheduled') {
        return '<span class="tn-status tn-u"><i class="fas fa-hourglass-half"></i> ' + (isEn ? 'Scheduled' : 'Запланирован') + '</span>';
    }
    if (st === 'completed') {
        return buildRoundCompletedBadgeHTML(r);
    }
    return '<span class="tn-status tn-a"><span class="live-dot" style="width:6px;height:6px;"></span> LIVE</span>';
}


// ==========================================
// ГЛОБАЛЬНЫЕ ВАРИАНТЫ ОТОБРАЖЕНИЯ СТРАНИЦ
// ==========================================
// Администратор выбирает оформление один раз для всего клуба. Значение
// дублируется в localStorage только как офлайн-резерв, а Firebase остаётся
// источником истины для новых устройств. Вариант 1 — текущий вид страниц.
var PAGE_DISPLAY_VARIANTS = ['1', '2', '3'];
// У некоторых страниц вариантов больше базовых трёх. Страница «Турниры»
// поддерживает 5 оформлений (выбирает только администратор — вкладка
// «Турниры: вид» в админ-панели), настройка применяется для всех.
var PAGE_DISPLAY_VARIANT_SETS = {
    tournaments: ['1', '2', '3', '4', '5']
};
// Какие варианты доступны конкретной странице.
function pageDisplayVariantKeys(page) {
    return PAGE_DISPLAY_VARIANT_SETS[page] || PAGE_DISPLAY_VARIANTS;
}
var PAGE_DISPLAY_VARIANT_CONFIG = {
    home: { storage: 'pestovo_home_display_variant', firebase: 'settings/home_display_variant' },
    players: { storage: 'pestovo_players_display_variant', firebase: 'settings/players_display_variant' },
    stats: { storage: 'pestovo_stats_display_variant', firebase: 'settings/stats_display_variant' },
    rounds: { storage: 'pestovo_all_rounds_display_variant', firebase: 'settings/all_rounds_display_variant' },
    tournaments: { storage: 'pestovo_tournaments_display_variant', firebase: 'settings/tournaments_display_variant' },
    handicap: { storage: 'pestovo_handicap_display_variant', firebase: 'settings/handicap_display_variant' }
};

var pestovoPageDisplayVariants = (function() {
    var state = {};
    Object.keys(PAGE_DISPLAY_VARIANT_CONFIG).forEach(function(page) {
        var cfg = PAGE_DISPLAY_VARIANT_CONFIG[page];
        var value = '';
        try { value = localStorage.getItem(cfg.storage) || ''; } catch (e) { console.warn("[silent]", e); }
        state[page] = pageDisplayVariantKeys(page).indexOf(String(value)) !== -1 ? String(value) : '1';
    });
    return state;
})();

function normalizePageDisplayVariant(page, value) {
    return pageDisplayVariantKeys(page).indexOf(String(value === undefined || value === null ? '' : value)) !== -1
        ? String(value) : '1';
}

function getPageDisplayVariant(page) {
    return PAGE_DISPLAY_VARIANT_CONFIG[page] ? (pestovoPageDisplayVariants[page] || '1') : '1';
}

function applyPageDisplayVariant(page, value) {
    if (!PAGE_DISPLAY_VARIANT_CONFIG[page]) return '1';
    var variant = normalizePageDisplayVariant(page, value);
    pestovoPageDisplayVariants[page] = variant;
    try { localStorage.setItem(PAGE_DISPLAY_VARIANT_CONFIG[page].storage, variant); } catch (e) { console.warn("[silent]", e); }
    syncPageDisplayBodyClasses();

    // Перерисовка выполняется только если соответствующая страница открыта.
    // Это позволяет менять оформление в админке без перезагрузки вкладки.
    try {
        if (page === 'players' && typeof loadPlayers === 'function' && document.getElementById('players-grid')) loadPlayers();
        if (page === 'stats' && typeof loadStats === 'function' && document.getElementById('general-stats')) loadStats();
        if (page === 'rounds' && typeof loadLB === 'function' && document.getElementById('lb-container')) loadLB();
        // Страница «Турниры»: каталог/карточку турнира перерисовываем, чтобы
        // новый вариант был виден сразу (без перезагрузки вкладки). Узел
        // «tn-public-catalog» есть только на tournaments.html — в админке
        // (там свой список #tn-list) ничего не перерисовываем.
        if (page === 'tournaments' && document.getElementById('tn-public-catalog')) {
            if (typeof tnPublicRender === 'function') tnPublicRender();
            else if (typeof tnRenderList === 'function') tnRenderList();
        }
    } catch (e) { console.warn("[silent]", e); }
    try {
        if (typeof markAdmPageDisplayVariantButtons === 'function') markAdmPageDisplayVariantButtons(page);
    } catch (e) { console.warn("[silent]", e); }
    return variant;
}

// Синхронизирует CSS-классы вида «pd-<страница>-v2/v3» на <body>.
// Варианты большинства страниц реализованы чисто на CSS, поэтому переключение
// класса мгновенно меняет оформление без перерендера данных. Вариант «1»
// сохраняет исходный вид (классов нет).
function syncPageDisplayBodyClasses() {
    if (typeof document === 'undefined' || !document.body) return;
    try {
        Object.keys(PAGE_DISPLAY_VARIANT_CONFIG).forEach(function(page) {
            var cur = getPageDisplayVariant(page);
            // Вариант «1» — исходный вид страницы, классов не добавляем.
            pageDisplayVariantKeys(page).slice(1).forEach(function(v) {
                document.body.classList.toggle('pd-' + page + '-v' + v, cur === v);
            });
        });
    } catch (e) { console.warn("[silent]", e); }
}
function getPlayersDisplayVariant() { return getPageDisplayVariant('players'); }
function getStatsDisplayVariant() { return getPageDisplayVariant('stats'); }
function getAllRoundsDisplayVariant() { return getPageDisplayVariant('rounds'); }
var SOCIAL_CARD_VARIANTS = ['1', '2', '3'];

function normalizeSocialCardVariant(value) {
    value = String(value === undefined || value === null ? '' : value);
    return SOCIAL_CARD_VARIANTS.indexOf(value) !== -1 ? value : '1';
}

var pestovoSocialCardVariant = (function() {
    try { return normalizeSocialCardVariant(localStorage.getItem('pestovo_social_card_variant')); } catch (e) { console.warn("[silent]", e); }
    return '1';
})();

function getSocialCardVariant() {
    return pestovoSocialCardVariant;
}

function applySocialCardVariant(value) {
    var variant = normalizeSocialCardVariant(value);
    pestovoSocialCardVariant = variant;
    try { localStorage.setItem('pestovo_social_card_variant', variant); } catch (e) { console.warn("[silent]", e); }
    try {
        if (typeof markAdmSocialCardVariantButtons === 'function') markAdmSocialCardVariantButtons();
    } catch (e) { console.warn("[silent]", e); }
    return variant;
}

// ==========================================
// ОТОБРАЖЕНИЕ КАРТОЧКИ ГРУППОВОГО РАУНДА
// ==========================================
// Стиль единой карточки группового раунда на главной странице.
// Варианты: '1' - Сводная матрица, '2' - Сравнительная таблица, '3' - Лидерборд флайта
var GROUP_CARD_VARIANTS = ['1', '2', '3'];

function normalizeGroupCardVariant(value) {
    value = String(value === undefined || value === null ? '' : value);
    return GROUP_CARD_VARIANTS.indexOf(value) !== -1 ? value : '1';
}

var pestovoGroupCardVariant = (function() {
    try { return normalizeGroupCardVariant(localStorage.getItem('pestovo_group_card_variant')); } catch (e) { console.warn("[silent]", e); }
    return '1';
})();

function getGroupCardVariant() {
    return pestovoGroupCardVariant;
}

function applyGroupCardVariant(value) {
    var variant = normalizeGroupCardVariant(value);
    pestovoGroupCardVariant = variant;
    try { localStorage.setItem('pestovo_group_card_variant', variant); } catch (e) { console.warn("[silent]", e); }
    try {
        if (typeof markAdmGroupCardVariantButtons === 'function') markAdmGroupCardVariantButtons();
    } catch (e) { console.warn("[silent]", e); }
    try {
        if (typeof loadLiveRounds === 'function') loadLiveRounds();
        if (typeof loadRecentResults === 'function') loadRecentResults();
    } catch (e) { console.warn("[silent]", e); }
    return variant;
}

// ==========================================
// СЧЁТНАЯ КАРТОЧКА ИГРОКА В ЛИДЕРБОРДЕ ТУРНИРА
// ==========================================
// На странице «Турниры» клик по игроку в лидерборде открывает его счётную
// карточку. Оформление выбирает администратор для всего клуба
// (админ-панель → «Данные»): 1 · Официальный бланк, 2 · Плитки лунок,
// 3 · Турнирная сводка. Хранится в settings/tn_scorecard_variant.
var TN_CARD_VARIANTS = ['1', '2', '3'];

function normalizeTnCardVariant(value) {
    value = String(value === undefined || value === null ? '' : value);
    return TN_CARD_VARIANTS.indexOf(value) !== -1 ? value : '1';
}

var pestovoTnCardVariant = (function() {
    try { return normalizeTnCardVariant(localStorage.getItem('pestovo_tn_scorecard_variant')); } catch (e) { console.warn("[silent]", e); }
    return '1';
})();

function getTnCardVariant() {
    return pestovoTnCardVariant;
}

function applyTnCardVariant(value) {
    var variant = normalizeTnCardVariant(value);
    pestovoTnCardVariant = variant;
    try { localStorage.setItem('pestovo_tn_scorecard_variant', variant); } catch (e) { console.warn("[silent]", e); }
    try {
        if (typeof markAdmTnCardVariantButtons === 'function') markAdmTnCardVariantButtons();
    } catch (e) { console.warn("[silent]", e); }
    // Открытая карточка/лидерборд перерисовываются сразу — админ видит
    // результат без перезагрузки страницы.
    try {
        if (typeof tnScRerender === 'function') tnScRerender();
        if (typeof rerenderOpenTnLeaderboards === 'function') rerenderOpenTnLeaderboards();
    } catch (e) { console.warn("[silent]", e); }
    return variant;
}

// ==========================================
// ЛИДЕРБОРД ТУРНИРА — 5 вариантов (требование #7)
// ==========================================
// На странице «Турниры» live-лидерборд турнира может отображаться 5 способами.
// Выбор делает только админ (админ-панель → «Данные» → вид лидерборда турнира),
// хранится в settings/tournament_leaderboard_variant, применяется для всех.
var TN_LB_VARIANTS = ['1', '2', '3', '4', '5'];

function normalizeTnLbVariant(value) {
    value = String(value === undefined || value === null ? '' : value);
    return TN_LB_VARIANTS.indexOf(value) !== -1 ? value : '1';
}

var pestovoTnLbVariant = (function() {
    try { return normalizeTnLbVariant(localStorage.getItem('pestovo_tn_lb_variant')); } catch (e) { console.warn("[silent]", e); }
    return '1';
})();

function getTnLbVariant() {
    return pestovoTnLbVariant;
}

function applyTnLbVariant(value) {
    var variant = normalizeTnLbVariant(value);
    pestovoTnLbVariant = variant;
    try { localStorage.setItem('pestovo_tn_lb_variant', variant); } catch (e) { console.warn("[silent]", e); }
    try {
        if (typeof markAdmTnLbVariantButtons === 'function') markAdmTnLbVariantButtons();
    } catch (e) { console.warn("[silent]", e); }
    try {
        if (typeof rerenderOpenTnLeaderboards === 'function') rerenderOpenTnLeaderboards();
    } catch (e) { console.warn("[silent]", e); }
    return variant;
}

// ==========================================
// ГРУППЫ НА СТРАНИЦЕ ТУРНИРОВ (вкл/выкл для всех)
// ==========================================
// По умолчанию дивизионы/гандикапные группы игрокам НЕ показываются:
// на активном турнире сразу открывается лидерборд. Включает только админ
// (settings/tn_groups_visible).
// По умолчанию группы видны (поведение до появления настройки);
// админ может полностью скрыть их переключателем (хранится '0').
var pestovoTnGroupsVisible = true;
try {
    var pestovoTnGroupsStored = localStorage.getItem('pestovo_tn_groups_visible');
    if (pestovoTnGroupsStored !== null) pestovoTnGroupsVisible = pestovoTnGroupsStored === '1';
} catch (e) { console.warn("[silent]", e); }

function getTnGroupsVisible() { return !!pestovoTnGroupsVisible; }
function applyTnGroupsVisible(v) {
    pestovoTnGroupsVisible = (v === true || v === '1' || v === 1);
    try { localStorage.setItem('pestovo_tn_groups_visible', pestovoTnGroupsVisible ? '1' : '0'); } catch (e) { console.warn("[silent]", e); }
    try { if (typeof markAdmTnGroupsVisible === 'function') markAdmTnGroupsVisible(); } catch (e) { console.warn("[silent]", e); }
    try { if (typeof tnRenderList === 'function') tnRenderList(); } catch (e) { console.warn("[silent]", e); }
    try { if (typeof rerenderOpenTnLeaderboards === 'function') rerenderOpenTnLeaderboards(); } catch (e) { console.warn("[silent]", e); }
    return pestovoTnGroupsVisible;
}

// ==========================================
// 4 ВАРИАНТА СПИСКА УЧАСТНИКОВ/ГРУПП (settings/tn_roster_variant)
// ==========================================
var TN_ROSTER_VARIANTS = ['1', '2', '3', '4'];
function normalizeTnRosterVariant(v) {
    v = String(v === undefined || v === null ? '' : v);
    return TN_ROSTER_VARIANTS.indexOf(v) !== -1 ? v : '1';
}
var pestovoTnRosterVariant = '1';
try { pestovoTnRosterVariant = normalizeTnRosterVariant(localStorage.getItem('pestovo_tn_roster_variant')); } catch (e) { console.warn("[silent]", e); }
function getTnRosterVariant() { return pestovoTnRosterVariant; }
function applyTnRosterVariant(v) {
    pestovoTnRosterVariant = normalizeTnRosterVariant(v);
    try { localStorage.setItem('pestovo_tn_roster_variant', pestovoTnRosterVariant); } catch (e) { console.warn("[silent]", e); }
    try { if (typeof markAdmTnRosterVariantButtons === 'function') markAdmTnRosterVariantButtons(); } catch (e) { console.warn("[silent]", e); }
    try { if (typeof tnRenderList === 'function') tnRenderList(); } catch (e) { console.warn("[silent]", e); }
    return pestovoTnRosterVariant;
}

// ==========================================
// РАЗДЕЛЕНИЕ ЛИДЕРБОРДА ТУРНИРА ПО ПОЛУ (3 вида, выбирает админ)
// ============================================================
// Вид 1 — Смешанный: все игроки в одной таблице (как раньше).
// Вид 2 — По полу (вкладки): «Все · Мужчины · Девушки», места считаются
//         отдельно внутри каждого пола.
// Вид 3 — Раздельные таблицы: отдельные лидерборды «Мужчины» и «Девушки»
//         рядом, места в каждом считаются независимо.
// Настройка: settings/tn_gender_split, применяется для всех.
var TN_GENDER_SPLIT_VARIANTS = ['1', '2', '3'];
function normalizeTnGenderSplit(v) {
    v = String(v === undefined || v === null ? '' : v);
    return TN_GENDER_SPLIT_VARIANTS.indexOf(v) !== -1 ? v : '1';
}
var pestovoTnGenderSplit = '1';
try { pestovoTnGenderSplit = normalizeTnGenderSplit(localStorage.getItem('pestovo_tn_gender_split')); } catch (e) { console.warn("[silent]", e); }
function getTnGenderSplit() { return pestovoTnGenderSplit; }
function applyTnGenderSplit(v) {
    pestovoTnGenderSplit = normalizeTnGenderSplit(v);
    try { localStorage.setItem('pestovo_tn_gender_split', pestovoTnGenderSplit); } catch (e) { console.warn("[silent]", e); }
    try { if (typeof markAdmTnGenderSplitButtons === 'function') markAdmTnGenderSplitButtons(); } catch (e) { console.warn("[silent]", e); }
    try { if (typeof rerenderOpenTnLeaderboards === 'function') rerenderOpenTnLeaderboards(); } catch (e) { console.warn("[silent]", e); }
    return pestovoTnGenderSplit;
}

// Нормализация пола участника (один на весь сайт): 'men' | 'women'.
// Старые записи могли содержать 'f'/'female'/'жен' и т.п.
function pestovoNormGender(g) {
    var s = String(g == null ? '' : g).toLowerCase();
    if (s === 'w' || s === 'f' || s === 'women' || s === 'woman' || s === 'female' || s.indexOf('жен') === 0 || s.indexOf('дев') === 0) return 'women';
    return 'men';
}

// Сортировка списка участников ПО ГАНДИКАПУ (по умолчанию, вместо алфавита):
// меньший гандикап выше (как в гольф-таблицах), без гандикапа — в конце,
// затем по имени. Работает со строками { rp, effHcp } (список участников)
// и с записями лидерборда (hcpRaw/hcpPlayed + effHcp).
function tnHcpSortValue(en2) {
    var v = null;
    if (en2 && en2.effHcp != null && en2.effHcp !== '') v = en2.effHcp;
    if (v == null && en2 && en2.rp && en2.rp.handicap != null && en2.rp.handicap !== '') v = en2.rp.handicap;
    if (v == null && en2 && en2.hcpPlayed != null && en2.hcpPlayed !== '') v = en2.hcpPlayed;
    if (v == null && en2 && en2.hcpRaw != null && en2.hcpRaw !== '') v = en2.hcpRaw;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
}
function tnSortByHandicap(list) {
    (list || []).sort(function(a, b) {
        var ha = tnHcpSortValue(a), hb = tnHcpSortValue(b);
        if (ha === null && hb === null) return String(a.name || '').localeCompare(String(b.name || ''));
        if (ha === null) return 1;
        if (hb === null) return -1;
        if (ha !== hb) return ha - hb;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return list;
}

// ─────────────────────────────────────────────────────────
// АДМИНСКИЕ ВИДЫ ОТОБРАЖЕНИЯ (5 вариантов, выбирает только админ)
//   homeTournament — блок «Активный турнир» на главной;
//   scorecard      — счётная карточка по лункам во время раунда;
//   scoring        — страница ввода счёта (одиночный и групповой раунд);
//   roundSetup     — блок «Создание раунда» (единая форма: 1 игрок или
//                    группа, кнопка «Добавить игрока», 5 видов).
// Хранение: settings/<key> в Firebase + кэш в localStorage, применяется
// для ВСЕХ пользователей (читается при загрузке страницы).
// ─────────────────────────────────────────────────────────
var PESTOVO_VIEW5_KEYS = ['1', '2', '3', '4', '5'];
var PESTOVO_VIEW5_CONFIG = {
    homeTournament: { storage: 'pestovo_home_tournament_view', firebase: 'settings/home_tournament_view' },
    scorecard:      { storage: 'pestovo_scorecard_view',       firebase: 'settings/scorecard_view' },
    scoring:        { storage: 'pestovo_scoring_view',         firebase: 'settings/scoring_view' },
    roundsetup:     { storage: 'pestovo_round_setup_view',     firebase: 'settings/round_setup_view' }
};

function normalizeView5(value) {
    value = String(value === undefined || value === null ? '' : value);
    return PESTOVO_VIEW5_KEYS.indexOf(value) !== -1 ? value : '1';
}

var pestovoView5State = (function() {
    var st = {};
    Object.keys(PESTOVO_VIEW5_CONFIG).forEach(function(k) {
        var v = '';
        try { v = localStorage.getItem(PESTOVO_VIEW5_CONFIG[k].storage) || ''; } catch (e) { console.warn("[silent]", e); }
        st[k] = normalizeView5(v);
    });
    return st;
})();

function getView5(name) {
    return PESTOVO_VIEW5_CONFIG[name] ? (pestovoView5State[name] || '1') : '1';
}

function applyView5(name, value) {
    if (!PESTOVO_VIEW5_CONFIG[name]) return '1';
    var v = normalizeView5(value);
    pestovoView5State[name] = v;
    if (name === 'scorecard' && typeof document !== 'undefined' && document.querySelectorAll) {
        document.querySelectorAll('.club-sc:not([data-sc-preview])').forEach(function(el) { el.setAttribute('data-sc-view', v); });
    }
    if (name === 'scoring') syncScoreEntryLayouts();
    try { localStorage.setItem(PESTOVO_VIEW5_CONFIG[name].storage, v); } catch (e) { console.warn("[silent]", e); }
    try { syncView5BodyClasses(); } catch (e) { console.warn("[silent]", e); }
    try { if (typeof markAdmView5Buttons === 'function') markAdmView5Buttons(name); } catch (e) { console.warn("[silent]", e); }
    return v;
}

// CSS-классы на <body>: st-scoring-v2 … st-scorecard-v5 — варианты
// оформления применяются мгновенно, без перезагрузки страницы.
function syncView5BodyClasses() {
    if (typeof document === 'undefined' || !document.body) return;
    try {
        Object.keys(PESTOVO_VIEW5_CONFIG).forEach(function(name) {
            var cur = getView5(name);
            PESTOVO_VIEW5_KEYS.forEach(function(v) {
                if (v === '1') return;
                document.body.classList.toggle('st-' + name + '-v' + v, cur === v);
            });
        });
    } catch (e) { console.warn("[silent]", e); }
}

// Живая подписка на значение из Firebase: вызывается страницами при старте.
// cb вызывается и когда настройки нет (значение по умолчанию «1»).
function pestovoBindView5(name, cb) {
    var cfg = PESTOVO_VIEW5_CONFIG[name];
    if (!cfg) return;
    var fire = function(val) { try { cb(applyView5(name, val)); } catch (e) { console.warn("[silent]", e); } };
    if (typeof db === 'undefined' || !db) { fire(null); return; }
    if (typeof bindRealtimeValue === 'function') {
        bindRealtimeValue('view5-' + name, db.ref(cfg.firebase), function(sn) { fire(sn.val()); });
    } else {
        db.ref(cfg.firebase).once('value').then(function(sn) { fire(sn.val()); }).catch(function() { fire(null); });
    }
}

function getHomeTournamentView() { return getView5('homeTournament'); }
function getRoundScorecardView() { return getView5('scorecard'); }
function getScoringView() { return getView5('scoring'); }
function getRoundSetupView() { return getView5('roundsetup'); }

if (typeof window !== 'undefined') {
    window.uiConfirm = uiConfirm;
    window.copyOrShare = copyOrShare;
    window.getView5 = getView5;
    window.applyView5 = applyView5;
    window.normalizeView5 = normalizeView5;
    window.pestovoBindView5 = pestovoBindView5;
    window.syncView5BodyClasses = syncView5BodyClasses;
    window.getHomeTournamentView = getHomeTournamentView;
    window.getRoundScorecardView = getRoundScorecardView;
    window.getScoringView = getScoringView;
    window.getRoundSetupView = getRoundSetupView;
}

// QR-картинка с цепочкой провайдеров (основной → запасной → повтор):
// внешний сервис иногда отдаёт таймаут — тогда код автоматически
// перегружается с другого провайдера, «пустых» QR у игроков не остаётся.
function pestovoQrImgHtml(data, size, cls) {
    size = size || 200;
    var urls = [
        'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=2&data=' + encodeURIComponent(data),
        'https://quickchart.io/qr?size=' + size + '&margin=1&text=' + encodeURIComponent(data),
        'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&margin=2&color=111111&bgcolor=ffffff&data=' + encodeURIComponent(data)
    ];
    return '<img src="' + urls[0] + '" data-qr-src="' + encodeURIComponent(data) + '" data-qr-try="0"' +
        (cls ? ' class="' + cls + '"' : '') + ' alt="QR" loading="eager" decoding="async"' +
        ' onload="pestovoQrImgOk(this)" onerror="pestovoQrImgFail(this)">';
}
function pestovoQrImgOk(img) {
    try { img.setAttribute('data-qr-done', '1'); } catch (e) { console.warn("[silent]", e); }
}
function pestovoQrImgFail(img) {
    var n = 0;
    try { n = parseInt(img.getAttribute('data-qr-try') || '0', 10) || 0; } catch (e) { console.warn("[silent]", e); }
    var data = '';
    try { data = decodeURIComponent(img.getAttribute('data-qr-src') || ''); } catch (e) { console.warn("[silent]", e); }
    var urls = [
        'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=2&data=' + encodeURIComponent(data),
        'https://quickchart.io/qr?size=200&margin=1&text=' + encodeURIComponent(data),
        'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=2&color=111111&bgcolor=ffffff&data=' + encodeURIComponent(data)
    ];
    if (data && n + 1 < urls.length) {
        try {
            img.setAttribute('data-qr-try', String(n + 1));
            img.src = urls[n + 1];
        } catch (e) { console.warn("[silent]", e); }
    }
}
if (typeof window !== 'undefined') {
    window.pestovoQrImgHtml = pestovoQrImgHtml;
    window.pestovoQrImgOk = pestovoQrImgOk;
    window.pestovoQrImgFail = pestovoQrImgFail;
}

// Предзагрузка QR-картинок в кэш браузера: вызывается сразу после создания
// группового раунда, чтобы коды были готовы к сканированию мгновенно.
function pestovoPrewarmQrImages(urls) {
    (urls || []).forEach(function(u) {
        try {
            var im = new Image();
            im.onload = function() {};
            im.onerror = function() {};
            im.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=2&data=' + encodeURIComponent(u);
        } catch (e) { console.warn("[silent]", e); }
    });
}
if (typeof window !== 'undefined') window.pestovoPrewarmQrImages = pestovoPrewarmQrImages;

// Логотип нужен только как обычный элемент шапки — фон PNG намеренно остаётся
// чистым, без водяного знака.
var pestovoCardLogoImg = null;
var pestovoCardLogoLoaded = false;
function loadPestovoCardLogo() {
    return new Promise(function(resolve) {
        if (pestovoCardLogoLoaded) { resolve(pestovoCardLogoImg); return; }
        try {
            var img = new Image();
            img.onload = function() {
                pestovoCardLogoImg = img;
                pestovoCardLogoLoaded = true;
                resolve(img);
            };
            img.onerror = function() {
                pestovoCardLogoLoaded = true;
                pestovoCardLogoImg = null;
                resolve(null);
            };
            img.src = baseUrl() + 'img/logo.png';
        } catch (e) {
            pestovoCardLogoLoaded = true;
            resolve(null);
        }
    });
}

function drawSocialCardFrame(ctx, variant) {
    // Чистый фон без логотипа: это сохраняет контраст счёта и делает карточку
    // аккуратной в лентах соцсетей.
    var bgGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
    bgGrad.addColorStop(0, variant === '2' ? '#152e1a' : '#0b1a0e');
    bgGrad.addColorStop(0.5, '#132817');
    bgGrad.addColorStop(1, '#071209');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 8;
    ctx.strokeRect(30, 30, 1020, 1020);
    ctx.strokeStyle = 'rgba(201,168,76,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, 996, 996);
}

function drawCardForegroundLogo(ctx, img, cx, cy, maxW, maxH) {
    if (!img || !img.width || !img.height) return;
    var scale = Math.min(maxW / img.width, maxH / img.height);
    var w = img.width * scale;
    var h = img.height * scale;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
}

function drawFittedCanvasText(ctx, text, x, y, maxWidth, size, minSize, fontFamily) {
    text = String(text === undefined || text === null ? '' : text);
    var currentSize = size;
    var family = fontFamily || '"Inter", sans-serif';
    ctx.font = 'bold ' + currentSize + 'px ' + family;
    while (currentSize > minSize && ctx.measureText(text).width > maxWidth) {
        currentSize -= 2;
        ctx.font = 'bold ' + currentSize + 'px ' + family;
    }
    if (ctx.measureText(text).width > maxWidth) {
        while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) {
            text = text.slice(0, -1);
        }
        text += '…';
    }
    ctx.fillText(text, x, y);
}

function drawSocialCardHeader(ctx, data, cfg) {
    cfg = cfg || {};
    var isEn = typeof currentLang !== 'undefined' && currentLang === 'en';
    var label = cfg.label || (isEn ? 'LIVE SCORECARD' : 'СЧЁТНАЯ КАРТОЧКА');
    var meta = data.format + ' · ' + (isEn ? 'TEE' : 'ТИ') + ': ' + data.teeName + ' · HCP: ' + data.hcp;

    // Небольшой логотип расположен непосредственно над именем, а не в фоне.
    drawCardForegroundLogo(ctx, data.logoImg, 540, cfg.logoY || 142, 165, 110);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#c9a84c';
    ctx.font = '700 17px "Inter", sans-serif';
    ctx.fillText(label, 540, cfg.labelY || 78);

    var dividerY = cfg.dividerY || 222;
    ctx.beginPath();
    ctx.moveTo(250, dividerY);
    ctx.lineTo(830, dividerY);
    ctx.strokeStyle = 'rgba(201,168,76,0.78)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Имя начинается заметно ниже, чем в прежней карточке: под знаком клуба.
    ctx.fillStyle = '#ffffff';
    drawFittedCanvasText(ctx, data.playerName, 540, cfg.nameY || 286, 880, 48, 30, '"Playfair Display", Georgia, serif');

    ctx.fillStyle = '#c9a84c';
    ctx.font = '600 18px "Inter", sans-serif';
    drawFittedCanvasText(ctx, meta, 540, cfg.metaY || 324, 900, 18, 13, '"Inter", sans-serif');

    ctx.fillStyle = '#9eb5a5';
    ctx.font = '500 16px "Inter", sans-serif';
    ctx.fillText(data.date, 540, cfg.dateY || 350);
}

function drawSocialCardTotalBar(ctx, outGross, inGross, totalGross, y) {
    y = y || 870;
    ctx.fillStyle = '#101f13';
    ctx.fillRect(60, y, 960, 50);
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 1;
    ctx.strokeRect(60, y, 960, 50);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 18px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OUT: ' + (outGross || '—') + '   ·   IN: ' + (inGross || '—') + '   ·   TOTAL 18: ' + (totalGross || '—'), 540, y + 32);
}

function drawSocialCardFooter(ctx, variant) {
    ctx.textAlign = 'center';
    ctx.fillStyle = variant === '2' ? 'rgba(201,168,76,0.88)' : 'rgba(201,168,76,0.65)';
    ctx.font = '600 17px "Inter", sans-serif';
    ctx.fillText('GOLF CLUB PESTOVO · LIVE SCORING', 540, 996);
}

function drawSocialCardResultHero(ctx, stats) {
    ctx.fillStyle = '#132218';
    ctx.strokeStyle = '#c9a84c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(60, 376, 960, 142, 16);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#9eb5a5';
    ctx.font = '700 15px "Inter", sans-serif';
    ctx.fillText('GROSS', 240, 416);
    ctx.fillText('STABLEFORD', 840, 416);
    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 42px "Inter", sans-serif';
    ctx.fillText(String(stats.gross || 0), 240, 470);
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(String(stats.stablefordField || 0), 840, 470);

    ctx.strokeStyle = 'rgba(201,168,76,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(380, 400);
    ctx.lineTo(380, 494);
    ctx.moveTo(700, 400);
    ctx.lineTo(700, 494);
    ctx.stroke();

    ctx.fillStyle = '#9eb5a5';
    ctx.font = '700 14px "Inter", sans-serif';
    ctx.fillText('TO PAR', 540, 414);
    ctx.fillStyle = stats.toPar < 0 ? '#2ecc71' : stats.toPar > 0 ? '#e05a4a' : '#ffffff';
    ctx.font = 'bold 58px "Playfair Display", Georgia, serif';
    ctx.fillText(fmtScore(stats.toPar), 540, 477);
}

function drawSocialCardLayout(ctx, data) {
    var variant = normalizeSocialCardVariant(data.variant);
    var scoreColor = data.stats.toPar < 0 ? '#2ecc71' : data.stats.toPar > 0 ? '#e05a4a' : '#ffffff';

    drawSocialCardFrame(ctx, variant);

    if (variant === '2') {
        drawSocialCardHeader(ctx, data, {
            label: typeof currentLang !== 'undefined' && currentLang === 'en' ? 'ROUND RESULT' : 'РЕЗУЛЬТАТ РАУНДА',
            nameY: 286, metaY: 324, dateY: 350
        });
        drawSocialCardResultHero(ctx, data.stats);
        drawScorecardGridRow(ctx, data.scores, 1, 9, 550);
        drawScorecardGridRow(ctx, data.scores, 10, 18, 738);
    } else if (variant === '3') {
        drawSocialCardHeader(ctx, data, {
            label: typeof currentLang !== 'undefined' && currentLang === 'en' ? 'TOURNAMENT SCORECARD' : 'ТУРНИРНАЯ КАРТОЧКА',
            nameY: 276, metaY: 342, dateY: 364
        });
        if (data.tournamentName) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#9eb5a5';
            drawFittedCanvasText(ctx, data.tournamentName, 540, 312, 860, 17, 13, '"Inter", sans-serif');
        }
        drawKPICard(ctx, 80, 388, 220, 108, 'TO PAR', fmtScore(data.stats.toPar), scoreColor);
        drawKPICard(ctx, 430, 388, 220, 108, 'GROSS', String(data.stats.gross || 0), '#c9a84c');
        drawKPICard(ctx, 780, 388, 220, 108, 'STABLEFORD', String(data.stats.stablefordField || 0), '#2ecc71');
        drawScorecardGridRow(ctx, data.scores, 1, 9, 530);
        drawScorecardGridRow(ctx, data.scores, 10, 18, 712);
        drawSocialCardTotalBar(ctx, data.outGross, data.inGross, data.totalGross, 875);
    } else {
        drawSocialCardHeader(ctx, data, { nameY: 286, metaY: 324, dateY: 350 });
        drawKPICard(ctx, 80, 376, 220, 108, 'TO PAR', fmtScore(data.stats.toPar), scoreColor);
        drawKPICard(ctx, 430, 376, 220, 108, 'GROSS', String(data.stats.gross || 0), '#c9a84c');
        drawKPICard(ctx, 780, 376, 220, 108, 'STABLEFORD', String(data.stats.stablefordField || 0), '#2ecc71');
        drawScorecardGridRow(ctx, data.scores, 1, 9, 518);
        drawScorecardGridRow(ctx, data.scores, 10, 18, 700);
        drawSocialCardTotalBar(ctx, data.outGross, data.inGross, data.totalGross, 870);
    }

    drawSocialCardFooter(ctx, variant);
}

function exportRoundPNG(roundId, playerId) {
    if (typeof db === 'undefined' || !roundId) return;

    toast(currentLang === 'en' ? '⏳ Generating PNG scorecard...' : '⏳ Генерируем PNG-карточку...', 'info');

    // Логотип рисуется компактно в шапке, непосредственно над именем игрока.
    loadPestovoCardLogo().then(function(logoImg) {
        db.ref('rounds/' + roundId).once('value').then(function(sn) {
            var r = sn.val();
            // PNG/социальная карточка разрешена только для завершённого раунда.
            // Проверка остаётся и в UI, и здесь — прямой вызов функции не должен
            // позволить поделиться незавершённым результатом.
            if (!r || r.status !== 'completed' || !r.players) {
                toast(currentLang === 'en'
                    ? 'A social scorecard is available after the round is completed.'
                    : 'Поделиться карточкой можно только после завершения раунда.', 'info');
                return;
            }

            var playersList = Object.entries(r.players);
            if (!playersList.length) return;
            var pid = playerId || playersList[0][0];
            if (!r.players[pid]) pid = playersList[0][0];
            var p = r.players[pid];
            if (!p) return;

            var canvas = document.createElement('canvas');
            canvas.width = 1080;
            canvas.height = 1080;
            var ctx = canvas.getContext('2d');
            var scores = p.scores || {};
            var order = getRoundOrder(r);
            var stats = calcRoundStats(scores, p.fieldHcp || 0, p.exactHcp || 0, order);
            var outGross = 0, inGross = 0;
            for (var i = 1; i <= 9; i++) {
                var frontScore = parseInt(scores[i]) || 0;
                if (frontScore > 0) outGross += frontScore;
            }
            for (var j = 10; j <= 18; j++) {
                var backScore = parseInt(scores[j]) || 0;
                if (backScore > 0) inGross += backScore;
            }

            var teeName = t('tee_' + ((p && p.tee) || r.tee || 'wh'));
            drawSocialCardLayout(ctx, {
                variant: getSocialCardVariant(),
                logoImg: logoImg,
                playerName: playerDisplayName(p, pid),
                format: pestovoRoundFormatBadge(r, 'Stroke Play'),
                teeName: teeName,
                hcp: fmtExactHcp(p.exactHcp),
                date: fmtDate(r.completedAt || r.createdAt || Date.now()),
                tournamentName: r.tournamentName || '',
                scores: scores,
                stats: stats,
                outGross: outGross,
                inGross: inGross,
                totalGross: outGross + inGross
            });

            var dataUrl = canvas.toDataURL('image/png');
            openPNGExportModal(dataUrl, playerDisplayName(p, pid), roundId, pid, playersList);
        }).catch(function(error) {
            console.warn('[PNG] Cannot load round for export', error);
            toast(currentLang === 'en' ? 'Could not generate the PNG scorecard' : 'Не удалось сформировать PNG-карточку', 'error');
        });
    });
}

function drawKPICard(ctx, x, y, w, h, label, value, valColor) {
    // Непрозрачная подложка сохраняет KPI контрастными на чистом фоне.
    ctx.fillStyle = '#132218';
    ctx.strokeStyle = '#1e3525';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#9eb5a5';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + 32);

    ctx.fillStyle = valColor || '#ffffff';
    ctx.font = 'bold 38px "Inter", sans-serif';
    ctx.fillText(value, x + w / 2, y + 84);
}

function drawScorecardGridRow(ctx, scores, startHole, endHole, startY) {
    var startX = 60;
    var labelW = 110;
    var holeW = 85;
    var totW = 85;
    var row1H = 36;
    var row2H = 36;
    var row3H = 65;

    // --- ROW 1: HOLE NUMBERS ---
    ctx.fillStyle = '#101f13';
    ctx.fillRect(startX, startY, labelW + holeW * 9 + totW, row1H);
    ctx.strokeStyle = '#1e3525';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, startY, labelW + holeW * 9 + totW, row1H);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(' HOLE', startX + 10, startY + 24);

    ctx.textAlign = 'center';
    var parSum = 0;
    for (var i = startHole; i <= endHole; i++) {
        var colX = startX + labelW + (i - startHole) * holeW;
        ctx.fillText(String(i), colX + holeW / 2, startY + 24);
        parSum += holePar(i);
    }
    var totX = startX + labelW + holeW * 9;
    ctx.fillText(startHole === 1 ? 'OUT' : 'IN', totX + totW / 2, startY + 24);

    // --- ROW 2: PAR ---
    var y2 = startY + row1H;
    ctx.fillStyle = 'rgba(46, 204, 113, 0.10)';
    ctx.fillRect(startX, y2, labelW + holeW * 9 + totW, row2H);
    ctx.strokeStyle = '#1e3525';
    ctx.strokeRect(startX, y2, labelW + holeW * 9 + totW, row2H);

    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(' PAR', startX + 10, y2 + 24);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    for (var i = startHole; i <= endHole; i++) {
        var colX = startX + labelW + (i - startHole) * holeW;
        ctx.fillText(String(holePar(i)), colX + holeW / 2, y2 + 24);
    }
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(String(parSum), totX + totW / 2, y2 + 24);

    // --- ROW 3: SCORE ---
    var y3 = y2 + row2H;
    ctx.fillStyle = '#132218';
    ctx.fillRect(startX, y3, labelW + holeW * 9 + totW, row3H);
    ctx.strokeStyle = '#1e3525';
    ctx.strokeRect(startX, y3, labelW + holeW * 9 + totW, row3H);

    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 16px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(' SCORE', startX + 10, y3 + 38);

    ctx.textAlign = 'center';
    var scoreSum = 0;
    for (var i = startHole; i <= endHole; i++) {
        var s = parseInt(scores[i]) || 0;
        var par = holePar(i);
        var colX = startX + labelW + (i - startHole) * holeW;

        if (s > 0) {
            scoreSum += s;
            var diff = s - par;
            var circleColor = '#132218';

            if (diff <= -2 || s === 1) circleColor = '#f39c12';
            else if (diff === -1) circleColor = '#2ecc71';
            else if (diff === 0) circleColor = '#2c3e50';
            else if (diff === 1) circleColor = '#5aade0';
            else circleColor = '#e05a4a';

            // Score Badge Circle
            ctx.fillStyle = circleColor;
            ctx.beginPath();
            ctx.arc(colX + holeW / 2, y3 + row3H / 2, 22, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px "Inter", sans-serif';
            ctx.fillText(String(s), colX + holeW / 2, y3 + row3H / 2 + 7);
        } else {
            ctx.fillStyle = '#3a523e';
            ctx.font = '18px "Inter", sans-serif';
            ctx.fillText('—', colX + holeW / 2, y3 + row3H / 2 + 6);
        }
    }

    ctx.fillStyle = scoreSum > 0 ? '#c9a84c' : '#3a523e';
    ctx.font = 'bold 22px "Inter", sans-serif';
    ctx.fillText(scoreSum > 0 ? String(scoreSum) : '—', totX + totW / 2, y3 + row3H / 2 + 7);
}
function downloadPNGImage(pngDataUrl, fileName) {
    fileName = fileName || 'Pestovo_Scorecard.png';
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    var dataURLtoBlob = function(dataurl) {
        var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {type:mime});
    };

    var blob = null;
    try {
        blob = dataURLtoBlob(pngDataUrl);
    } catch (e) { console.warn("[silent]", e); }

    if (navigator.share && blob) {
        try {
            var file = new File([blob], fileName, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: 'Пестово Счётная Карточка',
                    text: 'Официальная карточка раунда'
                }).then(function() {
                    console.log('✅ Web Share succeeded');
                }).catch(function(err) {
                    if (err && err.name !== 'AbortError') {
                        fallbackIOSDownload(pngDataUrl, blob, fileName, isIOS);
                    }
                });
                return;
            }
        } catch (e) {
            console.warn('Web Share file error:', e);
        }
    }

    fallbackIOSDownload(pngDataUrl, blob, fileName, isIOS);
}

function fallbackIOSDownload(pngDataUrl, blob, fileName, isIOS) {
    if (isIOS) {
        var blobUrl = blob ? URL.createObjectURL(blob) : pngDataUrl;
        var win = window.open(blobUrl, '_blank');
        if (!win) {
            window.location.href = blobUrl;
        }
        toast(currentLang === 'en' ? '📱 Long press image and choose "Save to Photos"!' : '📱 Зажмите изображение пальцем и выберите «Сохранить в Фото»!', 'info');
    } else {
        var a = document.createElement('a');
        a.href = pngDataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast(currentLang === 'en' ? '✅ PNG Scorecard downloaded!' : '✅ PNG Карточка успешно скачана!', 'success');
    }
}

function openPNGExportModal(pngDataUrl, playerName, roundId, activePid, playersList) {
    var modalEl = document.getElementById('png-modal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'png-modal';
        modalEl.className = 'modal hidden';
        modalEl.innerHTML =
            '<div class="modal-bg" onclick="closePNGModal()"></div>' +
            '<div class="modal-body" style="max-width:560px;text-align:center;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closePNGModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
            '<button type="button" class="modal-close-btn" onclick="closePNGModal()">&times;</button>' +
            '</div>' +
            '<div id="png-modal-body"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modalEl);
    }

    var bodyEl = document.getElementById('png-modal-body');
    var fileName = 'Pestovo_' + (playerName || 'Card').replace(/\s+/g, '_') + '.png';

    var html = '<h2 style="color:var(--gold);margin-bottom:12px;"><i class="fas fa-image"></i> ' + t('share_card') + '</h2>';

    // Group Player Selector (If Group Round with >1 players)
    if (playersList && playersList.length > 1 && roundId) {
        html += '<div style="margin-bottom:16px;background:var(--input);padding:12px;border-radius:var(--rs);border:1px solid var(--border);">';
        html += '<label style="font-size:12px;color:var(--gold);display:block;margin-bottom:6px;font-weight:700;"><i class="fas fa-users"></i> ' + (currentLang === 'en' ? 'Select Group Player Card:' : 'Выберите карточку игрока группы:') + '</label>';
        html += '<select class="form-input" style="max-width:320px;margin:0 auto;text-align:center;font-weight:700;" onchange="exportRoundPNG(\'' + roundId + '\', this.value)">';
        playersList.forEach(function(pe) {
            var pid = pe[0], p = pe[1];
            var sel = pid === activePid ? 'selected' : '';
            html += '<option value="' + pid + '" ' + sel + '>' + escapeHtml(playerDisplayName(p, pid)) + '</option>';
        });
        html += '</select></div>';
    }

    html += '<img src="' + pngDataUrl + '" alt="Pestovo Card" style="width:100%;max-width:440px;border-radius:12px;border:2px solid var(--gold);box-shadow:0 8px 32px rgba(0,0,0,0.5);margin-bottom:12px;">';
    html += '<p style="font-size:11px;color:var(--muted);margin-bottom:14px;"><i class="fas fa-mobile-screen-button"></i> ' + (currentLang === 'en' ? 'On iPhone / iPad: Tap button to Share or long-press image to Save to Photos' : 'На iPhone: нажмите кнопку для отправки или зажмите картинку пальцем для сохранения в Фото') + '</p>';

    html += '<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">';
    html += '<button type="button" class="btn btn-g" style="flex:1;min-width:180px;" onclick="downloadPNGImage(\'' + pngDataUrl + '\', \'' + fileName + '\')"><i class="fas fa-download"></i> ' + t('download_png') + '</button>';

    if (navigator.share) {
        html += '<button type="button" class="btn btn-og" style="flex:1;min-width:180px;" onclick="downloadPNGImage(\'' + pngDataUrl + '\', \'' + fileName + '\')"><i class="fas fa-share-nodes"></i> ' + t('share_native') + '</button>';
    }
    html += '</div>';

    if (bodyEl) bodyEl.innerHTML = html;
    modalEl.classList.remove('hidden');
}

function closePNGModal() {
    var modalEl = document.getElementById('png-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function renderTrophyCabinet(u, rounds) {
    var totalEagles = 0, totalBirdies = 0, totalHIO = 0;
    (rounds || []).forEach(function(r) {
        if (r.eagles) totalEagles += r.eagles;
        if (r.birdies) totalBirdies += r.birdies;
        if (r.holeInOne) totalHIO += r.holeInOne;
    });

    var trophies = [];
    if (totalHIO > 0) trophies.push({ icon: '🎯', title: 'Hole-in-One', desc: 'Hole-in-One!' });
    if (totalEagles > 0) trophies.push({ icon: '🦅', title: 'Eagle Hunter', desc: totalEagles + ' Eagles' });
    if (totalBirdies >= 5) trophies.push({ icon: '🐦', title: 'Birdie Master', desc: totalBirdies + ' Birdies' });
    if (u.roundsPlayed >= 10) trophies.push({ icon: '👑', title: 'Century Player', desc: u.roundsPlayed + ' Rounds' });
    else if (u.roundsPlayed >= 1) trophies.push({ icon: '⛳', title: 'Pestovo Golfer', desc: u.roundsPlayed + ' Rounds' });

    if (!trophies.length) return '';

    var html = '<div class="trophy-cabinet" style="margin:16px 0;padding:12px;background:var(--input);border-radius:var(--rs);border:1px solid var(--border);">';
    html += '<div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:8px;text-transform:uppercase;"><i class="fas fa-award"></i> ' + (currentLang === 'en' ? 'Trophy Cabinet & Badges' : 'Витрина наград и достижений') + '</div>';
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
    trophies.forEach(function(tVal) {
        html += '<div class="trophy-badge" style="background:rgba(201,168,76,0.12);border:1px solid var(--gold);padding:6px 12px;border-radius:20px;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--white);">';
        html += '<span>' + tVal.icon + '</span><span>' + tVal.title + ' <small style="color:var(--muted);font-weight:400;">(' + tVal.desc + ')</small></span>';
        html += '</div>';
    });
    html += '</div></div>';
    return html;
}

function renderScoringDistributionBar(rounds) {
    var eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0;
    (rounds || []).forEach(function(r) {
        if (r.eagles) eagles += r.eagles;
        if (r.birdies) birdies += r.birdies;
        if (r.pars) pars += r.pars;
        if (r.bogeys) bogeys += r.bogeys;
        if (r.doubles) doubles += r.doubles;
    });

    var total = eagles + birdies + pars + bogeys + doubles;
    if (total === 0) return '';

    var pEag = Math.round((eagles / total) * 100);
    var pBir = Math.round((birdies / total) * 100);
    var pPar = Math.round((pars / total) * 100);
    var pBog = Math.round((bogeys / total) * 100);
    var pDbl = Math.round((doubles / total) * 100);

    var html = '<div class="scoring-dist-wrap" style="margin:16px 0;padding:12px;background:var(--input);border-radius:var(--rs);border:1px solid var(--border);">';
    html += '<div style="font-size:12px;font-weight:700;color:var(--gold);margin-bottom:8px;text-transform:uppercase;"><i class="fas fa-chart-pie"></i> ' + (currentLang === 'en' ? 'Scoring Distribution' : 'Распределение результатов ударов') + '</div>';
    html += '<div style="height:12px;border-radius:6px;overflow:hidden;display:flex;background:var(--border);margin-bottom:8px;">';
    if (pEag > 0) html += '<div style="width:' + pEag + '%;background:#f39c12;" title="Eagle ' + pEag + '%"></div>';
    if (pBir > 0) html += '<div style="width:' + pBir + '%;background:#2ecc71;" title="Birdie ' + pBir + '%"></div>';
    if (pPar > 0) html += '<div style="width:' + pPar + '%;background:#555555;" title="Par ' + pPar + '%"></div>';
    if (pBog > 0) html += '<div style="width:' + pBog + '%;background:#5aade0;" title="Bogey ' + pBog + '%"></div>';
    if (pDbl > 0) html += '<div style="width:' + pDbl + '%;background:#e05a4a;" title="Double+ ' + pDbl + '%"></div>';
    html += '</div>';

    html += '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);flex-wrap:wrap;gap:6px;">';
    html += '<span style="color:#f39c12;">🦅 Eagle ' + pEag + '%</span>';
    html += '<span style="color:#2ecc71;">🐦 Birdie ' + pBir + '%</span>';
    html += '<span>⚪ Par ' + pPar + '%</span>';
    html += '<span style="color:#5aade0;">🔷 Bogey ' + pBog + '%</span>';
    html += '<span style="color:#e05a4a;">🟥 Dbl+ ' + pDbl + '%</span>';
    html += '</div></div>';

    return html;
}
function calcMatchPlayStatus(p1Scores, p2Scores, p1Name, p2Name) {
    p1Name = p1Name || 'Игрок 1';
    p2Name = p2Name || 'Игрок 2';
    p1Scores = p1Scores || {};
    p2Scores = p2Scores || {};

    var p1HolesWon = 0;
    var p2HolesWon = 0;
    var holesCompleted = 0;
    var holeHistory = [];

    for (var h = 1; h <= 18; h++) {
        var s1 = p1Scores[h];
        var s2 = p2Scores[h];

        if (s1 != null && s1 > 0 && s2 != null && s2 > 0) {
            holesCompleted++;
            if (s1 < s2) {
                p1HolesWon++;
                holeHistory.push({ hole: h, winner: 1 });
            } else if (s2 < s1) {
                p2HolesWon++;
                holeHistory.push({ hole: h, winner: 2 });
            } else {
                holeHistory.push({ hole: h, winner: 0 });
            }
        }
    }

    var lead = p1HolesWon - p2HolesWon;
    var absLead = Math.abs(lead);
    var remaining = 18 - holesCompleted;

    var statusText = '';
    var state = 'active';

    if (absLead > remaining && holesCompleted > 0) {
        state = 'final';
        var winnerName = lead > 0 ? p1Name : p2Name;
        statusText = '🏆 ПОБЕДА ' + winnerName.toUpperCase() + ' ' + absLead + ' & ' + remaining;
    } else if (absLead === remaining && remaining > 0) {
        state = 'dormie';
        var leaderName = lead > 0 ? p1Name : p2Name;
        statusText = '🔥 ' + leaderName.toUpperCase() + ' ' + absLead + ' UP (DORMIE)';
    } else if (lead === 0) {
        statusText = '⚖️ ALL SQUARE (Ничья)';
    } else {
        var leaderName = lead > 0 ? p1Name : p2Name;
        statusText = '⚡ ' + leaderName.toUpperCase() + ' ' + absLead + ' UP (' + remaining + ' л. осталось)';
    }

    return {
        p1HolesWon: p1HolesWon,
        p2HolesWon: p2HolesWon,
        holesCompleted: holesCompleted,
        remaining: remaining,
        lead: lead,
        state: state,
        statusText: statusText,
        holeHistory: holeHistory
    };
}

function renderMatchPlayTrackerHTML(matchStatus) {
    if (!matchStatus) return '';
    var html = '<div class="card setup-card" style="border-color:var(--gold);background:rgba(201,168,76,0.06);margin-bottom:12px;">' +
        '<div style="font-size:12px;color:var(--gold);font-weight:700;text-transform:uppercase;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">' +
        '<span><i class="fas fa-swords"></i> Match Play Status</span>' +
        '<span style="font-size:10px;color:var(--muted);">' + matchStatus.holesCompleted + '/18 holes</span>' +
        '</div>' +
        '<div style="font-size:14px;font-weight:800;color:var(--white);text-align:center;padding:8px 0;background:rgba(0,0,0,0.3);border-radius:8px;margin-bottom:8px;">' +
        matchStatus.statusText +
        '</div>' +
        '<div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px;">';

    for (var i = 0; i < matchStatus.holeHistory.length; i++) {
        var item = matchStatus.holeHistory[i];
        var bg = item.winner === 1 ? '#2ecc71' : (item.winner === 2 ? '#e05a4a' : 'var(--muted)');
        var lbl = item.winner === 1 ? 'W1' : (item.winner === 2 ? 'W2' : 'AS');
        html += '<div style="background:' + bg + ';color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;">Л.' + item.hole + ': ' + lbl + '</div>';
    }

    html += '</div></div>';
    return html;
}

// ============================================================
// ФОРМАТЫ ТУРНИРА: класс формата + расчёт МЭТЧ-РЕЗУЛЬТАТОВ
// ------------------------------------------------------------
// Stroke Play / Gross / Net / Stableford — на удары (считает
// calcRoundStats). Match Play 1v1 / 2v2 — матчи: победитель лунок,
// Skramble / Texas Skramble / Greensomes — командные форматы, где
// счёт группы на лунке = лучший удар игроков группы.
// ============================================================
function pestovoFormatType(f) {
    var s = String(f == null ? '' : f);
    if (s === 'Match Play 1v1') return 'match1v1';
    if (s === 'Match Play 2v2') return 'match2v2';
    if (s === 'Scramble' || s === 'Texas Scramble' || s === 'Greensomes') return 'team';
    return 'stroke';
}
function pestovoIsMatchFormat(f) {
    var t = pestovoFormatType(f);
    return t === 'match1v1' || t === 'match2v2';
}

// Счёт СТОРОНЫ (игрока или команды) на конкретной лунке.
// sideScores = массив объектов с полем scores (лунка -> удары).
// Команда (foursomes/fourball в этой системе): лучший результат
// среди членов команды (best ball) — логично и для скрембля.
function pestovoSideHoleScore(sideScores, hole) {
    var best = null;
    for (var i = 0; i < (sideScores || []).length; i++) {
        var sc = sideScores[i] && sideScores[i].scores;
        if (!sc) continue;
        var v = parseInt(sc[hole]);
        if (v != null && v > 0 && (best === null || v < best)) best = v;
    }
    return best;
}

// Матч между двумя сторонами (по 1 или по 2 игрока). Считается по
// лункам: ниже удары — взята лунка; равные — на равных. Финал,
// когда перевес больше оставшихся лунок (как в 1v1).
function calcMatchPlayStatusSides(sideAScores, sideBScores, nameA, nameB) {
    var aWon = 0, bWon = 0, holesDone = 0;
    var history = [];
    for (var h = 1; h <= 18; h++) {
        var sa = pestovoSideHoleScore(sideAScores, h);
        var sb = pestovoSideHoleScore(sideBScores, h);
        if (sa != null && sb != null) {
            holesDone++;
            if (sa < sb) { aWon++; history.push({ hole: h, winner: 1 }); }
            else if (sb < sa) { bWon++; history.push({ hole: h, winner: 2 }); }
            else { history.push({ hole: h, winner: 0 }); }
        }
    }
    var lead = aWon - bWon;
    var absLead = Math.abs(lead);
    var remaining = 18 - holesDone;
    var state = 'active', statusText = '';
    var leadName = lead >= 0 ? nameA : nameB;
    var trailName = lead >= 0 ? nameB : nameA;
    if (absLead > remaining && holesDone > 0) {
        state = 'final';
        statusText = '\u{1F3C6} ' + (lead > 0 ? nameA : nameB).toUpperCase() +
            ' \u041F\u041E\u0411\u0415\u0414\u0418\u041B ' + absLead + ' & ' + remaining;
    } else if (absLead === remaining && remaining > 0) {
        state = 'dormie';
        statusText = '\uD83D\uDD25 ' + leadName.toUpperCase() + ' ' + absLead + ' UP (DORMIE)';
    } else if (lead === 0) {
        statusText = '\u2696\uFE0F ALL SQUARE (\u041D\u0438\u0447\u044C\u044F)';
    } else {
        statusText = '\u26A1 ' + leadName.toUpperCase() + ' ' + absLead + ' UP (' + remaining + ' \u043B. \u043E\u0441\u0442.)';
    }
    return {
        sideA: nameA, sideB: nameB,
        aWon: aWon, bWon: bWon,
        holesDone: holesDone, remaining: remaining,
        lead: lead, state: state, statusText: statusText,
        winner: state === 'final' ? (lead > 0 ? nameA : nameB) : (absLead > 0 ? leadName : null),
        holeHistory: history
    };
}

// Матчи раунда: игроки группы паруются ПО ПОРЯДКУ (как при старте):
// 1v1 — (1-й с 2-м), (3-й с 4-м) …; 2v2 — (1-2) против (3-4), (5-6) против (7-8).
// Возвращает массив { a, b, status }, где a/b — массивы игроков {pid,name}.
function pestovoRoundMatches(round) {
    var out = [];
    if (!round || !pestovoIsMatchFormat(round.format)) return out;
    var is2v2 = String(round.format) === 'Match Play 2v2';
    var pids = Object.keys(round.players || {});
    var size = is2v2 ? 4 : 2;
    for (var i = 0; i + size - 1 < pids.length; i += size) {
        var chunk = pids.slice(i, i + size);
        var a = [], b = [];
        (is2v2 ? chunk.slice(0, 2) : chunk.slice(0, 1)).forEach(function(pid) {
            a.push({ pid: pid, name: (round.players[pid] || {}).name || '—', scores: (round.players[pid] || {}).scores || {} });
        });
        (is2v2 ? chunk.slice(2, 4) : chunk.slice(1, 2)).forEach(function(pid) {
            b.push({ pid: pid, name: (round.players[pid] || {}).name || '—', scores: (round.players[pid] || {}).scores || {} });
        });
        if (!a.length || !b.length) continue;
        out.push({
            a: a, b: b,
            sideAName: is2v2 ? a.map(function(p) { return p.name; }).join(' + ') : a[0].name,
            sideBName: is2v2 ? b.map(function(p) { return p.name; }).join(' + ') : b[0].name,
            status: calcMatchPlayStatusSides(a, b,
                is2v2 ? a.map(function(p) { return p.name; }).join(' + ') : a[0].name,
                is2v2 ? b.map(function(p) { return p.name; }).join(' + ') : b[0].name)
        });
    }
    return out;
}

// Командный (scramble/texas/greensomes) счёт группы на лунке — лучший удар.
function pestovoTeamHoleScore(players, hole) {
    var best = null;
    Object.keys(players || {}).forEach(function(pid) {
        var sc = (players[pid] || {}).scores;
        if (!sc) return;
        var v = parseInt(sc[hole]);
        if (v != null && v > 0 && (best === null || v < best)) best = v;
    });
    return best;
}

// Командные итоги группы за раунд (для скрембла и аналогов):
// { holes, gross, toPar } по лучшему удару на лунке.
function toggleActiveScorecard(panelId) {
    var panel = document.getElementById(panelId);
    var icon = document.getElementById(panelId + '-icon');
    var txt = document.getElementById(panelId + '-txt');
    if (!panel) return;

    var isHidden = panel.classList.contains('hidden');
    if (isHidden) {
        panel.classList.remove('hidden');
        if (icon) icon.className = 'fas fa-chevron-up';
        if (txt) txt.textContent = currentLang === 'en' ? 'Collapse Scorecard' : 'Свернуть счётную карточку';
    } else {
        panel.classList.add('hidden');
        if (icon) icon.className = 'fas fa-chevron-down';
        if (txt) txt.textContent = currentLang === 'en' ? 'Expand Scorecard' : 'Развернуть счётную карточку';
    }
}

// Состав флайта: имена всех игроков раунда, играющих на поле вместе с
// вызвавшим (кроме самого вызвавшего). Порядок — как в participantsList.
function getFlightPlayerNames(roundData, excludeUid) {
    if (!roundData || !roundData.players) return [];
    var order = (Array.isArray(roundData.participantsList) && roundData.participantsList.length)
        ? roundData.participantsList
        : Object.keys(roundData.players);
    var names = [];
    order.forEach(function(pid) {
        if (pid === excludeUid) return;
        var p = roundData.players[pid];
        if (p && p.name) names.push(p.name);
    });
    return names;
}

// Глобальный дефолт показа Stableford синхронизируется на всех страницах.
// Личный выбор игрока хранится в rounds/<round>/players/<player>/stablefordDisplay
// и поэтому не перезаписывается этой настройкой.
if (typeof db !== 'undefined') {
    try {
        db.ref('settings/stableford_display_default').on('value', function(sn) {
            syncStablefordDisplayDefault(sn.val());
        });
    } catch (e) { console.warn("[silent]", e); }
}

// ==========================================
// DYNAMIC PAGE VISIBILITY MANAGEMENT
// ==========================================
var MANAGED_PAGES = [
    'players.html',
    'tournaments.html',
    'stats.html',
    'handicap.html'
];

function getHiddenPages() {
    try {
        var local = localStorage.getItem('pestovo_hidden_pages');
        return local ? JSON.parse(local) : {};
    } catch(e) {
        return {};
    }
}

function applyPageVisibilitySettings() {
    if (typeof document === 'undefined') return;

    var hiddenPages = getHiddenPages();
    var curPage = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname.split('/').pop() || 'index.html' : 'index.html';

    // «Турнир (опционально)» в групповом раунде больше не показывается:
    // участие в турнире — только через регистрацию в разделе «Турниры».
    var isTournamentsHidden = (hiddenPages['tournaments.html'] === true || hiddenPages['tournaments'] === true);
    void isTournamentsHidden;

    MANAGED_PAGES.forEach(function(page) {
        var key = page.replace('.html', '');
        var isHidden = (hiddenPages[page] === true || hiddenPages[key] === true);
        var links = document.querySelectorAll('a[href*="' + page + '"]');
        links.forEach(function(link) {
            if (isHidden) {
                link.classList.add('nav-page-hidden');
                link.style.setProperty('display', 'none', 'important');
            } else {
                link.classList.remove('nav-page-hidden');
                link.style.removeProperty('display');
            }
        });
    });

    var groups = document.querySelectorAll('.mobile-drawer-group, .nav-group, .menu-group, .footer-group');
    groups.forEach(function(group) {
        var links = group.querySelectorAll('a');
        if (links.length > 0) {
            var visibleCount = 0;
            links.forEach(function(l) {
                if (l.style.display !== 'none' && !l.classList.contains('nav-page-hidden')) {
                    visibleCount++;
                }
            });
            if (visibleCount === 0) {
                group.style.setProperty('display', 'none', 'important');
            } else {
                group.style.removeProperty('display');
            }
        }
    });

    if (MANAGED_PAGES.includes(curPage) && (hiddenPages[curPage] === true || hiddenPages[curPage.replace('.html', '')] === true)) {
        var mainEl = document.querySelector('main') || document.body;
        if (mainEl && !document.getElementById('page-hidden-notice')) {
            var homeText = (typeof t === 'function' ? t('nav_home') : (currentLang === 'en' ? 'Home' : 'Главная'));
            mainEl.innerHTML =
                '<div class="container" style="padding:60px 20px;text-align:center;" id="page-hidden-notice">' +
                '<div class="card" style="max-width:500px;margin:0 auto;padding:40px;border:2px solid var(--gold);">' +
                '<div style="font-size:56px;color:var(--gold);margin-bottom:16px;"><i class="fas fa-eye-slash"></i></div>' +
                '<h2 style="color:var(--white);margin-bottom:10px;font-size:22px;">' + (currentLang === 'en' ? 'Page Hidden' : 'Страница скрыта администратором') + '</h2>' +
                '<p style="color:var(--muted);font-size:14px;margin-bottom:24px;line-height:1.6;">' + (currentLang === 'en' ? 'This page has been temporarily hidden by the club administrator.' : 'Эта страница временно убрана из доступа администратором клуба.') + '</p>' +
                '<a href="index.html" class="btn btn-g btn-lg"><i class="fas fa-home"></i> ' + homeText + '</a>' +
                '</div>' +
                '</div>';
        }
    }
}

if (typeof db !== 'undefined') {
    try {
        db.ref('settings/hidden_pages').on('value', function(sn) {
            var hp = sn.val() || {};
            localStorage.setItem('pestovo_hidden_pages', JSON.stringify(hp));
            applyPageVisibilitySettings();
        });
        // Глобальный выбор стиля галочки гандикапа (админ-панель → «Данные»)
        db.ref('settings/hcp_badge_variant').on('value', function(sn) {
            var v = sn.val();
            if ((v === '1' || v === '2' || v === '3') && v !== pestovoHcpBadgeVariant) {
                applyHcpBadgeVariant(v);
            }
        });
        // Глобальный выбор оформления PNG-карточки для социальных сетей.
        db.ref('settings/social_card_variant').on('value', function(sn) {
            var v = sn.val();
            if (SOCIAL_CARD_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoSocialCardVariant) {
                applySocialCardVariant(String(v));
            }
        });
        // Глобальный выбор стиля карточки группового раунда на главной.
        db.ref('settings/group_round_card_variant').on('value', function(sn) {
            var v = sn.val();
            if (GROUP_CARD_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoGroupCardVariant) {
                applyGroupCardVariant(String(v));
            }
        });
        // Глобальный выбор оформления счётной карточки игрока в лидерборде турнира.
        db.ref('settings/tn_scorecard_variant').on('value', function(sn) {
            var v = sn.val();
            if (TN_CARD_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoTnCardVariant) {
                applyTnCardVariant(String(v));
            }
        });
        // Глобальный выбор вида лидерборда турнира — 5 вариантов (требование #7).
        db.ref('settings/tournament_leaderboard_variant').on('value', function(sn) {
            var v = sn.val();
            if (TN_LB_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoTnLbVariant) {
                applyTnLbVariant(String(v));
            }
        });
        // Видимость гандикапных групп/дивизионов на странице турниров.
        // Нет настройки в базе → дефолт «показывать» (группы скрывает
        // только явный false/0 из админки).
        db.ref('settings/tn_groups_visible').on('value', function(sn) {
            var v = sn.val();
            if (v === null || typeof v === 'undefined') v = true;
            applyTnGroupsVisible(v === true || v === '1' || v === 1);
        });
        // 4 варианта списка участников/групп.
        db.ref('settings/tn_roster_variant').on('value', function(sn) {
            var v = sn.val();
            if (TN_ROSTER_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoTnRosterVariant) {
                applyTnRosterVariant(String(v));
            }
        });
        // Разделение лидерборда турнира по полу — 3 вида (выбирает админ).
        db.ref('settings/tn_gender_split').on('value', function(sn) {
            var v = sn.val();
            if (TN_GENDER_SPLIT_VARIANTS.indexOf(String(v)) !== -1 && String(v) !== pestovoTnGenderSplit) {
                applyTnGenderSplit(String(v));
            }
        });
        // Сброс ВСЕХ локальных сессий после очистки данных в админке.
        db.ref('settings/sessions_reset_ts').on('value', function(sn) {
            var ts = parseInt(sn.val(), 10) || 0;
            if (!ts) return;
            var known = 0;
            try { known = parseInt(localStorage.getItem('pestovo_sessions_reset_last') || '0', 10) || 0; } catch (e) { console.warn("[silent]", e); }
            if (ts > known) {
                try { localStorage.setItem('pestovo_sessions_reset_last', String(ts)); } catch (e) { console.warn("[silent]", e); }
                pestovoWipeLocalSessions();
            }
        });
        // Шаблоны оформления сайта (админ-панель → «Дизайн 🎨»).
        // Ключа settings/design может не быть — тогда работает текущий дизайн,
        // ничего не переопределяется.
        db.ref('settings/design').on('value', function(sn) {
            var val = sn.val();
            if (typeof PestovoDesign === 'undefined') return;
            if (val && typeof val === 'object') {
                PestovoDesign.applySettings(val);
            } else {
                // Админ сбросил оформление: возвращаем базовый дизайн.
                PestovoDesign.applySettings(null);
            }
        });
        // Глобальные варианты страниц: по умолчанию используется вариант 1,
        // поэтому отсутствие ключа в старой базе ничего не меняет.
        Object.keys(PAGE_DISPLAY_VARIANT_CONFIG).forEach(function(page) {
            var cfg = PAGE_DISPLAY_VARIANT_CONFIG[page];
            db.ref(cfg.firebase).on('value', function(sn) {
                var value = sn.val();
                if (pageDisplayVariantKeys(page).indexOf(String(value)) !== -1 && String(value) !== getPageDisplayVariant(page)) {
                    applyPageDisplayVariant(page, String(value));
                }
            });
        });
    } catch (e) { console.warn("[silent]", e); }
}

document.addEventListener('DOMContentLoaded', function() {
    syncView5BodyClasses();
    pestovoBindView5('scorecard', function() {});
    initScoreEntryLayouts();
    applyPageVisibilitySettings();
});

// Нормализация ключа для Firebase (нельзя . $ # [ ] /)
function firebaseSafeKeyStr(s) { return String(s).replace(/[.$#\[\]\/]/g, '_'); }

// Детерминированный id гостя: одно и то же имя + HCP всегда даёт один и тот же id,
// чтобы игрок не дублировался в users при повторных раундах (соло, группа, турниры).
// Детерминированный id гостя: одно и то же ФИО всегда даёт один и тот же id,
// чтобы игрок не дублировался в users при повторных раундах (соло, группа, турниры).
// HCP НЕ входит в ключ — одинаковое имя с разным HCP это один и тот же человек,
// гандикап просто обновляется. Это предотвращает сдваивание игроков.
function buildGuestUserId(cleanName, exactHcp) {
    // exactHcp игнорируется для детерминизма по имени, чтобы не плодить дубли
    return firebaseSafeKeyStr('guest_' + cleanName.toLowerCase().replace(/\s+/g, '_'));
}

// Полный ФИО-ключ для дедупликации: имя + отчество + фамилия в нормализованном виде
function getPlayerFioKey(u) {
    if (!u) return '';
    var first = (u.firstName || '').toString();
    var middle = (u.middleName || '').toString();
    var last = (u.lastName || '').toString();
    var name = (u.name || '').toString();
    var combined = (first + ' ' + middle + ' ' + last).replace(/\s+/g, ' ').trim() || name;
    return normalizeSearchText(combined);
}

function getNamePartsNormalized(nameStr) {
    var s = normalizeSearchText(nameStr || '');
    return s ? s.split(' ').filter(Boolean) : [];
}

// Проверка совпадения по ФИО: учитывает оба порядка «Имя Фамилия» и «Фамилия Имя»
// и наличие отчества. Возвращает 'strong', 'loose' или null.
//
// ВАЖНО: 'strong' означает «точно тот же человек» — только такие записи
// объединяются автоматически. Раньше сюда попадали РАЗНЫЕ люди с одной
// общей частью ФИО (например, однофамильцы или тёзки) — из-за этого при
// создании группового раунда два игрока получали один id и раунд не
// создавался с ошибкой «дублирующий игрок».
function isSamePersonByFio(localParts, remoteParts, localFullNorm, remoteFullNorm) {
    if (!localParts.length || !remoteParts.length) return null;
    // Полное совпадение нормализованной строки
    if (localFullNorm && remoteFullNorm && localFullNorm === remoteFullNorm) return 'strong';
    var allLocalInRemote = localParts.every(function(p) { return remoteParts.indexOf(p) !== -1; });
    var allRemoteInLocal = remoteParts.every(function(p) { return localParts.indexOf(p) !== -1; });
    // Одинаковый набор частей в любом порядке («Иван Петров» = «Петров Иван»)
    if (allLocalInRemote && allRemoteInLocal) return 'strong';
    // Одно ФИО — подмножество другого, отличающийся максимум на одно слово:
    // например, добавили отчество («Иван Петров» → «Иван Петрович Петров»).
    // Больший разрыв (совпала только фамилия из трёх слов) объединять нельзя.
    var diff = Math.abs(localParts.length - remoteParts.length);
    if (diff <= 1 && (allLocalInRemote || allRemoteInLocal)) return 'strong';
    // Одна общая длинная часть (например, только фамилия или только имя) —
    // разные люди совпасть не должны: возвращаем 'loose' как подсказку,
    // но НЕ как основание для автоматического объединения.
    var shared = localParts.filter(function(p) { return remoteParts.indexOf(p) !== -1; });
    if (shared.length === 1 && shared[0].length > 2) {
        return 'loose';
    }
    return null;
}

// Имя записи (состав/ожидание) строкой: name либо «Имя Отчество Фамилия».
function pestovoRecName(rec) {
    if (!rec) return '';
    if (rec.name) return String(rec.name);
    return [rec.firstName, rec.middleName, rec.lastName].filter(Boolean).join(' ');
}

// Совпадает ли человек (name) с ЛЮБОЙ записью из списка
// { key: {name|firstName/middleName/lastName} } — strong-совпадение ФИО:
// порядок слов не важен («Фамилия Имя» = «Имя Фамилия»), отчество может
// отсутствовать у одной из сторон. false для пустых имён.
function pestovoNameInList(name, list) {
    if (!name || !list) return false;
    var myFull = normalizeSearchText(name);
    if (!myFull) return false;
    var myParts = getNamePartsNormalized(name);
    for (var k in list) {
        var other = normalizeSearchText(pestovoRecName(list[k]));
        if (!other) continue;
        var res = isSamePersonByFio(myParts, getNamePartsNormalized(other), myFull, other);
        if (res === 'strong') return true;
    }
    return false;
}
// То же, но возвращает КЛЮЧ совпавшей записи ('' — не найдено).
function pestovoNameKeyInList(name, list) {
    if (!name || !list) return '';
    var myFull = normalizeSearchText(name);
    if (!myFull) return '';
    var myParts = getNamePartsNormalized(name);
    for (var k in list) {
        var other = normalizeSearchText(pestovoRecName(list[k]));
        if (!other) continue;
        var res = isSamePersonByFio(myParts, getNamePartsNormalized(other), myFull, other);
        if (res === 'strong') return k;
    }
    return '';
}
if (typeof window !== 'undefined') {
    window.pestovoNameInList = pestovoNameInList;
    window.pestovoNameKeyInList = pestovoNameKeyInList;
    window.pestovoRecName = pestovoRecName;
}

function dedupePlayerEntriesByFio(entries) {
    // entries: array of [id, userData] or array of player objects with name
    // Возвращает отфильтрованный массив без дублей по ФИО
    var seen = {};
    var result = [];
    // Сортируем по приоритету: не гость > гость, больше раундов > меньше
    var sorted = (entries || []).slice().sort(function(a,b){
        var aIsArr = Array.isArray(a);
        var bIsArr = Array.isArray(b);
        var aData = aIsArr ? a[1] : a;
        var bData = bIsArr ? b[1] : b;
        var aId = aIsArr ? a[0] : (aData.id || aData.uid || '');
        var bId = bIsArr ? b[0] : (bData.id || bData.uid || '');
        var aGuest = !!(aData.isGuest || String(aId).indexOf('guest_')===0);
        var bGuest = !!(bData.isGuest || String(bId).indexOf('guest_')===0);
        if (aGuest !== bGuest) return aGuest ? 1 : -1;
        var aRounds = aData.roundsPlayed || 0;
        var bRounds = bData.roundsPlayed || 0;
        return bRounds - aRounds;
    });
    sorted.forEach(function(entry){
        var isArr = Array.isArray(entry);
        var data = isArr ? entry[1] : entry;
        var key = getPlayerFioKey(data) || normalizeSearchText(data.name || '');
        if (!key) {
            result.push(entry);
            return;
        }
        if (seen[key]) return;
        seen[key] = true;
        result.push(entry);
    });
    return result;
}

function dedupeRoundPlayersByFio(playersObj) {
    // playersObj: { pid: playerData }
    // Возвращает новый объект без дублей по ФИО (оставляет приоритетную запись)
    if (!playersObj || typeof playersObj !== 'object') return playersObj;
    var entries = Object.entries(playersObj);
    var deduped = dedupePlayerEntriesByFio(entries);
    var out = {};
    deduped.forEach(function(e){ out[e[0]] = e[1]; });
    return out;
}
function resolveOrCreatePlayerUser(p) {
    p = p || {};
    if (!p.name) return Promise.resolve(null);

    var cleanName = sanitizeNameRaw(p.name);
    if (!cleanName) return Promise.resolve(null);
    if (isBlockedDemoPlayer(null, cleanName)) return Promise.resolve(null);
    var parts = cleanName.split(' ');
    var firstName = p.firstName ? sanitizeNameRaw(p.firstName) : (parts[0] || cleanName);
    var middleName = p.middleName ? sanitizeNameRaw(p.middleName) : '';
    var lastName = p.lastName ? sanitizeNameRaw(p.lastName) : (parts.slice(1).join(' ') || '');
    var exactHcp = parseExactHcp(p.exactHcp != null ? p.exactHcp : (p.handicap || 0));
    // Гандикап для ПРОФИЛЯ: всегда исходный (до турнирной обрезки). Обрезка
    // гандикапа — настройка конкретного турнира, она не имеет права менять
    // глобальный HCP игрока (требование: «игрок с 54 и максимумом 28 остаётся
    // 54 в профиле, на главной и в RusGolf»).
    var profileHcp = (p.exactHcpRaw != null && p.exactHcpRaw !== '')
        ? parseExactHcp(p.exactHcpRaw)
        : (p.handicap != null && p.handicap !== '' ? parseExactHcp(p.handicap) : exactHcp);
    var fromTnCut = p.hcpFromTournamentCut === true;
    var gender = p.gender || 'men';
    var defaultTee = p.tee || p.defaultTee || (gender === 'women' ? 'rd' : 'bl');

    // Патч для обновления: гандикап — только настоящий, отчество только если было пусто и теперь есть
    var buildPatchForExisting = function(existingData) {
        existingData = existingData || {};
        var patch = {};
        // Если значение пришло из турнира с обрезкой, а у игрока уже есть
        // свой HCP — профиль не трогаем вообще.
        var hasOwn = existingData.handicap !== null && existingData.handicap !== undefined && existingData.handicap !== '';
        if (!(fromTnCut && hasOwn)) patch.handicap = profileHcp;
        // Имя/фамилия — обновляем только если у существующего они пустые
        if (!existingData.firstName && firstName) patch.firstName = firstName;
        if (!existingData.lastName && lastName) patch.lastName = lastName;
        // Отчество — добавляем если его не было (требование: добавление отчества если не было)
        if (!existingData.middleName && middleName) {
            patch.middleName = middleName;
            // Обновляем полное имя на формат «Имя Отчество Фамилия»
            var newFull = (firstName + ' ' + middleName + ' ' + lastName).replace(/\s+/g, ' ').trim() || cleanName;
            patch.name = newFull;
        }
        // Если у существующего нет имени вообще — ставим новое
        if (!existingData.name && cleanName) patch.name = cleanName;
        if (!existingData.gender && gender) patch.gender = gender;
        return patch;
    };

    var updateLocalCaches = function(id, data) {
        if (!id) return;
        try {
            var custom = {};
            var existing = localStorage.getItem('pestovo_custom_players');
            if (existing) custom = JSON.parse(existing) || {};
            if (!custom[id]) {
                custom[id] = data;
                localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
            } else {
                // Обновляем гандикап и отчество если нужно, не создавая дубль
                var cur = custom[id] || {};
                if (data.handicap != null) cur.handicap = data.handicap;
                if (data.middleName && !cur.middleName) {
                    cur.middleName = data.middleName;
                    cur.name = data.name || cur.name;
                    cur.firstName = data.firstName || cur.firstName;
                    cur.lastName = data.lastName || cur.lastName;
                }
                custom[id] = cur;
                localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
            }
        } catch (e) { console.warn("[silent]", e); }
        if (typeof cachedRegisteredUsers !== 'undefined') {
            if (cachedRegisteredUsers[id]) {
                var cur = cachedRegisteredUsers[id] || {};
                if (data.handicap != null) cur.handicap = data.handicap;
                if (data.middleName && !cur.middleName) {
                    cur.middleName = data.middleName;
                    cur.name = data.name || cur.name;
                    cur.firstName = data.firstName || cur.firstName;
                    cur.lastName = data.lastName || cur.lastName;
                } else if (!cur.name && data.name) {
                    cur.name = data.name;
                }
                cachedRegisteredUsers[id] = Object.assign({}, cur, { handicap: data.handicap != null ? data.handicap : cur.handicap });
            } else {
                cachedRegisteredUsers[id] = Object.assign({}, cachedRegisteredUsers[id] || {}, data);
            }
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch (e) { console.warn("[silent]", e); }
        }
    };

    var finish = function(id, finalData) {
        var cacheData = { name: finalData && finalData.name ? finalData.name : cleanName, firstName: firstName, lastName: lastName, handicap: profileHcp, gender: gender, defaultTee: defaultTee };
        if (middleName) cacheData.middleName = middleName;
        if (finalData && finalData.middleName) cacheData.middleName = finalData.middleName;
        if (finalData && finalData.name) cacheData.name = finalData.name;
        updateLocalCaches(id, cacheData);
        return id;
    };

    if (p.uid) {
        var uidKey = firebaseSafeKeyStr(String(p.uid));
        if (!uidKey) return Promise.resolve(null);
        var uidData = {
            name: cleanName,
            firstName: firstName,
            lastName: lastName,
            handicap: profileHcp,
            gender: gender,
            defaultTee: defaultTee,
            role: 'player',
            isGuest: !!p.isGuest || uidKey.indexOf('guest_') === 0,
            createdAt: Date.now(),
            roundsPlayed: 0
        };
        if (middleName) uidData.middleName = middleName;
        if (typeof db === 'undefined') return Promise.resolve(finish(uidKey, uidData));
        return db.ref('usersPublic/' + uidKey).once('value').then(function(sn) {
            if (!sn.exists()) {
                return db.ref('usersPublic/' + uidKey).set(Object.assign({}, uidData, { role: null })).catch(function(){}).then(function() { return uidKey; });
            }
            var existing = sn.val() || {};
            var patch = buildPatchForExisting(existing);
            // Гандикап обновляем только настоящим значением (см. profileHcp):
            // турнирная обрезка в профиль не пишется. Отчество добавляем, если не было
            return db.ref('usersPublic/' + uidKey).update(patch).catch(function(){}).then(function() { return uidKey; });
        }).catch(function() { return uidKey; }).then(function(id){ return finish(id, uidData); });
    }

    var candidateId = buildGuestUserId(cleanName, profileHcp);
    if (!candidateId || candidateId === 'guest__') return Promise.resolve(null);

    var guestData = {
        name: cleanName,
        firstName: firstName,
        lastName: lastName,
        handicap: profileHcp,
        gender: gender,
        defaultTee: defaultTee,
        role: 'player',
        isGuest: true,
        createdAt: Date.now(),
        roundsPlayed: 0
    };
    if (middleName) guestData.middleName = middleName;

    if (typeof db === 'undefined') return Promise.resolve(finish(candidateId, guestData));

    // Ищем существующего игрока по ФИО (без учета HCP) — чтобы не плодить дубликаты
    // Одинаковое имя + разный HCP = один и тот же человек (гандикап обновляется)
    return db.ref('usersPublic').once('value').then(function(usn) {
        var users = usn.val() || {};
        var found = null;
        var foundData = null;
        var cleanParts = getNamePartsNormalized(cleanName);
        var cleanFullNorm = normalizeSearchText(cleanName);
        Object.keys(users).forEach(function(key) {
            var u = users[key] || {};
            if (isPlayerDeleted(key, u.name)) return;
            if (isBlockedDemoPlayer(key, u.name)) return;
            var existingFioKey = getPlayerFioKey(u);
            if (!existingFioKey) return;
            var existingParts = getNamePartsNormalized(u.name || ((u.firstName||'')+' '+(u.middleName||'')+' '+(u.lastName||'')));
            var existingFullNorm = normalizeSearchText(u.name || '');
            var match = isSamePersonByFio(existingParts, cleanParts, existingFullNorm, cleanFullNorm);
            // Также проверяем прямое совпадение ключа
            if (match !== 'strong' && existingFioKey === cleanFullNorm) match = 'strong';
            // Только 'strong' объединяет записи. 'loose' (совпала одна часть —
            // например, только фамилия у однофамильцев) обязан создавать
            // ОТДЕЛЬНУЮ запись, иначе два разных игрока слипаются в один id
            // и групповой раунд не создаётся («дублирующий игрок»).
            if (match !== 'strong') return;
            // Выбираем лучшего: не гость приоритетнее, больше раундов приоритетнее
            var better;
            if (!found) better = true;
            else {
                var foundIsGuest = !!foundData.isGuest || String(found).indexOf('guest_') === 0;
                var curIsGuest = !!u.isGuest || String(key).indexOf('guest_') === 0;
                if (foundIsGuest && !curIsGuest) better = true;
                else if (foundIsGuest === curIsGuest) better = ((u.roundsPlayed || 0) > (foundData.roundsPlayed || 0));
                else better = false;
            }
            if (better) { found = key; foundData = u; }
        });
        if (found) {
            var patch = buildPatchForExisting(foundData);
            return db.ref('usersPublic/' + found).update(patch).catch(function(){}).then(function() { return found; });
        }
        // Проверяем детерминированный id
        return db.ref('usersPublic/' + candidateId).once('value').then(function(sn) {
            if (sn.exists()) {
                var existing = sn.val() || {};
                var patch = buildPatchForExisting(existing);
                return db.ref('usersPublic/' + candidateId).update(patch).catch(function(){}).then(function(){ return candidateId; });
            }
            return db.ref('usersPublic/' + candidateId).set(Object.assign({}, guestData, { role: null })).catch(function(){}).then(function(){ return candidateId; });
        });
    }).catch(function() {
        return candidateId;
    }).then(function(id){
        return finish(id, guestData);
    });
}


function registerGuestPlayerInDatabase(p) {
    return resolveOrCreatePlayerUser(p);
}
if (typeof window !== 'undefined') {
    window.registerGuestPlayerInDatabase = registerGuestPlayerInDatabase;
    window.resolveOrCreatePlayerUser = resolveOrCreatePlayerUser;
}

function normalizeSearchText(str) {
    if (!str) return '';
    return str.toString().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}
if (typeof window !== 'undefined') {
    window.normalizeSearchText = normalizeSearchText;
}

// ==========================================
// УДАЛЁННЫЕ ИГРОКИ (ЗАЩИТА ОТ «ВОСКРЕШЕНИЯ»)
// Запоминаем id и нормализованное имя удалённых в админке игроков,
// чтобы локальный кэш и история раундов не возвращали их в списки
// ==========================================
function getDeletedPlayerIds() {
    try {
        var raw = localStorage.getItem('pestovo_deleted_player_ids');
        if (raw) {
            var list = JSON.parse(raw);
            if (Array.isArray(list)) return list;
        }
    } catch (e) { console.warn("[silent]", e); }
    return [];
}

function isPlayerDeleted(id, name) {
    // Навсегда заблокированные демо-игроки проверяются в первую очередь
    if (typeof isBlockedDemoPlayer === 'function' && isBlockedDemoPlayer(id, name)) return true;
    var list = getDeletedPlayerIds();
    if (!list.length) return false;
    if (id && list.indexOf(id) !== -1) return true;
    var nm = name ? normalizeSearchText(name) : '';
    return !!nm && list.indexOf(nm) !== -1;
}

function markPlayerDeleted(id, name) {
    try {
        var list = getDeletedPlayerIds();
        var add = function(v) {
            if (v && list.indexOf(v) === -1) list.push(v);
        };
        add(id);
        add(name ? normalizeSearchText(name) : '');
        localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify(list));
    } catch (e) { console.warn("[silent]", e); }
}

// ==========================================
// НАВСЕГДА ЗАБЛОКИРОВАННЫЕ ДЕМО-ИГРОКИ
// Старые версии сайта жёстко «подмешивали» в списки игроков демо-записи
// (Петр Один, Пётр Петров, Александр Иванов, Анна Воробьёва и т.д.).
// Из-за этого при каждом обновлении сайта они появлялись снова.
// Демо-список полностью УДАЛЁН из кода, а все известные id и имена
// навсегда заблокированы: даже если их запись осталась в Firebase
// (users / rounds) или в локальных кэшах старых версий, они нигде
// больше не показываются и не могут быть созданы заново.
// ==========================================
var BLOCKED_DEMO_PLAYER_IDS = [
    'user_petr_odin_17',
    'user_petr_odin_21',
    'user_petr_p',
    'user_vasya_p',
    'user_anna_v',
    'user_alex_i',
    'user_ekaterina_p',
    'user_dmitry_s',
    'user_elena_k'
];

// Нормализованные имена (ё → е, нижний регистр, схлопнутые пробелы),
// включая варианты «Фамилия Имя», чтобы заблокировать и ghost-записи.
var BLOCKED_DEMO_PLAYER_NAMES = [
    'петр один',
    'один петр',
    'петр петров',
    'петров петр',
    'вася петров',
    'петров вася',
    'анна воробьева',
    'воробьева анна',
    'александр иванов',
    'иванов александр',
    'екатерина петрова',
    'петрова екатерина',
    'дмитрий смирнов',
    'смирнов дмитрий',
    'елена кузнецова',
    'кузнецова елена'
];

function isBlockedDemoPlayer(id, name) {
    if (id && BLOCKED_DEMO_PLAYER_IDS.indexOf(id) !== -1) return true;
    // ghost-записи из истории раундов имеют вид guest_name_имя_фамилия
    if (id && String(id).indexOf('guest_name_') === 0) {
        var ghostName = String(id).slice('guest_name_'.length).replace(/_/g, ' ').replace(/ё/g, 'е');
        ghostName = ghostName.replace(/\s+/g, ' ').trim();
        if (ghostName && BLOCKED_DEMO_PLAYER_NAMES.indexOf(ghostName) !== -1) return true;
    }
    if (name) {
        var nm = normalizeSearchText(name);
        if (nm && BLOCKED_DEMO_PLAYER_NAMES.indexOf(nm) !== -1) return true;
    }
    return false;
}
if (typeof window !== 'undefined') {
    window.isBlockedDemoPlayer = isBlockedDemoPlayer;
    window.BLOCKED_DEMO_PLAYER_IDS = BLOCKED_DEMO_PLAYER_IDS;
    window.BLOCKED_DEMO_PLAYER_NAMES = BLOCKED_DEMO_PLAYER_NAMES;
}

// Флаг «полной очистки» сохранён для обратной совместимости с админкой.
// Встроенных демо-игроков в коде больше нет.
function areDefaultPlayersCleared() {
    try { return localStorage.getItem('pestovo_defaults_cleared') === 'true'; } catch(e) { return false; }
}

// Встроенные демо-игроки навсегда удалены из кода — кэш игроков стартует пустым.
var cachedRegisteredUsers = {};

function purgeBlockedFromPlayerCaches() {
    var clean = function(raw) {
        if (!raw) return raw;
        try {
            var obj = JSON.parse(raw);
            if (obj && typeof obj === 'object') {
                Object.keys(obj).forEach(function(k) {
                    try {
                        var u = obj[k];
                        if (isBlockedDemoPlayer(k, u && u.name)) delete obj[k];
                    } catch (_) { console.warn("[silent]", _); }
                });
            }
            return obj;
        } catch(e) {
            return {};
        }
    };
    try {
        var c1 = localStorage.getItem('pestovo_cached_users');
        if (c1) {
            var cleaned1 = clean(c1);
            localStorage.setItem('pestovo_cached_users', JSON.stringify(cleaned1));
        }
    } catch (e) { console.warn("[silent]", e); }
    try {
        var c2 = localStorage.getItem('pestovo_custom_players');
        if (c2) {
            var cleaned2 = clean(c2);
            localStorage.setItem('pestovo_custom_players', JSON.stringify(cleaned2));
        }
    } catch (e) { console.warn("[silent]", e); }
}

// Полностью стирает локальный кэш игроков (и в памяти, и в localStorage),
// а также «прячет» встроенных демо-игроков, чтобы после удаления всех данных
// в админке ни один игрок нигде не всплыл заново.
function wipeLocalPlayerCaches() {
    try {
        localStorage.removeItem('pestovo_cached_users');
        localStorage.removeItem('pestovo_custom_players');
        localStorage.setItem('pestovo_defaults_cleared', 'true');
        // Сброс списка удалённых игроков — после полной очистки база пуста,
        // никакие id не должны считаться «удалёнными» (чтобы не мешали новой работе)
        localStorage.setItem('pestovo_deleted_player_ids', JSON.stringify([]));
    } catch (e) { console.warn("[silent]", e); }

    if (typeof cachedRegisteredUsers === 'object' && cachedRegisteredUsers) {
        Object.keys(cachedRegisteredUsers).forEach(function(k) {
            delete cachedRegisteredUsers[k];
        });
    }
    lastRemoteUserIds = null;
}

if (typeof window !== 'undefined') {
    window.wipeLocalPlayerCaches = wipeLocalPlayerCaches;
    window.areDefaultPlayersCleared = areDefaultPlayersCleared;
}

function syncKnownPlayersCache() {
    if (areDefaultPlayersCleared()) {
        try {
            localStorage.removeItem('pestovo_cached_users');
            localStorage.removeItem('pestovo_custom_players');
        } catch (e) { console.warn("[silent]", e); }
        return;
    }

    var deletedIds = [];
    try {
        var dRaw = localStorage.getItem('pestovo_deleted_player_ids');
        if (dRaw) deletedIds = JSON.parse(dRaw) || [];
    } catch (e) { console.warn("[silent]", e); }

    var mergeCache = function(obj) {
        Object.keys(obj).forEach(function(k) {
            if (isPlayerDeleted(k, obj[k] && obj[k].name)) return;
            if (obj[k] && obj[k].name) {
                var nKey = normalizeSearchText(obj[k].name);
                if (nKey && deletedIds.indexOf(nKey) !== -1) return;
            }
            cachedRegisteredUsers[k] = obj[k];
        });
    };

    try {
        var localCached = localStorage.getItem('pestovo_cached_users');
        if (localCached) {
            var p1 = JSON.parse(localCached);
            if (p1 && typeof p1 === 'object') mergeCache(p1);
        }
    } catch (e) { console.warn("[silent]", e); }

    try {
        var custom = localStorage.getItem('pestovo_custom_players');
        if (custom) {
            var p2 = JSON.parse(custom);
            if (p2 && typeof p2 === 'object') mergeCache(p2);
        }
    } catch (e) { console.warn("[silent]", e); }

    // Дедуп по ФИО в локальном кэше, чтобы не было сдваивания
    try {
        var entries = Object.entries(cachedRegisteredUsers);
        var deduped = dedupePlayerEntriesByFio(entries);
        // Очищаем и перезаписываем только дедуплицированными
        Object.keys(cachedRegisteredUsers).forEach(function(k){ delete cachedRegisteredUsers[k]; });
        deduped.forEach(function(en){ cachedRegisteredUsers[en[0]] = en[1]; });
    } catch (e) { console.warn("[silent]", e); }

    purgeBlockedFromPlayerCaches();
}

syncKnownPlayersCache();

var lastRemoteUserIds = null;

// Публичные поля профилей (usersPublic, без email/phone/history) читают все
// залогиненные; полные users — только владелец/админ/мастер (см. database.rules.json).
var _usersReadNode = 'usersPublic';
try { if (typeof document !== 'undefined' && document.getElementById('admin-content')) _usersReadNode = 'users'; } catch (e) { console.warn("[silent]", e); }

if (typeof db !== 'undefined') {
    try {
        db.ref(_usersReadNode).on('value', function(sn) {
            var val = sn.val();
            // Сброс: если после очистки БД в Firebase нет пользователей (val === null) —
            // полностью вычищаем in-memory кэш и localStorage, чтобы демо/удалённые
            // игроки не «воскрешали» при обновлении страницы.
            if (!val || typeof val !== 'object' || Object.keys(val).length === 0) {
                Object.keys(cachedRegisteredUsers).forEach(function(k) {
                    delete cachedRegisteredUsers[k];
                });
                lastRemoteUserIds = [];
                try {
                    localStorage.removeItem('pestovo_cached_users');
                    localStorage.removeItem('pestovo_custom_players');
                    localStorage.setItem('pestovo_defaults_cleared', 'true');
                } catch (e) { console.warn("[silent]", e); }
                return;
            }
            Object.assign(cachedRegisteredUsers, val);
            // Игрок, которого удалили в Firebase, должен исчезнуть из локального кэша
            // (Object.assign только добавляет, поэтому удаляем ключи из прошлого снапшота)
            if (lastRemoteUserIds) {
                lastRemoteUserIds.forEach(function(key) {
                    if (!Object.prototype.hasOwnProperty.call(val, key)) {
                        delete cachedRegisteredUsers[key];
                        // Также убираем guest_name_-записи, ссылающиеся на удалённого игрока
                        var removed = cachedRegisteredUsers[key];
                        if (removed && removed.name) {
                            var ghostKey = 'guest_name_' + removed.name.toLowerCase().replace(/\s+/g, '_');
                            delete cachedRegisteredUsers[ghostKey];
                        }
                    }
                });
            }
            lastRemoteUserIds = Object.keys(val);
            // Убираем ghost-записи гостевых игроков, для которых уже существует
            // реальная запись в users с тем же именем (иначе игрок отображался дважды)
            Object.keys(cachedRegisteredUsers).forEach(function(k) {
                if (k.indexOf('guest_name_') !== 0) return;
                var ghost = cachedRegisteredUsers[k];
                if (!ghost || !ghost.name) return;
                var gName = normalizeSearchText(ghost.name);
                var hasReal = Object.keys(val).some(function(rk) {
                    var ru = val[rk];
                    if (!ru || !ru.name) return false;
                    if (normalizeSearchText(ru.name) !== gName) return false;
                    return true; // одинаковое имя = один игрок, HCP не разделяет
                });
                if (hasReal) delete cachedRegisteredUsers[k];
            });
            // Вычищаем из кэша всех игроков, помеченных как удалённые,
            // а также навсегда заблокированных демо-игроков
            var deleted = [];
            try {
                var dRaw = localStorage.getItem('pestovo_deleted_player_ids');
                if (dRaw) deleted = JSON.parse(dRaw) || [];
            } catch (e) { console.warn("[silent]", e); }
            Object.keys(cachedRegisteredUsers).forEach(function(k) {
                var u = cachedRegisteredUsers[k];
                if (!u) return;
                if (isPlayerDeleted(k, u.name)) { delete cachedRegisteredUsers[k]; return; }
                if (deleted.indexOf(k) !== -1) { delete cachedRegisteredUsers[k]; return; }
                if (u.name) {
                    var nKey = normalizeSearchText(u.name);
                    if (nKey && deleted.indexOf(nKey) !== -1) delete cachedRegisteredUsers[k];
                }
            });
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch (e) { console.warn("[silent]", e); }
        });
        db.ref('rounds').on('value', function(sn) {
            var roundsData = sn.val() || {};
            // Когда все раунды удалены (очистка БД) — раунды не должны «воскрешать»
            // гостевые записи игроков из несуществующих раундов.
            if (!roundsData || typeof roundsData !== 'object' || Object.keys(roundsData).length === 0) {
                return;
            }
            Object.values(roundsData).forEach(function(r) {
                if (r && r.players && typeof r.players === 'object') {
                    Object.entries(r.players).forEach(function(pe) {
                        var pid = pe[0], p = pe[1];
                        if (p && p.name) {
                            var pName = p.name.trim();
                            var normName = normalizeSearchText(pName);
                            // Усиленная проверка: не воскрешаем удалённых и навсегда
                            // заблокированных демо-игроков ни по uid, ни по имени
                            var deleted = [];
                            try {
                                var dRaw = localStorage.getItem('pestovo_deleted_player_ids');
                                if (dRaw) deleted = JSON.parse(dRaw) || [];
                            } catch (e) { console.warn("[silent]", e); }
                            var isDel = (deleted.indexOf(pid) !== -1) || (normName && deleted.indexOf(normName) !== -1) || isBlockedDemoPlayer(pid, pName);
                            if (isDel) return;
                            var key = pid.startsWith('guest_') ? ('guest_name_' + pName.toLowerCase().replace(/\s+/g, '_')) : pid;
                            // Не перезаписываем существующую запись, если игрок уже в кэше с корректными данными —
                            // и только добавляем гостевую запись, если её действительно нет.
                            // Дополнительно: если игрок с таким же именем и HCP уже есть в кэше
                            // (зарегистрированный или гостевой из users) — ghost-дубль не создаём.
                            if (!cachedRegisteredUsers[key]) {
                                var dupInCache = Object.keys(cachedRegisteredUsers).some(function(ck) {
                                    if (ck === key) return false;
                                    var cu = cachedRegisteredUsers[ck];
                                    if (!cu || !cu.name) return false;
                                    if (normalizeSearchText(cu.name) !== normName) return false;
                                    return true; // дедуп по имени, без учета HCP
                                });
                                if (!dupInCache) {
                                    var parts = pName.split(' ');
                                    cachedRegisteredUsers[key] = {
                                        name: pName,
                                        firstName: parts[0] || pName,
                                        lastName: parts.slice(1).join(' ') || '',
                                        handicap: (p.exactHcpRaw != null ? p.exactHcpRaw : (p.exactHcp != null ? p.exactHcp : (p.fieldHcp || 0))),
                                        gender: p.gender || 'men',
                                        defaultTee: p.tee || (p.gender === 'women' ? 'rd' : 'bl'),
                                        isGuest: true
                                    };
                                }
                            }
                        }
                    });
                }
            });
        });
    } catch (e) { console.warn("[silent]", e); }
}

function getKnownPlayersSync() {
    syncKnownPlayersCache();
    return cachedRegisteredUsers;
}
function looksLikePatronymic(s) {
    s = normalizeSearchText(s || '');
    if (!s) return false;
    return /(ович|евич|ич|овна|евна|ична|инична)$/.test(s);
}

function looksLikeLastName(s) {
    s = normalizeSearchText(s || '');
    if (!s || s.length < 3) return false;
    return /(ов|ева|ова|ев|ин|ына|ина|ын|ский|цкий|ская|цкая|енко|ук|юк|ко)$/.test(s);
}

function joinNameParts(parts) {
    return (parts || []).map(function(x) { return String(x || '').trim(); }).filter(Boolean).join(' ');
}

function formatFioLastFirstMiddle(firstName, lastName, middleName) {
    return joinNameParts([lastName, firstName, middleName]);
}

function resolvePlayerNameParts(u) {
    u = u || {};
    var first = String(u.firstName || '').replace(/\s+/g, ' ').trim();
    var middle = String(u.middleName || '').replace(/\s+/g, ' ').trim();
    var last = String(u.lastName || '').replace(/\s+/g, ' ').trim();
    var name = String(u.name || '').replace(/\s+/g, ' ').trim();
    var tokens = name ? name.split(' ').filter(Boolean) : [];

    // Если имя и отчество перепутаны в полях — меняем местами.
    if (first && middle && looksLikePatronymic(first) && !looksLikePatronymic(middle)) {
        var swapped = first;
        first = middle;
        middle = swapped;
    }

    // Имя+отчество в одном поле firstName: «Иван Иванович»
    if (!middle && first && first.indexOf(' ') !== -1) {
        var fp = first.split(' ').filter(Boolean);
        if (fp.length >= 2 && looksLikePatronymic(fp[fp.length - 1])) {
            middle = fp.slice(1).join(' ');
            first = fp[0];
        }
    }

    // Отчество попало в фамилию: «Иванович Петров» или «Петров Иванович»
    if (!middle && last && last.indexOf(' ') !== -1) {
        var lp = last.split(' ').filter(Boolean);
        if (lp.length >= 2 && looksLikePatronymic(lp[0])) {
            middle = lp[0];
            last = lp.slice(1).join(' ');
        } else if (lp.length >= 2 && looksLikePatronymic(lp[lp.length - 1])) {
            middle = lp[lp.length - 1];
            last = lp.slice(0, -1).join(' ');
        }
    }

    // Добираем недостающие части из полного name, учитывая разные порядки.
    if (tokens.length >= 3 && (!first || !last || !middle)) {
        var t0 = tokens[0];
        var t1 = tokens[1];
        var tLast = tokens[tokens.length - 1];
        var tMid = tokens.slice(1, -1).join(' ');
        var tRest = tokens.slice(2).join(' ');
        if (looksLikeLastName(t0) && looksLikePatronymic(t1) && !looksLikePatronymic(tLast)) {
            // «Фамилия Отчество Имя»
            if (!last) last = t0;
            if (!middle) middle = t1;
            if (!first) first = tokens.slice(2).join(' ');
        } else if (looksLikeLastName(t0) && looksLikePatronymic(tLast)) {
            // «Фамилия Имя Отчество»
            if (!last) last = t0;
            if (!first) first = t1;
            if (!middle) middle = tRest;
        } else if (looksLikePatronymic(t1) || looksLikeLastName(tLast)) {
            // «Имя Отчество Фамилия»
            if (!first) first = t0;
            if (!middle) middle = tMid;
            if (!last) last = tLast;
        } else if (looksLikeLastName(t0)) {
            if (!last) last = t0;
            if (!first) first = t1;
            if (!middle) middle = tRest;
        } else {
            if (!first) first = t0;
            if (!last) last = tLast;
            if (!middle) middle = tMid;
        }
    } else if (tokens.length === 2 && (!first || !last)) {
        if (looksLikeLastName(tokens[0]) && !looksLikeLastName(tokens[1])) {
            if (!last) last = tokens[0];
            if (!first) first = tokens[1];
        } else {
            if (!first) first = tokens[0];
            if (!last) last = tokens[1];
        }
    } else if (tokens.length === 1) {
        if (!first && !last) first = tokens[0];
    }

    var displayName = formatFioLastFirstMiddle(first, last, middle) || name;
    return {
        firstName: first,
        lastName: last,
        middleName: middle,
        displayName: displayName,
        storedName: name
    };
}

if (typeof window !== 'undefined') {
    window.resolvePlayerNameParts = resolvePlayerNameParts;
    window.formatFioLastFirstMiddle = formatFioLastFirstMiddle;
}

var currentAutocompleteMatches = [];
var currentAutocompleteCallback = null;
var activeAutocompleteDropdown = null;
function initPlayerSearchAutofill(opts) {
    opts = opts || {};
    var searchInputId = opts.searchInputId;
    var onSelect = opts.onSelect;
    var onClear = opts.onClear;

    var inputEl = document.getElementById(searchInputId);
    if (!inputEl) return;

    inputEl.setAttribute('autocomplete', 'off');
    inputEl.setAttribute('autocorrect', 'off');

    var parent = inputEl.parentElement;
    if (parent) {
        parent.style.position = 'relative';
        parent.style.overflow = 'visible';
    }

    var oldDropdown = parent ? parent.querySelector('.autocomplete-suggestions') : null;
    if (oldDropdown) oldDropdown.remove();

    var dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-suggestions hidden';
    dropdown.style.display = 'none';

    if (parent) {
        parent.appendChild(dropdown);
    } else {
        document.body.appendChild(dropdown);
    }

    var activeMatches = [];
    var highlightedIdx = -1;

    var updateHighlight = function() {
        var items = dropdown.querySelectorAll('.autocomplete-item');
        items.forEach(function(item, i) {
            if (i === highlightedIdx) {
                item.classList.add('active-keyboard');
                try { item.scrollIntoView({ block: 'nearest' }); } catch (e) { console.warn("[silent]", e); }
            } else {
                item.classList.remove('active-keyboard');
            }
        });
    };

    var triggerSelection = function(match) {
        if (!match) return;
        if (typeof onSelect === 'function') {
            onSelect(match);
        }
        dropdown.style.display = 'none';
        dropdown.classList.add('hidden');
        highlightedIdx = -1;
        try { inputEl.blur(); } catch (e) { console.warn("[silent]", e); }
    };

    var handleInput = function() {
        var query = inputEl.value.trim().toLowerCase();
        if (!query || query.length < 1) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
            if (typeof onClear === 'function') onClear();
            return;
        }

        var usersData = getKnownPlayersSync();
        var matches = [];
        var seenKeys = {};

        Object.entries(usersData || {}).forEach(function(e) {
            var uid = e[0];
            var u = e[1];
            var name = (u.name || '').trim();
            var parts = resolvePlayerNameParts(u);
            var fn = parts.firstName;
            var mn = parts.middleName;
            var ln = parts.lastName;
            var email = (u.email || '').trim();

            // Подсказка и выбранная строка: «Фамилия Имя Отчество».
            // Части first/last/middle при этом остаются своими — ими заполняем поля.
            var full = parts.displayName || name;
            if (!full) return;

            // Защита: не показывать удалённых в админке игроков
            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, name)) return;

            // Короткая старая запись «Имя Фамилия» и обновлённая запись
            // «Имя Отчество Фамилия» — один человек. Ключ без HCP и отчества
            // убирает старый guest-вариант из автодобавления после синхронизации.
            var normKey = (fn && ln)
                ? normalizeSearchText(fn + ' ' + ln)
                : normalizeSearchText(full);
            var isGuestEntry = !!u.isGuest || String(uid).indexOf('guest_') === 0;
            var prevUid = seenKeys[normKey];
            if (prevUid !== undefined) {
                // Приоритет: зарегистрированная запись, затем запись с полным ФИО.
                var prev = usersData[prevUid] || {};
                var prevIsGuest = !!prev.isGuest || String(prevUid).indexOf('guest_') === 0;
                var prevMiddle = String(prev.middleName || '').trim();
                var preferNew = (prevIsGuest && !isGuestEntry) ||
                    (prevIsGuest === isGuestEntry && !prevMiddle && !!mn);
                if (preferNew) {
                    matches = matches.filter(function(m) { return m.uid !== prevUid; });
                } else {
                    return;
                }
            }

            var fnLower = fn.toLowerCase();
            var mnLower = mn.toLowerCase();
            var lnLower = ln.toLowerCase();
            var fullLower = full.toLowerCase();
            var nameLower = name.toLowerCase();

            var isPrefixMatch = (fnLower.startsWith(query) || mnLower.startsWith(query) || lnLower.startsWith(query) || fullLower.startsWith(query) || nameLower.startsWith(query) || fullLower.includes(query));

            if (isPrefixMatch) {
                seenKeys[normKey] = uid;
                var playerObj = {
                    uid: uid,
                    name: full,
                    firstName: fn,
                    lastName: ln,
                    middleName: mn,
                    handicap: u.handicap != null ? u.handicap : 0,
                    gender: u.gender || 'men',
                    defaultTee: u.defaultTee || (u.gender === 'women' ? 'rd' : 'bl'),
                    isGuest: isGuestEntry
                };
                matches.push(playerObj);
            }
        });

        if (matches.length === 0) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
            return;
        }

        activeMatches = matches;
        currentAutocompleteMatches = matches;
        currentAutocompleteCallback = onSelect;
        activeAutocompleteDropdown = dropdown;
        highlightedIdx = -1;

        var html = '';
        matches.slice(0, 8).forEach(function(m, idx) {
            var gIcon = m.gender === 'women' ? '👩' : '👨';
            var hcpText = fmtExactHcp(m.handicap) + ' HCP';
            // Пометка «Гость» в подсказках убрана — все игроки выглядят одинаково.
            var guestTag = '';

            html += '<div class="autocomplete-item" data-idx="' + idx + '" style="padding:12px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.08);min-height:44px;">';
            html += '<span>' + gIcon + ' <strong style="color:var(--white);font-size:14px;">' + escapeHtml(m.name) + '</strong>' + guestTag + '</span>';
            html += '<span style="color:var(--gold);font-weight:700;font-size:13px;">' + hcpText + '</span>';
            html += '</div>';
        });

        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
        dropdown.classList.remove('hidden');

        dropdown.querySelectorAll('.autocomplete-item').forEach(function(item) {
            // На телефоне список нужно уметь ПРОКРУЧИВАТЬ: раньше touchstart
            // с preventDefault мгновенно выбирал строку под пальцем и не давал
            // скроллу сработать (было видно только ~3 имени из 7+).
            // Теперь выбор происходит на touchend только если палец не
            // сместился (это был тап, а не прокрутка списка).
            var touch = null;
            var suppressClick = false;

            item.addEventListener('touchstart', function(evt) {
                var t = evt.touches && evt.touches[0];
                touch = t ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
            }, { passive: true });

            item.addEventListener('touchmove', function(evt) {
                if (!touch) return;
                var t = evt.touches && evt.touches[0];
                if (t && (Math.abs(t.clientY - touch.y) > 10 || Math.abs(t.clientX - touch.x) > 10)) {
                    touch.moved = true; // это жест прокрутки, а не тап
                }
            }, { passive: true });

            item.addEventListener('touchend', function(evt) {
                if (!touch) return;
                var dt = Date.now() - touch.t;
                var wasTap = !touch.moved && dt < 600;
                touch = null;
                if (!wasTap) { suppressClick = true; setTimeout(function(){ suppressClick = false; }, 400); return; }
                evt.preventDefault();
                evt.stopPropagation();
                var idx = parseInt(item.getAttribute('data-idx'));
                var match = activeMatches[idx];
                if (match) triggerSelection(match);
                suppressClick = true;
                setTimeout(function(){ suppressClick = false; }, 400);
            });

            item.addEventListener('mousedown', function(evt) {
                if (suppressClick) return;
                evt.preventDefault();
                evt.stopPropagation();
                var idx = parseInt(item.getAttribute('data-idx'));
                var match = activeMatches[idx];
                if (match) triggerSelection(match);
            });

            item.addEventListener('click', function(evt) {
                if (suppressClick) { evt.preventDefault(); evt.stopPropagation(); return; }
                evt.stopPropagation();
                var idx = parseInt(item.getAttribute('data-idx'));
                var match = activeMatches[idx];
                if (match) triggerSelection(match);
            });
        });
    };

    inputEl.addEventListener('keydown', function(e) {
        if (dropdown.style.display === 'none' || activeMatches.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIdx = (highlightedIdx + 1) % activeMatches.length;
            updateHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIdx = (highlightedIdx - 1 + activeMatches.length) % activeMatches.length;
            updateHighlight();
        } else if (e.key === 'Enter') {
            if (highlightedIdx >= 0 && highlightedIdx < activeMatches.length) {
                e.preventDefault();
                triggerSelection(activeMatches[highlightedIdx]);
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
        }
    });

    inputEl.addEventListener('input', handleInput);
    inputEl.addEventListener('focus', handleInput);

    document.addEventListener('touchstart', function(e) {
        if (e.target !== inputEl && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
        }
    });
    document.addEventListener('click', function(e) {
        if (e.target !== inputEl && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
            dropdown.classList.add('hidden');
            highlightedIdx = -1;
        }
    });
}

// ==========================================
// КОНФИДЕНЦИАЛЬНОСТЬ ИМЁН (ФИО)
// Админ может скрывать полные имена игроков (имя/фамилия/отчество) от других
// игроков и гостей. Вместо ФИО показываются инициалы («И. Т.») или маска
// («Игрок №N»). Гандикап и история раундов остаются доступны. Админ и сам
// игрок всегда видят своё имя. Настройки: settings/privacy в Firebase:
//   { enabled: bool, maskMode: 'initials'|'masked', players: { uid: bool } }
// Для конкретного игрока players[uid]=true — скрыть (перекрывает глобальный
// выключатель), players[uid]=false — показывать, даже если включено глобально.
// ==========================================
var pestovoPrivacy = { enabled: false, maskMode: 'initials', players: {}, loaded: false };

function initPrivacySettings() {
    // Начальные значения из локального кэша (офлайн/при первом кадре)
    try {
        var cached = localStorage.getItem('pestovo_privacy');
        if (cached) {
            var c = JSON.parse(cached);
            if (c && typeof c === 'object') {
                pestovoPrivacy.enabled = c.enabled === true;
                pestovoPrivacy.maskMode = c.maskMode === 'masked' ? 'masked' : 'initials';
                pestovoPrivacy.players = c.players || {};
            }
        }
    } catch (e) { console.warn("[silent]", e); }

    if (typeof db === 'undefined') { pestovoPrivacy.loaded = true; return; }
    try {
        db.ref('settings/privacy').on('value', function(sn) {
            var v = sn.val() || {};
            pestovoPrivacy.enabled = v.enabled === true;
            pestovoPrivacy.maskMode = v.maskMode === 'masked' ? 'masked' : 'initials';
            pestovoPrivacy.players = v.players || {};
            pestovoPrivacy.loaded = true;
            try {
                localStorage.setItem('pestovo_privacy', JSON.stringify({
                    enabled: pestovoPrivacy.enabled,
                    maskMode: pestovoPrivacy.maskMode,
                    players: pestovoPrivacy.players
                }));
            } catch (e2) { console.warn("[silent]", e2); }
            // После обновления настроек приватности — перерисуем открытые блоки на главной
            if (typeof renderPrivacySensitiveHome === 'function') renderPrivacySensitiveHome();
        }, function() {});
    } catch (e) { pestovoPrivacy.loaded = true; }
}

// Текущий пользователь — администратор (по данным профиля или флагу сессии).
// Нужен для служебных уведомлений, которые видны только админу
// (завершение турнира, доступность протокола результатов).
function pestovoIsAdminViewer() {
    try {
        if (typeof hasAdminPanelAccess === 'function') return !!hasAdminPanelAccess();
    } catch (e) { console.warn("[silent]", e); }
    try {
        if (typeof currentUserData !== 'undefined' && currentUserData && currentUserData.role === 'admin') return true;
        if (typeof sessionStorage !== 'undefined' && sessionStorage && sessionStorage.getItem('pestovo_is_admin') === 'true') return true;
    } catch (e) { console.warn("[silent]", e); }
    return false;
}

function privacyIsAdmin() {
    return pestovoIsAdminViewer();
}

function privacyShouldHide(pid) {
    if (typeof currentUser !== 'undefined' && currentUser && pid && currentUser.uid === pid) return false;
    if (privacyIsAdmin()) return false;
    if (!pid) return false;
    var ind = pestovoPrivacy.players && pestovoPrivacy.players[pid];
    if (ind === false) return false;   // явное «показывать» для этого игрока
    if (ind === true) return true;     // явное «скрыть» для этого игрока
    return pestovoPrivacy.enabled === true;
}

function privacyMaskNumber(s) {
    var h = 0;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
    return (h % 999) + 1;
}

function privacyMaskName(name, pid) {
    if (pestovoPrivacy.maskMode === 'masked') {
        var word = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'Player' : 'Игрок';
        return word + ' №' + privacyMaskNumber(pid || name);
    }
    // Инициалы: «Иван Тестов» → «И. Т.»
    var parts = String(name || '').replace(/\s+/g, ' ').trim().split(' ');
    var initials = parts.filter(Boolean).slice(0, 2).map(function(w) { return w.charAt(0).toUpperCase() + '.'; }).join(' ');
    return initials || '?';
}

function playerDisplayName(p, pid) {
    if (!p) return '—';
    var name = p.name && String(p.name).trim();
    if (!name && (p.firstName || p.lastName || p.middleName)) {
        name = [p.firstName, p.middleName, p.lastName].filter(function(x) {
            return x && String(x).trim();
        }).map(function(x) { return String(x).trim(); }).join(' ');
    }
    return name || '—';
}

function privacyDisplayName(p, pid) {
    if (!p) return '—';
    var name = playerDisplayName(p, pid);
    if (privacyShouldHide(pid)) return privacyMaskName(name, pid);
    return name;
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof initPrivacySettings === 'function') initPrivacySettings();
});

// ============================================================
// РАЗМЕРЫ ФЛАЙТОВ БЕЗ ГРУПП ПО 2 ЧЕЛОВЕКА
// ------------------------------------------------------------
// pestovoBalancedFlightSizes(total, preferSize) возвращает массив размеров
// флайтов (сумма = total), в котором нет групп по 1–2 человека, если это
// вообще возможно. Хвост по 2 перераспределяется: вместо 4+4+…+2 получаются
// тройки (например 14 игроков → 4+4+3+3, 9 игроков → 3+3+3).
// Неизбежные исключения: total<=5 при preferSize>=3 (5 = 3+2) и total<=2.
// preferSize 1–2 означает явный выбор админа — уважаем его как есть.
// Используется и в «Старте турнира», и в генераторе флайтов.
// ============================================================
function pestovoBalancedFlightSizes(total, preferSize) {
    total = Math.max(0, parseInt(total, 10) || 0);
    preferSize = parseInt(preferSize, 10) || 4;
    if (total <= 0) return [];
    if (total === 1) return [1];
    if (total === 2) return [2];
    if (preferSize <= 2) {
        // Явный выбор админа: режем строго по размеру, хвост как есть.
        var outSmall = [];
        var left = total;
        while (left > preferSize) { outSmall.push(preferSize); left -= preferSize; }
        outSmall.push(left);
        return outSmall;
    }
    if (preferSize >= 4) {
        var full = Math.floor(total / 4);
        var rem = total % 4;
        var out = [];
        var i;
        if (rem === 0) {
            for (i = 0; i < full; i++) out.push(4);
            return out;
        }
        if (rem === 3) {
            for (i = 0; i < full; i++) out.push(4);
            out.push(3);
            return out;
        }
        if (rem === 2) {
            // total>=6 здесь всегда (меньшие разобраны выше): 6 → 3+3, 10 → 4+3+3.
            for (i = 0; i < full - 1; i++) out.push(4);
            out.push(3); out.push(3);
            return out;
        }
        // rem === 1: забираем две четвёрки и делаем три тройки (13 → 4+3+3+3)
        if (full >= 2) {
            for (i = 0; i < full - 2; i++) out.push(4);
            out.push(3); out.push(3); out.push(3);
            return out;
        }
        // total = 5 или 9: 5 → 3+2 (неизбежно), 9 → 3+3+3
        if (total === 9) return [3, 3, 3];
        return [3, 2];
    }
    // preferSize === 3: базовые тройки, хвост по 1–2 чиним четвёрками.
    var full3 = Math.floor(total / 3);
    var rem3 = total % 3;
    var out3 = [];
    var j;
    if (rem3 === 0) {
        for (j = 0; j < full3; j++) out3.push(3);
        return out3;
    }
    if (rem3 === 1) {
        if (full3 < 1) return [total]; // total=1 уже обработан выше
        for (j = 0; j < full3 - 1; j++) out3.push(3);
        out3.push(4); // 7 → 3+4, 4 → 4
        return out3;
    }
    // rem3 === 2: две тройки + хвост 2 → две четвёрки (8 → 4+4)
    if (full3 >= 2) {
        for (j = 0; j < full3 - 2; j++) out3.push(3);
        out3.push(4); out3.push(4);
        return out3;
    }
    return [3, 2]; // total = 5, неизбежно
}

// ============================================================
// ФОРМАТЫ ИГРЫ ТУРНИРА (единый список для всего сайта)
// ------------------------------------------------------------
// Gross — игра на валовые удары без учёта гандикапа,
// Net — с учётом гандикапа. Строки хранятся как есть в поле
// tournaments/<id>/formats и rounds/<id>/format.
// ============================================================
var PESTOVO_FORMAT_PRESETS = [
    'Stroke Play',
    'Stroke Play (Gross)',
    'Stroke Play (Net)',
    'Stableford',
    'Match Play 1v1',
    'Match Play 2v2',
    'Scramble',
    'Texas Scramble',
    'Greensomes'
];

function pestovoFormatLabel(f) {
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    if (f === 'Stroke Play') return en ? 'Stroke Play' : 'Stroke Play';
    if (f === 'Stroke Play (Gross)') return en ? 'Gross (no handicap)' : 'Гросс (без учёта HCP)';
    if (f === 'Stroke Play (Net)') return en ? 'Net (with handicap)' : 'Нетто (с учётом HCP)';
    if (f === 'Stableford') return en ? 'Stableford (points)' : 'Stableford (очки)';
    if (f === 'Match Play 1v1') return en ? 'Match Play (1v1)' : 'Match Play (1×1)';
    if (f === 'Match Play 2v2') return en ? 'Match Play (2v2)' : 'Match Play (2×2)';
    return String(f == null ? '' : f);
}

// ============================================================
// ТУРНИРНЫЕ ГРУППЫ ПО ГАНДИКАПУ (дивизионы) + ОБРЕЗКА ГАНДИКАПА
// ------------------------------------------------------------
// Дивизион турнира: { id, name, gender: 'men'|'women'|'all',
//                     hcpFrom, hcpTo, tee: 'bk'|'bl'|'wh'|'rd'|'' }
// Хранится в tournaments/<id>/divisions (объект или массив).
// Обрезка гандикапа (только для текущего турнира):
//   cut = { enabled, percent, maxEnabled, maxMen, maxWomen }
// Сначала применяется процент, затем максимум по полу.
// ============================================================
function tnNormalizeDivisions(tVal) {
    var raw = tVal ? tVal.divisions : null;
    if (!raw) return [];
    var arr = Array.isArray(raw) ? raw.slice() : Object.keys(raw).map(function(k) {
        var d = raw[k] || {};
        if (!d.id) d.id = k;
        return d;
    });
    arr = arr.filter(function(d) { return d && (d.name || d.hcpFrom != null || d.hcpTo != null); });
    arr.sort(function(a, b) {
        var ga = (a.gender || 'all'), gb = (b.gender || 'all');
        var order = { men: 0, women: 1, all: 2 };
        if ((order[ga] == null ? 3 : order[ga]) !== (order[gb] == null ? 3 : order[gb])) {
            return (order[ga] == null ? 3 : order[ga]) - (order[gb] == null ? 3 : order[gb]);
        }
        var fa = (a.hcpFrom === '' || a.hcpFrom == null) ? -999 : parseFloat(a.hcpFrom);
        var fb = (b.hcpFrom === '' || b.hcpFrom == null) ? -999 : parseFloat(b.hcpFrom);
        if (isNaN(fa)) fa = -999;
        if (isNaN(fb)) fb = -999;
        return fa - fb;
    });
    return arr;
}

function tnDivisionGenderOk(divGender, playerGender) {
    var g = divGender || 'all';
    if (g === 'all') return true;
    // Страховка от неканоничных значений пола в старых данных
    // ('f'/'female'/'жен' → 'women', прочее — 'men').
    var p = playerGender;
    if (p !== 'men' && p !== 'women') {
        var s = String(p == null ? '' : p).toLowerCase();
        if (s === 'w' || s === 'f' || s === 'women' || s === 'woman' || s === 'female' || s.indexOf('жен') === 0 || s.indexOf('дев') === 0) p = 'women';
        else p = 'men';
    }
    return p === g;
}

// Точный состав группы, созданной «Умными группами» (auto).
// Хранится как { <ключ заявки>: <нормализованное ФИО> } — это позволяет
// однозначно определить группу игрока даже там, где ключ в раунде отличается
// от ключа заявки (турнирный протокол создаёт игроков по uid/ФИО).
function tnDivisionMembers(d) {
    if (!d || !d.members || typeof d.members !== 'object') return null;
    return d.members;
}

// Нормализованный ключ ФИО (для сопоставления по имени, как в tnDedupeRoster).
function tnDivisionFioKey(name) {
    var s = String(name == null ? '' : name).toLowerCase().replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
    return s;
}

// Канонический ключ ФИО НЕЗАВИСИМЫЙ от порядка слов:
// «Тестов Иван Петрович» и «Иван Петрович Тестов» дают один ключ.
// Используется для сопоставления состава групп, где имя могло быть
// записано в любом порядке (заявка vs стартовый лист).
function tnDivisionFioSetKey(name) {
    var s = tnDivisionFioKey(name);
    if (!s) return '';
    return s.split(' ').sort().join(' ');
}

// Входит ли игрок в точный состав группы. memberRef — строка (pid) либо
// объект { pid, name, fioKey }. Совпадение по ФИО ищем и точным ключом,
// и независимым от порядка (старые данные хранят «Имя Отчество Фамилия»,
// а вызывающий код может передать «Фамилия Имя Отчество»).
function tnDivisionHasMember(d, memberRef) {
    var members = tnDivisionMembers(d);
    if (!members) return false;
    var pid = '', fio = '';
    if (memberRef && typeof memberRef === 'object') {
        pid = memberRef.pid != null ? String(memberRef.pid) : '';
        fio = memberRef.fioKey || tnDivisionFioKey(memberRef.name || memberRef.fio || '');
    } else if (memberRef != null) {
        pid = String(memberRef);
        fio = tnDivisionFioKey(memberRef);
    }
    if (pid && Object.prototype.hasOwnProperty.call(members, pid)) return true;
    if (fio) {
        var fioSet = tnDivisionFioSetKey(fio);
        var keys = Object.keys(members);
        for (var i = 0; i < keys.length; i++) {
            var v = String(members[keys[i]] || '');
            if (v === fio || (fioSet && tnDivisionFioSetKey(v) === fioSet)) return true;
        }
    }
    return false;
}

function tnFindDivision(tVal, handicap, gender, memberRef) {
    var divs = tnNormalizeDivisions(tVal);
    if (!divs.length) return null;
    gender = gender || 'men';
    // 1. Точный состав «умных групп» важнее диапазона гандикапа: границы
    //    соседних групп могут соприкасаться (28–28 и 28–28), и по диапазону
    //    игрок попадал бы не в свою группу.
    if (memberRef) {
        for (var mi = 0; mi < divs.length; mi++) {
            var dm = divs[mi];
            if (!tnDivisionGenderOk(dm.gender, gender)) continue;
            if (tnDivisionHasMember(dm, memberRef)) return dm;
        }
    }
    // 2. Диапазон гандикапа (ручные группы и старые данные без состава).
    // Округляем до 0.1 — точный гандикап и границы групп хранятся с шагом
    // 0.1, а сравнение «в лоб» плавает из-за двоичных ошибок (35.9 против
    // границы 36, 36.04 и т.п.). Без этого игрок на границе мог выпасть
    // в «Без группы».
    var h = (handicap === '' || handicap == null) ? null : parseFloat(handicap);
    if (h == null || isNaN(h)) return null;
    h = Math.round(h * 10) / 10;
    for (var i = 0; i < divs.length; i++) {
        var d = divs[i];
        if (!tnDivisionGenderOk(d.gender, gender)) continue;
        var from = (d.hcpFrom === '' || d.hcpFrom == null) ? -999 : parseFloat(d.hcpFrom);
        var to = (d.hcpTo === '' || d.hcpTo == null) ? 999 : parseFloat(d.hcpTo);
        if (isNaN(from)) from = -999;
        if (isNaN(to)) to = 999;
        from = Math.round(from * 10) / 10;
        to = Math.round(to * 10) / 10;
        if (h + 1e-9 >= from && h - 1e-9 <= to) return d;
    }
    return null;
}

function tnDivisionRangeText(div) {
    if (!div) return '';
    var f = (div.hcpFrom === '' || div.hcpFrom == null) ? null : parseFloat(div.hcpFrom);
    var t = (div.hcpTo === '' || div.hcpTo == null) ? null : parseFloat(div.hcpTo);
    var fmt = function(v) {
        if (v == null || isNaN(v)) return '';
        if (typeof fmtExactHcp === 'function') return fmtExactHcp(v);
        return String(v);
    };
    if (f != null && !isNaN(f) && t != null && !isNaN(t)) return fmt(f) + '–' + fmt(t);
    if (f != null && !isNaN(f)) return fmt(f) + '+';
    if (t != null && !isNaN(t)) return '–' + fmt(t);
    return '';
}

function tnDivisionGenderText(g) {
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');
    if (g === 'men') return en ? 'Men' : 'Мужчины';
    if (g === 'women') return en ? 'Women' : 'Девушки';
    return en ? 'All' : 'Все';
}

// Обрезка точного гандикапа для турнира.
// cut = { enabled: bool, percent: 1..100,
//         maxEnabled: bool, maxMen: number|null, maxWomen: number|null }
// Порядок (с v1.46.0): СНАЧАЛА процент, ЗАТЕМ максимум по полу.
//   точный HCP → процент → новый точный обрезанный → (максимум по полу) → полевой.
// Процент и максимум включаются НЕЗАВИСИМО: можно резать только процентами,
// только максимумом по полу или и тем, и другим сразу.
// Возвращает { raw, afterPercent, capped, effective, cappedByMax, cutApplied }.
function tnApplyHcpCut(exactHcp, gender, cut) {
    var raw = (exactHcp === '' || exactHcp == null) ? 0 : parseFloat(exactHcp);
    if (isNaN(raw)) raw = 0;
    var out = { raw: raw, afterPercent: raw, capped: raw, effective: raw, cappedByMax: false, cutApplied: false };
    cut = cut || {};
    // Шаг 1: процент (если включён).
    var eff = raw;
    if (cut.enabled) {
        var pct = parseFloat(cut.percent);
        if (isNaN(pct) || pct <= 0) pct = 100;
        if (pct > 100) pct = 100;
        if (pct < 100 - 1e-9) {
            eff = Math.round(raw * pct) / 100;
            out.cutApplied = true;
        }
    }
    out.afterPercent = Math.round(eff * 10) / 10;
    // Шаг 2: максимум по полу (если включён).
    // Старые протоколы (до v1.46.0) флага maxEnabled не имеют — для них максимум
    // действует, как раньше, если значение задано.
    var maxOn = (cut.maxEnabled === undefined || cut.maxEnabled === null)
        ? ((cut.maxMen !== '' && cut.maxMen != null) || (cut.maxWomen !== '' && cut.maxWomen != null))
        : (cut.maxEnabled === true);
    var maxV = null;
    if ((gender || 'men') === 'women') maxV = (cut.maxWomen === '' || cut.maxWomen == null) ? null : parseFloat(cut.maxWomen);
    else maxV = (cut.maxMen === '' || cut.maxMen == null) ? null : parseFloat(cut.maxMen);
    if (maxOn && maxV != null && !isNaN(maxV) && eff > maxV) {
        eff = maxV;
        out.cappedByMax = true;
        out.cutApplied = true;
    }
    out.capped = eff;
    out.effective = Math.round(eff * 10) / 10;
    return out;
}

// Полевой гандикап турнира с учётом обрезки (сначала процент, затем максимум по полу).
function roundTournamentName(r) {
    if (!r || typeof r !== 'object') return '';
    var name = String(r.tournamentName || '').trim();
    if (!name) {
        var proto = String(r.protocolName || '').trim();
        if (proto) name = proto.replace(/\s*[·•]\s*(старт|start)\s*$/i, '').trim();
    }
    return name;
}

function isTournamentRound(r) {
    if (!r || typeof r !== 'object') return false;
    if (r.tournamentId || r.protocolId) return true;
    return !!roundTournamentName(r);
}

// Идёт ли турнир прямо сейчас. Главная страница и каталог должны
// согласованно читать и legacy-поле status, и lifecycleStatus v2:
// админка v2 пишет lifecycleStatus='active', а старый старт — status='active'.
// Завершённые/отменённые/черновики никогда не считаются live.
function isLiveTournament(t) {
    if (!t || typeof t !== 'object') return false;
    var st = String(t.status || '').toLowerCase();
    var lc = String(t.lifecycleStatus || (t.lifecycle && t.lifecycle.status) || '').toLowerCase();
    if (lc === 'published') lc = 'registration';
    if (st === 'completed' || st === 'cancelled' ||
        lc === 'completed' || lc === 'cancelled' || lc === 'draft') return false;
    if (st === 'active' || lc === 'active') return true;
    if (t.startedAt && !t.finishedAt) return true;
    return false;
}

function updateRoundEventBanner(roundData) {
    var banner = (typeof document !== 'undefined') ? document.getElementById('round-event-banner') : null;
    if (!banner) return;
    var name = roundTournamentName(roundData);
    if (!name) {
        banner.classList.add('hidden');
        return;
    }
    banner.classList.remove('hidden');
    var title = document.getElementById('round-event-title');
    var sub = document.getElementById('round-event-sub');
    if (title) title.textContent = name;
    if (sub) {
        var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        var bits = [];
        if (roundData && roundData.groupNo) bits.push((isEn ? 'Group ' : 'Группа ') + roundData.groupNo);
        if (roundData && roundData.format) bits.push(roundData.format);
        sub.textContent = bits.join(' · ');
    }
}
// ==========================================================
// СТАРТ ТУРНИРА: РАУНДЫ АКТИВНЫ ТОЛЬКО ПОСЛЕ СТАРТА
// ----------------------------------------------------------
// Раунды, созданные из стартового протокола заранее, получают статус
// «scheduled» и поле scheduledStart (момент старта турнира). Игрок, который
// отсканировал QR раньше времени, видит таймер обратного отсчёта и НЕ может
// вводить счёт. Раунд становится игровым ровно в момент старта:
//   1) автоматически — по совпадению даты и времени (см. pestovoAutoStartRounds),
//   2) вручную — кнопкой «Старт» в админ-меню (tnStartTournament).
// ==========================================================

// Статус раунда, который ещё не стартовал (создан протоколом заранее).
var ROUND_STATUS_SCHEDULED = 'scheduled';

// Время старта турнира из даты (YYYY-MM-DD) и времени (HH:MM).
function pestovoStartTsFromParts(dateStr, timeStr) {
    var d = String(dateStr || '').trim();
    var tm = String(timeStr || '').trim();
    if (!d) return 0;
    if (!tm) tm = '09:00';
    var ts = new Date(d + 'T' + (tm.indexOf(':') === 4 ? tm : tm + ':00')).getTime();
    if (!isNaN(ts)) return ts;
    // Запасной разбор: «9:00» / «09:00:00»
    var parts = tm.split(':');
    var base = new Date(d + 'T00:00:00').getTime();
    if (isNaN(base)) return 0;
    return base + ((parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60) * 1000;
}

// Момент старта раунда: явное поле scheduledStart (ставится при создании из
// протокола) → startTime раунда → 0, если раунд не турнирный/без времени.
function roundScheduledStartTs(r) {
    if (!r || typeof r !== 'object') return 0;
    return parseInt(r.scheduledStart, 10) || parseInt(r.startTime, 10) || 0;
}

// Открыт ли раунд для ввода счёта прямо сейчас.
// «active» — всегда; «scheduled» — только когда наступил момент старта;
// «completed» и прочие — нет. Раунды без статуса (старые данные) считаем
// активными, чтобы не ломать обычные раунды.
// Открыт ли раунд для ввода счёта. playerId (необязательный) — если раунд
// уже завершён, но ИМЕННО ЭТОТ игрок ещё не сдал свою карточку (не отмечен в
// finishedPlayers), ввод ему остаётся доступен: раньше первый завершивший
// переводил всю группу в «режим просмотра», и остальные не могли доиграть.
function isRoundOpenForScoring(r, nowTs, playerId) {
    if (!r || typeof r !== 'object') return false;
    var st = String(r.status || 'active');
    if (st === 'scheduled') {
        var startTs = roundScheduledStartTs(r);
        if (!startTs) return false;             // без времени старта не открываем
        return (parseInt(nowTs, 10) || Date.now()) >= startTs;
    }
    if (playerId) {
        var pid = String(playerId);
        var players = r.players || {};
        if (!players[pid]) return false;        // наблюдателю ввод не открываем
        if (isPlayerFinishedRound(r, pid)) return false; // сдавшему карточку ввод закрыт
        return true;                            // ещё не сдавший продолжает играть
    }
    if (st === 'completed') {
        var pending = roundPendingPlayers(r);
        return pending.length > 0;
    }
    return st === 'active' || st === '';
}

// Игрок уже завершил свою карточку в этом раунде?
function isPlayerFinishedRound(r, playerId) {
    if (!r || !playerId) return false;
    var pid = String(playerId);
    if (r.finishedPlayers && r.finishedPlayers[pid]) return true;
    if (String(r.status || '') === 'completed' && String(r.completedBy || '') === pid) return true;
    return false;
}

// Есть ли в раунде игроки, которые ещё не сдали карточку (и повод держать
// раунд открытым, даже если кто-то уже нажал «Завершить»).
function roundPendingPlayers(r) {
    if (!r || typeof r !== 'object') return [];
    var players = r.players || {};
    var fin = r.finishedPlayers || {};
    return Object.keys(players).filter(function(pid) {
        if (fin[pid]) return false;
        if (String(r.status || '') === 'completed' && String(r.completedBy || '') === pid) return false;
        return true;
    });
}

// Раунд «заперт» стартом турнира: создан заранее, старт ещё не наступил.
function isRoundGatedByStart(r, nowTs) {
    if (!r || typeof r !== 'object') return false;
    if (String(r.status || 'active') !== ROUND_STATUS_SCHEDULED) return false;
    return !isRoundOpenForScoring(r, nowTs);
}

// Сколько миллисекунд осталось до старта (0 — если уже можно играть).
function roundStartCountdownMs(r, nowTs) {
    if (!isRoundGatedByStart(r, nowTs)) return 0;
    var startTs = roundScheduledStartTs(r);
    var left = startTs - ((parseInt(nowTs, 10) || Date.now()));
    return left > 0 ? left : 0;
}

// «01:05:09» — часы:минуты:секунды; до часа показываем «05:09»,
// больше суток — «2 дн. 05:09:00».
function formatStartCountdown(ms) {
    var total = Math.max(0, Math.ceil((parseInt(ms, 10) || 0) / 1000));
    var d = Math.floor(total / 86400);
    var h = Math.floor((total % 86400) / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var hh = (h < 10 ? '0' : '') + h;
    var mm = (m < 10 ? '0' : '') + m;
    var ss = (s < 10 ? '0' : '') + s;
    if (d > 0) {
        var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
        return d + (isEn ? 'd ' : ' дн. ') + hh + ':' + mm + ':' + ss;
    }
    return h > 0 ? (hh + ':' + mm + ':' + ss) : (mm + ':' + ss);
}

// Какие «запланированные» раунды пора открыть (старт наступил).
// Возвращает { roundIds: [...], tournamentIds: [...] } — чистая функция,
// её проверяют автотесты; запись в базу делает pestovoActivateRounds.
function roundsDueForStart(roundsData, nowTs) {
    var now = parseInt(nowTs, 10) || Date.now();
    var roundIds = [], tournamentIds = [], seenTn = {};
    Object.keys(roundsData || {}).forEach(function(rid) {
        var r = roundsData[rid];
        if (!r || typeof r !== 'object') return;
        if (String(r.status || '') !== ROUND_STATUS_SCHEDULED) return;
        if (!isRoundOpenForScoring(r, now)) return;
        roundIds.push(rid);
        var tnId = r.tournamentId;
        if (tnId && !seenTn[tnId]) { seenTn[tnId] = true; tournamentIds.push(tnId); }
    });
    return { roundIds: roundIds, tournamentIds: tournamentIds };
}

// Открывает раунды, у которых наступил старт, и переводит их турниры в active.
// Вызывается админ-панелью (подписка на раунды + таймер) и страницей игрока,
// когда отсчёт дошёл до нуля. Ошибки записи не критичны: статус пересчитается
// у других клиентов по времени (isRoundOpenForScoring).
function pestovoActivateRounds(due, opts) {
    opts = opts || {};
    if (typeof db === 'undefined' || !db || !due) return Promise.resolve({ rounds: 0, tournaments: 0 });
    var updates = {};
    var now = Date.now();
    (due.roundIds || []).forEach(function(rid) {
        updates['rounds/' + rid + '/status'] = 'active';
        updates['rounds/' + rid + '/activatedAt'] = now;
    });
    (due.tournamentIds || []).forEach(function(tnId) {
        updates['tournaments/' + tnId + '/status'] = 'active';
        updates['tournaments/' + tnId + '/lifecycleStatus'] = 'active';
        updates['tournaments/' + tnId + '/startedAt'] = now;
    });
    if (!Object.keys(updates).length) return Promise.resolve({ rounds: 0, tournaments: 0 });
    return db.ref().update(updates).then(function() {
        return { rounds: (due.roundIds || []).length, tournaments: (due.tournamentIds || []).length };
    }).catch(function(err) {
        if (!opts.silent && typeof console !== 'undefined') {
            try { console.warn('[Tournament start] cannot activate rounds', err); } catch (e) { console.warn("[silent]", e); }
        }
        return { rounds: 0, tournaments: 0, error: err };
    });
}

// Проход по снимку раундов: открыть всё, что пора, и сообщить об этом.
// Используется админ-панелью на каждом обновлении списка раундов.
function pestovoAutoStartRounds(roundsData, opts) {
    opts = opts || {};
    var due = roundsDueForStart(roundsData, Date.now());
    if (!due.roundIds.length) return Promise.resolve(null);
    return pestovoActivateRounds(due, opts).then(function(res) {
        if (res && res.rounds && opts.notify !== false && typeof toast === 'function') {
            var isEn = (typeof currentLang !== 'undefined' && currentLang === 'en');
            toast('🏁 ' + (isEn
                ? 'Tournament started: ' + res.rounds + ' round(s) opened for scoring'
                : 'Турнир стартовал: открыто раундов для ввода счёта — ' + res.rounds), 'success');
        }
        return res;
    });
}

// Старт турнира вручную из админ-меню: сам турнир + все его запланированные
// раунды становятся активными сразу, не дожидаясь времени.
function pestovoStartTournamentNow(tnId) {
    if (typeof db === 'undefined' || !db || !tnId) return Promise.resolve(false);
    var now = Date.now();
    // При старте подтягиваем гандикапные группы турнира: ТИ группы («ти
    // стартовой группы» = ТИ дивизиона из «умных групп» или ручной группы)
    // применяется к игрокам раунда этой группы (#1.60). Если группы нет —
    // действует ТИ, сохранённый в раунде при создании протокола.
    return Promise.all([
        db.ref('rounds').once('value'),
        db.ref('tournaments/' + tnId + '/divisions').once('value').catch(function() { return null; })
    ]).then(function(res) {
        var data = res[0].val() || {};
        var divRaw = (res[1] && res[1].val) ? res[1].val() : null;
        var divisions = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions({ divisions: divRaw }) : [];
        var updates = {};
        updates['tournaments/' + tnId + '/status'] = 'active';
        updates['tournaments/' + tnId + '/lifecycleStatus'] = 'active';
        updates['tournaments/' + tnId + '/startedAt'] = now;
        var opened = 0;
        Object.keys(data).forEach(function(rid) {
            var r = data[rid];
            if (!r || typeof r !== 'object') return;
            if (String(r.tournamentId || '') !== String(tnId)) return;
            var isScheduled = String(r.status || '') === ROUND_STATUS_SCHEDULED;
            if (isScheduled) {
                updates['rounds/' + rid + '/status'] = 'active';
                updates['rounds/' + rid + '/activatedAt'] = now;
                opened++;
            }
            // ТИ по гандикапной группе игрока
            if (divisions.length && r.players) {
                Object.keys(r.players).forEach(function(pid) {
                    var p = r.players[pid] || {};
                    var hcp = (p.exactHcp != null) ? p.exactHcp : (p.exactHcpRaw != null ? p.exactHcpRaw : p.handicap);
                    var div = (typeof tnFindDivision === 'function')
                        ? tnFindDivision({ divisions: divRaw }, hcp, p.gender || 'men', { pid: pid, name: p.name || '' })
                        : null;
                    if (div && div.tee && div.tee !== p.tee) {
                        updates['rounds/' + rid + '/players/' + pid + '/tee'] = div.tee;
                    }
                });
            }
        });
        return db.ref().update(updates).then(function() { return opened; });
    }).catch(function() {
        // Нет доступа к ветке rounds — стартуем хотя бы сам турнир
        return db.ref('tournaments/' + tnId).update({ status: 'active', lifecycleStatus: 'active', startedAt: now }).then(function() { return 0; });
    });
}

// =========================================================
// ФОРМАТЫ ИГРЫ · ИЕРАРХИЯ СТАРТА · АДРЕСНЫЕ PUSH-АНОНСЫ
// ---------------------------------------------------------
// Общий слой для админки старта (js/start-admin.js), печати
// QR-карточек (js/qr-start.js), страницы счёта (js/scorer.js)
// и рассылки анонсов (js/admin.js).
//
// ФОРМАТЫ. Раунд несёт формат в двух полях: format — основной
// (обратная совместимость со старыми записями) и formats — вся
// форматная линия протокола (например Stableford + Gross). Группа со
// своим форматом пишет один формат, группа без своего — всю линию.
//
// ИЕРАРХИЯ СТАРТА: турнир → протокол → волна (время) → лунка → группа
// → игроки. При сохранении протокола в каждый раунд записываются
// startWave / startWaveLetter / startOrder / groupsTotal, поэтому
// буквы волн («1А», «1Б») не пересчитываются в каждом экране по-своему.
// Буква нужна только когда на лунке две и больше групп — требование клуба.
//
// АНОНСЫ. broadcast.audience решает, кому показывать сообщение:
// 'all' — всем, 'roster' — участникам турнира, 'protocol' — игрокам
// стартового протокола. uids — снимок адресатов на момент отправки,
// чтобы страница игрока проверяла только свой uid и не читала базу.
// =========================================================

var PS_WAVE_ALPHABET_RU = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
var PS_WAVE_ALPHABET_EN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function pestovoLang() {
    try { return (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'en' : 'ru'; } catch (e) { return 'ru'; }
}

// Буква волны: 0 → «А», 1 → «Б»… дальше — номер (27-я волна редка, но пусть будет).
function pestovoWaveLetter(idx, lang) {
    var i = Math.max(0, parseInt(idx, 10) || 0);
    var alpha = (lang || pestovoLang()) === 'en' ? PS_WAVE_ALPHABET_EN : PS_WAVE_ALPHABET_RU;
    if (i < alpha.length) return alpha.charAt(i);
    return String(i + 1);
}

// Форматы игры одной записи: раунда, протокола или группы.
// Принимает и массив, и «разреженный объект» из Firebase ({0:…,1:…}),
// и старую запись без formats (только format).
function pestovoRoundFormats(src) {
    var out = [];
    function add(f) {
        f = String(f == null ? '' : f).trim();
        if (!f || f === '__custom__') return;
        if (out.indexOf(f) === -1) out.push(f);
    }
    if (!src) return out;
    if (typeof src !== 'object') { add(src); return out; }
    var list = src.formats;
    if (list && !Array.isArray(list) && typeof list === 'object') {
        list = Object.keys(list)
            .sort(function(a, b) { return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0); })
            .map(function(k) { return list[k]; });
    }
    if (Array.isArray(list)) list.forEach(add);
    else if (typeof list === 'string') add(list);
    add(src.format);                     // основной формат (для старых записей — единственный)
    if (src.formatCustom) add(src.formatCustom); // свой формат одной строкой — всегда последним
    return out;
}

// Подпись формата для списков и шапок: вся форматная линия раунда, а не
// только основной формат (старые раунды без formats подписываются как раньше).
function pestovoRoundFormatBadge(r, fallback) {
    var txt = pestovoRoundFormatsLabel(r);
    if (!txt) txt = String((r && r.format) || '').trim();
    return txt || (fallback || 'Stroke Play');
}

// Подпись форматов для шапок и карточек: «Stableford + Gross».
// opts.localize — человеческие названия («Stableford (очки) + …»),
// opts.sep — разделитель (по умолчанию « + », для списков удобно « · »).
function pestovoRoundFormatsLabel(src, opts) {
    opts = opts || {};
    var list = pestovoRoundFormats(src);
    if (!list.length) return '';
    if (!opts.localize) return list.join(opts.sep || ' + ');
    var names = list.map(function(f) {
        return (typeof pestovoFormatLabel === 'function') ? pestovoFormatLabel(f) : f;
    });
    return names.join(opts.sep || ' + ');
}

// Одна строка раскладки к единому виду: и черновик админки
// ({members, startHole, startTime, format}), и раунд из базы
// ({players, groupNo, startWave, startWaveLetter, …}).
function pestovoStartRow(src, i) {
    src = src || {};
    var hole = parseInt(src.startHole, 10) || 1;
    if (hole < 1 || hole > 18) hole = 1;
    var members = Array.isArray(src.members) ? src.members : null;
    var count;
    if (members) count = members.length;
    else if (src.players && typeof src.players === 'object') count = Object.keys(src.players).length;
    else if (typeof src.playersCount === 'number') count = src.playersCount;
    else count = 0;
    return {
        key: String(src.roundId || src.id || src.key || ('row' + i)),
        order: i,          // индекс во ВХОДЯЩЕМ списке — чтобы после сортировки
                           // можно было вернуться к своей группе
        hole: hole,
        ts: Number(src.startTime) || 0,
        groupNo: parseInt(src.groupNo, 10) || (i + 1),
        count: count,
        members: members,
        status: String(src.status || ''),
        startWave: (src.startWave === null || src.startWave === undefined) ? null : parseInt(src.startWave, 10),
        startWaveLetter: (src.startWaveLetter === null || src.startWaveLetter === undefined) ? '' : String(src.startWaveLetter),
        startOrder: (src.startOrder === null || src.startOrder === undefined) ? null : parseInt(src.startOrder, 10),
        groupsTotal: (src.groupsTotal === null || src.groupsTotal === undefined) ? null : parseInt(src.groupsTotal, 10),
        tournamentName: String(src.tournamentName || ''),
        protocolName: String(src.protocolName || ''),
        formats: pestovoRoundFormats(src),
        raw: src
    };
}

// Строки, упорядоченные по очереди tee-off: время → лунка → номер группы.
//
// Волна (порядковый номер группы на своей лунке) и буква пересчитываются
// ВСЕГДА, когда в списке виден весь протокол: после переноса группы на другую
// лунку записанные раньше буквы устарели, и две группы получили бы «1А».
// Если передана частичная выборка (TV или счётная страница открывают один
// раунд из восьми) — считать нечего, берём startWave/startWaveLetter из базы.
function pestovoStartRows(list) {
    var arr = list ? Array.prototype.slice.call(list) : [];
    var rows = arr.map(pestovoStartRow);
    rows.sort(function(a, b) {
        if (a.ts !== b.ts) return a.ts - b.ts;
        if (a.hole !== b.hole) return a.hole - b.hole;
        return a.groupNo - b.groupNo;
    });
    var declaredTotal = 0;
    rows.forEach(function(r) {
        if (r.groupsTotal && r.groupsTotal > declaredTotal) declaredTotal = r.groupsTotal;
    });
    var partial = declaredTotal > rows.length;   // видны не все группы протокола
    var onHole = {};
    rows.forEach(function(r) {
        r.derivedWave = onHole[r.hole] || 0;
        onHole[r.hole] = r.derivedWave + 1;
    });
    rows.forEach(function(r, i) {
        r.holeTotal = onHole[r.hole] || 1;
        r.seq = (partial && r.startOrder !== null && !isNaN(r.startOrder)) ? r.startOrder : (i + 1);
        r.startWave = (partial && r.startWave !== null && !isNaN(r.startWave)) ? r.startWave : r.derivedWave;
        var savedLetter = (partial && r.startWaveLetter) ? String(r.startWaveLetter) : '';
        r.letter = savedLetter || (r.holeTotal > 1 ? pestovoWaveLetter(r.startWave) : '');
        if (!r.groupsTotal || isNaN(r.groupsTotal)) r.groupsTotal = rows.length;
    });
    return rows;
}

// Порядок показа стартового листа: лунка → время (1А, 1Б, …, 10А) — так его
// сортируют админка и печать QR. Очередь tee-off остаётся хронологической
// (rows): это очередь на первый тей, а не список лунок.
function pestovoStartDisplayOrder(rows) {
    return (rows || []).slice().sort(function(a, b) {
        if (a.hole !== b.hole) return a.hole - b.hole;
        if (a.ts !== b.ts) return a.ts - b.ts;
        return a.groupNo - b.groupNo;
    });
}

// Подпись группы в иерархии. shotgun-схемы (лунка + буква) — «Группа 1А»,
// остальные — «Группа 3» по номеру группы.
function pestovoStartGroupTitle(row, opts) {
    opts = opts || {};
    if (!row) return '';
    var base = (opts.lang || pestovoLang()) === 'en' ? 'Group ' : 'Группа ';
    if (!opts.holeLetter) return base + row.groupNo;
    return base + row.hole + (row.letter || '');
}

// Дерево иерархии: волны (по времени старта) → лунки → группы.
// Нужно TV-экрану, печати QR-карточек и предпросмотру в админке.
function pestovoStartHierarchy(list, opts) {
    opts = opts || {};
    var rows = opts.rows ? list : pestovoStartRows(list);
    var waves = [];
    var byTs = {};
    rows.forEach(function(r) {
        var w = byTs[r.ts];
        if (!w) {
            w = byTs[r.ts] = { ts: r.ts, holes: [], holesById: {}, groups: [], count: 0, players: 0 };
            waves.push(w);
        }
        var h = w.holesById[r.hole];
        if (!h) {
            h = w.holesById[r.hole] = { hole: r.hole, groups: [], count: 0, players: 0 };
            w.holes.push(h);
        }
        h.groups.push(r); h.count++; h.players += r.count;
        w.groups.push(r); w.count++; w.players += r.count;
    });
    waves.sort(function(a, b) { return a.ts - b.ts; });
    waves.forEach(function(w, wi) {
        w.no = wi + 1;
        w.holes.sort(function(a, b) { return a.hole - b.hole; });
        w.holes.forEach(function(h) {
            h.groups.sort(function(a, b) {
                if (a.startWave !== b.startWave) return a.startWave - b.startWave;
                return a.groupNo - b.groupNo;
            });
        });
    });
    var players = 0;
    rows.forEach(function(r) { players += r.count; });
    return { waves: waves, rows: rows, display: pestovoStartDisplayOrder(rows), total: rows.length, players: players };
}

// ── PUSH-АНОНСЫ: КОМУ АДРЕСОВАНО ──────────────────────────
// Аудитория приводится к одному виду; записей без audience (все, что
// отправлены до этого релиза) это не меняет: они по-прежнему адресованы всем.
function pestovoBroadcastAudience(a) {
    if (!a || typeof a !== 'object') return { type: 'all', tournamentId: '', tournamentName: '', protocolId: '', protocolName: '', uids: null, count: 0 };
    var type = String(a.type || 'all');
    if (type !== 'roster' && type !== 'protocol') type = 'all';
    var uids = null, n = 0;
    if (a.uids && typeof a.uids === 'object') {
        uids = {};
        Object.keys(a.uids).forEach(function(k) {
            var v = a.uids[k];
            if (!k || v === false || v === null) return;
            uids[String(k)] = true;
            n++;
        });
    }
    return {
        type: type,
        includePwa: a.includePwa === true,
        tournamentId: String(a.tournamentId || ''),
        tournamentName: String(a.tournamentName || ''),
        protocolId: String(a.protocolId || ''),
        protocolName: String(a.protocolName || ''),
        uids: uids,
        count: n
    };
}

// Запись в broadcasts/<id>.
function pestovoBroadcastPayload(o) {
    o = o || {};
    var link = String(o.link || '').trim() || 'tournaments.html';
    return {
        title: String(o.title || '').trim(),
        body: String(o.body || '').trim(),
        link: link,
        time: Number(o.time) || Date.now(),
        sentBy: String(o.sentBy || 'admin'),
        audience: pestovoBroadcastAudience(o.audience)
    };
}

// Показать ли анонс этому зрителю: ctx = { uid, isAdmin }.
// Адресный анонс видят только адресаты (и админ — чтобы проверить текст);
// гость без uid видит только общие анонсы.
function pestovoBroadcastMatches(b, ctx) {
    ctx = ctx || {};
    var aud = pestovoBroadcastAudience(b && b.audience);
    if (aud.type === 'all') return true;
    if (ctx.isAdmin) return true;
    var uid = (ctx.uid === null || ctx.uid === undefined) ? '' : String(ctx.uid);
    if (!uid) return false;
    if (!aud.uids || !aud.count) return false;
    return !!aud.uids[uid];
}

// Кто смотрит анонсы прямо сейчас: uid вошедшего игрока + признак админа.
// Нужен одному месту, иначе pwa-уведомление и лента начнут фильтровать по-разному.
function pestovoBroadcastViewerCtx() {
    var uid = '';
    try {
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) uid = String(currentUser.uid);
    } catch (e) { console.warn("[silent]", e); }
    return {
        uid: uid,
        isAdmin: (typeof pestovoIsAdminViewer === 'function') ? pestovoIsAdminViewer() : false
    };
}

// Подпись аудитории для истории админки и карточек ленты.
function pestovoBroadcastAudienceLabel(b, lang) {
    var L = lang || pestovoLang();
    var aud = pestovoBroadcastAudience(b && b.audience);
    if (aud.type === 'all') {
        if (aud.includePwa) return L === 'en' ? 'All players + PWA push (incl. guests)' : 'Всем игрокам + PWA-уведомления (включая гостей)';
        return L === 'en' ? 'All club players' : 'Всем игрокам клуба';
    }
    var name = aud.type === 'protocol' ? (aud.protocolName || aud.tournamentName || '') : (aud.tournamentName || '');
    var who = aud.type === 'protocol'
        ? (L === 'en' ? 'Start list' : 'Стартовый протокол')
        : (L === 'en' ? 'Tournament' : 'Турнир');
    var out = who + (name ? ': ' + name : '');
    if (aud.count) out += ' · ' + aud.count + (L === 'en' ? ' players' : ' игр.');
    return out;
}

// Лента анонсов зрителю: новые сверху, только адресованные ему.
function pestovoBroadcastFeed(data, ctx, limit) {
    var src = data || {};
    var arr = [];
    Object.keys(src).forEach(function(k) {
        var b = src[k];
        if (!b || typeof b !== 'object') return;
        if (!pestovoBroadcastMatches(b, ctx)) return;
        arr.push({
            id: k,
            title: String(b.title || ''),
            body: String(b.body || ''),
            link: String(b.link || 'tournaments.html'),
            time: Number(b.time) || 0,
            audience: b.audience
        });
    });
    arr.sort(function(a, b) { return b.time - a.time; });
    if (limit && limit > 0) arr = arr.slice(0, limit);
    return arr;
}

// ==========================================
// АВТО-ЧИСТКА ДУБЛЕЙ ИСТОРИИ (один раз на сессию)
// ==========================================
// Любой вошедший игрок чистит СВОЮ историю от случайных дублей; админ
// дополнительно запускает разовый глобальный проход по всем игрокам
// (гостевые записи в том числе). Идемпотентно, помечается флагом
// settings/migrations/historyDedupeV2.
(function pestovoScheduleHistoryDedupe() {
    function run() {
        if (typeof auth === 'undefined' || !auth || typeof db === 'undefined' || !db) return;
        auth.onAuthStateChanged(function(user) {
            if (!user || !user.uid) return;
            // Своя история — сразу, без всяких прав админа.
            try {
                pestovoDedupeUserHistory(user.uid).then(function(changed) {
                    if (changed && typeof toast === 'function') {
                        // Молча чиним; в тостах не шумим.
                    }
                }).catch(function() {});
            } catch (e) { console.warn("[silent]", e); }
            // Глобальная чистка — только для админа.
            try {
                db.ref('users/' + user.uid).once('value').then(function(sn) {
                    var u = sn && sn.val();
                    var isAdmin = (u && u.role === 'admin') ||
                        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pestovo_is_admin') === 'true');
                    if (isAdmin) {
                        setTimeout(function() {
                            try { pestovoDedupeAllPlayerHistoryOnce(); } catch (e) { console.warn("[silent]", e); }
                        }, 2500);
                    }
                }).catch(function() {});
            } catch (e) { console.warn("[silent]", e); }
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();

if (typeof window !== 'undefined') {
    window.pestovoPickHistoryUnique = pestovoPickHistoryUnique;
    window.pestovoHistoryEntryGroupKey = pestovoHistoryEntryGroupKey;
    window.pestovoHistoryBestStats = pestovoHistoryBestStats;
    window.pestovoDedupeUserHistory = pestovoDedupeUserHistory;
    window.pestovoDedupeAllPlayerHistoryOnce = pestovoDedupeAllPlayerHistoryOnce;
    window.pestovoInitProfileHistory = pestovoInitProfileHistory;
    window.pestovoProfileHistorySetTab = pestovoProfileHistorySetTab;
    window.pestovoProfileHistorySetSort = pestovoProfileHistorySetSort;
    window.pestovoProfileHistoryToggleFull = pestovoProfileHistoryToggleFull;
    window.pestovoRenderProfileHistory = pestovoRenderProfileHistory;
    window.roundTournamentName = roundTournamentName;
    window.isTournamentRound = isTournamentRound;
    window.isLiveTournament = isLiveTournament;
    window.updateRoundEventBanner = updateRoundEventBanner;
    window.isRoundOpenForScoring = isRoundOpenForScoring;
    window.isRoundGatedByStart = isRoundGatedByStart;
    window.roundScheduledStartTs = roundScheduledStartTs;
    window.roundStartCountdownMs = roundStartCountdownMs;
    window.formatStartCountdown = formatStartCountdown;
    window.roundsDueForStart = roundsDueForStart;
    window.pestovoActivateRounds = pestovoActivateRounds;
    window.pestovoAutoStartRounds = pestovoAutoStartRounds;
    window.pestovoStartTournamentNow = pestovoStartTournamentNow;
    // Каскадное удаление турнира (раунды + протоколы + следы в истории игроков).
    window.pestovoDeleteTournamentCascade = pestovoDeleteTournamentCascade;
    window.pestovoDeleteTournamentRounds = pestovoDeleteTournamentRounds;
    window.pestovoTournamentRoundIdsFull = pestovoTournamentRoundIdsFull;
    window.pestovoTournamentDeleteSummary = pestovoTournamentDeleteSummary;
    window.pestovoRemoveAlertsForRounds = pestovoRemoveAlertsForRounds;
    window.pestovoPreserveTournamentRounds = pestovoPreserveTournamentRounds;
    window.pestovoStartTsFromParts = pestovoStartTsFromParts;
    window.ROUND_STATUS_SCHEDULED = ROUND_STATUS_SCHEDULED;
    window.pestovoWaveLetter = pestovoWaveLetter;
    window.pestovoRoundFormats = pestovoRoundFormats;
    window.pestovoRoundFormatsLabel = pestovoRoundFormatsLabel;
    window.pestovoRoundFormatBadge = pestovoRoundFormatBadge;
    window.pestovoStartRow = pestovoStartRow;
    window.pestovoStartRows = pestovoStartRows;
    window.pestovoStartDisplayOrder = pestovoStartDisplayOrder;
    window.pestovoStartHierarchy = pestovoStartHierarchy;
    window.pestovoStartGroupTitle = pestovoStartGroupTitle;
    window.pestovoBroadcastAudience = pestovoBroadcastAudience;
    window.pestovoBroadcastPayload = pestovoBroadcastPayload;
    window.pestovoBroadcastMatches = pestovoBroadcastMatches;
    window.pestovoBroadcastViewerCtx = pestovoBroadcastViewerCtx;
    window.pestovoBroadcastAudienceLabel = pestovoBroadcastAudienceLabel;
    window.pestovoBroadcastFeed = pestovoBroadcastFeed;
    window.roundPause = roundPause;
    window.roundResume = roundResume;
    window.getRoundTotalPauseMs = getRoundTotalPauseMs;
    window.roundForceFinishPlayer = roundForceFinishPlayer;
    window.roundForceFinishAll = roundForceFinishAll;
    window.isPlayerFinishedRound = isPlayerFinishedRound;
    window.roundPendingPlayers = roundPendingPlayers;
    window.readRoundSnapshot = readRoundSnapshot;
    window.isPlayerRoundClosed = isPlayerRoundClosed;
    window.playerCurrentHole = playerCurrentHole;
    window.playerHoleStatusText = playerHoleStatusText;
    window.roundActiveHoles = roundActiveHoles;
    window.roundRawStartTs = roundRawStartTs;
    window.roundEffectiveStartTime = roundEffectiveStartTime;
    window.roundHoleDeadlineTs = roundHoleDeadlineTs;
    window.holeExpectedMinutes = holeExpectedMinutes;
    window.getRoundPauseIntervals = getRoundPauseIntervals;
    window.paceSafeTs = paceSafeTs;
    window.openRoundPauseModal = openRoundPauseModal;
    window.closeRoundPauseModal = closeRoundPauseModal;
    window.openForceFinishModal = openForceFinishModal;
    window.closeForceFinishModal = closeForceFinishModal;
    window.buildRoundStatusBadgeHTML = buildRoundStatusBadgeHTML;
    window.buildRoundCompletedBadgeHTML = buildRoundCompletedBadgeHTML;
    window.initP0MobileEnhancements = initP0MobileEnhancements;
}
// P0: run mobile enhancements after DOM ready and on every nav rebuild
if(typeof document!=='undefined'){
    document.addEventListener('DOMContentLoaded', function(){ try{ initP0MobileEnhancements(); }catch (e) { console.warn("[silent]", e); } });
    // also try immediately in case DOM already ready and initNav already fired
    if(document.readyState!=='loading'){ setTimeout(function(){ try{ initP0MobileEnhancements(); }catch (e) { console.warn("[silent]", e); } }, 80); }
}


// Order is normalized so stale/invalid settings never hide an input block.
var SCORE_ENTRY_BLOCKS = ['info', 'holes', 'input'];
function normalizeScoreEntryOrder(value) {
    var order = Array.isArray(value) ? value.filter(function(key, i) {
        return SCORE_ENTRY_BLOCKS.indexOf(key) !== -1 && value.indexOf(key) === i;
    }) : [];
    return order.concat(SCORE_ENTRY_BLOCKS.filter(function(key) { return order.indexOf(key) === -1; }));
}
var scoreEntryOrder = (function() {
    try { return normalizeScoreEntryOrder(JSON.parse(localStorage.getItem('pestovo_scoring_order'))); }
    catch (e) { return normalizeScoreEntryOrder(null); }
})();
function arrangeScoreEntry(root, view, order) {
    root.setAttribute('data-entry-view', normalizeView5(view));
    var blocks = Array.from(root.children).filter(function(el) { return el.hasAttribute('data-entry-block'); });
    var sorted = normalizeScoreEntryOrder(order).map(function(key) {
        return blocks.find(function(el) { return el.getAttribute('data-entry-block') === key; });
    }).filter(Boolean);
    if (sorted.some(function(el, i) { return blocks[i] !== el; })) {
        var focused = root.contains(document.activeElement) ? document.activeElement : null;
        sorted.forEach(function(el) { root.appendChild(el); });
        if (focused && typeof focused.focus === 'function') focused.focus({ preventScroll: true });
    }
}
function syncScoreEntryLayouts() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    document.querySelectorAll('.score-entry:not([data-entry-preview])').forEach(function(root) {
        arrangeScoreEntry(root, getScoringView(), scoreEntryOrder);
    });
}
function applyScoreEntryOrder(value) {
    scoreEntryOrder = normalizeScoreEntryOrder(value);
    try { localStorage.setItem('pestovo_scoring_order', JSON.stringify(scoreEntryOrder)); } catch (e) { /* no storage */ }
    syncScoreEntryLayouts();
}
function initScoreEntryLayouts() {
    syncScoreEntryLayouts();
    pestovoBindView5('scoring', function() { syncScoreEntryLayouts(); });
    if (typeof db !== 'undefined' && db) {
        var ref = db.ref('settings/scoring_order');
        var receive = function(sn) { applyScoreEntryOrder(sn.val()); };
        if (typeof bindRealtimeValue === 'function') bindRealtimeValue('scoring-order', ref, receive);
        else ref.on('value', receive);
    }
}
