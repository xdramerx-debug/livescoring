# Pestovo Live Scoring

Живое табло и учёт счёта для гольф-клуба «Пестово»: статический сайт (HTML +
JS) и Firebase (Realtime Database, Auth, Cloud Functions, Push). Работает как
PWA — офлайн-кэш через Service Worker.

Фундамент страниц (конфиг курса, форматирование, безопасный HTML, DOM-хелперы,
i18n, алерты) отдаётся одним **ESM-бандлом** `dist/livescoring-modules.js`
(`<script type="module">`); остальной код — классические скрипты на глобальных
функциях. Классические копии фундамента лежат рядом в `js/` (откат + тесты),
их синхронность с `src/` проверяет тест. Подробности —
`docs/MODULES-MIGRATION.md`.

## Структура

| Путь | Назначение |
|---|---|
| `*.html` | Страницы приложения (index, live, admin, tournaments, …) |
| `dist/livescoring-modules.js` | **Собранный ESM-бандл фундамента** (грузится на страницах; коммитится) |
| `src/` | Исходники ESM-модулей бандла (Vite) + мост глобалов на `window` |
| `js/course-config.js` | Конфигурация курса (классическая копия модуля из `src/`) |
| `js/format.js` | Форматирование счёта и дат (классическая копия) |
| `js/date-range.js` | Фильтр по датам для списков раундов (классическая копия) |
| `js/safe-html.js` | Безопасный HTML-билдер (`esc`, `` html`…` ``) — защита от XSS |
| `js/dom.js` | DOM-хелперы: toast-уведомления, вибрация, `escapeHtml` |
| `js/i18n.js` | Языковой словарь RU/EN, `t()`, `toggleLang()` |
| `js/official-alerts.js` | Отправка алертов судья/маршал в Telegram/VK |
| `js/utils.js` | Общая логика (навигация, раунды, лидерборд, Firebase-обёртки) |
| `functions/` | Cloud Functions (push-уведомления) |
| `tools/` | Тесты (`test-*.js`) и утилиты сборки/проверок |
| `database.rules.json` | Security Rules для Realtime Database (см. `docs/SECURITY-RULES.md`) |

Порядок загрузки: модульный бандл (отложенный, `defer`) → классические скрипты
страницы (`utils.js` и фичевые) → обработчики `DOMContentLoaded`. Бандл
выполняется после классических скриптов, поэтому load-time код в `js/*.js` не
может опираться на глобалы фундамента (в `utils.js` boot-вызовы из-за этого
защищены).

## Разработка

```bash
npm install          # dev-зависимости (eslint, vite, playwright)
npm test             # все тесты (tools/test-*.js), чистый Node 18+
npm run lint:syntax  # node --check по всем js-файлам
npm run assets       # ?v=<hash> в HTML + precache-манифест sw.js (после правок js/css)
npm run build        # ESM-бандл dist/livescoring-modules.js (Vite) — коммитить результат
npm run check:bundle # бандл в dist/ соответствует src/ (в CI)
npm run check:browser# живая браузерная проверка всех страниц (classic vs bundle)
```

Тесты — чистый Node (18+), без внешних фреймворков; `tools/run-tests.js`
находит и запускает `tools/test-*.js`, `tools/test-bootstrap.js` прозрачно
добавляет модули-фундаменты к загрузкам `js/utils.js` в vm-песочницах.

**После любой правки `src/` или `js/`-копий фундамента:** `npm run build` →
`npm run assets` → коммит (CI проверит свежесть бандла и версии ассетов).

**Живая проверка страниц** (`npm run check:browser`) — главный инструмент
перед деплоем переключений загрузки: сравнивает текущий бандл с классическими
тегами на всех 21 странице в реальном браузере (Playwright/Chromium, Firebase
подменяется заглушкой, внешние запросы блокируются). Браузер ищется в порядке
`CHROMIUM_PATH` → chromium playwright → `@sparticuz/chromium` из
`node_modules`; если браузера нет — проверка пропускается
(`--require` заставляет её падать, как в CI). В песочнице без системных
libnss3/libnspr4 заглушки собирает `tools/build-stub-libs.sh`
(`CHROMIUM_EXTRA_LIBS=$PWD/tools/.browser-stub`).

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
- `docs/MODULES-MIGRATION.md` — статус и план перехода на ES-модули.
- `docs/SECURITY-RULES.md` — правила БД и порядок их деплоя.
- `ASSISTANT.md` — офлайн-помощник по документам клуба (RAG по PDF).
