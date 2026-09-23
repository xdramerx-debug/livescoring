import { defineConfig } from 'vite';

// Builds the ESM module bundle for the extracted, dependency-light modules.
// This is the foundation for migrating the app off global <script> tags.
// The legacy js/*.js classic scripts remain the running source until the HTML
// is switched to load /dist/livescoring-modules.js (a browser-verified step).
export default defineConfig({
    root: '.',
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
