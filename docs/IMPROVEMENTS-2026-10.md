# Что улучшать дальше — аудит 2026-10-14

Свежий проход по кодовой базе после `docs/CODE-AUDIT-2026-09.md`. Всё ниже
подкреплено замерами на коммите `7b81509`; команды, которыми получена цифра,
указаны рядом. Прошлые аудиты закрыли XSS-экранирование, правила БД,
приватность `users` → `usersPublic` и мёртвый код — **новых мёртвых функций в
`js/utils.js` не осталось (0 из 417)**, `TODO/FIXME` — 0, `alert()` — 0,
`npm test` — 67/67 ✔, `check:bundle` ✔, паритет i18n RU↔EN — 565/565 ключей.

Поэтому список ниже — это то, что ещё **не** закрыто, отсортировано по
соотношению риск/эффект/трудозатраты.

> ### Реализовано
>
> Список закрыт по решению «сделай все» (кроме отложенных осознанно п. 2 и 8).
> У каждого пункта ниже — строка **Статус** с тем, что именно сделано и чем это
> закреплено. Итог: **17 пунктов закрыты полностью**, п. 13 — частично
> (шесть одноимённых пар оставлены с обоснованием), п. 2 и 8 — отложены
> решением. Текущее состояние кодовой базы описано в `docs/CODE-REVIEW.md`.
>
> Перед деплоем: `firebase deploy --only database` (новый узел `errorReports`),
> затем hosting. Секрет мастер-пароля — обязателен на проде:
> `firebase functions:secrets:set TOURNAMENT_MASTER_PASSWORD_HASH --project livescore-b77e4`.

---

## 🔴 P0 — безопасность

### 1. Мастер-пароль `55555` — штатный режим продакшена

**Статус: ✅ закрыто.** Без секрета — `failed-precondition`; эмулятор — исключение; ключ лимита из `x-forwarded-for`; дефолт на проде отвергается. `tools/test-tournament-master-secret.js`, `docs/tournament-master-access.md`.

`functions/index.js:36` держит `DEFAULT_MASTER_PASSWORD_HASH = sha256("55555")`,
а `functions/index.js:50-52` возвращает его, когда
`process.env.TOURNAMENT_MASTER_PASSWORD_HASH` не задан. Комментарий и
`docs/tournament-master-access.md:9-11` прямо называют это «штатным режимом»:
секрет намеренно не привязан через `runWith({secrets})`, чтобы деплой не падал.

Что получает вошедший как `tournament-master` (по `database.rules.json`):
запись в `rounds`, `tournaments`, `protocols`, `markerAssignments`, `alerts`,
`usersPublic` — и вызов `wipeAllData` (`functions/index.js:123`), который через
Admin SDK сносит `users`, `rounds`, `tournaments`, `broadcasts` и остальные
ветки целиком. То есть пароль из 5 цифр, лежащий в публичном репозитории,
отделяет от полного удаления данных клуба.

Единственная защита — лимит 5 попыток / 15 минут
(`functions/index.js:64-86`), ключом служит
`context.rawRequest.ip` с фолбэком `'unknown'`. На Cloud Functions v1 за
балансировщиком `rawRequest.ip` нередко одинаков для многих клиентов, а при
фолбэке все попытки попадают в одно ведро: атакующий может как перебирать
пароль, так и заблокировать легитимного мастера (отказ в обслуживании).

**Что сделать (по возрастанию цены):**

1. Fail closed: если секрет не установлен — всегда
   `failed-precondition`, без дефолтного хэша. Деплой без секрета тогда
   очевиден и чинится одной командой `firebase functions:secrets:set …`,
   а не остаётся тихой дырой.
2. Проверка на старте функции + явный лог `logger.error`, если работает дефолт
   (переходный период, пока секрет не выставлен).
3. Лимит попыток — на `uid`+IP и с экспоненциальным окном; отдельно алерт в
   `alerts`/Telegram при N отказах подряд.
4. Стратегически: заменить общий PIN на нормальные аккаунты Firebase Auth с
   custom claim `tournamentMaster`, которые выдаёт админ. Тогда не будет ни
   общего секрета, ни 8-часового токена, ни `auth.uid === 'tournament-master'`
   в правилах.

### 2. `'unsafe-inline'` в CSP при 375 inline-обработчиках

