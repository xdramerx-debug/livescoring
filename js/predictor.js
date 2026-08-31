document.addEventListener('DOMContentLoaded', function() {
    initNav();
    initPredictorUsers();
});

function onAuthReady(u, d) {
    navAuth(u, d);
    initPredictorUsers();
}

function initPredictorUsers() {
    if (typeof db === 'undefined') return;
    db.ref('users').once('value').then(function(sn) {
        var users = sn.val() || {};
        var sel = document.getElementById('pred-user-select');
        if (!sel) return;

        sel.innerHTML = '<option value="">' + (currentLang === 'en' ? '— Select Player —' : '— Выберите игрока —') + '</option>';
        var uIdx = 0;
        Object.entries(users).forEach(function(e) {
            var uid = e[0], u = e[1];
            // Удалённые и навсегда заблокированные демо-игроки не показываются
            if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, u && u.name)) return;
            uIdx++;
            var isCurrent = currentUser && uid === currentUser.uid;
            // Имя может быть скрыто настройками конфиденциальности.
            var nameObj = resolvePlayerDisplayName(u, uid, { index: uIdx, isSelf: isCurrent });
            var youMark = isCurrent ? ' (' + (currentLang === 'en' ? 'You' : 'Вы') + ')' : '';
            sel.innerHTML += '<option value="' + uid + '" ' + (isCurrent ? 'selected' : '') + '>' + escapeHtml(nameObj.text || 'Player') + youMark + ' (HCP: ' + fmtExactHcp(u.handicap) + ')</option>';
        });

        runWHSPredictor();
    });
}

function runWHSPredictor() {
    var sel = document.getElementById('pred-user-select');
    var uid = sel ? sel.value : null;
    var el = document.getElementById('pred-result');
    if (!el) return;

    if (!uid) {
        el.innerHTML = '<div class="card" style="max-width:540px;margin:0 auto;text-align:center;padding:30px;color:var(--muted);">' + (currentLang === 'en' ? 'Select a player above to run WHS handicap simulation' : 'Выберите игрока выше для запуска симуляции WHS-гандикапа') + '</div>';
        return;
    }

    var gender = document.getElementById('pred-gender').value;
    var tee = document.getElementById('pred-tee').value;

    db.ref('users/' + uid).once('value').then(function(sn) {
        var u = sn.val() || {};
        db.ref('users/' + uid + '/history').once('value').then(function(hSn) {
            var history = hSn.val() || {};
            var rounds = Object.values(history).filter(function(r) { return r.holes === 18 && r.gross > 0; });
            rounds.sort(function(a, b) { return (b.date || 0) - (a.date || 0); });

            var curExact = parseExactHcp(u.handicap);
            var curField = getFieldHcp(curExact, tee, gender);

            // Calculate Differentials
            var diffs = rounds.slice(0, 20).map(function(r) {
                var rating = COURSE_RATINGS[r.gender || gender] && COURSE_RATINGS[r.gender || gender][r.tee || tee];
                var cr = rating ? rating.cr : TOTAL_PAR;
                var sr = rating ? rating.sr : 113;
                var diff = ((r.gross - cr) * 113) / sr;
                return Math.round(diff * 10) / 10;
            });

            diffs.sort(function(a, b) { return a - b; });

            // WHS Best 8 average
            var best8 = diffs.slice(0, 8);
            var whsCalcIndex = best8.length > 0 ? (best8.reduce(function(a, b) { return a + b; }, 0) / best8.length).toFixed(1) : curExact;

            // Targets to lower HCP
            var targetGrossToMaintain = Math.round(TOTAL_PAR + curField);
            var targetGrossToLower = Math.max(TOTAL_PAR, targetGrossToMaintain - 3);

            var html = '<div class="card" style="max-width:540px;margin:0 auto;border:2px solid var(--gold);background:linear-gradient(135deg, rgba(201,168,76,0.12), var(--card));">';
            html += '<div style="text-align:center;margin-bottom:20px;">';
            // Имя может быть скрыто настройками конфиденциальности.
            var predNameObj = resolvePlayerDisplayName(u, uid, { isSelf: !!(currentUser && currentUser.uid === uid) });
            html += '<h2 style="font-size:24px;color:var(--white);font-family:var(--ff);">' + escapeHtml(predNameObj.text || 'Player') + '</h2>';
            html += '<div style="font-size:13px;color:var(--muted);">' + (currentLang === 'en' ? 'Current WHS Exact Index: ' : 'Текущий точный гандикап WHS: ') + '<b>' + fmtExactHcp(curExact) + '</b> · ' + (currentLang === 'en' ? 'Course HCP: ' : 'Полевой: ') + '<b>' + fmtFieldHcp(curField) + '</b></div>';
            html += '</div>';

            html += '<div class="stats-grid" style="margin-bottom:20px;">';
            html += '<div class="stat"><div class="stat-n" style="color:var(--gold);">' + rounds.length + '</div><div class="stat-l">' + (currentLang === 'en' ? '18h Rounds' : 'Раундов (18л)') + '</div></div>';
            html += '<div class="stat"><div class="stat-n">' + fmtExactHcp(whsCalcIndex) + '</div><div class="stat-l">' + (currentLang === 'en' ? 'Calculated WHS' : 'Расчётный WHS') + '</div></div>';
            html += '</div>';

            // Targets Boxes
            html += '<div class="card" style="background:var(--input);padding:18px;margin-bottom:16px;">';
            html += '<h3 style="color:var(--gold);font-size:15px;margin-bottom:12px;"><i class="fas fa-bullseye"></i> ' + (currentLang === 'en' ? 'Target Score for Next Round:' : 'Целевой результат на следующий раунд:') + '</h3>';
            html += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;"><span>' + (currentLang === 'en' ? 'To maintain current HCP:' : 'Чтобы удержать гандикап:') + '</span><b style="color:var(--white);font-size:16px;">Gross ' + targetGrossToMaintain + '</b></div>';
            html += '<div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px;"><span>' + (currentLang === 'en' ? 'To lower exact HCP by -1.0:' : 'Чтобы понизить гандикап на -1.0:') + '</span><b style="color:#2ecc71;font-size:16px;">Gross ' + targetGrossToLower + '</b></div>';
            html += '</div>';

            html += '</div>';

            el.innerHTML = html;
        });
    });
}
