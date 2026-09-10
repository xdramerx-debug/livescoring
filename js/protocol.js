// ==========================================
// ПРОТОКОЛ ЗАВЕРШЕНИЯ ТУРНИРА (экспорт в PDF / печать)
// ------------------------------------------
// Доступен для ЗАВЕРШЁННЫХ турниров — как завершённых вручную
// (кнопка «Финиш» в админке), так и автоматически (когда все игроки
// ввели счета и завершили все раунды турнира).
//
// Позволяет выбрать номинации (Best Gross / Best Net / Top-3 Stableford
// с учётом и без учёта гандикапа, отдельно мужчины и женщины) в разных
// группах (дивизионах по гандикапу) и сформировать печатный протокол:
//   • «Только призёры» — компактный лист A4 с результатми призовых мест;
//   • «Полный протокол» — номинации + итоговые таблицы всех участников
//     (опционально с счетом по лункам, если раунд был один).
// PDF: в диалоге печати браузера выбираем «Сохранить как PDF».
// ==========================================

var tpState = {
    tnId: null,
    loading: false,
    tVal: null,
    rounds: null,
    cut: null,
    data: null
};

function tpL(ru, en) {
    return (typeof currentLang !== 'undefined' && currentLang === 'en') ? en : ru;
}

// ── Пол: канонизируем любое значение в 'men' | 'women' ──
function tpIsWomen(g) {
    var s = String(g == null ? '' : g).toLowerCase();
    return s === 'women' || s === 'woman' || s === 'female' || s === 'w' || s === 'f' ||
        s.indexOf('жен') === 0 || s.indexOf('дев') === 0;
}
function tpGenderNorm(g) { return tpIsWomen(g) ? 'women' : 'men'; }

// ── Ключ ФИО для склейки игрока между раундами (как в «Турнирах») ──
function tpFioKey(p, pid) {
    try {
        if (typeof getPlayerFioKey === 'function') {
            var k = getPlayerFioKey({
                name: p.name || '', firstName: p.firstName || '',
                lastName: p.lastName || '', middleName: p.middleName || ''
            });
            if (k) return k;
        }
    } catch (e) {}
    var s = String(p.name == null ? '' : p.name).toLowerCase().replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
    return s || ('pid:' + pid);
}

// ── Обрезка гандикапа: на турнире или (для старых данных) в протоколе ──
function tpTournamentCut(tVal, rounds) {
    if (tVal && tVal.hcpCut && typeof tVal.hcpCut === 'object') return tVal.hcpCut;
    return null; // при отсутствии — попробуем подтянуть из protocols (см. tnOpenProtocolModal)
}

// ── Загрузка данных и открытие модалки ──
function tnOpenProtocolModal(tnId) {
    if (typeof db === 'undefined' || !db) {
        toast(tpL('⚠️ Нет соединения с базой', '⚠️ No database connection'), 'error');
        return;
    }
    tpState.tnId = tnId;
    tpState.loading = true;
    tpState.data = null;
    tpOpenModalShell('<div style="padding:26px;text-align:center;color:var(--muted);"><div class="spinner"></div>' + tpL('Загрузка результатов…', 'Loading results…') + '</div>');

    Promise.all([
        db.ref('tournaments/' + tnId).once('value'),
        db.ref('rounds').once('value')
    ]).then(function(res) {
        var tVal = res[0].val();
        if (!tVal) throw new Error(tpL('Турнир не найден', 'Tournament not found'));
        var allRounds = res[1].val() || {};
        var rounds = {};
        Object.keys(allRounds).forEach(function(rid) {
            if (allRounds[rid] && String(allRounds[rid].tournamentId) === String(tnId)) rounds[rid] = allRounds[rid];
        });
        tpState.tVal = tVal;
        tpState.rounds = rounds;
        var cut = tpTournamentCut(tVal, rounds);
        if (cut) { tpState.cut = cut; return null; }
        // Старые данные: обрезка могла лежать только в протоколе старта
        return db.ref('protocols').once('value').then(function(psSn) {
            var ps = psSn.val() || {};
            var best = null, bestTs = -1;
            Object.keys(ps).forEach(function(pid) {
                var doc = ps[pid] || {};
                if (String(doc.tournamentId) !== String(tnId)) return;
                if (!doc.hcpCut || typeof doc.hcpCut !== 'object') return;
                var ts = doc.updatedAt || doc.createdAt || 0;
                if (ts >= bestTs) { bestTs = ts; best = doc.hcpCut; }
            });
            tpState.cut = best || null;
        });
    }).then(function() {
        tpState.data = tpBuildData();
        tpState.loading = false;
        tpRenderModal();
    }).catch(function(err) {
        tpState.loading = false;
        var body = document.getElementById('tp-modal-body');
        if (body) body.innerHTML = '<div style="padding:22px;color:var(--red,#ff6b5e);">❌ ' +
            escapeHtml(err && err.message ? err.message : String(err)) + '</div>';
    });
}