**Статус: ⏸ отложено решением.** CSP **добавлен** (без `'unsafe-eval'`, `object-src 'none'`). Вынос `'unsafe-inline'` = переписывание 163 `onclick=` в HTML и 212 в JS на `addEventListener` — отдельная задача, не «на полдня».

`firebase.json` отдаёт
`script-src 'self' … 'unsafe-inline'` и `style-src … 'unsafe-inline'`.
Причина измерима:

| Что | Сколько | Где |
|---|---|---|
| `onclick=` в HTML | 163 | `admin.html` 107, `setup-round.html` 31, … |
| `onclick=` в HTML, собранном в JS | 212 | `js/*.js` |
| inline `style="…"` в HTML | 410 | все страницы |
| inline `<script>`-блоков | 0 | ✔ уже чисто |

Работа из прошлого аудита (`tnJsStr`, экранирование имён) закрывает инъекцию
в *содержимое* обработчика; свежий разбор добавил `pestovoInlineJsArg()` для
имени файла в `openPNGExportModal()` (ФИО игрока рвало строку в inline-`onclick`).
Но CSP с `'unsafe-inline'` не останавливает
инъекцию в любое другое место, где строится HTML. Убрать `script-src
'unsafe-inline'` реально: обработчиков немного типов (кнопки вкладок,
удаление, переключатели), они переносится на **делегирование** —
`document.addEventListener('click', …)` + `data-action`/`data-id`.
`js/safe-html.js` уже есть, останется добавить хелпер `on(el, sel, action, fn)`.

`style-src` сложнее (410 inline-стилей + динамические темы `design-system.js`),
но и там путь понятен: темы пишут CSS-переменные в один `<style id="theme">`
(один nonce/хэш вместо `'unsafe-inline'`), а inline-стили переезжают в
утилитарные классы.

### 3. Нет прод-репортинга ошибок

**Статус: ✅ закрыто.** `reportError()` → RTDB `errorReports` с лимитами (20/сессию, ≥2 с, ≤3 на ошибку), узел в правилах с `.validate`, карточка «Ошибки клиентов» в админке. `tools/test-error-reporting.js`.

`js/firebase-config.js:74-87` — `reportError()` только пишет в `console.error`,
комментарий сам говорит: «Единая точка для будущего репортинга (Sentry /
аналитика). Сейчас только логирует». Перехватчики `window.error` и
`unhandledrejection` уже стоят, то есть 90 % работы сделано.

Для приложения, которое используют на поле при плохом мобильном интернете,
это значит: любые полевые сбои невидимы. Дешёвый вариант без внешних сервисов —
писать в узел RTDB `errorReports/<ts>` (лимит: только залогиненные, `.validate`
на длину/тип, не чаще N в минуту с клиента) и показать список во вкладке
админки рядом с `alerts`. Дороже, но лучше — Crashlytics/Sentry.

### 4. `hosting.public: "."` публикует служебные файлы

**Статус: ✅ закрыто (сильнее).** Вместо расширения `hosting.ignore` — отдельный каталог деплоя `public/` (`npm run build:public`, predeploy). Служебные файлы не публикуются вовсе.

`firebase.json` деплоит корень репозитория; `ignore` закрывает только
`firebase.json`, dot-файлы, `node_modules`, `functions/`, `tools/`, `docs/`.
Публично отдаются (замер: 104 файла, 4.15 МБ):

- **`database.rules.json` (15 КБ)** — полная карта авторизации, включая схему
  `tournament-master` и custom-claim'ы. Сама по себе не уязвимость (правила и
  так выполняются на сервере), но в связке с п.1 это готовый план атаки.
- `src/*.js` (114 КБ) — исходники ESM-фундамента, на проде не нужны (страницы
  грузят `dist/livescoring-modules.js`).
- `package.json`, `vite.config.js`, `README.md`, `package-lock.json`.

**Фикс — 5 строк в `firebase.json`:** добавить в `ignore`
`"database.rules.json"`, `"src/**"`, `"package.json"`, `"package-lock.json"`,
`"vite.config.js"`, `"README.md"`, `"*.md"`. Либо перейти на явный
`public: "public"` со сборкой (см. п.5) — тогда деплоится только артефакт.

---

## 🟠 P1 — размер страниц и скорость на поле

### 5. Классические скрипты не минифицируются вообще

**Статус: ✅ закрыто.** esbuild при сборке `public/`: gzip js+css 854K → 561K (−34 %). Без `minifySyntax` — переписывание синтаксиса рискованно для боевого кода.

