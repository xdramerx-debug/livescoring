document.addEventListener('DOMContentLoaded', function() { initNav(); loadTournaments(); });
function onAuthReady(u, d) { navAuth(u, d); loadTournaments(); }

function tGet(id){ try{ return document.getElementById(id); }catch(e){ return null; } }

// Протокол завершения турнира (PDF) виден только администратору.
// Данные о роли берутся из общего хелпера utils.js; если его нет
// (например, страница открыта без utils.js) — считаем, что это игрок.
function tnCanSeeProtocol() {
    try {
        if (typeof pestovoIsAdminViewer === 'function') return !!pestovoIsAdminViewer();
        if (typeof hasAdminPanelAccess === 'function') return !!hasAdminPanelAccess();
    } catch (e) {}
    return false;
}

// Кэш турниров для лидерборда/группировки, общий снапшот раундов и состояние панелей.
var tnCache = {};
var tnProtocols = null;
var tnLbRounds = null;
var tnLbSubscribed = false;
var tnLbOpen = {};
var tnRosterOpen = {};

// Выбор вкладки групп (заявка и лидерборд): «все», конкретная группа
// (дивизион) или «Гости». Состояние переживает перерисовки и перезагрузку.
var tnTabSel = {};
try { tnTabSel = JSON.parse(localStorage.getItem('pestovo_tn_tabs') || '{}') || {}; } catch(e) { tnTabSel = {}; }
function tnGetTab(tnId) { return tnTabSel[tnId] || 'all'; }
function tnSetTab(tnId, key) {
    tnTabSel[tnId] = key || 'all';
    try { localStorage.setItem('pestovo_tn_tabs', JSON.stringify(tnTabSel)); } catch(e) {}
    if (typeof tnRenderList === 'function') tnRenderList();
}

// Гость турнира: заявка без аккаунта (гостевая запись формы/стартового листа).
function tnIsGuestRoster(rec) {
    if (!rec) return false;
    if (rec.guest === true) return true;
    var k = String(rec.uid || rec.key || '');
    if (k && (k.indexOf('gst_') === 0 || k.indexOf('guest_') === 0)) return true;
    return !rec.uid;
}
function tnIsGuestPlayer(pid, p) {
    if (p && p.isGuest === true) return true;
    var k = String(pid || '');
    return k.indexOf('gst_') === 0 || k.indexOf('guest_') === 0;
}

// Панель вкладок над таблицей групп: «Все · Мужчины · Девушки · … · Гости».
// Показывается только когда групп (или гостей) больше одной — иначе вкладки лишние.
function tnTabsHtml(tnId, tabs) {
    if (!tabs || tabs.length < 2) return '';
    var cur = tnGetTab(tnId);
    var en = currentLang === 'en';
    var html = '<div class="tn-tabs" role="tablist">';
    tabs.forEach(function(t) {
        if (!t || !t.count) return;
        var active = (t.key === cur) || (cur === 'all' && t.key === 'all');
        html += '<button type="button" role="tab" class="tn-tab' + (active ? ' active' : '') + '"' +
            ' aria-selected="' + (active ? 'true' : 'false') + '"' +
            ' onclick="tnSetTab(\'' + escapeHtml(tnId) + '\',\'' + escapeHtml(t.key) + '\')">' +
            (t.icon ? '<i class="fas ' + t.icon + '"></i> ' : '') +
            escapeHtml(t.label) + '<span class="tn-tab-count">' + t.count + '</span></button>';
    });
    html += '</div>';
    return html;
}

// Фильтр вкладок: «all» — всё, «__guests» — гости, иначе id дивизиона.
function tnFilterByTab(tnId, buckets, guestList) {
    var tab = tnGetTab(tnId);
    if (tab === 'all') return { show: buckets, note: '' };
    if (tab === '__guests') return { show: [{ div: null, list: (guestList || []).slice(), guestTab: true }], note: '' };
    var picked = buckets.filter(function(b) {
        var k = b.div ? (b.div.id || '') : '__none';
        return k === tab;
    });
    return { show: picked, note: '' };
}

// Заголовок группы: «Группа: Мужчины · HCP 0–12 · Синие ТИ» + счётчик.
function tnGroupHeadHtml(b, en) {
    var count = '<span class="tn-group-count">' + b.list.length + '</span><i class="fas fa-chevron-down tn-chev"></i>';
    if (b.guestTab) {
        return '<i class="fas fa-user-tie tn-group-ico"></i><span class="tn-group-kind">' + (en ? 'Group:' : 'Группа:') + '</span>' +
            '<b class="tn-group-title">' + (en ? 'Guests' : 'Гости') + '</b>' + count;
    }
    if (!b.div) {
        return '<i class="fas fa-user-group tn-group-ico"></i><span class="tn-group-kind">' + (en ? 'Group:' : 'Группа:') + '</span>' +
            '<b class="tn-group-title">' + (en ? 'Without group' : 'Без группы') + '</b>' + count;
    }
    var rg = (typeof tnDivisionRangeText === 'function') ? tnDivisionRangeText(b.div) : '';
    var teeTxt = b.div.tee && typeof t === 'function' ? t('tee_' + b.div.tee) : '';
    var genderTxt = (typeof tnDivisionGenderText === 'function' && b.div.gender && b.div.gender !== 'all') ? tnDivisionGenderText(b.div.gender) : '';
    var ico = b.div.gender === 'women' ? 'fa-venus' : b.div.gender === 'men' ? 'fa-mars' : 'fa-layer-group';
    // Название группы ИЛИ бейджи (HCP/ТИ/пол) — но не оба сразу: названия
    // вида «Мужчины 0–12» уже содержат пол и диапазон, и бейджи рядом
    // двоили ту же информацию.
    if (b.div.name) {
        return '<i class="fas ' + ico + ' tn-group-ico"></i><span class="tn-group-kind">' + (en ? 'Group:' : 'Группа:') + '</span>' +
            '<b class="tn-group-title">' + escapeHtml(b.div.name) + '</b>' + count;
    }
    return '<i class="fas ' + ico + ' tn-group-ico"></i><span class="tn-group-kind">' + (en ? 'Group:' : 'Группа:') + '</span>' +
        '<b class="tn-group-title">' + (en ? 'Group' : 'Группа') + '</b>' +
        (rg ? '<span class="tn-group-badge"><i class="fas fa-gauge-high"></i> HCP ' + escapeHtml(rg) + '</span>' : '') +
        (teeTxt ? '<span class="tn-group-badge"><i class="fas fa-flag"></i> ' + escapeHtml(teeTxt) + '</span>' : '') +
        (genderTxt ? '<span class="tn-group-badge"><i class="fas fa-venus-mars"></i> ' + escapeHtml(genderTxt) + '</span>' : '') +
        count;
}

