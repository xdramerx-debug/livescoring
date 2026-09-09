// ==========================================================
// СТАРТ ТУРНИРА (вкладка админки «Старт турнира 🏁»)
// ----------------------------------------------------------
// Позволяет собрать стартовый протокол турнира:
//  — участники (из регистрации на турнир, вручную или из Excel),
//  — поля: фамилия, имя, отчество (если есть), точный гандикап,
//    полевой гандикап (считается автоматически), ТИ, формат,
//  — автоматическое распределение на группы (1–4 человека):
//    в порядке списка / по алфавиту / по гандикапу / «змейкой» / случайно,
//  — стартовые времена и стартовые лунки (с 1-й или шотган 1+10),
//  — маркеры внутри группы (каждый игрок маркирует следующего),
//  — создание раундов (rounds/<id>) со всей метаинформацией,
//  — печатные QR-карточки: игрок сканирует и сразу вводит результат.
//
// Данные протокола хранятся в protocols/<pid>, раунды — в rounds/<rid>.
// ==========================================================

var psState = {
    tournaments: [],       // [{id,name,date,formats,tees,status}]
    users: null,           // { uid: {…} } из ветки users (лениво)
    usersLoading: false,
    usersWaiters: [],
    selId: '',             // выбранный турнир
    proto: null,           // черновик стартового протокола
    groups: [],            // результаты раскладки (предпросмотр)
    savedId: null,         // последний сохранённый протокол
    excel: null,           // распарсенные строки Excel (перед добавлением)
    busy: false
};

function psL(ru, en) {
    try { return (typeof currentLang !== 'undefined' && currentLang === 'en') ? en : ru; } catch (e) { return ru; }
}
function psEl(id) { try { return document.getElementById(id); } catch (e) { return null; } }

function psDefaultProto() {
    return {
        name: '',
        tournamentId: '',
        tournamentName: '',
        date: '',
        format: 'Stroke Play',
        formatCustom: '',
        tee: 'wh',
        scheme: '1',          // '1' — все с 1-й лунки, '1-10' — шотган с 1-й и 10-й
        size: 4,
        method: 'hcpSnake',   // order|alpha|hcpAsc|hcpDesc|hcpSnake|random
        interval: 8,
        startTime: '09:00',
        players: []           // см. psNewPlayer
    };
}

function psNewPlayer() {
    return {
        id: '',
        lastName: '',
        firstName: '',
        middleName: '',
        gender: 'men',
        tee: 'wh',
        hcp: null,            // точный гандикап (число, плюсовой — отрицательное)
        source: 'manual',
        uidMatched: false
    };
}

function psTodayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function psNorm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function psNameWords(p) {
    var words = [];
    [p.lastName, p.firstName, p.middleName].forEach(function(w) { if (String(w || '').trim()) words.push(String(w).trim()); });
    return words;
}
function psFullRus(p) { return psNameWords(p).join(' '); }                 // Фамилия Имя Отчество
function psNameForRound(p) { return [p.firstName, p.middleName, p.lastName].filter(function(w) { return String(w || '').trim(); }).join(' '); } // Имя Отчество Фамилия
function psKeyOf(p) {
    return [psNorm(p.lastName), psNorm(p.firstName), psNorm(p.middleName)].join('|');
}
function psLooksLikeSurname(w) {
    w = psNorm(w);
    if (!w) return false;
    return /(ов|ев|ёв|ин|ын|ский|цкий|ской|цкой|ко|ук|юк|ич|енко|ова|ева|ина)$/.test(w);
}

// Разбор «сырого» ФИО (строка) на части. Поддерживает оба порядка:
//   «Тестов Иван Петрович» / «Иван Петрович Тестов»
//   «Тестов Иван» / «Иван Тестов»
// А также составные (нерусские) фамилии с частицами:
//   «ван дер Берг Иван», «Иван ван дер Берг», «John van der Berg»
function psSplitFio(raw) {
    var parts = String(raw || '').replace(/\s+/g, ' ').trim().split(' ');
    var res = { lastName: '', firstName: '', middleName: '' };
    if (!parts.length || !parts[0]) return res;
    if (parts.length === 1) { res.firstName = parts[0]; return res; }
    if (parts.length === 2) {
        if (psLooksLikeSurname(parts[0])) { res.lastName = parts[0]; res.firstName = parts[1]; }
        else { res.firstName = parts[0]; res.lastName = parts[1]; }
        return res;
    }
    // Составные фамилии с частицами («ван», «фон», «дер», «де»…): они занимают
    // начало строки («ван дер Берг Иван») или идут после имени («John van der Berg»).
    var particles = { ван: 1, фон: 1, дер: 1, тер: 1, тен: 1, де: 1, дю: 1, ле: 1, ла: 1, да: 1, ди: 1, дель: 1, фондер: 1, vander: 1, van: 1, von: 1, der: 1, ter: 1, ten: 1, de: 1, la: 1, le: 1, du: 1, des: 1, da: 1, di: 1, del: 1, della: 1, den: 1 };
    function isP(w) { return !!particles[psNorm(w)]; }
    var s = -1;
    for (var i = 0; i < parts.length; i++) { if (isP(parts[i])) { s = i; break; } }
    if (s === 0 && parts.length >= 4) {
        // частицы в начале: «ван дер Берг Иван» → фамилия «ван дер Берг»
        var e = 0;
        while (e + 1 < parts.length && isP(parts[e + 1])) e++;
        var k = e + 1; // первый «корневой» токен фамилии после частиц
        if (k < parts.length - 1) {
            res.lastName = parts.slice(0, k + 1).join(' ');
            var rest = parts.slice(k + 1);
            res.firstName = rest[0];
            res.middleName = rest.slice(1).join(' ');
            return res;
        }
    }
    if (s > 0 && s <= parts.length - 2) {
        // частицы не в начале: «Иван ван дер Берг» / «John van der Berg»
        res.lastName = parts.slice(s).join(' ');
        res.firstName = parts[0];
        res.middleName = s > 2 ? parts.slice(1, s).join(' ') : (s === 2 ? parts[1] : '');
        return res;
    }
    // 3+ части: если первая похожа на фамилию — порядок «Фамилия Имя Отчество»
    if (psLooksLikeSurname(parts[0])) {
        res.lastName = parts[0];
        res.firstName = parts.slice(1, -1).join(' ');
        res.middleName = parts[parts.length - 1];
        return res;
    }
    // Отчество мужское оканчивается на «-ич», женское на «-вна/-чна»
    function isPatronymic(w) { return /(ич|вна|чна)$/i.test(psNorm(w)); }
    // «Иван Тестов Петрович» — необычный порядок «Имя Фамилия Отчество»
    if (parts.length === 3 && isPatronymic(parts[2]) && psLooksLikeSurname(parts[1]) && !isPatronymic(parts[1])) {
        res.firstName = parts[0];
        res.middleName = parts[2];
        res.lastName = parts[1];
        return res;
    }
    // «Иван Петрович Тестов» / «Иван Петрович Ковалевич» → Имя Отчество Фамилия
    if (parts.length === 3 && isPatronymic(parts[1]) && !isPatronymic(parts[2])) {
        res.firstName = parts[0];
        res.middleName = parts[1];
        res.lastName = parts[2];
        return res;
    }
    res.firstName = parts[0];
    res.middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : '';
    res.lastName = parts[parts.length - 1];
    return res;
}

// ----------------------------------------------------------
// ГАНДИКАПЫ
// ----------------------------------------------------------
function psParseHcp(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    var s = String(raw).replace(/\u00a0/g, '').replace(/\s+/g, '').trim();
    if (!s || s === '—' || s === '-') return null;
    var neg = false;
    if (s.charAt(0) === '+') { neg = true; s = s.substring(1); }
    if (!/^-?\d+([.,]\d+)?$/.test(s)) return null;
    var v = parseFloat(s.replace(',', '.'));
    if (!isFinite(v)) return null;
    if (neg) v = -Math.abs(v);
    if (v < -6 || v > 60) return null;
    return Math.round(v * 10) / 10;
}
function psCalcFieldHcp(p) {
    if (p == null) return 0;
    if (typeof getFieldHcp === 'function') {
        try { return getFieldHcp(p.hcp == null ? 0 : p.hcp, p.tee || 'wh', p.gender || 'men'); } catch (e) {}
    }
    return Math.round(parseFloat(p.hcp) || 0);
}
function psHcpFmt(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    if (typeof fmtExactHcp === 'function') return fmtExactHcp(v);
    var num = parseFloat(v);
    if (isNaN(num)) return '—';
    return num < 0 ? '+' + Math.abs(num).toFixed(1) : Math.abs(num).toFixed(1);
}
function psTeeName(code) {
    if (typeof TEES !== 'undefined' && TEES[code]) return TEES[code];
    var map = { bk: 'Чёрный', bl: 'Синий', wh: 'Белый', rd: 'Красный' };
    return map[code] || code || 'wh';
}
function psAllowedTees() {
    var tn = psGetSelTournament();
    if (tn && tn.tees && tn.tees.length) return tn.tees;
    return ['bk', 'bl', 'wh', 'rd'];
}
function psTeeOptionsHtml(selCode) {
    var marks = { bk: '⬛', bl: '🟦', wh: '⬜', rd: '🟥' };
    var html = '';
    psAllowedTees().forEach(function(code) {
        var sel = selCode === code ? ' selected' : '';
        html += '<option value="' + code + '"' + sel + '>' + (marks[code] || '') + ' ' + psTeeName(code) + '</option>';
    });
    return html;
}

// ----------------------------------------------------------
// ПОЛЬЗОВАТЕЛИ (для сопоставления импортированных игроков с аккаунтами)
// ----------------------------------------------------------
function psLoadUsers(cb) {
    if (typeof db === 'undefined' || !db) { if (cb) cb({}); return; }
    if (psState.users) { if (cb) cb(psState.users); return; }
    if (psState.usersLoading) { if (cb) psState.usersWaiters.push(cb); return; }
    psState.usersLoading = true;
    db.ref('users').once('value').then(function(sn) {
        psState.users = sn.val() || {};
        psState.usersLoading = false;
        var w = psState.usersWaiters; psState.usersWaiters = [];
        if (cb) cb(psState.users);
        w.forEach(function(f) { try { f(psState.users); } catch (e) {} });
    }).catch(function() {
        psState.users = {};
        psState.usersLoading = false;
        var w = psState.usersWaiters; psState.usersWaiters = [];
        if (cb) cb(psState.users);
        w.forEach(function(f) { try { f(psState.users); } catch (e) {} });
    });
}

