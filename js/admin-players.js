// js/admin-players.js — «Игроки и роли» (вкладка админки); вынесено из
// js/admin.js (docs/CODE-REVIEW.md, п.3 — фичи-модули). Список игроков с
// поиском, роли/админ-флаги, правка профиля, удаление (deletePlayer).
// Внешних зависимостей от admin.js нет: только runtime-глобалы (db, toast,
// t, currentLang, escapeHtml). loadAdmPlayers() зовётся из admin.js и
// других admin-* модулей typeof-guarded.

// ==========================================
// ИГРОКИ И РОЛИ
// ==========================================
var admPlayersQuery = '';
var admPlayersLastData = null;
var admPlayersExpanded = {};

// Живой поиск по списку игроков (имя, email, телефон) — без новых подписок Firebase.
function admPlayersSearch(v) {
    admPlayersQuery = v || '';
    admPlayersExpanded = {};
    renderAdmPlayersList(admPlayersLastData);
}

function admTogglePlayerRow(id) {
    admPlayersExpanded[id] = !admPlayersExpanded[id];
    var panel = document.getElementById('adm-p-' + id);
    if (panel) panel.classList.toggle('hidden', !admPlayersExpanded[id]);
}

// Компактный список игроков: одна строка на игрока, действия — в раскрывающейся панели.
// Экранирование строки для JS-строки в одинарных кавычках внутри HTML-атрибута
// (onclick="fn('...')"). Один escapeHtml здесь НЕ подходит: браузер декодирует
// &#39; обратно в ' ДО выполнения JS, ломая синтаксис при именах с кавычками.
function admJsStr(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '&quot;')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/</g, '\\x3c');
}