// ── Агрегация результатов по всем раундам турнира ──
function tpBuildData() {
    var tVal = tpState.tVal || {};
    var tnId = tpState.tnId;
    var rounds = tpState.rounds || {};
    var cut = tpState.cut || null;
    var ridList = Object.keys(rounds);
    var singleRound = ridList.length === 1;

    var agg = {};
    var completedRounds = 0;
    ridList.forEach(function(rid) {
        var r = rounds[rid] || {};
        if (r.status === 'completed') completedRounds++;
        var order = (typeof getRoundOrder === 'function') ? getRoundOrder(r) : [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];
        var players = (typeof dedupeRoundPlayersByFio === 'function') ? dedupeRoundPlayersByFio(r.players || {}) : (r.players || {});
        Object.keys(players).forEach(function(pid) {
            var p = players[pid] || {};
            if (typeof isPlayerDeleted === 'function') { try { if (isPlayerDeleted(pid, p.name)) return; } catch (e) {} }
            var stats;
            try {
                stats = calcRoundStats(p.scores || {}, p.fieldHcp || 0, p.exactHcp || 0, order);
            } catch (e) { return; }
            if (!stats || !stats.holesPlayed) return;
            var key = tpFioKey(p, pid);
            var en2 = agg[key];
            if (!en2) {
                en2 = agg[key] = {
                    pid: pid, name: p.name || '—',
                    gender: tpGenderNorm(p.gender), tee: p.tee || r.tee || '',
                    hcpRaw: (p.exactHcpRaw != null ? p.exactHcpRaw : (p.exactHcp != null ? p.exactHcp : null)),
                    fieldHcp: p.fieldHcp || 0,
                    gross: 0, parPlayed: 0, net: 0, stbl: 0, stbl0: 0, holes: 0, rounds: 0,
                    scores: singleRound ? {} : null
                };
            }
            en2.gross += stats.gross || 0;
            en2.parPlayed += stats.parPlayed || 0;
            en2.net += stats.net || 0;
            en2.stbl += stats.stablefordField || 0;
            en2.holes += stats.holesPlayed || 0;
            en2.rounds += 1;
            // Stableford БЕЗ учёта гандикапа (gross-stableford)
            for (var i = 0; i < order.length; i++) {
                var h = order[i], sVal = parseInt((p.scores || {})[h]);
                if (sVal >= 1) {
                    en2.stbl0 += stablefordField(sVal, h, 0);
                    if (en2.scores) en2.scores[h] = sVal;
                }
            }
            if (!en2.tee) en2.tee = p.tee || r.tee || '';
        });
    });

    // Заявка точнее для HCP/пола/групп, чем раунд
    var regByFio = {};
    Object.keys(tVal.registeredPlayers || {}).forEach(function(uid) {
        var rp = tVal.registeredPlayers[uid] || {};
        var k = tpFioKey(rp, uid);
        if (!regByFio[k]) regByFio[k] = rp;
    });

    var list = Object.keys(agg).map(function(k) { return agg[k]; });
    list.forEach(function(en2) {
        var rp = regByFio[tpFioKey(en2, en2.pid)] || {};
        var hcpSrc = (rp.handicap != null && rp.handicap !== '') ? rp.handicap : en2.hcpRaw;
        en2.gender = rp.gender ? tpGenderNorm(rp.gender) : en2.gender;
        en2.hcpForDiv = hcpSrc;
        en2.effHcp = hcpSrc;
        if (cut && typeof tnApplyHcpCut === 'function' && hcpSrc != null && hcpSrc !== '') {
            try { en2.effHcp = tnApplyHcpCut(hcpSrc, en2.gender, cut).effective; } catch (e) {}
        }
        en2.div = (typeof tnFindDivision === 'function')
            ? tnFindDivision(tVal, en2.effHcp, en2.gender, { pid: en2.pid, name: en2.name || '' })
            : null;
        en2.toPar = en2.holes > 0 ? en2.gross - en2.parPlayed : null;
        en2.netToPar = en2.holes > 0 ? en2.net - en2.parPlayed : null;
        var dispP = { name: en2.name };
        en2.dispName = (typeof privacyDisplayName === 'function') ? privacyDisplayName(dispP, en2.pid) : en2.name;
    });

    // Группы (дивизионы турнира) + абсолют
    var divisions = (typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tVal) : [];
    var scopes = [{ key: 'abs', name: tpL('Абсолютный зачёт', 'Overall (all players)'), players: list.slice() }];
    var byDiv = {};
    divisions.forEach(function(d) {
        var sc = { key: 'd:' + (d.id || ''), name: (d.name || '—'), players: [] };
        var rg = (typeof tnDivisionRangeText === 'function') ? tnDivisionRangeText(d) : '';
        if (rg) sc.range = rg;
        if (d.gender && d.gender !== 'all') sc.genderLabel = (typeof tnDivisionGenderText === 'function') ? tnDivisionGenderText(d.gender) : '';
        if (d.tee) sc.teeLabel = TEES[d.tee] || d.tee;
        scopes.push(sc);
        byDiv[sc.key] = sc;
    });
    var noneScope = { key: 'none', name: tpL('Без группы', 'Without group'), players: [] };
    list.forEach(function(en2) {
        if (en2.div && byDiv['d:' + (en2.div.id || '')]) byDiv['d:' + (en2.div.id || '')].players.push(en2);
        else noneScope.players.push(en2);
    });
    if (noneScope.players.length) scopes.push(noneScope);

    return {
        scopes: scopes.filter(function(s) { return s.players.length > 0; }),
        allPlayers: list,
        roundsTotal: ridList.length,
        roundsCompleted: completedRounds,
        singleRound: singleRound,
        hasResults: list.length > 0
    };
}