Vite собирает только `dist/livescoring-modules.js` (95 КБ, 8 модулей), а все
`js/*.js` и `css/*.css` уходят на Hosting как есть. Замер (esbuild
`minify:true`, gzip -9) по локальным ассетам каждой страницы:

| Страница | gzip сейчас | gzip после минификации | Экономия |
|---|---|---|---|
| `admin.html` | 637 КБ | 421 КБ | **−217 КБ (−34 %)** |
| `setup-round.html` | 386 КБ | 247 КБ | −139 КБ (−36 %) |
| `tournaments.html` | 377 КБ | 253 КБ | −124 КБ (−33 %) |
| `index.html` | 310 КБ | 201 КБ | −109 КБ (−35 %) |
| `scorer.html` / `marker.html` | 298 / 297 КБ | 195 / 194 КБ | −103 КБ (−35 %) |
| `offline.html` | 287 КБ | 187 КБ | −100 КБ (−35 %) |

По файлам: `js/utils.js` 148 КБ → 84 КБ gzip (−43 %), `js/live.js` 36 → 19 КБ
(−46 %), `js/app.js` 18 → 11 КБ (−41 %).

Минификация ничего не ломает в global-script модели, если не бандлить:
`esbuild --minify --format=iife --legal-comments=none` **пофайлово** сохраняет
`var`-глобалы и порядок исполнения. `esbuild` уже лежит в `node_modules` как
зависимость Vite. Дальше `tools/rev-assets.js` хэширует содержимое — значит,
`?v=` и precache подхватят минифицированные копии без ручных правок.

### 6. `js/utils.js` — 605 КБ / 10 837 строк на каждой странице

**Статус: ✅ закрыто.** `utils.js` 10 837 → 10 435 строк; QR-стек (58 КБ) снят с 11 страниц, где QR не рисуется (`tools/test-qr-vendor-scope.js`). Per-page бандлы не делались — нужен переход на ESM.

417 функций верхнего уровня грузятся везде, включая страницы, где используется
малая часть (замер: статические обращения к именам из `utils.js` в HTML +
скриптах страницы):

| Страница | Использует функций из 417 |
|---|---|
| `offline.html` | 9 (2 %) |
| `qr-start.html` | 8 (2 %) |
| `design-preview.html` | 12 (3 %) |
| `auth.html`, `handicap.html`, `hcp-badge-preview.html` | 15–16 (4 %) |
| `stats.html` | 21 (5 %) |
| `index.html` | 43 (10 %) |
| `setup-round.html` | 118 (28 %) |
| `admin.html` | 109 (26 %) |

Отдельно: `offline.html` — страница, которую SW отдаёт **при отсутствии сети**,
— тянет 809 КБ локального JS, включая `qrcode-generator-1.4.4.js` (57 КБ) и
`qr-code.js`, хотя QR там не рисуется (в `utils.js` — 0 упоминаний `qrcode`,
в `offline.html` обработчик один: `window.location.reload()`). Плюс Google
Fonts и Font Awesome с CDN на той же странице.

**Фикс:** довести до конца план из `docs/MODULES-MIGRATION.md` — пер-страничные
входные точки (Vite MPA `rollupOptions.input`), `utils.js` резать по
ответственности (`firebase-db.js`, `round-state.js`, `settings-live.js`,
`nav.js`, `hcp.js`). Начать можно с малого и безопасного: убрать QR-вендор и
`utils.js` с `offline.html`/`hcp-badge-preview.html` (проверить
`npm run check:browser`), это −660 КБ raw на двух страницах.

### 7. Нет `Cache-Control`, хотя все URL уже content-hashed

**Статус: ✅ закрыто.** immutable для `js/`, `css/`, `dist/`, `img/`, `fonts/`; no-cache для HTML, `sw.js`, `manifest.json`. `tools/test-firebase-config.js`.

В `firebase.json` есть только security-заголовки (`grep -c Cache-Control
firebase.json` → 0). При этом каждый ассет ссылается как
`?v=<sha1-8 содержимого>` — то есть URL **immutable по построению**, а
`tools/rev-assets.js` ещё и гарантированно меняет его при правке файла
(проверяется в CI).

