# Реализованные улучшения (по CODE-REVIEW.md)

Выполнены задачи из отчёта `docs/CODE-REVIEW.md` (итерация 1 — разделы 1–4,
итерация 2 — раздел 5, итерация 3 — раздел 6, итерация 4 — раздел 7).
Ниже — что сделано, ключевые файлы и важные оговорки.

## 1. CSP + центральный безопасный HTML-билдер (закрытие класса XSS)

**Безопасный билдер** — `js/safe-html.js` (загружается до `utils.js` на всех
страницах):
- `esc(str)` — экранирует `& < > " '` (замена opt-in `escapeHtml`).
- `html\`<b>${name}</b>\`` — tagged template, **все интерполяции экранируются
  автоматически**. Результат сразу в `el.innerHTML`.
- `setSafeHtml(el, content)` — безопасная установка `innerHTML`.

Рекомендация для дальнейшей работы: новый пользовательский вывод собирать
через `html\`\`` / `esc()`, а не через `innerHTML = '...' + rawVar + '...'`.

**CSP** — `firebase.json` (Hosting headers), применяется централизованно при
деплое (не нужно править 20 HTML):
- `script-src` ограничен `self` + `gstatic` (Firebase SDK) + `cdnjs`
  (FontAwesome/xlsx) + `'unsafe-inline'` (приложение использует inline-обработчики,
  их нельзя убрать без рефакторинга — см. оговорку ниже).
- `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`,
  `form-action 'self'` — блокируют внедрение плагинов, hijack `<base>`,
  clickjacking.
- `connect-src` ограничен Firebase + function host (препятствует exfiltration
  украденных данных на сторонний домен).
- Доп. заголовки: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.

> ⚠️ **Оговорка по CSP.** Из-за inline `onclick`/`onchange` и inline-стилей в
> коде `script-src`/`style-src` вынужденно содержат `'unsafe-inline'`, поэтому
> CSP — это оборона в глубину, а **не** полная защита от XSS. Настоящий заслон —
> безопасный билдер + экранирование. Следующий шаг: перенести inline-обработчики
> на `addEventListener` и перейти на nonce/hash (тогда можно убрать
> `'unsafe-inline'`).

**Конкретный fix** — `js/marker.js:178-179`: вывод счёта игрока/маркера теперь
через `esc(ps)` / `esc(ms)`.

## 2. `database.rules.json` с проверкой `isAdmin`

Файл `database.rules.json` — **черновик** наименьших привилегий (RTDB не
поддерживает helper-функции, поэтому `isAdmin` инлайнится как
`root.child('users').child(auth.uid).child('admin').val() === true`):
- `broadcasts`, `alerts`, `vapid`, `settings`, `leaderboard`,
  `push_subscriptions` — запись строго ограничена (`isAdmin` / владелец).
- `rounds/$rid/players/$pid` — пишет только владелец записи / создатель раунда
  / админ.
- `.validate` ограничивает длину и типы полей `broadcasts`/`alerts`/
  `push_subscriptions`.

> ⚠️ **Перед деплоем** — см. `docs/SECURITY-RULES.md`: экспортируйте текущие
> правила, сверьте со схемой данных и убедитесь, что у админов выставляется
> `users/$uid/admin === true`. Неправильные правила могут сломать сайт.

## 3. Корневой `package.json` + тест-раннер + базовый CI

- `package.json`: скрипты `test`, `test:ci`, `lint:syntax` (без зависимостей —
  тесты и синтаксис-чек работают на чистом Node 18+).
- `tools/run-tests.js`: находит `tools/test-*.js`, запускает каждый, агрегирует
  результат, не-нулевой exit при падении.
- `tools/syntax-check.js`: `node --check` по всем `js/`, `tools/`, `functions/`
  (дёшевый линт в CI).
- `.github/workflows/ci.yml`: на push/PR — `npm run lint:syntax` + `npm test`.

