// ============================================================
//  «Помощник» — общая библиотека сборки поискового индекса
//  Используется и админкой (добавление PDF по ссылке), и страницей
//  помощника. Код построен на той же логике, что tools/assistant-lib.js.
// ============================================================
(function (global) {
  'use strict';

  var RU_SUFFIXES = [
    'иями', 'ями', 'ами', 'иях', 'ях', 'ах', 'овиях', 'еях', 'ием', 'ем',
    'ое', 'ье', 'ий', 'ый', 'ой', 'ая', 'яя', 'ее', 'ые', 'ие', 'их', 'ых',
    'ом', 'ам', 'ям', 'ым', 'им', 'ев', 'ов', 'ей', 'ий', 'ою', 'ею',
    'е', 'у', 'я', 'о', 'а', 'и', 'ы', 'ь', 'й'
  ];
  var MIN_STEM = 3;
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
    'также':1,'либо':1,'где':1,'кто':1,'почему':1,'зачем':1,'никто':1
  };
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

  function stripDiacritics(s) { return String(s).replace(/ё/g, 'е').replace(/Ё/g, 'Е'); }
  function stemTerm(raw) {
    var w = stripDiacritics(String(raw).toLowerCase()).replace(/[-—–]/g, '').replace(/[^a-zа-я0-9]/g, '');
    if (w.length <= MIN_STEM) return w;
    for (var i = 0; i < RU_SUFFIXES.length; i++) {
      var suf = RU_SUFFIXES[i];
      if (w.length - suf.length >= MIN_STEM && w.slice(-suf.length) === suf) {
        w = w.slice(0, w.length - suf.length); break;
      }
    }
    return w;
  }
  function tokenize(text, filterStop) {
    if (!text) return [];
    var out = [];
    var parts = stripDiacritics(String(text)).toLowerCase().replace(/[-—–]/g, '').split(/[^a-zа-я0-9]+/i);
    for (var i = 0; i < parts.length; i++) {
      var st = stemTerm(parts[i]);
      if (!st) continue;
      if (filterStop && STOPWORDS[st]) continue;
      out.push(SYNONYM_MAP[st] || st);
    }
    return out;
  }
  function termFreq(text) {
    var toks = tokenize(text, false), map = {};
    for (var i = 0; i < toks.length; i++) map[toks[i]] = (map[toks[i]] || 0) + 1;
    return map;
  }
  function arrayUnique(a) { var s = {}, o = []; for (var i = 0; i < a.length; i++) if (!s[a[i]]) { s[a[i]] = 1; o.push(a[i]); } return o; }
  function bigramDice(a, b) {
    a = String(a || ''); b = String(b || ''); if (!a || !b) return 0; if (a === b) return 1;
    function bigrams(s) { var set = {}; if (s.length === 1) { set[s] = 1; return set; } for (var i = 0; i < s.length - 1; i++) set[s.slice(i, i + 2)] = 1; return set; }
    var ba = bigrams(a), bb = bigrams(b), inter = 0, total = 0;
    for (var k in ba) { if (bb[k]) inter++; total++; }
    for (var k2 in bb) { if (!ba[k2]) total++; }
    if (!total) return 0; return 2 * inter / total;
  }
  function maxTermSim(q, toks) { var best = 0; for (var i = 0; i < toks.length; i++) { var d = bigramDice(q, toks[i]); if (d > best) { best = d; if (best >= 0.95) return best; } } return best; }
  function bm25Score(qTokens, chunkTF, df, docCount, avgdl, dl) {
    var k1 = 1.5, b = 0.75, score = 0, qTerms = arrayUnique(qTokens);
    for (var i = 0; i < qTerms.length; i++) {
      var term = qTerms[i], tf = chunkTF[term]; if (!tf) continue;
      var n = df[term] || 1;
      var idf = Math.log(1 + (docCount - n + 0.5) / (n + 0.5));
      score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / (avgdl || 1))));
    }
    return score;
  }

  var SENT_SPLIT = /(?<=[.!?;…])\s+/;
  function splitSentences(t) {
    return String(t || '').split(SENT_SPLIT).map(function (s) { return s.replace(/\s+/g, ' ').trim(); }).filter(function (s) { return s.length > 1; });
  }
  function chunkPage(text, page) {
    var flow = String(text || '').replace(/\r/g, '').split(/\s+/).join(' ');
    var SECTION_SPLIT = /(?=(?:^|\s)(?:\d{1,2}\.\d{1,2}\.?|\d{1,2}\.)(\s|\u00a0))|(?=(?:^|\s)\u2022(\s|\u00a0))/;
    var segs = flow.split(SECTION_SPLIT).filter(function (s) { return s && s.trim().length > 1; });
    var out = [];
    for (var i = 0; i < segs.length; i++) {
      var sentences = splitSentences(segs[i]);
      var cur = '';
      function flush() { if (cur && cur.trim().length > 1) out.push({ text: cur.trim(), page: page }); cur = ''; }
      for (var j = 0; j < sentences.length; j++) {
        var s = sentences[j];
        while (s.length > 640) {
          var cut = s.lastIndexOf(' ', 620); if (cut <= 0) cut = 620;
          if (cur) flush();
          out.push({ text: s.slice(0, cut).trim(), page: page }); s = s.slice(cut).trim();
        }
        if (!cur) cur = s; else if ((cur.length + 1 + s.length) <= 620) cur += ' ' + s; else { flush(); cur = s; }
      }
      if (cur) flush();
    }
    return out;
  }

  // ----- Загрузка PDF (локальный или удалённый через CORS-прокси) -----
  var PROXIES = [
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
    function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); },
    function (u) { return 'https://corsproxy.io/?url=' + encodeURIComponent(u); }
  ];

  function isRemote(url) { return /^https?:\/\//i.test(String(url || '')); }

  function fetchBinary(url) {
    var attempts = [];
    if (isRemote(url)) {
      PROXIES.forEach(function (p) { attempts.push(p(url)); });
    }
    attempts.push(url); // сначала/в конце — прямой запрос
    var lastErr = new Error('нет подключения');
    var chain = Promise.reject(null);
    attempts.forEach(function (a) {
      chain = chain.catch(function () {
        return fetch(a).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status + ' для ' + a);
          return r.arrayBuffer();
        }).then(function (buf) {
          if (!buf || buf.byteLength < 100) throw new Error('Файл слишком маленький');
          return { data: new Uint8Array(buf), via: a };
        });
      }).catch(function (e) { lastErr = e; return Promise.reject(e); });
    });
    return chain.catch(function () { return Promise.reject(lastErr); });
  }

  function loadPdfLib() {
    if (global.pdfjsLib) return Promise.resolve();
    var cfg = global.ASSISTANT_CONFIG || {};
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = cfg.pdfLibUrl || 'vendor/pdfjs/pdf.min.js';
      s.onload = function () {
        try { global.pdfjsLib.GlobalWorkerOptions.workerSrc = cfg.pdfWorkerUrl || 'vendor/pdfjs/pdf.worker.min.js'; } catch (e) {}
        resolve();
      };
      s.onerror = function () { reject(new Error('Не удалось загрузить pdf.js')); };
      document.head.appendChild(s);
    });
  }

  function extractPdfText(data) {
    var lib = global.pdfjsLib;
    return lib.getDocument({ data: data, disableWorker: true }).promise.then(function (doc) {
      var texts = [], tasks = [];
      for (var i = 1; i <= doc.numPages; i++) {
        tasks.push(doc.getPage(i).then(function (page) {
          return page.getTextContent().then(function (content) {
            return content.items.map(function (it) { return it.str || ''; }).join(' ');
          });
        }).then(function (txt) { texts.push(txt); }));
      }
      return Promise.all(tasks).then(function () { return { pages: doc.numPages, texts: texts }; });
    });
  }

  // Строит чанки одного документа
  function buildDocSubset(metaTexts) {
    var chunks = [], df = {}, docCount = 0, totalLen = 0;
    for (var p = 0; p < metaTexts.pages; p++) {
      var list = chunkPage(metaTexts.texts[p], p + 1);
      for (var c = 0; c < list.length; c++) {
        var ch = list[c];
        var tf = termFreq(ch.text);
        var toks = Object.keys(tf);
        chunks.push({ text: ch.text, page: ch.page, tf: tf, len: ch.text.length });
        docCount++; totalLen += ch.text.length;
        for (var t = 0; t < toks.length; t++) df[toks[t]] = (df[toks[t]] || 0) + 1;
      }
    }
    return { chunks: chunks, df: df, docCount: docCount, totalLen: totalLen };
  }

  // Полная пересборка: baseIndex (готовый JSON) + customSources -> итоговый индекс
  function buildIndex(baseIndex, customSources, onProgress) {
    if (typeof onProgress !== 'function') onProgress = function () {};
    var loadPdf = loadPdfLib();
    var base = baseIndex || { sources: [], chunks: [], df: {}, docCount: 0, avgdl: 200 };
    var extraSources = customSources || [];

    // Загружаем базовый локальный индекс, если его не передали объектом
    var baseReady = (base && base.chunks && base.chunks.length)
      ? Promise.resolve(base)
      : fetch(baseIndexUrlFallback()).then(function (r) { return r.json(); });

    return baseReady.then(function (b) {
      return loadPdf.then(function () {
        var tasks = extraSources.map(function (s) {
          onProgress(s.title, 'fetch');
          return fetchBinary(s.url).then(function (res) {
            onProgress(s.title, 'parse');
            return extractPdfText(res.data);
          }).then(function (texts) {
            var sub = buildDocSubset(texts);
            return { src: s, sub: sub };
          });
        });
        return Promise.all(tasks).then(function (results) {
          var allChunks = (b.chunks || []).map(function (c, i) { var x = {}; for (var k in c) x[k] = c[k]; x.src = c.src !== undefined ? c.src : i; return x; });
          var allSources = (b.sources || []).slice();
          var df = {}; Object.keys(b.df || {}).forEach(function (k) { df[k] = b.df[k]; });
          var docCount = b.docCount || 0, totalLen = 0;
          allChunks.forEach(function (c) { totalLen += (c.len || c.text.length); });

          results.forEach(function (r) {
            var srcIdx = allSources.length;
            allSources.push({ title: r.src.title, file: r.src.url, remote: isRemote(r.src.url) });
            r.sub.chunks.forEach(function (c) {
              var x = { src: srcIdx, page: c.page, text: c.text, tf: c.tf, len: c.len };
              allChunks.push(x);
              totalLen += c.len;
            });
            docCount += r.sub.docCount;
            Object.keys(r.sub.df).forEach(function (k) { df[k] = (df[k] || 0) + r.sub.df[k]; });
          });

          return {
            name: b.name || 'База знаний',
            version: (b.version || 0) + 1,
            generatedAt: new Date().toISOString(),
            sources: allSources,
            df: df,
            docCount: docCount,
            avgdl: docCount ? Math.round(totalLen / docCount) : 200,
            chunks: allChunks
          };
        });
      });
    });
  }

  function baseIndexUrlFallback() {
    var cfg = global.ASSISTANT_CONFIG || {};
    return cfg.indexUrl || 'docs/assistant-index.json';
  }

  global.AssistantBuild = {
    tokenize: tokenize,
    termFreq: termFreq,
    chunkPage: chunkPage,
    bm25Score: bm25Score,
    maxTermSim: maxTermSim,
    stemTerm: stemTerm,
    arrayUnique: arrayUnique,
    fetchBinary: fetchBinary,
    loadPdfLib: loadPdfLib,
    extractPdfText: extractPdfText,
    buildIndex: buildIndex,
    isRemote: isRemote,
    PROXIES: PROXIES
  };
})(typeof window !== 'undefined' ? window : this);