// Раскрытые/свёрнутые группы гандикапа (заявка и лидерборд): состояние
// переживает перерисовки и перезагрузки страницы.
var tnGroupOpen = {};
try { tnGroupOpen = JSON.parse(localStorage.getItem('pestovo_tn_groups') || '{}') || {}; } catch(e) { tnGroupOpen = {}; }
function tnGroupKey(tnId, ctx, divId) { return tnId + '|' + ctx + '|' + divId; }
function tnGroupIsOpen(tnId, ctx, divId, defaultOpen) {
    var k = tnGroupKey(tnId, ctx, divId);
    if (Object.prototype.hasOwnProperty.call(tnGroupOpen, k)) return !!tnGroupOpen[k];
    return !!defaultOpen;
}
function tnGroupSetOpen(tnId, ctx, divId, open) {
    tnGroupOpen[tnGroupKey(tnId, ctx, divId)] = !!open;
    try { localStorage.setItem('pestovo_tn_groups', JSON.stringify(tnGroupOpen)); } catch(e) {}
}
function toggleTnGroupEl(btn) {
    if (!btn) return;
    var tnId = btn.getAttribute('data-tn'), ctx = btn.getAttribute('data-ctx'), div = btn.getAttribute('data-div');
    var wrap = btn.closest ? btn.closest('.tn-group') : btn.parentNode;
    var body = wrap ? wrap.querySelector('.tn-group-body') : null;
    var nowOpen = true;
    if (body) {
        body.classList.toggle('tn-collapsed');
        nowOpen = !body.classList.contains('tn-collapsed');
    }
    if (wrap) {
        if (wrap.classList) {
            if (nowOpen) wrap.classList.add('open'); else wrap.classList.remove('open');
        }
    }
    tnGroupSetOpen(tnId, ctx, div || '', nowOpen);
}
function toggleTnAllGroups(tnId, ctx, open) {
    var panelId = ctx === 'lb' ? 'tnlb-' + tnId : 'roster-' + tnId;
    var panel = tGet(panelId);
    if (!panel || !panel.querySelectorAll) return;
    var groups = panel.querySelectorAll('.tn-group');
    for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        var btn = g.querySelector('.tn-group-head');
        var body = g.querySelector('.tn-group-body');
        if (body) {
            if (open) body.classList.remove('tn-collapsed');
            else body.classList.add('tn-collapsed');
        }
        if (g.classList) {
            if (open) g.classList.add('open'); else g.classList.remove('open');
        }
        if (btn) tnGroupSetOpen(tnId, ctx, btn.getAttribute('data-div') || '', !!open);
    }
}

function loadTournaments() {
    if (typeof db === 'undefined' || !db) return;
    if (typeof bindRealtimeValue !== 'function') return;
    bindRealtimeValue('tournaments-list', db.ref('tournaments'), function(sn) {
        tnCache = (sn && sn.val && sn.val()) || {};
        tnRenderList();
    });
    // Протоколы — для обратной совместимости: старые данные хранят обрезку
    // гандикапа только в protocols/<pid>/hcpCut. Пока обрезка не перенесена
    // на турнир, группировка участников на странице турнира берёт её отсюда.
    bindRealtimeValue('tn-protocols', db.ref('protocols'), function(sn) {
        tnProtocols = (sn && sn.val && sn.val()) || {};
        tnRenderList();
    });
}

function tnRenderList() {
    var data = tnCache || {};
    var entries = Object.entries(data);
    var el = tGet('tn-list');
    if (!el) return;

        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>' + (currentLang === 'en' ? 'No tournaments created yet' : 'Пока нет турниров') + '</p></div>';
            return;
        }
        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });

        var en = currentLang === 'en';
        var formatLabel = en ? 'Formats: ' : 'Форматы: ';
        var teeLabel = en ? 'Tees: ' : 'ТИ: ';

        var html = '';
        entries.forEach(function(e) {
            var tnId = e[0], tVal = e[1];
            var statusCls = tVal.status === 'active' ? 'tn-a' : tVal.status === 'completed' ? 'tn-d' : 'tn-u';
            var statusText = tVal.status === 'active' ? (en ? '🔴 Active' : '🔴 Активный') : tVal.status === 'completed' ? (en ? '✅ Completed' : '✅ Завершён') : (en ? '📅 Upcoming' : '📅 Предстоящий');
            var formatsStr = (tVal.formats || []).join(' · ') || '—';
            var teesStr = (tVal.tees || []).map(function(k) { return t('tee_' + k); }).join(' · ');
            var divisions = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tVal) : [];

            var regPlayers = tVal.registeredPlayers || {};
            var regCount = (typeof tnDedupeRoster === 'function') ? tnDedupeRoster(regPlayers).length : Object.keys(regPlayers).length;
            var isRegistered = !!(currentUser && regPlayers[currentUser.uid]);

            // Запись открыта ТОЛЬКО для предстоящих турниров: на активном
            // запись закрыта (уже записанные видят статичный бейдж без отмены),
            // на завершённом кнопок нет.
            var regBtn = '';
            var tnStatus = tVal.status || 'upcoming';
            if (tnStatus === 'active') {
                if (isRegistered) {
                    regBtn = '<span style="font-size:12px;font-weight:700;color:#2ecc71;"><i class="fas fa-check-circle"></i> ' + t('registered_badge') + '</span>';
                } else {
                    regBtn = '<span style="font-size:12px;font-weight:700;color:var(--muted);"><i class="fas fa-lock"></i> ' + (en ? 'Registration closed — tournament in progress' : 'Запись закрыта — турнир идёт') + '</span>';
                }
            } else if (tnStatus === 'completed') {
                if (isRegistered) {
                    regBtn = '<span style="font-size:12px;font-weight:700;color:var(--muted);"><i class="fas fa-check-circle"></i> ' + t('registered_badge') + '</span>';
                }
            } else if (isRegistered) {
                regBtn = '<button class="btn btn-og btn-sm" onclick="cancelTournamentRegistration(\'' + tnId + '\')"><i class="fas fa-check-circle"></i> ' + t('registered_badge') + '</button>';
            } else {
                regBtn = '<button class="btn btn-g btn-sm" onclick="openTournamentRegModal(\'' + tnId + '\')"><i class="fas fa-user-plus"></i> ' + t('register_tournament_btn') + '</button>';
            }

            html += '<div class="tn-card">';
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">';
            html += '<div style="flex:1;min-width:200px;"><div class="tn-name">' + escapeHtml(tVal.name || '—') + '</div>';
            html += '<div class="tn-meta"><span><i class="fas fa-calendar"></i> ' + fmtDate((typeof tnDateTs === 'function') ? tnDateTs(tVal.date) : Date.parse(tVal.date)) + '</span></div>';
            html += '<div style="margin-top:8px;font-size:12px;color:var(--muted);">' + formatLabel + escapeHtml(formatsStr) + '</div>';
            html += '<div style="font-size:12px;color:var(--muted);">' + teeLabel + escapeHtml(teesStr) + '</div>';
            if (divisions.length) {
                html += '<div style="margin-top:6px;">';
                divisions.forEach(function(d) {
                    // Имя группы ИЛИ диапазон HCP — но не оба сразу: названия
                    // вида «Мужчины 0–12» уже содержат диапазон, и бейдж с
                    // ним двоил информацию.
                    var rg = (typeof tnDivisionRangeText === 'function') ? tnDivisionRangeText(d) : '';
                    html += '<span class="tn-div-chip">' + escapeHtml(d.name || rg || '—') + '</span>';
                });
                html += '</div>';
            }
            html += '<div style="font-size:12px;color:var(--gold);font-weight:700;margin-top:6px;"><i class="fas fa-users"></i> ' + t('registered_count') + ': ' + regCount + '</div>';
            html += '</div>';

            html += '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">';
            html += '<span class="tn-status ' + statusCls + '">' + statusText + '</span>';
            html += regBtn;
            // Кнопка списка — без надписи (обрезалась на мобильных): только
            // иконка и количество в скобках.
            html += '<button class="btn btn-og btn-sm tn-roster-toggle" title="' + escapeHtml(en ? 'Participants' : 'Список участников') + '" onclick="toggleRosterPanel(\'' + tnId + '\')"><i class="fas fa-list-ul"></i> (' + regCount + ')</button>';
            html += '<button class="btn btn-og btn-sm" onclick="toggleTnLb(\'' + tnId + '\')"><i class="fas fa-ranking-star"></i> ' + (en ? 'Live leaderboard' : 'Live-лидерборд') + '</button>';
            if (tnStatus === 'completed' && tnCanSeeProtocol()) {
                // Протокол завершения турнира — только для администратора:
                // уведомление о его доступности и кнопка игрокам не показываются,
                // итоговые результаты они видят в лидерборде.
                html += '<button class="btn btn-g btn-sm" onclick="tnOpenProtocolModal(\'' + tnId + '\')"><i class="fas fa-file-pdf"></i> ' + (en ? 'Results protocol (PDF)' : 'Протокол результатов (PDF)') + '</button>';
            }
            html += '</div>';

            html += '</div>';

            // Панель участников — сразу сгруппирована по группам гандикапа.
            html += '<div id="roster-' + tnId + '" class="card-scorecard-panel' + (tnRosterOpen[tnId] ? '' : ' hidden') + '" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">';
            html += tnRosterGroupedHtml(tnId, tVal, regPlayers, regCount);
            html += '</div>';

            // Внутритурнирный live-лидерборд.
            html += '<div id="tnlb-' + tnId + '"' + (tnLbOpen[tnId] ? '' : ' class="hidden"') + ' style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);"></div>';

            html += '</div>';
        });
        el.innerHTML = html;

        // Восстанавливаем открытые панели после перерисовки.
        Object.keys(tnLbOpen).forEach(function(tnId) {
            if (tnLbOpen[tnId]) {
                ensureTnLbSubscription();
                renderTnLeaderboard(tnId);
            }
        });
}