function psUserParts(u) {
    var last = (u && (u.lastName || '')) ? u.lastName : '';
    var first = (u && (u.firstName || '')) ? u.firstName : '';
    var middle = (u && (u.middleName || '')) ? u.middleName : '';
    if ((!last || !first) && u && u.name) {
        var parsed = psSplitFio(u.name);
        if (!last) last = parsed.lastName;
        if (!first) first = parsed.firstName;
        if (!middle) middle = parsed.middleName;
    }
    return { lastName: last, firstName: first, middleName: middle };
}

// Ищет uid пользователя по ФИО. Если найдено несколько разных аккаунтов
// с одинаковым ФИО — возвращаем первый, но помечаем неоднозначность.
function psFindUidByFio(p) {
    if (!psState.users) return null;
    var target = psKeyOf(p);
    if (!target) return null;
    var found = [];
    Object.keys(psState.users).forEach(function(uid) {
        var u = psState.users[uid] || {};
        var parts = psUserParts(u);
        var key = psKeyOf(parts);
        if (key && key === target) found.push(uid);
    });
    if (found.length === 1) return found[0];
    if (found.length > 1) return found[0];
    // Без отчества: если у игрока нет отчества, а у пользователя есть — всё равно совпадение
    if (!psNorm(p.middleName)) {
        var k2 = psNorm(p.lastName) + '|' + psNorm(p.firstName) + '|';
        var found2 = [];
        Object.keys(psState.users || {}).forEach(function(uid) {
            var u = psState.users[uid] || {};
            var parts = psUserParts(u);
            var key = psKeyOf(parts);
            if (key && key.indexOf(k2) === 0) found2.push(uid);
        });
        if (found2.length === 1) return found2[0];
    }
    return null;
}

// ----------------------------------------------------------
// ТУРНИРЫ
// ----------------------------------------------------------
function psLoadTournaments(cb) {
    if (typeof db === 'undefined' || !db) { if (cb) cb([]); return; }
    db.ref('tournaments').once('value').then(function(sn) {
        var data = sn.val() || {};
        var list = Object.keys(data).map(function(id) {
            var t = data[id] || {};
            return {
                id: id,
                name: t.name || '',
                date: t.date || '',
                formats: t.formats || [],
                tees: t.tees || ['wh'],
                status: t.status || 'upcoming'
            };
        }).sort(function(a, b) {
            return String(a.date).localeCompare(String(b.date)) || (b.name || '').localeCompare(a.name || '');
        });
        psState.tournaments = list;
        if (cb) cb(list);
    }).catch(function() {
        psState.tournaments = [];
        if (cb) cb([]);
    });
}

// ----------------------------------------------------------
// ОТКРЫТИЕ ВКЛАДКИ
// ----------------------------------------------------------
function psOpen() {
    var root = psEl('tab-start-content');
    if (!root) return;
    if (psState.selId) {
        // повторное открытие — просто перерисовываем
        psRender();
        return;
    }
    psState.savedId = null;
    psState.excel = null;
    psState.proto = psDefaultProto();
    psLoadUsers();
    psLoadTournaments(function() { psRender(); });
}

function psRender() {
    var root = psEl('tab-start-content');
    if (!root) return;
    var html = '';
    html += psRenderHelpCard();
    html += psRenderTournamentCard();
    html += psRenderProtoCard();
    html += psRenderSavedCard();
    root.innerHTML = html;
    psRenderExcelBox();
}

function psRenderHelpCard() {
    return '<div class="card" style="margin-bottom:20px;">' +
        '<h2 style="margin-top:0;"><i class="fas fa-flag-checkered"></i> ' + psL('Стартовый протокол турнира', 'Tournament start protocol') + '</h2>' +
        '<p style="color:var(--muted);font-size:13px;margin-bottom:0;">' +
        psL('Соберите список игроков турнира (вручную, из регистрации или из Excel), распределите их на группы по 1–4 человека, ' +
            'укажите ТИ, стартовые времена и лунки — система автоматически рассчитает полевой гандикап и назначит маркеров. ' +
            'После сохранения каждому игроку будет доступен свой QR-код: отсканировав его, игрок сразу откроет карточку и сможет вводить результат.',
            'Build the tournament start list (manually, from registrations or Excel), split players into groups of 1–4. Tees, starting times and holes are assigned automatically, course handicaps and markers are calculated. After saving, each player gets a QR code that opens their scorecard right away.') +
        '</p></div>';
}

