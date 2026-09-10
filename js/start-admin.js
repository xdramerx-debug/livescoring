// ==========================================================
// СТАРТ ТУРНИРА (вкладка админки «Старт турнира 🏁»)
// ----------------------------------------------------------
// Позволяет собрать стартовый протокол турнира:
//  — участники (из регистрации на турнир, вручную или из Excel),
//  — поля: фамилия, имя, отчество (если есть), точный гандикап,
//    полевой гандикап (считается автоматически), ТИ, формат,
//  — автоматическое распределение на группы (1–4 человека):
//    в порядке списка / по алфавиту / по гандикапу / «змейкой» / случайно,
//  — стартовые времена и стартовые лунки (с 1-й, шотган 1+10 или со всех 18),
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
    groups: [],            // результаты раскладки (предпросмотр / ручная правка)
    savedId: null,         // последний сохранённый протокол
    excel: null,           // распарсенные строки Excel (перед добавлением)
    editingId: null,       // id редактируемого сохранённого протокола (null = создаём новый)
    editRounds: {},        // roundId -> данные раунда из базы (чтобы не потерять счёт при правке)
    editDeletedRounds: [], // roundId групп, удалённых при редактировании
    rosterCollapsed: {},   // свёрнутые группы компактного стартового листа (ключ группы -> true)
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
        format: 'Stroke Play',   // первый (основной) формат — для обратной совместимости
        formats: [],             // выбранные форматы игры (можно несколько, напр. Stableford + Gross)
        formatCustom: '',
        tee: 'wh',
        scheme: '1',          // '1' — все с 1-й лунки, '1-10' — шотган с 1-й и 10-й
        size: 4,
        method: 'hcpSnake',   // order|alpha|hcpAsc|hcpDesc|hcpSnake|random
        interval: 8,
        startTime: '09:00',
        // Обрезка точного гандикапа — только для текущего турнира:
        // сначала процент (например 90%), затем максимум по полу.
        // Процент и максимум включаются независимо (галочками): можно резать
        // только процентами, только максимумом или и тем, и другим сразу.
        hcpCutEnabled: false,
        hcpCutPercent: 90,
        hcpCutMaxEnabled: false,
        hcpMaxMen: '',
        hcpMaxWomen: '',
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

// Считает двух игроков ОДНИМ человеком (для дедупликации списков):
//  — совпали id,
//  — совпало полное ФИО,
//  — совпали фамилия+имя, и хотя бы у одного нет отчества
//    (заявка могла быть без отчества, а стартовый лист — с отчеством).
function psSamePerson(a, b) {
    a = a || {}; b = b || {};
    var idA = String(a.id || '').trim(), idB = String(b.id || '').trim();
    if (idA && idB && idA === idB) return true;
    var la = psNorm(a.lastName), lb = psNorm(b.lastName);
    var fa = psNorm(a.firstName), fb = psNorm(b.firstName);
    if (!la || !fa || !lb || !fb) {
        // у одной из сторон нет разобранных частей — сравниваем по полной строке имени
        var fullA = psNorm([a.lastName, a.firstName, a.middleName].filter(function(w) { return String(w || '').trim(); }).join(' '));
        var fullB = psNorm([b.lastName, b.firstName, b.middleName].filter(function(w) { return String(w || '').trim(); }).join(' '));
        return !!(fullA && fullB && fullA === fullB);
    }
    if (la !== lb || fa !== fb) return false;
    var ma = psNorm(a.middleName), mb = psNorm(b.middleName);
    if (ma && mb && ma !== mb) return false; // разные отчества — вероятно, разные люди
    return true;
}

function psLooksLikeSurname(w) {
    w = psNorm(w);
    if (!w) return false;
    // -ка/-ха — характерные окончания русских фамилий (Парасочка, Ватруха);
    // мужских имён на -ка/-ха не существует, поэтому признак безопасен.
    return /(ов|ев|ёв|ин|ын|ский|цкий|ской|цкой|ко|ук|юк|ич|енко|ова|ева|ина|ка|ха)$/.test(w);
}

// ── Списки имён для разбора ФИО и определения пола ──
// Используются в двух местах: (1) чтобы в паре «слово + слово» понять,
// где фамилия, а где имя («Парасочка Максим» → фамилия + имя), и
// (2) чтобы определить пол, когда и фамилия и отчество не дали ответа.
var PS_MALE_FIRST_NAMES = [
    'август', 'авраам', 'амброзий', 'александр', 'алексей', 'анатолий', 'андрей', 'антон', 'аркадий',
    'арсений', 'артём', 'артем', 'артур', 'асхат', 'богдан', 'бронислав', 'вадим', 'валентин', 'валерий',
    'владимир', 'владислав', 'владлен', 'влас', 'власий', 'виталий', 'виктор', 'геннадий', 'гавриил',
    'георгий', 'григорий', 'густав', 'давид', 'даниил', 'данила', 'демьян', 'денис', 'дмитрий', 'егор',
    'евгений', 'елисей', 'игнат', 'игнатий', 'илия', 'илья', 'иннокентий', 'иосиф', 'иван', 'игорь',
    'исаак', 'карл', 'костя', 'константин', 'кирилл', 'климент', 'корней', 'косьма', 'кузьма', 'лаврентий',
    'лазарь', 'леонид', 'леон', 'лука', 'магнус', 'мак', 'максим', 'макс', 'мартин', 'матвей',
    'михаил', 'миха', 'мирон', 'мисаил', 'нестор', 'никита', 'николай', 'олег', 'осип', 'отто',
    'павел', 'платон', 'пётр', 'петр', 'радислав', 'рафаил', 'роман', 'роберто', 'ростислав', 'себастьян',
    'семен', 'семён', 'серафим', 'сергей', 'сидор', 'славен', 'станислав', 'стефан', 'степан', 'тихон',
    'тимур', 'тимофей', 'томас', 'трофим', 'фаддей', 'фёдор', 'федор', 'феликс', 'филипп', 'флориан',
    'франц', 'флавиан', 'харлампий', 'хенрик', 'цезарь', 'юлиан', 'юрий', 'юхан', 'яков', 'ярослав',
    'захар', 'nikita', 'artem', 'dmitry', 'alexander', 'michael', 'david', 'john', 'peter', 'andrew',
    'ivan', 'vladimir', 'konstantin', 'sergey', 'maxim'
];
var PS_FEMALE_FIRST_NAMES = [
    'анна', 'мария', 'елена', 'ольга', 'наталья', 'наталия', 'ирина', 'светлана', 'екатерина', 'катерина',
    'татьяна', 'юлия', 'юля', 'александра', 'дарья', 'дарина', 'виктория', 'полина', 'ксения', 'евгения',
    'людмила', 'галина', 'валерия', 'вероника', 'карина', 'кристина', 'марина', 'надежда', 'нина', 'раиса',
    'софия', 'софья', 'алина', 'алиса', 'милана', 'таисия', 'варвара', 'маргарита', 'лариса', 'любовь',
    'вера', 'зоя', 'инна', 'елизавета', 'анастасия', 'оксана', 'жанна', 'регина', 'элина', 'камила',
    'лилия', 'эмма', 'валентина', 'алёна', 'алена', 'арина', 'диана', 'елина', 'изабелла', 'изольда',
    'ивоника', 'калина', 'кира', 'лея', 'лиана', 'милена', 'марта', 'никола', 'олга', 'рада',
    'риза', 'сара', 'стелла', 'хана', 'эва', 'эвелин', 'даша', 'маша', 'оля', 'наташа', 'иринка',
    'albina', 'sofia', 'sophia', 'maria', 'anna', 'olga', 'elena', 'irina', 'julia', 'victoria',
    'emma', 'sarah', 'kate', 'nina', 'olivia', 'amelia', 'ava', 'mia'
];
// Слово похоже на имя (по словарю)? Без отчества/фамилии это главный
// признак, отличающий имя от фамилии в коротких записях «Слово1 Слово2».
function psLooksLikeFirstName(w) {
    var s = psNorm(w).replace(/[.]/g, '');
    if (!s) return false;
    if (s.length < 2) return false;
    return PS_MALE_FIRST_NAMES.indexOf(s) !== -1 || PS_FEMALE_FIRST_NAMES.indexOf(s) !== -1;
}

// «Мусорный» токен внутри ФИО: возраст («Кирилл 17 Дунаев»),
// год рождения, номер по порядку и т.п. В именах цифр не бывает,
// поэтому такие токены при разборе ФИО просто выбрасываем.
function psIsAgeToken(tok) {
    var s = String(tok == null ? '' : tok).replace(/^[(\[]+|[)\],.;:]+$/g, '').trim();
    if (!s) return true;
    // Чистое число («17», «2008», «12.5») — всегда мусор в ФИО.
    if (/^\d+([.,]\d+)?$/.test(s)) return true;
    // Число с единицей («17 лет», «17л», «17 г.») — тоже возраст.
    if (/^\d+\s*(лет|год|года|л\.?|г\.?)$/i.test(s)) return true;
    return false;
}

function psStripAgeTokens(raw) {
    return String(raw || '').replace(/\s+/g, ' ').trim().split(' ')
        .filter(function(w) { return w && !psIsAgeToken(w); });
}