**Фикс:** в `headers` добавить правило для `js/**`, `css/**`, `dist/**`,
`img/**` → `Cache-Control: public, max-age=31536000, immutable`, и отдельное
для `*.html`, `sw.js`, `manifest.json` → `no-cache` (HTML обязан
перепроверяться, иначе SW-кэш и `?v=` не обновятся). Повторные визиты на поле
перестанут качеть 300 КБ gzip.

### 8. Firebase compat SDK 9.23.0 (июнь 2023)

**Статус: ⏸ отложено решением.** compat 9.23 → modular v13 = переписывание всех обращений к SDK. Риск высокий, измеримого выигрыша для пользователя нет.

14 страниц грузят четыре отдельных CDN-скрипта
(`firebase-app/database/auth/functions-compat.js`), причём
`firebase-functions-compat.js` — на `index.html`, `leaderboard.html`,
`stats.html`, `players.html`, `handicap.html` и других, где callable-функции не
вызываются. Актуальная мажорная версия `firebase` — 13.0.0
(`npm view firebase version`), compat-слой deprecated.

Модульный SDK + `import()` по требованию убрал бы и лишний
`functions-compat`, и глобальную связку `firebase.initializeApp()` →
`var db = firebase.database()` (`js/firebase-config.js:11-24`), из-за которой
порядок тегов критичен. Это большая работа — делать после п.5/п.6, но версию
9.23.0 стоит поднять хотя бы в рамках compat (9.x → 10.x/11.x compat), пока
миграция не началась.

### 9. Font Awesome целиком с cdnjs

**Статус: ✅ закрыто.** Свой сабсет: 189 иконок, 32 КБ вместо 401 КБ (−92 %). Попутно найдены 5 имён (`fa-swords`, `fa-users-plus`, `fa-users-rotate`, `fa-wifi-slash`, `fa-arrow-down-to-bracket`), которых нет в FA 6.5.0 — они годами не рисовались.

`https://cdnjs.cloudflare.com/.../font-awesome/6.5.0/css/all.min.css` на всех
страницах ради 210 уникальных `fa-*` классов (замер по HTML/CSS/JS). Это
сторонняя рантайм-зависимость: при первом офлайн-визите иконок нет, если CDN не
успел попасть в `pestovo-cdn-v1` через SWR (`sw.js:120-128`).

**Фикс:** self-host подрезанного подмножества (svg-sprite или subset-woff2) и
убрать `cdnjs.cloudflare.com` из CSP — минус один источник в `script-src`/
`style-src`/`font-src` и минус одна точка отказа.

### 10. RTDB-слушатели: 19 `.on()` в `utils.js` при 0 `.off()`

**Статус: ✅ закрыто.** Пересчёт по вложенности скобок: 38 подписок, 14 однократных на верхнем уровне, 24 в функциях — 23 уже были защищены. Настоящая утечка одна: `solo.js` не снимал подписку при смене игрока. Гейт `tools/check-rtdb-listeners.js`.

`js/utils.js` подписывается на `settings/design`, `settings/privacy`,
`settings/hidden_pages`, `settings/hcp_badge_variant`,
`settings/social_card_variant`, `settings/tn_scorecard_variant`,
`settings/tournament_leaderboard_variant`, `settings/tn_groups_visible`,
`settings/tn_roster_variant`, `settings/tn_gender_split`,
`settings/sessions_reset_ts`, `settings/stableford_display_default`, `rounds`,
`users…`, `alerts…` (строки 8141–9483) и никогда не отписывается.
Для MPA с полной перезагрузкой это терпимо, но:

- `bindRealtimeValue` (`utils.js:10812`) — универсальная обёртка; при повторном
  вызове на тот же путь нужен guard, иначе дубли callbacks;
- `db.ref('rounds').on('value')` (`utils.js:9013`) — чтение **всей** ветки
  раундов на каждой странице; RTDB тарифицирует по объёму скачанного, и на
  большом клубе это самый дорогой запрос приложения. Стоит сузить до
  `orderByChild('status').equalTo('active')` + `.indexOn`, либо читать только
  id и подтягивать детали лениво.

`live.js` (2 `.on` / 3 `.off`) и `solo.js` (2/2) уже симметричны — образец.

---

## 🟡 P2 — воспроизводимость, CI, дубли

### 11. `package-lock.json` в `.gitignore` → CI невыполним воспроизводимо

**Статус: ✅ закрыто.** `package-lock.json` и `functions/package-lock.json` в репозитории, CI на строгом `npm ci` с кэшем.

