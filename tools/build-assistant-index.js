// ============================================================
//  Сборка поискового индекса для «Помощника» (офлайн RAG).
//  Запуск:  node tools/build-assistant-index.js
//  Читает docs/assistant-sources.json, парсит PDF (pdfjs-dist),
//  считает чанки и пишет docs/assistant-index.json.
// ============================================================
const fs = require('fs');
const path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const lib = require('./assistant-lib.js');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'docs', 'assistant-sources.json');
const OUT_PATH = path.join(ROOT, 'docs', 'assistant-index.json');

async function extractPdf(file) {
  const data = new Uint8Array(fs.readFileSync(path.join(ROOT, file)));
  const doc = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  const texts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Собираем текст в одну «непрерывную» строку (переносы строк не нужны —
    // границы чанков строим по заголовкам/пунктам).
    const out = content.items.map((it) => (it.str || '')).join(' ');
    texts.push(out);
  }
  return { numPages: doc.numPages, texts };
}

async function main() {
  const conf = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const sources = conf.sources || [];
  const chunks = [];
  const df = {};
  let docCount = 0;
  let totalLen = 0;

  for (let s = 0; s < sources.length; s++) {
    const src = sources[s];
    console.log('Parsing:', src.title, '->', src.file);
    const pdf = await extractPdf(src.file);
    const srcMeta = { id: s, title: src.title, file: src.file, pages: pdf.numPages };
    let pageChunks = 0;
    for (let p = 0; p < pdf.numPages; p++) {
      const pageText = pdf.texts[p];
      const pageChunksList = lib.chunkPage(pageText, p + 1);
      for (const c of pageChunksList) {
        const tf = lib.termFreq(c.text);
        const tokens = Object.keys(tf);
        const chars = c.text.length;
        chunks.push({ src: s, page: c.page, text: c.text, tf: tf, len: chars });
        docCount++;
        totalLen += chars;
        pageChunks++;
        for (const t of tokens) df[t] = (df[t] || 0) + 1;
      }
    }
    console.log('  -> pages:', pdf.numPages, 'chunks:', pageChunks);
  }

  const avgdl = docCount ? Math.round(totalLen / docCount) : 200;
  const index = {
    name: conf.name || 'База знаний',
    version: conf.version || 1,
    generatedAt: new Date().toISOString(),
    sources: sources,
    docCount: docCount,
    avgdl: avgdl,
    df: df,
    chunks: chunks
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(index));
  console.log('Index written:', OUT_PATH);
  console.log('  sources:', sources.length, 'chunks:', docCount, 'terms:', Object.keys(df).length, 'avgdl:', avgdl);
  console.log('  size:', (fs.statSync(OUT_PATH).size / 1024).toFixed(1), 'KB');
}

main().catch(e => { console.error('ERROR', e); process.exit(1); });