// ── Типы номинаций ──
function tpNomTypes() {
    return [
        { id: 'gross_m', kind: 'strokes', gender: 'men',   label: 'Best Gross · ' + tpL('Мужчины', 'Men') },
        { id: 'gross_w', kind: 'strokes', gender: 'women', label: 'Best Gross · ' + tpL('Женщины', 'Ladies') },
        { id: 'net_m',   kind: 'net',     gender: 'men',   label: 'Best Net · ' + tpL('Мужчины', 'Men') },
        { id: 'net_w',   kind: 'net',     gender: 'women', label: 'Best Net · ' + tpL('Женщины', 'Ladies') },
        { id: 'stbl_m',  kind: 'stbl',    gender: 'men',   label: 'Top-3 Stableford ' + tpL('(с учётом гандикапа)', '(with handicap)') + ' · ' + tpL('Мужчины', 'Men') },
        { id: 'stbl_w',  kind: 'stbl',    gender: 'women', label: 'Top-3 Stableford ' + tpL('(с учётом гандикапа)', '(with handicap)') + ' · ' + tpL('Женщины', 'Ladies') },
        { id: 'stbl0_m', kind: 'stbl0',   gender: 'men',   label: 'Top-3 Stableford ' + tpL('(без гандикапа)', '(no handicap)') + ' · ' + tpL('Мужчины', 'Men') },
        { id: 'stbl0_w', kind: 'stbl0',   gender: 'women', label: 'Top-3 Stableford ' + tpL('(без гандикапа)', '(no handicap)') + ' · ' + tpL('Женщины', 'Ladies') }
    ];
}

// Сортировки по типу номинации: возвращают «значение лучше = раньше».
function tpNomCmp(kind) {
    if (kind === 'strokes') return function(a, b) {
        var av = a.toPar === null ? 999 : a.toPar, bv = b.toPar === null ? 999 : b.toPar;
        if (av !== bv) return av - bv;
        if (a.gross !== b.gross) return a.gross - b.gross;
        return (a.dispName || '').localeCompare(b.dispName || '');
    };
    if (kind === 'net') return function(a, b) {
        var av = a.netToPar === null ? 999 : a.netToPar, bv = b.netToPar === null ? 999 : b.netToPar;
        if (av !== bv) return av - bv;
        var at = a.toPar === null ? 999 : a.toPar, bt = b.toPar === null ? 999 : b.toPar;
        if (at !== bt) return at - bt;
        return (a.dispName || '').localeCompare(b.dispName || '');
    };
    if (kind === 'stbl') return function(a, b) {
        if (a.stbl !== b.stbl) return b.stbl - a.stbl;
        return (a.dispName || '').localeCompare(b.dispName || '');
    };
    // stbl0 — stableford без учёта гандикапа
    return function(a, b) {
        if (a.stbl0 !== b.stbl0) return b.stbl0 - a.stbl0;
        return (a.dispName || '').localeCompare(b.dispName || '');
    };
}

// Итоговый список игроков номинации (top-3, с медалями) и «значение» строки
function tpNomValueText(kind, en2) {
    if (kind === 'strokes') return 'Gross ' + en2.gross + ' (' + fmtScore(en2.toPar) + ')';
    if (kind === 'net') return 'Net ' + en2.net + ' (' + fmtScore(en2.netToPar) + ')';
    if (kind === 'stbl') return en2.stbl + ' ' + tpL('очк.', 'pts');
    return en2.stbl0 + ' ' + tpL('очк.', 'pts');
}

