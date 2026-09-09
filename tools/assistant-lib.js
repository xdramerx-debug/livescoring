// ============================================================
//  «Помощник» — общая логика токенизации и построения индекса
//  Выполняется и в Node (при сборке индекса), и в браузере
//  (js/assistant.js). Стараемся держать код идентичным.
// ============================================================

// ---- Лёгкий стеммер русского текста + нормализация ----
var RU_SUFFIXES = [
  'иями', 'ями', 'ами', 'иях', 'ях', 'ах', 'овиях', 'еях', 'ием', 'ем',
  'ое', 'ье', 'ий', 'ый', 'ой', 'ая', 'яя', 'ее', 'ые', 'ие', 'их', 'ых',
  'ом', 'ам', 'ям', 'ым', 'им', 'ев', 'ов', 'ей', 'ий', 'ою', 'ею',
  'е', 'у', 'я', 'о', 'а', 'и', 'ы', 'ь', 'й'
];
var MIN_STEM = 3;

// Русские стоп-слова, которые не несут смысла при поиске
var STOPWORDS = {
  'и':1,'в':1,'во':1,'не':1,'что':1,'он':1,'на':1,'я':1,'с':1,'со':1,
  'как':1,'а':1,'то':1,'все':1,'она':1,'так':1,'его':1,'но':1,'да':1,
  'ты':1,'к':1,'у':1,'же':1,'вы':1,'за':1,'бы':1,'по':1,'только':1,
  'ее':1,'мне':1,'было':1,'вот':1,'от':1,'меня':1,'еще':1,'нет':1,
  'о':1,'из':1,'ему':1,'теперь':1,'когда':1,'даже':1,'ну':1,'ли':1,
  'если':1,'или':1,'чтобы':1,'быть':1,'был':1,'есть':1,'до':1,'это':1,
  'этот':1,'эта':1,'этом':1,'эти':1,'тех':1,'та':1,'там':1,'тут':1,
  'такой':1,'такое':1,'такая':1,'чем':1,'при':1,'про':1,'для':1,'без':1,
  'под':1,'над':1,'об':1,'сколько':1,'какие':1,'какая':1,'какой':1,
  'какое':1,'который':1,'которые':1,'является':1,'являются':1,
  'должен':1,'должна':1,'должны':1,'можно':1,'надо':1,'нужно':1,
  'свои':1,'свой':1,'свое':1,'своя':1,'их':1,'нас':1,'вас':1,
  'что':1,'это':1,'чтобы':1,'также':1,'если':1,'либо':1,'где':1,
  'кто':1,'почему':1,'зачем':1,'когда':1,'есть':1,'никто':1
};

function stripDiacritics(s) {
  return s.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
}

function stemTerm(raw) {
  var w = stripDiacritics(String(raw).toLowerCase());
  // Убираем дефисы/тире и небуквенные символы
  w = w.replace(/[-—–]/g, '');
  w = w.replace(/[^a-zа-я0-9]/g, '');
  if (w.length <= MIN_STEM) return w;
  for (var i = 0; i < RU_SUFFIXES.length; i++) {
    var suf = RU_SUFFIXES[i];
    if (w.length - suf.length >= MIN_STEM && w.slice(-suf.length) === suf) {
      w = w.slice(0, w.length - suf.length);
      break;
    }
  }
  return w;
}

// Синонимы/леммы для терминов. Канон -> варианты (в исходном написании).
var SYNONYMS = {
  'гандикап': ['гандикап', 'гандикеп', 'ганикэп', 'ganidikap', 'hcp', 'whs'],
  'бронирование': ['бронирование', 'бронир', 'бронь', 'брони'],
  'гринфи': ['гринфи', 'грин-фи', 'гриинфи'],
  'дрескод': ['дрескод', 'дресс-код'],
  'скоринг': ['скоринг', 'лайв-скоринг', 'лайвскоринг', 'счетнаякарточка', 'счетная'],
  'темп': ['темп', 'скорость'],
  'стоимость': ['стоимость', 'цена', 'цену', 'цены', 'стоит', 'стоить', 'цену'],
  'отмена': ['отмена', 'отменить', 'отмен', 'отменить']
};

var SYNONYM_MAP = (function () {
  var map = {};
  Object.keys(SYNONYMS).forEach(function (canon) {
    map[canon] = canon;
    SYNONYMS[canon].forEach(function (variant) {
      map[stemTerm(variant)] = canon;
    });
  });
  return map;
})();

