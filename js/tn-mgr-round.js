// ============================================================
// TN-MGR-ROUND — экран раунда (Счёт и Результаты) и карточка игрока
// ------------------------------------------------------------
// ТЗ §4: шапка (турнир, клуб, поле, дата), кнопки «Экспорт» (PDF и
// Excel) и «Стартовый лист», вкладки «Счёт»/«Результаты»,
// информационная строка (ТИ и формат), динамические фильтры по
// группам, таблица с лунками 1–18 и строками «Длина», «Пар»,
// «Индекс», редактирование ударов прямо в таблице.
//
// ТЗ §5: карточка игрока — ФИО, HI, CH, экспорт в PDF, пар поля,
// таблица по лункам (длина, пар, индекс, фора, удары, очки гросс,
// очки нетто) и ручное редактирование HI, CH, форы и ударов.
//
// ТЗ §6: результаты — игрок, счёт, квалификационные очки
// стэйблфорда, сортировка по клику на заголовок, фильтры по
// группам, экспорт PDF/Excel, ручные правки, подсветка призёров.
//
// Счёт читается из rounds/<groupRoundId> (страницы ввода счёта) и
// дублируется в tournaments/<id>/scores — правки организатора
// попадают сразу в оба места.
// ============================================================
var TnMgrRoundUI = (function (root) {
    'use strict';

    function ui() { return root.TnMgrUI; }
    function core() { return root.TnMgrCore; }
    function data() { return root.TnMgrData; }
    function io() { return root.TnMgrIO; }
    function esc(value) { return core().esc(value); }
    function bi(ru, en) { return ui().bi(ru, en); }
    function lang() { return ui().lang(); }

    var roundState = {
        rid: '',
        groupRounds: {},
        mirror: {},
        overrides: {},
        watchers: [],
        editingCell: null
    };
    var unsubscribe = [];
    var scorecardLayoutRid = '';
    var scorecardLayoutState = null;
    var scorecardNewBlockType = 'custom';

    // ----------------------------------------------------------
    // ДАННЫЕ РАУНДА
    // ----------------------------------------------------------
    function round() {
        var rid = ui().state.route.rid || firstRoundId();
        return ui().roundOf(rid) || null;
    }
    function rid() { return ui().state.route.rid || firstRoundId(); }
    function firstRoundId() {
        var rounds = ui().roundsOf();
        return rounds.length ? rounds[0].id : '';
    }

    function tournament() { return ui().tournament() || {}; }

    /** Счёт по всем источникам: раунды групп + зеркало турнира. */
    function mergedScores() {
        var out = {};
        Object.keys(roundState.groupRounds).forEach(function (gid) {
            var groupRound = roundState.groupRounds[gid] || {};
            Object.keys(data().asMap(groupRound.players)).forEach(function (pid) {
                var scores = data().asMap(data().asMap(groupRound.players)[pid].scores);
                Object.keys(scores).forEach(function (hole) {
                    if (scores[hole] == null) return;
                    out[pid] = out[pid] || {};
                    if (out[pid][hole] == null) out[pid][hole] = scores[hole];
                });
            });
        });
        Object.keys(roundState.mirror).forEach(function (pid) {
            Object.keys(data().asMap(roundState.mirror[pid])).forEach(function (hole) {
                var value = data().asMap(roundState.mirror[pid])[hole];
                if (value == null) return;
                out[pid] = out[pid] || {};
                out[pid][hole] = value;
            });
        });
        return out;
    }

    function courseApi() {
        return {
            par: function (hole) { return typeof root.holePar === 'function' ? root.holePar(hole) : (root.TnMgrCore.defaultCourse().par(hole)); },
            si: function (hole) { return typeof root.holeHcp === 'function' ? root.holeHcp(hole) : (root.TnMgrCore.defaultCourse().si(hole)); },
            dist: function (hole, tee) { return typeof root.holeDist === 'function' ? root.holeDist(hole, tee) : (root.TnMgrCore.defaultCourse().dist(hole, tee)); }
        };
    }

    function teeOf(player, entry) {
        return (entry && entry.tee) || (player && player.tee) || defaultTeeOf(player);
    }
    function defaultTeeOf(player) {
        var gender = core().normalizeGender(player && player.gender);
        return gender === 'women' ? 'rd' : 'wh';
    }
    function chOf(player) {
        if (!player) return 0;
        if (player.ch != null && player.ch !== '') return core().intOf(player.ch, 0);
        return 0;
    }
    function cardFor(player, sheetEntry) {
        var scores = mergedScores()[player.id] || {};
        return core().playerCard(scores, courseApi(), teeOf(player, sheetEntry), chOf(player), { fores: player.fores || {} });
    }

    /** Состав раунда: игроки стартового листа, иначе участники турнира. */
    function roundPlayers() {
        var sheet = ui().sheetOf(rid());
        if (sheet) {
            var list = [];
            Object.keys(data().asMap(sheet.entries)).forEach(function (pid) {
                var player = ui().playerOf(pid);
                if (player) list.push(Object.assign({}, player, { _entry: data().asMap(sheet.entries)[pid] }));
            });
            list.sort(function (a, b) { return (a._entry.order || 0) - (b._entry.order || 0); });
            if (list.length) return list;
        }
        return ui().playersOf();
    }

    function playerGroupName(player) {
        var group = ui().groupsOf().filter(function (item) { return item.id === player.groupId; })[0];
        return group ? (group.name || '') : '';
    }

    /** Фильтры по группам формируются из данных турнира. */
    function filterButtons() {
        var players = roundPlayers();
        var counts = {
            all: players.length,
            men: players.filter(function (p) { return core().normalizeGender(p.gender) === 'men'; }).length,
            women: players.filter(function (p) { return core().normalizeGender(p.gender) === 'women'; }).length,
            none: players.filter(function (p) { return !playerGroupName(p); }).length
        };
        var buttons = [
            { key: 'all', label: bi('Все', 'All'), count: counts.all },
            { key: 'men', label: bi('Мужчины', 'Men'), count: counts.men },
            { key: 'women', label: bi('Женщины', 'Ladies'), count: counts.women },
            { key: 'none', label: bi('Без группы', 'No group'), count: counts.none }
        ];
        ui().groupsOf().forEach(function (group) {
            buttons.push({
                key: group.id, label: group.name || bi('Группа', 'Group'),
                count: players.filter(function (p) { return p.groupId === group.id; }).length
            });
        });
        return buttons.filter(function (button) { return button.count > 0 || button.key === 'all'; });
    }

    function filteredPlayers() {
        var filter = ui().state.groupFilter || 'all';
        var players = roundPlayers();
        if (filter === 'all') return players;
        if (filter === 'men') return players.filter(function (p) { return core().normalizeGender(p.gender) === 'men'; });
        if (filter === 'women') return players.filter(function (p) { return core().normalizeGender(p.gender) === 'women'; });
        if (filter === 'none') return players.filter(function (p) { return !playerGroupName(p); });
        return players.filter(function (p) { return p.groupId === filter; });
    }

    function formatOf(player) {
        var tournamentFormats = tournament().formats || [];
        var entry = player._entry || {};
        var group = ui().groupsOf().filter(function (item) { return item.id === player.groupId; })[0];
        var name = entry.format || player.format || (group && group.format) || tournamentFormats[0] || '';
        var item = ui().catalog().filter(function (f) { return core().formatLabel(f) === name || f.id === core().formatId(name); })[0];
        return { name: name, item: item, scoring: core().formatScoring(item || name) };
    }

    // ----------------------------------------------------------
    // РАЗМЕТКА: ШАПКА И ВКЛАДКИ
    // ----------------------------------------------------------
    function roundHtml() {
        var t = tournament();
        var currentRound = round();
        if (!currentRound) {
            return '<div class="tnm-view">' + ui().headHtml('<i class="fas fa-golf-ball-tee"></i> ' + esc(bi('Раунд', 'Round')), '', ui().backBtn()) +
                ui().emptyHtml(bi('Раунд не найден', 'Round not found')) + '</div>';
        }
        if (ui().state.route.tab === 'scorecards') return scorecardsPageHtml();
        var meta = [
            t.name || '',
            currentRound.club || t.club || '',
            currentRound.course || t.course || '',
            core().dateRu(currentRound.date || '')
        ].filter(Boolean).join(' · ');
        var tabs = [
            { key: 'score', ru: 'Счёт', en: 'Score' },
            { key: 'results', ru: 'Результаты', en: 'Results' }
        ].map(function (tab) {
            return '<button type="button" class="tnm-tab' + (ui().state.route.tab === tab.key ? ' active' : '') +
                '" data-tnm-act="round-tab" data-tab="' + tab.key + '">' + esc(bi(tab.ru, tab.en)) + '</button>';
        }).join('');
        return '<div class="tnm-view">' +
            '<div class="tnm-card-head">' + ui().backBtn() +
            '<div class="tnm-card-title"><h2>' + esc(t.name || bi('Раунд', 'Round')) + '</h2>' +
            '<p class="tnm-sub">' + esc(meta) + '</p></div>' +
            '<div class="tnm-view-head-actions">' +
            ui().btn('round-export-pdf', esc(bi('Экспорт PDF', 'Export PDF')), { icon: 'fas fa-file-pdf' }) + ' ' +
            ui().btn('round-export-excel', esc(bi('Экспорт Excel', 'Export Excel')), { icon: 'fas fa-file-excel', variant: 'ghost' }) + ' ' +
            ui().btn('round-scorecards', esc(bi('Счётные карточки', 'Scorecards')), { icon: 'fas fa-id-card', variant: 'ghost' }) + ' ' +
            ui().btn('round-open-sheet', esc(bi('Стартовый лист', 'Tee sheet')), { icon: 'fas fa-table-list', variant: 'ghost' }) +
            '</div></div>' +
            '<div class="tnm-tabs">' + tabs + '</div>' +
            (ui().state.route.tab === 'results' ? resultsHtml() : scoreHtml()) +
            '</div>';
    }

    function activeScorecardLayout() {
        if (scorecardLayoutRid !== rid() || !scorecardLayoutState) {
            var current = round() || {};
            scorecardLayoutRid = rid();
            scorecardLayoutState = core().normalizedScorecardLayout(current.scorecardLayout || core().defaultScorecardLayout());
        }
        return scorecardLayoutState;
    }

    function scorecardItems() {
        var sheet = ui().sheetOf(rid()) || {};
        var sheetEntries = data().asMap(sheet.entries);
        var players = roundPlayers();
        var scoresByPlayer = mergedScores();
        var list = data().sheetOrder ? data().sheetOrder(sheet) : Object.keys(sheetEntries).map(function (pid) { return sheetEntries[pid]; });
        return players.map(function (player) {
            var entry = player._entry || sheetEntries[player.id] || {};
            var groupSize = list.filter(function (item) {
                return entry.startGroupId ? item.startGroupId === entry.startGroupId :
                    item.flight === entry.flight && item.startTime === entry.startTime && item.startHole === entry.startHole;
            }).length || 1;
            var markerId = entry.markerPlayerId || '';
            var marker = markerId ? ui().playerOf(markerId) : null;
            var markerEntry = markerId ? sheetEntries[markerId] : null;
            var markerName = marker ? core().playerFio(marker) : (markerEntry && markerEntry.playerName) || '';
            var markerScores = {};
            Object.keys(roundState.groupRounds).some(function (groupRoundId) {
                var group = roundState.groupRounds[groupRoundId] || {};
                var record = data().asMap(group.players)[player.id];
                if (!record) return false;
                var byMarker = data().asMap(record.markerScores);
                var values = data().asMap(byMarker[markerId] || (record.markedBy && byMarker[record.markedBy]));
                Object.keys(values).forEach(function (hole) { markerScores[hole] = values[hole]; });
                return true;
            });
            var tee = teeOf(player, entry);
            var exactHcp = entry.hi != null && entry.hi !== '' ? entry.hi : player.hi;
            var fieldHcp = entry.ch != null && entry.ch !== '' ? core().intOf(entry.ch, 0) : chOf(player);
            var card = core().playerCard(scoresByPlayer[player.id] || {}, courseApi(), tee, fieldHcp, { fores: player.fores || {} });
            var payload = entry.qr || core().scoreUrl(ui().baseUrl(), entry.groupRoundId || rid(), markerId || player.id,
                markerId && markerId !== player.id ? Math.max(2, groupSize) : groupSize);
            return {
                player: Object.assign({}, player, { hi: exactHcp, ch: fieldHcp }),
                entry: entry,
                card: card,
                markerScores: markerScores,
                markerName: markerName,
                qr: payload
            };
        });
    }

    function scorecardEditorHtml(layout) {
        var types = [
            ['player', bi('Имя игрока', 'Player name')],
            ['details', bi('Турнир и старт', 'Tournament and start')],
            ['handicap', bi('Гандикапы', 'Handicaps')],
            ['qr', 'QR'],
            ['playerScores', bi('Счёт игрока', 'Player score')],
            ['markerScores', bi('Счёт маркера', 'Marker score')],
            ['custom', bi('Текстовый элемент', 'Custom text')]
        ];
        function typeOptions(selected) {
            return types.map(function (item) {
                return '<option value="' + item[0] + '"' + (selected === item[0] ? ' selected' : '') + '>' + esc(item[1]) + '</option>';
            }).join('');
        }
        var rows = layout.blocks.map(function (block, index) {
            return '<fieldset class="tnm-scorecard-block-editor"><legend>' + esc(block.label || block.type) + '</legend>' +
                '<div class="tnm-scorecard-editor-top"><label>' + esc(bi('Элемент', 'Block')) +
                '<select data-tnm-edit="scorecard-layout" data-block="' + esc(block.id) + '" data-field="type">' + typeOptions(block.type) + '</select></label>' +
                '<label>' + esc(bi('Название', 'Label')) + '<input type="text" data-tnm-edit="scorecard-layout" data-block="' + esc(block.id) +
                '" data-field="label" value="' + esc(block.label) + '"></label>' +
                (block.type === 'custom' ? '<label>' + esc(bi('Текст', 'Text')) + '<input type="text" data-tnm-edit="scorecard-layout" data-block="' + esc(block.id) +
                    '" data-field="text" value="' + esc(block.text) + '"></label>' : '') +
                '<label class="tnm-checkbox"><input type="checkbox" data-tnm-edit="scorecard-layout" data-block="' + esc(block.id) +
                '" data-field="visible"' + (block.visible ? ' checked' : '') + '> ' + esc(bi('Показывать', 'Visible')) + '</label>' +
                '<span class="tnm-scorecard-order">' +
                '<button type="button" class="tnm-icon-btn" data-tnm-act="scorecard-move-block" data-id="' + esc(block.id) + '" data-dir="up"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
                '<button type="button" class="tnm-icon-btn" data-tnm-act="scorecard-move-block" data-id="' + esc(block.id) + '" data-dir="down"' + (index === layout.blocks.length - 1 ? ' disabled' : '') + '>↓</button>' +
                '<button type="button" class="tnm-icon-btn" data-tnm-act="scorecard-remove-block" data-id="' + esc(block.id) + '" title="' + esc(bi('Удалить элемент', 'Remove block')) + '">×</button></span></div>' +
                '<div class="tnm-scorecard-editor-geometry">' +
                [['x', bi('Слева %', 'Left %'), block.x], ['y', bi('Сверху %', 'Top %'), block.y],
                    ['w', bi('Ширина %', 'Width %'), block.w], ['h', bi('Высота %', 'Height %'), block.h],
                    ['fontSize', bi('Размер текста', 'Text size'), block.fontSize]].map(function (field) {
                    return '<label>' + esc(field[1]) + '<input type="number" min="0" max="100" step="1" data-tnm-edit="scorecard-layout" data-block="' +
                        esc(block.id) + '" data-field="' + field[0] + '" value="' + esc(field[2]) + '"></label>';
                }).join('') + '</div></fieldset>';
        }).join('');
        return '<div class="tnm-scorecard-editor"><div class="tnm-scorecard-editor-toolbar">' +
            '<label>' + esc(bi('Вид карточки', 'Card theme')) + '<select data-tnm-edit="scorecard-layout" data-field="theme">' +
            '<option value="classic"' + (layout.theme === 'classic' ? ' selected' : '') + '>' + esc(bi('Классический', 'Classic')) + '</option>' +
            '<option value="minimal"' + (layout.theme === 'minimal' ? ' selected' : '') + '>' + esc(bi('Минимальный', 'Minimal')) + '</option>' +
            '<option value="contrast"' + (layout.theme === 'contrast' ? ' selected' : '') + '>' + esc(bi('Контрастный', 'High contrast')) + '</option>' +
            '</select></label><label>' + esc(bi('Добавить элемент', 'Add block')) +
            '<select data-tnm-edit="scorecard-layout" data-field="newType">' + typeOptions(scorecardNewBlockType) + '</select></label>' +
            ui().btn('scorecard-add-block', esc(bi('Добавить', 'Add')), { variant: 'ghost', icon: 'fas fa-plus' }) +
            '<span class="tnm-muted">' + esc(bi('Позиция и размер задаются в процентах от листа A4.', 'Position and size are percentages of the A4 sheet.')) + '</span></div>' + rows + '</div>';
    }

    function scorecardsPageHtml() {
        var layout = activeScorecardLayout();
        var currentRound = round() || {};
        var t = tournament();
        var common = {
            tournamentName: t.name || '', roundDate: currentRound.date || '',
            courseName: currentRound.course || t.course || '', lang: lang(), layout: layout
        };
        var cards = scorecardItems();
        var preview = cards.map(function (item) {
            return core().scorecardMarkup(Object.assign({}, common, item));
        }).join('');
        return '<div class="tnm-view tnm-scorecards-page"><div class="tnm-card-head">' +
            ui().btn('scorecards-back', esc(bi('← К раунду', '← Back to round')), { variant: 'ghost' }) +
            '<div class="tnm-card-title"><h2>' + esc(bi('Счётные карточки турнира', 'Tournament scorecards')) + '</h2>' +
            '<p class="tnm-sub">' + esc((t.name || '') + (currentRound.date ? ' · ' + core().dateRu(currentRound.date) : '') +
                ' · ' + cards.length + ' ' + bi('карточек', 'cards')) + '</p></div>' +
            '<div class="tnm-view-head-actions">' + ui().btn('scorecards-print', esc(bi('Печать всех карточек', 'Print all cards')), { variant: 'primary', icon: 'fas fa-print' }) +
            '</div></div><div class="tnm-scorecard-page-layout"><section class="tnm-card"><h3>' + esc(bi('Раскладка', 'Layout')) + '</h3>' +
            scorecardEditorHtml(layout) + '</section><section class="tnm-card"><h3>' + esc(bi('Предпросмотр всех карточек', 'Preview all scorecards')) + '</h3>' +
            (preview ? '<div class="tnm-scorecards-preview">' + preview + '</div>' : ui().emptyHtml(bi('В раунде пока нет игроков', 'No players in this round yet'))) +
            '</section></div></div>';
    }

    function persistScorecardLayout() {
        var layout = core().normalizedScorecardLayout(scorecardLayoutState || core().defaultScorecardLayout());
        scorecardLayoutState = layout;
        return data().saveScorecardLayout(ui().state.route.tid, rid(), layout).then(function () {
            ui().render();
        }).catch(function (err) {
            ui().toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    function updateScorecardLayout(input) {
        var layout = activeScorecardLayout();
        var field = input.getAttribute('data-field');
        var id = input.getAttribute('data-block');
        if (field === 'theme') layout.theme = input.value;
        else if (field === 'newType') scorecardNewBlockType = input.value;
        else {
            var block = layout.blocks.filter(function (item) { return item.id === id; })[0];
            if (!block) return;
            if (field === 'visible') block.visible = !!input.checked;
            else if (['x', 'y', 'w', 'h', 'fontSize'].indexOf(field) !== -1) block[field] = core().num(input.value, block[field]);
            else if (field === 'type') block.type = input.value;
            else if (field === 'label') block.label = input.value;
            else if (field === 'text') block.text = input.value;
        }
        scorecardLayoutState = core().normalizedScorecardLayout(layout);
        persistScorecardLayout();
    }

    function addScorecardBlock() {
        var layout = activeScorecardLayout();
        var maxZ = layout.blocks.reduce(function (max, block) { return Math.max(max, block.zIndex || 0); }, 0);
        var type = scorecardNewBlockType || 'custom';
        var names = {
            player: bi('Имя игрока', 'Player name'), details: bi('Турнир и старт', 'Tournament and start'),
            handicap: bi('Гандикапы', 'Handicaps'), qr: 'QR', playerScores: bi('Счёт игрока', 'Player score'),
            markerScores: bi('Счёт маркера', 'Marker score'), custom: bi('Новый элемент', 'New item')
        };
        layout.blocks.push({ id: 'extra_' + Date.now(), type: type, label: names[type] || names.custom, text: '',
            x: 5, y: Math.min(92, 4 + layout.blocks.length * 4), w: 30, h: 8, fontSize: 10, zIndex: maxZ + 1, visible: true });
        scorecardLayoutState = layout;
        persistScorecardLayout();
    }

    function moveScorecardBlock(button) {
        var layout = activeScorecardLayout();
        var index = layout.blocks.map(function (block) { return block.id; }).indexOf(button.getAttribute('data-id'));
        var offset = button.getAttribute('data-dir') === 'up' ? -1 : 1;
        var target = index + offset;
        if (index < 0 || target < 0 || target >= layout.blocks.length) return;
        var savedZ = layout.blocks[index].zIndex;
        layout.blocks[index].zIndex = layout.blocks[target].zIndex;
        layout.blocks[target].zIndex = savedZ;
        var moved = layout.blocks.splice(index, 1)[0];
        layout.blocks.splice(target, 0, moved);
        scorecardLayoutState = layout;
        persistScorecardLayout();
    }

    function removeScorecardBlock(button) {
        var layout = activeScorecardLayout();
        layout.blocks = layout.blocks.filter(function (block) { return block.id !== button.getAttribute('data-id'); });
        if (!layout.blocks.length) layout.blocks = core().defaultScorecardLayout().blocks;
        scorecardLayoutState = layout;
        persistScorecardLayout();
    }

    function exportScorecards() {
        var currentRound = round() || {};
        var t = tournament();
        var common = {
            title: bi('Счётные карточки турнира', 'Tournament scorecards'),
            tournamentName: t.name || '', roundDate: currentRound.date || '',
            courseName: currentRound.course || t.course || '',
            layout: activeScorecardLayout(), lang: lang(), cards: scorecardItems()
        };
        io().printHtml(core().scorecardsHtml(common));
    }

    // ----------------------------------------------------------
    // ВКЛАДКА «СЧЁТ»
    // ----------------------------------------------------------
    function scoreHtml() {
        var players = filteredPlayers();
        if (!players.length) {
            return '<div class="tnm-tab-body">' + filtersHtml() + ui().emptyHtml(bi('Нет игроков для этого фильтра', 'No players for this filter')) + '</div>';
        }
        // Информационная строка: ТИ и формат (по первому игроку выборки).
        var sample = players[0];
        var sampleFormat = formatOf(sample);
        var sampleTee = teeOf(sample, sample._entry);
        var info = '<div class="tnm-info-line">' +
            '<span><i class="fas fa-golf-ball-tee"></i> ' + esc(bi('ТИ', 'Tee')) + ': <b>' + esc(core().teeName(sampleTee, lang())) + '</b></span>' +
            '<span><i class="fas fa-flag"></i> ' + esc(bi('Формат', 'Format')) + ': <b>' + esc(sampleFormat.name || '—') + '</b>' +
            (sampleFormat.name ? ' · ' + esc(core().scoringLabel(sampleFormat.item || sampleFormat.name, lang())) : '') + '</span>' +
            '<span class="tnm-muted">' + esc(bi('Удары редактируются прямо в таблице — правки сразу попадают в счёт и результаты.',
                'Strokes are edited right in the table — changes go straight to scores and results.')) + '</span>' +
            '</div>';

        var head = '<tr><th class="tnm-sticky-col">' + esc(bi('Игрок', 'Player')) + '</th><th>' + esc(bi('ТИ', 'Tee')) + '</th><th>CH</th>';
        for (var hole = 1; hole <= 18; hole++) head += '<th class="tnm-hole-col">' + hole + '</th>';
        head += '<th>' + esc(bi('Итог', 'Total')) + '</th><th>' + esc(bi('Очки', 'Points')) + '</th></tr>';

        var course = courseApi();
        var lengths = '', pars = '', indexes = '';
        for (var h = 1; h <= 18; h++) {
            lengths += '<td class="tnm-hole-col">' + esc(course.dist(h, teeOf(players[0], players[0]._entry))) + '</td>';
            pars += '<td class="tnm-hole-col">' + esc(course.par(h)) + '</td>';
            indexes += '<td class="tnm-hole-col">' + esc(course.si(h)) + '</td>';
        }
        var paramRows = '<tr class="tnm-param-row"><td class="tnm-sticky-col">' + esc(bi('Длина', 'Length')) + '</td><td></td><td></td>' + lengths + '<td></td><td></td></tr>' +
            '<tr class="tnm-param-row"><td class="tnm-sticky-col">' + esc(bi('Пар', 'Par')) + '</td><td></td><td></td>' + pars + '<td></td><td></td></tr>' +
            '<tr class="tnm-param-row"><td class="tnm-sticky-col">' + esc(bi('Индекс', 'Index')) + '</td><td></td><td></td>' + indexes + '<td></td><td></td></tr>';

        var rows = players.map(function (player) {
            var card = cardFor(player, player._entry);
            var holesHtml = card.holes.map(function (hole) {
                var value = hole.strokes == null ? '' : hole.strokes;
                return '<td class="tnm-hole-col"><input type="text" inputmode="numeric" class="tnm-score-input" data-tnm-edit="score-cell" ' +
                    'data-pid="' + esc(player.id) + '" data-hole="' + hole.hole + '" value="' + esc(value) + '"></td>';
            }).join('');
            var special = core().formatScoring(formatOf(player).item || formatOf(player).name) === 'stableford';
            var total = card.totals.total;
            var resultValue = special ? (total.netPoints == null ? '' : total.netPoints) : (total.strokes == null ? '' : total.strokes);
            return '<tr><td class="tnm-sticky-col tnm-player-cell" data-tnm-act="open-player" data-pid="' + esc(player.id) + '">' +
                '<b>' + esc(core().playerFio(player)) + '</b>' + (playerGroupName(player) ? '<span class="tnm-muted">' + esc(playerGroupName(player)) + '</span>' : '') + '</td>' +
                '<td>' + esc(core().teeName(teeOf(player, player._entry), lang())) + '</td>' +
                '<td>' + esc(core().fmtHcp(chOf(player)) || '—') + '</td>' + holesHtml +
                '<td class="tnm-total-cell">' + esc(total.strokes == null ? '' : total.strokes) + '</td>' +
                '<td class="tnm-total-cell">' + esc(resultValue) + '</td></tr>';
        }).join('');

        return '<div class="tnm-tab-body">' + filtersHtml() + info +
            '<div class="tnm-table-scroll tnm-score-scroll"><table class="tnm-table tnm-score-table"><thead>' + head + '</thead><tbody>' +
            paramRows + rows + '</tbody></table></div>' +
            '<p class="tnm-muted tnm-legend">' + esc(bi('Пустая клетка — удар не введён. Очки нетто считаются с форой по индексу лунки.',
                'An empty cell means no score. Net points are counted with the stroke index allowance.')) + '</p>' +
            '</div>';
    }

    function filtersHtml() {
        var buttons = filterButtons().map(function (button) {
            return '<button type="button" class="tnm-filter-btn' + (String(ui().state.groupFilter || 'all') === String(button.key) ? ' active' : '') +
                '" data-tnm-act="group-filter" data-key="' + esc(button.key) + '">' + esc(button.label) +
                ' <span class="tnm-count">' + button.count + '</span></button>';
        }).join('');
        return '<div class="tnm-filters">' + buttons + '</div>';
    }

    // ----------------------------------------------------------
    // ВСТАВКА «РЕЗУЛЬТАТЫ»
    // ----------------------------------------------------------
    function resultRows() {
        var rows = filteredPlayers().map(function (player) {
            var card = cardFor(player, player._entry);
            var format = formatOf(player);
            var manual = data().asMap(roundState.overrides[player.id]);
            var total = card.totals.total;
            var gross = manual.gross != null ? core().intOf(manual.gross, null) : (total.strokes == null ? null : total.strokes);
            var points = manual.points != null ? core().intOf(manual.points, null) : (total.netPoints == null ? null : total.netPoints);
            var ch = core().intOf(manual.ch != null ? manual.ch : chOf(player), 0);
            var net = manual.net != null ? core().intOf(manual.net, null) : (gross == null ? null : gross - ch);
            var value = format.scoring === 'stableford' ? points : (format.scoring === 'gross' ? gross : net);
            return {
                playerId: player.id,
                playerName: core().playerFio(player),
                groupName: playerGroupName(player),
                gender: player.gender,
                ch: ch,
                holesPlayed: total.played,
                gross: gross, net: net, points: points, value: value,
                manual: !!manual.manual || manual.gross != null || manual.points != null,
                status: manual.status || ''
            };
        });
        var scoring = rows.length ? formatOf(filteredPlayers()[0]).scoring : 'stableford';
        rows = core().assignPlaces(rows, scoring === 'stableford' ? 'stableford' : scoring);
        var sort = ui().state.sort || {};
        if (sort.key) rows = core().sortRows(rows, sort.key, sort.dir);
        return rows;
    }

    function sortIndicator(key) {
        var sort = ui().state.sort || {};
        if (sort.key !== key) return '<span class="tnm-sort-hint">↕</span>';
        return '<span class="tnm-sort-hint active">' + (sort.dir === 'asc' ? '↑' : '↓') + '</span>';
    }

    function resultsHtml() {
        var rows = resultRows();
        var head = '<tr>' +
            '<th data-tnm-act="result-sort" data-key="place">' + esc(bi('Место', 'Place')) + ' ' + sortIndicator('place') + '</th>' +
            '<th data-tnm-act="result-sort" data-key="playerName">' + esc(bi('Игрок', 'Player')) + ' ' + sortIndicator('playerName') + '</th>' +
            '<th data-tnm-act="result-sort" data-key="gross">' + esc(bi('Счёт', 'Score')) + ' ' + sortIndicator('gross') + '</th>' +
            '<th data-tnm-act="result-sort" data-key="net">' + esc(bi('Нетто', 'Net')) + ' ' + sortIndicator('net') + '</th>' +
            '<th data-tnm-act="result-sort" data-key="points">' + esc(bi('Очки стэйблфорда', 'Stableford points')) + ' ' + sortIndicator('points') + '</th>' +
            '<th>' + esc(bi('Группа', 'Group')) + '</th></tr>';
        var body = rows.map(function (row) {
            var cls = core().isPodium(row.place) ? ' tnm-podium tnm-podium-' + core().intOf(row.place, 0) : '';
            return '<tr class="' + cls.trim() + '">' +
                '<td class="tnm-place">' + esc(row.place || '') + '</td>' +
                '<td><span class="tnm-player-cell" data-tnm-act="open-player" data-pid="' + esc(row.playerId) + '"><b>' + esc(row.playerName) + '</b></span>' +
                (row.manual ? ' <span class="tnm-chip tnm-chip-draft">' + esc(bi('правка', 'edited')) + '</span>' : '') + '</td>' +
                '<td><input type="number" class="tnm-input-num" data-tnm-edit="result-gross" data-pid="' + esc(row.playerId) + '" value="' + esc(row.gross == null ? '' : row.gross) + '"></td>' +
                '<td>' + esc(row.net == null ? '—' : row.net) + '</td>' +
                '<td><input type="number" class="tnm-input-num" data-tnm-edit="result-points" data-pid="' + esc(row.playerId) + '" value="' + esc(row.points == null ? '' : row.points) + '"></td>' +
                '<td>' + esc(row.groupName || '') + '</td></tr>';
        }).join('');
        return '<div class="tnm-tab-body">' + filtersHtml() +
            ui().headHtml('<i class="fas fa-ranking-star"></i> ' + esc(bi('Результаты', 'Results')),
                esc(bi('Сортировка по умолчанию — по очкам/счёту, по клику на заголовок — вручную. Места 1–3 подсвечены.',
                    'Default sorting is by points/score; click a column header to sort manually. Places 1–3 are highlighted.')),
                ui().btn('results-export-pdf', esc(bi('Экспорт PDF', 'Export PDF')), { icon: 'fas fa-file-pdf' }) + ' ' +
                ui().btn('results-export-excel', esc(bi('Экспорт Excel', 'Export Excel')), { icon: 'fas fa-file-excel', variant: 'ghost' }) + ' ' +
                ui().btn('results-save', esc(bi('Сохранить результаты', 'Save results')), { variant: 'primary', icon: 'fas fa-floppy-disk' })) +
            '<div class="tnm-table-scroll"><table class="tnm-table tnm-results-table"><thead>' + head + '</thead><tbody>' +
            (body || '<tr><td colspan="6">' + esc(bi('Нет данных', 'No data')) + '</td></tr>') + '</tbody></table></div>' +
            '<p class="tnm-muted">' + esc(bi('Поля «Счёт» и «Очки стэйблфорда» можно править вручную — организатор может скорректировать результат.',
                'Score and Stableford points can be edited manually — the organizer can correct a result.')) + '</p>' +
            '</div>';
    }

    // ----------------------------------------------------------
    // КАРТОЧКА ИГРОКА (ТЗ §5)
    // ----------------------------------------------------------
    function playerHtml() {
        var player = ui().playerOf(ui().state.route.pid);
        if (!player) {
            return '<div class="tnm-view">' + ui().headHtml('<i class="fas fa-id-card"></i> ' + esc(bi('Карточка игрока', 'Player card')), '', ui().backBtn()) +
                ui().emptyHtml(bi('Игрок не найден', 'Player not found')) + '</div>';
        }
        var currentRound = ui().roundOf(rid()) || {};
        var sheet = ui().sheetOf(rid());
        var entry = sheet ? data().asMap(sheet.entries)[player.id] : null;
        var card = cardFor(player, entry);
        var totalPar = 0;
        card.holes.forEach(function (hole) { totalPar += hole.par || 0; });
        var head = '<tr><th>' + esc(bi('Лунка', 'Hole')) + '</th>';
        card.holes.forEach(function (hole) { head += '<th class="tnm-hole-col">' + hole.hole + '</th>'; });
        head += '<th>' + esc(bi('Аут', 'Out')) + '</th><th>' + esc(bi('Ин', 'In')) + '</th><th>' + esc(bi('Итог', 'Total')) + '</th></tr>';
        function row(label, values, cls, editKind) {
            var html = '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td class="tnm-sticky-col">' + esc(label) + '</td>';
            values.forEach(function (cell) {
                if (editKind && cell && cell.edit) {
                    html += '<td class="tnm-hole-col"><input type="' + (editKind === 'fore' ? 'number' : 'text') + '" inputmode="numeric" ' +
                        'class="tnm-score-input" data-tnm-edit="' + editKind + '-cell" data-pid="' + esc(player.id) + '" data-hole="' + cell.hole + '" value="' + esc(cell.value == null ? '' : cell.value) + '"></td>';
                } else {
                    html += '<td class="tnm-hole-col">' + esc(cell) + '</td>';
                }
            });
            html += '</tr>';
            return html;
        }
        function nineSum(list, field) {
            var sum = 0, played = 0;
            list.forEach(function (hole) { if (hole.strokes != null) { sum += core().num(hole[field], 0) || 0; played++; } });
            return played ? sum : '';
        }
        var lengthCells = card.holes.map(function (h) { return h.length; }).concat([nineSum(card.holes.slice(0, 9), 'length'), nineSum(card.holes.slice(9, 18), 'length'), nineSum(card.holes, 'length')]);
        var parCells = card.holes.map(function (h) { return h.par; }).concat([nineSum(card.holes.slice(0, 9), 'par'), nineSum(card.holes.slice(9, 18), 'par'), nineSum(card.holes, 'par')]);
        var indexCells = card.holes.map(function (h) { return h.index; }).concat(['', '', '']);
        var foreCells = card.holes.map(function (h) { return { hole: h.hole, value: h.fore, edit: true }; }).concat(['', '', '']);
        var strokeCells = card.holes.map(function (h) { return { hole: h.hole, value: h.strokes, edit: true }; }).concat([nineSum(card.holes.slice(0, 9), 'strokes'), nineSum(card.holes.slice(9, 18), 'strokes'), nineSum(card.holes, 'strokes')]);
        var grossCells = card.holes.map(function (h) { return h.grossPoints; }).concat([nineSum(card.holes.slice(0, 9), 'grossPoints'), nineSum(card.holes.slice(9, 18), 'grossPoints'), nineSum(card.holes, 'grossPoints')]);
        var netCells = card.holes.map(function (h) { return h.netPoints; }).concat([nineSum(card.holes.slice(0, 9), 'netPoints'), nineSum(card.holes.slice(9, 18), 'netPoints'), nineSum(card.holes, 'netPoints')]);

        return '<div class="tnm-view">' +
            '<div class="tnm-card-head">' + ui().backBtn() +
            '<div class="tnm-card-title"><h2>' + esc(core().playerFio(player)) + '</h2>' +
            '<p class="tnm-sub">HI: <b>' + esc(core().fmtHcp(player.hi) || '—') + '</b> · CH: <b>' + esc(core().fmtHcp(chOf(player)) || '—') + '</b>' +
            (playerGroupName(player) ? ' · ' + esc(playerGroupName(player)) : '') + '</p></div>' +
            '<div class="tnm-view-head-actions">' + ui().btn('player-export-pdf', esc(bi('Экспорт', 'Export')), { icon: 'fas fa-file-pdf' }) + '</div></div>' +
            '<div class="tnm-info-line">' +
            '<span><i class="fas fa-flag"></i> ' + esc(bi('Пар поля', 'Course par')) + ': <b>' + totalPar + '</b></span>' +
            '<span><i class="fas fa-golf-ball-tee"></i> ' + esc(bi('ТИ', 'Tee')) + ': <b>' + esc(core().teeName(teeOf(player, entry), lang())) + '</b></span>' +
            '<span class="tnm-muted">' + esc(bi('HI, CH, фора и удары редактируются администратором прямо здесь.',
                'HI, CH, fore and strokes are editable by the administrator right here.')) + '</span>' +
            '</div>' +
            '<div class="tnm-card tnm-handicap-edit">' +
            ui().fieldHtml('hi', 'HI', '<input type="number" step="0.1" data-tnm-edit="player-hi" data-pid="' + esc(player.id) + '" value="' + esc(player.hi == null ? '' : player.hi) + '">') +
            ui().fieldHtml('ch', 'CH', '<input type="number" data-tnm-edit="player-ch" data-pid="' + esc(player.id) + '" value="' + esc(player.ch == null ? '' : player.ch) + '">') +
            '</div>' +
            '<div class="tnm-table-scroll"><table class="tnm-table tnm-card-table"><thead>' + head + '</thead><tbody>' +
            row(bi('Длина', 'Length'), lengthCells) +
            row(bi('Пар', 'Par'), parCells) +
            row(bi('Индекс', 'Index'), indexCells) +
            row(bi('Фора', 'Fore'), foreCells, '', 'fore') +
            row(bi('Удары', 'Strokes'), strokeCells, 'tnm-total-row', 'score') +
            row(bi('Очки гросс', 'Gross points'), grossCells) +
            row(bi('Очки нетто', 'Net points'), netCells, 'tnm-total-row') +
            '</tbody></table></div>' +
            '<p class="tnm-muted">' + esc(bi('Пар поля: ', 'Course par: ') + totalPar + ' · ' + core().dateRu(currentRound.date || '')) + '</p>' +
            '</div>';
    }

    // ----------------------------------------------------------
    // ЭКСПОРТ
    // ----------------------------------------------------------
    /** Основной ТИ выборки — по нему считается строка «Длина» в документах. */
    function dominantTee(players) {
        var counts = {};
        (players || []).forEach(function (player) {
            var tee = teeOf(player, player._entry);
            counts[tee] = (counts[tee] || 0) + 1;
        });
        return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0] || 'wh';
    }

    function exportRoundPdf() {
        var players = filteredPlayers();
        var cards = {};
        players.forEach(function (player) { cards[player.id] = cardFor(player, player._entry); });
        var tee = dominantTee(players);
        var html = core().roundScoreHtml({
            title: bi('Счёт раунда', 'Round score'),
            tournamentName: tournament().name || '',
            roundDate: (round() || {}).date || '',
            tee: tee,
            teeLabel: core().teeName(tee, lang()),
            players: players, cards: cards, course: courseApi(), lang: lang()
        });
        io().printHtml(html);
    }

    function exportRoundExcel() {
        var source = filteredPlayers();
        var players = source.map(function (player) {
            return Object.assign({}, player, { tee: teeOf(player, player._entry), ch: chOf(player) });
        });
        var cards = {};
        players.forEach(function (player) { cards[player.id] = cardFor(player, player._entry); });
        var meta = (round() || {}).date || '';
        io().exportExcel('Schet_raunda_' + core().dateIso(meta), [
            { name: bi('Счёт', 'Score'), rows: core().scoreRows(players, cards, courseApi(), lang()) }
        ]);
    }

    function exportResults(kind) {
        var rows = resultRows();
        var currentRound = round() || {};
        if (kind === 'excel') {
            io().exportExcel('Rezultaty_' + core().dateIso(currentRound.date || ''), [
                { name: bi('Результаты', 'Results'), rows: core().resultsRows(rows, lang()) }
            ]);
            return;
        }
        io().printHtml(core().resultsHtml({
            title: bi('Результаты', 'Results'),
            tournamentName: tournament().name || '',
            roundDate: currentRound.date || '',
            rows: rows, lang: lang()
        }));
    }

    function exportPlayerPdf() {
        var player = ui().playerOf(ui().state.route.pid);
        if (!player) return;
        var sheet = ui().sheetOf(rid());
        var entry = sheet ? data().asMap(sheet.entries)[player.id] : null;
        io().printHtml(core().playerCardHtml({
            title: core().playerFio(player),
            tournamentName: tournament().name || '',
            roundDate: (round() || {}).date || '',
            player: Object.assign({}, player, { ch: chOf(player) }), card: cardFor(player, entry),
            coursePar: (function () { var sum = 0; var card = cardFor(player, entry); card.holes.forEach(function (h) { sum += h.par || 0; }); return sum; })(),
            lang: lang()
        }));
    }

    // ----------------------------------------------------------
    // ПОДПИСКИ И ЖИВЫЕ ОБНОВЛЕНИЯ
    // ----------------------------------------------------------
    function mount() {
        var currentRid = rid();
        if (!currentRid) return;
        var tid = ui().state.route.tid;
        var tournamentData = ui().tournament();
        if (roundState.rid !== currentRid) {
            unsubscribeRound();
            roundState.rid = currentRid;
            roundState.groupRounds = {};
            roundState.mirror = {};
            roundState.overrides = {};
            var ids = data().roundGroupRoundIds(tournamentData, currentRid);
            unsubscribe.push(data().watchGroupRounds(ids, function (cache) {
                roundState.groupRounds = cache || {};
                ui().scheduleRender();
            }));
            var resultsRef = data().ref('tournaments/' + tid + '/results/' + currentRid);
            if (resultsRef) {
                var resultsHandler = resultsRef.on('value', function (snap) {
                    roundState.overrides = snap.val() || {};
                    ui().scheduleRender();
                });
                unsubscribe.push(function () { try { resultsRef.off('value', resultsHandler); } catch (e) { /* silent */ } });
            }
            var mirrorRef = data().ref('tournaments/' + tid + '/scores/' + currentRid);
            if (mirrorRef) {
                var mirrorHandler = mirrorRef.on('value', function (snap) {
                    roundState.mirror = snap.val() || {};
                    // Счёт страниц ввода счёта подтягиваем в зеркало турнира,
                    // чтобы публичные таблицы и студия видели те же удары.
                    mirrorToTournament(tid, currentRid);
                    ui().scheduleRender();
                });
                unsubscribe.push(function () { try { mirrorRef.off('value', mirrorHandler); } catch (e) { /* silent */ } });
            }
        }
        mirrorToTournament(tid, currentRid);
    }

    function unmount() {
        unsubscribeRound();
        roundState.rid = '';
    }

    function unsubscribeRound() {
        (unsubscribe || []).forEach(function (fn) { try { fn(); } catch (e) { /* silent */ } });
        unsubscribe = [];
    }

    /** Переносит удары из раундов групп в зеркало турнира (best-effort). */
    function mirrorToTournament(tid, currentRid) {
        var scores = mergedScores();
        var updates = {};
        Object.keys(scores).forEach(function (pid) {
            var mirror = data().asMap(roundState.mirror[pid]);
            Object.keys(scores[pid]).forEach(function (hole) {
                var value = scores[pid][hole];
                if (value == null) return;
                if (String(mirror[hole] == null ? '' : mirror[hole]) !== String(value)) {
                    updates['tournaments/' + tid + '/scores/' + currentRid + '/' + pid + '/' + hole] = value;
                }
            });
        });
        if (!Object.keys(updates).length) return;
        data().multi(updates).catch(function () { /* офлайн/права — не критично */ });
    }

    function mountPlayer() {
        // Карточка игрока живёт теми же подписками раунда.
        mount();
    }

    // ----------------------------------------------------------
    // ПРАВКИ
    // ----------------------------------------------------------
    function writeScoreCell(input) {
        var pid = input.getAttribute('data-pid');
        var hole = core().intOf(input.getAttribute('data-hole'), 0);
        var raw = core().trim(input.value);
        var value = raw === '' ? null : core().intOf(raw, null);
        if (raw !== '' && (value == null || value < 1 || value > 20)) {
            ui().toastMsg(bi('Удар должен быть от 1 до 20', 'Strokes must be between 1 and 20'), 'error');
            input.value = '';
            return;
        }
        // Оптимистично показываем удар до ответа базы.
        roundState.mirror[pid] = roundState.mirror[pid] || {};
        if (value == null) delete roundState.mirror[pid][hole];
        else roundState.mirror[pid][hole] = value;
        Object.keys(roundState.groupRounds).forEach(function (gid) {
            var players = data().asMap((roundState.groupRounds[gid] || {}).players);
            if (!players[pid]) return;
            players[pid].scores = players[pid].scores || {};
            if (value == null) delete players[pid].scores[hole];
            else players[pid].scores[hole] = value;
        });
        data().writeScore(ui().state.route.tid, rid(), pid, hole, value, ui().tournament()).catch(function (err) {
            ui().toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
        ui().scheduleRender();
    }

    function writeForeCell(input) {
        var pid = input.getAttribute('data-pid');
        var hole = core().intOf(input.getAttribute('data-hole'), 0);
        var value = input.value === '' ? null : core().intOf(input.value, null);
        var player = ui().playerOf(pid);
        if (!player) return;
        var fores = Object.assign({}, player.fores || {});
        if (value == null) delete fores[hole];
        else fores[hole] = value;
        data().updatePlayer(ui().state.route.tid, pid, { fores: fores }, ui().tournament()).catch(function (err) {
            ui().toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    function writeResultOverride(pid, field, value) {
        var payload = {};
        payload[field] = value === '' ? null : core().intOf(value, null);
        data().overrideResult(ui().state.route.tid, rid(), pid, payload).then(function () {
            ui().toastMsg(bi('Результат скорректирован', 'Result updated'));
        }).catch(function (err) {
            ui().toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    function saveResults() {
        var rows = resultRows();
        data().saveResults(ui().state.route.tid, rid(), rows).then(function () {
            ui().toastMsg(bi('✅ Результаты сохранены', '✅ Results saved'));
        }).catch(function (err) {
            ui().toastMsg('❌ ' + (err && err.message ? err.message : err), 'error');
        });
    }

    // ----------------------------------------------------------
    // ДЕЙСТВИЯ
    // ----------------------------------------------------------
    ui().on('round-tab', function (button) {
        ui().navigate({ view: 'round', tid: ui().state.route.tid, rid: rid(), tab: button.getAttribute('data-tab') });
    });
    ui().on('group-filter', function (button) {
        ui().state.groupFilter = button.getAttribute('data-key') || 'all';
        ui().render();
    });
    ui().on('result-sort', function (th) {
        var key = th.getAttribute('data-key');
        var sort = ui().state.sort || {};
        if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc';
        else sort = { key: key, dir: (key === 'playerName' || key === 'place') ? 'asc' : 'desc' };
        ui().state.sort = sort;
        ui().render();
    });
    ui().on('open-player', function (cell) {
        ui().navigate({ view: 'player', tid: ui().state.route.tid, pid: cell.getAttribute('data-pid'), rid: rid() });
    });
    ui().on('round-open-sheet', function () {
        ui().navigate({ view: 'card', tid: ui().state.route.tid, tab: 'sheet', rid: rid() });
    });
    ui().on('round-scorecards', function () {
        ui().navigate({ view: 'round', tid: ui().state.route.tid, rid: rid(), tab: 'scorecards' });
    });
    ui().on('scorecards-back', function () {
        ui().navigate({ view: 'round', tid: ui().state.route.tid, rid: rid(), tab: 'score' });
    });
    ui().on('scorecards-print', exportScorecards);
    ui().on('scorecard-add-block', addScorecardBlock);
    ui().on('scorecard-move-block', moveScorecardBlock);
    ui().on('scorecard-remove-block', removeScorecardBlock);
    ui().on('edit:scorecard-layout', updateScorecardLayout);
    ui().on('round-export-pdf', exportRoundPdf);
    ui().on('round-export-excel', exportRoundExcel);
    ui().on('results-export-pdf', function () { exportResults('pdf'); });
    ui().on('results-export-excel', function () { exportResults('excel'); });
    ui().on('results-save', saveResults);
    ui().on('player-export-pdf', exportPlayerPdf);
    ui().on('edit:score-cell', function (input) { writeScoreCell(input); });
    ui().on('edit:fore-cell', function (input) { writeForeCell(input); });
    ui().on('edit:result-gross', function (input) { writeResultOverride(input.getAttribute('data-pid'), 'gross', input.value); });
    ui().on('edit:result-points', function (input) { writeResultOverride(input.getAttribute('data-pid'), 'points', input.value); });
    return {
        roundHtml: roundHtml, playerHtml: playerHtml, mount: mount, mountPlayer: mountPlayer,
        unmount: unmount, resultRows: resultRows, mergedScores: mergedScores, roundPlayers: roundPlayers
    };
})(typeof window !== 'undefined' ? window : this);
