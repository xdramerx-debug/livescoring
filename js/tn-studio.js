// Вкладка админки «Турниры · создание».
// Пишет в tournaments/<id>, откуда tournaments.html читает те же записи.
(function (root) {
    var C = root.TnStudioCore;
    var ui = {
        view: 'list', id: null, tab: 'rounds', dayId: null, dayTab: 'score',
        divisionId: null, playerKey: null, from: '', to: '', sort: 'desc', q: '',
        editing: false, importReport: null, bound: false, tournaments: {}, users: {}, pending: false
    };

    function tr(ru, en) { return root.currentLang === 'en' ? en : ru; }
    function esc(v) { return typeof root.escapeHtml === 'function' ? root.escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v); }
    function toast(msg, type) { if (typeof root.toast === 'function') root.toast(msg, type || 'info'); }
    function db() { return root.db; }
    function uid() {
        try {
            if (root.currentUser && root.currentUser.uid) return root.currentUser.uid;
            if (root.firebase && root.firebase.auth && root.firebase.auth().currentUser) return root.firebase.auth().currentUser.uid;
        } catch (e) { /* нет сессии */ }
        return null;
    }
    function course() {
        return {
            par: function (h) { return typeof root.holePar === 'function' ? root.holePar(h) : 4; },
            dist: function (h, tee) { return typeof root.holeDist === 'function' ? root.holeDist(h, tee) : 0; },
            si: function (h) { return typeof root.holeHcp === 'function' ? root.holeHcp(h) : h; },
            rating: function (gender, tee) {
                var g = gender === 'women' ? 'women' : 'men';
                var table = root.COURSE_RATINGS && root.COURSE_RATINGS[g];
                return table && table[tee] ? table[tee] : null;
            },
            teeName: function (tee) { return (root.TEES && root.TEES[tee]) || tee || '—'; },
            field: function (hi, tee, gender) {
                if (typeof root.getFieldHcp === 'function' && hi != null) return root.getFieldHcp(hi, tee, gender === 'women' ? 'women' : 'men');
                return C.courseHandicap(hi, this.rating(gender, tee), 72);
            }
        };
    }
    function t() { return ui.id && ui.tournaments[ui.id] ? ui.tournaments[ui.id] : null; }
    function roster(item) { return C.listOf((item || t() || {}).registeredPlayers); }
    function live(p) {
        var u = p && p.uid && ui.users[p.uid];
        if (!u) return p || {};
        return {
            _key: p._key, uid: p.uid,
            name: u.name || p.name,
            handicap: u.handicap == null ? p.handicap : u.handicap,
            gender: u.gender || p.gender,
            pair: p.pair || ''
        };
    }
    function people() {
        return roster(t()).map(live).sort(function (a, b) { return C.normalizeName(a.name).localeCompare(C.normalizeName(b.name), 'ru'); });
    }
    function days() { return C.listOf((t() || {}).days).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); }); }
    function teeOf(p) {
        var id = C.divisionOf(p._key, t().divisions);
        var d = id && t().divisions[id];
        return (d && d.tee) || 'wh';
    }
    function divOf(p) {
        var id = C.divisionOf(p._key, t().divisions);
        return id && t().divisions ? t().divisions[id] : null;
    }
    function built(p, dayId) {
        var item = t();
        var tee = teeOf(p);
        var ch = course().field(p.handicap, tee, p.gender);
        var scores = item.scores && item.scores[dayId] ? item.scores[dayId][p._key] : null;
        return { card: C.playerCard(scores, course(), tee, ch || 0), ch: ch, tee: tee, format: C.formatId(item, divOf(p)) };
    }
    function fmtName(id) {
        if (id === 'fourball') return tr('Форбол', 'Four-ball');
        if (id === 'stroke') return tr('На счёт ударов', 'Stroke play');
        return tr('Стейблфорд', 'Stableford');
    }
    function resultOf(format, card) {
        if (format === 'stableford') return card.all.ptsNet.total == null ? '—' : String(card.all.ptsNet.total);
        return card.all.gross.total == null ? '—' : String(card.all.gross.total);
    }
    function summaryRows(dayId) {
        var item = t(), list = people();
        if (!item.fourBall) {
            return list.map(function (p) {
                var b = built(p, dayId);
                return { name: p.name, key: p._key, format: b.format, result: resultOf(b.format, b.card) };
            });
        }
        var used = {}, rows = [];
        list.forEach(function (p) {
            if (used[p._key]) return;
            var pair = String(p.pair || '').trim();
            var mates = pair ? list.filter(function (x) { return String(x.pair || '').trim() === pair; }) : [p];
            mates.forEach(function (x) { used[x._key] = true; });
            if (mates.length < 2) {
                var one = built(p, dayId);
                rows.push({ name: p.name, key: p._key, format: 'fourball', result: resultOf('stroke', one.card) });
                return;
            }
            var best = C.betterBall(mates.map(function (x) { return built(x, dayId).card; }));
            rows.push({ name: mates.map(function (x) { return x.name; }).join(' / '), key: mates[0]._key, format: 'fourball', result: best.gross == null ? '—' : String(best.gross) });
        });
        return rows;
    }
    function busy() {
        var el = document.activeElement;
        var box = document.getElementById('tn-studio-root');
        if (!el || !box || !box.contains(el)) return false;
        if (el.getAttribute && el.getAttribute('data-act') === 'query') return false;
        return el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA';
    }
    function render() {
        var rootEl = document.getElementById('tn-studio-root');
        if (!rootEl) return;
        if (busy()) { ui.pending = true; return; }
        ui.pending = false;
        if (ui.view === 'create') rootEl.innerHTML = createHtml();
        else if (ui.view === 'player') rootEl.innerHTML = playerHtml();
        else if (ui.view === 'day') rootEl.innerHTML = dayHtml();
        else if (ui.view === 'card') rootEl.innerHTML = cardHtml();
        else rootEl.innerHTML = listHtml();
    }
    function go(view) { ui.view = view; render(); }

    function listHtml() {
        var rows = Object.keys(ui.tournaments).map(function (id) {
            var item = ui.tournaments[id] || {};
            item._key = id;
            return item;
        }).filter(function (item) { return item.fromStudio; });
        if (ui.from || ui.to) rows = rows.filter(function (item) { return C.overlaps(item.date, item.endDate || item.date, ui.from, ui.to); });
        rows.sort(function (a, b) {
            var d = String(a.date || '').localeCompare(String(b.date || ''));
            return ui.sort === 'asc' ? d : -d;
        });
        var body = rows.map(function (item) {
            return '<tr><td><button type="button" class="tns-link" data-act="open" data-id="' + esc(item._key) + '">' + esc(item.name || '—') + '</button></td><td>' +
                esc(C.formatRange(item.date, item.endDate)) + '</td><td>' + esc(C.CLUB) + '</td></tr>';
        }).join('');
        return '<div class="tns"><div class="tns-head"><div><h2><i class="fas fa-trophy"></i> ' + esc(tr('Турниры', 'Tournaments')) + '</h2><p class="tns-sub">' +
            esc(tr('Новое создание. На сайт попадает только то, что открыто в карточке.', 'New creation flow. Only a published card appears on the site.')) +
            '</p></div><button type="button" class="btn btn-g" data-act="create"><i class="fas fa-plus"></i> ' + esc(tr('Добавить турнир', 'Add tournament')) + '</button></div>' +
            '<div class="tns-bar"><div class="form-group"><label>' + esc(tr('От', 'From')) + '</label><input class="form-input" type="date" data-field="from" value="' + esc(ui.from) + '"></div>' +
            '<div class="form-group"><label>' + esc(tr('До', 'To')) + '</label><input class="form-input" type="date" data-field="to" value="' + esc(ui.to) + '"></div>' +
            '<button type="button" class="btn btn-og" data-act="filter"><i class="fas fa-filter"></i> ' + esc(tr('Фильтр', 'Filter')) + '</button>' +
            '<button type="button" class="btn btn-og" data-act="clear">' + esc(tr('Очистить', 'Clear')) + '</button></div>' +
            '<div class="tns-table-wrap"><table class="tns-table"><thead><tr><th>' + esc(tr('Название', 'Name')) + '</th><th><button type="button" class="tns-sort" data-act="sort">' +
            esc(tr('Даты проведения', 'Dates')) + (ui.sort === 'desc' ? ' ↓' : ' ↑') + '</button></th><th>' + esc(tr('Клубы', 'Club')) + '</th></tr></thead><tbody>' +
            (body || '<tr><td colspan="3" class="tns-note">' + esc(tr('Турниров нет.', 'No tournaments.')) + '</td></tr>') + '</tbody></table></div></div>';
    }
    function createHtml() {
        return '<div class="tns"><button type="button" class="btn btn-og btn-sm" data-act="back-list">' + esc(tr('Назад', 'Back')) + '</button><h2>' + esc(tr('Создание турнира', 'Create tournament')) + '</h2>' +
            '<form id="tns-create" class="tns-grid"><div class="tns-field"><label>' + esc(tr('Название', 'Name')) + ' *</label><input class="form-input" name="name" required maxlength="120"></div>' +
            '<div class="tns-field"><label>' + esc(tr('Дата начала', 'Start date')) + ' *</label><input class="form-input" type="date" name="start" required></div>' +
            '<div class="tns-field"><label>' + esc(tr('Дата завершения', 'End date')) + ' *</label><input class="form-input" type="date" name="end" required></div>' +
            '<label class="tns-check"><input type="checkbox" name="fourball"> ' + esc(tr('Формат форбол на весь турнир', 'Four-ball for the whole tournament')) + '</label></form>' +
            '<div><button type="button" class="btn btn-g" data-act="save-create">' + esc(tr('Добавить', 'Add')) + '</button></div></div>';
    }
    function headHtml(item) {
        var hidden = item.publicAccess === false;
        return '<div class="tns-head"><div><button type="button" class="btn btn-og btn-sm" data-act="back-list">' + esc(tr('Назад', 'Back')) + '</button><h2>' + esc(item.name || '') + '</h2><p class="tns-sub">' +
            esc(C.formatRange(item.date, item.endDate)) + '</p></div><div class="tns-actions"><span class="tns-chip ' + (hidden ? 'off' : 'on') + '">' +
            esc(hidden ? tr('Скрыт с сайта', 'Hidden from the site') : tr('На сайте', 'On the site')) + '</span>' +
            '<button type="button" class="btn btn-og btn-sm" data-act="edit">' + esc(tr('Изменить', 'Edit')) + '</button></div></div>' +
            (ui.editing ? editHtml(item) : '') +
            '<div class="tns-tabs"><button type="button" class="tns-tab' + (ui.tab === 'rounds' ? ' active' : '') + '" data-act="tab" data-id="rounds">' + esc(tr('Раунды', 'Rounds')) + '</button>' +
            '<button type="button" class="tns-tab' + (ui.tab === 'groups' ? ' active' : '') + '" data-act="tab" data-id="groups">' + esc(tr('Группы', 'Groups')) + '</button>' +
            '<button type="button" class="tns-tab' + (ui.tab === 'players' ? ' active' : '') + '" data-act="tab" data-id="players">' + esc(tr('Участники', 'Players')) + '</button>' +
            '<button type="button" class="tns-tab' + (ui.tab === 'info' ? ' active' : '') + '" data-act="tab" data-id="info">' + esc(tr('Общая информация', 'General')) + '</button></div>';
    }
    function editHtml(item) {
        return '<form id="tns-edit" class="tns-grid"><div class="tns-field"><label>' + esc(tr('Название', 'Name')) + '</label><input class="form-input" name="name" required maxlength="120" value="' + esc(item.name || '') + '"></div>' +
            '<div class="tns-field"><label>' + esc(tr('Дата начала', 'Start')) + '</label><input class="form-input" type="date" name="start" required value="' + esc(item.date || '') + '"></div>' +
            '<div class="tns-field"><label>' + esc(tr('Дата завершения', 'End')) + '</label><input class="form-input" type="date" name="end" required value="' + esc(item.endDate || item.date || '') + '"></div>' +
            '<label class="tns-check"><input type="checkbox" name="fourball"' + (item.fourBall ? ' checked' : '') + '> ' + esc(tr('Форбол на весь турнир', 'Four-ball for the whole event')) + '</label>' +
            '<div><button type="button" class="btn btn-g btn-sm" data-act="save-edit">' + esc(tr('Сохранить', 'Save')) + '</button></div></form>';
    }
    function cardHtml() {
        var item = t();
        if (!item) return '<p class="tns-note">' + esc(tr('Турнир не найден.', 'Tournament not found.')) + '</p>';
        var body = ui.tab === 'groups' ? groupsHtml(item) : ui.tab === 'players' ? playersHtml(item) : ui.tab === 'info' ? infoHtml(item) : roundsHtml(item);
        return '<div class="tns">' + headHtml(item) + body + '</div>';
    }
    function roundsHtml(item) {
        var list = days();
        var rows = list.map(function (d) {
            return '<tr><td><button type="button" class="tns-link" data-act="day" data-id="' + esc(d._key) + '">' + esc(C.formatIso(d.date)) + '</button></td><td><button type="button" class="btn btn-r btn-sm" data-act="del-day" data-id="' + esc(d._key) + '">' + esc(tr('Удалить', 'Delete')) + '</button></td></tr>';
        }).join('');
        return '<div class="tns-bar"><div class="form-group"><label>' + esc(tr('Дата дня', 'Day date')) + '</label><input class="form-input" type="date" id="tns-day" value="' + esc(item.date || '') + '"></div>' +
            '<button type="button" class="btn btn-g btn-sm" data-act="add-day">' + esc(tr('Добавить', 'Add')) + '</button></div>' +
            '<p class="tns-note">' + esc(tr('Дата открывает результаты этого дня. Поле всегда Пестово.', 'The date opens that day’s results. The course is always Pestovo.')) + '</p>' +
            '<div class="tns-table-wrap"><table class="tns-table"><thead><tr><th>' + esc(tr('Дата проведения', 'Date')) + '</th><th></th></tr></thead><tbody>' +
            (rows || '<tr><td colspan="2" class="tns-note">' + esc(tr('Дней пока нет.', 'No days yet.')) + '</td></tr>') + '</tbody></table></div>';
    }
    function infoHtml(item) {
        var on = item.publicAccess !== false;
        var reg = item.registration && item.registration.enabled === true;
        return '<div class="tns-rowline"><span>' + esc(tr('Доступен в открытом доступе', 'Public on the site')) + '</span><b>' + esc(on ? tr('да', 'yes') : tr('нет', 'no')) + '</b></div>' +
            '<p class="tns-note">' + esc(tr('«Да» сразу показывает турнир, счёт и карточку на странице «Турниры». «Нет» оставляет его только здесь.', 'Yes publishes the tournament, score and card on the Tournaments page. No keeps it in admin only.')) + '</p>' +
            '<button type="button" class="btn ' + (on ? 'btn-og' : 'btn-g') + '" data-act="public">' + esc(on ? tr('Скрыть с сайта', 'Hide from the site') : tr('Открыть на сайте', 'Publish on the site')) + '</button>' +
            '<div class="tns-rowline"><span>' + esc(tr('Приём заявок', 'Applications')) + '</span><b>' + esc(reg ? tr('открыт', 'open') : tr('закрыт', 'closed')) + '</b></div>' +
            '<p class="tns-note">' + esc(tr('Человек подаёт заявку сам на странице «Турниры». В состав он попадает только после подтверждения здесь. Форма видна, когда турнир открыт на сайте.', 'A person applies on the Tournaments page. They join the roster only after you confirm them here. The form is visible once the tournament is published.')) + '</p>' +
            '<button type="button" class="btn ' + (reg ? 'btn-og' : 'btn-g') + '" data-act="reg">' + esc(reg ? tr('Закрыть приём заявок', 'Close applications') : tr('Открыть приём заявок', 'Open applications')) + '</button>' +
            '<div><button type="button" class="btn btn-r btn-sm" data-act="del-tn">' + esc(tr('Удалить турнир', 'Delete tournament')) + '</button></div>';
    }
    function groupsHtml(item) {
        var list = C.listOf(item.divisions);
        var cards = list.map(function (d) { return divisionCard(item, d); }).join('');
        return '<form id="tns-div" class="tns-grid"><div class="tns-field"><label>' + esc(tr('Название зачёта', 'Division name')) + '</label><input class="form-input" name="name" required maxlength="80"></div>' +
            '<div class="tns-field"><label>' + esc(tr('Пол', 'Gender')) + '</label><select class="form-input" name="gender"><option value="men">' + esc(tr('Мужчины', 'Men')) + '</option><option value="women">' + esc(tr('Женщины', 'Women')) + '</option></select></div>' +
            '<div class="tns-field"><label>HCP ' + esc(tr('от', 'from')) + '</label><input class="form-input" name="hcpFrom" placeholder="+1,0"></div>' +
            '<div class="tns-field"><label>HCP ' + esc(tr('до', 'to')) + '</label><input class="form-input" name="hcpTo" placeholder="14,0"></div>' +
            '<div class="tns-field"><label>' + esc(tr('Возраст', 'Age')) + '</label><input class="form-input" name="age" placeholder="19-"></div>' +
            teeSelect('wh') + formatSelect(item, 'stableford') +
            '<div><button type="button" class="btn btn-g btn-sm" data-act="add-div">' + esc(tr('Добавить зачёт', 'Add division')) + '</button></div></form>' +
            '<p class="tns-note">' + esc(tr('Игроков в зачёт кладёт админ вручную. Диапазон HCP и возраст — подпись, не автофильтр.', 'The admin assigns players. HCP and age are labels, not an automatic filter.')) + '</p>' + cards;
    }
    function teeSelect(value) {
        var tees = root.TEES || { bk: 'Чёрный', bl: 'Синий', wh: 'Белый', rd: 'Красный' };
        var html = '<div class="tns-field"><label>' + esc(tr('Ти', 'Tee')) + '</label><select class="form-input" name="tee">';
        Object.keys(tees).forEach(function (code) {
            html += '<option value="' + esc(code) + '"' + (value === code ? ' selected' : '') + '>' + esc(tees[code]) + '</option>';
        });
        return html + '</select></div>';
    }
    function formatSelect(item, value) {
        if (item.fourBall) return '<div class="tns-field"><label>' + esc(tr('Формат', 'Format')) + '</label><input class="form-input" value="' + esc(tr('Форбол', 'Four-ball')) + '" disabled></div>';
        return '<div class="tns-field"><label>' + esc(tr('Формат', 'Format')) + '</label><select class="form-input" name="format"><option value="stableford"' + (value !== 'stroke' ? ' selected' : '') + '>' + esc(tr('Стейблфорд', 'Stableford')) + '</option><option value="stroke"' + (value === 'stroke' ? ' selected' : '') + '>' + esc(tr('На счёт ударов', 'Stroke play')) + '</option></select></div>';
    }
    function divisionCard(item, d) {
        var members = people().filter(function (p) { return C.divisionOf(p._key, item.divisions) === d._key; });
        var options = people().filter(function (p) { return C.divisionOf(p._key, item.divisions) !== d._key; }).map(function (p) {
            return '<option value="' + esc(p._key) + '">' + esc(p.name) + '</option>';
        }).join('');
        return '<article class="tns-card"><h3>' + esc(d.name || '—') + '</h3><p class="tns-note">' + esc(caption(item, d)) + '</p>' +
            '<div class="tns-bar"><select class="form-input" data-div-add="' + esc(d._key) + '"><option value="">' + esc(tr('Игрок из состава', 'Player from the roster')) + '</option>' + options + '</select>' +
            '<button type="button" class="btn btn-g btn-sm" data-act="assign" data-id="' + esc(d._key) + '">' + esc(tr('В зачёт', 'Assign')) + '</button>' +
            '<button type="button" class="btn btn-r btn-sm" data-act="del-div" data-id="' + esc(d._key) + '">' + esc(tr('Удалить зачёт', 'Delete division')) + '</button></div>' +
            (members.length ? '<ul class="tns-note">' + members.map(function (p) {
                return '<li>' + esc(p.name) + ' <button type="button" class="tns-link" data-act="unassign" data-id="' + esc(d._key) + '" data-player="' + esc(p._key) + '">' + esc(tr('убрать', 'remove')) + '</button></li>';
            }).join('') + '</ul>' : '<p class="tns-note">' + esc(tr('Пока пусто.', 'Empty.')) + '</p>') + '</article>';
    }
    function caption(item, d) {
        var gender = d.gender === 'women' ? tr('жен.', 'women') : tr('муж.', 'men');
        return tr('Пол', 'Gender') + ': ' + gender + ', HCP: ' + C.hcpLabel(d.hcpFrom, d.hcpTo) + ', ' + tr('возраст', 'age') + ': ' + (d.ageLabel || '—') + '. ' + tr('Ти', 'Tee') + ': ' + course().teeName(d.tee || 'wh') + ', ' + fmtName(C.formatId(item, d));
    }
    function playersHtml(item) {
        var q = C.normalizeName(ui.q);
        var list = people().filter(function (p) { return !q || C.normalizeName(p.name).indexOf(q) !== -1; });
        var men = people().filter(function (p) { return p.gender !== 'women'; }).length;
        var women = people().length - men;
        var free = C.userList(ui.users).filter(function (u) { return !roster(item).some(function (p) { return p.uid === u.id; }); });
        var opts = free.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>'; }).join('');
        var rows = list.map(function (p) {
            var pair = item.fourBall ? '<td><input class="form-input tns-pair tns-hole" data-act="pair" data-player="' + esc(p._key) + '" value="' + esc(p.pair || '') + '" placeholder="1"></td>' : '';
            return '<tr><td>' + esc(p.name || '—') + '</td><td>' + esc(C.fmtHcp(p.handicap) || '—') + '</td>' + pair +
                '<td><button type="button" class="btn btn-og btn-sm" data-act="blank" data-player="' + esc(p._key) + '">' + esc(tr('Карточка', 'Card')) + '</button> ' +
                '<button type="button" class="btn btn-r btn-sm" data-act="drop" data-player="' + esc(p._key) + '">' + esc(tr('Убрать', 'Remove')) + '</button></td></tr>';
        }).join('');
        var report = ui.importReport ? reportHtml(ui.importReport) : '';
        return '<h3>' + esc(tr('Гольфисты', 'Golfers')) + '</h3>' + appsHtml(item) +
            '<div class="tns-actions"><button type="button" class="btn btn-og btn-sm" data-act="export-roster">' + esc(tr('Экспорт', 'Export')) + '</button>' +
            '<label class="btn btn-og btn-sm">' + esc(tr('Импорт Excel', 'Import Excel')) + '<input type="file" accept=".xlsx,.xls,.csv" data-act="import" hidden></label>' +
            '<button type="button" class="btn btn-ol btn-sm" data-act="template">' + esc(tr('Шаблон', 'Template')) + '</button></div>' +
            '<div class="tns-bar"><div class="form-group" style="flex:1"><label>' + esc(tr('Фамилия на русском или английском', 'Surname in Russian or English')) + '</label><input class="form-input" id="tns-q" value="' + esc(ui.q) + '" data-act="query"></div></div>' +
            '<p class="tns-meta">' + esc(tr('Всего участников', 'Players') + ' — ' + people().length + ', ' + tr('мужчин', 'men') + ' — ' + men + ', ' + tr('женщин', 'women') + ' — ' + women) + '</p>' +
            '<div class="tns-bar"><select class="form-input" id="tns-add-user"><option value="">' + esc(tr('Добавить из клуба', 'Add a club player')) + '</option>' + opts + '</select><button type="button" class="btn btn-g btn-sm" data-act="add-user">' + esc(tr('Добавить', 'Add')) + '</button></div>' +
            report + '<div class="tns-table-wrap"><table class="tns-table"><thead><tr><th>' + esc(tr('Гольфист', 'Golfer')) + '</th><th>HI</th>' +
            (item.fourBall ? '<th>' + esc(tr('Пара', 'Pair')) + '</th>' : '') + '<th></th></tr></thead><tbody>' +
            (rows || '<tr><td colspan="4" class="tns-note">' + esc(tr('Состав пуст.', 'Roster is empty.')) + '</td></tr>') + '</tbody></table></div>' +
            '<p class="tns-note">' + esc(tr('Excel, до 500 строк: ФИО, HCP, Пол, ТИ. Кого нет в клубе, тоже добавляем. Повтор по ФИО пропускается, состав не заменяется. «Карточка» — пустая А5 после стартового листа.', 'Excel, up to 500 rows: name, HCP, gender, tee. People outside the club are added too. A repeated name is skipped; the roster is not replaced. Card prints a blank A5 after the start sheet exists.')) + '</p>';
    }
    function appsHtml(item) {
        var apps = item.applications || {}, waits = item.waitlist || {}, rows = [], seen = {};
        function add(id, app, kind) {
            if (!app || seen[id]) return;
            seen[id] = true;
            var copy = Object.assign({}, app);
            copy._id = id;
            copy._kind = kind;
            rows.push(copy);
        }
        Object.keys(apps).forEach(function (id) { add(id, apps[id], 'application'); });
        Object.keys(waits).forEach(function (id) { add(id, waits[id], 'waitlist'); });
        var pending = rows.filter(function (row) { return String(row.status || 'pending').toLowerCase() !== 'approved' && String(row.status || 'pending').toLowerCase() !== 'rejected'; });
        if (!rows.length) return '<p class="tns-note">' + esc(tr('Заявок с сайта пока нет.', 'No website applications yet.')) + '</p>';
        var body = pending.map(function (row) {
            return '<tr><td><b>' + esc(row.name || '—') + '</b><br><span class="tns-meta">' + esc(row.email || row.phone || '') + '</span></td><td>' + esc(C.fmtHcp(row.handicap) || '—') + '</td><td>' +
                '<button type="button" class="btn btn-g btn-sm" data-act="approve" data-id="' + esc(row._id) + '">' + esc(tr('Подтвердить', 'Approve')) + '</button> ' +
                '<button type="button" class="btn btn-r btn-sm" data-act="reject" data-id="' + esc(row._id) + '">' + esc(tr('Отклонить', 'Reject')) + '</button></td></tr>';
        }).join('');
        return '<h3>' + esc(tr('Заявки с сайта', 'Website applications')) + ' · ' + pending.length + '</h3>' +
            (body ? '<div class="tns-table-wrap"><table class="tns-table"><thead><tr><th>' + esc(tr('Игрок', 'Player')) + '</th><th>HI</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>' : '<p class="tns-note">' + esc(tr('Новых заявок нет.', 'No new applications.')) + '</p>');
    }
    function reportHtml(report) {
        var lines = [];
        if (report.added) lines.push('<span class="tns-ok">' + esc(tr('Добавлено: ', 'Added: ') + report.added) + '</span>');
        if (report.skipped) lines.push('<span class="tns-meta">' + esc(tr('Уже в составе: ', 'Already in: ') + report.skipped) + '</span>');
        (report.invalid || []).forEach(function (row) { lines.push('<li class="tns-warn">' + esc(row.name || '') + ' — ' + esc(tr('неверный HCP', 'invalid HCP')) + '</li>'); });
        if (report.truncated) lines.push('<span class="tns-warn">' + esc(tr('Взяты первые 500 строк.', 'Only the first 500 rows were read.')) + '</span>');
        (report.missing || []).forEach(function (name) { lines.push('<li class="tns-warn">' + esc(name) + ' — ' + esc(tr('нет в клубе', 'not in the club')) + '</li>'); });
        (report.ambiguous || []).forEach(function (name) { lines.push('<li class="tns-warn">' + esc(name) + ' — ' + esc(tr('несколько совпадений', 'several matches')) + '</li>'); });
        (report.short || []).forEach(function (name) { lines.push('<li class="tns-warn">' + esc(name) + ' — ' + esc(tr('нужно полное ФИО', 'full name required')) + '</li>'); });
        return '<div class="tns-report">' + lines.join('') + '</div>';
    }
    function dayHtml() {
        var item = t();
        var day = item && item.days && item.days[ui.dayId];
        if (!item || !day) return '<p class="tns-note">' + esc(tr('День не найден.', 'Day not found.')) + '</p>';
        return '<div class="tns"><div class="tns-head"><div><button type="button" class="btn btn-og btn-sm" data-act="back-card">' + esc(tr('Назад', 'Back')) + '</button><h2>' + esc(item.name || '') + '</h2><p class="tns-sub">' + esc(C.formatIso(day.date)) + '</p></div>' +
            '<button type="button" class="btn btn-og btn-sm" data-act="export-day">' + esc(tr('Экспорт', 'Export')) + '</button></div>' +
            '<div class="tns-tabs"><button type="button" class="tns-tab' + (ui.dayTab === 'score' ? ' active' : '') + '" data-act="daytab" data-id="score">' + esc(tr('Счёт', 'Score')) + '</button>' +
            '<button type="button" class="tns-tab' + (ui.dayTab === 'card' ? ' active' : '') + '" data-act="daytab" data-id="card">' + esc(tr('Результаты', 'Results')) + '</button></div>' +
            (ui.dayTab === 'card' ? resultsHtml(item, day) : scoreHtml(day)) + '</div>';
    }
    function scoreHtml(day) {
        var rows = summaryRows(day._key || ui.dayId);
        return '<div class="tns-table-wrap"><table class="tns-table"><thead><tr><th>' + esc(tr('Игрок', 'Player')) + '</th><th>' + esc(tr('Формат', 'Format')) + '</th><th>' + esc(tr('Результат', 'Result')) + '</th><th></th></tr></thead><tbody>' +
            (rows.map(function (r) {
                return '<tr><td><button type="button" class="tns-link" data-act="player" data-player="' + esc(r.key) + '">' + esc(r.name || '—') + '</button></td><td>' + esc(fmtName(r.format)) + '</td><td>' + esc(r.result) + '</td><td><button type="button" class="btn btn-og btn-sm" data-act="blank" data-player="' + esc(r.key) + '">' + esc(tr('Карточка', 'Card')) + '</button></td></tr>';
            }).join('') || '<tr><td colspan="4" class="tns-note">' + esc(tr('Нет участников.', 'No players.')) + '</td></tr>') + '</tbody></table></div>';
    }
    function resultsHtml(item, day) {
        var divs = C.listOf(item.divisions);
        if (!ui.divisionId) ui.divisionId = 'none';
        var chips = divs.map(function (d) {
            return '<button type="button" class="tns-div' + (ui.divisionId === d._key ? ' active' : '') + '" data-act="chip" data-id="' + esc(d._key) + '">' + esc(d.name || '—') + '</button>';
        }).join('') + '<button type="button" class="tns-div' + (ui.divisionId === 'none' ? ' active' : '') + '" data-act="chip" data-id="none">' + esc(tr('Без группы', 'Ungrouped')) + '</button>';
        var d = ui.divisionId !== 'none' ? (item.divisions || {})[ui.divisionId] : null;
        var tee = (d && d.tee) || 'wh';
        var list = people().filter(function (p) {
            var id = C.divisionOf(p._key, item.divisions);
            return ui.divisionId === 'none' ? !id : id === ui.divisionId;
        });
        return '<div class="tns-chips">' + chips + '</div>' + (d ? '<p class="tns-note">' + esc(caption(item, d)) + '</p>' : '<p class="tns-note">' + esc(tr('Игроки без зачёта. Ти по умолчанию — белые.', 'Ungrouped players. Default tee is white.')) + '</p>') +
            editableTable(day, list, tee);
    }
    function holeHead() {
        var html = '<tr><th class="name"></th>';
        for (var h = 1; h <= 18; h++) {
            html += '<th>' + h + '</th>';
            if (h === 9 || h === 18) html += '<th></th>';
        }
        return html + '<th></th></tr>';
    }
    function courseRows(tee) {
        var api = course();
        function line(label, pick) {
            var html = '<tr><th class="name">' + esc(label) + '</th>', out = 0, inn = 0;
            for (var h = 1; h <= 18; h++) {
                var v = pick(h);
                html += '<td>' + esc(v) + '</td>';
                if (typeof v === 'number') { if (h <= 9) out += v; else inn += v; }
                if (h === 9) html += '<td class="sum">' + out + '</td>';
                if (h === 18) html += '<td class="sum">' + inn + '</td>';
            }
            return html + '<td class="sum">' + (out + inn) + '</td></tr>';
        }
        return line(tr('Длина, м', 'Length, m'), function (h) { return api.dist(h, tee); }) +
            line(tr('Пар', 'Par'), function (h) { return api.par(h); }) +
            line(tr('Индекс', 'Index'), function (h) { return api.si(h); });
    }
    function editableTable(day, list, tee) {
        var body = courseRows(tee);
        list.forEach(function (p) {
            var b = built(p, day._key || ui.dayId);
            body += '<tr><th class="name"><button type="button" class="tns-link" data-act="player" data-player="' + esc(p._key) + '">' + esc(p.name || '—') + '</button></th>';
            var out = 0, inn = 0, outN = 0, innN = 0;
            b.card.holes.forEach(function (hole) {
                body += '<td><input class="tns-hole" inputmode="numeric" data-act="score" data-player="' + esc(p._key) + '" data-hole="' + hole.hole + '" value="' + (hole.gross == null ? '' : hole.gross) + '"></td>';
                if (hole.gross != null) { if (hole.hole <= 9) { out += hole.gross; outN++; } else { inn += hole.gross; innN++; } }
                if (hole.hole === 9) body += '<td class="sum">' + (outN ? out : '—') + '</td>';
                if (hole.hole === 18) body += '<td class="sum">' + (innN ? inn : '—') + '</td>';
            });
            body += '<td class="sum">' + (b.card.all.gross.total == null ? '—' : b.card.all.gross.total) + '</td></tr>';
        });
        return '<div class="tns-score"><table><thead>' + holeHead() + '</thead><tbody>' + body + '</tbody></table></div>';
    }
    function playerHtml() {
        var item = t();
        var p = people().filter(function (x) { return x._key === ui.playerKey; })[0];
        var day = item && item.days && item.days[ui.dayId];
        if (!item || !p || !day) return '<p class="tns-note">' + esc(tr('Карточка недоступна.', 'Card is unavailable.')) + '</p>';
        var b = built(p, ui.dayId);
        var html = '<div class="tns"><button type="button" class="btn btn-og btn-sm" data-act="back-day">' + esc(tr('Назад', 'Back')) + '</button><h2>' + esc(item.name || '') + '</h2><p class="tns-sub">' + esc(C.formatIso(day.date)) + '</p><h3>' + esc(p.name) + '</h3>';
        html += '<p class="tns-note">HI: ' + esc(C.fmtHcp(p.handicap) || '—') + ' · CH: ' + esc(b.ch == null ? '—' : b.ch) + '<br>' + esc(tr('Ти', 'Tee') + ': ' + course().teeName(b.tee) + ', ' + fmtName(b.format)) + '</p>';
        html += '<p class="tns-note">' + esc(tr('Удары можно править и во время дня, и после него. Изменение сразу видно в зачёте и на сайте, если турнир открыт.', 'Scores can be edited during and after the day. The change shows in the division and on the site if the tournament is public.')) + '</p>';
        html += playerTable(p, b);
        return html + '</div>';
    }
    function playerTable(p, b) {
        var holes = b.card.holes;
        function nums(pick) {
            var html = '<tr><th class="name">' + esc(pick.label) + '</th>', out = 0, inn = 0, outN = 0, innN = 0;
            holes.forEach(function (h) {
                var v = pick.get(h);
                html += '<td>' + (pick.input ? '<input class="tns-hole" inputmode="numeric" data-act="score" data-player="' + esc(p._key) + '" data-hole="' + h.hole + '" value="' + (h.gross == null ? '' : h.gross) + '">' : esc(v == null || v === '' ? '—' : v)) + '</td>';
                if (pick.sum && typeof v === 'number') { if (h.hole <= 9) { out += v; outN++; } else { inn += v; innN++; } }
                if (h.hole === 9) html += '<td class="sum">' + (pick.sum ? (outN ? out : '—') : '') + '</td>';
                if (h.hole === 18) html += '<td class="sum">' + (pick.sum ? (innN ? inn : '—') : '') + '</td>';
            });
            return html + '<td class="sum">' + (pick.sum ? ((outN + innN) ? out + inn : '—') : '') + '</td></tr>';
        }
        return '<div class="tns-score"><table><thead>' + holeHead() + '</thead><tbody>' +
            nums({ label: tr('Длина, м', 'Length, m'), get: function (h) { return h.dist; }, sum: true }) +
            nums({ label: tr('Пар', 'Par'), get: function (h) { return h.par; }, sum: true }) +
            nums({ label: tr('Индекс', 'Index'), get: function (h) { return h.si; } }) +
            nums({ label: tr('Фора', 'Strokes'), get: function (h) { return h.recv || '—'; } }) +
            nums({ label: tr('Удары', 'Strokes played'), get: function (h) { return h.gross; }, sum: true, input: true }) +
            nums({ label: tr('Очки, гросс', 'Gross points'), get: function (h) { return h.ptsGross; }, sum: true }) +
            nums({ label: tr('Очки, нетто', 'Net points'), get: function (h) { return h.ptsNet; }, sum: true }) +
            '</tbody></table></div>';
    }

    function update(patch) {
        var base = db();
        if (!base) { toast(tr('Нет базы', 'No database'), 'error'); return Promise.reject(); }
        patch.updatedAt = Date.now();
        return base.ref('tournaments/' + ui.id).update(patch).catch(function (err) {
            toast('❌ ' + (err && err.message ? err.message : err), 'error');
            throw err;
        });
    }
    function syncLegacy(item) {
        return { formats: C.legacyFormats(item, item.divisions), tees: C.legacyTees(item.divisions) };
    }
    function readForm(id) {
        var form = document.getElementById(id);
        if (!form) return null;
        var data = {};
        Array.prototype.forEach.call(form.elements, function (el) {
            if (!el.name) return;
            data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
        });
        return data;
    }
    function validDates(start, end) {
        if (!C.isoOk(start) || !C.isoOk(end)) { toast(tr('Укажите обе даты', 'Enter both dates'), 'error'); return false; }
        if (end < start) { toast(tr('Дата завершения раньше начала', 'End date is before the start'), 'error'); return false; }
        return true;
    }
    function saveCreate() {
        var data = readForm('tns-create');
        if (!data || !String(data.name || '').trim()) { toast(tr('Введите название', 'Enter a name'), 'error'); return; }
        if (!validDates(data.start, data.end)) return;
        var base = db();
        if (!base) { toast(tr('Нет базы', 'No database'), 'error'); return; }
        var ref = base.ref('tournaments').push();
        var four = !!data.fourball;
        var payload = {
            name: String(data.name).trim(),
            date: data.start,
            endDate: data.end,
            publicAccess: false,
            fourBall: four,
            fromStudio: true,
            status: 'upcoming',
            registration: { enabled: false, waitlist: false },
            formats: four ? ['Four-ball'] : [],
            tees: [],
            courseName: C.CLUB,
            clubName: C.CLUB,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        if (uid()) payload.createdBy = uid();
        ref.set(payload).then(function () {
            ui.id = ref.key;
            ui.view = 'card';
            ui.tab = 'rounds';
            ui.editing = false;
            toast(tr('Турнир создан и скрыт с сайта', 'Tournament created and hidden from the site'), 'success');
            render();
        }).catch(function (err) { toast('❌ ' + (err && err.message ? err.message : err), 'error'); });
    }
    function saveEdit() {
        var data = readForm('tns-edit');
        var item = t();
        if (!data || !item) return;
        if (!String(data.name || '').trim()) { toast(tr('Введите название', 'Enter a name'), 'error'); return; }
        if (!validDates(data.start, data.end)) return;
        var four = !!data.fourball;
        var next = Object.assign({}, item, { fourBall: four, divisions: item.divisions });
        update(Object.assign({
            name: String(data.name).trim(),
            date: data.start,
            endDate: data.end,
            fourBall: four
        }, syncLegacy(next))).then(function () { ui.editing = false; toast(tr('Сохранено', 'Saved'), 'success'); });
    }
    function addDay() {
        var input = document.getElementById('tns-day');
        var date = input && input.value;
        if (!C.isoOk(date)) { toast(tr('Выберите дату', 'Pick a date'), 'error'); return; }
        var ref = db().ref('tournaments/' + ui.id + '/days').push();
        var patch = {};
        patch['days/' + ref.key] = { date: date, createdAt: Date.now() };
        update(patch);
    }
    function addDivision() {
        var data = readForm('tns-div');
        var item = t();
        if (!data || !item || !String(data.name || '').trim()) { toast(tr('Введите название зачёта', 'Enter a division name'), 'error'); return; }
        var ref = db().ref('tournaments/' + ui.id + '/divisions').push();
        var div = {
            name: String(data.name).trim(),
            gender: data.gender === 'women' ? 'women' : 'men',
            hcpFrom: data.hcpFrom || '',
            hcpTo: data.hcpTo || '',
            ageLabel: data.age || '',
            tee: data.tee || 'wh',
            format: item.fourBall ? 'fourball' : (data.format === 'stroke' ? 'stroke' : 'stableford')
        };
        var next = Object.assign({}, item, { divisions: Object.assign({}, item.divisions, {}) });
        next.divisions[ref.key] = div;
        var patch = {};
        patch['divisions/' + ref.key] = div;
        Object.assign(patch, flattenLegacy(syncLegacy(next)));
        update(patch);
    }
    function flattenLegacy(legacy) {
        return { formats: legacy.formats, tees: legacy.tees };
    }
    function assign(divId) {
        var sel = document.querySelector('[data-div-add="' + divId + '"]');
        var playerKey = sel && sel.value;
        if (!playerKey) return;
        var item = t();
        var patch = {};
        Object.keys(item.divisions || {}).forEach(function (id) {
            if ((item.divisions[id].members || {})[playerKey]) patch['divisions/' + id + '/members/' + playerKey] = null;
        });
        patch['divisions/' + divId + '/members/' + playerKey] = true;
        update(patch);
    }
    function addUser() {
        var sel = document.getElementById('tns-add-user');
        var id = sel && sel.value;
        var u = id && ui.users[id];
        if (!u || !u.name) return;
        if (roster(t()).some(function (p) { return p.uid === id; })) { toast(tr('Уже в составе', 'Already in the roster'), 'info'); return; }
        var ref = db().ref('tournaments/' + ui.id + '/registeredPlayers').push();
        var patch = {};
        patch['registeredPlayers/' + ref.key] = { uid: id, name: String(u.name).replace(/\s+/g, ' ').trim(), handicap: u.handicap == null ? null : u.handicap, gender: u.gender === 'women' ? 'women' : 'men', addedAt: Date.now() };
        update(patch).then(function () { toast(tr('Игрок добавлен', 'Player added'), 'success'); });
    }
    function importFile(file) {
        if (!root.XLSX) { toast(tr('Модуль Excel не загружен', 'Excel module is not loaded'), 'error'); return; }
        var reader = new FileReader();
        reader.onload = function () {
            var wb = root.XLSX.read(reader.result, { type: 'array' });
            var sheet = wb.Sheets[wb.SheetNames[0]];
            var rows = root.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            var names = C.namesFromSheet(rows);
            var report = { added: 0, skipped: 0, missing: [], ambiguous: [], short: [] };
            var patch = {};
            var have = {};
            roster(t()).forEach(function (p) { if (p.uid) have[p.uid] = true; });
            names.forEach(function (name) {
                var found = C.matchUsers(name, ui.users);
                if (found.status === 'none' || found.status === 'empty') { report.missing.push(name); return; }
                if (found.status === 'short') { report.short.push(name); return; }
                if (found.status !== 'one') { report.ambiguous.push(name); return; }
                var user = found.users[0];
                if (have[user.id]) { report.skipped++; return; }
                have[user.id] = true;
                var key = db().ref('tournaments/' + ui.id + '/registeredPlayers').push().key;
                patch['registeredPlayers/' + key] = { uid: user.id, name: user.name, handicap: user.handicap, gender: user.gender, addedAt: Date.now(), source: 'excel' };
                report.added++;
            });
            ui.importReport = report;
            var done = function () { render(); toast(tr('Импорт разобран', 'Import checked'), report.added ? 'success' : 'info'); };
            if (!report.added) { done(); return; }
            update(patch).then(done);
        };
        reader.readAsArrayBuffer(file);
    }
    function exportRoster() {
        if (!root.XLSX) { toast(tr('Модуль Excel не загружен', 'Excel module is not loaded'), 'error'); return; }
        var aoa = [['ФИО']].concat(people().map(function (p) { return [p.name]; }));
        var wb = root.XLSX.utils.book_new();
        root.XLSX.utils.book_append_sheet(wb, root.XLSX.utils.aoa_to_sheet(aoa), 'Участники');
        root.XLSX.writeFile(wb, fileBase() + '-players.xlsx');
    }
    function exportDay() {
        if (!root.XLSX) { toast(tr('Модуль Excel не загружен', 'Excel module is not loaded'), 'error'); return; }
        var item = t();
        var day = item.days[ui.dayId];
        var summary = [[tr('Игрок', 'Player'), tr('Формат', 'Format'), tr('Результат', 'Result')]].concat(summaryRows(ui.dayId).map(function (r) { return [r.name, fmtName(r.format), r.result]; }));
        var divs = C.listOf(item.divisions);
        var selected = ui.divisionId && ui.divisionId !== 'none' ? (item.divisions || {})[ui.divisionId] : null;
        var groups = selected ? [Object.assign({ _key: ui.divisionId }, selected)] : divs;
        if (!groups.length) groups = [{ _key: 'none', name: tr('Без группы', 'Ungrouped'), tee: 'wh' }];
        var wb = root.XLSX.utils.book_new();
        root.XLSX.utils.book_append_sheet(wb, root.XLSX.utils.aoa_to_sheet(summary), 'Счёт');
        groups.forEach(function (d, index) {
            var tee = d.tee || 'wh';
            var list = people().filter(function (p) {
                var id = C.divisionOf(p._key, item.divisions);
                return d._key === 'none' ? !id : id === d._key;
            });
            var header = [''].concat(range(1, 18)).concat([tr('Итого', 'Total')]);
            var aoa = [[d.name || tr('Зачёт', 'Division')], header];
            aoa.push([tr('Длина, м', 'Length, m')].concat(range(1, 18).map(function (h) { return course().dist(h, tee); })));
            aoa.push([tr('Пар', 'Par')].concat(range(1, 18).map(function (h) { return course().par(h); })));
            aoa.push([tr('Индекс', 'Index')].concat(range(1, 18).map(function (h) { return course().si(h); })));
            list.forEach(function (p) {
                var b = built(p, ui.dayId);
                aoa.push([p.name].concat(b.card.holes.map(function (h) { return h.gross == null ? '' : h.gross; })).concat([b.card.all.gross.total == null ? '' : b.card.all.gross.total]));
            });
            root.XLSX.utils.book_append_sheet(wb, root.XLSX.utils.aoa_to_sheet(aoa), sheetName(d.name || ('G' + (index + 1)), index));
        });
        root.XLSX.writeFile(wb, fileBase() + '-' + (day.date || 'day') + '.xlsx');
    }
    function range(a, b) { var out = []; for (var i = a; i <= b; i++) out.push(i); return out; }
    function sheetName(name, index) {
        var clean = String(name || 'Sheet').replace(/[\\/?*\[\]]/g, ' ').slice(0, 24);
        return (index + 1) + ' ' + (clean || 'Sheet');
    }
    function fileBase() {
        return String((t() && t().name) || 'tournament').replace(/[^\wа-яё]+/gi, '_').replace(/^_|_$/g, '') || 'tournament';
    }
    function saveScore(playerKey, hole, raw) {
        var text = String(raw == null ? '' : raw).trim();
        var value = text === '' ? null : parseInt(text, 10);
        if (text !== '' && (!isFinite(value) || value < 1 || value > 20)) { toast(tr('Удар от 1 до 20', 'Score must be 1 to 20'), 'error'); return; }
        var patch = {};
        patch['scores/' + ui.dayId + '/' + playerKey + '/' + hole] = value;
        update(patch);
    }

    function reviewApp(appId, approve) {
        var item = t();
        if (!item || !appId) return;
        var apps = item.applications || {}, waits = item.waitlist || {};
        var app = apps[appId] || waits[appId];
        if (!app) { toast(tr('Заявка уже обработана', 'Application already handled'), 'info'); return; }
        var patch = {};
        if (apps[appId]) {
            patch['applications/' + appId + '/status'] = approve ? 'approved' : 'rejected';
            patch['applications/' + appId + '/reviewedAt'] = Date.now();
        }
        patch['waitlist/' + (app.uid || ('app_' + appId))] = null;
        if (waits[appId]) patch['waitlist/' + appId] = null;
        if (approve) {
            var exists = roster(item).some(function (p) {
                return (app.uid && p.uid === app.uid) || (p.name && C.nameKey(p.name) === C.nameKey(app.name));
            });
            if (!exists) {
                var entry = {
                    name: String(app.name || '').replace(/\s+/g, ' ').trim(),
                    handicap: app.handicap == null || app.handicap === '' ? null : app.handicap,
                    gender: app.gender === 'women' ? 'women' : 'men',
                    tee: app.tee || 'wh',
                    addedAt: Date.now(),
                    source: 'application'
                };
                if (app.uid) entry.uid = app.uid;
                patch['registeredPlayers/' + (app.uid || ('app_' + appId))] = entry;
            }
        }
        update(patch).then(function () { toast(approve ? tr('Заявка подтверждена', 'Application approved') : tr('Заявка отклонена', 'Application rejected'), 'success'); });
    }
    function openStartSheet() {
        var btn = document.querySelector('.admin-tab[onclick*="tournaments"]');
        if (typeof root.switchTab === 'function') root.switchTab('start', btn || null);
    }
    function printBlank(playerKey) {
        var item = t();
        var player = people().filter(function (p) { return p._key === playerKey; })[0];
        if (!item || !player) return;
        var base = db();
        if (!base) { toast(tr('Нет базы', 'No database'), 'error'); return; }
        var day = (ui.view === 'day' || ui.view === 'player') && item.days ? item.days[ui.dayId] : null;
        base.ref('protocols').once('value').then(function (snap) {
            var slot = C.findStart(snap.val() || {}, ui.id, player, day && day.date);
            if (!slot) {
                toast(tr('Сначала сформируйте стартовый лист — оттуда берутся время, лунка и маркер.', 'Form the start sheet first. Time, hole and marker come from there.'), 'info');
                openStartSheet();
                return;
            }
            openBlankCard(item, player, slot);
        }).catch(function (err) { toast('❌ ' + (err && err.message ? err.message : err), 'error'); });
    }
    function cardFormat(item, player, slot) {
        if (item.fourBall) return 'fourball';
        var divId = C.divisionOf(player._key, item.divisions);
        var div = divId && (item.divisions || {})[divId];
        if (div) return C.formatId(item, div);
        var text = String(slot.format || '').toLowerCase();
        if (/stroke|удар|ису/.test(text)) return 'stroke';
        return 'stableford';
    }
    function cardTee(item, player, slot) {
        var fromSheet = slot.player && slot.player.tee;
        if (fromSheet) return fromSheet;
        var divId = C.divisionOf(player._key, item.divisions);
        var div = divId && (item.divisions || {})[divId];
        return (div && div.tee) || player.tee || 'wh';
    }
    function cardGender(item, player, slot) {
        if (player.gender === 'women' || player.gender === 'men') return player.gender;
        if (slot.player && (slot.player.gender === 'women' || slot.player.gender === 'men')) return slot.player.gender;
        var divId = C.divisionOf(player._key, item.divisions);
        var div = divId && (item.divisions || {})[divId];
        return div && div.gender === 'women' ? 'women' : 'men';
    }
    function teePrint(code) {
        return ({ bk: 'Чёрные', bl: 'Синие', wh: 'Белые', rd: 'Красные', ye: 'Жёлтые' })[code] || course().teeName(code);
    }
    function formatPrint(id) {
        if (id === 'fourball') return tr('Форбол', 'Four-ball');
        if (id === 'stroke') return tr('На счёт ударов', 'Stroke play');
        return tr('Стейблфорд', 'Stableford');
    }
    function pageUrl(page, query) {
        var loc = window.location;
        var dir = loc.pathname.replace(/[^/]*$/, '');
        return loc.origin + dir + page + '?' + query;
    }
    function markerQr(slot) {
        if (!slot || !slot.roundId || !slot.marker || !slot.marker.id) return '';
        return pageUrl('setup-round.html', 'round=' + encodeURIComponent(slot.roundId) + '&as=' + encodeURIComponent(slot.marker.id));
    }
    function openBlankCard(item, player, slot) {
        var tee = cardTee(item, player, slot);
        var format = cardFormat(item, player, slot);
        var gender = cardGender(item, player, slot);
        var hi = player.handicap != null && player.handicap !== '' ? player.handicap : (slot.player && slot.player.exactHcp);
        var ch = course().field(hi, tee, gender);
        var rating = course().rating(gender, tee);
        var full = C.fullName(slot.player) || player.name || '—';
        var short = C.shortName(slot.player) || player.name || '—';
        var marker = slot.marker && slot.marker.name ? slot.marker.name : '';
        var qr = markerQr(slot);
        var holes = [];
        for (var h = 1; h <= 18; h++) {
            holes.push({
                n: h,
                dist: course().dist(h, tee) || 0,
                par: course().par(h),
                si: course().si(h),
                recv: C.strokesOnHole(course().si(h), ch || 0)
            });
        }
        function sum(list, field) { return list.reduce(function (n, hole) { return n + (hole[field] || 0); }, 0); }
        var out = holes.slice(0, 9), inn = holes.slice(9);
        var cr = rating && rating.cr != null ? Number(rating.cr).toFixed(1).replace('.', ',') : '—';
        var sr = rating && rating.sr != null ? String(rating.sr) : '—';
        var win = window.open('', '_blank');
        if (!win) { toast(tr('Разрешите всплывающее окно, чтобы открыть карточку', 'Allow the popup to open the card'), 'error'); return; }
        win.document.write(blankCardDocument({
            title: item.name || tr('Турнир', 'Tournament'),
            full: full,
            short: short,
            marker: marker,
            hi: C.fmtHcp(hi) || '—',
            ch: ch == null ? '—' : String(ch),
            tee: teePrint(tee),
            format: formatPrint(format),
            par: sum(holes, 'par') || 72,
            cr: cr,
            sr: sr,
            time: C.clockLabel(slot.startTime) || '—',
            hole: String(slot.startHole || 1),
            qr: qr,
            holes: holes,
            outDist: sum(out, 'dist'),
            innDist: sum(inn, 'dist'),
            outPar: sum(out, 'par'),
            innPar: sum(inn, 'par')
        }));
        win.document.close();
    }
    function blankCardDocument(card) {
        function cells(list, pick, sums) {
            var html = '';
            list.forEach(function (hole) {
                html += '<td>' + pick(hole) + '</td>';
                if (hole.n === 9) html += '<td class="sum">' + sums.out + '</td>';
                if (hole.n === 18) html += '<td class="sum">' + sums.inn + '</td>';
            });
            return html + '<td class="sum">' + sums.all + '</td>';
        }
        var head = '';
        card.holes.forEach(function (hole) {
            head += '<th>' + hole.n + '</th>';
            if (hole.n === 9 || hole.n === 18) head += '<th></th>';
        });
        head += '<th></th>';
        var length = cells(card.holes, function (hole) { return hole.dist || ''; }, { out: card.outDist, inn: card.innDist, all: card.outDist + card.innDist });
        var par = cells(card.holes, function (hole) { return hole.par; }, { out: card.outPar, inn: card.innPar, all: card.par });
        var index = cells(card.holes, function (hole) { return hole.si; }, { out: '', inn: '', all: '' });
        var marks = cells(card.holes, function (hole) { return C.slashMarks(hole.recv); }, { out: '', inn: '', all: '' });
        var boxes = cells(card.holes, function () { return '<span class="box"></span>'; }, { out: '0', inn: '0', all: '0' });
        var qr = card.qr
            ? '<img alt="QR" src="' + esc('https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=4&data=' + encodeURIComponent(card.qr)) + '" data-next="' + esc('https://quickchart.io/qr?size=280&margin=1&text=' + encodeURIComponent(card.qr)) + '" onload="ready()" onerror="fail(this)">'
            : '<div class="noqr">' + esc(tr('Маркер не назначен', 'No marker assigned')) + '</div>';
        return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(card.short) + '</title><style>' +
            '@page{size:210mm 148mm;margin:5mm}html,body{margin:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif}' +
            '.sheet{width:200mm;min-height:138mm;display:flex;flex-direction:column}' +
            '.top{display:flex;justify-content:space-between;gap:4mm;align-items:flex-start}' +
            '.title{font-size:13pt;font-weight:700;margin:0 0 2mm;line-height:1.15}' +
            '.line{font-size:9pt;margin:1.1mm 0}.muted{color:#444}' +
            '.qrbox{width:68mm;border:0.25mm solid #c8c8c8;padding:2mm;display:flex;gap:2.5mm;align-items:flex-start}' +
            '.qrbox img{width:28mm;height:28mm}.noqr{width:28mm;height:28mm;border:0.2mm dashed #999;font-size:7pt;display:flex;align-items:center;text-align:center;padding:1mm}' +
            '.meta{font-size:10pt;font-weight:700;margin:0 0 1.5mm}.lbl{display:block;font-size:7pt;color:#555;font-weight:600}' +
            '.player{font-size:10pt;font-weight:700;line-height:1.15}.marker{font-size:14pt;font-weight:800;line-height:1.05;margin-top:0.4mm}' +
            'table{width:100%;border-collapse:collapse;margin-top:2.5mm;font-size:7pt}th,td{text-align:center;padding:0.6mm 0;border-bottom:0.15mm solid #e4e4e4}' +
            'th{font-weight:700}td.name,th.name{text-align:left;width:16mm;font-weight:700}.sum{font-weight:700}' +
            '.box{display:inline-block;width:3.4mm;height:3.4mm;border:0.28mm solid #222;border-radius:0.4mm;vertical-align:middle}' +
            '.signs{margin-top:auto;display:flex;gap:5mm;align-items:flex-end;padding-top:4mm;font-size:8pt}' +
            '.sign{flex:1}.sign b{display:block;margin-bottom:4mm}.lineout{border-bottom:0.25mm solid #222;height:5mm}' +
            '.toolbar{margin:0 0 3mm}.toolbar button{font:inherit;padding:6px 10px}' +
            '@media print{.toolbar{display:none}}' +
            '</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">' + esc(tr('Печать / PDF', 'Print / PDF')) + '</button> <span class="muted">' + esc(tr('В диалоге выберите «Сохранить как PDF» и альбомный A5.', 'In the dialog choose Save as PDF and A5 landscape.')) + '</span></div>' +
            '<div class="sheet"><div class="top"><div><h1 class="title">' + esc(card.title) + '</h1>' +
            '<p class="line"><b>' + esc(card.full) + '</b> HI: ' + esc(card.hi) + ', CH: ' + esc(card.ch) + '</p>' +
            '<p class="line">' + esc(tr('Ти', 'Tee')) + ': ' + esc(card.tee) + ', ' + esc(card.format) + '</p>' +
            '<p class="line">' + esc(tr('Пар поля', 'Course par')) + ': ' + esc(card.par) + ', ' + esc(tr('РП', 'CR')) + ' ' + esc(card.cr) + ' / ' + esc(tr('РС', 'Slope')) + ' ' + esc(card.sr) + '</p>' +
            '<p class="line muted">' + esc(tr('Дифференциал счёта', 'Score differential')) + ': —</p></div>' +
            '<div class="qrbox">' + qr + '<div><p class="meta">&#128339; ' + esc(card.time) + ' &nbsp; &#9971; ' + esc(card.hole) + '</p>' +
            '<div><span class="lbl">' + esc(tr('Игрок', 'Player')) + '</span><div class="player">' + esc(card.short) + '</div></div>' +
            '<div><span class="lbl">' + esc(tr('Маркер', 'Marker')) + '</span><div class="marker">' + esc(card.marker || tr('не назначен', 'not assigned')) + '</div></div></div></div></div>' +
            '<table><thead><tr><th class="name"></th>' + head + '</tr></thead><tbody>' +
            '<tr><td class="name">' + esc(tr('Длина, м', 'Length, m')) + '</td>' + length + '</tr>' +
            '<tr><td class="name">' + esc(tr('Пар', 'Par')) + '</td>' + par + '</tr>' +
            '<tr><td class="name">' + esc(tr('Индекс', 'Index')) + '</td>' + index + '</tr>' +
            '<tr><td class="name">' + esc(tr('Фора', 'Strokes')) + '</td>' + marks + '</tr>' +
            '<tr><td class="name">' + esc(tr('Удары', 'Score')) + '</td>' + boxes + '</tr>' +
            '</tbody></table><div class="signs"><div class="sign"><b>' + esc(tr('Подписи', 'Signatures')) + '</b></div>' +
            '<div class="sign"><span>' + esc(tr('Игрок', 'Player')) + '</span><div class="lineout"></div></div>' +
            '<div class="sign"><span>' + esc(tr('Маркер', 'Marker')) + '</span><div class="lineout"></div></div>' +
            '<div class="sign"><span>' + esc(tr('Судья', 'Referee')) + '</span><div class="lineout"></div></div></div></div>' +
            '<script>function fail(img){var next=img.getAttribute("data-next");if(!next||img.getAttribute("data-tried")){img.style.display="none";ready();return;}img.setAttribute("data-tried","1");img.src=next;}function ready(){if(window.__printed)return;window.__printed=1;setTimeout(function(){try{window.print();}catch(e){}},300);}if(!document.querySelector("img"))ready();<\/script></body></html>';
    }
    function onClick(event) {
        var node = event.target.closest ? event.target.closest('[data-act]') : null;
        if (!node || !document.getElementById('tn-studio-root') || !document.getElementById('tn-studio-root').contains(node)) return;
        var act = node.getAttribute('data-act');
        var id = node.getAttribute('data-id');
        if (act === 'create') go('create');
        else if (act === 'back-list') { ui.view = 'list'; ui.editing = false; render(); }
        else if (act === 'filter') { ui.from = valueOf('from'); ui.to = valueOf('to'); render(); }
        else if (act === 'clear') { ui.from = ''; ui.to = ''; render(); }
        else if (act === 'sort') { ui.sort = ui.sort === 'desc' ? 'asc' : 'desc'; render(); }
        else if (act === 'save-create') saveCreate();
        else if (act === 'open') { ui.id = id; ui.view = 'card'; ui.tab = 'rounds'; ui.editing = false; render(); }
        else if (act === 'tab') { ui.tab = id; render(); }
        else if (act === 'edit') { ui.editing = !ui.editing; render(); }
        else if (act === 'save-edit') saveEdit();
        else if (act === 'add-day') addDay();
        else if (act === 'day') { ui.dayId = id; ui.view = 'day'; ui.dayTab = 'score'; ui.playerKey = null; render(); }
        else if (act === 'back-card') { ui.view = 'card'; ui.tab = 'rounds'; render(); }
        else if (act === 'daytab') { ui.dayTab = id; render(); }
        else if (act === 'chip') { ui.divisionId = id; render(); }
        else if (act === 'player') { ui.playerKey = node.getAttribute('data-player'); ui.view = 'player'; render(); }
        else if (act === 'back-day') { ui.view = 'day'; render(); }
        else if (act === 'add-div') addDivision();
        else if (act === 'assign') assign(id);
        else if (act === 'unassign') { var patch = {}; patch['divisions/' + id + '/members/' + node.getAttribute('data-player')] = null; update(patch); }
        else if (act === 'del-div') { if (confirm(tr('Удалить зачёт?', 'Delete this division?'))) { var del = {}; del['divisions/' + id] = null; update(del); } }
        else if (act === 'del-day') { if (confirm(tr('Удалить день и его счёт?', 'Delete this day and its scores?'))) { var dayPatch = {}; dayPatch['days/' + id] = null; dayPatch['scores/' + id] = null; update(dayPatch); } }
        else if (act === 'public') update({ publicAccess: t().publicAccess === false });
        else if (act === 'reg') update({ registration: { enabled: !(t().registration && t().registration.enabled === true), waitlist: true, approval: 'manual' } });
        else if (act === 'approve') reviewApp(id, true);
        else if (act === 'reject') { if (confirm(tr('Отклонить заявку?', 'Reject this application?'))) reviewApp(id, false); }
        else if (act === 'blank') printBlank(node.getAttribute('data-player'));
        else if (act === 'template') downloadTemplate();
        else if (act === 'del-tn') { if (confirm(tr('Удалить турнир целиком?', 'Delete the whole tournament?'))) db().ref('tournaments/' + ui.id).remove().then(function () { ui.view = 'list'; ui.id = null; toast(tr('Удалено', 'Deleted'), 'success'); }); }
        else if (act === 'add-user') addUser();
        else if (act === 'drop') { if (confirm(tr('Убрать игрока из состава?', 'Remove this player?'))) { var drop = {}; drop['registeredPlayers/' + node.getAttribute('data-player')] = null; update(drop); } }
        else if (act === 'export-roster') exportRoster();
        else if (act === 'export-day') exportDay();
    }
    function valueOf(field) {
        var el = document.querySelector('#tn-studio-root [data-field="' + field + '"]');
        return el ? el.value : '';
    }
    function onChange(event) {
        var el = event.target;
        if (!el || !el.getAttribute) return;
        var act = el.getAttribute('data-act');
        if (act === 'score') saveScore(el.getAttribute('data-player'), el.getAttribute('data-hole'), el.value);
        else if (act === 'pair') {
            var patch = {};
            patch['registeredPlayers/' + el.getAttribute('data-player') + '/pair'] = String(el.value || '').trim();
            update(patch);
        } else if (act === 'query') { ui.q = el.value; render(); }
        else if (act === 'import' && el.files && el.files[0]) { importFile(el.files[0]); el.value = ''; }
    }
    function bind() {
        if (ui.bound) return;
        ui.bound = true;
        document.addEventListener('click', onClick);
        document.addEventListener('change', onChange);
        document.addEventListener('input', function (event) {
            var el = event.target;
            if (!el || el.getAttribute('data-act') !== 'query') return;
            var box = document.getElementById('tn-studio-root');
            if (!box || !box.contains(el)) return;
            ui.q = el.value;
            var caret = el.selectionStart;
            render();
            var again = document.getElementById('tns-q');
            if (again) {
                again.focus();
                if (caret != null) again.setSelectionRange(caret, caret);
            }
        });
        document.addEventListener('focusout', function () {
            setTimeout(function () {
                if (!ui.pending) return;
                var box = document.getElementById('tn-studio-root');
                var el = document.activeElement;
                if (box && el && box.contains(el) && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
                render();
            }, 0);
        });
        var base = db();
        if (!base || typeof root.bindRealtimeValue !== 'function') {
            render();
            return;
        }
        root.bindRealtimeValue('tn-studio-tournaments', base.ref('tournaments'), function (snap) {
            ui.tournaments = snap.val() || {};
            render();
        });
        root.bindRealtimeValue('tn-studio-users', base.ref('users'), function (snap) {
            ui.users = snap.val() || {};
            if (ui.view === 'players' || ui.view === 'groups' || ui.view === 'day' || ui.view === 'player') render();
        });
    }
    function open() {
        bind();
        if ((location.hash || '').toLowerCase() !== '#tn-studio') {
            try { history.replaceState(null, '', location.pathname + location.search + '#tn-studio'); } catch (e) { /* ignore */ }
        }
        render();
    }
    root.tnStudioOpen = open;
    root.tnStudioOnAdminOpen = function () {
        if ((location.hash || '').toLowerCase() !== '#tn-studio') return;
        var btn = document.querySelector('.admin-tab[onclick*="studio"]');
        if (btn && typeof root.switchTab === 'function') root.switchTab('studio', btn);
    };
    window.addEventListener('hashchange', function () {
        if ((location.hash || '').toLowerCase() === '#tn-studio' && typeof root.switchTab === 'function') {
            var btn = document.querySelector('.admin-tab[onclick*="studio"]');
            var pane = document.getElementById('tab-studio');
            if (btn && pane && pane.classList.contains('hidden')) root.switchTab('studio', btn);
        }
    });
})(typeof window !== 'undefined' ? window : this);