function renderAdmPlayersList(remoteData) {
    var el = document.getElementById('adm-players');
    if (!el) return;
    var en = currentLang === 'en';

    var localUsers = typeof getKnownPlayersSync === 'function' ? (getKnownPlayersSync() || {}) : {};
    var combined = Object.assign({}, localUsers, remoteData || {});
    var entries = Object.entries(combined).filter(function(e) {
        return !(typeof isPlayerDeleted === 'function' && isPlayerDeleted(e[0], e[1] && e[1].name));
    });

    // Дедуп по ФИО, чтобы не было сдваивания в админ-списке
    if (typeof dedupePlayerEntriesByFio === 'function') {
        entries = dedupePlayerEntriesByFio(entries);
    } else if (typeof rgGetFioKey === 'function') {
        var seenFio = {};
        var deduped = [];
        entries.forEach(function(en2) {
            var uu = en2[1] || {};
            var key = rgGetFioKey(uu) || impNormName(uu.name || '');
            if (!key) { deduped.push(en2); return; }
            if (seenFio[key]) return;
            seenFio[key] = true;
            deduped.push(en2);
        });
        entries = deduped;
    }

    var q = (admPlayersQuery || '').trim().toLowerCase();
    if (q) {
        entries = entries.filter(function(e) {
            var u = e[1] || {};
            var hay = ((u.name || '') + ' ' + (u.email || '') + ' ' + (u.phone || '') + ' ' + (u.homeClub || '')).toLowerCase();
            return hay.indexOf(q) !== -1;
        });
    }

    if (!entries.length) {
        el.innerHTML = '<div class="empty"><i class="fas fa-' + (q ? 'search' : 'users') + '"></i><p>' +
            (q ? (en ? 'Nothing found' : 'Ничего не найдено') : (en ? 'No players' : 'Нет игроков')) + '</p></div>';
        return;
    }

    entries.sort(function(a, b) {
        var roleA = a[1].role === 'admin' ? 0 : a[1].role === 'referee' ? 1 : a[1].role === 'marshal' ? 2 : 3;
        var roleB = b[1].role === 'admin' ? 0 : b[1].role === 'referee' ? 1 : b[1].role === 'marshal' ? 2 : 3;
        if (roleA !== roleB) return roleA - roleB;
        return (a[1].name || '').localeCompare(b[1].name || '');
    });

    var roundsStr = en ? ' · Rounds: ' : ' · Раундов: ';
    var html = '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;"><i class="fas fa-users"></i> ' +
        entries.length + ' ' + (en ? 'players — tap a row for actions' : 'строк — нажмите на игрока для действий') + '</div>';

    entries.forEach(function(e) {
        var id = e[0], u = e[1];
        var curRole = u.role || 'player';
        var name = u.name || '—';
        var initials = name === '—' ? '?' : name.split(/\s+/).map(function(w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
        var roleTxt = curRole === 'admin' ? t('role_admin') : curRole === 'referee' ? t('role_referee') : curRole === 'marshal' ? t('role_marshal') : t('role_player');
        var dotCls = curRole === 'admin' ? 'adm-role-admin' : curRole === 'referee' ? 'adm-role-ref' : curRole === 'marshal' ? 'adm-role-mar' : 'adm-role-pl';
        var hcpTxt = u.handicap != null ? fmtExactHcp(u.handicap) : '—';
        var selfMark = (typeof currentUser !== 'undefined' && currentUser && id === currentUser.uid)
            ? ' <span style="color:var(--gold);font-size:11px;">(' + (en ? 'You' : 'Это вы') + ')</span>' : '';

        html += '<div class="adm-player-row" onclick="admTogglePlayerRow(\'' + id + '\')">' +
            '<span class="adm-player-ava">' + escapeHtml(initials) + '</span>' +
            '<span class="adm-player-main"><span class="adm-player-name">' + escapeHtml(name) + selfMark + '</span>' +
            '<span class="adm-player-meta">HCP ' + escapeHtml(String(hcpTxt)) +
            (typeof hcpSyncBadgeHtml === 'function' ? hcpSyncBadgeHtml(u) : '') +
            ' · ' + escapeHtml(roleTxt) + roundsStr + (u.roundsPlayed || 0) + '</span></span>' +
            '<span class="adm-role-dot ' + dotCls + '"></span></div>';

        var nameJs = admJsStr(u.name);
        html += '<div id="adm-p-' + id + '" class="adm-player-actions' + (admPlayersExpanded[id] ? '' : ' hidden') + '">';
        html += '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">' +
            escapeHtml(u.email || (en ? 'No email' : 'Без email')) +
            (u.phone ? ' · 📞 ' + escapeHtml(u.phone) : '') +
            (u.tee ? ' · ⛳ ' + escapeHtml(t('tee_' + u.tee)) : '') +
            (u.homeClub ? ' · ' + escapeHtml(u.homeClub) : '') + '</div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">';

        // Редактируем только реальные профили из users/, чтобы случайный
        // исторический игрок/ghost из кэша не создавал неполную запись в БД.
        var hasRemoteProfile = !!(admPlayersLastData && Object.prototype.hasOwnProperty.call(admPlayersLastData, id));
        if (hasRemoteProfile) {
            html += '<button type="button" class="btn btn-og btn-sm adm-player-edit-btn" onclick="openAdmPlayerEditor(\'' + admJsStr(id) + '\')" title="' +
                (en ? 'Edit player profile' : 'Редактировать данные игрока') + '"><i class="fas fa-user-pen"></i> ' +
                (en ? 'Edit data' : 'Изменить данные') + '</button>';
        }

        if (typeof currentUser === 'undefined' || !currentUser || id !== currentUser.uid) {
            html += '<select class="form-input" style="padding:5px 8px;font-size:11.5px;width:auto;" onchange="changeRole(\'' + id + '\', this.value, \'' + nameJs + '\')">';
            html += '<option value="player" ' + (curRole === 'player' ? 'selected' : '') + '>' + t('role_player') + '</option>';
            html += '<option value="referee" ' + (curRole === 'referee' ? 'selected' : '') + '>' + t('role_referee') + '</option>';
            html += '<option value="marshal" ' + (curRole === 'marshal' ? 'selected' : '') + '>' + t('role_marshal') + '</option>';
            html += '<option value="admin" ' + (curRole === 'admin' ? 'selected' : '') + '>' + t('role_admin') + '</option>';
            html += '</select>';

            var privInd = (typeof pestovoPrivacy !== 'undefined' && pestovoPrivacy.players) ? pestovoPrivacy.players[id] : undefined;
            var privHidden = (privInd === true) || (privInd !== false && (typeof pestovoPrivacy === 'undefined' ? false : pestovoPrivacy.enabled === true));
            html += '<button class="btn ' + (privHidden ? 'btn-r' : 'btn-og') + ' btn-sm" onclick="togglePlayerPrivacy(\'' + id + '\')" title="' +
                (en ? 'Hide/show full name from others' : 'Скрыть/показывать ФИО от других') + '">' +
                '<i class="fas fa-' + (privHidden ? 'eye' : 'eye-slash') + '"></i> ' + t(privHidden ? 'privacy_show_btn' : 'privacy_hide_btn') + '</button>';

            html += '<button class="btn btn-og btn-sm" onclick="clearPlayerHistory(\'' + id + '\',\'' + nameJs + '\')" title="' +
                (en ? 'Clear History' : 'Очистить историю раундов') + '"><i class="fas fa-eraser"></i></button>';

            html += '<button class="btn btn-r btn-sm" onclick="deletePlayer(\'' + id + '\',\'' + nameJs + '\')" title="Delete">' +
                '<i class="fas fa-trash"></i></button>';
        } else {
            html += '<button class="btn btn-og btn-sm" onclick="clearPlayerHistory(\'' + id + '\',\'' + nameJs + '\')" title="' +
                (en ? 'Clear History' : 'Очистить историю раундов') + '"><i class="fas fa-eraser"></i></button>';
        }

        html += '</div></div>';
    });

    el.innerHTML = html;
}

var admPlayerEditEscapeHandler = null;
function closeAdmPlayerEditor() {
    var modal = document.getElementById('adm-player-edit-modal');
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    if (admPlayerEditEscapeHandler) {
        document.removeEventListener('keydown', admPlayerEditEscapeHandler);
        admPlayerEditEscapeHandler = null;
    }
}

function openAdmPlayerEditor(id) {
    id = String(id || '');
    var remote = admPlayersLastData && admPlayersLastData[id];
    if (!id || !remote || typeof remote !== 'object') {
        if (typeof toast === 'function') toast(currentLang === 'en' ? 'Player profile is not available for editing.' : 'Профиль игрока недоступен для редактирования.', 'error');
        return;
    }
    closeAdmPlayerEditor();
    var en = currentLang === 'en';
    var hcp = remote.exactHcp != null ? remote.exactHcp : remote.handicap;
    var hcpText = hcp == null || hcp === '' ? '' : (typeof fmtExactHcp === 'function'
        ? fmtExactHcp(typeof parseExactHcp === 'function' ? parseExactHcp(hcp) : hcp) : String(hcp));
    var gender = String(remote.gender || '').toLowerCase();
    gender = gender === 'women' || gender === 'female' || gender === 'f' ? 'women'
        : (gender === 'men' || gender === 'male' || gender === 'm' ? 'men' : '');
    var tee = String(remote.defaultTee || remote.tee || '');
    var label = function(ru, english) { return en ? english : ru; };
    var modal = document.createElement('div');
    modal.id = 'adm-player-edit-modal';
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'adm-player-edit-title');
    modal.innerHTML = '<div class="modal-bg" data-adm-player-edit-close="1"></div>' +
        '<div class="modal-body" role="document" style="max-width:620px;">' +
        '<div class="modal-top-bar"><div><b id="adm-player-edit-title"><i class="fas fa-user-pen"></i> ' +
        escapeHtml(label('Данные игрока', 'Player profile')) + '</b><div style="font-size:11px;color:var(--muted);margin-top:3px;">' +
        escapeHtml(remote.name || id) + '</div></div><button type="button" class="modal-close-btn" data-adm-player-edit-close="1" aria-label="' +
        escapeHtml(label('Закрыть', 'Close')) + '">×</button></div>' +
        '<form id="adm-player-edit-form" data-player-id="' + escapeHtml(id) + '" style="display:flex;flex:1 1 auto;min-height:0;flex-direction:column;overflow:hidden;">' +
        '<div class="modal-scroll-content"><p style="margin:0 0 14px;color:var(--muted);font-size:12px;">' +
        escapeHtml(label('Изменения сохраняются в профиле игрока и его публичной карточке. Email управляется учётной записью и здесь не меняется.',
            'Changes are saved to the player profile and public profile. Email belongs to the sign-in account and cannot be changed here.')) + '</p>' +
        '<div class="form-group"><label for="adm-edit-player-name">' + escapeHtml(label('ФИО для отображения *', 'Display name *')) +
        '</label><input required maxlength="120" id="adm-edit-player-name" class="form-input" autocomplete="name" value="' + escapeHtml(remote.name || '') + '"></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;">' +
        '<div class="form-group"><label for="adm-edit-player-first">' + escapeHtml(label('Имя', 'First name')) +
        '</label><input maxlength="60" id="adm-edit-player-first" class="form-input" value="' + escapeHtml(remote.firstName || '') + '"></div>' +
        '<div class="form-group"><label for="adm-edit-player-last">' + escapeHtml(label('Фамилия', 'Last name')) +
        '</label><input maxlength="60" id="adm-edit-player-last" class="form-input" value="' + escapeHtml(remote.lastName || '') + '"></div>' +
        '<div class="form-group"><label for="adm-edit-player-middle">' + escapeHtml(label('Отчество', 'Middle name')) +
        '</label><input maxlength="60" id="adm-edit-player-middle" class="form-input" value="' + escapeHtml(remote.middleName || '') + '"></div>' +
        '</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;">' +
        '<div class="form-group"><label for="adm-edit-player-hcp">' + escapeHtml(label('Точный гандикап', 'Exact handicap')) +
        '</label><input inputmode="decimal" maxlength="8" id="adm-edit-player-hcp" class="form-input" placeholder="12.4 / +2.4" value="' + escapeHtml(hcpText) + '"></div>' +
        '<div class="form-group"><label for="adm-edit-player-gender">' + escapeHtml(label('Пол', 'Gender')) +
        '</label><select id="adm-edit-player-gender" class="form-input"><option value="">' + escapeHtml(label('Не указан', 'Not specified')) + '</option>' +
        '<option value="men"' + (gender === 'men' ? ' selected' : '') + '>' + escapeHtml(label('Мужской', 'Male')) + '</option>' +
        '<option value="women"' + (gender === 'women' ? ' selected' : '') + '>' + escapeHtml(label('Женский', 'Female')) + '</option></select></div>' +
        '<div class="form-group"><label for="adm-edit-player-tee">' + escapeHtml(label('ТИ по умолчанию', 'Default tee')) +
        '</label><select id="adm-edit-player-tee" class="form-input"><option value="">' + escapeHtml(label('Авто', 'Automatic')) + '</option>' +
        ['bk', 'bl', 'wh', 'rd'].map(function(code) {
            var teeName = typeof TEES !== 'undefined' && TEES[code] ? TEES[code] : code.toUpperCase();
            return '<option value="' + code + '"' + (tee === code ? ' selected' : '') + '>' + escapeHtml(String(teeName)) + '</option>';
        }).join('') + '</select></div></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">' +
        '<div class="form-group"><label for="adm-edit-player-phone">' + escapeHtml(label('Телефон', 'Phone')) +
        '</label><input type="tel" maxlength="40" id="adm-edit-player-phone" class="form-input" autocomplete="tel" value="' + escapeHtml(remote.phone || '') + '"></div>' +
        '<div class="form-group"><label for="adm-edit-player-club">' + escapeHtml(label('Домашний клуб', 'Home club')) +
        '</label><input maxlength="100" id="adm-edit-player-club" class="form-input" value="' + escapeHtml(remote.homeClub || '') + '"></div></div>' +
        '<p id="adm-player-edit-status" role="status" aria-live="polite" style="min-height:18px;margin:6px 0 0;color:var(--red);"></p></div>' +
        '<div class="modal-actions" style="display:flex;gap:8px;justify-content:flex-end;flex:0 0 auto;padding:10px 14px;border-top:1px solid var(--border);">' +
        '<button type="button" class="btn btn-og" data-adm-player-edit-close="1">' + escapeHtml(label('Отмена', 'Cancel')) + '</button>' +
        '<button type="submit" class="btn btn-g" id="adm-player-edit-save"><i class="fas fa-floppy-disk"></i> ' + escapeHtml(label('Сохранить', 'Save')) + '</button></div>' +
        '</form></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(event) {
        if (event.target && event.target.closest('[data-adm-player-edit-close]')) closeAdmPlayerEditor();
    });
    modal.querySelector('#adm-player-edit-form').addEventListener('submit', saveAdmPlayerEditor);
    admPlayerEditEscapeHandler = function(event) {
        if (event.key === 'Escape') closeAdmPlayerEditor();
    };
    document.addEventListener('keydown', admPlayerEditEscapeHandler);
    var firstInput = modal.querySelector('#adm-edit-player-name');
    if (firstInput) firstInput.focus();
}

