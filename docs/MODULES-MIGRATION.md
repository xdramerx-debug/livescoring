# Миграция на ES-модули + сборка (пункт 1 плана)

Цель — уйти от глобальных `<script>`-тегов к ES-модулям и Vite, чтобы
получить tree-shaking, ленивую загрузку и нормальные юнит-тесты без vm-костылей.

## Текущее состояние (фундамент готов и проверен)

- `js/course-config.js`, `js/format.js`, `js/safe-html.js`, `js/dom.js`,
  `js/i18n.js` — классические скрипты, выставляющие глобальные переменные
  (`var`/`function` → `window`). Порядок загрузки на всех страницах:
  `course-config → format → safe-html → dom → i18n → utils`.
- `src/course-config.js`, `src/format.js`, `src/safe-html.js`, `src/dom.js`,
  `src/i18n.js`, `src/index.js` — **канонические ESM-версии** тех же модулей.
  При загрузке как модуль они дополнительно выставляют те же символы на
  `window` (bridge для legacy-кода).
- `vite.config.js` + скрипты `dev`/`build`/`preview` в `package.json`.
- `npx vite build` собирает `dist/livescoring-modules.js` (~76.5 kB, 6
  модулей). Проверено: при загрузке бандла как ESM с заглушкой `window` все
  глобалы (`HOLES`, `holePar`, `fmtScore`, `esc`, `toast`, `escapeHtml`,
  `vib`, `t`, `I18N`, `holeResClass`, …) доступны.

## Следующие шаги (требуют проверки в браузере/деплое)

1. Во всех HTML и `sw.js` заменить три тега
   `<script src="js/course-config.js">`, `…/format.js`, `…/safe-html.js`
   на один `<script type="module" src="/dist/livescoring-modules.js"></script>`.
   Module-скрипты откладываются (defer), поэтому глобалы будут доступны к
   моменту пользовательского взаимодействия (runtime-вызовы в `utils.js` и др.
   от этого не зависят).
2. Когда подтверждено в браузере — удалить классические
   `js/course-config.js` / `js/format.js` / `js/safe-html.js`.
3. Повторить извлечение для остальных ответственностей (Firebase-обёртки
   `bindRealtimeValue` и т.п.; `dom` и `i18n` уже вынесены) → добавить в
   `src/index.js` → пересобрать бандл.
4. Постепенно перевести потребителей (`utils.js`, `admin.js`, …) на явный
   `import` из бандла (или оставить использование `window`-глобалов на период
   перехода).
5. Включить `npm run build` в пайплайн деплоя (Firebase Hosting должен
   отдавать `dist/` + собранные ассеты; при необходимости поправить
   `public`/`rewrites` в `firebase.json`).

## Важно

- `dist/` добавлен в `.gitignore` (билд-артефакт, не коммитится).
- Пока HTML не переключён, рабочим источником остаются классические `js/*.js`,
  а `src/` — будущее. Не удаляйте `js/`-версии, пока не пройдена проверка в
  браузере (пункт 1–2 выше).