**Решение проблемы изоляции тестов.** `utils.js` теперь зависит от вынесенных
модулей; vm-тесты грузят `utils.js` по отдельности. Вместо правки ~27 тестов —
`tools/test-bootstrap.js`, подключаемый через `node --require`: он прозрачно
подставляет `course-config.js` + `format.js` ко всем чтениям `js/utils.js` из
диска. Кроме того, 13 тестов, грузящих `utils.js` через `vm`, получили явные
строки загрузки модулей (работают и при запуске вручную без раннера).

> ⚠️ **1 тест падает** (`test-tournament-start-gate.js`) — **предсуществующая,
> датозависимая** проблема: фикстура использует `2026-09-20`, а системная дата
> `2026-09-23`, поэтому проверка «турнир не начат → scheduled» не проходит
> (`Date.now()` уже больше времени старта). До моих правок тест вообще падал при
> загрузке (`const CLUB` повторно объявлен в одной песочнице) — мой рефакторинг
> (через `var` в `course-config.js`) устранил падение, но вскрыл эту логическую
> проверку. Не является регрессом от разделения. Рекомендуется сделать тест
> независимым от реальных часов (мокнуть «сейчас» или использовать относительные
> даты).

## 4. Начало дробления `utils.js` на модули по ответственности

Из `js/utils.js` (было 12 750 строк) вынесены чистые, не зависящие от Firebase
блоки:

- `js/course-config.js` — конфигурация курса: `CLUB`, `TOTAL_PAR`, `ADDR`,
  `HOLES`, `TIMINGS`, `TEES`, `TEE_ORDER`, `COURSE_RATINGS` + доступы
  `holePar`/`holeDist`/`holeHcp`/`holeTiming`.
- `js/format.js` — форматирование счёта: `fmtScore`, `scoreClass`,
  `holeResClass`, `holeResName` (используют глобальную `t()` только во время
  вызова, поэтому безопасно грузить до `utils.js`).

Порядок загрузки в браузере (во всех 20 HTML + `sw.js`): `course-config.js` →
`format.js` → `safe-html.js` → `utils.js`. Проверено в Node: модули грузятся
без конфликта повторных объявлений, все глобальные функции определены.

**Следующие шаги по дроблению** (не сделаны, чтобы не рисковать
работоспособностью): вынести `dom.js` (toast/`escapeHtml`), `i18n.js` (`t`/
`L`/`currentLang`), Firebase-обёртки и UI-хелперы в отдельные модули, затем
постепенно убрать дубликаты (`onAuthReady`, `callOfficial`, …) через общий
модуль.

## 5. Итерация 2: XSS-хвосты, дедупликация `onAuthReady`, модуль `dom.js`

### 5.1 Безопасность — закрыты оставшиеся сырые пути (п.4.1 ревью)

- **Аудит `fgSettingsHtml`/`fgRenderPreview` (admin.js) завершён.** Имена
  игроков уже экранировались (`escapeHtml(rp.name)`); найден и закрыт
  пропущенный путь: нечисловой `rp.handicap` (пользовательское поле из
  Firebase) попадал в HTML **как есть** → теперь `escapeHtml(String(...))`.
  Value-атрибуты `fg-time`/`fg-interval` (в обоих шагах модалки) тоже
  экранируются — defense in depth.
- **Убраны fallback-и «как есть»** из паттерна
  `typeof escapeHtml === 'function' ? escapeHtml(x) : x` (quick win №3 ревью):
  `js/feed.js` (title/body/link), `js/stats.js` (5 мест), `js/utils.js`
  (бейдж завершения + `buildOfficialCallText`). Экранирование теперь
  безусловное. Осмысленный остаток один: `buildOfficialCallText` использует
  `String(v)` только при `withHtml === false` (там это plain-text, не HTML).
  Самодостаточный fallback в `tnScEsc` (tn-scorecard.js) оставлен — его ветка
  «как есть» сама экранирует.
- **Guard ссылок в анонсах** (feed.js): `b.link` проверяется на схему
  `javascript:`/`data:`/`vbscript:` — подменяется на `tournaments.html`
  (правила БД разрешают запись только админам, это второй рубеж).

### 5.2 Дедупликация `onAuthReady` (quick win №2 ревью)

