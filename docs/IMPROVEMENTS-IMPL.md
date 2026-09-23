# Реализованные улучшения (по CODE-REVIEW.md)

Выполнены задачи из отчёта `docs/CODE-REVIEW.md` (итерация 1 — разделы 1–4,
итерация 2 — раздел 5, итерация 3 — раздел 6, итерация 4 — раздел 7,
итерация 5 — раздел 8). Ниже — что сделано, ключевые файлы и важные
оговорки.

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

## 6. Итерация 3: извлечён `js/i18n.js`, README с security-заметкой

### 6.1 Продолжение дробления `utils.js`: извлечена i18n

Из `js/utils.js` (было 12 586 строк, стало ~11 300) вынесен блок
международизации (~1290 строк) → `js/i18n.js`: словарь `I18N` (RU/EN),
`currentLang`, `t()`, `toggleLang()`, `updateLangButtons()`,
`applyTranslations()`, `updateFooterYear()`. Блок самодостаточен: ссылок на
`I18N` вне него не было, `toggleLang()` дергает страницы только через
guarded `typeof X === 'function'` вызовы.

- Порядок загрузки теперь `course-config → format → safe-html → dom →
  i18n → utils` (20 HTML + `sw.js`; `js/format.js` зовёт `t()` только в
  момент вызова, поэтому порядок внутри фундаментов не критичен).
- `src/i18n.js` — каноническая ESM-версия (bridge на `window`); бандл —
  6 модулей, ~76.5 kB (словарь переводов большой).
- Boot-вызов `applyTranslations()` обёрнут в try/catch: в vm-тестах префикс
  склеен с `utils.js` в один скрипт — hoisted функции страниц вызывались
  раньше инициализации их данных. Обёртка заодно защищает будущий
  ESM-бандл (см. `docs/MODULES-MIGRATION.md`, шаг 1).
- `tools/test-bootstrap.js` добавляет `i18n.js` к префиксу; явные
  загрузчики (`test-group-round-setup.js`, `test-guest-group-dedupe.js`,
  `test-history-dedupe.js`) тоже грузят `i18n.js`.
- Кэш: `sw.js` — добавлен `js/i18n.js?v=1`, `utils.js?v=66→67`,
  `CACHE_NAME → pestovo-v1.81.0`, версия сайта в HTML синхронизирована.

### 6.2 README + документирование `apiKey` (quick win №6)

Создан `README.md`: структура репозитория, команды разработки, порядок
загрузки модулей и раздел «Безопасность» — в том числе явная фиксация, что
**Firebase Web API key в `js/firebase-config.js` не является секретом**
(ключ идентифицирует проект, доступ защищают Security Rules; ротация ключа
не является защитой) — п.4.2/8.6 ревью закрыты.

### 6.3 Что НЕ делалось (осознанно)

- Firebase-обёртки (`bindRealtimeValue`, `realtimeValueBindings`) не
  извлекались — они захвачены сотнями вызовов внутри `utils.js`; выносить
  вместе со слоем вызовов (отдельная итерация).
- Переключение HTML на ESM-бандл (`dist/livescoring-modules.js`) — по-прежнему
  требует проверки в браузере (шаг 1 плана миграции).

## 7. Итерация 4: автоматизация версий статики и precache-манифеста SW

Закрыт п.6 ревью («CACHE_NAME захардкожен, версии ассетов проставляются
вручную — забытая версия = пользователи на старом кэше»).

**Инструмент** — `tools/rev-assets.js` (`npm run assets`):
1. Сканирует все `*.html`, находит локальные `js/`- и `css/`-ссылки и
   проставляет `?v=<hash8>` (SHA-1 контента). Изменил файл → новый URL
   появляется сам; попутно ловит битые `<script src>` (файл не существует →
   ошибка).
2. Пересобирает блок precache между маркерами `BEGIN/END PRECACHE` в
   `sw.js`: все страницы + все найденные ассеты + `manifest.json` +
   `img/*` + `docs/assistant-*.json`.
3. Выводит `CACHE_NAME` из версии сайта (index.html) и хеша манифеста:
   `pestovo-v1.81.0-<hash8>` — любое изменение ассетов ротирует кэш
   в `activate()`.

**Фиксация в CI/тестах:**
- `tools/test-sw-precache.js` (новый): `rev-assets --check` обязан проходить
  (свежесть `?v=` и манифеста), все URL манифеста существуют, формат
  `CACHE_NAME` корректен. Пробовал «забыть бамп» — тест падает с точным
  списком устаревшего.
- `test-design-system.js`: проверка кэширования design-ассетов ослаблена с
  конкретной `?v=1` до `?v=` (версии теперь хеши).

