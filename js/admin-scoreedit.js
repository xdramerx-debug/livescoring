// js/admin-scoreedit.js — «Редактор счёта всех раундов» (вкладка «Счёт ⛳»)
// админки; вынесено из js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули).
// Поиск по ФИО/дате/статусу, раскрытие карточки раунда, правка счёта любой
// лунки любого игрока (черновик + сохранение), удаление лунки. Внешних
// зависимостей от admin.js нет: только runtime-глобалы (db, toast,
// currentLang, escapeHtml, holePar, fmtTime и т.п.). Грузится в admin.html
// рядом с admin.js; switchTab() вызывает seRender() при открытии вкладки.

// ==========================================
// РЕДАКТОР СЧЁТА ВСЕХ РАУНДОВ (#16, вкладка «Счёт ⛳»)
// Активные, запланированные и завершённые раунды: поиск по ФИО/дате/статусу,
// раскрытие карточки, правка счёта любой лунки любого игрока, сохранение.
// ==========================================
var seCache = null;          // снимок rounds
var seOpenId = null;         // раскрытый раунд
var seDraft = {};            // черновик правок: { roundId: { pid: { hole: value } } }

function seGet(id) { try { return document.getElementById(id); } catch (e) { return null; } }

function seEnsureSubscription() {
    if (typeof db === 'undefined' || !db || typeof bindRealtimeValue !== 'function') return;
    bindRealtimeValue('adm-scores-editor', db.ref('rounds'), function(sn) {
        seCache = sn.val() || {};
        seRender();
    });
}

// Хелпер: «Фамилия Имя» игрока раунда (или name как есть).
function sePlayerFio(p) {
    if (!p) return '';
    if (p.lastName || p.firstName) {
        return [p.lastName, p.firstName, p.middleName].filter(function(w) { return String(w || '').trim(); }).join(' ');
    }
    return String(p.name || '');
}

function seHolePar(h) {
    try { return holePar(h); } catch (e) { return 0; }
}

function seStatusBadge(status) {
    var map = {
        active: '<span class="se-mini-badge st-active">● АКТИВНЫЙ</span>',
        scheduled: '<span class="se-mini-badge st-scheduled">⏳ ЗАПЛАНИРОВАН</span>',
        completed: '<span class="se-mini-badge st-completed">✓ ЗАВЕРШЁН</span>'
    };
    return map[status] || ('<span class="se-mini-badge st-completed">' + escapeHtml(String(status || '—')) + '</span>');
}

function seFilteredEntries() {
    var data = seCache || {};
    var fioQ = seNorm((seGet('se-q-fio') || {}).value || '');
    var dateQ = (seGet('se-q-date') || {}).value || '';
    var statusQ = (seGet('se-q-status') || {}).value || '';
    var entries = Object.keys(data).map(function(rid) { return { id: rid, r: data[rid] || {} }; });
    // Свежие сверху
    entries.sort(function(a, b) { return (b.r.startTime || b.r.createdAt || 0) - (a.r.startTime || a.r.createdAt || 0); });
    if (!fioQ && !dateQ && !statusQ) return entries;
    return entries.filter(function(e) {
        var r = e.r;
        if (statusQ && String(r.status || '') !== statusQ) return false;
        if (dateQ) {
            var day = new Date(r.startTime || r.createdAt || Date.now());
            var iso = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
            if (iso !== dateQ) return false;
        }
        if (fioQ) {
            var players = r.players || {};
            var found = Object.keys(players).some(function(pid) {
                return seNorm(sePlayerFio(players[pid])).indexOf(fioQ) !== -1;
            });
            if (!found) return false;
        }
        return true;
    });
}

function seNorm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function seRoundTitle(r) {
    var parts = [];
    if (r.tournamentName) parts.push('🏆 ' + r.tournamentName);
    if (r.protocolName) parts.push(r.protocolName);
    if (r.roundName) parts.push(r.roundName);
    if (!parts.length) parts.push(r.mode === 'solo' ? 'Одиночный раунд' : 'Групповой раунд');
    return parts.join(' · ');
}

function seToggleRound(rid) {
    seOpenId = (seOpenId === rid) ? null : rid;
    seRender();
}

// Правка черновика: ввод счёта лунки
function seDraftSet(rid, pid, h, val) {
    if (!seDraft[rid]) seDraft[rid] = {};
    if (!seDraft[rid][pid]) seDraft[rid][pid] = {};
    var num = String(val).trim();
    if (num === '') delete seDraft[rid][pid][h];
    // Лимит согласован с сервером (scoreWrite принимает 1..20); 0 = удалить счёт.
    else seDraft[rid][pid][h] = Math.max(0, Math.min(20, parseInt(num, 10) || 0));
    // Подсветка заполненных клеток — без полной перерисовки (не терять фокус)
    var inp = seGet('se-inp-' + rid + '-' + pid + '-' + h);
    if (inp) inp.classList.toggle('has-score', num !== '');
}

