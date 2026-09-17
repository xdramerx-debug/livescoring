# Переработка турниров — отчёт анализа и план

## [ОТЧЁТ АНАЛИЗА]

### Стек и ограничения

- **Клиент:** статические HTML-страницы, vanilla JavaScript ES5/IIFE и CSS. Сборщика нет.
- **Данные:** Firebase Realtime Database (`firebase-database-compat`), существующие записи уже используются страницами `tournaments.html`, `admin.html`, `leaderboard.html`, `setup-round.html` и `qr-start.html`.
- **Авторизация:** Firebase Auth плюс существующий admin access guard в `js/admin.js`.
- **Лайв:** подписки RTDB `on('value')`. Это уже двунаправленный realtime-канал проекта; отдельный Socket.IO/NestJS сервер не добавляется, чтобы не заводить вторую базу и не дублировать игроков, поле и раунды.
- **Экспорт:** браузерная печать в PDF, CSV/JSON; существующие генераторы печатных форм и QR-провайдеров переиспользуются.
- **Поле/игроки:** `settings/course`, `users`, `rounds` и `protocols` остаются источниками истины. Турнир хранит ссылку `courseRef: "settings/course"`, а не копию лунок, рейтингов и слоупов.

В исходном проекте уже есть доменный движок `js/tn-engine.js` (WHS, Stableford, флайты, расписание, countback, CSV и scorecard), 10-шаговый мастер `js/tn-wizard.js`, стартовый лист/QR `js/start-admin.js` + `js/qr-start.js`, регистрация/waitlist и live-лидерборд. Поэтому миграция расширяет, а не заменяет эти механизмы.

### Что переиспользуем

1. `TnEngine.Handicap`, `TnEngine.Scoring`, `TnEngine.TieBreak`, `TnEngine.Pairing`, `TnEngine.Leaderboard`, `TnEngine.Exporters`.
2. Нормализацию состава/дивизионов и обрезки из `js/utils.js` (`tnNormalizeDivisions`, `tnFindDivision`, `tnApplyHcpCut`).
3. `registeredPlayers` и `waitlist` для совместимости со старыми турнирами; новые заявки дополнительно индексируются в `applications`.
4. Протоколы `protocols/<id>` и раунды `rounds/<id>` для стартовых групп, tee times, QR и результатов.
5. Firebase Auth/admin access и существующие XSS-safe helpers (`escapeHtml`, `fmtDate`, `fmtExactHcp`).

### Что дорабатываем / создаём

- `js/tournament-core.js` — чистая доменная прослойка без DOM/Firebase: жизненный цикл, окно регистрации, валидация конфигурации, аудит, клонирование и сборка протокольных строк.
- `js/tournament-public.js` + `css/tournament-redesign.css` — публичный каталог с вкладками «Предстоящие / Регистрация открыта / Прошедшие», поиском, detail-view, заявкой, участниками, стартовым листом с QR, realtime-лидербордом и печатью/PDF.
- `js/tournament-admin.js` — управляющая вкладка мастера: редактирование опубликованного турнира всеми полями мастера, клонирование с/без состава, импорт Excel/CSV, клубный список, заявки, роли, жизненный цикл и журнал аудита.
- `tools/test-tournament-core.js` — unit-проверки критических переходов, окна регистрации, валидации, аудита, клонирования, обрезки/результатов и CSV.
- HTML/CSS/документация — без удаления legacy UI: классический режим остаётся fallback на время миграции.

### Риски и зависимости

- Firebase RTDB не является PostgreSQL и в репозитории нет ORM, мигратора или API-сервера. Перенос на PostgreSQL в рамках этой задачи создал бы второй источник истины и нарушил условие «использовать существующие данные». Поэтому SQL/RLS не добавляем: эквивалент RLS — Firebase Database Rules, которые должны быть опубликованы вместе с релизом (см. план ниже).
- Публичная заявка зависит от разрешений RTDB. UI повторно проверяет статус/лимиты, но окончательное ограничение записи должно быть enforced rules/Cloud Function.
- PDF в текущем static-hosting — печатная HTML-форма с системным «Сохранить как PDF». Сохранённый `protocol.pdfUrl`, если появится через Storage, показывается как прямой download; бинарный серверный PDF без backend не притворяется готовым.
- QR использует существующую цепочку внешних генераторов (`qrserver`/`quickchart`) и fallback `qr-start.html`; отсутствие сети не ломает данные, но может скрыть картинку до повтора.