function toggleRosterPanel(tnId) {
    var panel = tGet('roster-' + tnId);
    if (panel) {
        try {
            panel.classList.toggle('hidden');
            tnRosterOpen[tnId] = !panel.classList.contains('hidden');
        } catch(e){}
    }
}

function toggleTnLb(tnId) {
    var panel = tGet('tnlb-' + tnId);
    if (!panel) return;
    try {
        panel.classList.toggle('hidden');
        tnLbOpen[tnId] = !panel.classList.contains('hidden');
        if (tnLbOpen[tnId]) {
            ensureTnLbSubscription();
            renderTnLeaderboard(tnId);
        }
    } catch(e){}
}

// Нормализация ФИО для сопоставления (своя кроха, без внешних зависимостей).
function tnNormName(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function tnFioKey(p, pid) {
    try {
        if (typeof getPlayerFioKey === 'function') {
            return getPlayerFioKey({
                name: p.name || '',
                firstName: p.firstName || '',
                lastName: p.lastName || '',
                middleName: p.middleName || ''
            }) || ('pid:' + pid);
        }
    } catch(e){}
    return tnNormName(p.name || '') || ('pid:' + pid);
}

// Дедуп заявленных по ФИО (как было) → [{rp, pid}].
function tnDedupeRoster(regPlayers) {
    var seenFio = {};
    var out = [];
    Object.entries(regPlayers || {}).forEach(function(pe) {
        var rpid = pe[0], rp = pe[1] || {};
        if (typeof isPlayerDeleted === 'function') { try { if (isPlayerDeleted(null, rp && rp.name)) return; } catch(e){} }
        var fioKey = tnFioKey(rp, rpid);
        if (seenFio[fioKey]) return;
        seenFio[fioKey] = true;
        out.push({ rp: rp, pid: rpid });
    });
    return out;
}

// ── Обрезка гандикапа турнира (единая со «Стартом турнира») ──
// Основной источник — tournaments/<id>/hcpCut. Для старых данных, где обрезка
// хранилась только в protocols/<pid>/hcpCut, берём её из последнего протокола.
function tnCutFromProtocols(tnId) {
    if (!tnId || !tnProtocols) return null;
    var best = null, bestTs = -1;
    Object.keys(tnProtocols).forEach(function(pid) {
        var doc = tnProtocols[pid] || {};
        if (doc.tournamentId !== tnId) return;
        if (!doc.hcpCut || typeof doc.hcpCut !== 'object') return;
        var ts = doc.updatedAt || doc.createdAt || 0;
        if (ts >= bestTs) { bestTs = ts; best = doc.hcpCut; }
    });
    return best;
}

function tnTournamentCut(tVal, tnId) {
    if (tVal && tVal.hcpCut && typeof tVal.hcpCut === 'object') return tVal.hcpCut;
    return tnCutFromProtocols(tnId);
}

// Точный гандикап с учётом обрезки (сначала процент, затем максимум по полу).
function tnEffectiveHcp(tVal, tnId, rawHcp, gender) {
    if (rawHcp === '' || rawHcp == null) return rawHcp;
    var cut = tnTournamentCut(tVal, tnId);
    if (!cut) return rawHcp;
    if (typeof tnApplyHcpCut === 'function') {
        try { return tnApplyHcpCut(rawHcp, gender || 'men', cut).effective; } catch (e) {}
    }
    return rawHcp;
}

// Группа по гандикапу с учётом обрезки турнира.
function tnDivisionForHcp(tVal, tnId, rawHcp, gender) {
    if (typeof tnFindDivision !== 'function') return null;
    if (rawHcp === '' || rawHcp == null) return null;
    return tnFindDivision(tVal, tnEffectiveHcp(tVal, tnId, rawHcp, gender), gender);
}

// Подсказка «✂ 38.5 → 28.0» рядом с HCP, если обрезка изменила гандикап.
function tnCutChipHtml(raw, eff) {
    if (raw == null || raw === '' || eff == null || eff === '') return '';
    var r = parseFloat(raw), e = parseFloat(eff);
    if (isNaN(r) || isNaN(e) || Math.abs(e - r) < 0.049) return '';
    var f = (typeof fmtExactHcp === 'function') ? fmtExactHcp : function(v) { return String(v); };
    var title = ('Обрезка турнира: ' + f(r) + ' → ' + f(e)).replace(/"/g, '&quot;');
    return ' <span class="hcp-chip" style="background:rgba(201,168,76,.14);border-color:rgba(201,168,76,.5);color:var(--gold);font-size:10.5px;" title="' + title + '"><i class="fas fa-scissors"></i> ' + f(r) + ' → ' + f(e) + '</span>';
}

// Список участников, сгруппированный по группам гандикапа турнира.
// Над таблицей — вкладки групп («Все · Мужчины · Девушки · … · Гости»),
// выбранные администратором дивизионы и гости видны отдельными вкладками.
function tnRosterGroupedHtml(tnId, tVal, regPlayers, regCount) {
    var en = currentLang === 'en';
    if (!regCount) {
        return '<p style="font-size:12px;color:var(--muted);text-align:center;">' + (en ? 'No registered participants yet' : 'Пока нет зарегистрированных участников') + '</p>';
    }
    var divisions = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tVal) : [];
    var list = tnDedupeRoster(regPlayers);

    var buckets = [];
    var byDiv = {};
    divisions.forEach(function(d) {
        var b = { div: d, list: [] };
        buckets.push(b);
        byDiv[d.id] = b;
    });
    var unassigned = { div: null, list: [] };
    var guests = { div: null, list: [], guestTab: true };

    list.forEach(function(en2) {
        var rp = en2.rp;
        var hcp = (rp.handicap != null && rp.handicap !== '') ? rp.handicap : null;
        var gender = rp.gender || 'men';
        en2.effHcp = (hcp != null) ? tnEffectiveHcp(tVal, tnId, hcp, gender) : null;
        var div = (typeof tnFindDivision === 'function') ? tnFindDivision(tVal, en2.effHcp, gender) : null;
        if (div && byDiv[div.id]) byDiv[div.id].list.push(en2);
        else unassigned.list.push(en2);
        if (tnIsGuestRoster(rp)) guests.list.push(en2);
    });
    if (unassigned.list.length) buckets.push(unassigned);

    var tabs = [{ key: 'all', label: en ? 'All' : 'Все', count: list.length, icon: 'fa-layer-group' }];
    buckets.forEach(function(b, bi) {
        if (!b.list.length) return;
        tabs.push({
            key: b.div ? (b.div.id || ('d' + bi)) : '__none',
            label: b.div ? (b.div.name || (en ? 'Group' : 'Группа')) : (en ? 'Without group' : 'Без группы'),
            count: b.list.length,
            icon: b.div ? (b.div.gender === 'women' ? 'fa-venus' : b.div.gender === 'men' ? 'fa-mars' : 'fa-layer-group') : 'fa-user-group'
        });
    });
    // «Гости» — отдельная вкладка, только если такие участники есть и их
    // ещё не показывает какая-то из групп администратора.
    var hasGuestDiv = divisions.some(function(d) { return /гост|guest/i.test(String(d.name || '')); });
    if (guests.list.length && !hasGuestDiv) {
        tabs.push({ key: '__guests', label: en ? 'Guests' : 'Гости', count: guests.list.length, icon: 'fa-user-tie' });
    }

    var shown = tnFilterByTab(tnId, buckets, guests.list).show.filter(function(b) { return b.list.length > 0; });
    if (!shown.length) shown = buckets.filter(function(b) { return b.list.length > 0; });

    var html = tnTabsHtml(tnId, tabs);
    if (shown.length > 1) {
        html += '<div class="tn-groups-toggle">' +
            '<button type="button" class="btn btn-og btn-sm" onclick="toggleTnAllGroups(\'' + tnId + '\',\'roster\',true)"><i class="fas fa-angles-down"></i> ' + (en ? 'Expand all' : 'Развернуть все') + '</button>' +
            '<button type="button" class="btn btn-og btn-sm" onclick="toggleTnAllGroups(\'' + tnId + '\',\'roster\',false)"><i class="fas fa-angles-up"></i> ' + (en ? 'Collapse all' : 'Свернуть все') + '</button>' +
            '</div>';
    }
    shown.forEach(function(b) {
        var divId = b.guestTab ? '__guests' : (b.div ? (b.div.id || '') : '__none');
        var isOpen = tnGroupIsOpen(tnId, 'roster', divId, true);
        html += '<div class="tn-group' + (isOpen ? ' open' : '') + '">';
        html += '<button type="button" class="tn-group-head" data-tn="' + escapeHtml(tnId) + '" data-ctx="roster" data-div="' + escapeHtml(divId) + '" onclick="toggleTnGroupEl(this)">' + tnGroupHeadHtml(b, en) + '</button>';
        html += '<div class="tn-group-body' + (isOpen ? '' : ' tn-collapsed') + '">';
        html += '<div style="overflow-x:auto;"><table class="lb-table lb-cards"><thead><tr><th>#</th><th>' + t('player') + '</th><th>HCP</th><th>' + (en ? 'Tee' : 'ТИ') + '</th><th>' + t('date') + '</th></tr></thead><tbody>';
        var rIdx = 1;
        b.list.forEach(function(en2) {
            var rp = en2.rp, rpid = en2.pid;
            html += '<tr><td data-label="#">' + (rIdx++) + '</td>';
            html += '<td class="lb-card-main"><strong style="color:var(--gold);">' + escapeHtml(privacyDisplayName(rp, rpid)) + '</strong>' +
                (tnIsGuestRoster(rp) ? ' <span class="tn-guest-chip">' + (en ? 'guest' : 'гость') + '</span>' : '') + '</td>';
            html += '<td data-label="HCP">' + (rp.handicap != null && rp.handicap !== '' ? fmtExactHcp(rp.handicap) + tnCutChipHtml(rp.handicap, en2.effHcp) : '—') + '</td>';
            html += '<td data-label="' + (en ? 'Tee' : 'ТИ') + '">' + fmtTeePill(rp.tee) + '</td>';
            html += '<td data-label="' + t('date') + '">' + fmtDate(rp.registeredAt) + '</td></tr>';
        });
        html += '</tbody></table></div>';
        html += '</div></div>';
    });
    return html;
}

// ==========================================
// ВНУТРИТУРНИРНЫЙ LIVE-ЛИДЕРБОРД
// Одна общая подписка на раунды + перерисовка открытых панелей.
// ==========================================
function ensureTnLbSubscription() {
    if (tnLbSubscribed) return;
    if (typeof db === 'undefined' || !db || typeof bindRealtimeValue !== 'function') return;
    tnLbSubscribed = true;
    bindRealtimeValue('tn-lb-rounds', db.ref('rounds'), function(sn) {
        tnLbRounds = (sn && sn.val && sn.val()) || {};
        Object.keys(tnLbOpen).forEach(function(tnId) {
            if (tnLbOpen[tnId]) renderTnLeaderboard(tnId);
        });
    });
}

function tnLbSort(a, b) {
    if (a.netToPar === null && b.netToPar === null) return (a.name || '').localeCompare(b.name || '');
    if (a.netToPar === null) return 1;
    if (b.netToPar === null) return -1;
    if (a.netToPar !== b.netToPar) return a.netToPar - b.netToPar;
    var at = a.toPar === null ? 999 : a.toPar, bt = b.toPar === null ? 999 : b.toPar;
    if (at !== bt) return at - bt;
    return (a.name || '').localeCompare(b.name || '');
}

function renderTnLeaderboard(tnId) {
    var panel = tGet('tnlb-' + tnId);
    if (!panel) return;
    var en = currentLang === 'en';
    var tVal = tnCache[tnId];
    if (!tVal) { panel.innerHTML = ''; return; }
    if (tnLbRounds === null) {
        ensureTnLbSubscription();
        panel.innerHTML = '<p style="font-size:12px;color:var(--muted);text-align:center;">' + (en ? 'Loading scores…' : 'Загрузка счёта…') + '</p>';
        return;
    }

    var divisions = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tVal) : [];
    var agg = {};
    var anyLive = false;

    Object.keys(tnLbRounds).forEach(function(rid) {
        var r = tnLbRounds[rid] || {};
        if (r.tournamentId !== tnId) return;
        if (r.status === 'active') anyLive = true;
        var order = (typeof getRoundOrder === 'function') ? getRoundOrder(r) : undefined;
        var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(r.players || {}) : (r.players || {});
        Object.keys(players).forEach(function(pid) {
            var p = players[pid] || {};
            if (typeof isPlayerDeleted === 'function') { try { if (isPlayerDeleted(pid, p.name)) return; } catch(e){} }
            var key = tnFioKey(p, pid);
            var stats;
            try {
                stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);
            } catch(e){ return; }
            var cur = agg[key];
            if (!cur) {
                cur = agg[key] = {
                    pid: pid, name: p.name || '—',
                    gender: p.gender || '', tee: p.tee || r.tee || '',
                    hcpRaw: (p.exactHcpRaw != null ? p.exactHcpRaw : (p.exactHcp != null ? p.exactHcp : (p.handicap != null ? p.handicap : null))),
                    hcpPlayed: (p.exactHcp != null ? p.exactHcp : null),
                    fieldHcp: (p.fieldHcp != null ? p.fieldHcp : null),
                    isGuest: tnIsGuestPlayer(pid, p),
                    gross: 0, parPlayed: 0, net: 0, stbl: 0, holes: 0, live: false, upd: 0,
                    rounds: []
                };
            }
            // Данные по раундам — для счётной карточки по клику игрока.
            var markerName = '';
            if (r.markerAssignments && r.markerAssignments[pid]) {
                var mtid = r.markerAssignments[pid].targetId;
                markerName = r.markerAssignments[pid].targetName ||
                    (r.players && r.players[mtid] ? (r.players[mtid].name || '') : '');
            }
            if (!markerName && p.markedBy && r.players && r.players[p.markedBy]) markerName = r.players[p.markedBy].name || '';
            cur.rounds.push({
                rid: rid,
                round: r,
                scores: p.scores || {},
                fieldHcp: p.fieldHcp || 0,
                exactHcp: p.exactHcp,
                exactHcpRaw: p.exactHcpRaw,
                tee: p.tee || r.tee || '',
                label: (r.roundName || r.protocolName || t('round') + ' ' + rid),
                groupNo: r.groupNo || null,
                startHole: r.startHole || 1,
                startTime: r.startTime || null,
                markerName: markerName,
                status: r.status || 'active',
                played: stats.holesPlayed || 0
            });
            cur.gross += stats.gross || 0;
            cur.parPlayed += stats.parPlayed || 0;
            cur.net += stats.net || 0;
            cur.stbl += stats.stablefordField || 0;
            cur.holes += stats.holesPlayed || 0;
            if (r.status === 'active' && stats.holesPlayed > 0) cur.live = true;
            var ts = r.updatedAt || r.createdAt || 0;
            if (ts > cur.upd) cur.upd = ts;
            if (!cur.tee) cur.tee = p.tee || r.tee || '';
            if (!cur.gender && p.gender) cur.gender = p.gender;
        });
    });

    var list = Object.keys(agg).map(function(k) { return agg[k]; });
    if (!list.length) {
        panel.innerHTML = '<p style="font-size:12px;color:var(--muted);text-align:center;">' +
            (en ? 'No scores yet — results will appear here live as soon as the game starts.' : 'Счёта пока нет — результаты появятся здесь live, как только начнётся игра.') + '</p>';
        return;
    }

    // Данные заявки точнее для распределения по группам (настоящие HCP/пол/ТИ).
    var regByFio = {};
    Object.keys(tVal.registeredPlayers || {}).forEach(function(uid) {
        var rp = tVal.registeredPlayers[uid] || {};
        regByFio[tnNormName(rp.name || '')] = rp;
    });
    list.forEach(function(en2) {
        var rp = regByFio[tnNormName(en2.name)] || {};
        var hcp = (rp.handicap != null && rp.handicap !== '') ? rp.handicap : en2.hcpRaw;
        var gender = rp.gender || en2.gender || 'men';
        en2.div = tnDivisionForHcp(tVal, tnId, hcp, gender);
        en2.toPar = en2.holes > 0 ? en2.gross - en2.parPlayed : null;
        en2.netToPar = en2.holes > 0 ? en2.net - en2.parPlayed : null;
        en2.dispName = privacyDisplayName({ name: en2.name }, en2.pid);
        if (tnIsGuestRoster(rp) || en2.isGuest) en2.isGuest = true;
        en2.rp = rp;
    });

    var buckets = [];
    var byDiv = {};
    divisions.forEach(function(d) {
        var b = { div: d, list: [] };
        buckets.push(b);
        byDiv[d.id] = b;
    });
    var unassigned = { div: null, list: [] };
    var guests = { div: null, list: [], guestTab: true };
    list.forEach(function(en2) {
        if (en2.div && byDiv[en2.div.id]) byDiv[en2.div.id].list.push(en2);
        else unassigned.list.push(en2);
        if (en2.isGuest) guests.list.push(en2);
    });
    if (unassigned.list.length) buckets.push(unassigned);

    // Вкладки групп: «Все» + каждая группа, которую создал администратор,
    // + «Гости», если на турнире есть гости (и их не показывает отдельная группа).
    var lbTabs = [{ key: 'all', label: en ? 'All' : 'Все', count: list.length, icon: 'fa-layer-group' }];
    buckets.forEach(function(b, bi) {
        if (!b.list.length) return;
        lbTabs.push({
            key: b.div ? (b.div.id || ('d' + bi)) : '__none',
            label: b.div ? (b.div.name || (en ? 'Group' : 'Группа')) : (en ? 'Without group' : 'Без группы'),
            count: b.list.length,
            icon: b.div ? (b.div.gender === 'women' ? 'fa-venus' : b.div.gender === 'men' ? 'fa-mars' : 'fa-layer-group') : 'fa-user-group'
        });
    });
    var lbHasGuestDiv = divisions.some(function(d) { return /гост|guest/i.test(String(d.name || '')); });
    if (guests.list.length && !lbHasGuestDiv) {
        lbTabs.push({ key: '__guests', label: en ? 'Guests' : 'Гости', count: guests.list.length, icon: 'fa-user-tie' });
    }

    // Место в группе считаем один раз для всех групп — и карточка игрока,
    // и таблица показывают одинаковые номера (в т.ч. при делёже мест).
    buckets.forEach(function(b) {
        b.list.sort(tnLbSort);
        var p = 0;
        b.list.forEach(function(en2, i) {
            if (i === 0 || en2.netToPar !== b.list[i - 1].netToPar || en2.toPar !== b.list[i - 1].toPar) p = i + 1;
            en2.position = p;
        });
    });

    // Счётные карточки игроков этого лидерборда — для клика по строке.
    tnScBuildCards(tnId, tVal, list);

    var statusLine = anyLive
        ? '<span class="tn-lb-live"><span class="tn-lb-dot"></span>' + (en ? 'LIVE — scores update instantly' : 'LIVE — счёт обновляется мгновенно') + '</span>'
        : (tVal.status === 'completed'
            ? '<span style="font-size:12px;color:#2ecc71;font-weight:700;">✅ ' + (en ? 'Final results' : 'Итоговые результаты') + '</span>'
            : '<span style="font-size:12px;color:var(--muted);">' + (en ? 'Last published scores' : 'Последние опубликованные счета') + '</span>');

    var html = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;"><strong style="color:var(--gold);font-size:15px;"><i class="fas fa-ranking-star"></i> ' +
        (en ? 'Tournament leaderboard' : 'Лидерборд турнира') + '</strong>' + statusLine + '</div>';

    // Вкладки фильтруют вывод: показываем только выбранную группу.
    var lbShown = tnFilterByTab(tnId, buckets, guests.list).show.filter(function(b) { return b.list.length > 0; });
    if (!lbShown.length) lbShown = buckets.filter(function(b) { return b.list.length > 0; });
    html += tnTabsHtml(tnId, lbTabs);
    if (lbShown.length > 1) {
        html += '<div class="tn-groups-toggle">' +
            '<button type="button" class="btn btn-og btn-sm" onclick="toggleTnAllGroups(\'' + tnId + '\',\'lb\',true)"><i class="fas fa-angles-down"></i> ' + (en ? 'Expand all' : 'Развернуть все') + '</button>' +
            '<button type="button" class="btn btn-og btn-sm" onclick="toggleTnAllGroups(\'' + tnId + '\',\'lb\',false)"><i class="fas fa-angles-up"></i> ' + (en ? 'Collapse all' : 'Свернуть все') + '</button>' +
            '</div>';
    }
    lbShown.forEach(function(b, bi) {
        b.list.sort(tnLbSort);
        var lbDivId = b.guestTab ? '__guests' : (b.div ? (b.div.id || ('d' + bi)) : '__none');
        var lbOpen = tnGroupIsOpen(tnId, 'lb', lbDivId, true);
        html += '<div class="tn-group' + (lbOpen ? ' open' : '') + '">';
        html += '<button type="button" class="tn-group-head" data-tn="' + escapeHtml(tnId) + '" data-ctx="lb" data-div="' + escapeHtml(lbDivId) + '" onclick="toggleTnGroupEl(this)">' + tnGroupHeadHtml(b, en) + '</button>';
        html += '<div class="tn-group-body' + (lbOpen ? '' : ' tn-collapsed') + '">';
        html += '<div style="overflow-x:auto;"><table class="lb-table tn-lb-table"><thead><tr><th>#</th><th>' + t('player') + '</th><th>' +
            (en ? 'Thru' : 'Лунки') + '</th><th>' + (en ? 'Gross' : 'Гросс') + '</th><th>±</th><th>' + (en ? 'Net' : 'Нетто') + '</th><th>' + (en ? 'Stbl' : 'Стбл') + '</th><th></th></tr></thead><tbody>';
        b.list.forEach(function(en2, i) {
            var pos = en2.position || (i + 1);
            var medal = pos === 1 ? '🥇 ' : pos === 2 ? '🥈 ' : pos === 3 ? '🥉 ' : '';
            var thru = en2.holes > 0 ? en2.holes : '—';
            var fioKey = escapeHtml(tnFioKey({ name: en2.name }, en2.pid));
            // Вся строка — кнопка: клик открывает счётную карточку игрока.
            html += '<tr class="tn-lb-row" onclick="tnScOpen(\'' + escapeHtml(tnId) + '\',\'' + fioKey + '\')" title="' +
                (en ? 'Scorecard' : 'Счётная карточка') + '">';
            html += '<td><strong style="color:var(--gold);">' + medal + pos + '</strong></td>';
            html += '<td class="lb-card-main"><strong style="color:var(--white);">' + escapeHtml(en2.dispName) + '</strong>' +
                (en2.live ? ' <span class="tn-lb-live" style="font-size:10px;">●</span>' : '') +
                (en2.isGuest ? ' <span class="tn-guest-chip">' + (en ? 'guest' : 'гость') + '</span>' : '') + '</td>';
            html += '<td>' + thru + '</td>';
            html += '<td>' + (en2.holes > 0 ? en2.gross : '—') + '</td>';
            html += '<td><strong class="' + scoreClass(en2.toPar) + '">' + fmtScore(en2.toPar) + '</strong></td>';
            html += '<td>' + (en2.netToPar === null ? '—' : en2.net + ' (' + fmtScore(en2.netToPar) + ')') + '</td>';
            html += '<td>' + (en2.holes > 0 ? en2.stbl : '—') + '</td>';
            html += '<td class="tn-lb-card-btn"><i class="fas fa-table-list"></i></td></tr>';
        });
        html += '</tbody></table></div>';
        html += '</div></div>';
    });

    panel.innerHTML = html;
}