function parseAdmPlayerHcp(value) {
    var raw = String(value == null ? '' : value).trim().replace(',', '.');
    if (!raw) return { value: null, valid: true };
    if (!/^[+-]?(?:\d+(?:\.\d{1})?|\.\d{1})$/.test(raw)) return { value: null, valid: false };
    var plus = raw.charAt(0) === '+';
    var number = parseFloat(raw);
    if (!isFinite(number) || Math.abs(number) > 54) return { value: null, valid: false };
    number = plus ? -Math.abs(number) : number;
    return { value: Math.round(number * 10) / 10, valid: true };
}

function saveAdmPlayerEditor(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    var modal = document.getElementById('adm-player-edit-modal');
    var form = modal && modal.querySelector('#adm-player-edit-form');
    if (!form) return;
    var id = String(form.getAttribute('data-player-id') || '');
    var current = id && admPlayersLastData ? admPlayersLastData[id] : null;
    var status = modal.querySelector('#adm-player-edit-status');
    var saveButton = modal.querySelector('#adm-player-edit-save');
    if (!id || !current || typeof current !== 'object') {
        if (status) status.textContent = currentLang === 'en' ? 'Player profile is no longer available.' : 'Профиль игрока больше недоступен.';
        return;
    }
    var name = String(modal.querySelector('#adm-edit-player-name').value || '').replace(/\s+/g, ' ').trim();
    var hcp = parseAdmPlayerHcp(modal.querySelector('#adm-edit-player-hcp').value);
    if (!name) {
        if (status) status.textContent = currentLang === 'en' ? 'Enter the player name.' : 'Укажите ФИО игрока.';
        modal.querySelector('#adm-edit-player-name').focus();
        return;
    }
    if (!hcp.valid) {
        if (status) status.textContent = currentLang === 'en' ? 'Enter a valid exact handicap (for example 12.4 or +2.4).' : 'Укажите корректный точный гандикап (например, 12.4 или +2.4).';
        modal.querySelector('#adm-edit-player-hcp').focus();
        return;
    }
    if (typeof db === 'undefined' || !db || typeof db.ref !== 'function') {
        if (status) status.textContent = currentLang === 'en' ? 'No database connection.' : 'Нет соединения с базой данных.';
        return;
    }
    var gender = modal.querySelector('#adm-edit-player-gender').value;
    var tee = modal.querySelector('#adm-edit-player-tee').value;
    var patch = {
        name: name,
        firstName: String(modal.querySelector('#adm-edit-player-first').value || '').replace(/\s+/g, ' ').trim() || null,
        lastName: String(modal.querySelector('#adm-edit-player-last').value || '').replace(/\s+/g, ' ').trim() || null,
        middleName: String(modal.querySelector('#adm-edit-player-middle').value || '').replace(/\s+/g, ' ').trim() || null,
        handicap: hcp.value,
        exactHcp: hcp.value,
        gender: gender || null,
        defaultTee: tee || null,
        tee: tee || null,
        phone: String(modal.querySelector('#adm-edit-player-phone').value || '').trim() || null,
        homeClub: String(modal.querySelector('#adm-edit-player-club').value || '').replace(/\s+/g, ' ').trim() || null,
        profileUpdatedAt: Date.now()
    };
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) patch.profileUpdatedBy = currentUser.uid;
    var next = Object.assign({}, current, patch);
    var updates = {};
    Object.keys(patch).forEach(function(key) { updates['users/' + id + '/' + key] = patch[key]; });
    updates['usersPublic/' + id] = typeof pubMirrorFromUser === 'function' ? pubMirrorFromUser(next) : next;
    if (saveButton) saveButton.disabled = true;
    if (status) status.textContent = currentLang === 'en' ? 'Saving…' : 'Сохранение…';
    var write;
    try { write = db.ref().update(updates); }
    catch (error) { write = Promise.reject(error); }
    Promise.resolve(write).then(function() {
        admPlayersLastData = Object.assign({}, admPlayersLastData || {});
        admPlayersLastData[id] = next;
        renderAdmPlayersList(admPlayersLastData);
        closeAdmPlayerEditor();
        if (typeof toast === 'function') toast(currentLang === 'en' ? '✅ Player profile updated.' : '✅ Данные игрока обновлены.', 'success');
    }).catch(function(error) {
        if (saveButton) saveButton.disabled = false;
        if (status) status.textContent = (currentLang === 'en' ? 'Could not save player data: ' : 'Не удалось сохранить данные игрока: ') + (error && error.message ? error.message : error || 'error');
    });
}

