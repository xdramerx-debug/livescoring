# Реализованные улучшения (по CODE-REVIEW.md)

Выполнены 4 задачи из отчёта `docs/CODE-REVIEW.md`. Ниже — что сделано,
ключевые файлы и важные оговорки.

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

## Файлы (новые / изменённые)

Новые: `js/safe-html.js`, `js/course-config.js`, `js/format.js`,
`firebase.json`, `database.rules.json`, `package.json`, `tools/run-tests.js`,
`tools/syntax-check.js`, `.github/workflows/ci.yml`, `docs/SECURITY-RULES.md`,
`docs/IMPROVEMENTS-IMPL.md`.

Изменены: `js/utils.js` (удалены вынесенные блоки), `js/marker.js` (экранирование),
20 HTML-файлов (теги скриптов), `sw.js` (прекэш новых модулей), 13 тест-файлов
(явная загрузка модулей).
