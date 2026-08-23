document.addEventListener('DOMContentLoaded', function() { initNav(); loadTournaments(); });
function onAuthReady(u, d) { navAuth(u, d); loadTournaments(); }

function loadTournaments() {
    db.ref('tournaments').on('value', function(sn) {
        var data = sn.val() || {};
        var entries = Object.entries(data);
        var el = document.getElementById('tn-list');
        if (!el) return;

        if (!entries.length) {
            el.innerHTML = '<div class="empty"><i class="fas fa-trophy"></i><p>' + (currentLang === 'en' ? 'No tournaments created yet' : 'Нет турниров') + '</p><p style="font-size:12px;margin-top:8px;">' + t('admin_only_tournaments') + '</p></div>';
            return;
        }
        entries.sort(function(a, b) { return (b[1].createdAt || 0) - (a[1].createdAt || 0); });
        
        var formatLabel = currentLang === 'en' ? 'Formats: ' : 'Форматы: ';
        var teeLabel = currentLang === 'en' ? 'Tees: ' : 'ТИ: ';

        var html = '';
        entries.forEach(function(e) {
            var tnId = e[0], tVal = e[1];
            var statusCls = tVal.status === 'active' ? 'tn-a' : tVal.status === 'completed' ? 'tn-d' : 'tn-u';
            var statusText = tVal.status === 'active' ? (currentLang === 'en' ? '🔴 Active' : '🔴 Активный') : tVal.status === 'completed' ? (currentLang === 'en' ? '✅ Completed' : '✅ Завершён') : (currentLang === 'en' ? '📅 Upcoming' : '📅 Предстоящий');
            var formatsStr = (tVal.formats || []).join(' · ') || '—';
            var teesStr = (tVal.tees || []).map(function(k) { return t('tee_' + k); }).join(' · ');

            var regPlayers = tVal.registeredPlayers || {};
            var regCount = Object.keys(regPlayers).length;
            var isRegistered = currentUser && regPlayers[currentUser.uid];

            var regBtn = '';
            if (isRegistered) {
                regBtn = '<button class="btn btn-og btn-sm" onclick="cancelTournamentRegistration(\'' + tnId + '\')"><i class="fas fa-check-circle"></i> ' + t('registered_badge') + '</button>';
            } else if (tVal.status !== 'completed') {
                regBtn = '<button class="btn btn-g btn-sm" onclick="openTournamentRegModal(\'' + tnId + '\')"><i class="fas fa-user-plus"></i> ' + t('register_tournament_btn') + '</button>';
            }

            html += '<div class="tn-card">';
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">';
            html += '<div style="flex:1;"><div class="tn-name">' + (tVal.name || '—') + '</div>';
            html += '<div class="tn-meta"><span><i class="fas fa-calendar"></i> ' + fmtDate(new Date(tVal.date).getTime()) + '</span></div>';
            html += '<div style="margin-top:8px;font-size:12px;color:var(--muted);">' + formatLabel + formatsStr + '</div>';
            html += '<div style="font-size:12px;color:var(--muted);">' + teeLabel + teesStr + '</div>';
            html += '<div style="font-size:12px;color:var(--gold);font-weight:700;margin-top:6px;"><i class="fas fa-users"></i> ' + t('registered_count') + ': ' + regCount + '</div>';
            html += '</div>';

            html += '<div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">';
            html += '<span class="tn-status ' + statusCls + '">' + statusText + '</span>';
            html += regBtn;
            html += '<button class="btn btn-og btn-sm" onclick="toggleRosterPanel(\'' + tnId + '\')"><i class="fas fa-list-ul"></i> ' + t('participants_list') + ' (' + regCount + ')</button>';
            html += '</div>';

            html += '</div>';

            // Roster Panel
            html += '<div id="roster-' + tnId + '" class="card-scorecard-panel hidden" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);">';
            if (regCount === 0) {
                html += '<p style="font-size:12px;color:var(--muted);text-align:center;">' + (currentLang === 'en' ? 'No registered participants yet' : 'Пока нет зарегистрированных участников') + '</p>';
            } else {
                html += '<div style="overflow-x:auto;"><table class="lb-table"><thead><tr><th>#</th><th>' + t('player') + '</th><th>HCP</th><th>ТИ</th><th>' + t('date') + '</th></tr></thead><tbody>';
                var rIdx = 1;
                Object.values(regPlayers).forEach(function(rp) {
                    html += '<tr><td>' + (rIdx++) + '</td>';
                    html += '<td><strong style="color:var(--gold);">' + (rp.name || '—') + '</strong></td>';
                    html += '<td>' + (rp.handicap != null ? fmtExactHcp(rp.handicap) : '—') + '</td>';
                    html += '<td>' + fmtTeePill(rp.tee) + '</td>';
                    html += '<td>' + fmtDate(rp.registeredAt) + '</td></tr>';
                });
                html += '</tbody></table></div>';
            }
            html += '</div>';

            html += '</div>';
        });
        el.innerHTML = html;
    });
}

