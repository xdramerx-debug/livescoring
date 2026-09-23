# Pestovo Live Scoring

Живое табло и учёт счёта для гольф-клуба «Пестово»: статический сайт (HTML +
классические JS-скрипты) и Firebase (Realtime Database, Auth, Cloud
Functions, Push). Работает как PWA — офлайн-кэш через Service Worker.

## Структура

| Путь | Назначение |
|---|---|
| `*.html` | Страницы приложения (index, live, admin, tournaments, …) |
| `js/course-config.js` | Конфигурация курса (лунки, пар, ти, рейтинги, тайминги) |
| `js/format.js` | Форматирование счёта (`fmtScore`, `scoreClass`, …) |
| `js/safe-html.js` | Безопасный HTML-билдер (`esc`, `` html`…` ``) — защита от XSS |
| `js/dom.js` | DOM-хелперы: toast-уведомления, вибрация, `escapeHtml` |
| `js/i18n.js` | Языковой словарь RU/EN, `t()`, `toggleLang()` |
| `js/official-alerts.js` | Отправка алертов судья/маршал в Telegram/VK |
| `js/utils.js` | Общая логика (навигация, раунды, лидерборд, Firebase-обёртки) |
| `src/` | Канонические ESM-версии модулей (собираются Vite в `dist/`) |
| `functions/` | Cloud Functions (push-уведомления) |
| `tools/` | Тесты (`test-*.js`) и утилиты сборки |
| `database.rules.json` | Security Rules для Realtime Database (см. `docs/SECURITY-RULES.md`) |

Порядок загрузки на страницах: `course-config → format → safe-html → dom →
i18n → utils` (фундаменты грузятся раньше `utils.js`).

## Разработка

```bash
npm install          # dev-зависимости (eslint, vite)
npm test             # все тесты (tools/test-*.js)
npm run lint:syntax  # node --check по всем js-файлам
npm run assets       # ?v=<hash> в HTML + precache-манифест sw.js (после правок js/css)
npm run build        # ESM-бандл dist/livescoring-modules.js (Vite)
```

Тесты — чистый Node (18+), без внешних фреймворков; `tools/run-tests.js`
находит и запускает `tools/test-*.js`, `tools/test-bootstrap.js` прозрачно
добавляет модули-фундаменты к загрузкам `js/utils.js` в vm-песочницах.

## Безопасность

- **`js/firebase-config.js` содержит Firebase Web API key — это НЕ секрет.**
  Для Firebase Web SDK ключ публикуется в клиенте по дизайну: он лишь
  идентифицирует проект в Firebase, но не даёт доступ к данным. Реальная
  защита — **Security Rules** (`database.rules.json`) и правила
  авторизации. Не поднимайте тревогу по факту наличия ключа в коде;
  ротация ключа тоже не является защитой от несанкционированного доступа.
  Подробности: <https://firebase.google.com/docs/projects/api-keys> и
  `docs/SECURITY-RULES.md`.
- Вставка пользовательских строк в HTML — только через `escapeHtml()` /
  `` html`…` `` (`js/safe-html.js`). CSP задаётся заголовками в
  `firebase.json`.
- Изменения правил БД деплоить осознанно: см. предупреждение в
  `docs/SECURITY-RULES.md`.

## Документация

- `docs/CODE-REVIEW.md` — аудит кодовой базы и приоритеты улучшений.
- `docs/IMPROVEMENTS-IMPL.md` — что уже сделано по аудиту.
- `docs/MODULES-MIGRATION.md` — план перехода на ES-модули.
- `docs/SECURITY-RULES.md` — правила БД и порядок их деплоя.
- `ASSISTANT.md` — офлайн-помощник по документам клуба (RAG по PDF).