## [ПЛАН МИГРАЦИЙ]

Миграции обратимые и не удаляют существующие узлы.

1. **Расширение схемы (backward compatible).** Публикация добавляет только поля к `tournaments/<id>`: `wizard`, `courseRef`, `lifecycleStatus`, `registration`, `protocol`, `roles`, `updatedAt`, `updatedBy`, `clonedFrom`. Legacy `name/date/formats/tees/status` сохраняются.
2. **Новые дочерние узлы.** Используются `tournaments/<id>/applications`, `.../audit`, `.../roles`, `.../protocol`; старые `waitlist`, `registeredPlayers`, `divisions` и корневой `protocols` не удаляются. Откат — удалить только новые узлы/поля последнего релиза.
3. **Нормализация статуса.** `lifecycleStatus` хранит `draft → registration → closed → active → completed/cancelled`; `status` остаётся legacy-совместимым (`upcoming/active/completed`) до полного перехода страниц. Откат — читать только `status`.
4. **Индексация заявок.** При новой заявке создаётся запись `applications/<id>` и совместимая запись `waitlist`; одобрение атомарным multi-location update переносит запись в `registeredPlayers`. Существующие составы не переписываются.
5. **Rules/RLS.** Опубликовать rules отдельно после ревью: public read только опубликованных турниров/course/публичных scores; authenticated create только собственную заявку; admin/назначенная роль — изменение конфигурации, состава, scores и audit; participant — только разрешённые score paths. До публикации rules UI не заявляет, что клиентская проверка заменяет серверную.
6. **Проверка и откат.** Перед релизом прогнать unit/integration/UI тесты, экспортировать JSON snapshot `tournaments`, `protocols`, `rounds`; при проблеме убрать feature flag `tournament_public_v2`/вернуться на `.tn-legacy-fallback` без потери данных.

## [ПЛАН РЕАЛИЗАЦИИ]

### Этап 1: домен и совместимая модель → `tournament-core.js`, тесты → DoD

- Lifecycle, registration window, validation, clone/diff/audit, protocol aggregation helpers.
- Unit-тесты без Firebase/DOM; 100% критических веток статусов и заявок.

### Этап 2: публичный каталог → `tournaments.html`, `tournament-public.js`, CSS → DoD

- Вкладки, поиск, карточки, detail-view, заявка/лимиты/waitlist, course reference.
- Realtime round subscription, participants, start list/QR, leaderboard, protocol PDF/CSV.
- Старые Firebase records отображаются без миграции.

### Этап 3: админский контур → `tournament-admin.js`, HTML → DoD

- Manage view, edit all wizard fields, status actions, audit, roles, applications, Excel/club/manual participant tools.
- Clone with/without participants; templates remain compatible with existing `tnTemplates`.
- Start list opens existing start-admin/QR flow; protocol opens existing finish protocol and new export actions.

### Этап 4: безопасность, regression и PR → docs/rules/test report → DoD

- Проверка XSS/CSV/Excel bounds, admin guard, no duplicated course/player records.
- Existing test suite plus new core tests; syntax check; local live preview.
- Commit per stage, push fixed branch `arena/01a0af17-livescoring`, open PR.

## [КОД]

Основные новые контракты:

```text
tournaments/<id>
  legacy: name, date, formats, tees, status
  lifecycleStatus, registration, wizard, courseRef
  registeredPlayers, waitlist, applications
  protocol, roles, audit
rounds/<id>                 # existing realtime score source
protocols/<id>              # existing start-sheet source
settings/course             # one canonical course, referenced by courseRef
```

Все пользовательские значения экранируются перед HTML, числа/даты нормализуются до записи, Excel ограничен по размеру и строкам, а административные записи проходят `hasAdminPanelAccess()`.

## [РЕЗЮМЕ ЭТАПА]

Анализ завершён: проект — Firebase static app, а не PostgreSQL/ORM-приложение; исходные турниры, поле, игроки, QR и scoring engine уже есть. Реализация следует поэтапно поверх этих источников истины и сохраняет legacy fallback.