// Сохранение всех правок раскрытого раунда
function seSaveRound(rid) {
    if (typeof db === 'undefined' || !db) return;
    var draft = seDraft[rid];
    if (!draft) { toast(currentLang === 'en' ? 'No changes' : 'Нет изменений', 'info'); return; }
    var operations = [];
    var changed = 0;
    Object.keys(draft).forEach(function(pid) {
        Object.keys(draft[pid]).forEach(function(h) {
            var v = draft[pid][h];
            operations.push({kind:'score',playerId:pid,hole:Number(h),score:v || null});
            changed++;
            // Если у игрока есть маркер — синхронизируем его markerScores (карточка «как введено маркером»)
        });
    });
    if (!changed) { toast(currentLang === 'en' ? 'No changes' : 'Нет изменений', 'info'); return; }
    var batches = [];
    for (var i=0;i<operations.length;i+=72) batches.push(operations.slice(i,i+72));
    var queued = false;
    batches.reduce(function(p, batch) { return p.then(function() { return pestovoScoreWrite(rid, batch).then(function(res) { if (res && res.offline) queued = true; }); }); }, Promise.resolve()).then(function() {
        if (!queued) toast((currentLang === 'en' ? '✅ Saved: ' : '✅ Сохранено лунок: ') + changed, 'success');
        else toast(currentLang === 'en' ? 'Waiting for server confirmation' : 'В очереди, ждём подтверждения сервера', 'warn');
        delete seDraft[rid];
        seRender();
    }).catch(function(err) {
        toast('❌ ' + (err && err.message ? err.message : err), 'error');
    });
}

function seDiscardRound(rid) {
    delete seDraft[rid];
    seRender();
}
function seRender() {
    var root = seGet('se-list');
    if (!root) return;
    if (seCache === null) {
        seEnsureSubscription();
        root.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">' +
            (currentLang === 'en' ? 'Loading rounds…' : 'Загрузка раундов…') + '</p>';
        return;
    }
    var entries = seFilteredEntries();
    if (!entries.length) {
        root.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">' +
            (currentLang === 'en' ? 'No rounds match the filters' : 'Раундов по фильтрам не найдено') + '</p>';
        return;
    }
    var html = '<div class="se-round-grid">';
    entries.forEach(function(e) {
        var rid = e.id, r = e.r;
        var players = r.players || {};
        var pIds = Object.keys(players);
        var isOpen = seOpenId === rid;
        var day = new Date(r.startTime || r.createdAt || Date.now());
        var dateTxt = (typeof fmtDate === 'function') ? fmtDate(day.getTime()) : day.toLocaleDateString();
        var timeTxt = (typeof fmtTime === 'function') ? fmtTime(day.getTime()) : '';
        var draft = seDraft[rid] || {};
        var draftCnt = Object.keys(draft).reduce(function(n, pid) { return n + Object.keys(draft[pid]).length; }, 0);

        html += '<div class="se-round-card se-status-' + escapeHtml(String(r.status || 'active')) + '">';
        html += '<div class="se-round-head">';
        html += '<span class="se-round-name">' + escapeHtml(seRoundTitle(r)) + '</span>';
        html += seStatusBadge(String(r.status || ''));
        html += '<button class="btn btn-og btn-sm" onclick="seToggleRound(\'' + rid + '\')"><i class="fas fa-chevron-' + (isOpen ? 'up' : 'down') + '"></i> ' +
            (isOpen ? (currentLang === 'en' ? 'Close' : 'Свернуть') : (currentLang === 'en' ? 'Open' : 'Открыть')) + '</button>';
        html += '</div>';
        html += '<div class="se-round-meta">' + dateTxt + ' ' + timeTxt +
            ' · ' + (currentLang === 'en' ? 'players' : 'игроков') + ': ' + pIds.length +
            (r.startHole ? ' · ' + (currentLang === 'en' ? 'tee' : 'старт') + ': ' + r.startHole : '') +
            (r.format ? ' · ' + escapeHtml(String(r.format)) : '') +
            (draftCnt ? ' · <b style="color:var(--gold);">' + (currentLang === 'en' ? 'unsaved: ' : 'не сохранено: ') + draftCnt + '</b>' : '') +
            '</div>';

        if (isOpen) {
            var order = (typeof getRoundOrder === 'function') ? getRoundOrder(r) : (function() { var a = []; for (var h = 1; h <= 18; h++) a.push(h); return a; })();
            pIds.forEach(function(pid) {
                var p = players[pid] || {};
                var scores = (p.scores || {});
                var pd = draft[pid] || {};
                html += '<div class="se-player-row">';
                html += '<span class="se-p-name" title="' + escapeHtml(pid) + '">' + escapeHtml(sePlayerFio(p) || pid) +
                    (p.fieldHcp != null ? ' <span style="color:var(--muted);font-size:10.5px;">FH ' + escapeHtml(String(p.fieldHcp)) + '</span>' : '') + '</span>';
                html += '<span class="se-p-holes">';
                order.forEach(function(h) {
                    var cur = (pd[h] !== undefined) ? pd[h] : (parseInt(scores[h]) || 0);
                    var isCur = pd[h] !== undefined;
                    html += '<input type="number" min="0" max="15" class="form-input se-hole-inp' + (cur > 0 ? ' has-score' : '') + (isCur ? ' is-cur' : '') + '" ' +
                        'id="se-inp-' + rid + '-' + pid + '-' + h + '" value="' + (cur > 0 ? cur : '') + '" placeholder="' + h + '"' +
                        ' title="' + h + ' (пар ' + seHolePar(h) + ')"' +
                        ' oninput="seDraftSet(\'' + rid + '\',\'' + pid + '\',' + h + ',this.value)">';
                });
                html += '</span>';
                html += '</div>';
            });
            html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">';
            html += '<button class="btn btn-g btn-sm" onclick="seSaveRound(\'' + rid + '\')"><i class="fas fa-save"></i> ' + (currentLang === 'en' ? 'Save scores' : 'Сохранить счёт') + '</button>';
            if (draftCnt) {
                html += '<button class="btn btn-ol btn-sm" onclick="seDiscardRound(\'' + rid + '\')"><i class="fas fa-rotate-left"></i> ' + (currentLang === 'en' ? 'Discard' : 'Отменить правки') + '</button>';
            }
            html += '</div>';
        }
        html += '</div>';
    });
    html += '</div>';
    root.innerHTML = html;
}
