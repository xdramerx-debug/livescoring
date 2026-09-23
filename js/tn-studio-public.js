// Публичные «Счёт» и «Результаты» для турниров, созданных во вкладке «Турниры · создание».
// Правка ударов здесь запрещена: её делает только админ, цифры приходят из той же записи.
(function (root) {
    var state = { id: null, dayId: null, tab: 'score', divisionId: null, playerKey: null };

    function core() { return root.TnStudioCore; }
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
                return core().courseHandicap(hi, this.rating(gender, tee), 72);
            }
        };
    }
    function roster(t) {
        return core().listOf(t.registeredPlayers).sort(function (a, b) {
            return core().normalizeName(a.name).localeCompare(core().normalizeName(b.name), 'ru');
        });
    }
    function days(t) {
        return core().listOf(t.days).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    }
    function player(t, key) {
        var p = (t.registeredPlayers || {})[key];
        if (!p) return null;
        p._key = key;
        return p;
    }
    function division(t, id) { return id && t.divisions ? t.divisions[id] : null; }
    function teeOf(t, p) {
        var id = core().divisionOf(p._key, t.divisions);
        var d = division(t, id);
        return (d && d.tee) || 'wh';
    }
    function liveHi(p) { return p.handicap == null ? null : p.handicap; }
    function cardOf(t, p, dayId) {
        var C = core(), courseApi = course();
        var tee = teeOf(t, p);
        var ch = courseApi.field(liveHi(p), tee, p.gender);
        var scores = t.scores && t.scores[dayId] ? t.scores[dayId][p._key] : null;
        return { card: C.playerCard(scores, courseApi, tee, ch || 0), ch: ch, tee: tee, format: C.formatId(t, division(t, C.divisionOf(p._key, t.divisions))) };
    }
    function resultText(format, card, lang) {
        var pack = card.all.gross;
        if (format === 'stableford') {
            var pts = card.all.ptsNet.total;
            return pts == null ? '—' : String(pts);
        }
        return pack.total == null ? '—' : String(pack.total);
    }
    function formatLabel(id, ru) {
        if (id === 'fourball') return ru('Форбол', 'Four-ball');
        if (id === 'stroke') return ru('На счёт ударов', 'Stroke play');
        return ru('Стейблфорд', 'Stableford');
    }
    function ensure(t) {
        if (state.id !== t._key) {
            state.id = t._key;
            state.dayId = null;
            state.tab = 'score';
            state.divisionId = null;
            state.playerKey = null;
        }
        var list = days(t);
        if (!state.dayId || !list.some(function (d) { return d._key === state.dayId; })) state.dayId = list[0] ? list[0]._key : null;
    }
    function playersFor(t, divisionId) {
        var C = core();
        return roster(t).filter(function (p) {
            var id = C.divisionOf(p._key, t.divisions);
            if (divisionId === 'none') return !id;
            if (!divisionId) return true;
            return id === divisionId;
        });
    }
    function summaryRows(t, dayId) {
        var C = core();
        var people = roster(t);
        if (!t.fourBall) {
            return people.map(function (p) {
                var built = cardOf(t, p, dayId);
                return { name: p.name, key: p._key, format: built.format, result: resultText(built.format, built.card) };
            });
        }
        var used = {};
        var rows = [];
        people.forEach(function (p) {
            if (used[p._key]) return;
            var pair = strPair(p.pair);
            var mates = pair ? people.filter(function (x) { return strPair(x.pair) === pair; }) : [p];
            mates.forEach(function (x) { used[x._key] = true; });
            if (mates.length < 2) {
                var one = cardOf(t, p, dayId);
                rows.push({ name: p.name, key: p._key, format: 'fourball', result: resultText('stroke', one.card) });
                return;
            }
            var cards = mates.map(function (x) { return cardOf(t, x, dayId).card; });
            var best = C.betterBall(cards);
            rows.push({ name: mates.map(function (x) { return x.name; }).join(' / '), key: mates[0]._key, format: 'fourball', result: best.gross == null ? '—' : String(best.gross) });
        });
        return rows;
    }
    function strPair(v) { return String(v == null ? '' : v).trim(); }

    function panelHtml(t, helpers) {
        var esc = helpers.esc, ru = helpers.ru;
        ensure(t);
        var list = days(t);
        if (!list.length) {
            return '<div class="tn-detail-panel"><h2><i class="fas fa-flag"></i> ' + esc(ru('Счёт и карточка', 'Score & card')) + '</h2><div class="tn-public-empty"><i class="fas fa-calendar-xmark"></i><div>' + esc(ru('Дни турнира ещё не добавлены.', 'No tournament days yet.')) + '</div></div></div>';
        }
        var day = list.filter(function (d) { return d._key === state.dayId; })[0] || list[0];
        var html = '<div class="tn-detail-panel tns"><h2><i class="fas fa-flag"></i> ' + esc(t.name || '') + '</h2>';
        html += '<div class="tns-meta">' + esc(core().formatIso(day.date)) + '</div>';
        html += '<div class="tns-chips">' + list.map(function (d) {
            return '<button type="button" class="tns-div' + (d._key === day._key ? ' active' : '') + '" data-studio-act="day" data-id="' + esc(d._key) + '">' + esc(core().formatIso(d.date)) + '</button>';
        }).join('') + '</div>';
        html += '<div class="tns-tabs"><button type="button" class="tns-tab' + (state.tab === 'score' && !state.playerKey ? ' active' : '') + '" data-studio-act="tab" data-id="score">' + esc(ru('Счёт', 'Score')) + '</button><button type="button" class="tns-tab' + (state.tab === 'card' && !state.playerKey ? ' active' : '') + '" data-studio-act="tab" data-id="card">' + esc(ru('Результаты', 'Results')) + '</button></div>';
        if (state.playerKey) html += playerHtml(t, day, esc, ru);
        else if (state.tab === 'card') html += cardHtml(t, day, esc, ru);
        else html += scoreHtml(t, day, esc, ru);
        return html + '</div>';
    }
    function scoreHtml(t, day, esc, ru) {
        var rows = summaryRows(t, day._key);
        if (!rows.length) return '<p class="tns-note">' + esc(ru('Участников пока нет.', 'No players yet.')) + '</p>';
        return '<div class="tns-table-wrap"><table class="tns-table"><thead><tr><th>' + esc(ru('Игрок', 'Player')) + '</th><th>' + esc(ru('Формат', 'Format')) + '</th><th>' + esc(ru('Результат', 'Result')) + '</th></tr></thead><tbody>' +
            rows.map(function (r) {
                return '<tr><td><button type="button" class="tns-link" data-studio-act="player" data-id="' + esc(r.key) + '">' + esc(r.name || '—') + '</button></td><td>' + esc(formatLabel(r.format, ru)) + '</td><td>' + esc(r.result) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
    }
    function cardHtml(t, day, esc, ru) {
        var C = core();
        var divs = C.listOf(t.divisions);
        var chips = divs.map(function (d) {
            return '<button type="button" class="tns-div' + (state.divisionId === d._key ? ' active' : '') + '" data-studio-act="div" data-id="' + esc(d._key) + '">' + esc(d.name || '—') + '</button>';
        }).join('') + '<button type="button" class="tns-div' + (state.divisionId === 'none' || !state.divisionId ? ' active' : '') + '" data-studio-act="div" data-id="none">' + esc(ru('Без группы', 'Ungrouped')) + '</button>';
        var divId = state.divisionId && state.divisionId !== 'none' ? state.divisionId : 'none';
        if (state.divisionId && state.divisionId !== 'none' && !division(t, state.divisionId)) divId = 'none';
        var d = divId === 'none' ? null : division(t, divId);
        var caption = d ? captionHtml(t, d, esc, ru) : '<p class="tns-note">' + esc(ru('Игроки без зачёта.', 'Players without a division.')) + '</p>';
        var people = playersFor(t, divId);
        var tee = (d && d.tee) || 'wh';
        return '<div class="tns-chips">' + chips + '</div>' + caption + holeTable(t, day, people, tee, false, esc, ru);
    }
    function captionHtml(t, d, esc, ru) {
        var C = core();
        var gender = d.gender === 'women' ? ru('жен.', 'women') : d.gender === 'men' ? ru('муж.', 'men') : '—';
        var format = formatLabel(C.formatId(t, d), ru);
        var tee = course().teeName(d.tee || 'wh');
        return '<p class="tns-note">' + esc(ru('Пол', 'Gender') + ': ' + gender + ', HCP: ' + C.hcpLabel(d.hcpFrom, d.hcpTo) + ', ' + ru('возраст', 'age') + ': ' + (d.ageLabel || '—')) + '<br>' + esc(ru('Ти', 'Tee') + ': ' + tee + ', ' + format) + '</p>';
    }
    function holeTable(t, day, people, tee, editable, esc, ru) {
        var courseApi = course();
        var head = '<tr><th class="name"></th>';
        for (var h = 1; h <= 18; h++) {
            head += '<th>' + h + '</th>';
            if (h === 9 || h === 18) head += '<th></th>';
        }
        head += '<th></th></tr>';
        function row(label, pick, cls) {
            var html = '<tr class="' + (cls || '') + '"><th class="name">' + esc(label) + '</th>';
            var out = 0, inn = 0;
            for (var i = 1; i <= 18; i++) {
                var v = pick(i);
                html += '<td>' + esc(v == null || v === '' ? '' : v) + '</td>';
                if (typeof v === 'number') { if (i <= 9) out += v; else inn += v; }
                if (i === 9) html += '<td class="sum">' + out + '</td>';
                if (i === 18) html += '<td class="sum">' + inn + '</td>';
            }
            html += '<td class="sum">' + (out + inn) + '</td></tr>';
            return html;
        }
        var body = row(ru('Длина, м', 'Length, m'), function (h) { return courseApi.dist(h, tee); });
        body += row(ru('Пар', 'Par'), function (h) { return courseApi.par(h); });
        body += row(ru('Индекс', 'Index'), function (h) { return courseApi.si(h); }, 'idx');
        if (!people.length) {
            return '<div class="tns-score"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div><p class="tns-note">' + esc(ru('В этом зачёте никого нет.', 'Nobody in this division.')) + '</p>';
        }
        people.forEach(function (p) {
            var built = cardOf(t, p, day._key);
            body += '<tr><th class="name"><button type="button" class="tns-link" data-studio-act="player" data-id="' + esc(p._key) + '">' + esc(p.name || '—') + '</button></th>';
            var out = 0, inn = 0, front = false, back = false;
            built.card.holes.forEach(function (hole) {
                var v = hole.gross;
                body += '<td>' + (v == null ? '—' : esc(v)) + '</td>';
                if (v != null) { if (hole.hole <= 9) { out += v; front = true; } else { inn += v; back = true; } }
                if (hole.hole === 9) body += '<td class="sum">' + (front ? out : '—') + '</td>';
                if (hole.hole === 18) body += '<td class="sum">' + (back ? inn : '—') + '</td>';
            });
            body += '<td class="sum">' + (built.card.all.gross.total == null ? '—' : built.card.all.gross.total) + '</td></tr>';
        });
        return '<div class="tns-score"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }
    function playerHtml(t, day, esc, ru) {
        var p = player(t, state.playerKey);
        if (!p) return '<p class="tns-note">' + esc(ru('Игрок не найден.', 'Player not found.')) + '</p>';
        var built = cardOf(t, p, day._key);
        var courseApi = course();
        var html = '<button type="button" class="btn btn-og btn-sm" data-studio-act="back">' + esc(ru('Назад', 'Back')) + '</button>';
        html += '<h3>' + esc(p.name || '—') + '</h3>';
        html += '<p class="tns-note">HI: ' + esc(core().fmtHcp(liveHi(p)) || '—') + ' · CH: ' + esc(built.ch == null ? '—' : built.ch) + '<br>' + esc(ru('Ти', 'Tee') + ': ' + courseApi.teeName(built.tee) + ', ' + formatLabel(built.format, ru)) + '</p>';
        html += playerLines(built.card, esc, ru);
        return html;
    }
    function playerLines(card, esc, ru) {
        var head = '<tr><th class="name"></th>';
        for (var h = 1; h <= 18; h++) {
            head += '<th>' + h + '</th>';
            if (h === 9 || h === 18) head += '<th></th>';
        }
        head += '<th></th></tr>';
        function line(label, pick, numeric) {
            var html = '<tr><th class="name">' + esc(label) + '</th>';
            var out = 0, inn = 0, outN = 0, innN = 0;
            card.holes.forEach(function (hole) {
                var v = pick(hole);
                html += '<td>' + esc(v == null || v === '' ? '—' : v) + '</td>';
                if (numeric && v != null) {
                    if (hole.hole <= 9) { out += v; outN++; } else { inn += v; innN++; }
                }
                if (hole.hole === 9) html += '<td class="sum">' + (numeric ? (outN ? out : '—') : '') + '</td>';
                if (hole.hole === 18) html += '<td class="sum">' + (numeric ? (innN ? inn : '—') : '') + '</td>';
            });
            var total = numeric ? ((outN + innN) ? out + inn : '—') : '';
            return html + '<td class="sum">' + total + '</td></tr>';
        }
        return '<div class="tns-score"><table><thead>' + head + '</thead><tbody>' +
            line(ru('Длина, м', 'Length, m'), function (h) { return h.dist; }, true) +
            line(ru('Пар', 'Par'), function (h) { return h.par; }, true) +
            line(ru('Индекс', 'Index'), function (h) { return h.si; }, false) +
            line(ru('Фора', 'Strokes'), function (h) { return h.recv || '—'; }, false) +
            line(ru('Удары', 'Strokes played'), function (h) { return h.gross; }, true) +
            line(ru('Очки, гросс', 'Gross points'), function (h) { return h.ptsGross; }, true) +
            line(ru('Очки, нетто', 'Net points'), function (h) { return h.ptsNet; }, true) +
            '</tbody></table></div>';
    }

    document.addEventListener('click', function (event) {
        var node = event.target.closest ? event.target.closest('[data-studio-act]') : null;
        if (!node) return;
        var act = node.getAttribute('data-studio-act');
        var id = node.getAttribute('data-id');
        if (act === 'day') { state.dayId = id; state.playerKey = null; }
        else if (act === 'tab') { state.tab = id; state.playerKey = null; }
        else if (act === 'div') { state.divisionId = id; state.playerKey = null; }
        else if (act === 'player') { state.playerKey = id; }
        else if (act === 'back') state.playerKey = null;
        else return;
        if (typeof root.tnPublicRender === 'function') root.tnPublicRender();
    });

    root.TnStudioPublic = { panelHtml: panelHtml, state: state };
})(typeof window !== 'undefined' ? window : this);