function loadAdmPlayers() {
    var el = document.getElementById('adm-players');
    if (!el) return;

    var renderWithData = function(remoteData) {
        admPlayersLastData = remoteData;
        renderAdmPlayersList(remoteData);
    };

    renderWithData();

    if (typeof db !== 'undefined' && db) {
        // Одна подписка: bindRealtimeValue не плодит дубли при повторных заходах на вкладку.
        bindRealtimeValue('admin-users', db.ref('users'), function(sn) {
            renderWithData(sn.val());
            syncPublicProfilesMirror(sn.val());
        });
    }
}

// Зеркало публичных профилей (usersPublic): синхронизирует публичные поля при
// любых правках пользователей в админке (вручную, Excel-импорт, AGR, слияния).
// Читатели без прав админа видят только этот узел (database.rules.json).
var _pubMirrorTimer = null;
var PUB_MIRROR_FIELDS = ['name', 'firstName', 'lastName', 'middleName', 'gender', 'handicap', 'exactHcp', 'defaultTee', 'avatar', 'avatarUrl', 'photoURL', 'photoUrl', 'isGuest', 'deleted', 'deletedAt', 'createdAt', 'roundsPlayed', 'bestGross', 'bestStableford', 'hcpUpdatedAt', 'hcpSource'];
function pubMirrorFromUser(u) {
    var out = {};
    PUB_MIRROR_FIELDS.forEach(function (f) { if (u && u[f] !== undefined) out[f] = u[f]; });
    var digits = String((u && u.phone) || '').replace(/\D/g, '');
    if (digits.length >= 4) out.phoneLast4 = digits.slice(-4);
    return out;
}
function syncPublicProfilesMirror(usersVal) {
    if (typeof db === 'undefined' || !db || !usersVal || typeof usersVal !== 'object') return;
    clearTimeout(_pubMirrorTimer);
    _pubMirrorTimer = setTimeout(function () {
        db.ref('usersPublic').once('value').then(function (sn) {
            var cur = sn.val() || {};
            var updates = {};
            Object.keys(usersVal).forEach(function (uid) {
                var u = usersVal[uid];
                if (!u || typeof u !== 'object' || !u.name) return;
                var pub = pubMirrorFromUser(u);
                var old = cur[uid];
                var changed = !old || Object.keys(pub).some(function (f) { return JSON.stringify(old[f]) !== JSON.stringify(pub[f]); });
                if (changed) updates['usersPublic/' + uid] = pub;
            });
            Object.keys(cur).forEach(function (uid) {
                if (!usersVal[uid] || !usersVal[uid].name) updates['usersPublic/' + uid] = null;
            });
            var keys = Object.keys(updates);
            if (!keys.length) return;
            for (var i = 0; i < keys.length; i += 200) {
                var chunk = {};
                keys.slice(i, i + 200).forEach(function (k) { chunk[k] = updates[k]; });
                db.ref().update(chunk).catch(function (err) { console.warn('[mirror] usersPublic sync failed', err); });
            }
        }).catch(function (err) { console.warn('[mirror] usersPublic read failed', err); });
    }, 1500);
}

