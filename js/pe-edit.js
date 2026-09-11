// ============================================================
// pe-edit.js — Быстрый редактор турнирного протокола в админке
// Группы, раунды, стартовые лунки, время, ТИ, маркеры, HCP.
// Поиск по участникам, сохранение в Firebase и печать протокола.
// ============================================================
(function() {
    'use strict';

    var TEE_KEYS = ['wh', 'yl', 'bl', 'rd', 'bk'];
    var state = {
        tnId: null,
        tn: null,
        pid: null,
        proto: null,
        groups: [],   // { idx, rid, startHole, startTime, tee, format, members:[entry...], markerTargets:{marker:target}, deleted:false, isNew:false }
        roster: [],   // players not in any group
        rounds: {}    // rid -> round snapshot (исходные, для сохранения данных)
    };

    function L(ru, en) { return currentLang === 'en' ? en : ru; }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function teeOpts(sel) {
        return TEE_KEYS.map(function(k) {
            var names = { wh: ['белые', 'white'], yl: ['жёлтые', 'yellow'], bl: ['синие', 'blue'], rd: ['красные', 'red'], bk: ['чёрные', 'black'] };
            return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + (names[k][currentLang === 'en' ? 1 : 0]) + '</option>';
        }).join('');
    }
    function fmtOpts(sel) {
        return [['', '—'], ['gross', L('Гросс', 'Gross')], ['stbl', L('Стбл.', 'Stbl.')]]
            .map(function(o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    }
    function pname(p) {
        if (!p) return '';
        if (p.name) return p.name;
        return [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' ');
    }
    function pHcp(p) {
        if (p.exactHcp !== undefined && p.exactHcp !== null && p.exactHcp !== '') return p.exactHcp;
        return p.hcp == null ? '' : p.hcp;
    }

    // ── Загрузка списка турниров в селектор ──
    function loadTournaments() {
        var sel = document.getElementById('pe-tn-select');
        if (!sel || typeof db === 'undefined') return;
        sel.innerHTML = '<option value="">' + esc(L('Загрузка…', 'Loading…')) + '</option>';
        db.ref('tournaments').once('value').then(function(sn) {
            var all = sn.val() || {};
            var list = Object.keys(all).map(function(id) { return Object.assign({ id: id }, all[id]); });
            list.sort(function(a, b) { return (b.dateTs || b.createdAt || 0) - (a.dateTs || a.createdAt || 0); });
            var html = '<option value="">' + esc(L('— выберите турнир —', '— select tournament —')) + '</option>';
            list.forEach(function(t) {
                var st = t.status || '';
                var mark = st === 'active' ? '🟢 ' : (st === 'completed' ? '✅ ' : (st === 'cancelled' ? '⛔ ' : ''));
                html += '<option value="' + t.id + '">' + mark + esc(t.name || t.id) + '</option>';
            });
            sel.innerHTML = html;
            // авто-выбор активного турнира
            var act = list.find(function(t) { return t.status === 'active'; });
            if (act) { sel.value = act.id; loadTournament(act.id); }
        });
    }

    // ── Загрузка протокола и раундов турнира ──
    function loadTournament(tnId) {
        var box = document.getElementById('pe-editor');
        if (!tnId) { if (box) box.innerHTML = ''; return; }
        if (box) box.innerHTML = '<div class="adm-empty">' + esc(L('Загрузка протокола…', 'Loading protocol…')) + '</div>';
        Promise.all([
            db.ref('tournaments/' + tnId).once('value'),
            db.ref('protocols').once('value'),
            db.ref('rounds').once('value')
        ]).then(function(res) {
            var tnSnap = res[0], protoSnap = res[1], roundsSnap = res[2];
            var tn = tnSnap.val();
            if (!tn) { box.innerHTML = '<div class="adm-empty">⚠️ ' + esc(L('Турнир не найден', 'Tournament not found')) + '</div>'; return; }
            var protos = protoSnap.val() || {};
            var pid = null, pDoc = null, pTs = 0;
            Object.keys(protos).forEach(function(k) {
                var d = protos[k];
                if (d && d.tournamentId === tnId) {
                    var ts = d.createdAt || d.generatedAt || 0;
                    if (!pid || ts > pTs) { pid = k; pDoc = d; pTs = ts; }
                }
            });
            if (!pid) {
                box.innerHTML = '<div class="adm-empty">⚠️ ' + esc(L('У турнира ещё нет протокола/раскладки. Откройте вкладку «Турниры» → редактор стартового листа и создайте группы.', 'This tournament has no protocol/groups yet. Open the Tournaments tab → start-sheet editor and create groups first.')) + '</div>';
                return;
            }
            buildModel(tnId, tn, pid, pDoc, roundsSnap.val() || {});
            render();
        }).catch(function(err) {
            if (box) box.innerHTML = '<div class="adm-empty">⚠️ ' + esc(err && err.message ? err.message : err) + '</div>';
        });
    }

    function buildModel(tnId, tn, pid, proto, roundsAll) {
        state.tnId = tnId; state.tn = tn; state.pid = pid; state.proto = proto;
        state.rounds = {}; state.groups = []; state.roster = [];

        var idsOfProto = {};
        (proto.groupsFlat || []).forEach(function(g) { idsOfProto[g.id] = g.rid; });

        Object.keys(roundsAll).forEach(function(rid) {
            var r = roundsAll[rid];
            if (!r) return;
            if (r.protocolId === pid || (r.tournamentId === tnId && (proto.groupsFlat || []).some(function(g) { return g.rid === rid; }))) {
                state.rounds[rid] = r;
            }
        });

        var assigned = {};
        (proto.groups || []).forEach(function(g, gi) {
            var rid = (g.members || []).map(function(m) { return idsOfProto[m.id]; }).filter(Boolean)[0];
            if (!rid) {
                // сопоставление по groupIdx
                Object.keys(state.rounds).forEach(function(k) {
                    if (state.rounds[k].groupIdx === gi && !rid) rid = k;
                });
            }
            var r = rid ? state.rounds[rid] : null;
            var members = [];
            var srcMembers = (r && r.players) ? r.players : {};
            var pOrder = (r && r.pOrder) || (g.members || []).map(function(m) { return m.id; });
            pOrder.forEach(function(pid2) {
                var p = srcMembers[pid2] || (g.members || []).find(function(m) { return m.id === pid2; });
                if (p) { members.push(Object.assign({ id: pid2 }, p)); assigned[pid2] = true; }
            });
            var markerTargets = {};
            if (r && r.markerAssignments) {
                Object.keys(r.markerAssignments).forEach(function(mk) {
                    markerTargets[mk] = r.markerAssignments[mk].targetId;
                });
            } else if (g.markerTargets) {
                markerTargets = Object.assign({}, g.markerTargets);
            }
            state.groups.push({
                idx: gi,
                rid: rid || null,
                isNew: false,
                startHole: r ? (r.startHole || 1) : (g.startHole || 1),
                startTime: r ? (r.startTime || '') : (g.startTime || ''),
                tee: r ? (r.tee || 'wh') : (g.tee || tn.tee || 'wh'),
                format: r ? (r.format || '') : (g.format || ''),
                members: members,
                markerTargets: markerTargets,
                _orig: g
            });
        });

        // участники протокола без группы
        var pp = proto.players || {};
        Object.keys(pp).forEach(function(pid2) {
            if (!assigned[pid2]) state.roster.push(Object.assign({ id: pid2 }, pp[pid2]));
        });
    }

    // ── Рендер редактора ──
    function rowHtml(p, gid /* '' = roster */) {
        var pid = p.id;
        var groupSel = '<option value="">' + esc(L('без группы', 'no group')) + '</option>';
        state.groups.forEach(function(g, i) {
            groupSel += '<option value="' + i + '"' + (String(i) === String(gid) ? ' selected' : '') + '>' + esc(L('Группа', 'Group')) + ' ' + (i + 1) + '</option>';
        });

        var markerSel = '<option value="">—</option>';
        var curTarget = gid === '' ? '' : (state.groups[gid].markerTargets[pid] || '');
        if (gid !== '') {
            state.groups[gid].members.forEach(function(m) {
                if (m.id === pid) return;
                markerSel += '<option value="' + esc(m.id) + '"' + (m.id === curTarget ? ' selected' : '') + '>' + esc(pname(m)) + '</option>';
            });
        }

        return '<tr class="pe-row" data-pe-name="' + esc((pname(p) || '').toLowerCase()) + '">' +
            '<td class="pe-name">' + esc(pname(p) || pid) + '</td>' +
            '<td><input type="number" step="0.1" min="-20" max="54" class="pe-hcp" data-gid="' + gid + '" data-pid="' + esc(pid) + '" value="' + esc(pHcp(p)) + '" style="width:64px"></td>' +
            '<td><select class="pe-gender" data-gid="' + gid + '" data-pid="' + esc(pid) + '" style="width:96px">' +
                '<option value="men"' + ((p.gender || 'men') === 'men' ? ' selected' : '') + '>♂ ' + esc(L('муж.', 'men')) + '</option>' +
                '<option value="women"' + (p.gender === 'women' ? ' selected' : '') + '>♀ ' + esc(L('жен.', 'women')) + '</option>' +
            '</select></td>' +
            '<td><select class="pe-tee" data-gid="' + gid + '" data-pid="' + esc(pid) + '" style="width:92px">' + teeOpts(p.tee || 'wh') + '</select></td>' +
            (gid === '' ? '<td class="pe-muted">—</td>' :
                '<td><select class="pe-marker" data-gid="' + gid + '" data-pid="' + esc(pid) + '" style="width:150px">' + markerSel + '</select></td>') +
            '<td><select class="pe-move" data-gid="' + gid + '" data-pid="' + esc(pid) + '" style="width:120px">' + groupSel + '</select></td>' +
            '</tr>';
    }

    function render() {
        var box = document.getElementById('pe-editor');
        if (!box) return;
        var tn = state.tn;
        var html = '';
        html += '<div class="pe-toolbar card" style="padding:10px;margin-bottom:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
            '<input type="search" id="pe-q" placeholder="' + esc(L('🔍 Поиск по ФИО…', '🔍 Search by name…')) + '" style="flex:1;min-width:200px;padding:8px 10px">' +
            '<button class="btn btn-g" onclick="peSave()"><i class="fas fa-save"></i> ' + esc(L('Сохранить', 'Save')) + '</button>' +
            '<button class="btn btn-o" onclick="peAddGroup()"><i class="fas fa-plus"></i> ' + esc(L('Группа', 'Group')) + '</button>' +
            '<button class="btn btn-o" onclick="window.open(\'qr-start.html?p=' + encodeURIComponent(state.pid) + '\',\'_blank\')"><i class="fas fa-print"></i> ' + esc(L('Печать стартовых карточек', 'Print start cards')) + '</button>' +
            (typeof tnOpenProtocolModal === 'function' ? '<button class="btn btn-o" onclick="tnOpenProtocolModal(\'' + esc(state.tnId) + '\')"><i class="fas fa-file-alt"></i> ' + esc(L('Протокол результатов', 'Results protocol')) + '</button>' : '') +
            '</div>';

        state.groups.forEach(function(g, i) {
            html += '<div class="card pe-group" data-gid="' + i + '" style="margin-bottom:10px;padding:10px">' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px">' +
                '<strong style="min-width:90px">' + esc(L('Группа', 'Group')) + ' ' + (i + 1) + '</strong>' +
                '<label style="font-size:12px">' + esc(L('лунка', 'hole')) + ' <input type="number" min="1" max="18" class="pe-hole" data-gid="' + i + '" value="' + esc(g.startHole) + '" style="width:56px;padding:4px"></label>' +
                '<label style="font-size:12px">' + esc(L('время', 'time')) + ' <input type="time" class="pe-time" data-gid="' + i + '" value="' + esc(g.startTime || '') + '" style="padding:4px"></label>' +
                '<label style="font-size:12px">' + esc(L('ТИ группы', 'group tee')) + ' <select class="pe-gtee" data-gid="' + i + '">' + teeOpts(g.tee) + '</select></label>' +
                '<label style="font-size:12px">' + esc(L('формат', 'format')) + ' <select class="pe-gfmt" data-gid="' + i + '">' + fmtOpts(g.format) + '</select></label>' +
                (!g.rid && g.members.length === 0 ? '<button class="btn btn-r btn-sm" onclick="peDelGroup(' + i + ')">✕</button>' : '') +
                (g.rid ? '<span class="pe-muted" style="font-size:11px">QR/раунд: ' + esc(g.rid.slice(0, 6)) + '…</span>' : '<span class="pe-muted" style="font-size:11px">🆕 ' + esc(L('новая группа', 'new group')) + '</span>') +
                '</div>' +
                '<table class="pe-table" style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>' +
                '<th align="left">' + esc(L('Участник', 'Player')) + '</th>' +
                '<th>' + esc(L('HCP', 'HCP')) + '</th>' +
                '<th>' + esc(L('Пол', 'Sex')) + '</th>' +
                '<th>' + esc(L('ТИ', 'Tee')) + '</th>' +
                '<th>' + esc(L('Кого отмечает (маркер)', 'Marks (marker)')) + '</th>' +
                '<th>' + esc(L('Группа', 'Group')) + '</th>' +
                '</tr></thead><tbody>' +
                g.members.map(function(p) { return rowHtml(p, i); }).join('') +
                (g.members.length === 0 ? '<tr><td colspan="6" class="pe-muted" style="padding:8px">' + esc(L('Пустая группа — переместите участника из другой группы или из резерва', 'Empty group — move a player here from another group or roster')) + '</td></tr>' : '') +
                '</tbody></table></div>';
        });

        html += '<div class="card" style="margin-bottom:10px;padding:10px">' +
            '<strong>' + esc(L('Участники без группы (резерв)', 'Players without group (roster)')) + ' (' + state.roster.length + ')</strong>' +
            (state.roster.length ? '<table class="pe-table" style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px"><thead><tr>' +
                '<th align="left">' + esc(L('Участник', 'Player')) + '</th><th>HCP</th><th>' + esc(L('Пол', 'Sex')) + '</th><th>' + esc(L('ТИ', 'Tee')) + '</th><th></th><th>' + esc(L('Группа', 'Group')) + '</th></tr></thead><tbody>' +
                state.roster.map(function(p) { return rowHtml(p, ''); }).join('') +
                '</tbody></table>' : '<div class="pe-muted" style="padding:8px;font-size:13px">' + esc(L('пусто', 'empty')) + '</div>') +
            '</div>';

        box.innerHTML = html;
        bindSearch();
    }

    function bindSearch() {
        var q = document.getElementById('pe-q');
        if (!q) return;
        q.addEventListener('input', function() {
            var val = String(q.value || '').trim().toLowerCase();
            document.querySelectorAll('.pe-group').forEach(function(card) {
                var any = false;
                card.querySelectorAll('.pe-row').forEach(function(row) {
                    var ok = !val || row.getAttribute('data-pe-name').indexOf(val) >= 0;
                    row.style.display = ok ? '' : 'none';
                    if (ok) any = true;
                });
                card.style.display = (val && !any) ? 'none' : '';
            });
            // карточка резерва
            var cards = document.querySelectorAll('#pe-editor > .card');
            var rosterCard = cards[cards.length - 1];
            if (rosterCard) {
                var anyR = false;
                rosterCard.querySelectorAll('.pe-row').forEach(function(row) {
                    var ok = !val || row.getAttribute('data-pe-name').indexOf(val) >= 0;
                    row.style.display = ok ? '' : 'none';
                    if (ok) anyR = true;
                });
                rosterCard.style.display = (val && !anyR) ? 'none' : '';
            }
        });
    }

    function peAddGroup() {
        if (!collectForm()) return;
        var last = state.groups[state.groups.length - 1];
        state.groups.push({
            idx: state.groups.length, rid: null, isNew: true,
            startHole: last ? last.startHole : 1,
            startTime: last ? last.startTime : '',
            tee: state.tn.tee || 'wh', format: '',
            members: [], markerTargets: {}
        });
        render();
        toast(L('Добавлена пустая группа — переместите в неё участников и сохраните', 'Empty group added — move players in and save'), 'info');
    }

    function peDelGroup(i) {
        if (!collectForm()) return;
        var g = state.groups[i];
        if (g.rid || g.members.length) { toast(L('Удалить можно только пустую новую группу', 'Only an empty new group can be deleted'), 'warn'); return; }
        state.groups.splice(i, 1);
        render();
    }

    // Снять значения всех полей формы в состояние (до изменений модели)
    function collectForm() {
        try {
            document.querySelectorAll('.pe-hole').forEach(function(el) { state.groups[+el.dataset.gid].startHole = parseInt(el.value, 10) || 1; });
            document.querySelectorAll('.pe-time').forEach(function(el) { state.groups[+el.dataset.gid].startTime = el.value || ''; });
            document.querySelectorAll('.pe-gtee').forEach(function(el) { state.groups[+el.dataset.gid].tee = el.value; });
            document.querySelectorAll('.pe-gfmt').forEach(function(el) { state.groups[+el.dataset.gid].format = el.value; });

            function applyRow(el, field) {
                var gi = el.dataset.gid, pid = el.dataset.pid;
                var list = gi === '' ? state.roster : state.groups[+gi].members;
                var p = list.find(function(x) { return x.id === pid; });
                if (!p) return;
                if (field === 'hcp') {
                    var v = el.value === '' ? null : parseFloat(el.value);
                    p.hcp = v; p.exactHcp = v; p.exactHcpRaw = v == null ? 0 : v;
                } else {
                    p[field] = el.value;
                }
            }
            document.querySelectorAll('.pe-hcp').forEach(function(el) { applyRow(el, 'hcp'); });
            document.querySelectorAll('.pe-gender').forEach(function(el) { applyRow(el, 'gender'); });
            document.querySelectorAll('.pe-tee').forEach(function(el) { applyRow(el, 'tee'); });
            document.querySelectorAll('.pe-marker').forEach(function(el) {
                var gi = +el.dataset.gid, pid = el.dataset.pid;
                state.groups[gi].markerTargets[pid] = el.value || null;
            });
            return true;
        } catch (e) { console.error(e); return false; }
    }

    function teeMode(members, fallback) {
        if (typeof psGroupTeeFromMembers === 'function') return psGroupTeeFromMembers(members, fallback);
        var counts = {};
        members.forEach(function(p) { counts[p.tee || fallback] = (counts[p.tee || fallback] || 0) + 1; });
        var best = fallback, n = -1;
        Object.keys(counts).forEach(function(k) { if (counts[k] > n) { n = counts[k]; best = k; } });
        return best;
    }

    function peSave() {
        if (!collectForm()) return;

        // 1) переносы между группами/резервом
        var moves = [];
        document.querySelectorAll('.pe-move').forEach(function(el) {
            var fromG = el.dataset.gid, pid = el.dataset.pid, toG = el.value;
            if (String(fromG) === String(toG)) return;
            moves.push({ from: fromG, to: toG === '' ? null : +toG, pid: pid });
        });
        var movedWithScores = false;
        moves.forEach(function(m) {
            var srcList = m.from === '' ? state.roster : state.groups[+m.from].members;
            var i = srcList.findIndex(function(x) { return x.id === m.pid; });
            if (i < 0) return;
            var p = srcList.splice(i, 1)[0];
            if (m.from !== '' && state.groups[+m.from].markerTargets[m.pid]) delete state.groups[+m.from].markerTargets[m.pid];
            if (m.to === null) {
                state.roster.push(p);
            } else {
                var dst = state.groups[m.to];
                // перенос с результатами?
                var srcRid = m.from === '' ? null : state.groups[+m.from].rid;
                if (srcRid && state.rounds[srcRid] && state.rounds[srcRid].players && state.rounds[srcRid].players[m.pid]) {
                    var ep = state.rounds[srcRid].players[m.pid];
                    if (ep.holes && Object.keys(ep.holes).length) movedWithScores = true;
                }
                // очистить маркерные связи на новом месте — зададутся заново
                dst.markerTargets[m.pid] = null;
                dst.members.push(p);
            }
        });
        if (movedWithScores && !confirm(L('Один из переносимых игроков уже введённые счёта. Перенести вместе со счетами?', 'One of the moved players already has scores entered. Move them together with scores?'))) {
            return;
        }

        var sets = {};
        var t = state.tn;
        var newProtoGroups = [];
        var groupsFlat = [];
        var regPlayers = Object.assign({}, state.tn.registeredPlayers || {});

        var droppedRids = {};
        state.groups.forEach(function(g0) {
            // Пустые группы в протокол не пишем; бесскоростный раунд удаляем.
            if (!g0.members.length) {
                if (g0.rid && state.rounds[g0.rid]) {
                    var r0 = state.rounds[g0.rid];
                    var hasSc0 = r0.players && Object.keys(r0.players).some(function(p2) {
                        return r0.players[p2].holes && Object.keys(r0.players[p2].holes || {}).length;
                    });
                    if (!hasSc0) droppedRids[g0.rid] = true;
                }
                return;
            }
            var newIdx = newProtoGroups.length;
            var g = g0;
            // Полевой HCP: эффективный (с обрезкой турнира) → таблица по ТИ/полу.
            g.members.forEach(function(p) {
                p.gender = p.gender || 'men';
                p.tee = p.tee || g.tee || 'wh';
                var rawHcp = (p.exactHcp !== undefined && p.exactHcp !== null && p.exactHcp !== '') ? p.exactHcp : p.hcp;
                var effHcp = rawHcp;
                if (typeof tnEffectiveHcp === 'function') {
                    try { effHcp = tnEffectiveHcp(t, state.tnId, rawHcp, p.gender); } catch (e) {}
                }
                p.exactHcp = effHcp;
                if (typeof getFieldHcp === 'function') {
                    try { p.fieldHcp = getFieldHcp(effHcp, p.tee, p.gender); } catch (e) { p.fieldHcp = Math.round(effHcp || 0); }
                } else {
                    p.fieldHcp = Math.round(effHcp || 0);
                }
            });

            var rid = g.rid;
            var existing = rid ? state.rounds[rid] : null;
            var round;
            if (existing) {
                round = existing;
            } else {
                rid = db.ref('rounds').push().key;
                round = {
                    createdAt: Date.now(),
                    accessKey: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
                    type: 'group', mode: 'group', status: 'scheduled',
                    holes: {}, players: {}, pOrder: [],
                    createdBy: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.uid : 'admin',
                    creatorPlayerId: g.members[0] ? g.members[0].id : null
                };
            }
            round.groupIdx = newIdx;
            round.tournamentId = state.tnId;
            round.protocolId = state.pid;
            round.type = 'group';
            round.startHole = parseInt(g.startHole, 10) || 1;
            round.startTime = g.startTime || '';
            round.tee = g.tee;
            round.format = g.format || '';
            round.status = round.status || 'scheduled';
            if (t.weather) round.weather = t.weather;

            // players: сохраняем существующие объекты (с результатами), обновляя поля
            var oldPlayers = round.players || {};
            var newPlayers = {};
            var pOrder = [];
            g.members.forEach(function(p) {
                var base = oldPlayers[p.id] || {};
                var entry = Object.assign({}, base, {
                    name: pname(p) || base.name || 'Player',
                    firstName: p.firstName || base.firstName || '',
                    lastName: p.lastName || base.lastName || '',
                    middleName: p.middleName || base.middleName || '',
                    gender: p.gender || 'men',
                    tee: p.tee,
                    exactHcp: (p.exactHcp !== undefined && p.exactHcp !== null && p.exactHcp !== '') ? p.exactHcp : p.hcp,
                    exactHcpRaw: (p.hcp === null || p.hcp === undefined || p.hcp === '') ? 0 : (parseFloat(p.hcp) || 0),
                    fieldHcp: p.fieldHcp
                });
                delete entry.markedBy; // зададим ниже по маркерам
                newPlayers[p.id] = entry;
                pOrder.push(p.id);
            });

            // маркеры: markerTargets marker->target
            var markerAssignments = {};
            var byId = {};
            g.members.forEach(function(p) { byId[p.id] = p; });
            g.members.forEach(function(marker) {
                var tid = g.markerTargets[marker.id];
                if (tid && byId[tid] && tid !== marker.id) {
                    markerAssignments[marker.id] = { targetId: tid, targetName: pname(byId[tid]) };
                    newPlayers[tid].markedBy = marker.id;
                }
            });
            round.players = newPlayers;
            round.pOrder = pOrder;
            round.markerAssignments = Object.keys(markerAssignments).length ? markerAssignments : null;

            sets['rounds/' + rid] = round;
            g.rid = rid;

            // протокольная группа
            var pg = Object.assign({}, (g._orig || {}));
            pg.startHole = round.startHole;
            pg.startTime = round.startTime;
            pg.tee = g.tee;
            pg.format = g.format || '';
            var cleanMT = {};
            Object.keys(markerAssignments).forEach(function(mk2) { cleanMT[mk2] = markerAssignments[mk2].targetId; });
            pg.markerTargets = Object.keys(cleanMT).length ? cleanMT : null;
            g.markerTargets = cleanMT;
            pg.members = g.members.map(function(p) {
                return { id: p.id, name: pname(p), hcp: (p.exactHcp !== undefined ? p.exactHcp : p.hcp), gender: p.gender, tee: p.tee, fieldHcp: p.fieldHcp };
            });
            newProtoGroups.push(pg);
            g.members.forEach(function(p) { groupsFlat.push({ id: p.id, gid: newIdx, rid: rid }); });
        });

        // удалённые/исчезнувшие старые раунды (группа стала пустой и не новая)
        var liveRids = {};
        state.groups.forEach(function(g) { if (g.rid && g.members.length) liveRids[g.rid] = true; });
        Object.keys(state.rounds).forEach(function(rid) {
            if (!liveRids[rid]) {
                var r = state.rounds[rid];
                var hasScores = r.players && Object.keys(r.players).some(function(pid2) {
                    return r.players[pid2].holes && Object.keys(r.players[pid2].holes || {}).length;
                });
                if (hasScores) {
                    sets['rounds/' + rid + '/groupIdx'] = null;
                } else {
                    sets['rounds/' + rid] = null;
                }
            }
        });

        // протокол: players + groups
        var protoPlayers = Object.assign({}, state.proto.players || {});
        var allLists = state.groups.map(function(g) { return g.members; });
        allLists.push(state.roster);
        allLists.forEach(function(list) {
            list.forEach(function(p) {
                protoPlayers[p.id] = Object.assign({}, protoPlayers[p.id] || {}, {
                    id: p.id, name: pname(p) || (protoPlayers[p.id] && protoPlayers[p.id].name) || p.id,
                    hcp: (p.exactHcp !== undefined && p.exactHcp !== null && p.exactHcp !== '') ? p.exactHcp : p.hcp,
                    gender: p.gender || 'men', tee: p.tee
                });
                if (regPlayers[p.id]) {
                    regPlayers[p.id] = Object.assign({}, regPlayers[p.id], {
                        hcp: protoPlayers[p.id].hcp, gender: protoPlayers[p.id].gender, tee: p.tee, fieldHcp: p.fieldHcp
                    });
                }
            });
        });

        var newProto = Object.assign({}, state.proto);
        newProto.players = protoPlayers;
        newProto.groups = newProtoGroups;
        newProto.groupsFlat = groupsFlat;
        newProto.editedAt = Date.now();
        sets['protocols/' + state.pid] = newProto;
        sets['tournaments/' + state.tnId + '/registeredPlayers'] = regPlayers;
        sets['tournaments/' + state.tnId + '/protocolId'] = state.pid;

        db.ref().update(sets).then(function() {
            toast(L('✅ Протокол сохранён: группы, лунки, ТИ и маркеры обновлены', '✅ Protocol saved: groups, holes, tees and markers updated'), 'success');
            loadTournament(state.tnId);
        }).catch(function(err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    // ── Инициализация вкладки ──
    function init() {
        var sel = document.getElementById('pe-tn-select');
        if (!sel || sel.dataset.peInited) return;
        sel.dataset.peInited = '1';
        sel.addEventListener('change', function() { loadTournament(sel.value); });
        loadTournaments();
    }

    window.peInit = init;
    window.peSave = peSave;
    window.peAddGroup = peAddGroup;
    window.peDelGroup = peDelGroup;
    // Инициализация — при открытии вкладки «Протокол» (switchTab в admin.js);
    // на всякий случай ещё раз после полной загрузки DOM (гард не даёт
    // подписаться дважды).
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() {});
})();