// ==========================================
// СЧЁТНЫЕ КАРТОЧКИ ИГРОКОВ ЛИДЕРБОРДА (клик по строке)
// ==========================================
// Перерисовывает все открытые панели лидерборда — нужно, когда админ сменил
// вид счётной карточки (settings/tn_scorecard_variant) или пришли новые счета.
function rerenderOpenTnLeaderboards() {
    try {
        Object.keys(tnLbOpen || {}).forEach(function(tnId) {
            if (tnLbOpen[tnId]) renderTnLeaderboard(tnId);
        });
    } catch (e) {}
    try {
        if (typeof tnScRerender === 'function') tnScRerender();
    } catch (e) {}
}

// Данные берутся из того же снапшота раундов, что и лидерборд, и передаются
// модулю js/tn-scorecard.js, который рисует три оформления на выбор админа.
function tnScBuildCards(tnId, tVal, list) {
    if (typeof tnScSetCards !== 'function') return;
    var map = {};
    var cut = tnTournamentCut(tVal, tnId);
    (list || []).forEach(function(en2) {
        var key = tnFioKey({ name: en2.name }, en2.pid);
        if (!key) return;
        var totals = { holes: 0, gross: 0, par: 0, toPar: null, net: 0, netToPar: null, stbl: 0, birdies: 0, eagles: 0 };
        var rounds = (en2.rounds || []).map(function(rd) {
            var r = rd.round || {};
            var labelBits = [];
            if (r.format) labelBits.push(r.format);
            if (rd.startTime) labelBits.push(fmtTime(rd.startTime));
            if (rd.groupNo) labelBits.push((currentLang === 'en' ? 'Group ' : 'Группа ') + rd.groupNo);
            if (rd.startHole) labelBits.push((currentLang === 'en' ? 'hole ' : 'лунка ') + rd.startHole);
            var block = (typeof tnScRoundBlock === 'function')
                ? tnScRoundBlock({
                    scores: rd.scores, fieldHcp: rd.fieldHcp, round: r,
                    label: labelBits.join(' · ')
                })
                : null;
            if (block) {
                totals.holes += block.totals.holes || 0;
                totals.gross += block.totals.gross || 0;
                totals.par += block.totals.par || 0;
                totals.net += block.totals.net || 0;
                totals.stbl += block.totals.stbl || 0;
                totals.birdies += block.totals.birdies || 0;
                totals.eagles += block.totals.eagles || 0;
            }
            return { block: block, raw: rd };
        }).filter(function(x) { return x.block; });

        totals.toPar = totals.holes ? totals.gross - totals.par : null;
        totals.netToPar = totals.holes ? totals.net - totals.par : null;

        // Раунды упорядочиваем по времени старта (ключи Firebase идут в
        // произвольном порядке), а данные для шапки берём из последнего
        // раунда; если в нём нет флайта/маркера — из последнего, где они есть.
        rounds.sort(function(a, b) {
            var ta = (a.raw.startTime || (a.raw.round && a.raw.round.createdAt) || 0);
            var tb = (b.raw.startTime || (b.raw.round && b.raw.round.createdAt) || 0);
            return ta - tb;
        });
        var cardRounds = rounds.map(function(x) { return x.block; });
        var lastRaw = rounds.length ? rounds[rounds.length - 1].raw : {};
        for (var ri = rounds.length - 1; ri >= 0; ri--) {
            if (rounds[ri].raw.groupNo || rounds[ri].raw.markerName) { lastRaw = rounds[ri].raw; break; }
        }
        var effHcp = (typeof tnApplyHcpCut === 'function' && en2.hcpRaw != null && cut)
            ? (function() { try { return tnApplyHcpCut(en2.hcpRaw, en2.gender || 'men', cut).effective; } catch (e) { return en2.hcpPlayed; } })()
            : en2.hcpPlayed;
        var cutChanged = (en2.hcpRaw != null && effHcp != null &&
            Math.abs(parseFloat(effHcp) - parseFloat(en2.hcpRaw)) >= 0.05);

        map[key] = {
            key: key,
            name: en2.dispName || en2.name || '—',
            tournamentName: tVal.name || '',
            dateTxt: tVal.date ? fmtDate((typeof tnDateTs === 'function') ? tnDateTs(tVal.date) : Date.parse(tVal.date)) : '',
            format: (tVal.formats || []).join(' + ') || (rounds.length && rounds[0].raw.round && rounds[0].raw.round.format) || 'Stroke Play',
            teeTxt: (typeof fmtTeePill === 'function' && (en2.tee || (lastRaw.tee))) ? fmtTeePill(en2.tee || lastRaw.tee) : '',
            divName: en2.div ? (en2.div.name || '') : '',
            groupLabel: lastRaw.groupNo ? ((currentLang === 'en' ? 'Group ' : 'Группа ') + lastRaw.groupNo) : '',
            startHole: lastRaw.startHole || 1,
            startTimeTxt: lastRaw.startTime ? fmtTime(lastRaw.startTime) : '',
            markerName: lastRaw.markerName || '',
            markerNote: lastRaw.markerName
                ? (currentLang === 'en' ? 'Marker: this player kept the scorecard of ' + lastRaw.markerName : 'Маркировал счёт игрока: ' + lastRaw.markerName)
                : '',
            hcpRaw: en2.hcpRaw,
            effHcp: effHcp,
            fieldHcp: lastRaw.fieldHcp != null ? lastRaw.fieldHcp : en2.fieldHcp,
            cutNote: cutChanged
                ? ((currentLang === 'en' ? 'Handicap cut for this tournament only: ' : 'Обрезка гандикапа только на этом турнире: ') +
                   (typeof fmtExactHcp === 'function' ? fmtExactHcp(en2.hcpRaw) : en2.hcpRaw) + ' → ' +
                   (typeof fmtExactHcp === 'function' ? fmtExactHcp(effHcp) : effHcp))
                : '',
            position: en2.position || null,
            isGuest: !!en2.isGuest,
            live: !!en2.live,
            rounds: cardRounds,
            totals: totals
        };
    });
    tnScSetCards(tnId, map);
}