function tpNomTop(kind, players, gender, limit) {
    var list = players.filter(function(p) { return tpGenderNorm(p.gender) === gender; })
        .sort(tpNomCmp(kind));
    return list.slice(0, limit || 3);
}

// ── Модалка ──
function tpOpenModalShell(inner) {
    var modal = document.getElementById('tp-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'tp-modal';
        modal.className = 'modal hidden';
        modal.innerHTML =
            '<div class="modal-bg" onclick="tpCloseModal()"></div>' +
            '<div class="modal-body" style="max-width:820px;">' +
            '<div class="modal-top-bar">' +
            '<button type="button" class="modal-close-btn" onclick="tpCloseModal()">×</button>' +
            '</div>' +
            '<div id="tp-modal-body" style="flex:1;min-height:0;overflow-y:auto;padding:16px 18px;"></div>' +
            '</div>';
        if (document.body) document.body.appendChild(modal);
    }
    var bodyEl = document.getElementById('tp-modal-body');
    if (bodyEl) bodyEl.innerHTML = inner || '';
    modal.classList.remove('hidden');
    if (bodyEl) bodyEl.scrollTop = 0;
}

function tpCloseModal() {
    var modal = document.getElementById('tp-modal');
    if (modal) modal.classList.add('hidden');
}

function tpRenderModal() {
    var d = tpState.data;
    var tVal = tpState.tVal || {};
    if (!d) return;

    var html = '<div class="tp-wrap">';
    html += '<h2 style="margin:0 0 4px;color:var(--gold);font-size:19px;"><i class="fas fa-file-signature"></i> ' +
        tpL('Протокол завершения турнира', 'Tournament finish protocol') + '</h2>';
    html += '<div style="font-size:13px;color:var(--muted);margin-bottom:10px;">' + escapeHtml(tVal.name || '—') +
        ' · ' + fmtDate(tpDateTs(tVal)) + ' · ' + tpL('раундов: {v1}', '{v1} round(s)').replace('{v1}', d.roundsTotal) + '</div>';

    if (!d.hasResults) {
        html += '<div style="padding:16px;border:1px dashed var(--border);border-radius:12px;color:var(--muted);text-align:center;">' +
            tpL('Результатов пока нет — раунды турнира не завершены.', 'No results yet — tournament rounds are not completed.') +
            '</div></div>';
        var bodyEmpty = document.getElementById('tp-modal-body');
        if (bodyEmpty) bodyEmpty.innerHTML = html;
        return;
    }

    var types = tpNomTypes();

    html += '<div class="tp-hint"><i class="fas fa-circle-info"></i> ' +
        tpL('Отметьте номинации для протокола. В печатном листе для каждой номинации показываются призовые места (1–3).',
            'Tick the nominations for the protocol. The printed sheet shows the awarded places (1–3) for each nomination.') + '</div>';

    // Кнопки массового выбора
    html += '<div class="tp-tools">' +
        '<button type="button" class="btn btn-og btn-sm" onclick="tpCheckAll(true)"><i class="fas fa-check-double"></i> ' + tpL('Выбрать все', 'Select all') + '</button>' +
        '<button type="button" class="btn btn-og btn-sm" onclick="tpCheckAll(false)"><i class="fas fa-eraser"></i> ' + tpL('Сбросить', 'Clear') + '</button>' +
        '<button type="button" class="btn btn-og btn-sm" onclick="tpCheckMain()"><i class="fas fa-star"></i> ' + tpL('Основные награды', 'Main awards') + '</button>' +
        '</div>';

    d.scopes.forEach(function(sc, si) {
        html += '<div class="tp-scope">';
        html += '<div class="tp-scope-head"><b><i class="fas ' + (sc.key === 'abs' ? 'fa-trophy' : 'fa-layer-group') + '"></i> ' +
            escapeHtml(sc.name) + '</b>' +
            (sc.range ? ' <span class="tp-scope-tag">HCP ' + escapeHtml(sc.range) + '</span>' : '') +
            (sc.genderLabel ? ' <span class="tp-scope-tag">' + escapeHtml(sc.genderLabel) + '</span>' : '') +
            (sc.teeLabel ? ' <span class="tp-scope-tag">ТИ: ' + escapeHtml(sc.teeLabel) + '</span>' : '') +
            ' <span class="tp-scope-count">' + sc.players.length + ' ' + tpL('игр.', 'pl.') + '</span></div>';
        html += '<div class="tp-noms">';
        types.forEach(function(ty) {
            var eligible = tpNomTop(ty.kind, sc.players, ty.gender, 999);
            var key = sc.key + '::' + ty.id;
            var empty = eligible.length === 0;
            var checked = tpDefaultChecked(ty, eligible.length);
            html += '<label class="tp-nom' + (empty ? ' dis' : '') + '" title="' + escapeHtml(eligible.map(function(p) { return p.dispName; }).join(', ')) + '">' +
                '<input type="checkbox" class="tp-nom-chk" data-key="' + escapeHtml(key) + '"' +
                (empty ? ' disabled' : (checked ? ' checked' : '')) + '>' +
                '<span>' + escapeHtml(ty.label) + (empty ? '' : ' (' + eligible.length + ')') + '</span>' +
                '</label>';
        });
        html += '</div></div>';
    });

    // Формат вывода
    html += '<div class="tp-modes">';
    html += '<b>' + tpL('Содержание протокола:', 'Protocol content:') + '</b>';
    html += '<label class="tp-radio"><input type="radio" name="tp-mode" value="awards" checked onchange="tpModeChange()"> ' +
        tpL('🏆 Только призёры (призовые места) — один лист A4', '🏆 Winners only (awarded places) — single A4 sheet') + '</label>';
    html += '<label class="tp-radio"><input type="radio" name="tp-mode" value="full" onchange="tpModeChange()"> ' +
        tpL('📄 Полный протокол — призёры + итоговые таблицы всех участников', '📄 Full protocol — winners + standings of all players') + '</label>';
    html += '<label class="tp-radio hidden" id="tp-opt-holes"><input type="checkbox" id="tp-with-holes" checked> ' +
        tpL('Показать счёт по лункам в таблицах', 'Show per-hole scores in the tables') + '</label>';
    html += '</div>';

    html += '<div class="tp-foot">' +
        '<span id="tp-count-note" style="font-size:12px;color:var(--muted);align-self:center;"></span>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">' +
        '<button type="button" class="btn btn-g" onclick="tpExportPdf()"><i class="fas fa-file-pdf"></i> ' +
        tpL('Печать / Сохранить PDF', 'Print / Save as PDF') + '</button>' +
        '<button type="button" class="btn btn-og" onclick="tpCloseModal()">' + tpL('Закрыть', 'Close') + '</button>' +
        '</div></div>';

    html += '</div>';
    var bodyEl = document.getElementById('tp-modal-body');
    if (bodyEl) bodyEl.innerHTML = html;
    tpUpdateCount();
}

