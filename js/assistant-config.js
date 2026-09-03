// ============================================================
//  Конфигурация «Помощника» (офлайн-чат с ответами по документам)
//  indexUrl   — готовый поисковый индекс, собирается командой:
//               node tools/build-assistant-index.js
//  sourcesUrl — список PDF с описаниями (единый источник правды).
//  При загрузке сайта без интернета помощник использует уже
//  собранный index.json + PDF из папки docs/ (все файлы локальные).
// ============================================================
window.ASSISTANT_CONFIG = {
  indexUrl: 'docs/assistant-index.json',
  sourcesUrl: 'docs/assistant-sources.json',
  // Локальные копии pdf.js (подгружаются только при необходимости
  // пересобрать индекс прямо в браузере; для ответов не нужны).
  pdfLibUrl: 'vendor/pdfjs/pdf.min.js',
  pdfWorkerUrl: 'vendor/pdfjs/pdf.worker.min.js',
  // Ограничение результатов и объёма ответа
  maxChunks: 5,
  maxAnswerChars: 520
};