// ----------------------------------------------------------
// 1. ВЫБОР ТУРНИРА / НАСТРОЙКИ ПРОТОКОЛА
// ----------------------------------------------------------
function psRenderTournamentCard() {
    var html = '<div class="card" style="margin-bottom:20px;">';
    html += '<h2 style="margin-top:0;"><i class="fas fa-trophy"></i> ' + psL('1. Турнир и настройки', '1. Tournament & settings') + '</h2>';

    if (!psState.tournaments.length) {
        html += '<p style="color:var(--muted);font-size:13px;">' + psL('Турниров пока нет.', 'No tournaments yet.') + '</p>';
        html += '<button class="btn btn-og btn-sm" onclick="switchTab(\'tournaments\',document.querySelector(\'[data-i18n=tab_tournaments]\'))"><i class="fas fa-plus"></i> ' + psL('Создать турнир во вкладке «Турниры»', 'Create a tournament in the “Tournaments” tab') + '</button>';
        html += '</div>';
        return html;
    }

    var tournament = psGetSelTournament();
    var proto = psState.proto;
    var disabled = tournament ? '' : ' disabled';

    var opts = '<option value="">' + psL('— выберите турнир —', '— choose a tournament —') + '</option>';
    psState.tournaments.forEach(function(t) {
        var sel = t.id === psState.selId ? ' selected' : '';
        var label = (t.name || '?') + ' · ' + (t.date ? String(t.date) : '');
        opts += '<option value="' + t.id + '"' + sel + '>' + label.replace(/</g, '&lt;') + '</option>';
    });

    // Доступные ТИ: из турнира (или все, если турнир не выбран)
    var allowedTees = tournament && tournament.tees && tournament.tees.length ? tournament.tees : ['bk', 'bl', 'wh', 'rd'];
    var teeCodes = ['bk', 'bl', 'wh', 'rd'];
    var teesOptions = '';
    teeCodes.forEach(function(code) {
        if (allowedTees.indexOf(code) === -1) return;
        var sel = proto.tee === code ? ' selected' : '';
        var mark = { bk: '⬛', bl: '🟦', wh: '⬜', rd: '🟥' }[code] || '';
        teesOptions += '<option value="' + code + '"' + sel + '>' + mark + ' ' + psTeeName(code) + '</option>';
    });

    html += '<div class="form-group"><label>' + psL('Турнир', 'Tournament') + '</label>' +
        '<select id="ps-sel-tn" class="form-input" onchange="psOnTournamentChange(this.value)">' + opts + '</select></div>';

    if (tournament) {
        var frm = tournament.formats || [];
        var fmtHint = frm.length ? frm.join(' · ') : psL('форматы не указаны', 'no formats set');
        html += '<div style="font-size:12px;color:var(--muted);margin-bottom:12px;"><i class="fas fa-circle-info"></i> ' +
            psL('Форматы турнира: ', 'Tournament formats: ') + '<b style="color:var(--gold);">' + fmtHint.replace(/</g, '&lt;') + '</b></div>';
    }

    var formatHtml = psFormatsSelect(proto);
    var formatWrap = tournament
        ? formatHtml
        : '<select class="form-input" disabled>' + formatHtml.replace(/ onchange="[^"]*"/g, '').replace(/selected/g, '') + '</select>';

    html += '<div class="form-row form-row-3">';
    html += '<div class="form-group"><label>' + psL('Название протокола', 'Protocol name') + '</label>' +
        '<input type="text" id="ps-name" class="form-input"' + disabled + ' value="' + (proto.name || '').replace(/"/g, '&quot;') + '" onchange="psField(\'name\', this.value)"></div>';
    html += '<div class="form-group"><label>' + psL('Дата', 'Date') + '</label>' +
        '<input type="date" id="ps-date" class="form-input"' + disabled + ' value="' + (proto.date || '') + '" onchange="psField(\'date\', this.value)"></div>';
    html += '<div class="form-group"><label>' + psL('Формат игры', 'Game format') + '</label>' + formatWrap + '</div>';
    html += '</div>';

    html += '<div class="form-row">';
    html += '<div class="form-group" style="flex:0 1 240px;"><label>' + psL('ТИ по умолчанию (для новых игроков)', 'Default tee (for new players)') + '</label>' +
        '<select id="ps-tee" class="form-input"' + disabled + ' onchange="psField(\'tee\', this.value)">' + teesOptions + '</select></div>';
    html += '<div class="form-group" style="flex:1 1 260px;"><label>' + psL('Формат (свой, если выбран «Другой»)', 'Custom format (if “Other” is selected)') + '</label>' +
        '<input type="text" id="ps-format-custom" class="form-input"' + disabled + ' placeholder="' + psL('например: Гросс, 2 из 4 лучших', 'e.g. Gross, best 2 of 4') + '" value="' + (proto.formatCustom || '').replace(/"/g, '&quot;') + '" onchange="psField(\'formatCustom\', this.value)"></div>';
    html += '</div>';

    if (!tournament) {
        html += '<div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.35);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--muted);margin-top:6px;">' +
            psL('Протокол привязывается к турниру: именно его зарегистрированные игроки, форматы и ТИ будут использованы. Протоколы без турнира создавать нельзя.',
                'A start protocol is linked to a tournament: its registered players, formats and tees are used. Protocols without a tournament cannot be created.') +
            '</div>';
    }
    html += '</div>';
    return html;
}

function psFormatsSelect(proto) {
    var tournament = psGetSelTournament();
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    var preset = ['Stroke Play', 'Stableford', 'Match Play 1v1', 'Match Play 2v2', 'Scramble', 'Texas Scramble', 'Greensomes'];
    var options = [];
    var used = {};
    function addOpt(val, label) {
        if (used[val]) return;
        used[val] = true;
        options.push('<option value="' + esc(val) + '"' + (proto.format === val ? ' selected' : '') + '>' + esc(label) + '</option>');
    }
    (tournament ? tournament.formats : []).forEach(function(f) { addOpt(f, f); });
    preset.forEach(function(f) {
        var label = f;
        if (f === 'Stroke Play') label = psL('Stroke Play (гросс)', 'Stroke Play (gross)');
        if (f === 'Stableford') label = psL('Stableford (очки)', 'Stableford (points)');
        addOpt(f, label);
    });
    if (proto.format && !used[proto.format]) addOpt(proto.format, proto.format);
    options.push('<option value="__custom__"' + (proto.format === '__custom__' ? ' selected' : '') + '>' + psL('Другой (свой формат)', 'Other (custom format)') + '</option>');
    return '<select id="ps-format" class="form-input" onchange="psFormatChanged(this.value)">' + options.join('') + '</select>';
}

function psField(field, val) {
    if (!psState.proto) return;
    if (field === 'name' || field === 'date' || field === 'formatCustom' || field === 'format' || field === 'scheme' || field === 'tee' || field === 'startTime') {
        psState.proto[field] = String(val || '');
        if (field === 'date' && val && !psState.proto.name) {
            var tn = psGetSelTournament();
            if (tn) psState.proto.name = tn.name + ' · ' + psL('старт', 'start');
        }
    } else if (field === 'interval' || field === 'size') {
        var num = parseInt(val, 10);
        if (isNaN(num)) return;
        psState.proto[field] = num;
        if (field === 'size' && num >= 1 && num <= 4) {
            if (psState.groups.length) { psState.groups = []; }
        }
    } else if (field === 'method') {
        psState.proto.method = val;
    }
    if (psState.groups.length) psState.groups = []; // настройки изменились — раскладку нужно пересчитать
    psRender();
}

function psFormatChanged(val) {
    if (!psState.proto) return;
    if (val === '__custom__') {
        psState.proto.format = '__custom__';
    } else {
        psState.proto.format = val;
        psState.proto.formatCustom = '';
    }
    if (psState.groups.length) psState.groups = [];
    psRender();
}

function psResolvedFormat() {
    var p = psState.proto;
    if (!p) return 'Stroke Play';
    if (p.format === '__custom__') return (p.formatCustom && p.formatCustom.trim()) ? p.formatCustom.trim() : psL('Другой формат', 'Other format');
    return p.format;
}

function psGetSelTournament() {
    if (!psState.selId) return null;
    for (var i = 0; i < psState.tournaments.length; i++) {
        if (psState.tournaments[i].id === psState.selId) return psState.tournaments[i];
    }
    return null;
}

function psOnTournamentChange(id) {
    var t = null;
    psState.tournaments.forEach(function(x) { if (x.id === id) t = x; });
    psState.selId = id || '';
    psState.proto = psDefaultProto();
    psState.proto.tournamentId = id || '';
    if (t) {
        psState.proto.tournamentName = t.name || '';
        psState.proto.name = (t.name || '') + ' · ' + psL('старт', 'start');
        psState.proto.date = t.date || psTodayStr();
        psState.proto.tee = (t.tees && t.tees[0]) || 'wh';
        if (t.formats && t.formats.length) psState.proto.format = t.formats[0];
    }
    psState.groups = [];
    psState.savedId = null;
    psRender();
}

// ----------------------------------------------------------
// 2. УЧАСТНИКИ
// ----------------------------------------------------------
function psRenderProtoCard() {
    var proto = psState.proto;
    var tournament = psGetSelTournament();
    var html = '';

    // ── Карточка участников ──
    html += '<div class="card" style="margin-bottom:20px;">';
    html += '<h2 style="margin-top:0;"><i class="fas fa-users"></i> ' + psL('2. Участники стартового листа', '2. Start list players') +
        ' <span style="color:var(--gold);font-size:15px;">(' + (proto ? proto.players.length : 0) + ')</span></h2>';

    if (!tournament) {
        html += '<p style="color:var(--muted);font-size:13px;margin:0;">' + psL('Сначала выберите турнир в блоке 1.', 'First pick a tournament in block 1.') + '</p></div>';
        return html;
    }

    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">';
    html += '<button class="btn btn-g btn-sm" onclick="psAddManualOpen()"><i class="fas fa-user-plus"></i> ' + psL('Добавить вручную', 'Add manually') + '</button>';
    html += '<button class="btn btn-g btn-sm" onclick="psLoadRegistered()"><i class="fas fa-download"></i> ' + psL('Загрузить из регистрации', 'Load registered players') + '</button>';
    html += '<label class="btn btn-og btn-sm" style="cursor:pointer;margin:0;"><i class="fas fa-file-excel"></i> ' + psL('Импорт Excel', 'Excel import') +
        '<input type="file" id="ps-excel-file" accept=".xlsx,.xls,.csv" style="display:none;" onchange="psExcelPick(this)"></label>';
    html += '<button class="btn btn-og btn-sm" onclick="psTemplateDownload()"><i class="fas fa-file-arrow-down"></i> ' + psL('Шаблон Excel', 'Excel template') + '</button>';
    html += '<button class="btn btn-r btn-sm" onclick="psClearPlayers()"><i class="fas fa-trash"></i> ' + psL('Очистить список', 'Clear list') + '</button>';
    html += '</div>';

    // ручное добавление (скрытая форма)
    html += '<div id="ps-manual-form" class="hidden" style="background:var(--input);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">';
    html += '<h3 style="color:var(--gold);font-size:14px;margin:0 0 10px;"><i class="fas fa-user-pen"></i> ' + psL('Новый игрок', 'New player') + '</h3>';
    html += '<div class="form-row form-row-3">';
    html += '<div class="form-group"><label>' + psL('Фамилия', 'Last name') + '</label><input type="text" id="ps-m-last" class="form-input" placeholder="' + psL('Тестов', 'Smith') + '"></div>';
    html += '<div class="form-group"><label>' + psL('Имя', 'First name') + '</label><input type="text" id="ps-m-first" class="form-input" placeholder="' + psL('Иван', 'John') + '"></div>';
    html += '<div class="form-group"><label>' + psL('Отчество (если есть)', 'Middle name (optional)') + '</label><input type="text" id="ps-m-mid" class="form-input" placeholder="' + psL('Петрович', '') + '"></div>';
    html += '</div>';
    html += '<div class="form-row form-row-3">';
    html += '<div class="form-group"><label>' + psL('Точный гандикап', 'Exact handicap') + '</label><input type="text" id="ps-m-hcp" class="form-input" placeholder="13.0 или +2.4"></div>';
    html += '<div class="form-group"><label>' + psL('Пол', 'Gender') + '</label><select id="ps-m-gender" class="form-input">' +
        '<option value="men">' + psL('👨 Мужчина', '👨 Male') + '</option><option value="women">' + psL('👩 Женщина', '👩 Female') + '</option></select></div>';
    html += '<div class="form-group"><label>' + psL('ТИ', 'Tee') + '</label><select id="ps-m-tee" class="form-input">' + psTeeOptionsHtml(psState.proto.tee || 'wh') + '</select></div>';
    html += '</div>';
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<button class="btn btn-g btn-sm" onclick="psAddManual()"><i class="fas fa-check"></i> ' + psL('Добавить игрока', 'Add player') + '</button>' +
        '<button class="btn btn-ol btn-sm" onclick="psAddManualOpen(true)">' + psL('Отмена', 'Cancel') + '</button>' +
        '</div></div>';

    // Excel-превью
    html += '<div id="ps-excel-box"></div>';

    // таблица участников
    html += psRenderRosterTable(proto);

    html += '</div>'; // card участников

    // ── Карточка распределения ──
    html += psRenderDistributeCard(proto);

    return html;
}

function psAddManualOpen(cancel) {
    var form = psEl('ps-manual-form');
    if (!form) return;
    if (cancel) { form.classList.add('hidden'); return; }
    form.classList.remove('hidden');
    var f = psEl('ps-m-first'); if (f) f.focus();
}

function psRosterRowHtml(p, idx) {
    var hcpVal = p.hcp === null || p.hcp === undefined ? '' : psHcpFmt(p.hcp).replace(/\+/g, '+');
    var hcpInput = '<input type="text" class="form-input" style="width:86px;padding:6px 8px;font-size:13px;" value="' + hcpVal.replace(/"/g, '&quot;') + '" ' +
        'onchange="psRowHcp(' + idx + ', this.value)" placeholder="13.0">';
    var fieldHcp = psCalcFieldHcp(p);
    var fieldChip = '<span class="hcp-chip hcp-band-' + (fieldHcp <= 0 ? 'plus' : fieldHcp <= 10 ? '1-10' : fieldHcp <= 20 ? '11-20' : fieldHcp <= 36 ? '21-36' : '37') + '" style="font-size:12px;">' +
        psL('Полевой', 'Course') + ' ' + fmtFieldHcp(fieldHcp) + '</span>';

    var genderSel = '<select class="form-input" style="width:auto;min-width:130px;padding:6px 8px;font-size:13px;" onchange="psRowGender(' + idx + ', this.value)">' +
        '<option value="men"' + (p.gender === 'men' ? ' selected' : '') + '>' + psL('Мужчина', 'Male') + '</option>' +
        '<option value="women"' + (p.gender === 'women' ? ' selected' : '') + '>' + psL('Женщина', 'Female') + '</option></select>';

    var teeSel = '<select class="form-input" style="width:auto;min-width:120px;padding:6px 8px;font-size:13px;" onchange="psRowTee(' + idx + ', this.value)">' + psTeeOptionsHtml(p.tee) + '</select>';

    var fio = '<b style="color:var(--white);font-size:14px;">' + escapeHtml(psFullRus(p) || '?') + '</b>';
    if (p.uidMatched) {
        fio += ' <span class="hcp-chip" style="background:rgba(46,204,113,.18);border-color:rgba(46,204,113,.5);color:#2ecc71;" title="' + psL('Найден аккаунт игрока — раунд появится в его профиле', 'Player account matched — the round will appear in their profile') + '"><i class="fas fa-circle-check"></i></span>';
    }
    var srcTxt = p.source === 'registered' ? psL('регистрация', 'registration') : p.source === 'excel' ? psL('Excel', 'Excel') : psL('вручную', 'manual');
    var rowHtml = '<div class="list-item" style="padding:12px 14px;flex-wrap:wrap;gap:10px;align-items:center;">';

    rowHtml += '<div style="flex:1.6;min-width:200px;">' + fio +
        '<div style="font-size:11px;color:var(--muted);margin-top:3px;"><i class="fas fa-tag"></i> ' + srcTxt + ' · ID: ' + escapeHtml(String(p.id).slice(0, 24)) + '</div>' +
        '</div>';

    rowHtml += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">';
    rowHtml += '<div class="form-group" style="margin:0;"><label style="font-size:10px;color:var(--muted);margin-bottom:2px;">' + psL('Точный HCP', 'Exact HCP') + '</label><div>' + hcpInput + '</div></div>';
    rowHtml += '<div class="form-group" style="margin:0;"><label style="font-size:10px;color:var(--muted);margin-bottom:2px;">' + psL('Полевой HCP (авто)', 'Course HCP (auto)') + '</label><div>' + fieldChip + '</div></div>';
    rowHtml += '<div class="form-group" style="margin:0;"><label style="font-size:10px;color:var(--muted);margin-bottom:2px;">' + psL('Пол', 'Gender') + '</label><div>' + genderSel + '</div></div>';
    rowHtml += '<div class="form-group" style="margin:0;"><label style="font-size:10px;color:var(--muted);margin-bottom:2px;">' + psL('ТИ', 'Tee') + '</label><div>' + teeSel + '</div></div>';
    rowHtml += '</div>';

    rowHtml += '<div style="display:flex;gap:4px;align-items:center;margin-left:auto;">' +
        '<button class="btn btn-ol btn-sm" style="padding:5px 9px;font-size:12px;" title="' + psL('Выше', 'Up') + '" onclick="psMovePlayer(' + idx + ',-1)"><i class="fas fa-arrow-up"></i></button>' +
        '<button class="btn btn-ol btn-sm" style="padding:5px 9px;font-size:12px;" title="' + psL('Ниже', 'Down') + '" onclick="psMovePlayer(' + idx + ',1)"><i class="fas fa-arrow-down"></i></button>' +
        '<button class="btn btn-r btn-sm" style="padding:5px 9px;font-size:12px;" title="' + psL('Удалить', 'Delete') + '" onclick="psRemovePlayer(' + idx + ')"><i class="fas fa-trash"></i></button>' +
        '</div>';
    rowHtml += '</div>';
    return rowHtml;
}

function psRenderRosterTable(proto) {
    var players = proto ? proto.players : [];
    if (!players.length) {
        return '<p style="color:var(--muted);font-size:13px;margin:0;"><i class="fas fa-circle-info"></i> ' +
            psL('Список пуст. Загрузите участников из регистрации турнира, импортируйте Excel или добавьте вручную.', 'List is empty. Load players from the tournament registration, import an Excel file or add them manually.') + '</p>';
    }
    var html = '<div style="display:flex;flex-direction:column;gap:8px;">';
    players.forEach(function(p, i) { html += psRosterRowHtml(p, i); });
    html += '</div>';
    html += '<p style="color:var(--muted);font-size:11px;margin:12px 0 0;"><i class="fas fa-lightbulb"></i> ' +
        psL('Полевой гандикап пересчитывается автоматически при изменении точного гандикапа, пола или ТИ. Порядок списка важен для раскладки «в порядке списка».', 'The course handicap is recalculated automatically when the exact handicap, gender or tee changes. List order matters for the “as listed” distribution.') + '</p>';
    return html;
}

function psRowHcp(idx, raw) {
    var p = psState.proto && psState.proto.players[idx];
    if (!p) return;
    var parsed = psParseHcp(raw);
    if (parsed === null && String(raw || '').trim() !== '') {
        toast(psL('⚠️ Некорректный гандикап: ' + raw, '⚠️ Invalid handicap: ' + raw), 'error');
    }
    p.hcp = parsed;
    if (psState.groups.length) psState.groups = [];
    psRender();
}
function psRowGender(idx, val) {
    var p = psState.proto && psState.proto.players[idx];
    if (!p) return;
    p.gender = val;
    if (psState.groups.length) psState.groups = [];
    psRender();
}
function psRowTee(idx, val) {
    var p = psState.proto && psState.proto.players[idx];
    if (!p) return;
    p.tee = val;
    if (psState.groups.length) psState.groups = [];
    psRender();
}

function psMovePlayer(idx, delta) {
    var players = psState.proto.players;
    if (idx < 0 || idx >= players.length) return;
    var target = idx + delta;
    if (target < 0 || target >= players.length) return;
    var tmp = players[idx];
    players[idx] = players[target];
    players[target] = tmp;
    if (psState.groups.length) psState.groups = [];
    psRender();
}

function psRemovePlayer(idx) {
    var players = psState.proto.players;
    if (idx < 0 || idx >= players.length) return;
    if (!confirm(psL('Удалить игрока из стартового листа?', 'Remove the player from the start list?'))) return;
    players.splice(idx, 1);
    if (psState.groups.length) psState.groups = [];
    psRender();
}

function psClearPlayers() {
    if (!psState.proto.players.length) return;
    if (!confirm(psL('Очистить весь список участников?', 'Clear the whole player list?'))) return;
    psState.proto.players = [];
    psState.groups = [];
    psRender();
}

function psAddManual() {
    var p = psNewPlayer();
    p.lastName = (psEl('ps-m-last') || {}).value ? psEl('ps-m-last').value.trim() : '';
    p.firstName = (psEl('ps-m-first') || {}).value ? psEl('ps-m-first').value.trim() : '';
    p.middleName = (psEl('ps-m-mid') || {}).value ? psEl('ps-m-mid').value.trim() : '';
    p.hcp = psParseHcp((psEl('ps-m-hcp') || {}).value);
    p.gender = (psEl('ps-m-gender') || {}).value || 'men';
    p.tee = (psEl('ps-m-tee') || {}).value || psState.proto.tee || 'wh';
    if (!p.lastName && !p.firstName) {
        toast(psL('⚠️ Укажите фамилию и имя игрока', '⚠️ Enter the player\'s name'), 'error');
        return;
    }
    if (p.hcp === null) {
        toast(psL('⚠️ Укажите корректный точный гандикап', '⚠️ Enter a valid exact handicap'), 'error');
        return;
    }
    psAddPlayerToDraft(p);
    // очистить форму
    ['ps-m-last', 'ps-m-first', 'ps-m-mid', 'ps-m-hcp'].forEach(function(id) { var el = psEl(id); if (el) el.value = ''; });
    psAddManualOpen(true);
    psRender();
}

function psAddPlayerToDraft(p, source) {
    var proto = psState.proto;
    p.source = source || 'manual';
    // Дубликат ФИО внутри протокола?
    var key = psKeyOf(p);
    var dup = false;
    proto.players.forEach(function(ex) { if (psKeyOf(ex) === key && key) dup = true; });
    if (!p.id) p.id = 'gst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    if (dup) {
        toast(psL('⚠️ Игрок «' + psFullRus(p) + '» уже есть в списке — пропущен', '⚠️ Player “' + psFullRus(p) + '” is already in the list — skipped'), 'warn');
        return false;
    }
    proto.players.push(p);
    if (psState.groups.length) psState.groups = [];
    return true;
}

// Загрузка зарегистрированных на турнир игроков
function psLoadRegistered() {
    var tn = psGetSelTournament();
    if (!tn) return;
    if (typeof db === 'undefined' || !db) return;
    var btn = event && event.target ? event.target : null;
    db.ref('tournaments/' + psState.selId + '/registeredPlayers').once('value').then(function(sn) {
        var reg = sn.val() || {};
        var keys = Object.keys(reg);
        if (!keys.length) {
            toast(psL('На турнир пока никто не зарегистрирован.', 'Nobody is registered for the tournament yet.'), 'info');
            return;
        }
        psLoadUsers(function(users) {
            var added = 0, skipped = 0;
            keys.forEach(function(uid) {
                var r = reg[uid] || {};
                var p = psNewPlayer();
                p.id = uid;
                p.source = 'registered';
                p.hcp = (r.handicap !== undefined && r.handicap !== null) ? parseFloat(r.handicap) : null;
                p.tee = r.tee || psState.proto.tee || 'wh';
                p.gender = r.gender || 'men';
                var u = users[uid] || {};
                var up = psUserParts(u);
                if (up.lastName || up.firstName) {
                    p.lastName = up.lastName;
                    p.firstName = up.firstName;
                    p.middleName = up.middleName;
                    if (!p.hcp && u.handicap !== undefined && u.handicap !== null) p.hcp = parseFloat(u.handicap);
                    if (!p.tee && u.defaultTee) p.tee = u.defaultTee;
                } else {
                    var parsed = psSplitFio(r.name || '');
                    p.lastName = parsed.lastName;
                    p.firstName = parsed.firstName;
                    p.middleName = parsed.middleName;
                }
                if (p.hcp === null || isNaN(p.hcp)) {
                    if (u && u.handicap !== undefined && u.handicap !== null) p.hcp = parseFloat(u.handicap);
                }
                if (!p.lastName && !p.firstName) { skipped++; return; }
                if (psAddPlayerToDraft(p, 'registered')) added++;
                else skipped++;
            });
            toast(psL('✅ Загружено из регистрации: ' + added + (skipped ? ', пропущено дублей: ' + skipped : ''), '✅ Loaded from registration: ' + added + (skipped ? ', duplicates skipped: ' + skipped : '')), 'success');
            psRender();
        });
    }).catch(function(err) {
        toast(psL('⚠️ Ошибка загрузки регистрации: ' + (err && err.message || err), '⚠️ Registration load error: ' + (err && err.message || err)), 'error');
    });
}

// ----------------------------------------------------------
// EXCEL: импорт участников
// ----------------------------------------------------------
function psTemplateDownload() {
    if (typeof XLSX === 'undefined') {
        toast(psL('❌ Библиотека Excel не загрузилась (проверьте интернет)', '❌ Excel library not loaded (check internet)'), 'error');
        return;
    }
    var rows = [
        ['Фамилия', 'Имя', 'Отчество', 'Точный гандикап', 'Пол (муж/жен)', 'ТИ (чёрный/синий/белый/красный)'],
        ['Тестов', 'Иван', 'Петрович', 12.0, 'муж', 'белый'],
        ['Тестова', 'Мария', 'Ивановна', 20.0, 'жен', 'красный'],
        ['Смирнов', 'Пётр', '', 4.2, 'муж', 'чёрный']
    ];
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 24 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, psL('Стартовый лист', 'Start list'));
    XLSX.writeFile(wb, 'Pestovo_StartList_Template.xlsx');
    toast('📋 ' + psL('Шаблон скачан', 'Template downloaded'), 'success');
}

function psHeaderKey(raw) {
    var s = psNorm(raw).replace(/[.:]/g, '');
    if (['фамилия', 'last name', 'lastname', 'last_name', 'surname', 'family name', 'фамилия игрока', 'ф'].indexOf(s) !== -1) return 'lastName';
    if (['имя', 'first name', 'firstname', 'first_name', 'given name', 'имя игрока', 'и'].indexOf(s) !== -1) return 'firstName';
    if (['отчество', 'middle name', 'middlename', 'middle_name', 'patronymic', 'отчество игрока', 'о'].indexOf(s) !== -1) return 'middleName';
    if (['фио', 'имя фамилия', 'full name', 'фамилия имя отчество', 'ф.и.о.', 'ф и о', 'игрок', 'player', 'имя и фамилия'].indexOf(s) !== -1) return 'fio';
    if (['точный гандикап', 'точный hcp', 'гандикап', 'точный гандикап (hcp)', 'hcp', 'hi', 'handicap', 'handicap index', 'гандикап index'].indexOf(s) !== -1) return 'hcp';
    if (['пол', 'gender', 'sex'].indexOf(s) !== -1) return 'gender';
    if (['ти', 'tee', 'tees', 'ти игрока', 'тис'].indexOf(s) !== -1) return 'tee';
    return null;
}

function psGenderFromCell(v) {
    var s = psNorm(v);
    if (!s) return 'men';
    if (['ж', 'жен', 'женский', 'женщина', 'f', 'female', 'w', 'women', 'woman'].indexOf(s) !== -1 || s.indexOf('жен') === 0) return 'women';
    return 'men';
}

function psTeeFromCell(v) {
    var s = psNorm(v);
    if (!s) return null;
    var map = {
        'чёрный': 'bk', 'черный': 'bk', 'черн': 'bk', 'чёрн': 'bk', 'bk': 'bk', 'blk': 'bk', 'black': 'bk',
        'синий': 'bl', 'син': 'bl', 'сини': 'bl', 'bl': 'bl', 'blue': 'bl',
        'белый': 'wh', 'бел': 'wh', 'бели': 'wh', 'wh': 'wh', 'white': 'wh',
        'красный': 'rd', 'красн': 'rd', 'rd': 'rd', 'red': 'rd'
    };
    if (map[s] !== undefined) return map[s];
    if (s.indexOf('чёрн') === 0 || s.indexOf('черн') === 0) return 'bk';
    if (s.indexOf('син') === 0) return 'bl';
    if (s.indexOf('бел') === 0) return 'wh';
    if (s.indexOf('красн') === 0) return 'rd';
    return null;
}

function psParseHcpFromCell(raw) {
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    if (raw === 0 || raw === '0') return 0;
    return psParseHcp(raw);
}

function psParseExcelRows(json) {
    var keys = {};
    if (json && json.length) {
        Object.keys(json[0]).forEach(function(h) {
            var k = psHeaderKey(h);
            if (k && !keys[k]) keys[k] = h;
        });
    }
    // Если не нашли ни одного столбца имён — попробуем первый столбец как ФИО
    var valid = [];
    var invalid = [];
    (json || []).forEach(function(r, i) {
        var lastName = '', firstName = '', middleName = '', fio = '';
        if (keys.lastName) lastName = String(r[keys.lastName] == null ? '' : r[keys.lastName]).trim();
        if (keys.firstName) firstName = String(r[keys.firstName] == null ? '' : r[keys.firstName]).trim();
        if (keys.middleName) middleName = String(r[keys.middleName] == null ? '' : r[keys.middleName]).trim();
        if (keys.fio) fio = String(r[keys.fio] == null ? '' : r[keys.fio]).trim();

        if (!lastName && !firstName && !fio) {
            // строка полностью пустая
            var any = false;
            Object.keys(r || {}).forEach(function(h) { if (String(r[h] == null ? '' : r[h]).trim()) any = true; });
            if (!any) return;
            invalid.push({ row: i + 2, name: '', err: psL('нет имени', 'no name') });
            return;
        }

        var rawHcp = keys.hcp ? r[keys.hcp] : null;
        var hcp = psParseHcpFromCell(rawHcp);
        var gender = keys.gender ? psGenderFromCell(r[keys.gender]) : 'men';
        var tee = keys.tee ? psTeeFromCell(r[keys.tee]) : null;

        if (fio && !lastName && !firstName) {
            // «Тестов Иван Петрович» или «Иван Петрович Тестов»
            var parsed = psSplitFio(fio);
            lastName = parsed.lastName;
            firstName = parsed.firstName;
            middleName = parsed.middleName || '';
        }
        if (!firstName && lastName) {
            // В «Фамилию» случайно попали оба слова
            var p2 = psSplitFio(lastName);
            firstName = p2.firstName || firstName;
            lastName = p2.lastName || lastName;
            middleName = p2.middleName || middleName;
        }
        if (!lastName && firstName) {
            var p3 = psSplitFio(firstName);
            lastName = p3.lastName || lastName;
            firstName = p3.firstName || firstName;
            middleName = p3.middleName || middleName;
        }
        if (!lastName && !firstName) {
            invalid.push({ row: i + 2, name: fio, err: psL('нет имени', 'no name') });
            return;
        }

        var errors = [];
        if (hcp === null) errors.push(psL('нет/неверный гандикап', 'missing/invalid handicap'));
        var rec = {
            row: i + 2,
            lastName: lastName,
            firstName: firstName,
            middleName: middleName || '',
            hcp: hcp,
            gender: gender,
            tee: tee,
            errors: errors,
            matchedUid: null
        };
        if (errors.length) invalid.push(rec);
        else valid.push(rec);
    });
    return { valid: valid, invalid: invalid, keys: keys };
}

function psExcelPick(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') {
        toast(psL('❌ Библиотека Excel не загрузилась (проверьте интернет)', '❌ Excel library not loaded (check internet)'), 'error');
        input.value = '';
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            var sheet = wb.Sheets[wb.SheetNames[0]];
            if (!sheet) throw new Error('no sheets');
            var json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            var parsed = psParseExcelRows(json);
            // Ищем соответствия пользователям (для uid и дозаполнения данных)
            psLoadUsers(function() {
                function tryMatch(r) {
                    if (!r.lastName && !r.firstName) return;
                    var probe = psNewPlayer();
                    probe.lastName = r.lastName || ''; probe.firstName = r.firstName || ''; probe.middleName = r.middleName || '';
                    var uid = psFindUidByFio(probe);
                    if (uid) {
                        r.matchedUid = uid;
                        var u = psState.users[uid] || {};
                        if ((r.hcp === null || r.hcp === undefined) && u.handicap !== undefined && u.handicap !== null && String(u.handicap).trim() !== '') r.hcp = parseFloat(u.handicap);
                        if (!r.tee && u.defaultTee) r.tee = u.defaultTee;
                        r.gender = r.gender || u.gender || 'men';
                    }
                }
                parsed.valid.forEach(tryMatch);
                // Строки без гандикапа: дозаполняем из профиля найденного игрока, иначе — в ошибки
                var stillBad = [];
                parsed.invalid.forEach(function(r) {
                    if (r.hcp === null && r.errors && r.errors.length && (r.lastName || r.firstName)) {
                        tryMatch(r);
                        if (r.hcp !== null && r.errors && r.errors.length) { r.errors = []; }
                        if (r.errors && !r.errors.length) { parsed.valid.push(r); return; }
                    }
                    stillBad.push({ row: r.row, name: [r.lastName, r.firstName, r.middleName].filter(function(w) { return String(w || '').trim(); }).join(' '), err: (r.errors || []).join(', ') || psL('нет имени', 'no name') });
                });
                parsed.invalid = stillBad;
                psState.excel = parsed;
                psRender();
            });
        } catch (err) {
            console.warn('Excel parse error:', err);
            toast(psL('⚠️ Не удалось прочитать файл: ' + (err && err.message || err), '⚠️ Cannot read the file: ' + (err && err.message || err)), 'error');
        }
        input.value = '';
    };
    reader.onerror = function() {
        toast(psL('⚠️ Ошибка чтения файла.', '⚠️ File read error.'), 'error');
        input.value = '';
    };
    reader.readAsArrayBuffer(file);
}

