// ============================================================
// TN-MGR-SHEET — вкладка «Стартовый лист» (ТЗ §3.4 и §9)
// ------------------------------------------------------------
// • лист генерируется автоматически из участников, групп, ТИ,
//   формата и раундов турнира;
// • маркеры назначаются по группам/флайтам/порядку, для каждого
//   маркера считается QR-код на страницу ввода счёта;
// • любое поле листа (игрок, ТИ, формат, группа, маркер, порядок,
//   флайт, время старта, позиция) правится инлайном и
//   синхронизируется с турниром, раундами, группами и участниками;
// • выгрузка в PDF (вместе с QR-кодами) и Excel; набор колонок
//   хранится в данных листа и редактируется в интерфейсе.
// ============================================================
var TnMgrSheetUI = (function (root) {
    'use strict';

    function ui() { return root.TnMgrUI; }
    function core() { return root.TnMgrCore; }
    function data() { return root.TnMgrData; }
    function io() { return root.TnMgrIO; }
    function esc(value) { return core().esc(value); }
    function bi(ru, en) { return ui().bi(ru, en); }
    function lang() { return ui().lang(); }

    var state = {
        optionsOpen: false,
        columnsOpen: false,
        qrOpen: true,
        showTournamentQr: true,
        addOpen: false,
        options: {
            groupSize: 4, startInterval: 8, firstTeeTime: '', tee: '', format: '',
            markMode: 'group', groupsPerFlight: 3, flights: true
        }
    };

    // ----------------------------------------------------------
    // ДАННЫЕ
    // ----------------------------------------------------------
    function currentRoundId() { return ui().state.route.rid || ''; }

    function currentRound() {
        var rid = currentRoundId();
        var rounds = ui().roundsOf();
        if (!rid && rounds.length) return rounds[0];
        return ui().roundOf(rid);
    }

    function ensureRoundId() {
        var rid = currentRoundId();
        if (rid) return rid;
        var rounds = ui().roundsOf();
        if (rounds.length) return rounds[0].id;
        return '';
    }

    function sheet() { return ui().sheetOf(ensureRoundId() || currentRoundId()); }

    function entries(sheetData) {
        return data().sheetOrder(sheetData || sheet());
    }

    function markerName(sheetData, entry) {
        if (!entry.markerPlayerId) return '';
        var found = entries(sheetData).filter(function (item) { return item.playerId === entry.markerPlayerId; })[0];
        return found ? found.playerName : '';
    }

    function formatOptions(selected) {
        var formats = ui().formatsOfTournament();
        var html = '<option value="">—</option>';
        formats.catalog.forEach(function (item) {
            var label = core().formatLabel(item, lang());
            html += '<option value="' + esc(label) + '"' + (label === selected ? ' selected' : '') + '>' + esc(label) + '</option>';
        });
        return html;
    }

    function groupSelectHtml(selected) {
        var groups = ui().groupsOf();
        var html = '<option value="">' + esc(bi('— без группы —', '— none —')) + '</option>';
        groups.forEach(function (group) {
            html += '<option value="' + esc(group.id) + '"' + (group.id === selected ? ' selected' : '') + '>' + esc(group.name) + '</option>';
        });
        return html;
    }

    // ----------------------------------------------------------
    // РАЗМЕТКА
    // ----------------------------------------------------------
    function html() {
        var rounds = ui().roundsOf();
        if (!rounds.length) {
            return '<div class="tnm-tab-body">' +
                ui().headHtml('<i class="fas fa-table-list"></i> ' + esc(bi('Стартовый лист', 'Tee sheet')),
                    esc(bi('Сначала добавьте хотя бы один раунд на вкладке «Раунды».', 'Add at least one round on the Rounds tab first.')), '') +
                ui().emptyHtml(bi('Раундов пока нет', 'No rounds yet')) + '</div>';
        }
        var rid = ensureRoundId();
        var roundSelect = '<select data-tnm-edit="sheet-round">' + rounds.map(function (item) {
            return '<option value="' + esc(item.id) + '"' + (item.id === rid ? ' selected' : '') + '>' +
                esc(core().dateRu(item.date) + (item.name ? ' · ' + item.name : '')) + '</option>';
        }).join('') + '</select>';

        var sheetData = sheet();
        var body = '';
        if (!sheetData) {
            body = '<div class="tnm-card tnm-sheet-start">' +
                '<p class="tnm-sub">' + esc(bi('Лист собирается автоматически из участников, групп, выбранных ТИ, формата и раундов турнира. Маркеры и QR-коды назначаются автоматически.',
                    'The sheet is generated from participants, groups, selected tees, format and rounds. Markers and QR codes are assigned automatically.')) + '</p>' +
                optionsHtml() +
                ui().btn('generate-sheet', esc(bi('Создать стартовый лист', 'Generate tee sheet')), { variant: 'primary', icon: 'fas fa-wand-magic-sparkles' }) +
                '</div>';
        } else {
            body = toolbarHtml() + tableHtml(sheetData) + (state.qrOpen ? qrPanelHtml(sheetData) : '');
        }

        return '<div class="tnm-tab-body">' +
            ui().headHtml('<i class="fas fa-table-list"></i> ' + esc(bi('Стартовый лист', 'Tee sheet')),
                esc(bi('Раунд:', 'Round:')) + ' ' + roundSelect, '') +
            body + '</div>';
    }

    function optionsHtml() {
        var o = state.options;
        var round = currentRound() || {};
        var tournament = ui().tournament() || {};
        if (!o.firstTeeTime) o.firstTeeTime = round.startTime || tournament.startTime || '09:00';
        if (!o.tee) o.tee = round.tee || '';
        if (!o.format) o.format = (tournament.formats || [])[0] || '';
        return '<div class="tnm-sheet-options' + (state.optionsOpen ? '' : ' tnm-collapsed-block') + '">' +
            '<div class="tnm-grid-3">' +
            ui().fieldHtml('groupSize', bi('Игроков в группе', 'Players per group'),
                '<input type="number" min="1" max="4" data-tnm-live-edit="sheet-option" data-field="groupSize" value="' + esc(o.groupSize) + '">') +
            ui().fieldHtml('startInterval', bi('Интервал, минут', 'Interval, minutes'),
                '<input type="number" min="1" data-tnm-live-edit="sheet-option" data-field="startInterval" value="' + esc(o.startInterval) + '">') +
            ui().fieldHtml('firstTeeTime', bi('Время первого флая', 'First tee time'),
                '<input type="time" data-tnm-live-edit="sheet-option" data-field="firstTeeTime" value="' + esc(o.firstTeeTime) + '">') +
            ui().fieldHtml('tee', bi('ТИ по умолчанию', 'Default tee'),
                '<select data-tnm-live-edit="sheet-option" data-field="tee">' + ui().teeOptionsHtml(o.tee, true) + '</select>') +
            ui().fieldHtml('format', bi('Формат по умолчанию', 'Default format'),
                '<select data-tnm-live-edit="sheet-option" data-field="format">' + formatOptions(o.format) + '</select>') +
            ui().fieldHtml('markMode', bi('Маркеры', 'Markers'),
                '<select data-tnm-live-edit="sheet-option" data-field="markMode">' +
                '<option value="group"' + (o.markMode === 'group' ? ' selected' : '') + '>' + esc(bi('по группам (следующий игрок)', 'by group (next player)')) + '</option>' +
                '<option value="reverse"' + (o.markMode === 'reverse' ? ' selected' : '') + '>' + esc(bi('по группам (предыдущий игрок)', 'by group (previous player)')) + '</option>' +
                '</select>') +
            ui().fieldHtml('groupsPerFlight', bi('Групп во флайте', 'Groups per flight'),
                '<input type="number" min="1" data-tnm-live-edit="sheet-option" data-field="groupsPerFlight" value="' + esc(o.groupsPerFlight) + '">') +
            '</div>' +
            '<label class="tnm-checkbox"><input type="checkbox" data-tnm-edit="sheet-flights"' + (o.flights ? ' checked' : '') + '> ' +
            esc(bi('Разбивать на флайты', 'Split into flights')) + '</label>' +
            '</div>';
    }

    function toolbarHtml() {
        return '<div class="tnm-sheet-toolbar">' +
            ui().btn('sheet-pdf', esc(bi('PDF с QR', 'PDF with QR')), { variant: 'primary', icon: 'fas fa-file-pdf' }) + ' ' +
            ui().btn('sheet-excel', esc(bi('Excel', 'Excel')), { icon: 'fas fa-file-excel', variant: 'ghost' }) + ' ' +
            ui().btn('sheet-columns', esc(bi('Колонки', 'Columns')), { icon: 'fas fa-table-columns', variant: 'ghost' }) + ' ' +
            ui().btn('sheet-add-player', esc(bi('Добавить игрока', 'Add player')), { icon: 'fas fa-user-plus', variant: 'ghost' }) + ' ' +
            ui().btn('sheet-options-toggle', esc(bi('Параметры листа', 'Sheet options')), { icon: 'fas fa-sliders', variant: 'ghost' }) + ' ' +
            ui().btn('sheet-qr-toggle', esc(bi(state.qrOpen ? 'Скрыть QR' : 'Показать QR', state.qrOpen ? 'Hide QR' : 'Show QR')), { icon: 'fas fa-qrcode', variant: 'ghost' }) + ' ' +
            ui().btn('sheet-regenerate', esc(bi('Пересобрать', 'Regenerate')), { icon: 'fas fa-rotate', variant: 'ghost' }) +
            (state.optionsOpen ? optionsHtml() : '') +
            '</div>';
    }

    function tableHtml(sheetData) {
        var columns = data().sheetColumns(sheetData).filter(function (column) { return column.on !== false; });
        var markers = entries(sheetData);
        var head = columns.map(function (column) {
            return '<th>' + esc(bi(column.ru, column.en)) + '</th>';
        }).join('') + '<th></th>';
        var rows = markers.map(function (entry) {
            var cells = columns.map(function (column) { return cellHtml(column, entry, sheetData); }).join('');
            var remove = '<td class="tnm-row-actions">' +
                '<button type="button" class="tnm-icon-btn" title="' + esc(bi('Убрать из листа', 'Remove from sheet')) +
                '" data-tnm-act="sheet-remove" data-pid="' + esc(entry.playerId) + '"><i class="fas fa-trash"></i></button></td>';
            return '<tr>' + cells + remove + '</tr>';
        }).join('');
        return '<div class="tnm-table-scroll"><table class="tnm-table tnm-sheet-table"><thead><tr>' + head + '</tr></thead><tbody>' +
            (rows || '<tr><td colspan="' + (columns.length + 1) + '">' + esc(bi('Лист пуст', 'Sheet is empty')) + '</td></tr>') +
            '</tbody></table></div>';
    }

    function markerSelectHtml(entry, sheetData) {
        var options = '<option value="">—</option>';
        entries(sheetData).forEach(function (item) {
            options += '<option value="' + esc(item.playerId) + '"' + (item.playerId === entry.markerPlayerId ? ' selected' : '') + '>' +
                esc(item.playerName) + '</option>';
        });
        return '<select data-tnm-edit="sheet-cell" data-pid="' + esc(entry.playerId) + '" data-field="markerPlayerId">' + options + '</select>';
    }

    function cellHtml(column, entry, sheetData) {
        var attrs = 'data-tnm-edit="sheet-cell" data-pid="' + esc(entry.playerId) + '" data-field="' + esc(column.key) + '"';
        var focus = ' data-tnm-focus="sheet-' + esc(column.key) + '-' + esc(entry.playerId) + '"';
        switch (column.key) {
            case 'position':
                return '<td><input type="number" min="1" class="tnm-input-num" ' + attrs + focus + ' value="' + esc(entry.position || '') + '"></td>';
            case 'order':
                return '<td><input type="number" min="1" class="tnm-input-num" ' + attrs + focus + ' value="' + esc(entry.order || '') + '"></td>';
            case 'hi':
            case 'ch':
                return '<td><input type="number" step="0.1" class="tnm-input-num" ' + attrs + focus + ' value="' + esc(entry[column.key] == null ? '' : entry[column.key]) + '"></td>';
            case 'tee':
                return '<td><select ' + attrs + focus + '>' + ui().teeOptionsHtml(entry.tee, true) + '</select></td>';
            case 'format':
                return '<td><select ' + attrs + focus + '>' + formatOptions(entry.format) + '</select></td>';
            case 'groupName':
                return '<td><select ' + attrs + focus + '>' + groupSelectHtml(entry.groupId) + '</select></td>';
            case 'markerName':
                return '<td>' + markerSelectHtml(entry, sheetData) + '</td>';
            case 'flight':
                return '<td><input type="text" class="tnm-input-sm" ' + attrs + focus + ' value="' + esc(entry.flight || '') + '"></td>';
            case 'startTime':
                return '<td><input type="time" ' + attrs + focus + ' value="' + esc(entry.startTime || '') + '"></td>';
            case 'playerName':
                return '<td><input type="text" ' + attrs + focus + ' value="' + esc(entry.playerName || '') + '"></td>';
            default:
                return '<td><input type="text" ' + attrs + focus + ' value="' + esc(entry[column.key] == null ? '' : entry[column.key]) + '"></td>';
        }
    }

    function qrPanelHtml(sheetData) {
        var markers = data().asMap(sheetData.markers);
        var list = Object.keys(markers).map(function (pid) {
            var marker = data().asMap(markers[pid]);
            var payload = marker.qr || core().scoreUrl(ui().baseUrl(), ensureRoundId(), pid, 4);
            return '<div class="tnm-qr-card">' +
                '<img src="' + esc(io().qrUrl(payload, 240)) + '" data-qr="' + esc(payload) + '" alt="QR" width="120" height="120">' +
                '<div class="tnm-qr-title">' + esc(markerTargetsLabel(marker)) + '</div>' +
                '<div class="tnm-muted">' + esc(playerName(pid)) + '</div>' +
                '<div class="tnm-qr-actions">' +
                '<button type="button" class="tnm-btn tnm-btn-ghost tnm-btn-sm" data-tnm-act="sheet-copy-link" data-url="' + esc(payload) + '">' + esc(bi('Ссылка', 'Link')) + '</button>' +
                '<a class="tnm-btn tnm-btn-ghost tnm-btn-sm" href="' + esc(payload) + '" target="_blank" rel="noopener">' + esc(bi('Открыть', 'Open')) + '</a>' +
                '</div></div>';
        }).join('');
        var tournamentQr = asQr(sheetData);
        var header = '<div class="tnm-qr-head">' +
            '<span><i class="fas fa-qrcode"></i> ' + esc(bi('QR-коды маркеров', 'Marker QR codes')) + '</span>' +
            '<label class="tnm-checkbox"><input type="checkbox" data-tnm-edit="sheet-tournament-qr"' + (state.showTournamentQr ? ' checked' : '') + '> ' +
            esc(bi('QR турнира в шапке PDF', 'Tournament QR in PDF header')) + '</label></div>';
        var tQr = tournamentQr ? '<div class="tnm-qr-card tnm-qr-tournament">' +
            '<img src="' + esc(io().qrUrl(tournamentQr, 240)) + '" data-qr="' + esc(tournamentQr) + '" alt="QR" width="120" height="120">' +
            '<div class="tnm-qr-title">' + esc(bi('Турнир', 'Tournament')) + '</div>' +
            '<div class="tnm-muted">' + esc((ui().tournament() || {}).name || '') + '</div></div>' : '';
        return '<div class="tnm-qr-panel">' + header + '<div class="tnm-qr-grid">' + (list || ui().emptyHtml(bi('QR-кодов пока нет', 'No QR codes yet'))) + tQr + '</div></div>';
    }

    function asQr(sheetData) {
        var qr = data().asMap(sheetData.qr);
        if (qr.payload) return qr.payload;
        var tournament = ui().tournament() || {};
        return tournament.id || ui().state.route.tid ? (ui().baseUrl() + 'tournaments.html?id=' + encodeURIComponent(ui().state.route.tid)) : '';
    }

    function markerTargetsLabel(marker) {
        var targets = Object.keys(data().asMap(marker.targets)).map(playerName).filter(Boolean);
        if (!targets.length) return bi('Маркер группы', 'Group marker');
        return bi('Маркер: ', 'Marker for: ') + targets.join(', ');
    }

    function playerName(pid) {
        var player = ui().playerOf(pid);
        return player ? core().playerFio(player) : pid;
    }

    // ----------------------------------------------------------
    // ДЕЙСТВИЯ
    // ----------------------------------------------------------
    function generate() {
        var rid = ensureRoundId();
        if (!rid) { ui().toastMsg(bi('Сначала добавьте раунд', 'Add a round first'), 'error'); return; }
        if (ui().state.sheetBusy) return;
        ui().state.sheetBusy = true;
        ui().toastMsg(bi('Собираем стартовый лист…', 'Generating the tee sheet…'), 'info');
        data().generateSheet(ui().state.route.tid, rid, Object.assign({}, state.options), ui().tournament()).then(function () {
            ui().state.sheetBusy = false;
            state.optionsOpen = false;
            ui().toastMsg(bi('✅ Стартовый лист создан', '✅ Tee sheet generated'));
        }).catch(function (err) {
            ui().state.sheetBusy = false;
            ui().toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    function updateCell(input) {
        var pid = input.getAttribute('data-pid');
        var field = input.getAttribute('data-field');
        var value = input.value;
        var numeric = ['position', 'order', 'hi', 'ch'].indexOf(field) !== -1;
        var patch = {};
        patch[field] = numeric ? (value === '' ? null : core().num(value, 0)) : value;
        if (field === 'playerName') patch.playerName = core().trim(value);
        if (field === 'groupId') {
            var group = ui().groupsOf().filter(function (item) { return item.id === value; })[0];
            patch.groupName = group ? group.name : '';
        }
        data().updateSheetEntry(ui().state.route.tid, ensureRoundId(), pid, patch, ui().tournament()).then(function () {
            // Правки листа синхронизируются с участниками и группами —
            // перерисовку отдаём подписке на турнир, но подсветим успех.
            ui().toastMsg(bi('Сохранено', 'Saved'), 'success');
        }).catch(function (err) {
            ui().toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    function exportPdf() {
        var sheetData = sheet();
        if (!sheetData) return;
        var tournament = ui().tournament() || {};
        var round = currentRound() || {};
        var markerIds = {};
        entries(sheetData).forEach(function (entry) { if (entry.markerPlayerId) markerIds[entry.markerPlayerId] = true; });
        var enriched = entries(sheetData).map(function (entry) {
            return Object.assign({}, entry, {
                markerName: markerName(sheetData, entry),
                isMarker: !!markerIds[entry.playerId],
                qr: entry.qr || core().scoreUrl(ui().baseUrl(), ensureRoundId(), entry.playerId, 4)
            });
        });
        var htmlDoc = core().sheetHtml({
            title: bi('Стартовый лист', 'Tee sheet'),
            tournamentName: tournament.name || '',
            roundDate: round.date || '',
            course: round.course || tournament.course || '',
            entries: enriched,
            lang: lang(),
            tournamentQr: state.showTournamentQr ? asQr(sheetData) : ''
        });
        io().printHtml(htmlDoc);
    }

    function exportExcel() {
        var sheetData = sheet();
        if (!sheetData) return;
        var tournament = ui().tournament() || {};
        var round = currentRound() || {};
        var enriched = entries(sheetData).map(function (entry) {
            return Object.assign({}, entry, { markerName: markerName(sheetData, entry) });
        });
        io().exportExcel('Startovyy_list_' + (core().dateIso(round.date) || ''), [
            { name: bi('Стартовый лист', 'Tee sheet'), rows: core().sheetRows(enriched, lang()) },
            { name: bi('Турнир', 'Tournament'), rows: [['Турнир', tournament.name || ''], ['Дата', core().dateRu(round.date || '')], ['Поле', round.course || tournament.course || '']] }
        ]);
    }

    function columnsModalHtml() {
        var sheetData = sheet();
        if (!sheetData) return '';
        var columns = data().sheetColumns(sheetData);
        var rows = columns.map(function (column, index) {
            return '<div class="tnm-col-row">' +
                '<label class="tnm-checkbox"><input type="checkbox" data-tnm-col="' + esc(column.key) + '"' + (column.on !== false ? ' checked' : '') + '> ' +
                esc(bi(column.ru, column.en)) + '</label>' +
                '<span class="tnm-col-move">' +
                '<button type="button" class="tnm-icon-btn" data-tnm-act="column-move" data-key="' + esc(column.key) + '" data-dir="-1"' + (index === 0 ? ' disabled' : '') + '><i class="fas fa-arrow-up"></i></button>' +
                '<button type="button" class="tnm-icon-btn" data-tnm-act="column-move" data-key="' + esc(column.key) + '" data-dir="1"' + (index === columns.length - 1 ? ' disabled' : '') + '><i class="fas fa-arrow-down"></i></button>' +
                '</span></div>';
        }).join('');
        return '<div class="tnm-modal-overlay" data-tnm-act="close-modal">' +
            '<div class="tnm-modal" data-tnm-stop="1">' +
            '<h3>' + esc(bi('Колонки стартового листа', 'Tee sheet columns')) + '</h3>' +
            '<p class="tnm-sub">' + esc(bi('Колонки хранятся в данных листа: включите нужные и расставьте порядок. Так же строится PDF и Excel.',
                'Columns are stored in the sheet data: enable the ones you need and set the order. PDF and Excel follow it.')) + '</p>' +
            '<div class="tnm-modal-body">' + rows + '</div>' +
            '<div class="tnm-modal-actions">' + ui().btn('close-modal', esc(bi('Готово', 'Done')), { variant: 'primary' }) + '</div>' +
            '</div></div>';
    }

    function saveColumns(columns) {
        data().saveSheetColumns(ui().state.route.tid, ensureRoundId(), columns).catch(function (err) {
            ui().toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    function moveColumn(key, dir) {
        var sheetData = sheet();
        if (!sheetData) return;
        var columns = data().sheetColumns(sheetData);
        var index = columns.map(function (column) { return column.key; }).indexOf(key);
        var target = index + (parseInt(dir, 10) || 0);
        if (index === -1 || target < 0 || target >= columns.length) return;
        var swap = columns[index];
        columns[index] = columns[target];
        columns[target] = swap;
        saveColumns(columns);
        ui().render();
    }

    function addPlayerModalHtml() {
        var sheetData = sheet();
        var existing = {};
        entries(sheetData).forEach(function (entry) { existing[entry.playerId] = true; });
        var candidates = ui().playersOf().filter(function (player) { return !existing[player.id]; });
        var rows = candidates.map(function (player) {
            return '<label class="tnm-dir-row"><input type="checkbox" data-tnm-sheet-add="' + esc(player.id) + '">' +
                '<span>' + esc(core().playerFio(player)) + '</span>' +
                '<span class="tnm-muted">' + esc(core().fmtHcp(core().effectiveHcp(player))) + '</span></label>';
        }).join('');
        return '<div class="tnm-modal-overlay" data-tnm-act="close-modal">' +
            '<div class="tnm-modal" data-tnm-stop="1">' +
            '<h3>' + esc(bi('Добавить игрока в лист', 'Add player to the sheet')) + '</h3>' +
            '<div class="tnm-modal-body tnm-dir-list">' + (rows || ui().emptyHtml(bi('Все участники уже в листе', 'All participants are already in the sheet'))) + '</div>' +
            '<div class="tnm-modal-actions">' +
            ui().btn('sheet-add-confirm', esc(bi('Добавить', 'Add')), { variant: 'primary' }) +
            ui().btn('close-modal', esc(bi('Отмена', 'Cancel')), { variant: 'ghost' }) +
            '</div></div></div>';
    }

    function addSelectedPlayers() {
        var host = ui().rootEl();
        var sheetData = sheet();
        if (!host || !sheetData) return;
        var checked = host.querySelectorAll('[data-tnm-sheet-add]:checked');
        if (!checked.length) { ui().toastMsg(bi('Никто не выбран', 'Nobody selected'), 'warn'); return; }
        var order = entries(sheetData).length;
        var chain = Promise.resolve();
        checked.forEach(function (box) {
            var player = ui().playerOf(box.getAttribute('data-tnm-sheet-add')) || {};
            var group = data().groupForPlayer(ui().tournament(), player);
            order++;
            var entry = {
                playerId: player.id,
                playerName: core().playerFio(player),
                firstName: player.firstName || '', lastName: player.lastName || '', middleName: player.middleName || '',
                gender: player.gender || '', hi: player.hi == null ? '' : player.hi, ch: player.ch == null ? '' : player.ch,
                groupId: group ? group.id : '', groupName: group ? group.name : '',
                markerPlayerId: '', tee: player.tee || state.options.tee || '',
                format: player.format || state.options.format || '',
                flight: '', startTime: state.options.firstTeeTime, position: 1, order: order, isMarker: false,
                qr: core().scoreUrl(ui().baseUrl(), ensureRoundId(), player.id, 4)
            };
            chain = chain.then(function () {
                return data().addSheetEntry(ui().state.route.tid, ensureRoundId(), entry, ui().tournament());
            });
        });
        chain.then(function () {
            ui().closeModal();
            ui().toastMsg(bi('Игроки добавлены в лист', 'Players added to the sheet'));
        }).catch(function (err) {
            ui().toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    function removeEntry(pid) {
        data().removeSheetEntry(ui().state.route.tid, ensureRoundId(), pid, ui().tournament()).then(function () {
            ui().toastMsg(bi('Игрок убран из листа', 'Player removed from the sheet'));
        }).catch(function (err) {
            ui().toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    // ----------------------------------------------------------
    // ПРИВЯЗКА
    // ----------------------------------------------------------
    function mount() {
        var host = ui().rootEl();
        if (!host || host.__tnmSheetBound) return;
        host.__tnmSheetBound = true;
        host.addEventListener('change', function (event) {
            var colBox = event.target.closest('[data-tnm-col]');
            if (colBox) {
                var sheetData = sheet();
                if (!sheetData) return;
                var columns = data().sheetColumns(sheetData);
                columns.forEach(function (column) {
                    if (column.key === colBox.getAttribute('data-tnm-col')) column.on = colBox.checked;
                });
                saveColumns(columns);
                ui().render();
                return;
            }
            var optionInput = event.target.closest('[data-tnm-live-edit="sheet-option"]');
            if (optionInput) {
                var field = optionInput.getAttribute('data-field');
                state.options[field] = ['groupSize', 'startInterval', 'groupsPerFlight'].indexOf(field) !== -1
                    ? core().intOf(optionInput.value, state.options[field]) : optionInput.value;
                return;
            }
            if (event.target.closest('[data-tnm-edit="sheet-flights"]')) {
                state.options.flights = event.target.checked;
                return;
            }
            if (event.target.closest('[data-tnm-edit="sheet-tournament-qr"]')) {
                state.showTournamentQr = event.target.checked;
                ui().render();
            }
        });
        host.addEventListener('input', function (event) {
            var optionInput = event.target.closest('[data-tnm-live-edit="sheet-option"]');
            if (!optionInput) return;
            var field = optionInput.getAttribute('data-field');
            if (['groupSize', 'startInterval', 'groupsPerFlight'].indexOf(field) !== -1) {
                state.options[field] = core().intOf(optionInput.value, state.options[field]);
            } else {
                state.options[field] = optionInput.value;
            }
        });
    }

    // ----------------------------------------------------------
    // РЕГИСТРАЦИЯ ДЕЙСТВИЙ
    // ----------------------------------------------------------
    ui().on('generate-sheet', generate);
    ui().on('sheet-regenerate', generate);
    ui().on('sheet-options-toggle', function () { state.optionsOpen = !state.optionsOpen; ui().render(); });
    ui().on('sheet-qr-toggle', function () { state.qrOpen = !state.qrOpen; ui().render(); });
    ui().on('sheet-pdf', exportPdf);
    ui().on('sheet-excel', exportExcel);
    ui().on('sheet-columns', function () {
        ui().state.sheetBusy = false;
        ui().closeModal();
        ui().openModal('sheet-columns', {});
    });
    ui().on('sheet-add-player', function () { ui().openModal('sheet-add-player', {}); });
    ui().on('sheet-add-confirm', addSelectedPlayers);
    ui().on('column-move', function (button) {
        moveColumn(button.getAttribute('data-key'), button.getAttribute('data-dir'));
    });
    ui().on('sheet-copy-link', function (button) {
        var url = button.getAttribute('data-url') || '';
        if (typeof root.copyOrShare === 'function') root.copyOrShare(url);
        else if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(url);
        ui().toastMsg(bi('Ссылка скопирована', 'Link copied'));
    });
    ui().on('edit:sheet-round', function (select) {
        ui().navigate({ view: 'card', tid: ui().state.route.tid, tab: 'sheet', rid: select.value });
    });
    ui().on('edit:sheet-cell', function (input) { updateCell(input); });
    ui().on('sheet-remove', function (button) {
        var pid = button.getAttribute('data-pid');
        var question = bi('Убрать игрока из стартового листа?', 'Remove the player from the tee sheet?');
        ui().confirmAction({
            title: bi('Удаление из листа', 'Remove from the sheet'),
            message: question,
            onConfirm: function () { removeEntry(pid); }
        });
    });

    ui().modal('sheet-columns', function () { return columnsModalHtml(); });
    ui().modal('sheet-add-player', function () { return addPlayerModalHtml(); });

    return {
        html: html, mount: mount, entries: entries, sheet: sheet, currentRound: currentRound,
        state: state, generate: generate
    };
})(typeof window !== 'undefined' ? window : this);