`.gitignore:2` игнорирует локфайл, поэтому шаг CI
`run: npm ci || npm install` (`.github/workflows/ci.yml:23`,
`browser-check.yml:31`) **всегда** падает на `npm ci` и откатывается к
`npm install`. Следствия: состав `node_modules` (включая Playwright/Chromium и
Vite, от которых зависят `check:browser` и `check:bundle`) не зафиксирован;
минорный релиз транзитивной зависимости может сломать сборку без единой правки
в репозитории. В `functions/` локфайла нет вовсе.

**Фикс:** убрать строку из `.gitignore`, закоммитить оба локфайла, в CI оставить
строго `npm ci` (без `|| npm install`), добавить `actions/setup-node` cache по
`package-lock.json` (сейчас `package-manager-cache: false`).

### 12. ESLint существует, но в CI не запускается и ловит только шум

**Статус: ✅ закрыто.** ESLint 8.57 + осмысленные правила; опасные конструкции — `error`; `--max-warnings=0` в CI; `tools/check-unused-globals.js` вторым гейтом.

`npm run lint` есть в `package.json`, но ни один workflow его не вызывает
(в CI только `lint:syntax` = `node --check`). Замер: **397 warnings, 0 errors,
100 % — `no-unused-vars`**, из них 379 в `js/`, 18 в `tools/`, 0 в `src/` и
`functions/`. Почти все 379 — ложные: `no-undef: off` + lint пофайлово, поэтому
функция из `utils.js`, вызванная из `app.js` или из `onclick` в HTML, выглядит
неиспользуемой (`qrUrl`, `initNav`, `onAuthReady`, `triggerVictoryConfetti`, …).

То есть линтер сегодня не даёт сигнала, а включать его в CI в таком виде —
значит завалить сборку шумом.

**Фикс (по шагам):**
1. Отключить `no-unused-vars` для top-level объявлений в `js/**` (или
   `varsIgnorePattern`), оставив его для локальных переменных и аргументов —
   там он настоящий.
2. Добавить repo-wide проверку «глобал нигде не упомянут» — ровно тот паттерн
   `(?<![\w$.])`, которым прошлый аудит нашёл 46 мёртвых функций; оформить как
   `tools/check-unused-globals.js` и гонять в CI.
3. Включить bug-class правила, которые в global-script коде ловят реальное:
   `no-dupe-keys`, `no-unreachable`, `no-fallthrough`, `no-self-compare`,
   `use-isnan`, `no-constant-condition`, `no-dupe-class-members`,
   `getter-return`, `no-async-promise-executor`.
4. Только после 1–3 добавить `npm run lint` в `ci.yml` с `--max-warnings`.

### 13. 9 глобальных функций определены больше чем в одном файле — и уже разошлись

**Статус: 🔶 закрыто частично.** Слиты `onAuthReady` (было 6 определений на странице → реестр `pestovoOnAuthReady`), `isScoreKioskUrl` и `applyScoreKiosk` → `js/score-kiosk.js`, `updDisp` → `pestovoUpdScoreDisplay()` в `js/score-display.js` (копии совпадали побайтово: 823 байта, 24 отличия только в префиксе `mk`/`sc`). Осталось 4 одноимённые пары (`buildHoles`, `callOfficial`, `checkVerify`, `renderHole`) — см. обоснование в `docs/CODE-REVIEW.md`, раздел 3; список зафиксирован `tools/test-scoring-duplicates.js`, который теперь проверяет и то, что адаптеры делегируют общей реализации. `qrUrl` слит позже: общая `pestovoQrImageUrl()` в `js/qr-url.js` закрыла сразу четыре копии построителя URL картинки QR (`utils.js`, `qr-start.js`, `tn-mgr-core.js`, `tn-mgr-io.js`) — они различались только размером и полем, то есть настройками места вызова.

Замер по `^function X(` / `^var X = function` во всех `js/*.js`:

| Функция | Файлы | Расхождение (длина тела, символов) |
|---|---|---|
| `onAuthReady` | admin, live, marker, scorer, tournaments, utils | намеренный hook (utils = дефолт) |
| `callOfficial` | live, marker, scorer | 1059 vs 1098 |
| `buildHoles` | marker, scorer, solo | 1393 vs 1332 |
| `renderHole` | marker, scorer | **1244 vs 378** |
| `updDisp` | marker, scorer | 823 vs 823 (совпадает) |
| `checkVerify` | marker, scorer | 873 vs 853 |
| `isScoreKioskUrl` | live, scorer | — |
| `applyScoreKiosk` | live, scorer | — |
| `qrUrl` | qr-start, utils | ✅ общая `pestovoQrImageUrl()` в `js/qr-url.js` (копий было четыре: ещё `qrImageUrl` в `tn-mgr-core.js` и `qrUrl` в `tn-mgr-io.js`) |