**Заодно закрыты дыры старого ручного списка** — манифест стал строгим
надмножеством прежнего: добавились ранее не кэшировавшиеся
`qr-start.html`, `hcp-badge-preview.html`, `css/tournament-*.css`,
`js/admin.js`, `js/start-admin.js`, `js/tournament-*.js`, `js/pe-edit.js`,
`js/qr-start.js` (все они подключаются тегами в HTML, но отсутствовали
в precache → офлайн-админка/турниры были частично сломаны).

Workflow: правишь js/css → запускаешь `npm run assets` (или просто
коммитишь — CI подскажет, если забыл: `npm test` включает проверку).
Ручной бамп `?v=N` и `CACHE_NAME` больше не существует.

## 8. Итерации 5–6: дробление `admin.js` — пять фичи-модулей

Начато дробление `admin.js` (п.3 ревью: «выделить фичи-модули: tournaments,
broadcasts, flights-groups (fg*), players, settings, social-cards»).
**8380 → 6781 строк (-1599, ~19%)**, извлечены полностью автономные блоки
(метод проверки: в блоке нет ни одного идентификатора, объявленного на
верхнем уровне остального admin.js, и нет load-time кода — только
runtime-глобалы фундаментов и guarded-вызовы):

| Новый файл | Строк | Содержимое |
|---|---|---|
| `js/admin-flights.js` | 491 | «Автоматическая разбивка на флайты»: модалка flight-gen-modal (`fg*`), предпросмотр с расстановкой, создание раундов |
| `js/admin-scoreedit.js` | 219 | «Редактор счёта всех раундов» (вкладка «Счёт ⛳», `se*`): поиск/фильтры, правка счёта любой лунки, черновик+сохранение |
| `js/admin-broadcasts.js` | 386 | «Push-анонсы и рассылки клуба»: выбор аудитории, отправка пуша, история анонсов (`bc*`, `pushAdmin*`) |
| `js/admin-channels.js` | 243 | Telegram/VK интеграции: бот-токены, чаты, тестовые алерты (`loadTelegramSettings`, `testVKAlert`, …) |
| `js/admin-alerts.js` | 289 | Панель «Вызовы судьи/маршала»: подписка на `/alerts`, дебонс-рендер (~300 мс), бейдж, ответ игроку |

- Внешние вызовы (`openAdminPanel`, `switchTab`, onclick-строки) —
  runtime-обращения к window-глобалам, порядок загрузки не критичен;
  в admin.html модули подключены рядом с `admin.js`. Метод отбора блоков:
  python-скрипт ищет секции, где (а) ни один идентификатор блока не
  объявлен на верхнем уровне остального admin.js (кроме глобальных
  состояния фичи, переезжающих вместе с блоком — напр. `knownAlertIds`),
  (б) нет load-time вызовов.
- Опыт: границу секции надо перепроверять по факту — в «ВЫЗОВЫ СУДЕЙ…»
  оказались затесавшиеся турнирные хелперы (`tnAutoDivisions` и др.) и
  экспорты CSV/JSON; извлекался только связный alerts-поддиапазон.
- `tools/test-scenario-club-broadcast.js` прогоняет функции блока анонсов →
  в его загрузчик добавлен `admin-broadcasts.js` (58/58 проверок проходят).
- Версии/манифест — автоматически через `npm run assets` (итерация 4):
  новые файлы получили `?v=<hash>` и попали в precache без ручных правок.

**Следующие кандидаты** (проверены на связность, но не извлечены):
«Группы сейчас играют / контроль темпа» (~200 строк, есть двусторонние
вызовы со списком раундов), «ТУРНИРЫ» (крупнейший, ~1700 строк — дробить
последним), telegram/vk-интеграции, social-cards.

## Файлы (новые / изменённые)

Новые: `js/safe-html.js`, `js/course-config.js`, `js/format.js`, `js/dom.js`,
`js/i18n.js` (+ ESM-копии в `src/`), `firebase.json`, `database.rules.json`,
`package.json`, `README.md`, `tools/run-tests.js`, `tools/syntax-check.js`,
`tools/rev-assets.js`, `tools/test-sw-precache.js`,
`.github/workflows/ci.yml`, `docs/SECURITY-RULES.md`,
`docs/IMPROVEMENTS-IMPL.md`.

Изменены: `js/utils.js` (удалены вынесенные блоки, добавлен дефолт
`onAuthReady`), `js/admin.js` (−1074 строки: извлечены flights/scoreedit/
broadcasts), `js/marker.js` (экранирование), `js/feed.js`, `js/stats.js`,
`js/start-admin.js` (экранирование, guard ссылок),
`js/{app,auth,guide,handicap,leaderboard,order-of-merit,players}.js`
(удалены дубли `onAuthReady`), 20+ HTML-файлов (теги скриптов + версии),
`sw.js` (генерируемый прекэш, CACHE_NAME от хеша), `tools/test-bootstrap.js`
и тесты (загрузка `dom.js`/`i18n.js`/`admin-broadcasts.js`), 13 тест-файлов
(явная загрузка модулей).
