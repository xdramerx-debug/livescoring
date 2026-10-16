import { defineConfig } from 'vite';

// Builds the ESM module bundle for the extracted, dependency-light modules.
// This is the foundation for migrating the app off global <script> tags.
// The legacy js/*.js classic scripts remain the running source until the HTML
// is switched to load /dist/livescoring-modules.js (a browser-verified step).
export default defineConfig({
    root: '.',
    // Это библиотечная сборка одного ESM-бандла из src/index.js — копировать
    // публичный каталог в dist/ не нужно. Без publicDir: false Vite брал
    // каталог по умолчанию (`public/`, артефакт деплоя от npm run build:public)
    // и копировал ВЕСЬ сайт в dist/, включая public/dist/livescoring-modules.js —
    // то есть старая копия бандла перезаписывала только что собранный файл.
    publicDir: false,
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        lib: {
            entry: 'src/index.js',
            formats: ['es'],
            fileName: () => 'livescoring-modules.js'
        }
    }
});
