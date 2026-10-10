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

    // Имена при импорте часто приходят без отдельного столбца «Пол».
    // Используем только однозначные распространённые имена; неизвестные
    // оставляем без догадки, чтобы не определять пол по фамилии.
    var FEMALE_GIVEN_NAMES = (function () {
        var names = ('алла алина алиса александра анастасия анна арина валентина валерия варвара вера вероника виктория виолетта галина дарья диана ева екатерина елена елизавета инна ирина карина ксения лариса лидия любовь людмила маргарита марина мария милана надежда наталья наталия ника олеся ольга полина раиса светлана софия софья тамара таисия татьяна юлия яна агата ангелина').split(' ');
        var latin = ('alla alina alice alexandra alexsandra anastasia anna annie arina valentina valeria varvara vera veronica victoria violetta galina darya daria diana eva ekaterina elena elizabeth elizaveta inna irina karina ksenia xenia larisa lidia lyubov lyudmila margaret margarita marina maria mariya milana nadia nadezhda natalia nataliya nika olesya olga polina svetlana sofia sophia tamara taisiya tatiana tanya julia yulia yuliya yana agata angelina').split(' ');
        var set = {};
        names.concat(latin).forEach(function (name) { set[name] = true; });
        return set;
    })();
    var MALE_GIVEN_NAMES = (function () {
        var names = ('александр алексей анатолий андрей антон артем артём артур борис валентин валерий василий виктор владимир владислав вадим вадим виталий вячеслав георгий глеб григорий данила даниил денис дмитрий евгений игорь илья иван кирилл константин лев леонид максим марк матвей михаил никита николай олег павел петр пётр роман руслан сергей семен семён станислав степан тимур юрий ярослав федор фёдор').split(' ');
        var latin = ('alexander alex alexey anatoly andrey andrei andrew anton artem artyom arthur boris valentin valery vasily victor viktor vladimir vladislav vadim vitaly vyacheslav george georgy gleb gregory danila daniel denis dmitry evgeny eugene igor ilya ivan kirill cyril konstantin lev leonid leonard maxim max mark matvey michael mikhail nikita nicholas nikolay oleg paul pavel peter petr roman ruslan sergey sergei semen stanislav stepan timur yuri yuriy yaroslav fedor').split(' ');
        var set = {};
        names.concat(latin).forEach(function (name) { set[name] = true; });
        return set;
    })();

    function inferGenderFromName(value) {
        var raw = trim(value).toLowerCase().replace(/ё/g, 'е');
        if (!raw) return '';
        var words = raw.replace(/[^a-zа-я0-9 -]/gi, ' ').split(/\s+/).filter(Boolean);
        if (!words.length) return '';
        // Если передано полное ФИО, используем разобранное имя, а не фамилию.
        var parts = words.length > 1 ? splitFio(raw) : { firstName: words[0] };
        var candidate = trim(parts.firstName || words[0]).toLowerCase().replace(/ё/g, 'е');
        candidate = candidate.replace(/[-.].*$/, '');
        if (FEMALE_GIVEN_NAMES[candidate]) return 'women';
        if (MALE_GIVEN_NAMES[candidate]) return 'men';
        return '';
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
            club: trim(src.club) || 'Пестово',
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

    /**
     * Автораспределение участников по диапазонам гандикапа отдельно по полу.
     * Группы содержат примерно одинаковое число игроков, отсортированы по HCP
     * от низкого к высокому. Возвращает определения групп для ручной записи.
     */
    function distributePlayers(players, groupsPerGender, options) {
        var opts = options || {};
        var groupCount = Math.max(1, Math.min(10, intOf(groupsPerGender, 3) || 3));
        var result = [];
        var byGender = { men: [], women: [], other: [] };
        (players || []).forEach(function (player, index) {
            if (!player) return;
            var copy = clone(player) || {};
            if (!copy.id) copy.id = 'player_' + index;
            var gender = normalizeGender(copy.gender) || inferGenderFromName(copy.firstName || playerFio(copy));
            if (!gender) gender = 'men';
            copy.gender = gender;
            byGender[gender === 'men' || gender === 'women' ? gender : 'other'].push(copy);
        });
        ['men', 'women', 'other'].forEach(function (gender) {
            var people = byGender[gender];
            if (!people.length) return;
            people.sort(function (a, b) {
                var ha = num(effectiveHcp(a));
                var hb = num(effectiveHcp(b));
                if (ha == null) ha = 999;
                if (hb == null) hb = 999;
                if (ha !== hb) return ha - hb;
                return playerFio(a).localeCompare(playerFio(b), 'ru');
            });
            var count = Math.min(groupCount, people.length);
            var buckets = [];
            for (var i = 0; i < count; i++) buckets.push([]);
            people.forEach(function (player, index) {
                var bucketIndex = Math.min(count - 1, Math.floor(index * count / people.length));
                buckets[bucketIndex].push(player);
            });
            buckets.forEach(function (members, index) {
                var hcpValues = members.map(function (player) { return num(effectiveHcp(player)); }).filter(function (value) { return value != null; });
                var genderLabelRu = gender === 'men' ? 'Мужчины' : gender === 'women' ? 'Женщины' : 'Участники';
                var genderLabelEn = gender === 'men' ? 'Men' : gender === 'women' ? 'Ladies' : 'Players';
                var memberMap = {};
                members.forEach(function (player) { memberMap[player.id] = playerFio(player) || true; });
                result.push({
                    id: 'auto_' + gender + '_' + (index + 1),
                    name: trim(opts.namePrefix) ? trim(opts.namePrefix) + ' ' + (index + 1) : genderLabelRu + ' ' + (index + 1),
                    gender: gender === 'other' ? 'all' : gender,
                    hcpFrom: hcpValues.length ? Math.min.apply(Math, hcpValues) : '',
                    hcpTo: hcpValues.length ? Math.max.apply(Math, hcpValues) : '',
                    tee: gender === 'women' ? (opts.womenTee || 'rd') : (opts.menTee || 'wh'),
                    format: trim(opts.format),
                    members: memberMap,
                    autoDistribution: true,
                    distributionGender: gender,
                    distributionIndex: index + 1,
                    playerCount: members.length,
                    genderLabel: genderLabelEn
                });
            });
        });
        return result;
    }

    function newPlayer(input) {
        var src = input || {};
        var fio = playerFio(src);
        var parts = splitFio(fio);
        var firstName = trim(src.firstName) || parts.firstName;
        var gender = normalizeGender(src.gender) || inferGenderFromName(firstName || fio) || 'men';
        return {
            id: src.id || '',
            fio: fio,
            name: fio,
            firstName: firstName,
            lastName: trim(src.lastName) || parts.lastName,
            middleName: trim(src.middleName) || parts.middleName,
            hi: src.hi != null ? num(src.hi) : (src.handicap != null ? num(src.handicap) : null),
            ch: src.ch != null ? num(src.ch) : null,
            gender: gender,
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
    /** Минимум игроков в стартовой группе (флайте), если лист это позволяет. */
    var MIN_START_GROUP = 3;

    /**
     * Сбалансированная разбивка n игроков на стартовые группы: групп
     * ceil(n / groupSize), но так, чтобы в каждой было не меньше minSize.
     * Размеры отличаются не больше чем на 1: 9 → 3+3+3, 10 → 4+3+3,
     * 6 → 3+3, 7 → 4+3. Если n нельзя разложить в пределах
     * [minSize, groupSize] (1, 2, 5 при группах по 4), минимум важнее:
     * 5 → одна группа из 5.
     */
    function startGroupSizes(n, groupSize, minSize) {
        var total = Math.max(0, intOf(n, 0) || 0);
        if (!total) return [];
        var size = Math.max(1, intOf(groupSize, 4) || 4);
        var min = Math.max(1, Math.min(size, intOf(minSize, MIN_START_GROUP) || MIN_START_GROUP));
        var k = Math.ceil(total / size);
        while (k > 1 && Math.floor(total / k) < min) k--;
        var base = Math.floor(total / k);
        var extra = total % k;
        var out = [];
        for (var i = 0; i < k; i++) out.push(base + (i < extra ? 1 : 0));
        return out;
    }

    /** Раскладывается ли n игроков в группы размером [minSize, groupSize]. */
    function startGroupSizesOk(n, groupSize, minSize) {
        var sizes = startGroupSizes(n, groupSize, minSize);
        var size = Math.max(1, intOf(groupSize, 4) || 4);
        var min = Math.max(1, Math.min(size, intOf(minSize, MIN_START_GROUP) || MIN_START_GROUP));
        return sizes.every(function (value) { return value >= min && value <= size; });
    }

    /**
     * Генерация стартового листа для последовательного и шотган-старта.
     * В режиме shotgun группы равномерно назначаются на 18 лунок; повторная
     * волна получает время +интервал и подписи 1А/1Б, 2А/2Б и т. д.
     */
    function buildSheet(options) {
        var opts = options || {};
        var players = (opts.players || []).map(function (p, index) {
            var copy = clone(p) || {};
            copy._order = index;
            copy.id = copy.id || ('player_' + index);
            return copy;
        });
        var definitions = opts.groups || [];
        var groupSize = Math.max(1, Math.min(4, intOf(opts.groupSize, 4) || 4));
        var interval = Math.max(1, intOf(opts.startInterval, 8) || 8);
        var firstTime = timeText(opts.firstTeeTime, '09:00');
        var defaultTee = trim(opts.tee) || 'wh';
        var defaultFormat = trim(opts.format) || '';
        var startMode = opts.startMode === 'shotgun' ? 'shotgun' : 'sequential';
        var startHole = Math.max(1, Math.min(18, intOf(opts.startHole, 1) || 1));
        var used = {};
        var groups = [];

        function takeGroupMembers(definition) {
            var ids = asMap(definition && definition.members);
            var memberIds = Object.keys(ids).filter(function (id) { return ids[id] !== false; });
            var hasRange = definition && (definition.hcpFrom != null && definition.hcpFrom !== '' ||
                definition.hcpTo != null && definition.hcpTo !== '' ||
                (definition.gender && definition.gender !== 'all'));
            return players.filter(function (player) {
                if (used[player.id]) return false;
                if (memberIds.length) return memberIds.indexOf(player.id) !== -1;
                return !!hasRange && groupMatchesPlayer(definition, player);
            });
        }

        // Сегменты — игроки одной зачётной группы (или «остальные»). Каждый
        // сегмент режется на стартовые группы сбалансированно: не меньше
        // MIN_START_GROUP (3) игроков, если только сам лист не меньше. Раньше
        // хвост резался «как получится» (9 игроков → 4+4+1, 10 → 4+4+2), и во
        // флайте оказывалось 1–2 человека.
        var minSize = Math.min(MIN_START_GROUP, groupSize);
        var segments = [];
        definitions.forEach(function (definition) {
            var members = takeGroupMembers(definition);
            if (!members.length) return;
            members.forEach(function (player) { used[player.id] = true; player._def = definition; });
            segments.push({ definition: definition, players: members });
        });

        // Остальные игроки: по гандикапу, с сохранением размера стартовой группы.
        var rest = players.filter(function (player) { return !used[player.id]; });
        rest.sort(function (a, b) {
            var genderOrder = { men: 0, women: 1 };
            var ga = genderOrder[normalizeGender(a.gender)] == null ? 2 : genderOrder[normalizeGender(a.gender)];
            var gb = genderOrder[normalizeGender(b.gender)] == null ? 2 : genderOrder[normalizeGender(b.gender)];
            return ga - gb || comparableHcp(a) - comparableHcp(b) || playerFio(a).localeCompare(playerFio(b), 'ru');
        });
        if (rest.length) {
            rest.forEach(function (player) { player._def = null; });
            segments.push({ definition: null, players: rest });
        }

        // Маленькую зачётную группу (1–2 игрока, или 5 при группах по 4)
        // нельзя разбить без «двоек» — сливаем её с соседней: игроки
        // сохраняют свою зачётную группу (groupId в строке листа), но
        // стартуют вместе с соседями.
        var merged = true;
        while (merged && segments.length > 1) {
            merged = false;
            for (var si = 0; si < segments.length; si++) {
                if (startGroupSizesOk(segments[si].players.length, groupSize, minSize)) continue;
                var target = si + 1 < segments.length ? si + 1 : si - 1;
                var first = Math.min(si, target);
                var second = Math.max(si, target);
                var big = segments[first].players.length >= segments[second].players.length ? segments[first] : segments[second];
                segments.splice(first, 2, {
                    definition: big.definition,
                    players: segments[first].players.concat(segments[second].players)
                });
                merged = true;
                break;
            }
        }

        segments.forEach(function (segment) {
            var offset = 0;
            startGroupSizes(segment.players.length, groupSize, minSize).forEach(function (size) {
                var chunk = segment.players.slice(offset, offset + size);
                offset += size;
                var definition = segment.definition;
                groups.push({
                    id: definition ? (definition.id || '') : '',
                    name: definition ? (definition.name || '') : '',
                    definition: definition,
                    players: chunk
                });
            });
        });

        var assignedHoles = groups.map(function (_, index) {
            return startMode === 'shotgun' ? ((startHole - 1 + (index % 18)) % 18) + 1 : startHole;
        });
        var waveByGroup = [];
        var waveCountByHole = {};
        assignedHoles.forEach(function (hole, index) {
            var wave = waveCountByHole[hole] || 0;
            waveByGroup[index] = wave;
            waveCountByHole[hole] = wave + 1;
        });

        var entries = [];
        var flights = [];
        groups.forEach(function (group, groupIndex) {
            var hole = assignedHoles[groupIndex];
            var wave = waveByGroup[groupIndex];
            var flightNumber = ((hole - startHole + 18) % 18) + 1;
            var flightKey = String(flightNumber);
            if (startMode === 'shotgun' && waveCountByHole[hole] > 1) flightKey += waveLetter(wave);
            if (flights.indexOf(flightKey) === -1) flights.push(flightKey);
            var startOffset = startMode === 'shotgun' ? wave * interval : groupIndex * interval;
            var startTime = addMinutesToTime(firstTime, startOffset);
            var groupTee = trim(group.definition && group.definition.tee) || trim(group.players[0] && group.players[0].tee) || defaultTee;
            var groupFormat = trim(group.definition && group.definition.format) || defaultFormat;
            var markers = assignMarkers(group.players, opts.markMode);
            var startGroupId = 'tee_' + (groupIndex + 1);
            group.players.forEach(function (player, position) {
                var markerId = markers[player.id] || '';
                // Зачётная группа — своя у игрока (после слияния маленьких
                // групп в одной стартовой группе бывают игроки разных зачётов).
                var ownDef = player._def !== undefined ? player._def : group.definition;
                var ownFormat = trim(ownDef && ownDef.format) || groupFormat;
                entries.push({
                    playerId: player.id,
                    playerName: playerFio(player),
                    firstName: player.firstName || '',
                    lastName: player.lastName || '',
                    middleName: player.middleName || '',
                    gender: normalizeGender(player.gender) || inferGenderFromName(player.firstName || playerFio(player)) || '',
                    hi: player.hi != null ? player.hi : (player.handicap != null ? player.handicap : ''),
                    ch: player.ch != null ? player.ch : '',
                    groupId: ownDef ? (ownDef.id || '') : '',
                    groupName: ownDef ? (ownDef.name || '') : '',
                    startGroupId: startGroupId,
                    markerPlayerId: markerId,
                    tee: trim(player.tee) || groupTee,
                    // Если у группы выбран формат, он закреплён за всеми её игроками.
                    format: ownFormat || trim(player.format) || defaultFormat,
                    flight: flightKey,
                    startHole: hole,
                    startWave: wave,
                    startTime: startTime,
                    position: position + 1,
                    order: entries.length + 1,
                    qr: ''
                });
            });
            group.startGroupId = startGroupId;
            group.startHole = hole;
            group.startWave = wave;
            group.startTime = startTime;
            group.flight = flightKey;
            group.tee = groupTee;
            group.format = groupFormat || defaultFormat;
            group.markerPlayerId = markers[(group.players[0] || {}).id] || '';
        });

        return {
            entries: entries,
            groups: groups,
            flights: flights,
            options: {
                groupSize: groupSize, startInterval: interval, firstTeeTime: firstTime,
                tee: defaultTee, format: defaultFormat, markMode: opts.markMode || 'group',
                startMode: startMode, startHole: startHole
            }
        };
    }

    function waveLetter(index) {
        var letters = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
        var value = Math.max(0, intOf(index, 0) || 0);
        if (value < letters.length) return letters.charAt(value);
        return String(value + 1);
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
            var groupA = str(a.startGroupId || [a.groupId, a.flight, a.startHole, a.startTime].join('|'));
            var groupB = str(b.startGroupId || [b.groupId, b.flight, b.startHole, b.startTime].join('|'));
            if (groupA !== groupB) return groupA < groupB ? -1 : 1;
            return (a.order || 0) - (b.order || 0);
        });
        var counters = {};
        sorted.forEach(function (entry) {
            var key = str(entry.startGroupId || [entry.groupId, entry.flight, entry.startHole, entry.startTime].join('|'));
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
    // Файлы от организаторов приходят в любом виде, поэтому разбор идёт по
    // всем строкам, столбцам и ячейкам:
    //   • строку заголовков ищем среди первых строк — над ней бывают
    //     название турнира, дата, поле и прочие шапки;
    //   • колонки ФИО / фамилии / имени / гандикапа / пола / группы
    //     определяем по заголовкам (RU и EN: «ФИО», «Фамилия», «ИГ», «HI»);
    //   • чего в заголовках нет — доопределяем по содержимому столбцов:
    //     и гандикап, и имена находятся в любой колонке;
    //   • в каждой строке значения ищем по всем ячейкам, служебные строки
    //     (повтор шапки, «Итого», «№») пропускаем.
    var IMPORT_ALIASES = {
        fio: ['фио', 'ф.и.о', 'фио игрока', 'фио участника', 'фамилия и имя', 'имя и фамилия', 'имя фамилия',
            'игрок', 'участник', 'гольфист', 'player', 'name', 'full name', 'last name, first name'],
        lastName: ['фамилия', 'last', 'lastname', 'surname', 'family', 'family name', 'last name'],
        firstName: ['имя', 'first', 'firstname', 'given', 'given name', 'first name'],
        middleName: ['отчество', 'middle', 'middlename', 'patronymic', 'middle name'],
        hi: ['hi', 'h.i', 'иг', 'иг.', 'гандикап', 'handicap', 'handicap index', 'точный гандикап',
            'точный индекс', 'индекс', 'index'],
        ch: ['ch', 'игровой', 'игровой гандикап', 'игровой индекс', 'course handicap', 'полевой гандикап'],
        gender: ['пол', 'gender', 'sex', 'муж/жен', 'м/ж'],
        tee: ['ти', 'tee', 'tees', 'цвет', 'цвет ти'],
        group: ['группа', 'group', 'зачёт', 'зачет', 'дивизион', 'division', 'флайт', 'flight'],
        format: ['формат', 'format'],
        club: ['клуб', 'club', 'команда', 'team'],
        no: ['№', '№ п/п', 'номер', 'п/п', 'п.п', 'n', 'no', 'nr', 'num', 'number']
    };

    // Нормализованные алиасы считаем один раз: разбор файла вызывает
    // сопоставление заголовков для каждой ячейки и каждой колонки.
    var IMPORT_ALIAS_INDEX = (function () {
        var index = {};
        Object.keys(IMPORT_ALIASES).forEach(function (kind) {
            index[kind] = IMPORT_ALIASES[kind].map(normHeaderText).filter(Boolean);
        });
        return index;
    })();

    var NAME_KINDS = ['fio', 'lastName', 'firstName', 'middleName'];
    // Порядок разбора заголовка: сначала «узкие» колонки, составные («ФИО») — последними.
    var IMPORT_EXACT_ORDER = ['lastName', 'firstName', 'middleName', 'ch', 'hi', 'no', 'gender', 'tee', 'group', 'format', 'club', 'fio'];
    var IMPORT_SUBSTRING_ORDER = ['lastName', 'firstName', 'middleName', 'ch', 'hi', 'gender', 'tee', 'group', 'format', 'club', 'fio'];
    // Служебные слова: строка с таким «именем» — не участник (шапка, «Итого»).
    var IMPORT_JUNK_WORDS = ['итого', 'итог', 'всего', 'total', 'sum', 'продолжение', 'примечание', 'примечания',
        'подпись', 'судья', 'главный судья', 'секретарь', 'председатель', 'дата', 'время', 'место',
        'фио', 'фамилия', 'имя', 'отчество', 'игрок', 'игроки', 'участник', 'участники', 'гольфист', 'гандикап',
        'пол', 'группа', 'клуб', 'команда', 'ти', 'tee', 'номер', 'п/п', 'п.п', 'n', 'no', 'name', 'player',
        'players', 'handicap', 'surname', 'firstname', 'lastname', 'first name', 'last name', 'club', 'team',
        'group', 'gender', 'division', 'флайт', 'зачёт', 'формат', 'format'];
    var IMPORT_JUNK_SET = (function () {
        var set = {};
        IMPORT_JUNK_WORDS.forEach(function (word) { set[normText(word)] = true; });
        return set;
    })();
    // Колонок в файле может быть больше, чем колонок с данными: шапку ищем
    // только в начале листа, чтобы не спутать её со строкой данных.
    var IMPORT_HEADER_SCAN = 20;

    function normHeaderText(value) {
        return normText(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    /**
     * Совпадение заголовка с алиасом. Короткие алиасы («ти», «ch», «иг»)
     * сравниваем только целиком, иначе «Полина» станет колонкой «Пол».
     */
    function aliasHit(kind, text, mode) {
        var list = IMPORT_ALIAS_INDEX[kind] || [];
        for (var i = 0; i < list.length; i++) {
            var alias = list[i];
            if (text === alias) return true;
            if (mode === 'substring' && alias.length >= 4 && text.indexOf(alias) !== -1) return true;
        }
        return false;
    }

    /** Тип колонки по заголовку: fio | lastName | firstName | hi | ch | … | ''. */
    function headerKind(header) {
        var raw = trim(header).toLowerCase();
        if (!raw) return '';
        if (/^№/.test(raw) || /^(n|no|nr|num|number)\.?$/.test(raw)) return 'no';
        var text = normHeaderText(raw);
        if (!text) return '';
        var i, kind, tokens;
        for (i = 0; i < IMPORT_EXACT_ORDER.length; i++) {
            if (aliasHit(IMPORT_EXACT_ORDER[i], text, 'exact')) return IMPORT_EXACT_ORDER[i];
        }
        tokens = text.split(' ');
        for (i = 0; i < IMPORT_EXACT_ORDER.length; i++) {
            kind = IMPORT_EXACT_ORDER[i];
            for (var t = 0; t < tokens.length; t++) {
                if (aliasHit(kind, tokens[t], 'exact')) return kind;
            }
        }
        for (i = 0; i < IMPORT_SUBSTRING_ORDER.length; i++) {
            if (aliasHit(IMPORT_SUBSTRING_ORDER[i], text, 'substring')) return IMPORT_SUBSTRING_ORDER[i];
        }
        return '';
    }

    /**
     * Число-гандикап из ячейки: «12,4», «+2.5», «HI 12.4», «ИГ: 8», «10 (HI)».
     * Плюсовой гандикап в базе хранится отрицательным (как в АГР).
     */
    function hcpNumber(value) {
        var text = trim(value).replace(/\u00a0/g, ' ').replace(/[–—−]/g, '-');
        if (!text) return null;
        var plain = text.replace(/\s+/g, '');
        if (/^[+-]?\d+(?:[.,]\d+)?$/.test(plain)) {
            var direct = num(plain.replace('+', ''));
            if (direct == null) return null;
            return plain.charAt(0) === '+' ? -Math.abs(direct) : direct;
        }
        var match = text.replace(/,/g, '.').match(/[+-]?\d{1,3}(?:\.\d+)?/);
        if (!match) return null;
        var parsed = parseFloat(match[0]);
        if (!isFinite(parsed)) return null;
        return match[0].charAt(0) === '+' ? -Math.abs(parsed) : parsed;
    }

    /** Код ТИ по названию/цвету: «Белый» → wh, «Red» → rd. */
    function teeCode(value) {
        var text = normText(value);
        if (!text) return '';
        var map = {
            bk: 'bk', black: 'bk', 'черный': 'bk', 'черн': 'bk', 'черная': 'bk',
            bl: 'bl', blue: 'bl', 'синий': 'bl', 'син': 'bl',
            wh: 'wh', white: 'wh', 'белый': 'wh', 'бел': 'wh', 'белая': 'wh',
            rd: 'rd', red: 'rd', 'красный': 'rd', 'красн': 'rd',
            gd: 'gd', gold: 'gd', 'золотой': 'gd', 'золот': 'gd',
            yl: 'yl', yellow: 'yl', 'желтый': 'yl', 'желт': 'yl'
        };
        return map[text] || '';
    }

    /** Похоже ли значение на ФИО (а не на число, дату или служебное слово). */
    function looksLikeName(value) {
        var text = trim(value);
        if (!text) return false;
        if (hcpNumber(text) != null && num(text) != null) return false;
        if (!/[a-zа-яё]/i.test(text)) return false;
        if (/[./-]/.test(text) && dateIso(text)) return false;   // даты — не имена
        var kind = headerKind(text);
        if (kind && NAME_KINDS.indexOf(kind) !== -1) return false;
        var words = normText(text).split(' ').filter(Boolean);
        if (!words.length || words.length > 4) return false;
        var letters = 0;
        words.forEach(function (word) { letters += word.replace(/[^a-zа-я]/g, '').length; });
        if (letters < 2) return false;
        if (IMPORT_JUNK_SET[normText(text)]) return false;
        return true;
    }

    /** Служебная строка: «Итого», повтор шапки, строка из одних цифр. */
    function isJunkName(value) {
        var text = normText(value);
        if (!text) return true;
        if (IMPORT_JUNK_SET[text]) return true;
        if (!/[a-zа-я]/.test(text)) return true;
        if (/^\d+([.,]\d+)?$/.test(text)) return true;
        var kind = headerKind(value);
        if (kind && NAME_KINDS.indexOf(kind) !== -1) return true;
        return false;
    }

    /**
     * Служебная строка целиком: «Итого», повтор шапки, одни номера/даты.
     * Такие строки пропускаем молча — это не потерянные участники.
     */
    function isServiceRow(cells, mapping) {
        var kinds = {};
        Object.keys(mapping || {}).forEach(function (kind) { kinds[mapping[kind]] = kind; });
        var filled = 0, service = 0;
        (cells || []).forEach(function (cell, column) {
            var text = trim(cell);
            if (!text) return;
            filled++;
            if (/[./-]/.test(text) && dateIso(text)) { service++; return; }   // «16.05.2026»
            // Число в колонке данных (гандикап, CH) — это данные, а не служебная
            // строка: строку с пустым именем и гандикапом нужно показать в issues.
            if (num(text) != null) {
                if (kinds[column] !== undefined && kinds[column] !== 'no') return;
                service++;
                return;
            }
            if (isJunkName(text) || normalizeGender(text) || teeCode(text)) { service++; return; }
        });
        return filled > 0 && service === filled;
    }

    /** Намёк на фамилию (RU и латиница) — по нему выбираем колонку фамилии. */
    function surnameHint(value) {
        var word = trim(value);
        if (!word) return false;
        if (/(ов|ева|ова|ев|ин|ына|ина|ын|ский|цкий|ская|цкая|енко|ук|юк|ко)$/i.test(word)) return true;
        var latin = translitRu(word).replace(/[^a-z]/g, '');
        return /(ov|ova|ev|eva|in|ina|yn|yna|sky|skaya|tsky|tskaya|enko|uk|yuk|ko)$/.test(latin);
    }

    function columnProfile(rows, column) {
        var stats = { filled: 0, numeric: 0, hcp: 0, names: 0, words: 0, surnames: 0, gender: 0, tee: 0, decimals: 0 };
        (rows || []).forEach(function (row) {
            var cell = trim((row || [])[column]);
            if (!cell) return;
            stats.filled++;
            var direct = num(cell);
            var hcp = hcpNumber(cell);
            if (direct != null || hcp != null) stats.numeric++;
            if (hcp != null && hcp >= -10 && hcp <= 54) {
                stats.hcp++;
                if (/[.,]\d/.test(cell) || /^\s*\+/.test(cell)) stats.decimals++;
            }
            if (looksLikeName(cell)) {
                stats.names++;
                var words = normText(cell).split(' ').filter(Boolean);
                stats.words += words.length;
                if (words.length === 1 && surnameHint(words[0])) stats.surnames++;
            }
            if (normalizeGender(cell)) stats.gender++;
            if (teeCode(cell)) stats.tee++;
        });
        return stats;
    }

    /** Колонка «№ 1, 2, 3…» — это нумерация, а не гандикап. */
    function isIndexColumn(rows, column) {
        var filled = 0, sequenced = 0;
        (rows || []).forEach(function (row) {
            var cell = trim((row || [])[column]);
            if (!cell) return;
            filled++;
            var value = num(cell);
            if (value == null) return;
            if (value % 1 === 0 && Math.abs(value - filled) < 1e-9) sequenced++;
        });
        return filled >= 4 && sequenced / filled >= 0.8;
    }

    /**
     * Определение колонок по содержимому. Нужно там, где заголовков нет или
     * они не покрывают поле: имена и гандикап находятся в любом столбце.
     */
    function inferColumns(rows, mapping) {
        var map = mapping || {};
        var width = 0;
        (rows || []).forEach(function (row) { width = Math.max(width, (row || []).length); });
        var profiles = [];
        for (var column = 0; column < width; column++) profiles.push(columnProfile(rows, column));
        var result = {
            names: [], fio: null, lastName: null, firstName: null, middleName: null,
            hi: null, gender: null, tee: null, profiles: profiles
        };
        var hiCandidates = [];
        profiles.forEach(function (stats, column) {
            var filled = stats.filled || 1;
            if (map.no === column) return;
            // Имена могут стоять не только под заголовком «ФИО»: встречается
            // служебная шапка, а сами значения — в соседней/иной колонке.
            // Поэтому распознаём имя по содержимому даже при наличии заголовка.
            if (stats.names >= 2 && stats.names / filled >= 0.6 && stats.numeric / filled < 0.5) {
                result.names.push(column);
            }
            if (map.hi == null && stats.numeric >= 2 && stats.numeric / filled >= 0.6 &&
                stats.hcp / filled >= 0.6 && !isIndexColumn(rows, column)) {
                hiCandidates.push(column);
            }
            if (map.gender == null && result.gender == null && stats.gender >= 2 && stats.gender / filled >= 0.6) {
                result.gender = column;
            }
            if (map.tee == null && result.tee == null && stats.tee >= 2 && stats.tee / filled >= 0.6) {
                result.tee = column;
            }
        });
        if (hiCandidates.length) {
            // Гандикап — колонка с дробными значениями (или «+»), если такая есть.
            var best = hiCandidates.slice().sort(function (a, b) {
                if (profiles[b].decimals !== profiles[a].decimals) return profiles[b].decimals - profiles[a].decimals;
                return a - b;
            })[0];
            result.hi = best;
        }
        var nameCols = result.names.slice();
        if (nameCols.length) {
            var wordiness = function (column) {
                var stats = profiles[column];
                return stats && stats.names ? stats.words / stats.names : 0;
            };
            var surnameRatio = function (column) {
                var stats = profiles[column];
                return stats && stats.names ? stats.surnames / stats.names : 0;
            };
            var primary = nameCols.slice().sort(function (a, b) {
                if (Math.abs(wordiness(a) - wordiness(b)) > 0.2) return wordiness(b) - wordiness(a);
                var ratioA = profiles[a].names / (profiles[a].filled || 1);
                var ratioB = profiles[b].names / (profiles[b].filled || 1);
                if (Math.abs(ratioA - ratioB) > 0.05) return ratioB - ratioA;
                return a - b;
            })[0];
            if (wordiness(primary) >= 1.8 || nameCols.length === 1) {
                // Колонка с полным ФИО; остальные «имена» — скорее клуб/команда.
                result.fio = primary;
                result.names = [primary];
            } else {
                var ordered = nameCols.slice(0, 3);
                var bySurname = ordered.slice().sort(function (a, b) { return surnameRatio(b) - surnameRatio(a); });
                if (bySurname.length > 1 && surnameRatio(bySurname[0]) - surnameRatio(bySurname[1]) > 0.15) {
                    result.lastName = bySurname[0];
                    ordered = ordered.filter(function (column) { return column !== bySurname[0]; });
                } else {
                    result.lastName = ordered[0];
                    ordered = ordered.slice(1);
                }
                result.firstName = ordered.length ? ordered[0] : null;
                result.middleName = ordered.length > 1 ? ordered[1] : null;
            }
        }
        return result;
    }

    /** Итоговое ФИО: из колонки «ФИО» или собранное из фамилии, имени, отчества. */
    function importFio(parts) {
        var p = parts || {};
        var fio = trim(p.fio);
        var composed = trim([p.last, p.first, p.middle].filter(Boolean).join(' '));
        if (!fio) return composed;
        if (!composed) return fio;
        var fioWords = normText(fio);
        var composedWords = normText(composed);
        if (fioWords.indexOf(composedWords) !== -1) return fio;
        if (composedWords.indexOf(fioWords) !== -1) return composed;
        return composedWords.split(' ').length >= fioWords.split(' ').length ? composed : fio;
    }

    /** Имя строки по колонкам, определённым по содержимому (когда шапки нет). */
    function nameFromInferred(cells, inferred, used) {
        if (!inferred) return null;
        var roles = [];
        if (inferred.fio != null) roles.push({ column: inferred.fio, role: 'fio' });
        if (inferred.lastName != null) roles.push({ column: inferred.lastName, role: 'last' });
        if (inferred.firstName != null) roles.push({ column: inferred.firstName, role: 'first' });
        if (inferred.middleName != null) roles.push({ column: inferred.middleName, role: 'middle' });
        var parts = { fio: '', last: '', first: '', middle: '' };
        var found = false;
        roles.forEach(function (item) {
            if (used[item.column]) return;
            var value = trim(cells[item.column]);
            if (!looksLikeName(value)) return;
            parts[item.role] = parts[item.role] || value;
            used[item.column] = true;
            found = true;
        });
        return found ? parts : null;
    }

    /** Гандикап из любой ячейки строки (когда колонка не найдена по шапке). */
    function hcpFromRow(cells, used) {
        var candidates = [];
        (cells || []).forEach(function (cell, column) {
            if (used[column]) return;
            var text = trim(cell);
            var value = hcpNumber(text);
            if (value == null || value < -10 || value > 54) return;
            candidates.push({ column: column, value: value, clean: !/[a-zа-яё]/i.test(text) });
        });
        if (!candidates.length) return null;
        var clean = candidates.filter(function (item) { return item.clean; });
        if (clean.length === 1) return clean[0].value;
        if (clean.length > 1) {
            // Несколько чисел в строке: гандикап — дробное или с «+».
            var signed = clean.filter(function (item) {
                var text = trim(cells[item.column]);
                return /[.,]\d/.test(text) || /^\s*\+/.test(text);
            });
            return signed.length === 1 ? signed[0].value : null;
        }
        // Число подписано словами: «HI 12.4», «ИГ: 8».
        return candidates.length === 1 ? candidates[0].value : null;
    }

    function genderFromRow(cells, used) {
        for (var i = 0; i < (cells || []).length; i++) {
            if (used[i]) continue;
            var gender = normalizeGender(cells[i]);
            if (gender) return gender;
        }
        return '';
    }

    function teeFromRow(cells, used) {
        for (var i = 0; i < (cells || []).length; i++) {
            if (used[i]) continue;
            var code = teeCode(cells[i]);
            if (code) return code;
        }
        return '';
    }

    /**
     * Участник из строки таблицы: значения берём из колонок шапки, затем из
     * колонок, определённых по содержимому, затем — перебором всех ячеек.
     * Возвращает { skip, code, message, player }.
     */
    function playerFromRow(cells, mapping, inferred) {
        var map = mapping || {};
        var used = {};
        var at = {};
        Object.keys(map).forEach(function (kind) {
            var column = map[kind];
            if (column == null) return;
            used[column] = true;
            at[kind] = trim(cells[column]);
        });

        var parts = { fio: at.fio || '', last: at.lastName || '', first: at.firstName || '', middle: at.middleName || '' };
        var fio = importFio(parts);
        if (!fio) {
            var guessed = nameFromInferred(cells, inferred, used);
            if (guessed) {
                parts = guessed;
                fio = importFio(guessed);
            }
        }
        if (!fio) {
            if (isServiceRow(cells, map)) return { skip: true, code: 'service-row', message: '' };
            return { skip: true, code: 'empty-name', message: 'Пустое ФИО — строка пропущена' };
        }
        if (isJunkName(fio)) {
            return { skip: true, code: 'service-row', message: '' };
        }
        var split = splitFio(fio);

        var hi = hcpNumber(at.hi);
        if (hi == null && inferred && inferred.hi != null && !used[inferred.hi]) {
            hi = hcpNumber(cells[inferred.hi]);
            if (hi != null) used[inferred.hi] = true;
        }
        if (hi == null) hi = hcpFromRow(cells, used);

        var gender = normalizeGender(at.gender);
        if (!gender && inferred && inferred.gender != null && !used[inferred.gender]) {
            gender = normalizeGender(cells[inferred.gender]);
        }
        if (!gender) gender = genderFromRow(cells, used);
        if (!gender) gender = inferGenderFromName(parts.first || split.firstName || fio);

        var tee = teeCode(at.tee) || trim(at.tee);
        if (!tee && inferred && inferred.tee != null && !used[inferred.tee]) tee = teeCode(cells[inferred.tee]);
        if (!tee) tee = teeFromRow(cells, used);

        var player = newPlayer({
            fio: fio,
            lastName: parts.last || split.lastName,
            firstName: parts.first || split.firstName,
            middleName: parts.middle || split.middleName,
            hi: hi,
            ch: hcpNumber(at.ch),
            gender: gender,
            tee: tee,
            groupId: '',
            format: at.format,
            club: at.club,
            source: 'excel'
        });
        player.groupName = at.group || '';
        var badHcp = at.hi && hi == null ? at.hi : '';
        return { skip: false, player: player, badHcp: badHcp };
    }

    /** Оценка строки как шапки таблицы: сколько колонок узнали. */
    function headerRowInfo(row) {
        var cells = row || [];
        var kinds = cells.map(headerKind);
        var mapping = {};
        kinds.forEach(function (kind, column) {
            if (kind && mapping[kind] == null) mapping[kind] = column;
        });
        var known = Object.keys(mapping);
        var numeric = cells.filter(function (cell) {
            var text = trim(cell);
            return text !== '' && num(text) != null;
        }).length;
        var filled = cells.filter(function (cell) { return trim(cell) !== ''; }).length;
        var hasName = NAME_KINDS.some(function (kind) { return mapping[kind] != null; });
        return { kinds: kinds, mapping: mapping, known: known, numeric: numeric, filled: filled, hasName: hasName };
    }

    /** Шапка подтверждается данными под ней: в колонке имени стоят имена. */
    function headerDataBonus(rows, index, info) {
        var columns = NAME_KINDS.map(function (kind) { return info.mapping[kind]; })
            .filter(function (column) { return column != null; });
        if (!columns.length) return 0;
        var checked = 0, good = 0;
        for (var i = index + 1; i < rows.length && checked < 12; i++) {
            var row = rows[i] || [];
            if (!row.some(function (cell) { return trim(cell) !== ''; })) continue;
            if (isServiceRow(row, info.mapping)) continue;   // «Итого» и повторы шапки не в счёт
            checked++;
            if (columns.some(function (column) { return looksLikeName(row[column]); })) good++;
        }
        if (!checked) return 0;
        return good / checked >= 0.5 ? 4 : -6;
    }

    /** Поиск строки заголовков: она может быть не первой (выше — шапка отчёта). */
    function detectHeader(rows) {
        var best = { index: -1, mapping: {}, known: [], score: -Infinity };
        var limit = Math.min(rows.length, IMPORT_HEADER_SCAN);
        for (var i = 0; i < limit; i++) {
            var info = headerRowInfo(rows[i]);
            if (!info.known.length || info.numeric > 0) continue;
            if (!info.hasName && info.known.length < 2) continue;
            if (!info.hasName && !info.mapping.hi && !info.mapping.ch && !info.mapping.gender && !info.mapping.group) continue;
            var score = info.known.length * 3 + (info.hasName ? 3 : 0) + headerDataBonus(rows, i, info);
            if (score > best.score) best = { index: i, mapping: info.mapping, known: info.known, score: score };
        }
        return {
            index: best.index,
            mapping: best.mapping,
            known: best.known,
            header: best.index >= 0 ? (rows[best.index] || []).map(function (cell) { return trim(cell); }) : [],
            dataRows: best.index >= 0 ? rows.slice(best.index + 1) : rows
        };
    }

    /**
     * Разбор массива строк (Excel/CSV/таблица) в участников.
     * Первая распознанная строка заголовков — шапка; данные под ней. Если
     * заголовков нет, колонки определяются по содержимому (ФИО + гандикап).
     * options: { sheet: 'имя листа' } — попадает в результат для предпросмотра.
     */
    function parseParticipants(aoa, options) {
        var opts = options || {};
        var source = asArray(aoa).map(function (row) {
            return Array.isArray(row) ? row : [row];
        }).map(function (row, index) {
            return { row: row, line: index + 1 };
        });
        var rows = source.filter(function (item) {
            return item.row.some(function (cell) { return trim(cell) !== ''; });
        });
        var result = { players: [], issues: [], header: [], headerRow: 0, columns: {}, sheet: opts.sheet || '', skipped: 0 };
        if (!rows.length) return result;

        var header = detectHeader(rows.map(function (item) { return item.row; }));
        result.header = header.header;
        result.headerRow = header.index >= 0 ? rows[header.index].line : 0;
        var dataItems = header.index >= 0 ? rows.slice(header.index + 1) : rows;
        var inferred = inferColumns(dataItems.map(function (item) { return item.row; }), header.mapping);
        result.columns = columnsSummary(header.mapping, inferred);

        var seen = {};
        dataItems.forEach(function (item) {
            var parsed = playerFromRow(item.row.map(function (cell) { return trim(cell); }), header.mapping, inferred);
            if (parsed.skip) {
                if (parsed.code !== 'service-row') {
                    result.issues.push({ row: item.line, code: parsed.code, message: parsed.message });
                }
                result.skipped++;
                return;
            }
            if (parsed.badHcp) {
                result.issues.push({ row: item.line, code: 'bad-hcp', message: 'Гандикап не распознан: ' + parsed.badHcp });
            }
            var player = parsed.player;
            var key = playerKeyByFio(player);
            if (seen[key]) {
                result.issues.push({ row: item.line, code: 'duplicate', message: 'Дубль ФИО: ' + playerFio(player) });
                return;
            }
            seen[key] = true;
            result.players.push(player);
        });
        return result;
    }

    /** Сводка распознанных колонок — для предпросмотра импорта. */
    function columnsSummary(mapping, inferred) {
        var summary = {};
        Object.keys(mapping || {}).forEach(function (kind) { summary[kind] = mapping[kind]; });
        if (!summary.fio && inferred) {
            if (inferred.fio != null && summary.fio == null) summary.fio = inferred.fio;
            if (inferred.lastName != null && summary.lastName == null) summary.lastName = inferred.lastName;
            if (inferred.firstName != null && summary.firstName == null) summary.firstName = inferred.firstName;
        }
        if (inferred) {
            if (summary.hi == null && inferred.hi != null) summary.hi = inferred.hi;
            if (summary.gender == null && inferred.gender != null) summary.gender = inferred.gender;
            if (summary.tee == null && inferred.tee != null) summary.tee = inferred.tee;
        }
        ['fio', 'lastName', 'firstName', 'hi', 'gender', 'tee', 'group'].forEach(function (kind) {
            if (summary[kind] == null || summary[kind] === '') delete summary[kind];
        });
        return summary;
    }

    /**
     * Разбор всей книги Excel: каждый лист разбирается отдельно, участники
     * объединяются и дедуплицируются. sheets = [{ name, rows }].
     */
    function parseWorkbook(sheets) {
        var out = { players: [], issues: [], sheets: [], header: [], columns: {} };
        var seen = {};
        asArray(sheets).forEach(function (sheet) {
            var name = trim(sheet && sheet.name);
            var rows = asArray(sheet && sheet.rows);
            if (!rows.length) return;
            var parsed = parseParticipants(rows, { sheet: name });
            (parsed.issues || []).forEach(function (issue) {
                out.issues.push({ sheet: name, row: issue.row, code: issue.code, message: issue.message });
            });
            var added = 0;
            (parsed.players || []).forEach(function (player) {
                var key = playerKeyByFio(player);
                if (!key) return;
                if (seen[key]) {
                    out.issues.push({ sheet: name, row: 0, code: 'duplicate', message: 'Дубль ФИО: ' + playerFio(player) });
                    return;
                }
                seen[key] = true;
                player.sheetName = name;
                out.players.push(player);
                added++;
            });
            if (!out.header.length && parsed.header.length) out.header = parsed.header;
            if (!Object.keys(out.columns).length) out.columns = parsed.columns || {};
            out.sheets.push({ name: name, rows: rows.length, players: added, parsed: (parsed.players || []).length });
        });
        return out;
    }

    /** Строка таблицы в CSV/TSV с учётом кавычек — для вставленного текста. */
    function splitDelimitedLine(line, separator) {
        var cells = [];
        var current = '';
        var quoted = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line.charAt(i);
            if (quoted) {
                if (ch === '"') {
                    if (line.charAt(i + 1) === '"') { current += '"'; i++; }
                    else quoted = false;
                } else current += ch;
            } else if (ch === '"' && !trim(current)) {
                current = '';
                quoted = true;
            } else if (ch === separator) {
                cells.push(current);
                current = '';
            } else current += ch;
        }
        cells.push(current);
        return cells.map(function (cell) { return trim(cell); });
    }

    /** Разбор вставленного текста (табуляция/точка с запятой/запятая/|). */
    function parseDelimited(text) {
        var lines = str(text).split(/\r?\n/).filter(function (line) { return trim(line) !== ''; });
        var sample = lines.slice(0, 5).join('\n');
        var separator = '\t';
        if (sample.indexOf('\t') === -1) {
            var semis = (sample.match(/;/g) || []).length;
            // «12,4» — это число с десятичной запятой, а не разделитель.
            var commas = (sample.replace(/(\d),(\d)/g, '$1$2').match(/,/g) || []).length;
            var pipes = (sample.match(/\|/g) || []).length;
            separator = semis > commas ? ';' : ',';
            if (pipes > Math.max(semis, commas)) separator = '|';
        }
        return lines.map(function (line) {
            var cells = splitDelimitedLine(line, separator);
            if (separator !== ',') return cells;
            // Склеиваем обратно «12» + «4» → «12,4» в конце строки.
            var merged = [];
            for (var i = 0; i < cells.length; i++) {
                var next = cells[i + 1];
                if (/^[+-]?\d+$/.test(cells[i]) && next != null && /^\d{1,2}$/.test(next)) {
                    merged.push(cells[i] + ',' + next);
                    i++;
                } else merged.push(cells[i]);
            }
            return merged;
        });
    }

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
        sheet: { ru: ['№', 'Время', 'Флайт', 'Лунка', 'Группа', 'Поз.', 'ФИО', 'HI', 'CH', 'ТИ', 'Формат', 'Маркер'], en: ['#', 'Time', 'Flight', 'Start hole', 'Group', 'Pos.', 'Name', 'HI', 'CH', 'Tee', 'Format', 'Marker'] },
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
            directory: { ru: 'База данных клуба', en: 'Club database' },
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
                genderLabel(player.gender || inferGenderFromName(player.firstName || playerFio(player)), lang),
                teeName(player.tee, lang), player.groupName || '', sourceLabel(player.source, lang)
            ]);
        });
        return rows;
    }

    /** Строки Excel: стартовый лист. */
    function sheetRows(entries, lang) {
        var rows = [headerRow('sheet', lang)];
        // Excel — тоже «от 1-й лунки»: сортируем по флайту/лунке/времени.
        (entries || []).slice().sort(function (a, b) {
            var fa = String(a.flight || '').match(/^(\d+)(.*)$/);
            var fb = String(b.flight || '').match(/^(\d+)(.*)$/);
            var faNum = fa ? parseInt(fa[1], 10) : 999;
            var fbNum = fb ? parseInt(fb[1], 10) : 999;
            var faLet = fa ? fa[2] : '';
            var fbLet = fb ? fb[2] : '';
            return faNum - fbNum || faLet.localeCompare(fbLet, 'ru') ||
                (a.startHole || 1) - (b.startHole || 1) ||
                String(a.startTime || '').localeCompare(String(b.startTime || ''), 'ru') ||
                (a.position || 0) - (b.position || 0);
        }).forEach(function (entry, index) {
            rows.push([
                index + 1, entry.startTime || '', entry.flight || '', entry.startHole || '', entry.groupName || '', entry.position || '',
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
        if (typeof PestovoQr !== 'undefined' && PestovoQr && typeof PestovoQr.dataUrl === 'function') {
            var local = PestovoQr.dataUrl(payload, px);
            if (local) return local;
        }
        return 'https://api.qrserver.com/v1/create-qr-code/?size=' + px + 'x' + px +
            '&margin=2&data=' + encodeURIComponent(payload);
    }

    function defaultScorecardLayout() {
        return {
            theme: 'classic',
            blocks: [
                { id: 'player', type: 'player', label: 'Игрок', x: 3, y: 3, w: 74, h: 10, fontSize: 20, zIndex: 3, visible: true },
                { id: 'details', type: 'details', label: 'Турнир и старт', x: 3, y: 14, w: 74, h: 9, fontSize: 11, zIndex: 2, visible: true },
                { id: 'handicap', type: 'handicap', label: 'Гандикап', x: 3, y: 24, w: 74, h: 8, fontSize: 12, zIndex: 2, visible: true },
                { id: 'qr', type: 'qr', label: 'QR маркера', x: 81, y: 3, w: 16, h: 29, fontSize: 8, zIndex: 3, visible: true },
                { id: 'player-scores', type: 'playerScores', label: 'Счёт игрока', x: 3, y: 36, w: 94, h: 34, fontSize: 9, zIndex: 1, visible: true },
                { id: 'marker-scores', type: 'markerScores', label: 'Счёт маркера', x: 3, y: 73, w: 94, h: 20, fontSize: 9, zIndex: 1, visible: true }
            ]
        };
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
        '@media print{button{display:none}body{margin:0;padding:0}}',
        '@page{size:A4 landscape;margin:10mm}',
        '@page portrait{size:A4 portrait;margin:10mm}',
        '.qr-sheet-page{width:190mm;height:277mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(5,1fr);gap:3mm;page-break-after:always;break-after:page}',
        '.qr-sheet-page:last-child{page-break-after:auto;break-after:auto}',
        '.qr-label{min-width:0;min-height:0;border:1px solid #666;padding:3mm;display:flex;align-items:center;gap:4mm;overflow:hidden;page-break-inside:avoid;break-inside:avoid}',
        '.qr-label img{width:31mm;height:31mm;flex:0 0 31mm;image-rendering:pixelated}',
        '.qr-label-content{min-width:0;font-size:10pt;line-height:1.35}',
        '.qr-label-player{font-size:12pt;font-weight:700;margin-bottom:2mm}',
        '.qr-label-detail{margin-top:1mm}',
        '.tn-scorecard{position:relative;width:277mm;height:190mm;overflow:hidden;border:1.2mm solid #214d37;background:#fff;color:#111;page-break-after:always;break-after:page}',
        '.tn-scorecard:last-child{page-break-after:auto;break-after:auto}',
        '.tn-scorecard.theme-classic{border-color:#214d37}',
        '.tn-scorecard.theme-minimal{border-color:#777}',
        '.tn-scorecard.theme-contrast{border-color:#111;border-width:2mm}',
        '.scorecard-block{position:absolute;overflow:hidden;padding:1mm}',
        '.scorecard-player-name{font-weight:700;font-size:1em;line-height:1.15}',
        '.scorecard-details-line{white-space:nowrap;line-height:1.3}',
        '.scorecard-hcp{display:flex;gap:5mm;align-items:center;font-weight:700}',
        '.scorecard-qr{text-align:center;font-size:2.5mm;line-height:1.2}',
        '.scorecard-qr img{display:block;width:23mm;height:23mm;max-width:100%;margin:0 auto 1mm;image-rendering:pixelated}',
        '.scorecard-table{width:100%;height:100%;margin:0;border-collapse:collapse;table-layout:fixed;font-size:1em}',
        '.scorecard-table th,.scorecard-table td{padding:.6mm .35mm;text-align:center;overflow:hidden;border:.25mm solid #555}',
        '.scorecard-table th{background:#e8efe8;font-weight:700}',
        '.scorecard-table .scorecard-row-label{width:20mm;text-align:left;font-weight:700}',
        '.scorecard-table .scorecard-summary{background:#f1f2ed;font-weight:700}',
        '.scorecard-table .scorecard-score-cell{height:7mm;background:#fff;position:relative}',
        '.scorecard-marks{position:absolute;top:.3mm;right:.4mm;display:inline-flex;gap:.3mm}',
        '.scorecard-mark{display:block;width:.35mm;height:2mm;background:#111;transform:rotate(25deg)}',
        '.scorecard-marks.minus .scorecard-mark{background:#a11414}',
        '.scorecard-block-custom{border:1px dashed #888;white-space:pre-wrap}',
        '.tn-scorecards-preview .tn-scorecard{max-width:100%;height:auto;aspect-ratio:277/190;margin:0 auto 1rem}',
        '.tn-scorecards-preview .scorecard-block{font-size:clamp(6px,1.1vw,14px)}',
        '@media print{.qr-sheet-page{width:190mm;height:277mm}.tn-scorecard{width:277mm;height:190mm}}'
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

    function normalizedScorecardLayout(layout) {
        var fallback = defaultScorecardLayout();
        var saved = layout && typeof layout === 'object' ? layout : {};
        var blocks = Array.isArray(saved.blocks) && saved.blocks.length ? saved.blocks : fallback.blocks;
        return {
            theme: ['classic', 'minimal', 'contrast'].indexOf(saved.theme) !== -1 ? saved.theme : fallback.theme,
            blocks: blocks.map(function (block, index) {
                var source = block || {};
                function clamp(value, min, max, defaultValue) {
                    var parsed = num(value, defaultValue);
                    return Math.max(min, Math.min(max, parsed == null ? defaultValue : parsed));
                }
                return {
                    id: trim(source.id) || ('block_' + index),
                    type: trim(source.type) || 'custom',
                    label: trim(source.label) || '',
                    text: trim(source.text) || '',
                    x: clamp(source.x, 0, 97, 3), y: clamp(source.y, 0, 96, 3),
                    w: clamp(source.w, 3, 100, 20), h: clamp(source.h, 3, 100, 10),
                    fontSize: clamp(source.fontSize, 5, 36, 10),
                    zIndex: clamp(source.zIndex, 0, 20, 1),
                    visible: source.visible !== false
                };
            })
        };
    }

    function scorecardBlockStyle(block) {
        return 'left:' + block.x + '%;top:' + block.y + '%;width:' + block.w + '%;height:' + block.h +
            '%;font-size:' + block.fontSize + 'pt;z-index:' + block.zIndex + ';' +
            (block.visible ? '' : 'display:none;');
    }

    /**
     * Удары форы наклонными черточками в правом верхнем углу клетки счёта:
     * одна черточка за каждый удар форы на лунке (как на бланке клуба).
     * Минусовая фора — красные черточки.
     */
    function foreMarksHtml(value, lang) {
        var strokes = num(value, 0) || 0;
        if (!strokes) return '';
        var count = Math.abs(strokes);
        var bars = '';
        for (var i = 0; i < count; i++) bars += '<i class="scorecard-mark"></i>';
        var title = (lang === 'en' ? 'Handicap: ' : 'Фора: ') + count + ' ' +
            (lang === 'en' ? (count === 1 ? 'stroke' : 'strokes') : pluralStrokes(count)) +
            (strokes < 0 ? (lang === 'en' ? ' (given)' : ' (минусовая)') : '');
        return '<span class="scorecard-marks' + (strokes < 0 ? ' minus' : '') + '" title="' + esc(title) + '">' +
            bars + '</span>';
    }

    /** Русская форма: 1 удар / 2 удара / 5 ударов. */
    function pluralStrokes(n) {
        var mod10 = n % 10;
        var mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'удар';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'удара';
        return 'ударов';
    }

    /** Разметка одной счётной карточки — общая для превью и печатного PDF. */
    function scorecardMarkup(opts) {
        var o = opts || {};
        var lang = o.lang === 'en' ? 'en' : 'ru';
        var player = o.player || {};
        var entry = o.entry || {};
        var card = o.card || playerCard({}, o.course || defaultCourse(), entry.tee || player.tee || 'wh', entry.ch != null ? entry.ch : player.ch);
        var holes = (card.holes || []).slice(0, 18);
        var summaries = lang === 'en' ? ['Out', 'In', 'Total'] : ['Аут', 'Ин', 'Итог'];
        var layout = normalizedScorecardLayout(o.layout);
        var payload = o.qr || entry.qr || entry.scoreUrl || '';
        var playerName = o.playerName || entry.playerName || playerFio(player);
        var markerName = o.markerName || '';
        var tee = teeName(entry.tee || player.tee || '', lang);
        var startHole = entry.startHole || o.startHole || 1;
        var detailParts = [];
        if (o.tournamentName) detailParts.push(o.tournamentName);
        if (o.roundDate) detailParts.push((lang === 'en' ? 'Date: ' : 'Дата: ') + dateRu(o.roundDate));
        if (o.courseName) detailParts.push((lang === 'en' ? 'Course: ' : 'Поле: ') + o.courseName);
        if (tee) detailParts.push((lang === 'en' ? 'Tee: ' : 'ТИ: ') + tee);
        detailParts.push((lang === 'en' ? 'Start: hole ' : 'Старт: лунка ') + startHole +
            (entry.startTime ? ' · ' + (lang === 'en' ? 'time ' : 'время ') + entry.startTime : ''));
        var blocks = layout.blocks.slice().sort(function (a, b) {
            return a.zIndex - b.zIndex || layout.blocks.indexOf(a) - layout.blocks.indexOf(b);
        });
        var body = '';
        blocks.forEach(function (block) {
            if (!block.visible) return;
            var content = '';
            if (block.type === 'player') {
                content = '<div class="scorecard-player-name">' + esc(playerName) + '</div>';
            } else if (block.type === 'details') {
                content = '<div class="scorecard-details-line">' + esc(detailParts.join(' · ')) + '</div>';
            } else if (block.type === 'handicap') {
                content = '<div class="scorecard-hcp"><span>' + esc(lang === 'en' ? 'Exact handicap (HI)' : 'Точный гандикап (HI)') +
                    ': ' + esc(fmtHcp(entry.hi != null ? entry.hi : player.hi)) + '</span><span>' +
                    esc(lang === 'en' ? 'Course handicap (CH)' : 'Полевой гандикап (CH)') + ': ' +
                    esc(fmtHcp(entry.ch != null ? entry.ch : player.ch)) + '</span></div>';
            } else if (block.type === 'qr') {
                content = payload ? '<div class="scorecard-qr"><img src="' + esc(qrImageUrl(payload, 320)) +
                    '" data-qr="' + esc(payload) + '" alt="QR"><b>' + esc(lang === 'en' ? 'Score for ' : 'Счёт игрока: ') +
                    esc(playerName) + '</b>' + (markerName ? '<div>' + esc((lang === 'en' ? 'Marker: ' : 'Маркер: ') + markerName) + '</div>' : '') +
                    '</div>' : '<div class="scorecard-qr">' + esc(lang === 'en' ? 'QR unavailable' : 'QR не назначен') + '</div>';
            } else if (block.type === 'playerScores') {
                var lengthValues = holes.map(function (hole) { return hole.length; });
                var parValues = holes.map(function (hole) { return hole.par; });
                var indexValues = holes.map(function (hole) { return hole.index; });
                var foreValues = holes.map(function (hole) { return hole.fore; });
                var scoreValues = holes.map(function (hole) { return hole.strokes; });
                var aggregate = function (values, begin, end) {
                    var list = values.slice(begin, end);
                    if (!list.some(function (value) { return value != null && value !== ''; })) return '';
                    return list.reduce(function (sum, value) { return sum + (num(value, 0) || 0); }, 0);
                };
                var scoreLabel = lang === 'en' ? 'Player score' : 'Счёт игрока';
                var metricRows = [
                    [lang === 'en' ? 'Length' : 'Длина', lengthValues, [aggregate(lengthValues, 0, 9), aggregate(lengthValues, 9, 18), aggregate(lengthValues, 0, 18)], null],
                    [lang === 'en' ? 'Par' : 'Пар', parValues, [aggregate(parValues, 0, 9), aggregate(parValues, 9, 18), aggregate(parValues, 0, 18)], null],
                    [lang === 'en' ? 'Index' : 'Индекс', indexValues, ['', '', ''], null],
                    [lang === 'en' ? 'Handicap' : 'Фора', foreValues, ['', '', ''], null],
                    // В клетках счёта — черточки форы: удар форы виден, цифру не закрывает.
                    [scoreLabel, scoreValues,
                        [aggregate(scoreValues, 0, 9), aggregate(scoreValues, 9, 18), aggregate(scoreValues, 0, 18)],
                        foreValues]
                ];
                content = '<table class="scorecard-table"><thead><tr><th class="scorecard-row-label">' +
                    esc(lang === 'en' ? 'Hole' : 'Лунка') + '</th>' + holes.map(function (hole) { return '<th>' + esc(hole.hole) + '</th>'; }).join('') +
                    summaries.map(function (summary) { return '<th class="scorecard-summary">' + esc(summary) + '</th>'; }).join('') +
                    '</tr></thead><tbody>' + metricRows.map(function (row) {
                        var isScore = row[0] === scoreLabel;
                        return '<tr><td class="scorecard-row-label">' + esc(row[0]) + '</td>' +
                            row[1].map(function (value, i) {
                                return '<td' + (isScore ? ' class="scorecard-score-cell"' : '') + '>' +
                                    esc(value == null ? '' : value) +
                                    (isScore ? foreMarksHtml(row[3][i], lang) : '') + '</td>';
                            }).join('') +
                            row[2].map(function (value) { return '<td class="scorecard-summary' + (isScore ? ' scorecard-score-cell' : '') + '">' + esc(value == null ? '' : value) + '</td>'; }).join('') +
                            '</tr>';
                    }).join('') + '</tbody></table>';
            } else if (block.type === 'markerScores') {
                var markerScores = o.markerScores || {};
                var values = holes.map(function (hole) {
                    var value = markerScores[hole.hole] != null ? markerScores[hole.hole] : markerScores[String(hole.hole)];
                    return value == null ? '' : value;
                });
                var totalScores = function (from, to) {
                    var list = values.slice(from, to).filter(function (value) { return value !== ''; });
                    return list.length ? list.reduce(function (sum, value) { return sum + (num(value, 0) || 0); }, 0) : '';
                };
                content = '<table class="scorecard-table"><thead><tr><th class="scorecard-row-label">' +
                    esc(lang === 'en' ? 'Hole' : 'Лунка') + '</th>' + holes.map(function (hole) { return '<th>' + esc(hole.hole) + '</th>'; }).join('') +
                    summaries.map(function (summary) { return '<th class="scorecard-summary">' + esc(summary) + '</th>'; }).join('') +
                    '</tr></thead><tbody><tr><td class="scorecard-row-label">' + esc(lang === 'en' ? 'Marker score' : 'Счёт маркера') + '</td>' +
                    values.map(function (value) { return '<td class="scorecard-score-cell">' + esc(value) + '</td>'; }).join('') +
                    [totalScores(0, 9), totalScores(9, 18), totalScores(0, 18)].map(function (value) { return '<td class="scorecard-summary scorecard-score-cell">' + esc(value) + '</td>'; }).join('') +
                    '</tr></tbody></table>';
            } else {
                var customText = block.text || block.label || (lang === 'en' ? 'New item' : 'Новый элемент');
                content = '<div class="scorecard-block-custom">' + esc(customText) + '</div>';
            }
            body += '<div class="scorecard-block scorecard-block-' + esc(block.type) + '" data-scorecard-block="' + esc(block.id) +
                '" style="' + esc(scorecardBlockStyle(block)) + '">' + content + '</div>';
        });
        return '<section class="tn-scorecard theme-' + esc(layout.theme) + '" data-player-id="' + esc(player.id || entry.playerId || '') + '">' + body + '</section>';
    }

    function qrCardsHtml(opts) {
        var o = opts || {};
        var lang = o.lang === 'en' ? 'en' : 'ru';
        var entries = (o.entries || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var pages = '';
        for (var offset = 0; offset < entries.length; offset += 10) {
            pages += '<div class="qr-sheet-page">';
            entries.slice(offset, offset + 10).forEach(function (entry) {
                var payload = entry.qr || entry.scoreUrl || '';
                var details = [];
                if (o.tournamentName) details.push(o.tournamentName);
                if (o.roundDate) details.push((lang === 'en' ? 'Round: ' : 'Раунд: ') + dateRu(o.roundDate));
                details.push((lang === 'en' ? 'Start hole: ' : 'Лунка старта: ') + (entry.startHole || 1));
                details.push((lang === 'en' ? 'Start time: ' : 'Время старта: ') + (entry.startTime || '—'));
                if (entry.markerName) details.push((lang === 'en' ? 'Scorekeeper: ' : 'Счёт ведёт: ') + entry.markerName);
                pages += '<article class="qr-label">' + (payload ? '<img src="' + esc(qrImageUrl(payload, 360)) +
                    '" data-qr="' + esc(payload) + '" alt="QR">' : '') +
                    '<div class="qr-label-content"><div class="qr-label-player">' + esc(entry.playerName || '') + '</div>' +
                    details.map(function (line) { return '<div class="qr-label-detail">' + esc(line) + '</div>'; }).join('') +
                    '</div></article>';
            });
            pages += '</div>';
        }
        if (!entries.length) pages = '<p class="muted">' + esc(lang === 'en' ? 'No QR codes' : 'Нет QR-кодов') + '</p>';
        var title = o.title || (lang === 'en' ? 'Player QR codes' : 'QR-коды участников');
        return printDocument(title, pages, { lang: lang, portrait: true });
    }

    function scorecardsHtml(opts) {
        var o = opts || {};
        var lang = o.lang === 'en' ? 'en' : 'ru';
        var cards = o.cards || [];
        var body = cards.map(function (item) {
            return scorecardMarkup(Object.assign({}, o, item, { layout: o.layout || item.layout }));
        }).join('');
        if (!cards.length) body = '<p class="muted">' + esc(lang === 'en' ? 'No scorecards' : 'Нет счётных карточек') + '</p>';
        var title = o.title || (lang === 'en' ? 'Tournament scorecards' : 'Счётные карточки турнира');
        return printDocument(title, body, { lang: lang });
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
        // Сортируем записи по лунке/флайту/времени: PDF должен сразу идти
        // «от 1-й лунки», даже если админ поменял поле order вручную.
        var entries = (o.entries || []).slice().sort(function (a, b) {
            var fa = String(a.flight || '').match(/^(\d+)(.*)$/);
            var fb = String(b.flight || '').match(/^(\d+)(.*)$/);
            var faNum = fa ? parseInt(fa[1], 10) : 999;
            var fbNum = fb ? parseInt(fb[1], 10) : 999;
            var faLet = fa ? fa[2] : '';
            var fbLet = fb ? fb[2] : '';
            return faNum - fbNum || faLet.localeCompare(fbLet, 'ru') ||
                (a.startHole || 1) - (b.startHole || 1) ||
                String(a.startTime || '').localeCompare(String(b.startTime || ''), 'ru') ||
                (a.position || 0) - (b.position || 0);
        });
        var title = o.title || (lang === 'en' ? 'Tee sheet' : 'Стартовый лист');
        var meta = [];
        if (o.tournamentName) meta.push(o.tournamentName);
        if (o.roundDate) meta.push((lang === 'en' ? 'Round: ' : 'Раунд: ') + dateRu(o.roundDate));
        if (o.course) meta.push((lang === 'en' ? 'Course: ' : 'Поле: ') + o.course);
        // QR-коды печатаются отдельным листом: стартовый лист остаётся компактным
        // и предназначен именно для проверки состава/времени/лунки старта.
        var body = docHeader(title, meta);

        var byFlight = {};
        entries.forEach(function (entry) {
            var flight = entry.flight || '';
            byFlight[flight] = byFlight[flight] || {};
            var groupKey = entry.startGroupId || [entry.groupId || entry.groupName || '', entry.startHole || 1, entry.startTime || ''].join('|');
            byFlight[flight][groupKey] = byFlight[flight][groupKey] || [];
            byFlight[flight][groupKey].push(entry);
        });
        // Флайты сортируются по стартовой лунке: так 1А и 1Б идут раньше 2А,
        // и в печатном листе получается естественный порядок «от 1 лунки».
        // Номер флайта совпадает со стартовой лункой (см. buildSheet), поэтому
        // сортировки по flight и по startHole здесь эквивалентны.
        Object.keys(byFlight).sort(function (a, b) {
            var aa = String(a).match(/^(\d+)(.*)$/), bb = String(b).match(/^(\d+)(.*)$/);
            if (!aa || !bb) return String(a).localeCompare(String(b), 'ru');
            return parseInt(aa[1], 10) - parseInt(bb[1], 10) || aa[2].localeCompare(bb[2], 'ru');
        }).forEach(function (flight) {
            if (flight) body += '<div class="flight-title">' + esc((lang === 'en' ? 'Flight ' : 'Флайт ') + flight) + '</div>';
            Object.keys(byFlight[flight]).forEach(function (groupKey) {
                var list = byFlight[flight][groupKey];
                var startHole = list[0].startHole || 1;
                var groupTitle = (list[0].groupName || (lang === 'en' ? 'Group' : 'Группа')) +
                    ' · ' + (list[0].startTime || '') + ' · ' + (lang === 'en' ? 'hole ' : 'лунка ') + startHole;
                body += '<div class="group"><div class="group-head"><div><div class="group-title">' + esc(groupTitle) + '</div>' +
                    '<div class="muted">' + esc(teeName(list[0].tee, lang) + (list[0].format ? ' · ' + list[0].format : '')) + '</div></div></div>';
                body += '<table><thead><tr><th class="num">#</th><th>' +
                    (lang === 'en' ? 'Player' : 'Игрок') + '</th><th class="num">HI</th><th class="num">CH</th><th>' +
                    (lang === 'en' ? 'Tee' : 'ТИ') + '</th><th class="num">' + (lang === 'en' ? 'Start hole' : 'Лунка старта') + '</th><th>' +
                    (lang === 'en' ? 'Format' : 'Формат') + '</th><th>' + (lang === 'en' ? 'Marker' : 'Маркер') + '</th></tr></thead><tbody>';
                list.sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
                list.forEach(function (entry) {
                    body += '<tr><td class="num">' + esc(entry.position || '') + '</td>' +
                        '<td>' + esc(entry.playerName || '') + '</td>' +
                        '<td class="num">' + esc(fmtHcp(entry.hi)) + '</td>' +
                        '<td class="num">' + esc(fmtHcp(entry.ch)) + '</td>' +
                        '<td>' + esc(teeName(entry.tee, lang)) + '</td>' +
                        '<td class="num">' + esc(entry.startHole || startHole) + '</td>' +
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
        inferGenderFromName: inferGenderFromName, distributePlayers: distributePlayers,
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
        startGroupSizes: startGroupSizes, startGroupSizesOk: startGroupSizesOk, MIN_START_GROUP: MIN_START_GROUP,
        applyEntryPatch: applyEntryPatch, recalcSheet: recalcSheet, flightLetter: flightLetter,
        // results
        buildResults: buildResults, assignPlaces: assignPlaces, placeLabel: placeLabel,
        isPodium: isPodium, applyResultOverrides: applyResultOverrides, sortRows: sortRows,
        // import / export
        parseParticipants: parseParticipants, parseWorkbook: parseWorkbook, headerKind: headerKind,
        hcpNumber: hcpNumber, parseDelimited: parseDelimited, csvFromRows: csvFromRows,
        HEADERS: HEADERS, headerRow: headerRow, teeName: teeName, sourceLabel: sourceLabel,
        participantsRows: participantsRows, sheetRows: sheetRows, resultsRows: resultsRows, scoreRows: scoreRows,
        participantsCounts: participantsCounts,
        // print / qr
        PRINT_CSS: PRINT_CSS, printDocument: printDocument, participantsHtml: participantsHtml,
        sheetHtml: sheetHtml, qrCardsHtml: qrCardsHtml, scorecardsHtml: scorecardsHtml, scorecardMarkup: scorecardMarkup,
        defaultScorecardLayout: defaultScorecardLayout, normalizedScorecardLayout: normalizedScorecardLayout,
        resultsHtml: resultsHtml, roundScoreHtml: roundScoreHtml,
        playerCardHtml: playerCardHtml, scoreUrl: scoreUrl, qrImageUrl: qrImageUrl
    };
});
