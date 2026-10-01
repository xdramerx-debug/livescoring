# Турниры v3 — простой флоу (страница `tn-admin.html`)

**Админ-панель → таб «Турниры 🏆» → `tn-admin.html`.** Единая точка турнирного
цикла: **создать турнир → добавить участников → старт (стартовый лист, QR) →
результаты → протокол с призёрами**. Всё лишнее из старой системы (10-шаговый
мастер, спонсоры и холь-спонсоры, промокоды, бюджеты, шаблоны, заявки/waitlist,
роли, аудит, «настройки поля») удалено — вместе с файлами
`js/tn-wizard.js`, `js/tn-engine.js`, `js/tn-studio.js`, `js/tournament-admin.js`,
`js/admin-tournaments.js` и стилями `css/tn-wizard.css`, `css/tournament-admin.css`.
Поле клуба остаётся статическим (`js/course-config.js`) — редактор поля через UI не нужен.

## Файлы

| Файл | Назначение |
|---|---|
| `tn-admin.html` | Страница админки: логин (тот же гейт, что у `admin.html`) + 5 шагов |
| `js/tn-admin.js` | UI-слой: рендер шагов, Firebase-запись, импорт, экспорт, публикация |
| `js/tn-admin-core.js` | **Чистая логика** (без DOM/Firebase, тесты в Node): конфиг, участники, импорт, места, дивизионы, номинации, CSV, печатный документ |
| `css/tn-admin.css` | Стили страницы в дизайн-системе админки |
| `tn-protocol.html` + `js/tn-protocol-public.js` | **Публичная страница протокола** (`?id=<tnId>`): призёры, зачёты, номинации, группы, печать/PDF, CSV, Excel |
| `tools/test-tn-admin.js` | 70 автотестов ядра (`node tools/test-tn-admin.js`) |
| `tools/test-tournament-integration.js` | Контрактная проверка связности страниц и удаления старой системы |

## Шаги

1. **Настройки** — название, дата, формат (Stroke Play / Stableford), основные
   места по Net или Gross, раздельный зачёт мужчин/женщин, число призовых мест
   (1–10, по умолчанию 3), дивизионы по гандикапу (диапазоны + пол).
   Турнир создаётся в `tournaments/<id>` с `source: 'tn-admin'` — этим маркером
   новая система отличается от старой.
2. **Участники** — три способа: вручную (ФИО + гандикап + пол + ти), из базы
   игроков клуба (`users`, подтягивается гандикап и пол), импорт Excel/CSV
   (колонки «ФИО · Гандикап · Пол · Ти», есть кнопка «Шаблон»). Игровой
   (field) гандикап считается автоматически по WHS (`getFieldHcp` из
   `js/utils.js`). Состав пишется в `registeredPlayers`.
3. **Старт** — переиспользуемый стартовый лист `js/start-admin.js` (группы, ТИ,
   время, стартовые лунки, маркеры, QR-карточки) и быстрый редактор
   `js/pe-edit.js`, смонтированные в хосты `#tab-start-content` и `#pe-editor`.
   Механика создания раундов (`rounds/<rid>`, `protocols/<pid>`) не менялась.
4. **Результаты** — два источника:
   - **Из раундов (live)** — таблица считается из `rounds/<rid>` той же
     математикой, что и публичная страница (`calcRoundStats`), обновляется
     автоматически;
   - **Вручную** — итог (Gross / очки Stableford) или по лункам (18 ячеек),
     статусы DQ/DNS. Net = Gross − игровой гандикап. Пишется в `results/<pid>`.
5. **Протокол** — сборка из выбранного источника: призёры (топ-N), абсолютный
   зачёт, зачёты мужчин/женщин, дивизионы, номинации (Best Gross / Best Net /
   Best Stableford, М/Ж отдельно, топ-N), разбивка по игровым группам
   стартового листа. Действия: **Опубликовать и завершить** (снимок в
   `tournaments/<id>/protocol`, статус `completed`), **Печать/PDF**,
   **CSV**, **Excel**, **Публичная ссылка** (`tn-protocol.html?id=…`).

Завершение: вручную кнопкой на шаге 5 или автоматически, когда все раунды
турнира закрыты (`pestovoAutoFinishTournament` из `js/utils.js` — общий механизм
со страницами скоринга).

## Модель данных

```
tournaments/<tnId>                    — создаётся новой системой
  name, date, description
  formats: ['Stroke Play (Net)']      — совместимо со скорингом и публичной страницей
  tees: ['wh','bl','rd']
  status: 'upcoming' → 'active' → 'completed'
  source: 'tn-admin'                  — маркер новой системы
  cfg: { scoring, netMode, genderSplit, divisions[], prizePlaces, … }
  divisions[]                         — совместимы с utils.tnNormalizeDivisions
  registeredPlayers/<pid>             — { name, handicap, gender, tee, status }
  results/<pid>                       — ручной ввод { mode, holes{}, gross, stableford, status }
  protocol                            — снимок для публичной страницы
      { version, published, rows[], scopes[], perGroup[], nominations[], prizePlaces }

rounds/<rid>, protocols/<pid>         — создаёт js/start-admin.js (как раньше)
```

## Совместимость и что произошло со старым

- Турниры новой системы создаются в том же узле `tournaments/` и с теми же
  ключевыми полями, поэтому живой скоринг (маркеры, QR, `live.js`, `solo.js`),
  табло и публичная страница `tournaments.html` работают без изменений.
- Старые турниры (мастер/студия, маркеры `fromWizard`/`fromStudio`/
  `wizardVersion`) остаются в базе, но скрыты из публичного списка
  (`js/tournaments.js`) и из выпадающего списка стартового листа
  (`js/start-admin.js`) — данные не удалены.
- Таб «Турниры 🏆» в `admin.html` теперь ведёт на `tn-admin.html`; старые имена
  вкладок (`tournaments`/`start`/`protocol`/`studio`) редиректят туда же
  (`switchTab` в `js/admin.js`).
- Протоколы, созданные старой системой (`js/protocol.js`), по-прежнему
  открываются с публичной страницы `tournaments.html`.

## Права

Доступ к странице — тот же гейт, что у админки: мастер-пароль через Cloud
Function `tournamentMasterSignIn` или Firebase-аккаунт с `role == admin`
(см. `docs/tournament-master-access.md`). Записи проверяются
`database.rules.json`: `tournaments/`, `rounds/`, `protocols/` пишут только
админы (или владелец записи), публичное чтение — по существующим правилам.