Активного конфликта загрузки нет (проверено: ни одна страница не грузит два
файла с одноимённой функцией, кроме пары `utils.js` + фичевый файл для
`onAuthReady`, где порядок `utils → фича` и есть задумка). Но
`CODE-AUDIT-2026-09.md` фиксировал эту пару как «6 копипастных функций уже
разошлись деталями» — с тех пор не изменилось, а `renderHole` отличается
втрое. Это отложенный баг: правка ввода счёта в `scorer.js` не доезжает до
`marker.js`.

**Фикс (сделано):** `onAuthReady` → реестр, `isScoreKioskUrl`/`applyScoreKiosk`
→ `js/score-kiosk.js`, `updDisp` → `js/score-display.js`, `qrUrl` →
`js/qr-url.js`. Паттерн, который сработал: общая реализация + тонкий адаптер в
странице, который только подставляет её глобалы; `test-scoring-duplicates.js`
следит, чтобы адаптер именно делегировал, а не держал вторую копию.

**Фикс (осталось):** `buildHoles`/`checkVerify`/`callOfficial` тем же паттерном
в один `js/score-entry-shared.js` (или в `src/` → ESM-бандл) с конфигом
страницы (`{mode:'scorer'|'marker'|'solo', …}`) — у них расхождение не в
переименованиях, а в guard-условиях и в разметке, поэтому адаптер получится
больше, чем у `updDisp`. `renderHole` лучше не трогать: 378 Б против 1 244 Б —
это не копия, а одноимённые функции разного назначения. Страховка — уже
существующие `tools/test-score-entry-variants.js`,
`tools/test-scorer-freeze.js`, `tools/test-scoring-duplicates.js`.

### 14. `browser-check.yml` не срабатывает на default-branch

**Статус: ✅ закрыто.** `browser-check.yml` срабатывает на push и pull_request; добавлены `check:scorecards`, `check:scorecard-pwa`, `check:nav`.

Триггер: `on: push: branches: [main, master]` + `pull_request`. Default-ветка
репозитория — `arena/01a02acd-livescoring` (`git remote show origin`), веток
`main`/`master` нет. Значит, живые браузерные и мобильные проверки
(`check:browser --require`, `check:scorecards`, `check:scorecard-pwa`,
`check:nav`) выполняются **только на PR**, а после мержа в default-ветку — уже
нет. `ci.yml` при этом на `push` без фильтра.

**Фикс:** `branches: ['**']` (или убрать фильтр и оставить `push` +
`pull_request`), как в `ci.yml`.

### 15. Тесты идут последовательно: 54 с на одном ядре

**Статус: ✅ закрыто.** `tools/run-tests.js` с пулом воркеров: 56.8 с → ~37 с при 2 ядрах (на 4-ядерных раннерах выигрыш больше). Флаги `--ci/--jobs=N/--serial`.

`tools/run-tests.js` запускает 67 файлов через `spawnSync` в цикле. Замер:
`real 54.1s`, `user 55.1s`, `sys 3.5s` — то есть работа строго однопоточная.
Пул на `os.availableParallelism()` (4–8 воркеров через `spawn` + очередь)
даёт ~10–15 с без единой правки в самих тестах. Это же ускорит оба workflow.

Дополнительно: самописные `eq`/`check` в каждом файле. Перевод на
`node:test` + `node:assert` (Node 18+ уже в `engines`) даст
`--experimental-test-coverage` и единый отчёт о покрытии — сейчас сигнала
«что не покрыто» нет вообще.

### 16. `docs/CODE-REVIEW.md` описывает кодовую базу, которой больше нет

**Статус: ✅ закрыто.** `docs/CODE-REVIEW.md` переписан по текущему дереву: старый обзор ссылался на `js/start-admin.js`, `tn-wizard.js`, `feed.js`, `tn-engine.js` — этих файлов нет.

README ссылается на него как на «аудит кодовой базы и приоритеты улучшений», но
документ датирован состоянием до рефакторинга и теперь вводит в заблуждение:

