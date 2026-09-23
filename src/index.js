// ESM entry point — bundles the extracted, dependency-light modules.
// Loaded via <script type="module" src="/dist/livescoring-modules.js"> once the
// HTML switches to modules (see migration plan in docs/IMPROVEMENTS-IMPL.md).
export * from './course-config.js';
export * from './format.js';
export * from './safe-html.js';
export * from './dom.js';
export * from './i18n.js';
export * from './official-alerts.js';
