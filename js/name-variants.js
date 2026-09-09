// ==========================================================
// ФОРМЫ РУССКИХ ИМЁН ДЛЯ СИНХРОНИЗАЦИИ ГАНДИКАПОВ (база АГР)
// ==========================================================
// Проблема: на сайте игрок может быть записан как «Наташа Смирнова»,
// а в базе АГР — «Смирнова Наталия». Простое сравнение строк
// (impNormName) такие пары не находит → «не найдено» или дубль игрока.
//
// Этот модуль содержит словарь форм имён (полное имя + его варианты)
// и ТРИ стратегии совпадения, которые можно переключать в админке:
//
//   off — как сейчас (точное совпадение, словарь не используется)
//   A   — «Словарь»: только известные формы имени, фамилия строго равна
//   B   — «Словарь + допуск» (рекомендуемый): A + род фамилии
//         (Смирнов/Смирнова), транслитерация (Natalia = Наталия),
//         отчества игнорируются, похожие написания → только «на выбор»
//   C   — «Максимум»: B + основы фамилий, инициалы, свой словарь
//         администратора (можно добавлять формы прямо в админке)
//
// Файл работает и в браузере (window.NameVariants), и в Node
// (require('./js/name-variants.js')) — для автотестов в
// tools/test-name-variants.js.
// ==========================================================
(function(root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.NameVariants = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {

    // --------------------------------------------------
    // 1. СЛОВАРЬ ФОРМ ИМЁН
    // --------------------------------------------------
    // Формат: [пол, полное (паспортное) имя, [варианты: короткие, разговорные,
    // другие написания, латиница]].
    // Одна и та же короткая форма может входить в несколько групп
    // («Саша» = Александр и Александра, «Женя» = Евгений и Евгения) —
    // тогда совпадением считается пересечение групп.
    var GROUPS = [
        // ---------- МУЖСКИЕ ----------
        ['m', 'александр',   ['саша', 'шура', 'саня', 'санек', 'сашко', 'алекс', 'alex', 'sasha', 'alexander', 'aleksandr', 'aleksander', 'shura']],
        ['m', 'алексей',     ['алеша', 'леша', 'леха', 'алик', 'лекса', 'alexey', 'aleksey', 'aleksei', 'alex', 'alesha']],
        ['m', 'анатолий',    ['толя', 'толик', 'anatoly', 'anatoliy', 'tolik', 'tolya']],
        ['m', 'андрей',      ['андрюша', 'андрюха', 'andrey', 'andrei', 'andriy', 'andy', 'andre']],
        ['m', 'антон',       ['антоша', 'тоша', 'anton', 'antony', 'tosha']],
        ['m', 'аркадий',     ['аркаша', 'arkady', 'arkadiy']],
        ['m', 'арсений',     ['сеня', 'арсен', 'arseniy', 'arseny', 'senya']],
        ['m', 'артем',       ['тема', 'темка', 'artem', 'artemy', 'artyom']],
        ['m', 'афанасий',    ['афоня', 'afanasy', 'afanasiy']],
        ['m', 'богдан',      ['бодя', 'bogdan']],
        ['m', 'борис',       ['боря', 'boris', 'borya']],
        ['m', 'вадим',       ['вадик', 'вадимка', 'vadim', 'vadik']],
        ['m', 'валентин',    ['валя', 'валик', 'valentin', 'valentine', 'valik']],
        ['m', 'валерий',     ['валера', 'лера', 'валерик', 'valery', 'valeriy', 'valera']],
        ['m', 'василий',     ['вася', 'васек', 'василь', 'vasily', 'vasiliy', 'vassily', 'basil', 'vasya']],
        ['m', 'вениамин',    ['веня', 'veniamin', 'venya']],
        ['m', 'виктор',      ['витя', 'витюха', 'витяк', 'viktor', 'victor', 'vitya']],
        ['m', 'виталий',     ['виталя', 'виталик', 'vitaly', 'vitaliy', 'vitali']],
        ['m', 'владимир',    ['вова', 'володя', 'влад', 'вольдемар', 'vladimir', 'vlad', 'vova', 'volodya']],
        ['m', 'владислав',   ['влад', 'славик', 'владик', 'vladislav', 'vlad', 'slavik']],
        ['m', 'всеволод',    ['сева', 'vsevolod', 'seva']],
        ['m', 'вячеслав',    ['слава', 'вячик', 'славик', 'vyacheslav', 'slava', 'slavik']],
        ['m', 'геннадий',    ['гена', 'генка', 'gennady', 'gennadiy', 'gena']],
        ['m', 'георгий',     ['жора', 'гоша', 'гога', 'georgy', 'georgiy', 'george', 'gora']],
        ['m', 'герман',      ['герман', 'german', 'herman']],
        ['m', 'григорий',    ['гриша', 'grigory', 'grigoriy', 'grisha']],
        ['m', 'давид',       ['дави', 'david', 'davit']],
        ['m', ['даниил', 'данила'], ['даня', 'daniil', 'danil', 'daniel', 'danya']],
        ['m', 'демьян',      ['демьян', 'demyan']],
        ['m', 'денис',       ['деня', 'дениска', 'denis', 'dennis', 'denya']],
        ['m', 'дмитрий',     ['дима', 'митя', 'митяй', 'димон', 'dmitry', 'dmitriy', 'dmitri', 'dima', 'mitya']],
        ['m', 'евгений',     ['женя', 'женька', 'evgeny', 'evgeniy', 'eugene', 'zhenya']],
        ['m', 'егор',        ['егорка', 'egor', 'yegor']],
        ['m', 'ефим',        ['фима', 'efim']],
        ['m', 'захар',       ['захарка', 'zakhar', 'zahar']],
        ['m', 'игнат',       ['игнат', 'ignat']],
        ['m', 'игорь',       ['игорек', 'igor']],
        ['m', 'илья',        ['илюша', 'ilya', 'iliya', 'ilyusha']],
        ['m', 'иосиф',       ['осип', 'iosif', 'iosef']],
        ['m', 'иван',        ['ваня', 'ванюша', 'ivano', 'ivan', 'vanya']],
        ['m', 'кирилл',      ['кирюша', 'kirill', 'kiril', 'kirill']],
        ['m', 'константин',  ['костя', 'костик', 'konstantin', 'constantine', 'kostya']],
        ['m', 'лев',         ['лева', 'lev', 'leo']],
        ['m', 'леонид',      ['леня', 'leonid', 'lenya']],
        ['m', 'макар',       ['макаша', 'makar']],
        ['m', 'максим',      ['макс', 'максимка', 'maxim', 'max']],
        ['m', 'марат',       ['марат', 'marat']],
        ['m', 'марк',        ['марк', 'mark', 'marcus']],
        ['m', 'матвей',      ['матвей', 'matvey', 'matvei', 'matvei']],
        ['m', 'мирон',       ['мирон', 'miron']],
        ['m', 'михаил',     ['миша', 'миха', 'мишаня', 'mikhail', 'mihail', 'michael', 'misha']],
        ['m', 'никита',      ['ник', 'nikita', 'nik']],
        ['m', 'николай',     ['коля', 'колян', 'николас', 'nikolay', 'nikolai', 'nikolas', 'nicholas', 'kolya']],
        ['m', 'олег',        ['олег', 'oleg']],
        ['m', 'павел',       ['паша', 'павлик', 'паха', 'pavel', 'paul', 'pasha']],
        ['m', 'петр',        ['петя', 'петька', 'pyotr', 'petr', 'peter', 'petya']],
        ['m', 'платон',      ['платон', 'platon']],
        ['m', 'прохор',      ['прохор', 'prokhor']],
        ['m', 'роман',       ['рома', 'roman']],
        ['m', 'ростислав',   ['ростя', 'rostislav']],
        ['m', 'руслан',      ['руслан', 'ruslan']],
        ['m', 'рустам',      ['рустам', 'rustam']],
        ['m', 'савелий',     ['савва', 'savely', 'savveliy']],
        ['m', 'семен',       ['сема', 'semen', 'semyon', 'semion']],
        ['m', 'сергей',      ['сережа', 'серый', 'sergey', 'sergei', 'serg', 'serge', 'seryozha']],
        ['m', 'станислав',   ['стас', 'слава', 'stanislav', 'stas']],
        ['m', 'степан',      ['степа', 'stepan', 'styopa']],
        ['m', 'тарас',       ['тарас', 'taras']],
        ['m', 'тимур',       ['тима', 'timur']],
        ['m', 'тимофей',     ['тима', 'тимоша', 'тим', 'timofey', 'timofei', 'tim', 'timothy']],
        ['m', 'тигран',      ['тигран', 'tigran']],
        ['m', 'федор',       ['федя', 'fedor', 'fyodor', 'fedya']],
        ['m', 'филипп',      ['филя', 'filipp', 'philip', 'philipp']],
        ['m', 'эдуард',      ['эдик', 'эд', 'eduard', 'edward', 'ed']],
        ['m', 'юрий',        ['юра', 'юрка', 'yury', 'yuri', 'yuriy', 'juri']],
        ['m', 'яков',        ['яша', 'yakov']],
        ['m', 'ярослав',     ['ярик', 'yaroslav']],

        // ---------- ЖЕНСКИЕ ----------
        ['f', 'александра',  ['саша', 'шура', 'саня', 'алекса', 'alexandra', 'sasha', 'alex', 'sandra']],
        ['f', 'алена',       ['алена', 'alyona', 'alena']],
        ['f', 'алиса',       ['алиса', 'alisa', 'alice']],
        ['f', 'алла',        ['аля', 'alla']],
        ['f', 'анастасия',   ['настя', 'настена', 'стася', 'тася', 'anastasia', 'anastasiya', 'nastya', 'nastia']],
        ['f', 'ангелина',    ['геля', 'лина', 'angelina']],
        ['f', 'анжела',      ['angela', 'anzhela']],
        ['f', 'анжелика',    ['лика', 'angelika', 'angelica', 'anzhelika']],
        ['f', 'анна',        ['аня', 'анюта', 'нюра', 'anna', 'anne', 'anya', 'ann']],
        ['f', 'антонина',    ['тоня', 'antonina', 'tonya']],
        ['f', 'арина',       ['арина', 'аря', 'arina']],
        ['f', 'валентина',   ['валя', 'валик', 'valentina', 'valya']],
        ['f', 'валерия',     ['лера', 'valeria', 'valeriya', 'lera']],
        ['f', 'варвара',     ['варя', 'varvara']],
        ['f', 'василиса',    ['вася', 'василиса', 'vasilisa']],
        ['f', 'вера',        ['верочка', 'vera']],
        ['f', 'вероника',    ['ника', 'veronika', 'veronica', 'nika']],
        ['f', 'виктория',    ['вика', 'victoria', 'vika']],
        ['f', 'галина',      ['галя', 'galina', 'galya']],
        ['f', ['дарья', 'дария'], ['даша', 'darya', 'daria', 'dasha']],
        ['f', 'диана',       ['диана', 'diana']],
        ['f', 'евгения',     ['женя', 'evgenia', 'evgeniya', 'zhenya']],
        ['f', ['екатерина', 'катерина'], ['катя', 'катюша', 'ekaterina', 'katerina', 'catherine', 'katherine', 'katya', 'kate', 'ekaterine']],
        ['f', 'елена',       ['лена', 'леночка', 'elena', 'yelena', 'lena', 'helen']],
        ['f', 'елизавета',   ['лиза', 'elizaveta', 'elizabeth', 'liza', 'lisa']],
        ['f', 'жанна',       ['жанна', 'zhanna', 'jeanne', 'janna']],
        ['f', 'зоя',         ['зоя', 'zoya']],
        ['f', 'инга',        ['инга', 'inga']],
        ['f', 'инна',        ['инна', 'inna']],
        ['f', 'ирина',       ['ира', 'иришка', 'irina', 'ira', 'irene']],
        ['f', 'камилла',     ['камиля', 'kamilla', 'camilla']],
        ['f', 'карина',      ['карина', 'karina']],
        ['f', 'кира',        ['кира', 'kira']],
        ['f', 'клавдия',     ['клава', 'klavdiya', 'klavdia']],
        ['f', 'ксения',      ['ксюша', 'ксеня', 'ксения', 'ksenia', 'kseniya', 'ksyusha']],
        ['f', 'лариса',      ['лара', 'larisa', 'lara']],
        ['f', 'лидия',       ['лида', 'lidiya', 'lidia', 'lida']],
        ['f', 'лилия',       ['лиля', 'liliya', 'lilia', 'lily']],
        ['f', 'любовь',      ['люба', 'lyubov', 'lubov', 'luba']],
        ['f', 'людмила',     ['люда', 'мила', 'lyudmila', 'ludmila', 'mila', 'lyuda']],
        ['f', 'майя',        ['майя', 'maya']],
        ['f', 'маргарита',   ['рита', 'марго', 'margarita', 'rita', 'margo']],
        ['f', 'марина',      ['марина', 'marina']],
        ['f', 'мария',       ['маша', 'маруся', 'марья', 'мари', 'maria', 'mary', 'masha', 'marie', 'mariya']],
        ['f', 'надежда',     ['надя', 'nadezhda', 'nadia', 'nadya']],
        ['f', ['наталья', 'наталия'], ['наташа', 'ната', 'таша', 'натуся', 'natalia', 'nataliya', 'natalya', 'natasha', 'nata', 'tasha', 'natalie', 'natali']],
        ['f', 'нина',        ['нина', 'nina']],
        ['f', 'оксана',      ['ксана', 'ксюша', 'oksana', 'oxana', 'ksana']],
        ['f', 'олеся',       ['леся', 'olesya', 'olesia', 'lesya']],
        ['f', 'ольга',       ['оля', 'olga', 'olya']],
        ['f', 'полина',      ['поля', 'polina', 'paulina']],
        ['f', 'рената',      ['рената', 'renata']],
        ['f', 'регина',      ['регина', 'regina']],
        ['f', 'светлана',    ['света', 'svetlana', 'sveta']],
        ['f', 'снежана',     ['снежана', 'snezhana']],
        ['f', ['софия', 'софья'], ['соня', 'софа', 'sofia', 'sofya', 'sonya', 'sophie', 'sofiya']],
        ['f', 'тамара',      ['тома', 'tamara', 'toma']],
        ['f', 'татьяна',     ['таня', 'тата', 'tatiana', 'tatyana', 'tanya']],
        ['f', 'ульяна',      ['уля', 'ulyana', 'uliana']],
        ['f', 'эльвира',     ['эля', 'elvira']],
        ['f', 'юлия',        ['юля', 'yuliya', 'yulia', 'julia', 'julie']],
        ['f', 'яна',         ['яна', 'yana']],
        ['f', 'ярослава',    ['яся', 'yaroslava']]
    ];

    // Индекс: форма → список полных имён, которым она соответствует.
    // Группа может иметь несколько официальных написаний
    // (Наталья = Наталия, София = Софья) — тогда они равноправны.
    var FORM_INDEX = {};
    var PRIMARY = {};
    GROUPS.forEach(function(g) {
        var canons = (Object.prototype.toString.call(g[1]) === '[object Array]' ? g[1] : [g[1]]).map(norm);
        var forms = canons.concat((g[2] || []).map(norm));
        canons.forEach(function(c) { PRIMARY[c] = canons[0]; });
        forms.forEach(function(f) {
            canons.forEach(function(c) { register(f, c); });
        });
    });
    function register(form, canon) {
        if (!form) return;
        if (!FORM_INDEX[form]) FORM_INDEX[form] = [];
        if (FORM_INDEX[form].indexOf(canon) === -1) FORM_INDEX[form].push(canon);
    }

    // --------------------------------------------------
    // 2. НОРМАЛИЗАЦИЯ
    // --------------------------------------------------
    function norm(s) {
        return String(s == null ? '' : s)
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[\u0300\u0301\u0302]/g, '')     // знаки ударения
            .replace(/[^a-z\u0430-\u044f\s'-]/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^[\s'-]+|[\s'-]+$/g, '')
            .trim();
    }

    function tokens(s) {
        var n = norm(s);
        return n ? n.split(/[\s'-]+/).filter(Boolean) : [];
    }

    function uniq(arr) {
        var seen = {}, out = [];
        (arr || []).forEach(function(x) {
            if (x && !seen[x]) { seen[x] = true; out.push(x); }
        });
        return out;
    }

    function cap(s) {
        var n = String(s || '');
        return n.charAt(0).toUpperCase() + n.slice(1);
    }

    // --------------------------------------------------
    // 3. ИМЕНА: сравнение форм
    // --------------------------------------------------
    /** Полные имена, которым соответствует форма («наташа» → ['наталья']). */
    function canonsOf(form) {
        return FORM_INDEX[norm(form)] || [];
    }

    /** Есть ли у формы известные варианты написания (кроме неё самой). */
    function hasKnownForms(form) {
        var f = norm(form);
        return !!(FORM_INDEX[f] && FORM_INDEX[f].length);
    }

    /** Основные (паспортные) написания для формы: «наташа» → ['наталья','наталия']. */
    function officialFormsOf(form) {
        var seen = {}, out = [];
        canonsOf(form).forEach(function(c) {
            if (!seen[c]) { seen[c] = true; out.push(c); }
        });
        return out;
    }

    /** Все письменные формы имени (для поиска в АГР и отладки). */
    function formsOf(form) {
        var want = canonsOf(form);
        var list = [];
        GROUPS.forEach(function(g) {
            var canons = (Object.prototype.toString.call(g[1]) === '[object Array]' ? g[1] : [g[1]]).map(norm);
            var hit = canons.some(function(c) { return want.indexOf(c) !== -1; });
            if (!hit) return;
            canons.forEach(function(c) { list.push(c); });
            (g[2] || []).forEach(function(v) { list.push(norm(v)); });
        });
        return uniq(list);
    }

    // --------------------------------------------------
    // 4. ФАМИЛИИ: род, основа, транслитерация
    // --------------------------------------------------
    /** Кандидаты сравнения фамилии с учётом мужского/женского рода. */
    function surnameCandidates(s) {
        var n = norm(s);
        if (!n || n.length < 3) return n ? [n] : [];
        var out = [n];
        if (/(ова|ева|ина|ына)$/.test(n)) out.push(n.slice(0, -1));        // Смирнова → Смирнов
        if (/ая$/.test(n) && n.length > 4) {                                // Белая → Белый/Белой
            out.push(n.slice(0, -2) + 'ый');
            out.push(n.slice(0, -2) + 'ой');
        }
        if (/яя$/.test(n) && n.length > 4) {                                // Синяя → Синий/Синей
            out.push(n.slice(0, -2) + 'ий');
            out.push(n.slice(0, -2) + 'ой');
        }
        if (/[ая]$/.test(n) && n.length > 4) out.push(n.slice(0, -1));      // общий случай
        return uniq(out);
    }

    /** Основа фамилии без родового окончания (для варианта C). */
    function surnameStem(s) {
        var n = norm(s);
        if (!n) return '';
        return surnameCandidates(n).slice().sort(function(a, b) { return a.length - b.length; })[0];
    }

    var TRANSLIT = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh', 'з': 'z',
        'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
        'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch',
        'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };

    function translitRuToLat(s) {
        var n = norm(s), out = '';
        for (var i = 0; i < n.length; i++) {
            var ch = n.charAt(i);
            out += (TRANSLIT.hasOwnProperty(ch)) ? TRANSLIT[ch] : ch;
        }
        return out;
    }

    /** Ключ латинской строки: сглаживает различия y/i/j, c/k, x/ks, ph/f… */
    function latinKey(s) {
        var n = norm(s);
        for (var pass = 0; pass < 3; pass++) {
            var prev = n;
            n = n
                .replace(/sch/g, 'sh')
                .replace(/tch/g, 'ch')
                .replace(/ph/g, 'f')
                .replace(/ck/g, 'k')
                .replace(/c(?!h)/g, 'k')
                .replace(/x/g, 'ks')
                .replace(/w/g, 'v')
                .replace(/q/g, 'k')
                .replace(/y/g, 'i')
                .replace(/j/g, 'i')
                .replace(/'/g, '')
                .replace(/ii/g, 'i')
                .replace(/iy/g, 'i')
                .replace(/yi/g, 'i')
                .replace(/yy/g, 'i');
            if (n === prev) break;
        }
        return n;
    }

    function isCyrillic(s) { return /[а-я]/.test(norm(s)); }
    function isLatin(s) { return /[a-z]/.test(norm(s)); }

    /** Сравнение кириллической и латинской записи одного имени. */
    function translitEquals(a, b) {
        var na = norm(a), nb = norm(b);
        if (!na || !nb) return false;
        if (isCyrillic(na) && isLatin(nb)) return latinKey(translitRuToLat(na)) === latinKey(nb);
        if (isCyrillic(nb) && isLatin(na)) return latinKey(translitRuToLat(nb)) === latinKey(na);
        if (isLatin(na) && isLatin(nb)) return latinKey(na) === latinKey(nb);
        return false;
    }

    // --------------------------------------------------
    // 5. РАССТОЯНИЕ РЕДАКЦИОННОЕ (опечатки)
    // --------------------------------------------------
    function levenshtein(a, b) {
        a = norm(a); b = norm(b);
        if (a === b) return 0;
        if (!a.length) return b.length;
        if (!b.length) return a.length;
        var prev = [], cur = [], i, j;
        for (j = 0; j <= b.length; j++) prev[j] = j;
        for (i = 1; i <= a.length; i++) {
            cur = [i];
            for (j = 1; j <= b.length; j++) {
                cur[j] = Math.min(
                    prev[j] + 1,
                    cur[j - 1] + 1,
                    prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
                );
            }
            prev = cur;
        }
        return prev[b.length];
    }

    function commonPrefixLen(a, b) {
        a = norm(a); b = norm(b);
        var i = 0;
        while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) i++;
        return i;
    }

    // --------------------------------------------------
    // 6. НАСТРОЙКИ / РЕЖИМЫ
    // --------------------------------------------------
    var state = {
        mode: 'off',            // 'off' | 'A' | 'B' | 'C'
        autoApply: false,       // true → словарные формы применяются сами; false → всегда «на выбор»
        customAliases: {}       // свои формы: 'наташа' -> 'наталья' (вариант C)
    };

    var MODES = ['off', 'A', 'B', 'C'];

    function setMode(mode) {
        state.mode = (MODES.indexOf(String(mode)) !== -1) ? String(mode) : 'off';
        return state.mode;
    }
    function getMode() { return state.mode; }
    function isOn() { return state.mode !== 'off'; }
    function setAutoApply(v) { state.autoApply = !!v; }
    function getAutoApply() { return state.autoApply; }

    /** Свои формы имён: { 'наташа': 'наталья', ... } или текст «Наташа = Наталья». */
    function setCustomAliases(src) {
        var map = {};
        if (src && typeof src === 'object') {
            Object.keys(src).forEach(function(k) {
                var key = norm(k), val = norm(src[k]);
                if (key && val) map[key] = val;
            });
        } else if (typeof src === 'string') {
            String(src).split(/[\n;,]+/).forEach(function(line) {
                var parts = line.split(/[=\u2192>]+/);
                if (parts.length < 2) return;
                var key = norm(parts[0]);
                var val = norm(parts.slice(1).join(' '));
                if (key && val) map[key] = val;
            });
        }
        state.customAliases = map;
        return map;
    }
    function getCustomAliases() { return state.customAliases; }

    /** Каноническая форма имени с учётом своего словаря (вариант C). */
    function canonicalForm(form) {
        var f = norm(form);
        if (state.mode === 'off') return f;
        if (state.mode === 'C' && state.customAliases[f]) f = state.customAliases[f];
        var c = canonsOf(f);
        return c.length ? (PRIMARY[c[0]] || c[0]) : f;
    }

    // --------------------------------------------------
    // 7. СРАВНЕНИЕ ОТДЕЛЬНЫХ СЛОВ
    // --------------------------------------------------
    // Возвращает: 'exact' | 'alias' | 'gender' | 'translit' | 'custom' |
    //             'stem' | 'prefix' | 'fuzzy' | 'initial' | null
    function compareFirstNames(a, b) {
        var na = norm(a), nb = norm(b);
        if (!na || !nb) return null;
        if (na === nb) return 'exact';
        // режим off — как сейчас в админке: только точное совпадение
        if (state.mode === 'off') return null;

        // инициал («Н.» = «Наталья») — только слабое совпадение
        if (state.mode === 'C' && (na.length === 1 || nb.length === 1)) {
            if (na.charAt(0) === nb.charAt(0)) return 'initial';
            return null;
        }

        // словарь форм
        var ca = canonsOf(na), cb = canonsOf(nb);
        var inter = ca.filter(function(x) { return cb.indexOf(x) !== -1; });
        if (inter.length) return 'alias';

        // свой словарь администратора (вариант C)
        if (state.mode === 'C') {
            if (canonicalForm(na) === canonicalForm(nb)) return 'custom';
        }

        // транслитерация (Natalia = Наталия) — без «угадывания», доступна во всех активных режимах
        if (translitEquals(na, nb)) return 'translit';

        // опечатки / близкие написания — варианты B и C
        if (state.mode === 'B' || state.mode === 'C') {
            var minLen = Math.min(na.length, nb.length);
            var maxDist = (state.mode === 'C' && Math.min(na.length, nb.length) >= 8) ? 2 : 1;
            if (minLen >= 6 && levenshtein(na, nb) <= maxDist) return 'fuzzy';
            if (minLen >= 5 && commonPrefixLen(na, nb) >= 4) return 'prefix';
        }
        return null;
    }

    function compareLastNames(a, b) {
        var na = norm(a), nb = norm(b);
        if (!na || !nb) return null;
        if (na === nb) return 'exact';
        if (state.mode === 'off') return null;

        // мужской/женский род фамилии (варианты B и C)
        if (state.mode === 'B' || state.mode === 'C') {
            var candA = surnameCandidates(na), candB = surnameCandidates(nb);
            if (candA.some(function(x) { return candB.indexOf(x) !== -1; })) return 'gender';
            if (translitEquals(na, nb)) return 'translit';
            if (state.mode === 'C') {
                if (surnameStem(na) === surnameStem(nb)) return 'stem';
                if (Math.min(na.length, nb.length) >= 6 && levenshtein(na, nb) <= 1) return 'fuzzy';
            }
        }
        return null;
    }

    // Сила вида совпадения
    var STRONG_KINDS = { exact: 3, alias: 3, custom: 3, translit: 2, gender: 2, stem: 2, fuzzy: 1, prefix: 1, initial: 1 };

    // --------------------------------------------------
    // 8. ГЛАВНАЯ ФУНКЦИЯ СОВПАДЕНИЯ
    // --------------------------------------------------
    /**
     * Сравнение двух ФИО. Возвращает 'strong' | 'loose' | null.
     * Сигнатура совпадает с rgNamesMatch() в js/admin.js.
     */
    function match(localFirst, localLast, remoteFirst, remoteLast, localFull, remoteFull) {
        var fk = compareFirstNames(localFirst, remoteFirst);
        var lk = compareLastNames(localLast, remoteLast);

        if (fk && lk) {
            // Точные имя и фамилия — сильное совпадение всегда: флаг
            // «не применять автоматически» относится только к формам имени.
            if (lk === 'exact' && fk === 'exact') return 'strong';
            // известная форма имени / свой словарь — по флагу autoApply
            if (lk === 'exact' && (fk === 'alias' || fk === 'custom')) {
                return state.autoApply ? 'strong' : 'loose';
            }
            // всё остальное (род фамилии, транслитерация, опечатки) — только «на выбор»
            return 'loose';
        }

        // фамилия совпала, имя нет → слабое
        if (lk) return 'loose';

        // фамилия не задана хотя бы с одной стороны → ориентируемся на имя
        if (fk && (!norm(localLast) || !norm(remoteLast))) return 'loose';

        // разбор полных строк (когда first/last не разобраны, есть отчество и т.п.)
        var lf = tokens(localFull), rf = tokens(remoteFull);
        if (lf.length >= 2 && rf.length >= 2) {
            var hits = 0, weak = 0, soft = 0;
            lf.forEach(function(lp) {
                var best = null, bestRank = 0;
                rf.forEach(function(rp) {
                    var k1 = compareFirstNames(lp, rp);
                    var k2 = compareLastNames(lp, rp);
                    var k = k1 || k2;
                    if (k && STRONG_KINDS[k] > bestRank) { best = k; bestRank = STRONG_KINDS[k]; }
                });
                if (best === 'exact') hits++;
                else if (best === 'alias' || best === 'custom') { hits++; soft++; }
                else if (best) weak++;
            });
            if (hits >= 2) return (soft === 0 || state.autoApply) ? 'strong' : 'loose';
            if (hits === 1 && weak >= 1) return 'loose';
            if (weak >= 2) return 'loose';
        }
        return null;
    }

    // --------------------------------------------------
    // 9. КЛЮЧ ФИО (для поиска дублей игроков)
    // --------------------------------------------------
    // Похоже ли слово на фамилию (нужно, когда задано только поле name)
    var SURNAME_HINT = /(ов|ова|ев|ева|ин|ина|ын|ына|ский|ская|цкий|цкая|ко)$/;

    /** Разбор строки «Имя Фамилия» / «Фамилия Имя» на части. */
    function splitNameParts(u) {
        u = u || {};
        var first = norm(u.firstName || '');
        var last = norm(u.lastName || '');
        var parts = tokens(u.name || '');
        if (!first && !last) {
            if (!parts.length) return { first: '', last: '' };
            first = parts[0];
            last = parts.length > 1 ? parts[parts.length - 1] : '';
            // «Смирнова Наташа» → меняем местами
            if (last && SURNAME_HINT.test(first) && !SURNAME_HINT.test(last)) {
                var t = first; first = last; last = t;
            }
            return { first: first, last: last };
        }
        if (!first) first = parts[0] || '';
        if (!last) last = parts.length > 1 ? parts[parts.length - 1] : '';
        return { first: first, last: last };
    }

    /** Ключ «имя+фамилия» с учётом форм имени. Отчество НЕ входит — проверяется отдельно. */
    function groupKey(u) {
        if (!u) return '';
        var parts = splitNameParts(u);
        var first = parts.first;
        var last = parts.last;
        var f = isOn() ? canonicalForm(first) : first;
        var l = (state.mode === 'C') ? surnameStem(last) : last;
        return (f + ' ' + l).trim();
    }

    /** Отчество в нормализованном виде (для проверки «отец/сын»). */
    function patronymicKey(u) {
        if (!u) return '';
        return norm(u.middleName || '');
    }

    /** Конфликтуют ли отчества (оба заданы и разные). */
    function patronymicClash(a, b) {
        var pa = patronymicKey(a), pb = patronymicKey(b);
        if (!pa || !pb) return false;
        return canonicalForm(pa) !== canonicalForm(pb) && pa !== pb;
    }

    // --------------------------------------------------
    // 10. ВАРИАНТЫ ЗАПРОСА ДЛЯ ПОИСКА В БАЗЕ АГР
    // --------------------------------------------------
    var QUERY_LIMIT = { off: 1, A: 2, B: 3, C: 4 };

    /**
     * Список запросов к hcp.rusgolf.ru: сначала «как записано на сайте»,
     * затем — с полными (паспортными) формами имени.
     */
    function queryVariants(first, last) {
        var fRaw = String(first || '').trim();
        var lRaw = String(last || '').trim();
        if (!fRaw && !lRaw) return [];
        if (!isOn()) {
            return lRaw && fRaw ? [lRaw + ' ' + fRaw, fRaw + ' ' + lRaw] : [fRaw || lRaw];
        }

        var firstForms = uniq([norm(fRaw)].concat(officialFormsOf(fRaw)));
        // в варианте C добавляем и свой словарь администратора
        if (state.mode === 'C' && state.customAliases[norm(fRaw)]) {
            firstForms = uniq([norm(fRaw), state.customAliases[norm(fRaw)]]);
        }
        var limit = QUERY_LIMIT[state.mode] || 2;

        var out = [];
        // 1) как записано на сайте
        if (lRaw && fRaw) out.push(lRaw + ' ' + fRaw);
        // 2) полные (паспортные) написания имени: «Наташа» → «Наталья», «Наталия»
        firstForms.forEach(function(f) {
            if (!f) return;
            var pretty = cap(f);
            if (lRaw) out.push(lRaw + ' ' + pretty);
            else out.push(pretty);
        });
        // 3) обратный порядок слов (если на сайте записано «Имя Фамилия»)
        if (lRaw && fRaw) {
            out.push(fRaw + ' ' + lRaw);
            firstForms.forEach(function(f) { if (f) out.push(cap(f) + ' ' + lRaw); });
        }

        // дедуп по нормализованной строке + ограничение числа запросов
        var seen = {};
        return out.filter(function(q) {
            var k = norm(q);
            if (!k || seen[k]) return false;
            seen[k] = true;
            return true;
        }).slice(0, limit);
    }

    // --------------------------------------------------
    // 11. АНАЛИЗ СПИСКА ИГРОКОВ
    // --------------------------------------------------
    /**
     * Ищет в списке игроков пары «одна фамилия — разные формы имени»
     * (Наташа Смирнова / Наталья Смирнова) и «одно имя — разные формы».
     * players: [{ id, data: {name,firstName,lastName,middleName} }]
     */
    function findFormCollisions(players) {
        var byLast = {};
        (players || []).forEach(function(p) {
            var u = (p && p.data) || {};
            var first = norm(u.firstName || '');
            var last = norm(u.lastName || '');
            if (!first && !last) {
                var t = tokens(u.name);
                first = t[0] || ''; last = t.length > 1 ? t[t.length - 1] : '';
            }
            if (!first || !last) return;
            var key = (state.mode === 'C') ? surnameStem(last) : last;
            if (!byLast[key]) byLast[key] = [];
            byLast[key].push({ id: p.id, first: first, last: last, canon: canonicalForm(first), display: u.name || (first + ' ' + last) });
        });

        var collisions = [];
        Object.keys(byLast).forEach(function(last) {
            var list = byLast[last];
            var byCanon = {};
            list.forEach(function(x) {
                (byCanon[x.canon] = byCanon[x.canon] || []).push(x);
            });
            Object.keys(byCanon).forEach(function(canon) {
                var forms = uniq(byCanon[canon].map(function(x) { return x.first; }));
                if (forms.length > 1) {
                    collisions.push({
                        lastName: last,
                        canon: canon,
                        forms: forms,
                        players: byCanon[canon],
                        reason: 'form'
                    });
                }
            });
        });
        return collisions;
    }

    /** Все известные формы имени (для отладки/таблицы в документации). */
    function dumpDictionary() {
        return GROUPS.map(function(g) {
            return { gender: g[0], canon: g[1], forms: uniq([g[1]].concat(g[2] || [])) };
        });
    }

    return {
        GROUPS: GROUPS,
        FORM_INDEX: FORM_INDEX,
        MODES: MODES,
        norm: norm,
        tokens: tokens,
        cap: cap,
        canonsOf: canonsOf,
        officialFormsOf: officialFormsOf,
        formsOf: formsOf,
        hasKnownForms: hasKnownForms,
        canonicalForm: canonicalForm,
        splitNameParts: splitNameParts,
        surnameCandidates: surnameCandidates,
        surnameStem: surnameStem,
        translitRuToLat: translitRuToLat,
        latinKey: latinKey,
        translitEquals: translitEquals,
        levenshtein: levenshtein,
        commonPrefixLen: commonPrefixLen,
        compareFirstNames: compareFirstNames,
        compareLastNames: compareLastNames,
        match: match,
        groupKey: groupKey,
        patronymicClash: patronymicClash,
        queryVariants: queryVariants,
        findFormCollisions: findFormCollisions,
        dumpDictionary: dumpDictionary,
        setMode: setMode,
        getMode: getMode,
        isOn: isOn,
        setAutoApply: setAutoApply,
        getAutoApply: getAutoApply,
        setCustomAliases: setCustomAliases,
        getCustomAliases: getCustomAliases
    };
});