- «Корневой `package.json` — **нет**», «`.github/` (CI) — **нет**»,
  «Firebase security rules в репо — **нет**» — всё три уже есть.
- `js/utils.js` «12 750 строк, 530 функций» → сейчас 10 837 / 417.
- `js/admin.js` «8 378 строк, 357 функций» → сейчас 440 строк.
- Ссылки на файлы, которых нет в репозитории: `js/start-admin.js`,
  `js/tn-wizard.js`, `js/feed.js`, `js/tn-engine.js` (проверено: все четыре
  отсутствуют).
- «`CACHE_NAME = 'pestovo-v1.79.0'` захардкожен» → давно генерируется
  `rev-assets.js`.

**Фикс:** пометить шапкой «архив, состояние на 2026-09, superseded by
CODE-AUDIT-2026-09.md» или переписать метрики. Иначе новый участник читает
неверные приоритеты.

### 17. Мелочь с тестом-страховкой: 2 ключа `data-i18n` без перевода

**Статус: ✅ закрыто.** 7 ключей `tn_lb_variant_*` + `data-i18n` на 5 кнопках админки; `tools/test-i18n-coverage.js` проверяет полноту RU/EN.

`admin.html:874-875` используют `tn_lb_variant_title` и `tn_lb_variant_sub`,
которых нет в словаре `I18N` → эти две строки админки никогда не переводятся на
EN (остаются русскими). Всё остальное чисто: 367 `data-i18n` в HTML, паритет
RU/EN 565/565, единственное совпадение значений — `brand_name` («Пестово»), что
корректно.

**Фикс:** добавить два ключа + `tools/test-i18n-coverage.js`, который сверяет
все `data-i18n` из HTML и все `t('…')` из JS со словарём, а также паритет
RU↔EN. Тест дешевле, чем ручная проверка, и ловит класс ошибки навсегда.

---

## 🟢 P3 — полировка

### 18. `manifest.json`

**Статус: ✅ закрыто.** `id`/`start_url`/`scope` → абсолютные, добавлены `shortcuts`. `orientation: portrait` оставлен осознанно (ландшафтных стилей нет). Отдельный maskable-арт не понадобился: замер показал 79.7 % стороны и чистое кольцо 10 %.

- `orientation: "portrait"` жёстко фиксирует портрет. Счётная карточка на 18 лунок —
  естественно альбомная; на планшете маршала это неудобно. Рассмотреть `"any"`
  или убрать поле.
- `scope: "./"` и `start_url: "index.html"` — относительные; спецификация
  допускает, но `"/"` + `"/index.html"` предсказуемее при разных путях Hosting.
- Нет `shortcuts` (быстрый вход в «Начать игру» / «Табло» долгим тапом по
  иконке) и `screenshots` (нужны для richer install-промпта на Android).
- Иконки: `icon-192`/`icon-512` объявлены дважды (`any` и `maskable`) — это
  валидно, но один и тот же PNG без отступа под safe-zone при маскировании
  обрежется по краям. Стоит сделать отдельный maskable-арт с отступом ~20 %.

### 19. `sw.js`

**Статус: ✅ закрыто.** LRU-подрезка `pestovo-cdn-v1` (предел 60). Хардкод VAPID-URL оставлен (классический воркер не импортирует конфиг) — совпадение с `databaseURL` держит тест.

- `pushsubscriptionchange` хардкодит
  `https://livescore-b77e4-default-rtdb.firebaseio.com/settings/vapid_public_key.json`
  (`sw.js:~215`) — дубль `js/firebase-config.js`. SW не может его импортировать
  (классический worker), но значение стоит вынести в генерируемый
  `sw-config.js` или подставлять через `rev-assets.js`, чтобы смена проекта не
  требовала правки в двух местах.
- `pestovo-cdn-v1` (шрифты + Font Awesome, SWR с opaque-ответами) не имеет
  ограничения размера и не очищается по версиям (`activate()` его намеренно
  сохраняет). Opaque-ответы в Cache Storage считаются с существенным
  overhead; при долгой жизни PWA кэш растёт неограниченно. Добавить LRU-чистку
  (например, > 60 записей — удалить старейшие).

### 20. Деплой полностью ручной

**Статус: ✅ закрыто.** `.github/workflows/deploy.yml`: `workflow_dispatch` с выбором hosting/functions, полная верификация перед деплоем. Правила БД не деплоит никогда.