// ==========================================
// ЗАПИСЬ НА ТУРНИР: участники + гости без регистрации
// ==========================================
function tnRegistrationClosedText() {
    return currentLang === 'en'
        ? '⛔ Registration is closed — the tournament has already started'
        : '⛔ Запись закрыта — турнир уже начался';
}

// Перепроверка статуса турнира в БД перед записью/отменой: карточка могла
// устареть, пока окно было открыто. Пустой статус считаем upcoming (старые записи).
function tnEnsureRegistrationOpen(tnId, proceed) {
    if (typeof db === 'undefined' || !db) return;
    db.ref('tournaments/' + tnId + '/status').once('value').then(function(sn) {
        var st = sn.val();
        if (st && st !== 'upcoming') {
            toast(tnRegistrationClosedText(), 'error');
            closeRegTnModal();
            return;
        }
        if (typeof proceed === 'function') proceed();
    }).catch(function() {
        // Не смогли проверить (сеть) — пропускаем дальше, запись всё равно видна админу.
        if (typeof proceed === 'function') proceed();
    });
}

function openTournamentRegModal(tnId) {
    // Гостям больше не нужен редирект на регистрацию — записываем прямо здесь.
    if (typeof db === 'undefined' || !db) return;
    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal) return;
        if (tVal.status && tVal.status !== 'upcoming') {
            toast(tnRegistrationClosedText(), 'error');
            return;
        }

        var modalEl = tGet('reg-tn-modal');
        if (!modalEl) {
            try {
                modalEl = document.createElement('div');
                modalEl.id = 'reg-tn-modal';
                modalEl.className = 'modal hidden';
                var backTxt = (typeof t === 'function') ? t('back_btn') : 'Back';
                modalEl.innerHTML =
                    '<div class="modal-bg" onclick="closeRegTnModal()"></div>' +
                    '<div class="modal-body" style="max-width:520px;text-align:center;">' +
                    '<div class="modal-top-bar">' +
                    '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeRegTnModal()"><i class="fas fa-arrow-left"></i> <span>' + backTxt + '</span></button>' +
                    '<button type="button" class="modal-close-btn" onclick="closeRegTnModal()">&times;</button>' +
                    '</div>' +
                    '<div id="reg-tn-modal-body"></div>' +
                    '</div>';
                if (document.body) document.body.appendChild(modalEl);
            } catch(e){ return; }
        }

        var bodyEl = tGet('reg-tn-modal-body');
        var allowedTees = tVal.tees || ['wh'];
        var en = currentLang === 'en';

        var html = '<h2 style="color:var(--gold);margin-bottom:8px;"><i class="fas fa-trophy"></i> ' + escapeHtml(tVal.name || 'Tournament') + '</h2>';

        if (currentUser) {
            var defaultTee = (currentUserData && currentUserData.defaultTee) || allowedTees[0];
            html += '<p style="font-size:13px;color:var(--muted);margin-bottom:20px;">' + t('confirm_registration') + '</p>';
            html += '<div class="card" style="background:var(--input);padding:16px;text-align:left;margin-bottom:20px;">';
            html += '<div style="font-size:14px;color:var(--white);font-weight:700;margin-bottom:6px;"><i class="fas fa-user"></i> ' + escapeHtml(currentUserData ? currentUserData.name : 'Player') + '</div>';
            html += '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">HCP: ' + (currentUserData && currentUserData.handicap != null ? fmtExactHcp(currentUserData.handicap) : '—') + '</div>';
            html += '<div class="form-group" style="margin:0;"><label>' + t('tee_select') + ':</label><select id="reg-tn-tee" class="form-input">';
            allowedTees.forEach(function(tk) {
                var sel = tk === defaultTee ? 'selected' : '';
                html += '<option value="' + tk + '" ' + sel + '>' + t('tee_' + tk) + '</option>';
            });
            html += '</select></div></div>';
        } else {
            html += '<p style="font-size:13px;color:var(--muted);margin-bottom:16px;">' +
                (en ? 'No account needed — just enter your details. Start typing your name for a hint.' : 'Аккаунт не нужен — просто укажите данные. Начните вводить фамилию — появится подсказка.') + '</p>';
            html += '<div class="guest-reg-grid">';
            html += '<div class="form-group" style="margin:0;"><label>' + (en ? 'Full name *' : 'Фамилия Имя Отчество *') + '</label>' +
                '<input type="text" id="reg-guest-name" class="form-input" placeholder="' + (en ? 'Ivanov Ivan' : 'Иванов Иван Иванович') + '" autocomplete="off"></div>';
            html += '<div class="form-group" style="margin:0;"><label>' + (en ? 'Exact handicap' : 'Точный гандикап') + '</label>' +
                '<input type="text" id="reg-guest-hcp" class="form-input" placeholder="12.4" inputmode="decimal"></div>';
            html += '<div class="form-group" style="margin:0;"><label>' + (en ? 'Gender' : 'Пол') + '</label>' +
                '<select id="reg-guest-gender" class="form-input"><option value="men">' + (en ? 'Men' : 'Мужской') + '</option>' +
                '<option value="women">' + (en ? 'Women' : 'Женский') + '</option></select></div>';
            html += '<div class="form-group" style="margin:0;"><label>' + t('tee_select') + '</label>' +
                '<select id="reg-guest-tee" class="form-input">';
            allowedTees.forEach(function(tk) {
                html += '<option value="' + tk + '">' + t('tee_' + tk) + '</option>';
            });
            html += '</select></div>';
            html += '<div class="form-group" style="margin:0;grid-column:1/-1;"><label>' + (en ? 'Phone (optional)' : 'Телефон (необязательно)') + '</label>' +
                '<input type="tel" id="reg-guest-phone" class="form-input" placeholder="+7 …"></div>';
            html += '</div>';
            html += '<p style="font-size:12px;color:var(--muted);margin:12px 0 16px;">' +
                (en ? 'Already have an account?' : 'Уже есть аккаунт?') + ' <a href="auth.html?redirect=tournaments.html" style="color:var(--gold);font-weight:700;">' +
                (en ? 'Log in' : 'Войти') + '</a></p>';
        }

        html += '<div style="display:flex;gap:12px;">';
        html += '<button class="btn btn-og" style="flex:1;" onclick="closeRegTnModal()">' + t('cancel_btn') + '</button>';
        html += '<button class="btn btn-g" style="flex:1;" onclick="submitTournamentRegistration(\'' + tnId + '\')"><i class="fas fa-check"></i> ' + (en ? 'Register' : 'Записаться') + '</button>';
        html += '</div>';

        bodyEl.innerHTML = html;
        modalEl.classList.remove('hidden');

        // Автоподсказка по известным игрокам для гостевой записи.
        if (!currentUser && typeof initPlayerSearchAutofill === 'function') {
            try {
                initPlayerSearchAutofill({
                    searchInputId: 'reg-guest-name',
                    onSelect: function(m) {
                        var nEl = tGet('reg-guest-name');
                        var hEl = tGet('reg-guest-hcp');
                        var gEl = tGet('reg-guest-gender');
                        var tEl = tGet('reg-guest-tee');
                        if (nEl) nEl.value = m.name || '';
                        if (hEl && m.handicap != null) hEl.value = String(m.handicap).replace('.', ',');
                        if (gEl && m.gender) gEl.value = m.gender;
                        if (tEl && m.defaultTee) {
                            for (var i = 0; i < tEl.options.length; i++) {
                                if (tEl.options[i].value === m.defaultTee) { tEl.selectedIndex = i; break; }
                            }
                        }
                    }
                });
            } catch(e){}
        }
    });
}