// Токенизация строки -> массив нормализованных термов (порядок сохранён)
function tokenize(text, filterStop) {
  if (!text) return [];
  var out = [];
  var parts = String(text).toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[-—–]/g, '')      // дефисы убираем, чтобы «грин-фи» -> «гринфи»
    .split(/[^a-zа-я0-9]+/i);
  for (var i = 0; i < parts.length; i++) {
    var st = stemTerm(parts[i]);
    if (!st) continue;
    if (filterStop && STOPWORDS[st]) continue;
    var canon = SYNONYM_MAP[st] || st;
    out.push(canon);
  }
  return out;
}

// Частотный словарь термов в тексте (Map term->count)
function termFreq(text) {
  var tokens = tokenize(text, false);
  var map = {};
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    map[t] = (map[t] || 0) + 1;
  }
  return map;
}

// Схожесть двух строк по Dice-коэффициенту на биграммах символов.
// Хорошо ловит морфологические варианты русского языка.
function bigramDice(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  function bigrams(s) {
    var set = {};
    if (s.length === 1) { set[s] = 1; return set; }
    for (var i = 0; i < s.length - 1; i++) set[s.slice(i, i + 2)] = 1;
    return set;
  }
  var ba = bigrams(a), bb = bigrams(b);
  var inter = 0, total = 0;
  for (var k in ba) { if (bb[k]) inter++; total++; }
  for (var k2 in bb) { if (!ba[k2]) total++; }
  if (!total) return 0;
  return 2 * inter / total;
}

// Максимальная схожесть терма запроса с любым термом чанка.
function maxTermSim(q, chunkTokens) {
  var best = 0;
  for (var i = 0; i < chunkTokens.length; i++) {
    var d = bigramDice(q, chunkTokens[i]);
    if (d > best) { best = d; if (best >= 0.95) return best; }
  }
  return best;
}

function arrayUnique(arr) {
  var seen = {};
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); }
  }
  return out;
}

// ---- Разбиение текста страницы на смысловые чанки ----
// Работает с «непрерывным» текстом (без переносов).
// Границы чанка: заголовки разделов (2.3., 2.), пункты списка (•).
// Внутри чанка предложения группируются до ~600 символов.
var SECTION_SPLIT = /(?=(?:^|\s)(?:\d{1,2}\.\d{1,2}\.?|\d{1,2}\.)(\s|\u00a0))|(?=(?:^|\s)\u2022(\s|\u00a0))/;
var SENT_SPLIT = /(?<=[.!?;…])\s+/;
function splitSentences(seg) {
  return seg
    .split(SENT_SPLIT)
    .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
    .filter(function (s) { return s.length > 1; });
}
function chunkPage(text, page) {
  text = String(text || '').replace(/\r/g, '');
  var flow = text.split(/\s+/).join(' ');
  var segments = flow.split(SECTION_SPLIT).filter(function (s) { return s && s.trim().length > 1; });
  var out = [];
  for (var i = 0; i < segments.length; i++) {
    var sentences = splitSentences(segments[i]);
    var cur = '';
    function flush() {
      if (cur && cur.trim().length > 1) out.push({ text: cur.trim(), page: page });
      cur = '';
    }
    for (var j = 0; j < sentences.length; j++) {
      var s = sentences[j];
      while (s.length > 640) {
        var cut = s.lastIndexOf(' ', 620);
        if (cut <= 0) cut = 620;
        if (cur) flush();
        out.push({ text: s.slice(0, cut).trim(), page: page });
        s = s.slice(cut).trim();
      }
      if (!cur) cur = s;
      else if ((cur.length + 1 + s.length) <= 620) cur += ' ' + s;
      else { flush(); cur = s; }
    }
    if (cur) flush();
  }
  return out;
}

// ---- BM25 ----
function bm25Score(queryTokens, chunkTF, df, docCount, avgdl, dl) {
  var k1 = 1.5, b = 0.75;
  var score = 0;
  var qTerms = arrayUnique(queryTokens);
  for (var i = 0; i < qTerms.length; i++) {
    var term = qTerms[i];
    var tf = chunkTF[term];
    if (!tf) continue;
    var n = df[term] || 1;
    var idf = Math.log(1 + (docCount - n + 0.5) / (n + 0.5));
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / (avgdl || 1))));
  }
  return score;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    stripDiacritics: stripDiacritics,
    stemTerm: stemTerm,
    tokenize: tokenize,
    termFreq: termFreq,
    chunkPage: chunkPage,
    bm25Score: bm25Score,
    SYNONYM_MAP: SYNONYM_MAP,
    arrayUnique: arrayUnique,
    bigramDice: bigramDice,
    maxTermSim: maxTermSim
  };
}