В `js/utils.js` (после `navAuth`) добавлен **дефолт**
`function onAuthReady(u, d) { navAuth(u, d); }`, а из 9 страниц удалены
идентичные копии: `app.js`, `auth.js`, `feed.js`, `guide.js`, `handicap.js`,
`leaderboard.js`, `order-of-merit.js`, `players.js`, `stats.js`.
Страницы со своей логикой продолжают переопределять функцию в своём
скрипте (он грузится позже и потому выигрывает): `admin.js`, `live.js`,
`predictor.js`, `tournaments.js`, `tournament-public.js`, `assistant.js`.
Итог: 14 определений → 1 дефолт + 6 осмысленных override.

Полный вариант «шины событий» (registerOnAuth) не вводился сознательно:
текущий паттерн «дефолт + override» устраняет дубликаты без переписывания
вызовов в `firebase-config.js`.

### 5.3 Продолжение дробления `utils.js`: извлечён `js/dom.js`

Из `js/utils.js` вынесены чистые браузерные хелперы (без Firebase и i18n):
`TOAST_DURATION_MS`, `ensureToastRoot`, `toastIconFor`, `toast`,
`toastSequence`, `isPlayerModeEnabled`, `vib`, `escapeHtml` → `js/dom.js`.
Загружается на всех страницах в порядке
`course-config → format → safe-html → dom → utils`.

- `src/dom.js` — каноническая ESM-версия (bridge на `window`), добавлена в
  `src/index.js`; бандл `dist/livescoring-modules.js` собирается (5 модулей,
  ~7.4 kB), глобалы доступны.
- `tools/test-bootstrap.js` добавляет `dom.js` к префиксу для vm-тестов;
  явные загрузчики (`test-group-round-setup.js`, `test-guest-group-dedupe.js`,
  `test-history-dedupe.js`) тоже грузят `dom.js`.
- Кэш: `sw.js` — добавлен `js/dom.js?v=1`, `utils.js?v=65→66`,
  `feed.js?v=4`, `stats.js?v=5`, `CACHE_NAME → pestovo-v1.80.0`; версии в
  HTML синхронизированы (тест `test-design-system.js` проверяет
  соответствие версий сайта и sw.js — он же поймал рассинхрон при бампе).

### 5.4 Что НЕ делалось (осознанно)

- `i18n.js` и Firebase-обёртки не извлекались (следующий шаг; `t()` крупный,
  лучше отдельной итерацией с прогоном в браузере).
- `callOfficial`/`buildHoles` (live/marker/scorer/solo) — это тонкая
  page-specific обвязка над общим `requestOfficialCall`/состоянием страницы,
  «дубликаты» отличаются телами; вынос в общий модуль потребует API с
  колбэками-конфигами — выгода сомнительная. Оставлено как есть.
- `.off()` слушателей (п.6 ревью): проверено — `live.js`/`solo.js` уже
  снимают подписку перед переподпиской (`initRoundView`, смена раунда в
  solo) и рендер уже debounce (`scheduleRoundRender`). Пункт закрыт ранее.

## Файлы (новые / изменённые)

Новые: `js/safe-html.js`, `js/course-config.js`, `js/format.js`, `js/dom.js`,
`js/i18n.js` (+ ESM-копии в `src/`), `firebase.json`, `database.rules.json`,
`package.json`, `README.md`, `tools/run-tests.js`, `tools/syntax-check.js`,
`tools/rev-assets.js`, `tools/test-sw-precache.js`,
`.github/workflows/ci.yml`, `docs/SECURITY-RULES.md`,
`docs/IMPROVEMENTS-IMPL.md`.

Изменены: `js/utils.js` (удалены вынесенные блоки, добавлен дефолт
`onAuthReady`), `js/marker.js` (экранирование), `js/feed.js`, `js/stats.js`,
`js/admin.js`, `js/start-admin.js` (экранирование, guard ссылок),
`js/{app,auth,guide,handicap,leaderboard,order-of-merit,players}.js`
(удалены дубли `onAuthReady`), 20 HTML-файлов (теги скриптов + версия),
`sw.js` (прекэш, версии), `tools/test-bootstrap.js` и 3 теста (загрузка
`dom.js`), 13 тест-файлов (явная загрузка модулей).