function changeRole(id, newRole, name) {
    var roleText = t('role_' + newRole);
    if (!roleText || roleText === 'role_' + newRole) {
        roleText = newRole === 'admin' ? (currentLang === 'en' ? 'Administrator' : 'Администратор') : (currentLang === 'en' ? 'Player' : 'Игрок');
    }
    if (!confirm((currentLang === 'en' ? 'Set ' + (name || 'user') + ' role to ' + roleText + '?' : 'Назначить ' + (name || 'пользователя') + ' на роль ' + roleText + '?'))) return;

    if (typeof db === 'undefined' || !db) {
        toast(currentLang === 'en' ? '⚠️ No database connection' : '⚠️ Нет соединения с базой', 'error');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        return;
    }
    db.ref('users/' + id + '/role').set(newRole).then(function() {
        toast('✅ ' + (name || 'User') + (currentLang === 'en' ? ' is now ' : ' теперь ') + roleText);
    }).catch(function(err) {
        toast('❌ Error: ' + (err && err.message ? err.message : err), 'error');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    });
}

function deletePlayer(id, name) {
    if (!confirm((currentLang === 'en' ? 'Delete player ' + (name || id) + '? This cannot be undone!' : 'Удалить игрока ' + (name || id) + '? Это необратимо!'))) return;

    // Нормализованный ключ имени, по которому ищем упоминания удалённого игрока
    // в раундах, регистрациях на турниры и т.п.
    var normKey = '';
    if (typeof normalizeSearchText === 'function' && name) {
        normKey = normalizeSearchText(name);
    } else if (name) {
        normKey = String(name).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    }

    // Запоминаем удаление, чтобы кэш и история раундов не «воскрешали» игрока
    if (typeof markPlayerDeleted === 'function') markPlayerDeleted(id, name);

    // Удаляем все упоминания игрока в `rounds` (players / markerAssignments / markerScores /
    // submitted / markerSubmitted / verified) и снимаем регистрации во всех турнирах.
    // Без этого в выпадашке автоподбора при создании раунда удалённый игрок всё равно
    // появляется — его подбирают из истории раундов.
    var purgeFirebaseReferences = function(callback) {
        if (typeof db === 'undefined') { callback(); return; }

        var tasksPending = 4; // rounds, tournaments, users/history, users
        var tasksLeft = tasksPending;
        var check = function() { tasksLeft--; if (tasksLeft === 0) callback(); };

        var normOf = function(nm) {
            if (typeof normalizeSearchText === 'function') {
                try { return normalizeSearchText(nm); } catch (e) { console.warn("[silent]", e); }
            }
            return String(nm || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
        };
        // 1) Удаляем упоминания в `rounds` (включая marker* и verified поля)
        db.ref('rounds').once('value').then(function(sn) {
            var rounds = sn.val() || {};
            var updates = {};
            Object.keys(rounds).forEach(function(rid) {
                var r = rounds[rid];
                if (!r) return;
                var purgePids = {};
                purgePids[id] = true;
                // Однофамильцы-гости (ключи guest_*): их записи «воскрешают»
                // удалённого игрока в автоподборе на других устройствах —
                // чистим по нормализованному имени тоже. Зарегистрированных
                // (не guest) однофамильцев не трогаем — это другие люди.
                if (r.players) {
                    Object.keys(r.players).forEach(function(tid) {
                        var gp = r.players[tid] || {};
                        if (tid !== id && normKey && String(tid).indexOf('guest_') === 0 && gp.name && normOf(gp.name) === normKey) {
                            purgePids[tid] = true;
                        }
                    });
                }
                if (r.players) {
                    Object.keys(r.players).forEach(function(tid) {
                        if (purgePids[tid]) updates['rounds/' + rid + '/players/' + tid] = null;
                    });
                }
                if (r.markerAssignments) {
                    Object.keys(r.markerAssignments).forEach(function(mid) {
                        if (purgePids[mid]) updates['rounds/' + rid + '/markerAssignments/' + mid] = null;
                    });
                }
                // markerScores и markerSubmitted хранятся под ключом целевого игрока
                if (r.players) {
                    Object.keys(r.players).forEach(function(tid) {
                        if (purgePids[tid]) return;
                        var p = r.players[tid] || {};
                        Object.keys(purgePids).forEach(function(pid2) {
                            if (p.markerScores && p.markerScores[pid2]) {
                                updates['rounds/' + rid + '/players/' + tid + '/markerScores/' + pid2] = null;
                            }
                            if (p.markerSubmitted && p.markerSubmitted[pid2]) {
                                updates['rounds/' + rid + '/players/' + tid + '/markerSubmitted/' + pid2] = null;
                            }
                        });
                    });
                }
            });
            var applyRoundUpdates = function() {
                if (Object.keys(updates).length === 0) { check(); return; }
                db.ref().update(updates).then(check, check);
            };
            applyRoundUpdates();
        }, check);

        // 2) Снимаем регистрации во всех турнирах: по uid + гостевые
        // записи того же имени (push-ключи), иначе игрок останется в ростере.
        db.ref('tournaments').once('value').then(function(sn) {
            var tournaments = sn.val() || {};
            var tnUpdates = {};
            Object.keys(tournaments).forEach(function(tid) {
                var t = tournaments[tid];
                if (!t || !t.registeredPlayers) return;
                Object.keys(t.registeredPlayers).forEach(function(rk) {
                    var rp = t.registeredPlayers[rk] || {};
                    if (rk === id) {
                        tnUpdates['tournaments/' + tid + '/registeredPlayers/' + rk] = null;
                    } else if (normKey && rp.guest === true && rp.name && normOf(rp.name) === normKey) {
                        tnUpdates['tournaments/' + tid + '/registeredPlayers/' + rk] = null;
                    }
                });
            });
            if (Object.keys(tnUpdates).length === 0) { check(); return; }
            db.ref().update(tnUpdates).then(check, check);
        }, check);

        // 3) Удаляем историю раундов
        db.ref('users/' + id + '/history').remove().then(check, check);

        // 4) Удаляем саму ноду users/<id> (вместе с ней уходят и notifications —
        // отдельный путь users/<id>/notifications сюда добавлять нельзя: update()
        // падает на пересекающихся путях и удаление вообще не происходит)
        var userUpdates = {};
        userUpdates['users/' + id] = null;
        db.ref().update(userUpdates).then(check, check);
    };

    var finishLocalDelete = function() {
        if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[id]) {
            delete cachedRegisteredUsers[id];
        }
        // Также выкидываем из кэша все ghost-записи, оставшиеся от истории раундов
        // по этому имени (могут иметь ключ вроде guest_name_xxx).
        if (normKey && typeof cachedRegisteredUsers !== 'undefined') {
            Object.keys(cachedRegisteredUsers).forEach(function(k) {
                var u = cachedRegisteredUsers[k];
                if (!u || !u.name) return;
                var uKey = (typeof normalizeSearchText === 'function')
                    ? normalizeSearchText(u.name)
                    : String(u.name).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
                if (uKey === normKey) delete cachedRegisteredUsers[k];
            });
        }
        try {
            var custom = {};
            var existing = localStorage.getItem('pestovo_custom_players');
            if (existing) custom = JSON.parse(existing) || {};
            if (custom[id]) {
                delete custom[id];
                localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
            }
            // Кэш удалённых игроков хранится и в pestovo_cached_users — чистим оба ключа
            var cachedRaw = localStorage.getItem('pestovo_cached_users');
            if (cachedRaw) {
                var cached = JSON.parse(cachedRaw);
                if (cached && typeof cached === 'object') {
                    delete cached[id];
                    // Тот же ghost-фильтр по нормализованному имени
                    if (normKey) {
                        Object.keys(cached).forEach(function(k) {
                            var u = cached[k];
                            if (!u || !u.name) return;
                            var uKey = (typeof normalizeSearchText === 'function')
                                ? normalizeSearchText(u.name)
                                : String(u.name).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
                            if (uKey === normKey) delete cached[k];
                        });
                    }
                    localStorage.setItem('pestovo_cached_users', JSON.stringify(cached));
                }
            }
        } catch (e) { console.warn("[silent]", e); }

        // После удаления автоподбор читает кэш через `getKnownPlayersSync()`,
        // поэтому нужно триггерить обновление списка в открытых формах.
        if (typeof syncKnownPlayersCache === 'function') syncKnownPlayersCache();
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        toast(currentLang === 'en' ? '🗑️ Player deleted everywhere' : '🗑️ Игрок полностью удалён');
    };

    if (typeof db !== 'undefined') {
        // Сначала чистим все упоминания, потом завершаем очистку локального кэша
        purgeFirebaseReferences(function() {
            finishLocalDelete();
        });
    } else {
        finishLocalDelete();
    }
}