function toggleRosterPanel(tnId) {
    var panel = document.getElementById('roster-' + tnId);
    if (panel) panel.classList.toggle('hidden');
}

function openTournamentRegModal(tnId) {
    if (!currentUser) {
        toast(currentLang === 'en' ? 'Please log in to register for tournaments' : 'Войдите в аккаунт для записи на турниры', 'error');
        window.location.href = 'auth.html?redirect=tournaments.html';
        return;
    }

    db.ref('tournaments/' + tnId).once('value').then(function(sn) {
        var tVal = sn.val();
        if (!tVal) return;

        var modalEl = document.getElementById('reg-tn-modal');
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'reg-tn-modal';
            modalEl.className = 'modal hidden';
            modalEl.innerHTML =
                '<div class="modal-bg" onclick="closeRegTnModal()"></div>' +
                '<div class="modal-body" style="max-width:480px;text-align:center;">' +
                '<div class="modal-top-bar">' +
                '<button type="button" class="btn btn-og btn-sm modal-back-btn" onclick="closeRegTnModal()"><i class="fas fa-arrow-left"></i> <span>' + t('back_btn') + '</span></button>' +
                '<button type="button" class="modal-close-btn" onclick="closeRegTnModal()">&times;</button>' +
                '</div>' +
                '<div id="reg-tn-modal-body"></div>' +
                '</div>';
            if (document.body) document.body.appendChild(modalEl);
        }

        var bodyEl = document.getElementById('reg-tn-modal-body');
        var allowedTees = tVal.tees || ['wh'];
        var defaultTee = (currentUserData && currentUserData.defaultTee) || allowedTees[0];

        var html = '<h2 style="color:var(--gold);margin-bottom:8px;"><i class="fas fa-trophy"></i> ' + (tVal.name || 'Tournament') + '</h2>';
        html += '<p style="font-size:13px;color:var(--muted);margin-bottom:20px;">' + t('confirm_registration') + '</p>';

        html += '<div class="card" style="background:var(--input);padding:16px;text-align:left;margin-bottom:20px;">';
        html += '<div style="font-size:14px;color:var(--white);font-weight:700;margin-bottom:6px;"><i class="fas fa-user"></i> ' + (currentUserData ? currentUserData.name : 'Player') + '</div>';
        html += '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;">HCP: ' + (currentUserData && currentUserData.handicap != null ? fmtExactHcp(currentUserData.handicap) : '—') + '</div>';

        html += '<div class="form-group"><label>' + t('tee_select') + ':</label><select id="reg-tn-tee" class="form-input">';
        allowedTees.forEach(function(tk) {
            var sel = tk === defaultTee ? 'selected' : '';
            html += '<option value="' + tk + '" ' + sel + '>' + fmtTeePill(tk) + '</option>';
        });
        html += '</select></div></div>';

        html += '<div style="display:flex;gap:12px;">';
        html += '<button class="btn btn-og" style="flex:1;" onclick="closeRegTnModal()">' + t('cancel_btn') + '</button>';
        html += '<button class="btn btn-g" style="flex:1;" onclick="submitTournamentRegistration(\'' + tnId + '\')"><i class="fas fa-check"></i> ' + (currentLang === 'en' ? 'Register' : 'Записаться') + '</button>';
        html += '</div>';

        bodyEl.innerHTML = html;
        modalEl.classList.remove('hidden');
    });
}

function closeRegTnModal() {
    var modalEl = document.getElementById('reg-tn-modal');
    if (modalEl) modalEl.classList.add('hidden');
}

function submitTournamentRegistration(tnId) {
    if (!currentUser) return;
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

    db.ref('tournaments/' + tnId + '/registeredPlayers/' + currentUser.uid).set(regData).then(function() {
        toast(t('msg_tournament_registered'), 'success');
        closeRegTnModal();
        loadTournaments();
    });
}

function cancelTournamentRegistration(tnId) {
    if (!currentUser) return;
    if (!confirm(currentLang === 'en' ? 'Cancel registration for this tournament?' : 'Отменить запись на этот турнир?')) return;

    db.ref('tournaments/' + tnId + '/registeredPlayers/' + currentUser.uid).remove().then(function() {
        toast(t('msg_registration_cancelled'), 'info');
        loadTournaments();
    });
}
