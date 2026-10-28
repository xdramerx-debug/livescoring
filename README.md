# Pestovo Live Scoring

Живое табло и учёт счёта для клуба «Пестово»: статический сайт (HTML +
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
| `public/` | **Каталог деплоя**: минифицированное зеркало сайта (`npm run build:public`, не коммитится) |
| `src/` | Исходники ESM-модулей бандла (Vite) + мост глобалов на `window` |
| `fonts/` | Подмножество Font Awesome: только используемые иконки (`npm run build:fonts`) |
| `css/fontawesome-subset.css` | Стиль сабсета и `@font-face` на `fonts/*.woff2` (генерируется) |
| `css/theme-v2.css` | Визуальный слой: палитра, шкала поверхностей, типографика, светлая тема (см. `docs/DESIGN.md`) |
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
| `database.rules.json` | Security Rules для Realtime Database (см. `docs/SECURITY-RULES.md`); на прод не отдаётся |
| `firebase.json` | Hosting (`public/`, `predeploy`, `Cache-Control`, CSP) и точки деплоя functions/database |

Порядок загрузки: модульный бандл (отложенный, `defer`) → классические скрипты
страницы (`utils.js` и фичевые) → обработчики `DOMContentLoaded`. Бандл
выполняется после классических скриптов, поэтому load-time код в `js/*.js` не
может опираться на глобалы фундамента (в `utils.js` boot-вызовы из-за этого
защищены).

## Турниры

Публичная страница **`tournaments.html`** — каталог соревнований, регистрация,
результаты и счётные карточки.

Создание и ведение турниров возвращено в админ-панель: вкладка
**«Турниры 🏆»** (`admin.html` → `#tab-tnmanager`) даёт полный цикл —
турнир → раунды → группы → участники (поиск RU/EN, Excel, справочник) →
стартовый лист с QR-кодами маркеров → счёт по лункам → результаты и
карточка игрока, с выгрузкой PDF и Excel. Конструктор печатных карточек
(вкладка «Счетные карточки») растягивает каждый блок таблицы мышью
(№, Пар, Длина, Индекс, Фора, Удары), показывает длины лунок и красит
карточку — цвета, фоны и шрифты, общие и по-блочно. Данные пишутся в
существующее дерево `tournaments/<id>`, live-скоринг и правила доступа
не менялись. Подробности: [docs/tn-manager.md](docs/tn-manager.md).

## Разработка

```bash
npm ci               # зависимости строго по package-lock.json (eslint, vite, esbuild, playwright, jsdom)
npm test             # все тесты (tools/test-*.js), чистый Node 18+, параллельно (--jobs=N, --serial)
npm run lint         # ESLint: 0 ошибок и 0 предупреждений — гейт в CI
npm run lint:syntax  # node --check по всем js-файлам
npm run check:globals# мёртвые глобалы: объявлено в js/, но не используется нигде в репозитории
npm run check:listeners # RTDB-подписка без защиты от повторного вызова (.off/guard/реестр)
npm run build:fonts   # подмножество Font Awesome по классам fa-* в разметке (коммитить результат)
npm run check:fonts   # сабсет иконок не разошёлся с разметкой (в CI)
npm run check:design  # контраст токенов темы по WCAG, кегли, подключение слоя (в CI)
npm run assets        # ?v=<hash> в HTML + precache-манифест sw.js (после правок js/css)
npm run build         # ESM-бандл dist/livescoring-modules.js (Vite) — коммитить результат
npm run build:public  # каталог деплоя public/ (минификация js/css) — НЕ коммитится
npm run check:bundle  # бандл в dist/ соответствует src/ (в CI)
npm run check:browser# живая браузерная проверка всех страниц (classic vs bundle)
```

Тесты — чистый Node (18+); `tools/run-tests.js` находит и запускает
`tools/test-*.js` **пулом на число ядер** (тесты независимы: каждый поднимает
свою vm-песочницу или jsdom), `tools/test-bootstrap.js` прозрачно добавляет
модули-фундаменты к загрузкам `js/utils.js` в vm-песочницах. Часть тестов
поднимает настоящие страницы в **jsdom** (`jsdom` — dev-зависимость): без
него они не падают, а пропускаются с пометкой SKIP. Вывод детерминирован:
stdout каждого теста буферизуется и печатается в алфавитном порядке.

Зависимости зафиксированы `package-lock.json` (и `functions/package-lock.json`),
поэтому в CI стоит строгий `npm ci`: без локфайла шаг `npm ci || npm install`
молча собирал произвольные версии Playwright/Chromium, Vite и esbuild.

**После любой правки `src/` или `js/`-копий фундамента:** `npm run build` →
`npm run assets` → коммит (CI проверит свежесть бандла и версии ассетов).

**Живая проверка страниц** (`npm run check:browser`) — главный инструмент
перед деплоем переключений загрузки: сравнивает текущий бандл с классическими
тегами на всех HTML-страницах в реальном браузере (Playwright/Chromium, Firebase
подменяется заглушкой, внешние запросы блокируются). Браузер ищется в порядке
`CHROMIUM_PATH` → chromium playwright → `@sparticuz/chromium` из
`node_modules`; если браузера нет — проверка пропускается
(`--require` заставляет её падать, как в CI). В песочнице без системных
libnss3/libnspr4 заглушки собирает `tools/build-stub-libs.sh`
(`CHROMIUM_EXTRA_LIBS=$PWD/tools/.browser-stub`).

## Деплой

Каталог, который Firebase Hosting отдаёт на прод, — **`public/`**
(`hosting.public` в `firebase.json`), а не корень репозитория. Он собирается
`tools/build-public.js` и **не коммитится** (в `.gitignore`):

```bash
npm run build:public                       # собрать public/ вручную
firebase deploy --only hosting --project livescore-b77e4
```

`firebase deploy --only hosting` собирает `public/` сам — в `firebase.json`
прописан `hosting.predeploy: ["npm run build:public"]`, поэтому задеплоить
несобранный каталог не получится.

Сборка копирует в `public/` только то, что нужно на проде (`*.html`, `sw.js`,
`manifest.json`, `css/`, `js/`, `dist/`, `img/`, `fonts/`) и минифицирует `js/**` и
`css/**` через esbuild. Служебное (`src/`, `tools/`, `docs/`, `functions/`,
`database.rules.json`, `package*.json`, `*.md`) на прод не попадает вовсе —
раньше оно вычиталось списком `hosting.ignore`, и `database.rules.json`
(полная карта правил авторизации, 15 КБ) всё равно отдавался публично.

Режим минификации — **осознанно неполный**: `minifyWhitespace` +
`minifyIdentifiers` без `minifySyntax`. Замер: 251 КБ gzip против 249 КБ у
полного `minify` (разница 0.8 %), зато исключены синтаксические перезаписи в
коде, где семантика глобалов зависит от порядка исполнения `<script>`.
`dist/` и `sw.js` не минифицируются: бандл уже собран Vite (повторный прогон
esbuild делает его на 4 % больше), а Service Worker важнее читать в поле, чем
экономить 10 КБ.

Экономия на страницу (gzip, локальные js+css):

| Страница | Было | Стало | |
|---|---|---|---|
| `admin.html` | 632 КБ | 418 КБ | −34 % |
| `setup-round.html` | 382 КБ | 244 КБ | −36 % |
| `tournaments.html` | 370 КБ | 247 КБ | −33 % |
| `index.html` | 305 КБ | 197 КБ | −35 % |
| `scorer.html` / `marker.html` | 293 КБ | 191 КБ | −35 % |
| `offline.html` | 283 КБ | 184 КБ | −35 % |

### Иконки

Font Awesome **свой**: `tools/build-fontawesome.js` сканирует `*.html`, `js/**`,
`css/**`, `src/**` на классы `fa-*`, по метаданным пакета
`@fortawesome/fontawesome-free@6.5.0` (того же релиза, что раньше тянулся с
cdnjs) определяет кодовые точки и режет шрифт до используемых глифов —
189 иконок, 32 КБ вместо 401 КБ полного комплекта. Имена файлов несут хеш
содержимого, поэтому immutable-кэш безопасен; шрифты попадают в precache и
работают офлайн. Запускать после правок разметки:

```bash
npm run build:fonts && npm run assets   # пересобрать сабсет и обновить ?v=
```

Инварианты сборки проверяет `tools/test-build-public.js` (входит в `npm test`):
каждый ассет из HTML и каждый URL precache-манифеста существует в `public/`,
каждый минифицированный `.js` проходит `node --check`, **набор глобалов
верхнего уровня совпадает с исходником** (это и есть контракт `window.*`,
который вызывают `onclick` в HTML и соседние файлы), HTML скопированы
байт-в-байт (`?v=` остаются валидными для `rev-assets --check`), gzip-объём
уменьшился. Конфигурацию Hosting (каталог, `predeploy`, `Cache-Control`, CSP)
проверяет `tools/test-firebase-config.js`.

Кэширование: все URL статики несут `?v=<sha1-8 содержимого>`, поэтому
`js/`, `css/`, `dist/`, `img/` и `fonts/` отдаются с `Cache-Control: public,
max-age=31536000, immutable`, а HTML, `sw.js` и `manifest.json` — с `no-cache`
(в них живут `?v=` и precache-манифест; долгий кэш оставил бы пользователя без
новых версий и без нового Service Worker).

Есть и ручной деплой из GitHub Actions: `.github/workflows/deploy.yml`
(`workflow_dispatch`, цель `hosting` / `functions` / обе). Нужен секрет
`FIREBASE_SERVICE_ACCOUNT`. Правила БД из него **не** деплоятся — только
вручную и осознанно, см. `docs/SECURITY-RULES.md`.

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

- `docs/DESIGN-REVIEW-2026-10.md` — дизайн-ревью: контраст, кегли, акцент, темы,
  с замерами и макетом «до/после» (`design-review.html`).
- `docs/IMPROVEMENTS-2026-10.md` — текущий аудит: что улучшать дальше, с замерами.
- `docs/CODE-REVIEW.md` — первый аудит (2026-09) и приоритеты улучшений.
- `docs/IMPROVEMENTS-IMPL.md` — что уже сделано по аудиту.
- `docs/MODULES-MIGRATION.md` — статус и план перехода на ES-модули.
- `docs/SECURITY-RULES.md` — правила БД и порядок их деплоя.
- `docs/release-1.111.0.md` — текущая версия: стартовый лист пачкой
  («10:00: фамилия имя, …»), удаление участников пачкой, прочерк в лидерборде
  вместо места и вкладка «Отображение карточек в турнире».
- `docs/release-1.110.0.md` — отдельные флайты при последовательном
  старте и персональный QR игрока на карточке.
- `docs/release-1.109.0.md` — длина лунок на карточках по ТИ из стартового листа.
- `docs/release-1.108.0.md` — предыдущая версия (флайты от 3 игроков, публикация
  стартового листа, блоки карточки, точный + полевой HCP).
- `docs/release-1.105.0.md` — история раундов
  гостей и игроков, добавленных позже: правила записи, деплой `database`).
- `docs/release-1.104.0.md` — предыдущая версия (гости в автоподбор после раунда,
  варианты экрана ввода счёта с показом фора/пар/дистанции/дедлайна).
- `docs/release-1.103.0.md` — предыдущая версия (название,
  RUSGOLF в раунде, уведомления, шапка, 5 стилей ввода счёта) и как это
  проверять.