function clearPlayerHistory(userId, userName) {
    if (!userId) return;
    var confirmMsg = currentLang === 'en'
        ? 'Delete ALL round history for ' + (userName || 'player') + '?'
        : 'Удалить ВСЮ историю раундов игрока ' + (userName || 'игрока') + '? Это действие необратимо!';

    if (!confirm(confirmMsg)) return;

    if (typeof db !== 'undefined') {
        db.ref('users/' + userId + '/history').remove().then(function() {
            db.ref('users/' + userId).update({
                roundsPlayed: 0,
                bestGross: null,
                bestStableford: null
            });

            toast(currentLang === 'en' ? 'History cleared for ' + userName : 'История раундов игрока ' + userName + ' очищена', 'success');
            if (typeof vib === 'function') vib([50, 30, 50]);
            if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        }).catch(function(err) {
            toast('⚠️ Ошибка удаления истории: ' + err.message, 'error');
        });
    } else {
        toast(currentLang === 'en' ? 'History cleared for ' + userName : 'История раундов игрока ' + userName + ' очищена', 'success');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
    }
}

function createPlayerInAdmin() {
    var nameInp = document.getElementById('adm-new-name');
    var emailInp = document.getElementById('adm-new-email');
    var hcpInp = document.getElementById('adm-new-hcp');
    var genderSel = document.getElementById('adm-new-gender');
    var roleSel = document.getElementById('adm-new-role');

    if (!nameInp) return;
    var name = nameInp.value.trim();
    if (!name) {
        toast(currentLang === 'en' ? '⚠️ Specify player full name' : '⚠️ Укажите имя и фамилию игрока', 'error');
        nameInp.focus();
        return;
    }

    var email = emailInp ? emailInp.value.trim() : '';
    var hcpRaw = hcpInp ? hcpInp.value.trim() : '0';
    // parseExactHcp молча превращает мусор в 0 — проверяем ввод явно, чтобы
    // опечатка вроде «12ж» не записывала игроку нулевой гандикап
    if (hcpRaw !== '' && !/^[+-]?(\d+([.,]\d+)?|\.\d+)$/.test(hcpRaw.replace(/\s+/g, ''))) {
        toast((currentLang === 'en' ? '⚠️ Invalid handicap value: ' : '⚠️ Некорректный гандикап: ') + hcpRaw, 'error');
        if (hcpInp) hcpInp.focus();
        return;
    }
    var parsedHcp = parseExactHcp(hcpRaw);
    var gender = genderSel ? genderSel.value : 'men';
    // ТИ по умолчанию удалено (1.60): ТИ игрока определяется его группой в протоколе.
    var defaultTee = gender === 'women' ? 'rd' : 'wh';
    var role = roleSel ? roleSel.value : 'player';

    var parts = name.split(' ');
    var firstName = parts[0] || name;
    var middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
    var lastName = parts.length > 1 ? parts[parts.length - 1] : '';
    // Если ввели "Иван Петрович Тестов" — first=Иван, middle=Петрович, last=Тестов
    // Если ввели "Тестов Иван Петрович" — тоже попробуем разобрать как в АГР
    if (parts.length === 3) {
        // Эвристика: если первая часть похожа на фамилию (заканчивается на -ов/-ев/-ин), считаем фамилия первая
        var firstNorm = impNormName(parts[0]);
        if (/(ов|ев|ин|ский|цкий|ко)$/.test(firstNorm)) {
            lastName = parts[0];
            firstName = parts[1];
            middleName = parts[2];
        }
    }

    // Проверка на дубликат по ФИО — чтобы не было сдваивания
    var allLocal = (typeof getKnownPlayersSync === 'function') ? getKnownPlayersSync() : {};
    var normNew = impNormName(name);
    var foundDupId = null;
    var foundDupData = null;
    Object.keys(allLocal).forEach(function(uid){
        var u = allLocal[uid] || {};
        if (typeof isPlayerDeleted === 'function' && isPlayerDeleted(uid, u.name)) return;
        var existingKey = (typeof rgGetFioKey === 'function') ? rgGetFioKey(u) : impNormName(u.name||'');
        if (existingKey && existingKey === normNew) {
            foundDupId = uid;
            foundDupData = u;
        }
    });
    if (foundDupId) {
        // Уже есть игрок с таким ФИО — обновляем гандикап и добавляем отчество если не было
        if (typeof db !== 'undefined') {
            var upd = { handicap: parsedHcp, hcpUpdatedAt: Date.now(), hcpSource: 'manual' };
            if (middleName && !(foundDupData && foundDupData.middleName)) {
                upd.middleName = middleName;
                upd.firstName = firstName;
                upd.lastName = lastName;
                upd.name = (firstName + (middleName ? ' ' + middleName : '') + (lastName ? ' ' + lastName : '')).trim();
            }
            db.ref('users/' + foundDupId).update(upd);
            // Гандикап уехал и в состав турниров, где этот игрок уже заявлен
            // (участник связан с профилем полем uid).
            if (typeof pestovoSyncHcpToTournaments === 'function') {
                pestovoSyncHcpToTournaments(foundDupId, parsedHcp, {
                    name: upd.name || '', gender: gender
                }).catch(function (e) { console.warn('[hcp-sync]', e); });
            }
        }
        if (typeof cachedRegisteredUsers !== 'undefined' && cachedRegisteredUsers[foundDupId]) {
            cachedRegisteredUsers[foundDupId].handicap = parsedHcp;
            if (middleName && !cachedRegisteredUsers[foundDupId].middleName) {
                cachedRegisteredUsers[foundDupId].middleName = middleName;
                cachedRegisteredUsers[foundDupId].firstName = firstName;
                cachedRegisteredUsers[foundDupId].lastName = lastName;
                cachedRegisteredUsers[foundDupId].name = (firstName + (middleName ? ' ' + middleName : '') + (lastName ? ' ' + lastName : '')).trim();
            }
            try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch (e) { console.warn("[silent]", e); }
        }
        toast((currentLang === 'en' ? '🔄 Player ' : '🔄 Игрок ') + name + (currentLang === 'en' ? ' updated (HCP ' : ' обновлён (HCP ') + fmtExactHcp(parsedHcp) + ') — ' + (currentLang === 'en' ? 'duplicate avoided' : 'дубликат предотвращён'), 'success');
        if (typeof loadAdmPlayers === 'function') loadAdmPlayers();
        nameInp.value = '';
        if (emailInp) emailInp.value = '';
        if (hcpInp) hcpInp.value = '';
        return;
    }

    var newId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    var playerData = {
        name: name,
        firstName: firstName,
        middleName: middleName || '',
        lastName: lastName,
        email: email,
        handicap: parsedHcp,
        gender: gender,
        defaultTee: defaultTee,
        role: role,
        createdAt: Date.now(),
        roundsPlayed: 0,
        bestGross: null,
        bestStableford: null
    };

    try {
        var custom = {};
        var existing = localStorage.getItem('pestovo_custom_players');
        if (existing) custom = JSON.parse(existing) || {};
        custom[newId] = playerData;
        localStorage.setItem('pestovo_custom_players', JSON.stringify(custom));
    } catch (e) { console.warn("[silent]", e); }

    if (typeof cachedRegisteredUsers !== 'undefined') {
        cachedRegisteredUsers[newId] = playerData;
        try { localStorage.setItem('pestovo_cached_users', JSON.stringify(cachedRegisteredUsers)); } catch (e) { console.warn("[silent]", e); }
    }

    toast(currentLang === 'en' ? '🎉 Player ' + name + ' created!' : '🎉 Игрок ' + name + ' создан!', 'success');
    if (typeof vib === 'function') vib([50, 30, 50]);
    nameInp.value = '';
    if (emailInp) emailInp.value = '';
    if (hcpInp) hcpInp.value = '';

    if (typeof loadAdmPlayers === 'function') loadAdmPlayers();

    if (typeof db !== 'undefined') {
        db.ref('users/' + newId).set(playerData).catch(function(err) {
            console.warn('Firebase user save notice:', err);
        });
    }
}