`dist/` коммитится именно потому, что Firebase Hosting деплоит репозиторий без
сборки. CI уже проверяет свежесть бандла и версий ассетов, но сам деплой —
руками. Workflow `on: push` в default-ветку с `firebase deploy --only
hosting,database,functions` (секреты `FIREBASE_SERVICE_ACCOUNT_*`) убрал бы
класс инцидента «смержили, а на проде старое». Правила БД при этом стоит
деплоить отдельным осознанным шагом — см. предупреждение в
`docs/SECURITY-RULES.md`.

---

## Сводная таблица

| # | Тема | Эффект | Трудозатраты | Риск правки | Статус |
|---|---|---|---|---|---|
| 1 | Мастер-пароль fail-closed | 🔴 критично | S | низкий | ✅ |
| 4 | `hosting.ignore` += rules/src/package | 🟠 закрытие инфо-утечки | XS | нулевой | ✅ (сильнее: `public/`) |
| 7 | `Cache-Control: immutable` | 🟠 скорость повторов | XS | низкий | ✅ |
| 5 | Минификация js/css (−35 % gzip) | 🟠 скорость | S | низкий | ✅ (−34 %) |
| 11 | Локфайлы + строгий `npm ci` | 🟠 воспроизводимость | XS | нулевой | ✅ |
| 14 | Триггер `browser-check.yml` | 🟠 покрытие CI | XS | нулевой | ✅ |
| 17 | 2 ключа i18n + тест покрытия | 🟡 | XS | нулевой | ✅ (7 ключей) |
| 15 | Параллельный тест-раннер (54→~12 с) | 🟡 DX | S | низкий | ✅ (→ ~37 с на 2 ядрах) |
| 3 | Репортинг ошибок | 🟠 наблюдаемость | M | низкий | ✅ |
| 6 | Per-page бандлы, резка `utils.js` | 🟠 скорость | L | средний | ✅ (QR снят; бандлы — после ESM) |
| 12 | Осмысленный ESLint в CI | 🟡 качество | M | низкий | ✅ |
| 13 | Общие `renderHole`/`callOfficial`/… | 🟡 баги | M | средний | 🔶 (4 пары остались) |
| 2 | Убрать `'unsafe-inline'` из `script-src` | 🔴 XSS-защита | L | средний | ⏸ отложено |
| 10 | `.off()` + сузить `rounds`-слушатель | 🟡 RTDB-стоимость | M | средний | ✅ (утечка в `solo.js`) |
| 16 | Обновить `CODE-REVIEW.md` | 🟢 docs | S | нулевой | ✅ |
| 8 | Firebase SDK 9.23 → modular | 🟠 скорость/поддержка | XL | высокий | ⏸ отложено |
| 9 | Font Awesome self-host subset | 🟢 | M | низкий | ✅ (+5 битых иконок) |
| 18-20 | manifest / sw.js / автодеплой | 🟢 | S-M | низкий | ✅ |

✅ закрыто · 🔶 закрыто частично · ⏸ отложено решением

XS < 1 ч · S = полдня · M = 1-2 дня · L = неделя · XL = проект на несколько недель.

## Что уже в хорошем состоянии (не трогать)

- Экранирование пользовательских данных: `js/safe-html.js`, `tnJsStr`,
  `admCsvCell` — прошлый аудит закрыл векторы, новых не найдено.
- `database.rules.json`: приватность `users` / зеркало `usersPublic` без
  email/phone, `.validate` на типы и длины, `.indexOn` на `alerts`.
- Мёртвый код: 0 unreferenced-функций из 417 в `utils.js`, 0 `TODO/FIXME`.
- Тестовая обвязка: 67 сценарных тестов проходят, `check:bundle` и
  `rev-assets --check` гарантируют свежесть артефактов в CI.
- i18n: полный паритет RU/EN (565/565), `lang` на `<html>` переключается.
- Service Worker: precache генерируется, `activate()` чистит старые кэши,
  навигация network-first с фолбэком в `offline.html`, push/`notificationclick`
  с проверкой same-origin.
- A11y-база: 67 `aria-label`, 29 `aria-live`, 53 `aria-pressed`, `role=*`,
  `:focus-visible` (19 мест), `prefers-reduced-motion` — есть; у `<img>` в HTML
  нет ни одного пропущенного `alt`.
