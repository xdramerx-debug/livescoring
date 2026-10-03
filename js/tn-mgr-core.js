// ============================================================
// TN-MGR-CORE — чистое ядро системы турниров (без DOM и Firebase)
// ------------------------------------------------------------
// Вся «турнирная» математика и правила, которые должны быть
// одинаковыми в интерфейсе админки, в печатных документах (PDF)
// и в выгрузках Excel:
//   • справочник гольф-форматов (пополняемый, RU/EN);
//   • поиск игроков по фамилии на русском и английском (транслит);
//   • WHS-гандикап, фора по лункам, stableford (гросс/нетто);
//   • генерация стартового листа (группы, флайты, маркеры, время);
//   • результаты раунда и распределение мест (в т.ч. с ничьими);
//   • разбор импорта участников (Excel/таблица);
//   • строки для Excel/CSV и HTML печатных документов (PDF).
//
// Файл UMD: работает в браузере (window.TnMgrCore) и в Node
// (require('./js/tn-mgr-core.js')) — тесты: tools/test-tn-mgr-core.js.
// ============================================================
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.TnMgrCore = api;
})(typeof window !== 'undefined' ? window : this, function () {
    'use strict';

    // ----------------------------------------------------------
    // 0. БАЗОВЫЕ ХЕЛПЕРЫ
    // ----------------------------------------------------------
    function str(value) { return value == null ? '' : String(value); }
    function trim(value) { return str(value).replace(/\s+/g, ' ').trim(); }
    function num(value, fallback) {
        if (value === '' || value == null) return fallback == null ? null : fallback;
        var parsed = parseFloat(str(value).replace(',', '.').replace('+', ''));
        return isFinite(parsed) ? parsed : (fallback == null ? null : fallback);
    }
    function intOf(value, fallback) {
        var parsed = parseInt(str(value), 10);
        return isFinite(parsed) ? parsed : (fallback == null ? null : fallback);
    }
    function esc(value) {
        return str(value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function asMap(value) { return value && typeof value === 'object' ? value : {}; }
    function asArray(value) {
        if (Array.isArray(value)) return value.slice();
        if (value && typeof value === 'object') {
            return Object.keys(value).map(function (key) {
                var item = value[key] || {};
                if (typeof item === 'object' && !item.id) item.id = key;
                return item;
            });
        }
        return [];
    }
    function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value == null ? null : value)); }
    function uniq(list) {
        var seen = {}, out = [];
        (list || []).forEach(function (item) {
            var key = str(item);
            if (!key || seen[key]) return;
            seen[key] = true;
            out.push(item);
        });
        return out;
    }
    function byKey(list, key) {
        var map = {};
        (list || []).forEach(function (item) { map[str(item[key])] = item; });
        return map;
    }

    // ----------------------------------------------------------
    // 1. ФОРМАТЫ (СПРАВОЧНИК)
    // ----------------------------------------------------------
    // Система скоринга формата: stableford (очки), stroke (удары),
    // match (матч). Используется для подписи и расчёта результатов.
    var DEFAULT_FORMATS = [
        { id: 'stableford', ru: 'Стэйблфорд (игра на очки)', en: 'Stableford', scoring: 'stableford' },
        { id: 'stableford-gross', ru: 'Стэйблфорд (гросс)', en: 'Stableford (gross)', scoring: 'stableford' },
        { id: 'stroke-gross', ru: 'Игра на счёт (гросс)', en: 'Stroke Play (gross)', scoring: 'gross' },
        { id: 'stroke-net', ru: 'Игра на счёт (нетто)', en: 'Stroke Play (net)', scoring: 'net' },
        { id: 'stroke-max', ru: 'Игра на счёт с максимумом (двойной пар)', en: 'Stroke Play (max score)', scoring: 'net' },
        { id: 'match', ru: 'Матчевая игра', en: 'Match Play', scoring: 'match' },
        { id: 'fourball', ru: 'Форбол (лучший мяч)', en: 'Four-Ball (better ball)', scoring: 'stableford' },
        { id: 'foursomes', ru: 'Фоурсом (попеременные удары)', en: 'Foursomes (alternate shot)', scoring: 'stableford' },
        { id: 'greensome', ru: 'Гринсом', en: 'Greensome', scoring: 'stableford' },
        { id: 'chapman', ru: 'Чапмен (Пайнхерст)', en: 'Chapman (Pinehurst)', scoring: 'stableford' },
        { id: 'scramble', ru: 'Скрамбл', en: 'Scramble', scoring: 'stableford' },
        { id: 'texas-scramble', ru: 'Техасский скрамбл', en: 'Texas Scramble', scoring: 'stableford' },
        { id: 'shamble', ru: 'Шэмбл', en: 'Shamble', scoring: 'stableford' },
        { id: 'best-ball', ru: 'Бест-бол', en: 'Best Ball', scoring: 'stableford' },
        { id: 'skins', ru: 'Скинс', en: 'Skins', scoring: 'stableford' },
        { id: 'bogey-par', ru: 'Богги / Пар (против поля)', en: 'Bogey / Par', scoring: 'stableford' },
        { id: 'flag', ru: 'Флаговый турнир', en: 'Flag Tournament', scoring: 'gross' },
        { id: 'three-club', ru: 'Турнир трёх клюшек', en: 'Three-Club Tournament', scoring: 'stableford' },
        { id: 'par-3', ru: 'Турнир на пар-3', en: 'Par-3 Tournament', scoring: 'stableford' },
        { id: 'skins-net', ru: 'Скинс (нетто)', en: 'Skins (net)', scoring: 'stableford' }
    ];

    function defaultFormats() { return clone(DEFAULT_FORMATS); }

    function formatId(value) {
        return trim(value).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '');
    }

    /**
     * Справочник форматов турнира: встроенный список + пользовательские
     * записи из данных (tournaments/<id>/formatsDict, settings/tnFormats).
     * Ничего не зашито: любую позицию можно переименовать/добавить.
     */
    function formatCatalog() {
        var extra = [];
        for (var i = 0; i < arguments.length; i++) {
            asArray(arguments[i]).forEach(function (item) {
                if (!item) return;
                if (typeof item === 'string') extra.push({ id: formatId(item), ru: item, en: item });
                else extra.push(item);
            });
            // Словарь-объект вида { 'Название': true } тоже поддерживаем.
            var map = arguments[i];
            if (map && typeof map === 'object' && !Array.isArray(map)) {
                Object.keys(map).forEach(function (key) {
                    var value = map[key];
                    if (value === true || value === 1) extra.push({ id: formatId(key), ru: key, en: key });
                });
            }
        }
        var out = defaultFormats();
        var known = byKey(out, 'id');
        extra.forEach(function (item) {
            var id = formatId(item.id || item.ru || item.en || item.name);
            if (!id) return;
            if (known[id]) {
                // Пользовательская запись уточняет встроенную (например, перевод).
                if (item.ru) known[id].ru = item.ru;
                if (item.en) known[id].en = item.en;
                if (item.scoring) known[id].scoring = item.scoring;
                known[id].custom = true;
                return;
            }
            var record = {
                id: id,
                ru: trim(item.ru || item.en || item.name || id),
                en: trim(item.en || item.ru || item.name || id),
                scoring: item.scoring || guessScoring(item.ru || item.en || id),
                custom: item.custom !== false
            };
            known[id] = record;
            out.push(record);
        });
        return out;
    }

    /** Определяет систему скоринга по названию формата (данные вместо констант). */
    function guessScoring(label) {
        var text = trim(label).toLowerCase();
        if (!text) return 'stableford';
        if (/stableford|стэйблфорд|стейблфорд|очк|point/.test(text)) return 'stableford';
        if (/match|матч/.test(text)) return 'match';
        if (/gross|гросс/.test(text)) return 'gross';
        if (/net|нетто/.test(text)) return 'net';
        return 'stableford';
    }

    function formatLabel(format, lang) {
        if (!format) return '';
        if (typeof format === 'string') return format;
        var ru = trim(format.ru || format.name || format.id);
        var en = trim(format.en || format.name || format.id);
        if (lang === 'en') return en || ru;
        return ru || en;
    }

    function formatScoring(format) {
        if (format && typeof format === 'object' && format.scoring) return format.scoring;
        return guessScoring(formatLabel(format, 'ru'));
    }

    /** Подпись информационной строки: формат + система (напр. «Игра на счёт»). */
    function scoringLabel(format, lang) {
        var scoring = formatScoring(format);
        var en = lang === 'en';
        if (scoring === 'stableford') return en ? 'Stableford' : 'Игра на очки';
        if (scoring === 'gross') return en ? 'Stroke play (gross)' : 'Игра на счёт (гросс)';
        if (scoring === 'net') return en ? 'Stroke play (net)' : 'Игра на счёт (нетто)';
        if (scoring === 'match') return en ? 'Match play' : 'Матчевая игра';
        return formatLabel(format, lang);
    }

    // ----------------------------------------------------------
    // 2. ПОИСК ИГРОКОВ RU/EN (ФАМИЛИЯ, ИМЯ, ГОСТЬ)
    // ----------------------------------------------------------
    function normText(value) {
        return trim(str(value).toLowerCase().replace(/ё/g, 'е'))
            .replace(/[^0-9a-zа-я\s_-]+/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    var TRANSLIT = {
        а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
        к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
        ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '',
        э: 'e', ю: 'yu', я: 'ya'
    };
    function translitRu(value) {
        var out = '';
        normText(value).split('').forEach(function (ch) {
            if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch];
            else out += ch;
        });
        return out;
    }
    function latinKey(value) {
        return str(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
    }
    /** Сравнение кириллической и латинской записи («Иванов» ↔ «Ivanov»). */
    function translitEquals(a, b) {
        var na = normText(a), nb = normText(b);
        if (!na || !nb) return false;
        if (na === nb) return true;
        return latinKey(translitRu(na)) === latinKey(nb) || latinKey(translitRu(nb)) === latinKey(na);
    }

    /** Ключи поиска: полное ФИО, фамилия, имя, латиница и транслит. */
    function searchKeys(player) {
        var p = player || {};
        var parts = splitFio(playerFio(p));
        var keys = [
            normText(playerFio(p)),
            normText(parts.lastName),
            normText(parts.firstName),
            normText(parts.middleName),
            normText(p.name),
            normText(p.email),
            translitRu(playerFio(p)),
            translitRu(parts.lastName),
            translitRu(parts.firstName),
            normText(p.latinName)
        ];
        return uniq(keys.filter(Boolean));
    }

    /**
     * Совпадение игрока с поисковой строкой.
     * Русский и английский ввод равнозначны: «Ivanov» находит «Иванов»,
     * «Смирнова» находит «Smirnova». Ищем по началу любого слова.
     */
    function playerMatches(player, query) {
        var q = normText(query);
        if (!q) return true;
        var keys = searchKeys(player);
        if (!keys.length) return false;
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf(q) === 0) return true;
        }
        // Составные запросы («иванов иван») — все слова должны найтись.
        var words = q.split(' ').filter(Boolean);
        if (words.length > 1) {
            var joined = keys.join(' | ');
            return words.every(function (word) {
                if (joined.indexOf(word) !== -1) return true;
                var wordLatin = latinKey(word);
                return !!wordLatin && keys.some(function (key) { return latinKey(key).indexOf(wordLatin) !== -1; });
            });
        }
        // Частичное совпадение по латинице («ivan» → «Иванов»).
        var qLatin = latinKey(q);
        return !!qLatin && keys.some(function (key) { return latinKey(key).indexOf(qLatin) !== -1; });
    }

    function searchPlayers(players, query, limit) {
        var out = (players || []).filter(function (player) { return playerMatches(player, query); });
        out.sort(function (a, b) { return playerFio(a).localeCompare(playerFio(b), 'ru'); });
        return limit ? out.slice(0, limit) : out;
    }

    // ----------------------------------------------------------
    // 3. ФИО, ПОЛ, ДАТЫ
    // ----------------------------------------------------------
    function splitFio(value) {
        var raw = trim(value);
        if (!raw) return { lastName: '', firstName: '', middleName: '', display: '' };
        var tokens = raw.split(' ').filter(Boolean);
        var looksPatronymic = function (word) { return /(ович|евич|ич|овна|евна|ична|инична)$/i.test(word); };
        var looksSurname = function (word) {
            return /(ов|ева|ова|ев|ин|ына|ина|ын|ский|цкий|ская|цкая|енко|ук|юк|ко)$/i.test(word);
        };
        var last = '', first = '', middle = '';
        if (tokens.length >= 3) {
            if (looksSurname(tokens[0]) || !looksSurname(tokens[tokens.length - 1])) {
                last = tokens[0]; first = tokens[1]; middle = tokens.slice(2).join(' ');
            } else {
                first = tokens[0]; middle = tokens.slice(1, -1).join(' '); last = tokens[tokens.length - 1];
            }
        } else if (tokens.length === 2) {
            if (looksSurname(tokens[0]) && !looksSurname(tokens[1])) { last = tokens[0]; first = tokens[1]; }
            else { first = tokens[0]; last = tokens[1]; }
        } else {
            first = tokens[0] || '';
        }
        return {
            lastName: last, firstName: first, middleName: middle,
            display: trim([last, first, middle].filter(Boolean).join(' ')) || raw
        };
    }

    function playerFio(player) {
        var p = player || {};
        if (trim(p.fio)) return trim(p.fio);
        var composed = trim([p.lastName, p.firstName, p.middleName].filter(Boolean).join(' '));
        return composed || trim(p.name);
    }

    /** Ключ игрока по ФИО (для дедупликации при импорте). */
    function playerKeyByFio(player) {
        return normText(playerFio(player)).replace(/\s+/g, '_');
    }

    function normalizeGender(value) {
        var s = trim(value).toLowerCase();
        if (!s) return '';
        if (s === 'w' || s === 'f' || s === 'ж' || s === 'female' || s === 'women' || s === 'woman' || s.indexOf('жен') === 0 || s.indexOf('дев') === 0) return 'women';
        if (s === 'm' || s === 'м' || s === 'male' || s === 'men' || s === 'man' || s.indexOf('муж') === 0 || s.indexOf('юн') === 0) return 'men';
        return '';
    }
    function genderLabel(gender, lang) {
        var g = normalizeGender(gender);
        if (g === 'women') return lang === 'en' ? 'Ladies' : 'Женщины';
        if (g === 'men') return lang === 'en' ? 'Men' : 'Мужчины';
        return lang === 'en' ? 'Not set' : 'Не указан';
    }

    function dateIso(value) {
        if (!value) return '';
        if (value instanceof Date) {
            return value.getFullYear() + '-' + pad2(value.getMonth() + 1) + '-' + pad2(value.getDate());
        }
        var raw = trim(value);
        var iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
        var ru = raw.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
        if (ru) return ru[3] + '-' + ru[2] + '-' + ru[1];
        var parsed = new Date(raw);
        if (!isNaN(parsed.getTime())) {
            return parsed.getFullYear() + '-' + pad2(parsed.getMonth() + 1) + '-' + pad2(parsed.getDate());
        }
        return '';
    }
    function pad2(value) { return (value < 10 ? '0' : '') + value; }

    function dateRu(iso) {
        var parts = str(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return parts ? parts[3] + '.' + parts[2] + '.' + parts[1] : str(iso);
    }
    function dateLong(iso, lang) {
        var parts = str(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!parts) return str(iso);
        var monthsRu = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
        var monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        var month = parseInt(parts[2], 10) - 1;
        if (lang === 'en') return parts[3] + ' ' + (monthsEn[month] || '') + ' ' + parts[1];
        return parts[3] + ' ' + (monthsRu[month] || '') + ' ' + parts[1];
    }
    /** Ближайшая дата (для новых раундов и турниров). */
    function todayIso(now) {
        return dateIso(now || new Date());
    }
    function timeText(value, fallback) {
        var raw = trim(value);
        var match = raw.match(/^(\d{1,2})[:.\s]?(\d{2})/);
        if (match) return pad2(parseInt(match[1], 10)) + ':' + match[2];
        return fallback || '';
    }
    function addMinutesToTime(time, minutes) {
        var t = timeText(time, '09:00').split(':');
        var total = parseInt(t[0], 10) * 60 + parseInt(t[1], 10) + (intOf(minutes, 0) || 0);
        total = ((total % 1440) + 1440) % 1440;
        return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60);
    }
    function timestampFromDateTime(dateIsoValue, timeValue) {
        var iso = dateIso(dateIsoValue);
        var time = timeText(timeValue, '09:00').split(':');
        if (!iso) return 0;
        var parts = iso.split('-');
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10),
            parseInt(time[0], 10), parseInt(time[1], 10), 0, 0).getTime();
    }

    // ----------------------------------------------------------
    // 4. ГАНДИКАП, ФОРА, ОЧКИ
    // ----------------------------------------------------------
    function fmtHcp(value) {
        var raw = trim(value);
        if (!raw) return '';
        var h = num(raw);
        if (h == null) return raw;
        var text = (Math.abs(h) % 1 === 0 ? String(Math.abs(h)) : Math.abs(h).toFixed(1).replace('.', ','));
        if (h < 0 || raw.charAt(0) === '+') return '+' + text;
        return text;
    }

    /** Игровой гандикап (course handicap) по WHS: HI × SR/113 + (CR − Par). */
    function courseHandicap(hi, rating, par) {
        var handicap = num(hi);
        if (handicap == null) return null;
        var base = par == null ? 72 : num(par, 72);
        if (!rating || num(rating.sr) == null || num(rating.cr) == null) return Math.round(handicap);
        return Math.round(handicap * (num(rating.sr) / 113) + (num(rating.cr) - base));
    }

    /** Удары форы на лунке: распределяются по индексам сложности. */
    function foreOnHole(si, ch) {
        var index = intOf(si, 0) || 0;
        var handicap = intOf(ch, 0) || 0;
        if (!index || !handicap) return 0;
        if (handicap > 0) {
            var whole = Math.floor(handicap / 18);
            if (index <= handicap % 18) whole++;
            return whole;
        }
        var abs = Math.abs(handicap);
        var negative = -Math.floor(abs / 18);
        if ((19 - index) <= abs % 18) negative--;
        return negative;
    }

    /** Очки стэйблфорда: 2 за пар, −1 за каждый удар сверх/ниже. */
    function stableford(strokes, par, fore) {
        var gross = intOf(strokes, 0);
        if (!gross || gross < 1) return null;
        var net = gross - (intOf(fore, 0) || 0);
        return Math.max(0, 2 - (net - (intOf(par, 4) || 4)));
    }

    function scoreAt(scores, hole) {
        if (!scores) return null;
        var raw = scores[hole] != null ? scores[hole] : scores[String(hole)];
        if (raw == null || raw === '') return null;
        var value = intOf(raw, 0);
        return isFinite(value) && value > 0 ? value : null;
    }

    // ----------------------------------------------------------
    // 5. КАРТОЧКА ИГРОКА (18 ЛУНОК)
    // ----------------------------------------------------------
    /**
     * Карточка по лункам. course — объект вида
     * { par(hole), dist(hole, tee), si(hole) } (по умолчанию — поле клуба).
     */
    function playerCard(scores, course, tee, ch, options) {
        var opts = options || {};
        var api = course || defaultCourse();
        var fores = asMap(opts.fores);
        var holes = [];
        for (var hole = 1; hole <= 18; hole++) {
            var par = intOf(api.par ? api.par(hole) : 4, 4) || 4;
            var si = intOf(api.si ? api.si(hole) : hole, hole) || hole;
            var dist = intOf(api.dist ? api.dist(hole, tee) : 0, 0) || 0;
            var strokes = scoreAt(scores, hole);
            var fore = fores[hole] != null ? intOf(fores[hole], 0) : foreOnHole(si, ch);
            holes.push({
                hole: hole, length: dist, par: par, index: si, fore: fore,
                strokes: strokes,
                grossPoints: strokes == null ? null : stableford(strokes, par, 0),
                netPoints: strokes == null ? null : stableford(strokes, par, fore)
            });
        }
        return { holes: holes, totals: cardTotals(holes), ch: ch == null ? null : intOf(ch, ch) };
    }

    function cardTotals(holes) {
        function pack(list) {
            var sum = { length: 0, par: 0, strokes: 0, grossPoints: 0, netPoints: 0, played: 0 };
            list.forEach(function (h) {
                sum.length += h.length || 0;
                sum.par += h.par || 0;
                if (h.strokes != null) {
                    sum.strokes += h.strokes;
                    sum.grossPoints += h.grossPoints || 0;
                    sum.netPoints += h.netPoints || 0;
                    sum.played++;
                }
            });
            if (!sum.played) { sum.strokes = null; sum.grossPoints = null; sum.netPoints = null; }
            return sum;
        }
        var list = holes || [];
        return {
            holes: list,
            out: pack(list.slice(0, 9)),
            in: pack(list.slice(9, 18)),
            total: pack(list),
            toPar: null
        };
    }

    function cardResult(card, scoring) {
        if (!card || !card.totals) return null;
        var total = card.totals.total;
        if (total.played === 0) return null;
        if (scoring === 'stableford') return { kind: 'points', value: total.netPoints };
        return { kind: 'strokes', value: total.strokes };
    }

    // ----------------------------------------------------------
    // 6. СУЩНОСТИ (Tournament / Round / Group / Player / …)
    // ----------------------------------------------------------
    function newTournament(input) {
        var src = input || {};
        var startDate = dateIso(src.startDate || src.date) || todayIso();
        return {
            name: trim(src.name),
            startDate: startDate,
            date: startDate, // совместимость с публичной страницей
            startTime: timeText(src.startTime, '09:00'),
            formats: uniq((src.formats || []).map(function (f) { return trim(f); }).filter(Boolean)),
            club: trim(src.club) || 'Гольф-клуб Пестово',
            course: trim(src.course) || 'Пестово (18 лунок, пар 72)',
            note: trim(src.note),
            status: src.status || 'draft',
            source: 'tn-manager'
        };
    }

    function newRound(input) {
        var src = input || {};
        return {
            id: src.id || '',
            date: dateIso(src.date) || todayIso(),
            name: trim(src.name),
            club: trim(src.club),
            course: trim(src.course),
            startTime: timeText(src.startTime, ''),
            tee: trim(src.tee),
            formats: uniq((src.formats || []).map(trim).filter(Boolean)),
            note: trim(src.note)
        };
    }

    function newGroup(input) {
        var src = input || {};
        return {
            id: src.id || '',
            name: trim(src.name),
            hcpFrom: src.hcpFrom == null || src.hcpFrom === '' ? '' : num(src.hcpFrom),
            hcpTo: src.hcpTo == null || src.hcpTo === '' ? '' : num(src.hcpTo),
            gender: normalizeGender(src.gender) || 'all',
            tee: trim(src.tee),
            format: trim(src.format),
            members: asMap(src.members)
        };
    }

    /** Диапазон гандикапа группы текстом: «10 – 18,5». */
    function groupRangeText(group) {
        if (!group) return '';
        var from = group.hcpFrom === '' || group.hcpFrom == null ? null : num(group.hcpFrom);
        var to = group.hcpTo === '' || group.hcpTo == null ? null : num(group.hcpTo);
        if (from == null && to == null) return '—';
        if (from != null && to != null) return fmtHcp(from) + ' – ' + fmtHcp(to);
        if (from != null) return 'от ' + fmtHcp(from);
        return 'до ' + fmtHcp(to);
    }

    function groupMatchesPlayer(group, player) {
        if (!group) return false;
        var hcp = num(effectiveHcp(player));
        var from = group.hcpFrom === '' || group.hcpFrom == null ? -999 : num(group.hcpFrom, -999);
        var to = group.hcpTo === '' || group.hcpTo == null ? 999 : num(group.hcpTo, 999);
        if (hcp == null) return from === -999 && to === 999;
        var value = Math.round(hcp * 10) / 10;
        if (group.gender && group.gender !== 'all') {
            var gender = normalizeGender(player && player.gender) || '';
            if (gender && gender !== group.gender) return false;
        }
        return value + 1e-9 >= Math.round(from * 10) / 10 && value - 1e-9 <= Math.round(to * 10) / 10;
    }

    /** Гандикап игрока для группировки: игровой (CH), иначе точный HI. */
    function effectiveHcp(player) {
        var p = player || {};
        if (p.ch != null && p.ch !== '') return p.ch;
        if (p.handicap != null && p.handicap !== '') return p.handicap;
        return p.hi;
    }

    function newPlayer(input) {
        var src = input || {};
        var fio = playerFio(src);
        var parts = splitFio(fio);
        var gender = normalizeGender(src.gender);
        return {
            id: src.id || '',
            fio: fio,
            name: fio,
            firstName: trim(src.firstName) || parts.firstName,
            lastName: trim(src.lastName) || parts.lastName,
            middleName: trim(src.middleName) || parts.middleName,
            hi: src.hi != null ? num(src.hi) : (src.handicap != null ? num(src.handicap) : null),
            ch: src.ch != null ? num(src.ch) : null,
            gender: gender || 'men',
            tee: trim(src.tee),
            format: trim(src.format),
            groupId: trim(src.groupId),
            club: trim(src.club),
            source: src.source || 'manual', // directory | manual | excel
            uid: trim(src.uid),
            fores: asMap(src.fores)
        };
    }

    // ----------------------------------------------------------
    // 7. СТАРТОВЫЙ ЛИСТ
    // ----------------------------------------------------------
    /**
     * Генерация стартового листа.
     * options: {
     *   groupSize (4), startInterval (8 мин), firstTeeTime ('09:00'),
     *   tee (по умолчанию), format, markMode ('group'|'flight'|'order'),
     *   groups: [] определения групп (с участниками), players: [] участники
     * }
     * Возвращает { entries: [...], groups: [...] } — готовые строки листа.
     */
    function buildSheet(options) {
        var opts = options || {};
        var players = (opts.players || []).map(function (p, index) {
            var copy = clone(p) || {};
            copy._order = index;
            return copy;
        });
        var definitions = opts.groups || [];
        var groupSize = Math.max(1, intOf(opts.groupSize, 4) || 4);
        var interval = Math.max(1, intOf(opts.startInterval, 8) || 8);
        var firstTime = timeText(opts.firstTeeTime, '09:00');
        var defaultTee = trim(opts.tee) || 'wh';
        var defaultFormat = trim(opts.format) || '';
        var used = {};
        var groups = [];

        function takeGroupMembers(definition) {
            var ids = asMap(definition.members);
            var memberIds = Object.keys(ids);
            var list = [];
            players.forEach(function (player) {
                if (used[player.id]) return;
                var member = !!definition.members && (memberIds.indexOf(player.id) !== -1 ||
                    (definition.members[player.id] && definition.members[player.id] !== false));
                var autoMember = !memberIds.length && groupMatchesPlayer(definition, player);
                if (member || autoMember) list.push(player);
            });
            if (!memberIds.length) {
                // Группа без явного состава: диапазон может быть пустым — тогда
                // берём «остальных» только для последней группы (см. ниже).
                list = list.slice(0, groupSize);
            }
            return list;
        }

        definitions.forEach(function (definition) {
            var members = takeGroupMembers(definition);
            members = members.slice(0, groupSize);
            if (!members.length) return;
            members.forEach(function (player) { used[player.id] = true; });
            groups.push({ id: definition.id, name: definition.name, definition: definition, players: members });
        });

        // Остальные игроки: сначала те, кому не нашлось группы по диапазону.
        var rest = players.filter(function (player) { return !used[player.id]; });
        rest.sort(function (a, b) { return comparableHcp(a) - comparableHcp(b); });
        var sortedAuto = rest.slice();
        for (var i = 0; i < sortedAuto.length; i += groupSize) {
            var chunk = sortedAuto.slice(i, i + groupSize);
            chunk.forEach(function (player) { used[player.id] = true; });
            groups.push({ id: '', name: '', definition: null, players: chunk });
        }

        // Порядок групп: сначала группы справочника (в их порядке), затем авто.
        var entries = [];
        var flightMap = {};
        var flights = [];
        groups.forEach(function (group, groupIndex) {
            var playerCount = group.players.length;
            var flightKey = '';
            if (opts.flights === false) {
                flightKey = '';
            } else {
                // Флайты: по 3 группы в флайт (A, B, C…) — как в клубной практике.
                var flightIndex = Math.floor(groupIndex / Math.max(1, intOf(opts.groupsPerFlight, 3) || 3));
                flightKey = flightLetter(flightIndex);
                if (flights.indexOf(flightKey) === -1) flights.push(flightKey);
            }
            var startTime = addMinutesToTime(firstTime, groupIndex * interval);
            var groupTee = trim(group.definition && group.definition.tee) || trim(group.players[0] && group.players[0].tee) || defaultTee;
            var groupFormat = trim(group.definition && group.definition.format) || defaultFormat;
            var markers = assignMarkers(group.players, opts.markMode);
            group.players.forEach(function (player, position) {
                var markerId = markers[player.id] || '';
                entries.push({
                    playerId: player.id,
                    playerName: playerFio(player),
                    firstName: player.firstName || '',
                    lastName: player.lastName || '',
                    middleName: player.middleName || '',
                    gender: normalizeGender(player.gender) || '',
                    hi: player.hi != null ? player.hi : (player.handicap != null ? player.handicap : ''),
                    ch: player.ch != null ? player.ch : '',
                    groupId: group.id || '',
                    groupName: group.name || '',
                    markerPlayerId: markerId,
                    tee: trim(player.tee) || groupTee,
                    format: trim(player.format) || groupFormat,
                    flight: flightKey,
                    startTime: startTime,
                    position: position + 1,
                    order: entries.length + 1,
                    qr: ''
                });
                flightMap[flightKey] = true;
            });
            group.startTime = startTime;
            group.flight = flightKey;
            group.tee = groupTee;
            group.format = groupFormat;
            group.markerPlayerId = markers[(group.players[0] || {}).id] || '';
        });

        return {
            entries: entries,
            groups: groups,
            flights: flights,
            options: {
                groupSize: groupSize, startInterval: interval, firstTeeTime: firstTime,
                tee: defaultTee, format: defaultFormat, markMode: opts.markMode || 'group',
                groupsPerFlight: intOf(opts.groupsPerFlight, 3) || 3, flights: opts.flights !== false
            }
        };
    }

    function comparableHcp(player) {
        var hcp = num(effectiveHcp(player));
        return hcp == null ? 999 : hcp;
    }

    function flightLetter(index) {
        var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        var i = Math.max(0, intOf(index, 0) || 0);
        if (i < letters.length) return letters.charAt(i);
        return 'F' + (i + 1);
    }

    /**
     * Маркеры внутри группы: каждый игрок маркирует следующего,
     * последний — первого. mode='order' — по общему порядку листа.
     */
    function assignMarkers(players, mode) {
        var out = {};
        var list = players || [];
        if (!list.length) return out;
        if (list.length === 1) { out[list[0].id] = list[0].id; return out; }
        list.forEach(function (player, index) {
            var next = mode === 'reverse' ? list[index - 1] : list[(index + 1) % list.length];
            out[player.id] = (next || {}).id || '';
        });
        return out;
    }

    /** Проверка стартового листа: непустой, без дублей игроков. */
    function validateSheet(entries) {
        var issues = [];
        var seen = {};
        (entries || []).forEach(function (entry) {
            if (!entry.playerId) issues.push({ code: 'no-player', entry: entry });
            if (entry.playerId && seen[entry.playerId]) issues.push({ code: 'duplicate', entry: entry });
            seen[entry.playerId] = true;
        });
        return issues;
    }

    /**
     * Применяет правку строки стартового листа и возвращает изменения,
     * которые нужно синхронизировать с турниром/участниками/группами.
     */
    function applyEntryPatch(sheet, playerId, patch) {
        var next = clone(sheet) || { entries: [] };
        next.entries = next.entries || [];
        var changed = null;
        next.entries.forEach(function (entry) {
            if (entry.playerId !== playerId) return;
            Object.keys(patch || {}).forEach(function (key) { entry[key] = patch[key]; });
            changed = entry;
        });
        if (!changed) return { sheet: next, entry: null, sync: null };
        // Порядок: если у строки поменялся порядок — пересобираем нумерацию.
        if (patch && (patch.order != null || patch.groupId != null)) {
            next.entries.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
            next.entries.forEach(function (entry, index) { entry.order = index + 1; });
        }
        return {
            sheet: next,
            entry: changed,
            sync: {
                player: {
                    groupId: changed.groupId || '',
                    tee: changed.tee || '',
                    format: changed.format || '',
                    fio: changed.playerName || ''
                }
            }
        };
    }

    /** Пересчитывает позиции внутри групп после ручных правок. */
    function recalcSheet(entries) {
        var sorted = (entries || []).slice().sort(function (a, b) {
            var groupA = str(a.groupId) + '|' + str(a.flight);
            var groupB = str(b.groupId) + '|' + str(b.flight);
            if (groupA !== groupB) return groupA < groupB ? -1 : 1;
            return (a.order || 0) - (b.order || 0);
        });
        var counters = {};
        sorted.forEach(function (entry) {
            var key = str(entry.groupId) + '|' + str(entry.flight) + '|' + str(entry.startTime);
            counters[key] = (counters[key] || 0) + 1;
            entry.position = counters[key];
        });
        sorted.forEach(function (entry, index) { entry.order = index + 1; });
        return sorted;
    }

    // ----------------------------------------------------------
    // 8. РЕЗУЛЬТАТЫ И МЕСТА
    // ----------------------------------------------------------
    /**
     * Результаты раунда по игрокам.
     * rows: [{ playerId, playerName, gender, groupId, card, ch }]
     * scoring: 'stableford' | 'gross' | 'net'
     */
    function buildResults(rows, scoring) {
        var list = (rows || []).map(function (row) {
            var card = row.card || { totals: { total: { played: 0 } } };
            var total = (card.totals || {}).total || { played: 0 };
            var gross = total.played ? total.strokes : null;
            var points = total.played ? total.netPoints : null;
            var ch = intOf(row.ch, 0) || 0;
            var net = gross == null ? null : gross - ch;
            var value = null;
            if (scoring === 'gross') value = gross;
            else if (scoring === 'net') value = net;
            else value = points;
            return {
                playerId: row.playerId,
                playerName: row.playerName,
                gender: row.gender || '',
                groupId: row.groupId || '',
                groupName: row.groupName || '',
                ch: row.ch,
                holesPlayed: total.played || 0,
                gross: gross,
                net: net,
                points: points,
                value: value,
                place: '',
                manual: !!row.manual
            };
        });
        return list;
    }

    /**
     * Места по значению: больше — лучше для очков, меньше — лучше для ударов.
     * Ничьи получают одинаковое место (1, 2, 2, 4).
     */
    function assignPlaces(rows, scoring) {
        var list = (rows || []).slice();
        var better = scoring === 'stableford';
        var ranked = list.filter(function (row) { return row.value != null && row.holesPlayed !== 0; });
        ranked.sort(function (a, b) {
            if (a.value === b.value) return str(a.playerName).localeCompare(str(b.playerName), 'ru');
            return better ? b.value - a.value : a.value - b.value;
        });
        var lastValue = null, lastPlace = 0;
        ranked.forEach(function (row, index) {
            var place = index + 1;
            if (lastValue != null && row.value === lastValue) place = lastPlace;
            row.place = place;
            lastValue = row.value;
            lastPlace = place;
        });
        list.forEach(function (row) {
            var found = null;
            ranked.forEach(function (rankedRow) { if (rankedRow.playerId === row.playerId) found = rankedRow; });
            row.place = found ? found.place : '';
        });
        return list;
    }

    function placeLabel(place) {
        var p = intOf(place, 0);
        if (!p) return '';
        if (p === 1) return '1';
        if (p === 2) return '2';
        if (p === 3) return '3';
        return String(p);
    }

    function isPodium(place) { return intOf(place, 0) >= 1 && intOf(place, 0) <= 3; }

    /** Ручные правки результатов (организатор может исправить счёт/очки). */
    function applyResultOverrides(rows, overrides) {
        var map = asMap(overrides);
        return (rows || []).map(function (row) {
            var patch = map[row.playerId];
            if (!patch) return row;
            var next = clone(row) || {};
            if (patch.gross != null && patch.gross !== '') next.gross = intOf(patch.gross, next.gross);
            if (patch.points != null && patch.points !== '') next.points = intOf(patch.points, next.points);
            if (patch.net != null && patch.net !== '') next.net = intOf(patch.net, next.net);
            if (patch.status) next.status = patch.status;
            next.manual = true;
            next.value = patch.value != null ? patch.value : next.value;
            return next;
        });
    }

    /** Сортировка таблицы по колонке (ручная сортировка по клику). */
    function sortRows(rows, key, dir) {
        var list = (rows || []).slice();
        var desc = dir === 'desc';
        list.sort(function (a, b) {
            var av = a ? a[key] : null, bv = b ? b[key] : null;
            if (typeof av === 'string' || typeof bv === 'string') {
                var as = str(av), bs = str(bv);
                return desc ? bs.localeCompare(as, 'ru') : as.localeCompare(bs, 'ru');
            }
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            return desc ? bv - av : av - bv;
        });
        return list;
    }

    // ----------------------------------------------------------
    // 9. ИМПОРТ УЧАСТНИКОВ (EXCEL / ТАБЛИЦА / CSV)
    // ----------------------------------------------------------
    var IMPORT_ALIASES = {
        fio: ['фио', 'ф.и.о', 'имя', 'name', 'player', 'игрок', 'гольфист', 'участник', 'фамилия и имя', 'last name, first name'],
        lastName: ['фамилия', 'last', 'lastname', 'surname', 'family'],
        firstName: ['имя', 'first', 'firstname', 'given'],
        middleName: ['отчество', 'middle', 'patronymic', 'middlename'],
        hi: ['hi', 'гандикап', 'hcp', 'handicap', 'точный гандикап', 'индекс', 'index'],
        ch: ['ch', 'игровой гандикап', 'course handicap', 'полевой гандикап'],
        gender: ['пол', 'gender', 'sex'],
        tee: ['ти', 'tee', 'цвет', 'tees', 'ти (tee)'],
        group: ['группа', 'group', 'зачёт', 'дивизион', 'division'],
        format: ['формат', 'format'],
        club: ['клуб', 'club', 'команда', 'team']
    };

    function headerKind(header) {
        var h = normText(header).replace(/[.()]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!h) return '';
        var kinds = Object.keys(IMPORT_ALIASES);
        for (var i = 0; i < kinds.length; i++) {
            var kind = kinds[i];
            if (IMPORT_ALIASES[kind].some(function (alias) { return h === normText(alias) || h.indexOf(normText(alias)) !== -1; })) return kind;
        }
        return '';
    }

    /**
     * Разбор массива строк (Excel/CSV/таблица) в участников.
     * Первая непустая строка — заголовки; если заголовков нет,
     * определяем колонки по содержимому (ФИО + гандикап).
     */
    function parseParticipants(aoa) {
        var rows = (aoa || []).filter(function (row) {
            return (row || []).some(function (cell) { return trim(cell) !== ''; });
        });
        var result = { players: [], issues: [], header: [] };
        if (!rows.length) return result;

        var header = rows[0].map(function (cell) { return trim(cell); });
        var mapping = {};
        var headerKinds = header.map(headerKind);
        var hasHeader = headerKinds.filter(Boolean).length >= 2 ||
            headerKinds.indexOf('fio') !== -1 || headerKinds.indexOf('lastName') !== -1;
        var dataRows = hasHeader ? rows.slice(1) : rows;
        if (hasHeader) {
            result.header = header;
            headerKinds.forEach(function (kind, index) { if (kind && mapping[kind] == null) mapping[kind] = index; });
        } else {
            // Без заголовков: 1-я колонка — ФИО, 2-я — гандикап (если число).
            mapping.fio = 0;
            if (rows[0] && rows[0].length > 1 && num(rows[0][1]) != null) mapping.hi = 1;
            if (rows[0] && rows[0].length > 2 && normalizeGender(rows[0][2])) mapping.gender = 2;
        }

        var seen = {};
        dataRows.forEach(function (row, index) {
            var get = function (kind) {
                var at = mapping[kind];
                return at == null ? '' : trim(row[at]);
            };
            var fio = get('fio');
            var last = get('lastName'), first = get('firstName'), middle = get('middleName');
            if (!fio) fio = trim([last, first, middle].filter(Boolean).join(' '));
            if (!fio) {
                result.issues.push({ row: index + (hasHeader ? 2 : 1), code: 'empty-name', message: 'Пустое ФИО — строка пропущена' });
                return;
            }
            var hiRaw = get('hi');
            var player = newPlayer({
                fio: fio,
                lastName: last, firstName: first, middleName: middle,
                hi: num(hiRaw),
                ch: num(get('ch')),
                gender: get('gender'),
                tee: get('tee'),
                groupId: '',
                format: get('format'),
                club: get('club'),
                source: 'excel'
            });
            player.groupName = get('group');
            if (hiRaw && num(hiRaw) == null) {
                result.issues.push({ row: index + (hasHeader ? 2 : 1), code: 'bad-hcp', message: 'Гандикап не распознан: ' + hiRaw });
            }
            if (num(get('ch')) == null && player.ch != null && num(player.ch) == null) player.ch = null;
            if (!normalizeGender(get('gender'))) player.gender = '';
            var key = playerKeyByFio(player);
            if (seen[key]) {
                result.issues.push({ row: index + (hasHeader ? 2 : 1), code: 'duplicate', message: 'Дубль ФИО: ' + player.fio });
                return;
            }
            seen[key] = true;
            result.players.push(player);
        });
        return result;
    }

    /** Разбор вставленного текста (табуляция/точка с запятой/запятая). */
    function parseDelimited(text) {
        var lines = str(text).split(/\r?\n/).filter(function (line) { return trim(line) !== ''; });
        return lines.map(function (line) {
            var sep = line.indexOf('\t') !== -1 ? '\t' : (line.indexOf(';') !== -1 ? ';' : ',');
            return line.split(sep).map(function (cell) { return cell.replace(/^"|"$/g, '').trim(); });
        });
    }

    // ----------------------------------------------------------
    // 10. ЭКСПОРТ: СТРОКИ EXCEL/CSV И ПЕЧАТНЫЕ ДОКУМЕНТЫ
    // ----------------------------------------------------------
    function csvFromRows(rows, separator) {
        var sep = separator || ';';
        return (rows || []).map(function (row) {
            return (row || []).map(function (cell) {
                var text = str(cell);
                // Защита от формул в Excel (имя, начинающееся с =, +, -, @).
                if (/^[=+\-@\t]/.test(text)) text = "'" + text;
                if (text.indexOf(sep) !== -1 || text.indexOf('"') !== -1 || text.indexOf('\n') !== -1) {
                    return '"' + text.replace(/"/g, '""') + '"';
                }
                return text;
            }).join(sep);
        }).join('\r\n');
    }

    // Заголовки таблиц (RU/EN) — используются в Excel/PDF и тестах.
    var HEADERS = {
        participants: { ru: ['№', 'ФИО', 'HI', 'CH', 'Пол', 'ТИ', 'Группа', 'Источник'], en: ['#', 'Name', 'HI', 'CH', 'Gender', 'Tee', 'Group', 'Source'] },
        sheet: { ru: ['№', 'Время', 'Флайт', 'Группа', 'Поз.', 'ФИО', 'HI', 'CH', 'ТИ', 'Формат', 'Маркер'], en: ['#', 'Time', 'Flight', 'Group', 'Pos.', 'Name', 'HI', 'CH', 'Tee', 'Format', 'Marker'] },
        results: { ru: ['Место', 'Игрок', 'Счёт', 'Нетто', 'Очки стэйблфорда', 'Группа'], en: ['Place', 'Player', 'Score', 'Net', 'Stableford points', 'Group'] },
        scores: { ru: ['Игрок', 'Группа', 'ТИ', 'CH', 'Лунки 1–18', 'Итог'], en: ['Player', 'Group', 'Tee', 'CH', 'Holes 1–18', 'Total'] },
        playerCard: { ru: ['Лунка', 'Длина', 'Пар', 'Индекс', 'Фора', 'Удары', 'Очки гросс', 'Очки нетто'], en: ['Hole', 'Length', 'Par', 'Index', 'Fore', 'Strokes', 'Gross points', 'Net points'] }
    };

    function headerRow(kind, lang) {
        var set = HEADERS[kind] || { ru: [], en: [] };
        return (lang === 'en' ? set.en : set.ru).slice();
    }

    function teeName(tee, lang) {
        var map = {
            bk: { ru: 'Чёрный', en: 'Black' },
            bl: { ru: 'Синий', en: 'Blue' },
            wh: { ru: 'Белый', en: 'White' },
            rd: { ru: 'Красный', en: 'Red' },
            gd: { ru: 'Золотой', en: 'Gold' }
        };
        var key = trim(tee).toLowerCase();
        if (map[key]) return lang === 'en' ? map[key].en : map[key].ru;
        return trim(tee);
    }

    function sourceLabel(source, lang) {
        var map = {
            directory: { ru: 'Справочник', en: 'Directory' },
            manual: { ru: 'Вручную', en: 'Manual' },
            excel: { ru: 'Excel', en: 'Excel' },
            registration: { ru: 'Заявка', en: 'Entry' }
        };
        var item = map[source];
        if (item) return lang === 'en' ? item.en : item.ru;
        return trim(source);
    }

    /** Строки Excel: участники (для экспорта PDF/Excel). */
    function participantsRows(players, lang) {
        var rows = [headerRow('participants', lang)];
        (players || []).forEach(function (player, index) {
            rows.push([
                index + 1, playerFio(player), fmtHcp(player.hi), fmtHcp(player.ch),
                genderLabel(player.gender, lang), teeName(player.tee, lang),
                player.groupName || '', sourceLabel(player.source, lang)
            ]);
        });
        return rows;
    }

    /** Строки Excel: стартовый лист. */
    function sheetRows(entries, lang) {
        var rows = [headerRow('sheet', lang)];
        (entries || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
            .forEach(function (entry, index) {
                rows.push([
                    index + 1, entry.startTime || '', entry.flight || '', entry.groupName || '', entry.position || '',
                    entry.playerName || '', fmtHcp(entry.hi), fmtHcp(entry.ch), teeName(entry.tee, lang),
                    entry.format || '', entry.markerName || ''
                ]);
            });
        return rows;
    }

    /** Строки Excel: результаты раунда. */
    function resultsRows(rows, lang) {
        var out = [headerRow('results', lang)];
        (rows || []).forEach(function (row) {
            out.push([
                row.place || '', row.playerName || '', row.gross == null ? '' : row.gross,
                row.net == null ? '' : row.net, row.points == null ? '' : row.points, row.groupName || ''
            ]);
        });
        return out;
    }

    /** Строки Excel: счёт раунда по лункам. */
    function scoreRows(players, cards, course, lang) {
        var out = [['Лунка'].concat(headerRow('scores', lang).concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]))];
        var api = course || defaultCourse();
        var lengths = ['Длина', 'Пар', 'Индекс'];
        var lengthRow = [lengths[0]];
        var parRow = [lengths[1]];
        var indexRow = [lengths[2]];
        for (var hole = 1; hole <= 18; hole++) {
            lengthRow.push(api.dist ? api.dist(hole, 'wh') : '');
            parRow.push(api.par ? api.par(hole) : 4);
            indexRow.push(api.si ? api.si(hole) : hole);
        }
        out = [lengthRow, parRow, indexRow];
        out.unshift(['', '', '', ''].concat(headerRow('scores', lang)).concat(['', 'Итог']));
        (players || []).forEach(function (player, index) {
            var card = (cards || {})[player.id];
            var line = [index + 1, playerFio(player), teeName(player.tee, lang), fmtHcp(player.ch)];
            var cardHoles = (card && card.holes) || [];
            cardHoles.forEach(function (hole) { line.push(hole.strokes == null ? '' : hole.strokes); });
            line.push(card && card.totals && card.totals.total.strokes != null ? card.totals.total.strokes : '');
            out.push(line);
        });
        return out;
    }

    /** Поле клуба по умолчанию (если js/course-config.js не загружен). */
    function defaultCourse() {
        var pars = { 1: 4, 2: 4, 3: 5, 4: 3, 5: 4, 6: 4, 7: 4, 8: 3, 9: 5, 10: 5, 11: 4, 12: 4, 13: 3, 14: 4, 15: 5, 16: 4, 17: 3, 18: 4 };
        var sis = { 1: 5, 2: 13, 3: 9, 4: 11, 5: 1, 6: 15, 7: 3, 8: 7, 9: 17, 10: 12, 11: 16, 12: 2, 13: 18, 14: 4, 15: 8, 16: 14, 17: 10, 18: 6 };
        return {
            par: function (hole) { return pars[hole] || 4; },
            si: function (hole) { return sis[hole] || hole; },
            dist: function (hole, tee) {
                var map = {
                    1: 328, 2: 257, 3: 464, 4: 161, 5: 370, 6: 333, 7: 336, 8: 159, 9: 421,
                    10: 461, 11: 345, 12: 365, 13: 138, 14: 327, 15: 483, 16: 368, 17: 174, 18: 335
                };
                var factor = tee === 'bk' ? 1.1 : tee === 'bl' ? 1.05 : tee === 'rd' ? 0.9 : 1;
                return Math.round((map[hole] || 0) * factor);
            },
            tee: 'wh'
        };
    }

    /** Ссылка на ввод счёта для QR-кода (переиспользует страницы скоринга). */
    function scoreUrl(base, roundId, playerId, groupSize) {
        var prefix = trim(base);
        if (prefix && prefix.charAt(prefix.length - 1) !== '/') prefix += '/';
        var solo = (intOf(groupSize, 2) || 2) < 2;
        if (solo) return prefix + 'scorer.html?round=' + encodeURIComponent(roundId) + '&player=' + encodeURIComponent(playerId);
        return prefix + 'setup-round.html?round=' + encodeURIComponent(roundId) + '&as=' + encodeURIComponent(playerId);
    }

    function qrImageUrl(payload, size) {
        var px = intOf(size, 320) || 320;
        return 'https://api.qrserver.com/v1/create-qr-code/?size=' + px + 'x' + px +
            '&margin=2&data=' + encodeURIComponent(payload);
    }

    // ----------------------------------------------------------
    // 11. ПЕЧАТНЫЕ ДОКУМЕНТЫ (PDF через печать браузера)
    // ----------------------------------------------------------
    var PRINT_CSS = [
        '*{box-sizing:border-box}',
        'body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:18px;font-size:11px}',
        'h1{font-size:18px;margin:0 0 4px}',
        'h2{font-size:13px;margin:16px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}',
        '.muted{color:#555}',
        '.head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}',
        '.meta{font-size:11px;color:#333;margin:2px 0}',
        'table{width:100%;border-collapse:collapse;margin-bottom:10px}',
        'th,td{border:1px solid #aaa;padding:3px 5px;text-align:left;vertical-align:middle}',
        'th{background:#eef1e6;font-weight:700}',
        'td.num,th.num{text-align:center}',
        '.group{border:1px solid #999;border-radius:6px;padding:6px 8px;margin-bottom:8px;page-break-inside:avoid}',
        '.group-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:4px}',
        '.group-title{font-weight:700}',
        '.qr{width:96px;height:96px;image-rendering:pixelated}',
        '.qr-sm{width:64px;height:64px}',
        '.qr-box{text-align:center;font-size:9px;color:#444}',
        '.flight-title{margin:14px 0 6px;font-size:13px;font-weight:700;background:#f2f2f2;padding:4px 6px;border-left:4px solid #4a6b2a}',
        '.podium-1{background:#fff4c2;font-weight:700}',
        '.podium-2{background:#eef0f3;font-weight:700}',
        '.podium-3{background:#f7e8dc;font-weight:700}',
        '.totals{font-weight:700;background:#fafaf5}',
        '@media print{button{display:none}}',
        '@page{size:A4 landscape;margin:10mm}',
        '@page portrait{size:A4 portrait;margin:10mm}'
    ].join('');

    function printDocument(title, bodyHtml, options) {
        var opts = options || {};
        var css = PRINT_CSS + (opts.portrait ? '@page{size:A4 portrait;margin:10mm}' : '');
        return '<!doctype html><html lang="' + (opts.lang === 'en' ? 'en' : 'ru') + '"><head><meta charset="utf-8">' +
            '<title>' + esc(title) + '</title><style>' + css + '</style></head><body>' +
            bodyHtml + '</body></html>';
    }

    function docHeader(title, metaLines, qr) {
        var html = '<div class="head"><div><h1>' + esc(title) + '</h1>';
        (metaLines || []).forEach(function (line) { html += '<div class="meta">' + esc(line) + '</div>'; });
        html += '</div>';
        if (qr && qr.payload) {
            html += '<div class="qr-box"><img class="qr" src="' + esc(qrImageUrl(qr.payload, 320)) +
                '" data-qr="' + esc(qr.payload) + '" alt="QR">' +
                (qr.caption ? '<div>' + esc(qr.caption) + '</div>' : '') + '</div>';
        }
        return html + '</div>';
    }

    function participantsHtml(opts) {
        var o = opts || {};
        var lang = o.lang === 'en' ? 'en' : 'ru';
        var rows = participantsRows(o.players || [], lang);
        var body = docHeader(o.title || (lang === 'en' ? 'Participants' : 'Участники'), o.meta || []);
        body += '<table><thead><tr>';
        (rows[0] || []).forEach(function (cell, index) { body += '<th' + (index === 0 ? ' class="num"' : '') + '>' + esc(cell) + '</th>'; });
        body += '</tr></thead><tbody>';
        rows.slice(1).forEach(function (row) {
            body += '<tr>';
            row.forEach(function (cell, index) { body += '<td' + (index === 0 ? ' class="num"' : '') + '>' + esc(cell) + '</td>'; });
            body += '</tr>';
        });
        body += '</tbody></table>';
        var counts = participantsCounts(o.players || []);
        body += '<div class="meta">' + esc((lang === 'en' ? 'Total: ' : 'Всего: ') + counts.total +
            ' · ' + (lang === 'en' ? 'men: ' : 'мужчин: ') + counts.men +
            ' · ' + (lang === 'en' ? 'women: ' : 'женщин: ') + counts.women) + '</div>';
        return printDocument(o.title || 'Участники', body, { lang: lang, portrait: true });
    }

    /** Количество участников (для строки счётчиков). */
    function participantsCounts(players) {
        var total = 0, men = 0, women = 0;
        (players || []).forEach(function (player) {
            total++;
            var gender = normalizeGender(player.gender);
            if (gender === 'men') men++;
            else if (gender === 'women') women++;
        });
        return { total: total, men: men, women: women };
    }

    /** PDF стартового листа: флайты, группы, игроки и QR маркеров. */
    function sheetHtml(opts) {
        var o = opts || {};
        var lang = o.lang === 'en' ? 'en' : 'ru';
        var entries = (o.entries || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var title = o.title || (lang === 'en' ? 'Tee sheet' : 'Стартовый лист');
        var meta = [];
        if (o.tournamentName) meta.push(o.tournamentName);
        if (o.roundDate) meta.push((lang === 'en' ? 'Round: ' : 'Раунд: ') + dateRu(o.roundDate));
        if (o.course) meta.push((lang === 'en' ? 'Course: ' : 'Поле: ') + o.course);
        var body = docHeader(title, meta, o.tournamentQr ? { payload: o.tournamentQr, caption: lang === 'en' ? 'Tournament' : 'Турнир' } : null);

        var byFlight = {};
        entries.forEach(function (entry) {
            var flight = entry.flight || '';
            byFlight[flight] = byFlight[flight] || {};
            var groupKey = entry.groupId || entry.groupName || ('g' + (entry.position || 0) + '_' + (entry.startTime || ''));
            byFlight[flight][groupKey] = byFlight[flight][groupKey] || [];
            byFlight[flight][groupKey].push(entry);
        });
        Object.keys(byFlight).sort().forEach(function (flight) {
            if (flight) body += '<div class="flight-title">' + esc((lang === 'en' ? 'Flight ' : 'Флайт ') + flight) + '</div>';
            Object.keys(byFlight[flight]).forEach(function (groupKey) {
                var list = byFlight[flight][groupKey];
                var markerEntry = list.filter(function (entry) { return entry.isMarker; })[0] || list[0];
                var qrPayload = markerEntry ? (markerEntry.qr || markerEntry.scoreUrl || '') : '';
                var groupTitle = (list[0].groupName || (lang === 'en' ? 'Group' : 'Группа')) +
                    ' · ' + (list[0].startTime || '') + ' · ' + (lang === 'en' ? 'hole 1' : 'лунка 1');
                body += '<div class="group"><div class="group-head"><div><div class="group-title">' + esc(groupTitle) + '</div>' +
                    '<div class="muted">' + esc(teeName(list[0].tee, lang) + (list[0].format ? ' · ' + list[0].format : '')) + '</div></div>';
                if (qrPayload) {
                    body += '<div class="qr-box"><img class="qr-sm" src="' + esc(qrImageUrl(qrPayload, 240)) +
                        '" data-qr="' + esc(qrPayload) + '" alt="QR"><div>' +
                        esc(lang === 'en' ? 'Marker QR' : 'QR маркера') + '</div></div>';
                }
                body += '</div><table><thead><tr><th class="num">#</th><th>' +
                    (lang === 'en' ? 'Player' : 'Игрок') + '</th><th class="num">HI</th><th class="num">CH</th><th>' +
                    (lang === 'en' ? 'Tee' : 'ТИ') + '</th><th>' + (lang === 'en' ? 'Format' : 'Формат') + '</th><th>' +
                    (lang === 'en' ? 'Marker' : 'Маркер') + '</th></tr></thead><tbody>';
                list.sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
                list.forEach(function (entry) {
                    body += '<tr><td class="num">' + esc(entry.position || '') + '</td>' +
                        '<td>' + esc(entry.playerName || '') + '</td>' +
                        '<td class="num">' + esc(fmtHcp(entry.hi)) + '</td>' +
                        '<td class="num">' + esc(fmtHcp(entry.ch)) + '</td>' +
                        '<td>' + esc(teeName(entry.tee, lang)) + '</td>' +
                        '<td>' + esc(entry.format || '') + '</td>' +
                        '<td>' + esc(entry.markerName || '') + '</td></tr>';
                });
                body += '</tbody></table></div>';
            });
        });
        if (!entries.length) body += '<p class="muted">' + esc(lang === 'en' ? 'Tee sheet is empty' : 'Стартовый лист пуст') + '</p>';
        return printDocument(title, body, { lang: lang });
    }

    /** PDF результатов раунда (с выделением призёров). */
    function resultsHtml(opts) {
        var o = opts || {};
        var lang = o.lang === 'en' ? 'en' : 'ru';
        var rows = o.rows || [];
        var meta = [];
        if (o.tournamentName) meta.push(o.tournamentName);
        if (o.roundDate) meta.push((lang === 'en' ? 'Round: ' : 'Раунд: ') + dateRu(o.roundDate));
        var body = docHeader(o.title || (lang === 'en' ? 'Results' : 'Результаты'), meta);
        body += '<table><thead><tr><th class="num">' + (lang === 'en' ? 'Place' : 'Место') + '</th><th>' +
            (lang === 'en' ? 'Player' : 'Игрок') + '</th><th class="num">' + (lang === 'en' ? 'Score' : 'Счёт') +
            '</th><th class="num">' + (lang === 'en' ? 'Net' : 'Нетто') + '</th><th class="num">' +
            (lang === 'en' ? 'Stableford points' : 'Очки стэйблфорда') + '</th><th>' + (lang === 'en' ? 'Group' : 'Группа') + '</th></tr></thead><tbody>';
        rows.forEach(function (row) {
            var cls = isPodium(row.place) ? ' class="podium-' + intOf(row.place, 0) + '"' : '';
            body += '<tr' + cls + '><td class="num">' + esc(row.place || '') + '</td><td>' + esc(row.playerName || '') + '</td>' +
                '<td class="num">' + esc(row.gross == null ? '' : row.gross) + '</td>' +
                '<td class="num">' + esc(row.net == null ? '' : row.net) + '</td>' +
                '<td class="num">' + esc(row.points == null ? '' : row.points) + '</td>' +
                '<td>' + esc(row.groupName || '') + '</td></tr>';
        });
        body += '</tbody></table>';
        return printDocument(o.title || 'Результаты', body, { lang: lang, portrait: true });
    }

    /** PDF счёта раунда: строки «Длина / Пар / Индекс» и удары игроков. */
    function roundScoreHtml(opts) {
        var o = opts || {};
        var lang = o.lang === 'en' ? 'en' : 'ru';
        var course = o.course || defaultCourse();
        var tee = o.tee || 'wh';
        var players = o.players || [];
        var cards = o.cards || {};
        var meta = [];
        if (o.tournamentName) meta.push(o.tournamentName);
        if (o.roundDate) meta.push((lang === 'en' ? 'Round: ' : 'Раунд: ') + dateRu(o.roundDate));
        if (o.teeLabel) meta.push((lang === 'en' ? 'Tee: ' : 'ТИ: ') + o.teeLabel);
        var body = docHeader(o.title || (lang === 'en' ? 'Round score' : 'Счёт раунда'), meta);
        var head = '<tr><th>' + (lang === 'en' ? 'Player' : 'Игрок') + '</th>';
        for (var hole = 1; hole <= 18; hole++) head += '<th class="num">' + hole + '</th>';
        head += '<th class="num">' + (lang === 'en' ? 'Total' : 'Итог') + '</th></tr>';
        function row(label, values, cls) {
            var html = '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(label) + '</td>';
            values.forEach(function (value) { html += '<td class="num">' + esc(value) + '</td>'; });
            html += '</tr>';
            return html;
        }
        body += '<table><thead>' + head + '</thead><tbody>';
        var lengths = [], pars = [], indexes = [];
        for (var h = 1; h <= 18; h++) {
            lengths.push(course.dist ? course.dist(h, tee) : '');
            pars.push(course.par ? course.par(h) : 4);
            indexes.push(course.si ? course.si(h) : h);
        }
        body += row(lang === 'en' ? 'Length' : 'Длина', lengths);
        body += row(lang === 'en' ? 'Par' : 'Пар', pars);
        body += row(lang === 'en' ? 'Index' : 'Индекс', indexes);
        players.forEach(function (player) {
            var card = cards[player.id] || { holes: [] };
            var holeMap = byKey(card.holes || [], 'hole');
            var values = [];
            var total = 0, played = 0;
            for (var hh = 1; hh <= 18; hh++) {
                var cell = holeMap[hh];
                values.push(cell && cell.strokes != null ? cell.strokes : '');
                if (cell && cell.strokes != null) { total += cell.strokes; played++; }
            }
            values.push(played ? total : '');
            body += row(playerFio(player), values, 'totals');
        });
        body += '</tbody></table>';
        return printDocument(o.title || 'Счёт раунда', body, { lang: lang });
    }

    /** PDF карточки игрока (лунки, фора, очки гросс/нетто). */
    function playerCardHtml(opts) {
        var o = opts || {};
        var lang = o.lang === 'en' ? 'en' : 'ru';
        var player = o.player || {};
        var card = o.card || { holes: [], totals: {} };
        var meta = [];
        if (o.tournamentName) meta.push(o.tournamentName);
        if (o.roundDate) meta.push((lang === 'en' ? 'Round: ' : 'Раунд: ') + dateRu(o.roundDate));
        meta.push('HI: ' + fmtHcp(player.hi) + ' · CH: ' + fmtHcp(player.ch) +
            ' · ' + (lang === 'en' ? 'Course par' : 'Пар поля') + ': ' + (o.coursePar || 72));
        var body = docHeader(o.title || playerFio(player), meta);
        var head = '<tr><th>' + (lang === 'en' ? 'Hole' : 'Лунка') + '</th>';
        (card.holes || []).forEach(function (hole) { head += '<th class="num">' + esc(hole.hole) + '</th>'; });
        head += '<th class="num">' + (lang === 'en' ? 'Out' : 'Аут') + '</th><th class="num">' +
            (lang === 'en' ? 'In' : 'Ин') + '</th><th class="num">' + (lang === 'en' ? 'Total' : 'Итог') + '</th></tr>';
        function row(label, values, cls) {
            var html = '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(label) + '</td>';
            values.forEach(function (value) { html += '<td class="num">' + esc(value == null ? '' : value) + '</td>'; });
            html += '</tr>';
            return html;
        }
        var holes = card.holes || [];
        var nine = function (list, field) { return list.reduce(function (sum, hole) { return sum + (num(hole[field], 0) || 0); }, 0); };
        var playedSum = function (list, field) {
            var sum = 0, played = 0;
            list.forEach(function (hole) { if (hole.strokes != null) { sum += num(hole[field], 0) || 0; played++; } });
            return played ? sum : '';
        };
        body += '<table><thead>' + head + '</thead><tbody>';
        body += row(lang === 'en' ? 'Length' : 'Длина', holes.map(function (h) { return h.length; }).concat([nine(holes.slice(0, 9), 'length'), nine(holes.slice(9, 18), 'length'), nine(holes, 'length')]));
        body += row(lang === 'en' ? 'Par' : 'Пар', holes.map(function (h) { return h.par; }).concat([nine(holes.slice(0, 9), 'par'), nine(holes.slice(9, 18), 'par'), nine(holes, 'par')]));
        body += row(lang === 'en' ? 'Index' : 'Индекс', holes.map(function (h) { return h.index; }).concat(['', '', '']));
        body += row(lang === 'en' ? 'Fore' : 'Фора', holes.map(function (h) { return h.fore; }).concat(['', '', '']));
        body += row(lang === 'en' ? 'Strokes' : 'Удары', holes.map(function (h) { return h.strokes; }).concat([playedSum(holes.slice(0, 9), 'strokes'), playedSum(holes.slice(9, 18), 'strokes'), playedSum(holes, 'strokes')]), 'totals');
        body += row(lang === 'en' ? 'Gross points' : 'Очки гросс', holes.map(function (h) { return h.grossPoints; }).concat([playedSum(holes.slice(0, 9), 'grossPoints'), playedSum(holes.slice(9, 18), 'grossPoints'), playedSum(holes, 'grossPoints')]));
        body += row(lang === 'en' ? 'Net points' : 'Очки нетто', holes.map(function (h) { return h.netPoints; }).concat([playedSum(holes.slice(0, 9), 'netPoints'), playedSum(holes.slice(9, 18), 'netPoints'), playedSum(holes, 'netPoints')]));
        body += '</tbody></table>';
        return printDocument(o.title || playerFio(player), body, { lang: lang });
    }

    return {
        // helpers
        str: str, trim: trim, num: num, intOf: intOf, esc: esc, asMap: asMap, asArray: asArray,
        clone: clone, uniq: uniq, byKey: byKey, pad2: pad2,
        // formats
        DEFAULT_FORMATS: DEFAULT_FORMATS, defaultFormats: defaultFormats, formatId: formatId,
        formatCatalog: formatCatalog, formatLabel: formatLabel, formatScoring: formatScoring,
        scoringLabel: scoringLabel, guessScoring: guessScoring,
        // search
        normText: normText, translitRu: translitRu, latinKey: latinKey, translitEquals: translitEquals,
        searchKeys: searchKeys, playerMatches: playerMatches, searchPlayers: searchPlayers,
        // people
        splitFio: splitFio, playerFio: playerFio, playerKeyByFio: playerKeyByFio,
        normalizeGender: normalizeGender, genderLabel: genderLabel, effectiveHcp: effectiveHcp,
        // dates
        dateIso: dateIso, dateRu: dateRu, dateLong: dateLong, todayIso: todayIso,
        timeText: timeText, addMinutesToTime: addMinutesToTime, timestampFromDateTime: timestampFromDateTime,
        // handicap
        fmtHcp: fmtHcp, courseHandicap: courseHandicap, foreOnHole: foreOnHole,
        stableford: stableford, scoreAt: scoreAt,
        // card
        playerCard: playerCard, cardTotals: cardTotals, cardResult: cardResult, defaultCourse: defaultCourse,
        // entities
        newTournament: newTournament, newRound: newRound, newGroup: newGroup, newPlayer: newPlayer,
        groupRangeText: groupRangeText, groupMatchesPlayer: groupMatchesPlayer,
        // sheet
        buildSheet: buildSheet, assignMarkers: assignMarkers, validateSheet: validateSheet,
        applyEntryPatch: applyEntryPatch, recalcSheet: recalcSheet, flightLetter: flightLetter,
        // results
        buildResults: buildResults, assignPlaces: assignPlaces, placeLabel: placeLabel,
        isPodium: isPodium, applyResultOverrides: applyResultOverrides, sortRows: sortRows,
        // import / export
        parseParticipants: parseParticipants, parseDelimited: parseDelimited, csvFromRows: csvFromRows,
        HEADERS: HEADERS, headerRow: headerRow, teeName: teeName, sourceLabel: sourceLabel,
        participantsRows: participantsRows, sheetRows: sheetRows, resultsRows: resultsRows, scoreRows: scoreRows,
        participantsCounts: participantsCounts,
        // print / qr
        PRINT_CSS: PRINT_CSS, printDocument: printDocument, participantsHtml: participantsHtml,
        sheetHtml: sheetHtml, resultsHtml: resultsHtml, roundScoreHtml: roundScoreHtml,
        playerCardHtml: playerCardHtml, scoreUrl: scoreUrl, qrImageUrl: qrImageUrl
    };
});