function psRenderExcelBox() {
    var box = psEl('ps-excel-box');
    if (!box) return;
    if (!psState.excel) { box.innerHTML = ''; return; }
    var data = psState.excel;
    var html = '<div style="background:var(--input);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">';
    html += '<h3 style="color:var(--gold);font-size:14px;margin:0 0 6px;"><i class="fas fa-file-excel"></i> ' + psL('Excel: строки из файла', 'Excel: rows from the file') + '</h3>';

    if (data.valid.length) {
        html += '<p style="font-size:12px;color:var(--muted);margin:4px 0 8px;">' + psL('Готово к добавлению', 'Ready to add') + ': <b>' + data.valid.length + '</b></p>';
        html += '<div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:rgba(255,255,255,.04);">' +
            '<th style="padding:8px;text-align:left;">#</th><th style="padding:8px;text-align:left;">' + psL('ФИО', 'Name') + '</th>' +
            '<th style="padding:8px;text-align:left;">HCP</th><th style="padding:8px;text-align:left;">' + psL('Пол', 'Gender') + '</th>' +
            '<th style="padding:8px;text-align:left;">ТИ</th><th style="padding:8px;text-align:left;"></th></tr></thead><tbody>';
        data.valid.forEach(function(r, i) {
            var fio = [r.lastName, r.firstName, r.middleName].filter(function(w) { return String(w || '').trim(); }).join(' ');
            var hcpTxt = r.hcp !== null ? psHcpFmt(r.hcp) : '<span style="color:var(--red);">—</span>';
            html += '<tr style="border-top:1px solid var(--border);">' +
                '<td style="padding:6px 8px;">' + (i + 1) + '</td>' +
                '<td style="padding:6px 8px;"><b>' + escapeHtml(fio) + '</b>' +
                (r.matchedUid ? ' <span class="hcp-chip" style="background:rgba(46,204,113,.15);color:#2ecc71;font-size:10px;"><i class="fas fa-circle-check"></i></span>' : '') + '</td>' +
                '<td style="padding:6px 8px;">' + hcpTxt + '</td>' +
                '<td style="padding:6px 8px;">' + (r.gender === 'women' ? psL('жен', 'F') : psL('муж', 'M')) + '</td>' +
                '<td style="padding:6px 8px;">' + (r.tee ? psTeeName(r.tee) : '—') + '</td>' +
                '<td style="padding:6px 8px;"><input type="checkbox" id="ps-exc-cb-' + i + '" checked style="width:17px;height:17px;cursor:pointer;"></td></tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">';
        html += '<button class="btn btn-g btn-sm" onclick="psExcelAdd()"><i class="fas fa-check"></i> ' + psL('Добавить выбранных', 'Add selected') + '</button>';
        html += '<button class="btn btn-ol btn-sm" onclick="psExcelCancel()">' + psL('Отмена', 'Cancel') + '</button>';
        html += '</div>';
    } else {
        html += '<p style="color:var(--muted);font-size:13px;margin:4px 0 0;"><i class="fas fa-triangle-exclamation" style="color:var(--red);"></i> ' + psL('Валидных строк нет — проверьте шаблон (нужны Фамилия/Имя и точный гандикап).', 'No valid rows — check the template (last/first name and exact handicap required).') + '</p>';
    }
    if (data.invalid && data.invalid.length) {
        html += '<p style="font-size:12px;color:var(--muted);margin:10px 0 4px;">' + psL('Строки с ошибками (пропущены)', 'Rows with errors (skipped)') + ': <b style="color:var(--red);">' + data.invalid.length + '</b></p>';
        html += '<div style="max-height:150px;overflow-y:auto;font-size:11px;color:var(--muted);">';
        data.invalid.forEach(function(r) {
            html += '<div style="padding:2px 0;">' + psL('Строка', 'Row') + ' ' + r.row + ': ' + escapeHtml(r.name || '') + ' — <span style="color:var(--red);">' + escapeHtml(r.err) + '</span></div>';
        });
        html += '</div>';
    }
    html += '</div>';
    box.innerHTML = html;
}

function psExcelAdd() {
    if (!psState.excel || !psState.excel.valid) return;
    var added = 0;
    psState.excel.valid.forEach(function(r, i) {
        var cb = psEl('ps-exc-cb-' + i);
        if (cb && !cb.checked) return;
        var p = psNewPlayer();
        p.lastName = r.lastName; p.firstName = r.firstName; p.middleName = r.middleName || '';
        p.gender = r.gender || 'men';
        p.tee = r.tee || psState.proto.tee || 'wh';
        p.hcp = r.hcp;
        p.source = 'excel';
        p.uidMatched = !!r.matchedUid;
        if (r.matchedUid) p.id = r.matchedUid;
        if (psAddPlayerToDraft(p, 'excel')) added++;
    });
    psState.excel = null;
    toast(psL('✅ Добавлено из Excel: ' + added, '✅ Added from Excel: ' + added), 'success');
    psRender();
}

function psExcelCancel() {
    psState.excel = null;
    var box = psEl('ps-excel-box');
    if (box) box.innerHTML = '';
    psRender();
}

// ----------------------------------------------------------
// 3. РАСПРЕДЕЛЕНИЕ НА ГРУППЫ
// ----------------------------------------------------------
function psRenderDistributeCard(proto) {
    var html = '<div class="card" style="margin-bottom:20px;">';
    html += '<h2 style="margin-top:0;"><i class="fas fa-users-gear"></i> ' + psL('3. Группы и стартовое расписание', '3. Groups & start schedule') + '</h2>';
    html += '<div id="ps-distribute-holder">' + psRenderDistributeInner(proto) + '</div>';
    html += '</div>';
    return html;
}

function psRenderDistributeInner(proto) {
    var players = proto ? proto.players : [];
    if (!players.length) {
        return '<p style="color:var(--muted);font-size:13px;margin:0;">' + psL('Добавьте участников в блоке 2 — здесь появятся настройки групп.', 'Add players in block 2 — group settings will appear here.') + '</p>';
    }

    var sizeOpts = '';
    for (var i = 1; i <= 4; i++) {
        sizeOpts += '<option value="' + i + '"' + (proto.size === i ? ' selected' : '') + '>' + i + '</option>';
    }

    var methods = [
        ['order', psL('В порядке списка', 'As listed')],
        ['alpha', psL('По алфавиту (Фамилия Имя)', 'Alphabetical (Last First)')],
        ['hcpAsc', psL('По гандикапу: сильнейшие в первых группах', 'By handicap: strongest first')],
        ['hcpDesc', psL('По гандикапу: слабейшие в первых группах', 'By handicap: weakest first')],
        ['hcpSnake', psL('По гандикапу «змейкой» (равные группы)', 'By handicap “snake” (balanced groups)')],
        ['random', psL('Случайно (перемешать)', 'Random (shuffle)')]
    ];
    var methodOpts = '';
    methods.forEach(function(m) {
        methodOpts += '<option value="' + m[0] + '"' + (proto.method === m[0] ? ' selected' : '') + '>' + m[1] + '</option>';
    });

    var schemes = [
        ['1', psL('Все группы — с 1-й лунки', 'All groups from hole 1')],
        ['1-10', psL('Шотган: с 1-й и 10-й лунок', 'Shotgun: holes 1 and 10')]
    ];
    var schemeOpts = '';
    schemes.forEach(function(s) {
        schemeOpts += '<option value="' + s[0] + '"' + (proto.scheme === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
    });

    var html = '<div class="form-row">';
    html += '<div class="form-group" style="flex:0 1 130px;"><label>' + psL('Игроков в группе', 'Players per group') + '</label>' +
        '<select class="form-input" onchange="psDistSize(this.value)">' + sizeOpts + '</select></div>';
    html += '<div class="form-group" style="flex:1 1 280px;"><label>' + psL('Способ распределения', 'Distribution method') + '</label>' +
        '<select class="form-input" onchange="psDistMethod(this.value)">' + methodOpts + '</select></div>';
    html += '<div class="form-group" style="flex:1 1 240px;"><label>' + psL('Схема старта', 'Start scheme') + '</label>' +
        '<select class="form-input" onchange="psDistScheme(this.value)">' + schemeOpts + '</select></div>';
    html += '</div>';

    html += '<div class="form-row form-row-3">';
    html += '<div class="form-group"><label>' + psL('Время старта первой группы', 'First group start time') + '</label>' +
        '<input type="time" class="form-input" value="' + (proto.startTime || '09:00') + '" onchange="psDistTime(this.value)"></div>';
    html += '<div class="form-group"><label>' + psL('Интервал между группами (мин)', 'Interval between groups (min)') + '</label>' +
        '<input type="number" class="form-input" min="3" max="30" step="1" value="' + (proto.interval || 8) + '" onchange="psDistInterval(this.value)"></div>';
    html += '<div class="form-group"><label>&nbsp;</label><button class="btn btn-g btn-block" onclick="psDistPreview()" style="min-height:40px;"><i class="fas fa-shuffle"></i> ' + psL('Показать раскладку', 'Show distribution') + '</button></div>';
    html += '</div>';

    // Результат раскладки
    html += '<div id="ps-groups-result" style="margin-top:8px;">' + psRenderGroupsResult() + '</div>';
    return html;
}

function psDistSize(v) { if (psState.proto) psState.proto.size = parseInt(v, 10) || 4; if (psState.groups.length) psState.groups = []; psRender(); }
function psDistMethod(v) { if (psState.proto) psState.proto.method = v; if (psState.groups.length) psState.groups = []; psRender(); }
function psDistScheme(v) { if (psState.proto) psState.proto.scheme = v; if (psState.groups.length) psState.groups = []; psRender(); }
function psDistTime(v) { if (psState.proto) psState.proto.startTime = v; if (psState.groups.length) psState.groups = []; psRender(); }
function psDistInterval(v) { if (psState.proto) psState.proto.interval = parseInt(v, 10) || 8; if (psState.groups.length) psState.groups = []; psRender(); }

// ── Логика раскладки ──
function psShuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
}

function psBuildGroups() {
    var proto = psState.proto;
    var players = proto.players.slice();
    if (!players.length) return [];
    var size = Math.max(1, Math.min(4, parseInt(proto.size, 10) || 4));

    function hcpVal(p) { return p.hcp === null || p.hcp === undefined || isNaN(p.hcp) ? 54 : parseFloat(p.hcp); }
    function alphaVal(p) { return psNorm(p.lastName || '') + ' ' + psNorm(p.firstName || '') + ' ' + psNorm(p.middleName || ''); }

    if (proto.method === 'alpha') {
        players.sort(function(a, b) { return alphaVal(a).localeCompare(alphaVal(b)); });
    } else if (proto.method === 'hcpAsc') {
        players.sort(function(a, b) { return hcpVal(a) - hcpVal(b) || alphaVal(a).localeCompare(alphaVal(b)); });
    } else if (proto.method === 'hcpDesc') {
        players.sort(function(a, b) { return hcpVal(b) - hcpVal(a) || alphaVal(a).localeCompare(alphaVal(b)); });
    } else if (proto.method === 'random') {
        psShuffle(players);
    }

    var groups = [];
    if (proto.method === 'hcpSnake') {
        // «Змейка»: сортируем по гандикапу и раскладываем по группам
        // «змейкой», чтобы в каждой группе была смесь сильных и слабых.
        players.sort(function(a, b) { return hcpVal(a) - hcpVal(b) || alphaVal(a).localeCompare(alphaVal(b)); });
        var groupsCnt = Math.max(1, Math.ceil(players.length / size));
        var buckets = [];
        for (var bi = 0; bi < groupsCnt; bi++) buckets.push([]);
        for (var pi = 0; pi < players.length; pi++) {
            var row = Math.floor(pi / groupsCnt);
            var col = pi % groupsCnt;
            var idx = (row % 2 === 0) ? col : (groupsCnt - 1 - col);
            buckets[idx].push(players[pi]);
        }
        groups = buckets.filter(function(b) { return b.length > 0; });
        return groups;
    }
    if (proto.method === 'order' || proto.method === 'alpha' || proto.method === 'hcpAsc' || proto.method === 'hcpDesc' || proto.method === 'random') {
        for (var g = 0; g < players.length; g += size) {
            groups.push(players.slice(g, g + size));
        }
        return groups;
    }
    // на всякий случай
    for (var g2 = 0; g2 < players.length; g2 += size) groups.push(players.slice(g2, g2 + size));
    return groups;
}

function psGroupSchedule(i, totalGroups) {
    var proto = psState.proto;
    var base = psStartBaseTs(proto);
    var intervalMs = Math.max(3, parseInt(proto.interval, 10) || 8) * 60000;

    if (proto.scheme === '1-10') {
        var hole = (i % 2 === 0) ? 1 : 10;
        var half = Math.round(intervalMs / 2);
        // 1-я лунка: 0, 2, 4… (шаг = интервал); 10-я: 1, 3, 5… (со сдвигом на половину интервала)
        var t = base + Math.floor(i / 2) * intervalMs + (i % 2) * half;
        return { startHole: hole, startTime: t };
    }
    return { startHole: parseInt(proto.baseHole || 1, 10) || 1, startTime: base + i * intervalMs };
}

function psStartBaseTs(proto) {
    var dateStr = proto.date || psTodayStr();
    var timeStr = proto.startTime || '09:00';
    var d = new Date(dateStr + 'T' + timeStr + ':00');
    if (isNaN(d.getTime())) {
        var parts = timeStr.split(':');
        var now = new Date();
        d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(parts[0]) || 9, parseInt(parts[1]) || 0, 0);
    }
    return d.getTime();
}

function psDistPreview() {
    if (!psState.proto || !psState.proto.players.length) return;
    var groups = psBuildGroups();
    psState.groups = groups.map(function(members, i) {
        var sch = psGroupSchedule(i, groups.length);
        return { members: members, startHole: sch.startHole, startTime: sch.startTime };
    });
    psRender();
}

function psMarkersForGroup(members) {
    // Каждый игрок маркирует следующего в списке группы (по кругу).
    var markers = [];
    if (members.length < 2) return markers;
    for (var i = 0; i < members.length; i++) {
        var target = members[(i + 1) % members.length];
        markers.push({ marker: members[i], target: target });
    }
    return markers;
}

function psRenderGroupsResult() {
    if (!psState.groups || !psState.groups.length) {
        return '';
    }
    var html = '<div style="margin-top:10px;border-top:1px dashed var(--border);padding-top:12px;">';
    html += '<h3 style="color:var(--gold);font-size:14px;margin:0 0 10px;"><i class="fas fa-list-check"></i> ' + psL('Раскладка', 'Distribution') + ': ' +
        psState.groups.length + ' ' + psL('групп', 'groups') + ' · ' + psState.proto.players.length + ' ' + psL('игроков', 'players') + '</h3>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;">';
    psState.groups.forEach(function(g, gi) {
        var timeStr = fmtTime(g.startTime);
        var dateStr = fmtDate(g.startTime);
        var holeTxt = g.startHole === 10 ? psL('10-я', '10th') : String(g.startHole);
        html += '<div class="card" style="padding:14px;margin:0;border:1px solid rgba(201,168,76,0.4);">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
        html += '<b style="color:var(--white);font-size:15px;"><i class="fas fa-flag"></i> ' + psL('Группа', 'Group') + ' ' + (gi + 1) + '</b>';
        html += '<span class="hcp-chip" style="background:var(--bg);border:1px solid var(--gold);color:var(--gold);font-size:11px;">' +
            '<i class="far fa-clock"></i> ' + timeStr + ' · ' + psL('лунка', 'hole') + ' ' + holeTxt + (fmtDate(g.startTime) !== '—' && dateStr !== fmtDate(new Date(psStartBaseTs(psState.proto))) ? ' · ' + dateStr : '') + '</span>';
        html += '</div>';

        // Состав
        g.members.forEach(function(p, mi) {
            var isMarker = false;
            var targetName = '';
            psMarkersForGroup(g.members).forEach(function(m) {
                if (m.marker === p) { isMarker = true; targetName = psFullRus(m.target); }
            });
            html += '<div style="padding:7px 10px;background:var(--input);border-radius:8px;margin-bottom:6px;border-left:3px solid ' + (mi === 0 ? 'var(--gold)' : 'var(--border)') + ';">';
            html += '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">';
            html += '<b style="font-size:13px;color:var(--white);">' + escapeHtml(psFullRus(p)) + '</b>';
            html += '<span style="font-size:11px;color:var(--muted);white-space:nowrap;">' + fmtTeePill(p.tee) + ' · HCP ' + psHcpFmt(p.hcp) + ' · ' + psL('полевой', 'course') + ' ' + fmtFieldHcp(psCalcFieldHcp(p)) + '</span>';
            html += '</div>';
            if (isMarker && targetName) {
                html += '<div style="font-size:11px;color:var(--blue);margin-top:3px;"><i class="fas fa-eye"></i> ' +
                    psL('маркирует: ', 'marks: ') + '<b>' + escapeHtml(targetName) + '</b></div>';
            }
            html += '</div>';
        });
        html += '</div>';
    });
    html += '</div>';

    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;">';
    html += '<button class="btn btn-g btn-block" onclick="psSaveProtocol()" style="min-height:46px;font-size:15px;"><i class="fas fa-save"></i> ' +
        psL('Сохранить: создать группы-раунды и QR-коды', 'Save: create group rounds & QR codes') + '</button>';
    html += '</div>';
    html += '<p style="color:var(--muted);font-size:11px;margin:8px 0 0;"><i class="fas fa-circle-info"></i> ' +
        psL('После сохранения будут созданы отдельные раунды для каждой группы (видны во вкладке «Раунды»), маркеры назначаются автоматически по кругу внутри группы. QR-карточки для печати откроются отдельной страницей.',
            'After saving, a separate round is created for every group (visible in the “Rounds” tab); markers are assigned automatically within each group. Printable QR cards open on a separate page.') + '</p>';
    html += '</div>';
    return html;
}

// ----------------------------------------------------------
// 4. СОХРАНЕНИЕ ПРОТОКОЛА
// ----------------------------------------------------------
function psSaveProtocol() {
    var proto = psState.proto;
    if (!proto) return;
    if (!proto.tournamentId) {
        toast(psL('⚠️ Сначала выберите турнир (блок 1)', '⚠️ Pick a tournament first (block 1)'), 'error');
        return;
    }
    if (!proto.players.length) {
        toast(psL('⚠️ Добавьте участников (блок 2)', '⚠️ Add players (block 2)'), 'error');
        return;
    }
    if (psState.busy) return;

    var groups = psState.groups && psState.groups.length ? psState.groups : null;
    if (!groups) {
        // пересчитываем по текущим настройкам
        var built = psBuildGroups();
        groups = built.map(function(members, i) {
            var sch = psGroupSchedule(i, built.length);
            return { members: members, startHole: sch.startHole, startTime: sch.startTime };
        });
        psState.groups = groups;
    }

    var format = psResolvedFormat();
    var totalPlayers = 0;
    groups.forEach(function(g) { totalPlayers += g.members.length; });

    var alreadySaved = !!psState.savedId;
    var msg = psL(
        'Создать ' + groups.length + ' групп-раундов для ' + totalPlayers + ' игроков?\n\n' +
        'Будут созданы раунды (формат: ' + format + '). После этого каждый игрок получит QR-код на свою карточку.' +
        (alreadySaved ? '\n\n⚠️ Протокол уже сохранён ранее — будет создан ещё один, новый.' : ''),
        'Create ' + groups.length + ' group rounds for ' + totalPlayers + ' players?\n\n' +
        'Rounds will be created (format: ' + format + '). Every player will then get a QR code to their scorecard.' +
        (alreadySaved ? '\n\n⚠️ A protocol was already saved — one more, new copy will be created.' : '')
    );
    if (!confirm(msg)) return;

    psState.busy = true;

    var pid = 'pr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    var roundsRef = db.ref('rounds');
    var groupStore = {};
    var usedKeys = {};

    // Стабильный ключ игрока в раунде: реальный uid, если игрок найден в базе,
    // иначе сгенерированный гостевой ключ. Ключ един для раунда и протокола.
    function ensureKey(p) {
        if (p.id && !usedKeys[p.id]) {
            usedKeys[p.id] = true;
            return p.id;
        }
        var k = 'gst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
        while (usedKeys[k]) { k = 'gst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8); }
        usedKeys[k] = true;
        return k;
    }

    var steps = groups.map(function(g, gi) {
        var roundPlayers = {};
        var participants = [];
        var markerAssignments = {};

        var groupPlayers = g.members.map(function(p) {
            var key = ensureKey(p);
            var fieldHcp = psCalcFieldHcp(p);
            roundPlayers[key] = {
                name: psNameForRound(p) || 'Player',
                firstName: p.firstName || '',
                middleName: p.middleName || '',
                lastName: p.lastName || '',
                gender: p.gender || 'men',
                tee: p.tee || 'wh',
                exactHcp: p.hcp === null || p.hcp === undefined ? 0 : parseFloat(p.hcp),
                fieldHcp: fieldHcp,
                scores: {},
                markerScores: {},
                submitted: {},
                markerSubmitted: {},
                verified: {}
            };
            participants.push(key);
            return {
                id: key,
                lastName: p.lastName || '',
                firstName: p.firstName || '',
                middleName: p.middleName || '',
                gender: p.gender || 'men',
                tee: p.tee || 'wh',
                exactHcp: p.hcp === null || p.hcp === undefined ? 0 : parseFloat(p.hcp),
                fieldHcp: fieldHcp
            };
        });

        // Маркеры: каждый игрок маркирует следующего в группе (по кругу)
        var groupMarkers = [];
        if (participants.length >= 2) {
            for (var m = 0; m < participants.length; m++) {
                var markerKey = participants[m];
                var targetKey = participants[(m + 1) % participants.length];
                roundPlayers[targetKey].markedBy = markerKey;
                markerAssignments[markerKey] = {
                    targetId: targetKey,
                    targetName: roundPlayers[targetKey].name || ''
                };
                groupMarkers.push({
                    markerId: markerKey,
                    markerName: roundPlayers[markerKey].name || '',
                    targetId: targetKey,
                    targetName: roundPlayers[targetKey].name || ''
                });
            }
        }

        var roundData = {
            mode: 'group',
            tee: g.members[0].tee || 'wh',
            format: format,
            startHole: g.startHole || 1,
            startTime: g.startTime,
            holeRange: '1-18', // 18 лунок (порядок — со стартовой лунки)
            players: roundPlayers,
            markerAssignments: markerAssignments,
            participantsList: participants,
            status: 'active',
            tournamentId: proto.tournamentId,
            protocolId: pid,
            protocolName: proto.name || '',
            groupNo: gi + 1,
            createdAt: Date.now(),
            createdBy: (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid : 'admin',
            accessKey: 'protocol_' + pid + '_' + gi
        };

        var pushPromise = roundsRef.push(roundData).then(function(ref) {
            groupStore['g' + (gi + 1)] = {
                roundId: ref.key,
                groupNo: gi + 1,
                startHole: g.startHole || 1,
                startTime: g.startTime,
                format: format,
                players: groupPlayers,
                markers: groupMarkers
            };
        });
        return pushPromise;
    });

    Promise.all(steps).then(function() {
        var protocolDoc = {
            name: proto.name || '',
            tournamentId: proto.tournamentId,
            tournamentName: proto.tournamentName || '',
            date: proto.date || '',
            format: format,
            scheme: proto.scheme || '1',
            size: parseInt(proto.size, 10) || 4,
            method: proto.method || 'hcpSnake',
            interval: parseInt(proto.interval, 10) || 8,
            startTime: proto.startTime || '09:00',
            playersCount: totalPlayers,
            groupsCount: groups.length,
            status: 'ready',
            groups: groupStore,
            createdAt: Date.now(),
            createdBy: (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid : 'admin'
        };
        return db.ref('protocols/' + pid).set(protocolDoc);
    }).then(function() {
        psState.savedId = pid;
        psState.busy = false;
        psState.groups = [];
        psRender();
        toast(psL('🎉 Протокол сохранён: ' + groups.length + ' групп, ' + totalPlayers + ' игроков', '🎉 Protocol saved: ' + groups.length + ' groups, ' + totalPlayers + ' players'), 'success');
        if (typeof vib === 'function') vib([60, 40, 60]);
    }).catch(function(err) {
        psState.busy = false;
        console.error('[start] save error', err);
        toast(psL('⚠️ Ошибка сохранения: ' + (err && err.message || err), '⚠️ Save error: ' + (err && err.message || err)), 'error');
    });
}

// ----------------------------------------------------------
// 5. РЕЗУЛЬТАТ + СПИСОК СОХРАНЁННЫХ ПРОТОКОЛОВ
// ----------------------------------------------------------
function psRenderSavedCard() {
    var html = '<div class="card" style="margin-bottom:20px;">';
    html += '<h2 style="margin-top:0;"><i class="fas fa-qrcode"></i> ' + psL('4. QR-коды и сохранённые протоколы', '4. QR codes & saved protocols') + '</h2>';
    html += '<div id="ps-saved-content">' + psL('Загрузка…', 'Loading…') + '</div>';
    html += '</div>';
    return html;
}

var psSavedBound = false;

function psBindSavedList() {
    if (typeof db === 'undefined' || !db) return;
    if (psSavedBound) return;
    psSavedBound = true;
    db.ref('protocols').orderByChild('createdAt').on('value', function(sn) {
        psRenderSavedListContent(sn.val() || {});
    });
}

function psRenderSavedListContent(data) {
    var box = psEl('ps-saved-content');
    if (!box) return;
    var entries = Object.keys(data).map(function(id) { return { id: id, d: data[id] || {} }; });
    entries.sort(function(a, b) { return (b.d.createdAt || 0) - (a.d.createdAt || 0); });

    var html = '';
    if (psState.savedId) {
        html += '<div style="background:rgba(46,204,113,.08);border:1px solid rgba(46,204,113,.45);border-radius:10px;padding:14px;margin-bottom:16px;">';
        var savedProto = null;
        entries.forEach(function(e) { if (e.id === psState.savedId) savedProto = e.d; });
        html += '<b style="color:#2ecc71;font-size:15px;"><i class="fas fa-circle-check"></i> ' + psL('Протокол сохранён', 'Protocol saved') + '</b>';
        if (savedProto) {
            html += '<div style="font-size:13px;color:var(--white);margin:6px 0;">' + escapeHtml(savedProto.name || '') + ' · ' + (savedProto.groupsCount || 0) + ' ' + psL('групп', 'groups') + ' · ' + (savedProto.playersCount || 0) + ' ' + psL('игроков', 'players') + '</div>';
        }
        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">';
        html += '<button class="btn btn-g" onclick="window.open(\'qr-start.html?p=' + psState.savedId + '\',\'_blank\')"><i class="fas fa-print"></i> ' + psL('Открыть QR-листы для печати', 'Open printable QR cards') + '</button>';
        html += '</div>';
        html += '<p style="font-size:11px;color:var(--muted);margin:10px 0 0;">' + psL('Каждый игрок сканирует QR своей карточки и сразу попадает в счётную карточку своего раунда. Также на карточке видно, кого он маркирует (второй QR).', 'Each player scans the QR on their own card and lands directly on their scorecard. The card also shows whom they mark (second QR).') + '</p>';
        html += '</div>';
    }

    if (!entries.length) {
        html += '<p style="color:var(--muted);font-size:13px;margin:0;"><i class="fas fa-circle-info"></i> ' +
            psL('Сохранённых протоколов нет. Соберите список в блоках 1–3 и нажмите «Сохранить».', 'No saved protocols yet. Build the list in blocks 1–3 and press “Save”.') + '</p>';
        box.innerHTML = html;
        return;
    }

    html += '<div style="display:flex;flex-direction:column;gap:10px;">';
    entries.forEach(function(e) {
        var d = e.d;
        var groupRows = d.groups ? Object.keys(d.groups) : [];
        html += '<div class="list-item" style="padding:14px;flex-wrap:wrap;gap:10px;align-items:center;">';
        html += '<div style="flex:1;min-width:220px;">';
        html += '<b style="color:var(--white);">' + escapeHtml(d.name || '—') + '</b>';
        html += '<div style="font-size:12px;color:var(--muted);margin-top:4px;">';
        html += fmtDate(d.createdAt) + ' · ' + psL('групп', 'groups') + ': ' + (d.groupsCount || groupRows.length) + ' · ' + psL('игроков', 'players') + ': ' + (d.playersCount || 0);
        if (d.tournamentName) html += ' · 🏆 ' + escapeHtml(d.tournamentName);
        if (d.format) html += ' · ' + escapeHtml(d.format);
        html += '</div></div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
        html += '<button class="btn btn-g btn-sm" onclick="window.open(\'qr-start.html?p=' + e.id + '\',\'_blank\')"><i class="fas fa-print"></i> ' + psL('QR / печать', 'QR / print') + '</button>';
        html += '<button class="btn btn-og btn-sm" onclick="psCopyProtocolLink(\'' + e.id + '\')"><i class="fas fa-link"></i> ' + psL('Ссылка', 'Link') + '</button>';
        html += '<button class="btn btn-r btn-sm" onclick="psDeleteProtocol(\'' + e.id + '\')"><i class="fas fa-trash"></i> ' + psL('Удалить', 'Delete') + '</button>';
        html += '</div></div>';
    });
    html += '</div>';
    box.innerHTML = html;
}

function psCopyProtocolLink(pid) {
    var url = baseUrl() + 'qr-start.html?p=' + encodeURIComponent(pid);
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function() {
                toast(psL('✅ Ссылка скопирована', '✅ Link copied'), 'success');
            }).catch(function() {
                window.prompt(psL('Скопируйте ссылку:', 'Copy the link:'), url);
            });
        } else {
            window.prompt(psL('Скопируйте ссылку:', 'Copy the link:'), url);
        }
    } catch (e) {
        window.prompt(psL('Скопируйте ссылку:', 'Copy the link:'), url);
    }
}

function psDeleteProtocol(pid) {
    if (!pid) return;
    if (!confirm(psL('Удалить протокол и все созданные им раунды-группы?\n\nВнимание: вместе с раундами будут удалены введённые в них результаты!', 'Delete this protocol and all group rounds created by it?\n\nNote: scores entered in those rounds will be deleted too!'))) return;
    if (typeof db === 'undefined' || !db) return;
    db.ref('protocols/' + pid).once('value').then(function(sn) {
        var d = sn.val() || {};
        var updates = {};
        updates['protocols/' + pid] = null;
        var groups = d.groups || {};
        Object.keys(groups).forEach(function(gk) {
            if (groups[gk] && groups[gk].roundId) updates['rounds/' + groups[gk].roundId] = null;
        });
        return db.ref().update(updates);
    }).then(function() {
        toast(psL('🗑️ Протокол и его раунды удалены', '🗑️ Protocol and its rounds deleted'), 'success');
        if (psState.savedId === pid) psState.savedId = null;
    }).catch(function(err) {
        toast(psL('⚠️ Ошибка удаления: ' + (err && err.message || err), '⚠️ Delete error: ' + (err && err.message || err)), 'error');
    });
}

// ----------------------------------------------------------
// ГЛОБАЛЬНЫЙ ХУК: вызов из switchTab() админки
// ----------------------------------------------------------
function psSwitchTo() {
    if (typeof psOpen === 'function') {
        try {
            psOpen();
            psBindSavedList();
        } catch (e) { console.error('[start] psOpen error', e); }
    }
}