function tpDateTs(tVal) {
    if (typeof tVal.date === 'number') return tVal.date;
    var ts = Date.parse(tVal.date);
    return isNaN(ts) ? (tVal.createdAt || Date.now()) : ts;
}

// По умолчанию — «основные награды»: Best Gross и Top-3 Stableford (с HCP)
function tpDefaultChecked(ty, eligibleCount) {
    if (!eligibleCount) return false;
    return ty.id === 'gross_m' || ty.id === 'gross_w' || ty.id === 'stbl_m' || ty.id === 'stbl_w';
}

function tpCheckAll(on) {
    var body = document.getElementById('tp-modal-body');
    if (!body) return;
    body.querySelectorAll('input.tp-nom-chk').forEach(function(chk) {
        if (!chk.disabled) chk.checked = !!on;
    });
    tpUpdateCount();
}
function tpCheckMain() {
    var body = document.getElementById('tp-modal-body');
    if (!body || !tpState.data) return;
    var types = tpNomTypes();
    body.querySelectorAll('input.tp-nom-chk').forEach(function(chk) {
        var key = chk.getAttribute('data-key') || '';
        var typeId = key.split('::')[1] || '';
        var ty = null;
        types.forEach(function(t2) { if (t2.id === typeId) ty = t2; });
        if (ty) chk.checked = tpDefaultChecked(ty, 1);
    });
    tpUpdateCount();
}

function tpModeChange() {
    var full = false;
    var radios = document.querySelectorAll('input[name="tp-mode"]');
    radios.forEach(function(rd) { if (rd.checked && rd.value === 'full') full = true; });
    var opt = document.getElementById('tp-opt-holes');
    if (opt) opt.classList.toggle('hidden', !full || !(tpState.data && tpState.data.singleRound));
    tpUpdateCount();
}

function tpSelectedKeys() {
    var out = [];
    var body = document.getElementById('tp-modal-body');
    if (!body) return out;
    body.querySelectorAll('input.tp-nom-chk:checked').forEach(function(chk) {
        out.push(chk.getAttribute('data-key'));
    });
    return out;
}

function tpUpdateCount() {
    var note = document.getElementById('tp-count-note');
    if (!note) return;
    var n = tpSelectedKeys().length;
    note.textContent = tpL('Выбрано номинаций: ', 'Selected nominations: ') + n;
}