function closeRegTnModal() {
    var modalEl = document.getElementById('reg-tn-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function submitTournamentRegistration(tnId) {
    // Повторная проверка статуса: турнир могли активировать, пока окно открыто.
    tnEnsureRegistrationOpen(tnId, function() { submitTournamentRegistrationInner(tnId); });
}

function submitTournamentRegistrationInner(tnId) {
    var en = currentLang === 'en';
    if (typeof db === 'undefined' || !db) return;

    if (currentUser) {
        var teeInp = document.getElementById('reg-tn-tee');
        var selectedTee = teeInp ? teeInp.value : 'wh';

        var regData = {
            uid: currentUser.uid,
            name: currentUserData ? currentUserData.name : 'Player',
            handicap: currentUserData && currentUserData.handicap != null ? currentUserData.handicap : 0,
            gender: currentUserData ? currentUserData.gender : 'men',
            tee: selectedTee,
            registeredAt: Date.now()
        };

        // Пишем под своим uid, но сначала убираем возможные дубли этого же игрока:
        // гостевые записи со случайным ключом и записи, ссылающиеся на наш uid.
        db.ref('tournaments/' + tnId + '/registeredPlayers').once('value').then(function(sn) {
            var updates = {};
            var myName = tnNormName(regData.name);
            Object.keys(sn.val() || {}).forEach(function(k) {
                var rp = (sn.val() || {})[k] || {};
                if (k === currentUser.uid) return;
                if (rp.uid && rp.uid === currentUser.uid) { updates['tournaments/' + tnId + '/registeredPlayers/' + k] = null; return; }
                if (rp.guest === true && tnNormName(rp.name || '') === myName) updates['tournaments/' + tnId + '/registeredPlayers/' + k] = null;
                // Сгенерированная из стартового листа запись (user_*) того же
                // человека — тоже дубль: теперь игрок записывается аккаунтом.
                if (rp.uid && String(rp.uid).indexOf('user_') === 0 && rp.guest !== true && tnNormName(rp.name || '') === myName) updates['tournaments/' + tnId + '/registeredPlayers/' + k] = null;
            });
            updates['tournaments/' + tnId + '/registeredPlayers/' + currentUser.uid] = regData;
            return db.ref().update(updates);
        }).then(function() {
            toast(t('msg_tournament_registered'), 'success');
            closeRegTnModal();
            loadTournaments();
        }).catch(function(err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
        });
        return;
    }

    // Гостевая запись без аккаунта.
    var nameEl = tGet('reg-guest-name');
    var hcpEl = tGet('reg-guest-hcp');
    var genderEl = tGet('reg-guest-gender');
    var teeEl = tGet('reg-guest-tee');
    var phoneEl = tGet('reg-guest-phone');
    var name = nameEl ? nameEl.value.trim().replace(/\s+/g, ' ') : '';
    if (name.length < 3 || name.split(' ').length < 2) {
        toast(en ? '⚠️ Please enter your first and last name' : '⚠️ Укажите фамилию и имя', 'error');
        if (nameEl && nameEl.focus) nameEl.focus();
        return;
    }
    var hcpRaw = hcpEl ? hcpEl.value.trim() : '';
    var handicap = null;
    if (hcpRaw !== '') {
        handicap = (typeof parseExactHcp === 'function') ? parseExactHcp(hcpRaw) : parseFloat(hcpRaw.replace(',', '.'));
        if (isNaN(handicap)) {
            toast(en ? '⚠️ Invalid handicap (example: 12.4)' : '⚠️ Некорректный гандикап (пример: 12,4)', 'error');
            if (hcpEl && hcpEl.focus) hcpEl.focus();
            return;
        }
        handicap = Math.round(handicap * 10) / 10;
    }

    db.ref('tournaments/' + tnId + '/registeredPlayers').once('value').then(function(sn) {
        var existing = sn.val() || {};
        var norm = tnNormName(name);
        var dup = Object.keys(existing).some(function(k) {
            return tnNormName((existing[k] || {}).name || '') === norm;
        });
        if (dup) {
            toast(en ? '⚠️ This name is already registered' : '⚠️ Такое имя уже записано', 'error');
            return;
        }
        var guestData = {
            name: name,
            handicap: handicap,
            gender: genderEl ? genderEl.value : 'men',
            tee: teeEl ? teeEl.value : 'wh',
            phone: phoneEl ? phoneEl.value.trim() : '',
            guest: true,
            registeredAt: Date.now()
        };
        db.ref('tournaments/' + tnId + '/registeredPlayers').push(guestData).then(function() {
            toast(en ? '✅ You are registered! See you at the tournament.' : '✅ Вы записаны! До встречи на турнире.', 'success');
            closeRegTnModal();
            if (typeof vib === 'function') { try { vib(60); } catch(e){} }
        }).catch(function(err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function cancelTournamentRegistration(tnId) {
    if (!currentUser) return;
    if (typeof db === 'undefined' || !db) return;
    if (!confirm(currentLang === 'en' ? 'Cancel registration for this tournament?' : 'Отменить запись на этот турнир?')) return;

    // Отмена возможна только до старта: на активном/завершённом состав фиксирован.
    db.ref('tournaments/' + tnId + '/status').once('value').then(function(sn) {
        var st = sn.val();
        if (st && st !== 'upcoming') {
            toast(tnRegistrationClosedText(), 'error');
            return { blocked: true };
        }
        return db.ref('tournaments/' + tnId + '/registeredPlayers/' + currentUser.uid).remove();
    }).then(function(res) {
        if (res && res.blocked) return;
        toast(t('msg_registration_cancelled'), 'info');
        loadTournaments();
    }).catch(function(err) {
        if (err) toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}
