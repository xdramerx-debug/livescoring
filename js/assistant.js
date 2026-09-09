// ============================================================
//  «Помощник» — офлайн-чат с ответами по документам (PDF)
//  Extractive RAG: вопрос -> поиск по индексу -> готовый фрагмент
//  из PDF + ссылка на точное место (страница) в документе.
//
//  Работает полностью без интернета:
//    • индекс (docs/assistant-index.json) собирается заранее
//      командой `node tools/build-assistant-index.js`
//    • при его отсутствии индекс пересобирается в браузере из PDF
//      локальной копией pdf.js (vendor/pdfjs).
// ============================================================
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  // ---------- Токенизация и поиск (идентична tools/assistant-lib.js) ----------
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

  function stemTerm(raw) {
    var w = String(raw).toLowerCase().replace(/ё/g, 'е');
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
  function tokenize(text, filterStop) {
    if (!text) return [];
    var out = [];
    var parts = String(text).toLowerCase().replace(/ё/g, 'е')
      .replace(/[-—–]/g, '')
      .split(/[^a-zа-я0-9]+/i);
    for (var i = 0; i < parts.length; i++) {
      var st = stemTerm(parts[i]);
      if (!st) continue;
      if (filterStop && STOPWORDS[st]) continue;
      out.push(SYNONYM_MAP[st] || st);
    }
    return out;
  }
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
  function maxTermSim(q, toks) {
    var best = 0;
    for (var i = 0; i < toks.length; i++) {
      var d = bigramDice(q, toks[i]);
      if (d > best) { best = d; if (best >= 0.95) return best; }
    }
    return best;
  }
  function arrayUnique(a) { var s = {}, o = []; for (var i = 0; i < a.length; i++) if (!s[a[i]]) { s[a[i]] = 1; o.push(a[i]); } return o; }
  function bm25Score(qTokens, chunkTF, df, docCount, avgdl, dl) {
    var k1 = 1.5, b = 0.75, score = 0, qTerms = arrayUnique(qTokens);
    for (var i = 0; i < qTerms.length; i++) {
      var term = qTerms[i], tf = chunkTF[term];
      if (!tf) continue;
      var n = df[term] || 1;
      var idf = Math.log(1 + (docCount - n + 0.5) / (n + 0.5));
      score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / (avgdl || 1))));
    }
    return score;
  }
  var SENT_SPLIT = /(?<=[.!?;…])\s+/;
  function splitSentences(t) {
    return String(t || '').split(SENT_SPLIT)
      .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
      .filter(function (s) { return s.length > 1; });
  }
  function chunkPage(text, page) {
    // Не нужен при загрузке готового индекса; используется, если
    // индекс пересобирается в браузере из PDF.
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

  // ---------- Состояние ----------
  // Позволяет firebase (если доступен) отрисовать пользователя в шапке;
  // при офлайне шапка просто показывает кнопку входа.
  global.onAuthReady = function (u, d) {
    if (typeof navAuth === 'function') navAuth(u, d);
  };

  var state = {
    ready: false,
    sources: [],
    chunks: [],
    df: {},
    docCount: 0,
    totalLen: 0,
    avgdl: 200,
    history: []
  };
  var conf = global.ASSISTANT_CONFIG || {};

  // ---------- Загрузка индекса ----------
  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  function setStatus(text, kind) {
    var el = $('as-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'as-status ' + (kind === 'ok' ? 'as-ok' : kind === 'warn' ? 'as-warn' : 'as-err');
  }

  function applyIndex(index) {
    state.sources = index.sources || [];
    state.chunks = index.chunks || [];
    state.df = index.df || {};
    state.docCount = index.docCount || state.chunks.length;
    state.avgdl = index.avgdl || 200;
    state.ready = state.chunks.length > 0;
    var docs = state.sources.map(function (s) { return s.title; }).join(', ');
    if (state.ready) {
      setStatus('Готово: база знаний офлайн · ' + state.chunks.length + ' фрагментов · ' + docs, 'ok');
    }
  }

  // Пересборка индекса прямо в браузере из PDF (запасной вариант).
  function buildIndexInBrowser() {
    setStatus('Пересобираю индекс из PDF (офлайн)…', 'warn');
    return fetchJson(conf.sourcesUrl).then(function (sourcesConf) {
      var sources = sourcesConf.sources || [];
      if (!sources.length) throw new Error('Нет источников');
      return loadPdfJs().then(function () {
        var tasks = sources.map(function (s, idx) {
          return extractPdfText(s.file).then(function (pdf) {
            var chunks = [], df = {}, docCount = 0, totalLen = 0;
            for (var p = 0; p < pdf.pages; p++) {
              var list = chunkPage(pdf.texts[p], p + 1);
              for (var c = 0; c < list.length; c++) {
                var ch = list[c];
                var tf = termFreqLocal(ch.text);
                var toks = Object.keys(tf);
                chunks.push({ src: idx, page: ch.page, text: ch.text, tf: tf, len: ch.text.length });
                docCount++; totalLen += ch.text.length;
                for (var t = 0; t < toks.length; t++) df[toks[t]] = (df[toks[t]] || 0) + 1;
              }
            }
            return { src: idx, meta: s, chunks: chunks, df: df, docCount: docCount, totalLen: totalLen };
          });
        });
        return Promise.all(tasks).then(function (results) {
          var allChunks = [], df = {}, docCount = 0, totalLen = 0;
          var sourcesMeta = [];
          results.forEach(function (r) {
            sourcesMeta.push(r.meta);
            allChunks = allChunks.concat(r.chunks);
            Object.keys(r.df).forEach(function (k) { df[k] = (df[k] || 0) + r.df[k]; });
            docCount += r.docCount; totalLen += r.totalLen;
          });
          applyIndex({
            sources: sourcesMeta,
            chunks: allChunks,
            df: df,
            docCount: docCount,
            avgdl: docCount ? Math.round(totalLen / docCount) : 200
          });
        });
      });
    }).catch(function (e) {
      setStatus('Не удалось собрать базу знаний: ' + (e && e.message ? e.message : 'ошибка'), 'err');
    });
  }

  function termFreqLocal(text) {
    var toks = tokenize(text, false), map = {};
    for (var i = 0; i < toks.length; i++) map[toks[i]] = (map[toks[i]] || 0) + 1;
    return map;
  }

  function loadPdfJs() {
    if (global.pdfjsLib) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = conf.pdfLibUrl;
      s.onload = function () {
        try { global.pdfjsLib.GlobalWorkerOptions.workerSrc = conf.pdfWorkerUrl; } catch (e) {}
        resolve();
      };
      s.onerror = function () { reject(new Error('Не удалось загрузить pdf.js')); };
      document.head.appendChild(s);
    });
  }
  function extractPdfText(url) {
    var lib = global.pdfjsLib;
    return lib.getDocument(url).promise.then(function (doc) {
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

  function loadCustomIndexLocal() {
    try {
      var raw = localStorage.getItem('pestovo_assistant_index');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function load() {
    var cfg = conf;
    if (!cfg || !cfg.indexUrl) { setStatus('Конфигурация не найдена', 'err'); return; }

    // Приоритет: 1) собранный администратором индекс (localStorage/Firebase),
    //            2) статический docs/assistant-index.json,
    //            3) пересборка в браузере из PDF.
    var local = loadCustomIndexLocal();
    if (local && local.chunks && local.chunks.length) {
      applyIndex(local);
      afterLoad();
      return;
    }

    if (typeof db !== 'undefined') {
      db.ref('settings/assistant_index').once('value').then(function (sn) {
        var v = sn.val();
        if (v && typeof v === 'string') {
          try { var parsed = JSON.parse(v); if (parsed.chunks && parsed.chunks.length) { applyIndex(parsed); afterLoad(); return; } } catch (e) {}
        }
        loadFromFile();
      }).catch(function () { loadFromFile(); });
    } else {
      loadFromFile();
    }

    function loadFromFile() {
      fetchJson(cfg.indexUrl).then(applyIndex).catch(function () {
        return buildIndexInBrowser();
      }).then(afterLoad);
    }

    function afterLoad() {
      renderSuggestions();
      if (state.ready && state.history.length === 0) {
        addBotMessage(greetingText());
      }
    }
  }

  function greetingText() {
    var lang = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'en' : 'ru';
    return lang === 'en'
      ? 'Hi! I read the club documents (PDF) and answer from them. Ask me about booking, handicap WHS, pace of play, dress code, green fee and more.'
      : 'Привет! Я читаю документы клуба (PDF) и отвечаю по ним. Спросите меня о бронировании, гандикапе WHS, темпе игры, дресс-коде и другом.';
  }

  // ---------- Поиск и сборка ответа ----------
  function search(q) {
    var qTokens = tokenize(q, true);
    if (!qTokens.length) {
      // нет значимых слов — вернуть пусто
      return { qTokens: qTokens, ranked: [] };
    }
    var ranked = state.chunks.map(function (c, i) {
      var bm = bm25Score(qTokens, c.tf, state.df, state.docCount, state.avgdl, c.len);
      var toks = Object.keys(c.tf), fz = 0;
      for (var j = 0; j < qTokens.length; j++) {
        var sim = maxTermSim(qTokens[j], toks);
        if (sim > 0.4) fz += sim;
      }
      var phrase = c.text.toLowerCase().indexOf(q.toLowerCase()) >= 0 ? 1.2 : 0;
      return { chunk: c, index: i, score: bm + fz + phrase, bm: bm, fz: fz };
    }).filter(function (r) { return r.score > 0.05; }).sort(function (a, b) { return b.score - a.score; });
    return { qTokens: qTokens, ranked: ranked };
  }

  function sentenceScore(s, qTokens) {
    var toks = tokenize(s, false), set = {};
    var i, sc = 0;
    for (i = 0; i < toks.length; i++) set[toks[i]] = 1;
    for (i = 0; i < qTokens.length; i++) {
      var t = qTokens[i];
      if (set[t]) sc += 2;
      else {
        var sim = maxTermSim(t, Object.keys(set));
        if (sim > 0.5) sc += 0.7 * sim;
      }
    }
    return sc;
  }

  function isHeadingLike(s) {
    // Короткое предложение без завершающей пунктуации или чистый
    // заголовок раздела — не лучший самостоятельный ответ.
    if (s.length < 45 && !/[.!?…]$/.test(s)) return true;
    if (/^\d{1,2}\.\s*[А-ЯЁA-Z]/.test(s) && s.length < 60) return true;
    return false;
  }

  function buildAnswer(res) {
    var qTokens = res.qTokens, ranked = res.ranked;
    if (!ranked.length) return null;
    var topN = ranked.slice(0, conf.maxChunks || 5);
    var bestContent = null, bestAny = null;
    var perSent = {};

    for (var r = 0; r < topN.length; r++) {
      var entry = topN[r];
      var sentList = splitSentences(entry.chunk.text);
      perSent[entry.index] = sentList;
      // Насколько чанк «пропитан» терминами запроса — чем выше, тем он
      // ближе к теме вопроса (важно для вопросов вида «что такое…»).
      var overlap = 0;
      for (var oi = 0; oi < qTokens.length; oi++) overlap += (entry.chunk.tf[qTokens[oi]] || 0);
      for (var k = 0; k < sentList.length; k++) {
        var s = sentList[k];
        var sc = sentenceScore(s, qTokens) + (topN.length - r) * 0.25 + (entry.bm ? 0.1 : 0);
        sc += overlap * 0.08;
        // Содержательные предложения с цифрами/фактами ценим чуть выше
        if (/\d/.test(s)) sc += 0.12;
        var cand = { score: sc, chunkIndex: entry.index, sentIndex: k, page: entry.chunk.page, src: entry.chunk.src, chunk: entry.chunk, heading: isHeadingLike(s) };
        if (cand.heading) sc -= 0.6;
        cand.scored = sc;
        if (!bestAny || sc > bestAny.score) bestAny = cand;
        if (!cand.heading && (!bestContent || sc > bestContent.score)) bestContent = cand;
      }
    }

    var best = bestContent || bestAny;
    if (!best) return null;
    var sentListBest = perSent[best.chunkIndex];
    var picked = [sentListBest[best.sentIndex]];
    // Если ответ — заголовок или короткий пункт, добавить следующее предложение раздела
    if (best.heading || picked[0].length < 45) {
      if (sentListBest[best.sentIndex + 1]) picked.push(sentListBest[best.sentIndex + 1]);
    }

    var answer = '';
    for (var p = 0; p < picked.length; p++) {
      if ((answer + ' ' + picked[p]).trim().length <= (conf.maxAnswerChars || 520)) {
        answer = (answer ? answer + ' ' : '') + picked[p];
      }
    }
    var section = extractSection(best.chunk.text);
    var source = state.sources[best.src];
    return {
      answer: answer.trim(),
      page: best.page,
      sourceTitle: source ? source.title : 'Документ',
      sourceFile: source ? source.file : null,
      section: section
    };
  }

  function extractSection(text) {
    // Берём только «заголовок раздела» вида «3. Гандикап и WHS» с начала
    // чанка, а не нумерованные пункты вида «3.1. Все игроки…».
    var m = String(text || '').match(/^\s{0,3}(\d{1,2}\.\s[А-ЯЁA-Z][^.!?0-9]{0,44})/);
    return m ? m[1].trim() : '';
  }

  function formatAnswer(ans) {
    var html = esc(ans.answer);
    if (ans.section) html = '<span class="as-lead">Раздел: ' + esc(ans.section) + '</span><br>' + html;
    return html;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- UI ----------
  function scrollBottom() { var box = $('as-messages'); if (box) box.scrollTop = box.scrollHeight; }

  function addUserMsg(text) {
    var box = $('as-messages');
    var wrap = document.createElement('div');
    wrap.className = 'as-msg as-user';
    var b = document.createElement('div'); b.className = 'as-bubble'; b.textContent = text;
    wrap.appendChild(b); box.appendChild(wrap); scrollBottom();
  }

  function addBotMsg(text) {
    var box = $('as-messages');
    var wrap = document.createElement('div');
    wrap.className = 'as-msg as-bot';
    var b = document.createElement('div'); b.className = 'as-bubble';
    b.innerHTML = text;
    wrap.appendChild(b); box.appendChild(wrap); scrollBottom();
  }

  function addSourceChip(ans) {
    var box = $('as-messages');
    var last = box.lastElementChild;
    if (!last) return;
    var chip = document.createElement('a');
    chip.className = 'as-source';
    chip.target = '_blank';
    chip.rel = 'noopener';
    var href = ans.sourceFile ? ans.sourceFile + (ans.page ? '#page=' + ans.page : '') : '#';
    chip.href = href;
    chip.title = 'Открыть документ на этой странице';
    chip.innerHTML = '<i class="fas fa-file-pdf"></i> ' + esc(ans.sourceTitle || 'Документ') +
      (ans.page ? ' · стр. ' + ans.page : '');
    last.appendChild(chip);
  }

  function showTyping() {
    var box = $('as-messages');
    var wrap = document.createElement('div');
    wrap.className = 'as-msg as-bot';
    wrap.id = 'as-typing';
    wrap.innerHTML = '<div class="as-bubble as-typing"><span></span><span></span><span></span></div>';
    box.appendChild(wrap); scrollBottom();
  }
  function hideTyping() { var t = $('as-typing'); if (t && t.parentNode) t.parentNode.removeChild(t); }

  function ask(qRaw) {
    var q = String(qRaw || '').trim();
    if (!q || !state.ready) return;
    if (thisBusy) return;   // не даём отправлять второй вопрос до ответа
    thisBusy = true;
    addUserMsg(q);
    pushHistory({ role: 'user', text: q });
    showTyping();
    setTimeout(function () {
      hideTyping();
      var res = search(q);
      var ans = buildAnswer(res);
      if (ans && ans.answer) {
        addBotMsg(formatAnswer(ans));
        addSourceChip(ans);
      } else {
        addBotMsg(noAnswerText());
      }
      pushHistory({ role: 'bot', text: ans ? ans.answer : '', page: ans ? ans.page : null, source: ans ? ans.sourceTitle : null });
      thisBusy = false;
    }, 260 + Math.floor(Math.random() * 260));
  }

  var thisBusy = false;

  function noAnswerText() {
    var lang = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'en' : 'ru';
    return lang === 'en'
      ? "I couldn't find this in the documents. Try rephrasing, or ask about booking, handicap WHS, pace of play or dress code."
      : 'Не нашёл этого в документах. Попробуйте переформулировать или спросите о бронировании, гандикапе WHS, темпе игры или дресс-коде.';
  }

  function pushHistory(m) {
    state.history.push(m);
    if (state.history.length > 60) state.history = state.history.slice(-60);
  }

  function renderSuggestions() {
    var lang = (typeof currentLang !== 'undefined' && currentLang === 'en') ? 'en' : 'ru';
    var chips = lang === 'en' ? [
      'How to book a tee time?',
      'What is the WHS handicap?',
      'Pace of play for 18 holes',
      'Dress code requirements',
      'What is green fee?'
    ] : [
      'Как забронировать время старта?',
      'Что такое гандикап WHS?',
      'Темп игры на 18 лунок',
      'Требования дресс-кода',
      'Сколько стоит грин-фи?'
    ];
    var cont = $('as-suggestions');
    if (!cont) return;
    cont.innerHTML = '';
    chips.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'as-chip'; b.type = 'button'; b.textContent = c;
      b.addEventListener('click', function () { ask(c); });
      cont.appendChild(b);
    });
  }

  // ---------- Инициализация ----------
  function onSend() {
    var input = $('as-input');
    if (!input) return;
    var v = input.value.trim();
    input.value = '';
    if (v) ask(v);
  }

  function bind() {
    var form = $('as-form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); onSend(); });
    var send = $('as-send');
    if (send) send.addEventListener('click', onSend);
    var input = $('as-input');
    if (input) {
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); onSend(); } });
    }
    var clear = $('as-clear');
    if (clear) clear.addEventListener('click', function () {
      var box = $('as-messages'); if (box) box.innerHTML = '';
      state.history = [];
      addBotMessage(greetingText());
    });
  }

  function init() {
    bind();
    // Навигация (как на остальных страницах)
    if (typeof initNav === 'function') initNav();
    if (typeof navAuth === 'function') navAuth(null, null);
    load();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  global.Assistant = { ask: ask, load: load, search: search, buildAnswer: buildAnswer, applyIndex: applyIndex };
})(typeof window !== 'undefined' ? window : this);