// Отслеживаем изменения чекбоксов (делегирование — перерисовок нет)
document.addEventListener('change', function(ev) {
    if (ev && ev.target && ev.target.classList &&
        (ev.target.classList.contains('tp-nom-chk') || ev.target.name === 'tp-mode')) {
        if (ev.target.name === 'tp-mode') tpModeChange();
        else tpUpdateCount();
    }
});

// ── Сборка выбранных номинаций для документа ──
function tpBuildNominations() {
    var sel = tpSelectedKeys();
    var d = tpState.data || { scopes: [], allPlayers: [] };
    var out = [];
    d.scopes.forEach(function(sc) {
        tpNomTypes().forEach(function(ty) {
            var key = sc.key + '::' + ty.id;
            if (sel.indexOf(key) === -1) return;
            var top = tpNomTop(ty.kind, sc.players, ty.gender, 3);
            if (!top.length) return;
            out.push({ scope: sc, type: ty, winners: top });
        });
    });
    return out;
}

// ── HTML печатного документа ──
function tpBuildDocHtml() {
    var tVal = tpState.tVal || {};
    var d = tpState.data || {};
    var modeFull = false;
    var withHoles = false;
    var radios = document.querySelectorAll('input[name="tp-mode"]');
    radios.forEach(function(rd) { if (rd.checked && rd.value === 'full') modeFull = true; });
    var holesChk = document.getElementById('tp-with-holes');
    if (holesChk) withHoles = !!holesChk.checked;
    var noms = tpBuildNominations();
    var singleRound = !!d.singleRound;
    var en = (typeof currentLang !== 'undefined' && currentLang === 'en');

    var medal = function(i) { return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.'; };
    var E = function(s) { return escapeHtml(String(s == null ? '' : s)); };

    // ── Шапка ──
    var finLine = '';
    if (tVal.status === 'completed') {
        var how = tVal.finishedAutomatically
            ? (en ? 'automatically — all rounds completed' : 'автоматически — все раунды завершены')
            : (en ? 'manually (by the committee)' : 'вручную (комитетом клуба)');
        finLine = '<div class="fin">✔ ' + (en ? 'Tournament finished' : 'Турнир завершён') + ' ' + how +
            (tVal.finishedAt ? ' · ' + E(fmtDate(tVal.finishedAt)) : '') + '</div>';
    }

    var meta = [
        (en ? 'Date' : 'Дата') + ': ' + E(fmtDate(tpDateTs(tVal))),
        (en ? 'Rounds' : 'Раунды') + ': ' + d.roundsCompleted + ' / ' + d.roundsTotal,
        (en ? 'Players' : 'Игроков') + ': ' + d.allPlayers.length,
        (en ? 'Format' : 'Формат') + ': ' + E((tVal.formats || []).join(' · ') || '—'),
        (en ? 'Tees' : 'ТИ') + ': ' + E((tVal.tees || []).map(function(k) { return TEES[k] || k; }).join(' · ') || '—')
    ].join('&nbsp;&nbsp;·&nbsp;&nbsp;');

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
        E('Pestovo_Protocol_' + String(tVal.name || 'Tournament').replace(/\s+/g, '_')) + '</title><style>' +
        'body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;margin:0;padding:18px 22px;font-size:11.5px;}' +
        '.toolbar{position:sticky;top:0;display:flex;gap:10px;align-items:center;background:#f4f1e6;border:1px solid #d8d2ba;border-radius:10px;padding:9px 12px;margin-bottom:14px;}' +
        '.toolbar button{border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;background:#1a472a;color:#fff;}' +
        '.toolbar button.sec{background:#fff;color:#333;border:1px solid #bbb;}' +
        '.toolbar .hint{font-size:11.5px;color:#666;}' +
        '.sheet{max-width:960px;margin:0 auto;}' +
        '.head{text-align:center;border-bottom:3px double #1a472a;padding-bottom:8px;margin-bottom:10px;}' +
        '.club{font-size:14px;font-weight:800;letter-spacing:2px;color:#1a472a;text-transform:uppercase;}' +
        'h1{font-size:16px;margin:6px 0 2px;letter-spacing:1px;}' +
        '.tnm{font-size:13px;font-weight:700;}' +
        '.meta{font-size:10.5px;color:#444;margin-top:3px;}' +
        '.fin{display:inline-block;margin-top:5px;font-size:11px;font-weight:700;color:#0d6b2f;border:1px solid #b9dcc2;border-radius:999px;padding:2px 10px;background:#eefaf1;}' +
        'h2.sec{font-size:12.5px;color:#1a472a;border-bottom:1px solid #999;padding-bottom:3px;margin:14px 0 7px;text-transform:uppercase;letter-spacing:.6px;}' +
        '.noms{display:grid;grid-template-columns:1fr 1fr;gap:7px 14px;}' +
        '.noms.single{grid-template-columns:1fr;}' +
        '.nom{border:1px solid #c9c9c9;border-radius:8px;padding:6px 9px;break-inside:avoid;page-break-inside:avoid;}' +
        '.nom .nt{font-weight:800;font-size:11px;color:#1a472a;margin-bottom:3px;}' +
        '.nom .ns{font-size:9.5px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:.4px;}' +
        '.nom table{width:100%;border-collapse:collapse;margin-top:2px;}' +
        '.nom td{padding:2.5px 4px;border-top:1px solid #eee;font-size:11px;vertical-align:middle;}' +
        '.nom td.pl{width:34px;font-size:12.5px;}' +
        '.nom td.val{width:120px;text-align:right;font-weight:700;white-space:nowrap;}' +
        '.nom td.hcp{width:52px;text-align:right;color:#555;white-space:nowrap;}' +
        'table.std{width:100%;border-collapse:collapse;margin-bottom:8px;}' +
        'table.std th,table.std td{border:1px solid #bbb;padding:3px 5px;font-size:10.5px;text-align:center;}' +
        'table.std th{background:#1a472a;color:#fff;font-size:9.5px;text-transform:uppercase;}' +
        'table.std td.nm{text-align:left;font-weight:700;}' +
        'table.std tr.hdr td{background:#f2f0e4;font-weight:800;text-align:left;font-size:11px;}' +
        '.holes-cell{font-size:9px;color:#333;letter-spacing:.4px;white-space:normal;}' +
        '.sig{display:flex;justify-content:space-between;margin-top:20px;padding-top:10px;border-top:1px dashed #888;font-size:11px;}' +
        '.gen{margin-top:12px;font-size:9px;color:#888;text-align:center;}' +
        '@media print{.toolbar{display:none !important;}body{padding:0;font-size:10.5px;}.sheet{max-width:none;}}' +
        '@page{size:A4 portrait;margin:10mm;}' +
        '</style></head><body>';

    html += '<div class="toolbar">' +
        '<button onclick="window.print()">🖨 ' + (en ? 'Print / Save as PDF' : 'Печать / Сохранить PDF') + '</button>' +
        '<button class="sec" onclick="window.close()">✕ ' + (en ? 'Close' : 'Закрыть') + '</button>' +
        '<span class="hint">' + (en
            ? 'In the print dialog choose “Save as PDF” to export the protocol as a PDF file.'
            : 'В диалоге печати выберите «Сохранить как PDF», чтобы сохранить протокол PDF-файлом.') + '</span>' +
        '</div>';

    html += '<div class="sheet">';
    html += '<div class="head"><div class="club">⛳ ' + (en ? 'Golf & Country Club Pestovo' : 'Гольф-клуб Пестово') + '</div>' +
        '<h1>' + (en ? 'TOURNAMENT FINISH PROTOCOL' : 'ПРОТОКОЛ ЗАВЕРШЕНИЯ ТУРНИРА') + '</h1>' +
        '<div class="tnm">' + E(tVal.name || '—') + '</div>' +
        '<div class="meta">' + meta + '</div>' + finLine + '</div>';

    if (!noms.length && !modeFull) {
        html += '<div style="text-align:center;padding:40px;color:#888;">' +
            (en ? 'No nominations selected' : 'Не выбрано ни одной номинации') + '</div>';
    }

    if (noms.length) {
        html += '<h2 class="sec">🏆 ' + (en ? 'Nominated results' : 'Результаты по номинациям') + '</h2>';
        html += '<div class="noms' + (noms.length === 1 ? ' single' : '') + '">';
        noms.forEach(function(nm) {
            var scopeNote = nm.scope.key === 'abs' ? (en ? 'Overall' : 'Абсолютный зачёт') : nm.scope.name;
            html += '<div class="nom"><div class="ns">' + E(scopeNote) + '</div><div class="nt">' + E(nm.type.label) + '</div><table>';
            nm.winners.forEach(function(p, i) {
                html += '<tr><td class="pl">' + medal(i) + '</td><td><b>' + E(p.dispName) + '</b>' +
                    (p.tee ? ' <span style="color:#888;font-size:9px;">' + E(TEES[p.tee] || p.tee) + '</span>' : '') + '</td>' +
                    '<td class="hcp">' + E((typeof fmtExactHcp === 'function' ? fmtExactHcp(p.effHcp) : '—')) + '</td>' +
                    '<td class="val">' + E(tpNomValueText(nm.type.kind, p)) + '</td></tr>';
            });
            html += '</table></div>';
        });
        html += '</div>';
    }

    if (modeFull) {
        html += '<h2 class="sec">📋 ' + (en ? 'Final standings by group' : 'Итоговые результаты по группам') + '</h2>';
        d.scopes.forEach(function(sc) {
            var sorted = sc.players.slice().sort(function(a, b) {
                var av = a.netToPar === null ? 999 : a.netToPar, bv = b.netToPar === null ? 999 : b.netToPar;
                if (av !== bv) return av - bv;
                var at = a.toPar === null ? 999 : a.toPar, bt = b.toPar === null ? 999 : b.toPar;
                if (at !== bt) return at - bt;
                return (a.dispName || '').localeCompare(b.dispName || '');
            });
            html += '<table class="std"><tr class="hdr"><td colspan="9">' +
                E(sc.name) + (sc.range ? ' · HCP ' + E(sc.range) : '') + ' — ' + sc.players.length + ' ' + (en ? 'players' : 'игр.') + '</td></tr>';
            html += '<tr><th>#</th><th style="text-align:left;">' + (en ? 'Player' : 'Игрок') + '</th><th>HCP</th><th>' + (en ? 'Tee' : 'ТИ') + '</th>' +
                '<th>Gross</th><th>Net</th><th>Stbl</th><th>Stbl 0</th>' +
                (withHoles && singleRound ? '<th>' + (en ? 'By holes' : 'По лункам') + '</th>' : '') + '</tr>';
            var pos = 0;
            sorted.forEach(function(p, i) {
                if (i === 0 || p.netToPar !== sorted[i - 1].netToPar || p.toPar !== sorted[i - 1].toPar) pos = i + 1;
                html += '<tr><td>' + pos + '</td><td class="nm">' + E(p.dispName) + '</td>' +
                    '<td>' + E((typeof fmtExactHcp === 'function' ? fmtExactHcp(p.effHcp) : '—')) + '</td>' +
                    '<td>' + E(TEES[p.tee] || '—') + '</td>' +
                    '<td>' + p.gross + ' (' + fmtScore(p.toPar) + ')</td>' +
                    '<td>' + p.net + ' (' + fmtScore(p.netToPar) + ')</td>' +
                    '<td>' + p.stbl + '</td><td>' + p.stbl0 + '</td>';
                if (withHoles && singleRound && p.scores) {
                    var sTxt = [];
                    for (var h = 1; h <= 18; h++) sTxt.push(p.scores[h] != null ? p.scores[h] : '–');
                    html += '<td class="holes-cell">' + sTxt.join(' ') + '</td>';
                } else if (withHoles && singleRound) {
                    html += '<td></td>';
                }
                html += '</tr>';
            });
            html += '</table>';
        });
    }

    html += '<div class="sig">' +
        '<div>' + (en ? 'Chief Referee: ______________________' : 'Главный судья: ______________________') + '</div>' +
        '<div>' + (en ? 'Handicap Committee: ______________________' : 'Гандикапный комитет: ______________________') + '</div>' +
        '</div>';
    var verEl = document.querySelector('.version-number');
    var ver = verEl ? String(verEl.textContent || '').trim() : '';
    html += '<div class="gen">' + (en ? 'Generated' : 'Сформирован') + ' ' + E(fmtDate(Date.now())) + ' ' + E(fmtTime(Date.now())) +
        (ver ? ' · Pestovo Live Scoring v' + E(ver) : '') + '</div>';
    html += '</div></body></html>';
    return html;
}

// ── Экспорт: окно печати (браузерный «Сохранить как PDF») ──
function tpExportPdf() {
    if (!tpState.data) return;
    var sel = tpSelectedKeys();
    var modeFull = false;
    var radios = document.querySelectorAll('input[name="tp-mode"]');
    radios.forEach(function(rd) { if (rd.checked && rd.value === 'full') modeFull = true; });
    if (!sel.length && !modeFull) {
        toast(tpL('⚠️ Выберите хотя бы одну номинацию', '⚠️ Select at least one nomination'), 'warn');
        return;
    }
    var html = tpBuildDocHtml();
    var printWin = window.open('', '_blank');
    if (!printWin) {
        toast(tpL('⚠️ Разрешите всплывающие окна для формирования PDF', '⚠️ Allow pop-ups to generate the PDF'), 'error');
        return;
    }
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    // Автопоказ диалога печати: «сразу распечатать» или сохранить PDF
    setTimeout(function() { try { printWin.print(); } catch (e) {} }, 350);
    toast(tpL('📄 Протокол сформирован!', '📄 Protocol generated!'), 'success');
}