// Разбор «сырого» ФИО (строка) на части. Поддерживает оба порядка:
//   «Тестов Иван Петрович» / «Иван Петрович Тестов»
//   «Тестов Иван» / «Иван Тестов»
// А также составные (нерусские) фамилии с частицами:
//   «ван дер Берг Иван», «Иван ван дер Берг», «John van der Berg»
// Возраст и другие числа внутри строки («Кирилл 17 Дунаев») отбрасываются.
function psSplitFio(raw) {
    var parts = psStripAgeTokens(raw);
    var res = { lastName: '', firstName: '', middleName: '' };
    if (!parts.length || !parts[0]) return res;
    if (parts.length === 1) { res.firstName = parts[0]; return res; }
    if (parts.length === 2) {
        // Два слова — разбираем по признакам обоих: окончание-фамилия и
        // словарь имён. «Парасочка Максим» (фамилия на -ка) и «Иван Кузнец»
        // (фамилия без типовых окончаний) раньше путались местами — из-за
        // этого пол и ТИ назначались неверно.
        var s0 = psLooksLikeSurname(parts[0]), s1 = psLooksLikeSurname(parts[1]);
        var f0 = psLooksLikeFirstName(parts[0]), f1 = psLooksLikeFirstName(parts[1]);
        if (s0 && !f0) { res.lastName = parts[0]; res.firstName = parts[1]; }
        else if (f1 && !s1) { res.lastName = parts[0]; res.firstName = parts[1]; }
        else if (s1 && !f1) { res.firstName = parts[0]; res.lastName = parts[1]; }
        else if (f0 && !s0) { res.firstName = parts[0]; res.lastName = parts[1]; }
        else if (s0) { res.lastName = parts[0]; res.firstName = parts[1]; }
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
    // «Парасочка Максим Геннадиевич» — порядок «Фамилия Имя Отчество», но
    // фамилия без типовых окончаний (-ка/-ха и т.п.), поэтому п.1 выше не сработал.
    // Отчество на последнем месте — надёжный ориентир: определяем, какое из
    // первых двух слов имя (по словарю), а какое фамилия.
    if (parts.length === 3 && isPatronymic(parts[2]) && !isPatronymic(parts[0]) && !isPatronymic(parts[1])) {
        var fA = psLooksLikeFirstName(parts[0]), fB = psLooksLikeFirstName(parts[1]);
        var sA = psLooksLikeSurname(parts[0]), sB = psLooksLikeSurname(parts[1]);
        if (fB && !fA) { res.lastName = parts[0]; res.firstName = parts[1]; }
        else if (fA && !fB) { res.firstName = parts[0]; res.middleName = parts[2]; res.lastName = parts[1]; }
        else if (sB && !sA) { res.firstName = parts[0]; res.middleName = parts[2]; res.lastName = parts[1]; }
        else { res.lastName = parts[0]; res.firstName = parts[1]; }
        res.middleName = parts[2];
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
    // Полевой гандикап всегда считается от ОБРЕЗАННОГО точного гандикапа
    // (см. подсказку в psRenderCutBox), а не от исходного p.hcp.
    var eff = psEffectiveExact(p);
    if (typeof getFieldHcp === 'function') {
        try { return getFieldHcp(eff, p.tee || 'wh', p.gender || 'men'); } catch (e) {}
    }
    return Math.round(eff);
}
// Точный гандикап С УЧЁТОМ обрезки турнира (сначала процент, затем максимум).
// Без настроенной обрезки равен исходному p.hcp. Используется для полевого
// гандикапа, записи в раунд/протокол и чипов-подсказок в интерфейсе.
function psEffectiveExact(p) {
    var raw = 0;
    if (p && p.hcp !== null && p.hcp !== undefined && p.hcp !== '') {
        raw = parseFloat(p.hcp);
        if (isNaN(raw)) raw = 0;
    }
    return psEffectiveExactFor(raw, (p && p.gender) || 'men');
}

// То же, но по готовым значениям (удобно для Excel-превью и авто-групп).
function psEffectiveExactFor(hcp, gender) {
    var raw = (hcp === '' || hcp == null) ? 0 : parseFloat(hcp);
    if (isNaN(raw)) raw = 0;
    gender = gender || 'men';
    var proto = (typeof psState !== 'undefined' && psState.proto) ? psState.proto : {};
    var cut = {
        enabled: proto.hcpCutEnabled === true,
        percent: proto.hcpCutPercent,
        maxEnabled: proto.hcpCutMaxEnabled,
        maxMen: proto.hcpMaxMen,
        maxWomen: proto.hcpMaxWomen
    };
    // Единая логика обрезки живёт в js/utils.js — используем её, чтобы старт
    // считал точно так же, как страница турнира.
    if (typeof tnApplyHcpCut === 'function') {
        try { return tnApplyHcpCut(raw, gender, cut).effective; } catch (e) {}
    }
    // Запасной вариант (например, в юнит-тестах без utils.js): та же логика —
    // сначала процент, затем максимум по полу.
    var eff = raw;
    if (cut.enabled) {
        var pct = parseFloat(cut.percent);
        if (isNaN(pct) || pct <= 0) pct = 100;
        if (pct > 100) pct = 100;
        if (pct < 100 - 1e-9) eff = Math.round(raw * pct) / 100;
    }
    var maxOn = (cut.maxEnabled === undefined || cut.maxEnabled === null)
        ? ((cut.maxMen !== '' && cut.maxMen != null) || (cut.maxWomen !== '' && cut.maxWomen != null))
        : (cut.maxEnabled === true);
    var maxV = gender === 'women' ? cut.maxWomen : cut.maxMen;
    maxV = (maxV === '' || maxV == null) ? null : parseFloat(maxV);
    if (maxOn && maxV != null && !isNaN(maxV) && eff > maxV) eff = maxV;
    return Math.round(eff * 10) / 10;
}
// Подсказка «✂ 36 → 25.2» рядом с именем, если обрезка турнира изменила
// точный гандикап игрока. Пустая строка — обрезка не действует.
function psCutHintHtml(p) {
    if (!p || p.hcp === null || p.hcp === undefined || p.hcp === '') return '';
    var raw = parseFloat(p.hcp);
    if (isNaN(raw)) return '';
    var eff = psEffectiveExact(p);
    if (Math.abs(eff - raw) < 0.049) return '';
    var title = (psL('Обрезка турнира', 'Tournament cut') + ': ' + psHcpFmt(raw) + ' → ' + psHcpFmt(eff)).replace(/"/g, '&quot;');
    return ' <span class="hcp-chip" style="background:rgba(201,168,76,.14);border-color:rgba(201,168,76,.5);color:var(--gold);font-size:10.5px;" title="' + title + '"><i class="fas fa-scissors"></i> ' + psHcpFmt(raw) + ' → ' + psHcpFmt(eff) + '</span>';
}
// Чип группы по гандикапу («Мужчины 0–12»), заданной во вкладке «Турниры».
// Группа определяется по ОБРЕЗАННОМУ точному гандикапу (если обрезка настроена),
// чтобы стартовый лист сразу показывал, в какой группе игрок реально играет.
// Пустая строка — нет групп.
function psDivisionChipHtml(p) {
    try {
        if (!p || p.hcp === null || p.hcp === undefined || p.hcp === '') return '';
        if (typeof tnFindDivision !== 'function') return '';
        var tn = (typeof psGetSelTournament === 'function') ? psGetSelTournament() : null;
        if (!tn || !tn.divisions) return '';
        var d = tnFindDivision(tn, psEffectiveExact(p), p.gender || 'men');
        if (!d || !d.name) return '';
        var escFn = (typeof escapeHtml === 'function') ? escapeHtml : function(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
        var label = escFn(d.name);
        var range = (typeof tnDivisionRangeText === 'function') ? tnDivisionRangeText(d) : '';
        if (range) label += ' · ' + escFn(range);
        return '<span class="tn-div-chip">' + label + '</span>';
    } catch (e) { return ''; }
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

// Группа турнира (дивизион) для готовых значений гандикапа и пола.
// Использует ОБРЕЗАННЫЙ точный гандикап, как и весь стартовый лист.
function psFindDivisionFor(hcp, gender) {
    try {
        if (hcp === null || hcp === undefined || hcp === '') return null;
        if (typeof tnFindDivision !== 'function') return null;
        var tn = (typeof psGetSelTournament === 'function') ? psGetSelTournament() : null;
        if (!tn || !tn.divisions) return null;
        return tnFindDivision(tn, psEffectiveExactFor(hcp, gender || 'men'), gender || 'men');
    } catch (e) { return null; }
}

// ТИ по умолчанию для игрока при импорте/добавлении:
//  1) ТИ его группы турнира (дивизиона), если группа задана и ТИ разрешены;
//  2) иначе для девушек — красные (или белые, если красных нет в турнире);
//  3) иначе ТИ протокола по умолчанию.
function psDefaultTeeFor(gender, hcp) {
    gender = gender || 'men';
    var allowed = [];
    try { allowed = psAllowedTees() || []; } catch (e) { allowed = []; }
    if (!allowed.length) allowed = ['bk', 'bl', 'wh', 'rd'];
    var div = psFindDivisionFor(hcp, gender);
    if (div && div.tee && allowed.indexOf(div.tee) !== -1) return div.tee;
    if (gender === 'women') {
        if (allowed.indexOf('rd') !== -1) return 'rd';
        if (allowed.indexOf('wh') !== -1) return 'wh';
        return allowed[0];
    }
    var proto = (typeof psState !== 'undefined' && psState.proto) ? psState.proto : {};
    if (proto.tee && allowed.indexOf(proto.tee) !== -1) return proto.tee;
    return allowed[0] || 'wh';
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
                status: t.status || 'upcoming',
                divisions: t.divisions || null
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
    if (!psState.proto) {
        psState.savedId = null;
        psState.excel = null;
        psState.proto = psDefaultProto();
    }
    // Турниры (включая группы по гандикапу) подтягиваем при каждом открытии —
    // их могли создать/изменить во вкладке «Турниры». Черновик при этом не трогаем.
    psLoadUsers();
    psLoadTournaments(function() { psRender(); });
    psRender();
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
    psAttachPlayerAutofill();
}

function psFillFromMatchedUser(matchedUser, lastId, firstId, midId, hcpId, genderId, teeId) {
    if (!matchedUser) return;
    var parts = (typeof resolvePlayerNameParts === 'function')
        ? resolvePlayerNameParts(matchedUser)
        : matchedUser;
    var lastEl = lastId ? psEl(lastId) : null;
    var firstEl = firstId ? psEl(firstId) : null;
    var midEl = midId ? psEl(midId) : null;
    var hcpEl = hcpId ? psEl(hcpId) : null;
    var gEl = genderId ? psEl(genderId) : null;
    var tEl = teeId ? psEl(teeId) : null;
    if (lastEl) lastEl.value = parts.lastName || '';
    if (firstEl) firstEl.value = parts.firstName || '';
    if (midEl) midEl.value = parts.middleName || '';
    if (hcpEl && matchedUser.handicap != null) {
        hcpEl.value = (typeof fmtExactHcp === 'function') ? fmtExactHcp(matchedUser.handicap) : String(matchedUser.handicap);
    }
    if (gEl && matchedUser.gender) gEl.value = matchedUser.gender;
    if (tEl) {
        if (matchedUser.defaultTee) tEl.value = matchedUser.defaultTee;
        else if (matchedUser.gender === 'women') tEl.value = 'rd';
    }
}

function psAttachPlayerAutofill() {
    if (typeof initPlayerSearchAutofill !== 'function') return;
    ['ps-m-last', 'ps-m-first', 'ps-m-mid'].forEach(function(id) {
        if (!psEl(id)) return;
        initPlayerSearchAutofill({
            searchInputId: id,
            onSelect: function(matchedUser) {
                psFillFromMatchedUser(matchedUser, 'ps-m-last', 'ps-m-first', 'ps-m-mid', 'ps-m-hcp', 'ps-m-gender', 'ps-m-tee');
            }
        });
    });
    var groups = psState.groups || [];
    groups.forEach(function(_, gi) {
        var fioId = 'ps-ga-fio-' + gi;
        if (!psEl(fioId)) return;
        initPlayerSearchAutofill({
            searchInputId: fioId,
            onSelect: function(matchedUser) {
                var parts = (typeof resolvePlayerNameParts === 'function')
                    ? resolvePlayerNameParts(matchedUser)
                    : matchedUser;
                var fioEl = psEl(fioId);
                if (fioEl) {
                    var rus = [parts.lastName, parts.firstName, parts.middleName]
                        .filter(function(w) { return String(w || '').trim(); }).join(' ');
                    fioEl.value = rus || matchedUser.name || '';
                }
                var hcpEl = psEl('ps-ga-hcp-' + gi);
                if (hcpEl && matchedUser.handicap != null) {
                    hcpEl.value = (typeof fmtExactHcp === 'function') ? fmtExactHcp(matchedUser.handicap) : String(matchedUser.handicap);
                }
                var gEl = psEl('ps-ga-gender-' + gi);
                if (gEl && matchedUser.gender) gEl.value = matchedUser.gender;
                var tEl = psEl('ps-ga-tee-' + gi);
                if (tEl) {
                    if (matchedUser.defaultTee) tEl.value = matchedUser.defaultTee;
                    else if (matchedUser.gender === 'women') tEl.value = 'rd';
                }
            }
        });
    });
}

function psRenderHelpCard() {
    return '<div class="card" style="margin-bottom:20px;">' +
        '<h2 style="margin-top:0;"><i class="fas fa-flag-checkered"></i> ' + psL('Стартовый протокол турнира', 'Tournament start protocol') + '</h2>' +
        '<p style="color:var(--muted);font-size:13px;margin-bottom:0;">' +
        psL('Соберите список игроков турнира (вручную, из регистрации или из Excel — заголовки таблица найдёт сама), распределите их на группы по 1–4 человека, ' +
            'укажите ТИ у каждого, время, лунку и формат группы — система рассчитает полевой гандикап и назначит маркеров (их можно поменять вручную). ' +
            'После сохранения у каждого игрока будет один QR-код: в группе он открывает общую карточку (свой счёт и счёт маркируемого партнёра). ' +
            'Сохранённый протокол можно отредактировать позже — раунды обновятся «на месте», и игрокам не придётся сканировать новые QR.',
            'Build the tournament start list (manually, from registrations or Excel — headers are detected automatically), split players into groups of 1–4. Set each player’s tee, group time, hole and format — course handicaps are calculated and markers assigned (adjustable manually). After saving, each player gets a single QR code: in a group it opens the shared scorecard (own score and the marked partner’s score). A saved protocol can be edited later — rounds update in place, and no new QR codes are needed.') +
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

    html += '<div class="form-row form-row-3">';
    html += '<div class="form-group"><label>' + psL('Название протокола', 'Protocol name') + '</label>' +
        '<input type="text" id="ps-name" class="form-input"' + disabled + ' value="' + (proto.name || '').replace(/"/g, '&quot;') + '" onchange="psField(\'name\', this.value)"></div>';
    html += '<div class="form-group"><label>' + psL('Дата', 'Date') + '</label>' +
        '<input type="date" id="ps-date" class="form-input"' + disabled + ' value="' + (proto.date || '') + '" onchange="psField(\'date\', this.value)"></div>';
    html += '</div>';

    // Форматы игры — можно выбрать НЕСКОЛЬКО (например Stableford + Gross).
    var resolvedFmts = psResolvedFormats();
    html += '<div class="form-row">';
    html += '<div class="form-group" style="flex:0 1 240px;"><label>' + psL('ТИ по умолчанию (для новых игроков)', 'Default tee (for new players)') + '</label>' +
        '<select id="ps-tee" class="form-input"' + disabled + ' onchange="psField(\'tee\', this.value)">' + teesOptions + '</select></div>';
    html += '<div class="form-group" style="flex:1 1 320px;"><label>' +
        '<i class="fas fa-check-double"></i> ' + psL('Форматы игры (можно выбрать несколько)', 'Game formats (multiple allowed)') +
        (tournament ? ' <span style="color:var(--muted);font-weight:400;font-size:11px;">' + psL('— форматы турнира', '— tournament formats') + '</span>' : '') +
        '</label>' + psFormatChipsHtml(proto) +
        '<div style="font-size:11px;color:var(--muted);margin-top:6px;"><i class="fas fa-circle-info"></i> ' +
        psL('Результаты будут вестись по каждому выбранному формату. Сейчас: ', 'Results will be kept for every selected format. Currently: ') +
        '<b style="color:var(--gold);">' + resolvedFmts.map(function(f) { return String(f).replace(/</g, '&lt;'); }).join(' + ') + '</b></div></div>';
    html += '<div class="form-group" style="flex:0 1 250px;"><label>' + psL('Свой формат (добавится к выбранным)', 'Custom format (added to the selected ones)') + '</label>' +
        '<input type="text" id="ps-format-custom" class="form-input"' + disabled + ' placeholder="' + psL('например: Гросс, 2 из 4 лучших', 'e.g. Gross, best 2 of 4') + '" value="' + (proto.formatCustom || '').replace(/"/g, '&quot;') + '" onchange="psField(\'formatCustom\', this.value)"></div>';
    html += '</div>';

    if (!tournament) {
        html += '<div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.35);border-radius:10px;padding:10px 14px;font-size:12px;color:var(--muted);margin-top:6px;">' +
            psL('Протокол привязывается к турниру: именно его зарегистрированные игроки, форматы и ТИ будут использованы. Протоколы без турнира создавать нельзя.',
                'A start protocol is linked to a tournament: its registered players, formats and tees are used. Protocols without a tournament cannot be created.') +
            '</div>';
    } else {
        html += psRenderCutBox(proto);
    }
    html += '</div>';
    return html;
}

// Блок «Обрезка гандикапа» — только для текущего турнира.
// Порядок: сначала процент, затем максимум по полу
// (например 36 → 90% = 32.4 → макс. 28 = 28.0).
// Процент и максимум включаются независимо — можно резать только процентами,
// только максимумом по полу или и тем, и другим сразу.
function psRenderCutBox(proto) {
    proto = proto || {};
    var cutOn = proto.hcpCutEnabled === true;
    var maxOn = proto.hcpCutMaxEnabled === true;
    var pct = (proto.hcpCutPercent === '' || proto.hcpCutPercent == null) ? 90 : proto.hcpCutPercent;
    var maxM = (proto.hcpMaxMen === '' || proto.hcpMaxMen == null) ? '' : proto.hcpMaxMen;
    var maxW = (proto.hcpMaxWomen === '' || proto.hcpMaxWomen == null) ? '' : proto.hcpMaxWomen;
    var html = '<div class="ps-cut-box">';
    html += '<h4><i class="fas fa-scissors"></i> ' + psL('Обрезка гандикапа (только для этого турнира)', 'Handicap cut (this tournament only)') + '</h4>';
    html += '<div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px;">';
    html += '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--white);font-weight:700;">' +
        '<input type="checkbox" id="ps-cut-enabled" ' + (cutOn ? 'checked' : '') + ' onchange="psCutField(\'hcpCutEnabled\', this.checked)" style="width:20px;height:20px;cursor:pointer;"> ' +
        psL('✂ Обрезать на процент', '✂ Cut by percent') + '</label>';
    html += '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--white);font-weight:700;">' +
        '<input type="checkbox" id="ps-cut-max-enabled" ' + (maxOn ? 'checked' : '') + ' onchange="psCutField(\'hcpCutMaxEnabled\', this.checked)" style="width:20px;height:20px;cursor:pointer;"> ' +
        psL('✂ Ограничить максимум по полу', '✂ Cap by gender max') + '</label>';
    html += '</div>';
    html += '<div class="form-row form-row-3">';
    html += '<div class="form-group"><label>' + psL('Процент (например 90 = 90%)', 'Percent (e.g. 90 = 90%)') + '</label>' +
        '<input type="number" id="ps-cut-percent" class="form-input" min="1" max="100" step="1" value="' + pct + '" ' + (cutOn ? '' : 'disabled') + ' onchange="psCutField(\'hcpCutPercent\', this.value)"></div>';
    html += '<div class="form-group"><label>' + psL('Макс. точный HCP — мужчины', 'Max exact HCP — men') + '</label>' +
        '<input type="text" id="ps-cut-maxmen" class="form-input" placeholder="' + psL('без лимита', 'no limit') + '" value="' + String(maxM).replace(/"/g, '&quot;') + '" ' + (maxOn ? '' : 'disabled') + ' oninput="psCutMaxAutocheck()" onchange="psCutField(\'hcpMaxMen\', this.value)"></div>';
    html += '<div class="form-group"><label>' + psL('Макс. точный HCP — девушки', 'Max exact HCP — women') + '</label>' +
        '<input type="text" id="ps-cut-maxwomen" class="form-input" placeholder="' + psL('без лимита', 'no limit') + '" value="' + String(maxW).replace(/"/g, '&quot;') + '" ' + (maxOn ? '' : 'disabled') + ' oninput="psCutMaxAutocheck()" onchange="psCutField(\'hcpMaxWomen\', this.value)"></div>';
    html += '</div>';
    html += '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px;">';
    html += '<button class="btn btn-g btn-sm" onclick="psCutApply()"><i class="fas fa-check"></i> ' + psL('Применить', 'Apply') + '</button>';
    var aff = psCutAffectedCount();
    if (aff.total) {
        html += '<span style="font-size:12px;color:var(--muted);"><i class="fas fa-users"></i> ' +
            psL('Затронет игроков стартового листа', 'Affects start-list players') + ': <b style="color:var(--gold);">' + aff.hit + ' / ' + aff.total + '</b></span>';
    }
    html += '</div>';
    html += '<p style="font-size:11px;color:var(--muted);margin:8px 0 0;"><i class="fas fa-circle-info"></i> ' +
        psL('Сначала применяется процент, затем максимум по полу. Полевой гандикап считается от обрезанного точного. Пример: точный 36 → 90% = 32.4 → макс. 28 → играет с 28.0. После «Применить» стартовый лист и группы пересчитаются сразу.',
            'The percent applies first, then the gender max. Course handicap is calculated from the cut exact value. Example: exact 36 → 90% = 32.4 → max 28 → plays off 28.0. “Apply” recalculates the start list and groups immediately.') + '</p>';
    html += '</div>';
    return html;
}

// Сколько игроков текущего стартового листа изменит обрезка (для подписи).
function psCutAffectedCount() {
    var total = 0, hit = 0;
    try {
        var players = (psState.proto && psState.proto.players) || [];
        var seen = {};
        function scan(p) {
            if (!p || p.hcp === null || p.hcp === undefined || p.hcp === '') return;
            var k = p.id || (psKeyOf(p) + '|' + p.hcp);
            if (seen[k]) return;
            seen[k] = true;
            total++;
            var raw = parseFloat(p.hcp);
            if (!isNaN(raw) && Math.abs(psEffectiveExact(p) - raw) >= 0.049) hit++;
        }
        players.forEach(scan);
        ((psState.groups) || []).forEach(function(g) { (g.members || []).forEach(scan); });
    } catch (e) {}
    return { hit: hit, total: total };
}

// Изменение настроек обрезки: только перерисовка (состав групп не меняется,
// полевые гандикапы пересчитаются автоматически при отображении и сохранении).
function psCutField(field, val) {
    if (!psState.proto) return;
    if (field === 'hcpCutEnabled') psState.proto.hcpCutEnabled = (val === true || val === 'true' || val === 'on');
    else if (field === 'hcpCutMaxEnabled') psState.proto.hcpCutMaxEnabled = (val === true || val === 'true' || val === 'on');
    else if (field === 'hcpCutPercent') {
        var n = parseFloat(val);
        psState.proto.hcpCutPercent = isNaN(n) ? 100 : Math.max(1, Math.min(100, n));
    } else if (field === 'hcpMaxMen' || field === 'hcpMaxWomen') {
        var s = String(val == null ? '' : val).trim().replace(',', '.');
        if (s === '') psState.proto[field] = '';
        else {
            var m = parseFloat(s);
            psState.proto[field] = isNaN(m) ? '' : m;
        }
    }
    psRender();
}

// Если начали вводить максимум — сразу включаем галочку «максимум по полу».
function psCutMaxAutocheck() {
    try {
        var cb = psEl('ps-cut-max-enabled');
        if (cb && !cb.checked) cb.checked = true;
    } catch (e) {}
}

// Кнопка «Применить»: забирает значения прямо из полей (даже если фокус ещё
// в поле ввода) и сразу пересчитывает стартовый лист и группы.
function psCutApply() {
    if (!psState.proto) return;
    try {
        var enCb = psEl('ps-cut-enabled');
        var maxCb = psEl('ps-cut-max-enabled');
        var pctEl = psEl('ps-cut-percent');
        var mmEl = psEl('ps-cut-maxmen');
        var mwEl = psEl('ps-cut-maxwomen');
        if (enCb) psState.proto.hcpCutEnabled = !!enCb.checked;
        if (maxCb) psState.proto.hcpCutMaxEnabled = !!maxCb.checked;
        if (pctEl) {
            var n = parseFloat(pctEl.value);
            psState.proto.hcpCutPercent = isNaN(n) ? 100 : Math.max(1, Math.min(100, n));
        }
        [['hcpMaxMen', mmEl], ['hcpMaxWomen', mwEl]].forEach(function(pair) {
            if (!pair[1]) return;
            var s = String(pair[1].value == null ? '' : pair[1].value).trim().replace(',', '.');
            if (s === '') psState.proto[pair[0]] = '';
            else {
                var m = parseFloat(s);
                psState.proto[pair[0]] = isNaN(m) ? '' : m;
            }
        });
    } catch (e) {}
    psRender();
    var aff = psCutAffectedCount();
    var parts = [];
    if (psState.proto.hcpCutEnabled) parts.push(psState.proto.hcpCutPercent + '%');
    if (psState.proto.hcpCutMaxEnabled) {
        var lims = [];
        if (psState.proto.hcpMaxMen !== '' && psState.proto.hcpMaxMen != null) lims.push(psL('муж', 'men') + ' ≤ ' + psState.proto.hcpMaxMen);
        if (psState.proto.hcpMaxWomen !== '' && psState.proto.hcpMaxWomen != null) lims.push(psL('жен', 'women') + ' ≤ ' + psState.proto.hcpMaxWomen);
        parts.push(psL('макс', 'max') + (lims.length ? ' (' + lims.join(', ') + ')' : ''));
    }
    if (!parts.length) toast(psL('✂ Обрезка выключена — стартовый лист без изменений', '✂ Cut is off — start list unchanged'), 'info');
    else toast(psL('✂ Обрезка применена (' + parts.join(' + ') + '): затронуто ' + aff.hit + ' из ' + aff.total, '✂ Cut applied (' + parts.join(' + ') + '): affects ' + aff.hit + ' of ' + aff.total), 'success');
}

function psFormatsSelectedList(proto) {
    var out = [];
    function add(f) {
        f = String(f == null ? '' : f).trim();
        if (f && f !== '__custom__' && out.indexOf(f) === -1) out.push(f);
    }
    (proto && proto.formats ? proto.formats : []).forEach(add);
    // Старые черновики, где хранился только одиночный format
    if (proto && (!proto.formats || !proto.formats.length) && proto.format && proto.format !== '__custom__') add(proto.format);
    return out;
}

function psResolvedFormats() {
    var proto = (typeof psState !== 'undefined' && psState) ? psState.proto : null;
    var out = psFormatsSelectedList(proto);
    // Свой текстовый формат автоматически добавляется к выбранным, пока заполнен
    if (proto && proto.formatCustom && String(proto.formatCustom).trim()) {
        var c = String(proto.formatCustom).trim();
        if (out.indexOf(c) === -1) out.push(c);
    }
    return out.length ? out : ['Stroke Play'];
}

// Первый (основной) формат — для совместимости со старыми полями format.
function psResolvedFormat() {
    var list = psResolvedFormats();
    return list[0] || 'Stroke Play';
}

// Чипы-переключатели форматов (можно выбрать несколько).
function psFormatChipsHtml(proto) {
    var tournament = psGetSelTournament();
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    function labelOf(f) {
        if (f === 'Stroke Play') return psL('Stroke Play (гросс)', 'Stroke Play (gross)');
        if (f === 'Stableford') return psL('Stableford (очки)', 'Stableford (points)');
        if (f === 'Match Play 1v1') return psL('Match Play (1×1)', 'Match Play (1v1)');
        return f;
    }
    var candidates = [];
    function add(f) {
        f = String(f == null ? '' : f).trim();
        if (f && f !== '__custom__' && candidates.indexOf(f) === -1) candidates.push(f);
    }
    (tournament ? tournament.formats : []).forEach(add);
    ['Stroke Play', 'Stableford', 'Match Play 1v1', 'Match Play 2v2', 'Scramble', 'Texas Scramble', 'Greensomes'].forEach(add);
    (proto.formats || []).forEach(add);
    if (proto.format && proto.format !== '__custom__') add(proto.format);

    var sel = psFormatsSelectedList(proto);
    var usable = !!tournament;
    var html = '<div id="ps-formats-chips" style="display:flex;flex-wrap:wrap;gap:6px;">';
    candidates.forEach(function(f) {
        var on = sel.indexOf(f) !== -1;
        html += '<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;' +
            'border:1px solid ' + (on ? 'var(--gold)' : 'var(--border)') + ';' +
            'background:' + (on ? 'rgba(201,168,76,0.18)' : 'var(--input)') + ';' +
            'border-radius:999px;padding:5px 12px;font-size:12.5px;font-weight:600;' +
            (usable ? '' : 'opacity:.5;pointer-events:none;') + '">' +
            '<input type="checkbox" value="' + esc(f) + '"' + (on ? ' checked' : '') +
            (usable ? '' : ' disabled') +
            ' onchange="psFormatToggle(this.value, this.checked)" style="width:15px;height:15px;cursor:pointer;"> ' +
            esc(labelOf(f)) + '</label>';
    });
    html += '</div>';
    return html;
}

// Переключение формата в блоке 1 (мультивыбор).
function psFormatToggle(val, checked) {
    if (!psState.proto) return;
    val = String(val == null ? '' : val).trim();
    if (!val) return;
    var list = psFormatsSelectedList(psState.proto);
    var idx = list.indexOf(val);
    if (checked) {
        if (idx === -1) list.push(val);
    } else {
        if (idx !== -1) list.splice(idx, 1);
    }
    if (!list.length) {
        toast(psL('⚠️ Выберите хотя бы один формат игры', '⚠️ Select at least one game format'), 'warn');
        psRender(); // возвращаем визуальное состояние
        return;
    }
    psState.proto.formats = list;
    psState.proto.format = list[0]; // первый — основной
    if (psState.groups && psState.groups.length) {
        if (!psConfirmGroupReset()) { psRender(); return; }
        psState.groups = [];
        psExitEditModeSoft();
    }
    psRender();
}

function psConfirmGroupReset() {
    if (!psState.groups || !psState.groups.length) return true;
    var manual = !!psState.editingId;
    psState.groups.forEach(function(g) { if (g.dirty || g.roundId) manual = true; });
    if (!manual) return true;
    return confirm(psL('Изменение настроек сбросит текущую разбивку групп, включая ручные правки и маркеров. Продолжить?', 'Changing the settings will reset the current grouping, including manual edits and markers. Continue?'));
}

function psField(field, val) {
    if (!psState.proto) return;
    if (field === 'name' || field === 'date' || field === 'formatCustom' || field === 'format' || field === 'scheme' || field === 'tee' || field === 'startTime') {
        psState.proto[field] = String(val || '');
        if (field === 'format' && val && val !== '__custom__') {
            // одиночный выбор (старый код/совместимость) → синхронизируем список
            var list = psFormatsSelectedList(psState.proto);
            if (list.indexOf(String(val)) === -1) list.push(String(val));
            psState.proto.formats = list;
        }
        if (field === 'date' && val && !psState.proto.name) {
            var tn = psGetSelTournament();
            if (tn) psState.proto.name = tn.name + ' · ' + psL('старт', 'start');
        }
    } else if (field === 'interval' || field === 'size') {
        var num = parseInt(val, 10);
        if (isNaN(num)) return;
        psState.proto[field] = num;
    } else if (field === 'method') {
        psState.proto.method = val;
    }
    if (psState.groups.length) { // настройки изменились — раскладку нужно пересчитать
        if (!psConfirmGroupReset()) { psRender(); return; }
        psState.groups = [];
        psExitEditModeSoft();
    }
    psRender();
}

function psGetSelTournament() {
    if (!psState.selId) return null;
    for (var i = 0; i < psState.tournaments.length; i++) {
        if (psState.tournaments[i].id === psState.selId) return psState.tournaments[i];
    }
    return null;
}

function psOnTournamentChange(id) {
    if (psState.editingId && String(psState.proto && psState.proto.tournamentId) !== String(id)) {
        if (!confirm(psL('Сменить турнир? Правка сохранённого протокола будет отменена (изменения не сохранятся).', 'Switch tournament? Editing of the saved protocol will be cancelled (changes will not be saved).'))) {
            psRender();
            return;
        }
        psExitEditModeSoft();
    }
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
        if (t.formats && t.formats.length) {
            // По умолчанию отмечаем ВСЕ форматы турнира (можно снять лишние)
            psState.proto.formats = t.formats.slice();
            psState.proto.format = t.formats[0]; // основной — первый
        }
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
    html += '<div class="card" id="ps-roster-card" style="margin-bottom:20px;">';
    html += '<h2 style="margin-top:0;"><i class="fas fa-users"></i> ' + psL('2. Участники стартового листа', '2. Start list players') +
        ' <span style="color:var(--gold);font-size:15px;">(' + (proto ? proto.players.length : 0) + ')</span></h2>';

    if (psState.editingId) {
        html += '<p style="background:rgba(90,173,224,0.08);border:1px solid rgba(90,173,224,0.4);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--muted);margin:0 0 12px;">' +
            '<i class="fas fa-circle-info" style="color:var(--blue);"></i> ' +
            psL('Редактируется сохранённый протокол: ниже сразу показаны все заявленные на турнир участники, которых ещё нет в группах (блок 3). Добавленные здесь участники попадут в общий список — их можно перенести в любую группу кнопкой «В группу…».',
                'Editing a saved protocol: everyone registered for the tournament who is not yet in a group is shown here at once; distributed players live in the groups (block 3). Players added here go to the shared roster — move them into any group with “Into group…”.') + '</p>';
    }

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
    html += '<button class="btn btn-g btn-sm" onclick="psSaveRosterToTournament()"><i class="fas fa-cloud-arrow-up"></i> ' + psL('Сохранить список на турнир', 'Save roster to tournament') + '</button>';
    html += '<button class="btn btn-r btn-sm" onclick="psClearPlayers()"><i class="fas fa-trash"></i> ' + psL('Очистить список', 'Clear list') + '</button>';
    html += '</div>';

    // ручное добавление (скрытая форма)
    html += '<div id="ps-manual-form" class="hidden" style="background:var(--input);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">';
    html += '<h3 style="color:var(--gold);font-size:14px;margin:0 0 10px;"><i class="fas fa-user-pen"></i> ' + psL('Новый игрок', 'New player') + '</h3>';
    html += '<div class="form-row form-row-3">';
    html += '<div class="form-group"><label>' + psL('Фамилия', 'Last name') + '</label><input type="text" id="ps-m-last" class="form-input" oninput="psManualFioAuto()" placeholder="' + psL('Тестов', 'Smith') + '"></div>';
    html += '<div class="form-group"><label>' + psL('Имя', 'First name') + '</label><input type="text" id="ps-m-first" class="form-input" oninput="psManualFioAuto()" placeholder="' + psL('Иван', 'John') + '"></div>';
    html += '<div class="form-group"><label>' + psL('Отчество (если есть)', 'Middle name (optional)') + '</label><input type="text" id="ps-m-mid" class="form-input" oninput="psManualFioAuto()" placeholder="' + psL('Петрович', '') + '"></div>';
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

// Авто-подстановка пола и ТИ при ручном вводе ФИО: женское имя/фамилия/отчество
// сразу переключают форму на «Женщина» и женские ТИ (красные/белые по группе).
function psManualFioAuto() {
    try {
        var last = (psEl('ps-m-last') || {}).value || '';
        var first = (psEl('ps-m-first') || {}).value || '';
        var mid = (psEl('ps-m-mid') || {}).value || '';
        if (!String(first + last + mid).replace(/\s+/g, '')) return;
        var gEl = psEl('ps-m-gender');
        if (!gEl) return;
        var guess = psGuessGender(last, first, mid);
        if (guess === 'women' && gEl.value !== 'women') {
            gEl.value = 'women';
            var tEl = psEl('ps-m-tee');
            if (tEl) {
                var hcpEl = psEl('ps-m-hcp');
                var hv = hcpEl ? psParseHcp(hcpEl.value) : null;
                tEl.value = psDefaultTeeFor('women', hv);
            }
            toast(psL('👩 Похоже на женское имя — подставлены пол «Женщина» и женские ТИ', '👩 Looks like a feminine name — gender and ladies tees set'), 'info');
        }
    } catch (e) {}
}

// То же для формы «Игрок в эту группу»: ФИО одной строкой.
function psGroupFioAuto(gi) {
    try {
        var fioEl = psEl('ps-ga-fio-' + gi);
        if (!fioEl || !String(fioEl.value || '').trim()) return;
        var parsed = psSplitFio(fioEl.value);
        var gEl = psEl('ps-ga-gender-' + gi);
        if (!gEl) return;
        var guess = psGuessGender(parsed.lastName, parsed.firstName, parsed.middleName);
        if (guess === 'women' && gEl.value !== 'women') {
            gEl.value = 'women';
            var tEl = psEl('ps-ga-tee-' + gi);
            if (tEl) {
                var hcpEl = psEl('ps-ga-hcp-' + gi);
                var hv = hcpEl ? psParseHcp(hcpEl.value) : null;
                tEl.value = psDefaultTeeFor('women', hv);
            }
        }
    } catch (e) {}
}

function psRosterRowHtml(p, idx) {
    // Если у турнира включена обрезка и она сработала — в поле «Точный HCP»
    // показываем ОБРЕЗАННЫЙ гандикап: именно от него считаются полевой HCP
    // и группа. Подсказка-«ножницы» у имени объясняет, откуда взялось число.
    var rawHcp = (p.hcp === null || p.hcp === undefined || p.hcp === '') ? null : parseFloat(p.hcp);
    if (rawHcp !== null && isNaN(rawHcp)) rawHcp = null;
    var effHcp = (rawHcp === null) ? null : psEffectiveExact(p);
    var cutApplied = (rawHcp !== null && effHcp !== null && Math.abs(effHcp - rawHcp) >= 0.049);
    var hcpVal = (rawHcp === null) ? '' : psHcpFmt(cutApplied ? effHcp : rawHcp).replace(/\+/g, '+');
    var hcpTitle = cutApplied
        ? psL('Точный HCP после обрезки: ' + psHcpFmt(rawHcp) + ' → ' + psHcpFmt(effHcp) + '. Полевой HCP и группа считаются от ' + psHcpFmt(effHcp) + '.',
              'Exact HCP after cut: ' + psHcpFmt(rawHcp) + ' → ' + psHcpFmt(effHcp) + '. Course HCP and group are calculated from ' + psHcpFmt(effHcp) + '.')
        : psL('Точный HCP', 'Exact HCP');
    var hcpInput = '<input type="text" class="form-input ps-rrow-inp' + (cutApplied ? ' ps-rrow-cut' : '') + '" value="' + hcpVal.replace(/"/g, '&quot;') + '" ' +
        'onchange="psRowHcp(' + idx + ', this.value)" placeholder="13.0" title="' + hcpTitle.replace(/"/g, '&quot;') + '">' +
        (cutApplied ? ' <i class="fas fa-scissors" style="color:var(--gold);font-size:11px;" title="' + psL('Гандикап обрезан настройками турнира', 'Handicap cut by tournament settings').replace(/"/g, '&quot;') + '"></i>' : '');
    var fieldHcp = psCalcFieldHcp(p);
    var fieldChip = '<span class="hcp-chip hcp-band-' + (fieldHcp <= 0 ? 'plus' : fieldHcp <= 10 ? '1-10' : fieldHcp <= 20 ? '11-20' : fieldHcp <= 36 ? '21-36' : '37') + ' ps-rrow-chip" title="' + psL('Полевой HCP (авто)', 'Course HCP (auto)') + '">' +
        psL('Полевой', 'Course') + ' ' + fmtFieldHcp(fieldHcp) + '</span>';

    var genderSel = '<select class="form-input ps-rrow-sel" onchange="psRowGender(' + idx + ', this.value)" title="' + psL('Пол', 'Gender') + '">' +
        '<option value="men"' + (p.gender === 'men' ? ' selected' : '') + '>👨 ' + psL('Мужчина', 'Male') + '</option>' +
        '<option value="women"' + (p.gender === 'women' ? ' selected' : '') + '>👩 ' + psL('Женщина', 'Female') + '</option></select>';

    var teeSel = '<select class="form-input ps-rrow-sel" onchange="psRowTee(' + idx + ', this.value)" title="' + psL('ТИ', 'Tee') + '">' + psTeeOptionsHtml(p.tee) + '</select>';

    var fio = '<b class="ps-rrow-name">' + escapeHtml(psFullRus(p) || '?') + '</b>';
    if (p.uidMatched) {
        fio += ' <span class="hcp-chip" style="background:rgba(46,204,113,.18);border-color:rgba(46,204,113,.5);color:#2ecc71;" title="' + psL('Найден аккаунт игрока — раунд появится в его профиле', 'Player account matched — the round will appear in their profile') + '"><i class="fas fa-circle-check"></i></span>';
    }
    var cutHint = psCutHintHtml(p);
    if (cutHint) fio += cutHint;
    var divChip = psDivisionChipHtml(p);
    if (divChip) fio += ' ' + divChip;
    var srcTxt = p.source === 'registered' ? psL('регистрация', 'registration') : p.source === 'excel' ? psL('Excel', 'Excel') : psL('вручную', 'manual');
    var rowHtml = '<div class="list-item ps-rrow">';

    rowHtml += '<div class="ps-rrow-main">' + fio +
        '<div class="ps-rrow-src"><i class="fas fa-tag"></i> ' + srcTxt + '</div>' +
        '</div>';

    rowHtml += '<div class="ps-rrow-ctrls">';
    rowHtml += hcpInput + fieldChip + genderSel + teeSel;
    rowHtml += '</div>';

    rowHtml += '<div class="ps-rrow-actions">';
    if (psState.groups && psState.groups.length) {
        var toG = '';
        psState.groups.forEach(function(g2, gj) {
            if ((g2.members || []).length >= 4) return;
            toG += '<option value="' + gj + '">→ ' + psGroupTitle(g2, gj) + '</option>';
        });
        toG += '<option value="new">＋ ' + psL('Новая группа', 'New group') + '</option>';
        rowHtml += '<select class="form-input ps-rrow-sel" title="' + psL('Отправить игрока сразу в группу', 'Send the player straight into a group') + '" onchange="if(this.value!==\'\')psRosterToGroup(' + idx + ',this.value)">' +
            '<option value="">' + psL('В группу…', 'Into group…') + '</option>' + toG + '</select>';
    }
    rowHtml += '<button class="btn btn-ol btn-sm ps-rrow-btn" title="' + psL('Выше', 'Up') + '" onclick="psMovePlayer(' + idx + ',-1)"><i class="fas fa-arrow-up"></i></button>' +
        '<button class="btn btn-ol btn-sm ps-rrow-btn" title="' + psL('Ниже', 'Down') + '" onclick="psMovePlayer(' + idx + ',1)"><i class="fas fa-arrow-down"></i></button>' +
        '<button class="btn btn-r btn-sm ps-rrow-btn" title="' + psL('Удалить', 'Delete') + '" onclick="psRemovePlayer(' + idx + ')"><i class="fas fa-trash"></i></button>' +
        '</div>';
    rowHtml += '</div>';
    return rowHtml;
}

// Полоса гандикапа для авто-групп стартового листа (когда у турнира нет своих групп).
function psAutoHcpBand(eff) {
    if (eff === null || eff === undefined || isNaN(eff)) return { key: 'na', title: '—' };
    if (eff <= 0) return { key: 'plus', title: '+ / 0' };
    if (eff <= 12) return { key: '0-12', title: '0–12' };
    if (eff <= 20) return { key: '12-20', title: '12.1–20' };
    if (eff <= 28) return { key: '20-28', title: '20.1–28' };
    if (eff <= 36) return { key: '28-36', title: '28.1–36' };
    return { key: '36p', title: '36+' };
}

// Стартовый лист, разбитый на группы по полу и гандикапу С УЧЁТОМ обрезки:
// если у турнира заданы свои группы (дивизионы) — раскладываем по ним,
// иначе строим авто-группы «пол + полоса HCP».
function psRosterGroups(players) {
    var tn = null;
    try { tn = psGetSelTournament(); } catch (e) { tn = null; }
    var divs = [];
    try { divs = (tn && tn.divisions && typeof tnNormalizeDivisions === 'function') ? tnNormalizeDivisions(tn) : []; } catch (e) { divs = []; }
    var useDivs = !!(divs && divs.length && typeof tnFindDivision === 'function');
    var buckets = [];
    var byKey = {};

    function bucket(key, title, sub) {
        if (!byKey[key]) {
            var b = { key: key, title: title, sub: sub || '', items: [] };
            byKey[key] = b;
            buckets.push(b);
        }
        return byKey[key];
    }

    (players || []).forEach(function(p, idx) {
        var gender = (p && p.gender) || 'men';
        var eff = (p && p.hcp !== null && p.hcp !== undefined && p.hcp !== '') ? psEffectiveExact(p) : null;
        if (useDivs) {
            var d = (eff === null) ? null : tnFindDivision(tn, eff, gender);
            if (d && d.name) {
                var rg = (typeof tnDivisionRangeText === 'function') ? tnDivisionRangeText(d) : '';
                var teeTxt = d.tee ? (' · ' + psTeeName(d.tee)) : '';
                bucket('div:' + (d.id || d.name), d.name, (rg ? 'HCP ' + rg : '') + teeTxt).items.push({ p: p, idx: idx });
            } else {
                bucket('none', psL('Без группы', 'Without group'), '').items.push({ p: p, idx: idx });
            }
        } else {
            var band = psAutoHcpBand(eff === null ? NaN : eff);
            var gTxt = gender === 'women' ? ('👩 ' + psL('Девушки', 'Women')) : ('👨 ' + psL('Мужчины', 'Men'));
            var key = 'auto:' + gender + ':' + band.key;
            var order = (gender === 'women' ? '1' : '0') + band.key;
            var b = bucket(key, gTxt + ' · HCP ' + band.title, '');
            b.order = order;
            b.items.push({ p: p, idx: idx });
        }
    });

    if (!useDivs) {
        buckets.sort(function(a, b) { return String(a.order || '').localeCompare(String(b.order || '')); });
    } else {
        // «Без группы» — всегда в конце.
        buckets.sort(function(a, b) {
            if (a.key === 'none') return 1;
            if (b.key === 'none') return -1;
            return 0;
        });
    }
    return { buckets: buckets, useDivs: useDivs };
}

function psRosterGroupDomId(key) {
    return 'ps-rg-' + String(key || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function psToggleRosterGroup(key) {
    if (!psState.rosterCollapsed) psState.rosterCollapsed = {};
    psState.rosterCollapsed[key] = !psState.rosterCollapsed[key];
    var collapsed = !!psState.rosterCollapsed[key];
    try {
        var body = document.getElementById(psRosterGroupDomId(key));
        var icon = document.getElementById(psRosterGroupDomId(key) + '-icon');
        if (body) body.classList.toggle('hidden', collapsed);
        if (icon) icon.className = collapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
    } catch (e) {}
}

function psRosterExpandAll(expand) {
    try {
        var groups = psRosterGroups(psState.proto ? psState.proto.players : []);
        if (!psState.rosterCollapsed) psState.rosterCollapsed = {};
        groups.buckets.forEach(function(b) { psState.rosterCollapsed[b.key] = !expand; });
    } catch (e) {}
    psRender();
}

function psRenderRosterTable(proto) {
    var players = proto ? proto.players : [];
    if (!players.length) {
        return '<p style="color:var(--muted);font-size:13px;margin:0;"><i class="fas fa-circle-info"></i> ' +
            psL('Список пуст. Загрузите участников из регистрации турнира, импортируйте Excel или добавьте вручную.', 'List is empty. Load players from the tournament registration, import an Excel file or add them manually.') + '</p>';
    }
    var grouped = psRosterGroups(players);
    var cutActive = false;
    try {
        cutActive = (psCutAffectedCount().hit > 0);
    } catch (e) {}
    var html = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">';
    html += '<span style="font-size:11.5px;color:var(--muted);"><i class="fas fa-layer-group"></i> ' +
        (grouped.useDivs
            ? psL('Группы турнира', 'Tournament groups')
            : psL('Авто-группы: пол + гандикап', 'Auto groups: gender + handicap')) +
        (cutActive ? ' ' + psL('(с учётом обрезки ✂)', '(with cut ✂)') : '') + '</span>';
    html += '<span style="flex:1;"></span>';
    html += '<button class="btn btn-ol btn-sm" style="padding:3px 10px;font-size:11px;" onclick="psRosterExpandAll(true)"><i class="fas fa-chevrons-up"></i> ' + psL('Развернуть все', 'Expand all') + '</button>';
    html += '<button class="btn btn-ol btn-sm" style="padding:3px 10px;font-size:11px;" onclick="psRosterExpandAll(false)"><i class="fas fa-chevrons-down"></i> ' + psL('Свернуть все', 'Collapse all') + '</button>';
    html += '</div>';

    html += '<div style="display:flex;flex-direction:column;gap:8px;">';
    grouped.buckets.forEach(function(b) {
        var collapsed = !!(psState.rosterCollapsed && psState.rosterCollapsed[b.key]);
        var domId = psRosterGroupDomId(b.key);
        var safeKey = String(b.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        html += '<div class="ps-rgroup">';
        html += '<button type="button" class="ps-rgroup-head" onclick="psToggleRosterGroup(\'' + safeKey + '\')">' +
            '<i id="' + domId + '-icon" class="' + (collapsed ? 'fas fa-chevron-down' : 'fas fa-chevron-up') + '"></i> ' +
            '<span class="ps-rgroup-title">' + escapeHtml(b.title) + '</span>' +
            (b.sub ? '<span class="ps-rgroup-sub">' + escapeHtml(b.sub) + '</span>' : '') +
            '<span class="ps-rgroup-count">' + b.items.length + '</span>' +
            '</button>';
        html += '<div id="' + domId + '" class="ps-rgroup-body' + (collapsed ? ' hidden' : '') + '">';
        b.items.forEach(function(it) { html += psRosterRowHtml(it.p, it.idx); });
        html += '</div></div>';
    });
    html += '</div>';
    html += '<p style="color:var(--muted);font-size:11px;margin:12px 0 0;"><i class="fas fa-lightbulb"></i> ' +
        psL('Полевой гандикап пересчитывается автоматически при изменении точного гандикапа, пола или ТИ. Группы можно сворачивать. Порядок списка важен для раскладки «в порядке списка».', 'The course handicap is recalculated automatically when the exact handicap, gender or tee changes. Groups can be collapsed. List order matters for the “as listed” distribution.') + '</p>';
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
    var proto = psState.proto || {};
    var players = proto.players || [];
    var groups = psState.groups || [];
    var hasAny = players.length > 0 || groups.some(function(g) { return (g.members || []).length > 0; });
    if (!hasAny && !psState.selId) return;
    if (!confirm(psL(
        'Оставить только игроков, записавшихся на сайте? Excel, стартовый лист и вручную добавленные будут удалены из турнира. Записи с сайта сохранятся.',
        'Keep only players who registered on the website? Excel, start-list and manually added players will be removed from the tournament. Website registrations stay.'
    ))) return;

    var keptPlayers = players.filter(psIsWebsiteRosterPlayer);
    var keptIds = {};
    keptPlayers.forEach(function(p) { if (p && p.id) keptIds[p.id] = true; });
    var keptGroups = groups.map(function(g) {
        var members = (g.members || []).filter(function(m) {
            return m && (keptIds[m.id] || psIsWebsiteRosterPlayer(m));
        });
        return {
            members: members,
            startHole: g.startHole,
            startTime: g.startTime,
            format: g.format || '',
            markerTargets: g.markerTargets || {},
            roundId: g.roundId || null,
            dirty: true
        };
    }).filter(function(g) { return (g.members || []).length > 0; });
    proto.players = keptPlayers;
    psState.groups = keptGroups;
    psRender();

    var tnId = psState.selId || proto.tournamentId || '';
    if (!tnId || typeof db === 'undefined' || !db) {
        toast(keptPlayers.length
            ? psL('Оставлены только записавшиеся на сайте', 'Only website registrations kept')
            : psL('Список игроков очищен', 'Player list cleared'), 'info');
        return;
    }
    Promise.all([
        db.ref('tournaments/' + tnId + '/registeredPlayers').once('value'),
        db.ref('users').once('value')
    ]).then(function(res) {
        var reg = (res[0] && res[0].val()) || {};
        var users = (res[1] && res[1].val()) || {};
        var updates = {};
        Object.keys(reg).forEach(function(k) {
            if (!psIsWebsiteTournamentReg(k, reg[k], users)) {
                updates['tournaments/' + tnId + '/registeredPlayers/' + k] = null;
            }
        });
        if (!Object.keys(updates).length) return null;
        return db.ref().update(updates);
    }).then(function() {
        toast(keptPlayers.length
            ? psL('Оставлены только записавшиеся на сайте', 'Only website registrations kept')
            : psL('Список игроков очищен', 'Player list cleared'), 'info');
    }).catch(function(err) {
        toast(psL('⚠️ Ошибка очистки: ' + (err && err.message || err), '⚠️ Clear error: ' + (err && err.message || err)), 'error');
    });
}

function psAddManual() {
    var p = psNewPlayer();
    p.lastName = (psEl('ps-m-last') || {}).value ? psEl('ps-m-last').value.trim() : '';
    p.firstName = (psEl('ps-m-first') || {}).value ? psEl('ps-m-first').value.trim() : '';
    p.middleName = (psEl('ps-m-mid') || {}).value ? psEl('ps-m-mid').value.trim() : '';
    p.hcp = psParseHcp((psEl('ps-m-hcp') || {}).value);
    p.gender = (psEl('ps-m-gender') || {}).value || 'men';
    p.tee = (psEl('ps-m-tee') || {}).value || psState.proto.tee || 'wh';
    // Страховка: женское имя/фамилия при нетронутом селекте пола —
    // всё равно девушка с женскими ТИ (живой авто-подбор — в psManualFioAuto).
    if (p.gender === 'men' && psGuessGender(p.lastName, p.firstName, p.middleName) === 'women') {
        p.gender = 'women';
        if (p.tee === (psState.proto.tee || 'wh')) p.tee = psDefaultTeeFor('women', p.hcp);
    }
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
    // Дубликат внутри протокола? Сравниваем по id, точному ФИО и по
    // «фамилия+имя без отчества» — заявки часто приходят без отчества,
    // а в списке тот же игрок уже добавлен с отчеством (или наоборот).
    var dup = null;
    proto.players.forEach(function(ex) { if (!dup && psSamePerson(ex, p)) dup = ex; });
    if (!p.id) p.id = 'gst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    if (dup) {
        toast(psL('⚠️ Игрок «' + psFullRus(p) + '» уже есть в списке (как «' + psFullRus(dup) + '») — пропущен', '⚠️ Player “' + psFullRus(p) + '” is already in the list (as “' + psFullRus(dup) + '”) — skipped'), 'warn');
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
    db.ref('tournaments/' + psState.selId + '/registeredPlayers').once('value').then(function(sn) {
        var reg = sn.val() || {};
        var keys = Object.keys(reg);
        if (!keys.length) {
            toast(psL('На турнир пока никто не зарегистрирован.', 'Nobody is registered for the tournament yet.'), 'info');
            return;
        }
        psLoadUsers(function(users) {
            // Собираем игроков из всех записей регистрации…
            var items = [];
            keys.forEach(function(uid) {
                var r = reg[uid] || {};
                var p = psNewPlayer();
                p.id = uid;
                p.source = 'registered';
                p.hcp = (r.handicap !== undefined && r.handicap !== null) ? parseFloat(r.handicap) : null;
                var u = users[uid] || (r.uid ? users[r.uid] : null) || {};
                var up = psUserParts(u);
                if (up.lastName || up.firstName) {
                    p.lastName = up.lastName;
                    p.firstName = up.firstName;
                    p.middleName = up.middleName;
                    if (!p.hcp && u.handicap !== undefined && u.handicap !== null) p.hcp = parseFloat(u.handicap);
                    // Гостевая запись со случайным ключом, но под ней может быть uid аккаунта
                    if (r.uid && users[r.uid] && !users[uid]) p.id = r.uid;
                } else {
                    var parsed = psSplitFio(r.name || '');
                    p.lastName = parsed.lastName;
                    p.firstName = parsed.firstName;
                    p.middleName = parsed.middleName;
                    if (r.uid && users[r.uid]) p.id = r.uid;
                }
                if (p.hcp === null || isNaN(p.hcp)) {
                    if (u && u.handicap !== undefined && u.handicap !== null) p.hcp = parseFloat(u.handicap);
                }
                // Пол и ТИ определяем ПОСЛЕ разбора имени: женские имена
                // автоматически получают пол «women» и женские ТИ
                // (красные/белые — по группе турнира или по умолчанию).
                // Нормализуем пол из записи/профиля ('f'/'жен'/'Женщина'…) —
                // иначе неканоничное значение не совпало бы ни с одной группой.
                p.gender = psNormalizeGender(r.gender) || psNormalizeGender(u.gender) || psGuessGender(p.lastName, p.firstName, p.middleName);
                p.tee = r.tee || u.defaultTee || psDefaultTeeFor(p.gender, p.hcp);
                if (!p.lastName && !p.firstName) return;
                items.push({ uid: uid, r: r, p: p });
            });

            // …и убираем дубликаты ДО добавления: если один человек записан несколько
            // раз (гость со случайным ключом + запись с аккаунтом, повторная заявка),
            // оставляем лучшую запись: с привязанным аккаунтом, иначе — самую свежую.
            function psRegRank(it, users) {
                var linked = users[it.uid] || (it.r && it.r.uid ? users[it.r.uid] : null);
                if (linked) return 2;
                if (it.r && it.r.guest === true) return 0;
                return 1;
            }
            var keep = [];
            items.forEach(function(it) {
                var idx = -1;
                for (var i = 0; i < keep.length; i++) {
                    if (psSamePerson(keep[i].p, it.p)) { idx = i; break; }
                }
                if (idx === -1) { keep.push(it); return; }
                var cur = keep[idx];
                var curTs = (cur.r && cur.r.registeredAt) || 0;
                var newTs = (it.r && it.r.registeredAt) || 0;
                if (psRegRank(it, users) > psRegRank(cur, users) || (psRegRank(it, users) === psRegRank(cur, users) && newTs > curTs)) keep[idx] = it;
            });

            var added = 0, skipped = 0;
            keep.forEach(function(it) {
                if (psAddPlayerToDraft(it.p, 'registered')) added++;
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
    // Точный гандикап. HCP / EHCP / «exact handicap» и т.п. — всегда ТОЧНЫЙ гандикап.
    if (['точный гандикап', 'точный hcp', 'точный гандикап (hcp)', 'гандикап', 'гандикап hcp', 'гандикап whs',
         'hcp', 'ehcp', 'e hcp', 'hi', 'handicap', 'exact handicap', 'exact hcp', 'exacthcp', 'handicap index',
         'гандикап index', 'whs', 'whs hcp', 'whs handicap', 'индекс гандикапа'].indexOf(s) !== -1) return 'hcp';
    if (['пол', 'gender', 'sex'].indexOf(s) !== -1) return 'gender';
    if (['ти', 'tee', 'tees', 'ти игрока', 'тис'].indexOf(s) !== -1) return 'tee';
    // Полевой/игровой гандикап — НЕ точный, такие колонки игнорируем
    if (/(игровой|полевой|игра\s*гандикап|play\s*handicap|playing\s*handicap|course\s*handicap|field\s*handicap)/.test(s)) return null;
    // Мягкие совпадения — для таблиц «не по шаблону»
    if (/фамил|surname|family/.test(s)) return 'lastName';
    if (/отчеств|middle|patronymic/.test(s)) return 'middleName';
    if (/(^|\s)фио($|\s)|участник|игрок|спортсмен|полное имя|full ?name|гольфист|(^|\s)player($|\s)/.test(s)) return 'fio';
    if (/(^|\s)имя($|\s)|first ?name|given ?name/.test(s)) return 'firstName';
    // ВАЖНО: «возраст», «лет», «год рождения», «age», «birth» — это НЕ гандикап.
    // Иначе возраст игрока (например 17) импортировался бы как HCP 17.
    if (/возраст|год рождения|года рождения|дата рождения|age|birth|born/.test(s)) return 'age';
    if (/гандикап|hcp|handicap|(^|\s)hi($|\s)|индекс/.test(s)) return 'hcp';
    if (/(^|\s)пол($|\s)|(^|\s)пол\(|gender|(^|\s)sex($|\s)/.test(s)) return 'gender';
    if (/(^|\s)ти($|\s)|(^|\s)ти\s|ти-бокс|тибокс|tee/.test(s)) return 'tee';
    return null;
}

// Приоритет колонки гандикапа: если в таблице есть и «Гандикап», и «Точный
// гандикап»/«EHCP» — берём ту, что точнее (HCP/EHCP = точный гандикап).
function psHcpHeaderBetterThan(cur, h) {
    if (!cur) return true;
    var c = psNorm(cur).replace(/[.:]/g, '');
    var s = psNorm(h).replace(/[.:]/g, '');
    function precise(x) {
        if (/(точн|exact|^ehcp$|e ?hcp|handicap index|^hi$|^hcp$|индекс)/.test(x)) return 2;
        if (/hcp|handicap|гандикап|индекс/.test(x)) return 1;
        return 0;
    }
    return precise(s) > precise(c);
}

// Пол по ФИО (когда колонка пола в таблице не указана).
// Приоритет признаков: отчество → фамилия → имя.
// Женские имена/фамилии автоматически получают пол «women» и дальше —
// женские ТИ и женскую группу турнира.
function psGenderFromName(firstName, lastName, middleName) {
    var mid = psNorm(middleName).replace(/[.]/g, '');
    // Отчество — самый надёжный признак: -овна/-евна/-ична (ж), -ович/-евич/-ич (м).
    if (mid.length > 3 && /(овна|евна|ична|инична)$/.test(mid)) return 'women';
    if (mid.length > 2 && /(ович|евич|ич)$/.test(mid)) return 'men';
    var last = psNorm(lastName).replace(/[.]/g, '');
    // Женские фамилии: -ова/-ева/-ина/-ая/-яя/-ская/-цкая.
    if (last.length > 3 && /(ова|ева|ина|ая|яя|ская|цкая)$/.test(last)) return 'women';
    // Мужские фамилии (-ов/-ев/-ин/-ский) — тоже уверенный признак.
    if (last.length > 3 && /(ов|ев|ин|ын|ский|цкий|ой)$/.test(last)) return 'men';
    var s = psNorm(firstName).replace(/[.]/g, '');
    if (!s) return 'men';
    // Словари имён — надёжнее правила окончаний: «Саша»/«Женя» на -а/-я
    // бывают и мужскими, а вот «максим»/«маргарита» — однозначны.
    if (PS_MALE_FIRST_NAMES.indexOf(s) !== -1) return 'men';
    if (PS_FEMALE_FIRST_NAMES.indexOf(s) !== -1) return 'women';
    // Общее правило: русские женские имена оканчиваются на -а/-я.
    if (/(а|я)$/.test(s)) return 'women';
    return 'men';
}

// Удобная обёртка: пол по частям ФИО в порядке «Фамилия, Имя, Отчество».
function psGuessGender(lastName, firstName, middleName) {
    try {
        return psGenderFromName(firstName, lastName, middleName);
    } catch (e) { return 'men'; }
}

// Пол из ячейки таблицы. ВАЖНО: пустая или нераспознанная ячейка даёт null —
// тогда пол определяем по имени. Раньше «пустая ячейка → мужчина» превращала
// всех девушек в таблице (без заполненной колонки «Пол») в мужчин: они
// оказывались в мужских группах/ТИ и выпадали в «Без группы».
function psGenderFromCell(v) {
    var s = psNorm(v).replace(/[.]/g, '');
    if (!s) return null;
    if (['ж', 'жен', 'женский', 'женщина', 'девушка', 'девочка', 'f', 'female', 'w', 'women', 'woman', 'fe', 'fem'].indexOf(s) !== -1 || s.indexOf('жен') === 0 || s.indexOf('дев') === 0) return 'women';
    if (['м', 'муж', 'мужской', 'мужчина', 'юноша', 'мальчик', 'm', 'male', 'men', 'man'].indexOf(s) !== -1) return 'men';
    return null;
}

// Нормализация любого «пола» из данных (регистрация, профиль, таблица):
// 'f'/'female'/'жен'/'Женщина'… → 'women', 'm'/'male'/'муж'… → 'men',
// прочее (включая числовые коды 0/1) → null — определяем по имени.
function psNormalizeGender(v) {
    return psGenderFromCell(v) || null;
}


// Строгая проверка «это ячейка с полом?» — нужна для авто-определения колонок.
function psGenderCellSure(v) {
    var s = psNorm(v).replace(/[.]/g, '');
    return ['м', 'муж', 'мужской', 'мужчина', 'юноша', 'мальчик', 'm', 'male', 'men', 'man',
            'ж', 'жен', 'женский', 'женщина', 'девушка', 'девочка', 'f', 'female', 'w', 'women', 'woman'].indexOf(s) !== -1;
}

function psTeeFromCell(v) {
    var raw = String(v == null ? '' : v);
    if (!psNorm(raw)) return null;
    // Цветные маркеры-эмодзи (⬛ 🟦 ⬜ 🟥 и т.п.)
    if (raw.indexOf('⬛') !== -1 || raw.indexOf('⚫') !== -1 || raw.indexOf('🔲') !== -1) return 'bk';
    if (raw.indexOf('🟦') !== -1 || raw.indexOf('🔵') !== -1) return 'bl';
    if (raw.indexOf('⬜') !== -1 || raw.indexOf('⚪') !== -1) return 'wh';
    if (raw.indexOf('🟥') !== -1 || raw.indexOf('🔴') !== -1) return 'rd';
    var s = psNorm(raw);
    var map = {
        'чёрный': 'bk', 'черный': 'bk', 'черн': 'bk', 'чёрн': 'bk', 'чёрное': 'bk', 'черное': 'bk', 'чёрные': 'bk', 'черные': 'bk', 'bk': 'bk', 'blk': 'bk', 'black': 'bk', 'b': 'bk',
        'синий': 'bl', 'син': 'bl', 'сини': 'bl', 'синее': 'bl', 'синие': 'bl', 'bl': 'bl', 'blue': 'bl',
        'белый': 'wh', 'бел': 'wh', 'бели': 'wh', 'белое': 'wh', 'белые': 'wh', 'wh': 'wh', 'white': 'wh', 'w': 'wh',
        'красный': 'rd', 'красн': 'rd', 'красное': 'rd', 'красные': 'rd', 'rd': 'rd', 'red': 'rd', 'r': 'rd'
    };
    if (map[s] !== undefined) return map[s];
    if (s.indexOf('чёрн') === 0 || s.indexOf('черн') === 0) return 'bk';
    if (s.indexOf('син') === 0) return 'bl';
    if (s.indexOf('бел') === 0) return 'wh';
    if (s.indexOf('красн') === 0) return 'rd';
    // Однобуквенные обозначения (ч/с/б/к)
    if (s === 'ч') return 'bk';
    if (s === 'с') return 'bl';
    if (s === 'б') return 'wh';
    if (s === 'к') return 'rd';
    return null;
}

function psParseHcpFromCell(raw) {
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    if (raw === 0 || raw === '0') return 0;
    // Даты («12.05.2010», «2010-05-12», «12/05/2010») — это дни рождения,
    // а не гандикапы. Без этой проверки из даты вытаскивалось бы «12.05».
    var s0 = String(raw == null ? '' : raw).trim();
    if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s0)) return null;
    if (/^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/.test(s0)) return null;
    var direct = psParseHcp(raw);
    if (direct !== null) return direct;
    // Строки вида «HCP 12.4», «(13)», «гандикап: 8,5» — вытаскиваем первое число
    var m = String(raw == null ? '' : raw).match(/[+-]?\d+([.,]\d+)?/);
    if (!m) return null;
    return psParseHcp(m[0]);
}

function psParseExcelRows(json) {
    var keys = {};
    if (json && json.length) {
        Object.keys(json[0]).forEach(function(h) {
            var k = psHeaderKey(h);
            if (!k) return;
            if (!keys[k]) keys[k] = h;
            else if (k === 'hcp' && psHcpHeaderBetterThan(keys[k], h)) keys[k] = h;
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
        // Пол и ТИ — ПОСЛЕ полного разбора имени: женские имена/фамилии
        // автоматически получают пол «women» и женские ТИ. Пустые/нераспознанные
        // ячейки «Пол» не переопределяют имя — пол угадываем по ФИО.
        var gender = keys.gender ? psGenderFromCell(r[keys.gender]) : null;
        if (gender !== 'men' && gender !== 'women') gender = psGuessGender(lastName, firstName, middleName);
        var tee = keys.tee ? psTeeFromCell(r[keys.tee]) : null;
        if (!tee) tee = psDefaultTeeFor(gender, hcp);
        // Гандикап 0/плюс из голой колонки «Группа» не восстанавливаем —
        // psParseHcpFromCell уже вернул null для мусорных значений.

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

// ----------------------------------------------------------
// ГИБКИЙ РАЗБОР ТАБЛИЦЫ (не обязательно по шаблону)
// Принимает лист как массив массивов (AoA). Сначала ищет строку
// заголовков (в любом месте первых строк), иначе угадывает
// колонки по содержимому: ФИО / гандикап / пол / ТИ.
// ----------------------------------------------------------
function psIsFooterRowText(v) {
    var s = psNorm(v);
    if (!s) return false;
    return /^(итого|всего|сумма|total|подпись|примечание|комментарий)/.test(s);
}

function psParseExcelGrid(aoa) {
    var rowsArr = [];
    (aoa || []).forEach(function(r, i) {
        var cells = (r || []).map(function(c) { return c === null || c === undefined ? '' : c; });
        rowsArr.push({ cells: cells, rowNum: i + 1 });
    });
    if (!rowsArr.length) return { valid: [], invalid: [], keys: {}, guessed: false, headerRow: 0 };

    // ── 1) Ищем строку заголовков среди первых 12 строк ──
    var headerRowIdx = -1, headerKeys = null;
    for (var i = 0; i < Math.min(rowsArr.length, 12); i++) {
        var keys = {}, hits = 0, hasName = false;
        rowsArr[i].cells.forEach(function(cell, ci) {
            var k = psHeaderKey(cell);
            if (!k) return;
            if (keys[k] === undefined) { keys[k] = ci; hits++; if (k === 'lastName' || k === 'firstName' || k === 'fio') hasName = true; }
            else if (k === 'hcp' && psHcpHeaderBetterThan(rowsArr[i].cells[keys[k]], cell)) keys[k] = ci;
        });
        if (hasName && hits >= 2) { headerRowIdx = i; headerKeys = keys; break; }
    }

    if (headerRowIdx >= 0) {
        // Имена колонок (с разрешением дублей) считаем ОДИН раз по строке
        // заголовков и потом применяем к каждой строке данных
        var hdrCells = rowsArr[headerRowIdx].cells;
        var colNames = {};
        var usedHdr = {};
        hdrCells.forEach(function(h, ci) {
            var hn = String(h == null ? '' : h).trim();
            if (!hn) return;
            var keyName = hn;
            if (usedHdr[keyName]) {
                var n = 2;
                while (usedHdr[hn + ' ' + n]) n++;
                keyName = hn + ' ' + n;
            }
            usedHdr[keyName] = true;
            colNames[ci] = keyName;
        });
        var objects = [];
        for (var r = headerRowIdx + 1; r < rowsArr.length; r++) {
            var obj = {};
            Object.keys(colNames).forEach(function(ci) {
                obj[colNames[ci]] = rowsArr[r].cells[ci];
            });
            // выкидываем строки-итоги/подвалы
            var footer = false;
            ['lastName', 'firstName', 'fio'].forEach(function(k) {
                if (headerKeys[k] === undefined) return;
                var cell = rowsArr[r].cells[headerKeys[k]];
                if (psIsFooterRowText(cell)) footer = true;
            });
            if (!footer) objects.push(obj);
        }
        var parsed = psParseExcelRows(objects);
        // реальные номера строк в файле (с учётом позиции заголовков)
        parsed.valid.forEach(function(rec) { rec.row += headerRowIdx; });
        parsed.invalid.forEach(function(rec) { rec.row += headerRowIdx; });
        parsed.headerRow = headerRowIdx + 1;
        parsed.guessed = false;
        parsed.keys = headerKeys;
        return parsed;
    }

    // ── 2) Заголовков нет — угадываем колонки по содержимому ──
    var dataRows = rowsArr.filter(function(r) {
        var any = false;
        r.cells.forEach(function(c) { if (String(c).trim() !== '') any = true; });
        return any;
    });
    if (!dataRows.length) return { valid: [], invalid: [], keys: {}, guessed: true, headerRow: 0 };

    var colCount = 0;
    dataRows.forEach(function(r) { colCount = Math.max(colCount, r.cells.length); });
    var sample = dataRows.slice(0, 40);

    var colInfo = [];
    for (var c = 0; c < colCount; c++) {
        var nn = 0, hcpH = 0, teeH = 0, genH = 0, txtH = 0, wordSum = 0, surnameH = 0, dateH = 0, fracH = 0, bigH = 0;
        sample.forEach(function(r) {
            var v = r.cells[c];
            if (String(v == null ? '' : v).trim() === '') return;
            nn++;
            var hv = psParseHcpFromCell(v);
            if (hv !== null) {
                hcpH++;
                // Точного гандикапа больше 54.0 не бывает — это возраст/номер/мусор.
                if (Math.abs(hv) > 54.0001) bigH++;
                else if (Math.abs(hv - Math.round(hv)) > 1e-9) fracH++;
            } else if (typeof v === 'string' && /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(v.trim())) {
                dateH++;
            }
            if (psTeeFromCell(v) !== null) teeH++;
            if (psGenderCellSure(v)) genH++;
            if (typeof v === 'string' && /[A-Za-zА-Яа-яЁё]/.test(v)) {
                txtH++;
                wordSum += v.trim().split(/\s+/).length;
                if (psLooksLikeSurname(v.trim().split(/\s+/)[0])) surnameH++;
            }
        });
        colInfo.push({ c: c, nn: nn, hcpH: hcpH, teeH: teeH, genH: genH, txtH: txtH, avgWords: nn ? wordSum / nn : 0, surnameH: surnameH, dateH: dateH, fracH: fracH, bigH: bigH });
    }

    function colFree(ci, roles) {
        return roles.tee !== ci && roles.gender !== ci && roles.hcp !== ci;
    }
    var roles = { tee: null, gender: null, hcp: null };
    colInfo.forEach(function(ci) {
        if (!ci.nn) return;
        if (roles.tee === null && ci.teeH / ci.nn >= 0.6 && !psGenderColDominant(ci)) roles.tee = ci.c;
    });
    function psGenderColDominant(ci) { return ci.nn > 0 && ci.genH / ci.nn >= 0.6; }
    colInfo.forEach(function(ci) {
        if (!ci.nn || ci.c === roles.tee) return;
        if (roles.gender === null && psGenderColDominant(ci)) roles.gender = ci.c;
    });
    // Колонка гандикапа: среди всех «похожих на числа» колонок выбираем лучшую.
    // Штрафуем даты рождения, неправдоподобно большие значения (>54 — точного
    // гандикапа таким не бывает) и голые целые без дробей (часто это возраст).
    // Поощряем дробные значения: «12,4» — почти наверняка гандикап.
    var hcpCands = [];
    colInfo.forEach(function(ci) {
        if (!ci.nn) return;
        if (ci.c === roles.tee || ci.c === roles.gender) return;
        if (ci.teeH / ci.nn >= 0.4 || ci.genH / ci.nn >= 0.4) return;
        if (ci.hcpH / ci.nn < 0.8 || ci.txtH / ci.nn > 0.6) return;
        // не порядковый ли это столбец (1,2,3… или N,N+1,…)?
        var base = null, isSeq = true, nSeq = 0;
        for (var si = 0; si < sample.length; si++) {
            var v = sample[si].cells[ci.c];
            if (String(v == null ? '' : v).trim() === '') continue;
            var num = parseFloat(String(v).replace(',', '.'));
            if (isNaN(num)) { isSeq = false; break; }
            nSeq++;
            if (base === null) base = num - si;
            if (num !== base + si) { isSeq = false; break; }
        }
        if (isSeq && nSeq >= 2) return;
        var score = ci.hcpH / ci.nn;
        if (ci.dateH / ci.nn >= 0.3) score -= 2;
        if (ci.bigH / ci.nn >= 0.3) score -= 2;
        if (!ci.fracH) score -= 0.4;
        else score += (ci.fracH / ci.nn) * 1.5;
        hcpCands.push({ c: ci.c, score: score });
    });
    hcpCands.sort(function(a, b) { return b.score - a.score; });
    if (hcpCands.length && hcpCands[0].score > 0.5) roles.hcp = hcpCands[0].c;

    // Текстовые колонки — кандидаты на ФИО
    var textCols = colInfo.filter(function(ci) {
        return ci.nn > 0 && colFree(ci.c, roles) && ci.txtH / ci.nn >= 0.6 && ci.teeH / ci.nn < 0.5 && psGenderCellShare(ci) < 0.5;
    });
    function psGenderCellShare(ci) { return ci.nn ? ci.genH / ci.nn : 0; }

    var fioCol = null, nameCols = [];
    var multiword = textCols.filter(function(ci) { return ci.avgWords >= 1.7; });
    if (multiword.length) {
        fioCol = multiword[0].c; // самая левая «полная» колонка с ФИО
        textCols = textCols.filter(function(ci) { return ci.c !== fioCol; });
    }
    // Колонки по одному слову слева направо: Фамилия / Имя / Отчество
    textCols.sort(function(a, b) { return a.c - b.c; });
    nameCols = textCols.slice(0, fioCol === null ? 3 : 2);
    if (nameCols.length >= 2) {
        // Определяем, какая из колонок — фамилия (по характерным окончаниям)
        var bestI = 0, bestScore = -1;
        nameCols.forEach(function(ci, idx) {
            var score = ci.surnameH;
            if (score > bestScore) { bestScore = score; bestI = idx; }
        });
        if (bestI !== 0) { var tcol = nameCols[0]; nameCols[0] = nameCols[bestI]; nameCols[bestI] = tcol; }
    }

    var valid = [], invalid = [];
    dataRows.forEach(function(dr, i) {
        var cells = dr.cells;
        var lastName = '', firstName = '', middleName = '';
        if (fioCol !== null) {
            var parsed2 = psSplitFio(cells[fioCol]);
            lastName = parsed2.lastName; firstName = parsed2.firstName; middleName = parsed2.middleName;
        }
        if (nameCols.length) {
            if (!lastName && nameCols[0]) lastName = String(cells[nameCols[0].c] == null ? '' : cells[nameCols[0].c]).trim();
            if (!firstName && nameCols[1]) firstName = String(cells[nameCols[1].c] == null ? '' : cells[nameCols[1].c]).trim();
            if (!middleName && nameCols[2]) middleName = String(cells[nameCols[2].c] == null ? '' : cells[nameCols[2].c]).trim();
        }
        // если «фамилия» оказалась полной строкой — добиваем разбор
        if (lastName && !firstName && lastName.split(/\s+/).length > 1) {
            var p2 = psSplitFio(lastName);
            firstName = p2.firstName || firstName;
            lastName = p2.lastName || lastName;
            middleName = p2.middleName || middleName;
        }
        var hcp = roles.hcp !== null ? psParseHcpFromCell(cells[roles.hcp]) : null;

        if (psIsFooterRowText(lastName) || psIsFooterRowText(firstName)) return;
        if (!lastName && !firstName) {
            invalid.push({ row: dr.rowNum, name: '', err: psL('нет имени', 'no name') });
            return;
        }
        // Пол и ТИ — ПОСЛЕ полного разбора имени: женские имена/фамилии
        // автоматически получают пол «women» и женские ТИ. Пустые/нераспознанные
        // ячейки не переопределяют имя — пол угадываем по ФИО.
        var gender = roles.gender !== null ? psGenderFromCell(cells[roles.gender]) : null;
        if (gender !== 'men' && gender !== 'women') gender = psGuessGender(lastName, firstName, middleName);
        var tee = roles.tee !== null ? psTeeFromCell(cells[roles.tee]) : null;
        if (!tee) tee = psDefaultTeeFor(gender, hcp);
        var errors = [];
        if (hcp === null) errors.push(psL('нет/неверный гандикап', 'missing/invalid handicap'));
        var rec = { row: dr.rowNum, lastName: lastName, firstName: firstName, middleName: middleName || '', hcp: hcp, gender: gender, tee: tee, errors: errors, matchedUid: null };
        if (errors.length) invalid.push(rec); else valid.push(rec);
    });

    return {
        valid: valid,
        invalid: invalid,
        keys: { fio: fioCol, nameCols: nameCols.map(function(ci) { return ci.c; }), hcp: roles.hcp, gender: roles.gender, tee: roles.tee },
        guessed: true,
        headerRow: 0
    };
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
            var sheetNames = (wb.SheetNames || []).filter(function(n) { return !!wb.Sheets[n]; });
            if (!sheetNames.length) throw new Error('no sheets');

            // Сканируем ВСЕ страницы документа (а не только первую):
            // каждая страница разбирается независимо, строки объединяются.
            var merged = { valid: [], invalid: [], guessed: false, headerRow: 0, sheetsCount: sheetNames.length };
            var anyGuessed = false;
            var lastHeaderRow = 0;
            sheetNames.forEach(function(name, si) {
                var grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
                if (!grid || !grid.length) return;
                var parsed = psParseExcelGrid(grid);
                if (parsed.guessed) anyGuessed = true;
                if (parsed.headerRow) lastHeaderRow = parsed.headerRow;
                var sheetLabel = sheetNames.length > 1 ? String(name || (psL('Лист', 'Sheet') + ' ' + (si + 1))) : '';
                (parsed.valid || []).forEach(function(r) { r.sheet = sheetLabel; merged.valid.push(r); });
                (parsed.invalid || []).forEach(function(r) { r.sheet = sheetLabel; merged.invalid.push(r); });
            });
            if (!merged.valid.length && !merged.invalid.length) {
                toast(psL('⚠️ В файле не найдено ни одной таблицы с именами и гандикапом (HCP/EHCP)', '⚠️ No table with player names and handicap (HCP/EHCP) found in the file'), 'error');
                psState.excel = null;
                psRender();
                return;
            }
            merged.guessed = !!(anyGuessed && sheetNames.length === 1);
            merged.headerRow = (sheetNames.length === 1) ? lastHeaderRow : 0;
            merged.sheetsCount = sheetNames.length;
            // Дедуп строк: один и тот же игрок на разных страницах не должен попасть дважды
            merged.valid = psDedupeExcelRows(merged.valid);

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
                        r.gender = r.gender || u.gender || psGuessGender(r.lastName, r.firstName, r.middleName);
                    }
                }
                merged.valid.forEach(tryMatch);
                // Строки без гандикапа: дозаполняем из профиля найденного игрока, иначе — в ошибки
                var stillBad = [];
                merged.invalid.forEach(function(r) {
                    if (r.hcp === null && r.errors && r.errors.length && (r.lastName || r.firstName)) {
                        tryMatch(r);
                        if (r.hcp !== null && r.errors && r.errors.length) { r.errors = []; }
                        if (r.errors && !r.errors.length) { merged.valid.push(r); return; }
                    }
                    stillBad.push({ row: r.row, sheet: r.sheet || '', name: [r.lastName, r.firstName, r.middleName].filter(function(w) { return String(w || '').trim(); }).join(' '), err: (r.errors || []).join(', ') || psL('нет имени', 'no name') });
                });
                merged.invalid = stillBad;
                merged.valid = psDedupeExcelRows(merged.valid);
                psState.excel = merged;
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

// Убирает одинаковых игроков из объединённых строк всех страниц Excel.
function psDedupeExcelRows(rows) {
    var out = [];
    var used = [];
    (rows || []).forEach(function(r) {
        var key = { lastName: r.lastName || '', firstName: r.firstName || '', middleName: r.middleName || '', id: r.matchedUid || '' };
        var dup = false;
        for (var i = 0; i < used.length; i++) {
            if (psSamePerson(used[i], key)) { dup = true; break; }
        }
        if (dup) return;
        used.push(key);
        out.push(r);
    });
    return out;
}

function psRenderExcelBox() {
    var box = psEl('ps-excel-box');
    if (!box) return;
    if (!psState.excel) { box.innerHTML = ''; return; }
    var data = psState.excel;
    var multi = data.sheetsCount > 1;
    var html = '<div style="background:var(--input);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;">';
    html += '<h3 style="color:var(--gold);font-size:14px;margin:0 0 6px;"><i class="fas fa-file-excel"></i> ' + psL('Excel: строки из файла', 'Excel: rows from the file') + '</h3>';
    if (multi) {
        html += '<p style="font-size:11.5px;color:var(--muted);margin:0 0 8px;"><i class="fas fa-circle-info"></i> ' +
            psL('Просмотрены все страницы документа (' + data.sheetsCount + '). Из остальных колонок берутся только Фамилия, Имя и точный гандикап (HCP/EHCP).',
                'All sheets of the document were scanned (' + data.sheetsCount + '). Only last name, first name and the exact handicap (HCP/EHCP) are taken from other columns.') + '</p>';
    }
    if (data.guessed) {
        html += '<p style="font-size:11.5px;color:var(--gold);margin:0 0 8px;"><i class="fas fa-wand-magic-sparkles"></i> ' +
            psL('Таблица не по шаблону — колонки ФИО и гандикапа найдены автоматически. Проверьте результат ниже.',
                'Non-template table — name and handicap columns were detected automatically. Please review the result below.') + '</p>';
    } else if (data.headerRow && data.headerRow > 1) {
        html += '<p style="font-size:11.5px;color:var(--muted);margin:0 0 8px;"><i class="fas fa-circle-info"></i> ' +
            psL('Заголовки найдены в строке ' + data.headerRow + '.', 'Header row detected at row ' + data.headerRow + '.') + '</p>';
    }

    if (data.valid.length) {
        html += '<p style="font-size:12px;color:var(--muted);margin:4px 0 8px;">' + psL('Готово к добавлению', 'Ready to add') + ': <b>' + data.valid.length + '</b></p>';
        html += '<div style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:rgba(255,255,255,.04);">' +
            '<th style="padding:8px;text-align:left;">#</th><th style="padding:8px;text-align:left;">' + psL('ФИО', 'Name') + '</th>' +
            '<th style="padding:8px;text-align:left;">' + psL('Пол', 'Gender') + '</th>' +
            '<th style="padding:8px;text-align:left;">' + psL('Точный гандикап', 'Exact handicap') + '</th>' +
            '<th style="padding:8px;text-align:left;">' + psL('ТИ', 'Tee') + '</th>' +
            '<th style="padding:8px;text-align:left;" title="' + psL('Точный гандикап после обрезки турнира', 'Exact handicap after the tournament cut') + '">✂</th>' +
            '<th style="padding:8px;text-align:left;">' + psL('Группа', 'Group') + '</th>' +
            (multi ? '<th style="padding:8px;text-align:left;">' + psL('Страница', 'Sheet') + '</th>' : '') +
            '<th style="padding:8px;text-align:left;"></th></tr></thead><tbody>';
        data.valid.forEach(function(r, i) {
            var fio = [r.lastName, r.firstName, r.middleName].filter(function(w) { return String(w || '').trim(); }).join(' ');
            var hcpTxt = r.hcp !== null ? psHcpFmt(r.hcp) : '<span style="color:var(--red);">—</span>';
            var gTxt = r.gender === 'women' ? ('👩 ' + psL('Ж', 'F')) : ('👨 ' + psL('М', 'M'));
            var teeTxt = r.tee ? psTeeName(r.tee) : '—';
            var effTxt = '—';
            if (r.hcp !== null && r.hcp !== undefined) {
                try {
                    var eff = psEffectiveExactFor(r.hcp, r.gender || 'men');
                    effTxt = (Math.abs(eff - r.hcp) >= 0.049)
                        ? ('<b style="color:var(--gold);">' + psHcpFmt(eff) + '</b>')
                        : ('<span style="color:var(--muted);">' + psHcpFmt(eff) + '</span>');
                } catch (e) { effTxt = '—'; }
            }
            var divTxt = '—';
            try {
                var dv = psFindDivisionFor(r.hcp, r.gender || 'men');
                if (dv && dv.name) {
                    var rg = (typeof tnDivisionRangeText === 'function') ? tnDivisionRangeText(dv) : '';
                    divTxt = '<span class="tn-div-chip">' + escapeHtml(dv.name) + (rg ? ' · ' + escapeHtml(rg) : '') + '</span>';
                }
            } catch (e) {}
            html += '<tr style="border-top:1px solid var(--border);">' +
                '<td style="padding:6px 8px;">' + (i + 1) + '</td>' +
                '<td style="padding:6px 8px;"><b>' + escapeHtml(fio) + '</b>' +
                (r.matchedUid ? ' <span class="hcp-chip" style="background:rgba(46,204,113,.15);color:#2ecc71;font-size:10px;"><i class="fas fa-circle-check"></i></span>' : '') + '</td>' +
                '<td style="padding:6px 8px;white-space:nowrap;">' + gTxt + '</td>' +
                '<td style="padding:6px 8px;">' + hcpTxt + '</td>' +
                '<td style="padding:6px 8px;white-space:nowrap;">' + escapeHtml(teeTxt) + '</td>' +
                '<td style="padding:6px 8px;white-space:nowrap;">' + effTxt + '</td>' +
                '<td style="padding:6px 8px;">' + divTxt + '</td>' +
                (multi ? '<td style="padding:6px 8px;color:var(--muted);font-size:11px;">' + escapeHtml(r.sheet || '') + '</td>' : '') +
                '<td style="padding:6px 8px;"><input type="checkbox" id="ps-exc-cb-' + i + '" checked style="width:17px;height:17px;cursor:pointer;"></td></tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">';
        html += '<button class="btn btn-g btn-sm" onclick="psExcelAdd()"><i class="fas fa-check"></i> ' + psL('Добавить выбранных', 'Add selected') + '</button>';
        html += '<button class="btn btn-ol btn-sm" onclick="psExcelCancel()">' + psL('Отмена', 'Cancel') + '</button>';
        html += '</div>';
    } else {
        html += '<p style="color:var(--muted);font-size:13px;margin:4px 0 0;"><i class="fas fa-triangle-exclamation" style="color:var(--red);"></i> ' + psL('Валидных строк нет — проверьте шаблон (нужны Фамилия/Имя и точный гандикап HCP/EHCP).', 'No valid rows — check the template (last/first name and exact handicap HCP/EHCP required).') + '</p>';
    }
    if (data.invalid && data.invalid.length) {
        html += '<p style="font-size:12px;color:var(--muted);margin:10px 0 4px;">' + psL('Строки с ошибками (пропущены)', 'Rows with errors (skipped)') + ': <b style="color:var(--red);">' + data.invalid.length + '</b></p>';
        html += '<div style="max-height:150px;overflow-y:auto;font-size:11px;color:var(--muted);">';
        data.invalid.forEach(function(r) {
            html += '<div style="padding:2px 0;">' + (r.sheet ? escapeHtml(r.sheet) + ' · ' : '') + psL('Строка', 'Row') + ' ' + r.row + ': ' + escapeHtml(r.name || '') + ' — <span style="color:var(--red);">' + escapeHtml(r.err) + '</span></div>';
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
        p.tee = r.tee || psDefaultTeeFor(p.gender, r.hcp);
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
        ['1-10', psL('Шотган: с 1-й и 10-й лунок', 'Shotgun: holes 1 and 10')],
        ['all18', psL('Шотган со всех 18 лунок', 'Shotgun from all 18 holes')]
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

    var isAll18 = proto.scheme === 'all18';
    var timeLabel = isAll18
        ? psL('Время старта (все лунки одновременно)', 'Start time (all holes together)')
        : psL('Время старта первой группы', 'First group start time');
    var intervalLabel = isAll18
        ? psL('Интервал второй группы на лунке (мин)', 'Second group on same hole interval (min)')
        : psL('Интервал между группами (мин)', 'Interval between groups (min)');

    html += '<div class="form-row form-row-3">';
    html += '<div class="form-group"><label>' + timeLabel + '</label>' +
        '<input type="time" class="form-input" value="' + (proto.startTime || '09:00') + '" onchange="psDistTime(this.value)"></div>';
    html += '<div class="form-group"><label>' + intervalLabel + '</label>' +
        '<input type="number" class="form-input" min="3" max="30" step="1" value="' + (proto.interval || 8) + '" onchange="psDistInterval(this.value)"></div>';
    html += '<div class="form-group"><label>&nbsp;</label><button class="btn btn-g btn-block" onclick="psDistPreview()" style="min-height:40px;"><i class="fas fa-shuffle"></i> ' + psL('Показать раскладку', 'Show distribution') + '</button></div>';
    html += '</div>';
    if (isAll18) {
        html += '<p style="font-size:11.5px;color:var(--muted);margin:-4px 0 10px;"><i class="fas fa-circle-info"></i> ' +
            psL('При шотгане со всех лунок все группы стартуют в одно время. Интервал применяется только если на одной лунке две группы (например 11:00 и 11:10 с 1-й лунки).',
                'In a shotgun start from all holes every group tees off at the same time. The interval is used only when two groups share a hole (e.g. 11:00 and 11:10 from hole 1).') +
            '</p>';
    }

    // Результат раскладки
    html += '<div id="ps-groups-result" style="margin-top:8px;">' + psRenderGroupsResult() + '</div>';
    return html;
}

// Тихий выход из режима правки сохранённого протокола (используется,
// когда группы пересчитываются с нуля и править больше нечего)
function psExitEditModeSoft() {
    psState.editingId = null;
    psState.editRounds = {};
    psState.editDeletedRounds = [];
}

function psDistSize(v) { if (!psConfirmGroupReset()) { psRender(); return; } if (psState.proto) psState.proto.size = parseInt(v, 10) || 4; if (psState.groups.length) { psState.groups = []; psExitEditModeSoft(); } psRender(); }
function psDistMethod(v) { if (!psConfirmGroupReset()) { psRender(); return; } if (psState.proto) psState.proto.method = v; if (psState.groups.length) { psState.groups = []; psExitEditModeSoft(); } psRender(); }
function psDistScheme(v) { if (!psConfirmGroupReset()) { psRender(); return; } if (psState.proto) psState.proto.scheme = v; if (psState.groups.length) { psState.groups = []; psExitEditModeSoft(); } psRender(); }
function psDistTime(v) {
    if (!psState.proto) return;
    psState.proto.startTime = v;
    // Время/интервал не ломают состав групп — только пересчитывают старт.
    psRescheduleExistingGroups();
    psRender();
}
function psDistInterval(v) {
    if (!psState.proto) return;
    psState.proto.interval = parseInt(v, 10) || 8;
    psRescheduleExistingGroups();
    psRender();
}

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

function psIntervalMs(proto) {
    proto = proto || {};
    return Math.max(3, parseInt(proto.interval, 10) || 8) * 60000;
}

// Шотган со всех 18: все лунки стартуют одновременно.
// Интервал — только для второй (третьей…) группы на той же лунке.
function psAll18Schedule(i, proto) {
    proto = proto || psState.proto || {};
    var base = psStartBaseTs(proto);
    var intervalMs = psIntervalMs(proto);
    var wave = Math.floor(i / 18);
    var holeIdx = ((i % 18) + 18) % 18;
    return { startHole: holeIdx + 1, startTime: base + wave * intervalMs };
}

// Шотган: подписи «Группа 1А / 1Б» (лунка + волна), не порядковый номер.
// Для схемы «все с 1-й» остаётся «Группа 1, 2, 3…».
function psShotgunLetterScheme(scheme) {
    scheme = scheme || (psState && psState.proto && psState.proto.scheme);
    return scheme === 'all18' || scheme === '1-10';
}
function psWaveLetter(idx) {
    idx = Math.max(0, parseInt(idx, 10) || 0);
    var alphabet = (typeof currentLang !== 'undefined' && currentLang === 'en')
        ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        : 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ';
    if (idx < alphabet.length) return alphabet.charAt(idx);
    return String(idx + 1);
}
function psGroupWaveIndex(groups, gi) {
    groups = groups || [];
    var g = groups[gi];
    if (!g) return 0;
    var hole = parseInt(g.startHole, 10) || 1;
    var n = 0;
    for (var i = 0; i < gi; i++) {
        if ((parseInt(groups[i].startHole, 10) || 1) === hole) n++;
    }
    return n;
}
function psGroupTitle(g, gi, groups) {
    groups = groups || (psState && psState.groups) || [];
    var proto = (psState && psState.proto) || {};
    if (psShotgunLetterScheme(proto.scheme)) {
        var hole = parseInt((g && g.startHole) || 1, 10) || 1;
        return psL('Группа', 'Group') + ' ' + hole + psWaveLetter(psGroupWaveIndex(groups, gi));
    }
    return psL('Группа', 'Group') + ' ' + (gi + 1);
}
// Порядок показа шотгана: лунка, затем волна (время). 1А, 1Б, 2А… а не 18 A-групп подряд.
function psSortGroupsShotgun(groups, scheme) {
    groups = groups || (psState && psState.groups) || [];
    if (!psShotgunLetterScheme(scheme)) return groups;
    groups.sort(function(a, b) {
        var ha = parseInt(a && a.startHole, 10) || 1;
        var hb = parseInt(b && b.startHole, 10) || 1;
        if (ha !== hb) return ha - hb;
        var ta = (a && a.startTime) || 0;
        var tb = (b && b.startTime) || 0;
        if (ta !== tb) return ta - tb;
        return 0;
    });
    return groups;
}

// Запись с сайта (форма турнира): source === 'registered'.
// Excel / ручные / стартовый лист — нет.
function psIsWebsiteRosterPlayer(p) {
    return !!(p && p.source === 'registered');
}
// Заявки tournaments/*/registeredPlayers: гости и аккаунты с сайта
// (без source или guest:true). Импорт стартового листа — source 'start-list'.
function psIsWebsiteTournamentReg(key, rp, users) {
    rp = rp || {};
    var src = String(rp.source || '');
    if (src === 'start-list' || src === 'excel' || src === 'manual' || src === 'protocol' || src === 'edit') return false;
    if (rp.guest === true) return true;
    if (src === 'registered') return true;
    if (!src) {
        var uid = rp.uid || key;
        var u = users && users[uid];
        if (u && u.hcpSource === 'start-list') return false;
        if (String(uid).indexOf('user_') === 0) return false;
        if (String(uid).indexOf('gst_') === 0) return false;
        return true;
    }
    return false;
}

// Пересчёт стартовых времён без сброса состава групп (время/интервал в админке).
function psRescheduleExistingGroups() {
    var proto = psState.proto;
    var groups = psState.groups || [];
    if (!proto || !groups.length) return;
    psSortGroupsShotgun(groups, proto.scheme);
    if (proto.scheme === 'all18') {
        var occupancy = {};
        groups.forEach(function(g, i) {
            var hole = parseInt(g.startHole, 10);
            if (!hole || hole < 1 || hole > 18) hole = (i % 18) + 1;
            occupancy[hole] = occupancy[hole] || 0;
            var wave = occupancy[hole];
            occupancy[hole]++;
            var sch = psAll18Schedule(wave * 18 + (hole - 1), proto);
            g.startHole = hole;
            g.startTime = sch.startTime;
        });
        return;
    }
    groups.forEach(function(g, i) {
        var sch = psGroupSchedule(i, groups.length);
        g.startHole = sch.startHole;
        g.startTime = sch.startTime;
    });
}

function psGroupSchedule(i, totalGroups) {
    var proto = psState.proto || {};
    var base = psStartBaseTs(proto);
    var intervalMs = psIntervalMs(proto);

    if (proto.scheme === 'all18') {
        return psAll18Schedule(i, proto);
    }
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
    var hasManual = false;
    (psState.groups || []).forEach(function(g) { if (g.dirty || g.roundId) hasManual = true; });
    if (hasManual || psState.editingId) {
        if (!confirm(psL('Перестроить группы по настройкам? Ручная разбивка, маркеры и правки групп будут сброшены.', 'Rebuild groups from the settings? Manual grouping, markers and group edits will be reset.'))) return;
        if (psState.editingId) psExitEditModeSoft();
    }
    var groups = psBuildGroups();
    psState.groups = groups.map(function(members, i) {
        var sch = psGroupSchedule(i, groups.length);
        return { members: members, startHole: sch.startHole, startTime: sch.startTime, format: '', markerTargets: {} };
    });
    psSortGroupsShotgun(psState.groups, psState.proto && psState.proto.scheme);
    psRender();
    psScrollToGroups();
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

// Итоговые назначения маркеров группы: ручные (g.markerTargets),
// если они заданы, иначе — автоматичечкое кольцо по составу.
function psGroupMarkersResolved(g) {
    var members = g && g.members ? g.members : [];
    var out = [];
    if (members.length < 2) return out;
    var byId = {};
    members.forEach(function(p) { byId[p.id] = p; });
    var manual = g.markerTargets || {};
    var hasManual = false;
    Object.keys(manual).forEach(function(k) {
        var t = manual[k];
        if (byId[k] && byId[t] && k !== t) hasManual = true;
    });
    if (hasManual) {
        members.forEach(function(p) {
            var tid = manual[p.id];
            if (tid && byId[tid] && tid !== p.id) {
                out.push({ markerId: p.id, markerName: psNameForRound(p) || 'Player', targetId: tid, targetName: psNameForRound(byId[tid]) || 'Player' });
            }
        });
        return out;
    }
    psMarkersForGroup(members).forEach(function(m) {
        out.push({ markerId: m.marker.id, markerName: psNameForRound(m.marker) || 'Player', targetId: m.target.id, targetName: psNameForRound(m.target) || 'Player' });
    });
    return out;
}

// Карточка игрока в раунде (как при создании, так и при добавлении в существующий)
function psPlayerRoundEntry(p, fieldHcp) {
    return {
        name: psNameForRound(p) || 'Player',
        firstName: p.firstName || '',
        middleName: p.middleName || '',
        lastName: p.lastName || '',
        gender: p.gender || 'men',
        tee: p.tee || 'wh',
        exactHcp: psEffectiveExact(p),
        exactHcpRaw: (p.hcp === null || p.hcp === undefined || p.hcp === '') ? 0 : (parseFloat(p.hcp) || 0),
        fieldHcp: fieldHcp,
        scores: {},
        markerScores: {},
        submitted: {},
        markerSubmitted: {},
        verified: {}
    };
}

function psToTimeInput(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}

// Форматы, доступные для выбора на уровне группы
function psGroupFormatOptions(g) {
    var proto = psState.proto || {};
    var resolved = psResolvedFormats().join(' + ');
    function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
    var opts = ['<option value="">' + psL('— как у протокола: ', '— same as protocol: ') + esc(resolved) + ' —</option>'];
    var preset = ['Stroke Play', 'Stableford', 'Match Play 1v1', 'Match Play 2v2', 'Scramble', 'Texas Scramble', 'Greensomes'];
    var tn = psGetSelTournament();
    var used = {};
    (tn && tn.formats ? tn.formats : []).concat(preset).forEach(function(f) {
        if (!f || used[f]) return;
        used[f] = true;
        opts.push('<option value="' + esc(f) + '"' + (g.format === f ? ' selected' : '') + '>' + esc(f) + '</option>');
    });
    if (g.format && !used[g.format]) opts.push('<option value="' + esc(g.format) + '" selected>' + esc(g.format) + '</option>');
    return opts.join('');
}

function psPlayerHasScores(g, pid) {
    if (!psState.editingId || !g.roundId) return false;
    var rd = psState.editRounds[g.roundId];
    var pl = rd && rd.players && rd.players[pid];
    if (!pl) return false;
    var scores = pl.scores || {};
    var has = false;
    Object.keys(scores).forEach(function(h) { if (parseInt(scores[h]) >= 1) has = true; });
    return has;
}

function psRenderGroupsResult() {
    if (!psState.groups || !psState.groups.length) {
        return '';
    }
    psSortGroupsShotgun(psState.groups, psState.proto && psState.proto.scheme);
    var totalPlayersInGroups = 0;
    psState.groups.forEach(function(g) { totalPlayersInGroups += g.members.length; });

    var html = '<div style="margin-top:10px;border-top:1px dashed var(--border);padding-top:12px;">';
    html += '<h3 style="color:var(--gold);font-size:14px;margin:0 0 10px;"><i class="fas fa-list-check"></i> ' + psL('Раскладка', 'Distribution') + ': ' +
        psState.groups.length + ' ' + psL('групп', 'groups') + ' · ' + totalPlayersInGroups + ' ' + psL('игроков', 'players') + '</h3>';

    if (psState.editingId) {
        html += '<div style="background:rgba(90,173,224,0.1);border:1px solid rgba(90,173,224,0.5);border-radius:10px;padding:10px 14px;font-size:12.5px;color:var(--white);margin-bottom:12px;">' +
            '<i class="fas fa-pen-to-square" style="color:var(--blue);"></i> ' +
            psL('Редактируется <b>сохранённый</b> протокол: меняйте состав групп, маркеров, ТИ и формат — при сохранении раунды обновятся «на месте», и игрокам <b>не придётся сканировать новые QR-коды</b>.',
                'Editing a <b>saved</b> protocol: change groups, markers, tees and formats — on save the rounds are updated in place, so players <b>do not need to scan new QR codes</b>.') +
            ' <a href="javascript:psCancelEdit()" style="color:var(--blue);white-space:nowrap;">' + psL('Отменить правку', 'Cancel editing') + '</a></div>';
    } else {
        html += '<p style="color:var(--muted);font-size:11.5px;margin:0 0 12px;"><i class="fas fa-hand-pointer"></i> ' +
            psL('Всё можно поправить прямо здесь, до сохранения: перетаскивайте игроков между группами (список справа), добавляйте новых в нужную группу, меняйте маркеров, ТИ, время, лунку и формат каждой группы.',
                'Everything can be adjusted right here before saving: move players between groups (list on the right), add new players straight into a group, change markers, tees, tee times, starting hole and the format of each group.') + '</p>';
    }

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;">';
    psState.groups.forEach(function(g, gi) {
        var dateStr = fmtDate(g.startTime);
        html += '<div class="card" style="padding:14px;margin:0;border:1px solid rgba(201,168,76,0.4);">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
        html += '<b style="color:var(--white);font-size:15px;"><i class="fas fa-flag"></i> ' + psGroupTitle(g, gi) + '</b>';
        html += '<button class="btn btn-r btn-sm" style="padding:3px 8px;font-size:11px;" title="' + psL('Удалить группу', 'Delete group') + '" onclick="psGRemoveGroup(' + gi + ')"><i class="fas fa-trash"></i></button>';
        html += '</div>';

        // Время / лунка / формат группы
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:flex-end;">';
        html += '<div style="flex:0 0 auto;"><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px;"><i class="far fa-clock"></i> ' + psL('Старт', 'Start') + '</label>' +
            '<input type="time" class="form-input" style="width:96px;padding:5px 7px;font-size:12.5px;" value="' + psToTimeInput(g.startTime) + '" onchange="psGTime(' + gi + ', this.value)"></div>';
        html += '<div style="flex:0 0 auto;"><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px;">' + psL('Лунка', 'Hole') + '</label>' +
            '<select class="form-input" style="width:70px;padding:5px 7px;font-size:12.5px;" onchange="psGHole(' + gi + ', this.value)">' +
            (function() { var o = ''; for (var h = 1; h <= 18; h++) o += '<option value="' + h + '"' + (parseInt(g.startHole || 1, 10) === h ? ' selected' : '') + '>' + h + '</option>'; return o; })() +
            '</select></div>';
        html += '<div style="flex:1 1 150px;"><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px;">' + psL('Формат группы', 'Group format') + '</label>' +
            '<select class="form-input" style="padding:5px 7px;font-size:12.5px;" onchange="psGFormat(' + gi + ', this.value)">' + psGroupFormatOptions(g) + '</select></div>';
        html += '</div>';
        if (dateStr !== '—' && dateStr !== fmtDate(psStartBaseTs(psState.proto))) {
            html += '<div style="font-size:10.5px;color:var(--muted);margin:-2px 0 8px;"><i class="far fa-calendar"></i> ' + dateStr + '</div>';
        }

        // Состав
        var resolvedMarkers = psGroupMarkersResolved(g);
        var markerOf = {};
        resolvedMarkers.forEach(function(m) { markerOf[m.markerId] = m.targetId; });
        g.members.forEach(function(p, mi) {
            var hasScores = psPlayerHasScores(g, p.id);
            html += '<div style="padding:8px 10px;background:var(--input);border-radius:8px;margin-bottom:6px;border-left:3px solid ' + (mi === 0 ? 'var(--gold)' : 'var(--border)') + ';">';
            html += '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">';
            html += '<b style="font-size:13px;color:var(--white);">' + escapeHtml(psFullRus(p)) + '</b>' + psCutHintHtml(p) + ' ' + psDivisionChipHtml(p) +
                (hasScores ? ' <span class="hcp-chip" style="background:rgba(90,173,224,.15);color:var(--blue);font-size:10px;" title="' + psL('В раунде уже есть введённый счёт этого игрока', 'This player already has scores in the round') + '"><i class="fas fa-flag-checkered"></i> ' + psL('есть счёт', 'has scores') + '</span>' : '');
            html += '<div style="display:flex;gap:4px;align-items:center;">';
            if (psState.groups.length > 1 || g.members.length > 0) {
                var moveOpts = '';
                psState.groups.forEach(function(g2, gj) {
                    if (gj === gi) return;
                    moveOpts += '<option value="' + gj + '">→ ' + psGroupTitle(g2, gj) + '</option>';
                });
                moveOpts += '<option value="new">＋ ' + psL('Новая группа', 'New group') + '</option>';
                html += '<select class="form-input" style="width:auto;padding:3px 6px;font-size:10.5px;" title="' + psL('Переместить в другую группу', 'Move to another group') + '" onchange="if(this.value!==\'\')psGMove(' + gi + ',' + mi + ',this.value)">' +
                    '<option value="">' + psL('Перенести…', 'Move…') + '</option>' + moveOpts + '</select>';
            }
            html += '<button class="btn btn-r btn-sm" style="padding:3px 8px;font-size:11px;" title="' + psL('Убрать из группы', 'Remove from group') + '" onclick="psGRemove(' + gi + ',' + mi + ')"><i class="fas fa-xmark"></i></button>';
            html += '</div></div>';

            // ТИ + гандикапы
            html += '<div style="display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;margin-top:6px;">';
            html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px;">' + psL('ТИ', 'Tee') + '</label>' +
                '<select class="form-input" style="width:auto;padding:4px 6px;font-size:12px;" onchange="psGTee(' + gi + ',' + mi + ', this.value)">' + psTeeOptionsHtml(p.tee) + '</select></div>';
            // Как и в списке участников: при включённой обрезке показываем
            // обрезанное значение — от него считаются полевой HCP и группа.
            var gRaw = (p.hcp === null || p.hcp === undefined || p.hcp === '') ? null : parseFloat(p.hcp);
            if (gRaw !== null && isNaN(gRaw)) gRaw = null;
            var gEff = (gRaw === null) ? null : psEffectiveExact(p);
            var gCut = (gRaw !== null && gEff !== null && Math.abs(gEff - gRaw) >= 0.049);
            var gHcpVal = (gRaw === null) ? '' : psHcpFmt(gCut ? gEff : gRaw);
            var gHcpTitle = gCut
                ? psL('После обрезки: ' + psHcpFmt(gRaw) + ' → ' + psHcpFmt(gEff), 'After cut: ' + psHcpFmt(gRaw) + ' → ' + psHcpFmt(gEff))
                : psL('Точный HCP', 'Exact HCP');
            html += '<div><label style="font-size:10px;color:var(--muted);display:block;margin-bottom:2px;">' + psL('Точный HCP', 'Exact HCP') + '</label>' +
                '<input type="text" class="form-input' + (gCut ? ' ps-rrow-cut' : '') + '" style="width:74px;padding:4px 6px;font-size:12px;" title="' + gHcpTitle.replace(/"/g, '&quot;') + '" value="' + gHcpVal.replace(/"/g, '&quot;') + '" onchange="psGHcp(' + gi + ',' + mi + ', this.value)" placeholder="13.0">' +
                (gCut ? ' <i class="fas fa-scissors" style="color:var(--gold);font-size:11px;"></i>' : '') + '</div>';
            html += '<span class="hcp-chip" style="font-size:10.5px;margin-bottom:4px;">' + psL('Полевой', 'Course') + ' ' + fmtFieldHcp(psCalcFieldHcp(p)) + '</span>';
            html += '</div>';

            // Маркер
            if (g.members.length >= 2) {
                var mkOpts = '<option value="">' + psL('— не маркирует —', '— marks nobody —') + '</option>';
                g.members.forEach(function(other) {
                    if (other.id === p.id) return;
                    mkOpts += '<option value="' + escapeHtml(other.id) + '"' + (markerOf[p.id] === other.id ? ' selected' : '') + '>' + escapeHtml(psFullRus(other)) + '</option>';
                });
                html += '<div style="display:flex;gap:6px;align-items:center;margin-top:6px;">' +
                    '<label style="font-size:10.5px;color:var(--blue);white-space:nowrap;"><i class="fas fa-eye"></i> ' + psL('маркирует:', 'marks:') + '</label>' +
                    '<select class="form-input" style="flex:1;padding:4px 6px;font-size:12px;" onchange="psGMarker(' + gi + ',' + mi + ', this.value)">' + mkOpts + '</select></div>';
            }
            html += '</div>';
        });

        // Добавить игрока прямо в группу
        html += '<div id="ps-ga-form-' + gi + '" class="hidden" style="background:rgba(201,168,76,0.07);border:1px dashed var(--gold);border-radius:8px;padding:10px;margin-bottom:8px;">';
        html += '<div class="form-row" style="gap:6px;margin-bottom:6px;">' +
            '<div class="form-group" style="flex:2 1 140px;margin:0;"><label style="font-size:10px;color:var(--muted);">' + psL('ФИО (одной строкой)', 'Full name (one line)') + '</label><input type="text" id="ps-ga-fio-' + gi + '" class="form-input" oninput="psGroupFioAuto(' + gi + ')" style="padding:6px 8px;font-size:12.5px;" placeholder="' + psL('Тестов Иван Петрович', 'Smith John') + '"></div>' +
            '<div class="form-group" style="flex:0 1 82px;margin:0;"><label style="font-size:10px;color:var(--muted);">HCP</label><input type="text" id="ps-ga-hcp-' + gi + '" class="form-input" style="padding:6px 8px;font-size:12.5px;" placeholder="13.0"></div>' +
            '</div>';
        html += '<div class="form-row" style="gap:6px;margin-bottom:8px;">' +
            '<div class="form-group" style="flex:1 1 110px;margin:0;"><label style="font-size:10px;color:var(--muted);">' + psL('Пол', 'Gender') + '</label><select id="ps-ga-gender-' + gi + '" class="form-input" style="padding:6px 8px;font-size:12.5px;"><option value="men">' + psL('Мужчина', 'Male') + '</option><option value="women">' + psL('Женщина', 'Female') + '</option></select></div>' +
            '<div class="form-group" style="flex:1 1 110px;margin:0;"><label style="font-size:10px;color:var(--muted);">' + psL('ТИ', 'Tee') + '</label><select id="ps-ga-tee-' + gi + '" class="form-input" style="padding:6px 8px;font-size:12.5px;">' + psTeeOptionsHtml((psState.proto && psState.proto.tee) || 'wh') + '</select></div>' +
            '</div>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button class="btn btn-g btn-sm" onclick="psGAddPlayer(' + gi + ')"><i class="fas fa-check"></i> ' + psL('Добавить в группу', 'Add to group') + '</button>' +
            '<button class="btn btn-ol btn-sm" onclick="psGAddToggle(' + gi + ', true)">' + psL('Отмена', 'Cancel') + '</button>' +
            '</div></div>';
        html += '<button class="btn btn-og btn-sm btn-block" style="width:100%;justify-content:center;font-size:12px;" onclick="psGAddToggle(' + gi + ')"><i class="fas fa-user-plus"></i> ' + psL('Игрок в эту группу', 'Player into this group') + '</button>';

        html += '</div>'; // /card группы
    });
    html += '</div>'; // /grid

    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">';
    html += '<button class="btn btn-og btn-sm" onclick="psAddGroup()"><i class="fas fa-plus"></i> ' + psL('Пустая группа', 'Empty group') + '</button>';
    html += '<button class="btn btn-ol btn-sm" onclick="psGMarkersAuto()" title="' + psL('Сбросить ручные назначения и раздать маркеров автоматически по кругу', 'Reset manual assignments and hand out markers automatically in a circle') + '"><i class="fas fa-rotate"></i> ' + psL('Маркеры по кругу', 'Markers in a circle') + '</button>';
    html += '</div>';

    html += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;">';
    if (psState.editingId) {
        html += '<button class="btn btn-g btn-block" onclick="psSaveEdits()" style="min-height:46px;font-size:15px;"><i class="fas fa-save"></i> ' +
            psL('Сохранить изменения (QR-коды прежние)', 'Save changes (QR codes stay the same)') + '</button>';
    } else {
        html += '<button class="btn btn-g btn-block" onclick="psSaveProtocol()" style="min-height:46px;font-size:15px;"><i class="fas fa-save"></i> ' +
            psL('Сохранить: создать группы-раунды и QR-коды', 'Save: create group rounds & QR codes') + '</button>';
    }
    html += '</div>';
    html += '<p style="color:var(--muted);font-size:11px;margin:8px 0 0;"><i class="fas fa-circle-info"></i> ' +
        (psState.editingId
            ? psL('Раунды обновляются в базе без смены ссылок: если игрока заменили, достаточно передать новичку его распечатанную карточку — по старому QR откроется обновлённая карточка.',
                  'Rounds are updated in place without changing any links: if a player was replaced, just hand the newcomer their printed card — the old QR will open the updated scorecard.')
            : psL('После сохранения будут созданы отдельные раунды для каждой группы (видны во вкладке «Раунды»). У каждого игрока — один QR: в группе он открывает общую карточку, где вводится и свой счёт, и счёт маркируемого партнёра. QR-карточки для печати откроются отдельной страницей.',
                  'After saving, a separate round is created for every group (visible in the “Rounds” tab). Each player gets a single QR: in a group it opens the shared scorecard where both their own and the marked partner’s scores are entered. Printable QR cards open on a separate page.')) + '</p>';
    html += '</div>';
    return html;
}

// ----------------------------------------------------------
// РУЧНАЯ ПРАВКА ГРУПП (и черновика, и сохранённого протокола)
// ----------------------------------------------------------
function psGroupsDirtyMark() {
    psState.groups.forEach(function(g) { g.dirty = true; });
}

function psGTime(gi, val) {
    var g = psState.groups[gi];
    if (!g || !val) return;
    var cur = g.startTime ? new Date(g.startTime) : new Date(psStartBaseTs(psState.proto));
    var parts = val.split(':');
    cur.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0, 0);
    g.startTime = cur.getTime();
    g.dirty = true;
    psRender();
}

function psGHole(gi, val) {
    var g = psState.groups[gi];
    if (!g) return;
    g.startHole = Math.max(1, Math.min(18, parseInt(val, 10) || 1));
    g.dirty = true;
    psRender();
}

function psGFormat(gi, val) {
    var g = psState.groups[gi];
    if (!g) return;
    g.format = val || '';
    g.dirty = true;
    psRender();
}

function psGTee(gi, mi, val) {
    var g = psState.groups[gi];
    var p = g && g.members[mi];
    if (!p) return;
    p.tee = val;
    g.dirty = true;
    psRender();
}

function psGHcp(gi, mi, raw) {
    var g = psState.groups[gi];
    var p = g && g.members[mi];
    if (!p) return;
    var parsed = psParseHcp(raw);
    if (parsed === null && String(raw || '').trim() !== '') {
        toast(psL('⚠️ Некорректный гандикап: ' + raw, '⚠️ Invalid handicap: ' + raw), 'error');
    }
    p.hcp = parsed;
    g.dirty = true;
    psRender();
}

function psGMarker(gi, mi, targetId) {
    var g = psState.groups[gi];
    var p = g && g.members[mi];
    if (!p) return;
    g.markerTargets = g.markerTargets || {};
    if (targetId && targetId !== p.id) g.markerTargets[p.id] = targetId;
    else delete g.markerTargets[p.id];
    g.dirty = true;
    psRender();
}

function psGMarkersAuto() {
    if (!psState.groups.length) return;
    psState.groups.forEach(function(g) { g.markerTargets = {}; g.dirty = true; });
    psRender();
    toast(psL('🔄 Маркеры назначены автоматически по кругу в каждой группе', '🔄 Markers re-assigned automatically in a circle within each group'), 'success');
}

function psNewGroupSchedule(prevGroups) {
    var proto = psState.proto || {};
    var base = psStartBaseTs(proto);
    var intervalMs = psIntervalMs(proto);
    var idx = (prevGroups || []).length;
    if (proto.scheme === 'all18') {
        return psAll18Schedule(idx, proto);
    }
    if (proto.scheme === '1-10') {
        var hole = (idx % 2 === 0) ? 1 : 10;
        var t = base + Math.floor(idx / 2) * intervalMs + (idx % 2) * Math.round(intervalMs / 2);
        return { startHole: hole, startTime: t };
    }
    // если у последней группы время сдвинуто вручную — продолжаем от него
    var last = prevGroups[prevGroups.length - 1];
    if (last && last.startTime) return { startHole: parseInt(last.startHole || 1, 10) || 1, startTime: last.startTime + intervalMs };
    return { startHole: 1, startTime: base + idx * intervalMs };
}

function psAddGroup() {
    if (!psState.groups) psState.groups = [];
    var sch = psNewGroupSchedule(psState.groups);
    psState.groups.push({ members: [], startHole: sch.startHole, startTime: sch.startTime, format: '', markerTargets: {}, dirty: true });
    psRender();
}

function psGMove(gi, mi, target) {
    var g = psState.groups[gi];
    var p = g && g.members[mi];
    if (!p) return;
    g.members.splice(mi, 1);
    if (g.markerTargets) delete g.markerTargets[p.id];
    if (target === 'new') {
        var sch = psNewGroupSchedule(psState.groups);
        psState.groups.push({ members: [p], startHole: sch.startHole, startTime: sch.startTime, format: '', markerTargets: {}, dirty: true });
    } else {
        var tIdx = parseInt(target, 10);
        var tg = psState.groups[tIdx];
        if (!tg) { g.members.splice(mi, 0, p); return; }
        if (tg.members.length >= 4) {
            toast(psL('⚠️ В группе уже 4 игрока', '⚠️ The group already has 4 players'), 'warn');
            g.members.splice(mi, 0, p);
            psRender();
            return;
        }
        tg.members.push(p);
        tg.dirty = true;
    }
    g.dirty = true;
    psGroupsDirtyMark();
    psRender();
}

function psGRemove(gi, mi) {
    var g = psState.groups[gi];
    var p = g && g.members[mi];
    if (!p) return;
    var warn = '';
    if (psState.editingId) {
        warn = '\n' + psL('Игрок будет удалён из протокола и раунда при сохранении.', 'The player will be removed from the protocol and the round on save.');
        if (psPlayerHasScores(g, p.id)) {
            warn += '\n⚠️ ' + psL('У игрока уже есть введённый счёт в раунде — он будет удалён вместе с игроком при сохранении.', 'The player already has scores in the round — they will be deleted together with the player on save.');
        }
    }
    var gTitle = psGroupTitle(g, gi);
    if (!confirm(psL('Убрать игрока «' + psFullRus(p) + '» из ' + gTitle + '?', 'Remove player “' + psFullRus(p) + '” from ' + gTitle + '?') + warn)) return;
    g.members.splice(mi, 1);
    if (g.markerTargets) {
        delete g.markerTargets[p.id];
        Object.keys(g.markerTargets).forEach(function(k) { if (g.markerTargets[k] === p.id) delete g.markerTargets[k]; });
    }
    g.dirty = true;
    psRender();
}

function psGRemoveGroup(gi) {
    var g = psState.groups[gi];
    if (!g) return;
    var gTitle = psGroupTitle(g, gi);
    var msg = g.members.length
        ? psL('Удалить ' + gTitle + ' (' + g.members.length + ' игр.)?', 'Delete ' + gTitle + ' (' + g.members.length + ' players)?')
        : psL('Удалить пустую ' + gTitle + '?', 'Delete empty ' + gTitle + '?');
    if (psState.editingId && g.roundId) {
        msg += '\n\n⚠️ ' + psL('Связанный раунд и весь введённый в нём счёт будут удалены при сохранении.', 'The linked round and all of its scores will be deleted on save.');
    } else if (g.members.length) {
        msg += '\n' + psL('Игроки, которых нет в общем списке участников, вернутся в него.', 'Players that are not in the roster will be put back into it.');
    }
    if (!confirm(msg)) return;
    if (g.roundId && psState.editingId) psState.editDeletedRounds.push(g.roundId);
    if (!psState.editingId && psState.proto) {
        // Возвращаем в ростер только тех, кого там нет (игроки, добавленные прямо в группу)
        g.members.forEach(function(p) {
            var inRoster = false;
            psState.proto.players.forEach(function(rp) { if (rp.id === p.id) inRoster = true; });
            if (!inRoster) psState.proto.players.push(p);
        });
    }
    psState.groups.splice(gi, 1);
    psGroupsDirtyMark();
    psRender();
}

function psGAddToggle(gi, hide) {
    var form = psEl('ps-ga-form-' + gi);
    if (!form) return;
    if (hide === true) { form.classList.add('hidden'); return; }
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
        var f = psEl('ps-ga-fio-' + gi); if (f) f.focus();
    }
}

function psGAddPlayer(gi) {
    var g = psState.groups[gi];
    if (!g) return;
    if (g.members.length >= 4) {
        toast(psL('⚠️ В группе уже 4 игрока — сначала освободите место', '⚠️ The group already has 4 players — free a slot first'), 'warn');
        return;
    }
    var fio = (psEl('ps-ga-fio-' + gi) || {}).value || '';
    var hcpRaw = (psEl('ps-ga-hcp-' + gi) || {}).value || '';
    var genderSel = (psEl('ps-ga-gender-' + gi) || {}).value || 'men';
    var teeSel = (psEl('ps-ga-tee-' + gi) || {}).value || null;
    var parsed = psSplitFio(fio);
    if (!parsed.lastName && !parsed.firstName) {
        toast(psL('⚠️ Введите ФИО игрока', '⚠️ Enter the player name'), 'error');
        return;
    }
    var hcp = psParseHcp(hcpRaw);
    if (hcp === null) {
        toast(psL('⚠️ Укажите корректный точный гандикап', '⚠️ Enter a valid exact handicap'), 'error');
        return;
    }
    // Женское имя/фамилия при нетронутом селекте пола — тоже девушка.
    var gender = genderSel;
    if (genderSel === 'men' && psGuessGender(parsed.lastName, parsed.firstName, parsed.middleName) === 'women') gender = 'women';
    var tee = teeSel || psDefaultTeeFor(gender, hcp);
    if (gender === 'women' && teeSel === ((psState.proto && psState.proto.tee) || 'wh') && teeSel !== psDefaultTeeFor('women', hcp)) {
        tee = psDefaultTeeFor('women', hcp);
    }
    var p = psNewPlayer();
    p.lastName = parsed.lastName; p.firstName = parsed.firstName; p.middleName = parsed.middleName || '';
    p.hcp = hcp; p.gender = gender; p.tee = tee;
    p.source = psState.editingId ? 'edit' : 'manual';
    p.id = 'gst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);

    // Такой игрок уже есть в группе?
    var key = psKeyOf(p);
    var dupInGroup = false;
    g.members.forEach(function(ex) { if (psKeyOf(ex) === key && key) dupInGroup = true; });
    if (dupInGroup) {
        toast(psL('⚠️ Этот игрок уже в группе', '⚠️ This player is already in the group'), 'warn');
        return;
    }
    // …или ждёт в общем списке участников — тогда просто переносим из него
    if (!psState.editingId && psState.proto && psState.proto.players.length) {
        for (var i = 0; i < psState.proto.players.length; i++) {
            var ex = psState.proto.players[i];
            if (psKeyOf(ex) === key && key) {
                psState.proto.players.splice(i, 1);
                g.members.push(ex);
                g.dirty = true;
                psGAddToggle(gi, true);
                psRender();
                toast(psL('✅ ' + psFullRus(ex) + ' — перенесён из списка участников в ' + psGroupTitle(g, gi), '✅ ' + psFullRus(ex) + ' — moved from the roster into ' + psGroupTitle(g, gi)), 'success');
                return;
            }
        }
    }
    // …или сидит в другой группе — перемещаем
    for (var gj = 0; gj < psState.groups.length; gj++) {
        var og = psState.groups[gj];
        for (var mj = 0; mj < og.members.length; mj++) {
            var om = og.members[mj];
            if (psKeyOf(om) === key && key) {
                if (og.members.length <= 1) {
                    // группу из одного не опустошаем молча
                    toast(psL('⚠️ Игрок уже в ' + psGroupTitle(og, gj), '⚠️ The player is already in ' + psGroupTitle(og, gj)), 'warn');
                    return;
                }
                og.members.splice(mj, 1);
                if (og.markerTargets) delete og.markerTargets[om.id];
                og.dirty = true;
                g.members.push(om);
                g.dirty = true;
                psGAddToggle(gi, true);
                psRender();
                toast(psL('✅ ' + psFullRus(om) + ' — перемещён из ' + psGroupTitle(og, gj) + ' в ' + psGroupTitle(g, gi), '✅ ' + psFullRus(om) + ' — moved from ' + psGroupTitle(og, gj) + ' to ' + psGroupTitle(g, gi)), 'success');
                return;
            }
        }
    }
    g.members.push(p);
    g.dirty = true;
    psGAddToggle(gi, true);
    psRender();
    toast(psL('✅ ' + psFullRus(p) + ' ' + psL('добавлен в', 'added to') + ' ' + psGroupTitle(g, gi), '✅ ' + psFullRus(p) + ' added to ' + psGroupTitle(g, gi)), 'success');
}

// Перенос игрока из списка участников сразу в нужную группу
function psRosterToGroup(idx, target) {
    var proto = psState.proto;
    if (!proto || idx < 0 || idx >= proto.players.length) return;
    var p = proto.players[idx];
    proto.players.splice(idx, 1);
    if (target === 'new') {
        var sch = psNewGroupSchedule(psState.groups);
        psState.groups.push({ members: [p], startHole: sch.startHole, startTime: sch.startTime, format: '', markerTargets: {}, dirty: true });
    } else {
        var tIdx = parseInt(target, 10);
        var tg = psState.groups[tIdx];
        if (!tg || tg.members.length >= 4) {
            toast(psL('⚠️ В этой группе нет места', '⚠️ No free slots in that group'), 'warn');
            proto.players.splice(idx, 0, p);
            psRender();
            return;
        }
        tg.members.push(p);
        tg.dirty = true;
    }
    psRender();
}

// ----------------------------------------------------------
// 4. СОХРАНЕНИЕ ПРОТОКОЛА
// ----------------------------------------------------------
function psSaveProtocol() {
    var proto = psState.proto;
    if (!proto) return;
    if (psState.editingId) { psSaveEdits(); return; }
    if (!proto.tournamentId) {
        toast(psL('⚠️ Сначала выберите турнир (блок 1)', '⚠️ Pick a tournament first (block 1)'), 'error');
        return;
    }
    if (!proto.players.length && !(psState.groups && psState.groups.length)) {
        toast(psL('⚠️ Добавьте участников (блок 2)', '⚠️ Add players (block 2)'), 'error');
        return;
    }
    if (typeof db === 'undefined' || !db) {
        toast(psL('⚠️ Нет соединения с базой', '⚠️ No database connection'), 'error');
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
    // пустые группы не сохраняем
    groups = groups.filter(function(g) { return (g.members || []).length > 0; });
    psSortGroupsShotgun(groups, proto.scheme);
    if (!groups.length) {
        toast(psL('⚠️ Во всех группах пусто — добавьте игроков', '⚠️ All groups are empty — add players'), 'error');
        return;
    }

    var formatsList = psResolvedFormats();
    var format = formatsList[0] || 'Stroke Play';
    var fmtTxt = formatsList.join(' + ');
    var totalPlayers = 0;
    groups.forEach(function(g) { totalPlayers += g.members.length; });

    var alreadySaved = !!psState.savedId;
    var msg = psL(
        'Создать ' + groups.length + ' групп-раундов для ' + totalPlayers + ' игроков?\n\n' +
        'Будут созданы раунды (форматы: ' + fmtTxt + '). После этого каждый игрок получит QR-код на свою карточку.' +
        (alreadySaved ? '\n\n⚠️ Протокол уже сохранён ранее — будет создан ещё один, новый.' : ''),
        'Create ' + groups.length + ' group rounds for ' + totalPlayers + ' players?\n\n' +
        'Rounds will be created (formats: ' + fmtTxt + '). Every player will then get a QR code to their scorecard.' +
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

        var groupFormat = (g.format && String(g.format).trim()) ? String(g.format).trim() : format;
        // Группа без своего формата играет по ВСЕМ форматам протокола
        var groupFormats = (g.format && String(g.format).trim()) ? [groupFormat] : formatsList;
        var groupPlayers = g.members.map(function(p) {
            var key = ensureKey(p);
            p.id = key;
            var fieldHcp = psCalcFieldHcp(p);
            roundPlayers[key] = psPlayerRoundEntry(p, fieldHcp);
            participants.push(key);
            return {
                id: key,
                lastName: p.lastName || '',
                firstName: p.firstName || '',
                middleName: p.middleName || '',
                gender: p.gender || 'men',
                tee: p.tee || 'wh',
                exactHcp: psEffectiveExact(p),
                exactHcpRaw: (p.hcp === null || p.hcp === undefined || p.hcp === '') ? 0 : (parseFloat(p.hcp) || 0),
                fieldHcp: fieldHcp
            };
        });

        // Маркеры: ручные назначения, если админ их менял, иначе — каждый маркирует
        // следующего в группе (по кругу)
        var groupMarkers = psGroupMarkersResolved(g);
        if (participants.length >= 2) {
            groupMarkers.forEach(function(mk) {
                if (roundPlayers[mk.targetId]) {
                    roundPlayers[mk.targetId].markedBy = mk.markerId;
                    markerAssignments[mk.markerId] = {
                        targetId: mk.targetId,
                        targetName: roundPlayers[mk.targetId].name || ''
                    };
                }
            });
        } else {
            groupMarkers = [];
        }

        var roundData = {
            mode: 'group',
            tee: g.members[0].tee || 'wh',
            format: groupFormat,
            formats: groupFormats,
            startHole: g.startHole || 1,
            startTime: g.startTime,
            holeRange: '1-18', // 18 лунок (порядок — со стартовой лунки)
            players: roundPlayers,
            markerAssignments: markerAssignments,
            participantsList: participants,
            status: 'active',
            tournamentId: proto.tournamentId,
            tournamentName: proto.tournamentName || '',
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
                format: groupFormat,
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
            formats: formatsList,
            scheme: proto.scheme || '1',
            size: parseInt(proto.size, 10) || 4,
            method: proto.method || 'hcpSnake',
            interval: parseInt(proto.interval, 10) || 8,
            startTime: proto.startTime || '09:00',
            hcpCut: { enabled: proto.hcpCutEnabled === true, percent: proto.hcpCutPercent || 100, maxEnabled: proto.hcpCutMaxEnabled === true, maxMen: (proto.hcpMaxMen === '' ? null : proto.hcpMaxMen), maxWomen: (proto.hcpMaxWomen === '' ? null : proto.hcpMaxWomen) },
            playersCount: totalPlayers,
            groupsCount: groups.length,
            status: 'ready',
            groups: groupStore,
            createdAt: Date.now(),
            createdBy: (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid : 'admin'
        };
        return db.ref('protocols/' + pid).set(protocolDoc);
    }).then(function() {
        // Раунды созданы и игра началась — турнир переходит в active,
        // запись на него закрывается. Завершённые турниры не трогаем.
        return db.ref('tournaments/' + proto.tournamentId + '/status').once('value').then(function(stSn) {
            var st = stSn.val();
            if (!st || st === 'upcoming') {
                return db.ref('tournaments/' + proto.tournamentId).update({ status: 'active', startedAt: Date.now() });
            }
            return null;
        }).catch(function() { return null; });
    }).then(function() {
        psState.savedId = pid;
        psState.busy = false;
        psState.groups = [];
        psRender();
        toast(psL('🎉 Протокол сохранён: ' + groups.length + ' групп, ' + totalPlayers + ' игроков', '🎉 Protocol saved: ' + groups.length + ' groups, ' + totalPlayers + ' players'), 'success');
        if (typeof vib === 'function') vib([60, 40, 60]);
        try { psAutoSyncSavedGroups(groups); } catch (e) { console.warn('[start] autosync', e); }
    }).catch(function(err) {
        psState.busy = false;
        console.error('[start] save error', err);
        toast(psL('⚠️ Ошибка сохранения: ' + (err && err.message || err), '⚠️ Save error: ' + (err && err.message || err)), 'error');
    });
}

// ----------------------------------------------------------
// 4а. РЕДАКТИРОВАНИЕ СОХРАНЁННОГО ПРОТОКОЛА
// Состав групп, игроки, ТИ, форматы и маркеры меняются «на месте»:
// раунды в базе обновляются под теми же ключами, поэтому уже
// розданные QR-коды продолжают работать (новичку достаточно
// QR-карточки игрока, которого он заменяет).
// ----------------------------------------------------------
// При открытии протокола на правку подтягиваем в «Участники стартового листа»
// всех заявленных на турнир игроков, которых ещё нет ни в одной группе.
// Источник приоритета: регистрация турнира → аккаунты найденных игроков.
// Если регистрации нет (старый протокол), достраиваем по аккаунтам всех
// участников групп. Без базы тихо выходим — правка групп всё равно работает.
function psPrefillEditRoster() {
    if (typeof db === 'undefined' || !db) return;
    if (!psState.proto || !psState.selId) return;
    var inGroups = {};
    (psState.groups || []).forEach(function(g) {
        (g.members || []).forEach(function(m) {
            var k = psKeyOf(m);
            if (k) inGroups[k] = true;
        });
    });
    db.ref('tournaments/' + psState.selId + '/registeredPlayers').once('value').then(function(sn) {
        var reg = sn.val() || {};
        var keys = Object.keys(reg);
        if (!keys.length) return;
        psLoadUsers(function(users) {
            if (!psState.editingId || !psState.proto) return; // правку уже закрыли
            var added = 0;
            keys.forEach(function(uid) {
                var r = reg[uid] || {};
                var p = psNewPlayer();
                p.id = uid;
                p.source = 'registered';
                p.hcp = (r.handicap !== undefined && r.handicap !== null) ? parseFloat(r.handicap) : null;
                var u = users[uid] || (r.uid ? users[r.uid] : null) || {};
                var up = psUserParts(u);
                if (up.lastName || up.firstName) {
                    p.lastName = up.lastName;
                    p.firstName = up.firstName;
                    p.middleName = up.middleName;
                    if (!p.hcp && u.handicap !== undefined && u.handicap !== null) p.hcp = parseFloat(u.handicap);
                    if (r.uid && users[r.uid] && !users[uid]) p.id = r.uid;
                } else {
                    var parsed = psSplitFio(r.name || '');
                    p.lastName = parsed.lastName;
                    p.firstName = parsed.firstName;
                    p.middleName = parsed.middleName;
                    if (r.uid && users[r.uid]) p.id = r.uid;
                }
                if ((p.hcp === null || isNaN(p.hcp)) && u && u.handicap !== undefined && u.handicap !== null) p.hcp = parseFloat(u.handicap);
                if (!p.lastName && !p.firstName) return;
                p.gender = r.gender || u.gender || psGuessGender(p.lastName, p.firstName, p.middleName);
                p.tee = r.tee || u.defaultTee || psDefaultTeeFor(p.gender, p.hcp);
                var k = psKeyOf(p);
                if (k && inGroups[k]) return; // уже играет в одной из групп
                var dup = false;
                psState.proto.players.forEach(function(ex) { if (!dup && psSamePerson(ex, p)) dup = true; });
                if (dup) return;
                p.uidMatched = !!p.id && String(p.id).indexOf('gst_') !== 0 && !!users[p.id];
                psState.proto.players.push(p);
                if (k) inGroups[k] = true;
                added++;
            });
            if (added > 0) {
                psRender();
                psScrollToRoster();
                toast(psL('📋 В стартовый лист подтянуто ' + added + ' заявленных (их нет в группах) — переносите кнопкой «В группу…»', '📋 Pulled ' + added + ' registered players into the start list (not in any group) — move them with “Into group…”'), 'info');
            }
        });
    }).catch(function() {});
}

function psScrollToRoster() {
    var el = psEl('ps-roster-card');
    if (el && el.scrollIntoView) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { el.scrollIntoView(); }
    }
}

function psEditProtocol(pid) {
    if (!pid || typeof db === 'undefined' || !db || psState.busy) return;
    toast(psL('⏳ Загружаю протокол…', '⏳ Loading protocol…'), 'info');
    db.ref('protocols/' + pid).once('value').then(function(sn) {
        var doc = sn.val();
        if (!doc || !doc.groups) {
            toast(psL('⚠️ Протокол не найден или без групп', '⚠️ Protocol not found or has no groups'), 'error');
            return;
        }
        psState.editingId = pid;
        psState.savedId = pid;
        psState.excel = null;
        psState.editDeletedRounds = [];

        if (doc.tournamentId) psState.selId = doc.tournamentId;
        var proto = psDefaultProto();
        proto.name = doc.name || '';
        proto.tournamentId = doc.tournamentId || '';
        proto.tournamentName = doc.tournamentName || '';
        proto.date = doc.date || '';
        proto.format = doc.format || 'Stroke Play';
        proto.formats = (doc.formats && doc.formats.length) ? doc.formats.slice() : [];
        proto.size = parseInt(doc.size, 10) || 4;
        proto.method = 'order';
        proto.scheme = doc.scheme || '1';
        proto.interval = parseInt(doc.interval, 10) || 8;
        proto.startTime = doc.startTime || '09:00';
        proto.tee = doc.tee || 'wh';
        if (doc.hcpCut) {
            proto.hcpCutEnabled = doc.hcpCut.enabled === true;
            proto.hcpCutPercent = (doc.hcpCut.percent == null || doc.hcpCut.percent === '') ? 100 : doc.hcpCut.percent;
            proto.hcpCutMaxEnabled = (doc.hcpCut.maxEnabled === undefined || doc.hcpCut.maxEnabled === null)
                ? (doc.hcpCut.maxMen != null || doc.hcpCut.maxWomen != null)
                : (doc.hcpCut.maxEnabled === true);
            proto.hcpMaxMen = (doc.hcpCut.maxMen == null) ? '' : doc.hcpCut.maxMen;
            proto.hcpMaxWomen = (doc.hcpCut.maxWomen == null) ? '' : doc.hcpCut.maxWomen;
        }
        proto.players = []; // ниже подтянем всех заявленных, кого ещё нет в группах
        psState.proto = proto;

        var gkeys = Object.keys(doc.groups).sort(function(a, b) {
            return (parseInt(String(a).replace('g', ''), 10) || 0) - (parseInt(String(b).replace('g', ''), 10) || 0);
        });
        var groups = [];
        var roundIds = [];
        gkeys.forEach(function(k) {
            var gd = doc.groups[k] || {};
            var members = (gd.players || []).map(function(pl) {
                return {
                    id: pl.id || ('gst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7)),
                    lastName: pl.lastName || '',
                    firstName: pl.firstName || '',
                    middleName: pl.middleName || '',
                    gender: pl.gender || 'men',
                    tee: pl.tee || 'wh',
                    hcp: (pl.exactHcpRaw === 0 || pl.exactHcpRaw) ? parseFloat(pl.exactHcpRaw) : ((pl.exactHcp === 0 || pl.exactHcp) ? parseFloat(pl.exactHcp) : null),
                    source: 'protocol',
                    uidMatched: !!pl.id && String(pl.id).indexOf('gst_') !== 0
                };
            }).filter(function(p) { return p.lastName || p.firstName; });
            var mt = {};
            var autoRing = true;
            (gd.markers || []).forEach(function(mk, i) {
                if (mk && mk.markerId && mk.targetId) mt[mk.markerId] = mk.targetId;
            });
            // если существующие назначения совпадают с автокольцом — считаем их автоматическими
            var ring = psMarkersForGroup(members);
            var diffCnt = 0, ringMap = {};
            ring.forEach(function(m) { ringMap[m.marker.id] = m.target.id; });
            Object.keys(mt).forEach(function(k) { if (ringMap[k] !== mt[k]) diffCnt++; });
            if (diffCnt > 0) autoRing = false;
            groups.push({
                members: members,
                startHole: parseInt(gd.startHole || 1, 10) || 1,
                startTime: gd.startTime || psStartBaseTs(proto),
                format: (gd.format && gd.format !== (doc.format || '') && (!doc.formats || doc.formats.indexOf(gd.format) === -1)) ? gd.format : '',
                markerTargets: autoRing ? {} : mt,
                roundId: gd.roundId || null,
                dirty: false
            });
            if (gd.roundId) roundIds.push(gd.roundId);
        });
        psState.groups = groups;
        psSortGroupsShotgun(psState.groups, proto.scheme);
        psState.editRounds = {};
        psPrefillEditRoster(); // всех заявленных, кого нет в группах, — в стартовый лист
        psRender();
        if (!roundIds.length) {
            psScrollToGroups();
            toast(psL('✏️ Протокол открыт для правки — раунды в базе не найдены, при сохранении они будут созданы заново', '✏️ Protocol opened for editing — rounds were not found in the database and will be recreated on save'), 'info');
            return;
        }
        // Подтягиваем текущие данные раундов, чтобы не потерять введённый счёт
        var done = 0;
        roundIds.forEach(function(rid) {
            db.ref('rounds/' + rid).once('value').then(function(rs) {
                psState.editRounds[rid] = rs.val() || {};
            }).catch(function() {
                psState.editRounds[rid] = {};
            }).then(function() {
                done++;
                if (done === roundIds.length) {
                    psRender();
                    psScrollToGroups();
                    toast(psL('✏️ Протокол открыт для правки — QR-коды игроков останутся прежними', '✏️ Protocol opened for editing — players’ QR codes stay the same'), 'success');
                }
            });
        });
    }).catch(function(err) {
        toast(psL('⚠️ Ошибка загрузки: ' + (err && err.message || err), '⚠️ Load error: ' + (err && err.message || err)), 'error');
    });
}

function psScrollToGroups() {
    var el = psEl('ps-groups-result') || psEl('ps-distribute-holder');
    if (el && el.scrollIntoView) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { el.scrollIntoView(); }
    }
}

function psCancelEdit() {
    if (!psState.editingId) return;
    if (!confirm(psL('Отменить редактирование протокола? Несохранённые правки будут потеряны.', 'Cancel protocol editing? Unsaved changes will be lost.'))) return;
    psState.editingId = null;
    psState.editRounds = {};
    psState.editDeletedRounds = [];
    psState.groups = [];
    psState.proto = psDefaultProto();
    psState.proto.tournamentId = psState.selId || '';
    psRender();
}

function psSaveEdits() {
    var pid = psState.editingId;
    if (!pid) { psSaveProtocol(); return; }
    var proto = psState.proto;
    if (!proto) return;
    if (psState.busy) return;
    if (typeof db === 'undefined' || !db) return;

    var groups = (psState.groups || []).filter(function(g) { return (g.members || []).length > 0; });
    psSortGroupsShotgun(groups, proto.scheme);
    if (!groups.length) {
        toast(psL('⚠️ В протоколе не осталось игроков — удалите протокол вместо сохранения', '⚠️ No players left in the protocol — delete it instead of saving'), 'error');
        return;
    }
    var formatsList = psResolvedFormats();
    var format = formatsList[0] || 'Stroke Play';
    var totalPlayers = 0;
    groups.forEach(function(g) { totalPlayers += g.members.length; });

    // Что произойдёт с удалёнными игроками/группами
    var removedPlayers = [];
    var removedRoundsCount = psState.editDeletedRounds.length;
    groups.forEach(function(g) {
        if (!g.roundId) return;
        var rd = psState.editRounds[g.roundId] || {};
        var oldPlayers = rd.players || {};
        var keep = {};
        g.members.forEach(function(p) { keep[p.id] = true; });
        Object.keys(oldPlayers).forEach(function(k) {
            if (!keep[k]) removedPlayers.push((oldPlayers[k] && oldPlayers[k].name) || k);
        });
    });
    var msg = psL(
        'Сохранить изменения в протоколе?\n\nГрупп: ' + groups.length + ' · игроков: ' + totalPlayers + '. Раунды обновятся «на месте» — розданные QR-коды продолжат работать.',
        'Save changes to the protocol?\n\nGroups: ' + groups.length + ' · players: ' + totalPlayers + '. Rounds will be updated in place — the handed-out QR codes keep working.');
    if (removedPlayers.length) {
        msg += '\n\n⚠️ ' + psL('Будут удалены из раундов вместе со счётом: ', 'Will be removed from rounds together with their scores: ') + removedPlayers.join(', ');
    }
    if (removedRoundsCount) {
        msg += '\n⚠️ ' + psL('Будут полностью удалены группы-раунды: ', 'Group rounds will be fully deleted: ') + removedRoundsCount;
    }
    if (!confirm(msg)) return;

    psState.busy = true;
    var roundsRef = db.ref('rounds');

    // 1) Создаём раунды для НОВЫХ групп (у которых ещё нет roundId)
    var createJobs = [];
    groups.forEach(function(g, gi) {
        if (g.roundId) return;
        var groupFormat = (g.format && String(g.format).trim()) ? String(g.format).trim() : format;
        var groupFormats = (g.format && String(g.format).trim()) ? [groupFormat] : formatsList;
        var roundPlayers = {}, participants = [], markerAssignments = {}, groupPlayers = [], groupMarkers = [];
        g.members.forEach(function(p) {
            var key = p.id || ('gst_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7));
            p.id = key;
            var fieldHcp = psCalcFieldHcp(p);
            roundPlayers[key] = psPlayerRoundEntry(p, fieldHcp);
            participants.push(key);
            groupPlayers.push({
                id: key, lastName: p.lastName || '', firstName: p.firstName || '', middleName: p.middleName || '',
                gender: p.gender || 'men', tee: p.tee || 'wh',
                exactHcp: psEffectiveExact(p),
                exactHcpRaw: (p.hcp === null || p.hcp === undefined || p.hcp === '') ? 0 : (parseFloat(p.hcp) || 0),
                fieldHcp: fieldHcp
            });
        });
        if (participants.length >= 2) {
            groupMarkers = psGroupMarkersResolved(g);
            groupMarkers.forEach(function(mk) {
                if (roundPlayers[mk.targetId]) {
                    roundPlayers[mk.targetId].markedBy = mk.markerId;
                    markerAssignments[mk.markerId] = { targetId: mk.targetId, targetName: roundPlayers[mk.targetId].name || '' };
                }
            });
        }
        var roundData = {
            mode: 'group',
            tee: g.members[0].tee || 'wh',
            format: groupFormat,
            formats: groupFormats,
            startHole: g.startHole || 1,
            startTime: g.startTime,
            holeRange: '1-18',
            players: roundPlayers,
            markerAssignments: markerAssignments,
            participantsList: participants,
            status: 'active',
            tournamentId: proto.tournamentId,
            tournamentName: proto.tournamentName || '',
            protocolId: pid,
            protocolName: proto.name || '',
            groupNo: 0, // проставим после создания
            createdAt: Date.now(),
            createdBy: (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid : 'admin',
            accessKey: 'protocol_' + pid + '_new'
        };
        var job = roundsRef.push(roundData).then(function(ref) {
            g.roundId = ref.key;
            g.__newPlayers = groupPlayers;
            g.__newMarkers = groupMarkers;
        });
        createJobs.push(job);
    });

    Promise.all(createJobs).then(function() {
        // 2) Два прохода: сперва удаления (отдельным update — чтобы пути не
        // пересекались с последующими установками), затем установки.
        var nulls = {};
        var sets = {};
        var groupStore = {};
        var giNum = 0;

        // Полностью удалённые группы — вместе с раундами
        (psState.editDeletedRounds || []).forEach(function(rid) {
            nulls['rounds/' + rid] = null;
        });
        // Документ протокола: устаревшие группы затираем целиком
        nulls['protocols/' + pid + '/groups'] = null;

        groups.forEach(function(g) {
            giNum++;
            var rid = g.roundId;
            var groupFormat = (g.format && String(g.format).trim()) ? String(g.format).trim() : format;
            var groupFormats = (g.format && String(g.format).trim()) ? [groupFormat] : formatsList;
            var oldRound = (rid && psState.editRounds[rid]) || null;
            var oldPlayers = (oldRound && oldRound.players) || {};
            var groupPlayers = g.__newPlayers || [];
            var groupMarkers = g.__newMarkers || psGroupMarkersResolved(g);
            var participants = [];
            var markerAssignments = {};
            var markedByOf = {};

            if (rid && !oldRound) {
                // только что созданная группа — полный объект уже записан шагом 1,
                // нужны лишь недостающие поля
                sets['rounds/' + rid + '/groupNo'] = giNum;
                sets['rounds/' + rid + '/accessKey'] = 'protocol_' + pid + '_' + (giNum - 1);
            } else if (rid && oldRound) {
                var keep = {};
                g.members.forEach(function(p) { keep[p.id] = true; });

                // Удалённые из группы игроки — вместе с их счётом
                Object.keys(oldPlayers).forEach(function(k) {
                    if (keep[k]) return;
                    nulls['rounds/' + rid + '/players/' + k] = null;
                    // зачистка ссылок на удалённого маркера у остальных
                    g.members.forEach(function(p) {
                        var op = oldPlayers[p.id];
                        if (op && op.markerScores && op.markerScores[k] !== undefined) {
                            delete op.markerScores[k];
                            nulls['rounds/' + rid + '/players/' + p.id + '/markerScores/' + k] = null;
                        }
                        if (op && op.markerSubmitted && op.markerSubmitted[k] !== undefined) {
                            delete op.markerSubmitted[k];
                            nulls['rounds/' + rid + '/players/' + p.id + '/markerSubmitted/' + k] = null;
                        }
                    });
                });
                // Чтобы списки гарантированно сократились — сначала обнуляем их целиком
                nulls['rounds/' + rid + '/markerAssignments'] = null;
                nulls['rounds/' + rid + '/participantsList'] = null;

                // Маркеры: полный пересчёт назначений группы
                if (g.members.length >= 2) {
                    groupMarkers.forEach(function(mk) {
                        if (!keep[mk.markerId] || !keep[mk.targetId]) return;
                        markerAssignments[mk.markerId] = { targetId: mk.targetId, targetName: mk.targetName };
                        markedByOf[mk.targetId] = mk.markerId;
                    });
                }

                g.members.forEach(function(p) {
                    participants.push(p.id);
                    var fieldHcp = psCalcFieldHcp(p);
                    var entry;
                    if (oldPlayers[p.id]) {
                        // Сохраняем счёт и служебные поля, обновляем анкету — ссылка/QR игрока не меняется
                        entry = oldPlayers[p.id];
                        entry.name = psNameForRound(p) || entry.name || 'Player';
                        entry.firstName = p.firstName || '';
                        entry.middleName = p.middleName || '';
                        entry.lastName = p.lastName || '';
                        entry.gender = p.gender || entry.gender || 'men';
                        entry.tee = p.tee || entry.tee || 'wh';
                        entry.exactHcp = psEffectiveExact(p);
                        entry.exactHcpRaw = (p.hcp === null || p.hcp === undefined || p.hcp === '') ? 0 : (parseFloat(p.hcp) || 0);
                        entry.fieldHcp = fieldHcp;
                    } else {
                        entry = psPlayerRoundEntry(p, fieldHcp);
                    }
                    entry.markedBy = markedByOf[p.id] || null; // null-лист в update() удаляет значение
                    delete entry.markerAssignments;
                    sets['rounds/' + rid + '/players/' + p.id] = entry;
                    groupPlayers.push({
                        id: p.id, lastName: p.lastName || '', firstName: p.firstName || '', middleName: p.middleName || '',
                        gender: p.gender || 'men', tee: p.tee || 'wh',
                        exactHcp: psEffectiveExact(p),
                        exactHcpRaw: (p.hcp === null || p.hcp === undefined || p.hcp === '') ? 0 : (parseFloat(p.hcp) || 0),
                        fieldHcp: fieldHcp
                    });
                });

                sets['rounds/' + rid + '/markerAssignments'] = Object.keys(markerAssignments).length ? markerAssignments : null;
                sets['rounds/' + rid + '/participantsList'] = participants;
                sets['rounds/' + rid + '/format'] = groupFormat;
                sets['rounds/' + rid + '/formats'] = groupFormats;
                sets['rounds/' + rid + '/tee'] = (g.members[0] && g.members[0].tee) || 'wh';
                sets['rounds/' + rid + '/startHole'] = g.startHole || 1;
                sets['rounds/' + rid + '/startTime'] = g.startTime;
                sets['rounds/' + rid + '/groupNo'] = giNum;
                sets['rounds/' + rid + '/protocolName'] = proto.name || '';
                sets['rounds/' + rid + '/tournamentName'] = proto.tournamentName || '';
                // Если раунд был удалён/повреждён вне редактора — восстанавливаем его полностью
                if (!oldRound || !oldRound.players || !oldRound.mode) {
                    sets['rounds/' + rid + '/mode'] = 'group';
                    sets['rounds/' + rid + '/holeRange'] = '1-18';
                    sets['rounds/' + rid + '/status'] = 'active';
                    sets['rounds/' + rid + '/tournamentId'] = proto.tournamentId;
                    sets['rounds/' + rid + '/tournamentName'] = proto.tournamentName || '';
                    sets['rounds/' + rid + '/protocolId'] = pid;
                    sets['rounds/' + rid + '/accessKey'] = 'protocol_' + pid + '_' + (giNum - 1);
                    if (!oldRound || !oldRound.createdAt) sets['rounds/' + rid + '/createdAt'] = Date.now();
                    sets['rounds/' + rid + '/createdBy'] = (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) ? currentUser.uid : 'admin';
                }
            }
            if (!rid) return;
            groupStore['g' + giNum] = {
                roundId: rid,
                groupNo: giNum,
                startHole: g.startHole || 1,
                startTime: g.startTime,
                format: groupFormat,
                players: groupPlayers,
                markers: groupMarkers
            };
            g.__newPlayers = null;
            g.__newMarkers = null;
        });

        // Документ протокола
        sets['protocols/' + pid + '/name'] = proto.name || '';
        sets['protocols/' + pid + '/date'] = proto.date || '';
        sets['protocols/' + pid + '/format'] = format;
        sets['protocols/' + pid + '/formats'] = formatsList;
        sets['protocols/' + pid + '/startTime'] = proto.startTime || '09:00';
        sets['protocols/' + pid + '/interval'] = parseInt(proto.interval, 10) || 8;
        sets['protocols/' + pid + '/hcpCut'] = { enabled: proto.hcpCutEnabled === true, percent: proto.hcpCutPercent || 100, maxEnabled: proto.hcpCutMaxEnabled === true, maxMen: (proto.hcpMaxMen === '' ? null : proto.hcpMaxMen), maxWomen: (proto.hcpMaxWomen === '' ? null : proto.hcpMaxWomen) };
        sets['protocols/' + pid + '/playersCount'] = totalPlayers;
        sets['protocols/' + pid + '/groupsCount'] = groups.length;
        sets['protocols/' + pid + '/groups'] = groupStore;
        sets['protocols/' + pid + '/updatedAt'] = Date.now();

        function applySets() { return db.ref().update(sets); }
        if (Object.keys(nulls).length) {
            return db.ref().update(nulls).then(applySets);
        }
        return applySets();
    }).then(function() {
        psState.busy = false;
        psState.editingId = null;
        psState.editRounds = {};
        psState.editDeletedRounds = [];
        psState.groups = [];
        psState.savedId = pid;
        psState.proto = psDefaultProto();
        psState.proto.tournamentId = psState.selId || '';
        psRender();
        toast(psL('✅ Протокол обновлён — QR-коды игроков остались прежними', '✅ Protocol updated — players’ QR codes stayed the same'), 'success');
        if (typeof vib === 'function') vib([60, 40, 60]);
        try { psAutoSyncSavedGroups(groups); } catch (e) { console.warn('[start] autosync', e); }
    }).catch(function(err) {
        psState.busy = false;
        console.error('[start] edit save error', err);
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
var psSavedCache = null;

function psBindSavedList() {
    if (typeof db === 'undefined' || !db) return;
    if (psSavedBound) {
        // Подписка уже есть, а контейнер psRender() пересоздал заново —
        // перерисовываем из кэша, иначе список залипнет на «Загрузка…».
        if (psSavedCache) {
            try { psRenderSavedListContent(psSavedCache); } catch (e) {}
        }
        return;
    }
    psSavedBound = true;
    db.ref('protocols').orderByChild('createdAt').on('value', function(sn) {
        psSavedCache = sn.val() || {};
        psRenderSavedListContent(psSavedCache);
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
        html += '<button class="btn btn-og" onclick="psEditProtocol(\'' + psState.savedId + '\')"><i class="fas fa-pen-to-square"></i> ' + psL('Изменить состав / маркеров', 'Edit players / markers') + '</button>';
        html += '</div>';
        html += '<p style="font-size:11px;color:var(--muted);margin:10px 0 0;">' + psL('У каждого игрока один QR: в группе из 2+ человек он открывает общую карточку (свой счёт и счёт маркируемого партнёра), одиночный игрок — личную карточку. Правки протокола не меняют QR-коды.', 'Each player has a single QR: in a group of 2+ it opens the shared scorecard (own score and the marked partner’s score), a solo player gets their personal card. Protocol edits never change QR codes.') + '</p>';
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
        var dFmts = (d.formats && d.formats.length) ? d.formats : (d.format ? [d.format] : []);
        if (dFmts.length) html += ' · ' + escapeHtml(dFmts.join(' + '));
        html += '</div></div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
        html += '<button class="btn btn-g btn-sm" onclick="window.open(\'qr-start.html?p=' + e.id + '\',\'_blank\')"><i class="fas fa-print"></i> ' + psL('QR / печать', 'QR / print') + '</button>';
        html += '<button class="btn btn-og btn-sm" onclick="psEditProtocol(\'' + e.id + '\')" title="' + psL('Править группы, игроков и маркеров — QR-коды не изменятся', 'Edit groups, players and markers — QR codes stay the same') + '"><i class="fas fa-pen-to-square"></i> ' + psL('Изменить', 'Edit') + '</button>';
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

// ----------------------------------------------------------
// СИНХРОНИЗАЦИЯ С ТУРНИРОМ И СПИСКОМ ИГРОКОВ САЙТА
// ----------------------------------------------------------
// Участники стартового листа («Участники стартового листа» + все группы)
// записываются в tournaments/<id>/registeredPlayers — счётчик
// «Заявлено участников» на странице турнира обновляется сам.
// Игроков, которых нет в users, автоматически добавляем в список игроков сайта.
// ----------------------------------------------------------

// Все участники черновика: общий список + все группы, без дублей (по id и по ФИО).
function psCollectAllRosterPlayers() {
    var out = [];
    var seenId = {};
    var seenFio = {};
    function push(p) {
        if (!p) return;
        var id = p.id || '';
        var key = psKeyOf(p);
        if (id && seenId[id]) return;
        if (key && seenFio[key]) return;
        if (!(p.lastName || p.firstName)) return;
        if (id) seenId[id] = true;
        if (key) seenFio[key] = true;
        out.push({
            id: id,
            lastName: p.lastName || '',
            firstName: p.firstName || '',
            middleName: p.middleName || '',
            gender: p.gender || 'men',
            tee: p.tee || 'wh',
            hcp: (p.hcp === null || p.hcp === undefined || p.hcp === '') ? null : parseFloat(p.hcp)
        });
    }
    if (psState.proto && psState.proto.players) psState.proto.players.forEach(push);
    if (psState.groups) psState.groups.forEach(function(g) { (g.members || []).forEach(push); });
    return out;
}

// Кнопка «Сохранить список на турнир» (блок 2).
function psSaveRosterToTournament() {
    var tnId = psState.selId || (psState.proto && psState.proto.tournamentId) || '';
    if (!tnId) {
        toast(psL('⚠️ Сначала выберите турнир (блок 1)', '⚠️ Pick a tournament first (block 1)'), 'error');
        return;
    }
    if (typeof db === 'undefined' || !db) {
        toast(psL('⚠️ Нет соединения с базой', '⚠️ No database connection'), 'error');
        return;
    }
    var entries = psCollectAllRosterPlayers();
    if (!entries.length) {
        toast(psL('⚠️ Список участников пуст — добавьте игроков', '⚠️ Roster is empty — add players'), 'error');
        return;
    }
    toast(psL('⏳ Сохраняю список на турнир…', '⏳ Saving roster to tournament…'), 'info');
    psSyncEntriesToTournament(entries, tnId, { silent: false }, function(err, res) {
        if (err) {
            toast(psL('⚠️ Ошибка сохранения: ' + err, '⚠️ Save error: ' + err), 'error');
            return;
        }
        var msg = psL('✅ На турнир записано: ' + res.total +
            (res.usersCreated ? ' · новых в списке игроков: ' + res.usersCreated : ''),
            '✅ Written to tournament: ' + res.total +
            (res.usersCreated ? ' · new site players: ' + res.usersCreated : ''));
        toast(msg, 'success');
        if (typeof vib === 'function') vib([60, 40, 60]);
    });
}

// Тихая синхронизация групп после сохранения протокола/правок.
function psAutoSyncSavedGroups(groups) {
    var tnId = psState.selId || (psState.proto && psState.proto.tournamentId) || '';
    if (!tnId || typeof db === 'undefined' || !db) return;
    var entries = [];
    (groups || []).forEach(function(g) {
        (g.members || []).forEach(function(p) {
            if (!(p.lastName || p.firstName)) return;
            entries.push({
                id: p.id || '',
                lastName: p.lastName || '',
                firstName: p.firstName || '',
                middleName: p.middleName || '',
                gender: p.gender || 'men',
                tee: p.tee || 'wh',
                hcp: (p.hcp === null || p.hcp === undefined || p.hcp === '') ? null : parseFloat(p.hcp)
            });
        });
    });
    if (!entries.length) return;
    psSyncEntriesToTournament(entries, tnId, { silent: true }, function() {});
}

// Ядро синхронизации: entries → tournaments/<tnId>/registeredPlayers (+ users).
// cb(err, { total, usersCreated })
function psSyncEntriesToTournament(entries, tnId, opts, cb) {
    opts = opts || {};
    cb = cb || function() {};
    if (typeof db === 'undefined' || !db) { cb('no-db'); return; }
    Promise.all([
        db.ref('users').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; }),
        db.ref('tournaments/' + tnId + '/registeredPlayers').once('value').then(function(sn) { return sn.val() || {}; }).catch(function() { return {}; })
    ]).then(function(res) {
        var users = res[0] || {};
        var existing = res[1] || {};
        psState.users = users;

        // Индекс пользователей по ФИО (точное + без отчества)
        var fioIndex = {};
        Object.keys(users).forEach(function(uid) {
            var u = users[uid] || {};
            var parts = psUserParts(u);
            var key = psKeyOf(parts);
            if (key && !fioIndex[key]) fioIndex[key] = uid;
            var short = psNorm(parts.lastName) + '|' + psNorm(parts.firstName) + '|';
            if (short !== '||' && !fioIndex['s:' + short]) fioIndex['s:' + short] = uid;
        });

        var updates = {};
        var usersCreated = 0;
        var now = Date.now();
        var usedNewIds = {};

        // Разбор частей ФИО записи заявки (у гостей заполнен только r.name).
        function regRecParts(r) {
            var last = String((r && r.lastName) || '').trim();
            var first = String((r && r.firstName) || '').trim();
            var middle = String((r && r.middleName) || '').trim();
            if ((!last || !first) && r && r.name) {
                var parsed = psSplitFio(r.name);
                if (!last) last = parsed.lastName || '';
                if (!first) first = parsed.firstName || '';
                if (!middle) middle = parsed.middleName || '';
            }
            return { id: (r && r.uid) || '', lastName: last, firstName: first, middleName: middle };
        }

        // Индекс существующих записей заявок: гость записывается под случайным
        // ключом, и повторное сохранение стартового листа не должно плодить для
        // него второй ключ (user_xxx) — иначе участник дублируется.
        var regEntries = [];
        Object.keys(existing || {}).forEach(function(rk) {
            var r = existing[rk] || {};
            var linkedUid = '';
            if (r.uid && users[r.uid]) linkedUid = r.uid;
            else if (users[rk]) linkedUid = rk;
            regEntries.push({ key: rk, rec: r, linkedUid: linkedUid, parts: regRecParts(r) });
        });

        entries.forEach(function(e) {
            var probe = { lastName: e.lastName, firstName: e.firstName, middleName: e.middleName };
            var key = psKeyOf(probe);
            var uid = (key && fioIndex[key]) || null;
            if (!uid) {
                var short = psNorm(e.lastName) + '|' + psNorm(e.firstName) + '|';
                if (short !== '||') uid = fioIndex['s:' + short] || null;
            }
            // Уже привязанный реальный uid из черновика (загрузка из регистрации)
            if (!uid && e.id && users[e.id]) uid = e.id;
            // Тот же человек уже записан в заявках под ключом с аккаунтом —
            // используем этот аккаунт, чтобы не создавать второй.
            if (!uid) {
                for (var ri = 0; ri < regEntries.length; ri++) {
                    var rx = regEntries[ri];
                    if (rx.linkedUid && psSamePerson(probe, rx.parts)) { uid = rx.linkedUid; break; }
                }
            }

            if (!uid) {
                uid = 'user_' + now.toString(36) + '_' + Math.random().toString(36).substring(2, 7);
                while (users[uid] || usedNewIds[uid]) {
                    uid = 'user_' + now.toString(36) + '_' + Math.random().toString(36).substring(2, 7);
                }
                usedNewIds[uid] = true;
                usersCreated++;
                var fullName = [e.firstName, e.middleName, e.lastName].filter(function(w) { return String(w || '').trim(); }).join(' ');
                var newUser = {
                    name: fullName || 'Player',
                    firstName: e.firstName || '',
                    middleName: e.middleName || '',
                    lastName: e.lastName || '',
                    email: '',
                    handicap: (e.hcp === null || e.hcp === undefined || isNaN(e.hcp)) ? null : e.hcp,
                    gender: e.gender || 'men',
                    defaultTee: e.tee || 'wh',
                    role: 'player',
                    createdAt: now,
                    roundsPlayed: 0,
                    bestGross: null,
                    bestStableford: null,
                    hcpSource: 'start-list'
                };
                updates['users/' + uid] = newUser;
                users[uid] = newUser;
                if (key) fioIndex[key] = uid;
            } else if (users[uid]) {
                // Профиль есть: добиваем недостающие данные, гандикап не затираем
                var u = users[uid];
                if ((u.handicap === null || u.handicap === undefined || u.handicap === '') && e.hcp !== null && !isNaN(e.hcp)) {
                    updates['users/' + uid + '/handicap'] = e.hcp;
                }
                if (!u.defaultTee && e.tee) updates['users/' + uid + '/defaultTee'] = e.tee;
                if (!u.gender && e.gender) updates['users/' + uid + '/gender'] = e.gender;
            }

            // Зачистка дублей в заявках: старые ключи того же человека (гостевая
            // запись, прежний user_xxx) удаляются — остаётся одна запись на игрока.
            var prevRegAt = (existing[uid] && existing[uid].registeredAt) || 0;
            var prevSource = (existing[uid] && existing[uid].source) || '';
            regEntries.forEach(function(rx) {
                if (!rx.rec || rx.key === uid) return;
                if (!psSamePerson(probe, rx.parts)) return;
                var linked = rx.linkedUid;
                // Два разных реальных аккаунта с похожим ФИО не трогаем —
                // это могут быть разные люди.
                if (linked && linked !== uid && String(linked).indexOf('user_') !== 0 && String(uid).indexOf('user_') !== 0) return;
                updates['tournaments/' + tnId + '/registeredPlayers/' + rx.key] = null;
                if (!prevRegAt && rx.rec && rx.rec.registeredAt) prevRegAt = rx.rec.registeredAt;
                if (!prevSource && rx.rec && rx.rec.source) prevSource = rx.rec.source;
            });

            var prev = existing[uid] || {};
            updates['tournaments/' + tnId + '/registeredPlayers/' + uid] = {
                uid: uid,
                name: [e.firstName, e.middleName, e.lastName].filter(function(w) { return String(w || '').trim(); }).join(' ') || 'Player',
                firstName: e.firstName || '',
                middleName: e.middleName || '',
                lastName: e.lastName || '',
                handicap: (e.hcp === null || e.hcp === undefined || isNaN(e.hcp)) ? null : e.hcp,
                gender: e.gender || 'men',
                tee: e.tee || 'wh',
                registeredAt: prevRegAt || prev.registeredAt || now,
                source: prevSource || prev.source || 'start-list'
            };
        });

        if (!Object.keys(updates).length) { cb(null, { total: 0, usersCreated: 0 }); return; }
        db.ref().update(updates).then(function() {
            psState.users = users;
            cb(null, { total: entries.length, usersCreated: usersCreated });
        }).catch(function(err) {
            cb(err && err.message ? err.message : String(err));
        });
    }).catch(function(err) {
        cb(err && err.message ? err.message : String(err));
    });
}
